import assert from 'node:assert/strict';
import test from 'node:test';
import { backoffMs, createLiveFeed, createReplayClock, createReplayFeed, createTimeline, parseRecording, probeRelay, relayReachable, snapshotEvents, trainSettings } from '../src/feed.ts';
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
    now: () => 0,
    schedule: (fn, ms) => { const entry = { fn, ms }; scheduled.push(entry); return entry; },
    unschedule: (timer) => { cancelled.push(timer); const index = scheduled.indexOf(timer as typeof scheduled[number]); if (index >= 0) scheduled.splice(index, 1); },
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
  const pending = scheduled[0]!;
  feed.dispose(); assert.ok(cancelled.includes(pending)); assert.equal(scheduled.length, 0);
  pending.fn(); assert.equal(streams.length, 3);
});

function liveHarness() {
  let clock = 0;
  const streams: FakeStream[] = [], states: string[] = [], applied: MotionEvent[] = [];
  const jobs = new Map<object, { at: number; fn: () => void }>();
  const feed = createLiveFeed({ apply: (e) => applied.push(e), advance: () => {} }, (state) => states.push(state), {
    source: () => { const stream = new FakeStream(); streams.push(stream); return stream; },
    now: () => clock,
    schedule: (fn, ms) => { const token = {}; jobs.set(token, { at: clock + ms, fn }); return token; },
    unschedule: (token) => { jobs.delete(token as object); },
  });
  const tick = (ms: number): void => {
    const end = clock + ms;
    for (let count = 0; ; count++) {
      assert.ok(count < 1000, 'timer loop must make progress');
      const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > end) break;
      clock = next[1].at; jobs.delete(next[0]); next[1].fn();
    }
    clock = end;
  };
  return { feed, streams, states, applied, jobs, tick, open: () => streams.at(-1)!.onopen?.({} as Event) };
}

test('live SSE watchdog retries after more than fifteen seconds of silence on an open stream', () => {
  const h = liveHarness();
  h.tick(30_000); assert.equal(h.streams.length, 1); assert.equal(h.states.at(-1), 'connecting');
  h.open(); h.tick(15_000); assert.equal(h.states.at(-1), 'connected');
  h.tick(1); assert.equal(h.streams[0]!.closed, true); assert.match(h.states.at(-1)!, /reconnecting; retry in 0.5s/);
  h.tick(499); assert.equal(h.streams.length, 1);
  h.tick(1); assert.equal(h.streams.length, 2);
  h.streams[1]!.onerror?.({} as Event);
  assert.match(h.states.at(-1)!, /reconnecting; retry in 1s/);
  h.tick(1000); h.open(); h.streams[2]!.emit('snapshot', { area: 'TEST', berths: { A: 'SYN1' } });
  assert.equal(h.states.at(-1), 'connected'); assert.deepEqual(h.applied, [first]);
  h.feed.dispose();
});

test('live SSE pings keep a quiet stream alive without advancing simulation or adding trains', () => {
  const h = liveHarness(); h.open();
  for (let i = 0; i < 12; i++) { h.tick(5000); h.streams[0]!.emit('ping', { t: -999 }); }
  assert.equal(h.streams.length, 1); assert.equal(h.streams[0]!.closed, false); assert.equal(h.states.at(-1), 'connected');
  assert.deepEqual(h.applied, []); assert.equal(h.feed.timeMs(), 0);
  h.tick(15_000); assert.equal(h.states.at(-1), 'connected');
  h.tick(1); assert.match(h.states.at(-1)!, /reconnecting/);
  h.feed.dispose();
});

test('live SSE snapshot and TD messages both refresh the watchdog deadline', () => {
  for (const type of ['snapshot', 'td']) {
    const h = liveHarness(); h.open(); h.tick(14_999);
    h.streams[0]!.emit(type, type === 'snapshot' ? { area: 'TEST', berths: { A: 'SYN1' } } : { t: 1, e: first });
    h.tick(15_000); assert.equal(h.states.at(-1), 'connected', type);
    h.tick(1); assert.match(h.states.at(-1)!, /reconnecting/, type);
    h.feed.dispose();
  }
});

test('live SSE pings from a replaced stream cannot extend the current stream deadline', () => {
  const h = liveHarness(); h.open(); h.tick(1000);
  const stale = h.streams[0]!; stale.onerror?.({} as Event); h.tick(500); h.open();
  h.tick(14_999); stale.emit('ping', { t: 123 });
  h.tick(2); assert.equal(h.streams[1]!.closed, true); assert.match(h.states.at(-1)!, /reconnecting/);
  h.feed.dispose();
});

test('live SSE dispose cancels its watchdog and ignores an already queued watchdog callback', () => {
  const h = liveHarness(); h.open(); const queued = [...h.jobs.values()][0]!.fn;
  const states = [...h.states];
  h.feed.dispose(); assert.equal(h.jobs.size, 0); assert.equal(h.streams[0]!.closed, true);
  h.tick(100_000); queued(); h.streams[0]!.emit('ping', { t: 1 });
  assert.equal(h.jobs.size, 0); assert.equal(h.streams.length, 1); assert.deepEqual(h.states, states);
});

test('live SSE a cancelled watchdog callback cannot replace the current deadline', () => {
  const h = liveHarness(); h.open(); const queued = [...h.jobs.values()][0]!.fn;
  h.tick(5000); h.streams[0]!.emit('ping', { t: 0 });
  queued(); assert.equal(h.jobs.size, 1);
  h.tick(15_001); assert.match(h.states.at(-1)!, /reconnecting/); assert.equal(h.jobs.size, 1);
  h.feed.dispose(); assert.equal(h.jobs.size, 0);
});

test('the default relay probe makes exactly one quiet request and handles absent or non-relay servers', async () => {
  let calls = 0;
  const fake = (async (url: string) => { calls++; assert.equal(url, '/relay/health'); throw new Error('offline'); }) as typeof fetch;
  assert.equal(await probeRelay(fake), false); assert.equal(calls, 1);
  assert.equal(await probeRelay((async () => new Response(JSON.stringify({ ok: true }))) as typeof fetch), true);
  assert.equal(await probeRelay((async () => new Response('<html>not a relay</html>')) as typeof fetch), false);
});

test('feed: the relay is probed only from a loopback host, never from the published site', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) assert.equal(relayReachable(host), true, host);
  for (const host of ['0x4d44.github.io', 'example.com', '127.0.0.1.example.com', '192.168.1.5', '']) assert.equal(relayReachable(host), false, host);
});
