// Boot orchestrator (owner: A1). Runs the world-building stages in order; every stage is isolated (a throwing module is
// logged in ctx.errors and the rest still loads), timed, and yields to the loading screen.
// URL flags: ?autostart (skip title + pointer lock)  ?manual (no rAF; drive with __ladera.step/render)
//            ?debug  ?hour=17.2  ?seed=N  ?lots=L00,L02 (only these lots)  ?skip=props,people,furnish,interiors,world
//            ?preserve (preserveDrawingBuffer)  ?dpr=1  ?shadows=0  ?aa=0  ?post=0 (no bloom/grade: emergency look)
//            ?quality=low|medium|high|auto  ?timescale=N (game minutes per real second; 0 freezes the clock)
//            ?skip=merge (keep one mesh per group x material: debugging only)  ?mergespan=N (largest merged chunk in metres, default 96)
import { createContext } from './core/ctx.js';
import { initEngine, startEngine } from './engine/index.js';
import { createSettings } from './engine/settings.js';
import { installUI, createFlow } from './ui/index.js';
import { initAudio } from './audio/index.js';
import { generatePlan } from './world/plan.js';
import { buildWorld } from './world/terrain.js';
import { buildProps } from './world/props.js';
import { planBuilding, buildBuilding } from './arch/index.js';
import { loadInteriorAssets, furnishBuilding, buildInterior } from './interiors/index.js';
import { loadPeople, spawnPeople } from './people/index.js';

const q = new URLSearchParams(location.search);
const num = (k) => (q.has(k) && q.get(k) !== '' && Number.isFinite(+q.get(k)) ? +q.get(k) : undefined);
const opts = {
  seed: num('seed'), hour: num('hour'), dpr: num('dpr'), timescale: num('timescale'), mergeSpan: num('mergespan'),
  quality: ['auto', 'low', 'medium', 'high'].includes(q.get('quality')) ? q.get('quality') : undefined,
  debug: q.has('debug'), autostart: q.has('autostart'), manual: q.has('manual'), preserve: q.has('preserve'),
  shadows: q.get('shadows') !== '0', aa: q.get('aa') !== '0', post: q.get('post') !== '0', rdb: q.get('rdb') !== '0',
  lots: q.get('lots')?.split(',').filter(Boolean) ?? null,
  skip: new Set((q.get('skip') ?? '').split(',').filter(Boolean)),
};

const $ = (id) => document.getElementById(id);
// [stage, relative weight of the loading bar, what the title card says while it runs]
const STAGES = [
  ['engine', 3, 'Encendiendo la luz…'], ['materials', 6, 'Mezclando pinturas y materiales…'], ['assets', 8, 'Trayendo muebles y vecinos…'],
  ['plan', 6, 'Trazando calles y escaleras…'], ['world', 10, 'Levantando el cerro…'], ['arch', 6, 'Pensando cada casa…'],
  ['furnish', 7, 'Amueblando los cuartos…'], ['colliders', 3, 'Poniendo las paredes en su sitio…'], ['build', 28, 'Construyendo casas y tiendas…'],
  ['props', 8, 'Plantando árboles y postes…'], ['flush', 8, 'Juntándolo todo…'], ['people', 10, 'Despertando a los vecinos…'], ['start', 3, 'Casi listo…'],
];
const TOTAL = STAGES.reduce((a, s) => a + s[1], 0);
const HINTS = [
  'Todas las puertas se abren. Entra a las tiendas, a las casas y sube a las terrazas.',
  'Saluda a los vecinos con la tecla E: tienen rutinas y cuentan cosas del barrio.',
  'Las escaleras y los pasajes llevan a patios escondidos, murales y miradores.',
  'Pulsa M para ver el mapa y J para abrir tu diario de descubrimientos.',
  'En Ajustes puedes cambiar la hora: la tarde dorada, la noche con las ventanas encendidas.',
  'Si los fotogramas caen, la calidad gráfica baja sola. También puedes fijarla en Ajustes.',
];

function hasWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}
class NoGL extends Error {}

function showNoGL() {
  $('title')?.classList.add('hidden'); $('nogl')?.classList.remove('hidden');
}
function showFatal(e) {
  console.error(e);
  const f = $('fatal'); if (f) { f.classList.remove('hidden'); f.querySelector('pre').textContent = String(e?.stack ?? e); }
}

async function boot() {
  const ctx = createContext(opts);
  const api = window.__ladera = window.__ladera ?? {}; api.ctx = ctx;
  window.addEventListener('error', (e) => ctx.errors.push({ stage: 'window', message: String(e.message), at: `${e.filename}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => ctx.errors.push({ stage: 'promise', message: String(e.reason?.message ?? e.reason) }));

  // settings + HUD + the title / pause / panel flow exist before anything heavy, so the card is alive while the world builds
  ctx.settings = createSettings(ctx);
  installUI(ctx);
  const flow = createFlow(ctx);
  initAudio(ctx);

  let acc = 0, hint = 0;
  const bar = $('loadbar'), fill = bar?.firstElementChild, msg = $('loadmsg'), hintEl = $('loadhint');
  const setBar = (frac) => { const p = Math.max(0, Math.min(1, frac)); if (fill) fill.style.width = `${Math.round(p * 100)}%`; bar?.setAttribute('aria-valuenow', String(Math.round(p * 100))); };
  const progress = (label, sub = 0, w = 0) => { setBar((acc + sub * w) / TOTAL); if (msg && label) msg.textContent = label; };
  const nextHint = () => { if (hintEl) hintEl.textContent = HINTS[hint++ % HINTS.length]; };
  nextHint(); const hintTimer = setInterval(nextHint, 4200);
  let cur = STAGES[0];
  ctx.progress = (sub, label) => progress(label ?? cur[2], sub, cur[1]);

  const stage = async (name, fn) => {
    cur = STAGES.find((s) => s[0] === name) ?? [name, 1, name];
    if (opts.skip.has(name)) { acc += cur[1]; return; }
    ctx.stage = name; progress(cur[2], 0, cur[1]); const t0 = performance.now();
    try { await fn(); } catch (e) {
      if (e instanceof NoGL) throw e;
      console.error(`[stage ${name}]`, e);
      ctx.errors.push({ stage: name, message: String(e?.message ?? e), stack: e?.stack });
    }
    ctx.timings[name] = Math.round(performance.now() - t0); acc += cur[1];
    progress(null, 0, 0);
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
      progress(null, (i + 1) / items.length, cur[1]);
      await ctx.yield();
    }
  };

  const t0 = performance.now();
  try {
    await stage('engine', () => { initEngine(ctx); if (!ctx.renderer) throw new NoGL('no renderer'); });
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
    await stage('flush', () => {
      ctx.batch.flushAll();
      if (!opts.skip.has('merge')) ctx.batch.mergeStatic({ maxSpan: opts.mergeSpan });     // ~1300 meshes -> a few hundred draw calls (core/merge.js)
    });
    await stage('people', async () => { await loadPeople(ctx); spawnPeople(ctx); });
    await stage('start', () => startEngine(ctx));
  } finally { clearInterval(hintTimer); }
  progress('Listo', 1, 0); setBar(1);
  ctx.timings.total = Math.round(performance.now() - t0);
  ctx.booted = true;
  api.bootDone = true; api.bootMs = ctx.timings.total;
  if (hintEl) hintEl.textContent = '';
  if (msg && ctx.errors.length) msg.textContent = `${ctx.errors.length} aviso(s) del sistema: ver la consola`;
  flow.ready();
  return ctx;
}

window.__ladera = window.__ladera ?? {};
if (!hasWebGL2()) {
  showNoGL();
  Object.assign(window.__ladera, { noWebGL: true, state: () => ({ noWebGL: true }), errors: () => [], ready: Promise.resolve({ noWebGL: true }) });
} else {
  window.__ladera.ready = boot().catch((e) => {
    if (e instanceof NoGL) { showNoGL(); window.__ladera.noWebGL = true; return { noWebGL: true }; }
    showFatal(e); throw e;
  });
}
