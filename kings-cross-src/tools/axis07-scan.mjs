// Account identifiers stay in this process or a child pipe, never argv, logs or artifacts.
import { execFile, spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readlink } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { parseAccount } from '../relay/keychain.mjs';

const LIMIT = 10_000;
const within = (root, file) => { const r = relative(root, file); return r !== '..' && !r.startsWith('../') && !isAbsolute(r); };

/** Reads attributes only: the evidence command does not need the password. */
export async function keychainIdentifiers({ exec = execFile, platform = process.platform } = {}) {
  const items = [], identifiers = [];
  for (const service of ['kx-ntrod', 'kx-ptac']) {
    if (platform !== 'darwin') { items.push({ service, state: 'unavailable' }); continue; }
    const result = await new Promise((done) => {
      exec('/usr/bin/security', ['find-generic-password', '-s', service],
        { timeout: 10_000, maxBuffer: 64 * 1024, encoding: 'utf8' }, (error, stdout) => {
          if (error) return done({ state: error.code === 44 ? 'absent' : 'unavailable' });
          const account = parseAccount(String(stdout));
          // Control characters cannot safely be represented by grep's line-based stdin.
          done(account && account.length >= 3 && account.length <= 1024 && !/[\x00-\x1f\x7f]/.test(account)
            ? { state: 'present', account } : { state: 'invalid-account' });
        });
    });
    items.push({ service, state: result.state });
    if (result.state === 'present') identifiers.push(result.account);
  }
  return { identifiers: [...new Set(identifiers)], items,
    ok: items[0].state === 'present' && ['present', 'absent'].includes(items[1].state) };
}

export function identifierPatterns(identifiers) {
  return [...new Set(identifiers.flatMap((value) => [value, encodeURIComponent(value),
    JSON.stringify(value).slice(1, -1), value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')])
    // Keep the original too: Unicode lowercasing can expand one character, so
    // a lowercased regexp alone cannot safely redact the original account.
    .flatMap((value) => [value, value.toLowerCase()]))].sort((a, b) => b.length - a.length);
}

export function redact(value, patterns) {
  let text = String(value);
  for (const pattern of patterns) text = text.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[redacted-account]');
  return text;
}

/** UTF-8 and match boundaries may both straddle file chunks. */
export function streamMatcher(patterns) {
  const decoder = new StringDecoder('utf8'), keep = Math.max(0, ...patterns.map((p) => p.length)) - 1;
  let tail = '', found = false;
  const inspect = (text) => { const combined = tail + text.toLowerCase(); found ||= patterns.some((p) => combined.includes(p)); tail = keep > 0 ? combined.slice(-keep) : ''; };
  return { push: (bytes) => inspect(decoder.write(bytes)), end: () => { inspect(decoder.end()); return found; } };
}

/** Consume a subprocess without retaining or echoing stdout/stderr. */
export async function privateCommand(command, args, { input, onStdout = () => {}, timeoutMs = 120_000, cwd } = {}) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32',
    cwd, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_PAGER: 'cat' } });
  let timedOut = false, failed = false, stderrBytes = 0, killTimer;
  const kill = (signal) => {
    try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* already closed */ }
  };
  const timer = setTimeout(() => { timedOut = true; kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 1000); killTimer.unref(); }, timeoutMs);
  timer.unref();
  const closed = new Promise((done) => { child.once('error', () => { failed = true; }); child.once('close', (code, signal) => done({ code, signal })); });
  child.stdin.on('error', () => {});
  child.stdin.end(input);
  const outputs = Promise.all([
    (async () => { try { for await (const chunk of child.stdout) await onStdout(chunk); } catch { failed = true; kill('SIGTERM'); } })(),
    (async () => { try { for await (const chunk of child.stderr) stderrBytes += chunk.length; } catch { failed = true; } })(),
  ]);
  try { const result = await closed; await outputs; return { ...result, timedOut, failed, stderrBytes }; }
  finally { clearTimeout(timer); clearTimeout(killTimer); }
}

function delimited(delimiter, visit, maxBytes = 64 * 1024) {
  let pending = Buffer.alloc(0);
  return {
    async push(chunk) {
      let start = 0;
      for (let i = 0; i < chunk.length; i++) if (chunk[i] === delimiter) {
        if (pending.length + i - start > maxBytes) throw new Error('record limit exceeded');
        await visit(Buffer.concat([pending, chunk.subarray(start, i)]).toString('utf8'));
        pending = Buffer.alloc(0); start = i + 1;
      }
      if (pending.length + chunk.length - start > maxBytes) throw new Error('record limit exceeded');
      pending = Buffer.concat([pending, chunk.subarray(start)]);
    },
    async end() { if (pending.length) await visit(pending.toString('utf8')); pending = Buffer.alloc(0); },
  };
}

export async function scanGit(repo, identifiers, { run = privateCommand, timeoutMs = 120_000, maxFindings = LIMIT } = {}) {
  if (!identifiers.length) throw new Error('no identifiers available');
  const patterns = identifierPatterns(identifiers), input = patterns.join('\n') + '\n';
  const findings = [], errors = [], deadline = Date.now() + timeoutMs;
  let trackedMatches = 0, historicalMatches = 0, commitsScanned = 0;
  const collect = (scope) => (file) => {
    if (!file) return;
    if (scope === 'tracked') trackedMatches++; else historicalMatches++;
    if (findings.length < maxFindings) findings.push({ scope, path: redact(file, patterns) });
  };
  const grep = async (revisions, scope) => {
    const records = delimited(0, collect(scope));
    const result = await run('git', ['--no-pager', '-C', resolve(repo), 'grep', '-a', '-l', '-z', '-F', '-i', '-f', '-', ...revisions, '--'],
      { input, onStdout: (chunk) => records.push(chunk), timeoutMs: Math.max(1, deadline - Date.now()) });
    await records.end();
    if (result.failed || result.timedOut || ![0, 1].includes(result.code)) errors.push(`${scope}: git scan failed or timed out`);
  };
  await grep([], 'tracked');
  let revisions = [];
  const history = delimited(10, async (oid) => {
    if (!/^[a-f0-9]{40,64}$/.test(oid)) throw new Error('invalid revision');
    revisions.push(oid); commitsScanned++;
    if (revisions.length === 64) { await grep(revisions, 'history'); revisions = []; }
    if (Date.now() > deadline) throw new Error('history scan deadline exceeded');
  });
  const listed = await run('git', ['--no-pager', '-C', resolve(repo), 'rev-list', '--all'],
    { onStdout: (chunk) => history.push(chunk), timeoutMs });
  try { await history.end(); if (revisions.length) await grep(revisions, 'history'); }
  catch { errors.push('history: revision scan failed'); }
  if (listed.failed || listed.timedOut || listed.code !== 0 || commitsScanned === 0) errors.push('history: revision inventory unavailable');
  return { status: errors.length || trackedMatches || historicalMatches ? 'FAIL' : 'PASS',
    trackedMatches, historicalMatches, commitsScanned, findings, findingsTruncated: trackedMatches + historicalMatches > findings.length, errors,
    basis: 'git grep -a -l -z -F -i -f - over the working tracked tree and every reachable commit; patterns use stdin. Historical matches count commit/path instances, including binary blobs.' };
}

export async function scanFiles(scopes, identifiers, { timeoutMs = 120_000, maxFindings = LIMIT } = {}) {
  if (!identifiers.length) throw new Error('no identifiers available');
  const patterns = identifierPatterns(identifiers), deadline = Date.now() + timeoutMs;
  const findings = [], errors = [], counts = {};
  let filesScanned = 0, bytesScanned = 0, matchedFiles = 0, osmMarkerFiles = 0;
  const error = (scope, file, reason) => { if (errors.length < LIMIT) errors.push({ scope, path: redact(file, patterns), reason }); };
  const file = async (scope, target) => {
    const matcher = streamMatcher(patterns), osm = streamMatcher(['openstreetmap']);
    const stream = createReadStream(target, { highWaterMark: 64 * 1024 });
    const timer = setTimeout(() => stream.destroy(new Error('scan deadline exceeded')), Math.max(1, deadline - Date.now())); timer.unref();
    try {
      for await (const chunk of stream) { bytesScanned += chunk.length; matcher.push(chunk); osm.push(chunk); }
      filesScanned++; counts[scope].files++;
      if (matcher.end()) { matchedFiles++; counts[scope].matches++; if (findings.length < maxFindings) findings.push({ scope, path: redact(target, patterns) }); }
      if (scope === 'dist' && osm.end()) osmMarkerFiles++;
    } catch { error(scope, target, 'file could not be completely scanned'); }
    finally { clearTimeout(timer); stream.destroy(); }
  };
  const visit = async (scope, root, target) => {
    if (Date.now() > deadline) { error(scope, target, 'scan deadline exceeded'); return; }
    try {
      const stat = await lstat(target);
      if (stat.isSymbolicLink()) {
        // Scan a tracked link's contents through git; never follow private filesystem links.
        const link = await readlink(target);
        if (patterns.some((p) => link.toLowerCase().includes(p))) {
          matchedFiles++; counts[scope].matches++; if (findings.length < maxFindings) findings.push({ scope, path: redact(target, patterns) });
        }
        error(scope, target, 'symlink not followed'); return;
      }
      if (!within(root, target)) { error(scope, target, 'path escapes scope'); return; }
      if (stat.isDirectory()) for (const name of (await readdir(target)).sort()) await visit(scope, root, resolve(target, name));
      else if (stat.isFile()) await file(scope, target);
      else error(scope, target, 'not a regular file');
    } catch { error(scope, target, 'scope could not be read'); }
  };
  for (const { scope, path } of scopes) {
    counts[scope] ??= { files: 0, matches: 0 };
    await visit(scope, resolve(path), resolve(path));
  }
  return { status: errors.length || matchedFiles ? 'FAIL' : 'PASS', filesScanned, bytesScanned, matchedFiles,
    findings, findingsTruncated: matchedFiles > findings.length, errors, counts, osmMarkerFiles };
}
