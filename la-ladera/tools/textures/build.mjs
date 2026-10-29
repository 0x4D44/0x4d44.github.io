#!/usr/bin/env node
// Texture factory (owner: A1, the only agent that runs Codex image generation).
//
//   node la-ladera/tools/textures/build.mjs [--prio 1] [--only a,b] [--force] [--jobs 3] [--post-only] [--no-gen] [--dry] [--list]
//
// 1. Collects every material declared in js/*/matdefs.js (same merge order as core/matlib.js) that has a `desc`.
// 2. Skips the ones already generated (cache key = sha1 of name + prompt text; tools/textures/cache.json).
// 3. Generates a photographic swatch per material with Codex (<= 3 jobs in parallel, memory-gated),
//    saved as .scratch/a1/tex/raw/<name>.png.
// 4. tools/textures/post.py crops, makes it seamless, neutralises lighting on tintable materials, downsizes, JPEG-encodes and derives
//    a normal map -> assets/textures/<name>.jpg / <name>_n.jpg.
// 5. Rewrites assets/textures/manifest.json (the schema core/matlib.js reads) and prints the payload size.
// Idempotent and re-runnable whenever other agents add materials: only new / changed ones are generated.
import { readdir, readFile, writeFile, mkdir, copyFile, rename, stat, rm } from 'node:fs/promises';
import { existsSync, openSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { memGate } from '../../tests/memgate.mjs';
import { RECIPES, DEFAULTS, heuristics } from './recipes.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');            // la-ladera/
const REPO = resolve(ROOT, '..');                  // worktree root (Codex workspace)
const SCR = join(REPO, '.scratch', 'a1', 'tex');
const RAW = join(SCR, 'raw'), RUNS = join(SCR, 'runs');
const OUT = join(ROOT, 'assets', 'textures');
const CACHE = join(HERE, 'cache.json');
const PY = process.env.LADERA_PYTHON || 'python';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] == null || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const maxPrio = +flag('prio', 3), jobs = +flag('jobs', 3), force = argv.includes('--force'), postOnly = argv.includes('--post-only');
const noGen = argv.includes('--no-gen') || postOnly, dry = argv.includes('--dry'), listOnly = argv.includes('--list');
const only = flag('only', null)?.split(',').filter(Boolean) ?? null;
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const log = (...a) => console.log(`[tex ${new Date().toTimeString().slice(0, 8)}]`, ...a);

// ---- 1. collect definitions ---------------------------------------------------------------------------------------------
async function collectDefs() {
  const dirs = (await readdir(join(ROOT, 'js'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  const order = ['engine', 'world', 'arch', 'interiors', 'people'];             // = core/matlib.js merge order (later wins)
  const names = [...order.filter((o) => dirs.includes(o)), ...dirs.filter((d) => !order.includes(d)).sort()];
  const defs = {}, owners = {};
  for (const d of names) {
    const f = join(ROOT, 'js', d, 'matdefs.js');
    if (!existsSync(f)) continue;
    try {
      const mod = await import(pathToFileURL(f).href + '?t=' + Date.now());
      for (const [k, v] of Object.entries(mod.default ?? {})) {
        const prev = defs[k], pp = prev?.prio ?? (prev?.desc ? 2 : 9), np = v.prio ?? (v.desc ? 2 : 9);
        // the last declaration wins (as at runtime), but the most urgent prio across all declarations is kept
        defs[k] = { ...(prev && !v.desc ? prev : {}), ...v };
        if (prev?.desc && v.desc) defs[k].prio = Math.min(pp, np);
        owners[k] = d;
      }
    } catch (e) { log('WARN cannot read', f, e.message); }
  }
  return { defs, owners };
}

// ---- 2. prompt + recipe -----------------------------------------------------------------------------------------------------
function recipeFor(name, def) {
  return { ...DEFAULTS, ...heuristics(name, def), ...(RECIPES[name] ?? {}) };
}
function promptFor(name, def, rec, relRaw) {
  const cm = Math.round((rec.cm ?? (def.tile ?? 1.5) * 100));
  const decal = rec.mode === 'none';
  const head = decal
    ? `a single flat image, photographed straight-on (orthographic, no perspective), of: ${def.desc}.`
    : `a seamless, tileable, square texture swatch, photographed straight-on (strictly orthographic, no perspective), of: ${def.desc}.`;
  const scale = decal ? '' : ` Real-world scale: the frame covers about ${cm} cm x ${cm} cm of the surface.`;
  const light = decal
    ? ' Even diffuse lighting, no vignette, no lens blur. Photographic realism with fine natural detail.'
    : ' Lighting: flat, even, shadowless diffuse light (like an overcast day or a lightbox), albedo-like with no strong highlights and no cast shadows; no vignette, no lens blur, no horizon, no objects, no text, no watermark, no border. Photographic realism with fine natural detail, like a high-end PBR texture scan. Edges must continue naturally so the image tiles without visible seams.';
  const alpha = rec.alpha ? ' Use a fully transparent background around the subject.' : '';
  return `Use your built-in image generation tool to create ONE texture image, then save it into this workspace.\n\nImage to generate: ${head}${scale} ${rec.layout ?? ''}${light}${alpha}\n\nAfter the image is generated, copy the resulting file to this exact path (relative to the workspace root): ${relRaw}\nThen reply with one short line giving the original path where the image tool saved it. Do nothing else.\n`;
}

// ---- 3. Codex job ------------------------------------------------------------------------------------------------------------
async function runCodex(name, prompt, attempt) {
  await mkdir(RUNS, { recursive: true });
  const base = join(RUNS, `${name}.${attempt}`);
  await writeFile(base + '.prompt.txt', prompt);
  await memGate(6, 300, (m) => log(m));
  const ev = openSync(base + '.events.jsonl', 'w'), er = openSync(base + '.stderr.txt', 'w');
  const args = ['timeout', '--stdin', base + '.prompt.txt', '600', 'codex', 'exec', '-C', REPO, '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort=max',
    '-c', 'approval_policy=never', '-s', 'workspace-write', '--ephemeral', '--skip-git-repo-check', '--json', '-o', base + '.final.txt'];
  const t0 = Date.now();
  const code = await new Promise((res) => {
    const p = spawn('deltic', args, { stdio: ['ignore', ev, er], windowsHide: true });
    p.on('error', (e) => { log('spawn error', e.message); res(-1); });
    p.on('exit', (c) => res(c ?? -1));
  });
  closeSync(ev); closeSync(er);
  return { code, secs: Math.round((Date.now() - t0) / 1000), final: base + '.final.txt' };
}

async function generate(name, prompt, relRaw) {
  const rawAbs = join(REPO, relRaw);
  await mkdir(dirname(rawAbs), { recursive: true });
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (existsSync(rawAbs)) await rename(rawAbs, rawAbs.replace(/\.png$/, `.prev${Date.now() % 100000}.png`));
    const r = await runCodex(name, prompt, attempt);
    if (existsSync(rawAbs) && (await stat(rawAbs)).size > 50000) { log(`generated ${name} in ${r.secs}s (exit ${r.code})`); return true; }
    // Fallback: the agent may have saved elsewhere; take the path it reports.
    try {
      const txt = await readFile(r.final, 'utf8');
      const m = txt.match(/[A-Za-z]:[\\/][^\s`'"]+\.png/);
      if (m && existsSync(m[0])) { await copyFile(m[0], rawAbs); log(`generated ${name} (recovered from ${m[0]})`); return true; }
    } catch { /* no final message */ }
    log(`FAILED ${name} attempt ${attempt} (exit ${r.code}, ${r.secs}s)`);
  }
  return false;
}

// ---- 4. post -----------------------------------------------------------------------------------------------------------------
function post(specFile, names) {
  const r = spawnSync(PY, [join(HERE, 'post.py'), '--spec', specFile, '--raw', RAW, '--out', OUT, '--names', names.join(',')], { encoding: 'utf8', maxBuffer: 1 << 26, cwd: HERE, windowsHide: true });
  if (r.stdout) for (const l of r.stdout.split('\n').filter(Boolean)) log('post:', l);
  if (r.status !== 0) { log('post.py FAILED', r.status, (r.stderr ?? '').slice(-1500)); return null; }
  const res = {};
  for (const l of (r.stdout ?? '').split('\n')) { if (l.startsWith('RESULT ')) { const o = JSON.parse(l.slice(7)); res[o.name] = o; } }
  return res;
}

// ---- main --------------------------------------------------------------------------------------------------------------------
const { defs, owners } = await collectDefs();
const cache = existsSync(CACHE) ? JSON.parse(await readFile(CACHE, 'utf8')) : {};
const rows = [];
for (const [name, def] of Object.entries(defs)) {
  if (!def.desc || def.tex === false || (typeof def.tex === 'string' && def.tex !== name)) continue;
  if (only && !only.includes(name)) continue;
  const prio = def.prio ?? 2;
  if (prio > maxPrio && !only) continue;
  const rec = recipeFor(name, def), relRaw = `.scratch/a1/tex/raw/${name}.png`;
  const prompt = promptFor(name, def, rec, relRaw);
  const key = sha(name + '\n' + prompt);
  const done = cache[name]?.key === key && existsSync(join(OUT, `${name}.${rec.alpha ? 'png' : 'jpg'}`));
  rows.push({ name, def, rec, prio, relRaw, prompt, key, done, owner: owners[name] });
}
rows.sort((a, b) => a.prio - b.prio || a.name.localeCompare(b.name));
const todo = rows.filter((r) => force || !r.done);
log(`${Object.keys(defs).length} materials declared, ${rows.length} with desc (prio<=${maxPrio}), ${todo.length} to ${postOnly ? 'post-process' : 'generate'}`);
if (listOnly || dry) { for (const r of rows) console.log(`${r.done ? 'ok  ' : 'todo'} p${r.prio} ${r.name.padEnd(24)} ${r.owner}`); if (dry) console.log('\n' + (todo[0]?.prompt ?? '')); process.exit(0); }

await mkdir(OUT, { recursive: true }); await mkdir(RAW, { recursive: true });
const specFile = join(SCR, 'spec.json');
await mkdir(SCR, { recursive: true });
await writeFile(specFile, JSON.stringify(Object.fromEntries(rows.map((r) => [r.name, { ...r.rec, tile: r.def.tile ?? null, uv: r.def.uv ?? null }])), null, 1));

const manifestPath = join(OUT, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : { textures: {} };
manifest.textures ??= {};
const saveAll = async () => {
  manifest.version = 2; manifest.generated = new Date().toISOString();
  await writeFile(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
  await writeFile(CACHE, JSON.stringify(cache, null, 1) + '\n');
};

const processOne = async (r) => {
  const rawAbs = join(REPO, r.relRaw);
  const haveRaw = existsSync(rawAbs) && cache[r.name]?.rawKey === r.key && !force;       // raw already generated for this exact prompt
  if (!noGen && !haveRaw) {
    if (!(await generate(r.name, r.prompt, r.relRaw))) return false;
    cache[r.name] = { ...cache[r.name], rawKey: r.key }; await saveAll();
  } else if (!existsSync(rawAbs)) { log(`no raw image for ${r.name}`); return false; }
  const res = post(specFile, [r.name]);
  const o = res?.[r.name];
  if (!o) return false;
  manifest.textures[r.name] = o.manifest;
  cache[r.name] = { key: r.key, rawKey: r.key, at: new Date().toISOString() };
  await saveAll();
  return true;
};

let next = 0, okCount = 0, failed = [];
const worker = async () => {
  for (;;) {
    const r = todo[next++]; if (!r) return;
    try { (await processOne(r)) ? okCount++ : failed.push(r.name); } catch (e) { log('ERROR', r.name, e.message); failed.push(r.name); }
  }
};
await Promise.all(Array.from({ length: Math.min(noGen ? 1 : jobs, Math.max(1, todo.length)) }, worker));

// ---- 5. report ---------------------------------------------------------------------------------------------------------------
await saveAll();
let total = 0;
for (const f of await readdir(OUT)) { if (/\.(jpe?g|png)$/i.test(f)) total += (await stat(join(OUT, f))).size; }
log(`done: ${okCount} ok, ${failed.length} failed${failed.length ? ' (' + failed.join(', ') + ')' : ''}; payload ${(total / 1048576).toFixed(2)} MB of 24 MB; ${Object.keys(manifest.textures).length} textures in manifest`);
const missing = Object.entries(defs).filter(([n, d]) => d.desc && d.tex !== false && !manifest.textures[typeof d.tex === 'string' ? d.tex : n]).map(([n]) => n);
if (missing.length) log(`still without texture (${missing.length}): ${missing.join(', ')}`);
process.exit(failed.length ? 1 : 0);
