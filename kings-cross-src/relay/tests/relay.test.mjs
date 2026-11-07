import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { startRelay } from '../relay.mjs';
import { FrameParser, encodeFrame } from '../stomp.mjs';

const SENTINEL = 'SENTINEL-PASSWORD-9f3a';
const ACCOUNT = 'who@example.test';

// A fake Network Rail STOMP broker on loopback.
async function fakeBroker() {
  const connects = [];
  const subscribes = [];
  let socket = null;
  const server = net.createServer((sock) => {
    socket = sock;
    const p = new FrameParser();
    sock.on('data', (d) => {
      for (const f of p.push(d)) {
        if (f.command === 'CONNECT') {
          connects.push(f.headers);
          sock.write(encodeFrame('CONNECTED', { version: '1.2', server: 'FakeMQ/1', 'heart-beat': '0,0' }));
        }
        if (f.command === 'SUBSCRIBE') subscribes.push(f.headers);
      }
    });
    sock.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    connects,
    subscribes,
    push: (bodyText) => socket.write(encodeFrame('MESSAGE', { destination: '/topic/TD_ALL_SIG_AREA', subscription: 'sub-0' }, bodyText)),
    drop: () => socket.destroy(),
    close: () => new Promise((resolve) => { socket?.destroy(); server.close(resolve); }),
  };
}

function get(port, urlPath, { method = 'GET', host } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers: host ? { host } : {} }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

const getJson = async (port, p) => JSON.parse((await get(port, p)).text);

async function until(fn, label, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const step = (area, descr, from, to) => ({ CA_MSG: { area_id: area, msg_type: 'CA', descr, from, to, time: String(Date.now()) } });

async function setup(extra = {}) {
  const broker = await fakeBroker();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'kx-relay-'));
  const logs = [];
  const relay = await startRelay({
    area: 'Y9',
    topic: '/topic/TD_ALL_SIG_AREA',
    dataDir,
    readCredentials: async () => ({ account: ACCOUNT, secret: SENTINEL }),
    connectSocket: () => net.connect(broker.port, '127.0.0.1'),
    heartbeat: [0, 0],
    backoff: { minMs: 20, maxMs: 40 },
    log: (l) => logs.push(l),
    ...extra,
  });
  const cleanup = async () => {
    await relay.close();
    await broker.close();
    await rm(dataDir, { recursive: true, force: true });
  };
  return { broker, relay, dataDir, logs, cleanup };
}

test('relay: connects with the keychain login, keeps only its area, and serves the picture', async () => {
  const { broker, relay, cleanup } = await setup();
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected');
  assert.equal(relay.host, '127.0.0.1');
  assert.equal(broker.connects[0].login, ACCOUNT);
  assert.equal(broker.connects[0].passcode, SENTINEL);
  assert.equal(broker.subscribes[0].destination, '/topic/TD_ALL_SIG_AREA');

  broker.push(JSON.stringify([step('Y9', '1A23', '2034', '1001'), step('Y8', '9Z99', '1', '2')]));
  const snap = await until(async () => {
    const s = await getJson(relay.port, '/snapshot');
    return s.berths['1001'] ? s : null;
  }, 'berth 1001');
  assert.deepEqual(snap.berths, { 1001: '1A23' });
  const recent = await getJson(relay.port, '/recent?n=5');
  assert.equal(recent.length, 1);
  assert.equal(recent[0].e.descr, '1A23');
  await cleanup();
});

test('relay: events are recorded to disk as NDJSON', async () => {
  const { broker, relay, dataDir, cleanup } = await setup();
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected');
  broker.push(JSON.stringify([step('Y9', '1A23', '2034', '1001')]));
  await until(async () => (await getJson(relay.port, '/recent')).length === 1, 'event');
  await relay.close();
  const dir = path.join(dataDir, 'recordings');
  const [file] = await readdir(dir);
  const line = JSON.parse((await readFile(path.join(dir, file), 'utf8')).trim());
  assert.equal(line.e.to, '1001');
  await broker.close();
  await rm(dataDir, { recursive: true, force: true });
});

test('relay: /events streams a snapshot, then each new event', async () => {
  const { broker, relay, cleanup } = await setup();
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected');
  const ac = new AbortController();
  const res = await fetch(`http://127.0.0.1:${relay.port}/events`, { signal: ac.signal });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  let text = '';
  const readUntil = async (needle) => {
    while (!text.includes(needle)) text += new TextDecoder().decode((await reader.read()).value);
  };
  await readUntil('event: snapshot');
  broker.push(JSON.stringify([step('Y9', '1B11', '2036', '1002')]));
  await readUntil('event: td');
  assert.match(text, /"descr":"1B11"/);
  ac.abort();
  await cleanup();
});

test('relay: the login never appears in any response, log line or recording', async () => {
  const { broker, relay, dataDir, logs } = await setup();
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected');
  broker.push(JSON.stringify([step('Y9', '1A23', '2034', '1001')]));
  broker.push('{bad json');
  await until(async () => (await getJson(relay.port, '/health')).badMessages === 1, 'bad message counted');
  const bodies = [];
  for (const p of ['/health', '/snapshot', '/recent', '/nope', '/static/smart', '/static/corpus']) bodies.push((await get(relay.port, p)).text);
  await relay.close();
  const recDir = path.join(dataDir, 'recordings');
  for (const f of await readdir(recDir)) bodies.push(await readFile(path.join(recDir, f), 'utf8'));
  const everything = bodies.join('\n') + logs.join('\n');
  assert.ok(!everything.includes(SENTINEL), 'password leaked');
  assert.ok(!everything.includes(ACCOUNT), 'account leaked');
  assert.ok(logs.some((l) => /dropped a bad message/.test(l)), 'bad message should be logged');
  await broker.close();
  await rm(dataDir, { recursive: true, force: true });
});

test('relay: a non-loopback Host header is refused, as is any method but GET', async () => {
  const { relay, cleanup } = await setup({ feedEnabled: false });
  assert.equal((await get(relay.port, '/health', { host: 'evil.example' })).status, 403);
  assert.equal((await get(relay.port, '/health', { host: `localhost:${relay.port}` })).status, 200);
  assert.equal((await get(relay.port, '/health', { method: 'POST' })).status, 405);
  assert.equal((await get(relay.port, '/nope')).status, 404);
  const ok = await get(relay.port, '/health');
  assert.equal(ok.headers['access-control-allow-origin'], undefined, 'no CORS headers');
  assert.equal((await getJson(relay.port, '/health')).feed, 'disabled');
  await cleanup();
});

test('relay: reconnects after the broker drops the connection', async () => {
  const { broker, relay, logs, cleanup } = await setup();
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected');
  broker.drop();
  await until(() => broker.connects.length === 2, 'second CONNECT');
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected again');
  assert.ok(logs.some((l) => /reconnecting/.test(l)));
  await cleanup();
});

test('relay: static endpoints serve filtered SMART and CORPUS rows from the cache', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'kx-relay-'));
  await writeFile(path.join(dataDir, 'smart.json.gz'), gzipSync(JSON.stringify({ BERTHDATA: [{ TD: 'Y9', STANME: 'KINGS X' }, { TD: 'Y8' }] })));
  await writeFile(path.join(dataDir, 'corpus.json.gz'), gzipSync(JSON.stringify({ TIPLOCDATA: [{ STANOX: '54311', NLCDESC: 'KINGS CROSS' }, { STANOX: '1' }] })));
  const relay = await startRelay({
    area: 'Y9',
    topic: 't',
    dataDir,
    feedEnabled: false,
    readCredentials: async () => assert.fail('cache hit must not read credentials'),
    connectSocket: () => assert.fail('no feed'),
  });
  assert.deepEqual(await getJson(relay.port, '/static/smart?td=Y9'), [{ TD: 'Y9', STANME: 'KINGS X' }]);
  assert.deepEqual(await getJson(relay.port, '/static/corpus?stanox=54311'), [{ STANOX: '54311', NLCDESC: 'KINGS CROSS' }]);
  assert.equal((await get(relay.port, '/static/smart')).status, 400);
  await relay.close();
  await rm(dataDir, { recursive: true, force: true });
});

test('relay: a keychain failure is retried with backoff and logged without secrets', async () => {
  const broker = await fakeBroker();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'kx-relay-'));
  const logs = [];
  let calls = 0;
  const relay = await startRelay({
    area: 'Y9',
    topic: 't',
    dataDir,
    readCredentials: async () => {
      calls += 1;
      if (calls < 3) throw new Error('keychain: lookup failed (exit 44)');
      return { account: ACCOUNT, secret: SENTINEL };
    },
    connectSocket: () => net.connect(broker.port, '127.0.0.1'),
    heartbeat: [0, 0],
    backoff: { minMs: 10, maxMs: 20 },
    log: (l) => logs.push(l),
  });
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected after retries');
  assert.equal(calls, 3);
  assert.ok(logs.filter((l) => /keychain: lookup failed/.test(l)).length >= 2);
  await relay.close();
  await broker.close();
  await rm(dataDir, { recursive: true, force: true });
});
