// Boot orchestrator. Runs the world-building stages in order; every stage is isolated (a throwing module is
// logged in ctx.errors and the rest still loads), timed, and yields to the loading screen.
// URL flags: ?autostart (skip title + pointer lock)  ?manual (no rAF; drive with __ladera.step/render)
//            ?debug  ?hour=17.2  ?seed=N  ?lots=L00,L02 (only these lots)  ?skip=props,people,furnish,interiors,world
//            ?preserve (preserveDrawingBuffer)  ?dpr=1  ?shadows=0  ?aa=0
import { createContext } from './core/ctx.js';
import { initEngine, startEngine } from './engine/index.js';
import { generatePlan } from './world/plan.js';
import { buildWorld } from './world/terrain.js';
import { buildProps } from './world/props.js';
import { planBuilding, buildBuilding } from './arch/index.js';
import { loadInteriorAssets, furnishBuilding, buildInterior } from './interiors/index.js';
import { loadPeople, spawnPeople } from './people/index.js';

const q = new URLSearchParams(location.search);
const num = (k) => (q.has(k) ? +q.get(k) : undefined);
const opts = {
  seed: num('seed'), hour: num('hour'), dpr: num('dpr'),
  debug: q.has('debug'), autostart: q.has('autostart'), manual: q.has('manual'), preserve: q.has('preserve'),
  shadows: q.get('shadows') !== '0', aa: q.get('aa') !== '0',
  lots: q.get('lots')?.split(',').filter(Boolean) ?? null,
  skip: new Set((q.get('skip') ?? '').split(',').filter(Boolean)),
};

const $ = (id) => document.getElementById(id);
const STAGES = ['engine', 'materials', 'assets', 'plan', 'world', 'arch', 'furnish', 'colliders', 'build', 'props', 'flush', 'people', 'start'];

async function boot() {
  const ctx = createContext(opts);
  window.__ladera = window.__ladera ?? {}; window.__ladera.ctx = ctx;
  let done = 0;
  const progress = (name, sub) => {
    const bar = $('loadbar')?.firstElementChild; if (bar) bar.style.width = `${Math.round(((done + (sub ?? 0)) / STAGES.length) * 100)}%`;
    const msg = $('loadmsg'); if (msg) msg.textContent = name;
  };
  ctx.progress = (sub, label) => progress(label ?? ctx.stage, sub);

  const stage = async (name, fn) => {
    if (opts.skip.has(name)) { done++; return; }
    ctx.stage = name; progress(name); const t0 = performance.now();
    try { await fn(); } catch (e) {
      console.error(`[stage ${name}]`, e);
      ctx.errors.push({ stage: name, message: String(e?.message ?? e), stack: e?.stack });
    }
    ctx.timings[name] = Math.round(performance.now() - t0); done++;
    ctx.events.emit('stage', { name, ms: ctx.timings[name] });
    await ctx.yield();
  };
  /** Run fn(item, i) for every item, yielding between items so the page stays alive. */
  const each = async (items, fn, label) => {
    for (let i = 0; i < items.length; i++) {
      try { await fn(items[i], i); } catch (e) {
        console.error(`[${label} ${items[i]?.id ?? i}]`, e);
        ctx.errors.push({ stage: ctx.stage, item: items[i]?.id ?? i, message: String(e?.message ?? e), stack: e?.stack });
      }
      progress(ctx.stage, (i + 1) / items.length);
      await ctx.yield();
    }
  };

  await stage('engine', () => initEngine(ctx));
  await stage('materials', () => ctx.matlib.init());
  await stage('assets', () => ctx.assets.init());
  await stage('plan', () => {
    ctx.plan = generatePlan(ctx);
    ctx.physics.setTerrain(ctx.plan.heightAt);
    if (opts.lots) ctx.plan.lots = ctx.plan.lots.filter((l) => opts.lots.includes(l.id));
  });
  await stage('world', () => buildWorld(ctx));
  await stage('arch', () => each(ctx.plan?.lots ?? [], (lot) => { ctx.buildings.set(lot.id, planBuilding(ctx, lot)); }, 'planBuilding'));
  await stage('furnish', async () => {
    await loadInteriorAssets(ctx);
    await each([...ctx.buildings.values()], (bp) => furnishBuilding(ctx, bp), 'furnishBuilding');
  });
  await stage('colliders', () => { for (const bp of ctx.buildings.values()) ctx.physics.add(bp.colliders ?? {}); });
  await stage('build', () => each([...ctx.buildings.values()], (bp) => {
    buildBuilding(ctx, bp);
    if (!opts.skip.has('interiors')) buildInterior(ctx, bp);
  }, 'buildBuilding'));
  await stage('props', () => buildProps(ctx));
  await stage('flush', () => ctx.batch.flushAll());
  await stage('people', async () => { await loadPeople(ctx); spawnPeople(ctx); });
  await stage('start', () => startEngine(ctx));
  progress('listo');
  ctx.booted = true;
  window.__ladera.bootDone = true;
  return ctx;
}

function showFatal(e) {
  console.error(e);
  const f = $('fatal'); if (f) { f.classList.remove('hidden'); f.querySelector('pre').textContent = String(e?.stack ?? e); }
}

window.__ladera = window.__ladera ?? {};
window.__ladera.ready = boot().then((ctx) => {
  const btn = $('start'), title = $('title');
  const begin = () => {
    title.classList.add('hidden'); ctx.running = true;
    if (!opts.autostart) $('gl').requestPointerLock?.();
  };
  const pause = () => { if (!ctx.running || opts.autostart) return; ctx.running = false; title.classList.remove('hidden'); btn.textContent = 'Continuar'; };
  if (opts.autostart) { title.classList.add('hidden'); ctx.running = true; }
  else {
    btn.disabled = false; btn.textContent = 'Entrar al barrio'; btn.addEventListener('click', begin);
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== $('gl')) pause(); });
    ctx.running = false;
  }
  if (ctx.errors.length) { const m = $('loadmsg'); if (m) m.textContent = `${ctx.errors.length} module error(s) - see console`; }
  return ctx;
}).catch((e) => { showFatal(e); throw e; });
