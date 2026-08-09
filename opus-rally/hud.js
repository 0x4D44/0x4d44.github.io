// The in-race instrument set. Everything a driver reads at 140 km/h with 0.2 s of
// spare attention, so the rules here are: shape before text, motion before value,
// and nothing that makes the eye hunt.
//
// Structure: every numeric, geometric and formatting decision lives in an exported
// pure function above `createHud`, because the browser is not available under Node
// and those decisions are exactly the ones worth regression-testing. The DOM half
// below only wires those answers onto nodes it built once.
//
// Per-frame discipline: `update()` allocates nothing steady-state. The functions it
// calls take a caller-owned `out`, every string write is change-detected against a
// cache, and values are quantised to display precision first so a needle wobbling
// in the third decimal does not re-format a string sixty times a second. Writing a
// style or an attribute does allocate a string in the engine — unavoidable in JS —
// which is why the change detection exists: a settled HUD writes nothing at all.

import { clamp, saturate, lerp, invLerp, damp } from "./mathx.js";

const EMPTY = Object.freeze({});
const SVG_NS = "http://www.w3.org/2000/svg";

export const HUD_VERSION = 1;

// ---------------------------------------------------------------- time & delta

const TIME_PLACEHOLDERS = ["--:--", "--:--.-", "--:--.--", "--:--.---"];

function pad(n, width) {
  let s = String(n);
  while (s.length < width) s = "0" + s;
  return s;
}

// Stage times truncate, never round: a 59.999 is not a 60.00, and every timing
// screen in the sport agrees on that.
export function formatTime(ms, opts = EMPTY) {
  const decimals = opts.decimals === undefined ? 3 : (opts.decimals | 0);
  const d = decimals < 0 ? 0 : decimals > 3 ? 3 : decimals;
  if (!Number.isFinite(ms)) return opts.placeholder || TIME_PLACEHOLDERS[d];
  const neg = ms < 0;
  const scale = d === 0 ? 1 : d === 1 ? 10 : d === 2 ? 100 : 1000;
  const ticks = Math.floor((Math.abs(ms) / 1000) * scale);
  const totalSec = Math.floor(ticks / scale);
  const frac = ticks - totalSec * scale;
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor(totalSec / 60) - hours * 60;
  const secs = totalSec - hours * 3600 - mins * 60;
  let out = neg ? "-" : "";
  if (hours > 0 || opts.forceHours) out += hours + ":" + pad(mins, 2);
  else out += pad(Math.floor(totalSec / 60), 2);
  out += ":" + pad(secs, 2);
  if (d > 0) out += "." + pad(frac, d);
  return out;
}

export function formatClock(ms) {
  return formatTime(ms, CLOCK_OPTS);
}
const CLOCK_OPTS = Object.freeze({ decimals: 0 });

// Deltas round to nearest — they are a comparison, not a record, and a delta that
// truncates reads as optimistic when you are behind.
export function formatDelta(ms, opts = EMPTY) {
  const decimals = opts.decimals === undefined ? 2 : (opts.decimals | 0);
  const d = decimals < 0 ? 0 : decimals > 3 ? 3 : decimals;
  if (!Number.isFinite(ms)) return opts.placeholder || "--.--";
  const scale = d === 0 ? 1 : d === 1 ? 10 : d === 2 ? 100 : 1000;
  const ticks = Math.round((Math.abs(ms) / 1000) * scale);
  const totalSec = Math.floor(ticks / scale);
  const frac = ticks - totalSec * scale;
  const sign = ticks === 0 ? "" : ms < 0 ? "-" : "+";
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec - mins * 60;
  let body = mins > 0 ? mins + ":" + pad(secs, 2) : String(secs);
  if (d > 0) body += "." + pad(frac, d);
  return sign + body;
}

// Negative is quicker. The deadband stops a delta of one millisecond painting the
// screen red when the driver is, to any human purpose, exactly level.
export function deltaState(ms, deadband = 5) {
  if (!Number.isFinite(ms)) return "none";
  if (Math.abs(ms) <= deadband) return "level";
  return ms < 0 ? "ahead" : "behind";
}

export const DELTA_COLOURS = Object.freeze({
  ahead: "#2fe08a",
  behind: "#ff4a5c",
  level: "#c8d2dc",
  none: "#6d7883",
});

export function deltaColour(ms, deadband = 5) {
  return DELTA_COLOURS[deltaState(ms, deadband)];
}

// ---------------------------------------------------------------- speed & units

export const UNITS = Object.freeze({ KMH: "kmh", MPH: "mph" });
const MPH_PER_KMH = 0.621371192;

export function normaliseUnits(u) {
  const s = String(u === undefined || u === null ? "" : u).toLowerCase();
  if (s === "mph" || s === "imperial" || s === "mi") return UNITS.MPH;
  return UNITS.KMH;
}

export function convertSpeed(kph, units) {
  const v = Number.isFinite(kph) ? kph : 0;
  return normaliseUnits(units) === UNITS.MPH ? v * MPH_PER_KMH : v;
}

export function unitLabel(units) {
  return normaliseUnits(units) === UNITS.MPH ? "MPH" : "KM/H";
}

const odoScratch = [0, 0, 0, 0];

// Odometer wheels: the units wheel turns continuously, and each wheel above it only
// starts to turn in the last tenth before its neighbour carries — which is what makes
// a mechanical odometer read as one mechanism rather than four independent counters.
export function odometerOffsets(value, digits = 3, out = odoScratch) {
  const n = digits < 1 ? 1 : digits > out.length ? out.length : digits;
  const v = Number.isFinite(value) ? Math.max(value, 0) : 0;
  let place = 1;
  for (let i = 0; i < n; i += 1) {
    const p = v / place;
    if (i === 0) {
      out[i] = p % 10;
    } else {
      const f = p - Math.floor(p);
      const roll = f > 0.9 ? (f - 0.9) * 10 : 0;
      out[i] = (Math.floor(p) % 10) + roll;
    }
    place *= 10;
  }
  for (let i = n; i < out.length; i += 1) out[i] = 0;
  return out;
}

// ---------------------------------------------------------------- rev counter

export const DIAL_START_DEG = -128;
export const DIAL_END_DEG = 128;

export function needleAngle(rpm, rpmLimit, opts = EMPTY) {
  const start = opts.startDeg === undefined ? DIAL_START_DEG : opts.startDeg;
  const end = opts.endDeg === undefined ? DIAL_END_DEG : opts.endDeg;
  const limit = Number.isFinite(rpmLimit) && rpmLimit > 0 ? rpmLimit : 8000;
  const head = opts.headroom === undefined ? 1.06 : opts.headroom;
  const full = limit * (head > 0 ? head : 1);
  const v = Number.isFinite(rpm) ? rpm : 0;
  return start + (end - start) * clamp(v / full, 0, 1);
}

// A real needle has mass. Slightly under-critical damping gives the small overshoot
// the eye reads as "the engine picked up", which a raw lerp cannot.
export function stepNeedle(state, target, dt, stiffness = 340, damping = 30) {
  const goal = Number.isFinite(target) ? target : 0;
  if (!Number.isFinite(state.angle)) { state.angle = goal; state.vel = 0; }
  if (!Number.isFinite(state.vel)) state.vel = 0;
  let remaining = Number.isFinite(dt) ? clamp(dt, 0, 0.25) : 0;
  const h = 1 / 240;
  while (remaining > 0) {
    const step = remaining > h ? h : remaining;
    state.vel += ((goal - state.angle) * stiffness - state.vel * damping) * step;
    state.angle += state.vel * step;
    remaining -= step;
  }
  return state.angle;
}

export const SHIFT_LIGHT_COUNT = 12;
const shiftScratch = { lit: 0, count: SHIFT_LIGHT_COUNT, band: "off", flash: false, frac: 0, green: 5, amber: 4 };

export function shiftLightState(rpm, rpmLimit, opts = EMPTY, out = shiftScratch) {
  const count = opts.count === undefined ? SHIFT_LIGHT_COUNT : opts.count | 0;
  const begin = opts.begin === undefined ? 0.62 : opts.begin;
  const full = opts.full === undefined ? 0.985 : opts.full;
  const limiter = opts.limiter === undefined ? 0.995 : opts.limiter;
  const limit = Number.isFinite(rpmLimit) && rpmLimit > 0 ? rpmLimit : 8000;
  const frac = clamp((Number.isFinite(rpm) ? rpm : 0) / limit, 0, 2);
  const t = saturate(invLerp(begin, full, frac));
  const green = Math.round(count * 0.42);
  const amber = Math.round(count * 0.33);
  const lit = Math.ceil(t * count);
  out.count = count;
  out.frac = frac;
  out.green = green;
  out.amber = amber;
  out.lit = lit;
  out.flash = frac >= limiter;
  out.band = out.flash ? "limiter"
    : lit <= 0 ? "off"
      : lit <= green ? "green"
        : lit <= green + amber ? "amber" : "red";
  return out;
}

export function shiftLightBand(index, state) {
  if (index < state.green) return "green";
  if (index < state.green + state.amber) return "amber";
  return "red";
}

// Majors every 1000 rpm, minors every 500, redline where the limiter sits. Returned
// into a caller array because the static dial layer rebuilds on resize, not per frame.
export function gaugeTicks(rpmLimit, opts = EMPTY, out = []) {
  out.length = 0;
  const limit = Number.isFinite(rpmLimit) && rpmLimit > 0 ? rpmLimit : 8000;
  const full = limit * (opts.headroom === undefined ? 1.06 : opts.headroom);
  const majorStep = opts.majorStep || 1000;
  const minorStep = opts.minorStep || 500;
  for (let v = 0; v <= full + 1e-6; v += minorStep) {
    const major = Math.abs(v / majorStep - Math.round(v / majorStep)) < 1e-6;
    out.push({
      value: v,
      major,
      label: major ? String(Math.round(v / 1000)) : "",
      angle: needleAngle(v, limit, opts),
      redline: v >= limit,
    });
  }
  return out;
}

// ---------------------------------------------------------------- pacenote arrow

export const ARROW_VIEW = 120;
const ARROW_PAD = 9;
const ARROW_HEAD_LEN = 21;
const ARROW_HEAD_HALF = 13;
const ARROW_SAMPLES = 40;

// Severity runs 1 (hairpin) to 6 (flat out), the numeric call system. The glyph must
// therefore get *straighter* as the number rises, and it does so by construction: the
// spine is a genuine circular arc of turn angle theta(sev) and arc length L(sev), so
// its curvature theta/L is strictly decreasing and the drawn shape cannot drift from
// the number printed beside it.
export function arrowTurnAngle(severity) {
  const s = clamp(Number.isFinite(severity) ? severity : 4, 1, 6);
  const u = (6 - s) / 5;
  return 0.30 + (2.62 - 0.30) * Math.pow(u, 1.25);
}

export function arrowArcLength(severity) {
  const s = clamp(Number.isFinite(severity) ? severity : 4, 1, 6);
  return lerp(60, 86, (s - 1) / 5);
}

export function arrowCurvature(severity) {
  return arrowTurnAngle(severity) / arrowArcLength(severity);
}

export function normaliseDirection(dir) {
  if (typeof dir === "number") return dir < 0 ? -1 : 1;
  const s = String(dir === undefined || dir === null ? "" : dir).trim().toLowerCase();
  if (s === "l" || s === "left" || s === "-1") return -1;
  return 1;
}

function fx(n) {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? "0" : String(v);
}

// Samples + head corners for one arrow, in unshifted arc space; the caller re-centres.
function arrowGeometry(severity, dir) {
  const d = normaliseDirection(dir);
  const theta = arrowTurnAngle(severity);
  const L = arrowArcLength(severity);
  const R = L / theta;
  const xs = new Float64Array(ARROW_SAMPLES + 1);
  const ys = new Float64Array(ARROW_SAMPLES + 1);
  for (let i = 0; i <= ARROW_SAMPLES; i += 1) {
    const phi = (theta * i) / ARROW_SAMPLES;
    xs[i] = d * R * (1 - Math.cos(phi));
    ys[i] = -R * Math.sin(phi);
  }
  const tipDirX = d * Math.sin(theta);
  const tipDirY = -Math.cos(theta);
  const endX = xs[ARROW_SAMPLES];
  const endY = ys[ARROW_SAMPLES];
  const tipX = endX + tipDirX * ARROW_HEAD_LEN;
  const tipY = endY + tipDirY * ARROW_HEAD_LEN;
  const nX = -tipDirY;
  const nY = tipDirX;
  const baseX = endX + tipDirX * ARROW_HEAD_LEN * 0.18;
  const baseY = endY + tipDirY * ARROW_HEAD_LEN * 0.18;
  const head = [
    tipX, tipY,
    baseX + nX * ARROW_HEAD_HALF, baseY + nY * ARROW_HEAD_HALF,
    baseX - nX * ARROW_HEAD_HALF, baseY - nY * ARROW_HEAD_HALF,
  ];
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const see = (x, y) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  for (let i = 0; i <= ARROW_SAMPLES; i += 1) see(xs[i], ys[i]);
  for (let i = 0; i < head.length; i += 2) see(head[i], head[i + 1]);
  const span = ARROW_VIEW - ARROW_PAD * 2;
  const scale = Math.min(1, span / Math.max(maxX - minX, 1e-6), span / Math.max(maxY - minY, 1e-6));
  const offX = ARROW_VIEW * 0.5 - ((minX + maxX) * 0.5) * scale;
  const offY = ARROW_VIEW * 0.5 - ((minY + maxY) * 0.5) * scale;
  return { xs, ys, head, theta, radius: R, arcLength: L, curvature: theta / L, dir: d, scale, offX, offY };
}

// One cubic per <=60 degrees of arc, with the standard 4/3*tan(delta/4) handle, so the
// emitted path is the circular arc to well under a tenth of a pixel.
export function arrowPathForSeverity(severity, dir) {
  const g = arrowGeometry(severity, dir);
  const segs = Math.max(1, Math.ceil(g.theta / (Math.PI / 3)));
  const delta = g.theta / segs;
  const h = g.radius * (4 / 3) * Math.tan(delta / 4);
  const at = (phi) => {
    const x = g.dir * g.radius * (1 - Math.cos(phi));
    const y = -g.radius * Math.sin(phi);
    return [g.offX + x * g.scale, g.offY + y * g.scale];
  };
  const tangent = (phi) => [g.dir * Math.sin(phi) * g.scale, -Math.cos(phi) * g.scale];
  const p0 = at(0);
  let out = "M " + fx(p0[0]) + " " + fx(p0[1]);
  for (let i = 0; i < segs; i += 1) {
    const a = delta * i;
    const b = delta * (i + 1);
    const pa = at(a); const pb = at(b);
    const ta = tangent(a); const tb = tangent(b);
    out += " C " + fx(pa[0] + ta[0] * h) + " " + fx(pa[1] + ta[1] * h)
      + " " + fx(pb[0] - tb[0] * h) + " " + fx(pb[1] - tb[1] * h)
      + " " + fx(pb[0]) + " " + fx(pb[1]);
  }
  return out;
}

export function arrowHeadPath(severity, dir) {
  const g = arrowGeometry(severity, dir);
  const p = g.head;
  return "M " + fx(g.offX + p[0] * g.scale) + " " + fx(g.offY + p[1] * g.scale)
    + " L " + fx(g.offX + p[2] * g.scale) + " " + fx(g.offY + p[3] * g.scale)
    + " L " + fx(g.offX + p[4] * g.scale) + " " + fx(g.offY + p[5] * g.scale)
    + " Z";
}

const STRAIGHT_KINDS = new Set(["straight", "flat", "long", "crest", "jump", "caution", "care", "finish", "start", "keep"]);

const noteScratch = {
  severity: 0, dir: 1, kind: "straight", label: "", mods: [], s: 0, distance: 0, text: "", key: "",
};

// pacenotes.js owns the call model; the HUD accepts whatever field names a note happens
// to carry so a rename upstream degrades to a blank chip, never to a thrown frame.
export function normalisePacenote(note, out = null) {
  const o = out || { severity: 0, dir: 1, kind: "straight", label: "", mods: [], s: 0, distance: 0, text: "", key: "" };
  o.mods.length = 0;
  if (!note || typeof note !== "object") {
    o.severity = 0; o.dir = 1; o.kind = "none"; o.label = ""; o.s = 0; o.distance = 0; o.text = ""; o.key = "";
    return o;
  }
  const sev = firstNumber(note, "severity", "grade", "level", "number");
  o.severity = Number.isFinite(sev) ? clamp(sev, 1, 6) : 0;
  o.dir = normaliseDirection(note.dir !== undefined ? note.dir
    : note.direction !== undefined ? note.direction
      : note.side !== undefined ? note.side : note.turn);
  const kind = String(note.kind || note.type || (o.severity > 0 ? "turn" : "straight")).toLowerCase();
  o.kind = kind;
  o.isTurn = !STRAIGHT_KINDS.has(kind) && o.severity > 0;
  o.label = String(note.label || note.text || "").trim();
  o.text = o.label;
  const s = firstNumber(note, "s", "distanceS", "arc", "at");
  o.s = Number.isFinite(s) ? s : 0;
  const dist = firstNumber(note, "distance", "toGo", "into", "gap");
  o.distance = Number.isFinite(dist) ? dist : 0;
  const mods = note.mods || note.modifiers || note.tags || note.chips;
  if (Array.isArray(mods)) {
    for (let i = 0; i < mods.length && o.mods.length < 4; i += 1) {
      const m = mods[i];
      const txt = typeof m === "string" ? m : m && (m.text || m.label || m.kind || m.name);
      if (txt) o.mods.push(String(txt).toUpperCase().slice(0, 10));
    }
  }
  o.key = o.kind + "|" + o.severity + "|" + o.dir + "|" + o.s + "|" + o.mods.join(",");
  return o;
}

function firstNumber(obj, ...keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const v = obj[keys[i]];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return NaN;
}

export function directionLabel(dir) {
  return normaliseDirection(dir) < 0 ? "LEFT" : "RIGHT";
}

// ---------------------------------------------------------------- route ribbon

const ribbonPoint = { x: 0, y: 0 };

function stagePoints(stage) {
  if (!stage) return null;
  if (Array.isArray(stage)) return { list: stage, count: stage.length };
  if (stage.x && stage.z && (stage.count || stage.x.length)) {
    return { xs: stage.x, zs: stage.z, count: Math.min(stage.count || stage.x.length, stage.x.length, stage.z.length) };
  }
  if (Array.isArray(stage.points)) return { list: stage.points, count: stage.points.length };
  return null;
}

// The ribbon is the stage seen from above, fitted with one uniform scale so the shape
// stays honest — a stretched-to-fit route would tell the driver a lie about a hairpin.
export function routeRibbonLayout(stage, opts = EMPTY) {
  const width = opts.width || 320;
  const height = opts.height || 74;
  const padding = opts.pad === undefined ? 8 : opts.pad;
  const maxPoints = opts.maxPoints || 260;
  const src = stagePoints(stage);
  const xs = [];
  const ys = [];
  const layout = {
    d: "", xs, ys, width, height, pad: padding, length: 0, cum: [], empty: true,
  };
  if (!src || !src.count) return layout;
  const stride = Math.max(1, Math.ceil(src.count / maxPoints));
  const rawX = [];
  const rawZ = [];
  for (let i = 0; i < src.count; i += stride) {
    const px = src.list ? valueOf(src.list[i], "x") : src.xs[i];
    const pz = src.list ? valueOf(src.list[i], "z") : src.zs[i];
    if (!Number.isFinite(px) || !Number.isFinite(pz)) continue;
    rawX.push(px); rawZ.push(pz);
  }
  const lastIdx = src.count - 1;
  if (lastIdx % stride !== 0) {
    const px = src.list ? valueOf(src.list[lastIdx], "x") : src.xs[lastIdx];
    const pz = src.list ? valueOf(src.list[lastIdx], "z") : src.zs[lastIdx];
    if (Number.isFinite(px) && Number.isFinite(pz)) { rawX.push(px); rawZ.push(pz); }
  }
  if (!rawX.length) return layout;

  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < rawX.length; i += 1) {
    if (rawX[i] < minX) minX = rawX[i];
    if (rawX[i] > maxX) maxX = rawX[i];
    if (rawZ[i] < minZ) minZ = rawZ[i];
    if (rawZ[i] > maxZ) maxZ = rawZ[i];
  }
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const innerW = Math.max(width - padding * 2, 0);
  const innerH = Math.max(height - padding * 2, 0);
  let scale = 0;
  if (spanX > 1e-9 || spanZ > 1e-9) {
    const sx = spanX > 1e-9 ? innerW / spanX : Infinity;
    const sz = spanZ > 1e-9 ? innerH / spanZ : Infinity;
    scale = Math.min(sx, sz);
  }
  if (!Number.isFinite(scale) || scale < 0) scale = 0;
  const midX = (minX + maxX) * 0.5;
  const midZ = (minZ + maxZ) * 0.5;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const loX = padding; const hiX = width - padding;
  const loY = padding; const hiY = height - padding;
  let d = "";
  let total = 0;
  const cum = layout.cum;
  for (let i = 0; i < rawX.length; i += 1) {
    // +Z is north, and north reads as up on a map; the flip is deliberate.
    const px = clamp(cx + (rawX[i] - midX) * scale, loX, hiX);
    const py = clamp(cy - (rawZ[i] - midZ) * scale, loY, hiY);
    xs.push(px); ys.push(py);
    if (i > 0) {
      const dx = px - xs[i - 1];
      const dy = py - ys[i - 1];
      total += Math.sqrt(dx * dx + dy * dy);
    }
    cum.push(total);
    d += (i === 0 ? "M " : " L ") + fx(px) + " " + fx(py);
  }
  layout.d = d;
  layout.length = total;
  layout.empty = false;
  return layout;
}

function valueOf(p, key) {
  if (!p) return NaN;
  const v = p[key];
  return typeof v === "number" ? v : NaN;
}

export function routeRibbonPath(stage, opts = EMPTY) {
  return routeRibbonLayout(stage, opts).d;
}

// Stage samples are uniformly spaced in arc length, so an index fraction is an arc
// fraction and the marker needs no search.
export function ribbonPointAtFraction(layout, t, out = ribbonPoint) {
  const n = layout && layout.xs ? layout.xs.length : 0;
  if (!n) { out.x = 0; out.y = 0; return out; }
  const u = saturate(Number.isFinite(t) ? t : 0) * (n - 1);
  const i = Math.floor(u);
  const j = Math.min(i + 1, n - 1);
  const f = u - i;
  out.x = lerp(layout.xs[i], layout.xs[j], f);
  out.y = lerp(layout.ys[i], layout.ys[j], f);
  return out;
}

export function ribbonLengthAtFraction(layout, t) {
  const n = layout && layout.cum ? layout.cum.length : 0;
  if (!n) return 0;
  const u = saturate(Number.isFinite(t) ? t : 0) * (n - 1);
  const i = Math.floor(u);
  const j = Math.min(i + 1, n - 1);
  return lerp(layout.cum[i], layout.cum[j], u - i);
}

// ---------------------------------------------------------------- damage

// A fixed palette rather than a computed colour, because tinting eight panels every
// frame must not mint eight strings every frame.
const DAMAGE_TINT_STEPS = 25;
const DAMAGE_TINTS = (() => {
  const list = new Array(DAMAGE_TINT_STEPS);
  for (let i = 0; i < DAMAGE_TINT_STEPS; i += 1) {
    const v = i / (DAMAGE_TINT_STEPS - 1);
    let h; let s; let l;
    if (v < 0.35) {
      const t = v / 0.35;
      h = lerp(195, 52, t); s = lerp(9, 62, t); l = lerp(30, 47, t);
    } else {
      const t = (v - 0.35) / 0.65;
      h = lerp(52, 2, t); s = lerp(62, 86, t); l = lerp(47, 52, t);
    }
    list[i] = "hsl(" + Math.round(h) + " " + Math.round(s) + "% " + Math.round(l) + "%)";
  }
  return Object.freeze(list);
})();

export function damageTintIndex(value) {
  const v = Number.isFinite(value) ? saturate(value) : 0;
  return Math.round(v * (DAMAGE_TINT_STEPS - 1));
}

export function damageTint(value) {
  return DAMAGE_TINTS[damageTintIndex(value)];
}

export const DAMAGE_SLOTS = Object.freeze([
  "engine", "gearbox", "suspension", "bodyFront", "bodyRear", "bodyLeft", "bodyRight", "wheels", "cooling",
]);

const SLOT_ALIASES = (() => {
  const m = new Map();
  const add = (slot, ...names) => names.forEach((n) => m.set(n, slot));
  add("engine", "engine", "motor", "powertrain", "power", "block");
  add("gearbox", "gearbox", "transmission", "gears", "clutch", "drivetrain", "diff", "differential");
  add("suspension", "suspension", "susp", "dampers", "damper", "suspensionfront", "suspensionrear", "suspfl", "suspfr", "susprl", "susprr", "steering");
  add("bodyFront", "front", "bodyfront", "nose", "bumperfront", "bonnet", "hood", "frontbody");
  add("bodyRear", "rear", "bodyrear", "tail", "bumperrear", "boot", "rearbody");
  add("bodyLeft", "left", "bodyleft", "leftside", "flankleft", "sideleft");
  add("bodyRight", "right", "bodyright", "rightside", "flankright", "sideright");
  add("wheels", "wheels", "wheel", "tyres", "tyre", "tires", "tire", "puncture", "rims");
  add("cooling", "cooling", "radiator", "coolant", "temperature", "temp", "overheat");
  return m;
})();

const damageScratch = {
  values: new Float32Array(DAMAGE_SLOTS.length),
  worst: 0, worstSlot: "", puncture: false, overheating: false, terminal: false, rows: 0,
};

function damageValueOf(row) {
  if (typeof row === "number") return saturate(row);
  if (!row || typeof row !== "object") return 0;
  const dmg = firstNumber(row, "damage", "value", "level", "wear", "severity", "amount");
  if (Number.isFinite(dmg)) return saturate(dmg > 1 ? dmg / 100 : dmg);
  const health = firstNumber(row, "health", "condition", "integrity", "remaining");
  if (Number.isFinite(health)) return saturate(1 - (health > 1 ? health / 100 : health));
  return 0;
}

function rowKeyOf(row, fallbackIndex) {
  if (!row || typeof row !== "object") return String(fallbackIndex);
  return String(row.key || row.id || row.slot || row.component || row.part || row.name || row.label || fallbackIndex);
}

// Accepts damage.js's `damageReport()` in any of the plausible shapes it may settle on:
// an array of rows, `{rows:[...]}`, or a flat map of component -> number.
export function normaliseDamageRows(report, out = damageScratch) {
  const values = out.values;
  values.fill(0);
  out.worst = 0; out.worstSlot = ""; out.puncture = false; out.overheating = false;
  out.terminal = false; out.rows = 0;
  if (!report || typeof report !== "object") return out;
  const rows = Array.isArray(report) ? report
    : Array.isArray(report.rows) ? report.rows
      : Array.isArray(report.components) ? report.components : null;
  if (rows) {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const slot = SLOT_ALIASES.get(rowKeyOf(row, i).toLowerCase().replace(/[^a-z]/g, ""));
      const v = damageValueOf(row);
      out.rows += 1;
      if (row && typeof row === "object") {
        if (row.punctured || row.puncture) out.puncture = true;
        if (row.terminal || row.fatal || String(row.status || "").toLowerCase() === "terminal") out.terminal = true;
      }
      if (!slot) continue;
      const idx = DAMAGE_SLOTS.indexOf(slot);
      if (values[idx] < v) values[idx] = v;
    }
  } else {
    const keys = Object.keys(report);
    for (let i = 0; i < keys.length; i += 1) {
      const slot = SLOT_ALIASES.get(keys[i].toLowerCase().replace(/[^a-z]/g, ""));
      if (!slot) continue;
      const v = damageValueOf(report[keys[i]]);
      out.rows += 1;
      const idx = DAMAGE_SLOTS.indexOf(slot);
      if (values[idx] < v) values[idx] = v;
    }
    if (report.punctured || report.puncture) out.puncture = true;
    if (report.terminal || report.retired) out.terminal = true;
  }
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] > out.worst) { out.worst = values[i]; out.worstSlot = DAMAGE_SLOTS[i]; }
  }
  if (values[DAMAGE_SLOTS.indexOf("wheels")] >= 0.85) out.puncture = true;
  if (values[DAMAGE_SLOTS.indexOf("cooling")] >= 0.6) out.overheating = true;
  if (out.worst >= 0.97) out.terminal = true;
  return out;
}

// ---------------------------------------------------------------- palettes

const PALETTE = Object.freeze({
  ink: "#05070a",
  face: "#0d1218",
  hair: "rgba(146,170,190,0.20)",
  dim: "#6c7a88",
  text: "#e6eef5",
  ember: "#ff8a1f",
  ice: "#5fd8ff",
  good: "#2fe08a",
  warn: "#ffc23d",
  bad: "#ff4a5c",
  needle: "#ff5a2a",
  sweep: "#5fd8ff",
  redline: "#ff3b4e",
});

const PALETTE_HC = Object.freeze({
  ink: "#000000",
  face: "#000000",
  hair: "rgba(255,255,255,0.55)",
  dim: "#c9d6e2",
  text: "#ffffff",
  ember: "#ffb300",
  ice: "#7ff0ff",
  good: "#4dff9d",
  warn: "#ffdb4d",
  bad: "#ff6b7a",
  needle: "#ffffff",
  sweep: "#ffffff",
  redline: "#ff6b7a",
});

// ---------------------------------------------------------------- stylesheet

function stylesheet() {
  return `
.orh {
  position: absolute; inset: 0;
  --orh-scale: 1;
  --orh-ink: ${PALETTE.ink};
  --orh-face: ${PALETTE.face};
  --orh-hair: ${PALETTE.hair};
  --orh-dim: ${PALETTE.dim};
  --orh-text: ${PALETTE.text};
  --orh-ember: ${PALETTE.ember};
  --orh-ice: ${PALETTE.ice};
  --orh-good: ${PALETTE.good};
  --orh-warn: ${PALETTE.warn};
  --orh-bad: ${PALETTE.bad};
  --orh-glass: linear-gradient(168deg, rgba(13,18,24,0.90), rgba(8,11,15,0.62));
  --orh-cut: 11px;
  --orh-gap: 10px;
  --orh-ease: cubic-bezier(0.22, 0.61, 0.24, 1);
  --orh-pill: 118px;
  font-family: ui-sans-serif, "Segoe UI Variable Display", "Segoe UI", Inter, Roboto, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  font-size: calc(16px * var(--orh-scale));
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "ss01" 1;
  color: var(--orh-text);
  letter-spacing: 0.01em;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
  overflow: hidden;
  text-rendering: optimizeSpeed;
  z-index: 4;
}
.orh * { box-sizing: border-box; margin: 0; padding: 0; }

.orh-panel {
  background: var(--orh-glass);
  border: 1px solid var(--orh-hair);
  clip-path: polygon(var(--orh-cut) 0, 100% 0, 100% calc(100% - var(--orh-cut)), calc(100% - var(--orh-cut)) 100%, 0 100%, 0 var(--orh-cut));
  backdrop-filter: blur(9px) saturate(1.25);
  -webkit-backdrop-filter: blur(9px) saturate(1.25);
  box-shadow: 0 10px 26px rgba(0,0,0,0.42);
}
.orh-label {
  font-size: 0.5rem; font-weight: 700; letter-spacing: 0.22em;
  text-transform: uppercase; color: var(--orh-dim);
}

.orh-zones { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; }
.orh-top {
  display: flex; align-items: flex-start; gap: var(--orh-gap);
  /* The site-wide "back to almanac" pill owns the top-left 109x41; nothing of ours
     may sit beneath it, so the whole top rail starts clear of it. */
  padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 0
           calc(var(--orh-pill) + max(0px, env(safe-area-inset-left)));
}
.orh-bottom {
  display: flex; align-items: flex-end; justify-content: space-between; gap: var(--orh-gap);
  padding: 0 max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
}

/* pacenote --------------------------------------------------------------- */
.orh-note { position: relative; width: 20.5rem; padding: 0.5rem 0.7rem 0.55rem; }
.orh-note::before {
  content: ""; position: absolute; left: 0; top: var(--orh-cut); bottom: 0; width: 3px;
  background: linear-gradient(180deg, var(--orh-ember), rgba(255,138,31,0));
}
.orh-note-main { display: flex; align-items: center; gap: 0.55rem; will-change: transform, opacity; }
.orh-note-arrow { width: 5.2rem; height: 5.2rem; flex: none; overflow: visible; }
.orh-arrow-spine {
  fill: none; stroke: var(--orh-ember); stroke-width: 13; stroke-linecap: round;
  filter: drop-shadow(0 0 6px rgba(255,138,31,0.45));
}
.orh-arrow-head { fill: var(--orh-ember); filter: drop-shadow(0 0 6px rgba(255,138,31,0.45)); }
.orh-note-body { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.orh-note-sev {
  font-size: 3.3rem; font-weight: 800; line-height: 0.86; letter-spacing: -0.04em;
  color: var(--orh-text); text-shadow: 0 2px 14px rgba(0,0,0,0.6);
}
.orh-note-dir { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.2em; color: var(--orh-ember); }
.orh-note-mods { display: flex; flex-wrap: wrap; gap: 0.2rem; }
.orh-chip {
  font-size: 0.5rem; font-weight: 700; letter-spacing: 0.14em; padding: 0.14rem 0.34rem;
  border: 1px solid var(--orh-hair); border-radius: 2px; color: var(--orh-ice);
  background: rgba(95,216,255,0.09);
  opacity: 0; transform: scale(0.86);
  transition: opacity 160ms var(--orh-ease), transform 160ms var(--orh-ease);
}
.orh-chip.on { opacity: 1; transform: none; }
.orh-note-bar {
  position: relative; height: 4px; margin-top: 0.45rem; overflow: hidden;
  background: rgba(255,255,255,0.09);
}
.orh-note-fill {
  position: absolute; inset: 0; transform-origin: left center; transform: scaleX(0);
  background: linear-gradient(90deg, var(--orh-ember), #ffd07a);
  will-change: transform;
}
.orh-note-foot { display: flex; justify-content: space-between; align-items: baseline; margin-top: 0.22rem; }
.orh-note-dist { font-size: 0.86rem; font-weight: 700; color: var(--orh-text); }
.orh-note-dist span { font-size: 0.55rem; color: var(--orh-dim); margin-left: 0.14rem; }
.orh-queue { display: flex; align-items: center; gap: 0.3rem; opacity: 0.62; }
.orh-queue-arrow { width: 1.6rem; height: 1.6rem; flex: none; overflow: visible; }
.orh-queue-arrow .orh-arrow-spine { stroke: var(--orh-dim); stroke-width: 15; filter: none; }
.orh-queue-arrow .orh-arrow-head { fill: var(--orh-dim); filter: none; }
.orh-queue-sev { font-size: 1rem; font-weight: 800; color: var(--orh-dim); }
.orh-queue-txt { font-size: 0.52rem; letter-spacing: 0.16em; color: var(--orh-dim); }

/* stage / timing --------------------------------------------------------- */
.orh-stage { margin-left: auto; width: 21rem; padding: 0.5rem 0.7rem 0.55rem; }
.orh-stage-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
.orh-time { font-size: 1.9rem; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
.orh-delta {
  font-size: 1.05rem; font-weight: 800; color: var(--orh-dim);
  opacity: 0.45; transition: opacity 400ms var(--orh-ease), color 260ms var(--orh-ease);
  will-change: opacity;
}
.orh-delta.live { opacity: 1; }
.orh-ribbon { display: block; width: 100%; height: 4.6rem; margin-top: 0.3rem; overflow: visible; }
.orh-ribbon-track { fill: none; stroke: rgba(180,200,220,0.28); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }
.orh-ribbon-done { fill: none; stroke: var(--orh-ice); stroke-width: 2.6; stroke-linejoin: round; stroke-linecap: round; filter: drop-shadow(0 0 4px rgba(95,216,255,0.5)); }
.orh-split-mark { fill: none; stroke: var(--orh-dim); stroke-width: 1.6; opacity: 0; }
.orh-split-mark.on { opacity: 1; }
.orh-split-mark.done { stroke: var(--orh-ember); }
.orh-carmark { will-change: transform; }
.orh-carmark circle:first-child { fill: rgba(255,138,31,0.28); }
.orh-carmark circle:last-child { fill: var(--orh-ember); }
.orh-stage-foot { display: flex; justify-content: space-between; align-items: baseline; margin-top: 0.2rem; }
.orh-dist { font-size: 0.62rem; font-weight: 700; color: var(--orh-dim); letter-spacing: 0.1em; }

/* cluster ---------------------------------------------------------------- */
.orh-cluster { display: flex; align-items: flex-end; gap: 0.6rem; margin-left: auto; }
.orh-dialwrap { position: relative; display: flex; flex-direction: column; align-items: center; gap: 0.32rem; }
.orh-shift { display: flex; gap: 3px; padding: 0.24rem 0.34rem; background: rgba(6,9,12,0.66); border: 1px solid var(--orh-hair); }
.orh-led {
  width: 0.5rem; height: 0.28rem; background: rgba(255,255,255,0.10);
  transform: scaleY(0.7); transform-origin: center;
  transition: background-color 60ms linear, transform 90ms var(--orh-ease), box-shadow 90ms linear;
}
.orh-led.on { transform: scaleY(1); }
.orh-led.green.on { background: var(--orh-good); box-shadow: 0 0 7px rgba(47,224,138,0.8); }
.orh-led.amber.on { background: var(--orh-warn); box-shadow: 0 0 7px rgba(255,194,61,0.8); }
.orh-led.red.on { background: var(--orh-bad); box-shadow: 0 0 8px rgba(255,74,92,0.9); }
.orh-shift.limiter { animation: orh-limiter 110ms steps(1, end) infinite; }
@keyframes orh-limiter { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.18; } }

.orh-dial { position: relative; width: 13.6rem; height: 13.6rem; }
.orh-tacho { position: absolute; inset: 0; width: 100%; height: 100%; }
.orh-gear {
  position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%);
  font-size: 4.6rem; font-weight: 800; line-height: 1; letter-spacing: -0.06em;
  color: var(--orh-text); text-shadow: 0 3px 20px rgba(0,0,0,0.75);
  will-change: transform;
}
.orh-gear.limiter { color: var(--orh-bad); }
.orh-readout { display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem; padding: 0.5rem 0.7rem; }
.orh-speed { display: flex; align-items: flex-end; gap: 0.3rem; }
.orh-odo { display: flex; height: 3.1rem; overflow: hidden; }
.orh-digit { position: relative; width: 1.72rem; height: 3.1rem; overflow: hidden; }
.orh-strip {
  position: absolute; left: 0; top: 0; width: 100%;
  will-change: transform;
  transition: opacity 120ms linear;
}
.orh-strip b {
  display: block; height: 3.1rem; line-height: 3.1rem; text-align: center;
  font-size: 2.6rem; font-weight: 800; letter-spacing: -0.05em;
}
.orh-digit.blank .orh-strip { opacity: 0.14; }
.orh-unit { font-size: 0.56rem; font-weight: 700; letter-spacing: 0.2em; color: var(--orh-dim); padding-bottom: 0.5rem; }
.orh-meters { display: flex; align-items: center; gap: 0.5rem; width: 100%; }
.orh-meter { flex: 1; }
.orh-bar { position: relative; height: 5px; background: rgba(255,255,255,0.09); overflow: hidden; }
.orh-bar i { position: absolute; inset: 0; transform-origin: left center; transform: scaleX(0); will-change: transform; }
.orh-boost i { background: linear-gradient(90deg, var(--orh-ice), #b7f2ff); }
.orh-grip { position: relative; width: 2.6rem; height: 2.6rem; flex: none; }
.orh-grip svg { width: 100%; height: 100%; }
.orh-grip-ring { fill: none; stroke: rgba(255,255,255,0.12); stroke-width: 5; }
.orh-grip-arc { fill: none; stroke: var(--orh-good); stroke-width: 5; stroke-linecap: round; transform: rotate(-90deg); transform-origin: center; transition: stroke 140ms linear; }
.orh-grip-val { font-size: 0.46rem; font-weight: 800; text-anchor: middle; fill: var(--orh-dim); }

/* left cluster: damage + telemetry --------------------------------------- */
.orh-left { display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-start; }
.orh-warn {
  display: flex; align-items: center; gap: 0.36rem; padding: 0.3rem 0.6rem;
  background: rgba(255,74,92,0.14); border: 1px solid rgba(255,74,92,0.5);
  font-size: 0.6rem; font-weight: 800; letter-spacing: 0.18em; color: var(--orh-bad);
  opacity: 0; transform: translate3d(0, 8px, 0) scale(0.96);
  transition: opacity 220ms var(--orh-ease), transform 220ms var(--orh-ease);
  will-change: transform, opacity;
}
.orh-warn.on { opacity: 1; transform: none; }
.orh-warn.pulse { animation: orh-warnpulse 900ms ease-in-out infinite; }
@keyframes orh-warnpulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.42; } }
.orh-damage { display: flex; align-items: flex-end; gap: 0.45rem; padding: 0.45rem 0.6rem; }
.orh-carsvg { width: 4.1rem; height: 6.5rem; display: block; }
.orh-carsvg .part { transition: fill 260ms var(--orh-ease); }
.orh-carsvg .shell { fill: none; stroke: rgba(200,220,235,0.42); stroke-width: 2.2; }
.orh-carsvg .glass { fill: rgba(95,216,255,0.14); }
.orh-temp { display: flex; flex-direction: column; align-items: center; gap: 0.2rem; opacity: 0; transform: scale(0.88); transition: opacity 260ms var(--orh-ease), transform 260ms var(--orh-ease); will-change: transform, opacity; }
.orh-temp.on { opacity: 1; transform: none; }
.orh-temp-tube { position: relative; width: 6px; height: 3.4rem; background: rgba(255,255,255,0.10); overflow: hidden; }
.orh-temp-tube i { position: absolute; left: 0; right: 0; bottom: 0; height: 100%; transform-origin: bottom center; transform: scaleY(0); background: linear-gradient(0deg, var(--orh-good), var(--orh-warn) 62%, var(--orh-bad)); will-change: transform; }
.orh-temp-val { font-size: 0.5rem; font-weight: 800; color: var(--orh-dim); }
.orh-telemetry { padding: 0.35rem 0.45rem 0.3rem; opacity: 0; transform: translate3d(0, 6px, 0); transition: opacity 200ms var(--orh-ease), transform 200ms var(--orh-ease); }
.orh-telemetry.on { opacity: 1; transform: none; }
.orh-trace { display: block; width: 11rem; height: 3.1rem; }
.orh-legend { display: flex; gap: 0.5rem; margin-top: 0.2rem; }
.orh-legend span { font-size: 0.44rem; font-weight: 800; letter-spacing: 0.14em; color: var(--orh-dim); }
.orh-legend b { font-weight: 800; }
.orh-legend i { display: inline-block; width: 0.5rem; height: 2px; margin-right: 0.2rem; vertical-align: middle; }

/* centre stage: lights, countdown, finish, toasts ------------------------ */
.orh-centre { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; }
.orh-lights { display: flex; gap: 0.5rem; opacity: 0; transform: scale(0.9); transition: opacity 200ms var(--orh-ease), transform 200ms var(--orh-ease); }
.orh-lights.on { opacity: 1; transform: none; }
.orh-lamp {
  width: 1.5rem; height: 1.5rem; border-radius: 50%;
  background: rgba(255,255,255,0.07); border: 1px solid var(--orh-hair);
  transform: scale(0.82); transition: transform 160ms var(--orh-ease), background-color 120ms linear, box-shadow 160ms linear;
}
.orh-lamp.lit { background: var(--orh-bad); box-shadow: 0 0 22px rgba(255,74,92,0.75); transform: scale(1); }
.orh-lamp.go { background: var(--orh-good); box-shadow: 0 0 26px rgba(47,224,138,0.8); transform: scale(1.08); }
.orh-count {
  font-size: 6.4rem; font-weight: 800; letter-spacing: -0.05em; line-height: 0.9;
  opacity: 0; transform: scale(0.6); will-change: transform, opacity;
  text-shadow: 0 6px 40px rgba(0,0,0,0.7);
}
.orh-count.orh-pop-a { animation: orh-count-a 900ms var(--orh-ease) forwards; }
.orh-count.orh-pop-b { animation: orh-count-b 900ms var(--orh-ease) forwards; }
@keyframes orh-count-a { 0% { opacity: 0; transform: scale(1.7); } 18% { opacity: 1; transform: scale(1); } 78% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.94); } }
@keyframes orh-count-b { 0% { opacity: 0; transform: scale(1.7); } 18% { opacity: 1; transform: scale(1); } 78% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.94); } }

.orh-finish {
  min-width: 19rem; padding: 1.1rem 1.5rem; text-align: center;
  opacity: 0; transform: translate3d(0, 14px, 0) scale(0.96);
  transition: opacity 420ms var(--orh-ease), transform 420ms var(--orh-ease);
  will-change: transform, opacity;
}
.orh-finish.on { opacity: 1; transform: none; }
.orh-finish-kicker { font-size: 0.56rem; font-weight: 800; letter-spacing: 0.34em; color: var(--orh-ember); }
.orh-finish-time { font-size: 3.1rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; margin-top: 0.24rem; }
.orh-finish-delta { font-size: 1rem; font-weight: 800; }
.orh-finish-rows { display: flex; justify-content: center; gap: 1rem; margin-top: 0.5rem; }
.orh-finish-rows div { display: flex; flex-direction: column; gap: 0.1rem; }
.orh-finish-rows b { font-size: 0.86rem; font-weight: 700; }

.orh-toasts { position: absolute; left: 50%; bottom: 22%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 0.3rem; }
.orh-toast {
  padding: 0.34rem 0.8rem; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em;
  background: rgba(8,11,15,0.82); border: 1px solid var(--orh-hair); color: var(--orh-text);
  opacity: 0; transform: translate3d(0, 10px, 0);
  transition: opacity 220ms var(--orh-ease), transform 220ms var(--orh-ease);
  will-change: transform, opacity;
}
.orh-toast.on { opacity: 1; transform: none; }
.orh-toast.good { color: var(--orh-good); border-color: rgba(47,224,138,0.45); }
.orh-toast.bad { color: var(--orh-bad); border-color: rgba(255,74,92,0.45); }

/* the split-delta flash: two identical animations so re-adding a *different*
   class restarts it without a forced reflow read */
.orh-flash-a { animation: orh-flash-a 2600ms var(--orh-ease) forwards; }
.orh-flash-b { animation: orh-flash-b 2600ms var(--orh-ease) forwards; }
@keyframes orh-flash-a { 0% { opacity: 0.2; transform: scale(1.5); } 10% { opacity: 1; transform: scale(1.12); } 62% { opacity: 1; transform: scale(1); } 100% { opacity: 0.45; transform: scale(1); } }
@keyframes orh-flash-b { 0% { opacity: 0.2; transform: scale(1.5); } 10% { opacity: 1; transform: scale(1.12); } 62% { opacity: 1; transform: scale(1); } 100% { opacity: 0.45; transform: scale(1); } }
.orh-pop-a { animation: orh-pop-a 460ms var(--orh-ease); }
.orh-pop-b { animation: orh-pop-b 460ms var(--orh-ease); }
@keyframes orh-pop-a { 0% { opacity: 0.15; transform: translate3d(0, 10px, 0) scale(0.86); } 55% { opacity: 1; transform: translate3d(0, 0, 0) scale(1.06); } 100% { opacity: 1; transform: none; } }
@keyframes orh-pop-b { 0% { opacity: 0.15; transform: translate3d(0, 10px, 0) scale(0.86); } 55% { opacity: 1; transform: translate3d(0, 0, 0) scale(1.06); } 100% { opacity: 1; transform: none; } }

/* high contrast ---------------------------------------------------------- */
.orh.hc {
  --orh-face: #000; --orh-hair: rgba(255,255,255,0.62); --orh-dim: #d5e2ee;
  --orh-text: #fff; --orh-glass: linear-gradient(180deg, rgba(0,0,0,0.95), rgba(0,0,0,0.88));
}
.orh.hc .orh-panel { border-width: 2px; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
.orh.hc .orh-label, .orh.hc .orh-dist, .orh.hc .orh-unit { color: #fff; }
.orh.hc .orh-arrow-spine { stroke: #fff; filter: none; }
.orh.hc .orh-arrow-head { fill: #fff; filter: none; }

/* reduced motion --------------------------------------------------------- */
.orh.rm *, .orh.rm *::before, .orh.rm *::after {
  animation-duration: 1ms !important; animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
}
@media (prefers-reduced-motion: reduce) {
  .orh *, .orh *::before, .orh *::after {
    animation-duration: 1ms !important; animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}

/* responsive ------------------------------------------------------------- */
@media (max-width: 900px) {
  .orh { font-size: calc(14px * var(--orh-scale)); }
  .orh-note { width: 17rem; }
  .orh-stage { width: 17rem; }
  .orh-dial { width: 11rem; height: 11rem; }
  .orh-trace { width: 8.5rem; }
}
@media (max-width: 720px) and (orientation: landscape) {
  .orh { font-size: calc(12.5px * var(--orh-scale)); }
  .orh-note { width: 14.5rem; }
  .orh-stage { width: 14.5rem; }
  .orh-ribbon { height: 3.2rem; }
  .orh-dial { width: 9.4rem; height: 9.4rem; }
  .orh-odo { height: 2.3rem; }
  .orh-digit { width: 1.3rem; height: 2.3rem; }
  .orh-strip b { height: 2.3rem; line-height: 2.3rem; font-size: 1.9rem; }
  .orh-carsvg { width: 3rem; height: 4.8rem; }
  .orh-telemetry { display: none; }
}
@media (orientation: portrait) and (max-width: 560px) {
  .orh { font-size: calc(13px * var(--orh-scale)); }
  /* Below the pill rather than beside it: 390px of width will not carry both. */
  .orh-top {
    flex-direction: column; align-items: stretch;
    padding-left: max(10px, env(safe-area-inset-left));
    padding-top: calc(46px + max(0px, env(safe-area-inset-top)));
  }
  .orh-note, .orh-stage { width: auto; margin-left: 0; }
  .orh-bottom { flex-direction: column-reverse; align-items: stretch; gap: 0.5rem; }
  .orh-cluster { margin-left: 0; justify-content: space-between; width: 100%; }
  .orh-left { flex-direction: row; align-items: flex-end; gap: 0.4rem; }
  .orh-dial { width: 9rem; height: 9rem; }
  .orh-ribbon { height: 3rem; }
  .orh-telemetry { display: none; }
  .orh-note-arrow { width: 4rem; height: 4rem; }
  .orh-note-sev { font-size: 2.6rem; }
}
@media (max-height: 430px) {
  .orh-ribbon { height: 2.6rem; }
  .orh-telemetry { display: none; }
}
`;
}

// ---------------------------------------------------------------- DOM helpers

function makeEl(doc, tag, cls, parent) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function makeSvg(doc, tag, cls, parent, attrs) {
  const node = doc.createElementNS(SVG_NS, tag);
  if (cls) node.setAttribute("class", cls);
  if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
}

// Every per-frame write goes through one of these. A settled HUD then performs zero
// DOM work, which matters far more than the cost of the comparison.
function writeText(node, cache, key, value) {
  if (cache[key] === value) return;
  cache[key] = value;
  node.textContent = value;
}

function writeStyle(node, prop, cache, key, value) {
  if (cache[key] === value) return;
  cache[key] = value;
  node.style[prop] = value;
}

function writeAttr(node, attr, cache, key, value) {
  if (cache[key] === value) return;
  cache[key] = value;
  node.setAttribute(attr, value);
}

function toggleClass(node, cache, key, cls, on) {
  const want = !!on;
  if (cache[key] === want) return;
  cache[key] = want;
  if (want) node.classList.add(cls); else node.classList.remove(cls);
}

function q(v, step) {
  return Math.round(v / step) * step;
}

// ---------------------------------------------------------------- the HUD

const CAR_PARTS = [
  ["bodyFront", "M 26 30 C 36 12 84 12 94 30 L 90 44 C 76 32 44 32 30 44 Z"],
  ["engine", "M 32 48 L 88 48 L 84 82 L 36 82 Z"],
  ["bodyLeft", "M 20 48 L 32 52 L 32 156 L 20 156 Z"],
  ["bodyRight", "M 100 48 L 88 52 L 88 156 L 100 156 Z"],
  ["gearbox", "M 50 138 L 70 138 L 70 158 L 50 158 Z"],
  ["bodyRear", "M 24 162 L 96 162 L 92 184 C 78 194 42 194 28 184 Z"],
];

const CAR_WHEELS = [
  ["suspension", "M 8 46 L 22 46 L 22 78 L 8 78 Z"],
  ["suspension", "M 98 46 L 112 46 L 112 78 L 98 78 Z"],
  ["wheels", "M 8 136 L 22 136 L 22 168 L 8 168 Z"],
  ["wheels", "M 98 136 L 112 136 L 112 168 L 98 168 Z"],
];

const TRACE_SAMPLES = 168;

export function createHud(root, opts = EMPTY) {
  const doc = opts.document || (root && root.ownerDocument)
    || (typeof document !== "undefined" ? document : null);
  if (!doc) throw new Error("createHud needs a document");
  const now = opts.now || defaultNow();

  const style = doc.createElement("style");
  style.textContent = stylesheet();
  root.appendChild(style);

  const el = makeEl(doc, "div", "orh", root);
  const zones = makeEl(doc, "div", "orh-zones", el);
  const top = makeEl(doc, "div", "orh-top", zones);
  const bottom = makeEl(doc, "div", "orh-bottom", zones);

  // --- pacenote block
  const note = makeEl(doc, "section", "orh-note orh-panel", top);
  const noteMain = makeEl(doc, "div", "orh-note-main", note);
  const noteSvg = makeSvg(doc, "svg", "orh-note-arrow", noteMain, {
    viewBox: "0 0 " + ARROW_VIEW + " " + ARROW_VIEW, "aria-hidden": "true",
  });
  const noteSpine = makeSvg(doc, "path", "orh-arrow-spine", noteSvg, { d: "" });
  const noteHead = makeSvg(doc, "path", "orh-arrow-head", noteSvg, { d: "" });
  const noteBody = makeEl(doc, "div", "orh-note-body", noteMain);
  const noteSev = makeEl(doc, "div", "orh-note-sev", noteBody);
  const noteDir = makeEl(doc, "div", "orh-note-dir", noteBody);
  const noteMods = makeEl(doc, "div", "orh-note-mods", noteBody);
  const chips = [];
  for (let i = 0; i < 4; i += 1) chips.push(makeEl(doc, "span", "orh-chip", noteMods));
  const noteBar = makeEl(doc, "div", "orh-note-bar", note);
  const noteFill = makeEl(doc, "i", "orh-note-fill", noteBar);
  const noteFoot = makeEl(doc, "div", "orh-note-foot", note);
  const noteDist = makeEl(doc, "div", "orh-note-dist", noteFoot);
  // The number and its unit are separate leaves: writing textContent on a node that
  // has children would delete them.
  const noteDistVal = makeEl(doc, "b", null, noteDist);
  const noteDistUnit = makeEl(doc, "span", null, noteDist);
  const queue = makeEl(doc, "div", "orh-queue", noteFoot);
  const queueSvg = makeSvg(doc, "svg", "orh-queue-arrow", queue, {
    viewBox: "0 0 " + ARROW_VIEW + " " + ARROW_VIEW, "aria-hidden": "true",
  });
  const queueSpine = makeSvg(doc, "path", "orh-arrow-spine", queueSvg, { d: "" });
  const queueHead = makeSvg(doc, "path", "orh-arrow-head", queueSvg, { d: "" });
  const queueSev = makeEl(doc, "span", "orh-queue-sev", queue);
  const queueTxt = makeEl(doc, "span", "orh-queue-txt", queue);

  // --- stage block
  const stagePanel = makeEl(doc, "section", "orh-stage orh-panel", top);
  const stageHead = makeEl(doc, "div", "orh-stage-head", stagePanel);
  const timeEl = makeEl(doc, "div", "orh-time", stageHead);
  const deltaEl = makeEl(doc, "div", "orh-delta", stageHead);
  const RIB_W = 320;
  const RIB_H = 74;
  const ribbonSvg = makeSvg(doc, "svg", "orh-ribbon", stagePanel, {
    viewBox: "0 0 " + RIB_W + " " + RIB_H, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true",
  });
  const ribbonTrack = makeSvg(doc, "path", "orh-ribbon-track", ribbonSvg, { d: "" });
  const ribbonDone = makeSvg(doc, "path", "orh-ribbon-done", ribbonSvg, { d: "" });
  const splitMarks = [];
  for (let i = 0; i < 6; i += 1) {
    splitMarks.push(makeSvg(doc, "circle", "orh-split-mark", ribbonSvg, { r: "4", cx: "0", cy: "0" }));
  }
  const carMark = makeSvg(doc, "g", "orh-carmark", ribbonSvg);
  makeSvg(doc, "circle", null, carMark, { r: "7", cx: "0", cy: "0" });
  makeSvg(doc, "circle", null, carMark, { r: "3.2", cx: "0", cy: "0" });
  const stageFoot = makeEl(doc, "div", "orh-stage-foot", stagePanel);
  const distEl = makeEl(doc, "div", "orh-dist", stageFoot);
  const surfEl = makeEl(doc, "div", "orh-dist", stageFoot);

  // --- left: warnings, damage, temperature, telemetry
  const left = makeEl(doc, "div", "orh-left", bottom);
  const warn = makeEl(doc, "div", "orh-warn", left);
  const warnText = makeEl(doc, "span", null, warn);
  const telemetry = makeEl(doc, "div", "orh-telemetry orh-panel", left);
  const trace = makeEl(doc, "canvas", "orh-trace", telemetry);
  const legend = makeEl(doc, "div", "orh-legend", telemetry);
  legendItem(doc, legend, PALETTE.good, "THR");
  legendItem(doc, legend, PALETTE.bad, "BRK");
  legendItem(doc, legend, PALETTE.ice, "STR");
  const damagePanel = makeEl(doc, "div", "orh-damage orh-panel", left);
  const carSvg = makeSvg(doc, "svg", "orh-carsvg", damagePanel, {
    viewBox: "0 0 120 200", "aria-hidden": "true",
  });
  makeSvg(doc, "path", "shell", carSvg, {
    d: "M 60 8 C 80 8 94 22 97 46 L 100 96 L 100 152 C 100 178 84 194 60 194 C 36 194 20 178 20 152 L 20 96 L 23 46 C 26 22 40 8 60 8 Z",
  });
  const partNodes = [];
  for (let i = 0; i < CAR_PARTS.length; i += 1) {
    partNodes.push({
      slot: DAMAGE_SLOTS.indexOf(CAR_PARTS[i][0]),
      node: makeSvg(doc, "path", "part", carSvg, { d: CAR_PARTS[i][1], fill: DAMAGE_TINTS[0] }),
    });
  }
  makeSvg(doc, "path", "glass", carSvg, { d: "M 36 86 L 84 86 L 88 132 L 32 132 Z" });
  for (let i = 0; i < CAR_WHEELS.length; i += 1) {
    partNodes.push({
      slot: DAMAGE_SLOTS.indexOf(CAR_WHEELS[i][0]),
      node: makeSvg(doc, "path", "part", carSvg, { d: CAR_WHEELS[i][1], fill: DAMAGE_TINTS[0] }),
    });
  }
  const temp = makeEl(doc, "div", "orh-temp", damagePanel);
  const tempTube = makeEl(doc, "div", "orh-temp-tube", temp);
  const tempFill = makeEl(doc, "i", null, tempTube);
  const tempVal = makeEl(doc, "div", "orh-temp-val", temp);

  // --- right cluster: shift lights, dial, speed, boost, grip
  const cluster = makeEl(doc, "div", "orh-cluster", bottom);
  const readout = makeEl(doc, "div", "orh-readout orh-panel", cluster);
  const speedRow = makeEl(doc, "div", "orh-speed", readout);
  const odo = makeEl(doc, "div", "orh-odo", speedRow);
  const digits = [];
  for (let i = 0; i < 3; i += 1) {
    const cell = makeEl(doc, "div", "orh-digit", odo);
    const strip = makeEl(doc, "div", "orh-strip", cell);
    for (let n = 0; n <= 10; n += 1) makeEl(doc, "b", null, strip).textContent = String(n % 10);
    digits.unshift({ cell, strip });
  }
  const unitEl = makeEl(doc, "div", "orh-unit", speedRow);
  const meters = makeEl(doc, "div", "orh-meters", readout);
  const boostMeter = makeEl(doc, "div", "orh-meter", meters);
  makeEl(doc, "div", "orh-label", boostMeter).textContent = "BOOST";
  const boostBar = makeEl(doc, "div", "orh-bar orh-boost", boostMeter);
  const boostFill = makeEl(doc, "i", null, boostBar);
  const grip = makeEl(doc, "div", "orh-grip", meters);
  const gripSvg = makeSvg(doc, "svg", null, grip, { viewBox: "0 0 44 44", "aria-hidden": "true" });
  makeSvg(doc, "circle", "orh-grip-ring", gripSvg, { cx: "22", cy: "22", r: "18" });
  const GRIP_CIRC = 2 * Math.PI * 18;
  const gripArc = makeSvg(doc, "circle", "orh-grip-arc", gripSvg, {
    cx: "22", cy: "22", r: "18",
    "stroke-dasharray": fx(GRIP_CIRC), "stroke-dashoffset": fx(GRIP_CIRC),
  });
  const gripVal = makeSvg(doc, "text", "orh-grip-val", gripSvg, { x: "22", y: "24.5" });

  const dialWrap = makeEl(doc, "div", "orh-dialwrap", cluster);
  const shift = makeEl(doc, "div", "orh-shift", dialWrap);
  const leds = [];
  for (let i = 0; i < SHIFT_LIGHT_COUNT; i += 1) leds.push(makeEl(doc, "i", "orh-led", shift));
  const dial = makeEl(doc, "div", "orh-dial", dialWrap);
  const tacho = makeEl(doc, "canvas", "orh-tacho", dial);
  const gearEl = makeEl(doc, "div", "orh-gear", dial);

  // --- centre overlays
  const centre = makeEl(doc, "div", "orh-centre", el);
  const lights = makeEl(doc, "div", "orh-lights", centre);
  const lamps = [];
  for (let i = 0; i < 5; i += 1) lamps.push(makeEl(doc, "div", "orh-lamp", lights));
  const countEl = makeEl(doc, "div", "orh-count", centre);
  const finishEl = makeEl(doc, "div", "orh-finish orh-panel", centre);
  makeEl(doc, "div", "orh-finish-kicker", finishEl).textContent = "STAGE COMPLETE";
  const finishTime = makeEl(doc, "div", "orh-finish-time", finishEl);
  const finishDelta = makeEl(doc, "div", "orh-finish-delta", finishEl);
  const finishRows = makeEl(doc, "div", "orh-finish-rows", finishEl);
  const finishCells = [];
  for (let i = 0; i < 3; i += 1) {
    const cell = makeEl(doc, "div", null, finishRows);
    const label = makeEl(doc, "div", "orh-label", cell);
    const value = makeEl(doc, "b", null, cell);
    finishCells.push({ cell, label, value });
  }
  const toasts = makeEl(doc, "div", "orh-toasts", el);

  // ------------------------------------------------------------ state
  const state = {
    units: normaliseUnits(opts.units),
    scale: Number.isFinite(opts.scale) ? clamp(opts.scale, 0.6, 2.2) : 1,
    contrast: !!opts.highContrast,
    reduced: opts.reducedMotion === undefined ? prefersReducedMotion(opts) : !!opts.reducedMotion,
    telemetryOn: opts.telemetry === undefined ? true : !!opts.telemetry,
    lastNow: now(),
    popFlip: false,
    flashFlip: false,
    countFlip: false,
    deltaUntil: 0,
    lastSplitSeen: NaN,
    noteKey: "",
    nextKey: "",
    noteRef: null,
    nextRef: null,
    stageRef: null,
    ribbon: routeRibbonLayout(null, EMPTY),
    dialDirty: true,
    dialRpmLimit: 0,
    toastList: [],
    destroyed: false,
  };
  const needle = { angle: DIAL_START_DEG, vel: 0 };
  const smooth = { boost: 0, grip: 0, dist: 0, temp: 0 };
  const cache = Object.create(null);
  const noteA = normalisePacenote(null);
  const noteB = normalisePacenote(null);
  const shiftOut = { lit: 0, count: SHIFT_LIGHT_COUNT, band: "off", flash: false, frac: 0, green: 5, amber: 4 };
  const dmg = {
    values: new Float32Array(DAMAGE_SLOTS.length),
    worst: 0, worstSlot: "", puncture: false, overheating: false, terminal: false, rows: 0,
  };
  const traceBuf = new Float32Array(TRACE_SAMPLES * 3);
  let traceHead = 0;
  const ticks = [];

  const tachoCtx = context2d(tacho);
  const traceCtx = context2d(trace);
  const staticCanvas = doc.createElement ? doc.createElement("canvas") : null;
  const staticCtx = context2d(staticCanvas);
  let dialPx = 0;

  applyModes();
  setUnits(state.units);
  setStage(opts.stage || null);
  setPacenote(null, null);
  layoutCanvases();

  // ------------------------------------------------------------ per frame
  function update(frame) {
    if (state.destroyed) return;
    const f = frame || EMPTY;
    const t = now();
    let dt = Number.isFinite(f.dt) ? f.dt : (t - state.lastNow) / 1000;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.25) dt = 0.25;
    state.lastNow = t;

    const rpmLimit = Number.isFinite(f.rpmLimit) && f.rpmLimit > 0 ? f.rpmLimit : 8000;
    const rpm = Number.isFinite(f.rpm) ? Math.max(f.rpm, 0) : 0;

    if (rpmLimit !== state.dialRpmLimit) {
      state.dialRpmLimit = rpmLimit;
      state.dialDirty = true;
    }
    if (state.dialDirty) drawDialStatic(rpmLimit);

    stepNeedle(needle, needleAngle(rpm, rpmLimit), dt);
    shiftLightState(rpm, rpmLimit, EMPTY, shiftOut);
    drawDial(rpm, rpmLimit);

    for (let i = 0; i < leds.length; i += 1) {
      const on = i < shiftOut.lit;
      toggleClass(leds[i], cache, "led" + i, "on", on);
      const band = shiftLightBand(i, shiftOut);
      if (cache["ledb" + i] !== band) {
        if (cache["ledb" + i]) leds[i].classList.remove(cache["ledb" + i]);
        leds[i].classList.add(band);
        cache["ledb" + i] = band;
      }
    }
    toggleClass(shift, cache, "limiter", "limiter", shiftOut.flash && !state.reduced);

    const gear = f.gear;
    writeText(gearEl, cache, "gear", gearLabel(gear));
    toggleClass(gearEl, cache, "gearlim", "limiter", shiftOut.flash);

    // speed
    const shown = convertSpeed(f.speedKph, state.units);
    const speed = Number.isFinite(shown) ? Math.max(shown, 0) : 0;
    odometerOffsets(speed, 3, odoScratch);
    const whole = Math.floor(speed);
    for (let i = 0; i < digits.length; i += 1) {
      const off = odoScratch[i];
      // -9.0909% per digit: the strip is eleven cells so wheel 9 can roll into 0.
      writeStyle(digits[i].strip, "transform", cache, "odo" + i,
        "translate3d(0," + fx(-off * (100 / 11)) + "%,0)");
      const blank = i > 0 && whole < Math.pow(10, i);
      toggleClass(digits[i].cell, cache, "odob" + i, "blank", blank);
    }

    // boost + grip, both eased so a spike does not strobe
    const boost = saturate(Number.isFinite(f.turbo) ? f.turbo : 0);
    smooth.boost = damp(smooth.boost, boost, 12, dt);
    writeStyle(boostFill, "transform", cache, "boost", "scaleX(" + fx(q(smooth.boost, 0.004)) + ")");
    const gripUsed = Number.isFinite(f.gripUsed) ? clamp(f.gripUsed, 0, 1.25) : 0;
    smooth.grip = damp(smooth.grip, gripUsed, 14, dt);
    const gq = q(saturate(smooth.grip), 0.01);
    writeAttr(gripArc, "stroke-dashoffset", cache, "gripoff", fx(GRIP_CIRC * (1 - gq)));
    writeAttr(gripArc, "stroke", cache, "gripcol",
      smooth.grip > 0.98 ? PALETTE.bad : smooth.grip > 0.86 ? PALETTE.warn : PALETTE.good);
    writeText(gripVal, cache, "gripval", String(Math.round(saturate(smooth.grip) * 100)));

    // timing
    const timeText = formatTime(f.timeMs);
    writeText(timeEl, cache, "time", timeText);
    const deltaMs = f.splitDeltaMs;
    if (Number.isFinite(deltaMs)) {
      writeText(deltaEl, cache, "delta", formatDelta(deltaMs));
      writeStyle(deltaEl, "color", cache, "deltacol", deltaColour(deltaMs));
    } else if (cache.delta !== "--.--") {
      writeText(deltaEl, cache, "delta", "--.--");
      writeStyle(deltaEl, "color", cache, "deltacol", DELTA_COLOURS.none);
    }
    const splitSeen = Number.isFinite(f.lastSplitMs) ? f.lastSplitMs : NaN;
    if (splitSeen !== state.lastSplitSeen && Number.isFinite(splitSeen)) {
      state.lastSplitSeen = splitSeen;
      flashDelta();
    }
    toggleClass(deltaEl, cache, "deltalive", "live", t < state.deltaUntil);

    // route ribbon
    const total = Number.isFinite(f.stageLength) && f.stageLength > 0 ? f.stageLength : 0;
    const dist = Number.isFinite(f.distance) ? Math.max(f.distance, 0) : 0;
    const pct = Number.isFinite(f.positionPct) ? saturate(f.positionPct > 1 ? f.positionPct / 100 : f.positionPct)
      : total > 0 ? saturate(dist / total) : 0;
    if (!state.ribbon.empty) {
      const done = ribbonLengthAtFraction(state.ribbon, pct);
      writeAttr(ribbonDone, "stroke-dasharray", cache, "ribda", fx(state.ribbon.length));
      writeAttr(ribbonDone, "stroke-dashoffset", cache, "ribdo", fx(q(state.ribbon.length - done, 0.5)));
      ribbonPointAtFraction(state.ribbon, pct, ribbonPoint);
      writeStyle(carMark, "transform", cache, "carmark",
        "translate(" + fx(q(ribbonPoint.x, 0.25)) + "px," + fx(q(ribbonPoint.y, 0.25)) + "px)");
      for (let i = 0; i < splitMarks.length; i += 1) {
        const sp = cache["splitF" + i];
        if (sp === undefined) continue;
        toggleClass(splitMarks[i], cache, "splitDone" + i, "done", pct >= sp);
      }
    }
    writeText(distEl, cache, "dist", total > 0
      ? (dist / 1000).toFixed(2) + " / " + (total / 1000).toFixed(2) + " KM"
      : (dist / 1000).toFixed(2) + " KM");
    writeText(surfEl, cache, "surf", String(f.surfaceName || "").toUpperCase());

    // pacenotes: the frame may carry them, or the caller may push them explicitly
    if (f.pacenote !== undefined && f.pacenote !== state.noteRef) setPacenote(f.pacenote, f.nextPacenote);
    else if (f.nextPacenote !== undefined && f.nextPacenote !== state.nextRef) setPacenote(state.noteRef, f.nextPacenote);

    const gate = noteDistance(noteA, f, dist);
    const window0 = noteA.isTurn ? 220 : 160;
    const drain = gate === null ? 0 : saturate(1 - gate / window0);
    smooth.dist = damp(smooth.dist, drain, 18, dt);
    writeStyle(noteFill, "transform", cache, "notefill", "scaleX(" + fx(q(smooth.dist, 0.005)) + ")");
    if (gate === null) {
      writeText(noteDistVal, cache, "notedist", "");
      writeText(noteDistUnit, cache, "notedistu", "");
    } else {
      writeText(noteDistVal, cache, "notedist", String(Math.max(0, Math.round(gate / 10) * 10)));
      writeText(noteDistUnit, cache, "notedistu", "M");
    }

    // damage
    normaliseDamageRows(f.damage, dmg);
    for (let i = 0; i < partNodes.length; i += 1) {
      const slot = partNodes[i].slot;
      const v = slot >= 0 ? dmg.values[slot] : 0;
      const idx = damageTintIndex(v);
      if (cache["part" + i] !== idx) {
        cache["part" + i] = idx;
        partNodes[i].node.setAttribute("fill", DAMAGE_TINTS[idx]);
      }
    }
    const tempC = pickTemperature(f);
    const tempNorm = tempC === null ? 0 : saturate(invLerp(70, 128, tempC));
    smooth.temp = damp(smooth.temp, tempNorm, 6, dt);
    const tempShow = tempC !== null && (tempNorm > 0.42 || dmg.overheating);
    toggleClass(temp, cache, "tempon", "on", tempShow);
    if (tempShow) {
      writeStyle(tempFill, "transform", cache, "tempfill", "scaleY(" + fx(q(smooth.temp, 0.01)) + ")");
      writeText(tempVal, cache, "tempval", Math.round(tempC) + "°");
    }
    const warnText2 = dmg.terminal ? "TERMINAL FAULT"
      : dmg.puncture ? "PUNCTURE"
        : dmg.overheating || tempNorm > 0.86 ? "OVERHEATING"
          : dmg.worst > 0.6 ? String(dmg.worstSlot || "damage").toUpperCase() + " DAMAGE" : "";
    toggleClass(warn, cache, "warnon", "on", warnText2 !== "");
    toggleClass(warn, cache, "warnpulse", "pulse", warnText2 !== "" && !state.reduced && (dmg.terminal || dmg.puncture));
    if (warnText2 !== "") writeText(warnText, cache, "warntxt", warnText2);

    // telemetry trace
    if (state.telemetryOn) {
      traceBuf[traceHead * 3] = saturate(Number.isFinite(f.throttle) ? f.throttle : 0);
      traceBuf[traceHead * 3 + 1] = saturate(Number.isFinite(f.brake) ? f.brake : 0);
      traceBuf[traceHead * 3 + 2] = clamp(Number.isFinite(f.steer) ? f.steer : 0, -1, 1);
      traceHead = (traceHead + 1) % TRACE_SAMPLES;
      drawTrace();
    }

    // toasts expire on the frame clock so they cannot outlive a paused stage
    expireToasts(t);
  }

  function noteDistance(n, f, dist) {
    if (!n || n.kind === "none") return null;
    if (Number.isFinite(f.pacenoteDistance)) return Math.max(0, f.pacenoteDistance);
    if (n.distance > 0) return n.distance;
    if (n.s > 0 && Number.isFinite(dist)) return Math.max(0, n.s - dist);
    return null;
  }

  // ------------------------------------------------------------ pacenotes
  function setPacenote(next, following) {
    state.noteRef = next === undefined ? null : next;
    state.nextRef = following === undefined ? null : following;
    normalisePacenote(state.noteRef, noteA);
    normalisePacenote(state.nextRef, noteB);
    if (noteA.key !== state.noteKey) {
      state.noteKey = noteA.key;
      applyArrow(noteSpine, noteHead, noteA);
      writeText(noteSev, cache, "sev", noteA.severity > 0 ? String(Math.round(noteA.severity)) : glyphFor(noteA));
      writeText(noteDir, cache, "dir", noteA.kind === "none" ? ""
        : noteA.isTurn ? directionLabel(noteA.dir) : (noteA.label || noteA.kind).toUpperCase());
      for (let i = 0; i < chips.length; i += 1) {
        const txt = noteA.mods[i] || "";
        writeText(chips[i], cache, "chip" + i, txt);
        toggleClass(chips[i], cache, "chipon" + i, "on", txt !== "");
      }
      smooth.dist = 0;
      popNote();
    }
    if (noteB.key !== state.nextKey) {
      state.nextKey = noteB.key;
      applyArrow(queueSpine, queueHead, noteB);
      writeText(queueSev, cache, "qsev", noteB.severity > 0 ? String(Math.round(noteB.severity)) : "");
      writeText(queueTxt, cache, "qtxt", noteB.kind === "none" ? ""
        : noteB.isTurn ? directionLabel(noteB.dir) : (noteB.label || noteB.kind).toUpperCase());
    }
  }

  function applyArrow(spine, head, n) {
    if (n.kind === "none") {
      spine.setAttribute("d", "");
      head.setAttribute("d", "");
      return;
    }
    const sev = n.isTurn ? n.severity : 6;
    spine.setAttribute("d", arrowPathForSeverity(sev, n.dir));
    head.setAttribute("d", arrowHeadPath(sev, n.dir));
  }

  function glyphFor(n) {
    if (n.kind === "crest") return "⌒";
    if (n.kind === "jump") return "↑";
    if (n.kind === "finish") return "■";
    return "–";
  }

  // Alternating animation classes restart the keyframes without reading layout.
  function popNote() {
    state.popFlip = !state.popFlip;
    noteMain.classList.remove(state.popFlip ? "orh-pop-b" : "orh-pop-a");
    noteMain.classList.add(state.popFlip ? "orh-pop-a" : "orh-pop-b");
  }

  function flashDelta() {
    state.flashFlip = !state.flashFlip;
    deltaEl.classList.remove(state.flashFlip ? "orh-flash-b" : "orh-flash-a");
    deltaEl.classList.add(state.flashFlip ? "orh-flash-a" : "orh-flash-b");
    state.deltaUntil = now() + 3400;
  }

  // ------------------------------------------------------------ stage / ribbon
  function setStage(stage) {
    state.stageRef = stage || null;
    state.ribbon = routeRibbonLayout(stage, { width: RIB_W, height: RIB_H, pad: 9 });
    const d = state.ribbon.empty ? "M 12 " + (RIB_H / 2) + " L " + (RIB_W - 12) + " " + (RIB_H / 2) : state.ribbon.d;
    if (state.ribbon.empty) {
      state.ribbon.xs.length = 0; state.ribbon.ys.length = 0; state.ribbon.cum.length = 0;
      state.ribbon.xs.push(12, RIB_W - 12);
      state.ribbon.ys.push(RIB_H / 2, RIB_H / 2);
      state.ribbon.cum.push(0, RIB_W - 24);
      state.ribbon.length = RIB_W - 24;
      state.ribbon.d = d;
      state.ribbon.empty = false;
    }
    ribbonTrack.setAttribute("d", state.ribbon.d);
    ribbonDone.setAttribute("d", state.ribbon.d);
    cache.ribda = undefined; cache.ribdo = undefined; cache.carmark = undefined;

    const splits = stage && Array.isArray(stage.splits) ? stage.splits : [];
    const length = stage && Number.isFinite(stage.length) && stage.length > 0 ? stage.length : 0;
    for (let i = 0; i < splitMarks.length; i += 1) {
      const s = splits[i];
      const has = Number.isFinite(s) && length > 0;
      cache["splitOn" + i] = undefined;
      cache["splitDone" + i] = undefined;
      toggleClass(splitMarks[i], cache, "splitOn" + i, "on", has);
      if (!has) { cache["splitF" + i] = undefined; continue; }
      const frac = saturate(s / length);
      cache["splitF" + i] = frac;
      ribbonPointAtFraction(state.ribbon, frac, ribbonPoint);
      splitMarks[i].setAttribute("cx", fx(ribbonPoint.x));
      splitMarks[i].setAttribute("cy", fx(ribbonPoint.y));
    }
  }

  // ------------------------------------------------------------ dial drawing
  function layoutCanvases() {
    const dpr = clamp(pixelRatio(), 1, 2.5);
    const css = 218 * state.scale;
    dialPx = Math.max(48, Math.round(css * dpr));
    sizeCanvas(tacho, dialPx);
    sizeCanvas(staticCanvas, dialPx);
    sizeCanvas(trace, 0, Math.round(176 * dpr), Math.round(50 * dpr));
    state.dialDirty = true;
  }

  function sizeCanvas(node, square, w, h) {
    if (!node) return;
    const width = square || w;
    const height = square || h;
    if (node.width !== width) node.width = width;
    if (node.height !== height) node.height = height;
  }

  function pal() {
    return state.contrast ? PALETTE_HC : PALETTE;
  }

  // Ticks and numerals only change when the limiter or the scale does, so they live on
  // their own surface and the live layer is one blit plus an arc plus a needle.
  function drawDialStatic(rpmLimit) {
    state.dialDirty = false;
    if (!staticCtx) return;
    const p = pal();
    const size = dialPx;
    const r = size * 0.5;
    const ctx = staticCtx;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(r, r);

    const outer = r * 0.94;
    const trackR = r * 0.80;
    ctx.lineWidth = r * 0.085;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    ctx.arc(0, 0, trackR, rad(DIAL_START_DEG), rad(DIAL_END_DEG));
    ctx.stroke();

    const redStart = needleAngle(rpmLimit, rpmLimit);
    ctx.strokeStyle = p.redline;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, trackR, rad(redStart), rad(DIAL_END_DEG));
    ctx.stroke();
    ctx.globalAlpha = 1;

    gaugeTicks(rpmLimit, EMPTY, ticks);
    ctx.lineCap = "butt";
    for (let i = 0; i < ticks.length; i += 1) {
      const tk = ticks[i];
      const a = rad(tk.angle);
      const len = tk.major ? r * 0.13 : r * 0.07;
      const r0 = outer - r * 0.02;
      ctx.beginPath();
      ctx.lineWidth = tk.major ? Math.max(2, r * 0.022) : Math.max(1, r * 0.012);
      ctx.strokeStyle = tk.redline ? p.redline : tk.major ? p.text : p.dim;
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * (r0 - len), Math.sin(a) * (r0 - len));
      ctx.stroke();
      if (tk.major) {
        const nr = r0 - len - r * 0.11;
        ctx.fillStyle = tk.redline ? p.redline : p.text;
        ctx.font = "700 " + Math.round(r * 0.155) + "px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tk.label, Math.cos(a) * nr, Math.sin(a) * nr);
      }
    }

    ctx.fillStyle = p.dim;
    ctx.font = "800 " + Math.round(r * 0.09) + "px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RPM x1000", 0, r * 0.42);
    ctx.restore();
  }

  function drawDial(rpm, rpmLimit) {
    if (!tachoCtx) return;
    const p = pal();
    const size = dialPx;
    const r = size * 0.5;
    const ctx = tachoCtx;
    ctx.clearRect(0, 0, size, size);
    if (staticCanvas && ctx.drawImage) ctx.drawImage(staticCanvas, 0, 0);
    ctx.save();
    ctx.translate(r, r);

    // sweep to the *needle* angle, not the raw rpm, so arc and needle never disagree
    const a = clamp(needle.angle, DIAL_START_DEG, DIAL_END_DEG);
    const over = rpm >= rpmLimit;
    ctx.lineWidth = r * 0.085;
    ctx.lineCap = "round";
    ctx.strokeStyle = over ? p.redline : p.sweep;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.80, rad(DIAL_START_DEG), rad(a));
    ctx.stroke();
    ctx.globalAlpha = 1;

    const ar = rad(a);
    const cos = Math.cos(ar);
    const sin = Math.sin(ar);
    const tipR = r * 0.72;
    const tailR = r * 0.16;
    const halfW = r * 0.028;
    ctx.beginPath();
    ctx.moveTo(cos * tipR, sin * tipR);
    ctx.lineTo(-sin * halfW - cos * tailR, cos * halfW - sin * tailR);
    ctx.lineTo(sin * halfW - cos * tailR, -cos * halfW - sin * tailR);
    ctx.closePath();
    ctx.fillStyle = p.needle;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.075, 0, Math.PI * 2);
    ctx.fillStyle = p.face;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.012);
    ctx.strokeStyle = p.needle;
    ctx.stroke();
    ctx.restore();
  }

  function drawTrace() {
    if (!traceCtx || !trace.width) return;
    const p = pal();
    const w = trace.width;
    const h = trace.height;
    const ctx = traceCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = p.hair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
    const cols = [p.good, p.bad, p.ice];
    for (let c = 0; c < 3; c += 1) {
      ctx.beginPath();
      ctx.strokeStyle = cols[c];
      ctx.lineWidth = 1.6;
      for (let i = 0; i < TRACE_SAMPLES; i += 1) {
        const idx = (traceHead + i) % TRACE_SAMPLES;
        const v = traceBuf[idx * 3 + c];
        const x = (i / (TRACE_SAMPLES - 1)) * w;
        const y = c === 2 ? h * 0.5 - v * h * 0.45 : h - saturate(v) * h * 0.94 - h * 0.03;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ overlays
  function countdown(n) {
    const v = Number.isFinite(n) ? Math.round(n) : null;
    if (v === null || v < 0) {
      lights.classList.remove("on");
      countEl.classList.remove("orh-pop-a", "orh-pop-b");
      countEl.style.opacity = "0";
      cache.count = undefined;
      return;
    }
    lights.classList.add("on");
    for (let i = 0; i < lamps.length; i += 1) {
      const lit = v > 0 && i < clamp(v, 0, lamps.length);
      toggleClass(lamps[i], cache, "lamp" + i, "lit", lit);
      toggleClass(lamps[i], cache, "lampgo" + i, "go", v === 0);
    }
    countEl.style.opacity = "";
    writeText(countEl, cache, "count", v === 0 ? "GO" : String(v));
    state.countFlip = !state.countFlip;
    countEl.classList.remove(state.countFlip ? "orh-pop-b" : "orh-pop-a");
    countEl.classList.add(state.countFlip ? "orh-pop-a" : "orh-pop-b");
  }

  function finish(result) {
    if (!result) {
      finishEl.classList.remove("on");
      return;
    }
    const timeMs = firstNumber(result, "timeMs", "time", "totalMs", "elapsedMs");
    writeText(finishTime, cache, "ftime", formatTime(timeMs));
    const d = firstNumber(result, "deltaMs", "delta", "diffMs");
    writeText(finishDelta, cache, "fdelta", Number.isFinite(d) ? formatDelta(d) : "");
    finishDelta.style.color = deltaColour(d);
    const splits = Array.isArray(result.splits) ? result.splits : [];
    const labels = ["SPLIT 1", "SPLIT 2", "POSITION"];
    for (let i = 0; i < finishCells.length; i += 1) {
      let value = "";
      if (i < 2) value = Number.isFinite(splits[i]) ? formatTime(splits[i], { decimals: 2 }) : "--:--.--";
      else {
        const posn = firstNumber(result, "position", "rank", "place");
        value = Number.isFinite(posn) ? String(Math.round(posn)) : (result.cleanRun ? "CLEAN" : "–");
      }
      writeText(finishCells[i].label, cache, "flab" + i, labels[i]);
      writeText(finishCells[i].value, cache, "fval" + i, value);
    }
    finishEl.classList.add("on");
  }

  function toast(text, tone) {
    if (state.destroyed) return null;
    const node = makeEl(doc, "div", "orh-toast" + (tone ? " " + tone : ""), toasts);
    node.textContent = String(text === undefined || text === null ? "" : text);
    const entry = { node, until: now() + 2600, shown: false };
    state.toastList.push(entry);
    // One class flip on the next macrotask so the entry transition has a start state.
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (node.classList) node.classList.add("on");
      entry.shown = true;
    }, 16);
    while (state.toastList.length > 4) removeToast(state.toastList[0]);
    return node;
  }

  function expireToasts(t) {
    for (let i = state.toastList.length - 1; i >= 0; i -= 1) {
      if (t >= state.toastList[i].until) removeToast(state.toastList[i]);
    }
  }

  function removeToast(entry) {
    const i = state.toastList.indexOf(entry);
    if (i >= 0) state.toastList.splice(i, 1);
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.node && entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
    else if (entry.node && entry.node.remove) entry.node.remove();
  }

  // ------------------------------------------------------------ settings
  function setUnits(u) {
    state.units = normaliseUnits(u);
    writeText(unitEl, cache, "unit", unitLabel(state.units));
    for (let i = 0; i < digits.length; i += 1) cache["odo" + i] = undefined;
    return state.units;
  }

  function setScale(s) {
    state.scale = Number.isFinite(s) ? clamp(s, 0.6, 2.2) : 1;
    el.style.setProperty("--orh-scale", String(state.scale));
    layoutCanvases();
    return state.scale;
  }

  function setContrast(on) {
    state.contrast = !!on;
    applyModes();
    state.dialDirty = true;
    return state.contrast;
  }

  function setReducedMotion(on) {
    state.reduced = !!on;
    applyModes();
    return state.reduced;
  }

  function setTelemetry(on) {
    state.telemetryOn = !!on;
    if (state.telemetryOn) telemetry.classList.add("on");
    else telemetry.classList.remove("on");
    return state.telemetryOn;
  }

  function applyModes() {
    if (state.contrast) el.classList.add("hc"); else el.classList.remove("hc");
    if (state.reduced) el.classList.add("rm"); else el.classList.remove("rm");
    el.style.setProperty("--orh-scale", String(state.scale));
    setTelemetry(state.telemetryOn);
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    while (state.toastList.length) removeToast(state.toastList[0]);
    detach(style);
    detach(el);
  }

  function detach(node) {
    if (!node) return;
    if (node.parentNode && node.parentNode.removeChild) node.parentNode.removeChild(node);
    else if (node.remove) node.remove();
  }

  return {
    root: el,
    update,
    setPacenote,
    setStage,
    countdown,
    finish,
    toast,
    // `flash` is the name CONTRACTS.md pins; it is a toast with a tone.
    flash: (text, tone) => toast(text, tone || "good"),
    setUnits,
    setScale,
    setContrast,
    setReducedMotion,
    setTelemetry,
    destroy,
    get units() { return state.units; },
    get scale() { return state.scale; },
  };
}

// ---------------------------------------------------------------- small helpers

function legendItem(doc, parent, colour, text) {
  const span = makeEl(doc, "span", null, parent);
  const swatch = makeEl(doc, "i", null, span);
  swatch.style.background = colour;
  makeEl(doc, "b", null, span).textContent = text;
  return span;
}

function rad(deg) {
  return (deg - 90) * Math.PI / 180;
}

function gearLabel(gear) {
  if (!Number.isFinite(gear)) return "N";
  const g = Math.round(gear);
  if (g < 0) return "R";
  if (g === 0) return "N";
  return String(g);
}

function pickTemperature(f) {
  const t = f.telemetry;
  if (t && typeof t === "object") {
    const v = firstNumber(t, "waterTempC", "waterTemp", "engineTempC", "engineTemp", "coolantC", "tempC");
    if (Number.isFinite(v)) return v;
  }
  const v2 = firstNumber(f, "waterTempC", "engineTempC", "tempC");
  return Number.isFinite(v2) ? v2 : null;
}

function context2d(canvas) {
  if (!canvas || typeof canvas.getContext !== "function") return null;
  try {
    return canvas.getContext("2d") || null;
  } catch (err) {
    return null;
  }
}

function pixelRatio() {
  if (typeof globalThis !== "undefined" && Number.isFinite(globalThis.devicePixelRatio)) {
    return globalThis.devicePixelRatio;
  }
  return 1;
}

function prefersReducedMotion(opts) {
  const w = opts.window || (typeof globalThis !== "undefined" ? globalThis : null);
  if (!w || typeof w.matchMedia !== "function") return false;
  try {
    return !!w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (err) {
    return false;
  }
}

function defaultNow() {
  const g = typeof globalThis !== "undefined" ? globalThis : null;
  if (g && g.performance && typeof g.performance.now === "function") {
    return () => g.performance.now();
  }
  return () => Date.now();
}
