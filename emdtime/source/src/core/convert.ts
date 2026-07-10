/**
 * Interop with conventional time.
 *
 * Both systems share the SI second and a single epoch instant, so ONLY instants
 * convert exactly (a Decet year is not a Gregorian year). The rule is: convert
 * instants, never calendar fields. We count elapsed SI seconds from the shared
 * epoch; that integer is the Decet instant. (Leap seconds are ignored here — we
 * treat the timeline as continuous atomic time, which is the honest model for a
 * decimal reckoning; a production system would apply the leap table only when
 * rendering civil UTC.)
 */
import { fromInstant, type DecetTime } from "./reckon.ts";
import type { LadderUnit, SystemConfig } from "./system.ts";

/** Unix seconds -> Decet instant (SI seconds since the Decet epoch). */
export function unixToInstant(config: SystemConfig, unixSeconds: number): number {
  return unixSeconds - config.epochUnixSeconds;
}

/** Decet instant -> Unix seconds. */
export function instantToUnix(config: SystemConfig, instant: number): number {
  return instant + config.epochUnixSeconds;
}

/** A JavaScript Date -> Decet time. */
export function fromDate(config: SystemConfig, date: Date): DecetTime {
  return fromInstant(config, unixToInstant(config, date.getTime() / 1000));
}

/** A Decet instant -> JavaScript Date. */
export function toDate(config: SystemConfig, instant: number): Date {
  return new Date(instantToUnix(config, instant) * 1000);
}

/** The current Decet instant. `nowMs` is injectable for testing. */
export function nowInstant(config: SystemConfig, nowMs: number): number {
  return unixToInstant(config, nowMs / 1000);
}

/** The current Decet time. `nowMs` is injectable for testing. */
export function nowDecet(config: SystemConfig, nowMs: number): DecetTime {
  return fromInstant(config, nowInstant(config, nowMs));
}

// ---------------------------------------------------------------------------
// Durations — base-10 makes these trivial rescalings of the second
// ---------------------------------------------------------------------------

/** Express a duration (seconds) as a decimal count of `unit`. */
export function inUnit(seconds: number, unit: LadderUnit): number {
  return seconds / unit.seconds;
}

/**
 * Pick the "nicest" ladder unit for a duration and format it, e.g.
 * 1500 s -> "1.5 dd", 300 s -> "3 cd", 45 s -> "4.5 md".
 * Chooses the largest unit for which the value is >= 1.
 */
export function formatDurationDecimal(config: SystemConfig, seconds: number): string {
  if (seconds === 0) return `0 ${config.ladder[0]!.symbol}`;
  const sign = seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  // ladder is ascending by seconds; find largest unit <= abs (or smallest if abs<all).
  let chosen = config.ladder[0]!;
  for (const u of config.ladder) {
    if (u.seconds <= abs) chosen = u;
  }
  const value = abs / chosen.seconds;
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(3).replace(/\.?0+$/, "");
  return `${sign}${rounded} ${chosen.symbol}`;
}

/**
 * Greedy multi-unit breakdown, largest first, e.g. 23_456 s ->
 * "2 D 3 dd 4 cd 5 md 6 s". Skips zero components.
 */
export function breakdownDuration(config: SystemConfig, seconds: number): string {
  let rem = Math.abs(Math.floor(seconds));
  const parts: string[] = [];
  const descending = [...config.ladder].reverse();
  for (const u of descending) {
    if (u.seconds < 1) continue;
    const count = Math.floor(rem / u.seconds);
    if (count > 0) {
      parts.push(`${count} ${u.symbol}`);
      rem -= count * u.seconds;
    }
  }
  if (parts.length === 0) return `0 ${config.ladder[0]!.symbol}`;
  const sign = seconds < 0 ? "-" : "";
  return sign + parts.join(" ");
}

/** Conventional H:MM:SS reference for a duration in seconds. */
export function conventionalDuration(seconds: number): string {
  const s = Math.abs(Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const sign = seconds < 0 ? "-" : "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${sign}${h}:${pad(m)}:${pad(sec)}` : `${sign}${m}:${pad(sec)}`;
}
