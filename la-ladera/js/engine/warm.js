// Warm-up (owner: A1): ONE frame of everything, drawn through the real path, before the first real frame, while the title card is still up.
//
// WebGL is lazy: a program compiles, and a texture and a geometry upload, at the first draw that needs them. In the game that first draw was the moment of
// walking into a building (review R2a: the first frame inside L22 / L31 / L40 took 54-64 ms: a shadow-depth variant, the lamp line and the dust points
// compiled there, and 80-150 chunk geometries and up to 17 atlas textures were uploaded), of turning a corner onto a chunk nobody had seen (single frames of
// 125-180 ms), and of the night falling (the glow points draw for the first time). One frame of the whole scene moves all of it to the loading screen.
//
//  * It goes through ctx.post (the shadow pass, the multisampled HDR target, bloom, grade): three keys a program on the render target's colour space and
//    tone mapping, so renderer.compile() on the canvas warms programs the game never uses (measured: 23 extra programs, none of the ones needed on entry).
//  * Every object is made visible and un-cullable for that frame (the interiors, the glow, the lamp line, whatever a system keeps hidden) and put back after.
//  * A THREE.LOD picks its level from the camera's distance as it is drawn, which would hide again what the line above showed: the shops' goods (interiors/goods-render.js) draw their near
//    level, the only one with the label atlas, within 8 m of the camera, and the camera is 13 m or more from every shop at the spawn. The atlas and the near geometries were first drawn in
//    the frame where the player walked into a shop (the kiosk L01 uploaded the atlas). A LOD's autoUpdate is off for the frame, so every level is drawn, and on again after.
//  * What the game builds LATER is not in the scene at all: the library models inside a drawer (interiors/inspect.js) are made when the drawer opens, and so were their materials: the first
//    notebook took 184 ms to open (a program compiled) and 30 ms more when its 2048 px paper atlas had arrived and went up. requestLateMaterials() makes those materials as soon as the models
//    are in (the atlas downloads with the other textures and the 'start' stage waits for it) and the warm frame draws one tiny triangle of each.
//  * The picture of that frame is nonsense (every interior at once), so a normal frame is drawn straight after, in the same task: the canvas never shows it.
import * as THREE from 'three';
import { streamLeft, streamSpend } from '../core/budget.js';

/** The materials of the models that a drawer builds when it opens (the glTF material names of the inspect library models that loaded); nothing else is made late. */
export function lateMaterials(ctx) {
  const keys = new Set();
  for (const model of ctx.inspectGlb ?? []) {
    let parts = []; try { parts = ctx.assets.parts(model); } catch { /* a model that cannot be read is drawn as its stand-in: nothing to warm */ }
    for (const p of parts) if (p.matKey && ctx.matlib?.has(p.matKey)) keys.add(p.matKey);
  }
  return [...keys];
}

/** Make them now (main.js calls this once the models are in): the textures are requested with the others, so nothing is left to download by the warm-up. Returns how many. */
export function requestLateMaterials(ctx) {
  let n = 0;
  try { for (const k of lateMaterials(ctx)) { ctx.mat(k); n++; } }
  catch (e) { (ctx.errors ??= []).push({ stage: 'warm', message: 'late materials: ' + String(e?.message ?? e) }); }       // (the furnish stage that calls this must go on)
  return n;
}

/**
 * Upload every texture the library has made (and every tiled variant of one) to the GPU now; returns how many uploads that caused. The warm-up frame uploads what has landed by then. On a slow
 * link the textures are held until the people are in (core/matlib.js hold()) and come down WHILE that frame runs, so the last of them land after it: left alone they would be uploaded in the first
 * frames of the game, the hitch the warm-up exists to prevent. A texture whose image has not landed (a request that failed, or one still on its way) is skipped by three (version 0).
 * Slices of a few uploads with a yield between, so the card and the bar stay alive.
 */
export async function uploadTextures(ctx, slice = 6) {
  const lib = ctx.matlib, r = ctx.renderer;
  if (!lib?.tex || !r?.initTexture || ctx.contextLost) return 0;
  const list = [...lib.tex.values(), ...(lib.vcache?.values() ?? [])], before = r.info.memory.textures;
  let done = 0;
  for (const t of list) {
    if (!t.image || r.properties?.get(t)?.__version === t.version) continue;          // not landed (three would skip it too), or already on the GPU (the warm-up frame took it)
    try { r.initTexture(t); } catch (e) { (ctx.errors ??= []).push({ stage: 'textures', message: 'upload: ' + String(e?.message ?? e) }); }
    if (++done % slice === 0) await ctx.yield?.();
  }
  return r.info.memory.textures - before;
}

/** One tiny triangle per late material, set up as a drawer's meshes are (interiors/containers.js `meshOf`: they receive shadow and cast none); null when there are none. */
function lateStubs(ctx, keys) {
  if (!keys.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.001, 0, 0, 0, 0.001, 0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  const group = new THREE.Group(); group.name = 'warm.late';
  for (const key of keys) {
    const m = new THREE.Mesh(geometry, ctx.mat(key));
    m.name = key; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

/**
 * Issue the link of every program the scene needs at once, in the state the real frame draws in, and wait for the links to finish. The warm-up frame below compiles a program where it first
 * draws with it and waits for that link before the draw (three reads the link's status the first time it uses a program: `getProgramInfoLog` was 39 % of a profiled boot, 58 programs in a
 * row). `renderer.compile` only issues the links, and with KHR_parallel_shader_compile the driver links them side by side; the draw then finds them done.
 *  * Keyed like the real frame: the render target the scene pass draws into is bound (three keys a program on its colour space and tone mapping: warm.js header) and every light is on.
 *  * The shadow pass has its own programs (the depth materials), which `compile` does not cover: those still compile in the frame, one by one.
 * Returns { issued, issueMs, waitMs, polls } or null when there is nothing to compile.
 */
export async function compileScene(ctx, { timeoutMs = 12000, scene: root = null } = {}) {
  const { scene, renderer, post, camera, look } = ctx;
  if (!renderer || !scene || !post || !camera || ctx.contextLost) return null;
  const info = renderer.info, t0 = performance.now(), before = info.programs?.length ?? 0, lit = [];
  look?.update?.(0);
  scene.traverse((o) => { if (o.isLight && !o.visible) { lit.push(o); o.visible = true; } });
  const prev = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(post.composer ? (post.scenePass?.rt ?? post.composer.renderTarget1) : null);
    renderer.compile(root ?? scene, camera, root ? scene : null);
  } finally { renderer.setRenderTarget(prev); for (const o of lit) o.visible = false; }
  const t1 = performance.now(), issued = (info.programs?.length ?? 0) - before;
  let polls = 0;
  for (const deadline = t1 + timeoutMs; performance.now() < deadline; polls++) {
    if (!(info.programs ?? []).some((p) => p.isReady && !p.isReady())) break;
    await new Promise((r) => setTimeout(r, 8));
  }
  return { issued, issueMs: Math.round(t1 - t0), waitMs: Math.round(performance.now() - t1), polls };
}

const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'lightMap', 'displacementMap'];
/** What of a geometry reaches a program's key: which attributes it carries (vertex colours with or without alpha, tangents, second uvs) and its morph targets. Two meshes of one material with different layouts need different programs. */
const geoKey = (g) => (g ? Object.keys(g.attributes).sort().join(',') + (g.attributes.color ? ':c' + g.attributes.color.itemSize : '') + (g.morphAttributes?.position?.length ? ':m' + g.morphAttributes.position.length : '') : '');
const SHADOW_SIDE = [1, 0, 2];            // the side three's shadow pass draws for a material's side: front -> back, back -> front, double -> double (WebGLShadowMap)

/**
 * WARM WHAT THE GAME ADDS AFTER THE BOOT (`?lazy=1`: an interior made when the player comes near, the neighbours who arrive when the barrio is furnished). The boot's frame cannot have drawn them,
 * and the first frame that does would compile their programs where it first draws with each (a link is a blocking wait there: 100-800 ms in one frame, measured) and upload their textures.
 * This does it a little at a time, off the frame: a job is a subtree; it
 *   0. issues the link of each distinct (material, kind of object) once, one mesh per call, so no frame carries more than a program or two of the work (`renderer.compile`, keyed like the real
 *      frame: the scene pass's render target bound, the scene's lights and fog);
 *   1. waits, without blocking, for the driver to finish the links (KHR_parallel_shader_compile: `program.isReady()`);
 *   2. uploads the textures of its materials that have landed, one per call.
 * The promise resolves when the subtree can be drawn without any of that. The caller keeps the subtree hidden until then. `step(ms)` is called once per frame by whoever owns the frame loop's
 * spare time (interiors/lazy.js); `drain()` runs everything now (probes and tests).
 */
export class LateWarm {
  constructor(ctx) { this.ctx = ctx; this.jobs = []; this.stats = { jobs: 0, meshes: 0, issued: 0, textures: 0, maxStepMs: 0, steps: 0 }; this.trace = ctx.opts?.warmTrace ? [] : null; }
  get busy() { return this.jobs.length > 0; }
  /** Queue a subtree. Resolves (with the milliseconds it took) once it is warm. */
  warm(root) {
    const p = new Promise((resolve) => this.jobs.push({ root, resolve, phase: 0, list: null, i: 0, mats: new Set(), seen: new Set(), tex: null, k: 0, t0: performance.now(), frames: 0, tframes: 0, asked: new Set(), landed: new Set() }));
    this._kick();
    return p;
  }
  /** Wire into the page: a system for the frames of play and a driver for the time nobody plays (the title card, a pause). Both take what the frame's streaming budget has left (core/budget.js), and
   *  this comes BEFORE the interiors' system (order 8): an interior is only shown once it is warm, so the warm-up is what the rest waits for. */
  attach() {
    const ctx = this.ctx; ctx.lateWarm = this;
    ctx.addSystem('latewarm', () => { if (this.jobs.length) { const ms = streamLeft(ctx); if (ms >= 0.25) this.step(ms); } }, 7.5);
    return this;
  }
  _kick() {
    const ctx = this.ctx;
    if (this._ticking || ctx.opts?.manual || typeof setTimeout !== 'function') return;
    this._ticking = true;
    const tick = () => {
      if (!this.jobs.length) { this._ticking = false; return; }
      if (!ctx.running) { try { const ms = streamLeft(ctx); if (ms >= 0.25) this.step(ms); } catch (e) { (ctx.errors ??= []).push({ stage: 'warm', message: 'late warm driver: ' + String(e?.message ?? e) }); } }
      let fired = false;
      const go = () => { if (fired) return; fired = true; tick(); };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go);
      setTimeout(go, 40);
    };
    tick();
  }
  /** Work for about `ms` (one program's issue, ~13 ms, is one indivisible piece). True while jobs remain. */
  step(ms = 5) {
    const ctx = this.ctx, r = ctx.renderer;
    if (!this.jobs.length) return false;
    if (!r || ctx.contextLost || !ctx.camera) { while (this.jobs.length) this.jobs.shift().resolve(0); return false; }       // nothing to warm for: do not hold anything back
    const t0 = performance.now();
    while (this.jobs.length) {
      const job = this.jobs[0];
      try { this._run(job, t0, ms); } catch (e) { (ctx.errors ??= []).push({ stage: 'warm', message: 'late warm: ' + String(e?.message ?? e), stack: e?.stack }); job.phase = 3; }
      if (job.phase < 3) break;                                                    // it has had its share of this frame; the rest wait for the next
      this.jobs.shift(); this.stats.jobs++; job.resolve(Math.round(performance.now() - job.t0));
      if (performance.now() - t0 >= ms) break;
    }
    const e = performance.now() - t0; this.stats.steps++; if (e > this.stats.maxStepMs) this.stats.maxStepMs = e;
    streamSpend(ctx, e);
    return this.jobs.length > 0;
  }
  /** Run every job to the end now, waiting (blocking) for the links: a probe wants the barrio as it will be. */
  drain() { for (let n = 0; this.jobs.length && n < 100000; n++) { this.step(1e9); const j = this.jobs[0]; if (j && j.phase === 1) j.frames = 1e9; } }

  /**
   * The sun's shadow pass draws a caster with a program of its own that `compile` of the caster's material does not build: a MeshDepthMaterial that three sets up from the caster (`getDepthMaterial`
   * in WebGLShadowMap: the side flipped, and the caster's map, alpha map, alpha test and displacement map copied over, the map whether or not it is alpha-tested), keyed further on the object
   * (skinning, instancing with or without colours, morph targets) and drawn against an empty scene (no fog) with the sun's shadow in the lights. The first frame that drew the caster would link
   * it there (20-35 ms each). Link the same one from a stand-in of the same kind, once per kind, ever.
   */
  _depth(o, r, mats) {
    const { scene, camera } = this.ctx, seen = this.depthKinds ??= new Set(), mo = o.geometry?.morphAttributes;
    const morph = mo ? Object.keys(mo).filter((k) => mo[k]?.length).sort().map((k) => k[0] + mo[k].length).join('') : '';
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || m.visible === false) continue;
      const side = m.shadowSide ?? SHADOW_SIDE[m.side] ?? 1, test = m.alphaToCoverage === true ? 0.5 : m.alphaTest;
      const kind = [o.isSkinnedMesh ? 's' : '', o.isInstancedMesh ? 'i' + (o.instanceColor ? 'c' : '') : '', morph, side, m.map ? 'u' + (m.map.channel ?? 0) : '', m.alphaMap ? 'a' + (m.alphaMap.channel ?? 0) : '',
        test > 0 ? 't' : '', m.displacementMap ? 'd' + (m.displacementMap.channel ?? 0) : ''].join('.');
      if (seen.has(kind)) continue; seen.add(kind);
      const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      dm.side = side; dm.map = m.map; dm.alphaMap = m.alphaMap; dm.alphaTest = test;
      dm.displacementMap = m.displacementMap; dm.displacementScale = m.displacementScale; dm.displacementBias = m.displacementBias;
      const stand = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, dm) : o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, dm, 1) : new THREE.Mesh(o.geometry, dm);
      if (o.isInstancedMesh && o.instanceColor) stand.setColorAt(0, new THREE.Color());
      const fog = scene.fog; scene.fog = null;
      try { r.compile(stand, camera, scene); } finally { scene.fog = fog; }
      (this.depthMats ??= []).push(dm); mats?.add(dm);                                 // (kept: the program is released with its last material; and waited for with the job's own)
      if (this.trace) this.trace.push({ at: Math.round(performance.now()), depth: kind, obj: o.name || o.type, key: String(r.properties.get(dm).currentProgram?.cacheKey ?? '').split(',').slice(0, 52).join('|') });
    }
  }

  _run(job, t0, ms) {
    const { scene, renderer: r, post, camera } = this.ctx;
    if (job.phase === 0) {
      if (!job.list) { job.list = []; job.root.traverse((o) => { if (o.isMesh || o.isPoints || o.isSprite || o.isLine) job.list.push(o); }); }
      const prev = r.getRenderTarget();
      r.setRenderTarget(post?.composer ? (post.scenePass?.rt ?? post.composer.renderTarget1) : null);
      try {
        while (job.i < job.list.length) {
          const o = job.list[job.i++], mats = Array.isArray(o.material) ? o.material : [o.material];
          let fresh = false;
          for (const m of mats) { if (!m) continue; const key = m.id + (o.isSkinnedMesh ? 's' : '') + (o.isInstancedMesh ? (o.instanceColor ? 'ic' : 'i') : '') + (o.isPoints ? 'p' : '') + '|' + geoKey(o.geometry); if (!job.seen.has(key)) { job.seen.add(key); fresh = true; } job.mats.add(m); }
          if (!fresh) continue;
          const n0 = r.info.programs?.length ?? 0;
          r.compile(o, camera, scene); this.stats.meshes++;
          if (o.castShadow && o.isMesh) this._depth(o, r, job.mats);
          this.stats.issued += (r.info.programs?.length ?? 0) - n0;
          if (this.trace && this.trace.length < 600 && !/.int$/.test(job.root.name || '')) this.trace.push({ at: Math.round(performance.now()), root: job.root.name || job.root.type, obj: o.name || o.type, mats: mats.map((m) => m?.name || m?.type).join('+'), skin: !!o.isSkinnedMesh, issued: (r.info.programs?.length ?? 0) - n0, id: r.properties.get(mats[0])?.currentProgram?.id ?? null, key: String(r.properties.get(mats[0])?.currentProgram?.cacheKey ?? '').split(',').slice(0, 53).join('|') });
          if (performance.now() - t0 >= ms) break;
        }
      } finally { r.setRenderTarget(prev); }
      if (job.i >= job.list.length) job.phase = 1;
    }
    if (job.phase === 1) {
      const pending = (() => { for (const m of job.mats) { const p = r.properties.get(m)?.currentProgram; if (p?.isReady && !p.isReady()) return true; } return false; })();
      if (pending && ++job.frames < 900) return;                                   // (a link that never reports done is not waited for for ever)
      const all = new Set();
      for (const m of job.mats) for (const s of TEX_SLOTS) { const t = m[s]; if (t?.isTexture) all.add(t); }
      // a material asks for its files when it is made, so those of an interior built a moment ago are still on their way: the subtree waits for them (landed or failed, core/matlib.js whenLoaded),
      // bounded, so it is shown with its textures up and not uploading them in the frame that first draws it (4-7 ms each, 7-22 of them: measured)
      const lib = this.ctx.matlib; job.asked ??= new Set(); job.landed ??= new Set();
      let waiting = 0;
      for (const t of all) {
        if (t.image || job.landed.has(t) || !lib?.whenLoaded) continue;
        if (!job.asked.has(t)) { job.asked.add(t); lib.whenLoaded(t).then(() => job.landed.add(t), () => job.landed.add(t)); }
        waiting++;
      }
      if (waiting && (job.tframes = (job.tframes ?? 0) + 1) < 1800) return;
      job.tex = [...all].filter((t) => t.image && r.properties.get(t)?.__version !== t.version); job.phase = 2;
    }
    if (job.phase === 2) {
      while (job.k < job.tex.length) {
        const t = job.tex[job.k++];
        try { r.initTexture(t); this.stats.textures++; } catch { /* a texture that cannot be uploaded now is uploaded by the first frame that draws it, as before */ }
        if (performance.now() - t0 >= ms) break;
      }
      if (job.k >= job.tex.length) job.phase = 3;
    }
  }
}

/** Draw the whole scene once; returns what the frame made and drew ({ ms, programs, textures, geometries, objects, calls, triangles, late }) or null when there is nothing to do. */
export function warmUp(ctx) {
  const { scene, renderer, post, look } = ctx;
  if (!renderer || !scene || !post || !look || ctx.contextLost) return null;
  const info = renderer.info, mem = () => ({ programs: info.programs?.length ?? 0, textures: info.memory.textures, geometries: info.memory.geometries });
  const t0 = performance.now(), before = mem(), saved = [], lods = []; let uncullable = 0, total = 0, late = [], stubs = null;
  try { late = lateMaterials(ctx); stubs = lateStubs(ctx, late); }
  catch (e) { late = []; stubs = null; (ctx.errors ??= []).push({ stage: 'warm', message: 'late materials: ' + String(e?.message ?? e) }); }       // (the rest is still worth warming)
  look.update(0);                                                     // the environment map and the sun are in place: they are part of every program's key
  scene.traverse((o) => {
    total++; if (!o.frustumCulled) uncullable++; if (!o.visible || o.frustumCulled) saved.push(o, o.visible, o.frustumCulled); o.visible = true; o.frustumCulled = false;
    if (o.isLOD && o.autoUpdate) { o.autoUpdate = false; lods.push(o); }   // (it would pick one level by the camera's distance as it is drawn: see the header)
  });
  info.reset();                                                       // the frame's own draw counts are read below; ctx.render() resets them again for the real frame
  if (stubs) scene.add(stubs);                                        // (after the count above: the scene is left with exactly the objects it had)
  try {
    post.render(0, look);
    renderer.getContext().finish();
  } finally {
    for (let i = 0; i < saved.length; i += 3) { saved[i].visible = saved[i + 1]; saved[i].frustumCulled = saved[i + 2]; }
    for (const o of lods) o.autoUpdate = true;
    if (stubs) { scene.remove(stubs); stubs.children[0].geometry.dispose(); }
  }
  const after = mem(), ms = performance.now() - t0, calls = info.render.calls, triangles = info.render.triangles;
  ctx.render();                                                       // a real frame on top, so the canvas never shows the warm one
  return { ms: Math.round(ms), programs: after.programs - before.programs, textures: after.textures - before.textures, geometries: after.geometries - before.geometries, objects: total, changed: saved.length / 3, uncullable, calls, triangles, late: late.length };
}
