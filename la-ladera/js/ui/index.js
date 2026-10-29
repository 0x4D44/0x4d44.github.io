// UI entry (owner: A1). installUI(ctx) wires the HUD to ctx.ui (idempotent); createFlow(ctx) owns the title / pause / panels state machine.
import { createHud } from './hud.js';
export { createFlow } from './flow.js';

export function installUI(ctx) {
  if (ctx.hud) return ctx.hud;
  const hud = createHud(ctx);
  Object.assign(ctx.ui, hud);
  ctx.hud = hud;
  return hud;
}
