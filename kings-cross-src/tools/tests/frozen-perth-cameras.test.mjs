// The Perth cameras are frozen like the Waverley cameras (frozen-waverley-cameras.test.mjs): each is a literal in tools/evidence.mjs
// (FROZEN_PERTH_CAMERAS) equal to tools/tests/frozen-perth-cameras.json. To change a camera on purpose, change both together and
// re-freeze the Perth baseline.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { PERTH_ELEMENT_VIEWS, PERTH_READY_CONDITION, PERTH_SELECT_SCRIPT, REMOTE_CAPTURE_SITES, WAVERLEY_READY_CONDITION, optionsFrom, perthAddress, perthCameras, resolveWaverleyViews, waverleyCameras, waverleySidecar } from '../evidence.mjs';
import { scenePinFrom } from '../scene-pin.mjs';

const frozen = JSON.parse(await readFile(new URL('./frozen-perth-cameras.json', import.meta.url), 'utf8'));

test('every Perth camera is its frozen value, field for field, in the frozen order, and there are 10 (pt-station-hotel added by lead ruling 2026-11-10)', () => {
  const cameras = perthCameras();
  for (const name of new Set([...Object.keys(frozen), ...Object.keys(cameras)])) assert.ok(isDeepStrictEqual(cameras[name], frozen[name]), `${name} differs from its frozen value`);
  assert.deepEqual(Object.keys(cameras), Object.keys(frozen));
  assert.equal(Object.keys(cameras).length, 10);
  for (const [name, c] of Object.entries(cameras)) {
    assert.ok(name.startsWith('pt-') && c.pos.length === 3 && c.target.length === 3 && c.source.length > 40, `${name} is placed with a stated source`);
    assert.ok(!Object.hasOwn(waverleyCameras(), name), 'no name shared with Waverley');
  }
  const first = perthCameras(); first['pt-overview'].pos[0] += 100;
  assert.ok(isDeepStrictEqual(perthCameras()['pt-overview'], frozen['pt-overview']), 'every call returns fresh cameras');
});

test('the Perth element views name only frozen cameras, and --views resolves them under --scene perth only', () => {
  for (const [element, views] of Object.entries(PERTH_ELEMENT_VIEWS)) for (const view of views) assert.ok(Object.hasOwn(frozen, view), `${element} lists ${view}`);
  const site = REMOTE_CAPTURE_SITES.perth;
  assert.deepEqual([...resolveWaverleyViews('perth-city', site.cameras(), site.elements, site.label)], PERTH_ELEMENT_VIEWS['perth-city']);
  assert.throws(() => resolveWaverleyViews('wv-overview', site.cameras(), site.elements, site.label), /unknown Perth view/);
  assert.equal(optionsFrom(['--scene', 'perth', '--views', 'perth-station']).scene, 'perth');
  assert.throws(() => optionsFrom(['--scene', 'perth', '--views', 'wv-overview']), /unknown Perth view/);
  assert.throws(() => optionsFrom(['--scene', 'perth', '--relay', 'http://127.0.0.1:8787']), /--scene perth captures the frozen Perth cameras only; remove --relay/);
  assert.throws(() => optionsFrom(['--scene', 'waverley', '--views', 'pt-overview']), /unknown Waverley view/);
});

test('a Perth capture selects Perth with trains off, waits for the real Perth scene, and labels its sidecars Perth', () => {
  const pin = scenePinFrom();
  assert.equal(perthAddress(pin), '?station=perth&trains=none&board=0&tooltip=0&time=2026-06-21T12%3A00%3A00%2B01%3A00&weather=clear');
  assert.match(PERTH_SELECT_SCRIPT, /select\('perth',false\)/);
  assert.match(PERTH_READY_CONDITION, /s\.selected==='perth'&&!!e&&!e\.placeholder/);
  assert.match(PERTH_READY_CONDITION, /k\.stations\.perth\(\)/);
  assert.notEqual(PERTH_READY_CONDITION, WAVERLEY_READY_CONDITION);
  assert.deepEqual([REMOTE_CAPTURE_SITES.perth.dir, REMOTE_CAPTURE_SITES.perth.view], ['perth', 'k.stations.perth()']);
  const camera = perthCameras()['pt-platform-4-north'];
  const metadata = { camera: { pos: camera.pos, target: camera.target, fov: 60, near: .1 }, renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)', drawCalls: 11, triangles: 580413, viewport: { width: 1280, height: 800 }, url: 'u', sun: 54 };
  assert.equal(waverleySidecar({ name: 'pt-platform-4-north', file: 'perth/pt-platform-4-north.png', camera, metadata, build: {}, pin, scene: 'perth' }).scene, 'perth');
  assert.equal(waverleySidecar({ name: 'x', file: 'x', camera, metadata, build: {}, pin }).scene, 'edinburgh-waverley', 'Waverley sidecars unchanged');
});
