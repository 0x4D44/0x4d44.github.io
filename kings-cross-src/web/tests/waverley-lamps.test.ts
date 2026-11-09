// web/src/waverley-lamps.ts: the Scottish scene's street lamps (round seven, night lighting): where they stand along the OSM roads, on what (the ground, or a bridge's deck by the frontage's own rule), clear of
// what (every building, the carriageways of the other roads), and that the lazy chunk loads and makes the lamps. Worked by hand on small streets first, then on the real committed data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import { pointInPolygon } from '../../core/station.ts';
import { encodeLampRoads, LAMP_KERB, LAMP_KIND, LAMP_RULES } from '../../core/streetlights.ts';
import type { LampRoad, LampRoadsFile, LampSpot } from '../../core/streetlights.ts';
import { createTerrain } from '../../core/terrain.ts';
import type { TerrainFile } from '../../core/terrain.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { deckHeights, footprintsOf, loadWaverleyLamps, WAVERLEY_ROAD_WIDTH, waverleyLampSpots } from '../src/waverley-lamps.ts';
import { waverleyGround } from '../src/waverley-scene.ts';

const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const json = (name: string): unknown => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'));
const wide = { x0: -1000, z0: -1000, x1: 1000, z1: 1000 };
const file = (roads: readonly LampRoad[], extent = wide): LampRoadsFile => ({ attribution: '', licence: '', source: '', frame: '', extent, unit: 0.5, ...encodeLampRoads(roads, 0.5) });
const road = (cls: LampRoad['cls'], line: Pt[], bridge = false): LampRoad => ({ cls, bridge, line });
const flat = (): number => 0;
const square = (x0: number, z0: number, x1: number, z1: number): Pt[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

test('deckHeights: a deck runs straight from the ground at one end to the ground at the other (the frontage\'s own rule), by the metre along its line, and stays at the ends beyond them', () => {
  const context = (x: number, z: number): number => 10 + 0.1 * x + 0.01 * z;
  const [deck] = deckHeights([road('primary', [[0, 0], [60, 80], [100, 0]], true)], context);
  assert.ok(typeof deck === 'function');
  // the line is 100 + 128.06 m long and ends 10 m above where it starts (x 0 to 100): the height is a straight line along the way, whatever its bends
  const length = 100 + Math.hypot(40, 80);
  const h = (s: number): number => (deck as (x: number, z: number, s: number, o: number) => number)(0, 0, s, 0);
  assert.equal(h(0), 10);
  close(h(length), 20, 1e-9, 'the far end');
  close(h(length / 2), 15, 1e-9, 'half way along');
  close(h(length / 4), 12.5, 1e-9, 'a quarter');
  assert.equal(h(-5), 10, 'before the start: the ground there');
  assert.equal(h(length + 50), h(length), 'past the end: the ground there');
  // the point it is asked about does not matter: only the metres along
  const f = deck as (x: number, z: number, s: number, o: number) => number;
  assert.equal(f(-500, 900, 40, 3), f(7, 7, 40, -3));
});

test('deckHeights: decks that meet end to end are one deck, whatever order they are listed in or way they run (Waverley Bridge is three OSM ways); the height is continuous at every joint', () => {
  const context = (x: number, z: number): number => 5 + 0.1 * x + 0.1 * z;
  const a = road('minor', [[0, 0], [40, 0]], true); // 40 m
  const b = road('pedestrian', [[40, 0], [40, 60]], true); // 60 m
  const c = road('pedestrian', [[40, 60], [100, 60]], true); // 60 m: 160 m in all, from 5 to 21 m
  const at = (heights: ReturnType<typeof deckHeights>, i: number, s: number): number => (heights[i] as (x: number, z: number, s: number, o: number) => number)(0, 0, s, 0);
  const straight = (d: number): number => 5 + (16 * d) / 160;
  for (const [name, decks] of [
    ['in order', [a, b, c]],
    ['shuffled', [c, a, b]],
    ['b runs the other way', [a, road('pedestrian', [[40, 60], [40, 0]], true), c]],
    ['a and c run the other way', [road('minor', [[40, 0], [0, 0]], true), b, road('pedestrian', [[100, 60], [40, 60]], true)]],
    ['the middle one first, reversed', [road('pedestrian', [[40, 60], [40, 0]], true), road('pedestrian', [[100, 60], [40, 60]], true), road('minor', [[40, 0], [0, 0]], true)]],
  ] as const) {
    const heights = deckHeights(decks, context);
    assert.equal(heights.length, 3, name);
    // each deck's own metres, as the chain's: a is 0 to 40, b 40 to 100 and c 100 to 160, whichever way the deck's own line runs
    decks.forEach((deck, i) => {
      const [start, end] = deck.line as [Pt, Pt];
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      // the chain's metre of a point: its distance from (0, 0) along a, b and c
      const place = (p: Pt): number => (p[1] === 0 ? p[0] : p[0] === 40 ? 40 + p[1] : 100 + (p[0] - 40));
      const first = place(start);
      const last = place(end);
      const sign = last > first ? 1 : -1;
      for (const s of [0, length / 3, length / 2, length]) close(at(heights, i, s), straight(first + sign * s), 1e-9, `${name}: deck ${i} at ${s} m`);
    });
  }
});

test('deckHeights: a node where three decks meet ends a chain and joins none; a lone deck and a ring of decks are heights all the same', () => {
  const context = (x: number, z: number): number => x / 10;
  // three decks from one point (50, 0): each its own, from the ground at its ends
  const spokes = [road('primary', [[50, 0], [150, 0]], true), road('primary', [[50, 0], [50, 100]], true), road('primary', [[0, 0], [50, 0]], true)];
  const heights = deckHeights(spokes, context);
  const f = (i: number, s: number): number => (heights[i] as (x: number, z: number, s: number, o: number) => number)(0, 0, s, 0);
  close(f(0, 0), 5, 1e-9);
  close(f(0, 100), 15, 1e-9, 'the first spoke, ground to ground');
  close(f(1, 0), 5, 1e-9);
  close(f(1, 100), 5, 1e-9, 'the second: level, its ends are both at x 50');
  close(f(2, 0), 0, 1e-9);
  close(f(2, 50), 5, 1e-9, 'the third ends where the others start, and is not joined to either');
  // a ring of three decks that meet end to end: none is left without a height, and none is NaN
  const ring = [road('tertiary', [[0, 0], [30, 0]], true), road('tertiary', [[30, 0], [15, 26]], true), road('tertiary', [[15, 26], [0, 0]], true)];
  const rings = deckHeights(ring, context);
  assert.equal(rings.length, 3);
  for (const g of rings) for (const s of [0, 10, 30, 40]) assert.ok(Number.isFinite((g as (x: number, z: number, s: number, o: number) => number)(0, 0, s, 0)), 'a number');
  // no decks, no heights
  assert.deepEqual(deckHeights([], context), []);
});

test('footprintsOf: a ring with the box round it and the courtyards it keeps', () => {
  const hole = square(5, 5, 8, 8);
  const [a, b] = footprintsOf([{ outer: square(0, -2, 10, 12), holes: [hole] }, { outer: [[100, 100], [90, 120], [110, 110]], holes: [] }]);
  assert.deepEqual(a?.box, [0, 10, -2, 12]);
  assert.deepEqual(a?.holes, [hole]);
  assert.deepEqual(b?.box, [90, 110, 100, 120]);
  assert.deepEqual(footprintsOf([]), []);
});

test('waverleyLampSpots: a lamp stands the kerb of the painted road from its line (half of W3\'s carriageway and LAMP_KERB), on the ground at its foot, the pool in the ground\'s plane', () => {
  const ground = (x: number, z: number): number => 3 + 0.01 * x - 0.02 * z;
  for (const cls of ['primary', 'secondary', 'tertiary', 'minor', 'pedestrian'] as const) {
    const spots = waverleyLampSpots(file([road(cls, [[0, 0], [300, 0]])]), ground, ground, []);
    assert.ok(spots.length >= 8, `${cls}: ${spots.length} lamps`);
    for (const s of spots) {
      close(Math.abs(s.z), (WAVERLEY_ROAD_WIDTH[cls] as number) / 2 + LAMP_KERB, 1e-9, `${cls} lamp's offset`);
      close(s.y, ground(s.x, s.z), 1e-9, `${cls} lamp stands on the ground`);
      close(s.slope[0], 0.01, 1e-6, `${cls} slope east`);
      close(s.slope[1], -0.02, 1e-6, `${cls} slope south`);
      assert.equal(s.height, (LAMP_RULES[cls] as { height: number }).height);
      assert.notEqual(s.kind, LAMP_KIND.cool, 'nothing in the old town is the new quarter\'s cool white');
    }
  }
  // the painted widths are the city's own (the W3 ground paints these)
  const painted = Object.keys((json('waverley-city-landuse.json') as { roads: Record<string, unknown> }).roads).map(Number);
  for (const cls of ['primary', 'secondary', 'tertiary', 'minor', 'pedestrian'] as const) assert.ok(painted.includes(WAVERLEY_ROAD_WIDTH[cls] as number), `${cls}: ${WAVERLEY_ROAD_WIDTH[cls]} m is a width the ground is painted with`);
});

test('waverleyLampSpots: no lamp stands in a building, but one in a courtyard does; a lamp on the ground keeps clear of the carriageway of every other road on the ground', () => {
  const street = road('tertiary', [[0, 0], [300, 0]]);
  const bare = waverleyLampSpots(file([street]), flat, flat, []);
  const north = bare.filter((s) => s.z > 0);
  const inside = north.filter((s) => s.x > 60 && s.x < 200);
  assert.ok(inside.length >= 2, `${inside.length} lamps on that side of the street where the building will be`);
  const block = { outer: square(60, 2, 200, 40), holes: [] };
  const built = waverleyLampSpots(file([street]), flat, flat, footprintsOf([block]));
  assert.equal(built.length, bare.length - inside.length, 'those lamps and no others are gone');
  for (const s of built) assert.ok(!(s.x >= 60 && s.x <= 200 && s.z >= 2 && s.z <= 40), `a lamp at ${s.x}, ${s.z} stands in the building`);
  // a courtyard (a hole in the ring) is not the building: the lamp in it stays
  const [kept] = inside as [LampSpot, ...LampSpot[]];
  const yard = { outer: square(60, 2, 200, 40), holes: [square(kept.x - 1, kept.z - 1, kept.x + 1, kept.z + 1)] };
  assert.equal(waverleyLampSpots(file([street]), flat, flat, footprintsOf([yard])).length, built.length + 1, 'the courtyard\'s lamp is back');
  // another road across the street (a minor road: 6 m posts, the street's are 7 m): no lamp stands in its carriageway, and the street's lamps outside it are as they were
  const across = road('minor', [[150, -80], [150, 80]]);
  const crossed = waverleyLampSpots(file([street, across]), flat, flat, []);
  const half = (WAVERLEY_ROAD_WIDTH.minor as number) / 2;
  const streetLamps = (spots: readonly LampSpot[]): LampSpot[] => spots.filter((s) => s.height === LAMP_RULES.tertiary?.height);
  const nearby = (s: LampSpot): boolean => Math.abs(s.x - 150) < half + 0.3;
  assert.ok(streetLamps(bare).some(nearby), 'a lamp would have stood in the crossing road without it');
  assert.deepEqual(streetLamps(crossed), streetLamps(bare).filter((s) => !nearby(s)), 'the street\'s lamps, less the one in the carriageway');
  // and the road across keeps out of the street's carriageway the same way
  const side = crossed.filter((s) => s.height === LAMP_RULES.minor?.height);
  assert.ok(side.length >= 4, `${side.length} lamps on the road across`);
  assert.ok(side.every((s) => Math.abs(s.z) >= (WAVERLEY_ROAD_WIDTH.tertiary as number) / 2 + 0.3 - 1e-9), 'none in the street\'s carriageway');
});

test('waverleyLampSpots: no lamp stands outside the terrain, where the ground is not the terrain\'s: a road that runs along its edge has its lamps on the inside only', () => {
  const edge = road('tertiary', [[0, 0], [300, 0]]);
  const all = waverleyLampSpots(file([edge]), flat, flat, []);
  const inner = waverleyLampSpots(file([edge], { x0: -10, z0: -100, x1: 310, z1: 3 }), flat, flat, []);
  assert.ok(all.some((s) => s.z > 3) && all.some((s) => s.z < 3), 'lamps on both sides without an edge');
  assert.deepEqual(inner, all.filter((s) => s.z <= 3), 'with the edge at z 3, those on the far side are gone and no others');
  assert.equal(waverleyLampSpots(file([edge], { x0: 50, z0: -100, x1: 80, z1: 100 }), flat, flat, []).every((s) => s.x >= 50 && s.x <= 80), true);
  assert.deepEqual(waverleyLampSpots(file([edge], { x0: 1000, z0: 1000, x1: 1001, z1: 1001 }), flat, flat, []), []);
});

test('waverleyLampSpots: a lamp on a bridge stands on the deck (its height by the frontage\'s rule), is not blocked by the buildings under it or the road it crosses, and does not block that road\'s own lamps', () => {
  const context = (_x: number, z: number): number => 10 + 0.05 * z; // the DTM along the deck: 6 m at its north end (z -80) to 14 m at its south (z 80)
  const under = road('tertiary', [[0, 0], [300, 0]]);
  const deck = road('primary', [[150, -80], [150, 80]], true);
  const block = { outer: square(120, -60, 180, 60), holes: [] };
  const spots = waverleyLampSpots(file([under, deck]), flat, context, footprintsOf([block]));
  const onDeck = spots.filter((s) => s.y > 1);
  assert.ok(onDeck.length >= 6, `${onDeck.length} lamps on the deck, over the building`);
  for (const s of onDeck) {
    close(s.y, 10 + 0.05 * s.z, 1e-9, `a deck lamp at z ${s.z.toFixed(1)}`);
    close(Math.abs(s.x - 150), (WAVERLEY_ROAD_WIDTH.primary as number) / 2 + LAMP_KERB, 1e-9, 'at the deck\'s own kerb');
    assert.ok(s.z > -80 && s.z < 80 && s.height === LAMP_RULES.primary?.height);
  }
  assert.ok(onDeck.some((s) => Math.abs(s.z) < 60) && onDeck.some((s) => s.x > 150) && onDeck.some((s) => s.x < 150), 'over the building, on both sides of the deck');
  // the road under the bridge has its lamps as if the deck were not there (outside the building: the building is over most of it), and the deck's carriageway takes none of them
  const alone = waverleyLampSpots(file([under]), flat, context, footprintsOf([block]));
  const onGround = spots.filter((s) => s.y <= 1);
  assert.deepEqual(onGround.map((s) => [s.x, s.z]), alone.map((s) => [s.x, s.z]), 'the street\'s lamps are the same with the deck over it');
  assert.ok(alone.length > 0 && alone.every((s) => s.x < 120 || s.x > 180), 'outside the building');
});

test('waverleyLampSpots on the real roads: some thousand lamps, sodium and warm and no cool, standing on the ground clear of every building, the decks\' lamps on the decks, the same every time', () => {
  const sceneFile = json('waverley-scene.json');
  const data = unpackWaverleyScene(sceneFile);
  const raw = createTerrain(json('waverley-terrain.json') as TerrainFile);
  const drawn = waverleyGround(data, raw);
  const ground = (x: number, z: number): number => drawn.heightAt(x, z);
  const context = (x: number, z: number): number => raw.heightAt(x, z);
  const rings = [...data.buildings.map((b) => ({ outer: b.outer, holes: b.holes })), ...data.roofs.map((b) => ({ outer: b.outer, holes: b.holes })), ...data.platforms.map((p) => ({ outer: p.path, holes: [] }))];
  const roads = json('waverley-lamp-roads.json') as LampRoadsFile;
  const spots = waverleyLampSpots(roads, ground, context, footprintsOf(rings));
  assert.ok(spots.length >= 900 && spots.length <= 1300, `${spots.length} lamps`);
  const kinds = new Set(spots.map((s) => s.kind));
  assert.ok(kinds.has(LAMP_KIND.sodium) && kinds.has(LAMP_KIND.warm) && !kinds.has(LAMP_KIND.cool));
  assert.ok(spots.every((s) => s.mast === undefined && s.height >= 5 && s.height <= 10));
  const { x0, z0, x1, z1 } = drawn.extent;
  assert.deepEqual(roads.extent, drawn.extent, 'the roads are clipped to the terrain the scene draws');
  assert.ok(spots.every((s) => s.x >= x0 && s.x <= x1 && s.z >= z0 && s.z <= z1), 'on the terrain');
  // the ground's lamps (those on the drawn ground) stand in no building, no roof's outline and on no platform
  const onGround = spots.filter((s) => Math.abs(s.y - ground(s.x, s.z)) < 1e-9);
  assert.ok(onGround.length >= spots.length - 20, `${onGround.length} of ${spots.length} lamps are on the ground`);
  for (const s of onGround) {
    for (const ring of rings) {
      if (!pointInPolygon([s.x, s.z], ring.outer as Pt[])) continue;
      assert.ok(ring.holes.some((h) => pointInPolygon([s.x, s.z], h as Pt[])), `a lamp at ${s.x.toFixed(1)}, ${s.z.toFixed(1)} stands in a building`);
    }
  }
  // the lamps that are not on the ground are on the decks, over the ground (the decks are the bridges over the station, the streets and the Cowgate)
  const decks = spots.filter((s) => Math.abs(s.y - ground(s.x, s.z)) >= 1e-9);
  assert.ok(decks.length >= 8 && decks.length <= 40, `${decks.length} lamps on decks`);
  const nb = decks.filter((s) => s.x > 95 && s.x < 160 && s.z > -95 && s.z < 80).sort((p, q) => p.z - q.z);
  assert.ok(nb.length >= 6, `${nb.length} lamps on North Bridge`);
  for (let i = 1; i < nb.length; i++) assert.ok((nb[i] as LampSpot).y >= (nb[i - 1] as LampSpot).y, 'North Bridge rises toward the Old Town (the DTM at its ends: 15.8 m at the north, 22.2 m at the south)');
  assert.ok((nb[0] as LampSpot).y > 15.5 && (nb[nb.length - 1] as LampSpot).y < 22.5 && (nb[0] as LampSpot).y < 18, `North Bridge's lamps run ${(nb[0] as LampSpot).y.toFixed(1)} to ${(nb[nb.length - 1] as LampSpot).y.toFixed(1)} m`);
  assert.ok(nb.every((s) => s.y - ground(s.x, s.z) > 10), 'high over the station (the drawn ground there is the rail datum)');
  const wb = decks.filter((s) => s.x > -110 && s.x < -50 && s.z > -40 && s.z < 100);
  assert.ok(wb.length >= 2 && wb.every((s) => s.y > 8.3 && s.y < 9.2), `Waverley Bridge's lamps are at ${wb.map((s) => s.y.toFixed(2))} m (its ends are at 8.4 and 9.1 m)`);
  assert.deepEqual(waverleyLampSpots(roads, ground, context, footprintsOf(rings)), spots, 'the same lamps every time');
});

test('loadWaverleyLamps: the lazy chunk makes the lamps of the real roads: a post to each, a glow and a pool under it, three draws (no forecourt masts), none lit by day', async () => {
  const lights = await loadWaverleyLamps(() => 0);
  try {
    assert.equal(lights.group.name, 'street-lamps');
    const { lamps, draws, triangles } = lights.counts();
    assert.ok(lamps >= 900 && lamps <= 1300, `${lamps} lamps`);
    assert.equal(draws, 3, 'the posts, the halos and the pools (no masts here)');
    assert.ok(triangles >= lamps * 36 && triangles < 80_000, `${triangles} triangles`);
    assert.equal(lights.group.getObjectByName('forecourt-masts'), undefined, 'the forecourt\'s masts are London\'s');
    const halos = lights.group.getObjectByName('street-lamp-halos') as THREE.Points;
    const pools = lights.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
    assert.equal(halos.visible, false);
    assert.equal(pools.visible, false);
    assert.equal(pools.count, lamps);
    lights.setLevel(1);
    assert.equal(halos.visible, true);
    assert.equal(pools.visible, true);
    lights.setLevel(0);
    assert.equal(halos.visible, false);
  } finally {
    lights.dispose();
  }
});
