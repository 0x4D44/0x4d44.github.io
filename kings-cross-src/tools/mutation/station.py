"""Mutation check for core/station.ts, the new core/scene.ts helpers, and tools/fidelity.ts.
usage: python3 -I -u tools/mutation/station.py <kings-cross-src> <scratch dir> <raw osm extract>"""
import json, re, shutil, subprocess, sys
from pathlib import Path

src = Path(sys.argv[1]); scratch = Path(sys.argv[2]); raw = sys.argv[3]
S = "core/station.ts"; C = "core/scene.ts"
M = [
    ("longAxis: length and width swapped", S, "if (along >= across) {", "if (along < across) {"),
    ("polygonArea: not halved", S, "return Math.abs(s) / 2;", "return Math.abs(s);"),
    ("xRangeAtZ: smallest crossing never kept", S, "if (x < lo) lo = x;", ""),
    ("platformHeading: sign flipped", S, "Math.atan2(dx, zSouth - zNorth)", "Math.atan2(dx, zNorth - zSouth)"),
    ("platformHeading: first platform only", S, "slopes.reduce((a, b) => a + b, 0) / slopes.length", "slopes[0] as number"),
    ("shedToWorld: north is south", S, "s.origin[1] + u * sn - v * c", "s.origin[1] + u * sn + v * c"),
    ("worldToShed: v flipped", S, "v: dx * sn - dz * c", "v: dx * sn + dz * c"),
    ("stationBuilding: any train station", S, "/king'?s cross/i.test(b.name)", "/./.test(b.name)"),
    ("shedLayout: one arch worth of aisle", S, "aisle: (width - 2 * SHED_SPAN_WIDTH) / 2", "aisle: (width - SHED_SPAN_WIDTH) / 2"),
    ("shedLayout: springing at the crown", S, "springing: SHED_CROWN_HEIGHT - radius", "springing: SHED_CROWN_HEIGHT"),
    ("shedLayout: west wall inside platform 8", S, "westFace[0] - 0.5", "westFace[0] + 5"),
    ("shedLayout: north edge as the south end", S, "const southZ = Math.max(", "const southZ = Math.min("),
    ("stationPlatforms: zone ignored", S, "if (!inZone(KINGS_CROSS, centroid(p.pts))) continue;", ""),
    ("platformSouthEnd: the north end", S, "sort((a, b) => b[1] - a[1])", "sort((a, b) => a[1] - b[1])"),
    ("railPair: rail head ignored", S, "gauge / 2 + RAIL_HEAD_WIDTH / 2", "gauge / 2"),
    ("railPair: both rails on one side", S, "[a[0] - nx, a[1] - nz, b[0] - nx, b[1] - nz],", "[a[0] + nx, a[1] + nz, b[0] + nx, b[1] + nz],"),
    ("pointInPolygon: wrong side of the edge", S, "p[0] < ((b[0] - a[0])", "p[0] > ((b[0] - a[0])"),
    ("fitCircle: radius forgets the centre", S, "Math.sqrt(det3(col(2)) / d + cx * cx + cz * cz)", "Math.sqrt(det3(col(2)) / d)"),
    ("concourseCanopy: arc taken from the east", S, "return u < -45 && v < 140;", "return u < 45 && v < 140;"),
    ("concourseHeight: linear fall", S, "(1 - t * t)", "(1 - t)"),
    ("constant: 100 ft arches", S, "SHED_SPAN_WIDTH = 105 * FT", "SHED_SPAN_WIDTH = 100 * FT"),
    ("constant: 700 ft shed", S, "SHED_LENGTH = 800 * FT", "SHED_LENGTH = 700 * FT"),
    ("constant: platform 11 listed", S, "'9', '10'] as const;\n/** Platforms under", "'9', '10', '11'] as const;\n/** Platforms under"),
    ("twinRails: heights flattened", C, "out.push(x1, y1, z1, x2, y2, z2);", "out.push(x1, 0, z1, x2, 0, z2);"),
    ("ribbonTriangles: full width each side", C, "const h = width / 2;", "const h = width;"),
    ("ribbonTriangles: not lifted", C, "const y1 = (segments[i + 1] as number) + lift;", "const y1 = segments[i + 1] as number;"),
    ("buildingPrisms: nothing excluded", C, " && !exclude.has(b.id)", ""),
    ("osm: platform layer 0 stored", "core/osm.ts", "if (layer !== undefined && layer !== 0) p.layer = layer;", "if (layer !== undefined) p.layer = layer;"),
    ("osm: platform layer dropped", "core/osm.ts", "if (layer !== undefined && layer !== 0) p.layer = layer;", ""),
    ("osm: platform tunnel=no counts", "core/osm.ts", "if (tags.tunnel !== undefined && tags.tunnel !== 'no') p.tunnel = true;", "if (tags.tunnel !== undefined) p.tunnel = true;"),
    ("osm: platform tunnel tag dropped", "core/osm.ts", "if (tags.tunnel !== undefined && tags.tunnel !== 'no') p.tunnel = true;", ""),
    ("station: tunnel flag ignored", S, "p.tunnel !== true && (p.layer ?? 0) >= 0", "(p.layer ?? 0) >= 0"),
    ("station: negative layer ignored", S, "p.tunnel !== true && (p.layer ?? 0) >= 0", "p.tunnel !== true"),
    ("station: ground level excluded", S, "(p.layer ?? 0) >= 0", "(p.layer ?? 0) > 0"),
    ("station: underground platforms can be the station's", S, " || !isSurfacePlatform(p)) continue;", ") continue;"),
    ("scene: underground platforms drawn", C, " && isSurfacePlatform(p))", ")"),
    ("buffers: any position across the shed", S, "u >= 0 && u <= shed.width && v >= 0 && v <= 40", "v >= 0 && v <= 40"),
    ("buffers: any distance up the shed", S, "u >= 0 && u <= shed.width && v >= 0 && v <= 40", "u >= 0 && u <= shed.width && v >= 0"),
    ("buffers: behind the south end", S, "u >= 0 && u <= shed.width && v >= 0 && v <= 40", "u >= 0 && u <= shed.width && v <= 40"),
]
survived = []
def run_tests(work, files):
    return subprocess.run(["node", "--test", "--test-force-exit", "--test-timeout=8000", *files], cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=90)

tests = sorted(str(p.relative_to(src)) for p in (src / "core" / "tests").glob("*.test.ts"))
for i, (label, rel, old, new) in enumerate(M):
    work = scratch / f"u{i:02d}"
    if work.exists(): shutil.rmtree(work)
    shutil.copytree(src, work, ignore=shutil.ignore_patterns("node_modules", "relay"))
    f = work / rel; text = f.read_text()
    if old not in text:
        print(f"[SKIP    ] {label}: pattern not found", flush=True); survived.append(label); shutil.rmtree(work); continue
    f.write_text(text.replace(old, new, 1))
    try:
        r = run_tests(work, tests)
    except subprocess.TimeoutExpired:
        print(f"[KILLED  ] {label} (hung)", flush=True); shutil.rmtree(work, ignore_errors=True); continue
    failed = sorted(set(re.findall(r"^\s*✖ (.+?) \(", r.stdout, re.M)))
    if r.returncode != 0:
        print(f"[KILLED  ] {label} <- {failed[0] if failed else '(non-zero exit)'}", flush=True)
    else:
        print(f"[SURVIVED] {label}", flush=True); survived.append(label)
    shutil.rmtree(work)

# data mutations: the committed data is part of what the tests pin
def surface_underground(d):
    for p in d["platforms"]:
        if p.get("id") == 110643740:  # a deep tube platform
            p.pop("layer", None); p.pop("tunnel", None)
def stretch3(d):
    for p in d["platforms"]:
        if p.get("id") == 68294392:
            for pt in p["pts"]: pt[1] = round(pt[1] * 1.01, 1)
for label, fn in [("data: an underground platform passes as surface", surface_underground), ("data: platform 3 stretched by 1 % (pinned lengths)", stretch3)]:
    work = scratch / "dm"
    if work.exists(): shutil.rmtree(work)
    shutil.copytree(src, work, ignore=shutil.ignore_patterns("node_modules", "relay"))
    d = json.loads((work / "web/src/data/kx-track.json").read_text()); fn(d)
    (work / "web/src/data/kx-track.json").write_text(json.dumps(d))
    try:
        r = run_tests(work, tests)
    except subprocess.TimeoutExpired:
        print(f"[KILLED  ] {label} (hung)", flush=True); shutil.rmtree(work, ignore_errors=True); M.append(None); continue
    failed = sorted(set(re.findall(r"^\s*✖ (.+?) \(", r.stdout, re.M)))
    if r.returncode != 0:
        print(f"[KILLED  ] {label} <- {failed[0] if failed else '(non-zero exit)'}", flush=True)
    else:
        print(f"[SURVIVED] {label}", flush=True); survived.append(label)
    M.append(None)
    shutil.rmtree(work)

# the fidelity script must fail when the model drifts from the raw extract
def fid(work):
    return subprocess.run(["node", "tools/fidelity.ts", "--raw", raw], cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=60)

DATA = "web/src/data/kx-track.json"
cases = []
def stretch_platform(d):  # platform 3 drawn 1 % too long
    for p in d["platforms"]:
        if p.get("id") == 68294392:  # King's Cross platform 3 (St Pancras has a platform 3 too)
            for pt in p["pts"]: pt[1] = round(pt[1] * 1.01, 1)
def shift_all_rails(d):   # every node 3 % further out
    for n in d["nodes"]: n[1] = n[1] * 1.03
def drop_platform_10(d):
    d["platforms"] = [p for p in d["platforms"] if p.get("id") != 945776388]
def extra_platform_11(d):
    import copy
    for p in d["platforms"]:
        if p.get("id") == 945776388:  # King's Cross platform 10
            q = copy.deepcopy(p); q["ref"] = "11"; q["id"] = 1; d["platforms"].append(q); break
cases = [("fidelity: platform 3 stretched by 1 %", stretch_platform), ("fidelity: track nodes scaled 3 %", shift_all_rails), ("fidelity: platform 10 missing", drop_platform_10), ("fidelity: a platform 11 appears", extra_platform_11)]
work = scratch / "fid"
if work.exists(): shutil.rmtree(work)
shutil.copytree(src, work, ignore=shutil.ignore_patterns("node_modules", "relay"))
base = fid(work)
print(f"[BASELINE] fidelity unmodified exit {base.returncode}", flush=True)
if base.returncode != 0: survived.append("fidelity baseline is not clean")
orig = (work / DATA).read_text()
for label, fn in cases:
    d = json.loads(orig); fn(d); (work / DATA).write_text(json.dumps(d))
    r = fid(work)
    if r.returncode != 0:
        print(f"[KILLED  ] {label}", flush=True)
    else:
        print(f"[SURVIVED] {label}", flush=True); survived.append(label)
shutil.rmtree(work)

total = len(M) + len(cases)
print(f"\n{total - len(survived)}/{total} mutations caught")
for s in survived: print("  NOT CAUGHT:", s)
