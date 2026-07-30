import { describe, expect, it } from "vitest";
import { DECET_STANDARD, DECET_TERRA } from "../system.ts";
import {
  floorDiv,
  floorMod,
  formatCalendarAddress,
  formatClock,
  formatTimestamp,
  formatWatch,
  fromInstant,
  toInstant,
} from "../reckon.ts";

describe("floor helpers behave for negatives", () => {
  it("floorDiv / floorMod", () => {
    expect(floorDiv(-1, 10)).toBe(-1);
    expect(floorMod(-1, 10)).toBe(9);
    expect(floorMod(9999_9, 10)).toBe(9);
    expect(floorDiv(7, 10)).toBe(0);
  });
});

describe("Standard decomposition (the worked example)", () => {
  const t = fromInstant(DECET_STANDARD, 292_345_000);
  it("digit-slices year 7, day 1234, second 5000", () => {
    expect(t.year).toBe(7);
    expect(t.dayOfYear).toBe(1234);
    expect(t.secondOfDay).toBe(5000);
  });
  it("calendar address is S1 M2 W3 D4", () => {
    expect(formatCalendarAddress(t)).toBe("S1 M2 W3 D4");
  });
  it("clock reads .5000 (exact midday) and watch 50:00", () => {
    expect(formatClock(DECET_STANDARD, t.secondOfDay)).toBe(".5000");
    expect(formatWatch(DECET_STANDARD, t.secondOfDay)).toBe("50:00");
    expect(t.dayFraction).toBe(0.5);
  });
  it("full timestamp is Y0007-D1234-T5000", () => {
    expect(formatTimestamp(DECET_STANDARD, t)).toBe("Y0007-D1234-T5000");
  });
});

describe("clock anchors", () => {
  it("quarter / midday / three-quarters", () => {
    expect(formatClock(DECET_STANDARD, 0)).toBe(".0000");
    expect(formatClock(DECET_STANDARD, 2500)).toBe(".2500");
    expect(formatClock(DECET_STANDARD, 5000)).toBe(".5000");
    expect(formatClock(DECET_STANDARD, 7500)).toBe(".7500");
    expect(formatClock(DECET_STANDARD, 9999)).toBe(".9999");
  });
});

describe("negative (pre-epoch) instants", () => {
  it("t = -1 s is the last second of year -1", () => {
    const t = fromInstant(DECET_STANDARD, -1);
    expect(t.year).toBe(-1);
    expect(t.dayOfYear).toBe(3999);
    expect(t.secondOfDay).toBe(9999);
  });
});

describe("round-trip fromInstant/toInstant", () => {
  for (const cfg of [DECET_STANDARD, DECET_TERRA]) {
    it(`${cfg.name}: exhaustive-ish round trip incl. negatives`, () => {
      // deterministic spread of instants across many years, both signs
      const samples: number[] = [];
      for (let k = -3; k <= 3; k++) {
        for (let j = 0; j < 20; j++) {
          samples.push(k * 37_000_003 + j * 1_234_567);
        }
      }
      samples.push(0, -1, 1, cfg.daySeconds - 1, cfg.daySeconds, cfg.daySeconds * cfg.yearDays - 1);
      for (const inst of samples) {
        const t = fromInstant(cfg, inst);
        const back = toInstant(cfg, {
          year: t.year,
          dayOfYear: t.dayOfYear,
          secondOfDay: t.secondOfDay,
        });
        expect(back).toBe(inst);
        // fields stay in range
        expect(t.dayOfYear).toBeGreaterThanOrEqual(0);
        expect(t.dayOfYear).toBeLessThan(cfg.yearDays);
        expect(t.secondOfDay).toBeGreaterThanOrEqual(0);
        expect(t.secondOfDay).toBeLessThan(cfg.daySeconds);
      }
    });
  }
});

describe("Terra clock (impure — 4-second grain)", () => {
  it("midday reads .5000 but the finest digit is worth 4 s", () => {
    // secondOfDay 20000 == half of 40000
    expect(formatClock(DECET_TERRA, 20_000)).toBe(".5000");
    // 20003 s -> still .5000 because the finest place is 4 s (20003 -> point digit floor(20003/4)%10 = 0? )
    // point secondsEach = 4: floor(20003/4)=5000, %10 = 0; milliday floor(20003/40)=500 %10=0 ...
    expect(formatClock(DECET_TERRA, 20_003)).toBe(".5000");
    expect(formatClock(DECET_TERRA, 20_004)).toBe(".5001");
  });
});
