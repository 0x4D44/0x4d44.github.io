import { describe, expect, it } from "vitest";
import { DECET_STANDARD } from "../system.ts";
import {
  breakdownDuration,
  conventionalDuration,
  formatDurationDecimal,
  fromDate,
  instantToUnix,
  nowDecet,
  toDate,
  unixToInstant,
} from "../convert.ts";

const EPOCH_ISO = "2000-01-01T00:00:00.000Z";
const EPOCH_UNIX = 946_684_800;

describe("epoch mapping", () => {
  it("the Decet epoch is 2000-01-01T00:00:00Z", () => {
    expect(DECET_STANDARD.epochUnixSeconds).toBe(EPOCH_UNIX);
    expect(unixToInstant(DECET_STANDARD, EPOCH_UNIX)).toBe(0);
    expect(new Date(EPOCH_ISO).getTime() / 1000).toBe(EPOCH_UNIX);
  });

  it("the epoch decodes to Y0 D0 T0", () => {
    const t = fromDate(DECET_STANDARD, new Date(EPOCH_ISO));
    expect([t.year, t.dayOfYear, t.secondOfDay]).toEqual([0, 0, 0]);
  });

  it("unix <-> instant is an exact inverse", () => {
    for (const u of [0, EPOCH_UNIX, EPOCH_UNIX + 12_345, 1_700_000_000]) {
      expect(instantToUnix(DECET_STANDARD, unixToInstant(DECET_STANDARD, u))).toBe(u);
    }
  });

  it("Date <-> instant round-trips", () => {
    const d = new Date("2026-07-10T13:37:00.000Z");
    const t = fromDate(DECET_STANDARD, d);
    const back = toDate(DECET_STANDARD, t.instant);
    expect(back.getTime()).toBe(Math.floor(d.getTime() / 1000) * 1000);
  });
});

describe("one Decet day after epoch is 10,000 s later (= 2h46m40s conventional)", () => {
  it("advances the calendar by exactly one day", () => {
    const oneDayMs = (EPOCH_UNIX + 10_000) * 1000;
    const t = nowDecet(DECET_STANDARD, oneDayMs);
    expect([t.year, t.dayOfYear, t.secondOfDay]).toEqual([0, 1, 0]);
  });
});

describe("duration formatting", () => {
  it("decimal form picks a sensible unit", () => {
    expect(formatDurationDecimal(DECET_STANDARD, 300)).toBe("3 cd"); // 5-min egg
    expect(formatDurationDecimal(DECET_STANDARD, 1500)).toBe("1.5 dd"); // pomodoro
    expect(formatDurationDecimal(DECET_STANDARD, 1)).toBe("1 s");
    expect(formatDurationDecimal(DECET_STANDARD, 0)).toBe("0 s");
  });

  it("greedy breakdown decomposes largest-first", () => {
    expect(breakdownDuration(DECET_STANDARD, 23_456)).toBe("2 D 3 dd 4 cd 5 md 6 s");
    expect(breakdownDuration(DECET_STANDARD, 10_000)).toBe("1 D");
    expect(breakdownDuration(DECET_STANDARD, 0)).toBe("0 s");
  });

  it("conventional reference is correct", () => {
    expect(conventionalDuration(10_000)).toBe("2:46:40"); // one Decet day
    expect(conventionalDuration(300)).toBe("5:00");
    expect(conventionalDuration(90)).toBe("1:30");
  });
});
