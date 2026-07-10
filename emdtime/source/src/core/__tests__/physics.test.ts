import { describe, expect, it } from "vitest";
import {
  AU,
  CONVENTIONAL_DAY,
  EARTH_EQ_CIRCUMFERENCE,
  ONE_PERCENT_C,
  SIDEREAL_YEAR,
} from "../constants.ts";
import {
  MAX_DAY_SECONDS,
  MIN_DAY_SECONDS,
  effectiveEquatorialGravity,
  equatorialSpeed,
  evaluateModel,
  habitableZoneClass,
  insolation,
  isRotationLegal,
  orbitalPeriod,
  orbitalRadiusForPeriod,
} from "../physics.ts";

describe("rotation constraint", () => {
  it("present Earth's day FAILS the >1 km/s rule (this is what forces a shorter day)", () => {
    expect(equatorialSpeed(CONVENTIONAL_DAY)).toBeLessThan(1000);
    expect(isRotationLegal(CONVENTIONAL_DAY)).toBe(false);
  });

  it("legal day window is ~13.4 s .. ~40,075 s", () => {
    expect(MIN_DAY_SECONDS).toBeCloseTo(13.368, 2);
    expect(MAX_DAY_SECONDS).toBeCloseTo(40_075.02, 1);
    // boundaries: just inside is legal, just outside is not.
    expect(isRotationLegal(MAX_DAY_SECONDS - 1)).toBe(true);
    expect(isRotationLegal(MAX_DAY_SECONDS + 1)).toBe(false);
    expect(isRotationLegal(MIN_DAY_SECONDS + 0.01)).toBe(true);
    expect(isRotationLegal(MIN_DAY_SECONDS - 0.01)).toBe(false);
  });

  it("a 10,000 s day spins the equator to ~4.008 km/s", () => {
    expect(equatorialSpeed(10_000)).toBeCloseTo(4007.5, 0);
    expect(isRotationLegal(10_000)).toBe(true);
  });

  it("equatorial gravity drops to ~74% for a 10,000 s day", () => {
    const g = effectiveEquatorialGravity(10_000);
    expect(g / 9.78).toBeCloseTo(0.743, 2);
  });
});

describe("Kepler round-trip", () => {
  it("orbitalPeriod(1 AU) ≈ sidereal year", () => {
    expect(orbitalPeriod(AU)).toBeCloseTo(SIDEREAL_YEAR, -3); // within ~1000 s
  });

  it("orbitalRadiusForPeriod is the inverse of orbitalPeriod", () => {
    for (const aAU of [0.75, 0.9, 1.0, 1.171, 1.359, 1.7]) {
      const a = aAU * AU;
      expect(orbitalRadiusForPeriod(orbitalPeriod(a))).toBeCloseTo(a, 0);
    }
  });

  it("insolation is 1.0 at 1 AU and falls as 1/a^2", () => {
    expect(insolation(1)).toBeCloseTo(1, 6);
    expect(insolation(2)).toBeCloseTo(0.25, 6);
  });
});

describe("habitable-zone classification", () => {
  it("classifies known radii", () => {
    expect(habitableZoneClass(1.0)).toBe("conservative");
    expect(habitableZoneClass(1.171)).toBe("conservative");
    expect(habitableZoneClass(0.8)).toBe("optimistic");
    expect(habitableZoneClass(0.5)).toBe("outside");
    expect(habitableZoneClass(2.2)).toBe("outside");
  });
});

describe("evaluateModel (the flagship design)", () => {
  const m = evaluateModel({ daySeconds: 10_000, yearDays: 4000 });

  it("is fully legal", () => {
    expect(m.legal).toBe(true);
    expect(m.violations).toEqual([]);
  });

  it("year is exactly 4000 days = 4.0e7 s (no leap years by construction)", () => {
    expect(m.yearSeconds).toBe(40_000_000);
    expect(Number.isInteger(m.yearDays)).toBe(true);
  });

  it("tuned orbit lands at ~1.171 AU in the conservative HZ", () => {
    expect(m.aAU).toBeCloseTo(1.171, 2);
    expect(m.hzClass).toBe("conservative");
  });

  it("insolation ~0.73 (a bit cooler than today, still comfortably habitable)", () => {
    expect(m.insolation).toBeCloseTo(0.729, 2);
  });

  it("orbital speed is far below 1% c", () => {
    expect(m.orbitalSpeed).toBeLessThan(ONE_PERCENT_C);
    expect(m.orbitalSpeed / 1000).toBeCloseTo(27.5, 0);
  });

  it("a conventional day is ~2.78 hours here", () => {
    expect(m.dayConventionalHours).toBeCloseTo(2.778, 2);
  });
});

describe("evaluateModel rejects illegal models", () => {
  it("flags the present-Earth day as too slow", () => {
    const m = evaluateModel({ daySeconds: 86_400, yearDays: 365 });
    expect(m.legal).toBe(false);
    expect(m.violations.some((v) => v.includes("too slow"))).toBe(true);
  });

  it("flags a 1000-day / 10,000 s year as too hot (outside HZ)", () => {
    // 1000 * 10,000 = 1e7 s -> a ≈ 0.465 AU -> Venus-hot
    const m = evaluateModel({ daySeconds: 10_000, yearDays: 1000 });
    expect(m.hzClass).toBe("outside");
    expect(m.legal).toBe(false);
  });

  it("sanity: circumference matches WGS-84", () => {
    expect(EARTH_EQ_CIRCUMFERENCE).toBeCloseTo(40_075_016.7, 0);
  });
});
