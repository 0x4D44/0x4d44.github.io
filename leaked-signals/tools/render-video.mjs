// Renders the guided tour to leaked-signals-tour.mp4 + poster.jpg by seeking the page frame by frame.
// usage: node tools/render-video.mjs <outDir> [fps=24] [width=1280] [height=720]
// needs: playwright, ffmpeg. The page is served from the repo root on a throwaway port.
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const out = resolve(process.argv[2] || "./out"), fps = +(process.argv[3] || 24), W = +(process.argv[4] || 1280), H = +(process.argv[5] || 720);
const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png" };
const srv = createServer(async (q, r) => { try { let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html"; const b = await readFile(join(ROOT, p)); r.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" }); r.end(b); } catch { r.writeHead(404); r.end(); } }).listen(0);
const port = srv.address().port;
const { chromium } = createRequire(import.meta.url)("playwright");
await mkdir(join(out, "frames"), { recursive: true });
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: W, height: H } });
// fixed 'now' so the video is reproducible
await p.goto(`http://localhost:${port}/leaked-signals/?t=2026.8&video=1`, { waitUntil: "load" });
await p.waitForFunction(() => window.__leak && window.__leak.info().n > 1000, null, { timeout: 60000 });
const len = await p.evaluate(() => window.__leak.tourLength), N = Math.round(len * fps);
for (let i = 0; i < N; i++) {
  await p.evaluate(t => window.__leak.seek(t), i / fps);
  await p.locator("#stage").screenshot({ path: join(out, "frames", `f${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 88 });
  if (i % 48 === 0) console.log(`frame ${i}/${N}`);
}
await b.close(); srv.close();
const r = spawnSync("ffmpeg", ["-y", "-framerate", String(fps), "-i", join(out, "frames", "f%05d.jpg"), "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(out, "leaked-signals-tour.mp4")], { stdio: "inherit" });
spawnSync("ffmpeg", ["-y", "-i", join(out, "frames", `f${String(Math.round(N * 0.62)).padStart(5, "0")}.jpg`), "-vf", "scale=960:-1", "-q:v", "4", join(out, "poster.jpg")], { stdio: "inherit" });
process.exit(r.status);
