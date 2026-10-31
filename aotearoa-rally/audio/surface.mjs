// Tyre / surface noise (roll + slide per surface category), tarmac squeal, wind, stone pings.
import { makeRng } from "../core/rng.mjs";
import { clamp } from "../core/mathx.mjs";
import { SURFACE_INFO } from "../core/surfaces.mjs";
import { NOISE_CATS, tyreMix, windVoice } from "./params.mjs";
import { loopNoise, tone, burst, sT } from "./mixer.mjs";

// roll / slide chain per category: [noiseKind, filterType, freq, Q, gainScale]
const CFG = {
  tarmac: { roll: ["pink", "bandpass", 2400, 0.8, 0.1], slide: ["white", "bandpass", 2600, 1.1, 0.2] }, // smooth, narrow, high hiss
  gravel: { roll: ["gravel", "lowpass", 2600, 0.6, 0.5], slide: ["gravel", "bandpass", 1500, 0.5, 0.62] }, // pebble crackle, dark, plus a low rumble (below)
  dirt: { roll: ["brown", "lowpass", 1600, 0.6, 0.45], slide: ["gravel", "lowpass", 2600, 0.6, 0.36] },
  mud: { roll: ["brown", "lowpass", 700, 0.8, 0.5], slide: ["pink", "bandpass", 420, 2.2, 0.6] },
  snow: { roll: ["pink", "lowpass", 1700, 0.5, 0.16], slide: ["white", "highpass", 2800, 0.5, 0.18] },
  water: { roll: ["white", "bandpass", 1900, 0.5, 0.36], slide: ["white", "bandpass", 3300, 0.6, 0.5] },
  grass: { roll: ["brown", "lowpass", 520, 0.7, 0.45], slide: ["pink", "lowpass", 1100, 0.6, 0.28] },
  sand: { roll: ["pink", "bandpass", 900, 0.5, 0.26], slide: ["pink", "bandpass", 2100, 0.5, 0.32] },
};

export function createSurface(ctx, out) {
  const rng = makeRng("surface-synth");
  const chains = {};
  const T = () => ctx.currentTime;
  const mkChain = (cfg) => {
    const src = loopNoise(ctx, cfg[0], 0.9 + rng.next() * 0.2);
    const f = ctx.createBiquadFilter(); f.type = cfg[1]; f.frequency.value = cfg[2]; f.Q.value = cfg[3];
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(out);
    src.start(0, rng.next() * 1.5);
    return { src, f, g, scale: cfg[4], base: cfg[2] };
  };
  for (const k of NOISE_CATS) chains[k] = { roll: mkChain(CFG[k].roll), slide: mkChain(CFG[k].slide) };

  // low rumble under loose surfaces: brown noise, low-passed, follows the loose-surface roll level
  const rum = loopNoise(ctx, "brown", 1.2);
  const rumF = ctx.createBiquadFilter(); rumF.type = "lowpass"; rumF.frequency.value = 220; rumF.Q.value = 0.7;
  const rumG = ctx.createGain(); rumG.gain.value = 0;
  rum.connect(rumF); rumF.connect(rumG); rumG.connect(out); rum.start(0, 0.7);

  // tarmac squeal
  const sq1 = ctx.createOscillator(); sq1.type = "triangle"; sq1.frequency.value = 900;
  const sq2 = ctx.createOscillator(); sq2.type = "sawtooth"; sq2.frequency.value = 1350;
  const sqF = ctx.createBiquadFilter(); sqF.type = "bandpass"; sqF.frequency.value = 1300; sqF.Q.value = 2.2;
  const sqG = ctx.createGain(); sqG.gain.value = 0;
  sq1.connect(sqF); sq2.connect(sqF); sqF.connect(sqG); sqG.connect(out);
  sq1.start(); sq2.start();

  // wind
  const wind = loopNoise(ctx, "pink", 1);
  const windF = ctx.createBiquadFilter(); windF.type = "bandpass"; windF.frequency.value = 500; windF.Q.value = 0.6;
  const windG = ctx.createGain(); windG.gain.value = 0;
  wind.connect(windF); windF.connect(windG); windG.connect(out); wind.start(0, 0.3);

  const mixOut = { roll: {}, slide: {}, squeal: 0, skidMax: 0 };
  for (const k of NOISE_CATS) { mixOut.roll[k] = 0; mixOut.slide[k] = 0; }
  const infoOf = (id) => (SURFACE_INFO[id] ? SURFACE_INFO[id].noise : "gravel");
  let pingAcc = 0;
  // stone pings: three persistent voices (sine -> gain -> panner); a ping only automates their params
  const pingV = [0, 1, 2].map(() => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = 3000;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g);
    let pn = null;
    if (ctx.createStereoPanner) { pn = ctx.createStereoPanner(); g.connect(pn); pn.connect(out); } else g.connect(out);
    o.start();
    return { o, g, pn, free: 0 };
  });
  let pingI = 0;

  const api = {
    mix: mixOut,
    update(p, dt, view) {
      const t = T();
      const m = tyreMix(p.wheels, p.speed, infoOf, mixOut);
      const vs = view ? view.tyre : 1;
      for (const k of NOISE_CATS) {
        const c = chains[k];
        sT(c.roll.g.gain, m.roll[k] * c.roll.scale * vs, t, 0.05);
        sT(c.slide.g.gain, m.slide[k] * c.slide.scale * vs * 1.3, t, 0.04);
        // pitch up with speed
        sT(c.roll.f.frequency, c.roll.base * (0.7 + 0.8 * clamp(Math.abs(p.speed) / 40, 0, 1)), t, 0.1);
      }
      sT(rumG.gain, (m.roll.gravel + m.roll.dirt + 0.6 * m.roll.mud + 0.3 * m.roll.grass) * 0.9 * vs, t, 0.08);
      sT(sqG.gain, m.squeal * 0.07 * vs, t, 0.04);
      const sf = 780 + 650 * clamp(m.skidMax, 0, 1) + 3 * Math.abs(p.speed);
      sT(sq1.frequency, sf, t, 0.05); sT(sq2.frequency, sf * 1.49, t, 0.05); sT(sqF.frequency, sf * 1.3, t, 0.05);
      const w = windVoice(p.speed, view);
      sT(windG.gain, w.gain * 0.8, t, 0.1);
      sT(windF.frequency, w.freq, t, 0.1);
      // stone pings on loose surfaces when sliding quickly
      const loose = m.slide.gravel + m.slide.dirt + m.slide.snow * 0.2;
      if (loose > 0.08 && Math.abs(p.speed) > 8) {
        pingAcc += dt * (1 + 9 * loose);
        if (pingAcc > 1) { pingAcc = 0; api.ping(0.4 + 0.6 * loose); }
      }
    },
    ping(s = 0.5) {
      const t = T() + 0.005, dur = 0.05 + rng.next() * 0.07, f0 = 2200 + rng.next() * 3200, pan = rng.next() * 1.6 - 0.8;
      const v = pingV[pingI++ % 3];
      if (t < v.free) return;
      v.free = t + dur + 0.02;
      v.o.frequency.setValueAtTime(f0, t);
      if (v.pn) v.pn.pan.setValueAtTime(pan, t);
      v.g.gain.setValueAtTime(0.0001, t);
      v.g.gain.linearRampToValueAtTime(0.05 * s, t + 0.004);
      v.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    splash(s = 0.6) {
      burst(ctx, out, { kind: "white", dur: 0.5 + s * 0.4, attack: 0.02, gain: 0.35 * s, type: "bandpass", freq: 900, freq2: 3500, q: 0.5 });
    },
    dispose() {
      for (const k of NOISE_CATS) { try { chains[k].roll.src.stop(); chains[k].slide.src.stop(); } catch { /* */ } }
      try { sq1.stop(); sq2.stop(); wind.stop(); rum.stop(); for (const v of pingV) v.o.stop(); } catch { /* */ }
    },
  };
  return api;
}
