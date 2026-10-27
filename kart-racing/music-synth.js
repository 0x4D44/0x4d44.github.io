// Apex Karts - procedural soundtrack engine. All sound is synthesised with WebAudio (no samples).
// Songs live in music-data.js (pure data); this file turns them into audio.
//
//   const m = new MusicEngine(ctx, destinationNode);
//   m.start("sunset", { fadeIn: 1 });  m.setIntensity(0..1);  m.stop(1);  m.dispose();
// Themes: "menu", "sunset", "snow", "neon", "results". Unknown ids fall back to a race theme.
// The engine never needs ctx.resume() itself, but audio is silent while the context is suspended
// (it will schedule once the context runs). Everything is cleaned up on stop()/dispose().

import { THEMES, RACE_THEMES, compileTheme } from "./music-synth-data.js";

const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const LEVEL = 0.7;               // master output level of the engine
const LOOKAHEAD = 0.16;           // seconds scheduled ahead while visible
const LOOKAHEAD_HIDDEN = 1.4;     // timers are throttled in background tabs

function hr(a, b, c) {            // deterministic hash -> [0,1)
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// default bus settings (themes can override via theme.mix[name])
const BUSES = {
  kick: { g: 0.6, hp: 30 },
  snare: { g: 0.8, rev: 0.2, dly: 0.04 },
  hat: { g: 0.5, rev: 0.05 },
  perc: { g: 0.7, rev: 0.2 },
  bass: { g: 1.0, lp: 2600, duck: 0.45 },
  pad: { g: 0.8, hp: 120, lp: 6500, duck: 0.5, rev: 0.3 },
  keys: { g: 0.8, hp: 140, rev: 0.3, dly: 0.25, duck: 0.7 },
  arp: { g: 0.7, hp: 200, rev: 0.2, dly: 0.35, duck: 0.7 },
  stab: { g: 0.7, hp: 200, rev: 0.2, dly: 0.1, duck: 0.8 },
  lead: { g: 0.85, hp: 200, rev: 0.3, dly: 0.3 },
  counter: { g: 0.6, hp: 300, rev: 0.35, dly: 0.35 },
};

const KS = {
  pluck: { decay: 0.998, bright: 0.55, len: 1.6 },
  pizz: { decay: 0.994, bright: 0.8, len: 0.7 },
};

export class MusicEngine {
  constructor(ctx, out, opts = {}) {
    this.ctx = ctx;
    this.out = out;
    this.manual = !!opts.manual;        // offline rendering: caller pumps the scheduler
    this._s = null;
    this._timer = null;
    this._tempoScale = 1;
    this._intensity = 0;
    this._compiled = {};
    this._ks = new Map();
    this._irs = new Map();
    this._noise = null;
    this._vis = () => { if (this._s && !this.manual) this._tick(); };
    if (typeof document !== "undefined" && !this.manual) document.addEventListener("visibilitychange", this._vis);
  }

  get playing() { return !!this._s && !this._s.stopping; }

  setTempoScale(x) { this._tempoScale = clamp(+x || 1, 0.5, 1.5); }

  setIntensity(x) {
    this._intensity = clamp(+x || 0, 0, 1);
    if (this._s && this.manual) this._s.int = this._intensity;
  }

  start(themeId, { fadeIn = 0.8 } = {}) {
    let id = THEMES[themeId] ? themeId : null;
    if (!id) {
      let h = 0;
      for (const ch of String(themeId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      id = RACE_THEMES[h % RACE_THEMES.length];
    }
    if (this._s && !this._s.stopping && this._s.id === id) return;
    if (this._s) this.stop(0.5);
    try { if (this.ctx.state === "suspended" && this.ctx.resume && !this.manual) this.ctx.resume().catch(() => {}); } catch (e) { /* ignore */ }
    this._s = this._build(id, fadeIn);
    if (!this.manual) {
      this._timer = setInterval(() => this._tick(), 25);
      this._tick();
    }
  }

  stop(fadeOut = 1) {
    const S = this._s;
    if (!S) return;
    this._s = null;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    S.stopping = true;
    const c = this.ctx;
    const now = c.currentTime;
    try {
      S.fade.gain.cancelScheduledValues(now);
      S.fade.gain.setValueAtTime(S.fade.gain.value, now);
      S.fade.gain.linearRampToValueAtTime(0, now + Math.max(0.02, fadeOut));
    } catch (e) { /* ignore */ }
    if (this.manual || fadeOut <= 0) { this._destroy(S); return; }
    S.killTimer = setTimeout(() => this._destroy(S), (fadeOut + 0.25) * 1000);
    (this._dying || (this._dying = new Set())).add(S);
  }

  dispose() {
    this.stop(0);
    if (this._dying) for (const S of [...this._dying]) this._destroy(S);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this._vis);
    this._ks.clear();
    this._irs.clear();
  }

  // ---- offline / manual pumping (used by the dev harness) ------------------------------------
  pump(untilTime) {
    const S = this._s;
    if (!S) return;
    S.int = this._intensity;
    while (S.nextTime < untilTime) this._advance(S);
  }

  // ---- graph construction ---------------------------------------------------------------------
  _noiseBuf() {
    if (this._noise) return this._noise;
    const c = this.ctx, n = Math.floor(c.sampleRate * 2);
    const b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let x = 12345;
    for (let i = 0; i < n; i++) { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; d[i] = x / 2147483648 - 1; }
    this._noise = b;
    return b;
  }

  _ir(len, tau) {
    const key = len + "/" + tau;
    if (this._irs.has(key)) return this._irs.get(key);
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * len);
    const b = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let x = 777 + ch * 1013, y = 0;
      const pre = Math.floor(sr * 0.012);
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr;
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        const v = x / 2147483648 - 1;
        const a = 0.06 + 0.8 * Math.exp(-t / 0.35);       // progressive darkening
        y += a * (v - y);
        d[i] = y * Math.exp(-t / tau) * (1 - Math.exp(-t / 0.012));
      }
      for (const [tt, g] of [[0.017, 0.5], [0.029, 0.4], [0.041, 0.3], [0.053, 0.25]]) {   // early reflections
        const i = Math.floor(sr * (tt + ch * 0.004));
        if (i < n) d[i] += g * (ch ? -1 : 1);
      }
      const fadeN = Math.floor(sr * 0.1);
      for (let i = 0; i < fadeN; i++) d[n - 1 - i] *= i / fadeN;
    }
    this._irs.set(key, b);
    return b;
  }

  _build(id, fadeIn) {
    const c = this.ctx;
    const th = THEMES[id];
    const song = this._compiled[id] || (this._compiled[id] = compileTheme(th));
    const S = {
      id, th, song, stopping: false, nodes: [], voices: new Set(), ducks: [], b: {},
      bar: 0, s16: 0, gstep: 0, int: this._intensity, sd: 0, dlyT: 0,
    };
    const N = (n) => { S.nodes.push(n); return n; };
    const t0 = c.currentTime + (this.manual ? 0.05 : 0.1);
    S.nextTime = t0;

    // master chain: sum -> saturation -> compressor -> limiter -> DC/sub filter -> fade -> out
    S.sum = N(c.createGain()); S.sum.gain.value = 0.34;
    const sat = N(c.createWaveShaper());
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) { const x = (i / 1024 - 1) * 1.0; curve[i] = Math.tanh(x * 1.25) / 1.25 * 1.05; }
    sat.curve = curve;
    const comp = N(c.createDynamicsCompressor());
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 3.2; comp.attack.value = 0.012; comp.release.value = 0.2;
    const lim = N(c.createDynamicsCompressor());
    lim.threshold.value = -4; lim.knee.value = 1; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08;
    const hp = N(c.createBiquadFilter()); hp.type = "highpass"; hp.frequency.value = 28; hp.Q.value = 0.6;
    S.fade = N(c.createGain());
    S.fade.gain.setValueAtTime(0, t0);
    S.fade.gain.linearRampToValueAtTime(LEVEL, t0 + Math.max(0.02, fadeIn));
    const clip = N(c.createWaveShaper());           // final soft ceiling: guarantees |x| < 0.97
    const cc = new Float32Array(2049);
    for (let i = 0; i < cc.length; i++) { const x = (i / 1024 - 1) * 2; cc[i] = 0.97 * Math.tanh(x / 0.97); }
    clip.curve = cc;
    S.sum.connect(sat); sat.connect(comp); comp.connect(lim); lim.connect(hp); hp.connect(clip); clip.connect(S.fade); S.fade.connect(this.out);

    // reverb
    S.revIn = N(c.createGain());
    const rhp = N(c.createBiquadFilter()); rhp.type = "highpass"; rhp.frequency.value = 220;
    const conv = N(c.createConvolver());
    conv.buffer = this._ir(th.fx.rev.len, th.fx.rev.tau);
    const rret = N(c.createGain()); rret.gain.value = 0.55;
    S.revIn.connect(rhp); rhp.connect(conv); conv.connect(rret); rret.connect(S.sum);

    // tempo-synced ping-pong delay
    S.dlyIn = N(c.createGain());
    const dL = N(c.createDelay(2)), dR = N(c.createDelay(2));
    const fbF = N(c.createBiquadFilter()); fbF.type = "lowpass"; fbF.frequency.value = 3200;
    const fbG = N(c.createGain()); fbG.gain.value = th.fx.dly.fb;
    const pL = N(c.createStereoPanner()), pR = N(c.createStereoPanner());
    pL.pan.value = -0.65; pR.pan.value = 0.65;
    const dret = N(c.createGain()); dret.gain.value = 0.5;
    S.dlyIn.connect(dL); dL.connect(dR); dR.connect(fbF); fbF.connect(fbG); fbG.connect(dL);
    dL.connect(pL); dR.connect(pR); pL.connect(dret); pR.connect(dret); dret.connect(S.sum);
    S.dL = dL; S.dR = dR;

    // buses
    for (const name of Object.keys(BUSES)) {
      const cfg = Object.assign({}, BUSES[name], th.mix && th.mix[name]);
      const inp = N(c.createGain());
      let node = inp;
      if (cfg.hp) { const f = N(c.createBiquadFilter()); f.type = "highpass"; f.frequency.value = cfg.hp; f.Q.value = 0.7; node.connect(f); node = f; }
      if (cfg.lp) { const f = N(c.createBiquadFilter()); f.type = "lowpass"; f.frequency.value = cfg.lp; f.Q.value = 0.7; node.connect(f); node = f; }
      if (cfg.duck) { const d = N(c.createGain()); node.connect(d); node = d; S.ducks.push({ p: d.gain, depth: cfg.duck }); }
      const o = N(c.createGain()); o.gain.value = cfg.g;
      node.connect(o); o.connect(S.sum);
      if (cfg.rev) { const r = N(c.createGain()); r.gain.value = cfg.rev; o.connect(r); r.connect(S.revIn); }
      if (cfg.dly) { const d = N(c.createGain()); d.gain.value = cfg.dly; o.connect(d); d.connect(S.dlyIn); }
      S.b[name] = inp;
    }

    // shared vibrato LFO (5.6 Hz)
    S.lfo = N(c.createOscillator()); S.lfo.frequency.value = 5.6; S.lfo.start(t0);

    this._setTempo(S, t0);
    return S;
  }

  _destroy(S) {
    if (S.killTimer) clearTimeout(S.killTimer);
    if (this._dying) this._dying.delete(S);
    for (const v of S.voices) {
      for (const s of v.srcs) { try { s.stop(); } catch (e) { /* ignore */ } }
      for (const n of v.nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    }
    S.voices.clear();
    try { S.lfo.stop(); } catch (e) { /* ignore */ }
    for (const n of S.nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
    S.nodes.length = 0;
  }

  // ---- scheduler ------------------------------------------------------------------------------
  _stepDur(S) {
    const lift = S.th.lift == null ? 0.045 : S.th.lift;
    return 60 / (S.song.bpm * this._tempoScale * (1 + lift * S.int)) / 4;
  }

  _setTempo(S, now) {
    const sd = this._stepDur(S);
    S.sd = sd;
    const dt = clamp(sd * S.th.fx.dly.steps, 0.05, 1.9);
    if (Math.abs(dt - S.dlyT) > 1e-4) {
      S.dlyT = dt;
      if (S.dL.delayTime.value === 0 && now <= this.ctx.currentTime + 0.2) { S.dL.delayTime.value = dt; S.dR.delayTime.value = dt; }
      else { S.dL.delayTime.setTargetAtTime(dt, now, 0.3); S.dR.delayTime.setTargetAtTime(dt, now, 0.3); }
    }
  }

  _tick() {
    const S = this._s;
    if (!S) return;
    const c = this.ctx;
    if (c.state === "closed") return;
    const now = c.currentTime;
    const hidden = typeof document !== "undefined" && document.hidden;
    const ahead = hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
    // ease intensity
    S.int += (this._intensity - S.int) * 0.08;
    if (Math.abs(this._intensity - S.int) < 0.002) S.int = this._intensity;
    // fell behind (tab throttled / hitch): skip forward in musical time instead of bursting
    if (S.nextTime < now - 0.12) {
      const skip = Math.floor((now + 0.03 - S.nextTime) / S.sd);
      for (let i = 0; i < skip; i++) this._stepPos(S, false);
      S.nextTime += skip * S.sd;
    }
    let guard = 0;
    while (S.nextTime < now + ahead && guard++ < 400) this._advance(S);
  }

  _stepPos(S, count = true) {
    S.s16++;
    S.gstep++;
    if (S.s16 >= 16) {
      S.s16 = 0;
      S.bar++;
      if (S.bar >= S.song.bars.length) S.bar = S.song.loopBar;
    }
  }

  _advance(S) {
    this._setTempo(S, S.nextTime);
    this._scheduleStep(S, S.nextTime);
    S.nextTime += S.sd;
    this._stepPos(S);
  }

  _scheduleStep(S, t) {
    const bar = S.song.bars[S.bar];
    const s16 = S.s16;
    const sd = S.sd, int = S.int;
    const swing = S.th.swing || 0;
    const tt = t + ((s16 & 1) ? swing * sd : 0);
    const evs = bar.at[s16];
    let hasHat = false, hasOpen = false, hasClap = false, hasSnare = false;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.min > int + 1e-6) continue;
      if (e.p === "d") { if (e.d === "h") hasHat = true; else if (e.d === "o") hasOpen = true; else if (e.d === "c") hasClap = true; else if (e.d === "s") hasSnare = true; }
      this._play(S, e, tt, sd, i);
    }
    // intensity-driven percussion lifts
    if (bar.hasKick === undefined) bar.hasKick = bar.at.some((a) => a.some((x) => x.p === "d" && x.d === "k"));
    const dr = bar.hasKick;
    if (dr) {
      if (int >= 0.4 && !hasHat && (s16 & 1)) this._play(S, { p: "d", d: "h", v: 0.34, min: 0 }, tt, sd, 90);
      if (int >= 0.75 && !hasOpen && (s16 & 3) === 2) this._play(S, { p: "d", d: "o", v: 0.45, min: 0 }, tt, sd, 91);
      if (int >= 0.8 && !hasClap && !hasSnare && (s16 === 4 || s16 === 12)) this._play(S, { p: "d", d: "c", v: 0.7, min: 0 }, tt, sd, 92);
    }
  }

  _play(S, e, t, sd, idx) {
    const th = S.th, P = th.patch, gs = S.gstep, int = S.int;
    if (this._solo && e.p !== this._solo) return;     // dev hook: solo one part
    const drum = e.p === "d";
    const jit = (hr(gs, idx, 2) - 0.5) * 2 * (drum ? 0.0015 : 0.005);
    const vh = 1 + (hr(gs, idx, 1) - 0.5) * (drum ? 0.12 : 0.18);
    const tm = Math.max(t + jit, this.ctx.currentTime);
    const v = clamp(e.v * vh, 0.05, 1.1);
    switch (e.p) {
      case "d": this._drum(S, e, tm, v); break;
      case "lead": {
        const dur = e.l * sd * 0.97;
        this._inst(S, "lead", tm, dur, mtof(e.n), v, int);
        if (P.leadDbl && int >= 0.65) this._inst(S, "lead", tm, dur, mtof(e.n + 12), v * 0.8, int, P.leadDbl);
        break;
      }
      case "counter": this._inst(S, "counter", tm, e.l * sd * 0.9, mtof(e.n), v, int); break;
      case "bass": this._inst(S, "bass", tm, e.l * sd * 0.92, mtof(e.n), v, int); break;
      case "arp": if (S.voices.size < 110) this._inst(S, "arp", tm, e.l * sd * 0.8, mtof(e.n), v, int); break;
      case "pad": this._chord(S, "pad", tm, e.l * sd, e.notes, v, undefined, int); break;
      case "stab":
        if (P.stab.inst === "chord") this._chord(S, "stab", tm, e.l * sd * 0.9, e.notes, v, undefined, int);
        else for (let i = 0; i < e.notes.length; i++) this._inst(S, "stab", tm + i * 0.006, e.l * sd * 0.9, mtof(e.notes[i]), v, int);
        break;
      case "keys": {
        if (S.voices.size > 120) break;
        const n = e.notes;
        for (let i = 0; i < n.length; i++) this._fm(S, "keys", tm + i * 0.004, e.l * sd, mtof(n[i]), v * (i === 0 ? 0.8 : 1), P.keys);
        break;
      }
      default: break;
    }
  }

  _inst(S, bus, t, dur, f, vel, int, patch) {
    const p = patch || S.th.patch[bus];
    switch (p.inst) {
      case "synth": this._synth(S, bus, t, dur, f, vel, p, int); break;
      case "fm": this._fm(S, bus, t, dur, f, vel, p); break;
      case "bell": this._bell(S, bus, t, f, vel, p); break;
      case "ks": this._pluck(S, bus, t, dur, f, vel, p); break;
      case "marimba": this._marimba(S, bus, t, f, vel, p); break;
      case "chord": this._chord(S, bus, t, dur, [Math.round(69 + 12 * Math.log2(f / 440))], vel, p, int); break;
      default: break;
    }
  }

  _reg(S, srcs, nodes, stopT) {
    const v = { srcs, nodes };
    S.voices.add(v);
    srcs[0].onended = () => {
      for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
      S.voices.delete(v);
    };
    for (const s of srcs) s.stop(stopT);
  }

  // ---- instruments ----------------------------------------------------------------------------
  _synth(S, bus, t, dur, f, vel, p, int = 0) {
    if (S.voices.size > 150) return;
    const c = this.ctx;
    const nodes = [], srcs = [];
    const amp = c.createGain(); nodes.push(amp);
    const filt = c.createBiquadFilter(); filt.type = "lowpass"; filt.Q.value = p.q || 0.8; nodes.push(filt);
    const cut = Math.min(15000, (p.cut || 3000) * (1 + (p.bright || 0) * int));
    const env = p.env || 1;
    filt.frequency.setValueAtTime(Math.min(16000, cut * env), t);
    if (env > 1) filt.frequency.setTargetAtTime(cut, t + 0.003, p.fd || 0.15);
    const a = p.a || 0.005;
    const nO = p.oscs.length;
    const peak = vel * (p.g || 0.2) / Math.sqrt(Math.max(1, nO * 0.6));
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + a);
    const sus = p.sus == null ? 1 : p.sus;
    if (sus < 1) amp.gain.setTargetAtTime(peak * sus, t + a, p.dec || 0.3);
    const end = t + Math.max(dur, a + 0.015);
    const rel = p.rel || 0.08;
    amp.gain.setTargetAtTime(0, end, rel / 3);
    let vg = null;
    if (p.vib) {
      vg = c.createGain(); nodes.push(vg);
      vg.gain.setValueAtTime(0, t);
      vg.gain.setValueAtTime(0, t + (p.vd || 0.2));
      vg.gain.linearRampToValueAtTime(p.vib, t + (p.vd || 0.2) + 0.35);
      S.lfo.connect(vg);
    }
    for (const od of p.oscs) {
      const o = c.createOscillator();
      o.type = od.t;
      o.frequency.value = f * (od.m || 1);
      o.detune.value = od.d || 0;
      if (vg) vg.connect(o.detune);
      if (od.g != null && od.g !== 1) { const g = c.createGain(); g.gain.value = od.g; o.connect(g); g.connect(filt); nodes.push(g); }
      else o.connect(filt);
      o.start(t);
      srcs.push(o);
    }
    filt.connect(amp);
    let outN = amp;
    if (p.pan) { const sp = c.createStereoPanner(); sp.pan.value = p.pan; amp.connect(sp); nodes.push(sp); outN = sp; }
    outN.connect(S.b[bus]);
    const stopT = end + rel * 2.6 + 0.02;
    nodes.push(...srcs);
    this._reg(S, srcs, nodes, stopT);
    if (vg) { const o0 = srcs[0]; const prev = o0.onended; o0.onended = () => { try { S.lfo.disconnect(vg); } catch (e) { /* ignore */ } prev(); }; }
  }

  _chord(S, bus, t, dur, notes, vel, p, int = 0) {
    if (S.voices.size > 140) return;
    const c = this.ctx;
    const nodes = [], srcs = [];
    p = p || S.th.patch[bus];
    const amp = c.createGain(); nodes.push(amp);
    const mk = (pan) => {
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 0.7;
      const cut = Math.min(12000, p.cut * (1 + 0.25 * int));
      f.frequency.setValueAtTime(p.c0, t);
      f.frequency.setTargetAtTime(cut, t, p.fa);
      const sp = c.createStereoPanner(); sp.pan.value = pan;
      f.connect(sp); sp.connect(amp);
      nodes.push(f, sp);
      return f;
    };
    const fl = mk(-(p.w || 0.5)), fr = mk(p.w || 0.5);
    const a = p.a || 0.02;
    const peak = vel * p.g / Math.sqrt(notes.length);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + a);
    const sus = p.sus == null ? 1 : p.sus;
    if (sus < 1) amp.gain.setTargetAtTime(peak * sus, t + a, 0.25);
    const end = t + Math.max(dur, a + 0.02);
    const rel = p.rel || 0.2;
    amp.gain.setTargetAtTime(0, end, rel / 3);
    for (const n of notes) {
      const f0 = mtof(n);
      for (const [filt, det] of [[fl, -(p.d || 8)], [fr, p.d || 8]]) {
        const o = c.createOscillator();
        o.type = p.wave || "sawtooth"; o.frequency.value = f0; o.detune.value = det;
        o.connect(filt); o.start(t); srcs.push(o);
      }
    }
    amp.connect(S.b[bus]);
    nodes.push(...srcs);
    this._reg(S, srcs, nodes, end + rel * 2.6 + 0.02);
  }

  // FM electric piano (carrier + 1:1 modulator that decays, plus short 14x tine)
  _fm(S, bus, t, dur, f, vel, p) {
    if (S.voices.size > 150) return;
    const c = this.ctx;
    const nodes = [], srcs = [];
    const car = c.createOscillator(); car.type = "sine"; car.frequency.value = f;
    const mod = c.createOscillator(); mod.type = "sine"; mod.frequency.value = f;
    const mg = c.createGain();
    const idx = (p.idx || 1.5) * (0.6 + 0.4 * clamp(vel, 0, 1)) * (f > 700 ? 0.7 : 1);
    mg.gain.setValueAtTime(idx * f, t);
    mg.gain.setTargetAtTime(idx * f * 0.22, t + 0.003, 0.28);
    mod.connect(mg); mg.connect(car.frequency);
    nodes.push(mg);
    srcs.push(car, mod);
    if (f * 14 < 12000) {
      const tn = c.createOscillator(); tn.type = "sine"; tn.frequency.value = f * 14;
      const tg = c.createGain();
      tg.gain.setValueAtTime(f * (p.tine ? 1.4 : 0.9) * vel, t);
      tg.gain.setTargetAtTime(0, t + 0.002, 0.018);
      tn.connect(tg); tg.connect(car.frequency);
      nodes.push(tg); srcs.push(tn);
    }
    const amp = c.createGain(); nodes.push(amp);
    const peak = vel * (p.g || 0.2);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.004);
    amp.gain.setTargetAtTime(peak * 0.28, t + 0.004, p.dec || 0.7);
    const end = t + Math.max(dur, 0.05);
    amp.gain.setTargetAtTime(0, end, 0.09);
    car.connect(amp);
    let outN = amp;
    if (p.pan) { const sp = c.createStereoPanner(); sp.pan.value = p.pan; amp.connect(sp); nodes.push(sp); outN = sp; }
    outN.connect(S.b[bus]);
    for (const s of srcs) { s.start(t); nodes.push(s); }
    this._reg(S, srcs, nodes, end + 0.5);
  }

  // inharmonic FM bell (3.5:1), long exponential decay
  _bell(S, bus, t, f, vel, p) {
    if (S.voices.size > 150) return;
    const c = this.ctx;
    const nodes = [], srcs = [];
    const dec = p.dec || 0.8;
    const car = c.createOscillator(); car.type = "sine"; car.frequency.value = f;
    const mod = c.createOscillator(); mod.type = "sine"; mod.frequency.value = f * (p.ratio || 3.5);
    const mg = c.createGain();
    mg.gain.setValueAtTime(f * 1.8, t);
    mg.gain.setTargetAtTime(f * 0.1, t + 0.002, dec * 0.35);
    mod.connect(mg); mg.connect(car.frequency);
    const sh = c.createOscillator(); sh.type = "sine"; sh.frequency.value = f * 2.0;
    const shg = c.createGain(); shg.gain.value = 0.25;
    sh.connect(shg);
    const amp = c.createGain();
    const peak = vel * (p.g || 0.2);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.0015);
    amp.gain.setTargetAtTime(0, t + 0.0015, dec / 2.2);
    car.connect(amp); shg.connect(amp);
    nodes.push(mg, shg, amp);
    let outN = amp;
    if (p.pan) { const sp = c.createStereoPanner(); sp.pan.value = p.pan; amp.connect(sp); nodes.push(sp); outN = sp; }
    outN.connect(S.b[bus]);
    srcs.push(car, mod, sh);
    for (const s of srcs) { s.start(t); nodes.push(s); }
    this._reg(S, srcs, nodes, t + Math.min(2.4, dec * 3.2));
  }

  _marimba(S, bus, t, f, vel, p) {
    if (S.voices.size > 150) return;
    const c = this.ctx;
    const nodes = [], srcs = [];
    const dec = p.dec || 0.25;
    const o1 = c.createOscillator(); o1.type = "sine"; o1.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 3.97;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.4, t); g2.gain.setTargetAtTime(0, t + 0.002, 0.025);
    o2.connect(g2);
    const amp = c.createGain();
    const peak = vel * (p.g || 0.3);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.002);
    amp.gain.setTargetAtTime(0, t + 0.002, dec);
    o1.connect(amp); g2.connect(amp);
    nodes.push(g2, amp);
    let outN = amp;
    if (p.pan) { const sp = c.createStereoPanner(); sp.pan.value = p.pan; amp.connect(sp); nodes.push(sp); outN = sp; }
    outN.connect(S.b[bus]);
    srcs.push(o1, o2);
    for (const s of srcs) { s.start(t); nodes.push(s); }
    this._reg(S, srcs, nodes, t + dec * 7 + 0.05);
  }

  // Karplus-Strong plucked string, pre-rendered per pitch into an AudioBuffer (cheap at play time)
  _ksBuf(kind, f) {
    const key = kind + "|" + Math.round(f * 4);
    let r = this._ks.get(key);
    if (r) return r;
    const c = this.ctx, sr = c.sampleRate, prm = KS[kind];
    const N = Math.max(2, Math.round(sr / f - 0.5));
    const f0 = sr / (N + 0.5);
    const len = Math.floor(sr * prm.len);
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const ring = new Float32Array(N);
    let x = 4321 + N, y = 0, mean = 0;
    for (let i = 0; i < N; i++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      y += prm.bright * ((x / 2147483648 - 1) - y);
      ring[i] = y; mean += y;
    }
    mean /= N;
    for (let i = 0; i < N; i++) ring[i] -= mean;
    let idx = 0, pk = 1e-9;
    for (let i = 0; i < len; i++) {
      const k = (idx + 1) % N;
      const v = ring[idx];
      d[i] = v; if (Math.abs(v) > pk) pk = Math.abs(v);
      ring[idx] = prm.decay * 0.5 * (v + ring[k]);
      idx = k;
    }
    const fadeN = Math.floor(sr * 0.01);
    for (let i = 0; i < len; i++) d[i] = d[i] / pk * 0.9 * (i > len - fadeN ? (len - i) / fadeN : 1);
    r = { buf, f0 };
    this._ks.set(key, r);
    return r;
  }

  _pluck(S, bus, t, dur, f, vel, p) {
    if (S.voices.size > 150) return;
    const c = this.ctx;
    const { buf, f0 } = this._ksBuf(p.kind || "pluck", f);
    const src = c.createBufferSource();
    src.buffer = buf; src.playbackRate.value = f / f0;
    const amp = c.createGain();
    const peak = vel * (p.g || 0.5);
    amp.gain.setValueAtTime(peak, t);
    const end = t + Math.max(dur, 0.04);
    if (p.damp) amp.gain.setTargetAtTime(0, end, 0.025);
    src.connect(amp);
    const nodes = [amp, src];
    let outN = amp;
    if (p.pan) { const sp = c.createStereoPanner(); sp.pan.value = p.pan; amp.connect(sp); nodes.push(sp); outN = sp; }
    outN.connect(S.b[bus]);
    src.start(t);
    this._reg(S, [src], nodes, t + buf.duration / (f / f0));
  }

  // ---- drums ----------------------------------------------------------------------------------
  _noiseSrc(t, dur, idx) {
    const c = this.ctx, nb = this._noiseBuf();
    const s = c.createBufferSource();
    s.buffer = nb;
    const off = hr(Math.floor(t * 1000), idx, 5) * (nb.duration - dur - 0.05);
    s.start(t, Math.max(0, off));
    return s;
  }

  _drum(S, e, t, v) {
    const c = this.ctx, P = S.th.patch;
    const nodes = [], srcs = [];
    const gn = (val) => { const g = c.createGain(); g.gain.value = val; nodes.push(g); return g; };
    switch (e.d) {
      case "k": {
        const k = P.kick || {};
        const o = c.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(k.f0 || 160, t);
        o.frequency.setTargetAtTime(k.f1 || 48, t, 0.022);
        const g = gn(0);
        const dec = k.dec || 0.18;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v * 0.95, t + 0.002);
        g.gain.setTargetAtTime(0, t + 0.004, dec / 3);
        o.connect(g);
        const n = this._noiseSrc(t, 0.02, 1);
        const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2800; bp.Q.value = 0.8; nodes.push(bp);
        const ng = gn(0);
        ng.gain.setValueAtTime(v * 0.22, t); ng.gain.setTargetAtTime(0, t, 0.003);
        n.connect(bp); bp.connect(ng);
        const out = gn(1);
        g.connect(out); ng.connect(out); out.connect(S.b.kick);
        o.start(t);
        srcs.push(o, n); nodes.push(o, n);
        this._reg(S, srcs, nodes, t + dec * 3 + 0.05);
        // sidechain: duck pads/bass/keys on every kick
        for (const d of S.ducks) {
          const lo = 1 - (1 - d.depth) * (0.6 + 0.4 * v);
          d.p.setTargetAtTime(lo, t, 0.006);
          d.p.setTargetAtTime(1, t + 0.045, 0.09);
        }
        break;
      }
      case "s": {
        const sp = P.snare || {};
        const n = this._noiseSrc(t, 0.5, 2);
        const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = sp.nf || 2600; bp.Q.value = 0.6; nodes.push(bp);
        const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 900; nodes.push(hp);
        const ng = gn(0);
        const nd = sp.nd || 0.07;
        ng.gain.setValueAtTime(0, t);
        ng.gain.linearRampToValueAtTime(v * 0.6, t + 0.001);
        if (sp.gate) {              // gated-reverb style: hold, then chop
          ng.gain.setValueAtTime(v * 0.6, t + sp.gate - 0.01);
          ng.gain.linearRampToValueAtTime(0, t + sp.gate);
        } else ng.gain.setTargetAtTime(0, t + 0.002, nd);
        n.connect(bp); bp.connect(hp); hp.connect(ng);
        const out = gn(1);
        ng.connect(out);
        for (const [fr, gain, dd] of [[sp.tone || 190, 0.5, 0.045], [(sp.tone || 190) * 1.75, 0.3, 0.03]]) {
          const o = c.createOscillator(); o.type = "triangle";
          o.frequency.setValueAtTime(fr * 1.25, t); o.frequency.setTargetAtTime(fr, t, 0.012);
          const g = gn(0);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * gain, t + 0.001); g.gain.setTargetAtTime(0, t + 0.002, dd);
          o.connect(g); g.connect(out); o.start(t); srcs.push(o); nodes.push(o);
        }
        out.connect(S.b.snare);
        srcs.unshift(n); nodes.push(n);
        this._reg(S, srcs, nodes, t + (sp.gate || nd * 7) + 0.15);
        break;
      }
      case "c": {
        const n = this._noiseSrc(t, 0.4, 3);
        const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 1.1; nodes.push(bp);
        const g = gn(0);
        for (let i = 0; i < 3; i++) { const tt = t + i * 0.011; g.gain.setValueAtTime(v * 0.9, tt); g.gain.setTargetAtTime(0.05, tt + 0.001, 0.003); }
        g.gain.setValueAtTime(v * 0.8, t + 0.033);
        g.gain.setTargetAtTime(0, t + 0.035, 0.05);
        n.connect(bp); bp.connect(g); g.connect(S.b.snare);
        srcs.push(n); nodes.push(n);
        this._reg(S, srcs, nodes, t + 0.4);
        break;
      }
      case "h": case "o": {
        if (S.voices.size > 140) break;
        const open = e.d === "o";
        const n = this._noiseSrc(t, open ? 0.5 : 0.15, 4);
        const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6800; hp.Q.value = 0.7; nodes.push(hp);
        const pk = c.createBiquadFilter(); pk.type = "peaking"; pk.frequency.value = 10000; pk.gain.value = 5; pk.Q.value = 1; nodes.push(pk);
        const g = gn(0);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v * (open ? 0.32 : 0.3), t + 0.0008);
        g.gain.setTargetAtTime(0, t + 0.001, open ? 0.085 : 0.012);
        n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(S.b.hat);
        srcs.push(n); nodes.push(n);
        this._reg(S, srcs, nodes, t + (open ? 0.55 : 0.1));
        break;
      }
      case "t": {
        const fr = e.hz || 150;
        const o = c.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(fr * 1.6, t); o.frequency.setTargetAtTime(fr, t, 0.035);
        const g = gn(0);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.7, t + 0.002); g.gain.setTargetAtTime(0, t + 0.004, 0.09);
        o.connect(g); g.connect(S.b.perc);
        o.start(t); srcs.push(o); nodes.push(o);
        this._reg(S, srcs, nodes, t + 0.8);
        break;
      }
      case "x": {   // crash
        const n = this._noiseSrc(t, 1.8, 6);
        const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4200; nodes.push(hp);
        const g = gn(0);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.28, t + 0.002); g.gain.setTargetAtTime(0, t + 0.003, 0.5);
        n.connect(hp); hp.connect(g); g.connect(S.b.perc);
        srcs.push(n); nodes.push(n);
        this._reg(S, srcs, nodes, t + 2.2);
        break;
      }
      default: break;
    }
  }
}
