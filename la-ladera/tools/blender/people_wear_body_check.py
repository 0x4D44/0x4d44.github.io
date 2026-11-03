"""Independent checks for the regenerated native body adapter, not clearance.

The reference collector calls the protected current body recipes directly. It
does not call the adapter's collector, capper or component builder. Coordinates
and native surface triangles must survive; only closed caps may be added. The
separate Node release validator still owns posed garment/head clearance.
"""
from __future__ import annotations
import argparse
import ast
from collections import Counter
import copy
import gzip
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import struct
import tempfile
import types

import numpy as np
import people_body as source_body
import people_body_limbs as source_limbs
from people_cast import customize_cast

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
TEXT_SOURCES = ('people_body.py', 'people_body_limbs.py', 'people_tex.py',
                'people_head.py', 'people_build.py', 'people_cast.py')
ELIGIBLE = ('m_abuelo', 'm_afro', 'm_carnicero', 'm_don', 'm_elder', 'm_joven',
            'm_mecanico', 'm_mototaxi', 'm_obrero', 'm_panadero', 'm_tendero', 'm_vendedor',
            'w_afro', 'w_ama', 'w_beata', 'w_cocinera', 'w_elder', 'w_farmaceutica',
            'w_joven', 'w_maestra', 'w_peluquera', 'w_tendera', 'w_vecina')


def need(value, message):
    if not value:
        raise AssertionError(message)


def subject():
    """The mutation harness substitutes only reviewed in-memory adapter bytes."""
    path = HERE / 'people_wear_body.py'
    code = path.read_text().replace('\r\n', '\n')
    config_path = os.environ.get('LADERA_WEAR_MUTATION')
    if config_path:
        config = json.loads(Path(config_path).read_text())
        for index, change in enumerate(config['changes']):
            if Path(config['root'], change['path']).resolve() != path.resolve():
                continue
            need(code.count(change['from']) == 1, 'MUTATION_ANCHOR_MISMATCH: body adapter')
            code = code.replace(change['from'], change['to'])
            print(f"[wear-mutation-applied:{config['id']}:{index}]", file=sys.stderr)
    module = types.ModuleType('people_wear_body')
    module.__file__ = str(path)
    sys.modules['people_wear_body'] = module
    exec(compile(code, str(path), 'exec'), module.__dict__)
    return module


def recipes():
    tree = ast.parse((HERE / 'people_build.py').read_text())
    nodes = [node for node in tree.body if
             isinstance(node, ast.FunctionDef) and node.name in ('proportions', 'torso_ctrl', 'bone_defs', 'weights_for', 'seg_dist', 'clamp01') or
             isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('PEOPLE', 'BONES', 'ALLOWED') for t in node.targets)]
    env = {'math': math}
    exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])), '<protected source recipes>', 'exec'), env)
    env['PEOPLE'] = customize_cast(copy.deepcopy(env['PEOPLE']))
    return env


class ReferenceCollector:
    def __init__(self):
        self.points, self.polygons = [], []

    def V(self, point, part):
        self.points.append(tuple(float(v) for v in point))
        return len(self.points)-1

    def F(self, indices, colour, smooth=True, face=None, fab_=None, **unused):
        if fab_ == 'skin':
            self.polygons.append(tuple(indices))


def collect(function, *args):
    collector = ReferenceCollector()
    nail, ribbon = source_limbs._nail, source_limbs._ribbon
    source_limbs._nail = lambda *a, **k: None
    source_limbs._ribbon = lambda *a, **k: None
    try:
        function(collector, *args)
    finally:
        source_limbs._nail, source_limbs._ribbon = nail, ribbon
    return collector


def coord(point):
    return tuple(round(float(value), 10) for value in point)


def triangle_key(points):
    return tuple(sorted(coord(point) for point in points))


def native_check(body, pd, P):
    all_points = np.asarray(body.p)
    component_views = body.sourceProvenance['components']
    checks, triangles = 0, 0
    for lod in (0, 1):
        ix = np.asarray(body.far if lod else body.tri)
        references = []
        wrist = P['sh']-(.186+.146)*P['H']
        for sign in (-1, 1):
            side = '_l' if sign < 0 else '_r'
            references.append(('hand'+side, collect(source_limbs._hand, P, pd, sign*(P['shw']-.012), wrist, sign, bool(lod))))
            bare = dict(pd, bot_style='bare', legs=pd['skin_hex'])
            references.append(('leg'+side, collect(source_body._bare_leg, P, bare, sign, P['hip']-.01*P['k'], bool(lod))))
        references.append(('foot', collect(source_limbs.append_feet, P, dict(pd, shoe=('sandal', pd['skin_hex'], pd['skin_hex'])), bool(lod))))
        for prefix, reference in references:
            rows = [r for r in component_views if r['lod'] == lod and (r['name'] == prefix or r['name'].startswith(prefix+'_'))]
            need(rows, f'{pd["id"]}/{lod}/{prefix}: missing native component')
            actual = [tuple(face) for row in rows for face in ix[row['firstIndex']//3:(row['firstIndex']+row['indexCount'])//3]]
            actual_keys = Counter(triangle_key(all_points[list(face)]) for face in actual)
            expected_keys, native_points = Counter(), set()
            for polygon in reference.polygons:
                unique = list(dict.fromkeys(coord(reference.points[i]) for i in polygon))
                native_points.update(unique)
                for i in range(1, len(unique)-1):
                    a, b, c = np.asarray([unique[0], unique[i], unique[i+1]])
                    if np.linalg.norm(np.cross(b-a, c-a)) > 1e-13:
                        expected_keys[triangle_key([a, b, c])] += 1
            missing = expected_keys-actual_keys
            need(not missing, f'{pd["id"]}/{lod}/{prefix}: {sum(missing.values())} native surface triangles changed or missing')
            extra = actual_keys-expected_keys
            need(sum(extra.values()) == sum(r['addedCapTriangles'] for r in rows), f'{pd["id"]}/{lod}/{prefix}: additional faces are not exactly recorded caps')
            for points in extra:
                need(any(point not in native_points for point in points), f'{pd["id"]}/{lod}/{prefix}: unexpected native-vertex face replaces source surface')
            checks += 1
            triangles += sum(expected_keys.values())
    return dict(nativeComponentViews=checks, nativeTriangles=triangles)


def topology_check(body, ident):
    points = np.asarray(body.p, dtype=np.float32).astype(np.float64)
    need(np.isfinite(points).all(), ident+': non-finite body position')
    checked = 0
    for lod, faces, components in ((0, body.tri, body.components), (1, body.far, body.far_components)):
        cover = np.zeros(len(faces), dtype=np.int8)
        for part in components:
            first, count = part['firstIndex'], part['indexCount']
            need(first >= 0 and first % 3 == 0 and count >= 12 and count % 3 == 0 and first+count <= len(faces)*3, ident+': invalid body component range')
            cover[first//3:(first+count)//3] += 1
            edges, volume = Counter(), 0.
            for face in faces[first//3:(first+count)//3]:
                a, b, c = points[list(face)]
                need(np.linalg.norm(np.cross(b-a, c-a)) > 1e-12, ident+': degenerate Float32 body triangle')
                volume += float(np.dot(a, np.cross(b, c)))/6
                keys = [tuple(np.round(points[v], 7)) for v in face]
                for u, v in zip(keys, keys[1:]+keys[:1]):
                    need(u != v, ident+': collapsed Float32 body edge')
                    edges[(u, v)] += 1
            need(all(edges[(b, a)] == count == 1 for (a, b), count in edges.items()), ident+': open, reversed or nonmanifold Float32 body edge')
            need(volume > 1e-9, ident+': nonpositive or zero body volume')
            checked += 1
        need(np.all(cover == 1), ident+': component ranges omit or duplicate body triangles')
    return dict(closedComponentViews=checked)


def weights_check(body, calls, source, bones, ident):
    """Check every exported weight against the protected source recipe.

    The deliberately different garment callback makes an accidental fallback
    visible. Recorded inputs only supply each source part label; the expected
    weights are recomputed independently after construction at the original
    source inputs. Keep NumPy scalar types: on a symmetric cap a last-bit
    distance tie can legitimately select a different third source joint after
    conversion to Python scalars. Exported coordinates must still match exactly.
    """
    need(len(calls) == len(body.p) == len(body.w), ident+': body did not use its current-source weight callback for every vertex')
    need(body.sourceProvenance['skinWeights'] == 'people_build.py:weights_for', ident+': missing source skin-weight provenance')
    different, parts = 0, set()
    for point, actual, (called_point, part) in zip(body.p, body.w, calls):
        need(tuple(point) == tuple(called_point), ident+': skin recipe received another vertex')
        expected = source['weights_for'](called_point, part, bones)
        need(actual == expected, ident+': exported body weights differ from the protected current source')
        need(all(name in source['BONES'] and math.isfinite(weight) and weight > 0 for name, weight in actual), ident+': invalid source skin weights')
        need(abs(sum(weight for _, weight in actual)-1) < 1e-12, ident+': body skin weights are not normalized')
        different += actual != [('hips', 1.)]
        parts.add(part)
    need(different == len(body.p) and len(parts) >= 12, ident+': source weight coverage does not exercise the anatomy')
    return dict(weightedVertices=len(body.p), sourceParts=len(parts), distinctFromGarmentCallback=different)


def read_export_glb(path):
    """Independent container reader; never imports the authoring GLB writer."""
    shipped = Path(path).read_bytes()
    data = gzip.decompress(shipped) if shipped[:2] == b'\x1f\x8b' else shipped
    need(len(data) >= 28, str(path)+': GLB header is truncated')
    magic, version, size = struct.unpack_from('<III', data)
    need((magic, version, size) == (0x46546c67, 2, len(data)), str(path)+': invalid GLB header')
    cursor, document, binary = 12, None, None
    while cursor < len(data):
        need(cursor+8 <= len(data), str(path)+': truncated GLB chunk')
        length, kind = struct.unpack_from('<II', data, cursor); cursor += 8
        need(length % 4 == 0 and cursor+length <= len(data), str(path)+': invalid GLB chunk extent')
        if kind == 0x4e4f534a:
            need(document is None and binary is None, str(path)+': duplicate or reordered JSON chunk')
            document = json.loads(data[cursor:cursor+length])
        elif kind == 0x004e4942:
            need(document is not None and binary is None, str(path)+': duplicate or reordered BIN chunk')
            binary = data[cursor:cursor+length]
        else:
            raise AssertionError(str(path)+': unexpected GLB chunk')
        cursor += length
    need(document is not None and binary is not None, str(path)+': missing GLB chunks')
    need(len(document['buffers']) == 1 and 'uri' not in document['buffers'][0], str(path)+': nonembedded buffer')
    need(document['buffers'][0]['byteLength'] <= len(binary) <= document['buffers'][0]['byteLength']+3, str(path)+': BIN size mismatch')
    return document, binary, dict(bytes=len(shipped), sha256=hashlib.sha256(shipped).hexdigest())


def accessor_layout(document, binary, index):
    accessor = document['accessors'][index]
    need('sparse' not in accessor, 'body proof does not accept sparse accessors')
    view = document['bufferViews'][accessor['bufferView']]
    need(view.get('buffer', 0) == 0, 'body accessor uses another buffer')
    widths = {'SCALAR':1, 'VEC2':2, 'VEC3':3, 'VEC4':4, 'MAT4':16}
    formats = {5120:'b', 5121:'B', 5122:'h', 5123:'H', 5125:'I', 5126:'f'}
    fmt = '<'+formats[accessor['componentType']]*widths[accessor['type']]
    size = struct.calcsize(fmt); stride = view.get('byteStride', size)
    start = view.get('byteOffset', 0)+accessor.get('byteOffset', 0)
    count = accessor['count']; end = start+(count-1)*stride+size
    need(count > 0 and stride >= size and start >= view.get('byteOffset', 0), 'invalid body accessor layout')
    need(end <= view.get('byteOffset', 0)+view['byteLength'] <= len(binary), 'body accessor exceeds BIN data')
    return accessor, fmt, start, stride


def accessor_values(document, binary, index):
    accessor, fmt, start, stride = accessor_layout(document, binary, index)
    return [struct.unpack_from(fmt, binary, start+i*stride) for i in range(accessor['count'])]


def canonical_joint(name):
    stem, _, suffix = name.rpartition('_')
    return stem if suffix.isdigit() else name


def node_named(document, name):
    rows = [node for node in document['nodes'] if node.get('name') == name]
    need(len(rows) == 1, name+': missing or ambiguous node')
    return rows[0]


def oriented_triangle(corners):
    # Accept face order and vertex welding differences, but retain winding.
    return min(tuple(corners), tuple(corners[1:]+corners[:1]), tuple(corners[2:]+corners[:2]))


def corrupt_export_fixture(document, binary, ident):
    """Mutation-only copy of real exported bytes; no artifact is rewritten."""
    config_path = os.environ.get('LADERA_WEAR_MUTATION')
    if not config_path:
        return binary
    config = json.loads(Path(config_path).read_text())
    for index, change in enumerate(config['changes']):
        if change.get('kind') != 'body-position-fixture' or change['fit'] != ident:
            continue
        node = node_named(document, 'wear_body_'+ident)
        primitive = document['meshes'][node['mesh']]['primitives'][0]
        vertex = accessor_values(document, binary, primitive['indices'])[0][0]
        accessor, _, start, stride = accessor_layout(document, binary, primitive['attributes']['POSITION'])
        need(accessor['componentType'] == 5126 and accessor['type'] == 'VEC3', 'MUTATION_ANCHOR_MISMATCH: body position format')
        offset = start+vertex*stride+change['axis']*4
        changed = bytearray(binary)
        original = struct.unpack_from('<f', changed, offset)[0]
        struct.pack_into('<f', changed, offset, original+change['delta'])
        need(changed != binary, 'MUTATION_ANCHOR_MISMATCH: body fixture change was lost')
        binary = bytes(changed)
        print(f"[wear-mutation-applied:{config['id']}:{index}]", file=sys.stderr)
    return binary


def exported_check(body, pd, P, source_document, metadata):
    ident = pd['id']; fit = metadata['fits'][ident]
    path = (ROOT/'assets/models'/fit['file']).resolve()
    need(path.is_relative_to((ROOT/'assets/models/wear').resolve()), ident+': exported body file escaped the wearable library')
    document, binary, shipped = read_export_glb(path)
    binary = corrupt_export_fixture(document, binary, ident)
    source_node = node_named(source_document, 'person_'+ident+'_mesh')
    source_skin = source_document['skins'][source_node['skin']]
    source_joints = [canonical_joint(source_document['nodes'][j]['name']) for j in source_skin['joints']]
    source_hips = source_document['nodes'][source_skin['joints'][source_joints.index('hips')]]
    bottom = P['hip']-.04-source_hips.get('translation', [0,0,0])[1]

    expected_corners = []
    for (x, y, z), weights in zip(body.p, body.w):
        position = struct.unpack('<3f', struct.pack('<3f', x, z-bottom, -y))
        ordered = sorted(weights, key=lambda row:-row[1])[:4]
        total = sum(weight for _, weight in ordered)
        amounts = [int(round((weight/total)*255)) for _, weight in ordered]
        amounts[0] += 255-sum(amounts)
        influence = tuple(sorted((name, amount) for (name, _), amount in zip(ordered, amounts) if amount))
        expected_corners.append((position, influence))

    totals = []
    for lod, faces in ((0, body.tri), (1, body.far)):
        name = 'wear_body_'+ident+('_lod' if lod else '')
        node = node_named(document, name)
        primitives = document['meshes'][node['mesh']]['primitives']
        need(len(primitives) == 1 and primitives[0].get('mode', 4) == 4, name+': body must be one triangle primitive')
        primitive = primitives[0]; attributes = primitive['attributes']
        positions = accessor_values(document, binary, attributes['POSITION'])
        joints = accessor_values(document, binary, attributes['JOINTS_0'])
        weights = accessor_values(document, binary, attributes['WEIGHTS_0'])
        need(len(positions) == len(joints) == len(weights), name+': mismatched body attributes')
        for attr, ctype, typ, normalized in [('POSITION',5126,'VEC3',False), ('JOINTS_0',5121,'VEC4',False), ('WEIGHTS_0',5121,'VEC4',True)]:
            actual = document['accessors'][attributes[attr]]
            need((actual['componentType'], actual['type'], actual.get('normalized', False)) == (ctype,typ,normalized), name+': changed uploaded '+attr+' encoding')
        joint_names = [canonical_joint(document['nodes'][j]['name']) for j in document['skins'][node['skin']]['joints']]
        need(joint_names == source_joints, name+': body joint ABI differs from current source')
        actual_corners = []
        for position, indices, amounts in zip(positions, joints, weights):
            need(all(math.isfinite(value) for value in position) and sum(amounts) == 255, name+': invalid body position or u8 weight mass')
            need(all(index < len(joint_names) for index in indices), name+': body refers to a foreign joint')
            influence = tuple(sorted((joint_names[index], amount) for index, amount in zip(indices, amounts) if amount))
            actual_corners.append((position, influence))
        indices = [row[0] for row in accessor_values(document, binary, primitive['indices'])]
        need(len(indices) == 3*len(faces) and max(indices) < len(actual_corners), name+': body triangle coverage changed')
        actual = Counter(oriented_triangle([actual_corners[v] for v in indices[i:i+3]]) for i in range(0,len(indices),3))
        expected = Counter(oriented_triangle([expected_corners[v] for v in face]) for face in faces)
        need(actual == expected, name+': exported Float32 positions, u8 skin influences or oriented triangle corners differ from the current native body')
        totals.append(len(faces))
    return dict(file=str(path.relative_to(ROOT)), **shipped, nearTriangles=totals[0], farTriangles=totals[1],
                triangleCorners=3*sum(totals), lods=2, positionsExact=True, weightsU8Exact=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', choices=['sources', 'native', 'topology', 'lod', 'lf', 'weights', 'exported'], required=True)
    args = parser.parse_args()
    try:
        if os.getpriority(os.PRIO_PROCESS, 0) < 19:
            os.setpriority(os.PRIO_PROCESS, 0, 19)
    except (AttributeError, PermissionError):
        pass
    adapter = subject()
    if args.check == 'lf':
        with tempfile.TemporaryDirectory(prefix='wear-body-lf-') as directory:
            a, b = Path(directory)/'lf.py', Path(directory)/'crlf.py'
            a.write_bytes(b'first\nsecond\n'); b.write_bytes(b'first\r\nsecond\r\n')
            expected = hashlib.sha256(a.read_bytes()).hexdigest()
            need(adapter.source_sha(a) == adapter.source_sha(b) == expected, 'source text hash must normalize LF and CRLF to the same LF bytes')
        print(json.dumps(dict(ok=True, check=args.check, comparisons=2)))
        return
    from people_wear_shapes import Patterns
    source = recipes()
    by_id = {p['id']: p for p in source['PEOPLE']}
    meta = json.loads((ROOT/'assets/models/people/people_meta.json').read_text())
    adults = sorted(p['id'] for p in meta['people'] if not set(p['tags']) & {'kid','teen','boy','girl'} and set(p['tags']) & {'adult','elder'})
    need(adults == list(ELIGIBLE), 'source body scope must remain the exact 23 adult/elder residents')
    source_hashes = {name: hashlib.sha256((HERE/name).read_bytes().replace(b'\r\n',b'\n')).hexdigest() for name in TEXT_SOURCES}
    if args.check == 'exported':
        metadata = json.loads((ROOT/'assets/models/wear/metadata.json').read_text())
        need(sorted(metadata['fits']) == list(ELIGIBLE), 'exported body proof requires every one of the 23 eligible fits')
        source_document, _, source_shipped = read_export_glb(ROOT/'assets/models/people/people.glb')
        need(metadata['sourcePeopleSha256'] == source_shipped['sha256'], 'exported bodies do not pin the current source GLB')
    results = []
    for ident in ELIGIBLE:
        pd = by_id[ident]; P = source['proportions'](pd)
        pattern = Patterns(pd, P, lambda point, part: [('hips',1.)], source['torso_ctrl'](pd,P))
        bones = source['bone_defs'](P, pd, {})
        calls = []
        def body_skin(point, part):
            calls.append((copy.deepcopy(point), part))
            return source['weights_for'](point, part, bones)
        pattern.body_skin = body_skin
        body = adapter.current_body(pattern)
        if args.check == 'sources':
            need(body.sourceProvenance['sourceTextLfSha256'] == source_hashes, ident+': current native source fingerprints are stale, omitted or not LF-normalized')
            result = dict(sourcePins=len(source_hashes))
        elif args.check == 'native':
            result = native_check(body,pd,P)
        elif args.check == 'topology':
            result = topology_check(body,ident)
        elif args.check == 'weights':
            result = weights_check(body,calls,source,bones,ident)
        elif args.check == 'exported':
            weights_check(body,calls,source,bones,ident)
            result = exported_check(body,pd,P,source_document,metadata)
        else:
            need(len(body.far) <= len(body.tri)*.4, ident+': far body exceeds 40% of its near triangles')
            result = dict(nearTriangles=len(body.tri),farTriangles=len(body.far),ratio=len(body.far)/len(body.tri))
        results.append(dict(id=ident,**result))
    print(json.dumps(dict(ok=True,check=args.check,fits=len(results),eligible=list(ELIGIBLE),sourceForm='LF',results=results)))


if __name__ == '__main__':
    main()
