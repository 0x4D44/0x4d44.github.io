// ============================================================
// Iron Vertex — ride audio.
//
// Every sound here is synthesised in the browser: filtered noise for the
// wheels and the wind, a scheduled tick for the chain dogs, a small
// chorus of detuned oscillators for the riders. Nothing is fetched, so
// the document stays a single self-contained directory and works offline.
//
// The MIXING DECISIONS are a pure function of the ride state and live in
// rideMix() at the top of this file, with no reference to Web Audio at
// all — that is the part worth testing, and `node --test` can run it.
// RideAudio below is the thin layer that pushes those numbers at an
// AudioContext.
// ============================================================

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Reference speed for "flat out": roughly the fastest a gravity circuit
// here ever runs, so the loudness curves have somewhere to land.
export const FAST = 30; // m/s

// How the ride sounds, given what it is doing.
//
//   v         speed, m/s
//   gForce    felt vertical g in the car's own frame
//   mode      "station" | "lift" | "brake" | "free"
//   riding    true when the camera is on the train
//   distance  metres from the listener to the train (ignored when riding)
//
// Every field of the result is a gain in [0, 1] or a frequency in Hz.
export function rideMix({
  v = 0, gForce = 1, mode = "free", riding = false, distance = 0,
  pitch = 0, inverted = false,
} = {}) {
  const speed = clamp01(Math.abs(v) / FAST);

  // Out in the park the train is a distant clatter that gets duller as
  // well as quieter — air swallows the top end long before the bottom.
  const near = riding ? 1 : 1 / (1 + Math.pow(Math.max(0, distance) / 55, 1.6));
  const air = riding ? 1 : 0.35 + 0.65 * near;

  // Wheels on steel: broad noise whose centre climbs with speed.
  const rumble = (0.06 + 0.62 * Math.pow(speed, 1.25)) * near;
  const rumbleHz = 130 + 900 * speed;
  // The body of the train under the rider, felt more than heard.
  const roar = (0.05 + 0.34 * Math.pow(speed, 1.6)) * near;
  const roarHz = 42 + 58 * speed;
  // Wind is the on-ride sound above all others, and barely audible from
  // the ground, so it leans hard on `riding` rather than on distance.
  const wind = (riding ? 0.62 : 0.10) * Math.pow(speed, 2.1);
  const windHz = 700 + 2600 * speed;

  // The chain dogs tick past at a fixed spacing, so the rate is a
  // straight readout of speed — it slows audibly as the lift bites.
  const chain = mode === "lift" ? 0.55 * (0.45 + 0.55 * near) : 0;
  const clackHz = mode === "lift" ? Math.max(1, Math.abs(v) / 0.62) : 0;

  // Fin brakes: a hard hiss that only exists while there is speed to take.
  const brake = mode === "brake" && Math.abs(v) > 4.5 ? 0.4 * clamp01((Math.abs(v) - 4.5) / 12) * near : 0;

  // A magnetic launch: the rising hum of the stators as the train goes.
  const launch = mode === "launch" ? 0.5 * (0.35 + 0.65 * speed) * (riding ? 1 : near) : 0;
  const launchHz = 60 + 420 * speed;

  // Riders shout at four things, and the loudest is the one where the
  // floor drops away underneath them.
  //
  //   airtime    negative g, the restraints going light
  //   heavy      being pressed into the seat at the bottom
  //   plunge     the nose-down moment at the top of a drop, at speed —
  //              which is the classic scream and does not need any g at
  //              all to earn it
  //   inverted   upside down, which nobody takes quietly
  const airtime = clamp01((0.62 - gForce) / 1.4);
  const heavy = clamp01((gForce - 2.9) / 2.0);
  const plunge = clamp01((-pitch - 0.28) / 0.5) * clamp01((Math.abs(v) - 9) / 12);
  const upside = inverted ? 0.8 : 0;
  const carries = riding ? 1 : 0.45 + 0.55 * near;
  const excitement = (mode === "free"
    ? clamp01(Math.max(airtime, heavy * 0.75, plunge, upside) * (0.35 + speed))
    : mode === "launch" ? clamp01(speed * 0.9) : 0) * carries;

  return {
    rumble, rumbleHz, roar, roarHz, wind, windHz,
    chain, clackHz, brake, launch, launchHz, excitement,
    // One lowpass across the whole train sound stands in for distance.
    cutoff: 700 + 15000 * Math.pow(air, 2.2),
    speed,
  };
}

// A short crowd reaction should not retrigger every frame it qualifies,
// nor wait so long that a whole airtime hill passes in silence.
export const SCREAM_COOLDOWN = 1.7; // seconds

export class RideAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.ready = false;
    this.failed = false;
    this.clackPhase = 0;
    this.screamWait = 0;
    this.ambientWait = 3;
  }

  // Browsers will not start an AudioContext outside a user gesture, so
  // this is called from the first click or keypress rather than at boot.
  // Anything that goes wrong here just means a silent ride: audio is a
  // garnish, and a page that throws over it would be a worse page.
  start() {
    if (this.ready || this.failed) return this.ready;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { this.failed = true; return false; }
      const ctx = new Ctx();
      this.ctx = ctx;
      const now = ctx.currentTime;

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.62;
      // A limiter keeps a loop entry from clipping when every voice
      // happens to peak together. Gentle: at ratio 8 it flattened the
      // riders into the wheel noise instead of merely catching peaks.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -4;
      limiter.knee.value = 6;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.16;
      this.master.connect(limiter).connect(ctx.destination);

      // Everything mechanical goes through one bus so the riders can duck
      // it. Without that the wheels and the wind simply sit on top of the
      // voices — measured at 25dB over them — and nobody hears a thing.
      this.trainBus = ctx.createGain();
      this.trainBus.gain.value = 1;
      this.trainBus.connect(this.master);

      // One long noise buffer feeds every noise voice. Generating it once
      // costs a few milliseconds and saves an oscillator per sound.
      const seconds = 3;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        // A touch of brown noise under the white gives the wheels weight.
        brown = (brown + white * 0.02) / 1.02;
        data[i] = white * 0.55 + brown * 3.2;
      }
      this.noiseBuffer = buffer;

      // ---- the train, through one distance filter ----
      this.trainOut = ctx.createBiquadFilter();
      this.trainOut.type = "lowpass";
      this.trainOut.frequency.value = 16000;
      this.trainOut.connect(this.trainBus);

      this.rumbleGain = this._noiseVoice("bandpass", 320, 0.7, this.trainOut);
      this.windGain = this._noiseVoice("highpass", 900, 0.6, this.trainBus);
      this.brakeGain = this._noiseVoice("bandpass", 3200, 2.4, this.trainOut);

      this.roarOsc = ctx.createOscillator();
      this.roarOsc.type = "sawtooth";
      this.roarOsc.frequency.value = 48;
      this.roarGain = ctx.createGain();
      this.roarGain.gain.value = 0;
      const roarFilter = ctx.createBiquadFilter();
      roarFilter.type = "lowpass";
      roarFilter.frequency.value = 240;
      this.roarOsc.connect(roarFilter).connect(this.roarGain).connect(this.trainOut);
      this.roarOsc.start(now);

      // The launch: a square wave climbing through the stators, which is
      // very nearly what an LSM actually sounds like from the platform.
      this.launchOsc = ctx.createOscillator();
      this.launchOsc.type = "square";
      this.launchOsc.frequency.value = 60;
      this.launchGain = ctx.createGain();
      this.launchGain.gain.value = 0;
      const launchFilter = ctx.createBiquadFilter();
      launchFilter.type = "bandpass";
      launchFilter.frequency.value = 900;
      launchFilter.Q.value = 1.1;
      this.launchOsc.connect(launchFilter).connect(this.launchGain).connect(this.trainOut);
      this.launchOsc.start(now);

      // ---- the park itself: a breeze that never stops ----
      this.breezeGain = this._noiseVoice("bandpass", 480, 0.5, this.master);
      this.breezeGain.gain.value = 0.05;
      const breezeLfo = ctx.createOscillator();
      breezeLfo.frequency.value = 0.07;
      const breezeDepth = ctx.createGain();
      breezeDepth.gain.value = 0.035;
      breezeLfo.connect(breezeDepth).connect(this.breezeGain.gain);
      breezeLfo.start(now);

      this.ready = true;
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  _noiseVoice(filterType, frequency, q, destination) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(destination);
    source.start(ctx.currentTime);
    gain.filter = filter;
    return gain;
  }

  resume() {
    if (!this.start()) return;
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.62, now, 0.05);
  }

  // Smoothed parameter writes: stepping a gain instantly puts a click in
  // the output, and at 60fps that would be a buzz.
  _to(param, value, tau = 0.08) {
    param.setTargetAtTime(value, this.ctx.currentTime, tau);
  }

  update(mix, dt) {
    if (!this.ready || this.muted || this.ctx.state !== "running") return;
    this._to(this.rumbleGain.gain, mix.rumble);
    this._to(this.rumbleGain.filter.frequency, mix.rumbleHz, 0.12);
    this._to(this.windGain.gain, mix.wind);
    this._to(this.windGain.filter.frequency, mix.windHz, 0.12);
    this._to(this.roarGain.gain, mix.roar);
    this._to(this.roarOsc.frequency, mix.roarHz, 0.12);
    this._to(this.brakeGain.gain, mix.brake, 0.05);
    this._to(this.launchGain.gain, mix.launch ?? 0, 0.05);
    this._to(this.launchOsc.frequency, mix.launchHz ?? 60, 0.06);
    this._to(this.trainOut.frequency, mix.cutoff, 0.2);

    // Chain dogs, one tick at a time.
    if (mix.clackHz > 0 && mix.chain > 0) {
      this.clackPhase += mix.clackHz * dt;
      let guard = 0;
      while (this.clackPhase >= 1 && guard++ < 6) {
        this.clackPhase -= 1;
        this.clack(mix.chain);
      }
    } else {
      this.clackPhase = 0;
    }

    // Screaming. The cooldown scales down with how big the moment is, so
    // a proper drop gets a continuous wall of noise rather than one
    // polite shout every couple of seconds.
    this.screamWait = Math.max(0, this.screamWait - dt);
    if (mix.excitement > 0.3 && this.screamWait === 0) {
      this.scream(mix.excitement);
      this.screamWait = SCREAM_COOLDOWN * (1.05 - 0.75 * Math.min(1, mix.excitement));
    }

    // Somewhere out in the park, a bird.
    this.ambientWait -= dt;
    if (this.ambientWait <= 0) {
      this.ambientWait = 5 + Math.random() * 11;
      this.chirp();
    }
  }

  clack(level) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1500 + Math.random() * 700;
    filter.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.02, level * 0.5), now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random() * 2);
    source.stop(now + 0.12);
  }

  // A handful of detuned voices reads as several people rather than one
  // synthesiser, which is the whole trick.
  //
  // Two things had to be right before any of it could be HEARD. The
  // shaping filter was a bandpass at 900-1600Hz, which is above where
  // these voices actually sing — it removed the fundamentals and left a
  // thin whistle. And the wheels and the wind are simply louder than
  // people, so the mechanical bus ducks under a scream the way a mixing
  // desk would do it.
  scream(intensity) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const level = Math.min(0.85, 0.35 + intensity * 0.5);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(level, now + 0.14);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);

    // Keep the fundamentals, lift the presence region where a shout
    // lives, and drop the rumble the noise layer would otherwise add.
    const shape = ctx.createBiquadFilter();
    shape.type = "peaking";
    shape.frequency.value = 1100 + intensity * 600;
    shape.Q.value = 0.9;
    shape.gain.value = 6;
    const cut = ctx.createBiquadFilter();
    cut.type = "highpass";
    cut.frequency.value = 190;
    bus.connect(shape).connect(cut).connect(this.master);

    // Get out of their way.
    const duck = this.trainBus.gain;
    duck.cancelScheduledValues(now);
    duck.setTargetAtTime(0.4, now, 0.05);
    duck.setTargetAtTime(1, now + 0.85, 0.35);

    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? "sawtooth" : "triangle";
      const base = 300 + Math.random() * 340;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.linearRampToValueAtTime(base * (1.25 + intensity * 0.3), now + 0.3);
      osc.frequency.linearRampToValueAtTime(base * 0.85, now + 1.2);
      const vib = ctx.createOscillator();
      vib.frequency.value = 5 + Math.random() * 4;
      const vibDepth = ctx.createGain();
      vibDepth.gain.value = 12 + Math.random() * 14;
      vib.connect(vibDepth).connect(osc.frequency);
      const voice = ctx.createGain();
      voice.gain.value = 0.3;
      osc.connect(voice).connect(bus);
      osc.start(now + i * 0.03);
      vib.start(now);
      osc.stop(now + 1.4);
      vib.stop(now + 1.4);
    }
    // Breath on top of the voices.
    const air = ctx.createBufferSource();
    air.buffer = this.noiseBuffer;
    air.loop = true;
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, now);
    airGain.gain.exponentialRampToValueAtTime(level * 0.35, now + 0.2);
    airGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    air.connect(airGain).connect(shape);
    air.start(now, Math.random() * 2);
    air.stop(now + 1.3);
  }

  chirp() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      const at = now + i * (0.07 + Math.random() * 0.06);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const base = 2200 + Math.random() * 1800;
      osc.frequency.setValueAtTime(base, at);
      osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), at + 0.05);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.035, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      osc.connect(gain).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.12);
    }
  }

  // A soft confirmation for the on-screen controls.
  blip(up = true) {
    if (!this.ready || this.muted || this.ctx.state !== "running") return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(up ? 520 : 400, now);
    osc.frequency.exponentialRampToValueAtTime(up ? 780 : 300, now + 0.07);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}
