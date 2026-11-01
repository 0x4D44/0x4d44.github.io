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
