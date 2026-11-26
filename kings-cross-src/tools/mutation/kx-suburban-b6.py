"""Catch B6's regressions (the south camera suburban-p9-south gone, unlisted, not B6's official view, off platform 9, too low, aimed north, along
the platform's line or east of it; the outer brick wall beside platform 10's canopy gone from the page or the tools' scene, on the inner side,
on the track, behind the OLE masts' line or into the landscraper, without its thickness, height or pilasters, cut short, a shadow caster, in
another material, or with its face turned from the tracks) through web/tests/kx-suburban-b6.test.ts.
Usage: python3 -I -u tools/mutation/kx-suburban-b6.py SOURCE WORKTREE_SCRATCH
Source stays untouched; all baseline and mutation logs go to WORKTREE_SCRATCH.
"""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_process: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

src = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
if out == src or out.is_relative_to(src) or src.is_relative_to(out):
    raise SystemExit('output must be separate from the source directory')
out.mkdir(parents=True, exist_ok=True)

MUTATIONS = [
    ('no south camera', 'tools/evidence.mjs', "  'suburban-p9-south': {\n    pos", "  'suburban-p9-south-x': {\n    pos", 'B6 suburban-p9-south'),
    ('not a shed-interior view', 'tools/evidence.mjs', "'suburban-p9', 'suburban-p9-south', 'platform-clock'", "'suburban-p9', 'platform-clock'", 'B6 suburban-p9-south'),
    ('the south view is context', 'tools/evidence.mjs', "'suburban-p9-south': Object.freeze({ element: 'shed-interior', criterion: 'B6', role: 'official',", "'suburban-p9-south': Object.freeze({ element: 'shed-interior', criterion: 'B6', role: 'context',", 'B6 suburban-p9-south'),
    ('on the 9-10 track', 'tools/evidence.mjs', '    pos: [3.8405, 2.5, -260.3813],', '    pos: [0.3, 2.5, -261.3],', 'B6 suburban-p9-south'),
    ('at 0.7 m', 'tools/evidence.mjs', '    pos: [3.8405, 2.5, -260.3813],', '    pos: [3.8405, 1.6, -260.3813],', 'B6 suburban-p9-south'),
    ('looking north', 'tools/evidence.mjs', '    target: [-16.4362, 2.5, -225.9015],', '    target: [24.1172, 2.5, -294.861],', 'B6 suburban-p9-south'),
    ('along the platform line', 'tools/evidence.mjs', '    target: [-16.4362, 2.5, -225.9015],', '    target: [-6.8213, 2.5, -221.8284],', 'B6 suburban-p9-south'),
    ('turned east', 'tools/evidence.mjs', '    target: [-16.4362, 2.5, -225.9015],', '    target: [3.5205, 2.5, -220.3833],', 'B6 suburban-p9-south'),
    ('the page has no wall', 'web/src/main.ts', '  if (suburbanWall) scene.add(suburbanWall);\n', '', 'B6 outer wall'),
    ('the tools scene has no wall', 'tools/station-scene.mjs', ', ...(suburbanWall ? [suburbanWall] : []));', ');', 'B6 outer wall'),
    ('on the inner side', 'web/src/furniture.ts', 'far(c.left) >= far(c.right) ? [c.left, c.right] : [c.right, c.left]', 'far(c.left) < far(c.right) ? [c.left, c.right] : [c.right, c.left]', 'B6 outer wall'),
    ('on the outer track', 'web/src/furniture.ts', '  fromEdge: 5.6,', '  fromEdge: 2.0,', 'B6 outer wall'),
    ('in line with the OLE masts', 'web/src/furniture.ts', '  fromEdge: 5.6,', '  fromEdge: 4.9,', 'B6 outer wall'),
    ('against the landscraper', 'web/src/furniture.ts', '  fromEdge: 5.6,', '  fromEdge: 7.5,', 'B6 outer wall'),
    ('the inset taken the wrong way', 'web/src/furniture.ts', 'offsetLine(edge, W.fromEdge + FIGURES.canopyInset, side);', 'offsetLine(edge, W.fromEdge - FIGURES.canopyInset, side);', 'B6 outer wall'),
    ('no thickness', 'web/src/furniture.ts', 'W.fromEdge + FIGURES.canopyInset + W.thickness, side', 'W.fromEdge + FIGURES.canopyInset, side', 'B6 outer wall'),
    ('no higher than the roof', 'web/src/furniture.ts', '  aboveRoof: 1.2,', '  aboveRoof: 0,', 'B6 outer wall'),
    ('pilasters on the back', 'web/src/furniture.ts', '    pilasters.push({ x: p[0] + t[0] * s - n[0] * out, z: p[1] + t[1] * s - n[1] * out,', '    pilasters.push({ x: p[0] + t[0] * s + n[0] * out, z: p[1] + t[1] * s + n[1] * out,', 'B6 outer wall'),
    ('pilasters a bay apart', 'web/src/furniture.ts', '  pilasterSpacing: 7.5,', '  pilasterSpacing: 15,', 'B6 outer wall'),
    ('cut short of the canopy', 'web/src/furniture.ts', '  const face = offsetLine(edge, ', '  const face = offsetLine(edge.slice(0, -1), ', 'B6 outer wall'),
    ('beside canopy 9', 'web/src/furniture.ts', "  const c = plan.canopies.find((k) => k.ref === '10');", "  const c = plan.canopies.find((k) => k.ref === '9');", 'B6 outer wall'),
    ('a shadow caster', 'web/src/lighting.ts', "  'canopy-steel',\n]);", "  'canopy-steel', 'suburban-wall',\n]);", 'B6 outer wall'),
    ('in stone', 'web/src/furniture.ts', "  const mesh = new THREE.Mesh(suburbanWallGeometry(wall), material('brick'));", "  const mesh = new THREE.Mesh(suburbanWallGeometry(wall), material('stone'));", 'B6 outer wall'),
    ('its face turned from the tracks', 'web/src/furniture.ts', '  sheet(w.face, w.y0, yTop, (i) => toward(away(i)));', '  sheet(w.face, w.y0, yTop, (i) => away(i));', 'B6 outer wall'),
]


def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-suburban-b6.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-suburban-b6-', dir=out) as tmp:
    work = Path(tmp) / 'kings-cross-src'
    for name in ('core', 'web', 'tools'):
        shutil.copytree(src / name, work / name)
    shutil.copy2(src / 'package.json', work / 'package.json')
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)
    baseline = run(work)
    (out / 'baseline.log').write_text(baseline.stdout + baseline.stderr)
    if baseline.returncode:
        raise SystemExit(baseline.stdout + baseline.stderr)
    passing = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
    caught = 0
    failures = []
    for i, (label, rel, old, new, expected) in enumerate(MUTATIONS, 1):
        file = work / rel
        original = file.read_text()
        if old not in original:
            raise SystemExit(f'missing mutation anchor: {label}')
        file.write_text(original.replace(old, new, 1))
        try:
            result = run(work)
        except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap: not a kill
            file.write_text(original)
            (out / f'mutation-{i}.log').write_text(f'{kxmut.why(error)}\n{error.output or ""}{error.stderr or ""}')
            failures.append(label)
            print(f'[SURVIVED] {label} ({kxmut.why(error)}; that is not a kill)', flush=True)
            continue
        file.write_text(original)
        (out / f'mutation-{i}.log').write_text(result.stdout + result.stderr)
        failed = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
        if result.returncode and any(expected in name for name in failed) and 'AssertionError' in result.stdout and 'ERR_MODULE_NOT_FOUND' not in result.stderr:
            caught += 1
            print(f'[CAUGHT] {label} -> {expected}', flush=True)
        else:
            failures.append(label)
            print(f'[SURVIVED] {label}', flush=True)
    print(f'{caught}/{len(MUTATIONS)} mutations caught; baseline {len(passing)} tests passed; survivors: {failures}')
    raise SystemExit(1 if failures or len(passing) != 3 else 0)
