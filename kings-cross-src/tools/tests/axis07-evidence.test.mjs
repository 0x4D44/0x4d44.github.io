import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, readFile, writeFile, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evidenceOptions, runAxis07, runSuite, suiteSummary, mutationSummary, browserEvidence } from '../axis07-evidence.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const fake = 'Synthetic+Evidence@Example.invalid', hash = 'a'.repeat(64);
async function temporary(t) {
  await mkdir(resolve(root, '.scratch'), { recursive: true });
  const dir = await mkdtemp(resolve(root, '.scratch/axis07-evidence-'));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
function injected(overrides = {}) {
  return {
    loadIdentifiers: async () => ({ ok: true, identifiers: [fake], items: [{ service: 'kx-ntrod', state: 'present' }, { service: 'kx-ptac', state: 'absent' }] }),
    fingerprint: async () => hash,
    suite: async () => ({ status: 'PASS', tests: 9, pass: 9, fail: 0 }),
    mutation: async () => ({ status: 'PASS', caught: 4, total: 4, survivors: 0 }),
    probe: async () => ({ status: 'PASS', checks: [{ name: 'host refusal', status: 'PASS' }], paths: {} }),
    gitScan: async () => ({ status: 'PASS', trackedMatches: 0, historicalMatches: 0, findings: [] }),
    fileScan: async () => ({ status: 'PASS', matchedFiles: 0, filesScanned: 3, findings: [], osmMarkerFiles: 1 }),
    browser: async () => ({ status: 'PASS', phases: [] }),
    ...overrides,
  };
}
const args = (out) => ['--dist', resolve(out, 'dist'), '--data-dir', resolve(out, 'data'), '--relay-log', resolve(out, 'relay.log'), '--out', resolve(out, 'out')];

test('axis07 evidence: options require a build and keep output under private scratch', () => {
  assert.throws(() => evidenceOptions([]), /dist/);
  assert.throws(() => evidenceOptions(['--dist', 'invented', '--out', root]), /scratch/);
  assert.throws(() => evidenceOptions(['--dist', 'a', '--dist', 'b']), /invalid/);
  assert.throws(() => evidenceOptions(['--dist', 'a', '--identifier', fake]), /invalid/);
  const result = evidenceOptions(['--dist', 'invented', '--relay-log', 'one.log', '--relay-log', 'two.log']);
  assert.equal(result.logs.length, 2);
});

test('axis07 evidence: only complete passing suite and mutation summaries can pass', () => {
  const tap = suiteSummary(); tap.push(Buffer.from(`# tests 3\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\nassertion: ${fake}\n`));
  const suite = tap.end({ code: 0 }); assert.equal(suite.status, 'PASS'); assert.equal(JSON.stringify(suite).includes(fake), false);
  const incomplete = suiteSummary(); incomplete.push(Buffer.from('# tests 3\n# pass 3\n'));
  assert.equal(incomplete.end({ code: 0 }).status, 'FAIL');
  const mutation = mutationSummary(); mutation.push(Buffer.from('4/4 mutations caught\n0 caught with timeout\n3/3 new tests observed failing at least once\n'));
  assert.equal(mutation.end().status, 'PASS');
  const survivor = mutationSummary(); survivor.push(Buffer.from(`4/4 mutations caught\nNOT CAUGHT: ${fake}\n`));
  const result = survivor.end(); assert.equal(result.status, 'FAIL'); assert.equal(JSON.stringify(result).includes(fake), false);
  const timeout = suiteSummary(); assert.equal(timeout.end({ code: 0, timedOut: true }).status, 'FAIL');
});

test('axis07 evidence: relay tests always run from the package with bounded execution', async () => {
  const result = await runSuite(async (_command, argv, options) => {
    assert.equal(options.cwd, resolve(root, 'kings-cross-src'));
    assert.equal(options.timeoutMs, 180000);
    assert.ok(argv.includes('--test-timeout=20000'));
    options.onStdout(Buffer.from('# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n'));
    return { code: 0 };
  });
  assert.equal(result.status, 'PASS');
});

test('axis07 evidence: missing keychain identifiers fail without claiming a secret scan', async (t) => {
  const dir = await temporary(t);
  const result = await runAxis07(args(dir), injected({
    loadIdentifiers: async () => ({ ok: false, identifiers: [], items: [{ service: 'kx-ntrod', state: 'absent' }, { service: 'kx-ptac', state: 'absent' }] }),
    gitScan: async () => assert.fail('scan cannot run without an identifier'), fileScan: async () => assert.fail('scan cannot run without an identifier'),
  }));
  assert.equal(result.report.status, 'FAIL'); assert.equal(result.report.keychain.status, 'FAIL');
  assert.equal(result.report.secretScan.git.status, 'UNAVAILABLE');
  assert.match(await readFile(result.path, 'utf8'), /kx-ntrod: absent/);
});

test('axis07 evidence: a complete injected run scans every required scope and never writes the identifier', async (t) => {
  const dir = await temporary(t); let scopes;
  const result = await runAxis07(args(dir), injected({
    probe: async () => ({ status: 'PASS', checks: [{ name: 'synthetic check', status: 'PASS', details: fake }], paths: { evidenceDir: resolve(dir, 'probe'), dataDir: resolve(dir, 'probe/data') } }),
    gitScan: async (_repo, identifiers) => { assert.deepEqual(identifiers, [fake]); return { status: 'PASS', findings: [], trackedMatches: 0, historicalMatches: 0 }; },
    fileScan: async (value, identifiers) => { scopes = value; assert.deepEqual(identifiers, [fake]); return { status: 'PASS', matchedFiles: 0, filesScanned: 4, findings: [], osmMarkerFiles: 1 }; },
  }));
  assert.equal(result.report.status, 'PASS');
  assert.deepEqual(scopes.map((s) => s.scope), ['dist', 'recordings', 'relay-logs', 'probe-artifacts']);
  assert.equal(scopes.find((s) => s.scope === 'probe-artifacts').path, resolve(dir, 'probe'));
  for (const name of ['axis07-evidence.json', 'axis07-evidence.md', 'relay-mutation.json']) {
    const text = await readFile(resolve(dir, 'out', name), 'utf8');
    assert.equal(text.toLowerCase().includes(fake.toLowerCase()), false);
    assert.equal(text.includes(encodeURIComponent(fake)), false);
  }
  assert.equal(result.report.relayProbe.checks[0].details, '[redacted-account]');
});

test('axis07 evidence: an unavailable network-interface probe remains an explicit coverage gap', async (t) => {
  const dir = await temporary(t);
  const result = await runAxis07(args(dir), injected({
    probe: async () => ({ status: 'PASS', checks: [{ name: 'non_loopback_refused', status: 'UNAVAILABLE', required: false }] }),
  }));
  assert.equal(result.report.status, 'INCOMPLETE');
  assert.ok(result.report.gaps.some((gap) => gap.includes('non_loopback_refused')));
});

test('axis07 evidence: absent relay logs and incomplete GPU phases prevent a clean pack', async (t) => {
  const dir = await temporary(t);
  const noLogs = args(dir).filter((_value, index) => index !== 4 && index !== 5);
  const result = await runAxis07(noLogs, injected());
  assert.equal(result.report.status, 'FAIL'); assert.equal(result.report.secretScan.files.status, 'FAIL');
  const file = resolve(dir, 'browser.json');
  const phase = (name) => ({ name, conditionObserved: true, cityLoaded: true,
    mode: name === 'no-relay' ? 'demo' : name === 'offline-replay' ? 'replay' : 'live',
    connection: name === 'no-relay' ? 'relay absent' : name === 'offline-replay' ? 'playing' : ['stopped', 'sse-drop'].includes(name) ? 'reconnecting' : 'connected',
    proxyEnabled: !['no-relay', 'stopped', 'offline-replay'].includes(name),
    statusLine: name === 'no-relay' ? 'sample trains · relay absent' : 'synthetic status', trainCount: 2,
    validCsp: true, cspErrorCount: 0, cspInvalidSourceCount: 0, consoleErrorCount: 0, unexpectedNetworkFailures: [],
    board: { present: true, mode: name === 'no-relay' ? 'sample' : name === 'offline-replay' ? 'replay' : 'live', platformTrainCount: 1 },
    screenshot: `${name}.png`, relayRequestCounts: {}, replayStartMs: 1000, replayTimeMs: 2000,
    attribution: { present: { osm: true, environmentAgency: true, openGovernmentLicence: true, openMeteo: true } },
    failedRequests: name === 'no-relay' ? [{ url: 'http://127.0.0.1:43210/relay/health', requestId: 'synthetic-request', status: 503 }] : [] });
  const good = { status: 'PASS', validGpu: true, renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4)', networkDiagnostics: [],
    cspAudit: { valid: true, connectSrc: ["'self'", 'ws://127.0.0.1:*', 'ws://localhost:*', 'https://api.open-meteo.com', 'https://archive-api.open-meteo.com'], problems: [] },
    phases: ['no-relay', 'connected', 'stopped', 'sse-drop', 'recovered', 'offline-replay'].map(phase) };
  await writeFile(file, JSON.stringify(good));
  const imported = await browserEvidence(file);
  assert.equal(imported.status, 'PASS');
  assert.deepEqual(imported.phases[0].failedRequests, good.phases[0].failedRequests, 'the combined pack keeps failed request URLs');
  assert.deepEqual(imported.networkDiagnostics, good.networkDiagnostics, 'transition diagnostics remain available in the combined pack');
  const stale = { ...good, phases: good.phases.filter(p => p.name !== 'offline-replay') };
  await writeFile(file, JSON.stringify(stale));
  assert.equal((await browserEvidence(file)).status, 'FAIL', 'a stale five-phase pack cannot prove static offline replay');
  const relayReplay = structuredClone(good); relayReplay.phases[5].relayRequestCounts['/relay/anchors'] = 1;
  await writeFile(file, JSON.stringify(relayReplay));
  assert.equal((await browserEvidence(file)).status, 'FAIL', 'offline replay cannot fetch relay anchors');
  for (const bad of [{ ...good, renderer: 'SwiftShader' }, { ...good, phases: [phase('connected')] },
    { ...good, phases: good.phases.map((p) => ({ ...p, validCsp: false })) },
    { ...good, phases: good.phases.map((p) => ({ ...p, attribution: { present: { osm: false } } })) },
    { ...good, phases: good.phases.map((p) => ({ ...p, attribution: { present: { ...p.attribution.present, openMeteo: false } } })) },
    // Each credit is required on its own: a pack that lacks only one of them cannot pass (openMeteo is the case above).
    ...['osm', 'environmentAgency', 'openGovernmentLicence'].map((credit) => ({ ...good,
      phases: good.phases.map((p) => ({ ...p, attribution: { present: { ...p.attribution.present, [credit]: false } } })) })),
    { ...good, cspAudit: { valid: false, connectSrc: ['*'], problems: ['connect-src is *'] } }, { ...good, cspAudit: undefined }]) {
    await writeFile(file, JSON.stringify(bad)); assert.equal((await browserEvidence(file)).status, 'FAIL');
  }
});

test('axis07 evidence: supplied mutation evidence must match its totals and source fingerprint', async (t) => {
  const dir = await temporary(t), file = resolve(dir, 'mutation.json');
  const options = [...args(dir), '--mutation-result', file];
  const good = { status: 'PASS', caught: 5, total: 5, survivors: 0, newTests: 3, newTestsTotal: 3, sourceHash: hash };
  await writeFile(file, JSON.stringify(good));
  const dependencies = injected({ mutation: undefined });
  assert.equal((await runAxis07(options, dependencies)).report.mutation.status, 'PASS');
  for (const bad of [{ ...good, sourceHash: 'b'.repeat(64) }, { ...good, caught: 4 }, { ...good, newTests: 2 }, { ...good, neverFailed: 1 }]) {
    await writeFile(file, JSON.stringify(bad)); assert.equal((await runAxis07(options, dependencies)).report.mutation.status, 'FAIL');
  }
});

test('axis07 evidence: private output cannot follow a symlink out of scratch', async (t) => {
  const dir = await temporary(t); await symlink(root, resolve(dir, 'out'));
  await assert.rejects(runAxis07(args(dir), injected()), /symlink escapes/);
});
