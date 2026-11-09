"""Mutation checks for the overhead line equipment (core/ole.ts, web/src/ole.ts); usage: ole.py <kings-cross-src> <.scratch/output>.

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass first,
a mutant is killed only by a named test that fails by assertion (a load error or a crash is an ERROR, not a kill),
and every test must be turned red by at least one mutation (tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

if len(sys.argv) != 3:
    raise SystemExit(__doc__)

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

CORE, WEB = 'core/ole.ts', 'web/src/ole.ts'
TESTS = ['core/tests/ole.test.ts', 'web/tests/ole.test.ts']

MUTATIONS = [
    # What is wired.
    ('tunnel ways are wired', CORE, "if (r.tunnel || r.electrified !== 'contact_line') continue;", "if (r.electrified !== 'contact_line') continue;"),
    ('any electrified tag is wired', CORE, "if (r.tunnel || r.electrified !== 'contact_line') continue;", 'if (r.tunnel || !r.electrified) continue;'),
    ('segments outside the zone are wired', CORE, 'if (!input.inZone((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;', ''),
    ('zero-length segments are wired', CORE, 'if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;', 'if (!a || !b) continue;'),
    # Where the supports stand.
    ('first support stands at the shed wall', CORE, 'for (let v = OLE.firstV; v < vMax; v += OLE.span) out.push(v);', 'for (let v = 0; v < vMax; v += OLE.span) out.push(v);'),
    ('support spacing doubled', CORE, 'v < vMax; v += OLE.span) out.push(v);', 'v < vMax; v += OLE.span * 2) out.push(v);'),
    ('a support stands on the very end of the wire', CORE, 'v < vMax; v += OLE.span) out.push(v);', 'v <= vMax; v += OLE.span) out.push(v);'),
    ('the last segment of every way is left unwired', CORE, "if (r.tunnel || r.electrified !== 'contact_line') continue;\n    for (let i = 0; i + 1 < r.nodes.length; i++) {", "if (r.tunnel || r.electrified !== 'contact_line') continue;\n    for (let i = 0; i + 2 < r.nodes.length; i++) {"),
    ('a segment is in the zone if its first node is', CORE, 'if (!input.inZone((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) continue;', 'if (!input.inZone(a[0], a[1])) continue;'),
    # Heights, stagger and sag.
    ('contact wire height changed', CORE, 'contactHeight: 4.7,', 'contactHeight: 4.2,'),
    ('boom rests on the highest catenary', CORE, 'boomClearance: 0.4,', 'boomClearance: 0,'),
    ('wires touch the shed roof', CORE, 'roofClearance: 0.3,', 'roofClearance: 0,'),
    ('masts stand inside the vehicle gauge', CORE, 'mastClearance: 2.6,', 'mastClearance: 1,'),
    ('masts stand no further out at a tunnel mouth', CORE, 'mouthClearance: 4.4,', 'mouthClearance: 2.6,'),
    ('stagger widened', CORE, 'stagger: 0.23,', 'stagger: 0.5,'),
    ('contact wire never alternates its stagger', CORE, 'const sign = Math.floor(k) % 2 === 0 ? 1 : -1;', 'const sign = 1;'),
    ('stagger jumps instead of ramping', CORE, 'return OLE.stagger * sign * (1 - 2 * f);', 'return OLE.stagger * sign;'),
    ('catenary does not sag', CORE, 'return system * (1 - OLE.sag * mid);', 'return system;'),
    ('catenary sags at the supports', CORE, 'const mid = 1 - (2 * f - 1) ** 2; // 0 at a cross line, 1 mid-span', 'const mid = (2 * f - 1) ** 2;'),
    ('system height does not taper at a tunnel mouth', CORE, 'const smooth = t * t * (3 - 2 * t);', 'const smooth = 1;'),
    ('mouth taper reaches twice as far', CORE, 'Math.min(1, d / OLE.mouthReach)', 'Math.min(1, d / (OLE.mouthReach * 2))'),
    ('only the first tunnel mouth tapers the wires', CORE, 'Math.min(Infinity, ...mouths.map(', 'Math.min(Infinity, ...mouths.slice(0, 1).map('),
    ('only the first tunnel mouth pushes masts out', CORE, 'mouths.some(m => Math.hypot(p[0] - m[0], p[1] - m[1]) < OLE.mouthReach)', 'mouths.slice(0, 1).some(m => Math.hypot(p[0] - m[0], p[1] - m[1]) < OLE.mouthReach)'),
    ('mouth taper never reaches the minimum', CORE, 'return OLE.minSystemHeight + (OLE.systemHeight - OLE.minSystemHeight) * smooth;', 'return OLE.systemHeight * (0.5 + 0.5 * smooth);'),
    # The wires.
    ('wires are not cut at the supports', CORE, 'for (const v of vs) for (const at of crossingsOf(s, v)) if (at > 0 && at < len) ts.add(at);', ''),
    ('no droppers between supports', CORE, 'for (let k = 1; k * OLE.dropperSpacing < len; k++) ts.add(k * OLE.dropperSpacing);', ''),
    # The curves (core/curves.ts): the wires and the masts follow the track the rails are drawn on.
    ('wires and masts on the OSM chords', CORE, 'const curves = input.curves ?? railShapes(input.data);\n  const segs', 'const curves: RailShapes = new Map();\n  const segs'),
    ('wires cut only at droppers and supports, cutting across the curve', CORE, 'for (const q of s.path) if (q.s > 0 && q.s < len) ts.add(q.s);', ''),
    ('a dropper at every joint of the curve', CORE, 'if (a.hang) {', 'if (true) {'),
    ('masts kept clear of the chords only', CORE, 'for (let k = 0; k + 1 < curve.length; k++) out.push([curve[k]!, curve[k + 1]!]);', 'out.push([a, b]);'),
    ('stagger square to the chord at a support', CORE, 'return { u, x, z, wx: x - dir[1] * off, wz: z + dir[0] * off };', 'return { u, x, z, wx: x - (s.b[1] - s.a[1]) / Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) * off, wz: z + (s.b[0] - s.a[0]) / Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) * off };'),
    ('stagger laid along the track instead of across it', CORE, 'const n: Pt = [-dir[1], dir[0]];', 'const n: Pt = dir;'),
    ('stagger not applied to the wire', CORE, '      const off = staggerAt(v);\n      const q: Pt', '      const off = 0;\n      const q: Pt'),
    ('catenary may rise through the shed roof', CORE, 'Math.min(catenaryAt(v, systemHeightAt(p, mouths)), roofCap(u, v) - C)', 'catenaryAt(v, systemHeightAt(p, mouths))'),
    ('roof limit ignores the stagger swing', CORE, 'const us = [u - OLE.stagger, u, u + OLE.stagger].filter(q => q >= 0 && q <= layout.width);', 'const us = [u].filter(q => q >= 0 && q <= layout.width);'),
    # The supports.
    ('a node on a support line is counted twice', CORE, 'return seen.has(key) ? false : (seen.add(key), true);', 'return true;'),
    ('nothing is under the shed', CORE, 'const inShed = inShedV(v) && !!roofY;', 'const inShed = false;'),
    ('arches are ignored', CORE, 'for (const [a0, a1] of input.arches ?? []) {', 'for (const [a0, a1] of []) {'),
    ('cross-span hangers omitted', CORE, 'spans.push(c.wx, ys, c.wz, c.wx, top(c), c.wz); spanCounts.hangers++;', ''),
    ('cross-span clearance removed', CORE, 'crossSpanClearance: 0.5,', 'crossSpanClearance: 0,'),
    ('aisle drop tubes omitted', CORE, "if (roof > y) members.push({ a: [c.wx, roof, c.wz], b: [c.wx, y, c.wz], size: OLE.tubeSize, kind: 'tube' });", ''),
    ('shed registration arms omitted', CORE, "      members.push({ a: [c.wx, y, c.wz], b: [c.wx, C + 0.05, c.wz], size: OLE.tubeSize * 0.6, kind: 'arm' });\n    }\n    // in the open", '    }\n    // in the open'),
    ('crossings are not ordered across the line', CORE, '}).sort((a, b) => a.u - b.u);\n    if (!crossings.length) continue;', '});\n    if (!crossings.length) continue;'),
    ('masts ignore signals', CORE, ' && signals.every(s => Math.hypot(p[0] - s[0], p[1] - s[1]) >= 1.5);', ';'),
    ('masts ignore rails', CORE, 'rails.every(([a, b]) => distanceToSegment(p, a, b) >= clearance) && ', ''),
    ('masts may not step outward', CORE, 'for (let k = 0; k <= 16; k++) {', 'for (let k = 0; k <= 0; k++) {'),
    ('masts stand where the group ends', CORE, 'const west = find(g[0]!.u - clearance, -1), east = find(g.at(-1)!.u + clearance, 1);', 'const west = g[0]!.u - clearance, east = g.at(-1)!.u + clearance;'),
    ('tunnel mouths do not push masts out', CORE, 'const nearMouth = (p: Pt): boolean => mouths.some(m => Math.hypot(p[0] - m[0], p[1] - m[1]) < OLE.mouthReach);', 'const nearMouth = (p: Pt): boolean => false;'),
    ('all open tracks share one portal', CORE, 'if (g && c.u - g.at(-1)!.u <= OLE.groupGap) g.push(c); else groups.push([c]);', 'if (g) g.push(c); else groups.push([c]);'),
    ('every open track gets its own portal', CORE, 'if (g && c.u - g.at(-1)!.u <= OLE.groupGap) g.push(c); else groups.push([c]);', 'groups.push([c]);'),
    ('long booms take no middle mast', CORE, 'if (east - west > OLE.maxBoom) {', 'if (false) {'),
    ('portals have no boom', CORE, "members.push({ a: [wp[0], boomY, wp[1]], b: [ep[0], boomY, ep[1]], size: OLE.boomSize, kind: 'boom' });", ''),
    ('portal drop tubes omitted', CORE, "members.push({ a: [c.wx, boomY - OLE.boomSize / 2, c.wz], b: [c.wx, y, c.wz], size: OLE.tubeSize, kind: 'tube' });", ''),
    ('portal registration arms omitted', CORE, "        members.push({ a: [c.wx, y, c.wz], b: [c.wx, C + 0.05, c.wz], size: OLE.tubeSize * 0.6, kind: 'arm' });\n      }\n    }\n  }\n  return", '      }\n    }\n  }\n  return'),
    ('masts omitted from the members', CORE, "members.push({ a: [p[0], -0.2, p[1]], b: [p[0], boomY + OLE.boomSize / 2, p[1]], size: OLE.mastSize, kind: 'mast' });", ''),
    # The drawing.
    ('wire alpha loses its gain', WEB, 'return Math.max(0, Math.min(1, (OLE_WIRE.width / pixel) * OLE_WIRE.gain));', 'return Math.max(0, Math.min(1, OLE_WIRE.width / pixel));'),
    ('wire alpha is not capped', WEB, 'return Math.max(0, Math.min(1, (OLE_WIRE.width / pixel) * OLE_WIRE.gain));', 'return Math.max(0, (OLE_WIRE.width / pixel) * OLE_WIRE.gain);'),
    ('wire alpha ignores the field of view', WEB, 'const pixel = (2 * distance * Math.tan(fovY / 2)) / heightPx;', 'const pixel = (2 * distance * Math.tan(fovY)) / heightPx;'),
    ('wire alpha ignores the screen height', WEB, 'const pixel = (2 * distance * Math.tan(fovY / 2)) / heightPx;', 'const pixel = (2 * distance * Math.tan(fovY / 2)) / 1080;'),
    ('member box has an open end', WEB, '  quad(B[0]!, B[1]!, B[2]!, B[3]!);\n', ''),
    ('member box has the wrong size', WEB, '.multiplyScalar(m.size / 2);\n  const t', '.multiplyScalar(m.size);\n  const t'),
    ('member cross-section is not square', WEB, 'const t = new THREE.Vector3().crossVectors(d, s).normalize().multiplyScalar(m.size / 2);', 'const t = new THREE.Vector3().crossVectors(d, s).normalize().multiplyScalar(m.size / 4);'),
    ('tunnel mouths are not passed to the plan', WEB, 'data, layout, mouths,\n', 'data, layout, mouths: [],\n'),
    ('plan is not limited to the station zone', WEB, 'inZone: (x, z) => inStationZone(layout, x, z),', 'inZone: () => true,'),
    ('plan has no roof to hang from', WEB, 'roofY: (u) => shedRoofY(layout, u),', 'roofY: undefined,'),
    ('plan has no arches', WEB, "arches: [0, 1].map(k => [layout.aisle + k * SHED_SPAN_WIDTH, layout.aisle + (k + 1) * SHED_SPAN_WIDTH] as [number, number]),", 'arches: [],'),
    ('cross-span wires are not drawn', WEB, 'wireLines([...plan.wires, ...plan.spans])', 'wireLines([...plan.wires])'),
    ('steel is not drawn', WEB, 'for (const m of plan.members) memberTriangles(m, positions);', ''),
    ('wires are not drawn', WEB, 'if (plan.wires.length) group.add(wireLines([...plan.wires, ...plan.spans]));', ''),
]

tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'ole') as work:
    suite = kxmut.Suite(work, test_timeout_ms=30000, timeout=90)
    baseline = suite.baseline(TESTS)
    for label, file, old, new in MUTATIONS:
        try:
            with kxmut.mutated(work / file, [(old, new)], unique=True):
                verdict, _run = suite.judge(TESTS, strict='any')
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
unseen = baseline.passed - tally.red
print(f'{len(baseline.passed) - len(unseen)}/{len(baseline.passed)} tests observed failing')
for name in sorted(unseen):
    print('  NEVER FAILED:', name)
sys.exit(1 if status or unseen else 0)
