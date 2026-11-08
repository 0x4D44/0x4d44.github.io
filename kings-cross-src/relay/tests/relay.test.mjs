import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { localFile, requestFailure, startRelay, startEventHeartbeat } from '../relay.mjs';
import { FrameParser, encodeFrame } from '../stomp.mjs';

const SENTINEL = 'SENTINEL-PASSWORD-9f3a';
const ACCOUNT = 'who@example.test';
const testScratch = process.env.KX_TEST_SCRATCH_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.scratch/replay-round5');
const newTmp = async (prefix) => {
  await mkdir(testScratch, { recursive: true });
  return mkdtemp(path.join(testScratch, prefix));
};

// A fake Network Rail STOMP broker on loopback.
async function fakeBroker(t) {
  const connects = [];
  const subscribes = [];
  const sockets = new Set();
  let socket = null;
  let closing;
  const server = net.createServer((sock) => {
    socket = sock;
    sockets.add(sock);
    sock.once('close', () => sockets.delete(sock));
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
  const broker = {
    get port() { return server.address().port; },
    connects,
    subscribes,
    push: (bodyText) => socket.write(encodeFrame('MESSAGE', { destination: '/topic/TD_ALL_SIG_AREA', subscription: 'sub-0' }, bodyText)),
    drop: () => socket.destroy(),
    close() {
      if (closing) return closing;
      for (const client of sockets) client.destroy();
      closing = new Promise((resolve) => {
        if (!server.listening) return resolve();
        server.close(resolve);
      });
      return closing;
    },
  };
  t.after(() => broker.close());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return broker;
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

function captureHttp(t, port = 43210, { closeRequests = true } = {}) {
  let handler;
  let listenHost;
  const requests = new Set();
  const server = new EventEmitter();
  server.closeCalls = 0;
  server.listen = (_port, host, callback) => { listenHost = host; callback(); };
  server.address = () => ({ port, address: '127.0.0.1' });
  server.closeAllConnections = () => {
    if (!closeRequests) return;
    for (const req of requests) req.emit('close');
    requests.clear();
  };
  server.close = (callback) => { server.closeCalls += 1; callback(); };
  t.mock.method(http, 'createServer', (callback) => {
    handler = (req, res) => { requests.add(req); return callback(req, res); };
    return server;
  });
  return { server, get handler() { return handler; }, get listenHost() { return listenHost; } };
}

function captureIntervals(t) {
  const timers = [];
  const cleared = [];
  t.mock.method(globalThis, 'setInterval', (callback, milliseconds) => {
    const timer = {
      callback,
      milliseconds,
      unrefs: 0,
      unref() { this.unrefs += 1; },
    };
    timers.push(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearInterval', (timer) => cleared.push(timer));
  return { timers, cleared };
}

async function fakeRequest(handler, { url = '/health', method = 'GET', host = '127.0.0.1:43210' } = {}) {
  const req = new EventEmitter();
  req.headers = { host };
  req.method = method;
  req.url = url;
  let status;
  let headers;
  let body = '';
  const writes = [];
  const res = {
    writeHead: (code, value) => { status = code; headers = value; },
    write: (text) => { writes.push(text); body += text; },
    end: (text = '') => { body += text; },
  };
  await handler(req, res);
  return { req, status, headers, body, writes };
}

class FakeSocket extends EventEmitter {
  constructor(broker) {
    super();
    this.broker = broker;
    this.parser = new FrameParser();
    this.closed = false;
  }

  write(chunk) {
    for (const frame of this.parser.push(Buffer.from(chunk))) {
      if (frame.command === 'CONNECT') {
        this.broker.connects.push(frame.headers);
        queueMicrotask(() => {
          if (!this.closed) this.emit('data', encodeFrame('CONNECTED', { version: '1.2', server: 'synthetic', 'heart-beat': '0,0' }));
        });
      } else if (frame.command === 'SUBSCRIBE') this.broker.subscribes.push(frame.headers);
    }
    return true;
  }

  push(bodyText) {
    if (!this.closed) this.emit('data', encodeFrame('MESSAGE', { destination: '/topic/TD_ALL_SIG_AREA', subscription: 'sub-0' }, bodyText));
  }

  end() { this.close(); }
  destroy() { this.close(); }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
}

function syntheticBroker() {
  const broker = {
    connects: [],
    subscribes: [],
    sockets: [],
    connectSocket() {
      const socket = new FakeSocket(broker);
      broker.sockets.push(socket);
      return socket;
    },
    push(bodyText) { broker.sockets.at(-1)?.push(bodyText); },
    drop() { broker.sockets.at(-1)?.destroy(); },
  };
  return broker;
}

async function setup(t, extra = {}) {
  let broker;
  let dataDir;
  let relay;
  let cleanupPromise;
  const logs = [];
  const cleanup = () => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      let failure;
      try { await relay?.close(); } catch (error) { failure = error; }
      try { await broker?.close(); } catch (error) { failure ??= error; }
      try { if (dataDir) await rm(dataDir, { recursive: true, force: true }); } catch (error) { failure ??= error; }
      if (failure) throw failure;
    })();
    return cleanupPromise;
  };
  t.after(cleanup);
  broker = await fakeBroker(t);
  dataDir = await newTmp('kx-relay-');
  relay = await startRelay({
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
  return { broker, relay, dataDir, logs, cleanup };
}

test('relay: connects with the keychain login, keeps only its area, and serves the picture', async (t) => {
  const { broker, relay } = await setup(t);
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
});

test('relay: events are recorded to disk as NDJSON', async (t) => {
  const { broker, relay, dataDir } = await setup(t);
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected');
  broker.push(JSON.stringify([step('Y9', '1A23', '2034', '1001')]));
  await until(async () => (await getJson(relay.port, '/recent')).length === 1, 'event');
  await relay.close();
  const dir = path.join(dataDir, 'recordings');
  const [file] = await readdir(dir);
  const text = await readFile(path.join(dir, file), 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  assert.equal(lines.length, 3, 'recording has one newline-delimited JSON object per event');
  const rows = lines.map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { assert.fail(`recording line ${index + 1} is not independent JSON: ${error.message}`); }
  });
  assert.equal(rows.length, 3, 'startup, connect and one TD event are recorded as separate rows');
  assert.deepEqual(rows.map((row) => row.e.kind), ['snapshot', 'snapshot', 'step']);
  assert.equal(rows[0].e.area, 'Y9');
  assert.equal(rows[1].e.area, 'Y9');
  assert.equal(rows[2].e.to, '1001');
});

test('relay: /events streams a snapshot, then each new event', async (t) => {
  const { broker, relay } = await setup(t);
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected');
  const ac = new AbortController();
  let reader;
  t.after(() => ac.abort());
  try {
    const res = await fetch(`http://127.0.0.1:${relay.port}/events`, { signal: ac.signal });
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    reader = res.body.getReader();
    let text = '';
    const readUntil = async (needle) => {
      while (!text.includes(needle)) text += new TextDecoder().decode((await reader.read()).value);
    };
    await readUntil('event: snapshot');
    broker.push(JSON.stringify([step('Y9', '1B11', '2036', '1002')]));
    await readUntil('event: td');
    assert.match(text, /"descr":"1B11"/);
  } finally {
    ac.abort();
    await reader?.cancel().catch(() => {});
  }
});

test('relay: the login never appears in any response, log line or recording', async (t) => {
  const { broker, relay, dataDir, logs } = await setup(t);
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
});

test('relay: a non-loopback Host header is refused, as is any method but GET', async (t) => {
  const { relay } = await setup(t, { feedEnabled: false });
  assert.equal((await get(relay.port, '/health', { host: 'evil.example' })).status, 403);
  assert.equal((await get(relay.port, '/health', { host: `localhost:${relay.port}` })).status, 200);
  assert.equal((await get(relay.port, '/health', { host: `127.0.0.1:${relay.port}` })).status, 200);
  // a host that merely starts or ends like a loopback one, or has the wrong port, is not loopback
  for (const host of [`127.0.0.1.evil.example:${relay.port}`, `localhost.evil.example:${relay.port}`, `127.0.0.1:${relay.port}.evil.example`, `localhost:${relay.port}0`, `evil.example:${relay.port}`, '127.0.0.1:1', 'localhost']) {
    assert.equal((await get(relay.port, '/health', { host })).status, 403, `Host ${host} must be refused`);
  }
  assert.equal((await get(relay.port, '/health', { method: 'POST' })).status, 405);
  for (const endpoint of ['/anchors', '/sclass', '/recording?date=20010101']) {
    assert.equal((await get(relay.port, endpoint, { host: 'evil.example' })).status, 403);
    assert.equal((await get(relay.port, endpoint, { method: 'POST' })).status, 405);
    assert.equal((await get(relay.port, endpoint)).headers['access-control-allow-origin'], undefined);
  }
  assert.equal((await get(relay.port, '/nope')).status, 404);
  const ok = await get(relay.port, '/health');
  assert.equal(ok.headers['access-control-allow-origin'], undefined, 'no CORS headers');
  assert.equal((await getJson(relay.port, '/health')).feed, 'disabled');
});

test('relay files: anchors use only the configured file and missing files return JSON 404', async (t) => {
  const dataDir = await newTmp('kx-local-files-');
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

test('relay files: sclass honors KX_SCLASS, ignores client paths, and uses relay guards', async (t) => {
  const dataDir = await newTmp('kx-sclass-');
  const previous = process.env.KX_SCLASS;
  let relay;
  t.after(async () => {
    try { await relay?.close(); }
    finally {
      await rm(dataDir, { recursive: true, force: true });
      if (previous === undefined) delete process.env.KX_SCLASS;
      else process.env.KX_SCLASS = previous;
    }
  });
  const defaultFile = path.join(dataDir, 'sclass.json');
  const overrideFile = path.join(dataDir, 'override.json');
  await writeFile(defaultFile, JSON.stringify({ source: 'dataDir' }));
  await writeFile(overrideFile, JSON.stringify({ source: 'KX_SCLASS' }));
  const url = (p) => new URL(p, 'http://127.0.0.1:43210');

  delete process.env.KX_SCLASS;
  const fallback = await localFile(url('/sclass?path=../../outside.json'), { dataDir, area: 'Y9' });
  assert.equal(fallback.status, 200);
  assert.deepEqual(JSON.parse(fallback.body), { source: 'dataDir' });
  assert.match(fallback.type, /^application\/json/);

  process.env.KX_SCLASS = overrideFile;
  const fake = captureHttp(t);
  relay = await startRelay({ area: 'Y9', topic: 'synthetic', dataDir, feedEnabled: false });
  assert.equal(fake.listenHost, '127.0.0.1');
  const overridden = await fakeRequest(fake.handler, { url: '/sclass?path=../../outside.json' });
  assert.equal(overridden.status, 200);
  assert.deepEqual(JSON.parse(overridden.body), { source: 'KX_SCLASS' });
  assert.match(overridden.headers['content-type'], /^application\/json/);
  assert.equal(overridden.headers['cache-control'], 'no-store');
  assert.equal(overridden.headers['access-control-allow-origin'], undefined);
  assert.equal((await fakeRequest(fake.handler, { url: '/sclass', host: 'evil.example:43210' })).status, 403);
  assert.equal((await fakeRequest(fake.handler, { url: '/sclass', method: 'POST' })).status, 405);

  process.env.KX_SCLASS = path.join(dataDir, 'missing.json');
  const missing = await fakeRequest(fake.handler, { url: '/sclass' });
  assert.equal(missing.status, 404);
  assert.deepEqual(JSON.parse(missing.body), { error: 'not found' });
});

test('relay files: recordings use the configured area and reject every client path or malformed date', async (t) => {
  const dataDir = await newTmp('kx-local-files-');
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

test('relay snapshot: connect and reconnect snapshots agree in SSE and recording', async (t) => {
  const dataDir = await newTmp('kx-replay-snapshot-');
  let relay;
  t.after(async () => {
    try { await relay?.close(); }
    finally { await rm(dataDir, { recursive: true, force: true }); }
  });
  const fake = captureHttp(t, 43211);
  const broker = syntheticBroker();
  const at = Date.UTC(2026, 10, 8, 12);
  relay = await startRelay({
    area: 'Y9', topic: '/topic/TD_ALL_SIG_AREA', dataDir, now: () => at,
    readCredentials: async () => ({ account: ACCOUNT, secret: SENTINEL }),
    connectSocket: () => broker.connectSocket(), heartbeat: [0, 0],
    backoff: { minMs: 1, maxMs: 1 },
  });
  assert.equal(fake.listenHost, '127.0.0.1');
  await until(async () => {
    const health = await fakeRequest(fake.handler, { url: '/health', host: '127.0.0.1:43211' });
    assert.equal(health.headers['access-control-allow-origin'], undefined);
    return broker.connects.length === 1 && JSON.parse(health.body).feed === 'connected';
  }, 'synthetic STOMP connect');
  const stream = await fakeRequest(fake.handler, { url: '/events', host: '127.0.0.1:43211' });
  assert.equal(stream.status, 200);
  assert.equal(stream.headers['content-type'], 'text/event-stream');
  const initialFrame = stream.writes[0] ?? '';
  const initialMatch = /^event: snapshot\ndata: (.+)\n\n$/.exec(initialFrame);
  assert.ok(initialMatch, 'the stream starts with a snapshot frame');
  const initial = JSON.parse(initialMatch[1]);
  assert.deepEqual(initial.berths, {});

  broker.push(JSON.stringify([
    { CA_MSG: { area_id: 'Y9', msg_type: 'CA', descr: '1A23', from: '2034', to: '1001', time: '1700000000000' } },
    { SF_MSG: { area_id: 'Y9', address: '0A', data: '4B' } },
    { CA_MSG: { area_id: 'Y8', msg_type: 'CA', descr: 'OTHER', from: '1', to: '2', time: '1700000000001' } },
  ]));
  await until(async () => {
    const response = await fakeRequest(fake.handler, { url: '/snapshot', host: '127.0.0.1:43211' });
    const snapshot = JSON.parse(response.body);
    return snapshot.berths['1001'] === '1A23' && snapshot.sclass.addresses === 1;
  }, 'synthetic event applied');

  broker.drop();
  await until(async () => {
    const health = await fakeRequest(fake.handler, { url: '/health', host: '127.0.0.1:43211' });
    return broker.connects.length === 2 && JSON.parse(health.body).feed === 'connected';
  }, 'synthetic reconnect');
  const sseText = stream.writes.join('');
  const sseSnapshots = [...sseText.matchAll(/^event: snapshot\ndata: (.+)$/gm)].map((match) => JSON.parse(match[1]));
  const recovered = sseSnapshots.find((snapshot) => snapshot.berths['1001'] === '1A23');
  assert.ok(recovered, 'reconnect publishes a snapshot that restores the live picture');
  assert.deepEqual(recovered.sclass, { addresses: 1, data: { '0A': '4B' } });
  assert.match(sseText, /event: td\ndata: .*"descr":"1A23"/);
  assert.ok(!sseText.includes('OTHER'), 'events from another area never enter the live stream');

  stream.req.emit('close');
  await relay.close();
  relay = null;
  const [file] = await readdir(path.join(dataDir, 'recordings'));
  const rows = (await readFile(path.join(dataDir, 'recordings', file), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.filter((row) => row.e.kind !== 'snapshot').map((row) => row.e.kind), ['step', 'sclass']);
  const lastRecorded = rows.filter((row) => row.e.kind === 'snapshot').at(-1).e;
  const { kind: _kind, ...recordedSnapshot } = lastRecorded;
  assert.deepEqual(recordedSnapshot, recovered, 'the reconnect SSE checkpoint matches the recorded checkpoint');
});

test('relay: reconnects after the broker drops the connection', async (t) => {
  const { broker, relay, logs } = await setup(t);
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected');
  broker.drop();
  await until(() => broker.connects.length === 2, 'second CONNECT');
  await until(async () => (await getJson(relay.port, '/health')).feed === 'connected', 'connected again');
  assert.ok(logs.some((l) => /reconnecting/.test(l)));
});

test('relay: static endpoints serve filtered SMART and CORPUS rows from the cache', async (t) => {
  const dataDir = await newTmp('kx-relay-');
  let relay;
  t.after(async () => {
    try { await relay?.close(); }
    finally { await rm(dataDir, { recursive: true, force: true }); }
  });
  await writeFile(path.join(dataDir, 'smart.json.gz'), gzipSync(JSON.stringify({ BERTHDATA: [{ TD: 'Y9', STANME: 'KINGS X' }, { TD: 'Y8' }] })));
  await writeFile(path.join(dataDir, 'corpus.json.gz'), gzipSync(JSON.stringify({ TIPLOCDATA: [{ STANOX: '54311', NLCDESC: 'KINGS CROSS' }, { STANOX: '1' }] })));
  relay = await startRelay({
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
});

test('relay: a keychain failure is retried with backoff and logged without secrets', async (t) => {
  const broker = await fakeBroker(t);
  const dataDir = await newTmp('kx-relay-');
  let relay;
  t.after(async () => {
    try { await relay?.close(); }
    finally { await rm(dataDir, { recursive: true, force: true }); }
  });
  const logs = [];
  let calls = 0;
  relay = await startRelay({
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
});

test('relay offline: keychain retries keep their diagnostic category without private exception text', async (t) => {
  const dataDir = await newTmp('kx-keychain-offline-');
  const fake = captureHttp(t);
  const broker = syntheticBroker(), logs = [];
  let calls = 0, relay;
  t.after(async () => {
    try { await relay?.close(); }
    finally { await rm(dataDir, { recursive: true, force: true }); }
  });
  relay = await startRelay({
    area: 'Y9', topic: 't', dataDir, heartbeat: [0, 0],
    backoff: { minMs: 10, maxMs: 20 },
    readCredentials: async () => {
      if (++calls < 3) throw new Error('keychain: lookup failed (exit 44) SYNTHETIC-PRIVATE /Users/synthetic/private');
      return { account: ACCOUNT, secret: SENTINEL };
    },
    connectSocket: () => broker.connectSocket(), log: line => logs.push(line),
  });
  await until(() => broker.subscribes.length === 1, 'connected after two keychain failures');
  const health = JSON.parse((await fakeRequest(fake.handler)).body);
  assert.equal(health.feed, 'connected');
  assert.equal(calls, 3);
  assert.equal(logs.filter(line => /keychain: lookup failed/.test(line)).length, 2);
  assert.equal(logs.filter(line => /reconnecting/.test(line)).length, 2);
  assert.doesNotMatch(logs.join('\n'), /SYNTHETIC-PRIVATE|Users|exit 44|SENTINEL-PASSWORD|who@example/);
});

test('relay heartbeat: a connected SSE client gets snapshot then current health without waiting for an interval', async (t) => {
  const fake = captureHttp(t), intervals = captureIntervals(t), broker = syntheticBroker();
  const dataDir = await newTmp('kx-immediate-health-');
  const at = Date.UTC(2026, 10, 8, 12);
  let relay;
  t.after(async () => { try { await relay?.close(); } finally { await rm(dataDir, { recursive: true, force: true }); } });
  relay = await startRelay({ area: 'Y9', topic: 'synthetic', dataDir, now: () => at,
    readCredentials: async () => ({ account: ACCOUNT, secret: SENTINEL }),
    connectSocket: () => broker.connectSocket(), heartbeat: [0, 0] });
  await until(() => broker.subscribes.length === 1, 'synthetic feed connected');
  const stream = await fakeRequest(fake.handler, { url: '/events' });
  assert.equal(stream.writes.length, 2, 'no periodic callback has run');
  assert.match(stream.writes[0], /^event: snapshot\n/);
  assert.equal(stream.writes[1], `event: ping\ndata: ${JSON.stringify({ t: at, feed: 'connected', lastEventAt: null })}\n\n`);
  const periodic = intervals.timers.find(timer => timer.milliseconds === 5000);
  assert.ok(periodic);
  periodic.callback(); assert.equal(stream.writes.length, 3, 'periodic heartbeats still follow the initial health');
  stream.req.emit('close'); periodic.callback(); assert.equal(stream.writes.length, 3);
});


function heartbeatFixture() {
  const req = new EventEmitter();
  const writes = []; const timers = []; const cleared = [];
  let time = 123;
  const stop = startEventHeartbeat(req, { write: (text) => writes.push(text) }, {
    now: () => time,
    schedule: (callback, milliseconds) => {
      const timer = { callback, milliseconds, unrefs: 0, unref() { this.unrefs += 1; } };
      timers.push(timer);
      return timer;
    },
    unschedule: (timer) => cleared.push(timer),
  });
  return { req, writes, timers, cleared, stop, setTime: (value) => { time = value; } };
}

test('relay heartbeat: schedules a ping every five seconds without waiting in real time', () => {
  const f = heartbeatFixture();
  assert.equal(f.timers.length, 1); assert.equal(f.timers[0].milliseconds, 5000);
  assert.equal(f.timers[0].unrefs, 1, 'heartbeat timer does not keep the process alive');
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
    const timer = { callback, milliseconds, unrefs: 0, unref() { this.unrefs += 1; } };
    timers.push(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearInterval', (timer) => cleared.push(timer));
  const dataDir = await newTmp('kx-heartbeat-wiring-');
  let relay;
  t.after(async () => {
    try { await relay?.close(); }
    finally { await rm(dataDir, { recursive: true, force: true }); }
  });
  relay = await startRelay({ area: 'Y9', dataDir, feedEnabled: false, now: () => 321,
    readCredentials: () => assert.fail('disabled feed must not read credentials') });
  const req = new EventEmitter();
  req.headers = { host: '127.0.0.1:43210' }; req.method = 'GET'; req.url = '/events';
  const writes = []; const heads = [];
  const res = { writeHead: (...args) => heads.push(args), write: (text) => writes.push(text) };
  await handler(req, res);
  assert.equal(heads[0][0], 200); assert.equal(heads[0][1]['content-type'], 'text/event-stream');
  assert.match(writes[0], /^event: snapshot\ndata: /);
  assert.equal(writes[1], 'event: ping\ndata: {"t":321,"feed":"disabled","lastEventAt":null}\n\n');
  assert.deepEqual(timers.map((timer) => timer.milliseconds).sort((a, b) => a - b), [5000, 600000]);
  const pingTimer = timers.find((timer) => timer.milliseconds === 5000);
  const recorderTimer = timers.find((timer) => timer.milliseconds === 600000);
  assert.ok(pingTimer); assert.ok(recorderTimer);
  assert.equal(pingTimer.unrefs, 1);
  assert.equal(recorderTimer.unrefs, 1);
  pingTimer.callback();
  assert.equal(writes[2], 'event: ping\ndata: {"t":321,"feed":"disabled","lastEventAt":null}\n\n');
  req.emit('close');
  assert.deepEqual(cleared, [pingTimer]);
  pingTimer.callback(); assert.equal(writes.length, 3);
});

test('relay shutdown: concurrent close stops SSE and clears ping and recorder timers once', async (t) => {
  const dataDir = await newTmp('kx-shutdown-');
  let relay;
  let stream;
  t.after(async () => {
    try { await relay?.close(); } catch {}
    stream?.req.emit('close');
    await rm(dataDir, { recursive: true, force: true });
  });
  const fake = captureHttp(t, 43212, { closeRequests: false });
  const { timers, cleared } = captureIntervals(t);
  relay = await startRelay({ area: 'Y9', dataDir, feedEnabled: false, now: () => Date.UTC(2026, 10, 8, 12) });
  stream = await fakeRequest(fake.handler, { url: '/events', host: '127.0.0.1:43212' });
  assert.equal(stream.status, 200);
  const pingTimer = timers.find((timer) => timer.milliseconds === 5000);
  const recorderTimer = timers.find((timer) => timer.milliseconds === 600000);
  assert.ok(pingTimer); assert.ok(recorderTimer);
  assert.equal(pingTimer.unrefs, 1);
  assert.equal(recorderTimer.unrefs, 1);

  const firstClose = relay.close();
  const secondClose = relay.close();
  assert.equal(fake.server.closeCalls, 1, 'server closes once for concurrent callers');
  assert.strictEqual(firstClose, secondClose, 'concurrent callers share the close promise');
  await firstClose;
  assert.equal(cleared.length, 2);
  assert.equal(cleared.filter((timer) => timer === pingTimer).length, 1);
  assert.equal(cleared.filter((timer) => timer === recorderTimer).length, 1);
  const writes = stream.writes.length;
  pingTimer.callback();
  assert.equal(stream.writes.length, writes, 'stopped SSE heartbeat cannot write');
  stream.req.emit('close');
  assert.equal(cleared.length, 2, 'later request close does not clear either timer twice');
});

test('relay shutdown: recorder flushes and timers clear when server close reports an error', async (t) => {
  const dataDir = await newTmp('kx-shutdown-error-');
  let relay;
  let stream;
  t.after(async () => {
    try { await relay?.close(); } catch {}
    stream?.req.emit('close');
    await rm(dataDir, { recursive: true, force: true });
  });
  const fake = captureHttp(t, 43213, { closeRequests: false });
  const { timers, cleared } = captureIntervals(t);
  relay = await startRelay({ area: 'Y9', dataDir, feedEnabled: false, now: () => Date.UTC(2026, 10, 8, 12) });
  stream = await fakeRequest(fake.handler, { url: '/events', host: '127.0.0.1:43213' });
  const pingTimer = timers.find((timer) => timer.milliseconds === 5000);
  const recorderTimer = timers.find((timer) => timer.milliseconds === 600000);
  assert.ok(pingTimer); assert.ok(recorderTimer);
  fake.server.close = (callback) => {
    fake.server.closeCalls += 1;
    callback(new Error('synthetic server close failure'));
  };
  await assert.rejects(relay.close(), /synthetic server close failure/);
  assert.equal(cleared.length, 2);
  assert.equal(cleared.filter((timer) => timer === pingTimer).length, 1);
  assert.equal(cleared.filter((timer) => timer === recorderTimer).length, 1);

  const file = path.join(dataDir, 'recordings', 'td-Y9-20261108.ndjson');
  const rows = (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.deepEqual(rows.map((row) => row.e.kind), ['snapshot'], 'recorder is flushed despite server close failure');
});
