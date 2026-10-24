// Deterministic frame renderer for the explainer film. window.renderFrame(t) draws the
// frame at time t (seconds); the engine and locomotive are re-simulated from t=0 so any
// worker can render any contiguous range.
import { Engine } from "../js/sim.js";
import { EngineView } from "../js/engine3d.js";
import { VARIANTS, LOCO, TIMING, teAtFullPower, engineBhp } from "../js/data.js";
import { drawCylinder, drawWheel, drawTimeline, drawPowerChart, drawTeChart, drawChain, resistanceLbf } from "../js/views2d.js";

const FPS = 20, SIMDT = 1 / 100;
const $ = (id) => document.getElementById(id);
const [script, tl] = await Promise.all([fetch("script.json").then((r) => r.json()), fetch("timeline.json").then((r) => r.json())]);
const scenes = script.scenes.map((s, i) => ({ ...s, ...tl.scenes[i] }));

const eng = new Engine(); eng.setVariant("Cd");
const loco = { mph: 0, te: 0, frac: 0, trainT: 400 };
let simT = 0, ctl = 0, started = false;

const view = new EngineView($("gl"), { preserve: true, maxDpr: 1 });
view.controls.enabled = false; view.controls.enableDamping = false;
view.setXray(true);
view.resize();

const lerp = (a, b, f) => a + (b - a) * f;
const smooth = (f) => f * f * (3 - 2 * f);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sceneAt = (t) => scenes.find((s) => t < s.end) || scenes[scenes.length - 1];
function kf(pts, f, interp = true) { // [[frac,val],...]
  if (f <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (f <= pts[i][0]) { const [f0, v0] = pts[i - 1], [f1, v1] = pts[i]; return interp ? lerp(v0, v1, (f - f0) / (f1 - f0)) : v0; }
  return pts[pts.length - 1][1];
}
const throttleFromCtl = (v) => (v < 10 ? 0 : (v - 10) / 90);

function stepLoco(dt) {
  const v = VARIANTS[eng.variant];
  const ctlFrac = ctl < 5 ? 0 : ctl < 15 ? 0.05 : eng.load;
  const frac = eng.running ? ctlFrac : 0; loco.frac = frac;
  const railHp = v.bhp * LOCO.railFraction * frac;
  const cap = LOCO.maxTeLbf * Math.min(1, 0.08 + frac);
  const te = loco.mph > LOCO.maxSpeedMph ? 0 : Math.min(cap, teAtFullPower(loco.mph, Math.max(1, railHp)));
  loco.te = frac > 0 ? te : 0;
  const net = (loco.te - resistanceLbf(loco.mph, loco.trainT)) * 4.448;
  const m = (LOCO.weightT + loco.trainT) * 1000;
  loco.mph = Math.max(0, loco.mph + (net / m) * dt * 2.23694);
  if (loco.mph < 0.05 && net < 0) loco.mph = 0;
  loco.railHp = railHp;
}

function simTo(t) {
  while (simT < t) {
    const s = sceneAt(simT), f = clamp01((simT - s.start) / (s.end - s.start));
    ctl = kf(s.ctl, f);
    if (s.variants) eng.setVariant(kf(s.variants, f, false)); else eng.setVariant("Cd");
    eng.timeScale = s.ts ?? (s.mode === "3d" ? 0.1 : 1);
    if (!started && simT >= script.startEngineAt) { eng.start(); started = true; }
    eng.setThrottle(throttleFromCtl(ctl));
    eng.step(SIMDT); stepLoco(SIMDT); simT += SIMDT;
  }
}

// Focus targets are resolved once, at the scene's final explode level.
const focusCam = {};
for (const s of scenes) if (s.focus) {
  view.setExplode(s.explode || 0); view.scene.updateMatrixWorld(true); view.focusPart(s.focus);
  const to = view._tween.to, k = s.zoomOut || 1.9; focusCam[s.id] = [to[1].x + (to[0].x - to[1].x) * k, to[1].y + (to[0].y - to[1].y) * k, to[1].z + (to[0].z - to[1].z) * k, to[1].x, to[1].y, to[1].z]; view._tween = null;
}
view._hl = null;

const wrapSubs = (text) => text.match(/[^.?!]+[.?!]+/g).map((x) => x.trim());
function subtitleAt(s, t) {
  const sents = wrapSubs(s.text), tot = sents.reduce((a, x) => a + x.length, 0);
  const f = (t - s.nar) / s.dur; if (f < 0 || f > 1.0) return "";
  let acc = 0; for (const x of sents) { acc += x.length / tot; if (f <= acc) return x; }
  return sents[sents.length - 1];
}
const CTLN = [[0, "OFF"], [10, "ON"], [25, "1/4"], [50, "1/2"], [75, "3/4"], [100, "FULL"]];
let lastExplode = -1, lastMode = "", lastScene = "";
const place = (el, x, y, w, h) => { el.style.left = x + "px"; el.style.top = y + "px"; el.style.width = w + "px"; el.style.height = h + "px"; };

window.renderFrame = (t) => {
  simTo(t);
  const s = sceneAt(t), f = clamp01((t - s.start) / (s.end - s.start));
  const c1 = $("c1"), gl = $("gl");
  const is3d = s.mode === "3d";
  gl.style.display = is3d ? "block" : "none";
  for (const id of ["c1", "side", "src"]) $(id).style.display = "none";
  if (s.id !== lastScene) {
    lastScene = s.id;
    $("title").textContent = s.title; $("tsub").textContent = s.sub || "";
    $("facts").innerHTML = (s.facts || []).map((x) => `<div>${x}</div>`).join("");
    view._hl = s.focus ? { id: s.focus, until: Infinity } : null;
  }
  $("slow").textContent = (eng.timeScale < 0.99 && is3d) ? `shown at ${eng.timeScale < 0.1 ? Math.round(eng.timeScale * 100) + "%" : eng.timeScale * 100 + "%"} speed; sound is real time` : "";
  const hudHtml = `<b>${Math.round(eng.rpm)}</b> rpm<small>${Math.round(eng.bhp)} bhp</small>`;
  $("hud").innerHTML = hudHtml;
  $("ctlbar").innerHTML = s.controller ? CTLN.map(([p, n]) => `<span class="${ctl >= p - 2 && ctl < (CTLN.find(([q]) => q > p) || [999])[0] - 2 ? "on" : ""}">${n}</span>`).join("") : "";
  $("hint").textContent = "";

  if (is3d) {
    const ex = s.explode == null ? 0 : Array.isArray(s.explode) ? lerp(s.explode[0], s.explode[1], smooth(f)) : s.explode;
    if (ex !== lastExplode) { view.setExplode(ex); lastExplode = ex; }
    if (s.cam) {
      const a = s.cam[0], b = s.cam[1] === "focus" ? focusCam[s.id] : s.cam[1], k = smooth(clamp01(f / (s.camHold || 1)));
      view.camera.position.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
      view.camera.lookAt(lerp(a[3], b[3], k), lerp(a[4], b[4], k), lerp(a[5], b[5], k));
    }
    view.update(eng, 1 / FPS); view.render();
  } else if (s.mode === "sources") {
    const src = $("src"); src.style.display = "grid";
    if (!src.dataset.done) {
      src.dataset.done = 1;
      src.innerHTML = [
        ["h", "WELL SOURCED", "Bore, stroke, ratings, locomotive tractive effort, idle speed, from BR driver's manuals and period sources."],
        ["m", "SINGLE SOURCE", "Details we found in one place only: stated plainly, flagged as such."],
        ["l", "WEAK SOURCE", "Secondary or conflicting references. Shown, but not leaned on."],
        ["e", "ESTIMATE", "Valve and injection timing, firing order, compression ratio, peak pressure, the power-versus-speed curve shape and the efficiency chain."],
      ].map(([c, h, p]) => `<div class="card"><span class="badge ${c}">${h}</span><div>${p}</div></div>`).join("");
    }
    const n = Math.min(4, 1 + Math.floor(f * 5)); [...src.children].forEach((c, i) => (c.style.opacity = i < n ? 1 : 0.15));
  } else {
    c1.style.display = "block";
    const sel = { bank: 0, cyl: 1 };
    const side = $("side");
    if (s.mode === "cyl") { place(c1, 40, 120, 1200, 420); drawCylinder(c1, eng, sel); }
    else if (s.mode === "wheel") {
      place(c1, 40, 120, 640, 420); drawWheel(c1, eng, sel); side.style.display = "block";
      side.innerHTML = [["Exhaust opens", TIMING.exhOpen + "°"], ["Exhaust closes", TIMING.exhClose + "°"], ["Inlet opens", TIMING.inOpen + "°"], ["Inlet closes", TIMING.inClose + "°"], ["Injection starts", TIMING.injStart + "°"], ["Status", "ESTIMATE"]].map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join("");
    }
    else if (s.mode === "time") { place(c1, 40, 120, 1200, 420); drawTimeline(c1, eng); }
    else if (s.mode === "power") {
      place(c1, 40, 120, 800, 420); drawPowerChart(c1, eng, eng.variant); side.style.display = "block";
      side.style.right = "40px"; side.style.width = "360px";
      side.innerHTML = ["A", "B", "C", "Cd"].map((k) => `<div class="row ${s.variants && eng.variant === k ? "cur" : ""}"><span>${VARIANTS[k].name.replace("12LDA28-", "")}</span><b>${VARIANTS[k].bhp} bhp @ ${VARIANTS[k].rpm}</b></div>`).join("") + `<div class="row"><span>Now</span><b>${Math.round(eng.bhp)} bhp</b></div>`;
    }
    else if (s.mode === "te") {
      place(c1, 40, 120, 800, 420); drawTeChart(c1, loco); side.style.display = "block"; side.style.width = "360px"; side.style.right = "40px";
      side.innerHTML = [["Speed", loco.mph.toFixed(0) + " mph"], ["Tractive effort", Math.round(loco.te).toLocaleString() + " lbf"], ["Rail power", Math.round(loco.mph > 0.5 ? loco.te * loco.mph / 375 : 0).toLocaleString() + " hp"], ["Engine", Math.round(eng.bhp).toLocaleString() + " bhp"]].map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join("");
    }
    else if (s.mode === "chain") { place(c1, 40, 120, 1200, 420); drawChain(c1); }
  }
  $("sub").textContent = subtitleAt(s, t); $("sub").style.visibility = $("sub").textContent ? "visible" : "hidden";
  $("prog").style.width = (t / tl.total) * 100 + "%";
  $("fade").style.opacity = Math.max(clamp01(1 - t / 0.8), clamp01((t - (tl.total - 1.0)) / 1.0));
};
window.__ready = true;
