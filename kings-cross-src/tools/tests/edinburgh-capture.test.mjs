import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, validateInputs, recordedPlatformEvidence, acceptRealTrain, verifyBrowserPlan,
  frozenRelayResponse, firstPlatformPlan, requireGeometry, privateOutput } from '../edinburgh-capture.mjs';

const anchors = { area: 'EB', anchors: [{ berth: 'S001', kind: 'smart' }],
  platformAssociations: [{ berth: 'S001', platform: '12', event: 'A' }] };
const ambiguous = { ...anchors, platformAssociations: [...anchors.platformAssociations, { berth: 'S001', platform: '13', event: 'B' }] };
const epoch = Date.UTC(2026, 0, 1);
const row = (kind, fields = {}, t = epoch) => ({ t, e: { area: 'EB', kind, ...fields } });
const view = { id: 1, description: '1234', opacity: 1, lengthM: 130, occupiedLengthM: 100, leading: { point: [1, 2] }, lastBerth: 'S001', targetBerth: 'S001', state: 'held' };
const observations = [{ berth: 'S001', description: '1234', timeMs: epoch, kind: 'step' }];
const errorOf = fn => { try { fn(); return 'accepted'; } catch { return 'rejected'; } };

test('EB capture requires geometry and private inputs and refuses unknown or repeated options', () => {
  const args = ['--dist', 'dist', '--anchors', 'anchors', '--recording', 'recording', '--out', '.scratch/out', '--geometry', 'scene.json'];
  assert.deepEqual([Object.keys(parseArgs(args)), errorOf(() => parseArgs(args.slice(0, -2))),
    errorOf(() => parseArgs([...args, '--out', '.scratch/other'])), errorOf(() => parseArgs([...args, '--live', 'yes'])),
    errorOf(() => parseArgs([...args, '--chrome']))], [['dist', 'anchors', 'recording', 'out', 'geometry'], 'rejected', 'rejected', 'rejected', 'rejected']);
});

test('EB inputs require placed unambiguous associations and one EB-only UTC recording day', () => {
  assert.deepEqual([validateInputs(anchors, [row('heartbeat')]),
    errorOf(() => validateInputs({ ...anchors, area: 'WH' }, [row('heartbeat')])),
    errorOf(() => validateInputs(anchors, [row('heartbeat', { area: 'Y9' })])),
    errorOf(() => validateInputs(ambiguous, [row('heartbeat')])), errorOf(() => validateInputs(anchors, [])),
    errorOf(() => validateInputs(anchors, [row('heartbeat'), row('heartbeat', {}, epoch + 86400000)]))],
  ['20260101', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected']);
});

test('only actual EB steps at placed unambiguous candidate berths count; snapshots and interposes do not', () => {
  const rows = [row('snapshot', { berths: { S001: '2B34' } }), row('interpose', { to: 'S001', descr: '3C45' }),
    row('step', { from: 'S001', to: 'X001', descr: '1234' }), row('step', { from: 'S001', to: 'X001', descr: '****' }),
    row('step', { area: 'WH', from: 'S001', to: 'X001', descr: '4D56' })];
  assert.deepEqual([recordedPlatformEvidence(rows, anchors).map(o => [o.berth, o.description, o.kind]), recordedPlatformEvidence(rows, ambiguous)],
    [[['S001', '1234', 'step']], []]);
});

test('real EB train acceptance rejects future, snapshot-only, ambiguous and unusable physical views', () => {
  const changes = [{}, { description: 'FAKE' }, { opacity: .1 }, { state: 'fading' }, { unmappedBerth: 'X001' },
    { lastBerth: 'X001', targetBerth: 'X001' }, { occupiedLengthM: 0 }, { leading: { point: [NaN, 0] } }];
  assert.deepEqual([...changes.map(change => acceptRealTrain({ ...view, ...change }, anchors, observations, epoch)),
    acceptRealTrain(view, anchors, observations, epoch - 1), acceptRealTrain(view, ambiguous, observations, epoch),
    acceptRealTrain(view, anchors, observations.map(o => ({ ...o, kind: 'snapshot' })), epoch)],
  [true, false, false, false, false, false, false, false, false, false, false]);
});

test('fixed EB HTTP endpoints refuse other areas, wrong dates, duplicate selectors and live feeds', () => {
  const frozen = { anchors: 'PRIVATE-ANCHORS', recording: 'PRIVATE-RECORDING', date: '20260101' };
  const routes = ['/relay/anchors?area=EB', '/relay/recording?area=EB&date=20260101', '/relay/anchors', '/relay/anchors?area=Y9',
    '/relay/anchors?area=WH', '/relay/recording?area=EB&date=20260102', '/relay/recording?area=EB&area=EB&date=20260101',
    '/relay/events?area=EB', '/relay/anchors?area=EB&path=x'];
  assert.deepEqual(routes.map(u => { const r = frozenRelayResponse(u, frozen); return [r.status, r.status === 200 ? r.body : 'unavailable']; }),
    [[200, 'PRIVATE-ANCHORS'], [200, 'PRIVATE-RECORDING'], ...Array.from({ length: 7 }, () => [404, 'unavailable'])]);
});

test('browser EB proof matches replay clock, assumed neutral body, allocation and physical formation length', () => {
  const actual = { state: { area: 'EB', ready: true, trains: [view] }, timeMs: epoch, simulationTimeMs: epoch,
    groupState: { kind: 'neutral', allocation: 'assumed fleet', length: 130 } };
  const plan = { train: view, timeMs: epoch, observations };
  const changes = [{}, { simulationTimeMs: epoch + 1 }, { timeMs: epoch + 1 },
    { groupState: { ...actual.groupState, kind: 'lner5' } }, { groupState: { ...actual.groupState, allocation: 'known' } },
    { groupState: { ...actual.groupState, length: 200 } }, { state: { ...actual.state, trains: [{ ...view, lengthM: 200 }] } }];
  assert.deepEqual(changes.map(change => errorOf(() => verifyBrowserPlan({ ...actual, ...change }, plan, anchors))),
    ['accepted', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected', 'rejected']);
});

test('EB capture output refuses public paths and directory symlink escapes', async () => {
  const base = fileURLToPath(new URL('../../../.scratch/a43/capture/', import.meta.url));
  await mkdir(base, { recursive: true }); const dir = await mkdtemp(path.join(base, 'synthetic-'));
  await symlink(dir, path.join(dir, 'link'));
  const outcomes = [];
  for (const target of [fileURLToPath(new URL('../../../public-output', import.meta.url)), path.join(dir, 'link/out')]) {
    try { await privateOutput(target); outcomes.push('accepted'); } catch { outcomes.push('rejected'); }
  }
  assert.deepEqual(outcomes, ['rejected', 'rejected']);
});

test('missing actual platform steps fail before engine creation or any GPU launch', async () => {
  await assert.rejects(firstPlatformPlan([row('snapshot', { berths: { S001: '1234' } })], anchors, {}), /unavailable: no observed EB platform train/);
});

test('empty public geometry remains an explicit unavailable placeholder before any GPU launch', async () => {
  await assert.rejects(requireGeometry({ origin: { lat: 0, lon: 0 }, attribution: 'synthetic', rails: [], platforms: [] }), /unavailable: Edinburgh geometry is empty or a placeholder/);
});
