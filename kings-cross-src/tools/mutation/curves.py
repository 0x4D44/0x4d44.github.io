"""Mutation check for the smooth track: core/curves.ts, the graph's edgePoint, the trains and the drawn track on it.

usage: python3 -I -u tools/mutation/curves.py <kings-cross-src> <scratch dir>
The tests run in a copy with the real node_modules linked in; the unmodified copy must pass first and a
load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
C = 'core/curves.ts'
CHORDS = '{ pos: graph.pos }'
M = [
    ('no smoothing: every segment its chord', C, 'const n = Math.max(1, Math.min(Math.ceil(turn / STEP_TURN), Math.floor(l / MIN_STEP)));', 'const n = 1;'),
    ('coarse pieces: 4 degrees a joint', C, 'export const STEP_TURN = (0.5 * Math.PI) / 180;', 'export const STEP_TURN = (4 * Math.PI) / 180;'),
    ('pieces evenly in s, not in turn', C, 'pts.push(at((k + (hi > lo ? (goal - lo) / (hi - lo) : 0)) / PROBE));', 'pts.push(at(j / n));'),
    ('through route leaves along its own chord', C, 'here.set(ids[j] as number, t);', 'here.set(ids[j] as number, dirs[j] as Pt);'),
    ('turnout branch keeps its chord', C, 'let bestCos = cosDiverge;', 'let bestCos = 2;'),
    ('corners rounded off', C, 'if (straightness >= cosSmooth) pairs.push', 'if (straightness >= -1) pairs.push'),
    ('a shape read backwards is not reversed', C, "return a < b ? [...s.pts] : [...s.pts].reverse();", 'return [...s.pts];'),
    ('shapePoint ignores the direction of travel', C, 'const u = Math.max(0, Math.min(1, a < b ? t : 1 - t));', 'const u = Math.max(0, Math.min(1, t));'),
    ('edgePoint ignores the curves', 'core/graph.ts', 'if (shape) return shapePoint(shape, edge.a, edge.b, t);', ''),
    ('graph never carries the curves', 'core/graph.ts', 'return opts.curves ? {', 'return false ? {'),
    ('bogies on the chords', 'web/src/trains-live.ts', 'const { point, dir } = edgePoint(graph, s.edge, t);', f'const {{ point, dir }} = edgePoint({CHORDS}, s.edge, t);'),
    ('motion leading end on the chords', 'core/motion.ts', 'point: edgePoint(graph, edge, t).point', f'point: edgePoint({CHORDS}, edge, t).point'),
    ('motion heading along the chord', 'core/motion.ts', 'const d = edgePoint(graph, t.pos.edge, t.pos.t).dir;', f'const d = edgePoint({CHORDS}, t.pos.edge, t.pos.t).dir;'),
    ('railSegments ignores the curves', 'core/scene.ts', 'if (curve) {', 'if (curve && false) {'),
    ('buildTrack draws the chords', 'web/src/track.ts', "}, railShapes(data));", '});'),
    ('signal heads beside the OSM chord', 'web/src/signals.ts', 'if (!track?.shapes || !track.pos.has(from) || !track.pos.has(to)) return', 'if (true) return'),
    ('signal heads offset along the chord direction', 'web/src/signals.ts', 'return { point, travel: [dir[0] * sign, dir[1] * sign] };', 'return { point, travel: signal.travel };'),
    ('platform edges classified against the chords', 'web/src/furniture.ts', 'const curve = shapeFrom(shapes, r.nodes[i] as number, r.nodes[i + 1] as number) ?? [a, b];', 'const curve = [a, b];'),
    ('tunnel cuttings follow the chords', 'core/landmarks.ts', 'const shapes = railShapes(data); // the rails as drawn', 'const shapes = new Map() as ReturnType<typeof railShapes>; // the rails as drawn'),
    ('rails butted, not mitred', 'web/src/track.ts', 'return { x, z, mx: (before[0] + after[0]) / k, mz: (before[1] + after[1]) / k };', 'return { x, z, mx: after[0], mz: after[1] };'),
]
TESTS = ['core/tests/curves.test.ts', 'core/tests/motion.test.ts', 'web/tests/track.test.ts', 'web/tests/trains-live.test.ts', 'web/tests/signals.test.ts']
tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'curves') as work:
    def run():
        return kxmut.run_tests(work, TESTS, test_timeout_ms=20000, timeout=180)

    baseline = kxmut.require_green(run(), ' '.join(TESTS))
    for label, rel, old, new in M:
        try:
            with kxmut.mutated(work / rel, [(old, new)], unique=True):
                verdict = kxmut.judge(run(), baseline)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
sys.exit(tally.finish())
