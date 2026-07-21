// ALM-BUG-KILN-00032: the longest-streak stat must count calendar days, not a fixed
// 86,400,000 ms delta — a local noon-to-noon gap across a DST change is 23 h / 25 h, which
// split genuinely consecutive streaks. Pinned in a Europe/London clock so the spring-forward
// (28→29→30 Mar 2026) exercises the transition.
process.env.TZ = "Europe/London";

import assert from "node:assert/strict";
import { calculateStats } from "../engine.js";

const plan = (date) => ({ date, maintained: true, duties: [] });
const state = {
  plans: {
    "2026-03-28": plan("2026-03-28"),
    "2026-03-29": plan("2026-03-29"), // clocks spring forward at 01:00 this morning
    "2026-03-30": plan("2026-03-30"),
  },
};

const stats = calculateStats(state, "2026-03-30");
assert.equal(stats.longestStreak, 3, `three consecutive maintained days across the DST change must count as 3, got ${stats.longestStreak}`);

// A genuine gap still breaks the streak.
const gapState = { plans: { "2026-03-28": plan("2026-03-28"), "2026-03-30": plan("2026-03-30") } };
assert.equal(calculateStats(gapState, "2026-03-30").longestStreak, 1, "a missed day still breaks the streak");

console.log("shipshape DST streak test passed");
