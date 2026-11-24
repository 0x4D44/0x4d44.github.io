"""Mutation check for the shed's departure totems (web/src/furniture.ts, B5 of the shed-interior rubric): they stand on the platforms, before a pier
when an arcaded wall is near, out of the gateline passages, clear of the benches, two or three a platform (one shared on an island of 2/3 or 6/7),
their headers numbered, their screens unlit (glowing at night); and the pole clocks, one a platform or island beside a totem.

usage: python3 -I -u tools/mutation/furniture.py <kings-cross-src> <scratch dir>
The tests run in a copy with the real node_modules linked in; the unmodified copy must pass first and a
load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
F = 'web/src/furniture.ts'
M = [
    ('totems hung 3.5 m up again', F, [('m.compose(new THREE.Vector3(t.x, PLATFORM_HEIGHT, t.z)', 'm.compose(new THREE.Vector3(t.x, PLATFORM_HEIGHT + 3.5, t.z)')]),
    ('totems before the openings, at the bay middles', F, [('const t = tAtV(f, rib);', 'const t = tAtV(f, rib + 3.05);'), ('if (Math.abs(v - rib) > 0.05) continue;', 'if (Math.abs(v - rib - 3.05) > 0.05) continue;')]),
    # 'gateline passages ignored' (dropping the westernPassages check) is an equivalent mutant on today's data: no candidate rib lands in a passage.
    ('totems keep only the general gap from benches', F, [('q.r + p.r + (benches.has(q) ? FIGURES.totemBenchGap : FIGURES.gap)', 'q.r + p.r + FIGURES.gap')]),
    # 'clocks keep only the general gap from benches' is equivalent on today's data too: every clock's first free rib is already 3.5 m clear of a bench.
    ('no pole clocks', F, [('          plan.clocks.push(c);\n', '')]),
    ('clocks before the openings, half a bay off', F, [('const CLOCK_OFFSETS = [6.1, -6.1, 12.2, -12.2] as const;', 'const CLOCK_OFFSETS = [3.05, -3.05, 9.15, -9.15] as const;')]),
    ('totem screens lit like the body (dark at night)', F, [('const face = new THREE.MeshBasicMaterial(tex ?', 'const face = new THREE.MeshLambertMaterial(tex ?')]),
    ('a forest of totems again, 30 m apart', F, [('  totemSpacing: 100,', '  totemSpacing: 30,')]),
    ('islands not shared: a totem on each half again', F, [("export const TOTEM_ISLANDS: readonly (readonly [string, string])[] = [['2', '3'], ['6', '7']];", 'export const TOTEM_ISLANDS: readonly (readonly [string, string])[] = [];')]),
    ('blank headers again', F, [("if (ch !== ' ' && Number.isInteger(d)) {", 'if (false) {')]),
    ('the back face reads its number backwards', F, [('faces.poly([[-xa, dy0, -de], [-xb, dy0, -de], [-xb, dy1, -de], [-xa, dy1, -de]]', 'faces.poly([[xb, dy0, -de], [xa, dy0, -de], [xa, dy1, -de], [xb, dy1, -de]]')]),
]
TESTS = ['web/tests/furniture.test.ts']
tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'furniture') as work:
    def run():
        return kxmut.run_tests(work, TESTS, test_timeout_ms=20000, timeout=180)

    baseline = kxmut.require_green(run(), ' '.join(TESTS))
    for label, rel, pairs in M:
        try:
            with kxmut.mutated(work / rel, pairs, unique=True):
                verdict = kxmut.judge(run(), baseline)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
sys.exit(tally.finish())
