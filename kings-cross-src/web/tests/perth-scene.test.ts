import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import * as THREE from 'three';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { PERTH_AREA, PERTH_ORIGIN, PERTH_STATION_BUILDING_ID } from '../../core/perth-data.ts';
import { createTerrain, terrainFromFunction } from '../../core/terrain.ts';
import type { TerrainFile } from '../../core/terrain.ts';
import { stationRailwayIntrusions } from '../src/station-railway.ts';
import { PERTH_DEFAULT_HEIGHT, PERTH_FALLBACK_HEIGHTS, PERTH_LEVELS, PERTH_STATION_ROOF_HEIGHT, buildPerthScene, onBridge, perthBuildingHeight, perthGround, perthTrack } from '../src/perth-scene.ts';
import { loadPerthScene } from '../src/perth.ts';
import { PERTH_FRONTAGE_OMIT_IDS } from '../src/perth-frontage.ts';

const json = readFileSync(new URL('../src/data/perth-scene.json', import.meta.url), 'utf8');
const data = unpackWaverleyScene(JSON.parse(json));
const terrainFile = JSON.parse(readFileSync(new URL('../src/data/perth-terrain.json', import.meta.url), 'utf8')) as TerrainFile;
const raw = createTerrain(terrainFile);
const scene = buildPerthScene({ lighting: false });
test.after(() => scene.dispose());

test('the committed Perth OSM scene is public OSM in Perth\'s own frame: seven platforms, the station outline, the Tay bridge, no NR data', () => {
  assert.deepEqual(data.origin, PERTH_ORIGIN);
  assert.deepEqual(data.bbox, PERTH_AREA.bbox);
  assert.match(data.attribution, /OpenStreetMap contributors \(ODbL\)/);
  assert.match(data.source.license, /^ODbL 1\.0/);
  assert.deepEqual(data.platforms.map(p => p.ref).sort(), ['1', '2', '3', '4', '5', '6', '7']);
  const station = data.buildings.find(b => b.id === PERTH_STATION_BUILDING_ID);
  assert.ok(station, 'the mapped station outline');
  assert.equal(station.tags.name, 'Perth Railway Station', 'its name kept, so its footprint is never simplified');
  assert.ok(data.rails.some(r => r.id === 'way/4438951' && onBridge(r.tags)), 'the railway bridge over the Tay is mapped as a bridge');
  // Only the kept OSM tags reach the file: nothing from a train describer, a schedule or SMART.
  assert.doesNotMatch(json, /berth|stanox|tiploc|TRUST|SMART/i);
  assert.ok(gzipSync(json).length < 160_000, `the lazy Perth data chunk stays lean: ${gzipSync(json).length} B gzip`);
});

test('the terrain is the Phase I DTM: Kinnoull Hill stands over 200 m above the station floor, the Tay lies below it, OGL credited', () => {
  assert.match(terrainFile.attribution, /Scottish public sector LiDAR.*Open Government Licence v3/);
  const provenance = (terrainFile as unknown as { provenance: { urls: string[]; railwayWarp: boolean; missingSamples: number } }).provenance;
  assert.ok(provenance.urls.every(u => u.includes('/lidar/phase-1/dtm/')), 'Phase I tiles');
  assert.equal(provenance.railwayWarp, false); assert.equal(provenance.missingSamples, 0);
  let top = -Infinity;
  for (let x = 1600; x <= 2560; x += 16) for (let z = -600; z <= 900; z += 16) top = Math.max(top, raw.heightAt(x, z));
  assert.ok(top > 200 && top < 215, `Kinnoull Hill's summit (222 m AOD) over the 10.7 m station datum: ${top}`);
  assert.ok(raw.heightAt(850, -225) < -5, 'the Tay east of the station lies well below the station floor');
});

test('the ground is level under the platforms and the station, and the Tay bridge does not pull the river up to the rails', () => {
  const ground = perthGround(data, raw);
  for (const p of data.platforms) {
    const c = p.path.reduce((s, q) => [s[0] + q[0] / p.path.length, s[1] + q[1] / p.path.length], [0, 0]);
    assert.ok(Math.abs(ground.heightAt(c[0], c[1]) - PERTH_LEVELS.ground) < 0.05, `platform ${p.ref} sits on the station floor`);
  }
  // On the real data every platform is within the rails' 8 m flattening too, so hold the platform rule alone on a slope with no rail.
  const slope = terrainFromFunction((x, z) => 5 + x / 10 + z / 20, { x0: -64, z0: -64, x1: 64, z1: 64 }, 8, { q: .001, groundY: -.2 });
  const lone = perthGround({ ...data, rails: [], buildings: [], platforms: [{ id: 'p', ref: '9', tags: {}, path: [[-10, -2], [10, -2], [10, 2], [-10, 2]] }] }, slope);
  assert.ok(Math.abs(lone.heightAt(0, 0) - PERTH_LEVELS.ground) < 0.05, `a platform alone is floored: ${lone.heightAt(0, 0)}`);
  assert.ok(lone.heightAt(60, 0) > 5, 'and the slope beyond it keeps its height');
  const { bridge, ground: onGround } = perthTrack(data);
  assert.ok(bridge.length > 10 && onGround.length > 100);
  // Mid-river under the Tay bridge (OSM way/4438951 at about x 922, z -43): the source DTM, not the rail datum.
  assert.ok(ground.heightAt(922, -43) < -5, `the river under the bridge keeps its level: ${ground.heightAt(922, -43)}`);
  assert.ok(Math.abs(ground.heightAt(922, -43) - raw.heightAt(922, -43)) < 0.5);
});

test('every drawn city block stands off the railway; the station outline is the roof, not a solid block', () => {
  const intrusions = new Set(stationRailwayIntrusions(data));
  assert.ok(intrusions.has(PERTH_STATION_BUILDING_ID), 'the station outline spans the tracks');
  assert.ok(!scene.buildingIds.some(id => intrusions.has(id)));
  // The city draws every block but those on the railway and those the frontage draws itself (perth-frontage.ts PERTH_FRONTAGE_OMIT_IDS).
  assert.ok(PERTH_FRONTAGE_OMIT_IDS.every(id => !intrusions.has(id) && !scene.buildingIds.includes(id)));
  assert.equal(scene.buildingIds.length, data.buildings.length - intrusions.size - PERTH_FRONTAGE_OMIT_IDS.length);
  const roof = scene.group.getObjectByName('perth-station-roof') as THREE.Mesh;
  roof.geometry.computeBoundingBox();
  assert.equal(roof.geometry.boundingBox!.max.y, PERTH_STATION_ROOF_HEIGHT);
  assert.ok(PERTH_STATION_ROOF_HEIGHT - 0.6 > 4.8, 'the roof and its fascia stay above the train envelope');
});

test('fallback heights: OSM heights stand, a Perth house is two storeys, not the shared builder\'s 12 m', () => {
  const house = { height: 12, minHeight: 0, heightBasis: 'ASSUMED 12m; OSM height absent; ASSUMED minHeight 0m', tags: { building: 'house' } };
  assert.deepEqual(perthBuildingHeight(house), { height: PERTH_FALLBACK_HEIGHTS.house, basis: 'ASSUMED' });
  assert.deepEqual(perthBuildingHeight({ ...house, tags: { building: 'yes' } }), { height: PERTH_DEFAULT_HEIGHT, basis: 'ASSUMED' });
  assert.deepEqual(perthBuildingHeight({ ...house, height: 15, heightBasis: 'ASSUMED 3m per OSM building:levels; ASSUMED minHeight 0m' }), { height: 15, basis: 'OSM' });
  assert.deepEqual(perthBuildingHeight({ ...house, height: 21, heightBasis: 'OSM height; ASSUMED minHeight 0m' }), { height: 21, basis: 'OSM' });
  assert.equal(scene.heightBasis.OSM + scene.heightBasis.LiDAR + scene.heightBasis.ASSUMED, scene.buildingIds.length);
});

/** The scene's draw-call bound (lead ruling 2026-11-10): the phase-1 scene's own draws plus each phase-2 element's cap, and never past
 *  the per-frame ceiling. Each figure from the rubric that sets it (gfx-rubrics/, held in the round's scratch):
 *  - phase 1: 11 draws (perth-station.md, "Phase 1 baseline (Node build)");
 *  - P1 station +24 (perth-station.md "Cost caps"), P2 frontage +24 (perth-frontage.md; perth-frontage.test.ts holds it), P3 city +24
 *    (perth-city.md; perth-city.test.ts holds it);
 *  - the per-frame ceiling: fewer than 1,000 draw calls (rubric-common.md, and each Perth rubric's "Per frame" row). */
const PERTH_DRAW_BOUND = {phase1: 11, caps: {station: 24, frontage: 24, city: 24}, frame: 1000} as const;
const drawBound = Math.min(PERTH_DRAW_BOUND.frame - 1, PERTH_DRAW_BOUND.phase1 + Object.values(PERTH_DRAW_BOUND.caps).reduce((a, b) => a + b, 0));

test('the scene\'s parts, costs and credits; the roof and city toggles; dispose empties it', () => {
  for (const part of ['terrain', 'track', 'platforms', 'roof', 'buildings'] as const) assert.ok(scene.parts[part].children.length > 0, `${part} drawn`);
  assert.ok(scene.stats.triangles < 2_000_000 && scene.stats.drawCalls <= drawBound, `${JSON.stringify(scene.stats)} against ${drawBound} draws`);
  assert.match(scene.attribution, /OpenStreetMap.*Scottish public sector LiDAR/);
  const hidden = buildPerthScene({ lighting: false, roofVisible: false, cityVisible: false });
  try { assert.equal(hidden.parts.roof.visible, false); assert.equal(hidden.parts.buildings.visible, false); assert.equal(hidden.parts.track.visible, true); }
  finally { hidden.dispose(); }
  assert.equal(hidden.group.children.length, 0);
});

test('the Perth view loads the model with its geometry, or falls back to the honest placeholder', async () => {
  const view = await loadPerthScene({ modelLoader: async () => ({ buildPerthScene: () => ({ group: new THREE.Group(), dispose() {} }) }), geometryLoader: async () => ({ default: JSON.parse(json) }) });
  assert.equal(view.placeholder, false); assert.equal(view.geometry?.platforms.length, 7);
  const framed = view.view(1.6); assert.ok(framed.eye.every(Number.isFinite) && framed.eye[1] > 100);
  view.dispose();
  const empty = await loadPerthScene({ modelLoader: null, geometryLoader: null });
  assert.equal(empty.placeholder, true); assert.match(empty.message, /^Perth: model not built yet/);
  const broken = await loadPerthScene({ modelLoader: async () => { throw new Error('chunk 404'); }, geometryLoader: async () => ({ default: JSON.parse(json) }) });
  assert.equal(broken.placeholder, true); assert.match(broken.message, /model unavailable \(chunk 404\)/);
});
