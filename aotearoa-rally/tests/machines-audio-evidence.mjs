import os from "node:os"; os.setPriority(0, os.constants.priority.PRIORITY_LOW);
// Audio evidence (NOT part of npm test). Renders short offline clips (<= 2 s) in headless Chrome, one at a time, each with a
// hard 60 s timeout, then writes 16-bit stereo WAVs + a spectrogram PNG per clip and prints metrics.
//
//   node tests/machines-audio-evidence.mjs [--out DIR] [--car huia] [--clips idle,sweep,...] [--mute engine,effects,ambience,voice] [--view chase|bonnet]
//
// Clips: idle sweep shift turbo gravel tarmac mud snow impact codriver (default: all).
// Metrics: peak (dBFS), RMS (dBFS), DC offset, longest run of clipped samples (|x| >= 0.98), largest adjacent-sample jump
// (a "click" detector), spectral centroid, and for idle/sweep the measured fundamental versus the model's fundamental.
// --mute renders with the named buses silenced, to attribute a click to a bus.
import { mkdir, writeFile } from "node:fs/promises";
import { mag, db, spectralCentroid, modelPitchCheck } from "./audio-analysis.mjs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { deflateSync } from "node:zlib";
import { openGame } from "./harness.mjs";
import { CARS } from "../core/cars.mjs";
import { engineCharacter, engineVoice } from "../audio/params.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [a, true]; }));
const OUT = resolve(args.out || join(tmpdir(), "ar-audio-evidence"));
const CAR = args.car || "huia";
const ALL = ["idle", "sweep", "shift", "turbo", "gravel", "tarmac", "mud", "snow", "impact", "codriver"];
const CLIPS = args.clips ? String(args.clips).split(",") : ALL;
const MUTE = args.mute ? String(args.mute).split(",") : [];
const TIMEOUT = Number(args.timeout || 60000);

const f32 = (b64) => { const b = Buffer.from(b64, "base64"); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

function metrics(L, R, sr) {
  let peak = 0, sum = 0, dc = 0, run = 0, longest = 0, jump = 0, jumpAt = 0, nan = 0;
  const n = L.length;
  for (let i = 0; i < n; i++) {
    const v = L[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sum += v * v; dc += v;
    if (a >= 0.98) { run++; if (run > longest) longest = run; } else run = 0;
    if (i > 0) { const j = Math.abs(v - L[i - 1]); if (j > jump) { jump = j; jumpAt = i; } }
  }
  let pkR = 0;
  for (let i = 0; i < n; i++) pkR = Math.max(pkR, Math.abs(R[i]));
  // click score: the largest |diff| divided by the RMS of the diffs within +-512 samples (a click stands out, a loud tone does not)
  let click = 0, clickAt = 0;
  for (let i = 1; i < n; i++) {
    const d = Math.abs(L[i] - L[i - 1]);
    if (d < jump * 0.4) continue;
    let s2 = 0, c = 0;
    for (let k = Math.max(1, i - 512); k < Math.min(n, i + 512); k += 2) { if (Math.abs(k - i) < 4) continue; const e = L[k] - L[k - 1]; s2 += e * e; c++; }
    const score = d / (Math.sqrt(s2 / Math.max(1, c)) + 1e-6);
    if (score > click) { click = score; clickAt = i; }
  }
  return {
    peakDb: +db(peak).toFixed(1), peakR: +pkR.toFixed(3), peak: +peak.toFixed(3), rmsDb: +db(Math.sqrt(sum / n)).toFixed(1), dc: +(dc / n).toExponential(1),
    clippedRun: longest, maxJump: +jump.toFixed(3), maxJumpAtMs: +((jumpAt / sr) * 1000).toFixed(1), clickScore: +click.toFixed(1), clickAtMs: +((clickAt / sr) * 1000).toFixed(1), nan,
    centroidHz: spectralCentroid(L, sr),
  };
}

function fundamentals(L, sr, rpmAt, spec, dur) {
  // Model-frequency check, NOT an unconstrained peak pick: for each window, how far above its neighbouring bins the energy at the
  // model firing frequency f and at 2f stands (dB). peakHz is the unconstrained strongest bin, printed only for comparison: on a
  // clean synthetic pulse train it already reads 2f for some rates (see tests/machines-audio-analysis.test.mjs), so a peakHz
  // that is not f is NOT evidence that the engine fails to track rpm. halfDb (f/2) is reported but never judged: a V8 lope or
  // flat-four burble legitimately carries sub-harmonic energy there.
  const chr = engineCharacter(spec), e = spec.engine, out = [];
  for (let w = 0; w < rpmAt.length; w++) {
    const t = ((w + 0.5) * dur) / rpmAt.length;
    const model = engineVoice(rpmAt[w], 1, 0, e.idleRpm, e.redline, chr).fundHz;
    const c = modelPitchCheck(L, sr, t * sr, model);
    out.push({ t: +t.toFixed(2), rpm: Math.round(rpmAt[w]), modelHz: Math.round(model), f0Db: c.f0Db, f2Db: c.f2Db, tracks: Math.max(c.f0Db, c.f2Db) >= 10, halfDb: c.halfDb, peakHz: c.peakHz });
  }
  return out;
}

function wav16(L, R, sr) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  const c = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < n; i++) { buf.writeInt16LE(c(L[i]), 44 + i * 4); buf.writeInt16LE(c(R[i]), 46 + i * 4); }
  return buf;
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function heat(v) { // 0..1 -> inferno-like
  const t = Math.max(0, Math.min(1, v));
  return [Math.round(255 * Math.min(1, t * 1.9)), Math.round(255 * Math.max(0, Math.min(1, (t - 0.35) * 1.8))), Math.round(255 * (t < 0.5 ? t * 1.2 : Math.max(0, 0.6 - (t - 0.5) * 1.6)))];
}
/** 0..10 kHz, log-magnitude spectrogram, 1024 window, hop 256, stretched to >= 900 px wide. */
function spectrogram(L, sr) {
  const N = 1024, hop = 256, cols = Math.max(1, Math.floor((L.length - N) / hop)), bins = 232; // ~10 kHz at 44.1k
  const grid = new Float32Array(cols * bins);
  let mx = -200;
  for (let c = 0; c < cols; c++) { const m = mag(L, c * hop, N); for (let k = 0; k < bins; k++) { const d = db(m[k] / N * 4); grid[c * bins + k] = d; if (d > mx) mx = d; } }
  const stretch = Math.max(1, Math.ceil(900 / cols)), w = cols * stretch, h = bins * 2;
  const rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = bins - 1 - Math.floor(y / 2), c = Math.floor(x / stretch);
    const [r, g, b] = heat((grid[c * bins + k] - (mx - 90)) / 90);
    const o = (y * w + x) * 3; rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
  }
  return png(w, h, rgb);
}

await mkdir(OUT, { recursive: true });
const spec = CARS[CAR];
const rows = [];
for (const clip of CLIPS) {
  const h = await openGame({ width: 400, height: 300, path: "/tests/audio-evidence.html", query: "" });
  let killed = false;
  const timer = setTimeout(() => { killed = true; h.close(); }, TIMEOUT);
  try {
    await h.waitFor("window.ready===true", 20000);
    const r = await h.evalAsync(`renderClip(${JSON.stringify(clip)}, ${JSON.stringify(CAR)}, ${JSON.stringify({ mute: MUTE, view: args.view || "chase" })})`);
    clearTimeout(timer);
    const L = f32(r.L), R = f32(r.R);
    const tag = `${clip}${MUTE.length ? "-mute-" + MUTE.join("+") : ""}-${CAR}`;
    await writeFile(join(OUT, tag + ".wav"), wav16(L, R, r.sr));
    await writeFile(join(OUT, tag + ".png"), spectrogram(L, r.sr));
    const m = metrics(L, R, r.sr);
    rows.push({ clip, ...m, renderMs: r.renderMs, updates: r.updates });
    if (clip === "idle" || clip === "sweep") m.fundamental = fundamentals(L, r.sr, r.rpmAt, spec, L.length / r.sr);
    console.log(JSON.stringify({ clip, ...m, renderMs: r.renderMs }));
  } catch (e) {
    console.log(JSON.stringify({ clip, error: killed ? "TIMEOUT (60 s)" : String(e.message || e) }));
  } finally { clearTimeout(timer); await h.close(); }
}
// Click score = largest adjacent-sample jump / RMS of the jumps within +-512 samples. A pulse-train engine scores 4-12 on a clean
// clip by construction (its pulse edges are steep). Round-4 baseline: the worst clean clip (no discrete event, no mute) over four cars
// x idle/sweep/turbo/gravel/tarmac was 12.4 (takahe sweep). A clip is flagged only above 1.5 x that, so the column means
// "a click well outside what the engine's own pulses produce", not "any peak".
const CLICK_BASELINE = 12.4, CLICK_LIMIT = +(1.5 * CLICK_BASELINE).toFixed(1);
console.log(`\nclip      peakdB  rmsdB   dc        clipRun  maxJump  jump@ms  click  click@ms centroid  renderMs   (click flagged above ${CLICK_LIMIT}; baseline ${CLICK_BASELINE})`);
for (const r of rows) console.log(`${r.clip.padEnd(9)} ${String(r.peakDb).padStart(6)} ${String(r.rmsDb).padStart(6)}  ${String(r.dc).padEnd(9)} ${String(r.clippedRun).padStart(7)} ${String(r.maxJump).padStart(8)} ${String(r.maxJumpAtMs).padStart(8)} ${String(r.clickScore).padStart(6)} ${String(r.clickAtMs).padStart(8)} ${String(r.centroidHz).padStart(8)} ${String(r.renderMs).padStart(9)}`);
const flagged = rows.filter((r) => r.clickScore > CLICK_LIMIT);
console.log(flagged.length ? `CLICK FLAGGED: ${flagged.map((r) => `${r.clip} ${r.clickScore}@${r.clickAtMs}ms`).join(", ")}` : "click: none above the limit");
console.log("pitch column: f0Db / f2Db = dB the line at the MODEL firing frequency f / 2f stands above its neighbouring bins (tracks = max >= 10). halfDb (f/2) is informational: a V8 lope or flat-four burble legitimately has sub-harmonic energy there. peakHz is the unconstrained peak pick and is NOT a rpm-tracking verdict (it reads 2f on a clean synthetic train).");
console.log("files in", OUT);
process.exit(0);
