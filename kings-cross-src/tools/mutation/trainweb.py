"""Mutation check for web/src/train.ts (the three.js train) against web/tests/train.test.ts.
usage: python3 -I -u tools/mutation/trainweb.py <kings-cross-src> <scratch dir>"""
import re, shutil, subprocess, sys
from pathlib import Path

src = Path(sys.argv[1]); scratch = Path(sys.argv[2])
F = "web/src/train.ts"
L = "web/src/livery.ts"
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
    ("standing train not turned", "group.rotation.y = pose.rotationY;", "group.rotation.y = 0;"),
    ("standing train at the stop, not the nose", "group.position.set(pose.nose[0], 0, pose.nose[1]);", "group.position.set(stop.x, 0, stop.z);"),
    ("roof covers 0.1 m too high", "const yt = roofHeight();", "const yt = roofHeight() + 0.1;"),
    ("roof covers at the roof edge", "const yt = roofHeight();", "const yt = ROOF_EDGE;"),
    ("roof curve not scaled to the roof edge", "[W - 0.52, roofY(3.7)],", "[W - 0.52, 3.7],"),
    ("roof curve cut off flat at the wall", "[W - 0.16, roofY(3.47)],", "[W - 0.16, WALL_TOP],"),
    ("nose roof not scaled to the roof edge", "top: noseY(3.65), bottom: 0.95", "top: 3.65, bottom: 0.95"),
    ("half as many windows", "Math.round((to - from) / 2.0)", "Math.round((to - from) / 4.0)"),
    ("windows 0.6 m shorter", "from + k * pitch + 0.2, from + (k + 1) * pitch - 0.2]", "from + k * pitch + 0.5, from + (k + 1) * pitch - 0.5]"),
    ("LNER sweep painted blue", "swoosh: 0xc8102e,", "swoosh: 0x1020c8,", L),
    ("LNER body grey", "body: 0xf2f2ee,", "body: 0x555555,", L),
    ("LNER nose front not yellow", "noseFront: 0xf0c000,", "noseFront: 0x203080,", L),
    ("Lumo body red", "body: 0x1b4fd8,\n    roof: 0xcfd3d8,\n    skirt: 0x23262b,\n    door: 0x1b4fd8,", "body: 0xd81b1b,\n    roof: 0xcfd3d8,\n    skirt: 0x23262b,\n    door: 0x1b4fd8,", L),
    ("Hull Trains no longer a flagged placeholder", "basis: 'PLACEHOLDER: no source", "basis: 'no source", L),
]
survived = []
for i, m in enumerate(M):
    label, old, new = m[:3]
    rel = m[3] if len(m) > 3 else F
    work = scratch / f"w{i:02d}"
    if work.exists(): shutil.rmtree(work)
    shutil.copytree(src, work, ignore=shutil.ignore_patterns("relay"), symlinks=True)
    f = work / rel; text = f.read_text()
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
