// The viewpoint tower (R1-D01: from the Mirador del Cielo at plaza level every roof around stands as high as the eye, so the "view" is a wall of flat roofs
// and a grass hill). A solid concrete tower with an outside spiral stair on the summit lawn east of the viewpoint plaza: four flights round a square core, a
// landing at each corner, 10 m of climb to a deck with a parapet and a flag. From the deck the roofs of the barrio step down to the rim and the city lies beyond.
// Everything is plain data first (`towerPlan`: floors, walls, flights; pure, so the test walks the same numbers the world builds) and meshes second.
// Physics: each flight is a sloped floor (slope 0.69, the kernel climbs 0.9), the landings and the deck flat floors, the stair's outer side a wall as high as the deck
// parapet, the core a wall: nobody walks off, through, or under. The last flight stops 1 m short of the corner and goes flat, so a walker steps off it onto the deck
// with no step to find (a flight that meets the deck only at its very end leaves a 25 cm window under the 0.5 m step-up).
import { OCC } from './occupancy.js';
import { vnoise, ss } from './geom.js';
import { panel } from './signs.js';

export const TOWER = { core: 3.9, arm: 1.3, deck: 10, topLen: 1.0, slopeTop: 0.66, rail: 0.9, parapet: 1.1 };
const SITES = [[42.5, -91.5], [9.0, -91.5], [42.5, -80.0], [9.0, -80.0]];     // beside the viewpoint plaza (x 16 to 36, z -95 to -87); the first free one is built
const W = [1, 1, 1];
const SEED = 6113;
const SIGN = { w: 2.4, h: 0.64, above: 1.5 };     // the board that names the tower, hung on its west face (toward the plaza): its size, and its foot above the ground in front

/**
 * R1-D18: concrete that has stood in the rain. The tone (a plain multiplier, 0.5 to 1.1) of the face at `u` along it and height `y` over its buried foot: blotches the size of a pour lift,
 * rain streaks that run down from the cap (a hand wide, metres long, strongest near the top: `fall` m below it) and a damp, dark foot. `k` tells one face from the next.
 */
export function weathered(u, y, fall, k) {
  const blotch = 0.07 * vnoise(u, y, 2.2, SEED + k), streak = ss(0.35, 0.8, 0.5 + 0.5 * vnoise(u, y * 0.14, 0.5, SEED + 5 + k)) * (0.35 + 0.65 * (1 - ss(0, 8, fall)));
  const foot = 1 - ss(0, 1.8, y - 0.5), cap = 1 - ss(0, 0.7, fall);
  return Math.max(0.45, 1 + blotch - 0.22 * streak - 0.32 * foot - 0.08 * cap);
}
const warm = (t) => [t, t * 0.985, t * 0.955];                                    // dirt is a little warmer than the concrete

/** The whole tower as data. (cx, cz) the centre of the core, y0 the ground at the entry. */
export function towerPlan(cx, cz, y0) {
  const { core, arm, deck, topLen, slopeTop } = TOWER, c = core / 2, R = c + arm, dLen = core - topLen, rD = slopeTop * dLen, F = (deck - rD) / 3;
  const sq = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  // flights in climbing order: start offset (ax, az) from the centre, direction (ux, uz), length, rise, step count, height of the start above y0
  const flights = [
    { name: 'A', ax: -c, az: c + arm / 2, ux: 1, uz: 0, len: core, rise: F, n: 13, h0: 0 },
    { name: 'B', ax: c + arm / 2, az: c, ux: 0, uz: -1, len: core, rise: F, n: 13, h0: F },
    { name: 'C', ax: c, az: -c - arm / 2, ux: -1, uz: 0, len: core, rise: F, n: 13, h0: 2 * F },
    { name: 'D', ax: -c - arm / 2, az: -c, ux: 0, uz: 1, len: dLen, rise: rD, n: 10, h0: 3 * F },
  ];
  const landings = [                                                      // flat squares: the corners where a flight turns, and the top of the last one
    { name: 'SE', x0: cx + c, x1: cx + R, z0: cz + c, z1: cz + R, top: F },
    { name: 'NE', x0: cx + c, x1: cx + R, z0: cz - R, z1: cz - c, top: 2 * F },
    { name: 'NW', x0: cx - R, x1: cx - c, z0: cz - R, z1: cz - c, top: 3 * F },
    { name: 'top', x0: cx - R, x1: cx - c, z0: cz + c - topLen, z1: cz + c, top: deck },
  ];
  const floors = [
    { id: 'tower.A', pts: sq(cx - c, cx + c, cz + c, cz + R), y: y0, px: cx - c, pz: 0, a: F / core, b: 0 },
    { id: 'tower.B', pts: sq(cx + c, cx + R, cz - c, cz + c), y: y0 + F, px: 0, pz: cz + c, a: 0, b: -F / core },
    { id: 'tower.C', pts: sq(cx - c, cx + c, cz - R, cz - c), y: y0 + 2 * F, px: cx + c, pz: 0, a: -F / core, b: 0 },
    { id: 'tower.D', pts: sq(cx - R, cx - c, cz - c, cz + c - topLen), y: y0 + 3 * F, px: 0, pz: cz - c, a: 0, b: rD / dLen },
    ...landings.map((l) => ({ id: 'tower.' + l.name, pts: sq(l.x0, l.x1, l.z0, l.z1), y: y0 + l.top, px: 0, pz: 0, a: 0, b: 0 })),
    { id: 'tower.deck', pts: sq(cx - c, cx + c, cz - c, cz + c), y: y0 + deck, px: 0, pz: 0, a: 0, b: 0 },
  ];
  const lo = y0 - 0.5, hi = y0 + deck + TOWER.parapet, wall = (x1, z1, x2, z2, t, y0w, y1w) => ({ x1, z1, x2, z2, t, y0: y0w, y1: y1w, id: 'prop' });
  const walls = [
    wall(cx - R, cz - R, cx + R, cz - R, 0.07, lo, hi), wall(cx + R, cz - R, cx + R, cz + R, 0.07, lo, hi),            // the outer side of the stair, as high as the parapet
    wall(cx - c, cz + R, cx + R, cz + R, 0.07, lo, hi), wall(cx - R, cz - R, cx - R, cz + c, 0.07, lo, hi),
    wall(cx - R, cz + c, cx - c, cz + c, 0.07, lo, hi),                                                               // across the end of the last flight (and the foot of its solid block)
    wall(cx - c, cz - c, cx + c, cz - c, 0.05, lo, y0 + deck), wall(cx + c, cz - c, cx + c, cz + c, 0.05, lo, y0 + deck),   // the core
    wall(cx - c, cz + c, cx + c, cz + c, 0.05, lo, y0 + deck), wall(cx - c, cz - c, cx - c, cz + c, 0.05, lo, y0 + deck),
    wall(cx - c, cz - c + 0.1, cx + c, cz - c + 0.1, 0.1, y0 + deck, hi), wall(cx + c - 0.1, cz - c, cx + c - 0.1, cz + c, 0.1, y0 + deck, hi),   // the deck parapet; the west one stops 1.2 m short of the corner
    wall(cx - c, cz + c - 0.1, cx + c, cz + c - 0.1, 0.1, y0 + deck, hi), wall(cx - c + 0.1, cz - c, cx - c + 0.1, cz + c - topLen - 0.2, 0.1, y0 + deck, hi),
  ];
  const route = [                                                       // lane centres, in climbing order, for a walker (the test) and for anyone placing something on the stair
    [cx - c - arm / 2, cz + c + arm / 2], [cx - c + 0.5, cz + c + arm / 2], [cx + c - 0.2, cz + c + arm / 2], [cx + c + arm / 2, cz + c + arm / 2],
    [cx + c + arm / 2, cz + c - 0.5], [cx + c + arm / 2, cz - c + 0.2], [cx + c + arm / 2, cz - c - arm / 2],
    [cx + c - 0.5, cz - c - arm / 2], [cx - c + 0.2, cz - c - arm / 2], [cx - c - arm / 2, cz - c - arm / 2],
    [cx - c - arm / 2, cz - c + 0.5], [cx - c - arm / 2, cz + c - topLen - 0.1], [cx - c - arm / 2, cz + c - 0.5], [cx - c + 0.5, cz + c - 0.5], [cx, cz],
  ];
  return { cx, cz, y0, c, R, F, rD, dLen, deckY: y0 + deck, entry: route[0], flights, landings, floors, walls, route };
}

export function buildTower(K, stats) {
  const { ctx, H, occ } = K, { core, arm, deck, topLen, rail } = TOWER;
  const R = core / 2 + arm, site = SITES.find(([x, z]) => K.rectFree(x, z, 2 * R + 1, 2 * R + 1, 0, { slope: 0.3 }));
  if (!site) return null;
  const [cx, cz] = site, c = core / 2, y0 = H(cx - c - arm / 2, cz + c + arm / 2), T = towerPlan(cx, cz, y0), b = K.b('feature', cx, cz);
  const body = 'concrete_formwork', stone = 'concrete_bare', paint = 'plaster_rough#e3d9c6', base = y0 - 0.5;
  const stain = (x, y, z) => warm(0.8 + 0.2 * (0.5 + 0.5 * vnoise(x + z * 1.3, y, 1.6, SEED + 9)) - 0.3 * (1 - ss(0, 1.5, y - y0)));   // each tread and landing block is a pour of its own: a tone each, darker at the foot
  const solid = (mat, x, z, sx, sz, top) => b.box(mat, x, (base + top) / 2, z, sx, top - base, sz, { col: stain(x, top, z), skip: ['ny'] });
  // the core: four faces, each a grid of quads toned by `weathered` (a box has one colour a face), no top (the deck cap covers it) and no foot
  const faces = [                                                                                                           // where along the face u runs to the viewer's right, so every quad faces out
    (s, y) => [cx - c + s, y, cz + c], (s, y) => [cx + c, y, cz + c - s], (s, y) => [cx + c - s, y, cz - c], (s, y) => [cx - c, y, cz - c + s],
  ];
  faces.forEach((at, k) => {
    const nu = Math.ceil(core / 0.3), nv = Math.ceil((y0 + deck - base) / 0.7);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const sa = (core * i) / nu, sb = (core * (i + 1)) / nu, ya = base + ((y0 + deck - base) * j) / nv, yb = base + ((y0 + deck - base) * (j + 1)) / nv;
      const tone = (s, y) => warm(weathered(s + k * 17, y - base, y0 + deck - y, k));
      b.quad(body, at(sa, ya), at(sb, ya), at(sb, yb), at(sa, yb), { cols: [tone(sa, ya), tone(sb, ya), tone(sb, yb), tone(sa, yb)] });
    }
  });
  for (const f of T.flights) {                                                                                                // the steps: solid concrete from the ground up, one box per tread, a low wall on the outer edge that follows them
    const tread = f.len / f.n, riser = f.rise / f.n, sx = f.ux ? tread : arm, sz = f.uz ? tread : arm;
    for (let i = 0; i < f.n; i++) {
      const x = cx + f.ax + f.ux * (i + 0.5) * tread, z = cz + f.az + f.uz * (i + 0.5) * tread, top = y0 + f.h0 + (i + 1) * riser;
      solid(stone, x, z, sx, sz, top);
      const ox = f.uz ? Math.sign(f.ax) * (arm / 2 - 0.07) : 0, oz = f.ux ? Math.sign(f.az) * (arm / 2 - 0.07) : 0;          // toward the outside of the stair
      b.box(paint, x + ox, top + rail / 2, z + oz, f.ux ? tread : 0.14, rail, f.uz ? tread : 0.14, { col: stain(x + ox, top, z + oz), skip: ['ny'] });
    }
  }
  const OUTER = { SE: 'ES', NE: 'EN', NW: 'NW', top: 'W' };                                                                   // which edges of each landing face the outside
  for (const l of T.landings) {
    const x = (l.x0 + l.x1) / 2, z = (l.z0 + l.z1) / 2, top = y0 + l.top, sx = l.x1 - l.x0, sz = l.z1 - l.z0;
    solid(stone, x, z, sx, sz, top);
    for (const side of OUTER[l.name]) {
      const [rx, rz, w, d] = { E: [l.x1 - 0.07, z, 0.14, sz], W: [l.x0 + 0.07, z, 0.14, sz], N: [x, l.z0 + 0.07, sx, 0.14], S: [x, l.z1 - 0.07, sx, 0.14] }[side];
      b.box(paint, rx, top + rail / 2, rz, w, rail, d, { col: stain(rx, top, rz), skip: ['ny'] });
    }
  }
  b.box(paint, cx - c - arm / 2, y0 + deck + rail / 2, cz + c - 0.07, arm, rail, 0.14, { col: W, skip: ['ny'] });             // the end of the last flight
  // the deck: a cap over the core, a parapet on three sides and on the west one but the stair end, four pillars, a flagpole at the north-east corner
  const dy = y0 + deck, p = TOWER.parapet, wl = core - topLen - 0.2;
  b.box(stone, cx, dy - 0.06, cz, core + 0.12, 0.12, core + 0.12, { col: stain(cx, dy, cz), skip: ['ny'] });
  const IRON = [0.17, 0.18, 0.19];
  const handrail = (x, z, len, alongX) => {                                                                                    // R1-D18: a real handrail (posts, a top rail, a mid rail, a low kerb), not a solid wall; the collider stays the full wall
    const n = Math.max(1, Math.round(len / 1.0)), sx = alongX ? len : 0.07, sz = alongX ? 0.07 : len, at = (t) => (alongX ? [x - len / 2 + t * len, z] : [x, z - len / 2 + t * len]);
    for (let k = 0; k <= n; k++) { const [px, pz] = at(k / n); b.box('iron_black', px, dy + 0.52, pz, 0.07, 1.04, 0.07, { col: IRON }); }
    b.box('iron_black', x, dy + 1.0, z, sx, 0.06, sz, { col: IRON }); b.box('iron_black', x, dy + 0.52, z, sx, 0.04, sz, { col: IRON });
    b.box(stone, x, dy + 0.06, z, alongX ? len : 0.2, 0.12, alongX ? 0.2 : len, { col: W });
  };
  handrail(cx, cz - c + 0.1, core, true); handrail(cx + c - 0.1, cz, core, false); handrail(cx, cz + c - 0.1, core, true); handrail(cx - c + 0.1, cz - c + wl / 2, wl, false);
  for (const [px, pz] of [[cx - c + 0.1, cz - c + 0.1], [cx + c - 0.1, cz - c + 0.1], [cx + c - 0.1, cz + c - 0.1], [cx - c + 0.1, cz + c - topLen - 0.3]]) {
    b.box(paint, px, dy + 0.65, pz, 0.34, 1.3, 0.34, { col: W }); b.box(stone, px, dy + 1.35, pz, 0.46, 0.1, 0.46, { col: W });
  }
  const fx = cx + c - 0.1, fz = cz - c + 0.1, top = dy + 4.6;
  b.cyl('iron_black', fx, dy + 1.3, fz, 0.035, top - dy - 1.3, 6, { col: W });
  for (const [below, h, col] of [[0.12, 0.24, [1, 0.78, 0.08]], [0.3, 0.12, [0.1, 0.22, 0.62]], [0.42, 0.12, [0.72, 0.08, 0.1]]]) b.box('plaster_a', fx - 0.5, top - below, fz, 0.9, h, 0.02, { col });   // the flag: yellow, blue, red
  // R1-D18: the board that names it, on the face the viewpoint plaza sees: "MIRADOR / del Cielo", in a plain wooden frame flush to the wall. West face: solid from cz - R to cz + c (a stair block and
  // two landings); east face: solid the whole way (z +- R) up to the first flight's height, so the board stands at eye height on either.
  // The plaza's balustrade (1.1 m) hides what hangs lower than its own level + 1.5 m, and the tower's foot can stand a couple of metres under the plaza: the board hangs where the plaza's eye finds it.
  const mir = K.plan.landmarks?.find((l) => l.id === 'mirador'), side = mir && mir.x < cx ? -1 : 1, plazaY = mir ? H(mir.x, mir.z) : y0;
  const ceil = y0 + (side < 0 ? 5.5 : 1.9);                                           // the stair block under the board is solid to 8 m on the west face, to the first flight's 2.7 m on the east
  const sx = cx + side * R, sz = side < 0 ? cz - arm / 2 : cz, sy = Math.min(ceil, Math.max(H(sx + side * 0.6, sz) + SIGN.above, plazaY + 1.5));
  b.box('wood_dark', sx + side * 0.015, sy + SIGN.h / 2, sz, 0.03, SIGN.h + 0.07, SIGN.w + 0.07, { col: [0.42, 0.38, 0.34] });
  panel(K, b, 'hand.mirador', sx + side * 0.034, sz, side, 0, SIGN.w, sy, sy, SIGN.h);
  for (const w of T.walls) ctx.physics.addWall(w);
  for (const f of T.floors) ctx.physics.addFloor(f);
  for (let x = cx - R + 0.7; x <= cx + R; x += 1.4) for (let z = cz - R + 0.7; z <= cz + R; z += 1.4) occ.take(x, z, 0.69, 'tower');           // flora and clutter keep off it
  ctx.world.tower = { x: cx, z: cz, y0, deckY: dy, half: R, entry: T.entry, route: T.route, sign: { x: sx + side * 0.034, z: sz, y: sy, w: SIGN.w, h: SIGN.h, side, ceil } };
  stats.tower = 1;
  return T;
}
