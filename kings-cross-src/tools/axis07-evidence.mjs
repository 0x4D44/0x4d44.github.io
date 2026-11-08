// Private axis-7 evidence. Child output is consumed, never copied into the report.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keychainIdentifiers, identifierPatterns, redact, privateCommand, scanGit, scanFiles } from './axis07-scan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), pkg = resolve(root, 'kings-cross-src');
const inside = (base, file) => { const r = relative(base, file); return r !== '' && r !== '..' && !r.startsWith('../') && !isAbsolute(r); };

export function evidenceOptions(args) {
  const values = new Map(), logs = [];
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i], v = args[i + 1];
    if (!['--dist', '--out', '--data-dir', '--relay-log', '--mutation-result', '--browser-report'].includes(k) ||
        !v || v.startsWith('--') || (k !== '--relay-log' && values.has(k))) throw new Error('invalid evidence arguments');
    if (k === '--relay-log') logs.push(resolve(v)); else values.set(k, v);
  }
  if (!values.has('--dist')) throw new Error('--dist is required');
  const out = resolve(values.get('--out') ?? resolve(root, '.scratch/axis07'));
  if (!inside(resolve(root, '.scratch'), out)) throw new Error('--out must be beneath the worktree .scratch');
  return { dist: resolve(values.get('--dist')), out, logs,
    dataDir: resolve(values.get('--data-dir') ?? process.env.KX_DATA_DIR ?? resolve(homedir(), 'kx-data')),
    mutationResult: values.has('--mutation-result') ? resolve(values.get('--mutation-result')) : null,
    browserReport: values.has('--browser-report') ? resolve(values.get('--browser-report')) : null };
}

async function privateOutput(directory, patterns) {
  if (redact(directory, patterns) !== directory) throw new Error('output path contains an account identifier');
  const scratch = resolve(root, '.scratch');
  if (!inside(scratch, directory)) throw new Error('output must be beneath .scratch');
  await mkdir(scratch, { recursive: true });
  const base = await realpath(scratch);
  let parent = directory;
  for (;;) {
    try { const actual = await realpath(parent); if (actual !== base && !inside(base, actual)) throw new Error('output symlink escapes .scratch'); break; }
    catch (e) { if (e.code !== 'ENOENT') throw e; parent = dirname(parent); }
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for (const name of ['axis07-evidence.json', 'axis07-evidence.md', 'relay-mutation.json']) {
    try { if (!inside(base, await realpath(resolve(directory, name)))) throw new Error('output file escapes .scratch'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

/** Only fixed numeric TAP summary lines survive. No assertion values or names are logged. */
export function suiteSummary() {
  const result = { tests: null, pass: null, fail: null, cancelled: null, skipped: null };
  let tail = '', eperm = 0;
  const line = (text) => {
    const match = /^# (tests|pass|fail|cancelled|skipped) (\d+)$/.exec(text);
    if (match) result[match[1]] = Number(match[2]);
    if (/code: ['"]?EPERM/.test(text)) eperm++;
  };
  return { push(chunk) {
    const text = tail + chunk.toString('utf8'), rows = text.split('\n'); tail = rows.pop();
    for (const row of rows) line(row.replace(/\r$/, ''));
    if (tail.length > 64 * 1024) tail = ''; // Assertion bodies are not evidence summaries.
  }, end(run) {
    if (tail) line(tail);
    return { ...result, listenerPermissionFailures: eperm, timedOut: !!run.timedOut,
      status: !run.failed && !run.timedOut && run.code === 0 && result.tests > 0 && result.pass === result.tests && result.fail === 0 && result.cancelled === 0 ? 'PASS' : 'FAIL' };
  } };
}

export function mutationSummary() {
  let tail = '', caught = null, total = null, newTests = null, newTestsTotal = null, timeouts = 0, survivors = 0, neverFailed = 0;
  const line = (text) => {
    let m;
    if ((m = /^(\d+)\/(\d+) mutations caught$/.exec(text.trim()))) { caught = +m[1]; total = +m[2]; }
    if ((m = /^(\d+) caught with timeout$/.exec(text.trim()))) timeouts = +m[1];
    if ((m = /^(\d+)\/(\d+) new tests observed failing at least once$/.exec(text.trim()))) { newTests = +m[1]; newTestsTotal = +m[2]; }
    if (/^\s*(?:NOT CAUGHT:|\[SURVIVED\])/.test(text)) survivors++;
    if (/^\s*NEVER FAILED:/.test(text)) neverFailed++;
  };
  return { push(chunk) {
    const rows = (tail + chunk.toString('utf8')).split('\n'); tail = rows.pop();
    for (const row of rows) line(row.replace(/\r$/, ''));
    if (tail.length > 64 * 1024) tail = '';
  }, end(run = { code: 0 }) {
    if (tail) line(tail);
    return { caught, total, caughtWithTimeout: timeouts, newTests, newTestsTotal, survivors, neverFailed, timedOut: !!run.timedOut,
      status: !run.failed && !run.timedOut && run.code === 0 && total > 0 && caught === total && survivors === 0 && neverFailed === 0 &&
        (newTestsTotal === null || newTests === newTestsTotal) ? 'PASS' : 'FAIL' };
  } };
}

async function relayFingerprint() {
  const digest = createHash('sha256');
  const names = (await readdir(resolve(pkg, 'relay'))).filter((n) => n.endsWith('.mjs')).map((n) => `relay/${n}`);
  names.push(...(await readdir(resolve(pkg, 'relay/tests'))).filter((n) => n.endsWith('.mjs')).map((n) => `relay/tests/${n}`), 'tools/mutation/relay.py');
  for (const name of names.sort()) { digest.update(name + '\0'); digest.update(await readFile(resolve(pkg, name))); }
  return digest.digest('hex');
}

export async function runSuite(run = privateCommand) {
  const files = (await readdir(resolve(pkg, 'relay/tests'))).filter((n) => n.endsWith('.test.mjs')).sort().map((n) => resolve(pkg, 'relay/tests', n));
  const summary = suiteSummary();
  const result = await run(process.execPath, ['--test', '--test-reporter=tap', '--test-timeout=20000', ...files], { onStdout: (chunk) => summary.push(chunk), timeoutMs: 180_000, cwd: pkg });
  return summary.end(result);
}

async function runMutation(options, sourceHash, run = privateCommand) {
  if (options.mutationResult) {
    try {
      if (options.mutationResult.endsWith('.json')) {
        const value = JSON.parse(await readFile(options.mutationResult, 'utf8'));
        const valid = value.status === 'PASS' && Number.isInteger(value.total) && value.total > 0 && value.caught === value.total &&
          value.survivors === 0 && !value.timedOut && !value.neverFailed &&
          (value.newTestsTotal === undefined || value.newTests === value.newTestsTotal) && (!value.sourceHash || value.sourceHash === sourceHash);
        const number = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null;
        return { status: valid ? 'PASS' : 'FAIL', caught: number(value.caught), total: number(value.total), survivors: number(value.survivors),
          caughtWithTimeout: number(value.caughtWithTimeout ?? 0), sourceHash: /^[a-f0-9]{64}$/.test(value.sourceHash) ? value.sourceHash : null,
          sourceVerified: value.sourceHash === sourceHash, supplied: true };
      }
      const summary = mutationSummary();
      for await (const chunk of createReadStream(options.mutationResult)) summary.push(chunk);
      return { ...summary.end(), supplied: true, sourceVerified: false,
        provenance: 'Supplied text summary; source binding not independently established.' };
    } catch { return { status: 'FAIL', reason: 'mutation result could not be read', supplied: true }; }
  }
  const summary = mutationSummary();
  const result = await run('python3', ['-I', '-u', resolve(pkg, 'tools/mutation/relay.py'), resolve(pkg, 'relay'), resolve(options.out, 'relay-mutations')],
    { onStdout: (chunk) => summary.push(chunk), timeoutMs: 600_000 });
  return { ...summary.end(result), sourceHash, sourceVerified: true, supplied: false };
}

export async function browserEvidence(path) {
  if (!path) return { status: 'UNAVAILABLE', reason: 'GPU browser run not supplied' };
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    const phases = Array.isArray(value.phases) ? value.phases : [];
    const names = new Set(phases.map((p) => p.name));
    const valid = value.status === 'PASS' && value.validGpu === true && typeof value.renderer === 'string' &&
      /Metal/i.test(value.renderer) && !/SwiftShader|llvmpipe|software/i.test(value.renderer) &&
      ['no-relay', 'connected', 'stopped', 'sse-drop', 'recovered'].every((n) => names.has(n)) && phases.every((p) =>
        typeof p.statusLine === 'string' && Number.isInteger(p.trainCount) && p.trainCount >= 0 && p.validCsp === true && p.attribution?.present?.osm === true);
    return { status: valid ? 'PASS' : 'FAIL', renderer: typeof value.renderer === 'string' ? value.renderer : null,
      validGpu: value.validGpu === true, phases: phases.map((p) => ({ name: p.name, statusLine: p.statusLine, trainCount: p.trainCount,
        attribution: p.attribution, validCsp: p.validCsp, screenshot: p.screenshot })), source: path };
  } catch { return { status: 'FAIL', reason: 'browser result could not be read' }; }
}

function sanitize(value, patterns) {
  if (typeof value === 'string') return redact(value, patterns);
  if (Array.isArray(value)) return value.map((v) => sanitize(v, patterns));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [redact(k, patterns), sanitize(v, patterns)]));
  return value;
}

function markdown(report) {
  const lines = ['# Axis 07 — Robustness and security', '', `**${report.status}**. No account identifier or raw command output is included in this pack.`, '',
    '| Evidence | Status | Counts |', '| --- | --- | --- |',
    `| Relay test suite | ${report.relaySuite.status} | ${report.relaySuite.pass ?? '—'}/${report.relaySuite.tests ?? '—'} passing; ${report.relaySuite.listenerPermissionFailures ?? 0} EPERM |`,
    `| Relay mutation run | ${report.mutation.status} | ${report.mutation.caught ?? '—'}/${report.mutation.total ?? '—'} caught; ${report.mutation.survivors ?? '—'} survivors |`,
    `| Isolated loopback relay probes | ${report.relayProbe.status} | ${(report.relayProbe.checks ?? []).length} checks |`,
    `| Keychain identifiers | ${report.keychain.status} | ${report.keychain.items.map((i) => `${i.service}: ${i.state}`).join('; ')} |`,
    `| Tracked tree and history scan | ${report.secretScan.git.status} | ${report.secretScan.git.trackedMatches ?? '—'} tracked matches; ${report.secretScan.git.historicalMatches ?? '—'} historical matches |`,
    `| Built output, recordings and relay logs scan | ${report.secretScan.files.status} | ${report.secretScan.files.matchedFiles ?? '—'} matched files / ${report.secretScan.files.filesScanned ?? '—'} scanned |`,
    `| Built OpenStreetMap marker | ${report.osmMarker.status} | ${report.osmMarker.files} files (display requires browser evidence) |`,
    `| GPU with/without relay | ${report.browser.status} | ${(report.browser.phases ?? []).length} observed phases |`, '',
    '## Relay refusals and cleanup', '', '| Check | Status |', '| --- | --- |',
    ...(report.relayProbe.checks ?? []).map((check) => `| ${String(check.name).replace(/[\r\n|]/g, ' ')} | ${check.status} |`), '',
    '## Match paths', ''];
  const matches = [...(report.secretScan.git.findings ?? []), ...(report.secretScan.files.findings ?? [])];
  lines.push(...(matches.length ? matches.map((m) => `- ${m.scope}: ${String(m.path).replace(/[\r\n|]/g, ' ')}`) : ['No matching paths reported. Unavailable scans do not establish a clean result.']));
  lines.push('', '## Gaps and limitations', '', ...report.gaps.map((gap) => `- ${gap}`), '',
    'Full structured checks, scan counts, paths, provenance and replayable commands are in axis07-evidence.json. The browser report and images are separate private inputs.', '');
  return lines.join('\n');
}

export async function runAxis07(args, dependencies = {}) {
  const options = evidenceOptions(args);
  let loaded;
  try { loaded = await (dependencies.loadIdentifiers ?? keychainIdentifiers)(); }
  catch { loaded = { ok: false, items: [{ service: 'kx-ntrod', state: 'unavailable' }, { service: 'kx-ptac', state: 'unavailable' }], identifiers: [] }; }
  const patterns = identifierPatterns(loaded.identifiers);
  await privateOutput(options.out, patterns);
  const sourceHash = await (dependencies.fingerprint ?? relayFingerprint)();
  const relaySuite = await (dependencies.suite ?? runSuite)(dependencies.run);
  const mutation = await (dependencies.mutation ?? runMutation)(options, sourceHash, dependencies.run);
  const probe = dependencies.probe ?? (async (opts) => (await import('./axis07-relay.mjs')).probeRelaySecurity(opts));
  let relayProbe;
  try { relayProbe = await probe({ dataDir: resolve(options.out, 'probe-data') }); }
  catch { relayProbe = { status: 'UNAVAILABLE', checks: [], reason: 'isolated relay probe unavailable' }; }
  let git, files;
  const gaps = [];
  if (loaded.ok && loaded.identifiers.length) {
    git = await (dependencies.gitScan ?? scanGit)(root, loaded.identifiers);
    const scopes = [{ scope: 'dist', path: options.dist }, { scope: 'recordings', path: resolve(options.dataDir, 'recordings') },
      ...options.logs.map((path) => ({ scope: 'relay-logs', path })),
      ...((relayProbe.paths?.evidenceDir ?? relayProbe.paths?.dataDir) ? [{ scope: 'probe-artifacts', path: relayProbe.paths.evidenceDir ?? relayProbe.paths.dataDir }] : [])];
    files = await (dependencies.fileScan ?? scanFiles)(scopes, loaded.identifiers);
    if (!options.logs.length) { files.status = 'FAIL'; gaps.push('No relay log path supplied; use --relay-log for every relay log file/directory.'); }
  } else {
    git = { status: 'UNAVAILABLE', findings: [] }; files = { status: 'UNAVAILABLE', findings: [] };
    gaps.push('Required keychain identifier unavailable, or optional item could not be checked. Secret scans were not claimed clean.');
  }
  const browser = await (dependencies.browser ?? browserEvidence)(options.browserReport);
  if (browser.status !== 'PASS') gaps.push('GPU page evidence is missing or failed; run axis07-browser.mjs and supply --browser-report.');
  if (relayProbe.status !== 'PASS') gaps.push('Self-started relay network probes did not pass; sandbox EPERM is a coverage gap.');
  const unavailableProbes = (relayProbe.checks ?? []).filter((check) => check.status === 'UNAVAILABLE');
  for (const check of unavailableProbes) gaps.push(`Network probe unavailable: ${check.name}; verify this refusal outside the sandbox.`);
  if (mutation.supplied && !mutation.sourceVerified) gaps.push('Supplied mutation text lacks a source fingerprint; inspect its provenance before scoring.');
  if (git.findingsTruncated || files.findingsTruncated) gaps.push('Match path list was capped; numeric match counts cover the scan.');
  const keychain = { status: loaded.ok && loaded.identifiers.length ? 'PASS' : 'FAIL', items: loaded.items, identifierCount: loaded.identifiers.length };
  const osmMarker = { status: files.osmMarkerFiles > 0 ? 'PASS' : 'UNAVAILABLE', files: files.osmMarkerFiles ?? 0 };
  const statuses = [relaySuite, mutation, relayProbe, keychain, git, files, browser, osmMarker].map((v) => v.status);
  const status = statuses.includes('FAIL') ? 'FAIL' : statuses.every((s) => s === 'PASS') && !unavailableProbes.length ? 'PASS' : 'INCOMPLETE';
  const report = sanitize({ schema: 1, status, generatedAt: new Date().toISOString(), sourceHash, relaySuite, mutation, relayProbe, keychain,
    secretScan: { git, files }, osmMarker, browser, gaps,
    reproduction: { command: 'node', args: [fileURLToPath(import.meta.url), ...args] },
    policy: 'Read-only Git. Account attributes only, no password lookup. Patterns pass to Git via stdin. No raw command output or matched content is retained. No relay means sample trains; browser evidence labels that honestly.' }, patterns);
  await writeFile(resolve(options.out, 'axis07-evidence.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  await writeFile(resolve(options.out, 'axis07-evidence.md'), markdown(report), { mode: 0o600 });
  await writeFile(resolve(options.out, 'relay-mutation.json'), JSON.stringify(sanitize(mutation, patterns), null, 2) + '\n', { mode: 0o600 });
  return { report, path: redact(resolve(options.out, 'axis07-evidence.md'), patterns) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAxis07(process.argv.slice(2)).then(({ report, path }) => {
    console.log(JSON.stringify({ status: report.status, report: path })); process.exitCode = report.status === 'PASS' ? 0 : 1;
  }).catch(() => { console.error('axis07: evidence could not be completed'); process.exitCode = 1; });
}
