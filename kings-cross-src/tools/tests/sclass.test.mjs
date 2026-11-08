import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, countHeads } from '../sclass.ts';

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
  assert.match(invoke(['--validation', 'random']).stderr, /must be halves or last-recording/);
});
