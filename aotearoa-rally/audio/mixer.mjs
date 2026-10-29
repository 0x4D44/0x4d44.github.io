// Mixer: bus graph, master limiter, shared noise buffers. Works on any BaseAudioContext (live or offline).
import { makeRng } from "../core/rng.mjs";
import { volumesClean } from "./params.mjs";

const bufCache = new WeakMap();

/** Cached looping noise buffers. kinds: white, pink, brown, gravel (granular clicks), crackle (sparse). */
export function noiseBuffer(ctx, kind) {
  let m = bufCache.get(ctx);
  if (!m) { m = {}; bufCache.set(ctx, m); }
  if (m[kind]) return m[kind];
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * (kind === "white" || kind === "pink" || kind === "brown" ? 2.0 : 2.5));
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const rng = makeRng("noise-" + kind);
  if (kind === "white") for (let i = 0; i < len; i++) d[i] = rng.next() * 2 - 1;
  else if (kind === "pink") {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = rng.next() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else if (kind === "brown") {
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (rng.next() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  } else if (kind === "gravel") {
    // dense random clicks with random polarity and decaying micro-bursts
    let env = 0;
    for (let i = 0; i < len; i++) {
      if (rng.next() < 0.012) env = 0.4 + rng.next() * 0.6;
      d[i] = (rng.next() * 2 - 1) * env;
      env *= 0.92;
    }
  } else {
    let env = 0;
    for (let i = 0; i < len; i++) {
      if (rng.next() < 0.0008) env = 0.6 + rng.next() * 0.4;
      d[i] = (rng.next() * 2 - 1) * env;
      env *= 0.985;
    }
  }
  // fade the first/last few samples so the loop seam has no click
  const x = 64;
  for (let i = 0; i < x; i++) { const t = i / x; d[i] *= t; d[len - 1 - i] *= t; }
  m[kind] = buf;
  return buf;
}

export function loopNoise(ctx, kind, rateJitter = 1) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, kind);
  s.loop = true;
  s.playbackRate.value = rateJitter;
  return s;
}

export function createMixer(ctx, volumes) {
  let vols = volumesClean(volumes);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 10; comp.attack.value = 0.003; comp.release.value = 0.18;
  const masterIn = ctx.createGain();
  const master = ctx.createGain();
  // final soft clip so nothing can exceed 0.98 even on a compressor overshoot
  const clip = ctx.createWaveShaper();
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) { const x = (i / 1024) - 1; curve[i] = Math.tanh(x * 1.2) * 0.96; }
  clip.curve = curve;
  masterIn.connect(comp); comp.connect(master); master.connect(clip); clip.connect(ctx.destination);

  const mk = () => ctx.createGain();
  const engineBus = mk(), effectsBus = mk(), ambienceBus = mk(), voiceBus = mk();
  const engineLP = ctx.createBiquadFilter(); engineLP.type = "lowpass"; engineLP.frequency.value = 9500; engineLP.Q.value = 0.5;
  const effectsLP = ctx.createBiquadFilter(); effectsLP.type = "lowpass"; effectsLP.frequency.value = 9000; effectsLP.Q.value = 0.4;
  const ambienceLP = ctx.createBiquadFilter(); ambienceLP.type = "lowpass"; ambienceLP.frequency.value = 12000;
  engineBus.connect(engineLP); engineLP.connect(masterIn);
  effectsBus.connect(effectsLP); effectsLP.connect(masterIn);
  ambienceBus.connect(ambienceLP); ambienceLP.connect(masterIn);
  voiceBus.connect(masterIn);

  const mixer = {
    ctx, master, comp, engineBus, effectsBus, ambienceBus, voiceBus, engineLP, effectsLP, ambienceLP,
    get volumes() { return vols; },
    setVolumes(v) {
      vols = { ...vols, ...volumesClean({ ...vols, ...v }) };
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(0.9 * vols.master, t, 0.03);
      engineBus.gain.setTargetAtTime(vols.engine, t, 0.03);
      effectsBus.gain.setTargetAtTime(vols.effects, t, 0.03);
      ambienceBus.gain.setTargetAtTime(vols.ambience, t, 0.03);
      voiceBus.gain.setTargetAtTime(vols.voice, t, 0.03);
    },
    /** Muffle for the current camera view (cockpit = more). */
    setView(mix, tc = 0.08) {
      const t = ctx.currentTime;
      engineLP.frequency.setTargetAtTime(mix.lowpass, t, tc);
      effectsLP.frequency.setTargetAtTime(mix.tyreLow, t, tc);
      ambienceLP.frequency.setTargetAtTime(mix.cockpit > 0.5 ? 3500 : 12000, t, tc);
    },
  };
  mixer.setVolumes(vols);
  return mixer;
}

/** Helper: one-shot noise burst through a filter and gain envelope. Returns nothing (self-cleaning). */
export function burst(ctx, dest, { kind = "white", t = ctx.currentTime, dur = 0.1, attack = 0.002, gain = 0.3, type = "bandpass", freq = 1000, freq2 = null, q = 1, pan = 0, rate = 1 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, kind);
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freq2) f.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g);
  let tail = g;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
  tail.connect(dest);
  src.start(t, (t * 7.31) % 1.5);
  src.stop(t + dur + 0.05);
}

/** Helper: one-shot oscillator tone with sweep + envelope. */
export function tone(ctx, dest, { type = "sine", t = ctx.currentTime, f0 = 440, f1 = null, dur = 0.15, gain = 0.2, attack = 0.004, pan = 0 }) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  let tail = g;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
  tail.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}
