#!/usr/bin/env node
// One-shot screenshot CLI.
//   node la-ladera/tests/shot.mjs [--q "autostart&manual&hour=17"] [--eval "<js run after boot>"] [--out dir/name.jpg]
//        [--w 1280] [--h 720] [--page] [--gpu auto|swiftshader|gpu] [--json]
// Several shots in one boot: repeat --eval/--out pairs in order, or use --steps steps.json:
//   [ { "eval": "__ladera.teleport(0,30,{yaw:0})", "out": "a.jpg" }, { "eval": "__ladera.walk(1,0,3)", "out": "b.jpg" } ]
// Prints a JSON report (state, console errors, 404s). Exit code 1 if the page threw or had console errors.
import { launch } from './chrome.mjs';
import { readFile } from 'node:fs/promises';

const a = process.argv.slice(2), flag = (n, d) => { const i = a.indexOf('--' + n); return i < 0 ? d : (a[i + 1]?.startsWith('--') || a[i + 1] == null ? true : a[i + 1]); };
const all = (n) => a.flatMap((x, i) => (x === '--' + n ? [a[i + 1]] : []));
const q = flag('q', 'autostart&manual'), w = +flag('w', 1280), h = +flag('h', 720), full = a.includes('--page');
const slug = flag('slug', 'la-ladera');
let steps = [];
if (flag('steps')) steps = JSON.parse(await readFile(flag('steps'), 'utf8'));
else { const ev = all('eval'), out = all('out'); const n = Math.max(ev.length, out.length, 1); for (let i = 0; i < n; i++) steps.push({ eval: ev[i], out: out[i] ?? `.scratch/shot-${i}.jpg` }); }

const b = await launch({ width: w, height: h, gpu: flag('gpu', 'auto') });
let code = 0; const report = { renderer: null, shots: [] };
try {
  report.renderer = await b.renderer();
  const p = await b.open(`${slug}/index.html?${q}`);
  for (const s of steps) {
    if (s.eval) await p.eval(s.eval);
    if (s.out) {
      if (full || s.page) await p.pageShot(s.out); else await p.canvasShot(s.out, { w, h });
      report.shots.push(s.out);
    }
  }
  report.state = await p.eval('__ladera.state()');
  Object.assign(report, p.summary());
  if (report.errors.length || report.consoleErrors.length) code = 1;
} catch (e) { report.fatal = String(e?.stack ?? e); code = 1; }
await b.close();
console.log(JSON.stringify(report, null, 2));
process.exit(code);
