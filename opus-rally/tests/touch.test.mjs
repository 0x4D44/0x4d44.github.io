// The touch controls are geometry and mapping, so that is what these measure:
// where each control lands at every plausible phone size, what a thumb position
// on the slider means as a steering angle, and which control a touch at (x, y)
// hits. The DOM half is then checked against a stub for the two failures that
// actually strand a player — a pedal that sticks on because its finger slid off,
// and a control set that leaks nodes or listeners every time the game restarts.

import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROL_IDS, MIN_TARGET, NO_RESERVE, RESERVED_RECT, STEER_DEFAULTS,
  clearsReserved, controlById, controlColumn, controlLayout, createTouchControls,
  hitTest, hudReserve, patchFromTouches, rectsIntersect, shouldShowTouch,
  sliderXFromSteer, steerFromSlider, steerFromTilt, steerReturn, tiltFromOrientation,
} from "../touch.js";
import { createInput } from "../input.js";

// Every viewport a phone or a small tablet actually reports, plus the awkward
// ones: a 320-wide portrait, both landscapes, and a notch's worth of insets.
const VIEWPORTS = [
  { width: 320, height: 568 }, { width: 360, height: 640 }, { width: 375, height: 667 },
  { width: 390, height: 844 }, { width: 393, height: 873 }, { width: 412, height: 915 },
  { width: 428, height: 926 }, { width: 768, height: 1024 }, { width: 834, height: 1194 },
  { width: 568, height: 320 }, { width: 640, height: 360 }, { width: 667, height: 375 },
  { width: 844, height: 390 }, { width: 926, height: 428 }, { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 390, height: 844, insets: { top: 47, bottom: 34, left: 0, right: 0 } },
  { width: 844, height: 390, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
  { width: 320, height: 568, insets: { top: 20, bottom: 34, left: 12, right: 12 } },
];

test("no control ever lands under the site-wide back pill", () => {
  for (const viewport of VIEWPORTS) {
    const layout = controlLayout(viewport);
    for (const c of layout.controls) {
      assert.ok(
        clearsReserved(c),
        `${c.id} overlaps the reserved ${RESERVED_RECT.w}x${RESERVED_RECT.h} pill `
        + `at ${viewport.width}x${viewport.height}: ${JSON.stringify(c)}`,
      );
    }
  }
});

test("every control stays on screen, inside the safe area, at a thumb-sized target", () => {
  for (const viewport of VIEWPORTS) {
    const layout = controlLayout(viewport);
    const ins = viewport.insets ?? {};
    for (const c of layout.controls) {
      assert.ok(c.x >= (ins.left ?? 0), `${c.id} crosses the left inset`);
      assert.ok(c.y >= (ins.top ?? 0), `${c.id} crosses the top inset`);
      assert.ok(c.x + c.w <= layout.width - (ins.right ?? 0) + 0.01,
        `${c.id} runs off the right at ${viewport.width}x${viewport.height}`);
      assert.ok(c.y + c.h <= layout.height - (ins.bottom ?? 0) + 0.01,
        `${c.id} runs off the bottom at ${viewport.width}x${viewport.height}`);
      assert.ok(c.w >= MIN_TARGET && c.h >= MIN_TARGET,
        `${c.id} is smaller than a thumb at ${viewport.width}x${viewport.height}: ${c.w}x${c.h}`);
    }
  }
});

test("controls never overlap each other", () => {
  for (const viewport of VIEWPORTS) {
    const { controls } = controlLayout(viewport);
    for (let i = 0; i < controls.length; i += 1) {
      for (let j = i + 1; j < controls.length; j += 1) {
        assert.ok(
          !rectsIntersect(controls[i], controls[j]),
          `${controls[i].id} overlaps ${controls[j].id} at ${viewport.width}x${viewport.height}`,
        );
      }
    }
  }
});

test("the layout carries every control the brief demands, and the slider is wide", () => {
  for (const viewport of VIEWPORTS) {
    const layout = controlLayout(viewport);
    const ids = layout.controls.map((c) => c.id).sort();
    assert.deepEqual(ids, [...CONTROL_IDS].sort(), `${viewport.width}x${viewport.height}`);
    const track = controlById(layout, "steer");
    // A slider shorter than this cannot resolve a small correction: 150 px of
    // travel is about a degree of lock per pixel on a rally car.
    assert.ok(track.w >= 150, `steer track only ${track.w}px at ${viewport.width}x${viewport.height}`);
    const throttle = controlById(layout, "throttle");
    const brake = controlById(layout, "brake");
    assert.ok(brake.x + brake.w <= throttle.x, "brake sits beside the throttle, not on it");
  }
});

test("hitTest lands a touch on the control it is over, and on nothing elsewhere", () => {
  const layout = controlLayout({ width: 390, height: 844 });
  for (const c of layout.controls) {
    assert.equal(hitTest(layout, c.x + c.w / 2, c.y + c.h / 2), c.id, `centre of ${c.id}`);
    assert.equal(hitTest(layout, c.x + 1, c.y + 1), c.id, `top-left corner of ${c.id}`);
  }
  assert.equal(hitTest(layout, 54, 20), null, "the reserved pill area belongs to no control");
  assert.equal(hitTest(layout, 195, 200), null, "the middle of the screen is free for the game");
  const throttle = controlById(layout, "throttle");
  const brake = controlById(layout, "brake");
  const gapX = (brake.x + brake.w + throttle.x) / 2;
  assert.equal(hitTest(layout, gapX, throttle.y + 10), null, "the gap between pedals is a gap");
  assert.equal(hitTest(layout, gapX, throttle.y + 10, 12), "throttle", "slop reaches the nearer pedal");
});

test("the slider is signed the way input.js reads steer: right of centre is positive", () => {
  const track = controlById(controlLayout({ width: 390, height: 844 }), "steer");
  const left = steerFromSlider(track.x, track);
  const right = steerFromSlider(track.x + track.w, track);
  const middle = steerFromSlider(track.x + track.w / 2, track);
  // POSITIVE steer is RIGHT — the gamepad convention, and the one physics and
  // the autopilot use. The slider used to be built the other way round to match
  // a keyboard path that was itself inverted, so a thumb pushed right steered
  // the car left.
  assert.equal(left, -1, "the far left of the track is full left lock (-1)");
  assert.equal(right, 1, "the far right of the track is full right lock (+1)");
  assert.equal(middle, 0, "the centre of the track is straight ahead");
  assert.ok(steerFromSlider(track.x + track.w * 0.25, track) < -0.2, "left half steers left");
  assert.ok(steerFromSlider(track.x + track.w * 0.75, track) > 0.2, "right half steers right");
});

test("the steer curve is continuous, monotone and has a deadzone that is not a step", () => {
  const track = controlById(controlLayout({ width: 390, height: 844 }), "steer");
  let previous = steerFromSlider(track.x - 30, track);
  let biggestStep = 0;
  let zeroSpan = 0;
  for (let x = track.x - 30; x <= track.x + track.w + 30; x += 1) {
    const v = steerFromSlider(x, track);
    assert.ok(Number.isFinite(v) && v >= -1 && v <= 1, `bounded at ${x}: ${v}`);
    assert.ok(v >= previous - 1e-12, `monotone right-going at ${x}: ${previous} -> ${v}`);
    biggestStep = Math.max(biggestStep, Math.abs(v - previous));
    if (v === 0) zeroSpan += 1;
    previous = v;
  }
  assert.ok(biggestStep < 0.05, `no jump in the response: biggest 1px step was ${biggestStep}`);
  assert.ok(zeroSpan >= 4, "there is a real deadzone at centre");
  assert.ok(zeroSpan < track.w * 0.25, `the deadzone is not half the track (${zeroSpan}px)`);
  // Continuity at the edge of the deadzone is the part a naive implementation
  // gets wrong: it jumps straight from 0 to the deadzone's worth of lock.
  const dead = STEER_DEFAULTS.deadzone;
  const knob = track.knob;
  const travel = track.w - knob;
  const justOutside = track.x + knob / 2 + travel * (1 - (dead + 0.002)) / 2;
  assert.ok(Math.abs(steerFromSlider(justOutside, track)) < 0.02,
    "just past the deadzone is a sliver of lock, not a lurch");
});

test("the knob position and the steer value are inverses of each other", () => {
  const track = controlById(controlLayout({ width: 428, height: 926 }), "steer");
  for (let v = -1; v <= 1.0001; v += 0.05) {
    const steer = Math.round(v * 1000) / 1000;
    const x = sliderXFromSteer(steer, track);
    assert.ok(Math.abs(steerFromSlider(x, track) - steer) < 1e-6,
      `round trip at ${steer} gave ${steerFromSlider(x, track)}`);
  }
});

test("tilt steering reads the right axis for each screen orientation", () => {
  assert.equal(tiltFromOrientation(10, 25, 0), 25, "portrait rolls on gamma");
  assert.equal(tiltFromOrientation(10, 25, 90), -10, "landscape-left rolls on -beta");
  assert.equal(tiltFromOrientation(10, 25, 180), -25, "upside down inverts gamma");
  assert.equal(tiltFromOrientation(10, 25, 270), 10, "landscape-right rolls on beta");
  assert.equal(tiltFromOrientation(NaN, undefined, 0), 0, "a missing reading is level");
});

test("tilt maps to the same signed, bounded, deadzoned steer the slider does", () => {
  assert.equal(steerFromTilt(0), 0);
  assert.ok(steerFromTilt(-15) < 0, "rolling the device left steers left (negative)");
  assert.ok(steerFromTilt(15) > 0, "rolling the device right steers right (positive)");
  assert.equal(steerFromTilt(-90), -1, "past the range is full lock, not overflow");
  assert.equal(steerFromTilt(90), 1);
  assert.equal(steerFromTilt(6, { centre: 6 }), 0, "calibration moves straight-ahead");
  let previous = steerFromTilt(-40);
  for (let d = -40; d <= 40; d += 0.5) {
    const v = steerFromTilt(d);
    assert.ok(v >= previous - 1e-12, `monotone at ${d}`);
    assert.ok(Math.abs(v - previous) < 0.06, `continuous at ${d}`);
    previous = v;
  }
});

test("releasing the slider returns to centre and stops there", () => {
  let steer = 1;
  let frames = 0;
  while (steer !== 0 && frames < 1000) { steer = steerReturn(steer, 1 / 60); frames += 1; }
  assert.equal(steer, 0, "it reaches exactly centre");
  assert.ok(frames > 6 && frames < 40, `snap-back takes a beat, not a frame or a second (${frames})`);
  assert.equal(steerReturn(0, 1 / 60), 0, "centre is a fixed point");
  assert.ok(steerReturn(-1, 1 / 60) < 0, "it does not overshoot through centre");
  assert.ok(steerReturn(-0.001, 1 / 60) === 0, "the last sliver snaps rather than crawling");
});

test("two fingers register at once, which is what left-foot braking is", () => {
  const both = patchFromTouches([
    { control: "throttle" }, { control: "brake" },
  ]);
  assert.equal(both.throttle, 1, "throttle is down");
  assert.equal(both.brake, 1, "and the brake is down at the same time");

  const three = patchFromTouches([
    { control: "steer", value: -0.6 }, { control: "throttle" }, { control: "handbrake" },
  ]);
  assert.equal(three.steer, -0.6);
  assert.equal(three.throttle, 1);
  assert.equal(three.handbrake, 1);
  assert.equal(three.brake, 0);

  const rest = patchFromTouches([{ control: "throttle" }], 0.42);
  assert.equal(rest.steer, 0.42, "with no finger on the slider the resting steer survives");

  const out = { steer: 9, throttle: 9, brake: 9, handbrake: 9 };
  const same = patchFromTouches([], 0, out);
  assert.equal(same, out, "the caller's record is reused, not replaced");
  assert.deepEqual(out, { steer: 0, throttle: 0, brake: 0, handbrake: 0 });
});

test("the controls appear on a touchscreen and stay out of the way otherwise", () => {
  assert.equal(shouldShowTouch({ maxTouchPoints: 5 }), true);
  assert.equal(shouldShowTouch({ coarsePointer: true }), true);
  assert.equal(shouldShowTouch({ maxTouchPoints: 0, coarsePointer: false }), false);
  assert.equal(shouldShowTouch({ maxTouchPoints: 5, enabled: false }), false, "the player can turn them off");
  assert.equal(shouldShowTouch({ maxTouchPoints: 0, force: true }), true, "and a test can force them on");
  assert.equal(shouldShowTouch({}), false);
});

// ------------------------------------------------------------------ DOM stub

function makeStubDom(viewport = { width: 390, height: 844 }) {
  let liveListeners = 0;

  class StubNode {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.childNodes = [];
      this.parentNode = null;
      this.attributes = {};
      this.style = { cssText: "" };
      this._text = "";
      this._classes = new Set();
      this.handlers = new Map();
      this.captured = new Set();
      this.classList = {
        add: (c) => this._classes.add(c),
        remove: (c) => this._classes.delete(c),
        contains: (c) => this._classes.has(c),
      };
    }
    get className() { return [...this._classes].join(" "); }
    set className(v) {
      this._classes = new Set(String(v).split(/\s+/).filter(Boolean));
    }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    removeChild(child) {
      const i = this.childNodes.indexOf(child);
      if (i >= 0) this.childNodes.splice(i, 1);
      child.parentNode = null;
      return child;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === "class") this.className = value;
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(type, fn) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      if (!this.handlers.get(type).has(fn)) liveListeners += 1;
      this.handlers.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      if (this.handlers.get(type)?.delete(fn)) liveListeners -= 1;
    }
    setPointerCapture(id) { this.captured.add(id); }
    releasePointerCapture(id) { this.captured.delete(id); }
    fire(type, event) {
      for (const fn of [...(this.handlers.get(type) ?? [])]) {
        fn({ preventDefault() {}, ...event });
      }
    }
  }

  const doc = {
    hidden: false,
    createElement: (tag) => new StubNode(tag),
    createElementNS: (ns, tag) => new StubNode(tag),
    handlers: new Map(),
    addEventListener(type, fn) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      if (!this.handlers.get(type).has(fn)) liveListeners += 1;
      this.handlers.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      if (this.handlers.get(type)?.delete(fn)) liveListeners -= 1;
    },
    fire(type, event) {
      for (const fn of [...(this.handlers.get(type) ?? [])]) fn({ preventDefault() {}, ...event });
    },
  };

  const view = {
    innerWidth: viewport.width,
    innerHeight: viewport.height,
    navigator: { maxTouchPoints: 5 },
    handlers: new Map(),
    addEventListener: doc.addEventListener,
    removeEventListener: doc.removeEventListener,
    fire: doc.fire,
  };
  view.handlers = new Map();

  return {
    doc,
    view,
    root: new StubNode("div"),
    get liveListeners() { return liveListeners; },
  };
}

function findAll(node, cls, out = []) {
  for (const child of node.childNodes) {
    if (child.classList?.contains(cls)) out.push(child);
    findAll(child, cls, out);
  }
  return out;
}

function control(root, id) {
  return findAll(root, `ort-${id}`)[0] ?? null;
}

function countNodes(node) {
  let n = 1;
  for (const c of node.childNodes) n += countNodes(c);
  return n;
}

// A keyboard target that can be typed on: input.js ignores the keyboard while a
// touch record is live, so "the keyboard drives again" is the only observable
// difference between handing the record back and merely zeroing it.
function keyTarget() {
  const handlers = new Map();
  return {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    removeEventListener(type, fn) { handlers.get(type)?.delete(fn); },
    press(code) {
      for (const fn of handlers.get("keydown") ?? []) fn({ code, preventDefault() {} });
    },
  };
}

// Handing the record back to input.js puts the pedals on its rate limiter, so a
// released control settles over a few frames rather than in one.
function settle(input, frames = 90) {
  let out = null;
  for (let i = 0; i < frames; i += 1) out = input.update(1 / 60, 20);
  return out;
}

function mount(dom, opts = {}) {
  const controls = createTouchControls(dom.root, {
    document: dom.doc, window: dom.view, force: true, ...opts,
  });
  controls.setVisible(true);
  return controls;
}

test("it draws its own controls and its own scoped styles, with no external assets", () => {
  const dom = makeStubDom();
  const controls = mount(dom);
  for (const id of CONTROL_IDS) {
    assert.ok(control(dom.root, id), `missing the ${id} control`);
  }
  assert.ok(findAll(dom.root, "ort-knob").length === 1, "the slider has a knob to hold");
  const style = dom.root.childNodes.find((n) => n.tagName === "STYLE");
  assert.ok(style && style.textContent.includes(".ort"), "it ships its own stylesheet");
  assert.ok(!/(^|[^-\w.]):root|(^|\s)body\s*\{|(^|\s)html\s*\{/.test(style.textContent),
    "styles must not reach outside the controls");
  assert.ok(!/url\(|@import/.test(style.textContent), "no external assets");
  // Without this the browser pans the page, fires pull-to-refresh and zooms on a
  // double tap while the player is trying to drive.
  assert.match(style.textContent, /\.ort-c\s*\{[^}]*touch-action:\s*none/);
  assert.match(style.textContent, /\.ort\s*\{[^}]*pointer-events:\s*none/);
  assert.match(style.textContent, /\.ort-c\s*\{[^}]*pointer-events:\s*auto/);
  controls.destroy();
});

test("the controls are positioned exactly where the layout says they are", () => {
  const dom = makeStubDom({ width: 412, height: 915 });
  const controls = mount(dom);
  for (const c of controls.layout.controls) {
    const node = control(dom.root, c.id);
    assert.equal(node.style.left, `${Math.round(c.x)}px`, `${c.id} left`);
    assert.equal(node.style.top, `${Math.round(c.y)}px`, `${c.id} top`);
    assert.equal(node.style.width, `${Math.round(c.w)}px`, `${c.id} width`);
    assert.equal(node.style.height, `${Math.round(c.h)}px`, `${c.id} height`);
  }
  controls.destroy();
});

test("throttle and brake are independently pressable at the same time", () => {
  const dom = makeStubDom();
  const input = createInput({ target: { addEventListener() {}, removeEventListener() {} } });
  const controls = mount(dom, { input });

  const throttle = control(dom.root, "throttle");
  const brake = control(dom.root, "brake");
  const tRect = controlById(controls.layout, "throttle");
  const bRect = controlById(controls.layout, "brake");
  throttle.fire("pointerdown", { pointerId: 1, clientX: tRect.x + 10, clientY: tRect.y + 10 });
  brake.fire("pointerdown", { pointerId: 2, clientX: bRect.x + 10, clientY: bRect.y + 10 });

  assert.equal(controls.pointerCount, 2, "two fingers are tracked, not one");
  const out = input.update(1 / 60, 22);
  assert.equal(out.throttle, 1, "the throttle is on");
  assert.equal(out.brake, 1, "and so is the brake");
  assert.equal(input.scheme, "touch");

  // Lifting one finger must not lift the other.
  throttle.fire("pointerup", { pointerId: 1 });
  const after = input.update(1 / 60, 22);
  assert.equal(after.throttle, 0);
  assert.equal(after.brake, 1, "the brake stays down when the throttle finger lifts");

  brake.fire("pointerup", { pointerId: 2 });
  const idle = input.update(1 / 60, 22);
  // No ramp: a touch record is analogue already, so a lift is a lift.
  assert.equal(idle.brake, 0, "and lifting the last finger is instant, not a pedal ramp");
  controls.destroy();
  input.destroy();
});

test("a finger that slides off a pedal releases it instead of sticking it on", () => {
  const dom = makeStubDom();
  const input = createInput({ target: { addEventListener() {}, removeEventListener() {} } });
  const controls = mount(dom, { input });
  const throttle = control(dom.root, "throttle");
  const rect = controlById(controls.layout, "throttle");

  throttle.fire("pointerdown", { pointerId: 7, clientX: rect.x + 20, clientY: rect.y + 20 });
  assert.ok(throttle.captured.has(7), "the control captures the pointer, so it hears what happens next");
  assert.equal(input.update(1 / 60, 30).throttle, 1);

  // Straight up out of the top of the pedal, where a real thumb goes.
  throttle.fire("pointermove", { pointerId: 7, clientX: rect.x + 20, clientY: rect.y - 120 });
  assert.equal(controls.pointerCount, 0, "the pedal let go");
  assert.equal(input.update(1 / 60, 30).throttle, 0, "and the throttle is off");
  assert.ok(!throttle.captured.has(7), "the capture is handed back");

  // The pointerup that then arrives anywhere must not resurrect it.
  throttle.fire("pointerup", { pointerId: 7 });
  assert.equal(input.update(1 / 60, 30).throttle, 0);
  controls.destroy();
  input.destroy();
});

test("a pointer the browser takes away does not leave the throttle pinned", () => {
  const dom = makeStubDom();
  const input = createInput({ target: { addEventListener() {}, removeEventListener() {} } });
  const controls = mount(dom, { input });
  const throttle = control(dom.root, "throttle");
  const rect = controlById(controls.layout, "throttle");
  throttle.fire("pointerdown", { pointerId: 3, clientX: rect.x + 8, clientY: rect.y + 8 });
  assert.equal(input.update(1 / 60, 30).throttle, 1);
  throttle.fire("pointercancel", { pointerId: 3 });
  assert.equal(input.update(1 / 60, 30).throttle, 0);
  assert.equal(controls.pointerCount, 0);
  controls.destroy();
  input.destroy();
});

test("the slider steers the car analogue-ly and holds where the thumb is", () => {
  const dom = makeStubDom();
  const input = createInput({ target: { addEventListener() {}, removeEventListener() {} } });
  const controls = mount(dom, { input });
  const steer = control(dom.root, "steer");
  const track = controlById(controls.layout, "steer");

  steer.fire("pointerdown", { pointerId: 1, clientX: track.x + track.w * 0.25, clientY: track.y + 10 });
  const left = input.update(1 / 60, 40).steer;
  assert.ok(left < -0.2 && left > -1, `a quarter of the way along is part lock, got ${left}`);

  // Holding it there must not decay, and the touch path must bypass the
  // keyboard rate limiter — a slider is already analogue.
  for (let i = 0; i < 60; i += 1) input.update(1 / 60, 40);
  assert.equal(input.update(1 / 60, 40).steer, left, "the angle holds while the thumb holds");

  // Sliding vertically off the track keeps steering: the finger is captured, and
  // a driver's thumb wanders off a thin strip constantly.
  steer.fire("pointermove", { pointerId: 1, clientX: track.x + 1, clientY: track.y - 200 });
  assert.equal(input.update(1 / 60, 40).steer, -1, "full left lock is reachable");
  steer.fire("pointermove", { pointerId: 1, clientX: track.x + track.w - 1, clientY: track.y + 5 });
  assert.equal(input.update(1 / 60, 40).steer, 1, "and so is full right lock");
  controls.destroy();
  input.destroy();
});

test("with no animation frame available the slider centres itself on release", () => {
  const dom = makeStubDom();
  const input = createInput({ target: { addEventListener() {}, removeEventListener() {} } });
  const controls = mount(dom, { input });
  const steer = control(dom.root, "steer");
  const track = controlById(controls.layout, "steer");
  steer.fire("pointerdown", { pointerId: 1, clientX: track.x + 4, clientY: track.y + 4 });
  assert.equal(input.update(1 / 60, 40).steer, -1);
  steer.fire("pointerup", { pointerId: 1 });
  assert.equal(input.update(1 / 60, 40).steer, 0, "letting go straightens the wheel");
  controls.destroy();
  input.destroy();
});

test("the camera and reset buttons report an action and touch nothing else", () => {
  const dom = makeStubDom();
  const input = createInput({ target: { addEventListener() {}, removeEventListener() {} } });
  const fired = [];
  const controls = mount(dom, { input, onAction: (a) => fired.push(a) });
  control(dom.root, "camera").fire("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
  control(dom.root, "reset").fire("pointerdown", { pointerId: 2, clientX: 0, clientY: 0 });
  assert.deepEqual(fired, ["camera", "reset"]);
  assert.equal(controls.pointerCount, 0, "a momentary button is not a held control");
  assert.equal(input.scheme, "keyboard", "and it does not seize the input scheme");
  controls.destroy();
  input.destroy();
});

test("a hidden control set is inert, so it cannot eat a menu tap", () => {
  const dom = makeStubDom();
  const target = keyTarget();
  const input = createInput({ target });
  const controls = createTouchControls(dom.root, {
    document: dom.doc, window: dom.view, force: true, input,
  });
  assert.equal(controls.visible, false, "it starts hidden");
  assert.equal(controls.element.getAttribute("data-hidden"), "1");
  const throttle = control(dom.root, "throttle");
  throttle.fire("pointerdown", { pointerId: 1, clientX: 0, clientY: 0 });
  assert.equal(controls.pointerCount, 0);
  assert.equal(input.update(1 / 60, 0).throttle, 0);

  controls.setVisible(true);
  assert.equal(controls.element.getAttribute("data-hidden"), "0");
  throttle.fire("pointerdown", { pointerId: 2, clientX: 0, clientY: 0 });
  assert.equal(input.update(1 / 60, 0).throttle, 1);

  // Going back to a menu mid-throttle must not leave it applied.
  controls.setVisible(false);
  assert.ok(settle(input).throttle < 1e-6, "hiding them releases the throttle");
  assert.equal(controls.pointerCount, 0);
  target.press("ArrowUp");
  assert.ok(settle(input, 30).throttle > 0.9, "and gives the keyboard the car back");
  controls.destroy();
  input.destroy();
});

test("a mouse-only machine never sees them", () => {
  const dom = makeStubDom();
  dom.view.navigator = { maxTouchPoints: 0 };
  const controls = createTouchControls(dom.root, { document: dom.doc, window: dom.view });
  assert.equal(controls.available, false);
  assert.equal(controls.setVisible(true), false, "asking for them does not conjure them");
  assert.equal(controls.visible, false);
  controls.destroy();
});

test("the layout follows a rotation", () => {
  const dom = makeStubDom({ width: 390, height: 844 });
  const controls = mount(dom);
  assert.equal(controls.layout.portrait, true);
  const before = controlById(controls.layout, "steer").w;
  dom.view.innerWidth = 844;
  dom.view.innerHeight = 390;
  dom.view.fire("orientationchange", {});
  assert.equal(controls.layout.portrait, false, "it noticed the rotation");
  assert.notEqual(controlById(controls.layout, "steer").w, before);
  assert.equal(
    control(dom.root, "throttle").style.left,
    `${Math.round(controlById(controls.layout, "throttle").x)}px`,
    "and moved the controls with it",
  );
  for (const c of controls.layout.controls) {
    assert.ok(clearsReserved(c), `${c.id} clears the pill after rotating`);
  }
  controls.destroy();
});

test("create and destroy leaves nothing behind, over many cycles", () => {
  const dom = makeStubDom();
  const baseNodes = countNodes(dom.root);
  assert.equal(dom.liveListeners, 0);
  for (let i = 0; i < 200; i += 1) {
    const input = createInput({ target: { addEventListener() {}, removeEventListener() {} } });
    const controls = mount(dom, { input });
    const throttle = control(dom.root, "throttle");
    const rect = controlById(controls.layout, "throttle");
    throttle.fire("pointerdown", { pointerId: i, clientX: rect.x + 5, clientY: rect.y + 5 });
    controls.destroy();
    input.destroy();
  }
  assert.equal(countNodes(dom.root), baseNodes, "every node it made, it removed");
  assert.equal(dom.root.childNodes.length, 0);
  assert.equal(dom.liveListeners, 0, "every listener it added, it removed");
});

test("destroy hands the input record back rather than leaving a pedal applied", () => {
  const dom = makeStubDom();
  const target = keyTarget();
  const input = createInput({ target });
  const controls = mount(dom, { input });
  const throttle = control(dom.root, "throttle");
  const rect = controlById(controls.layout, "throttle");
  throttle.fire("pointerdown", { pointerId: 1, clientX: rect.x + 5, clientY: rect.y + 5 });
  assert.equal(input.update(1 / 60, 30).throttle, 1);
  controls.destroy();
  assert.ok(settle(input).throttle < 1e-6, "the throttle does not survive the controls");
  // A live touch record outranks the keyboard in input.js, so a record left
  // behind would leave the keys dead for the rest of the session.
  target.press("ArrowUp");
  assert.ok(settle(input, 30).throttle > 0.9, "the keyboard drives the car again");
  input.destroy();
});

test("a backgrounded page drops every held control", () => {
  const dom = makeStubDom();
  const input = createInput({ target: { addEventListener() {}, removeEventListener() {} } });
  const controls = mount(dom, { input });
  const throttle = control(dom.root, "throttle");
  const rect = controlById(controls.layout, "throttle");
  throttle.fire("pointerdown", { pointerId: 1, clientX: rect.x + 5, clientY: rect.y + 5 });
  assert.equal(input.update(1 / 60, 30).throttle, 1);
  dom.doc.hidden = true;
  dom.doc.fire("visibilitychange", {});
  assert.equal(input.update(1 / 60, 30).throttle, 0);
  assert.equal(controls.pointerCount, 0);
  controls.destroy();
  input.destroy();
});

// The two blocks the HUD's bottom rail actually carries, measured in Chrome with
// the game running: the speed/gear cluster on the right, the damage panel on the
// left. They are fixtures rather than imports because hud.js sizes them from a
// stylesheet no Node test can lay out — if the HUD grows past these, this test
// stops proving anything and should be re-measured.
const HUD_CLUSTER = { portrait: { w: 199, h: 80 }, landscape: { w: 290, h: 170 } };
const HUD_PANEL = { w: 120, h: 90 };
const HUD_PAD = 12;

function hudBlocks(layout, viewport) {
  const r = hudReserve(layout);
  const ins = viewport.insets ?? {};
  const padL = Math.max(HUD_PAD, ins.left ?? 0);
  const padR = Math.max(HUD_PAD, ins.right ?? 0);
  const padB = Math.max(HUD_PAD, ins.bottom ?? 0);
  const size = layout.portrait ? HUD_CLUSTER.portrait : HUD_CLUSTER.landscape;
  return {
    cluster: {
      x: layout.width - padR - r.rightSide - size.w,
      y: layout.height - padB - r.rightBottom - size.h,
      w: size.w, h: size.h,
    },
    panel: {
      x: padL,
      y: layout.height - padB - r.leftBottom - HUD_PANEL.h,
      w: HUD_PANEL.w, h: HUD_PANEL.h,
    },
  };
}

// The pill rule one level up: a speed readout under a throttle pedal is exactly
// as useful as a button under the almanac pill. Measured before the reserve
// existed, the slider covered 81% of the portrait cluster and the pedals and
// handbrake covered 63% of the landscape one.
test("the reserve the HUD is handed really clears every control", () => {
  for (const viewport of VIEWPORTS) {
    const layout = controlLayout(viewport);
    const at = `${viewport.width}x${viewport.height}`;
    const { cluster, panel } = hudBlocks(layout, viewport);
    for (const [name, block] of [["speed cluster", cluster], ["damage panel", panel]]) {
      for (const c of layout.controls) {
        assert.ok(!rectsIntersect(block, c),
          `${at}: the ${name} at ${JSON.stringify(block)} lands under ${c.id} ${JSON.stringify(c)}`);
      }
      assert.ok(block.x >= 0 && block.y >= 0,
        `${at}: the reserve pushed the ${name} off the screen: ${JSON.stringify(block)}`);
      assert.ok(!rectsIntersect(block, RESERVED_RECT),
        `${at}: the reserve pushed the ${name} under the back pill`);
    }
  }
});

test("no reserve is asked for when the controls are not on screen", () => {
  assert.deepEqual({ ...NO_RESERVE }, { leftBottom: 0, rightBottom: 0, rightSide: 0 });
  const dom = makeStubDom();
  const seen = [];
  const controls = createTouchControls(dom.root, {
    document: dom.doc, window: dom.view, force: true,
    onLayout: (_l, reserve) => seen.push(reserve),
  });
  assert.ok(seen.length > 0, "the layout is announced as soon as it exists");
  assert.deepEqual(seen[seen.length - 1], NO_RESERVE, "and it is nothing while they are hidden");

  controls.setVisible(true);
  const up = seen[seen.length - 1];
  assert.ok(up.leftBottom > 0 && up.rightBottom > 0, `showing them claims space: ${JSON.stringify(up)}`);

  controls.setVisible(false);
  assert.deepEqual(seen[seen.length - 1], NO_RESERVE, "hiding them hands it straight back");

  controls.setVisible(true);
  controls.destroy();
  assert.deepEqual(seen[seen.length - 1], NO_RESERVE,
    "and so does destroying them, or a pad player's speedo stays halfway up the screen");
});

// A control the thumb cannot reach while holding the phone is not a control. The
// slider used to run the full width in portrait, which put full right lock at
// x=347 on a 390 px phone — past the left thumb's arc, and under the right thumb
// that is holding a pedal.
test("each control sits in a thumb's corner, not across the screen", () => {
  for (const viewport of VIEWPORTS) {
    const layout = controlLayout(viewport);
    const at = `${viewport.width}x${viewport.height}`;
    const ins = viewport.insets ?? {};
    const track = controlById(layout, "steer");
    const throttle = controlById(layout, "throttle");

    assert.ok(track.x <= (ins.left ?? 0) + 16, `${at}: the track has left the left edge (${track.x})`);
    assert.ok(layout.width - (throttle.x + throttle.w) <= (ins.right ?? 0) + 16,
      `${at}: the throttle has left the right edge`);
    assert.equal(Math.round(track.y + track.h), Math.round(throttle.y + throttle.h),
      `${at}: the two thumbs should rest on the same line`);
    assert.ok(track.x + track.w <= layout.width * 0.62,
      `${at}: full lock is at x=${(track.x + track.w).toFixed(0)}, outside a thumb's arc`);
    assert.ok(track.w - track.knob >= 88,
      `${at}: only ${(track.w - track.knob).toFixed(0)}px of travel, which cannot resolve a correction`);

    // Everything that is not the slider stands in one column against the right
    // edge, so the middle of the screen — where the car and the road are — is
    // never covered.
    const column = controlColumn(layout);
    assert.ok(column.x > layout.width * 0.45,
      `${at}: the control column reaches ${column.x.toFixed(0)}, over the middle of the screen`);
    for (const c of layout.controls) {
      if (c.id === "steer") continue;
      assert.ok(c.x >= column.x - 0.01 && c.y >= column.y - 0.01, `${at}: ${c.id} is outside the column`);
    }
  }
});

test("camera and reset take the smallest target on the screen, because a stray reset costs a stage", () => {
  for (const viewport of VIEWPORTS) {
    const layout = controlLayout(viewport);
    const at = `${viewport.width}x${viewport.height}`;
    const area = (c) => c.w * c.h;
    for (const id of ["camera", "reset"]) {
      const aux = controlById(layout, id);
      assert.ok(aux.w >= MIN_TARGET && aux.h >= MIN_TARGET, `${at}: ${id} is under a thumb`);
      for (const driving of ["steer", "throttle", "brake", "handbrake"]) {
        assert.ok(area(aux) < area(controlById(layout, driving)),
          `${at}: ${id} is not smaller than the ${driving}`);
      }
    }
  }
});

// The whole argument for a curve rather than a straight line: the first fifth of
// lock is where a correction at speed lives, so it gets the pixels.
test("the track spends its pixels near centre, where a correction at speed lives", () => {
  const track = controlById(controlLayout({ width: 390, height: 844 }), "steer");
  const span = (a, b) => Math.abs(sliderXFromSteer(b, track) - sliderXFromSteer(a, track));
  const nearCentre = span(0, 0.2);
  const atLock = span(0.8, 1);
  assert.ok(nearCentre > atLock * 1.6,
    `the first fifth of lock gets ${nearCentre.toFixed(1)}px and the last ${atLock.toFixed(1)}px`);
  // Symmetry both ways, or the car pulls to one side under the same thumb travel.
  assert.ok(Math.abs(span(0, 0.2) - span(0, -0.2)) < 1e-9, "the curve is symmetric about centre");

  // A softer curve widens that band further; that is the whole point of the setting.
  const soft = { deadzone: STEER_DEFAULTS.deadzone, gamma: 2.2 };
  const softSpan = Math.abs(
    sliderXFromSteer(0.2, track, soft) - sliderXFromSteer(0, track, soft),
  );
  assert.ok(softSpan > nearCentre,
    `raising the curve should widen the fine band (${softSpan.toFixed(1)} vs ${nearCentre.toFixed(1)})`);
});

test("the settings screen can reshape the steering the player is holding", () => {
  const dom = makeStubDom();
  const controls = mount(dom);
  const track = controlById(controls.layout, "steer");
  const node = control(dom.root, "steer");
  const quarter = track.x + track.w * 0.62;

  node.fire("pointerdown", { pointerId: 1, clientX: quarter, clientY: track.y + 10 });
  const sharp = controls.patch.steer;

  controls.configure({ steerGamma: 2.4 });
  node.fire("pointermove", { pointerId: 1, clientX: quarter, clientY: track.y + 10 });
  const soft = controls.patch.steer;
  assert.ok(soft < sharp && soft > 0,
    `the same thumb position should ask for less lock on a softer curve (${sharp} -> ${soft})`);
  assert.equal(controls.settings.gamma, 2.4);

  controls.configure({ tiltRange: 40 });
  assert.equal(controls.settings.tiltRange, 40);
  controls.configure({ steerGamma: 99, tiltRange: -5 });
  assert.ok(controls.settings.gamma <= 3 && controls.settings.tiltRange >= 8,
    "a nonsense value from storage is clamped, not obeyed");
  controls.destroy();
});

// iOS never asks a player to lay the phone flat, and no settings screen can
// either: whatever they are holding when they choose tilt becomes straight ahead.
test("switching to tilt takes the angle the phone is already at as straight ahead", () => {
  const dom = makeStubDom();
  const input = createInput({ target: { addEventListener() {}, removeEventListener() {} } });
  const controls = mount(dom, { input });
  controls.setSteerMode("tilt");
  dom.view.fire("deviceorientation", { beta: 4, gamma: 18 });
  assert.equal(controls.patch.steer, 0, "the first reading after the switch is centre");
  dom.view.fire("deviceorientation", { beta: 4, gamma: 30 });
  assert.ok(controls.patch.steer > 0, "and rolling further right from there steers right");
  dom.view.fire("deviceorientation", { beta: 4, gamma: 6 });
  assert.ok(controls.patch.steer < 0, "rolling back past it steers left");
  controls.destroy();
  input.destroy();
});
