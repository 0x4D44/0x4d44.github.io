// The ride's mixing decisions, checked without an AudioContext.
//
// rideMix() is deliberately pure so this can run under `node --test`:
// what it asserts is that the sound tracks the ride — louder with speed,
// quieter with distance, chain ticks only on the chain — rather than any
// particular timbre.

import test from "node:test";
import assert from "node:assert/strict";

import { FAST, RideAudio, rideMix } from "../audio.js";

test("silence when nothing is moving", () => {
  const mix = rideMix({ v: 0, gForce: 1, mode: "station", riding: false, distance: 0 });
  assert.ok(mix.rumble < 0.1, `parked train still rumbling at ${mix.rumble}`);
  assert.equal(mix.wind, 0);
  assert.equal(mix.chain, 0);
  assert.equal(mix.brake, 0);
  assert.equal(mix.excitement, 0);
});

test("speed drives the wheels and the wind, and never runs away", () => {
  let previousRumble = -1;
  let previousWind = -1;
  for (let v = 0; v <= 45; v += 1.5) {
    const mix = rideMix({ v, gForce: 1, mode: "free", riding: true });
    assert.ok(mix.rumble >= previousRumble, `rumble fell as speed rose at ${v} m/s`);
    assert.ok(mix.wind >= previousWind, `wind fell as speed rose at ${v} m/s`);
    previousRumble = mix.rumble;
    previousWind = mix.wind;
    for (const [name, value] of Object.entries(mix)) {
      assert.ok(Number.isFinite(value), `${name} went non-finite at ${v} m/s`);
    }
    // Gains are summed into one bus, so each one has to stay in range.
    for (const name of ["rumble", "wind", "roar", "chain", "brake", "excitement"]) {
      assert.ok(mix[name] >= 0 && mix[name] <= 1, `${name} out of range: ${mix[name]}`);
    }
    assert.ok(mix.rumbleHz > 0 && mix.rumbleHz < 22050, `rumble filter at ${mix.rumbleHz}Hz`);
    assert.ok(mix.cutoff > 0 && mix.cutoff < 22050, `distance filter at ${mix.cutoff}Hz`);
  }
});

test("distance makes the train quieter and duller", () => {
  const close = rideMix({ v: FAST, gForce: 1, mode: "free", riding: false, distance: 10 });
  const far = rideMix({ v: FAST, gForce: 1, mode: "free", riding: false, distance: 300 });
  assert.ok(far.rumble < close.rumble * 0.5, "a distant train is barely quieter");
  assert.ok(far.cutoff < close.cutoff, "distance did not take the top end off");

  // On board beats anything heard from the ground.
  const onboard = rideMix({ v: FAST, gForce: 1, mode: "free", riding: true, distance: 999 });
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

test("riders react to airtime and to being pressed into the seat", () => {
  const cruise = rideMix({ v: 22, gForce: 1.0, mode: "free", riding: true });
  const airtime = rideMix({ v: 22, gForce: -0.4, mode: "free", riding: true });
  const heavy = rideMix({ v: 22, gForce: 4.4, mode: "free", riding: true });
  assert.ok(cruise.excitement < 0.05, `a steady 1g got a reaction (${cruise.excitement})`);
  assert.ok(airtime.excitement > 0.3, `no reaction to ${-0.4}g (${airtime.excitement})`);
  assert.ok(heavy.excitement > 0.2, `no reaction to 4.4g (${heavy.excitement})`);
  // Nobody shouts while the train is being winched up a hill.
  assert.equal(rideMix({ v: 5, gForce: -0.4, mode: "lift" }).excitement, 0);
});

test("riders also shout at the drop itself, and at being upside down", () => {
  // A nose-down plunge at speed earns a scream on its own: the car is at
  // a perfectly ordinary 1g on the way down a steep drop, and that is the
  // single most screamed-at moment on any coaster.
  const level = rideMix({ v: 26, gForce: 1.0, mode: "free", riding: true, pitch: 0 });
  const plunging = rideMix({ v: 26, gForce: 1.0, mode: "free", riding: true, pitch: -0.75 });
  assert.ok(level.excitement < 0.05, `level track got a reaction (${level.excitement})`);
  assert.ok(plunging.excitement > 0.3, `no reaction to a 50-degree plunge (${plunging.excitement})`);
  // But not at a crawl: the same gradient on the way out of the station
  // is not a scream.
  assert.ok(rideMix({ v: 5, gForce: 1, mode: "free", pitch: -0.75 }).excitement < 0.05);

  const upright = rideMix({ v: 20, gForce: 2.0, mode: "free", riding: true });
  const upsideDown = rideMix({ v: 20, gForce: 2.0, mode: "free", riding: true, inverted: true });
  assert.ok(upsideDown.excitement > upright.excitement + 0.2, "an inversion went unremarked");
});

test("a magnetic launch hums, and only on the launch", () => {
  const launching = rideMix({ v: 22, mode: "launch", riding: true });
  assert.ok(launching.launch > 0.2, `no launch hum (${launching.launch})`);
  assert.ok(launching.launchHz > 200, `launch hum too low (${launching.launchHz}Hz)`);
  assert.ok(launching.excitement > 0.3, "nobody reacted to being fired out of the station");
  // It rises with speed, the way a stator bank does.
  assert.ok(rideMix({ v: 30, mode: "launch" }).launchHz > rideMix({ v: 10, mode: "launch" }).launchHz);
  for (const mode of ["free", "lift", "brake", "station"]) {
    assert.equal(rideMix({ v: 22, mode }).launch, 0, `launch hum audible in ${mode}`);
  }
  // Chain circuits never produce one at all.
  assert.equal(rideMix({ v: 5, mode: "lift" }).launch, 0);
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
