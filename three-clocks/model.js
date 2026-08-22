// ============================================================
// Three Clocks — the forecasting model.
//
// A seeded Monte Carlo over three coupled domains: machine capability
// and its diffusion, the carbon cycle and its temperature response, and
// the arrival process of organised violence. It runs in the page, in
// about a fifth of a second, and it is the only thing on the site that
// draws the cone: every band, every percentile and every headline
// probability in the interface is computed here, from the parameters
// below, at the moment you look at it.
//
// WHAT THIS IS. A structured way of stating uncertainty. The three
// modules are reduced-form: a two-parameter carbon-cycle-and-TCRE model,
// a capability-then-diffusion model of automation, and a
// Poisson-arrivals-with-heavy-tailed-severity model of war. Each is a
// caricature of a literature. The point is not that the caricature is
// right; it is that stating a forecast as a generative model forces the
// assumptions into the open, where they can be argued with, and forces
// the answer to be a distribution rather than a number.
//
// WHAT THIS IS NOT. A climate model (those solve fluid dynamics on a
// sphere; this multiplies cumulative carbon by a constant). An economic
// model. Anything with predictive skill beyond the skill of the priors
// fed into it. Where a prior is weak, the cone is wide, and that width
// is the honest output.
//
// CALIBRATION. Three anchors are asserted by tests/model.test.mjs:
//   * climate, at the default driver setting, must reproduce the Climate
//     Action Tracker's ~2.6 degC current-policies median for 2100;
//   * peace must reproduce a median annual battle-death count within a
//     factor of ~2 of the 1989-2025 observed range, with a mean far
//     above its median (the tail is the whole story);
//   * the model must be deterministic in its seed.
//
// Written as a plain browser script (no import/export) so the page can
// load it with a <script> tag and the Node tests can evaluate it in a
// bare scope. Both entry points read `window.TC_MODEL`.
// ============================================================
(function (global) {
  "use strict";

  // ============================================================
  // 1. Random numbers
  // ------------------------------------------------------------
  // mulberry32: small, fast, and good enough for Monte Carlo over
  // smooth distributions. Seeded, so a given driver setting always
  // draws the same cone — a forecast that flickered when you looked
  // away would be worse than useless.
  // ============================================================

  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Box-Muller, one of the pair kept. Cheap enough at this sample size.
  function normal(rand, mean, sd) {
    var u = 1 - rand();
    var v = rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Normal truncated by rejection, with a hard cap so a badly specified
  // pair of bounds degrades to a clamp instead of hanging the page.
  function truncNormal(rand, mean, sd, lo, hi) {
    for (var i = 0; i < 60; i++) {
      var x = normal(rand, mean, sd);
      if (x >= lo && x <= hi) return x;
    }
    return Math.min(hi, Math.max(lo, mean));
  }

  // Lognormal specified the way a forecaster thinks: a median, and a
  // multiplicative spread `gsd` such that ~68% of draws fall within
  // [median/gsd, median*gsd].
  function logNormal(rand, median, gsd) {
    return median * Math.exp(normal(rand, 0, Math.log(gsd)));
  }

  function poisson(rand, lambda) {
    // Knuth. Rates here are single digits, so the loop is short.
    if (lambda <= 0) return 0;
    if (lambda > 60) return Math.max(0, Math.round(normal(rand, lambda, Math.sqrt(lambda))));
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  }

  // Pareto by inverse CDF. alpha < 1 means an infinite mean; that is not
  // a bug in the sampler, it is the empirical finding about war (see the
  // severity model below), and it is why the draw is bounded afterwards.
  function pareto(rand, xmin, alpha) {
    return xmin / Math.pow(1 - rand(), 1 / alpha);
  }

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // ============================================================
  // 2. Constants
  // ------------------------------------------------------------
  // Every number here is either an observation with a citation or a
  // prior with a stated justification. Nothing is tuned to make the
  // output look reasonable except the three quantities marked
  // CALIBRATED, which are fitted so that the default run reproduces a
  // published central estimate.
  // ============================================================

  var K = {
    Y0: 2026,
    Y1: 2100,

    // ---------------- climate ----------------

    // Cumulative anthropogenic CO2, 1850 to end-2025, GtCO2. IPCC AR6 WG1
    // gives 2,390 +/- 240 GtCO2 for 1850-2019; the Global Carbon Budget
    // adds roughly 42 GtCO2 a year since.
    CUM_CO2: 2650,
    CUM_CO2_SD: 240,

    // Total CO2 emissions entering 2026, GtCO2/yr. Global Carbon Budget
    // 2025: 38.1 fossil (a record, +1.1%) plus ~4.1 from land use.
    EMIT_NOW: 42.2,

    // Transient Climate Response to cumulative Emissions, degC per 1000
    // GtCO2. AR6 best estimate 1.65 degC per 1000 PgC with a likely
    // range of 1.0-2.3, i.e. 0.45 (0.27-0.63) per 1000 GtCO2. A "likely"
    // range is 17-83%, so the half-width is about one standard deviation.
    TCRE: 0.45,
    TCRE_SD: 0.18,

    // Present-day warming contributed by everything that is not CO2 —
    // methane and N2O warming, less aerosol cooling. The net is small
    // and poorly constrained because the two terms are individually
    // large. It is not drawn independently: see the conditioning step in
    // the trajectory, where it becomes the residual that makes each
    // sampled world agree with the thermometer.
    NONCO2_LO: -0.35,
    NONCO2_HI: 0.60,

    // Observed anomaly above 1850-1900. WMO consolidated eight datasets:
    // 2024 = 1.55 degC (first calendar year above 1.5), 2025 = 1.44 +/- 0.13.
    OBS_2025: 1.44,
    OBS_SD: 0.13,

    // Zero Emissions Commitment: the further warming after emissions stop.
    // AR6 puts it near zero with a wide range; it is a wash in the median
    // and a real risk in the tail.
    ZEC_SD: 0.10,

    // Interannual variability of the global mean, degC (ENSO and friends).
    WEATHER_SD: 0.09,

    // CALIBRATED. Post-peak decline rate, as a fraction of the peak per
    // year, at the default policy setting. Fitted so the default median
    // 2100 warming lands on the Climate Action Tracker's 2.6 degC
    // current-policies estimate (2025 update, unchanged for four years).
    DECLINE_BASE: 0.0010,
    DECLINE_SPAN: 0.0228,

    // ---------------- capability ----------------

    // Frontier training compute grew 4-5x/year 2010-2024 (Epoch AI);
    // 4x = 0.60 orders of magnitude a year.
    COMPUTE_OOM_NOW: 0.60,
    // Where that growth settles once it is bounded by power and capital
    // rather than by purchase orders. Hyperscaler capex is ~$725bn in
    // 2026 against ~$410bn in 2025; that 77% growth cannot compound for
    // long, and 3-4x/year (0.48-0.60 OOM) is already the projected
    // 2026-28 deceleration. The floor is set by what a mature capital
    // good sustains.
    COMPUTE_OOM_FLOOR: 0.20,
    COMPUTE_DECAY_YRS: 9,
    // Algorithmic efficiency: the compute needed for a fixed capability
    // has fallen faster than hardware has improved. Estimates cluster
    // around 0.3-0.5 OOM/year of effective-compute equivalent.
    ALGO_OOM: 0.40,
    ALGO_OOM_SD: 0.13,

    // Effective orders of magnitude, from 2026, at which half of the
    // automatable cognitive task base becomes technically feasible. This
    // is the single widest prior in the model and it is where almost all
    // the disagreement about AI actually lives. Lognormal, because the
    // downside is bounded (it cannot take less than about one order of
    // magnitude from here) and the upside is not.
    //
    // For scale: the distance from GPT-3 to the 2026 frontier is roughly
    // six effective orders of magnitude, raw compute and algorithmic
    // efficiency combined, and it bought the step from "writes a
    // plausible paragraph" to "finishes a twelve-hour software task half
    // the time". A median of 7.5 more says the remaining distance is a
    // little further than the distance already travelled. The spread
    // spans the range of serious opinion: compute-centric models and
    // prediction markets put transformative capability in the 2030s,
    // the most recent large expert survey puts high-level machine
    // intelligence at a 2047 median, and a substantial minority hold
    // that no quantity of scaling gets there at all.
    OOM50: 7.5,
    OOM50_GSD: 2.15,
    OOM_WIDTH: 1.9,       // logistic scale: how abrupt the transition is

    // Share of employment-weighted work hours that could be done without
    // a human, given unlimited capability but today's bodies, laws and
    // appetites for being served by a person.
    CEILING: 0.62,
    CEILING_SD: 0.14,

    // Diffusion lag, years, between a task being feasible and being done
    // that way at scale. The historical anchors are unkind to short
    // estimates: electric motors took roughly forty years to show up in
    // factory productivity, computers about twenty-five. The prior is
    // lognormal because the downside is bounded and the upside is not.
    TAU: 9,
    TAU_GSD: 1.85,

    // Per-year probability that returns to scale break. This is a regime
    // change, not a slowdown: the paradigm stops converting compute into
    // capability, and what growth remains decays away over about fifteen
    // years. A model in which "the wall" merely slows things down is a
    // model that cannot represent the sceptical case at all, and the
    // sceptical case has to be representable.
    WALL_BASE: 0.030,
    WALL_MULT: 0.06,
    WALL_HALFLIFE: 15,

    // ---------------- peace ----------------

    // New state-based conflict onsets per year. UCDP recorded 65
    // state-involved conflicts active in 2025, the most since the series
    // began in 1946, of which 13 passed the 1,000-deaths war threshold.
    ONSET: 13.5,

    // Severity: total battle deaths per conflict, above a 1,000 floor,
    // drawn from a Pareto tail. Cirillo and Taleb estimate a tail index
    // near 0.5 for war casualties over seven centuries — formally an
    // infinite mean, which is why the draw has to be bounded.
    //
    // 0.82 is deliberately THINNER than their estimate. Their index is
    // fitted to the extreme tail above a high threshold; running a
    // single Pareto all the way down from 1,000 deaths with that index
    // would put far too much mass in the middle of the distribution and
    // make the model alarming for the wrong reason. The conservative
    // choice matters: the fat-tail conclusion below survives it.
    ALPHA: 0.82,
    ALPHA_SD: 0.13,
    SEV_MIN: 1000,
    // Upper bound on a single conflict, following the dual-distribution
    // approach: no war can kill more than a fixed share of the species.
    // ~3.5% of 8.2bn, a shade above the Second World War's toll.
    SEV_MAX: 2.9e8,
    DUR_MED: 4.5,         // years a conflict runs, lognormal
    DUR_GSD: 2.2,

    // Observed 2025 baseline for orientation: ~244,600 deaths in
    // organised violence, of which Russia-Ukraine was ~94,700.
    OBS_DEATHS_2025: 244600,

    // Per-year hazard of at least one nuclear detonation in conflict,
    // in peacetime conditions. Eighty-one years of non-use bound this
    // from above: zero events in 81 years puts a 95% upper bound near
    // 3.7% a year, and a reasonable posterior median near 0.3%.
    // Published expert elicitations cluster between 0.1% and 1% with
    // long tails on both sides. The lognormal spread is wide on purpose.
    NUKE_HAZARD: 0.0025,
    NUKE_GSD: 2.7,
    // Multiplier while a direct great-power war is being fought. This is
    // the single most consequential judgement in the peace module: it
    // implies roughly a one-in-four chance that a sustained great-power
    // war goes nuclear at some point.
    NUKE_WAR_MULT: 8,

    // Per-year hazard of a direct great-power war: two of the United
    // States, China, Russia and their treaty principals in sustained
    // direct combat. The base rate is the awkward part. Since 1815 there
    // have been perhaps six such wars in 210 years, about 2.9% a year.
    // Since 1945, with nuclear weapons in the picture, there has been
    // one — American and Chinese forces in Korea, 1950-53 — or arguably
    // none, depending on how much weight "treaty principals" carries:
    // between 0% and 1.2% a year. 0.7% splits that difference.
    GP_WAR: 0.0070,

    // New nuclear-armed states: roughly one per 15-25 years since 1945,
    // and every additional pair of adversaries adds hazard.
    PROLIF_YRS: 19,
    NUKE_STATES_NOW: 9,   // SIPRI, January 2026

    // Given that a weapon is used at all, what follows. A single Pareto
    // is the wrong shape here, because nuclear use is not one process
    // but three, with a hard question — does it escalate? — between
    // them. The weights are the honest range of published opinion on
    // that question, not a finding.
    //
    //   demonstration / battlefield : one or a few weapons, no city
    //   regional exchange           : e.g. South Asia; famine dominates
    //   strategic exchange          : large arsenals, counter-value
    //
    // Deaths include the modelled famine mortality that dominates the
    // upper two classes; the direct blast toll is far smaller.
    NUKE_MIX: [
      { w: 0.55, med: 1.2e5, gsd: 6.0 },
      { w: 0.27, med: 3.0e7, gsd: 3.4 },
      { w: 0.18, med: 2.4e8, gsd: 2.6 },
    ],

    // Per-year hazard of a severe AI-enabled incident: an event causing
    // at least 1,000 deaths or 100bn dollars of damage, by misuse,
    // accident, or a system doing exactly what it was asked. Scaled by
    // deployed capability, so it is near zero today and not near zero
    // in a world of broadly capable agents.
    AI_INCIDENT: 0.035,

    // ---------------- coupling ----------------

    // Warming to conflict. Hsiang, Burke and Miguel's meta-analysis
    // found ~11% more intergroup conflict per standard deviation of
    // climate anomaly; Buhaug and others dispute the aggregation and the
    // causal identification. The prior is centred low with real mass at
    // zero, because the honest state of that literature is "contested".
    CLIM_WAR: 0.10,
    CLIM_WAR_SD: 0.09,

    // AI to emissions. Data centres used ~485 TWh in 2025 and the IEA
    // projects ~950 TWh by 2030, about 3% of global electricity — real,
    // but small against a 30,000 TWh system. Against that, materials
    // discovery, grid optimisation and demand forecasting cut emissions
    // by an amount nobody can yet measure. Centred slightly helpful,
    // signed uncertain.
    AI_EMIT: -0.04,
    AI_EMIT_SD: 0.07,

    // AI to nuclear hazard, as a multiplier reached by 2100. Decision
    // compression, automated early warning and cyber effects on nuclear
    // command and control point one way; better verification, remote
    // sensing and de-conflicted attribution point the other.
    AI_NUKE: 1.25,
    AI_NUKE_SD: 0.30,
  };

  // ============================================================
  // 3. Drivers
  // ------------------------------------------------------------
  // Six knobs, each in [0,1], each mapping to a distributional shift
  // rather than to a fixed value. They are assumptions about the world,
  // not predictions of it: the model has nothing to say about which
  // setting is right, which is the point of exposing them.
  // ============================================================

  var DRIVERS = [
    {
      key: "scaling", domain: "ai", label: "Scaling continues",
      lo: "Breaks soon", hi: "Runs for decades",
      note: "How long compute growth and algorithmic progress keep buying capability before they stop paying. Low settings raise the per-year probability of a regime break.",
    },
    {
      key: "diffusion", domain: "ai", label: "Deployment friction",
      lo: "Frictionless", hi: "Heavy",
      note: "The lag between a task becoming feasible and being done that way at scale — regulation, liability, tacit knowledge, capital cycles, and the plain reluctance of institutions to change.",
    },
    {
      key: "policy", domain: "climate", label: "Decarbonisation effort",
      lo: "Abandoned", hi: "Emergency footing",
      note: "How early emissions peak and how fast they fall afterwards. The default sits at today's implemented policy, not at anyone's pledge.",
    },
    {
      key: "removal", domain: "climate", label: "Carbon removal scale-up",
      lo: "Stays a rounding error", hi: "Gigatonne industry",
      note: "Engineered and enhanced-natural removal by 2100. It arrives too late to matter for the peak and matters a great deal for the century after it.",
    },
    {
      key: "armsControl", domain: "peace", label: "Arms control",
      lo: "Nothing is rebuilt", hi: "Caps and inspections return",
      note: "New START expired on 5 February 2026 with no successor — the first time since 1972 that no treaty caps US and Russian strategic forces. This is whether that is restored.",
    },
    {
      key: "rivalry", domain: "peace", label: "Great-power rivalry",
      lo: "Cools", hi: "Hardens into blocs",
      note: "The onset rate for interstate conflict and the frequency of crises between nuclear-armed states.",
    },
  ];

  var DEFAULTS = {
    scaling: 0.55,
    diffusion: 0.55,
    policy: 0.50,
    removal: 0.35,
    armsControl: 0.30,
    rivalry: 0.62,
    coupling: true,
  };

  // ============================================================
  // 4. One trajectory
  // ------------------------------------------------------------
  // Draws a world from the priors, then walks it year by year to 2100.
  // The three modules share a clock and, when coupling is on, read each
  // other's state.
  // ============================================================

  function trajectory(rand, d, N) {
    var y, i;

    // ---------- draw this world's parameters ----------

    // climate
    //
    // TCRE and the non-CO2 residual are NOT drawn independently. Each
    // sampled world has to agree with the thermometer: whatever its
    // climate sensitivity, the warming it implies for 2025 must match
    // the 1.44 +/- 0.13 degC that was actually measured. So TCRE is
    // drawn from its AR6 prior, the residual is whatever is left over,
    // and the pair is rejected if that residual demands an implausible
    // non-CO2 budget. Conditioning on the observation this way is what
    // stops the cone containing worlds that are already falsified.
    //
    // It is not a free lunch, and the direction of the effect should be
    // stated rather than buried. About a third of draws are rejected,
    // and the survivors are NARROWER than the AR6 prior and slightly
    // HOTTER: a central 66% range of roughly 0.38-0.59 against AR6's
    // likely 0.27-0.63, with the median moving from 0.45 to about 0.48.
    // That is a real posterior update rather than an artefact — a
    // low-sensitivity world has to explain today's warming with an
    // implausibly large non-CO2 contribution, and a high-sensitivity one
    // with implausibly large aerosol cooling — but it does mean this
    // model runs a little warm relative to an unconditioned AR6 prior,
    // and a reader comparing it with published ranges should know that.
    var tcre, cum, nonCo2;
    for (var attempt = 0; attempt < 40; attempt++) {
      tcre = truncNormal(rand, K.TCRE, K.TCRE_SD, 0.15, 0.95);
      cum = normal(rand, K.CUM_CO2, K.CUM_CO2_SD);
      nonCo2 = normal(rand, K.OBS_2025, K.OBS_SD) - tcre * cum / 1000;
      if (nonCo2 >= K.NONCO2_LO && nonCo2 <= K.NONCO2_HI) break;
    }
    nonCo2 = clamp(nonCo2, K.NONCO2_LO, K.NONCO2_HI);

    // Non-CO2 forcing drifts over the century: methane control and the
    // continued clean-up of sulphate aerosols pull in opposite
    // directions, and the aerosol clean-up is the one that warms.
    var nonCo2Drift = normal(rand, 0.14 - 0.22 * d.policy, 0.13);
    var zec = normal(rand, 0, K.ZEC_SD);

    // Emissions pathway. Higher effort peaks earlier and falls faster.
    // The map is convex because the first increment of effort buys an
    // early peak cheaply and the last increment buys very little: global
    // emissions are already close to a plateau.
    var peakYear = Math.round(truncNormal(
      rand, 2026 + 24 * Math.pow(1 - d.policy, 2.2), 3.0, 2026, 2080));
    var preGrowth = lerp(0.014, -0.004, d.policy);
    var decline = logNormal(rand, K.DECLINE_BASE + K.DECLINE_SPAN * d.policy, 1.42);
    // A residual floor: cement chemistry, aviation, shipping, agriculture
    // and land use do not go to zero on any pathway anyone has costed.
    var floor = truncNormal(rand, 9.5 - 4.0 * d.policy, 2.4, 1.5, 16);
    // Engineered removal, an S-curve reaching this scale by 2100.
    var cdrMax = logNormal(rand, 0.35 + 6.5 * d.removal, 2.1);
    var cdrMid = 2055 + 20 * (1 - d.removal);

    // capability
    var algo = truncNormal(rand, K.ALGO_OOM, K.ALGO_OOM_SD, 0.05, 0.85);
    var oom50 = clamp(logNormal(rand, K.OOM50, K.OOM50_GSD), 1.2, 90);
    var width = logNormal(rand, K.OOM_WIDTH, 1.35);
    var ceiling = truncNormal(rand, K.CEILING, K.CEILING_SD, 0.20, 0.94);
    var tau = clamp(logNormal(rand, K.TAU * lerp(0.55, 1.9, d.diffusion), K.TAU_GSD), 1.5, 60);
    var wallHazard = K.WALL_BASE * lerp(2.6, 0.30, d.scaling);
    var computeFloor = K.COMPUTE_OOM_FLOOR * lerp(0.5, 1.7, d.scaling);
    var walled = false, wallYear = 0;

    // peace
    var alpha = truncNormal(rand, K.ALPHA, K.ALPHA_SD, 0.42, 1.35);
    var onsetRate = K.ONSET * lerp(0.72, 1.45, d.rivalry);
    var nukeBase = logNormal(rand, K.NUKE_HAZARD, K.NUKE_GSD)
      * lerp(1.60, 0.50, d.armsControl)
      * lerp(0.70, 1.50, d.rivalry);
    var gpBase = K.GP_WAR * lerp(0.45, 2.1, d.rivalry) * lerp(1.20, 0.85, d.armsControl);
    var climWar = d.coupling ? Math.max(0, normal(rand, K.CLIM_WAR, K.CLIM_WAR_SD)) : 0;
    var aiEmit = d.coupling ? normal(rand, K.AI_EMIT, K.AI_EMIT_SD) : 0;
    var aiNuke = d.coupling ? truncNormal(rand, K.AI_NUKE, K.AI_NUKE_SD, 0.6, 2.6) : 1;
    var nukeStates = K.NUKE_STATES_NOW;
    var proliferation = lerp(1.55, 0.55, d.armsControl) / K.PROLIF_YRS;

    // ---------- state ----------
    var emit = K.EMIT_NOW;
    var oomCum = 0;
    var computeOom = K.COMPUTE_OOM_NOW;
    var automated = 0.015;          // where deployed automation of work hours stands now
    var active = [];                // running conflicts: {perYear, left}
    var nukeUsed = false, nukeYear = 0, nukeDeaths = 0;
    var gpWar = 0;                  // years of great-power war remaining
    var gpEver = false;
    var incident = false, incidentYear = 0;
    var tipped = false, tipYear = 0, tipWarming = 0;

    var out = {
      temp: new Float64Array(N),
      emissions: new Float64Array(N),
      auto: new Float64Array(N),
      cap: new Float64Array(N),
      deaths: new Float64Array(N),
      nuke: new Uint8Array(N),
      gp: new Uint8Array(N),
      inc: new Uint8Array(N),
      tip: new Uint8Array(N),
      peakYear: peakYear,
      nukeYear: 0, nukeDeaths: 0, incidentYear: 0, tipYear: 0,
      tcre: tcre, tau: tau, oom50: oom50, alpha: alpha,
    };

    var temp = K.OBS_2025;

    for (i = 0; i < N; i++) {
      y = K.Y0 + i;

      // ---------- capability ----------
      // Compute growth relaxes from today's rate toward the rate a
      // mature, power-bound capital good can sustain.
      computeOom = computeFloor + (K.COMPUTE_OOM_NOW - computeFloor)
        * Math.exp(-(y - K.Y0) / K.COMPUTE_DECAY_YRS);
      if (!walled && rand() < wallHazard) { walled = true; wallYear = y; }
      // After a wall, what remains of the growth rate decays away; the
      // capability index approaches an asymptote rather than continuing
      // more slowly.
      var gain = computeOom + algo;
      if (walled) {
        gain *= K.WALL_MULT * Math.pow(0.5, (y - wallYear) / K.WALL_HALFLIFE);
      }
      oomCum += gain;

      // Feasible share, then the deployment lag. The lag is why the
      // capability curve and the automation curve are different pictures.
      //
      // The step is a ratchet: automation only ever moves up. Deployed
      // automation does not un-deploy when progress stalls — the call
      // centre that was replaced in 2029 is not restaffed in 2044
      // because scaling hit a wall. Without the ratchet, worlds where
      // capability plateaus below today's level drag the fifth
      // percentile below where automation already is, which is not a
      // possible future, merely an artefact of the lag equation.
      var feasible = ceiling / (1 + Math.exp(-(oomCum - oom50) / width));
      if (feasible > automated) automated += (feasible - automated) / tau;
      automated = clamp(automated, 0, 1);

      // Severe AI-enabled incident: at least 1,000 deaths or $100bn of
      // damage, by misuse, accident, or a system doing exactly what it
      // was asked.
      //
      // Two channels, because they scale with different things. An
      // ACCIDENT — a system embedded in infrastructure that fails, or a
      // dependency discovered only when it breaks — scales with
      // deployment: it takes a lot of installed base to hurt a lot of
      // people. MISUSE does not. It needs capability and access, and a
      // biological or cyber uplift is dangerous in the hands of one
      // actor long before it is economically diffused. An earlier
      // version of this model drove the whole hazard off deployment
      // alone, which put the 2030 probability an order of magnitude
      // below anything defensible, because deployed automation in 2030
      // is still only a few per cent.
      //
      // Friction cuts both ways on the accident channel — the same
      // driver that slows the benefits slows the harms — and barely at
      // all on the misuse channel, which is one of the more
      // uncomfortable asymmetries in the whole picture.
      if (!incident) {
        var deployed = automated / Math.max(0.05, ceiling);
        var frontier = clamp(oomCum / Math.max(1, oom50), 0, 1.4);
        var hz = K.AI_INCIDENT * (
          0.45 * deployed * lerp(1.7, 0.55, d.diffusion) +
          0.55 * frontier * lerp(1.2, 0.85, d.diffusion)
        );
        if (rand() < hz) { incident = true; incidentYear = y; }
      }

      // ---------- climate ----------
      if (y < peakYear) emit *= (1 + preGrowth);
      else emit = Math.max(floor, emit * (1 - decline));
      // AI's net effect on emissions: demand up, discovery and
      // optimisation down, sign genuinely uncertain.
      var emitAdj = emit * (1 + aiEmit * automated / Math.max(0.05, ceiling));
      var cdr = cdrMax / (1 + Math.exp(-(y - cdrMid) / 9));
      var net = emitAdj - cdr;
      cum += net;

      // Tipping. Narrowly defined: an element that feeds back on the
      // global mean temperature itself — permafrost carbon release,
      // Amazon dieback, a circulation change with a carbon-cycle tail.
      // It deliberately does NOT count the elements whose thresholds are
      // already being crossed, warm-water coral above all, because those
      // are catastrophes without a global-mean warming signature and
      // folding them in here would double-count them as a temperature
      // risk. The hazard rises steeply with temperature because the
      // assessed central thresholds cluster between 1.5 and 3 degC.
      if (!tipped && temp > 1.5) {
        var th = 0.0032 * Math.exp(1.6 * (temp - 1.5));
        if (rand() < th) {
          tipped = true; tipYear = y;
          tipWarming = truncNormal(rand, 0.22, 0.13, 0.02, 0.8);
        }
      }
      var tipNow = tipped ? tipWarming * clamp((y - tipYear) / 25, 0, 1) : 0;
      var driftNow = nonCo2Drift * clamp((y - K.Y0) / 74, 0, 1);
      var zecNow = zec * clamp((y - peakYear) / 40, 0, 1);
      temp = tcre * cum / 1000 + nonCo2 + driftNow + zecNow + tipNow;

      // ---------- peace ----------
      var stress = 1 + climWar * Math.max(0, temp - 1.45);
      if (rand() < proliferation) nukeStates++;
      if (gpWar > 0) gpWar--;
      else if (rand() < gpBase * stress) {
        gpWar = 1 + Math.floor(rand() * 5);
        gpEver = true;
        // A great-power war is not one more conflict on the list; it is
        // a draw from the far end of the severity distribution.
        active.push(makeConflict(rand, alpha, 12));
      }

      var onsets = poisson(rand, onsetRate * stress * (gpWar > 0 ? 1.6 : 1));
      for (var c = 0; c < onsets; c++) active.push(makeConflict(rand, alpha, 1));

      // Sum the running conflicts and compact the list in one pass.
      // splice() in a loop is quadratic and this is the model's hottest
      // path: it runs once per year per sampled world.
      var deaths = 0, keep = 0;
      for (var a = 0; a < active.length; a++) {
        deaths += active[a].perYear;
        if (--active[a].left > 0) active[keep++] = active[a];
      }
      active.length = keep;

      // Nuclear use. The conditional multipliers are the whole argument:
      // the hazard is not a constant of nature, it is a function of how
      // many fingers are near triggers, how fast decisions must be made,
      // and whether anyone is counting the other side's missiles.
      //
      // Nuclear deaths are deliberately kept OUT of the conflict cone
      // and reported as their own track. Two reasons. One is honesty
      // about the model: with a mixture whose top component has a
      // median in the hundreds of millions, a few hundred sampled worlds
      // give an upper percentile that jumps around by an order of
      // magnitude depending on how many exchanges happened to land in
      // the draw, and a band that noisy is a decoration, not a result.
      // The other is that they are a different kind of object. The
      // conflict cone is a trend with a fat tail; nuclear use is a
      // discrete event whose probability, not whose trend, is the thing
      // worth arguing about.
      if (!nukeUsed) {
        var nh = nukeBase
          * (1 + 0.10 * (nukeStates - K.NUKE_STATES_NOW))
          * (gpWar > 0 ? K.NUKE_WAR_MULT : 1)
          * lerp(1, aiNuke, clamp(oomCum / 8, 0, 1));
        if (rand() < nh) {
          nukeUsed = true; nukeYear = y;
          nukeDeaths = drawExchange(rand);
        }
      }

      out.temp[i] = temp + normal(rand, 0, K.WEATHER_SD);
      out.emissions[i] = net;
      out.auto[i] = automated;
      out.cap[i] = oomCum;
      out.deaths[i] = deaths;
      out.nuke[i] = nukeUsed ? 1 : 0;
      out.gp[i] = gpEver ? 1 : 0;
      out.inc[i] = incident ? 1 : 0;
      out.tip[i] = tipped ? 1 : 0;
    }

    out.nukeYear = nukeYear;
    out.nukeDeaths = nukeDeaths;
    out.incidentYear = incidentYear;
    out.tipYear = tipYear;
    return out;
  }

  // Deaths from a nuclear exchange, drawn from the three-component
  // mixture in K.NUKE_MIX. The shape of this distribution is the reason
  // the site reports three nuclear numbers rather than one: "a weapon is
  // used" and "a hundred million people die" are not the same forecast,
  // and collapsing them into a single probability hides the only part
  // that policy can still act on.
  function drawExchange(rand) {
    var u = rand(), acc = 0;
    for (var i = 0; i < K.NUKE_MIX.length; i++) {
      acc += K.NUKE_MIX[i].w;
      if (u <= acc || i === K.NUKE_MIX.length - 1) {
        return clamp(logNormal(rand, K.NUKE_MIX[i].med, K.NUKE_MIX[i].gsd), 200, 2.0e9);
      }
    }
    return 0;
  }

  // A conflict's total deaths, drawn from a bounded Pareto, then spread
  // over its duration. `boost` shifts the draw up the tail for wars that
  // start as great-power wars.
  function makeConflict(rand, alpha, boost) {
    var raw = pareto(rand, K.SEV_MIN * boost, alpha);
    // Dual transform: map the unbounded draw into [SEV_MIN, SEV_MAX] so
    // no single war exceeds a fixed share of the species, while leaving
    // the body of the distribution essentially untouched.
    var H = K.SEV_MAX;
    var total = K.SEV_MIN + (H - K.SEV_MIN) * (1 - Math.exp(-(raw - K.SEV_MIN) / H));
    var dur = clamp(logNormal(rand, K.DUR_MED, K.DUR_GSD), 1, 40);
    var years = Math.max(1, Math.round(dur));
    return { perYear: total / years, left: years };
  }

  // ============================================================
  // 5. The run
  // ------------------------------------------------------------
  // Draws `runs` worlds and reduces them to percentile bands. Bands, not
  // trajectories: no single sampled world is a forecast, and drawing one
  // as though it were is the commonest way these pictures mislead.
  // ============================================================

  var PCT = [5, 25, 50, 75, 95];
  // "p05" rather than "p5", so the keys sort the way the bands nest.
  function pkey(p) { return "p" + (p < 10 ? "0" + p : p); }

  function bands(series, N, runs, transform) {
    var res = {}, p;
    for (p = 0; p < PCT.length; p++) res[pkey(PCT[p])] = new Array(N);
    res.mean = new Array(N);
    // One reused typed array, sorted in place. Float64Array.sort is
    // numeric by default and does not allocate; the naive version of
    // this (slice + comparator) was most of the model's runtime, which
    // matters because the whole thing reruns on every slider drag.
    var col = new Float64Array(runs);
    for (var i = 0; i < N; i++) {
      var sum = 0;
      for (var r = 0; r < runs; r++) {
        var v = series[r][i];
        if (transform) v = transform(v);
        col[r] = v;
        sum += v;
      }
      col.sort();
      for (p = 0; p < PCT.length; p++) {
        res[pkey(PCT[p])][i] = quantile(col, PCT[p] / 100);
      }
      res.mean[i] = sum / runs;
    }

    // Smooth each percentile series along the time axis.
    //
    // This is cosmetic and it is worth being exact about why it is
    // legitimate. Each year's percentile is estimated from a few hundred
    // samples, so it carries sampling error of its own, and consecutive
    // years' errors are independent — which makes the band edge visibly
    // ragged even though the underlying quantity is smooth in
    // expectation. The jitter is noise in the estimator, not structure
    // in the forecast, and drawing it invites the reader to see detail
    // that is not there. A five-point centred mean removes it without
    // moving the level: the alternative, running ten thousand samples,
    // gets the same picture and takes ten seconds.
    for (p = 0; p < PCT.length; p++) res[pkey(PCT[p])] = smooth(res[pkey(PCT[p])]);
    res.mean = smooth(res.mean);
    return res;
  }

  function smooth(a) {
    var n = a.length, out = new Array(n), w = 2;
    for (var i = 0; i < n; i++) {
      var s = 0, c = 0;
      for (var j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { s += a[j]; c++; }
      out[i] = s / c;
    }
    return out;
  }

  function quantile(sorted, q) {
    var n = sorted.length;
    if (!n) return 0;
    var pos = (n - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  // Cumulative share of worlds in which a flag is set, by year.
  function cumulative(flagSeries, N, runs) {
    var out = new Array(N);
    for (var i = 0; i < N; i++) {
      var c = 0;
      for (var r = 0; r < runs; r++) c += flagSeries[r][i];
      out[i] = c / runs;
    }
    return out;
  }

  function run(drivers, opts) {
    opts = opts || {};
    var d = {};
    for (var k in DEFAULTS) d[k] = DEFAULTS[k];
    for (k in (drivers || {})) if (k in d) d[k] = drivers[k];

    var runs = opts.runs || 700;
    var seed = opts.seed == null ? 20260804 : opts.seed;
    var N = K.Y1 - K.Y0 + 1;
    var rand = makeRng(seed);

    var temp = [], auto = [], cap = [], deaths = [], emissions = [];
    var nuke = [], gp = [], inc = [], tip = [];
    var nukeYears = [], nukeDeaths = [], peakYears = [], taus = [], oom50s = [];

    for (var r = 0; r < runs; r++) {
      var t = trajectory(rand, d, N);
      temp.push(t.temp); auto.push(t.auto); cap.push(t.cap);
      deaths.push(t.deaths); emissions.push(t.emissions);
      nuke.push(t.nuke); gp.push(t.gp); inc.push(t.inc); tip.push(t.tip);
      peakYears.push(t.peakYear); taus.push(t.tau); oom50s.push(t.oom50);
      if (t.nukeYear) { nukeYears.push(t.nukeYear); nukeDeaths.push(t.nukeDeaths); }
    }

    var years = new Array(N);
    for (var i = 0; i < N; i++) years[i] = K.Y0 + i;

    // Deaths are reported per 100,000 people on a log axis, because a
    // linear axis on a heavy-tailed quantity shows you one spike and
    // nothing else. World population is held at a UN-median-ish 9.5bn
    // mid-century plateau rather than modelled.
    var pop = years.map(function (y) {
      return 8.2e9 + 1.5e9 / (1 + Math.exp(-(y - 2050) / 12)) - 0.7e9 * clamp((y - 2075) / 50, 0, 1);
    });

    var result = {
      years: years,
      drivers: d,
      runs: runs,
      climate: {
        temp: bands(temp, N, runs),
        emissions: bands(emissions, N, runs),
        peakYear: median(peakYears),
        exceed: {
          "1.5": exceedYear(bands(temp, N, runs).p50, years, 1.5),
          "2.0": exceedYear(bands(temp, N, runs).p50, years, 2.0),
        },
        pTip: cumulative(tip, N, runs),
      },
      ai: {
        auto: bands(auto, N, runs, function (v) { return v * 100; }),
        cap: bands(cap, N, runs),
        pIncident: cumulative(inc, N, runs),
        tau: median(taus),
        oom50: median(oom50s),
      },
      peace: {
        rate: bands(deaths, N, runs, null),
        per100k: null,
        pNuke: cumulative(nuke, N, runs),
        pGp: cumulative(gp, N, runs),
        nukeDeaths: nukeDeaths.slice().sort(function (a, b) { return a - b; }),
        pNukeBig: nukeDeaths.filter(function (x) { return x > 1e7; }).length / runs,
        pNukeVeryBig: nukeDeaths.filter(function (x) { return x > 1e8; }).length / runs,
      },
      pop: pop,
    };

    // per-100k bands, computed from the raw counts so the percentile is
    // taken on the quantity that is actually plotted.
    result.peace.per100k = bands(deaths, N, runs, null);
    for (var pi = 0; pi < PCT.length; pi++) {
      var key = pkey(PCT[pi]);
      result.peace.per100k[key] = result.peace.per100k[key].map(function (v, ix) {
        return v / pop[ix] * 1e5;
      });
    }
    result.peace.per100k.mean = result.peace.per100k.mean.map(function (v, ix) {
      return v / pop[ix] * 1e5;
    });

    return result;
  }

  function median(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    return quantile(s, 0.5);
  }

  function exceedYear(series, years, threshold) {
    for (var i = 0; i < series.length; i++) if (series[i] >= threshold) return years[i];
    return null;
  }

  // ============================================================
  // 6. Exports
  // ============================================================

  var API = {
    run: run,
    DEFAULTS: DEFAULTS,
    DRIVERS: DRIVERS,
    K: K,
    PCT: PCT,
    // exposed for the tests, which check the sampler before they check
    // anything built on top of it
    _internal: {
      makeRng: makeRng, normal: normal, truncNormal: truncNormal,
      logNormal: logNormal, poisson: poisson, pareto: pareto,
      quantile: quantile, median: median,
    },
  };

  global.TC_MODEL = API;
})(typeof window !== "undefined" ? window : globalThis);
