// Boot orchestrator (owner: A1). Runs the world-building stages in order; every stage is isolated (a throwing module is
// logged in ctx.errors and the rest still loads), timed, and yields to the loading screen.
// URL flags: ?autostart (skip title + pointer lock)  ?manual (no rAF; drive with __ladera.step/render)
//            ?debug  ?hour=17.2  ?seed=N  ?lots=L00,L02 (only these lots)  ?skip=props,people,furnish,interiors,world
//            ?preserve (preserveDrawingBuffer)  ?dpr=1  ?shadows=0  ?aa=0  ?post=0 (no bloom/grade: emergency look)
//            ?quality=low|medium|high|auto  ?timescale=N (game minutes per real second; 0 freezes the clock)
//            ?skip=merge (keep one mesh per group x material: debugging only)  ?mergespan=N (largest merged chunk in metres, default 128)
//            ?skiphidden=0 (update the matrices of hidden interiors and unseen people too: debugging only; engine/visibility.js)
//            ?castall (floors and terrain tiles cast into the sun's shadow map again, as before core/shadowpolicy.js: before / after only)
//            ?clutter=0 (original procedural exterior props; useful for comparisons and the asset fallback check)
//            ?vehicles=0 (original procedural parked vehicles, for fallback and before/after checks)
//            ?skip=animals (the barrio without its dogs, cats, birds, hens and mule: js/animals/); skip=people leaves them out too, they follow the people's graph
//            ?lazy=1 (the title card goes away at a PLAYABLE milestone: interiors are furnished and drawn on demand and the models, people and animals stream in after it; dev/FEATURE-LAZY.md.
//            Eager, the default, is the full boot of every release so far. `__ladera.ready` is the milestone, `__ladera.settled` is everything in.)
import { createContext } from './core/ctx.js';
import { BootBar, STAGES, STAGES_LAZY, CREEP_TICK_MS } from './core/bootbar.js';
import { Staged } from './core/staged.js';
import { paintFrame } from './core/util.js';
import { initEngine, startEngine } from './engine/index.js';
import { warmUp, compileScene, LateWarm, requestLateMaterials, uploadTextures } from './engine/warm.js';
import { createSettings } from './engine/settings.js';
import { installUI, createFlow } from './ui/index.js';
import { initAudio } from './audio/index.js';
import { generatePlan } from './world/plan.js';
import { buildWorld } from './world/terrain.js';
import { buildProps } from './world/props.js';
import { loadClutter } from './world/clutter.js';
import { loadVehicles } from './world/vehicle-library.js';
import { urbanDensity } from './world/periphery.js';
import { planBuilding, buildBuilding } from './arch/index.js';
import { bakeLeaves } from './arch/leafbake.js';
import { PROPS } from './people/props.js';
import { loadInteriorAssets, furnishBuilding, buildInterior, finishBuilding, loadFurnitureAssets, loadGarmentAssets, loadGoodsAssets, loadInspectAssets, prepareAtlas } from './interiors/index.js';
import { InteriorManager } from './interiors/lazy.js';
import { loadPeople, spawnPeople } from './people/index.js';
import { preloadAnimals, loadAnimals } from './animals/index.js';

const q = new URLSearchParams(location.search);
const num = (k) => (q.has(k) && q.get(k) !== '' && Number.isFinite(+q.get(k)) ? +q.get(k) : undefined);
const opts = {
  seed: num('seed'), hour: num('hour'), dpr: num('dpr'), timescale: num('timescale'), mergeSpan: num('mergespan'),
  quality: ['auto', 'low', 'medium', 'high'].includes(q.get('quality')) ? q.get('quality') : undefined,
  debug: q.has('debug'), touch: q.has('touch'), autostart: q.has('autostart'), manual: q.has('manual'), preserve: q.has('preserve'), castAll: q.has('castall'), lazy: q.get('lazy') === '1', warmTrace: q.has('warmtrace'),
  shadows: q.get('shadows') !== '0', aa: q.get('aa') !== '0', post: q.get('post') !== '0', rdb: q.get('rdb') !== '0', skipHidden: q.get('skiphidden') !== '0', clutter: q.get('clutter') !== '0', vehicles: q.get('vehicles') !== '0',
  lots: q.get('lots')?.split(',').filter(Boolean) ?? null,
  skip: new Set((q.get('skip') ?? '').split(',').filter(Boolean)),
};

const $ = (id) => document.getElementById(id);
// The stages, their weights on the loading bar and what the card says while each runs: core/bootbar.js (which also makes a silent stage creep so the bar never looks hung)
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

  let hint = 0;
  const bar = $('loadbar'), fill = bar?.firstElementChild, msg = $('loadmsg'), hintEl = $('loadhint');
  const bb = new BootBar(opts.lazy ? STAGES_LAZY : STAGES);
  // The bar never goes back, here at the last step as well: the page's own script (index.html) has been moving it while the ~200 modules came in, before this code could run, and it may stand a
  // little ahead of or behind the 'load' stage's exact share. Whichever is higher stays.
  let shown = Math.max(0, parseInt(fill?.style.width, 10) || 0);
  const setBar = (frac = bb.fraction) => {
    const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100); if (pct < shown) return; shown = pct;
    if (fill) fill.style.width = `${pct}%`; bar?.setAttribute('aria-valuenow', String(pct));
  };
  const say = (label) => { if (msg && label) msg.textContent = label; };
  const nextHint = () => { if (hintEl) hintEl.textContent = HINTS[hint++ % HINTS.length]; };
  nextHint(); const hintTimer = setInterval(nextHint, 4200);
  ctx.progress = (sub, label) => { bb.report(sub, performance.now()); setBar(); say(label ?? bb.cur[2]); };
  // a stage that only waits (a download, the warm-up frame) reports nothing: the bar creeps inside its share so the card never looks hung (core/bootbar.js, R2c-013)
  const creepTimer = setInterval(() => { if (bb.tick(performance.now())) setBar(); }, CREEP_TICK_MS);

  const stage = async (name, fn) => {
    const row = bb.begin(name, performance.now());
    if (opts.skip.has(name)) { bb.end(); return; }
    ctx.stage = name; say(row[2]); setBar();
    if (row[3]) await paintFrame();            // a stage that blocks the page for seconds in one call (warm): the card shows what it is doing before the page freezes
    const t0 = performance.now();
    try { await fn(); } catch (e) {
      if (e instanceof NoGL) throw e;
      console.error(`[stage ${name}]`, e);
      ctx.errors.push({ stage: name, message: String(e?.message ?? e), stack: e?.stack });
    }
    ctx.timings[name] = Math.round(performance.now() - t0); bb.end(); setBar();
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
      bb.report((i + 1) / items.length, performance.now()); setBar();
      await ctx.yield();
    }
  };
  // THE DOWNLOADS (review R2e-001: 52-60 s at 8 Mbit/s and 120 ms, against a budget of 40). The boot is bound by what it downloads (~37 MB at 1 MB/s), and it used to download in a chain:
  // each stage asked for its models only when it began, the shop goods' atlas waited for every texture of the boot, the people models began after the furniture was in. The connection sat
  // idle for a third of the boot. Now every model is asked for as soon as the manifests say what there is, in the order the boot needs it:
  //   1. the furniture, the clothes, the close-inspection things, the shop goods and the clutter (12 MB): the 'models' stage waits for them;
  //   2. the people (9.5 MB) and the animals (0.6 MB), asked for when 1 has landed, so the goods' label atlas is never queued behind them: the 'people' stage waits for them;
  //   3. the textures (11 MB), last: they are made as the materials are, but their requests are held (core/matlib.js hold()) until the people are in, or they take two thirds of the
  //      connection from the people and everything after the people waits for the end of the download. They come down while the warm-up frame runs; the 'textures' stage waits for the rest.
  // Furnishing is pure data (sizes and tags from the manifests, never a model), so it runs while the models come down.
  const calm = (p) => { p.catch(() => {}); return p; };           // a load that fails is reported by the stage that awaits it, not as an unhandled rejection in the meantime
  const free = () => ctx.matlib?.release();
  let peopleLoad = null, interiorLoad = null, clutterLoad = null, vehicleLoad = null;
  const startPeople = () => {
    if (!peopleLoad) { peopleLoad = calm(loadPeople(ctx)); peopleLoad.then(free, free); preloadAnimals(ctx); }   // the animals' seven small models (0.6 MB) come down beside the people's; preloadAnimals never rejects
    return peopleLoad;                                                                                    // the stage's own await reports a failure
  };
  const startModels = () => {
    if (interiorLoad) return;
    if (opts.lazy) {                                                                                      // ?lazy=1: only what the first views draw comes down before the milestone; the furniture, the clothes,
      clutterLoad = calm(loadClutter(ctx));                                                               // the shop goods, the people and the rest are the units of the after-playable queue (beginStreams),
      vehicleLoad = calm(loadVehicles(ctx));                                                              // and no texture request is held back: the textures that materials ask for now are the first views'
      interiorLoad = Promise.resolve();
      return;
    }
    interiorLoad = calm(loadInteriorAssets(ctx));                                                         // (the shop goods' label atlas is asked for in here, before the hold below)
    clutterLoad = calm(loadClutter(ctx));                                                                 // the roof kit's and the street props' files are among the furniture's: one more small request
    vehicleLoad = calm(loadVehicles(ctx));                                                                // the parked vehicles' two files (2 MB); a failure leaves the procedural ones
    ctx.matlib?.hold();
    interiorLoad.then(() => {}, () => {}).then(opts.skip.has('people') ? free : startPeople);             // the people follow the interiors; with no people the textures do
  };

  // ?lazy=1: what follows the PLAYABLE milestone (dev/FEATURE-LAZY.md). The queue is core/staged.js: a later sector registers a unit on `ctx.staged` and runs after these, without touching this file.
  const interiors = () => (ctx.interiors ??= new InteriorManager(ctx, { meshes: !opts.skip.has('interiors') }));
  /** The 'furnish' stage: the rooms' finishes (every shell reads them) and the chapel's furniture (its shell draws the altar and the candles); the rest of the furnishing waits for a reason. */
  const lazyFinishes = () => {
    const mgr = interiors();
    for (const bp of ctx.buildings.values()) { finishBuilding(ctx, bp); if (bp.lot?.kind === 'chapel') mgr.ensureData(bp.id); }
  };
  /** Subtrees that did not exist when the boot warmed the scene (the crowd, the animals): out of the frame, from the task that adds them, until their programs are built and their textures are up. */
  const holdBack = (name) => { const g = ctx.scene.getObjectByName(name); if (!g) return null; const was = g.visible; g.visible = false; return () => { g.visible = was; }; };
  const warmLate = async (names) => {
    const lw = ctx.lateWarm; if (!lw) return;
    for (const name of names) { const g = ctx.scene.getObjectByName(name); if (g) await lw.warm(g); }
    // what a resident takes into their hands is made when they first need it (people/props.js holdProp): one of each, off the scene, so the programs and the phone's texture are ready
    if (names.includes('people')) {
      const probe = new ctx.THREE.Group(); probe.name = 'warm.props';
      for (const s of Object.values(PROPS)) { try { probe.add(s.make()); } catch { /* made by the first person who holds it, as before */ } }
      await lw.warm(probe);
    }
  };
  let resolveSettled = () => {};
  api.settled = new Promise((r) => { resolveSettled = r; });                                                // eager: with `ready`; lazy: once every unit of the queue has finished
  const beginStreams = () => {
    const st = ctx.staged = new Staged(ctx), skipPeople = opts.skip.has('people'), skipInteriors = opts.skip.has('furnish');
    const cue = streamCue(st);
    if (!skipInteriors) {
      const mgr = interiors();
      st.register({ id: 'interior-packs', label: 'Muebles, ropa y mercancía', weight: 7, start: async () => {
        try { await Promise.all([loadFurnitureAssets(ctx), loadGarmentAssets(ctx), loadGoodsAssets(ctx)]); } finally { mgr.setPacks(true); }   // (a pack that fails leaves the stand-ins: the reason is in ctx.errors)
      } });
      st.register({ id: 'interiors-data', label: 'Amueblando los cuartos', weight: 6, start: () => { mgr.attach(); return mgr.whenSealed(); } });
      st.register({ id: 'interiors', label: 'Dibujando los interiores', weight: 6, needs: ['interior-packs'], start: () => mgr.whenBuilt() });
    }
    if (!skipPeople) {
      st.register({ id: 'people-pack', label: 'Trayendo a los vecinos', weight: 10, needs: skipInteriors ? [] : ['interior-packs'], start: () => startPeople() });
      st.register({ id: 'people', label: 'Despertando a los vecinos', weight: 2, needs: skipInteriors ? ['people-pack'] : ['people-pack', 'interiors-data'], start: async () => {
        await paintFrame();                                                                                // (a frame of its own: the spawn is one call of about 90 ms)
        spawnPeople(ctx); const showCrowd = holdBack('people');                                            // (this very task: no frame draws the crowd before its programs are built)
        await paintFrame();                                                                                // (and a frame between the two calls: the animals are another 30-60 ms)
        await loadAnimals(ctx); const showAnimals = holdBack('animals');
        try { await warmLate(['people', 'animals']); }                                                     // (hidden until their programs are built and their textures are up)
        finally { showCrowd?.(); showAnimals?.(); ctx.visibility?.skipHiddenMatrices?.(opts.skipHidden); } // (the crowd joins the matrix skip)
      } });
    }
    st.register({ id: 'inspect-pack', label: 'Cosas de los cajones', weight: 2, needs: skipPeople ? (skipInteriors ? [] : ['interior-packs']) : ['people-pack'], start: async () => { await loadInspectAssets(ctx); requestLateMaterials(ctx); } });
    st.register({ id: 'textures', label: 'Texturas', weight: 3, needs: ['inspect-pack', ...(skipInteriors ? [] : ['interiors']), ...(skipPeople ? [] : ['people'])], start: async () => {
      const lib = ctx.matlib; if (lib?.pending) await Promise.race([lib.whenReady(), new Promise((r) => setTimeout(r, 25000))]);
      await uploadTextures(ctx, 1);
    } });
    st.settled.then(() => {
      ctx.timings.settled = Math.round(performance.now() - t0); ctx.timings.streams = st.log;
      api.settledMs = ctx.timings.settled; cue.done(); resolveSettled(ctx);
    });
    st.run();
  };
  /** The small, non-blocking note of how much of the barrio has come in (on the title card and in play alike): it takes no input and goes away when the queue is empty. */
  const streamCue = (st) => {
    const el = document.createElement('div'), bar = document.createElement('i');
    el.id = 'stream'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'off'); el.lang = 'es';
    Object.assign(el.style, { position: 'fixed', left: '12px', bottom: 'max(12px, env(safe-area-inset-bottom))', zIndex: '21', pointerEvents: 'none', font: '600 11px/1.2 system-ui, sans-serif', letterSpacing: '.08em',
      color: '#f1e6d6', textShadow: '0 1px 3px #000', opacity: '.85', transition: 'opacity .6s', maxWidth: '60vw' });
    Object.assign(bar.style, { display: 'block', height: '2px', marginTop: '4px', width: '0%', background: '#e9a23b', transition: 'width .4s' });
    const text = document.createTextNode(''); el.append(text, bar); document.body.append(el);
    const paint = () => { const p = Math.round(st.progress * 100); text.nodeValue = `${st.label || 'Cargando el barrio'} · ${p} %`; bar.style.width = p + '%'; };
    st.onChange(paint); paint();
    return { done() { el.style.opacity = '0'; setTimeout(() => el.remove(), 900); } };
  };

  const t0 = performance.now();
  try {
    await stage('load', () => {});                                                                      // the modules are in (index.html moved the bar while they came): the bar stands at this stage's share
    await stage('engine', () => { initEngine(ctx); if (!ctx.renderer) throw new NoGL('no renderer'); });
    await stage('materials', () => ctx.matlib.init());
    await stage('assets', async () => { await ctx.assets.init(); startModels(); });
    await stage('plan', () => {
      ctx.plan = generatePlan(ctx);
      ctx.physics.setTerrain(ctx.plan.heightAt);
      if (opts.lots) ctx.plan.lots = ctx.plan.lots.filter((l) => opts.lots.includes(l.id));
    });
    await stage('world', () => buildWorld(ctx));
    await stage('arch', () => each(ctx.plan?.lots ?? [], (lot) => { ctx.buildings.set(lot.id, planBuilding(ctx, lot)); }, 'planBuilding'));
    await stage('furnish', () => (opts.lazy ? lazyFinishes() : each([...ctx.buildings.values()], (bp) => furnishBuilding(ctx, bp), 'furnishBuilding')));
    await stage('models', async () => {
      // the card says how many of the model files are in; the textures and the people's files are asked for too by now, so this counts what is in of ALL the files asked for so far
      const a = ctx.assets, tick = setInterval(() => ctx.progress?.(a.loaded.size / Math.max(1, a.inflight.size)), 250);
      try {
        for (const r of await Promise.allSettled([interiorLoad, clutterLoad, vehicleLoad])) {
          if (r.status === 'rejected') ctx.errors.push({ stage: 'models', message: String(r.reason?.message ?? r.reason), stack: r.reason?.stack });
        }
      } finally { clearInterval(tick); }
      requestLateMaterials(ctx);                                // the materials of what a drawer builds when it opens: their textures come down with the others, the warm-up draws them (engine/warm.js)
      if (opts.lazy && !opts.skip.has('furnish')) {              // ?lazy=1: the decal atlas (70-110 ms of painting, 20-45 ms of upload) is made here, behind the card, not in a frame of play
        const atlas = prepareAtlas(ctx);
        try { if (atlas?.texture) ctx.renderer?.initTexture?.(atlas.texture); } catch { /* the first frame that draws it uploads it, as before */ }
      }
    });
    await stage('colliders', () => { if (opts.lazy) interiors().addShellColliders(); else for (const bp of ctx.buildings.values()) ctx.physics.add(bp.colliders ?? {}); });
    await stage('build', () => each([...ctx.buildings.values()], (bp) => {
      buildBuilding(ctx, bp);
      if (!opts.lazy && !opts.skip.has('interiors')) buildInterior(ctx, bp);                               // (?lazy=1: the interiors' geometry is made on demand, interiors/lazy.js)
    }, 'buildBuilding'));
    await stage('props', () => buildProps(ctx));
    await stage('flush', () => {
      ctx.clutter?.finalize();
      ctx.vehicleLibrary?.finalize();
      ctx.batch.flushAll();
      if (!opts.skip.has('merge')) ctx.batch.mergeStatic({ maxSpan: opts.mergeSpan });     // ~1300 meshes -> a few hundred draw calls (core/merge.js)
      if (opts.lazy) bakeLeaves(ctx);                           // ?lazy=1: the closed door leaves become static chunks here, behind the card (the doors' system did it at its first tick: 60-120 ms in the first frame)
    });
    // every lamp is registered by now: one sprite each, and the far city on the hillsides round the plot (engine/glow.js)
    await stage('glow', () => ctx.glow?.finalize({ far: ctx.plan?._far, density: (x, z) => urbanDensity(ctx.plan, x, z), seed: ctx.plan?.seed }));
    await stage('people', async () => { if (opts.lazy) return; await startPeople(); spawnPeople(ctx); await loadAnimals(ctx); });   // (?lazy=1: after the milestone, beginStreams)
    await stage('start', () => {
      free();                                                   // (whatever happened to the people, the textures go now)
      startEngine(ctx, { hold: true });                         // the player and the camera are in place; the animation frames wait for the warm-up (below)
      if (opts.lazy) new LateWarm(ctx).attach();                // ?lazy=1: what is added after the boot (interiors, people) is warmed a little at a time, off the frame (engine/warm.js)
    });
    // every program, texture and geometry the game will ever draw is made now, behind the title card, instead of in the frame where the player walks into a house
    // (engine/warm.js; ?skip=warm leaves it out)
    await stage('warm', async () => {
      // the links of every program are issued together first (and waited for without blocking the page: KHR_parallel_shader_compile), so the frame below finds them built (engine/warm.js compileScene)
      let c = null;
      if (!opts.skip.has('compile')) { try { c = await compileScene(ctx); } catch (e) { (ctx.errors ??= []).push({ stage: 'warm', message: 'compile: ' + String(e?.message ?? e), stack: e?.stack }); } }
      ctx.warm = warmUp(ctx);
      if (ctx.warm && c) { ctx.warm.programs += c.issued; ctx.warm.ms += c.issueMs + c.waitMs; ctx.warm.compile = c; }      // (the record says what the whole stage made and cost)
    });
    await stage('textures', async () => {
      // The textures came down while the warm-up frame ran. Draw the first real frame only once they are in: on a slow link the world would otherwise show flat colours and pop when the
      // images land. Bounded, so one stuck request cannot hold the page forever. Then they go to the GPU now: the warm-up frame could only upload what had landed by then, and the rest
      // would go up in the first frames of the game (engine/warm.js uploadTextures).
      const lib = ctx.matlib, total = lib?.pending ?? 0;
      if (total > 0) {
        const tick = setInterval(() => ctx.progress?.(1 - lib.pending / total, `Cargando texturas (${lib.pending})…`), 200);
        try { await Promise.race([lib.whenReady(), new Promise((r) => setTimeout(r, 25000))]); } finally { clearInterval(tick); }
      }
      const up = await uploadTextures(ctx);
      if (ctx.warm) { ctx.warm.textures += up; ctx.warm.lateTextures = up; }
    });
    ctx.startLoop?.();                                          // the first animation frame comes after the warm-up frame, not before it (R2c-013: it was the longest freeze of the boot, drawn with the card unpainted)
  } finally { clearInterval(hintTimer); clearInterval(creepTimer); }
  say('Listo'); setBar(1);
  ctx.timings.total = Math.round(performance.now() - t0);
  ctx.booted = true;
  api.bootDone = true; api.bootMs = ctx.timings.total;
  if (hintEl) hintEl.textContent = '';
  if (msg && ctx.errors.length) msg.textContent = `${ctx.errors.length} aviso(s) del sistema: ver la consola`;
  flow.ready();
  if (opts.lazy) { ctx.timings.playable = ctx.timings.total; beginStreams(); } else resolveSettled(ctx);   // ?lazy=1: the milestone is this moment; everything after it is the queue's (ctx.staged)
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
