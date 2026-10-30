// Apex Karts soundtrack generator: songs.mjs (compact arrangement notation) -> Standard MIDI Files.
// Dependency-free Node (ESM). Usage: node gen_music.mjs [outDir]   (default ./midi)
// For every theme it writes  <theme>.mid  (intro once + loop body twice, so the reverb tail of the first
// pass folds over the start of the second) and a layout JSON (bar/tick positions + stem map).
// Rendering/packing: build_audio.py (ferrosintesis CLI -> WAV stems -> seamless loop -> Opus/AAC).
import fs from "node:fs";
import path from "node:path";
import { THEMES, compileTheme } from "./songs.mjs";

const TPQ = 480;
const outDir = process.argv[2] || "midi";
fs.mkdirSync(outDir, { recursive: true });

// GM programs of the sampled/recorded voices in ferrosintesis
const PROG = { piano: 0, epiano: 4, bassF: 33, bassP: 34, bassS: 34, strings: 48, pizz: 45, trem: 44, brass: 61, flute: 73,
  glock: 9, celesta: 8, marimba: 12, vibes: 11, gtrC: 27, gtrM: 28, gtrOD: 29, timp: 47, trumpet: 56, sax: 66, horn: 60,
  violin: 40, cello: 42, synstr: 50, synbrass: 62, sawlead: 81,
  // round 2 (skyway / canyon / highland / mall)
  squarelead: 80, synbass1: 38, synbass2: 39, warmpad: 89, polypad: 90, sweeppad: 95, fxbright: 100, fxscifi: 103, revcym: 119,
  banjo: 105, fiddle: 110, harmonica: 22, accordion: 21, whistle: 78, piccolo: 72, ocarina: 79, nylon: 24, steel: 25, mandolin: 25,
  upright: 32, slapB: 36, slapB2: 37, fretless: 35, bagpipe: 109, clav: 7, organ: 17, oboe: 68, clarinet: 71, oh: 55, harp: 46,
  pizzS: 45, dulcimer: 15, kalimba: 108, musicbox: 10, chorus: 52, tuba: 58, trombone: 57, muted: 59, tsax: 66, asax: 65 };
const LSB = { mandolin: 96 };          // XG bank-select LSB variation (ferrosintesis: program 25 + LSB 96 = mandolin)
const DRUM = { kick: 36, stick: 37, snare: 38, clap: 39, hat: 42, phat: 44, open: 46, tomL: 41, tomM: 45, tomH: 48,
  crash: 49, ride: 51, tamb: 54, cowbell: 56, shaker: 70 };
// stem roles: base always on; lead = melody; extra fades in from ~0.2; boost from ~0.55
const LEADS = new Set(["sax", "trumpet", "flute", "violin", "horn", "saw", "lead", "fan", "glock", "celm", "pianoM", "fanB", "fid", "harm", "wst", "tw", "acc", "pipe", "vib", "ldsyn", "hook", "guit"]);
const EXTRA = new Set(["perc", "arp", "celesta", "pizz", "glockA", "vibes", "ostc", "pn", "acid", "pluck", "banj", "mand", "dbl2", "chick", "claps", "perc2", "shk", "clav", "wah", "bells", "accC", "bod", "drn2"]);
const BOOST = new Set(["horns", "stab", "stc", "stabs", "hornm", "gtrR", "syn", "swell", "brassP", "ssaw", "riser", "strs", "fidD", "ohit", "hornsB", "fx"]);
// CC7 channel volume per part (loudness balance, tuned from stem measurements)
const VOL = { drums: 100, perc: 80, bass: 104, bassS: 104, timp: 92, ostv: 92, ostc: 86, pizz: 86, celesta: 78, celm: 80, pad: 84, swell: 80,
  syn: 78, stab: 92, stc: 90, stabs: 90, horns: 92, hornm: 92, gtr: 92, gtrR: 84, keys: 98, sax: 108, horn: 104, violin: 100, trumpet: 106,
  flute: 100, glock: 92, glockA: 80, vibes: 80, piano: 100, pianoM: 100, pn: 92, arp: 90, saw: 100, lead: 106, fan: 106, fanB: 90, brassP: 82 };
const SECDYN = { intro: 0.85, verse: 0.88, verse2: 0.9, pre: 0.94, chorus: 1, chorus3: 1, a1: 0.9, a2: 1, b: 0.95, c: 0.82, bridge: 0.8, break: 0.8,
  tag: 0.85, outro: 0.85, fanfare: 1, warm: 0.85, warm2: 0.92 };

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const vlq = (n) => { const b = [n & 127]; n >>= 7; while (n) { b.push((n & 127) | 128); n >>= 7; } return b.reverse(); };

class Trk {
  constructor() { this.ev = []; }
  add(tick, bytes) { this.ev.push([Math.max(0, Math.round(tick)), this.ev.length, bytes]); }
  bytes() {
    this.ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = []; let last = 0;
    for (const [t, , b] of this.ev) { out.push(...vlq(t - last), ...b); last = t; }
    out.push(0, 0xff, 0x2f, 0);
    return Buffer.from(out);
  }
}
const chunk = (id, buf) => { const h = Buffer.alloc(8); h.write(id, 0, "ascii"); h.writeUInt32BE(buf.length, 4); return Buffer.concat([h, buf]); };

function build(id) {
  const th = THEMES[id], song = compileTheme(th);
  const NS = song.NS, STEP = 1920 / NS;
  const bars = song.bars;
  const loop0 = song.loopBar;
  const order = [];                       // bar indices: intro once, body twice
  for (let i = 0; i < bars.length; i++) order.push(i);
  const TAILBARS = 4;
  for (let i = loop0; i < Math.min(bars.length, loop0 + TAILBARS); i++) order.push(i);
  const introBars = loop0, bodyBars = bars.length - loop0;
  const rand = rng(0x9e3779b1 ^ id.length * 7919);
  const jit = (n) => (rand() - 0.5) * 2 * n;
  // channels
  const parts = Object.keys(th.patch);
  const chan = {}; const ncs = {};
  
  const tempo = new Trk();
  tempo.add(0, [0xff, 0x51, 3, ...Buffer.from([(60e6 / song.bpm) >> 16 & 255, (60e6 / song.bpm) >> 8 & 255, (60e6 / song.bpm) & 255])]);
    const stems = {};
  const chNum = {};
  const ensure = (key, part, patch, bank, stem, extra = {}) => {
    const tk = key + "|" + stem;
    if (chan[tk]) return chan[tk];
    let ch;
    if (patch.kind === "drums") ch = 9;
    else if (chNum[tk] != null) ch = chNum[tk];
    else { let n = ncs[stem] || 0; ch = n++; if (ch === 9) ch = n++; ncs[stem] = n; if (ch > 15) throw new Error(id + ": more than 15 melodic channels"); chNum[tk] = ch; }
    const t = new Trk();
    const c = { ch, t, stem, part };
    chan[tk] = c;
    if (patch.kind !== "drums") {
      if (PROG[bank] == null) throw new Error("unknown bank " + bank);
      if (LSB[bank] != null) { t.add(0, [0xb0 | ch, 0, 0]); t.add(0, [0xb0 | ch, 32, LSB[bank]]); }
      t.add(0, [0xc0 | ch, PROG[bank]]);
      if (patch.cc) for (const [num, val] of Object.entries(patch.cc)) t.add(0, [0xb0 | ch, +num, val]);
      t.add(0, [0xb0 | ch, 7, Math.round(Math.min(127, ((th.vol && th.vol[part]) || VOL[part] || 90) * (extra.vscale || 1)))]);
      t.add(0, [0xb0 | ch, 10, Math.round(64 + 63 * Math.max(-1, Math.min(1, (patch.pan || 0) + (extra.pan || 0))))]);
      t.add(0, [0xb0 | ch, 91, Math.round(Math.min(127, 18 + 95 * ((patch.rev || 0) + (patch.room || 0) * 0.5 + (patch.plate || 0) * 0.5)))]);
      if (patch.chorus) t.add(0, [0xb0 | ch, 93, Math.round(40 * patch.chorus)]);
      if (patch.echo) t.add(0, [0xb0 | ch, 94, Math.round(127 * patch.echo)]);
    } else {
      if (patch.kit || th.kit) t.add(0, [0xc0 | ch, patch.kit || th.kit]);
      t.add(0, [0xb0 | ch, 7, (th.vol && th.vol[part]) || VOL.drums]);
      t.add(0, [0xb0 | ch, 91, 34]);
    }
    return c;
  };
  const stemOf = (part, min) => (min >= 0.55 ? "boost" : min > 0 ? "extra" : LEADS.has(part) ? "lead" : BOOST.has(part) ? "boost" : EXTRA.has(part) ? "extra" : "base");
  const pedalDone = new Set();
  let tick0 = 0;
  order.forEach((bi, oi) => {
    const bar = bars[bi];
    const sec = th.sections[bar.si];
    const dyn = SECDYN[sec.name] || 0.9;
    const barTick = oi * NS * STEP;
    for (let s = 0; s < NS; s++) {
      const base = barTick + s * STEP + ((s & 1) ? (th.swing || 0) * STEP : 0);
      for (const e of bar.at[s]) {
        const part = e.p, patch = th.patch[part];
        const stem = stemOf(part, e.min || 0);
        if (patch.kind === "drums") {
          const note = DRUM[e.d];
          if (note == null) throw new Error("drum " + e.d);
          const c = ensure(part, part, patch, null, stem);
          const late = e.d === "snare" ? 4 : e.d === "kick" ? -1 : 0;
          const v = Math.max(18, Math.min(127, Math.round((e.v * 112 + jit(7)) * (0.82 + 0.18 * dyn) * (e.d === "hat" || e.d === "shaker" ? 0.9 : 1))));
          const t = base + late + jit(3);
          c.t.add(t, [0x90 | c.ch, note, v]); c.t.add(t + 40, [0x80 | c.ch, note, 0]);
          continue;
        }
        const tgt = [[part, patch, patch.bank, stem, 0]];
        if (patch.dbl && (e.min || 0) <= 1) tgt.push([part + "_dbl", { ...patch.dbl, kind: patch.kind, pan: (patch.pan || 0) * 0.5 }, patch.dbl.bank, "boost", patch.dbl.oct == null ? 12 : patch.dbl.oct]);
        for (const [key, pt, bank, stm, oct] of tgt) {
          const c = ensure(key, part, pt, bank, stm, key.endsWith("_dbl") ? { vscale: 0.8 } : {});
          let dur = e.l * STEP * (patch.len == null ? 0.96 : patch.len);
          if (patch.hold === "chord") dur = Math.max(dur, (e.ce || e.l) * STEP * 0.97);
          if (e.gh) dur = Math.min(dur, 0.06 * TPQ * 2 * song.bpm / 120 / 2 * 1.0 + 20);
          const notes = e.n;
          const strum = patch.strum ? 6 : 0;
          const lead = LEADS.has(part);
          notes.forEach((n, i) => {
            const t = base + jit(lead ? 4 : 6) + (patch.late || 0) * 1000 * (TPQ * song.bpm / 60000) + i * strum;
            const v = Math.max(20, Math.min(127, Math.round((e.v * 104 + jit(8)) * (0.78 + 0.22 * dyn) * (e.gh ? 0.55 : 1))));
            if (patch.att >= 0.2 && i === 0 && !e.gh) {          // swell: expression ramp
              const L = Math.round(dur), n0 = 45;
              for (let k = 0; k <= 6; k++) c.t.add(t + L * 0.6 * k / 6, [0xb0 | c.ch, 11, Math.round(n0 + (112 - n0) * Math.sin(k / 6 * Math.PI / 2))]);
            }
            if (patch.sweep && i === 0) {            // per-note filter automation (CC74/CC71...) ramped across the section
              const sw = patch.sweep, rg = (sw.sec && sw.sec[sec.name]) || sw.def || [sw.hi, sw.hi];
              const prog = ((bar.bi + s / NS) / sec.bars);
              c.t.add(Math.max(0, t - 2), [0xb0 | c.ch, sw.cc || 74, Math.round(rg[0] + (rg[1] - rg[0]) * Math.pow(prog, sw.pow || 1))]);
            }
            c.t.add(t, [0x90 | c.ch, Math.max(0, Math.min(127, n + oct)), v]);
            c.t.add(t + Math.max(30, dur - 6), [0x80 | c.ch, Math.max(0, Math.min(127, n + oct)), 0]);
          });
          // sustain pedal on piano-like voices: re-pedal on each chord
          if ((bank === "piano" || bank === "epiano") && !pedalDone.has(key + ":" + barTick + ":" + bar.chords.length)) {
            pedalDone.add(key + ":" + barTick + ":" + bar.chords.length);
            for (const ch of bar.chords) {
              const a = barTick + ch.s0 * STEP, b = barTick + ch.s1 * STEP;
              c.t.add(a + 2, [0xb0 | c.ch, 64, 127]); c.t.add(b - 6, [0xb0 | c.ch, 64, 0]);
            }
          }
        }
      }
    }
  });
  const totalTicks = order.length * NS * STEP;
  const write = (name, list) => {
    const hdr = Buffer.alloc(6); hdr.writeUInt16BE(1, 0); hdr.writeUInt16BE(list.length + 1, 2); hdr.writeUInt16BE(TPQ, 4);
    fs.writeFileSync(path.join(outDir, name + ".mid"), Buffer.concat([chunk("MThd", hdr), chunk("MTrk", tempo.bytes()), ...list.map((t) => chunk("MTrk", t.bytes()))]));
  };
  const cl = Object.values(chan);
  const stemSet = [...new Set(cl.map((c) => c.stem))];
  for (const st of stemSet) write(id + "." + st, cl.filter((c) => c.stem === st).map((c) => c.t));
  const secPerBar = 4 * 60 / song.bpm;
  const layout = { id, bpm: song.bpm, introBars, bodyBars, tailBars: TAILBARS, secPerBar, introSec: introBars * secPerBar, bodySec: bodyBars * secPerBar,
    stems: stemSet, channels: Object.fromEntries(Object.entries(chan).map(([k, c]) => [k, { ch: c.ch, stem: c.stem, part: c.part }])) };
  fs.writeFileSync(path.join(outDir, id + ".json"), JSON.stringify(layout, null, 1));
  return layout;
}
for (const id of (process.argv[3] ? process.argv[3].split(",") : Object.keys(THEMES))) {
  const l = build(id);
  console.log(id, l.bpm + "bpm", "intro", l.introBars, "body", l.bodyBars, "bars", l.bodySec.toFixed(1) + "s loop");
}
