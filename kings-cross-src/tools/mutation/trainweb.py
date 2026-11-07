"""Mutation check for web/src/train.ts (the three.js train) against web/tests/train.test.ts.
usage: python3 -I -u tools/mutation/trainweb.py <kings-cross-src> <scratch dir>"""
import re, shutil, subprocess, sys
from pathlib import Path

src = Path(sys.argv[1]); scratch = Path(sys.argv[2])
F = "web/src/train.ts"
M = [
    ("pantograph at the start of its span", "(car.pantograph[0] + car.pantograph[1]) / 2", "car.pantograph[0]"),
    ("pantograph on the floor", "p.position.set(0, ROOF_EDGE,", "p.position.set(0, 0,"),
    ("pantograph on every car", "if (car.pantograph) {", "if (true) {"),
    ("no pantograph", "if (car.pantograph) {", "if (false) {"),
    ("bogie half a metre off", "b.position.set(0, 0, z);", "b.position.set(0, 0, z + 0.5);"),
    ("wheels on a narrower track", "(sx * track) / 2, radius, az", "(sx * track) / 3, radius, az"),
    ("wheels floating", "(sx * track) / 2, radius, az", "(sx * track) / 2, radius * 1.1, az"),
    ("axles twice as far apart", "[-wb / 2, wb / 2]", "[-wb, wb]"),
    ("one door per side", "for (const sx of [-1, 1]) {\n      const dw", "for (const sx of [1]) {\n      const dw"),
    ("door marker inside the body", "marker.position.set(x(half),", "marker.position.set(x(half - 0.5),"),
    ("roof covers 0.1 m too high", "const yt = roofHeight();", "const yt = roofHeight() + 0.1;"),
    ("roof covers at the roof edge", "const yt = roofHeight();", "const yt = ROOF_EDGE;"),
]
survived = []
for i, (label, old, new) in enumerate(M):
    work = scratch / f"w{i:02d}"
    if work.exists(): shutil.rmtree(work)
    shutil.copytree(src, work, ignore=shutil.ignore_patterns("relay"), symlinks=True)
    f = work / F; text = f.read_text()
    if old not in text:
        print(f"[SKIP    ] {label}: pattern not found", flush=True); survived.append(label); shutil.rmtree(work); continue
    f.write_text(text.replace(old, new, 1))
    try:
        r = subprocess.run(["node", "--test", "--test-force-exit", "--test-timeout=20000", "web/tests/train.test.ts"], cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=90)
    except subprocess.TimeoutExpired:
        print(f"[KILLED  ] {label} (hung)", flush=True); shutil.rmtree(work, ignore_errors=True); continue
    failed = sorted(set(re.findall(r"^\s*✖ (.+?) \(", r.stdout, re.M)))
    if r.returncode != 0:
        print(f"[KILLED  ] {label} <- {failed[0] if failed else '(non-zero exit)'}", flush=True)
    else:
        print(f"[SURVIVED] {label}", flush=True); survived.append(label)
    shutil.rmtree(work)
print(f"\n{len(M) - len(survived)}/{len(M)} mutations caught")
for s in survived: print("  NOT CAUGHT:", s)
