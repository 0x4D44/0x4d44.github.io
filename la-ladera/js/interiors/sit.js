// Sitting down (the player). Only the CAMERA moves: the body stays on its feet at the spot in front of the seat, so the physics, the
// interaction targeting and the discovery check keep working exactly as before; this system puts the view on the seat, a seated eye height
// above the cushion, facing the way the seat faces. Any walking key (or E with nothing targeted) stands you up again.
//   ctx.interiorSit = { active: null | { building, eye:[x,y,z], yaw, stand:[x,z], since } }
const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyC'];   // no Ctrl: it is not a game key (Ctrl+W closes the tab)
const EYE_ABOVE_SEAT = 0.64, FORWARD = 0.12;

function install(ctx) {
  const S = ctx.interiorSit = { active: null, ePrev: false };
  ctx.addSystem?.('interiors-sit', (dt) => {
    const a = S.active, p = ctx.player;
    if (!a || !p) { S.ePrev = !!p?.keys?.has('KeyE'); return; }
    a.since += dt;
    const e = p.keys?.has('KeyE'), eRise = e && !S.ePrev; S.ePrev = !!e;
    const moved = MOVE.some((c) => p.keys?.has(c)) || Math.hypot(p.s.x - a.stand[0], p.s.z - a.stand[1]) > 0.45 || p.building !== a.building;
    if (a.since > 0.3 && (moved || (eRise && !ctx.interact?.target))) { stand(ctx); return; }
    ctx.camera.position.set(a.eye[0], a.eye[1], a.eye[2]);
  }, 31);
  return S;
}

/** Sit on a seat: `spec` = { building, seat:[x,y,z] (floor point under the hips, world), seatH, ry (world facing of the sitter), stand:[x,z] (only used when the player has no position) }.
 *  The body stays where it is, and "walked away" is measured from THERE: a seat is offered from up to 1.9 m, so measuring from the seat's own interaction point stood a distant sitter up at once. */
export function sitDown(ctx, spec) {
  const S = ctx.interiorSit ?? install(ctx), p = ctx.player;
  if (!p || S.active) return false;
  const s = Math.sin(spec.ry), c = Math.cos(spec.ry);
  const here = p.s ? [p.s.x, p.s.z] : spec.stand;
  S.active = { building: spec.building, stand: here, since: 0, eye: [spec.seat[0] + s * FORWARD, spec.seat[1] + spec.seatH + EYE_ABOVE_SEAT, spec.seat[2] + c * FORWARD] };
  p.setLook?.(spec.ry + Math.PI, -0.06);
  ctx.ui?.toast?.('Te sientas un rato. Camina para levantarte.', 2600);
  return true;
}

export function stand(ctx) {
  const S = ctx.interiorSit; if (!S?.active) return false;
  S.active = null; return true;
}

export const isSitting = (ctx) => !!ctx.interiorSit?.active;
export const ensureSit = (ctx) => ctx.interiorSit ?? install(ctx);
