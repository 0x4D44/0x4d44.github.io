"""Mutation check for core/scene.ts tests. usage: python3 -I -u tools/mutation/scene.py <kings-cross-src> <scratch dir>
The tests run in a copy with the real node_modules linked in; the unmodified copy must pass first and a
load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve(); scratch = Path(sys.argv[2]).resolve()
F = "core/scene.ts"
M = [
    ("tunnel rails go in the main bucket", "const bucket = r.tunnel ? out.tunnel : r.service === 'main' ? out.main : out.siding;", "const bucket = r.service === 'main' ? out.main : out.siding;"),
    ("service sidings drawn as main", "r.service === 'main' ? out.main : out.siding", "out.main"),
    ("tunnels below train level", "export const TUNNEL_DEPTH = 0;", "export const TUNNEL_DEPTH = -4;"),
    ("segments with unknown nodes kept as zeros", "if (!a || !b) continue;", "if (!a || !b) { bucket.push(0, y, 0, 0, y, 0); continue; }"),
    ("x/z swapped", "bucket.push(a[0], y, a[1], b[0], y, b[1]);", "bucket.push(a[1], y, a[0], b[1], y, b[0]);"),
    ("last segment dropped", "i + 1 < r.nodes.length", "i + 2 < r.nodes.length"),
    ("height tag ignored", "b.height ?? (b.levels", "(b.levels"),
    ("levels ignored", "b.levels !== undefined ? b.levels * LEVEL_HEIGHT : DEFAULT_BUILDING_HEIGHT", "DEFAULT_BUILDING_HEIGHT"),
    ("levels height wrong", "b.levels * LEVEL_HEIGHT", "b.levels * 3"),
    ("no minimum clamp", "Math.min(MAX_BUILDING_HEIGHT, Math.max(MIN_BUILDING_HEIGHT, raw))", "Math.min(MAX_BUILDING_HEIGHT, raw)"),
    ("no maximum clamp", "Math.min(MAX_BUILDING_HEIGHT, Math.max(MIN_BUILDING_HEIGHT, raw))", "Math.max(MIN_BUILDING_HEIGHT, raw)"),
    ("degenerate buildings kept", "b.pts.length >= 3", "b.pts.length >= 2"),
    ("building label dropped", "if (b.name) p.label = b.name;", ""),
    ("degenerate platforms kept", "p.pts.length >= 3", "p.pts.length >= 1"),
    ("platform label dropped", "if (p.ref !== undefined) prism.label = p.ref;", ""),
    ("platform height wrong", "height: PLATFORM_HEIGHT }", "height: 1.5 }"),
    ("platform height from building rule", "height: PLATFORM_HEIGHT }", "height: DEFAULT_BUILDING_HEIGHT }"),
    ("bounds minZ wrong", "if (z < minZ) minZ = z;", ""),
    ("bounds reads y as z", "const z = positions[i + 2] as number;", "const z = positions[i + 1] as number;"),
]
tally = kxmut.Tally()
with kxmut.workspace(src, scratch, "scene") as work:
    def run():
        return kxmut.run_tests(work, ["core/tests/scene.test.ts"], test_timeout_ms=8000, timeout=60)

    baseline = kxmut.require_green(run(), "core/tests/scene.test.ts")
    for label, old, new in M:
        try:
            with kxmut.mutated(work / F, [(old, new)]):
                verdict = kxmut.judge(run(), baseline)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
sys.exit(tally.finish())
