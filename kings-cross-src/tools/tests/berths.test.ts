import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const packageRoot = path.join(repoRoot, 'kings-cross-src');
const scratch = path.join(repoRoot, '.scratch');
const cli = path.join(packageRoot, 'tools', 'berths.ts');

function syntheticGraph() {
  return {
    attribution: 'Synthetic test graph', origin: { lat: 51.53, lon: -0.12 },
    nodes: [[1, 0, 0], [2, 1000, 0]],
    rails: [{ id: 10, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 }],
    switches: [], buffers: [], platforms: [], buildings: [],
    signals: [
      { id: 1, x: 250, z: 0, ref: 'YA 2345', direction: 'forward', kinds: ['main'] },
      { id: 2, x: 750, z: 0, ref: 'YA 2346', direction: 'backward', kinds: ['main'] },
      { id: 1, x: 500, z: 0, ref: 'YA 2347', direction: 'forward', kinds: ['main'] },
      { id: 1, x: 0, z: 0, ref: 'YA 2500', direction: 'forward', kinds: ['main'] },
      { id: 2, x: 1000, z: 0, ref: 'YA 2500', direction: 'backward', kinds: ['main'] },
    ],
  };
}

function previousMap(overrides: Record<string, unknown> = {}) {
  return {
    area: 'Y9', sources: ['synthetic previous'],
    anchors: [{ berth: '2345', kind: 'signal', from: 1, to: 2, t: 0.25, point: [250, 0], errorM: 5, evidence: 'frozen previous evidence' }],
    unmapped: [{ berth: 'old-only', reason: 'conflict', detail: 'retain absent prior classification', seen: 1 }],
    ...overrides,
  };
}

function event(kind: string, extra: Record<string, unknown> = {}) {
  return { t: 1000, e: { kind, area: 'Y9', descr: '1A01', ...extra } };
}

async function fixture(options: { previous?: unknown } = {}) {
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(path.join(scratch, 'berths-cli-'));
  const graphPath = path.join(dir, 'synthetic-graph.json');
  const recordingPath = path.join(dir, 'synthetic-recording.ndjson');
  const smartPath = path.join(dir, 'synthetic-smart.json.gz');
  const previousPath = path.join(dir, 'previous-anchors.json');
  const outPath = path.join(dir, 'out');
  await writeFile(graphPath, `${JSON.stringify(syntheticGraph())}\n`);
  const rows = [
    event('interpose', { to: '2345' }),
    event('step', { from: '2345', to: '2346', time: 1000 }),
    event('interpose', { to: '2347' }),
    event('interpose', { to: '2500' }),
    event('interpose', { to: '2999' }),
    { t: 2000, e: { kind: 'snapshot', area: 'Y9', berths: { '2998': '****' } } },
  ];
  await writeFile(recordingPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
  await writeFile(smartPath, gzipSync(Buffer.from(JSON.stringify({ BERTHDATA: [] }))));
  if (options.previous !== undefined) await writeFile(previousPath, `${JSON.stringify(options.previous)}\n`);
  const run = (args: string[]) => spawnSync(process.execPath, [cli, '--recording', recordingPath, '--smart', smartPath,
    '--graph', graphPath, '--out', outPath, ...args], { cwd: packageRoot, encoding: 'utf8', input: '', timeout: 10000 });
  return { dir, graphPath, recordingPath, smartPath, previousPath, outPath, run };
}

test('berths CLI: preserve mode freezes previous geometry, inventories pending candidates, audits every reason, and hashes inputs', async (t) => {
  const f = await fixture({ previous: previousMap() });
  t.after(() => rm(f.dir, { recursive: true, force: true }));
  const result = f.run(['--previous', f.previousPath, '--preserve-positions']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const runtime = JSON.parse(await readFile(path.join(f.outPath, 'anchors.json'), 'utf8'));
  const candidate = JSON.parse(await readFile(path.join(f.outPath, 'anchors-candidate.json'), 'utf8'));
  const report = JSON.parse(await readFile(path.join(f.outPath, 'berths-report.json'), 'utf8'));
  const diff = JSON.parse(await readFile(path.join(f.outPath, 'drawn-position-diff.json'), 'utf8'));
  const previous = JSON.parse(await readFile(f.previousPath, 'utf8'));

  assert.deepEqual(runtime.anchors, previous.anchors, 'runtime anchor objects must stay byte-for-byte equivalent in value');
  assert.ok(runtime.unmapped.some((item: { berth: string; reason: string }) => item.berth === 'old-only' && item.reason === 'conflict'));
  const pending = runtime.unmapped.find((item: { berth: string }) => item.berth === '2347');
  assert.equal(pending?.reason, 'no-evidence');
  assert.match(pending?.detail ?? '', /candidate-pending-validation.*withheld from runtime anchors/i);
  assert.equal(candidate.anchors.some((anchor: { berth: string }) => anchor.berth === '2347'), true);
  assert.equal(report.summary.candidatePlacement.status, 'pending-validation');
  assert.deepEqual(report.summary.candidatePlacement.berths, ['2346', '2347']);
  assert.deepEqual(report.summary.counts.before.anchorsByKind, { platform: 0, signal: 1, smart: 0, inferred: 0 });
  assert.equal(report.summary.counts.after.anchors, 1);
  assert.ok(diff.same.some((item: { berth: string }) => item.berth === '2345'));
  assert.ok(diff.new.some((item: { berth: string }) => item.berth === '2347'));
  assert.equal(diff.compared, true);

  const audits = report.auditDecisions.after;
  const noEvidence = audits.find((audit: { berth: string }) => audit.berth === '2999');
  const conflict = audits.find((audit: { berth: string }) => audit.berth === '2500');
  const pendingAudit = audits.find((audit: { berth: string }) => audit.berth === '2347');
  assert.equal(noEvidence?.reason, 'no-evidence');
  assert.equal(conflict?.reason, 'conflict');
  assert.equal(pendingAudit?.cause, 'candidate-position-review');
  assert.match(pendingAudit?.detail ?? '', /withheld pending drawn-position approval.*drawn-position-diff\.json/i);
  assert.ok(Array.isArray(noEvidence?.predecessors) && Array.isArray(noEvidence?.smartAssociations) && Array.isArray(noEvidence?.anchorPath));
  assert.match(noEvidence?.detail ?? '', /Evidence audit:.*do not establish a metric point/i);
  const observations = Object.fromEntries(report.observationInventory.map((row: { berth: string; observations: object }) => [row.berth, row.observations]));
  assert.equal((observations['2999'] as { interpose: number }).interpose, 1);
  assert.equal((observations['2998'] as { snapshot: number; placeholderEvents: number }).snapshot, 1);
  assert.equal((observations['2998'] as { snapshot: number; placeholderEvents: number }).placeholderEvents, 1);

  const hashes = Object.fromEntries(report.sourceHashes.map((entry: { role: string; sha256: string }) => [entry.role, entry.sha256]));
  assert.deepEqual(Object.keys(hashes).sort(), ['graph', 'previous-anchor-map', 'recording', 'smart']);
  assert.equal(hashes.graph, createHash('sha256').update(await readFile(f.graphPath)).digest('hex'));
  assert.ok(report.graphBounds.geographic.north >= report.graphBounds.geographic.south);
  assert.ok(report.graphBounds.geographic.east > report.graphBounds.geographic.west);
  assert.match(result.stdout, /preserved runtime anchor positions exactly/);
});

test('berths CLI: changed geometry stays frozen and reports measured movement', async (t) => {
  const previous = previousMap({ anchors: [{ berth: '2345', kind: 'signal', from: 1, to: 2, t: 0.2, point: [200, 0], errorM: 5, evidence: 'older point' }] });
  const f = await fixture({ previous });
  t.after(() => rm(f.dir, { recursive: true, force: true }));
  const result = f.run(['--previous', f.previousPath, '--preserve-positions']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const runtime = JSON.parse(await readFile(path.join(f.outPath, 'anchors.json'), 'utf8'));
  const diff = JSON.parse(await readFile(path.join(f.outPath, 'drawn-position-diff.json'), 'utf8'));
  assert.deepEqual(runtime.anchors, previous.anchors);
  const moved = diff.moved.find((item: { berth: string }) => item.berth === '2345');
  assert.equal(moved.displacementM, 50);
  assert.equal(moved.candidate.point[0], 250);
});

test('berths CLI: preserve mode requires --previous', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.dir, { recursive: true, force: true }));
  const result = f.run(['--preserve-positions']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--preserve-positions requires --previous/);
});

test('berths CLI: every JSON destination keeps the symlink output guard', async (t) => {
  const f = await fixture();
  t.after(() => rm(f.dir, { recursive: true, force: true }));
  const files = ['anchors.json', 'anchors-candidate.json', 'berths-report.json', 'drawn-position-diff.json'];
  for (const file of files) {
    const out = path.join(f.dir, `guard-${file.replaceAll('.', '-')}`);
    await mkdir(out);
    await writeFile(path.join(f.dir, 'symlink-target'), 'keep');
    await symlink(path.join(f.dir, 'symlink-target'), path.join(out, file));
    const result = spawnSync(process.execPath, [cli, '--recording', f.recordingPath, '--smart', f.smartPath, '--graph', f.graphPath,
      '--out', out], { cwd: packageRoot, encoding: 'utf8', input: '', timeout: 10000 });
    assert.equal(result.status, 1, `${file}: ${result.stderr}`);
    assert.match(result.stderr, /refusing to write through output symlink/);
    assert.equal(await readFile(path.join(f.dir, 'symlink-target'), 'utf8'), 'keep');
  }
});
