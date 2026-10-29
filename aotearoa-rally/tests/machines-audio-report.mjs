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
for (const id of Object.keys(CARS)) {
  console.log(`\n=== ${id}: engine clips`);
  bad += run(["tests/machines-audio-evidence.mjs", `--out=${join(out, id)}`, `--car=${id}`, "--clips=idle,sweep,shift,turbo"]) ? 1 : 0;
}
console.log("\n=== impact + surfaces");
bad += run(["tests/machines-audio-evidence.mjs", `--out=${join(out, "fx")}`, "--clips=impact,gravel,tarmac"]) ? 1 : 0;
console.log("\n=== co-driver timing");
bad += run(["tests/machines-codriver-timing.mjs", String(a.stage || "waitomo"), String(a.kmh || 90)]) ? 1 : 0;
process.exit(bad ? 1 : 0);
