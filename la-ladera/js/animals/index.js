// The animal library is an optional visual follower of the existing PeopleWorld.
// It adds no system, colliders, discovery entries, people, schedules or nav graph.
import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { makeAnimalWalker } from './path.js';
import { loadAnimalLibrary, instantiateAnimal } from './library.js';

export const ANIMAL_LIMITS = Object.freeze({ near: 18, far: 72, maxNear: 6, count: 10 });
const CAST = ['dog', 'cat', 'pigeon', 'hen', 'mule', 'parrot_caged', 'canary_caged', 'dog', 'cat', 'pigeon'];
const ROAM = { dog: 16, cat: 10, pigeon: 5, hen: 5, mule: 12 };
const installed = new WeakMap();

/** Deterministic placement uses an independent stream and READS existing physics. */
export function planAnimals(ctx, world, bank) {
  const nav = world.nav, spawn = ctx.plan?.spawn ?? { x: 0, z: 0 };
  const nodes = nav.nodes.filter((n) => world.inMain(n.i) && n.kind !== 'stair');
  if (!nodes.length) return [];
  const rng = makeRng(ctx.seed ?? 1).fork('animals'), used = [], out = [];
  for (const [index, key] of CAST.entries()) {
    const meta = bank.get(key).meta, r = rng.fork(key + ':' + index), radius = meta.radius ?? 0.25;
    // First animals are near the arrival street; later ones spread uphill.
    const distance = index < 4 ? 9 + index * 5 : 30 + (index - 4) * 9;
    const candidates = nodes.map((n) => ({ n, score: Math.abs(Math.hypot(n.x - spawn.x, n.z - spawn.z) - distance) + r.next() * 6 }))
      .sort((a, b) => a.score - b.score);
    for (const { n } of candidates) {
      if (used.some((p) => Math.hypot(p.x - n.x, p.z - n.z) < 4)) continue;
      let x = n.x, z = n.z;
      if (meta.caged) {
        const q = nav.pos(nav.adj[n.i][0]); if (!q) continue;
        const dx = q.x - n.x, dz = q.z - n.z, length = Math.hypot(dx, dz) || 1;
        const off = Math.max(1.1, Math.min(2.8, (n.w ?? 2) - radius - 0.15));
        x -= dz / length * off; z += dx / length * off;
      }
      const y = world.physics.groundAt(x, z, n.y + 0.6);
      if (!Number.isFinite(y) || Math.abs(y - n.y) > 0.35 || world.physics._overlaps?.(x, z, y, radius + 0.08, meta.height ?? 1)) continue;
      const position = { x, y, z, ry: r.range(-Math.PI, Math.PI) };
      used.push(position); out.push({ id: 'animal:' + key + ':' + index, key, meta, position, node: n.i, rng: r });
      break;
    }
  }
  return out;
}

/** Attach only a completely loaded bank. A missing GLB changes nothing in the scene.
 * Requires the existing people world: skip=people also disables animal followers. */
export async function loadAnimals(ctx, options = {}) {
  if (ctx.opts?.skip?.has('animals')) return null;
  if (installed.has(ctx)) return installed.get(ctx);
  const world = options.world ?? ctx.people?._world;
  if (!world?.ready || !world.nav?.size || !world.addPathFollower) return null;
  const bank = await loadAnimalLibrary(ctx, options);
  if (!bank) return null;
  const placements = planAnimals(ctx, world, bank);
  if (!placements.length) { bank.dispose?.(); return null; }
  const group = new THREE.Group(); group.name = 'animals';
  const actors = [], rng = makeRng(ctx.seed ?? 1).fork('animal-clips');
  try {
    for (const p of placements) {
      const view = instantiateAnimal(ctx, bank.get(p.key)); view.root.name = p.id;
      view.root.position.set(p.position.x, p.position.y, p.position.z); view.root.rotation.y = p.position.ry;
      group.add(view.root);
      const follower = p.meta.caged ? null : makeAnimalWalker(world, p);
      const a = { ...p, view, follower, clip: 'idle', accum: 0, phase: rng.fork(p.id).range(0, 7), dist: Infinity };
      const rest = () => follower.stand('eat', p.rng.range(2.5, 5), () => follower.stand('idle', p.rng.range(3, 7), wander));
      const wander = () => {
        const n = follower.npc, from = world.nav.nearest(n.x, n.z, 15, n.y);
        const candidates = (world.nav.adj[from] ?? []).filter((i) => {
          const q = world.nav.pos(i);
          return world.inMain(i) && (p.key !== 'mule' || q.kind !== 'stair') && Math.hypot(q.x - p.position.x, q.z - p.position.z) <= ROAM[p.key];
        });
        if (!candidates.length || !follower.follow(p.rng.pick(candidates), rest)) rest();
      };
      if (follower) follower.stand('idle', 1.5 + a.phase, wander);
      actors.push(a);
    }
  } catch { for (const a of actors) a.view.dispose(); bank.dispose?.(); return null; }

  const update = (dt) => {
    const eye = ctx.camera?.position ?? world.player;
    for (const a of actors) a.dist = Math.hypot(a.view.root.position.x - eye.x, a.view.root.position.y - eye.y, a.view.root.position.z - eye.z);
    // A fixed geometry ceiling remains true even if every animal converges at a junction.
    const near = new Set(actors.filter((a) => a.dist < ANIMAL_LIMITS.near).sort((a, b) => a.dist - b.dist).slice(0, ANIMAL_LIMITS.maxNear));
    for (const a of actors) {
      const visible = a.dist < ANIMAL_LIMITS.far;
      a.view.root.visible = visible;
      if (!visible) { a.accum = 0; continue; }
      a.accum += dt;
      if (a.follower && a.accum >= (near.has(a) ? 1 / 30 : 0.2)) {
        a.follower.step(Math.min(a.accum, 0.25)); a.accum = 0;
        const n = a.follower.npc;
        a.view.root.position.set(n.x, n.y, n.z); a.view.root.rotation.y = n.ry;
        a.clip = n.moving && n.mode === 'walk' ? 'walk' : n.act === 'eat' ? 'eat' : 'idle';
        a.view.play(a.clip, a.clip === 'walk' ? Math.max(0.5, Math.min(1.7, (n.curSpeed ?? n.speed) / n.speedBase)) : 1);
      } else if (!a.follower) {
        const phase = (world.t + a.phase) % 18;
        a.clip = phase < 10 ? 'idle' : phase < 14 ? 'eat' : 'walk'; // A hop inside the stationary cage.
        a.view.play(a.clip);
      }
      a.view.update(dt, !near.has(a));
    }
  };
  const remove = world.addPathFollower(update);
  ctx.scene.add(group);
  const api = {
    list: () => actors.map((a) => ({ id: a.id, species: a.key, x: a.view.root.position.x, y: a.view.root.position.y, z: a.view.root.position.z,
      clip: a.clip, visible: a.view.root.visible, lod: a.view.lod, caged: !!a.meta.caged })),
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
