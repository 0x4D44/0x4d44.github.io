import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { project } from '../../core/geo.ts';
import type { Pt } from '../../core/geo.ts';
import { PERTH_ORIGIN, PERTH_STATION_BUILDING_ID } from '../../core/perth-data.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { meshAdder } from '../src/waverley-mesh.ts';
import { buildPerthScene } from '../src/perth-scene.ts';
import type { PerthBuild } from '../src/perth-scene.ts';
import { PERTH_FRONTAGE_OMIT_IDS, addPerthFrontage } from '../src/perth-frontage.ts';
import { HOTEL_LEVELS, PERTH_HOTEL_ID, PERTH_HOTEL_SOURCE, hotelFrame } from '../src/perth-frontage-hotel.ts';
import { PERTH_ENTRANCE } from '../src/perth-frontage-street.ts';
import { KINGS_PLACE_CUT, KINGS_PLACE_LEVELS, cutRoads, cutSurfaceAt, kingsPlaceLine } from '../src/perth-frontage-bridge.ts';
import { perthTrack } from '../src/perth-station.ts';
import { inPerthFrontageGroundMask, perthFrontageGroundMask } from '../src/perth-frontage-mask.ts';

const sceneJson = JSON.parse(readFileSync(new URL('../src/data/perth-scene.json', import.meta.url), 'utf8'));
// The frozen Perth cameras (tools/tests/frozen-perth-cameras.test.mjs holds this file equal to tools/evidence.mjs).
const perthCameras = (): Record<string, { pos: number[]; target: number[]; fov?: number }> => JSON.parse(readFileSync(new URL('../../tools/tests/frozen-perth-cameras.json', import.meta.url), 'utf8'));
const frontageJson = JSON.parse(readFileSync(new URL('../src/data/perth-frontage.json', import.meta.url), 'utf8'));
const data = unpackWaverleyScene(sceneJson);
const scene = buildPerthScene({ lighting: false });
test.after(() => scene.dispose());
const area = (id: string) => data.buildings.find(b => b.id === id)!;
const inRing = ([x, z]: Pt, p: readonly Pt[]) => { let yes = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < (p[j][0] - p[i][0]) * (z - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) yes = !yes; return yes; };
const segDist = ([x, z]: Pt, a: Pt, b: Pt) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
const ringDist = (p: Pt, r: readonly Pt[]) => Math.min(...r.map((q, i) => segDist(p, q, r[(i + 1) % r.length])));
const mesh = (name: string) => scene.group.getObjectByName(name) as THREE.Mesh;
const vertices = (name: string): [number, number, number][] => { const a = mesh(name).geometry.getAttribute('position'); return Array.from({ length: a.count }, (_, i) => [a.getX(i), a.getY(i), a.getZ(i)]); };

test('the Station Hotel is OSM way/234811330: the HES LB39538 grid reference falls inside it and in neither other hotel candidate', () => {
  const p = project(PERTH_HOTEL_SOURCE.latLon.lat, PERTH_HOTEL_SOURCE.latLon.lon, PERTH_ORIGIN);
  assert.ok(inRing(p, area(PERTH_HOTEL_ID).outer), `HES point ${p} inside the hotel footprint`);
  for (const other of ['way/104991643', 'way/628148376']) assert.ok(!inRing(p, area(other).outer), `not inside ${other}`);
  assert.deepEqual([...PERTH_FRONTAGE_OMIT_IDS], [PERTH_HOTEL_ID]);
});

test('the frontage data is the same OSM snapshot as the scene: ODbL, the car park, King\'s Place and the underbridge', () => {
  assert.equal(frontageJson.source.sha256, sceneJson.source.sha256);
  assert.match(frontageJson.attribution, /OpenStreetMap contributors \(ODbL\)/);
  assert.ok(frontageJson.parking.some((p: { id: string }) => p.id === 'way/24505868'), 'the station car park');
  assert.ok(frontageJson.roads.some((r: { name?: string }) => r.name === "King's Place"));
  assert.equal(frontageJson.bridge.id, 'way/1260630142');
  assert.doesNotMatch(JSON.stringify(frontageJson), /berth|stanox|tiploc|TRUST|SMART/i);
});

test('the hotel stands on its OSM footprint unchanged: every wall corner lies on the outline, the front carries four bays', () => {
  const ring = area(PERTH_HOTEL_ID).outer, f = hotelFrame(ring);
  const facade = vertices('perth-hotel-facade');
  for (const [x, y, z] of facade) if (ringDist([x, z], ring) > 1e-3) assert.ok(inRing([x, z], ring), `a facade corner at ${x},${y},${z} is off the footprint`);
  const outer = facade.filter(([x, , z]) => ringDist([x, z], ring) < 1e-3);
  assert.ok(outer.length > 150, 'the footprint is walled');
  assert.ok(Math.abs(f.middle[1] - f.middle[0] - 18) < .5 && Math.round((f.middle[1] - f.middle[0]) / 4.5) === 4, 'the OSM middle front is four 4.5 m bays');
  assert.ok(f.bayFront < -6 && f.bayFront > -9, `the entrance bay stands ${-f.bayFront} m forward of the front`);
  const top = Math.max(...facade.map(v => v[1]));
  assert.ok(top > 10 && top < 20, `wall tops ${top}`);
  const detailTop = Math.max(...vertices('perth-hotel-roofs-and-stone').map(v => v[1]));
  const foot = Math.min(...facade.map(v => v[1]));
  assert.ok(detailTop - foot > HOTEL_LEVELS.corner.tip && detailTop - foot < HOTEL_LEVELS.corner.tip + 3, `the corner spire tops the hotel: ${detailTop - foot}`);
});

test('the frozen frontage cameras stand in the car park and look at their subjects', () => {
  const cams = perthCameras(), park = frontageJson.parking.find((p: { id: string }) => p.id === 'way/24505868').ring as Pt[];
  const front = cams['pt-station-frontage'], hotel = cams['pt-station-hotel'];
  for (const c of [front, hotel]) assert.ok(inRing([c.pos[0], c.pos[2]], park), 'eye in the station car park (OSM way/24505868)');
  for (const c of [front, hotel]) assert.ok(Math.abs(c.pos[1] - 1.7 - scene.terrain.heightAt(c.pos[0], c.pos[2])) < .1, 'eye 1.7 m above the drawn ground');
  assert.ok(Math.hypot(front.target[0] - PERTH_ENTRANCE[0], front.target[2] - PERTH_ENTRANCE[1]) < 10, 'pt-station-frontage looks at the entrance');
  assert.ok(ringDist([hotel.target[0], hotel.target[2]], area(PERTH_HOTEL_ID).outer) < 5, 'pt-station-hotel looks at the hotel front');
});

test('clearance: nothing the frontage draws stands on a platform or in the train envelope, bar the bridge girders beside the rails', () => {
  const platforms = data.platforms.map(p => p.path), rails = data.rails.map(r => r.path);
  const railDist = (p: Pt) => Math.min(...rails.map(r => Math.min(...r.slice(1).map((q, i) => segDist(p, r[i], q)))));
  for (const name of ['perth-hotel-facade', 'perth-hotel-roofs-and-stone', 'perth-station-front', 'perth-frontage-glazing']) for (const [x, y, z] of vertices(name)) {
    assert.ok(!platforms.some(r => inRing([x, z], r)), `${name} vertex ${x},${y},${z} on a platform`);
    assert.ok(railDist([x, z]) > 2.1 || y > 4.8, `${name} vertex ${x},${y},${z} in the train envelope`);
  }
  for (const name of ['perth-kings-place-bridge', 'perth-kings-place-walls']) for (const [x, y, z] of vertices(name)) assert.ok(railDist([x, z]) > 1.75 || y < -.3, `${name} vertex ${x},${y},${z} clear of the train`);
});

test('the frontage\'s cost: within P2\'s caps (+24 draws, +240,000 triangles), and every frontage part drawn', () => {
  const stats = { triangles: 0, drawCalls: 0, platforms: 0, buildings: 0, roofs: 0, sleepers: 0, bridgeSegments: 0 }, geometries = new Set<THREE.BufferGeometry>(), mats: THREE.Material[] = [];
  const build: PerthBuild = { add: meshAdder(stats, geometries), own: m => { mats.push(m); return m; }, stats, geometries };
  const group = new THREE.Group();
  const info = addPerthFrontage(build, data, scene.terrain, group);
  try {
    assert.ok(info.drawCalls <= 24 && info.drawCalls >= 7, JSON.stringify(info));
    assert.ok(info.triangles < 240_000, JSON.stringify(info));
    assert.deepEqual(info.bridge, { sides: 2, ends: info.bridge.ends, panels: info.bridge.panels, walls: info.bridge.walls, roadSegments: info.bridge.roadSegments });
    assert.ok(info.bridge.roadSegments > 20, 'the cut roads are surfaced, with pavements');
    assert.ok(info.bridge.ends >= 2, 'abutments at both ends');
    assert.ok(info.bridge.panels >= 40, `the girders are panelled on both faces (R-pt2-d): ${info.bridge.panels}`);
    assert.ok(info.bridge.walls > 0, 'retaining walls line the cut (R-pt2-d)');
    assert.ok(info.front.edges >= 5, 'the street front walls the outline from the hotel corner to the east return');
    assert.ok(data.buildings.some(b => b.id === PERTH_STATION_BUILDING_ID));
  } finally { for (const g of geometries) g.dispose(); for (const m of mats) m.dispose(); }
});

test("King's Place is cut under the bridge to the R-pt2-d road level, and the cut leaves the platforms and open track alone", () => {
  const t = scene.terrain, line = kingsPlaceLine(), ring = frontageJson.bridge.ring as number[][];
  const xs = ring.map(p => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const under = line.filter(p => p[0] > x0 + 2 && p[0] < x1 - 2);
  assert.ok(under.length > 0, 'King\'s Place passes under the bridge');
  // the road drawn (cutSurface) is at R-pt2-d's level, and the terrain lies its `sink` under it, so no terrain triangle rises through it
  const roads = cutRoads(), open = perthTrack(data).ground, surface = (x: number, z: number) => cutSurfaceAt(roads, ring as Pt[], open, x, z);
  for (const p of under) assert.ok(Math.abs(surface(p[0], p[1])!.y - KINGS_PLACE_LEVELS.road) < .05, `road at ${p} is ${surface(p[0], p[1])?.y}`);
  for (const p of under) assert.ok(Math.abs(t.heightAt(p[0], p[1]) - (KINGS_PLACE_LEVELS.road - KINGS_PLACE_CUT.sink)) < .05, `terrain at ${p} is ${t.heightAt(p[0], p[1])}`);
  let paved = 0;
  for (let x = 40; x <= 140; x += 1.3) for (let z = -100; z <= -20; z += 1.3) { const v = surface(x, z); if (!v) continue; paved++;
    // 0.15 m: the 0.3 m sink less the 0.12 m kerb step the 0.5 m grid blends across, less 0.03; over the terrain mesh's 0.08 m tolerance (perth-city.ts)
    assert.ok(t.heightAt(x, z) <= v.y - .15, `terrain ${t.heightAt(x, z).toFixed(2)} rises through the drawn surface ${v.y.toFixed(2)} at ${x.toFixed(1)},${z.toFixed(1)}`); }
  assert.ok(paved > 500, `the cut is paved (${paved} samples)`);
  // the far wall's foot is paved: every point under the deck is
  const edge = (p: Pt) => Math.min(...ring.map((u, i) => segDist(p, u as Pt, ring[(i + 1) % ring.length] as Pt)));
  for (let x = x0; x <= x1; x += .7) for (let z = -80; z <= -64; z += .7) if (inRing([x, z], ring as Pt[]) && edge([x, z]) >= .55) assert.ok(surface(x, z), `under the deck at ${x},${z} unpaved`);
  // R-pt2-d's pixels: the underside 0.15 m over the eye, the road 3.9 m under it (perth-frontage-bridge.ts header)
  assert.ok(Math.abs(KINGS_PLACE_LEVELS.soffit - KINGS_PLACE_LEVELS.eye - .15) < 1e-9);
  assert.ok(Math.abs(KINGS_PLACE_LEVELS.eye - KINGS_PLACE_LEVELS.road - 3.9) < 1e-9);
  assert.equal(perthCameras()['pt-kings-place-bridge'].pos[1], KINGS_PLACE_LEVELS.eye, 'the frozen eye is R-pt2-d\'s (12:57 re-freeze)');
  // R-pt2-d's lens (13:18 re-freeze): the poster's 3.05 m = 178 px at about 40 m gives f ~ 2334 px; over the 800 px capture height
  const f = 178 / 3.05 * 40, lens = 2 * Math.atan(400 / f) * 180 / Math.PI;
  assert.ok(Math.abs(perthCameras()['pt-kings-place-bridge'].fov! - lens) < .1, `the frozen fov is R-pt2-d's lens (${lens.toFixed(2)} deg)`);
  // platforms keep the station's flattened level
  for (const pl of data.platforms) for (const [x, z] of pl.path) assert.ok(Math.abs(t.heightAt(x, z) + .2) < .05, `platform point ${x},${z} at ${t.heightAt(x, z)}`);
  // open rails off the bridge stay on the flattened ground
  for (const [ax, az, bx, bz] of open) for (const k of [0, .5, 1]) {
    const x = ax + (bx - ax) * k, z = az + (bz - az) * k;
    if (x < x0 - 30 || x > x1 + 30 || z < -100 || z > -20) continue;
    // where a ground rail meets the bridge, the abutment carries it: points within 1.5 m of the deck's outline are the abutments' business
    if (ring.some((p, i) => { const q = ring[(i + 1) % ring.length], dx = q[0] - p[0], dz = q[1] - p[1], u = Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - p[0] - u * dx, z - p[1] - u * dz) < 1.5; })) continue;
    assert.ok(t.heightAt(x, z) > -.3, `open rail at ${x},${z} left over the cut (${t.heightAt(x, z)})`);
  }
  // pt-kings-place-bridge's eye stands 1.7 m over the Bank's road (the carriageway, as R-pt2-d's photographer) and sees the girders above it
  const cam = perthCameras()['pt-kings-place-bridge'], bank = roads[1].level(cam.pos[0], cam.pos[2]);
  assert.ok(Math.abs(cam.pos[1] - bank - 1.7) < .05, `eye ${cam.pos[1]} over ${bank}`);
  // the aim (lead 13:35, from R-pt2-d): the near girder's NE end at photo x 1085 of 1280 at f 2334 px puts the axis about 11.9 deg east of north
  const yaw = Math.atan2(cam.target[0] - cam.pos[0], -(cam.target[2] - cam.pos[2])) * 180 / Math.PI;
  assert.ok(Math.abs(yaw - 12) < .2, `pt-kings-place-bridge bears ${yaw.toFixed(2)} deg`);
});

test('the ground mask (for the land-use drape, lead ruling 13:18) is plain data and covers the King\'s Place cut and the forecourt', () => {
  const station = data.buildings.find(b => b.id === PERTH_STATION_BUILDING_ID)!;
  const mask = perthFrontageGroundMask(station.outer);
  assert.deepEqual(JSON.parse(JSON.stringify(mask)), mask, 'plain numbers in plain arrays');
  const inside = (x: number, z: number) => inPerthFrontageGroundMask(mask, x, z);
  // the cut: King's Place under the deck and either side, St Leonard's Bank to the standpoint, the walls' feet
  for (const p of kingsPlaceLine()) if (p[0] > 50 && p[0] < 140) assert.ok(inside(p[0], p[1]), `King's Place ${p}`);
  for (const [x, z] of [[88, -39], [95.9, -67.1], [80, -71 - 4.5 - 1.8 - .5]]) assert.ok(inside(x, z), `cut ${x},${z}`);
  // the deck's paved floor and its walls' feet, past the road bands: behind the far abutment and by the deck's south-east corner
  for (const [x, z] of [[101, -77], [86, -77.5], [72, -68.5], [90, -79.5], [85.5, -64]]) assert.ok(inside(x, z), `under the deck ${x},${z}`);
  // the forecourt: the station-side paving, the hotel car park, the pavement before the entrance
  for (const [x, z] of [[-5, -50], [-20, -80], [PERTH_ENTRANCE[0], PERTH_ENTRANCE[1] - 2]]) assert.ok(inside(x, z), `forecourt ${x},${z}`);
  assert.ok(inside(-40, -76), 'the pavement along the street front, off the mapped roads');
  assert.ok(!inPerthFrontageGroundMask(perthFrontageGroundMask(), -40, -76), 'that pavement comes from the station outline');
  // and not the town at large
  for (const [x, z] of [[300, 300], [-300, -300], [0, 200]]) assert.ok(!inside(x, z), `town ${x},${z}`);
});
