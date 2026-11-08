import { NOT_A_TRAIN } from '../../core/anchors.ts';
import type { AnchorMap, BerthAnchor } from '../../core/anchors.ts';
import { shortestPath } from '../../core/graph.ts';
import type { Graph } from '../../core/graph.ts';
import type { TrainView } from '../../core/motion.ts';
import { matchService } from '../../core/schedule.ts';
import type { ScheduleCall } from '../../core/schedule.ts';

export type BoardMode = 'sample' | 'live' | 'replay' | 'none';
export type BoardTrain = Pick<TrainView, 'id' | 'description'> & Partial<Omit<TrainView, 'id' | 'description'>> & { samplePlatform?: number };
export interface BoardService extends ScheduleCall {
  originName?: string;
  destinationName?: string;
  realtime?: {
    actualArrivalMs?: number | null; actualDepartureMs?: number | null;
    variationMinutes?: number | null; eventType?: string | null; platform?: string | null;
    trainId?: string | null; matchMethod?: string | null; updatedAtMs?: number | null;
  } | null;
}
export interface BoardDue { service: BoardService; direction: 'arrival' | 'departure'; bookedMs: number }
/** TD placement remains observational; timetable data only enriches its labels. */
export interface BoardRow {
  trainId: number;
  headcode: string;
  service?: BoardService;
  uid?: string;
  operator?: string;
  origin?: string;
  platform?: number;
  platforms?: number[];
  state: 'standing' | 'departing' | 'approaching' | 'leaving';
  sinceMs?: number;
  stoodMs?: number;
  leftAtMs?: number;
  distanceM?: number;
  sample?: boolean;
  booked?: string;
  expected?: string;
  destination?: string;
}
export interface BoardRows {
  timetable: boolean;
  due: BoardDue[];
  platforms: { platform: number; trains: BoardRow[] }[];
  approaching: BoardRow[];
  departed: BoardRow[];
  timeMs: number;
  mode: BoardMode;
}
export interface BoardOptions {
  services?: readonly BoardService[];
  nowMs?: number;
  previous?: BoardRows;
  mode?: BoardMode;
  graph?: Graph;
  arrivals?: ReadonlyMap<string, readonly number[]>;
  retentionMs?: number;
}
const validPlatform = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 10;
const namedPlatform = (berth = ''): number | undefined => {
  const n = /^10\d{2}$/.test(berth) ? Number(berth) - 1000 : /^B\d{3}$/.test(berth) ? Number(berth.slice(1)) : NaN;
  return validPlatform(n) ? n : undefined;
};
const anchorPlatform = (anchor: BerthAnchor | undefined): number | undefined => {
  const n = anchor?.platform === undefined ? NaN : Number(anchor.platform);
  return validPlatform(n) ? n : undefined;
};

/** Read private runtime evidence, never bake observed berth chains into the public bundle. */
export function approachPlatforms(anchors: AnchorMap): ReadonlyMap<string, readonly number[]> {
  const direct = new Map<string, number>();
  const next = new Map<string, string[]>();
  for (const a of anchors.anchors) {
    const platform = anchorPlatform(a) ?? namedPlatform(a.berth);
    if (platform !== undefined) direct.set(a.berth, platform);
    const match = /fan-out to ([\w, -]+);/.exec(a.evidence);
    if (match) next.set(a.berth, match[1]!.split(',').map((b) => b.trim()));
    else {
      const continuation = /Boundary continuation north from (\w+):/.exec(a.evidence);
      if (continuation) next.set(a.berth, [continuation[1]!]);
    }
  }
  for (const u of anchors.unmapped) {
    const match = /successors \[([^\]]+)\]/.exec(u.detail) ?? /fan-out to ([\w, -]+);/.exec(u.detail);
    if (match) next.set(u.berth, match[1]!.split(',').map((b) => b.trim()));
    else {
      const continuation = /Boundary continuation north from (\w+):/.exec(u.detail);
      if (continuation) next.set(u.berth, [continuation[1]!]);
    }
  }
  const result = new Map<string, readonly number[]>();
  const visit = (berth: string, seen: Set<string>): number[] => {
    const platform = direct.get(berth) ?? namedPlatform(berth);
    if (platform !== undefined) return [platform];
    if (seen.has(berth)) return [];
    const onward = next.get(berth);
    if (!onward?.length) return [];
    const path = new Set(seen).add(berth);
    const sets = onward.map((b) => visit(b, path));
    // A partially known fan-out is not proof of a smaller platform set.
    return sets.some((s) => !s.length) ? [] : [...new Set(sets.flat())].sort((a, b) => a - b);
  };
  for (const berth of next.keys()) {
    const platforms = visit(berth, new Set());
    if (platforms.length) result.set(berth, platforms);
  }
  return result;
}

function coversStop(train: BoardTrain, stop: BerthAnchor): boolean {
  return (train.occupied ?? []).some((s) => {
    if (!((s.edge.a === stop.from && s.edge.b === stop.to) || (s.edge.b === stop.from && s.edge.a === stop.to))) return false;
    const t = s.edge.a === stop.from ? stop.t : 1 - stop.t;
    // The rendered nose stops just short of a buffer; do not require exact float equality.
    const clearance = 2 / s.edge.length;
    return t >= Math.min(s.fromT, s.toT) - clearance && t <= Math.max(s.fromT, s.toT) + clearance;
  });
}

/** Shortest rail distance, including fractional end edges; never a straight-line estimate. */
function distanceToStop(train: BoardTrain, stop: BerthAnchor, graph?: Graph): number | undefined {
  if (!graph || !train.leading) return undefined;
  const start = train.leading;
  const edge = graph.edges.find((e) => (e.a === stop.from && e.b === stop.to) || (e.b === stop.from && e.a === stop.to));
  if (!edge) return undefined;
  const t = edge.a === stop.from ? stop.t : 1 - stop.t;
  let best = start.edge.a === edge.a && start.edge.b === edge.b ? Math.abs(start.t - t) * edge.length : Infinity;
  for (const [from, head] of [[start.edge.a, start.t * start.edge.length], [start.edge.b, (1 - start.t) * start.edge.length]]) {
    for (const [to, tail] of [[edge.a, t * edge.length], [edge.b, (1 - t) * edge.length]]) {
      const path = shortestPath(graph, from!, to!);
      if (path) best = Math.min(best, head! + path.length + tail!);
    }
  }
  return Number.isFinite(best) ? best : undefined;
}

/** Pure snapshot projection. Pass the previous result to retain dwell and recent departures. */
export function boardRows(trains: readonly BoardTrain[], anchors: AnchorMap, options: BoardOptions = {}): BoardRows {
  const nowMs = options.nowMs ?? 0;
  const mode = options.mode ?? 'live';
  const previous = options.previous?.mode === mode && options.previous.timeMs <= nowMs ? options.previous : undefined;
  const platforms = Array.from({ length: 11 }, (_, platform) => ({ platform, trains: [] as BoardRow[] }));
  const byBerth = new Map(anchors.anchors.map((a) => [a.berth, a]));
  const stops = anchors.anchors.filter((a) => anchorPlatform(a) !== undefined);
  const prior = previous?.platforms.flatMap((p) => p.trains) ?? [];
  const active = trains.filter((t) => t.description !== NOT_A_TRAIN && (t.opacity ?? 1) > 0 && t.state !== 'fading');
  const atPlatform = new Set<number>();
  const approaching: BoardRow[] = [];
  const arrivals = options.arrivals ?? approachPlatforms(anchors);
  for (const train of active) {
    const old = prior.find((r) => r.trainId === train.id);
    const physical = stops.find((a) => coversStop(train, a));
    const lastPlatform = anchorPlatform(byBerth.get(train.lastBerth ?? '')) ?? namedPlatform(train.lastBerth);
    const platform = mode === 'sample' && validPlatform(train.samplePlatform ?? NaN) ? train.samplePlatform
      : physical ? anchorPlatform(physical)
        : (train.speed ?? 0) <= 0.1 && train.state !== 'moving' && train.state !== 'departing' ? lastPlatform : undefined;
    if (platform !== undefined) {
      const departing = train.state === 'departing';
      const sinceMs = old?.platform === platform ? old.sinceMs ?? nowMs : nowMs;
      const stoodMs = departing && old ? old.stoodMs ?? 0 : Math.max(0, nowMs - sinceMs);
      platforms[platform]!.trains.push({ trainId: train.id, headcode: train.description, platform,
        state: departing ? 'departing' : 'standing', sinceMs, stoodMs, sample: mode === 'sample' });
      atPlatform.add(train.id);
      continue;
    }
    if (train.state === 'departing' || train.exiting) continue;
    const target = anchorPlatform(byBerth.get(train.targetBerth ?? '')) ?? namedPlatform(train.targetBerth);
    const candidates = target === undefined ? arrivals.get(train.lastBerth ?? '') : [target];
    if (!candidates?.length) continue;
    const distances = stops.filter((a) => candidates.includes(anchorPlatform(a)!)).map((a) => distanceToStop(train, a, options.graph)).filter((n): n is number => n !== undefined);
    approaching.push({ trainId: train.id, headcode: train.description, state: 'approaching', platforms: [...candidates],
      distanceM: distances.length ? Math.min(...distances) : undefined });
  }
  approaching.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || a.trainId - b.trainId);
  const departed = new Map((previous?.departed ?? []).map((r) => [r.trainId, { ...r }]));
  for (const old of prior) {
    if (atPlatform.has(old.trainId)) continue;
    const train = active.find((t) => t.id === old.trainId);
    // A cancel/fade is not evidence of departure. A moving body leaving its stop is.
    if (train && ((train.speed ?? 0) > 0.1 || train.state === 'departing' || train.exiting) || !train && old.state === 'departing') {
      departed.set(old.trainId, { ...old, headcode: train?.description ?? old.headcode, state: 'leaving', leftAtMs: nowMs });
    }
  }
  const retentionMs = options.retentionMs ?? 180_000;
  const leaving = [...departed.values()].filter((r) => !atPlatform.has(r.trainId) && nowMs - r.leftAtMs! <= retentionMs)
    .sort((a, b) => b.leftAtMs! - a.leftAtMs! || a.trainId - b.trainId);
  const timetable = (mode === 'live' || mode === 'replay') && options.services !== undefined;
  const services = timetable ? options.services! : [];
  const priorRows = [...prior, ...(previous?.approaching ?? []), ...(previous?.departed ?? [])];
  const enrich = (row: BoardRow): void => {
    if (!timetable) { row.service = undefined; row.uid = undefined; row.operator = undefined; row.origin = undefined; row.destination = undefined; return; }
    const old = priorRows.find(r => r.trainId === row.trainId && r.headcode === row.headcode)?.service;
    // Once associated, retain this call's identity even when a repeated headcode is closer later.
    const service = old ? services.find(s => sameCall(s, old)) ?? old
      : matchService(row.headcode, nowMs, services) as BoardService | undefined;
    if (!service) return;
    row.service = service; row.uid = service.uid; row.operator = service.operator;
    row.origin = service.originName || service.origin; row.destination = service.destinationName || service.destination;
  };
  for (const row of [...platforms.flatMap(p => p.trains), ...approaching, ...leaving]) enrich(row);
  const due: BoardDue[] = [];
  for (const service of services) {
    for (const direction of ['arrival', 'departure'] as const) {
      const bookedMs = direction === 'arrival' ? service.publicArrivalMs ?? service.arrivalMs : service.publicDepartureMs ?? service.departureMs;
      if (bookedMs !== null && bookedMs >= nowMs && bookedMs <= nowMs + 30 * 60_000) due.push({ service, direction, bookedMs });
    }
  }
  due.sort((a, b) => a.bookedMs - b.bookedMs || a.service.uid.localeCompare(b.service.uid) || a.direction.localeCompare(b.direction));
  return { platforms, approaching, departed: leaving, due, timetable, timeMs: nowMs, mode };
}

const sameCall = (a: ScheduleCall, b: ScheduleCall): boolean => a.uid === b.uid && a.serviceDate === b.serviceDate && a.date === b.date;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
/** Project only recorded movement facts. Never derive expected times from a variation. */
export function applyBoardTrust(services: readonly BoardService[], event: unknown): BoardService[] {
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const envelope = object(event), e = object(envelope.e ?? event);
  if (e.kind !== 'trust' || e.type !== 'movement' || !['ARRIVAL', 'DEPARTURE'].includes(String(e.eventType))) return [...services];
  let service: BoardService | undefined;
  if (typeof e.uid === 'string' && e.uid) {
    const matches = services.filter(s => s.uid === e.uid && (!e.serviceDate || s.serviceDate === e.serviceDate) && (!e.date || s.date === e.date));
    if (matches.length === 1) service = matches[0];
  } else if (typeof e.headcode === 'string' && finite(e.plannedMs)) {
    const candidates = services.filter(s => (!e.serviceDate || s.serviceDate === e.serviceDate) && (!e.date || s.date === e.date));
    service = matchService(e.headcode, e.plannedMs, candidates) as BoardService | undefined;
  }
  if (!service) return [...services];
  return services.map(s => {
    if (s !== service) return s;
    if (finite(e.receivedAtMs) && finite(s.realtime?.updatedAtMs) && e.receivedAtMs < s.realtime.updatedAtMs) return s;
    const realtime = { ...s.realtime, eventType: String(e.eventType) };
    if (finite(e.actualMs)) {
      if (e.eventType === 'ARRIVAL') realtime.actualArrivalMs = e.actualMs;
      else realtime.actualDepartureMs = e.actualMs;
    }
    if (finite(e.variationMinutes)) realtime.variationMinutes = e.variationMinutes;
    if (typeof e.platform === 'string' && /^(?:[0-9]|10)$/.test(e.platform)) realtime.platform = e.platform;
    if (typeof e.trainId === 'string') realtime.trainId = e.trainId;
    if (typeof e.matchMethod === 'string') realtime.matchMethod = e.matchMethod;
    if (finite(e.receivedAtMs)) realtime.updatedAtMs = e.receivedAtMs;
    return { ...s, realtime };
  });
}

const escape = (value: string): string => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const duration = (ms: number): string => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const platformLabel = (values: number[]): string => {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  return sorted.length > 1 && sorted.at(-1)! - sorted[0]! === sorted.length - 1 ? `plat ${sorted[0]}–${sorted.at(-1)}` : `plat ${sorted.join(', ')}`;
};
const clock = (ms: number): string => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(ms);
const bookedLine = (service: BoardService, direction: 'arrival' | 'departure'): string | undefined => {
  const arrival = direction === 'arrival';
  const working = arrival ? service.arrival : service.departure;
  const publicTime = arrival ? service.publicArrival : service.publicDeparture;
  if (!working && !publicTime) return undefined;
  const place = arrival ? service.originName || service.origin : service.destinationName || service.destination;
  const times = publicTime === working ? `booked public/working ${publicTime}`
    : `booked public ${publicTime ?? '—'} · working ${working ?? '—'}`;
  return `${arrival ? 'Arrival from' : 'Departure to'} ${place} · ${times} · ${service.operator || 'operator unknown'}`;
};
const actualLine = (service: BoardService): string | undefined => {
  const rt = service.realtime;
  if (!rt) return undefined;
  const facts: string[] = [];
  if (typeof rt.actualArrivalMs === 'number' && Number.isFinite(rt.actualArrivalMs)) facts.push(`Actual arrival ${clock(rt.actualArrivalMs)}`);
  if (typeof rt.actualDepartureMs === 'number' && Number.isFinite(rt.actualDepartureMs)) facts.push(`Actual departure ${clock(rt.actualDepartureMs)}`);
  if (typeof rt.variationMinutes === 'number' && Number.isFinite(rt.variationMinutes)) facts.push(`Recorded variation ${rt.variationMinutes > 0 ? '+' : ''}${rt.variationMinutes} min`);
  if (rt.platform && rt.platform !== service.platform) facts.push(`Recorded platform ${rt.platform}`);
  return facts.length ? facts.join(' · ') : undefined;
};
const serviceLines = (service: BoardService): string[] => [bookedLine(service, 'arrival'), bookedLine(service, 'departure'), actualLine(service)]
  .filter((line): line is string => !!line);
const schedule = (row: BoardRow): string => (row.service ? serviceLines(row.service)
  : [row.booked && `booked ${row.booked}`, row.expected && `expected ${row.expected}`, row.destination].filter((s): s is string => !!s))
  .map(s => `<span>${escape(s)}</span>`).join('');
const trainHtml = (row: BoardRow, detail: string): string => `<div class="kx-board-train"><strong>${escape(row.headcode)}</strong> <span>${detail}</span>${schedule(row)}</div>`;

/** Also usable by a later schedule adapter; all feed strings are escaped before insertion. */
export function boardHtml(rows: BoardRows): string {
  const platformRows = rows.platforms.map((p) => `<div class="kx-board-platform"><b>${p.platform}</b><div>${p.trains.length
    ? p.trains.map((r) => trainHtml(r, `${r.state} · ${duration(r.stoodMs ?? 0)}${r.sample ? ' · sample' : ''}`)).join('') : '<span class="kx-board-empty">empty</span>'}</div></div>`).join('');
  const approaching = rows.approaching.map((r) => trainHtml(r, `${platformLabel(r.platforms ?? [])} · ${r.distanceM === undefined ? 'distance unknown' : `≈ ${Math.round(r.distanceM)} m to buffer`}`)).join('') || '<p class="kx-board-empty">None observed</p>';
  const departed = rows.departed.map((r) => trainHtml(r, `from plat ${r.platform} · ${duration(Math.max(0, rows.timeMs - (r.leftAtMs ?? rows.timeMs)))} ago`)).join('') || '<p class="kx-board-empty">None observed in the last 3 minutes</p>';
  const due = rows.due.map(({ service, direction }) => {
    const arrival = direction === 'arrival';
    const place = arrival ? service.originName || service.origin : service.destinationName || service.destination;
    const publicTime = arrival ? service.publicArrival : service.publicDeparture;
    const working = arrival ? service.arrival : service.departure;
    const times = publicTime === working ? `public/working ${publicTime}` : `public ${publicTime ?? '—'} · working ${working ?? '—'}`;
    return `<div class="kx-board-train"><strong>${escape(service.headcode)}</strong> <span>${arrival ? 'Arr' : 'Dep'} ${escape(times)} · booked platform ${escape(service.platform ?? 'unknown')} · ${arrival ? 'from' : 'to'} ${escape(place)} · ${escape(service.operator || 'operator unknown')}</span>${actualLine(service) ? `<span>${escape(actualLine(service)!)}</span>` : ''}</div>`;
  }).join('') || '<p class="kx-board-empty">None booked in the next 30 minutes</p>';
  return `<p class="kx-board-note">${rows.mode === 'sample' ? 'Sample, not live · no timetable' : rows.mode === 'none' ? 'Trains hidden · no timetable' : `${rows.mode === 'replay' ? 'Replay' : 'Live'} TD observations · ${rows.timetable ? 'timetable available' : 'no timetable'}`}<br>Dwell measured since observed · simulation time</p>${rows.timetable ? `<h2>Due in next 30 minutes</h2>${due}` : ''}<h2>Platforms 0–10</h2>${platformRows}<h2>Approaching</h2>${approaching}<h2>Departed / leaving</h2>${departed}`;
}

export function createBoard(parent: HTMLElement, status?: HTMLElement) {
  const doc = parent.ownerDocument, view = doc.defaultView!;
  const root = doc.createElement('aside');
  root.className = 'kx-board'; root.setAttribute('aria-label', 'Station board');
  const style = doc.createElement('style');
  style.textContent = `.kx-board{position:fixed;top:52px;left:16px;width:350px;max-width:calc(100vw - 32px);max-height:calc(100dvh - 52px - var(--board-bottom,100px));box-sizing:border-box;display:flex;flex-direction:column;z-index:10;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;font:12px/1.45 system-ui,sans-serif;backdrop-filter:blur(8px)}.kx-board button{display:flex;justify-content:space-between;align-items:center;gap:12px;width:100%;border:0;border-radius:6px;background:transparent;color:inherit;padding:9px 12px;font:600 13px/1.4 system-ui,sans-serif;text-align:left;cursor:pointer}.kx-board button:focus-visible{outline:2px solid currentColor;outline-offset:2px}.kx-board-body{overflow:auto;overscroll-behavior:contain;min-height:0;padding:0 12px 10px;overflow-wrap:anywhere}.kx-board-body[hidden]{display:none}.kx-board h2{font-size:12px;margin:12px 0 4px;color:var(--fg)}.kx-board-note,.kx-board-empty{color:var(--muted);margin:4px 0}.kx-board-platform{display:grid;grid-template-columns:24px minmax(0,1fr);gap:8px;border-top:1px solid var(--line);padding:4px 0}.kx-board-train{padding:2px 0}.kx-board-train strong{font-variant-numeric:tabular-nums}.kx-board-train span{color:var(--muted);margin-left:4px}.kx-board-train span:nth-of-type(n+2){display:block;margin-left:0}`;
  const toggle = doc.createElement('button'); toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'kx-board-content');
  const body = doc.createElement('div'); body.className = 'kx-board-body'; body.id = 'kx-board-content';
  const narrow = view.matchMedia('(max-width: 600px)');
  let collapsed = narrow.matches, chosen = false, html = '';
  const paintToggle = (): void => {
    body.hidden = collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.textContent = `Station board ${collapsed ? '▸' : '▾'}`;
  };
  const onToggle = (): void => { chosen = true; collapsed = !collapsed; paintToggle(); };
  const onWidth = (): void => { if (!chosen) { collapsed = narrow.matches; paintToggle(); } };
  const resize = (): void => {
    const hud = status?.closest('.hud') ?? status;
    const bottom = hud ? Math.max(24, view.innerHeight - hud.getBoundingClientRect().top + 12) : 100;
    root.style.setProperty('--board-bottom', `${bottom}px`);
  };
  toggle.addEventListener('click', onToggle); narrow.addEventListener('change', onWidth);
  root.append(style, toggle, body); parent.append(root); paintToggle(); resize();
  view.addEventListener('resize', resize);
  return {
    update(rows: BoardRows): void { const next = boardHtml(rows); if (next !== html) { body.innerHTML = next; html = next; } resize(); },
    dispose(): void { toggle.removeEventListener('click', onToggle); narrow.removeEventListener('change', onWidth); view.removeEventListener('resize', resize); root.remove(); },
  };
}
