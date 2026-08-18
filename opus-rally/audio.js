// Every sound here is synthesised at runtime — there are no sample files.
//
// The engine is the load-bearing part: a rally car's note is what sells speed,
// so it is not a pitched loop but an additive stack whose partial amplitudes
// come from the Fourier transform of the car's own firing impulse train. That
// is why a four and a five sound genuinely different rather than transposed:
// an even four fires at whole multiples of 2/rev, an even five at 2.5/rev, and
// the small per-cylinder strength variation every real engine has leaks energy
// into the half orders that give a five its offbeat warble.
//
// The graph is built exactly once, in start(). Nothing after that creates a
// node except an AudioBufferSourceNode for a one-shot (a stone ping, a pop, a
// panel hit) — those play through a fixed pool of gain/filter voices, so the
// persistent node count is constant no matter how violent the drive.

import { clamp, saturate, lerp, damp, smoothstep } from "./mathx.js";
import { makeRng, stringSeed } from "./rng.js";
import { surfaceProps } from "./surfaces.js";

export const AUDIO_BUSES = Object.freeze([
  "engine", "exhaust", "surface", "tyres", "impacts", "wind", "voice", "ambience", "music",
]);

const DEFAULT_BUS_GAIN = Object.freeze({
  engine: 0.85, exhaust: 0.90, surface: 0.70, tyres: 0.72,
  impacts: 0.95, wind: 0.50, voice: 1.0, ambience: 0.42, music: 0.55,
});

// Camera is a filter + level offset on the already-built graph, never a rebuild:
// inside a helmet you lose the top end and most of the tailpipe, from the chase
// camera the exhaust is the whole show.
const CAMERA_MODES = Object.freeze({
  cockpit:  { lp: 2700, gain: 0.94, exhaust: 0.55, wind: 0.78, surface: 0.88, engine: 1.10 },
  helmet:   { lp: 2050, gain: 0.88, exhaust: 0.48, wind: 0.62, surface: 0.80, engine: 1.12 },
  bonnet:   { lp: 9000, gain: 1.00, exhaust: 0.85, wind: 1.05, surface: 1.00, engine: 1.00 },
  chase:    { lp: 15000, gain: 1.00, exhaust: 1.25, wind: 0.90, surface: 1.00, engine: 0.92 },
  exterior: { lp: 18000, gain: 1.00, exhaust: 1.40, wind: 0.68, surface: 1.05, engine: 0.85 },
});

// Keyed by surfaceProps().sfx. `stones` is the underbody ping rate scale,
// `spray` the wet hiss, `grain` how much the rolling noise is torn rather than
// smooth. These are the whole difference between tarmac roar and gravel rush.
const SFX = Object.freeze({
  tarmac: { bp: 760, q: 0.70, lp: 5200, level: 0.55, grain: 0.05, spray: 0.02, stones: 0.02 },
  gravel: { bp: 1500, q: 0.50, lp: 8200, level: 0.95, grain: 0.90, spray: 0.00, stones: 1.00 },
  snow:   { bp: 3600, q: 0.55, lp: 11000, level: 0.62, grain: 0.28, spray: 0.18, stones: 0.08 },
  ice:    { bp: 5200, q: 1.20, lp: 12000, level: 0.30, grain: 0.05, spray: 0.02, stones: 0.02 },
  grass:  { bp: 1150, q: 0.60, lp: 6000, level: 0.80, grain: 0.62, spray: 0.06, stones: 0.22 },
  mud:    { bp: 430, q: 0.85, lp: 2600, level: 1.00, grain: 0.50, spray: 0.55, stones: 0.12 },
  sand:   { bp: 2600, q: 0.45, lp: 9000, level: 0.85, grain: 0.72, spray: 0.02, stones: 0.30 },
  rock:   { bp: 1250, q: 0.90, lp: 7200, level: 0.92, grain: 0.82, spray: 0.02, stones: 0.85 },
  water:  { bp: 3000, q: 0.50, lp: 10500, level: 1.00, grain: 0.20, spray: 1.00, stones: 0.00 },
});
const SFX_FALLBACK = SFX.gravel;

// Impact spectrum by what you hit. `ring` is the resonant centre, `decay` the
// envelope time constant, `tone` how much of it is a pitched ring versus a
// broadband crunch.
const IMPACT_MATERIALS = Object.freeze({
  barrier:  { ring: 380, q: 5.5, decay: 0.42, tone: 0.55, buf: "bang" },
  armco:    { ring: 420, q: 6.5, decay: 0.50, tone: 0.62, buf: "bang" },
  bank:     { ring: 130, q: 1.1, decay: 0.30, tone: 0.10, buf: "thump" },
  wall:     { ring: 220, q: 1.8, decay: 0.26, tone: 0.18, buf: "bang" },
  panel:    { ring: 640, q: 3.2, decay: 0.24, tone: 0.45, buf: "clack" },
  tree:     { ring: 190, q: 2.4, decay: 0.34, tone: 0.30, buf: "thump" },
  post:     { ring: 900, q: 7.0, decay: 0.20, tone: 0.60, buf: "clack" },
  fence:    { ring: 1400, q: 4.0, decay: 0.22, tone: 0.40, buf: "clack" },
  bale:     { ring: 150, q: 0.8, decay: 0.16, tone: 0.05, buf: "thump" },
  rock:     { ring: 700, q: 3.0, decay: 0.20, tone: 0.35, buf: "clack" },
  glass:    { ring: 5200, q: 14.0, decay: 0.55, tone: 0.75, buf: "glass" },
  water:    { ring: 900, q: 0.7, decay: 0.45, tone: 0.02, buf: "slap" },
  landing:  { ring: 95, q: 1.0, decay: 0.28, tone: 0.08, buf: "thump" },
  ground:   { ring: 110, q: 1.0, decay: 0.25, tone: 0.06, buf: "thump" },
});
const IMPACT_FALLBACK = IMPACT_MATERIALS.barrier;

const PARTIALS = 24;          // half orders, so PARTIALS/2 engine orders
const STONE_VOICES = 6;
const POP_VOICES = 6;
const SUSP_VOICES = 5;
const HIT_VOICES = 5;
const CHUFF_VOICES = 3;
const STORE_KEY = "opusrally.audio.v1";

function finite(v, fallback) {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

// Every write to the graph goes through these, so a NaN out of a half-written
// physics module can never poison an AudioParam (a NaN there silences the whole
// context permanently and cannot be recovered without a rebuild).
function setP(param, value, now, tau) {
  if (!param) return;
  const v = finite(value, 0);
  if (param.setTargetAtTime) param.setTargetAtTime(v, now, tau);
  else param.value = v;
}

function jumpP(param, value, now) {
  if (!param) return;
  const v = finite(value, 0);
  if (param.setValueAtTime) param.setValueAtTime(v, now);
  else param.value = v;
}

function fillNoise(data, rng) {
  let lp = 0;
  for (let i = 0; i < data.length; i += 1) {
    const w = rng.next() * 2 - 1;
    lp = lp * 0.86 + w * 0.14;      // a touch of pink; pure white is fizzy and tiring
    data[i] = w * 0.55 + lp * 2.2;
  }
}

function decayBuffer(data, tau, sampleRate, attack) {
  const a = Math.max(1, Math.floor((attack || 0) * sampleRate));
  for (let i = 0; i < data.length; i += 1) {
    const rise = i < a ? i / a : 1;
    data[i] *= rise * Math.exp(-i / (sampleRate * tau));
  }
}

// Offline 2-pole bandpass. Doing the colouring here rather than with a runtime
// BiquadFilter is what keeps the one-shots free: a stone ping costs one buffer
// source and nothing else.
function resonate(data, freq, q, sampleRate, mix) {
  const w = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w) / (2 * Math.max(0.05, q));
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i += 1) {
    const x = data[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[i] = data[i] * (1 - mix) + y * mix;
  }
}

function normalise(data, peak) {
  let m = 0;
  for (let i = 0; i < data.length; i += 1) {
    const a = Math.abs(data[i]);
    if (a > m) m = a;
  }
  if (m < 1e-6) return;
  const k = peak / m;
  for (let i = 0; i < data.length; i += 1) data[i] *= k;
}

function makeBuffer(ctx, seconds, rng) {
  const sr = ctx.sampleRate || 48000;
  const len = Math.max(8, Math.floor(seconds * sr));
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  fillNoise(data, rng);
  return { buf, data, sr };
}

// Asymmetric soft clip. The asymmetry is deliberate: a symmetric shaper makes
// only odd harmonics and sounds like a fuzz pedal, while a real cylinder's
// pressure trace is one-sided and gives the even orders that read as "engine".
function driveCurve(n, k, bias) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    const b = x + bias;
    const y = Math.tanh(b * k) - Math.tanh(bias * k);
    curve[i] = clamp(y / Math.tanh(k + Math.abs(bias) * k), -1, 1);
  }
  return curve;
}

function readSpecEngine(spec) {
  const s = spec || {};
  const e = s.engine || s;
  const cylinders = Math.round(clamp(finite(e.cylinders ?? s.cylinders, 4), 2, 12));
  const idleRpm = clamp(finite(e.idleRpm ?? s.idleRpm, 900), 400, 3000);
  const redline = clamp(finite(e.redline ?? e.maxRpm ?? s.redline ?? s.rpmLimit, 7200), 2000, 20000);
  const limiter = clamp(finite(e.limiterRpm ?? e.rpmLimit ?? s.limiterRpm ?? s.rpmLimit, redline), idleRpm + 500, 22000);
  const turbo = !!(e.turbo ?? s.turbo ?? e.turbocharged ?? s.turbocharged);
  const antiLag = !!(e.antiLag ?? s.antiLag ?? e.antilag ?? s.antilag);
  const maxBoost = clamp(finite(e.maxBoost ?? s.maxBoost, turbo ? 1.6 : 0.001), 0.001, 6);
  const exhaustLength = clamp(finite(e.exhaustLength ?? s.exhaustLength, 3.4), 0.6, 8);
  const bodyHz = clamp(finite(e.bodyHz ?? s.bodyHz, 220 + cylinders * 26), 60, 1800);
  const id = String(s.id ?? s.name ?? e.name ?? "opus");
  // A supplied firing pattern wins; an uneven interval is exactly what makes a
  // cross-plane or an odd-fire sound like itself.
  let intervals = e.firingIntervalDeg ?? s.firingIntervalDeg ?? null;
  if (!Array.isArray(intervals) || intervals.length !== cylinders) intervals = null;
  return { cylinders, idleRpm, redline, limiter, turbo, antiLag, maxBoost, exhaustLength, bodyHz, id, intervals };
}

// Amplitude of half order n is |DFT| of the firing impulse train over the 720°
// four-stroke cycle. Perfectly even firing puts everything on multiples of the
// cylinder count; the per-cylinder strength spread leaks the rest.
function firingSpectrum(model, out) {
  const c = model.cylinders;
  const rng = makeRng(stringSeed(model.id + ":firing"));
  let phase = 0;
  let total = 0;
  const phases = new Float64Array(c);
  const weights = new Float64Array(c);
  for (let i = 0; i < c; i += 1) {
    phases[i] = phase / 720;
    const step = model.intervals ? Math.abs(finite(model.intervals[i], 720 / c)) : 720 / c;
    phase += step;
    weights[i] = clamp(1 + rng.gauss(0, 0.075), 0.6, 1.4);
    total += weights[i];
  }
  let peak = 0;
  for (let n = 1; n <= PARTIALS; n += 1) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < c; i += 1) {
      const a = 2 * Math.PI * n * phases[i];
      re += weights[i] * Math.cos(a);
      im -= weights[i] * Math.sin(a);
    }
    const mag = Math.sqrt(re * re + im * im) / total;
    // Sharp pulses roll off slowly; this is the pulse-width term, not a filter.
    const v = mag / (1 + Math.pow(n * 0.5, 0.85) * 0.35);
    out[n - 1] = v;
    if (v > peak) peak = v;
  }
  if (peak > 1e-6) for (let i = 0; i < PARTIALS; i += 1) out[i] /= peak;
}

function poolPick(pool, now) {
  let best = 0;
  let bestUntil = Infinity;
  for (let i = 0; i < pool.length; i += 1) {
    if (pool[i].until <= now) return pool[i];
    if (pool[i].until < bestUntil) { bestUntil = pool[i].until; best = i; }
  }
  return pool[best];
}

function onEndedRelease(ev) {
  const node = (ev && ev.target) || this;
  if (node && node.disconnect) {
    try { node.disconnect(); } catch (_) { /* already torn down */ }
  }
}

export function createAudio(opts = {}) {
  const listener = typeof opts.onSpeak === "function" ? opts.onSpeak : null;
  const rng = makeRng(opts.seed ?? "opus-audio");
  const storage = opts.storage ?? (typeof globalThis !== "undefined" ? globalThis.localStorage : null);

  const A = {
    ctx: null,
    built: false,
    running: false,
    failed: false,
    clock: 0,
    camera: CAMERA_MODES[opts.camera] ? opts.camera : "chase",
    cam: CAMERA_MODES[CAMERA_MODES[opts.camera] ? opts.camera : "chase"],
    master: clamp(finite(opts.masterVolume, 0.9), 0, 1),
    muted: !!opts.muted,
    busGain: Object.assign({}, DEFAULT_BUS_GAIN),
    nodes: [],
    oscs: [],
    loops: [],
    model: readSpecEngine(opts.spec),
    spec: opts.spec ?? null,
    amp: new Float32Array(PARTIALS),
    partials: [],
    buses: Object.create(null),
    // per-frame smoothed state, all preallocated
    prevGear: 0,
    gearKnown: false,
    prevThrottle: 0,
    prevBoost: 0,
    prevComp: new Float32Array(4),
    prevContact: new Uint8Array(4),
    stoneAcc: 0,
    crackleAcc: 0,
    birdAcc: 0,
    limiterUntil: 0,
    limiterOn: false,
    starterUntil: 0,
    engineOff: true,
    shiftUntil: 0,
    scrapeLevel: 0,
    scrapeRing: 900,
    duck: 1,
    heliLevel: 0,
    crowdLevel: 0,
    dawn: saturate(finite(opts.dawn, 0)),
    heliTarget: 0,
    crowdTarget: 0,
    windiness: saturate(finite(opts.windiness, 0.35)),
    started: false,
    voice: {
      queue: [],
      speaking: false,
      current: "",
      untilClock: 0,
      synth: null,
      Utter: null,
      chosen: null,
      simulated: false,
    },
    // Reused every frame: update() must not allocate.
    frame: { throttle: 0, brake: 0, load: 0, rpmN: 0, speed: 0, overrun: false },
    dbg: {
      engineHz: 0, order2Hz: 0, cylinders: 4, load: 0, rpm: 0,
      limiter: false, shiftCut: false, starter: false, overrun: false,
      boost: 0, camera: "chase",
      nodeCount: 0, sourceCount: 0, speaking: false, running: false,
    },
  };

  firingSpectrum(A.model, A.amp);
  loadSettings();

  function loadSettings() {
    if (!storage || typeof storage.getItem !== "function") return;
    let raw = null;
    try { raw = storage.getItem(STORE_KEY); } catch (_) { return; }
    if (!raw) return;
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (_) { return; }
    if (!parsed || typeof parsed !== "object") return;
    if (Number.isFinite(parsed.master)) A.master = clamp(parsed.master, 0, 1);
    if (typeof parsed.muted === "boolean") A.muted = parsed.muted;
    const b = parsed.buses;
    if (b && typeof b === "object") {
      for (let i = 0; i < AUDIO_BUSES.length; i += 1) {
        const name = AUDIO_BUSES[i];
        if (Number.isFinite(b[name])) A.busGain[name] = clamp(b[name], 0, 2);
      }
    }
  }

  function saveSettings() {
    if (!storage || typeof storage.setItem !== "function") return;
    try {
      storage.setItem(STORE_KEY, JSON.stringify({ master: A.master, muted: A.muted, buses: A.busGain }));
    } catch (_) { /* private mode, quota — never fatal for audio */ }
  }

  function track(node) {
    A.nodes.push(node);
    return node;
  }

  function gain(v) {
    const g = A.ctx.createGain();
    g.gain.value = finite(v, 1);
    return track(g);
  }

  function filter(type, freq, q, dbGain) {
    const f = A.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = finite(freq, 1000);
    if (f.Q) f.Q.value = finite(q, 1);
    if (dbGain !== undefined && f.gain) f.gain.value = finite(dbGain, 0);
    return track(f);
  }

  function osc(type, freq) {
    const o = A.ctx.createOscillator();
    o.type = type;
    o.frequency.value = finite(freq, 100);
    A.oscs.push(o);
    return track(o);
  }

  function shaper(curve, oversample) {
    const w = A.ctx.createWaveShaper();
    w.curve = curve;
    w.oversample = oversample || "2x";
    return track(w);
  }

  function loopSource(buffer, rate) {
    const s = A.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = finite(rate, 1);
    A.loops.push(s);
    return track(s);
  }

  function makePool(size, dest, type, freq, q) {
    const pool = [];
    for (let i = 0; i < size; i += 1) {
      const f = filter(type, freq, q);
      const g = gain(0);
      f.connect(g);
      g.connect(dest);
      pool.push({ filter: f, gain: g, until: 0 });
    }
    return pool;
  }

  function fireVoice(pool, buffer, now, level, freq, q, attack, decay, rate, duration) {
    if (!A.ctx || !buffer) return;
    const v = poolPick(pool, now);
    const src = A.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = clamp(finite(rate, 1), 0.06, 8);
    src.connect(v.filter);
    jumpP(v.filter.frequency, clamp(freq, 24, 18000), now);
    if (v.filter.Q) jumpP(v.filter.Q, clamp(q, 0.05, 40), now);
    const g = v.gain.gain;
    const lvl = clamp(finite(level, 0), 0, 3);
    if (g.cancelScheduledValues) g.cancelScheduledValues(now);
    jumpP(g, 0.0001, now);
    if (g.linearRampToValueAtTime) g.linearRampToValueAtTime(lvl, now + attack);
    else g.value = lvl;
    setP(g, 0, now + attack, Math.max(0.005, decay * 0.36));
    const dur = clamp(finite(duration, attack + decay * 3), 0.01, 6);
    src.onended = onEndedRelease;
    src.start(now);
    src.stop(now + dur);
    v.until = now + Math.min(dur, attack + decay * 2.2);
    A.sourceCount += 1;
  }

  A.sourceCount = 0;

  function buildBuffers() {
    const r = rng.fork("buffers");
    const b = {};
    b.noiseA = makeBuffer(A.ctx, 2.0, r).buf;
    b.noiseB = makeBuffer(A.ctx, 2.3, r).buf;

    const stones = [];
    for (let i = 0; i < 3; i += 1) {
      const s = makeBuffer(A.ctx, 0.055, r);
      resonate(s.data, 2400 + i * 1500, 11 + i * 4, s.sr, 0.9);
      decayBuffer(s.data, 0.010 + i * 0.003, s.sr, 0.0004);
      normalise(s.data, 0.9);
      stones.push(s.buf);
    }
    b.stones = stones;

    const thump = makeBuffer(A.ctx, 0.34, r);
    resonate(thump.data, 62, 2.6, thump.sr, 0.92);
    decayBuffer(thump.data, 0.075, thump.sr, 0.002);
    normalise(thump.data, 0.95);
    b.thump = thump.buf;

    const clack = makeBuffer(A.ctx, 0.10, r);
    resonate(clack.data, 1500, 7, clack.sr, 0.7);
    decayBuffer(clack.data, 0.014, clack.sr, 0.0004);
    normalise(clack.data, 0.9);
    b.clack = clack.buf;

    const pop = makeBuffer(A.ctx, 0.14, r);
    resonate(pop.data, 340, 2.2, pop.sr, 0.65);
    decayBuffer(pop.data, 0.022, pop.sr, 0.0006);
    normalise(pop.data, 0.9);
    b.pop = pop.buf;

    const bang = makeBuffer(A.ctx, 0.40, r);
    resonate(bang.data, 115, 1.5, bang.sr, 0.6);
    decayBuffer(bang.data, 0.070, bang.sr, 0.0012);
    normalise(bang.data, 1.0);
    b.bang = bang.buf;

    const glass = makeBuffer(A.ctx, 0.6, r);
    resonate(glass.data, 5100, 22, glass.sr, 0.55);
    resonate(glass.data, 7300, 26, glass.sr, 0.35);
    decayBuffer(glass.data, 0.16, glass.sr, 0.0004);
    normalise(glass.data, 0.85);
    b.glass = glass.buf;

    const slap = makeBuffer(A.ctx, 0.22, r);
    resonate(slap.data, 260, 1.8, slap.sr, 0.8);
    decayBuffer(slap.data, 0.045, slap.sr, 0.002);
    normalise(slap.data, 0.9);
    b.slap = slap.buf;

    const chuff = makeBuffer(A.ctx, 0.30, r);
    decayBuffer(chuff.data, 0.055, chuff.sr, 0.004);
    normalise(chuff.data, 0.85);
    b.chuff = chuff.buf;

    return b;
  }

  function buildGraph() {
    const ctx = A.ctx;
    A.buf = buildBuffers();

    // Master: limiter last so nothing downstream can push it back into clip.
    A.limiterNode = ctx.createDynamicsCompressor();
    track(A.limiterNode);
    if (A.limiterNode.threshold) A.limiterNode.threshold.value = -4;
    if (A.limiterNode.knee) A.limiterNode.knee.value = 0;
    if (A.limiterNode.ratio) A.limiterNode.ratio.value = 20;
    if (A.limiterNode.attack) A.limiterNode.attack.value = 0.003;
    if (A.limiterNode.release) A.limiterNode.release.value = 0.22;
    A.limiterNode.connect(ctx.destination);

    A.masterGain = gain(0.0001);
    A.masterGain.connect(A.limiterNode);

    A.cabinGain = gain(1);
    A.cabinFilter = filter("lowpass", A.cam.lp, 0.7);
    A.cabinFilter.connect(A.cabinGain);
    A.cabinGain.connect(A.masterGain);

    A.directGain = gain(1);
    A.directGain.connect(A.masterGain);

    for (let i = 0; i < AUDIO_BUSES.length; i += 1) {
      const name = AUDIO_BUSES[i];
      const g = gain(A.busGain[name]);
      // Voice and music bypass the cabin filter: a muffled co-driver is a bug,
      // not realism — you need the call whatever camera you are in.
      g.connect(name === "voice" || name === "music" ? A.directGain : A.cabinFilter);
      A.buses[name] = g;
    }

    // Engine additive stack.
    A.engineSum = gain(0.0001);
    A.partials.length = 0;
    for (let n = 1; n <= PARTIALS; n += 1) {
      const o = osc("sine", 60 * (n * 0.5));
      const g = gain(0);
      o.connect(g);
      g.connect(A.engineSum);
      A.partials.push({ osc: o, gain: g, order: n * 0.5 });
    }

    // Idle lope: a half-order wobble, i.e. once per full four-stroke cycle,
    // which is exactly the beat cylinder-to-cylinder imbalance produces.
    A.lopeOsc = osc("sine", 7);
    A.lopeGain = gain(0);
    A.lopeOsc.connect(A.lopeGain);
    A.lopeGain.connect(A.engineSum.gain);

    A.intakeDrive = gain(1);
    A.intakeShaper = shaper(driveCurve(2048, 2.6, 0.12));
    A.intakeComp = gain(1);
    A.bodyFilter = filter("peaking", A.model.bodyHz, 1.4, 6);
    A.bodyTone = filter("lowpass", 4200, 0.8);
    A.engineShiftCut = gain(1);
    A.engineLimitCut = gain(1);
    A.engineSum.connect(A.intakeDrive);
    A.intakeDrive.connect(A.intakeShaper);
    A.intakeShaper.connect(A.intakeComp);
    A.intakeComp.connect(A.bodyFilter);
    A.bodyFilter.connect(A.bodyTone);
    A.bodyTone.connect(A.engineShiftCut);
    A.engineShiftCut.connect(A.engineLimitCut);
    A.engineLimitCut.connect(A.buses.engine);

    // Exhaust: its own drive, a short delay standing in for the pipe length and
    // a resonant feedback loop that gives the tailpipe its own note.
    A.exhaustPre = gain(0.8);
    A.exhaustDelay = ctx.createDelay ? track(ctx.createDelay(0.2)) : null;
    if (A.exhaustDelay) A.exhaustDelay.delayTime.value = clamp(A.model.exhaustLength / 343, 0.001, 0.1);
    A.exhaustRes = filter("peaking", 340 / Math.max(0.5, A.model.exhaustLength), 3.2, 9);
    A.exhaustFb = gain(0.42);
    A.exhaustDrive = gain(1);
    A.exhaustShaper = shaper(driveCurve(2048, 3.4, 0.22));
    A.exhaustTone = filter("lowpass", 3600, 0.9);
    A.exhaustCut = gain(1);
    A.engineSum.connect(A.exhaustPre);
    if (A.exhaustDelay) {
      A.exhaustPre.connect(A.exhaustDelay);
      A.exhaustDelay.connect(A.exhaustRes);
      A.exhaustRes.connect(A.exhaustFb);
      A.exhaustFb.connect(A.exhaustDelay);
    } else {
      A.exhaustPre.connect(A.exhaustRes);
    }
    A.exhaustRes.connect(A.exhaustDrive);
    A.exhaustDrive.connect(A.exhaustShaper);
    A.exhaustShaper.connect(A.exhaustTone);
    A.exhaustTone.connect(A.exhaustCut);
    A.exhaustCut.connect(A.buses.exhaust);

    // Turbo: a pure tone for the compressor whine plus a narrow noise band for
    // the air rush, both rising with spool rather than with rpm.
    A.turboOsc = osc("sine", 2400);
    A.turboOsc2 = osc("triangle", 3600);
    A.turboGain = gain(0);
    A.turboOsc.connect(A.turboGain);
    A.turboOsc2.connect(A.turboGain);
    A.turboNoiseFilter = filter("bandpass", 5200, 9);
    A.turboNoiseGain = gain(0);
    A.turboGain.connect(A.buses.engine);
    A.turboNoiseFilter.connect(A.turboNoiseGain);
    A.turboNoiseGain.connect(A.buses.engine);

    // Transmission and final drive whine, pitched off the mesh rate.
    A.gearOsc = osc("sawtooth", 400);
    A.gearOsc2 = osc("sine", 800);
    A.gearFilter = filter("bandpass", 900, 6);
    A.gearGain = gain(0);
    A.gearOsc.connect(A.gearFilter);
    A.gearOsc2.connect(A.gearFilter);
    A.gearFilter.connect(A.gearGain);
    A.gearGain.connect(A.buses.engine);

    A.diffOsc = osc("sawtooth", 300);
    A.diffFilter = filter("bandpass", 1400, 9);
    A.diffGain = gain(0);
    A.diffOsc.connect(A.diffFilter);
    A.diffFilter.connect(A.diffGain);
    A.diffGain.connect(A.buses.engine);

    // Starter motor: a whirring saw plus brush noise, gated by its own envelope.
    A.starterOsc = osc("sawtooth", 46);
    A.starterFilter = filter("bandpass", 780, 3.5);
    A.starterGain = gain(0);
    A.starterOsc.connect(A.starterFilter);
    A.starterNoiseFilter = filter("bandpass", 1800, 2.5);
    A.starterNoiseGain = gain(0);
    A.starterFilter.connect(A.starterGain);
    A.starterNoiseFilter.connect(A.starterNoiseGain);
    A.starterGain.connect(A.buses.engine);
    A.starterNoiseGain.connect(A.buses.engine);

    // Looping noise beds. Different playback rates decorrelate the four wheels
    // from two buffers, which sounds like four contact patches instead of one.
    A.srcWheel = [];
    A.wheelChain = [];
    const rates = [0.93, 1.0, 1.07, 1.13];
    for (let i = 0; i < 4; i += 1) {
      const src = loopSource(i % 2 === 0 ? A.buf.noiseA : A.buf.noiseB, rates[i]);
      const bp = filter("bandpass", 1200, 0.6);
      const lp = filter("lowpass", 7000, 0.7);
      const g = gain(0);
      src.connect(bp);
      bp.connect(lp);
      lp.connect(g);
      g.connect(A.buses.surface);
      A.srcWheel.push(src);
      A.wheelChain.push({ bp, lp, gain: g });
    }

    A.srcMisc = loopSource(A.buf.noiseB, 1.0);
    A.srcWind = loopSource(A.buf.noiseA, 0.79);
    A.srcAmb = loopSource(A.buf.noiseB, 0.61);
    A.srcMisc.connect(A.turboNoiseFilter);
    A.srcMisc.connect(A.starterNoiseFilter);

    A.sprayFilter = filter("highpass", 2600, 0.7);
    A.sprayGain = gain(0);
    A.srcMisc.connect(A.sprayFilter);
    A.sprayFilter.connect(A.sprayGain);
    A.sprayGain.connect(A.buses.surface);

    // Tyres: three distinct mechanisms, not one squeal with a filter on it.
    A.squealOsc = osc("sawtooth", 640);
    A.squealOsc2 = osc("sawtooth", 648);
    A.squealFilter = filter("bandpass", 1300, 7);
    A.squealShaper = shaper(driveCurve(1024, 2.0, 0.05));
    A.squealGain = gain(0);
    A.squealOsc.connect(A.squealShaper);
    A.squealOsc2.connect(A.squealShaper);
    A.squealShaper.connect(A.squealFilter);
    A.squealFilter.connect(A.squealGain);
    A.squealGain.connect(A.buses.tyres);

    A.scrabbleFilter = filter("bandpass", 900, 1.2);
    A.scrabbleGain = gain(0);
    A.srcMisc.connect(A.scrabbleFilter);
    A.scrabbleFilter.connect(A.scrabbleGain);
    A.scrabbleGain.connect(A.buses.tyres);

    A.howlOsc = osc("triangle", 220);
    A.howlFilter = filter("bandpass", 480, 11);
    A.howlGain = gain(0);
    A.howlOsc.connect(A.howlFilter);
    A.srcMisc.connect(A.howlFilter);
    A.howlFilter.connect(A.howlGain);
    A.howlGain.connect(A.buses.tyres);

    // Wind, with a separate whistle band so it does not just get louder.
    A.windFilter = filter("lowpass", 500, 0.6);
    A.windGain = gain(0);
    A.srcWind.connect(A.windFilter);
    A.windFilter.connect(A.windGain);
    A.windGain.connect(A.buses.wind);
    A.whistleFilter = filter("bandpass", 1900, 4);
    A.whistleGain = gain(0);
    A.srcWind.connect(A.whistleFilter);
    A.whistleFilter.connect(A.whistleGain);
    A.whistleGain.connect(A.buses.wind);

    // Ambience.
    A.treesFilter = filter("bandpass", 1500, 0.9);
    A.treesGain = gain(0);
    A.srcAmb.connect(A.treesFilter);
    A.treesFilter.connect(A.treesGain);
    A.treesGain.connect(A.buses.ambience);
    A.treesLfo = osc("sine", 0.13);
    A.treesLfoGain = gain(0);
    A.treesLfo.connect(A.treesLfoGain);
    A.treesLfoGain.connect(A.treesGain.gain);

    A.crowdFilter = filter("bandpass", 800, 1.6);
    A.crowdGain = gain(0);
    A.srcAmb.connect(A.crowdFilter);
    A.crowdFilter.connect(A.crowdGain);
    A.crowdGain.connect(A.buses.ambience);
    A.crowdLfo = osc("sine", 0.21);
    A.crowdLfoGain = gain(0);
    A.crowdLfo.connect(A.crowdLfoGain);
    A.crowdLfoGain.connect(A.crowdGain.gain);

    A.heliOsc = osc("sawtooth", 21);
    A.heliFilter = filter("lowpass", 380, 1.1);
    A.heliGain = gain(0);
    A.heliOsc.connect(A.heliFilter);
    A.srcAmb.connect(A.heliFilter);
    A.heliFilter.connect(A.heliGain);
    A.heliGain.connect(A.buses.ambience);
    A.heliLfo = osc("sine", 11.4);   // blade pass, the chop you hear before the engine
    A.heliLfoGain = gain(0);
    A.heliLfo.connect(A.heliLfoGain);
    A.heliLfoGain.connect(A.heliGain.gain);

    A.birdOsc = osc("sine", 3200);
    A.birdFilter = filter("bandpass", 3200, 6);
    A.birdGain = gain(0);
    A.birdOsc.connect(A.birdFilter);
    A.birdFilter.connect(A.birdGain);
    A.birdGain.connect(A.buses.ambience);

    // Scrape along a barrier: a loop, because it is a continuous condition.
    A.scrapeFilter = filter("bandpass", 1100, 3.5);
    A.scrapeGain = gain(0);
    A.srcMisc.connect(A.scrapeFilter);
    A.scrapeFilter.connect(A.scrapeGain);
    A.scrapeGain.connect(A.buses.impacts);

    A.stonePool = makePool(STONE_VOICES, A.buses.surface, "bandpass", 3000, 6);
    A.popPool = makePool(POP_VOICES, A.buses.exhaust, "bandpass", 500, 2.5);
    A.chuffPool = makePool(CHUFF_VOICES, A.buses.exhaust, "bandpass", 2400, 1.4);
    A.suspPool = makePool(SUSP_VOICES, A.buses.impacts, "lowpass", 400, 1.0);
    A.hitPool = makePool(HIT_VOICES, A.buses.impacts, "bandpass", 400, 3);

    for (let i = 0; i < A.oscs.length; i += 1) {
      if (A.oscs[i].start) A.oscs[i].start(0);
    }
    for (let i = 0; i < A.loops.length; i += 1) {
      if (A.loops[i].start) A.loops[i].start(0);
    }

    A.built = true;
  }

  function applyCamera(now) {
    const c = A.cam;
    setP(A.cabinFilter.frequency, c.lp, now, 0.08);
    setP(A.cabinGain.gain, c.gain, now, 0.08);
  }

  function busTarget(name) {
    const c = A.cam;
    let g = A.busGain[name];
    if (name === "exhaust") g *= c.exhaust;
    else if (name === "wind") g *= c.wind;
    else if (name === "surface") g *= c.surface;
    else if (name === "engine") g *= c.engine;
    // Impacts and music keep their level while the co-driver talks — ducking a
    // crash is worse than talking over it.
    if (name !== "voice" && name !== "impacts" && name !== "music") g *= A.duck;
    return clamp(finite(g, 0), 0, 3);
  }

  function pumpVoice(dt) {
    const v = A.voice;
    if (v.speaking && v.simulated) {
      v.untilClock -= dt;
      if (v.untilClock <= 0) finishSpeech();
    }
    if (!v.speaking && v.queue.length > 0) startSpeech(v.queue.shift());
  }

  function finishSpeech() {
    const v = A.voice;
    v.speaking = false;
    v.simulated = false;
    v.current = "";
    if (listener) listener("", "end");
  }

  function resolveSynth() {
    const v = A.voice;
    if (v.synth !== null || v.resolved) return;
    v.resolved = true;
    const provided = opts.speech;
    const g = typeof globalThis !== "undefined" ? globalThis : null;
    v.synth = (provided && provided.synth) || (g && g.speechSynthesis) || null;
    v.Utter = (provided && provided.Utterance) || (g && g.SpeechSynthesisUtterance) || null;
  }

  function chooseVoice() {
    const v = A.voice;
    if (!v.synth || typeof v.synth.getVoices !== "function") return null;
    if (v.chosen) return v.chosen;
    const list = v.synth.getVoices();
    if (!list || list.length === 0) return null;   // often empty until voiceschanged
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < list.length; i += 1) {
      const cand = list[i];
      const lang = String(cand.lang || "").toLowerCase();
      let score = 0;
      if (lang.startsWith("en-gb")) score += 6;
      else if (lang.startsWith("en")) score += 4;
      if (cand.localService) score += 2;
      if (cand.default) score += 1;
      if (score > bestScore) { bestScore = score; best = cand; }
    }
    v.chosen = best;
    return best;
  }

  function startSpeech(text) {
    const v = A.voice;
    v.speaking = true;
    v.current = text;
    if (listener) listener(text, "start");
    resolveSynth();
    if (!v.synth || !v.Utter || typeof v.synth.speak !== "function") {
      // No SpeechSynthesis: stay silent but keep the queue timing honest so the
      // HUD callback and the engine ducking still behave.
      v.simulated = true;
      v.untilClock = 0.35 + text.length * 0.055;
      return;
    }
    let u = null;
    try {
      u = new v.Utter(text);
    } catch (_) {
      v.simulated = true;
      v.untilClock = 0.35 + text.length * 0.055;
      return;
    }
    const chosen = chooseVoice();
    if (chosen) u.voice = chosen;
    u.lang = (chosen && chosen.lang) || "en-GB";
    u.rate = clamp(finite(opts.voiceRate, 1.28), 0.5, 2);   // clipped, like a real call
    u.pitch = clamp(finite(opts.voicePitch, 0.95), 0.4, 2);
    u.volume = clamp(A.busGain.voice * (A.muted ? 0 : 1), 0, 1);
    u.onend = finishSpeech;
    u.onerror = finishSpeech;
    try {
      v.synth.speak(u);
    } catch (_) {
      v.simulated = true;
      v.untilClock = 0.35 + text.length * 0.055;
    }
  }

  function updateEngine(state, now, dt) {
    const model = A.model;
    const input = state.input;
    const throttle = saturate(finite(input && input.throttle, 0));
    const brake = saturate(finite(input && input.brake, 0));
    const rpmRaw = clamp(finite(state.engineRpm, 0), 0, 25000);
    const running = rpmRaw > 1;
    // One continuous rpm->Hz map, always. Anything piecewise here is audible as
    // a click on every gearshift.
    const hz = Math.max(rpmRaw, 90) / 60;
    const rpmN = saturate((rpmRaw - model.idleRpm) / Math.max(500, model.redline - model.idleRpm));
    const load = saturate(finite(state.engineLoad, throttle));

    A.dbg.engineHz = hz;
    A.dbg.order2Hz = hz * 2;
    A.dbg.rpm = rpmRaw;
    A.dbg.load = load;
    A.dbg.cylinders = model.cylinders;

    const cut = lerp(3.0, 9.5, load) * lerp(0.8, 1.35, rpmN);
    for (let i = 0; i < A.partials.length; i += 1) {
      const p = A.partials[i];
      setP(p.osc.frequency, hz * p.order, now, 0.010);
      const roll = 1 / (1 + Math.pow(p.order / cut, 2.1));
      setP(p.gain.gain, A.amp[i] * roll * 0.35, now, 0.020);
    }

    const idleness = smoothstep(model.idleRpm * 1.6, model.idleRpm * 0.85, rpmRaw);
    setP(A.lopeOsc.frequency, hz * 0.5, now, 0.03);
    setP(A.lopeGain.gain, running ? idleness * 0.30 : 0, now, 0.05);

    const level = running ? (0.14 + 0.42 * load + 0.30 * rpmN) : 0;
    setP(A.engineSum.gain, level, now, 0.02);

    const drive = 0.5 + load * 2.6 + rpmN * 0.7;
    setP(A.intakeDrive.gain, drive, now, 0.03);
    setP(A.intakeComp.gain, 1 / (0.7 + drive * 0.55), now, 0.03);
    setP(A.bodyFilter.frequency, model.bodyHz * lerp(0.9, 1.25, rpmN), now, 0.05);
    setP(A.bodyTone.frequency, lerp(2200, 8000, 0.35 * rpmN + 0.65 * load), now, 0.04);

    const overrun = running && throttle < 0.08 && rpmRaw > model.idleRpm * 1.5;
    setP(A.exhaustPre.gain, running ? lerp(0.55, 1.0, load) : 0, now, 0.03);
    setP(A.exhaustDrive.gain, 0.7 + load * 2.2 + (overrun ? 0.9 : 0), now, 0.04);
    setP(A.exhaustTone.frequency, lerp(1800, 6200, load * 0.7 + rpmN * 0.3), now, 0.04);
    if (A.exhaustDelay) {
      setP(A.exhaustFb.gain, clamp(0.30 + 0.18 * load, 0, 0.6), now, 0.05);
    }

    // Rev limiter: a hard ignition chop, scheduled in short blocks so the
    // automation list can never run away.
    const atLimit = running && rpmRaw >= model.limiter - 40;
    if (atLimit) {
      if (now >= A.limiterUntil) {
        const period = 0.0135;
        let t = Math.max(now, A.limiterUntil);
        for (let i = 0; i < 6; i += 1) {
          jumpP(A.engineLimitCut.gain, 0.05, t);
          jumpP(A.engineLimitCut.gain, 1, t + period * 0.42);
          t += period;
        }
        A.limiterUntil = t;
        A.limiterOn = true;
      }
    } else if (A.limiterOn) {
      if (A.engineLimitCut.gain.cancelScheduledValues) A.engineLimitCut.gain.cancelScheduledValues(now);
      jumpP(A.engineLimitCut.gain, 1, now);
      A.limiterOn = false;
      A.limiterUntil = 0;
    }
    A.dbg.limiter = A.limiterOn;

    // Shift torque cut: pitch is untouched, only the throat closes.
    const gear = Math.round(finite(state.gear, A.prevGear));
    const shiftTimer = Math.max(0, finite(state.gearShiftTimer, 0));
    if (!A.gearKnown) {
      A.gearKnown = true;
      A.prevGear = gear;
    }
    if (gear !== A.prevGear) {
      const dur = clamp(shiftTimer > 0 ? shiftTimer : 0.07, 0.03, 0.4);
      const g = A.engineShiftCut.gain;
      if (g.cancelScheduledValues) g.cancelScheduledValues(now);
      jumpP(g, 1, now);
      if (g.linearRampToValueAtTime) {
        g.linearRampToValueAtTime(0.22, now + 0.012);
        g.linearRampToValueAtTime(0.22, now + dur * 0.7);
        g.linearRampToValueAtTime(1, now + dur + 0.05);
      }
      A.shiftUntil = now + dur + 0.05;
      const down = gear < A.prevGear && gear > 0;
      fireVoice(A.popPool, A.buf.pop, now + dur * 0.55,
        down ? 0.55 : 0.32, down ? 420 : 620, 2.4, 0.002, 0.05,
        0.9 + rng.next() * 0.25, 0.16);
      A.prevGear = gear;
    }
    A.dbg.shiftCut = now < A.shiftUntil;

    // Overrun crackle. Rate follows revs, because the pops are unburnt charges
    // arriving in the pipe at the firing rate.
    if (overrun) {
      const antilag = model.antiLag;
      const rate = (antilag ? 14 : 5) * (0.35 + rpmN);
      A.crackleAcc += rate * dt;
      let guard = 0;
      while (A.crackleAcc >= 1 && guard < 4) {
        A.crackleAcc -= 1;
        guard += 1;
        const big = antilag && rng.chance(0.35);
        fireVoice(A.popPool, big ? A.buf.bang : A.buf.pop, now,
          big ? 0.85 : 0.22 + rng.next() * 0.2,
          big ? 180 + rng.next() * 90 : 520 + rng.next() * 900,
          big ? 1.6 : 3.0, 0.0015, big ? 0.12 : 0.03,
          0.75 + rng.next() * 0.6, big ? 0.4 : 0.12);
      }
    } else {
      A.crackleAcc = 0;
    }

    // Turbo.
    const boostRaw = finite(state.turboBoost, 0);
    const boost = model.turbo ? saturate(boostRaw / model.maxBoost) : 0;
    const spool = model.turbo ? saturate(finite(state.turboSpool, boost)) : 0;
    A.dbg.boost = boost;
    setP(A.turboOsc.frequency, lerp(1600, 7600, spool), now, 0.05);
    setP(A.turboOsc2.frequency, lerp(2400, 11400, spool), now, 0.05);
    setP(A.turboGain.gain, model.turbo ? spool * spool * 0.16 * lerp(0.4, 1, throttle) : 0, now, 0.05);
    setP(A.turboNoiseFilter.frequency, lerp(3200, 9000, spool), now, 0.05);
    setP(A.turboNoiseGain.gain, model.turbo ? spool * 0.12 : 0, now, 0.05);

    // Dump valve on a real lift, not on every throttle wobble.
    const dThrottle = throttle - A.prevThrottle;
    if (model.turbo && dThrottle < -0.35 && A.prevBoost > 0.18) {
      fireVoice(A.chuffPool, A.buf.chuff, now, 0.30 + A.prevBoost * 0.5,
        lerp(1800, 3600, A.prevBoost), 1.2, 0.004, 0.09, 1.0, 0.30);
    }
    A.prevThrottle = throttle;
    A.prevBoost = boost;

    // Transmission whine: mesh rate off the gearbox ratio, diff whine off the
    // wheels, so an unloaded coast still sings but at a different pitch.
    const ratio = gearRatio(state, gear);
    const meshHz = clamp(hz * (7 + Math.abs(ratio) * 3.5), 40, 5200);
    setP(A.gearOsc.frequency, meshHz, now, 0.03);
    setP(A.gearOsc2.frequency, meshHz * 2, now, 0.03);
    setP(A.gearFilter.frequency, clamp(meshHz * 1.6, 60, 9000), now, 0.04);
    const drivetrain = gear !== 0 && running ? (0.010 + 0.035 * load) * saturate(rpmN + 0.25) : 0;
    setP(A.gearGain.gain, drivetrain, now, 0.05);

    const speed = Math.abs(finite(state.speed, 0));
    const diffHz = clamp(speed * 9.5, 20, 4000);
    setP(A.diffOsc.frequency, diffHz, now, 0.04);
    setP(A.diffFilter.frequency, clamp(diffHz * 2.2, 60, 9000), now, 0.05);
    setP(A.diffGain.gain, saturate(speed / 30) * 0.018, now, 0.06);

    // Starter: explicit via ignition(), or implicit the first frame the engine
    // comes alive so a car that simply appears running still cranks once.
    if (!running) {
      A.engineOff = true;
    } else if (A.engineOff) {
      A.engineOff = false;
      if (now >= A.starterUntil) A.starterUntil = now + 0.5;
    }
    const cranking = now < A.starterUntil;
    A.dbg.starter = cranking;
    A.dbg.overrun = overrun;
    const crankLeft = cranking ? saturate((A.starterUntil - now) / 0.9) : 0;
    const starterLevel = cranking ? 0.20 * smoothstep(0, 0.16, crankLeft) : 0;
    setP(A.starterGain.gain, starterLevel, now, 0.03);
    setP(A.starterNoiseGain.gain, starterLevel * 0.8, now, 0.03);
    // The motor speeds up as the engine starts to help it along.
    if (cranking) setP(A.starterOsc.frequency, lerp(38, 62, 1 - crankLeft), now, 0.08);

    const f = A.frame;
    f.throttle = throttle;
    f.brake = brake;
    f.load = load;
    f.rpmN = rpmN;
    f.speed = speed;
    f.overrun = overrun;
    return f;
  }

  function gearRatio(state, gear) {
    const spec = state.spec || A.spec;
    const ratios = spec && (spec.gearRatios || (spec.transmission && spec.transmission.ratios));
    if (Array.isArray(ratios) && gear > 0 && gear <= ratios.length) {
      return finite(ratios[gear - 1], 3.2 / gear);
    }
    if (gear === 0) return 0;
    return gear < 0 ? 3.6 : 3.6 / Math.max(1, gear) + 0.6;
  }

  function updateSurface(state, now, dt, ctxv) {
    const wheels = state.wheels;
    const speed = ctxv.speed;
    const spec = state.spec || A.spec;
    const restLoad = Math.max(600, finite(spec && spec.mass, 1200) * 9.81 * 0.25);
    let stoneScale = 0;
    let sprayLevel = 0;
    let scrabble = 0;
    let squeal = 0;
    let squealHz = 700;
    let howl = 0;

    for (let i = 0; i < 4; i += 1) {
      const w = wheels && wheels[i];
      const chain = A.wheelChain[i];
      if (!w) { setP(chain.gain.gain, 0, now, 0.05); continue; }
      const props = surfaceProps(finite(w.surfaceId, 1));
      const sfx = SFX[props.sfx] || SFX_FALLBACK;
      const contact = w.contact !== false;
      const loadN = clamp(finite(w.load, restLoad), 0, restLoad * 6);
      const loadN01 = saturate(loadN / (restLoad * 1.8));
      const roll = contact ? saturate(speed / 26) : 0;
      const level = roll * sfx.level * (0.35 + 0.65 * loadN01) * 0.20;
      setP(chain.gain.gain, level, now, 0.05);
      setP(chain.bp.frequency, sfx.bp * lerp(0.75, 1.5, saturate(speed / 45)), now, 0.06);
      if (chain.bp.Q) setP(chain.bp.Q, sfx.q, now, 0.1);
      setP(chain.lp.frequency, sfx.lp, now, 0.1);

      if (contact) {
        stoneScale += sfx.stones * loadN01;
        sprayLevel += sfx.spray * loadN01 * roll;
        const slip = Math.abs(finite(w.slipAngle, 0));
        const gripUsed = saturate(finite(w.gripUsed, 0));
        const loose = props.looseDepth;
        // Two different mechanisms: tarmac shears rubber and squeals, gravel
        // just throws stones and scrabbles.
        squeal += (1 - loose) * saturate(slip / 0.28) * gripUsed * loadN01;
        scrabble += loose * gripUsed * saturate(speed / 20) * loadN01;
        const ratio = finite(w.slipRatio, 0);
        if (ctxv.brake > 0.4 && ratio < -0.55 && speed > 4) howl += (1 - loose * 0.6) * loadN01;
        squealHz += slip * 220;
      }

      // Suspension events, from the compression trace rather than a collision.
      const comp = saturate(finite(w.compression, 0));
      const rate = dt > 1e-5 ? (comp - A.prevComp[i]) / dt : 0;
      const landed = contact && !A.prevContact[i];
      if (rate > 3.2 || (landed && comp > 0.25)) {
        const strength = saturate((rate - 2.0) / 10 + (landed ? 0.35 : 0));
        if (strength > 0.04) {
          fireVoice(A.suspPool, A.buf.thump, now, 0.22 + strength * 0.75,
            lerp(120, 420, strength), 1.0, 0.003, 0.09,
            lerp(0.8, 1.25, strength), 0.34);
        }
      }
      if (comp > 0.965 && A.prevComp[i] <= 0.965) {
        fireVoice(A.suspPool, A.buf.clack, now, 0.55, 1500, 6, 0.001, 0.02, 1.0, 0.10);
      }
      A.prevComp[i] = comp;
      A.prevContact[i] = contact ? 1 : 0;
    }

    setP(A.sprayGain.gain, saturate(sprayLevel * 0.25) * saturate(speed / 22) * 0.35, now, 0.06);
    setP(A.sprayFilter.frequency, lerp(2000, 5200, saturate(speed / 40)), now, 0.08);

    // Stones off the underbody: a Poisson-ish rate driven by speed and how much
    // loose material the wheels are actually throwing.
    // Clamped, not just scaled: an unbounded rate would run the accumulator to
    // infinity on one bad speed and never recover.
    const stoneRate = clamp(stoneScale * speed * 0.45, 0, 55);
    if (stoneRate > 0.01) {
      A.stoneAcc += stoneRate * dt;
      let guard = 0;
      while (A.stoneAcc >= 1 && guard < 6) {
        A.stoneAcc -= 1;
        guard += 1;
        const b = A.buf.stones[(rng.next() * A.buf.stones.length) | 0];
        fireVoice(A.stonePool, b, now, 0.10 + rng.next() * 0.28,
          2000 + rng.next() * 4200, 5 + rng.next() * 8,
          0.0008, 0.02, 0.8 + rng.next() * 0.7, 0.09);
      }
    } else {
      A.stoneAcc = 0;
    }

    setP(A.squealGain.gain, saturate(squeal * 0.5) * 0.16, now, 0.04);
    const sq = clamp(squealHz, 380, 2200);
    setP(A.squealOsc.frequency, sq, now, 0.05);
    setP(A.squealOsc2.frequency, sq * 1.012, now, 0.05);
    setP(A.squealFilter.frequency, clamp(sq * 2.1, 200, 9000), now, 0.06);

    setP(A.scrabbleGain.gain, saturate(scrabble * 0.35) * 0.22, now, 0.05);
    setP(A.scrabbleFilter.frequency, lerp(600, 2200, saturate(speed / 35)), now, 0.08);

    setP(A.howlGain.gain, saturate(howl * 0.4) * 0.20, now, 0.03);
    setP(A.howlOsc.frequency, lerp(150, 320, saturate(speed / 40)), now, 0.05);
    setP(A.howlFilter.frequency, lerp(380, 720, saturate(speed / 40)), now, 0.06);
  }

  function updateAir(state, now, dt, ctxv) {
    const speed = ctxv.speed;
    const q = speed * speed;
    setP(A.windGain.gain, saturate(q / 2600) * 0.32, now, 0.06);
    setP(A.windFilter.frequency, lerp(300, 1600, saturate(speed / 55)), now, 0.08);
    setP(A.whistleGain.gain, saturate((speed - 18) / 45) * 0.10, now, 0.08);
    setP(A.whistleFilter.frequency, lerp(1500, 3400, saturate(speed / 60)), now, 0.1);

    A.heliLevel = damp(A.heliLevel, A.heliTarget, 0.8, dt);
    A.crowdLevel = damp(A.crowdLevel, A.crowdTarget, 1.2, dt);
    setP(A.treesGain.gain, 0.06 + 0.05 * A.windiness, now, 0.2);
    setP(A.treesLfoGain.gain, 0.035, now, 0.2);
    setP(A.crowdGain.gain, A.crowdLevel * 0.14, now, 0.2);
    setP(A.crowdLfoGain.gain, A.crowdLevel * 0.05, now, 0.2);
    setP(A.heliGain.gain, A.heliLevel * 0.10, now, 0.2);
    setP(A.heliLfoGain.gain, A.heliLevel * 0.09, now, 0.2);

    // Birds only at dawn, and never over the engine.
    if (A.dawn > 0.01) {
      A.birdAcc += dt * (0.35 + A.dawn * 0.9);
      if (A.birdAcc >= 1) {
        A.birdAcc = 0;
        const f = 2400 + rng.next() * 2600;
        const g = A.birdGain.gain;
        setP(A.birdFilter.frequency, f, now, 0.001);
        jumpP(A.birdOsc.frequency, f, now);
        if (A.birdOsc.frequency.linearRampToValueAtTime) {
          A.birdOsc.frequency.linearRampToValueAtTime(f * (1.2 + rng.next() * 0.5), now + 0.06);
          A.birdOsc.frequency.linearRampToValueAtTime(f * 0.85, now + 0.13);
        }
        jumpP(g, 0.0001, now);
        if (g.linearRampToValueAtTime) g.linearRampToValueAtTime(A.dawn * 0.05, now + 0.02);
        setP(g, 0, now + 0.05, 0.05);
      }
    }

    A.scrapeLevel *= Math.exp(-7 * dt);
    setP(A.scrapeGain.gain, saturate(A.scrapeLevel) * 0.30, now, 0.03);
    setP(A.scrapeFilter.frequency, A.scrapeRing, now, 0.05);
  }

  const api = {
    // No AudioContext until here: the autoplay policy requires a gesture, and
    // constructing one earlier leaves a permanently suspended context behind.
    start() {
      if (A.failed) return false;
      if (A.built) {
        A.running = true;
        if (A.ctx && A.ctx.resume) { try { A.ctx.resume(); } catch (_) { /* ignore */ } }
        const now = A.ctx.currentTime;
        setP(A.masterGain.gain, A.muted ? 0 : A.master, now, 0.05);
        return true;
      }
      let ctx = null;
      try {
        const factory = opts.contextFactory;
        if (typeof factory === "function") ctx = factory();
        else {
          const g = typeof globalThis !== "undefined" ? globalThis : null;
          const Ctor = g && (g.AudioContext || g.webkitAudioContext);
          if (Ctor) ctx = new Ctor({ latencyHint: "interactive" });
        }
      } catch (_) { ctx = null; }
      if (!ctx || typeof ctx.createGain !== "function") {
        A.failed = true;
        return false;
      }
      A.ctx = ctx;
      try {
        buildGraph();
      } catch (err) {
        A.failed = true;
        A.built = false;
        return false;
      }
      A.running = true;
      A.started = true;
      const now = ctx.currentTime;
      applyCamera(now);
      jumpP(A.masterGain.gain, 0.0001, now);
      setP(A.masterGain.gain, A.muted ? 0 : A.master, now, 0.08);
      for (let i = 0; i < AUDIO_BUSES.length; i += 1) {
        jumpP(A.buses[AUDIO_BUSES[i]].gain, busTarget(AUDIO_BUSES[i]), now);
      }
      if (ctx.resume) { try { ctx.resume(); } catch (_) { /* ignore */ } }
      return true;
    },

    stop() {
      if (!A.built || !A.ctx) { A.running = false; return; }
      A.running = false;
      const now = A.ctx.currentTime;
      setP(A.masterGain.gain, 0, now, 0.03);
      if (A.ctx.suspend) { try { A.ctx.suspend(); } catch (_) { /* ignore */ } }
    },

    ignition() {
      if (!A.built || !A.ctx) return;
      A.starterUntil = A.ctx.currentTime + 1.1;
    },

    update(state, dt) {
      const step = clamp(finite(dt, 0), 0, 0.1);
      A.clock += step;
      pumpVoice(step);
      const targetDuck = A.voice.speaking ? 0.62 : 1;
      A.duck = damp(A.duck, targetDuck, 9, step);
      if (!A.running || !A.built || !A.ctx || !state) return;
      const now = A.ctx.currentTime;

      if (state.spec && state.spec !== A.spec) {
        A.spec = state.spec;
        A.model = readSpecEngine(state.spec);
        firingSpectrum(A.model, A.amp);
        setP(A.bodyFilter.frequency, A.model.bodyHz, now, 0.1);
        if (A.exhaustDelay) setP(A.exhaustDelay.delayTime, clamp(A.model.exhaustLength / 343, 0.001, 0.1), now, 0.1);
      }

      const ctxv = updateEngine(state, now, step);
      updateSurface(state, now, step, ctxv);
      updateAir(state, now, step, ctxv);

      for (let i = 0; i < AUDIO_BUSES.length; i += 1) {
        const name = AUDIO_BUSES[i];
        setP(A.buses[name].gain, busTarget(name), now, 0.06);
      }
      setP(A.masterGain.gain, A.muted ? 0 : A.master, now, 0.06);
    },

    impact(info) {
      if (!A.built || !A.ctx || !A.running || !info) return;
      const now = A.ctx.currentTime;
      const kind = String(info.kind ?? info.material ?? "barrier").toLowerCase();
      const mat = IMPACT_MATERIALS[kind] || IMPACT_FALLBACK;
      const speed = Math.abs(finite(info.speed, 0));
      const mass = Math.max(200, finite(info.mass, 1200));
      const energy = Math.max(0, finite(info.energy, 0.5 * mass * speed * speed));
      const e = saturate(Math.sqrt(energy) / 260);
      if (e < 0.01) return;
      const buf = A.buf[mat.buf] || A.buf.bang;
      // Harder hits ring lower and longer: the panel deforms further, the whole
      // shell gets involved rather than the local skin.
      fireVoice(A.hitPool, buf, now, 0.25 + e * 0.9,
        mat.ring * lerp(1.25, 0.72, e), mat.q * lerp(1.2, 0.7, e),
        0.0015, mat.decay * lerp(0.55, 1.25, e),
        lerp(1.2, 0.72, e), clamp(mat.decay * 3.2, 0.05, 2));
      if (e > 0.45 && mat.tone > 0.3) {
        fireVoice(A.hitPool, A.buf.clack, now + 0.012, 0.25 + e * 0.4,
          mat.ring * 2.6, 5, 0.001, 0.03, 1, 0.12);
      }
      if (e > 0.55 && kind !== "glass" && kind !== "water" && kind !== "bale") {
        fireVoice(A.hitPool, A.buf.glass, now + 0.03, (e - 0.55) * 0.5,
          5200, 12, 0.002, 0.20, 1, 0.6);
      }
    },

    scrape(intensity, material) {
      const v = saturate(finite(intensity, 0));
      if (v > A.scrapeLevel) A.scrapeLevel = v;
      const mat = IMPACT_MATERIALS[String(material || "barrier").toLowerCase()] || IMPACT_FALLBACK;
      A.scrapeRing = clamp(mat.ring * 2.4, 120, 8000);
    },

    speak(text, priority) {
      const s = typeof text === "string" ? text.trim() : "";
      if (!s) return false;
      const q = A.voice.queue;
      if (priority === "now") {
        q.length = 0;
        if (A.voice.speaking) {
          resolveSynth();
          if (A.voice.synth && typeof A.voice.synth.cancel === "function") {
            try { A.voice.synth.cancel(); } catch (_) { /* ignore */ }
          }
          finishSpeech();
        }
      }
      // A stale pacenote is worse than a dropped one: the corner has gone by.
      if (q.length >= 3) q.shift();
      q.push(s);
      if (!A.voice.speaking) pumpVoice(0);
      return true;
    },

    speaking() {
      return A.voice.speaking;
    },

    setBus(name, value) {
      if (name === "master") {
        A.master = clamp(finite(value, A.master), 0, 1);
      } else if (Object.prototype.hasOwnProperty.call(A.busGain, name)) {
        A.busGain[name] = clamp(finite(value, A.busGain[name]), 0, 2);
      } else {
        return false;
      }
      if (A.built && A.ctx) {
        const now = A.ctx.currentTime;
        setP(A.masterGain.gain, A.muted ? 0 : A.master, now, 0.05);
        if (name !== "master") setP(A.buses[name].gain, busTarget(name), now, 0.05);
      }
      saveSettings();
      return true;
    },

    // The node behind a bus, so the caller can feed its own source (menu music)
    // into the same mixer and limiter rather than a second output path.
    busNode(name) {
      return A.built && A.buses[name] ? A.buses[name] : null;
    },

    context() {
      return A.ctx;
    },

    getBus(name) {
      if (name === "master") return A.master;
      return Object.prototype.hasOwnProperty.call(A.busGain, name) ? A.busGain[name] : 0;
    },

    setMuted(m) {
      A.muted = !!m;
      if (A.built && A.ctx) setP(A.masterGain.gain, A.muted ? 0 : A.master, A.ctx.currentTime, 0.04);
      saveSettings();
    },

    settings() {
      return { master: A.master, muted: A.muted, buses: Object.assign({}, A.busGain), camera: A.camera };
    },

    setCamera(mode) {
      const m = CAMERA_MODES[mode] ? mode : "chase";
      A.camera = m;
      A.cam = CAMERA_MODES[m];
      A.dbg.camera = m;
      if (A.built && A.ctx) applyCamera(A.ctx.currentTime);
      return m;
    },

    setAmbience(o) {
      if (!o) return;
      if (Number.isFinite(o.helicopter)) A.heliTarget = saturate(o.helicopter);
      if (Number.isFinite(o.crowd)) A.crowdTarget = saturate(o.crowd);
      if (Number.isFinite(o.dawn)) A.dawn = saturate(o.dawn);
    },

    debug() {
      A.dbg.nodeCount = A.nodes.length;
      A.dbg.sourceCount = A.sourceCount;
      A.dbg.speaking = A.voice.speaking;
      A.dbg.running = A.running;
      A.dbg.camera = A.camera;
      return A.dbg;
    },

    dispose() {
      A.running = false;
      A.voice.queue.length = 0;
      resolveSynth();
      if (A.voice.synth && typeof A.voice.synth.cancel === "function") {
        try { A.voice.synth.cancel(); } catch (_) { /* ignore */ }
      }
      A.voice.speaking = false;
      if (!A.ctx) { A.built = false; return; }
      const now = A.ctx.currentTime;
      for (let i = 0; i < A.oscs.length; i += 1) {
        try { if (A.oscs[i].stop) A.oscs[i].stop(now); } catch (_) { /* already stopped */ }
      }
      for (let i = 0; i < A.loops.length; i += 1) {
        try { if (A.loops[i].stop) A.loops[i].stop(now); } catch (_) { /* already stopped */ }
      }
      for (let i = 0; i < A.nodes.length; i += 1) {
        try { A.nodes[i].disconnect(); } catch (_) { /* already detached */ }
      }
      if (A.ctx.close) { try { A.ctx.close(); } catch (_) { /* ignore */ } }
      A.nodes.length = 0;
      A.oscs.length = 0;
      A.loops.length = 0;
      A.partials.length = 0;
      A.built = false;
      A.ctx = null;
    },
  };

  return api;
}
