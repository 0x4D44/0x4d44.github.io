// The Edinburgh Waverley cameras are frozen like the London station cameras (frozen-cameras.test.mjs): each is a literal in
// tools/evidence.mjs (FROZEN_WAVERLEY_CAMERAS) equal to gfx-rubrics/waverley/frozen-cameras.json, whose copy is
// tools/tests/frozen-waverley-cameras.json (sha256 267c1238881f2a4fdb110d8d384e6061d5e17526f81daf6bb258a550f18059b7). The scorers'
// camera check compares pos, target and fov with it and voids a view that moved. To change a camera on purpose, change both together
// and re-freeze the Waverley baseline.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { WAVERLEY_ELEMENT_VIEWS, buildId, cameraDeparture, optionsFrom, resolveWaverleyViews, waverleyAddress, waverleyCameras, waverleySidecar } from '../evidence.mjs';
import { PIN_TIME, PIN_WEATHER, scenePinFrom } from '../scene-pin.mjs';

const frozen = JSON.parse(await readFile(new URL('./frozen-waverley-cameras.json', import.meta.url), 'utf8'));

function differences(cameras, expected) {
  const found = [];
  for (const name of new Set([...Object.keys(expected), ...Object.keys(cameras)])) {
    const have = cameras[name], want = expected[name];
    if (!have || !want) { found.push(`${name} ${have ? 'is not in the frozen baseline' : 'is missing'}`); continue; }
    for (const field of new Set([...Object.keys(want), ...Object.keys(have)])) {
      if (!isDeepStrictEqual(have[field], want[field])) found.push(`${name}.${field} is ${JSON.stringify(have[field])}, frozen ${JSON.stringify(want[field])}`);
    }
  }
  return found;
}

// 13 since 2026-11-09: wv-waverley-steps, left unplaced by the rubric until W2 built the steps, was placed from R-wv1-d2.
test('every Waverley camera is its frozen value, field for field, in the frozen order, and there are 13', () => {
  const cameras = waverleyCameras();
  assert.deepEqual(differences(cameras, frozen), []);
  assert.deepEqual(Object.keys(cameras), Object.keys(frozen));
  assert.equal(Object.keys(cameras).length, 13);
});

test('every call returns fresh cameras, so editing one call\'s result changes nothing for the next', () => {
  const first = waverleyCameras();
  first['wv-overview'].pos[0] += 100;
  delete first['wv-scott-monument'];
  assert.deepEqual(differences(waverleyCameras(), frozen), []);
});

test('the element view lists name only frozen cameras, and --views resolves elements and names', () => {
  for (const [element, views] of Object.entries(WAVERLEY_ELEMENT_VIEWS)) for (const view of views) assert.ok(Object.hasOwn(frozen, view), `${element} lists ${view}`);
  assert.equal(resolveWaverleyViews('all'), null);
  assert.deepEqual([...resolveWaverleyViews('waverley-frontage,wv-overview')], [...WAVERLEY_ELEMENT_VIEWS['waverley-frontage'], 'wv-overview']);
  assert.throws(() => resolveWaverleyViews('wv-booking-hall'), /unknown Waverley view/);
});

test('a Waverley capture selects Edinburgh with trains off and carries the London pin, and refuses the London pack\'s live options', () => {
  const options = optionsFrom(['--scene', 'waverley']);
  assert.equal(options.scene, 'waverley');
  assert.deepEqual(options.pin, { mode: 'pinned', time: PIN_TIME, weather: PIN_WEATHER });
  assert.equal(waverleyAddress(options.pin), '?station=edinburgh-waverley&trains=none&board=0&tooltip=0&time=2026-06-21T12%3A00%3A00%2B01%3A00&weather=clear');
  assert.throws(() => optionsFrom(['--scene', 'waverley', '--relay', 'http://127.0.0.1:8787']), /remove --relay/);
  assert.throws(() => optionsFrom(['--scene', 'waverley', '--views', 'south-front']), /unknown Waverley view/);
  assert.throws(() => optionsFrom(['--scene', 'edinburgh']), /--scene must be/);
  assert.throws(() => optionsFrom(['--scene', 'waverley', '--commit', 'main']), /--commit/);
  assert.equal(optionsFrom([]).scene, 'kings-cross');
});

test('a sidecar records the build, the frozen and actual camera, and validGpu; a moved camera shows as a departure', () => {
  const camera = waverleyCameras()['wv-overview'];
  const metadata = { camera: { pos: camera.pos, target: camera.target, fov: 50, near: .1 }, renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)', drawCalls: 19, triangles: 314424, viewport: { width: 1280, height: 800 }, url: 'u', sun: 54.7 };
  const files = [{ file: 'index.html', sha256: 'a' }, { file: 'assets/x.js', sha256: 'b' }];
  const build = { dist: '/d', commit: 'abc1234', id: buildId(files) };
  assert.equal(buildId(files), buildId([...files].reverse()), 'independent of listing order');
  assert.notEqual(buildId(files), buildId([{ file: 'index.html', sha256: 'c' }, files[1]]));
  const sidecar = waverleySidecar({ name: 'wv-overview', file: 'waverley/wv-overview.png', camera, metadata, build, pin: scenePinFrom(), pinHonoured: true, lighting: 'f', lightingState: {}, flicker: { pass: true }, hud: null, when: 'now' });
  assert.equal(sidecar.validGpu, true);
  assert.deepEqual(sidecar.build, build);
  assert.deepEqual(sidecar.camera.frozen, { pos: camera.pos, target: camera.target, fov: null });
  assert.deepEqual(sidecar.camera.departure, []);
  assert.deepEqual(sidecar.renderInfo, { drawCalls: 19, triangles: 314424 });
  assert.equal(waverleySidecar({ name: 'x', file: 'x', camera, metadata: { ...metadata, renderer: 'ANGLE (Google, SwiftShader)' }, build, pin: scenePinFrom() }).validGpu, false);
  assert.deepEqual(cameraDeparture(camera, { ...metadata.camera, pos: [camera.pos[0] + .01, camera.pos[1], camera.pos[2]] }).length, 1);
  const underside = waverleyCameras()['wv-roof-underside'];
  assert.deepEqual(cameraDeparture(underside, { pos: underside.pos, target: underside.target, fov: 50 }), ['fov is 50, frozen 70']);
});
