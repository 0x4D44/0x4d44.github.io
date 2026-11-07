import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { parseAccount, readCredentials } from '../keychain.mjs';
import { createRecorder } from '../recorder.mjs';
import { TdState } from '../state.mjs';
import { createStaticStore } from '../static.mjs';
import { inArea, parseTdBody } from '../td.mjs';

const tmp = () => mkdtemp(path.join(os.tmpdir(), 'kx-test-'));

// ---- td ------------------------------------------------------------------------------

const body = (items) => JSON.stringify(items);

test('td: a CA message becomes a step event with numeric time', () => {
  const [e] = parseTdBody(body([{ CA_MSG: { area_id: 'Y9', msg_type: 'CA', from: '2034', to: '1001', descr: '1A23', time: '1700000000000' } }]));
  assert.deepEqual(e, { kind: 'step', area: 'Y9', descr: '1A23', from: '2034', to: '1001', time: 1700000000000 });
});

test('td: CB, CC, CT and S-class messages normalise', () => {
  const events = parseTdBody(
    body([
      { CB_MSG: { area_id: 'Y9', from: '1001', descr: '1A23' } },
      { CC_MSG: { area_id: 'Y9', to: '1002', descr: '2B45' } },
      { CT_MSG: { area_id: 'Y9', report_time: '1700000000001' } },
      { SF_MSG: { area_id: 'Y9', address: '0A', data: '4B' } },
      { SG_MSG: { area_id: 'Y9', address: '0B', data: '00' } },
    ]),
  );
  assert.deepEqual(events.map((e) => e.kind), ['cancel', 'interpose', 'heartbeat', 'sclass', 'sclass']);
  assert.equal(events[3].address, '0A');
  assert.equal(events[3].data, '4B');
});

test('td: unknown message types are kept as unknown, junk entries are skipped', () => {
  const events = parseTdBody(body([{ ZZ_MSG: { area_id: 'Y9' } }, 'junk', null, { notamsg: {} }]));
  assert.deepEqual(events, [{ kind: 'unknown', area: 'Y9', msgType: 'ZZ' }]);
});

test('td: invalid JSON and non-array bodies throw', () => {
  assert.throws(() => parseTdBody('{nope'));
  assert.throws(() => parseTdBody('{"CA_MSG":{}}'), /not an array/);
});

test('td: inArea keeps only the wanted area', () => {
  const events = parseTdBody(body([{ CA_MSG: { area_id: 'Y9' } }, { CA_MSG: { area_id: 'Y8' } }]));
  assert.equal(inArea(events, 'Y9').length, 1);
});

// ---- state ---------------------------------------------------------------------------

test('state: interpose, step and cancel move descriptions between berths', () => {
  const s = new TdState('Y9');
  s.apply({ kind: 'interpose', area: 'Y9', to: '2034', descr: '1A23' });
  assert.deepEqual(s.snapshot().berths, { 2034: '1A23' });
  s.apply({ kind: 'step', area: 'Y9', descr: '1A23', from: '2034', to: '1001', time: 5 });
  assert.deepEqual(s.snapshot().berths, { 1001: '1A23' });
  assert.equal(s.snapshot().lastEventTime, 5);
  s.apply({ kind: 'cancel', area: 'Y9', from: '1001', descr: '1A23' });
  assert.deepEqual(s.snapshot().berths, {});
});

test('state: other areas are ignored and counts track kinds', () => {
  const s = new TdState('Y9');
  assert.equal(s.apply({ kind: 'step', area: 'Y8', descr: 'x', from: 'a', to: 'b' }), false);
  s.apply({ kind: 'heartbeat', area: 'Y9' });
  s.apply({ kind: 'sclass', area: 'Y9', address: '0A', data: '4B' });
  const snap = s.snapshot();
  assert.equal(snap.counts.heartbeat, 1);
  assert.equal(snap.counts.sclass, 1);
  assert.deepEqual(snap.sclass, { addresses: 1, data: { '0A': '4B' } });
  assert.deepEqual(snap.berths, {});
});

// ---- keychain ------------------------------------------------------------------------

const fakeExec = (secret, account = 'who@example.test') => (file, args, _opts, cb) => {
  assert.equal(file, '/usr/bin/security');
  if (args.includes('-w')) cb(null, `${secret}\n`);
  else cb(null, `keychain: "/x"\n    "acct"<blob>="${account}"\n    "svce"<blob>="kx-ntrod"\n`);
};

test('keychain: finds the account from attributes, then the password with -w', async () => {
  const calls = [];
  const exec = (file, args, opts, cb) => {
    calls.push(args);
    fakeExec('pw-123')(file, args, opts, cb);
  };
  const creds = await readCredentials({ exec, platform: 'darwin' });
  assert.deepEqual(creds, { account: 'who@example.test', secret: 'pw-123' });
  assert.ok(!calls[0].includes('-w'), 'the first lookup must not request the password');
  assert.deepEqual(calls[1], ['find-generic-password', '-s', 'kx-ntrod', '-a', 'who@example.test', '-w']);
});

test('keychain: a failed lookup error never contains the secret', async () => {
  const exec = (_f, args, _o, cb) => (args.includes('-w') ? cb(Object.assign(new Error('SENTINEL-PW boom'), { code: 44 })) : fakeExec('x')(_f, args, _o, cb));
  await assert.rejects(readCredentials({ exec, platform: 'darwin' }), (err) => {
    assert.ok(!/SENTINEL-PW/.test(err.message));
    assert.match(err.message, /exit 44/);
    return true;
  });
});

test('keychain: refuses off macOS, and rejects an empty password or missing account', async () => {
  await assert.rejects(readCredentials({ platform: 'linux' }), /only macOS/);
  await assert.rejects(readCredentials({ exec: fakeExec('', 'a@b'), platform: 'darwin' }), /empty password/);
  const noAcct = (_f, _a, _o, cb) => cb(null, 'nothing here');
  await assert.rejects(readCredentials({ exec: noAcct, platform: 'darwin' }), /no account name/);
  assert.equal(parseAccount('"acct"<blob>="x@y"'), 'x@y');
});

// ---- static store --------------------------------------------------------------------

const smartDoc = { BERTHDATA: [{ TD: 'Y9', STANME: 'KINGS X' }, { TD: 'Y8', STANME: 'STEVENAGE' }] };
const corpusDoc = { TIPLOCDATA: [{ STANOX: '54311', NLCDESC: 'KINGS CROSS' }, { STANOX: ' ', NLCDESC: 'X' }] };

test('static: a fresh cached file is used with no network and no keychain call', async () => {
  const dir = await tmp();
  await writeFile(path.join(dir, 'smart.json.gz'), gzipSync(JSON.stringify(smartDoc)));
  const store = createStaticStore({
    dataDir: dir,
    readCredentials: () => assert.fail('must not read credentials'),
    fetchImpl: () => assert.fail('must not fetch'),
  });
  assert.deepEqual(await store.smartRows({ td: 'Y9' }), [smartDoc.BERTHDATA[0]]);
  await rm(dir, { recursive: true });
});

test('static: a missing file is fetched with basic auth, cached as gzip, and filtered', async () => {
  const dir = await tmp();
  let seen;
  const store = createStaticStore({
    dataDir: dir,
    readCredentials: async () => ({ account: 'who@example.test', secret: 'pw:1' }),
    fetchImpl: async (url, init) => {
      seen = { url, auth: init.headers.authorization };
      return new Response(gzipSync(JSON.stringify(corpusDoc)), { status: 200 });
    },
  });
  assert.deepEqual(await store.corpusRows({ stanox: '54311' }), [corpusDoc.TIPLOCDATA[0]]);
  assert.match(seen.url, /type=CORPUS$/);
  assert.equal(seen.auth, `Basic ${Buffer.from('who@example.test:pw:1').toString('base64')}`);
  assert.ok((await readdir(dir)).includes('corpus.json.gz'));
  await rm(dir, { recursive: true });
});

test('static: a stale file is refetched; an HTTP error is reported without credentials', async () => {
  const dir = await tmp();
  const file = path.join(dir, 'smart.json.gz');
  await writeFile(file, gzipSync(JSON.stringify({ BERTHDATA: [] })));
  const old = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  await utimes(file, old, old);
  let fetched = 0;
  const store = createStaticStore({
    dataDir: dir,
    readCredentials: async () => ({ account: 'a', secret: 'SENTINEL-PW' }),
    fetchImpl: async () => {
      fetched += 1;
      return new Response('nope', { status: 401 });
    },
  });
  await assert.rejects(store.smartRows({ td: 'Y9' }), (err) => {
    assert.match(err.message, /HTTP 401/);
    assert.ok(!err.message.includes('SENTINEL-PW'));
    return true;
  });
  assert.equal(fetched, 1);
  await rm(dir, { recursive: true });
});

test('static: an already-decoded JSON response is accepted and cached as gzip', async () => {
  const dir = await tmp();
  const store = createStaticStore({
    dataDir: dir,
    readCredentials: async () => ({ account: 'a', secret: 'b' }),
    fetchImpl: async () => new Response(JSON.stringify(smartDoc), { status: 200 }),
  });
  assert.equal((await store.smartRows({ td: 'Y9' })).length, 1);
  const cached = await readFile(path.join(dir, 'smart.json.gz'));
  assert.equal(cached[0], 0x1f);
  await rm(dir, { recursive: true });
});

test('static: an unknown file name is refused', async () => {
  const store = createStaticStore({ dataDir: '/nonexistent', readCredentials: async () => ({}) });
  await assert.rejects(store.get('passwd'), /unknown file/);
});

// ---- recorder ------------------------------------------------------------------------

test('recorder: writes NDJSON lines, one file per UTC day', async () => {
  const dir = await tmp();
  let t = Date.UTC(2026, 10, 7, 23, 59, 59);
  const rec = await createRecorder({ dir, area: 'Y9', now: () => t });
  rec.append({ kind: 'heartbeat', area: 'Y9' });
  t = Date.UTC(2026, 10, 8, 0, 0, 1);
  rec.append({ kind: 'heartbeat', area: 'Y9' });
  await rec.close();
  assert.deepEqual((await readdir(dir)).sort(), ['td-Y9-20261107.ndjson', 'td-Y9-20261108.ndjson']);
  const line = JSON.parse((await readFile(path.join(dir, 'td-Y9-20261108.ndjson'), 'utf8')).trim());
  assert.deepEqual(line, { t, e: { kind: 'heartbeat', area: 'Y9' } });
  await rm(dir, { recursive: true });
});
