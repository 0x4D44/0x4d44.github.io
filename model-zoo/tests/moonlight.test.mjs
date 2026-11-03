import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
// The repo root package.json is "type": "module", so require() would treat
// moonlight.js as ESM and skip its CommonJS export. Evaluate it as a classic
// script with a CommonJS-style `module`, as a plain script/Node loader would.
const require = createRequire(import.meta.url);
const file = require.resolve("../js/moonlight.js");
const mod = { exports: {} };
vm.runInNewContext(readFileSync(file, "utf8"), { module: mod, console }, { filename: file });
const { parseReply, toMidi } = mod.exports;

function readVlq(b, i) {
  let v = 0;
  for (;;) { const c = b[i++]; v = v * 128 + (c & 0x7f); if (!(c & 0x80)) break; }
  return [v, i];
}

function parseSmf(b) {
  const str = (o, n) => String.fromCharCode(...b.slice(o, o + n));
  const u32 = (o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  assert.strictEqual(str(0, 4), "MThd");
  assert.strictEqual(u32(4), 6);
  const format = (b[8] << 8) | b[9], ntrk = (b[10] << 8) | b[11], ppq = (b[12] << 8) | b[13];
  assert.strictEqual(str(14, 4), "MTrk");
  const len = u32(18);
  assert.strictEqual(22 + len, b.length, "track length matches");
  let i = 22, tick = 0, tempo = null, program = null, ended = false, status = 0;
  const open = new Map(), notes = [];
  while (i < b.length) {
    let d; [d, i] = readVlq(b, i); tick += d;
    assert.ok(!ended, "no events after end-of-track");
    if (b[i] === 0xff) {
      const type = b[i + 1], l = b[i + 2];
      if (type === 0x51) tempo = 60000000 / ((b[i + 3] << 16) | (b[i + 4] << 8) | b[i + 5]);
      if (type === 0x2f) ended = true;
      i += 3 + l; continue;
    }
    if (b[i] & 0x80) status = b[i++];
    const hi = status & 0xf0;
    if (hi === 0xc0) { program = b[i++]; continue; }
    const k = b[i++], v = b[i++];
    if (hi === 0x90 && v > 0) {
      assert.ok(!open.has(k), "no overlapping same-pitch note-on");
      open.set(k, { tick, v });
    } else if (hi === 0x80 || hi === 0x90) {
      const o = open.get(k);
      assert.ok(o, "note-off has matching on");
      open.delete(k);
      notes.push({ pitch: k, tick: o.tick, dticks: tick - o.tick, vel: o.v });
    } else assert.fail("unexpected status " + status);
  }
  assert.ok(ended, "end-of-track present");
  assert.strictEqual(open.size, 0, "all notes closed");
  return { format, ntrk, ppq, tempo, program, notes };
}

const sortKey = (a, b) => a.start - b.start || a.pitch - b.pitch || a.vel - b.vel;

test("toMidi round trip with chord and same-pitch overlap", () => {
  const notes = [
    { pitch: 49, start: 0, dur: 4, vel: 50 },
    { pitch: 56, start: 0, dur: 4, vel: 55 },
    { pitch: 61, start: 0, dur: 0.5, vel: 70 },
    { pitch: 64, start: 0.5, dur: 0.5, vel: 72 },
    { pitch: 68, start: 1, dur: 0.5, vel: 74 },
    { pitch: 61, start: 1.5, dur: 0.5, vel: 76 },
    { pitch: 64, start: 2, dur: 1.25, vel: 78 },
    // same pitch, overlapping the previous 64: earlier note is cut at the new onset
    { pitch: 64, start: 2.5, dur: 1, vel: 90 },
    { pitch: 60, start: 300, dur: 1, vel: 127 }, // forces a multi-byte delta
  ];
  const smf = parseSmf(toMidi({ tempo: 52, notes }));
  assert.strictEqual(smf.format, 0);
  assert.strictEqual(smf.ntrk, 1);
  assert.strictEqual(smf.ppq, 480);
  assert.strictEqual(smf.program, 0);
  assert.ok(Math.abs(smf.tempo - 52) < 0.01);
  assert.strictEqual(smf.notes.length, notes.length);
  const exp = notes.map((n) => ({ ...n }));
  exp[6].dur = 0.5;
  const got = smf.notes
    .map((n) => ({ pitch: n.pitch, start: n.tick / 480, dur: n.dticks / 480, vel: n.vel }))
    .sort(sortKey);
  exp.sort(sortKey);
  exp.forEach((e, i) => {
    assert.strictEqual(got[i].pitch, e.pitch);
    assert.strictEqual(got[i].vel, e.vel);
    assert.ok(Math.abs(got[i].start - e.start) <= 1 / 480, `start ${i}`);
    assert.ok(Math.abs(got[i].dur - e.dur) <= 1 / 480, `dur ${i}`);
  });
});

test("parseReply fenced JSON", () => {
  const r = parseReply('```json\n{"tempo_bpm": 54, "notes": [[61,0,0.5,60],[64,0.5,0.5,70]]}\n```');
  assert.ok(r.ok);
  assert.strictEqual(r.tempo, 54);
  assert.deepStrictEqual({ ...r.notes[1] }, { pitch: 64, start: 0.5, dur: 0.5, vel: 70 });
  assert.strictEqual(r.warnings.length, 0);
});

test("parseReply prose around JSON", () => {
  const r = parseReply('Sure! Here it is:\n{"tempo_bpm": 60, "notes": [[60,0,1,80]]}\nHope you like it.');
  assert.ok(r.ok);
  assert.strictEqual(r.notes.length, 1);
});

test("parseReply missing velocity defaults to 64", () => {
  const r = parseReply('{"tempo_bpm": 60, "notes": [[60,0,1]]}');
  assert.ok(r.ok);
  assert.strictEqual(r.notes[0].vel, 64);
});

test("parseReply clamps velocity and rounds pitch", () => {
  const r = parseReply('{"tempo_bpm": 60, "notes": [[60.4,0,1,300],[61,1,1,0]]}');
  assert.ok(r.ok);
  assert.strictEqual(r.notes[0].pitch, 60);
  assert.strictEqual(r.notes[0].vel, 127);
  assert.strictEqual(r.notes[1].vel, 1);
});

test("parseReply drops invalid notes with warnings", () => {
  const r = parseReply('{"tempo_bpm": 60, "notes": [[60,0,1,80],[200,0,1,80],[60,-1,1,80],[60,0,0,80],["x",0,1],"bad",[62,1,1,80]]}');
  assert.ok(r.ok);
  assert.strictEqual(r.notes.length, 2);
  assert.ok(r.warnings.some((w) => /dropped 5 invalid notes/.test(w)));
});

test("parseReply truncated JSON fails", () => {
  const r = parseReply('{"tempo_bpm": 60, "notes": [[60,0,1,80],[62,1,');
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason);
});

test("parseReply empty and non-string fail", () => {
  assert.strictEqual(parseReply("").ok, false);
  assert.strictEqual(parseReply("   ").ok, false);
  assert.strictEqual(parseReply(undefined).ok, false);
  assert.strictEqual(parseReply('{"tempo_bpm":60,"notes":[]}').ok, false);
});

test("parseReply out-of-range tempo defaults with warning", () => {
  for (const t of [5, 1000, '"fast"']) {
    const r = parseReply(`{"tempo_bpm": ${t}, "notes": [[60,0,1,80]]}`);
    assert.ok(r.ok);
    assert.strictEqual(r.tempo, 60);
    assert.ok(r.warnings.some((w) => /tempo/.test(w)));
  }
});
