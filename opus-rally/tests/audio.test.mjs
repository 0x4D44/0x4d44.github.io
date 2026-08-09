// WebAudio does not exist in Node, so the graph is driven against a fake that
// records what audio.js actually asks the browser to do. The assertions are
// about behaviour we care about — a constant node count, a continuous rpm map,
// a limiter on the output, and no NaN reaching an AudioParam — not about the
// shape of the code.

import { createAudio, AUDIO_BUSES } from "../audio.js";

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    failures.push(`${name}: ${err && err.message}`);
    console.log(`FAIL  ${name}\n      ${err && err.stack ? err.stack.split("\n").slice(0, 4).join("\n      ") : err}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function close(a, b, eps, msg) {
  assert(Math.abs(a - b) <= eps, `${msg || "not close"}: ${a} vs ${b} (eps ${eps})`);
}

class FakeParam {
  constructor(node, name, value) {
    this.node = node;
    this.name = name;
    this._value = value;
    this.lastTarget = value;
    this.lastMethod = "init";
    this.setCount = 0;
    this.minSet = Infinity;
    this.maxSet = -Infinity;
    this.rampCount = 0;
    this.targetCount = 0;
    this.cancelCount = 0;
    node.ctx.record(node, name, value);
  }

  get value() { return this._value; }

  set value(v) {
    this.node.ctx.record(this.node, this.name, v);
    this.lastTarget = v;
    this.lastMethod = "value";
    this._value = v;
  }

  setValueAtTime(v, t) {
    this.node.ctx.record(this.node, this.name, v);
    this.lastTarget = v; this.lastMethod = "setValueAtTime"; this.lastTime = t;
    this.setCount += 1;
    if (!(v >= this.minSet)) this.minSet = v;
    if (!(v <= this.maxSet)) this.maxSet = v;
    this._value = v;
    return this;
  }

  linearRampToValueAtTime(v, t) {
    this.node.ctx.record(this.node, this.name, v);
    this.lastTarget = v; this.lastMethod = "linearRamp"; this.lastTime = t;
    this.rampCount += 1;
    this._value = v;
    return this;
  }

  exponentialRampToValueAtTime(v, t) {
    this.node.ctx.record(this.node, this.name, v);
    this.lastTarget = v; this.lastMethod = "expRamp"; this.lastTime = t;
    this.rampCount += 1;
    this._value = v;
    return this;
  }

  // Deliberately does not move `.value`, exactly like the real API.
  setTargetAtTime(v, t, tau) {
    this.node.ctx.record(this.node, this.name, v);
    if (!Number.isFinite(tau) || tau <= 0) this.node.ctx.badTau += 1;
    this.lastTarget = v; this.lastMethod = "setTarget"; this.lastTime = t;
    this.targetCount += 1;
    return this;
  }

  cancelScheduledValues(t) {
    this.cancelCount += 1; this.lastCancel = t;
    return this;
  }

  cancelAndHoldAtTime(t) {
    this.cancelCount += 1; this.lastCancel = t;
    return this;
  }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outputs = [];
    this.disconnectCalls = 0;
    this.index = ctx.nodes.length;
    ctx.nodes.push(this);
    ctx.created[kind] = (ctx.created[kind] || 0) + 1;
  }

  connect(dest) {
    assert(dest, "connect(undefined)");
    this.outputs.push(dest);
    if (dest instanceof FakeNode) dest.inputs = (dest.inputs || 0) + 1;
    return dest instanceof FakeNode ? dest : undefined;
  }

  disconnect() {
    this.disconnectCalls += 1;
    this.outputs.length = 0;
  }
}

class FakeBuffer {
  constructor(channels, length, sampleRate) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this._data = [];
    for (let i = 0; i < channels; i += 1) this._data.push(new Float32Array(length));
  }

  getChannelData(i) { return this._data[i]; }
}

class FakeAudioContext {
  constructor() {
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.state = "suspended";
    this.nodes = [];
    this.created = Object.create(null);
    this.stats = Object.create(null);
    this.nonFinite = [];
    this.badTau = 0;
    this.writes = 0;
    this.closed = false;
    this.destination = new FakeNode(this, "destination");
  }

  record(node, param, value) {
    this.writes += 1;
    const key = `${node.kind}.${param}`;
    let s = this.stats[key];
    if (!s) { s = { min: Infinity, max: -Infinity, count: 0 }; this.stats[key] = s; }
    s.count += 1;
    if (!Number.isFinite(value)) {
      if (this.nonFinite.length < 40) this.nonFinite.push(`${key}=${value}`);
      return;
    }
    if (value < s.min) s.min = value;
    if (value > s.max) s.max = value;
  }

  createGain() {
    const n = new FakeNode(this, "gain");
    n.gain = new FakeParam(n, "gain", 1);
    return n;
  }

  createOscillator() {
    const n = new FakeNode(this, "oscillator");
    n.type = "sine";
    n.frequency = new FakeParam(n, "frequency", 440);
    n.detune = new FakeParam(n, "detune", 0);
    n.start = (t) => { n.started = true; n.startTime = t; };
    n.stop = (t) => { n.stopped = true; n.stopTime = t; };
    return n;
  }

  createBiquadFilter() {
    const n = new FakeNode(this, "biquad");
    n.type = "lowpass";
    n.frequency = new FakeParam(n, "frequency", 350);
    n.Q = new FakeParam(n, "Q", 1);
    n.gain = new FakeParam(n, "gain", 0);
    n.detune = new FakeParam(n, "detune", 0);
    return n;
  }

  createWaveShaper() {
    const n = new FakeNode(this, "waveshaper");
    n.curve = null;
    n.oversample = "none";
    return n;
  }

  createBufferSource() {
    const n = new FakeNode(this, "buffersource");
    n.buffer = null;
    n.loop = false;
    n.playbackRate = new FakeParam(n, "playbackRate", 1);
    n.detune = new FakeParam(n, "detune", 0);
    n.onended = null;
    n.start = (t) => { n.started = true; n.startTime = t; };
    n.stop = (t) => { n.stopped = true; n.stopTime = t; };
    return n;
  }

  createDelay(max) {
    const n = new FakeNode(this, "delay");
    n.maxDelayTime = max ?? 1;
    n.delayTime = new FakeParam(n, "delayTime", 0);
    return n;
  }

  createDynamicsCompressor() {
    const n = new FakeNode(this, "compressor");
    n.threshold = new FakeParam(n, "threshold", -24);
    n.knee = new FakeParam(n, "knee", 30);
    n.ratio = new FakeParam(n, "ratio", 12);
    n.attack = new FakeParam(n, "attack", 0.003);
    n.release = new FakeParam(n, "release", 0.25);
    n.reduction = 0;
    return n;
  }

  createBuffer(channels, length, sampleRate) {
    return new FakeBuffer(channels, length, sampleRate);
  }

  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
  close() { this.closed = true; this.state = "closed"; return Promise.resolve(); }
}

function fakeStorage() {
  const map = new Map();
  return {
    map,
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
  };
}

function fakeSpeech() {
  class Utterance {
    constructor(text) { this.text = text; this.onend = null; this.onerror = null; }
  }
  const synth = {
    spoken: [],
    cancelled: 0,
    pending: null,
    speak(u) { this.spoken.push(u); this.pending = u; },
    cancel() { this.cancelled += 1; this.pending = null; },
    getVoices() {
      return [
        { name: "Generic", lang: "en-US", localService: false, default: true },
        { name: "Marshal", lang: "en-GB", localService: true, default: false },
      ];
    },
  };
  return { synth, Utterance };
}

const SPEC_FOUR = Object.freeze({
  id: "kestrel-4",
  name: "Kestrel R4",
  mass: 1230,
  gearRatios: [3.42, 2.21, 1.61, 1.28, 1.0, 0.82],
  engine: { cylinders: 4, idleRpm: 950, redline: 7400, limiterRpm: 7600, turbo: true, antiLag: true, maxBoost: 1.8, exhaustLength: 3.6 },
});

const SPEC_FIVE = Object.freeze({
  id: "borealis-5",
  name: "Borealis 5",
  mass: 1290,
  gearRatios: [3.30, 2.10, 1.55, 1.22, 0.98],
  engine: { cylinders: 5, idleRpm: 880, redline: 7000, limiterRpm: 7200, turbo: true, antiLag: false, maxBoost: 1.5, exhaustLength: 4.1 },
});

function makeWheel(index) {
  return {
    index,
    isFront: index < 2,
    isLeft: index % 2 === 0,
    contact: true,
    compression: 0.4,
    load: 3000,
    steerAngle: 0,
    spinRate: 50,
    slipRatio: 0,
    slipAngle: 0,
    fx: 0, fy: 0,
    surfaceId: 1,
    gripUsed: 0.5,
    skidding: false,
    dustRate: 0,
  };
}

function makeState(spec) {
  return {
    spec,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0, pitch: 0, roll: 0,
    speed: 25,
    forwardSpeed: 25,
    slipAngle: 0,
    lateralG: 0, longitudinalG: 0, verticalG: 1,
    engineRpm: 3000,
    engineLoad: 0.5,
    turboBoost: 0.6,
    turboSpool: 0.5,
    gear: 3,
    gearShiftTimer: 0,
    clutchEngage: 1,
    wheels: [makeWheel(0), makeWheel(1), makeWheel(2), makeWheel(3)],
    onGround: 4,
    airTime: 0,
    rolledOver: false,
    damage: null,
    input: { steer: 0, throttle: 0.7, brake: 0, handbrake: 0, clutch: 0, gear: 3 },
    odometer: 0,
  };
}

function boot(extra) {
  const ctx = new FakeAudioContext();
  const audio = createAudio(Object.assign({ contextFactory: () => ctx, storage: fakeStorage() }, extra || {}));
  assert(ctx.nodes.length === 1, "AudioContext must stay untouched before start() (autoplay policy)");
  assert(audio.start() === true, "start() should succeed with a working context");
  return { ctx, audio };
}

function countPersistent(ctx) {
  let n = 0;
  for (const node of ctx.nodes) if (node.kind !== "buffersource") n += 1;
  return n;
}

function partialGains(ctx) {
  // Partials are the oscillators whose gain all fans into one shared summing
  // node. Found structurally so the test does not depend on build order.
  const groups = new Map();
  for (const node of ctx.nodes) {
    if (node.kind !== "oscillator") continue;
    const g = node.outputs[0];
    if (!g || g.kind !== "gain") continue;
    const sum = g.outputs[0];
    if (!sum || sum.kind !== "gain") continue;
    if (!groups.has(sum)) groups.set(sum, []);
    groups.get(sum).push({ osc: node, gain: g });
  }
  let best = [];
  for (const list of groups.values()) if (list.length > best.length) best = list;
  best.sort((a, b) => a.osc.index - b.osc.index);
  return best;
}

// ---------------------------------------------------------------------------

test("no AudioContext is created before start(), and start() is idempotent", () => {
  const ctx = new FakeAudioContext();
  let made = 0;
  const audio = createAudio({ contextFactory: () => { made += 1; return ctx; }, storage: fakeStorage() });
  assert(made === 0, "factory must not run until start()");
  assert(ctx.nodes.length === 1, "only the destination should exist");
  assert(audio.start() === true, "first start");
  const after = ctx.nodes.length;
  const createdSnapshot = JSON.stringify(ctx.created);
  assert(audio.start() === true, "second start");
  assert(audio.start() === true, "third start");
  assert(ctx.nodes.length === after, `start() rebuilt the graph: ${after} -> ${ctx.nodes.length}`);
  assert(JSON.stringify(ctx.created) === createdSnapshot, "start() created new node types on repeat");
  assert(made === 1, "context factory ran more than once");
  audio.dispose();
});

test("graph is built once: 10 000 update() calls create no persistent node", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR, seed: "node-count" });
  const state = makeState(SPEC_FOUR);
  audio.update(state, 1 / 60);
  ctx.currentTime += 1 / 60;

  const basePersistent = countPersistent(ctx);
  const baseCreated = Object.assign({}, ctx.created);
  const dt = 1 / 60;

  for (let i = 0; i < 10000; i += 1) {
    const t = i * dt;
    const w = Math.sin(t * 1.7);
    state.engineRpm = 1000 + 3200 * (1 + Math.sin(t * 2.3));
    state.engineLoad = 0.5 + 0.5 * Math.sin(t * 3.1);
    state.speed = 6 + 28 * (1 + w) * 0.5;
    state.turboBoost = 0.9 + 0.9 * Math.sin(t * 4.0);
    state.turboSpool = 0.5 + 0.5 * Math.sin(t * 4.0);
    state.gear = 1 + (Math.floor(t * 2) % 6);
    state.input.throttle = 0.5 + 0.5 * Math.sin(t * 5.0);
    state.input.brake = Math.max(0, -Math.sin(t * 5.0));
    for (let k = 0; k < 4; k += 1) {
      const wh = state.wheels[k];
      wh.compression = 0.5 + 0.49 * Math.sin(t * 9 + k);
      wh.slipAngle = 0.35 * Math.sin(t * 6 + k * 0.7);
      wh.slipRatio = -0.9 * Math.max(0, Math.sin(t * 5.0 + k));
      wh.gripUsed = 0.6 + 0.4 * Math.sin(t * 7 + k);
      wh.surfaceId = (k + Math.floor(t)) % 10;
      wh.contact = Math.sin(t * 3 + k) > -0.9;
      wh.load = 2000 + 2500 * (1 + Math.sin(t * 8 + k)) * 0.5;
    }
    audio.update(state, dt);
    ctx.currentTime += dt;
    if (i % 900 === 0) audio.impact({ speed: 8 + (i % 17), kind: i % 2 ? "tree" : "barrier" });
  }

  const endPersistent = countPersistent(ctx);
  assert(endPersistent === basePersistent,
    `persistent node count moved: ${basePersistent} -> ${endPersistent}`);
  for (const kind of Object.keys(ctx.created)) {
    if (kind === "buffersource") continue;
    assert(ctx.created[kind] === baseCreated[kind],
      `created ${kind} nodes during update(): ${baseCreated[kind]} -> ${ctx.created[kind]}`);
  }

  // One-shots are allowed, but every one of them must be bounded and stopped.
  let oneShots = 0;
  let leaked = 0;
  for (const node of ctx.nodes) {
    if (node.kind !== "buffersource" || node.loop) continue;
    oneShots += 1;
    if (!node.stopped || !node.started) leaked += 1;
    if (typeof node.onended !== "function") leaked += 1;
  }
  assert(oneShots > 200, `expected plenty of one-shots (stones, pops, thumps), got ${oneShots}`);
  assert(leaked === 0, `${leaked} one-shot sources were never stopped or never released`);
  assert(basePersistent < 260, `persistent node count is a CPU budget: ${basePersistent}`);
  console.log(`      persistent nodes ${basePersistent}, one-shots over 10k frames ${oneShots}, param writes ${ctx.writes}`);
  audio.dispose();
});

test("engine frequency is monotonic and continuous in rpm across a gearshift", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR, seed: "sweep" });
  const state = makeState(SPEC_FOUR);
  const dt = 1 / 120;
  let prevHz = -1;
  let maxJump = 0;
  const rpmStep = 20;

  for (let rpm = 0; rpm <= 8000; rpm += rpmStep) {
    state.engineRpm = rpm;
    state.engineLoad = rpm / 8000;
    // Bang through the box mid-sweep; the note must not notice.
    state.gear = rpm < 2500 ? 1 : rpm < 4200 ? 2 : rpm < 6000 ? 3 : 4;
    state.gearShiftTimer = 0;
    audio.update(state, dt);
    ctx.currentTime += dt;
    const hz = audio.debug().engineHz;
    assert(Number.isFinite(hz) && hz > 0, `engineHz not usable at ${rpm} rpm: ${hz}`);
    if (prevHz >= 0) {
      const jump = hz - prevHz;
      assert(jump >= -1e-12, `engineHz went backwards at ${rpm} rpm: ${prevHz} -> ${hz}`);
      if (jump > maxJump) maxJump = jump;
    }
    prevHz = hz;
  }
  const allowed = rpmStep / 60 * 1.001;
  assert(maxJump <= allowed, `discontinuity in the rpm->Hz map: ${maxJump} Hz > ${allowed} Hz`);

  // The map must be a pure function of rpm: gear, load, boost and a shift in
  // progress may change the timbre but never the pitch.
  state.engineRpm = 5200;
  state.gear = 2; state.engineLoad = 0.1; state.turboBoost = 0; state.gearShiftTimer = 0;
  audio.update(state, dt); ctx.currentTime += dt;
  const a = audio.debug().engineHz;
  state.gear = 5; state.engineLoad = 1; state.turboBoost = 1.8; state.gearShiftTimer = 0.09;
  audio.update(state, dt); ctx.currentTime += dt;
  const b = audio.debug().engineHz;
  close(a, b, 1e-12, "engineHz depends on something other than rpm");

  // And the stack really is driven by it: the 2nd-order partial sits at 2x.
  const partials = partialGains(ctx);
  assert(partials.length >= 20, `expected a harmonic stack, found ${partials.length} partials`);
  const order2 = partials[3].osc.frequency.lastTarget;   // half order 4 == 2/rev
  close(order2, a * 2, 1e-6, "2nd-order partial is not at 2x the crank frequency");
  console.log(`      max step ${maxJump.toFixed(6)} Hz over a 0..8000 rpm sweep (allowed ${allowed.toFixed(6)})`);
  audio.dispose();
});

test("a real upshift adds no pitch jump beyond the rpm drop", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR, seed: "shift" });
  const state = makeState(SPEC_FOUR);
  const dt = 1 / 120;
  const rpms = [7400, 7500, 7550, 6900, 6200, 5600, 5200, 5000, 5100, 5300];
  let prevHz = null;
  for (let i = 0; i < rpms.length; i += 1) {
    state.engineRpm = rpms[i];
    state.gear = i < 3 ? 3 : 4;
    state.gearShiftTimer = i === 3 ? 0.08 : 0;
    audio.update(state, dt);
    ctx.currentTime += dt;
    const hz = audio.debug().engineHz;
    if (prevHz !== null) {
      const expected = Math.max(rpms[i], 90) / 60 - Math.max(rpms[i - 1], 90) / 60;
      close(hz - prevHz, expected, 1e-9, `pitch jumped at step ${i}`);
    }
    prevHz = hz;
  }
  audio.dispose();
});

test("a four and a five have genuinely different harmonic stacks", () => {
  const four = boot({ spec: SPEC_FOUR, seed: "spectrum" });
  const five = boot({ spec: SPEC_FIVE, seed: "spectrum" });
  const s4 = makeState(SPEC_FOUR);
  const s5 = makeState(SPEC_FIVE);
  s4.engineRpm = 5000; s5.engineRpm = 5000;
  s4.engineLoad = 0.8; s5.engineLoad = 0.8;
  four.audio.update(s4, 1 / 60);
  five.audio.update(s5, 1 / 60);

  const p4 = partialGains(four.ctx).map((p) => p.gain.gain.lastTarget);
  const p5 = partialGains(five.ctx).map((p) => p.gain.gain.lastTarget);
  assert(p4.length === p5.length && p4.length >= 20, "stacks differ in size");

  const peak = (arr) => { let bi = 0; for (let i = 1; i < arr.length; i += 1) if (arr[i] > arr[bi]) bi = i; return bi + 1; };
  // Half orders: a four fires 2/rev (n=4), a five 2.5/rev (n=5).
  assert(peak(p4) === 4, `four-cylinder should peak at half order 4, peaked at ${peak(p4)}`);
  assert(peak(p5) === 5, `five-cylinder should peak at half order 5, peaked at ${peak(p5)}`);

  let l1 = 0;
  let sum = 0;
  for (let i = 0; i < p4.length; i += 1) { l1 += Math.abs(p4[i] - p5[i]); sum += p4[i] + p5[i]; }
  assert(l1 / sum > 0.25, `stacks are too similar: L1 ${l1.toFixed(4)} over total ${sum.toFixed(4)}`);
  console.log(`      4cyl peak order ${peak(p4) / 2}/rev, 5cyl peak order ${peak(p5) / 2}/rev, relative L1 ${(l1 / sum).toFixed(3)}`);
  four.audio.dispose();
  five.audio.dispose();
});

test("the limiter is the last thing before the destination", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR });
  const toDest = ctx.nodes.filter((n) => n.outputs.includes(ctx.destination));
  assert(toDest.length === 1, `${toDest.length} nodes reach the destination directly`);
  assert(toDest[0].kind === "compressor", `destination is fed by a ${toDest[0].kind}, not a limiter`);
  const limiter = toDest[0];
  assert(limiter.ratio.value >= 12, `ratio ${limiter.ratio.value} is compression, not limiting`);
  assert(limiter.knee.value === 0, "a limiter wants a hard knee");
  assert(limiter.attack.value <= 0.01, `attack ${limiter.attack.value}s is too slow to catch a transient`);
  const feeders = ctx.nodes.filter((n) => n.outputs.includes(limiter));
  assert(feeders.length === 1 && feeders[0].kind === "gain", "the master gain should be the only thing into the limiter");
  audio.dispose();
});

test("every bus exists, is nameable, and persists to storage", () => {
  const store = fakeStorage();
  const ctx = new FakeAudioContext();
  const audio = createAudio({ contextFactory: () => ctx, storage: store, spec: SPEC_FOUR });
  audio.start();
  for (const name of AUDIO_BUSES) {
    assert(audio.setBus(name, 0.42) === true, `bus ${name} not settable`);
    close(audio.getBus(name), 0.42, 1e-9, `bus ${name} did not take`);
  }
  assert(audio.setBus("nonsense", 1) === false, "unknown bus should be rejected");
  assert(audio.busNode("music") !== null, "music bus should be connectable");
  assert(audio.busNode("nonsense") === null, "unknown bus should have no node");
  assert(audio.context() === ctx, "context() should hand back the live context");
  audio.setBus("master", 0.31);
  audio.setBus("engine", 0.77);
  audio.dispose();

  const ctx2 = new FakeAudioContext();
  const audio2 = createAudio({ contextFactory: () => ctx2, storage: store, spec: SPEC_FOUR });
  close(audio2.getBus("engine"), 0.77, 1e-9, "bus gain did not persist");
  close(audio2.getBus("master"), 0.31, 1e-9, "master volume did not persist");
  audio2.dispose();
});

test("camera change is a filter and a level, not a rebuild", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR });
  const state = makeState(SPEC_FOUR);
  audio.update(state, 1 / 60);
  const before = countPersistent(ctx);
  const createdBefore = Object.assign({}, ctx.created);

  audio.setCamera("cockpit");
  audio.update(state, 1 / 60);
  const cockpitBus = ctx.nodes.find((n) => n.kind === "biquad" && n.type === "lowpass" && n.frequency.lastTarget <= 3000);
  assert(cockpitBus, "no cabin low-pass moved down for the cockpit");
  const cockpitExhaust = audio.debug().camera;
  assert(cockpitExhaust === "cockpit", "camera not recorded");

  audio.setCamera("chase");
  audio.update(state, 1 / 60);
  assert(countPersistent(ctx) === before, `camera change created ${countPersistent(ctx) - before} nodes`);
  for (const kind of Object.keys(ctx.created)) {
    if (kind === "buffersource") continue;
    assert(ctx.created[kind] === createdBefore[kind], `camera change created a ${kind}`);
  }
  assert(audio.setCamera("banana") === "chase", "unknown camera should fall back");
  audio.dispose();
});

test("gains, frequencies and Q stay finite and in range under garbage state", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR, seed: "garbage" });
  const dt = 1 / 60;
  const nasty = [NaN, Infinity, -Infinity, 1e18, -1e18, 0, -1, undefined, null];

  for (let i = 0; i < nasty.length; i += 1) {
    const v = nasty[i];
    const state = makeState(SPEC_FOUR);
    state.engineRpm = v;
    state.engineLoad = v;
    state.speed = v;
    state.turboBoost = v;
    state.turboSpool = v;
    state.gear = v;
    state.gearShiftTimer = v;
    state.input.throttle = v;
    state.input.brake = v;
    for (const w of state.wheels) {
      w.load = v; w.compression = v; w.slipAngle = v; w.slipRatio = v;
      w.gripUsed = v; w.surfaceId = v;
    }
    for (let k = 0; k < 30; k += 1) {
      audio.update(state, dt);
      ctx.currentTime += dt;
    }
    audio.impact({ speed: v, kind: "barrier" });
    audio.impact({ energy: v, kind: "glass" });
    audio.scrape(v, "armco");
  }

  // No state at all, and silly dt values.
  audio.update(null, dt);
  audio.update(undefined, NaN);
  audio.update(makeState(SPEC_FOUR), -5);
  audio.update(makeState(SPEC_FOUR), 1e9);

  assert(ctx.nonFinite.length === 0, `non-finite AudioParam writes: ${ctx.nonFinite.join(", ")}`);
  assert(ctx.badTau === 0, `${ctx.badTau} setTargetAtTime calls had a non-positive time constant`);

  const g = ctx.stats["gain.gain"];
  assert(g.min >= 0 && g.max <= 8, `gain range ${g.min}..${g.max}`);
  for (const key of ["biquad.frequency", "oscillator.frequency"]) {
    const s = ctx.stats[key];
    assert(s.min > 0 && s.max <= 22050, `${key} range ${s.min}..${s.max}`);
  }
  const q = ctx.stats["biquad.Q"];
  assert(q.min > 0 && q.max <= 40, `Q range ${q.min}..${q.max}`);
  const pr = ctx.stats["buffersource.playbackRate"];
  assert(pr.min > 0 && pr.max <= 8, `playbackRate range ${pr.min}..${pr.max}`);
  const d = ctx.stats["delay.delayTime"];
  assert(d.min >= 0 && d.max <= 1, `delayTime range ${d.min}..${d.max}`);
  console.log(`      gain ${g.min.toFixed(4)}..${g.max.toFixed(3)}, freq ${ctx.stats["biquad.frequency"].min.toFixed(1)}..${ctx.stats["biquad.frequency"].max.toFixed(0)} Hz`);
  audio.dispose();
});

test("speak() queues rather than overlaps, and ducks the engine while talking", () => {
  const speech = fakeSpeech();
  const spoken = [];
  const ctx = new FakeAudioContext();
  const audio = createAudio({
    contextFactory: () => ctx,
    storage: fakeStorage(),
    spec: SPEC_FOUR,
    speech,
    onSpeak: (text, phase) => spoken.push(`${phase}:${text}`),
  });
  audio.start();
  const state = makeState(SPEC_FOUR);
  const dt = 1 / 60;

  audio.speak("Left five over crest");
  audio.speak("Right four long");
  audio.speak("Into hairpin right");
  assert(speech.synth.spoken.length === 1, `overlapping utterances: ${speech.synth.spoken.length} in flight`);
  assert(speech.synth.spoken[0].text === "Left five over crest", "wrong first call");
  assert(audio.speaking() === true, "should report speaking");

  const busEngine = () => {
    for (let i = 0; i < 40; i += 1) { audio.update(state, dt); ctx.currentTime += dt; }
    return audio.debug();
  };
  busEngine();
  assert(speech.synth.spoken.length === 1, "update() must not start a second utterance");

  speech.synth.pending.onend();
  assert(audio.speaking() === false, "onend should clear the speaking flag");
  audio.update(state, dt);
  assert(speech.synth.spoken.length === 2, "queue did not advance");
  assert(speech.synth.spoken[1].text === "Right four long", "queue is out of order");

  assert(spoken[0] === "start:Left five over crest", `callback missing: ${spoken[0]}`);
  assert(spoken.includes("end:"), "no end callback");
  const u = speech.synth.spoken[0];
  assert(u.rate > 1.0 && u.rate <= 2, `co-driver delivery is not clipped: rate ${u.rate}`);
  assert(u.voice && u.voice.lang === "en-GB", "did not prefer the en-GB voice");

  // Priority call jumps the queue and cancels what is in flight.
  audio.speak("Caution! Jump", "now");
  assert(speech.synth.cancelled >= 1, "priority call did not cancel");
  assert(speech.synth.spoken[speech.synth.spoken.length - 1].text === "Caution! Jump", "priority call not spoken first");
  assert(audio.speak("") === false, "empty note should be ignored");
  audio.dispose();
});

test("the engine bus is ducked while the co-driver talks", () => {
  const speech = fakeSpeech();
  const { ctx, audio } = boot({ spec: SPEC_FOUR, speech });
  const state = makeState(SPEC_FOUR);
  const dt = 1 / 60;
  for (let i = 0; i < 30; i += 1) { audio.update(state, dt); ctx.currentTime += dt; }
  const quietSnapshot = [];
  for (const n of ctx.nodes) if (n.kind === "gain") quietSnapshot.push(n.gain.lastTarget);

  audio.speak("Long left into square right");
  for (let i = 0; i < 30; i += 1) { audio.update(state, dt); ctx.currentTime += dt; }
  let ducked = 0;
  let i = 0;
  for (const n of ctx.nodes) {
    if (n.kind !== "gain") { continue; }
    if (n.gain.lastTarget < quietSnapshot[i] - 1e-6) ducked += 1;
    i += 1;
  }
  assert(ducked >= 3, `expected several buses to duck while speaking, ${ducked} did`);
  audio.dispose();
});

test("dispose() stops every source and disconnects every persistent node", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR, seed: "dispose" });
  const state = makeState(SPEC_FOUR);
  for (let i = 0; i < 120; i += 1) { audio.update(state, 1 / 60); ctx.currentTime += 1 / 60; }
  audio.dispose();

  let notDisconnected = 0;
  let runningOsc = 0;
  let runningLoop = 0;
  for (const node of ctx.nodes) {
    if (node === ctx.destination) continue;
    if (node.kind === "buffersource" && !node.loop) continue;   // one-shots release on ended
    if (node.disconnectCalls === 0) notDisconnected += 1;
    if (node.kind === "oscillator" && !node.stopped) runningOsc += 1;
    if (node.kind === "buffersource" && node.loop && !node.stopped) runningLoop += 1;
  }
  assert(notDisconnected === 0, `${notDisconnected} nodes were left connected`);
  assert(runningOsc === 0, `${runningOsc} oscillators left running`);
  assert(runningLoop === 0, `${runningLoop} noise loops left running`);
  assert(ctx.closed === true, "context was not closed");
  audio.dispose();   // twice must be safe
  audio.update(makeState(SPEC_FOUR), 1 / 60);
  audio.impact({ speed: 20, kind: "tree" });
});

test("survives a missing AudioContext without throwing", () => {
  const audio = createAudio({ contextFactory: () => null, storage: fakeStorage(), spec: SPEC_FOUR });
  assert(audio.start() === false, "start() should report failure, not throw");
  assert(audio.start() === false, "repeat start() should stay failed");
  const state = makeState(SPEC_FOUR);
  for (let i = 0; i < 50; i += 1) audio.update(state, 1 / 60);
  audio.impact({ speed: 30, kind: "bank" });
  audio.scrape(0.8, "armco");
  audio.setCamera("cockpit");
  audio.setBus("engine", 0.5);
  audio.ignition();
  assert(audio.speak("Right six tightens") === true, "voice should work without WebAudio");
  assert(audio.debug().running === false, "should not claim to be running");
  audio.dispose();
});

test("survives a broken AudioContext (throwing factory) without throwing", () => {
  const audio = createAudio({
    contextFactory: () => { throw new Error("blocked by policy"); },
    storage: fakeStorage(),
    spec: SPEC_FOUR,
  });
  assert(audio.start() === false, "start() should swallow a hostile factory");
  audio.update(makeState(SPEC_FOUR), 1 / 60);
  audio.dispose();
});

test("survives a missing SpeechSynthesis without throwing or stalling the queue", () => {
  const { audio } = boot({ spec: SPEC_FOUR, speech: { synth: null, Utterance: null } });
  const said = [];
  const ctx2 = new FakeAudioContext();
  const audio2 = createAudio({
    contextFactory: () => ctx2,
    storage: fakeStorage(),
    spec: SPEC_FOUR,
    speech: { synth: null, Utterance: null },
    onSpeak: (t, phase) => said.push(`${phase}:${t}`),
  });
  audio2.start();
  audio.speak("Crest into left three");
  assert(audio.speaking() === true, "should still track the note for the HUD");

  audio2.speak("Left three");
  audio2.speak("Right two tightens");
  assert(said[0] === "start:Left three", `HUD callback missing: ${said[0]}`);
  const state = makeState(SPEC_FOUR);
  // Without the API the queue is timed off update(); it must still drain.
  for (let i = 0; i < 600; i += 1) { audio2.update(state, 1 / 60); ctx2.currentTime += 1 / 60; }
  assert(said.includes("start:Right two tightens"), `queue stalled without SpeechSynthesis: ${said.join("|")}`);
  assert(audio2.speaking() === false, "queue should have drained");
  audio.dispose();
  audio2.dispose();
});

test("impacts, stones and suspension all reach their own bus without new filters", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR, seed: "impacts" });
  const state = makeState(SPEC_FOUR);
  audio.update(state, 1 / 60);
  ctx.currentTime += 1 / 60;
  const biquadsBefore = ctx.created.biquad;
  const gainsBefore = ctx.created.gain;
  const before = ctx.created.buffersource || 0;

  for (const kind of ["barrier", "tree", "bale", "panel", "glass", "landing", "water", "unheard-of"]) {
    audio.impact({ speed: 24, kind, mass: 1230 });
  }
  audio.impact({ speed: 0.0001, kind: "barrier" });   // below the audible floor

  const after = ctx.created.buffersource || 0;
  assert(after - before >= 8, `impacts did not sound: ${after - before} sources`);
  assert(ctx.created.biquad === biquadsBefore, "an impact allocated a filter");
  assert(ctx.created.gain === gainsBefore, "an impact allocated a gain");

  // Hard hits must ring lower and longer than light taps.
  const lowCtx = new FakeAudioContext();
  const low = createAudio({ contextFactory: () => lowCtx, storage: fakeStorage(), spec: SPEC_FOUR });
  low.start();
  low.update(state, 1 / 60);
  const nBefore = lowCtx.nodes.length;
  low.impact({ speed: 4, kind: "barrier" });
  const softFilter = lowCtx.nodes[nBefore - 1];
  low.impact({ speed: 42, kind: "barrier" });
  const rings = [];
  for (const n of lowCtx.nodes) {
    if (n.kind === "biquad" && n.type === "bandpass" && n.frequency.lastMethod === "setValueAtTime") rings.push(n.frequency.lastTarget);
  }
  assert(rings.length >= 2, "impact voices did not retune");
  assert(Math.min(...rings) < Math.max(...rings), "impact spectrum ignores energy");
  assert(softFilter !== undefined, "pool voice missing");
  low.dispose();
  audio.dispose();
});

test("surface change moves the rolling-noise filters, and gravel throws stones", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR, seed: "surface" });
  const state = makeState(SPEC_FOUR);
  state.speed = 30;
  const dt = 1 / 60;

  const run = (surfaceId, frames) => {
    for (const w of state.wheels) w.surfaceId = surfaceId;
    const before = ctx.created.buffersource || 0;
    for (let i = 0; i < frames; i += 1) { audio.update(state, dt); ctx.currentTime += dt; }
    return (ctx.created.buffersource || 0) - before;
  };

  run(0, 60);                               // tarmac
  const tarmacFreqs = ctx.nodes.filter((n) => n.kind === "biquad" && n.type === "bandpass").map((n) => n.frequency.lastTarget);
  const tarmacStones = run(0, 300);
  const gravelStones = run(1, 300);         // gravel
  run(3, 60);                               // snow
  const snowFreqs = ctx.nodes.filter((n) => n.kind === "biquad" && n.type === "bandpass").map((n) => n.frequency.lastTarget);

  assert(gravelStones > tarmacStones * 4 + 10,
    `gravel should ping the underbody far more than tarmac: ${gravelStones} vs ${tarmacStones}`);
  let moved = 0;
  for (let i = 0; i < tarmacFreqs.length; i += 1) if (Math.abs(tarmacFreqs[i] - snowFreqs[i]) > 1) moved += 1;
  assert(moved >= 2, `surface change did not retune the rolling noise (${moved} filters moved)`);
  console.log(`      stones over 5s: tarmac ${tarmacStones}, gravel ${gravelStones}`);
  audio.dispose();
});

test("the rev limiter chops ignition and lets go cleanly", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR, seed: "limiter" });
  const state = makeState(SPEC_FOUR);
  const dt = 1 / 60;
  state.engineRpm = 6000;
  state.input.throttle = 1;
  for (let i = 0; i < 60; i += 1) { audio.update(state, dt); ctx.currentTime += dt; }
  assert(audio.debug().limiter === false, "limiter engaged below the limit");

  state.engineRpm = 7620;   // SPEC_FOUR limiter is 7600
  for (let i = 0; i < 120; i += 1) { audio.update(state, dt); ctx.currentTime += dt; }
  assert(audio.debug().limiter === true, "limiter never engaged on the stop");

  // The chop is a gain switched hard between near-zero and unity.
  let cutNode = null;
  for (const n of ctx.nodes) {
    if (n.kind !== "gain") continue;
    if (n.gain.setCount > 40 && n.gain.minSet < 0.1 && n.gain.maxSet === 1) { cutNode = n; break; }
  }
  assert(cutNode, "no ignition-cut gain found being chopped");
  assert(cutNode.gain.setCount > 40, `only ${cutNode.gain.setCount} cut events over 2 s on the limiter`);
  const chops = cutNode.gain.setCount;

  state.engineRpm = 6800;
  for (let i = 0; i < 30; i += 1) { audio.update(state, dt); ctx.currentTime += dt; }
  assert(audio.debug().limiter === false, "limiter stayed latched after the revs dropped");
  assert(cutNode.gain.cancelCount > 0, "pending chop events were never cancelled");
  assert(cutNode.gain.lastTarget === 1, `ignition left cut at ${cutNode.gain.lastTarget}`);
  assert(cutNode.gain.setCount < chops + 6, "limiter kept chopping after release");
  console.log(`      ${chops} ignition cuts over 2 s against the limiter`);
  audio.dispose();
});

test("anti-lag bangs far harder on overrun than a car without it", () => {
  const run = (spec, seed) => {
    const ctx = new FakeAudioContext();
    const audio = createAudio({ contextFactory: () => ctx, storage: fakeStorage(), spec, seed });
    audio.start();
    const state = makeState(spec);
    state.engineRpm = 5200;
    state.engineLoad = 0;
    state.input.throttle = 0;
    state.speed = 30;
    // Tarmac, so the only one-shots being counted come out of the exhaust.
    for (const w of state.wheels) w.surfaceId = 0;
    const dt = 1 / 60;
    audio.update(state, dt);
    ctx.currentTime += dt;
    const before = ctx.created.buffersource || 0;
    for (let i = 0; i < 300; i += 1) { audio.update(state, dt); ctx.currentTime += dt; }
    const fired = (ctx.created.buffersource || 0) - before;
    assert(audio.debug().overrun === true, "state should read as overrun");
    audio.dispose();
    return fired;
  };
  // Same surface and speed, so the difference is the exhaust, not the tyres.
  const withAntiLag = run(SPEC_FOUR, "al");
  const without = run(SPEC_FIVE, "al");
  assert(withAntiLag > without * 1.6, `anti-lag should be unmistakable: ${withAntiLag} vs ${without}`);
  console.log(`      overrun one-shots over 5 s: anti-lag ${withAntiLag}, none ${without}`);
});

test("ignition() cranks the starter and hands over to the engine", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR, seed: "starter" });
  const state = makeState(SPEC_FOUR);
  state.engineRpm = 0;
  const dt = 1 / 60;
  audio.update(state, dt); ctx.currentTime += dt;
  assert(audio.debug().starter === false, "starter running before ignition");

  const before = countPersistent(ctx);
  audio.ignition();
  audio.update(state, dt); ctx.currentTime += dt;
  assert(audio.debug().starter === true, "ignition() did not crank");
  assert(countPersistent(ctx) === before, "ignition() built nodes");

  state.engineRpm = 980;   // caught
  for (let i = 0; i < 120; i += 1) { audio.update(state, dt); ctx.currentTime += dt; }
  assert(audio.debug().starter === false, "starter never disengaged");
  assert(countPersistent(ctx) === before, "the starter sequence built nodes");
  audio.dispose();
});

test("stop() silences without tearing the graph down, and start() brings it back", () => {
  const { ctx, audio } = boot({ spec: SPEC_FOUR });
  const state = makeState(SPEC_FOUR);
  audio.update(state, 1 / 60);
  const nodes = ctx.nodes.length;
  audio.stop();
  assert(ctx.state === "suspended", "stop() should suspend the context");
  assert(audio.debug().running === false, "should report stopped");
  audio.update(state, 1 / 60);
  assert(ctx.nodes.length === nodes, "update() while stopped touched the graph");
  assert(audio.start() === true, "restart");
  assert(ctx.state === "running", "start() should resume");
  assert(ctx.nodes.length === nodes, "restart rebuilt the graph");
  audio.dispose();
});

console.log("");
if (failed > 0) {
  console.log(`${passed} passed, ${failed} FAILED`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`${passed} passed, 0 failed`);
}
