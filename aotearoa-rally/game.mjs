// Aotearoa Rally: game shell. Screens, loop, rules, career, input, and the window.__AR__ test API.
// Lane modules (stage, physics, renderer, machines, audio) are imported dynamically so the shell
// always boots, even while a module is missing or broken.

import * as THREE from "three";
import { browserStorage } from "./core/storage.mjs";
import { createInput } from "./core/input.mjs";
import { createRun, RULES } from "./core/rules.mjs";
import {
  createCareer, DIFFICULTY, STAGE_ORDER, recommendedTyre, vehicleOptionsFor, partDamage, fallbackRivals, DEFAULT_SETUP,
} from "./core/career.mjs";
import { clamp, yawOfDir } from "./core/mathx.mjs";
import { createFrameClock } from "./core/frameclock.mjs";
import { createScreens } from "./ui/screens.mjs";
import { createHud } from "./ui/hud.mjs";
import { createNav } from "./ui/nav.mjs";
import { createShowroom } from "./ui/showroom.mjs";
import { toast } from "./ui/dom.mjs";
import { createRecorder, createPlayer, ghostFramesFromRecording, ghostPose, REC_HZ } from "./ui/replay.mjs";
import { GHOST_HZ } from "./core/career.mjs";
import { parseLaunch, weatherOverride } from "./core/launch.mjs";

const VERSION = "1.0.0";
const DT = 1 / 120;
const MAX_STEPS = 8;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- __AR__ skeleton (available immediately)
const AR = (window.__AR__ = {
  version: VERSION,
  errors: [],
  missing: [],
  modules: {},
  ready: null,
});
{
  const push = (m) => { if (AR.errors.length < 200) AR.errors.push(String(m).slice(0, 600)); };
  window.addEventListener("error", (e) => push(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => push(`unhandledrejection: ${e.reason && e.reason.stack ? e.reason.stack : e.reason}`));
  const ce = console.error.bind(console);
  console.error = (...a) => { push("console.error: " + a.map((x) => (x && x.stack) || (typeof x === "object" ? JSON.stringify(x) : String(x))).join(" ")); ce(...a); };
}
let resolveReady, rejectReady;
AR.ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
AR.ready.catch(() => {});

async function tryImport(name, path) {
  try {
    const m = await import(path);
    AR.modules[name] = "ok";
    return m;
  } catch (e) {
    AR.modules[name] = "missing: " + (e && e.message ? e.message : e);
    AR.missing.push(name);
    return null;
  }
}

// ---------------------------------------------------------------- state
const G = {
  screen: "boot", mode: "single", paused: false, world: null, mods: {},
  stage: null, stageDef: null, stageId: null, vehicle: null, spare: null, carId: "huia", livery: 0,
  carVis: null, ghostVis: null, fx: null, rig: null, audio: null, run: null, bot: null, botOn: false,
  recorder: createRecorder(), lastRec: null, lastResult: null, acc: 0, time: 0, endTimer: 0, finishing: false,
  playing: false, weather: null, quality: "auto", cameraMode: "chase", camIdx: 0, ghost: null, ghostPos: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 },
  replay: null, shake: 0, fps: 60, fpsAcc: 0, fpsN: 0, loadedKey: "", sessionDifficulty: "pro", benchmarks: null,
};
if (window.__AR_TEST__) { AR._G = G; AR._rawKeys = (on) => input.setRawKeySteer(on); } // internals are exposed to the test harness only (it sets __AR_TEST__ before load)
const stepInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false };
const frameInfo = { time: 0, carPos: { x: 0, y: 0, z: 0 }, carVel: { x: 0, y: 0, z: 0 }, camPos: { x: 0, y: 0, z: 0 }, speedKmh: 0, stageS: 0 };
const PLAY_CAMS = ["chase", "far", "bumper", "bonnet"];

const storage = browserStorage();
const career = createCareer({ storage, rivals: (id, c) => rivalsFor(id, c), parTime: (id, car) => parFor(id, car) });
career.load();
let opts = career.options;

// ---------------------------------------------------------------- loading overlay
function setProgress(p, label) {
  const f = $("load-fill"), l = $("load-label");
  // a full bar is set without the .25 s tween, so the label never says "Ready" over a bar that is still on its way (R-LOOK D7)
  if (f) { f.style.transition = p >= 1 ? "none" : ""; f.style.transform = `scaleX(${clamp(p, 0, 1).toFixed(3)})`; } // compositor-driven: keeps animating while the main thread is busy
  if (l && label) l.textContent = label;
}
const TIPS = [
  "Brake before the corner, not in it: the car turns best when it is not slowing hard.",
  "Handbrake pitches the tail round in a hairpin. Tap it, do not hold it.",
  "Gravel, tarmac or snow: check the tyres at the briefing and in the service area.",
  "Listen to the co-driver. A number is the corner tightness: one is a hairpin, six is nearly flat.",
  "Crests hide the road. Lift before a crest you cannot see over.",
  "R puts you back at the last checkpoint for a time penalty. No progress for 25 s does it for you.",
  "In a championship the damage you take stays with you. Spend your service minutes where the car is hurt most.",
  "Wet roads double your braking distance. Rain and mist change every stage.",
];
// every tip is in the DOM; a CSS animation (opacity only) rotates them, so the rotation survives a blocked main thread
(function buildTips() {
  const tip = $("load-tip");
  if (!tip) return;
  tip.style.setProperty("--n", String(TIPS.length));
  tip.style.setProperty("--start", String(Math.floor(Math.random() * TIPS.length)));
  TIPS.forEach((t, i) => { const s = document.createElement("span"); s.style.setProperty("--i", String(i)); s.textContent = "Tip: " + t; tip.append(s); });
})();
function showLoading(label) {
  const el = $("loading");
  el.classList.remove("done");
  el.hidden = false;
  setProgress(0.02, label || "Loading...");
}
// resolves once the overlay is fully gone (fade finished, display:none), so screenshots never catch it mid-fade
let overlayGone = Promise.resolve();
function hideLoading() {
  const el = $("loading");
  if (el.hidden) return;
  el.classList.add("done");
  overlayGone = new Promise((res) => setTimeout(() => { if (el.classList.contains("done")) el.hidden = true; res(); }, 560));
}
$("loading").style.setProperty("--loadart", `url(${new URL("./assets/ui/loading.webp", document.baseURI).href})`);

function webgl2Ok() {
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; }
}

// ---------------------------------------------------------------- helpers using lane modules
/** Expert-human par (calibrated bot lap x 1.08) for the briefing, HUD benchmark and results. */
function parFor(stageId, carId) {
  const fallback = G.stage && G.stage.id === stageId && G.stage.parTime ? G.stage.parTime : null;
  const R = G.mods.rivals;
  if (R && R.parFor) {
    try { const v = R.parFor(stageId, carId, fallback ? fallback / 1.08 : null); if (Number.isFinite(v) && v > 0) return v; } catch { /* fall through */ }
  }
  const p = G.mods.partimes && G.mods.partimes.PAR_TIMES;
  if (p && p[stageId] && Number.isFinite(p[stageId][carId])) return p[stageId][carId] * 1.08;
  if (fallback) return fallback;
  const d = G.mods.stage && G.mods.stage.getStageDef ? G.mods.stage.getStageDef(stageId) : null;
  return d ? d.lengthTarget / 19 : 240;
}
function rivalsFor(stageId, ctx) {
  const R = G.mods.rivals;
  try {
    if (R && R.rivalStageTimes && R.RIVALS) {
      const times = R.rivalStageTimes({ stageId, parTime: ctx.parTime, difficulty: ctx.difficulty || "pro" });
      return R.RIVALS.map((r, i) => ({ id: r.id, name: r.name, time: times[i], dnf: !Number.isFinite(times[i]), nationality: r.nationality, car: r.car }));
    }
  } catch { /* fall back below */ }
  return fallbackRivals(stageId, ctx);
}
const cars = () => (G.mods.cars ? G.mods.cars.CARS : {});
const carIds = () => (G.mods.cars ? G.mods.cars.CAR_IDS : ["huia"]);

// ---------------------------------------------------------------- UI objects
const screensRoot = $("screens");
const hud = createHud($("hud"));
let nav = null;
const sfx = (name) => { if (G.audio && !opts.mute) try { G.audio.playUI(name); } catch { /* audio optional */ } };

let screens = null;
function buildScreens() {
  const stageDefs = G.mods.stage ? G.mods.stage.STAGE_DEFS : {};
  screens = createScreens(screensRoot, {
    career, input, cars: cars(), carIds: carIds(), stageDefs, stageIds: STAGE_ORDER, sfx, recommendedTyre,
    listVoices: () => { try { ensureAudio(); return G.audio ? G.audio.listVoices() : []; } catch { return []; } },
    createShowroom: (canvas) => (G.mods.car ? createShowroom(canvas, G.mods.car.createCarVisual) : null),
    onMount: (name, el) => { G.screen = name; nav && (nav.active = true); requestAnimationFrame(() => nav && nav.focusFirst()); void el; },
    onWipe: () => { career.wipe(); career.save(); toast("Saved data erased"); },
  });
}

// ---------------------------------------------------------------- input
const input = createInput({
  target: window, storage, onPause: () => togglePause(), onAction: (a) => onAction(a),
  // menus own the keys unless we are driving or replaying; the pause key still closes the pause menu (not a dialog over it)
  isActive: () => (G.playing && !G.paused) || !!G.replay,
  isPaused: () => G.paused && !(screens && screens.modal),
});
input.mountTouch($("touch-host"));
function applyTouchVisibility() {
  const coarse = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  const want = opts.touch === "on" || (opts.touch === "auto" && coarse);
  const showNow = want && G.playing && !G.replay;
  input.showTouch(showNow);
  input.setTilt(want && opts.tilt);
  let pb = document.querySelector(".touch-pause");
  if (want && G.playing) {
    if (!pb) {
      pb = document.createElement("button");
      pb.className = "btn small touch-pause";
      pb.textContent = "II";
      pb.setAttribute("aria-label", "Pause");
      pb.addEventListener("click", () => togglePause());
      document.body.append(pb);
    }
  } else if (pb) pb.remove();
}
function onAction(a) {
  if (a === "hud") { if (G.playing || G.replay) hud.toggleHidden(); return; }
  if (a === "padlost") { if (G.playing && !G.paused && !G.finishing) { pauseGame(); toast("Controller disconnected", "bad", 3000); } return; }
  if (!G.playing && !G.replay) return;
  if (a === "camera") cycleCamera();
  else if (a === "reset") recover();
  else if (a === "restart" && G.mode !== "championship" && G.playing && !G.restarting) restartStage();
}
/** After the car is put somewhere else (respawn, teleport): rewind the note ribbon and the spoken notes. */
function afterJump(s) {
  if (!Number.isFinite(s)) s = G.vehicle ? G.vehicle.state.s : 0;
  hud.notesUpdate(s);
  const cd = G.audio && G.audio.codriver;
  if (cd) { if (cd.seek) cd.seek(s); else if (cd.reset) cd.reset(s); }
}
const curDifficulty = () => (career.championship && G.mode === "championship" ? career.championship.difficulty : G.sessionDifficulty);
function cycleCamera() {
  if (!G.rig) return;
  G.camIdx = (PLAY_CAMS.indexOf(G.rig.mode) + 1) % PLAY_CAMS.length;
  setCamera(PLAY_CAMS[G.camIdx]);
  toast("Camera: " + G.cameraMode, "", 900);
}
function setCamera(mode) {
  if (!G.rig) return;
  G.rig.setMode(mode);
  G.cameraMode = G.rig.mode;
  if (G.carVis && G.carVis.setViewMode && G.rig.carViewMode) G.carVis.setViewMode(G.rig.carViewMode());
  if (G.vehicle && G.stage) G.rig.snap(G.vehicle.state, G.stage);
}
function recover() {
  if (!G.run || G.run.status !== "running") return;
  G.run.respawn("reset");
}

// ---------------------------------------------------------------- world / stage loading
async function ensureWorld() {
  if (G.world) return G.world;
  const canvas = $("gl");
  const q = params.get("quality") || opts.quality || "auto";
  G.quality = q;
  const mod = G.mods.renderer;
  if (!mod) throw new Error("renderer module missing");
  G.world = await mod.createWorld(canvas, { quality: q, onProgress: setProgress });
  resize();
  return G.world;
}

function resize() {
  const w = G.world;
  const vv = window.visualViewport;
  const cw = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
  const ch = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
  if (w) w.resize(cw, ch, Math.min(window.devicePixelRatio || 1, 2));
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);

function disposeRunObjects() {
  G.bot = null;
}

async function loadStage(stageId, { weather = null, fresh = false } = {}) {
  const M = G.mods;
  if (!M.stage) throw new Error("stage module missing");
  const key = stageId + "|" + (weather || "") ;
  const def = M.stage.getStageDef(stageId);
  G.stageDef = def;
  if (!fresh && G.stage && G.stage.id === stageId && G.loadedKey === key) return G.stage;
  await new Promise((r) => setTimeout(r, 0));
  const stage = M.stage.buildStage(stageId);
  const world = await ensureWorld();
  setProgress(0.5, "Building " + def.name);
  await world.setStage(stage, weather ? { weather: weatherOverride(def.environment.weather, weather) } : {});
  G.stage = stage;
  G.stageId = stageId;
  G.loadedKey = key;
  G.weather = weather;
  document.body.classList.toggle("rain", ["rain", "storm", "snow"].includes(weather || def.environment.weather.type));
  attachMachines();
  return stage;
}

function attachMachines() {
  const M = G.mods, world = G.world;
  if (!world) return;
  if (!G.rig && M.camera) {
    G.rig = M.camera.createCameraRig(THREE, world.camera);
  }
  if (!G.fx && M.fx) {
    try { G.fx = M.fx.createFX(THREE, world); } catch (e) { console.error("fx failed: " + e.message); }
  }
  // re-parent car visual if the world cleared its dynamic root on setStage
  if (G.carVis && world.dynamicRoot && G.carVis.object3d.parent !== world.dynamicRoot) world.dynamicRoot.add(G.carVis.object3d);
  if (G.ghostVis && world.dynamicRoot && G.ghostVis.object3d.parent !== world.dynamicRoot) world.dynamicRoot.add(G.ghostVis.object3d);
}

function ensureCar(carId, livery) {
  const M = G.mods;
  const spec = cars()[carId];
  if (!M.car || !spec) return null;
  if (G.carVis && G.carVisKey === carId + ":" + livery) return G.carVis;
  if (G.carVis) { G.carVis.object3d.parent && G.carVis.object3d.parent.remove(G.carVis.object3d); G.carVis.dispose(); }
  G.carVis = M.car.createCarVisual(THREE, spec, { livery, number: 7 });
  G.carVisKey = carId + ":" + livery;
  G.world.dynamicRoot.add(G.carVis.object3d);
  return G.carVis;
}

function ensureVehicle(carId, { fresh }) {
  const M = G.mods;
  const spec = cars()[carId];
  if (!M.physics || !spec) throw new Error("physics/cars module missing");
  const champ = career.championship;
  const vopts = vehicleOptionsFor(spec, champ && G.mode === "championship" ? champ.setup : { ...DEFAULT_SETUP, tyre: recommendedTyre(G.stageDef), ...(G.singleSetup || {}) }, { ...opts, difficulty: curDifficulty() });
  if (!G.vehicle || G.vehicle.spec.id !== carId || fresh) {
    G.vehicle = M.physics.createVehicle(spec, vopts);
    G.vehicleFresh = true;
  } else {
    G.vehicle.configure(vopts);
    G.vehicleFresh = false;
  }
  return G.vehicle;
}

/** Prepare everything for a run. Resolves when the car can be driven. */
async function prepareRun({ stageId, carId, livery = 0, weather = null, countdown = true, bot = false, fresh = false, freshCar = false, mode = G.mode }) {
  G.mode = mode;
  G.playing = false;
  G.paused = false;
  G.finishing = false;
  G.endTimer = 0;
  G.replay = null;
  G.carId = carId;
  G.livery = livery;
  const def = G.mods.stage ? G.mods.stage.getStageDef(stageId) : null;
  showLoading(def ? `Loading ${def.name}` : "Loading");
  try {
    const stage = await loadStage(stageId, { weather, fresh });
    setProgress(0.7, "Preparing the car");
    ensureVehicle(carId, { fresh: freshCar || mode !== "championship" });
    ensureCar(carId, livery);
    if (G.carVis && G.carVis.setDirt) G.carVis.setDirt(0); // a fresh start (or restart) is a clean car
    const spec = cars()[carId];
    const v = G.vehicle;
    if (mode === "championship" && career.championship && career.championship.damage && G.vehicleFresh) applyDamage(v, career.championship.damage);
    v.reset(stage.startPose, 0, stage);
    v.state.events.length = 0;
    G.carVis.update(v.state, DT, G.world.environment);
    G.carVis.setDamage && G.carVis.setDamage(v.state.damage);
    if (G.rig) { G.rig.setCarSpec && G.rig.setCarSpec(spec); setCamera(params.get("camera") || opts.camera); G.rig.snap(v.state, stage); }
    hud.setCar(spec);
    hud.setOptions(opts);
    ensureAudio();
    if (G.audio) { G.audio.setStage(stage.def || def); G.audio.setCarSpec(spec); G.audio.reset && G.audio.reset(0); applyAudioOptions(); }
    const trial = mode === "trial";
    const par = parFor(stageId, carId);
    G.run = createRun({ stage, vehicle: v, difficulty: curDifficulty(), par, countdown: trial ? 1 : 3 });
    G.recorder.reset();
    const champ = career.championship;
    const bestSplits = career.bestSplits(stageId, carId);
    const rivalTimes = trial ? [] : rivalsFor(stageId, { parTime: par, difficulty: curDifficulty(), carId });
    const finiteRivals = rivalTimes.map((r) => r.time).filter(Number.isFinite);
    const benchTotal = finiteRivals.length ? Math.min(...finiteRivals) : par;
    G.benchTotal = benchTotal;
    const benchSplits = stage.checkpoints.map((cp) => (cp.s / stage.lengthM) * benchTotal);
    hud.reset();
    hud.setStage(stage, { best: bestSplits, bench: benchSplits });
    hud.setNoRivals(trial);
    setProgress(0.8, "Placing the ghost");
    setupGhost(stageId, carId, spec);
    G.bot = null;
    G.botOn = !!bot;
    if (bot) makeBot();
    // compile shaders and upload textures now, behind the loading screen, so the first seconds do not hitch
    setProgress(0.9, "Warming up the renderer");
    try { if (G.world.warmup) await G.world.warmup({ onProgress: (f) => setProgress(0.9 + 0.1 * clamp(+f || 0, 0, 1), "Warming up the renderer") }); } catch (e) { console.error("warmup failed: " + (e && e.message)); }
    setProgress(1, "Ready");
    if (mode === "championship" && career.championship) { career.markStageStarted(); career.save(); }
    if (!countdown) G.run.skipCountdown(v.state);
    else { G.run.start(); }
    G.playing = true;
    G.screen = "stage";
    G.acc = 0;
    screens.clear();
    hud.show(true);
    if (params.get("hud") === "0") hud.toggleHidden();
    applyTouchVisibility();
    hud.hint(countdown ? "" : "");
    renderFrame(0);
    hideLoading();
    // the warm-up above blocks the main thread behind the loading overlay: start the frame clock fresh so that
    // block is not counted as a hitch in play
    clock.reset(performance.now());
    AR.worstFrameMs = 0; G.watchUntil = performance.now() + 3000;
    return true;
  } catch (e) {
    hideLoading();
    throw e;
  }
}

function applyDamage(v, d) {
  const t = v.state.damage;
  t.engine = d.engine || 0; t.gearbox = d.gearbox || 0; t.steering = d.steering || 0; t.radiator = d.radiator || 0;
  for (let i = 0; i < 4; i++) { t.suspension[i] = (d.suspension || [])[i] || 0; t.tyres[i] = (d.tyres || [])[i] || 0; }
  for (const k of ["front", "rear", "left", "right"]) t.body[k] = (d.body || {})[k] || 0;
  t.total = d.total || 0;
  v.repair({ all: 0 }); // refresh the handling multipliers from the written damage
}
const cloneDamage = (d) => JSON.parse(JSON.stringify(d));

function makeBot() {
  const B = G.mods.bot;
  if (!B) { toast("Bot module not available", "bad"); return; }
  G.bot = B.createBot(G.stage, G.vehicle, {});
  G.bot.reset && G.bot.reset();
}

// ---------------------------------------------------------------- ghost
function setupGhost(stageId, carId, spec) {
  G.ghost = null;
  if (G.ghostVis) G.ghostVis.object3d.visible = false;
  const frames = career.loadGhost(stageId, carId);
  if (!frames || !frames.length || params.get("ghost") === "0") return;
  G.ghost = { frames, hz: GHOST_HZ };
  if (!G.mods.car || !G.mods.physics) return;
  if (!G.ghostVis || G.ghostVisKey !== carId) {
    if (G.ghostVis) { G.ghostVis.object3d.parent && G.ghostVis.object3d.parent.remove(G.ghostVis.object3d); G.ghostVis.dispose(); }
    G.ghostVis = G.mods.car.createCarVisual(THREE, spec, { livery: 0, number: 0 });
    G.ghostVisKey = carId;
    G.ghostVis.object3d.traverse((o) => {
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { m.transparent = true; m.opacity = Math.min(m.opacity ?? 1, 0.38); m.depthWrite = false; } }
    });
    G.spare = G.mods.physics.createVehicle(spec, {});
    G.world.dynamicRoot.add(G.ghostVis.object3d);
  }
  G.ghostVis.object3d.visible = true;
}
function updateGhost(dt) {
  if (!G.ghost || !G.ghostVis || !G.run || G.run.status !== "running") { if (G.ghostVis) G.ghostVis.object3d.visible = !!G.ghost && G.run && G.run.status === "countdown"; return; }
  const p = G.ghostPos;
  const alive = ghostPose(G.ghost.frames, G.ghost.hz, G.run.time, p);
  G.ghostVis.object3d.visible = alive;
  if (!alive) return;
  const sv = G.spare;
  sv.reset({ x: p.x, y: p.y, z: p.z, yaw: p.yaw }, 0, G.stage);
  sv.state.pitch = p.pitch; sv.state.roll = p.roll; sv.state.y = p.y;
  const spin = G.run.time * 18;
  for (let i = 0; i < 4; i++) sv.state.wheels[i].spin = spin;
  G.ghostVis.update(sv.state, dt, G.world.environment);
}

// ---------------------------------------------------------------- audio
function ensureAudio() {
  if (G.audio || !G.mods.audio || params.get("mute") === "1") return;
  try {
    G.audio = G.mods.audio.createAudio({ master: opts.mute ? 0 : opts.master, engine: opts.engine, effects: opts.effects, voice: opts.voice, ambience: opts.ambience });
    G.audio.resume && G.audio.resume();
    applyAudioOptions();
  } catch (e) {
    G.audio = null;
    AR.audioError = String(e && e.message);
  }
}
function applyAudioOptions() {
  const a = G.audio;
  if (!a) return;
  a.setVolumes({ master: opts.mute ? 0 : opts.master, engine: opts.engine, effects: opts.effects, voice: opts.voice, ambience: opts.ambience });
  const cd = a.codriver;
  if (cd) {
    cd.enable && cd.enable(!!opts.codriver);
    cd.setVoice && cd.setVoice(opts.voiceName || null);
  }
}
const unlock = () => { ensureAudio(); if (G.audio && G.audio.resume) G.audio.resume(); };
window.addEventListener("pointerdown", unlock, { passive: true });
window.addEventListener("keydown", unlock);

// ---------------------------------------------------------------- simulation
function pollInput(dt) {
  const i = input.poll(dt, G.vehicle && G.vehicle.state ? G.vehicle.state.speed : 0);
  stepInput.steer = i.steer; stepInput.throttle = i.throttle; stepInput.brake = i.brake; stepInput.handbrake = i.handbrake;
  stepInput.gearUp = i.gearUp; stepInput.gearDown = i.gearDown;
  return stepInput;
}

/** One fixed step of physics + rules + recorder. Returns false when the run is over. */
function simStep(inp) {
  const v = G.vehicle, run = G.run;
  if (G.botOn && G.bot) {
    const b = G.bot.control(DT);
    inp = b;
  }
  if (run.status === "finished" || run.status === "dnf") inp = G.endInput || (G.endInput = { steer: 0, throttle: 0, brake: 1, handbrake: 0, gearUp: false, gearDown: false });
  else if (run.status === "countdown") inp = G.holdInput || (G.holdInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0, gearUp: false, gearDown: false });
  v.step(DT, inp, G.stage);
  run.update(DT, v.state);
  if (run.status === "running" || run.status === "finished") G.recorder.step(DT, v.state);
  return true;
}

function onRunEvents() {
  const run = G.run;
  if (!run || !run.events.length) return;
  for (const e of run.drainEvents()) {
    switch (e.t) {
      case "countdown": hud.count(e.n); sfx("countdown"); break;
      case "go": hud.count(0); sfx("go"); G.recorder.step(DT, G.vehicle.state, true); break;
      case "falseStart": hud.banner("False start +5 s", "bad", 2600); sfx("warning"); break;
      case "checkpoint": {
        const best = career.bestSplits(G.stageId, G.carId);
        const b = best && best[e.index];
        hud.banner(b != null ? `${e.name}  ${e.time - b <= 0 ? "" : "+"}${(e.time - b).toFixed(2)}` : e.name, b != null && e.time - b > 0 ? "bad" : "good", 2200);
        sfx("checkpoint");
        break;
      }
      case "respawn": {
        const pen = G.run.penalties[G.run.penalties.length - 1] || {};
        hud.banner(`${e.reason === "no_progress" ? "No progress: back to checkpoint" : "Back at checkpoint"} +${pen.seconds || 10} s`, "bad", 2600);
        if (G.rig) G.rig.snap(G.vehicle.state, G.stage);
        afterJump(e.s);
        break;
      }
      case "wrongWay": sfx("warning"); break;
      case "finish": hud.banner("Finish!", "good", 3000); sfx("finish"); break;
      case "dnf": hud.banner(e.reason === "timeout" ? "Out of time" : e.reason === "retired" ? "Retired" : "Car destroyed", "bad", 3000); if (e.reason !== "retired") sfx("warning"); break;
      default: break;
    }
  }
}

const LIGHTS = { head: false, brake: false, reverse: false }, RIG_OPTS = { shake: 0, fovBoost: 0 }, AUDIO_OPTS = { cameraMode: "chase", paused: false };
function afterSim(dt) {
  const v = G.vehicle, st = v.state, world = G.world;
  G.time += dt;
  // events first (camera shake + audio + fx read state.events)
  if (G.carVis) {
    G.carVis.update(st, dt, world.environment);
    if (st.events.length) G.carVis.setDamage && G.carVis.setDamage(st.damage);
    if (G.carVis.setLights) { LIGHTS.head = !!(world.environment && world.environment.headlights); LIGHTS.brake = st.brake > 0.05; LIGHTS.reverse = st.gear < 0; G.carVis.setLights(LIGHTS); }
  }
  let shake = 0;
  for (let i = 0; i < st.events.length; i++) if (st.events[i].t === "impact") shake = Math.max(shake, st.events[i].strength);
  if (opts.reducedMotion) shake = 0;
  if (G.fx) G.fx.update(dt, st, world.environment, G.stage);
  if (G.rig) { RIG_OPTS.shake = shake * 0.8; RIG_OPTS.fovBoost = opts.fov - 70; G.rig.update(dt, st, G.stage, RIG_OPTS); if (G.carVis && G.carVis.setFade) G.carVis.setFade(G.rig.carFade ?? 1); }
  if (G.audio) { AUDIO_OPTS.cameraMode = G.rig ? G.rig.mode : "chase"; AUDIO_OPTS.paused = G.paused; G.audio.update(dt, st, G.stage, AUDIO_OPTS); }
  updateGhost(dt);
  frameInfo.time = G.time;
  frameInfo.carPos.x = st.x; frameInfo.carPos.y = st.y; frameInfo.carPos.z = st.z;
  frameInfo.carVel.x = st.vx; frameInfo.carVel.y = st.vy; frameInfo.carVel.z = st.vz;
  frameInfo.camPos.x = world.camera.position.x; frameInfo.camPos.y = world.camera.position.y; frameInfo.camPos.z = world.camera.position.z;
  frameInfo.speedKmh = st.speedKmh; frameInfo.stageS = st.s;
  world.update(dt, frameInfo);
  st.events.length = 0;
}

function renderFrame(dt) {
  if (!G.world || !G.vehicle) return;
  if (dt >= 0 && G.screen === "stage" && !G.paused) { /* sim already advanced */ }
  G.world.render();
}

// ---------------------------------------------------------------- run end / results
function endRunSoon() {
  if (G.finishing) return;
  G.finishing = true;
  G.endTimer = G.run.status === "dnf" ? 2.4 : 3.2;
  if (G.rig && G.run.status === "finished") G.rig.setMode("cinematic");
  hud.hint("");
}
function showResults() {
  const run = G.run;
  const result = run.result();
  G.lastResult = result;
  G.lastRec = G.recorder.finish();
  G.playing = false;
  hud.show(false);
  applyTouchVisibility();
  const def = G.stageDef;
  const dnf = result.status === "dnf";
  let isBest = false, previousBest = null;
  const bestSplitsBefore = career.bestSplits(G.stageId, G.carId);
  if (!dnf && !result.assisted) {
    const splitTimes = [0, ...result.splits.map((s) => s.time)];
    const r = career.recordBest(G.stageId, G.carId, result.total, splitTimes);
    isBest = r.isBest; previousBest = r.previous;
    if (isBest) career.saveGhost(G.stageId, G.carId, ghostFramesFromRecording(G.lastRec));
  }
  let sheet, mode = G.mode;
  if (mode === "championship" && career.championship) {
    sheet = career.completeStage(result, cloneDamage(G.vehicle.state.damage));
  } else if (mode === "trial") {
    sheet = []; // a time trial has no rivals and no points
  } else {
    sheet = career.buildSheet(G.stageId, result, { parTime: parFor(G.stageId, G.carId), difficulty: G.sessionDifficulty, carId: G.carId });
  }
  career.save();
  const goOn = () => {
    if (mode !== "championship") return backToMenu();
    showStandings();
  };
  const show = () => {
    G.screen = "results";
    screens.results({
      def, result, sheet, isBest, previousBest, bestSplits: bestSplitsBefore, mode, dnf,
      continueLabel: mode === "championship" ? "Standings" : "Continue",
      onContinue: goOn,
      onRetry: mode === "championship" ? null : () => startFromMenu(),
      onReplay: G.lastRec && G.lastRec.n > 10 ? () => startReplay("results") : null,
      onMenu: mode === "championship" ? null : backToMenu,
    });
  };
  G.reshowResults = show; // the replay returns here
  show();
}
function showStandings() {
  const champ = career.championship;
  const rows = career.standings();
  const last = career.finished;
  screens.standings({
    rows, timeRows: career.timeStandings(), stageIndex: champ.stageIndex, last,
    continueLabel: last ? "Final podium" : "Service area",
    onContinue: () => (last ? showPodium() : showService()),
  });
}
function showPodium() {
  screens.podium({ rows: career.standings(), timeRows: career.timeStandings(), onContinue: () => { career.abandon(); career.save(); backToMenu(); } });
}
function showService() {
  const champ = career.championship;
  const nextDef = G.mods.stage.getStageDef(STAGE_ORDER[champ.stageIndex]);
  career.setSetup({ tyre: recommendedTyre(nextDef) });
  screens.service({
    nextDef, spec: cars()[champ.carId],
    onDone: async () => {
      const plan = career.commitService();
      if (G.carVis && G.carVis.setDirt) G.carVis.setDirt(0); // the service crew wash the car
      if (G.vehicle) {
        const p = { ...plan, radiator: plan.engine || 0 };
        G.vehicle.repair(p);
      }
      career.save();
      await startChampionshipStage();
    },
    onSave: () => { career.save(); backToMenu(); },
  });
}

// ---------------------------------------------------------------- replay
const REPLAY_SHOTS = ["replay", "chase", "far", "bumper"], SHOT_LABEL = { replay: "Broadcast", chase: "Chase", far: "Far", bumper: "Bumper" };
function startReplay(from = "menu") {
  if (!G.lastRec || !G.world || !G.vehicle) return;
  const v = G.vehicle;
  const backup = cloneDamage(v.state.damage);
  const player = createPlayer(G.lastRec, v.state);
  const r = { player, t: 0, playing: true, speed: 1, shot: 0, backup, dur: player.duration, from };
  G.replay = r;
  G.screen = "replay";
  hud.show(false);
  r.ui = screens.replayBar({
    duration: r.dur,
    onToggle: () => { r.playing = !r.playing; r.ui.setPos(r.t, r.playing); },
    onSeek: (t) => { r.t = t; },
    onSpeed: () => { r.speed = r.speed === 1 ? 0.5 : r.speed === 0.5 ? 2 : 1; r.ui.speed.textContent = r.speed + "x"; },
    onShot: () => { r.shot = (r.shot + 1) % REPLAY_SHOTS.length; G.rig.setMode(REPLAY_SHOTS[r.shot]); r.ui.shot.textContent = SHOT_LABEL[REPLAY_SHOTS[r.shot]]; },
    onExit: () => exitReplay(),
  });
  G.rig && G.rig.setMode("replay");
  if (G.ghostVis) G.ghostVis.object3d.visible = false;
  r.player.seek(0);
}
function exitReplay() {
  const v = G.vehicle;
  const from = G.replay ? G.replay.from : "menu";
  if (G.replay) applyDamage(v, G.replay.backup);
  G.replay = null;
  G.screen = "results";
  G.rig && G.rig.setMode(opts.camera);
  if (G.carVis && G.carVis.setViewMode) G.carVis.setViewMode("exterior");
  // back to wherever the replay was opened from (the results screen, so a championship is not lost)
  if (from === "results" && G.reshowResults) { G.playing = false; hud.show(false); applyTouchVisibility(); G.reshowResults(); }
  else backToMenu();
}
function replayFrame(dt) {
  const r = G.replay;
  if (r.playing) { r.t += dt * r.speed; if (r.t >= r.dur) { r.t = r.dur; r.playing = false; } }
  r.ui.setPos(r.t, r.playing);
  const st = r.player.seek(r.t);
  G.carVis.update(st, dt, G.world.environment);
  if (G.fx && r.playing) G.fx.update(dt * r.speed, st, G.world.environment, G.stage);
  G.rig.update(dt, st, G.stage, {});
  frameInfo.time = G.time; frameInfo.carPos.x = st.x; frameInfo.carPos.y = st.y; frameInfo.carPos.z = st.z;
  frameInfo.camPos.x = G.world.camera.position.x; frameInfo.camPos.y = G.world.camera.position.y; frameInfo.camPos.z = G.world.camera.position.z;
  frameInfo.speedKmh = st.speedKmh; frameInfo.stageS = st.s;
  G.world.update(dt, frameInfo);
  G.world.render();
}

// ---------------------------------------------------------------- pause
function togglePause() {
  if (G.replay) { exitReplay(); return; }
  if (screens && screens.modal) return;
  if (!G.playing) return;
  if (G.paused) resumeGame();
  else pauseGame();
}
function pauseGame() {
  if (!G.playing || G.paused || G.finishing) return;
  G.paused = true;
  hud.show(true);
  screens.pause({
    mode: G.mode, recoverPenalty: RULES.respawnPenalty[curDifficulty()] ?? 10,
    onRetire: () => retireStage(),
    onResume: resumeGame,
    onRestart: () => { resumeGame(); restartStage(); },
    onOptions: () => screens.options({ onChange: optionChanged, onBack: () => pauseGame2() }),
    onQuit: () => { G.paused = false; backToMenu(); },
    onRecover: () => { resumeGame(); recover(); },
  });
  if (G.audio) G.audio.update(0, G.vehicle.state, G.stage, { paused: true });
}
/** Championship: give up the stage. Scores a DNF (0 points, slowest time + penalty in the standings). */
function retireStage() {
  if (!G.run || !G.playing) return;
  G.paused = false;
  screens.clear();
  G.screen = "stage";
  G.run.retire();
  G.finishing = true;
  G.endTimer = 0.05;
  hud.hint("");
}
function pauseGame2() { G.paused = false; pauseGame(); }
function resumeGame() {
  if (!G.paused) return;
  G.paused = false;
  screens.clear();
  G.screen = "stage";
  if (G.audio) G.audio.update(0, G.vehicle.state, G.stage, { paused: false });
}
document.addEventListener("visibilitychange", () => { if (document.hidden) { if (G.playing && !G.paused && G.run && G.run.status !== "finished") pauseGame(); if (G.audio && G.audio.suspend) G.audio.suspend(); } else if (G.audio && G.audio.resume) G.audio.resume(); });
window.addEventListener("blur", () => { if (G.playing && !G.paused && !G.finishing && params.get("nopause") !== "1") pauseGame(); });

// ---------------------------------------------------------------- flows
async function restartStage() {
  if (G.mode === "championship" || G.restarting) return; // a championship stage has no free restart
  G.restarting = true;
  try { await prepareRun({ stageId: G.stageId, carId: G.carId, livery: G.livery, weather: G.weather, countdown: true, mode: G.mode }); }
  finally { G.restarting = false; }
}
function optionChanged(k, v) {
  opts = career.options;
  career.save();
  if (["master", "engine", "effects", "voice", "ambience", "mute", "codriver", "voiceName"].includes(k)) applyAudioOptions();
  if (k === "quality" && G.world) G.world.setQuality(v === "auto" ? "auto" : v);
  if (["units", "colourSafe", "fps", "hudScale"].includes(k)) hud.setOptions(opts);
  if (k === "reducedMotion") document.body.classList.toggle("reduced-motion", !!v);
  if (k === "gearbox" || k === "steerAssist") { const sp = G.vehicle && G.vehicle.spec; if (sp) G.vehicle.configure(vehicleOptionsFor(sp, null, opts)); }
  if (k === "touch" || k === "tilt") applyTouchVisibility();
  if (k === "camera" && G.rig && G.playing) setCamera(v);
}
function applyOptionsAll() {
  document.body.classList.toggle("reduced-motion", !!opts.reducedMotion);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches && !career.profile.optionsTouched) document.body.classList.add("reduced-motion");
  hud.setOptions(opts);
}

function backToMenu() {
  G.playing = false; G.paused = false; G.replay = null; G.finishing = false;
  G.botOn = false;
  hud.show(false);
  applyTouchVisibility();
  const pb = document.querySelector(".touch-pause");
  pb && pb.remove();
  showMainMenu();
}
function showMainMenu() {
  screens.mainMenu({
    hasReplay: !!G.lastRec && G.lastRec.n > 10 && !!G.vehicle,
    onContinue: () => continueChampionship(),
    onNewChamp: () => startNewChampionship(),
    onSingle: () => beginSingle("single"),
    onTrial: () => beginSingle("trial"),
    onReplay: () => { startReplayFromMenu(); },
    onOptions: () => screens.options({ onChange: optionChanged, onBack: showMainMenu }),
    onGarage: () => screens.carSelect({ carId: G.carId, livery: G.livery, title: "Garage", confirmLabel: "Use this car", backLabel: "Menu", onConfirm: (c, l) => { G.carId = c; G.livery = l; showMainMenu(); }, onBack: showMainMenu }),
    onHow: () => screens.howto({ onBack: showMainMenu }),
    onCredits: () => screens.credits({ onBack: showMainMenu, version: VERSION }),
  });
}
async function startReplayFromMenu() {
  if (!G.lastRec) return;
  hud.show(false);
  startReplay();
}

function startNewChampionship() {
  screens.difficulty({
    selected: G.sessionDifficulty, onBack: showMainMenu,
    onPick: (d) => {
      G.sessionDifficulty = d;
      screens.carSelect({
        carId: G.carId, livery: G.livery, title: "Championship", confirmLabel: "Choose stage 1",
        onBack: startNewChampionship,
        onConfirm: (carId, livery) => {
          career.newChampionship({ difficulty: d, carId, livery });
          career.save();
          G.mode = "championship";
          G.vehicle = null;
          startChampionshipStage(true);
        },
      });
    },
  });
}
function continueChampionship() {
  const c = career.championship;
  if (!c) return startNewChampionship();
  G.mode = "championship";
  G.carId = c.carId;
  G.livery = c.livery;
  if (!G.vehicle || G.vehicle.spec.id !== c.carId) G.vehicle = null;
  if (c.inStage) {
    // the stage was left unfinished (quit, closed tab, crash): that is a DNF, there is no free retry
    career.completeStage({ status: "dnf", total: Infinity, penaltyTotal: 0 }, c.damage);
    career.save();
    toast("Unfinished stage scored as a DNF", "bad", 3200);
    return showStandings();
  }
  if (c.stageIndex > 0) showService();
  else startChampionshipStage(true);
}
async function startChampionshipStage(firstBriefing) {
  const c = career.championship;
  const stageId = STAGE_ORDER[c.stageIndex];
  G.mode = "championship";
  G.carId = c.carId; G.livery = c.livery;
  showLoading("Loading " + G.mods.stage.getStageDef(stageId).name);
  try {
    const stage = await loadStage(stageId);
    hideLoading();
    showBriefing(stage, stageId, "championship", () => prepareRun({ stageId, carId: c.carId, livery: c.livery, mode: "championship", countdown: true, freshCar: !!firstBriefing }), () => backToMenu());
  } catch (e) { hideLoading(); console.error("stage load failed: " + (e && e.message)); toast("Could not load the stage", "bad"); showMainMenu(); }
}
function showBriefing(stage, stageId, mode, onStart, onBack) {
  const def = G.mods.stage.getStageDef(stageId);
  const best = career.bestTime(stageId, G.carId);
  const par = parFor(stageId, G.carId);
  const benchFor = (did) => {
    const rv = rivalsFor(stageId, { parTime: par, difficulty: did, carId: G.carId });
    const t = rv.map((r) => r.time).filter(Number.isFinite);
    return t.length ? Math.min(...t) : null;
  };
  const did = career.championship && mode === "championship" ? career.championship.difficulty : G.sessionDifficulty;
  const champ = career.championship;
  screens.briefing({
    def, stage, mode, carId: G.carId, best, par, bench: mode === "trial" ? null : benchFor(did), benchFor, championship: mode === "championship",
    difficulty: mode === "single" ? G.sessionDifficulty : null, onDifficulty: (id) => { G.sessionDifficulty = id; },
    tyre: champ && mode === "championship" ? champ.setup.tyre : (G.singleSetup && G.singleSetup.tyre) || recommendedTyre(def),
    onTyre: (t) => { if (champ && mode === "championship") career.setSetup({ tyre: t }); else G.singleSetup = { ...(G.singleSetup || {}), tyre: t }; },
    onStart, onBack,
  });
}
function beginSingle(mode) {
  G.mode = mode;
  screens.stageSelect({
    title: mode === "trial" ? "Time trial" : "Single stage", carId: G.carId, onBack: showMainMenu,
    onPick: (stageId) => {
      screens.carSelect({
        carId: G.carId, livery: G.livery, title: G.mods.stage.getStageDef(stageId).name, confirmLabel: "Briefing", onBack: () => beginSingle(mode),
        onConfirm: async (carId, livery) => {
          G.carId = carId; G.livery = livery;
          showLoading("Loading " + G.mods.stage.getStageDef(stageId).name);
          try {
            const stage = await loadStage(stageId);
            hideLoading();
            showBriefing(stage, stageId, mode, () => prepareRun({ stageId, carId, livery, mode, countdown: true }), () => beginSingle(mode));
          } catch (e) { hideLoading(); console.error("stage load failed: " + (e && e.message)); toast("Could not load the stage", "bad"); showMainMenu(); }
        },
      });
    },
  });
}
function startFromMenu() {
  return prepareRun({ stageId: G.stageId, carId: G.carId, livery: G.livery, weather: G.weather, mode: G.mode, countdown: true });
}

// ---------------------------------------------------------------- main loop
const clock = createFrameClock(performance.now());
function frame(now) {
  requestAnimationFrame(frame);
  let dt = clock.tick(now);
  if (!(dt > 0)) return;
  if (now < (G.watchUntil || 0) && dt * 1000 > (AR.worstFrameMs || 0)) { AR.worstFrameMs = Math.round(dt * 1000); AR.worstFrameAtMs = Math.round(now - (G.watchUntil - 3000)); AR.frameIdx = G.fpsN; }
  G.rawDt = Math.min(dt, 1); // wall-clock frame time: the end-of-run pause is a presentation delay, not sim time
  dt = Math.min(dt, 0.1);
  G.fpsAcc += dt; G.fpsN++;
  if (G.fpsAcc >= 0.5) { G.fps = G.fpsN / G.fpsAcc; G.fpsAcc = 0; G.fpsN = 0; }
  try {
    if (G.replay) { replayFrame(dt); return; }
    if (!G.playing) { nav && nav.tick(dt); return; }
    if (G.paused) {
      nav && nav.tick(dt);
      G.world.render();
      return;
    }
    const inp = pollInput(dt);
    G.acc += dt;
    let steps = 0;
    let first = true;
    while (G.acc >= DT && steps < MAX_STEPS) {
      simStep(inp);
      if (first) { first = false; inp.gearUp = false; inp.gearDown = false; }
      G.acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS) G.acc = 0; // spiral-of-death clamp
    afterSim(dt);
    onRunEvents();
    hud.update(G.vehicle.state, G.run, G.fps);
    const st = G.run.status;
    if ((st === "finished" || st === "dnf") && !G.finishing) endRunSoon();
    if (G.finishing) { G.endTimer -= G.rawDt || dt; if (G.endTimer <= 0) { G.finishing = false; showResults(); } }
    G.world.render();
  } catch (e) {
    console.error("frame error: " + (e && e.stack ? e.stack : e));
    G.playing = false;
    toast("Something went wrong, returning to the menu", "bad", 3000);
    backToMenu();
  }
}

// ---------------------------------------------------------------- context loss
$("gl").addEventListener("webglcontextlost", (e) => { e.preventDefault(); if (G.playing) pauseGame(); toast("Graphics context lost, recovering...", "bad", 4000); AR.contextLost = (AR.contextLost || 0) + 1; });
$("gl").addEventListener("webglcontextrestored", () => { toast("Graphics restored"); AR.contextRestored = (AR.contextRestored || 0) + 1; resize(); });

// ---------------------------------------------------------------- window.__AR__ API
function needStage() { if (!G.stage || !G.vehicle || !G.run) throw new Error("no stage running: call startStage first"); }
Object.assign(AR, {
  startStage: async ({ stageId, carId = "huia", livery = 0, weather, quality, countdown = false, bot = false, fresh = false, mode = "single" } = {}) => {
    if (!G.mods.stage) throw new Error("stage module missing");
    if (!stageId) stageId = STAGE_ORDER[0];
    if (quality && G.world) G.world.setQuality(quality);
    if (quality && !G.world) params.set("quality", quality);
    if (career.championship && mode !== "championship") { /* keep save intact, run a free stage */ }
    await prepareRun({ stageId, carId, livery, weather: weather || null, countdown, bot, fresh, freshCar: true, mode });
    await overlayGone;
    return AR.state();
  },
  teleport(s, lat = 0, speedKmh = 0) {
    needStage();
    const st = G.stage;
    s = clamp(s, 0, st.lengthM);
    const sm = st.sample(s, {});
    const x = sm.x + sm.nx * lat, z = sm.z + sm.nz * lat;
    const yaw = yawOfDir(sm.tx, sm.tz);
    G.vehicle.reset({ x, y: st.heightAt(x, z) + 0.4, z, yaw }, speedKmh / 3.6, st);
    G.vehicle.state.events.length = 0;
    if (G.rig) G.rig.snap(G.vehicle.state, st);
    if (G.run.status === "running" || G.run.status === "countdown") { G.run._stuck = 0; G.run._wrong = 0; G.run._off = 0; G.run._flip = 0; G.run.assisted = true; G.run._curS = G.vehicle.state.s; }
    G.carVis.update(G.vehicle.state, DT, G.world.environment);
    if (G.bot && G.bot.reset) G.bot.reset();
    afterJump(G.vehicle.state.s);
    return AR.state();
  },
  setBot(on) {
    needStage();
    G.botOn = !!on;
    if (on && !G.bot) makeBot();
    return G.botOn;
  },
  stepSim(n, dt = DT) {
    needStage();
    const inp = pollInput(1 / 60);
    // `dt` is the simulated time of one call step: it is split into whole fixed physics steps (n steps of DT when omitted)
    const steps = dt === DT ? n : Math.max(1, Math.round((n * dt) / DT));
    for (let i = 0; i < steps; i++) {
      simStep(inp);
      inp.gearUp = inp.gearDown = false;
    }
    G.time += steps * DT;
    onRunEvents();
    return AR.state();
  },
  renderNow() {
    if (!G.world) return;
    const v = G.vehicle;
    if (v && G.stage) {
      G.carVis.update(v.state, DT, G.world.environment);
      if (G.rig) G.rig.update(1 / 60, v.state, G.stage, { fovBoost: opts.fov - 70 });
      frameInfo.camPos.x = G.world.camera.position.x; frameInfo.camPos.y = G.world.camera.position.y; frameInfo.camPos.z = G.world.camera.position.z;
      frameInfo.carPos.x = v.state.x; frameInfo.carPos.y = v.state.y; frameInfo.carPos.z = v.state.z;
      frameInfo.stageS = v.state.s; frameInfo.speedKmh = v.state.speedKmh; frameInfo.time = G.time;
      G.world.update(1 / 60, frameInfo);
      hud.update(v.state, G.run, G.fps);
    }
    G.world.render();
  },
  setCamera(mode) { setCamera(mode); if (G.vehicle && G.stage) G.rig.snap(G.vehicle.state, G.stage); return G.rig ? G.rig.mode : null; },
  setHud(on) { if (hud.hidden === !!on) hud.toggleHidden(); },
  state() {
    const v = G.vehicle, s = v ? v.state : null, run = G.run;
    return {
      screen: G.screen, stageId: G.stageId, carId: G.carId, mode: G.mode, paused: G.paused,
      s: s ? s.s : 0, lat: s ? s.lat : 0, speedKmh: s ? s.speedKmh : 0, rpm: s ? s.rpm : 0, gear: s ? s.gear : 0,
      time: run ? run.time : 0, total: run ? run.time + run.penaltyTotal : 0, status: run ? run.status : "none",
      damage: s ? s.damage : null, splits: run ? run.splits.map((x) => ({ ...x })) : [], penalties: run ? run.penalties.map((p) => ({ ...p })) : [],
      camera: G.rig ? G.rig.mode : null, quality: G.world ? G.world.quality : G.quality, bot: G.botOn, onRoad: s ? s.onRoad : null, x: s ? s.x : 0, z: s ? s.z : 0,
      championship: career.championship ? { stageIndex: career.championship.stageIndex, difficulty: career.championship.difficulty, results: career.championship.results.length } : null,
    };
  },
  perf() { return { ...(G.world ? G.world.getStats() : {}), worstFrameMs: AR.worstFrameMs ?? null, fps: Math.round(G.fps) }; },
  /** For screenshot tooling: drop the loading overlay and toasts instantly (no fade). */
  hideOverlays() {
    const l = $("loading");
    l.classList.add("done"); l.hidden = true;
    const t = $("toasts");
    t && t.replaceChildren();
    return true;
  },
  whenOverlayGone() { return overlayGone; },
  /** Drive with the bot until the stage is over (real physics, no rendering). Returns the final state. */
  finishRun(maxSeconds = 1200) {
    needStage();
    if (!G.bot) makeBot();
    const prevBot = G.botOn;
    G.botOn = true;
    G.run.assisted = true; // a bot-driven finish through the API is not a record
    if (G.run.status === "ready" || G.run.status === "countdown") G.run.skipCountdown(G.vehicle.state);
    let n = 0;
    const max = Math.ceil(maxSeconds / DT);
    while ((G.run.status === "running") && n < max) {
      for (let k = 0; k < 120 && G.run.status === "running"; k++, n++) simStep(stepInput);
    }
    // let the car roll out a moment so the finish looks right
    for (let k = 0; k < 60; k++) simStep(stepInput);
    G.botOn = prevBot;
    onRunEvents();
    return AR.state();
  },
  /** Open the results screen as if the stage had just ended (after finishRun). */
  showResults() { needStage(); G.finishing = false; showResults(); return AR.state(); },
  skipTitle() { if (G.screen === "title") { showMainMenu(); } return AR.state(); },
  screenName() { return G.screen; },
  /** Click the first visible button whose text contains `label` (case-insensitive). */
  click(label) {
    const want = String(label).toLowerCase();
    const b = [...document.querySelectorAll("#screens button, .replay-bar button")].find((x) => x.offsetParent !== null && x.textContent.toLowerCase().includes(want));
    if (!b) return false;
    b.click();
    return true;
  },
  buttons() { return [...document.querySelectorAll("#screens button")].filter((x) => x.offsetParent !== null).map((x) => x.textContent.trim()); },
  career() { return JSON.parse(career.serialize()); },
  setOption(k, v) { career.setOption(k, v); optionChanged(k, career.options[k]); },
  eraseSave() { career.wipe(); },
  paused() { return G.paused; },
  inputNow() { return { ...stepInput }; },
  modalOpen() { return !!(screens && screens.modal); },
  pause() { pauseGame(); },
  resume() { resumeGame(); },
  hudHidden() { return hud.hidden; },
});

// ---------------------------------------------------------------- boot
/** The garage showroom compiles its own shaders (3.9-6 s of getProgramInfoLog on a real GPU if done inside render()).
 *  Once the title is up and the page idle, compile every car's programs on a detached canvas with compileAsync (the GPU
 *  process works, the main thread does not), so the driver has them cached when the garage opens. Silent when the
 *  extension is missing. The showroom itself also never renders before its own compileAsync resolves. */
async function warmShowroomIdle() {
  let sr = null;
  try {
    if (!G.mods.car || !G.mods.cars || params.get("nomenu") === "1") return;
    sr = createShowroom(document.createElement("canvas"), G.mods.car.createCarVisual);
    if (!sr || !sr.parallel) return;
    AR.showroomWarm = { programsBefore: sr.programCount(), done: false };
    const list = carIds().map((id) => ({ spec: cars()[id], livery: 0 }));
    AR.showroomWarm.programs = await sr.warm(list);
    AR.showroomWarm.done = true;
  } catch (e) { console.warn("showroom warm-up skipped: " + (e && e.message)); } // allow-console-warn
  finally { try { sr && sr.dispose(); } catch { /* ok */ } }
}

async function boot() {
  const noGL = !webgl2Ok();
  document.body.classList.toggle("reduced-motion", !!opts.reducedMotion);
  setProgress(0.04, "Loading modules");
  const [stageM, carsM, physM, botM, rivalsM, partimesM, rendererM, carM, fxM, camM, audioM] = await Promise.all([
    tryImport("stage", "./core/stage.mjs"), tryImport("cars", "./core/cars.mjs"), tryImport("physics", "./core/physics.mjs"),
    tryImport("bot", "./core/bot.mjs"), tryImport("rivals", "./core/rivals.mjs"), tryImport("partimes", "./core/partimes.mjs"),
    tryImport("renderer", "./render/renderer.mjs"), tryImport("car", "./render/car.mjs"), tryImport("fx", "./render/fx.mjs"),
    tryImport("camera", "./render/camera.mjs"), tryImport("audio", "./audio/audio.mjs"),
  ]);
  Object.assign(G.mods, { stage: stageM, cars: carsM, physics: physM, bot: botM, rivals: rivalsM, partimes: partimesM, renderer: rendererM, car: carM, fx: fxM, camera: camM, audio: audioM });
  setProgress(0.2, "Starting");
  if (noGL) {
    $("loading").hidden = true;
    $("nogl").hidden = false;
    AR.noWebGL = true;
    AR.state = () => ({ screen: "nogl" });
    resolveReady(true);
    return;
  }
  if (carsM && career.championship && !carsM.CARS[career.championship.carId]) { career.abandon(); career.save(); }
  // A typo in the URL falls back to the defaults (and the menu), never a blank screen.
  const launch = parseLaunch(params, { stageIds: STAGE_ORDER, carIds: carIds() });
  for (const w of launch.warnings) console.warn("[aotearoa-rally] " + w); // allow-console-warn
  for (const k of ["stage", "car", "weather", "quality", "camera"]) if (params.get(k) != null && launch[k === "stage" ? "stageId" : k === "car" ? "carId" : k] === undefined) params.delete(k);
  buildScreens();
  nav = createNav(screensRoot, { getPads: () => (navigator.getGamepads ? navigator.getGamepads() : []) });
  applyOptionsAll();
  G.carId = params.get("car") || carIds()[0];
  G.livery = parseInt(params.get("livery") || "0", 10) || 0;
  if (G.mods.renderer) {
    try { await ensureWorld(); } catch (e) { console.error("world failed: " + (e && e.message)); AR.worldError = String(e && e.message); }
  }
  hideLoading();
  requestAnimationFrame(() => { clock.reset(performance.now()); requestAnimationFrame(frame); });
  const urlStage = params.get("stage");
  if (params.get("nomenu") === "1" && (urlStage || !launch.warnings.some((w) => w.startsWith("ignoring ?stage")))) {
    const sid = urlStage || STAGE_ORDER[0];
    try {
      await AR.startStage({ stageId: sid, carId: G.carId, livery: G.livery, weather: params.get("weather") || undefined, quality: params.get("quality") || undefined, countdown: params.get("countdown") === "1", bot: params.get("bot") === "1" });
      if (params.get("camera")) AR.setCamera(params.get("camera"));
    } catch (e) { console.error("nomenu start failed: " + (e && e.message)); }
    resolveReady(true);
    return;
  }
  if (params.get("title") !== "1" && (navigator.webdriver || params.get("menu") === "1" || params.get("nomenu") === "1")) showMainMenu(); // nomenu with a bad stage lands here: straight to the menu
  else screens.title({ version: VERSION, onStart: () => { unlock(); showMainMenu(); } });
  resolveReady(true);
  setTimeout(() => { (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => { warmShowroomIdle(); }, { timeout: 3000 }); }, 1500);
}
boot().catch((e) => { console.error("boot failed: " + (e && e.stack ? e.stack : e)); rejectReady(e); hideLoading(); });
