// node render.mjs <video-id> [fps]  -> build/<id>/video.mp4 (silent) via ffmpeg, plus poster.jpg
import { chromium } from "/opt/node-tools/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const id = process.argv[2], fps = +(process.argv[3] || 24);
const cues = JSON.parse(readFileSync(join(HERE, "cues", id + ".json"), "utf8"));
mkdirSync(join(HERE, "build", id), { recursive: true });
const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", (e) => { console.error("PAGE ERROR", e.message); process.exit(1); });
await p.goto("file://" + join(HERE, "video.html"));
const ok = await p.evaluate((c) => window.setup(c), cues);
if (!ok) console.warn("fonts not ready");
const N = Math.ceil(cues.duration * fps);
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-tune", "animation", join(HERE, "build", id, "video.mp4")], { stdio: ["pipe", "inherit", "inherit"] });
const t0 = Date.now();
for (let f = 0; f < N; f++) {
  const url = await p.evaluate(([T]) => window.frame(T, 0.92), [f / fps]);
  const buf = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 240 === 0) process.stdout.write(`${id}: ${f}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
// poster: a representative moment (2.2s into the second scene)
const pt = cues.scenes[1].start + 2.2;
const purl = await p.evaluate(([T]) => window.frame(T, 0.85), [pt]);
writeFileSync(join(HERE, "build", id, "poster.jpg"), Buffer.from(purl.slice(purl.indexOf(",") + 1), "base64"));
await b.close();
console.log(`${id}: rendered ${N} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
