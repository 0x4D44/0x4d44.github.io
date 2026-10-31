// Biome ambience: rain, wind, surf, stream, waterfall, steam, birds, insects, and the start-line crowd.
import { makeRng } from "../core/rng.mjs";
import { clamp, clamp01 } from "../core/mathx.mjs";
import { ambiencePlan } from "./params.mjs";
import { loopNoise, tone, burst, sT } from "./mixer.mjs";

// The start-line crowd is a murmur under the engine, not a bed over it: at full level it set the full-mix idle centroid on the line
export const CROWD_BASE = 0.05;
export const BED_IDLE = 0.02; // bed level at standstill (1 at speed)
export const bedLevel = (speed) => BED_IDLE + (1 - BED_IDLE) * clamp01(Math.abs(speed || 0) / 12);

export function createAmbience(ctx, out) {
  const rng = makeRng("ambience-synth");
  const T = () => ctx.currentTime;
  const layer = (kind, ftype, freq, q = 0.7, rate = 1) => {
    const s = loopNoise(ctx, kind, rate);
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(out); s.start(0, rng.next() * 1.5);
    return { s, f, g };
  };
  const rain = layer("white", "highpass", 1100, 0.5);
  const rainLow = layer("pink", "lowpass", 1400, 0.5);
  const windA = layer("pink", "bandpass", 380, 0.5);
  const surf = layer("pink", "lowpass", 900, 0.4);
  const stream = layer("white", "bandpass", 1500, 0.8);
  // the band-pass skirts of white noise left a hiss floor: a third of the standing-still ambience magnitude sat above 3 kHz
  // (12 % above 8 kHz), which read as a car-independent 2.5-3 kHz centroid at idle. Water stays, the air goes.
  const streamLP = ctx.createBiquadFilter(); streamLP.type = "lowpass"; streamLP.frequency.value = 3000; streamLP.Q.value = 0.6;
  stream.f.disconnect(); stream.f.connect(streamLP); streamLP.connect(stream.g);
  const roar = layer("brown", "lowpass", 320, 0.5);
  const steam = layer("white", "highpass", 3200, 0.5);
  const crowd = layer("pink", "bandpass", 520, 0.6);
  const crowd2 = layer("pink", "bandpass", 1100, 0.8, 0.93);
  // slow LFOs: wind gusts, surf swell, crowd swell
  const lfo = (freq, depth, target) => { const o = ctx.createOscillator(); o.frequency.value = freq; const g = ctx.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); o.start(); return o; };
  const lfos = [];
  const swell = ctx.createGain(); swell.gain.value = 1; // multiplies surf
  surf.g.disconnect(); surf.g.connect(swell); swell.connect(out);
  // The continuous bed (everything but crowd and birds) is cut while standing still: it is broadband and car-independent, and at idle it
  // set the full-mix centroid (about 1.3 kHz for every car). It returns with road speed (full by about 12 m/s).
  const bedG = ctx.createGain(); bedG.gain.value = BED_IDLE; bedG.connect(out);
  for (const l of [rain, rainLow, windA, stream, roar, steam]) { l.g.disconnect(); l.g.connect(bedG); }
  swell.disconnect(); swell.connect(bedG);
  lfos.push(lfo(0.11, 0.55, swell.gain));
  lfos.push(lfo(0.07, 90, windA.f.frequency));
  lfos.push(lfo(0.19, 0.05, windA.g.gain));
  // insects: a pair of AM'd high tones
  const ins = ctx.createOscillator(); ins.type = "sine"; ins.frequency.value = 4300;
  const ins2 = ctx.createOscillator(); ins2.type = "sine"; ins2.frequency.value = 5200;
  const insG = ctx.createGain(); insG.gain.value = 0;
  const insAM = ctx.createGain(); insAM.gain.value = 0.5;
  ins.connect(insAM); ins2.connect(insAM); insAM.connect(insG); insG.connect(bedG);
  const amO = ctx.createOscillator(); amO.type = "square"; amO.frequency.value = 38;
  const amD = ctx.createGain(); amD.gain.value = 0.35; amO.connect(amD); amD.connect(insAM.gain);
  ins.start(); ins2.start(); amO.start();

  let plan = ambiencePlan(null), birdT = 2, crowdLevel = 0, cheerT = 4;
  const target = { rain: 0, wind: 0, birds: 0, insects: 0, surf: 0, stream: 0, roar: 0, steam: 0 };

  // bird voices: three persistent oscillators (osc -> gain -> panner). A chirp only schedules params on them; creating
  // 3 nodes per note from the frame path caused main-thread stalls.
  const birdV = [0, 1, 2].map(() => {
    const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = 3000;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g);
    let pn = null;
    if (ctx.createStereoPanner) { pn = ctx.createStereoPanner(); g.connect(pn); pn.connect(out); } else g.connect(out);
    o.start();
    return { o, g, pn, free: 0 };
  });
  let birdI = 0;
  // a chirp is queued as notes and scheduled at most 2 per update() so one call never makes ~45 AudioParam writes at once
  const birdQ = [];
  function chirp(base, n, spacing, gain, pan) {
    const t0 = T();
    for (let i = 0; i < n; i++) birdQ.push({ f: base * (1 + 0.15 * rng.range(-1, 1)), dur: 0.05 + rng.next() * 0.07, t: t0 + i * spacing, gain, pan });
  }
  function flushChirps(max) {
    for (let k = 0; k < max && birdQ.length; k++) {
      const { f, dur, gain, pan, t: tn } = birdQ.shift();
      const t = Math.max(tn, T() + 0.01);
      const v = birdV[birdI++ % 3];
      if (t < v.free) continue; // voice still busy: drop the note rather than creating another node
      v.free = t + dur + 0.02;
      v.o.frequency.setValueAtTime(f, t);
      v.o.frequency.exponentialRampToValueAtTime(Math.max(20, f * rng.range(1.15, 1.7)), t + dur);
      if (v.pn) v.pn.pan.setValueAtTime(pan || 0, t);
      v.g.gain.setValueAtTime(0.0001, t);
      v.g.gain.linearRampToValueAtTime(gain, t + 0.006);
      v.g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
  }

  return {
    get plan() { return plan; },
    setStage(def) {
      plan = ambiencePlan(def);
      const t = T();
      sT(rain.g.gain, plan.rain * 0.16, t, 0.5);
      sT(rainLow.g.gain, plan.rain * 0.12, t, 0.5);
      sT(windA.g.gain, plan.wind * 0.14, t, 0.5);
      sT(surf.g.gain, plan.surf * 0.16, t, 0.5);
      sT(stream.g.gain, plan.stream * 0.07, t, 0.5);
      sT(roar.g.gain, plan.roar * 0.3, t, 0.5);
      sT(steam.g.gain, plan.steam * 0.03, t, 0.5);
      sT(insG.gain, plan.insects * 0.012, t, 0.5);
    },
    update(dt, p, view, stage) {
      const t = T();
      flushChirps(3);
      sT(bedG.gain, bedLevel(p.speed), t, 0.4);
      // rain louder in cockpit-ish low-passed form handled by the bus; add roof drum there
      sT(rainLow.g.gain, plan.rain * (0.1 + 0.2 * (view ? view.cockpit : 0)), t, 0.3);
      // birds
      birdT -= dt;
      if (plan.birds > 0.02 && birdT <= 0 && Math.abs(p.speed || 0) < 55) {
        const fast = clamp01(Math.abs(p.speed || 0) / 40);
        birdT = rng.range(1.2, 4.5) / (0.4 + plan.birds) * (1 + fast);
        const kind = rng.int(0, 2);
        const g = 0.018 * plan.birds * (1 - fast * 0.7);
        const pan = rng.range(-0.9, 0.9);
        if (kind === 0) chirp(2600 + rng.next() * 1800, rng.int(2, 5), 0.11, g, pan);
        else if (kind === 1) chirp(1500 + rng.next() * 900, 3, 0.2, g * 1.2, pan);
        else chirp(3400, rng.int(5, 9), 0.06, g * 0.8, pan);
      }
      // crowd at the start / finish lines
      const s = p.s || 0, L = stage && stage.lengthM ? stage.lengthM : 1e9;
      const near = Math.max(1 - s / 90, 1 - Math.abs(L - s) / 90, 0);
      crowdLevel = clamp01(near);
      sT(crowd.g.gain, crowdLevel * 0.06 * CROWD_BASE, t, 0.4);
      sT(crowd2.g.gain, crowdLevel * 0.035 * CROWD_BASE, t, 0.4);
      cheerT -= dt;
      if (crowdLevel > 0.3 && cheerT <= 0) {
        cheerT = rng.range(2.5, 6);
        burst(ctx, out, { kind: "pink", dur: 0.9, attack: 0.25, gain: 0.07 * crowdLevel, type: "bandpass", freq: 700, freq2: 1200, q: 0.8, pan: rng.range(-0.6, 0.6) });
      }
    },
    dispose() {
      for (const l of [rain, rainLow, windA, surf, stream, roar, steam, crowd, crowd2]) { try { l.s.stop(); } catch { /* */ } }
      for (const o of [...lfos, ins, ins2, amO, ...birdV.map((b) => b.o)]) { try { o.stop(); } catch { /* */ } }
    },
  };
}
