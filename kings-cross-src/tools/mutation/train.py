"""Mutation check for core/train.ts and its tests.
usage: python3 -I -u tools/mutation/train.py <kings-cross-src> <scratch dir>"""
import re, shutil, subprocess, sys
from pathlib import Path

src = Path(sys.argv[1]); scratch = Path(sys.argv[2])
F = "core/train.ts"
M = [
    ("driving car 25.35 m", "drivingCarLength: { value: 25.85,", "drivingCarLength: { value: 25.35,"),
    ("intermediate car 25 m", "intermediateCarLength: { value: 26.0,", "intermediateCarLength: { value: 25.0,"),
    ("width 2.6 m", "bodyWidth: { value: 2.7,", "bodyWidth: { value: 2.6,"),
    ("roof edge at Hitachi's 3.62 m", "roofEdgeHeight: { value: 3.725,", "roofEdgeHeight: { value: 3.62,"),
    ("roof covers 0.3 m", "roofCoverHeight: { value: 0.27,", "roofCoverHeight: { value: 0.3,"),
    ("roofHeight ignores the covers", "return FIGURES.roofEdgeHeight.value + FIGURES.roofCoverHeight.value;", "return FIGURES.roofEdgeHeight.value;"),
    ("gauge 1.4 m", "gauge: { value: 1.435,", "gauge: { value: 1.4,"),
    ("cab bogie 5 m from the nose", "cabBogieFromNose: { value: 4.455,", "cabBogieFromNose: { value: 5,"),
    ("inner bogie at the middle of the car", "innerBogieFromNose: { value: 21.45,", "innerBogieFromNose: { value: 13,"),
    ("intermediate bogie span 20 m", "intermediateBogieSpan: { value: 16.7,", "intermediateBogieSpan: { value: 20,"),
    ("bogie wheelbase 9 m", "bogieWheelbase: { value: 2.6,", "bogieWheelbase: { value: 9,"),
    ("front cab car: bogies measured from the rear", "bogies = [start + FIGURES.cabBogieFromNose.value, start + FIGURES.innerBogieFromNose.value];", "bogies = [end - FIGURES.innerBogieFromNose.value, end - FIGURES.cabBogieFromNose.value];"),
    ("rear cab car: bogies in the wrong order", "bogies = [end - FIGURES.innerBogieFromNose.value, end - FIGURES.cabBogieFromNose.value];", "bogies = [end - FIGURES.cabBogieFromNose.value, end - FIGURES.innerBogieFromNose.value];"),
    ("rear cab car: bogies measured from the front", "bogies = [end - FIGURES.innerBogieFromNose.value, end - FIGURES.cabBogieFromNose.value];", "bogies = [start + FIGURES.cabBogieFromNose.value, start + FIGURES.innerBogieFromNose.value];"),
    ("intermediate bogies off centre", "bogies = [mid - FIGURES.intermediateBogieSpan.value / 2, mid + FIGURES.intermediateBogieSpan.value / 2];", "bogies = [mid - FIGURES.intermediateBogieSpan.value, mid];"),
    ("cars separated by a gap", "at = end;", "at = end + 0.5;"),
    ("cab at the wrong end of the front car", "cab = 'front';", "cab = 'rear';"),
    ("pantograph on the rear cab car only", "const pantograph = cab !== null ?", "const pantograph = cab === 'rear' ?"),
    ("pantograph on the front cab car only", "const pantograph = cab !== null ?", "const pantograph = cab === 'front' ?"),
    ("pantograph on every car", "const pantograph = cab !== null ?", "const pantograph = true ?"),
    ("front car pantograph measured from the rear", "cab === 'front' ? start + FIGURES.pantographFromNose.value : end - FIGURES.pantographFromNose.value;", "end - FIGURES.pantographFromNose.value;"),
    ("rear car pantograph measured from the front", ": end - FIGURES.pantographFromNose.value;", ": start + FIGURES.pantographFromNose.value;"),
    ("pantograph base not centred", "([centre - half, centre + half] as const)", "([centre, centre + 2 * half] as const)"),
    ("5-car LNER formation loses a motor car", "cars: ['DPTS', 'MS', 'MS', 'MC', 'DPTF'], source: `${WIKI}: DPTS-MS-MS-MC-DPTF` }", "cars: ['DPTS', 'MS', 'MC', 'DPTF'], source: `${WIKI}: DPTS-MS-MS-MC-DPTF` }"),
    ("9-car formation loses a trailer", "'MS', 'TS', 'MC', 'MF', 'DPTF']", "'MS', 'MC', 'MF', 'DPTF']"),
    ("803 formation as an 800", "cars: ['DPTS', 'MS', 'MS', 'MS', 'DPTS']", "cars: ['DPTS', 'MS', 'MS', 'MC', 'DPTF']"),
    ("wheel diameter called published", "wheelDiameter: { value: 0.86, unit: 'm', basis: 'assumed'", "wheelDiameter: { value: 0.86, unit: 'm', basis: 'published'"),
    ("a drawn figure called published", "bogieWheelbase: { value: 2.6, unit: 'm', basis: 'drawn'", "bogieWheelbase: { value: 2.6, unit: 'm', basis: 'published'"),
    ("a figure with no source", "source: `${GBTRAINS}: 8 ft 6 in (2,600 mm), Beacon Rail's figure for the 803, which shares the bogie`", "source: 'x'"),
    ("a guess that does not say so", "source: 'not published; gbtrains.uk: \"no source gives the real wheel size\". A typical value for a UK EMU, to be replaced.'", "source: 'this is the wheel diameter used for the drawing of the bogie'"),
    ("driving cars counted as intermediate", "return DRIVING.has(type) ? FIGURES.drivingCarLength.value : FIGURES.intermediateCarLength.value;", "return FIGURES.intermediateCarLength.value;"),
]
survived = []

def run_tests(work):
    return subprocess.run(["node", "--test", "--test-force-exit", "--test-timeout=8000", "core/tests/train.test.ts"], cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=60)

for i, (label, old, new) in enumerate(M):
    work = scratch / f"t{i:02d}"
    if work.exists(): shutil.rmtree(work)
    shutil.copytree(src, work, ignore=shutil.ignore_patterns("node_modules", "relay"))
    f = work / F; text = f.read_text()
    if old not in text:
        print(f"[SKIP    ] {label}: pattern not found", flush=True); survived.append(label); shutil.rmtree(work); continue
    f.write_text(text.replace(old, new, 1))
    try:
        r = run_tests(work)
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
