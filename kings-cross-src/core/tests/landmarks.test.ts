// core/landmarks.ts: the numbers behind the Great Northern Hotel, the Midland Grand, the Barlow shed and the
// tunnel portals. The figures are checked against the sources named in that file's header ([HE-GNH], [HE-STP],
// [WP-STP], [WP-MGH], [WP-GAS], [WP-COP]) and against the real OSM extract.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Pt } from '../geo.ts';
import type { KxData } from '../osm.ts';
import {
  allocateBays,
  approachEnvelope,
  archOpening,
  area2,
  barlowHeight,
  barlowPlan,
  barlowSection,
  chainBays,
  edgeDepth,
  fitRoofRuns,
  FIGURES,
  greatNorthernHotelPlan,
  insetPolygon,
  insetPolygonRuns,
  lateralRange,
  longestStraightRun,
  midlandGrandPlan,
  OSM_IDS,
  polygonEdges,
  REPLACED_BUILDING_IDS,
  ringSelfIntersects,
  safeInset,
  splitAtCorners,
  stPancrasHeading,
  tunnelCover,
  tunnelMouths,
  tunnelRuns,
} from '../landmarks.ts';
import { pointInPolygon, stationBuilding, worldToShed } from '../station.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const centroid = (pts: readonly Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const building = (id: number) => {
  const b = data.buildings.find((x) => x.id === id);
  assert.ok(b, `building ${id} is in the data`);
  return b;
};

// ---- polygon helpers ---------------------------------------------------------------------------

const RECT: Pt[] = [[0, 0], [20, 0], [20, 10], [0, 10]];

test('polygonEdges: every normal points out of the polygon, whichever way it is wound', () => {
  for (const ring of [RECT, [...RECT].reverse()]) {
    for (const e of polygonEdges(ring)) {
      assert.equal(pointInPolygon([e.mid[0] + e.normal[0] * 0.5, e.mid[1] + e.normal[1] * 0.5], ring), false, 'just outside the edge is outside');
      assert.equal(pointInPolygon([e.mid[0] - e.normal[0] * 0.5, e.mid[1] - e.normal[1] * 0.5], ring), true, 'just inside the edge is inside');
    }
  }
});

test('allocateBays: the shares add up to the total and follow the lengths', () => {
  assert.deepEqual(allocateBays([10, 5, 5], 8), [4, 2, 2]);
  for (const [lengths, total] of [[[7.3, 12.9, 3.1], 23], [[1, 1, 1], 10], [[50.5], 18], [[0.5, 40, 0.5], 5]] as const) {
    const got = allocateBays(lengths, total);
    assert.equal(got.reduce((s, x) => s + x, 0), total, `${lengths} -> ${got}`);
  }
  assert.deepEqual(allocateBays([0, 0], 4), [0, 0]);
});

test('chainBays: bays are centred in equal shares of each edge, as wide as the share', () => {
  const edges = polygonEdges([[0, 0], [30, 0], [30, 10], [0, 10]]).slice(0, 2); // 30 m then 10 m
  const bays = chainBays(edges, 8);
  assert.equal(bays.length, 8);
  assert.equal(bays.filter((b) => b.edge === 0).length, 6);
  close(bays[0]?.width ?? 0, 5, 1e-9, 'width on the 30 m edge');
  close(bays[0]?.at[0] ?? 0, 2.5, 1e-9, 'first bay centre');
  close(bays[5]?.at[0] ?? 0, 27.5, 1e-9, 'sixth bay centre');
  close(bays[6]?.width ?? 0, 5, 1e-9, 'width on the 10 m edge');
});

test('splitAtCorners: a rectangle has four runs; a gently bent run is one', () => {
  assert.deepEqual(splitAtCorners(RECT).map((c) => c.length).sort((a, b) => a - b), [10, 10, 20, 20]);
  // a half-ring of 12 short facets (15 degrees apiece) closed by a straight back
  const arc: Pt[] = Array.from({ length: 13 }, (_, k) => [30 * Math.cos((Math.PI * k) / 12), -30 * Math.sin((Math.PI * k) / 12)]);
  const chains = splitAtCorners(arc);
  assert.equal(chains.length, 2, 'the curved front and the straight back');
  const curved = chains.find((c) => c.edges.length === 12);
  assert.ok(curved, 'the 12 facets stay together');
});

test('longestStraightRun: picks the longest run by total length, not the single longest edge', () => {
  // the longest single edge is 20 m (the bottom); the top is four 7 m edges in a line: 28 m
  const pts: Pt[] = [[0, 0], [20, 0], [20, 10], [13, 10], [6, 10], [-1, 10], [-8, 10], [-8, 3]];
  const run = longestStraightRun(pts, 10);
  assert.equal(run.start, 2);
  assert.equal(run.edges.length, 4);
  close(run.length, 28, 1e-9, 'run length');
  close(run.edges.reduce((s, e) => s + e.length, 0), run.length, 1e-9, 'reported length is the sum');
});

test('safeInset: insets a rectangle exactly, and backs off when the ring would fold over', () => {
  const ok = safeInset(RECT, 3);
  assert.equal(ok.inset, 3);
  assert.deepEqual(ok.ring.map(([x, z]) => [Math.round(x), Math.round(z)]), [[3, 3], [17, 3], [17, 7], [3, 7]]);
  const tight = safeInset(RECT, 8); // 10 m wide: an 8 m inset would invert
  assert.ok(tight.inset < 5, `inset reduced to ${tight.inset}`);
  assert.equal(ringSelfIntersects(tight.ring), false);
  assert.ok(Math.sign(area2(tight.ring)) === Math.sign(area2(RECT)), 'same winding as the outline');
  assert.deepEqual(insetPolygon(RECT, 0).map(([x, z]) => [x, z]), RECT.map(([x, z]) => [x, z]));
});

// ---- identities and the Great Northern Hotel ---------------------------------------------------

test('the three replaced buildings are the ones named in OSM', () => {
  assert.equal(building(OSM_IDS.greatNorthernHotel).name, 'Great Northern Hotel');
  assert.equal(building(OSM_IDS.midlandGrandHotel).name, 'St Pancras Renaissance London Hotel');
  assert.equal(building(OSM_IDS.stPancrasStation).name, 'St Pancras International Station');
  assert.deepEqual([...REPLACED_BUILDING_IDS].sort(), [OSM_IDS.greatNorthernHotel, OSM_IDS.midlandGrandHotel, OSM_IDS.stPancrasStation].sort());
});

test('Great Northern Hotel [HE-GNH]: 18 bays on the concave front, 5 on the southern return, 5 storeys', () => {
  const plan = greatNorthernHotelPlan(data);
  const by = Object.fromEntries(plan.faces.map((f) => [f.kind, f]));
  assert.deepEqual(plan.faces.map((f) => f.kind), ['main', 'rear', 'return', 'end']);
  assert.equal(by.main?.bays.length, 18);
  assert.equal(by.return?.bays.length, 5);
  assert.equal(plan.storeys, 5);
  assert.equal(building(OSM_IDS.greatNorthernHotel).levels, 5, 'OSM agrees on the storeys');
  // the bays tile their chain
  for (const f of plan.faces) close(f.bays.reduce((s, b) => s + b.width, 0), f.chain.length, 1e-6, `${f.kind} bays fill the chain`);
  // a bay is about 2.8 m, the same on the front and the rear
  const mean = (kind: 'main' | 'rear'): number => (by[kind]?.chain.length ?? 0) / (by[kind]?.bays.length ?? 1);
  assert.ok(mean('main') > 2.5 && mean('main') < 3.2, `bay width ${mean('main')}`);
  close(mean('rear'), mean('main'), 0.4, 'rear bay width');
});

test('Great Northern Hotel: the main front is the concave one and faces King\'s Cross; the rear faces away', () => {
  const plan = greatNorthernHotelPlan(data);
  const station = stationBuilding(data);
  assert.ok(station, 'the station building is in the data');
  const target = centroid(station.pts);
  const main = plan.faces.find((f) => f.kind === 'main');
  const rear = plan.faces.find((f) => f.kind === 'rear');
  assert.ok(main && rear);
  assert.ok(main.chain.turning < 0 && rear.chain.turning > 0, 'concave front, convex rear');
  for (const b of main.bays) assert.ok((target[0] - b.at[0]) * b.normal[0] + (target[1] - b.at[1]) * b.normal[1] > 0, 'main front looks at the station');
  for (const b of rear.bays) assert.ok((target[0] - b.at[0]) * b.normal[0] + (target[1] - b.at[1]) * b.normal[1] < 0, 'rear looks away');
  // every bay stands on the wall and faces out of the building
  for (const f of plan.faces) for (const b of f.bays) {
    assert.equal(pointInPolygon([b.at[0] + b.normal[0] * 0.3, b.at[1] + b.normal[1] * 0.3], plan.outline), false);
    assert.equal(pointInPolygon([b.at[0] - b.normal[0] * 0.3, b.at[1] - b.normal[1] * 0.3], plan.outline), true);
  }
});

test('Great Northern Hotel: heights follow the storeys, and the roof ring sits inside the walls', () => {
  const plan = greatNorthernHotelPlan(data);
  close(plan.eaves, FIGURES.gnh.groundStorey + 4 * FIGURES.gnh.upperStorey, 1e-9, 'eaves');
  close(plan.ridge - plan.eaves, FIGURES.gnh.roofRise, 1e-9, 'roof rise');
  assert.ok(plan.roof.inset > 1, `roof inset ${plan.roof.inset}`);
  for (const p of plan.roof.ring) assert.equal(pointInPolygon(p, plan.outline), true, 'ring inside');
});

// ---- the Midland Grand -------------------------------------------------------------------------

test('Midland Grand [HE-STP]: 23 bays on the front, a 10 bay curved wing, towers flank the front', () => {
  const plan = midlandGrandPlan(data);
  assert.equal(plan.front.bays.length, 23);
  assert.equal(plan.wing.bays.length, 10);
  assert.ok(plan.front.length > 115 && plan.front.length < 126, `front ${plan.front.length} m`);
  close(plan.front.bays.reduce((s, b) => s + b.width, 0), plan.front.length, 1e-6, 'front bays fill the front');
  for (const b of plan.front.bays) assert.ok(b.width > 2 && b.width < 9, `front bay ${b.width} m wide`);
  assert.equal(plan.towers.length, 2);
  const clock = plan.towers.find((t) => t.name === 'clock');
  const west = plan.towers.find((t) => t.name === 'west');
  assert.ok(clock && west);
  // 240 ft: Simon Bradley, St Pancras Station (Profile Books, 2007), "240-foot (72-metre) high clock tower" [BR-STP], with the 1870s account (240 ft); Wikipedia
  // [WP-MGH] says 76 m, exploring-london.com 82 m and gilbertscott.org 280 ft. The sources disagree, so the test holds the model to the one figure it takes (73 m,
  // 240 ft to the metre) and to the published range.
  assert.equal(clock.height, 73, 'clock tower 73 m');
  assert.ok(Math.abs(clock.height - 240 * 0.3048) < 0.5, 'which is 240 ft');
  assert.ok(clock.height >= 72 && clock.height <= 86, 'inside the published 72 to 86 m range');
  assert.ok(west.height < clock.height, 'the west tower is the lower');
  assert.ok(clock.centre[0] > west.centre[0], 'the clock tower is at the east end');
  assert.ok(clock.out[1] > 0.5, 'the front faces south, to Euston Road');
});

test('Midland Grand: each tower stands on the front, 0.3 m proud, with its back inside the building', () => {
  const plan = midlandGrandPlan(data);
  for (const t of plan.towers) {
    const h = t.side / 2;
    const frontMid: Pt = [t.centre[0] + t.out[0] * h, t.centre[1] + t.out[1] * h];
    // distance in front of the nearest front wall
    let best = Infinity;
    for (const e of plan.front.edges) {
      const along = (frontMid[0] - e.a[0]) * e.dir[0] + (frontMid[1] - e.a[1]) * e.dir[1];
      if (along < -1 || along > e.length + 1) continue;
      const proud = (frontMid[0] - e.a[0]) * e.normal[0] + (frontMid[1] - e.a[1]) * e.normal[1];
      if (Math.abs(proud) < Math.abs(best)) best = proud;
    }
    assert.ok(best > 0.1 && best < 0.5, `${t.name} tower is ${best} m proud of the front`);
    for (const [a, b] of [[-1, -1], [1, -1]]) {
      const back: Pt = [t.centre[0] + t.along[0] * a * h + t.out[0] * b * h, t.centre[1] + t.along[1] * a * h + t.out[1] * b * h];
      assert.equal(pointInPolygon(back, plan.outline), true, `${t.name} tower back corner inside the outline`);
    }
  }
  const [a, b] = plan.towers;
  assert.ok(a && b && Math.hypot(a.centre[0] - b.centre[0], a.centre[1] - b.centre[1]) > (a.side + b.side) / 2, 'towers do not overlap');
});

// ---- the Midland Grand's roof: a pitch of its own for every facet ----------------------------------

test('insetPolygonRuns: each edge is offset by its own run, and equal runs are the plain inset', () => {
  const ring = insetPolygonRuns(RECT, [2, 3, 2, 3]);
  assert.deepEqual(ring.map(([x, z]) => [Math.round(x * 1e6) / 1e6, Math.round(z * 1e6) / 1e6]), [[3, 2], [17, 2], [17, 8], [3, 8]], 'edge 0 (z = 0) and edge 2 (z = 10) in by 2, edges 1 and 3 in by 3');
  const same = insetPolygonRuns(RECT, [3, 3, 3, 3]);
  const plain = insetPolygon(RECT, 3);
  same.forEach((p, i) => {
    close(p[0], plain[i]?.[0] ?? NaN, 1e-9, `x${i}`);
    close(p[1], plain[i]?.[1] ?? NaN, 1e-9, `z${i}`);
  });
  // wound the other way (top, right, bottom, left now) it is the same ring, listed in the other order
  const back = insetPolygonRuns([...RECT].reverse(), [2, 3, 2, 3]);
  assert.deepEqual(back.map(([x, z]) => [Math.round(x * 1e6) / 1e6, Math.round(z * 1e6) / 1e6]), [[3, 8], [17, 8], [17, 2], [3, 2]]);
});

test('edgeDepth: the building reaches as far in from an edge as the nearest opposite wall', () => {
  const edges = polygonEdges(RECT);
  close(edgeDepth(edges, 0), 10, 1e-6, 'the long side is 10 m from the other');
  close(edgeDepth(edges, 1), 20, 1e-6, 'the short side is 20 m from the other');
});

test('fitRoofRuns: a rectangle takes the runs asked; a thin wing gives way until the ring is simple', () => {
  const ok = fitRoofRuns(RECT, [3, 3, 3, 3], 1);
  assert.deepEqual(ok.runs, [3, 3, 3, 3]);
  const thin = fitRoofRuns(RECT, [8, 3, 8, 3], 1); // 8 + 8 > 10: the two long slopes would pass through one another
  assert.ok((thin.runs[0] as number) < 5 && (thin.runs[2] as number) < 5, `long slopes gave way to ${thin.runs[0]} and ${thin.runs[2]}`);
  assert.ok((thin.runs[0] as number) > 2.5 && (thin.runs[2] as number) > 2.5, 'but they are still real slopes, not the no-roof fallback');
  assert.ok(Math.abs(area2(thin.ring)) > 1, 'with a crown between them');
  assert.equal(ringSelfIntersects(thin.ring), false);
  assert.ok(Math.sign(area2(thin.ring)) === Math.sign(area2(RECT)), 'same winding as the outline');
  // an outline with no room for a roof gets no ring at all rather than a broken one
  const none = fitRoofRuns([[0, 0], [1, 0], [1, 1], [0, 1]], [5, 5, 5, 5], 5);
  assert.ok(none.runs.every((r) => r >= 0));
  assert.equal(ringSelfIntersects(none.ring), false);
  // edges that continue straight on share one run: one facet plane, not two that fail to meet
  const dogleg = fitRoofRuns([[0, 0], [10, 0], [20, 0], [20, 10], [0, 10]], [2, 6, 3, 3, 3], 1);
  assert.equal(dogleg.runs[0], dogleg.runs[1], 'two collinear edges, one run');
});

test('Midland Grand roof: one steep pitch the length of the front, a partition of the footprint, every ring edge parallel to its eaves', () => {
  const plan = midlandGrandPlan(data);
  const n = plan.outline.length;
  const m = FIGURES.midland;
  assert.equal(plan.roof.ring.length, n);
  assert.equal(plan.roof.runs.length, n);
  assert.equal(ringSelfIntersects(plan.roof.ring), false, 'the ring is simple');
  const edges = polygonEdges(plan.outline);
  const rise = plan.ridge - plan.eaves;
  // the front: the same run on every facet, a steep slate pitch (about 60 degrees) that still leaves a crown between the two slopes
  const front = plan.front.edges.map((e) => plan.roof.runs[e.i] as number);
  for (const r of front) close(r, plan.roof.inset, 1e-9, 'the front shares one pitch');
  const pitch = (Math.atan2(rise, plan.roof.inset) * 180) / Math.PI;
  assert.ok(pitch > 55 && pitch < 66, `front pitch ${pitch} degrees`);
  for (const e of plan.front.edges) assert.ok(plan.roof.runs[e.i] as number <= m.roofDepthShare * edgeDepth(edges, e.i) + 1e-9, 'a front slope leaves room for the other');
  // every facet: a run between the floor (a tiny nook may be squeezed lower) and the front's, its ring edge parallel to its eaves edge at that run
  edges.forEach((e, i) => {
    const run = plan.roof.runs[i] as number;
    assert.ok(run > 0.1 && run <= plan.roof.inset + 1e-9, `facet ${i} runs ${run} m`);
    const a = plan.roof.ring[i] as Pt;
    const b = plan.roof.ring[(i + 1) % n] as Pt;
    close((b[0] - a[0]) * e.normal[0] + (b[1] - a[1]) * e.normal[1], 0, 1e-6 * (1 + e.length), `ring edge ${i} is parallel to its eaves edge`);
    close(-((a[0] - e.a[0]) * e.normal[0] + (a[1] - e.a[1]) * e.normal[1]), run, 1e-6, `ring edge ${i} stands ${run} m inside its eaves edge`);
  });
  // eaves + facets + crown tile the footprint exactly: no overlap, no gap
  const facets = edges.reduce((s, e, i) => s + Math.abs(area2([e.a, e.b, plan.roof.ring[(i + 1) % n] as Pt, plan.roof.ring[i] as Pt])) / 2, 0);
  close(facets + Math.abs(area2(plan.roof.ring)) / 2, Math.abs(area2(plan.outline)) / 2, 1e-6, 'facets plus crown equal the footprint');
  edges.forEach((e, i) => assert.ok(Math.sign(area2([e.a, e.b, plan.roof.ring[(i + 1) % n] as Pt, plan.roof.ring[i] as Pt])) === Math.sign(area2(plan.outline)), `facet ${i} is wound as the outline is`));
  for (const p of plan.roof.ring) assert.equal(pointInPolygon(p, plan.outline), true, 'the ring is inside the walls');
});

// ---- the Barlow shed ---------------------------------------------------------------------------

test('Barlow rib [WP-STP]: 100 ft at the crown, on the ground at the springings, symmetric, slightly pointed', () => {
  const s = FIGURES.barlow.span / 2;
  close(barlowHeight(0), 100 * 0.3048, 1e-9, 'crown');
  close(barlowHeight(s), 0, 1e-9, 'east springing');
  close(barlowHeight(-s), 0, 1e-9, 'west springing');
  close(barlowHeight(-17.3), barlowHeight(17.3), 1e-12, 'symmetric');
  let last = Infinity;
  for (let x = 0; x < s; x += 1) {
    const h = barlowHeight(x);
    assert.ok(h < last, `falls away from the crown at x=${x}`);
    last = h;
  }
  // a semicircle would be flat at the crown; the point makes the slope there about offset / radius
  const slope = (barlowHeight(0) - barlowHeight(0.5)) / 0.5;
  assert.ok(slope > 0.05 && slope < 0.2, `crown slope ${slope}`);
  // with no offset the two arcs are one circle, and the crown is round
  const roundSlope = (barlowHeight(0, FIGURES.barlow.span, FIGURES.barlow.rise, 0) - barlowHeight(0.5, FIGURES.barlow.span, FIGURES.barlow.rise, 0)) / 0.5;
  assert.ok(roundSlope < 0.01, `a round arch is flat at the crown, slope ${roundSlope}`);
});

test('Barlow section: starts and ends on the ground, passes the crown, and the arc fraction runs 0 to 1', () => {
  const sec = barlowSection(24);
  assert.equal(sec.length, 25);
  close(sec[0]?.y ?? -1, 0, 1e-9, 'west foot');
  close(sec[24]?.y ?? -1, 0, 1e-9, 'east foot');
  close(Math.max(...sec.map((p) => p.y)), FIGURES.barlow.rise, 1e-9, 'crown');
  close(sec[12]?.t ?? 0, 0.5, 1e-9, 'crown is half way along the arc');
  close(sec[24]?.x ?? 0, FIGURES.barlow.span, 1e-9, 'section spans the arch');
  for (let k = 1; k < sec.length; k++) assert.ok((sec[k]?.t ?? 0) > (sec[k - 1]?.t ?? 0), 'monotone');
});

test('Barlow shed: runs the way the platforms run, and the vault stands on the OSM footprint', () => {
  const plan = barlowPlan(data);
  assert.ok(Math.abs(plan.heading - stPancrasHeading(data)) < 1e-12);
  // each St Pancras platform's long edge points the same way as the shed, to a degree or two
  for (const p of data.platforms) {
    if (!['5', '6', '7', '8', '9', '10'].includes(p.ref ?? '') || (p.layer ?? 0) <= 0) continue;
    const e = polygonEdges(p.pts).sort((x, y) => y.length - x.length)[0];
    assert.ok(e);
    const heading = Math.atan2(e.dir[0], -e.dir[1]);
    const d = Math.atan2(Math.sin(heading - plan.heading), Math.cos(heading - plan.heading));
    assert.ok(Math.min(Math.abs(d), Math.PI - Math.abs(d)) < (3 * Math.PI) / 180, `platform ${p.ref} is ${(d * 180) / Math.PI} degrees off the shed's heading`);
  }
  // sample points 5 m inside each wall of the vault are inside the OSM outline
  const outline = building(OSM_IDS.stPancrasStation).pts;
  const frame = { origin: plan.origin, heading: plan.heading };
  const c = Math.cos(plan.heading);
  const s = Math.sin(plan.heading);
  for (const v of [40, 100, 200]) for (const u of [5, plan.width / 2, plan.width - 5]) {
    const p: Pt = [plan.origin[0] + u * c + v * s, plan.origin[1] + u * s - v * c];
    assert.equal(pointInPolygon(p, outline), true, `vault point u=${u} v=${v} is on the footprint`);
  }
  // the OSM outline's north end is the vault's north end
  const vMax = Math.max(...outline.map((p) => worldToShed(frame, p).v));
  close(plan.length, vMax, 1e-6, 'vault length reaches the outline');
  close(plan.width, FIGURES.barlow.spanWall, 1e-9, '[WP-STP] 245 ft 6 in wall to wall');
});

test('Barlow shed: platforms 5 to 10 stand inside the vault, clear of both walls, and no other OSM building is in its way', () => {
  const plan = barlowPlan(data);
  const frame = { origin: plan.origin, heading: plan.heading };
  let platforms = 0;
  for (const p of data.platforms) {
    if (!['5', '6', '7', '8', '9', '10'].includes(p.ref ?? '') || (p.layer ?? 0) <= 0) continue;
    platforms++;
    for (const q of p.pts) {
      const { u, v } = worldToShed(frame, q);
      if (v > plan.length) continue; // the platforms run on, in the open, past the shed
      assert.ok(u > 3 && u < plan.width - 3, `platform ${p.ref} vertex at u=${u}`);
    }
  }
  assert.equal(platforms, 6, 'platforms 5 to 10');
  for (const b of data.buildings) {
    if (REPLACED_BUILDING_IDS.includes(b.id)) continue;
    const mid = worldToShed(frame, centroid(b.pts));
    assert.ok(!(mid.u > 0 && mid.u < plan.width && mid.v > 0 && mid.v < plan.length), `building ${b.id} ${b.name ?? ''} stands inside the vault footprint`);
  }
});

test('Barlow shed [WP-STP]: 24 ribs, one every 29 ft 4 in, centred along the 210 m of the shed proper', () => {
  const plan = barlowPlan(data);
  const proper = plan.ribs;
  assert.equal(FIGURES.barlow.ribs, 24, '[WP-STP] 24 ribs');
  assert.equal(proper.length, 24, 'exactly the 24 ribs of the shed proper: the extension is not arched and has none');
  for (let i = 1; i < plan.ribs.length; i++) close((plan.ribs[i] ?? 0) - (plan.ribs[i - 1] ?? 0), FIGURES.barlow.ribSpacing, 1e-9, 'rib spacing');
  close(FIGURES.barlow.ribSpacing, 8.941, 0.001, '29 ft 4 in in metres');
  close(plan.barlowLength, 689 * 0.3048, 1e-9, '[WP-STP] 689 ft');
  close(proper[0] ?? 0, plan.barlowLength - (proper[proper.length - 1] ?? 0), 1e-9, 'the end bays match');
  assert.ok((plan.ribs[plan.ribs.length - 1] ?? 0) < plan.barlowLength, 'every rib is inside the shed proper');
});

test('Barlow extension [NSC-EXT]: a 22 m transition, then seven bays of about 30 m that fill the outline to its north end', () => {
  const plan = barlowPlan(data);
  const f = FIGURES.barlow;
  assert.equal(f.transition, 22, '[NSC-EXT] the main roof stops 22 m short of the gable');
  assert.equal(f.bays, 7, '[NSC-EXT] seven bays');
  close(plan.bay, 30, 1, '[NSC-EXT] 30 m bays');
  close(plan.barlowLength + f.transition + f.bays * plan.bay, plan.length, 1e-9, 'shed + transition + bays reach the outline\'s north end');
  assert.ok(Math.max(f.screenFoot + f.pyramid, f.screenFoot - f.girder + f.truss) < f.rise / 2, 'subservient to the Barlow shed [NSC-EXT]: the extension\'s highest point is under half the crown height');
});

// ---- the tunnel mouths -------------------------------------------------------------------------

/** Nodes where an ECM1 tunnel way begins or ends and an open (non-tunnel) way also stands: the OSM tunnel ends. */
function osmTunnelEnds(ref: string): Set<number> {
  const open = new Set<number>();
  for (const r of data.rails) if (!r.tunnel) for (const n of r.nodes) open.add(n);
  const ends = new Set<number>();
  for (const r of data.rails) {
    if (!r.tunnel || r.ref !== ref) continue;
    for (const n of [r.nodes[0], r.nodes[r.nodes.length - 1]] as number[]) if (open.has(n)) ends.add(n);
  }
  return ends;
}

test('tunnel mouths: they are exactly the OSM nodes where the ECM1 rails change from open to tunnel, at their exact positions', () => {
  const mouths = tunnelMouths(data);
  const ends = osmTunnelEnds('ECM1');
  assert.equal(ends.size, 16, '6 + 6 Gasworks and 4 Copenhagen portal nodes in the extract');
  assert.deepEqual([...new Set(mouths.flatMap((m) => m.nodeIds))].sort(), [...ends].sort(), 'same node set');
  const pos = new Map(data.nodes.map(([id, x, z]) => [id, [x, z]] as const));
  for (const m of mouths) for (const b of m.bores) for (const t of b.tracks) {
    assert.deepEqual([t.x, t.z], pos.get(t.nodeId), `track node ${t.nodeId} is at its OSM position`);
    assert.ok(ends.has(t.nodeId), 'and is a tunnel end');
  }
  assert.deepEqual(mouths.map((m) => m.id), ['gasworks-south', 'gasworks-north', 'copenhagen-south'], 'south first');
});

test('tunnel mouths: bores of two tracks each, 3 at each Gasworks mouth and 2 at Copenhagen [WP-GAS] [WP-COP]', () => {
  const mouths = tunnelMouths(data);
  assert.deepEqual(mouths.map((m) => m.bores.length), [3, 3, 2]);
  for (const m of mouths) for (const b of m.bores) {
    assert.equal(b.tracks.length, 2, `${m.id} bore at ${b.lateral}`);
    for (const t of b.tracks) assert.ok(Math.abs(t.lateral - b.lateral) + 1.4 <= b.width / 2, `${m.id}: a 2.8 m train on the track at ${t.lateral} fits the arch of the bore at ${b.lateral}`);
  }
});

test('tunnel mouths: the face is square to the tracks, the arches are semicircular, and the piers between them are solid', () => {
  const pos = new Map(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt] as const));
  for (const m of tunnelMouths(data)) {
    // each portal node's track runs into the tunnel within 8 degrees of the mouth's axis
    for (const r of data.rails) {
      if (!r.tunnel || r.ref !== 'ECM1') continue;
      for (const [k, next] of [[0, 1], [r.nodes.length - 1, r.nodes.length - 2]] as const) {
        const id = r.nodes[k] as number;
        if (!m.nodeIds.includes(id)) continue;
        const a = pos.get(id) as Pt;
        const b = pos.get(r.nodes[next] as number) as Pt;
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const dot = ((b[0] - a[0]) * m.axis[0] + (b[1] - a[1]) * m.axis[1]) / l;
        assert.ok(Math.acos(Math.min(1, dot)) < (8 * Math.PI) / 180, `${m.id}: track from node ${id} is ${(Math.acos(Math.min(1, dot)) * 180) / Math.PI} degrees off the axis`);
      }
    }
    const arches = m.bores.map(archOpening).sort((p, q) => p.lateral - q.lateral);
    for (const a of arches) {
      close(a.spring + a.halfWidth, FIGURES.tunnel.crown, 1e-9, 'crown height');
      assert.ok(a.spring > 0, 'a semicircular head needs straight jambs under it');
    }
    for (let i = 0; i + 1 < arches.length; i++) {
      const gap = (arches[i + 1]?.lateral ?? 0) - (arches[i + 1]?.halfWidth ?? 0) - ((arches[i]?.lateral ?? 0) + (arches[i]?.halfWidth ?? 0));
      assert.ok(gap >= 1.0, `${m.id}: pier ${i} is ${gap} m wide`);
    }
    const first = arches[0];
    const last = arches[arches.length - 1];
    assert.ok(first && last && m.halfWidth >= Math.max(Math.abs(first.lateral - first.halfWidth), Math.abs(last.lateral + last.halfWidth)) + 1.5, 'masonry beyond the outer arches');
  }
});

test('Gasworks Tunnel [WP-GAS]: 528 yd between its mouths, and Copenhagen [WP-COP] starts 865 m on from the Gasworks south mouth', () => {
  const runs = tunnelRuns(data);
  const gas = runs.find((r) => r.name === 'Gasworks Tunnel');
  const cop = runs.find((r) => r.name === 'Copenhagen Tunnel');
  assert.ok(gas && cop);
  assert.equal(gas.mouths.length, 2);
  assert.equal(gas.openEnded, false);
  assert.equal(cop.openEnded, true, 'the Copenhagen Tunnel runs on past the edge of the extract');
  close(Math.hypot(gas.to[0] - gas.from[0], gas.to[1] - gas.from[1]), FIGURES.tunnel.gasworksLength, 1.5, 'Gasworks length');
  const south = gas.mouths[0];
  assert.ok(south);
  const between = Math.hypot(cop.from[0] - south.origin[0], cop.from[1] - south.origin[1]);
  close(between, FIGURES.tunnel.copenhagenSouthChainage - FIGURES.tunnel.gasworksSouthChainage, 5, 'mile-post distance 65 ch - 22 ch');
});

test('tunnel cover: every tunnel node lies on the covered strip, and open rails cross none of it', () => {
  const covers = tunnelCover(data);
  assert.deepEqual(covers.map((c) => c.name), ['Gasworks Tunnel', 'Copenhagen Tunnel']);
  const pos = new Map(data.nodes.map(([id, x, z]) => [id, [x, z] as Pt] as const));
  for (const c of covers) {
    const runNodes = tunnelRuns(data).find((r) => r.name === c.name)?.nodes ?? [];
    assert.ok(runNodes.length > 10);
    for (const n of runNodes) {
      const u = (n.x - c.from[0]) * c.across[0] + (n.z - c.from[1]) * c.across[1];
      const w = (n.x - c.from[0]) * c.axis[0] + (n.z - c.from[1]) * c.axis[1];
      assert.ok(u >= c.lo - 1e-9 && u <= c.hi + 1e-9, 'inside the lateral range');
      assert.ok(w >= -1 && w <= c.length + 1, `node ${n.id} lies along the strip (${w})`);
    }
    // no open rail node on the strip: a bank over the tunnel would bury it
    for (const r of data.rails) {
      if (r.tunnel) continue;
      for (const id of r.nodes) {
        const p = pos.get(id) as Pt;
        const u = (p[0] - c.from[0]) * c.across[0] + (p[1] - c.from[1]) * c.across[1];
        const w = (p[0] - c.from[0]) * c.axis[0] + (p[1] - c.from[1]) * c.axis[1];
        assert.ok(!(u > c.lo - 8 && u < c.hi + 8 && w > 5 && w < c.length - 5), `open rail node ${id} lies on the ${c.name} strip`);
      }
    }
  }
});

test('approachEnvelope: finds the open rails on the approach, and those at the face line up with the arches', () => {
  for (const m of tunnelMouths(data)) {
    const env = approachEnvelope(data, m, 75, 15);
    assert.deepEqual(env.map((s) => s.d), [0, 15, 30, 45, 60, 75]);
    for (const s of env) {
      assert.ok(s.lo !== null && s.hi !== null, `${m.id}: rails at ${s.d} m`);
      assert.ok((s.lo as number) <= (s.hi as number));
    }
    const at0 = env[0];
    assert.ok(at0);
    const arches = m.bores.map(archOpening);
    const inside = (u: number): boolean => arches.some((a) => Math.abs(u - a.lateral) <= a.halfWidth);
    assert.ok(inside(at0.lo as number) && inside(at0.hi as number), `${m.id}: the outermost approach rails line up with an arch`);
    // a rail on the outermost bore's track is found: the envelope reaches at least to the outermost portal track
    const lateral = m.bores.flatMap((b) => b.tracks.map((t) => t.lateral));
    assert.ok((at0.lo as number) <= Math.min(...lateral) + 1.5 && (at0.hi as number) >= Math.max(...lateral) - 1.5, `${m.id}: envelope covers the portal tracks`);
  }
  // rails more than `corridor` metres beyond the face are another line: a narrow corridor sees fewer
  const m0 = tunnelMouths(data)[0];
  assert.ok(m0);
  const wide = approachEnvelope(data, m0, 75, 15, 30)[5];
  const narrow = approachEnvelope(data, m0, 75, 15, 0)[5];
  assert.ok(wide && narrow && ((wide.hi ?? 0) - (wide.lo ?? 0) >= (narrow.hi ?? 0) - (narrow.lo ?? 0)), 'a wider corridor never sees less');
});

test('lateralRange: measures a point set across a line', () => {
  const r = lateralRange([0, 0], [0, -100], [{ x: 3, z: -10 }, { x: -2, z: -50 }, { x: 0.5, z: -99 }]);
  close(r.length, 100, 1e-9);
  assert.deepEqual(r.axis.map((x) => Math.round(x * 1e6) / 1e6 + 0), [0, -1]);
  close(r.across[0], 1, 1e-9, 'north-bound: across is east');
  close(r.lo, -2, 1e-9);
  close(r.hi, 3, 1e-9);
});
