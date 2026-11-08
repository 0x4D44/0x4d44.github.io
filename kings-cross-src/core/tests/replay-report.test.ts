import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { AnchorMap } from '../anchors.ts';
import type { KxData } from '../osm.ts';
import { buildGraph } from '../graph.ts';
import { DEFAULT_BUFFER_CLEARANCE_M } from '../motion.ts';
import { platformStoppingPoint } from '../../tools/replay-report.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const tool = process.env.REPLAY_REPORT_TEST_TOOL ?? resolve(root, 'kings-cross-src/tools/replay-report.ts');
// A failed CLI must never accidentally validate a report left by an earlier test run.
const scratch = resolve(root, '.scratch/replay-report-tests', String(process.pid));
const data: KxData = { attribution: 'invented', origin: { lat: 0, lon: 0 },
  nodes: [[1, 10, -200], [2, 10, -1200], [3, 40, -200], [4, 40, -1200]],
  rails: [1, 3].map((n) => ({ id: n, nodes: [n, n + 1], tunnel: false, bridge: false, layer: 0, service: 'main' })),
  platforms: [{ id: 20, ref: '0', pts: [[12, -200], [15, -200], [15, -300], [12, -300]] }], switches: [], signals: [], buffers: [], buildings: [] };
const a = (berth: string, t = 0): AnchorMap['anchors'][number] => ({ berth, kind: 'signal', from: 2, to: 1, t, point: [10, -1200 + 1000 * t], errorM: 1, evidence: 'invented' });
const map = (): AnchorMap => ({ area: 'TEST', sources: ['invented'], anchors: [a('A', 0.1), a('B', 0.5)], unmapped: [] });
const event = (kind: string, extra = {}) => ({ kind, area: 'TEST', descr: 'SYN1', ...extra });
async function run(name: string, anchors: AnchorMap, rows: unknown[]) {
  const dir = resolve(scratch, name); await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'anchors.json'), JSON.stringify(anchors));
  await writeFile(resolve(dir, 'graph.json'), JSON.stringify(data));
  await writeFile(resolve(dir, 'recording.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n'));
  const child = spawnSync(process.execPath, [tool, '--anchors', resolve(dir, 'anchors.json'), '--recording', resolve(dir, 'recording.ndjson'), '--graph', resolve(dir, 'graph.json'), '--out', resolve(dir, 'out')], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(child.error, undefined);
  const report = JSON.parse(await readFile(resolve(dir, 'out/replay-report.json'), 'utf8'));
  return { status: child.status, report };
}

test('CLI inventory includes cancel, snapshot and placeholder-only berths and rejects missing classification', async () => {
  const m = map(); m.unmapped.push({ berth: 'OUT', seen: 0, reason: 'outside-network', detail: 'invented boundary' });
  const { status, report } = await run('missing', m, [{ t: 0, e: event('interpose', { to: 'A' }) },
    { t: 100, e: event('cancel', { from: 'OUT' }) }, { t: 200, e: event('snapshot', { berths: { MISSING: '****' } }) }]);
  assert.equal(status, 1);
  assert.deepEqual(report.coverage.berths.map((b: { berth: string }) => b.berth), ['A', 'MISSING', 'OUT']);
  assert.match(report.violations.join(';'), /missing berth classification: MISSING/);
});

test('CLI rejects duplicate anchor/unmapped classifications', async () => {
  const m = map(); m.unmapped.push({ berth: 'A', seen: 1, reason: 'conflict', detail: 'invented conflict' });
  const { status, report } = await run('duplicate', m, [{ t: 0, e: event('interpose', { to: 'A' }) }]);
  assert.equal(status, 1);
  assert.match(report.violations.join(';'), /duplicate berth classification: A/);
});

test('CLI counts placeholder inventory without drawing bodies or treating hops as route evidence', async () => {
  const { status, report } = await run('placeholder', map(), [{ t: 0, e: event('step', { from: 'A', to: 'B', descr: '****' }) }]);
  assert.equal(status, 0);
  assert.equal(report.coverage.seen, 2);
  assert.equal(report.coverage.placeholderObservations, 1);
  assert.equal(report.headcodeChurn.physicalIds, 0);
  assert.equal(report.motion.starsDrawn, 0);
  assert.equal(report.stepSummary.mappedPairs, 0);
});

test('CLI rejects platform metadata that assigns the correct number to the wrong OSM track', async () => {
  const m = map(); m.anchors.push({ ...a('1000', 1), from: 4, to: 3, point: [40, -200], platform: '0', kind: 'platform' });
  const { status, report } = await run('wrong-platform', m, [{ t: 0, e: event('interpose', { to: '1000' }) }]);
  assert.equal(status, 1);
  assert.equal(report.platforms[0].correctTargetTrack, false);
  assert.ok(report.platforms[0].actuallyHeldWrongTrackSamples > 0);
});

test('CLI recognizes a completed platform arrival at the cab clearance point', async () => {
  const m = map(); m.anchors.push({ ...a('1000', 1), platform: '0', kind: 'platform' });
  const { status, report } = await run('completed-platform', m, [
    { t: 0, e: event('interpose', { to: 'B' }) },
    { t: 20000, e: event('step', { from: 'B', to: '1000' }) },
    { t: 200000, e: event('heartbeat') },
  ]);
  assert.equal(status, 0);
  assert.equal(report.platforms[0].correctTargetTrack, true);
  assert.ok(report.platforms[0].reachedSamples > 0);
  assert.equal(report.platforms[0].actuallyHeldWrongTrackSamples, 0);
  assert.equal(report.platformStepSummary.reachedCorrectTrack, 1);
  assert.equal(report.platformSteps[0].resolution, 'reached-correct-track');
});

test('platform cab clearance follows the rail across a short reversed terminal edge', () => {
  const graph = buildGraph({ nodes: [[1, 10, -300], [2, 10, -201], [3, 10, -200]],
    rails: [{ id: 1, nodes: [3, 2, 1], tunnel: false, bridge: false, layer: 0, service: 'main' }] });
  const anchor = { ...a('1000', 1), from: 2, to: 3, point: [10, -200] as [number, number], platform: '0', kind: 'platform' as const };
  const stop = platformStoppingPoint(graph, anchor);
  assert.ok(stop);
  assert.equal(stop.edge, graph.edges[1]);
  const from = graph.pos.get(stop.edge.a)!, to = graph.pos.get(stop.edge.b)!;
  assert.ok(Math.abs(from[1] + (to[1] - from[1]) * stop.t - (anchor.point[1] - DEFAULT_BUFFER_CLEARANCE_M)) < 1e-8);
});

test('CLI distinguishes pending moving platform authority from a reached platform nose', async () => {
  const m = map(); m.anchors.push({ ...a('1000', 1), platform: '0', kind: 'platform' });
  const { status, report } = await run('authority', m, [{ t: 0, e: event('interpose', { to: 'A' }) },
    { t: 20000, e: event('step', { from: 'A', to: '1000' }) }]);
  assert.equal(status, 0);
  assert.equal(report.platforms[0].correctTargetTrack, true);
  assert.equal(report.platforms[0].reachedSamples, 0);
  assert.ok(report.platforms[0].movingSamples > 0);
  assert.equal(report.platforms[0].actuallyHeldWrongTrackSamples, 0);
  assert.equal(report.stepSummary.mappedPairs, 1);
  assert.equal(report.platformStepSummary.total, 1);
  assert.equal(report.platformStepSummary.reachedCorrectTrack, 0);
  assert.equal(report.platformStepSummary.unresolved, 1);
  assert.equal(report.platformSteps[0].resolution, 'pending');
  assert.equal(report.platformSteps[0].physicalId, 1);
});

test('CLI counts description replacement by physical id and includes fades in sampled train-seconds', async () => {
  const { status, report } = await run('churn', map(), [{ t: 0, e: event('interpose', { to: 'A' }) },
    { t: 100, e: event('interpose', { to: 'A', descr: 'SYN2' }) },
    { t: 100, e: event('interpose', { to: 'A', descr: 'SYN3' }) },
    { t: 200, e: event('cancel', { from: 'A', descr: 'SYN3' }) }]);
  assert.equal(status, 0);
  assert.equal(report.headcodeChurn.physicalIds, 1);
  assert.equal(report.headcodeChurn.idsWithMultipleDescriptions, 1);
  assert.equal(report.headcodeChurn.renames, 2);
  assert.equal(report.headcodeChurn.unattributedRenames, 0);
  assert.equal(report.headcodeChurn.byPhysicalId[0].renameCount, 2);
  assert.equal(report.headcodeChurn.byPhysicalId[0].descriptionsCount, 3);
  assert.equal(report.headcodeChurn.maxRenamesPerPhysicalId, 2);
  assert.equal(report.headcodeChurn.medianDescriptionsPerPhysicalId, 3);
  assert.ok(report.drawnTime.fadingTrainSeconds > 4.8);
  assert.ok(report.drawnTime.anchoredTrainSeconds > report.drawnTime.fadingTrainSeconds);
  assert.equal(report.drawnTime.estimatedTrainSeconds, 0);
});

test('CLI rejects a mapped step with no graph route', async () => {
  const m = map(); m.anchors[1] = { ...a('B', 0.5), from: 4, to: 3, point: [40, -700] };
  const { status, report } = await run('disconnected', m, [{ t: 0, e: event('step', { from: 'A', to: 'B' }) }]);
  assert.equal(status, 1);
  assert.equal(report.stepSummary.disconnectedPairs, 1);
  assert.match(report.violations.join(';'), /mapped step disconnected/);
});

test('CLI rejects matched residence implying more than 50 m/s', async () => {
  const { status, report } = await run('fast-step', map(), [{ t: 0, e: event('interpose', { to: 'A' }) },
    { t: 1000, e: event('step', { from: 'A', to: 'B' }) }]);
  assert.equal(status, 1);
  assert.equal(report.stepSummary.impliedSpeedFlagPairs, 1);
  assert.match(report.violations.join(';'), /mapped step implied-speed/);
  assert.equal(report.stepJumps[0].speedMps, 400);
});
