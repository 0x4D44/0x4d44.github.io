import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEvent, parseRecording, createLiveFeed, createScheduleFeed } from '../src/feed.ts';
import type { EventStream } from '../src/feed.ts';
const good = { kind: 'step', area: 'TEST', descr: 'SYN1', from: 'A', to: 'B' };

test('hostile normalized fields and timestamp properties are rejected, unknown kinds remain readable', () => {
  const bad: unknown[] = [null, [], {}, 0, false, '', '\u0000', '\u202e', 'A/B', 'x'.repeat(65)];
  for (const field of ['area', 'descr', 'from', 'to']) for (const value of bad) {
    assert.throws(() => parseEvent({ ...good, [field]: value }), `${field}: ${JSON.stringify(value)}`);
  }
  for (const time of [NaN, Infinity, -Infinity, -1, 8.64e15 + 1, '1000', {}, []]) {
    assert.throws(() => parseEvent({ ...good, time }));
    assert.throws(() => parseRecording(JSON.stringify({ t: time, e: good })));
  }
  assert.deepEqual(parseEvent({ kind: 'cancel', area: 'TEST', from: 'A', descr: '' }), { kind: 'cancel', area: 'TEST', from: 'A', descr: '' });
  assert.equal(parseEvent({ ...good, descr: '****' }).descr, '****');
  assert.deepEqual(parseEvent({ kind: 'future-kind', area: 'TEST', extension: 42 }), { kind: 'future-kind', area: 'TEST', extension: 42 });
  let seed = 42;
  for (let n = 0; n < 256; n++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const e = { ...good, descr: `S${seed.toString(36)}` };
    assert.deepEqual(parseEvent(e), e);
    assert.throws(() => parseEvent({ ...e, to: `${e.to}${String.fromCharCode(seed % 32)}` }));
  }
});

test('recording bounds and snapshot bounds reject hostile pictures atomically', () => {
  assert.throws(() => parseRecording(JSON.stringify({ t: 0, e: { ...good, extra: 'x'.repeat(1_048_576) } })), /line 1/);
  assert.throws(() => parseEvent({ kind: 'snapshot', area: 'TEST', berths: Object.fromEntries(Array.from({ length: 10_001 }, (_, i) => [`B${i}`, 'SYN1'])) }));
  for (const berths of [{ 'B\u0000': 'SYN1' }, { A: '\u202e' }, { A: '' }]) assert.throws(() => parseEvent({ kind: 'snapshot', area: 'TEST', berths }));
  assert.throws(() => parseEvent({ kind: 'snapshot', area: 'TEST', berths: {}, sclass: { addresses: 1, data: { '01': 'not-hex' } } }));
  const rows = [3, 1, 3, 2, 0].map((t, i) => ({ t, e: { ...good, descr: `S${i}` } }));
  assert.deepEqual(parseRecording(rows.map(r => JSON.stringify(r)).join('\n')).map(r => r.e.descr), ['S4', 'S1', 'S3', 'S0', 'S2']);
});

class Stream implements EventStream {
  onopen: EventStream['onopen'] = null; onerror: EventStream['onerror'] = null; closed = false;
  listeners = new Map<string, (event: MessageEvent<string>) => void>();
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void) { this.listeners.set(type, listener); }
  close() { this.closed = true; }
  emit(type: string, data: string) { this.listeners.get(type)?.({ data } as MessageEvent<string>); }
}
test('malformed SSE cannot throw into the page or replace the last good scene; ping reveals stale data', () => {
  for (const type of ['td', 'trust', 'snapshot']) for (const data of ['null', '{', '<html>error</html>', 'x'.repeat(1_048_577)]) {
    let now = 0; const states: string[] = [], applied: unknown[] = [], streams: Stream[] = [];
    const jobs = new Map<object, { fn: () => void; ms: number }>();
    const feed = createLiveFeed({ apply: e => applied.push(e), advance() {} }, s => states.push(s), {
      now: () => now, source: () => { const stream = new Stream(); streams.push(stream); return stream; },
      schedule: (fn, ms) => { const token = {}; jobs.set(token, { fn, ms }); return token; },
      unschedule: token => { jobs.delete(token as object); },
    });
    try {
      const stream = streams[0]!; stream.onopen?.({} as Event);
      stream.emit('td', JSON.stringify({ e: good })); const count = applied.length;
      assert.doesNotThrow(() => stream.emit(type, data));
      assert.equal(applied.length, count);
      assert.equal(stream.closed, true, 'a malformed stream is explicitly replaced');
      assert.match(states.at(-1)!, /invalid.*reconnecting/);
      now = 60_000;
      [...jobs.values()].find(job => job.ms === 500)!.fn();
      const recovered = streams[1]!; recovered.onopen?.({} as Event);
      recovered.emit('ping', '{"t":60000}'); assert.match(states.at(-1)!, /stale.*60s/i);
      recovered.emit('td', JSON.stringify({ e: good })); assert.doesNotMatch(states.at(-1)!, /stale|invalid/);
    } finally { feed.dispose(); }
  }
});

test('absent relay and HTML timetable responses retry and recover without losing the last good timetable', async () => {
  let phase = 0; const jobs: { fn: () => void; ms: number }[] = [];
  const calls: string[] = [];
  const feed = createScheduleFeed({ mode: 'live', hostname: 'localhost', now: () => Date.parse('2026-11-08T12:00Z'),
    schedule: (fn, ms) => { jobs.push({ fn, ms }); return jobs.length; }, unschedule() {},
    fetchImpl: (async input => { calls.push(String(input));
      if (phase === 0) throw new Error('relay killed');
      if (String(input).endsWith('health')) return Response.json({ ok: true });
      return phase === 2 ? new Response('<html>bad gateway</html>', { status: 502 }) : Response.json({ date: '2026-11-08', calls: [] });
    }) as typeof fetch });
  await feed.refresh(); assert.equal(jobs.length, 1, 'failed discovery must retry');
  phase = 1; jobs.shift()!.fn(); await feed.refresh(); assert.deepEqual(feed.services(), []);
  phase = 2; await feed.refresh(); assert.deepEqual(feed.services(), []);
  phase = 1; await feed.refresh(); assert.deepEqual(feed.services(), []);
  assert.ok(calls.length >= 5); feed.dispose();
});

test('upstream disconnect stays honest while relay pings continue and recovery clears stale status', () => {
  let now = 0; const stream = new Stream(), states: string[] = [];
  const feed = createLiveFeed({ apply() {}, advance() {} }, state => states.push(state), { source: () => stream, now: () => now, schedule: () => 1, unschedule() {} });
  stream.onopen?.({} as Event);
  stream.emit('snapshot', JSON.stringify({ area: 'TEST', berths: {} }));
  stream.emit('ping', JSON.stringify({ t: 100_000, feed: 'disconnected', lastEventAt: 40_000 }));
  assert.match(states.at(-1)!, /upstream disconnected; stale data 60s old/);
  now = 5000; stream.emit('ping', JSON.stringify({ t: 105_000, feed: 'disconnected', lastEventAt: 40_000 }));
  assert.match(states.at(-1)!, /stale data 65s old/);
  stream.emit('ping', JSON.stringify({ t: 105_000, feed: 'connected', lastEventAt: 105_000 }));
  stream.emit('td', JSON.stringify({ e: good }));
  assert.equal(states.at(-1), 'connected'); assert.doesNotMatch(states.at(-1)!, /stale/);
  feed.dispose();
});

test('a ten second stalled timetable request aborts and recovers through injected timeout', async () => {
  let signal: AbortSignal | undefined, timedOut = new AbortController(), phase = 0;
  const delays: number[] = [];
  const feed = createScheduleFeed({ mode: 'live', hostname: 'localhost', relayPresent: true, now: () => Date.parse('2026-11-08T12:00Z'),
    timeoutSignal: ms => { delays.push(ms); return timedOut.signal; }, schedule: () => 1, unschedule() {},
    fetchImpl: (async (_url, init) => {
      signal = init?.signal ?? undefined;
      if (phase) return Response.json({ date: '2026-11-08', calls: [] });
      return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
    }) as typeof fetch });
  const pending = feed.refresh(); assert.equal(signal?.aborted, false); assert.deepEqual(delays, [10_000]);
  timedOut.abort(new Error('ten second response stall')); await pending;
  assert.equal(feed.services(), undefined);
  phase = 1; timedOut = new AbortController(); await feed.refresh(); assert.deepEqual(feed.services(), []);
  feed.dispose();
});

test('a stream that never opens times out and reconnects without losing the scene', () => {
  let now = 0;
  const jobs = new Map<object, { fn: () => void; ms: number }>();
  const streams: Stream[] = [], states: string[] = [];
  const feed = createLiveFeed({ apply() { assert.fail('no event was delivered'); }, advance() {} }, state => states.push(state), {
    source: () => { const stream = new Stream(); streams.push(stream); return stream; }, now: () => now,
    schedule: (fn, ms) => { const token = {}; jobs.set(token, { fn, ms }); return token; },
    unschedule: token => { jobs.delete(token as object); },
  });
  try {
    assert.equal(jobs.size, 1, 'connection establishment must also be bounded');
    now = 15_001;
    [...jobs.values()][0]!.fn();
    assert.equal(streams[0]!.closed, true);
    assert.match(states.at(-1)!, /reconnecting; retry in 0.5s/);
    [...jobs.values()].find(job => job.ms === 500)!.fn();
    assert.equal(streams.length, 2);
    streams[1]!.onopen?.({} as Event);
    assert.match(states.at(-1)!, /relay connected/);
  } finally { feed.dispose(); }
});

test('healthy upstream retains the connected API without refreshing consumers for every message', () => {
  const stream = new Stream(), states: string[] = [];
  const feed = createLiveFeed({ apply() {}, advance() {} }, state => states.push(state), {
    source: () => stream, now: () => 0, schedule: () => 1, unschedule() {},
  });
  try {
    stream.onopen?.({} as Event);
    stream.emit('ping', JSON.stringify({ t: 1000, feed: 'connected', lastEventAt: 1000 }));
    assert.equal(states.at(-1), 'connected', 'main and the evidence pack use this healthy state');
    for (let i = 0; i < 10; i++) {
      stream.emit('td', JSON.stringify({ e: good }));
      stream.emit('ping', JSON.stringify({ t: 1000, feed: 'connected', lastEventAt: 1000 }));
    }
    assert.equal(states.filter(state => state === 'connected').length, 1);
  } finally { feed.dispose(); }
});

test('legacy timestamp-only heartbeats trigger connected consumers without hiding stale or explicit upstream state', () => {
  let now = 0;
  const stream = new Stream(), states: string[] = [];
  const feed = createLiveFeed({ apply() {}, advance() {} }, state => states.push(state), {
    source: () => stream, now: () => now, schedule: () => 1, unschedule() {},
  });
  try {
    stream.onopen?.({} as Event);
    stream.emit('ping', JSON.stringify({ t: 1000 }));
    assert.equal(states.at(-1), 'connected', 'main refreshes timetable and preserves signals on this exact state');
    stream.emit('td', JSON.stringify({ e: good }));
    stream.emit('ping', JSON.stringify({ t: 2000 }));
    assert.equal(states.filter(state => state === 'connected').length, 1);
    now = 60_000; stream.emit('ping', JSON.stringify({ t: 61_000 }));
    assert.match(states.at(-1)!, /stale data 60s old/);
    stream.emit('ping', JSON.stringify({ t: 61_000, feed: 'disconnected', lastEventAt: 1000 }));
    now = 65_000; stream.emit('ping', JSON.stringify({ t: 66_000 }));
    assert.match(states.at(-1)!, /upstream disconnected; stale data 65s old/);
    stream.emit('ping', JSON.stringify({ t: 66_000, feed: 'connected', lastEventAt: 66_000 }));
    assert.equal(states.at(-1), 'connected');
  } finally { feed.dispose(); }
});

// Full cache/HTTP shape from the schedule generator; every value is synthetic.
function legacyTimetable() {
  const date = '2026-11-08', departureMs = Date.parse(`${date}T12:00Z`);
  return { date, tiploc: 'SYNSTATION', stanox: '00000', timeZone: 'Europe/London', fetchedAtMs: departureMs,
    source: 'SYNTHETIC', records: 2, lines: 2, bytes: 1000,
    calls: [{ uid: 'SYN001', headcode: 'SYN1', operator: 'SYN', category: 'XX', date, serviceDate: date,
      startDate: date, endDate: date, stp: 'P', platform: null, origin: 'SYNORIG', destination: 'SYNDEST',
      originName: 'Synthetic Origin', destinationName: 'Synthetic Destination',
      arrival: null, departure: '12:00', publicArrival: null, publicDeparture: '12:00',
      arrivalMs: null, departureMs, publicArrivalMs: null, publicDepartureMs: departureMs }] };
}

// Complete realtime shape emitted by relay/trust.mjs:enrich, with synthetic values.
function enrichedTimetable() {
  const doc = legacyTimetable(), at = doc.fetchedAtMs;
  return { ...doc, realtime: [], calls: doc.calls.map(call => ({ ...call, realtime: {
    trainId: 'SYNTRAIN', headcode: call.headcode, eventType: 'DEPARTURE',
    actualArrivalMs: at - 60_000, actualDepartureMs: at + 60_000,
    publicArrivalMs: at - 120_000, publicDepartureMs: at,
    variationMinutes: 1, platform: '4', matchMethod: 'activation', updatedAtMs: at + 60_000,
  } })) };
}

test('HTTP timetable enrichment accepts numeric public TRUST times in live and strips all live facts in replay', async () => {
  for (const mode of ['live', 'replay'] as const) {
    const doc = enrichedTimetable();
    const feed = createScheduleFeed({ mode, date: doc.date, hostname: 'localhost', relayPresent: true,
      now: () => doc.fetchedAtMs, schedule: () => 1, unschedule() {},
      fetchImpl: (async () => Response.json(doc)) as typeof fetch });
    try {
      await feed.refresh();
      assert.deepEqual(feed.services(), mode === 'live' ? doc.calls : doc.calls.map(call => ({ ...call, realtime: null })));
    } finally { feed.dispose(); }
  }
});

test('public TRUST timestamps reject malformed values without replacing accepted enriched bookings', async () => {
  const doc = enrichedTimetable();
  let response: unknown = doc;
  const feed = createScheduleFeed({ mode: 'live', hostname: 'localhost', relayPresent: true,
    now: () => doc.fetchedAtMs, schedule: () => 1, unschedule() {},
    fetchImpl: (async () => Response.json(response)) as typeof fetch });
  try {
    await feed.refresh(); assert.deepEqual(feed.services(), doc.calls);
    for (const key of ['publicArrivalMs', 'publicDepartureMs']) for (const value of ['123', -1, 8.64e15 + 1, {}, []]) {
      response = { ...doc, calls: doc.calls.map(call => ({ ...call, realtime: { ...call.realtime, [key]: value } })) };
      await feed.refresh(); assert.deepEqual(feed.services(), doc.calls, `${key}: ${JSON.stringify(value)}`);
    }
  } finally { feed.dispose(); }
});

test('full legacy timetable documents need no realtime or new relay metadata in live and replay', async () => {
  for (const mode of ['live', 'replay'] as const) {
    const doc = legacyTimetable();
    let ready = mode === 'replay', requests = 0;
    const feed = createScheduleFeed({ mode, date: doc.date, hostname: 'localhost', relayPresent: true,
      now: () => doc.fetchedAtMs, schedule: () => 1, unschedule() {},
      fetchImpl: (async () => { requests++; return ready ? Response.json(doc) : new Response(null, { status: 503 }); }) as typeof fetch });
    const stream = new Stream();
    const live = createLiveFeed({ apply() {}, advance() {} }, state => {
      if (state === 'connected') void feed.refresh(); // Same transition consumed by main.
    }, { source: () => stream, now: () => 0, schedule: () => 1, unschedule() {} });
    try {
      await feed.refresh();
      if (mode === 'live') {
        assert.equal(feed.services(), undefined);
        ready = true; stream.onopen?.({} as Event);
        stream.emit('ping', JSON.stringify({ t: doc.fetchedAtMs }));
        assert.equal(requests, 2, 'legacy connected transition refreshes a previously missing timetable');
        await feed.refresh();
      }
      assert.deepEqual(feed.services(), mode === 'live' ? doc.calls : doc.calls.map(call => ({ ...call, realtime: null })));
    } finally { live.dispose(); feed.dispose(); }
  }
});

test('malformed legacy timetable documents remain rejected atomically with the previous timetable retained', async () => {
  const doc = legacyTimetable();
  let response: unknown = doc;
  const feed = createScheduleFeed({ mode: 'live', hostname: 'localhost', relayPresent: true,
    now: () => doc.fetchedAtMs, schedule: () => 1, unschedule() {},
    fetchImpl: (async () => Response.json(response)) as typeof fetch });
  try {
    await feed.refresh(); assert.deepEqual(feed.services(), doc.calls);
    for (const invalid of [null, [], { ...doc, date: '2026-11-07' }, { ...doc, calls: {} },
      { ...doc, calls: [doc.calls[0], { ...doc.calls[0], departureMs: 'bad' }] },
      { ...doc, calls: [{ ...doc.calls[0], originName: '\u202eunsafe' }] }]) {
      response = invalid; await feed.refresh(); assert.deepEqual(feed.services(), doc.calls);
    }
  } finally { feed.dispose(); }
});
