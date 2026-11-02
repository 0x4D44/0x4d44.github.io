// Solves the arm turn-out table (js/sim/armfit.js): how far each character's upper arms must be turned outwards, per clip, so that the forearms and hands hang
// outside the hips, skirts, kilts and coats instead of inside them. See bodyfit.js (armProbe / armClip) for the measuring stick and for what the bake does.
//   node tools/armfit.mjs [--write] [--chars a,b] [--base URL] [--cap 16.5] [--bag-cap 21] [--drop-cm 4]
// Without --write it only prints the table; with --write it rewrites js/sim/armfit.js (always solved from the SHARED originals, so it is safe to re-run).
// Needs Playwright (require('playwright')). Serves the repo root with python3 -m http.server unless --base is given.
//
// Per character and clip, in headless Chromium: at 8 times along the clip and on both LODs, find the smallest turn (1.5 degree steps, up to 24) that brings the
// 95th-percentile burial of each arm to <= 0.5 cm. That solved turn is then CAPPED - a hanging arm held further out than ~16 degrees stops looking like a person
// standing and starts looking like a scarecrow, and the bag arm of `walk_bag` (held away from the leg) gets 21 - and the capped clip is baked and measured again
// to find what is left. A clip still more than --drop-cm deep (kid_bounce: hands clasped behind the back, inside the pelvis) goes on ARM_DROP: the crowd does not
// play it, provided its pool keeps another clip.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const P = { TARGET: 0.005, STEP: 1.5, MAX: 24, NS: 8, CAP: +arg('--cap', 16.5), BAG_CAP: +arg('--bag-cap', 21), SKIP: ['phone', 'talk', 'wave'] };   // phone / talk / wave are never played by the crowd
const DROP_CM = +arg('--drop-cm', 4);
let BASE = arg('--base', null), server = null;
if (!BASE) { const port = 8230 + Math.floor(Math.random() * 50); server = spawn('python3', ['-m', 'http.server', String(port), '--directory', root], { stdio: 'ignore' }); BASE = `http://localhost:${port}`; await new Promise((r) => setTimeout(r, 1200)); }

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${BASE}/glasgow-subway/tools/test_sim.html?pr=1&aa=0&mode=explore&q=high&line=outer&station=ibrox`);
  await page.waitForFunction(() => window.__sim, null, { timeout: 300000 });
  await page.waitForFunction(() => __sim.mode(), null, { timeout: 300000 });
  let ids = await page.evaluate(() => __sim.sim.crowd.chars.map((c) => c.id));
  const only = arg('--chars', null); if (only) ids = ids.filter((i) => only.split(',').includes(i));
  const out = {};
  for (const id of ids) {
    const t0 = Date.now();
    out[id] = await page.evaluate(({ id, P }) => {
      const crowd = __sim.sim.crowd, kit = crowd.armKit(), ch = crowd.chars.find((c) => c.id === id), rows = {}, deg = Math.PI / 180;
      const probes = [kit.probe(ch, false), kit.probe(ch, true)];
      for (const [cat, list] of Object.entries(ch.pools0)) {
        if (P.SKIP.includes(cat)) continue;
        for (const clip of list) {
          const nm = clip.name.split('__').pop(), ax = kit.axes(ch, clip), best = { l: 0, r: 0 };
          for (const probe of probes) for (let k = 0; k < P.NS; k++) {
            probe.pose(clip, (k / P.NS) * clip.duration);
            const need = { l: null, r: null };
            for (let th = 0; th <= P.MAX + 1e-6; th += P.STEP) {
              const d = probe.depth({ l: [ax.l, th * deg], r: [ax.r, th * deg] });
              for (const s of ['l', 'r']) if (need[s] === null && (d[s] <= P.TARGET || !ax[s])) need[s] = th;
              if (need.l !== null && need.r !== null) break;
            }
            for (const s of ['l', 'r']) best[s] = Math.max(best[s], need[s] === null ? P.MAX : need[s]);
          }
          const cap = nm === 'walk_bag' ? P.BAG_CAP : P.CAP, q = (v) => Math.round(Math.min(v, cap) * 2) / 2, l = q(best.l), r = q(best.r);
          const baked = kit.bake(clip, ax, l, r); let res = 0;   // what is left once the capped turn is baked into the keys
          for (const probe of probes) for (let k = 0; k < P.NS; k++) { probe.pose(baked, (k / P.NS) * clip.duration); const d = probe.depth(); res = Math.max(res, d.l, d.r); }
          rows[nm] = { cat, l, r, solved: [best.l, best.r], res };
        }
      }
      return rows;
    }, { id, P });
    const rows = Object.entries(out[id]).map(([n, r]) => `${n}:${r.l}/${r.r}${r.res > DROP_CM / 100 ? '!' + (r.res * 100).toFixed(0) : ''}`);
    console.log(id.padEnd(17), ((Date.now() - t0) / 1000).toFixed(1) + 's', rows.join(' '));
  }

  // the table, and the clips no turn-out can save
  let table = '', drops = '', n = 0, residual = [];
  for (const id of Object.keys(out).sort()) {
    const rows = out[id], drop = [], byCat = {};
    for (const [nm, r] of Object.entries(rows)) (byCat[r.cat] = byCat[r.cat] || []).push([nm, r]);
    for (const list of Object.values(byCat)) {
      list.sort((a, b) => a[1].res - b[1].res);
      list.forEach(([nm, r], i) => { if (r.res > DROP_CM / 100 && i > 0) { drop.push(nm); r.dropped = true; } });   // the least bad clip of a pool always stays
    }
    const ent = Object.entries(rows).filter(([, r]) => !r.dropped && (r.l >= 0.5 || r.r >= 0.5)).map(([nm, r]) => `${nm}: [${r.l}, ${r.r}]`);
    n += ent.length; table += `  ${id}: { ${ent.join(', ')} },\n`;
    if (drop.length) drops += `  ${id}: [${drop.map((d) => `'${d}'`).join(', ')}],\n`;
    for (const r of Object.values(rows)) if (!r.dropped) residual.push(r.res * 100);
  }
  residual.sort((a, b) => a - b);
  const src = '// Upper-arm turn-out (degrees, [left, right]) per character and clip, solved offline by tools/armfit.mjs. See bodyfit.js (armClip) for what it is for.\n' +
    `export const ARM_OUT = {\n${table}};\n` +
    '// Clips that no turn-out can clear (still buried more than ' + DROP_CM + ' cm): the crowd does not play them. Same tool.\n' +
    `export const ARM_DROP = {\n${drops}};\n`;
  console.log(`\n${n} clip entries; clips played: median residual burial ${residual[Math.floor(residual.length / 2)].toFixed(1)} cm, worst ${residual[residual.length - 1].toFixed(1)} cm; dropped:\n${drops || '  (none)\n'}`);
  if (process.argv.includes('--write')) {
    if (only) console.log('--chars given: not writing a partial table');
    else { fs.writeFileSync(path.join(root, 'glasgow-subway/js/sim/armfit.js'), src); console.log('wrote glasgow-subway/js/sim/armfit.js'); }
  } else console.log('(dry run: add --write to rewrite js/sim/armfit.js)');
} finally { await browser.close(); if (server) server.kill(); }
