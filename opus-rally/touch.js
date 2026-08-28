// On-screen driving controls for a touchscreen. A phone can reach this game and
// cannot drive it, and two arrow buttons would not fix that: steering has to be
// analogue and holdable or the car is undriveable above walking pace. So the
// steering is a thumb slider (with tilt as an option), and everything else is a
// large independent target — throttle and brake are separate controls precisely
// so left-foot braking works, which needs two fingers down at once.
//
// Structure follows hud.js: every geometry and mapping decision is an exported
// pure function above `createTouchControls`, because those are the decisions
// worth regression-testing and the browser is not available under Node. The DOM
// half below only positions nodes at the rects the layout function returns, so
// the tests measure the same numbers the player touches.
//
// Input goes through input.js's `setTouch`/`clearTouch` — this module owns no
// input state beyond which finger is on what. Releasing the last control calls
// `clearTouch`, so a hybrid laptop that got one stray tap goes back to being a
// keyboard.
//
// Two things follow from a phone being held at its bottom edge. The controls sit
// in the two bottom corners and nowhere else, so the middle of the screen — the
// road, and the car — stays the game. And the space they take is announced to
// the HUD through `hudReserve`, because the HUD is a different root under a
// different stylesheet and cannot see them: before that existed the slider
// covered 81% of the portrait speed and gear cluster, and the pedals covered 63%
// of the landscape one. A speed you cannot read is a pacenote you cannot use.

import { clamp } from "./mathx.js";

const EMPTY = Object.freeze({});

// The site-wide "back to almanac" pill owns this rectangle and beats every
// z-index, so a control under it is not obscured — it is untappable, and the tap
// navigates away mid-stage.
export const RESERVED_RECT = Object.freeze({ x: 0, y: 0, w: 109, h: 41 });

export const CONTROL_IDS = Object.freeze([
  "steer", "brake", "throttle", "handbrake", "camera", "reset",
]);

// A finger is about 9 mm of contact; anything under 44 CSS px is a control you
// miss at speed on a rough road.
export const MIN_TARGET = 44;

const MIN_VIEW = 320;
const PAD = 12;
const GAP = 10;
// Between two controls the same thumb works as a pair — a pedal and its
// neighbour — where a wide channel is wasted screen rather than safety.
const TIGHT = 8;
// The brake as a fraction of the throttle. The throttle is the one a thumb rests
// on for minutes at a time; the brake is stabbed.
const BRAKE_SHARE = 0.9;
// A thumb wanders a few pixels on a rough road; releasing a pedal on the first
// one would make the throttle stutter.
const RELEASE_SLOP = 10;

export const STEER_DEFAULTS = Object.freeze({
  // Enough to stop a thumb resting mid-track from creeping, small enough that
  // the first millimetre of a correction still does something.
  deadzone: 0.05,
  // Fine near centre, linear at full lock — the same shape the pad stick uses.
  gamma: 1.4,
  // Snap-back when the thumb lifts. Slower than the driver can move, so a lift
  // mid-corner is a release rather than a flick of opposite lock.
  returnRate: 5.5,
});

export const TILT_DEFAULTS = Object.freeze({
  range: 26,        // degrees of roll to full lock
  deadzone: 0.07,
  gamma: 1.35,
  centre: 0,
});

// The knob is what the thumb holds, but every pixel of it is a pixel the thumb
// cannot travel: the track is only ever a couple of hundred pixels long, so a
// knob sized like a pedal would eat half the steering range.
function knobWidth(track) {
  return track.knob ?? clamp(track.h * 0.78, MIN_TARGET, 84);
}

function rect(id, kind, x, y, w, h, label, extra) {
  const r = { id, kind, x, y, w, h, label };
  if (extra) Object.assign(r, extra);
  return r;
}

// Two thumb corners, and nothing anywhere else. A phone is held at its bottom
// edge whichever way up it is, so the left thumb gets the slider in the
// bottom-left corner and the right thumb gets the pedals in the bottom-right,
// and the band between and above them stays the game.
//
// The slider used to run the full width in portrait — 366 px of track on a
// 390 px phone. That is more travel than a thumb has: full right lock sat at
// x=347, which the left thumb cannot reach and the right thumb is holding a
// pedal over. Capping it to a thumb's arc costs resolution the curve gives back
// near centre, where a rally car actually needs it.
export function controlLayout(viewport = EMPTY) {
  const w = Math.max(MIN_VIEW, Math.round(viewport.width ?? 390));
  const h = Math.max(MIN_VIEW, Math.round(viewport.height ?? 844));
  const ins = viewport.insets ?? EMPTY;
  const padL = PAD + Math.max(0, ins.left ?? 0);
  const padR = PAD + Math.max(0, ins.right ?? 0);
  const padB = PAD + Math.max(0, ins.bottom ?? 0);
  const padT = PAD + Math.max(0, ins.top ?? 0);
  const portrait = h >= w;
  const usableH = Math.max(MIN_TARGET * 4, h - padT - padB);
  const inner = Math.max(MIN_TARGET * 5, w - padL - padR);

  // The slider is served first. A pedal only has to be big enough to hit, but a
  // track too short to resolve a correction cannot be driven with at all.
  const pedalCap = clamp(Math.min(w, h) * 0.24, 56, 116);
  const pairCap = pedalCap * (1 + BRAKE_SHARE) + TIGHT;
  const pairMin = MIN_TARGET * 2 + TIGHT;
  const trackW = clamp(inner - GAP - pairMin, MIN_TARGET * 3, clamp(w * 0.42, 150, 300));
  const pairW = clamp(inner - GAP - trackW, pairMin, pairCap);
  const pedalW = (pairW - TIGHT) / (1 + BRAKE_SHARE);
  const brakeW = pedalW * BRAKE_SHARE;

  const trackH = clamp(Math.min(w, h) * 0.17, 60, 96);
  const pedalH = clamp(usableH * (portrait ? 0.19 : 0.36), 84, 170);
  const smallH = clamp(pedalH * 0.34, MIN_TARGET, 62);
  // Camera and reset are not driving controls, and reset costs a stage if it is
  // caught by a stray thumb. They get the smallest legal target in the set, and
  // they get it at the top of the column where a deliberate reach lands.
  const auxS = clamp((pairW - TIGHT) / 2, MIN_TARGET, 52);

  const bottom = h - padB;
  const trackY = bottom - trackH;
  const pedalY = bottom - pedalH;
  const throttleX = w - padR - pedalW;
  const brakeX = throttleX - TIGHT - brakeW;
  const handbrakeY = pedalY - GAP - smallH;
  const auxY = handbrakeY - GAP - auxS;
  const resetX = w - padR - auxS;

  const controls = [
    rect("steer", "slider", padL, trackY, trackW, trackH, "STEER", {
      knob: clamp(trackH * 0.78, MIN_TARGET, 84),
    }),
    rect("brake", "pedal", brakeX, pedalY, brakeW, pedalH, "BRAKE"),
    rect("throttle", "pedal", throttleX, pedalY, pedalW, pedalH, "THROTTLE"),
    rect("handbrake", "pedal", brakeX, handbrakeY, pairW, smallH, "HANDBRAKE"),
    rect("camera", "button", resetX - TIGHT - auxS, auxY, auxS, auxS, "CAMERA"),
    rect("reset", "button", resetX, auxY, auxS, auxS, "RESET"),
  ];

  return { width: w, height: h, portrait, gap: GAP, controls };
}

// The union of everything on the right — the column the pedals, the handbrake
// and the two buttons stand in. Nothing else may be drawn inside it.
export function controlColumn(layout) {
  let x = Infinity; let y = Infinity;
  for (const c of layout.controls) {
    if (c.id === "steer") continue;
    x = Math.min(x, c.x);
    y = Math.min(y, c.y);
  }
  return { x, y, w: layout.width - x, h: layout.height - y };
}

// How far the HUD's bottom rail has to get out of the way, in pixels beyond its
// own edge padding. hud.js was written knowing only about the almanac pill, and
// a speed readout under a throttle pedal is exactly as unreadable as one under
// the pill: measured on a 390x844 phone the slider covered 81% of the speed and
// gear cluster, and in landscape the pedals and handbrake covered 63% of it.
//
// Portrait lifts the cluster over the whole column, because the full width above
// the band is free. Landscape cannot — the cluster is 170 px tall on a 390 px
// screen — so there it slides left of the column instead, into the channel the
// capped slider leaves in the middle.
export function hudReserve(layout) {
  const track = controlById(layout, "steer");
  const column = controlColumn(layout);
  const leftBottom = Math.max(0, layout.height - track.y);
  return layout.portrait
    ? { leftBottom, rightBottom: Math.max(0, layout.height - column.y), rightSide: 0 }
    : { leftBottom, rightBottom: leftBottom, rightSide: Math.max(0, layout.width - column.x) };
}

export const NO_RESERVE = Object.freeze({ leftBottom: 0, rightBottom: 0, rightSide: 0 });

export function controlById(layout, id) {
  for (const c of layout.controls) if (c.id === id) return c;
  return null;
}

export function rectsIntersect(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function clearsReserved(r) {
  return !rectsIntersect(r, RESERVED_RECT);
}

// Last control wins, so the reading matches paint order if two ever overlap.
export function hitTest(layout, x, y, slop = 0) {
  for (let i = layout.controls.length - 1; i >= 0; i -= 1) {
    const c = layout.controls[i];
    if (x >= c.x - slop && x <= c.x + c.w + slop
      && y >= c.y - slop && y <= c.y + c.h + slop) return c.id;
  }
  return null;
}

// POSITIVE steer is RIGHT, so the thumb at the right end of the track comes out
// positive and the slider moves the way the car does. This used to negate `u` on
// the strength of a comment asserting positive was left — true of the keyboard
// path and of nothing else, because that path was itself inverted.
export function steerFromSlider(clientX, track, opts = EMPTY) {
  const knob = knobWidth(track);
  const travel = Math.max(1, track.w - knob);
  const u = clamp((clientX - (track.x + knob * 0.5)) / travel, 0, 1) * 2 - 1;
  return steerCurve(u, opts);
}

// The inverse, so the knob can be drawn from a steer value the player did not
// place by hand — the snap-back to centre, or tilt steering.
export function sliderXFromSteer(steer, track, opts = EMPTY) {
  const knob = knobWidth(track);
  const travel = Math.max(1, track.w - knob);
  const u = steerCurveInverse(steer, opts);
  return track.x + knob * 0.5 + (u + 1) * 0.5 * travel;
}

export function steerCurve(u, opts = EMPTY) {
  const dead = opts.deadzone ?? STEER_DEFAULTS.deadzone;
  const gamma = opts.gamma ?? STEER_DEFAULTS.gamma;
  const v = clamp(u, -1, 1);
  const a = Math.abs(v);
  if (a <= dead) return 0;
  const t = (a - dead) / (1 - dead);
  return (v < 0 ? -1 : 1) * Math.pow(t, gamma);
}

export function steerCurveInverse(steer, opts = EMPTY) {
  const dead = opts.deadzone ?? STEER_DEFAULTS.deadzone;
  const gamma = opts.gamma ?? STEER_DEFAULTS.gamma;
  const v = clamp(steer, -1, 1);
  const a = Math.abs(v);
  if (a === 0) return 0;
  return (v < 0 ? -1 : 1) * (Math.pow(a, 1 / gamma) * (1 - dead) + dead);
}

// Roll is "the right-hand edge of the screen going down", whatever way up the
// device is being held; DeviceOrientation reports that on a different axis in
// each screen orientation.
export function tiltFromOrientation(beta, gamma, screenAngle = 0) {
  const b = Number.isFinite(beta) ? beta : 0;
  const g = Number.isFinite(gamma) ? gamma : 0;
  const angle = ((Math.round(screenAngle / 90) * 90) % 360 + 360) % 360;
  if (angle === 90) return -b;
  if (angle === 180) return -g;
  if (angle === 270) return b;
  return g;
}

export function steerFromTilt(rollDeg, opts = EMPTY) {
  const range = Math.max(1, opts.range ?? TILT_DEFAULTS.range);
  const centre = opts.centre ?? TILT_DEFAULTS.centre;
  const u = clamp(((Number.isFinite(rollDeg) ? rollDeg : 0) - centre) / range, -1, 1);
  // Rolling the device to the right steers right, which is a POSITIVE steer.
  return steerCurve(u, {
    deadzone: opts.deadzone ?? TILT_DEFAULTS.deadzone,
    gamma: opts.gamma ?? TILT_DEFAULTS.gamma,
  });
}

export function steerReturn(current, dt, rate = STEER_DEFAULTS.returnRate) {
  const step = Math.max(0, rate) * Math.max(0, dt);
  if (Math.abs(current) <= step) return 0;
  return current - (current < 0 ? -step : step);
}

// Two fingers on two controls is the normal case, so the record is a reduction
// over every live pointer rather than a "current control".
export function patchFromTouches(touches, restSteer = 0, out = EMPTY) {
  const patch = out === EMPTY ? { steer: 0, throttle: 0, brake: 0, handbrake: 0 } : out;
  patch.steer = restSteer;
  patch.throttle = 0;
  patch.brake = 0;
  patch.handbrake = 0;
  let steered = false;
  for (const t of touches) {
    if (!t) continue;
    const value = t.value === undefined ? 1 : t.value;
    if (t.control === "throttle") patch.throttle = Math.max(patch.throttle, value);
    else if (t.control === "brake") patch.brake = Math.max(patch.brake, value);
    else if (t.control === "handbrake") patch.handbrake = Math.max(patch.handbrake, value);
    else if (t.control === "steer") {
      patch.steer = steered ? patch.steer : value;
      steered = true;
    }
  }
  patch.steer = clamp(patch.steer, -1, 1);
  return patch;
}

// A mouse-only machine gets nothing: the controls would sit over the game for
// somebody who already has a keyboard. `force` exists for tests and for a
// settings screen that wants to show them anyway.
export function shouldShowTouch(env = EMPTY) {
  if (env.force) return true;
  if (env.enabled === false) return false;
  return (env.maxTouchPoints ?? 0) > 0 || !!env.coarsePointer;
}

const GLYPHS = Object.freeze({
  throttle: "M14 40 L28 20 L42 40 M14 54 L28 34 L42 54",
  brake: "M11 31 a17 17 0 1 0 34 0 a17 17 0 1 0 -34 0 M22 31 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0"
    + " M42 21 h9 v14 h-9",
  handbrake: "M16 48 L34 23 M31 17 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M11 50 h13",
  camera: "M12 22 h9 l4 -6 h11 l4 6 h9 v24 h-37 z M28 34 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0",
  reset: "M42 30 a14 14 0 1 1 -5 -10 M39 8 v13 h-13",
});

const PRESSED = "ort-on";

function stylesheet() {
  return `
.ort {
  position: absolute; inset: 0; pointer-events: none;
  font-family: ui-sans-serif, "Segoe UI Variable Display", "Segoe UI", Inter, Roboto, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
  -webkit-user-select: none; user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  z-index: 6;
}
.ort[data-hidden="1"] { display: none; }
.ort * { box-sizing: border-box; margin: 0; padding: 0; }

.ort-c {
  position: absolute;
  pointer-events: auto;
  /* No pan, no pinch, no double-tap zoom and no pull-to-refresh from a control —
     a stage that scrolls the page under the canvas is over. */
  touch-action: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.18rem;
  border: 1px solid rgba(150,175,205,0.26);
  border-radius: 14px;
  background: linear-gradient(168deg, rgba(13,18,24,0.72), rgba(8,11,15,0.5));
  backdrop-filter: blur(7px) saturate(1.2);
  -webkit-backdrop-filter: blur(7px) saturate(1.2);
  box-shadow: 0 6px 18px rgba(0,0,0,0.4);
  color: #cdd8e6;
  transition: background 90ms linear, border-color 90ms linear, transform 90ms linear;
}
.ort-c.${PRESSED} { transform: scale(0.97); border-color: rgba(255,190,120,0.75); }

.ort-label {
  font-size: 0.52rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
  color: rgba(190,205,225,0.72);
}
.ort-glyph { width: 42%; max-width: 46px; height: auto; overflow: visible; }
.ort-glyph path { fill: none; stroke: currentColor; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }

.ort-throttle { color: #7de6a6; border-color: rgba(90,220,150,0.34); }
.ort-throttle.${PRESSED} { background: linear-gradient(168deg, rgba(30,90,58,0.82), rgba(12,40,26,0.62)); }
.ort-brake { color: #ff8a95; border-color: rgba(255,110,125,0.34); }
.ort-brake.${PRESSED} { background: linear-gradient(168deg, rgba(104,26,34,0.86), rgba(44,12,16,0.64)); }
.ort-handbrake { color: #ffc27a; flex-direction: row; gap: 0.5rem; }
.ort-handbrake.${PRESSED} { background: linear-gradient(168deg, rgba(110,66,16,0.86), rgba(44,26,8,0.64)); }
.ort-handbrake .ort-glyph { width: auto; height: 60%; }
.ort-camera, .ort-reset { color: #9fb6cd; }
.ort-camera .ort-glyph, .ort-reset .ort-glyph { width: auto; height: 46%; }

.ort-steer {
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(10,14,20,0.62), rgba(6,9,13,0.44));
  justify-content: center;
}
.ort-notch {
  position: absolute; top: 22%; bottom: 22%; left: 50%; width: 2px; margin-left: -1px;
  background: rgba(160,185,215,0.35); border-radius: 2px;
}
.ort-ticks {
  position: absolute; left: 8%; right: 8%; top: 50%; height: 2px; margin-top: -1px;
  background: linear-gradient(90deg, rgba(160,185,215,0.05), rgba(160,185,215,0.28), rgba(160,185,215,0.05));
}
.ort-knob {
  position: absolute; top: 4px; bottom: 4px; left: 0;
  border-radius: 999px;
  border: 1px solid rgba(255,190,120,0.5);
  background: linear-gradient(180deg, rgba(255,178,88,0.5), rgba(150,74,16,0.55));
  box-shadow: 0 3px 12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,220,180,0.35);
  will-change: transform;
}
.ort-knob::after {
  content: ""; position: absolute; left: 50%; top: 26%; bottom: 26%; width: 2px; margin-left: -1px;
  background: rgba(20,12,4,0.55);
}
.ort-steer.${PRESSED} .ort-knob { border-color: rgba(255,214,160,0.9); }
/* The knob and the centre notch already say what the track is; a caption under
   them only collides with the pill's rounded edge. The name stays on aria-label. */
.ort-steer .ort-label { display: none; }
`;
}

function el(doc, tag, cls, parent) {
  const node = doc.createElement(tag);
  if (cls) node.className = cls;
  if (parent) parent.appendChild(node);
  return node;
}

function glyph(doc, parent, d) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(ns, "svg");
  svg.setAttribute("class", "ort-glyph");
  svg.setAttribute("viewBox", "0 0 56 62");
  svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(ns, "path");
  path.setAttribute("d", d);
  svg.appendChild(path);
  parent.appendChild(svg);
  return svg;
}

export function createTouchControls(root, opts = EMPTY) {
  const doc = opts.document || (root && root.ownerDocument)
    || (typeof document !== "undefined" ? document : null);
  if (!doc) throw new Error("createTouchControls needs a document");
  const view = opts.window || doc.defaultView
    || (typeof window !== "undefined" ? window : null);
  const input = opts.input ?? null;
  const nav = opts.navigator ?? view?.navigator ?? null;

  const settings = {
    steerMode: opts.steerMode === "tilt" ? "tilt" : "slider",
    deadzone: opts.deadzone ?? STEER_DEFAULTS.deadzone,
    gamma: opts.steerGamma ?? STEER_DEFAULTS.gamma,
    returnRate: opts.returnRate ?? STEER_DEFAULTS.returnRate,
    tiltRange: opts.tiltRange ?? TILT_DEFAULTS.range,
    tiltCentre: 0,
  };

  const env = {
    force: !!opts.force,
    enabled: opts.enabled !== false,
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    coarsePointer: !!(view?.matchMedia && view.matchMedia("(pointer: coarse)").matches),
  };

  const style = el(doc, "style", null, root);
  style.textContent = stylesheet();
  const layer = el(doc, "div", "ort", root);
  layer.setAttribute("data-hidden", "1");

  const nodes = new Map();
  const listeners = [];
  const pointers = new Map();
  // The one record handed to input.js, reused every frame: a per-frame path that
  // allocates is a defect everywhere else in this game and no less here.
  const patch = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };

  let layout = controlLayout({ width: 390, height: 844 });
  let visible = false;
  let steerRest = 0;
  let feeding = false;
  let pendingCentre = false;
  let rafId = 0;
  let lastTick = 0;
  let destroyed = false;

  function on(target, type, fn, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, fn, options);
    listeners.push({ target, type, fn });
  }

  function build() {
    for (const c of layout.controls) {
      const node = el(doc, "div", `ort-c ort-${c.id}`, layer);
      node.setAttribute("data-control", c.id);
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", c.label);
      if (c.id === "steer") {
        el(doc, "div", "ort-ticks", node);
        el(doc, "div", "ort-notch", node);
        const knob = el(doc, "div", "ort-knob", node);
        nodes.set("steer-knob", knob);
      } else {
        glyph(doc, node, GLYPHS[c.id]);
      }
      const label = el(doc, "span", "ort-label", node);
      label.textContent = c.label;
      nodes.set(c.id, node);
      wire(node, c.id);
    }
  }

  // A probe is the only way to read the safe-area insets as numbers: env() is a
  // CSS value with no scripted accessor, and the controls are positioned in px.
  function readInsets() {
    insets.top = 0; insets.right = 0; insets.bottom = 0; insets.left = 0;
    if (opts.insets) {
      Object.assign(insets, opts.insets);
      return;
    }
    if (typeof view?.getComputedStyle !== "function") return;
    const probe = el(doc, "div", null, layer);
    probe.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;visibility:hidden;"
      + "padding:env(safe-area-inset-top) env(safe-area-inset-right) "
      + "env(safe-area-inset-bottom) env(safe-area-inset-left);";
    try {
      const cs = view.getComputedStyle(probe);
      insets.top = parseFloat(cs.paddingTop) || 0;
      insets.right = parseFloat(cs.paddingRight) || 0;
      insets.bottom = parseFloat(cs.paddingBottom) || 0;
      insets.left = parseFloat(cs.paddingLeft) || 0;
    } catch { /* a stub or an old engine: zero insets are the safe answer */ }
    probe.remove();
  }

  function place() {
    for (const c of layout.controls) {
      const node = nodes.get(c.id);
      if (!node) continue;
      node.style.left = `${Math.round(c.x)}px`;
      node.style.top = `${Math.round(c.y)}px`;
      node.style.width = `${Math.round(c.w)}px`;
      node.style.height = `${Math.round(c.h)}px`;
    }
    const track = controlById(layout, "steer");
    const knob = nodes.get("steer-knob");
    if (knob && track) knob.style.width = `${Math.round(knobWidth(track))}px`;
    drawKnob();
  }

  function drawKnob() {
    const track = controlById(layout, "steer");
    const knob = nodes.get("steer-knob");
    if (!knob || !track) return;
    const x = sliderXFromSteer(steerRest, track, settings) - track.x - knobWidth(track) * 0.5;
    knob.style.transform = `translateX(${Math.round(x)}px)`;
  }

  function refresh() {
    readInsets();
    layout = controlLayout({
      width: opts.viewport?.width ?? view?.innerWidth ?? 390,
      height: opts.viewport?.height ?? view?.innerHeight ?? 844,
      insets,
    });
    place();
    publish();
  }

  // Nothing else on screen can measure these controls — they live in their own
  // root under their own stylesheet — so the layout is announced rather than
  // discovered. The HUD is the one that needs it; it gets a zero reserve back
  // the moment the controls go away, so a pad player's speedo does not sit
  // halfway up the screen for the rest of the session.
  function publish() {
    opts.onLayout?.(layout, visible ? hudReserve(layout) : NO_RESERVE);
  }

  function press(node) { node.classList.add(PRESSED); }
  function unpress(node) { node.classList.remove(PRESSED); }

  function steerAt(clientX) {
    return steerFromSlider(clientX, controlById(layout, "steer"), settings);
  }

  // input.js treats a live touch record as the authority and deliberately does
  // not rate-limit it. So the record stays live while the controls are on screen
  // — a lifted finger then reads as an instant zero rather than a pedal ramp —
  // and is handed back the moment they go away, which is what lets a keyboard or
  // a pad drive the car again.
  function feed() {
    patchFromTouches(pointers.values(), steerRest, patch);
    if (!input) return;
    if (!visible) {
      if (feeding) { input.clearTouch?.(); feeding = false; }
      return;
    }
    feeding = true;
    input.setTouch?.(patch);
  }

  // The snap-back is the only thing here that animates, so the loop only runs
  // while it is happening and stops dead at centre.
  function tick(now) {
    rafId = 0;
    if (destroyed) return;
    const dt = lastTick ? clamp((now - lastTick) / 1000, 0, 0.1) : 1 / 60;
    lastTick = now;
    steerRest = steerReturn(steerRest, dt, settings.returnRate);
    drawKnob();
    feed();
    if (steerRest !== 0) schedule();
    else lastTick = 0;
  }

  function schedule() {
    if (rafId || destroyed) return;
    const raf = view?.requestAnimationFrame;
    if (typeof raf !== "function") {
      steerRest = 0;
      drawKnob();
      feed();
      return;
    }
    rafId = raf.call(view, tick);
  }

  function wire(node, id) {
    const down = (e) => {
      if (!visible) return;
      // Stops the double-tap zoom, the long-press callout and the compatibility
      // mouse events, without touching the page's own scrolling.
      e.preventDefault?.();
      if (id === "camera" || id === "reset") {
        press(node);
        opts.onAction?.(id);
        return;
      }
      try { node.setPointerCapture?.(e.pointerId); } catch { /* pointer already gone */ }
      const value = id === "steer" ? steerAt(e.clientX) : 1;
      pointers.set(e.pointerId, { control: id, value, node });
      if (id === "steer") { steerRest = value; drawKnob(); }
      press(node);
      feed();
    };

    const move = (e) => {
      const held = pointers.get(e.pointerId);
      if (!held || held.control !== id) return;
      e.preventDefault?.();
      if (id === "steer") {
        held.value = steerAt(e.clientX);
        steerRest = held.value;
        drawKnob();
        feed();
        return;
      }
      // A finger that slides off a pedal has left it. Capture means we still get
      // this event, which is the whole reason the pedal cannot stick on.
      if (hitTest(layout, e.clientX, e.clientY, RELEASE_SLOP) !== id) release(e.pointerId, node);
    };

    const up = (e) => {
      e.preventDefault?.();
      if (id === "camera" || id === "reset") { unpress(node); return; }
      release(e.pointerId, node);
    };

    on(node, "pointerdown", down, { passive: false });
    on(node, "pointermove", move, { passive: false });
    on(node, "pointerup", up, { passive: false });
    on(node, "pointercancel", up, { passive: false });
    // The browser fires this when it takes the pointer away (a system gesture, a
    // rotate). Without it the control would be held for the rest of the stage.
    on(node, "lostpointercapture", up, { passive: false });
  }

  function release(pointerId, node) {
    const held = pointers.get(pointerId);
    if (!held) return;
    pointers.delete(pointerId);
    try { held.node?.releasePointerCapture?.(pointerId); } catch { /* already released */ }
    if (node) unpress(node);
    if (held.control === "steer" && settings.steerMode === "slider") {
      let stillSteering = false;
      for (const t of pointers.values()) if (t.control === "steer") stillSteering = true;
      if (!stillSteering) { lastTick = 0; schedule(); }
    }
    feed();
  }

  function releaseAll() {
    for (const [id, held] of pointers) {
      try { held.node?.releasePointerCapture?.(id); } catch { /* already released */ }
      if (held.node) unpress(held.node);
    }
    pointers.clear();
    steerRest = 0;
    drawKnob();
    feed();
  }

  const onOrientation = (e) => {
    if (!visible || settings.steerMode !== "tilt") return;
    const angle = view?.screen?.orientation?.angle ?? view?.orientation ?? 0;
    const roll = tiltFromOrientation(e.beta, e.gamma, angle);
    // Nobody holds a phone flat, and a settings screen cannot ask them to: the
    // first reading after the mode is chosen becomes straight ahead, so however
    // the player was already holding it is the neutral they steer from.
    if (pendingCentre) { settings.tiltCentre = roll; pendingCentre = false; }
    steerRest = steerFromTilt(roll, {
      range: settings.tiltRange, centre: settings.tiltCentre, gamma: settings.gamma,
    });
    drawKnob();
    feed();
  };

  const onResize = () => refresh();
  // A phone that loses the page mid-corner must not leave the throttle pinned.
  const onHide = () => { if (doc.hidden) releaseAll(); };

  build();
  refresh();
  on(view, "resize", onResize);
  on(view, "orientationchange", onResize);
  on(view, "deviceorientation", onOrientation);
  on(doc, "visibilitychange", onHide);

  function setVisible(on_) {
    const next = !!on_ && shouldShowTouch(env);
    if (next === visible) return visible;
    visible = next;
    layer.setAttribute("data-hidden", visible ? "0" : "1");
    if (!visible) { releaseAll(); publish(); }
    else refresh();
    return visible;
  }

  return {
    element: layer,
    settings,
    get available() { return shouldShowTouch(env); },
    get visible() { return visible; },
    get layout() { return layout; },
    get pointerCount() { return pointers.size; },
    get patch() { return patch; },
    setVisible,
    setEnabled(on_) {
      env.enabled = !!on_;
      if (!shouldShowTouch(env)) setVisible(false);
      return shouldShowTouch(env);
    },
    get reserve() { return visible ? hudReserve(layout) : NO_RESERVE; },
    // The response curve and the tilt range are the two the player can feel, so
    // they are the two the settings screen offers. Everything else stays fixed.
    configure(patch = EMPTY) {
      if (Number.isFinite(patch.steerGamma)) settings.gamma = clamp(patch.steerGamma, 1, 3);
      if (Number.isFinite(patch.deadzone)) settings.deadzone = clamp(patch.deadzone, 0, 0.4);
      if (Number.isFinite(patch.tiltRange)) settings.tiltRange = clamp(patch.tiltRange, 8, 60);
      drawKnob();
      return settings;
    },
    setSteerMode(mode) {
      const next = mode === "tilt" ? "tilt" : "slider";
      if (next === settings.steerMode) return settings.steerMode;
      settings.steerMode = next;
      pendingCentre = next === "tilt";
      releaseAll();
      // iOS hands out motion events only after an explicit grant, and only from
      // a user gesture — which is exactly where a mode switch comes from.
      const ctor = view?.DeviceOrientationEvent;
      if (next === "tilt" && typeof ctor?.requestPermission === "function") {
        try { ctor.requestPermission().catch(() => {}); } catch { /* not available */ }
      }
      return settings.steerMode;
    },
    // Whatever the phone is being held at right now becomes straight ahead.
    calibrateTilt(rollDeg) {
      settings.tiltCentre = Number.isFinite(rollDeg) ? rollDeg : 0;
      return settings.tiltCentre;
    },
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      releaseAll();
      if (rafId && typeof view?.cancelAnimationFrame === "function") {
        view.cancelAnimationFrame(rafId);
      }
      rafId = 0;
      for (const { target, type, fn } of listeners) target.removeEventListener?.(type, fn);
      listeners.length = 0;
      nodes.clear();
      layer.remove();
      style.remove();
      opts.onLayout?.(layout, NO_RESERVE);
      if (feeding) { input?.clearTouch?.(); feeding = false; }
    },
  };
}
