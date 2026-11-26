"""Catch B6 round 2's regressions (the roof over the 9-10 track and the outer track gone, short of the wall, all glass or all sheet, off the roof
plane; the wall's columns, their pairs, knee braces or inner trusses gone, the columns into the pilasters or the OLE masts; the wall below the roof
plane; the plinth, the deep pilasters or their shaded sides gone; the north return gone, at the south end or into the landscraper; the night wash on by
day, flat, missing, cold, on the shared brick, or from the wrong canopy's lamps) through web/tests/kx-suburban-b6-round2.test.ts (with round 1's file).
Usage: python3 -I -u tools/mutation/kx-suburban-b6-round2.py SOURCE WORKTREE_SCRATCH
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
    ('no roof between the canopies and the wall', 'web/src/furniture.ts', '    if (wall && c9 && c10) {\n      const m = suburbanRoofMeshes', '    if (false && wall && c9 && c10) {\n      const m = suburbanRoofMeshes', 'B6 round 2'),
    ('no roof over the 9-10 track', 'web/src/furniture.ts', '    if (n0.inside && n1.inside) piece(a0, a1, n1.q, n0.q, mid);', '', 'B6 round 2'),
    ('the outer roof stops at canopy 10', 'web/src/furniture.ts', '    piece(at(w.edge, t0), at(w.edge, t1), at(w.face, t1), at(w.face, t0), mid);', '    piece(at(w.edge, t0), at(w.edge, t1), at(w.edge, t1), at(w.edge, t0), mid);', 'B6 round 2'),
    ('all glass', 'web/src/furniture.ts', '    const into = c10.glazing.some(([lo, hi]) => mid > lo && mid < hi) ? glass : sheet;\n    into.poly([[l0[0], y - 0.05', '    const into = glass;\n    into.poly([[l0[0], y - 0.05', 'B6 round 2'),
    ('all sheet', 'web/src/furniture.ts', '    const into = c10.glazing.some(([lo, hi]) => mid > lo && mid < hi) ? glass : sheet;\n    into.poly([[l0[0], y - 0.05', '    const into = sheet;\n    into.poly([[l0[0], y - 0.05', 'B6 round 2'),
    ('a metre under the roof plane', 'web/src/furniture.ts', '  const y = c10.roofY;\n  const yb = c10.columnTopY;\n  const at = (line', '  const y = c10.roofY - 1;\n  const yb = c10.columnTopY;\n  const at = (line', 'B6 round 2'),
    ('no wall columns', 'web/src/furniture.ts', '      uprightBox(lattice, cx, cz, along, 0.09, 0.1, GROUND_Y + 0.04, yb - 0.4, S);\n', '', 'B6 round 2'),
    ('single columns', 'web/src/furniture.ts', '    for (const s of columns ? [-1, 1] : []) {', '    for (const s of columns ? [1] : []) {', 'B6 round 2'),
    ('no knee brace to the truss', 'web/src/furniture.ts', '      addBeam(lattice, [cx, yb - 1.4, cz], [cx + ux[0] * 1.0, yb + 0.02, cz + ux[1] * 1.0], 0.07, 0.07, S);\n', '', 'B6 round 2'),
    ('no inner trusses', 'web/src/furniture.ts', '    if (n.inside) truss(innerEnd, n.q);', '', 'B6 round 2'),
    ('the outer truss stops at the columns', 'web/src/furniture.ts', '    truss(outer, [f[0] + ux[0] * 0.05, f[1] + ux[1] * 0.05]);', '    truss(outer, col);', 'B6 round 2'),
    ('columns into the pilasters', 'web/src/furniture.ts', '  columnOut: 0.7,', '  columnOut: 0.45,', 'B6 round 2'),
    ('columns off the wall', 'web/src/furniture.ts', '  columnOut: 0.7,', '  columnOut: 1.0,', 'B6 round 2'),
    ('the wall below the roof plane', 'web/src/furniture.ts', '  aboveRoof: 1.2,', '  aboveRoof: 0.3,', 'B6 round 2'),
    ('a pale plinth', 'web/src/furniture.ts', '  plinthShade: 0.45,', '  plinthShade: 1,', 'B6 round 2'),
    ('no plinth colour', 'web/src/furniture.ts', 'facing(i), yc <= W.plinthTop + 1e-9 ? plinth : full);', 'facing(i), full);', 'B6 round 2'),
    ('shallow pilasters', 'web/src/furniture.ts', '  pilasterProud: 0.45,', '  pilasterProud: 0.25,', 'B6 round 2'),
    ('pilaster sides unshaded', 'web/src/furniture.ts', '[W.plinthTop, yTop, full, shade]', '[W.plinthTop, yTop, full, full]', 'B6 round 2'),
    ('no return', 'web/src/furniture.ts', '    b.poly([[p0[0], w.y1, p0[1]], [p1[0], w.y1, p1[1]], [q1[0], w.y1, q1[1]], [q0[0], w.y1, q0[1]]], undefined, { facing: [0, 1, 0], color: full });\n', '', 'B6 round 2'),
    ('the return at the south end', 'web/src/furniture.ts', '  const at = (face[face.length - 1] as Pt)[1] < (face[0] as Pt)[1] ? face.length - 1 : 0;', '  const at = (face[face.length - 1] as Pt)[1] < (face[0] as Pt)[1] ? 0 : face.length - 1;', 'B6 round 2'),
    ('the return into the landscraper', 'web/src/furniture.ts', '  returnLength: 3,', '  returnLength: 6,', 'B6 round 2'),
    ('the wash by day too', 'web/src/furniture.ts', '* diffuseColor.rgb * vKxWash * uWinNight;', '* diffuseColor.rgb * vKxWash;', 'B6 round 2'),
    ('a flat wash', 'web/src/furniture.ts', '    s += Math.exp(-Math.max(0, r2 - l.d * l.d) / s2);', '    s += 1;', 'B6 round 2'),
    ('no wash in the attribute', 'web/src/furniture.ts', '  for (let i = 0; i < pos.count; i++) wash[i] = wallWash(lamps, [pos.getX(i), pos.getY(i), pos.getZ(i)]);', '  for (let i = 0; i < pos.count; i++) wash[i] = 0;', 'B6 round 2'),
    ('a cold wash', 'web/src/furniture.ts', '  washColor: [0.34, 0.24, 0.13] as const,', '  washColor: [0.13, 0.24, 0.34] as const,', 'B6 round 2'),
    ('the wash on the shared brick', 'web/src/furniture.ts', "    const m = (material('brick') as THREE.MeshLambertMaterial).clone();", "    const m = material('brick') as THREE.MeshLambertMaterial;", 'B6 round 2'),
    ("canopy 9's lamps", 'web/src/furniture.ts', "  return plan.lamps.filter((l) => l.overhead && l.ref === '10').map((l) => {", "  return plan.lamps.filter((l) => l.overhead && l.ref === '9').map((l) => {", 'B6 round 2'),
]


def run(work: Path) -> subprocess.CompletedProcess[str]:
    return kxmut.run_process(['node', '--test', '--test-reporter=tap', 'web/tests/kx-suburban-b6-round2.test.ts', 'web/tests/kx-suburban-b6.test.ts'], cwd=work, timeout=60)

with tempfile.TemporaryDirectory(prefix='kx-suburban-b6-round2-', dir=out) as tmp:
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
    raise SystemExit(1 if failures or len(passing) != 8 else 0)
