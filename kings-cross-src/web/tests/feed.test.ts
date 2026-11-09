import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backoffMs, createLiveFeed, createReplayClock, createReplayFeed, createScheduleFeed, createTimeline, parseRecording, probeRelay, relayReachable, snapshotEvents, trainSettings } from '../src/feed.ts';
import type { EventStream, SnapshotEvent } from '../src/feed.ts';
import { createMotion } from '../../core/motion.ts';
import type { MotionEvent } from '../../core/motion.ts';
import { buildGraph } from '../../core/graph.ts';
import type { AnchorMap } from '../../core/anchors.ts';
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

test('feed parses recordings with startup marks around parsing even when an input is invalid', () => {
  const names = ['kx:recording-parse-start', 'kx:recording-parse-end'];
  const clear = (): void => { for (const name of names) performance.clearMarks(name); };
  try {
    for (const input of [JSON.stringify(rows[0]), 'invalid']) {
      clear();
      if (input === 'invalid') assert.throws(() => parseRecording(input), /line 1/);
      else assert.deepEqual(parseRecording(input), [rows[0]]);
      const marks = performance.getEntriesByType('mark').filter(mark => names.includes(mark.name));
      assert.deepEqual(marks.map(mark => mark.name), names);
      assert.ok(marks[1]!.startTime >= marks[0]!.startTime);
    }
  } finally { clear(); }
});

test('feed parses recorded snapshots with berth and S-class pictures while keeping old recordings readable', () => {
  const snapshot = { kind: 'snapshot', area: 'TEST', berths: { A: 'SYN1' }, sclass: { addresses: 1, data: { '01': 'ab' } }, counts: {}, lastEventTime: null };
  assert.deepEqual(parseRecording(JSON.stringify({ t: 0, e: snapshot })), [{ t: 0, e: snapshot }]);
  assert.deepEqual(parseRecording(JSON.stringify(rows[0])), [rows[0]]);
  for (const invalid of [
    { ...snapshot, berths: null }, { ...snapshot, berths: [] }, { ...snapshot, berths: { A: 42 } },
    { ...snapshot, sclass: { addresses: -1, data: {} } }, { ...snapshot, sclass: { addresses: 1, data: { '01': 42 } } },
  ]) assert.throws(() => parseRecording(JSON.stringify({ t: 0, e: invalid })), /line 1/);
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
  const run = (speed: number, live = false) => {
    let time = live ? 0 : 1000;
    const applied: { e: MotionEvent; at: number; physical: number }[] = [];
    const sink = { advance: (dt: number) => { time += dt * 1000; }, apply: (e: MotionEvent, at: number) => applied.push({ e, at, physical: time }) };
    const stream = new FakeStream();
    const feed = live ? createLiveFeed(sink, () => {}, { source: () => stream, schedule: () => ({}), unschedule: () => {} }) : createReplayFeed(rows, speed, sink, () => {});
    if (live) { stream.onopen?.({} as Event); feed.advance(1); stream.emit('td', rows[0]); }
    feed.advance(2 / speed);
    if (live) stream.emit('td', rows[1]);
    near(feed.timeMs(), 3000);
    feed.dispose(); feed.advance(1); near(feed.timeMs(), 3000);
    return applied;
  };
  assert.deepEqual(run(1), run(8));
  assert.deepEqual(run(1, true), run(1));
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

test('late and out-of-order source timestamps apply synchronously in receive order in live and replay', () => {
  const stream = new FakeStream();
  const liveApplied: { to?: string; at: number }[] = [], replayApplied: { to?: string; at: number }[] = [];
  const sink = (applied: typeof liveApplied) => ({ advance: () => {}, apply: (e: MotionEvent, at: number) => applied.push({ to: e.to, at }) });
  const burst = [1000, 900, 9999999].map((time, i) => ({ t: 2000,
    e: { ...next, time, from: String.fromCharCode(65 + i), to: String.fromCharCode(66 + i) } }));
  const recorded = [{ t: 0, e: first }, ...burst];
  let pending = 0;
  const live = createLiveFeed(sink(liveApplied), () => {}, { source: () => stream,
    schedule: () => { pending++; return {}; }, unschedule: () => { pending--; }, now: () => 0 });
  const replay = createReplayFeed(parseRecording(recorded.map(r => JSON.stringify(r)).join('\n')), 30, sink(replayApplied), () => {});
  try {
    stream.onopen?.({} as Event); stream.emit('td', recorded[0]);
    live.advance(2);
    const before = pending;
    for (const [i, row] of burst.entries()) {
      stream.emit('td', row);
      assert.equal(liveApplied.length, i + 2, 'event applies before the EventSource listener returns');
      assert.equal(pending, before, 'no source-time timer or extra queue delays an event');
    }
    replay.advance(2 / 30);
    assert.deepEqual(liveApplied, [{ to: 'A', at: 0 }, { to: 'B', at: 2000 }, { to: 'C', at: 2000 }, { to: 'D', at: 2000 }]);
    assert.deepEqual(replayApplied, liveApplied);
    assert.equal(live.timeMs(), 2000); assert.equal(replay.timeMs(), 2000);
  } finally { live.dispose(); replay.dispose(); }
  assert.equal(pending, 0);
});

test('live and replay reconcile a cancel lost in a connection gap to identical moving and fading trains', () => {
  const graph = buildGraph({ nodes: [[1, 0, -1000], [2, 5000, -1000]], rails: [{ id: 7, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 }] });
  const anchors: AnchorMap = { area: 'TEST', sources: ['synthetic'], unmapped: [], anchors: [
    ['A', 400], ['B', 1800], ['C', 3000],
  ].map(([berth, x]) => ({ berth: String(berth), kind: 'signal', from: 1, to: 2, t: Number(x) / 5000, point: [Number(x), -1000], errorM: 0, evidence: 'synthetic' })) };
  const snapshot = (berths: Record<string, string>, data: Record<string, string>): SnapshotEvent => ({ kind: 'snapshot', area: 'TEST', berths, sclass: { addresses: Object.keys(data).length, data } });
  const recorded = [
    { t: 0, e: snapshot({ A: 'OLD', B: 'KEPT' }, { '01': 'ff' }) },
    { t: 1000, e: { kind: 'step', area: 'TEST', descr: 'KEPT', from: 'B', to: 'C' } },
    // OLD was cancelled while disconnected. Only the reconnect picture reveals that loss.
    { t: 3000, e: snapshot({ C: 'KEPT' }, {}) },
  ];
  const liveMotion = createMotion(graph, anchors), replayMotion = createMotion(graph, anchors);
  const liveApplied: MotionEvent[] = [], replayApplied: MotionEvent[] = [];
  const sink = (motion: typeof liveMotion, applied: MotionEvent[]) => ({ advance: motion.advance, apply: (e: MotionEvent, at: number) => { applied.push(e); motion.apply(e, at); } });
  const streams: FakeStream[] = [], jobs = new Map<object, { fn: () => void; ms: number }>();
  const live = createLiveFeed(sink(liveMotion, liveApplied), () => {}, {
    source: () => { const stream = new FakeStream(); streams.push(stream); return stream; }, now: () => 0,
    schedule: (fn, ms) => { const token = {}; jobs.set(token, { fn, ms }); return token; }, unschedule: (token) => { jobs.delete(token as object); },
  });
  const replay = createReplayFeed(parseRecording(recorded.map((row) => JSON.stringify(row)).join('\n')), 8, sink(replayMotion, replayApplied), () => {});
  const advance = (seconds: number) => { live.advance(seconds); replay.advance(seconds / 8); };
  streams[0]!.onopen?.({} as Event); streams[0]!.emit('snapshot', recorded[0]!.e);
  advance(1); streams[0]!.emit('td', recorded[1]);
  const retained = liveMotion.trains().find((t) => t.description === 'KEPT')!;
  streams[0]!.onerror?.({} as Event); assert.equal(streams[0]!.closed, true);
  advance(1.5);
  [...jobs.values()].find((job) => job.ms === 500)!.fn(); streams[1]!.onopen?.({} as Event);
  advance(0.5);
  const beforeSnapshot = liveMotion.trains().find((t) => t.description === 'KEPT')!;
  streams[1]!.emit('snapshot', recorded[2]!.e);
  assert.equal(liveMotion.trains().find((t) => t.description === 'OLD')!.state, 'fading');
  assert.equal(liveMotion.trains().find((t) => t.description === 'KEPT')!.id, retained.id);
  assert.deepEqual(liveMotion.trains().find((t) => t.description === 'KEPT')!.occupied, beforeSnapshot.occupied);
  assert.deepEqual(liveMotion.trains(), replayMotion.trains());
  advance(7);
  assert.deepEqual(liveMotion.trains().map((t) => t.description), ['KEPT']);
  assert.ok(liveMotion.trains()[0]!.distanceM > 0);
  assert.deepEqual(liveMotion.trains(), replayMotion.trains());
  assert.deepEqual(liveMotion.diagnostics(), replayMotion.diagnostics());
  assert.deepEqual(liveApplied, replayApplied); // Includes both complete S-class pictures, including the empty reset.
  assert.deepEqual(liveApplied.filter((event) => event.kind === 'snapshot'), [recorded[0]!.e, recorded[2]!.e]);
  live.dispose(); replay.dispose();
});

test('feed snapshot reconciliation isolates areas and rejects an invalid picture before applying any part', () => {
  const applied: MotionEvent[] = [];
  const timeline = createTimeline({ advance: () => {}, apply: (event) => applied.push(event) });
  timeline.deliver(first); timeline.deliver({ ...first, area: 'OTHER', descr: 'OTHER-TRAIN' });
  timeline.deliver({ kind: 'snapshot', area: 'TEST', berths: {} } as SnapshotEvent);
  assert.deepEqual(applied.slice(-2), [{ kind: 'snapshot', area: 'TEST', berths: {} }, { kind: 'cancel', area: 'TEST', descr: 'SYN1', from: '' }]);
  const count = applied.length;
  assert.throws(() => timeline.deliver({ kind: 'snapshot', area: 'TEST', berths: { A: 'SYN1', B: 42 } } as unknown as SnapshotEvent));
  assert.equal(applied.length, count);
});

test('feed audit uses the live reconciliation path for recorded snapshots', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  mkdirSync(join(root, '.scratch'), { recursive: true });
  const dir = mkdtempSync(join(root, '.scratch/feed-audit-'));
  try {
    const graph = { nodes: [[1, 0, -1000], [2, 1000, -1000]], rails: [{ id: 7, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 }] };
    const anchors: AnchorMap = { area: 'TEST', sources: ['synthetic'], unmapped: [], anchors: [{ berth: 'A', kind: 'signal', from: 1, to: 2, t: 0.5, point: [500, -1000], errorM: 0, evidence: 'synthetic' }] };
    writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph));
    writeFileSync(join(dir, 'anchors.json'), JSON.stringify(anchors));
    writeFileSync(join(dir, 'events.ndjson'), [
      { t: 0, e: { kind: 'snapshot', area: 'TEST', berths: { A: 'OLD' } } },
      { t: 1000, e: { kind: 'snapshot', area: 'TEST', berths: {} } },
    ].map((row) => JSON.stringify(row)).join('\n'));
    execFileSync(process.execPath, [fileURLToPath(new URL('../../tools/motion-check.ts', import.meta.url)), '--anchors', join(dir, 'anchors.json'), '--recording', join(dir, 'events.ndjson'), '--graph', join(dir, 'graph.json'), '--out', join(dir, 'out')], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 });
    const report = JSON.parse(readFileSync(join(dir, 'out/motion-report.json'), 'utf8'));
    assert.equal(report.snapshots, 2); assert.equal(report.snapshotPlacementFailures, 0);
    assert.equal(report.trainsObserved, 1); assert.equal(report.trainsVanishedAfterFade, 1); assert.equal(report.remainingTrains, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

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
  assert.deepEqual(applied, [{ kind: 'snapshot', area: 'TEST', berths: { A: 'SYN1' } }, first, next]);
  streams[0]!.onerror?.({} as Event);
  assert.equal(streams[0]!.closed, true); assert.equal(scheduled[0]!.ms, 500);
  assert.match(states.at(-1)!, /reconnecting/);
  scheduled.shift()!.fn(); streams[1]!.onerror?.({} as Event);
  assert.equal(scheduled[0]!.ms, 1000);
  scheduled.shift()!.fn(); streams[2]!.onopen?.({} as Event);
  assert.match(states.at(-1)!, /^relay connected/);
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
  h.tick(10_000); assert.equal(h.streams.length, 1); assert.equal(h.states.at(-1), 'connecting');
  h.open(); h.tick(15_000); assert.match(h.states.at(-1)!, /^relay connected/);
  h.tick(1); assert.equal(h.streams[0]!.closed, true); assert.match(h.states.at(-1)!, /reconnecting; retry in 0.5s/);
  h.tick(499); assert.equal(h.streams.length, 1);
  h.tick(1); assert.equal(h.streams.length, 2);
  h.streams[1]!.onerror?.({} as Event);
  assert.match(h.states.at(-1)!, /reconnecting; retry in 1s/);
  h.tick(1000); h.open(); h.streams[2]!.emit('snapshot', { area: 'TEST', berths: { A: 'SYN1' } });
  assert.match(h.states.at(-1)!, /^relay connected/); assert.deepEqual(h.applied, [{ kind: 'snapshot', area: 'TEST', berths: { A: 'SYN1' } }, first]);
  h.feed.dispose();
});

test('live SSE pings keep a quiet stream alive without advancing simulation or adding trains', () => {
  const h = liveHarness(); h.open();
  for (let i = 0; i < 12; i++) { h.tick(5000); h.streams[0]!.emit('ping', { t: 0, feed: 'connecting' }); }
  assert.equal(h.streams.length, 1); assert.equal(h.streams[0]!.closed, false); assert.match(h.states.at(-1)!, /^relay connected/);
  assert.deepEqual(h.applied, []); assert.equal(h.feed.timeMs(), 0);
  h.tick(15_000); assert.match(h.states.at(-1)!, /^relay connected/);
  h.tick(1); assert.match(h.states.at(-1)!, /reconnecting/);
  h.feed.dispose();
});

test('live SSE snapshot and TD messages both refresh the watchdog deadline', () => {
  for (const type of ['snapshot', 'td']) {
    const h = liveHarness(); h.open(); h.tick(14_999);
    h.streams[0]!.emit(type, type === 'snapshot' ? { area: 'TEST', berths: { A: 'SYN1' } } : { t: 1, e: first });
    h.tick(15_000); assert.match(h.states.at(-1)!, /^relay connected/, type);
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
  h.tick(5000); h.streams[0]!.emit('ping', { t: 0, feed: 'connecting' });
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

// Older relays answer 404 for unavailable timetables; retain their backoff policy.
test('a missing timetable backs off in live mode and is not re-asked in replay', async () => {
  const jobs: { fn: () => void; ms: number }[] = [];
  const timers = { schedule: (fn: () => void, ms: number) => { jobs.push({ fn, ms }); return jobs.length; }, unschedule: () => {} };
  let asked = 0;
  const fetchImpl = (async (url: string) => {
    if (String(url).includes('/schedule')) asked++;
    return new Response('{"error":"not found"}', { status: 404 });
  }) as typeof fetch;
  const live = createScheduleFeed({ mode: 'live', hostname: 'localhost', relayPresent: true, fetchImpl, now: () => Date.parse('2026-11-08T12:00Z'), ...timers });
  await live.refresh();
  const delays: number[] = [];
  for (let i = 0; i < 6; i++) { const job = jobs.shift()!; delays.push(job.ms); job.fn(); await live.refresh(); }
  live.dispose();
  assert.ok(delays.every((ms, i) => i === 0 || ms >= delays[i - 1]!), `delays never shrink: ${delays}`);
  assert.ok(delays.at(-1)! >= 60_000, `live backs off to at least a minute: ${delays}`);
  assert.ok(delays.at(-1)! <= 600_000, `live keeps asking at least every 10 min: ${delays}`);
  // Six polls stop at 160 s, short of the ceiling. On a second feed, poll past it: each wait is double the last until the ceiling, and there it stays.
  jobs.length = 0;
  const long = createScheduleFeed({ mode: 'live', hostname: 'localhost', relayPresent: true, fetchImpl, now: () => Date.parse('2026-11-08T12:00Z'), ...timers });
  await long.refresh();
  const climb: number[] = [];
  for (let i = 0; i < 10; i++) { const job = jobs.shift()!; climb.push(job.ms); job.fn(); await long.refresh(); }
  long.dispose();
  const CEILING = 300_000;
  climb.forEach((ms, i) => {
    const want = Math.min(5_000 * 2 ** i, CEILING);
    assert.equal(ms, want, `live back-off, wait ${i + 1} of ${climb.length} is ${ms} ms, not ${want}: 5 s doubled each time up to the ${CEILING} ms ceiling, then level (waits ${climb})`);
  });
  jobs.length = 0; asked = 0;
  const replay = createScheduleFeed({ mode: 'replay', hostname: 'localhost', relayPresent: true, date: '2026-11-07', fetchImpl, ...timers });
  await replay.refresh();
  assert.equal(asked, 1); assert.equal(jobs.length, 0, 'a past day that is missing will not appear later');
  replay.dispose();
});

test('an explicit unavailable timetable stops replay polling and live retries until bookings arrive', async () => {
  const date = '2026-11-09';
  for (const mode of ['live', 'replay'] as const) {
    let available = false;
    const jobs: { fn: () => void; ms: number }[] = [];
    const changes: (readonly unknown[] | undefined)[] = [];
    const feed = createScheduleFeed({ mode, date, hostname: 'localhost', relayPresent: true,
      now: () => Date.parse(`${date}T12:00Z`), onChange: calls => { changes.push(calls); },
      schedule: (fn, ms) => { jobs.push({ fn, ms }); return jobs.length; }, unschedule: () => {},
      fetchImpl: (async () => new Response(JSON.stringify(available ? { date, calls: [] }
        : { date, available: false, reason: 'no timetable' }), { status: 200 })) as typeof fetch,
    });
    try {
      await feed.refresh();
      assert.equal(feed.services(), undefined, 'unavailable never means an empty but available timetable');
      assert.equal(changes.at(-1), undefined);
      if (mode === 'replay') {
        assert.equal(jobs.length, 0, 'an explicitly unavailable replay day is settled');
      } else {
        assert.equal(jobs.shift()!.ms, 5000);
        await feed.refresh();
        assert.equal(jobs.shift()!.ms, 10_000, 'missing live bookings back off');
        available = true;
        await feed.refresh();
        assert.deepEqual(feed.services(), [], 'a later available empty timetable is accepted');
        assert.equal(jobs.shift()!.ms, 60_000);
      }
    } finally { feed.dispose(); }
  }
});


test('a reconnect retains an arriving body whose deferred replacement is in the snapshot', () => {
  const graph = buildGraph({ nodes: [[1, 0, -1000], [2, 5000, -1000]], rails: [
    { id: 7, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 },
  ] });
  const anchors: AnchorMap = { area: 'TEST', sources: ['synthetic'], unmapped: [], anchors: [
    { berth: 'A', kind: 'signal', from: 1, to: 2, t: 0.08, point: [400, -1000], errorM: 0, evidence: 'synthetic' },
    { berth: 'P', kind: 'platform', platform: '1', from: 1, to: 2, t: 0.6, point: [3000, -1000], errorM: 0, evidence: 'synthetic' },
  ] };
  const motion = createMotion(graph, anchors, { lengthM: 130 });
  const timeline = createTimeline(motion);
  timeline.deliver({ kind: 'step', area: 'TEST', from: 'A', to: 'P', descr: 'OLD' }, 0);
  timeline.deliver({ kind: 'interpose', area: 'TEST', to: 'P', descr: 'NEW' }, 5000);
  const before = motion.trains()[0]!;
  timeline.deliver({ kind: 'snapshot', area: 'TEST', berths: { P: 'NEW' } } as SnapshotEvent, 5000);
  assert.notEqual(motion.trains()[0]!.state, 'fading');
  assert.equal(motion.trains()[0]!.id, before.id);
  assert.deepEqual(motion.trains()[0]!.occupied, before.occupied);
  timeline.advanceTo(500_000);
  const arrived = motion.trains()[0]!;
  assert.equal(motion.trains().length, 1);
  assert.equal(arrived.description, 'NEW'); assert.equal(arrived.id, before.id);
  assert.equal(arrived.lengthM, 130); assert.equal(arrived.state, 'held');
  assert.ok(Math.abs(arrived.leading.point[0] - 2997) < 1e-6);
  timeline.deliver({ kind: 'snapshot', area: 'TEST', berths: {} } as SnapshotEvent, 500_000);
  assert.equal(motion.trains()[0]!.state, 'fading', 'a genuinely absent body must still fade');
  timeline.advanceTo(506_000); assert.deepEqual(motion.trains(), []);
});


test('live SSE accepts an HTTP open without resetting exponential retry backoff', () => {
  const h = liveHarness();
  try {
    for (const delay of [500, 1000, 2000, 4000, 8000, 16000, 30000]) {
      h.open(); h.streams.at(-1)!.onerror?.({} as Event);
      assert.match(h.states.at(-1)!, new RegExp(`retry in ${delay / 1000}s`));
      h.tick(delay);
    }
    h.open();
    h.streams.at(-1)!.emit('snapshot', { area: 'TEST', berths: { A: 'SYN1' } });
    h.streams.at(-1)!.onerror?.({} as Event);
    assert.match(h.states.at(-1)!, /retry in 0.5s/, 'validated traffic resets backoff');
  } finally { h.feed.dispose(); }
});

test('live SSE malformed messages close the stream with a named fault and preserve the last good scene', () => {
  for (const [type, value, fault] of [
    ['snapshot', { area: 'TEST', berths: { A: null } }, 'invalid relay snapshot'],
    ['td', { e: { ...first, to: null } }, 'invalid relay event'],
    ['trust', { e: { kind: 'trust', area: 'TEST', receivedAtMs: 'bad' } }, 'invalid TRUST event'],
    ['ping', {}, 'invalid relay heartbeat'],
    ['ping', { t: 0, feed: 'pretending' }, 'invalid relay heartbeat'],
    ['ping', { t: 0, feed: 'connected', lastEventAt: 'bad' }, 'invalid relay heartbeat'],
  ] as const) {
    const h = liveHarness();
    try {
      h.open(); const stream = h.streams[0]!;
      stream.emit('snapshot', { area: 'TEST', berths: { A: 'SYN1' } });
      stream.emit('ping', { t: 0, feed: 'connected', lastEventAt: 0 });
      assert.equal(h.states.at(-1), 'connected');
      const before = [...h.applied];
      stream.emit(type, value);
      assert.equal(stream.closed, true, `${type} must not hold a broken stream open`);
      assert.match(h.states.at(-1)!, /reconnecting/);
      assert.ok(h.states.at(-1)!.includes(fault), `${type} records its named fault`);
      assert.deepEqual(h.applied, before, 'invalid traffic never replaces the last good picture');
      stream.emit('ping', { t: 0, feed: 'connected' });
      assert.match(h.states.at(-1)!, /reconnecting/, 'a closed stream cannot claim recovery');
      h.tick(500); h.open();
      h.streams[1]!.emit('ping', { t: 0, feed: 'connected', lastEventAt: 0 });
      assert.equal(h.states.at(-1), 'connected', 'valid traffic recovers without reload');
    } finally { h.feed.dispose(); }
  }
});

test('live SSE invalid heartbeat traffic cannot suppress increasing retry delays', () => {
  const h = liveHarness();
  try {
    for (const delay of [500, 1000, 2000]) {
      h.open(); h.streams.at(-1)!.emit('ping', { t: null });
      assert.match(h.states.at(-1)!, new RegExp(`retry in ${delay / 1000}s`));
      h.tick(delay);
    }
    h.open(); h.streams.at(-1)!.emit('ping', { t: 0 });
    h.streams.at(-1)!.onerror?.({} as Event);
    assert.match(h.states.at(-1)!, /retry in 0.5s/, 'valid legacy heartbeats remain compatible');
  } finally { h.feed.dispose(); }
});


// Synthetic clocks deliberately straddle an exact removal sample. No railway observations.
for (const removal of ['snapshot', 'cancel'] as const) {
  test(`recorded ${removal} time controls a fade despite an ahead live frame clock`, () => {
    const base = Date.UTC(2001, 0, 1);
    const graph = buildGraph({ nodes: [[1, 0, -1000], [2, 500, -1000]], rails: [
      { id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 }] });
    const anchors: AnchorMap = { area: 'TEST', sources: ['synthetic'], unmapped: [], anchors: [
      { berth: 'A', kind: 'signal', from: 1, to: 2, t: .5, point: [250, -1000], errorM: 0, evidence: 'synthetic' }] };
    const first = { kind: 'snapshot', area: 'TEST', berths: { A: 'SYN1' } };
    const gone = removal === 'snapshot' ? { kind: 'snapshot', area: 'TEST', berths: {} }
      : { kind: 'cancel', area: 'TEST', descr: 'SYN1', from: 'A' };
    const recorded = [{ t: base, e: first }, { t: base + 1978, e: gone }];
    const liveMotion = createMotion(graph, anchors, { lengthM: 20 }), replayMotion = createMotion(graph, anchors, { lengthM: 20 });
    const stream = new FakeStream();
    const live = createLiveFeed(liveMotion, () => {}, { epochMs: base, source: () => stream, schedule: () => 1, unschedule() {} });
    const replay = createReplayFeed(recorded, 1, replayMotion, () => {});
    try {
      stream.emit('snapshot', { ...first, t: base });
      live.advance(2.005127); replay.advance(2.005127);
      const before = liveMotion.trains()[0]!;
      stream.emit(removal === 'snapshot' ? 'snapshot' : 'td', removal === 'snapshot' ? { ...gone, t: base + 1978 } : recorded[1]);
      assert.equal(live.timeMs(), 2005.127, 'receiving old observation time never rewinds or advances animation');
      assert.deepEqual(liveMotion.trains()[0]!.occupied, before.occupied);
      live.advance(4.944873); replay.advance(4.944873);
      assert.equal(liveMotion.trains().length, 1); assert.equal(replayMotion.trains().length, 1);
      assert.ok(Math.abs(liveMotion.trains()[0]!.opacity - replayMotion.trains()[0]!.opacity) < 1e-5);
      live.advance(.05); replay.advance(.05);
      assert.deepEqual(liveMotion.trains(), [], 'fade expires from recorded observation time, before the sampled instant');
      assert.deepEqual(replayMotion.trains(), []);
    } finally { live.dispose(); replay.dispose(); }
  });
}

test('timeline forwards observation time independently of its monotonic physical clock', () => {
  let physical = 0;
  const applied: { at: number; observed: number | undefined; physical: number }[] = [];
  const timeline = createTimeline({ advance: dt => { physical += dt * 1000; },
    apply: (_e, at, observed) => applied.push({ at, observed, physical }) });
  timeline.advanceTo(2005);
  timeline.deliver(first, timeline.timeMs(), 1978);
  timeline.deliver(next, timeline.timeMs(), 2010);
  assert.deepEqual(applied, [{ at: 2005, observed: 1978, physical: 2005 }, { at: 2005, observed: 2010, physical: 2005 }]);
});

test('live feed rejects invalid recorder timestamps before delivering any part of a packet', () => {
  for (const [type, payload] of [
    ['snapshot', { t: 'bad', area: 'TEST', berths: { A: 'SYN1' } }],
    ['td', { t: 'bad', e: first }],
    ['trust', { t: 'bad', e: { kind: 'trust', area: 'TEST', type: 'movement' } }],
  ]) {
    const stream = new FakeStream(), states: string[] = [], applied: MotionEvent[] = [];
    const feed = createLiveFeed({ apply: e => applied.push(e), advance() {} }, s => states.push(s), {
      epochMs: 0, source: () => stream, schedule: () => 1, unschedule() {} });
    try {
      stream.emit(type as string, payload);
      assert.equal(stream.closed, true, `${type} must reconnect after invalid recorder time`);
      assert.deepEqual(applied, []);
      assert.match(states.at(-1)!, /invalid .*; reconnecting/);
    } finally { feed.dispose(); }
  }
});
