"""Focused positive/negative controls for versioned guards and mesh normals."""
from __future__ import annotations

import argparse
import ast
import copy
import inspect
import json
import os
from pathlib import Path
import sys
import tempfile
import textwrap

import numpy as np

import people_wear_body_guard as guard
import people_wear_body as body
import people_wear_shapes as shapes
from people_wear_build import source_recipes
from people_wear_shapes import Mesh, Patterns

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
ORIGINAL_BODY_SOURCE = inspect.getsource(body.current_body)


def expect_error(function, text):
    try:
        function()
    except RuntimeError as error:
        assert text in str(error), (text, str(error))
    else:
        raise AssertionError('Expected rejection: ' + text)


def legacy_mesh():
    mesh = Mesh(lambda point, part: [('hips', 1.)])
    for _ in range(693):
        mesh.vertex((0., 0., 0.), 'torso')
    mesh.far = [(0, 1, 2)] * 512
    mesh.far[185] = (210, 692, 686)
    mesh.p[210] = (.1, .2, .3)
    mesh.p[692] = (.12422742545604706, .17666151821613312, .29673879146575927)
    mesh.p[686] = (.09793703854084016, .19435266107320787, .2912598133087158)
    return mesh


def current_mesh():
    recipes = source_recipes()
    pd = next(p for p in recipes['PEOPLE'] if p['id'] == 'w_cocinera')
    P = recipes['proportions'](pd); bd = recipes['bone_defs'](P, pd, {})
    # Use the real authoring callback without importing or executing a build.
    tree = ast.parse((HERE/'people_wear_build.py').read_text())
    build = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'build_fit')
    callback = next(n for n in build.body if isinstance(n, ast.FunctionDef) and n.name == 'skin')
    env = {'P': P, 'recipes': recipes, 'bd': bd}
    exec(compile(ast.Module(body=[callback], type_ignores=[]), '<actual garment skin callback>', 'exec'), env)
    pattern = Patterns(pd, P, env['skin'], recipes['torso_ctrl'](pd, P))
    return pattern.bottom('trousers')


def legacy_topology():
    good = legacy_mesh(); before = len(good.p)
    assert guard.guard_cocinera(good, guard.LEGACY_BODY_VERSION) is good
    assert len(good.p) == before+1 and len(good.far) == 514
    changed = legacy_mesh(); changed.far.pop()
    expect_error(lambda: guard.legacy_cocinera_refinement(changed), 'hip panel changed')
    changed = legacy_mesh(); changed.p[211] = changed.p[210]; changed.far[185] = (211, 692, 686)
    expect_error(lambda: guard.legacy_cocinera_refinement(changed), 'hip panel changed')


def legacy_geometry():
    good = legacy_mesh(); triangle = [good.p[v] for v in good.far[185]]
    guard.legacy_cocinera_refinement(good)
    assert np.allclose(good.p[-1], np.mean(triangle, axis=0), rtol=0, atol=1e-15)
    changed = legacy_mesh(); p = changed.p[692]; changed.p[692] = (p[0]+.001, p[1], p[2])
    expect_error(lambda: guard.legacy_cocinera_refinement(changed), 'hip geometry changed')


def legacy_influences():
    good = legacy_mesh(); guard.legacy_cocinera_refinement(good)
    assert good.w[-1] == [('hips', 1.)]
    changed = legacy_mesh()
    changed.w[210] = [('hips', .5), ('spine', .5)]
    changed.w[692] = [('chest', .5), ('neck', .5)]
    changed.w[686] = [('head', 1.)]
    expect_error(lambda: guard.legacy_cocinera_refinement(changed), 'four skin influences')


def current_fingerprint():
    original = current_mesh()
    assert guard.mesh_fingerprint(original) == guard.CURRENT_COCINERA_MESH_SHA256
    assert guard.guard_cocinera(original, guard.CURRENT_BODY_VERSION) is original
    for stream in ('p', 'uv', 'c', 'tri', 'far', 'w'):
        changed = copy.deepcopy(original)
        if stream in ('tri', 'far'):
            row = getattr(changed, stream)[0]; getattr(changed, stream)[0] = (row[1], row[0], row[2])
        elif stream == 'w':
            row = list(changed.w[0]); row[0] = ('changed_joint', row[0][1]); changed.w[0] = row
        else:
            row = list(getattr(changed, stream)[0]); row[0] += .001; getattr(changed, stream)[0] = tuple(row)
        expect_error(lambda: guard.guard_cocinera(changed, guard.CURRENT_BODY_VERSION), 'whole-mesh fingerprint changed')


def source_text():
    mesh = current_mesh()
    scratch = ROOT/'la-ladera/.scratch'; scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='wear-guard-source-', dir=scratch) as directory:
        source = Path(directory)
        for newline in (b'\n', b'\r\n'):
            for name in guard.SOURCE_TEXT_LF_SHA256:
                data = (HERE/name).read_bytes().replace(b'\r\n', b'\n')
                (source/name).write_bytes(data.replace(b'\n', newline))
            assert guard.guard_cocinera(mesh, guard.CURRENT_BODY_VERSION, source) is mesh
        assert len(guard.SOURCE_TEXT_LF_SHA256) == 6
        for name in guard.SOURCE_TEXT_LF_SHA256:
            path = source/name; original = path.read_bytes()
            path.write_bytes(original+b'\r\n# changed protected source\r\n')
            expect_error(lambda: guard.guard_cocinera(mesh, guard.CURRENT_BODY_VERSION, source), 'source fingerprint changed: '+name)
            path.write_bytes(original)


def versions():
    mesh = current_mesh(); before = guard.mesh_fingerprint(mesh)
    assert guard.guard_cocinera(mesh, guard.CURRENT_BODY_VERSION) is mesh
    assert guard.mesh_fingerprint(mesh) == before
    expect_error(lambda: guard.guard_cocinera(mesh, 'unrecognized-current-body'), 'Unrecognized wearable body version')
    old = legacy_mesh(); guard.guard_cocinera(old, guard.LEGACY_BODY_VERSION)
    assert len(old.far) == 514


def normals():
    mesh = Mesh(lambda point, part: [('hips', 1.)])
    for p in ((0.,0.,0.), (1.,0.,0.), (0.,1.,0.), (0.,0.,1.), (1e-7,0.,1.), (0.,1e-7,1.)):
        mesh.vertex(p, 'torso')
    mesh.tri = [(0,1,2)]; mesh.far = [(3,4,5)]
    normal = mesh.normals()
    assert np.allclose(np.linalg.norm(normal, axis=1), 1., rtol=0, atol=1e-15), normal
    assert np.all(normal[:,2] > .999999999999)
    # Opposite real facets cancel as vectors; a real incident normal survives.
    mesh.tri = [(0,1,2), (0,2,1)]; mesh.far = []
    normal = mesh.normals()
    assert np.allclose(np.abs(normal[:3,2]), 1., rtol=0, atol=1e-15), normal
    # A referenced collinear-only vertex has no valid direction to normalize.
    mesh.p[2] = (2.,0.,0.); mesh.tri = [(0,1,2)]
    expect_error(mesh.normals, 'only degenerate incident facets')


def hip_source_rows():
    recipes = source_recipes()
    excluded = {'b_boy', 'g_girl', 'b_escolar', 'g_escolar', 't_boy', 't_girl', 'm_rapado'}
    eligible = [person for person in recipes['PEOPLE'] if person['id'] not in excluded]
    assert len(eligible) == 23
    for pd in eligible:
        P = recipes['proportions'](pd); H, k = P['H'], P['k']
        pattern = Patterns(pd, P, lambda point, part: [('hips', 1.)], recipes['torso_ctrl'](pd, P))
        bottom, waist = H*.429-.004*k, H*.6
        zs = sorted({bottom, waist, *[z for z in pattern.body_levels() if max(bottom, H*.449)<=z<waist]})
        # Independently recorded current-source stations. Neither legacy exact
        # height occurs, so the old filter retains just two endpoint rings.
        assert len(zs) == 8 and not any(abs(z-H*.466)<1e-7 or abs(z-H*.51)<1e-7 for z in zs)
        selected = shapes.native_hip_lod_rows(zs, P['hip'], k)
        assert selected == [0, 2, 3, 4, 7], (pd['id'], selected)
        assert zs[2] <= P['hip']-.055*k < zs[3] < P['hip'] < zs[4]


def hip_height_drift():
    # A different cubic sampling distribution makes fixed row indices and old
    # fractional heights wrong. Translation and body scaling preserve anatomy.
    original = [.70, .75, .81, .86, .89, .945, .989, 1.031, 1.08]
    for scale, shift in ((1., 0.), (.71, .013), (1.3, -.027)):
        zs = [z*scale+shift for z in original]
        assert shapes.native_hip_lod_rows(zs, .96*scale+shift, .8*scale) == [0, 4, 5, 6, 8]
    # An exact hip knot is shared by its lower/upper bracket and need not appear
    # twice. The blend boundary and both endpoint openings still survive.
    assert shapes.native_hip_lod_rows(original, .945, .8) == [0, 4, 5, 8]


def hip_endpoints():
    zs = [.70, .75, .81, .86, .89, .945, .989, 1.031, 1.08]
    selected = shapes.native_hip_lod_rows(zs, .96, .8)
    assert selected[0] == 0 and selected[-1] == len(zs)-1
    mesh = Mesh(lambda point, part: [('hips', 1.)])
    mesh.loft([shapes.ring(0., 0., z, .15, .12, 8) for z in zs], 'torso', lod_rows=selected, lod_angles=range(8))
    edges = {}
    for face in mesh.far:
        for a, b in zip(face, face[1:]+face[:1]):
            edge = tuple(sorted((a, b))); edges[edge] = edges.get(edge, 0)+1
    boundary = [edge for edge, count in edges.items() if count == 1]
    assert len(boundary) == 16
    assert sum(all(mesh.p[v][2] == zs[0] for v in edge) for edge in boundary) == 8
    assert sum(all(mesh.p[v][2] == zs[-1] for v in edge) for edge in boundary) == 8
    for heights, hip, k in (([.8, .7, 1.1], .96, .8), (zs, .6, .8), (zs, .96, 0.)):
        try:
            shapes.native_hip_lod_rows(heights, hip, k)
        except ValueError:
            pass
        else:
            raise AssertionError('Invalid native hip range was accepted')


def body_row_selection():
    zs = np.linspace(.6, 1.3, 25).tolist()
    ring = np.array([(1.,0.,0.), (0.,1.,0.), (-1.,0.,0.), (0.,-1.,0.)])
    rings = np.array([ring+[0.,0.,z] for z in zs])
    amplitudes = [12,1,11,2,10,3,9,4,8,5,7,6]
    for i, amplitude in zip(range(1,24,2), amplitudes):
        rings[i,:,0] += amplitude*.01
    before = rings.tobytes(); before_zs = list(zs)
    selected = body.far_torso_row_indices(zs, rings)
    # The eight largest real excursions, deliberately not a consecutive or
    # evenly spaced set. Every retained value refers to an actual source row.
    expected = sorted(set(range(0,25,2)) | {1,5,9,13,17,19,21,23})
    assert selected == expected, (selected, expected)
    assert rings.tobytes() == before and zs == before_zs
    assert all(type(i) is int and 0<=i<len(zs) for i in selected)


def body_pattern(pd, recipes):
    P = recipes['proportions'](pd); bd = recipes['bone_defs'](P, pd, {})
    skin = lambda co, part: recipes['weights_for'](co, part, bd)
    pattern = Patterns(pd, P, skin, recipes['torso_ctrl'](pd, P))
    pattern.body_skin = skin
    return pattern


def body_row_budget():
    recipes = source_recipes()
    excluded = {'b_boy', 'g_girl', 'b_escolar', 'g_escolar', 't_boy', 't_girl', 'm_rapado'}
    eligible = [person for person in recipes['PEOPLE'] if person['id'] not in excluded]
    assert len(eligible) == 23
    for pd in eligible:
        pattern = body_pattern(pd, recipes); zs = pattern.body_levels()
        rings = [pattern.body_ring(z,20) for z in zs]
        selected = body.far_torso_row_indices(zs,rings)
        assert selected[0] == 0 and selected[-1] == len(zs)-1
        # The final two source heights may differ below Float32 precision;
        # their identical source sections are welded, not counted twice.
        effective = {np.asarray(rings[i],dtype='<f4').tobytes() for i in selected}
        assert len(effective) == 20, (pd['id'], len(effective))
        mesh = body.current_body(pattern)
        assert len(mesh.tri) == 3516 and len(mesh.far) == 1372, (pd['id'],len(mesh.tri),len(mesh.far))
        assert len(mesh.far)*5 <= len(mesh.tri)*2


def body_row_invariance():
    # Reconstruct the previous *current-source* far sampling as a fresh control.
    # This is not an old-base asset or saved clearance result. The saved source
    # expression precedes any in-memory mutation applied by this test runner.
    anchor = 'zs = [zs[i] for i in far_torso_row_indices(zs, [pat.body_ring(z,n) for z in zs])]'
    assert ORIGINAL_BODY_SOURCE.count(anchor) == 1
    baseline_source = ORIGINAL_BODY_SOURCE.replace(anchor, 'zs = [z for i,z in enumerate(zs) if i%2==0 or i==len(zs)-1]')
    env = dict(body.__dict__)
    exec(compile(baseline_source, '<fresh uniform-far current-source body control>', 'exec'), env)
    reference = env['current_body']; recipes = source_recipes()
    for ident in ('w_vecina','m_don'):
        pd = next(person for person in recipes['PEOPLE'] if person['id'] == ident)
        original = reference(body_pattern(pd,recipes)); current = body.current_body(body_pattern(pd,recipes))
        original_normals, current_normals = original.normals(), current.normals()
        def same(old_faces,new_faces):
            assert len(old_faces) == len(new_faces)
            before = np.asarray(old_faces,dtype=np.int64).reshape(-1)
            after = np.asarray(new_faces,dtype=np.int64).reshape(-1)
            for field in ('p','uv','c'):
                assert np.asarray(getattr(original,field),dtype='<f8')[before].tobytes() == np.asarray(getattr(current,field),dtype='<f8')[after].tobytes(), (ident,field)
            assert original_normals[before].tobytes() == current_normals[after].tobytes()
            assert [original.w[v] for v in before] == [current.w[v] for v in after]
        same(original.tri,current.tri)
        for component in original.far_components:
            if component['name'] == 'torso':continue
            actual = next(part for part in current.far_components if part['name'] == component['name'])
            first,count = component['firstIndex']//3,component['indexCount']//3
            start,size = actual['firstIndex']//3,actual['indexCount']//3
            assert count == size
            same(original.far[first:first+count],current.far[start:start+size])


MUTANTS = {
    'legacy-topology': ('legacy_cocinera_refinement', 'if len(m.far)!=512 or tuple(triangle)!=(210,692,686):', 'if False:'),
    'legacy-geometry': ('legacy_cocinera_refinement', 'if not np.allclose(actual-actual[0],relative,rtol=0,atol=2e-7):', 'if False:'),
    'legacy-influences': ('legacy_cocinera_refinement', 'if len(weights)>4:', 'if False:'),
    'current-mesh': ('guard_cocinera', 'if actual != CURRENT_COCINERA_MESH_SHA256:', 'if False:'),
    'source-text': ('guard_cocinera', 'if actual != expected:', 'if False:'),
    'unknown-version': ('guard_cocinera', 'if body_version != CURRENT_BODY_VERSION:', 'if False:'),
    'normal-floor': ('normals', 'nn[nonzero]/=lengths[nonzero,None]', 'nn[nonzero]/=np.maximum(lengths[nonzero,None],1e-12)'),
    'normal-cancellation': ('normals', 'nn[vertex]=incident[strongest]/sizes[strongest]', 'nn[vertex]=0.'),
    'normal-degenerate': ('normals', "raise RuntimeError('Used garment vertex has only degenerate incident facets')", 'pass'),
    'hip-lower-blend': ('native_hip_lod_rows', 'return sorted({0,len(zs)-1,lower,below,above})', 'return sorted({0,len(zs)-1,below,above})'),
    'hip-below': ('native_hip_lod_rows', 'return sorted({0,len(zs)-1,lower,below,above})', 'return sorted({0,len(zs)-1,lower,above})'),
    'hip-above': ('native_hip_lod_rows', 'return sorted({0,len(zs)-1,lower,below,above})', 'return sorted({0,len(zs)-1,lower,below})'),
    'hip-fixed-rows': ('native_hip_lod_rows', 'return sorted({0,len(zs)-1,lower,below,above})', 'return [0,2,3,4,len(zs)-1]'),
    'hip-old-heights': ('native_hip_lod_rows', 'return sorted({0,len(zs)-1,lower,below,above})', 'return [i for i,z in enumerate(zs) if i in (0,len(zs)-1) or abs(z-hip/.51*.466)<1e-7 or abs(z-hip)<1e-7]'),
    'hip-endpoints': ('native_hip_lod_rows', 'return sorted({0,len(zs)-1,lower,below,above})', 'return sorted({lower,below,above})'),
    'body-uniform-rows': ('far_torso_row_indices', 'return sorted(kept+[i for _,i in ranked[:MAX_EXTRA_FAR_TORSO_ROWS]])', 'return kept'),
    'body-small-errors': ('far_torso_row_indices', 'ranked=sorted(errors,key=lambda row:(-row[0],row[1]))', 'ranked=sorted(errors,key=lambda row:(row[0],row[1]))'),
    'body-extra-row': ('far_torso_row_indices', 'ranked[:MAX_EXTRA_FAR_TORSO_ROWS]', 'ranked[:MAX_EXTRA_FAR_TORSO_ROWS+1]'),
    'body-endpoints': ('far_torso_row_indices', 'return sorted(kept+[i for _,i in ranked[:MAX_EXTRA_FAR_TORSO_ROWS]])', 'return sorted(kept+[i for _,i in ranked[:MAX_EXTRA_FAR_TORSO_ROWS]])[1:-1]'),
    'body-near-sampling': ('current_body', 'if lod:\n            zs = [zs[i] for i in far_torso_row_indices', 'if True:\n            zs = [zs[i] for i in far_torso_row_indices'),
    'body-native-limb': ('current_body', 'rr = [native_limbs._ring(sx, cy, z, rx, ry, 6 if lod else 12) for z, rx, ry, cy in profile]', 'rr = [native_limbs._ring(sx, cy, z, rx, ry, 8 if lod else 12) for z, rx, ry, cy in profile]'),
}


def apply_mutant(name):
    function, old, new = MUTANTS[name]
    original = Mesh.normals if function == 'normals' else shapes.native_hip_lod_rows if function == 'native_hip_lod_rows' else getattr(body,function) if function in ('far_torso_row_indices','current_body') else getattr(guard, function)
    source = textwrap.dedent(inspect.getsource(original))
    assert source.count(old) == 1, ('Mutation anchor drifted', name)
    env = dict(original.__globals__)
    exec(compile(source.replace(old, new), '<wear authoring mutation '+name+'>', 'exec'), env)
    if function == 'normals':
        Mesh.normals = env[function]
    elif function == 'native_hip_lod_rows':
        shapes.native_hip_lod_rows = env[function]
    elif function in ('far_torso_row_indices','current_body'):
        setattr(body,function,env[function])
    else:
        # Keep functions' module global references shared so dispatch sees the
        # deliberately changed legacy function and the real source/mesh pins.
        changed = env[function]
        changed.__globals__.update(guard.__dict__)
        setattr(guard, function, changed)
    print('WEAR_AUTHOR_MUTATION_APPLIED '+name, file=sys.stderr, flush=True)


CHECKS = {'legacy-topology': legacy_topology, 'legacy-geometry': legacy_geometry,
          'legacy-influences': legacy_influences, 'current-mesh': current_fingerprint,
          'source-text': source_text, 'versions': versions, 'normals': normals,
          'hip-source': hip_source_rows, 'hip-drift': hip_height_drift, 'hip-endpoints': hip_endpoints,
          'body-selection': body_row_selection, 'body-budget': body_row_budget, 'body-invariance': body_row_invariance}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', choices=CHECKS, required=True)
    parser.add_argument('--mutation', choices=MUTANTS)
    args = parser.parse_args()
    if args.mutation:
        apply_mutant(args.mutation)
    try:
        CHECKS[args.check]()
    except AssertionError:
        print(json.dumps({'check': args.check, 'mutation': args.mutation, 'pass': False, 'errorType': 'AssertionError'}), flush=True)
        raise
    print(json.dumps({'check': args.check, 'mutation': args.mutation, 'pass': True}))


if __name__ == '__main__':
    main()
