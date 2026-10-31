import os from "node:os"; os.setPriority(0, os.constants.priority.PRIORITY_LOW);
// Timbre and surface checks that need real offline renders (headless Chrome). NOT part of npm test; run on demand:
//
//   node tests/machines-audio-timbre.mjs            # prints the table and exits 1 if a check fails
//   node tests/machines-audio-timbre.mjs --json     # also prints the table as JSON
//
// One hidden Chrome, one page, 4 cars x 6 short clips (<= 2 s each, 2-3 min on a busy box). Checks:
//   1. idle centroid < 1500 Hz for every car, engine-only (ambience, effects, voice buses muted) AND in the full mix
//   2. any two cars at the same rpm (3000, half throttle, standing) differ by >= 15 % in engine-only centroid; at idle likewise, engine-only AND full mix
//   3. full-mix sweep: Takahe (high-revving four) is brighter than Piwakawaka (V8 lope) by >= 15 %
//   4. full mix: tarmac centroid >= 1.25 x gravel centroid on every car (surface character)
// History: before round 4 the idle full mix was mostly the car-independent ambience bed, so the cars read within ~6 % of each
// other there by construction. Spectral centroid here is magnitude-weighted (as in the round-3 report), so a broadband floor
// counts for far more than its power suggests: that is the failure these checks guard against.
// Thresholds come from the round-4 before/after data in the handoff; change them only with new data.
import { openGame } from "./harness.mjs";
import { spectralCentroid } from "./audio-analysis.mjs";
import { CAR_IDS } from "../core/cars.mjs";

const JSON_OUT = process.argv.includes("--json");
const f32 = (b64) => { const b = Buffer.from(b64, "base64"); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const ENGINE_ONLY = ["ambience", "effects", "voice"];
const T = { idleMaxHz: 1500, carSpread: 0.15, tarmacOverGravel: 1.25 };

const g = await openGame({ width: 400, height: 300, path: "/tests/audio-evidence.html", query: "" });
const table = {}, fails = [];
try {
  await g.waitFor("window.ready===true", 20000);
  const cen = async (clip, car, mute = [], s) => {
    const r = await Promise.race([g.evalAsync(`renderClip(${JSON.stringify(clip)}, ${JSON.stringify(car)}, ${JSON.stringify({ mute, s })})`), new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 60 s")), 60000))]);
    return spectralCentroid(f32(r.L), r.sr);
  };
  for (const car of CAR_IDS) {
    table[car] = {
      idleEngine: await cen("idle", car, ENGINE_ONLY), rpm3kEngine: await cen("rpm3k", car, ENGINE_ONLY),
      idleMix: await cen("idle", car, [], 400), idleMixCrowd: await cen("idle", car, [], 20), sweepMix: await cen("sweep", car), gravelMix: await cen("gravel", car), tarmacMix: await cen("tarmac", car),
    };
  }
} finally { await g.close(); }

console.log("(idleEngine = engine-only idle centroid; idleMix = full mix standing mid-stage; idleMixCrowd = full mix standing on the start line)");
console.log("car          idleEngine rpm3kEngine  idleMix  crowd  sweepMix gravelMix tarmacMix  tarmac/gravel");
for (const car of CAR_IDS) { const t = table[car]; console.log(`${car.padEnd(12)} ${String(t.idleEngine).padStart(9)} ${String(t.rpm3kEngine).padStart(11)} ${String(t.idleMix).padStart(8)} crowd ${String(t.idleMixCrowd).padStart(5)} ${String(t.sweepMix).padStart(9)} ${String(t.gravelMix).padStart(9)} ${String(t.tarmacMix).padStart(9)}  ${(t.tarmacMix / t.gravelMix).toFixed(2).padStart(9)}`); }
if (JSON_OUT) console.log(JSON.stringify(table));

for (const car of CAR_IDS) {
  if (!(table[car].idleEngine < T.idleMaxHz)) fails.push(`${car}: engine-only idle centroid ${table[car].idleEngine} Hz >= ${T.idleMaxHz}`);
  if (!(table[car].idleMix < T.idleMaxHz)) fails.push(`${car}: full-mix idle centroid ${table[car].idleMix} Hz >= ${T.idleMaxHz}`);
  if (!(table[car].tarmacMix >= T.tarmacOverGravel * table[car].gravelMix)) fails.push(`${car}: tarmac ${table[car].tarmacMix} < ${T.tarmacOverGravel} x gravel ${table[car].gravelMix}`);
}
for (const key of ["idleEngine", "rpm3kEngine", "idleMix", "idleMixCrowd"]) { // idleMix: the full mix as the player hears it (round 4: the bed is cut at standstill)
  for (let i = 0; i < CAR_IDS.length; i++) for (let j = i + 1; j < CAR_IDS.length; j++) {
    const a = table[CAR_IDS[i]][key], b = table[CAR_IDS[j]][key], d = Math.abs(a - b) / Math.min(a, b);
    if (d < T.carSpread) fails.push(`${CAR_IDS[i]} vs ${CAR_IDS[j]} ${key}: ${a} vs ${b} Hz are only ${(d * 100).toFixed(0)} % apart (< ${T.carSpread * 100} %)`);
  }
}
if (!(table.takahe.sweepMix >= (1 + T.carSpread) * table.piwakawaka.sweepMix)) fails.push(`takahe sweep ${table.takahe.sweepMix} Hz is not >= ${1 + T.carSpread} x piwakawaka ${table.piwakawaka.sweepMix} Hz`);
console.log(fails.length ? "\nFAIL\n  " + fails.join("\n  ") : "\nOK: all timbre and surface checks pass");
process.exit(fails.length ? 1 : 0);
