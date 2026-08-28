// The shell around the game: title, championship, stage/car select, service park,
// settings, pause, results. Every layout and content decision in here is a pure
// function over plain data — createUi() only walks the model and makes DOM. That
// split is deliberate: it is the only way to test menu order, unit formatting and
// the reserved top-left rectangle without a browser.
//
// ui.js knows nothing about physics.js, stage.js or career.js. It renders what it
// is handed.

import { clamp, saturate, lerp, invLerp, sign } from "./mathx.js";
import { SURFACE, surfaceProps } from "./surfaces.js";

export const BRAND = Object.freeze({
  name: "OpusRally",
  tagline: "Twelve stages. One clock.",
  // A restrained palette: two neutrals deep enough to sit under a 3D scene, one
  // hot accent, and three status hues that never appear as decoration.
  colour: Object.freeze({
    void: "#07080a",
    graphite: "#0f1216",
    panel: "#161a20",
    panelHi: "#1d222a",
    line: "#272e38",
    ink: "#eef1f5",
    mute: "#94a1b2",
    faint: "#5c6775",
    flare: "#ff5a14",
    flareDim: "#a83607",
    sodium: "#ffc247",
    mint: "#2fe0a8",
    crimson: "#ff3f5c",
  }),
  // 1.25 minor third, rounded to whole pixels so nothing lands on a half-pixel.
  type: Object.freeze({
    micro: 11,
    small: 13,
    body: 16,
    lead: 20,
    h3: 25,
    h2: 31,
    h1: 39,
    display: 49,
    hero: 61,
  }),
  space: Object.freeze({ hair: 2, tight: 4, xs: 8, sm: 12, md: 20, lg: 32, xl: 52, xxl: 84 }),
  // The signature motif: everything that marks progress or selection is a
  // parallelogram cut at this angle — tabs, rules, bars, the wordmark slash.
  skewDeg: -18,
  fontUi: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontNum: "ui-monospace, SFMono-Regular, 'Cascadia Mono', 'DejaVu Sans Mono', Consolas, monospace",
});

const SVG_NS = "http://www.w3.org/2000/svg";

export function round(v, dp = 2) {
  if (!Number.isFinite(v)) return 0;
  const m = 10 ** dp;
  return Math.round(v * m) / m;
}

export function formatTime(ms, opts = {}) {
  const v = Number.isFinite(ms) ? ms : NaN;
  if (!Number.isFinite(v)) return opts.blank ?? "--:--.-";
  const neg = v < 0;
  const t = Math.abs(v);
  const dp = opts.dp ?? 1;
  const totalSec = t / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  const secText = sec.toFixed(dp).padStart(dp > 0 ? 3 + dp : 2, "0");
  const body = opts.forceMinutes === false && min === 0
    ? secText
    : `${min}:${secText}`;
  return (neg ? "-" : "") + body;
}

export function formatDelta(ms, opts = {}) {
  if (!Number.isFinite(ms)) return opts.blank ?? "—";
  const dp = opts.dp ?? 1;
  const s = ms / 1000;
  const sign_ = s > 0 ? "+" : s < 0 ? "-" : "+";
  return sign_ + Math.abs(s).toFixed(dp);
}

export function deltaTone(ms) {
  if (!Number.isFinite(ms) || ms === 0) return "level";
  return ms < 0 ? "gain" : "loss";
}

// Linear albedo out of surfaces.js is far too dark to read as a map colour, so
// the preview lifts it toward white after the sRGB transfer.
export function surfaceColour(id, lift = 0.18) {
  const props = surfaceProps(id);
  const rgb = props.albedo;
  let out = "#";
  for (let i = 0; i < 3; i += 1) {
    const enc = Math.pow(saturate(rgb[i]), 1 / 2.2);
    const v = Math.round(255 * saturate(lerp(enc, 1, saturate(lift))));
    out += v.toString(16).padStart(2, "0");
  }
  return out;
}

export function surfaceLabel(id) {
  return surfaceProps(id).name;
}

export function surfaceMixText(mix) {
  if (!mix || !mix.length) return "Mixed";
  const seen = [];
  for (let i = 0; i < mix.length; i += 1) {
    const n = surfaceLabel(mix[i]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen.join(" / ");
}

export const UNIT_SYSTEMS = Object.freeze(["metric", "imperial"]);

const CONVERT = {
  speed: { metric: [1, "km/h"], imperial: [0.621371, "mph"] },
  distance: { metric: [1, "km"], imperial: [0.621371, "mi"] },
  mass: { metric: [1, "kg"], imperial: [2.20462, "lb"] },
  power: { metric: [1, "kW"], imperial: [1.34102, "hp"] },
  torque: { metric: [1, "N·m"], imperial: [0.737562, "lb·ft"] },
  temperature: { metric: [1, "°C"], imperial: [1, "°F"] },
};

// value arrives in SI-ish display units (kW, kg, N·m, km/h, km) and comes back
// converted with the unit string that belongs to it.
export function convertUnit(kind, value, units = "metric") {
  const table = CONVERT[kind];
  if (!table) return { value, unit: "" };
  const sys = table[units] ? units : "metric";
  if (kind === "temperature" && sys === "imperial") {
    return { value: value * 1.8 + 32, unit: "°F" };
  }
  return { value: value * table[sys][0], unit: table[sys][1] };
}

export function formatUnit(kind, value, units = "metric", dp = 0) {
  if (!Number.isFinite(value)) return "—";
  const c = convertUnit(kind, value, units);
  return `${c.value.toFixed(dp)} ${c.unit}`;
}

// Wordmark. The glyphs are stroked stencil forms on a 100x140 unit grid with
// 45-degree corner cuts and a bridge gap in every closed counter — drawn rather
// than typeset so the mark owes nothing to any font we would have to license.
const GLYPH_BOX = 100;
const GLYPH_CAP = 140;
const GLYPH_STROKE = 24;
const GLYPH_TRACK = 34;

const GLYPHS = Object.freeze({
  O: [
    [[56, 0], [74, 0], [100, 26], [100, 114], [74, 140], [56, 140]],
    [[44, 140], [26, 140], [0, 114], [0, 26], [26, 0], [44, 0]],
  ],
  P: [
    [[12, 0], [12, 140]],
    [[26, 12], [66, 12], [90, 36], [90, 52], [66, 76], [26, 76]],
  ],
  U: [
    [[12, 0], [12, 106], [38, 140], [44, 140]],
    [[56, 140], [62, 140], [88, 106], [88, 0]],
  ],
  S: [
    [[92, 26], [72, 6], [30, 6], [8, 28], [8, 44], [30, 66], [46, 66]],
    [[56, 66], [70, 66], [92, 88], [92, 110], [70, 134], [28, 134], [8, 114]],
  ],
  R: [
    [[12, 0], [12, 140]],
    [[26, 12], [66, 12], [90, 36], [90, 52], [66, 76], [26, 76]],
    [[64, 86], [94, 140]],
  ],
  A: [
    [[6, 140], [44, 4], [56, 4], [94, 140]],
    [[34, 96], [66, 96]],
  ],
  L: [
    [[12, 0], [12, 104]],
    [[12, 116], [12, 140], [88, 140]],
  ],
  Y: [
    [[6, 0], [50, 70], [94, 0]],
    [[50, 82], [50, 140]],
  ],
  E: [
    [[12, 0], [12, 140]],
    [[26, 6], [88, 6]],
    [[26, 64], [72, 64]],
    [[26, 134], [88, 134]],
  ],
  N: [
    [[12, 140], [12, 0]],
    [[16, 14], [84, 126]],
    [[88, 140], [88, 0]],
  ],
  T: [
    [[6, 6], [94, 6]],
    [[50, 18], [50, 140]],
  ],
  C: [
    [[92, 26], [72, 6], [30, 6], [8, 28], [8, 112], [30, 134], [72, 134], [92, 114]],
  ],
  G: [
    [[92, 26], [72, 6], [30, 6], [8, 28], [8, 112], [30, 134], [72, 134], [92, 114], [92, 76], [62, 76]],
  ],
});

function pathFromPoints(points, sx, sy, ox, oy) {
  let d = "";
  for (let i = 0; i < points.length; i += 1) {
    const x = round(ox + points[i][0] * sx, 2);
    const y = round(oy + points[i][1] * sy, 2);
    d += (i === 0 ? "M" : "L") + x + " " + y + (i === points.length - 1 ? "" : " ");
  }
  return d;
}

function layoutWord(text, scale, ox, oy, role, strokes) {
  const advance = (GLYPH_BOX + GLYPH_TRACK) * scale;
  let x = ox;
  let missing = 0;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (!g) { missing += 1; x += advance; continue; }
    for (const sub of g) {
      strokes.push({ d: pathFromPoints(sub, scale, scale, x, oy), width: round(GLYPH_STROKE * scale, 2), role });
    }
    x += advance;
  }
  return { width: text.length > 0 ? advance * text.length - GLYPH_TRACK * scale : 0, missing };
}

// Pure geometry for the mark; wordmarkSvgString() and the DOM builder both read
// this, so a change to the identity is a change in exactly one place.
export function wordmarkSpec(opts = {}) {
  const main = String(opts.text ?? "OPUS").toUpperCase();
  const sub = String(opts.sub ?? "RALLY").toUpperCase();
  const subScale = opts.subScale ?? 0.46;
  const pad = 14;
  const gap = 26;
  const strokes = [];
  const shapes = [];
  const mainRun = layoutWord(main, 1, pad, pad, "primary", strokes);
  const subY = pad + GLYPH_CAP + gap;
  const subRun = layoutWord(sub, subScale, pad + 4, subY, "sub", strokes);
  const subH = GLYPH_CAP * subScale;

  // The chicane: a skewed bar that closes the lockup and repeats as the tab and
  // progress-bar motif throughout the UI.
  const slashX = pad + 4 + subRun.width + 22;
  const slashW = 30;
  const skew = Math.tan((-BRAND.skewDeg * Math.PI) / 180) * subH;
  shapes.push({
    kind: "polygon",
    role: "motif",
    points: [
      [round(slashX + skew, 2), round(subY, 2)],
      [round(slashX + skew + slashW, 2), round(subY, 2)],
      [round(slashX + slashW, 2), round(subY + subH, 2)],
      [round(slashX, 2), round(subY + subH, 2)],
    ],
  });

  const width = round(Math.max(pad + mainRun.width, slashX + skew + slashW) + pad, 2);
  const height = round(subY + subH + pad, 2);
  return Object.freeze({
    text: main,
    sub,
    viewBox: [0, 0, width, height],
    width,
    height,
    strokes,
    shapes,
    missing: mainRun.missing + subRun.missing,
  });
}

export function wordmarkSvgString(spec = wordmarkSpec(), opts = {}) {
  const vb = spec.viewBox.join(" ");
  const title = opts.title ?? `${spec.text} ${spec.sub}`;
  let out = `<svg xmlns="${SVG_NS}" viewBox="${vb}" role="img" aria-label="${title}" class="or-wordmark-svg">`;
  for (const s of spec.shapes) {
    out += `<polygon points="${s.points.map((p) => p.join(",")).join(" ")}" class="or-mark-${s.role}"/>`;
  }
  for (const s of spec.strokes) {
    out += `<path d="${s.d}" fill="none" stroke-width="${s.width}" stroke-linecap="butt"`
      + ` stroke-linejoin="miter" class="or-mark-${s.role}"/>`;
  }
  return out + "</svg>";
}

// Layout model. The site-wide back pill owns the top-left 109x41 CSS pixels and
// beats every z-index, so anything interactive under it is not merely hidden —
// it is untappable. Regions are declared here, the stylesheet mirrors them, and
// the tests assert against these rects rather than against real geometry.
export const RESERVED_RECT = Object.freeze({ x: 0, y: 0, w: 109, h: 41 });
export const SAFE_INSET = 120;
export const TOPBAR_H = 64;

export const REGIONS = Object.freeze(["brand", "topbarEnd", "nav", "main", "aside", "footer", "dialog", "toast"]);

export function regionRect(name, viewport = { w: 390, h: 844 }) {
  const w = Math.max(320, viewport.w ?? 390);
  const h = Math.max(480, viewport.h ?? 844);
  const gut = 16;
  switch (name) {
    case "brand": return { x: SAFE_INSET, y: 10, w: Math.max(0, w - SAFE_INSET - gut), h: 44 };
    case "topbarEnd": return { x: Math.max(SAFE_INSET, w - 176), y: 12, w: 160, h: 40 };
    case "nav": return { x: gut, y: TOPBAR_H + 8, w: w - gut * 2, h: 44 };
    case "main": return { x: gut, y: TOPBAR_H + 60, w: w - gut * 2, h: Math.max(120, h - TOPBAR_H - 60 - 96) };
    case "aside": return { x: gut, y: TOPBAR_H + 60, w: w - gut * 2, h: Math.max(120, h - TOPBAR_H - 60 - 96) };
    case "footer": return { x: gut, y: h - 88, w: w - gut * 2, h: 72 };
    case "dialog": return { x: gut, y: TOPBAR_H + 32, w: w - gut * 2, h: Math.max(160, h - TOPBAR_H - 128) };
    case "toast": return { x: gut, y: h - 168, w: w - gut * 2, h: 64 };
    default: return regionRect("main", viewport);
  }
}

export function rectsIntersect(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function clearsReserved(rect) {
  return !rectsIntersect(rect, RESERVED_RECT);
}

export const INTERACTIVE_KINDS = Object.freeze([
  "button", "tab", "toggle", "range", "enum", "key", "swatch", "number", "link", "event",
]);

export function isInteractive(item) {
  return !!item && INTERACTIVE_KINDS.includes(item.kind);
}

// Flattens a screen model into placed rects. Items inherit their section's
// region; the rect is the region's, because the reserved-rectangle question is
// about which band of the page a control lives in, not about its exact box.
export function layoutModel(model, viewport = { w: 390, h: 844 }) {
  const out = [];
  for (const section of model.sections ?? []) {
    const region = section.region ?? "main";
    const rect = regionRect(region, viewport);
    for (const item of section.items ?? []) {
      out.push({
        id: item.id,
        sectionId: section.id,
        region,
        rect,
        interactive: isInteractive(item) && !item.disabled,
        kind: item.kind,
      });
    }
  }
  return out;
}

export function focusOrder(model) {
  const out = [];
  for (const section of model.sections ?? []) {
    for (const item of section.items ?? []) {
      if (isInteractive(item) && !item.disabled && item.focusable !== false) out.push(item.id);
    }
  }
  return out;
}

// Cheap self-check the tests lean on: duplicate ids and unknown regions are the
// two mistakes that silently break focus order and the safe-area guarantee.
export function validateModel(model) {
  const problems = [];
  const seen = new Set();
  if (!model || typeof model.screen !== "string") problems.push("missing screen id");
  for (const section of model?.sections ?? []) {
    if (section.region && !REGIONS.includes(section.region)) {
      problems.push(`section ${section.id}: unknown region ${section.region}`);
    }
    if (seen.has(section.id)) problems.push(`duplicate id ${section.id}`);
    seen.add(section.id);
    for (const item of section.items ?? []) {
      if (!item.id) problems.push(`section ${section.id}: item without id`);
      else if (seen.has(item.id)) problems.push(`duplicate id ${item.id}`);
      seen.add(item.id);
      if (item.kind === "enum" && !Array.isArray(item.options)) {
        problems.push(`item ${item.id}: enum without options`);
      }
    }
  }
  return problems;
}

const enumField = (key, label, options, def, help) => ({ key, label, kind: "enum", options, default: def, help });
const rangeField = (key, label, min, max, step, def, help, format) => ({ key, label, kind: "range", min, max, step, default: def, help, format });
const toggleField = (key, label, def, help) => ({ key, label, kind: "toggle", default: def, help });

// One line per assist explaining what it actually does to the car — a player who
// cannot tell what an assist changes cannot decide whether to turn it off.
export const SETTINGS_SCHEMA = Object.freeze([
  {
    id: "camera", label: "Camera", fields: Object.freeze([
      enumField("cameraMode", "View", ["Chase Wide", "Chase", "Bonnet", "Bumper", "Cockpit", "Helmet"], "Chase",
        "Where the camera sits. Bumper reads the road best; helmet moves with your head."),
      rangeField("fov", "Field of view", 60, 110, 1, 78, "Wider sees more of the corner and exaggerates speed.", "deg"),
      rangeField("cameraShake", "Camera shake", 0, 1, 0.05, 0.55, "How much surface roughness moves the camera.", "pct"),
      rangeField("lookToApex", "Look to apex", 0, 1, 0.05, 0.6, "Turns the camera into the corner ahead of the car.", "pct"),
      rangeField("horizonLock", "Horizon lock", 0, 1, 0.05, 0.35, "Holds the horizon level as the car rolls and pitches.", "pct"),
      toggleField("speedFov", "Speed FOV", true, "Widens the view slightly with speed."),
    ]),
  },
  {
    id: "assists", label: "Assists", fields: Object.freeze([
      toggleField("abs", "ABS", false, "Releases the brakes just short of lock-up so the front wheels keep steering."),
      toggleField("tractionControl", "Traction control", false, "Trims throttle when the driven wheels spin faster than the car is moving."),
      toggleField("stability", "Stability control", false, "Adds a small corrective yaw moment when the car rotates faster than you asked for."),
      toggleField("autoClutch", "Auto clutch", true, "Works the clutch for you on every shift and on launch."),
      toggleField("autoShift", "Auto gears", false, "Changes gear for you near the limiter and under heavy braking."),
      rangeField("steerAssist", "Steering assist", 0, 1, 0.05, 0.2, "Slows the steering rack as speed rises so a flick cannot spin you.", "pct"),
      rangeField("counterAssist", "Counter-steer help", 0, 1, 0.05, 0, "Feeds in some opposite lock automatically once the rear steps out.", "pct"),
      toggleField("brakeMarkers", "Braking markers", true, "Shows a marker board where the pacenote says to brake."),
    ]),
  },
  {
    id: "difficulty", label: "Difficulty", fields: Object.freeze([
      enumField("aiLevel", "Rival pace", ["Club", "National", "Continental", "Works", "Legend"], "National",
        "How quick the field is. Legend leaves no margin anywhere."),
      enumField("damageModel", "Damage", ["Off", "Cosmetic", "Reduced", "Full"], "Reduced",
        "How hard an impact hurts. Full can end your rally on stage one."),
      rangeField("rewinds", "Rewinds per stage", 0, 5, 1, 2, "Rewinds cost time on the results sheet.", "int"),
      toggleField("timePenalties", "Time penalties", true, "Cut a corner or clip a gate and the clock takes it back."),
      toggleField("mechanicalFailure", "Mechanical failures", true, "Untended damage can end a stage rather than just slow it."),
    ]),
  },
  {
    id: "pacenotes", label: "Pacenotes", fields: Object.freeze([
      enumField("noteStyle", "Note style", ["Numeric 1-6", "Numeric 6-1", "Descriptive", "Terse"], "Numeric 1-6",
        "Numeric 1-6 counts up with severity; descriptive uses words like square and flat."),
      rangeField("noteLead", "Delivery timing", -1.5, 1.5, 0.1, 0, "Negative calls earlier, positive calls later.", "sec"),
      enumField("noteVoice", "Co-driver", ["Marek", "Ilva", "Rune", "Solene"], "Ilva", "Four invented voices, all synthesised."),
      rangeField("noteVolume", "Co-driver level", 0, 1, 0.05, 0.9, "Balance against the engine.", "pct"),
      toggleField("linkedCalls", "Linked calls", true, "Runs two close corners into one call, the way a real note book does."),
      toggleField("distanceCalls", "Distance calls", true, "Speaks the gap in metres between corners."),
    ]),
  },
  {
    id: "units", label: "Units", fields: Object.freeze([
      enumField("units", "Measurements", ["metric", "imperial"], "metric", "Speed, distance, mass and power throughout."),
      enumField("clock", "Time format", ["Minutes", "Seconds"], "Minutes", "Stage times as 4:12.3 or as 252.3."),
      toggleField("deltaBar", "Delta bar", true, "Live gap to your personal best across the stage."),
    ]),
  },
  {
    id: "audio", label: "Audio", fields: Object.freeze([
      rangeField("volMaster", "Master", 0, 1, 0.05, 0.8, "Everything, after the buses below.", "pct"),
      rangeField("volEngine", "Engine", 0, 1, 0.05, 0.85, "Intake, exhaust and the turbo.", "pct"),
      rangeField("volTransmission", "Transmission", 0, 1, 0.05, 0.6, "Gear whine and the diff.", "pct"),
      rangeField("volTyres", "Tyres", 0, 1, 0.05, 0.7, "Slip, scrub and stones in the arch.", "pct"),
      rangeField("volSurface", "Surface", 0, 1, 0.05, 0.7, "The road under the car.", "pct"),
      rangeField("volImpacts", "Impacts", 0, 1, 0.05, 0.9, "Hits, scrapes and landings.", "pct"),
      rangeField("volCodriver", "Co-driver", 0, 1, 0.05, 1, "Pacenote delivery bus.", "pct"),
      rangeField("volUi", "Interface", 0, 1, 0.05, 0.5, "Menu ticks and confirmations.", "pct"),
    ]),
  },
  {
    id: "graphics", label: "Graphics", fields: Object.freeze([
      enumField("quality", "Preset", ["Low", "Medium", "High", "Ultra"], "High", "Sets everything below in one move."),
      rangeField("renderScale", "Render scale", 0.5, 1, 0.05, 1, "Draws below display resolution and upscales.", "pct"),
      enumField("shadows", "Shadows", ["Off", "Low", "High"], "High", "Cascade count and shadow map size."),
      rangeField("particles", "Particles", 0, 1, 0.05, 0.8, "Dust, spray and stone budget.", "pct"),
      rangeField("motionBlur", "Motion blur", 0, 1, 0.05, 0.3, "Per-object blur at speed.", "pct"),
      toggleField("postFx", "Post effects", true, "Bloom, tonemapping and the dirty-screen pass."),
      enumField("targetFps", "Frame target", ["30", "60", "120", "Uncapped"], "60", "Caps the render loop."),
      toggleField("reducedMotion", "Reduced motion", false, "Cuts menu animation for anyone who finds it uncomfortable."),
    ]),
  },
  {
    id: "controls", label: "Controls", fields: Object.freeze([
      rangeField("padDeadzone", "Stick deadzone", 0, 0.4, 0.01, 0.08, "Ignores stick noise around centre.", "pct"),
      rangeField("padSteerGamma", "Steering curve", 1, 2.5, 0.05, 1.35, "Above 1 softens the first part of the stick travel.", "num"),
      rangeField("padPedalGamma", "Pedal curve", 1, 2.5, 0.05, 1.15, "Same shaping for the triggers.", "num"),
      rangeField("keySteerSpeed", "Keyboard steer rate", 1, 8, 0.25, 3.4, "How fast a key press reaches full lock.", "num"),
      toggleField("padVibration", "Vibration", true, "Rumble on slip, kerbs and impacts."),
      toggleField("padInvertLook", "Invert look axis", false, "Flips the free-look stick."),
      // The on-screen controls appear on their own on a touchscreen, so the
      // toggle is for the tablet with a pad plugged into it rather than for
      // finding them. Tilt is offered because a thumb on a slider is a thumb
      // that is not on a pedal.
      toggleField("touchControls", "On-screen controls", true,
        "Shows the driving controls on a touchscreen. Off if you drive this on a tablet with a pad."),
      enumField("touchSteerMode", "Touch steering", ["Slider", "Tilt"], "Slider",
        "Slider is a thumb track in the bottom corner; tilt steers by rolling the device and frees the thumb."),
      rangeField("touchSteerCurve", "Touch steering curve", 1, 2.5, 0.05, 1.4,
        "Above 1 softens the first part of the track, which is where a correction at speed lives.", "num"),
      rangeField("touchTiltRange", "Tilt to full lock", 12, 40, 1, 26,
        "How far the device has to roll for full lock. However you are holding it when you switch to tilt is straight ahead.", "deg"),
    ]),
  },
]);

export function settingsField(key) {
  for (const group of SETTINGS_SCHEMA) {
    for (const f of group.fields) if (f.key === key) return f;
  }
  return null;
}

export function defaultSettings() {
  const out = {};
  for (const group of SETTINGS_SCHEMA) {
    for (const f of group.fields) out[f.key] = f.default;
  }
  out.keybinds = cloneBinds(DEFAULT_KEYBINDS);
  out.gamepad = { ...DEFAULT_GAMEPAD_MAP };
  out.calibration = defaultCalibration();
  return out;
}

// Snaps a value onto its field: enums fall back to the default rather than
// letting a stale save file poison the UI, ranges clamp and quantise.
export function coerceSetting(field, value) {
  if (!field) return undefined;
  if (field.kind === "toggle") return !!value;
  if (field.kind === "enum") return field.options.includes(value) ? value : field.default;
  if (field.kind === "range") {
    const n = Number(value);
    if (!Number.isFinite(n)) return field.default;
    const step = field.step || 0.01;
    const snapped = Math.round((clamp(n, field.min, field.max) - field.min) / step) * step + field.min;
    return round(clamp(snapped, field.min, field.max), 6);
  }
  return value;
}

export function applySettings(current, patch) {
  const out = { ...defaultSettings(), ...(current ?? {}) };
  for (const key of Object.keys(patch ?? {})) {
    if (key === "keybinds") { out.keybinds = cloneBinds(patch.keybinds); continue; }
    if (key === "gamepad") { out.gamepad = { ...out.gamepad, ...patch.gamepad }; continue; }
    if (key === "calibration") { out.calibration = { ...out.calibration, ...patch.calibration }; continue; }
    const field = settingsField(key);
    if (!field) continue;
    out[key] = coerceSetting(field, patch[key]);
  }
  return out;
}

export function settingsDiff(a, b) {
  const changed = [];
  for (const group of SETTINGS_SCHEMA) {
    for (const f of group.fields) {
      if ((a?.[f.key]) !== (b?.[f.key])) changed.push(f.key);
    }
  }
  return changed;
}

// Quality presets are just a patch over the graphics group, so "High" always
// means the same thing whatever the player poked at before.
export const QUALITY_PRESETS = Object.freeze({
  Low: { renderScale: 0.7, shadows: "Off", particles: 0.3, motionBlur: 0, postFx: false },
  Medium: { renderScale: 0.85, shadows: "Low", particles: 0.6, motionBlur: 0.2, postFx: true },
  High: { renderScale: 1, shadows: "High", particles: 0.8, motionBlur: 0.3, postFx: true },
  Ultra: { renderScale: 1, shadows: "High", particles: 1, motionBlur: 0.45, postFx: true },
});

export function applyQualityPreset(settings, preset) {
  const patch = QUALITY_PRESETS[preset];
  if (!patch) return settings;
  return applySettings(settings, { ...patch, quality: preset });
}

export const ACTIONS = Object.freeze([
  { id: "throttle", label: "Throttle", group: "Driving" },
  { id: "brake", label: "Brake", group: "Driving" },
  { id: "steerLeft", label: "Steer left", group: "Driving" },
  { id: "steerRight", label: "Steer right", group: "Driving" },
  { id: "handbrake", label: "Handbrake", group: "Driving" },
  { id: "clutch", label: "Clutch", group: "Driving" },
  { id: "shiftUp", label: "Shift up", group: "Driving" },
  { id: "shiftDown", label: "Shift down", group: "Driving" },
  { id: "lookLeft", label: "Look left", group: "View" },
  { id: "lookRight", label: "Look right", group: "View" },
  { id: "lookBack", label: "Look back", group: "View" },
  { id: "cameraCycle", label: "Change camera", group: "View" },
  { id: "headlights", label: "Lights", group: "View" },
  { id: "toggleHud", label: "Toggle HUD", group: "View" },
  { id: "repeatNote", label: "Repeat pacenote", group: "Stage" },
  { id: "resetCar", label: "Recover car", group: "Stage" },
  { id: "rewind", label: "Rewind", group: "Stage" },
  { id: "pause", label: "Pause", group: "Stage" },
]);

export const DEFAULT_KEYBINDS = Object.freeze({
  throttle: ["ArrowUp", "KeyW"],
  brake: ["ArrowDown", "KeyS"],
  steerLeft: ["ArrowLeft", "KeyA"],
  steerRight: ["ArrowRight", "KeyD"],
  handbrake: ["Space", null],
  clutch: ["KeyC", null],
  shiftUp: ["KeyE", "ShiftRight"],
  shiftDown: ["KeyQ", "ShiftLeft"],
  lookLeft: ["Comma", null],
  lookRight: ["Period", null],
  lookBack: ["KeyB", null],
  cameraCycle: ["KeyV", null],
  headlights: ["KeyL", null],
  toggleHud: ["KeyH", null],
  repeatNote: ["KeyX", null],
  resetCar: ["KeyR", null],
  rewind: ["KeyZ", null],
  pause: ["Escape", "KeyP"],
});

// Tab and Enter belong to the menus; letting a player bind them would strand
// keyboard navigation with no way back.
export const RESERVED_CODES = Object.freeze(["Tab", "Enter", "NumpadEnter", "F5", "F11", "F12"]);

export function cloneBinds(binds) {
  const out = {};
  for (const action of ACTIONS) {
    const src = binds?.[action.id];
    out[action.id] = [src?.[0] ?? null, src?.[1] ?? null];
  }
  return out;
}

export function resolveAction(binds, code) {
  if (!code) return null;
  for (const action of ACTIONS) {
    const slots = binds?.[action.id];
    if (!slots) continue;
    if (slots[0] === code || slots[1] === code) return action.id;
  }
  return null;
}

// Rebinding is a swap, never a duplicate: a code already used elsewhere is taken
// off its old owner and reported back so the UI can say what it displaced.
export function rebind(binds, action, slot, code) {
  const next = cloneBinds(binds);
  if (!next[action]) return { ok: false, reason: "unknown action", binds: next, displaced: null };
  if (code !== null && RESERVED_CODES.includes(code)) {
    return { ok: false, reason: "reserved", binds: next, displaced: null };
  }
  const idx = slot === 1 ? 1 : 0;
  if (next[action][idx] === code) return { ok: true, reason: "unchanged", binds: next, displaced: null };
  let displaced = null;
  if (code !== null) {
    for (const other of ACTIONS) {
      for (let i = 0; i < 2; i += 1) {
        if (next[other.id][i] === code && !(other.id === action && i === idx)) {
          next[other.id][i] = null;
          displaced = { action: other.id, slot: i };
        }
      }
    }
  }
  next[action][idx] = code;
  return { ok: true, reason: "bound", binds: next, displaced };
}

export function bindConflicts(binds) {
  const seen = new Map();
  const out = [];
  for (const action of ACTIONS) {
    const slots = binds?.[action.id] ?? [];
    for (let i = 0; i < slots.length; i += 1) {
      const code = slots[i];
      if (!code) continue;
      if (seen.has(code)) out.push({ code, actions: [seen.get(code), action.id] });
      else seen.set(code, action.id);
    }
  }
  return out;
}

const KEY_LABELS = {
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Space: "Space", Escape: "Esc", ShiftLeft: "L Shift", ShiftRight: "R Shift",
  ControlLeft: "L Ctrl", ControlRight: "R Ctrl", AltLeft: "L Alt", AltRight: "R Alt",
  Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'",
  BracketLeft: "[", BracketRight: "]", Backslash: "\\", Minus: "-", Equal: "=",
  Backquote: "`", Tab: "Tab", Enter: "Enter", Backspace: "Backspace",
  CapsLock: "Caps", Home: "Home", End: "End", PageUp: "Pg Up", PageDown: "Pg Dn",
};

export function keyLabel(code) {
  if (!code) return "—";
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return "Num " + code.slice(6);
  if (/^F[0-9]{1,2}$/.test(code)) return code;
  return code;
}

export const DEFAULT_GAMEPAD_MAP = Object.freeze({
  steerAxis: 0,
  lookAxis: 2,
  throttleButton: 7,
  brakeButton: 6,
  handbrakeButton: 0,
  shiftUpButton: 5,
  shiftDownButton: 4,
  clutchButton: 1,
  resetButton: 3,
  pauseButton: 9,
  cameraButton: 2,
  triggerAxisMode: false,
});

export function defaultCalibration() {
  return { steer: { min: -1, max: 1, centre: 0, invert: false }, look: { min: -1, max: 1, centre: 0, invert: false } };
}

// Maps a raw axis through its calibration onto a symmetric -1..1. The two halves
// are scaled independently because a worn stick rarely rests at the midpoint of
// its own travel, and forcing one scale puts a step at centre.
export function normaliseAxis(raw, cal) {
  const c = cal ?? { min: -1, max: 1, centre: 0, invert: false };
  const centre = Number.isFinite(c.centre) ? c.centre : 0;
  const lo = Math.min(c.min ?? -1, centre - 1e-4);
  const hi = Math.max(c.max ?? 1, centre + 1e-4);
  const v = Number.isFinite(raw) ? raw : centre;
  let n;
  if (v >= centre) n = (v - centre) / (hi - centre);
  else n = -((centre - v) / (centre - lo));
  n = clamp(n, -1, 1);
  return c.invert ? -n : n;
}

// Continuous at the deadzone edge by construction: the surviving travel is
// rescaled to the full range rather than clipped, so there is no step.
export function applyDeadzone(v, deadzone) {
  const dz = clamp(deadzone ?? 0, 0, 0.95);
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return sign(v) * ((a - dz) / (1 - dz));
}

export function axisCurve(v, gamma) {
  const g = clamp(gamma ?? 1, 0.25, 4);
  const a = clamp(Math.abs(v), 0, 1);
  return sign(v) * Math.pow(a, g);
}

export function shapeAxis(raw, cal, deadzone, gamma) {
  return clamp(axisCurve(applyDeadzone(normaliseAxis(raw, cal), deadzone), gamma), -1, 1);
}

// Triggers report 0..1 as buttons and -1..1 as axes depending on the pad, so the
// pedal path normalises both into 0..1 before shaping.
export function shapePedal(raw, deadzone, gamma, bipolar = false) {
  const v = bipolar ? (clamp(raw, -1, 1) + 1) * 0.5 : clamp(raw ?? 0, 0, 1);
  const dz = clamp(deadzone ?? 0, 0, 0.95);
  if (v <= dz) return 0;
  return clamp(Math.pow((v - dz) / (1 - dz), clamp(gamma ?? 1, 0.25, 4)), 0, 1);
}

export function makePadState() {
  return {
    connected: false, id: "", index: -1,
    steer: 0, look: 0, throttle: 0, brake: 0,
    handbrake: false, clutch: false, shiftUp: false, shiftDown: false,
    reset: false, pause: false, camera: false,
  };
}

function buttonValue(pad, index) {
  if (index == null || index < 0) return 0;
  const b = pad.buttons?.[index];
  if (b == null) return 0;
  return typeof b === "number" ? b : (b.value ?? (b.pressed ? 1 : 0));
}

// Fills the caller's state object. Called every frame while a pad is attached,
// so it must not allocate — every branch writes into `out`.
export function readGamepad(pad, map, settings, out) {
  const state = out ?? makePadState();
  if (!pad) {
    state.connected = false;
    state.steer = 0; state.look = 0; state.throttle = 0; state.brake = 0;
    state.handbrake = false; state.clutch = false; state.shiftUp = false;
    state.shiftDown = false; state.reset = false; state.pause = false; state.camera = false;
    return state;
  }
  const m = map ?? DEFAULT_GAMEPAD_MAP;
  const dz = settings?.padDeadzone ?? 0.08;
  const steerGamma = settings?.padSteerGamma ?? 1.35;
  const pedalGamma = settings?.padPedalGamma ?? 1.15;
  const cal = settings?.calibration ?? null;
  state.connected = true;
  state.id = pad.id ?? "";
  state.index = pad.index ?? 0;
  state.steer = shapeAxis(pad.axes?.[m.steerAxis] ?? 0, cal?.steer, dz, steerGamma);
  const lookRaw = shapeAxis(pad.axes?.[m.lookAxis] ?? 0, cal?.look, dz, 1);
  state.look = settings?.padInvertLook ? -lookRaw : lookRaw;
  state.throttle = shapePedal(buttonValue(pad, m.throttleButton), dz * 0.5, pedalGamma, m.triggerAxisMode);
  state.brake = shapePedal(buttonValue(pad, m.brakeButton), dz * 0.5, pedalGamma, m.triggerAxisMode);
  state.handbrake = buttonValue(pad, m.handbrakeButton) > 0.5;
  state.clutch = buttonValue(pad, m.clutchButton) > 0.5;
  state.shiftUp = buttonValue(pad, m.shiftUpButton) > 0.5;
  state.shiftDown = buttonValue(pad, m.shiftDownButton) > 0.5;
  state.reset = buttonValue(pad, m.resetButton) > 0.5;
  state.pause = buttonValue(pad, m.pauseButton) > 0.5;
  state.camera = buttonValue(pad, m.cameraButton) > 0.5;
  return state;
}

// Calibration from a sweep: the extremes are the travel, and the value the stick
// settles at once released is the centre.
export function calibrateAxis(samples, restValue) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < (samples?.length ?? 0); i += 1) {
    const v = samples[i];
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 0.2) {
    return { min: -1, max: 1, centre: 0, invert: false };
  }
  const centre = Number.isFinite(restValue) ? clamp(restValue, min + 1e-3, max - 1e-3) : (min + max) * 0.5;
  return { min: round(min, 4), max: round(max, 4), centre: round(centre, 4), invert: false };
}

function sampleCount(stage) {
  if (!stage) return 0;
  if (Number.isFinite(stage.count)) return stage.count | 0;
  return stage.x?.length ?? 0;
}

// Route preview straight off the Stage arrays. North is up, the fit is uniform
// in both axes (a stretched map lies about how tight a corner is), and the
// polyline is decimated to a point budget so a 6 km stage is not 3000 nodes.
export function buildRoutePreview(stage, opts = {}) {
  let w = opts.width ?? 320;
  let h = opts.height ?? 200;
  const pad = opts.pad ?? 14;
  const maxPoints = Math.max(8, opts.maxPoints ?? 220);
  const n = sampleCount(stage);
  const empty = {
    empty: true, width: w, height: h, pad, viewBox: [0, 0, w, h],
    d: "", points: [], segments: [], splits: [], start: null, finish: null,
    scale: 1, project: (x, z) => ({ x: w * 0.5, y: h * 0.5 }),
  };
  if (n < 2 || !stage.x || !stage.z) return empty;

  const stride = Math.max(1, Math.ceil(n / maxPoints));
  const idx = [];
  for (let i = 0; i < n; i += stride) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);

  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const x = stage.x[i]; const z = stage.z[i];
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return empty;
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanZ = Math.max(maxZ - minZ, 1e-6);
  // `fit` shrinks the box onto the route's own aspect. Without it a north-south
  // stage in a landscape box is a thin ribbon between two empty margins, and
  // those margins live inside the viewBox where no CSS can reclaim them.
  if (opts.fit) {
    const content = spanX / spanZ;
    const box = Math.max(1, w - pad * 2) / Math.max(1, h - pad * 2);
    if (content < box) w = round(pad * 2 + Math.max(1, h - pad * 2) * content, 0);
    else h = round(pad * 2 + Math.max(1, w - pad * 2) / content, 0);
  }
  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);
  const scale = Math.min(innerW / spanX, innerH / spanZ);
  const offX = pad + (innerW - spanX * scale) * 0.5;
  const offY = pad + (innerH - spanZ * scale) * 0.5;
  const project = (x, z) => ({
    x: round(offX + (x - minX) * scale, 2),
    y: round(offY + (maxZ - z) * scale, 2),
  });

  const points = [];
  let d = "";
  for (let k = 0; k < idx.length; k += 1) {
    const p = project(stage.x[idx[k]], stage.z[idx[k]]);
    points.push(p);
    d += (k === 0 ? "M" : "L") + p.x + " " + p.y + (k === idx.length - 1 ? "" : " ");
  }

  // One sub-path per run of a single surface, so the preview reads gravel from
  // tarmac at a glance instead of needing a key.
  const segments = [];
  if (stage.surface && stage.surface.length >= n) {
    let runId = stage.surface[idx[0]];
    let run = [points[0]];
    for (let k = 1; k < idx.length; k += 1) {
      const id = stage.surface[idx[k]];
      run.push(points[k]);
      if (id !== runId || k === idx.length - 1) {
        segments.push({ surfaceId: runId, colour: surfaceColour(runId), d: polylineD(run) });
        runId = id;
        run = [points[k]];
      }
    }
    if (run.length > 1) segments.push({ surfaceId: runId, colour: surfaceColour(runId), d: polylineD(run) });
  }

  const splits = [];
  const stepM = stage.step || (stage.length && n > 1 ? stage.length / (n - 1) : 2);
  for (const s of stage.splits ?? []) {
    const i = clamp(Math.round(s / stepM), 0, n - 1);
    const p = project(stage.x[i], stage.z[i]);
    splits.push({ s, index: i, x: p.x, y: p.y });
  }
  const startP = project(stage.x[0], stage.z[0]);
  const finishP = project(stage.x[n - 1], stage.z[n - 1]);

  return {
    empty: false, width: w, height: h, pad, viewBox: [0, 0, w, h],
    d, points, segments, splits,
    start: startP, finish: finishP,
    scale, bounds: { minX, maxX, minZ, maxZ },
    project,
  };
}

function polylineD(pts) {
  let d = "";
  for (let i = 0; i < pts.length; i += 1) {
    d += (i === 0 ? "M" : "L") + pts[i].x + " " + pts[i].y + (i === pts.length - 1 ? "" : " ");
  }
  return d;
}

export function powerKw(torqueNm, rpm) {
  return (torqueNm * rpm * Math.PI * 2) / 60 / 1000;
}

// Torque and the power it implies on one chart, because the interesting question
// about a rally engine is where the two cross, not what either peaks at.
export function buildTorqueChart(curve, opts = {}) {
  const w = opts.width ?? 260;
  const h = opts.height ?? 110;
  const pad = opts.pad ?? 10;
  const pts = Array.isArray(curve) ? curve.filter((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
  const blank = {
    empty: true, width: w, height: h, viewBox: [0, 0, w, h], torqueD: "", powerD: "",
    peakTorque: null, peakPower: null, ticks: [], rpmMin: 0, rpmMax: 0,
  };
  if (pts.length < 2) return blank;
  const sorted = pts.slice().sort((a, b) => a[0] - b[0]);
  const rpmMin = sorted[0][0];
  const rpmMax = sorted[sorted.length - 1][0];
  if (rpmMax - rpmMin < 1) return blank;
  let maxT = 0;
  let peakT = sorted[0];
  let maxP = 0;
  let peakP = [sorted[0][0], 0];
  for (const [r, t] of sorted) {
    if (t > maxT) { maxT = t; peakT = [r, t]; }
    const p = powerKw(t, r);
    if (p > maxP) { maxP = p; peakP = [r, p]; }
  }
  const innerW = Math.max(1, w - pad * 2);
  const innerH = Math.max(1, h - pad * 2);
  const px = (r) => round(pad + invLerp(rpmMin, rpmMax, r) * innerW, 2);
  const pyT = (t) => round(pad + (1 - saturate(t / (maxT || 1))) * innerH, 2);
  const pyP = (p) => round(pad + (1 - saturate(p / (maxP || 1))) * innerH, 2);
  let torqueD = "";
  let powerD = "";
  for (let i = 0; i < sorted.length; i += 1) {
    const [r, t] = sorted[i];
    torqueD += (i === 0 ? "M" : "L") + px(r) + " " + pyT(t) + (i === sorted.length - 1 ? "" : " ");
    powerD += (i === 0 ? "M" : "L") + px(r) + " " + pyP(powerKw(t, r)) + (i === sorted.length - 1 ? "" : " ");
  }
  const ticks = [];
  const tickStep = 1000;
  for (let r = Math.ceil(rpmMin / tickStep) * tickStep; r <= rpmMax; r += tickStep) {
    ticks.push({ rpm: r, x: px(r), label: String(Math.round(r / 1000)) });
  }
  return {
    empty: false, width: w, height: h, viewBox: [0, 0, w, h], pad,
    torqueD, powerD, ticks, rpmMin, rpmMax,
    peakTorque: { rpm: peakT[0], nm: peakT[1], x: px(peakT[0]), y: pyT(peakT[1]) },
    peakPower: { rpm: peakP[0], kw: peakP[1], x: px(peakP[0]), y: pyP(peakP[1]) },
  };
}

// Split-by-split delta against a reference run. Positive is time lost, which is
// drawn below the zero line so "the line drops" always means "you are slower".
export function buildDeltaChart(splits, opts = {}) {
  const w = opts.width ?? 320;
  const h = opts.height ?? 120;
  const pad = opts.pad ?? 12;
  const rows = (splits ?? []).filter((s) => Number.isFinite(s?.deltaMs));
  const zeroY = round(h * 0.5, 2);
  if (rows.length === 0) {
    return { empty: true, width: w, height: h, viewBox: [0, 0, w, h], d: "", zeroY, points: [], maxAbs: 0, bars: [] };
  }
  let maxAbs = 0;
  for (const r of rows) maxAbs = Math.max(maxAbs, Math.abs(r.deltaMs));
  maxAbs = Math.max(maxAbs, 250);
  const innerW = Math.max(1, w - pad * 2);
  const half = Math.max(1, h * 0.5 - pad);
  const points = [];
  const bars = [];
  const denom = Math.max(1, rows.length - 1);
  for (let i = 0; i < rows.length; i += 1) {
    const x = round(pad + (rows.length === 1 ? innerW * 0.5 : (i / denom) * innerW), 2);
    const y = round(zeroY + (rows[i].deltaMs / maxAbs) * half, 2);
    points.push({ x, y, deltaMs: rows[i].deltaMs, label: rows[i].label ?? `S${i + 1}` });
    bars.push({ x, y0: zeroY, y1: y, tone: deltaTone(rows[i].deltaMs), deltaMs: rows[i].deltaMs });
  }
  let d = "";
  for (let i = 0; i < points.length; i += 1) {
    d += (i === 0 ? "M" : "L") + points[i].x + " " + points[i].y + (i === points.length - 1 ? "" : " ");
  }
  return { empty: false, width: w, height: h, viewBox: [0, 0, w, h], pad, d, zeroY, points, bars, maxAbs };
}

export const LIVERIES = Object.freeze([
  { id: "flare", name: "Flare Works", base: "#f1f3f6", stripe: "#ff5a14", accent: "#101318" },
  { id: "kiln", name: "Kiln Red", base: "#c0182c", stripe: "#ffc247", accent: "#2a0508" },
  { id: "meridian", name: "Meridian Blue", base: "#123a6b", stripe: "#7fd4ff", accent: "#f1f3f6" },
  { id: "verdigris", name: "Verdigris", base: "#17564c", stripe: "#2fe0a8", accent: "#0b1c19" },
  { id: "graphite", name: "Graphite Stealth", base: "#1b1f25", stripe: "#5c6775", accent: "#ff5a14" },
  { id: "sodium", name: "Sodium Night", base: "#12141a", stripe: "#ffc247", accent: "#ffffff" },
]);

export function liveryById(id) {
  return LIVERIES.find((l) => l.id === id) ?? LIVERIES[0];
}

// A plan-view silhouette built from polygons — no bitmap, no font. The stripe
// follows the same skew as the wordmark motif so the car reads as ours.
export function buildLiveryPreview(liveryId, number, opts = {}) {
  const w = opts.width ?? 220;
  const h = opts.height ?? 120;
  const livery = liveryById(liveryId);
  const bodyX = 16;
  const bodyW = w - 32;
  const bodyY = 18;
  const bodyH = h - 36;
  const cut = 16;
  const body = [
    [bodyX + cut, bodyY], [bodyX + bodyW - cut, bodyY], [bodyX + bodyW, bodyY + cut],
    [bodyX + bodyW, bodyY + bodyH - cut], [bodyX + bodyW - cut, bodyY + bodyH],
    [bodyX + cut, bodyY + bodyH], [bodyX, bodyY + bodyH - cut], [bodyX, bodyY + cut],
  ];
  const skew = Math.tan((-BRAND.skewDeg * Math.PI) / 180) * bodyH;
  const stripeX = bodyX + bodyW * 0.52;
  const stripeW = bodyW * 0.13;
  const stripe = [
    [stripeX + skew, bodyY], [stripeX + skew + stripeW, bodyY],
    [stripeX + stripeW, bodyY + bodyH], [stripeX, bodyY + bodyH],
  ];
  const glass = [
    [bodyX + bodyW * 0.16, bodyY + bodyH * 0.22], [bodyX + bodyW * 0.40, bodyY + bodyH * 0.16],
    [bodyX + bodyW * 0.40, bodyY + bodyH * 0.84], [bodyX + bodyW * 0.16, bodyY + bodyH * 0.78],
  ];
  const num = clamp(Math.round(Number(number) || 1), 1, 999);
  return {
    width: w, height: h, viewBox: [0, 0, w, h], livery,
    shapes: [
      { role: "body", fill: livery.base, points: body.map((p) => [round(p[0], 2), round(p[1], 2)]) },
      { role: "stripe", fill: livery.stripe, points: stripe.map((p) => [round(p[0], 2), round(p[1], 2)]) },
      { role: "glass", fill: livery.accent, points: glass.map((p) => [round(p[0], 2), round(p[1], 2)]) },
    ],
    roundel: { cx: round(bodyX + bodyW * 0.80, 2), cy: round(bodyY + bodyH * 0.5, 2), r: round(Math.min(bodyH * 0.30, 22), 2) },
    number: num,
    numberText: String(num).padStart(2, "0"),
  };
}

const DRIVETRAIN_LABEL = { fwd: "Front", rwd: "Rear", awd: "All-wheel", "4wd": "All-wheel" };

function specValue(spec, key) {
  switch (key) {
    case "power": return spec.powerKw ?? spec.power ?? (spec.powerHp ? spec.powerHp / 1.34102 : NaN);
    case "torque": return spec.peakTorqueNm ?? spec.torque ?? peakOf(spec.torqueCurve);
    case "mass": return spec.mass ?? spec.massKg ?? NaN;
    case "power2mass": {
      const p = specValue(spec, "power");
      const m = specValue(spec, "mass");
      return Number.isFinite(p) && m > 0 ? (p * 1000) / m : NaN;
    }
    case "topSpeed": return spec.topSpeedKph ?? (Number.isFinite(spec.topSpeed) ? spec.topSpeed * 3.6 : NaN);
    case "gears": return spec.gearCount ?? (Array.isArray(spec.gearRatios) ? spec.gearRatios.length : NaN);
    default: return NaN;
  }
}

function peakOf(curve) {
  if (!Array.isArray(curve)) return NaN;
  let m = NaN;
  for (const p of curve) if (Array.isArray(p) && Number.isFinite(p[1])) m = Number.isFinite(m) ? Math.max(m, p[1]) : p[1];
  return m;
}

export const SPEC_FIELDS = Object.freeze([
  { key: "power", label: "Power", unit: "power", dp: 0, higherBetter: true },
  { key: "torque", label: "Torque", unit: "torque", dp: 0, higherBetter: true },
  { key: "mass", label: "Mass", unit: "mass", dp: 0, higherBetter: false },
  { key: "power2mass", label: "Power / tonne", unit: "power", dp: 0, higherBetter: true },
  { key: "topSpeed", label: "Top speed", unit: "speed", dp: 0, higherBetter: true },
  { key: "gears", label: "Gears", unit: null, dp: 0, higherBetter: true },
]);

// One row per spec line with every car's cell on it, plus a 0..1 bar fraction
// normalised across the comparison set so the bars mean something relative.
export function compareSpecs(cars, opts = {}) {
  const units = opts.units ?? "metric";
  const list = (cars ?? []).filter(Boolean);
  const rows = [];
  for (const field of SPEC_FIELDS) {
    const raws = list.map((c) => specValue(c, field.key));
    const finite = raws.filter(Number.isFinite);
    const lo = finite.length ? Math.min(...finite) : 0;
    const hi = finite.length ? Math.max(...finite) : 1;
    let best = NaN;
    for (const v of finite) {
      if (!Number.isFinite(best)) best = v;
      else best = field.higherBetter ? Math.max(best, v) : Math.min(best, v);
    }
    rows.push({
      key: field.key,
      label: field.label,
      unit: field.unit ? convertUnit(field.unit, 1, units).unit : "",
      cells: list.map((car, i) => {
        const raw = raws[i];
        const frac = hi > lo && Number.isFinite(raw)
          ? saturate(field.higherBetter ? invLerp(lo, hi, raw) : 1 - invLerp(lo, hi, raw))
          : (Number.isFinite(raw) ? 1 : 0);
        return {
          carId: car.id ?? String(i),
          raw,
          text: field.unit ? formatUnit(field.unit, raw, units, field.dp) : (Number.isFinite(raw) ? raw.toFixed(field.dp) : "—"),
          frac: round(frac, 4),
          best: Number.isFinite(raw) && raw === best,
        };
      }),
    });
  }
  rows.push({
    key: "drivetrain",
    label: "Drivetrain",
    unit: "",
    cells: list.map((car, i) => ({
      carId: car.id ?? String(i),
      raw: NaN,
      text: DRIVETRAIN_LABEL[String(car.drivetrain ?? "").toLowerCase()] ?? String(car.drivetrain ?? "—"),
      frac: 0,
      best: false,
    })),
  });
  return rows;
}

// Fallback content so a screen never renders empty while career.js or stage.js
// is still starting up. Entirely invented, and deterministic — no rng in the UI.
export function demoData() {
  const stage = synthStage("Kalder Pass", 6420);
  return {
    profile: { name: "Privateer", team: "Opus Works", number: 7, livery: "flare" },
    championship: {
      name: "Opus Trophy",
      round: 3,
      events: [
        { id: "ev-fenn", name: "Fennmark Rally", country: "Fennmark", surface: [SURFACE.GRAVEL], status: "done", position: 2, x: 0.18, y: 0.28 },
        { id: "ev-vaska", name: "Vaskaland Winter", country: "Vaskaland", surface: [SURFACE.SNOW, SURFACE.ICE], status: "done", position: 4, x: 0.44, y: 0.14 },
        { id: "ev-kalder", name: "Kalder Hills", country: "Ostrend", surface: [SURFACE.GRAVEL, SURFACE.DIRT], status: "next", position: null, x: 0.62, y: 0.44 },
        { id: "ev-solmar", name: "Solmar Coast", country: "Solmar", surface: [SURFACE.TARMAC], status: "locked", position: null, x: 0.34, y: 0.72 },
        { id: "ev-drennt", name: "Drennt Forest", country: "Drennt", surface: [SURFACE.DIRT, SURFACE.MUD], status: "locked", position: null, x: 0.80, y: 0.68 },
      ],
      standings: [
        { name: "V. Estergaard", team: "Nordwerk", points: 58 },
        { name: "You", team: "Opus Works", points: 51, isPlayer: true },
        { name: "M. Ravel", team: "Cassin Sport", points: 47 },
        { name: "T. Okonkwo", team: "Hallmark Rally", points: 39 },
        { name: "P. Brandt", team: "Nordwerk", points: 30 },
      ],
    },
    stage,
    stages: [stage],
    weather: { name: "Overcast, drying", wetness: 0.25, temperature: 11, wind: 4, timeOfDay: "14:20" },
    personalBest: 401300,
    rivals: [
      { name: "V. Estergaard", timeMs: 396800 },
      { name: "M. Ravel", timeMs: 402400 },
      { name: "T. Okonkwo", timeMs: 408900 },
    ],
    classes: [
      { id: "cls-h", name: "Heritage 2WD", blurb: "Light, narrow, no aids. The car that teaches you the flick." },
      { id: "cls-n", name: "National 4WD", blurb: "Turbocharged all-wheel drive with a real centre diff." },
      { id: "cls-w", name: "Works Prototype", blurb: "Anti-lag, active centre, and no forgiveness at all." },
    ],
    cars: [
      {
        id: "car-verrel", classId: "cls-h", name: "Verrel 118 GTS", maker: "Verrel",
        drivetrain: "rwd", powerKw: 122, mass: 890, gearCount: 5, topSpeedKph: 195,
        torqueCurve: [[1500, 130], [2500, 168], [3500, 190], [4500, 196], [5500, 182], [6800, 150]],
        blurb: "Short wheelbase, kerb-weight of a shopping trolley, and everything happens through your right foot.",
      },
      {
        id: "car-narvik", classId: "cls-n", name: "Narvik R4 Turbo", maker: "Narvik",
        drivetrain: "awd", powerKw: 224, mass: 1230, gearCount: 6, topSpeedKph: 215,
        torqueCurve: [[2000, 260], [3000, 400], [4000, 445], [5000, 430], [6000, 385], [7000, 320]],
        blurb: "The everyman rally weapon: fat mid-range, honest diff, and it will carry a mistake for you.",
      },
      {
        id: "car-castellan", classId: "cls-w", name: "Castellan WX", maker: "Castellan",
        drivetrain: "awd", powerKw: 280, mass: 1190, gearCount: 6, topSpeedKph: 228,
        torqueCurve: [[2500, 320], [3500, 470], [4500, 520], [5500, 500], [6500, 448], [7500, 380]],
        blurb: "Anti-lag holds the turbo lit off throttle, so it turns on the brakes and fires out of the apex.",
      },
    ],
    damage: [
      { id: "dmg-susp-fl", part: "Front left damper", severity: 0.62, repairMin: 14, effect: "Front end skates over washboard and the car pulls left under braking." },
      { id: "dmg-rad", part: "Radiator", severity: 0.35, repairMin: 9, effect: "Coolant loss builds; the engine will start pulling power after 4 km." },
      { id: "dmg-glass", part: "Windscreen", severity: 0.20, repairMin: 5, effect: "Cracked, not blocking. Cosmetic unless it goes." },
      { id: "dmg-gear", part: "Gearbox linkage", severity: 0.48, repairMin: 18, effect: "Third gear is a lottery; missed shifts cost about a second each." },
    ],
    repairBudgetMin: 30,
    results: {
      stageName: "Kalder Pass",
      totalMs: 404800,
      position: 2,
      splits: [
        { label: "Split 1", timeMs: 132400, deltaMs: -1200 },
        { label: "Split 2", timeMs: 268900, deltaMs: 700 },
        { label: "Finish", timeMs: 404800, deltaMs: 3500 },
      ],
      penaltiesMs: 0,
      cleanRun: true,
    },
    season: {
      title: "Opus Trophy — Final",
      podium: [
        { position: 2, name: "You", team: "Opus Works", points: 118, isPlayer: true },
        { position: 1, name: "V. Estergaard", team: "Nordwerk", points: 131 },
        { position: 3, name: "M. Ravel", team: "Cassin Sport", points: 109 },
      ],
    },
  };
}

// A tiny closed-form stage for previews and tests: a lazy S with two splits, so
// nothing in the UI has to wait for stage.js to exist.
export function synthStage(name, length = 5000, step = 20) {
  const count = Math.max(2, Math.round(length / step) + 1);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const s = new Float32Array(count);
  const surface = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const arc = t * length;
    s[i] = arc;
    x[i] = Math.sin(t * Math.PI * 2.2) * 620 + t * 300;
    z[i] = t * 1800 - Math.sin(t * Math.PI * 4.4) * 180;
    y[i] = 240 + Math.sin(t * Math.PI * 3) * 60;
    surface[i] = t < 0.34 ? SURFACE.GRAVEL : t < 0.62 ? SURFACE.DIRT : SURFACE.GRAVEL;
  }
  return {
    id: "syn-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    country: "Ostrend",
    seed: 1,
    notes: "Fast open gravel that tightens into the pass, then a technical run down to the valley floor.",
    surfaceMix: [SURFACE.GRAVEL, SURFACE.DIRT],
    length, step, count, x, y, z, s, surface,
    splits: [length * 0.33, length * 0.66],
    start: { x: x[0], y: y[0], z: z[0], yaw: 0 },
    finish: { s: length, x: x[count - 1], y: y[count - 1], z: z[count - 1] },
    features: [
      { s: length * 0.12, kind: "crest", severity: 0.6 },
      { s: length * 0.31, kind: "hairpin", severity: 1 },
      { s: length * 0.55, kind: "jump", severity: 0.7 },
      { s: length * 0.78, kind: "narrows", severity: 0.5 },
    ],
  };
}

const btn = (id, label, action, extra = {}) => ({ id, kind: "button", label, action, ...extra });

// The second column of the title screen. A returning player's first two
// questions are "where am I in this championship" and "what am I about to
// drive", and both are answerable from data the shell already holds — so the
// right-hand two thirds carries the answer instead of carrying nothing.
export function titleDossier(data = {}) {
  const champ = data.championship ?? {};
  const events = champ.events ?? [];
  const next = events.find((e) => e.status === "next")
    ?? events.find((e) => e.status !== "done")
    ?? events[0]
    ?? null;
  const round = Number.isFinite(champ.round) ? champ.round : events.filter((e) => e.status === "done").length + 1;
  const standings = (champ.standings ?? []).slice(0, 5);
  let topPoints = 0;
  for (const row of standings) topPoints = Math.max(topPoints, row.points ?? 0);
  return {
    title: champ.name ?? "Free play",
    round,
    rounds: events.length,
    next,
    stage: data.stage ?? null,
    weather: data.weather ?? {},
    personalBest: data.personalBest,
    rows: standings.map((row, i) => ({
      position: i + 1,
      name: row.name ?? "—",
      team: row.team ?? "",
      points: row.points ?? 0,
      frac: topPoints > 0 ? saturate((row.points ?? 0) / topPoints) : 0,
      isPlayer: !!row.isPlayer,
    })),
    // Where the season stands, at a glance: a finished round shows what it cost
    // you, so the strip is a record rather than a progress bar.
    calendar: events.map((e) => ({
      id: e.id,
      // The strip is five chips across one panel, so it carries the name a
      // calendar carries — the place, not the full event title.
      label: String(e.name ?? "").split(/\s+/)[0] || (e.country ?? ""),
      status: e.status ?? "locked",
      badge: e.status === "done" ? ordinal(e.position) : e.status === "next" ? "Next" : "—",
    })),
  };
}

export function buildTitleModel(data = {}) {
  const has = !!data.championship;
  const units = data.settings?.units ?? "metric";
  const dossier = titleDossier(data);
  const stage = dossier.stage;
  // Big enough that the map is what the eye lands on rather than a stamp beside
  // the text; `fit` keeps the box on the route's own aspect so the panel spends
  // no height on margin, and the point budget holds a 12 km stage under 300 nodes.
  const preview = buildRoutePreview(stage, { width: 440, height: 200, maxPoints: 260, fit: true });
  const heroItems = [
    {
      id: "t-hero-round", kind: "eyebrow",
      label: dossier.title,
      value: dossier.rounds ? `Round ${dossier.round} of ${dossier.rounds}` : "Nothing entered yet",
    },
    {
      id: "t-hero-name", kind: "headline",
      label: dossier.next?.name ?? stage?.name ?? "Open testing",
      value: dossier.next
        ? `${dossier.next.country} · ${surfaceMixText(dossier.next.surface)}`
        : surfaceMixText(stage?.surfaceMix),
    },
  ];
  if (stage) {
    heroItems.push({
      id: "t-hero-map", kind: "route", label: "Route", preview,
      caption: `Recce map · ${stage.name}`,
    });
    heroItems.push({
      id: "t-hero-stats", kind: "statRow",
      cells: [
        { label: "Stage", value: formatUnit("distance", (stage.length ?? 0) / 1000, units, 2) },
        { label: "Conditions", value: dossier.weather.name ?? "Clear" },
        { label: "Your best", value: formatTime(dossier.personalBest) },
      ],
    });
  }
  if (dossier.rows.length) {
    heroItems.push({ id: "t-hero-standings", kind: "standings", label: "Standings", rows: dossier.rows });
  }
  if (dossier.calendar.length) {
    heroItems.push({ id: "t-hero-calendar", kind: "chips", label: "Calendar", chips: dossier.calendar });
  }
  return {
    screen: "title",
    title: BRAND.name,
    kicker: BRAND.tagline,
    dossier,
    sections: [
      {
        id: "t-brand", kind: "brand", region: "brand",
        items: [
          { id: "t-wordmark", kind: "wordmark", label: BRAND.name },
          { id: "t-tagline", kind: "eyebrow", label: BRAND.tagline },
        ],
      },
      {
        id: "t-menu", kind: "menu", region: "main", heading: "Main menu",
        items: [
          // The primary action is the championship, and it is reachable from a
          // cold start now that career.js draws its calendar from STAGE_BOOK.
          // It used to be hidden behind `hidden: !has`, which meant a player
          // with no season had no way to start one — career.js scheduled its own
          // rallies (kal-hovden, van-costiera) and stage.js could only build the
          // twelve in the book, so the button was suppressed rather than fixed.
          //
          // "Quick stage" is unconditional. It was hidden whenever a season was
          // running, which is one press away from a player who wants a single
          // stage having to abandon a championship to get one.
          btn("t-continue", has ? "Continue championship" : "New championship",
            has ? "continue" : "newSeason", { primary: true }),
          btn("t-new", "New championship", "newSeason", { hidden: !has }),
          btn("t-quick", "Quick stage", "quickStage"),
          btn("t-trial", "Time trial", "timeTrial"),
          btn("t-garage", "Garage", "garage"),
          btn("t-settings", "Settings", "openSettings"),
          btn("t-howto", "How to drive", "tutorial"),
        ].filter((i) => !i.hidden),
      },
      { id: "t-next", kind: "hero", region: "aside", heading: "Next event", items: heroItems },
      {
        id: "t-meta", kind: "meta", region: "footer",
        // No build string: "Build dev" is developer metadata and a player reading
        // it learns nothing except that someone forgot to take it out.
        items: [
          { id: "t-driver", kind: "stat", label: "Driver", value: data.profile?.name ?? "Privateer" },
          { id: "t-team", kind: "stat", label: "Team", value: data.profile?.team ?? "Privateer entry" },
          { id: "t-rallies", kind: "stat", label: "Rallies", value: String(data.rallyCount ?? 5) },
        ],
      },
    ],
  };
}

export function buildChampionshipModel(data = {}) {
  const champ = data.championship ?? {};
  const events = champ.events ?? [];
  const next = events.find((e) => e.status === "next") ?? events[0] ?? null;
  const nextStage = data.nextStage ?? null;
  return {
    screen: "championship",
    title: champ.name ?? "Championship",
    kicker: `Round ${champ.round ?? 1} of ${events.length || 1}`,
    sections: [
      {
        id: "c-map", kind: "map", region: "main", heading: "Calendar",
        items: events.map((e) => ({
          id: "c-ev-" + e.id,
          kind: e.status === "locked" ? "text" : "button",
          label: e.name,
          action: "selectEvent",
          value: e.id,
          disabled: e.status === "locked",
          badge: e.status === "done" ? ordinal(e.position) : e.status === "next" ? "Next" : "Locked",
          sub: `${e.country} · ${surfaceMixText(e.surface)}`,
          point: { x: saturate(e.x ?? 0.5), y: saturate(e.y ?? 0.5) },
          status: e.status,
        })),
      },
      {
        id: "c-standings", kind: "table", region: "aside", heading: "Standings",
        columns: ["", "Driver", "Team", "Pts"],
        items: (champ.standings ?? []).map((row, i) => ({
          id: "c-st-" + i,
          kind: "row",
          cells: [String(i + 1), row.name, row.team ?? "", String(row.points ?? 0)],
          highlight: !!row.isPlayer,
        })),
      },
      {
        id: "c-next", kind: "panel", region: "footer", heading: "Next stage",
        // `nextStage` is the season cursor's own stage. Without it this panel
        // could only name the event, which told a player nothing about the road
        // the button was about to put them on.
        items: [
          { id: "c-next-name", kind: "stat", label: "Next", value: nextStage?.name ?? next?.name ?? "—" },
          { id: "c-next-surface", kind: "stat", label: "Surface", value: surfaceMixText(nextStage?.surface ?? next?.surface) },
          { id: "c-next-wx", kind: "stat", label: "Conditions", value: nextStage?.conditions ?? "—" },
          btn("c-go", "Go to stage", "openStage", { primary: true, disabled: !next, value: next?.id }),
          btn("c-quit", "Back to title", "title"),
        ],
      },
    ],
  };
}

function ordinal(n) {
  if (!Number.isFinite(n)) return "—";
  const v = Math.round(n);
  const rem100 = v % 100;
  if (rem100 >= 11 && rem100 <= 13) return v + "th";
  switch (v % 10) {
    case 1: return v + "st";
    case 2: return v + "nd";
    case 3: return v + "rd";
    default: return v + "th";
  }
}

export function buildStageModel(data = {}) {
  const stage = data.stage ?? null;
  const units = data.settings?.units ?? "metric";
  const weather = data.weather ?? {};
  const lengthKm = (stage?.length ?? 0) / 1000;
  const preview = buildRoutePreview(stage, { width: 340, height: 200 });
  return {
    screen: "stage",
    title: stage?.name ?? "Stage",
    kicker: stage?.country ?? "",
    preview,
    sections: [
      {
        id: "s-route", kind: "route", region: "main", heading: "Route",
        items: [{ id: "s-map", kind: "route", label: stage?.name ?? "Route", preview }],
      },
      {
        id: "s-facts", kind: "list", region: "main", heading: "Stage card",
        items: [
          { id: "s-length", kind: "stat", label: "Length", value: formatUnit("distance", lengthKm, units, 2) },
          { id: "s-surface", kind: "stat", label: "Surface", value: surfaceMixText(stage?.surfaceMix) },
          { id: "s-weather", kind: "stat", label: "Weather", value: weather.name ?? "Clear" },
          { id: "s-temp", kind: "stat", label: "Air", value: formatUnit("temperature", weather.temperature ?? 12, units, 0) },
          { id: "s-time", kind: "stat", label: "Start time", value: weather.timeOfDay ?? "—" },
          { id: "s-notes", kind: "note", label: "Recce", value: stage?.notes ?? "" },
        ],
      },
      {
        id: "s-times", kind: "table", region: "aside", heading: "Times",
        columns: ["Driver", "Time", "Delta"],
        items: [
          {
            id: "s-pb", kind: "row",
            cells: ["Personal best", formatTime(data.personalBest), "—"],
            highlight: true,
          },
          ...(data.rivals ?? []).map((r, i) => ({
            id: "s-rival-" + i,
            kind: "row",
            cells: [r.name, formatTime(r.timeMs), formatDelta(r.timeMs - (data.personalBest ?? r.timeMs))],
            tone: deltaTone(r.timeMs - (data.personalBest ?? r.timeMs)),
          })),
        ],
      },
      {
        id: "s-actions", kind: "panel", region: "footer",
        items: [
          btn("s-start", "Start stage", "startStage", { primary: true, value: stage?.id }),
          btn("s-car", "Change car", "openCar"),
          btn("s-notes-style", "Pacenotes", "openSettings", { value: "pacenotes" }),
          btn("s-back", "Back", "back"),
        ],
      },
    ],
  };
}

export function buildCarModel(data = {}) {
  const units = data.settings?.units ?? "metric";
  const classes = data.classes ?? [];
  const activeClass = data.activeClassId ?? classes[0]?.id ?? null;
  const cars = (data.cars ?? []).filter((c) => !activeClass || c.classId === activeClass);
  const selected = cars.find((c) => c.id === data.selectedCarId) ?? cars[0] ?? null;
  const rows = compareSpecs(cars, { units });
  const chart = buildTorqueChart(selected?.torqueCurve, { width: 260, height: 110 });
  const liveryId = data.liveryId ?? data.profile?.livery ?? LIVERIES[0].id;
  const number = data.number ?? data.profile?.number ?? 1;
  const preview = buildLiveryPreview(liveryId, number);
  return {
    screen: "car",
    title: "Car select",
    kicker: classes.find((c) => c.id === activeClass)?.name ?? "",
    specRows: rows,
    chart,
    preview,
    sections: [
      {
        id: "k-classes", kind: "tabs", region: "nav", heading: "Class",
        items: classes.map((c) => ({
          id: "k-cls-" + c.id, kind: "tab", label: c.name, action: "selectClass",
          value: c.id, selected: c.id === activeClass, sub: c.blurb,
        })),
      },
      {
        id: "k-cars", kind: "grid", region: "main", heading: "Cars",
        items: cars.map((c) => ({
          id: "k-car-" + c.id, kind: "button", label: c.name, action: "selectCar",
          value: c.id, selected: c.id === selected?.id,
          sub: `${formatUnit("power", specValue(c, "power"), units, 0)} · ${DRIVETRAIN_LABEL[String(c.drivetrain).toLowerCase()] ?? c.drivetrain}`,
          blurb: c.blurb ?? "",
        })),
      },
      {
        id: "k-spec", kind: "table", region: "aside", heading: "Specification",
        columns: ["", ...cars.map((c) => c.name)],
        items: rows.map((row) => ({
          id: "k-spec-" + row.key,
          kind: "row",
          cells: [row.label, ...row.cells.map((c) => c.text)],
          bars: row.cells.map((c) => c.frac),
          best: row.cells.map((c) => c.best),
        })),
      },
      {
        id: "k-chart", kind: "chart", region: "aside", heading: "Torque and power",
        items: [{ id: "k-torque", kind: "chart", label: "Torque and power", chart }],
      },
      {
        id: "k-livery", kind: "panel", region: "aside", heading: "Livery",
        items: [
          { id: "k-preview", kind: "livery", label: "Livery preview", preview },
          ...LIVERIES.map((l) => ({
            id: "k-liv-" + l.id, kind: "swatch", label: l.name, action: "selectLivery",
            value: l.id, selected: l.id === liveryId, colour: l.base, accent: l.stripe,
          })),
          {
            id: "k-number", kind: "number", label: "Competition number", action: "selectNumber",
            value: number, min: 1, max: 999, step: 1,
          },
        ],
      },
      {
        id: "k-actions", kind: "panel", region: "footer",
        items: [
          btn("k-confirm", "Confirm car", "confirmCar", { primary: true, value: selected?.id, disabled: !selected }),
          btn("k-back", "Back", "back"),
        ],
      },
    ],
  };
}

// The service park is a budget problem, not a shopping list: the model computes
// what a chosen repair set costs and what leaving the rest actually does.
export function serviceBudget(damage, chosenIds, budgetMin) {
  const chosen = new Set(chosenIds ?? []);
  let used = 0;
  let untouched = 0;
  let worstUnfixed = null;
  for (const row of damage ?? []) {
    if (chosen.has(row.id)) used += row.repairMin ?? 0;
    else {
      untouched += 1;
      if (!worstUnfixed || (row.severity ?? 0) > (worstUnfixed.severity ?? 0)) worstUnfixed = row;
    }
  }
  const budget = budgetMin ?? 0;
  const over = Math.max(0, used - budget);
  return {
    used: round(used, 2),
    budget,
    remaining: round(Math.max(0, budget - used), 2),
    over: round(over, 2),
    // Running over service time is allowed; it is paid for on the clock.
    penaltyMs: Math.round(over * 10000),
    untouched,
    worstUnfixed,
    fraction: budget > 0 ? saturate(used / budget) : (used > 0 ? 1 : 0),
  };
}

export function buildServiceModel(data = {}) {
  const damage = data.damage ?? [];
  const chosen = data.repairChoices ?? [];
  const budget = serviceBudget(damage, chosen, data.repairBudgetMin ?? 30);
  return {
    screen: "service",
    title: "Service park",
    kicker: `${budget.budget} minutes with the crew`,
    budget,
    sections: [
      {
        // The allowance belongs beside the list it constrains, not stacked above
        // it: every toggle in `v-list` is read against this bar.
        id: "v-budget", kind: "panel", region: "aside", heading: "Time budget",
        items: [
          { id: "v-bar", kind: "bar", label: "Service time used", value: budget.fraction, text: `${budget.used} / ${budget.budget} min` },
          {
            id: "v-penalty", kind: "note", label: "Over-run",
            value: budget.over > 0
              ? `${budget.over} minutes over. That is a ${formatTime(budget.penaltyMs, { forceMinutes: false })} penalty on the next stage.`
              : "Inside the allowance.",
            tone: budget.over > 0 ? "loss" : "level",
          },
        ],
      },
      {
        id: "v-list", kind: "list", region: "main", heading: "Damage",
        items: damage.map((row) => ({
          id: "v-fix-" + row.id,
          kind: "toggle",
          label: row.part,
          action: "toggleRepair",
          value: chosen.includes(row.id),
          severity: saturate(row.severity ?? 0),
          cost: row.repairMin ?? 0,
          help: chosen.includes(row.id)
            ? `${row.repairMin ?? 0} min of the allowance.`
            : `Left as is: ${row.effect ?? "handling will suffer."}`,
        })),
      },
      {
        id: "v-actions", kind: "panel", region: "footer",
        items: [
          btn("v-confirm", "Send it out", "confirmRepairs", { primary: true }),
          btn("v-all", "Fix everything", "repairAll", { disabled: damage.length === 0 }),
          btn("v-none", "Fix nothing", "repairNone", { disabled: chosen.length === 0 }),
        ],
      },
    ],
  };
}

export function buildSettingsModel(data = {}) {
  const settings = applySettings(data.settings, {});
  const activeId = SETTINGS_SCHEMA.some((g) => g.id === data.settingsGroup) ? data.settingsGroup : SETTINGS_SCHEMA[0].id;
  const group = SETTINGS_SCHEMA.find((g) => g.id === activeId);
  const fields = group.fields.map((f) => ({
    id: "g-" + f.key,
    kind: f.kind,
    label: f.label,
    help: f.help,
    action: "setSetting",
    value: settings[f.key],
    options: f.options,
    min: f.min, max: f.max, step: f.step,
    format: f.format,
    key: f.key,
  }));
  const sections = [
    {
      id: "g-tabs", kind: "tabs", region: "nav", heading: "Settings",
      items: SETTINGS_SCHEMA.map((g) => ({
        id: "g-tab-" + g.id, kind: "tab", label: g.label, action: "selectSettingsGroup",
        value: g.id, selected: g.id === activeId,
      })),
    },
    { id: "g-fields", kind: "fields", region: "main", heading: group.label, items: fields },
  ];
  if (activeId === "controls") {
    const binds = cloneBinds(settings.keybinds);
    sections.push({
      id: "g-keys", kind: "keys", region: "main", heading: "Keyboard",
      items: ACTIONS.flatMap((a) => [0, 1].map((slot) => ({
        id: `g-key-${a.id}-${slot}`,
        kind: "key",
        label: slot === 0 ? a.label : a.label + " (alt)",
        action: "rebind",
        value: binds[a.id][slot],
        text: keyLabel(binds[a.id][slot]),
        bindAction: a.id,
        slot,
        group: a.group,
      }))),
    });
    const pad = data.pad ?? null;
    sections.push({
      id: "g-pad", kind: "panel", region: "aside", heading: "Gamepad",
      items: [
        { id: "g-pad-status", kind: "text", label: "Detected", value: pad?.connected ? (pad.id || "Gamepad") : "None connected" },
        { id: "g-pad-steer", kind: "bar", label: "Steer", value: (pad?.steer ?? 0) * 0.5 + 0.5, text: (pad?.steer ?? 0).toFixed(2), bipolar: true },
        { id: "g-pad-thr", kind: "bar", label: "Throttle", value: pad?.throttle ?? 0, text: (pad?.throttle ?? 0).toFixed(2) },
        { id: "g-pad-brk", kind: "bar", label: "Brake", value: pad?.brake ?? 0, text: (pad?.brake ?? 0).toFixed(2) },
        btn("g-pad-cal", data.calibrating ? "Sweep the stick, then release…" : "Calibrate steering axis", "calibrate", { disabled: !pad?.connected }),
      ],
    });
  }
  sections.push({
    id: "g-actions", kind: "panel", region: "footer",
    items: [
      btn("g-done", "Done", "closeSettings", { primary: true }),
      btn("g-reset", "Reset this group", "resetSettingsGroup", { value: activeId }),
    ],
  });
  return { screen: "settings", title: "Settings", kicker: group.label, settings, activeGroup: activeId, sections };
}

export function buildPauseModel(data = {}) {
  return {
    screen: "pause",
    title: "Paused",
    kicker: data.stage?.name ?? "",
    sections: [
      {
        id: "p-menu", kind: "menu", region: "dialog", heading: "Paused",
        items: [
          btn("p-resume", "Resume", "resume", { primary: true }),
          btn("p-restart", "Restart stage", "restartStage"),
          btn("p-settings", "Settings", "openSettings"),
          btn("p-notes", "Repeat last note", "repeatNote"),
          btn("p-retire", "Retire from stage", "retire", { danger: true }),
        ],
      },
    ],
  };
}

export function buildResultsModel(data = {}) {
  const res = data.results ?? {};
  const splits = res.splits ?? [];
  const chart = buildDeltaChart(splits, { width: 340, height: 120 });
  const prevRows = [];
  let prevTime = 0;
  for (let i = 0; i < splits.length; i += 1) {
    const seg = (splits[i].timeMs ?? 0) - prevTime;
    prevTime = splits[i].timeMs ?? prevTime;
    prevRows.push({
      id: "r-split-" + i,
      kind: "row",
      cells: [splits[i].label ?? `Split ${i + 1}`, formatTime(seg), formatTime(splits[i].timeMs), formatDelta(splits[i].deltaMs)],
      tone: deltaTone(splits[i].deltaMs),
    });
  }
  return {
    screen: "results",
    title: res.stageName ?? "Stage result",
    kicker: `${ordinal(res.position)} on stage`,
    chart,
    sections: [
      {
        id: "r-head", kind: "panel", region: "nav", heading: "Result",
        items: [
          { id: "r-total", kind: "stat", label: "Stage time", value: formatTime(res.totalMs) },
          { id: "r-pos", kind: "stat", label: "Position", value: ordinal(res.position) },
          { id: "r-pen", kind: "stat", label: "Penalties", value: res.penaltiesMs ? formatTime(res.penaltiesMs, { forceMinutes: false }) : "None" },
          { id: "r-clean", kind: "stat", label: "Run", value: res.cleanRun ? "Clean" : "Contact" },
        ],
      },
      {
        id: "r-splits", kind: "table", region: "main", heading: "Split by split",
        columns: ["Split", "Segment", "Elapsed", "Delta"],
        items: prevRows,
      },
      {
        id: "r-chart", kind: "chart", region: "aside", heading: "Delta to personal best",
        items: [{ id: "r-delta", kind: "delta", label: "Delta chart", chart }],
      },
      {
        id: "r-actions", kind: "panel", region: "footer",
        items: [
          btn("r-next", data.hasNextStage ? "Next stage" : "Championship", data.hasNextStage ? "nextStage" : "championship", { primary: true }),
          // A championship stage is on the timing sheet the moment it is
          // finished, so re-driving it would put a second time against it.
          btn("r-retry", "Retry stage", "restartStage", { disabled: !!data.noRetry }),
          btn("r-replay", "Watch replay", "replay", { disabled: !data.hasReplay }),
        ],
      },
    ],
  };
}

export function buildSeasonModel(data = {}) {
  const season = data.season ?? {};
  const podium = season.podium ?? [];
  const ordered = podium.slice().sort((a, b) => (a.position ?? 9) - (b.position ?? 9));
  return {
    screen: "season",
    title: season.title ?? "Championship result",
    kicker: ordered.find((p) => p.isPlayer) ? `${ordinal(ordered.find((p) => p.isPlayer).position)} overall` : "",
    sections: [
      {
        id: "n-podium", kind: "podium", region: "main", heading: "Podium",
        // Rendered 2-1-3 so the winner stands in the middle; the delay drives the
        // staggered rise animation.
        items: podium.map((p, i) => ({
          id: "n-pod-" + i,
          kind: "podiumStep",
          label: p.name,
          sub: p.team ?? "",
          position: p.position,
          points: p.points ?? 0,
          highlight: !!p.isPlayer,
          delay: 120 + i * 160,
          height: p.position === 1 ? 1 : p.position === 2 ? 0.78 : 0.62,
        })),
      },
      {
        id: "n-table", kind: "table", region: "aside", heading: "Final standings",
        // The podium is three steps by definition; the table is everyone. Reading
        // both off `podium` meant a season ended with a three-driver championship.
        columns: ["", "Driver", "Pts"],
        items: (season.standings ?? ordered).map((p, i) => ({
          id: "n-row-" + i,
          kind: "row",
          cells: [String(p.position ?? i + 1), p.name, String(p.points ?? 0)],
          highlight: !!p.isPlayer,
        })),
      },
      {
        id: "n-actions", kind: "panel", region: "footer",
        items: [
          btn("n-continue", "Continue", "newSeason", { primary: true }),
          btn("n-title", "Main menu", "title"),
        ],
      },
    ],
  };
}

// Three sentences, one technique each. Anything longer does not get read.
export const TUTORIAL_STEPS = Object.freeze([
  {
    id: "flick",
    title: "The flick",
    body: "Before a tight corner, steer briefly the wrong way and lift — the car's weight swings out and the rear comes round for you.",
  },
  {
    id: "handbrake",
    title: "The handbrake turn",
    body: "For a hairpin, brake in a straight line first, then pull the handbrake for a beat while you turn in and stay on the throttle through the pivot.",
  },
  {
    id: "leftfoot",
    title: "Left-foot braking",
    body: "Keep the throttle open and dab the brake with your other foot mid-corner: the nose tucks in without the turbo dropping off boost.",
  },
]);

export function buildTutorialModel(data = {}) {
  return {
    screen: "tutorial",
    title: "How to drive",
    kicker: "Three techniques and you are quicker than the assists",
    sections: [
      {
        id: "h-steps", kind: "notes", region: "dialog", heading: "How to drive",
        items: TUTORIAL_STEPS.map((s) => ({
          id: "h-" + s.id, kind: "note", label: s.title, value: s.body,
        })),
      },
      {
        id: "h-actions", kind: "panel", region: "dialog",
        items: [
          btn("h-ok", "Got it", "closeTutorial", { primary: true }),
          btn("h-controls", "See the controls", "openSettings", { value: "controls" }),
        ],
      },
    ],
  };
}

export function buildLoadingModel(data = {}) {
  return {
    screen: "loading",
    title: data.loadingTitle ?? "Building stage",
    kicker: data.loadingDetail ?? "",
    sections: [
      {
        id: "l-panel", kind: "panel", region: "dialog", heading: "Loading",
        items: [
          { id: "l-bar", kind: "bar", label: "Progress", value: saturate(data.progress ?? 0), text: `${Math.round(saturate(data.progress ?? 0) * 100)}%` },
          { id: "l-note", kind: "note", label: "Recce", value: data.stage?.notes ?? "" },
        ],
      },
    ],
  };
}

export const SCREEN_BUILDERS = Object.freeze({
  title: buildTitleModel,
  championship: buildChampionshipModel,
  stage: buildStageModel,
  car: buildCarModel,
  service: buildServiceModel,
  settings: buildSettingsModel,
  pause: buildPauseModel,
  results: buildResultsModel,
  season: buildSeasonModel,
  tutorial: buildTutorialModel,
  loading: buildLoadingModel,
});

export const SCREENS = Object.freeze(Object.keys(SCREEN_BUILDERS));

export function buildScreenModel(screen, data) {
  const fn = SCREEN_BUILDERS[screen];
  if (!fn) throw new Error(`ui: unknown screen "${screen}"`);
  return fn(data ?? {});
}

const STYLE_ID = "or-ui-style";

function tokenBlock() {
  let css = ".or-ui{";
  for (const [k, v] of Object.entries(BRAND.colour)) css += "--or-" + k + ":" + v + ";";
  for (const [k, v] of Object.entries(BRAND.type)) css += "--or-t-" + k + ":" + v + "px;";
  for (const [k, v] of Object.entries(BRAND.space)) css += "--or-s-" + k + ":" + v + "px;";
  css += "--or-skew:" + BRAND.skewDeg + "deg;";
  css += "--or-font-ui:" + BRAND.fontUi + ";";
  css += "--or-font-num:" + BRAND.fontNum + ";";
  css += "--or-safe:" + SAFE_INSET + "px;";
  css += "--or-topbar:" + TOPBAR_H + "px;";
  css += "}";
  return css;
}

const BASE_CSS = `
.or-ui{position:absolute;inset:0;z-index:20;font-family:var(--or-font-ui);color:var(--or-ink);
 font-size:var(--or-t-body);line-height:1.45;-webkit-font-smoothing:antialiased;
 background:radial-gradient(120% 90% at 78% 8%,#182029 0%,var(--or-void) 62%);
 display:flex;flex-direction:column;overflow:hidden;contain:layout paint;}
.or-ui *{box-sizing:border-box;}
.or-ui.or-hidden{display:none;}
.or-ui button,.or-ui input,.or-ui select{font:inherit;color:inherit;}
.or-ui :focus{outline:none;}
.or-ui :focus-visible{outline:2px solid var(--or-flare);outline-offset:3px;border-radius:2px;}

.or-topbar{flex:0 0 auto;height:var(--or-topbar);padding-left:var(--or-safe);padding-right:var(--or-s-md);
 display:flex;align-items:center;gap:var(--or-s-md);border-bottom:1px solid var(--or-line);
 background:linear-gradient(180deg,rgba(255,255,255,.03),transparent);}
.or-brandline{display:flex;align-items:baseline;gap:var(--or-s-sm);min-width:0;}
.or-brandline h1{margin:0;font-size:var(--or-t-lead);letter-spacing:.14em;text-transform:uppercase;font-weight:700;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.or-kicker{color:var(--or-mute);font-size:var(--or-t-small);letter-spacing:.10em;text-transform:uppercase;
 white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.or-topbar-end{margin-left:auto;display:flex;gap:var(--or-s-xs);align-items:center;}

.or-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;
 padding:var(--or-s-md) var(--or-s-md) var(--or-s-sm);scrollbar-width:thin;}
/* The two-column layout hangs off .or-cols, not off .or-body: render() swaps in
   one detached .or-screen wrapper, so any child selector rooted at .or-body is a
   selector that can never match. */
.or-screen{display:grid;gap:var(--or-s-md);align-content:start;}
.or-cols{display:grid;gap:var(--or-s-md);grid-template-columns:minmax(0,1fr);align-items:start;}
.or-col{display:grid;gap:var(--or-s-md);align-content:start;min-width:0;}
.or-col-main{gap:var(--or-s-md);}
/* Panels stacked in the sidebar read as one unit, so they sit tighter than the
   sections in the main column, which are separate subjects. */
.or-col-aside{gap:var(--or-s-sm);}
@media (min-width:900px){
 .or-cols[data-or-cols="2"]{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);}
}
.or-footer{flex:0 0 auto;padding:var(--or-s-sm) var(--or-s-md);border-top:1px solid var(--or-line);
 display:flex;flex-wrap:wrap;gap:var(--or-s-md);align-items:center;background:rgba(0,0,0,.35);}
.or-footer .or-section{flex:1 1 auto;}
.or-footer .or-list,.or-lane-nav .or-list{display:flex;flex-wrap:wrap;gap:var(--or-s-lg);align-items:center;}
.or-footer .or-stat,.or-lane-nav .or-stat{display:grid;gap:0;padding:0;border-bottom:none;min-width:0;}
.or-footer .or-stat .or-stat-v,.or-lane-nav .or-stat .or-stat-v{font-size:var(--or-t-lead);line-height:1.2;}
.or-footer .or-btn,.or-lane-nav .or-list .or-btn{width:auto;}
/* A screen with no footer sections still gets the bar, and an empty bordered
   strip across the bottom reads as a layout that did not finish loading. */
.or-footer:empty{display:none;}

.or-section{min-width:0;}
.or-section>h2{margin:0 0 var(--or-s-xs);font-size:var(--or-t-small);letter-spacing:.18em;text-transform:uppercase;
 color:var(--or-mute);font-weight:600;display:flex;align-items:center;gap:var(--or-s-xs);}
.or-section>h2::after{content:"";flex:1 1 auto;height:1px;background:var(--or-line);}

.or-btn{position:relative;display:flex;align-items:center;gap:var(--or-s-sm);width:100%;
 padding:12px 16px;background:var(--or-panel);border:1px solid var(--or-line);border-radius:2px;
 text-align:left;cursor:pointer;transition:background .16s ease,border-color .16s ease,transform .16s ease;
 font-size:var(--or-t-body);}
.or-btn::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:transparent;
 transform:skewX(var(--or-skew));transition:background .16s ease;}
.or-btn:hover{background:var(--or-panelHi);border-color:#3a4452;}
.or-btn:hover::before,.or-btn[aria-current="true"]::before,.or-btn.or-primary::before{background:var(--or-flare);}
.or-btn[disabled]{opacity:.42;cursor:not-allowed;}
.or-btn.or-primary{background:linear-gradient(90deg,rgba(255,90,20,.18),var(--or-panel) 60%);border-color:#5a3220;}
.or-btn.or-danger:hover{border-color:var(--or-crimson);}
.or-btn .or-btn-label{flex:1 1 auto;min-width:0;}
.or-btn .or-btn-sub{display:block;color:var(--or-mute);font-size:var(--or-t-small);}
.or-btn .or-badge{flex:0 0 auto;font-family:var(--or-font-num);font-size:var(--or-t-micro);
 letter-spacing:.10em;text-transform:uppercase;color:var(--or-sodium);}
.or-menu{display:grid;gap:var(--or-s-xs);max-width:520px;}

.or-tabs{display:flex;flex-wrap:wrap;gap:6px;}
.or-tab{padding:8px 18px;background:transparent;border:1px solid var(--or-line);border-radius:2px;
 cursor:pointer;font-size:var(--or-t-small);letter-spacing:.10em;text-transform:uppercase;color:var(--or-mute);
 transform:skewX(var(--or-skew));transition:color .16s ease,background .16s ease,border-color .16s ease;}
.or-tab>span{display:inline-block;transform:skewX(calc(-1 * var(--or-skew)));}
.or-tab[aria-selected="true"]{background:var(--or-flare);border-color:var(--or-flare);color:#150802;font-weight:700;}
.or-tab:hover{color:var(--or-ink);}

.or-grid{display:grid;gap:var(--or-s-xs);grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr));}
.or-list{display:grid;gap:var(--or-s-xs);}
.or-stat{display:flex;justify-content:space-between;align-items:baseline;gap:var(--or-s-sm);
 padding:8px 0;border-bottom:1px solid var(--or-line);}
/* Spans, not a definition list: renderItem emits .or-stat-k / .or-stat-v, so the
   styling has to name those and not dt/dd. */
.or-stat-k{color:var(--or-mute);font-size:var(--or-t-micro);letter-spacing:.14em;
 text-transform:uppercase;white-space:nowrap;}
.or-stat-v{font-family:var(--or-font-num);font-variant-numeric:tabular-nums;text-align:right;
 min-width:0;overflow:hidden;text-overflow:ellipsis;}
.or-note{padding:10px 12px;border-left:3px solid var(--or-line);color:var(--or-mute);font-size:var(--or-t-small);}
.or-note strong{display:block;color:var(--or-ink);font-size:var(--or-t-body);margin-bottom:2px;}
.or-note.or-loss{border-left-color:var(--or-crimson);}
.or-note.or-gain{border-left-color:var(--or-mint);}

.or-table{width:100%;overflow-x:auto;}
.or-table table{width:100%;border-collapse:collapse;font-size:var(--or-t-small);}
.or-table th{text-align:left;color:var(--or-mute);font-weight:600;letter-spacing:.10em;text-transform:uppercase;
 font-size:var(--or-t-micro);padding:6px 8px;border-bottom:1px solid var(--or-line);white-space:nowrap;}
.or-table td{padding:7px 8px;border-bottom:1px solid rgba(39,46,56,.6);font-variant-numeric:tabular-nums;}
.or-table td:not(:first-child){font-family:var(--or-font-num);}
.or-table tr.or-highlight td{background:rgba(255,90,20,.10);}
.or-table td.or-gain{color:var(--or-mint);} .or-table td.or-loss{color:var(--or-crimson);}
.or-table td.or-best{color:var(--or-sodium);}
.or-bar-cell{position:relative;}
.or-bar-cell i{position:absolute;left:0;bottom:0;height:2px;background:var(--or-flare);opacity:.8;}

.or-bar{display:grid;gap:4px;}
.or-bar .or-bar-head{display:flex;justify-content:space-between;font-size:var(--or-t-small);color:var(--or-mute);}
.or-bar .or-bar-track{height:10px;background:#0a0d11;border:1px solid var(--or-line);overflow:hidden;}
.or-bar .or-bar-fill{height:100%;background:linear-gradient(90deg,var(--or-flare),var(--or-sodium));
 transform-origin:left center;transition:width .22s cubic-bezier(.2,.7,.3,1);}

.or-fields{display:grid;}
.or-chartbox,.or-routebox{display:grid;gap:var(--or-s-xs);}
.or-field{display:grid;gap:4px;padding:10px 0;border-bottom:1px solid rgba(39,46,56,.7);}
.or-field-head{display:flex;justify-content:space-between;align-items:center;gap:var(--or-s-sm);}
.or-field-head label{font-weight:600;}
.or-field-value{font-family:var(--or-font-num);color:var(--or-sodium);font-variant-numeric:tabular-nums;}
.or-field-help{color:var(--or-mute);font-size:var(--or-t-small);}
.or-field input[type="range"]{width:100%;accent-color:var(--or-flare);}
.or-switch{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--or-line);
 background:var(--or-panel);cursor:pointer;border-radius:2px;font-size:var(--or-t-small);letter-spacing:.08em;
 text-transform:uppercase;}
.or-switch[aria-checked="true"]{border-color:var(--or-flare);color:var(--or-ink);}
.or-switch i{width:26px;height:12px;background:#0a0d11;border:1px solid var(--or-line);position:relative;display:block;}
.or-switch i::after{content:"";position:absolute;top:0;left:0;width:12px;height:10px;background:var(--or-faint);
 transition:transform .16s ease,background .16s ease;}
.or-switch[aria-checked="true"] i::after{transform:translateX(12px);background:var(--or-flare);}
.or-enum{display:flex;flex-wrap:wrap;gap:4px;}
.or-opt{padding:5px 12px;border:1px solid var(--or-line);background:transparent;cursor:pointer;
 font-size:var(--or-t-small);color:var(--or-mute);border-radius:2px;}
.or-opt[aria-pressed="true"]{background:var(--or-panelHi);color:var(--or-ink);border-color:var(--or-flare);}
.or-keys{display:grid;gap:2px;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));}
.or-key{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;
 border:1px solid var(--or-line);background:var(--or-panel);cursor:pointer;border-radius:2px;font-size:var(--or-t-small);}
.or-key kbd{font-family:var(--or-font-num);background:#0a0d11;border:1px solid var(--or-line);
 padding:2px 8px;min-width:44px;text-align:center;color:var(--or-sodium);}
.or-key.or-listening kbd{color:var(--or-flare);border-color:var(--or-flare);}
.or-swatches{display:flex;flex-wrap:wrap;gap:6px;}
.or-swatch{width:44px;height:28px;border:1px solid var(--or-line);cursor:pointer;position:relative;padding:0;border-radius:2px;}
.or-swatch[aria-pressed="true"]{outline:2px solid var(--or-flare);outline-offset:2px;}
.or-swatch i{position:absolute;top:0;bottom:0;left:55%;width:20%;transform:skewX(var(--or-skew));}
.or-number{display:flex;align-items:center;gap:8px;}
.or-number input{width:88px;padding:6px 8px;background:#0a0d11;border:1px solid var(--or-line);
 font-family:var(--or-font-num);text-align:center;border-radius:2px;}

.or-map{position:relative;aspect-ratio:16/9;min-height:180px;border:1px solid var(--or-line);
 background:repeating-linear-gradient(var(--or-skew),rgba(255,255,255,.02) 0 2px,transparent 2px 12px),var(--or-graphite);}
.or-node{position:absolute;transform:translate(-50%,-50%);display:grid;gap:2px;justify-items:center;
 padding:6px 10px;background:rgba(12,15,19,.86);border:1px solid var(--or-line);cursor:pointer;
 font-size:var(--or-t-small);border-radius:2px;text-align:center;
 /* Wraps, and never wider than half the map: five pins on a 366 px phone plate
    have to share it, and a nowrap label is as wide as the rally is named. */
 max-width:min(50%,190px);}
.or-node[data-status="next"]{border-color:var(--or-flare);box-shadow:0 0 0 1px rgba(255,90,20,.35);}
.or-node[data-status="locked"]{opacity:.5;cursor:default;}
.or-node small{color:var(--or-mute);font-size:var(--or-t-micro);}

.or-figure{border:1px solid var(--or-line);background:var(--or-graphite);padding:6px;}
.or-figure svg{display:block;width:100%;height:auto;}
.or-route-line{fill:none;stroke:var(--or-ink);stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round;}
.or-route-shadow{fill:none;stroke:#000;stroke-width:6;opacity:.55;stroke-linejoin:round;stroke-linecap:round;}
.or-route-split{fill:var(--or-sodium);}
.or-route-start{fill:var(--or-mint);} .or-route-finish{fill:var(--or-flare);}
.or-chart-torque{fill:none;stroke:var(--or-flare);stroke-width:2;}
.or-chart-power{fill:none;stroke:var(--or-mint);stroke-width:1.6;stroke-dasharray:4 3;}
.or-chart-axis{stroke:var(--or-line);stroke-width:1;}
.or-delta-line{fill:none;stroke:var(--or-ink);stroke-width:2;}
.or-delta-zero{stroke:var(--or-faint);stroke-width:1;stroke-dasharray:3 3;}
.or-delta-bar-gain{stroke:var(--or-mint);stroke-width:5;opacity:.55;}
.or-delta-bar-loss{stroke:var(--or-crimson);stroke-width:5;opacity:.55;}
.or-mark-primary{fill:none;stroke:var(--or-ink);}
.or-mark-sub{fill:none;stroke:var(--or-flare);}
.or-mark-motif{fill:var(--or-flare);stroke:none;}
.or-wordmark{display:block;width:min(72vw,420px);}
.or-wordmark svg{display:block;width:100%;height:auto;}
.or-brandbox{display:grid;gap:var(--or-s-xs);justify-items:start;}

/* The next-event dossier: one panel, one focal point. The rake down the left is
   the wordmark's chicane at panel scale, so the card reads as part of the mark. */
.or-hero{position:relative;display:grid;gap:var(--or-s-xs);padding:var(--or-s-sm) var(--or-s-md);
 overflow:hidden;border:1px solid var(--or-line);border-left:3px solid var(--or-flare);
 background:linear-gradient(157deg,var(--or-panelHi),var(--or-graphite) 46%,var(--or-void));}
/* The chicane, kept short: skewX shifts the top edge by tan(18°) x height, so a
   full-height rake would lean across the headline rather than beside it. */
.or-hero::before{content:"";position:absolute;left:0;top:0;width:34%;height:4px;
 background:var(--or-flare);transform:skewX(var(--or-skew));}
.or-hero::after{content:"";position:absolute;right:-30%;top:-40%;width:80%;height:120%;
 background:radial-gradient(closest-side,rgba(255,90,20,.13),transparent);pointer-events:none;}
.or-hero>*{position:relative;}
/* The map keeps its own aspect and CSS bounds only its height, so a tall stage
   stays a tall stage instead of being squashed to the panel's width. */
.or-hero .or-figure{display:grid;justify-items:center;background:var(--or-void);}
.or-hero .or-figure svg{width:auto;max-width:100%;height:min(22vh,190px);}
.or-hero figcaption{justify-self:start;}
.or-eyebrow{display:flex;flex-wrap:wrap;gap:var(--or-s-xs);align-items:baseline;
 font-size:var(--or-t-micro);letter-spacing:.24em;text-transform:uppercase;color:var(--or-flare);}
.or-eyebrow-k{font-weight:700;}
.or-eyebrow-v{color:var(--or-mute);letter-spacing:.16em;}
.or-headline h3{margin:0;font-size:var(--or-t-h2);line-height:1.04;font-weight:700;letter-spacing:-.01em;}
.or-headline p{margin:4px 0 0;color:var(--or-mute);font-size:var(--or-t-small);
 letter-spacing:.12em;text-transform:uppercase;}
/* Content-sized, not equal thirds: a three-word conditions string in a 1fr track
   wraps onto a second line and drags the whole row's baseline with it. */
.or-statrow{display:flex;flex-wrap:wrap;justify-content:space-between;gap:var(--or-s-xs) var(--or-s-md);
 padding:6px 0;border-top:1px solid var(--or-line);border-bottom:1px solid var(--or-line);}
.or-statcell{display:grid;gap:1px;min-width:0;}
.or-statcell .or-stat-k{white-space:normal;}
.or-statcell .or-stat-v{font-size:var(--or-t-lead);color:var(--or-ink);text-align:left;line-height:1.15;}
.or-standings{list-style:none;margin:0;padding:0;display:grid;gap:2px;}
.or-standing{position:relative;display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:var(--or-s-xs);
 align-items:baseline;padding:4px 9px;background:rgba(255,255,255,.025);overflow:hidden;}
.or-standing>i{position:absolute;left:0;bottom:0;height:2px;background:var(--or-faint);opacity:.7;}
.or-standing.or-highlight{background:rgba(255,90,20,.13);}
.or-standing.or-highlight>i{background:var(--or-flare);opacity:1;}
.or-standing-pos{font-family:var(--or-font-num);font-size:var(--or-t-small);color:var(--or-faint);}
.or-standing.or-highlight .or-standing-pos{color:var(--or-flare);}
/* One line per driver: the board is a glance, and a two-line row costs five
   rows' worth of height the panel does not have at 720p. */
.or-standing-who{display:flex;align-items:baseline;gap:var(--or-s-xs);min-width:0;}
.or-standing-who b{font-size:var(--or-t-small);font-weight:600;white-space:nowrap;}
.or-standing-who small{font-size:var(--or-t-micro);color:var(--or-mute);overflow:hidden;
 text-overflow:ellipsis;white-space:nowrap;}
.or-standing-pts{font-family:var(--or-font-num);font-variant-numeric:tabular-nums;color:var(--or-sodium);}
.or-figure figcaption{margin:6px 2px 0;color:var(--or-mute);font-size:var(--or-t-micro);
 letter-spacing:.14em;text-transform:uppercase;}
.or-chips{display:flex;flex-wrap:wrap;gap:4px;}
.or-chip{display:flex;align-items:baseline;gap:6px;padding:4px 10px;border:1px solid var(--or-line);
 border-radius:2px;font-size:var(--or-t-micro);letter-spacing:.08em;text-transform:uppercase;
 color:var(--or-faint);background:rgba(0,0,0,.35);}
.or-chip[data-status="done"]{color:var(--or-mute);border-color:#39434f;}
.or-chip[data-status="next"]{color:var(--or-ink);border-color:var(--or-flare);
 background:linear-gradient(90deg,rgba(255,90,20,.22),rgba(0,0,0,.35));}
.or-chip-k{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:18ch;}
.or-chip-v{font-family:var(--or-font-num);color:var(--or-sodium);}
.or-chip[data-status="locked"] .or-chip-v{color:var(--or-faint);}

/* The title screen carries seven menu items and a wordmark in one column, which
   at 720p is 30px more than the body has. Everything below buys that back. */
[data-or-screen="title"] .or-menu{gap:6px;max-width:none;}
[data-or-screen="title"] .or-menu .or-btn{padding:8px 16px;}
[data-or-screen="title"] .or-wordmark{width:min(88%,300px);}
[data-or-screen="title"] .or-hero{min-height:100%;align-content:start;}
@media (min-width:900px){
 [data-or-screen="title"] .or-cols[data-or-cols="2"]{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);}
 /* The map is portrait and the readouts are landscape, so side by side is the
    only arrangement in which either is full size. Stacked, the map's own aspect
    left two thirds of a full-width plate empty. */
 [data-or-screen="title"] .or-hero{column-gap:var(--or-s-md);align-items:start;
  grid-template-columns:auto minmax(0,1fr);
  grid-template-rows:auto auto min-content 1fr auto;
  grid-template-areas:"eyebrow eyebrow" "head head" "map stats" "map board" "cal cal";}
 [data-or-screen="title"] .or-hero>.or-eyebrow{grid-area:eyebrow;}
 [data-or-screen="title"] .or-hero>.or-headline{grid-area:head;margin-bottom:var(--or-s-xs);}
 [data-or-screen="title"] .or-hero>.or-figure{grid-area:map;}
 [data-or-screen="title"] .or-hero>.or-statrow{grid-area:stats;margin-top:0;}
 [data-or-screen="title"] .or-hero>.or-standings{grid-area:board;align-self:start;}
 [data-or-screen="title"] .or-hero>.or-chips{grid-area:cal;margin-top:var(--or-s-xs);}
 /* The map column is auto-sized, so an east-west stage would size its own track:
    the cap is what stops a wide route pushing the readouts off the card. */
 [data-or-screen="title"] .or-hero .or-figure svg{height:min(32vh,270px);max-width:min(100%,320px);}
 [data-or-screen="title"] .or-headline h3{font-size:var(--or-t-h1);}
}

/* The title screen is the only one the game runs BEHIND: game.js leaves a stage
   in the renderer and hands it to the same pure-pursuit autopilot the
   screenshot tool uses, so this shell sits over a moving road. The scrim is
   heaviest where the type is and thinnest where the picture is, and every
   element that carries text already paints its own background, so nothing here
   is relying on the scrim alone for contrast. */
.or-ui[data-or-active="title"]{background:
 linear-gradient(186deg,rgba(6,8,11,.92) 0%,rgba(6,8,11,.72) 34%,rgba(6,8,11,.52) 68%,rgba(6,8,11,.88) 100%);}
.or-ui[data-or-active="title"] .or-topbar{background:linear-gradient(180deg,rgba(6,8,11,.88),rgba(6,8,11,.10));}
.or-ui[data-or-active="title"] .or-footer{background:rgba(6,8,11,.82);}
.or-ui[data-or-active="title"] .or-hero{
 background:linear-gradient(157deg,rgba(26,33,42,.90),rgba(17,22,28,.84) 46%,rgba(8,10,13,.80));}
.or-ui[data-or-active="title"] .or-hero .or-figure{background:rgba(6,8,11,.72);}
.or-ui[data-or-active="title"] .or-btn{background:rgba(19,24,31,.90);}
.or-ui[data-or-active="title"] .or-btn:hover{background:rgba(31,38,48,.94);}
.or-ui[data-or-active="title"] .or-btn.or-primary{
 background:linear-gradient(90deg,rgba(255,90,20,.30),rgba(19,24,31,.92) 62%);}
@media (min-width:900px){
 /* Two columns: the shell is on the left, so the picture is uncovered on the
    right and the scrim rakes across rather than down. */
 .or-ui[data-or-active="title"]{background:
  linear-gradient(101deg,rgba(6,8,11,.94) 0%,rgba(6,8,11,.86) 34%,rgba(6,8,11,.46) 70%,rgba(6,8,11,.22) 100%);}
}

.or-podium{display:flex;align-items:flex-end;justify-content:center;gap:var(--or-s-sm);min-height:220px;}
.or-step{flex:1 1 0;max-width:180px;display:grid;gap:6px;justify-items:center;align-content:end;
 padding:10px;background:var(--or-panel);border:1px solid var(--or-line);border-top:3px solid var(--or-flare);
 animation:or-rise .62s cubic-bezier(.16,.84,.28,1) both;}
.or-step b{font-size:var(--or-t-h3);font-family:var(--or-font-num);}
.or-step small{color:var(--or-mute);}
.or-step.or-highlight{border-color:var(--or-flare);background:linear-gradient(180deg,rgba(255,90,20,.16),var(--or-panel));}
@keyframes or-rise{from{opacity:0;transform:translateY(26px) scaleY(.86);}to{opacity:1;transform:none;}}

.or-dialog{max-width:560px;margin:0 auto;background:var(--or-panel);border:1px solid var(--or-line);
 padding:var(--or-s-md);border-radius:2px;box-shadow:0 24px 60px rgba(0,0,0,.6);}
.or-screen{animation:or-enter .26s cubic-bezier(.2,.7,.3,1) both;}
@keyframes or-enter{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
.or-leaving{animation:or-leave .16s ease forwards;}
@keyframes or-leave{to{opacity:0;transform:translateY(-8px);}}

.or-toasts{position:absolute;left:var(--or-s-md);right:var(--or-s-md);bottom:96px;display:grid;gap:6px;
 justify-items:center;pointer-events:none;z-index:5;}
.or-toast{background:rgba(10,13,17,.94);border:1px solid var(--or-line);border-left:3px solid var(--or-flare);
 padding:8px 14px;font-size:var(--or-t-small);animation:or-enter .2s ease both;max-width:100%;}
.or-live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}

@media (max-width:520px){
 .or-topbar{height:auto;min-height:var(--or-topbar);padding-top:6px;padding-bottom:6px;}
 .or-brandline{flex-direction:column;align-items:flex-start;gap:0;}
 .or-body{padding:var(--or-s-sm) var(--or-s-sm) var(--or-s-xs);}
 .or-screen,.or-cols,.or-col{gap:var(--or-s-sm);}
 .or-footer{padding:var(--or-s-xs) var(--or-s-sm);gap:var(--or-s-sm);}
 .or-footer .or-list,.or-lane-nav .or-list{gap:var(--or-s-md);}
 .or-footer .or-stat .or-stat-v,.or-lane-nav .or-stat .or-stat-v{font-size:var(--or-t-body);}
 .or-btn{padding:14px;}
 .or-hero{padding:var(--or-s-sm);}
 /* Five rounds of a calendar on a 366 px plate: at 16/9 the plate is 206 px tall
    and consecutive pins land 39 px apart, less than one wrapped label. Taller,
    and the ladder has room; the body scrolls anyway. */
 .or-map{aspect-ratio:5/6;min-height:300px;}
 .or-headline h3{font-size:var(--or-t-h3);}
 .or-grid{grid-template-columns:minmax(0,1fr);}
 .or-keys{grid-template-columns:minmax(0,1fr);}
 .or-podium{min-height:170px;}
}
@media (prefers-reduced-motion:reduce){
 .or-ui *,.or-ui *::before,.or-ui *::after{animation-duration:.001ms!important;transition-duration:.001ms!important;}
}
.or-ui.or-reduced *,.or-ui.or-reduced *::before,.or-ui.or-reduced *::after{
 animation-duration:.001ms!important;transition-duration:.001ms!important;}
`;

export function styleText() {
  return tokenBlock() + BASE_CSS;
}

function el(doc, tag, cls, text) {
  const node = doc.createElement(tag);
  if (cls) node.setAttribute("class", cls);
  if (text != null) node.textContent = String(text);
  return node;
}

function svgEl(doc, tag, attrs) {
  const node = doc.createElementNS(SVG_NS, tag);
  if (attrs) for (const k of Object.keys(attrs)) node.setAttribute(k, String(attrs[k]));
  return node;
}

function attr(node, name, value) {
  if (value == null || value === false) node.removeAttribute(name);
  else node.setAttribute(name, value === true ? "" : String(value));
  return node;
}

function buildWordmarkNode(doc, spec) {
  const svg = svgEl(doc, "svg", {
    viewBox: spec.viewBox.join(" "),
    role: "img",
    "aria-label": `${spec.text} ${spec.sub}`,
    preserveAspectRatio: "xMinYMid meet",
  });
  for (const s of spec.shapes) {
    svg.appendChild(svgEl(doc, "polygon", {
      points: s.points.map((p) => p.join(",")).join(" "),
      class: "or-mark-" + s.role,
    }));
  }
  for (const s of spec.strokes) {
    svg.appendChild(svgEl(doc, "path", {
      d: s.d, fill: "none", "stroke-width": s.width,
      "stroke-linecap": "butt", "stroke-linejoin": "miter",
      class: "or-mark-" + s.role,
    }));
  }
  return svg;
}

function buildRouteNode(doc, preview) {
  const svg = svgEl(doc, "svg", { viewBox: preview.viewBox.join(" "), role: "img", "aria-label": "Route map" });
  if (preview.empty) return svg;
  svg.appendChild(svgEl(doc, "path", { d: preview.d, class: "or-route-shadow" }));
  if (preview.segments.length) {
    for (const seg of preview.segments) {
      svg.appendChild(svgEl(doc, "path", { d: seg.d, class: "or-route-line", stroke: seg.colour }));
    }
  } else {
    svg.appendChild(svgEl(doc, "path", { d: preview.d, class: "or-route-line" }));
  }
  for (const sp of preview.splits) {
    svg.appendChild(svgEl(doc, "circle", { cx: sp.x, cy: sp.y, r: 3.4, class: "or-route-split" }));
  }
  if (preview.start) svg.appendChild(svgEl(doc, "circle", { cx: preview.start.x, cy: preview.start.y, r: 4.6, class: "or-route-start" }));
  if (preview.finish) svg.appendChild(svgEl(doc, "rect", { x: preview.finish.x - 4, y: preview.finish.y - 4, width: 8, height: 8, class: "or-route-finish" }));
  return svg;
}

function buildTorqueNode(doc, chart) {
  const svg = svgEl(doc, "svg", { viewBox: chart.viewBox.join(" "), role: "img", "aria-label": "Torque and power curve" });
  if (chart.empty) return svg;
  for (const t of chart.ticks) {
    svg.appendChild(svgEl(doc, "line", { x1: t.x, y1: chart.pad, x2: t.x, y2: chart.height - chart.pad, class: "or-chart-axis" }));
  }
  svg.appendChild(svgEl(doc, "path", { d: chart.powerD, class: "or-chart-power" }));
  svg.appendChild(svgEl(doc, "path", { d: chart.torqueD, class: "or-chart-torque" }));
  svg.appendChild(svgEl(doc, "circle", { cx: chart.peakTorque.x, cy: chart.peakTorque.y, r: 3, class: "or-route-finish" }));
  return svg;
}

function buildDeltaNode(doc, chart) {
  const svg = svgEl(doc, "svg", { viewBox: chart.viewBox.join(" "), role: "img", "aria-label": "Delta chart" });
  svg.appendChild(svgEl(doc, "line", { x1: 0, y1: chart.zeroY, x2: chart.width, y2: chart.zeroY, class: "or-delta-zero" }));
  if (chart.empty) return svg;
  for (const b of chart.bars) {
    svg.appendChild(svgEl(doc, "line", {
      x1: b.x, y1: b.y0, x2: b.x, y2: b.y1,
      class: b.tone === "gain" ? "or-delta-bar-gain" : "or-delta-bar-loss",
    }));
  }
  svg.appendChild(svgEl(doc, "path", { d: chart.d, class: "or-delta-line" }));
  return svg;
}

function buildLiveryNode(doc, preview) {
  const svg = svgEl(doc, "svg", { viewBox: preview.viewBox.join(" "), role: "img", "aria-label": `Livery ${preview.livery.name}, number ${preview.number}` });
  for (const shape of preview.shapes) {
    svg.appendChild(svgEl(doc, "polygon", { points: shape.points.map((p) => p.join(",")).join(" "), fill: shape.fill }));
  }
  svg.appendChild(svgEl(doc, "circle", { cx: preview.roundel.cx, cy: preview.roundel.cy, r: preview.roundel.r, fill: "#f4f6f8" }));
  const text = svgEl(doc, "text", {
    x: preview.roundel.cx, y: preview.roundel.cy, "text-anchor": "middle",
    "dominant-baseline": "central", fill: "#101318",
    "font-family": BRAND.fontNum, "font-size": Math.round(preview.roundel.r * 1.1), "font-weight": "700",
  });
  text.textContent = preview.numberText;
  svg.appendChild(text);
  return svg;
}

function figure(doc, child, caption) {
  const box = el(doc, caption ? "figure" : "div", "or-figure");
  box.style.margin = "0";
  box.appendChild(child);
  if (caption) box.appendChild(el(doc, "figcaption", null, caption));
  return box;
}

// One renderer per item kind. Interactive nodes are registered with ctx so the
// focus ring is built in model order, never in whatever order the DOM settles.
function renderItem(ctx, item, section) {
  const doc = ctx.doc;
  switch (item.kind) {
    case "wordmark": {
      const box = el(doc, "div", "or-wordmark");
      box.appendChild(buildWordmarkNode(doc, ctx.wordmark));
      return box;
    }
    case "button": {
      const node = el(doc, "button", "or-btn" + (item.primary ? " or-primary" : "") + (item.danger ? " or-danger" : ""));
      attr(node, "type", "button");
      const label = el(doc, "span", "or-btn-label");
      label.appendChild(doc.createTextNode(item.label ?? ""));
      if (item.sub) label.appendChild(el(doc, "span", "or-btn-sub", item.sub));
      node.appendChild(label);
      if (item.badge) node.appendChild(el(doc, "span", "or-badge", item.badge));
      if (item.selected) attr(node, "aria-current", "true");
      if (item.disabled) { attr(node, "disabled", true); attr(node, "aria-disabled", "true"); }
      if (item.blurb) attr(node, "title", item.blurb);
      ctx.register(item, node, section);
      ctx.bind(node, "click", () => ctx.act(item.action, item.value, item));
      return node;
    }
    case "tab": {
      const node = el(doc, "button", "or-tab");
      attr(node, "type", "button");
      attr(node, "role", "tab");
      attr(node, "aria-selected", item.selected ? "true" : "false");
      node.appendChild(el(doc, "span", null, item.label ?? ""));
      ctx.register(item, node, section);
      ctx.bind(node, "click", () => ctx.act(item.action, item.value, item));
      return node;
    }
    case "toggle": {
      const wrap = el(doc, "div", "or-field");
      const head = el(doc, "div", "or-field-head");
      const node = el(doc, "button", "or-switch");
      attr(node, "type", "button");
      attr(node, "role", "switch");
      attr(node, "aria-checked", item.value ? "true" : "false");
      node.appendChild(el(doc, "i"));
      node.appendChild(el(doc, "span", null, item.label ?? ""));
      if (item.cost != null) node.appendChild(el(doc, "span", "or-badge", item.cost + " min"));
      head.appendChild(node);
      wrap.appendChild(head);
      if (item.help) wrap.appendChild(el(doc, "div", "or-field-help", item.help));
      ctx.register(item, node, section);
      ctx.bind(node, "click", () => ctx.act(item.action, { key: item.key, value: !item.value, id: item.id }, item));
      return wrap;
    }
    case "range": {
      const wrap = el(doc, "div", "or-field");
      const head = el(doc, "div", "or-field-head");
      const label = el(doc, "label", null, item.label ?? "");
      attr(label, "for", ctx.domId(item.id));
      head.appendChild(label);
      const readout = el(doc, "span", "or-field-value", formatFieldValue(item));
      head.appendChild(readout);
      wrap.appendChild(head);
      const node = el(doc, "input");
      attr(node, "type", "range");
      attr(node, "id", ctx.domId(item.id));
      attr(node, "min", item.min);
      attr(node, "max", item.max);
      attr(node, "step", item.step);
      attr(node, "value", item.value);
      attr(node, "aria-describedby", item.help ? ctx.domId(item.id) + "-h" : null);
      node.value = String(item.value);
      wrap.appendChild(node);
      if (item.help) {
        const help = el(doc, "div", "or-field-help", item.help);
        attr(help, "id", ctx.domId(item.id) + "-h");
        wrap.appendChild(help);
      }
      ctx.register(item, node, section);
      ctx.bind(node, "input", (ev) => {
        const v = Number(ev?.target?.value ?? node.value);
        readout.textContent = formatFieldValue({ ...item, value: v });
        ctx.act(item.action, { key: item.key, value: v, id: item.id }, item);
      });
      return wrap;
    }
    case "enum": {
      const wrap = el(doc, "div", "or-field");
      const head = el(doc, "div", "or-field-head");
      head.appendChild(el(doc, "span", null, item.label ?? ""));
      head.appendChild(el(doc, "span", "or-field-value", String(item.value ?? "")));
      wrap.appendChild(head);
      const row = el(doc, "div", "or-enum");
      attr(row, "role", "radiogroup");
      attr(row, "aria-label", item.label ?? "");
      let first = null;
      for (const opt of item.options ?? []) {
        const b = el(doc, "button", "or-opt", String(opt));
        attr(b, "type", "button");
        attr(b, "aria-pressed", opt === item.value ? "true" : "false");
        ctx.bind(b, "click", () => ctx.act(item.action, { key: item.key, value: opt, id: item.id }, item));
        row.appendChild(b);
        if (!first) first = b;
      }
      wrap.appendChild(row);
      if (item.help) wrap.appendChild(el(doc, "div", "or-field-help", item.help));
      if (first) ctx.register(item, first, section);
      return wrap;
    }
    case "key": {
      const node = el(doc, "button", "or-key");
      attr(node, "type", "button");
      attr(node, "aria-label", `${item.label}: ${item.text}`);
      node.appendChild(el(doc, "span", null, item.label ?? ""));
      node.appendChild(el(doc, "kbd", null, item.text ?? "—"));
      ctx.register(item, node, section);
      ctx.bind(node, "click", () => ctx.act("beginRebind", { action: item.bindAction, slot: item.slot, id: item.id }, item));
      return node;
    }
    case "swatch": {
      const node = el(doc, "button", "or-swatch");
      attr(node, "type", "button");
      attr(node, "aria-label", item.label ?? "Livery");
      attr(node, "aria-pressed", item.selected ? "true" : "false");
      node.style.background = item.colour ?? "#888";
      const stripe = el(doc, "i");
      stripe.style.background = item.accent ?? "#fff";
      node.appendChild(stripe);
      ctx.register(item, node, section);
      ctx.bind(node, "click", () => ctx.act(item.action, item.value, item));
      return node;
    }
    case "number": {
      const wrap = el(doc, "div", "or-field");
      const head = el(doc, "div", "or-field-head");
      const label = el(doc, "label", null, item.label ?? "");
      attr(label, "for", ctx.domId(item.id));
      head.appendChild(label);
      wrap.appendChild(head);
      const row = el(doc, "div", "or-number");
      const node = el(doc, "input");
      attr(node, "type", "number");
      attr(node, "id", ctx.domId(item.id));
      attr(node, "min", item.min);
      attr(node, "max", item.max);
      attr(node, "step", item.step ?? 1);
      attr(node, "value", item.value);
      node.value = String(item.value);
      row.appendChild(node);
      wrap.appendChild(row);
      ctx.register(item, node, section);
      ctx.bind(node, "change", (ev) => {
        const v = clamp(Math.round(Number(ev?.target?.value ?? node.value) || 0), item.min ?? 1, item.max ?? 999);
        node.value = String(v);
        ctx.act(item.action, v, item);
      });
      return wrap;
    }
    case "stat":
    case "text": {
      const wrap = el(doc, "div", "or-stat");
      wrap.appendChild(el(doc, "span", "or-stat-k", item.label ?? ""));
      wrap.appendChild(el(doc, "span", "or-stat-v", item.value ?? ""));
      return wrap;
    }
    case "note": {
      const wrap = el(doc, "div", "or-note" + (item.tone && item.tone !== "level" ? " or-" + item.tone : ""));
      if (item.label) wrap.appendChild(el(doc, "strong", null, item.label));
      wrap.appendChild(doc.createTextNode(item.value ?? ""));
      return wrap;
    }
    case "bar": {
      const wrap = el(doc, "div", "or-bar");
      const head = el(doc, "div", "or-bar-head");
      head.appendChild(el(doc, "span", null, item.label ?? ""));
      const val = el(doc, "span", "or-field-value", item.text ?? "");
      head.appendChild(val);
      wrap.appendChild(head);
      const track = el(doc, "div", "or-bar-track");
      const fill = el(doc, "div", "or-bar-fill");
      fill.style.width = (saturate(item.value ?? 0) * 100).toFixed(1) + "%";
      track.appendChild(fill);
      wrap.appendChild(track);
      attr(wrap, "role", "meter");
      attr(wrap, "aria-valuenow", round(saturate(item.value ?? 0), 3));
      attr(wrap, "aria-label", item.label ?? "");
      ctx.meters.set(item.id, { fill, val });
      return wrap;
    }
    case "eyebrow": {
      const wrap = el(doc, "div", "or-eyebrow");
      wrap.appendChild(el(doc, "span", "or-eyebrow-k", item.label ?? ""));
      if (item.value) wrap.appendChild(el(doc, "span", "or-eyebrow-v", item.value));
      return wrap;
    }
    case "headline": {
      const wrap = el(doc, "div", "or-headline");
      wrap.appendChild(el(doc, "h3", null, item.label ?? ""));
      if (item.value) wrap.appendChild(el(doc, "p", null, item.value));
      return wrap;
    }
    case "statRow": {
      const wrap = el(doc, "div", "or-statrow");
      for (const cell of item.cells ?? []) {
        const box = el(doc, "div", "or-statcell");
        box.appendChild(el(doc, "span", "or-stat-k", cell.label ?? ""));
        box.appendChild(el(doc, "span", "or-stat-v", cell.value ?? "—"));
        wrap.appendChild(box);
      }
      return wrap;
    }
    case "chips": {
      const wrap = el(doc, "div", "or-chips");
      attr(wrap, "role", "list");
      attr(wrap, "aria-label", item.label ?? "");
      for (const chip of item.chips ?? []) {
        const node = el(doc, "div", "or-chip");
        attr(node, "role", "listitem");
        attr(node, "data-status", chip.status ?? "");
        node.appendChild(el(doc, "span", "or-chip-k", chip.label ?? ""));
        node.appendChild(el(doc, "span", "or-chip-v", chip.badge ?? ""));
        wrap.appendChild(node);
      }
      return wrap;
    }
    case "standings": {
      const list = el(doc, "ol", "or-standings");
      attr(list, "aria-label", item.label ?? "Standings");
      for (const row of item.rows ?? []) {
        const li = el(doc, "li", "or-standing" + (row.isPlayer ? " or-highlight" : ""));
        li.appendChild(el(doc, "span", "or-standing-pos", String(row.position ?? "")));
        const who = el(doc, "span", "or-standing-who");
        who.appendChild(el(doc, "b", null, row.name ?? ""));
        if (row.team) who.appendChild(el(doc, "small", null, row.team));
        li.appendChild(who);
        li.appendChild(el(doc, "span", "or-standing-pts", String(row.points ?? 0)));
        const bar = el(doc, "i");
        bar.style.width = (saturate(row.frac ?? 0) * 100).toFixed(1) + "%";
        li.appendChild(bar);
        list.appendChild(li);
      }
      return list;
    }
    case "route": return figure(doc, buildRouteNode(doc, item.preview), item.caption);
    case "chart": return figure(doc, buildTorqueNode(doc, item.chart));
    case "delta": return figure(doc, buildDeltaNode(doc, item.chart));
    case "livery": return figure(doc, buildLiveryNode(doc, item.preview));
    case "podiumStep": {
      const step = el(doc, "div", "or-step" + (item.highlight ? " or-highlight" : ""));
      step.style.height = (52 + (item.height ?? 0.6) * 148).toFixed(0) + "px";
      step.style.animationDelay = (item.delay ?? 0) + "ms";
      step.appendChild(el(doc, "b", null, ordinal(item.position)));
      step.appendChild(el(doc, "span", null, item.label ?? ""));
      step.appendChild(el(doc, "small", null, `${item.sub ?? ""} · ${item.points} pts`));
      return step;
    }
    default: {
      const wrap = el(doc, "div", "or-note");
      wrap.appendChild(doc.createTextNode(item.label ?? ""));
      return wrap;
    }
  }
}

function formatFieldValue(item) {
  const v = item.value;
  switch (item.format) {
    case "pct": return Math.round((Number(v) || 0) * 100) + "%";
    case "deg": return Math.round(Number(v) || 0) + "°";
    case "sec": return (Number(v) || 0).toFixed(1) + " s";
    case "int": return String(Math.round(Number(v) || 0));
    case "num": return (Number(v) || 0).toFixed(2);
    default: return String(v);
  }
}

const SECTION_CLASS = {
  menu: "or-menu", tabs: "or-tabs", grid: "or-grid", list: "or-list",
  fields: "or-fields", keys: "or-keys", panel: "or-list", notes: "or-list",
  chart: "or-chartbox", route: "or-routebox", podium: "or-podium", meta: "or-list",
  brand: "or-brandbox", map: "or-map", dialog: "or-menu", hero: "or-hero",
};

function renderTable(ctx, section) {
  const doc = ctx.doc;
  const box = el(doc, "div", "or-table");
  const table = doc.createElement("table");
  if (section.columns) {
    const thead = doc.createElement("thead");
    const tr = doc.createElement("tr");
    for (const c of section.columns) tr.appendChild(el(doc, "th", null, c));
    thead.appendChild(tr);
    table.appendChild(thead);
  }
  const tbody = doc.createElement("tbody");
  for (const row of section.items ?? []) {
    const tr = el(doc, "tr", row.highlight ? "or-highlight" : null);
    const cells = row.cells ?? [];
    for (let i = 0; i < cells.length; i += 1) {
      const td = el(doc, "td", null, cells[i]);
      if (row.tone && i === cells.length - 1) td.setAttribute("class", "or-" + row.tone);
      if (row.best && row.best[i - 1]) td.setAttribute("class", "or-best");
      if (row.bars && Number.isFinite(row.bars[i - 1])) {
        td.setAttribute("class", (td.getAttribute("class") ? td.getAttribute("class") + " " : "") + "or-bar-cell");
        const bar = el(doc, "i");
        bar.style.width = (saturate(row.bars[i - 1]) * 100).toFixed(1) + "%";
        td.appendChild(bar);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  box.appendChild(table);
  return box;
}

function renderMap(ctx, section) {
  const doc = ctx.doc;
  const map = el(doc, "div", "or-map");
  attr(map, "role", "group");
  attr(map, "aria-label", section.heading ?? "Calendar");
  for (const item of section.items ?? []) {
    const node = el(doc, item.disabled ? "div" : "button", "or-node");
    if (!item.disabled) attr(node, "type", "button");
    attr(node, "data-status", item.status ?? "");
    const px = saturate(item.point?.x ?? 0.5);
    node.style.left = (px * 100).toFixed(2) + "%";
    node.style.top = (saturate(item.point?.y ?? 0.5) * 100).toFixed(2) + "%";
    // A pin near an edge is anchored by that edge rather than by its middle.
    // Centring every pin cut the outer ones in half: a 150 px label at x=0.12
    // of a 366 px map starts 31 px outside the box, and the map has no room to
    // scroll. Any caller may place a pin anywhere, so the guard lives here.
    node.style.transform = `translate(${px < 0.25 ? "0%" : px > 0.75 ? "-100%" : "-50%"},-50%)`;
    node.appendChild(el(doc, "span", null, item.label ?? ""));
    node.appendChild(el(doc, "small", null, `${item.sub ?? ""} · ${item.badge ?? ""}`));
    if (!item.disabled) {
      ctx.register(item, node, section);
      ctx.bind(node, "click", () => ctx.act(item.action, item.value, item));
    }
    map.appendChild(node);
  }
  return map;
}

function renderSection(ctx, section) {
  const doc = ctx.doc;
  const wrap = el(doc, "section", "or-section");
  attr(wrap, "data-or-region", section.region ?? "main");
  attr(wrap, "data-or-section", section.id);
  if (section.heading && section.kind !== "brand") {
    const h = el(doc, "h2", null, section.heading);
    attr(h, "id", ctx.domId(section.id) + "-h");
    wrap.appendChild(h);
    attr(wrap, "aria-labelledby", ctx.domId(section.id) + "-h");
  }
  if (section.kind === "table") { wrap.appendChild(renderTable(ctx, section)); return wrap; }
  if (section.kind === "map") { wrap.appendChild(renderMap(ctx, section)); return wrap; }
  const inner = el(doc, "div", SECTION_CLASS[section.kind] ?? "or-list");
  if (section.kind === "tabs") { attr(inner, "role", "tablist"); attr(inner, "aria-label", section.heading ?? "Tabs"); }
  for (const item of section.items ?? []) inner.appendChild(renderItem(ctx, item, section));
  wrap.appendChild(inner);
  return wrap;
}

const ACTION_ALIAS = Object.freeze({
  startStage: "onStart",
  retire: "onQuit",
  toggleRepair: "onRepair",
  repairAll: "onRepair",
  repairNone: "onRepair",
  setSetting: "onSettingsChange",
  rebind: "onSettingsChange",
  confirmRepairs: "onConfirmRepairs",
  selectCar: "onSelectCar",
  confirmCar: "onSelectCar",
  selectStage: "onSelectStage",
  openStage: "onSelectStage",
});

function hookName(action) {
  return ACTION_ALIAS[action] ?? ("on" + action.charAt(0).toUpperCase() + action.slice(1));
}

// Actions the shell resolves itself before telling the host about them: the host
// should not have to re-render a menu just because a tab moved.
const LOCAL_ACTIONS = new Set([
  "selectClass", "selectCar", "selectLivery", "selectNumber", "selectSettingsGroup",
  "setSetting", "toggleRepair", "repairAll", "repairNone", "resetSettingsGroup",
  "beginRebind", "calibrate", "openSettings", "closeSettings", "tutorial", "closeTutorial",
]);

let uiSeq = 0;

export function createUi(root, opts = {}) {
  const doc = opts.document ?? root?.ownerDocument ?? globalThis.document;
  if (!doc) throw new Error("ui: no document available");
  const win = opts.window ?? doc.defaultView ?? globalThis;
  const uid = "or" + (uiSeq += 1);

  const state = {
    screen: null,
    model: null,
    data: { ...demoData(), ...(opts.data ?? {}) },
    settings: applySettings(opts.settings ?? null, {}),
    listeners: [],
    globals: [],
    timers: new Set(),
    focusables: [],
    meters: new Map(),
    listening: null,
    pad: makePadState(),
    padPrev: { up: false, down: false, activate: false },
    rafId: 0,
    padClock: 0,
    destroyed: false,
    calibSamples: null,
    wordmark: wordmarkSpec(),
  };
  state.data.settings = state.settings;

  const container = el(doc, "div", "or-ui");
  attr(container, "data-or-root", uid);
  const topbar = el(doc, "header", "or-topbar");
  const brandline = el(doc, "div", "or-brandline");
  const h1 = el(doc, "h1", null, BRAND.name);
  const kicker = el(doc, "div", "or-kicker", BRAND.tagline);
  brandline.appendChild(h1);
  brandline.appendChild(kicker);
  topbar.appendChild(brandline);
  const topbarEnd = el(doc, "div", "or-topbar-end");
  topbar.appendChild(topbarEnd);
  const body = el(doc, "main", "or-body");
  attr(body, "tabindex", "-1");
  const footer = el(doc, "footer", "or-footer");
  const toasts = el(doc, "div", "or-toasts");
  const live = el(doc, "div", "or-live");
  attr(live, "role", "status");
  attr(live, "aria-live", "polite");
  attr(live, "aria-atomic", "true");
  container.appendChild(topbar);
  container.appendChild(body);
  container.appendChild(footer);
  container.appendChild(toasts);
  container.appendChild(live);

  ensureStyle(doc);
  if (root) root.appendChild(container);

  function bind(target, type, fn, store) {
    target.addEventListener(type, fn);
    (store ?? state.listeners).push([target, type, fn]);
  }
  function unbindAll(list) {
    for (const [target, type, fn] of list) target.removeEventListener(type, fn);
    list.length = 0;
  }

  function announce(message) {
    live.textContent = String(message ?? "");
  }

  function emit(action, value, item) {
    const fn = opts[hookName(action)];
    if (typeof fn === "function") fn(value, action, api);
    else if (typeof opts.onAction === "function") opts.onAction(action, value, item);
  }

  const ctx = {
    doc,
    meters: state.meters,
    wordmark: state.wordmark,
    domId: (id) => uid + "-" + id,
    register(item, node, section) {
      attr(node, "data-or-focus", item.id);
      state.focusables.push({ id: item.id, node, item, section });
    },
    bind(node, type, fn) { bind(node, type, fn); },
    act(action, value, item) { handleAction(action, value, item); },
  };

  function handleAction(action, value, item) {
    if (!action || state.destroyed) return;
    if (LOCAL_ACTIONS.has(action)) {
      const handled = applyLocal(action, value, item);
      if (handled !== false) return;
    }
    emit(action, value, item);
  }

  function applyLocal(action, value, item) {
    switch (action) {
      case "selectClass": state.data.activeClassId = value; state.data.selectedCarId = null; refresh(); emit("selectClass", value, item); return true;
      case "selectCar": state.data.selectedCarId = value; refresh(); emit("selectCar", value, item); return true;
      case "selectLivery": state.data.liveryId = value; refresh(); emit("selectLivery", value, item); return true;
      case "selectNumber": state.data.number = value; emit("selectNumber", value, item); return true;
      case "selectSettingsGroup": state.data.settingsGroup = value; refresh(); return true;
      case "resetSettingsGroup": {
        const group = SETTINGS_SCHEMA.find((g) => g.id === value);
        if (group) {
          const patch = {};
          for (const f of group.fields) patch[f.key] = f.default;
          setSettings(patch);
          announce(group.label + " reset to defaults");
        }
        return true;
      }
      case "setSetting": {
        const patch = {};
        patch[value.key] = value.value;
        if (value.key === "quality") {
          state.settings = applyQualityPreset(state.settings, value.value);
          state.data.settings = state.settings;
          refresh();
          emit("setSetting", { ...state.settings }, item);
          return true;
        }
        setSettings(patch);
        if (value.key === "reducedMotion") container.classList.toggle("or-reduced", !!state.settings.reducedMotion);
        return true;
      }
      case "toggleRepair": {
        const id = String(item?.id ?? "").replace(/^v-fix-/, "");
        const chosen = new Set(state.data.repairChoices ?? []);
        if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
        state.data.repairChoices = Array.from(chosen);
        refresh();
        emit("toggleRepair", { id, chosen: state.data.repairChoices }, item);
        return true;
      }
      case "repairAll": state.data.repairChoices = (state.data.damage ?? []).map((d) => d.id); refresh(); emit("repairAll", state.data.repairChoices, item); return true;
      case "repairNone": state.data.repairChoices = []; refresh(); emit("repairNone", [], item); return true;
      case "beginRebind": {
        state.listening = { action: value.action, slot: value.slot, id: value.id };
        const entry = state.focusables.find((f) => f.id === value.id);
        if (entry) entry.node.classList.add("or-listening");
        announce("Press a key to bind, or Escape to cancel");
        return true;
      }
      case "calibrate": {
        state.calibSamples = [];
        state.data.calibrating = true;
        refresh();
        announce("Sweep the steering axis fully both ways, then release it");
        const t = win.setTimeout(() => {
          const cal = calibrateAxis(state.calibSamples ?? [], state.pad.steer);
          state.calibSamples = null;
          state.data.calibrating = false;
          setSettings({ calibration: { ...state.settings.calibration, steer: cal } });
          announce("Steering axis calibrated");
        }, opts.calibrationMs ?? 4000);
        state.timers.add(t);
        return true;
      }
      case "openSettings":
        if (typeof value === "string") state.data.settingsGroup = value;
        state.data.returnScreen = state.screen;
        show("settings");
        emit("openSettings", value, item);
        return true;
      case "closeSettings": {
        const back = state.data.returnScreen && state.data.returnScreen !== "settings" ? state.data.returnScreen : "title";
        show(back);
        emit("closeSettings", back, item);
        return true;
      }
      case "tutorial":
        state.data.returnScreen = state.screen;
        show("tutorial");
        return true;
      case "closeTutorial": {
        const back = state.data.returnScreen && state.data.returnScreen !== "tutorial" ? state.data.returnScreen : "title";
        show(back);
        emit("closeTutorial", back, item);
        return true;
      }
      default: return false;
    }
  }

  function setSettings(patch) {
    state.settings = applySettings(state.settings, patch);
    state.data.settings = state.settings;
    container.classList.toggle("or-reduced", !!state.settings.reducedMotion);
    refresh();
    emit("settingsChange", { ...state.settings });
    return state.settings;
  }

  // The whole screen is rebuilt into a detached tree and swapped in one shot, so
  // the browser lays out once rather than once per section.
  function render(model) {
    unbindAll(state.listeners);
    state.focusables.length = 0;
    state.meters.clear();
    ctx.meters = state.meters;

    const nextBody = el(doc, "div", "or-screen");
    attr(nextBody, "data-or-screen", model.screen);
    const nextFooter = doc.createDocumentFragment();
    // Two real columns, built here rather than left to a child selector on the
    // scroll container: `main` and `aside` are siblings of nothing once the
    // .or-screen wrapper sits between them and .or-body.
    const navLane = el(doc, "div", "or-lane-nav");
    const cols = el(doc, "div", "or-cols");
    const colMain = el(doc, "div", "or-col or-col-main");
    const colAside = el(doc, "div", "or-col or-col-aside");
    let hasNav = false;
    let hasAside = false;
    let dialog = null;

    for (const section of model.sections ?? []) {
      const node = renderSection(ctx, section);
      const region = section.region ?? "main";
      if (region === "footer") nextFooter.appendChild(node);
      else if (region === "dialog") {
        if (!dialog) dialog = el(doc, "div", "or-dialog");
        dialog.appendChild(node);
      } else if (region === "nav") { navLane.appendChild(node); hasNav = true; }
      else if (region === "aside") { colAside.appendChild(node); hasAside = true; }
      else colMain.appendChild(node);
    }
    if (hasNav) nextBody.appendChild(navLane);
    attr(cols, "data-or-cols", hasAside ? "2" : "1");
    cols.appendChild(colMain);
    if (hasAside) cols.appendChild(colAside);
    if (colMain.childNodes.length || hasAside) nextBody.appendChild(cols);
    if (dialog) nextBody.appendChild(dialog);

    h1.textContent = model.title ?? BRAND.name;
    kicker.textContent = model.kicker ?? BRAND.tagline;
    body.replaceChildren(nextBody);
    footer.replaceChildren(nextFooter);
    attr(container, "data-or-active", model.screen);
    state.model = model;
  }

  function refresh() {
    if (state.destroyed || !state.screen) return;
    render(buildScreenModel(state.screen, state.data));
  }

  function show(screen, data) {
    if (state.destroyed) return api;
    if (!SCREEN_BUILDERS[screen]) throw new Error(`ui: unknown screen "${screen}"`);
    if (data) Object.assign(state.data, data);
    state.data.settings = state.settings;
    state.screen = screen;
    render(buildScreenModel(screen, state.data));
    announce((state.model.title ?? screen) + " screen");
    focusFirst();
    return api;
  }

  function focusFirst() {
    const first = state.focusables[0];
    if (first && typeof first.node.focus === "function") first.node.focus();
  }

  function focusIndex() {
    const active = doc.activeElement;
    for (let i = 0; i < state.focusables.length; i += 1) if (state.focusables[i].node === active) return i;
    return -1;
  }

  function moveFocus(step) {
    const n = state.focusables.length;
    if (n === 0) return;
    const cur = focusIndex();
    const next = cur < 0 ? (step > 0 ? 0 : n - 1) : (cur + step + n) % n;
    const node = state.focusables[next].node;
    if (typeof node.focus === "function") node.focus();
  }

  function onKeyDown(ev) {
    if (state.destroyed) return;
    const code = ev.code ?? ev.key;
    if (state.listening) {
      ev.preventDefault?.();
      const entry = state.focusables.find((f) => f.id === state.listening.id);
      if (entry) entry.node.classList.remove("or-listening");
      if (code !== "Escape") {
        const res = rebind(state.settings.keybinds, state.listening.action, state.listening.slot, code);
        if (res.ok) {
          setSettings({ keybinds: res.binds });
          announce(`${keyLabel(code)} bound`);
        } else {
          announce(`${keyLabel(code)} cannot be bound`);
        }
      } else {
        announce("Rebinding cancelled");
      }
      state.listening = null;
      return;
    }
    switch (code) {
      case "ArrowDown": case "ArrowRight": ev.preventDefault?.(); moveFocus(1); break;
      case "ArrowUp": case "ArrowLeft": ev.preventDefault?.(); moveFocus(-1); break;
      case "Home": ev.preventDefault?.(); focusFirst(); break;
      case "End": {
        ev.preventDefault?.();
        const last = state.focusables[state.focusables.length - 1];
        if (last?.node?.focus) last.node.focus();
        break;
      }
      case "Escape": handleAction(escapeAction(), null, null); break;
      default: break;
    }
  }

  function escapeAction() {
    switch (state.screen) {
      case "settings": return "closeSettings";
      case "tutorial": return "closeTutorial";
      case "pause": return "resume";
      case "title": return "noop";
      default: return "back";
    }
  }

  bind(container, "keydown", onKeyDown, state.globals);

  // Gamepad state is polled, never pushed. Throttled well below frame rate: the
  // menus need a responsive stick, not a 240 Hz one, and getGamepads() allocates.
  function pollPads(now) {
    state.rafId = 0;
    if (state.destroyed) return;
    schedulePad();
    const t = typeof now === "number" ? now : 0;
    if (t - state.padClock < (opts.padIntervalMs ?? 40)) return;
    state.padClock = t;
    const pads = win.navigator?.getGamepads?.();
    let pad = null;
    if (pads) for (let i = 0; i < pads.length; i += 1) if (pads[i]) { pad = pads[i]; break; }
    readGamepad(pad, state.settings.gamepad, state.settings, state.pad);
    if (state.calibSamples && pad) state.calibSamples.push(pad.axes?.[state.settings.gamepad.steerAxis] ?? 0);
    updateMeters();
    const down = state.pad.steer > 0.6 || (pad?.buttons?.[13]?.pressed ?? false);
    const up = state.pad.steer < -0.6 || (pad?.buttons?.[12]?.pressed ?? false);
    const go = pad ? (pad.buttons?.[0]?.pressed ?? false) : false;
    if (down && !state.padPrev.down) moveFocus(1);
    if (up && !state.padPrev.up) moveFocus(-1);
    if (go && !state.padPrev.activate) {
      const idx = focusIndex();
      const entry = state.focusables[idx < 0 ? 0 : idx];
      if (entry) handleAction(entry.item.action, entry.item.value, entry.item);
    }
    state.padPrev.down = down;
    state.padPrev.up = up;
    state.padPrev.activate = go;
  }

  function updateMeters() {
    if (state.screen !== "settings" || state.data.settingsGroup !== "controls") return;
    setMeter("g-pad-steer", state.pad.steer * 0.5 + 0.5, state.pad.steer.toFixed(2));
    setMeter("g-pad-thr", state.pad.throttle, state.pad.throttle.toFixed(2));
    setMeter("g-pad-brk", state.pad.brake, state.pad.brake.toFixed(2));
  }

  function setMeter(id, value, text) {
    const m = state.meters.get(id);
    if (!m) return;
    m.fill.style.width = (saturate(value) * 100).toFixed(1) + "%";
    m.val.textContent = text;
  }

  function schedulePad() {
    if (opts.gamepad === false || state.destroyed) return;
    if (typeof win.requestAnimationFrame !== "function") return;
    if (state.rafId) return;
    state.rafId = win.requestAnimationFrame(pollPads);
  }
  schedulePad();

  function toast(message, ms) {
    if (state.destroyed) return api;
    const node = el(doc, "div", "or-toast", String(message ?? ""));
    toasts.appendChild(node);
    announce(message);
    const t = win.setTimeout(() => {
      state.timers.delete(t);
      if (node.parentNode) node.parentNode.removeChild(node);
    }, ms ?? opts.toastMs ?? 2600);
    state.timers.add(t);
    return api;
  }

  function setData(patch) {
    if (!patch) return api;
    Object.assign(state.data, patch);
    if (patch.settings) {
      state.settings = applySettings(state.settings, patch.settings);
      state.data.settings = state.settings;
    }
    refresh();
    return api;
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    unbindAll(state.listeners);
    unbindAll(state.globals);
    for (const t of state.timers) win.clearTimeout?.(t);
    state.timers.clear();
    if (state.rafId && typeof win.cancelAnimationFrame === "function") win.cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    state.focusables.length = 0;
    state.meters.clear();
    if (container.parentNode) container.parentNode.removeChild(container);
    releaseStyle(doc);
  }

  const api = {
    element: container,
    root,
    show,
    setData,
    refresh,
    toast,
    announce,
    destroy,
    get screen() { return state.screen; },
    get model() { return state.model; },
    getSettings() { return { ...state.settings }; },
    setSettings,
    getData() { return state.data; },
    getFocusOrder() { return state.focusables.map((f) => f.id); },
    getPadState() { return state.pad; },
    pollPads,
    handleKey: onKeyDown,
    dispatch: handleAction,
  };

  container.classList.toggle("or-reduced", !!state.settings.reducedMotion);
  show(opts.screen ?? "title");
  return api;
}

// One <style> per document however many UIs exist, refcounted so tearing one
// down does not strip the stylesheet from another.
const styleRefs = new WeakMap();

function ensureStyle(doc) {
  const count = styleRefs.get(doc) ?? 0;
  styleRefs.set(doc, count + 1);
  if (count > 0) return;
  const style = doc.createElement("style");
  style.setAttribute("id", STYLE_ID);
  style.textContent = styleText();
  (doc.head ?? doc.body ?? doc).appendChild(style);
  styleRefs.set(doc, 1);
  styleNodes.set(doc, style);
}

const styleNodes = new WeakMap();

function releaseStyle(doc) {
  const count = styleRefs.get(doc) ?? 0;
  if (count <= 1) {
    styleRefs.set(doc, 0);
    const style = styleNodes.get(doc);
    if (style && style.parentNode) style.parentNode.removeChild(style);
    styleNodes.delete(doc);
  } else {
    styleRefs.set(doc, count - 1);
  }
}
