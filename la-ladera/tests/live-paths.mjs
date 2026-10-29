// Runtime half of tests/live-paths.test.mjs (lead tool): boot the page in the quiet headless harness, walk it a little (enter two buildings, change the
// hour, visit three districts) and check that every URL the page REQUESTED exists on disk with EXACTLY that letter case. This machine is Windows (case
// blind); GitHub Pages is Linux (case sensitive), so a request for Textures/Brick.jpg works here and 404s live. Catches what the source scan cannot
// see: paths built at run time, textures named inside a GLB, fonts, workers' siblings.
//   node la-ladera/tests/live-paths.mjs        exit 1 on any request whose path is not exact-case on disk (or any 404)
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './chrome.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const exact = (abs) => {
  let dir = REPO;
  for (const part of relative(REPO, abs).split(sep)) {
    if (!part || part === '..') return false;
    let names; try { names = readdirSync(dir); } catch { return false; }
    if (!names.includes(part)) return false;
    dir = join(dir, part);
  }
  try { return statSync(abs).isFile(); } catch { return false; }
};

const b = await launch({ width: 1280, height: 720 });
let bad = [], total = 0, net = [];
try {
  const p = await b.open('la-ladera/index.html?autostart&manual');
  const state = await p.eval('JSON.stringify(__ladera.buildings().slice(0, 2).map((x) => x.id))');
  for (const id of JSON.parse(state)) await p.eval(`__ladera.enter(${JSON.stringify(id)}); __ladera.step(30); 0`);
  await p.eval('__ladera.setHour(21); __ladera.teleport(0, 20, { yaw: 0 }); __ladera.step(30); __ladera.teleport(30, -40, { yaw: 3 }); __ladera.step(30); 0');
  // --selftest: the page asks for a path in the wrong case; this (case-blind) server answers it, and the tool MUST flag it and exit 1.
  if (process.argv.includes('--selftest')) await p.eval("fetch('/la-ladera/Assets/textures/asphalt.jpg').then((r) => r.status)");
  await new Promise((r) => setTimeout(r, 1500));
  const origin = b.baseUrl;
  const seen = new Set();
  for (const u of p.reqs.values()) {
    if (!u.startsWith(origin) || seen.has(u)) continue;
    seen.add(u); total++;
    const path = decodeURIComponent(new URL(u).pathname);
    if (path.endsWith('/')) continue;                                          // a directory request: the server maps it to index.html
    if (!exact(join(REPO, path))) bad.push(path);
  }
  net = p.summary().netErrors;
} finally { await b.close(); }
console.log(`requests checked: ${total}, wrong-case or missing: ${bad.length}, 404/failed: ${net.length}`);
for (const x of bad.slice(0, 30)) console.log('  NOT EXACT-CASE ON DISK:', x);
for (const x of net.slice(0, 10)) console.log('  NET:', x);
process.exit(bad.length || net.length ? 1 : 0);
