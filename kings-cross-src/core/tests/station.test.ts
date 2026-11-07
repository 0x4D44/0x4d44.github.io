import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Pt } from '../geo.ts';
import type { KxData } from '../osm.ts';
import {
  concourseCanopy,
  concourseHeight,
  fitCircle,
  GAUGE,
  isSurfacePlatform,
  longAxis,
  PLATFORM_REFS,
  platformHeading,
  platformReport,
  platformSouthEnd,
  pointInPolygon,
  polygonArea,
  RAIL_HEAD_WIDTH,
  railPair,
  SHED_CROWN_HEIGHT,
  SHED_LENGTH,
  SHED_PLATFORM_REFS,
  SHED_SPAN_WIDTH,
  shedBufferStops,
  shedLayout,
  shedToWorld,
  stationBuilding,
  stationPlatforms,
  worldToShed,
  xRangeAtZ,
} from '../station.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../../web/src/data/kx-track.json', import.meta.url), 'utf8'));

/** A thin rectangle: `length` long, `width` wide, its south end at (x0, z0), leaning `deg` east of north. */
function slab(x0: number, z0: number, length: number, width: number, deg: number): Pt[] {
  const h = (deg * Math.PI) / 180;
  const along: Pt = [Math.sin(h), -Math.cos(h)]; // north
  const across: Pt = [Math.cos(h), Math.sin(h)]; // east
  const at = (u: number, v: number): Pt => [x0 + u * across[0] + v * along[0], z0 + u * across[1] + v * along[1]];
  return [at(0, 0), at(width, 0), at(width, length), at(0, length)];
}

test('station: polygon area, long axis, length and mean width of a tilted slab', () => {
  const pts = slab(10, -20, 300, 4, 2);
  assert.ok(Math.abs(polygonArea(pts) - 1200) < 1e-6);
  const a = longAxis(pts);
  assert.ok(Math.abs(a.length - 300) < 0.01, `length ${a.length}`);
  assert.ok(Math.abs(a.width - 4) < 0.01, `width ${a.width}`);
  // the axis is a unit vector along the slab, up to its sign
  assert.ok(Math.abs(Math.hypot(a.axis[0], a.axis[1]) - 1) < 1e-9);
  assert.ok(Math.abs(Math.abs(a.axis[0]) - Math.sin((2 * Math.PI) / 180)) < 1e-6);
});

test('station: xRangeAtZ gives the crossings of the outline, or null off the polygon', () => {
  const sq: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.deepEqual(xRangeAtZ(sq, 5), [0, 10]);
  assert.equal(xRangeAtZ(sq, 11), null);
  assert.equal(xRangeAtZ(sq, -1), null);
  const tri: Pt[] = [[0, 0], [10, 0], [0, 10]];
  assert.deepEqual(xRangeAtZ(tri, 5), [0, 5]);
});

test('station: only platforms inside the King\'s Cross zone are picked, so St Pancras platform 3 is ignored', () => {
  const inside = slab(50, -60, 250, 4, 0);
  const stPancras = slab(120, 40, 250, 4, 0); // far outside the zone
  const m = stationPlatforms({
    platforms: [
      { id: 1, ref: '3', pts: stPancras },
      { id: 2, ref: '3', pts: inside },
      { id: 3, pts: inside }, // no ref
      { id: 4, ref: '9', pts: [[0, 0], [1, 1]] }, // degenerate
    ],
  });
  assert.equal(m.size, 1);
  assert.equal(m.get('3')?.id, 2);
});

test('station: the heading of near-parallel platforms is recovered from their tilt', () => {
  const platforms = SHED_PLATFORM_REFS.map((ref, i) => ({ id: i + 1, ref, pts: slab(10 + i * 8, -30, 300, 4, 3) }));
  const deg = (platformHeading({ platforms }) * 180) / Math.PI;
  assert.ok(Math.abs(deg - 3) < 0.05, `heading ${deg}`);
  assert.throws(() => platformHeading({ platforms: [] }), /no shed platforms/);
});

test('station: shed frame and world coordinates convert both ways', () => {
  const s = { origin: [7, -13] as Pt, heading: 0.0287 };
  for (const [u, v] of [[0, 0], [72, 0], [36, 244], [5, 100]] as const) {
    const w = shedToWorld(s, u, v);
    const back = worldToShed(s, w);
    assert.ok(Math.abs(back.u - u) < 1e-9 && Math.abs(back.v - v) < 1e-9, `${u},${v} -> ${back.u},${back.v}`);
  }
  // heading 0: u is east (+x), v is north (-z)
  assert.deepEqual(shedToWorld({ origin: [1, 2], heading: 0 }, 3, 4), [4, -2]);
});

test('station: twin rails sit one gauge plus a rail head apart, either side of the centre line, parallel to it', () => {
  const p = railPair([0, 0], [30, 40]) as NonNullable<ReturnType<typeof railPair>>;
  const [r1, r2] = p;
  const mid1: Pt = [(r1[0] + r1[2]) / 2, (r1[1] + r1[3]) / 2];
  const mid2: Pt = [(r2[0] + r2[2]) / 2, (r2[1] + r2[3]) / 2];
  assert.ok(Math.abs(Math.hypot(mid1[0] - mid2[0], mid1[1] - mid2[1]) - (GAUGE + RAIL_HEAD_WIDTH)) < 1e-9);
  assert.ok(Math.abs((mid1[0] + mid2[0]) / 2 - 15) < 1e-9 && Math.abs((mid1[1] + mid2[1]) / 2 - 20) < 1e-9, 'centred on the segment');
  // both rails keep the direction of the segment
  for (const r of p) assert.ok(Math.abs((r[2] - r[0]) * 40 - (r[3] - r[1]) * 30) < 1e-9);
  assert.equal(railPair([5, 5], [5, 5]), null);
});

test('station: an underground platform that shares a number, and sits in the zone, never replaces the real one', () => {
  const real = slab(50, -60, 250, 4, 0);
  const tube = slab(52, -70, 240, 4, 0);
  for (const first of [true, false]) {
    const list = [
      { id: 1, ref: '3', pts: real },
      { id: 2, ref: '3', pts: tube, layer: -3, tunnel: true },
    ];
    if (!first) list.reverse();
    assert.equal(stationPlatforms({ platforms: list }).get('3')?.id, 1, first ? 'tube listed second' : 'tube listed first');
  }
  assert.equal(isSurfacePlatform({}), true);
  assert.equal(isSurfacePlatform({ layer: 1 }), true);
  assert.equal(isSurfacePlatform({ layer: -1 }), false);
  assert.equal(isSurfacePlatform({ tunnel: true }), false);
});

test('station: platform lengths are pinned to the independent raw-OSM measurements (+/- 0.5 m), so a drift fails npm test', () => {
  // From `node tools/fidelity.ts --raw <extract>` (each platform re-measured from latitude and
  // longitude in its own frame). Re-pin them only after a deliberate change of the data.
  const pinned: Record<string, number> = { '0': 338.2, '1': 343.8, '2': 306.1, '3': 305.9, '4': 305.9, '5': 305.8, '6': 302.3, '7': 302.4, '8': 291.6, '9': 162.4, '10': 174.9 };
  const got = new Map(platformReport(data).map((r) => [r.ref, r.lengthM]));
  for (const [ref, want] of Object.entries(pinned)) {
    const have = got.get(ref);
    assert.ok(have !== undefined && Math.abs(have - want) <= 0.5, `platform ${ref}: ${have} m, pinned ${want} m`);
  }
});

test('station: a platform\'s south end is the middle of its two southmost vertices, not its centre', () => {
  assert.deepEqual(platformSouthEnd([[0, -300], [4, -300], [4, -20], [0, -22]]), [2, -21]);
  const p = stationPlatforms(data).get('3');
  assert.ok(p);
  const [x, z] = platformSouthEnd(p.pts);
  assert.ok(z > -30 && z < -15, `P3 south end z ${z}`);
  assert.ok(x > 45 && x < 58, `P3 south end x ${x}`);
});

test('station: the shed has nine buffer stops at its south end, each on a platform track, and no others', () => {
  const s = shedLayout(data);
  const stops = shedBufferStops(data, s);
  assert.equal(stops.length, 9);
  for (const b of stops) {
    const { u, v } = worldToShed(s, [b.x, b.z]);
    assert.ok(u > 0 && u < s.width && v > 5 && v < 30, `stop ${b.id} at u ${u.toFixed(1)}, v ${v.toFixed(1)}`);
  }
  const ids = new Set(stops.map((b) => b.id));
  assert.ok(data.buffers.some((b) => !ids.has(b.id)), 'buffers elsewhere (St Pancras, the suburban lines) are left out');
  // synthetic: a stop beyond 40 m up the shed, one west of the wall, one behind the south end
  const shed = { origin: [0, 0] as Pt, heading: 0, width: 72 };
  const got = shedBufferStops({ buffers: [{ id: 1, x: 10, z: -20 }, { id: 2, x: 10, z: -41 }, { id: 3, x: -1, z: -20 }, { id: 4, x: 10, z: 1 }, { id: 5, x: 73, z: -20 }] }, shed);
  assert.deepEqual(got.map((b) => b.id), [1]);
});

test('station: point in polygon, inside and outside, on a concave outline', () => {
  const ell: Pt[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  assert.equal(pointInPolygon([2, 2], ell), true);
  assert.equal(pointInPolygon([2, 8], ell), true);
  assert.equal(pointInPolygon([8, 2], ell), true);
  assert.equal(pointInPolygon([8, 8], ell), false, 'the notch of the L is outside');
  assert.equal(pointInPolygon([-1, 2], ell), false);
});

test('station: a circle is recovered from points on it, and the rms says how far they stray', () => {
  const on = (cx: number, cz: number, r: number, k: number): Pt[] => Array.from({ length: k }, (_, i) => [cx + r * Math.cos((i * Math.PI) / (k - 1)), cz + r * Math.sin((i * Math.PI) / (k - 1))]);
  const exact = fitCircle(on(-20, -90, 63, 12));
  assert.ok(Math.abs(exact.centre[0] + 20) < 1e-6 && Math.abs(exact.centre[1] + 90) < 1e-6 && Math.abs(exact.radius - 63) < 1e-6);
  assert.ok(exact.rms < 1e-6);
  const noisy = fitCircle(on(-20, -90, 63, 12).map(([x, z], i) => [x + (i % 2 ? 1.5 : -1.5), z] as Pt));
  assert.ok(noisy.rms > 0.5 && noisy.rms < 3, `rms ${noisy.rms}`);
  assert.throws(() => fitCircle([[0, 0], [1, 1]]), /cannot fit/);
  assert.throws(() => fitCircle([[0, 0], [1, 1], [2, 2]]), /cannot fit/, 'collinear points have no circle');
});

test('station: the Western Concourse canopy sits west of the shed, follows OSM\'s arc, and is as high as published', () => {
  const c = concourseCanopy(data);
  const s = shedLayout(data);
  assert.ok(c.radius > 55 && c.radius < 70, `radius ${c.radius}`);
  assert.ok(c.rms < 3.5, `the arc is nearly a circle: rms ${c.rms}`);
  const { u, v } = worldToShed(s, c.centre);
  assert.ok(u < -15 && u > -45, `centre ${u.toFixed(1)} m west of the shed wall`);
  assert.ok(v > 30 && v < 140, `centre ${v.toFixed(1)} m up the shed`);
  assert.equal(c.apex, 20);
  assert.equal(c.rim, 5);
  assert.equal(concourseHeight(c, 0), 20);
  assert.equal(concourseHeight(c, c.radius), 5);
  assert.equal(concourseHeight(c, 3 * c.radius), 5, 'clamped past the rim');
  assert.ok(Math.abs(concourseHeight(c, c.radius / 2) - 16.25) < 1e-9, 'a shallow dome: 5 + 15 * (1 - 0.5^2) halfway out');
  assert.ok(concourseHeight(c, 10) > concourseHeight(c, 30), 'the roof falls away from the stalk');
});

test('station: the published figures are the constants (105 ft, 800 ft, 71 ft)', () => {
  assert.ok(Math.abs(SHED_SPAN_WIDTH - 32.004) < 1e-9);
  assert.ok(Math.abs(SHED_LENGTH - 243.84) < 1e-9);
  assert.ok(Math.abs(SHED_CROWN_HEIGHT - 21.6408) < 1e-9);
  assert.equal(GAUGE, 1.435);
});

test('station: platforms 0 to 10 exist once each, there is no platform 11, and the lengths are sane', () => {
  assert.deepEqual([...PLATFORM_REFS], ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  const report = platformReport(data);
  assert.deepEqual(report.map((r) => r.ref), [...PLATFORM_REFS]);
  assert.equal(stationPlatforms(data).has('11'), false, 'platform 11 was relabelled 10 in 2021');
  for (const r of report) {
    assert.ok(r.lengthM > 150 && r.lengthM < 360, `P${r.ref} ${r.lengthM}`);
    assert.ok(r.meanWidthM > 3 && r.meanWidthM < 7, `P${r.ref} width ${r.meanWidthM}`);
  }
  // the island platforms 2-6 are all about 300 m on this extract
  for (const ref of ['2', '3', '4', '5', '6', '7']) {
    const r = report.find((x) => x.ref === ref);
    assert.ok(r && r.lengthM > 295 && r.lengthM < 310, `P${ref} ${r?.lengthM}`);
  }
});

test('station: the shed stands round the shed platforms, 72 m wide, 800 ft long, heading a little east of north', () => {
  const s = shedLayout(data);
  assert.ok(s.heading > 0.01 && s.heading < 0.05, `heading ${s.heading}`);
  assert.ok(s.width > 70 && s.width < 75, `width ${s.width}`);
  assert.equal(s.length, SHED_LENGTH);
  assert.ok(s.aisle > 3 && s.aisle < 6, `aisle ${s.aisle}`);
  assert.ok(Math.abs(s.aisle * 2 + 2 * SHED_SPAN_WIDTH - s.width) < 1e-9);
  assert.ok(Math.abs(s.springing + SHED_SPAN_WIDTH / 2 - SHED_CROWN_HEIGHT) < 1e-9, 'a semicircular arch reaches the published crown');
  // every shed platform face lies inside the footprint along the length of the shed
  const platforms = stationPlatforms(data);
  for (const ref of SHED_PLATFORM_REFS) {
    const p = platforms.get(ref);
    assert.ok(p);
    for (const [x, z] of p.pts) {
      const { u, v } = worldToShed(s, [x, z]);
      if (v < 5 || v > s.length - 5) continue;
      assert.ok(u > 0 && u < s.width, `platform ${ref} vertex outside the shed at u ${u.toFixed(1)}, v ${v.toFixed(1)}`);
    }
  }
  // the shed starts at the OSM station footprint's south edge, not somewhere else
  const south = worldToShed({ origin: s.origin, heading: s.heading }, [s.origin[0], s.origin[1]]);
  assert.equal(south.v, 0);
  assert.ok(s.origin[1] < -5 && s.origin[1] > -25, `south edge z ${s.origin[1]}`);
});

test('station: the station building is found by name, and St Pancras is not it', () => {
  const b = stationBuilding(data);
  assert.ok(b && /King/.test(b.name ?? ''));
  const decoy = { id: 9, pts: [[0, 0], [1, 0], [1, 1]] as Pt[], kind: 'train_station', name: 'London St Pancras International' };
  assert.equal(stationBuilding({ buildings: [decoy] }), undefined);
  assert.throws(() => shedLayout({ platforms: data.platforms, buildings: [decoy] }), /station building/);
});
