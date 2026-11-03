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
from people_wear_build import source_recipes
from people_wear_shapes import Mesh, Patterns

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent


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
}


def apply_mutant(name):
    function, old, new = MUTANTS[name]
    original = Mesh.normals if function == 'normals' else getattr(guard, function)
    source = textwrap.dedent(inspect.getsource(original))
    assert source.count(old) == 1, ('Mutation anchor drifted', name)
    env = dict(original.__globals__)
    exec(compile(source.replace(old, new), '<wear authoring mutation '+name+'>', 'exec'), env)
    if function == 'normals':
        Mesh.normals = env[function]
    else:
        # Keep functions' module global references shared so dispatch sees the
        # deliberately changed legacy function and the real source/mesh pins.
        changed = env[function]
        changed.__globals__.update(guard.__dict__)
        setattr(guard, function, changed)
    print('WEAR_AUTHOR_MUTATION_APPLIED '+name, file=sys.stderr, flush=True)


CHECKS = {'legacy-topology': legacy_topology, 'legacy-geometry': legacy_geometry,
          'legacy-influences': legacy_influences, 'current-mesh': current_fingerprint,
          'source-text': source_text, 'versions': versions, 'normals': normals}


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
