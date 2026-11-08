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

const MAX_EVENT_CHARS = 1_048_576;
const MAX_SNAPSHOT_BERTHS = 10_000;
const MAX_SCLASS_ADDRESSES = 4096;
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const description = (v: unknown): v is string => identifier(v) || v === '****';
const epoch = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 8.64e15;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function parseMessage(text: string): unknown {
  if (text.length > MAX_EVENT_CHARS) throw new Error('relay event too large');
  return JSON.parse(text);
}

export function parseEvent(value: unknown): MotionEvent {
  if (!object(value)) throw new Error('invalid TD event');
  const e = value;
  if (!identifier(e.kind) || !identifier(e.area)) throw new Error('invalid TD event');
  if (['step', 'interpose', 'cancel'].includes(e.kind) && !description(e.descr) && !(e.kind === 'cancel' && e.descr === '')) throw new Error('invalid train description');
  if (['step', 'cancel'].includes(e.kind) && !identifier(e.from) && !(e.kind === 'cancel' && e.from === '')) throw new Error('invalid from berth');
  if (['step', 'interpose'].includes(e.kind) && !identifier(e.to)) throw new Error('invalid to berth');
  for (const key of ['time', 'lastEventTime', 'plannedMs', 'actualMs', 'publicMs', 'receivedAtMs']) {
    if (e[key] !== undefined && e[key] !== null && !epoch(e[key])) throw new Error('invalid event timestamp');
  }
  if (e.kind === 'sclass' && (typeof e.address !== 'string' || !/^[0-9a-f]{1,4}$/i.test(e.address) || typeof e.data !== 'string' || !/^(?:[0-9a-f]{2}){1,256}$/i.test(e.data))) throw new Error('invalid S-class bytes');
  if (e.kind === 'trust') {
    if (e.cancelled !== undefined && typeof e.cancelled !== 'boolean') throw new Error('invalid TRUST cancellation');
    for (const key of ['uid', 'headcode', 'trainId', 'type', 'eventType', 'platform', 'matchMethod', 'date', 'serviceDate']) {
      const v = e[key];
      if (v != null && (typeof v !== 'string' || v.length > 64 || /[^\x20-\x7e]/.test(v))) throw new Error('invalid TRUST field');
    }
    if (e.variationMinutes != null && (typeof e.variationMinutes !== 'number' || !Number.isFinite(e.variationMinutes))) throw new Error('invalid TRUST variation');
  }
  if (e.kind === 'snapshot') {
    snapshotEvents(e); // Reject incomplete pictures before any part can change the world.
    if (e.sclass !== undefined) {
      const s = e.sclass;
      if (!object(s) || !Number.isInteger(s.addresses) || (s.addresses as number) < 0 || (s.addresses as number) > MAX_SCLASS_ADDRESSES || !object(s.data)) throw new Error('invalid snapshot S-class bytes');
      const bytes = Object.entries(s.data);
      if (bytes.length > MAX_SCLASS_ADDRESSES || bytes.some(([address, data]) => !/^[0-9a-f]{1,4}$/i.test(address) || typeof data !== 'string' || !/^(?:[0-9a-f]{2}){1,256}$/i.test(data))) throw new Error('invalid snapshot S-class bytes');
    }
  }
  return e as unknown as MotionEvent;
}

export function parseRecording(text: string): RecordedEvent[] {
  // Keep parsing separate from body transfer and later graph setup in startup profiles.
  performance.mark('kx:recording-parse-start');
  try {
    const rows: RecordedEvent[] = [];
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        const row = parseMessage(line) as { t: unknown; e: unknown };
        if (!row || !epoch(row.t)) throw new Error('invalid timestamp');
        rows.push({ t: row.t, e: parseEvent(row.e) });
      } catch { throw new Error(`invalid recording line ${index + 1}`); }
    }
    // Stable sort preserves the recorder's order for events received in the same batch.
    return rows.sort((a, b) => a.t - b.t);
  } finally { performance.mark('kx:recording-parse-end'); }
}

export function backoffMs(attempt: number): number {
  return Math.min(30_000, 500 * 2 ** Math.min(16, Math.max(0, Math.floor(attempt))));
}

/** Reconcile reconnect snapshots: absent descriptions fade, retained ones never relocate. */
export function snapshotEvents(value: unknown, previous: readonly string[] = []): MotionEvent[] {
  if (!value || typeof value !== 'object') throw new Error('invalid snapshot');
  const s = value as { area?: unknown; berths?: unknown };
  if (!identifier(s.area) || !object(s.berths) || Object.keys(s.berths).length > MAX_SNAPSHOT_BERTHS) throw new Error('invalid snapshot');
  const events: MotionEvent[] = [];
  const present = new Set<string>();
  for (const [to, descr] of Object.entries(s.berths).sort(([a], [b]) => a.localeCompare(b))) {
    if (!identifier(to) || !description(descr)) throw new Error('invalid snapshot description');
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
    if (!['step', 'interpose', 'cancel'].includes(event.kind)) { apply(event, atMs); return; }
    if (!descriptions.has(event.area)) {
      if (descriptions.size >= 256) throw new Error('too many TD areas');
      descriptions.set(event.area, new Set());
    }
    const present = descriptions.get(event.area)!;
    if (event.descr) {
      if (event.kind === 'cancel') present.delete(event.descr);
      else if (event.kind === 'step' || event.kind === 'interpose') {
        if (!present.has(event.descr) && present.size >= MAX_SNAPSHOT_BERTHS) throw new Error('too many TD descriptions');
        present.add(event.descr);
      }
    }
    apply(event, atMs);
  };
  return (event: MotionEvent, atMs: number): void => {
    if (event.kind === 'snapshot') {
      const changes = snapshotEvents(event, [...descriptions.get(event.area) ?? []]);
      // Preserve the complete S-class picture for consumers alongside motion. Motion
      // ignores the raw snapshot and receives the same interposes/cancels in both modes.
      if (!descriptions.has(event.area) && descriptions.size >= 256) throw new Error('too many TD areas');
      descriptions.set(event.area, new Set(Object.values((event as SnapshotEvent).berths)));
      apply(event, atMs);
      for (const change of changes) apply(change, atMs);
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
  let lastDataAt: number | undefined, upstream: string | undefined;
  let lastStatus: string | undefined;
  const report = (value: string): void => {
    // main refreshes the timetable and resets stale signals on connection transitions.
    if (lastStatus !== value) { lastStatus = value; status(value); }
  };
  const paintConnection = (): void => {
    const age = lastDataAt === undefined ? undefined : Math.max(0, Math.floor((now() - lastDataAt) / 1000));
    const stale = age !== undefined && age > 15 ? `; stale data ${age}s old` : '';
    report(upstream === 'connected' && !stale ? 'connected' : `relay connected; upstream ${upstream ?? 'unconfirmed'}${stale}`);
  };
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
  const deliver = (e: MotionEvent): void => { timeline.deliver(e); lastDataAt = now(); paintConnection(); };
  const retry = (): void => {
    opened = false;
    stopWatchdog();
    stream?.close(); stream = undefined;
    if (disposed || timer !== undefined) return;
    const delay = backoffMs(attempt++);
    report(`reconnecting; retry in ${delay / 1000}s${lastDataAt === undefined ? '' : `; last data ${Math.max(0, Math.floor((now() - lastDataAt) / 1000))}s old`}`);
    timer = schedule(() => { timer = undefined; connect(); }, delay);
  };
  const connect = (): void => {
    if (disposed) return;
    report(attempt ? 'reconnecting' : 'connecting');
    try { stream = source('/relay/events'); } catch { retry(); return; }
    const current = stream;
    // An HTTP/SSE handshake can stall before onopen, just as an open stream can go quiet.
    lastMessageAt = now();
    watch(current);
    current.onopen = () => { if (!disposed && stream === current) { opened = true; received(current); attempt = 0; upstream = undefined; paintConnection(); } };
    current.onerror = () => { if (stream === current) retry(); };
    current.addEventListener('snapshot', (event) => {
      if (disposed || stream !== current) return;
      received(current);
      try { deliver(parseEvent({ ...(parseMessage(event.data) as Record<string, unknown>), kind: 'snapshot' })); }
      catch { report('invalid relay snapshot'); }
    });
    current.addEventListener('td', (event) => {
      if (disposed || stream !== current) return;
      received(current);
      try { deliver(parseEvent((parseMessage(event.data) as { e: unknown }).e)); }
      catch { report('invalid relay event'); }
    });
    current.addEventListener('trust', (event) => {
      if (disposed || stream !== current) return;
      received(current);
      try { deliver(parseEvent((parseMessage(event.data) as { e: unknown }).e)); }
      catch { report('invalid TRUST event'); }
    });
    current.addEventListener('ping', (event) => {
      if (disposed || stream !== current) return;
      received(current);
      try {
        const ping = parseMessage(event.data);
        if (object(ping) && ['connecting', 'connected', 'disconnected', 'disabled'].includes(String(ping.feed))) {
          upstream = String(ping.feed);
          // Remote receive time establishes age even before this browser sees a TD event.
          if (epoch(ping.lastEventAt) && epoch(ping.t)) {
            lastDataAt = now() - Math.max(0, ping.t - ping.lastEventAt);
          }
        } else if (object(ping) && !Object.hasOwn(ping, 'feed') && epoch(ping.t) && upstream === undefined) {
          // Older relays report only their heartbeat time. Preserve their connected API,
          // without overriding explicit upstream metadata or resetting the data age.
          upstream = 'connected';
        }
        paintConnection();
      } catch { report('invalid relay heartbeat'); }
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
  timeoutSignal?: (ms: number) => AbortSignal;
}

/** Bound transferred JSON before decoding, including chunked bodies without Content-Length. */
async function boundedJson(response: Response): Promise<unknown> {
  const maximum = 4 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > maximum) throw new Error('timetable too large');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('missing timetable');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('timetable too large');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function validBoardService(value: unknown): value is BoardService {
  if (!object(value)) return false;
  if (value.cancelled !== undefined && typeof value.cancelled !== 'boolean') return false;
  const text = (v: unknown): boolean => typeof v === 'string' && v.length <= 256 && !/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(v);
  for (const key of ['uid', 'headcode', 'operator', 'category', 'origin', 'destination', 'date', 'serviceDate', 'startDate', 'endDate', 'stp']) if (!text(value[key])) return false;
  for (const key of ['arrival', 'departure', 'publicArrival', 'publicDeparture', 'platform', 'originName', 'destinationName']) if (value[key] != null && !text(value[key])) return false;
  for (const key of ['arrivalMs', 'departureMs', 'publicArrivalMs', 'publicDepartureMs']) if (value[key] !== null && !epoch(value[key])) return false;
  if (value.realtime != null) {
    if (!object(value.realtime)) return false;
    for (const [key, field] of Object.entries(value.realtime)) {
      if (field == null) continue;
      if (['actualArrivalMs', 'actualDepartureMs', 'publicArrivalMs', 'publicDepartureMs', 'updatedAtMs'].includes(key) ? !epoch(field)
        : key === 'variationMinutes' ? typeof field !== 'number' || !Number.isFinite(field)
          : key === 'cancelled' ? typeof field !== 'boolean'
          : !text(field)) return false;
    }
  }
  return true;
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
      if (!present || disposed) { if (!present) misses++; return; }
      const date = options.mode === 'replay' ? options.date ?? '' : ukDate(now());
      if (!validDate(date)) return;
      if (currentDate !== date) { currentDate = date; calls = undefined; changed(); }
      const signal = AbortSignal.any([abort.signal, (options.timeoutSignal ?? AbortSignal.timeout)(10_000)]);
      const response = await fetchImpl(`/relay/schedule?date=${date}`, { cache: 'no-store', signal });
      if (signal.aborted) throw new Error('timetable request expired');
      if (!response.ok) {
        misses++; if (options.mode === 'replay' && response.status === 404) settled = true;
        if (!calls) changed(); return;
      }
      const doc = await boundedJson(response) as { date: string; calls: BoardService[] };
      if (disposed || signal.aborted) return;
      if (!doc || doc.date !== date || !Array.isArray(doc.calls) || doc.calls.length > 10_000 || doc.calls.some(call => !validBoardService(call))) throw new Error('invalid timetable');
      misses = 0;
      calls = options.mode === 'replay' ? doc.calls.map(call => ({ ...call, realtime: null })) : doc.calls;
      for (const row of observed) calls = applyBoardTrust(calls, row.event);
      changed();
    })().catch(() => { misses++; /* Keep known bookings during a dropped connection. */ }).finally(() => {
      pending = undefined;
      if (disposed || settled) return;
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
      let input: Record<string, unknown>;
      try { input = parseEvent({ ...(event as Record<string, unknown>), area: (event as Record<string, unknown>).area ?? 'TRUST' }) as unknown as Record<string, unknown>; if (JSON.stringify(input).length > MAX_EVENT_CHARS) return; } catch { return; }
      const fact = typeof input.receivedAtMs === 'number' && Number.isFinite(input.receivedAtMs) ? input
        : { ...input, receivedAtMs: options.mode === 'replay' ? atMs : now() };
      const keys = ['kind', 'area', 'type', 'uid', 'headcode', 'trainId', 'serviceDate', 'date', 'eventType', 'plannedMs', 'actualMs', 'publicMs', 'variationMinutes', 'platform', 'matchMethod', 'receivedAtMs', 'cancelled'];
      const compact = Object.fromEntries(keys.filter(key => fact[key] !== undefined).map(key => [key, fact[key]]));
      observed.push({ event: compact, atMs });
      if (observed.length > 10_000) observed.shift();
      if (calls) { calls = applyBoardTrust(calls, fact); changed(); }
    },
    dispose(): void { disposed = true; abort.abort(); if (timer !== undefined) unschedule(timer); },
  };
}
