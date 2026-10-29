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
  await world.load();
}

/** Create the NPC population (runs after physics/colliders exist). */
export function spawnPeople(ctx) {
  worlds.get(ctx)?.spawn();
}
