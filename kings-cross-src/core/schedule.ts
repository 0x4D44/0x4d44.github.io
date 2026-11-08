// Pure CIF JSON-lines selection. STP definitions: Network Rail CIF End User Spec,
// issue 29: C cancellation, O overlay, N new STP, P permanent.
export type Stp = 'P' | 'N' | 'O' | 'C';
export interface ScheduleLocation {
  tiploc: string; platform: string | null;
  arrival: string | null; departure: string | null; pass: string | null;
  publicArrival: string | null; publicDeparture: string | null;
}
export interface ScheduleRecord {
  uid: string; headcode: string; operator: string; category: string;
  startDate: string; endDate: string; days: string; stp: Stp;
  locations: ScheduleLocation[]; deleted: boolean;
}
export interface ScheduleCall {
  uid: string; headcode: string; operator: string; category: string;
  date: string; serviceDate: string; stp: Stp; startDate: string; endDate: string;
  platform: string | null; origin: string; destination: string;
  arrival: string | null; departure: string | null;
  publicArrival: string | null; publicDeparture: string | null;
  arrivalMs: number | null; departureMs: number | null;
  publicArrivalMs: number | null; publicDepartureMs: number | null;
}
const DAY = 86_400_000;
const rank: Record<Stp, number> = { P: 1, N: 2, O: 3, C: 4 };
const text = (v: unknown): string => typeof v === 'string' ? v.trim() : '';
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
function time(v: unknown): string | null {
  const m = /^(\d{2}):?(\d{2})(?::?(\d{2})|(H))?$/.exec(text(v));
  if (!m || +m[1]! > 23 || +m[2]! > 59 || +(m[3] ?? '0') > 59) return null;
  const seconds = m[4] ? '30' : m[3];
  return `${m[1]}:${m[2]}${seconds && seconds !== '00' ? `:${seconds}` : ''}`;
}
/** Non-schedule JSON records and malformed lines are ignored; markers need no locations. */
export function parseScheduleLine(line: string): ScheduleRecord | undefined {
  let value: unknown;
  try { value = JSON.parse(line); } catch { return undefined; }
  const s = object(object(value).JsonScheduleV1);
  const uid = text(s.CIF_train_uid), startDate = text(s.schedule_start_date), endDate = text(s.schedule_end_date);
  const stp = text(s.CIF_stp_indicator) as Stp, days = text(s.schedule_days_runs);
  if (!uid || !validDate(startDate) || !validDate(endDate) || endDate < startDate || !/^[01]{7}$/.test(days) || !Object.hasOwn(rank, stp)) return undefined;
  const seg = object(Array.isArray(s.schedule_segment) ? s.schedule_segment[0] : s.schedule_segment);
  const locations = Array.isArray(seg.schedule_location) ? seg.schedule_location.map((v): ScheduleLocation => {
    const l = object(v);
    return { tiploc: text(l.tiploc_code), platform: text(l.platform) || null,
      arrival: time(l.arrival), departure: time(l.departure), pass: time(l.pass),
      publicArrival: time(l.public_arrival), publicDeparture: time(l.public_departure) };
  }) : [];
  return { uid, startDate, endDate, stp, days, headcode: text(seg.signalling_id),
    operator: text(s.atoc_code) || text(seg.atoc_code), category: text(seg.CIF_train_category), locations,
    deleted: text(s.transaction_type).toLowerCase() === 'delete' };
}
const london = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function localParts(ms: number): string {
  const parts = Object.fromEntries(london.formatToParts(ms).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
function seconds(t: string): number { const p = t.split(':').map(Number); return p[0]! * 3600 + p[1]! * 60 + (p[2] ?? 0); }
function shift(date: string, days: number): string { return new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10); }
/** Fall-back ambiguity uses the first occurrence consistent with earlier locations.
 * Nonexistent spring-forward wall times have no epoch and are left null. */
function epoch(date: string, t: string | null, after = -Infinity): number | null {
  if (!t) return null;
  const wall = `${date}T${t.length === 5 ? `${t}:00` : t}`;
  const nominal = Date.parse(`${wall}Z`);
  return [nominal - 3_600_000, nominal].find(ms => ms >= after && localParts(ms) === wall) ?? null;
}
function recordCalls(r: ScheduleRecord, serviceDate: string, date: string): ScheduleCall[] {
  if (r.stp === 'C' || r.deleted || !r.locations.some(l => l.tiploc === 'KNGX')) return [];
  const out: ScheduleCall[] = [];
  let day = 0, previousClock = -1, previousEpoch = -Infinity;
  for (const l of r.locations) {
    const epochs: (number | null)[] = [], dates: string[] = [];
    for (const t of [l.arrival, l.departure, l.pass]) {
      if (t !== null) {
        const clock = seconds(t);
        if (clock < previousClock) day++;
        previousClock = clock;
      }
      const callDate = shift(serviceDate, day);
      const ms = epoch(callDate, t, previousEpoch);
      if (ms !== null) previousEpoch = ms;
      epochs.push(ms); dates.push(callDate);
    }
    const callDate = l.arrival ? dates[0]! : dates[1]!;
    if (l.tiploc !== 'KNGX' || callDate !== date || (!l.arrival && !l.departure)) continue;
    // King's Cross has platforms 0-10. Blank/unknown platform remains unknown.
    const platform = l.platform && /^(?:[0-9]|10)$/.test(l.platform) ? l.platform : null;
    const publicEpoch = (t: string | null, working: string | null, workingDate: string): number | null => {
      let publicDate = workingDate;
      if (t && working && seconds(t) - seconds(working) > 12 * 3600) publicDate = shift(workingDate, -1);
      if (t && working && seconds(working) - seconds(t) > 12 * 3600) publicDate = shift(workingDate, 1);
      return epoch(publicDate, t);
    };
    out.push({ uid: r.uid, headcode: r.headcode, operator: r.operator, category: r.category,
      date: callDate, serviceDate, stp: r.stp, startDate: r.startDate, endDate: r.endDate,
      platform, origin: r.locations[0]?.tiploc ?? '', destination: r.locations.at(-1)?.tiploc ?? '',
      arrival: l.arrival, departure: l.departure, publicArrival: l.publicArrival, publicDeparture: l.publicDeparture,
      arrivalMs: epochs[0]!, departureMs: epochs[1]!,
      publicArrivalMs: publicEpoch(l.publicArrival, l.arrival, dates[0]!),
      publicDepartureMs: publicEpoch(l.publicDeparture, l.departure, dates[1]!) });
  }
  return out;
}
/** Retain only winning compact markers/calls, never the full input extract/locations.
 * Apply every schedule, including cancellations and overlays which bypass King's Cross. */
export function createScheduleSelector(date: string) {
  if (!validDate(date)) throw new Error('invalid schedule date');
  const dates = [shift(date, -1), date];
  const winners = new Map<string, { rank: number; start: string; calls: ScheduleCall[] }>();
  return {
    apply(r: ScheduleRecord): void {
      for (const serviceDate of dates) {
        const weekday = (new Date(serviceDate).getUTCDay() + 6) % 7;
        if (serviceDate < r.startDate || serviceDate > r.endDate || r.days[weekday] !== '1') continue;
        const key = `${r.uid}/${serviceDate}`, old = winners.get(key), priority = rank[r.stp];
        if (old && (old.rank > priority || (old.rank === priority && old.start > r.startDate))) continue;
        winners.set(key, { rank: priority, start: r.startDate, calls: recordCalls(r, serviceDate, date) });
      }
    },
    calls(): ScheduleCall[] {
      return [...winners.values()].flatMap(w => w.calls).sort((a, b) => (a.arrivalMs ?? a.departureMs ?? 0) - (b.arrivalMs ?? b.departureMs ?? 0) || a.uid.localeCompare(b.uid) || a.serviceDate.localeCompare(b.serviceDate));
    },
  };
}
export function callsForDate(records: Iterable<ScheduleRecord>, date: string): ScheduleCall[] {
  const selector = createScheduleSelector(date);
  for (const r of records) selector.apply(r);
  return selector.calls();
}
/** A headcode repeats throughout a day; choose its nearest working call. */
export function matchService(headcode: string, atTime: number, services: readonly ScheduleCall[], windowMs = 90 * 60_000): ScheduleCall | undefined {
  let winner: ScheduleCall | undefined, best = Infinity;
  for (const s of services) {
    if (s.headcode !== headcode) continue;
    const distance = Math.min(...[s.arrivalMs, s.departureMs].filter((t): t is number => t !== null).map(t => Math.abs(t - atTime)));
    if (distance > windowMs || !Number.isFinite(distance)) continue;
    if (distance < best || (distance === best && (!winner || `${s.uid}/${s.serviceDate}` < `${winner.uid}/${winner.serviceDate}`))) { winner = s; best = distance; }
  }
  return winner;
}
