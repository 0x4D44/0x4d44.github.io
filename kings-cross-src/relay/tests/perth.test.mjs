import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import { encodeFrame, FrameParser } from '../stomp.mjs';
import { startRelay } from '../relay.mjs';

const date = '2035-01-10', now = Date.parse(`${date}T12:00:00Z`);
const call = { uid: 'SYN01', headcode: '9Z90', platform: '1', arrivalMs: now, departureMs: null, passMs: null, from: 'south', to: null };

test('Perth route is loopback GET-only, validates dates and refuses a redirected private cache', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'synthetic-perth-'));
  const dataDir = path.join(dir, 'data');
  let handler, socket, relay;
  t.after(async () => { try { await relay?.close(); } finally { await rm(dir, { recursive: true, force: true }); } });
  const server = new EventEmitter();
  server.address = () => ({ port: 43212, address: '127.0.0.1' });
  server.listen = (_port, host, done) => { assert.equal(host, '127.0.0.1'); done(); };
  server.close = done => done(); server.closeAllConnections = () => {};
  relay = await startRelay({ dataDir, now: () => now, perth: { stanox: '99997', tiploc: 'SYNPT' },
    topic: '/topic/TD', trustTopic: '/topic/TRUST', readCredentials: async () => ({ account: 'synthetic', secret: 'synthetic' }),
    heartbeat: [0, 0], connectSocket: () => {
      socket = new EventEmitter();
      const parser = new FrameParser();
      socket.write = chunk => {
        for (const f of parser.push(Buffer.from(chunk))) if (f.command === 'CONNECT') queueMicrotask(() => socket.emit('data', encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' })));
        return true;
      };
      socket.destroy = socket.end = () => socket.emit('close');
      return socket;
    }, createServer(cb) { handler = cb; return server; } });
  for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve));
  const emit = (loc_stanox, event_type, planned_event_type) => ({ header: { msg_type: '0003' }, body: {
    loc_stanox, event_type, planned_event_type, train_id: '009Z90SYN', actual_timestamp: now, planned_timestamp: now, platform: '2',
  } });
  socket.emit('data', encodeFrame('MESSAGE', { destination: '/topic/TRUST', subscription: 'trust' },
    JSON.stringify([emit('99997', 'ARRIVAL'), emit('99997', 'DEPARTURE', 'PASS'), emit('99996', 'DEPARTURE')])));

  async function request(url, { method = 'GET', host = '127.0.0.1:43212', origin } = {}) {
    const req = new EventEmitter(); Object.assign(req, { method, url, headers: { host, origin } });
    let body = '';
    const res = new Writable({ write(chunk, _enc, done) { body += chunk; done(); } });
    res.writeHead = (status, headers) => { res.status = status; res.headers = headers; };
    await handler(req, res);
    return { status: res.status, headers: res.headers, body: JSON.parse(body) };
  }
  assert.equal((await request('/perth', { host: 'invalid.test:43212' })).status, 403);
  assert.equal((await request('/perth', { origin: 'https://invalid.test' })).status, 403);
  assert.equal((await request('/perth', { method: 'POST' })).status, 405);
  assert.equal((await request('/perth?date=../outside')).status, 400);
  assert.equal((await request('/perth?date=2035-02-30')).status, 400);
  assert.equal((await request('/perth?date=2035-01-01&date=2035-01-02')).status, 400);
  assert.equal((await request('/perth?file=outside')).status, 400);
  const outside = path.join(dir, 'outside.json');
  await writeFile(outside, JSON.stringify({ date, calls: [{ ...call, uid: 'OUTSIDE' }] }));
  const cache = path.join(dataDir, `perth-schedule-${date}.json`);
  await symlink(outside, cache);
  assert.equal((await request('/perth')).status, 502);
  await rm(cache);
  await writeFile(cache, JSON.stringify({ date, calls: [{ ...call, internal: 'PRIVATE' }] }));
  const resp = await request('/perth');
  assert.equal(resp.status, 200); assert.equal(resp.headers['cache-control'], 'no-store');
  assert.deepEqual(resp.body.calls, [call]);
  assert.deepEqual(resp.body.reports.map(({ eventType, platform }) => [eventType, platform]), [['ARRIVAL', '2'], ['PASS', '2']]);
});

test('one CIF pass keeps London calls and Perth previous/next locations and passes', async t => {
  const { createScheduleStore, filterSchedule } = await import('../schedule.mjs');
  const lines = [
    { tiploc_code: 'SYNW', departure: '1110' }, { tiploc_code: 'SYNPT', pass: '1200', platform: '1' },
    { tiploc_code: 'SYNE', arrival: '1220' }, { tiploc_code: 'KNGX', arrival: '1330' },
  ];
  const record = { JsonScheduleV1: { CIF_train_uid: 'SYN01', CIF_stp_indicator: 'P', schedule_start_date: date,
    schedule_end_date: date, schedule_days_runs: '1111111', schedule_segment: { signalling_id: '9Z90', schedule_location: lines } } };
  async function* extract() { yield Buffer.from(JSON.stringify(record) + '\n'); }
  const result = await filterSchedule(extract(), date, { perthTiplocs: ['SYNPT'] });
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].passMs, undefined);
  assert.equal(result.perthCalls[0].passMs, now);
  assert.deepEqual(result.perthCalls[0].previous, ['SYNW']);
  assert.deepEqual(result.perthCalls[0].next, ['SYNE', 'KNGX']);

  const dataDir = await mkdtemp(path.join(tmpdir(), 'synthetic-perth-schedule-'));
  const prior = { date, calls: result.calls };
  await writeFile(path.join(dataDir, `schedule-${date}.json`), JSON.stringify(prior));
  await writeFile(path.join(dataDir, 'perth-directions.json'), JSON.stringify({ SYNW: 'south', SYNE: 'east' }));
  let downloads = 0;
  const store = createScheduleStore({ dataDir, enabled: true, now: () => now, perth: { stanox: '99997' },
    corpus: async () => ({ TIPLOCDATA: [{ TIPLOC: 'SYNPT', STANOX: '99997' }] }),
    readCredentials: async () => ({ account: 'synthetic', secret: 'synthetic' }),
    fetchImpl: async () => { downloads++; return { ok: true, body: extract() }; } });
  t.after(async () => { try { await store.close(); } finally { await rm(dataDir, { recursive: true, force: true }); } });
  assert.deepEqual(await store.refresh(date), prior);
  const saved = await store.getPerth(date);
  assert.deepEqual([saved.calls[0].from, saved.calls[0].to, saved.calls[0].passMs], ['south', 'east', now]);
  assert.deepEqual(await store.refresh(date), prior);
  assert.equal(downloads, 1);
});
