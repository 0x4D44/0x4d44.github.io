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
mutations=[
 ('under-roof east camera',"road = hotel.faces.find(f => f.kind === 'rear')","road = hotel.faces.find(f => f.kind === 'main')"),
 ('camera below Barlow roof',"[edge.mid[0] + edge.normal[0] * 25, 10, edge.mid[1] + edge.normal[1] * 25]","[edge.mid[0] + edge.normal[0] * 45, 10, edge.mid[1] + edge.normal[1] * 45]"),
 ('camera at facade',"[edge.mid[0] + edge.normal[0] * 25, 10, edge.mid[1] + edge.normal[1] * 25]","[edge.mid[0], 10, edge.mid[1]]"),
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
