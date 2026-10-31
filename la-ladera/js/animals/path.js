// A small adapter to the EXISTING pedestrian walker. The PeopleWorld clock drives it;
// there is no second nav graph, collision solver, timer, or simulation system.
import { Npc, BODY } from '../people/npc.js';

export function makeAnimalWalker(world, { id, meta, position, rng }) {
  const npc = new Npc({ id, rng, lane: 0, speedBase: meta.speed ?? 0.7,
    body: { ...BODY, radius: meta.radius ?? 0.2, height: meta.height ?? 0.6,
      stepUp: Math.min(BODY.stepUp, Math.max(0.15, (meta.height ?? 0.6) * 0.5)) } });
  npc.place(position.x, position.y, position.z, position.ry ?? 0);
  // Inhabitant routines must never be run on animals. Arrivals and idle tasks use
  // Npc's existing continuations; a blocked follower simply rests and tries later.
  const service = {
    get t() { return world.t; },
    physics: world.physics,
    near: (n, radius) => world.near(n, radius),
    brain: {
      next: (n, w) => n.stand(w, 'idle', 5),
      unstick: (n, w) => { const cb = n.arrive; n.arrive = null; n.stand(w, 'idle', 4, null, cb); },
    },
  };
  const follower = {
    npc,
    step: (dt) => npc.step(dt, service),
    stand: (act = 'idle', seconds = 5, then = null) => npc.stand(service, act, seconds, null, then),
    /** Existing A* and PeopleWorld waypoint/lane rules, followed by Npc.walk(). */
    follow(target, arrived = null) {
      if (!Number.isInteger(target) || !world.nav?.pos(target)) return false;
      const from = world.nav.nearest(npc.x, npc.z, 25, npc.y);
      if (from < 0) return false;
      const path = world.nav.path(from, target);
      if (!path?.length) return false;
      return npc.walk(service, world.waypoints(npc, path), arrived, npc.speedBase);
    },
  };
  return follower;
}
