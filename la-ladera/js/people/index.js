// PEOPLE (A4): characters, animation, NPC life, dialogue (Spanish) and text-to-speech. See js/people/world.js for the structure.
//   loadPeople(ctx)  - async: character GLB + clips, speech voices, conversation UI. Publishes ctx.people (list() works at once, empty until spawn).
//   spawnPeople(ctx) - sync, after physics exists: casts the inhabitants and registers ctx.addSystem('people', update, 20).
import { PeopleWorld } from './world.js';

const worlds = new WeakMap();

/** Load character GLBs, TTS voices, dialogue data. */
export async function loadPeople(ctx) {
  const world = new PeopleWorld(ctx);
  worlds.set(ctx, world);
  ctx.people = world.api;
  if (typeof window !== 'undefined') (window.__ladera ??= {}).lookAtNpc = (id, o) => world.lookAtNpc(id, o);       // reviewers: stand in front of a person, aimed at the face (dev/REVIEWER-BRIEF.md)
  await world.load();
}

/**
 * Create the NPC population (runs after physics/colliders exist). `o.progressive` (the lazy boot, js/main.js): the cast is made but comes into the barrio as the buildings are furnished (sim.js `build`).
 * Returns the world (null when there is none), so that the boot can wait for the last arrival.
 */
export function spawnPeople(ctx, o = {}) {
  const world = worlds.get(ctx) ?? null;
  world?.spawn(null, o);
  return world;
}
