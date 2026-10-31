// One-command audio report (offline renders only, nothing audible, one headless Chrome at a time):
//   node tests/machines-audio-report.mjs [--out=DIR] [--stage=waitomo] [--kmh=90]
// Per car: idle + sweep + shift + turbo clips (peak, RMS, clicks, clipping); then an impact clip, gravel and tarmac surface clips, and
// the co-driver timing table for the stage at the given speed. WAVs and spectrograms land in DIR.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { CARS } from "../core/cars.mjs";

const a = Object.fromEntries(process.argv.slice(2).map((x) => { const m = x.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] || true] : [x, true]; }));
const out = resolve(a.out || join(tmpdir(), "ar-audio-report"));
mkdirSync(out, { recursive: true });
const run = (args) => spawnSync(process.execPath, args, { stdio: ["ignore", "inherit", "inherit"], timeout: 600000 }).status;
let bad = 0;
const idleEngine = {};
for (const id of Object.keys(CARS)) {
  console.log(`\n=== ${id}: engine clips`);
  bad += run(["tests/machines-audio-evidence.mjs", `--out=${join(out, id)}`, `--car=${id}`, "--clips=idle,sweep,shift,turbo"]) ? 1 : 0;
  // engine-only idle centroid: ambience, effects and voice buses muted, so it measures the engine and nothing shared between cars
  const r = spawnSync(process.execPath, ["tests/machines-audio-evidence.mjs", `--out=${join(out, id)}`, `--car=${id}`, "--clips=idle", "--mute=ambience,effects,voice"], { encoding: "utf8", timeout: 600000, stdio: ["ignore", "pipe", "inherit"] });
  const row = (r.stdout || "").split("\n").find((l) => l.startsWith("idle "));
  idleEngine[id] = row ? Number(row.trim().split(/\s+/).at(-2)) : NaN;
  if (!Number.isFinite(idleEngine[id])) bad++;
}
console.log("\n############ ENGINE-ONLY IDLE CENTROID (Hz; target < 1500, any two cars >= 15 % apart) ############");
for (const [id, hz] of Object.entries(idleEngine)) console.log(`  ${id.padEnd(12)} ${String(hz).padStart(6)} Hz`);
const hzs = Object.values(idleEngine).filter(Number.isFinite).sort((x, y) => x - y);
let minGap = Infinity; for (let i = 1; i < hzs.length; i++) minGap = Math.min(minGap, hzs[i] / hzs[i - 1] - 1);
console.log(`  smallest gap between two cars: ${(minGap * 100).toFixed(0)} %  ${hzs.every((h) => h < 1500) && minGap >= 0.15 ? "OK" : "FAIL"}`);
if (!(hzs.every((h) => h < 1500) && minGap >= 0.15)) bad++;
console.log("\n=== impact + surfaces");
bad += run(["tests/machines-audio-evidence.mjs", `--out=${join(out, "fx")}`, "--clips=impact,gravel,tarmac"]) ? 1 : 0;
console.log("\n=== co-driver timing");
bad += run(["tests/machines-codriver-timing.mjs", String(a.stage || "waitomo"), String(a.kmh || 90)]) ? 1 : 0;
process.exit(bad ? 1 : 0);
