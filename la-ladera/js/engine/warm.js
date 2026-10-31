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
//  * The picture of that frame is nonsense (every interior at once), so a normal frame is drawn straight after, in the same task: the canvas never shows it.

/** Draw the whole scene once; returns what the frame made and drew ({ ms, programs, textures, geometries, objects, calls, triangles }) or null when there is nothing to do. */
export function warmUp(ctx) {
  const { scene, renderer, post, look } = ctx;
  if (!renderer || !scene || !post || !look || ctx.contextLost) return null;
  const info = renderer.info, mem = () => ({ programs: info.programs?.length ?? 0, textures: info.memory.textures, geometries: info.memory.geometries });
  const t0 = performance.now(), before = mem(), saved = []; let uncullable = 0, total = 0;
  look.update(0);                                                     // the environment map and the sun are in place: they are part of every program's key
  scene.traverse((o) => { total++; if (!o.frustumCulled) uncullable++; if (!o.visible || o.frustumCulled) saved.push(o, o.visible, o.frustumCulled); o.visible = true; o.frustumCulled = false; });
  info.reset();                                                       // the frame's own draw counts are read below; ctx.render() resets them again for the real frame
  try {
    post.render(0, look);
    renderer.getContext().finish();
  } finally {
    for (let i = 0; i < saved.length; i += 3) { saved[i].visible = saved[i + 1]; saved[i].frustumCulled = saved[i + 2]; }
  }
  const after = mem(), ms = performance.now() - t0, calls = info.render.calls, triangles = info.render.triangles;
  ctx.render();                                                       // a real frame on top, so the canvas never shows the warm one
  return { ms: Math.round(ms), programs: after.programs - before.programs, textures: after.textures - before.textures, geometries: after.geometries - before.geometries, objects: total, changed: saved.length / 3, uncullable, calls, triangles };
}
