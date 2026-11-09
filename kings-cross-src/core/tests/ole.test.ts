// The OLE layout rules on synthetic track: what is wired, the wire heights, stagger and sag, where
// supports stand, and the tunnel-mouth taper. web/tests/ole.test.ts runs the same plan on the real OSM data.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KxData, Rail } from '../osm.ts';
import { catenaryAt, distanceToSegment, OLE, OLE_SOURCES, olePlan, staggerAt, supportVs, systemHeightAt, wiredSegments } from '../ole.ts';

// A frame with heading 0: u = x - 0, v = -(z - 0). Tracks run north (towards -z).
const layout = { origin: [0, 0] as [number, number], heading: 0, width: 40, length: 100 };
const everywhere = (): boolean => true;
const rail = (id: number, nodes: number[], extra: Partial<Rail> = {}): Rail =>
  ({ id, nodes, service: 'main', tunnel: false, bridge: false, layer: 0, electrified: 'contact_line', ...extra });
/** n parallel tracks `gap` apart from x0, running from v = 0 to v = 300 */
function parallel(n: number, gap = 4.5, x0 = 10, extra: Partial<Rail> = {}): Pick<KxData, 'nodes' | 'rails'> {
  return tracksAt(Array.from({ length: n }, (_, i) => x0 + i * gap), extra);
}
function tracksAt(xs: number[], extra: Partial<Rail> = {}): Pick<KxData, 'nodes' | 'rails'> {
  const nodes: [number, number, number][] = [];
  const rails: Rail[] = [];
  for (const [i, x] of xs.entries()) {
    nodes.push([i * 10 + 1, x, 0], [i * 10 + 2, x, -150], [i * 10 + 3, x, -300]);
    rails.push(rail(i + 1, [i * 10 + 1, i * 10 + 2, i * 10 + 3], extra));
  }
  return { nodes, rails };
}
const segs = (wires: number[]): number[][] => Array.from({ length: wires.length / 6 }, (_, i) => wires.slice(i * 6, i * 6 + 6));

test('ole: only surface ways tagged electrified=contact_line inside the zone are wired', () => {
  const data = parallel(3);
  data.rails[0] = { ...data.rails[0]!, electrified: 'no' };
  data.rails[1] = { ...data.rails[1]!, tunnel: true };
  const wired = wiredSegments({ data, layout, inZone: everywhere });
  assert.equal(wired.length, 2, 'only the third track: two segments');
  assert.ok(wired.every(s => s.a[0] === 19 && s.b[0] === 19));
  assert.equal(wiredSegments({ data, layout, inZone: (_x, z) => z > -150 }).length, 1, 'a segment outside the zone is not wired');
  const plan = olePlan({ data, layout, inZone: everywhere });
  for (const w of segs(plan.wires)) assert.ok(Math.abs(w[0]! - 19) <= OLE.stagger + 1e-9 && Math.abs(w[3]! - 19) <= OLE.stagger + 1e-9);
  assert.deepEqual(olePlan({ data: parallel(2, 4.5, 10, { electrified: 'no' }), layout, inZone: everywhere }).wires, []);
  // the zone is judged at the middle of a segment, not at its first node
  const long = { nodes: [[1, 10, 0], [2, 10, -300]] as [number, number, number][], rails: [rail(1, [1, 2])] };
  assert.equal(wiredSegments({ data: long, layout, inZone: (_x, z) => z < -100 && z > -250 }).length, 1, 'wired for its middle, though both ends are outside');
  assert.equal(wiredSegments({ data: long, layout, inZone: (_x, z) => z > -100 }).length, 0, 'not wired for its first node alone');
});

test('ole: the contact wire is level at 4.7 m; the catenary is the system height above it at a support and sags between', () => {
  assert.equal(OLE.contactHeight, 4.7);
  const plan = olePlan({ data: parallel(2), layout, inZone: everywhere });
  const wires = segs(plan.wires);
  const contact = wires.filter(w => w[1] === OLE.contactHeight && w[4] === OLE.contactHeight);
  assert.equal(contact.length, plan.counts.contact);
  for (const w of wires) for (const y of [w[1]!, w[4]!]) {
    assert.ok(y >= OLE.contactHeight - 1e-9 && y <= OLE.contactHeight + OLE.systemHeight + 1e-9, `${y}`);
  }
  assert.ok(Math.abs(catenaryAt(OLE.firstV, OLE.systemHeight) - OLE.systemHeight) < 1e-9, 'full height at a support');
  assert.ok(Math.abs(catenaryAt(OLE.firstV + OLE.span / 2, OLE.systemHeight) - OLE.systemHeight * (1 - OLE.sag)) < 1e-9, 'lowest mid-span');
  assert.ok(catenaryAt(OLE.firstV + OLE.span * 0.3, 1) > catenaryAt(OLE.firstV + OLE.span * 0.45, 1));
  assert.equal(plan.counts.droppers > 0, true);
  const vertical = wires.filter(w => w[0] === w[3] && w[2] === w[5]);
  assert.equal(vertical.length, plan.counts.droppers, 'every dropper is vertical, and only droppers are');
  for (const w of vertical) assert.ok(w[1] === OLE.contactHeight && w[4]! > w[1]!, 'contact up to catenary');
});

test('ole: the contact wire zig-zags +stagger and -stagger at alternate supports and never strays further', () => {
  assert.equal(OLE.stagger, 0.23, 'Rail Engineer, "A bad wire day": up to 230 mm on straight track');
  assert.match(OLE_SOURCES.stagger, /230 mm/);
  assert.match(OLE_SOURCES.height, /4700mm/);
  assert.match(OLE_SOURCES.span, /NOT FOUND/, 'an unsourced figure says so');
  for (let k = 0; k < 6; k++) assert.ok(Math.abs(staggerAt(OLE.firstV + k * OLE.span) - (k % 2 ? -1 : 1) * OLE.stagger) < 1e-9);
  for (let v = 0; v < 400; v += 3.7) assert.ok(Math.abs(staggerAt(v)) <= OLE.stagger + 1e-9);
  assert.ok(Math.abs(staggerAt(OLE.firstV + OLE.span / 2)) < 1e-9, 'on the centre line mid-span');
  const plan = olePlan({ data: parallel(1), layout, inZone: everywhere });
  const xs = segs(plan.wires).slice(0, plan.counts.contact * 2).flatMap(w => [w[0]!, w[3]!]);
  assert.ok(Math.max(...xs) - 10 > OLE.stagger - 1e-9 && 10 - Math.min(...xs) > OLE.stagger - 1e-9, 'both sides reached');
});

test('ole: supports stand on a cross line every span; every wired track crossing a line is held there', () => {
  const data = parallel(4);
  const vs = supportVs(wiredSegments({ data, layout, inZone: everywhere }));
  assert.equal(vs[0], OLE.firstV);
  for (let i = 1; i < vs.length; i++) assert.equal(vs[i]! - vs[i - 1]!, OLE.span);
  assert.ok(300 - vs.at(-1)! < OLE.span);
  // a wire that ends exactly on a cross line gets no support there: the lines run to the end, not onto it
  const ending = (v: number) => [{ a: [0, 0] as [number, number], b: [0, -v] as [number, number], ua: 0, va: 0, ub: 0, vb: v }];
  assert.deepEqual(supportVs(ending(OLE.firstV + OLE.span)), [OLE.firstV]);
  assert.deepEqual(supportVs(ending(OLE.firstV + OLE.span + 1)), [OLE.firstV, OLE.firstV + OLE.span]);
  const plan = olePlan({ data, layout, inZone: everywhere, roofY: () => 20 });
  for (const line of plan.lines) {
    assert.equal(line.crossings.length, 4, `v ${line.v}`);
    for (const c of line.crossings) {
      const held = plan.members.filter(m => m.kind === 'arm' && Math.hypot(m.a[0] - c.wx, m.a[2] - c.wz) < 1e-9);
      assert.equal(held.length, 1, 'one registration under each wire');
      assert.ok(Math.abs(held[0]!.b[1] - (OLE.contactHeight + 0.05)) < 1e-9);
    }
  }
});

test('ole: under the shed no mast stands, every wire is hung from the roof above it and stays under the roof', () => {
  assert.ok(OLE.roofClearance > 0, 'the wires keep clear of the roof');
  const roof = (u: number): number => (u < 20 ? 5.9 : 12); // a low strip, as at the shed's valley
  const plan = olePlan({ data: parallel(4, 4.5, 14), layout, inZone: everywhere, roofY: roof });
  const shedLines = plan.lines.filter(l => l.inShed);
  assert.ok(shedLines.length >= 2);
  for (const l of shedLines) assert.deepEqual(l.masts, [], `no mast at v ${l.v}`);
  for (const m of plan.members.filter(m => m.kind === 'mast')) assert.ok(-m.a[2] > layout.length, 'masts only north of the shed');
  for (const w of segs(plan.wires)) for (const [x, y, z] of [[w[0]!, w[1]!, w[2]!], [w[3]!, w[4]!, w[5]!]]) {
    if (-z > 0 && -z < layout.length && x >= 0 && x <= layout.width) assert.ok(y <= roof(x) - OLE.roofClearance + 1e-9 || y === OLE.contactHeight, `${x},${y},${z}`);
  }
  const tubes = plan.members.filter(m => m.kind === 'tube' && -m.a[2] < layout.length);
  assert.equal(tubes.length, shedLines.length * 4);
  for (const t of tubes) assert.equal(t.a[1], roof(t.a[0]), 'a drop tube starts at the roof');
});

test('ole: under an arch a cross-span wire runs rib to rib above the catenaries, with one hanger to each; no drop tube', () => {
  // one arch over u 0..40, crown 20 m: roof = 4 + sqrt(20^2 - (u - 20)^2)
  const roof = (u: number): number => 4 + Math.sqrt(Math.max(0, 400 - (u - 20) ** 2));
  const plan = olePlan({ data: parallel(4, 4.5, 12), layout, inZone: everywhere, roofY: roof, arches: [[0, 40]] });
  const shedLines = plan.lines.filter(l => l.inShed);
  assert.equal(plan.spanCounts.crossSpans, shedLines.length);
  assert.equal(plan.spanCounts.hangers, shedLines.length * 4);
  assert.equal(plan.members.filter(m => m.kind === 'tube' && -m.a[2] < layout.length).length, 0);
  const spans = segs(plan.spans);
  for (const s of spans.filter(s => s[1] !== s[4] || s[0] !== s[3])) {
    if (s[0] === s[3] && s[2] === s[5]) continue; // a hanger
    for (const [x, y] of [[s[0]!, s[1]!], [s[3]!, s[4]!]]) assert.ok(Math.abs(y - roof(x)) < 1e-6, 'a cross-span ends on the arch');
    assert.ok(Math.abs(s[1]! - s[4]!) < 1e-6, 'level across the arch');
    assert.ok(s[1]! >= OLE.contactHeight + OLE.systemHeight + OLE.crossSpanClearance - 1e-6);
  }
  const hangers = spans.filter(s => s[0] === s[3] && s[2] === s[5]);
  for (const h of hangers) assert.ok(h[1]! > h[4]! && Math.abs(h[4]! - (OLE.contactHeight + OLE.systemHeight)) < 1e-6, 'a hanger drops to the catenary at the support');
  // the cross-span stands clear above the highest catenary it carries: that one's hanger is exactly the clearance long
  assert.ok(OLE.crossSpanClearance > 0);
  assert.ok(Math.abs(Math.min(...hangers.map(h => h[1]! - h[4]!)) - OLE.crossSpanClearance) < 1e-6, 'the cross-span clears the highest catenary by the clearance');
});

test('ole: in the open each group gets a portal with masts clear of every rail and signal; a long boom takes a middle mast', () => {
  assert.ok(OLE.mastClearance > 1.5, 'a mast stands beyond the half-width of a vehicle (about 1.4 m)');
  assert.ok(OLE.boomClearance > 0, 'the boom stands clear above the catenary');
  // ten tracks over 42 m, 4.5 m apart but for one 6 m gap a mast can stand in
  const xs = [0, 4.5, 9, 13.5, 18, 24, 28.5, 33, 37.5, 42];
  const data = { ...tracksAt(xs), signals: [] as KxData['signals'] };
  const plan = olePlan({ data, layout, inZone: everywhere });
  const open = plan.lines.filter(l => !l.inShed);
  assert.ok(open.length >= 3);
  const rails = data.rails.map(r => [data.nodes.find(n => n[0] === r.nodes[0])!, data.nodes.find(n => n[0] === r.nodes.at(-1))!]);
  for (const l of open) {
    assert.ok(l.masts.length >= 3, `a 40 m spread needs a middle mast: ${l.masts.length}`);
    for (const p of l.masts) for (const [a, b] of rails) assert.ok(distanceToSegment(p, [a[1], a[2]], [b[1], b[2]]) >= OLE.mastClearance - 1e-9);
    const at = l.masts.map(p => p[0]).sort((a, b) => a - b);
    assert.deepEqual(at.slice(1, -1), [21], 'the middle mast stands in the one gap wide enough');
    assert.ok(at[0]! <= -OLE.mastClearance && at.at(-1)! >= 42 + OLE.mastClearance, 'the end masts stand outside the outer tracks');
  }
  // every mast on a line is a steel mast from the ground, and every wire in the open hangs from its boom by a drop tube
  const masts = open.flatMap(l => l.masts);
  const steel = plan.members.filter(m => m.kind === 'mast');
  assert.equal(steel.length, plan.lines.flatMap(l => l.masts).length, 'one steel mast for every mast on a line');
  for (const p of masts) {
    const m = steel.filter(s => s.a[0] === p[0] && s.a[2] === p[1]);
    assert.equal(m.length, 1, `a steel mast at ${p}`);
    assert.ok(m[0]!.a[1] < 0 && m[0]!.b[1] > OLE.contactHeight + OLE.systemHeight, 'it stands from the ground to above the boom');
  }
  for (const l of open) for (const c of l.crossings) {
    const tubes = plan.members.filter(m => m.kind === 'tube' && m.a[0] === c.wx && m.a[2] === c.wz);
    assert.equal(tubes.length, 1, `one drop tube to the wire at u ${c.u}`);
    assert.ok(tubes[0]!.a[1] > tubes[0]!.b[1] && tubes[0]!.b[1] > OLE.contactHeight, 'it hangs from the boom down to the catenary');
    assert.ok(Math.abs(tubes[0]!.a[1] - tubes[0]!.b[1] - OLE.boomClearance) < 1e-9, 'the boom stands the clearance above the catenary');
  }
  // a signal in the way pushes the mast outward
  const first = open[0]!, west = first.masts[0]!;
  const blocked = olePlan({ data: { ...data, signals: [{ id: 1, x: west[0], z: west[1], kinds: [] }] as KxData['signals'] }, layout, inZone: everywhere });
  const moved = blocked.lines.find(l => l.v === first.v)!.masts[0]!;
  assert.ok(Math.hypot(moved[0] - west[0], moved[1] - west[1]) >= 1.5);
  // groups split at a wide gap: two portals, four end masts
  const apart = { nodes: [...parallel(2, 4.5, 0).nodes, ...parallel(2, 4.5, 60).nodes.map(([id, x, z]) => [id + 100, x, z] as [number, number, number])],
    rails: [...parallel(2, 4.5, 0).rails, ...parallel(2, 4.5, 60).rails.map(r => ({ ...r, id: r.id + 100, nodes: r.nodes.map(n => n + 100) }))] };
  const split = olePlan({ data: apart, layout, inZone: everywhere });
  assert.equal(split.lines.find(l => !l.inShed)!.masts.length, 4);
  assert.equal(split.members.filter(m => m.kind === 'boom').length, split.lines.filter(l => !l.inShed).length * 2);
  // the way data lists them in no particular order: the groups come from the tracks' places across the line, not their order
  const shuffled = olePlan({ data: { nodes: apart.nodes, rails: [apart.rails[3]!, apart.rails[0]!, apart.rails[2]!, apart.rails[1]!] }, layout, inZone: everywhere });
  assert.deepEqual(shuffled.lines, split.lines);
});

test('ole: near a tunnel mouth the system height tapers to the minimum and masts stand further out', () => {
  assert.ok(Math.abs(systemHeightAt([0, 0], [[0, 0]]) - OLE.minSystemHeight) < 1e-9);
  assert.equal(systemHeightAt([0, 0], []), OLE.systemHeight);
  assert.equal(systemHeightAt([0, 0], [[OLE.mouthReach, 0]]), OLE.systemHeight);
  assert.ok(systemHeightAt([0, 0], [[OLE.mouthReach / 2, 0]]) < OLE.systemHeight);
  const data = parallel(2);
  const mouth: [number, number] = [12, -300];
  const plan = olePlan({ data, layout, inZone: everywhere, mouths: [mouth] });
  for (const w of segs(plan.wires)) for (const [x, y, z] of [[w[0]!, w[1]!, w[2]!], [w[3]!, w[4]!, w[5]!]]) {
    if (Math.hypot(x - mouth[0], z - mouth[1]) < 3) assert.ok(y <= OLE.contactHeight + OLE.minSystemHeight + 0.05, `catenary ${y} m at the mouth`);
  }
  const near = plan.lines.filter(l => !l.inShed && Math.hypot(l.crossings[0]!.x - mouth[0], l.crossings[0]!.z - mouth[1]) < OLE.mouthReach);
  assert.ok(near.length >= 1);
  for (const l of near) for (const p of l.masts) assert.ok(Math.min(Math.abs(p[0] - 10), Math.abs(p[0] - 14.5)) >= OLE.mouthClearance - 1e-9);
});

test('ole: every tunnel mouth counts, in whatever order they are given', () => {
  assert.ok(OLE.mouthClearance > OLE.mastClearance, 'masts stand further out at a mouth');
  const data = parallel(2);
  const mouth: [number, number] = [12, -300];
  const alone = olePlan({ data, layout, inZone: everywhere, mouths: [mouth] });
  assert.notDeepEqual(alone, olePlan({ data, layout, inZone: everywhere }), 'the mouth changes the plan');
  assert.deepEqual(olePlan({ data, layout, inZone: everywhere, mouths: [[5000, 5000], mouth] }), alone, 'a far mouth listed first changes nothing');
});

test('ole: a way that repeats a node wires only its real segments, and every wire coordinate is finite', () => {
  const data = { nodes: [[1, 10, 0], [2, 10, 0], [3, 10, -150], [4, 10, -300]] as [number, number, number][], rails: [rail(1, [1, 2, 3, 4])] };
  assert.equal(wiredSegments({ data, layout, inZone: everywhere }).length, 2, 'the zero-length segment between the repeated nodes is not wired');
  const plan = olePlan({ data, layout, inZone: everywhere });
  assert.ok(plan.wires.length > 0 && plan.wires.every(Number.isFinite), 'a zero-length direction would leave NaN in the wires');
  assert.ok(plan.lines.every(l => l.crossings.every(c => Number.isFinite(c.wx) && Number.isFinite(c.wz))));
});

test('ole: every wire is cut at each cross line, so the zig-zag reaches its full stagger and the catenary its full height at each support', () => {
  // a track from v = 4: its dropper points (4 + 9k) never land on a cross line (27 + 45k), so only the cut puts a vertex there
  const data = { nodes: [[1, 10, -4], [2, 10, -300]] as [number, number, number][], rails: [rail(1, [1, 2])] };
  const plan = olePlan({ data, layout, inZone: everywhere });
  const vs = supportVs(wiredSegments({ data, layout, inZone: everywhere }));
  assert.ok(vs.length >= 5);
  const ends = segs(plan.wires).flatMap(w => [[w[0]!, w[1]!, w[2]!], [w[3]!, w[4]!, w[5]!]]);
  for (const v of vs) {
    const at = ends.filter(([, , z]) => Math.abs(-z! - v) < 1e-9);
    assert.ok(at.length >= 4, `v ${v}: the contact wire and the catenary each end and restart at the support`);
    for (const [x, y] of at) {
      assert.ok(Math.abs(x! - (10 + staggerAt(v))) < 1e-9, `v ${v}: full stagger at the support, x ${x}`);
      assert.ok(Math.abs(y! - OLE.contactHeight) < 1e-9 || Math.abs(y! - (OLE.contactHeight + OLE.systemHeight)) < 1e-9, `v ${v}: y ${y}`);
    }
  }
});

test('ole: a node exactly on a cross line is one crossing, held once', () => {
  // the middle node stands on the first cross line, so both of its segments meet the line at that one point
  const data = { nodes: [[1, 10, -4], [2, 10, -OLE.firstV], [3, 10, -200]] as [number, number, number][], rails: [rail(1, [1, 2, 3])] };
  const plan = olePlan({ data, layout, inZone: everywhere });
  const first = plan.lines.find(l => l.v === OLE.firstV)!;
  assert.equal(first.crossings.length, 1, 'one track, one crossing');
  const c = first.crossings[0]!;
  const at = (kind: string): number => plan.members.filter(m => m.kind === kind && Math.hypot(m.a[0] - c.wx, m.a[2] - c.wz) < 1e-9).length;
  assert.equal(at('arm'), 1, 'one registration arm');
  assert.equal(at('tube'), 1, 'one drop tube');
});
