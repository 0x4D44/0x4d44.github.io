// The animal library is an optional visual follower of the existing PeopleWorld.
// It adds no system, colliders, discovery entries, people, schedules or nav graph.
// Where each animal lives and when it is about: habitat.js. How it walks: path.js (the people's own A*, waypoints and Npc walker). The models: library.js.
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { makeAnimalWalker } from './path.js';
import { loadAnimalLibrary, instantiateAnimal } from './library.js';
import { planAnimals, restsAt, roostsAt, ROLES } from './habitat.js';

export { planAnimals };
export const ANIMAL_LIMITS = Object.freeze({ near: 18, far: 72, maxNear: 6, count: ROLES.length });
const ROAM = { dog: 16, cat: 10, pigeon: 5, hen: 5, mule: 12 };
const SHY = 1.15;      // metres: somebody this close to an animal at rest makes it get up and move off. Nothing in the barrio is solid to an animal and nobody steps round one, so it is the animal that yields
const SEEN = 25;       // metres: an animal that is due to roost, this close and in view, waits until it is out of sight (nothing vanishes in front of the player)
const installed = new WeakMap(), preloaded = new WeakMap();

/** Start fetching the fourteen small models (0.6 MB) now: the page calls this beside loadPeople so they come down while the houses are built, and loadAnimals takes the same
 * promise. Never rejects; null means no bank (a missing file, a timeout, ?skip=animals), and then the barrio is exactly as it was. */
export function preloadAnimals(ctx, options = {}) {
  if (ctx.opts?.skip?.has('animals')) return Promise.resolve(null);
  if (!preloaded.has(ctx)) preloaded.set(ctx, loadAnimalLibrary(ctx, options).catch(() => null));
  return preloaded.get(ctx);
}

/** Attach only a completely loaded bank. A missing GLB changes nothing in the scene.
 * Requires the existing people world: skip=people also disables animal followers. */
export async function loadAnimals(ctx, options = {}) {
  if (ctx.opts?.skip?.has('animals')) return null;
  if (installed.has(ctx)) return installed.get(ctx);
  const world = options.world ?? ctx.people?._world;
  if (!world?.ready || !world.nav?.size || !world.addPathFollower) return null;
  const early = preloaded.get(ctx); preloaded.delete(ctx);                       // a bank is used once: a disposed one is never handed out again
  const bank = await (early ?? loadAnimalLibrary(ctx, options));
  if (!bank) return null;
  const placements = planAnimals(ctx, world, bank);
  if (!placements.length) { bank.dispose?.(); return null; }
  const group = new THREE.Group(); group.name = 'animals';
  const actors = [], rng = makeRng(ctx.seed ?? 1).fork('animal-clips'), hour = () => ctx.hour ?? 12;
  try {
    for (const p of placements) {
      const view = instantiateAnimal(ctx, bank.get(p.key)); view.root.name = p.id;
      view.root.position.set(p.position.x, p.position.y, p.position.z); view.root.rotation.y = p.position.ry;
      group.add(view.root);
      const follower = p.fixed ? null : makeAnimalWalker(world, p);
      const a = { ...p, view, follower, clip: 'idle', accum: 0, phase: rng.fork(p.id).range(0, 7), dist: Infinity, hidden: false, calm: 0 };
      if (follower) {
        const asleep = () => restsAt(p.key, hour());
        const rest = () => (asleep() ? follower.stand('idle', p.rng.range(8, 14), later) : follower.stand('eat', p.rng.range(2.5, 5), () => follower.stand('idle', p.rng.range(3, 7), later)));
        // `away` is somebody who has stepped up to it (a person, the player): it goes to the neighbouring node farthest from them, at a trot. Otherwise a node next to where it is, near its home.
        const wander = (away = null) => {
          if (asleep() && !away) { rest(); return; }
          const n = follower.npc, from = world.nav.nearest(n.x, n.z, 15, n.y);
          const candidates = (world.nav.adj[from] ?? []).filter((i) => {
            const q = world.nav.pos(i);
            return world.inMain(i) && (p.key !== 'mule' || q.kind !== 'stair') && Math.hypot(q.x - p.position.x, q.z - p.position.z) <= ROAM[p.key];
          });
          if (away) { const d = (i) => Math.hypot(world.nav.pos(i).x - away.x, world.nav.pos(i).z - away.z); candidates.sort((u, v) => d(v) - d(u)); }
          const to = away ? candidates[0] : p.rng.pick(candidates);
          if (!candidates.length || !follower.follow(to, rest, away ? n.speedBase * 1.7 : n.speedBase)) rest();
        };
        const later = () => wander();            // the continuation of a stand is called with (npc, world): never an `away`
        a.wander = wander;
        follower.stand('idle', 1.5 + a.phase, later);
      }
      actors.push(a);
    }
  } catch { for (const a of actors) a.view.dispose(); bank.dispose?.(); return null; }

  const update = (dt) => {
    const eye = ctx.camera?.position ?? world.player, h = hour();
    for (const a of actors) {
      a.dist = Math.hypot(a.view.root.position.x - eye.x, a.view.root.position.y - eye.y, a.view.root.position.z - eye.z);
      // Dusk sends the pigeons to their loft and the hens to their coop, out of sight, once nobody is looking at them; dawn lets them out again.
      if (roostsAt(a.key, h)) { if (!a.hidden && !(a.dist < SEEN && world._frustum?.containsPoint?.(a.view.root.position))) a.hidden = true; } else a.hidden = false;
    }
    // A fixed geometry ceiling remains true even if every animal converges at a junction.
    const near = new Set(actors.filter((a) => a.dist < ANIMAL_LIMITS.near && !a.hidden).sort((a, b) => a.dist - b.dist).slice(0, ANIMAL_LIMITS.maxNear));
    for (const a of actors) {
      const visible = a.dist < ANIMAL_LIMITS.far && !a.hidden;
      a.view.root.visible = visible;
      if (!visible) { a.accum = 0; continue; }
      a.accum += dt;
      if (a.follower && a.accum >= (near.has(a) ? 1 / 30 : 0.2)) {
        a.follower.step(Math.min(a.accum, 0.25)); a.accum = 0;
        const n = a.follower.npc;
        if (n.mode === 'idle' && world.t >= a.calm) {                                  // somebody on top of it: it yields (and is left alone for a few seconds, whatever happens)
          const o = world.near?.(n, SHY)?.[0];
          if (o) { a.calm = world.t + 3; a.wander(o); }
        }
        a.view.root.position.set(n.x, n.y, n.z); a.view.root.rotation.y = n.ry;
        a.clip = n.moving && n.mode === 'walk' ? 'walk' : n.act === 'eat' ? 'eat' : 'idle';
        a.view.play(a.clip, a.clip === 'walk' ? Math.max(0.5, Math.min(1.7, (n.curSpeed ?? n.speed) / n.speedBase)) : 1);
      } else if (!a.follower) {
        const phase = (world.t + a.phase) % 18;
        // A caged bird hops inside the stationary cage; a dog or a pigeon on a roof only idles and now and then lowers its head. All of them keep still when it is their hour of rest.
        a.clip = restsAt(a.key, h) || phase < 10 ? 'idle' : phase < 14 ? 'eat' : a.meta.caged ? 'walk' : 'idle';
        a.view.play(a.clip);
      }
      a.view.update(dt, !near.has(a));
    }
  };
  const remove = world.addPathFollower(update);
  ctx.scene.add(group);
  const api = {
    list: () => actors.map((a) => ({ id: a.id, species: a.key, habitat: a.habitat, x: a.view.root.position.x, y: a.view.root.position.y, z: a.view.root.position.z,
      clip: a.clip, visible: a.view.root.visible, hidden: a.hidden, lod: a.view.lod, caged: !!a.meta.caged, fixed: !!a.fixed })),
    // Active geometry before Three.js frustum culling; render.info remains the
    // authoritative count including the world's shadows and post-processing.
    stats: () => {
      const visible = actors.filter((a) => a.view.root.visible);
      return { count: actors.length, visible: visible.length, near: visible.filter((a) => !a.view.lod).length, maxNear: ANIMAL_LIMITS.maxNear,
        triangles: visible.reduce((n, a) => n + a.view.budgets[a.view.lod ? 'far' : 'near'].triangles, 0),
        drawCalls: visible.reduce((n, a) => n + a.view.budgets[a.view.lod ? 'far' : 'near'].drawCalls, 0),
        triangleCeiling: Math.min(actors.length, ANIMAL_LIMITS.maxNear) * 2700 + actors.length * 300 };
    },
    dispose() {
      if (installed.get(ctx) !== api) return;
      remove(); for (const a of actors) a.view.dispose(); bank.dispose?.(); group.removeFromParent();
      installed.delete(ctx); if (ctx.animals === api) delete ctx.animals;
    },
  };
  installed.set(ctx, api); ctx.animals = api; update(0);
  return api;
}
