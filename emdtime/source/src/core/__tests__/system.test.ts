import { describe, expect, it } from "vitest";
import { DECET_STANDARD, DECET_TERRA, PRESETS, presetById } from "../system.ts";
import { evaluateModel, orbitalPeriod } from "../physics.ts";
import { AU } from "../constants.ts";

describe("preset internal consistency", () => {
  for (const cfg of PRESETS) {
    describe(cfg.name, () => {
      it("calendar ranges multiply up to yearDays", () => {
        const product = cfg.calendar.reduce((p, l) => p * l.range, 1);
        expect(product).toBe(cfg.yearDays);
      });

      it("calendar place values are consistent (each = range of the finer level below)", () => {
        // finest level must have placeValue 1 (a single day)
        expect(cfg.calendar[cfg.calendar.length - 1]!.placeValue).toBe(1);
        // each level's placeValue = next level's range * next level's placeValue
        for (let i = 0; i < cfg.calendar.length - 1; i++) {
          const here = cfg.calendar[i]!;
          const next = cfg.calendar[i + 1]!;
          expect(here.placeValue).toBe(next.range * next.placeValue);
        }
      });

      it("intraday places are powers-of-ten fractions bottoming at the day", () => {
        // coarsest place * 10 == daySeconds; each place is 10x finer than the last
        expect(cfg.intraday[0]!.secondsEach * 10).toBe(cfg.daySeconds);
        for (let i = 0; i < cfg.intraday.length - 1; i++) {
          expect(cfg.intraday[i]!.secondsEach).toBe(cfg.intraday[i + 1]!.secondsEach * 10);
        }
      });

      it("ladder day and year rungs match daySeconds/yearSeconds", () => {
        const day = cfg.ladder.find((u) => u.name === "day");
        const year = cfg.ladder.find((u) => u.name === "year");
        expect(day?.seconds).toBe(cfg.daySeconds);
        expect(year?.seconds).toBe(cfg.daySeconds * cfg.yearDays);
      });

      it("ladder is strictly ascending in seconds", () => {
        for (let i = 1; i < cfg.ladder.length; i++) {
          expect(cfg.ladder[i]!.seconds).toBeGreaterThan(cfg.ladder[i - 1]!.seconds);
        }
      });

      it("the tuned model is physically legal", () => {
        const report = evaluateModel({ daySeconds: cfg.daySeconds, yearDays: cfg.yearDays });
        expect(report.legal).toBe(true);
      });

      it("pureSecondCounter is true iff the finest place is exactly 1 s", () => {
        const finest = cfg.intraday[cfg.intraday.length - 1]!.secondsEach;
        expect(cfg.pureSecondCounter).toBe(finest === 1);
      });
    });
  }
});

describe("tuned orbit yields an exact whole-day year (no leap correction)", () => {
  for (const cfg of PRESETS) {
    it(`${cfg.name}: orbitalPeriod(aAU) / daySeconds ≈ yearDays (not a rounded label)`, () => {
      const daysPerYear = orbitalPeriod(cfg.aAU * AU) / cfg.daySeconds;
      // within 1e-3 of a whole day — the Planet tab reads "leap-free", not "3998.96"
      expect(daysPerYear).toBeCloseTo(cfg.yearDays, 3);
      // and the tuned radius still sits in the conservative habitable zone
      expect(cfg.aAU).toBeGreaterThan(0.95);
      expect(cfg.aAU).toBeLessThan(1.37);
    });
  }
});

describe("both presets share the same tuned orbit", () => {
  it("year in seconds is identical (4.0e7 s) for Standard and Terra", () => {
    const a = DECET_STANDARD.daySeconds * DECET_STANDARD.yearDays;
    const b = DECET_TERRA.daySeconds * DECET_TERRA.yearDays;
    expect(a).toBe(b);
    expect(a).toBe(40_000_000);
  });
});

describe("presetById", () => {
  it("resolves known ids and falls back to Standard", () => {
    expect(presetById("standard")).toBe(DECET_STANDARD);
    expect(presetById("terra")).toBe(DECET_TERRA);
    expect(presetById("nope")).toBe(DECET_STANDARD);
  });
});
