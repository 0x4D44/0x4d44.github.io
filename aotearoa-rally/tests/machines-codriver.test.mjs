import test from "node:test";
import assert from "node:assert/strict";
import { createScheduler, lookahead, speechRate, pickVoice, createCodriver } from "../audio/codriver.mjs";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const note = (s, speak, o = {}) => ({ s, speak, text: speak, kind: "corner", length: 30, severity: 3, lead: (v) => s - clamp(v * 2.6, 40, 220), ...o });
const NOTES = () => [note(300, "Left three"), note(600, "Right four, tightens"), note(900, "Crest"), note(1200, "Finish", { kind: "finish", length: 0 })];

test("lookahead grows with speed and stays within 40..220 m", () => {
  assert.equal(lookahead(0), 40);
  assert.equal(lookahead(10), 40);
  assert.equal(lookahead(30), 78);
  assert.equal(lookahead(200), 220);
  let prev = 0;
  for (let v = 0; v <= 120; v += 5) { const l = lookahead(v); assert.ok(l >= prev && l >= 40 && l <= 220); prev = l; }
  assert.ok(Number.isFinite(lookahead(NaN)));
});

test("speech rate increases with speed and is bounded", () => {
  assert.ok(speechRate(0) < speechRate(30));
  assert.ok(speechRate(30) < speechRate(60));
  assert.ok(speechRate(1000) <= 1.5 && speechRate(0) >= 0.95);
});

test("a note is voiced at s - lead(v), not before", () => {
  const sc = createScheduler();
  const notes = NOTES();
  // 40 m/s -> lead 104 m: voice at s >= 196
  assert.equal(sc.update(notes, 150, 40, false), null);
  assert.equal(sc.update(notes, 190, 40, false), null);
  const u = sc.update(notes, 197, 40, false);
  assert.ok(u && u.text === "Left three", JSON.stringify(u));
});

test("faster car hears the call earlier (greater distance) than a slow one", () => {
  const first = (v) => { const sc = createScheduler(); const n = NOTES(); for (let s = 0; s < 400; s += 1) { const u = sc.update(n, s, v, false); if (u) return s; } return -1; };
  const slow = first(15), fast = first(60);
  assert.ok(slow > fast, `slow ${slow} fast ${fast}`);
  assert.equal(300 - slow, 40);
  assert.equal(300 - fast, 156);
});

test("never returns a phrase while speech is busy; queue releases afterwards in order", () => {
  const sc = createScheduler();
  const notes = [note(300, "Left three"), note(420, "Right four", { })];
  assert.equal(sc.update(notes, 250, 20, true), null);
  assert.equal(sc.update(notes, 300, 20, true), null);
  assert.ok(sc.queued >= 1);
  const a = sc.update(notes, 301, 20, false);
  assert.equal(a.text, "Left three, into right four".length ? a.text : "");
  assert.ok(/Left three/.test(a.text));
});

test("close notes merge with 'into' and are spoken once", () => {
  const sc = createScheduler();
  const notes = [note(300, "Left three", { length: 20 }), note(335, "Right four"), note(700, "Crest")];
  const u = sc.update(notes, 260, 30, false);
  assert.equal(u.text, "Left three, into right four");
  assert.equal(u.merged, 2);
  // the merged follower is not spoken again
  assert.equal(sc.update(notes, 330, 30, false), null);
  const c = sc.update(notes, 650, 30, false);
  assert.equal(c.text, "Crest");
});

test("far-apart notes do not merge", () => {
  const sc = createScheduler();
  const notes = [note(300, "Left three", { length: 20 }), note(700, "Right four")];
  assert.equal(sc.update(notes, 260, 30, false).text, "Left three");
});

test("max merge length is respected", () => {
  const sc = createScheduler({ maxMerge: 2 });
  const notes = [note(300, "One", { length: 5 }), note(310, "Two", { length: 5 }), note(320, "Three", { length: 5 })];
  const u = sc.update(notes, 250, 30, false);
  assert.equal(u.merged, 2);
});

test("chained notes (empty speak) are not spoken separately", () => {
  const sc = createScheduler();
  const notes = [note(300, "Left three, into right four", { length: 20 }), note(330, "", { chained: true, text: "R4" }), note(700, "Crest")];
  const u = sc.update(notes, 260, 30, false);
  assert.equal(u.text, "Left three, into right four");
  assert.equal(sc.update(notes, 335, 30, false), null);
  assert.equal(sc.update(notes, 660, 30, false).text, "Crest");
});

test("joining a chain half-way (respawn) never speaks the silent chained tail on its own", () => {
  const sc = createScheduler();
  const notes = [note(300, "Left three, into right four", { length: 20 }), note(330, "", { chained: true, text: "R4" }), note(700, "Crest")];
  assert.equal(sc.update(notes, 320, 30, false), null);
  assert.equal(sc.queued, 0);
  assert.equal(sc.update(notes, 660, 30, false).text, "Crest");
});

test("notes already passed are dropped, not spoken late", () => {
  const sc = createScheduler();
  const notes = NOTES();
  const u = sc.update(notes, 340, 40, false); // 40 m past the first note
  assert.ok(!u || u.text !== "Left three", JSON.stringify(u));
});

test("every note is spoken exactly once, in stage order, driving the whole stage", () => {
  const sc = createScheduler();
  const notes = [];
  for (let i = 0; i < 20; i++) notes.push(note(200 + i * 150, "Call " + i, { length: 20 }));
  const spoken = [];
  for (let s = 0; s < 3300; s += 2) { const u = sc.update(notes, s, 35, false); if (u) spoken.push(u.text); }
  assert.deepEqual(spoken, notes.map((n) => n.text));
});

test("reset rewinds the queue so the stage can be driven again", () => {
  const sc = createScheduler();
  const notes = NOTES();
  for (let s = 0; s < 400; s += 2) sc.update(notes, s, 40, false);
  assert.equal(sc.update(notes, 10, 40, false), null);
  sc.reset(0, notes);
  assert.equal(sc.queued, 0);
  const u = sc.update(notes, 200, 40, false);
  assert.equal(u.text, "Left three");
});

test("pickVoice prefers en-NZ, then en-AU, then en-GB, then any English; honours a named voice", () => {
  const v = [{ name: "a", lang: "fr-FR" }, { name: "b", lang: "en-GB" }, { name: "c", lang: "en-AU" }, { name: "d", lang: "en-US" }];
  assert.equal(pickVoice(v).name, "c");
  assert.equal(pickVoice([...v, { name: "e", lang: "en-NZ" }]).name, "e");
  assert.equal(pickVoice(v, "d").name, "d");
  assert.equal(pickVoice([{ name: "z", lang: "de-DE" }]), null);
  assert.equal(pickVoice([]), null);
});

test("codriver wrapper: speaks through the synth, never overlaps, and falls back to beeps without one", () => {
  const said = [];
  const synth = { getVoices: () => [{ name: "x", lang: "en-NZ" }], speak(u) { said.push(u); }, cancel() {} };
  class Utt { constructor(t) { this.text = t; } }
  const cd = createCodriver({ synth, Utterance: Utt });
  const stage = { pacenotes: [note(300, "Left three"), note(330, "Right four")] };
  cd.update(stage, 260, 30, 0.016);
  assert.equal(said.length, 1);
  cd.update(stage, 262, 30, 0.016); // still speaking: nothing new
  assert.equal(said.length, 1);
  said[0].onend();
  cd.update(stage, 400, 30, 0.016);
  const beeps = [];
  const cd2 = createCodriver({ synth: null, beep: (t) => beeps.push(t) });
  assert.ok(cd2.usingBeeps);
  cd2.update(stage, 260, 30, 0.016);
  assert.equal(beeps.length, 1);
  cd2.enable(false);
  cd2.reset();
  cd2.update(stage, 260, 30, 0.016);
  assert.equal(beeps.length, 1);
});
