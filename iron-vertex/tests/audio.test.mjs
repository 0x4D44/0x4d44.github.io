// The ride's mixing decisions, checked without an AudioContext.
//
// rideMix() is deliberately pure so this can run under `node --test`:
// what it asserts is that the sound tracks the ride — louder with speed,
// quieter with distance, chain ticks only on the chain — rather than any
// particular timbre.
//
// There are no rider voices any more; see the note at the top of audio.js.

import test from "node:test";
import assert from "node:assert/strict";

import { FAST, RideAudio, rideMix } from "../audio.js";
import { CoasterSim, buildTrack } from "../track.js";

test("silence when nothing is moving", () => {
  const mix = rideMix({ v: 0, mode: "station", riding: false, distance: 0 });
  assert.ok(mix.rumble < 0.1, `parked train still rumbling at ${mix.rumble}`);
  assert.equal(mix.wind, 0);
  assert.equal(mix.chain, 0);
  assert.equal(mix.brake, 0);
});

test("speed drives the wheels and the wind, and never runs away", () => {
  let previousRumble = -1;
  let previousWind = -1;
  for (let v = 0; v <= 45; v += 1.5) {
    const mix = rideMix({ v, mode: "free", riding: true });
    assert.ok(mix.rumble >= previousRumble, `rumble fell as speed rose at ${v} m/s`);
    assert.ok(mix.wind >= previousWind, `wind fell as speed rose at ${v} m/s`);
    previousRumble = mix.rumble;
    previousWind = mix.wind;
    for (const [name, value] of Object.entries(mix)) {
      assert.ok(Number.isFinite(value), `${name} went non-finite at ${v} m/s`);
    }
    // Gains are summed into one bus, so each one has to stay in range.
    for (const name of ["rumble", "wind", "roar", "chain", "brake", "launch"]) {
      assert.ok(mix[name] >= 0 && mix[name] <= 1, `${name} out of range: ${mix[name]}`);
    }
    assert.ok(mix.rumbleHz > 0 && mix.rumbleHz < 22050, `rumble filter at ${mix.rumbleHz}Hz`);
    assert.ok(mix.cutoff > 0 && mix.cutoff < 22050, `distance filter at ${mix.cutoff}Hz`);
  }
});

test("distance makes the train quieter and duller", () => {
  const close = rideMix({ v: FAST, mode: "free", riding: false, distance: 10 });
  const far = rideMix({ v: FAST, mode: "free", riding: false, distance: 300 });
  assert.ok(far.rumble < close.rumble * 0.5, "a distant train is barely quieter");
  assert.ok(far.cutoff < close.cutoff, "distance did not take the top end off");

  // On board beats anything heard from the ground.
  const onboard = rideMix({ v: FAST, mode: "free", riding: true, distance: 999 });
  assert.ok(onboard.rumble > close.rumble, "riding is quieter than watching");
  assert.ok(onboard.wind > close.wind * 3, "the wind should dominate the front seat");
});

test("the chain ticks only on the chain, at a rate that reads as speed", () => {
  const lift = rideMix({ v: 5, mode: "lift", riding: true });
  assert.ok(lift.chain > 0, "no chain on the lift hill");
  assert.ok(lift.clackHz > 4 && lift.clackHz < 20, `implausible dog rate ${lift.clackHz}Hz`);
  const faster = rideMix({ v: 10, mode: "lift", riding: true });
  assert.ok(faster.clackHz > lift.clackHz, "the dogs did not speed up with the chain");
  for (const mode of ["free", "station", "brake"]) {
    assert.equal(rideMix({ v: 20, mode, riding: true }).chain, 0, `chain audible in ${mode}`);
  }
});

test("the brakes hiss only while they have speed to take", () => {
  assert.equal(rideMix({ v: 4, mode: "brake" }).brake, 0, "brakes hissing at walking pace");
  assert.ok(rideMix({ v: 20, mode: "brake" }).brake > 0.1, "brakes silent at speed");
  assert.equal(rideMix({ v: 20, mode: "free" }).brake, 0, "brakes audible off the brake run");
});

test("a magnetic launch hums, and only on the launch", () => {
  const launching = rideMix({ v: 22, mode: "launch", riding: true });
  assert.ok(launching.launch > 0.2, `no launch hum (${launching.launch})`);
  assert.ok(launching.launchHz > 200, `launch hum too low (${launching.launchHz}Hz)`);
  // It rises with speed, the way a stator bank does.
  assert.ok(rideMix({ v: 30, mode: "launch" }).launchHz > rideMix({ v: 10, mode: "launch" }).launchHz);
  for (const mode of ["free", "lift", "brake", "station"]) {
    assert.equal(rideMix({ v: 22, mode }).launch, 0, `launch hum audible in ${mode}`);
  }
  // Chain circuits never produce one at all.
  assert.equal(rideMix({ v: 5, mode: "lift" }).launch, 0);
});

// A stand-in AudioContext, so the scheduling half of RideAudio can be
// driven under node. It records nothing about SOUND — that needs a real
// browser, and browser.test.mjs renders the graph offline and measures it
// — but it does prove the voices are driven, and that a whole lap can be
// played without anything throwing.
function stubAudioContext() {
  const param = () => ({
    value: 0,
    setValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    cancelScheduledValues() { return this; },
  });
  const node = () => ({
    connect(next) { return next; },
    disconnect() {},
    start() {}, stop() {},
    type: "", buffer: null, loop: false, curve: null, oversample: "none",
    frequency: param(), Q: param(), gain: param(), detune: param(),
    playbackRate: param(), threshold: param(), knee: param(), ratio: param(),
    attack: param(), release: param(),
  });
  return class {
    constructor() {
      this.state = "running";
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.destination = node();
    }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node(); }
    createDynamicsCompressor() { return node(); }
    createWaveShaper() { return node(); }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    resume() { return Promise.resolve(); }
  };
}

test("a real lap drives the wheels, the chain and the brakes — and no voices", () => {
  const saved = globalThis.window;
  globalThis.window = { AudioContext: stubAudioContext() };
  try {
    const audio = new RideAudio();
    assert.ok(audio.start(), "the stub context was refused");
    audio.setMuted(false);
    assert.equal(typeof audio.scream, "undefined",
      "the rider voices are gone — nothing should be able to call them");

    const track = buildTrack(20260726);
    const sim = new CoasterSim(track);
    const seen = new Set();
    let loudest = 0;
    let clacks = 0;
    const inner = audio.clack.bind(audio);
    audio.clack = (level) => { clacks += 1; inner(level); };

    for (let i = 0; i < 60 * 150 && sim.laps < 2; i++) {
      const ride = sim.step(1 / 60);
      audio.ctx.currentTime += 1 / 60;
      const mix = rideMix({ v: ride.v, mode: ride.mode, riding: true });
      seen.add(ride.mode);
      loudest = Math.max(loudest, mix.rumble, mix.wind);
      assert.ok(!("excitement" in mix), "the mix still carries a scream cue");
      audio.update(mix, 1 / 60);
    }

    assert.ok(seen.has("free") && seen.has("brake"), `only saw modes ${[...seen]}`);
    assert.ok(loudest > 0.4, `the loudest the ride ever got was ${loudest.toFixed(2)}`);
    assert.ok(clacks > 20, `only ${clacks} chain dogs in two laps`);
  } finally {
    if (saved === undefined) delete globalThis.window;
    else globalThis.window = saved;
  }
});

test("RideAudio degrades to silence rather than throwing", () => {
  // No window, no AudioContext — importing and driving it under node must
  // still be safe, because that is exactly what a browser without Web
  // Audio does to the page.
  const audio = new RideAudio();
  assert.equal(audio.start(), false);
  assert.equal(audio.ready, false);
  assert.doesNotThrow(() => {
    audio.resume();
    audio.setMuted(true);
    audio.update(rideMix({ v: 20, mode: "free" }), 1 / 60);
    audio.blip();
  });
});
