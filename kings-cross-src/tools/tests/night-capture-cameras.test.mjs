import assert from 'node:assert/strict';
import test from 'node:test';
import { stationCameras, waverleyCameras } from '../evidence.mjs';

test('the N2 Euston Road lamp camera has its frozen position and lens', () => {
  const camera = stationCameras()['kx-euston-road-lamp'];
  assert.ok(camera, 'missing kx-euston-road-lamp');
  const { pos, target, fov, near } = camera;
  assert.deepEqual({ pos, target, fov, near }, {
    pos: [-78, 2.765, 133.5],
    target: [-88.75, 5.91, 133.06],
    fov: 59,
    near: 0.1,
  });
});

test('the N2 Waverley signal camera has its frozen position and lens', () => {
  const camera = waverleyCameras()['wv-platform-signal'];
  assert.ok(camera, 'missing wv-platform-signal');
  const { pos, target, fov, near } = camera;
  assert.deepEqual({ pos, target, fov, near }, {
    pos: [119, 2.515, 5],
    target: [141.29, 3.5, 4.47],
    fov: 45,
    near: 0.1,
  });
});
