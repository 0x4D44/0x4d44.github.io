// Tyre / surface noise (roll + slide per surface category), tarmac squeal, wind, stone pings.
import { makeRng } from "../core/rng.mjs";
import { clamp } from "../core/mathx.mjs";
import { SURFACE_INFO } from "../core/surfaces.mjs";
import { NOISE_CATS, tyreMix, windVoice } from "./params.mjs";
import { loopNoise, tone, burst } from "./mixer.mjs";

// roll / slide chain per category: [noiseKind, filterType, freq, Q, gainScale]
const CFG = {
  tarmac: { roll: ["pink", "bandpass", 1100, 0.6, 0.20], slide: ["white", "bandpass", 1500, 0.9, 0.22] },
  gravel: { roll: ["gravel", "lowpass", 4200, 0.6, 0.34], slide: ["gravel", "bandpass", 1800, 0.5, 0.5] },
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

  return {
    mix: mixOut,
    update(p, dt, view) {
      const t = T();
      const m = tyreMix(p.wheels, p.speed, infoOf, mixOut);
      const vs = view ? view.tyre : 1;
      for (const k of NOISE_CATS) {
        const c = chains[k];
        c.roll.g.gain.setTargetAtTime(m.roll[k] * c.roll.scale * vs, t, 0.05);
        c.slide.g.gain.setTargetAtTime(m.slide[k] * c.slide.scale * vs * 1.3, t, 0.04);
        // pitch up with speed
        c.roll.f.frequency.setTargetAtTime(c.roll.base * (0.7 + 0.8 * clamp(Math.abs(p.speed) / 40, 0, 1)), t, 0.1);
      }
      sqG.gain.setTargetAtTime(m.squeal * 0.07 * vs, t, 0.04);
      const sf = 780 + 650 * clamp(m.skidMax, 0, 1) + 3 * Math.abs(p.speed);
      sq1.frequency.setTargetAtTime(sf, t, 0.05); sq2.frequency.setTargetAtTime(sf * 1.49, t, 0.05); sqF.frequency.setTargetAtTime(sf * 1.3, t, 0.05);
      const w = windVoice(p.speed, view);
      windG.gain.setTargetAtTime(w.gain * 0.8, t, 0.1);
      windF.frequency.setTargetAtTime(w.freq, t, 0.1);
      // stone pings on loose surfaces when sliding quickly
      const loose = m.slide.gravel + m.slide.dirt + m.slide.snow * 0.2;
      if (loose > 0.08 && Math.abs(p.speed) > 8) {
        pingAcc += dt * (1 + 9 * loose);
        if (pingAcc > 1) { pingAcc = 0; api.ping(0.4 + 0.6 * loose); }
      }
    },
    ping(s = 0.5) {
      const t = T();
      tone(ctx, out, { type: "sine", t, f0: 2200 + rng.next() * 3200, f1: null, dur: 0.05 + rng.next() * 0.07, gain: 0.05 * s, pan: rng.next() * 1.6 - 0.8 });
    },
    splash(s = 0.6) {
      burst(ctx, out, { kind: "white", dur: 0.5 + s * 0.4, attack: 0.02, gain: 0.35 * s, type: "bandpass", freq: 900, freq2: 3500, q: 0.5 });
    },
    dispose() {
      for (const k of NOISE_CATS) { try { chains[k].roll.src.stop(); chains[k].slide.src.stop(); } catch { /* */ } }
      try { sq1.stop(); sq2.stop(); wind.stop(); } catch { /* */ }
    },
  };
}
