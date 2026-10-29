#!/usr/bin/env node
// One-command headless GPU screenshots / scripted playtests.
//
//   node shot.mjs --url "http://127.0.0.1:8100/skyblitz/?debug=1&autostart=1&manual=1" --out shot.png
//        [--w 1280] [--h 720] [--dpr 1] [--wait 1500] [--waitFor "window.__sky&&__sky.ready"]
//        [--eval "js"] [--evalFile script.js] [--steps steps.json] [--outdir dir] [--logs] [--strict]
//
// --eval/--evalFile run in the page (top-level await ok); the result is printed as JSON.
// --steps is a JSON array executed in order. Step kinds:
//   {"wait":ms}  {"waitFor":"expr"}  {"eval":"expr"}  {"shot":"name.png"}  {"sim":120}  (== __sky.step(120))
//   {"key":"ArrowLeft","hold":300}  {"down":"KeyW"}  {"up":"KeyW"}  {"click":[x,y]}  {"viewport":[w,h]}
// Prints console errors / exceptions at the end (always) and with --logs prints everything.
// --strict exits non-zero if the page logged any error or exception.
import { launchChrome } from "./chrome.mjs";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);
const url = opt("--url");
if (!url || flag("--help")) { console.error(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 16).join("\n")); process.exit(url ? 0 : 2); }
const w = Number(opt("--w", 1280)), h = Number(opt("--h", 720)), dpr = Number(opt("--dpr", 1));
const out = opt("--out");
const outdir = resolve(opt("--outdir", out ? dirname(resolve(out)) : "."));
mkdirSync(outdir, { recursive: true });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = await launchChrome({ width: w, height: h, dpr });
let code = 0;
try {
  const page = await chrome.newPage();
  await page.goto(url);
  if (opt("--waitFor")) await page.waitFor(opt("--waitFor"), { timeout: 60000 });
  await delay(Number(opt("--wait", 1500)));
  if (opt("--eval")) console.log(JSON.stringify(await page.eval(opt("--eval")), null, 1));
  if (opt("--evalFile")) console.log(JSON.stringify(await page.eval(readFileSync(opt("--evalFile"), "utf8")), null, 1));
  if (opt("--steps")) {
    for (const st of JSON.parse(readFileSync(opt("--steps"), "utf8"))) {
      if (st.wait != null) await delay(st.wait);
      else if (st.waitFor) await page.waitFor(st.waitFor, { timeout: st.timeout || 60000 });
      else if (st.eval) console.log(JSON.stringify(await page.eval(st.eval)));
      else if (st.sim) await page.eval(`__sky.step(${Number(st.sim)})`);
      else if (st.shot) console.log("shot", await page.screenshot(join(outdir, st.shot)));
      else if (st.key) await page.key(st.key, { hold: st.hold ?? 40 });
      else if (st.down) await page.key(st.down, { type: "down" });
      else if (st.up) await page.key(st.up, { type: "up" });
      else if (st.click) await page.click(st.click[0], st.click[1]);
      else if (st.viewport) await page.setViewport(st.viewport[0], st.viewport[1], { dpr });
    }
  }
  if (out) console.log("shot", await page.screenshot(resolve(out)));
  const errs = page.errors();
  if (flag("--logs")) for (const l of page.logs) console.log(`[${l.type}] ${l.text}`);
  else for (const l of errs) console.log(`[${l.type}] ${l.text}`);
  console.log(errs.length ? `page logged ${errs.length} error(s)` : "no page errors");
  if (flag("--strict") && errs.length) code = 1;
} catch (e) {
  console.error("shot failed:", e.message); code = 1;
} finally {
  await chrome.close();
}
process.exit(code);
