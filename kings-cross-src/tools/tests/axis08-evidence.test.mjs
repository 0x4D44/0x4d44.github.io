import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';
import { sizeReport, hardwareReport, summarizeRuns, collectRuns, BUDGET_BYTES, main, evidenceMarkdown } from '../axis08-evidence.mjs';
import { startupObserver, extractTiming } from '../perf.mjs';
const scratch = path.resolve(import.meta.dirname, '../../../.scratch/axis08-tests');
const timing = (first, full) => ({ navigationStartToSceneRenderedMs: first, navigationStartToFullSceneRenderedMs: full });
const report = () => ({ success: true, startup: { coldFreshProfile: timing(100, 600), warmSecondLoadSameProfile: timing(50, 300) }, cameras: Object.fromEntries(['overview', 'shed'].map(name => [name, { realMetal: true, renderer: 'ANGLE Apple Metal', rAFThrottleDetected: false, fps: { median: 60, p5: 60 }, frameMs: { p95: 16.5, p99: 20 } }])) });

test('every emitted file including geometry and source maps contributes to explicit gzip totals', async () => {
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(path.join(scratch, 'dist-'));
  await mkdir(path.join(dir, 'assets'));
  const bodies = { 'index.html': '<html/>', 'assets/geometry.json': '{"terrain":[1,2,3]}', 'assets/main.js': 'render()', 'assets/main.js.map': '{"sources":[]}' };
  for (const [name, body] of Object.entries(bodies)) await writeFile(path.join(dir, name), body);
  const result = await sizeReport(dir);
  assert.equal(BUDGET_BYTES, 2000000);
  assert.equal(result.files.length, 4);
  assert.equal(result.allEmittedGzipBytes, Object.values(bodies).reduce((sum, body) => sum + gzipSync(body).length, 0));
  assert.equal(result.sourceMapsGzipBytes, gzipSync(bodies['assets/main.js.map']).length);
  assert.equal(result.appPayloadGzipBytes, result.allEmittedGzipBytes - result.sourceMapsGzipBytes);
  assert.equal(result.files.find(row => row.file.endsWith('.map')).classification, 'source-map');
});

test('hardware inventory selects model and GPU without retaining serial identifiers', async () => {
  const hardware = await hardwareReport('darwin', async () => ({ stdout: JSON.stringify({ SPHardwareDataType: [{ machine_model: 'Mac Studio', serial_number: 'PRIVATE' }], SPDisplaysDataType: [{ sppci_model: 'Apple GPU' }] }) }));
  assert.equal(hardware.model, 'Mac Studio');
  assert.deepEqual(hardware.gpu, ['Apple GPU']);
  assert.ok(hardware.cpu && hardware.os.release);
  assert.ok(!JSON.stringify(hardware).includes('PRIVATE'));
});

test('cold/warm summaries distinguish first render and full city readiness and reject missing measurements', () => {
  const result = summarizeRuns([report(), report(), report()]);
  assert.equal(result.samples.cold.length, 3);
  assert.equal(result.aggregates.cold.firstRenderMs.median, 100);
  assert.equal(result.aggregates.cold.sceneReadyMs.median, 600);
  assert.equal(result.aggregates.warm.sceneReadyMs.median, 300);
  assert.throws(() => summarizeRuns([report()]), /two/);
  const invalid = report(); invalid.startup.coldFreshProfile.navigationStartToFullSceneRenderedMs = null;
  assert.throws(() => summarizeRuns([invalid, report()]), /measurement/);
});

test('genuine Metal requires both cameras and rejects software or throttled measurements', () => {
  assert.equal(summarizeRuns([report(), report()]).genuineMetal, true);
  for (const change of [{ realMetal: false }, { renderer: 'SwiftShader Metal' }, { rAFThrottleDetected: true }]) {
    const invalid = report(); Object.assign(invalid.cameras.shed, change);
    assert.equal(summarizeRuns([invalid, report()]).genuineMetal, false);
  }
});

test('orchestration runs independent pairs and uses existing FPS only on first pair', async () => {
  const calls = [];
  await collectRuns(3, async (index, startupOnly) => { calls.push([index, startupOnly]); return report(); });
  assert.deepEqual(calls, [[0, false], [1, true], [2, true]]);
});

test('full scene waits for city completion, actual geometry and a later renderer submission', async () => {
  let resolveCity, now = 10;
  const window = {};
  vm.runInNewContext(`(${startupObserver.toString()})()`, { window, performance: { now: () => now } });
  const renderer = { info: { render: { frame: 0 } }, render() { this.info.render.frame++; } };
  const k = { renderer, cityLoaded: new Promise(resolve => { resolveCity = resolve; }), parts: {}, feed: {}, trains: [] };
  window.__kx = k;
  renderer.render();
  assert.equal(window.__kxStartup.sceneRenderedMs, 10);
  assert.equal(window.__kxStartup.fullSceneRenderedMs, undefined);
  resolveCity(); await Promise.resolve(); now = 20; renderer.render();
  assert.equal(window.__kxStartup.fullSceneRenderedMs, undefined);
  k.parts = { terrain: {}, buildings: {} }; now = 30; renderer.render();
  assert.equal(window.__kxStartup.fullSceneRenderedMs, 30);
  const measured = extractTiming({ observation: { ...window.__kxStartup, replayTrainsRenderedMs: 35, trainDraws: 1 } });
  assert.equal(measured.navigationStartToFullSceneRenderedMs, 30);
});

test('CLI rejects invalid options, too few runs and output outside private scratch', async () => {
  await assert.rejects(main(['--unknown']), /unknown/);
  await assert.rejects(main(['--runs', '1']), /integer/);
  await assert.rejects(main(['--out', '/private/tmp/outside']), /beneath/);
});


test('explicit target verdicts reject low FPS, missing FPS and warm render at three seconds', () => {
  assert.equal(summarizeRuns([report(), report()]).targets.passed, true);
  for (const field of ['median', 'p5']) {
    const low = report(); low.cameras.shed.fps[field] = 59;
    const measured = summarizeRuns([low, report()]);
    assert.equal(measured.targets.fpsAtLeast60, false);
    assert.equal(measured.targets.passed, false);
  }
  const missing = report(); delete missing.cameras.overview.fps;
  assert.equal(summarizeRuns([missing, report()]).targets.passed, false);
  const slow = report(); slow.startup.warmSecondLoadSameProfile = timing(3000, 4000);
  const measured = summarizeRuns([report(), slow]);
  assert.equal(measured.targets.warmFirstRenderWithin3s, false);
  assert.equal(measured.targets.passed, false);
  assert.equal(measured.targets.cameraTargets.overview.p95FrameWithinBudget, true);
  assert.equal(measured.targets.cameraTargets.overview.p99FrameWithinBudget, false);
});

test('Markdown includes hardware, every file, samples, aggregates, failed targets, limitations and exact command', () => {
  const low = report(); low.cameras.shed.fps.p5 = 40;
  const browser = summarizeRuns([low, report()]);
  const result = evidenceMarkdown({ status: 'fail', invocation: ['node', 'tools/axis08-evidence.mjs', '--runs', '2'],
    hardware: { model: 'Mac Studio', cpu: 'Apple CPU', logicalCpus: 8, gpu: ['Apple GPU'], os: { platform: 'darwin', release: '26', version: 'Darwin', arch: 'arm64' }, gaps: ['synthetic inventory gap'] },
    build: { files: [{ file: 'geometry.js', classification: 'app-payload', bytes: 200, gzipBytes: 100 }, { file: 'main.js.map', classification: 'source-map', bytes: 400, gzipBytes: 200 }], appPayloadGzipBytes: 100, allEmittedGzipBytes: 300, sourceMapsGzipBytes: 200, budgetBytes: 2000000, appPayloadWithinBudget: true, allEmittedWithinBudget: true, budgetDefinition: 'Strict <2 MB' }, browser });
  for (const text of ['Mac Studio', 'Apple CPU', 'Apple GPU', 'darwin', 'geometry.js', 'main.js.map', '| cold | 2 | 100 | 600 |', '| warm | firstRenderMs | 50 | 50 | 50 |', 'Median FPS', '| shed | ANGLE Apple Metal | 60 | 40 |', 'FPS target: FAIL', 'display presentation', 'synthetic inventory gap', "'node' 'tools/axis08-evidence.mjs' '--runs' '2'"]) assert.ok(result.includes(text), text);
});
