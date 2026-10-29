// SKYBLITZ adaptive music player. Owner: audio agent.
// Tracks live in assets/music/<id>/{meta.json, base|lead|drive|final.ogg} (ferrosintesis renders, see assets/music-src/README.md).
// Every stem of a track has the same length: [intro | loop]. They start on the same sample-accurate AudioContext time and loop
// with loopStart/loopEnd, so layers can be faded freely without ever drifting. Stingers are one-shot files in assets/music/stingers.
import { clamp } from '../util.js';

const BASE_URL = new URL('../../assets/music/', import.meta.url);
const COURSE_TRACKS = new Set(['sunrise', 'redrock', 'neon', 'frost']);
const STINGERS = ['win', 'lose', 'finalLap'];

/** Pure layer-mix rules (unit-tested). state: { phase, place, n, boost 0..1, finalLap, tumble, danger, speedN }
 *  phase: 'menu' | 'pre' (grid/countdown) | 'race' | 'finish' | 'results' */
export function layerTargets(s) {
  const t = { base: 1, lead: 0, drive: 0, final: 0 };
  const n = Math.max(2, s.n || 8), p = clamp(((s.place || 1) - 1) / (n - 1), 0, 1);   // 0 = leading, 1 = last
  switch (s.phase) {
    case 'menu': case 'results': t.lead = 1; t.drive = 0.85; t.final = s.phase === 'results' ? 0.6 : 0.35; break;
    case 'pre': t.base = 0.85; t.lead = 0; break;
    case 'finish': t.lead = 1; t.drive = 0.6; t.final = 0.5; break;
    default: {
      t.lead = (0.8 + 0.2 * (1 - p)) * (s.tumble ? 0.45 : 1);                           // the hook is loudest when you lead
      t.drive = clamp(0.3 + 0.38 * p + 0.55 * (s.boost || 0) + 0.2 * (s.danger ? 1 : 0), 0, 1);   // energy when chasing / boosting / in danger
      t.final = s.finalLap ? 1 : 0;
      if (s.finalLap) t.drive = Math.max(t.drive, 0.7);
    }
  }
  return t;
}

export class MusicPlayer {
  constructor(game) {
    this.game = game; this.current = null; this.want = null; this.voice = null; this.old = [];
    this.cache = new Map();                 // id -> Promise<{meta, buffers}> (only the current + incoming track stay decoded)
    this.stingerBuf = {}; this.stingersLoading = false; this.hasStingers = false;
    this.phase = 'menu'; this.finalLap = false; this.stingerUntil = 0; this.offs = []; this.errors = [];
    this.targets = { base: 1, lead: 0, drive: 0, final: 0 }; this.token = 0; this.boostSm = 0; this.opts = {};
  }

  init() {
    const g = this.game, ev = g.events, on = (t, fn) => this.offs.push(ev.on(t, fn));
    on('game:state', ({ to }) => this.onState(to));
    on('game:raceStart', ({ race }) => {
      if (race?.demo || race?.cfg?.demo || race?.mode === 'demo') this.play('menu'); else this.play(g.course?.id || race?.course?.id || 'sunrise');
      this.phase = race?.demo ? 'menu' : 'pre'; this.finalLap = false;
    });
    on('race:go', () => { if (this.phase === 'pre') this.phase = 'race'; });
    on('race:finalLap', ({ racer }) => { if (racer === g.player) { this.finalLap = true; this.stinger('finalLap'); } });
    on('race:finish', ({ racer, place }) => { if (racer === g.player) { this.phase = 'finish'; this.stinger(place <= 3 ? 'win' : 'lose'); } });
    on('race:end', () => { this.finalLap = false; });
    on('audio:ready', () => this.kick());
  }

  onState(to) {
    if (to === 'results') { this.phase = 'results'; this.play('results'); }
    else if (to === 'title' || to === 'menu') { this.phase = 'menu'; this.play('menu'); }
    else if (to === 'race') { if (this.phase === 'menu' || this.phase === 'results') this.phase = 'pre'; }
  }

  get audio() { return this.game.audio; }
  get ctx() { return this.audio?.ctx || null; }

  resume() { this.kick(); }
  /** (Re)start whatever we want once the AudioContext exists. */
  kick() {
    if (!this.ctx) return;
    if (this.want && this.want !== this.current) this.play(this.want, this.opts);
    this.loadStingers();
  }

  // ---------------------------------------------------------------- loading
  async fetchBuf(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.arrayBuffer();
  }
  load(id) {
    let p = this.cache.get(id);
    if (p) return p;
    const c = this.ctx;
    p = (async () => {
      const meta = await (await fetch(new URL(`${id}/meta.json`, BASE_URL))).json();
      const names = Object.keys(meta.stems);
      const bufs = await Promise.all(names.map(async (n) => {
        const ab = await this.fetchBuf(new URL(`${id}/${meta.stems[n].file}`, BASE_URL));
        return c.decodeAudioData(ab);
      }));
      const buffers = {}; names.forEach((n, i) => { buffers[n] = bufs[i]; });
      return { meta, buffers };
    })();
    p.catch((e) => { this.errors.push(`${id}: ${e?.message || e}`); this.cache.delete(id); });
    this.cache.set(id, p);
    return p;
  }
  async loadStingers() {
    if (this.stingersLoading || !this.ctx) return;
    this.stingersLoading = true;
    for (const n of STINGERS) {
      try {
        const ab = await this.fetchBuf(new URL(`stingers/${n}.ogg`, BASE_URL));
        this.stingerBuf[n] = await this.ctx.decodeAudioData(ab);
      } catch (e) { this.errors.push(`stinger ${n}: ${e?.message || e}`); }
    }
    this.hasStingers = !!(this.stingerBuf.win && this.stingerBuf.lose);
  }

  // ---------------------------------------------------------------- playback
  /** Start a track (crossfading from the current one). opts: { fade, intro:true, layers } */
  async play(id, opts = {}) {
    this.want = id; this.opts = opts;
    if (!id || this.audio?.muted) return;
    if (id === this.current) return;
    const c = this.ctx;
    if (!c) return;                       // waits for the first gesture (kick() is called from resume())
    const token = ++this.token;
    let data;
    try { data = await this.load(id); } catch { return; }
    if (token !== this.token || c !== this.ctx) return;
    this.startVoice(id, data, opts);
  }

  startVoice(id, { meta, buffers }, opts) {
    const c = this.ctx, out = this.audio.musicIn;
    if (!out) return;
    const fade = opts.fade ?? 1.4, t0 = c.currentTime + 0.08;
    const now = c.currentTime;
    for (const v of this.old) this.release(v);
    this.old = [];
    if (this.voice) {                                           // crossfade out
      const o = this.voice; o.gain.gain.cancelScheduledValues(now); o.gain.gain.setValueAtTime(o.gain.gain.value, now); o.gain.gain.linearRampToValueAtTime(0, now + fade);
      o.dieAt = now + fade + 0.2; this.old.push(o);
    }
    const gain = c.createGain(); gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + fade); gain.connect(out);
    const introSec = meta.introSamples / meta.rate, endSec = meta.totalSamples / meta.rate;
    const skipIntro = opts.intro === false;
    const stems = {};
    for (const [n, buf] of Object.entries(buffers)) {
      const g = c.createGain(); g.gain.value = 0; g.connect(gain);
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = introSec; s.loopEnd = endSec; s.connect(g);
      s.start(t0, skipIntro ? introSec : 0);
      stems[n] = { src: s, gain: g };
    }
    this.voice = { id, meta, stems, gain, t0, dieAt: 0 };
    this.current = id;
    for (const k of Object.keys(stems)) stems[k].gain.gain.setValueAtTime(0, t0);
    this.applyTargets(0.02, true);
    // drop decoded buffers of everything but the track now playing (memory)
    for (const k of [...this.cache.keys()]) if (k !== id) this.cache.delete(k);
  }

  release(v) {
    for (const s of Object.values(v.stems)) { try { s.src.stop(); } catch { /* done */ } try { s.src.disconnect(); s.gain.disconnect(); } catch { /* gone */ } }
    try { v.gain.disconnect(); } catch { /* gone */ }
  }

  stop(fadeSec = 1) {
    this.want = null; this.token++;
    const c = this.ctx, v = this.voice;
    if (!c || !v) { this.current = null; return; }
    const now = c.currentTime;
    v.gain.gain.cancelScheduledValues(now); v.gain.gain.setValueAtTime(v.gain.gain.value, now); v.gain.gain.linearRampToValueAtTime(0, now + fadeSec);
    v.dieAt = now + fadeSec + 0.2; this.old.push(v); this.voice = null; this.current = null;
  }

  stinger(name) {
    const c = this.ctx, buf = this.stingerBuf[name];
    if (!c || !buf || this.audio?.muted || c.state !== 'running') return false;
    const s = c.createBufferSource(); s.buffer = buf;
    const g = c.createGain(); g.gain.value = 1; s.connect(g); g.connect(this.audio.musicBus);
    const t = c.currentTime + 0.02; s.start(t);
    this.stingerUntil = t + buf.duration * 0.8;
    s.onended = () => { try { s.disconnect(); g.disconnect(); } catch { /* gone */ } };
    return true;
  }

  // ---------------------------------------------------------------- per frame
  applyTargets(k = 0.5, immediate = false) {
    const v = this.voice, c = this.ctx;
    if (!v || !c) return;
    const now = c.currentTime, T = this.targets, quiet = now < this.stingerUntil ? 0.45 : 1;
    for (const [n, st] of Object.entries(v.stems)) {
      const target = (T[n] ?? 0) * quiet;
      if (immediate) st.gain.gain.setValueAtTime(target, now); else st.gain.gain.setTargetAtTime(target, now, k);
    }
  }

  update(dt, game) {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    if (this.old.length) this.old = this.old.filter((o) => { if (now >= o.dieAt) { this.release(o); return false; } return true; });
    const p = game.player, st = game.state, race = game.race;
    const fs = p?.flight;
    this.boostSm += ((fs?.boost?.active ? 1 : 0) - this.boostSm) * Math.min(1, dt * 4);
    const phase = (st === 'race' || st === 'finish') && p ? this.phase : st === 'results' ? 'results' : (st === 'loading' ? this.phase : 'menu');
    const warn = game.audio?.warn;
    this.targets = layerTargets({
      phase, place: p?.place || 1, n: race?.racers?.length || 8, boost: this.boostSm, finalLap: this.finalLap,
      tumble: (fs?.tumble?.t || 0) > 0, danger: !!warn && now - warn.t < 0.9,
    });
    this.applyTargets(0.6);
  }

  dispose() {
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (const o of this.old) this.release(o);
    if (this.voice) this.release(this.voice);
    this.voice = null; this.old = []; this.cache.clear();
  }
}
