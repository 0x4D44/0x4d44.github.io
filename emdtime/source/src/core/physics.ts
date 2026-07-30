/**
 * Orbital + rotational mechanics for the tuned-Earth model.
 *
 * Two free knobs, each with a hard constraint from the brief:
 *   1. Rotation rate  -> day length. Equatorial surface speed must be in [1 km/s, 1% c].
 *   2. Orbital radius -> year length (Kepler). Must stay in the habitable zone,
 *      and orbital speed must stay under 1% c.
 *
 * We additionally TUNE the orbit so a year is an exact whole number of days,
 * which removes leap years entirely.
 */
import {
  AU,
  C_LIGHT,
  EARTH_EQ_CIRCUMFERENCE,
  EARTH_EQ_GRAVITY,
  EARTH_EQ_RADIUS,
  GM_SUN,
  HZ,
  ONE_PERCENT_C,
  ROTATION_SPEED_MAX,
  ROTATION_SPEED_MIN,
} from "./constants.ts";

// ---------------------------------------------------------------------------
// Rotation (day)
// ---------------------------------------------------------------------------

/** Equatorial surface speed (m/s) for a day of `daySeconds`. */
export function equatorialSpeed(daySeconds: number): number {
  return EARTH_EQ_CIRCUMFERENCE / daySeconds;
}

/** Longest day (s) still satisfying v_eq >= 1 km/s. ~40,075 s. */
export const MAX_DAY_SECONDS = EARTH_EQ_CIRCUMFERENCE / ROTATION_SPEED_MIN;
/** Shortest day (s) still satisfying v_eq <= 1% c. ~13.37 s. */
export const MIN_DAY_SECONDS = EARTH_EQ_CIRCUMFERENCE / ROTATION_SPEED_MAX;

export function isRotationLegal(daySeconds: number): boolean {
  const v = equatorialSpeed(daySeconds);
  return v >= ROTATION_SPEED_MIN && v <= ROTATION_SPEED_MAX;
}

/**
 * Effective equatorial gravity (m/s^2) once the planet is spun up.
 * Centrifugal reduction a_c = v^2 / R subtracts from surface gravity.
 * (First-order: ignores the extra equatorial bulge a real spin-up would add.)
 */
export function effectiveEquatorialGravity(daySeconds: number): number {
  const v = equatorialSpeed(daySeconds);
  const centrifugal = (v * v) / EARTH_EQ_RADIUS;
  return EARTH_EQ_GRAVITY - centrifugal;
}

/** Effective equatorial gravity as a fraction of the un-spun value. */
export function gravityFraction(daySeconds: number): number {
  return effectiveEquatorialGravity(daySeconds) / EARTH_EQ_GRAVITY;
}

// ---------------------------------------------------------------------------
// Orbit (year)
// ---------------------------------------------------------------------------

/** Kepler's third law: orbital period (s) for a circular orbit of radius `aMeters`. */
export function orbitalPeriod(aMeters: number): number {
  return 2 * Math.PI * Math.sqrt((aMeters * aMeters * aMeters) / GM_SUN);
}

/** Inverse Kepler: orbital radius (m) that yields period `periodSeconds`. */
export function orbitalRadiusForPeriod(periodSeconds: number): number {
  const t = periodSeconds / (2 * Math.PI);
  return Math.cbrt(GM_SUN * t * t);
}

/** Circular orbital speed (m/s) at radius `aMeters`. */
export function orbitalSpeed(aMeters: number): number {
  return Math.sqrt(GM_SUN / aMeters);
}

/** Insolation relative to present Earth (1.0 = today) for orbital radius `aAU` (in AU). */
export function insolation(aAU: number): number {
  return 1 / (aAU * aAU);
}

export type HZClass = "conservative" | "optimistic" | "outside";

/** Classify an orbital radius (AU) against the habitable zone. */
export function habitableZoneClass(aAU: number): HZClass {
  if (aAU >= HZ.conservative.inner && aAU <= HZ.conservative.outer) return "conservative";
  if (aAU >= HZ.optimistic.inner && aAU <= HZ.optimistic.outer) return "optimistic";
  return "outside";
}

// ---------------------------------------------------------------------------
// Whole-model validation
// ---------------------------------------------------------------------------

export interface ModelParams {
  /** Length of one rotation (day) in SI seconds. */
  daySeconds: number;
  /** Whole number of days in one revolution (year). */
  yearDays: number;
}

export interface ModelReport {
  daySeconds: number;
  yearDays: number;
  yearSeconds: number;
  /** Orbital radius (AU) tuned so the year is exactly yearDays * daySeconds. */
  aAU: number;
  hzClass: HZClass;
  insolation: number;
  equatorialSpeed: number;
  orbitalSpeed: number;
  gravityFraction: number;
  dayConventionalHours: number;
  legal: boolean;
  violations: string[];
}

/**
 * Fully evaluate a (day, year) model: derive the orbit that makes the year an
 * exact multiple of the day, then check every hard constraint from the brief.
 */
export function evaluateModel({ daySeconds, yearDays }: ModelParams): ModelReport {
  const yearSeconds = daySeconds * yearDays;
  const aMeters = orbitalRadiusForPeriod(yearSeconds);
  const aAU = aMeters / AU;
  const hzClass = habitableZoneClass(aAU);
  const vEq = equatorialSpeed(daySeconds);
  const vOrb = orbitalSpeed(aMeters);

  const violations: string[] = [];
  if (vEq < ROTATION_SPEED_MIN)
    violations.push(`rotation too slow: v_eq=${(vEq / 1000).toFixed(3)} km/s < 1 km/s`);
  if (vEq > ROTATION_SPEED_MAX)
    violations.push(`rotation too fast: v_eq=${(vEq / 1000).toFixed(1)} km/s > 1% c`);
  if (hzClass === "outside")
    violations.push(`orbit outside habitable zone: a=${aAU.toFixed(3)} AU`);
  if (vOrb > ONE_PERCENT_C)
    violations.push(`orbital speed exceeds 1% c: ${(vOrb / 1000).toFixed(1)} km/s`);
  if (!Number.isInteger(yearDays))
    violations.push(`year is not a whole number of days: ${yearDays}`);

  return {
    daySeconds,
    yearDays,
    yearSeconds,
    aAU,
    hzClass,
    insolation: insolation(aAU),
    equatorialSpeed: vEq,
    orbitalSpeed: vOrb,
    gravityFraction: gravityFraction(daySeconds),
    dayConventionalHours: daySeconds / 3600,
    legal: violations.length === 0,
    violations,
  };
}

export const SPEED_OF_LIGHT = C_LIGHT;
