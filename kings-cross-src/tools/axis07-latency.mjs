// Synthetic TCP STOMP -> real relay -> real HTTP SSE probe. No live credentials.
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { startRelay } from '../relay/relay.mjs';
import { FrameParser, encodeFrame } from '../relay/stomp.mjs';
import { createLiveFeed } from '../web/src/feed.ts';

const BASE = 1_800_000_000_000;
const TOPIC = '/topic/SYNTHETIC_ZZ_LATENCY';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.scratch/axis07-latency');

export function quantiles(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return { n: sorted.length, min: sorted[0] ?? null, p50: at(.5), p95: at(.95), p99: at(.99), max: sorted.at(-1) ?? null };
}

export function summarizeLatency(rows, expected, upstreamBackpressure = 0, sseBackpressure = 0) {
  const delta = (a, b) => rows.filter(r => Number.isFinite(r[a]) && Number.isFinite(r[b])).map(r => r[b] - r[a]);
  const count = (key) => rows.filter(r => Number.isFinite(r[key])).length;
  const parsed = rows.filter(r => Number.isFinite(r.parsed)).sort((a, b) => a.parseOrder - b.parseOrder);
  const counts = { expected, written: count('written'), received: count('received'), sent: count('sent'), parsed: count('parsed'), applied: count('applied'),
    duplicates: rows.reduce((n, r) => n + (r.duplicates ?? 0), 0),
    outOfOrder: parsed.filter((r, i) => i > 0 && r.sequence < parsed[i - 1].sequence).length,
    missing: expected - count('parsed'), upstreamBackpressure, sseBackpressure };
  const metrics = { upstreamWriteToReceiveMs: quantiles(delta('written', 'received')),
    receiveToSseWriteMs: quantiles(delta('received', 'sent')),
    sseWriteToClientParseMs: quantiles(delta('sent', 'parsed')),
    upstreamWriteToClientParseMs: quantiles(delta('written', 'parsed')),
    clientParseToFeedApplyMs: quantiles(delta('parsed', 'applied')),
    receiveToFeedApplyMs: quantiles(delta('received', 'applied')) };
  const valid = ['written', 'received', 'sent', 'parsed', 'applied'].every(k => counts[k] === expected) &&
    counts.duplicates === 0 && counts.outOfOrder === 0 && Object.values(metrics).every(q => q.n === expected && q.min >= 0);
  return { status: valid ? 'PASS' : 'FAIL', counts, metrics };
}

// Incremental SSE framing: split JSON/data lines may cross arbitrary TCP chunks.
export function sseParser(onEvent) {
  let pending = '';
  return chunk => {
    pending += chunk;
    let end;
    while ((end = pending.indexOf('\n\n')) >= 0) {
      const block = pending.slice(0, end); pending = pending.slice(end + 2);
      const type = /^event: (.+)$/m.exec(block)?.[1];
      const data = block.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
      if (data) onEvent(type, JSON.parse(data));
    }
  };
}

function bounded(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('probe deadline'), { code: 'ETIMEDOUT' })), ms);
  })]).finally(() => clearTimeout(timer));
}

/** Timestamps use one process monotonic clock; output contains aggregates only.
 * Each diagnostic receive parser runs before the production STOMP data listener.
 * Its complete-frame timestamp is the callback entry time (includes no claim of
 * NIC arrival). Receive->write includes diagnostic parsing overhead. A write is
 * ServerResponse.write invocation, not flush, browser delivery or page apply.
 * All synthetic records remain in a unique .scratch child. */
export async function probeLatency({ count = 1000, burstSize = Math.min(count, 100), timeoutMs = 10000, dataRoot = ROOT } = {}, deps = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 100000 || !Number.isInteger(burstSize) || burstSize < 1 || burstSize > count || !Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('invalid probe limits');
  const clock = deps.clock ?? (() => performance.now());
  const rows = Array.from({ length: count }, (_, sequence) => ({ sequence }));
  const sequenceOf = e => e?.area === 'ZZ' && e?.descr === 'ZZZZ' && e.kind === 'step' && Number.isInteger(e.time - BASE) && e.time >= BASE && e.time < BASE + count ? e.time - BASE : null;
  const sockets = new Set();
  let broker, relay, request, response, upstream, artifactDir, liveFeed, cancelled = false;
  let upstreamBackpressure = 0, sseBackpressure = 0, parseOrder = 0, sendAt;
  let readyResolve, completeResolve;
  const ready = new Promise(resolve => { readyResolve = resolve; });
  const complete = new Promise(resolve => { completeResolve = resolve; });
  const track = socket => { sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); return socket; };
  const markSent = (type, row) => {
    if (type !== 'td') return;
    const seq = sequenceOf(row.e);
    if (seq !== null) rows[seq].sent = sendAt;
  };
  const run = async () => {
    await mkdir(dataRoot, { recursive: true });
    artifactDir = await mkdtemp(path.join(dataRoot, 'run-'));
    if (cancelled) return;
    broker = (deps.createBroker ?? net.createServer)(socket => {
      upstream = track(socket); socket.setNoDelay(true);
      const parser = new FrameParser();
      socket.on('data', chunk => {
        for (const frame of parser.push(chunk)) {
          if (frame.command === 'CONNECT') socket.write(encodeFrame('CONNECTED', { version: '1.2', 'heart-beat': '0,0' }));
          if (frame.command === 'SUBSCRIBE') readyResolve();
        }
      });
    });
    await new Promise((resolve, reject) => { broker.once('error', reject); broker.listen(0, '127.0.0.1', resolve); });
    if (cancelled) { broker.close(); return; }
    relay = await (deps.startRelay ?? startRelay)({ area: 'ZZ', topic: TOPIC, port: 0, dataDir: artifactDir,
      readCredentials: async () => ({ account: 'synthetic.invalid', secret: 'synthetic-only' }), heartbeat: [0, 0], backoff: { minMs: 10000, maxMs: 10000 },
      connectSocket: () => {
        const socket = track(net.connect({ host: '127.0.0.1', port: broker.address().port }));
        socket.setNoDelay(true);
        const parser = new FrameParser();
        socket.on('data', chunk => {
          const received = clock();
          for (const frame of parser.push(chunk)) if (frame.command === 'MESSAGE') {
            for (const item of JSON.parse(frame.body)) {
              const seq = Number(item.CA_MSG.time) - BASE;
              if (rows[seq]) rows[seq].received = received;
            }
          }
        });
        return socket;
      },
      createServer: handler => http.createServer((req, res) => {
        const parse = sseParser(markSent);
        const write = res.write.bind(res);
        res.write = (chunk, ...args) => {
          sendAt = clock();
          parse(String(chunk));
          const result = write(chunk, ...args);
          if (!result) sseBackpressure++;
          return result;
        };
        return handler(req, res);
      }),
    });
    if (cancelled) { await relay.close(); return; }
    await ready;
    const eventListeners = new Map();
    const eventStream = { onopen: null, onerror: null,
      addEventListener(type, listener) { eventListeners.set(type, listener); }, close() {} };
    liveFeed = createLiveFeed({ advance() {}, apply(event) {
      const seq = sequenceOf(event);
      if (seq !== null) rows[seq].applied = clock();
    } }, () => {}, { source: () => eventStream, now: clock });
    await new Promise((resolve, reject) => {
      request = http.get({ host: '127.0.0.1', port: relay.port, path: '/events', agent: false }, res => {
        response = res;
        res.setEncoding('utf8');
        let opened = false;
        eventStream.onopen?.();
        const parse = sseParser((type, row) => {
          if (!opened && type === 'snapshot') { opened = true; resolve(); }
          if (type !== 'td') { eventListeners.get(type)?.({ data: JSON.stringify(row) }); return; }
          const seq = sequenceOf(row.e);
          if (seq === null) return;
          if (rows[seq].parsed !== undefined) { rows[seq].duplicates = (rows[seq].duplicates ?? 0) + 1; return; }
          rows[seq].parsed = clock(); rows[seq].parseOrder = parseOrder++;
          eventListeners.get(type)?.({ data: JSON.stringify(row) });
          if (parseOrder === count) completeResolve();
        });
        res.on('data', chunk => { try { parse(chunk); } catch (error) { reject(error); } });
        res.on('error', reject);
      });
      request.on('error', reject);
    });
    if (cancelled) return;
    // Yield between bursts so event-loop queueing is visible but bounded.
    for (let i = 0; i < count && !cancelled; i += burstSize) {
      const end = Math.min(i + burstSize, count);
      const frames = [];
      for (let seq = i; seq < end; seq++) frames.push(encodeFrame('MESSAGE', { destination: TOPIC, subscription: 'sub-0' }, JSON.stringify([
        { CA_MSG: { area_id: 'ZZ', descr: 'ZZZZ', from: 'ZZ00', to: 'ZZ01', time: String(BASE + seq) } },
      ])));
      const written = clock();
      for (let seq = i; seq < end; seq++) rows[seq].written = written;
      if (!upstream.write(Buffer.concat(frames))) upstreamBackpressure++;
      await new Promise(resolve => setImmediate(resolve));
    }
    await complete;
  };
  let errorCode = null;
  try { await bounded(run(), timeoutMs); }
  catch (error) { errorCode = ['EPERM', 'EACCES', 'ETIMEDOUT'].includes(error?.code) ? error.code : 'PROBE_ERROR'; }
  finally {
    cancelled = true;
    liveFeed?.dispose();
    request?.destroy(); response?.destroy();
    for (const socket of sockets) socket.destroy();
    if (relay) await bounded(relay.close(), 2000).catch(() => { errorCode ??= 'CLOSE_TIMEOUT'; });
    if (broker?.listening) await bounded(new Promise(resolve => broker.close(resolve)), 2000).catch(() => { errorCode ??= 'CLOSE_TIMEOUT'; });
  }
  const result = summarizeLatency(rows, count, upstreamBackpressure, sseBackpressure);
  return { ...result, ...(errorCode ? { status: ['EPERM', 'EACCES'].includes(errorCode) ? 'UNAVAILABLE' : 'FAIL', reason: errorCode } : {}),
    configuration: { count, burstSize, timeoutMs }, artifactDir,
    definitions: { clock: 'single-process performance.now milliseconds; nearest-rank quantiles',
      receive: 'relay TCP data callback entry for the chunk completing a STOMP frame; diagnostic parser precedes production parser',
      send: 'ServerResponse.write wrapper entry before diagnostic parsing and original write; not flush or delivery',
      client: 'complete td SSE JSON parsed by Node HTTP client; not browser/page/frame application',
      applied: 'real createLiveFeed sink.apply in Node via EventStream adapter (JSON reserialization overhead included); not browser renderer',
      upstream: 'synthetic broker socket.write entry for a burst; includes event-loop and TCP queueing',
      backpressure: 'count of socket.write/response.write false returns; production relay disconnects slow SSE clients' } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = ({ '--count': 'count', '--burst-size': 'burstSize', '--timeout-ms': 'timeoutMs' })[process.argv[i]];
    if (!key || process.argv[i + 1] === undefined) throw new Error('usage: axis07-latency.mjs [--count N] [--burst-size N] [--timeout-ms N]');
    options[key] = Number(process.argv[i + 1]);
  }
  const result = await probeLatency(options);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'FAIL' ? 1 : 0;
}
