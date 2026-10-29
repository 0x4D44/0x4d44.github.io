#!/usr/bin/env node
// Texture factory (owner: A1, the only agent that runs Codex image generation).
//
//   node la-ladera/tools/nice.mjs --idle node la-ladera/tools/textures/build.mjs [--prio 1] [--only a,b] [--force] [--post-only] [--no-gen] [--dry] [--list]
//
// 1. Collects every material declared in js/*/matdefs.js (same merge order as core/matlib.js) that has a `desc`.
// 2. Skips the ones already generated (cache key = sha1 of name + prompt text; tools/textures/cache.json).
// 3. Generates a photographic swatch per material with Codex, ONE AT A TIME (house rule: no parallel Codex runs; memory-gated),
//    saved as .scratch/a1/tex/raw/<name>.png. Quiet box: low priority (tests/nice.mjs), every child is `windowsHide` with piped stdio
//    (never a numeric fd: libuv then skips CREATE_NO_WINDOW), headless only.
// 4. tools/textures/post.py crops, makes it seamless, neutralises lighting on tintable materials, downsizes, JPEG-encodes and derives
//    a normal map -> assets/textures/<name>.jpg / <name>_n.jpg.
// 5. Rewrites assets/textures/manifest.json (the schema core/matlib.js reads) and prints the payload size.
// Idempotent and re-runnable whenever other agents add materials: only new / changed ones are generated.
import '../../tests/nice.mjs';                       // FIRST: this process and every child it starts run at low priority (quiet box)
import { readdir, readFile, writeFile, mkdir, copyFile, rename, stat, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { existsSync, createWriteStream } from 'node:fs';
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
const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] == null || argv[i + 1].startsWith('--') ? true : argv[i + 1]); };
const maxPrio = +flag('prio', 3), jobs = 1, force = argv.includes('--force'), postOnly = argv.includes('--post-only');   // jobs is fixed at 1: no parallel Codex runs
if (+flag('jobs', 1) > 1) console.log('[tex] --jobs is capped at 1: Codex image jobs run one at a time');
const noGen = argv.includes('--no-gen') || postOnly, dry = argv.includes('--dry'), listOnly = argv.includes('--list');
const only = flag('only', null)?.split(',').filter(Boolean) ?? null;
const adopt = argv.includes('--adopt'), except = String(flag('except', '')).split(',').filter(Boolean);
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
  const args = ['timeout', '--stdin', base + '.prompt.txt', '600', 'codex', 'exec', '-C', REPO, '-m', 'gpt-6-luna', '-c', 'model_reasoning_effort=max',
    '-c', 'approval_policy=never', '-s', 'workspace-write', '--ephemeral', '--skip-git-repo-check', '--json', '-o', base + '.final.txt'];
  const t0 = Date.now();
  // Piped stdio, never numeric file descriptors: libuv adds CREATE_NO_WINDOW only when no stdio handle is inherited. The two pipes are
  // streamed into the log files, and both files are flushed and closed before anyone reads them.
  const ev = createWriteStream(base + '.events.jsonl'), er = createWriteStream(base + '.stderr.txt');
  const flushed = (s) => new Promise((done) => { if (s.closed) done(); else { s.once('close', done); s.once('error', done); } });
  const code = await new Promise((res) => {
    const p = spawn('deltic', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    p.stdout.pipe(ev); p.stderr.pipe(er);
    p.on('error', (e) => { log('spawn error', e.message); ev.end(); er.end(); res(-1); });
    p.on('close', (c) => res(c ?? -1));
  });
  await Promise.all([flushed(ev), flushed(er)]);
  return { code, secs: Math.round((Date.now() - t0) / 1000), final: base + '.final.txt', events: base + '.events.jsonl' };
}

/** The image THIS run generated: Codex keeps every thread's images in its own folder (the agent's own copy can grab a sibling's). */
async function threadImage(eventsFile) {
  let tid = null;
  try { tid = (await readFile(eventsFile, 'utf8')).match(/"thread_id"\s*:\s*"([^"]+)"/)?.[1] ?? null; } catch { /* no events */ }
  if (!tid) return null;
  const dir = join(CODEX_HOME, 'generated_images', tid);
  if (!existsSync(dir)) return null;
  const files = (await readdir(dir)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
  if (!files.length) return null;
  const withTime = await Promise.all(files.map(async (f) => ({ f, t: (await stat(join(dir, f))).mtimeMs })));
  withTime.sort((a, b) => b.t - a.t);
  return join(dir, withTime[0].f);
}
const md5 = async (f) => createHash('md5').update(await readFile(f)).digest('hex');
/** Name of another raw image with identical bytes, or null. */
async function duplicateOf(name) {
  const mine = await md5(join(RAW, `${name}.png`));
  for (const f of await readdir(RAW)) {
    if (!/^[^.]+\.png$/.test(f) || f === `${name}.png`) continue;
    if ((await md5(join(RAW, f))) === mine) return f.replace('.png', '');
  }
  return null;
}

async function generate(name, prompt, relRaw) {
  const rawAbs = join(REPO, relRaw);
  await mkdir(dirname(rawAbs), { recursive: true });
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (existsSync(rawAbs)) await rename(rawAbs, rawAbs.replace(/\.png$/, `.prev${Date.now() % 100000}.png`));
    const r = await runCodex(name, prompt, attempt);
    const img = await threadImage(r.events);
    if (img) await copyFile(img, rawAbs);                         // authoritative: this run's own thread folder
    else {                                                        // fallback: whatever the agent saved / reported
      try {
        const m = (await readFile(r.final, 'utf8')).match(/[A-Za-z]:[\\/][^\s`'"]+\.png/);
        if (!existsSync(rawAbs) && m && existsSync(m[0])) await copyFile(m[0], rawAbs);
      } catch { /* no final message */ }
    }
    if (existsSync(rawAbs) && (await stat(rawAbs)).size > 50000) {
      const dup = await duplicateOf(name);
      if (dup) { log(`DUPLICATE ${name} == ${dup} (attempt ${attempt}); retrying`); continue; }
      log(`generated ${name} in ${r.secs}s (exit ${r.code}${img ? ', thread image' : ', agent copy'})`);
      return true;
    }
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
  const rawKey = sha(name + '\n' + def.desc + '\n' + (rec.gen ?? ''));                    // regenerate the image only when this changes
  const { layout, cm, gen, ...postKnobs } = rec;
  const key = sha(rawKey + JSON.stringify(postKnobs) + (def.tile ?? ''));                  // re-post-process when the recipe changes
  const done = cache[name]?.key === key && existsSync(join(OUT, `${name}.${rec.alpha ? 'png' : 'jpg'}`));
  rows.push({ name, def, rec, prio, relRaw, prompt, key, rawKey, done, owner: owners[name] });
}
if (adopt) {                                                       // existing raw images become current for the new key scheme
  for (const r of rows) if (!except.includes(r.name) && existsSync(join(REPO, r.relRaw))) cache[r.name] = { ...cache[r.name], rawKey: r.rawKey };
  await writeFile(CACHE, JSON.stringify(cache, null, 1) + '\n'); log('adopted existing raw images except', except.join(',') || '(none)');
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
  const haveRaw = existsSync(rawAbs) && cache[r.name]?.rawKey === r.rawKey && !force;       // raw already generated for this exact prompt
  if (!noGen && !haveRaw) {
    if (!(await generate(r.name, r.prompt, r.relRaw))) return false;
    cache[r.name] = { ...cache[r.name], rawKey: r.rawKey }; await saveAll();
  } else if (!existsSync(rawAbs)) { log(`no raw image for ${r.name}`); return false; }
  const res = post(specFile, [r.name]);
  const o = res?.[r.name];
  if (!o) return false;
  manifest.textures[r.name] = o.manifest;
  cache[r.name] = { key: r.key, rawKey: r.rawKey, at: new Date().toISOString() };
  await saveAll();
  return true;
};

let next = 0, okCount = 0, failed = [];
const worker = async (k) => {
  if (!noGen && k) await delay(k * 25000);                         // stagger the parallel Codex starts
  for (;;) {
    const r = todo[next++]; if (!r) return;
    try { (await processOne(r)) ? okCount++ : failed.push(r.name); } catch (e) { log('ERROR', r.name, e.message); failed.push(r.name); }
  }
};
await Promise.all(Array.from({ length: Math.min(noGen ? 1 : jobs, Math.max(1, todo.length)) }, (_, k) => worker(k)));

// ---- 5. report ---------------------------------------------------------------------------------------------------------------
await saveAll();
let total = 0;
for (const f of await readdir(OUT)) { if (/\.(jpe?g|png)$/i.test(f)) total += (await stat(join(OUT, f))).size; }
let gpu = 0;
for (const t of Object.values(manifest.textures)) for (const k of ['map', 'normal']) { if (t[k]) gpu += ((k === 'map' ? (t.size ?? 512) : Math.min(t.size ?? 512, 512)) ** 2) * 4 * 1.34; }
log(`GPU estimate (mipmapped RGBA8): ${(gpu / 1048576).toFixed(0)} MB of ~220 MB`);
log(`done: ${okCount} ok, ${failed.length} failed${failed.length ? ' (' + failed.join(', ') + ')' : ''}; payload ${(total / 1048576).toFixed(2)} MB of 24 MB; ${Object.keys(manifest.textures).length} textures in manifest`);
const missing = Object.entries(defs).filter(([n, d]) => d.desc && d.tex !== false && !manifest.textures[typeof d.tex === 'string' ? d.tex : n]).map(([n]) => n);
if (missing.length) log(`still without texture (${missing.length}): ${missing.join(', ')}`);
process.exit(failed.length ? 1 : 0);
