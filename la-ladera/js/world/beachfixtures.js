// THE BEACH'S FIXTURES (A5, round 7, phase 2a): the colliders of everything beachfront.js lays out, and the pieces the Codex library has no model for, built as the town's own props are
// (batched procedural meshes: the changing huts, the palapas with their tables, the wooden posts of the sign plaques, the promenade's lamp posts with a real light each).
// The library's props (kiosks, loungers, parasols, towels, palms ...) are instanced by beachprops.js once that library is loaded; their colliders are made here, from the first frame,
// so the beach is as solid as it will ever be whenever the pictures arrive.
import { globePost } from './poles.js';

const PAINT = [[0.86, 0.36, 0.26], [0.26, 0.56, 0.62], [0.93, 0.78, 0.30], [0.32, 0.62, 0.42], [0.88, 0.56, 0.22], [0.62, 0.34, 0.52], [0.90, 0.90, 0.84], [0.36, 0.46, 0.76]];
const STRAW = [0.80, 0.66, 0.36], WOOD = [0.52, 0.40, 0.28], DOOR = [0.50, 0.36, 0.24], SHEET = [0.70, 0.72, 0.74];
const BEACH_BUILDER = 'beach';

/**
 * Every collider of the plan, as the kit makes them (kit.js rect: 0.3-0.9 m wide is one thick wall). A hut or a cart under 2 m is `solid` (one thick wall: it has no inside to turn in, and a
 * stadium that size hides no corner); the kiosks and the tower are the outline of four thin walls, so a walker cannot step into their corners (a circle of 1.6 m leaves 0.66 m of the
 * kiosk's corner outside it, and the camera would look through the thatch). Nobody can enter either: they have no door. Returns how many solids were made.
 */
export function addColliders(K, front) {
  let n = 0;
  for (const s of front.solids) {
    if (s.kind === 'rect') K.rect(s.x, s.z, s.w, s.d, s.ry, s.h, undefined, undefined, Math.min(s.w, s.d) < 2);
    else if (s.kind === 'post') K.post(s.x, s.z, s.r, s.h);
    else K.seg(s.x1, s.z1, s.x2, s.z2, s.h, s.t);
    n++;
  }
  return n;
}

/** The procedural fixtures and the promenade's lamp posts. Returns { huts, palapas, posts, lamps, triangles }. */
export function buildFixtures(K, front) {
  const { ctx } = K, b = K.one(BEACH_BUILDER, { cast: false });
  front.huts.forEach((h, i) => {
    const c = PAINT[i % PAINT.length], y = h.y, fz = h.z + h.d / 2;
    b.box('wood_painted', h.x, y + 1.05, h.z, h.w, 2.1, h.d, { col: c, skip: ['ny'] });                                   // the cabin
    b.box('galvanised', h.x, y + 2.2, h.z, h.w + 0.3, 0.06, h.d + 0.3, { col: SHEET });                                   // its roof sheet, overhanging
    b.box('wood_old', h.x, y + 0.98, fz + 0.02, 0.7, 1.85, 0.04, { col: DOOR, skip: ['ny', 'py', 'nz'] });                // the door
    b.box('wood_old', h.x, y + 1.98, fz + 0.015, 0.5, 0.12, 0.03, { col: [0.3, 0.26, 0.22], skip: ['ny', 'py', 'nz'] });  // a louvre above it
    b.box('iron_black', h.x + 0.26, y + 1.0, fz + 0.055, 0.04, 0.04, 0.05, { col: [0.2, 0.2, 0.22] });                    // the handle
  });
  front.palapas.forEach((p) => {
    const y = p.y, hw = p.w / 2 - 0.3, hd = p.d / 2 - 0.3, top = y + 2.7;
    for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) b.cyl('wood_old', p.x + px, y, p.z + pz, 0.1, 2.7, 6, { r1: 0.09, col: WOOD });
    for (const s of [-1, 1]) { b.box('wood_old', p.x, top - 0.07, p.z + s * hd, hw * 2 + 0.2, 0.14, 0.14, { col: WOOD }); b.box('wood_old', p.x + s * hw, top - 0.07, p.z, 0.14, 0.14, hd * 2, { col: WOOD }); }
    b.cyl('wood_old', p.x, top, p.z, p.w * 0.72, p.h - 1.5, 8, { r1: 0.25, col: STRAW });                                  // the thatch: an eight-sided pyramid over the square
    for (const tz of [-0.9, 0.9]) {
      b.box('wood_pine', p.x, y + 0.74, p.z + tz, 1.5, 0.05, 0.8, { col: [0.82, 0.7, 0.52] });
      for (const [lx, lz] of [[-0.66, -0.34], [0.66, -0.34], [-0.66, 0.34], [0.66, 0.34]]) b.box('wood_pine', p.x + lx, y + 0.36, p.z + tz + lz, 0.05, 0.72, 0.05, { col: [0.82, 0.7, 0.52] });
      for (const s of [-1, 1]) { b.box('wood_pine', p.x, y + 0.45, p.z + tz + s * 0.62, 1.4, 0.05, 0.26, { col: [0.74, 0.6, 0.42] }); for (const lx of [-0.6, 0.6]) b.box('wood_pine', p.x + lx, y + 0.22, p.z + tz + s * 0.62, 0.05, 0.45, 0.05, { col: [0.74, 0.6, 0.42] }); }
    }
  });
  for (const p of front.posts) b.box('wood_old', p.x, p.y + p.h / 2, p.z, 0.1, p.h, 0.1, { col: WOOD });                     // the sign plaques' posts
  for (const l of front.lamps) globePost(K, b, l.x, l.z, ctx);                                                             // the promenade's lamps: the town's globe post, a real light each (its collider is the post's own)
  return { huts: front.huts.length, palapas: front.palapas.length, posts: front.posts.length, lamps: front.lamps.length, triangles: b.tris };
}
