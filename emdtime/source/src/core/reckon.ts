/**
 * Turning an instant into a Decet date/clock and back.
 *
 * A moment is one integer of SI seconds since the Decet epoch — a "Decet instant"
 * (like Unix time, but decomposed decimally). Because the day is a fixed number of
 * seconds and the year a fixed number of days (no leap years), the mapping is exact
 * integer arithmetic.
 */
import type { CalendarLevel, IntradayPlace, SystemConfig } from "./system.ts";

/** Floor division that is correct for negative numerators (JS `%`/`/` truncate). */
export function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}
/** Modulo whose result always has the sign of the divisor (never negative for b>0). */
export function floorMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

export interface CalendarDigit {
  level: CalendarLevel;
  value: number;
}
export interface IntradayDigit {
  place: IntradayPlace;
  value: number;
}

export interface DecetTime {
  /** SI seconds since the Decet epoch (may be negative for pre-epoch moments). */
  instant: number;
  /** Whole revolutions since the epoch (can be negative). */
  year: number;
  /** 0 .. yearDays-1 */
  dayOfYear: number;
  /** 0 .. daySeconds-1 */
  secondOfDay: number;
  /** Positional calendar digits, largest unit first (e.g. season, month, week, day). */
  calendar: CalendarDigit[];
  /** Positional clock digits, largest place first (e.g. deciday..second). */
  intraday: IntradayDigit[];
  /** Fraction of the current day elapsed, 0 <= f < 1. */
  dayFraction: number;
}

/** Split a day-of-year (0..yearDays-1) into its positional calendar digits. */
export function calendarDigits(config: SystemConfig, dayOfYear: number): CalendarDigit[] {
  return config.calendar.map((level) => ({
    level,
    value: floorMod(floorDiv(dayOfYear, level.placeValue), level.range),
  }));
}

/** Split a second-of-day (0..daySeconds-1) into its positional clock digits (each 0..9). */
export function intradayDigits(config: SystemConfig, secondOfDay: number): IntradayDigit[] {
  return config.intraday.map((place) => ({
    place,
    value: floorMod(floorDiv(secondOfDay, place.secondsEach), 10),
  }));
}

/** Decompose a Decet instant (SI seconds since epoch) into a full Decet time. */
export function fromInstant(config: SystemConfig, instant: number): DecetTime {
  const whole = Math.floor(instant);
  const yearSeconds = config.daySeconds * config.yearDays;
  const year = floorDiv(whole, yearSeconds);
  const secondOfYear = floorMod(whole, yearSeconds);
  const dayOfYear = floorDiv(secondOfYear, config.daySeconds);
  const secondOfDay = floorMod(whole, config.daySeconds);
  return {
    instant: whole,
    year,
    dayOfYear,
    secondOfDay,
    calendar: calendarDigits(config, dayOfYear),
    intraday: intradayDigits(config, secondOfDay),
    dayFraction: secondOfDay / config.daySeconds,
  };
}

/** Compose a Decet instant from calendar/clock fields. */
export function toInstant(
  config: SystemConfig,
  parts: { year: number; dayOfYear: number; secondOfDay: number },
): number {
  const yearSeconds = config.daySeconds * config.yearDays;
  return parts.year * yearSeconds + parts.dayOfYear * config.daySeconds + parts.secondOfDay;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function pad(n: number, width: number): string {
  const neg = n < 0;
  const s = Math.abs(n).toString().padStart(width, "0");
  return neg ? `-${s}` : s;
}

/** Time-of-day as the canonical day-fraction, e.g. `.5000` (midday). */
export function formatClock(config: SystemConfig, secondOfDay: number): string {
  const digits = intradayDigits(config, secondOfDay)
    .map((d) => d.value)
    .join("");
  return `.${digits}`;
}

/** "Watch-face" form AB:CD reading like legacy mm:ss (midday = 50:00). */
export function formatWatch(config: SystemConfig, secondOfDay: number): string {
  const d = intradayDigits(config, secondOfDay).map((x) => x.value);
  const a = (d[0] ?? 0).toString();
  const b = (d[1] ?? 0).toString();
  const c = (d[2] ?? 0).toString();
  const e = (d[3] ?? 0).toString();
  return `${a}${b}:${c}${e}`;
}

/** Day-of-year address, e.g. `1234` (season 1, month 2, week 3, day 4 in Standard). */
export function formatDayOfYear(config: SystemConfig, dayOfYear: number): string {
  const width = config.yearDays.toString().length - 1; // 4000 -> 4 digits, 1000 -> 4? handle below
  const w = Math.max(width, (config.yearDays - 1).toString().length);
  return pad(dayOfYear, w);
}

/** Full civil timestamp — the ISO-8601 analog: `Yyyyy-Ddddd-Tssss`. */
export function formatTimestamp(config: SystemConfig, t: DecetTime): string {
  const yearW = 4;
  const dayW = (config.yearDays - 1).toString().length;
  const secW = config.clockDigits;
  return `Y${pad(t.year, yearW)}-D${pad(t.dayOfYear, dayW)}-T${pad(t.secondOfDay, secW)}`;
}

/** Spell the positional calendar address, e.g. "S1 M2 W3 D4". */
export function formatCalendarAddress(t: DecetTime): string {
  return t.calendar.map((d) => `${d.level.symbol}${d.value}`).join(" ");
}
