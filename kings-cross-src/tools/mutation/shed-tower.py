"""Tower staging/vane mutations; run only in an isolated scratch copy.
Usage: python3 -I -u tools/mutation/shed-tower.py SOURCE WORKTREE_SCRATCH
Kills require TAP assertion failures; load/parse failures are invalid.
"""
from pathlib import Path
import re
import shutil
import subprocess
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_process: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

src, out = [Path(p).resolve() for p in sys.argv[1:]]
out.mkdir(parents=True, exist_ok=True)
work = out / 'work'
if work.exists(): raise SystemExit('Choose a fresh output directory; prior evidence is retained')
for name in ['web', 'core']:
    shutil.copytree(src/name, work/name)
shutil.copy2(src/'package.json', work/'package.json')
(work/'node_modules').symlink_to((src/'node_modules').resolve(), target_is_directory=True)
originals = {p: (work/p).read_text() for p in ['web/src/shed.ts', 'web/src/materials.ts']}
M = [
 ('clock remains below upper turret', 'const clockY = (shaftTop + eavesY) / 2;', 'const clockY = 22.4;'),
 ('clock hidden behind eaves', 'const clockY = (shaftTop + eavesY) / 2;', 'const clockY = eavesY;'),
 ('unsupported arched window above clock', 'const vane = new Batch(), vaneY', "const openings = new Batch(); windowQuad(openings, [0, eavesY, tw/2+.1], '+z', 1, 1); tower.add(mesh(openings.build(), material('sashArch'), 'tower-openings'));\n  const vane = new Batch(), vaneY"),
 ('weather vane omitted', ", mesh(vane.build(), material('steel'), 'tower-vane')", ''),
 ('vane mast floats above cap', 'vane.box([0, (capTop - 0.15 + CLOCK_TOWER_HEIGHT) / 2, 0], [0.045, CLOCK_TOWER_HEIGHT - capTop + 0.15, 0.045]);', 'vane.box([0, (capTop + 0.2 + CLOCK_TOWER_HEIGHT) / 2, 0], [0.045, CLOCK_TOWER_HEIGHT - capTop - 0.2, 0.045]);'),
 ('overall tower height grows', 'CLOCK_TOWER_HEIGHT - capTop + 0.15, 0.045]', 'CLOCK_TOWER_HEIGHT - capTop + 0.55, 0.045]'),
 ('the east aisle roof open underneath', 'for (const [a, b] of aisles) slate.box([(a + b) / 2, wallH - 0.15, -L / 2], [b - a, 0.3, L]);', "for (const [a, b] of aisles) slate.box([(a + b) / 2, wallH - 0.15, -L / 2], [b - a, 0.3, L], { skip: ['-y'] });"),
 ('the east arcade stops short of the springing', 'buildEastArcade(eastArcade, spineStone, eastArcadeU(layout), L, sp, eastArcadeOpenings(L));', 'buildEastArcade(eastArcade, spineStone, eastArcadeU(layout), L, sp - 0.5, eastArcadeOpenings(L));'),
 ('the spine wall back in shed-brick, a sun-shadow caster', 'buildSpineWall(spineBrick, spineStone, spine, L, sp, valleyY, [-1, 1]);', 'buildSpineWall(brick, spineStone, spine, L, sp, valleyY, [-1, 1]);'),
 ('the spine wall stopped at the springing again, no upper storey', 'const upper = top > springing + 1;', 'const upper = false;'),
 ('one lower opening a bay, in its middle', '[v - pitch / 2, v + pitch / 2].map(', '[v].map('),
 ('corbels on the west face only', 'buildSpineWall(spineBrick, spineStone, spine, L, sp, valleyY, [-1, 1]);', 'buildSpineWall(spineBrick, spineStone, spine, L, sp, valleyY, [-1]);'),
 ('corbels short of the rib\'s inner boom', 'export const RIB_FOOT = SPINE_WALL.thick / 2 + SPINE_WALL.corbel.out - MEMBER_SIZE.boom[0] / 2;', 'export const RIB_FOOT = 1.3;'),
 ('the corbel two heavy blocks again', 'steps: [[0.45, 0.3, 0.5], [0.34, 0.3, 0.33], [0.26, 0.35, 0.17]]', 'steps: [[0.6, 0.4275, 0.93], [0.48, 0.5225, 0.558]]'),
 ('a gap between the rib\'s foot and its corbel', 'drop: 0.07, steps', 'drop: 0.13, steps'),
 ('the east arcade back to the spine\'s paired openings', ", sp, eastArcadeOpenings(L));", ", sp, spineLowerOpenings(L));"),
 ('the north pier left out', 'buildNorthPier(spineBrick, spineStone, spine, L, valleyY);', ''),
 ('the north pier no wider than the wall', 'NORTH_PIER = { half: 1.4,', 'NORTH_PIER = { half: 0.5,'),
 ('the arcades\' dressings back in the front\'s brown stone', "material('stoneDressing'), 'shed-spine-stone'", "material('stoneFoot'), 'shed-spine-stone'"),
 ('the west arcade without its corbels and band', 'dressFace(stone, depth, 1, length, springing);', ''),
 ('the west arcade a plain wall, no arches', 'arcadeStorey(brick, depth / 2, length, GROUND_Y, springing, opens,', 'arcadeStorey(brick, depth / 2, length, GROUND_Y, springing, [],'),
 ('the west arcade\'s piers stand in the gateline passages', '(overCut(v0, v1) ? WESTERN_HEAD : GROUND_Y)', '(GROUND_Y)'),
 ('the east aisle\'s ceiling left out: the slate\'s dark underside in the arches', "  group.add(mesh(ceiling.build(), material('valleyLining'), 'shed-aisle-ceiling'));\n", ''),
 ('the east arcade\'s heads the wall\'s full 1.0 m deep again: a pointed wedge through them', 'arcadeStorey(brick, x - h + EAST_ARCADE.ring / 2, length, spring, springing, opens, EAST_ARCADE.ring);', 'arcadeStorey(brick, x, length, spring, springing, opens, thick);'),
 ('the west arcade\'s glass the dark pane again', "material('arcadeGlass'), 'shed-west-arcade-panes'", "material('pane'), 'shed-west-arcade-panes'"),
 ('the west arcade\'s glass not numbered as windows: dark after dark', 'panes.poly(pts, pts.map((p): V2 => uvOf(-p[2], p[1])), { facing: [1, 0, 0] });', 'panes.poly(pts, pts.map((p): V2 => [-p[2], p[1]]), { facing: [1, 0, 0] });'),
 ('the west arcade\'s glazing without its transom', '    strip(vc - r, jamb, vc + r, jamb, bar);\n', ''),
 ('the west arcade\'s glazing without its mullions', 'for (let i = 1; i < lights; i++) { const v', 'for (let i = lights; i < lights; i++) { const v'),
 ('the west arcade\'s glazing without its frame', '    strip(vc - fr, sill, vc - fr, jamb, frame);\n    strip(vc + fr, sill, vc + fr, jamb, frame);\n', ''),
 ('the west arcade\'s glass down to the platform again: glazed doors', 'const pts: V3[] = [[glass, sill, -(vc - r)]];', 'const pts: V3[] = [[glass, GROUND_Y, -(vc - r)]];'),
 ('the west arcade\'s windows without their brick base', "    brick.box([base / 2, (GROUND_Y + sill) / 2, -vc], [base, sill - GROUND_Y, 2 * r], { skip: ['-x', '-y', '+z', '-z'] });\n", ''),
 ('the west arcade\'s sill at the platform', 'sill: 1.75, base: 0.25 }', 'sill: 0.9, base: 0.25 }'),
 # the glass's tone and shadow live in materials.ts: a fourth item names the file mutated
 ('the west arcade\'s glass pale and self-lit again', 'color: 0x4c545a, sheen: 0x0e1216', 'color: 0x8a96a0, sheen: 0x4e5862', 'web/src/materials.ts'),
 ('the west arcade\'s glass glowing by day: a bright sheen the shadow cannot take', 'sheen: 0x0e1216', 'sheen: 0x3a4248', 'web/src/materials.ts'),
 ('the west arcade\'s glass see-through: it takes no sun shadow', 'emissive: ARCADE_GLASS.sheen })', 'emissive: ARCADE_GLASS.sheen, transparent: true, opacity: 0.95 })', 'web/src/materials.ts'),
 ('the west arcade\'s bars back in the dark rib paint', "material('arcadeFrame'), 'shed-west-arcade-bars'", "material('ribPaint'), 'shed-west-arcade-bars'"),
 ('the west arcade\'s unlit glass black after dark: no floor', "ARCADE_GLASS.night, 'arcadeGlass', true)", "0, 'arcadeGlass', true)", 'web/src/materials.ts'),
 ('the west arcade\'s glass floor too bright after dark', 'share: 0.8, night: 0x0e1114 }', 'share: 0.8, night: 0x3a3d40 }', 'web/src/materials.ts'),
 ('the west arcade\'s bars dark after dark: no floor', "ARCADE_FRAME.night, 'arcadeFrame', false)", "0, 'arcadeFrame', false)", 'web/src/materials.ts'),
 ('the west arcade\'s glass floor over the lit panes too', "'arcadeGlass', true)", "'arcadeGlass', false)", 'web/src/materials.ts'),
 ('the west arcade\'s bars dim by day', 'ARCADE_FRAME = { color: 0xc8c6ba,', 'ARCADE_FRAME = { color: 0x707070,', 'web/src/materials.ts'),
 # the roof's outside (ROOF_EXTERIOR, rubric A5): rib caps, crown bars, gutters, dark and thinning with the cladding
 ('the rib caps over half the ribs only', 'for (const v of ribPositions(L)) {\n      for (let i = 0; i < ARC_STEPS * 2; i++) {', 'for (const v of ribPositions(L).slice(0, 20)) {\n      for (let i = 0; i < ARC_STEPS * 2; i++) {'),
 ('the crown seams twice as far apart', 'seamPitch: 1.8,', 'seamPitch: 3.6,'),
 ('a lengthwise strap over the crown again', '    const seamR = rs + ROOF_EXTERIOR.seam[1];\n', '    const seamR = rs + ROOF_EXTERIOR.seam[1];\n    { const [u, y] = vaultPoint(uc, sp, rs + 0.05, 1.2); outer.box([u, y, -L / 2], [0.3, 0.1, L], { rotZ: Math.PI / 2 - 1.2 }); }\n'),
 ('the crown seams facing inward', "skip: ['+x', '-x', '-y', '+z', '-z']", "skip: ['+x', '-x', '+y', '+z', '-z']"),
 ('the north end rib no heavier than the caps', 'endRib: [0.5, 0.6]', 'endRib: [0.3, 0.12]'),
 ('no crown rail', '    for (const h of [rh, rh / 2]) outer.box(', '    for (const h of [] as number[]) outer.box('),
 ('the roof bars solid in x-ray', '    barsMat.opacity = o;\n', ''),
 ('no eaves gutters', '    outer.box([edge, sp + gh / 2 - 0.1, -L / 2], [gw, gh, L]);\n', ''),
 ('the roof bars pale and self-lit', "const barsMat = (material('ribPaint')", "const barsMat = (material('lining')"),
 ('the rib caps a metre off the skin', 'const capR = (rs + ROOF_EXTERIOR.ribCap[1] / 2) / Math.cos((a1 - a0) / (ARC_STEPS * 4));', 'const capR = rs + 1;'),
 ('the roof bars seen from inside again: the ghost lattice', 'return roofOpacity(cam, layout, mode) * smoothstep(0, ROOF_EXTERIOR.fade, Math.hypot(dx, dy, dz));', 'return roofOpacity(cam, layout, mode);'),
 ('the pop at the shed\'s edge back', 'return roofOpacity(cam, layout, mode) * smoothstep(0, ROOF_EXTERIOR.fade, Math.hypot(dx, dy, dz));', 'return Math.hypot(dx, dy, dz) > 0 ? roofOpacity(cam, layout, mode) : 0;'),
 ('the roof bars drawn under the crown glass again', 'roofBars.renderOrder = 4;', 'roofBars.renderOrder = 2;'),
 ('the roof bars without their own opacity callback', 'roofBars.onBeforeRender = (', 'roofBars.userData.unused = ('),
]
def run(name):
 try: r = kxmut.run_process(['node','--test','--test-reporter=tap','--test-timeout=10000','web/tests/shed-tower.test.ts','web/tests/shed.test.ts'],cwd=work,timeout=30)
 except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap; the log keeps what it wrote
  (out/(name+'.log')).write_text(f'{kxmut.why(error)}\n{error.output or ""}{error.stderr or ""}')
  raise
 (out/(name+'.log')).write_text(r.stdout+r.stderr)
 return r
baseline = run('baseline')
if baseline.returncode: raise SystemExit('Baseline failed, inspect baseline.log')
survivors, invalid = [], []
try:
 for i,(name,old,new,*where) in enumerate(M):
  path = where[0] if where else 'web/src/shed.ts'
  original = originals[path]
  if original.count(old)!=1: raise SystemExit('Expected one mutation anchor: '+name)
  (work/path).write_text(original.replace(old,new,1))
  try: r=run('m'+str(i))
  except subprocess.TimeoutExpired as error:
   invalid.append(name); print(f'[INVALID] {name}: {kxmut.why(error)} (that is not a kill)',flush=True); continue
  finally: (work/path).write_text(original)
  if r.returncode==0: survivors.append(name); print('[SURVIVED] '+name,flush=True)
  elif 'ERR_ASSERTION' in r.stdout and not re.search('SyntaxError|TypeError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION',r.stdout+r.stderr): print('[KILLED] '+name+' (assertion)',flush=True)
  else: invalid.append(name); print('[INVALID] '+name,flush=True)
finally:
 for path, text in originals.items(): (work/path).write_text(text)
print(f'{len(M)-len(survivors)-len(invalid)}/{len(M)} killed; {len(survivors)} survivors; {len(invalid)} invalid')
raise SystemExit(bool(survivors or invalid))
