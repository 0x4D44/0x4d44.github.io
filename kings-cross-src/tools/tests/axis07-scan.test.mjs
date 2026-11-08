import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keychainIdentifiers, identifierPatterns, redact, streamMatcher, scanGit, scanFiles, privateCommand } from '../axis07-scan.mjs';

const scratch = fileURLToPath(new URL('../../../.scratch/', import.meta.url));
const fake = 'Synthetic+Scanner@Example.invalid';
async function temporary(t) {
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(resolve(scratch, 'axis07-scan-'));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}

test('axis07 scan: keychain reads account attributes without ever requesting a password', async () => {
  const calls = [];
  const result = await keychainIdentifiers({ platform: 'darwin', exec: (cmd, args, options, done) => {
    calls.push({ cmd, args, options }); done(null, `attributes:\n    "acct"<blob>="${fake}"\n`);
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.identifiers, [fake]);
  assert.deepEqual(calls.map((c) => c.args), [['find-generic-password', '-s', 'kx-ntrod'], ['find-generic-password', '-s', 'kx-ptac']]);
  assert.ok(calls.every((c) => c.cmd === '/usr/bin/security' && c.options.timeout === 10000));
  assert.equal(JSON.stringify(result.items).includes(fake), false);
});

test('axis07 scan: missing required accounts and inaccessible optional accounts fail without echoing errors', async () => {
  const load = (required, optional) => keychainIdentifiers({ platform: 'darwin', exec: (_cmd, args, _options, done) => {
    const code = args.at(-1) === 'kx-ntrod' ? required : optional;
    if (code) done(Object.assign(new Error(fake), { code }), fake);
    else done(null, `"acct"<blob>="${fake}"`);
  } });
  const missing = await load(44, 44);
  assert.equal(missing.ok, false); assert.deepEqual(missing.identifiers, []);
  assert.equal(JSON.stringify(missing).includes(fake), false);
  assert.equal((await load(0, 44)).ok, true);
  const denied = await load(0, 1);
  assert.equal(denied.ok, false); assert.equal(denied.items[1].state, 'unavailable');
  assert.equal((await keychainIdentifiers({ platform: 'linux' })).ok, false);
});

test('axis07 scan: streamed matches survive UTF-8 and encoded chunk boundaries and paths are redacted', () => {
  const value = 'Hidden+Scän@Example.invalid', patterns = identifierPatterns([value]);
  for (const form of [value.toUpperCase(), encodeURIComponent(value), value]) {
    const bytes = Buffer.from(`before ${form} after`);
    for (let split = 1; split < bytes.length; split++) {
      const matcher = streamMatcher(patterns); matcher.push(bytes.subarray(0, split)); matcher.push(bytes.subarray(split));
      assert.equal(matcher.end(), true, `split ${split}`);
    }
  }
  assert.equal(redact(`/logs/${value}.log`, patterns), '/logs/[redacted-account].log');
  const unicode = 'Synthetic+İd@Example.invalid';
  assert.equal(redact(`/logs/${unicode}.log`, identifierPatterns([unicode])), '/logs/[redacted-account].log');
  const clear = streamMatcher(patterns); clear.push(Buffer.from('ordinary binary\0data')); assert.equal(clear.end(), false);
});

test('axis07 scan: every historical revision is scanned with identifiers on stdin and never in argv', async () => {
  const revisions = Array.from({ length: 65 }, (_, i) => i.toString(16).padStart(40, '0'));
  const historyBatches = [];
  const result = await scanGit('/invented/repo', [fake], { run: async (cmd, args, options) => {
    assert.equal(cmd, 'git'); assert.equal(args.some((a) => a.toLowerCase().includes(fake.toLowerCase())), false);
    if (args.includes('rev-list')) {
      const bytes = Buffer.from(revisions.join('\n') + '\n'); await options.onStdout(bytes.subarray(0, 83)); await options.onStdout(bytes.subarray(83));
    } else {
      assert.ok(options.input.includes(fake.toLowerCase()));
      assert.ok(args.includes('-a') && args.includes('-f') && args.includes('-'));
      const refs = args.filter((a) => /^[a-f0-9]{40}$/.test(a));
      if (refs.length) historyBatches.push(refs);
      await options.onStdout(Buffer.from(refs.length ? `${refs[0]}:old/source.ts\0` : `source/${fake}.ts\0`));
    }
    return { code: 0 };
  } });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.commitsScanned, 65); assert.deepEqual(historyBatches.map((b) => b.length), [64, 1]);
  assert.equal(result.trackedMatches, 1); assert.equal(result.historicalMatches, 2);
  assert.equal(JSON.stringify(result).toLowerCase().includes(fake.toLowerCase()), false);
  assert.match(result.findings[0].path, /redacted-account/);
});

test('axis07 scan: Git failures and empty identifier sets can never claim a clean history', async () => {
  const result = await scanGit('/invented/repo', [fake], { run: async () => ({ code: 2, stderr: fake }) });
  assert.equal(result.status, 'FAIL'); assert.equal(result.commitsScanned, 0);
  assert.equal(JSON.stringify(result).includes(fake), false);
  await assert.rejects(scanGit('/invented/repo', []), /no identifiers/);
  await assert.rejects(scanFiles([], []), /no identifiers/);
});

test('axis07 scan: binary builds recordings and logs are scanned without following filesystem symlinks', async (t) => {
  const dir = await temporary(t), dist = resolve(dir, 'dist'), recordings = resolve(dir, 'recordings'), logs = resolve(dir, 'logs');
  for (const d of [dist, recordings, logs]) await mkdir(d);
  await writeFile(resolve(dist, 'binary.bin'), Buffer.concat([Buffer.alloc(65530), Buffer.from(fake), Buffer.from('\0OpenStreetMap')]));
  await writeFile(resolve(recordings, 'synthetic.ndjson'), '{"synthetic":true}\n');
  await writeFile(resolve(logs, `${fake}.log`), encodeURIComponent(fake));
  const outside = resolve(dir, 'outside.txt'); await writeFile(outside, fake);
  await symlink(outside, resolve(recordings, 'link'));
  const result = await scanFiles([{ scope: 'dist', path: dist }, { scope: 'recordings', path: recordings }, { scope: 'relay-logs', path: logs }], [fake]);
  assert.equal(result.status, 'FAIL'); assert.equal(result.matchedFiles, 2); assert.equal(result.filesScanned, 3);
  assert.equal(result.osmMarkerFiles, 1); assert.equal(result.counts.recordings.matches, 0);
  assert.equal(result.errors[0].reason, 'symlink not followed');
  assert.equal(JSON.stringify(result).toLowerCase().includes(fake.toLowerCase()), false);
  const missing = await scanFiles([{ scope: 'missing', path: resolve(dir, 'absent') }], [fake]);
  assert.equal(missing.status, 'FAIL');
});

test('axis07 scan: child commands time out without copying stderr into their result', async () => {
  const result = await privateCommand(process.execPath, ['-e', `process.stderr.write(${JSON.stringify(fake)});setInterval(()=>{},1000)`], { timeoutMs: 100 });
  assert.equal(result.timedOut, true); assert.equal(JSON.stringify(result).includes(fake), false);
  assert.equal(typeof result.stderrBytes, 'number');
});
