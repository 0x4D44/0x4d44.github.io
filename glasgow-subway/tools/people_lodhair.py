#!/usr/bin/env python3
"""people_lodhair.py - give the LOD people (models/people_lod.glb) back the hair and eyebrows the LOD decimation destroyed.

Why: tools/assets_people_mpfb.py decimates every part of every person for the LOD file (the people the crowd draws beyond ~11 m, and all but the nearest few
besides). Most hair survives that - a bob or a long fall is a closed bulky shell. Two things do not:
  * the "ponytail01" hair (girl, girl_school_kilt, teen_girl, woman_puffer) is a thin OPEN shell: the decimator collapsed it to a few big wedge-shaped
    triangles (1032 -> 418), and the cap that covers the scalp is gone. The LOD girl is a bald head with a ponytail hanging off the back of it;
  * the eyebrows of everybody (124 vertices and ~190 triangles each in the full file) are cut to ~60 vertices and become heavy black wedges that sit on the
    eyes. (Seen on a contact sheet of the people as the game draws them - tools/people_view.html - not by any of the skin or motion measures.)

What it does (numpy only): for each part and person in the lists below, copy the part's primitive from models/people.glb - the intact, full-detail one - into
the same person's primitive in models/people_lod.glb, as new vertex/index data appended to the file (the LOD part's own accessors are left unreferenced).
The two files share the skeleton (the same 53 joints in the same order), the vertex formats and the materials (same texture, same colour), so nothing else
about the person changes. The new vertices are moved a little way out along their own normals (`--hair-lift`, `--brow-lift`): the LOD head is a decimated one and
stands a little proud of the full head, so the full-detail hair and brows would otherwise be partly buried in it. How far is not the same for the two parts, nor
equally well known:
  * hair 6 mm - chosen BY EYE on close-ups of the heads (tools/people_view.html): at 0 the scalp shows through the cap in patches, 3 mm leaves a few specks, 6 mm is clean.
    The tools/people_hair.mjs measures do not resolve specks; they only say that the new hair covers 1.10 to 1.12 times the area of the full file's (3 mm: 1.04 to 1.06,
    9 mm: 1.16 to 1.18) - inside the 1.06 to 1.27 of the 26 people whose decimated hair is still a shell;
  * brows 1 mm - chosen by MEASURE. The brows are thin strips whose normals are not all square to the face, so lifting them inflates them, and the decimated skin buries
    them where it is proud, so a single lift cannot suit every head. tools/people_hair.mjs counts the pixels the brows change on the face (3 close views) and compares the
    LOD with the full file. Summed over the roster the LOD shows 4.9 times the full file's brow area before the repair, and after it: 0.85 at 0 mm, 1.01 at 0.5, 1.15 at 1,
    1.30 at 1.5, 1.46 at 2, 1.77 at 3 mm. Per person (28 with a visible brow) the mean |ln ratio| is 0.59 / 0.53 / 0.56 / 0.62 / 0.68 / 0.80 for 0 / 0.5 / 1 / 1.5 / 2 / 3 mm;
    people under half their full-file brow 8 / 5 / 4 / 3 / 3 / 2; over twice 0 / 0 / 0 / 0 / 5 / 11. That rules out 2 and 3 mm (swollen) and 0 (buried), but cannot choose
    among 0.5, 1 and 1.5 mm: 1 mm has the lowest error of the three, so it is a pick within a flat region, not an optimum.
    Two people (woman_midi, woman_dress) show no brow at all at any lift: the decimated hair's bulkier fringe covers it, and that is not something a lift can mend.
The person's mesh node gets `extras.lodparts` so a second run leaves it alone and `--check` can tell.

WHO gets the hair is decided by RECIPE_HAIR, from tools/people_hair.mjs: it renders only the hair of every person, full and LOD, from eight sides and from
above, and compares the covered area. A decimated hair that is still a shell covers MORE than the original (the triangles are bigger and the shell is thicker:
1.06 to 1.27 for 26 of the 30 people); the four ponytail people cover 0.79 to 0.84 - the cap is missing, and what is left is the tail. Every person gets the
brows (the LOD brows covered 2.4 to 45 times the area of the full ones, median 6).

    python3 tools/people_lodhair.py --check          # report only; exit 1 if a listed person has not been repaired yet
    python3 tools/people_lodhair.py --write          # repair models/people_lod.glb in place
    python3 tools/people_lodhair.py --write --hair-lift 0.002 --out /tmp/x.glb     # an experiment: lift the new hair 2 mm off the head, write elsewhere
    python3 tools/people_lodhair.py --lod original_lod.glb --write --out models/people_lod.glb   # rebuild the committed file from an unrepaired export (byte-deterministic)

Run it AFTER the pipeline (and before or after tools/people_skinfit.py - they touch different primitives). js/sim/sim.test.mjs checks the committed file.
"""
import argparse, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from people_skinfit import Glb, CT, NC   # the minimal GLB reader/writer the skin repair uses

MODELS = os.path.join(HERE, '..', 'models')
RECIPE_HAIR = ('girl', 'girl_school_kilt', 'teen_girl', 'woman_puffer')   # the ponytail people; see the docstring
# part name -> (material name prefix, who: a tuple of person ids or None for everybody who has the part, default lift in metres)
PARTS = {
    'hair': ('alpha_hair', RECIPE_HAIR, 0.006),
    'brows': ('alpha_brows', None, 0.001),
}
MARK = 'lodparts'
ATTRS = ('POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0')
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


def raw_accessor(g, i):
    """-> (the accessor's JSON, an (n, element bytes) uint8 array of its data, de-strided, exactly as stored)"""
    a = g.j['accessors'][i]; bv = g.j['bufferViews'][a['bufferView']]
    es = np.dtype(CT[a['componentType']]).itemsize * NC[a['type']]; n = a['count']
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride') or es
    buf = np.frombuffer(g.bin, np.uint8, count=stride * (n - 1) + es, offset=base)
    return a, np.lib.stride_tricks.as_strided(buf, shape=(n, es), strides=(stride, 1)).copy()


def append_accessor(g, src_acc, rows, target, attribute):
    """append `rows` (n, element bytes) to the file's binary chunk as a new buffer view + accessor shaped like src_acc; -> the new accessor's index"""
    n, es = rows.shape
    stride = -(-es // 4) * 4 if attribute else es            # vertex attributes: element stride is a multiple of 4
    data = np.zeros((n, stride), np.uint8); data[:, :es] = rows
    g.bin += b'\0' * (-len(g.bin) % 4)
    bv = {'buffer': 0, 'byteOffset': len(g.bin), 'byteLength': n * stride, 'target': target}
    if attribute: bv['byteStride'] = stride
    g.bin += data.tobytes()
    g.j['buffers'][0]['byteLength'] = len(g.bin)
    g.j['bufferViews'].append(bv)
    acc = {k: v for k, v in src_acc.items() if k not in ('bufferView', 'byteOffset')}; acc['bufferView'] = len(g.j['bufferViews']) - 1
    g.j['accessors'].append(acc)
    return len(g.j['accessors']) - 1


def part_prim(g, pid, prefix):
    """-> the person's primitive whose material name starts with `prefix`, or None"""
    node = g.node_of(pid)
    prims = [p for p in g.j['meshes'][node['mesh']]['primitives'] if (g.j['materials'][p['material']].get('name') or '').startswith(prefix)]
    assert len(prims) <= 1, f'{pid}: {len(prims)} primitives named {prefix}*'
    return prims[0] if prims else None


def check_compatible(src, dst, pid, sp, dp):
    sj = [src.j['nodes'][i]['name'] for i in src.j['skins'][src.node_of(pid)['skin']]['joints']]
    dj = [dst.j['nodes'][i]['name'] for i in dst.j['skins'][dst.node_of(pid)['skin']]['joints']]
    assert sj == dj, f'{pid}: the two files do not share a skeleton'
    assert set(sp['attributes']) == set(dp['attributes']) == set(ATTRS), f"{pid}: vertex attributes differ: {sorted(sp['attributes'])} vs {sorted(dp['attributes'])}"
    sm, dm = src.j['materials'][sp['material']], dst.j['materials'][dp['material']]
    assert sm['name'] == dm['name'] and sm['pbrMetallicRoughness'].get('baseColorFactor') == dm['pbrMetallicRoughness'].get('baseColorFactor'), f'{pid}: the materials differ'
    for k in ATTRS:   # same formats, so the data can be copied byte for byte
        sa, da = src.j['accessors'][sp['attributes'][k]], dst.j['accessors'][dp['attributes'][k]]
        assert (sa['componentType'], sa['type'], sa.get('normalized', False)) == (da['componentType'], da['type'], da.get('normalized', False)), f'{pid}: {k} formats differ'


def transplant(src, dst, pid, part, lift):
    """copy `part` of `pid` from src into dst, `lift` metres out along its normals; -> (triangles before, triangles after)"""
    prefix = PARTS[part][0]
    sp, dp = part_prim(src, pid, prefix), part_prim(dst, pid, prefix)
    assert sp is not None and dp is not None, f'{pid}: no {part} primitive in both files'
    check_compatible(src, dst, pid, sp, dp)
    new = {}
    for k in ATTRS:
        a, rows = raw_accessor(src, sp['attributes'][k])
        if k == 'POSITION':
            P = rows.view(np.float32).reshape(-1, 3).astype(np.float64)
            if lift:
                _, nr = raw_accessor(src, sp['attributes']['NORMAL']); N = nr[:, :3].view(np.int8).astype(np.float64) / 127.0
                N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9); P = P + lift * N
            rows = np.frombuffer(P.astype(np.float32).tobytes(), np.uint8).reshape(-1, 12)
            a = dict(a); a['min'] = [float(x) for x in P.min(0)]; a['max'] = [float(x) for x in P.max(0)]
        new[k] = append_accessor(dst, a, rows, ARRAY_BUFFER, True)
    ia, irows = raw_accessor(src, sp['indices'])
    new_idx = append_accessor(dst, ia, irows, ELEMENT_ARRAY_BUFFER, False)
    was = dst.j['accessors'][dp['indices']]['count'] // 3
    dp['attributes'] = new; dp['indices'] = new_idx
    dst.node_of(pid).setdefault('extras', {}).setdefault(MARK, {})[part] = {'v': 1, 'from': 'people.glb', 'tris': ia['count'] // 3, 'was': was, 'lift': lift}
    return was, ia['count'] // 3


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--main', default=os.path.join(MODELS, 'people.glb'), help='the full-detail people (where the parts come from)')
    ap.add_argument('--lod', default=os.path.join(MODELS, 'people_lod.glb'), help='the LOD people (what is repaired)')
    ap.add_argument('--write', action='store_true', help='rewrite the LOD file in place (or at --out)')
    ap.add_argument('--check', action='store_true', help='report only; exit 1 if a listed person has not been repaired yet')
    ap.add_argument('--only', default='', help='comma list of person ids')
    ap.add_argument('--parts', default=','.join(PARTS), help='comma list of parts (%s)' % ', '.join(PARTS))
    ap.add_argument('--all', action='store_true', help='give every person every part, not just the people in the lists (an experiment)')
    ap.add_argument('--hair-lift', type=float, default=PARTS['hair'][2], help='lift the new hair this far off the head along its normals, metres (default %g)' % PARTS['hair'][2])
    ap.add_argument('--brow-lift', type=float, default=PARTS['brows'][2], help='the same for the eyebrows (default %g)' % PARTS['brows'][2])
    ap.add_argument('--force', action='store_true', help='repair people already marked as repaired (the part is copied afresh)')
    ap.add_argument('--out', default='', help='with --write: write there instead of in place')
    a = ap.parse_args()
    lifts = {'hair': a.hair_lift, 'brows': a.brow_lift}
    src, dst = Glb(a.main), Glb(a.lod)
    only = [s for s in a.only.split(',') if s]
    missing = 0
    for part in [s for s in a.parts.split(',') if s]:
        prefix, who, _ = PARTS[part]
        ids = only or (dst.person_ids() if (a.all or who is None) else list(who))
        for pid in ids:
            if part_prim(dst, pid, prefix) is None or part_prim(src, pid, prefix) is None:
                print(f'{pid:18s} {part:6s} (no {part} in one of the files - skipped)'); continue
            mark = ((dst.node_of(pid).get('extras') or {}).get(MARK) or {}).get(part)
            if a.check:
                print(f"{pid:18s} {part:6s} {'repaired (%d -> %d tris)' % (mark['was'], mark['tris']) if mark else 'NOT repaired'}"); missing += 0 if mark else 1; continue
            if mark and not a.force:
                print(f'{pid:18s} {part:6s} already repaired ({mark["was"]} -> {mark["tris"]} tris) - left alone'); continue
            was, now = transplant(src, dst, pid, part, lifts[part])
            print(f'{pid:18s} {part:6s} {was} -> {now} tris (lifted {lifts[part] * 1000:g} mm)')
    if a.check: sys.exit(1 if missing else 0)
    if a.write:
        out = a.out or a.lod; dst.save(out); print('wrote', out, '(%.2f MB)' % (os.path.getsize(out) / 1e6))
    else: print('(dry run: nothing written; pass --write)')


if __name__ == '__main__':
    main()
