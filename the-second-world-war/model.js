/* ============================================================================
 * The Second World War — an animated atlas (data + math, no DOM)
 *
 * Environment-agnostic: attaches to window.WW2 in the browser and exports under
 * Node, so the same maths the page renders can be sanity-checked headlessly.
 *
 * The DATA block below is the single source of truth: battles, the political
 * control timeline, morphing front lines, offensive arrows and the Battle of
 * the Atlantic. It was assembled by web research and an adversarial fact-check
 * pass; dates are ISO, coordinates are [lon, lat] in degrees. Country fills are
 * drawn at *modern* borders (the only world atlas available to a static page),
 * so the front-line overlay carries the true line of contact.
 * ========================================================================== */
(function (root, factory) {
  const M = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = M;
  else root.WW2 = M;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // === DATA (injected from the research workflow) ============================
  const DATA = window.WW2_DATA || (typeof WW2_DATA !== "undefined" ? WW2_DATA : {});

  // === Time axis =============================================================
  // The playhead t (0..1) is linear over [START, END]; every day gets equal
  // screen time, because in this war a fortnight could turn the world.
  const START = Date.UTC(1938, 0, 1);
  const END = Date.UTC(1946, 0, 1);
  const SPAN = END - START;
  const DAY = 86400000;

  function parseDate(s) {
    if (!s) return null;
    const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(String(s).trim());
    if (!m) return null;
    return Date.UTC(+m[1], (+m[2]) - 1, m[3] ? +m[3] : 1);
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function tFromMs(ms) { return clamp01((ms - START) / SPAN); }
  function msFromT(t) { return START + clamp01(t) * SPAN; }
  function tFromDate(s) { const ms = parseDate(s); return ms == null ? 0 : tFromMs(ms); }

  const MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  function fmtMs(ms) {
    const d = new Date(ms);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  function fmtMonth(ms) { const d = new Date(ms); return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`; }

  // === Phases (the changing caption) ========================================
  const PHASES = [
    ["1938-01-01", "The Gathering Storm", "Appeasement and annexation"],
    ["1939-09-01", "Blitzkrieg", "The Axis unleashed"],
    ["1940-06-01", "Britain Alone", "The fall of the West"],
    ["1941-06-22", "The War Becomes Global", "Barbarossa and Pearl Harbor"],
    ["1942-11-01", "The Tide Turns", "Stalingrad, Alamein, Midway"],
    ["1943-09-01", "The Allies Advance", "Italy, the Atlantic won, the East rolls back"],
    ["1944-06-06", "Liberation", "The Reich closes in from every side"],
    ["1945-04-01", "Götterdämmerung", "The fall of Germany and Japan"],
    ["1945-09-03", "Aftermath", "A world remade"],
  ].map(([d, label, sub]) => ({ ms: parseDate(d), label, sub }));
  function phaseAt(ms) {
    let p = PHASES[0];
    for (const ph of PHASES) if (ms >= ph.ms) p = ph;
    return p;
  }

  // === Factions & colours ===================================================
  // Axis is ochre/khaki, the Soviets deep red, the Allies steel blue — kept well
  // apart so the eye reads the map at a glance.
  const FACTIONS = {
    "Axis": { fill: "#9a7236", edge: "#caa052", label: "Axis" },
    "occupied-by-axis": { fill: "#75561f", edge: "#b08a3e", label: "Axis-occupied" },
    "co-belligerent-axis": { fill: "#8a6730", edge: "#bd954c", label: "Axis co-belligerent" },
    "Soviet": { fill: "#a3271f", edge: "#e0564a", label: "Soviet Union" },
    "Allied": { fill: "#356ba1", edge: "#69a8e0", label: "Allied" },
    "occupied-by-allies": { fill: "#2e7e79", edge: "#5cc0ba", label: "Allied-liberated" },
    "co-belligerent-allied": { fill: "#3a7593", edge: "#63aecb", label: "Allied co-belligerent" },
    "neutral": { fill: "#2a3346", edge: "#44506a", label: "Neutral" },
  };
  const SIDE = { // which grand alliance a control state belongs to (for arrows etc.)
    "Axis": "axis", "occupied-by-axis": "axis", "co-belligerent-axis": "axis",
    "Soviet": "allies", "Allied": "allies", "occupied-by-allies": "allies", "co-belligerent-allied": "allies",
    "neutral": "neutral",
  };

  // === Country control timeline =============================================
  // Build per-country sorted change lists from DATA.countries.changes.
  const CHANGES = (DATA.countries && DATA.countries.changes) || [];
  const byCountry = new Map();
  for (const c of CHANGES) {
    const ms = parseDate(c.date);
    if (ms == null) continue;
    if (!byCountry.has(c.country)) byCountry.set(c.country, []);
    byCountry.get(c.country).push({ ms, control: c.control, event: c.event, note: c.note });
  }
  for (const arr of byCountry.values()) arr.sort((a, b) => a.ms - b.ms);
  const MAPPED_COUNTRIES = [...byCountry.keys()];

  // Control of a named country at a given instant (null = no record → neutral).
  function controlAt(name, ms) {
    const arr = byCountry.get(name);
    if (!arr) return null;
    let cur = null;
    for (const e of arr) { if (ms >= e.ms) cur = e.control; else break; }
    return cur;
  }
  // The most recent change record (for hover detail).
  function lastChange(name, ms) {
    const arr = byCountry.get(name);
    if (!arr) return null;
    let cur = null;
    for (const e of arr) { if (ms >= e.ms) cur = e; else break; }
    return cur;
  }
  // A cheap signature of the whole map's political state, to know when to
  // repaint the (expensive) country fills.
  function controlSignature(ms) {
    let s = "";
    for (const name of MAPPED_COUNTRIES) s += (controlAt(name, ms) || "·") + "|";
    return s;
  }

  // === Front lines ==========================================================
  // Gather every front from the two front datasets; each has dated keyframes of
  // ordered [lon,lat] points. We resample each keyframe to a fixed point count
  // so we can morph the line smoothly between dates.
  const FRONT_N = 28;
  function resample(points, n) {
    const pts = points.filter((p) => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]));
    if (pts.length === 0) return null;
    if (pts.length === 1) return Array.from({ length: n }, () => pts[0].slice(0, 2));
    // cumulative chord length
    const seg = [0];
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      seg.push(seg[i - 1] + Math.hypot(dx, dy));
    }
    const total = seg[seg.length - 1] || 1;
    const out = [];
    for (let k = 0; k < n; k++) {
      const target = (k / (n - 1)) * total;
      let i = 1;
      while (i < seg.length && seg[i] < target) i++;
      const i0 = i - 1, i1 = Math.min(i, pts.length - 1);
      const span = (seg[i1] - seg[i0]) || 1;
      const u = (target - seg[i0]) / span;
      out.push([pts[i0][0] + (pts[i1][0] - pts[i0][0]) * u,
                pts[i0][1] + (pts[i1][1] - pts[i0][1]) * u]);
    }
    return out;
  }

  const FRONT_COLOR = {
    "Eastern Front": "#ffcf5a",
    "Western Front": "#5fd0ff",
    "Italian Front": "#86e0a0",
    "North Africa": "#ffa24d",
  };
  function buildFronts() {
    const raw = []
      .concat((DATA.fronts_east && DATA.fronts_east.fronts) || [])
      .concat((DATA.fronts_west_med && DATA.fronts_west_med.fronts) || []);
    const out = [];
    for (const f of raw) {
      const kfs = (f.keyframes || [])
        .map((k) => ({ ms: parseDate(k.date), label: k.label || "", pts: resample(k.points, FRONT_N) }))
        .filter((k) => k.ms != null && k.pts)
        .sort((a, b) => a.ms - b.ms);
      if (kfs.length) out.push({ name: f.name, color: FRONT_COLOR[f.name] || "#ffcf5a", keyframes: kfs });
    }
    return out;
  }
  const FRONTS = buildFronts();

  // Interpolated front line at an instant. Returns null before the first
  // keyframe or a while after the last (the front has dissolved). `grace` keeps
  // the final line on screen briefly after the campaign ends.
  function frontAt(front, ms, graceDays) {
    const kf = front.keyframes;
    const grace = (graceDays || 0) * DAY;
    if (ms < kf[0].ms || ms > kf[kf.length - 1].ms + grace) return null;
    if (ms >= kf[kf.length - 1].ms) return { pts: kf[kf.length - 1].pts, fade: 1 - clamp01((ms - kf[kf.length - 1].ms) / (grace || 1)) };
    let i = 1;
    while (i < kf.length && kf[i].ms < ms) i++;
    const a = kf[i - 1], b = kf[i];
    const u = clamp01((ms - a.ms) / ((b.ms - a.ms) || 1));
    const e = u * u * (3 - 2 * u); // smoothstep
    const pts = a.pts.map((p, j) => [p[0] + (b.pts[j][0] - p[0]) * e, p[1] + (b.pts[j][1] - p[1]) * e]);
    return { pts, fade: 1 };
  }

  // === Offensive arrows =====================================================
  const ARROW_COLOR = { axis: "#ff5a4a", allies: "#5fb0ff", soviet: "#ff8a3a" };
  const ARROWS = (() => {
    const raw = (DATA.offensives && DATA.offensives.arrows) || [];
    return raw.map((a) => {
      const start = parseDate(a.startDate);
      let end = parseDate(a.endDate);
      if (end == null || end <= start) end = start + 30 * DAY;
      const side = a.faction === "Soviet" ? "soviet" : a.faction === "Axis" ? "axis" : "allies";
      const path = (a.path || []).filter((p) => Array.isArray(p) && p.length >= 2);
      return { label: a.label, faction: a.faction, side, kind: a.kind || "ground", start, end, path, note: a.note || "" };
    }).filter((a) => a.start != null && a.path.length >= 2);
  })();
  // Arrow draw/fade envelope: grows over its window, holds, then fades out.
  function arrowEnvelope(a, ms) {
    const holdDays = 45, fadeDays = 40;
    const holdEnd = a.end + holdDays * DAY, fadeEnd = holdEnd + fadeDays * DAY;
    if (ms < a.start || ms > fadeEnd) return null;
    let draw = clamp01((ms - a.start) / ((a.end - a.start) || 1));
    draw = draw * draw * (3 - 2 * draw);
    let alpha = 1;
    if (ms < a.start + 8 * DAY) alpha = clamp01((ms - a.start) / (8 * DAY));
    if (ms > holdEnd) alpha = clamp01((fadeEnd - ms) / (fadeDays * DAY));
    return { draw, alpha };
  }

  // === Battles & events =====================================================
  // Merge the three event datasets plus the Atlantic's notable actions.
  function gatherEvents() {
    const out = [];
    const push = (e, dflt) => {
      const ms = parseDate(e.date);
      if (ms == null) return;
      if (!isFinite(e.lon) || !isFinite(e.lat)) return;
      out.push({
        ms, end: parseDate(e.endDate),
        name: e.name, lon: +e.lon, lat: +e.lat,
        kind: e.kind || dflt.kind || "land",
        theatre: e.theatre || dflt.theatre || "",
        magnitude: e.magnitude || dflt.magnitude || 2,
        victor: e.victor || "none",
        blurb: e.blurb || "",
      });
    };
    for (const e of (DATA.battles_eu && DATA.battles_eu.events) || []) push(e, {});
    for (const e of (DATA.battles_pacific && DATA.battles_pacific.events) || []) push(e, {});
    for (const e of (DATA.bombing_politics && DATA.bombing_politics.events) || []) push(e, {});
    for (const tp of (DATA.atlantic && DATA.atlantic.turningPoints) || []) {
      if (isFinite(tp.lon) && isFinite(tp.lat))
        push({ date: tp.date, name: tp.name, lon: tp.lon, lat: tp.lat, blurb: tp.blurb }, { kind: "sea", theatre: "Atlantic", magnitude: 3, victor: "none" });
    }
    // de-duplicate by name+month (the verify pass can introduce near-twins)
    const seen = new Set(), uniq = [];
    out.sort((a, b) => a.ms - b.ms);
    for (const e of out) {
      const key = e.name.toLowerCase().replace(/[^a-z]/g, "") + "|" + new Date(e.ms).getUTCFullYear() + new Date(e.ms).getUTCMonth();
      if (seen.has(key)) continue;
      seen.add(key); uniq.push(e);
    }
    return uniq;
  }
  const BATTLES = gatherEvents();

  // A battle's on-screen life: a sharp pulse around its date, then a slowly
  // fading marker so the map keeps a memory of where the war has been.
  function battleActivity(b, ms) {
    const pulseDays = Math.max(6, b.magnitude * 4);
    const endMs = b.end && b.end > b.ms ? b.end : b.ms;
    const tailDays = 50 + b.magnitude * 30;
    if (ms < b.ms - 4 * DAY) return null;
    if (ms > endMs + tailDays * DAY) return { pulse: 0, alpha: 0.0, active: false };
    let pulse = 0;
    if (ms >= b.ms - 4 * DAY && ms <= endMs + pulseDays * DAY) {
      const span = (endMs + pulseDays * DAY) - (b.ms - 4 * DAY);
      const u = clamp01((ms - (b.ms - 4 * DAY)) / (span || 1));
      pulse = Math.sin(u * Math.PI); // 0→1→0 over the active window
    }
    const active = ms >= b.ms - 4 * DAY && ms <= endMs + pulseDays * DAY;
    let alpha;
    if (ms <= endMs + pulseDays * DAY) alpha = 1;
    else alpha = clamp01((endMs + tailDays * DAY - ms) / (tailDays * DAY));
    return { pulse, alpha, active };
  }

  // === Battle of the Atlantic ===============================================
  const ATL_LANES = (DATA.atlantic && DATA.atlantic.lanes) || [];
  const ATL_SERIES = (() => {
    const raw = ((DATA.atlantic && DATA.atlantic.intensity) || [])
      .map((p) => ({ ms: parseDate(p.date), tonnage: +p.tonnageSunk || 0, uboats: +p.uboatsLost || 0, note: p.note || "" }))
      .filter((p) => p.ms != null)
      .sort((a, b) => a.ms - b.ms);
    return raw;
  })();
  const ATL_MAX = ATL_SERIES.reduce((m, p) => Math.max(m, p.tonnage), 1);
  function atlanticAt(ms) {
    if (!ATL_SERIES.length) return { tonnage: 0, norm: 0 };
    if (ms <= ATL_SERIES[0].ms) return { tonnage: ATL_SERIES[0].tonnage, norm: ATL_SERIES[0].tonnage / ATL_MAX };
    const last = ATL_SERIES[ATL_SERIES.length - 1];
    if (ms >= last.ms) return { tonnage: last.tonnage, norm: last.tonnage / ATL_MAX };
    let i = 1; while (i < ATL_SERIES.length && ATL_SERIES[i].ms < ms) i++;
    const a = ATL_SERIES[i - 1], b = ATL_SERIES[i];
    const u = (ms - a.ms) / ((b.ms - a.ms) || 1);
    const ton = a.tonnage + (b.tonnage - a.tonnage) * u;
    return { tonnage: ton, norm: ton / ATL_MAX };
  }

  // === Running death toll ===================================================
  // Cumulative dead (millions, military + civilian), interpolated between
  // anchors. A sombre counter, not a precise figure.
  const DEATHS = ((DATA.casualties) || [])
    .map((p) => ({ ms: parseDate(p.date), dead: +p.dead || 0 }))
    .filter((p) => p.ms != null)
    .sort((a, b) => a.ms - b.ms);
  function deathsAt(ms) {
    if (!DEATHS.length) return 0;
    if (ms <= DEATHS[0].ms) return DEATHS[0].dead;
    const last = DEATHS[DEATHS.length - 1];
    if (ms >= last.ms) return last.dead;
    let i = 1; while (i < DEATHS.length && DEATHS[i].ms < ms) i++;
    const a = DEATHS[i - 1], b = DEATHS[i];
    const u = (ms - a.ms) / ((b.ms - a.ms) || 1);
    return a.dead + (b.dead - a.dead) * u;
  }

  // === Timeline scrubber ticks ==============================================
  // The big, signpost events shown on the time ribbon. Picked from BATTLES by
  // magnitude so the ribbon doesn't clutter.
  function timelineTicks() {
    return BATTLES.filter((b) => b.magnitude >= 5)
      .map((b) => ({ ms: b.ms, t: tFromMs(b.ms), label: b.name, kind: b.kind, theatre: b.theatre }));
  }

  return {
    START, END, SPAN, DAY,
    parseDate, tFromMs, msFromT, tFromDate, fmtMs, fmtMonth, clamp01,
    PHASES, phaseAt,
    FACTIONS, SIDE,
    CHANGES, MAPPED_COUNTRIES, controlAt, lastChange, controlSignature,
    FRONTS, frontAt, FRONT_N,
    ARROWS, ARROW_COLOR, arrowEnvelope,
    BATTLES, battleActivity,
    ATL_LANES, ATL_SERIES, ATL_MAX, atlanticAt,
    DEATHS, deathsAt,
    timelineTicks,
  };
});
