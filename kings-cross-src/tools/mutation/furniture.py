"""Mutation check for the shed's departure totems (web/src/furniture.ts, B5 of the shed-interior rubric): they stand on the platforms, before a pier
when an arcaded wall is near, out of the gateline passages, clear of the benches, two or three a platform, their screens unlit (glowing at night).

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
    ('totems hung 3.5 m up again', F, [("plan.totems, PLATFORM_HEIGHT));", "plan.totems, PLATFORM_HEIGHT + 3.5));")]),
    ('totems before the openings, at the bay middles', F, [('const t = tAtV(rib);', 'const t = tAtV(rib + 3.05);'), ('if (Math.abs(v - rib) > 0.05) continue;', 'if (Math.abs(v - rib - 3.05) > 0.05) continue;')]),
    # 'gateline passages ignored' (dropping the westernPassages check) is an equivalent mutant on today's data: no candidate rib lands in a passage.
    ('totems ignore the benches', F, [('if (free(placed, p) && behindSafetyLine(f, p)) {\n            plan.totems.push(p);', 'if (behindSafetyLine(f, p)) {\n            plan.totems.push(p);')]),
    ('totem screens lit like the body (dark at night)', F, [('const face = new THREE.MeshBasicMaterial(tex ?', 'const face = new THREE.MeshLambertMaterial(tex ?')]),
    ('a forest of totems again, 30 m apart', F, [('  totemSpacing: 100,', '  totemSpacing: 30,')]),
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
