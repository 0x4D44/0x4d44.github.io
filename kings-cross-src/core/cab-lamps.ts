// The lamps of a train standing at a platform, and its cab light, from the time it is due to leave.
//
// A train arriving shows its red tail lamp at the end it trails. About ten minutes before it leaves, the end it
// will leave by shows white (headlamp and marker lamps), the other end red, and the driver's cab at the leaving
// end is lit; the cab light goes out a minute before departure. Once the train moves off it is in service again
// (white at the leading end, red at the trailing end).
//
// Ends follow web/src/train.ts: `front` is car 0's, `rear` the last car's. Car 0 is placed at the end the motion
// core calls leading, so at a King's Cross terminus the arrival's car 0 stands at the buffer stop and the end that
// leaves is `rear`; after the cab change (core/motion.ts reverseAtPlatform, which counts `reversals`) car 0 is
// placed at the new leading end, and the leaving end is `front`. A through train (Waverley) leaves by its `front`.
//
// Pure: no three.js, no DOM. Times are epoch milliseconds supplied by the caller.
import { matchService } from './schedule.ts';
import type { ScheduleCall } from './schedule.ts';

export type CabLampMode = 'head' | 'tail' | 'off';
export type CabEnd = 'front' | 'rear';
/**
 * Where a departure time came from: the timetable call of the train's own (departure) headcode; ASSUMED, the next
 * unclaimed departure booked from its platform; PTAC's planned Edinburgh departure; or no time, but the departure
 * headcode is interposed on the train (so it is about to leave); or nothing at all.
 */
export type DepartureSource = 'timetable' | 'platform-guess' | 'ptac' | 'interposed' | 'none';
export interface Departure { readonly departureMs: number | null; readonly source: DepartureSource }
export interface CabPlanInput {
  /** The train stands still at a platform (motion `held`, not blocked short of it). */
  readonly atPlatform: boolean;
  /** Cab changes (motion `reversals`) since the train was first seen standing at this platform. */
  readonly reversalsSinceArrival: number;
  /** A terminus (King's Cross: the train leaves the way it came) or a through station (Waverley). */
  readonly terminus: boolean;
  readonly departure: Departure;
}
export interface CabPlan { readonly front: CabLampMode; readonly rear: CabLampMode; readonly cabLit: CabEnd | null }

/** White lamps and the cab light come on this long before departure. */
export const LIGHT_UP_MS = 10 * 60_000;
/** The cab light goes out this long before departure. */
export const CAB_OFF_MS = 60_000;
/** In service: white at the leading end (car 0), red at the trailing end, no cab light. */
export const SERVICE_PLAN: CabPlan = Object.freeze({ front: 'head', rear: 'tail', cabLit: null });

export const samePlan = (a: CabPlan, b: CabPlan): boolean => a.front === b.front && a.rear === b.rear && a.cabLit === b.cabLit;

/** The lamps and cab light a train shows at `nowMs`. */
export function cabPlan(input: CabPlanInput, nowMs: number): CabPlan {
  if (!input.atPlatform || input.reversalsSinceArrival > 0) return SERVICE_PLAN;
  const leaving: CabEnd = input.terminus ? 'rear' : 'front';
  const other: CabEnd = leaving === 'rear' ? 'front' : 'rear';
  const { departureMs, source } = input.departure;
  // with no time, the departure headcode on the train is the only evidence it is about to leave: never earlier
  const left = departureMs !== null && Number.isFinite(departureMs) ? departureMs - nowMs : source === 'interposed' ? LIGHT_UP_MS : Infinity;
  if (left > LIGHT_UP_MS) {
    // standing: the red tail lamp it arrived with (its trailing end, `rear`, until a cab change), the other end dark
    return { front: 'off', rear: 'tail', cabLit: null };
  }
  const lamps = { [leaving]: 'head', [other]: 'tail' } as { front: CabLampMode; rear: CabLampMode };
  return { ...lamps, cabLit: source === 'interposed' || left > CAB_OFF_MS ? leaving : null };
}

/** A timetable call as the page holds it: the schedule call with the TRUST facts the board applied (web/src/board.ts BoardService). */
export type DepartureCall = ScheduleCall & {
  readonly cancelled?: boolean;
  readonly realtime?: { readonly actualDepartureMs?: number | null; readonly cancelled?: boolean; readonly platform?: string | null } | null;
};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const cancelled = (c: DepartureCall): boolean => c.stp === 'C' || (c.realtime?.cancelled ?? c.cancelled) === true;
/** A call's departure with TRUST applied: none when cancelled, the reported actual once there is one, else the public time (the working time when it has none). */
export function callDepartureMs(call: DepartureCall): number | null {
  if (cancelled(call)) return null;
  if (finite(call.realtime?.actualDepartureMs)) return call.realtime.actualDepartureMs;
  return call.publicDepartureMs ?? call.departureMs;
}
const callPlatform = (c: DepartureCall): string | null => c.realtime?.platform ?? c.platform;

/** A train standing at a King's Cross platform, as departureFor needs it. */
export interface StandingTrain {
  readonly id: number;
  /** Its TD description now, and when it was first seen standing here. */
  readonly description: string;
  readonly arrivalDescription: string;
  readonly platform: string;
  readonly arrivedAtMs: number;
}
/** How long after its time an unclaimed platform departure is still guessed to be this train's (a late start). */
export const GUESS_LATE_MS = 5 * 60_000;

/**
 * The departure time of each train standing at King's Cross (departure-time source (b)):
 *  1. its own headcode's departure call (matchService), with TRUST applied: after the departure headcode is interposed;
 *  2. renamed but no departure call: no time, but the interposed headcode says it is about to leave ('interposed');
 *  3. not renamed: ASSUMED, the earliest departure booked from its platform at or after its arrival that no other standing
 *     train has claimed, by headcode or by an earlier arrival's guess ('platform-guess'); none: 'none'.
 */
export function kingsCrossDepartures(standing: readonly StandingTrain[], calls: readonly DepartureCall[], nowMs: number): Map<number, Departure> {
  const out = new Map<number, Departure>();
  const claimed = new Set<DepartureCall>();
  const unnamed: StandingTrain[] = [];
  for (const t of standing) {
    const call = matchService(t.description, nowMs, calls) as DepartureCall | undefined;
    if (call && call.departureMs !== null) {
      claimed.add(call);
      const departureMs = callDepartureMs(call);
      out.set(t.id, { departureMs, source: departureMs === null ? 'none' : 'timetable' });
    } else if (t.description !== t.arrivalDescription) out.set(t.id, { departureMs: null, source: 'interposed' });
    else unnamed.push(t);
  }
  // ASSUMED (the timetable does not say which arrival forms which departure, and the page does not parse it): the next
  // departure from the same platform. An earlier arrival claims first.
  unnamed.sort((a, b) => a.arrivedAtMs - b.arrivedAtMs || a.id - b.id);
  for (const t of unnamed) {
    let best: { call: DepartureCall; ms: number } | undefined;
    for (const call of calls) {
      if (claimed.has(call) || call.departureMs === null || callPlatform(call) !== t.platform) continue;
      const ms = callDepartureMs(call);
      if (ms === null || ms < t.arrivedAtMs || ms < nowMs - GUESS_LATE_MS) continue;
      if (!best || ms < best.ms) best = { call, ms };
    }
    if (best) { claimed.add(best.call); out.set(t.id, { departureMs: best.ms, source: 'platform-guess' }); }
    else out.set(t.id, { departureMs: null, source: 'none' });
  }
  return out;
}

/** What the tracker needs of a motion view. */
export interface LampSubject {
  readonly id: number;
  readonly description: string;
  readonly reversals: number;
  /** Standing at a platform now; and which (King's Cross: the anchor's platform), when known. */
  readonly atPlatform: boolean;
  readonly platform?: string;
}
interface Arrival { reversals: number; description: string; atMs: number; platform?: string }
/** Resolves the departures of the trains standing now (the arrival record gives the description they arrived with). */
export type DepartureResolver = (standing: readonly StandingTrain[], nowMs: number) => Map<number, Departure>;
/** Departures are resolved again when the standing trains change, on invalidate(), and at least this often (simulation time). */
export const RESOLVE_EVERY_MS = 15_000;

/**
 * Per live layer, keyed by the motion view's id (which survives a rename): remembers when and as what each train arrived at
 * its platform, resolves departures only when something they depend on changes, and reports a train's plan only when it
 * differs from the one last reported, so the renderer touches a train's lamps on a change and never every frame.
 */
export function createCabLampTracker(options: { terminus: boolean; resolve: DepartureResolver }) {
  const arrivals = new Map<number, Arrival>();
  const shown = new Map<number, CabPlan>();
  let departures = new Map<number, Departure>(), key = '', resolvedAt = -Infinity, stale = true;
  return {
    /** The trains whose plan changed since the last call, with their new plan. A train never reported is in service state. */
    update(subjects: readonly LampSubject[], nowMs: number): Map<number, CabPlan> {
      const present = new Set<number>();
      for (const s of subjects) {
        present.add(s.id);
        if (!s.atPlatform) { arrivals.delete(s.id); continue; }
        const a = arrivals.get(s.id);
        if (!a || a.platform !== s.platform) arrivals.set(s.id, { reversals: s.reversals, description: s.description, atMs: nowMs, platform: s.platform });
      }
      for (const id of [...arrivals.keys()]) if (!present.has(id)) arrivals.delete(id);
      for (const id of [...shown.keys()]) if (!present.has(id)) shown.delete(id);
      const standing: StandingTrain[] = subjects.filter(s => s.atPlatform).map(s => {
        const a = arrivals.get(s.id)!;
        return { id: s.id, description: s.description, arrivalDescription: a.description, platform: s.platform ?? '', arrivedAtMs: a.atMs };
      });
      const nextKey = standing.map(t => `${t.id}:${t.description}:${t.platform}`).join('|');
      if (stale || nextKey !== key || nowMs < resolvedAt || nowMs - resolvedAt >= RESOLVE_EVERY_MS) {
        departures = standing.length ? options.resolve(standing, nowMs) : new Map();
        key = nextKey; resolvedAt = nowMs; stale = false;
      }
      const changed = new Map<number, CabPlan>();
      for (const s of subjects) {
        const a = arrivals.get(s.id);
        const plan = cabPlan({ atPlatform: s.atPlatform, reversalsSinceArrival: a ? s.reversals - a.reversals : 0, terminus: options.terminus,
          departure: departures.get(s.id) ?? { departureMs: null, source: 'none' } }, nowMs);
        if (!samePlan(plan, shown.get(s.id) ?? SERVICE_PLAN)) changed.set(s.id, plan);
        shown.set(s.id, plan);
      }
      return changed;
    },
    /** The timetable (or other departure evidence) changed: resolve again on the next update. */
    invalidate(): void { stale = true; },
    forget(id: number): void { arrivals.delete(id); shown.delete(id); },
    /** For tests and the tooltip: what a train last showed, and the departure it was resolved to. */
    shown: (id: number): CabPlan => shown.get(id) ?? SERVICE_PLAN,
    departure: (id: number): Departure | undefined => departures.get(id),
  };
}
