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
f = work/'web/src/shed.ts'
original = f.read_text()
M = [
 ('clock remains below upper turret', 'const clockY = (shaftTop + eavesY) / 2;', 'const clockY = 22.4;'),
 ('clock hidden behind eaves', 'const clockY = (shaftTop + eavesY) / 2;', 'const clockY = eavesY;'),
 ('unsupported arched window above clock', 'const vane = new Batch(), vaneY', "const openings = new Batch(); windowQuad(openings, [0, eavesY, tw/2+.1], '+z', 1, 1); tower.add(mesh(openings.build(), material('sashArch'), 'tower-openings'));\n  const vane = new Batch(), vaneY"),
 ('weather vane omitted', ", mesh(vane.build(), material('steel'), 'tower-vane')", ''),
 ('vane mast floats above cap', 'vane.box([0, (capTop - 0.15 + CLOCK_TOWER_HEIGHT) / 2, 0], [0.045, CLOCK_TOWER_HEIGHT - capTop + 0.15, 0.045]);', 'vane.box([0, (capTop + 0.2 + CLOCK_TOWER_HEIGHT) / 2, 0], [0.045, CLOCK_TOWER_HEIGHT - capTop - 0.2, 0.045]);'),
 ('overall tower height grows', 'CLOCK_TOWER_HEIGHT - capTop + 0.15, 0.045]', 'CLOCK_TOWER_HEIGHT - capTop + 0.55, 0.045]'),
 ('the east aisle roof open underneath', 'for (const [a, b] of aisles) slate.box([(a + b) / 2, wallH - 0.15, -L / 2], [b - a, 0.3, L]);', "for (const [a, b] of aisles) slate.box([(a + b) / 2, wallH - 0.15, -L / 2], [b - a, 0.3, L], { skip: ['-y'] });"),
 ('the east arcade stops short of the springing', 'buildSpineWall(eastArcade, spineStone, eastArcadeU(layout), L, sp, sp, [-1], eastArcadeOpenings(L));', 'buildSpineWall(eastArcade, spineStone, eastArcadeU(layout), L, sp - 0.5, sp - 0.5, [-1], eastArcadeOpenings(L));'),
 ('the spine wall back in shed-brick, a sun-shadow caster', 'buildSpineWall(spineBrick, spineStone, spine, L, sp, valleyY, [-1, 1]);', 'buildSpineWall(brick, spineStone, spine, L, sp, valleyY, [-1, 1]);'),
 ('the spine wall stopped at the springing again, no upper storey', 'const upper = top > springing + 1;', 'const upper = false;'),
 ('one lower opening a bay, in its middle', '[v - pitch / 2, v + pitch / 2].map(', '[v].map('),
 ('corbels on the west face only', 'buildSpineWall(spineBrick, spineStone, spine, L, sp, valleyY, [-1, 1]);', 'buildSpineWall(spineBrick, spineStone, spine, L, sp, valleyY, [-1]);'),
 ('corbels short of the rib\'s inner boom', 'export const RIB_FOOT = SPINE_WALL.thick / 2 + SPINE_WALL.corbel.out - MEMBER_SIZE.boom[0] / 2;', 'export const RIB_FOOT = 1.3;'),
 ('the corbel two heavy blocks again', 'steps: [[0.45, 0.3, 0.5], [0.34, 0.3, 0.33], [0.26, 0.35, 0.17]]', 'steps: [[0.6, 0.4275, 0.93], [0.48, 0.5225, 0.558]]'),
 ('a gap between the rib\'s foot and its corbel', 'drop: 0.07, steps', 'drop: 0.13, steps'),
 ('the east arcade back to the spine\'s paired openings', ", [-1], eastArcadeOpenings(L));", ", [-1]);"),
 ('the north pier left out', 'buildNorthPier(spineBrick, spineStone, spine, L, valleyY);', ''),
 ('the north pier no wider than the wall', 'NORTH_PIER = { half: 1.4,', 'NORTH_PIER = { half: 0.5,'),
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
 for i,(name,old,new) in enumerate(M):
  if original.count(old)!=1: raise SystemExit('Expected one mutation anchor: '+name)
  f.write_text(original.replace(old,new,1))
  try: r=run('m'+str(i))
  except subprocess.TimeoutExpired as error:
   invalid.append(name); print(f'[INVALID] {name}: {kxmut.why(error)} (that is not a kill)',flush=True); continue
  if r.returncode==0: survivors.append(name); print('[SURVIVED] '+name,flush=True)
  elif 'ERR_ASSERTION' in r.stdout and not re.search('SyntaxError|TypeError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION',r.stdout+r.stderr): print('[KILLED] '+name+' (assertion)',flush=True)
  else: invalid.append(name); print('[INVALID] '+name,flush=True)
finally: f.write_text(original)
print(f'{len(M)-len(survivors)-len(invalid)}/{len(M)} killed; {len(survivors)} survivors; {len(invalid)} invalid')
raise SystemExit(bool(survivors or invalid))
