// Node-side audio checks (no Chrome): the evidence analysis is calibrated on synthetic signals, and the per-car firing-frequency
// table follows from cylinders and rpm. Round 4, M-audio.
import test from "node:test";
import assert from "node:assert/strict";
import { pulseTrain, modelPitchCheck, lineAbove, mag, peakPick, spectralCentroid } from "./audio-analysis.mjs";
import { firingHz, engineVoice, engineCharacter } from "../audio/params.mjs";
import { CARS, CAR_IDS } from "../core/cars.mjs";

const SR = 44100;

test("analysis calibration: a clean 164 Hz pulse train has its line at f, yet the unconstrained peak pick reads 2f", () => {
  const x = pulseTrain(164, SR, 2);
  const c = modelPitchCheck(x, SR, SR, 164);
  assert.ok(c.f0Db >= 20, `line at f ${c.f0Db} dB`);
  assert.ok(c.f2Db >= 20, `line at 2f ${c.f2Db} dB`);
  assert.ok(c.halfDb < 6, `no line at f/2 on a clean train, got ${c.halfDb} dB`);
  // The round-3 report printed peakHz as "measured" and looked like rpm tracking failed; the same picker does this on a perfect signal.
  assert.ok(Math.abs(c.peakHz - 328) < 8, `peak pick ${c.peakHz} Hz (2f), not f`);
});

test("analysis calibration: the model check follows the true rate, not a wrong one", () => {
  for (const hz of [48, 77, 135, 221, 354]) {
    const x = pulseTrain(hz, SR, 2);
    const right = modelPitchCheck(x, SR, SR, hz), wrong = modelPitchCheck(x, SR, SR, hz * 1.37);
    assert.ok(right.f0Db >= 15, `${hz} Hz: line at f ${right.f0Db} dB`);
    assert.ok(!(wrong.f0Db >= 15), `${hz} Hz: a model rate 37 % off must not find a line (${wrong.f0Db} dB)`);
  }
});

test("analysis calibration: white noise has no line anywhere and a high centroid", () => {
  let s = 12345;
  const x = new Float32Array(SR * 2);
  for (let i = 0; i < x.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; x[i] = s / 4294967296 - 0.5; }
  const m = mag(x, 0, 8192);
  for (const hz of [60, 120, 240]) assert.ok(lineAbove(m, SR, 8192, hz) < 8, `${hz} Hz line in noise`);
  const cen = spectralCentroid(x, SR);
  assert.ok(cen > 9000 && cen < 13000, `white-noise centroid ${cen}`);
  assert.ok(peakPick(m, SR, 8192) > 0);
});

test("per-car timbre table: engine low-pass is >= 15 % apart between any two cars at idle and at 3000 rpm, ordered V8 < five < flat-four < revving four", () => {
  const order = ["piwakawaka", "huia", "kea", "takahe"];
  for (const [rpm, th] of [[null, 0], [3000, 0.5]]) {
    const lp = order.map((id) => { const spec = CARS[id], e = spec.engine; return engineVoice(rpm ?? e.idleRpm, th, 0, e.idleRpm, e.redline, engineCharacter(spec)).lowpass; });
    for (let i = 1; i < lp.length; i++) assert.ok(lp[i] >= 1.15 * lp[i - 1], `${rpm ?? "idle"}: ${order[i]} ${lp[i].toFixed(0)} Hz vs ${order[i - 1]} ${lp[i - 1].toFixed(0)} Hz`);
  }
  for (let i = 1; i < order.length; i++) assert.ok(engineCharacter(CARS[order[i]]).air > engineCharacter(CARS[order[i - 1]]).air);
});

test("idle engine gain is lifted so the engine leads the ambience bed, and never falls as the throttle opens", () => {
  for (const id of CAR_IDS) {
    const spec = CARS[id], e = spec.engine, chr = engineCharacter(spec);
    const idle = engineVoice(e.idleRpm, 0, 0, e.idleRpm, e.redline, chr).gain;
    assert.ok(idle >= 0.2, `${id} idle gain ${idle}`);
    assert.ok(engineVoice(e.idleRpm, 1, 0, e.idleRpm, e.redline, chr).gain >= idle);
  }
});

test("firing-frequency table: cylinders/2 pulses per crank turn, per car, at idle and redline", () => {
  const expect = { huia: 5, kea: 4, takahe: 4, piwakawaka: 8 };
  for (const id of CAR_IDS) {
    const spec = CARS[id], cyl = engineCharacter(spec).cyl;
    assert.equal(cyl, expect[id], `${id} cylinders`);
    for (const rpm of [spec.engine.idleRpm, 3000, spec.engine.redline]) {
      const hz = firingHz(rpm, cyl);
      assert.ok(Math.abs(hz - (rpm / 60) * (cyl / 2)) < 1e-9);
      const v = engineVoice(rpm, 1, 0, spec.engine.idleRpm, spec.engine.redline, engineCharacter(spec));
      assert.ok(Math.abs(v.fundHz - hz) < 1e-9, `${id} @${rpm}: voice fundamental ${v.fundHz} vs ${hz}`);
    }
  }
  // same rpm, different cars: the V8 fires 2x the four, the five 1.25x
  assert.equal(firingHz(3000, 8), 2 * firingHz(3000, 4));
  assert.equal(firingHz(3000, 5), 1.25 * firingHz(3000, 4));
});
