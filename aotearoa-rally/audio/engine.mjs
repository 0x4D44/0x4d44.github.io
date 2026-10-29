// Synthesised rally engine: pulse-train oscillators through a growl shaper and exhaust formants,
// intake noise, turbo whistle/spool, wastegate flutter, blow-off, anti-lag crackle, limiter, gear whine.
import { makeRng } from "../core/rng.mjs";
import { clamp } from "../core/mathx.mjs";
import { engineCharacter, engineVoice, turboVoice, gearWhine, rpmNorm, crackleLevel } from "./params.mjs";
import { loopNoise, burst, tone, sT } from "./mixer.mjs";

function pulseWave(ctx, bright = 0.9) {
  const N = 48;
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    const a = 1 / Math.pow(n, bright) * (1 + 0.55 * Math.cos(n * 1.1));
    const ph = n * 0.42;
    re[n] = a * Math.cos(ph); im[n] = a * Math.sin(ph);
  }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

export function createEngine(ctx, out) {
  const rng = makeRng("engine-synth");
  const T = () => ctx.currentTime;
  const wave = pulseWave(ctx);
  const mk = (type) => { const o = ctx.createOscillator(); if (type) o.type = type; return o; };
  const mkg = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const pan = (v) => { const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(); if (p.pan) p.pan.value = v; return p; };

  // --- core voice
  const oscA = mk(), oscB = mk(), sub = mk("sine"), h2 = mk("sawtooth");
  oscA.setPeriodicWave(wave); oscB.setPeriodicWave(wave);
  const gA = mkg(0.5), gB = mkg(0.45), gSub = mkg(0.3), gH2 = mkg(0.0);
  const pA = pan(0.25), pB = pan(-0.25);
  const mix = mkg(1);
  oscA.connect(gA); gA.connect(pA); pA.connect(mix);
  oscB.connect(gB); gB.connect(pB); pB.connect(mix);
  sub.connect(gSub); gSub.connect(mix);
  h2.connect(gH2); gH2.connect(mix);
  // burble LFO wobbles the sub / second oscillator
  const lfo = mk("sine"); lfo.frequency.value = 8.3;
  const lfoDepth = mkg(0);
  lfo.connect(lfoDepth); lfoDepth.connect(oscB.detune); lfoDepth.connect(sub.detune);

  const pre = mkg(1.5);
  const shaper = ctx.createWaveShaper();
  const sc = new Float32Array(1025);
  for (let i = 0; i < sc.length; i++) { const x = i / 512 - 1; sc[i] = Math.tanh(x * 2.2) * 0.8 + x * 0.1; }
  shaper.curve = sc; shaper.oversample = "2x";
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2000; lp.Q.value = 0.8;
  const f1 = ctx.createBiquadFilter(); f1.type = "peaking"; f1.frequency.value = 260; f1.Q.value = 1.1; f1.gain.value = 6;
  const f2 = ctx.createBiquadFilter(); f2.type = "peaking"; f2.frequency.value = 900; f2.Q.value = 1.6; f2.gain.value = 4;
  const voice = mkg(0);
  const lim = mkg(1); // limiter bounce
  mix.connect(pre); pre.connect(shaper); shaper.connect(lp); lp.connect(f1); f1.connect(f2); f2.connect(voice); voice.connect(lim); lim.connect(out);

  // --- intake / mechanical noise
  const nz = loopNoise(ctx, "pink", 1);
  const nzF = ctx.createBiquadFilter(); nzF.type = "bandpass"; nzF.frequency.value = 800; nzF.Q.value = 0.7;
  const nzG = mkg(0);
  nz.connect(nzF); nzF.connect(nzG); nzG.connect(lim);

  // --- turbo
  const wh = mk("sine"), wh2 = mk("sine");
  const whG = mkg(0), whG2 = mkg(0);
  wh.connect(whG); wh2.connect(whG2); whG.connect(lim); whG2.connect(lim);
  const wsh = loopNoise(ctx, "white", 1.1);
  const wshF = ctx.createBiquadFilter(); wshF.type = "bandpass"; wshF.frequency.value = 3800; wshF.Q.value = 1.4;
  const wshG = mkg(0);
  wsh.connect(wshF); wshF.connect(wshG); wshG.connect(lim);

  // --- transmission whine
  const wn = mk("triangle"); const wnG = mkg(0);
  const wnF = ctx.createBiquadFilter(); wnF.type = "bandpass"; wnF.Q.value = 3; wnF.frequency.value = 800;
  wn.connect(wnF); wnF.connect(wnG); wnG.connect(out);

  // --- anti-lag pops: two persistent voices (crackle noise -> bandpass -> gain) plus a thump oscillator. A pop only
  // automates their params; creating ~7 nodes per pop was the main source of 80-190 ms main-thread stalls.
  const popV = [0, 1].map(() => {
    const src = loopNoise(ctx, "crackle", 1), f = ctx.createBiquadFilter(), g = mkg(0);
    f.type = "bandpass"; f.Q.value = 0.9; f.frequency.value = 1500;
    src.connect(f); f.connect(g); g.connect(out);
    return { src, f, g };
  });
  const thump = mk("sine"), thumpG = mkg(0);
  thump.frequency.value = 90; thump.connect(thumpG); thumpG.connect(out);
  let popIdx = 0;
  for (const n of [oscA, oscB, sub, h2, lfo, wh, wh2, nz, wsh, wn, thump, popV[0].src, popV[1].src]) n.start();

  let chr = engineCharacter(null), idle = 900, redline = 7500, hasTurbo = false;
  let popAcc = 0, lastThrottle = 0, lastBoost = 0, limiterUntil = 0, lastPop = 0, dead = false, startedAt = 0;
  const out_ = { v: null };
  const tc = 0.025;

  const api = {
    setSpec(spec) {
      chr = engineCharacter(spec);
      const e = (spec && spec.engine) || {};
      idle = e.idleRpm || 900; redline = e.redline || 7500; hasTurbo = !!e.turbo;
      lfoDepth.gain.value = 18 + 70 * chr.burble;
      lfo.frequency.value = 6 + 5 * chr.burble;
      gSub.gain.value = 0.04 + 0.1 * chr.burble;
      gH2.gain.value = 0;
    },
    /** p = { rpm, throttle, boost, speed, gear, running }  */
    update(p, dt, view) {
      const t = T();
      const rpm = Number.isFinite(p.rpm) ? p.rpm : idle;
      const running = p.running !== false && rpm > 100 && !dead;
      const v = engineVoice(rpm, p.throttle, p.boost, idle, redline, chr);
      const f0 = Math.max(8, v.fundHz);
      sT(oscA.frequency, f0, t, tc);
      sT(oscB.frequency, f0 * 1.004, t, tc);
      sT(sub.frequency, f0 * 0.5, t, tc);
      sT(h2.frequency, f0 * 2, t, tc);
      sT(gH2.gain, 0.08 + 0.3 * v.load * chr.growl, t, 0.05);
      sT(gSub.gain, v.subGain, t, 0.05);
      sT(pre.gain, v.drive * 0.6, t, 0.05);
      sT(lp.frequency, v.lowpass, t, 0.05);
      sT(f1.frequency, 160 + 220 * v.rn, t, 0.08);
      sT(f2.frequency, 700 + 900 * v.rn, t, 0.08);
      sT(voice.gain, running ? v.gain * (view ? view.engine : 1) : 0, t, running ? 0.05 : 0.25);
      sT(nzF.frequency, v.noiseFreq, t, 0.08);
      sT(nzG.gain, running ? v.noiseGain * (view ? view.engine : 1) : 0, t, 0.05);
      // turbo
      const tv = turboVoice(hasTurbo ? p.boost : 0, p.throttle, v.rn, chr);
      sT(wh.frequency, tv.whistleHz, t, 0.06);
      sT(wh2.frequency, tv.whistleHz * 1.51, t, 0.06);
      sT(whG.gain, running ? tv.whistleGain : 0, t, 0.06);
      sT(whG2.gain, running ? tv.whistleGain * 0.3 : 0, t, 0.06);
      sT(wshG.gain, running ? tv.whooshGain : 0, t, 0.08);
      // gear whine
      const gw = gearWhine(p.speed, p.gear, v.load, chr);
      sT(wn.frequency, gw.hz, t, 0.05);
      sT(wnF.frequency, gw.hz * 1.1, t, 0.05);
      sT(wnG.gain, running ? gw.gain * (view ? view.whine : 1) : 0, t, 0.08);
      // limiter bounce
      if (t < limiterUntil) {
        sT(lim.gain, (Math.floor((limiterUntil - t) / 0.035) & 1) ? 0.35 : 1, t, 0.006);
      } else sT(lim.gain, 1, t, 0.02);
      // blow-off on throttle lift with boost
      if (hasTurbo && lastThrottle > 0.6 && p.throttle < 0.2 && lastBoost > 0.45) api.blowoff(lastBoost);
      // overrun pops / anti-lag crackle
      const cl = running ? crackleLevel(p.throttle, v.rn, p.boost, hasTurbo) : 0;
      if (cl > 0.12) {
        popAcc += dt * (4 + 14 * cl);
        while (popAcc >= 1 && t - lastPop > 0.045) { popAcc -= 1; lastPop = t; api.pop(cl); }
        if (popAcc > 3) popAcc = 0;
      } else popAcc = 0;
      lastThrottle = p.throttle; lastBoost = p.boost || 0;
    },
    pop(s = 0.5) {
      const t = T(), k = 0.5 + rng.next() * 0.5, dur = 0.045 + rng.next() * 0.05;
      const v = popV[popIdx++ & 1];
      v.f.frequency.cancelScheduledValues(t); v.g.gain.cancelScheduledValues(t);
      v.src.playbackRate.value = 0.7 + rng.next() * 0.8;
      v.f.frequency.setValueAtTime(700 + rng.next() * 2200, t);
      v.g.gain.setValueAtTime(0.0001, t);
      v.g.gain.linearRampToValueAtTime(0.18 * s * k, t + 0.002);
      v.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      if (k > 0.75) {
        thump.frequency.cancelScheduledValues(t); thumpG.gain.cancelScheduledValues(t);
        thump.frequency.setValueAtTime(130, t); thump.frequency.exponentialRampToValueAtTime(55, t + 0.07);
        thumpG.gain.setValueAtTime(0.0001, t); thumpG.gain.linearRampToValueAtTime(0.14 * s, t + 0.004); thumpG.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      }
    },
    blowoff(b = 0.6) {
      const t = T();
      burst(ctx, out, { kind: "white", t, dur: 0.55, attack: 0.01, gain: 0.07 * clamp(b, 0.3, 1) * chr.turboWhistle, type: "bandpass", freq: 5500, freq2: 1600, q: 0.8 });
      lastBoost = 0;
    },
    flutter(b = 0.6) {
      const t = T(), n = 7;
      for (let i = 0; i < n; i++) burst(ctx, out, { kind: "white", t: t + i * 0.03, dur: 0.022, gain: 0.05 * (1 - i / (n + 2)) * clamp(b + 0.3, 0.3, 1), type: "bandpass", freq: 3000 + rng.next() * 1500, q: 2 });
    },
    limiter() { limiterUntil = T() + 0.14; },
    shift(from, to) {
      const t = T();
      tone(ctx, out, { type: "sine", t, f0: 95, f1: 45, dur: 0.12, gain: 0.16 });
      burst(ctx, out, { kind: "white", t, dur: 0.03, gain: 0.06, type: "highpass", freq: 1500, q: 0.7 });
      if (to > from && hasTurbo) api.flutter(0.5);
    },
    fail() { dead = true; for (let i = 0; i < 4; i++) setTimeout(() => api.pop(0.6), i * 120); },
    revive() { dead = false; },
    dispose() {
      for (const n of [oscA, oscB, sub, h2, lfo, wh, wh2, nz, wsh, wn, thump, popV[0].src, popV[1].src]) { try { n.stop(); } catch { /* */ } }
      try { lim.disconnect(); wnG.disconnect(); } catch { /* */ }
    },
  };
  return api;
}
