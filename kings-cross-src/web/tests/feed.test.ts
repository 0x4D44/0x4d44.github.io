import assert from 'node:assert/strict';
import test from 'node:test';
import { backoffMs, createLiveFeed, createReplayClock, createReplayFeed, createTimeline, parseRecording, probeRelay, snapshotEvents, trainSettings } from '../src/feed.ts';
import type { EventStream } from '../src/feed.ts';
import type { MotionEvent } from '../../core/motion.ts';
import viteConfig from '../../vite.config.ts';

const first: MotionEvent = { kind: 'interpose', area: 'TEST', descr: 'SYN1', to: 'A' };
const next: MotionEvent = { kind: 'step', area: 'TEST', descr: 'SYN1', from: 'A', to: 'B', time: null };
const rows = [{ t: 1000, e: first }, { t: 3000, e: next }];
const near = (a: number, b: number): void => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('the dev relay proxy rewrites the path and sends the loopback target Host', () => {
  const proxy = viteConfig.server!.proxy!['/relay'];
  assert.ok(typeof proxy === 'object');
  assert.equal(proxy.target, 'http://127.0.0.1:8787');
  assert.equal(proxy.changeOrigin, true);
  assert.equal(proxy.rewrite!('/relay/events'), '/events');
  assert.equal(proxy.rewrite!('/relay/recording?date=20010101'), '/recording?date=20010101');
});

test('train URL modes keep explicit demo and none offline and validate replay date and speed', () => {
  assert.equal(trainSettings(new URLSearchParams()).mode, 'auto');
  for (const mode of ['demo', 'none', 'live']) assert.equal(trainSettings(new URLSearchParams({ trains: mode })).mode, mode);
  assert.deepEqual(trainSettings(new URLSearchParams('trains=replay&date=20010101&speed=8')), { mode: 'replay', date: '20010101', speed: 8 });
  assert.equal(trainSettings(new URLSearchParams('trains=replay&date=20010101')).speed, 1);
  assert.throws(() => trainSettings(new URLSearchParams('trains=replay&date=../../secret')));
  assert.throws(() => trainSettings(new URLSearchParams('trains=replay&date=20010101&speed=0')));
});

test('feed parses NDJSON with blank lines and CRLF and preserves equal-time event order', () => {
  const text = '\r\n' + JSON.stringify(rows[1]) + '\r\n' + JSON.stringify(rows[0]) + '\n' + JSON.stringify({ t: 3000, e: first }) + '\n';
  assert.deepEqual(parseRecording(text), [rows[0], rows[1], { t: 3000, e: first }]);
  assert.deepEqual(parseRecording(' \n'), []);
  for (const invalid of ['no json', JSON.stringify({ t: null, e: first }), JSON.stringify({ t: 1, e: { kind: 'step', area: 'TEST' } }), JSON.stringify({ t: 1, e: { ...next, to: 5 } })]) assert.throws(() => parseRecording(invalid), /line 1/);
});

test('replay clock scales simulation time once and never releases an event early', () => {
  const clock = createReplayClock(rows, 8);
  assert.deepEqual(clock.advance(0), [rows[0]]);
  assert.deepEqual(clock.advance(0.249), []);
  assert.deepEqual(clock.advance(0.001), [rows[1]]);
  assert.equal(clock.timeMs(), 3000); assert.equal(clock.done(), true);
  assert.deepEqual(clock.advance(0), []);
  assert.throws(() => createReplayClock(rows, 0));
  assert.throws(() => clock.advance(-1));
});

test('live and replay deliver through one timeline and advance exactly to each event before applying it', () => {
  const run = (speed: number) => {
    let time = 1000;
    const applied: { e: MotionEvent; at: number; physical: number }[] = [];
    const sink = { advance: (dt: number) => { time += dt * 1000; }, apply: (e: MotionEvent, at: number) => applied.push({ e, at, physical: time }) };
    const feed = createReplayFeed(rows, speed, sink, () => {});
    feed.advance(2 / speed); near(feed.timeMs(), 3000);
    feed.dispose(); feed.advance(1); near(feed.timeMs(), 3000);
    return applied;
  };
  assert.deepEqual(run(1), run(8));
  assert.deepEqual(run(1).map((r) => [r.at, r.physical]), [[1000, 1000], [3000, 3000]]);
  const calls: number[] = [];
  const timeline = createTimeline({ advance: () => {}, apply: (_e, at) => calls.push(at) }, 1000);
  timeline.deliver(first, 900); timeline.deliver(next, 1500);
  assert.deepEqual(calls, [1000, 1500]);
});

test('backoff grows exponentially and remains capped at thirty seconds', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 20].map(backoffMs), [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000]);
});

test('a reconnect snapshot places current descriptions and cancels descriptions that disappeared', () => {
  assert.deepEqual(snapshotEvents({ area: 'TEST', berths: { B: 'SYN2', A: 'SYN1' } }, ['SYN1', 'OLD']), [
    first, { kind: 'interpose', area: 'TEST', descr: 'SYN2', to: 'B' }, { kind: 'cancel', area: 'TEST', descr: 'OLD', from: '' },
  ]);
  assert.throws(() => snapshotEvents({ area: 'TEST', berths: { A: 7 } }));
});

class FakeStream implements EventStream {
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  listeners = new Map<string, (e: MessageEvent<string>) => void>();
  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) { this.listeners.set(type, fn); }
  close() { this.closed = true; }
  emit(type: string, data: unknown) { this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>); }
}

test('live SSE closes failed connections, retries with backoff and recovers without native duplicate reconnects', () => {
  const streams: FakeStream[] = [], states: string[] = [], applied: MotionEvent[] = [];
  const scheduled: { fn: () => void; ms: number }[] = [], cancelled: unknown[] = [];
  const feed = createLiveFeed({ apply: (e) => applied.push(e), advance: () => {} }, (s) => states.push(s), {
    source: (url) => { assert.equal(url, '/relay/events'); const s = new FakeStream(); streams.push(s); return s; },
    schedule: (fn, ms) => { const entry = { fn, ms }; scheduled.push(entry); return entry; }, unschedule: (timer) => cancelled.push(timer),
  });
  streams[0]!.onopen?.({} as Event);
  streams[0]!.emit('snapshot', { area: 'TEST', berths: { A: 'SYN1' } });
  streams[0]!.emit('td', { t: 1000, e: next });
  feed.advance(2); assert.equal(feed.timeMs(), 2000);
  assert.deepEqual(applied, [first, next]);
  streams[0]!.onerror?.({} as Event);
  assert.equal(streams[0]!.closed, true); assert.equal(scheduled[0]!.ms, 500);
  assert.match(states.at(-1)!, /reconnecting/);
  scheduled.shift()!.fn(); streams[1]!.onerror?.({} as Event);
  assert.equal(scheduled[0]!.ms, 1000);
  scheduled.shift()!.fn(); streams[2]!.onopen?.({} as Event);
  assert.equal(states.at(-1), 'connected');
  streams[2]!.emit('snapshot', { area: 'TEST', berths: {} });
  assert.equal(applied.at(-1)!.kind, 'cancel');
  streams[2]!.onerror?.({} as Event); assert.equal(scheduled[0]!.ms, 500);
  feed.dispose(); assert.equal(cancelled.length, 1);
  scheduled[0]!.fn(); assert.equal(streams.length, 3);
});

test('the default relay probe makes exactly one quiet request and handles absent or non-relay servers', async () => {
  let calls = 0;
  const fake = (async (url: string) => { calls++; assert.equal(url, '/relay/health'); throw new Error('offline'); }) as typeof fetch;
  assert.equal(await probeRelay(fake), false); assert.equal(calls, 1);
  assert.equal(await probeRelay((async () => new Response(JSON.stringify({ ok: true }))) as typeof fetch), true);
  assert.equal(await probeRelay((async () => new Response('<html>not a relay</html>')) as typeof fetch), false);
});
