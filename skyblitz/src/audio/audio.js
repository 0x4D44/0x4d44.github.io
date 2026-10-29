// SKYBLITZ audio engine. Owner: audio agent.
// Graph:  sfx recipes -> world bus / ui bus -> sfx bus -> compressor -+
//         music player -> duck -> music filter -> music bus ----------+-> master -> limiter -> destination
// Everything is event-driven (game.events) plus a per-frame update for the continuous sounds (engine, wind, scrape,
// warning beeps). `?mute=1` (any value but 0/false) = no AudioContext, no listeners, every method is a safe no-op.
import { getLib } from './dsp.js';
import { SFX } from './sfx.js';
import { LEVEL } from './levels.js';
import { PlayerEngine, AIEngine, voiceFor } from './engines.js';
import { clamp, lerp } from '../util.js';

const SPEED_OF_SOUND = 300;                 // exaggerated a little so Doppler is audible at 100 m/s
const MAX_AI_VOICES = 4;                    // positional engine voices
const MAX_VOICES = 44;                      // concurrent one-shots (all categories)
// per-sound limits: gap = min seconds between plays, max = concurrent instances
const LIMITS = {
  cannon: { gap: 0.05, max: 6 }, cannonHit: { gap: 0.05, max: 4 }, explosion: { gap: 0.06, max: 5 }, hitThump: { gap: 0.08, max: 3 },
  uiHover: { gap: 0.04, max: 2 }, warnBeep: { gap: 0.05, max: 2 }, lockTick: { gap: 0.04, max: 2 }, gate: { gap: 0.04, max: 3 },
  mineBlast: { gap: 0.05, max: 4 }, boostIgnite: { gap: 0.2, max: 2 }, lightning: { gap: 0.3, max: 2 }, tumble: { gap: 0.3, max: 2 },
};
const DEFAULT_LIMIT = { gap: 0.02, max: 5 };
// Bus trims (V-19): the score sat 9-12 dB under the SFX bus while racing; music up, SFX bus and engine bed down.
const MUSIC_GAIN = 1.45, SFX_GAIN = 0.62;

export class AudioEngine {
  constructor(game) {
    this.game = game; this.ctx = null;
    const m = game.params?.get('mute');
    this.muted = !!game.params?.has('mute') && m !== '0' && m !== 'false';
    this.failed = false; this.ready = false;
    this.racers = new Set(); this.offs = []; this.active = []; this.counts = {}; this.played = {}; this.log = [];
    this.pe = null; this.peId = null; this.ai = []; this.paused = false; this.hidden = false; this.pausedAt = 0;
    this.duckUntil = 0; this.duckLevel = 1; this.musicPause = 1;
    this.lastPlay = {}; this.chain = 0; this.lastGateT = -99;
    this.warn = { dist: 1e9, t: -99, next: 0, tti: null, evade: false, rollNext: 0 }; this.lock = { progress: 0, t: -99, next: 0 };
    this.scrape = { level: 0, until: 0 }; this.wrong = { on: false, next: 0 }; this.drafting = false; this.prevHeat = 0;
    this.boostSm = 0; this.camPrev = null; this.listenerVel = null; this.scratch = null; this.prevItem = null;
    this.volumes = { master: 1, music: 1, sfx: 1 }; this.seq = 0;
    this.locked = { t: -99, progress: 0, next: 0 };
    this.musicIn = null; this.state = 'off';
  }

  // ---------------------------------------------------------------- lifecycle
  init() {
    if (this.muted) return;
    const ev = this.game.events, on = (t, fn) => this.offs.push(ev.on(t, fn));
    this.bindEvents(on);
    document.addEventListener('visibilitychange', this._vis = () => this.onVisibility());
    if (navigator.userActivation?.hasBeenActive) this.ensure();
  }

  /** Create the AudioContext + mix graph. Safe to call repeatedly; never throws. */
  ensure() {
    if (this.muted || this.ctx || this.failed) return !!this.ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('no WebAudio');
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.buildGraph(this.ctx);
      this.ctx.onstatechange = () => { this.state = this.ctx?.state || 'off'; };
      this.state = this.ctx.state; this.ready = true;
    } catch (e) { this.failed = true; this.ctx = null; this.ready = false; console.warn('[audio] disabled:', e?.message || e); }
    if (this.ready) this.game.events.emit('audio:ready', {});
    return this.ready;
  }

  /** Build the mix graph on any (Offline)AudioContext; used by ensure() and by the offline mix tests. */
  buildGraph(c) {
    const node = (n) => n;
    const comp = (th, knee, ratio, a, r) => { const k = c.createDynamicsCompressor(); k.threshold.value = th; k.knee.value = knee; k.ratio.value = ratio; k.attack.value = a; k.release.value = r; return k; };
    const g = (v) => { const x = c.createGain(); x.gain.value = v; return x; };
    const master = this.master = g(1), limiter = this.limiter = comp(-3, 0, 20, 0.002, 0.09);
    master.connect(limiter); limiter.connect(c.destination);
    const sfxBus = this.sfxBus = g(1), sfxComp = comp(-16, 12, 3, 0.004, 0.22);
    sfxBus.connect(sfxComp); sfxComp.connect(master);
    this.worldBus = g(1); this.uiBus = g(1); this.worldBus.connect(sfxBus); this.uiBus.connect(sfxBus);
    this.engineBus = g(0.9); this.engineBus.connect(this.worldBus);
    this.duckGain = g(1); this.musicFilter = c.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 22000;
    this.musicBus = g(1); this.musicIn = this.duckGain;
    this.duckGain.connect(this.musicFilter); this.musicFilter.connect(this.musicBus); this.musicBus.connect(master);
    // shared reverb for sparkles / explosions
    const conv = c.createConvolver(); conv.buffer = getLib(c).ir;
    const rin = g(1), rout = g(0.55); rin.connect(conv); conv.connect(rout); rout.connect(this.worldBus);
    getLib(c).reverbIn = rin; this.reverbIn = rin;
    this.setVolumes(true);
    node(0);
  }

  resume() {
    if (this.muted) return;
    if (!this.ctx) this.ensure();
    if (this.ctx && this.ctx.state === 'suspended' && !this.hidden) this.ctx.resume().catch(() => {});
  }

  onVisibility() {
    if (!this.ctx) return;
    this.hidden = document.hidden;
    if (this.hidden) this.ctx.suspend().catch(() => {});
    else if (navigator.userActivation?.hasBeenActive) this.ctx.resume().catch(() => {});
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs.length = 0;
    if (this._vis) document.removeEventListener('visibilitychange', this._vis);
    this.killVoices(); this.pe?.dispose(); this.pe = null;
    for (const a of this.ai) a.dispose();
    this.ai.length = 0; this.racers.clear();
    if (this.ctx) { this.ctx.close().catch(() => {}); this.ctx = null; }
    this.ready = false;
  }

  // ---------------------------------------------------------------- volumes / ducking
  setVolumes(immediate = false) {
    if (!this.ctx && !this.master) return;
    const s = this.game.settings || {}, c = this.master.context, now = c.currentTime, k = immediate ? 0.001 : 0.05;
    const v = (x, d) => (typeof x === 'number' && isFinite(x) ? clamp(x, 0, 1) : d);
    this.volumes.master = v(s.masterVolume, 1); this.volumes.music = v(s.musicVolume, 0.7); this.volumes.sfx = v(s.sfxVolume, 0.9);
    this.master.gain.setTargetAtTime(this.volumes.master, now, k);
    this.musicBus.gain.setTargetAtTime(this.volumes.music * MUSIC_GAIN, now, k);
    this.sfxBus.gain.setTargetAtTime(this.volumes.sfx * SFX_GAIN, now, k);
  }

  /** Dip the music for a big sound. depth = remaining music level (0..1), hold seconds. */
  duck(depth = 0.5, hold = 0.3) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.duckLevel = Math.min(this.duckUntil > now ? this.duckLevel : 1, depth);
    this.duckUntil = Math.max(this.duckUntil, now + hold);
  }

  // ---------------------------------------------------------------- racers
  attachRacer(racer) { if (racer) this.racers.add(racer); }
  detachRacer(racer) {
    this.racers.delete(racer);
    for (const a of this.ai) if (a.racer === racer) { a.racer = null; if (this.ctx) a.silence(this.ctx.currentTime); }
  }

  // ---------------------------------------------------------------- one-shots
  /** Play a named SFX. opts: { pos:{x,y,z}, vol, p (pitch), n, sev, size, perfect, dur, bus:'ui'|'world' }. Returns true if started. */
  play(name, opts = {}) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return false;
    const fn = SFX[name];
    if (!fn) return false;
    const c = this.ctx, now = c.currentTime, lim = LIMITS[name] || DEFAULT_LIMIT;
    if (now - (this.lastPlay[name] ?? -9) < lim.gap) return false;
    if ((this.counts[name] || 0) >= lim.max) return false;
    if (this.active.length >= MAX_VOICES && !opts.important) return false;
    this.lastPlay[name] = now;
    let dest = opts.bus === 'ui' ? this.uiBus : this.worldBus, pan = null;
    const vol = c.createGain(); vol.gain.value = (opts.vol ?? 1) * (LEVEL[name] ?? 1);
    if (opts.pos) {
      pan = c.createPanner(); pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse';
      pan.refDistance = opts.ref ?? 35; pan.rolloffFactor = opts.roll ?? 1.2; pan.maxDistance = 1500;
      if (pan.positionX) { pan.positionX.value = opts.pos.x; pan.positionY.value = opts.pos.y; pan.positionZ.value = opts.pos.z; } else pan.setPosition(opts.pos.x, opts.pos.y, opts.pos.z);
      vol.connect(pan); pan.connect(dest);
    } else vol.connect(dest);
    let r;
    try { r = fn(c, vol, now + 0.005, opts.seed == null ? { ...opts, seed: (this.seq = (this.seq + 1) | 0) } : opts); } catch (e) { console.warn('[audio] recipe failed', name, e); try { vol.disconnect(); } catch { /* gone */ } return false; }
    const nodes = r.nodes; nodes.push(vol); if (pan) nodes.push(pan);
    this.active.push({ name, end: now + r.dur + 0.1, nodes });
    this.counts[name] = (this.counts[name] || 0) + 1;
    this.played[name] = (this.played[name] || 0) + 1;
    if (this.log.length > 300) this.log.shift();
    this.log.push({ name, t: this.game.simTime || 0, pos: !!opts.pos });
    return true;
  }

  /** Sound for an actor: the player's own events play flat (2-D); everyone else's play positionally when near. */
  at(name, racer, pos, opts = {}) {
    if (racer && racer === this.game.player) return this.play(name, opts);
    if (!pos) return false;
    const cp = this.scratch?.cam;
    if (cp) { const dx = pos.x - cp.x, dy = pos.y - cp.y, dz = pos.z - cp.z; if (dx * dx + dy * dy + dz * dz > 1100 * 1100) return false; }
    return this.play(name, { ...opts, pos, vol: (opts.vol ?? 1) * (opts.far ?? 1) });
  }

  sweep(now) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const v = this.active[i];
      if (now < v.end) continue;
      for (const n of v.nodes) { try { n.disconnect(); } catch { /* gone */ } }
      this.counts[v.name]--;
      this.active.splice(i, 1);
    }
  }
  killVoices() {
    for (const v of this.active) for (const n of v.nodes) { try { n.stop?.(); } catch { /* done */ } try { n.disconnect(); } catch { /* gone */ } }
    this.active.length = 0; this.counts = {};
  }

  /** Diagnostics for tests / the lab page. */
  stats() {
    return { state: this.ctx?.state || (this.muted ? 'muted' : 'off'), muted: this.muted, voices: this.active.length, ai: this.ai.filter((a) => a.racer).length,
      engine: !!this.pe, racers: this.racers.size, played: { ...this.played }, volumes: { ...this.volumes } };
  }

  // ---------------------------------------------------------------- events
  bindEvents(on) {
    const g = this.game, me = (r) => !!r && r === g.player;
    // UI
    on('ui:click', () => this.play('uiClick', { bus: 'ui' }));
    on('ui:hover', () => this.play('uiHover', { bus: 'ui' }));
    on('ui:back', () => this.play('uiBack', { bus: 'ui' }));
    on('ui:confirm', () => this.play('uiConfirm', { bus: 'ui' }));
    on('ui:error', () => this.play('uiError', { bus: 'ui' }));
    on('settings:change', () => this.setVolumes());
    on('game:pause', () => this.setPaused(true));
    on('game:resume', () => this.setPaused(false));
    on('game:state', ({ to }) => { if (to === 'loading' || to === 'title' || to === 'menu') this.resetRaceState(); });
    // race flow
    on('race:ready', ({ race }) => { this.racers.clear(); this.resetRaceState(); for (const r of race?.racers || []) this.attachRacer(r); });
    on('race:end', () => { this.racers.clear(); this.resetRaceState(); });
    on('race:countdown', ({ n }) => this.play('countBeep', { p: n === 1 ? 1.12 : 1, important: true }));
    on('race:go', () => { this.play('goBeep', { important: true }); this.duck(0.55, 0.6); });
    on('race:rocketStart', ({ racer, perfect }) => { if (me(racer)) this.play('rocket', { perfect }); else this.at('boostIgnite', racer, racer?.render?.pos, { far: 0.5 }); });
    on('race:lap', ({ racer }) => { if (me(racer)) { this.play('lap', { important: true }); this.duck(0.7, 0.8); } });
    on('race:finalLap', ({ racer }) => { if (me(racer)) { this.play('finalLap', { important: true }); this.duck(0.6, 1.4); } });
    on('race:finish', ({ racer, place }) => { if (me(racer)) { this.wrong.on = false; this.warn.t = -99; this.lock.t = -99; this.duck(0.6, 1.0); if (!g.music?.hasStingers) this.play(place <= 3 ? 'winJingle' : 'loseJingle', { important: true }); } });
    on('race:overtake', ({ racer, passed }) => { if (me(racer)) this.play('overtake'); else if (me(passed)) this.play('passed'); });
    on('race:wrongway', ({ racer, on: o }) => { if (me(racer)) { this.wrong.on = !!o; this.wrong.next = 0; } });
    on('race:respawn', ({ racer }) => { if (me(racer)) this.play('respawn'); });
    on('shortcut:enter', ({ racer }) => { if (me(racer)) this.play('shortcut'); });
    on('input:camera', () => this.play('camTick', { bus: 'ui' }));
    on('input:lookback', () => this.play('camTick', { bus: 'ui', p: 0.8 }));
    // gates / pickups
    on('gate:pass', ({ racer, perfect }) => {
      if (!me(racer)) return;
      const t = g.simTime || 0;
      this.chain = t - this.lastGateT < 3.0 ? this.chain + 1 : 0; this.lastGateT = t;
      this.play(perfect ? 'gatePerfect' : 'gate', { n: this.chain });
    });
    on('pickup:orb', ({ racer, pos }) => { if (me(racer)) { this.play('orb'); this.itemReadyAt = (this.ctx?.currentTime || 0) + 0.32; } else this.at('orb', racer, pos, { far: 0.45 }); });
    on('item:use', ({ racer, type }) => {
      const pos = racer?.render?.pos;
      if (type === 'smoke') return;           // smoke:deploy plays it
      if (type === 'turbo' || type === 'turbo3') { if (!me(racer)) this.at('boostIgnite', racer, pos, { far: 0.5 }); return; }
      if (type === 'storm' && me(racer)) { this.play('stormCast'); return; }
      if (me(racer) && (type === 'shield' || type === 'emp' || type === 'storm' || type === 'drone' || type === 'mine' || type === 'missile' || type === 'triple')) return; // their own events
    });
    // missiles
    on('missile:launch', ({ owner, pos }) => this.at('missileLaunch', owner, pos, { far: 0.8 }));
    on('missile:lock', ({ owner, target, progress }) => {
      const t = this.ctx?.currentTime ?? 0;
      if (me(owner)) { this.lock.progress = progress; this.lock.t = t; }
      if (me(target) && !me(owner)) { this.locked.progress = progress ?? 0; this.locked.t = t; }   // V-37: a rival is locking on to YOU
    });
    on('missile:unlock', ({ owner, target }) => {                 // the lock broke (lost / blinded / fired): stop the lock tones now
      if (me(target) && !me(owner)) this.locked.t = -99;
      if (me(owner)) this.lock.t = -99;
    });
    on('missile:warn', ({ target, dist, tti, evade }) => {
      if (!me(target)) return;
      const t = this.ctx?.currentTime ?? 0;
      this.warn.dist = dist; this.warn.t = t; this.warn.tti = Number.isFinite(tti) ? tti : null; this.warn.evade = !!evade; this.locked.t = -99;
    });
    on('missile:evaded', ({ target, by }) => { if (me(target)) { this.warn.t = -99; this.play(by === 'shield' ? 'shieldBlock' : 'evade'); } });
    on('missile:hit', ({ target, pos }) => {
      if (me(target)) { this.warn.t = -99; this.play('explosion', { size: 1, important: true }); this.duck(0.3, 0.7); }
      else this.at('explosion', null, pos, { size: 0.8, far: 0.9 });
    });
    on('mine:drop', ({ owner, pos }) => this.at('mineDrop', owner, pos, { far: 0.6 }));
    on('mine:hit', ({ victim, pos }) => { if (me(victim)) { this.play('mineBlast', { important: true }); this.duck(0.35, 0.6); } else this.at('mineBlast', null, pos, { far: 0.9 }); });
    on('emp:fire', ({ owner, pos }) => { if (me(owner)) this.play('emp', { important: true }); else this.at('emp', null, pos, { far: 0.9 }); this.duck(0.5, 0.8); });
    on('lightning:strike', ({ owner, target, pos }) => {
      if (me(target)) { this.play('lightning', { important: true }); this.duck(0.3, 1.5); }
      else if (me(owner)) this.play('thunderFar', { vol: 0.9 });          // V-20: the Storm user hears its strike land, wherever it is
      else this.at('lightning', null, pos, { far: 0.9 });
    });
    on('smoke:deploy', ({ owner, pos }) => this.at('smoke', owner, pos, { far: 0.7 }));
    on('drone:launch', ({ owner }) => this.at('droneLaunch', owner, owner?.render?.pos, { far: 0.7 }));
    // shields
    on('shield:up', ({ racer }) => this.at('shieldUp', racer, racer?.render?.pos, { far: 0.7 }));
    on('shield:block', ({ racer }) => { this.at('shieldBlock', racer, racer?.render?.pos, { far: 0.8 }); if (me(racer)) this.duck(0.6, 0.3); });
    on('shield:down', ({ racer }) => this.at('shieldDown', racer, racer?.render?.pos, { far: 0.6 }));
    // cannon
    on('cannon:fire', ({ racer, pos }) => this.at('cannon', racer, pos || racer?.render?.pos, { p: 0.94 + Math.random() * 0.14, far: 0.45, vol: me(racer) ? 0.8 : 1 }));
    on('cannon:hit', ({ racer, target, pos }) => { if (me(racer) || me(target)) this.play('cannonHit', { p: 0.9 + Math.random() * 0.2 }); else this.at('cannonHit', null, pos, { far: 0.5 }); });
    // damage
    on('racer:hit', ({ racer, kind, pos, severity }) => {
      const sev = severity ?? 0.5;
      if (kind === 'emp' || kind === 'lightning') return;       // their own sounds
      if (me(racer)) {
        if (kind === 'missile' || kind === 'mine') this.play('hitThump', { sev: 1, important: true });
        else this.play('hitThump', { sev });
        if (sev > 0.5) this.duck(0.55, 0.35);
      } else if (kind === 'racer' || kind === 'hazard' || kind === 'ground') this.at('hitThump', racer, pos || racer?.render?.pos, { sev, far: 0.6 });
    });
    on('racer:tumble', ({ racer, duration }) => { if (me(racer)) this.play('tumble', { dur: duration, important: true }); });
    on('racer:recover', ({ racer }) => { if (me(racer)) this.play('recover'); });
    on('racer:stall', ({ racer }) => { if (me(racer)) this.play('stall'); });
    on('racer:boost', ({ racer, kind }) => {
      if (me(racer)) { if (kind === 'ring') this.play('ringBoost'); else if (kind === 'item' || kind === 'meter') this.play('boostIgnite'); }
      else if (kind !== 'draft') this.at('boostIgnite', racer, racer?.render?.pos, { far: 0.4 });
    });
    on('racer:stunt', ({ racer, kind }) => {
      if (!me(racer)) return;
      if (kind === 'loop') this.play('loopWhoosh'); else if (kind === 'roll' || kind === 'barrel') this.play('rollWhoosh', { p: kind === 'barrel' ? 1.15 : 1 });
      else if (kind === 'nearmiss') this.play('nearMiss'); else this.play('stunt');
      if (kind === 'loop' || kind === 'roll') this.play('stunt', { vol: 0.8 });
    });
    on('racer:graze', ({ racer, intensity }) => {
      if (!me(racer)) return;
      this.scrape.level = Math.max(this.scrape.level, clamp(intensity ?? 0.6, 0.15, 1));
      this.scrape.until = (this.ctx?.currentTime ?? 0) + 0.16;
    });
    on('racer:draft', ({ racer, on: o }) => { if (me(racer)) this.drafting = !!o; });
  }

  resetRaceState() {
    this.chain = 0; this.lastGateT = -99; this.warn.t = -99; this.lock.t = -99; this.wrong.on = false; this.drafting = false;
    this.scrape.level = 0; this.itemReadyAt = 0; this.prevItem = null; this.prevHeat = 0; this.boostSm = 0;
  }

  setPaused(p) {
    this.paused = p; this.pausedAt = this.ctx?.currentTime ?? 0;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.worldBus.gain.setTargetAtTime(p ? 0 : 1, now, 0.04);
    this.musicFilter.frequency.setTargetAtTime(p ? 650 : 22000, now, 0.06);
    this.musicPause = p ? 0.55 : 1;
    if (!p && this.ctx.state === 'suspended' && !this.hidden) this.ctx.resume().catch(() => {});
  }

  // ---------------------------------------------------------------- per frame
  update(dt, game) {
    if (this.muted) return;
    if (!this.ctx) { if (navigator.userActivation?.hasBeenActive) this.ensure(); if (!this.ctx) return; }
    const c = this.ctx, now = c.currentTime;
    if (c.state !== 'running') return;
    this.sweep(now);
    // duck envelope
    const dTarget = (now < this.duckUntil ? this.duckLevel : 1) * this.musicPause;
    this.duckGain.gain.setTargetAtTime(dTarget, now, dTarget < this.duckGain.gain.value ? 0.03 : 0.5);
    // long pause -> suspend the context entirely (resumes on game:resume)
    if (this.paused && now - this.pausedAt > 45) { c.suspend().catch(() => {}); return; }
    this.updateListener(dt, game, now);
    this.updatePlayerEngine(game, now);
    this.updateAIEngines(game, now);
    if (!this.paused) this.updateWarnings(game, now);
  }

  updateListener(dt, game, now) {
    const cam = game.camera, L = c => c.listener;
    if (!cam) return;
    const T = game.THREE;
    if (!this.scratch) this.scratch = { cam: new T.Vector3(), fwd: new T.Vector3(), up: new T.Vector3(), prev: new T.Vector3(), vel: new T.Vector3(), first: true };
    const s = this.scratch;
    cam.updateMatrixWorld?.();
    cam.getWorldPosition(s.cam); cam.getWorldDirection(s.fwd); s.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (!s.first && dt > 0.0001) {
      s.vel.copy(s.cam).sub(s.prev).multiplyScalar(1 / dt);
      const m = s.vel.length();
      if (m > 450) s.vel.set(0, 0, 0);            // camera cut / teleport: no Doppler spike
    } else s.vel.set(0, 0, 0);
    s.prev.copy(s.cam); s.first = false;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.setValueAtTime(s.cam.x, now); l.positionY.setValueAtTime(s.cam.y, now); l.positionZ.setValueAtTime(s.cam.z, now);
      l.forwardX.setValueAtTime(s.fwd.x, now); l.forwardY.setValueAtTime(s.fwd.y, now); l.forwardZ.setValueAtTime(s.fwd.z, now);
      l.upX.setValueAtTime(s.up.x, now); l.upY.setValueAtTime(s.up.y, now); l.upZ.setValueAtTime(s.up.z, now);
    } else { l.setPosition(s.cam.x, s.cam.y, s.cam.z); l.setOrientation(s.fwd.x, s.fwd.y, s.fwd.z, s.up.x, s.up.y, s.up.z); }
  }

  updatePlayerEngine(game, now) {
    const p = game.player, st = game.state;
    const on = !!p && !this.paused && (st === 'race' || st === 'finish');
    if (p && this.peId !== (p.spec?.id || 'x')) {
      this.pe?.dispose(); this.pe = null;
      this.pe = new PlayerEngine(this.ctx, this.engineBus, voiceFor(p)); this.peId = p.spec?.id || 'x';
    }
    if (!p && this.pe) { this.pe.update({ on: false, speedN: 0, throttle: 0, boost: 0, g: 0, airbrake: 0, tumble: false, draft: 0, scrape: 0 }, now); if (this.pe.out.gain.value < 0.002) { this.pe.dispose(); this.pe = null; this.peId = null; } }
    if (!this.pe || !p) return;
    const fs = p.flight;
    this.boostSm += ((fs.boost?.active ? 1 : 0) - this.boostSm) * 0.12;
    const sc = now < this.scrape.until ? this.scrape.level : 0;
    if (sc === 0) this.scrape.level = 0;
    this.pe.update({
      on, speedN: (fs.speed || 0) / 110, throttle: fs.throttle ?? 0.6, boost: this.boostSm, g: fs.gLoad || 0, airbrake: fs.airbrake || 0,
      tumble: (fs.tumble?.t || 0) > 0, draft: this.drafting ? 1 : 0, scrape: sc,
    }, now);
    // overheat warning
    const h = p.heat || 0;
    if (h >= 0.99 && this.prevHeat < 0.99) this.play('overheat');
    this.prevHeat = h;
    // item-ready ping after an orb pickup, once the slot is filled
    if (this.itemReadyAt && now >= this.itemReadyAt) { this.itemReadyAt = 0; if (p.item) this.play('itemReady'); }
  }

  updateAIEngines(game, now) {
    const race = game.race, c = this.ctx, s = this.scratch;
    if (!s) return;
    const wantOn = !this.paused && race && (game.state === 'race' || game.state === 'demo' || game.state === 'title' || game.state === 'finish');
    while (this.ai.length < MAX_AI_VOICES) { this.ai.push(new AIEngine(c, this.engineBus, getLib(c))); }
    // candidates sorted by distance
    const cand = [];
    if (wantOn) for (const r of this.racers) {
      if (r === game.player || !r.render?.pos) continue;
      const p = r.render.pos, dx = p.x - s.cam.x, dy = p.y - s.cam.y, dz = p.z - s.cam.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 750 * 750) cand.push({ r, d2 });
    }
    cand.sort((a, b) => a.d2 - b.d2);
    cand.length = Math.min(cand.length, MAX_AI_VOICES);
    // keep stable assignments; free voices take new racers
    const keep = new Set(cand.map((x) => x.r));
    for (const a of this.ai) if (a.racer && !keep.has(a.racer)) { a.racer = null; a.silence(now); }
    for (const { r } of cand) {
      if (this.ai.some((a) => a.racer === r)) continue;
      const free = this.ai.find((a) => !a.racer);
      if (free) free.assign(r);
    }
    for (const a of this.ai) {
      const r = a.racer;
      if (!r) continue;
      const fs = r.flight, p = r.render.pos;
      let dx = s.cam.x - p.x, dy = s.cam.y - p.y, dz = s.cam.z - p.z; const d = Math.hypot(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
      const v = fs.vel, lv = s.vel;
      const rs = v ? v.x * dx + v.y * dy + v.z * dz : 0, ls = lv.x * dx + lv.y * dy + lv.z * dz;
      const dop = clamp((SPEED_OF_SOUND - ls) / Math.max(60, SPEED_OF_SOUND - rs), 0.78, 1.3);
      const tumbling = (fs.tumble?.t || 0) > 0;
      a.update(p, dop, tumbling ? 0.5 : 1, tumbling ? 0.9 : (fs.throttle ?? 0.6), fs.boost?.active ? 1 : 0, now);
    }
  }

  updateWarnings(game, now) {
    const p = game.player; if (!p) return;
    // escalating missile-warning pings: urgency u rises as time-to-impact drops (P-14); falls back to distance if no tti is given
    const w = this.warn;
    if (now - w.t < 0.9) {
      const u = w.tti != null ? clamp(1 - (w.tti - 0.4) / 3.6, 0, 1) : clamp(1 - w.dist / 450, 0, 1);
      if (now >= w.next) {
        this.play('warnBeep', { p: 0.85 + 0.55 * u, important: true });
        w.next = now + lerp(0.55, 0.085, Math.pow(u, 0.8));
        this.duck(0.7, 0.2);
      }
      // distinct "roll now" cue while a barrel roll would still evade the missile
      if (w.evade && now >= w.rollNext) { this.play('rollNow', { important: true }); w.rollNext = now + 0.5; }
    } else w.rollNext = 0;
    // a rival is locking on to us: soft tick that quickens with lock progress
    const l = this.locked;
    if (now - l.t < 0.4 && now >= l.next) { this.play('beingLocked', { p: 0.85 + 0.35 * l.progress }); l.next = now + lerp(0.5, 0.16, l.progress); }
    // our own lock-on progress: ticks accelerate and turn into a solid tone
    const k = this.lock;
    if (now - k.t < 0.35 && now >= k.next) {
      if (k.progress >= 0.97) { this.play('lockSolid'); k.next = now + 0.32; }
      else { this.play('lockTick', { p: 0.8 + 0.6 * k.progress }); k.next = now + lerp(0.4, 0.07, k.progress); }
    }
    if (this.wrong.on && now >= this.wrong.next) { this.play('wrongWay'); this.wrong.next = now + 1.25; }
  }
}
