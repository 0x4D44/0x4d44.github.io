import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { solarPosition } from '../../core/solar.ts';
import { terrainFromFunction } from '../../core/terrain.ts';
import type { WaverleyScene as SceneData } from '../../core/waverley-data.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { loadWaverleyScene } from '../src/waverley.ts';
import type { WaverleyView } from '../src/waverley.ts';
import { createSceneWeather, createWaverleyWeather, sceneWeatherOptions } from '../src/station-weather.ts';
import { coverAt, coverUniforms, findRoofs } from '../src/cover.ts';
import { addWorld } from '../src/world.ts';

const location = { lat: 55.9519018, lon: -3.1904199 };
const timeMs = Date.parse('2026-11-09T12:00:00Z');
const camera = new THREE.PerspectiveCamera(50, 1.44, .5, 9000);
camera.position.set(10, 20, 40);
const frame = (wallMs = 1000) => ({ timeMs, wallMs, camera, target: new THREE.Vector3() });
const rect = (a: number, b: number): [number, number][] => [[a,a],[b,a],[b,b],[a,b]];
function model() {
  const data: SceneData = { origin: location, bbox: [55,-4,56,-3], attribution: 'synthetic',
    source: { url: 'synthetic', fetchedAt: '2026-01-01', sha256: 'synthetic', license: 'ODbL', query: 'synthetic' },
    rails: [], platforms: [{ id: 'synthetic', ref: '1', path: rect(-20,20), tags: {} }],
    roofs: [{ id: 'synthetic-roof', outer: rect(-10,10), holes: [rect(-2,2)], height: 8, minHeight: 0, heightBasis: 'ASSUMED synthetic', kind: 'building', tags: {} }],
    buildings: [], warnings: [] };
  return { data, built: buildWaverleyScene({ data, terrain: terrainFromFunction(() => -.2, { x0:-64,z0:-64,x1:64,z1:64 }, 8) }) };
}
async function viewOf() {
  const { data, built } = model();
  const view = await loadWaverleyScene({ modelLoader: async () => ({ buildWaverleyScene: () => built }), geometryLoader: async () => ({ default: data }) });
  return { view, built };
}

test('both stations use the same weather pins and Waverley solar location with zero requests', async () => {
  const { view } = await viewOf(); let requests = 0;
  const climate = createWaverleyWeather(view, { ...sceneWeatherOptions('rain', null), fetchImpl: async () => { ++requests; throw new Error('must not fetch a pinned sky'); } });
  view.climate = climate;
  try {
    climate.update(frame());
    const actual = climate.atmosphere.state()!, expected = solarPosition(timeMs, location.lat, location.lon);
    assert.ok(Math.abs(actual.sun.elevationDeg - expected.elevationDeg) < 1e-10);
    assert.equal(actual.timeMs, timeMs);
    assert.ok(actual.weather.rain > 0);
    assert.equal(requests, 0);
    assert.match(climate.status(timeMs, ' (time pinned)'), /sun .*time pinned.*weather: rain.*not measured/);
    assert.ok((climate.atmosphere.precip.rain.material as THREE.ShaderMaterial).uniforms.uCoverRect === coverUniforms.uCoverRect);
    assert.ok(view.scene.getObjectByName('sun-disc'));
  } finally { view.dispose(); }
});

test('Waverley rain and snow stop below the drawn mapped roof and leave its central hole open', async () => {
  const { view } = await viewOf();
  const climate = createWaverleyWeather(view, sceneWeatherOptions('snow', null)); view.climate = climate;
  try {
    climate.update(frame());
    assert.ok(findRoofs(view.scene).some(m => m.name === 'waverley-mapped-roofs'), 'the Scottish roof must be included');
    const map = climate.atmosphere.cover(); assert.ok(map, 'drawn Waverley roofs need a weather mask');
    assert.equal(coverAt(map, 5, 1, 5), 1, 'platform under roof is dry');
    assert.equal(coverAt(map, 0, 1, 0), 0, 'OSM roof hole stays open');
    assert.equal(coverAt(map, 30, 1, 30), 0, 'outside is open');
    assert.ok(climate.atmosphere.precip.snow.visible);
    assert.ok((climate.atmosphere.precip.snow.material as THREE.ShaderMaterial).uniforms.uCoverMap === coverUniforms.uCoverMap);
  } finally { view.dispose(); }
});

test('switching scenes rebinds roof and wetness uniforms even inside the quarter-second throttle', async () => {
  const london = new THREE.Scene(), world = addWorld(london, { grid:false });
  const londonClimate = createSceneWeather({ scene: london, world, sites:null, weather: sceneWeatherOptions('clear',null) });
  const { view } = await viewOf();
  const edinburgh = createWaverleyWeather(view, sceneWeatherOptions('snow',null)); view.climate = edinburgh;
  try {
    londonClimate.update(frame(1000));
    assert.equal(coverUniforms.uCoverRect.value.z, 0);
    edinburgh.update(frame(1016));
    const map = edinburgh.atmosphere.cover()!;
    assert.ok((coverUniforms.uCoverMap.value as THREE.DataTexture).image.data === map.heights);
    londonClimate.atmosphere.rescan(); // a late London lazy chunk must not replace the active Scottish roof mask
    edinburgh.update(frame(1032));
    assert.ok((coverUniforms.uCoverMap.value as THREE.DataTexture).image.data === map.heights);
    view.dispose();
    londonClimate.update(frame(1048));
    assert.equal(coverUniforms.uCoverRect.value.z, 0);
    assert.equal(londonClimate.atmosphere.state()!.weather.snow, 0);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    // The live shared surface values must be London again, not the cached Scottish snow.
    let surface: THREE.MeshLambertMaterial | undefined;
    london.traverse(o => { if ((o as THREE.Mesh).material instanceof THREE.MeshLambertMaterial) surface = (o as THREE.Mesh).material as THREE.MeshLambertMaterial; });
    surface!.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
    assert.equal((shader.uniforms as Record<string, THREE.IUniform>).uSnowCover!.value, 0);
  } finally { view.dispose(); londonClimate.dispose(); }
});

test('Waverley climate disposal cancels its feed, frees only owned sky geometry and restores builder lights', async () => {
  const { view, built } = await viewOf();
  const original = new Set(view.scene.children), builderLights: THREE.Light[] = [];
  built.group.traverse(o => { if (o instanceof THREE.Light) builderLights.push(o); });
  let seq = 0; const pending = new Map<number, () => void>();
  const timers = { setTimeout(fn: () => void) { pending.set(++seq, fn); return seq; }, clearTimeout(id: unknown) { pending.delete(id as number); } };
  const climate = createWaverleyWeather(view, { mode:'live',timers,now:()=>timeMs,fetchImpl:async()=>new Response(JSON.stringify({ current: {
    time:'2026-11-09T12:00',weather_code:0,cloud_cover:0,precipitation:0,
  } })) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pending.size, 1, 'successful live feed has a future refresh');
  assert.ok(builderLights.every(l => !l.visible), 'one active sky rig');
  const sky = view.scene.children.find(o => o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) as THREE.Mesh;
  let skyFreed = 0, modelFreed = 0;
  sky.geometry.addEventListener('dispose', () => ++skyFreed);
  (built.parts.platforms.children[0] as THREE.Mesh).geometry.addEventListener('dispose', () => ++modelFreed);
  climate.dispose(); climate.dispose();
  assert.equal(skyFreed, 1); assert.equal(modelFreed, 0);
  assert.equal(pending.size, 0, 'inactive station leaves no weather poll');
  assert.ok(builderLights.every(l => l.visible));
  assert.deepEqual(new Set(view.scene.children), original);
  view.dispose(); assert.equal(modelFreed, 1);
});

test('weather mode selection keeps replay date, off/0 and forced pins common to both locations', () => {
  assert.deepEqual(sceneWeatherOptions(null,null), { mode:'live' });
  assert.deepEqual(sceneWeatherOptions(null,'2026-11-07',location), { mode:'replay',date:'2026-11-07',location });
  for(const pin of ['off','0']) assert.deepEqual(sceneWeatherOptions(pin,'2026-11-07'), { mode:'off' });
  assert.deepEqual(sceneWeatherOptions('snow','2026-11-07'), { mode:'forced',forced:'snow' });
});


test('unloading the Waverley view also disposes its attached climate exactly once', async () => {
  const { view } = await viewOf();
  const climate = createWaverleyWeather(view, sceneWeatherOptions('off',null)); view.climate = climate;
  let freed = 0;
  const sky = view.scene.children.find(o => o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) as THREE.Mesh;
  sky.geometry.addEventListener('dispose', () => ++freed);
  try { view.dispose(); view.dispose(); assert.equal(freed,1,'lazy scene owner disposes the active weather'); }
  finally { climate.dispose(); }
});
