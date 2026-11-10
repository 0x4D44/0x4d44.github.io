import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import { startRelay } from '../relay.mjs';
import { createCensus } from '../census.mjs';
import { runFeed } from '../feed.mjs';
import { encodeFrame, FrameParser } from '../stomp.mjs';

// Invented areas, berths and descriptions only. Nothing here connects to a real feed.
const scratch = new URL('../../../.scratch/census-relay/fixtures/', import.meta.url);
const cc = (area, descr = '9Z01', to = '0101') => ({ CC_MSG: { area_id: area, descr, to, time: '946684800000' } });
const ca = (area, descr, from, to, time) => ({ CA_MSG: { area_id: area, descr, from, to, time: String(time) } });
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };

function broker() {
  const sockets = [];
  return {
    sockets,
    connectSocket() {
      const socket = new EventEmitter(), parser = new FrameParser();
      socket.write = chunk => {
        for (const frame of parser.push(Buffer.from(chunk))) {
          if (frame.command === 'CONNECT') queueMicrotask(() => socket.emit('data', encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' })));
        }
        return true;
      };
      let closed = false;
      socket.destroy = socket.end = () => { if (!closed) { closed = true; socket.emit('close'); } };
      sockets.push(socket);
      return socket;
    },
    push(events) { sockets.at(-1).emit('data', encodeFrame('MESSAGE', { destination: '/topic/TD', subscription: 'sub-0' }, JSON.stringify(events))); },
  };
}

async function fixture(t, extra = {}) {
  await mkdir(scratch, { recursive: true });
  const dataDir = await mkdtemp(path.join(scratch.pathname, 'case-'));
  let time = Date.UTC(2000, 0, 1, 12), handler;
  t.mock.method(globalThis, 'setInterval', (callback, ms) => ({ callback, ms, unref() {} }));
  t.mock.method(globalThis, 'clearInterval', () => {});
  const server = new EventEmitter();
  server.address = () => ({ port: 43211, address: '127.0.0.1' });
  server.listen = (_port, _host, done) => done();
  server.close = done => done(); server.closeAllConnections = () => {};
  const upstream = broker();
  const relay = await startRelay({ area: 'Y9', topic: '/topic/TD', dataDir,
    readCredentials: async () => ({ account: 'synthetic', secret: 'synthetic' }),
    connectSocket: () => upstream.connectSocket(), heartbeat: [0, 0], backoff: { minMs: 1, maxMs: 1 },
    now: () => time, ...extra,
    createServer(callback) { handler = callback; return server; },
  });
  t.after(() => relay.close());
  await settle();
  async function request(url, { host = '127.0.0.1:43211', method = 'GET' } = {}) {
    const req = new EventEmitter(); req.method = method; req.url = url; req.headers = { host };
    const response = new Writable({ write(chunk, _encoding, done) { this.body += chunk.toString(); done(); } });
    response.body = '';
    response.writeHead = (code) => { response.status = code; };
    await handler(req, response);
    response.json = () => JSON.parse(response.body);
    return response;
  }
  return { relay, upstream, dataDir, request, advance(ms) { time += ms; } };
}

test('census: off by default, /census is a 404 and other areas are still dropped', async t => {
  const f = await fixture(t);
  f.upstream.push([cc('Y9'), cc('Q7')]);
  await settle();
  const census = await f.request('/census');
  assert.equal(census.status, 404);
  assert.deepEqual(census.json(), { error: 'not found' });
  assert.deepEqual((await f.request('/snapshot')).json().berths, { '0101': '9Z01' });
});

test('census: enabled, tallies every area and keeps pairs only outside the allowlist', async t => {
  const f = await fixture(t, { census: true });
  const base = Date.UTC(2000, 0, 1, 12);
  f.upstream.push([cc('Y9', '9Z01', '0101'), ca('Q7', '9Z02', '0201', '0202', base), ca('Q7', '9Z02', '0202', '0203', base + 60_000),
    { CT_MSG: { area_id: 'Q7', report_time: String(base) } }, ca('Q7', '9Z02', '0201', '0202', base + 5_000)]);
  await settle();
  const doc = (await f.request('/census')).json();
  assert.equal(doc.enabled, true);
  assert.deepEqual(Object.keys(doc.areas), ['Q7', 'Y9']);
  assert.equal(doc.areas.Y9.configured, true);
  assert.equal(doc.areas.Y9.pairs, undefined, 'configured areas keep counts only');
  assert.equal(doc.areas.Q7.messages, 4);
  assert.deepEqual(doc.areas.Q7.kinds, { step: 3, cancel: 0, interpose: 0, heartbeat: 1, sclass: 0, unknown: 0 });
  assert.deepEqual(doc.areas.Q7.pairs, [
    { descr: '9Z02', berth: '0202', n: 2, first: base, last: base + 5_000 },
    { descr: '9Z02', berth: '0203', n: 1, first: base + 60_000, last: base + 60_000 },
  ]);
  // The configured area is unaffected and the census wrote nothing to disk.
  assert.deepEqual((await f.request('/snapshot')).json().berths, { '0101': '9Z01' });
  assert.equal((await f.request('/snapshot?area=Q7')).status, 400);
  const recordings = await readdir(path.join(f.dataDir, 'recordings'));
  assert.ok(recordings.every(name => name.startsWith('td-Y9-')), recordings.join(','));
});

test('census: the configured areas see the same state with the census on or off', async t => {
  const input = [cc('Y9', '9Z01', '0101'), cc('Q7', '9Z03', '0101'), ca('Y9', '9Z01', '0101', '0102', 946684800001)];
  const results = [];
  for (const census of [false, true]) {
    const f = await fixture(t, { census });
    f.upstream.push(input);
    await settle();
    const { berths, counts } = (await f.request('/snapshot')).json();
    results.push({ berths, counts, recent: (await f.request('/recent')).json().map(row => row.e) });
  }
  assert.deepEqual(results[1], results[0]);
});

test('census: /census keeps the loopback Host and GET-only guards', async t => {
  const f = await fixture(t, { census: true });
  assert.equal((await f.request('/census', { host: 'evil.example:43211' })).status, 403);
  assert.equal((await f.request('/census', { host: '127.0.0.1:9' })).status, 403);
  assert.equal((await f.request('/census', { method: 'POST' })).status, 405);
  assert.equal((await f.request('/census?area=ZZ')).status, 200, 'the area selector is not consulted');
});

test('census: memory is bounded by area, per-area pair, total pair and window caps', () => {
  let time = 1000;
  const census = createCensus({ configured: ['Y9'], now: () => time, windowMs: 100, maxAreas: 3, maxPairsPerArea: 2, maxPairs: 3 });
  const step = (area, descr, to) => ({ kind: 'step', area, descr, from: '0001', to, time: null });
  census.record([step('A1', '9Z01', '0001'), step('A1', '9Z01', '0002'), step('A1', '9Z01', '0003'), step('A1', '9Z02', '0001')]);
  census.record([step('B1', '9Z01', '0001'), step('B1', '9Z01', '0002'), step('Y9', '9Z01', '0001'), step('C1', '9Z01', '0001')]);
  let doc = census.snapshot();
  assert.deepEqual(Object.keys(doc.areas), ['A1', 'B1', 'Y9']);
  assert.equal(doc.droppedAreas, 1);
  assert.equal(doc.areas.A1.pairs.length, 2);
  assert.equal(doc.areas.A1.droppedPairs, 2);
  assert.equal(doc.areas.B1.pairs.length, 1, 'the total cap stops B1 at its first pair');
  assert.equal(doc.pairs, 3);
  assert.equal(doc.droppedPairs, 3);
  assert.equal(doc.areas.A1.messages, 4, 'messages are still counted when pairs are dropped');
  time += 100;
  census.record([step('A1', '9Z09', '0009'), step('D1', '9Z09', '0009')]);
  doc = census.snapshot();
  assert.equal(doc.closed, true);
  assert.equal(doc.late, 2);
  assert.equal(doc.areas.A1.messages, 4);
  assert.equal(doc.closesAt, 1100);
});

test('census: a failing observer never blocks delivery to the configured areas', async () => {
  const upstream = broker(), delivered = [], logs = [];
  const feed = runFeed({ connectSocket: () => upstream.connectSocket(), readCredentials: async () => ({ account: 'a', secret: 'b' }),
    topic: '/topic/TD', areas: ['Y9'], heartbeat: [0, 0], log: (line) => logs.push(line),
    onAnyEvents: () => { throw new Error('boom'); }, onEvents: (events) => delivered.push(...events) });
  await settle();
  upstream.push([cc('Y9'), cc('Q7')]);
  feed.stop();
  assert.deepEqual(delivered.map(e => e.area), ['Y9']);
  assert.deepEqual(logs.filter(line => line.includes('census')), ['feed: census observer failed']);
});
