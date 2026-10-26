// Apex Karts - DOM UI (owner: D). Menus, HUD, countdown, pause, results, settings.
import { ROSTER, ITEMS, DIFFICULTIES, LAP_OPTIONS, formatTime, clamp } from "./roster.js";

const SETTINGS_KEY = "apexkarts.settings.v1";
const PREFS_KEY = "apexkarts.prefs.v1";
const DEFAULT_SETTINGS = { volume: 0.8, music: 0.6, sfx: 0.9, camera: "chase", touch: "auto", minimap: true, quality: "high" };

/* ---------- small helpers ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const css = (c) => (typeof c === "string" ? c : "#" + ((c >>> 0) & 0xffffff).toString(16).padStart(6, "0"));
const ord = (n) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function node(html, cls) { const d = document.createElement("div"); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }
function loadJSON(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v && typeof v === "object" ? v : fallback; } catch { return fallback; } }
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked */ } }
let uid = 0;

/* ---------- vector art ---------- */
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.9 7.5.7-5.7 5 1.8 7.4L12 18l-6.6 4 1.8-7.4-5.7-5L9 8.9z" fill="FILL" stroke="rgba(0,0,0,.4)" stroke-width="1"/></svg>';
const stars = (n) => `<span class="ak-stars">${[1, 2, 3].map((i) => STAR.replace("FILL", i <= n ? "#ffb000" : "#2b3868")).join("")}</span>`;

function itemIcon(id) {
  const f = (x, y, s, o = 0) => `<g transform="translate(${x} ${y}) scale(${s}) rotate(${o})"><path d="M0-26c3 9 13 14 13 26a13 13 0 0 1-26 0c0-7 3-10 7-14 0 5 2 7 4 7-1-8 0-14 2-19z" fill="#ff6a00"/><path d="M0-14c2 6 8 9 8 17a8 8 0 0 1-16 0c0-4 2-6 4-9 0 3 1 4 3 4-1-5-1-8 1-12z" fill="#ffc400"/><ellipse cx="0" cy="8" rx="3.5" ry="5" fill="#fff6c8"/></g>`;
  const S = {
    boost: f(32, 38, 1.05),
    triple: f(14, 42, .62) + f(32, 38, .8) + f(50, 42, .62),
    banana: '<path d="M10 12C6 38 24 58 54 50c-5 8-18 11-30 5C8 47 0 28 10 12z" fill="#ffd93b" stroke="#a87800" stroke-width="2.5" stroke-linejoin="round"/><path d="M10 12c3-4 6-4 8-2" stroke="#5a3a00" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M16 22c-1 14 8 26 26 28" stroke="#fff6a8" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".7"/>',
    green: '<circle cx="32" cy="34" r="22" fill="#fff"/><path d="M32 12a22 22 0 0 1 22 22H10a22 22 0 0 1 22-22z" fill="#22c55e"/><path d="M10 34a22 22 0 0 0 44 0z" fill="#f4f1d0"/><circle cx="32" cy="34" r="22" fill="none" stroke="#0a6b2c" stroke-width="3"/><path d="M32 12v22M18 20l14 14 14-14" stroke="#0a6b2c" stroke-width="2.5" fill="none"/><ellipse cx="25" cy="22" rx="6" ry="3.5" fill="#fff" opacity=".45" transform="rotate(-30 25 22)"/>',
    homing: '<circle cx="32" cy="34" r="22" fill="#e11d2e" stroke="#7a0010" stroke-width="3"/><circle cx="32" cy="34" r="13" fill="none" stroke="#fff" stroke-width="3"/><circle cx="32" cy="34" r="5" fill="#fff"/><path d="M32 6v10M32 52v10M4 34h10M50 34h10" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><path d="M6 20l-5-6 11 2zM58 20l5-6-11 2z" fill="#ffd0d0"/>',
    shield: '<path d="M32 4l22 8v18c0 15-10 25-22 30C20 55 10 45 10 30V12z" fill="rgba(25,211,255,.35)" stroke="#19d3ff" stroke-width="4" stroke-linejoin="round"/><path d="M32 12l14 5v12c0 10-6 17-14 21z" fill="rgba(255,255,255,.22)"/><path d="M18 18c1-2 4-4 8-5" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>',
    shock: '<path d="M38 2L12 36h15l-5 26 30-38H36z" fill="#ffe14a" stroke="#b86e00" stroke-width="3" stroke-linejoin="round"/><path d="M36 10L22 32h10" stroke="#fff" stroke-width="2.5" fill="none" opacity=".8" stroke-linecap="round"/>',
  };
  return `<svg class="ic" viewBox="0 0 64 64">${S[id] || '<text x="32" y="46" font-size="40" text-anchor="middle" fill="#fff">?</text>'}</svg>`;
}

function kartSvg(color, accent) {
  const c = css(color), a = css(accent);
  return `<svg class="kart" viewBox="0 0 200 104" aria-hidden="true">
    <ellipse cx="100" cy="94" rx="86" ry="7" fill="rgba(0,0,0,.35)"/>
    <rect x="10" y="30" width="9" height="32" rx="2" fill="${a}"/><rect x="8" y="26" width="16" height="7" rx="2" fill="${c}"/>
    <path d="M18 70l8-24 52-6 30-14 32 6 40 20 6 18z" fill="${c}"/>
    <path d="M24 60l6-14 48-5 30-13-6 18-72 14z" fill="rgba(255,255,255,.18)"/>
    <path d="M30 64l140-6 14 10H22z" fill="${a}"/>
    <path d="M112 30l12 10 30 6-6 8-60-4z" fill="rgba(0,0,0,.28)"/>
    <circle cx="102" cy="26" r="14" fill="${a}"/><path d="M98 20h20a12 12 0 0 1 0 12H98z" fill="#10172e"/><path d="M104 23h12" stroke="#7fe6ff" stroke-width="3" stroke-linecap="round"/>
    <g><circle cx="48" cy="76" r="19" fill="#12151f"/><circle cx="48" cy="76" r="9" fill="#9aa4bd"/><circle cx="48" cy="76" r="3" fill="#12151f"/></g>
    <g><circle cx="152" cy="78" r="17" fill="#12151f"/><circle cx="152" cy="78" r="8" fill="#9aa4bd"/><circle cx="152" cy="78" r="3" fill="#12151f"/></g>
  </svg>`;
}

function catmull(pts, per = 12) {
  const P = pts.map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z ?? p.y })), n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i + n - 1) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  return out;
}

function trackSvg(def, outlineFn) {
  let pts = null;
  try { if (outlineFn) pts = outlineFn(def, 120); } catch { pts = null; }
  if ((!pts || pts.length < 4) && def?.points?.length > 3) pts = catmull(def.points);
  if (!pts || pts.length < 4) {
    pts = []; for (let i = 0; i < 80; i++) { const a = (i / 80) * Math.PI * 2; pts.push({ x: Math.cos(a) * (1 + .35 * Math.sin(a * 3)), z: Math.sin(a) * .7 }); }
  }
  pts = pts.map((p) => ({ x: p.x, z: p.z ?? p.y }));
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  const W = 240, H = 170, pad = 20, sc = Math.min((W - pad * 2) / (maxX - minX || 1), (H - pad * 2) / (maxZ - minZ || 1));
  const ox = (W - (maxX - minX) * sc) / 2, oz = (H - (maxZ - minZ) * sc) / 2;
  const P = pts.map((p) => [ox + (p.x - minX) * sc, oz + (p.z - minZ) * sc]);
  const d = "M" + P.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L") + "Z";
  const id = "tp" + ++uid;
  const [x0, y0] = P[0], [x1, y1] = P[Math.min(2, P.length - 1)];
  const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <path id="${id}" d="${d}" fill="none" stroke="rgba(25,211,255,.25)" stroke-width="17" stroke-linejoin="round" filter="blur(4px)"/>
    <path d="${d}" fill="none" stroke="#04071a" stroke-width="14" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="#5b6aa8" stroke-width="10.5" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="#2a3568" stroke-width="8" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="#ffb000" stroke-width="1" stroke-dasharray="4 5" stroke-linejoin="round" opacity=".8"/>
    <g transform="translate(${x0.toFixed(1)} ${y0.toFixed(1)}) rotate(${ang.toFixed(1)})"><rect x="-1.6" y="-7.5" width="3.2" height="15" fill="#fff"/><path d="M-1.6-7.5h3.2v3h-3.2zM-1.6-1.5h3.2v3h-3.2zM-1.6 4.5h3.2v3h-3.2z" fill="#111"/></g>
    <circle r="4.2" fill="#ff7a1a" stroke="#fff" stroke-width="1.6"><animateMotion dur="7s" repeatCount="indefinite" rotate="auto"><mpath href="#${id}"/></animateMotion></circle>
  </svg>`;
}

/* ---------- optional 3D kart preview (own tiny renderer, lazily imports three) ---------- */
class KartPreview {
  constructor(stage, build) {
    this.stage = stage; this.build = build; this.ok = false; this.running = false; this.mesh = null; this.want = null; this.dead = false;
    this._init();
  }
  async _init() {
    try {
      const T = (this.T = await import("three"));
      if (this.dead) return;
      const canvas = document.createElement("canvas");
      const r = (this.r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true }));
      r.setClearColor(0x000000, 0);
      this.scene = new T.Scene();
      this.cam = new T.PerspectiveCamera(30, 1, 0.1, 100);
      this.scene.add(new T.HemisphereLight(0xcfe3ff, 0x2a2438, 1.35));
      const sun = new T.DirectionalLight(0xffffff, 2.2); sun.position.set(4, 7, 5); this.scene.add(sun);
      const rim = new T.DirectionalLight(0x19d3ff, 1.4); rim.position.set(-5, 3, -4); this.scene.add(rim);
      this.pivot = new T.Group(); this.scene.add(this.pivot);
      const disc = new T.Mesh(new T.CircleGeometry(2.6, 40), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01;
      const ring = new T.Mesh(new T.RingGeometry(2.55, 2.7, 48), new T.MeshBasicMaterial({ color: 0x19d3ff, transparent: true, opacity: 0.7 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
      this.ground = new T.Group(); this.ground.add(disc, ring); this.scene.add(this.ground);
      canvas.style.opacity = "0";
      this.stage.appendChild(canvas);
      this.canvas = canvas;
      this.ro = new ResizeObserver(() => this._size()); this.ro.observe(this.stage);
      this.ok = true;
      if (this.want) this.set(...this.want);
      this._size();
      if (this.running) { this._t = performance.now(); this._loop(); }
    } catch (e) { this.ok = false; }
  }
  _size() {
    if (!this.ok) return;
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    this._fit();
  }
  _fit() {
    if (!this.mesh) return;
    const T = this.T, box = new T.Box3().setFromObject(this.mesh), sph = box.getBoundingSphere(new T.Sphere());
    const fov = (this.cam.fov * Math.PI) / 180, fh = 2 * Math.atan(Math.tan(fov / 2) * Math.min(1, this.cam.aspect));
    const dist = (sph.radius / Math.sin(fh / 2)) * 0.98;
    this.ground.scale.setScalar(sph.radius / 1.9);
    this.cam.position.set(dist * 0.55, sph.radius * 1.2 + 0.2, dist * 0.82);
    this.cam.lookAt(0, sph.radius * 0.45, 0);
  }
  set(color, accent) {
    this.want = [color, accent];
    if (!this.ok) return;
    try {
      if (this.mesh) {
        this.pivot.remove(this.mesh);
        this.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      }
      this.mesh = this.build(color, accent);
      this.pivot.add(this.mesh);
      this._fit();
      this.canvas.style.opacity = "1";
      this.stage.classList.add("has3d");
    } catch (e) { this.canvas.style.opacity = "0"; this.stage.classList.remove("has3d"); }
  }
  start() { this.running = true; if (this.ok && !this._raf) { this._t = performance.now(); this._loop(); } }
  stop() { this.running = false; if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; }
  _loop() {
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      if (!this.running || this.dead) return;
      const now = performance.now(), dt = Math.min(0.05, (now - (this._t || now)) / 1000); this._t = now;
      this.pivot.rotation.y += dt * 0.7;
      if (this.canvas.width) this.r.render(this.scene, this.cam);
      this._loop();
    });
  }
  dispose() { this.dead = true; this.stop(); this.ro?.disconnect(); try { this.r?.dispose(); } catch { /* ignore */ } this.canvas?.remove(); }
}

/* ---------- the UI ---------- */
export class UI {
  constructor(root, { roster, trackDefs, outlinePoints, buildKartMesh } = {}) {
    this.root = root;
    this.roster = roster || ROSTER;
    this.trackDefs = trackDefs || [];
    this.outlinePoints = outlinePoints;
    this.buildKartMesh = buildKartMesh;
    this.settings = { ...DEFAULT_SETTINGS, ...loadJSON(SETTINGS_KEY, {}) };
    this.onSettings = null;
    this.onSound = null; // optional hook: ("ui-move"|"ui-select"|"ui-back")
    this.bestTimes = {};
    this.prefs = { kartId: this.roster[0].id, trackId: this.trackDefs[0]?.id, laps: 3, difficulty: "normal", ...loadJSON(PREFS_KEY, {}) };
    if (!this.roster.some((k) => k.id === this.prefs.kartId)) this.prefs.kartId = this.roster[0].id;
    if (!this.trackDefs.some((t) => t.id === this.prefs.trackId)) this.prefs.trackId = this.trackDefs[0]?.id;
    this.screen = null; this.screenName = null; this.pauseEl = null; this.loadingEl = null;
    this._titleCb = null; this._preview = null; this._conf = null; this._hc = {};

    root.classList.add("ak-root");
    this.layerHud = this._buildHUD();
    root.appendChild(this.layerHud);
    this.layerFx = node("", "ak-layer"); root.appendChild(this.layerFx);
    this.layerBanner = node("", "ak-banner-host"); root.appendChild(this.layerBanner);

    this._onKey = (e) => this._key(e);
    this._onKeyUp = (e) => { if (e.key === " " && this._scope()) e.preventDefault(); };
    window.addEventListener("keydown", this._onKey, true);
    window.addEventListener("keyup", this._onKeyUp, true);
    root.addEventListener("pointerdown", () => root.classList.remove("kbd"), true);
    root.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") root.classList.remove("kbd"); }, true);
  }

  get current() {
    if (this.pauseEl) return "pause";
    if (this.loadingEl) return "loading";
    if (this.screenName) return this.screenName;
    return this.layerHud.classList.contains("on") ? "hud" : null;
  }

  /* ----- settings / best times ----- */
  _applySettings(fire = true) {
    saveJSON(SETTINGS_KEY, this.settings);
    this.root.classList.toggle("no-map", !this.settings.minimap);
    this.mapEl.style.display = this.settings.minimap ? "" : "none";
    if (fire && typeof this.onSettings === "function") { try { this.onSettings(this.settings); } catch (e) { console.error(e); } }
  }
  setBestTimes(obj) { this.bestTimes = obj && typeof obj === "object" ? obj : {}; }
  _best(trackId) {
    let lap = null, race = null;
    for (const [k, v] of Object.entries(this.bestTimes)) {
      if (k !== trackId && !k.startsWith(trackId + ":") && !k.startsWith(trackId + "|")) continue;
      let l = null, r = null;
      if (typeof v === "number") l = v;
      else if (v && typeof v === "object") { l = v.bestLap ?? v.lap ?? v.best ?? null; r = v.bestRace ?? v.race ?? v.total ?? v.time ?? null; }
      if (l != null && (lap == null || l < lap)) lap = l;
      if (r != null && (race == null || r < race)) race = r;
    }
    return { lap, race };
  }
  _snd(n) { try { this.onSound?.(n); } catch { /* ignore */ } }

  /* ----- screen management ----- */
  _setScreen(name, el, { back = null, focus = true } = {}) {
    const old = this.screen;
    if (old) { old.classList.add("out"); setTimeout(() => old.remove(), 180); }
    this._stopFx();
    this.screen = el; this.screenName = name; this.screenBack = back;
    el.classList.add("ak-scr");
    this.root.insertBefore(el, this.layerFx);
    if (focus) this._focusDefault(el);
  }
  _clearScreen() {
    const old = this.screen;
    if (old) { old.classList.add("out"); setTimeout(() => old.remove(), 180); }
    this._stopFx();
    this.screen = null; this.screenName = null; this.screenBack = null;
  }
  _stopFx() {
    if (this._preview) { this._preview.stop(); }
    if (this._conf) { cancelAnimationFrame(this._conf.raf); this._conf = null; }
    this._titleCb = null;
  }
  openScreen(name, arg) { // used by dev harness / internal navigation
    ({ title: () => this.showTitle(() => {}), menu: () => this.showMenu(this._menuOpts || {}), kart: () => this._openKart(arg || "race"), track: () => this._openSetup(arg || "race"),
       settings: () => this._openSettings(), how: () => this._openHow(), best: () => this._openBest() })[name]?.();
  }
  _scope() { return this.pauseEl || (this.screenName && this.screenName !== "title" ? this.screen : null); }
  _items(scope) { return [...scope.querySelectorAll("[data-nav]")].filter((e) => !e.disabled && e.getClientRects().length); }
  _focusDefault(scope) {
    if (scope === this.screen && this.screenName === "title") return;
    const items = this._items(scope);
    const t = scope.querySelector("[data-default]") || items.find((e) => e.dataset.act !== "back") || items[0];
    t?.focus({ preventScroll: true });
  }

  _key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this._titleCb) {
      if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation(); this._fireTitle(); return;
    }
    const scope = this._scope();
    if (!scope) return;
    const k = e.key, active = document.activeElement;
    const inScope = active && scope.contains(active) ? active : null;
    const dirs = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", ",": "left", ".": "right", a: "up", A: "up", z: "down", Z: "down" };
    const isRange = inScope && inScope.type === "range";
    if (dirs[k]) {
      if (isRange && (dirs[k] === "left" || dirs[k] === "right") && k.startsWith("Arrow")) return; // native slider adjust
      e.preventDefault(); e.stopPropagation(); this.root.classList.add("kbd"); this._move(scope, dirs[k]); return;
    }
    if (k === "Tab") { e.preventDefault(); this.root.classList.add("kbd"); this._move(scope, e.shiftKey ? "up" : "down", true); return; }
    if (k === "Enter" || k === " ") {
      if (isRange) return;
      if (inScope && inScope.matches("[data-nav]")) { e.preventDefault(); e.stopPropagation(); this.root.classList.add("kbd"); inScope.click(); }
      else if (!inScope) { e.preventDefault(); this.root.classList.add("kbd"); this._focusDefault(scope); }
      return;
    }
    if ((k === "Escape" || k === "Backspace") && scope === this.screen && this.screenBack) {
      e.preventDefault(); e.stopPropagation(); this._snd("ui-back"); this.screenBack();
    }
  }
  _move(scope, dir, seq = false) {
    const items = this._items(scope);
    if (!items.length) return;
    const cur = items.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { (scope.querySelector("[data-default]") || items[0]).focus({ preventScroll: true }); return; }
    if (seq) { const i = items.indexOf(cur); items[(i + (dir === "up" ? -1 : 1) + items.length) % items.length].focus({ preventScroll: true }); this._snd("ui-move"); return; }
    const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    const vert = dir === "up" || dir === "down", cand = [];
    for (const it of items) {
      if (it === cur) continue;
      const r = it.getBoundingClientRect(), dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const prim = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy;
      const ok = dir === "right" ? r.left >= r0.right - 6 : dir === "left" ? r.right <= r0.left + 6 : dir === "down" ? r.top >= r0.bottom - 6 : r.bottom <= r0.top + 6;
      if (prim < 4 || !ok) continue;
      cand.push({ it, prim, perp: vert ? Math.abs(dx) : Math.abs(dy) });
    }
    let best = null, bs = 1e12;
    if (vert && cand.length) { // nearest row first, then nearest column within it
      const rowMin = Math.min(...cand.map((c) => c.prim));
      for (const c of cand) if (c.prim <= rowMin + 24 && c.perp < bs) { bs = c.perp; best = c.it; }
    } else {
      for (const c of cand) { const sc = c.prim + c.perp * 3; if (sc < bs) { bs = sc; best = c.it; } }
    }
    if (!best) return;
    if ((dir === "up" || dir === "down") && best.parentElement !== cur.parentElement) {
      const on = best.parentElement?.querySelector(":scope > [data-nav].on");
      if (on) best = on;
    }
    best.focus({ preventScroll: true });
    this._snd("ui-move");
  }

  /* ----- title ----- */
  showTitle(onContinue) {
    const el = node(`
      <div class="ak-streaks">${Array.from({ length: 9 }, (_, i) => `<i style="top:${8 + i * 10 + (i % 3) * 3}%;animation-delay:${(i * 0.37).toFixed(2)}s;animation-duration:${(1.6 + (i % 4) * 0.4).toFixed(1)}s"></i>`).join("")}</div>
      <div class="ak-logo"><span class="l1">Apex</span><span class="l2">Karts</span><div class="ak-checker"></div></div>
      <div class="ak-press ak-disp">Press any key &middot; Tap to start</div>
      <div class="tiny">3D ARCADE KART RACING &middot; 8 RACERS &middot; 3 TRACKS &middot; GRAND PRIX</div>`, "ak-title");
    this._setScreen("title", el, { focus: false });
    this._titleCb = onContinue || (() => {});
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); this._fireTitle(); });
  }
  _fireTitle() {
    const cb = this._titleCb; if (!cb) return;
    this._titleCb = null; this._snd("ui-select");
    try { cb(); } catch (e) { console.error(e); }
  }

  /* ----- main menu ----- */
  showMenu({ onStart } = {}) {
    this._menuOpts = { onStart };
    this._onStart = onStart || this._onStart;
    const el = node(`
      <div class="ak-logo"><span class="l1">Apex</span><span class="l2">Karts</span><div class="ak-checker"></div></div>
      <div class="ak-menulist">
        <button class="ak-btn menu" data-nav data-default data-act="race">Quick Race<span class="sub">SINGLE RACE</span></button>
        <button class="ak-btn menu" data-nav data-act="cup">Grand Prix<span class="sub">3-RACE CUP</span></button>
        <button class="ak-btn menu" data-nav data-act="settings">Settings</button>
        <button class="ak-btn menu" data-nav data-act="how">How to Play</button>
        <button class="ak-btn menu" data-nav data-act="best">Best Times</button>
      </div>
      <div class="ak-ver">ARROWS + ENTER &middot; ESC = BACK</div>`, "ak-main ak-dim-l");
    el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]")?.dataset.act; if (!a) return;
      this._snd("ui-select");
      if (a === "race" || a === "cup") this._openKart(a);
      else if (a === "settings") this._openSettings();
      else if (a === "how") this._openHow();
      else if (a === "best") this._openBest();
    });
    this._setScreen("menu", el, { back: null });
  }

  _hdr(title, kicker) {
    return `<div class="ak-hdr"><h2 class="ak-disp"><small>${esc(kicker || "")}</small>${esc(title)}</h2><button class="ak-btn ghost" data-nav data-act="back">&#9664; Back</button></div>`;
  }

  /* ----- kart select ----- */
  _openKart(mode) {
    this._mode = mode;
    const R = this.roster;
    const el = node(`${this._hdr("Select Kart", mode === "cup" ? "Grand Prix" : "Quick Race")}
      <div class="ak-body">
        <div class="ak-karts">${R.map((k) => `<button class="ak-kcard" data-nav data-id="${k.id}" style="--c:${css(k.color)}">${kartSvg(k.color, k.accent).replace('class="kart"', 'class="sw"')}<span class="nm">${esc(k.name)}</span></button>`).join("")}</div>
        <div class="ak-prev">
          <div class="stage">${kartSvg(R[0].color, R[0].accent)}</div>
          <div class="info"><h3 class="ak-disp"></h3><p></p>
            ${["speed", "accel", "handling", "weight"].map((s) => `<div class="ak-stat"><span>${s.toUpperCase()}</span><div class="bar"><i data-s="${s}"></i></div></div>`).join("")}
          </div>
        </div>
      </div>
      <div class="ak-foot"><button class="ak-btn pri" data-nav data-act="next">Next &#9654;</button></div>`, "ak-dim");
    const stage = el.querySelector(".stage");
    const select = (id) => {
      const k = R.find((x) => x.id === id) || R[0];
      this.prefs.kartId = k.id; saveJSON(PREFS_KEY, this.prefs);
      el.querySelectorAll(".ak-kcard").forEach((c) => c.classList.toggle("on", c.dataset.id === k.id));
      el.querySelector(".info h3").textContent = k.name;
      el.querySelector(".info h3").style.textShadow = `0 0 18px ${css(k.color)}`;
      el.querySelector(".info p").textContent = k.blurb;
      el.querySelectorAll("[data-s]").forEach((b) => { b.style.width = Math.round((k.stats[b.dataset.s] ?? 0) * 100) + "%"; });
      const svg = stage.querySelector("svg.kart");
      if (svg) svg.outerHTML = kartSvg(k.color, k.accent);
      this._preview?.set(k.color, k.accent);
    };
    el.addEventListener("click", (e) => {
      const card = e.target.closest(".ak-kcard"), act = e.target.closest("[data-act]")?.dataset.act;
      if (card) { const same = card.classList.contains("on"); select(card.dataset.id); this._snd("ui-move"); if (e.detail === 0 || (same && e.detail > 1)) this._openSetup(mode); }
      else if (act === "next") { this._snd("ui-select"); this._openSetup(mode); }
      else if (act === "back") this.showMenu(this._menuOpts);
    });
    el.addEventListener("focusin", (e) => { const c = e.target.closest?.(".ak-kcard"); if (c && !c.classList.contains("on") && this.root.classList.contains("kbd")) select(c.dataset.id); });
    this._setScreen("kart", el, { back: () => this.showMenu(this._menuOpts), focus: false });
    if (this._preview) { this._preview.dispose(); this._preview = null; }
    if (this.buildKartMesh) { this._preview = new KartPreview(stage, this.buildKartMesh); this._preview.start(); }
    select(this.prefs.kartId);
    el.querySelector(`.ak-kcard[data-id="${this.prefs.kartId}"]`)?.focus({ preventScroll: true });
  }

  /* ----- track / laps / difficulty ----- */
  _openSetup(mode) {
    const D = this.trackDefs, cup = mode === "cup";
    if (!D.length) { this.toast("No tracks available"); return; }
    if (cup) this.prefs.trackId = D[0].id;
    const el = node(`${this._hdr(cup ? "Grand Prix" : "Select Track", cup ? "3 races - best total wins" : "Quick Race")}
      <div class="ak-body"><div class="ak-setup">
        <div class="ak-tracks">${D.map((t, i) => `<button class="ak-tcard" data-nav data-id="${t.id}"><div class="rd">${cup ? "ROUND " + (i + 1) : "TRACK " + (i + 1)}</div><div class="tn">${esc(t.name)}</div></button>`).join("")}</div>
        <div class="ak-tdetail"><div class="map"></div><div class="meta"></div></div>
        <div class="ak-opts">
          <div class="ak-opt"><label>LAPS</label><div class="ak-seg" data-g="laps">${LAP_OPTIONS.map((n) => `<button data-nav data-v="${n}">${n}</button>`).join("")}</div></div>
          <div class="ak-opt"><label>DIFFICULTY</label><div class="ak-seg" data-g="difficulty">${DIFFICULTIES.map((n) => `<button data-nav data-v="${n}">${n}</button>`).join("")}</div></div>
          <button class="ak-btn pri" data-nav data-act="start">Start &#9654;</button>
        </div>
      </div></div>`, "ak-dim");
    const sel = (id) => {
      const t = D.find((x) => x.id === id) || D[0];
      if (!cup) this.prefs.trackId = t.id;
      saveJSON(PREFS_KEY, this.prefs);
      el.querySelectorAll(".ak-tcard").forEach((c) => c.classList.toggle("on", c.dataset.id === t.id));
      el.querySelector(".map").innerHTML = trackSvg(t, this.outlinePoints);
      const b = this._best(t.id);
      const diff = ["", "Easy", "Medium", "Hard"][t.difficulty] || "";
      el.querySelector(".meta").innerHTML = `<h3 class="ak-disp">${esc(t.name)}</h3><p>${esc(t.blurb || "")}</p>
        <div class="ak-kv"><span>Difficulty</span><b>${stars(t.difficulty || 1)} ${diff}</b></div>
        <div class="ak-kv"><span>Laps (default)</span><b>${t.laps ?? 3}</b></div>
        <div class="ak-kv"><span>Best lap</span><b>${b.lap != null ? formatTime(b.lap) : "--:--.---"}</b></div>`;
    };
    const refreshSeg = () => el.querySelectorAll(".ak-seg").forEach((g) => g.querySelectorAll("button").forEach((b) => b.classList.toggle("on", String(this.prefs[g.dataset.g]) === b.dataset.v)));
    const start = () => {
      this._snd("ui-select");
      const kartId = this.prefs.kartId, trackId = cup ? D[0].id : this.prefs.trackId;
      const cb = this._onStart;
      this._clearScreen();
      cb?.({ mode: cup ? "cup" : "race", trackId, laps: Number(this.prefs.laps), difficulty: this.prefs.difficulty, kartId });
    };
    el.addEventListener("click", (e) => {
      const tc = e.target.closest(".ak-tcard"), seg = e.target.closest(".ak-seg button"), act = e.target.closest("[data-act]")?.dataset.act;
      if (tc) { sel(tc.dataset.id); this._snd("ui-move"); if (e.detail === 0) el.querySelector('[data-g="laps"] .on')?.focus(); }
      else if (seg) { const g = seg.parentElement.dataset.g; this.prefs[g] = g === "laps" ? Number(seg.dataset.v) : seg.dataset.v; saveJSON(PREFS_KEY, this.prefs); refreshSeg(); this._snd("ui-select"); }
      else if (act === "start") start();
      else if (act === "back") this._openKart(mode);
    });
    el.addEventListener("focusin", (e) => { const c = e.target.closest?.(".ak-tcard"); if (c && !c.classList.contains("on") && this.root.classList.contains("kbd")) sel(c.dataset.id); });
    this._setScreen("track", el, { back: () => this._openKart(mode), focus: false });
    sel(this.prefs.trackId); refreshSeg();
    el.querySelector(`.ak-tcard[data-id="${this.prefs.trackId}"]`)?.focus({ preventScroll: true });
  }

  /* ----- settings ----- */
  _openSettings() {
    const s = this.settings;
    const slider = (key, label) => `<div class="ak-row"><span>${label}</span><div class="val"><input type="range" min="0" max="100" step="5" data-nav data-k="${key}" value="${Math.round(s[key] * 100)}"><b class="num">${Math.round(s[key] * 100)}</b></div></div>`;
    const seg = (key, label, opts) => `<div class="ak-row"><span>${label}</span><div class="val"><div class="ak-seg" data-g="${key}">${opts.map(([v, t]) => `<button data-nav data-v="${v}">${t}</button>`).join("")}</div></div></div>`;
    const el = node(`${this._hdr("Settings", "Options")}
      <div class="ak-body" style="justify-content:center;min-height:0"><div class="ak-panel ak-col ak-scroll" style="align-self:flex-start;max-height:100%">
        ${slider("volume", "Master volume")}${slider("music", "Music")}${slider("sfx", "Sound effects")}
        ${seg("camera", "Camera", [["chase", "Chase"], ["far", "Far"]])}
        ${seg("touch", "Touch controls", [["auto", "Auto"], ["on", "On"], ["off", "Off"]])}
        ${seg("minimap", "Minimap", [["true", "On"], ["false", "Off"]])}
        ${seg("quality", "Graphics", [["high", "High"], ["low", "Low"]])}
      </div></div>
      <div class="ak-foot"><button class="ak-btn pri" data-nav data-act="back">Done</button></div>`, "ak-dim");
    const refresh = () => el.querySelectorAll(".ak-seg").forEach((g) => g.querySelectorAll("button").forEach((b) => b.classList.toggle("on", String(this.settings[g.dataset.g]) === b.dataset.v)));
    const paint = (inp) => inp.style.setProperty("--p", inp.value + "%");
    el.querySelectorAll('input[type="range"]').forEach(paint);
    el.addEventListener("input", (e) => {
      const inp = e.target; if (inp.type !== "range") return;
      paint(inp); inp.parentElement.querySelector(".num").textContent = inp.value;
      this.settings[inp.dataset.k] = Number(inp.value) / 100; this._applySettings();
    });
    el.addEventListener("click", (e) => {
      const b = e.target.closest(".ak-seg button"), act = e.target.closest("[data-act]")?.dataset.act;
      if (b) { const g = b.parentElement.dataset.g, v = b.dataset.v; this.settings[g] = v === "true" ? true : v === "false" ? false : v; refresh(); this._applySettings(); this._snd("ui-select"); }
      else if (act === "back") this.showMenu(this._menuOpts);
    });
    this._setScreen("settings", el, { back: () => this.showMenu(this._menuOpts) });
    refresh();
  }

  /* ----- how to play ----- */
  _openHow() {
    const keys = [["A", "Accelerate"], ["Z", "Brake / reverse"], [", / .", "Steer left / right (or Arrow keys)"], ["Space", "Hold to drift; release for a mini-turbo"], ["Enter", "Use item"], ["C", "Look behind"], ["Esc / P", "Pause"]];
    const touch = [["Left pad", "Steer (throttle is automatic)"], ["DRIFT", "Hold while turning"], ["ITEM", "Use your item"], ["BRAKE", "Brake / reverse"]];
    const pad = [["Stick / D-pad", "Steer"], ["RT / A", "Accelerate"], ["LT / B", "Brake"], ["RB or LB", "Drift"], ["X / Y", "Use item"], ["Start", "Pause"]];
    const row = (a) => a.map(([k, d]) => `<div>${k.split(" / ").map((x) => `<kbd>${esc(x)}</kbd>`).join("")}</div><span class="d">${esc(d)}</span>`).join("");
    const desc = { boost: "Instant speed burst.", triple: "Three bursts, one at a time.", banana: "Drop it behind you. Rivals spin.", green: "Bounces off walls, spins what it hits.", homing: "Locks on to the kart ahead.", shield: "Blocks one hit for 8 seconds.", shock: "Spins every kart ahead of you." };
    const el = node(`${this._hdr("How to Play", "Guide")}
      <div class="ak-body" style="min-height:0"><div class="ak-panel ak-col ak-scroll">
        <div class="ak-how">
          <div><h4 class="ak-disp">KEYBOARD</h4><div class="ak-keys">${row(keys)}</div><h4 class="ak-disp" style="margin-top:14px">TOUCH</h4><div class="ak-keys">${row(touch)}</div><h4 class="ak-disp" style="margin-top:14px">GAMEPAD</h4><div class="ak-keys">${row(pad)}</div>
            <ul class="ak-tips"><li><b>Drift</b> through corners: blue, orange, then pink sparks mean a bigger boost.</li><li>Grass slows you. Hit <b>boost pads</b> for free speed.</li><li>Watch for <b>bridges and crossings</b>: some tracks have hills and cross over themselves.</li><li>Hit <b>GO!</b> with the throttle down for a rocket start.</li></ul></div>
          <div><h4 class="ak-disp">ITEMS</h4><div class="ak-items" style="grid-template-columns:1fr">${Object.values(ITEMS).map((i) => `<div class="ak-item">${itemIcon(i.id)}<div><b>${esc(i.name)}</b><span>${esc(desc[i.id] || "")}</span></div></div>`).join("")}</div></div>
        </div>
      </div></div>
      <div class="ak-foot"><button class="ak-btn pri" data-nav data-act="back">Back</button></div>`, "ak-dim");
    el.addEventListener("click", (e) => { if (e.target.closest("[data-act=back]")) this.showMenu(this._menuOpts); });
    this._setScreen("how", el, { back: () => this.showMenu(this._menuOpts) });
  }

  /* ----- best times ----- */
  _openBest() {
    const rows = this.trackDefs.map((t) => { const b = this._best(t.id); const f = (v) => (v == null ? '<td class="n none">--:--.---</td>' : `<td class="n">${formatTime(v)}</td>`); return `<tr><td class="t">${esc(t.name)}</td>${f(b.lap)}${f(b.race)}</tr>`; }).join("");
    const el = node(`${this._hdr("Best Times", "Records")}
      <div class="ak-body" style="justify-content:center;min-height:0"><div class="ak-panel ak-col ak-scroll" style="align-self:flex-start">
        <table class="ak-best"><tr><th>TRACK</th><th>BEST LAP</th><th>BEST RACE</th></tr>${rows || '<tr><td colspan="3">No tracks.</td></tr>'}</table>
      </div></div>
      <div class="ak-foot"><button class="ak-btn pri" data-nav data-act="back">Back</button></div>`, "ak-dim");
    el.addEventListener("click", (e) => { if (e.target.closest("[data-act=back]")) this.showMenu(this._menuOpts); });
    this._setScreen("best", el, { back: () => this.showMenu(this._menuOpts) });
  }

  /* ----- loading ----- */
  showLoading(text = "Loading", frac = 0) {
    if (!this.loadingEl) {
      this.loadingEl = node(`<div class="ak-logo"><span class="l1">Apex</span><span class="l2">Karts</span></div><div class="ak-lbar"><i></i></div><div class="ak-ltxt"></div>`, "ak-scr ak-loading");
      this.root.appendChild(this.loadingEl);
    }
    this.loadingEl.classList.remove("out");
    this.loadingEl.querySelector(".ak-ltxt").textContent = text;
    this.loadingEl.querySelector(".ak-lbar i").style.width = Math.round(clamp(frac ?? 0, 0, 1) * 100) + "%";
  }
  hideLoading() {
    const el = this.loadingEl; if (!el) return;
    this.loadingEl = null; el.classList.add("out"); setTimeout(() => el.remove(), 200);
  }

  /* ----- HUD ----- */
  _buildHUD() {
    const h = node(`
      <div class="h-pos pn"><span class="n">1</span><span class="s">st</span><span class="o">/8</span></div>
      <div class="h-board">${Array.from({ length: 8 }, () => "<div><b></b><span></span></div>").join("")}</div>
      <div class="h-top"><div class="h-lap pn"><small>LAP</small><span class="lv">1</span><em>/3</em></div><div class="h-time">0:00.000</div><div class="h-sub"><span>LAP <b class="lt">--:--.---</b></span><span>BEST <b class="bt">--:--.---</b></span></div></div>
      <div class="h-item pn"><span class="q">?</span></div>
      <div class="h-map pn"><canvas></canvas></div>
      <div class="h-speed"><div class="v"><b>0</b><i>KM/H</i></div><div class="h-boost"><i></i></div></div>
      <div class="h-wrong">WRONG WAY</div>`, "ak-hud");
    this.hud = h;
    this.e = {
      pos: h.querySelector(".h-pos"), n: h.querySelector(".h-pos .n"), s: h.querySelector(".h-pos .s"), o: h.querySelector(".h-pos .o"),
      rows: [...h.querySelectorAll(".h-board div")], lv: h.querySelector(".lv"), lm: h.querySelector(".h-lap em"), time: h.querySelector(".h-time"),
      lt: h.querySelector(".lt"), bt: h.querySelector(".bt"), item: h.querySelector(".h-item"), speed: h.querySelector(".h-speed b"),
      boost: h.querySelector(".h-boost"), boostI: h.querySelector(".h-boost i"), wrong: h.querySelector(".h-wrong"), canvas: h.querySelector(".h-map canvas"),
    };
    this.mapEl = h.querySelector(".h-map");
    this.mapCtx = this.e.canvas.getContext("2d");
    this._mapKey = ""; this._mapPath = null;
    this._applySettings(false);
    return h;
  }
  showHUD() { this.layerHud.classList.add("on"); this._hc = {}; }
  hideHUD() { this.layerHud.classList.remove("on"); }

  updateHUD(h) {
    if (!h) return;
    const c = this._hc, e = this.e, set = (k, v, fn) => { if (c[k] !== v) { c[k] = v; fn(v); } };
    const place = h.place | 0, racers = h.racers | 0 || 8;
    set("place", place + "/" + racers, () => { e.n.textContent = place; e.s.textContent = ord(place); e.o.textContent = "/" + racers; e.pos.classList.toggle("p1", place === 1); });
    set("lap", h.lap + "/" + h.laps, () => { e.lv.textContent = Math.min(h.lap, h.laps); e.lm.textContent = "/" + h.laps; });
    set("time", formatTime(h.time), (v) => { e.time.textContent = v; });
    set("lt", formatTime(h.lapTime), (v) => { e.lt.textContent = v; });
    set("bt", h.bestLap != null ? formatTime(h.bestLap) : "--:--.---", (v) => { e.bt.textContent = v; });
    const sp = Math.round(Math.max(0, h.speedKmh || 0));
    set("sp", sp, (v) => { e.speed.textContent = v; });
    const bp = clamp(h.boostPct || 0, 0, 1);
    set("bp", Math.round(bp * 100), (v) => { e.boostI.style.width = v + "%"; e.boost.classList.toggle("full", v >= 99); });
    set("wrong", !!h.wrongWay, (v) => e.wrong.classList.toggle("on", v));
    this._hudItem(h);
    if (h.standings) {
      const sig = h.standings.map((s) => s.place + s.name + s.color + (s.isPlayer ? 1 : 0)).join("|");
      set("stand", sig, () => {
        const st = h.standings.slice(0, 8);
        e.rows.forEach((r, i) => {
          const s = st[i]; r.style.display = s ? "" : "none"; if (!s) return;
          r.style.setProperty("--c", css(s.color)); r.classList.toggle("me", !!s.isPlayer);
          r.firstChild.textContent = s.place; r.lastChild.textContent = s.name;
        });
      });
    }
    if (this.settings.minimap && h.minimap) this._drawMap(h.minimap);
  }
  _hudItem(h) {
    const c = this._hc, el = this.e.item;
    if (!this._itemTick) this._itemTick = 0;
    const rolling = !!h.rolling;
    let show = null, mode = "none";
    if (rolling) {
      mode = "roll";
      const ids = Object.keys(ITEMS);
      if (h.rollIcon) show = h.rollIcon; else { show = ids[Math.floor(performance.now() / 90) % ids.length]; }
    } else if (h.item) { mode = "has"; show = h.item; }
    const key = mode + ":" + show + ":" + (h.itemCount || 0);
    if (c.item === key) return;
    const prevMode = c.itemMode; c.item = key; c.itemMode = mode;
    el.classList.toggle("roll", mode === "roll"); el.classList.toggle("has", mode === "has");
    el.classList.remove("pop");
    el.innerHTML = show ? itemIcon(show) + (mode === "has" && h.itemCount > 1 ? `<span class="ct">x${h.itemCount}</span>` : "") : '<span class="q">?</span>';
    if (mode === "has" && prevMode !== "has") { void el.offsetWidth; el.classList.add("pop"); }
  }
  _drawMap(m) {
    const cv = this.e.canvas, ctx = this.mapCtx, w = cv.clientWidth, hh = cv.clientHeight;
    if (!w || !hh) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); this._mapKey = ""; }
    const b = m.bounds, pts = m.points;
    if (!b || !pts || !pts.length) { ctx.clearRect(0, 0, cv.width, cv.height); return; }
    const pad = 14, sc = Math.min((w - pad * 2) / (b.maxX - b.minX || 1), (hh - pad * 2) / (b.maxZ - b.minZ || 1));
    const ox = (w - (b.maxX - b.minX) * sc) / 2, oz = (hh - (b.maxZ - b.minZ) * sc) / 2;
    const X = (x) => ox + (x - b.minX) * sc, Z = (z) => oz + (z - b.minZ) * sc;
    const key = pts.length + ":" + b.minX + ":" + b.maxZ + ":" + w + "x" + hh;
    if (key !== this._mapKey) {
      this._mapKey = key; const p = new Path2D();
      pts.forEach((q, i) => (i ? p.lineTo(X(q.x), Z(q.z)) : p.moveTo(X(q.x), Z(q.z)))); p.closePath(); this._mapPath = p;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(0,0,0,.65)"; ctx.lineWidth = 9; ctx.stroke(this._mapPath);
    ctx.strokeStyle = "#8fa0e0"; ctx.lineWidth = 6; ctx.stroke(this._mapPath);
    ctx.strokeStyle = "#27336e"; ctx.lineWidth = 3.6; ctx.stroke(this._mapPath);
    ctx.fillStyle = "#fff"; ctx.fillRect(X(pts[0].x) - 4, Z(pts[0].z) - 1.5, 8, 3);
    const ks = (m.karts || []).slice().sort((a, b2) => (a.isPlayer ? 1 : 0) - (b2.isPlayer ? 1 : 0));
    for (const k of ks) {
      const x = X(k.x), z = Z(k.z);
      ctx.beginPath(); ctx.arc(x, z, k.isPlayer ? 5.6 : 3.8, 0, 6.2832);
      ctx.fillStyle = css(k.color); ctx.fill();
      ctx.lineWidth = k.isPlayer ? 2.2 : 1.2; ctx.strokeStyle = k.isPlayer ? "#fff" : "rgba(0,0,0,.7)"; ctx.stroke();
    }
  }

  /* ----- banner / countdown / toast ----- */
  banner(text, ms = 1800) {
    this.layerBanner.innerHTML = "";
    const good = /best|record|final/i.test(text) ? "" : " good";
    const b = node(`<div style="--ms:${ms}ms">${esc(text)}</div>`, "ak-banner" + good);
    this.layerBanner.appendChild(b);
    clearTimeout(this._bt); this._bt = setTimeout(() => b.remove(), ms + 50);
  }
  showCountdown(label) {
    this.layerFx.innerHTML = "";
    const go = /go/i.test(label), colors = { 3: "#ff3b3b", 2: "#ffb000", 1: "#ffe14a" };
    const d = node(esc(label), "ak-cd" + (go ? " go" : ""));
    d.style.setProperty("--c", go ? "#3ddc84" : colors[label] || "#19d3ff");
    this.layerFx.appendChild(d);
  }
  hideCountdown() {
    const d = this.layerFx.firstChild; if (!d) return;
    d.classList.add("fade"); setTimeout(() => d.remove(), 260);
  }
  toast(text) {
    const t = node(esc(text), "ak-toast");
    this.root.appendChild(t); setTimeout(() => t.remove(), 2450);
  }

  /* ----- pause ----- */
  showPause({ onResume, onRestart, onQuit } = {}) {
    this.hidePause();
    const el = node(`<h2 class="ak-disp">Paused</h2><div class="ak-menulist">
      <button class="ak-btn menu" data-nav data-default data-act="resume">Resume</button>
      <button class="ak-btn menu" data-nav data-act="restart">Restart Race</button>
      <button class="ak-btn menu" data-nav data-act="quit">Quit to Menu</button></div>`, "ak-scr ak-pause");
    el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]")?.dataset.act; if (!a) return;
      this._snd("ui-select");
      const fn = { resume: onResume, restart: onRestart, quit: onQuit }[a];
      if (a === "resume") this.hidePause();
      try { fn?.(); } catch (err) { console.error(err); }
    });
    this.pauseEl = el; this.root.appendChild(el); this._focusDefault(el);
  }
  hidePause() {
    const el = this.pauseEl; if (!el) return;
    this.pauseEl = null; el.classList.add("out"); setTimeout(() => el.remove(), 180);
  }

  /* ----- results ----- */
  showResults(res, { onNext, onRetry, onMenu } = {}) {
    const rows = res.rows || [], cup = res.cup;
    const me = rows.find((r) => r.isPlayer);
    const cupSorted = cup?.final && cup.standings ? cup.standings.slice().sort((a, b) => b.points - a.points) : null;
    const place = cupSorted ? cupSorted.findIndex((s) => s.isPlayer) + 1 : (res.playerPlace ?? me?.place ?? 0);
    const hasPts = rows.some((r) => r.points != null);
    const podSrc = cupSorted ? cupSorted.map((s, i) => ({ ...s, place: i + 1, label: s.points + " PTS" })) : rows;
    const pod = [2, 1, 3].map((p) => podSrc.find((r) => r.place === p));
    const kartOf = (r) => this.roster.find((k) => k.name === r.name);
    const podHtml = pod.map((r, i) => {
      if (!r) return "";
      const p = [2, 1, 3][i], h = { 1: 112, 2: 82, 3: 62 }[p], k = kartOf(r);
      return `<div class="ak-pod p${p}${r.isPlayer ? " me" : ""}">${kartSvg(r.color, k?.accent ?? 0xffffff)}<div class="nm">${esc(r.name)}</div><div class="blk" style="height:${h}px"><b>${p}</b><small>${r.label ?? (r.time != null ? formatTime(r.time) : "")}</small></div></div>`;
    }).join("");
    const head = `<div class="tm">TIME</div><div class="tm">BEST LAP</div>`;
    const tr = (r, i) => `<div class="ak-tr${r.isPlayer ? " me" : ""}${r.dnf ? " dnf" : ""}" style="--i:${i};--c:${css(r.color)};--pc:${hasPts ? "64px" : "0px"}"><div class="pl">${r.place}</div><div class="nm">${esc(r.name)}</div><div class="tm">${r.dnf ? "DNF" : r.time != null ? formatTime(r.time) : "--"}</div><div class="tm">${r.bestLap != null ? formatTime(r.bestLap) : "--"}</div>${hasPts ? `<div class="pt">${r.points != null ? "+" + r.points : ""}${r.totalPoints != null ? " (" + r.totalPoints + ")" : ""}</div>` : ""}</div>`;
    const raceTable = `<div class="ak-table"><div class="ak-tr hd" style="--pc:${hasPts ? "64px" : "0px"}"><div></div><div>RACER</div>${head}${hasPts ? '<div class="tm">PTS</div>' : ""}</div>${rows.map(tr).join("")}</div>`;
    let cupTable = "";
    if (cup?.standings) {
      const st = cup.standings.slice().sort((a, b) => b.points - a.points);
      cupTable = `<div class="ak-table ak-cupstand"><div class="ak-tr hd"><div></div><div>${cup.final ? "FINAL STANDINGS" : "CUP STANDINGS"}</div><div class="tm">POINTS</div></div>${st.map((s, i) => `<div class="ak-tr${s.isPlayer ? " me" : ""}" style="--i:${i};--c:${css(s.color)}"><div class="pl">${i + 1}</div><div class="nm">${esc(s.name)}</div><div class="pt">${s.points}</div></div>`).join("")}</div>`;
    }
    const first = cupSorted ? cupSorted[0] : null;
    const title = cup ? (cup.final ? "Grand Prix Complete" : `Round ${cup.round} of ${cup.rounds}`) : "Race Complete";
    const headline = me?.dnf ? "DNF" : `<em>${place}${ord(place)}</em> place`;
    const el = node(`
      <canvas class="conf"></canvas>
      <div class="ak-hdr"><h2 class="ak-disp"><small>${esc(res.trackName || "")} &middot; ${res.laps ?? ""} laps &middot; ${esc(res.difficulty || "")}</small>${esc(title)}</h2></div>
      <div class="rbody">
        <div class="ak-pod-wrap">
          <div class="ak-yours">${headline}${res.newRecord ? '<span class="ak-badge">NEW RECORD</span>' : ""}</div>
          <div class="ak-kv" style="max-width:360px"><span>${cup ? "Race time" : "Total time"}</span><b>${res.totalTime != null ? formatTime(res.totalTime) : "--"}</b></div>
          <div class="ak-kv" style="max-width:360px;margin-top:5px"><span>Best lap</span><b>${res.bestLap != null ? formatTime(res.bestLap) : "--"}</b></div>
          ${first ? `<div class="ak-kv" style="max-width:360px;margin-top:5px"><span>Cup winner</span><b>${esc(first.name)}</b></div>` : ""}
          <div class="ak-podium">${podHtml}</div>
        </div>
        <div class="rtab">
          ${cupTable ? `<div class="ak-tabs"><div class="ak-seg"><button data-nav data-tab="race" class="on">Race</button><button data-nav data-tab="cup">${cup.final ? "Final" : "Cup"}</button></div></div>` : ""}
          <div class="tabbody">${raceTable}</div>
        </div>
      </div>
      <div class="ak-foot">
        ${cup && onNext ? `<button class="ak-btn pri" data-nav data-default data-act="next">${cup.final ? "Finish" : "Next Race"} &#9654;</button>` : ""}
        ${onRetry ? `<button class="ak-btn${cup && onNext ? "" : " pri"}" data-nav ${cup && onNext ? "" : "data-default"} data-act="retry">${cup ? "Restart Cup" : "Race Again"}</button>` : ""}
        ${onMenu ? `<button class="ak-btn" data-nav data-act="menu">Menu</button>` : ""}
        ${!cup && onNext ? `<button class="ak-btn" data-nav data-act="next">Next</button>` : ""}
      </div>`, "ak-res");
    el.addEventListener("click", (e) => {
      const t = e.target.closest("[data-tab]");
      if (t) {
        el.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === t));
        el.querySelector(".tabbody").innerHTML = t.dataset.tab === "cup" ? cupTable : raceTable; this._snd("ui-move"); return;
      }
      const a = e.target.closest("[data-act]")?.dataset.act; if (!a) return;
      this._snd("ui-select");
      const fn = { next: onNext, retry: onRetry, menu: onMenu }[a];
      try { fn?.(); } catch (err) { console.error(err); }
    });
    this._setScreen("results", el, { back: null });
    if (cup?.final && cupTable) el.querySelector('[data-tab="cup"]')?.click();
    const celebrate = place >= 1 && place <= 3 && !me?.dnf;
    if (celebrate) this._confetti(el.querySelector("canvas.conf"));
  }
  _confetti(cv) {
    const w = (cv.width = cv.clientWidth || innerWidth), h = (cv.height = cv.clientHeight || innerHeight), ctx = cv.getContext("2d");
    const cols = ["#ff7a1a", "#19d3ff", "#ffe14a", "#ff2d95", "#3ddc84", "#fff"];
    const P = Array.from({ length: 140 }, () => ({ x: Math.random() * w, y: -Math.random() * h * 0.8, vx: (Math.random() - 0.5) * 80, vy: 90 + Math.random() * 160, r: Math.random() * 6, vr: (Math.random() - 0.5) * 9, s: 6 + Math.random() * 7, c: cols[(Math.random() * cols.length) | 0] }));
    const st = (this._conf = { raf: 0 }); let last = performance.now(), t0 = last;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.clearRect(0, 0, w, h);
      for (const p of P) {
        p.x += (p.vx + Math.sin(now / 400 + p.r) * 30) * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        if (p.y > h + 20 && now - t0 < 5000) { p.y = -20; p.x = Math.random() * w; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.cos(p.r * 1.3)); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      }
      if (now - t0 < 9000) st.raf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, w, h);
    };
    st.raf = requestAnimationFrame(tick);
  }
  showCupSummary(res, cbs) { this.showResults(res, cbs); }

  hideScreen() { this._clearScreen(); }
}
