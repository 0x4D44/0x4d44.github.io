"""Mutation check for the core (TypeScript) tests.

usage: python3 -I -u tools/mutation/core.py <path to kings-cross-src> <scratch dir>
The tests run in a copy with the real node_modules linked in. The unmodified copy must pass first, and a
kill is a named test failing: a load or crash error is an ERROR (tools/mutation/lib/kxmut.py).
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()

# (label, relative file, old, new, replace_all)
M = [
    ("geo: ignore the cos(latitude) scale", "core/geo.ts", " * Math.cos(origin.lat * RAD);\n  const z", ";\n  const z", False),
    ("geo: north is +z", "core/geo.ts", "const z = -(lat - origin.lat)", "const z = (lat - origin.lat)", False),
    ("geo: unproject longitude wrong", "core/geo.ts", "x / (RAD * EARTH_RADIUS_M * Math.cos(origin.lat * RAD))", "x / (RAD * EARTH_RADIUS_M)", False),
    ("geo: -0 allowed", "core/geo.ts", "RAD * EARTH_RADIUS_M + 0; // + 0 turns -0 into 0", "RAD * EARTH_RADIUS_M;", False),
    ("osm: tunnel=no counts as a tunnel", "core/osm.ts", "tags.tunnel !== undefined && tags.tunnel !== 'no'", "tags.tunnel !== undefined", False),
    ("osm: closing ring point kept", "core/osm.ts", "pts.pop();", "", False),
    ("osm: rails with missing coordinates kept", "core/osm.ts", " && e.nodes.every((n) => coord.has(n))", "", False),
    ("osm: building height dropped", "core/osm.ts", "if (height !== undefined) b.height = height;", "", False),
    ("osm: signal direction dropped", "core/osm.ts", "if (tags['railway:signal:direction']) s.direction = tags['railway:signal:direction'];", "", False),
    ("osm: layer ignored", "core/osm.ts", "layer: num(tags.layer) ?? 0,", "layer: 0,", False),
    ("graph: every edge length is 1", "core/graph.ts", "length: dist(pa, pb),", "length: 1,", False),
    ("graph: components smallest first", "core/graph.ts", "out.sort((x, y) => y.length - x.length)", "out.sort((x, y) => x.length - y.length)", False),
    ("graph: snap ignores the component limit", "core/graph.ts", "if (within && !within.has(e.a)) continue;", "", False),
    ("graph: pointAlong does not clamp", "core/graph.ts", "Math.max(0, Math.min(distance, route.length))", "distance", False),
    ("graph: route never found", "core/graph.ts", "if (!g.adj.has(from) || !g.adj.has(to)) return null;", "", False),
    ("zones: station zone moved", "core/zones.ts", "minX: -40, maxX: 110", "minX: 900, maxX: 1100", False),
    ("data: platform refs renumbered", "web/src/data/kx-track.json", '"ref":"7"', '"ref":"X"', True),
    ("data: tunnels untagged", "web/src/data/kx-track.json", '"tunnel":true', '"tunnel":false', True),
    ("data: attribution removed", "web/src/data/kx-track.json", "OpenStreetMap", "Elsewhere", False),
]

tally = kxmut.Tally()
with kxmut.workspace(src, scratch, "core") as work:
    tests = sorted(str(p.relative_to(work)) for p in (work / "core" / "tests").glob("*.test.ts"))

    def run():
        return kxmut.run_tests(work, tests, test_timeout_ms=8000, timeout=90, force_exit=True)

    baseline = kxmut.require_green(run(), "core/tests/*.test.ts")
    for label, rel, old, new, all_ in M:
        try:
            with kxmut.mutated(work / rel, [(old, new)], every=all_):
                verdict = kxmut.judge(run(), baseline)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
sys.exit(tally.finish())
