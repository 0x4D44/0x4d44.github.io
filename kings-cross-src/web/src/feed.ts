// Browser I/O lives here; parsing, replay time and event delivery also run in Node tests.
// Live and replay both deliver normalised TD events through the same simulation timeline.
import type { MotionEvent } from '../../core/motion.ts';

export interface RecordedEvent { t: number; e: MotionEvent }
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
  const advanceTo = (nextMs: number): void => {
    if (!Number.isFinite(nextMs)) throw new Error('timeline time must be finite');
    const next = Math.max(time, nextMs);
    if (next > time) sink.advance((next - time) / 1000);
    time = next;
  };
  return {
    timeMs: (): number => time,
    advanceTo,
    deliver(event: MotionEvent, atMs = time): void { advanceTo(atMs); sink.apply(event, time); },
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
}

export function createLiveFeed(sink: MotionSink, status: FeedStatus, deps: LiveDependencies = {}): TrainFeed {
  const timeline = createTimeline(sink);
  const source = deps.source ?? ((url) => new EventSource(url));
  const schedule = deps.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const unschedule = deps.unschedule ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  let stream: EventStream | undefined, timer: unknown, disposed = false, attempt = 0;
  const descriptions = new Set<string>();
  const deliver = (e: MotionEvent): void => {
    if (e.descr) {
      if (e.kind === 'cancel') descriptions.delete(e.descr);
      else if (e.kind === 'step' || e.kind === 'interpose') descriptions.add(e.descr);
    }
    timeline.deliver(e);
  };
  const retry = (): void => {
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
    current.onopen = () => { if (!disposed && stream === current) { attempt = 0; status('connected'); } };
    current.onerror = () => { if (stream === current) retry(); };
    current.addEventListener('snapshot', (event) => {
      if (disposed || stream !== current) return;
      try { for (const e of snapshotEvents(JSON.parse(event.data), [...descriptions])) deliver(e); }
      catch { status('invalid relay snapshot'); }
    });
    current.addEventListener('td', (event) => {
      if (disposed || stream !== current) return;
      try { deliver(parseEvent((JSON.parse(event.data) as { e: unknown }).e)); }
      catch { status('invalid relay event'); }
    });
  };
  connect();
  return {
    advance(dt): void {
      if (!Number.isFinite(dt) || dt < 0) throw new Error('elapsed time must be nonnegative');
      if (!disposed) timeline.advanceTo(timeline.timeMs() + dt * 1000);
    },
    dispose(): void { disposed = true; stream?.close(); if (timer !== undefined) unschedule(timer); },
    timeMs: timeline.timeMs,
  };
}

export async function probeRelay(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl('/relay/health', { signal: AbortSignal.timeout(1500), cache: 'no-store' });
    if (!res.ok) return false;
    const value = await res.json() as { ok?: unknown };
    return value.ok === true;
  } catch { return false; }
}
