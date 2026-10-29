// WORLD lane: the auto-quality governor must recover after a load spike on a vsync-capped display (probe-up with backoff).
// Synthetic frame model: frame = max(16.67, cost(scale, tier)); the loop mirrors render/renderer.mjs render().
import test from "node:test";
import assert from "node:assert/strict";
import { TIER_UP_SCALE, createGovernor, tierAbove, tierBelow, QUALITY_LEVELS } from "../render/quality.mjs";

const TIER_COST = { low: 0.5, medium: 0.75, high: 1, ultra: 1.4 };

function simulate({ start = "high", cost, seconds, state }) {
  const st = state ?? { tier: start, g: createGovernor(), clock: 0, transitions: [], autoTier: start };
  const { g } = st;
  let t = 0;
  while (t < seconds * 1000) {
    const base = typeof cost === "function" ? cost(st.clock + t) : cost;
    const ms = Math.max(1000 / 60, base * TIER_COST[st.tier] * g.scale * g.scale);
    t += ms;
    const before = g.scale, tierBefore = st.tier;
    g.frame(ms);
    g.tierHeadroom = QUALITY_LEVELS.indexOf(st.tier) < QUALITY_LEVELS.indexOf(st.autoTier);
    if (g.tierDownRequested && st.tier !== "low" && (g.urgent || st.clock + t - (st.lastChange ?? -1e9) > 8000)) {
      g.resetWindow(); g.scale = 1; st.tier = tierBelow(st.tier);
    } else if (g.tierUpRequested) {
      g.tierUpRequested = false; g.scale = TIER_UP_SCALE; st.tier = tierAbove(st.tier);
    }
    if (g.scale !== before || st.tier !== tierBefore) { st.transitions.push(st.clock + t); st.lastChange = st.clock + t; }
  }
  st.clock += t;
  return st;
}

test("a load spike then release returns to the original tier and scale within 40 s", () => {
  const st = simulate({ cost: 22, seconds: 25 }); // 22 ms at high/1.0 -> over budget
  const spiked = st.tier !== "high" || st.g.scale < 1;
  assert.ok(spiked, "the spike made the governor degrade");
  simulate({ cost: 8, seconds: 40, state: st });
  assert.equal(st.tier, "high", "tier recovered");
  assert.equal(st.g.scale, 1, "scale recovered");
});

test("a spike heavy enough to drop the tier also recovers the tier", () => {
  const st = simulate({ cost: 70, seconds: 25 });
  assert.notEqual(st.tier, "high", "the tier dropped");
  simulate({ cost: 8, seconds: 40, state: st });
  assert.equal(st.tier, "high");
  assert.equal(st.g.scale, 1);
});

test("permanent heavy load settles with at most 4 transitions per minute", () => {
  const st = simulate({ cost: 22, seconds: 600 });
  for (let m = 2; m < 10; m++) { // after the first two minutes of settling
    const n = st.transitions.filter((t) => t >= m * 60000 && t < (m + 1) * 60000).length;
    assert.ok(n <= 4, `minute ${m}: ${n} transitions`);
  }
  assert.ok(st.g.scale >= 0.6, "never below the floor");
});

test("light load never scales down", () => {
  const st = simulate({ cost: 8, seconds: 120 });
  assert.equal(st.g.scale, 1);
  assert.equal(st.tier, "high");
  assert.equal(st.transitions.length, 0);
});
