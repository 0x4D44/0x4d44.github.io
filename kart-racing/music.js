// Apex Karts - soundtrack player. The music is composed as MIDI (audio/src), rendered offline with the
// ferrosintesis recorded-instrument synth and shipped as seamlessly looping Opus stems (audio/<theme>/*.ogg):
//   base (drums + bass + harmony) | lead (melody) | extra (percussion, arps, bells) | boost (horns, doubles).
// setIntensity() fades the extra/boost stems in and out in sample-aligned sync with the always-on base + lead.
// If the files cannot be fetched/decoded (or the browser has no Opus), the previous procedural synth engine
// (music-synth.js) takes over, so the music never breaks.
//
//   const m = new MusicEngine(ctx, destinationNode);
//   m.start("sunset", { fadeIn: 1 });  m.setIntensity(0..1);  m.stop(1);  m.dispose();
// Themes: "menu", "sunset", "snow", "neon", "results" + the per-track themes added later ("skyway", "canyon", "highland", "mall").
// Unknown ids fall back to one of the three original race themes.

const BASE = new URL("./audio/", import.meta.url).href;
const THEME_IDS = ["menu", "sunset", "snow", "neon", "results", "skyway", "canyon", "highland"];
const PREFETCH_IDS = ["menu", "sunset", "snow", "neon", "results"];   // idle-time prefetch pool (the per-track themes load on demand: ~1.3 MB of base+lead each)
const RACE_THEMES = ["sunset", "snow", "neon"];
const STEMS = ["base", "lead", "extra", "boost"];
const PRIMARY = ["base"];                   // must be decoded before the music starts (lead + the rest join as they arrive)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// stem gain as a function of intensity
const STEM_GAIN = {
  base: () => 1,
  lead: (i) => 0.9 + 0.1 * sstep(0, 0.4, i),
  extra: (i) => sstep(0.12, 0.5, i),
  boost: (i) => sstep(0.5, 0.85, i),
};
const SYNTH_WAIT_MS = 3500;                 // start the synth fallback if the files are not ready by then

function opusOk() {
  try {
    if (typeof document === "undefined") return true;
    const a = document.createElement("audio");
    return !!(a.canPlayType && (a.canPlayType('audio/ogg; codecs="opus"') || a.canPlayType("audio/webm; codecs=opus")));
  } catch (e) { return false; }
}

export class MusicEngine {
  constructor(ctx, out, opts = {}) {
    this.ctx = ctx;
    this.out = out;
    this._s = null;
    this._intensity = 0;
    this._tempoScale = 1;
    this._raw = new Map();        // url -> Promise<ArrayBuffer> (compressed files, kept for quick re-decode)
    this._dec = new Map();        // theme -> { stems: {name: AudioBuffer}, meta }
    this._synth = null;           // lazily created fallback engine
    this._synthFailed = false;
    this._disposed = false;
    this._offline = typeof OfflineAudioContext !== "undefined" && ctx instanceof OfflineAudioContext;
    this.noFiles = !!opts.noFiles;   // dev: force the synth fallback
    this.stats = { bytes: 0, fetchMs: 0, decodeMs: 0, mode: "none", firstSoundMs: 0 };
  }

  get playing() {
    if (this._synthActive && this._synth && this._synth.playing) return true;
    return !!this._s && !this._s.stopping;
  }

  setTempoScale(x) { this._tempoScale = clamp(+x || 1, 0.5, 1.5); if (this._synth) this._synth.setTempoScale(x); }

  setIntensity(x) {
    this._intensity = clamp(+x || 0, 0, 1);
    const S = this._s;
    if (S && S.stems) this._applyIntensity(S, false);
    if (this._synth) this._synth.setIntensity(this._intensity);
  }

  _resolve(themeId) {
    if (THEME_IDS.includes(themeId)) return themeId;
    let h = 0;
    for (const ch of String(themeId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return RACE_THEMES[h % RACE_THEMES.length];
  }

  /** Fetch + decode a theme's stems ahead of start() (resolves when the primary stems are ready; never rejects). */
  preload(themeId) {
    const id = this._resolve(themeId);
    return this._load(id, true).then(() => undefined, () => undefined);
  }

  // ---- loading ----------------------------------------------------------------------------------
  _fetch(url) {
    let p = this._raw.get(url);
    if (!p) {
      const t0 = performance.now();
      p = fetch(url).then((r) => {
        if (!r.ok) throw new Error(url + " " + r.status);
        return r.arrayBuffer();
      }).then((ab) => { this.stats.bytes += ab.byteLength; this.stats.fetchMs += performance.now() - t0; return ab; });
      p.catch(() => this._raw.delete(url));
      this._raw.set(url, p);
    }
    return p;
  }

  _decode(ab) {
    const t0 = performance.now();
    return new Promise((res, rej) => {
      const r = this.ctx.decodeAudioData(ab.slice(0), res, rej);
      if (r && r.then) r.then(res, rej);
    }).then((b) => { this.stats.decodeMs += performance.now() - t0; return b; });
  }

  /** Returns a record { stems, meta, ready: Promise (primary stems), all: Promise (every stem) }. */
  _load(id, onlyPrimary) {
    let rec = this._dec.get(id);
    if (!rec) {
      rec = { id, stems: {}, meta: null, failed: false, listeners: [] };
      const dir = BASE + id + "/";
      rec.metaP = this._fetch(dir + "meta.json").then((ab) => JSON.parse(new TextDecoder().decode(ab)));
      const one = (st) => rec.metaP.then((meta) => {
        rec.meta = meta;
        if (!meta.stems[st]) return null;
        return this._fetch(dir + st + ".ogg").then((ab) => this._decode(ab)).then((buf) => {
          rec.stems[st] = buf;
          for (const fn of rec.listeners) { try { fn(st, buf); } catch (e) { /* ignore */ } }
          return buf;
        });
      });
      // base first (it gates the start); the other stems are requested as soon as base has been downloaded
      const baseFetched = rec.metaP.then(() => this._fetch(dir + "base.ogg"));
      rec.primary = Promise.all(PRIMARY.map(one));
      rec.primary.catch(() => { rec.failed = true; });
      rec.rest = baseFetched.then(() => Promise.all(STEMS.filter((s) => !PRIMARY.includes(s)).map(one)));
      rec.rest.catch(() => {});
      this._dec.set(id, rec);
      // keep decoded memory bounded: current theme + one other
      while (this._dec.size > 2) {   // (while two themes are loading at once, never more than two)
        const k = [...this._dec.keys()].find((x) => x !== id && !(this._s && this._s.id === x));
        if (k == null) break;
        this._dec.delete(k);
      }
    }
    return onlyPrimary ? rec.primary.then(() => rec) : rec.rest.then(() => rec);
  }

  // ---- playback ---------------------------------------------------------------------------------
  start(themeId, { fadeIn = 0.8 } = {}) {
    const id = this._resolve(themeId);
    if (this._s && !this._s.stopping && this._s.id === id) return;
    if (this._synthActive && this._synth && this._synth.playing && this._s && this._s.id === id) return;
    if (this._s) this.stop(0.5);
    try { if (this.ctx.state === "suspended" && this.ctx.resume && !this._offline) this.ctx.resume().catch(() => {}); } catch (e) { /* ignore */ }
    const S = { id, stopping: false, begun: false, stems: null, fadeIn, born: performance.now(), gains: {}, srcs: {} };
    this._s = S;
    if (this.noFiles || !opusOk()) { this._useSynth(S); return; }
    const rec = this._load(id, true);
    rec.then((r) => {
      if (S.stopping || this._s !== S) return;
      this._begin(S, r);
    }).catch((err) => {
      if (this._s === S) { console.info("[music] stems unavailable, using synth fallback:", err && err.message); this._useSynth(S); }
    });
    S.synthTimer = this._offline ? 0 : setTimeout(() => { if (!S.begun && this._s === S && !S.stopping) this._useSynth(S); }, SYNTH_WAIT_MS);
    this.whenReady = this._load(id, false).then(() => undefined, () => undefined);   // every stem decoded (dev/test aid)
  }

  _begin(S, rec) {
    if (S.begun) return;
    S.begun = true;
    clearTimeout(S.synthTimer);
    if (this._synthActive) { try { this._synth.stop(0.5); } catch (e) { /* ignore */ } this._synthActive = false; }
    const c = this.ctx;
    S.rec = rec;
    for (const k of [...this._dec.keys()]) if (k !== S.id) this._dec.delete(k);   // keep only the playing theme decoded (memory)
    S.master = c.createGain();
    S.master.gain.value = 0;
    S.master.connect(this.out);
    S.stems = rec.stems;
    S.t0 = c.currentTime + 0.08;
    const now = c.currentTime;
    S.master.gain.setValueAtTime(0, now);
    S.master.gain.setValueAtTime(0, S.t0);
    S.master.gain.linearRampToValueAtTime(1, S.t0 + Math.max(0.02, S.fadeIn));
    this.stats.mode = "files";
    this.stats.firstSoundMs = performance.now() - S.born;
    for (const st of PRIMARY) this._attach(S, st, rec.stems[st]);
    this._applyIntensity(S, true);
    // later stems join in sync as soon as they are decoded
    const late = (st, buf) => { if (!S.stopping && this._s === S && !S.srcs[st]) { this._attach(S, st, buf); this._applyIntensity(S, true); } };
    rec.listeners.push(late);
    for (const st of STEMS) if (rec.stems[st] && !S.srcs[st]) this._attach(S, st, rec.stems[st]);
    this._applyIntensity(S, true);
    rec.rest.then(() => { if (!this._offline) this._prefetchOthers(S.id); }).catch(() => {});
  }

  _attach(S, st, buf) {
    if (!buf || S.srcs[st]) return;
    const c = this.ctx, meta = S.rec.meta;
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(S.master);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const dur = buf.duration;
    src.loopEnd = dur;
    src.loopStart = Math.max(0, dur - meta.loopSec);
    const intro = src.loopStart;
    src.connect(g);
    const now = c.currentTime + 0.03;
    const when = Math.max(S.t0, now);
    let pos = when - S.t0;                          // elapsed song time at `when`
    if (pos > intro) pos = intro + ((pos - intro) % meta.loopSec);
    src.start(when, pos);
    S.gains[st] = g; S.srcs[st] = src;
  }

  _applyIntensity(S, immediate) {
    const c = this.ctx, now = c.currentTime;
    for (const st of Object.keys(S.gains)) {
      const v = STEM_GAIN[st](this._intensity);
      const p = S.gains[st].gain;
      if (immediate && !S.gains[st]._set) { p.setValueAtTime(v, now); S.gains[st]._set = true; }
      else { p.cancelScheduledValues(now); p.setTargetAtTime(v, now, 0.35); }
    }
  }

  _useSynth(S) {
    if (this._synthFailed) return;
    S.usingSynth = true;
    const go = (m) => {
      if (this._s !== S || S.stopping || S.begun) return;
      this._synthActive = true;
      this.stats.mode = "synth";
      m.start(S.id, { fadeIn: S.fadeIn });
      m.setIntensity(this._intensity);
    };
    if (this._synth) { go(this._synth); return; }
    if (!this._synthLoading) {
      this._synthLoading = import("./music-synth.js").then((m) => { this._synth = new m.MusicEngine(this.ctx, this.out); return this._synth; })
        .catch((err) => { this._synthFailed = true; console.info("[music] synth fallback unavailable:", err && err.message); return null; });
    }
    this._synthLoading.then((m) => { if (m) go(m); });
  }

  _prefetchOthers(curId) {
    try {
      const conn = typeof navigator !== "undefined" && navigator.connection;
      if (conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ""))) return;
    } catch (e) { /* ignore */ }
    const list = [];
    for (const id of PREFETCH_IDS) if (id !== curId) for (const st of ["base", "lead"]) list.push(BASE + id + "/" + st + ".ogg");
    const run = () => {
      if (this._disposed || !list.length) return;
      this._fetch(list.shift()).then(() => setTimeout(run, 600), () => setTimeout(run, 600));
    };
    setTimeout(run, 3000);
  }

  stop(fadeOut = 1) {
    const S = this._s;
    if (this._synth && this._synthActive) { try { this._synth.stop(fadeOut); } catch (e) { /* ignore */ } this._synthActive = false; }
    if (!S) return;
    this._s = null;
    S.stopping = true;
    clearTimeout(S.synthTimer);
    if (S.rec) S.rec.listeners = S.rec.listeners.filter((f) => f.__s !== S);
    if (!S.master) return;
    const c = this.ctx, now = c.currentTime;
    try {
      S.master.gain.cancelScheduledValues(now);
      S.master.gain.setValueAtTime(S.master.gain.value, now);
      S.master.gain.linearRampToValueAtTime(0, now + Math.max(0.02, fadeOut));
    } catch (e) { /* ignore */ }
    const kill = () => this._kill(S);
    if (fadeOut <= 0 || this._offline) kill(); else setTimeout(kill, (fadeOut + 0.25) * 1000);
  }

  _kill(S) {
    for (const st of Object.keys(S.srcs)) { try { S.srcs[st].stop(); } catch (e) { /* ignore */ } try { S.srcs[st].disconnect(); S.gains[st].disconnect(); } catch (e) { /* ignore */ } }
    try { S.master.disconnect(); } catch (e) { /* ignore */ }
    S.srcs = {}; S.gains = {};
  }

  dispose() {
    this._disposed = true;
    this.stop(0);
    if (this._synth) { try { this._synth.dispose(); } catch (e) { /* ignore */ } }
    this._raw.clear();
    this._dec.clear();
  }
}
