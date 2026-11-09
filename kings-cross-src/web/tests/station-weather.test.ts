import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CLEAR_FOG, describeSun, fogRange, lampLevelFor } from '../../core/daylight.ts';
import { solarPosition } from '../../core/solar.ts';
import { terrainFromFunction } from '../../core/terrain.ts';
import type { WaverleyScene as SceneData } from '../../core/waverley-data.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { loadWaverleyScene } from '../src/waverley.ts';
import type { WaverleyView } from '../src/waverley.ts';
import { activateSceneAtmosphere, createSceneWeather, createWaverleyWeather, lightWaverleyNight, sceneWeatherOptions, WAVERLEY_HAZE } from '../src/station-weather.ts';
import { coverAt, coverUniforms, findRoofs } from '../src/cover.ts';
import { liveUrl } from '../src/weather.ts';
import type { WeatherFeedOptions } from '../src/weather.ts';
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
  // (not assert.deepEqual of the two sets: a failure would print the whole scene graph, and the diff of it does not finish)
  assert.ok(view.scene.children.length === original.size && view.scene.children.every(o => original.has(o)), 'the scene is as it was: the sky, the ground ring, the precipitation and the sun lights are gone and nothing else');
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

// ---- two scenes, one set of shaders: whichever is on show owns the shared roofs, wetness and snow ------------------------------------------------

/** A flat 10 m roof at 6 m, named like a real one so the cover map is drawn from it. */
function roofAt(x: number, z: number, name = 'canopy-glass'): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([x - 5, 6, z - 5, x - 5, 6, z + 5, x + 5, 6, z + 5, x + 5, 6, z - 5], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = name;
  return mesh;
}
/** A London-like scene: the page's world and a climate over it. */
function londonOf(weather: WeatherFeedOptions = sceneWeatherOptions('clear', null)) {
  const scene = new THREE.Scene(), world = addWorld(scene, { grid: false });
  return { scene, world, climate: createSceneWeather({ scene, world, sites: null, weather }) };
}
const sharedHeights = (): Uint8Array => (coverUniforms.uCoverMap.value as THREE.DataTexture).image.data as Uint8Array;
const settled = (): Promise<void> => new Promise(resolve => setImmediate(resolve));
/** The timers a feed is given, that never fire. */
function idleTimers() {
  let seq = 0; const pending = new Map<number, () => void>();
  return { pending, setTimeout(fn: () => void) { pending.set(++seq, fn); return seq; }, clearTimeout(id: unknown) { pending.delete(id as number); } };
}

test('a roof drawn late into the scene that is not on show does not take the roofs from the scene that is; the scene on show takes them back on its next frame', async () => {
  const london = londonOf();
  const { view } = await viewOf();
  const edinburgh = createWaverleyWeather(view, sceneWeatherOptions('snow', null)); view.climate = edinburgh;
  try {
    edinburgh.update(frame(1000));
    const own = edinburgh.atmosphere.cover()!;
    assert.ok(sharedHeights() === own.heights, 'Edinburgh is on show: the shared roofs are its own');
    london.scene.add(roofAt(300, 300));
    london.climate.atmosphere.rescan(); // a lazy chunk of the other scene arriving late
    assert.ok(sharedHeights() === london.climate.atmosphere.cover()!.heights, 'that scan drew the other scene\'s roofs into the shared map (the thing to be undone)');
    edinburgh.update(frame(1016));
    assert.ok(sharedHeights() === own.heights, 'the scene on show has its own roofs back on its next frame, though it was the scene on show all along');
  } finally { view.dispose(); london.climate.dispose(); }
});

test('a scene with no roofs, on show, shows none, whatever roofs the other scene drew late into the shared map', async () => {
  const london = londonOf();
  const { view } = await viewOf();
  const edinburgh = createWaverleyWeather(view, sceneWeatherOptions('snow', null)); view.climate = edinburgh;
  try {
    london.climate.update(frame(1000));
    assert.equal(coverUniforms.uCoverRect.value.z, 0, 'London has no roofs');
    view.scene.add(roofAt(300, 300));
    edinburgh.atmosphere.rescan();
    assert.ok(coverUniforms.uCoverRect.value.z > 0, 'that scan put Edinburgh\'s roofs in the shared map (the thing to be undone)');
    london.climate.update(frame(1016));
    assert.equal(coverUniforms.uCoverRect.value.z, 0, 'London is on show and has no roofs, so the shaders see none');
  } finally { view.dispose(); london.climate.dispose(); }
});

test('putting a scene on show reports a change once, then none until the other scene has taken the shared roofs', () => {
  const bare = londonOf(), roofed = londonOf();
  roofed.scene.add(roofAt(40, 40));
  roofed.climate.atmosphere.rescan();
  try {
    assert.equal(activateSceneAtmosphere(bare.climate.atmosphere), true, 'a scene that was not on show comes on show');
    assert.equal(activateSceneAtmosphere(bare.climate.atmosphere), false, 'asked again, nothing changes');
    assert.equal(coverUniforms.uCoverRect.value.z, 0);
    assert.equal(activateSceneAtmosphere(roofed.climate.atmosphere), true, 'the other scene takes the roofs');
    assert.ok(sharedHeights() === roofed.climate.atmosphere.cover()!.heights);
    assert.equal(activateSceneAtmosphere(roofed.climate.atmosphere), false, 'and keeps them');
    assert.equal(activateSceneAtmosphere(bare.climate.atmosphere), true, 'the first comes back on show');
    assert.equal(coverUniforms.uCoverRect.value.z, 0, 'with none');
    assert.equal(activateSceneAtmosphere(bare.climate.atmosphere), false);
  } finally { bare.climate.dispose(); roofed.climate.dispose(); }
});

test('a scene with no weather of its own, put back on show, takes the other scene\'s snow and wet off the shared ground at once, inside the quarter-second throttle', async () => {
  const london = londonOf({ mode: 'off' });
  const surface = new THREE.MeshLambertMaterial({ color: 0x808080 });
  surface.name = 'asphalt';
  london.scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), surface));
  london.climate.atmosphere.rescan();
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  surface.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const { view } = await viewOf();
  const edinburgh = createWaverleyWeather(view, sceneWeatherOptions('snow', null)); view.climate = edinburgh;
  try {
    london.climate.update(frame(1000));
    assert.equal(shader.uniforms.uSnowCover!.value, 0, 'no snow in London');
    edinburgh.update(frame(1016));
    assert.ok((shader.uniforms.uSnowCover!.value as number) > 0.5, 'Edinburgh\'s snow lies on the shared ground');
    london.climate.update(frame(1032));
    assert.equal(shader.uniforms.uSnowCover!.value, 0, 'London, back on show 16 ms later, has none of it');
    assert.equal(shader.uniforms.uWet!.value, 0, 'nor the wet');
  } finally { view.dispose(); london.climate.dispose(); }
});

test('once its climate is disposed a scene is left alone: no new weather, the dome stays where it was, the shared roofs are not touched', () => {
  const { world, climate } = londonOf();
  climate.update(frame(1000));
  const sky = climate.atmosphere.state()!, domeAt = world.sky.position.toArray();
  climate.dispose();
  const elsewhere = new THREE.PerspectiveCamera(); elsewhere.position.set(900, 1, 2);
  assert.doesNotThrow(() => climate.update({ timeMs: timeMs + 7 * 3_600_000, wallMs: 60_000, camera: elsewhere, target: new THREE.Vector3() }));
  assert.ok(climate.atmosphere.state() === sky, 'the sky worked out before is the last one');
  assert.deepEqual(world.sky.position.toArray(), domeAt, 'and the dome does not follow the camera');
  assert.equal(coverUniforms.uCoverRect.value.z, 0);
});

test('a climate puts the dome round the camera every frame, says nothing of the sky before it has one, and takes the sun disc and stars off the dome when it ends', () => {
  const { world, climate } = londonOf(sceneWeatherOptions('rain', null));
  assert.equal(climate.status(timeMs), '', 'before the first frame there is no sky to describe');
  assert.equal(climate.status(timeMs, ' (time pinned)'), '');
  const eye = new THREE.PerspectiveCamera(); eye.position.set(7, 8, 9);
  const look = new THREE.Vector3();
  climate.update({ timeMs, wallMs: 1000, camera: eye, target: look });
  assert.deepEqual(world.sky.position.toArray(), [7, 8, 9], 'the dome rides with the camera');
  eye.position.set(-300, 2, 60);
  climate.update({ timeMs, wallMs: 1016, camera: eye, target: look });
  assert.deepEqual(world.sky.position.toArray(), [-300, 2, 60], 'on every frame');
  const sun = describeSun(climate.atmosphere.state()!.sun.elevationDeg);
  assert.equal(climate.status(timeMs), ` · ${sun} · ${climate.feed.status(timeMs)}`);
  assert.equal(climate.status(timeMs, ' (time pinned)'), ` · ${sun} (time pinned) · ${climate.feed.status(timeMs)}`);
  assert.ok(world.sky.getObjectByName('sun-disc') && world.sky.getObjectByName('stars'));
  climate.dispose();
  // (assert.ok, not assert.equal against undefined: a failure would print the whole scene graph the object hangs from)
  assert.ok(!world.sky.getObjectByName('sun-disc'), 'the atmosphere is disposed with the climate: no sun disc on the dome');
  assert.ok(!world.sky.getObjectByName('stars'), 'and no stars');
});

/** Seventy-two hourly rows of an Open-Meteo archive from midnight UTC on `first`; `hour(i)` overrides row `i`. */
function archiveFrom(first: string, hour: (i: number) => Record<string, number> = () => ({})) {
  const cols: Record<string, number[]> = { weather_code: [], cloud_cover: [], precipitation: [], rain: [], snowfall: [], wind_speed_10m: [], is_day: [] };
  const time: string[] = [];
  for (let i = 0; i < 72; i++) {
    time.push(new Date(Date.parse(`${first}T00:00:00Z`) + i * 3_600_000).toISOString().slice(0, 16));
    const row: Record<string, number> = { weather_code: 1, cloud_cover: 20, precipitation: 0, rain: 0, snowfall: 0, wind_speed_10m: 7.2, is_day: 1, ...hour(i) };
    for (const key of Object.keys(cols)) cols[key]!.push(row[key]!);
  }
  return { hourly_units: { time: 'iso8601', wind_speed_10m: 'km/h' }, hourly: { time, ...cols } };
}

test('a scene shows the weather of the time it is showing, not of the wall clock: a replayed wet hour is wet at that hour and not at another', async () => {
  const requests: string[] = [];
  const rows = archiveFrom('2026-11-08', (i): Record<string, number> => (i === 24 + 12 ? { weather_code: 63, cloud_cover: 100, precipitation: 1.4, rain: 1.4 } : {}));
  const { climate } = londonOf({ mode: 'replay', date: '2026-11-09', timers: idleTimers(), now: () => Date.parse('2026-11-09T15:00:00Z'),
    fetchImpl: (async (input: unknown) => { requests.push(String(input)); return new Response(JSON.stringify(rows)); }) as typeof fetch });
  try {
    await settled();
    assert.equal(requests.length, 1, 'the archive was asked for');
    climate.update(frame(1000)); // the scene time is 12:00 UTC on the 9th; the wall clock reads 1000 ms after the epoch
    assert.ok(climate.atmosphere.state()!.weather.rain > 0, 'wet at the hour that was wet');
    climate.update({ ...frame(2000), timeMs: Date.parse('2026-11-09T05:00:00Z') });
    assert.equal(climate.atmosphere.state()!.weather.rain, 0, 'and dry at five in the morning');
  } finally { climate.dispose(); }
});

test('the Scottish weather is asked for at Waverley, whatever options the page gave', async () => {
  const { view } = await viewOf();
  const requests: string[] = [];
  const timers = idleTimers();
  const climate = createWaverleyWeather(view, { mode: 'live', timers, now: () => timeMs,
    fetchImpl: (async (input: unknown) => { requests.push(String(input)); return new Response(JSON.stringify({ current: { time: '2026-11-09T12:00', weather_code: 0, cloud_cover: 0, precipitation: 0 } })); }) as typeof fetch });
  try {
    await settled();
    assert.deepEqual(requests, [liveUrl(location)]);
    assert.ok(requests[0]!.includes('latitude=55.9519018&longitude=-3.1904199'), requests[0]);
  } finally { climate.dispose(); view.dispose(); }
});

test('weather is only for a scene that is built: a placeholder, or a view with no geometry, is refused and left untouched', async () => {
  const { view } = await viewOf();
  const children = [...view.scene.children];
  try {
    assert.throws(() => createWaverleyWeather({ ...view, placeholder: true } as WaverleyView, sceneWeatherOptions('rain', null)), /requires a built geographic scene/);
    assert.throws(() => createWaverleyWeather({ ...view, geometry: undefined } as unknown as WaverleyView, sceneWeatherOptions('rain', null)), /requires a built geographic scene/);
    assert.ok(view.scene.children.length === children.length && view.scene.children.every((o, i) => o === children[i]), 'nothing was added to the scene');
  } finally { view.dispose(); }
});

test('the Scottish climate leaves the scene as it found it: its background and fog back, the lights that were on on and the ones that were off off', async () => {
  const { view } = await viewOf();
  const on = new THREE.DirectionalLight(0xffffff, 1), off = new THREE.PointLight(0xffffff, 1);
  off.visible = false;
  view.scene.add(on, off);
  const background = new THREE.Color(0x123456), fog = new THREE.Fog(0x654321, 5, 50);
  view.scene.background = background; view.scene.fog = fog;
  const climate = createWaverleyWeather(view, sceneWeatherOptions('rain', null));
  try {
    climate.update(frame());
    assert.ok(view.scene.background !== background && view.scene.fog !== fog, 'the climate paints its own');
    assert.deepEqual([on.visible, off.visible], [false, false], 'and has the one sky rig');
    view.scene.traverse(o => assert.ok(!(o instanceof THREE.GridHelper), 'no measuring grid in a real place'));
  } finally { climate.dispose(); }
  assert.ok(view.scene.background === background, 'the background is the one that was there');
  assert.ok(view.scene.fog === fog, 'and so is the fog');
  assert.deepEqual([background.getHex(), fog.color.getHex(), fog.near, fog.far], [0x123456, 0x654321, 5, 50], 'untouched by the climate');
  assert.deepEqual([on.visible, off.visible], [true, false], 'a light that was off stays off');
  view.dispose();
});

const ringOf = (scene: THREE.Object3D): THREE.Mesh | undefined => scene.getObjectByName('ground-outside-terrain') as THREE.Mesh | undefined;
/** The distinct x (axis 0) or z (axis 2) values among a mesh's vertices. */
const coordinates = (mesh: THREE.Mesh, axis: 0 | 2): number[] => {
  const position = mesh.geometry.getAttribute('position');
  return [...new Set(Array.from({ length: position.count }, (_, i) => (axis === 0 ? position.getX(i) : position.getZ(i))))].sort((a, b) => a - b);
};

test('the flat ground is left only outside the scene\'s own terrain: the hole in it is the terrain\'s extent', async () => {
  const { view } = await viewOf();
  const climate = createWaverleyWeather(view, sceneWeatherOptions('clear', null));
  try {
    const ring = ringOf(view.scene);
    assert.ok(ring, 'there is flat ground outside the terrain');
    for (const axis of [0, 2] as const) {
      const at = coordinates(ring!, axis);
      assert.ok(at.includes(-64) && at.includes(64), `the hole runs from -64 m to 64 m: ${at}`);
      assert.ok(!at.includes(-120) && !at.includes(120), `and is not the platforms' reach: ${at}`);
    }
    let flat = 0;
    view.scene.traverse(o => { if (((o as THREE.Mesh).material as THREE.Material | undefined)?.name === 'ground-flat') flat++; });
    assert.equal(flat, 1, 'the only flat ground is the ring: the plane it was carved from is gone');
  } finally { climate.dispose(); view.dispose(); }
});

test('with no terrain to say how far the scene reaches, the flat ground starts a hundred metres beyond the platforms, on every side', async () => {
  const { view } = await viewOf();
  const bare = { ...view, model: { ...view.model, terrain: undefined } } as unknown as WaverleyView;
  const climate = createWaverleyWeather(bare, sceneWeatherOptions('clear', null));
  try {
    const ring = ringOf(view.scene);
    assert.ok(ring, 'there is flat ground outside');
    // the one platform is the square from -20 m to 20 m
    const [x, z] = [coordinates(ring!, 0), coordinates(ring!, 2)];
    assert.ok(x.includes(-120), `west: ${x}`);
    assert.ok(x.includes(120), `east: ${x}`);
    assert.ok(z.includes(-120), `north: ${z}`);
    assert.ok(z.includes(120), `south: ${z}`);
  } finally { climate.dispose(); view.dispose(); }
});

test('disposal frees the sky and the flat ground, geometry and material, and nothing of the model', async () => {
  const { view, built } = await viewOf();
  const climate = createWaverleyWeather(view, sceneWeatherOptions('clear', null));
  const sky = view.scene.children.find(o => o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) as THREE.Mesh;
  const ring = ringOf(view.scene)!;
  const freed: string[] = [];
  for (const [name, mesh] of [['sky', sky], ['flat ground', ring]] as const) {
    mesh.geometry.addEventListener('dispose', () => freed.push(`${name} geometry`));
    (mesh.material as THREE.Material).addEventListener('dispose', () => freed.push(`${name} material`));
  }
  const platform = built.parts.platforms.children[0] as THREE.Mesh;
  platform.geometry.addEventListener('dispose', () => freed.push('model geometry'));
  (platform.material as THREE.Material).addEventListener('dispose', () => freed.push('model material'));
  climate.dispose();
  assert.deepEqual(freed.sort(), ['flat ground geometry', 'flat ground material', 'sky geometry', 'sky material']);
  view.dispose();
});

/** The three meshes the Scottish night lighting looks for, by name, each with a Lambert material of its own (the frontage and the city clone theirs). */
function nightMeshes() {
  const group = new THREE.Group();
  const add = (name: string, y: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = name;
    mesh.position.y = y;
    group.add(mesh);
    return mesh;
  };
  return { group, walls: add('waverley-building-walls', 0), parapets: add('waverley-balmoral-and-bridge-parapets', 5), dials: add('waverley-balmoral-clock-dials', 40) };
}
const lambertOf = (mesh: THREE.Mesh): THREE.MeshLambertMaterial => mesh.material as THREE.MeshLambertMaterial;
const compileOf = (m: THREE.Material): string => {
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return s.fragmentShader;
};

test('lightWaverleyNight: the city blocks get lit windows, the Balmoral\'s stone is floodlit from the foot of its tower and its dials glow, each material alone, and the function it returns puts them all back (round seven)', () => {
  const { group, walls, parapets, dials } = nightMeshes();
  const before = [walls, parapets, dials].map((mesh) => ({ defines: lambertOf(mesh).defines, key: lambertOf(mesh).customProgramCacheKey(), compile: lambertOf(mesh).onBeforeCompile }));
  const undo = lightWaverleyNight(group);
  const w = lambertOf(walls), p = lambertOf(parapets), d = lambertOf(dials);
  assert.ok(w.defines && 'WALL_WIN' in w.defines && 'WIN_MODE' in w.defines, 'the walls\' windows');
  assert.ok(!('FLOOD' in (w.defines ?? {})), 'the walls are no floodlit tower');
  // the stone of the tower is lit from where the ground is under it: the lowest point of the mesh (5 m up, 4 m tall: its foot is 3 m up)
  assert.equal(p.defines?.FLOOD, 'vec4( 0.25, 30.0, 0.25, 3.0 )');
  assert.ok(!('WALL_WIN' in (p.defines ?? {})), 'and has no windows of its own');
  // a clock dial is lit all over: no fall-off (a reach of a metre, a floor of one), and over strength 1 so it reads as lit from within
  assert.equal(d.defines?.FLOOD, 'vec4( 1.5, 1.0, 1.0, 0.0 )');
  assert.ok(String(w.customProgramCacheKey()).endsWith('+litWalls'), 'the walls are a program of their own');
  assert.equal(p.customProgramCacheKey(), before[1]!.key, 'the flood is a define: the program key is the same, the define makes the program');
  assert.ok(compileOf(w).includes('float winHash('), 'the walls compile with the night functions');
  undo();
  [walls, parapets, dials].forEach((mesh, i) => {
    const m = lambertOf(mesh);
    assert.equal(m.defines, before[i]!.defines, `${mesh.name}: its defines, as they were`);
    assert.equal(m.customProgramCacheKey(), before[i]!.key, `${mesh.name}: its key`);
    assert.equal(m.onBeforeCompile, before[i]!.compile, `${mesh.name}: its patch`);
  });
  // a scene without them, or whose materials are not Lambert (a basic one has no emissive term to add to), is left alone, with nothing to undo
  const empty = new THREE.Group();
  const basic = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  basic.name = 'waverley-building-walls';
  empty.add(basic);
  assert.doesNotThrow(() => lightWaverleyNight(empty)());
  assert.equal((basic.material as THREE.MeshBasicMaterial).defines, undefined);
  assert.doesNotThrow(() => lightWaverleyNight(new THREE.Group())());
});

test('the Scottish climate lights the Scottish night and puts it back with the climate: the walls\' windows, the Balmoral\'s flood and dials, over the roof shade the atmosphere gives every wall', async () => {
  const { view } = await viewOf();
  const { group, walls, parapets, dials } = nightMeshes();
  view.scene.add(group);
  const climate = createWaverleyWeather(view, sceneWeatherOptions('clear', null));
  view.climate = climate;
  try {
    const w = lambertOf(walls);
    assert.ok(w.defines && 'WALL_WIN' in w.defines, 'lit windows on the walls');
    const f = compileOf(w);
    assert.ok(f.includes('float winHash(') && f.includes('coverGroundAt'), 'over the roof shade: both patches are in the program');
    assert.ok(String(lambertOf(parapets).defines?.FLOOD).startsWith('vec4( 0.25, 30.0, 0.25, '), 'the tower is floodlit');
    assert.equal(lambertOf(dials).defines?.FLOOD, 'vec4( 1.5, 1.0, 1.0, 0.0 )');
    assert.ok(compileOf(lambertOf(parapets)).includes('#ifdef FLOOD'), 'the flood needs the roof shade\'s patch, which the atmosphere gave the stone');
  } finally { climate.dispose(); }
  assert.ok(!('WALL_WIN' in (lambertOf(walls).defines ?? {})), 'the walls\' windows go with the climate');
  assert.ok(!('FLOOD' in (lambertOf(parapets).defines ?? {})) && !('FLOOD' in (lambertOf(dials).defines ?? {})), 'and the flood');
  assert.ok(!compileOf(lambertOf(walls)).includes('float winHash('));
  view.dispose();
});

// ---- the Scottish street lamps (round seven): a lazy chunk of their own, a moment after the scene --------------------------------------------------

/** Wait, up to ten seconds, for the Scottish street lamps to come into the scene (they load a moment after it). */
async function lampsIn(scene: THREE.Object3D): Promise<THREE.Group> {
  for (let waited = 0; waited < 10_000; waited += 20) {
    const group = scene.getObjectByName('street-lamps');
    if (group) return group as THREE.Group;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('the Scottish street lamps did not come into the scene');
}

test('the Scottish scene has its street lamps a moment after it: dark by day, lit at the sky\'s own lamp level through the dusk and the night, and none left when its climate ends', async () => {
  const { view } = await viewOf();
  const climate = createWaverleyWeather(view, sceneWeatherOptions('clear', null));
  view.climate = climate;
  let wall = 0;
  const at = (iso: string | number): number => {
    climate.update({ ...frame(), timeMs: typeof iso === 'number' ? iso : Date.parse(iso), wallMs: (wall += 1000) });
    return climate.atmosphere.state()!.rig.lampLevel;
  };
  try {
    assert.equal(view.scene.getObjectByName('street-lamps'), undefined, 'not there with the scene: a lazy chunk');
    assert.equal(at('2026-11-09T12:00:00Z'), 0, 'noon');
    const group = await lampsIn(view.scene);
    assert.equal(group.parent, view.scene, 'in the scene it was made for');
    const halos = group.getObjectByName('street-lamp-halos') as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    const pools = group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    assert.ok(halos && pools && pools.count >= 900, `a pool to each of ${pools?.count} lamps`);
    // it arrived at the level the sky had at the time: none
    assert.deepEqual([halos.visible, pools.visible], [false, false], 'nothing glows by day');
    // dusk: the first minute the sky's lamp level is about half, the lamps are half lit
    let dusk = Date.parse('2026-11-09T15:00:00Z');
    while (lampLevelFor(solarPosition(dusk, location.lat, location.lon).elevationDeg) < 0.5) dusk += 60_000;
    const half = at(dusk);
    assert.ok(half > 0.4 && half < 0.6, `dusk is ${half}`);
    assert.ok(Math.abs(pools.material.opacity - half) < 1e-9 && Math.abs(halos.material.opacity - 0.9 * half) < 1e-9, 'lit as the sky says');
    assert.deepEqual([halos.visible, pools.visible], [true, true]);
    // night: all the way on; and off again by day
    assert.equal(at('2026-11-09T23:00:00Z'), 1);
    assert.deepEqual([halos.material.opacity, pools.material.opacity, halos.visible, pools.visible], [0.9, 1, true, true]);
    assert.equal(at('2026-11-10T12:00:00Z'), 0);
    assert.deepEqual([halos.visible, pools.visible], [false, false], 'dark again by day');
    at('2026-11-09T23:00:00Z');
    climate.dispose();
    assert.equal(view.scene.getObjectByName('street-lamps'), undefined, 'the climate takes its lamps with it');
    assert.equal(group.parent, null);
  } finally { climate.dispose(); view.dispose(); }
});

test('a lamp layer that arrives after dusk comes in lit: the level it is given is the last the sky gave, not the level it was made at', async () => {
  const { view } = await viewOf();
  const climate = createWaverleyWeather(view, sceneWeatherOptions('clear', null));
  view.climate = climate;
  try {
    climate.update({ ...frame(), timeMs: Date.parse('2026-11-09T23:00:00Z') });
    assert.equal(climate.atmosphere.state()!.rig.lampLevel, 1);
    const group = await lampsIn(view.scene);
    assert.equal((group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh).visible, true, 'lit as it arrives');
    assert.equal(((group.getObjectByName('street-lamp-halos') as THREE.Points).material as THREE.PointsMaterial).opacity, 0.9);
  } finally { climate.dispose(); view.dispose(); }
});

test('a climate that ends before its lamps have loaded leaves the scene without them: they are not added late, and what was made is freed', async () => {
  const { view } = await viewOf();
  const added: string[] = [];
  const add = view.scene.add.bind(view.scene);
  view.scene.add = ((...objects: THREE.Object3D[]) => { added.push(...objects.map((o) => o.name)); return add(...objects); }) as typeof view.scene.add;
  const dispose = THREE.BufferGeometry.prototype.dispose;
  let freed = 0;
  THREE.BufferGeometry.prototype.dispose = function (this: THREE.BufferGeometry) { freed++; dispose.call(this); };
  try {
    const climate = createWaverleyWeather(view, sceneWeatherOptions('clear', null));
    climate.dispose();
    freed = 0;
    // the lamps are made a moment later, and freed as they come: the post, the halo and the pool geometry
    for (let waited = 0; waited < 10_000 && freed < 3; waited += 20) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(freed, 3, 'the geometry of the layer that was made too late');
    await settled();
    assert.equal(freed, 3, 'and once');
    assert.ok(!added.includes('street-lamps'), `added late: ${added}`);
    assert.equal(view.scene.getObjectByName('street-lamps'), undefined);
  } finally { THREE.BufferGeometry.prototype.dispose = dispose; view.dispose(); }
});

test('a scene with no ground to stand lamps on has none, and no complaint; lamps that cannot be made are a warning and not a broken scene', async () => {
  const { view } = await viewOf();
  const bare = { ...view, model: { ...view.model, terrain: undefined } } as unknown as WaverleyView;
  const warn = console.warn;
  const warned: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warned.push(args); };
  try {
    const climate = createWaverleyWeather(bare, sceneWeatherOptions('clear', null));
    const control = await viewOf();
    const controlClimate = createWaverleyWeather(control.view, sceneWeatherOptions('clear', null));
    try {
      await lampsIn(control.view.scene); // a scene with ground has its lamps: by then any the first was to have, begun earlier, has come
      assert.equal(view.scene.getObjectByName('street-lamps'), undefined, 'no terrain, no lamps');
      assert.deepEqual(warned, [], 'and nothing to say about it');
    } finally { controlClimate.dispose(); control.view.dispose(); climate.dispose(); }
    // a ground that throws: no lamps, the scene as it was, and the reason told
    const terrain = view.model!.terrain as unknown as Record<string, unknown>;
    const broken = { ...view, model: { ...view.model, terrain: { ...terrain, heightAt: () => { throw new Error('no ground'); } } } } as unknown as WaverleyView;
    const second = createWaverleyWeather(broken, sceneWeatherOptions('clear', null));
    try {
      for (let waited = 0; waited < 10_000 && warned.length === 0; waited += 20) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(warned.length, 1, 'one warning');
      assert.match(String(warned[0]?.[0]), /Waverley street lamps unavailable/);
      assert.match(String(warned[0]?.[1]), /no ground/);
      assert.equal(view.scene.getObjectByName('street-lamps'), undefined);
      second.update(frame());
      assert.ok(view.scene.getObjectByName('sun-disc'), 'the rest of the climate goes on');
    } finally { second.dispose(); }
  } finally { console.warn = warn; view.dispose(); }
});

// ---- the Scottish haze (round seven, the W3 city element's C6): the Castle and the horizon recede from Calton Hill; London's haze is as it was --------------

test('the Scottish clear air is hazier than London\'s, and London\'s is untouched: its fog ends where it always ended; in weather each scene has the nearer of the weather\'s own fog and its haze', async () => {
  assert.ok(WAVERLEY_HAZE.far < CLEAR_FOG.far && WAVERLEY_HAZE.far >= 1000, `a haze (${WAVERLEY_HAZE.far} m) nearer than the clear air's ${CLEAR_FOG.far} m, but past the Castle, 1.2 km from Calton Hill`);
  const seen: Record<string, { scotland: [number, number]; london: [number, number] }> = {};
  for (const name of ['clear', 'rain', 'fog']) {
    const { view } = await viewOf();
    const scotland = createWaverleyWeather(view, sceneWeatherOptions(name, null));
    const london = londonOf(sceneWeatherOptions(name, null));
    try {
      scotland.update(frame());
      london.climate.update(frame());
      const [s, l] = [view.scene.fog as THREE.Fog, london.scene.fog as THREE.Fog];
      seen[name] = { scotland: [s.near, s.far], london: [l.near, l.far] };
      // London is the page's own, whatever the Scottish scene does: fogRange, to the metre
      const own = fogRange(london.climate.atmosphere.state()!.weather.visibilityM, camera.position.y);
      assert.deepEqual([l.near, l.far], [own.near, own.far], `${name}: London's fog`);
      // the Scottish scene is the same fog with its far plane brought in to the haze, no further
      assert.deepEqual([s.near, s.far], [own.near, Math.min(own.far, WAVERLEY_HAZE.far)], `${name}: the Scottish fog`);
    } finally { scotland.dispose(); london.climate.dispose(); view.dispose(); }
  }
  assert.deepEqual(seen.clear, { scotland: [CLEAR_FOG.near, WAVERLEY_HAZE.far], london: [CLEAR_FOG.near, CLEAR_FOG.far] }, 'clear air: the one place the two differ for the Scottish haze alone');
  assert.ok((seen.rain as { scotland: [number, number]; london: [number, number] }).scotland[1] === WAVERLEY_HAZE.far, 'rain is thinner than the haze: the haze');
  assert.deepEqual((seen.fog as { scotland: [number, number]; london: [number, number] }).scotland, (seen.fog as { scotland: [number, number]; london: [number, number] }).london, 'fog is thicker than the haze: the weather\'s own, the same in both');
});
