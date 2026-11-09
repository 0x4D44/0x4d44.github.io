import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, validateInputs, recordedPlatformEvidence, acceptRealTrain, verifyBrowserPlan, frozenRelayResponse, firstPlatformPlan } from '../stpancras-capture.mjs';
import { ensureScratchOutput } from '../area-coverage.mjs';

const anchors = { area: 'WH', anchors: [{ berth: 'S001', kind: 'platform', platform: '1' }] };
const epoch = Date.UTC(2026, 0, 1);
const row = (kind, fields = {}, t = epoch) => ({ t, e: { area: 'WH', kind, ...fields } });
const view = { id: 1, description: '1234', opacity: 1, lengthM: 116.7, occupiedLengthM: 100, leading: { point: [1, 2] }, lastBerth: 'S001', targetBerth: 'S001', state: 'held' };
const observations = [{ berth: 'S001', description: '1234', timeMs: epoch }];
const errorOf = fn => { try { fn(); return 'accepted'; } catch { return 'rejected'; } };

test('capture arguments require all private inputs and reject duplicates, unsupported flags and missing values', () => {
  const valid = ['--dist', 'dist', '--anchors', 'anchors', '--recording', 'recording', '--out', '.scratch/out'];
  assert.deepEqual([Object.keys(parseArgs(valid)), errorOf(() => parseArgs(valid.slice(0, -2))),
    errorOf(() => parseArgs([...valid, '--out', '.scratch/other'])), errorOf(() => parseArgs([...valid, '--live', 'yes'])),
    errorOf(() => parseArgs([...valid, '--chrome']))], [['dist', 'anchors', 'recording', 'out'], 'rejected', 'rejected', 'rejected', 'rejected']);
});

test('capture accepts only WH platform anchors and one nonempty UTC recording date', () => {
  assert.deepEqual([validateInputs(anchors, [row('heartbeat')]),
    errorOf(() => validateInputs({ ...anchors, area: 'Y9' }, [row('heartbeat')])),
    errorOf(() => validateInputs(anchors, [row('heartbeat', { area: 'CT' })])),
    errorOf(() => validateInputs(anchors, [])),
    errorOf(() => validateInputs(anchors, [row('heartbeat'), row('heartbeat', {}, epoch + 86400000)]))],
  ['20260101', 'rejected', 'rejected', 'rejected', 'rejected']);
});

test('only actual platform descriptions from steps, interposes and checkpoints count as observations', () => {
  const rows = [row('snapshot', { berths: { S001: '1234', X001: '1A23' } }), row('step', { from: 'S001', to: 'X001', descr: '2B34' }),
    row('interpose', { to: 'S001', descr: '****' }), row('cancel', { from: 'S001', descr: '3C45' })];
  assert.deepEqual(recordedPlatformEvidence(rows, anchors).map(o => [o.berth, o.description, o.kind]),
    [['S001', '1234', 'snapshot'], ['S001', '2B34', 'step']]);
});

test('real-train acceptance rejects fabricated, future, fading, unmapped and geometrically unusable views', () => {
  const changes = [{}, { description: 'FAKE' }, { opacity: .1 }, { state: 'fading' }, { unmappedBerth: 'X001' },
    { lastBerth: 'X001', targetBerth: 'X001' }, { occupiedLengthM: 0 }, { leading: { point: [NaN, 0] } }];
  assert.deepEqual([...changes.map(change => acceptRealTrain({ ...view, ...change }, anchors, observations, epoch)),
    acceptRealTrain(view, anchors, observations, epoch - 1)], [true, false, false, false, false, false, false, false, false]);
});

test('frozen HTTP routes refuse KX, wrong dates, repeated selectors and every live feed endpoint', () => {
  const frozen = { anchors: 'PRIVATE-ANCHORS', recording: 'PRIVATE-RECORDING', date: '20260101' };
  const routes = ['/relay/anchors?area=WH', '/relay/recording?area=WH&date=20260101', '/relay/anchors', '/relay/anchors?area=Y9',
    '/relay/recording?area=WH&date=20260102', '/relay/recording?area=WH&area=WH&date=20260101', '/relay/events?area=WH', '/relay/anchors?area=WH&path=x'];
  assert.deepEqual(routes.map(u => { const r = frozenRelayResponse(u, frozen); return [r.status, r.status === 200 ? r.body : 'unavailable']; }),
    [[200, 'PRIVATE-ANCHORS'], [200, 'PRIVATE-RECORDING'], ...Array.from({ length: 6 }, () => [404, 'unavailable'])]);
});

test('browser evidence must match replay UTC, formation length, EMR kind and assumed allocation', () => {
  const actual = { state: { area: 'WH', ready: true, trains: [view] }, timeMs: epoch, simulationTimeMs: epoch,
    groupState: { kind: 'emr222x5', allocation: 'assumed fleet', length: 116.7 } };
  const plan = { train: view, timeMs: epoch, observations };
  const changes = [{}, { simulationTimeMs: epoch + 1 }, { timeMs: epoch + 1 },
    { groupState: { ...actual.groupState, kind: 'lner5' } }, { groupState: { ...actual.groupState, allocation: 'known' } },
    { groupState: { ...actual.groupState, length: 200 } }, { state: { ...actual.state, trains: [{ ...view, lengthM: 200 }] } }];
  assert.deepEqual(changes.map(change => errorOf(() => verifyBrowserPlan({ ...actual, ...change }, plan, anchors))),
    ['accepted', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected']);
});

test('capture output refuses public destinations and symlink escapes without starting any browser', async () => {
  const base = fileURLToPath(new URL('../../../.scratch/a42/capture/', import.meta.url));
  await mkdir(base, { recursive: true }); const dir = await mkdtemp(path.join(base, 'synthetic-'));
  const repo = path.join(dir, 'repo'); await mkdir(repo); await mkdir(path.join(repo, '.scratch'));
  await symlink(dir, path.join(repo, '.scratch/link'));
  const outcomes = [];
  for (const target of [path.join(repo, 'public'), path.join(repo, '.scratch/link/out')]) {
    try { await ensureScratchOutput(target, repo); outcomes.push('accepted'); } catch { outcomes.push('rejected'); }
  }
  assert.deepEqual(outcomes, ['rejected', 'rejected']);
});

test('missing recorded platform observations fail explicitly before GPU capture', async () => {
  await assert.rejects(firstPlatformPlan([row('heartbeat')], anchors, {}), /unavailable: no observed WH platform train/);
});
