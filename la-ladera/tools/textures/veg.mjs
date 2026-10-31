#!/usr/bin/env node
// Vegetation textures for A5 (owner: A1): bark_eucalyptus, bark_dark, trunk_banana, foliage_cards. Same Codex path as build.mjs (one job at a time, memory-gated, low priority,
// windowless), but the swatches are NOT square and one of them is a sheet with alpha, so they have their own post step (veg_post.py) and manifest entries.
//
//   node la-ladera/tools/textures/veg.mjs [--only bark_eucalyptus,foliage_cards] [--post-only] [--force]
//
//   bark_eucalyptus  512 x 1024  tileable both ways (the trunk wraps once across the width, repeats down the height)
//   bark_dark        512 x 512   tileable both ways
//   trunk_banana     256 x 512   tileable both ways
//   foliage_cards    2048 x 1024 RGBA png, 4 x 2 cells of 512 x 512, one leaf group per cell with its base at the bottom centre (order in CELLS below)
import '../../tests/nice.mjs';
import { mkdir, writeFile, readFile, readdir, stat, copyFile, rename } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { memGate } from '../../tests/memgate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '..', '..'), REPO = resolve(ROOT, '..');
const RAW = join(REPO, '.scratch', 'a1', 'tex', 'raw'), RUNS = join(REPO, '.scratch', 'a1', 'tex', 'runs'), OUT = join(ROOT, 'assets', 'textures');
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex'), PY = process.env.LADERA_PYTHON || 'python';
const argv = process.argv.slice(2), flag = (n) => { const i = argv.indexOf('--' + n); return i < 0 ? null : (argv[i + 1] ?? true); };
const only = flag('only')?.split(',').filter(Boolean) ?? null, postOnly = argv.includes('--post-only'), force = argv.includes('--force');
const log = (...a) => console.log(`[veg ${new Date().toTimeString().slice(0, 8)}]`, ...a);

const LIGHT = 'Flat, even, shadowless diffuse light (overcast), albedo-like with no strong highlights and no cast shadows; no vignette, no lens blur, no horizon, no objects, no text, no watermark, no border. Photographic realism with fine natural detail, like a high-end PBR texture scan.';
const TILE = 'The image must tile: its top edge continues into its bottom edge and its left edge into its right edge, with the features spread evenly over the whole frame, nothing concentrated against one edge.';
export const CELLS = ['eucalyptus', 'cypress', 'banana leaf', 'agave', 'broadleaf almendro', 'bougainvillea', 'flower bed', 'wildflower tuft'];
const SPECS = {
  bark_eucalyptus: { w: 512, h: 1024, tile: true, prompt: `a seamless, tileable texture swatch, portrait orientation (taller than wide, 1 to 2), photographed straight-on (strictly orthographic), of eucalyptus gum-tree trunk bark: smooth pale grey-cream bark with long curled peeling strips, patches of tan, rust-red and warm brown where old bark has shed, faint vertical fibres and a few small dark scars. ${TILE} ${LIGHT}` },
  bark_dark: { w: 512, h: 512, tile: true, prompt: `a seamless, tileable square texture swatch, photographed straight-on (strictly orthographic), of dark brown fibrous tree bark (cypress, palm and broadleaf trunks): long stringy vertical ridges and furrows, matted reddish-brown fibres, a few small knots, deep shadow-brown in the furrows. ${TILE} ${LIGHT}` },
  trunk_banana: { w: 256, h: 512, tile: true, prompt: `a seamless, tileable texture swatch, portrait orientation (taller than wide, 1 to 2), photographed straight-on (strictly orthographic), of a banana plant pseudostem: layered green-to-beige leaf sheaths with long dark brown dry streaks, smooth waxy surface, faint horizontal leaf-scar rings and fine vertical fibres. ${TILE} ${LIGHT}` },
  foliage_cards: { w: 2048, h: 1024, alpha: true, prompt: `a botanical sprite sheet: EIGHT separate plant groups on a pure flat black background (#000000, no gradient, no vignette, no glow, no ground, no shadow, no pot, no text, no labels, no grid lines), arranged in a clean grid of 4 columns by 2 rows with wide empty black space between and around every group, each group fully inside its own cell, none touching or overlapping another, the base of each plant at the bottom centre of its cell. Reading order, top row left to right then bottom row left to right: 1 eucalyptus drooping sickle-shaped leaf spray on a thin twig (blue-green, paler underneath); 2 cypress frond (dark green scale foliage spray); 3 banana leaf (one wide blade with a midrib and torn side strips, bright green with a few brown tears); 4 agave (blue-grey spiked blades in side view, one rosette); 5 broadleaf almendro leaf spray (large oval leaves, warm green with a few red ones); 6 bougainvillea (small green leaves with magenta bracts on a vine spray); 7 flower-bed clump (marigold and geranium: orange, red and yellow flower heads on green leaves); 8 wildflower tuft (yellow, white and violet flowers among grass blades). Each group is a sharp, photorealistic cut-out seen from the side in flat even light, high resolution, crisp clean edges against the black.` },
};

async function runCodex(name, prompt, attempt) {
  await mkdir(RUNS, { recursive: true });
  const base = join(RUNS, `veg_${name}.${attempt}`), relRaw = `.scratch/a1/tex/raw/veg_${name}.png`;
  await writeFile(base + '.prompt.txt', `Use your built-in image generation tool to create ONE image, then save it into this workspace.\n\nImage to generate: ${prompt}\n\nAfter the image is generated, copy the resulting file to this exact path (relative to the workspace root): ${relRaw}\nThen reply with one short line giving the original path where the image tool saved it. Do nothing else.\n`);
  await memGate(6, 300, (m) => log(m));
  const args = ['timeout', '--stdin', base + '.prompt.txt', '600', 'codex', 'exec', '-C', REPO, '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort=max', '-c', 'approval_policy=never', '-s', 'workspace-write', '--ephemeral', '--skip-git-repo-check', '--json', '-o', base + '.final.txt'];
  const t0 = Date.now(), ev = createWriteStream(base + '.events.jsonl'), er = createWriteStream(base + '.stderr.txt');
  const flushed = (s) => new Promise((done) => { if (s.closed) done(); else { s.once('close', done); s.once('error', done); } });
  const code = await new Promise((res) => { const p = spawn('deltic', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); p.stdout.pipe(ev); p.stderr.pipe(er); p.on('error', () => { ev.end(); er.end(); res(-1); }); p.on('close', (c) => res(c ?? -1)); });
  await Promise.all([flushed(ev), flushed(er)]);
  return { code, secs: Math.round((Date.now() - t0) / 1000), events: base + '.events.jsonl' };
}
async function threadImage(eventsFile) {
  let tid = null; try { tid = (await readFile(eventsFile, 'utf8')).match(/"thread_id"\s*:\s*"([^"]+)"/)?.[1] ?? null; } catch { /* none */ }
  const dir = tid && join(CODEX_HOME, 'generated_images', tid); if (!dir || !existsSync(dir)) return null;
  const files = (await readdir(dir)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)); if (!files.length) return null;
  const t = await Promise.all(files.map(async (f) => ({ f, t: (await stat(join(dir, f))).mtimeMs }))); t.sort((a, b) => b.t - a.t);
  return join(dir, t[0].f);
}
async function generate(name) {
  const rawAbs = join(RAW, `veg_${name}.png`); await mkdir(RAW, { recursive: true });
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (existsSync(rawAbs)) await rename(rawAbs, rawAbs.replace(/\.png$/, `.prev${Date.now() % 100000}.png`));
    const r = await runCodex(name, SPECS[name].prompt, attempt), img = await threadImage(r.events);
    if (img) await copyFile(img, rawAbs);
    if (existsSync(rawAbs) && (await stat(rawAbs)).size > 50000) { log(`generated ${name} in ${r.secs}s (exit ${r.code})`); return true; }
    log(`FAILED ${name} attempt ${attempt} (exit ${r.code}, ${r.secs}s)`);
  }
  return false;
}
function post(name) {
  const r = spawnSync(PY, [join(HERE, 'veg_post.py'), name, join(RAW, `veg_${name}.png`), OUT, JSON.stringify(SPECS[name].alpha ? { alpha: true, w: SPECS[name].w, h: SPECS[name].h, cells: CELLS } : { w: SPECS[name].w, h: SPECS[name].h })], { encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26 });
  for (const l of (r.stdout ?? '').split('\n').filter(Boolean)) log('post:', l);
  if (r.status !== 0) { log('post FAILED', r.status, (r.stderr ?? '').slice(-1200)); return false; }
  return true;
}

const names = (only ?? Object.keys(SPECS)).filter((n) => SPECS[n]);
let ok = 0;
for (const n of names) {
  if (!postOnly && (force || !existsSync(join(RAW, `veg_${n}.png`)))) { if (!(await generate(n))) continue; }
  if (!existsSync(join(RAW, `veg_${n}.png`))) { log(`no raw image for ${n}`); continue; }
  if (post(n)) ok++;
}
log(`done: ${ok} of ${names.length} ok`);
process.exit(ok === names.length ? 0 : 1);
