// STUB - owner: ENVIRONMENT agent (A5). Builds terrain, streets, stairs, retaining walls, plazas (+ their colliders).
export async function buildWorld(ctx) {
  const b = ctx.batch.builder('world.ground');
  b.slab('ground_dirt', [[-100, -100], [100, -100], [100, 100], [-100, 100]], null, -1, 0);
  ctx.batch.flush('world.ground');
}
