import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAreaSclassJobs } from '../sclass-areas.mjs';

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
