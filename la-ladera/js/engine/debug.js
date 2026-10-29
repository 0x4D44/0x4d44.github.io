// window.__ladera : the scripting surface used by tests, agents and reviewers (headless Chrome via CDP).
// Everything is deterministic: use ?manual=1 so nothing advances unless you call step()/walk().
// Keep this API stable - the review harness depends on it. Add, don't rename.
export function installDebug(ctx) {
  const api = window.__ladera = window.__ladera ?? {};
  const P = () => ctx.player;
  Object.assign(api, {
    ctx,
    /** Snapshot of everything a reviewer wants to know. */
    state() {
      const p = P(), s = p?.s, info = ctx.renderer?.info;
      return {
        pos: s ? [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)] : null, yaw: p ? +p.yaw.toFixed(3) : null, pitch: p ? +p.pitch.toFixed(3) : null,
        onGround: s?.onGround, blocked: s?.blocked, hour: ctx.hour, building: p?.building ?? null,
        fps: ctx.stats?.fps, frameMs: ctx.stats?.frameMs,
        drawCalls: info?.render.calls, triangles: info?.render.triangles, geometries: info?.memory.geometries, textures: info?.memory.textures,
        buildings: ctx.buildings.size, anchors: ctx.anchors.length, lights: ctx.lights.list.length, discoveries: [ctx.discover.found.size, ctx.discover.total],
        npcs: ctx.people?.list?.().length ?? 0, errors: ctx.errors.length, timings: ctx.timings, physics: ctx.physics.stats(),
        target: ctx.interact.target ? { id: ctx.interact.target.id, kind: ctx.interact.target.kind, prompt: ctx.interact.prompt() } : null,
      };
    },
    /** Put the player at (x,z). o: { floor: index into ascending surface list at that point (0 = lowest), y, yaw, pitch } (angles in radians). */
    teleport(x, z, o = {}) { P().teleport(x, z, o); return api.state(); },
    /** Look in a direction (radians; yaw 0 = north/-z, pitch + = up). */
    look(yaw, pitch = 0) { P().yaw = yaw; P().pitch = pitch; },
    /** Look at a world point. */
    lookAt(x, y, z) {
      const p = P(), dx = x - p.s.x, dz = z - p.s.z, dy = y - (p.s.y + 1.64);
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    },
    /** Advance the simulation n frames of dt seconds (no rendering). */
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) ctx.step(dt); return api.state(); },
    /** Hold keys for `secs` of game time. f/s in -1..1 (forward/strafe). o: { sprint, jump, crouch } */
    walk(f, s, secs, o = {}) {
      const p = P(); Object.assign(p.input, { f, s, sprint: !!o.sprint, jump: !!o.jump, crouch: !!o.crouch });
      const n = Math.max(1, Math.round(secs * 60));
      for (let i = 0; i < n; i++) ctx.step(1 / 60);
      Object.assign(p.input, { f: 0, s: 0, sprint: false, jump: false, crouch: false });
      return api.state();
    },
    use() { ctx.interact.update(ctx.camera.position, ctx.camera.getWorldDirection(new ctx.THREE.Vector3())); return ctx.interact.use(); },
    render() { ctx.render(); },
    /** Render and return a JPEG data URL. o: { w, h, q } - temporarily resizes the drawing buffer. */
    shot(o = {}) {
      const r = ctx.renderer, c = ctx.camera, prev = r.getSize(new ctx.THREE.Vector2());
      if (o.w) { r.setSize(o.w, o.h ?? Math.round(o.w * 9 / 16), false); c.aspect = r.domElement.width / r.domElement.height; c.updateProjectionMatrix(); }
      ctx.render();
      const url = r.domElement.toDataURL('image/jpeg', o.q ?? 0.9);
      if (o.w) { r.setSize(prev.x, prev.y, false); c.aspect = prev.x / prev.y; c.updateProjectionMatrix(); }
      return url;
    },
    setHour(h) { ctx.setHour(h); },
    buildings() {
      return [...ctx.buildings.values()].map((bp) => ({
        id: bp.id, name: bp.lot?.name, kind: bp.lot?.kind, x: bp.lot?.x, y: bp.lot?.y, z: bp.lot?.z, floors: bp.lot?.floors,
        rooms: bp.rooms?.length ?? 0, doors: bp.doors?.length ?? 0, entrances: bp.entrances ?? [],
      }));
    },
    /** Teleport just inside a building's first entrance (or onto its lot centre), facing inward. */
    enter(id, i = 0) {
      const bp = ctx.buildings.get(id); if (!bp) throw new Error('no building ' + id);
      const e = bp.entrances?.[i];
      if (e) { const [x, y, z] = e.inside; P().teleport(x, z, { y, yaw: e.yawIn ?? 0 }); }
      else P().teleport(bp.lot.x, bp.lot.z, { y: bp.lot.y });
      return api.state();
    },
    /** Spawn-independent list of NPCs (people module publishes ctx.people). */
    npcs() { return ctx.people?.list?.() ?? []; },
    anchors() { return ctx.anchors; },
    discoveries() { return [...ctx.discover.items.values()].map((d) => ({ ...d, found: ctx.discover.found.has(d.id) })); },
    errors() { return ctx.errors; },
  });
}
