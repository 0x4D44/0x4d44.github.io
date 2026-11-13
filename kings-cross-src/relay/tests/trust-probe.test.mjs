import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import { createTrustProbe, parseProbeStanox } from '../trust-probe.mjs';
import { startRelay } from '../relay.mjs';
import { encodeFrame, FrameParser } from '../stomp.mjs';

// Synthetic TRUST only: fake STANOX 99999 / 99998, invented train ids.
const scratch = new URL('../../../.scratch/trust-probe/fixtures/', import.meta.url);
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setImmediate(r)); };
const T0 = Date.UTC(2000, 0, 1, 12, 0, 0);
const mv = (over = {}) => ({ header: { msg_type: '0003' }, body: {
  loc_stanox: '99999', event_type: 'ARRIVAL', train_id: '12345678901'.replace(/^(..)(.{4})/, '$1' + '2Z99'),
  planned_timestamp: String(T0), actual_timestamp: String(T0 + 3 * 60_000), platform: ' 2', event_source: 'AUTOMATIC', ...over } });

test('parseProbeStanox keeps unique five-digit codes only', () => {
  assert.deepEqual(parseProbeStanox('03140, 03137,03140,abc,123'), ['03140', '03137']);
  assert.deepEqual(parseProbeStanox(undefined), []);
});

test('probe tallies per STANOX, ignores others and non-movements', () => {
  let t = T0 + 3 * 60_000 + 12_500;
  const p = createTrustProbe({ stanox: ['99999', '99998'], now: () => t });
  p.observe(JSON.stringify([mv(), mv({ loc_stanox: '11111' }), { header: { msg_type: '0001' }, body: { loc_stanox: '99999' } },
    mv({ event_type: 'DEPARTURE', platform: '', event_source: 'MANUAL', actual_timestamp: String(T0 - 60_000) })]));
  p.observe([mv({ loc_stanox: '99998' })]);
  p.observe('not json');
  const s = p.snapshot();
  assert.equal(s.total, 3); assert.equal(s.ignored, 1);
  const a = s.stations['99999'];
  assert.deepEqual(a.byEventType, { ARRIVAL: 1, DEPARTURE: 1 });
  assert.deepEqual(a.bySource, { AUTOMATIC: 1, MANUAL: 1 });
  assert.deepEqual(a.platform, { given: 1, missing: 1, byPlatform: { 2: 1 } });
  assert.deepEqual(a.lateness, { n: 2, min: -1, max: 3, mean: 1 });
  assert.equal(a.recent[0].delaySec, 12.5);
  assert.equal(a.recent[0].latenessMin, 3);
  assert.equal(a.recent[0].headcode, '2Z99');
  assert.deepEqual(a.perHour, { '2000-01-01T12': 2 });
  assert.equal(s.stations['99998'].total, 1);
});

test('probe keeps a bounded recent ring and bounded hours', () => {
  let t = T0;
  const p = createTrustProbe({ stanox: ['99999'], now: () => t, maxRecent: 2, maxHours: 2 });
  for (let i = 0; i < 4; i++) { p.observe([mv()]); t += 3_600_000; }
  const a = p.snapshot().stations['99999'];
  assert.equal(a.total, 4); assert.equal(a.recent.length, 2); assert.equal(Object.keys(a.perHour).length, 2);
});

test('probe writes a private summary file, and nothing when idle', async () => {
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(path.join(scratch.pathname, 'file-'));
  const file = path.join(dir, 'trust-probe.json');
  const p = createTrustProbe({ stanox: ['99999'], now: () => T0, file });
  await p.close();
  await assert.rejects(readFile(file));
  p.observe([mv()]);
  await p.close();
  assert.equal(JSON.parse(await readFile(file, 'utf8')).stations['99999'].total, 1);
});

function broker() {
  const sockets = [];
  return { sockets, connectSocket() {
    const socket = new EventEmitter(), parser = new FrameParser();
    socket.write = chunk => { for (const f of parser.push(Buffer.from(chunk))) if (f.command === 'CONNECT') queueMicrotask(() => socket.emit('data', encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' }))); return true; };
    socket.destroy = socket.end = () => socket.emit('close');
    sockets.push(socket); return socket; },
    trust(body) { sockets.at(-1).emit('data', encodeFrame('MESSAGE', { destination: '/topic/TRUST', subscription: 'trust' }, JSON.stringify(body))); } };
}

async function fixture(t, extra = {}) {
  await mkdir(scratch, { recursive: true });
  const dataDir = await mkdtemp(path.join(scratch.pathname, 'relay-'));
  let handler;
  t.mock.method(globalThis, 'setInterval', (callback, ms) => ({ callback, ms, unref() {} }));
  t.mock.method(globalThis, 'clearInterval', () => {});
  const server = new EventEmitter();
  server.address = () => ({ port: 43212, address: '127.0.0.1' });
  server.listen = (_p, _h, done) => done();
  server.close = done => done(); server.closeAllConnections = () => {};
  const upstream = broker();
  const relay = await startRelay({ area: 'Y9', topic: '/topic/TD', trustTopic: '/topic/TRUST', dataDir,
    readCredentials: async () => ({ account: 'synthetic', secret: 'synthetic' }),
    connectSocket: () => upstream.connectSocket(), heartbeat: [0, 0], backoff: { minMs: 1, maxMs: 1 },
    now: () => T0 + 3 * 60_000 + 5_000, ...extra, createServer(cb) { handler = cb; return server; } });
  t.after(() => relay.close());
  await settle();
  async function request(url) {
    const req = new EventEmitter(); req.method = 'GET'; req.url = url; req.headers = { host: '127.0.0.1:43212' };
    const res = new Writable({ write(c, _e, d) { this.body += c.toString(); d(); } });
    res.body = ''; res.writeHead = code => { res.status = code; };
    await handler(req, res); res.json = () => JSON.parse(res.body); return res;
  }
  return { upstream, request, dataDir };
}

test('relay: probe off by default, /trust-probe is 404', async t => {
  const f = await fixture(t);
  f.upstream.trust([mv()]); await settle();
  assert.equal((await f.request('/trust-probe')).status, 404);
});

test('relay: probe on serves /trust-probe and writes the summary under dataDir', async t => {
  const f = await fixture(t, { trustProbe: ['99999'] });
  f.upstream.trust([mv()]); await settle();
  const r = await f.request('/trust-probe');
  assert.equal(r.status, 200);
  assert.equal(r.json().stations['99999'].recent[0].delaySec, 5);
  assert.equal((await f.request('/health')).status, 200);
});
