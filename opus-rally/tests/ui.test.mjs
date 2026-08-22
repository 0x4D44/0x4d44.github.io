// Tests for ui.js. The pure model/geometry/input functions are tested directly;
// the DOM half runs against the minimal stub below rather than a real browser, so
// the whole file runs under plain `node tests/ui.test.mjs`.

import * as UI from "../ui.js";

let checks = 0;
const failures = [];

function ok(cond, label, extra) {
  checks += 1;
  if (!cond) failures.push(label + (extra != null ? " — " + extra : ""));
}
function eq(actual, expected, label) {
  ok(Object.is(actual, expected), label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function near(actual, expected, tol, label) {
  ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tol, label,
    `expected ${expected} +/- ${tol}, got ${actual}`);
}
function throws(fn, label) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  ok(threw, label);
}
function group(name, fn) {
  try { fn(); } catch (err) { failures.push(`${name}: threw ${err && err.stack ? err.stack : err}`); }
}

// ---- DOM stub -------------------------------------------------------------
// Only the surface ui.js actually touches. Event dispatch bubbles, focus() moves
// document.activeElement, and every listener is counted so the leak test can
// assert the count returns to zero.

function makeDom() {
  const doc = {
    __listeners: 0,
    __created: 0,
    activeElement: null,
  };

  class Node {
    constructor(tag, ns) {
      this.tagName = String(tag).toUpperCase();
      this.namespaceURI = ns ?? null;
      this.childNodes = [];
      this.parentNode = null;
      this.attributes = new Map();
      this.style = {};
      this.listeners = new Map();
      this.ownerDocument = doc;
      this._text = null;
      doc.__created += 1;
      const self = this;
      this.classList = {
        add(...names) { self._classes(names, true); },
        remove(...names) { self._classes(names, false); },
        toggle(name, force) { self._classes([name], force === undefined ? !self._hasClass(name) : !!force); },
        contains(name) { return self._hasClass(name); },
      };
    }
    _classNames() {
      const v = this.attributes.get("class");
      return v ? v.split(/\s+/).filter(Boolean) : [];
    }
    _hasClass(name) { return this._classNames().includes(name); }
    _classes(names, on) {
      const set = this._classNames();
      for (const n of names) {
        const i = set.indexOf(n);
        if (on && i < 0) set.push(n);
        if (!on && i >= 0) set.splice(i, 1);
      }
      this.attributes.set("class", set.join(" "));
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) { this.attributes.delete(name); }
    hasAttribute(name) { return this.attributes.has(name); }
    get children() { return this.childNodes.filter((n) => n instanceof Node); }
    appendChild(child) {
      if (child instanceof Fragment) {
        for (const c of child.childNodes.slice()) this.appendChild(c);
        child.childNodes.length = 0;
        return child;
      }
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
    replaceChildren(...nodes) {
      for (const c of this.childNodes.slice()) { c.parentNode = null; }
      this.childNodes.length = 0;
      for (const n of nodes) if (n) this.appendChild(n);
    }
    set textContent(v) {
      for (const c of this.childNodes) c.parentNode = null;
      this.childNodes.length = 0;
      this._text = String(v);
    }
    get textContent() {
      if (this._text != null && this.childNodes.length === 0) return this._text;
      let out = this._text ?? "";
      for (const c of this.childNodes) out += c.textContent;
      return out;
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
      doc.__listeners += 1;
    }
    removeEventListener(type, fn) {
      const list = this.listeners.get(type);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) { list.splice(i, 1); doc.__listeners -= 1; }
    }
    dispatchEvent(ev) {
      let node = this;
      const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...ev };
      while (node) {
        const list = node.listeners.get(event.type);
        if (list) for (const fn of list.slice()) fn(event);
        node = node.parentNode;
      }
      return event;
    }
    focus() { doc.activeElement = this; }
  }

  class TextNode {
    constructor(text) { this._text = String(text); this.parentNode = null; this.listeners = new Map(); }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
  }

  class Fragment extends Node {
    constructor() { super("#fragment"); }
  }

  doc.createElement = (tag) => new Node(tag, null);
  doc.createElementNS = (ns, tag) => new Node(tag, ns);
  doc.createTextNode = (t) => new TextNode(t);
  doc.createDocumentFragment = () => new Fragment();
  doc.head = new Node("head");
  doc.body = new Node("body");
  const docTarget = new Node("#document");
  doc.addEventListener = (t, f) => docTarget.addEventListener(t, f);
  doc.removeEventListener = (t, f) => docTarget.removeEventListener(t, f);

  const timers = new Map();
  let timerSeq = 1;
  let rafSeq = 1;
  const rafs = new Map();
  const win = {
    setTimeout(fn, ms) { const id = timerSeq++; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(fn) { const id = rafSeq++; rafs.set(id, fn); return id; },
    cancelAnimationFrame(id) { rafs.delete(id); },
    navigator: { getGamepads: () => [null] },
  };
  doc.defaultView = win;

  return {
    doc, win, Node, TextNode, Fragment,
    runTimers() { for (const [id, t] of Array.from(timers)) { timers.delete(id); t.fn(); } },
    pendingTimers: () => timers.size,
    pendingRafs: () => rafs.size,
    runRaf(time) {
      const entries = Array.from(rafs);
      rafs.clear();
      for (const [, fn] of entries) fn(time);
    },
  };
}

function walk(node, fn) {
  if (!node || !node.childNodes) return;
  for (const child of node.childNodes) {
    fn(child);
    walk(child, fn);
  }
}

function collectFocusIds(root) {
  const out = [];
  walk(root, (n) => {
    if (n.getAttribute && n.getAttribute("data-or-focus")) out.push(n.getAttribute("data-or-focus"));
  });
  return out;
}

function countNodes(root) {
  let n = 0;
  walk(root, () => { n += 1; });
  return n;
}

group("wordmark", () => {
  const a = UI.wordmarkSpec();
  const b = UI.wordmarkSpec();
  eq(a.missing, 0, "wordmark: every letter has a glyph");
  ok(a.width > 0 && a.height > 0, "wordmark: positive extent");
  eq(a.viewBox.length, 4, "wordmark: viewBox has four numbers");
  ok(a.strokes.length >= 12, "wordmark: OPUS+RALLY emits many stroke subpaths", a.strokes.length);
  eq(a.shapes.length, 1, "wordmark: one chicane motif");
  eq(JSON.stringify(a), JSON.stringify(b), "wordmark: deterministic");
  for (const s of a.strokes) {
    ok(/^M[-0-9. L]+$/.test(s.d), "wordmark: path is a well-formed polyline", s.d.slice(0, 40));
    ok(s.d.split(/[ML]/).slice(1).every((seg) => seg.trim().split(/\s+/).every((n) => Number.isFinite(Number(n)))),
      "wordmark: every coordinate is finite");
    ok(s.width > 0, "wordmark: stroke width positive");
  }
  const svg = UI.wordmarkSvgString(a);
  ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), "wordmark: svg string is a single element");
  ok(svg.includes(`viewBox="${a.viewBox.join(" ")}"`), "wordmark: svg carries the spec viewBox");
  const custom = UI.wordmarkSpec({ text: "STAGE", sub: "NOTE" });
  eq(custom.missing, 0, "wordmark: alternate lockup also fully drawn");
});

group("reserved rectangle", () => {
  ok(UI.SAFE_INSET > UI.RESERVED_RECT.w, "safe inset clears the back pill horizontally");
  ok(UI.TOPBAR_H > UI.RESERVED_RECT.h, "topbar is taller than the back pill");
  for (const name of UI.REGIONS) {
    for (const vp of [{ w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1440, h: 900 }, { w: 320, h: 480 }]) {
      const r = UI.regionRect(name, vp);
      ok(UI.clearsReserved(r), `region ${name} clears the reserved rect at ${vp.w}x${vp.h}`,
        JSON.stringify(r));
      ok(r.w > 0 && r.h > 0, `region ${name} has positive extent at ${vp.w}x${vp.h}`);
    }
  }
  ok(UI.rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, UI.RESERVED_RECT), "rectsIntersect detects an overlap");
  ok(!UI.rectsIntersect({ x: 109, y: 0, w: 10, h: 10 }, UI.RESERVED_RECT), "rectsIntersect is half-open at the edge");
});

const DATA = UI.demoData();

group("screen models", () => {
  eq(UI.SCREENS.length, 11, "eleven screens");
  for (const screen of UI.SCREENS) {
    const model = UI.buildScreenModel(screen, DATA);
    eq(model.screen, screen, `${screen}: model reports its own id`);
    const problems = UI.validateModel(model);
    eq(problems.length, 0, `${screen}: model validates`, problems.join("; "));
    const order = UI.focusOrder(model);
    eq(new Set(order).size, order.length, `${screen}: focus order has no duplicates`);
    if (screen !== "loading") ok(order.length > 0, `${screen}: has something focusable`);
    for (const vp of [{ w: 390, h: 844 }, { w: 1440, h: 900 }]) {
      for (const placed of UI.layoutModel(model, vp)) {
        if (!placed.interactive) continue;
        ok(UI.clearsReserved(placed.rect),
          `${screen}: interactive ${placed.id} clears the reserved rect at ${vp.w}px`,
          JSON.stringify(placed.rect));
      }
    }
  }
  throws(() => UI.buildScreenModel("nope", DATA), "unknown screen throws");
  const dup = { screen: "x", sections: [{ id: "a", items: [{ id: "b", kind: "button" }, { id: "b", kind: "button" }] }] };
  ok(UI.validateModel(dup).some((p) => p.includes("duplicate")), "validateModel catches duplicate ids");
  ok(UI.validateModel({ screen: "x", sections: [{ id: "a", region: "nowhere", items: [] }] })
    .some((p) => p.includes("unknown region")), "validateModel catches an unknown region");
});

// The stylesheet and the DOM builder are two halves of one decision and nothing
// in the language ties them together: a rule can name a selector the builder
// never emits (`.or-body>[data-or-region="aside"]` — the two-column layout, dead
// because render() puts a wrapper in between) and a builder can emit a class no
// rule styles (`.or-stat-k`, which is why every stat label rendered as body
// text). Both shipped. These two groups are the tie.

function renderedRoot(screen, data) {
  const dom = makeDom();
  const root = dom.doc.createElement("div");
  const ui = UI.createUi(root, { document: dom.doc, window: dom.win, gamepad: false, screen, data });
  return { dom, ui, root, body: ui.element.children.find((c) => c._hasClass("or-body")) };
}

function findByClass(node, cls, out = []) {
  walk(node, (n) => { if (n._hasClass && n._hasClass(cls)) out.push(n); });
  return out;
}

function ancestorHasClass(node, cls) {
  for (let n = node?.parentNode; n; n = n.parentNode) if (n._hasClass && n._hasClass(cls)) return true;
  return false;
}

group("region lanes", () => {
  for (const screen of UI.SCREENS) {
    const { ui, root } = renderedRoot(screen, DATA);
    const model = ui.model;
    const regions = new Set((model.sections ?? []).map((s) => s.region ?? "main"));
    const footer = findByClass(ui.element, "or-footer")[0];
    const cols = findByClass(ui.element, "or-cols")[0];

    for (const section of model.sections ?? []) {
      const region = section.region ?? "main";
      const node = findByClass(root, "or-section").find((n) => n.getAttribute("data-or-section") === section.id);
      ok(!!node, `${screen}: section ${section.id} is rendered`);
      if (!node) continue;
      const want = region === "footer" ? "or-footer"
        : region === "dialog" ? "or-dialog"
          : region === "nav" ? "or-lane-nav"
            : region === "aside" ? "or-col-aside" : "or-col-main";
      ok(ancestorHasClass(node, want),
        `${screen}: ${region} section ${section.id} lands in .${want}`);
    }

    // The column count is what the media query keys off; get it wrong and a
    // one-column screen reserves half the viewport for nothing.
    if (cols) {
      eq(cols.getAttribute("data-or-cols"), regions.has("aside") ? "2" : "1",
        `${screen}: .or-cols declares the column count it actually has`);
    } else {
      ok(!regions.has("main") && !regions.has("aside") && !regions.has("brand"),
        `${screen}: no column wrapper only when there is nothing to put in one`);
    }
    ok(!!footer, `${screen}: the footer element exists`);
    ui.destroy();
  }
});

group("stylesheet covers what the builder emits", () => {
  const css = UI.styleText();
  const emitted = new Set();
  for (const screen of UI.SCREENS) {
    const { ui } = renderedRoot(screen, DATA);
    walk(ui.element, (n) => {
      for (const c of (n._classNames ? n._classNames() : [])) emitted.add(c);
    });
    for (const c of ui.element._classNames()) emitted.add(c);
    ui.destroy();
  }
  ok(emitted.size > 30, "the screens between them emit a real class vocabulary", emitted.size);
  for (const cls of emitted) {
    ok(css.includes("." + cls), `styleText styles .${cls}, which the DOM builder emits`);
  }
  // And the other direction, for the one shape that can silently do nothing: a
  // descendant selector rooted at a container whose children are a wrapper.
  ok(!/\.or-body\s*>/.test(css),
    "no rule reaches through .or-body with a child combinator — render() nests a wrapper there");
});

group("title screen", () => {
  const model = UI.buildTitleModel(DATA);
  const bySection = new Map((model.sections ?? []).map((s) => [s.id, s]));
  const hero = bySection.get("t-next");
  ok(!!hero, "title: there is a second column to fill");
  eq(hero?.region, "aside", "title: the dossier is the aside region");

  const kinds = (hero?.items ?? []).map((i) => i.kind);
  ok(kinds.includes("headline"), "title: the dossier leads with a headline");
  ok(kinds.includes("route"), "title: the dossier shows the route");
  ok(kinds.includes("statRow"), "title: the dossier carries the stage numbers");
  ok(kinds.includes("standings"), "title: the dossier carries the championship standings");

  const route = (hero?.items ?? []).find((i) => i.kind === "route");
  ok(route?.preview && !route.preview.empty, "title: the route preview has real geometry");
  ok((route?.preview?.d ?? "").startsWith("M"), "title: the route preview is a drawable path");
  ok(route.preview.segments.length > 1, "title: the route is coloured by surface run",
    route.preview.segments.length);

  const standings = (hero?.items ?? []).find((i) => i.kind === "standings");
  eq(standings.rows.length, 5, "title: five drivers on the board");
  eq(standings.rows.filter((r) => r.isPlayer).length, 1, "title: exactly one row is the player");
  ok(standings.rows[0].frac === 1, "title: the leader's bar is full", standings.rows[0].frac);
  ok(standings.rows.every((r) => r.frac >= 0 && r.frac <= 1), "title: every points bar is in range");
  ok(standings.rows[0].points >= standings.rows[4].points, "title: the board is in points order");

  const stats = (hero?.items ?? []).find((i) => i.kind === "statRow");
  eq(stats.cells.length, 3, "title: three stage facts, not a spec sheet");
  ok(stats.cells.every((c) => c.label && c.value && c.value !== "—"),
    "title: no stat renders as a blank dash", JSON.stringify(stats.cells));

  // The dossier is a readout, not a second menu: adding it must not have moved
  // the keyboard focus ring or given a player two ways to press the same thing.
  eq(UI.focusOrder(model).length, 7, "title: focus order is still the seven menu items");
  eq(UI.validateModel(model).length, 0, "title: model validates");

  // Nothing in the layout may be authored as developer metadata.
  const footer = bySection.get("t-meta");
  const text = JSON.stringify(footer?.items ?? []);
  ok(!/build|dev\b|debug|placeholder|TODO/i.test(text), "title: the footer carries no build metadata", text);

  const bare = UI.buildTitleModel({});
  eq(UI.validateModel(bare).length, 0, "title: a model with no career data still validates");
  ok(UI.focusOrder(bare).length > 0, "title: a first-run title screen still has a menu");
});

group("settings schema", () => {
  const defs = UI.defaultSettings();
  for (const g of UI.SETTINGS_SCHEMA) {
    ok(g.fields.length > 0, `settings group ${g.id} has fields`);
    for (const f of g.fields) {
      ok(defs[f.key] !== undefined, `default present for ${f.key}`);
      ok(typeof f.help === "string" && f.help.length > 10, `${f.key} explains itself`);
      if (f.kind === "range") {
        ok(f.min < f.max && f.step > 0, `${f.key} has a sane range`);
        ok(f.default >= f.min && f.default <= f.max, `${f.key} default inside range`);
      }
      if (f.kind === "enum") ok(f.options.includes(f.default), `${f.key} default is one of its options`);
    }
  }
  for (const a of UI.SETTINGS_SCHEMA.find((g) => g.id === "assists").fields) {
    ok(a.help.split(" ").length >= 6, `assist ${a.key} explains what it does`);
  }
  const fov = UI.settingsField("fov");
  eq(UI.coerceSetting(fov, 1000), 110, "range clamps high");
  eq(UI.coerceSetting(fov, -5), 60, "range clamps low");
  eq(UI.coerceSetting(fov, "not a number"), fov.default, "range rejects rubbish");
  const dz = UI.settingsField("padDeadzone");
  near(UI.coerceSetting(dz, 0.1234), 0.12, 1e-9, "range snaps to its step");
  const mode = UI.settingsField("cameraMode");
  eq(UI.coerceSetting(mode, "Telemetry Cam"), mode.default, "enum falls back to its default");
  eq(UI.coerceSetting(mode, "Bonnet"), "Bonnet", "enum accepts a listed option");
  eq(UI.coerceSetting(UI.settingsField("abs"), "yes"), true, "toggle coerces to boolean");

  const next = UI.applySettings(defs, { fov: 95, nonsense: 1, units: "imperial" });
  eq(next.fov, 95, "applySettings applies a known key");
  eq(next.nonsense, undefined, "applySettings drops an unknown key");
  eq(UI.settingsDiff(defs, next).sort().join(","), "fov,units", "settingsDiff lists exactly what moved");
  const ultra = UI.applyQualityPreset(defs, "Ultra");
  eq(ultra.shadows, "High", "quality preset drives the graphics group");
  eq(ultra.quality, "Ultra", "quality preset records itself");
  eq(UI.applyQualityPreset(defs, "Bogus"), defs, "unknown preset is a no-op");
});

group("keybindings", () => {
  const base = UI.cloneBinds(UI.DEFAULT_KEYBINDS);
  eq(UI.bindConflicts(base).length, 0, "shipped defaults have no conflict");
  eq(UI.resolveAction(base, "ArrowUp"), "throttle", "resolves a primary binding");
  eq(UI.resolveAction(base, "KeyD"), "steerRight", "resolves an alternate binding");
  eq(UI.resolveAction(base, "KeyJ"), null, "unbound key resolves to null");
  eq(UI.resolveAction(base, null), null, "null code resolves to null");

  const res = UI.rebind(base, "handbrake", 0, "KeyW");
  ok(res.ok, "rebinding to a used key succeeds");
  eq(res.binds.handbrake[0], "KeyW", "new binding lands in the requested slot");
  eq(res.binds.throttle[1], null, "the displaced action loses that key");
  eq(res.displaced.action, "throttle", "the displacement is reported");
  eq(UI.bindConflicts(res.binds).length, 0, "no duplicate survives a rebind");
  eq(base.throttle[1], "KeyW", "rebind does not mutate the input");

  const reserved = UI.rebind(base, "handbrake", 0, "Tab");
  ok(!reserved.ok && reserved.reason === "reserved", "Tab cannot be bound away from the menus");
  eq(reserved.binds.handbrake[0], "Space", "a rejected rebind leaves the binding alone");
  eq(UI.rebind(base, "throttle", 0, "ArrowUp").reason, "unchanged", "re-binding the same key is a no-op");
  ok(!UI.rebind(base, "teleport", 0, "KeyT").ok, "unknown action is rejected");
  eq(UI.rebind(base, "handbrake", 0, null).binds.handbrake[0], null, "a binding can be cleared");

  eq(UI.keyLabel("KeyW"), "W", "letter key label");
  eq(UI.keyLabel("ArrowLeft"), "←", "arrow key label");
  eq(UI.keyLabel("ShiftLeft"), "L Shift", "modifier label");
  eq(UI.keyLabel("Digit4"), "4", "digit label");
  eq(UI.keyLabel(null), "—", "empty slot label");
  for (const a of UI.ACTIONS) ok(base[a.id], `every action has a slot pair: ${a.id}`);
});

group("gamepad maths", () => {
  const dz = 0.15;
  const gamma = 1.4;
  const f = (v) => UI.axisCurve(UI.applyDeadzone(v, dz), gamma);

  eq(f(0), 0, "centre is dead");
  near(f(dz), 0, 1e-12, "output is exactly zero at the deadzone edge");
  ok(f(dz + 1e-3) > 0, "just outside the deadzone is positive");
  near(f(1), 1, 1e-12, "full deflection reaches 1");
  near(f(-1), -1, 1e-12, "full negative deflection reaches -1");

  let maxJump = 0;
  let prev = f(-1);
  let monotone = true;
  const steps = 4000;
  for (let i = 1; i <= steps; i += 1) {
    const v = -1 + (2 * i) / steps;
    const y = f(v);
    maxJump = Math.max(maxJump, Math.abs(y - prev));
    if (y < prev - 1e-12) monotone = false;
    prev = y;
  }
  ok(maxJump < 0.005, "deadzone+curve is continuous across the whole travel", "max step " + maxJump);
  ok(monotone, "deadzone+curve is monotonically increasing");
  for (const v of [0.05, 0.2, 0.5, 0.77, 1]) {
    near(f(-v), -f(v), 1e-12, `curve is odd about centre at ${v}`);
    ok(Math.sign(f(v)) === Math.sign(v) || f(v) === 0, `sign preserved at ${v}`);
  }
  eq(UI.applyDeadzone(0.5, 0), 0.5, "zero deadzone is a pass-through");
  near(UI.applyDeadzone(-0.5, 0.5), 0, 1e-12, "value at the negative deadzone edge is zero");
  near(UI.axisCurve(0.5, 1), 0.5, 1e-12, "gamma 1 is a pass-through");
  ok(UI.axisCurve(0.5, 2) < 0.5, "gamma above 1 softens the middle");

  const cal = { min: -0.8, max: 1.0, centre: 0.06, invert: false };
  near(UI.normaliseAxis(0.06, cal), 0, 1e-12, "calibrated centre maps to zero");
  near(UI.normaliseAxis(1.0, cal), 1, 1e-12, "calibrated max maps to +1");
  near(UI.normaliseAxis(-0.8, cal), -1, 1e-12, "calibrated min maps to -1");
  near(UI.normaliseAxis(5, cal), 1, 1e-12, "beyond the calibrated travel clamps");
  near(UI.normaliseAxis(1.0, { ...cal, invert: true }), -1, 1e-12, "invert flips the sign");
  near(UI.normaliseAxis(NaN, cal), 0, 1e-12, "a NaN axis reads as centred");
  // The two halves are scaled apart, so an off-centre rest position still gives
  // full travel each way with no step at the middle.
  const belowCentre = UI.normaliseAxis(0.0599, cal);
  const aboveCentre = UI.normaliseAxis(0.0601, cal);
  ok(belowCentre < 0 && aboveCentre > 0 && Math.abs(aboveCentre - belowCentre) < 1e-3,
    "no step across the calibrated centre");

  eq(UI.shapePedal(0, 0.1, 1.2), 0, "released pedal is zero");
  near(UI.shapePedal(1, 0.1, 1.2), 1, 1e-12, "floored pedal is one");
  eq(UI.shapePedal(-1, 0, 1, true), 0, "bipolar trigger at rest is zero");
  near(UI.shapePedal(1, 0, 1, true), 1, 1e-12, "bipolar trigger floored is one");
  let pedalJump = 0;
  let pv = UI.shapePedal(0, 0.08, 1.15);
  for (let i = 1; i <= 2000; i += 1) {
    const y = UI.shapePedal(i / 2000, 0.08, 1.15);
    pedalJump = Math.max(pedalJump, Math.abs(y - pv));
    pv = y;
  }
  ok(pedalJump < 0.005, "pedal shaping is continuous", "max step " + pedalJump);

  const settings = UI.defaultSettings();
  const out = UI.makePadState();
  const pad = {
    id: "Test Pad", index: 0,
    axes: [0.9, 0, -0.4, 0],
    buttons: [{ pressed: true, value: 1 }, { pressed: false, value: 0 }, { pressed: false, value: 0 },
      { pressed: false, value: 0 }, { pressed: false, value: 0 }, { pressed: false, value: 0 },
      { pressed: true, value: 0.5 }, { pressed: true, value: 1 }],
  };
  const same = UI.readGamepad(pad, UI.DEFAULT_GAMEPAD_MAP, settings, out);
  eq(same, out, "readGamepad writes into the caller's object");
  ok(out.connected, "pad reads as connected");
  ok(out.steer > 0.6, "steer axis maps through", out.steer);
  near(out.throttle, 1, 1e-9, "trigger button maps to full throttle");
  ok(out.brake > 0 && out.brake < 1, "partial brake trigger maps in between", out.brake);
  ok(out.handbrake, "face button reads as handbrake");
  UI.readGamepad(null, UI.DEFAULT_GAMEPAD_MAP, settings, out);
  ok(!out.connected && out.steer === 0 && out.throttle === 0, "a missing pad clears the state");

  const calib = UI.calibrateAxis([-0.95, -0.4, 0, 0.5, 0.98, 0.02], 0.02);
  near(calib.min, -0.95, 1e-6, "calibration finds the low extreme");
  near(calib.max, 0.98, 1e-6, "calibration finds the high extreme");
  near(calib.centre, 0.02, 1e-6, "calibration takes the rest position as centre");
  eq(UI.calibrateAxis([0.01, 0.02], 0.01).min, -1, "a stick that never moved falls back to the default");
});


if (failures.length) {
  console.error(`FAIL  ${failures.length} of ${checks} checks failed`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`PASS  ${checks} checks`);
