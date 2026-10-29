// STUB - owner: PEOPLE agent (A4). Characters, animation, NPC life, dialogue (Spanish) and text-to-speech.
/** Load character GLBs, TTS voices, dialogue data. */
export async function loadPeople(ctx) { ctx.people = { list: () => [] }; }
/** Create the NPC population (runs after physics/colliders exist). Register ctx.addSystem('people', update, 20). */
export function spawnPeople(ctx) { /* nothing yet */ }
