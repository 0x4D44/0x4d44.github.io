// Leaked Signals: UI, camera, overlay, panels, guided tour.
import * as C from "./core.mjs";
import { ALL_SOURCES, SITES, RADARS, BEACONS, siteById } from "./sites.mjs";
import { BROADCASTS } from "./broadcasts.mjs";
import { buildField, buildBroadcast, broadcastListeners, beaconSite, beaconJd } from "./field.mjs";
import { createRenderer, perspective, lookAt, mul, project } from "./gl.mjs";
import { TOUR_KEYS, TOUR_LEN } from "./tour.mjs";
import { drawAnatomy } from "./anatomy.mjs";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtLy = x => x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x >= 0.001 ? x.toFixed(4) : x.toExponential(1);
function fmtDist(ly) {
  const au = ly * 63241.077;
  if (ly >= 0.1) return `${fmtLy(ly)} ly`;
  if (au >= 1000) return `${(au / 1000).toFixed(1)}k AU`;
  if (au >= 20) return `${au.toFixed(0)} AU`;
  if (au >= 1) return `${au.toFixed(1)} AU`;
  return `${(au * 149597870.7 / 1e6).toFixed(1)} M km`;
}
function fmtDur(d) { // days -> text
  if (d >= 730) return `${(d / 365.25).toFixed(1)} yr`;
  if (d >= 2) return `${d.toFixed(0)} d`;
  if (d >= 1 / 24) return `${(d * 24).toFixed(1)} h`;
  return `${(d * 1440).toFixed(0)} min`;
}

// ---------- state ----------
const qs = new URLSearchParams(location.search);
if (qs.has("video")) document.documentElement.classList.add("video");
const NOW_YEAR = qs.has("t") ? +qs.get("t") : C.yearFromJd(C.jdFromUnixMs(Date.now()));
const T_MIN = 1934.9, T_MAX = Math.floor(NOW_YEAR) + 100;
const S = {
  T: NOW_YEAR, logR: 2.1, yaw: 0.7, pitch: 0.38, size: 1.7, gain: 0.55, phys: false,
  stars: true, labels: true, grid: true, solo: null, hl: null, star: null, rx: "fast", tsys: 300, tier: "picture",
  playing: false, speed: 1, tab: "explore", driftSite: null,
};
const STARS = window.LEAK_STARS;
const STAR_VEC = new Float32Array(STARS.n * 3);
for (let i = 0; i < STARS.n; i++) {
  const v = C.radec2vec(STARS.ra[i], STARS.dec[i]);
  STAR_VEC[3 * i] = v[0] * STARS.ly[i]; STAR_VEC[3 * i + 1] = v[1] * STARS.ly[i]; STAR_VEC[3 * i + 2] = v[2] * STARS.ly[i];
}
const starSize = v => (v == null ? 2.4 : Math.max(2.4, Math.min(8, 6.2 - 0.45 * v)));
const NAMED = Object.keys(STARS.names).map(Number).sort((a, b) => ((STARS.v[a] ?? 99) - (STARS.v[b] ?? 99)) || STARS.ly[a] - STARS.ly[b]);
const starByName = n => { for (const k in STARS.names) if (STARS.names[k] === n) return +k; return null; };

// colours per country
const CC_COL = { GB: [1, .71, .33], US: [.35, .84, 1], DE: [1, .42, .6], FR: [.56, .62, 1], RU: [1, .36, .3], JP: [1, .5, .85], AU: [.5, 1, .55], IT: [.5, .9, .4], ES: [1, .85, .3], CA: [.85, .55, 1], BR: [.2, 1, .6], IN: [1, .6, .2], CN: [1, .25, .25] };
const CCS = [...new Set(ALL_SOURCES.map(s => s.cc))];
const ccColour = {};
CCS.forEach((cc, i) => {
  if (CC_COL[cc]) { ccColour[cc] = CC_COL[cc]; return; }
  const h = (i * 137.5) % 360, s = .7, l = .62, k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  ccColour[cc] = [f(0), f(8), f(4)];
});
const palette = []; ALL_SOURCES.forEach(s => palette.push(...(s.kind === "radar" ? [1, 1, 1] : ccColour[s.cc])));
const cssCol = cc => { const c = ccColour[cc]; return `rgb(${c.map(x => Math.round(x * 255)).join(",")})`; };

const jdOf = () => C.jdFromYear(S.T);
const R_VIEW = () => Math.pow(10, S.logR);
const FIRST_TV = Math.min(...SITES.map(s => s.start));
const EDGE = () => Math.max(0, S.T - FIRST_TV);          // bubble radius, ly

// ---------- DOM scaffolding ----------
const glc = $("#gl"), ov = $("#ov"), stage = $("#stage"), octx = ov.getContext("2d");
let R = null, glFail = null;
try { R = createRenderer(glc); } catch (e) { glFail = e; }
if (!R) {
  stage.insertAdjacentHTML("beforeend", `<div style="position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:#cfd9ee">
    <div><b>WebGL is not available in this browser.</b><p>The simulator draws about half a million wavefront points on the GPU. You can still use the panel on the right.</p></div></div>`);
} else {
  R.setPalette(palette);
  const pos = STAR_VEC, sz = new Float32Array(STARS.n * 2);
  for (let i = 0; i < STARS.n; i++) { sz[2 * i] = starSize(STARS.v[i]); sz[2 * i + 1] = 0; }
  R.setStars(pos, sz);
}

// ---------- field management ----------
let field = null, fieldKey = "", hlField = null, hlId = null, rebuildTimer = 0, lastBuildMs = 0;
const sourceFilter = src => !S.solo || S.solo.has(src.kind === "radar" ? "RADAR" : src.cc);
const soloKey = () => (S.solo ? [...S.solo].sort().join(",") : "*");
const EDGE_SEL = () => { // bubble radius of the selected countries only (HUD and first-TV marker)
  if (!S.solo || !S.solo.size) return EDGE();
  const st = SITES.filter(sourceFilter).map(s => s.start);
  return st.length ? Math.max(0, S.T - Math.min(...st)) : EDGE();
};
function wantWindow() { return Math.min(Math.max(EDGE(), 0.0005), Math.max(R_VIEW() * 2.6, 0.0004)); }
function needsRebuild() {
  if (!field) return true;
  const W = wantWindow();
  if (fieldKey !== soloKey()) return true;
  if (W > field.windowLy * 1.02 && field.windowLy < EDGE() * 0.999) return true;
  if (W < field.windowLy / 2.4) return true;
  if (Math.abs(jdOf() - field.jdRef) / C.DAYS_PER_YEAR > 0.3 * field.windowLy) return true;
  return false;
}
function rebuild() {
  if (!R) return;
  const t0 = performance.now();
  const W = Math.min(Math.max(wantWindow() * 1.15, 0.0008), Math.max(EDGE(), 0.0008));
  const fine = W < 0.02, mid = W < 3;
  const az = fine ? 110 : mid ? 80 : 56;
  const nSrc = Math.max(1, ALL_SOURCES.filter(x => x.kind !== "radar" && sourceFilter(x) && C.erpW(x, S.T) > 0).length);
  const rings = clamp(Math.round(300000 / (nSrc * az * 0.6)), 150, 1400);   // fewer sources -> finer time resolution
  field = buildField(jdOf(), W, { rings, az, filter: sourceFilter });
  fieldKey = soloKey();
  R.setField(field);
  lastBuildMs = performance.now() - t0;
  dirty = true;
}
function ensureHighlight() {
  if (!R) return;
  const id = S.hl;
  if (!id) { if (hlId) { R.setHighlight(null); hlField = null; hlId = null; } return; }
  const stale = hlField && Math.abs(jdOf() - hlField.jdRef) > 400;
  if (id !== hlId || stale) {
    const b = BROADCASTS.find(x => x.id === id);
    hlField = buildBroadcast(b, jdOf());
    R.setHighlight(hlField); hlId = id;
  }
}

// ---------- listening state: which stars are lit right now ----------
let heardCount = 0, lastHeardT = -1;
const HEAR_HI = 3;
function updateHeard(force) {
  if (!R) return;
  if (!force && Math.abs(S.T - lastHeardT) < 0.00015) return;
  lastHeardT = S.T;
  const jdT = jdOf(), st = new Float32Array(STARS.n * 2);
  const act = ALL_SOURCES.filter(s => s.kind !== "radar" && sourceFilter(s));
  const pre = act.map(s => ({ s, sp: Math.sin(s.lat * C.D2R), cp: Math.cos(s.lat * C.D2R), cl: Math.cos(s.lon * C.D2R), sl: Math.sin(s.lon * C.D2R),
    lo: Math.sin(-C.horizonDip(s.h || 300) * C.D2R), hi: Math.sin(HEAR_HI * C.D2R) }));
  heardCount = 0;
  for (let i = 0; i < STARS.n; i++) {
    st[2 * i] = starSize(STARS.v[i]);
    const ly = STARS.ly[i];
    if (ly > EDGE()) continue;
    const jdE = jdT - ly * C.DAYS_PER_YEAR;
    const g = C.gmstDeg(jdE) - STARS.ra[i], cg = Math.cos(g * C.D2R), sg = Math.sin(g * C.D2R);
    const sd = Math.sin(STARS.dec[i] * C.D2R), cd = Math.cos(STARS.dec[i] * C.D2R);
    for (const p of pre) {
      const cH = cg * p.cl - sg * p.sl;
      const sE = p.sp * sd + p.cp * cd * cH;
      if (sE >= p.lo && sE <= p.hi && C.onAirW(p.s, jdE) > 0) { st[2 * i + 1] = 1; heardCount++; break; }
    }
  }
  if (S.star != null) st[2 * S.star + 1] = 2;
  R.setStarState(st);
}

// ---------- camera ----------
let VP = null, dirty = true, W = 800, H = 600, DPR = 1;
function camera() {
  const r = R_VIEW(), cp = Math.cos(S.pitch), eye = [r * cp * Math.cos(S.yaw), r * cp * Math.sin(S.yaw), r * Math.sin(S.pitch)];
  const view = lookAt(eye, [0, 0, 0], [0, 0, 1]);
  const proj = perspective(50 * C.D2R, W / H, r * 0.002, r * 1e4);
  VP = mul(proj, view);
  return { eye, r };
}
function resize() {
  const b = stage.getBoundingClientRect();
  W = Math.max(2, b.width); H = Math.max(2, b.height); DPR = Math.min(window.devicePixelRatio || 1, 2);
  if (R) R.resize(W, H, DPR);
  ov.width = Math.round(W * DPR); ov.height = Math.round(H * DPR);
  dirty = true;
}
new ResizeObserver(resize).observe(stage);

// ---------- frame ----------
const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const zoomGain = () => 1 - 0.8 * sstep(-1.0, 2.1, S.logR);     // fewer photons per point once thousands overlap
const zoomSize = () => 2.6 - 1.7 * sstep(-3.6, -0.5, S.logR);  // each ray is a visible dot at AU scales
function frame() {
  if (R && !tourSeeking && needsRebuild()) {
    clearTimeout(rebuildTimer);
    const dragging = ptr.down;
    if (!field || !dragging) rebuild();
  }
  ensureHighlight();
  if (R) updateHeard(false);
  const cam = camera();
  if (R) {
    R.draw({
      vp: VP, dT: field ? (jdOf() - field.jdRef) / C.DAYS_PER_YEAR : 0, dpr: DPR, size: S.size * zoomSize(), gain: S.gain * zoomGain(), phys: S.phys ? 1 : 0, r0: 12,
      rmax: 1e9, stars: S.stars, dim: S.hl ? 0.12 : 1,
      hlDT: hlField ? (jdOf() - hlField.jdRef) / C.DAYS_PER_YEAR : null,
    });
  }
  drawOverlay(cam);
  updateHud();
  dirty = false;
}

// ---------- overlay (2D) ----------
function circle3(centre, axisU, axisV, rad, n, dash) {
  octx.beginPath();
  let pen = false;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI, c = Math.cos(a) * rad, s = Math.sin(a) * rad;
    const p = [centre[0] + axisU[0] * c + axisV[0] * s, centre[1] + axisU[1] * c + axisV[1] * s, centre[2] + axisU[2] * c + axisV[2] * s];
    const q = project(VP, p, W, H);
    if (q[2] <= 0) { pen = false; continue; }
    if (!pen) { octx.moveTo(q[0], q[1]); pen = true; } else octx.lineTo(q[0], q[1]);
  }
  octx.stroke();
}
function label(text, x, y, color = "#cfd9ee", align = "left", size = 12) {
  octx.font = `${size}px ui-monospace,Menlo,Consolas,monospace`;
  octx.textAlign = align; octx.lineWidth = 3; octx.strokeStyle = "rgba(3,5,10,.85)"; octx.strokeText(text, x, y);
  octx.fillStyle = color; octx.fillText(text, x, y);
}
function drawOverlay(cam) {
  octx.setTransform(DPR, 0, 0, DPR, 0, 0);
  octx.clearRect(0, 0, W, H);
  const edge = EDGE(), r = cam.r;
  // polar axis
  if (S.grid) {
    octx.lineWidth = 1; octx.setLineDash([2, 4]); octx.strokeStyle = "rgba(160,180,220,.22)";
    const L = Math.max(r * 0.9, edge * 1.05);
    const a = project(VP, [0, 0, -L], W, H), b = project(VP, [0, 0, L], W, H);
    if (a[2] > 0 && b[2] > 0) { octx.beginPath(); octx.moveTo(a[0], a[1]); octx.lineTo(b[0], b[1]); octx.stroke(); label("N celestial pole", b[0] + 4, b[1], "#7b8cae"); }
    // distance rings in the equatorial plane
    for (const d of [1 / 63241 * 100, 1 / 63241 * 10000, 1, 10, 100, 1000]) {
      if (d > r * 3 || d < r * 0.02) continue;
      octx.strokeStyle = "rgba(160,180,220,.16)"; circle3([0, 0, 0], [1, 0, 0], [0, 1, 0], d, 120);
      const q = project(VP, [d * Math.cos(0.7), d * Math.sin(0.7), 0], W, H);
      if (q[2] > 0 && q[0] > 0 && q[0] < W && q[1] > 0 && q[1] < H) label(fmtDist(d) + (d >= 1 && edge > d ? `  (${(S.T - d).toFixed(0)})` : ""), q[0] + 4, q[1] - 3, "#6b7da3", "left", 11);
    }
    octx.setLineDash([]);
    // equatorial plane & ecliptic great circles at the bubble edge
    if (edge > r * 0.05) {
      octx.strokeStyle = "rgba(88,214,255,.14)"; circle3([0, 0, 0], [1, 0, 0], [0, 1, 0], edge, 160);
      const e = 23.4393 * C.D2R;
      octx.strokeStyle = "rgba(255,180,84,.12)"; octx.setLineDash([6, 5]);
      circle3([0, 0, 0], [1, 0, 0], [0, Math.cos(e), Math.sin(e)], edge, 160); octx.setLineDash([]);
      const q = project(VP, [edge, 0, 0], W, H);
      if (q[2] > 0) label(`first TV, ${(S.T - edge).toFixed(1)}`, q[0] + 6, q[1] + 12, "#58d6ff", "left", 11);
      // reachable-declination limit circles for a single selected latitude
      const lats = soloLats();
      for (const lat of lats) {
        const dlim = (90 - Math.abs(lat)) * C.D2R, rr = edge * Math.cos(dlim);
        octx.strokeStyle = "rgba(255,180,84,.55)"; octx.setLineDash([3, 3]);
        for (const sgn of [1, -1]) circle3([0, 0, sgn * edge * Math.sin(dlim)], [1, 0, 0], [0, 1, 0], rr, 120);
        octx.setLineDash([]);
        const q2 = project(VP, [edge * Math.cos(dlim), 0, edge * Math.sin(dlim)], W, H);
        if (q2[2] > 0) label(`beams end at declination ±${(90 - Math.abs(lat)).toFixed(0)}°`, q2[0] + 6, q2[1], "#ffb454", "left", 11);
      }
    }
  }
  // beacons
  if (!S.solo || S.solo.has("BEACON")) for (const b of BEACONS) {
    const jd = beaconJd(b), age = (jdOf() - jd) / C.DAYS_PER_YEAR;
    if (age < 0) continue;
    const d = C.radec2vec(b.ra, b.dec), p = [d[0] * age, d[1] * age, d[2] * age], q = project(VP, p, W, H);
    if (q[2] <= 0 || q[0] < -20 || q[0] > W + 20 || q[1] < -20 || q[1] > H + 20) continue;
    octx.strokeStyle = "#5affd8"; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(q[0], q[1], 7, 0, 7); octx.stroke();
    label(b.name, q[0] + 11, q[1] + 4, "#5affd8", "left", 11);
  }
  // stars
  if (S.stars && S.labels) {
    const used = [], maxLabels = W < 620 ? 6 : 11;
    let n = 0;
    const rLim = Math.max(r * 1.6, 3);
    for (const i of NAMED) {
      if (n >= maxLabels) break;
      const ly = STARS.ly[i];
      if (ly > rLim && S.star !== i) continue;
      const q = project(VP, [STAR_VEC[3 * i], STAR_VEC[3 * i + 1], STAR_VEC[3 * i + 2]], W, H);
      if (q[2] <= 0 || q[0] < 4 || q[0] > W - 60 || q[1] < 14 || q[1] > H - 100) continue;
      { const oq = project(VP, [0, 0, 0], W, H); if (Math.hypot(q[0] - oq[0], q[1] - oq[1]) < 48) continue; }
      if (used.some(u => Math.abs(u[0] - q[0]) < 90 && Math.abs(u[1] - q[1]) < 14)) continue;
      used.push(q); n++;
      label(STARS.names[i], q[0] + 6, q[1] - 5, "#9fb4dc", "left", 11);
    }
  }
  if (S.star != null) {
    const i = S.star, q = project(VP, [STAR_VEC[3 * i], STAR_VEC[3 * i + 1], STAR_VEC[3 * i + 2]], W, H);
    if (q[2] > 0) {
      octx.strokeStyle = "#ffd36b"; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(q[0], q[1], 10, 0, 7); octx.stroke();
      label(`${starName(i)}  ${fmtLy(STARS.ly[i])} ly`, q[0] + 14, q[1] + 4, "#ffd36b", "left", 12);
    }
    const o = project(VP, [0, 0, 0], W, H), q2 = q;
    if (o[2] > 0 && q2[2] > 0) { octx.strokeStyle = "rgba(255,211,107,.25)"; octx.lineWidth = 1; octx.setLineDash([3, 4]); octx.beginPath(); octx.moveTo(o[0], o[1]); octx.lineTo(q2[0], q2[1]); octx.stroke(); octx.setLineDash([]); }
  }
  // Earth marker
  const o = project(VP, [0, 0, 0], W, H);
  if (o[2] > 0) { octx.fillStyle = "#6fd0ff"; octx.beginPath(); octx.arc(o[0], o[1], 3, 0, 7); octx.fill(); label("Earth", o[0] + 6, o[1] - 6, "#6fd0ff", "left", 11); }
  // highlighted broadcast label on the shell
  if (S.hl) {
    const b = BROADCASTS.find(x => x.id === S.hl), t0 = C.jdFromUnixMs(Date.parse(b.start));
    const age = (jdOf() - t0) / C.DAYS_PER_YEAR;
    if (age > 0) {
      const src = siteById[b.site], fr = C.siteFrame(src.lat, src.lon, t0 + b.mins / 2880);
      const d = C.fanDirection(fr, 0.8, 0.5), q = project(VP, [d[0] * age, d[1] * age, d[2] * age], W, H);
      if (q[2] > 0 && q[0] > 0 && q[0] < W && q[1] > 0 && q[1] < H) label(`${b.title} — ${fmtDist(age)} out`, q[0] + 8, q[1], "#5affd8", "left", 12);
    }
  }
}
function soloLats() {
  const lats = [];
  if (S.solo && S.solo.size === 1) { const cc = [...S.solo][0]; const s = SITES.filter(x => x.cc === cc); if (s.length) lats.push(s.reduce((a, x) => a + x.lat, 0) / s.length); }
  if (S.hl) lats.push(siteById[BROADCASTS.find(x => x.id === S.hl).site].lat);
  return lats.slice(0, 1);
}
const starName = i => STARS.names[i] || `Star ${i} (${STARS.ra[i].toFixed(1)}°, ${STARS.dec[i].toFixed(1)}°)`;

function updateHud() {
  const edge = EDGE_SEL(), jd = jdOf();
  $("#hud").innerHTML = `<b>${C.fmtUTC(jd, false)}</b> &nbsp; bubble radius <b>${fmtLy(edge)} ly</b><br>` +
    `view ${fmtDist(R_VIEW())} &nbsp; ${field ? (field.n / 1000).toFixed(0) + "k wavefront points" : ""}` +
    `<br>${S.stars && starsInside() > 0 ? `${heardCount} of ${STARS.stars_in || starsInside()} stars inside the bubble are in a fan right now` : ""}`;
}
let _inside = 0, _insideT = -1;
function starsInside() { if (Math.abs(S.T - _insideT) > 0.01) { _insideT = S.T; const e = EDGE(); _inside = 0; for (let i = 0; i < STARS.n; i++) if (STARS.ly[i] <= e) _inside++; } return _inside; }

// ---------- input ----------
const ptr = { down: false, x: 0, y: 0, moved: 0, pts: new Map(), pinch: 0 };
stage.addEventListener("pointerdown", e => {
  if (e.target.closest(".dock")) return;
  stage.setPointerCapture(e.pointerId);
  ptr.pts.set(e.pointerId, [e.clientX, e.clientY]);
  ptr.down = true; ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved = 0;
  if (ptr.pts.size === 2) { const [a, b] = [...ptr.pts.values()]; ptr.pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
  stopTour();
});
stage.addEventListener("pointermove", e => {
  if (!ptr.pts.has(e.pointerId)) return;
  ptr.pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptr.pts.size === 2) {
    const [a, b] = [...ptr.pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (ptr.pinch) { S.logR = clamp(S.logR - Math.log10(d / ptr.pinch) * 1.1, -4.7, 3); syncDock(); }
    ptr.pinch = d; dirty = true; return;
  }
  const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y; ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved += Math.abs(dx) + Math.abs(dy);
  S.yaw -= dx * 0.006; S.pitch = clamp(S.pitch + dy * 0.006, -1.5, 1.5); dirty = true;
});
const up = e => {
  if (!ptr.pts.has(e.pointerId)) return;
  const wasClick = ptr.moved < 6 && ptr.pts.size === 1;
  ptr.pts.delete(e.pointerId); ptr.pinch = 0;
  if (!ptr.pts.size) { ptr.down = false; if (wasClick) pickAt(e.clientX, e.clientY); }
};
stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
stage.addEventListener("wheel", e => { e.preventDefault(); stopTour(); S.logR = clamp(S.logR + e.deltaY * 0.0012, -4.7, 3); syncDock(); dirty = true; }, { passive: false });
stage.tabIndex = 0;
stage.addEventListener("keydown", e => {
  const k = e.key;
  if (k === "ArrowLeft") S.yaw += 0.08; else if (k === "ArrowRight") S.yaw -= 0.08;
  else if (k === "ArrowUp") S.pitch = clamp(S.pitch + 0.06, -1.5, 1.5); else if (k === "ArrowDown") S.pitch = clamp(S.pitch - 0.06, -1.5, 1.5);
  else if (k === "+" || k === "=") S.logR = clamp(S.logR - 0.08, -4.7, 3); else if (k === "-") S.logR = clamp(S.logR + 0.08, -4.7, 3);
  else if (k === " ") { togglePlay(); } else return;
  e.preventDefault(); syncDock(); dirty = true;
});
function pickAt(cx, cy) {
  const b = stage.getBoundingClientRect(), x = cx - b.left, y = cy - b.top;
  let best = -1, bd = 14 * 14;
  for (let i = 0; i < STARS.n; i++) {
    if (STARS.ly[i] > Math.max(R_VIEW() * 4, 8)) continue;
    const q = project(VP, [STAR_VEC[3 * i], STAR_VEC[3 * i + 1], STAR_VEC[3 * i + 2]], W, H);
    if (q[2] <= 0) continue;
    const d = (q[0] - x) ** 2 + (q[1] - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  if (best >= 0) selectStar(best, { switchTab: true });
}

// ---------- dock ----------
const SPEEDS = [["1 day / s", 1 / 365.25], ["1 month / s", 1 / 12], ["1 year / s", 1], ["5 years / s", 5], ["20 years / s", 20]];
const SCALES = [["Earth orbit", -4.4], ["Light-day", -2.3], ["Light-year", 0], ["Neighbours", 1.15], ["Whole bubble", 2.15]];
function buildDock() {
  $("#dock").innerHTML = `
  <div class="row">
    <button class="btn" id="play" type="button" aria-label="Play or pause time">▶</button>
    <input type="range" id="tSlider" min="${T_MIN}" max="${T_MAX}" step="${1 / 365.25 / 4}" aria-label="Observer date" value="${S.T}">
    <span class="lab" id="tLab"></span>
    <select id="spd" aria-label="Playback speed">${SPEEDS.map((s, i) => `<option value="${i}"${i === 2 ? " selected" : ""}>${s[0]}</option>`).join("")}</select>
    <button class="btn" id="nowBtn" type="button">Now</button>
  </div>
  <div class="row">
    <span class="lab" id="rLab"></span>
    <input type="range" id="rSlider" min="-4.7" max="3" step="0.01" aria-label="Zoom (log scale)" value="${S.logR}">
    ${SCALES.map((s, i) => `<button class="btn" type="button" data-scale="${s[1]}">${s[0]}</button>`).join("")}
  </div>`;
  $("#play").onclick = togglePlay;
  $("#tSlider").oninput = e => { stopTour(); S.T = +e.target.value; dirty = true; syncDock(); };
  $("#rSlider").oninput = e => { stopTour(); S.logR = +e.target.value; dirty = true; syncDock(); };
  $("#spd").onchange = e => { S.speed = SPEEDS[+e.target.value][1]; };
  S.speed = 1;
  $("#nowBtn").onclick = () => { stopTour(); S.T = NOW_YEAR; dirty = true; syncDock(); };
  $$("[data-scale]").forEach(b => b.onclick = () => { stopTour(); animateTo({ logR: +b.dataset.scale }); });
}
function syncDock() {
  const t = $("#tSlider"); if (t && document.activeElement !== t) t.value = S.T;
  const r = $("#rSlider"); if (r && document.activeElement !== r) r.value = S.logR;
  $("#tLab").textContent = C.fmtUTC(jdOf(), false);
  $("#rLab").textContent = "view " + fmtDist(R_VIEW());
  $("#play").textContent = S.playing ? "❚❚" : "▶";
  $("#play").setAttribute("aria-pressed", S.playing);
}
function togglePlay() { stopTour(); S.playing = !S.playing; syncDock(); }
let anim = null;
function animateTo(target, ms = 900) {
  const from = { logR: S.logR, yaw: S.yaw, pitch: S.pitch, T: S.T }, t0 = performance.now();
  anim = { from, target, t0, ms };
}
function stepAnim(now) {
  if (!anim) return;
  const k = clamp((now - anim.t0) / anim.ms, 0, 1), e = k * k * (3 - 2 * k);
  for (const key in anim.target) {
    let tv = anim.target[key];
    if (key === "yaw") { let d = tv - anim.from.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); tv = anim.from.yaw + d; }
    S[key] = anim.from[key] + (tv - anim.from[key]) * e;
  }
  dirty = true; syncDock();
  if (k >= 1) anim = null;
}

// ---------- selection ----------
function selectStar(i, o = {}) {
  S.star = i; lastHeardT = -1; dirty = true;
  if (o.switchTab) setTab("listen");
  renderListen(true);
}
function focusStar(i) {
  const v = C.radec2vec(STARS.ra[i], STARS.dec[i]);
  animateTo({ logR: Math.log10(Math.max(STARS.ly[i] * 1.6, 0.5)), yaw: Math.atan2(v[1], v[0]) + Math.PI + 0.45, pitch: clamp(-Math.asin(v[2]) + 0.2, -1.4, 1.4) });
}

// ---------- panel ----------
const TABS = [["explore", "Explore"], ["listen", "Listen"], ["broadcasts", "Broadcasts"], ["anatomy", "Anatomy"], ["about", "Method"]];
function buildPanel() {
  $("#tabs").innerHTML = TABS.map(([id, n]) => `<button role="tab" id="tab-${id}" aria-controls="body-${id}" aria-selected="${id === S.tab}" data-tab="${id}" type="button">${n}</button>`).join("");
  $("#bodies").innerHTML = TABS.map(([id]) => `<div class="tabbody" role="tabpanel" id="body-${id}" aria-labelledby="tab-${id}" ${id === S.tab ? "" : "hidden"}></div>`).join("");
  $$("#tabs button").forEach(b => b.onclick = () => setTab(b.dataset.tab));
  $("#tabs").addEventListener("keydown", e => {
    const ids = TABS.map(t => t[0]), i = ids.indexOf(S.tab);
    if (e.key === "ArrowRight") setTab(ids[(i + 1) % ids.length], true); else if (e.key === "ArrowLeft") setTab(ids[(i + ids.length - 1) % ids.length], true);
  });
  renderExplore(); renderListen(true); renderBroadcasts(); renderAbout();
  anatomy = { lat: 54, hour: 20, day: true, yaw: 0.5, pitch: 0.35, soft: 3 };
  renderAnatomy();
}
function setTab(id, focus) {
  S.tab = id;
  $$("#tabs button").forEach(b => { const on = b.dataset.tab === id; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
  $$(".tabbody").forEach(b => b.hidden = b.id !== "body-" + id);
  if (id === "listen") renderListen(true);
  if (id === "anatomy") drawAnatomyNow();
}

function ccList() { return CCS.map(cc => ({ cc, n: ALL_SOURCES.filter(s => s.cc === cc).length })); }
function renderExplore() {
  const el = $("#body-explore");
  el.innerHTML = `
  <h2>The idea</h2>
  <p>Television transmitters spray signals along the horizon. Those that clear the ionosphere (VHF/UHF, from the mid-1930s) leave the planet and never stop. Every dot is a sample of a wavefront, sent at a random moment and azimuth and aimed using the Earth's real orientation at that moment. <span class="dim">Drag to orbit, scroll or pinch to zoom, click a star to listen as it.</span></p>
  <div class="kpi" id="kpi"></div>
  <h2>Whose signals</h2>
  <div class="chips" id="ccChips"></div>
  <p class="faint" style="margin-top:6px">Pick one or more. Choose a single country to see where its beams end on the sky.</p>
  <h2>Look</h2>
  <div class="field"><label for="sSize">Point size</label><input type="range" id="sSize" min="0.8" max="4" step="0.1" value="${S.size}"></div>
  <div class="field"><label for="sGain">Brightness</label><input type="range" id="sGain" min="0.1" max="3" step="0.05" value="${S.gain}"></div>
  <div class="chips">
    <button class="chip" type="button" data-toggle="stars" aria-pressed="${S.stars}">Stars</button>
    <button class="chip" type="button" data-toggle="labels" aria-pressed="${S.labels}">Labels</button>
    <button class="chip" type="button" data-toggle="grid" aria-pressed="${S.grid}">Grid &amp; rings</button>
    <button class="chip" type="button" data-toggle="phys" aria-pressed="${S.phys}" title="Dim each wavefront as 1/r², like the real inverse-square law">Physical dimming</button>
  </div>
  <details open><summary>What am I looking at?</summary>
    <p><b>Colour</b> is the country. <b>Dense bands</b> are where fans cross the sky; the sky near the celestial poles is dim because a mast at 54°N can only reach declinations between −36° and +36°. <b>Thin streaks</b> along the ecliptic are planetary radar (Arecibo, Goldstone). <b>Teal dots</b> are one broadcast, selected in Broadcasts. <b>Amber stars</b> are catching a fan right now.</p>
    <p>At the very closest zoom you can see individual fans leaving, about two minutes of airtime apart. Zoom out and they overlap into the spiral, then into a bubble.</p>
  </details>
  <p class="faint">${ALL_SOURCES.length} sources (${SITES.length} TV sites, ${RADARS.length} radars) &middot; ${STARS.n.toLocaleString()} stars within 100 ly &middot; <span id="buildMs"></span></p>`;
  const chips = $("#ccChips");
  chips.innerHTML = `<button class="chip" type="button" data-cc="*" aria-pressed="true">All</button>` + ccList().map(({ cc }) =>
    `<button class="chip" type="button" data-cc="${cc}" aria-pressed="false"><span class="dot" style="background:${cssCol(cc)}"></span>${cc}</button>`).join("") +
    `<button class="chip" type="button" data-cc="RADAR" aria-pressed="false"><span class="dot" style="background:#fff"></span>Radar</button>` +
    `<button class="chip" type="button" data-cc="BEACON" aria-pressed="false"><span class="dot" style="background:#5affd8"></span>Messages</button>`;
  chips.onclick = e => {
    const b = e.target.closest("[data-cc]"); if (!b) return; const cc = b.dataset.cc;
    if (cc === "*") S.solo = null;
    else { const s = S.solo ? new Set(S.solo) : new Set(); if (s.has(cc)) s.delete(cc); else s.add(cc); S.solo = s.size ? s : null; }
    $$("#ccChips .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.cc === "*" ? !S.solo : !!(S.solo && S.solo.has(c.dataset.cc))));
    lastHeardT = -1; dirty = true;
  };
  $("#sSize").oninput = e => { S.size = +e.target.value; dirty = true; };
  $("#sGain").oninput = e => { S.gain = +e.target.value; dirty = true; };
  $$("[data-toggle]", el).forEach(b => b.onclick = () => { const k = b.dataset.toggle; S[k] = !S[k]; b.setAttribute("aria-pressed", S[k]); dirty = true; });
}
function updateKpi() {
  const k = $("#kpi"); if (!k) return;
  const e = EDGE_SEL();
  k.innerHTML = `<div><b>${fmtLy(e)}</b><span>bubble radius, ly</span></div><div><b>${starsInside().toLocaleString()}</b><span>stars inside it</span></div><div><b>${heardCount}</b><span>in a fan right now</span></div>`;
  const m = $("#buildMs"); if (m) m.textContent = `last rebuild ${lastBuildMs.toFixed(0)} ms`;
}

// ----- Listen -----
function sourceRows(i, jdT) {
  const ly = STARS.ly[i], jdE = jdT - ly * C.DAYS_PER_YEAR, rows = [];
  for (const s of ALL_SOURCES) {
    if (s.kind === "radar") continue;
    const r = C.receptionFrom(s, jdE, STARS.ra[i], STARS.dec[i]);
    if (r.blocked) continue;
    if (r.el > 3) continue;
    rows.push({ s, ...r, jdE });
  }
  return rows.sort((a, b) => b.w - a.w);
}
function matchProgramme(site, jd) {
  for (const b of BROADCASTS) {
    if (b.site !== site.id) continue;
    const t0 = C.jdFromUnixMs(Date.parse(b.start)), t1 = t0 + b.mins / 1440;
    if (jd >= t0 && jd <= t1) return b;
  }
  return null;
}
let listenTimer = 0;
function renderListen(full) {
  const el = $("#body-listen"); if (!el) return;
  if (S.tab !== "listen" && !full) return;
  const i = S.star;
  if (full || !el.dataset.built) {
    const nearest = [...Array(60).keys()].filter(k => STARS.names[k]).slice(0, 14);
    el.dataset.built = "1";
    el.innerHTML = `
    <h2>Pick a listener</h2>
    <div class="field"><label for="starSearch">Star</label><input id="starSearch" type="search" list="starlist" placeholder="Sirius, Tau Ceti, Vega…" autocomplete="off"></div>
    <datalist id="starlist">${NAMED.slice(0, 600).map(k => `<option value="${esc(STARS.names[k])}"></option>`).join("")}</datalist>
    <div class="chips" id="quickStars">${["Proxima Centauri", "Sirius", "Tau Ceti", "Vega", "Epsilon Eridani", "Altair", "Fomalhaut", "Arcturus", "Pollux", "Barnard's Star"].map(n => starByName(n) != null ? `<button class="chip" type="button" data-star="${starByName(n)}">${esc(n)}</button>` : "").join("")}</div>
    <p class="faint">Or click any star in the view.</p>
    <div id="listenBody"></div>`;
    $("#starSearch").onchange = e => { const k = starByName(e.target.value.trim()); if (k != null) { selectStar(k); focusStar(k); } };
    $("#quickStars").onclick = e => { const b = e.target.closest("[data-star]"); if (b) { selectStar(+b.dataset.star); focusStar(+b.dataset.star); } };
  }
  const body = $("#listenBody");
  if (i == null) { body.innerHTML = `<div class="note">No star selected. Pick one above to see what it is hearing and when.</div>`; return; }
  const jdT = jdOf(), ly = STARS.ly[i], jdE = jdT - ly * C.DAYS_PER_YEAR;
  const rows = sourceRows(i, jdT);
  const rx = C.RECEIVERS.find(r => r.id === S.rx), tier = C.TIERS.find(t => t.id === S.tier);
  const inside = ly <= EDGE();
  const [rh, dh] = [STARS.ra[i], STARS.dec[i]];
  const topNow = rows.filter(r => r.w > 0).slice(0, 5);
  const strongest = topNow[0];
  let verdict = "";
  if (!inside) verdict = `<div class="verdict">The bubble has not reached ${esc(starName(i))} yet. It is ${fmtLy(ly)} light-years out, and television began ${fmtLy(S.T - FIRST_TV)} years ago, so the first broadcasts arrive in <b>${(FIRST_TV + ly).toFixed(0)}</b>.</div>`;
  else if (!strongest) verdict = `<div class="verdict">Right now nothing is aimed at ${esc(starName(i))}. On Earth, the broadcasts it would hear are the ones sent in <b>${C.fmtUTC(jdE, false)}</b>, when no transmitter that was on air had it near its horizon.</div>`;
  else {
    const eirp = strongest.w, cleared = C.tiersClearedAt(eirp, ly, rx.area, S.tsys);
    const range = C.rangeLy(eirp, rx.area, tier, S.tsys);
    const can = cleared.includes(S.tier);
    verdict = `<div class="verdict ${can ? "good" : "bad"}">With <b>${esc(rx.name)}</b>, ${esc(starName(i))} ${can ? "could" : "could not"} make out the <b>${esc(tier.name.toLowerCase())}</b> from ${esc(strongest.s.name)}: the mast radiates ${(eirp / 1e3).toFixed(eirp < 1e5 ? 1 : 0)} kW toward it, a ${tier.name.toLowerCase()} needs SNR≥${tier.snr} in ${tier.bw >= 1e6 ? (tier.bw / 1e6).toFixed(1) + " MHz" : tier.bw >= 1e3 ? (tier.bw / 1e3).toFixed(0) + " kHz" : tier.bw + " Hz"}, which that dish only manages out to <b>${fmtDist(range)}</b>. Cleared here: ${cleared.length ? cleared.join(", ") : "no other source on the list"}.</div><p class="dim">Idealised: the full geometric area of each dish is assumed to work at VHF/UHF with perfect efficiency, and radiated power is treated as isotropic-equivalent (a real mast adds about 2 dB). Real instruments of this size are not built for these frequencies, so read the ranges as upper bounds.</p>`;
  }
  const tbl = topNow.length ? `<table><thead><tr><th>Source</th><th>El°</th><th>Sent (local)</th><th></th></tr></thead><tbody>${topNow.map(r => {
    const p = matchProgramme(r.s, r.jdE), lh = C.localHour(r.jdE, r.s.lon), hh = Math.floor(lh), mm = Math.floor((lh - hh) * 60);
    return `<tr><td><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cssCol(r.s.cc)};margin-right:5px"></span>${esc(r.s.name)}</td><td class="mono">${(Math.abs(r.el) < 0.05 ? 0 : r.el).toFixed(1)}</td><td class="mono">${C.fmtUTC(r.jdE, false)} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}</td><td>${p ? `<span class="tag ok">${esc(p.title)}</span>` : (C.isAnalogue(r.s, C.yearFromJd(r.jdE)) ? "" : `<span class="tag">digital</span>`)}</td></tr>`;
  }).join("")}</tbody></table>` : "";
  body.innerHTML = `
  <h2>${esc(starName(i))}</h2>
  <p class="dim mono">${fmtLy(ly)} ly &middot; RA ${(rh / 15).toFixed(2)}h &middot; Dec ${dh.toFixed(1)}° &middot; hears the Earth of <b class="amber">${C.fmtUTC(jdE, false)}</b></p>
  ${verdict}
  ${tbl}
  <h2>Reception windows</h2>
  <canvas class="chart" id="stripCv" width="760" height="${Math.max(120, 28 + 22 * Math.min(8, ALL_SOURCES.length))}"></canvas>
  <p class="faint">Each bar is a period in the next 24 hours when ${esc(starName(i))} sits within 3° of a transmitter's horizon. Bars repeat about every 24 h less 4 minutes: a rising or setting star.</p>
  <h2>The 4-minute drift</h2>
  <div class="field"><label for="driftSel">Site</label><select id="driftSel"></select></div>
  <canvas class="chart" id="driftCv" width="760" height="260"></canvas>
  <p class="faint">Time of day (UT, vertical) at which this star hears the site, over the next year. The schedule slips 3 min 56 s earlier each day, so over a year it samples every slot.</p>
  <h2>Could they actually watch?</h2>
  <div class="field"><label for="rxSel">Receiver</label><select id="rxSel">${C.RECEIVERS.map(r => `<option value="${r.id}"${r.id === S.rx ? " selected" : ""}>${esc(r.name)}</option>`).join("")}</select></div>
  <div class="field"><label for="tierSel">Goal</label><select id="tierSel">${C.TIERS.map(t => `<option value="${t.id}"${t.id === S.tier ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
  <canvas class="chart" id="rangeCv" width="760" height="210"></canvas>
  <p class="faint">Horizontal range at which each receiver clears SNR for a 1 MW transmitter (system noise ${S.tsys} K, VHF sky). Dashed line: this star. Inverse-square law and kTB noise only; no atmosphere, no interference.</p>`;
  $("#rxSel").onchange = e => { S.rx = e.target.value; renderListen(); };
  $("#tierSel").onchange = e => { S.tier = e.target.value; renderListen(); };
  drawStrip(i, jdT, rows);
  drawDrift(i, jdT, rows);
  drawRanges(ly);
}
function chartCtx(cv) { const c = cv.getContext("2d"); c.font = "11px ui-monospace,Menlo,monospace"; return c; }
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function drawStrip(i, jdT, rows) {
  const cv = $("#stripCv"); if (!cv) return; const c = chartCtx(cv), Wd = cv.width, Hd = cv.height;
  c.clearRect(0, 0, Wd, Hd);
  const ly = STARS.ly[i], jdE0 = jdT - ly * C.DAYS_PER_YEAR;
  const list = ALL_SOURCES.filter(s => s.kind !== "radar" && C.erpW(s, C.yearFromJd(jdE0)) > 0);
  const x0 = 150, x1 = Wd - 10, top = 22, rowH = 22;
  c.fillStyle = css("--dim"); c.textAlign = "center";
  for (let h = 0; h <= 24; h += 6) { const x = x0 + (h / 24) * (x1 - x0); c.fillText(h === 0 ? "now" : `+${h}h`, x, 12); c.strokeStyle = css("--line"); c.beginPath(); c.moveTo(x, 16); c.lineTo(x, Hd - 2); c.stroke(); }
  let row = 0;
  const res = list.map(s => ({ s, w: C.visibilityWindows(s.lat, s.lon, STARS.ra[i], STARS.dec[i], jdE0, jdE0 + 1, -C.horizonDip(s.h || 300), 3) })).filter(r => r.w.length);
  res.sort((a, b) => b.w.length - a.w.length || a.s.lat - b.s.lat);
  const shown = res.slice(0, Math.floor((Hd - top) / rowH));
  cv.height = Math.max(cv.height, top + rowH * shown.length + 6);
  for (const r of shown) {
    const y = top + row * rowH;
    c.fillStyle = cssCol(r.s.cc); c.textAlign = "left"; c.fillText(r.s.name.slice(0, 22), 6, y + 14);
    for (const w of r.w) {
      const a = x0 + clamp((w.t0 - jdE0), 0, 1) * (x1 - x0), b = x0 + clamp((w.t1 - jdE0), 0, 1) * (x1 - x0);
      c.globalAlpha = 0.9; c.fillRect(a, y + 3, Math.max(2, b - a), 14); c.globalAlpha = 1;
    }
    row++;
  }
  if (!shown.length) { c.fillStyle = css("--dim"); c.textAlign = "left"; c.fillText("No transmitter had this star on its horizon in that 24 h.", 10, 50); }
}
function drawDrift(i, jdT, rows) {
  const sel = $("#driftSel"); if (!sel) return;
  const ly = STARS.ly[i];
  const cand = ALL_SOURCES.filter(s => s.kind !== "radar" && C.erpW(s, C.yearFromJd(jdT - ly * C.DAYS_PER_YEAR)) > 0 && Math.abs(STARS.dec[i]) <= 90 - Math.abs(s.lat) + 3);
  if (!S.driftSite || !cand.find(s => s.id === S.driftSite)) S.driftSite = (cand.find(s => s.id === "gb-london") || cand[0] || {}).id;
  sel.innerHTML = cand.map(s => `<option value="${s.id}"${s.id === S.driftSite ? " selected" : ""}>${esc(s.name)}</option>`).join("") || `<option>none: this star is circumpolar for every site</option>`;
  sel.onchange = e => { S.driftSite = e.target.value; drawDrift(i, jdT, rows); };
  const cv = $("#driftCv"), c = chartCtx(cv), Wd = cv.width, Hd = cv.height;
  c.clearRect(0, 0, Wd, Hd);
  const s = siteById[S.driftSite]; if (!s) return;
  const x0 = 40, x1 = Wd - 10, y0 = 10, y1 = Hd - 24;
  c.strokeStyle = css("--line"); c.fillStyle = css("--dim"); c.textAlign = "right";
  for (let h = 0; h <= 24; h += 6) { const y = y1 - (h / 24) * (y1 - y0); c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); c.fillText(String(h).padStart(2, "0") + "h", x0 - 4, y + 4); }
  c.textAlign = "center";
  for (let d = 0; d <= 365; d += 73) { const x = x0 + (d / 365) * (x1 - x0); c.fillText(d === 0 ? "today" : `+${d}d`, x, Hd - 8); }
  const jdE0 = Math.floor(jdT - ly * C.DAYS_PER_YEAR - 0.5) + 0.5;
  const dip = C.horizonDip(s.h || 300);
  c.fillStyle = cssCol(s.cc);
  for (let d = 0; d < 365; d++) {
    const w = C.visibilityWindows(s.lat, s.lon, STARS.ra[i], STARS.dec[i], jdE0 + d, jdE0 + d + 1, -dip, 3);
    for (const k of w) {
      const x = x0 + (d / 365) * (x1 - x0);
      const hA = ((k.t0 - (jdE0 + d)) * 24), hB = ((k.t1 - (jdE0 + d)) * 24);
      const yA = y1 - (hA / 24) * (y1 - y0), yB = y1 - (hB / 24) * (y1 - y0);
      c.fillRect(x, Math.min(yA, yB), 2, Math.max(2, Math.abs(yA - yB)));
    }
  }
}
function drawRanges(ly) {
  const cv = $("#rangeCv"); if (!cv) return; const c = chartCtx(cv), Wd = cv.width, Hd = cv.height;
  c.clearRect(0, 0, Wd, Hd);
  const tier = C.TIERS.find(t => t.id === S.tier);
  const x0 = 190, x1 = Wd - 10, lo = -6, hi = 5; // log10 ly
  const X = v => x0 + ((Math.log10(v) - lo) / (hi - lo)) * (x1 - x0);
  c.strokeStyle = css("--line"); c.fillStyle = css("--dim"); c.textAlign = "center";
  for (let e = lo; e <= hi; e += 1) { const x = x0 + ((e - lo) / (hi - lo)) * (x1 - x0); c.beginPath(); c.moveTo(x, 4); c.lineTo(x, Hd - 22); c.stroke(); if (e % 2 === 0 || e === hi) c.fillText(e === 0 ? "1 ly" : e === -5 ? "1 AU" : `10^${e}`, x, Hd - 8); }
  const rowH = (Hd - 28) / C.RECEIVERS.length;
  C.RECEIVERS.forEach((r, k) => {
    const y = 4 + k * rowH, rg = C.rangeLy(1e6, r.area, tier, S.tsys), xr = clamp(X(rg), x0, x1);
    c.textAlign = "left"; c.fillStyle = r.id === S.rx ? css("--amber") : css("--dim"); c.fillText(r.name.slice(0, 29), 4, y + rowH * 0.62);
    c.fillStyle = r.id === S.rx ? css("--amber") : css("--cyan"); c.globalAlpha = r.id === S.rx ? 1 : 0.7; c.fillRect(x0, y + 3, Math.max(1, xr - x0), rowH - 6); c.globalAlpha = 1;
    c.fillStyle = css("--ink"); c.textAlign = "left"; c.fillText(fmtDist(rg), Math.min(xr + 4, Wd - 70), y + rowH * 0.62);
  });
  const xs = X(ly); c.strokeStyle = css("--rose"); c.setLineDash([4, 3]); c.beginPath(); c.moveTo(xs, 2); c.lineTo(xs, Hd - 22); c.stroke(); c.setLineDash([]);
}

// ----- Broadcasts -----
function renderBroadcasts() {
  const el = $("#body-broadcasts");
  el.innerHTML = `<h2>Chase a programme</h2>
  <p>Pick a broadcast to light its wavefront and see which stars lay in its fan. The shell is as thick as the programme is long in light-time (a 2-hour show is a shell 2 light-hours deep). Seen from outside, a mast sends power in every compass direction at once, so one instant is a full ring; the Earth turns while the show airs, so the ring smears into a belt that never leaves ±(90° − latitude) of the celestial equator. Stray dots toward the poles are the 2% of energy that leaks upward.</p>
  <div class="list" id="bList">${BROADCASTS.map(b => `<button class="item" type="button" data-b="${b.id}"><div class="t">${esc(b.title)}<span class="tag ${b.status === "missing" ? "missing" : b.status === "live" ? "live" : "ok"}">${b.status === "missing" ? "wiped" : b.status === "live" ? "never recorded" : "survives"}</span></div><div class="m">${b.start.slice(0, 10)} &middot; ${esc(siteById[b.site].name)}</div></button>`).join("")}</div>
  <div id="bDetail"></div>`;
  $("#bList").onclick = e => { const b = e.target.closest("[data-b]"); if (b) selectBroadcast(b.dataset.b); };
}
const listenerCache = {};
function selectBroadcast(id, fly = true) {
  S.hl = id; hlId = null; dirty = true;
  $$("#bList .item").forEach(b => b.classList.toggle("sel", b.dataset.b === id));
  const b = BROADCASTS.find(x => x.id === id), t0 = C.jdFromUnixMs(Date.parse(b.start));
  const age = (jdOf() - t0) / C.DAYS_PER_YEAR, src = siteById[b.site];
  const hits = listenerCache[id] || (listenerCache[id] = broadcastListeners(b, STARS));
  const lit = hits.filter(h => h.arrive <= jdOf()), pend = hits.filter(h => h.arrive > jdOf());
  const oddName = n => /^(WISE|2MASS|G \d|LP |LHS|LSPM|[a-z]{3} [A-Z]{3} [AB])/.test(n);
  const named = hits.filter(h => STARS.names[h.i]).sort((a, b) => oddName(STARS.names[a.i]) - oddName(STARS.names[b.i])).slice(0, 8);
  $("#bDetail").innerHTML = `<h2>${esc(b.title)}</h2>
    <p>${esc(b.note)}</p>
    <div class="kpi"><div><b>${age > 0 ? fmtDist(age) : "—"}</b><span>from Earth now</span></div><div><b>${hits.length}</b><span>catalogued stars in its fan</span></div><div><b>${lit.length}</b><span>already received it</span></div></div>
    <p class="dim">Sent ${b.start.replace("T", " ").slice(0, 16)} UT from ${esc(src.name)} (lat ${src.lat.toFixed(1)}°), lasting ${b.mins} min. Its fan reaches declinations within ±${(90 - Math.abs(src.lat)).toFixed(0)}° of the equator; it sweeps ${(b.mins / 1440 * 360.98).toFixed(0)}° of sky while it airs.</p>
    <div class="chips"><button class="chip" type="button" id="bFly">Fly to its shell</button><button class="chip" type="button" id="bRewind">Replay from the transmitter</button></div>
    ${named.length ? `<h2>Some listeners</h2><div class="list">${named.map(h => `<button class="item" type="button" data-star="${h.i}"><div class="t">${esc(STARS.names[h.i])} <span class="tag">${fmtLy(h.ly)} ly</span></div><div class="m">${h.arrive <= jdOf() ? "received " : "arrives "}${C.fmtUTC(h.arrive, false)} &middot; in its beam for ~${h.secs < 90 ? h.secs.toFixed(0) + " s" : (h.secs / 60).toFixed(0) + " min"} &middot; ${Math.abs(h.el).toFixed(1)}° ${h.el < -0.05 ? "below" : "above"} the mast's horizon</div></button>`).join("")}</div>` : `<div class="note">No named star sits in this fan. ${hits.length} fainter catalogued stars do.</div>`}
    ${pend.length ? `<p class="dim">${pend.length} stars are still to receive it, the nearest in ${C.fmtUTC(pend[0].arrive, false)}.</p>` : ""}`;
  $("#bFly").onclick = () => flyToBroadcast(b);
  $("#bRewind").onclick = () => { stopTour(); S.T = clamp(C.yearFromJd(t0), T_MIN, T_MAX); S.logR = -4.4; S.playing = true; $("#spd").value = 0; S.speed = 1 / 365.25 / 1; dirty = true; syncDock(); };
  $$("#bDetail [data-star]").forEach(x => x.onclick = () => { selectStar(+x.dataset.star, { switchTab: true }); focusStar(+x.dataset.star); });
  { // scroll only the tab body: scrollIntoView would also scroll the overflow:hidden panel and strand its tabs
    const d = $("#bDetail"), tb = d.closest(".tabbody");
    if (tb) { const r = d.getBoundingClientRect(), tr = tb.getBoundingClientRect(); if (r.top < tr.top || r.bottom > tr.bottom) tb.scrollTo({ top: tb.scrollTop + r.top - tr.top - 8, behavior: "smooth" }); }
  }
  if (fly) flyToBroadcast(b);
}
function flyToBroadcast(b) {
  const t0 = C.jdFromUnixMs(Date.parse(b.start)), age = (jdOf() - t0) / C.DAYS_PER_YEAR, src = siteById[b.site];
  if (age <= 0) { animateTo({ T: Math.min(T_MAX, C.yearFromJd(t0) + 5) }); return; }
  const fr = C.siteFrame(src.lat, src.lon, t0 + b.mins / 2880), d = C.fanDirection(fr, 0.8, 0.5);
  animateTo({ logR: Math.log10(Math.max(age * 1.4, 1e-4)), yaw: Math.atan2(d[1], d[0]) + Math.PI + 0.45, pitch: clamp(-Math.asin(d[2]) + 0.25, -1.4, 1.4) });
}

// ----- Anatomy -----
let anatomy = null;
function renderAnatomy() {
  const el = $("#body-anatomy");
  el.innerHTML = `<h2>One mast, one day</h2>
  <p>A tower's useful beam runs along the ground. Out in space that is a flat fan, perpendicular to the mast. Turn the planet and the fan swings.</p>
  <canvas class="chart" id="anaCv" width="760" height="560" style="touch-action:none;cursor:grab" aria-label="Interactive diagram of a transmitter's horizon fan on a rotating Earth"></canvas>
  <div class="field"><label for="anaLat">Latitude</label><input type="range" id="anaLat" min="-80" max="80" step="1" value="${anatomy.lat}"></div>
  <div class="field"><label for="anaHr">Sidereal hour</label><input type="range" id="anaHr" min="0" max="24" step="0.05" value="${anatomy.hour}"></div>
  <div class="field"><label for="anaSoft">Beam height</label><input type="range" id="anaSoft" min="0" max="15" step="0.5" value="${anatomy.soft}"></div>
  <div class="chips"><button class="chip" type="button" id="anaDay" aria-pressed="${anatomy.day}">Show a whole day of fans</button></div>
  <div id="anaTxt" class="note"></div>
  <p class="faint">Amber circle: the fan right now. Dotted: where the mast's zenith points over a day: a cone of half-angle (90° − latitude) around the polar axis. White rings: the declination limits the fan can ever reach.</p>`;
  const cv = $("#anaCv");
  const redraw = () => drawAnatomyNow();
  $("#anaLat").oninput = e => { anatomy.lat = +e.target.value; redraw(); };
  $("#anaHr").oninput = e => { anatomy.hour = +e.target.value; redraw(); };
  $("#anaSoft").oninput = e => { anatomy.soft = +e.target.value; redraw(); };
  $("#anaDay").onclick = e => { anatomy.day = !anatomy.day; e.currentTarget.setAttribute("aria-pressed", anatomy.day); redraw(); };
  let drag = null;
  cv.addEventListener("pointerdown", e => { drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; });
  cv.addEventListener("pointermove", e => { if (!drag) return; anatomy.yaw -= (e.clientX - drag[0]) * 0.008; anatomy.pitch = clamp(anatomy.pitch + (e.clientY - drag[1]) * 0.008, -1.4, 1.4); drag = [e.clientX, e.clientY]; redraw(); });
  cv.addEventListener("pointerup", () => { drag = null; cv.style.cursor = "grab"; });
  redraw();
}
function drawAnatomyNow() {
  const cv = $("#anaCv"); if (!cv || !anatomy) return;
  const info = drawAnatomy(cv, anatomy, { ink: css("--ink"), dim: css("--dim"), line: css("--line"), amber: css("--amber"), cyan: css("--cyan"), bg: css("--bg2") });
  $("#anaTxt").innerHTML = info;
}

// ----- About -----
function renderAbout() {
  $("#body-about").innerHTML = `
  <h2>Demo video</h2>
  <video id="demoVideo" controls preload="none" poster="poster.jpg" playsinline aria-label="Demo: a tour of Earth's radio leakage"><source src="leaked-signals-tour.mp4" type="video/mp4"></video>
  <p class="faint">Rendered frame by frame from this very simulator (the Guided tour button plays the same script live).</p>
  <h2>How it works</h2>
  <p><b>Emission.</b> For every transmitter and every moment, a mast sends power along its horizon: all azimuths, elevations from just below the geometric horizon (a mast sees a bit over the curve, the "dip") up through a lobe a few degrees wide (Gaussian, σ = 4°), plus a 2% share of rays scattered isotropically upward at low intensity (sidelobes). The direction in space of each ray is fixed by Earth's actual orientation at that second (sidereal time) and the mast's latitude and longitude.</p>
  <p><b>Propagation.</b> A ray never changes direction. A piece sent <i>a</i> years ago is exactly <i>a</i> light-years from where Earth was then; Earth's own 1 AU orbit is included so the innermost spirals are offset correctly.</p>
  <p><b>Hearing.</b> A star at declination δ hears a mast at latitude φ only when the star is within the lobe of its horizon, which can only happen if |δ| ≤ 90° − |φ| (+ the lobe's few degrees). That gives the band structure, the twice-daily rising/setting windows, and a 3 min 56 s daily drift.</p>
  <p><b>Link budget.</b> Flux = P/(4πd²), noise = kTB, with SNR thresholds of 10 (carrier in 1 Hz, sound in 20 kHz) or 100 (5.5 MHz vision). System noise 300 K (galactic background at VHF). No atmosphere, interference or intervening medium.</p>
  <details><summary>What is approximate or invented</summary>
    <ul>
      <li>Transmitter powers are order-of-magnitude (tens of kW in the 1930s growing to megawatts); start dates are recalled public-service dates; some countries have several masts but one is modelled.</li>
      <li>Short-wave and AM radio are mostly reflected by the ionosphere and are not drawn. Only VHF/UHF television (one representative mast per city) and two planetary radars are modelled; FM, air-traffic and military radar are not.</li>
      <li>Sky coordinates mix J2000 star positions with of-date Earth orientation; ignoring precession is a sub-degree error, smaller than the beam window. Wavefront radii are measured from Earth's position at the moment of emission, so the picture includes the orbit; the quoted arrival dates ignore the Sun-Earth offset of up to 8 light-minutes. Dates after today extrapolate: stations are assumed to stay on air.</li>
      <li>Each mast's power is a fleet average (peak power times a time-of-day activity factor), and effective radiated power is treated as isotropic equivalent.</li>
      <li>After the digital switch-over a transmitter is modelled at 8% of its analogue power and its signal is noise-like.</li>
      <li>Radar runs are random draws of the real pattern (planets near the ecliptic, a few per cent duty), not a log of actual observations. Arecibo Message and the other deliberate beams use the target's transit as the time of day.</li>
      <li>Star positions are Simbad J2000 with parallax signal-to-noise above 8 (10,157 distinct stars). Proper motion is ignored (under 0.5% of a star's distance over 90 years, even for Barnard's Star).</li>
      <li>Programme times are the best known UT times, some approximate by a quarter-hour.</li>
    </ul></details>
  <details><summary>Further reading</summary>
    <ul><li>Sullivan, Brown &amp; Wetherill (1978), "Eavesdropping: the radio signature of the Earth", <i>Science</i> 199.</li><li>NASA/JPL on Voyager 1 reaching one light-day from Earth (around November 2026).</li></ul></details>
  <p class="faint">Keys: arrows orbit, +/- zoom, space plays time.</p>`;
}

// ---------- tour (also driven by the video renderer) ----------
let tourSeeking = false, tourPlaying = false, tourT = 0, tourStart = 0;
function tourState(t) {
  t = clamp(t, 0, TOUR_LEN);
  let a = TOUR_KEYS[0], b = TOUR_KEYS[TOUR_KEYS.length - 1];
  for (let k = 0; k < TOUR_KEYS.length; k++) if (TOUR_KEYS[k].t <= t) a = TOUR_KEYS[k];
  for (let k = TOUR_KEYS.length - 1; k >= 0; k--) if (TOUR_KEYS[k].t >= t) b = TOUR_KEYS[k];
  const span = Math.max(1e-6, b.t - a.t), u = a === b ? 0 : b.cut ? 0 : (t - a.t) / span, e = u * u * (3 - 2 * u);
  const L = (x, y) => x + (y - x) * e;
  const nowY = NOW_YEAR;
  const orient = k => {                       // a keyframe that names a star looks at it from the far side of Earth
    if (!k.star) return k;
    const i = starByName(k.star); if (i == null) return k;
    const v = C.radec2vec(STARS.ra[i], STARS.dec[i]);
    return { ...k, yaw: Math.atan2(v[1], v[0]) + Math.PI + 0.3, pitch: clamp(-Math.asin(v[2]) + 0.15, -1.4, 1.4) };
  };
  const oa = orient(a), ob = orient(b);
  let dy = ob.yaw - oa.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const st = {
    logR: L(a.logR, b.logR), yaw: oa.yaw + dy * e + (a.spin || 0) * (t - a.t), pitch: L(oa.pitch, ob.pitch),
    T: L(a.T ?? nowY, b.T ?? nowY), solo: a.solo, hl: a.hl, star: a.star, cap: a.cap,
  };
  return st;
}
function applyTour(t) {
  const st = tourState(t);
  S.logR = st.logR; S.yaw = st.yaw; S.pitch = st.pitch; S.T = st.T;
  const sk = st.solo ? st.solo.join(",") : "*";
  if (sk !== soloKey()) { S.solo = st.solo ? new Set(st.solo) : null; $$("#ccChips .chip").forEach(c => c.setAttribute("aria-pressed", c.dataset.cc === "*" ? !S.solo : !!(S.solo && S.solo.has(c.dataset.cc)))); }
  if (st.hl !== S.hl) { S.hl = st.hl || null; hlId = null; }
  const si = st.star ? starByName(st.star) : null;
  if (si !== S.star) { S.star = si; lastHeardT = -1; }
  const cap = $("#caption");
  if (st.cap) { cap.textContent = st.cap; cap.classList.add("on"); } else cap.classList.remove("on");
  dirty = true; syncDock();
}
function startTour() {
  S.playing = false; tourPlaying = true; tourStart = performance.now(); $("#btnTour").textContent = "❚❚ Stop tour"; applyTour(0);
}
function stopTour() {
  if (!tourPlaying) return;
  tourPlaying = false; $("#btnTour").innerHTML = "&#9654; Guided tour"; $("#caption").classList.remove("on");
}
$("#btnTour").onclick = () => (tourPlaying ? stopTour() : startTour());

// deterministic API for the video renderer & tests
window.__leak = {
  seek(t) { tourSeeking = true; applyTour(t); if (R && needsRebuild()) rebuild(); frame(); tourSeeking = false; },
  tourLength: TOUR_LEN,
  state: S, info: () => ({ n: field ? field.n : 0, windowLy: field ? field.windowLy : 0, heard: heardCount, glOk: !!R, buildMs: lastBuildMs }),
  set(o) { Object.assign(S, o); if (!Number.isFinite(S.T)) S.T = NOW_YEAR; S.T = clamp(S.T, T_MIN - 1, T_MAX); S.logR = clamp(Number.isFinite(S.logR) ? S.logR : 2, -4.7, 3); lastHeardT = -1; dirty = true; syncDock(); frame(); },
  selectBroadcast, selectStar, setTab, rebuild: () => { rebuild(); frame(); }, draw: frame,
  stars: STARS, core: C,
};

// ---------- main loop ----------
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (tourPlaying) {
    const t = (now - tourStart) / 1000;
    if (t >= TOUR_LEN) stopTour(); else applyTour(t);
  } else if (S.playing) {
    S.T = S.T + dt * S.speed; if (S.T > T_MAX) S.T = T_MIN; dirty = true; syncDock();
  }
  stepAnim(now);
  if (dirty && !tourSeeking) frame();
  if (S.tab === "explore" && (dirty || now - lastKpi > 500)) { updateKpi(); lastKpi = now; }
  if (S.tab === "listen" && S.star != null && now - lastListen > 700 && (S.playing || tourPlaying) ) { renderListen(); lastListen = now; }
  requestAnimationFrame(tick);
}
let lastKpi = 0, lastListen = 0;
buildDock(); buildPanel(); syncDock();
// the panel and app shell are overflow:hidden on desktop; never let anything scroll them (only .tabbody scrolls)
for (const el of [$("#panel"), $(".app")]) el.addEventListener("scroll", () => { if (el.scrollTop) el.scrollTop = 0; });
$("#foot").innerHTML = `Leaked Signals &middot; a simulation, not a measurement. The physics is real; the transmitter table is a model.`;
$("#themeBtn").onclick = () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === "light" ? "dark" : "light"; drawAnatomyNow(); renderListen(); };
// listening to a star changes with the date, so refresh the listen panel when the date is dragged
$("#tSlider").addEventListener("change", () => renderListen());
resize(); rebuild(); updateHeard(true); frame();
if (qs.has("star")) { const k = starByName(qs.get("star")); if (k != null) selectStar(k); }
if (qs.get("tab")) setTab(qs.get("tab"));
if (qs.has("tour")) startTour();
requestAnimationFrame(tick);
