// ============================================================
// VECTOR GP — a flat-shaded polygon grand prix, 1991 style.
// Vanilla JS on a 640x400 canvas, FM-synth audio, no deps.
// ============================================================
"use strict";

const TAU = Math.PI * 2;
const W = 640, H = 400;
const STEP = 4;              // track sample spacing, metres
const FOCAL = 330;           // projection focal length, px
const NEAR = 0.6;            // near clip plane, metres
const DRAW_AHEAD = 170;      // samples drawn ahead (~680 m)
const CAR_L = 4.4, CAR_W = 1.9;
const POINTS = [10, 6, 4, 3, 2, 1];   // 1991-style scoring

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const fmtT = (t) => {
  if (t == null || !isFinite(t)) return "-:--.---";
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + s.toFixed(3).padStart(6, "0");
};
// deterministic per-track pseudo-random
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------
// Themes (sky bands, ground, horizon silhouettes)
// ------------------------------------------------------------
const THEMES = {
  desert: { sky: ["#68a8e8", "#88c0f0", "#b8d8f8"], grass: "#b09858", grass2: "#a89050", hor: "#907048", horFar: "#a88860" },
  park:   { sky: ["#5898e0", "#78b0ec", "#a8ccf4"], grass: "#3f8f3f", grass2: "#398539", hor: "#2f6f37", horFar: "#4f8a55" },
  forest: { sky: ["#6098d0", "#80b0e0", "#a8c8ec"], grass: "#367f36", grass2: "#2f752f", hor: "#1e5426", horFar: "#33663d" },
  plain:  { sky: ["#60a0e0", "#84b8ec", "#b0d4f4"], grass: "#4d914d", grass2: "#458745", hor: "#5a7a4a", horFar: "#7a9866" },
  street: { sky: ["#5890c8", "#7cacd8", "#a4c4e4"], grass: "#8a8a8a", grass2: "#828282", hor: "#607080", horFar: "#8593a2" },
  coast:  { sky: ["#5c9ce4", "#80b8ec", "#acd4f4"], grass: "#7f9c50", grass2: "#77934a", hor: "#3c6ea0", horFar: "#5e8cb8" },
};

// ------------------------------------------------------------
// Track building
// ------------------------------------------------------------
function buildTrack(def) {
  // expand to [curv, len] parts (right turn = negative curvature)
  const parts = [];
  for (const s of def.segs) {
    if (s[0] === "s") parts.push([0, s[1]]);
    else {
      const r = s[1], ang = s[2] * Math.PI / 180;
      parts.push([(s[0] === "l" ? 1 : -1) / r, ang * r]);
    }
  }
  // heading closure: distribute error over curved length
  let turn = 0, curvedLen = 0;
  for (const [c, l] of parts) { turn += c * l; if (c) curvedLen += l; }
  const target = Math.round(turn / TAU) * TAU || (turn >= 0 ? TAU : -TAU);
  const adj = (target - turn) / curvedLen;
  for (const p of parts) if (p[0]) p[0] += adj;

  // integrate samples
  let x = 0, y = 0, h = 0;
  const pts = [];
  for (const [c, l] of parts) {
    const n = Math.max(1, Math.round(l / STEP));
    const ds = l / n;
    for (let i = 0; i < n; i++) {
      pts.push({ x, y, h, c });
      h += c * ds; x += Math.cos(h) * ds; y += Math.sin(h) * ds;
    }
  }
  const N = pts.length;
  // position closure: distribute endpoint error linearly
  const ex = 0 - x, ey = 0 - y;
  for (let i = 0; i < N; i++) { pts[i].x += ex * i / N; pts[i].y += ey * i / N; }
  // recompute headings/curvature from geometry, then smooth curvature
  for (let i = 0; i < N; i++) {
    const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N];
    pts[i].h = Math.atan2(b.y - a.y, b.x - a.x);
  }
  for (let i = 0; i < N; i++) {
    const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N];
    pts[i].c = wrapA(b.h - a.h) / (2 * STEP);
  }
  // rotate the loop so s=0 sits well into the longest straight: the grid
  // then forms up on the straight behind the line, with a run to turn 1
  {
    let bestLen = 0, bestStart = 0, run = 0, runStart = 0;
    for (let i = 0; i < N * 2; i++) {
      if (Math.abs(pts[i % N].c) < 0.0028) {
        if (run === 0) runStart = i;
        run++;
      } else {
        if (run > bestLen && runStart < N) { bestLen = run; bestStart = runStart % N; }
        run = 0;
      }
    }
    if (run > bestLen && runStart < N) { bestLen = run; bestStart = runStart % N; }
    bestLen = Math.min(bestLen, N);
    const k = (bestStart + Math.floor(bestLen * 0.65)) % N;
    if (k) { const cut = pts.splice(0, k); pts.push(...cut); }
  }
  const curvS = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -3; k <= 3; k++) s += pts[(i + k + N) % N].c;
    curvS[i] = s / 7;
  }
  const wHalf = def.width / 2;
  // racing-line lateral offset (relaxation toward inside of corners)
  const off = new Float32Array(N), tgt = new Float32Array(N);
  const maxOff = wHalf - 1.8;
  for (let i = 0; i < N; i++) tgt[i] = clamp(curvS[i] * 260, -maxOff, maxOff);
  for (let it = 0; it < 220; it++) {
    for (let i = 0; i < N; i++) {
      const av = (off[(i + N - 1) % N] + off[(i + 1) % N]) / 2;
      off[i] = clamp(av * 0.72 + tgt[i] * 0.28, -maxOff, maxOff);
    }
  }
  // corner speed profile (m/s) with braking chain
  const aLat = (v) => 9.81 * (1.65 + Math.min(0.0002 * v * v, 2.6));
  const aBrk = (v) => 9.81 * (1.8 + Math.min(0.00022 * v * v, 2.8));
  const vt = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = Math.max(Math.abs(curvS[i]), 1e-5);
    let v = 60;
    for (let k = 0; k < 5; k++) v = Math.sqrt(aLat(v) / c);
    vt[i] = Math.min(v, 92);
  }
  for (let pass = 0; pass < 2; pass++)
    for (let i = N * 2 - 1; i >= 0; i--) {
      const j = i % N, k = (i + 1) % N;
      vt[j] = Math.min(vt[j], Math.sqrt(vt[k] * vt[k] + 2 * aBrk(vt[k]) * STEP));
    }
  // scenery objects, bucketed by sample index
  const rng = mulberry(def.id.length * 7919 + N);
  const objs = [];
  const themed = def.theme;
  for (let i = 0; i < N; i++) {
    const straight = Math.abs(curvS[i]) < 0.002;
    const side = wHalf + 4 + rng() * 3;
    if (i < 40 && i % 6 === 2) {                       // grandstands near start
      objs.push({ i, d: wHalf + 12, w: 22, h: 9, t: "stand" });
      objs.push({ i, d: -(wHalf + 12), w: 22, h: 9, t: "stand" });
    } else if (straight && i % 22 === 8) {
      objs.push({ i, d: (i % 44 === 8 ? 1 : -1) * side, w: 7, h: 2.6, t: "board", n: (i / 22) | 0 });
    } else if (themed === "forest" && i % 5 === 1) {
      objs.push({ i, d: (rng() < 0.5 ? 1 : -1) * (wHalf + 7 + rng() * 22), w: 4.5, h: 8 + rng() * 5, t: "tree" });
      objs.push({ i, d: (rng() < 0.5 ? 1 : -1) * (wHalf + 9 + rng() * 26), w: 4, h: 7 + rng() * 5, t: "tree" });
    } else if (themed === "park" && i % 9 === 4) {
      objs.push({ i, d: (rng() < 0.5 ? 1 : -1) * (wHalf + 8 + rng() * 24), w: 5, h: 7 + rng() * 4, t: "tree" });
    } else if (themed === "desert" && i % 11 === 5) {
      objs.push({ i, d: (rng() < 0.5 ? 1 : -1) * (wHalf + 7 + rng() * 24), w: 1.6, h: 3.4, t: "cactus" });
    } else if (themed === "coast" && i % 13 === 6) {
      objs.push({ i, d: (rng() < 0.5 ? 1 : -1) * (wHalf + 8 + rng() * 18), w: 4, h: 6 + rng() * 3, t: "palm" });
    } else if (def.street && i % 7 === 3) {
      objs.push({
        i, d: (rng() < 0.5 ? 1 : -1) * (wHalf + 5 + rng() * 5),
        w: 12 + rng() * 10, h: 9 + rng() * 16, dep: 8 + rng() * 8,
        t: "bldg", v: rng(),
      });
    }
  }
  // braking boards: 150/100/50 m before big speed drops
  for (let i = 0; i < N; i++) {
    const drop = vt[i] - vt[(i + 12) % N];
    if (drop > 18 && vt[(i + N - 1) % N] - vt[i] < 1) {
      for (let b = 1; b <= 3; b++)
        objs.push({ i: (i - b * 12 + N) % N, d: wHalf + 3.2, w: 1.8, h: 2.2, t: "brkboard", n: b });
    }
  }
  const buckets = new Array(N);
  for (const o of objs) (buckets[o.i] || (buckets[o.i] = [])).push(o);

  const len = N * STEP;
  return { def, pts, N, len, wHalf, curvS, raceOff: off, vt, buckets, theme: THEMES[def.theme] };
}

function sampleAt(trk, s) {
  const N = trk.N;
  let f = s / STEP; f = ((f % N) + N) % N;
  const i = f | 0, t = f - i;
  const a = trk.pts[i], b = trk.pts[(i + 1) % N];
  const h = a.h + wrapA(b.h - a.h) * t;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h, i };
}

// ------------------------------------------------------------
// FM sound
// ------------------------------------------------------------
const SFX = {
  ac: null, master: null, eng: null, ai: null, skid: null, rumble: null, muted: false,
  init() {
    if (this.ac) return;
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    this.ac = ac;
    this.master = ac.createGain(); this.master.gain.value = 0.55;
    this.master.connect(ac.destination);
    const mkVoice = () => {
      const car = ac.createOscillator(); car.type = "sawtooth";
      const mod = ac.createOscillator(); mod.type = "sine";
      const mg = ac.createGain(); mg.gain.value = 0;
      mod.connect(mg); mg.connect(car.frequency);
      const sub = ac.createOscillator(); sub.type = "square";
      const sg = ac.createGain(); sg.gain.value = 0.35;
      sub.connect(sg);
      const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200; lp.Q.value = 1.2;
      const g = ac.createGain(); g.gain.value = 0;
      car.connect(lp); sg.connect(lp); lp.connect(g); g.connect(this.master);
      car.start(); mod.start(); sub.start();
      return { car, mod, mg, sub, g, lp };
    };
    this.eng = mkVoice();
    this.ai = mkVoice(); this.ai.car.type = "square";
    // looped noise for skid / rumble
    const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const mkNoise = (type, freq) => {
      const src = ac.createBufferSource(); src.buffer = nb; src.loop = true;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 1.4;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { g, f };
    };
    this.skid = mkNoise("bandpass", 950);
    this.rumble = mkNoise("lowpass", 130);
  },
  engine(rpm, throttle, on) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const f = 46 + (rpm / 13800) * 250;
    const v = this.eng;
    v.car.frequency.setTargetAtTime(f * 2, t, 0.02);
    v.sub.frequency.setTargetAtTime(f, t, 0.02);
    v.mod.frequency.setTargetAtTime(f * 3.02, t, 0.02);
    v.mg.gain.setTargetAtTime(f * (1.5 + throttle * 5.5), t, 0.03);
    v.lp.frequency.setTargetAtTime(900 + throttle * 2400 + rpm * 0.1, t, 0.05);
    v.g.gain.setTargetAtTime(on ? 0.10 + throttle * 0.10 : 0, t, 0.05);
  },
  aiCar(rpm, gain) {
    if (!this.ac) return;
    const t = this.ac.currentTime, f = 50 + (rpm / 13800) * 240;
    const v = this.ai;
    v.car.frequency.setTargetAtTime(f * 2.5, t, 0.03);
    v.sub.frequency.setTargetAtTime(f * 1.26, t, 0.03);
    v.mod.frequency.setTargetAtTime(f * 4.03, t, 0.03);
    v.mg.gain.setTargetAtTime(f * 3, t, 0.05);
    v.g.gain.setTargetAtTime(Math.min(gain, 0.12), t, 0.06);
  },
  setSkid(a) { if (this.ac) this.skid.g.gain.setTargetAtTime(clamp(a, 0, 0.22), this.ac.currentTime, 0.04); },
  setRumble(a) { if (this.ac) this.rumble.g.gain.setTargetAtTime(clamp(a, 0, 0.3), this.ac.currentTime, 0.05); },
  blip(freq, dur, vol, type) {
    if (!this.ac) return;
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "square"; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.12, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + (dur || 0.06));
    o.connect(g); g.connect(this.master);
    o.start(); o.stop(ac.currentTime + (dur || 0.06) + 0.02);
  },
  crash(big) {
    if (!this.ac) return;
    const ac = this.ac;
    const src = ac.createBufferSource();
    const nb = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    src.buffer = nb;
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = big ? 900 : 500;
    const g = ac.createGain(); g.gain.value = big ? 0.5 : 0.22;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    this.blip(70, 0.25, big ? 0.3 : 0.15, "sine");
  },
  shift() { this.blip(1400, 0.03, 0.05, "square"); },
  beep() { this.blip(880, 0.05, 0.08); },
  countdown(go) { this.blip(go ? 880 : 440, go ? 0.5 : 0.25, 0.16, "square"); },
};

// ------------------------------------------------------------
// Global state
// ------------------------------------------------------------
const AIDS_DEF = [
  { key: "autoBrakes", label: "AUTO BRAKES", short: "AB" },
  { key: "autoGears", label: "AUTO GEARS", short: "AG" },
  { key: "selfCorrect", label: "SELF-CORRECTING SPIN", short: "SC" },
  { key: "indestruct", label: "INDESTRUCTIBLE", short: "IN" },
  { key: "idealLine", label: "IDEAL LINE", short: "IL" },
  { key: "sugGear", label: "SUGGESTED GEAR", short: "SG" },
];

const G = {
  screen: "title",          // title | menu | race
  trackIdx: 0, driverIdx: 0,
  raceLapsMode: 1,          // 0:5 laps 1:10 laps 2:25% 3:50%
  aids: { autoBrakes: true, autoGears: true, selfCorrect: true, indestruct: true, idealLine: true, sugGear: true },
  season: null,             // {round, ptsD[], ptsT[], history[]}
  race: null,
  keys: {},
  touch: false,                                     // touch device -> on-screen controls
  touchIn: { left: false, right: false, thr: false, brk: false },
  canvas: null, ctx: null,
};

function loadState() {
  try {
    const a = JSON.parse(localStorage.getItem("vectorgp.aids.v1"));
    if (a) Object.assign(G.aids, a);
    const s = JSON.parse(localStorage.getItem("vectorgp.season.v1"));
    if (s && s.ptsD && s.ptsD.length === 26) G.season = s;
    const p = JSON.parse(localStorage.getItem("vectorgp.prefs.v1"));
    if (p) { G.driverIdx = p.driverIdx | 0; G.raceLapsMode = p.raceLapsMode | 0; }
  } catch (e) { /* fresh start */ }
}
function saveAids() { localStorage.setItem("vectorgp.aids.v1", JSON.stringify(G.aids)); }
function saveSeason() { localStorage.setItem("vectorgp.season.v1", JSON.stringify(G.season)); }
function savePrefs() { localStorage.setItem("vectorgp.prefs.v1", JSON.stringify({ driverIdx: G.driverIdx, raceLapsMode: G.raceLapsMode })); }

// ------------------------------------------------------------
// Race setup
// ------------------------------------------------------------
function raceLapCount(def) {
  return [5, 10, Math.max(3, Math.round(def.laps * 0.25)), Math.max(3, Math.round(def.laps * 0.5))][G.raceLapsMode];
}

function paceOf(di) {
  const d = VGP_DRIVERS[di], t = VGP_TEAMS[d.team];
  return t.perf * 0.62 + d.skill * 0.38;
}

function startRace(mode) {  // mode: practice | race | season
  const def = VGP_TRACKS[G.trackIdx];
  const trk = buildTrack(def);
  const laps = mode === "practice" ? 999 : raceLapCount(def);
  const playerDi = G.driverIdx;

  // qualifying simulation -> grid order (array of driver indices)
  const scores = VGP_DRIVERS.map((d, i) => ({
    i, s: (i === playerDi ? paceOf(i) * 1.001 : paceOf(i)) + (Math.random() - 0.5) * 0.012,
  }));
  scores.sort((a, b) => b.s - a.s);
  const grid = scores.map(o => o.i);

  const cars = [];
  for (let gp = 0; gp < grid.length; gp++) {
    const di = grid[gp];
    const d = VGP_DRIVERS[di], team = VGP_TEAMS[d.team];
    const row = gp >> 1, col = gp & 1;
    const s0 = trk.len - 14 - row * 9 - col * 4.5;
    const dOff = (col ? -1 : 1) * trk.wHalf * 0.42;
    const isPlayer = di === playerDi && mode !== "demo";
    const relScale = Math.pow(team.rel, laps / 55);
    const dnfLap = (!isPlayer && Math.random() > relScale) ? 1 + (Math.random() * laps) | 0 : 0;
    cars.push({
      di, team: d.team, isPlayer, gridPos: gp,
      s: s0, d: dOff, v: 0, lap: 0, prog: s0,
      pace: 0.955 + 0.070 * clamp((paceOf(di) - 0.90) / 0.10, 0, 1),
      dnfLap, retired: false, finished: false, finPos: 0, finGap: 0,
      lapStart: 0, best: null, last: null,
      launch: 0.15 + Math.random() * 0.5,
      x: 0, y: 0, h: 0, rpm: 4000,
    });
  }
  if (mode === "practice") {
    // player alone on track
    const pi = cars.findIndex(c => c.isPlayer);
    const pc = cars[pi];
    cars.length = 0; cars.push(pc);
    pc.s = trk.len - 20; pc.d = 0;
  }

  const pc = cars.find(c => c.isPlayer);
  G.race = {
    mode, trk, laps, cars, player: pc,
    phase: mode === "practice" ? "racing" : "grid",
    phaseT: 0, time: 0, wall: 0,
    lights: 0, finished: [], fastLap: { t: null, di: -1 },
    // player physical state
    px: 0, py: 0, ph: 0, pv: 0, gear: 1, rpm: 4000,
    steer: 0, thr: 0, brk: 0, damage: 0, spinT: 0, spinDir: 1,
    idx: 0, lastIdx: 0, offRoad: false, wrongWay: 0,
    camShake: 0, msg: "", msgT: 0, retireReason: "",
  };
  const R = G.race;
  const st = sampleAt(trk, pc.s);
  const nx = -Math.sin(st.h), ny = Math.cos(st.h);
  R.px = st.x + nx * pc.d; R.py = st.y + ny * pc.d; R.ph = st.h;
  R.idx = R.lastIdx = st.i;
  pc.lapStart = 0;
  if (mode === "practice") R.phase = "racing";
  G.screen = "race";
  hideMenu();
}

// ------------------------------------------------------------
// Physics — player
// ------------------------------------------------------------
const aLatMax = (v) => 9.81 * (1.65 + Math.min(0.0002 * v * v, 2.6));
const aBrkMax = (v) => 9.81 * (1.8 + Math.min(0.00022 * v * v, 2.8));
const GEAR_TOP = [22, 33, 45, 58, 72, 89]; // m/s at 13400 rpm per gear

function playerStep(dt) {
  const R = G.race, trk = R.trk, k = G.keys, aids = G.aids;
  const pc = R.player;
  if (pc.retired || pc.finished) { R.pv = Math.max(0, R.pv - 15 * dt); }

  // --- inputs (A/Z throttle/brake, ,/. steer; arrows as fallback; touch pads)
  const T = G.touchIn;
  const inL = k["Comma"] || k["ArrowLeft"] || T.left, inR = k["Period"] || k["ArrowRight"] || T.right;
  const sTgt = (inL ? -1 : 0) + (inR ? 1 : 0);
  // gentler engage + firmer self-centering so digital keys don't twitch you off line
  const sRate = sTgt !== 0 ? 2.4 : 6.5;
  R.steer += clamp(sTgt - R.steer, -sRate * dt, sRate * dt);
  let thr = ((k["KeyA"] || k["ArrowUp"] || T.thr) && !pc.finished && !pc.retired) ? 1 : 0;
  let brk = (k["KeyZ"] || k["ArrowDown"] || T.brk) ? 1 : 0;
  if (R.phase === "grid") { brk = 1; thr = 0; }

  // --- track position
  let idx = R.idx;
  for (let n = 0; n < 60; n++) { // walk to nearest sample
    const a = trk.pts[idx], b = trk.pts[(idx + 1) % trk.N];
    const fx = Math.cos(a.h), fy = Math.sin(a.h);
    const t = (R.px - a.x) * fx + (R.py - a.y) * fy;
    if (t > STEP) idx = (idx + 1) % trk.N;
    else if (t < 0) idx = (idx + trk.N - 1) % trk.N;
    else break;
  }
  R.idx = idx;
  const sm = trk.pts[idx];
  const nx = -Math.sin(sm.h), ny = Math.cos(sm.h);
  const d = (R.px - sm.x) * nx + (R.py - sm.y) * ny;
  const fwdT = (R.px - sm.x) * Math.cos(sm.h) + (R.py - sm.y) * Math.sin(sm.h);
  pc.s = idx * STEP + clamp(fwdT, 0, STEP);
  pc.d = d;

  const onRoad = Math.abs(d) < trk.wHalf + 0.7;
  const onKerb = !onRoad && Math.abs(d) < trk.wHalf + 1.9;
  R.offRoad = !onRoad && !onKerb;

  // --- aids: auto gears / auto brakes / suggested gear
  const vtHere = trk.vt[idx];
  let vAllow = 1e9;
  for (let a = 2; a < 26; a++) {
    const j = (idx + a) % trk.N;
    // speed we may carry *here* to make vt[j] after braking dist
    const dist = a * STEP;
    const vtj = trk.vt[j];
    const ok = Math.sqrt(vtj * vtj + 2 * aBrkMax(R.pv) * 0.92 * dist);
    if (ok < vAllow) vAllow = ok;
  }
  if (aids.autoBrakes && !pc.finished && R.phase === "racing") {
    if (R.pv > vAllow - 0.5) { brk = Math.max(brk, 1); thr = 0; }
  }
  R.sugGear = 1 + GEAR_TOP.findIndex(t => Math.min(vAllow, vtHere) < t * 0.97);
  if (R.sugGear <= 0) R.sugGear = 6;

  // --- engine & gears
  const gTop = GEAR_TOP[R.gear - 1];
  R.rpm = clamp(R.pv / gTop * 13400, 3200, 13800);
  if (aids.autoGears) {
    if (R.rpm > 13100 && R.gear < 6) { R.gear++; SFX.shift(); }
    else if (R.rpm < 8600 && R.gear > 1) { R.gear--; SFX.shift(); }
  }
  const rpmT = R.rpm / 13400;
  let tq = 1 - Math.pow((rpmT - 0.86), 2) * 3.2; tq = clamp(tq, 0.22, 1);
  if (R.rpm >= 13750) tq = 0;                          // limiter
  const dmgMul = 1 - R.damage * 0.0022;                // wing damage
  let acc = thr * (480000 / (540 * Math.max(R.pv, 9))) * tq * dmgMul;
  const surfGrip = R.offRoad ? 0.5 : onKerb ? 0.8 : 1;
  acc = Math.min(acc, aLatMax(R.pv) * 0.95 * surfGrip); // traction limit
  let dec = brk * aBrkMax(R.pv) * surfGrip
    + 0.00042 * R.pv * R.pv + 0.35
    + (R.offRoad ? 3.5 + R.pv * 0.09 : 0);
  R.pv = Math.max(0, R.pv + (acc - dec) * dt);

  // --- steering / grip / spins
  let yaw = 0, slideAmt = 0;
  if (R.spinT > 0) {
    R.spinT -= dt;
    yaw = R.spinDir * 4.2 * Math.min(1, R.spinT * 2);
    R.pv = Math.max(0, R.pv - 14 * dt);
    if (R.spinT <= 0 || R.pv < 5) R.spinT = 0;
  } else if (R.pv > 0.5) {
    const dMax = clamp(0.34 - R.pv * 0.0024, 0.05, 0.34);
    // steer +1 = right; positive yaw is a LEFT turn in this frame, so negate
    const yawWant = -R.pv / 3.5 * Math.tan(R.steer * dMax);
    const latNeed = Math.abs(R.pv * yawWant);
    const grip = aLatMax(R.pv) * surfGrip * dmgMul;
    if (latNeed <= grip) yaw = yawWant;
    else {
      yaw = yawWant * grip / latNeed;
      slideAmt = (latNeed - grip) / grip;
      R.pv = Math.max(0, R.pv - Math.min(9, slideAmt * 11) * dt);
      if (slideAmt > 0.55 && R.pv > 16 && !G.aids.selfCorrect) {
        R.spinT = 0.9 + Math.random() * 0.6;
        R.spinDir = Math.sign(yawWant) || 1;
        SFX.crash(false);
      }
    }
  }
  R.ph += yaw * dt;
  R.px += Math.cos(R.ph) * R.pv * dt;
  R.py += Math.sin(R.ph) * R.pv * dt;

  // --- barriers
  const bLim = trk.wHalf + (trk.def.street ? 2.8 : 13);
  if (Math.abs(d) > bLim && R.pv > 1) {
    const impact = R.pv * Math.abs(Math.sin(wrapA(R.ph - sm.h))) + 4;
    R.px = sm.x + nx * Math.sign(d) * (bLim - 0.3);
    R.py = sm.y + ny * Math.sign(d) * (bLim - 0.3);
    R.ph = sm.h + wrapA(R.ph - sm.h) * 0.3;
    R.pv *= 0.5;
    R.camShake = 0.6;
    SFX.crash(impact > 25);
    if (!G.aids.indestruct) {
      R.damage += impact * 1.6;
      if (R.damage > 100) retirePlayer("ACCIDENT DAMAGE");
    }
  }

  // --- wrong way / lap counting
  const hd = Math.abs(wrapA(R.ph - sm.h));
  R.wrongWay = (hd > Math.PI * 0.6 && R.pv > 5) ? R.wrongWay + dt : 0;
  const prev = R.lastIdx;
  if (prev > trk.N - 12 && idx < 12 && !pc.retired) {        // crossed the line
    pc.lap++;
    const lt = R.time - pc.lapStart;
    pc.lapStart = R.time;
    if (pc.lap > 1) {
      pc.last = lt;
      if (!pc.best || lt < pc.best) pc.best = lt;
      if (!R.fastLap.t || lt < R.fastLap.t) R.fastLap = { t: lt, di: pc.di };
      flashMsg("LAP " + fmtT(lt));
    }
    if (R.mode !== "practice" && pc.lap > R.laps && !pc.finished) finishCar(pc);
  } else if (idx > trk.N - 12 && prev < 12) {
    pc.lap = Math.max(0, pc.lap - 1);   // crossed backwards
  }
  R.lastIdx = idx;
  pc.prog = pc.lap * trk.len + pc.s;
  pc.v = R.pv;

  // --- feedback
  R.thr = thr; R.brk = brk;
  R.camShake = Math.max(0, R.camShake - dt * 2);
  SFX.engine(R.rpm, thr, !pc.retired);
  SFX.setSkid(slideAmt > 0.12 && R.pv > 10 ? 0.06 + slideAmt * 0.12 : 0);
  SFX.setRumble(R.offRoad && R.pv > 4 ? 0.2 : onKerb && R.pv > 10 ? 0.14 : 0);
}

function retirePlayer(reason) {
  const R = G.race;
  if (R.player.retired) return;
  R.player.retired = true;
  R.retireReason = reason;
  SFX.crash(true);
  setTimeout(() => { if (G.race === R) endRace(); }, 2200);
}

function finishCar(c) {
  const R = G.race;
  c.finished = true;
  c.finPos = R.finished.length + 1;
  c.finTime = R.time;
  R.finished.push(c);
  if (c.isPlayer) {
    flashMsg(c.finPos === 1 ? "*** YOU WIN! ***" : "FINISHED  P" + c.finPos);
    setTimeout(() => { if (G.race === R) endRace(); }, 2600);
  }
}

function flashMsg(m) { G.race.msg = m; G.race.msgT = 2.6; }

// ------------------------------------------------------------
// Physics — AI
// ------------------------------------------------------------
function aiStep(dt) {
  const R = G.race, trk = R.trk;
  const cars = R.cars;
  // order by progress for overtaking checks
  const order = cars.filter(c => !c.retired).sort((a, b) => b.prog - a.prog);

  for (const c of cars) {
    if (c.isPlayer || c.retired) continue;
    if (c.dnfLap && c.lap >= c.dnfLap && !c.finished) {
      // pull off and stop
      c.v = Math.max(0, c.v - 12 * dt);
      c.d += clamp((trk.wHalf + 3) - c.d, -3 * dt, 3 * dt);
      if (c.v < 0.5) c.retired = true;
      continue;
    }
    const idx = ((c.s / STEP) | 0) % trk.N;
    let vt = 1e9;
    for (let a = 1; a < 24; a++) {
      const j = (idx + a) % trk.N;
      const ok = Math.sqrt(trk.vt[j] ** 2 + 2 * aBrkMax(c.v) * 0.9 * a * STEP);
      if (ok < vt) vt = ok;
    }
    vt = Math.min(vt, trk.vt[idx]);
    vt *= c.pace * (R.phase === "grid" ? 0 : 1);
    if (c.finished) vt = Math.min(vt, 38);

    // traffic
    let dTgt = trk.raceOff[idx];
    for (const o of order) {
      if (o === c) continue;
      let ds = o.prog - c.prog;
      if (ds < 2 || ds > 30) continue;
      const dd = o.d - c.d;
      if (Math.abs(dd) > 2.4) continue;
      if (c.v > o.v - 2) {
        // try to pass: pick freer side
        dTgt = o.d > 0 ? Math.max(-trk.wHalf + 1.4, o.d - 3.2) : Math.min(trk.wHalf - 1.4, o.d + 3.2);
        if (ds < 7) vt = Math.min(vt, o.v + (ds - 4) * 1.5);
      }
    }
    // launch delay at start
    if (R.phase === "go" && R.phaseT < c.launch) vt = 0;

    const aAcc = clamp(420000 / (540 * Math.max(c.v, 10)), 2.5, 12);
    if (c.v < vt) c.v = Math.min(vt, c.v + aAcc * dt);
    else c.v = Math.max(vt, c.v - aBrkMax(c.v) * 0.92 * dt);

    c.d += clamp(dTgt - c.d, -1, 1) * Math.min(5, 1 + c.v * 0.06) * dt;
    c.d = clamp(c.d, -trk.wHalf + 1.1, trk.wHalf - 1.1);

    const prevS = c.s;
    c.s += c.v * dt;
    if (c.s >= trk.len) {
      c.s -= trk.len; c.lap++;
      const lt = R.time - c.lapStart; c.lapStart = R.time;
      if (c.lap > 1 && lt > 20 && (!R.fastLap.t || lt < R.fastLap.t)) R.fastLap = { t: lt, di: c.di };
      if (!c.best || (lt > 20 && lt < c.best)) c.best = lt;
      if (c.lap > R.laps && !c.finished) finishCar(c);
    }
    c.prog = c.lap * trk.len + c.s;

    // world position
    const sm = sampleAt(trk, c.s);
    const nx2 = -Math.sin(sm.h), ny2 = Math.cos(sm.h);
    c.x = sm.x + nx2 * c.d; c.y = sm.y + ny2 * c.d;
    c.h = sm.h;
    c.rpm = 4000 + (c.v / 89) * 9500;
  }

  // AI <-> player contact — positional separation so you can't drive through.
  // Work in the track-local frame at the player: ds along the track (+ = AI
  // ahead), dd across it (+ = AI to the player's left). Overlap when both the
  // longitudinal and lateral gaps are inside a car box; resolve along whichever
  // axis has the least penetration, shoving BOTH cars (not just the AI).
  const pc = R.player;
  const sm = trk.pts[R.idx];
  const fwx = Math.cos(sm.h), fwy = Math.sin(sm.h);   // track forward
  const nrx = -Math.sin(sm.h), nry = Math.cos(sm.h);  // track normal (+d dir)
  if (!pc.retired && !pc.finished) for (const c of cars) {
    if (c.isPlayer || c.retired) continue;
    let ds = c.prog - pc.prog;
    ds = ((ds % trk.len) + trk.len) % trk.len;
    if (ds > trk.len / 2) ds -= trk.len;
    const dd = c.d - pc.d;
    const penT = CAR_L - Math.abs(ds);      // longitudinal overlap
    const penL = CAR_W - Math.abs(dd);      // lateral overlap
    if (penT <= 0 || penL <= 0) continue;   // boxes clear
    const rel = Math.abs(R.pv - c.v);

    if (penL < penT) {
      // side-by-side rub: separate across the track, share the correction
      const dir = dd >= 0 ? 1 : -1;         // push AI toward +d, player toward -d
      const sep = penL + 0.04;
      c.d = clamp(c.d + dir * sep * 0.55, -trk.wHalf + 1.0, trk.wHalf - 1.0);
      R.px -= nrx * dir * sep * 0.45;
      R.py -= nry * dir * sep * 0.45;
      R.pv *= 0.985; c.v *= 0.99;           // a touch of scrub
    } else if (ds >= 0) {
      // player nose into AI tail: shove player back, AI forward, match speeds
      R.px -= fwx * penT * 0.5; R.py -= fwy * penT * 0.5;
      c.s += penT * 0.5;
      if (R.pv > c.v) { const m = (R.pv + c.v) * 0.5; R.pv = m * 0.9; c.v = Math.max(c.v, m); }
    } else {
      // AI nose into player tail: shove AI back, player forward
      c.s -= penT * 0.5;
      R.px += fwx * penT * 0.5; R.py += fwy * penT * 0.5;
      if (c.v > R.pv) { const m = (R.pv + c.v) * 0.5; c.v = m * 0.9; R.pv = Math.max(R.pv, m); }
    }

    // re-derive the AI car's world position after being shoved
    const sm2 = sampleAt(trk, ((c.s % trk.len) + trk.len) % trk.len);
    c.s = ((c.s % trk.len) + trk.len) % trk.len;
    c.d = clamp(c.d, -trk.wHalf + 1.0, trk.wHalf - 1.0);
    c.x = sm2.x + (-Math.sin(sm2.h)) * c.d; c.y = sm2.y + Math.cos(sm2.h) * c.d;
    c.h = sm2.h; c.prog = c.lap * trk.len + c.s;

    if (rel > 6) {
      SFX.crash(rel > 18);
      R.camShake = Math.min(0.6, 0.2 + rel * 0.02);
      if (!G.aids.indestruct) {
        R.damage += rel * 1.1;
        if (R.damage > 100) retirePlayer("COLLISION");
      }
    }
  }

  // engine sound of nearest AI car
  let nd = 1e9, nc = null;
  for (const c of cars) {
    if (c.isPlayer || c.retired) continue;
    const dx = c.x - R.px, dy = c.y - R.py, dist = dx * dx + dy * dy;
    if (dist < nd) { nd = dist; nc = c; }
  }
  if (nc && nd < 3600) SFX.aiCar(nc.rpm, 3.5 / (1 + Math.sqrt(nd)));
  else SFX.aiCar(5000, 0);
}

// positions: 1-based place of player
function racePositions() {
  const R = G.race;
  const list = R.cars.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finPos - b.finPos;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    return b.prog - a.prog;
  });
  return list;
}

// ------------------------------------------------------------
// Race end & championship
// ------------------------------------------------------------
function endRace() {
  const R = G.race;
  if (!R || R.phase === "over") return;
  R.phase = "over";
  R.paused = true;
  raceSoundsOff();
  const order = racePositions();
  // classify: everyone gets a place; synth gaps
  const results = order.map((c, i) => ({
    di: c.di, pos: i + 1,
    retired: c.retired || (c.dnfLap && c.lap >= c.dnfLap && !c.finished),
    laps: Math.min(c.lap, R.laps),
    best: c.best,
    gap: c.finished ? (c.finTime - (order[0].finTime || R.time)) :
      (order[0].prog - c.prog) / Math.max(c.v, 40),
  }));
  R.results = results;
  if (R.mode === "season" && G.season) {
    const s = G.season;
    results.forEach(r => {
      if (!r.retired && r.pos <= 6) {
        s.ptsD[r.di] += POINTS[r.pos - 1];
        s.ptsT[VGP_DRIVERS[r.di].team] += POINTS[r.pos - 1];
      }
    });
    s.history.push({
      round: s.round, trackIdx: G.trackIdx,
      top3: results.slice(0, 3).map(r => r.di),
      playerPos: results.find(r => r.di === G.driverIdx).pos,
      playerRet: results.find(r => r.di === G.driverIdx).retired,
    });
    s.round++;
    saveSeason();
  }
  showResults();
}

function newSeason() {
  G.season = { round: 0, ptsD: new Array(26).fill(0), ptsT: new Array(13).fill(0), history: [] };
  saveSeason();
}

// ------------------------------------------------------------
// Rendering
// ------------------------------------------------------------
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * f, 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) * f, 0, 255) | 0;
  const b = clamp((n & 255) * f, 0, 255) | 0;
  return "rgb(" + r + "," + g + "," + b + ")";
}

// clip camera-space polygon [x, z, y(height)] against z >= NEAR, project, fill
function fillPoly3(ctx, verts, color, horizonY) {
  let out = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const ain = a[1] >= NEAR, bin = b[1] >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, NEAR, a[2] + (b[2] - a[2]) * t]);
    }
  }
  if (out.length < 3) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    const sx = W / 2 + FOCAL * p[0] / p[1];
    const sy = horizonY + FOCAL * (1.1 - p[2]) / p[1];
    if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.fill();
}

// camera transform helpers set per-frame
let camX = 0, camY = 0, camSin = 0, camCos = 1;
function toCam(px, py, pz) {
  const dx = px - camX, dy = py - camY;
  return [dx * camSin - dy * camCos, dx * camCos + dy * camSin, pz || 0];
}
// NOTE: with fwd=(cos h, sin h), right=(sin h, -cos h):
//   xc = dx*sin - dy*cos ; zc = dx*cos + dy*sin

// ---- lit-face pipeline: world-space quads with normal-based shading,
// painter-sorted per object, so boxes read as genuinely 3D solids.
const L_DIR = (() => {
  const v = [0.42, 0.30, 0.855];
  const m = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / m, v[1] / m, v[2] / m];
})();

// faces: {v:[[wx,wy,wz],...], col:"#hex", br?:mult} or {v, flat:"cssColor"}
function drawFacesLit(ctx, faces, horizonY, fog) {
  const out = [];
  for (const f of faces) {
    const cv = [];
    let zsum = 0, behind = 0;
    for (const p of f.v) {
      const c = toCam(p[0], p[1], p[2]);
      cv.push(c); zsum += c[1];
      if (c[1] < NEAR) behind++;
    }
    if (behind === f.v.length) continue;
    let col;
    if (f.flat) col = f.flat;
    else {
      const [a, b, c2] = f.v;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const wx = c2[0] - a[0], wy = c2[1] - a[1], wz = c2[2] - a[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const m = Math.hypot(nx, ny, nz) || 1;
      const d = Math.abs((nx * L_DIR[0] + ny * L_DIR[1] + nz * L_DIR[2]) / m);
      col = shade(f.col, (0.52 + 0.48 * d) * (f.br || 1) * fog);
    }
    out.push({ cv, z: zsum / f.v.length, col });
  }
  out.sort((p, q) => q.z - p.z);
  for (const f of out) fillPoly3(ctx, f.cv, f.col, horizonY);
}

// axis-aligned-to-`ang` box: 4 walls + roof
function boxFaces(faces, cx, cy, ang, halfAlong, halfAcross, y0, y1, col, br) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const cr = [[+halfAlong, +halfAcross], [+halfAlong, -halfAcross],
              [-halfAlong, -halfAcross], [-halfAlong, +halfAcross]]
    .map(p => [cx + ca * p[0] - sa * p[1], cy + sa * p[0] + ca * p[1]]);
  for (let i = 0; i < 4; i++) {
    const a = cr[i], b = cr[(i + 1) % 4];
    faces.push({ v: [[a[0], a[1], y0], [b[0], b[1], y0], [b[0], b[1], y1], [a[0], a[1], y1]], col, br });
  }
  faces.push({ v: cr.map(p => [p[0], p[1], y1]), col, br: (br || 1) * 1.1 });
}

// draw one AI car as a closed flat-shaded polygon model
function drawCar(ctx, c, horizonY, fog) {
  const dcx = c.x - camX, dcy = c.y - camY;
  if (dcx * dcx + dcy * dcy < 5) return;   // overlapping the camera
  const [colA, colB, colD] = VGP_TEAMS[c.team].colors;
  const ch = Math.cos(c.h), sh = Math.sin(c.h);
  // car-local: lx right, lz forward, ly up; right vec = (sin h, -cos h)
  const Pw = (lx, lz, ly) => [c.x + ch * lz + sh * lx, c.y + sh * lz - ch * lx, ly];
  // ground shadow first — everything else sits on top of it
  fillPoly3(ctx, [
    toCam(...Pw(-1.12, 2.5, 0.02)), toCam(...Pw(1.12, 2.5, 0.02)),
    toCam(...Pw(1.12, -2.4, 0.02)), toCam(...Pw(-1.12, -2.4, 0.02)),
  ], "rgba(0,0,0,0.30)", horizonY);

  const faces = [];
  const q = (col, br, ...pts) => faces.push({ v: pts.map(p => Pw(p[0], p[1], p[2])), col, br });

  // tub / floor box
  q(colA, 1.0, [-0.72, 1.0, 0.46], [0.72, 1.0, 0.46], [0.72, -1.8, 0.46], [-0.72, -1.8, 0.46]);
  q(colA, 0.9, [-0.72, 1.0, 0.12], [-0.72, -1.8, 0.12], [-0.72, -1.8, 0.46], [-0.72, 1.0, 0.46]);
  q(colA, 0.9, [0.72, 1.0, 0.12], [0.72, -1.8, 0.12], [0.72, -1.8, 0.46], [0.72, 1.0, 0.46]);
  q(colD, 0.8, [-0.72, -1.8, 0.12], [0.72, -1.8, 0.12], [0.72, -1.8, 0.46], [-0.72, -1.8, 0.46]);
  // nose (tapered box)
  q(colA, 1.05, [-0.45, 1.0, 0.50], [0.45, 1.0, 0.50], [0.26, 2.45, 0.40], [-0.26, 2.45, 0.40]);
  q(colA, 0.9, [-0.45, 1.0, 0.15], [-0.45, 1.0, 0.50], [-0.26, 2.45, 0.40], [-0.26, 2.45, 0.18]);
  q(colA, 0.9, [0.45, 1.0, 0.15], [0.45, 1.0, 0.50], [0.26, 2.45, 0.40], [0.26, 2.45, 0.18]);
  q(colB, 1.0, [-0.26, 2.45, 0.18], [0.26, 2.45, 0.18], [0.26, 2.45, 0.40], [-0.26, 2.45, 0.40]);
  // front wing + endplates
  q(colB, 1.0, [-1.02, 2.72, 0.20], [1.02, 2.72, 0.20], [1.02, 2.25, 0.20], [-1.02, 2.25, 0.20]);
  q(colB, 0.85, [-1.02, 2.72, 0.10], [1.02, 2.72, 0.10], [1.02, 2.72, 0.20], [-1.02, 2.72, 0.20]);
  q(colD, 0.9, [-1.02, 2.20, 0.06], [-1.02, 2.80, 0.06], [-1.02, 2.80, 0.35], [-1.02, 2.20, 0.35]);
  q(colD, 0.9, [1.02, 2.20, 0.06], [1.02, 2.80, 0.06], [1.02, 2.80, 0.35], [1.02, 2.20, 0.35]);
  // sidepods
  for (const s of [-1, 1]) {
    q(colA, 1.0, [s * 0.72, 0.5, 0.52], [s * 1.0, 0.5, 0.52], [s * 1.0, -1.6, 0.52], [s * 0.72, -1.6, 0.52]);
    q(colA, 0.9, [s * 1.0, 0.5, 0.12], [s * 1.0, -1.6, 0.12], [s * 1.0, -1.6, 0.52], [s * 1.0, 0.5, 0.52]);
    q(colD, 0.7, [s * 0.72, 0.5, 0.12], [s * 1.0, 0.5, 0.12], [s * 1.0, 0.5, 0.52], [s * 0.72, 0.5, 0.52]);
  }
  // cockpit hump + screen
  q(colA, 1.0, [-0.36, 0.75, 0.46], [0.36, 0.75, 0.46], [0.30, 0.35, 0.85], [-0.30, 0.35, 0.85]);
  q(colA, 1.05, [-0.30, 0.35, 0.85], [0.30, 0.35, 0.85], [0.30, -0.5, 0.85], [-0.30, -0.5, 0.85]);
  q(colA, 0.85, [-0.36, 0.75, 0.46], [-0.30, 0.35, 0.85], [-0.30, -0.5, 0.85], [-0.36, -0.5, 0.46]);
  q(colA, 0.85, [0.36, 0.75, 0.46], [0.30, 0.35, 0.85], [0.30, -0.5, 0.85], [0.36, -0.5, 0.46]);
  // helmet
  q(colD, 1.1, [-0.17, 0.62, 0.80], [0.17, 0.62, 0.80], [0.17, 0.28, 1.02], [-0.17, 0.28, 1.02]);
  q(colD, 0.9, [-0.17, 0.62, 0.80], [-0.17, 0.28, 1.02], [-0.17, 0.14, 0.85], [-0.17, 0.42, 0.72]);
  q(colD, 0.9, [0.17, 0.62, 0.80], [0.17, 0.28, 1.02], [0.17, 0.14, 0.85], [0.17, 0.42, 0.72]);
  // engine cover taper
  q(colB, 1.0, [-0.30, -0.5, 0.85], [0.30, -0.5, 0.85], [0.14, -1.78, 0.50], [-0.14, -1.78, 0.50]);
  q(colB, 0.85, [-0.30, -0.5, 0.85], [-0.14, -1.78, 0.50], [-0.14, -1.78, 0.46], [-0.30, -0.5, 0.46]);
  q(colB, 0.85, [0.30, -0.5, 0.85], [0.14, -1.78, 0.50], [0.14, -1.78, 0.46], [0.30, -0.5, 0.46]);
  // rear wing: two elements + endplates
  q(colB, 1.05, [-0.88, -2.02, 0.78], [0.88, -2.02, 0.78], [0.88, -2.30, 0.78], [-0.88, -2.30, 0.78]);
  q(colB, 0.8, [-0.88, -2.30, 0.70], [0.88, -2.30, 0.70], [0.88, -2.30, 0.78], [-0.88, -2.30, 0.78]);
  q(colB, 0.8, [-0.88, -2.02, 0.70], [0.88, -2.02, 0.70], [0.88, -2.02, 0.78], [-0.88, -2.02, 0.78]);
  q(colB, 0.95, [-0.88, -2.00, 0.42], [0.88, -2.00, 0.42], [0.88, -2.20, 0.38], [-0.88, -2.20, 0.38]);
  q(colD, 0.9, [-0.88, -1.90, 0.28], [-0.88, -2.35, 0.28], [-0.88, -2.35, 0.88], [-0.88, -1.90, 0.88]);
  q(colD, 0.9, [0.88, -1.90, 0.28], [0.88, -2.35, 0.28], [0.88, -2.35, 0.88], [0.88, -1.90, 0.88]);
  // gearbox block
  q("#26262a", 1.0, [-0.28, -1.8, 0.50], [0.28, -1.8, 0.50], [0.28, -2.1, 0.42], [-0.28, -2.1, 0.42]);
  q("#26262a", 0.8, [-0.28, -2.1, 0.10], [0.28, -2.1, 0.10], [0.28, -2.1, 0.42], [-0.28, -2.1, 0.42]);
  // wheels: round cylinders (tread band + sidewall discs + rolling hub)
  const NW = 11;                          // rim segments
  const roll = (c.s || 0);                // distance travelled -> spin angle
  for (const [wc, wz, r, w2] of [
    [0.97, -1.55, 0.36, 0.20], [-0.97, -1.55, 0.36, 0.20],
    [0.92, 1.55, 0.32, 0.16], [-0.92, 1.55, 0.32, 0.16],
  ]) {
    const cy = r + 0.02;                   // hub centre height (tyre on the deck)
    const a0 = roll / r;                   // rolling phase for this wheel size
    const outX = wc > 0 ? wc + w2 : wc - w2;   // side facing away from the tub
    const inX = wc > 0 ? wc - w2 : wc + w2;
    const rim = [];
    for (let k = 0; k < NW; k++) {
      const a = a0 + k / NW * TAU;
      rim.push([wz + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    // tread band — one quad per segment (normal-lit, depth-sorted)
    for (let k = 0; k < NW; k++) {
      const p = rim[k], n = rim[(k + 1) % NW];
      q("#1b1b1d", 1.0, [outX, p[0], p[1]], [outX, n[0], n[1]], [inX, n[0], n[1]], [inX, p[0], p[1]]);
    }
    // sidewall discs (N-gon faces)
    q("#242429", 1.0, ...rim.map(p => [outX, p[0], p[1]]));
    q("#141416", 0.85, ...rim.map(p => [inX, p[0], p[1]]));
    // hub cap + a spoke, on the outer face, rotating with the wheel
    const hx = outX + (wc > 0 ? 0.03 : -0.03);
    const hR = r * 0.4, hub = [];
    for (let k = 0; k < NW; k++) {
      const a = a0 + k / NW * TAU;
      hub.push([hx, wz + Math.cos(a) * hR, cy + Math.sin(a) * hR]);
    }
    q("#54545e", 1.25, ...hub);
    const sx = hx + (wc > 0 ? 0.02 : -0.02);
    q("#2c2c33", 1.1,
      [sx, wz + Math.cos(a0 + 1.7) * r * 0.86, cy + Math.sin(a0 + 1.7) * r * 0.86],
      [sx, wz + Math.cos(a0 + 1.7 + 0.12) * hR * 0.4, cy + Math.sin(a0 + 1.7 + 0.12) * hR * 0.4],
      [sx, wz + Math.cos(a0 + 1.7 - 0.12) * hR * 0.4, cy + Math.sin(a0 + 1.7 - 0.12) * hR * 0.4]);
  }
  drawFacesLit(ctx, faces, horizonY, fog);
}

function drawObject(ctx, o, trk, horizonY, fog) {
  const sm = trk.pts[o.i];
  const nx = -Math.sin(sm.h), ny = Math.cos(sm.h);
  const bx = sm.x + nx * o.d, by = sm.y + ny * o.d;
  const fx = Math.cos(sm.h), fy = Math.sin(sm.h);
  const hw = o.w / 2;
  const faces = [];
  // flat panel spanning along the road direction (for boards etc.)
  const panel = (col, br, l0, l1, z0, z1, off) => {
    const ox = nx * (off || 0), oy = ny * (off || 0);
    faces.push({
      v: [[bx + fx * l0 + ox, by + fy * l0 + oy, z0], [bx + fx * l1 + ox, by + fy * l1 + oy, z0],
          [bx + fx * l1 + ox, by + fy * l1 + oy, z1], [bx + fx * l0 + ox, by + fy * l0 + oy, z1]],
      col, br,
    });
  };
  const toRoad = -Math.sign(o.d);   // unit factor: offsets toward the track

  if (o.t === "tree" || o.t === "palm") {
    // crossed billboards -> reads as a volume from every angle
    const leaf = o.t === "palm" ? "#4a8a3a" : "#2e6e2e";
    const trunk = "#5a4028";
    panel(trunk, 1, -0.22, 0.22, 0, o.h * 0.45);
    faces.push({
      v: [[bx + nx * -0.22, by + ny * -0.22, 0], [bx + nx * 0.22, by + ny * 0.22, 0],
          [bx + nx * 0.22, by + ny * 0.22, o.h * 0.45], [bx + nx * -0.22, by + ny * -0.22, o.h * 0.45]],
      col: trunk, br: 0.85,
    });
    panel(leaf, 1, -hw, hw, o.h * 0.32, o.h);
    faces.push({
      v: [[bx + nx * -hw, by + ny * -hw, o.h * 0.32], [bx + nx * hw, by + ny * hw, o.h * 0.32],
          [bx + nx * hw * 0.4, by + ny * hw * 0.4, o.h], [bx + nx * -hw * 0.4, by + ny * -hw * 0.4, o.h]],
      col: leaf, br: 0.85,
    });
  } else if (o.t === "cactus") {
    panel("#4a7a3a", 1, -0.3, 0.3, 0, o.h);
    panel("#4a7a3a", 0.9, -hw, hw, o.h * 0.45, o.h * 0.62);
  } else if (o.t === "stand") {
    const dep = 9, cx2 = bx + nx * toRoad * -dep / 2, cy2 = by + ny * toRoad * -dep / 2;
    boxFaces(faces, cx2, cy2, sm.h, hw, dep / 2, 0, o.h, "#6e6e7c", 1);
    // crowd stripes on the facade toward the track
    const fx2 = bx + nx * toRoad * 0.06, fy2 = by + ny * toRoad * 0.06;
    for (const [z0, z1, col] of [
      [o.h * 0.22, o.h * 0.90, "#34344a"],
      [o.h * 0.28, o.h * 0.40, "#c05050"], [o.h * 0.48, o.h * 0.60, "#5060c0"], [o.h * 0.68, o.h * 0.80, "#c0b050"],
    ]) {
      faces.push({
        v: [[fx2 + fx * -hw * 0.96, fy2 + fy * -hw * 0.96, z0], [fx2 + fx * hw * 0.96, fy2 + fy * hw * 0.96, z0],
            [fx2 + fx * hw * 0.96, fy2 + fy * hw * 0.96, z1], [fx2 + fx * -hw * 0.96, fy2 + fy * -hw * 0.96, z1]],
        col, br: 1,
      });
    }
    // white roof slab with overhang
    boxFaces(faces, cx2 + nx * toRoad * 1.2, cy2 + ny * toRoad * 1.2, sm.h, hw + 0.8, dep / 2 + 1.2, o.h, o.h + 0.6, "#e0e0e4", 1.05);
  } else if (o.t === "board") {
    const cols = [["#d02020", "#e8e8e8"], ["#2040c0", "#e8d020"], ["#108040", "#e8e8e8"], ["#e8e8e8", "#202020"]];
    const [c1, c2] = cols[o.n % 4];
    panel("#888888", 1, -hw * 0.9, -hw * 0.7, 0, 1.2);
    panel("#888888", 1, hw * 0.7, hw * 0.9, 0, 1.2);
    panel(c1, 1, -hw, hw, 1.2, 1.2 + o.h);
    panel(c2, 1, -hw * 0.8, hw * 0.8, 1.2 + o.h * 0.3, 1.2 + o.h * 0.7, toRoad * 0.04);
  } else if (o.t === "brkboard") {
    panel("#e8e8e8", 1, -hw, hw, 0.4, 0.4 + o.h);
    for (let s = 0; s < o.n; s++)
      panel("#d02020", 1, -hw * 0.7, hw * 0.7, 0.7 + s * 0.55, 0.95 + s * 0.55, toRoad * 0.04);
  } else if (o.t === "bldg") {
    const base = o.v < 0.33 ? "#9a8a7a" : o.v < 0.66 ? "#8a929a" : "#a29a8a";
    const dep = o.dep || 11;
    // box centre sits away from the road so the facade lands at o.d
    const cx2 = bx + nx * toRoad * -dep / 2, cy2 = by + ny * toRoad * -dep / 2;
    boxFaces(faces, cx2, cy2, sm.h, hw, dep / 2, 0, o.h, base, 1);
    // window bands on the road-facing facade
    const wx2 = bx + nx * toRoad * 0.06, wy2 = by + ny * toRoad * 0.06;
    for (let fl = 1.6; fl < o.h - 1.2; fl += 2.7) {
      faces.push({
        v: [[wx2 + fx * -hw * 0.92, wy2 + fy * -hw * 0.92, fl], [wx2 + fx * hw * 0.92, wy2 + fy * hw * 0.92, fl],
            [wx2 + fx * hw * 0.92, wy2 + fy * hw * 0.92, fl + 1.15], [wx2 + fx * -hw * 0.92, wy2 + fy * -hw * 0.92, fl + 1.15]],
        col: "#46526a", br: 1,
      });
    }
    // rooftop plant box for the taller blocks
    if (o.h > 16) boxFaces(faces, cx2, cy2, sm.h, hw * 0.3, dep * 0.2, o.h, o.h + 2.2, "#787064", 0.9);
  }
  drawFacesLit(ctx, faces, horizonY, fog);
}

function renderRace() {
  const R = G.race, trk = R.trk, ctx = G.ctx, th = trk.theme;
  const shake = R.camShake > 0 ? (Math.random() - 0.5) * R.camShake * 6 : 0;
  const horizonY = H * 0.40 + shake;

  // camera slightly behind the driver's eye
  camX = R.px - Math.cos(R.ph) * 0.5;
  camY = R.py - Math.sin(R.ph) * 0.5;
  camSin = Math.sin(R.ph); camCos = Math.cos(R.ph);

  // --- sky
  const sk = th.sky;
  ctx.fillStyle = sk[0]; ctx.fillRect(0, 0, W, horizonY * 0.4);
  ctx.fillStyle = sk[1]; ctx.fillRect(0, horizonY * 0.4, W, horizonY * 0.35);
  ctx.fillStyle = sk[2]; ctx.fillRect(0, horizonY * 0.75, W, horizonY * 0.25 + 1);
  // horizon silhouettes (parallax by heading)
  const hoff = ((-R.ph / TAU) * W * 3 % W + W) % W;
  ctx.fillStyle = th.horFar;
  for (let i = -1; i < 4; i++) {
    const bx = ((i * 260 + hoff * 0.6) % (W + 260)) - 130;
    ctx.beginPath();
    ctx.moveTo(bx, horizonY); ctx.lineTo(bx + 90, horizonY - 16); ctx.lineTo(bx + 200, horizonY);
    ctx.fill();
  }
  ctx.fillStyle = th.hor;
  for (let i = -1; i < 5; i++) {
    const bx = ((i * 200 + hoff) % (W + 200)) - 100;
    ctx.beginPath();
    ctx.moveTo(bx, horizonY); ctx.lineTo(bx + 70, horizonY - 9); ctx.lineTo(bx + 150, horizonY);
    ctx.fill();
  }
  // --- ground
  ctx.fillStyle = th.grass; ctx.fillRect(0, horizonY, W, H - horizonY);

  // --- road & world, far to near
  const baseI = R.idx;
  const N = trk.N;
  const fogCol = th.horFar;
  // cars bucketed by sample index offset
  const carBuckets = {};
  for (const c of R.cars) {
    if (c.isPlayer || (c.retired && !c.dnfLap)) continue;
    if (c.retired && c.v < 0.5 && R.time - (c.retiredAt || (c.retiredAt = R.time)) > 12) continue;
    const ci = ((c.s / STEP) | 0) % N;
    let diff = (ci - baseI + N) % N;
    if (diff < DRAW_AHEAD) (carBuckets[diff] || (carBuckets[diff] = [])).push(c);
  }

  for (let a = DRAW_AHEAD; a >= -2; a--) {
    const i = (baseI + a + N) % N;
    const j = (i + 1) % N;
    const A = trk.pts[i], B = trk.pts[j];
    const nAx = -Math.sin(A.h), nAy = Math.cos(A.h);
    const nBx = -Math.sin(B.h), nBy = Math.cos(B.h);
    const wh = trk.wHalf;
    const fog = a > DRAW_AHEAD - 30 ? (DRAW_AHEAD - a) / 30 : 1;

    // verge strip (lighter grass band next to road)
    const vw = wh + 2.2;
    fillPoly3(ctx, [
      toCam(A.x + nAx * vw, A.y + nAy * vw), toCam(B.x + nBx * vw, B.y + nBy * vw),
      toCam(B.x - nBx * vw, B.y - nBy * vw), toCam(A.x - nAx * vw, A.y - nAy * vw),
    ], (i & 2) ? th.grass2 : th.grass, horizonY);

    // kerbs on corners
    if (Math.abs(trk.curvS[i]) > 1 / 130) {
      const kw = wh + 1.3;
      const kc = (i & 1) ? "#d03030" : "#e8e8e8";
      const inside = trk.curvS[i] > 0 ? 1 : -1; // left turn -> kerb both sides anyway
      fillPoly3(ctx, [
        toCam(A.x + nAx * kw, A.y + nAy * kw), toCam(B.x + nBx * kw, B.y + nBy * kw),
        toCam(B.x + nBx * wh, B.y + nBy * wh), toCam(A.x + nAx * wh, A.y + nAy * wh),
      ], kc, horizonY);
      fillPoly3(ctx, [
        toCam(A.x - nAx * kw, A.y - nAy * kw), toCam(B.x - nBx * kw, B.y - nBy * kw),
        toCam(B.x - nBx * wh, B.y - nBy * wh), toCam(A.x - nAx * wh, A.y - nAy * wh),
      ], kc, horizonY);
    }

    // road surface — alternating shades = the "texture"
    const g = 82 + ((i & 2) ? 6 : 0) + (((i * 7) % 5) - 2);
    let road = "rgb(" + g + "," + g + "," + (g + 4) + ")";
    fillPoly3(ctx, [
      toCam(A.x + nAx * wh, A.y + nAy * wh), toCam(B.x + nBx * wh, B.y + nBy * wh),
      toCam(B.x - nBx * wh, B.y - nBy * wh), toCam(A.x - nAx * wh, A.y - nAy * wh),
    ], road, horizonY);

    // edge lines
    for (const s of [1, -1]) {
      fillPoly3(ctx, [
        toCam(A.x + nAx * s * wh, A.y + nAy * s * wh), toCam(B.x + nBx * s * wh, B.y + nBy * s * wh),
        toCam(B.x + nBx * s * (wh - 0.35), B.y + nBy * s * (wh - 0.35)), toCam(A.x + nAx * s * (wh - 0.35), A.y + nAy * s * (wh - 0.35)),
      ], "#d8d8d8", horizonY);
    }
    // start/finish checker band
    if (i < 2) {
      for (let cxi = 0; cxi < 8; cxi++) {
        const d0 = -wh + (cxi / 8) * wh * 2, d1 = d0 + wh / 4;
        fillPoly3(ctx, [
          toCam(A.x + nAx * d0, A.y + nAy * d0), toCam(B.x + nBx * d0, B.y + nBy * d0),
          toCam(B.x + nBx * d1, B.y + nBy * d1), toCam(A.x + nAx * d1, A.y + nAy * d1),
        ], ((cxi + i) & 1) ? "#e8e8e8" : "#202020", horizonY);
      }
    }
    // ideal-line aid
    if (G.aids.idealLine && (i & 1) === 0 && a >= 0) {
      const ro = trk.raceOff[i], ro2 = trk.raceOff[j];
      const braking = trk.vt[(i + 10) % N] < trk.vt[i] - 2;
      fillPoly3(ctx, [
        toCam(A.x + nAx * (ro - 0.25), A.y + nAy * (ro - 0.25)), toCam(B.x + nBx * (ro2 - 0.25), B.y + nBy * (ro2 - 0.25)),
        toCam(B.x + nBx * (ro2 + 0.25), B.y + nBy * (ro2 + 0.25)), toCam(A.x + nAx * (ro + 0.25), A.y + nAy * (ro + 0.25)),
      ], braking ? "#e04040" : "#40d060", horizonY);
    }
    // street walls
    if (trk.def.street) {
      const wd = wh + 2.8;
      for (const s of [1, -1]) {
        const c1 = toCam(A.x + nAx * s * wd, A.y + nAy * s * wd, 0);
        const c2 = toCam(B.x + nBx * s * wd, B.y + nBy * s * wd, 0);
        fillPoly3(ctx, [c1, c2, [c2[0], c2[1], 1.0], [c1[0], c1[1], 1.0]],
          shade((i & 2) ? "#9a9aa2" : "#90909a", fog), horizonY);
        if (Math.abs(trk.curvS[i]) > 1 / 130)
          fillPoly3(ctx, [[c1[0], c1[1], 1.0], [c2[0], c2[1], 1.0], [c2[0], c2[1], 1.25], [c1[0], c1[1], 1.25]],
            (i & 1) ? "#d03030" : "#e8e8e8", horizonY);
      }
    }
    // scenery
    if (trk.buckets[i]) for (const o of trk.buckets[i]) drawObject(ctx, o, trk, horizonY, fog);
    // cars at this depth
    if (carBuckets[a]) for (const c of carBuckets[a]) drawCar(ctx, c, horizonY, fog);
  }

  // fog band at horizon over the far road
  const fgrd = ctx.createLinearGradient(0, horizonY - 2, 0, horizonY + 14);
  fgrd.addColorStop(0, fogCol); fgrd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = fgrd; ctx.fillRect(0, horizonY - 2, W, 16);

  drawCockpit(ctx);
  drawHud(ctx);
  drawStartHint(ctx);
  if (R.phase === "grid" || (R.phase === "go" && R.phaseT < 1.2)) drawLights(ctx);
}

// A brief "how to drive" reminder on the grid / at the start of practice, so
// a first-time player isn't left staring at green lights not knowing the keys.
function drawStartHint(ctx) {
  const R = G.race;
  if (R.player.retired) return;
  let alpha = 0;
  if (R.phase === "grid") alpha = 1;
  else if (R.phase === "go") alpha = clamp(1 - R.phaseT / 1.6, 0, 1);
  else if (R.mode === "practice") alpha = clamp((5 - R.time) / 1.5, 0, 1);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  const bw = 320, bh = 42, bx = W / 2 - bw / 2, by = 252;
  ctx.fillStyle = "rgba(8,8,20,0.74)";
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = "#3040a0"; ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.textAlign = "center";
  ctx.font = "bold 12px monospace"; ctx.fillStyle = "#e8d048";
  ctx.fillText("A / ↑  ACCELERATE      Z / ↓  BRAKE", W / 2, by + 17);
  ctx.fillStyle = "#b8c0e8";
  ctx.fillText(", .  or  ← →   STEER", W / 2, by + 34);
  ctx.textAlign = "left";
  ctx.restore();
}

// ------------------------------------------------------------
// Cockpit & HUD
// ------------------------------------------------------------
function drawCockpit(ctx) {
  const R = G.race;
  const team = VGP_TEAMS[VGP_DRIVERS[G.driverIdx].team];
  const [A, Bc, D] = team.colors;
  const noseY = H - 66, cy = H;

  // car nose
  ctx.fillStyle = shade(A, 0.9);
  ctx.beginPath();
  ctx.moveTo(W / 2 - 150, cy); ctx.lineTo(W / 2 - 44, noseY);
  ctx.lineTo(W / 2 + 44, noseY); ctx.lineTo(W / 2 + 150, cy);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(A, 0.72);
  ctx.beginPath();
  ctx.moveTo(W / 2 - 44, noseY); ctx.lineTo(W / 2 + 44, noseY);
  ctx.lineTo(W / 2 + 38, noseY - 8); ctx.lineTo(W / 2 - 38, noseY - 8);
  ctx.closePath(); ctx.fill();
  // wing tips visible at bottom corners
  ctx.fillStyle = shade(Bc, 0.85);
  ctx.fillRect(0, H - 26, 118, 10);
  ctx.fillRect(W - 118, H - 26, 118, 10);
  ctx.fillStyle = shade(D, 0.9);
  ctx.fillRect(0, H - 16, 126, 16); ctx.fillRect(W - 126, H - 16, 126, 16);

  // steering wheel
  const wx = W / 2, wy = H - 6, wr = 58;
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(R.steer * 1.15 + (R.spinT > 0 ? Math.sin(R.time * 30) * 0.4 : 0));
  ctx.strokeStyle = "#181818"; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.arc(0, 0, wr, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.strokeStyle = "#282830"; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(-wr + 6, -14); ctx.lineTo(-12, -4); ctx.moveTo(wr - 6, -14); ctx.lineTo(12, -4); ctx.stroke();
  ctx.fillStyle = "#202024"; ctx.fillRect(-16, -12, 32, 14);
  ctx.restore();

  // dash panel
  const dx = W / 2 - 92, dy = H - 62;
  ctx.fillStyle = "#101014"; ctx.fillRect(dx, dy, 184, 30);
  ctx.strokeStyle = "#303038"; ctx.lineWidth = 1; ctx.strokeRect(dx + 0.5, dy + 0.5, 183, 29);
  // rev LEDs
  const segs = 14, lit = Math.round((R.rpm - 6000) / (13800 - 6000) * segs);
  for (let i = 0; i < segs; i++) {
    ctx.fillStyle = i < lit ? (i < 8 ? "#30d030" : i < 11 ? "#e8d020" : "#e03030") : "#26262c";
    ctx.fillRect(dx + 5 + i * 9, dy + 4, 7, 6);
  }
  // gear
  ctx.fillStyle = "#0a0a0a"; ctx.fillRect(dx + 134, dy + 3, 20, 24);
  ctx.fillStyle = "#40e858"; ctx.font = "bold 20px monospace"; ctx.textAlign = "center";
  ctx.fillText(String(R.gear), dx + 144, dy + 23);
  // speed
  ctx.fillStyle = "#e8b830"; ctx.font = "bold 13px monospace"; ctx.textAlign = "right";
  ctx.fillText(String(Math.round(R.pv * 3.6)).padStart(3, " "), dx + 128, dy + 24);
  ctx.fillStyle = "#786830"; ctx.font = "8px monospace";
  ctx.fillText("KMH", dx + 128, dy + 13);
  // suggested gear (aid) — steady display
  if (G.aids.sugGear && R.sugGear && R.sugGear !== R.gear && !R.player.retired) {
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(dx + 158, dy + 3, 20, 24);
    ctx.fillStyle = R.sugGear < R.gear ? "#e05050" : "#50a0e8";
    ctx.font = "bold 20px monospace"; ctx.textAlign = "center";
    ctx.fillText(String(R.sugGear), dx + 168, dy + 23);
  }

  // mirrors
  for (const side of [-1, 1]) {
    const mx = W / 2 + side * 208, my = H - 96;
    ctx.fillStyle = "#181820"; ctx.fillRect(mx - 32, my - 14, 64, 26);
    ctx.fillStyle = G.race.trk.theme.sky[2]; ctx.fillRect(mx - 29, my - 11, 58, 9);
    ctx.fillStyle = "#606068"; ctx.fillRect(mx - 29, my - 2, 58, 11);
    // cars behind
    const R2 = G.race, trkLen = R2.trk.len;
    for (const c of R2.cars) {
      if (c.isPlayer || c.retired) continue;
      let ds = c.prog % trkLen - R2.player.prog % trkLen;
      if (ds > trkLen / 2) ds -= trkLen; if (ds < -trkLen / 2) ds += trkLen;
      if (ds > -1 || ds < -80) continue;
      const dd = (c.d - R2.player.d) * -side;
      if (dd < -6 || dd > 10) continue;
      const sz = clamp(14 / (1 + -ds * 0.12), 2, 12);
      const px2 = mx + side * clamp((c.d - R2.player.d) * -3, -24, 24);
      ctx.fillStyle = VGP_TEAMS[c.team].colors[0];
      ctx.fillRect(px2 - sz / 2, my + 3 - sz / 3, sz, sz * 0.6);
    }
    ctx.strokeStyle = "#404048"; ctx.strokeRect(mx - 32.5, my - 14.5, 65, 27);
  }
}

function drawHud(ctx) {
  const R = G.race, pc = R.player;
  ctx.textAlign = "left";
  ctx.font = "bold 11px monospace";
  // top bar
  ctx.fillStyle = "rgba(8,8,20,0.75)";
  ctx.fillRect(0, 0, W, 30);
  const pos = racePositions().findIndex(c => c.isPlayer) + 1;
  ctx.fillStyle = "#e8d048";
  if (R.mode !== "practice")
    ctx.fillText("P" + pos + "/" + R.cars.length, 10, 12);
  ctx.fillStyle = "#e8e8e8";
  const lapShown = R.laps === 999 ? pc.lap + 1 : clamp(pc.lap === 0 ? 1 : pc.lap, 1, R.laps);
  ctx.fillText("LAP " + lapShown + (R.laps !== 999 ? "/" + R.laps : ""), 10, 25);
  ctx.fillText("TIME " + fmtT(R.time - pc.lapStart), 110, 12);
  ctx.fillText("BEST " + fmtT(pc.best), 110, 25);
  ctx.fillStyle = "#98c0e8";
  ctx.fillText(R.trk.def.gp.toUpperCase(), 232, 12);
  ctx.fillText(R.trk.def.name.toUpperCase(), 232, 25);
  // aids lamps
  ctx.font = "bold 9px monospace";
  AIDS_DEF.forEach((a, i) => {
    ctx.fillStyle = G.aids[a.key] ? "#48d060" : "#3a3a44";
    ctx.fillText(a.short, W - 130 + i * 21, 12);
  });
  // damage bar
  if (!G.aids.indestruct) {
    ctx.fillStyle = "#3a3a44"; ctx.fillRect(W - 130, 17, 122, 7);
    ctx.fillStyle = R.damage > 65 ? "#e03030" : R.damage > 35 ? "#e8c030" : "#48d060";
    ctx.fillRect(W - 130, 17, clamp(R.damage, 0, 100) * 1.22, 7);
  }
  // gap to car ahead/behind
  if (R.mode !== "practice") {
    const order = racePositions();
    const pi = order.findIndex(c => c.isPlayer);
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "rgba(8,8,20,0.55)";
    ctx.fillRect(0, 32, 92, 30);
    if (pi > 0) {
      const gap = (order[pi - 1].prog - pc.prog) / Math.max(pc.v, 30);
      ctx.fillStyle = "#b8b8c8";
      ctx.fillText("AHD +" + gap.toFixed(1), 6, 44);
    }
    if (pi < order.length - 1 && pi >= 0) {
      const gap = (pc.prog - order[pi + 1].prog) / Math.max(pc.v, 30);
      ctx.fillStyle = "#b8b8c8";
      ctx.fillText("BHD -" + gap.toFixed(1), 6, 57);
    }
  }
  // messages
  if (R.msgT > 0) {
    ctx.font = "bold 18px monospace"; ctx.textAlign = "center";
    ctx.fillStyle = "rgba(8,8,20,0.7)";
    ctx.fillRect(W / 2 - 150, 44, 300, 26);
    ctx.fillStyle = "#e8d048";
    ctx.fillText(R.msg, W / 2, 63);
  }
  if (R.wrongWay > 0.7) {
    ctx.font = "bold 22px monospace"; ctx.textAlign = "center";
    ctx.fillStyle = ((R.time * 3 | 0) & 1) ? "#e03030" : "#e8e8e8";
    ctx.fillText("WRONG WAY", W / 2, 90);
  }
  if (pc.retired) {
    ctx.font = "bold 24px monospace"; ctx.textAlign = "center";
    ctx.fillStyle = "#e03030";
    ctx.fillText("RETIRED — " + R.retireReason, W / 2, 130);
  }
  ctx.textAlign = "left";
}

function drawLights(ctx) {
  const R = G.race;
  const n = R.phase === "grid" ? Math.min(5, 1 + (R.phaseT * 1.4 | 0)) : 0;
  ctx.fillStyle = "#101018";
  ctx.fillRect(W / 2 - 95, 46, 190, 42);
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(W / 2 - 68 + i * 34, 67, 12, 0, TAU);
    ctx.fillStyle = (R.phase === "grid" && i < n) ? "#e02020" :
      (R.phase === "go" && R.phaseT < 1.2) ? "#20d040" : "#301818";
    ctx.fill();
  }
}

// ------------------------------------------------------------
// Race loop
// ------------------------------------------------------------
let lastT = 0, acc = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (t - lastT) / 1000 || 0.016);
  lastT = t;
  if (G.screen !== "race" || !G.race) return;
  const R = G.race;
  if (R.paused) { renderRace(); drawPauseHint(); return; }

  acc += dtReal;
  const dt = 1 / 120;
  let steps = 0;
  while (acc >= dt && steps < 6) {
    stepRace(dt); acc -= dt; steps++;
  }
  renderRace();
}

function stepRace(dt) {
  const R = G.race;
  R.time += dt;
  R.phaseT += dt;
  if (R.msgT > 0) R.msgT -= dt;
  if (R.phase === "grid") {
    if (R.phaseT > 4.0) { R.phase = "go"; R.phaseT = 0; SFX.countdown(true); flashMsg("GO! GO! GO!"); }
    else if (R.phaseT > 1 && ((R.phaseT * 1.4) | 0) !== (((R.phaseT - dt) * 1.4) | 0)) SFX.countdown(false);
  } else if (R.phase === "go" && R.phaseT > 3) R.phase = "racing";
  playerStep(dt);
  if (R.mode !== "practice") aiStep(dt);
}

function drawPauseHint() {
  const ctx = G.ctx;
  ctx.fillStyle = "rgba(4,4,16,0.6)";
  ctx.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------
// Menus (DOM)
// ------------------------------------------------------------
const $menu = () => document.getElementById("menu");
function showMenu(html) {
  const m = $menu();
  m.innerHTML = html;
  m.style.display = "flex";
  // any menu (incl. pause) hides the driving overlay and drops held inputs
  document.body.classList.remove("driving");
  for (const key in G.touchIn) G.touchIn[key] = false;
  document.querySelectorAll("#touch .tbtn.on").forEach(el => el.classList.remove("on"));
}
function hideMenu() {
  $menu().style.display = "none";
  const tb = document.getElementById("tback");
  if (tb) tb.style.display = "none";        // no menu open -> no back target
  refreshDriving();
}
// show the on-screen controls only while actually driving; expose the gear
// pad only when auto-gears is off (manual box)
function refreshDriving() {
  document.body.classList.toggle("driving", G.touch && G.screen === "race");
  document.body.classList.toggle("manual", !G.aids.autoGears);
}

function menuFrame(title, inner, footer) {
  return `<div class="frame">
    <div class="mtitle">${title}</div>
    <div class="mbody">${inner}</div>
    <div class="mfoot">${footer || "&#8593;&#8595; SELECT &nbsp; ENTER OK &nbsp; ESC BACK"}</div>
  </div>`;
}

let menuItems = [], menuSel = 0, menuBack = null;
function bindMenu(items, back) {
  menuItems = items; menuSel = items.findIndex(i => i.def) >= 0 ? items.findIndex(i => i.def) : 0;
  menuBack = back || null;
  const tb = document.getElementById("tback");
  if (tb) tb.style.display = (G.touch && menuBack) ? "flex" : "none";
  paintMenuSel();
}
function paintMenuSel() {
  document.querySelectorAll(".mi").forEach((el, i) => {
    el.classList.toggle("sel", i === menuSel);
  });
  const el = document.querySelectorAll(".mi")[menuSel];
  if (el) el.scrollIntoView({ block: "nearest" });
}

function screenTitle() {
  G.screen = "title";
  showMenu(`<div class="frame title">
    <div class="biglogo">VECTOR&nbsp;GP</div>
    <div class="sub">WORLD CIRCUIT · 1991 SEASON</div>
    <div class="carart">${titleCarSvg()}</div>
    <div class="press blink">PRESS ENTER</div>
    <div class="credits">A FLAT-SHADED POLYGON RACING HOMAGE · 16 CIRCUITS · 26 DRIVERS · FM SOUND</div>
  </div>`);
  bindMenu([{ label: "start", fn: screenMain }]);
}

function titleCarSvg() {
  return `<svg viewBox="0 0 200 60" width="320" height="96">
    <polygon points="10,44 60,38 90,30 150,30 188,40 188,48 10,48" fill="#d02018"/>
    <polygon points="90,30 150,30 140,22 100,22" fill="#e8e8e8"/>
    <polygon points="152,26 178,26 178,34 152,34" fill="#282830"/>
    <circle cx="52" cy="48" r="10" fill="#181818"/><circle cx="52" cy="48" r="4" fill="#484850"/>
    <circle cx="152" cy="48" r="10" fill="#181818"/><circle cx="152" cy="48" r="4" fill="#484850"/>
    <polygon points="8,34 26,34 26,44 8,44" fill="#e8e8e8"/>
  </svg>`;
}

function screenMain() {
  G.screen = "menu";
  const seasonLbl = G.season
    ? (G.season.round >= 16 ? "SEASON COMPLETE — STANDINGS" : `CONTINUE SEASON — ROUND ${G.season.round + 1}/16`)
    : "NEW CHAMPIONSHIP SEASON";
  const items = [
    { label: "QUICK RACE", fn: () => screenCircuit("race") },
    { label: seasonLbl, fn: seasonEntry },
    { label: "PRACTICE", fn: () => screenCircuit("practice") },
    { label: "DRIVER — " + VGP_DRIVERS[G.driverIdx].name.toUpperCase(), fn: screenDriver },
    { label: "DRIVER AIDS", fn: screenAids },
    { label: "STANDINGS", fn: () => screenStandings(false) },
    { label: "CONTROLS", fn: screenControls },
  ];
  showMenu(menuFrame("VECTOR GP — MAIN MENU",
    items.map((it, i) => `<div class="mi" data-i="${i}">${it.label}</div>`).join("")));
  bindMenu(items, null);
}

function seasonEntry() {
  if (!G.season) {
    newSeason();
  }
  if (G.season.round >= 16) { screenStandings(true); return; }
  G.trackIdx = G.season.round;
  screenGrid("season");
}

function screenCircuit(mode) {
  const items = VGP_TRACKS.map((t, i) => ({
    label: `R${String(t.round).padStart(2, "0")}  ${t.gp.toUpperCase()}`,
    fn: () => { G.trackIdx = i; mode === "practice" ? startRace("practice") : screenRaceLen(mode); },
    def: i === G.trackIdx,
  }));
  showMenu(menuFrame("SELECT CIRCUIT — " + (mode === "practice" ? "PRACTICE" : "QUICK RACE"),
    `<div class="cols"><div class="list">` +
    items.map((it, i) => `<div class="mi" data-i="${i}">${it.label}</div>`).join("") +
    `</div><div class="preview"><canvas id="mapc" width="230" height="200"></canvas><div id="tinfo"></div></div></div>`));
  bindMenu(items, screenMain);
  drawTrackPreview();
}

function drawTrackPreview() {
  const c = document.getElementById("mapc");
  if (!c) return;
  const i = clamp(menuSel, 0, VGP_TRACKS.length - 1);
  const def = VGP_TRACKS[i];
  const trk = buildTrack(def);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0a0a2a"; ctx.fillRect(0, 0, 230, 200);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const p of trk.pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const sc = Math.min(200 / (maxX - minX), 170 / (maxY - minY));
  const ox = (230 - (maxX - minX) * sc) / 2, oy = (185 - (maxY - minY) * sc) / 2;
  ctx.strokeStyle = "#e8e8e8"; ctx.lineWidth = 3; ctx.beginPath();
  trk.pts.forEach((p, k) => {
    const x = ox + (p.x - minX) * sc, y = 185 - (oy + (p.y - minY) * sc) + 8;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath(); ctx.stroke();
  const s0 = trk.pts[0];
  ctx.fillStyle = "#e03030";
  ctx.fillRect(ox + (s0.x - minX) * sc - 3, 185 - (oy + (s0.y - minY) * sc) + 5, 6, 6);
  const info = document.getElementById("tinfo");
  if (info) info.innerHTML =
    `${def.name.toUpperCase()}<br>${def.location.toUpperCase()}<br>` +
    `LENGTH ${(trk.len / 1000).toFixed(3)} KM<br>FULL RACE ${def.laps} LAPS<br>` +
    `THEME: ${def.theme.toUpperCase()}${def.street ? " (WALLS!)" : ""}`;
}

function screenRaceLen(mode) {
  const def = VGP_TRACKS[G.trackIdx];
  const opts = [
    "SPRINT — 5 LAPS", "SHORT — 10 LAPS",
    `QUARTER DISTANCE — ${Math.max(3, Math.round(def.laps * 0.25))} LAPS`,
    `HALF DISTANCE — ${Math.max(3, Math.round(def.laps * 0.5))} LAPS`,
  ];
  const items = opts.map((o, i) => ({
    label: o, def: i === G.raceLapsMode,
    fn: () => { G.raceLapsMode = i; savePrefs(); screenGrid(mode); },
  }));
  showMenu(menuFrame("RACE DISTANCE — " + def.gp.toUpperCase(),
    items.map((it, i) => `<div class="mi" data-i="${i}">${it.label}</div>`).join("")));
  bindMenu(items, () => screenCircuit(mode));
}

function screenGrid(mode) {
  // show simulated grid, then start
  const def = VGP_TRACKS[G.trackIdx];
  startRace(mode === "practice" ? "practice" : mode);
  // race has been created; show grid overlay before unpausing? Simpler:
  // display grid list from race cars order
  const R = G.race;
  R.paused = true;
  const rows = R.cars.slice().sort((a, b) => a.gridPos - b.gridPos).map((c) => {
    const d = VGP_DRIVERS[c.di];
    return `<div class="gr ${c.isPlayer ? "you" : ""}">${String(c.gridPos + 1).padStart(2, " ")}. ${d.name.toUpperCase().padEnd(20, " ")} ${VGP_TEAMS[d.team].name.toUpperCase()}</div>`;
  }).join("");
  showMenu(menuFrame(
    `STARTING GRID — ${def.gp.toUpperCase()}` + (mode === "season" ? ` — ROUND ${def.round}/16` : ""),
    `<div class="gridlist">${rows}</div>`,
    "QUALIFYING SIMULATED · ENTER TO START · A Z , . OR ARROWS TO DRIVE"));
  bindMenu([{ label: "start", fn: () => { hideMenu(); G.race.paused = false; } }],
    () => { raceSoundsOff(); G.race = null; G.screen = "menu"; screenMain(); });
}

function screenDriver() {
  const items = VGP_DRIVERS.map((d, i) => ({
    label: `${d.name.toUpperCase().padEnd(20, " ")} ${VGP_TEAMS[d.team].name.toUpperCase()} · ${VGP_TEAMS[d.team].engine.toUpperCase()}`,
    fn: () => { G.driverIdx = i; savePrefs(); screenMain(); },
    def: i === G.driverIdx,
  }));
  showMenu(menuFrame("SELECT YOUR DRIVE — 13 TEAMS · 26 SEATS",
    `<div class="list tall">` + items.map((it, i) =>
      `<div class="mi" data-i="${i}"><span class="swatch" style="background:${VGP_TEAMS[VGP_DRIVERS[i].team].colors[0]};border-color:${VGP_TEAMS[VGP_DRIVERS[i].team].colors[1]}"></span>${it.label}</div>`).join("") + `</div>`));
  bindMenu(items, screenMain);
}

function screenAids() {
  const build = () => {
    const items = AIDS_DEF.map((a) => ({
      label: `${a.label.padEnd(24, " ")} [${G.aids[a.key] ? "ON " : "OFF"}]`,
      fn: function () { G.aids[a.key] = !G.aids[a.key]; saveAids(); SFX.beep(); const s = menuSel; build(); menuSel = s; paintMenuSel(); },
    }));
    items.push({ label: "ALL ON (NOVICE)", fn: () => { AIDS_DEF.forEach(a => G.aids[a.key] = true); saveAids(); build(); } });
    items.push({ label: "ALL OFF (ACE)", fn: () => { AIDS_DEF.forEach(a => G.aids[a.key] = false); saveAids(); build(); } });
    showMenu(menuFrame("DRIVER AIDS — TOGGLE IN RACE WITH KEYS 1–6",
      items.map((it, i) => `<div class="mi" data-i="${i}">${it.label}</div>`).join(""),
      "1 AUTO BRAKES · 2 AUTO GEARS · 3 SELF-CORRECT · 4 INDESTRUCT · 5 IDEAL LINE · 6 SUG. GEAR"));
    bindMenu(items, screenMain);
  };
  build();
}

function screenControls() {
  showMenu(menuFrame("CONTROLS",
    `<div class="ctrl">
      <div>A ACCELERATE &nbsp;&nbsp; Z BRAKE</div>
      <div>, STEER LEFT &nbsp;&nbsp; . STEER RIGHT</div>
      <div class="dim">(ARROW KEYS WORK TOO)</div>
      <div>SPACE SHIFT UP &nbsp;&nbsp; X SHIFT DOWN <span class="dim">(manual box)</span></div>
      <div>1–6 TOGGLE DRIVER AIDS</div>
      <div>ESC PAUSE &nbsp;&nbsp; M MUTE</div>
      <div class="dim" style="margin-top:10px">TOUCH: ON-SCREEN PADS APPEAR AUTOMATICALLY —<br>
      STEER LEFT THUMB, GAS/BRAKE RIGHT THUMB, &#10073;&#10073; TO PAUSE.</div>
      <div class="dim" style="margin-top:12px">SIX AIDS, AS TRADITION DEMANDS: AUTO BRAKES, AUTO GEARS,<br>
      SELF-CORRECTING SPIN, INDESTRUCTIBLE, IDEAL LINE, SUGGESTED GEAR.<br>
      TURN THEM ALL OFF AND IT BITES.</div>
    </div>`));
  bindMenu([{ label: "back", fn: screenMain }], screenMain);
}

function standingsTable() {
  const s = G.season;
  const dRank = VGP_DRIVERS.map((d, i) => ({ i, p: s ? s.ptsD[i] : 0 }))
    .sort((a, b) => b.p - a.p);
  const tRank = VGP_TEAMS.map((t, i) => ({ i, p: s ? s.ptsT[i] : 0 }))
    .sort((a, b) => b.p - a.p);
  const dr = dRank.slice(0, 13).map((r, k) =>
    `<div class="${r.i === G.driverIdx ? "you gr" : "gr"}">${String(k + 1).padStart(2)}. ${VGP_DRIVERS[r.i].name.toUpperCase().padEnd(20, " ")} ${String(r.p).padStart(3)}</div>`).join("");
  const tr = tRank.map((r, k) =>
    `<div class="gr">${String(k + 1).padStart(2)}. ${VGP_TEAMS[r.i].name.toUpperCase().padEnd(20, " ")} ${String(r.p).padStart(3)}</div>`).join("");
  return `<div class="cols"><div><div class="colh">DRIVERS</div>${dr}</div>
          <div><div class="colh">CONSTRUCTORS</div>${tr}</div></div>`;
}

function screenStandings(seasonDone) {
  const s = G.season;
  const title = !s ? "STANDINGS — NO SEASON IN PROGRESS" :
    s.round >= 16 ? "FINAL CHAMPIONSHIP STANDINGS" :
      `CHAMPIONSHIP STANDINGS — AFTER ROUND ${s.round}/16`;
  const items = [];
  if (s && s.round >= 16) {
    const champ = VGP_DRIVERS.map((d, i) => ({ i, p: s.ptsD[i] })).sort((a, b) => b.p - a.p)[0];
    items.push({ label: `WORLD CHAMPION: ${VGP_DRIVERS[champ.i].name.toUpperCase()}`, fn: () => { } });
    items.push({ label: "START NEW SEASON", fn: () => { newSeason(); screenMain(); } });
  } else if (s) {
    items.push({ label: `CONTINUE — ROUND ${s.round + 1}: ${VGP_TRACKS[s.round].gp.toUpperCase()}`, fn: seasonEntry });
    items.push({ label: "ABANDON SEASON", fn: () => { G.season = null; localStorage.removeItem("vectorgp.season.v1"); screenMain(); } });
  }
  items.push({ label: "BACK", fn: screenMain });
  showMenu(menuFrame(title,
    standingsTable() +
    items.map((it, i) => `<div class="mi" data-i="${i}">${it.label}</div>`).join("")));
  bindMenu(items, screenMain);
}

function showResults() {
  const R = G.race;
  const def = R.trk.def;
  const rows = R.results.slice(0, 26).map(r => {
    const d = VGP_DRIVERS[r.di];
    const pts = (!r.retired && r.pos <= 6 && R.mode !== "practice") ? POINTS[r.pos - 1] : 0;
    return `<div class="gr ${r.di === G.driverIdx ? "you" : ""}">` +
      `${String(r.pos).padStart(2)}. ${d.name.toUpperCase().padEnd(20, " ")}` +
      `${(r.retired ? "DNF" : r.pos === 1 ? "WINNER" : "+" + Math.max(0.1, r.gap).toFixed(1) + "s").padStart(9, " ")}` +
      `${pts ? "  " + pts + " PTS" : ""}</div>`;
  }).join("");
  const fl = R.fastLap.t ? `FASTEST LAP — ${VGP_DRIVERS[R.fastLap.di].name.toUpperCase()} ${fmtT(R.fastLap.t)}` : "";
  const items = [];
  if (R.mode === "season") items.push({ label: G.season.round >= 16 ? "FINAL STANDINGS" : "CHAMPIONSHIP STANDINGS", fn: () => { raceSoundsOff(); G.race = null; G.screen = "menu"; screenStandings(G.season.round >= 16); } });
  items.push({ label: "MAIN MENU", fn: () => { raceSoundsOff(); G.race = null; G.screen = "menu"; screenMain(); } });
  showMenu(menuFrame(`RESULT — ${def.gp.toUpperCase()}`,
    `<div class="gridlist">${rows}</div><div class="fl">${fl}</div>` +
    items.map((it, i) => `<div class="mi" data-i="${i}">${it.label}</div>`).join("")));
  bindMenu(items, items[items.length - 1].fn);
}

function raceSoundsOff() {
  SFX.engine(0, 0, false);
  SFX.aiCar(5000, 0);
  SFX.setSkid(0); SFX.setRumble(0);
}

function screenPause() {
  const R = G.race;
  R.paused = true;
  raceSoundsOff();
  const items = [
    { label: "RESUME", fn: () => { hideMenu(); R.paused = false; } },
    { label: "RESTART " + (R.mode === "practice" ? "PRACTICE" : "RACE"), fn: () => { const m = R.mode; startRace(m); } },
    { label: "DRIVER AIDS", fn: screenPauseAids },
    { label: "QUIT TO MENU", fn: () => { raceSoundsOff(); G.race = null; G.screen = "menu"; screenMain(); } },
  ];
  showMenu(menuFrame("PAUSED — " + R.trk.def.gp.toUpperCase(),
    items.map((it, i) => `<div class="mi" data-i="${i}">${it.label}</div>`).join("")));
  bindMenu(items, () => { hideMenu(); R.paused = false; });
}
function screenPauseAids() {
  const build = () => {
    const items = AIDS_DEF.map((a) => ({
      label: `${a.label.padEnd(24, " ")} [${G.aids[a.key] ? "ON " : "OFF"}]`,
      fn: function () { G.aids[a.key] = !G.aids[a.key]; saveAids(); const s = menuSel; build(); menuSel = s; paintMenuSel(); },
    }));
    items.push({ label: "BACK", fn: screenPause });
    showMenu(menuFrame("DRIVER AIDS", items.map((it, i) => `<div class="mi" data-i="${i}">${it.label}</div>`).join("")));
    bindMenu(items, screenPause);
  };
  build();
}

// ------------------------------------------------------------
// Input
// ------------------------------------------------------------
function onKey(e, down) {
  const k = e.code;
  if (down && !SFX.ac && (G.screen !== "title" || k === "Enter")) SFX.init();

  if (G.screen === "race" && G.race && !G.race.paused) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyA", "KeyZ", "Comma", "Period", "Space", "KeyX"].includes(k)) e.preventDefault();
    G.keys[k] = down;
    if (down && !e.repeat) {
      if (k === "Space" && !G.aids.autoGears && G.race.gear < 6) { G.race.gear++; SFX.shift(); }
      if (k === "KeyX" && !G.aids.autoGears && G.race.gear > 1) { G.race.gear--; SFX.shift(); }
      const aidIdx = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].indexOf(k);
      if (aidIdx >= 0) {
        const a = AIDS_DEF[aidIdx];
        G.aids[a.key] = !G.aids[a.key]; saveAids();
        flashMsg(a.label + (G.aids[a.key] ? " ON" : " OFF"));
        SFX.beep();
      }
      if (k === "KeyM") { SFX.master.gain.value = SFX.master.gain.value > 0 ? 0 : 0.55; }
      if (k === "Escape") screenPause();
    }
    return;
  }

  // menu navigation
  if (!down) return;
  if (k === "ArrowUp" || k === "ArrowDown") {
    e.preventDefault();
    if (menuItems.length) {
      menuSel = (menuSel + (k === "ArrowDown" ? 1 : -1) + menuItems.length) % menuItems.length;
      paintMenuSel(); SFX.beep();
      if (document.getElementById("mapc")) drawTrackPreview();
    }
  } else if (k === "Enter" || k === "Space") {
    e.preventDefault();
    if (G.screen === "title") { screenMain(); return; }
    if (menuItems[menuSel]) menuItems[menuSel].fn();
  } else if (k === "Escape") {
    if (menuBack) menuBack();
  }
}

document.addEventListener("keydown", (e) => onKey(e, true));
document.addEventListener("keyup", (e) => onKey(e, false));
document.addEventListener("click", (e) => {
  if (!SFX.ac) SFX.init();
  const mi = e.target.closest(".mi");
  if (mi) {
    const i = +mi.dataset.i;
    if (menuItems[i]) { menuSel = i; paintMenuSel(); menuItems[i].fn(); }
  } else if (G.screen === "title") screenMain();
});
document.addEventListener("mousemove", (e) => {
  const mi = e.target.closest && e.target.closest(".mi");
  if (mi && +mi.dataset.i !== menuSel) {
    menuSel = +mi.dataset.i; paintMenuSel();
    if (document.getElementById("mapc")) drawTrackPreview();
  }
});

// ------------------------------------------------------------
// Touch controls — on-screen pads for phones/tablets
// Auto-detects a coarse pointer and reveals the driving overlay; the
// layout follows the arcade-racer convention: steering on the left thumb,
// pedals on the right. Force on/off with ?touch=1 / ?touch=0.
// ------------------------------------------------------------
function initTouch() {
  const q = new URLSearchParams(location.search).get("touch");
  const detected = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
    "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  G.touch = q === "1" ? true : q === "0" ? false : detected;
  document.body.classList.toggle("touch", G.touch);
  if (!G.touch) return;

  // press-and-hold pads (steer / throttle / brake) -> G.touchIn flags
  document.querySelectorAll("#touch [data-hold]").forEach(el => {
    const key = el.dataset.hold;
    const set = (v) => { G.touchIn[key] = v; el.classList.toggle("on", v); };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); if (!SFX.ac) SFX.init();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* older webkit */ }
      set(true);
    });
    el.addEventListener("pointerup", (e) => { e.preventDefault(); set(false); });
    el.addEventListener("pointercancel", () => set(false));
    el.addEventListener("lostpointercapture", () => set(false));
  });

  // momentary buttons (pause / manual gear change)
  document.querySelectorAll("#touch [data-tap]").forEach(el => {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); if (!SFX.ac) SFX.init();
      const a = el.dataset.tap, R = G.race;
      if (a === "pause") { if (G.screen === "race" && R && !R.paused) screenPause(); }
      else if (a === "gearup") { if (!G.aids.autoGears && R && !R.paused && R.gear < 6) { R.gear++; SFX.shift(); } }
      else if (a === "geardn") { if (!G.aids.autoGears && R && !R.paused && R.gear > 1) { R.gear--; SFX.shift(); } }
      el.classList.add("on");
    });
    const off = () => el.classList.remove("on");
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
  });

  // menu "back" (stands in for ESC on touch)
  const tb = document.getElementById("tback");
  if (tb) tb.addEventListener("pointerdown", (e) => {
    e.preventDefault(); if (!SFX.ac) SFX.init();
    if (menuBack) menuBack();
  });
}

// ------------------------------------------------------------
// Boot
// ------------------------------------------------------------
window.addEventListener("DOMContentLoaded", () => {
  G.canvas = document.getElementById("game");
  G.ctx = G.canvas.getContext("2d");
  G.ctx.imageSmoothingEnabled = false;
  loadState();
  initTouch();
  window.__VGP = G;   // console/debug handle
  screenTitle();
  requestAnimationFrame(frame);
});
