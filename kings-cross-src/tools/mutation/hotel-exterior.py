"""Mutate the exterior evidence camera in a retained scratch copy: SOURCE SCRATCH."""
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut  # only for run_process: the timeout, the memory cap and no orphaned test workers; the counting below is this driver's own

src, out = (Path(p).resolve() for p in sys.argv[1:])
if src == out or src.is_relative_to(out) or out.is_relative_to(src) or '.scratch' not in out.parts:
    raise SystemExit('Choose a separate output under worktree .scratch')
work=out/'work'
if work.exists(): raise SystemExit('Choose fresh output')
shutil.copytree(src,work,ignore=shutil.ignore_patterns('node_modules','.git','.scratch','dist'))
(work/'node_modules').symlink_to((src/'node_modules').resolve(),target_is_directory=True)
target=work/'tools/evidence.mjs'
original=target.read_text()
# The station cameras are frozen literals (FROZEN_STATION_CAMERAS), so each mutation edits the hotel camera's literal numbers: the middle of
# the Pancras Road (rear) chain is [-61.25, -24.9], the camera stands 25 m out along its normal at y = 10 and aims at it.
HOTEL_POS='pos: [-76.82513065762711, 10, -5.344558174312606],'
mutations=[
 # the main face's camera, 45 m out at y = 14 and aimed at the main face: the under-roof view the junction diagnostic keeps
 ('under-roof east camera',HOTEL_POS+"\n    target: [-61.25, 9.65, -24.9],","pos: [-22.843110827215803, 14, -71.98447478138837],\n    target: [-53.4, 9.65, -38.95],"),
 # 45 m out along the same normal
 ('camera below Barlow roof',HOTEL_POS,'pos: [-89.2852351837288, 10, 10.299795286237305],'),
 ('camera at facade',HOTEL_POS,'pos: [-61.25, 10, -24.9],'),
]
def run(name):
    try: r=kxmut.run_process(['node','--test','--test-reporter=tap','tools/tests/hotel-exterior.test.mjs'],cwd=work,timeout=60)
    except subprocess.TimeoutExpired as error:  # a hang, or a mutant that ate its memory cap; the log keeps what it wrote
        (out/(name+'.log')).write_text(f'{kxmut.why(error)}\n{error.output or ""}{error.stderr or ""}')
        raise
    (out/(name+'.log')).write_text(r.stdout+r.stderr)
    return r
if run('baseline').returncode: raise SystemExit('baseline failed')
killed=0
for i,(label,old,new) in enumerate(mutations):
    if original.count(old)!=1: raise SystemExit('ambiguous mutation: '+label)
    target.write_text(original.replace(old,new,1))
    try: r=run(f'm{i:02d}')
    except subprocess.TimeoutExpired as error:
        print(f'SURVIVED/INVALID: {label} ({kxmut.why(error)}; that is not a kill)',flush=True)
        continue
    finally: target.write_text(original)
    body=r.stdout+r.stderr
    caught=bool(r.returncode and 'AssertionError' in body and 'not ok 1 - hotel exterior camera' in body and not re.search(r'SyntaxError|TypeError|ERR_MODULE_NOT_FOUND',body))
    print(f'{"CAUGHT" if caught else "SURVIVED/INVALID"}: {label}',flush=True)
    killed+=caught
print(f'{killed}/{len(mutations)} caught')
raise SystemExit(killed!=len(mutations))
