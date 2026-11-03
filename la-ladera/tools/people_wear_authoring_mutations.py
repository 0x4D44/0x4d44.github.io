#!/usr/bin/env python3
"""Independently mutate every LOD and alternate-face authoring test.

Run with Node 22.16 and the repository's low-priority wrapper:
  node la-ladera/tools/nice.mjs --idle python3 la-ladera/tools/people_wear_authoring_mutations.py --node /path/to/node22

Production sources and tests are never edited. Each mutant is imported from a
private copy, records that it actually executed, and must fail its exact named
TAP test. A crash, missing runtime, empty child output or unapplied patch is not a
killed mutant. Source pins use the LF text form, independent of CRLF checkouts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time


ROOT = Path(__file__).resolve().parents[2]
LADERA = ROOT / 'la-ladera'
LOD_TESTS = [
    'wear LOD retains two closed surfaces, existing endpoints and both triangle budgets',
    'wear LOD collapses both UV seam copies together and preserves the two cylinder openings',
    'wear LOD refuses an impossible budget without deleting a component or changing the input',
    'wear LOD rejects a non-manifold source before mutating any mesh data',
]
FACE_TESTS = [
    'face branch search clears a blocked seam without changing topology, skinning or its welded copies',
    'face branch search refuses an exit outside the original 80 mm sphere',
    'face branch search preserves the orientation of neighboring near and far triangles',
    'face branch search keeps the actual rest body clear when its obstruction differs from the posed body',
    'face branch search never exchanges an old failed probe for a newly obstructed neighbor',
    'expanded static face authoring covers all 23 catalog designs including shoes and the three hats',
    'face branch search resolves a narrow padded corridor between raw grid stations',
]
SUITES = {
    'lod': ('tools/blender/people_wear_lod.py', 'tests/people-wear-lod.test.mjs', 'PEOPLE_WEAR_LOD_TEST_MODULE', LOD_TESTS),
    'faces': ('tools/blender/people_wear_fit_faces.mjs', 'tests/people-wear-face-branch.test.mjs', 'PEOPLE_WEAR_FACE_TEST_MODULE', FACE_TESTS),
}
CASES = [
    ('lod', 'cap_600', 0, 'target = min(600, (2 * len(mesh.tri)) // 5)', 'target = min(6000, (2 * len(mesh.tri)) // 5)'),
    ('lod', 'ratio_40_percent', 1, 'target = min(600, (2 * len(mesh.tri)) // 5)', 'target = min(600, len(mesh.tri))'),
    ('lod', 'source_endpoint_mutation', 0, '    mesh.far = result\n', '    mesh.p[0] = (999., 999., 999.)\n    mesh.far = result\n'),
    ('lod', 'drop_face_hole', 0, '    mesh.far = result\n', '    mesh.far = result[1:]\n'),
    ('lod', 'seam_station_lock', 1, 'if not keep or not remove or len(remove) > len(keep):', 'if not keep or not remove or len(remove) > len(keep) or len(remove) > 1:'),
    ('lod', 'accept_impossible_budget', 2, '    if len(result) > target:\n', '    if False:\n'),
    ('lod', 'accept_nonmanifold_source', 3, "        raise ValueError('non-manifold garment far edge')", '        return []'),
    ('faces', 'split_welded_face_seam', 0, 'for (const v of members) a.POSITION.set(best.candidate, v * 3);', 'a.POSITION.set(best.candidate, representative * 3);'),
    ('faces', 'discard_face_padding', 0, 'if (distance2 < PAD * PAD && surface.nearest(point, part).distance < PAD) return false;', 'if (false) return false;'),
    ('faces', 'reset_raw_face_origin', 0, 'for (const v of members) a.POSITION.set(best.candidate, v * 3);', 'for (const v of members) { a.POSITION.set(best.candidate, v * 3); pool.original.set(best.candidate, v * 3); }'),
    ('faces', 'increase_static_face_bound', 1, 'const MAX_MOVE = 0.08,', 'const MAX_MOVE = 0.10,'),
    ('faces', 'accept_inverted_face', 2, 'return norm > 1e-12 && before.reduce((sum, value, k) => sum + value * after[k], 0) > 0;', 'return true;'),
    ('faces', 'ignore_rest_body', 3, '!outsidePadded(rest.surfaces, atRest) || !outsidePadded(contact.surfaces, atContact)', 'false || !outsidePadded(contact.surfaces, atContact)'),
    ('faces', 'trade_neighbor_failure', 4, 'for (const i of incident) {', 'for (const i of incident.filter(i => flags[i].some(Boolean))) {'),
    ('faces', 'omit_shoes_and_hats', 5, "  'shoes', 'cap', 'sun_hat', 'straw_hat']);", '  ]);'),
    ('faces', 'omit_fine_local_face_grid', 6, 'const localOffsets = BRANCH_OFFSETS.map(delta => delta.map((value, k) => value / 4 + a.POSITION[representative * 3 + k] - origin[k]));', 'const localOffsets = [];'),
]


def lf(path):
    return path.read_text(encoding='utf-8').replace('\r\n', '\n')


def sha(value):
    if isinstance(value, str):
        value = value.encode('utf-8')
    return hashlib.sha256(value).hexdigest()


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def named_tap(output, name, positive):
    return re.search(r'^' + ('ok' if positive else 'not ok') + r' \d+ - ' + re.escape(name) + r'\r?$', output, re.M) is not None


def rewrite_imports(source, path):
    pattern = r"(from\s+|import\s+)(['\"])(\.{1,2}/[^'\"\n]+)\2"
    return re.sub(pattern, lambda m: m[1]+m[2]+(path.parent / m[3]).resolve().as_uri()+m[2], source)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', default=os.environ.get('NODE_CMD', 'node'))
    parser.add_argument('--suite', choices=('all', 'lod', 'faces'), default='all')
    parser.add_argument('--out', type=Path, default=LADERA / 'dev/wear/people-wear-authoring-mutations.json')
    args = parser.parse_args()
    args.out = args.out.resolve(); args.out.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='wear-authoring-mutations-', dir=LADERA / '.scratch'))
    env = dict(os.environ, LADERA_PRIO='idle', PYTHONDONTWRITEBYTECODE='1', OPENBLAS_NUM_THREADS='1', OMP_NUM_THREADS='1')
    for variable in ('PEOPLE_WEAR_LOD_TEST_MODULE', 'PEOPLE_WEAR_FACE_TEST_MODULE'):
        env.pop(variable, None)
    run_options = dict(cwd=ROOT, env=env, text=True, encoding='utf-8', errors='replace', stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
    version = subprocess.run([args.node, '--version'], timeout=20, **run_options)
    require(version.returncode == 0 and version.stdout.strip() == 'v22.16.0', 'this acceptance audit requires Node v22.16.0, with real version output')
    names = list(SUITES) if args.suite == 'all' else [args.suite]
    pinned_paths = {LADERA / path for suite in names for path in SUITES[suite][:2]}
    pinned_paths.add(Path(__file__).resolve())
    pinned_paths.update(LADERA / path for path in ('tools/blender/people_wear_math.mjs', 'js/people/wear_geometry.js', 'js/people/wear_pose.js'))
    if 'faces' in names:
        pinned_paths.add(LADERA / 'tools/blender/people_wear.catalog.json')
    pins = {str(path.relative_to(LADERA)): {'lfSha256': sha(lf(path)), 'checkoutSha256': sha(path.read_bytes())} for path in sorted(pinned_paths)}
    report = {'schema': 1, 'node': version.stdout.strip(), 'sourcePins': pins, 'controls': [], 'mutants': [], 'stage': str(stage.relative_to(ROOT)), 'ok': False}
    start = time.monotonic()

    def save(final=False):
        report['seconds'] = time.monotonic()-start
        destination = args.out if final else args.out.with_name(args.out.stem+'-progress.json')
        pending = destination.with_name(destination.name+'.tmp')
        pending.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8', newline='\n')
        os.replace(pending, destination)

    try:
        for suite in names:
            _, test_path, _, tests = SUITES[suite]
            command = [args.node, '--import', str(LADERA / 'tests/register.mjs'), str(LADERA / test_path)]
            result = subprocess.run(command, timeout=120, **run_options)
            log = stage / (suite+'-control.tap'); log.write_text(result.stdout, encoding='utf-8', newline='\n')
            passed = result.returncode == 0 and all(named_tap(result.stdout, name, True) for name in tests) and f'# tests {len(tests)}' in result.stdout
            report['controls'].append({'suite': suite, 'tests': tests, 'exitCode': result.returncode, 'namedTestsPassed': passed,
                                       'log': str(log.relative_to(ROOT)), 'logSha256': sha(result.stdout)})
            save(); require(passed, suite+': unchanged source did not pass every exact named test')
        for suite, ident, test_index, anchor, replacement in CASES:
            if suite not in names:
                continue
            source_path, test_path, variable, tests = SUITES[suite]
            original_path = LADERA / source_path; original = lf(original_path)
            require(original.count(anchor) == 1, ident+': mutation anchor must match exactly once')
            changed = original.replace(anchor, replacement, 1)
            require(changed != original, ident+': unapplied mutation')
            marker = stage / (ident+'.applied'); mutant = stage / (ident+original_path.suffix)
            if suite == 'lod':
                proof = f"\nwith open({str(marker)!r}, 'a', encoding='utf-8') as _proof:\n    _proof.write({(ident+chr(10))!r})\n"
                changed = changed.replace('from __future__ import annotations\n', 'from __future__ import annotations\n'+proof, 1)
            else:
                changed = rewrite_imports(changed, original_path)
                proof = "import { appendFileSync as mutationProof } from 'node:fs';\nmutationProof("+json.dumps(str(marker))+','+json.dumps(ident+'\n')+');\n'
                if changed.startswith('#!'):
                    first, remainder = changed.split('\n', 1); changed = first+'\n'+proof+remainder
                else:
                    changed = proof+changed
            mutant.write_text(changed, encoding='utf-8', newline='\n')
            child_options = dict(run_options, env=dict(env, **{variable: str(mutant)}))
            name = tests[test_index]
            command = [args.node, '--test-name-pattern', '^'+re.escape(name)+'$', '--import', str(LADERA / 'tests/register.mjs'), str(LADERA / test_path)]
            result = subprocess.run(command, timeout=120, **child_options)
            output = result.stdout; log = stage / (ident+'.tap'); log.write_text(output, encoding='utf-8', newline='\n')
            applied = marker.exists() and ident in marker.read_text(encoding='utf-8').splitlines()
            infrastructure_error = bool(re.search(r'(?:SyntaxError|ModuleNotFoundError|FileNotFoundError|ERR_MODULE_NOT_FOUND|Cannot find module|spawnSync .*EPERM|spawnSync .*EACCES)', output))
            killed = applied and result.returncode != 0 and named_tap(output, name, False) and not infrastructure_error
            report['mutants'].append({'id': ident, 'suite': suite, 'test': name, 'applied': applied, 'mutantSha256': sha(changed), 'exitCode': result.returncode,
                                       'namedTestFailed': named_tap(output, name, False), 'infrastructureError': infrastructure_error, 'killed': killed,
                                       'log': str(log.relative_to(ROOT)), 'logSha256': sha(output)})
            save(); require(killed, ident+': mutant survived or did not fail the named assertion')
        report['inputsUnchanged'] = all(sha(lf(LADERA / path)) == pin['lfSha256'] for path, pin in pins.items())
        require(report['inputsUnchanged'], 'authoring source or test changed during mutation audit')
        covered = {case['test'] for case in report['mutants'] if case['killed']}
        require(covered == {name for suite in names for name in SUITES[suite][3]}, 'at least one new authoring test lacks a killed independent mutant')
        report['testsCovered'] = len(covered); report['ok'] = True; save(final=True)
        print(json.dumps({'ok': True, 'node': report['node'], 'testsCovered': len(covered), 'mutantsKilled': len(report['mutants']), 'report': str(args.out.relative_to(ROOT))}))
    except Exception as error:
        report['error'] = str(error); save(final=True); print(json.dumps({'ok': False, 'error': str(error), 'report': str(args.out)})); return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
