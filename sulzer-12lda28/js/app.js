import { SPEC, CONF, VARIANTS, LOCO, TIMING, engineBhp, torqueNm, bmepBar, teAtFullPower } from "./data.js";
import { Engine } from "./sim.js";
import { EngineAudio } from "./audio.js";
import { drawCylinder, drawWheel, drawTimeline, drawPowerChart, drawTeChart, drawChain, resistanceLbf, fit, COL } from "./views2d.js";

const $ = (id) => document.getElementById(id);
const eng = new Engine();
const audio = new EngineAudio();
const state = { ctl: 0, sel: { bank: 0, cyl: 1 }, loco: { mph: 0, te: 0, frac: 0, trainT: 400 }, view: null, visible: {} };
window.__sulzer = { eng, state, audio };

// ---------- static content ----------
function badge(c) { const k = CONF[c]; return `<span class="badge ${k.css}" title="${k.label}">${k.label}</span>`; }
$("heroStats").innerHTML = [
  ["2,580 bhp", "derated Class 47 rating"], ["750 rpm", "full speed, 325 idle"], ["280 × 360", "bore × stroke, mm"],
  ["266 L", "swept volume"], ["75 Hz", "firing frequency at full power"], ["12", "cylinders, two banks"],
].map(([a, b]) => `<div class="stat"><b>${a}</b><span>${b}</span></div>`).join("");
$("specTable").innerHTML = SPEC.map(([k, v, c]) => `<div><dl style="margin:0"><dt>${k}${badge(c)}</dt><dd>${v}</dd></dl></div>`).join("");

// ---------- controller ----------
const CTL_NAMES = [[0, "OFF"], [10, "ON"], [25, "1/4"], [50, "1/2"], [75, "3/4"], [100, "FULL"]];
function ctlName(v) {
  for (const [p, n] of CTL_NAMES) if (Math.abs(v - p) <= 2) return n;
  return Math.round(v) + "%";
}
function throttleFromCtl(v) { return v < 10 ? 0 : (v - 10) / 90; }
$("ctl").addEventListener("input", (e) => {
  let v = +e.target.value;
  for (const p of [10, 25]) if (Math.abs(v - p) <= 2) v = p; // only ON and 1/4 are notched in the real controller
  e.target.value = v; setCtl(v);
});
function setCtl(v) { state.ctl = v; $("ctlName").textContent = ctlName(v); eng.setThrottle(throttleFromCtl(v)); }
window.__sulzer.setCtl = setCtl;

$("btnStart").addEventListener("click", () => {
  if (eng.running || eng.cranking) { eng.stop(); setCtl(0); $("ctl").value = 0; } else { eng.start(); }
});
function syncStartBtn() {
  const b = $("btnStart"), on = eng.running || eng.cranking;
  b.textContent = eng.cranking ? "Cranking…" : on ? "Stop engine" : "Start engine"; b.setAttribute("aria-pressed", on ? "true" : "false");
  $("bar").disabled = on || eng.rpm > 3;
}
$("selVariant").addEventListener("change", (e) => { eng.setVariant(e.target.value); });
$("selSlow").addEventListener("change", (e) => { eng.timeScale = +e.target.value; });
$("btnSound").addEventListener("click", async () => {
  const b = $("btnSound");
  if (!audio.on) { const ok = await audio.enable(); if (!ok) { b.textContent = "Sound unavailable"; return; } b.textContent = "Sound on"; b.setAttribute("aria-pressed", "true"); audio.setMic(+$("selMic").value); }
  else { audio.disable(); b.textContent = "Sound off"; b.setAttribute("aria-pressed", "false"); }
});
$("vol").addEventListener("input", (e) => audio.setVolume((+e.target.value / 100) * 1.2));
$("selMic").addEventListener("change", (e) => audio.setMic(+e.target.value));
$("bar").addEventListener("input", (e) => { eng.theta = +e.target.value; });

// ---------- 3D ----------
let view = null;
async function init3d() {
  const canvas = $("gl");
  try {
    const { EngineView, PART_INFO } = await import("./engine3d.js");
    view = new EngineView(canvas, {
      onSelect: (id) => showPart(id, PART_INFO),
      onHover: (id, e) => {
        const tip = $("tip");
        if (!id) { tip.hidden = true; return; }
        const r = canvas.getBoundingClientRect(); tip.hidden = false; tip.textContent = PART_INFO[id].name;
        tip.style.left = Math.min(r.width - 200, e.clientX - r.left + 14) + "px"; tip.style.top = (e.clientY - r.top + 14) + "px";
      },
    });
    state.view = view; window.__sulzer.view = view; view.setXray(true);
    $("partlist").innerHTML = Object.entries(PART_INFO).map(([id, p]) => `<button data-p="${id}">${p.name}</button>`).join("");
    $("partlist").addEventListener("click", (e) => { const id = e.target.dataset && e.target.dataset.p; if (id) { showPart(id, PART_INFO); view.focusPart(id); } });
    document.querySelectorAll(".viewbar button").forEach((b) => b.addEventListener("click", () => view.setView(b.dataset.view)));
    $("explode").addEventListener("input", (e) => view.setExplode(e.target.value / 100));
    $("chkSection").addEventListener("change", (e) => view.setSection(e.target.checked));
    $("chkXray").addEventListener("change", (e) => view.setXray(e.target.checked));
    $("chkSpin").addEventListener("change", (e) => { view.controls.autoRotate = e.target.checked; view.controls.autoRotateSpeed = 1.2; });
    new ResizeObserver(() => view.resize()).observe(canvas);
    $("glNote").textContent = "Twin-bank layout from period sources · parts simplified";
  } catch (err) {
    console.error(err);
    $("glNote").textContent = "3D view needs WebGL, which is unavailable here. The 2D views below still work.";
  }
}
function showPart(id, INFO) {
  const p = INFO[id]; if (!p) return;
  $("info").innerHTML = `<h3>${p.name} ${badge(p.conf)}</h3><p>${p.text}</p>`;
  document.querySelectorAll("#partlist button").forEach((b) => b.classList.toggle("on", b.dataset.p === id));
}

// ---------- readouts ----------
const RO = [["rpm", "r_rpm"], ["Power bhp", "r_bhp"], ["Power kW", "r_kw"], ["Torque kNm", "r_tq"], ["BMEP bar", "r_bmep"], ["Boost psi", "r_boost"], ["Firing Hz", "r_fire"], ["Piston m/s", "r_pist"], ["Generator rpm", "r_gen"], ["Cycle angle", "r_ang"]];
$("readouts").innerHTML = RO.map(([l, id]) => `<div class="ro"><span>${l}</span><b id="${id}">0</b></div>`).join("");
function updateReadouts() {
  const rpm = eng.rpm, bhp = eng.running ? eng.bhp : 0;
  $("r_rpm").textContent = Math.round(rpm); $("gRpm").textContent = Math.round(rpm); $("gBhp").textContent = Math.round(bhp);
  $("r_bhp").textContent = Math.round(bhp); $("r_kw").textContent = Math.round(bhp * 0.7457);
  $("r_tq").textContent = (bhp ? torqueNm(rpm, bhp) / 1000 : 0).toFixed(1);
  $("r_bmep").textContent = (bhp ? bmepBar(rpm, bhp) : 0).toFixed(1);
  const gauge = eng.running ? (eng.boost - 1) * 14.5 * 1.0 : 0; $("r_boost").textContent = Math.max(0, gauge).toFixed(1);
  $("r_fire").textContent = (rpm * 6 / 60).toFixed(1); $("r_pist").textContent = (2 * 0.36 * rpm / 60).toFixed(1);
  $("r_gen").textContent = Math.round(rpm * 1.44); $("r_ang").textContent = Math.round(((eng.theta % 720) + 720) % 720) + "°";
}

// ---------- locomotive ----------
function stepLoco(dt) {
  const L = state.loco, v = VARIANTS[eng.variant];
  const ctlFrac = state.ctl < 5 ? 0 : state.ctl < 15 ? 0.05 : eng.load;
  const frac = eng.running ? ctlFrac : 0; L.frac = frac;
  const railHp = v.bhp * LOCO.railFraction * frac;
  const cap = LOCO.maxTeLbf * Math.min(1, 0.08 + frac);
  const te = L.mph > LOCO.maxSpeedMph ? 0 : Math.min(cap, teAtFullPower(L.mph, Math.max(1, railHp)));
  L.te = frac > 0 ? te : 0;
  const net = (L.te - resistanceLbf(L.mph, L.trainT)) * 4.448; // N
  const m = (LOCO.weightT + L.trainT) * 1000;
  const dv = (net / m) * dt; // m/s
  L.mph = Math.max(0, L.mph + dv * 2.23694);
  if (L.mph < 0.05 && net < 0) L.mph = 0;
  L.railHp = railHp;
  $("locoRead").innerHTML = [["Speed mph", L.mph.toFixed(0)], ["Tractive effort lbf", Math.round(L.te).toLocaleString()], ["Rail power hp", Math.round(L.mph > 0.5 ? L.te * L.mph / 375 : 0).toLocaleString()], ["Engine bhp", Math.round(eng.running ? eng.bhp : 0).toLocaleString()]]
    .map(([a, b]) => `<div class="ro"><span>${a}</span><b>${b}</b></div>`).join("");
}
$("train").addEventListener("input", (e) => { state.loco.trainT = +e.target.value; $("trainV").textContent = e.target.value + " t"; });
$("locoReset").addEventListener("click", () => { state.loco.mph = 0; });

// ---------- spectrum ----------
function drawSpectrum(canvas) {
  const { ctx, w, h } = fit(canvas); ctx.clearRect(0, 0, w, h);
  const x0 = 40, y0 = 10, pw = w - x0 - 10, ph = h - 50, fmin = 10, fmax = 8000;
  const X = (f) => x0 + (Math.log(f / fmin) / Math.log(fmax / fmin)) * pw;
  ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.fillStyle = COL.dim; ctx.font = "10px system-ui"; ctx.textAlign = "center";
  [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].forEach((f) => { ctx.beginPath(); ctx.moveTo(X(f), y0); ctx.lineTo(X(f), y0 + ph); ctx.stroke(); ctx.fillText(f >= 1000 ? f / 1000 + "k" : f, X(f), y0 + ph + 14); });
  ctx.fillText("frequency, Hz", x0 + pw / 2, h - 6);
  const rpm = eng.rpm; const fc = rpm / 60;
  if (audio.analyser && audio.on) {
    const an = audio.analyser, data = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(data);
    const sr = audio.ctx.sampleRate; ctx.beginPath(); ctx.moveTo(x0, y0 + ph);
    for (let i = 1; i < data.length; i++) { const f = (i * sr) / (2 * data.length); if (f < fmin || f > fmax) continue; ctx.lineTo(X(f), y0 + ph - (data[i] / 255) * ph); }
    ctx.lineTo(x0 + pw, y0 + ph); ctx.closePath(); ctx.fillStyle = "rgba(232,184,74,0.35)"; ctx.fill(); ctx.strokeStyle = COL.accent; ctx.stroke();
  }
  if (fc > 1) {
    const marks = [[fc * 3, "bank firing", "#7ec8ff"], [fc * 6, "firing", COL.accent2], [fc * 12, "2nd", COL.accent2], [fc * 36, "gear mesh", "#46c28a"]];
    marks.forEach(([f, n, c], i) => { if (f > fmax) return; ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(f), y0 + 6); ctx.lineTo(X(f), y0 + ph); ctx.stroke(); ctx.fillStyle = c; ctx.font = "11px system-ui"; ctx.textAlign = "center"; ctx.fillText(n + " " + f.toFixed(0), X(f), y0 + 4 + (i % 2) * 12); });
    const tf = 700 + Math.max(0, eng.boost - 1) / 1.1 * 3600; if (eng.running) { ctx.strokeStyle = "#b08bff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(tf), y0 + 20); ctx.lineTo(X(tf), y0 + ph); ctx.stroke(); ctx.fillStyle = "#b08bff"; ctx.fillText("turbo", X(tf), y0 + 16); }
  }
  $("specNote").textContent = fc > 1 ? `At ${Math.round(rpm)} rpm the firing frequency is ${(fc * 6).toFixed(1)} Hz.${audio.on ? "" : " Switch Sound on to see the live spectrum."}` : "Start the engine to see where its sound energy sits.";
}

// ---------- 2D canvases (draw only when visible) ----------
const cvs = { cvCyl: drawCylinder, cvWheel: drawWheel, cvTime: drawTimeline, cvPower: drawPowerChart, cvTe: drawTeChart, cvChain: drawChain, cvSpec: drawSpectrum };
const io = new IntersectionObserver((es) => es.forEach((e) => { state.visible[e.target.id] = e.isIntersecting; }), { rootMargin: "100px" });
Object.keys(cvs).forEach((id) => io.observe($(id)));
$("cylBank").addEventListener("change", (e) => (state.sel.bank = +e.target.value));
$("cylNum").addEventListener("change", (e) => (state.sel.cyl = +e.target.value));

// ---------- loop ----------
let last = performance.now(), audioT = 0, glVisible = true;
new IntersectionObserver((es) => (glVisible = es[0].isIntersecting)).observe($("gl"));
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  eng.step(dt);
  stepLoco(dt);
  if (view && glVisible) { view.update(eng, dt); view.render(); }
  updateReadouts(); syncStartBtn();
  if (state.visible.cvCyl) drawCylinder($("cvCyl"), eng, state.sel);
  if (state.visible.cvWheel) drawWheel($("cvWheel"), eng, state.sel);
  if (state.visible.cvTime) drawTimeline($("cvTime"), eng);
  if (state.visible.cvPower) drawPowerChart($("cvPower"), eng, eng.variant);
  if (state.visible.cvTe) drawTeChart($("cvTe"), state.loco);
  if (state.visible.cvChain) drawChain($("cvChain"));
  if (state.visible.cvSpec) drawSpectrum($("cvSpec"));
  if (!eng.running && !eng.cranking && eng.rpm < 3 && !$("bar").disabled) { /* barring: slider drives theta */ } else $("bar").value = Math.round(((eng.theta % 720) + 720) % 720);
  audioT += dt; if (audioT > 0.03) { audioT = 0; if (audio.on) { audio.update(eng); audio.gain.gain.value = eng.timeScale < 0.99 ? 0 : audio.vol; } }
  requestAnimationFrame(frame);
}
init3d().then(() => requestAnimationFrame(frame));
