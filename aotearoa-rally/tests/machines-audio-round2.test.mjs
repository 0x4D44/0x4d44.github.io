import test from "node:test";
import assert from "node:assert/strict";
import { createScheduler, createCodriver, speechSeconds, speechRate, lookahead, leadExtra } from "../audio/codriver.mjs";
import { engineCharacter, engineVoice, turboVoice, gearWhine, tyreMix, NOISE_CATS } from "../audio/params.mjs";
import { CARS, CAR_IDS } from "../core/cars.mjs";

const mk = (s, speak, o = {}) => ({ s, speak, text: speak, kind: "corner", length: 30, severity: 3, ...o });

test("co-driver lead adds the time it takes to say the call (long calls start earlier)", () => {
  const v = 40;
  const startOf = (speak) => {
    const sc = createScheduler();
    const notes = [mk(1000, speak)];
    for (let s = 500; s < 1000; s += 0.5) { if (sc.update(notes, s, v, false)) return s; }
    return null;
  };
  const short = startOf("Left four");
  const long = startOf("Left four tightens into right three over crest do not cut long");
  assert.ok(short !== null && long !== null);
  assert.ok(long < short - 5, `long call at ${long}, short at ${short}`);
  // and the call ends about `lookahead` before the note
  const dur = speechSeconds("Left four", speechRate(v));
  assert.ok(Math.abs((1000 - short) - (lookahead(v) + leadExtra("Left four", v))) < 2); void dur;
});

test("seek(s) rewinds the cursor and re-arms notes at/after s", () => {
  const sc = createScheduler();
  const notes = [mk(100, "Left one"), mk(300, "Right two"), mk(500, "Left three")];
  sc.update(notes, 480, 30, false); sc.update(notes, 490, 30, false);
  assert.equal(sc.nextIndex, 3);
  sc.seek(250);
  assert.equal(sc.nextIndex, 1);
  const u = sc.update(notes, 250, 30, false);
  assert.ok(u && /Right two/.test(u.text));
});

test("a respawn under 300 m back re-arms the notes it skipped", () => {
  const sc = createScheduler();
  const notes = [mk(200, "Left one"), mk(400, "Right two")];
  for (let s = 100; s <= 405; s += 1) sc.update(notes, s, 30, false);
  assert.equal(sc.nextIndex, 2);
  const u = sc.update(notes, 300, 30, false); // jumped back 105 m
  assert.ok(u && /Right two/.test(u.text));
});

test("a stale onend from a cancelled utterance does not clear the new one; pause keeps a cut-off call", () => {
  const said = [];
  const synth = { getVoices: () => [{ name: "x", lang: "en-NZ" }], speak(u) { said.push(u); }, cancel() {} };
  class Utt { constructor(t) { this.text = t; } }
  const cd = createCodriver({ synth, Utterance: Utt });
  const stage = { pacenotes: [mk(300, "Left three"), mk(900, "Right four")] };
  cd.update(stage, 245, 20, 0.016);
  assert.equal(said.length, 1);
  cd.cancel();
  cd.update(stage, 860, 20, 0.016);
  assert.equal(said.length, 2);
  assert.ok(cd.speaking);
  said[0].onend(); // the cancelled one finishes late
  assert.ok(cd.speaking, "stale event must not clear speaking");
  // pause mid-call: the call is said again on resume
  cd.pause(true);
  assert.ok(!cd.speaking);
  cd.pause(false);
  cd.update(stage, 862, 20, 0.016);
  assert.equal(said.length, 3);
  assert.equal(said[2].text, said[1].text);
});

test("tyre roll is silent when stopped", () => {
  const out = { roll: {}, slide: {}, squeal: 0, skidMax: 0 };
  const wheels = [0, 1, 2, 3].map(() => ({ grounded: true, slipRatio: 0, slipAngle: 0, skid: 0, surf: 0, load: 4000 }));
  tyreMix(wheels, 0, () => "gravel", out);
  for (const k of NOISE_CATS) assert.equal(out.roll[k], 0);
  tyreMix(wheels, 20, () => "gravel", out);
  assert.ok(out.roll.gravel > 0.2);
});

test("each car has an audibly distinct engine in parameter space", () => {
  const v = CAR_IDS.map((id) => {
    const spec = CARS[id], chr = engineCharacter(spec), e = spec.engine;
    const top = engineVoice(e.redline, 1, 1, e.idleRpm, e.redline, chr);
    const idle = engineVoice(e.idleRpm, 0, 0, e.idleRpm, e.redline, chr);
    return { id, cyl: chr.cyl, redline: e.redline, fundTop: top.fundHz, fundIdle: idle.fundHz, lowpass: top.lowpass, whistle: turboVoice(1, 1, 1, chr).whistleGain, whine: gearWhine(30, 3, 1, chr).gain, burble: chr.burble, drive: top.drive };
  });
  const distinct = (key, tol) => {
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      // at least TWO characteristics must differ per pair; checked across the keys below
    }
    return v.map((x) => x[key]);
  };
  distinct("fundTop", 0);
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    const a = v[i], b = v[j];
    const diffs = [
      Math.abs(a.fundTop - b.fundTop) > 8,
      a.cyl !== b.cyl,
      Math.abs(a.lowpass - b.lowpass) > 300,
      Math.abs(a.whistle - b.whistle) > 0.004,
      Math.abs(a.whine - b.whine) > 0.001,
      Math.abs(a.burble - b.burble) > 0.1,
      Math.abs(a.drive - b.drive) > 0.3,
    ].filter(Boolean).length;
    assert.ok(diffs >= 3, `${a.id} vs ${b.id} differ in only ${diffs} parameters`);
  }
  // the six-cylinder fires at 1.5x the crank rate of a four at the same rpm
  const six = v.find((x) => x.cyl === 6);
  if (six) assert.ok(six.fundTop / six.redline > (v.find((x) => x.cyl === 4).fundTop / v.find((x) => x.cyl === 4).redline) * 1.4);
});

test("half-order (sub) content stays below the firing-frequency voice", () => {
  for (const id of CAR_IDS) {
    const spec = CARS[id], chr = engineCharacter(spec), e = spec.engine;
    for (const rpm of [e.idleRpm, (e.idleRpm + e.redline) / 2, e.redline]) {
      for (const th of [0, 1]) assert.ok(engineVoice(rpm, th, 0.5, e.idleRpm, e.redline, chr).subGain < 0.2, `${id} ${rpm} ${th}`);
    }
  }
});
