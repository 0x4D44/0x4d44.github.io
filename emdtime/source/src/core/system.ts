/**
 * A `SystemConfig` fully describes one base-10 timekeeping model: how long a day
 * and year are, the named unit ladder, the calendar nesting, and how time-of-day
 * is written. Two presets ship:
 *
 *   - DECET_STANDARD  (flagship, math-priority): day = 10^4 s, year = 4000 days.
 *       The day is exactly 10,000 s, so time-of-day is a pure 4-digit decimal
 *       second-counter (0000-9999) that reads directly as a fraction of the day.
 *   - DECET_TERRA     (gentle-spin variant): day = 4x10^4 s, year = 1000 days.
 *       Keeps the equator near normal gravity and an ~11 h day, at the cost of a
 *       clock whose finest decimal place is 4 s rather than 1 s.
 *
 * Both sit at the SAME tuned orbit (a = 1.171 AU, year = 4.0e7 s); they differ
 * only in how fast Earth spins.
 */

import { AU } from "./constants.ts";
import { orbitalRadiusForPeriod } from "./physics.ts";

/** A named duration unit, from the second up to the year. */
export interface LadderUnit {
  name: string;
  symbol: string;
  /** Length in SI seconds. */
  seconds: number;
  /** What conventional unit it "feels" like, for humans. */
  gloss: string;
  /** Optional SI-prefix synonym (e.g. a deciday is also a "kilosecond"). */
  alt?: string;
}

/**
 * One place in the calendar's mixed-radix day-of-year address, largest first.
 * `range` = how many of this unit fit in the next-larger one; `placeValue` = how
 * many days one of this unit spans. Product of all `range`s == yearDays.
 */
export interface CalendarLevel {
  name: string;
  symbol: string;
  range: number;
  placeValue: number; // in days
}

/**
 * One decimal place of the time-of-day (a fraction of the day). `secondsEach` is
 * how many SI seconds that place is worth in this model. When `secondsEach` of the
 * finest place is exactly 1, the clock is a pure integer-second counter.
 */
export interface IntradayPlace {
  name: string;
  symbol: string;
  /** Fraction of a day this place represents (0.1, 0.01, ...). */
  dayFraction: number;
  /** SI seconds per unit of this place. */
  secondsEach: number;
}

export interface SystemConfig {
  id: string;
  name: string;
  tagline: string;
  /** Length of one rotation (day) in SI seconds. */
  daySeconds: number;
  /** Whole number of days in one revolution (year). No leap years by construction. */
  yearDays: number;
  /** Tuned orbital radius (AU) — same for both presets. */
  aAU: number;
  ladder: LadderUnit[];
  calendar: CalendarLevel[];
  intraday: IntradayPlace[];
  /** True iff the finest intraday place equals exactly 1 SI second. */
  pureSecondCounter: boolean;
  /** Number of decimal day-fraction digits shown on the clock. */
  clockDigits: number;
  /** Decet epoch expressed as a Unix timestamp (seconds). Shared SI-second timeline. */
  epochUnixSeconds: number;
}

/** 2000-01-01T00:00:00 UTC — the shared anchor where Decet time = 0. */
export const DECET_EPOCH_UNIX = 946_684_800;

/**
 * The exact orbital radius (AU) that makes a year of `daySeconds * yearDays`
 * seconds — so the year is a precise whole number of days (no leap correction),
 * not a rounded label. Both presets have the same 4.0e7 s year -> same radius.
 */
function tunedRadiusAU(daySeconds: number, yearDays: number): number {
  return orbitalRadiusForPeriod(daySeconds * yearDays) / AU;
}

// ---------------------------------------------------------------------------
// DECET STANDARD — the flagship
// ---------------------------------------------------------------------------

export const DECET_STANDARD: SystemConfig = {
  id: "standard",
  name: "Decet Standard",
  tagline: "The day is a 4-digit decimal second. Pure base-10, no leap years.",
  daySeconds: 10_000,
  yearDays: 4000,
  aAU: tunedRadiusAU(10_000, 4000),
  ladder: [
    { name: "second", symbol: "s", seconds: 1, gloss: "the SI/atomic tick (unchanged)" },
    { name: "milliday", symbol: "md", seconds: 10, gloss: "a beat — 1/1000 of a day", alt: "dekasecond" },
    { name: "centiday", symbol: "cd", seconds: 100, gloss: "~1.7 min — the 'minute'", alt: "hectosecond" },
    { name: "deciday", symbol: "dd", seconds: 1000, gloss: "~16.7 min — the 'hour'", alt: "kilosecond" },
    { name: "day", symbol: "D", seconds: 10_000, gloss: "one rotation (~2.78 conv h) = one myriad seconds" },
    { name: "week", symbol: "wk", seconds: 100_000, gloss: "10 days (~1.16 conv days)" },
    { name: "month", symbol: "mo", seconds: 1_000_000, gloss: "100 days (~11.6 conv days)" },
    { name: "season", symbol: "se", seconds: 10_000_000, gloss: "1000 days (~116 conv days)" },
    { name: "year", symbol: "yr", seconds: 40_000_000, gloss: "one revolution (4 seasons)" },
  ],
  calendar: [
    { name: "season", symbol: "S", range: 4, placeValue: 1000 },
    { name: "month", symbol: "M", range: 10, placeValue: 100 },
    { name: "week", symbol: "W", range: 10, placeValue: 10 },
    { name: "day", symbol: "D", range: 10, placeValue: 1 },
  ],
  intraday: [
    { name: "deciday", symbol: "dd", dayFraction: 0.1, secondsEach: 1000 },
    { name: "centiday", symbol: "cd", dayFraction: 0.01, secondsEach: 100 },
    { name: "milliday", symbol: "md", dayFraction: 0.001, secondsEach: 10 },
    { name: "second", symbol: "s", dayFraction: 0.0001, secondsEach: 1 },
  ],
  pureSecondCounter: true,
  clockDigits: 4,
  epochUnixSeconds: DECET_EPOCH_UNIX,
};

// ---------------------------------------------------------------------------
// DECET TERRA — gentle spin, near-normal gravity
// ---------------------------------------------------------------------------

export const DECET_TERRA: SystemConfig = {
  id: "terra",
  name: "Decet Terra",
  tagline: "A gentler ~11 h day that keeps the equator near normal gravity.",
  daySeconds: 40_000,
  yearDays: 1000,
  aAU: tunedRadiusAU(40_000, 1000),
  ladder: [
    { name: "second", symbol: "s", seconds: 1, gloss: "the SI/atomic tick (unchanged)" },
    { name: "milliday", symbol: "md", seconds: 40, gloss: "1/1000 of a day (~40 s)" },
    { name: "centiday", symbol: "cd", seconds: 400, gloss: "~6.7 min — the 'minute'" },
    { name: "deciday", symbol: "dd", seconds: 4000, gloss: "~1.1 conv h — the 'hour'" },
    { name: "day", symbol: "D", seconds: 40_000, gloss: "one rotation (~11.1 conv h)" },
    { name: "week", symbol: "wk", seconds: 400_000, gloss: "10 days (~4.6 conv days)" },
    { name: "month", symbol: "mo", seconds: 4_000_000, gloss: "100 days (~46 conv days)" },
    { name: "year", symbol: "yr", seconds: 40_000_000, gloss: "one revolution (10 months)" },
  ],
  calendar: [
    { name: "month", symbol: "M", range: 10, placeValue: 100 },
    { name: "week", symbol: "W", range: 10, placeValue: 10 },
    { name: "day", symbol: "D", range: 10, placeValue: 1 },
  ],
  intraday: [
    { name: "deciday", symbol: "dd", dayFraction: 0.1, secondsEach: 4000 },
    { name: "centiday", symbol: "cd", dayFraction: 0.01, secondsEach: 400 },
    { name: "milliday", symbol: "md", dayFraction: 0.001, secondsEach: 40 },
    { name: "point", symbol: "p", dayFraction: 0.0001, secondsEach: 4 },
  ],
  pureSecondCounter: false,
  clockDigits: 4,
  epochUnixSeconds: DECET_EPOCH_UNIX,
};

export const PRESETS: SystemConfig[] = [DECET_STANDARD, DECET_TERRA];

export function presetById(id: string): SystemConfig {
  return PRESETS.find((p) => p.id === id) ?? DECET_STANDARD;
}
