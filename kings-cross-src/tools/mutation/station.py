"""Mutation check for core/station.ts, the new core/scene.ts helpers, and tools/fidelity.ts.
usage: python3 -I -u tools/mutation/station.py <kings-cross-src> <scratch dir> <raw osm extract>
Everything runs in a copy with the real node_modules linked in. The unmodified copy must pass the core tests
and the fidelity CLI before anything is mutated, and a load or crash error is an ERROR, never a kill
(tools/mutation/lib/kxmut.py)."""
import json, sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve(); scratch = Path(sys.argv[2]).resolve(); raw = sys.argv[3]
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
    ("under the station: dome ignored", S, "const inDome = Math.hypot(c[0] - canopy.centre[0], c[1] - canopy.centre[1]) < canopy.radius;", "const inDome = false;"),
    ("under the station: dome twice as wide", S, "c[1] - canopy.centre[1]) < canopy.radius;", "c[1] - canopy.centre[1]) < canopy.radius * 2;"),
    ("under the station: shed ignored", S, "const inShed = u > -2 && u < shed.width + 2 && v > -2 && v < shed.length + 2;", "const inShed = false;"),
    ("under the station: no margin west", S, "const inShed = u > -2 &&", "const inShed = u > 0 &&"),
    ("under the station: margin too wide east", S, "u < shed.width + 2 &&", "u < shed.width + 20 &&"),
    ("under the station: no margin south", S, "&& v > -2 &&", "&& v > 0 &&"),
    ("under the station: first corner, not the middle", S, "const c = centroid(b.pts);\n    const { u, v } = worldToShed(shed, c);", "const c = b.pts[0] as Pt;\n    const { u, v } = worldToShed(shed, c);"),
    ("under the station: degenerate outlines kept", S, "    if (b.pts.length < 3) continue;\n    const c = centroid(b.pts);\n    const { u, v }", "    const c = centroid(b.pts);\n    const { u, v }"),
    ("train pose: facing away from the buffers", S, "rotationY: Math.PI - shed.heading,", "rotationY: shed.heading,"),
    ("train pose: ignores the shed heading", S, "rotationY: Math.PI - shed.heading,", "rotationY: Math.PI,"),
    ("train pose: nose across the stop", S, "nose: [stop.x + Math.sin(shed.heading) * noseGap,", "nose: [stop.x - Math.sin(shed.heading) * noseGap,"),
    ("train pose: nose south of the stop", S, "stop.z - Math.cos(shed.heading) * noseGap]", "stop.z + Math.cos(shed.heading) * noseGap]"),
    ("buffers: behind the south end", S, "u >= 0 && u <= shed.width && v >= 0 && v <= 40", "u >= 0 && u <= shed.width && v <= 40"),
]
# data mutations: the committed data is part of what the tests pin
DATA = "web/src/data/kx-track.json"
def surface_underground(d):
    for p in d["platforms"]:
        if p.get("id") == 110643740:  # a deep tube platform
            p.pop("layer", None); p.pop("tunnel", None)
def stretch3(d):
    for p in d["platforms"]:
        if p.get("id") == 68294392:
            for pt in p["pts"]: pt[1] = round(pt[1] * 1.01, 1)
DATA_MUTATIONS = [("data: an underground platform passes as surface", surface_underground), ("data: platform 3 stretched by 1 % (pinned lengths)", stretch3)]

# the fidelity script must fail when the model drifts from the raw extract
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
FIDELITY_MUTATIONS = [("fidelity: platform 3 stretched by 1 %", stretch_platform), ("fidelity: track nodes scaled 3 %", shift_all_rails), ("fidelity: platform 10 missing", drop_platform_10), ("fidelity: a platform 11 appears", extra_platform_11)]

# The only survivor the README documents: counting crossings to the left of the point instead of to the right
# gives the same parity for any closed polygon, so no test can tell the two apart. tools/evidence-pack.mjs
# accepts exactly this label for this driver and fails collection on every other survivor.
KNOWN_EQUIVALENT = {"pointInPolygon: wrong side of the edge"}

if not Path(raw).is_file():
    raise SystemExit(f"raw OSM extract not found: {raw}")
tally = kxmut.Tally(known_equivalent=KNOWN_EQUIVALENT)
with kxmut.workspace(src, scratch, "station") as work:
    tests = sorted(str(p.relative_to(work)) for p in (work / "core" / "tests").glob("*.test.ts"))

    def run():
        return kxmut.run_tests(work, tests, test_timeout_ms=8000, timeout=90, force_exit=True)

    def fid():
        return kxmut.run_command(work, ["node", "tools/fidelity.ts", "--raw", raw], timeout=60)

    baseline = kxmut.require_green(run(), "core/tests/*.test.ts")
    clean = fid()
    if clean.returncode != 0 or clean.expired:
        raise SystemExit(f"BASELINE NOT GREEN (node tools/fidelity.ts --raw <extract>): exit {clean.returncode}\n{clean.tail()}\nthe unmodified copy must pass before any fidelity mutation counts")
    print("[BASELINE] fidelity unmodified exit 0", flush=True)

    for label, rel, old, new in M:
        try:
            with kxmut.mutated(work / rel, [(old, new)]):
                verdict = kxmut.judge(run(), baseline)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)

    original = (work / DATA).read_text()
    for label, fn in DATA_MUTATIONS:
        d = json.loads(original); fn(d)
        (work / DATA).write_text(json.dumps(d))
        try:
            verdict = kxmut.judge(run(), baseline)
        finally:
            (work / DATA).write_text(original)
        tally.record(label, verdict)

    for label, fn in FIDELITY_MUTATIONS:
        d = json.loads(original); fn(d)
        (work / DATA).write_text(json.dumps(d))
        try:
            verdict = kxmut.judge_cli(fid(), fail_marker="\nFAIL:\n")
        finally:
            (work / DATA).write_text(original)
        tally.record(label, verdict)
sys.exit(tally.finish())
