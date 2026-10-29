// Spanish text-to-speech for NPC dialogue (Web Speech API) with a graceful fallback (subtitles + soft babble blips + one toast).
//
//   const sp = new Speech(ctx); sp.init();
//   const h = sp.speak('Buenas tardes.', { pitch: 1, rate: 1, gender: 'f', seed: 12 });   // h.done: Promise<'spoken'|'fallback'|'cancelled'>
//   sp.cancel();
//
// Voice ranking (first match wins): es-CO > es-MX > es-US/es-419 > es-AR > es-CL > es-ES > any es* > nothing.
// `window.speechSynthesis` is read at CALL time so tests can swap it for a spy.

export const LANG_RANK = ['es-CO', 'es-MX', 'es-US', 'es-419', 'es-AR', 'es-CL', 'es-ES'];
const FEMALE = /sabina|helena|laura|dalia|salome|elvira|paloma|camila|lupe|paulina|monica|marisol|sofia|elena|female|mujer|luciana|valentina|catalina|marta|isabela|ximena|abril|ramona/i;
const MALE = /raul|pablo|jorge|gonzalo|alvaro|jaime|diego|carlos|male|hombre|enrique|andres|juan|miguel|alonso|tomas|emilio|lorenzo|mateo|jesus/i;

const norm = (l) => String(l || '').replace('_', '-');

/** Rank of a voice's language (lower = better). */
export function langRank(lang) {
  const l = norm(lang);
  const i = LANG_RANK.findIndex((x) => x.toLowerCase() === l.toLowerCase());
  if (i >= 0) return i;
  if (/^es([-_]|$)/i.test(l)) return 20;                       // any other Spanish
  return 100;                                                  // not Spanish
}

/** Spanish voices only, best language first (stable; local voices before network ones inside a language). */
export function rankVoices(voices) {
  return [...voices]
    .map((v, i) => ({ v, i, r: langRank(v.lang) }))
    .filter((x) => x.r < 100)
    .sort((a, b) => a.r - b.r || (b.v.localService ? 1 : 0) - (a.v.localService ? 1 : 0) || a.i - b.i)
    .map((x) => x.v);
}

export function voiceGender(v) { const n = v.name || ''; return FEMALE.test(n) ? 'f' : MALE.test(n) ? 'm' : '?'; }

/** Choose a voice for an NPC: best language group, preferring the NPC's gender, spread by `seed` over equal candidates. */
export function pickVoice(ranked, { gender = '?', seed = 0, preferURI = null } = {}) {
  if (!ranked.length) return null;
  if (preferURI) { const p = ranked.find((v) => v.voiceURI === preferURI || v.name === preferURI); if (p) return p; }
  const bestRank = langRank(ranked[0].lang);
  const group = ranked.filter((v) => langRank(v.lang) === bestRank);
  const same = group.filter((v) => voiceGender(v) === gender);
  const pool = same.length ? same : group;                       // the language ranking outranks gender: a Colombian voice beats a Mexican one of the "right" gender
  return pool[Math.abs(seed | 0) % pool.length];
}

export class Speech {
  constructor(ctx) {
    this.ctx = ctx; this.enabled = true; this.ranked = []; this.ready = false; this.reason = null;   // reason: why TTS is unavailable
    this.toasted = false; this.cur = null; this.volume = 1; this.voiceURI = null; this.log = []; this.babble = true;
    this._ac = null;
  }

  synth() { return typeof window !== 'undefined' ? (window.speechSynthesis ?? null) : null; }

  /** The player really used the page (a trusted gesture or sticky user activation): only then may an AudioContext be created or resumed (Chrome warns otherwise). */
  _activated(e = null) {
    try { return e?.isTrusted === true || navigator.userActivation?.hasBeenActive === true; } catch { return false; }
  }

  /**
   * The babble fallback needs an AudioContext. Reuse the game's own (ctx.audio) when it has one; otherwise create ours on the first TRUSTED
   * key / click, so it is ready in time and script-made events never trigger the "AudioContext was not allowed to start" warning.
   */
  _audio(create = true, e = null) {
    try {
      const shared = this.ctx?.audio?.context?.() ?? this.ctx?.audio?.ac ?? null;
      const ac = shared ?? this._ac;
      if (ac) { if (ac.state === 'suspended' && this._activated(e)) ac.resume?.(); return ac; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC || !create || !this._activated(e)) return null;
      this._ac = new AC();
      return this._ac;
    } catch { return null; }
  }

  init() {
    if (typeof window !== 'undefined' && !this._unlock) {
      this._unlock = (e) => {
        if (!this._activated(e)) return;                            // a script-made event: keep waiting for a real one
        window.removeEventListener('pointerdown', this._unlock, true); window.removeEventListener('keydown', this._unlock, true); this._audio(true, e);
      };
      window.addEventListener('pointerdown', this._unlock, true); window.addEventListener('keydown', this._unlock, true);
    }
    const ss = this.synth();
    if (!ss) { this.reason = 'unsupported'; this.ready = true; return this; }
    const refresh = () => {
      try { this.ranked = rankVoices(ss.getVoices?.() ?? []); } catch { this.ranked = []; }
      this.ready = true;
      if (!this.ranked.length) this.reason = 'novoice'; else this.reason = null;
    };
    refresh();
    try { ss.addEventListener?.('voiceschanged', refresh); } catch { /* old browsers */ }
    if (!ss.addEventListener) ss.onvoiceschanged = refresh;
    return this;
  }

  /** Spanish voices for the settings panel: [{ name, lang, uri, gender }]. */
  voices() { return this.ranked.map((v) => ({ name: v.name, lang: v.lang, uri: v.voiceURI, gender: voiceGender(v), local: !!v.localService })); }
  setVoice(uri) { this.voiceURI = uri || null; }
  get available() { return this.enabled && !!this.synth() && this.ranked.length > 0 && this.reason == null; }

  /** One-time explanation when speech cannot play (called by speak()). */
  _notice() {
    if (this.toasted) return; this.toasted = true;
    const why = this.reason === 'unsupported' ? 'Este navegador no tiene voz' : this.reason === 'blocked' ? 'El navegador bloqueó la voz' : 'No hay voz en español instalada';
    try { this.ctx.ui.toast(`${why}: solo subtítulos. / No Spanish voice: subtitles only.`, 4500); } catch { /* ui not ready */ }
  }

  /** Soft babble: one short blip per ~2 letters, pitched by the persona. Returns its duration in ms. */
  _blips(text, pitch = 1) {
    const dur = this.estimate(text);
    if (!this.babble) return dur;
    try {
      const ac = this._audio(false); if (!ac || ac.state !== 'running') return dur;      // no gesture yet: stay silent (subtitles carry the line)
      const t0 = ac.currentTime + 0.02, n = Math.min(60, Math.ceil(text.length / 2.4)), gap = (dur / 1000) / n;
      const g = ac.createGain(); g.gain.value = 0.045 * this.volume; g.connect(ac.destination);
      for (let i = 0; i < n; i++) {
        const o = ac.createOscillator(); const e = ac.createGain(); o.type = 'triangle';
        const base = 150 + 70 * pitch, f = base * (1 + 0.28 * Math.sin(i * 1.7) + ((text.charCodeAt(i * 2) || 0) % 7) * 0.035);
        o.frequency.value = f; e.gain.setValueAtTime(0, t0 + i * gap); e.gain.linearRampToValueAtTime(1, t0 + i * gap + 0.012); e.gain.linearRampToValueAtTime(0, t0 + i * gap + Math.min(0.09, gap * 0.9));
        o.connect(e); e.connect(g); o.start(t0 + i * gap); o.stop(t0 + i * gap + 0.1);
      }
    } catch { /* AudioContext blocked */ }
    return dur;
  }

  estimate(text) { return Math.max(900, text.length * 62 + 500); }

  /**
   * Speak one line. opts: { pitch, rate, gender, seed, lang }. Returns { done: Promise, cancel() }.
   * `done` resolves with 'spoken' (TTS finished), 'fallback' (no voice: timed subtitle + blips) or 'cancelled'.
   */
  speak(text, opts = {}) {
    this.cancel();
    const rec = { text, opts, mode: null, t0: performance.now(), cancelled: false };
    this.log.push({ text, t: Date.now() }); if (this.log.length > 60) this.log.shift();
    let finish; const done = new Promise((r) => { finish = r; });
    rec.finish = (v) => { if (rec.ended) return; rec.ended = true; clearTimeout(rec.timer); if (this.cur === rec) this.cur = null; finish(v); };
    rec.cancel = () => { rec.cancelled = true; try { this.synth()?.cancel(); } catch { /* ignore */ } rec.finish('cancelled'); };
    this.cur = rec; rec.done = done;
    const ss = this.synth();
    if (!this.enabled) { rec.mode = 'muted'; rec.timer = setTimeout(() => rec.finish('fallback'), this.estimate(text)); return rec; }
    if (ss && !this.ranked.length) { try { this.ranked = rankVoices(ss.getVoices?.() ?? []); } catch { /* ignore */ } if (this.ranked.length) this.reason = null; }
    if (!ss || !this.ranked.length) {
      if (!ss) this.reason = 'unsupported'; else this.reason = 'novoice';
      this._notice(); rec.mode = 'fallback';
      const ms = this._blips(text, opts.pitch ?? 1); rec.timer = setTimeout(() => rec.finish('fallback'), ms); return rec;
    }
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(this.ranked, { gender: opts.gender ?? '?', seed: opts.seed ?? 0, preferURI: this.voiceURI });
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = opts.lang ?? 'es-CO';
      u.pitch = Math.max(0.1, Math.min(2, opts.pitch ?? 1)); u.rate = Math.max(0.5, Math.min(1.6, opts.rate ?? 1)); u.volume = Math.max(0, Math.min(1, this.volume));
      rec.mode = 'tts'; rec.voice = v ? v.name : null;
      u.onend = () => rec.finish('spoken');
      u.onerror = (e) => {
        if (rec.cancelled || e?.error === 'canceled' || e?.error === 'interrupted') { rec.finish('cancelled'); return; }
        this.reason = (e?.error === 'not-allowed') ? 'blocked' : 'error'; this._notice(); rec.mode = 'fallback';
        const ms = this._blips(text, opts.pitch ?? 1); rec.timer = setTimeout(() => rec.finish('fallback'), ms);
      };
      // Chrome drops a speak() issued in the same tick as cancel(): defer a hair. Watchdog covers engines that never fire `end`.
      setTimeout(() => { if (rec.cancelled || rec.ended) return; try { this.synth().speak(u); } catch { rec.finish('fallback'); } }, 30);
      rec.timer = setTimeout(() => { if (!rec.ended) { try { this.synth()?.cancel(); } catch { /* ignore */ } rec.finish('spoken'); } }, this.estimate(text) * 2.2 + 3000);
    } catch (e) {
      this.reason = 'error'; this._notice(); rec.mode = 'fallback'; rec.timer = setTimeout(() => rec.finish('fallback'), this.estimate(text));
    }
    return rec;
  }

  cancel() {
    const c = this.cur; if (c) c.cancel();
    else { try { this.synth()?.cancel(); } catch { /* ignore */ } }
  }
}
