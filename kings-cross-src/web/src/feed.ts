// Browser I/O lives here; parsing, replay time and event delivery also run in Node tests.
// Live and replay both deliver normalised TD events through the same simulation timeline.
import type { MotionEvent } from '../../core/motion.ts';
import { validDate } from '../../core/schedule.ts';
import { applyBoardTrust } from './board.ts';
import type { BoardService } from './board.ts';

export interface SnapshotEvent extends MotionEvent {
  kind: 'snapshot';
  berths: Record<string, string>;
  sclass?: { addresses: number; data: Record<string, string> };
}
export interface RecordedEvent { t: number; e: MotionEvent | SnapshotEvent }
export interface MotionSink { apply(event: MotionEvent, nowMs: number): void; advance(seconds: number): void }
export interface TrainFeed { advance(realSeconds: number): void; dispose(): void; timeMs(): number }
export type FeedStatus = (state: string) => void;
export function trainSettings(params: URLSearchParams): { mode: 'auto' | 'live' | 'replay' | 'demo' | 'none'; date: string; speed: number } {
  const requested = params.get('trains');
  const mode = requested === null ? 'auto' : requested === 'live' || requested === 'replay' || requested === 'none' ? requested : 'demo';
  const date = params.get('date') ?? '';
  const speed = Number(params.get('speed') ?? 1);
  if (mode === 'replay' && (!/^\d{8}$/.test(date) || !Number.isFinite(speed) || speed <= 0)) throw new Error('replay needs date=YYYYMMDD and a positive speed');
  return { mode, date, speed };
}

export function parseEvent(value: unknown): MotionEvent {
  if (!value || typeof value !== 'object') throw new Error('invalid TD event');
  const e = value as Record<string, unknown>;
  if (typeof e.kind !== 'string' || typeof e.area !== 'string') throw new Error('invalid TD event');
  if (['step', 'interpose', 'cancel'].includes(e.kind) && typeof e.descr !== 'string') throw new Error('missing train description');
  if (['step', 'cancel'].includes(e.kind) && typeof e.from !== 'string') throw new Error('missing from berth');
  if (['step', 'interpose'].includes(e.kind) && typeof e.to !== 'string') throw new Error('missing to berth');
  if (e.kind === 'snapshot') {
    snapshotEvents(e); // Reject incomplete pictures before any part can change the world.
    if (e.sclass !== undefined) {
      const s = e.sclass as SnapshotEvent['sclass'];
      if (!s || !Number.isInteger(s.addresses) || s.addresses < 0 || !s.data || typeof s.data !== 'object' || Array.isArray(s.data) || Object.values(s.data).some((v) => typeof v !== 'string')) throw new Error('invalid snapshot S-class bytes');
    }
  }
  return e as unknown as MotionEvent;
}

export function parseRecording(text: string): RecordedEvent[] {
  const rows: RecordedEvent[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { t: unknown; e: unknown };
      if (!row || typeof row.t !== 'number' || !Number.isFinite(row.t)) throw new Error('invalid timestamp');
      rows.push({ t: row.t, e: parseEvent(row.e) });
    } catch { throw new Error(`invalid recording line ${index + 1}`); }
  }
  // Stable sort preserves the recorder's order for events received in the same batch.
  return rows.sort((a, b) => a.t - b.t);
}

export function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** Math.min(16, Math.max(0, Math.floor(attempt))));
}

/** Reconcile reconnect snapshots: absent descriptions fade, retained ones never relocate. */
export function snapshotEvents(value: unknown, previous: readonly string[] = []): MotionEvent[] {
  if (!value || typeof value !== 'object') throw new Error('invalid snapshot');
  const s = value as { area?: unknown; berths?: unknown };
  if (typeof s.area !== 'string' || !s.berths || typeof s.berths !== 'object' || Array.isArray(s.berths)) throw new Error('invalid snapshot');
  const events: MotionEvent[] = [];
  const present = new Set<string>();
  for (const [to, descr] of Object.entries(s.berths).sort(([a], [b]) => a.localeCompare(b))) {
    if (typeof descr !== 'string') throw new Error('invalid snapshot description');
    present.add(descr);
    events.push({ kind: 'interpose', area: s.area, descr, to });
  }
  for (const descr of previous) if (!present.has(descr)) events.push({ kind: 'cancel', area: s.area, descr, from: '' });
  return events;
}

/** One reconciliation path for live reconnects, recorded checkpoints and the offline audit. */
export function createEventReconciler(apply: MotionSink['apply']) {
  const descriptions = new Map<string, Set<string>>();
  const applyOne = (event: MotionEvent, atMs: number): void => {
    if (!descriptions.has(event.area)) descriptions.set(event.area, new Set());
    const present = descriptions.get(event.area)!;
    if (event.descr) {
      if (event.kind === 'cancel') present.delete(event.descr);
      else if (event.kind === 'step' || event.kind === 'interpose') present.add(event.descr);
    }
    apply(event, atMs);
  };
  return (event: MotionEvent, atMs: number): void => {
    if (event.kind === 'snapshot') {
      const changes = snapshotEvents(event, [...descriptions.get(event.area) ?? []]);
      // Preserve the complete S-class picture for consumers alongside motion. Motion
      // ignores the raw snapshot and receives the same interposes/cancels in both modes.
      apply(event, atMs);
      for (const change of changes) applyOne(change, atMs);
    } else applyOne(event, atMs);
  };
}

/** No wall clock here: callers supply elapsed time, scaled once by replay speed. */
export function createReplayClock(rows: readonly RecordedEvent[], speed = 1) {
  if (!Number.isFinite(speed) || speed <= 0) throw new Error('replay speed must be positive');
  let time = rows[0]?.t ?? 0, cursor = 0;
  return {
    timeMs: (): number => time,
    done: (): boolean => cursor === rows.length,
    advance(seconds: number): RecordedEvent[] {
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('elapsed time must be nonnegative');
      time += seconds * speed * 1000;
      const ready: RecordedEvent[] = [];
      while (cursor < rows.length && rows[cursor]!.t <= time) ready.push(rows[cursor++]!);
      return ready;
    },
  };
}

export function createTimeline(sink: MotionSink, startMs = 0) {
  let time = startMs;
  const reconcile = createEventReconciler((event, atMs) => sink.apply(event, atMs));
  const advanceTo = (nextMs: number): void => {
    if (!Number.isFinite(nextMs)) throw new Error('timeline time must be finite');
    const next = Math.max(time, nextMs);
    if (next > time) sink.advance((next - time) / 1000);
    time = next;
  };
  return {
    timeMs: (): number => time,
    advanceTo,
    deliver(event: MotionEvent, atMs = time): void { advanceTo(atMs); reconcile(event, time); },
  };
}

export function createReplayFeed(rows: readonly RecordedEvent[], speed: number, sink: MotionSink, status: FeedStatus): TrainFeed {
  const clock = createReplayClock(rows, speed);
  const timeline = createTimeline(sink, clock.timeMs());
  let disposed = false;
  const dispatch = (dt: number): void => {
    for (const row of clock.advance(dt)) timeline.deliver(row.e, row.t);
    timeline.advanceTo(clock.timeMs());
    status(clock.done() ? 'recording ended' : 'playing');
  };
  dispatch(0);
  return { advance: (dt) => { if (!disposed) dispatch(dt); }, dispose: () => { disposed = true; }, timeMs: timeline.timeMs };
}

export interface EventStream {
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}
export interface LiveDependencies {
  source?: (url: string) => EventStream;
  schedule?: (fn: () => void, ms: number) => unknown;
  unschedule?: (timer: unknown) => void;
  now?: () => number;
}

export function createLiveFeed(sink: MotionSink, status: FeedStatus, deps: LiveDependencies = {}): TrainFeed {
  const timeline = createTimeline(sink);
  const source = deps.source ?? ((url) => new EventSource(url));
  const schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const unschedule = deps.unschedule ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const now = deps.now ?? (() => performance.now());
  let stream: EventStream | undefined, timer: unknown, disposed = false, attempt = 0;
  let watchdog: unknown, watchdogGeneration = 0, opened = false, lastMessageAt = 0;
  const silenceLimitMs = 15_000;
  const stopWatchdog = (): void => {
    watchdogGeneration++;
    if (watchdog !== undefined) unschedule(watchdog);
    watchdog = undefined;
  };
  const watch = (current: EventStream): void => {
    stopWatchdog();
    const generation = watchdogGeneration;
    // The extra millisecond preserves "more than 15 s" without polling or a zero-delay loop.
    watchdog = schedule(() => {
      if (disposed || stream !== current || generation !== watchdogGeneration) return;
      watchdog = undefined;
      if (now() - lastMessageAt > silenceLimitMs) retry();
      else watch(current);
    }, Math.max(1, silenceLimitMs + 1 - (now() - lastMessageAt)));
  };
  const received = (current: EventStream): void => {
    lastMessageAt = now();
    if (opened) watch(current);
  };
  const deliver = (e: MotionEvent): void => timeline.deliver(e);
  const retry = (): void => {
    opened = false;
    stopWatchdog();
    stream?.close(); stream = undefined;
    if (disposed || timer !== undefined) return;
    const delay = backoffMs(attempt++);
    status(`reconnecting; retry in ${delay / 1000}s`);
    timer = schedule(() => { timer = undefined; connect(); }, delay);
  };
  const connect = (): void => {
    if (disposed) return;
    status(attempt ? 'reconnecting' : 'connecting');
    try { stream = source('/relay/events'); } catch { retry(); return; }
    const current = stream;
    current.onopen = () => { if (!disposed && stream === current) { opened = true; received(current); attempt = 0; status('connected'); } };
    current.onerror = () => { if (stream === current) retry(); };
    current.addEventListener('snapshot', (event) => {
      if (disposed || stream !== current) return;
      received(current);
      try { deliver(parseEvent({ ...JSON.parse(event.data), kind: 'snapshot' })); }
      catch { status('invalid relay snapshot'); }
    });
    current.addEventListener('td', (event) => {
      if (disposed || stream !== current) return;
      received(current);
      try { deliver(parseEvent((JSON.parse(event.data) as { e: unknown }).e)); }
      catch { status('invalid relay event'); }
    });
    current.addEventListener('trust', (event) => {
      if (disposed || stream !== current) return;
      received(current);
      try { deliver(parseEvent((JSON.parse(event.data) as { e: unknown }).e)); }
      catch { status('invalid TRUST event'); }
    });
    current.addEventListener('ping', () => {
      if (disposed || stream !== current) return;
      received(current);
    });
  };
  connect();
  return {
    advance(dt): void {
      if (!Number.isFinite(dt) || dt < 0) throw new Error('elapsed time must be nonnegative');
      if (!disposed) timeline.advanceTo(timeline.timeMs() + dt * 1000);
    },
    dispose(): void { disposed = true; stopWatchdog(); stream?.close(); if (timer !== undefined) unschedule(timer); },
    timeMs: timeline.timeMs,
  };
}

/**
 * The relay listens on loopback only, so only a page served from this machine can reach it.
 * Anywhere else (GitHub Pages) a probe could only 404 and log a console error.
 */
export function relayReachable(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

export async function probeRelay(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl('/relay/health', { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    if (!res.ok) return false;
    const value = await res.json() as { ok?: unknown };
    return value.ok === true;
  } catch { return false; }
}

/** Calendar dates for the station, including the hour when London is ahead of UTC. */
export function ukDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

export interface ScheduleFeedOptions {
  mode: 'live' | 'replay';
  hostname: string;
  date?: string;
  relayPresent?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  unschedule?: (timer: unknown) => void;
  onChange?: (calls: readonly BoardService[] | undefined) => void;
}

/** Bookings refresh independently of TD. Replays use their own recorded TRUST history,
 * never actuals from a live relay response, even when replaying the current day. */
export function createScheduleFeed(options: ScheduleFeedOptions) {
  const fetchImpl = options.fetchImpl ?? fetch, now = options.now ?? Date.now;
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const unschedule = options.unschedule ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const abort = new AbortController();
  let disposed = false, pending: Promise<void> | undefined, timer: unknown;
  let present = options.relayPresent === true, currentDate = '';
  // Unanswered timetable requests in a row. A live relay may cache the day later, so back off;
  // a replay day that is missing now will not appear later, so stop asking.
  let misses = 0, settled = false;
  let calls: readonly BoardService[] | undefined;
  const observed: { event: unknown; atMs: number }[] = [];
  const changed = (): void => options.onChange?.(calls);
  const refresh = (): Promise<void> => {
    if (disposed || !relayReachable(options.hostname)) return Promise.resolve();
    if (pending) return pending;
    if (timer !== undefined) { unschedule(timer); timer = undefined; }
    pending = (async () => {
      if (!present) present = await probeRelay(fetchImpl);
      if (!present || disposed) return;
      const date = options.mode === 'replay' ? options.date ?? '' : ukDate(now());
      if (!validDate(date)) return;
      if (currentDate !== date) { currentDate = date; calls = undefined; changed(); }
      const response = await fetchImpl(`/relay/schedule?date=${date}`, { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10_000)]) });
      if (!response.ok) {
        misses++; if (options.mode === 'replay' && response.status === 404) settled = true;
        if (!calls) changed(); return;
      }
      misses = 0;
      const doc = await response.json() as { date: string; calls: BoardService[] };
      if (disposed) return;
      if (doc.date !== date || !Array.isArray(doc.calls) || doc.calls.some(call => !call || typeof call.uid !== 'string' || typeof call.headcode !== 'string')) throw new Error('invalid timetable');
      calls = options.mode === 'replay' ? doc.calls.map(call => ({ ...call, realtime: null })) : doc.calls;
      for (const row of observed) calls = applyBoardTrust(calls, row.event);
      changed();
    })().catch(() => { /* Keep known bookings during a dropped connection. */ }).finally(() => {
      pending = undefined;
      if (disposed || !present || settled) return;
      const delay = calls ? 60_000 : Math.min(5_000 * 2 ** Math.max(0, misses - 1), 300_000);
      timer = schedule(() => { timer = undefined; void refresh(); }, delay);
    });
    return pending;
  };
  void refresh();
  return {
    refresh,
    services: (): readonly BoardService[] | undefined => calls,
    apply(event: unknown, atMs: number): void {
      if (disposed || !event || typeof event !== 'object' || (event as { kind?: unknown }).kind !== 'trust') return;
      const input = event as Record<string, unknown>;
      const fact = typeof input.receivedAtMs === 'number' && Number.isFinite(input.receivedAtMs) ? input
        : { ...input, receivedAtMs: options.mode === 'replay' ? atMs : now() };
      observed.push({ event: fact, atMs });
      if (observed.length > 10_000) observed.shift();
      if (calls) { calls = applyBoardTrust(calls, fact); changed(); }
    },
    dispose(): void { disposed = true; abort.abort(); if (timer !== undefined) unschedule(timer); },
  };
}
