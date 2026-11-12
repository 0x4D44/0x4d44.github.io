import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, AREA_ASSETS, areaTrack, completedRecordingNames, countHeads, publicationDecision, relearnSclass, relearnValidation } from '../sclass.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const evidence = (support, trials, unmatchedCycles) => ({ support, trials, unmatchedCycles, contradictions: trials - support,
  precision: support / (support + unmatchedCycles), recall: support / trials });
const hypothesis = (kind, berth, extra = {}) => ({ id: berth, kind, berth, to: '1006', address: '10', bit: 0,
  proceedValue: 1, status: 'decoded', reason: 'synthetic', training: evidence(4, 5, 1), heldOut: evidence(4, 5, 1), ...extra });

test('report uses micro totals over decoded hypotheses by kind', () => {
  const analysis = { hypotheses: [hypothesis('proceed', '1004'), hypothesis('route', '1005', { heldOut: evidence(8, 10, 3) }),
    hypothesis('proceed', '1007', { status: 'unknown', heldOut: evidence(0, 99, 99) })] };
  assert.deepEqual(aggregate(analysis), { bits: 2, support: 12, cycles: 16, trials: 15, precision: .75, recall: .8 });
  assert.equal(aggregate(analysis, 'proceed').bits, 1);
  assert.equal(aggregate(analysis, 'route').recall, .8);
});

test('real renderer counts only validated proceed with available bytes as aspect capable', () => {
  const overlay = { attribution: 'synthetic', signals: [{ id: 1, ref: 'YA 1004', point: [8, 0], kinds: ['main'],
    edge: { wayId: 9, from: 1, to: 2, t: .8, point: [8, 0] }, travel: [1, 0], facing: [-1, 0],
    side: 'left', sideSource: 'assumed-left', berth: '1004', review: 'osm-ref-match' }] };
  const track = { nodes: [], ways: [], rails: [], platforms: [], tracks: [], buildings: [] };
  const anchors = { area: 'Y9', sources: [], anchors: [], unmapped: [] };
  const analysis = { area: 'Y9', hypotheses: [hypothesis('proceed', '1004')] };
  assert.deepEqual(countHeads(analysis, anchors, overlay, track, { '10': 1 }), { drawn: 1, aspectCapable: 1, proceed: 1, danger: 0, unknown: 0 });
  assert.equal(countHeads(analysis, anchors, overlay, track, {}).aspectCapable, 0);
  assert.equal(countHeads({ ...analysis, hypotheses: [hypothesis('route', '1004')] }, anchors, overlay, track, { '10': 1 }).aspectCapable, 0);
});

test('CLI writes reproducible last-recording and baseline reports without raw events', async () => {
  const scratch = path.join(root, '.scratch'); await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(path.join(scratch, 'sclass-cli-test-'));
  const anchors = path.join(dir, 'anchors.json');
  await writeFile(anchors, JSON.stringify({ area: 'Y9', sources: ['synthetic'], anchors: [], unmapped: [] }));
  const recordings = [];
  for (let i = 0; i < 2; i++) {
    const file = path.join(dir, `recording-${i}.ndjson`); recordings.push(file);
    await writeFile(file, [0, 100000].map(t => JSON.stringify({ t: t + i * 200000, e: { kind: 'sclass', area: 'Y9', msgType: 'SF', address: '10', data: '00' } })).join('\n'));
  }
  const invoke = extra => spawnSync(process.execPath, [path.join(root, 'kings-cross-src/tools/sclass.ts'),
    ...recordings.flatMap(file => ['--recording', file]), '--anchors', anchors, '--out', dir, ...extra], { encoding: 'utf8', timeout: 30000 });
  const first = invoke([]); assert.equal(first.status, 0, first.stderr);
  const baseline = path.join(dir, 'baseline.json'); await writeFile(baseline, await readFile(path.join(dir, 'sclass.json')));
  const second = invoke(['--validation', 'last-recording', '--baseline', baseline]); assert.equal(second.status, 0, second.stderr);
  const runtime = JSON.parse(await readFile(path.join(dir, 'sclass.json'), 'utf8'));
  const comparison = JSON.parse(await readFile(path.join(dir, 'sclass-comparison.json'), 'utf8'));
  const report = await readFile(path.join(dir, 'sclass-report.md'), 'utf8');
  assert.equal(runtime.validation, 'last-recording');
  assert.equal(comparison.validation, 'last-recording');
  assert.ok(comparison.before);
  assert.equal(comparison.baselineValidation, 'halves');
  assert.equal(runtime.provenance.fingerprints.length, 14);
  assert.ok(runtime.provenance.fingerprints.every(f => f.bytes > 0 && /^[a-f0-9]{64}$/.test(f.sha256)));
  for (const fingerprint of runtime.provenance.fingerprints) {
    const bytes = await readFile(path.resolve(root, fingerprint.source));
    assert.equal(fingerprint.bytes, bytes.length);
    assert.equal(fingerprint.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(runtime.provenance.folds[0].splitMs, runtime.provenance.folds[0].endMs);
  assert.match(report, /Validation scheme: last-recording/);
  assert.match(report, /Route-only evidence never lights an aspect/);
  assert.match(report, /\| all: held-out micro precision \|/);
  assert.ok(Array.isArray(runtime.hypotheses));
  assert.equal(runtime.events, undefined);
  assert.match(invoke(['--validation', 'random']).stderr, /must be halves, last-recording or leave-one-recording-out/);
  assert.match(invoke(['--validation', 'leave-one-recording-out']).stderr, /at least three nonempty recording sessions/);
});

test('CLI leave-one-recording-out writes the nested scores to the table and the report, and halves write none', async t => {
  const scratch = path.join(root, '.scratch'); await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(path.join(scratch, 'sclass-loo-cli-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const anchors = path.join(dir, 'anchors.json');
  await writeFile(anchors, JSON.stringify({ area: 'Y9', sources: ['synthetic'], anchors: [], unmapped: [] }));
  const recordings = [];
  for (let i = 0; i < 3; i++) {
    const file = path.join(dir, `recording-${i}.ndjson`); recordings.push(file);
    await writeFile(file, [0, 100000].map(at => JSON.stringify({ t: at + i * 200000, e: { kind: 'sclass', area: 'Y9', msgType: 'SF', address: '10', data: '00' } })).join('\n'));
  }
  const invoke = extra => spawnSync(process.execPath, [path.join(root, 'kings-cross-src/tools/sclass.ts'),
    ...recordings.flatMap(file => ['--recording', file]), '--anchors', anchors, '--out', dir, ...extra], { encoding: 'utf8', timeout: 30000 });
  const loo = invoke(['--validation', 'leave-one-recording-out']); assert.equal(loo.status, 0, loo.stderr);
  const table = JSON.parse(await readFile(path.join(dir, 'sclass-table.json'), 'utf8'));
  assert.equal(table.loo?.scheme, 'leave-one-recording-out');
  assert.equal(table.loo?.nested.length, 3);
  assert.match(await readFile(path.join(dir, 'sclass-report.md'), 'utf8'), /## Leave-one-recording-out held-out scores[\s\S]*\| 2 \| /);
  const halves = invoke([]); assert.equal(halves.status, 0, halves.stderr);
  assert.equal(JSON.parse(await readFile(path.join(dir, 'sclass-table.json'), 'utf8')).loo, null);
  assert.doesNotMatch(await readFile(path.join(dir, 'sclass-report.md'), 'utf8'), /Leave-one-recording-out held-out scores/);
});

const analysis = hypotheses => ({ area: 'Y9', hypotheses });
test('publication accepts equal precision with retained mappings and additional decoded heads', () => {
  const current = analysis([hypothesis('proceed', '9901')]);
  const next = analysis([...current.hypotheses, hypothesis('proceed', '9902', { address: '11' })]);
  const result = publicationDecision(next, current, 1, 2);
  assert.equal(result.publish, true);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.dropped, []);
  assert.equal(result.before.precision, .8);
  assert.equal(result.after.recall, .8);
});

test('publication rejects lower common-day precision even if decoded head coverage grows', () => {
  const current = analysis([hypothesis('proceed', '9901', { heldOut: evidence(5, 5, 0) })]);
  const result = publicationDecision(analysis([hypothesis('proceed', '9901')]), current, 1, 2);
  assert.equal(result.publish, false);
  assert.ok(result.reasons.some(reason => reason.startsWith('Held-out micro precision regressed')));
});

test('publication rejects a loss of decoded heads at unchanged precision', () => {
  const current = analysis([hypothesis('proceed', '9901')]);
  const result = publicationDecision(current, current, 2, 1);
  assert.equal(result.publish, false);
  assert.ok(result.reasons.includes('Decoded head count regressed'));
});

test('publication refuses to drop a still-supported mapping and explains every loss', () => {
  const current = analysis([hypothesis('proceed', '9901')]);
  const next = analysis([hypothesis('proceed', '9902', { address: '11' })]);
  const result = publicationDecision(next, current, 1, 1);
  assert.equal(result.publish, false);
  assert.equal(result.dropped.length, 1);
  assert.equal(result.dropped[0].goodHeldOut, true);
  assert.match(result.dropped[0].reason, /No unique qualifying training association/);
  const failedOld = analysis([hypothesis('proceed', '9901', { heldOut: evidence(1, 5, 5) })]);
  const explained = publicationDecision(next, failedOld, 1, 1);
  assert.equal(explained.publish, true);
  assert.equal(explained.dropped[0].goodHeldOut, false);
  assert.equal(explained.dropped[0].heldOut.support, 1);
});

test('publication rejects unsupported decoded labels and route gains cannot hide proceed regression', () => {
  const weak = analysis([hypothesis('proceed', '9901', { heldOut: evidence(2, 2, 0) })]);
  assert.equal(publicationDecision(weak, null, 0, 1).publish, false);
  assert.equal(publicationDecision(analysis([]), null, 0, 0).publish, false);
  const current = analysis([hypothesis('proceed', '9901', { heldOut: evidence(4, 5, 0) }),
    hypothesis('route', '9902', { address: '11', heldOut: evidence(4, 5, 1) })]);
  const next = analysis([hypothesis('proceed', '9901'), hypothesis('route', '9902', { address: '11', heldOut: evidence(4, 5, 0) })]);
  const result = publicationDecision(next, current, 1, 1);
  assert.equal(result.publish, false);
  assert.ok(result.reasons.includes('Proceed precision regressed on the common validation day'));
});

test('completed day selection excludes today future malformed and foreign recordings', () => {
  assert.deepEqual(completedRecordingNames(['td-Y9-20250102.ndjson', 'td-Y9-20250101.ndjson', 'td-Y9-20250103.ndjson',
    'td-Y9-20250104.ndjson', 'td-Z9-20250101.ndjson', 'td-Y9-20250230.ndjson', 'td-Y9-20241331.ndjson', 'td-Y9-no.ndjson'],
  'Y9', Date.UTC(2025, 0, 3)), ['td-Y9-20250101.ndjson', 'td-Y9-20250102.ndjson']);
  assert.throws(() => completedRecordingNames([], '../', Date.now()), /Invalid/);
});

test('relearn CLI reads shared recordings and requires area-specific render assets outside Y9', async t => {
  const scratch = path.join(root, '.scratch'); await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(path.join(scratch, 'sclass-area-cli-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const dataDir = path.join(dir, 'areas', 'ZZ'), recordingsDir = path.join(dir, 'recordings');
  await mkdir(dataDir, { recursive: true }); await mkdir(recordingsDir);
  const anchors = path.join(dataDir, 'anchors.json');
  const overlay = path.join(dir, 'zz-signals.json'), track = path.join(dir, 'zz-track.json');
  const ignoredAnchors = path.join(dir, 'ignored-kx-anchors.json'), ignoredTable = path.join(dir, 'ignored-kx-table.json');
  await writeFile(anchors, JSON.stringify({ area: 'ZZ', sources: ['synthetic'], anchors: [], unmapped: [] }));
  await writeFile(overlay, JSON.stringify({ attribution: 'synthetic ZZ', signals: [] }));
  await writeFile(track, JSON.stringify({ nodes: [], ways: [], rails: [], platforms: [], tracks: [], buildings: [] }));
  await writeFile(ignoredAnchors, JSON.stringify({ area: 'Y9', sources: [], anchors: [], unmapped: [] }));
  await writeFile(ignoredTable, '{');
  for (const day of [1, 2]) {
    const start = Date.UTC(2025, 0, day);
    await writeFile(path.join(recordingsDir, `td-ZZ-2025010${day}.ndjson`), `${JSON.stringify({ t: start, e: { kind: 'marker', area: 'ZZ' } })}\n`);
  }
  const invoke = extra => spawnSync(process.execPath, [path.join(root, 'kings-cross-src/tools/sclass.ts'), '--relearn',
    '--data-dir', dataDir, '--area', 'ZZ', '--recordings-dir', recordingsDir, ...extra],
  { cwd: root, encoding: 'utf8', timeout: 30000, input: '', env: { ...process.env, KX_ANCHORS: ignoredAnchors, KX_SCLASS: ignoredTable } });
  const unavailable = invoke([]);
  assert.notEqual(unavailable.status, 0);
  assert.match(unavailable.stderr, /area-specific overlay and track are required/);
  assert.deepEqual((await readdir(dataDir)).sort(), ['anchors.json'], 'asset refusal happens before private output writes');
  const configured = invoke(['--overlay', overlay, '--track', track]);
  assert.equal(configured.status, 0, configured.stderr);
  const result = JSON.parse(configured.stdout);
  assert.equal(result.validationDay, '20250102');
  assert.equal(result.published, false, 'empty synthetic evidence must not publish');
  assert.ok((await readdir(dataDir)).includes('sclass-history.json'));
});

const assets = {
  overlay: { attribution: 'synthetic', signals: [{ id: 1, ref: 'YA 9901', point: [8, 0], kinds: ['main'],
    edge: { wayId: 9, from: 1, to: 2, t: .8, point: [8, 0] }, travel: [1, 0], facing: [-1, 0],
    side: 'left', sideSource: 'assumed-left', berth: '9901', review: 'osm-ref-match' }] },
  track: { nodes: [], ways: [], rails: [], platforms: [], tracks: [], buildings: [] },
};
async function dailyFixture(days = [1, 2]) {
  const scratch = path.join(root, '.scratch'); await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(path.join(scratch, 'sclass-relearn-test-'));
  await mkdir(path.join(dir, 'recordings'));
  await writeFile(path.join(dir, 'anchors.json'), JSON.stringify({ area: 'Y9', sources: ['synthetic'], anchors: [], unmapped: [] }));
  for (const day of days) {
    const start = Date.UTC(2025, 0, day);
    const rows = [{ t: start, e: { kind: 'sclass', area: 'Y9', msgType: 'SF', address: '10', data: '00' } },
      { t: start + 2_200_000, e: { kind: 'marker', area: 'Y9' } }];
    for (const t of [600_000, 1_200_000, 1_800_000]) rows.push(
      { t: start + t - 5000, e: { kind: 'sclass', area: 'Y9', msgType: 'SF', address: '10', data: '01' } },
      { t: start + t, e: { kind: 'step', area: 'Y9', from: '9901', to: 'EXIT', descr: 'SYN1' } },
      { t: start + t + 100, e: { kind: 'sclass', area: 'Y9', msgType: 'SF', address: '10', data: '00' } });
    await writeFile(path.join(dir, 'recordings', `td-Y9-2025010${day}.ndjson`), rows.map(row => JSON.stringify(row)).join('\n'));
  }
  return { dir, options: { dataDir: dir, now: () => Date.UTC(2025, 0, days.at(-1) + 1, 0, 1), assets } };
}

test('daily relearn publishes atomically with dated backups history and common-day evidence', async () => {
  const { dir, options } = await dailyFixture();
  const first = await relearnSclass(options);
  assert.equal(first.published, true);
  assert.equal(first.validationDay, '20250102');
  assert.equal(first.candidate.heads, 1);
  const before = await readFile(path.join(dir, 'sclass.json'), 'utf8');
  const previous = JSON.parse(before);
  previous.hypotheses[0].heldOut = evidence(1, 100, 100); // stale stored score must be ignored
  await writeFile(path.join(dir, 'sclass.json'), JSON.stringify(previous));
  const second = await relearnSclass(options);
  assert.equal(second.published, true);
  assert.equal(second.incumbent.precision, 1);
  assert.equal(second.incumbent.recall, 1);
  assert.equal(second.backups.length, 2);
  assert.deepEqual(JSON.parse(await readFile(second.backups[0], 'utf8')), previous);
  const current = JSON.parse(await readFile(path.join(dir, 'sclass.json'), 'utf8'));
  assert.equal(current.validation, 'last-recording');
  assert.equal(current.provenance.fingerprints.length, 3);
  assert.deepEqual(current.currentStates, {});
  const sidecar = JSON.parse(await readFile(path.join(dir, 'sclass-table.json'), 'utf8'));
  assert.equal(sidecar.summary.all.bits, 1);
  assert.equal(sidecar.summary.proceed.precision, 1);
  assert.equal(sidecar.folds.length, 2);
  assert.equal(sidecar.sources.length, 3);
  assert.equal((await readdir(dir)).some(name => name.endsWith('.tmp') || name === '.sclass-relearn.lock'), false);
  const history = JSON.parse(await readFile(path.join(dir, 'sclass-history.json'), 'utf8'));
  assert.equal(history.length, 2);
  assert.deepEqual([history[1].bits, history[1].heads, history[1].precision, history[1].recall, history[1].published], [1, 1, 1, 1, true]);
  const saved = await readFile(path.join(dir, 'sclass.json'), 'utf8');
  const validationFile = path.join(dir, 'recordings', 'td-Y9-20250102.ndjson');
  await appendFile(validationFile, '\n' + [1, 0].map((value, i) => JSON.stringify({ t: Date.UTC(2025, 0, 2) + 2_000_000 + i,
    e: { kind: 'sclass', area: 'Y9', msgType: 'SF', address: '10', data: `0${value}` } })).join('\n'));
  const refused = await relearnSclass(options);
  assert.equal(refused.published, false);
  assert.ok(refused.reasons.includes('Decoded head count regressed'));
  assert.equal(await readFile(path.join(dir, 'sclass.json'), 'utf8'), saved);
  assert.match(refused.dropped[0].reason, /Held-out oracle failed/);
  const finalHistory = JSON.parse(await readFile(path.join(dir, 'sclass-history.json'), 'utf8'));
  assert.equal(finalHistory.length, 3);
  assert.equal(finalHistory[2].published, false);
  assert.equal(finalHistory[2].bits, 1);
});

test('daily relearn over three completed days validates leave-one-recording-out and publishes the nested scores', async () => {
  const { dir, options } = await dailyFixture([1, 2, 3]);
  const result = await relearnSclass(options);
  assert.equal(result.published, true, result.reasons.join(' '));
  assert.equal(result.validationDay, '20250103');
  const current = JSON.parse(await readFile(path.join(dir, 'sclass.json'), 'utf8'));
  assert.equal(current.validation, 'leave-one-recording-out');
  const sidecar = JSON.parse(await readFile(path.join(dir, 'sclass-table.json'), 'utf8'));
  assert.equal(sidecar.loo?.scheme, 'leave-one-recording-out');
  assert.equal(sidecar.loo?.nested.length, 3);
  assert.equal(sidecar.folds.length, 3);
});

test('daily relearn with insufficient completed days keeps the current table and records a refusal', async () => {
  const { dir, options } = await dailyFixture();
  const saved = JSON.stringify({ area: 'Y9', hypotheses: [] });
  await writeFile(path.join(dir, 'sclass.json'), saved);
  const result = await relearnSclass({ ...options, now: () => Date.UTC(2025, 0, 2, 12) });
  assert.equal(result.published, false);
  assert.match(result.reasons.join(' '), /at least two completed UTC/);
  assert.equal(await readFile(path.join(dir, 'sclass.json'), 'utf8'), saved);
  assert.equal(JSON.parse(await readFile(path.join(dir, 'sclass-history.json'), 'utf8'))[0].published, false);
});

test('daily relearn rejects concurrent publication and releases its lock after input failure', async () => {
  const { dir, options } = await dailyFixture();
  await writeFile(path.join(dir, '.sclass-relearn.lock'), '{}');
  await assert.rejects(relearnSclass(options), /already locked/);
  const { dir: other, options: otherOptions } = await dailyFixture();
  await writeFile(path.join(other, 'anchors.json'), '{}');
  await assert.rejects(relearnSclass(otherOptions), /AnchorMap|fields/);
  assert.equal((await readdir(other)).includes('.sclass-relearn.lock'), false);
  const { dir: wrongDay, options: wrongOptions } = await dailyFixture();
  await appendFile(path.join(wrongDay, 'recordings', 'td-Y9-20250102.ndjson'), '\n' + JSON.stringify({
    t: Date.UTC(2025, 0, 3), e: { kind: 'marker', area: 'Y9' } }));
  await assert.rejects(relearnSclass(wrongOptions), /outside its named UTC day/);
});

test('on demand relearn CLI uses the guarded job and prints only a decision summary', async () => {
  const { dir } = await dailyFixture();
  const result = spawnSync(process.execPath, [path.join(root, 'kings-cross-src/tools/sclass.ts'), '--relearn', '--data-dir', dir],
    { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.published, true);
  assert.equal(summary.validationDay, '20250102');
  assert.equal(summary.candidate.bits, 1);
  assert.equal(summary.hypotheses, undefined);
  assert.deepEqual(summary.reasons, []);
});

test('relearn uses leave-one-recording-out once three continuous sessions exist', () => {
  const row = t => ({ t, e: { kind: 'heartbeat', area: 'Y9' } });
  const other = t => ({ t, e: { kind: 'heartbeat', area: 'X0' } });
  assert.equal(relearnValidation([[row(0)], [row(1e9)]], 'Y9'), 'last-recording');
  assert.equal(relearnValidation([[row(0)], [row(1e9), row(1e9 + 11 * 60_000)]], 'Y9'), 'leave-one-recording-out', 'an outage splits a day into two sessions');
  assert.equal(relearnValidation([[row(0)], [row(1e9), other(1e9 + 5 * 60_000), row(1e9 + 11 * 60_000)]], 'Y9'), 'leave-one-recording-out', 'another area does not bridge an outage');
  assert.equal(relearnValidation([[row(0)], [row(1e9), row(1e9 + 9 * 60_000)]], 'Y9'), 'last-recording');
});

/** core/waverley-data.ts's packed path: decimetre deltas, zigzag, little-endian base-128 varints, base64. */
const packPath = points => Buffer.from(points.flatMap((p, i) => [p[0] - (points[i - 1]?.[0] ?? 0), p[1] - (points[i - 1]?.[1] ?? 0)])
  .map(v => Math.round(v * 10)).map(v => (v < 0 ? -2 * v - 1 : 2 * v)).flatMap(n => { const out = []; while (n > 127) { out.push((n & 127) | 128); n = Math.floor(n / 128); } out.push(n); return out; })).toString('base64');
test('each listed area names its own committed assets, and a packed station scene reads as the track its page builds', () => {
  assert.deepEqual(AREA_ASSETS.Y9, { overlay: 'web/src/data/kx-signals.json', track: 'web/src/data/kx-track.json', legacyEnv: true });
  assert.deepEqual(AREA_ASSETS.EB, { overlay: 'web/src/data/waverley-signals.json', track: 'web/src/data/waverley-scene.json' });
  assert.equal(AREA_ASSETS.ZZ, undefined);
  // two rails sharing a point: one junction node, local ids by coordinate (core/waverley-anchors.ts)
  const scene = { origin: { lat: 0, lon: 0 }, attribution: 'synthetic', rails: [
    { id: 'way/2', tags: { railway: 'rail' }, path: [[0, 0], [10, 0]] }, { id: 'way/1', tags: { railway: 'rail' }, path: [[10, 0], [20, 5]] }], platforms: [] };
  const plain = { nodes: [[1, 0, 0]], rails: [], platforms: [] };
  assert.equal(areaTrack(plain), plain, 'a KxData passes through');
  const track = areaTrack({ ...scene, format: undefined });
  assert.equal(track, areaTrack(track), 'an already-built track is not decoded twice');
  const packed = areaTrack({ ...scene, format: 'waverley-varint-v1', q: 0.1,
    rails: scene.rails.map(r => ({ ...r, path: packPath(r.path) })) });
  assert.deepEqual(packed.nodes, [[1, 0, 0], [2, 10, 0], [3, 20, 5]]);
  assert.deepEqual(packed.rails.map(r => r.nodes), [[2, 3], [1, 2]]);
});
