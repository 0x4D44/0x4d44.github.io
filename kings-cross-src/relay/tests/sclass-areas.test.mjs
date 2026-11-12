import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAreaSclassJobs } from '../sclass-areas.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('area S-class jobs isolate state and share root recordings while preserving Y9 overrides', async () => {
  const configured = [], lifecycle = [];
  const jobs = createAreaSclassJobs({ dataDir: '/private/kx-data', areas: ['Y9', 'ZZ'],
    anchorsPath: '/private/y9-anchors.json', tablePath: '/private/y9-sclass.json',
    areaAssets: { ZZ: { anchorsPath: '/private/kx-data/areas/ZZ/anchors.json',
      tablePath: '/private/kx-data/areas/ZZ/sclass.json', overlayPath: '/assets/zz-signals.json', trackPath: '/assets/zz-track.json' } },
    createJob: options => {
      configured.push(options);
      return { start() { lifecycle.push(`start:${options.area}`); }, async stop() { lifecycle.push(`stop:${options.area}`); } };
    } });

  assert.deepEqual(configured.map(({ area, dataDir, anchorsPath, tablePath, recordingsDir, overlayPath, trackPath }) =>
    ({ area, dataDir, anchorsPath, tablePath, recordingsDir, overlayPath, trackPath })), [
    { area: 'Y9', dataDir: '/private/kx-data', anchorsPath: '/private/y9-anchors.json', tablePath: '/private/y9-sclass.json',
      recordingsDir: undefined, overlayPath: undefined, trackPath: undefined },
    { area: 'ZZ', dataDir: '/private/kx-data/areas/ZZ', anchorsPath: '/private/kx-data/areas/ZZ/anchors.json',
      tablePath: '/private/kx-data/areas/ZZ/sclass.json', recordingsDir: '/private/kx-data/recordings',
      overlayPath: '/assets/zz-signals.json', trackPath: '/assets/zz-track.json' },
  ]);
  assert.deepEqual(jobs.unavailable, []);
  jobs.start();
  await jobs.stop();
  assert.deepEqual(lifecycle, ['start:Y9', 'start:ZZ', 'stop:Y9', 'stop:ZZ']);
});

test('area S-class jobs report non-Y9 areas unavailable without area-specific render assets', () => {
  const configured = [], logs = [];
  const jobs = createAreaSclassJobs({ dataDir: '/private/kx-data', areas: ['Y9', 'ZZ'], log: line => logs.push(line),
    createJob: options => { configured.push(options); return { start() {}, stop() {} }; } });
  assert.deepEqual(configured.map(options => options.area), ['Y9']);
  assert.deepEqual(jobs.unavailable, [{ area: 'ZZ', reason: 'area-specific overlay and track are required' }]);
  assert.deepEqual(logs, ['sclass relearn unavailable for ZZ: area-specific overlay and track are required']);
});

test('area S-class jobs reject unsafe and duplicate area ids', () => {
  assert.throws(() => createAreaSclassJobs({ dataDir: '/private/kx-data', areas: ['Y9', '../'] }), /areas: invalid area/);
  assert.throws(() => createAreaSclassJobs({ dataDir: '/private/kx-data', areas: ['Y9', 'Y9'] }), /duplicate area/);
});

test('the EB relearn is configured by default from the committed Waverley overlay and scene, its table private under areas/EB', () => {
  const configured = [], logs = [];
  const jobs = createAreaSclassJobs({ dataDir: '/private/kx-data', areas: ['Y9', 'EB'], log: line => logs.push(line),
    createJob: options => { configured.push(options); return { start() {}, stop() {} }; } });
  assert.deepEqual(jobs.unavailable, []); assert.deepEqual(logs, []);
  const eb = configured.find(options => options.area === 'EB');
  assert.deepEqual({ dataDir: eb.dataDir, anchorsPath: eb.anchorsPath, tablePath: eb.tablePath, overlayPath: eb.overlayPath, trackPath: eb.trackPath }, {
    dataDir: '/private/kx-data/areas/EB', anchorsPath: '/private/kx-data/areas/EB/anchors.json', tablePath: '/private/kx-data/areas/EB/sclass.json',
    overlayPath: path.join(packageRoot, 'web/src/data/waverley-signals.json'), trackPath: path.join(packageRoot, 'web/src/data/waverley-scene.json') });
});
