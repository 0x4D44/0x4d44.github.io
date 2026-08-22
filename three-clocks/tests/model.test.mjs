// Unit tests for the Three Clocks forecast model.
//
// A model whose numbers nobody has checked is a graph generator. These
// tests do three jobs:
//
//   1. Check the samplers, because everything above them inherits their
//      bugs silently — a Poisson that is off by one or a truncated
//      normal that quietly clamps produces plausible-looking output.
//   2. Pin the CALIBRATION ANCHORS. The model claims to reproduce
//      published central estimates at its default settings; if a
//      constant is edited and that stops being true, that is a
//      regression in the argument, not just in the code.
//   3. Check the monotonicities. A model in which more decarbonisation
//      produces more warming is broken in a way no eyeball check of a
//      cone will catch.
//
// model.js is a plain browser script, so it is evaluated in a bare
// scope with a fake `window`, exactly as the page loads it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = resolve(HERE, "..");

function load(file) {
  const scope = { window: {} };
  scope.window.window = scope.window;
  new Function("window", readFileSync(join(DOC, file), "utf8"))(scope.window);
  return scope.window;
}

const M = load("model.js").TC_MODEL;
const { makeRng, normal, truncNormal, logNormal, poisson, pareto, quantile } = M._internal;

const at = (series, year) => series[year - 2026];
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// A shared default run. 2,000 samples: enough that the medians are
// stable to the precision these tests assert, and fast enough that the
// suite runs in a couple of seconds.
const RUNS = 2000;
const base = M.run({}, { runs: RUNS });

// ============================================================
// 1. Samplers
// ============================================================

test("the generator is deterministic in its seed and different across seeds", () => {
  const a = makeRng(42), b = makeRng(42), c = makeRng(43);
  const draw = (r) => Array.from({ length: 8 }, () => r());
  assert.deepEqual(draw(a), draw(b));
  assert.notDeepEqual(draw(makeRng(42)), draw(c));
});

test("uniform draws cover [0,1) without clustering", () => {
  const r = makeRng(7);
  const xs = Array.from({ length: 20000 }, () => r());
  assert.ok(xs.every((x) => x >= 0 && x < 1), "out of range");
  assert.ok(Math.abs(mean(xs) - 0.5) < 0.01, `mean was ${mean(xs)}`);
  // Ten equal buckets should each get about a tenth.
  const bins = new Array(10).fill(0);
  xs.forEach((x) => bins[Math.floor(x * 10)]++);
  bins.forEach((b, i) => assert.ok(Math.abs(b - 2000) < 220, `bucket ${i} had ${b}`));
});

test("normal draws have the requested mean and spread", () => {
  const r = makeRng(11);
  const xs = Array.from({ length: 40000 }, () => normal(r, 3, 2));
  const m = mean(xs);
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  assert.ok(Math.abs(m - 3) < 0.05, `mean ${m}`);
  assert.ok(Math.abs(sd - 2) < 0.05, `sd ${sd}`);
});

test("the truncated normal respects its bounds and does not pile up on them", () => {
  const r = makeRng(13);
  const xs = Array.from({ length: 20000 }, () => truncNormal(r, 0.45, 0.18, 0.2, 0.7));
  assert.ok(xs.every((x) => x >= 0.2 && x <= 0.7), "escaped its bounds");
  // The rejection loop falls back to a clamp after 60 tries. With these
  // parameters that should essentially never fire, so the bounds should
  // not be over-represented.
  const onBound = xs.filter((x) => x === 0.2 || x === 0.7 || x === 0.45).length;
  assert.ok(onBound < 20, `${onBound} draws landed exactly on a bound or the fallback`);
});

test("the lognormal is specified by median and geometric spread", () => {
  const r = makeRng(17);
  const xs = Array.from({ length: 40000 }, () => logNormal(r, 9, 1.85)).sort((a, b) => a - b);
  assert.ok(Math.abs(quantile(xs, 0.5) - 9) < 0.25, `median ${quantile(xs, 0.5)}`);
  // ~68% of draws inside [median/gsd, median*gsd]
  const inside = xs.filter((x) => x >= 9 / 1.85 && x <= 9 * 1.85).length / xs.length;
  assert.ok(Math.abs(inside - 0.682) < 0.02, `${(inside * 100).toFixed(1)}% inside one gsd`);
});

test("the Poisson sampler has the right mean and is never negative", () => {
  const r = makeRng(19);
  const xs = Array.from({ length: 40000 }, () => poisson(r, 13.5));
  assert.ok(xs.every((x) => x >= 0 && Number.isInteger(x)), "non-integer or negative count");
  assert.ok(Math.abs(mean(xs) - 13.5) < 0.15, `mean ${mean(xs)}`);
});

test("the Pareto sampler produces the tail it is asked for", () => {
  const r = makeRng(23);
  const xs = Array.from({ length: 40000 }, () => pareto(r, 1000, 0.82)).sort((a, b) => a - b);
  assert.ok(xs[0] >= 1000, "below xmin");
  // Median of a Pareto is xmin * 2^(1/alpha).
  const want = 1000 * Math.pow(2, 1 / 0.82);
  assert.ok(Math.abs(quantile(xs, 0.5) - want) / want < 0.05,
    `median ${quantile(xs, 0.5)}, expected about ${want}`);
});

test("quantile interpolates and handles the ends", () => {
  const s = [1, 2, 3, 4, 5];
  assert.equal(quantile(s, 0), 1);
  assert.equal(quantile(s, 1), 5);
  assert.equal(quantile(s, 0.5), 3);
  assert.equal(quantile(s, 0.25), 2);
  assert.ok(Math.abs(quantile([1, 2], 0.5) - 1.5) < 1e-9, "should interpolate between samples");
});

// ============================================================
// 2. Structure
// ============================================================

test("a run covers 2026 to 2100 inclusive and is finite throughout", () => {
  assert.equal(base.years.length, 75);
  assert.equal(base.years[0], 2026);
  assert.equal(base.years[74], 2100);

  const series = [
    base.climate.temp, base.climate.emissions, base.ai.auto, base.ai.cap, base.peace.per100k,
  ];
  for (const s of series) {
    for (const k of ["p05", "p25", "p50", "p75", "p95", "mean"]) {
      assert.equal(s[k].length, 75, `${k} has the wrong length`);
      assert.ok(s[k].every(Number.isFinite), `${k} contains a non-finite value`);
    }
  }
  for (const h of [base.peace.pNuke, base.peace.pGp, base.ai.pIncident, base.climate.pTip]) {
    assert.ok(h.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), "hazard out of [0,1]");
  }
});

test("percentiles are ordered at every year in every domain", () => {
  for (const s of [base.climate.temp, base.ai.auto, base.peace.per100k]) {
    for (let i = 0; i < 75; i++) {
      assert.ok(s.p05[i] <= s.p25[i] + 1e-9, `p05 > p25 at index ${i}`);
      assert.ok(s.p25[i] <= s.p50[i] + 1e-9, `p25 > p50 at index ${i}`);
      assert.ok(s.p50[i] <= s.p75[i] + 1e-9, `p50 > p75 at index ${i}`);
      assert.ok(s.p75[i] <= s.p95[i] + 1e-9, `p75 > p95 at index ${i}`);
    }
  }
});

test("cumulative hazards only ever increase", () => {
  for (const h of [base.peace.pNuke, base.peace.pGp, base.ai.pIncident, base.climate.pTip]) {
    for (let i = 1; i < h.length; i++) {
      assert.ok(h[i] >= h[i - 1] - 1e-12, `hazard fell between index ${i - 1} and ${i}`);
    }
  }
});

test("the run is reproducible", () => {
  const a = M.run({ policy: 0.4 }, { runs: 300, seed: 99 });
  const b = M.run({ policy: 0.4 }, { runs: 300, seed: 99 });
  assert.deepEqual(a.climate.temp.p50, b.climate.temp.p50);
  assert.deepEqual(a.peace.pNuke, b.peace.pNuke);
});

test("unknown driver keys are ignored rather than corrupting the run", () => {
  const r = M.run({ nonsense: 5, policy: 0.5 }, { runs: 200 });
  assert.ok(!("nonsense" in r.drivers));
  assert.ok(Number.isFinite(at(r.climate.temp.p50, 2100)));
});

// ============================================================
// 3. Calibration anchors
// ------------------------------------------------------------
// These are the claims the site makes about itself. If an edit to the
// constants breaks one, the prose is now wrong too.
// ============================================================

test("ANCHOR: default 2100 warming reproduces the Climate Action Tracker current-policies estimate", () => {
  const t = at(base.climate.temp.p50, 2100);
  // CAT's 2025 update: about 2.6 degC under implemented policies. Their
  // own published range for that scenario is roughly 2.3-2.9.
  assert.ok(t > 2.3 && t < 2.9, `default 2100 median was ${t.toFixed(2)} degC`);
});

test("ANCHOR: present-day warming matches the thermometer", () => {
  // Every sampled world is conditioned on the observed 2025 anomaly of
  // 1.44 +/- 0.13 degC, so the 2026 median must land on it.
  const t = at(base.climate.temp.p50, 2026);
  assert.ok(Math.abs(t - 1.44) < 0.12, `2026 median was ${t.toFixed(2)} degC`);
});

test("ANCHOR: conditioning narrows TCRE, and cuts the low side", () => {
  // The prose states a specific quantitative claim about this step:
  // roughly a third of draws are rejected, and the likely range narrows
  // from 0.30-0.63 to 0.38-0.59, with the cut falling almost entirely on
  // the low-sensitivity side. That last part is the interesting bit — a
  // low-TCRE world cannot account for the warming already measured — and
  // it is what makes the lower edge of the climate cone tighter than the
  // AR6 prior alone would give. If an edit to the constants breaks any
  // of it, the method section is now lying.
  const rand = makeRng(4242);
  const prior = [], kept = [];
  for (let i = 0; i < 60000; i++) {
    const tcre = truncNormal(rand, M.K.TCRE, M.K.TCRE_SD, 0.15, 0.95);
    const cum = normal(rand, M.K.CUM_CO2, M.K.CUM_CO2_SD);
    const resid = normal(rand, M.K.OBS_2025, M.K.OBS_SD) - tcre * cum / 1000;
    prior.push(tcre);
    if (resid >= M.K.NONCO2_LO && resid <= M.K.NONCO2_HI) kept.push(tcre);
  }
  prior.sort((a, b) => a - b);
  kept.sort((a, b) => a - b);

  const survival = kept.length / prior.length;
  assert.ok(survival > 0.55 && survival < 0.8,
    `${(survival * 100).toFixed(0)}% of draws survived; the prose says about two thirds`);

  const pLo = quantile(prior, 0.17), pHi = quantile(prior, 0.83);
  const kLo = quantile(kept, 0.17), kHi = quantile(kept, 0.83);

  // The prior is the AR6 likely range, because it was parameterised to be.
  assert.ok(Math.abs(pLo - 0.30) < 0.04, `prior floor ${pLo.toFixed(3)}, expected ~0.30`);
  assert.ok(Math.abs(pHi - 0.63) < 0.04, `prior ceiling ${pHi.toFixed(3)}, expected ~0.63`);

  // Conditioning narrows it.
  assert.ok(kHi - kLo < (pHi - pLo) * 0.85,
    `conditioning barely narrowed the range: ${(pHi - pLo).toFixed(3)} -> ${(kHi - kLo).toFixed(3)}`);
  assert.ok(Math.abs(kLo - 0.38) < 0.04, `conditioned floor ${kLo.toFixed(3)}, prose says ~0.38`);
  assert.ok(Math.abs(kHi - 0.59) < 0.04, `conditioned ceiling ${kHi.toFixed(3)}, prose says ~0.59`);

  // And the cut falls mostly on the low side.
  assert.ok((kLo - pLo) > (pHi - kHi) * 1.5,
    `the low side moved ${(kLo - pLo).toFixed(3)} and the high side ${(pHi - kHi).toFixed(3)}; ` +
    "the prose claims the cut is asymmetric");
});

test("ANCHOR: conflict deaths reproduce the observed present-day rate", () => {
  // UCDP put battle-related deaths in 2025 in the neighbourhood of
  // 150,000-170,000 (the widely quoted 244,600 is all organised
  // violence, which is a broader category than this module models).
  // Within a factor of two of that is the standard the model claims.
  const d2030 = at(base.peace.rate.p50, 2030);
  assert.ok(d2030 > 75000 && d2030 < 340000,
    `median annual battle deaths in 2030 came out at ${Math.round(d2030)}`);
});

test("ANCHOR: the conflict tail is fat — the mean is far above the median", () => {
  // This is the peace section's central quantitative claim. A model in
  // which the two converge has lost the argument it exists to make.
  const m = at(base.peace.per100k.mean, 2060);
  const q = at(base.peace.per100k.p50, 2060);
  assert.ok(m / q > 3, `mean was only ${(m / q).toFixed(1)}x the median`);
  assert.ok(m / q < 40, `mean was ${(m / q).toFixed(1)}x the median, which suggests a runaway tail`);
});

test("ANCHOR: automation never falls below where it already is", () => {
  // The ratchet. Deployed automation does not un-deploy when capability
  // stalls, so the fifth percentile must not dip below the starting
  // value; a cone whose floor drops below the present is drawing a
  // future that cannot happen.
  const p05 = base.ai.auto.p05;
  for (let i = 1; i < p05.length; i++) {
    assert.ok(p05[i] >= p05[i - 1] - 1e-9, `the 5th percentile fell at index ${i}`);
  }
  assert.ok(p05[0] >= 1.4, `automation starts at ${p05[0]}%, below today's deployment`);
});

// ============================================================
// 4. Monotonicity — the drivers must push the way they claim to
// ============================================================

test("more decarbonisation gives less warming, monotonically", () => {
  const t = [0, 0.25, 0.5, 0.75, 1].map(
    (policy) => at(M.run({ policy }, { runs: 700, seed: 31337 }).climate.temp.p50, 2100));
  for (let i = 1; i < t.length; i++) {
    assert.ok(t[i] < t[i - 1], `warming did not fall from step ${i - 1} (${t[i - 1].toFixed(2)}) to ${i} (${t[i].toFixed(2)})`);
  }
  assert.ok(t[0] - t[4] > 1.0,
    `the whole policy range moved warming by only ${(t[0] - t[4]).toFixed(2)} degC`);
});

test("carbon removal lowers warming without being able to rescue the peak", () => {
  const none = M.run({ removal: 0 }, { runs: 700, seed: 555 });
  const lots = M.run({ removal: 1 }, { runs: 700, seed: 555 });
  assert.ok(at(lots.climate.temp.p50, 2100) < at(none.climate.temp.p50, 2100),
    "removal did not lower end-of-century warming");
  // Removal arrives too late to change the middle of the century much.
  const near = Math.abs(at(lots.climate.temp.p50, 2040) - at(none.climate.temp.p50, 2040));
  assert.ok(near < 0.15, `removal moved 2040 warming by ${near.toFixed(2)} degC, which is too early to be credible`);
});

test("arms control lowers the nuclear hazard and rivalry raises it", () => {
  const seed = 8080, runs = 1500;
  const lo = M.run({ armsControl: 0 }, { runs, seed });
  const hi = M.run({ armsControl: 1 }, { runs, seed });
  assert.ok(at(hi.peace.pNuke, 2100) < at(lo.peace.pNuke, 2100),
    "restoring arms control did not lower the nuclear hazard");

  const calm = M.run({ rivalry: 0 }, { runs, seed });
  const hard = M.run({ rivalry: 1 }, { runs, seed });
  assert.ok(at(hard.peace.pNuke, 2100) > at(calm.peace.pNuke, 2100),
    "hardening rivalry did not raise the nuclear hazard");
  assert.ok(at(hard.peace.pGp, 2100) > at(calm.peace.pGp, 2100),
    "hardening rivalry did not raise the great-power war hazard");
});

test("scaling raises capability and friction delays its deployment", () => {
  const seed = 606, runs = 900;
  const slow = M.run({ scaling: 0 }, { runs, seed });
  const fast = M.run({ scaling: 1 }, { runs, seed });
  assert.ok(at(fast.ai.cap.p50, 2060) > at(slow.ai.cap.p50, 2060),
    "the scaling driver did not raise the capability index");

  const free = M.run({ diffusion: 0 }, { runs, seed });
  const stuck = M.run({ diffusion: 1 }, { runs, seed });
  assert.ok(at(free.ai.auto.p50, 2050) > at(stuck.ai.auto.p50, 2050),
    "deployment friction did not slow automation");
  // Friction cuts both ways: it also delays the incident hazard, which
  // is a claim the prose makes explicitly.
  assert.ok(at(free.ai.pIncident, 2060) > at(stuck.ai.pIncident, 2060),
    "friction did not also reduce the incident hazard");
});

test("a wall is representable: some worlds end the century barely automated", () => {
  // If no sampled world plateaus, the model cannot express the
  // sceptical case and the AI cone is an advertisement rather than a
  // forecast.
  const r = M.run({ scaling: 0 }, { runs: 1500, seed: 1234 });
  assert.ok(at(r.ai.auto.p05, 2100) < 8,
    `even the 5th percentile reached ${at(r.ai.auto.p05, 2100).toFixed(1)}% automation`);
});

// ============================================================
// 5. Coupling
// ============================================================

test("switching coupling off changes the answer, but not by much", () => {
  // Both halves matter. If nothing changes, the coupling code is dead;
  // if everything changes, the site's claim that these are three
  // problems rather than one is wrong.
  const seed = 2718, runs = 1500;
  const on = M.run({ coupling: true }, { runs, seed });
  const off = M.run({ coupling: false }, { runs, seed });

  const dT = Math.abs(at(on.climate.temp.p50, 2100) - at(off.climate.temp.p50, 2100));
  const dN = Math.abs(at(on.peace.pNuke, 2100) - at(off.peace.pNuke, 2100));
  assert.ok(dT + dN > 0.005, "coupling appears to do nothing at all");
  assert.ok(dT < 0.5, `coupling moved 2100 warming by ${dT.toFixed(2)} degC`);
  assert.ok(dN < 0.22, `coupling moved the nuclear hazard by ${(dN * 100).toFixed(1)} points`);
});

// ============================================================
// 6. Nuclear severity
// ============================================================

test("the exchange mixture spans four orders of magnitude and is bounded", () => {
  const d = base.peace.nukeDeaths;
  assert.ok(d.length > 100, `only ${d.length} sampled exchanges to characterise`);
  assert.ok(d.every((x) => x >= 200 && x <= 2e9), "an exchange escaped its bounds");
  const lo = quantile(d, 0.1), hi = quantile(d, 0.9);
  assert.ok(hi / lo > 100,
    `the 10th-to-90th span was only ${(hi / lo).toFixed(0)}x — the mixture has collapsed`);
});

test("the site reports nuclear severity as a decomposition, not one number", () => {
  // P(any use) must be materially larger than P(a very large exchange);
  // if they are close, reporting them separately is pointless and the
  // mixture weights are wrong.
  const any = at(base.peace.pNuke, 2100);
  assert.ok(base.peace.pNukeVeryBig < any * 0.45,
    "the probability of a catastrophic exchange is too close to the probability of any use");
  assert.ok(base.peace.pNukeVeryBig > 0.005, "catastrophic exchanges essentially never happen");
});

test("nuclear deaths stay out of the conflict cone", () => {
  // The prose says so explicitly. If they leaked in, the peace cone's
  // upper percentiles would jump wherever exchanges happened to land.
  const p95 = base.peace.per100k.p95;
  for (let i = 1; i < p95.length; i++) {
    const jump = p95[i] / Math.max(p95[i - 1], 1e-6);
    assert.ok(jump < 3.2, `the 95th percentile jumped ${jump.toFixed(1)}x at index ${i}`);
  }
});

test("ANCHOR: the wartime escalation probability is the one the prose states", () => {
  // Both the model's own comment on NUKE_WAR_MULT and the objections page
  // tell the reader that a sustained great-power war goes nuclear about
  // one time in eight at the default settings. That figure is not a model
  // output anyone can read off a chart — it is implied by the hazard
  // prior, the multiplier and the duration distribution together — so it
  // is pinned here, because it is the single most consequential judgement
  // on the site and the easiest to invalidate by accident.
  const rand = makeRng(31337);
  const armsMult = 1.60 + (0.50 - 1.60) * M.DEFAULTS.armsControl;
  const rivMult = 0.70 + (1.50 - 0.70) * M.DEFAULTS.rivalry;
  let hit = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) {
    const h = Math.min(1,
      logNormal(rand, M.K.NUKE_HAZARD, M.K.NUKE_GSD) * armsMult * rivMult * M.K.NUKE_WAR_MULT);
    const years = 1 + Math.floor(rand() * 5);
    if (1 - Math.pow(1 - h, years) > rand()) hit++;
  }
  const p = hit / N;
  assert.ok(p > 0.09 && p < 0.17,
    `a sustained great-power war goes nuclear ${(p * 100).toFixed(1)}% of the time; ` +
    "the prose and the NUKE_WAR_MULT comment both say about one in eight");
});

// ============================================================
// 7. Regressions from the adversarial review
// ------------------------------------------------------------
// Each of these pins a defect a reviewer found. They are the tests most
// likely to catch a future edit that quietly reintroduces one.
// ============================================================

test("REGRESSION: the conflict process starts in steady state, not from empty", () => {
  // The list of running conflicts used to start empty, so the first
  // decade of the peace cone was a cold-start artefact: deaths climbed
  // steeply out of 2026 towards a steady state they should have started
  // at, directly beneath a line labelled "2025 observed". A burn-in now
  // runs the process for decades before the recorded period begins.
  const early = at(base.peace.rate.p50, 2026);
  const late = at(base.peace.rate.p50, 2060);
  assert.ok(early > late * 0.6,
    `2026 is ${Math.round(early)} against ${Math.round(late)} in 2060 — the cold start is back`);
  // And the level should sit near the observed present: UCDP's 2025
  // state-based battle deaths were roughly 150,000.
  assert.ok(early > 90000 && early < 260000,
    `2026 median came out at ${Math.round(early)}`);
});

test("REGRESSION: smoothing does not distort the endpoints", () => {
  // A centred mean that shrank its window at the edges was not removing
  // noise there, it was shifting the level — it roughly doubled the
  // first value of any series climbing steeply out of 2026. The first
  // and last points are now left alone, so the first year of the
  // temperature series must still match the observed anomaly it is
  // conditioned on.
  const t2026 = at(base.climate.temp.p50, 2026);
  assert.ok(Math.abs(t2026 - 1.44) < 0.12,
    `2026 warming came out at ${t2026.toFixed(3)}, which suggests the edge window is back`);
  // A steeply-rising series is the sensitive case: capability starts at
  // zero by construction, so a shrunken window would lift it off zero.
  assert.ok(at(base.ai.cap.p50, 2026) < 1.4,
    `the capability index starts at ${at(base.ai.cap.p50, 2026).toFixed(2)}, which is an edge artefact`);
});

test("REGRESSION: the crossing year is a median over worlds, not a median path", () => {
  // exceedYear() used to read the first year the smoothed median band
  // touched a threshold. That answers "when does the middle of the
  // distribution cross" rather than "when does a typical world cross",
  // and the two differ by several years on a skewed distribution. It
  // also could not express the worlds that never cross at all.
  const x15 = base.climate.exceed["1.5"];
  const x20 = base.climate.exceed["2.0"];
  for (const x of [x15, x20]) {
    assert.ok(x && typeof x === "object", "exceed should carry a year and a never-share");
    assert.ok("year" in x && "never" in x, "exceed is missing a field");
    assert.ok(x.never >= 0 && x.never <= 1, `never-share out of range: ${x.never}`);
  }
  assert.ok(x15.year >= 2026 && x15.year <= 2035, `1.5C crossing at ${x15.year}`);
  assert.ok(x20.year > x15.year, "2.0C cannot be crossed before 1.5C");
  // Some worlds genuinely never reach 2 degrees; that is a real result
  // and the old statistic could not report it.
  assert.ok(x20.never > 0.005,
    "no sampled world avoids 2 degrees, which suggests the low tail has been lost");
});

test("REGRESSION: the model still runs fast enough to drag a slider against", () => {
  const t0 = Date.now();
  M.run({}, { runs: 500 });
  const ms = Date.now() - t0;
  assert.ok(ms < 900, `500 runs took ${ms}ms; the burn-in has made it too slow to be interactive`);
});
