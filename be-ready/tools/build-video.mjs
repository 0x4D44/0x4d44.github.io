// Renders be-ready-explainer.mp4: Piper TTS narration + deterministic Playwright frames + synthesised music bed.
//   PIPER_PY=/path/to/python PIPER_MODEL=/path/to/voice.onnx node tools/build-video.mjs [--work DIR] [--fps 15] [--scale 0.92] [--frames-only|--audio-only]
// Parts: scene.html (1280x720 frame renderer, window.setT(t)), make-audio.py (narration + pad mix), ../script.js (narration, also the page transcript).
// The Piper voice (en_GB-alan-medium) is not in the repo; --work defaults to ../.video-work (git-ignored); --retts re-speaks cached lines.
// Needs: python3 + piper-tts + numpy, ffmpeg, playwright (global is fine). Output: ../be-ready-explainer.mp4 and ../poster.jpg
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes("--" + n);
const WORK = resolve(arg("work", join(ROOT, ".video-work")));
const FPS = +arg("fps", 15), SCALE = arg("scale", "0.92");
const PY = process.env.PIPER_PY || "python3", MODEL = process.env.PIPER_MODEL;
// script.js is a plain browser script (it sets globalThis.BR_SCRIPT); evaluate it directly rather than import it
const SCRIPT = (new Function("globalThis", readFileSync(join(ROOT, "script.js"), "utf8") + "; return globalThis.BR_SCRIPT;"))({});
mkdirSync(join(WORK, "wav"), { recursive: true }); mkdirSync(join(WORK, "frames"), { recursive: true });

// 1. speak every line
const dur = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
let t = 1.2;
const TL = { fps: FPS, scenes: [] };
SCRIPT.forEach((sc, i) => {
  const scene = { id: sc.id, start: t, lines: [] };
  sc.lines.forEach((ln, j) => {
    const wav = join(WORK, "wav", `s${i}_l${j}.wav`);
    if (!existsSync(wav) || flag("retts")) {
      execFileSync(PY, ["-m", "piper", "-m", MODEL, "--length-scale", SCALE, "--sentence-silence", "0.25", "-f", wav], { input: ln.say });
    }
    const d = dur(wav);
    scene.lines.push({ start: t, end: t + d, wav });
    t += d + (j < sc.lines.length - 1 ? 0.55 : 0);
  });
  scene.end = t + 1.3; t = scene.end;
  TL.scenes.push(scene);
});
TL.total = t + 1.5;
writeFileSync(join(WORK, "timeline.json"), JSON.stringify(TL, null, 1));
console.log(`timeline: ${TL.total.toFixed(1)} s (${(TL.total / 60).toFixed(2)} min), ${SCRIPT.reduce((n, s) => n + s.lines.reduce((m, l) => m + l.say.split(/\s+/).length, 0), 0)} words`);
if (flag("timeline-only")) process.exit(0);

// 2. frames
if (!flag("audio-only")) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const N = Math.ceil(TL.total * FPS), W = 4;
  const pages = [];
  for (let k = 0; k < W; k++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.addInitScript(`window.TL=${JSON.stringify(TL)}`);
    p.on("pageerror", (e) => console.error("pageerror", e.message));
    await p.goto(pathToFileURL(join(HERE, "scene.html")).href);
    await p.waitForFunction("window.__ready === true");
    pages.push(p);
  }
  const t0 = Date.now();
  for (let base = 0; base < N; base += W) {
    await Promise.all(pages.map(async (p, k) => {
      const f = base + k; if (f >= N) return;
      await p.evaluate((tt) => window.setT(tt), f / FPS);
      await p.screenshot({ path: join(WORK, "frames", String(f).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 88 });
    }));
    if (base % 400 === 0) console.log(`frame ${base}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await browser.close();
}
if (flag("frames-only")) process.exit(0);

// 3. audio bed + narration
execFileSync("python3", [join(HERE, "make-audio.py"), join(WORK, "timeline.json"), join(WORK, "mix.wav")], { stdio: "inherit" });

// 4. mux
const out = join(ROOT, "be-ready-explainer.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(WORK, "frames", "%05d.jpg"), "-i", join(WORK, "mix.wav"),
  "-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-r", String(FPS), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
  "-c:a", "aac", "-ar", "48000", "-b:a", "128k", "-movflags", "+faststart", "-shortest", out], { stdio: "inherit" });
const stove = TL.scenes.find((s) => s.id === "stove");
copyFileSync(join(WORK, "frames", String(Math.round((stove.lines[2].start + 3) * FPS)).padStart(5, "0") + ".jpg"), join(ROOT, "poster.jpg"));
console.log("wrote", out);
