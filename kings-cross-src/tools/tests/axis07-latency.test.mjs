import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeLatency, quantiles, summarizeLatency, sseParser } from '../axis07-latency.mjs';
import { startRelay } from '../../relay/relay.mjs';
import { FrameParser, encodeFrame } from '../../relay/stomp.mjs';

const scratch = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.scratch/axis07-latency/tests');
const temporary = async () => { await mkdir(scratch, { recursive: true }); return mkdtemp(path.join(scratch, 'run-')); };
const rows = () => Array.from({ length: 4 }, (_, sequence) => ({ sequence, written: sequence, received: sequence + 1, sent: sequence + 3, parsed: sequence + 6, applied: sequence + 7, parseOrder: sequence }));

test('latency quantiles use nearest rank and expose empty samples', () => {
  assert.deepEqual(quantiles([4, 1, 3, 2]), { n: 4, min: 1, p50: 2, p95: 4, p99: 4, max: 4 });
  assert.deepEqual(quantiles([]), { n: 0, min: null, p50: null, p95: null, p99: null, max: null });
});

test('latency summaries measure each stage and reject missing duplicate or reversed observations', () => {
  const result = summarizeLatency(rows(), 4, 2, 1);
  assert.equal(result.status, 'PASS');
  assert.equal(result.metrics.receiveToSseWriteMs.p50, 2);
  assert.equal(result.metrics.sseWriteToClientParseMs.p50, 3);
  assert.equal(result.metrics.clientParseToFeedApplyMs.p50, 1);
  assert.equal(result.counts.upstreamBackpressure, 2);
  assert.equal(result.counts.sseBackpressure, 1);
  for (const mutate of [r => { delete r[0].parsed; }, r => { r[0].duplicates = 1; }, r => { r[0].parseOrder = 10; }, r => { r[0].sent = -1; }, r => { delete r[0].applied; }]) {
    const sample = rows(); mutate(sample);
    assert.equal(summarizeLatency(sample, 4).status, 'FAIL');
  }
});

test('latency SSE parser preserves split frames and event order', () => {
  const seen = [];
  const parse = sseParser((type, row) => seen.push([type, row.n]));
  parse('event: td\ndata: {"n":');
  assert.deepEqual(seen, []);
  parse('1}\n\nevent: td\ndata: {"n":2}\n');
  assert.deepEqual(seen, [['td', 1]]);
  parse('\n');
  assert.deepEqual(seen, [['td', 1], ['td', 2]]);
});

test('latency probe reports bind permission denial as unavailable with no samples', async () => {
  const result = await probeLatency({ count: 2, burstSize: 1, dataRoot: await temporary() }, {
    createBroker() {
      const server = new EventEmitter();
      server.listen = () => queueMicrotask(() => server.emit('error', Object.assign(new Error('denied'), { code: 'EPERM' })));
      return server;
    },
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.reason, 'EPERM');
  assert.equal(result.metrics.receiveToSseWriteMs.n, 0);
});

test('latency probe refuses invalid limits before creating artifacts', async () => {
  for (const options of [{ count: 0 }, { count: 2, burstSize: 3 }, { timeoutMs: -1 }]) await assert.rejects(probeLatency(options), /invalid probe limits/);
});

test('real relay handler sends synthetic STOMP burst immediately and closes a backpressured SSE client', async t => {
  let handler, httpClosed = false;
  const server = new EventEmitter();
  server.listen = (_port, host, done) => { assert.equal(host, '127.0.0.1'); done(); };
  server.address = () => ({ port: 43210, address: '127.0.0.1' });
  server.close = done => { httpClosed = true; done(); };
  server.closeAllConnections = () => {};
  const socket = new EventEmitter();
  const parser = new FrameParser();
  let subscribed;
  const ready = new Promise(resolve => { subscribed = resolve; });
  socket.write = chunk => {
    for (const frame of parser.push(Buffer.from(chunk))) {
      if (frame.command === 'CONNECT') queueMicrotask(() => socket.emit('data', encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' })));
      if (frame.command === 'SUBSCRIBE') subscribed();
    }
    return true;
  };
  socket.end = () => socket.emit('close');
  socket.destroy = socket.end;
  const relay = await startRelay({ area: 'ZZ', topic: '/topic/SYNTHETIC_ZZ', dataDir: await temporary(),
    createServer: callback => { handler = callback; return server; },
    readCredentials: async () => ({ account: 'synthetic', secret: 'synthetic' }), connectSocket: () => socket, heartbeat: [0, 0] });
  t.after(() => relay.close());
  await ready;
  const request = new EventEmitter();
  Object.assign(request, { url: '/events', method: 'GET', headers: { host: '127.0.0.1:43210' } });
  const seen = [];
  let congested = false, ended = false;
  const parse = sseParser((type, row) => { if (type === 'td') seen.push(row.e.time); });
  const response = { writeHead() {}, write(text) { parse(text); return !congested; }, end() {}, destroy() { ended = true; } };
  await handler(request, response);
  const frame = n => encodeFrame('MESSAGE', { subscription: 'sub-0' }, JSON.stringify([{ CA_MSG: { area_id: 'ZZ', descr: 'ZZZZ', from: 'ZZ00', to: 'ZZ01', time: String(1800000000000 + n) } }]));
  socket.emit('data', Buffer.concat([frame(0), frame(1), frame(2)]));
  assert.deepEqual(seen, [1800000000000, 1800000000001, 1800000000002]);
  congested = true;
  socket.emit('data', frame(3));
  socket.emit('data', frame(4));
  assert.deepEqual(seen, [1800000000000, 1800000000001, 1800000000002, 1800000000003]);
  assert.equal(ended, true);
  request.emit('close');
  await relay.close();
  assert.equal(httpClosed, true);
});

test('latency real TCP STOMP burst reaches real SSE and Node live feed', async t => {
  const result = await probeLatency({ count: 100, burstSize: 10, timeoutMs: 5000, dataRoot: await temporary() });
  if (result.status === 'UNAVAILABLE') { t.skip(`loopback unavailable: ${result.reason}`); return; }
  assert.equal(result.status, 'PASS', JSON.stringify(result));
  assert.equal(result.counts.parsed, 100);
  assert.equal(result.counts.applied, 100);
  assert.equal(result.metrics.receiveToSseWriteMs.n, 100);
});
