import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import { test } from 'node:test';
import { startRelay } from '../relay.mjs';
import { encodeFrame, FrameParser } from '../stomp.mjs';

// Invented identities only. This transport never connects or reads a credential store.
const scratch = new URL('../../../.scratch/a39-relay/fixtures/', import.meta.url);
const td = (area, descr = '1A23', to = '0001') => ({ CC_MSG: { area_id: area, descr, to, time: '946684800000' } });
const step = (area) => ({ CA_MSG: { area_id: area, descr: '1A23', from: '0001', to: '0002', time: '946684800001' } });
const signal = (area, data) => ({ SF_MSG: { area_id: area, address: '01', data, time: '946684800000' } });
const frames = (response, name) => [...response.writes.join('').matchAll(new RegExp(`^event: ${name}\\ndata: (.+)$`, 'gm'))].map(m => JSON.parse(m[1]));
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };

function broker() {
  const sockets = [], subscriptions = [];
  return {
    sockets, subscriptions,
    connectSocket() {
      const socket = new EventEmitter(), parser = new FrameParser();
      socket.write = chunk => {
        for (const frame of parser.push(Buffer.from(chunk))) {
          if (frame.command === 'CONNECT') queueMicrotask(() => socket.emit('data', encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' })));
          if (frame.command === 'SUBSCRIBE') subscriptions.push(frame.headers);
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
  let time = Date.UTC(2000, 0, 1, 23, 59, 59), handler;
  const intervals = [];
  t.mock.method(globalThis, 'setInterval', (callback, ms) => {
    const timer = { callback, ms, unref() {} }; intervals.push(timer); return timer;
  });
  t.mock.method(globalThis, 'clearInterval', () => {});
  const server = new EventEmitter();
  server.address = () => ({ port: 43210, address: '127.0.0.1' });
  server.listen = (_port, host, done) => { assert.equal(host, '127.0.0.1'); done(); };
  server.close = done => done(); server.closeAllConnections = () => {};
  if (extra.failY9) await mkdir(path.join(dataDir, 'recordings', 'td-Y9-20000101.ndjson'), { recursive: true });
  const upstream = broker();
  const relay = await startRelay({ area: 'Y9', topic: '/topic/TD', dataDir,
    readCredentials: async () => ({ account: 'synthetic', secret: 'synthetic' }),
    connectSocket: () => upstream.connectSocket(), heartbeat: [0, 0], backoff: { minMs: 1, maxMs: 1 },
    now: () => time, ...extra,
    createServer(callback) { handler = callback; return server; },
  });
  t.after(() => relay.close());
  await settle();
  async function request(url = '/health') {
    const req = new EventEmitter(); req.method = 'GET'; req.url = url; req.headers = { host: '127.0.0.1:43210' };
    const response = new Writable({ write(chunk, _encoding, done) {
      const text = chunk.toString(); this.writes.push(text); this.body += text; done();
    } });
    response.writes = []; response.body = '';
    response.writeHead = (code, headers) => { response.status = code; response.headers = headers; };
    await handler(req, response);
    response.json = () => JSON.parse(response.body);
    return response;
  }
  return { relay, upstream, dataDir, intervals, request, advance(ms) { time += ms; } };
}

test('relay multi-area: default is byte-identical to explicit Y9 and excludes other areas', async t => {
  const f = await fixture(t);
  f.upstream.push([td('Y9'), td('WH')]);
  assert.equal(f.upstream.sockets.length, 1);
  assert.equal(f.upstream.subscriptions.length, 1);
  assert.equal((await f.request('/snapshot')).body, (await f.request('/snapshot?area=Y9')).body);
  assert.equal((await f.request('/health')).body, (await f.request('/health?area=Y9')).body);
  assert.equal((await f.request('/recent')).body, (await f.request('/recent?area=Y9')).body);
  assert.deepEqual((await f.request('/snapshot')).json().berths, { '0001': '1A23' });
  assert.equal((await f.request('/snapshot?area=WH')).status, 400);
  await f.relay.close();
  assert.deepEqual(await readdir(path.join(f.dataDir, 'recordings')), ['td-Y9-20000101.ndjson']);
});

test('relay multi-area: same berth headcode and S-class address stay isolated with per-area freshness', async t => {
  const f = await fixture(t, { areas: ['Y9', 'WH'] });
  const y9 = await f.request('/events'), wh = await f.request('/events?area=WH');
  f.upstream.push([td('Y9'), td('WH'), td('EB'), signal('Y9', '01'), signal('WH', '02')]);
  f.advance(100);
  f.upstream.push([step('WH')]);
  assert.equal(f.upstream.sockets.length, 1, 'all areas share the same upstream connection');
  const a = (await f.request('/snapshot')).json(), b = (await f.request('/snapshot?area=WH')).json();
  assert.deepEqual(a.berths, { '0001': '1A23' });
  assert.deepEqual(b.berths, { '0002': '1A23' });
  assert.deepEqual(a.sclass.data, { '01': '01' });
  assert.deepEqual(b.sclass.data, { '01': '02' });
  assert.equal((await f.request('/health')).json().lastEventAgeMs, 100);
  assert.equal((await f.request('/health?area=WH')).json().lastEventAgeMs, 0);
  assert.ok(frames(y9, 'td').every(row => row.e.area === 'Y9'));
  assert.ok(frames(wh, 'td').every(row => row.e.area === 'WH'));
  assert.equal(frames(y9, 'td').length, 2);
  assert.equal(frames(wh, 'td').length, 3);
  assert.equal((await f.request('/recent?area=WH')).json().length, 3);
});

test('relay multi-area: reconnect reconciles each area independently', async t => {
  const f = await fixture(t, { areas: ['Y9', 'WH'] });
  const y9 = await f.request('/events'), wh = await f.request('/events?area=WH');
  f.upstream.push([td('Y9'), td('WH', '2B34')]);
  f.upstream.sockets[0].destroy();
  await new Promise(resolve => setTimeout(resolve, 15));
  await settle();
  assert.equal(f.upstream.sockets.length, 2);
  assert.deepEqual(frames(y9, 'snapshot').at(-1).berths, { '0001': '1A23' });
  assert.deepEqual(frames(wh, 'snapshot').at(-1).berths, { '0001': '2B34' });
  assert.equal(frames(y9, 'snapshot').length, 2);
  assert.equal(frames(wh, 'snapshot').length, 2);
});

test('relay multi-area: failed recorder leaves every area live and the healthy writer recording', async t => {
  const f = await fixture(t, { areas: ['Y9', 'WH'], failY9: true });
  await settle();
  const y9 = await f.request('/events'), wh = await f.request('/events?area=WH');
  f.upstream.push([td('Y9'), td('WH', '2B34')]);
  for (const timer of f.intervals.filter(t => t.ms === 600000)) timer.callback();
  assert.equal((await f.request('/health')).json().recording.state, 'failed');
  assert.equal((await f.request('/health?area=WH')).json().recording.state, 'recording');
  assert.deepEqual(frames(y9, 'snapshot').at(-1).berths, { '0001': '1A23' });
  assert.deepEqual(frames(wh, 'snapshot').at(-1).berths, { '0001': '2B34' });
  assert.equal(frames(y9, 'td').length, 1);
  assert.equal(frames(wh, 'td').length, 1);
  await f.relay.close();
  const rows = (await readFile(path.join(f.dataDir, 'recordings', 'td-WH-20000101.ndjson'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(rows.some(row => row.e.kind === 'interpose'));
  assert.ok(rows.every(row => row.e.area === 'WH'));
});

test('relay multi-area: UTC rollover writes private files and opening snapshots for each area', async t => {
  const f = await fixture(t, { areas: ['Y9', 'WH'] });
  f.upstream.push([td('Y9'), td('WH', '2B34')]);
  f.advance(2000);
  f.upstream.push([step('Y9'), step('WH')]);
  await f.relay.close();
  const dir = path.join(f.dataDir, 'recordings');
  assert.deepEqual((await readdir(dir)).sort(), ['td-WH-20000101.ndjson', 'td-WH-20000102.ndjson', 'td-Y9-20000101.ndjson', 'td-Y9-20000102.ndjson']);
  for (const area of ['Y9', 'WH']) {
    const file = path.join(dir, `td-${area}-20000102.ndjson`);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const rows = (await readFile(file, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows[0].e.kind, 'snapshot');
    assert.deepEqual(rows[0].e.berths, { '0001': area === 'Y9' ? '1A23' : '2B34' });
    assert.ok(rows.every(row => row.e.area === area));
  }
});

test('relay multi-area: area selectors reject unknown duplicate and path input before any endpoint work', async t => {
  const f = await fixture(t, { areas: ['Y9', 'WH'] });
  for (const endpoint of ['/health', '/events', '/snapshot', '/recent', '/anchors', '/sclass', '/recording?date=20000101', '/schedule?date=2000-01-01']) {
    for (const selector of ['area=EB', 'area=../WH', 'area=Y9&area=WH', 'area=']) {
      assert.equal((await f.request(`${endpoint}${endpoint.includes('?') ? '&' : '?'}${selector}`)).status, 400, `${endpoint} rejects ${selector}`);
    }
  }
  assert.equal((await f.request('/health?station=not-configured')).status, 400);
});

test('relay multi-area: private tables are area-local and unwired schedules never return KX calls', async t => {
  const f = await fixture(t, { areas: ['Y9', 'WH'] });
  await mkdir(path.join(f.dataDir, 'areas', 'WH'), { recursive: true });
  await writeFile(path.join(f.dataDir, 'sclass.json'), '{"area":"Y9"}');
  await writeFile(path.join(f.dataDir, 'areas', 'WH', 'sclass.json'), '{"area":"WH"}');
  await writeFile(path.join(f.dataDir, 'areas', 'WH', 'anchors.json'), '{"area":"WH","anchors":[]}');
  assert.deepEqual((await f.request('/sclass?area=WH')).json(), { area: 'WH' });
  assert.deepEqual((await f.request('/sclass')).json(), { area: 'Y9' });
  assert.deepEqual((await f.request('/anchors?area=WH')).json(), { area: 'WH', anchors: [] });
  const schedule = await f.request('/schedule?area=WH&date=2000-01-01');
  assert.equal(schedule.status, 200);
  assert.deepEqual(schedule.json(), { date: '2000-01-01', available: false, reason: 'station schedule not wired' });
  assert.equal((await f.request('/health?area=WH')).json().schedule.state, 'unavailable');
  f.upstream.push([td('Y9'), td('WH', '2B34')]);
  await f.relay.close();
  for (const area of ['Y9', 'WH']) {
    const recording = await f.request(`/recording?date=20000101&area=${area}`);
    assert.equal(recording.status, 200);
    const rows = recording.body.trim().split('\n').map(JSON.parse);
    assert.ok(rows.some(row => row.e.kind === 'interpose' && row.e.descr === (area === 'Y9' ? '1A23' : '2B34')));
    assert.ok(rows.every(row => row.e.area === area), 'streaming endpoint serves only the selected area file');
  }
});
