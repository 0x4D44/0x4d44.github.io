import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { project } from '../../core/geo.ts';
import type { Pt } from '../../core/geo.ts';
import { PERTH_ORIGIN, PERTH_STATION_BUILDING_ID } from '../../core/perth-data.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { perthCameras } from '../../tools/evidence.mjs';
import { meshAdder } from '../src/waverley-mesh.ts';
import { buildPerthScene } from '../src/perth-scene.ts';
import type { PerthBuild } from '../src/perth-scene.ts';
import { PERTH_FRONTAGE_OMIT_IDS, addPerthFrontage } from '../src/perth-frontage.ts';
import { HOTEL_LEVELS, PERTH_HOTEL_ID, PERTH_HOTEL_SOURCE, hotelFrame } from '../src/perth-frontage-hotel.ts';
import { PERTH_ENTRANCE } from '../src/perth-frontage-street.ts';

const sceneJson = JSON.parse(readFileSync(new URL('../src/data/perth-scene.json', import.meta.url), 'utf8'));
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
  for (const [x, y, z] of vertices('perth-kings-place-bridge')) assert.ok(railDist([x, z]) > 1.75 || y < -.3, `bridge vertex ${x},${y},${z} clear of the train`);
});

test('the frontage\'s cost: within P2\'s caps (+24 draws, +240,000 triangles), and every frontage part drawn', () => {
  const stats = { triangles: 0, drawCalls: 0, platforms: 0, buildings: 0, roofs: 0, sleepers: 0, bridgeSegments: 0 }, geometries = new Set<THREE.BufferGeometry>(), mats: THREE.Material[] = [];
  const build: PerthBuild = { add: meshAdder(stats, geometries), own: m => { mats.push(m); return m; }, stats, geometries };
  const group = new THREE.Group();
  const info = addPerthFrontage(build, data, scene.terrain, group);
  try {
    assert.ok(info.drawCalls <= 24 && info.drawCalls >= 7, JSON.stringify(info));
    assert.ok(info.triangles < 240_000, JSON.stringify(info));
    assert.deepEqual(info.bridge, { sides: 2, ends: info.bridge.ends });
    assert.ok(info.front.edges >= 5, 'the street front walls the outline from the hotel corner to the east return');
    assert.ok(data.buildings.some(b => b.id === PERTH_STATION_BUILDING_ID));
  } finally { for (const g of geometries) g.dispose(); for (const m of mats) m.dispose(); }
});
