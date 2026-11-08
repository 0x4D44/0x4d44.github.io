import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { localFile, requestFailure, startRelay, startEventHeartbeat } from '../relay.mjs';
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
  for (const p of ['/health', '/snapshot', '/recent', '/nope', '/static/smart', '/static/corpus', '/anchors', '/recording?date=20010101', '/recording?date=..%2Fsecret']) bodies.push((await get(relay.port, p)).text);
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
  assert.equal((await get(relay.port, '/health', { host: `127.0.0.1:${relay.port}` })).status, 200);
  // a host that merely starts or ends like a loopback one, or has the wrong port, is not loopback
  for (const host of [`127.0.0.1.evil.example:${relay.port}`, `localhost.evil.example:${relay.port}`, `127.0.0.1:${relay.port}.evil.example`, `localhost:${relay.port}0`, `evil.example:${relay.port}`, '127.0.0.1:1', 'localhost']) {
    assert.equal((await get(relay.port, '/health', { host })).status, 403, `Host ${host} must be refused`);
  }
  assert.equal((await get(relay.port, '/health', { method: 'POST' })).status, 405);
  for (const endpoint of ['/anchors', '/recording?date=20010101']) {
    assert.equal((await get(relay.port, endpoint, { host: 'evil.example' })).status, 403);
    assert.equal((await get(relay.port, endpoint, { method: 'POST' })).status, 405);
    assert.equal((await get(relay.port, endpoint)).headers['access-control-allow-origin'], undefined);
  }
  assert.equal((await get(relay.port, '/nope')).status, 404);
  const ok = await get(relay.port, '/health');
  assert.equal(ok.headers['access-control-allow-origin'], undefined, 'no CORS headers');
  assert.equal((await getJson(relay.port, '/health')).feed, 'disabled');
  await cleanup();
});

test('relay files: anchors use only the configured file and missing files return JSON 404', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'kx-local-files-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const opts = { dataDir, area: 'TEST', anchorsFile: path.join(dataDir, 'anchors.json') };
  const url = (p) => new URL(p, 'http://127.0.0.1:8787');
  const missing = await localFile(url('/anchors'), opts);
  assert.equal(missing.status, 404);
  assert.deepEqual(JSON.parse(missing.body), { error: 'not found' });
  await writeFile(opts.anchorsFile, JSON.stringify({ area: 'TEST', anchors: [], unmapped: [], sources: ['synthetic'] }));
  const hit = await localFile(url('/anchors?path=../../credentials'), opts);
  assert.equal(hit.status, 200);
  assert.equal(JSON.parse(hit.body).area, 'TEST');
  assert.match(hit.type, /^application\/json/);
  const alternate = path.join(dataDir, 'alternate.json');
  await writeFile(alternate, JSON.stringify({ area: 'ALTERNATE' }));
  assert.equal(JSON.parse((await localFile(url('/anchors'), { ...opts, anchorsFile: alternate })).body).area, 'ALTERNATE');
  assert.equal(await localFile(url('/other'), opts), null);
});

test('relay files: recordings use the configured area and reject every client path or malformed date', async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'kx-local-files-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  await mkdir(path.join(dataDir, 'recordings'));
  const text = JSON.stringify({ t: 1000, e: { kind: 'interpose', area: 'TEST', descr: 'SYN1', to: 'A' } }) + '\n';
  await writeFile(path.join(dataDir, 'recordings', 'td-TEST-20010101.ndjson'), text);
  const opts = { dataDir, area: 'TEST' };
  const url = (p) => new URL(p, 'http://127.0.0.1:8787');
  const hit = await localFile(url('/recording?date=20010101&path=../../secret&area=OTHER'), opts);
  assert.equal(hit.status, 200); assert.equal(hit.body, text); assert.match(hit.type, /ndjson/);
  assert.equal((await localFile(url('/recording?date=20010102'), opts)).status, 404);
  for (const date of ['', '2001010', '200101010', '2001-01-01', '../secret', '20010101/../../secret', '%2e%2e%2fsecret', '20010101\n', '1234567x']) {
    assert.equal((await localFile(url('/recording?date=' + encodeURIComponent(date)), opts)).status, 400, `rejected ${JSON.stringify(date)}`);
  }
  assert.equal((await localFile(url('/recording'), opts)).status, 400);
  assert.equal((await localFile(url('/recording?date=20010101&date=20010102'), opts)).status, 400);
  for (const response of [hit, await localFile(url('/recording?date=missing'), opts)]) {
    assert.ok(!response.body.includes(SENTINEL)); assert.ok(!response.body.includes(ACCOUNT));
  }
});

test('relay files: every endpoint shares exact loopback Host and GET guards', () => {
  for (const host of ['127.0.0.1:8787', 'localhost:8787']) assert.equal(requestFailure(host, 8787, 'GET'), null);
  for (const host of [undefined, 'evil.example:8787', '127.0.0.1:87870', '127.0.0.1.evil:8787', 'localhost', '127.0.0.1:8786']) assert.equal(requestFailure(host, 8787, 'GET'), 403);
  for (const method of ['POST', 'HEAD', 'OPTIONS', 'DELETE']) assert.equal(requestFailure('127.0.0.1:8787', 8787, method), 405);
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


function heartbeatFixture() {
  const req = new EventEmitter();
  const writes = []; const timers = []; const cleared = [];
  let time = 123;
  const stop = startEventHeartbeat(req, { write: (text) => writes.push(text) }, {
    now: () => time,
    schedule: (callback, milliseconds) => { const timer = { callback, milliseconds }; timers.push(timer); return timer; },
    unschedule: (timer) => cleared.push(timer),
  });
  return { req, writes, timers, cleared, stop, setTime: (value) => { time = value; } };
}

test('relay heartbeat: schedules a ping every five seconds without waiting in real time', () => {
  const f = heartbeatFixture();
  assert.equal(f.timers.length, 1); assert.equal(f.timers[0].milliseconds, 5000);
  assert.equal(f.writes.length, 0);
  f.stop();
});

test('relay heartbeat: emits named SSE pings with the current injected timestamp', () => {
  const f = heartbeatFixture();
  f.timers[0].callback();
  assert.equal(f.writes[0], 'event: ping\ndata: {"t":123}\n\n');
  f.setTime(789); f.timers[0].callback();
  assert.equal(f.writes[1], 'event: ping\ndata: {"t":789}\n\n');
  f.stop();
});

test('relay heartbeat: request close clears the interval once and prevents queued writes', () => {
  const f = heartbeatFixture();
  assert.equal(f.req.listenerCount('close'), 1);
  f.req.emit('close');
  assert.deepEqual(f.cleared, [f.timers[0]]);
  assert.equal(f.req.listenerCount('close'), 0);
  f.req.emit('close'); f.stop(); f.timers[0].callback();
  assert.equal(f.cleared.length, 1); assert.equal(f.writes.length, 0);
});

test('relay heartbeat: events endpoint wires the named heartbeat and request cleanup', async (t) => {
  let handler;
  const server = new EventEmitter();
  server.listen = (_port, _host, callback) => callback();
  server.address = () => ({ port: 43210, address: '127.0.0.1' });
  server.closeAllConnections = () => {};
  server.close = (callback) => callback();
  t.mock.method(http, 'createServer', (callback) => { handler = callback; return server; });
  const timers = []; const cleared = [];
  t.mock.method(globalThis, 'setInterval', (callback, milliseconds) => {
    const timer = { callback, milliseconds }; timers.push(timer); return timer;
  });
  t.mock.method(globalThis, 'clearInterval', (timer) => cleared.push(timer));
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'kx-heartbeat-wiring-'));
  let relay;
  t.after(async () => { await relay?.close(); await rm(dataDir, { recursive: true, force: true }); });
  relay = await startRelay({ area: 'Y9', dataDir, feedEnabled: false, now: () => 321,
    readCredentials: () => assert.fail('disabled feed must not read credentials') });
  const req = new EventEmitter();
  req.headers = { host: '127.0.0.1:43210' }; req.method = 'GET'; req.url = '/events';
  const writes = []; const heads = [];
  const res = { writeHead: (...args) => heads.push(args), write: (text) => writes.push(text) };
  await handler(req, res);
  assert.equal(heads[0][0], 200); assert.equal(heads[0][1]['content-type'], 'text/event-stream');
  assert.match(writes[0], /^event: snapshot\ndata: /);
  assert.equal(timers.length, 1); assert.equal(timers[0].milliseconds, 5000);
  timers[0].callback();
  assert.equal(writes[1], 'event: ping\ndata: {"t":321}\n\n');
  req.emit('close');
  assert.deepEqual(cleared, [timers[0]]);
  timers[0].callback(); assert.equal(writes.length, 2);
});
