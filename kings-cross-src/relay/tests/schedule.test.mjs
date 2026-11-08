import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { createScheduleStore, filterSchedule, nameSchedule, scheduleDate, SCHEDULE_URL } from '../schedule.mjs';
import { startRelay } from '../relay.mjs';
import { FrameParser, encodeFrame } from '../stomp.mjs';

const date = '2026-11-08', instant = Date.parse(`${date}T12:00:00Z`);
const schedule = (uid = 'SYN001', stp = 'P', locations = [
  { tiploc_code: 'KNGX', departure: '1200', public_departure: '1200', platform: '4' },
  { tiploc_code: 'SYNTH', arrival: '1300' },
]) => ({ JsonScheduleV1: { CIF_train_uid: uid, CIF_stp_indicator: stp, schedule_start_date: date, schedule_end_date: date, schedule_days_runs: '0000001', atoc_code: 'ZZ', schedule_segment: { signalling_id: '1Z01', CIF_train_category: 'XX', schedule_location: locations } } });
const extract = (...records) => records.map(r => JSON.stringify(r)).join('\n') + '\n';
async function* chunks(bytes) { yield bytes.subarray(0, 1); for (let i = 1; i < bytes.length; i += 17) yield bytes.subarray(i, i + 17); }
async function temporary(t) {
  const base = path.resolve(process.env.KX_TEST_SCRATCH_DIR ?? '../.scratch/round7-tests');
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, 'schedule-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const corpus = { TIPLOCDATA: [{ TIPLOC: 'KNGX ', NLCDESC: 'London Kings Cross ' }, { TIPLOC: 'SYNTH', NLCDESC: 'Synthetic Town' }] };

test('schedule stream: gzip is decoded incrementally and nonstation overlays suppress permanent calls', async () => {
  const raw = extract({ JsonTimetableV1: {} }, schedule(), schedule('SYN002'), schedule('SYN002', 'C', []), schedule('SYN003'), schedule('SYN003', 'O', [{ tiploc_code: 'OTHER', departure: '1200' }]));
  const result = await filterSchedule(chunks(gzipSync(raw)), date);
  assert.equal(result.records, 5);
  assert.equal(result.lines, 6);
  assert.ok(result.bytes < Buffer.byteLength(raw));
  assert.deepEqual(result.calls.map(c => [c.uid, c.platform, c.operator, c.departure]), [['SYN001', '4', 'ZZ', '12:00']]);
});

test('schedule stream: already decompressed input works and broken or empty extracts fail', async () => {
  assert.equal((await filterSchedule(chunks(Buffer.from(extract(schedule()))), date)).calls.length, 1);
  for (const raw of ['<html>not a feed</html>\n', '{"JsonTimetableV1":{}}\n', '{"JsonScheduleV1":{}}\n', extract(schedule()) + '{"JsonScheduleV1":{}}\n'])
    await assert.rejects(filterSchedule(chunks(Buffer.from(raw)), date), /schedule:/);
  await assert.rejects(filterSchedule(chunks(Buffer.from([0x1f, 0x8b, 0x00])), date));
});

test('schedule cache: full daily authenticated download writes named calls once and reuses disk without credentials', async t => {
  const dataDir = await temporary(t);
  let fetches = 0, credentials = 0;
  const store = createScheduleStore({ dataDir, enabled: true, now: () => instant, corpus: async () => corpus,
    readCredentials: async () => { credentials++; return { account: 'synthetic-user', secret: 'synthetic-secret' }; },
    fetchImpl: async (url, opts) => {
      fetches++;
      assert.equal(url, SCHEDULE_URL);
      assert.equal(new URL(url).searchParams.get('type'), 'CIF_ALL_FULL_DAILY');
      assert.equal(new URL(url).searchParams.get('day'), 'toc-full');
      assert.equal(opts.headers.authorization, `Basic ${Buffer.from('synthetic-user:synthetic-secret').toString('base64')}`);
      return { ok: true, body: chunks(gzipSync(extract(schedule()))) };
    } });
  t.after(() => store.close());
  const first = await store.refresh(date);
  assert.ok(first, 'authenticated full daily download must produce a cache');
  assert.equal(first.calls[0].destinationName, 'Synthetic Town');
  assert.equal(first.calls[0].originName, 'London Kings Cross');
  assert.equal(nameSchedule([{ origin: 'UNKN', destination: 'OTHER' }], {}).at(0).originName, 'UNKN');
  const text = await readFile(path.join(dataDir, `schedule-${date}.json`), 'utf8');
  assert.ok(!text.includes('synthetic-secret') && !text.includes('synthetic-user'));
  const reused = createScheduleStore({ dataDir, enabled: true, readCredentials: () => assert.fail('cache must avoid credentials'), fetchImpl: () => assert.fail('cache must avoid network') });
  t.after(() => reused.close());
  assert.deepEqual(await reused.refresh(date), first);
  assert.equal(fetches, 1); assert.equal(credentials, 1);
  await assert.rejects(reused.get('../outside'), /invalid schedule date/);
});

test('schedule cache: startup returns during download and close aborts work and clears its unreferenced daily timer', async t => {
  const dataDir = await temporary(t);
  let tick, cleared, unrefs = 0, started;
  const began = new Promise(resolve => { started = resolve; });
  let aborted = false;
  const store = createScheduleStore({ dataDir, enabled: true, now: () => instant,
    readCredentials: async () => ({ account: 'synthetic-user', secret: 'synthetic-secret' }),
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
      started(); signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    }),
    schedule: (callback, ms) => { tick = callback; assert.equal(ms, 60_000); return { unref: () => unrefs++ }; },
    unschedule: timer => { cleared = timer; } });
  t.after(() => store.close());
  assert.equal(store.start(), undefined);
  await began;
  assert.equal(await store.get(date), null);
  assert.equal(unrefs, 1); assert.equal(typeof tick, 'function');
  await store.close();
  assert.equal(aborted, true); assert.ok(cleared);
});

test('schedule cache: failed downloads never cache or expose upstream error text and can retry', async t => {
  const dataDir = await temporary(t), logs = [];
  let fail = true, refused = false, cancelled = false;
  const store = createScheduleStore({ dataDir, enabled: true, now: () => instant, log: text => logs.push(text),
    readCredentials: async () => ({ account: 'synthetic-user', secret: 'synthetic-secret' }),
    fetchImpl: async () => { if (fail) throw new Error('synthetic-secret https://signed.invalid/secret'); if (refused) return { ok: false, status: 503, body: { cancel: async () => { cancelled = true; } } }; return { ok: true, body: chunks(Buffer.from(extract(schedule()))) }; } });
  t.after(() => store.close());
  assert.equal(await store.refresh(date), null);
  assert.equal(await store.get(date), null);
  assert.ok(!logs.join('').includes('synthetic-secret'));
  fail = false; refused = true;
  assert.equal(await store.refresh(date), null);
  assert.equal(logs.at(-1), 'schedule: download failed (HTTP 503)');
  assert.equal(cancelled, true);
  refused = false;
  assert.equal((await store.refresh(date)).calls.length, 1);
  assert.equal(scheduleDate(Date.parse('2026-06-01T23:30Z')), '2026-06-02');
});

test('schedule cache: the daily timer refreshes a new London date without downloading an existing day again', async t => {
  const dataDir = await temporary(t);
  let time = instant, tick, fetches = 0;
  const store = createScheduleStore({ dataDir, enabled: true, now: () => time,
    readCredentials: async () => ({ account: 'synthetic', secret: 'synthetic' }),
    fetchImpl: async () => { fetches++; return { ok: true, body: chunks(Buffer.from(extract(schedule()))) }; },
    schedule: callback => { tick = callback; return { unref() {} }; }, unschedule: () => {} });
  t.after(() => store.close());
  store.start(); await store.refresh(date);
  tick(); assert.equal(fetches, 1);
  time += 24 * 3600_000; tick();
  await until(() => fetches === 2);
  assert.equal((await store.refresh('2026-11-09')).date, '2026-11-09');
  assert.equal(fetches, 2);
});

const get = (port, url, { method = 'GET', host } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path: url, method, headers: host ? { host } : {} }, res => {
    let text = ''; res.on('data', c => text += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text, body: JSON.parse(text) }));
  });
  req.on('error', reject); req.end();
});
async function until(fn) {
  for (let i = 0; i < 200; i++) { const value = await fn(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail('synthetic relay failed to become ready');
}

// Exercise the real HTTP handler and feed without needing a loopback listener.
function captureScheduleHttp(t) {
  let handler;
  const requests = new Set(), server = new EventEmitter();
  const port = 43212;
  server.listen = (_port, host, done) => { assert.equal(host, '127.0.0.1'); done(); };
  server.address = () => ({ port, address: '127.0.0.1' });
  server.close = done => done();
  server.closeAllConnections = () => { for (const req of requests) req.emit('close'); requests.clear(); };
  t.mock.method(http, 'createServer', fn => { handler = fn; return server; });
  async function request(url, { method = 'GET', host = `127.0.0.1:${port}`, onData } = {}) {
    const req = new EventEmitter();
    Object.assign(req, { url, method, headers: { host } });
    let status, headers, text = '';
    const res = {
      writeHead: (code, value) => { status = code; headers = value; },
      write: chunk => { text += chunk; onData?.(chunk); return true; },
      end: (chunk = '') => { text += chunk; },
    };
    requests.add(req);
    await handler(req, res);
    return { status, headers, text, body: onData ? undefined : JSON.parse(text), destroy: () => { req.emit('close'); requests.delete(req); } };
  }
  return { port, request };
}

async function checkScheduleEndpoint(t, offline = false) {
  const captured = offline ? captureScheduleHttp(t) : undefined;
  const dataDir = await temporary(t);
  const calls = (await filterSchedule(chunks(Buffer.from(extract(schedule()))), date)).calls;
  await writeFile(path.join(dataDir, `schedule-${date}.json`), JSON.stringify({ date, calls: nameSchedule(calls, corpus) }));
  const relay = await startRelay({ area: 'Y9', dataDir, feedEnabled: false, now: () => instant });
  t.after(() => relay.close());
  const request = (url, options) => captured ? captured.request(url, options) : get(relay.port, url, options);
  const response = await request('/schedule');
  assert.equal(response.status, 200); assert.equal(response.body.calls[0].platform, '4');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
  for (const query of ['date=../../etc/passwd', 'date=20261108', 'date=2026-02-30', 'date=2026-11-08&date=2026-11-09', 'path=/etc/passwd', 'date=2026-11-08%00'])
    assert.equal((await request(`/schedule?${query}`)).status, 400, query);
  assert.equal((await request('/schedule?date=2026-11-09')).status, 404);
  assert.equal((await request('/schedule', { method: 'POST' })).status, 405);
  assert.equal((await request('/schedule', { host: `127.0.0.1.evil:${relay.port}` })).status, 403);
}
test('schedule endpoint: only valid calendar dates select private cache files behind the shared relay guards', t => checkScheduleEndpoint(t));
test('schedule endpoint offline: calendar dates and shared guards use the same HTTP handler', t => checkScheduleEndpoint(t, true));

class FakeSocket extends EventEmitter {
  parser = new FrameParser(); subscriptions = [];
  write(data) { for (const frame of this.parser.push(Buffer.from(data))) {
    if (frame.command === 'CONNECT') queueMicrotask(() => this.emit('data', Buffer.from(encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' }))));
    if (frame.command === 'SUBSCRIBE') this.subscriptions.push(frame.headers);
  } }
  push(destination, body, subscription) { this.emit('data', Buffer.from(encodeFrame('MESSAGE', { destination, subscription }, JSON.stringify(body)))); }
  end() { this.emit('close'); }
  destroy() { this.emit('close'); }
}

async function checkScheduleIntegration(t, offline = false) {
  const captured = offline ? captureScheduleHttp(t) : undefined;
  const dataDir = await temporary(t);
  const calls = (await filterSchedule(chunks(Buffer.from(extract(schedule()))), date)).calls;
  await writeFile(path.join(dataDir, `schedule-${date}.json`), JSON.stringify({ date, calls }));
  const socket = new FakeSocket(), sockets = []; let connections = 0;
  const relay = await startRelay({ area: 'Y9', dataDir, topic: '/topic/TD', trustTopic: '/topic/TRUST', now: () => instant,
    readCredentials: async () => ({ account: 'synthetic-user', secret: 'synthetic-secret' }),
    connectSocket: () => { const next = connections++ ? new FakeSocket() : socket; sockets.push(next); return next; },
    heartbeat: [0, 0], backoff: { minMs: 1, maxMs: 1 } });
  t.after(() => relay.close());
  await until(() => socket.subscriptions.length === 2);
  assert.equal(connections, 1);
  assert.deepEqual(socket.subscriptions.map(s => [s.id, s.destination]), [['sub-0', '/topic/TD'], ['trust', '/topic/TRUST']]);
  const request = url => captured ? captured.request(url) : get(relay.port, url);
  await until(async () => (await request('/health')).body.schedule.state === 'ready');
  let sse = '';
  const req = captured ? await captured.request('/events', { onData: data => { sse += data; } })
    : http.get(`http://127.0.0.1:${relay.port}/events`, res => res.on('data', data => { sse += data; }));
  req.on?.('error', () => {}); t.after(() => req.destroy());
  await until(() => sse.includes('event: snapshot'));
  socket.push('/topic/TD', [{ CC_MSG: { area_id: 'Y9', descr: '1Z01', to: 'S001', time: String(instant) } }], 'sub-0');
  socket.push('/topic/TRUST', [{ header: { msg_type: '0001' }, body: { train_id: '001Z01AA08', train_uid: 'SYN001', schedule_start_date: date, origin_dep_timestamp: String(instant), schedule_type: 'P' } }], 'trust');
  socket.push('/topic/TRUST', [{ header: { msg_type: '0003' }, body: { train_id: '001Z01AA08', loc_stanox: '54311', event_type: 'DEPARTURE', planned_timestamp: String(instant), actual_timestamp: String(instant + 120000), gbtt_timestamp: String(instant), timetable_variation: '2', platform: '4' } }], 'trust');
  await until(() => sse.includes('event: trust'));
  const live = await request('/schedule');
  assert.equal(live.body.calls[0].realtime.actualDepartureMs, instant + 120000);
  assert.ok(sse.includes('event: td'));
  // A feed reconnect is a new transport/CONNECT, not a second CONNECTED on one session.
  socket.destroy();
  await until(() => connections === 2 && sockets[1].subscriptions.length === 2);
  assert.notEqual(sockets[1], socket);
  assert.deepEqual(sockets[1].subscriptions.map(s => [s.id, s.destination]), [['sub-0', '/topic/TD'], ['trust', '/topic/TRUST']]);
  await until(() => [...sse.matchAll(/^event: snapshot\ndata: (.+)$/gm)].some(match => JSON.parse(match[1]).counts.interpose === 1));
  req.destroy(); await relay.close();
  const rows = (await readFile(path.join(dataDir, 'recordings/td-Y9-20261108.ndjson'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.filter(r => r.e.kind === 'trust' && r.e.type === 'movement').length, 1);
  assert.equal(rows.filter(r => r.e.kind === 'trust' && r.e.type === 'activation').length, 1);
  assert.equal(rows.at(-1).e.counts.interpose, 1);
  assert.equal(rows.at(-1).e.counts.trust, undefined);
  assert.ok(!JSON.stringify(rows).includes('synthetic-secret'));
}
test('schedule integration: one STOMP connection routes TD and TRUST into SSE, schedule actuals and the recording', t => checkScheduleIntegration(t));
test('schedule integration offline: TD TRUST SSE schedule and recording share the live handler', t => checkScheduleIntegration(t, true));
