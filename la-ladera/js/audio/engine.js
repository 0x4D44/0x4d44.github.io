// The sound engine (owner: A1): turns the pure library (library.js) and the pure mixing rules (mix.js) into a WebAudio graph that follows the player.
//
//   beds      wind / traffic / crickets / neighbours / children loops     -> bedBus -> lowpass (muffled indoors) -> ambBus
//   room      the hum of a room, only indoors                              -> ambBus
//   emitters  up to 6 positional loops (a tv, a radio, a stove, the court,  -> panner -> emitBus -> ambBus
//             the school, the workshop), each through its own lowpass for distance and walls
//   world     birds, dogs, horns and the chapel bell, placed around you     -> panner -> worldBus -> ambBus
//   sfx       footsteps, landings, doors (positional), UI ticks and chimes -> sfxBus -> master (+ room / valley reverb sends)
//   ambBus -> duck (dialogue, pause) -> master -> compressor -> destination
//
// An AudioContext is only ever created after a real user gesture (Chrome warns, and the page's console must stay clean, otherwise). Under
// headless automation the same graph is built on an OfflineAudioContext that is never rendered ("dry" mode): every code path runs, no audio
// device is opened, nothing is heard. `selfTest()` renders short offline scenes through the very same graph and measures them.
import { SR, reverbIR } from './dsp.js';
import { render } from './library.js';
import { BEDS } from './beds.js';
import { SURFACES } from './foley.js';
import { computeMix, buildEmitters, pickEmitters, heightRange, strokesForHour, activity, pickStream, nightFromHour, zoneAt } from './mix.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

/** Engine-level balance on top of each bed's own loudness (all beds are normalised to a similar RMS in beds.js). */
export const BED_TRIM = { wind: 0.80, traffic: 0.65, crickets: 0.80, murmur: 0.95, children: 0.85 };
const OUTDOOR_BEDS = Object.keys(BED_TRIM);
const FOOT_GAIN = 0.5, MAX_SHOTS = 26, MAX_VOICES = 6;
const airCutoff = (d) => clamp(14000 / (1 + d / 35), 900, 14000);        // air takes the highs out of distant sounds
const setPos = (n, x, y, z) => { x = fin(x); y = fin(y); z = fin(z); if (n.positionX) { n.positionX.value = x; n.positionY.value = y; n.positionZ.value = z; } else n.setPosition?.(x, y, z); };

/** Is this page driven by automation (headless Chrome)? Then the engine runs dry: no device, no sound. `?audio=live` overrides. */
export function isAutomated() {
  try { return /HeadlessChrome/i.test(navigator.userAgent) || navigator.webdriver === true; } catch { return false; }
}

// ---- samples: rendered off the main thread, turned into AudioBuffers on demand -----------------------------------------------------------------
export class SampleBank {
  constructor(useWorker = true) {
    this.raw = new Map(); this.bufs = new Map(); this.waiting = new Map(); this.queue = []; this.pumping = false; this.nextId = 1; this.ms = 0; this.errors = []; this.worker = null; this.requested = 0;
    if (useWorker && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e) => this._done(e.data);
        this.worker.onerror = (e) => { e.preventDefault?.(); this._workerFailed(String(e?.message ?? 'worker error')); };
      } catch { this.worker = null; }
    }
  }
  get mode() { return this.worker ? 'worker' : 'main'; }
  has(key) { return this.raw.has(key) || this.bufs.has(key); }
  get pending() { return this.waiting.size; }
  request(key) {
    if (this.has(key)) return Promise.resolve();
    const w = this.waiting.get(key); if (w) return w.promise;
    let resolve; const promise = new Promise((r) => { resolve = r; }); const id = this.nextId++;
    this.waiting.set(key, { promise, resolve, id }); this.requested++;
    if (this.worker) this.worker.postMessage({ id, key }); else this._local(key);
    return promise;
  }
  prefetch(keys) { return Promise.all(keys.map((k) => this.request(k))); }
  _done({ key, data, error }) {
    const w = this.waiting.get(key); this.waiting.delete(key);
    if (error) this.errors.push(`${key}: ${error}`); else if (data) this.raw.set(key, data);
    w?.resolve();
  }
  _workerFailed(msg) {                                                         // the worker could not run: do the same work here, a sample per task
    this.errors.push('worker: ' + msg); try { this.worker?.terminate(); } catch { /* gone */ } this.worker = null;
    for (const key of this.waiting.keys()) this._local(key);
  }
  _local(key) { this.queue.push(key); if (!this.pumping) { this.pumping = true; setTimeout(() => this._pump(), 0); } }
  _pump() {
    const key = this.queue.shift(); if (!key) { this.pumping = false; return; }
    const t0 = performance.now();
    try { this._done({ key, data: render(key) }); } catch (e) { this._done({ key, error: String(e?.message ?? e) }); }
    this.ms += performance.now() - t0; setTimeout(() => this._pump(), 0);
  }
  /** The AudioBuffer for `key`, or null while it is still being rendered (the caller asks for it and tries again later). */
  buffer(key, ac) {
    let b = this.bufs.get(key); if (b) return b;
    const x = this.raw.get(key); if (!x) return null;
    try { b = new AudioBuffer({ length: x.length, sampleRate: SR, numberOfChannels: 1 }); } catch { b = ac.createBuffer(1, x.length, SR); }
    b.copyToChannel(x, 0); this.bufs.set(key, b); this.raw.delete(key);
    return b;
  }
}

// ---- the engine --------------------------------------------------------------------------------------------------------------------------------
export class AudioEngine {
  /** o: { dry: force dry mode, live: force a real context even under automation, ac: an existing context to attach (selfTest), bank } */
  constructor(ctx, o = {}) {
    this.ctx = ctx; this.o = o; this.mode = 'idle'; this.ac = null; this.dry = false; this.n = {}; this.errors = [];
    this.bank = o.bank ?? null; this.rnd = pickStream(fin(ctx?.opts?.seed, 20261029) + 17);
    this.t = 0; this.next = { mix: 0, emit: 0, crowd: 0 }; this.acc = { birds: 6, dogs: 20, horns: 15 };
    this.volume = 0.8; this.modeScale = 0.3; this.duckTalk = 1; this.indoor = 0; this.override = null; this.gains = {};
    this.beds = {}; this.voices = new Map(); this.emitters = []; this.emitterKey = ''; this.range = null; this.crowd = 0.3; this.activeShots = 0;
    this.stepN = 0; this.lastBird = -1; this.bell = { clock: 0, devotion: 45, prevHour: null, last: -99, queued: 0, strokes: 0 };
    this.stats = { steps: 0, lands: 0, jumps: 0, doors: 0, shots: 0, bells: 0, chimes: 0, ticks: 0, dropped: 0, blocked: 0 };
    this.lastMix = null; this.zoneId = null; this.listener = { x: 0, y: 0, z: 0 };
  }

  _err(where, e) { if (this.errors.length < 20) this.errors.push(`${where}: ${String(e?.message ?? e)}`); }
  get live() { return this.mode === 'live'; }
  get running() { return this.live || this.mode === 'dry'; }

  // ---- unlock / create ------------------------------------------------------------------------------------------------------------------------
  /** Has the person really used the page? The browser's own record when it keeps one, else a trusted click / touch / key-up. */
  static activated(e) {
    try {
      const ua = navigator.userActivation;
      if (ua) return ua.hasBeenActive === true;
      return e?.isTrusted === true && e.type !== 'keydown' && e.type !== 'pointerdown';
    } catch { return false; }
  }

  /** Start (or resume) on a real gesture. Returns the mode: 'blocked' until one happens, 'live' | 'dry' after, 'failed' | 'unsupported' if it cannot run. */
  unlock(e = null) {
    try {
      if (this.ac) { this._resume(); return this.mode; }
      if (this.mode === 'failed' || this.mode === 'unsupported' || this.mode === 'off') return this.mode;
      if (!AudioEngine.activated(e)) { this.mode = 'blocked'; return this.mode; }
      this._create();
    } catch (err) { this.mode = 'failed'; this._err('unlock', err); }
    return this.mode;
  }
  _resume() { if (this.live && this.ac.state === 'suspended' && !document.hidden) this.ac.resume().catch(() => {}); }

  _create() {
    const Ctor = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!Ctor) { this.mode = 'unsupported'; return; }
    const dry = this.o.dry ?? (isAutomated() && !this.o.live && !/[?&]audio=live/.test(location.search));
    if (dry) { this.ac = new OfflineAudioContext(2, 128, 44100); this.dry = true; this.mode = 'dry'; }
    else { this.ac = new Ctor({ latencyHint: 'interactive' }); this.dry = false; this.mode = 'live'; this._resume(); }
    this.bank ??= new SampleBank(true);
    this._attach(this.ac);
    this._applyMode(this.ctx?.mode);
    this.bank.prefetch(this._wanted()).catch(() => {});
    if (typeof document !== 'undefined' && this.live) document.addEventListener('visibilitychange', this._vis ??= () => { if (!this.ac) return; if (document.hidden) this.ac.suspend().catch(() => {}); else this._resume(); });
  }

  /** The keys needed first (dry mode: just a few, on demand afterwards), then everything else in a useful order. */
  _wanted() {
    const first = ['bed:wind', 'bed:traffic', 'bed:murmur', ...[0, 1, 2, 3].map((i) => `step:concrete:${i}`), 'bed:children', 'tick', 'chime', 'bed:crickets', 'bed:room', 'bell'];
    if (this.dry && !this.o.full) return first;
    const rest = [];
    for (const s of SURFACES) for (let i = 0; i < 4; i++) rest.push(`step:${s}:${i}`);
    for (const s of SURFACES) for (let i = 0; i < 2; i++) rest.push(`land:${s}:${i}`);
    for (const b of ['court', 'tv', 'radio', 'sizzle', 'workshop']) rest.push(`bed:${b}`);
    rest.push('door:open:0', 'door:close:0', 'door:open:1', 'door:close:1', 'shutter:open', 'shutter:close', 'rustle:0', 'rustle:1', 'paper:0', 'paper:1');
    for (let s = 0; s < 6; s++) for (let t = 0; t < 2; t++) rest.push(`bird:${s}:${t}`);
    rest.push('dog:0', 'dog:1', 'horn:0', 'horn:1');
    return [...new Set([...first, ...rest])];
  }

  // ---- the graph --------------------------------------------------------------------------------------------------------------------------------
  _attach(ac) {
    this.ac = ac;
    const g = (v = 1) => { const n = ac.createGain(); n.gain.value = v; return n; }, n = this.n;
    n.master = g(0); n.comp = ac.createDynamicsCompressor();
    n.comp.threshold.value = -14; n.comp.knee.value = 12; n.comp.ratio.value = 5; n.comp.attack.value = 0.004; n.comp.release.value = 0.22;
    n.master.connect(n.comp); n.comp.connect(ac.destination);
    n.duck = g(1); n.duck.connect(n.master);
    n.ambBus = g(1); n.ambBus.connect(n.duck);
    n.bedBus = g(1); n.bedLP = ac.createBiquadFilter(); n.bedLP.type = 'lowpass'; n.bedLP.frequency.value = 16000; n.bedLP.Q.value = 0.5; n.bedOut = g(1);
    n.bedBus.connect(n.bedLP); n.bedLP.connect(n.bedOut); n.bedOut.connect(n.ambBus);
    n.roomGain = g(0); n.roomGain.connect(n.ambBus);
    n.emitBus = g(1); n.emitBus.connect(n.ambBus);
    n.worldBus = g(1); n.worldBus.connect(n.ambBus);
    n.sfxBus = g(1); n.sfxBus.connect(n.master);
    n.voiceBus = g(1); n.voiceBus.connect(n.master);            // for other modules (the NPC babble fallback): `ctx.audio.out`
    n.uiBus = g(1); n.uiBus.connect(n.master);
    try {                                                       // two small spaces: the inside of a room, and the valley the barrio looks over
      const mkConv = (o) => { const c = ac.createConvolver(), [l, r] = reverbIR(o, ac.sampleRate), b = ac.createBuffer(2, l.length, ac.sampleRate); b.copyToChannel(l, 0); b.copyToChannel(r, 1); c.buffer = b; return c; };
      n.convRoom = mkConv({ sec: 0.5, tau: 0.13, pre: 0.004, dark: 0.7, early: [[0.011, 0.5], [0.019, 0.35], [0.027, 0.25]], seed: 3 });
      n.convValley = mkConv({ sec: 2.4, tau: 0.8, pre: 0.02, dark: 0.85, early: [[0.09, 0.5], [0.19, 0.4], [0.33, 0.3], [0.52, 0.2]], seed: 11 });
      n.sendRoom = g(0); n.sendValley = g(0.1); n.sendWorld = g(0.45); n.revOut = g(1);
      n.sfxBus.connect(n.sendRoom); n.sendRoom.connect(n.convRoom); n.convRoom.connect(n.revOut);
      n.sfxBus.connect(n.sendValley); n.worldBus.connect(n.sendWorld); n.sendValley.connect(n.convValley); n.sendWorld.connect(n.convValley); n.convValley.connect(n.revOut);
      n.revOut.connect(n.master);
    } catch (e) { this._err('reverb', e); }
    this.n.out = this.live ? n.voiceBus : null;
    // the loops run all the time at their own gain (silent ones cost nothing worth saving)
    for (const id of OUTDOOR_BEDS) this._loop(id, n.bedBus);
    this._loop('room', n.roomGain, 'room', 1);                    // the room tone's own gain stays at 1; roomGain (indoors only) sets its level
  }

  /** Start a looping bed if its samples are ready (retried by update() until they are). Returns true when running. */
  _loop(id, dest, slot = id, level = 0) {
    if (this.beds[slot]) return true;
    const buf = this.bank?.buffer('bed:' + id, this.ac);
    if (!buf) { this.bank?.request('bed:' + id); return false; }
    const ac = this.ac, src = ac.createBufferSource(), gain = ac.createGain(); gain.gain.value = level;
    src.buffer = buf; src.loop = true; src.connect(gain); gain.connect(dest); src.start(0, this.rnd() * buf.duration);
    this.beds[slot] = { src, gain, id }; return true;
  }

  // ---- parameters ---------------------------------------------------------------------------------------------------------------------------------
  _set(param, v, tc = 0.12) {
    v = fin(v);
    if (this.dry || !this.ac) { param.value = v; return; }
    try { param.setTargetAtTime(v, this.ac.currentTime, tc); } catch { try { param.value = v; } catch { /* closed */ } }
  }
  setVolume(v) { this.volume = clamp(fin(v, 0.8), 0, 1); this._master(); }
  _master() { if (this.n.master) this._set(this.n.master.gain, Math.pow(this.volume, 1.6) * 0.9 * this.modeScale, this.modeScale < 1 ? 0.25 : 0.4); }

  // ---- playing --------------------------------------------------------------------------------------------------------------------------------------
  /**
   * Play one sample. o: { gain, rate, pos:[x,y,z], ref, rolloff, lp (cutoff Hz), bus: 'sfxBus'|'worldBus'|'uiBus', when (seconds from now) }.
   * Returns the source node, or null when it was dropped (samples not ready yet, too many voices, no context).
   */
  play(key, o = {}) {
    try {
      if (!this.ac || !this.n.master || !this.running) return null;
      const ac = this.ac, buf = this.bank?.buffer(key, ac);
      if (!buf) { this.bank?.request(key); this.stats.dropped++; return null; }
      if (this.activeShots >= MAX_SHOTS) { this.stats.dropped++; return null; }
      const src = ac.createBufferSource(), g = ac.createGain(), chain = [src, g]; src.buffer = buf;
      if (o.rate) src.playbackRate.value = clamp(fin(o.rate, 1), 0.5, 2);
      g.gain.value = clamp(fin(o.gain, 1), 0, 8);
      let head = src;
      if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = clamp(fin(o.lp, 8000), 200, ac.sampleRate * 0.45); f.Q.value = 0.5; src.connect(f); head = f; chain.push(f); }
      head.connect(g); let tail = g;
      if (o.pos) {
        const p = ac.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = Math.max(0.1, o.ref ?? 2); p.rolloffFactor = o.rolloff ?? 1; p.maxDistance = 100000;
        setPos(p, o.pos[0], o.pos[1], o.pos[2]); g.connect(p); tail = p; chain.push(p);
      }
      tail.connect(this.n[o.bus ?? 'sfxBus']);
      const when = o.when ? (this.dry ? o.when : ac.currentTime + o.when) : 0;
      src.start(when);
      this.activeShots++;
      let done = false;
      const finish = () => { if (done) return; done = true; this.activeShots--; for (const x of chain) { try { x.disconnect(); } catch { /* already gone */ } } };
      src.onended = finish;
      if (this.dry || o.when) setTimeout(finish, Math.ceil(((buf.duration / (o.rate || 1)) + (o.when ?? 0)) * 1000) + 150);       // an offline context never "ends": free the nodes anyway
      return src;
    } catch (e) { this._err('play ' + key, e); return null; }
  }
  /** A sound placed in the world at (x,y,z): distance law, panning, air and wall filtering. */
  playAt(key, x, y, z, o = {}) {
    const L = this.listener, d = Math.hypot(x - L.x, y - L.y, z - L.z), bus = o.bus ?? 'worldBus';
    const muffle = o.muffle ?? (bus === 'worldBus' && this.indoor > 0.5 ? 0.35 : 1);           // the world outside, heard from inside a building
    return this.play(key, { ref: 2, ...o, pos: [x, y, z], lp: Math.min(o.lp ?? 18000, airCutoff(d)) * muffle, bus });
  }

  chime() { this.stats.chimes++; return this.play('chime', { gain: 0.55, bus: 'uiBus' }); }
  tick() { this.stats.ticks++; return this.play('tick', { gain: 0.4, bus: 'uiBus', rate: 0.97 + 0.06 * this.rnd() }); }
  paper() { return this.play(`paper:${this.rnd() < 0.5 ? 0 : 1}`, { gain: 0.5, bus: 'uiBus' }); }

  // ---- gameplay events -----------------------------------------------------------------------------------------------------------------------
  onStep(e) {
    this.stats.steps++;
    const surface = SURFACES.includes(e?.surface) ? e.surface : 'concrete', sprint = !!e?.sprint, crouch = !!e?.crouch, speed = fin(e?.speed, 2.5);
    const v = (this.stepN++ + Math.floor(this.rnd() * 2)) % 4;
    this.play(`step:${surface}:${v}`, { gain: FOOT_GAIN * (crouch ? 0.5 : sprint ? 1.25 : 1) * clamp(speed / 2.8, 0.7, 1.15), rate: (sprint ? 1.04 : 1) * (0.95 + 0.1 * this.rnd()) });
  }
  onLand(e) {
    this.stats.lands++;
    const surface = SURFACES.includes(e?.surface) ? e.surface : 'concrete', hard = clamp(fin(e?.speed, 3) / 7, 0.3, 1.2);
    this.play(`land:${surface}:${this.rnd() < 0.5 ? 0 : 1}`, { gain: FOOT_GAIN * 1.1 * hard, rate: 0.96 + 0.08 * this.rnd() });
  }
  onJump() { this.stats.jumps++; this.play(`rustle:${this.rnd() < 0.5 ? 0 : 1}`, { gain: 0.5 }); }
  onDoor(e) {
    const st = this.ctx?.archDoors?.get?.(e?.doorId), geo = st?.geo; if (!geo) return;
    const x = geo.cx, y = fin(geo.y, 0) + 1.1, z = geo.cz, L = this.listener, d = Math.hypot(x - L.x, y - L.y, z - L.z);
    if (d > 60) return;
    this.stats.doors++;
    const key = st.kind === 'shutter' ? `shutter:${e.open ? 'open' : 'close'}` : `door:${e.open ? 'open' : 'close'}:${this.rnd() < 0.5 ? 0 : 1}`;
    this.playAt(key, x, y, z, { bus: 'sfxBus', gain: e.by === 'player' ? 1.1 : 0.9, ref: 3, rate: 0.97 + 0.06 * this.rnd(), lp: this._blockedBetween(x, z) ? 700 : 18000 });
  }
  /** play = full, paused / a panel = half and dull, title / loading = a third: enough to hear the volume slider move. */
  _applyMode(m) {
    this.modeScale = m === 'play' ? 1 : m === 'paused' || m === 'panel' ? 0.5 : 0.3;
    this._master();
    if (this.n.bedLP) this._set(this.n.bedLP.frequency, this._bedCutoff(), 0.3);
  }
  onMode(e) { this._applyMode(e?.mode); if (e?.mode === 'panel') this.paper(); }
  onTalk(on) { this.duckTalk = on ? 0.5 : 1; if (this.n.duck) this._set(this.n.duck.gain, this.duckTalk, 0.25); }
  _bedCutoff() { const out = 16000 * Math.pow(700 / 16000, this.indoor); return this.modeScale < 1 && this.modeScale > 0.35 ? Math.min(out, 2200) : out; }

  _blockedBetween(x, z) {
    try { const L = this.listener; return !!this.ctx?.physics?.segmentBlocked?.(L.x, L.z, x, z, L.y - 1.6, 1.4); } catch { return false; }
  }

  // ---- the frame ---------------------------------------------------------------------------------------------------------------------------------------
  /** The listener and world state, from the page (or from `override`, which selfTest uses). */
  _env() {
    if (this.override) return this.override;
    const c = this.ctx, p = c.player, s = p?.s, cam = c.camera;
    if (!s) return null;
    const e = cam?.matrixWorld?.elements;
    const eye = e ? { x: e[12], y: e[13], z: e[14], fx: -e[8], fy: -e[9], fz: -e[10], ux: e[4], uy: e[5], uz: e[6] } : { x: s.x, y: s.y + 1.6, z: s.z, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };
    return { ...eye, px: s.x, py: s.y, pz: s.z, indoors: !!p.indoors, building: p.building ?? null, hour: fin(c.hour, 17.2), night: Number.isFinite(c.night) ? c.night : nightFromHour(fin(c.hour, 17.2)) };
  }
  _world() {
    const c = this.ctx, plan = c?.plan; if (!plan) return false;
    if (!this.range && plan.heightAt) this.range = heightRange(plan.heightAt);
    const key = `${plan.landmarks?.length ?? 0}:${c.anchors?.length ?? 0}`;
    if (key !== this.emitterKey) { this.emitterKey = key; this.emitters = buildEmitters(plan, c.anchors ?? []); }
    return true;
  }
  _listen(e) {
    this.listener = { x: e.x, y: e.y, z: e.z };
    const l = this.ac.listener; if (!l) return;
    if (l.positionX) {
      l.positionX.value = e.x; l.positionY.value = e.y; l.positionZ.value = e.z;
      l.forwardX.value = e.fx; l.forwardY.value = e.fy; l.forwardZ.value = e.fz; l.upX.value = e.ux ?? 0; l.upY.value = e.uy ?? 1; l.upZ.value = e.uz ?? 0;
    } else { l.setPosition?.(e.x, e.y, e.z); l.setOrientation?.(e.fx, e.fy, e.fz, e.ux ?? 0, e.uy ?? 1, e.uz ?? 0); }
  }

  /** Per frame (while playing). Cheap: the listener every frame, the mix ~8x a second, emitters ~3x a second. */
  update(dt) {
    if (!this.ac || !this.running) return;
    try {
      this.t += dt;
      const e = this._env(); if (!e || !this._world()) return;
      this._listen(e);
      if (this.t >= this.next.mix) { this.next.mix = this.t + 0.12; this._mix(e); }
      if (this.t >= this.next.emit) { this.next.emit = this.t + 0.3; this._emitters(e); }
      this._shots(dt, e);
      this._bells(dt, e);
    } catch (err) { this._err('update', err); }
  }

  _crowd(e) {
    let sum = 0; try { for (const n of this.ctx.people?.list?.() ?? []) { if (n.away) continue; const d = Math.hypot(n.x - e.px, n.z - e.pz); if (d < 28) sum += 1 - d / 28; } } catch { /* people not ready */ }
    this.crowd = clamp(sum / 5, 0, 1);
  }

  _mix(e) {
    if (this.t >= this.next.crowd) { this.next.crowd = this.t + 2; this._crowd(e); }
    const plan = this.ctx.plan, r = this.range ?? { lo: 0, hi: 30 }, alt = clamp((e.py - r.lo) / (r.hi - r.lo), 0, 1);
    const m = computeMix({ areas: plan.areas, x: e.px, z: e.pz, alt, hour: e.hour, night: e.night, crowd: this.crowd });
    this.lastMix = m; this.alt = alt;
    this.indoor = e.indoors ? 1 : 0;
    const out = 1 - 0.6 * this.indoor;
    for (const id of OUTDOOR_BEDS) { const b = this.beds[id]; if (b) this._set(b.gain.gain, (BED_TRIM[id] ?? 1) * (m.beds[id] ?? 0) * out, 1.2); else this._loop(id, this.n.bedBus); }
    if (!this.beds.room) this._loop('room', this.n.roomGain, 'room', 1);
    this._set(this.n.roomGain.gain, this.indoor * 1.0, 0.5);
    this._set(this.n.bedLP.frequency, this._bedCutoff(), 0.35);
    if (this.n.sendRoom) this._set(this.n.sendRoom.gain, this.indoor * 0.3, 0.3);
    if (this.n.sendValley) this._set(this.n.sendValley.gain, (1 - this.indoor) * 0.12 * (0.5 + 0.5 * alt), 0.5);
    this.zoneId = zoneAt(plan.areas, e.px, e.pz);
    this._master();
  }

  _emitters(e) {
    const want = pickEmitters(this.emitters, e.x, e.y, e.z, e.hour, new Set(this.voices.keys()), MAX_VOICES);
    const ids = new Set(want.map((w) => w.em.id));
    for (const [id, v] of this.voices) if (!ids.has(id)) this._stopVoice(id, v);
    for (const { em, dist } of want) {
      let v = this.voices.get(em.id);
      if (!v) v = this._startVoice(em);
      if (!v) continue;
      const act = activity(em.act, e.hour), blocked = this._blockedBetween(em.x, em.z, em.y), floors = Math.abs(em.y - e.y) > 2.6;
      const cutoff = Math.min(airCutoff(dist), blocked ? 650 : 18000, floors ? 1000 : 18000), occ = (blocked ? 0.55 : 1) * (floors ? 0.7 : 1);
      this._set(v.lp.frequency, clamp(cutoff, 250, this.ac.sampleRate * 0.45), 0.3);
      this._set(v.gain.gain, em.gain * act * occ, 0.4);
      v.dist = dist; v.occluded = blocked;
    }
  }
  _startVoice(em) {
    const ac = this.ac, buf = this.bank?.buffer('bed:' + em.bed, ac);
    if (!buf) { this.bank?.request('bed:' + em.bed); return null; }
    const src = ac.createBufferSource(), lp = ac.createBiquadFilter(), gain = ac.createGain(), pan = ac.createPanner();
    src.buffer = buf; src.loop = true; lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 0.4; gain.gain.value = 0;
    pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = em.ref; pan.rolloffFactor = em.rolloff; pan.maxDistance = 100000; setPos(pan, em.x, em.y, em.z);
    src.connect(lp); lp.connect(gain); gain.connect(pan); pan.connect(this.n.emitBus);
    src.start(0, this.rnd() * buf.duration);
    const v = { em, src, lp, gain, pan, dist: 0, occluded: false }; this.voices.set(em.id, v); return v;
  }
  _stopVoice(id, v) {
    this.voices.delete(id); this._set(v.gain.gain, 0, 0.08);
    setTimeout(() => { try { v.src.stop(); } catch { /* not started */ } for (const n of [v.src, v.lp, v.gain, v.pan]) { try { n.disconnect(); } catch { /* gone */ } } }, 700);
  }

  _shots(dt, e) {
    const m = this.lastMix; if (!m) return;
    for (const kind of ['birds', 'dogs', 'horns']) {
      this.acc[kind] -= dt; if (this.acc[kind] > 0) continue;
      const rate = m.rates[kind] ?? 0, rpm = Math.max(rate, 0.05);
      this.acc[kind] = Math.min(150, -Math.log(1 - this.rnd()) * 60 / rpm);
      if (rate < 0.05) continue;
      this._shot(kind, e);
    }
  }
  _shot(kind, e) {
    const r = this.rnd, a = r() * TAU, L = this.listener, plan = this.ctx.plan, ground = (x, z) => (plan?.heightAt ? plan.heightAt(x, z) : L.y - 1.6);
    let key, x, y, z, o = {};
    if (kind === 'birds') {
      let sp; do { sp = Math.floor(r() * 6); } while (sp === this.lastBird); this.lastBird = sp;
      const d = 9 + r() * 32; x = L.x + Math.cos(a) * d; z = L.z + Math.sin(a) * d; y = ground(x, z) + 4 + r() * 9; key = `bird:${sp}:${Math.floor(r() * 2)}`; o = { gain: 0.9, ref: 7, rate: 0.96 + 0.1 * r() };
    } else if (kind === 'dogs') {
      const d = 28 + r() * 70; x = L.x + Math.cos(a) * d; z = L.z + Math.sin(a) * d; y = ground(x, z) + 0.6; key = `dog:${Math.floor(r() * 2)}`; o = { gain: 1.3, ref: 14, rate: 0.9 + 0.2 * r() };
    } else {
      x = clamp(L.x + (r() - 0.5) * 90, -92, 92); z = 88 + (r() - 0.5) * 6; y = ground(x, z) + 1; key = `horn:${r() < 0.7 ? 0 : 1}`; o = { gain: 1.0, ref: 10, rate: 0.95 + 0.1 * r() };
    }
    if (this.playAt(key, x, y, z, o)) this.stats.shots++;
  }

  // ---- the chapel bell ---------------------------------------------------------------------------------------------------------------------------------
  chapel() {
    if (this._chapel !== undefined) return this._chapel;
    const l = this.ctx?.plan?.landmarks?.find?.((m) => m.id === 'chapel' || m.kind === 'chapel');
    return (this._chapel = l && this.ctx.plan?.heightAt ? { x: l.x, y: this.ctx.plan.heightAt(l.x, l.z) + 11, z: l.z } : null);
  }
  /** Ring `n` strokes, 2.3 s apart, the first after `delay` seconds. */
  ring(n = 3, delay = 0) {
    const c = this.chapel(); if (!c || n < 1) return 0;
    let ok = 0;
    for (let k = 0; k < n; k++) if (this.playAt('bell', c.x, c.y, c.z, { gain: 0.7, ref: 45, rolloff: 1, when: delay + k * 2.3 })) ok++;
    if (ok) { this.stats.bells += ok; this.bell.last = this.bell.clock; }
    return ok;
  }
  _bells(dt, e) {
    const b = this.bell; b.clock += dt;
    if (b.prevHour != null && Math.floor(e.hour) !== Math.floor(b.prevHour) && Math.abs(e.hour - b.prevHour) < 1.5 && b.clock - b.last > 20) this.ring(strokesForHour(e.hour));
    b.prevHour = e.hour;
    if (b.clock >= b.devotion) {                                           // the clock may stand still (the hour is frozen by default): a devotional peal every few minutes
      b.devotion = b.clock + 360 + 60 * this.rnd();
      if (e.hour >= 6 && e.hour < 21.5 && e.night < 0.6 && this.ring(3) === 0) b.devotion = b.clock + 20;       // samples not ready yet: try again soon
    }
  }

  // ---- introspection ------------------------------------------------------------------------------------------------------------------------------
  state() {
    const r3 = (v) => (Number.isFinite(v) ? +v.toFixed(3) : null), gains = {};
    for (const [k, b] of Object.entries(this.beds)) gains[k] = r3(b.gain.gain.value);
    return {
      mode: this.mode, ctxState: this.ac?.state ?? null, sampleRate: this.ac?.sampleRate ?? null, volume: this.volume, modeScale: this.modeScale, indoor: this.indoor, zone: this.zoneId, alt: r3(this.alt),
      master: r3(this.n.master?.gain.value), beds: gains, bedCutoff: r3(this.n.bedLP?.frequency.value), crowd: r3(this.crowd),
      voices: [...this.voices.values()].map((v) => ({ id: v.em.id, kind: v.em.kind, dist: r3(v.dist), gain: r3(v.gain.gain.value), cutoff: r3(v.lp.frequency.value), occluded: v.occluded })),
      emitters: this.emitters.length, activeShots: this.activeShots, stats: { ...this.stats },
      samples: { ready: (this.bank?.raw.size ?? 0) + (this.bank?.bufs.size ?? 0), pending: this.bank?.pending ?? 0, requested: this.bank?.requested ?? 0, ms: Math.round(this.bank?.ms ?? 0), via: this.bank?.mode ?? null, errors: [...(this.bank?.errors ?? [])] },
      bell: { clock: Math.round(this.bell.clock), next: Math.round(this.bell.devotion - this.bell.clock), rung: this.stats.bells }, errors: [...this.errors],
    };
  }
}
