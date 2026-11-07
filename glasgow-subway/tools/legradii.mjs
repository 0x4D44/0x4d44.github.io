// Writes js/sim/legradii.js: the leg radii that bodyfit.js fitLegs measures on each skirted person's full-detail skin (people.glb). The simplified model
// (people_lod.glb) is too coarse to measure its own, so its skirt fit borrows these - and the game builds its crowds from people_lod.glb alone, before people.glb
// has arrived (index.js), so the numbers have to be on hand without it. Rerun after any rebuild of people.glb; AnimCrowd.attachFull warns when they are stale.
//   node tools/legradii.mjs [--write] [--base URL]
// Without --write it compares the measured radii with js/sim/legradii.js and exits 1 if they differ. Needs Playwright. Serves the repo root unless --base is given.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..'), out = path.join(root, 'glasgow-subway/js/sim/legradii.js');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
let BASE = arg('--base', null), server = null;
if (!BASE) { const port = 8230 + Math.floor(Math.random() * 50); server = spawn('python3', ['-m', 'http.server', String(port), '--directory', root], { stdio: 'ignore' }); BASE = `http://localhost:${port}`; await new Promise((r) => setTimeout(r, 1200)); }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 200, height: 150 } });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${BASE}/glasgow-subway/tools/people_view.html`);
  await page.waitForFunction(() => window.__ready || window.__err, null, { timeout: 300000 });
  const err = await page.evaluate(() => window.__err); if (err) throw new Error(err);
  const radii = await page.evaluate(() => { const o = {}; for (const [id, f] of Object.entries(window.__fit)) if (f.legs && f.legs.radii) o[id] = f.legs.radii; return o; });
  const ids = Object.keys(radii).sort();
  const src = '// Leg radii (m) of each skirted person, as bodyfit.js fitLegs measures them on the full-detail skin (people.glb): written by tools/legradii.mjs.\n' +
    '// The simplified model borrows them for its own skirt fit (people.js _fitLod), including before people.glb has loaded.\n' +
    `export const LEG_RADII = {\n${ids.map((id) => `  ${id}: ${JSON.stringify(radii[id])},`).join('\n')}\n};\n`;
  if (process.argv.includes('--write')) { fs.writeFileSync(out, src); console.log(`wrote ${path.relative(root, out)} (${ids.length} people)`); }
  else {
    const { LEG_RADII } = await import(pathToFileURL(out).href);
    const bad = [...new Set([...ids, ...Object.keys(LEG_RADII)])].filter((id) => JSON.stringify(radii[id]) !== JSON.stringify(LEG_RADII[id]));
    if (bad.length) { console.log('legradii.js is stale for:', bad.join(', '), '- rerun with --write'); code = 1; } else console.log(`legradii.js matches people.glb (${ids.length} people)`);
  }
} finally { await browser.close(); if (server) server.kill(); }
process.exit(code);
