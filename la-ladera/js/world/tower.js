// The viewpoint tower (R1-D01: from the Mirador del Cielo at plaza level every roof around stands as high as the eye, so the "view" is a wall of flat roofs
// and a grass hill). A solid concrete tower with an outside spiral stair on the summit lawn east of the viewpoint plaza: four flights round a square core, a
// landing at each corner, 10 m of climb to a deck under a small tiled roof with a lit lantern and a flag. From the deck the roofs of the barrio step down to the rim and the city lies beyond.
// Everything is plain data first (`towerPlan`: floors, walls, flights; `towerDress`: the railing, the roof, the lamp, the ladder, the tags; both pure, so the tests walk the
// same numbers the world builds) and meshes second.
// Physics: each flight is a sloped floor (slope 0.69, the kernel climbs 0.9), the landings and the deck flat floors, the stair's outer side a wall as high as the deck
// parapet, the core a wall: nobody walks off, through, or under. The last flight stops 1 m short of the corner and goes flat, so a walker steps off it onto the deck
// with no step to find (a flight that meets the deck only at its very end leaves a 25 cm window under the 0.5 m step-up). The dressing is all visual: no collider but the plan's.
import { OCC } from './occupancy.js';
import { vnoise, ss, hash2 } from './geom.js';
import { panel, TAGS, PAPERS } from './signs.js';
import { beam, tube } from './mk.js';

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
const n01 = (x, z, s, k) => 0.5 + 0.5 * vnoise(x, z, s, SEED + k);                // value noise in 0..1
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

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

/** The top of the stair block (a tread or a landing) that stands under the point, as a height over y0, or null where there is none. */
function blockTop(P, x, z) {
  for (const l of P.landings) if (x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1) return l.top;
  for (const f of P.flights) {
    const dx = x - (P.cx + f.ax), dz = z - (P.cz + f.az), u = dx * f.ux + dz * f.uz, w = Math.abs(-dx * f.uz + dz * f.ux);
    if (u >= 0 && u < f.len && w <= TOWER.arm / 2) return f.h0 + (Math.floor(u / (f.len / f.n)) + 1) * (f.rise / f.n);
  }
  return null;
}

const IN = 0.07;                                                                  // the railing stands this far inside the stair's outer edge (the old knee wall's centre line)
const RAIL = { cap: 0.55, top: 1.02, mid: 0.78 };                                 // over the stair's floor plane: the top of the wall-cap, the top rail, the mid rail (the deck's handrail: 1.0 and 0.52 over a 0.12 kerb)
const ROOF = { eave: 2.75, over: 0.6, rise: 1.2, thick: 0.07, plate: 0.14 };      // over the deck: the eave's height (2.54 under the plate, 0.09 over the 2.45 a walker needs), how far the roof reaches past the posts, its rise, its thickness, the plate under it
const LADDER = { zc: 1.3, off: 0.14, w: 0.4, low: 6.2, pitch: 0.3, rungs: 17, over: 0.7, cage: 2.5 };   // the maintenance ladder on the core's east face: the lowest rung 6.2 over y0 (2.6 m over the highest step under it), a rung every 0.3 m, the stiles `over` m above the last, a cage on the top 2.5 m

/**
 * The tower's dressing as plain data (pure: the tests read the numbers the mesh is built from). World coordinates; `H` the ground height (only the tags that hang on the outside use it).
 *  rail   the stair's outer railing: `nodes` (post positions, `y` the stair's floor plane there; kind newel = a corner or the foot, post, end), `runs` (straight pieces between waypoints)
 *  roof   the hip roof on four posts over the deck, the lantern at its apex and the mast over that
 *  lamp   the one warm light, in the lantern
 *  ladder the fixed ladder on the core's east face
 *  tags   graffiti and a bill, each a flat panel on a wall at hand height
 */
export function towerDress(cx, cz, y0, H = () => y0) {
  const { core, arm, deck, topLen } = TOWER, c = core / 2, R = c + arm, e = R - IN, dy = y0 + deck, P = towerPlan(cx, cz, y0), F = P.F;
  // the railing's waypoints, in climbing order round the outside, local to the core's centre: x, z, the floor plane's height over y0
  const wp = [[-c, e, 0], [c, e, F], [e, e, F], [e, c, F], [e, -c, 2 * F], [e, -e, 2 * F], [c, -e, 2 * F], [-c, -e, 3 * F], [-e, -e, 3 * F], [-e, -c, 3 * F], [-e, c - topLen, deck], [-e, c - IN, deck], [-c, c - IN, deck]];
  const turn = [2, 5, 8, 11], nodes = [];
  wp.forEach(([x, z, d], i) => {
    nodes.push({ x: cx + x, z: cz + z, y: y0 + d, kind: i === 0 || turn.includes(i) ? 'newel' : i === wp.length - 1 ? 'end' : 'post', run: Math.min(i, wp.length - 2) });
    if (i + 1 < wp.length) {
      const [x2, z2, d2] = wp[i + 1], n = Math.max(1, Math.round(Math.hypot(x2 - x, z2 - z)));                       // a post about every metre
      for (let k = 1; k < n; k++) nodes.push({ x: cx + x + ((x2 - x) * k) / n, z: cz + z + ((z2 - z) * k) / n, y: y0 + d + ((d2 - d) * k) / n, kind: 'post', run: i });
    }
  });
  const runs = wp.slice(0, -1).map(([x, z, d], i) => ({ x0: cx + x, z0: cz + z, y0: y0 + d, x1: cx + wp[i + 1][0], z1: cz + wp[i + 1][1], y1: y0 + wp[i + 1][2], extStart: turn.includes(i), trimEnd: turn.includes(i + 1) }));
  const rh = c - 0.1, half = rh + ROOF.over, eaveY = dy + ROOF.eave, apexY = eaveY + ROOF.rise;
  const roof = {
    posts: [[cx - rh, cz - rh], [cx + rh, cz - rh], [cx + rh, cz + rh], [cx - c + 0.05, cz + rh]],                // the corners of the deck; the south-west one stands on the kerb, clear of the stair's entry
    half, eaveY, apexY, plateY: eaveY - ROOF.thick - ROOF.plate / 2, lantern: { y: apexY + 0.07, half: 0.26, h: 0.5 },
  };
  const lamp = { x: cx, y: roof.lantern.y + 0.27, z: cz };
  const ladder = {
    x: cx + c, z: cz + LADDER.zc, off: LADDER.off, w: LADDER.w, pitch: LADDER.pitch,
    rungs: Array.from({ length: LADDER.rungs }, (_, k) => y0 + LADDER.low + k * LADDER.pitch),
    stile0: y0 + LADDER.low - 0.1, stile1: y0 + LADDER.low + (LADDER.rungs - 1) * LADDER.pitch + LADDER.over, cageTop: y0 + LADDER.low + (LADDER.rungs - 1) * LADDER.pitch + 0.1, cage: LADDER.cage,
  };
  const top = (x, z) => y0 + (blockTop(P, x, z) ?? 0);
  const tags = [
    { key: `tag.${0 % TAGS}`, x: cx - c - arm / 2, z: cz + c, ox: 0, oz: 1, w: 0.9, h: 0.45, y: y0 + 1.12, tilt: 0.04 },                                                  // on the entry wall: the stair's welcome
    { key: `tag.${1 % TAGS}`, x: cx + 0.9, z: cz - R, ox: 0, oz: -1, w: 0.9, h: 0.45, y: H(cx + 0.9, cz - R - 0.7) + 1.05, tilt: -0.05 },                                      // on the north block, a hand's reach from the grass
    { key: `tag.${0 % TAGS}`, x: cx + c, z: cz - 0.3, ox: 1, oz: 0, w: 0.9, h: 0.45, y: Math.max(top(cx + c + 0.5, cz - 0.75), top(cx + c + 0.5, cz + 0.15)) + 1.0, tilt: 0.05 }, // on the core above flight B, at a climber's hand
    { key: `poster.${1 % PAPERS}`, x: cx - 1.15, z: cz + c, ox: 0, oz: 1, w: 0.34, h: 0.49, y: Math.max(top(cx - 1.32, cz + c + 0.5), top(cx - 0.98, cz + c + 0.5)) + 0.9, tilt: 0.02 },   // a bill on the core above flight A
  ];
  return { rail: { nodes, runs, cap: RAIL.cap, top: RAIL.top, mid: RAIL.mid, inset: IN }, roof, lamp, ladder, tags };
}

export function buildTower(K, stats) {
  const { ctx, H, occ } = K, { core, arm, deck, topLen } = TOWER;
  const R = core / 2 + arm, site = SITES.find(([x, z]) => K.rectFree(x, z, 2 * R + 1, 2 * R + 1, 0, { slope: 0.3 }));
  if (!site) return null;
  const [cx, cz] = site, c = core / 2, y0 = H(cx - c - arm / 2, cz + c + arm / 2), T = towerPlan(cx, cz, y0), dress = towerDress(cx, cz, y0, H), b = K.b('feature', cx, cz);
  const body = 'concrete_formwork', stone = 'concrete_bare', paint = 'plaster_rough#e3d9c6', iron = 'iron_black', rust = 'rusty_iron', base = y0 - 0.5, dy = y0 + deck;
  const stain = (x, y, z) => warm(0.8 + 0.2 * (0.5 + 0.5 * vnoise(x + z * 1.3, y, 1.6, SEED + 9)) - 0.3 * (1 - ss(0, 1.5, y - y0)));   // each tread and landing block is a pour of its own: a tone each, darker at the foot
  const IRON = [0.17, 0.18, 0.19];
  // ---- tones: concrete that stands in the rain and the earth, stucco paint that has peeled
  /** A stair block's face at `u` along it and `h` over its buried foot (the ground is at h = 0.5): `weathered`, splashed with earth near the ground and furred with moss on the damp foot. */
  const blockTone = (u, h, fall, k) => {
    const t = 0.9 * weathered(u, h, fall, k), splash = 0.4 * (1 - ss(0.45, 1.5, h)), moss = 0.8 * ss(0.62, 0.84, n01(u * 1.3, h * 1.2, 0.7, 40 + k)) * (1 - ss(0.9, 2.2, h)) * ss(0.4, 0.7, h);
    return mixc(mixc(warm(t), [t * 0.8, t * 0.72, t * 0.62], splash), [t * 0.62, t * 0.8, t * 0.45], moss);
  };
  /** Stucco on the stair's rails and the deck's pillars: cream, with an ochre damp bloom, grey mould and bare render where the paint has peeled away. */
  const paintTone = (u, y, k) => {
    const t = 0.95 + 0.07 * vnoise(u, y, 1.1, SEED + 90 + k), peel = ss(0.6, 0.78, n01(u, y * 3, 0.9, 60 + k)), bloom = ss(0.55, 0.8, n01(u, y, 2.4, 70 + k)), mould = ss(0.62, 0.82, n01(u * 0.7, y * 2, 1.2, 80 + k));
    return mixc(mixc(mixc([t, t * 0.985, t * 0.95], [t, t * 0.93, t * 0.74], 0.6 * bloom), [t * 0.7, t * 0.75, t * 0.68], 0.5 * mould), [0.66, 0.62, 0.56], 0.8 * peel);
  };
  const rowsFor = (g, top) => {                                                  // heights of a stair block's grid rows: the buried foot, a damp band round the ground, then a row every couple of metres up to the top
    const ys = [base];
    for (const y of [g - 0.2, g + 0.45, g + 1.3, g + 2.4, g + 4.8, g + 7.2, g + 9.6]) if (y > ys[ys.length - 1] + 0.18 && y < top - 0.18) ys.push(y);
    ys.push(top);
    return ys;
  };
  /** A vertical wall from A to B (as [x, z], A on the viewer's left) over the heights `rows`, nu columns, a colour a corner from tone(s metres along, y). */
  const grid = (mat, A, B, rows, nu, tone) => {
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]), at = (t, y) => [A[0] + (B[0] - A[0]) * t, y, A[1] + (B[1] - A[1]) * t];
    for (let j = 0; j + 1 < rows.length; j++) for (let i = 0; i < nu; i++) {
      const t0 = i / nu, t1 = (i + 1) / nu, ya = rows[j], yb = rows[j + 1];
      b.quad(mat, at(t0, ya), at(t1, ya), at(t1, yb), at(t0, yb), { cols: [tone(t0 * len, ya), tone(t1 * len, ya), tone(t1 * len, yb), tone(t0 * len, yb)] });
    }
  };
  /** A rust run down a vertical face: `at(u, y)` a point on a plane just in front of it (u grows to the viewer's right unless `inner`), wide at the head and tapering to a tip. */
  const streak = (at, u, yTop, len, w0, w1, inner = false) => {
    const sg = inner ? -1 : 1;
    b.quad(rust, at(u - sg * w1, yTop - len), at(u + sg * w1, yTop - len), at(u + sg * w0, yTop), at(u - sg * w0, yTop), { cols: [[0.55, 0.4, 0.3], [0.55, 0.4, 0.3], [1, 0.8, 0.62], [1, 0.8, 0.62]] });
  };
  // ---- the core: four faces, each a grid of quads toned by `weathered` (a box has one colour a face), no top (the deck cap covers it) and no foot
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
  const coreAt = (k, off) => (s, y) => { const p = faces[k](s, y); return [p[0] + [0, 1, 0, -1][k] * off, y, p[2] + [1, 0, -1, 0][k] * off]; };   // a plane `off` m in front of core face k
  // ---- the steps: solid concrete from the ground up. Only what shows is built: the tread's top, its riser above the step below, and its outer flank, a column from the buried foot to the top toned from the local ground up
  T.flights.forEach((f, fi) => {
    const tread = f.len / f.n, riser = f.rise / f.n, rx = -f.uz, rz = f.ux;                                                     // (rx, rz): to the right of the way up, which is the outer side of every flight
    const edge = (u, s) => [cx + f.ax + f.ux * u + rx * s * arm / 2, cz + f.az + f.uz * u + rz * s * arm / 2];                  // s = +1 the outer edge of the lane, -1 the inner one, against the core
    for (let i = 0; i < f.n; i++) {
      const u0 = i * tread, u1 = u0 + tread, top = y0 + f.h0 + (i + 1) * riser, prev = y0 + f.h0 + i * riser, corners = [edge(u0, -1), edge(u0, 1), edge(u1, -1), edge(u1, 1)];
      const xa = Math.min(...corners.map((p) => p[0])), xb = Math.max(...corners.map((p) => p[0])), za = Math.min(...corners.map((p) => p[1])), zb = Math.max(...corners.map((p) => p[1]));
      b.quad(stone, [xa, top, zb], [xb, top, zb], [xb, top, za], [xa, top, za], { col: stain((xa + xb) / 2, top, (za + zb) / 2) });
      const [fx, fz] = edge(u0, 0), g0 = H(fx - f.ux * 0.6, fz - f.uz * 0.6), [ex, ez] = edge(u0 + tread / 2, 1), gOut = H(ex + rx * 0.5, ez + rz * 0.5);
      grid(stone, edge(u0, -1), edge(u0, 1), fi === 0 && i === 0 ? rowsFor(g0, top) : [prev, top], 1, (s, y) => blockTone(fi * 31 + 7 * i + s, y - g0 + 0.5, top + 0.35 - y, 40 + fi));
      grid(stone, edge(u0, 1), edge(u1, 1), rowsFor(gOut, top), 1, (s, y) => blockTone(fi * 31 + u0 + s, y - gOut + 0.5, top + 0.35 - y, fi));
    }
  });
  const SIDES = { SE: 'ES', NE: 'EN', NW: 'NW', top: 'WS' };                                                                  // which faces of each landing stand in the open (the others lean on a flight or the core)
  T.landings.forEach((l, li) => {
    const top = y0 + l.top;
    b.quad(stone, [l.x0, top, l.z1], [l.x1, top, l.z1], [l.x1, top, l.z0], [l.x0, top, l.z0], { col: stain((l.x0 + l.x1) / 2, top, (l.z0 + l.z1) / 2) });
    for (const side of SIDES[l.name]) {
      const [A, B, out] = { E: [[l.x1, l.z1], [l.x1, l.z0], [1, 0]], N: [[l.x1, l.z0], [l.x0, l.z0], [0, -1]], W: [[l.x0, l.z0], [l.x0, l.z1], [-1, 0]], S: [[l.x0, l.z1], [l.x1, l.z1], [0, 1]] }[side];
      const g = H((A[0] + B[0]) / 2 + out[0] * 0.5, (A[1] + B[1]) / 2 + out[1] * 0.5), k = 20 + li * 2 + (side === 'E' || side === 'W' ? 0 : 1);
      grid(stone, A, B, rowsFor(g, top), 2, (s, y) => blockTone(k * 11 + s, y - g + 0.5, top + 0.35 - y, k));
    }
  });
  // ---- the outer railing: a stucco wall-cap (a low, raked wall that follows each flight), a stone coping, iron posts about a metre apart with a top rail and a mid rail, and a stucco pier with a finial at every corner and at the foot
  const RN = dress.rail;
  RN.runs.forEach((r, i) => {
    const dx = r.x1 - r.x0, dz = r.z1 - r.z0, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = -uz, nz = ux;      // n: the outer side
    const s0 = r.extStart ? -IN : 0, s1 = len - (r.trimEnd ? IN : 0), yAt = (s) => r.y0 + ((r.y1 - r.y0) * s) / len, P3 = (s, off, y) => [r.x0 + ux * s + nx * off, y, r.z0 + uz * s + nz * off];
    const nu = Math.max(2, Math.round((s1 - s0) / 0.55));
    const hd = RAIL.cap - 0.05;                                                                                                // the stucco stands to the coping's underside
    for (const outer of [true, false]) for (let j = 0; j < 2; j++) for (let k = 0; k < nu; k++) {                              // two rows of stucco, its outer face a hair behind the block's (no z-fight)
      const sa = s0 + ((s1 - s0) * k) / nu, sb = s0 + ((s1 - s0) * (k + 1)) / nu, ha = (j * hd) / 2, hb = ((j + 1) * hd) / 2, off = outer ? IN - 0.006 : -IN, kk = outer ? 1 : 2;
      const pa = P3(sa, off, yAt(sa) + ha), pb = P3(sb, off, yAt(sb) + ha), pc = P3(sb, off, yAt(sb) + hb), pd = P3(sa, off, yAt(sa) + hb);
      const ta = paintTone(i * 9 + sa, ha, kk), tb = paintTone(i * 9 + sb, ha, kk), tc = paintTone(i * 9 + sb, hb, kk), td = paintTone(i * 9 + sa, hb, kk);
      if (outer) b.quad(paint, pa, pb, pc, pd, { cols: [ta, tb, tc, td] }); else b.quad(paint, pb, pa, pd, pc, { cols: [tb, ta, td, tc] });
    }
    const A = [r.x0, r.y0 + RAIL.cap - 0.025, r.z0], Z = [r.x1, r.y1 + RAIL.cap - 0.025, r.z1];
    beam(b, stone, A, Z, 0.2, 0.05, { col: warm(0.9 + 0.05 * hash2(i, 3, SEED)) });                                              // the coping
    beam(b, iron, [r.x0, r.y0 + RAIL.top, r.z0], [r.x1, r.y1 + RAIL.top, r.z1], 0.06, 0.05, { col: IRON });
    beam(b, iron, [r.x0, r.y0 + RAIL.mid, r.z0], [r.x1, r.y1 + RAIL.mid, r.z1], 0.04, 0.04, { col: IRON });
  });
  RN.nodes.forEach((n, i) => {
    if (n.kind === 'end') return;
    if (n.kind === 'newel') {                                                                                                  // a stucco pier with a stone cap and an iron finial
      const lo = n.y - 0.1, hi = n.y + 1.1, pt = paintTone(i * 5, 0.3, 2);
      b.box(paint, n.x, (lo + hi) / 2, n.z, 0.22, hi - lo, 0.22, { col: pt, skip: ['ny'] });
      b.box(stone, n.x, hi + 0.03, n.z, 0.3, 0.06, 0.3, { col: warm(0.92) });
      b.cyl(iron, n.x, hi + 0.06, n.z, 0.05, 0.16, 6, { r1: 0.012, col: IRON });
      return;
    }
    b.box(iron, n.x, n.y + (RAIL.cap - 0.02 + RAIL.top + 0.03) / 2, n.z, 0.07, RAIL.top + 0.05 - RAIL.cap, 0.07, { col: mixc(IRON, [0.26, 0.2, 0.17], 0.3 * ss(0.3, 0.8, n01(i, 0, 1, 99))), skip: ['ny'] });   // a post
  });
  // rust under every post: a run down the wall-cap and the block under it, on both sides
  RN.nodes.forEach((n, i) => {
    if (n.kind !== 'post') return;
    const run = RN.runs[n.run], len = Math.hypot(run.x1 - run.x0, run.z1 - run.z0), ux = (run.x1 - run.x0) / len, uz = (run.z1 - run.z0) / len, nx = -uz, nz = ux, s = (n.x - run.x0) * ux + (n.z - run.z0) * uz;
    for (const outer of [true, false]) {
      const off = outer ? IN + 0.004 : -IN - 0.008, at = (u, y) => [run.x0 + ux * u + nx * off, y, run.z0 + uz * u + nz * off], l = (outer ? 0.55 : 0.28) + 0.5 * (0.5 + 0.5 * hash2(i, outer ? 1 : 2, SEED + 7));
      streak(at, s, n.y + RAIL.cap - 0.05, l, 0.04, 0.012, !outer);
    }
  });
  // ---- the deck: a cap over the core, a parapet on three sides and on the west one but the stair end, four pillars under the roof's posts
  const wl = core - topLen - 0.2;
  b.box(stone, cx, dy - 0.06, cz, core + 0.12, 0.12, core + 0.12, { col: stain(cx, dy, cz), skip: ['ny'] });
  const handrail = (x, z, len, alongX) => {                                                                                    // R1-D18: a real handrail (posts, a top rail, a mid rail, a low kerb), not a solid wall; the collider stays the full wall
    const n = Math.max(1, Math.round(len / 1.0)), sx = alongX ? len : 0.07, sz = alongX ? 0.07 : len, at = (t) => (alongX ? [x - len / 2 + t * len, z] : [x, z - len / 2 + t * len]);
    for (let k = 0; k <= n; k++) {
      const [px, pz] = at(k / n);
      b.box(iron, px, dy + 0.52, pz, 0.07, 1.04, 0.07, { col: IRON });
      b.quad(rust, [px - 0.08, dy + 0.124, pz + 0.08], [px + 0.08, dy + 0.124, pz + 0.08], [px + 0.08, dy + 0.124, pz - 0.08], [px - 0.08, dy + 0.124, pz - 0.08], { col: [0.95, 0.72, 0.55] });   // the rust that has run out under it
    }
    b.box(iron, x, dy + 1.0, z, sx, 0.06, sz, { col: IRON }); b.box(iron, x, dy + 0.52, z, sx, 0.04, sz, { col: IRON });
    b.box(stone, x, dy + 0.06, z, alongX ? len : 0.2, 0.12, alongX ? 0.2 : len, { col: warm(0.93) });
  };
  handrail(cx, cz - c + 0.1, core, true); handrail(cx + c - 0.1, cz, core, false); handrail(cx, cz + c - 0.1, core, true); handrail(cx - c + 0.1, cz - c + wl / 2, wl, false);
  // the rust from the deck's posts runs down the core's face, on to the stair below it
  [[0, 0.975], [0, 1.95], [0, 2.925], [1, 1.95], [1, 2.925], [2, 0.975], [2, 1.95], [2, 2.925]].forEach(([k, s], i) => {
    const [px, , pz] = faces[k](s, 0), tops = blockTop(T, px + [0, 0.5, 0, -0.5][k], pz + [0.5, 0, -0.5, 0][k]) ?? 0, avail = deck - 0.2 - tops - 0.15;
    streak(coreAt(k, 0.014), s, dy - 0.13, Math.min(avail, 0.9 + 2.5 * (0.5 + 0.5 * hash2(i, 5, SEED + 11))), 0.035, 0.012);
  });
  const pillars = [[cx - c + 0.1, cz - c + 0.1], [cx + c - 0.1, cz - c + 0.1], [cx + c - 0.1, cz + c - 0.1], [cx - c + 0.1, cz + c - topLen - 0.3]];
  pillars.forEach(([px, pz], pi) => {
    const h = 0.17, ph = 1.3, rows = [dy, dy + 0.45, dy + 0.9, dy + ph];
    for (const [A, B, k] of [[[px - h, pz + h], [px + h, pz + h], 0], [[px + h, pz + h], [px + h, pz - h], 1], [[px + h, pz - h], [px - h, pz - h], 2], [[px - h, pz - h], [px - h, pz + h], 3]]) {
      grid(paint, A, B, rows, 1, (s, y) => { const t = paintTone(s + pi * 13 + k * 3, (y - dy) * 1.2, 3 + pi), damp = 1 - 0.2 * (1 - ss(0, 0.5, y - dy)); return [t[0] * damp, t[1] * damp, t[2] * damp]; });
    }
    b.box(stone, px, dy + 1.35, pz, 0.46, 0.1, 0.46, { col: warm(0.93 + 0.05 * hash2(pi, 1, SEED)) });
  });
  // ---- the roof: a hip roof of clay tile on four slender iron posts that stand on the pillars (and, at the south-west, on the kerb beside the stair's way in), a plate under it, hip rafters, a lantern of glass at the apex with its own tiny roof and a finial, the flag on the mast over it
  const RF = dress.roof, tile = 'roof_tile_clay', wood = 'wood_dark', deckPosts = RF.posts, mix3 = mixc;
  deckPosts.forEach(([px, pz], i) => { const yb = i < 3 ? dy + 1.4 : dy + 0.12, yt = RF.plateY + ROOF.plate / 2; b.box(iron, px, (yb + yt) / 2, pz, 0.09, yt - yb, 0.09, { col: IRON, skip: ['ny'] }); });
  deckPosts.forEach(([px, pz], i) => { const [qx, qz] = deckPosts[(i + 1) % 4]; beam(b, wood, [px, RF.plateY, pz], [qx, RF.plateY, qz], 0.12, ROOF.plate, { col: [1.25, 1.06, 0.9] }); });
  const apex = [cx, RF.apexY, cz], corners = [[-RF.half, RF.half], [RF.half, RF.half], [RF.half, -RF.half], [-RF.half, -RF.half]].map(([x, z]) => [cx + x, RF.eaveY, cz + z]);     // sw, se, ne, nw
  const tileTone = (q) => {
    const n = n01(q[0], q[2], 0.7, 51), m = ss(0.66, 0.84, n01(q[0] * 0.8, q[2] * 0.8, 1.3, 53)), dark = 0.14 * ss(0.4, 0.8, n01(q[0] * 0.5 + q[2] * 0.5, q[1] * 0.3, 0.5, 52));
    return mixc([0.8 + 0.3 * n - dark, 0.78 + 0.28 * n - dark, 0.74 + 0.25 * n - dark], [0.66, 0.84, 0.58], 0.55 * m);
  };
  for (let k = 0; k < 4; k++) {
    const A = corners[k], B = corners[(k + 1) % 4];
    for (let j = 0; j < 3; j++) {                                                                                                // three bands up the slope, so the tone can change over it
      const t0 = j / 3, t1 = (j + 1) / 3, a0 = mix3(A, apex, t0), b0 = mix3(B, apex, t0), a1 = mix3(A, apex, t1), b1 = mix3(B, apex, t1);
      if (j < 2) b.quad(tile, a0, b0, b1, a1, { cols: [a0, b0, b1, a1].map(tileTone) }); else b.tri(tile, a0, b0, apex, { col: tileTone(mix3(mix3(a0, b0, 0.5), apex, 0.4)) });
    }
    const dn = (q) => [q[0], q[1] - ROOF.thick, q[2]], sA = dn(A), sB = dn(B), sP = dn(apex), soffit = (q) => paintTone(q[0] * 1.3 + q[2] * 0.7 + k * 9, q[1] * 2.5, 6);
    for (let j = 0; j < 3; j++) {                                                                                              // the soffit, seen from the deck: lime-washed render (light enough to read in the shade), three bands so the damp and the peeling show
      const t0 = j / 3, t1 = (j + 1) / 3, a0 = mix3(sA, sP, t0), b0 = mix3(sB, sP, t0), a1 = mix3(sA, sP, t1), b1 = mix3(sB, sP, t1);
      if (j < 2) b.quad(paint, b0, a0, a1, b1, { cols: [b0, a0, a1, b1].map(soffit) }); else b.tri(paint, b0, a0, sP, { col: soffit(mix3(mix3(a0, b0, 0.5), sP, 0.4)) });
    }
    b.quad(wood, [A[0], RF.eaveY - ROOF.thick - 0.005, A[2]], [B[0], RF.eaveY - ROOF.thick - 0.005, B[2]], [B[0], RF.eaveY + 0.005, B[2]], [A[0], RF.eaveY + 0.005, A[2]], { col: [1, 0.86, 0.72] });      // the fascia
    beam(b, tile, [A[0], RF.eaveY + 0.03, A[2]], [cx, RF.apexY + 0.03, cz], 0.14, 0.08, { col: [0.74, 0.66, 0.6] });             // the hip's ridge tiles
  }
  deckPosts.forEach(([px, pz]) => beam(b, wood, [px, RF.plateY, pz], [cx, RF.apexY - 0.13, cz], 0.08, 0.1, { col: [1.2, 1.02, 0.86] }));   // the hip rafters under the soffit
  const LN = RF.lantern, ly = LN.y, lh = LN.half;
  b.box(wood, cx, RF.apexY + 0.03, cz, 0.36, 0.1, 0.36, { col: [1.25, 1.06, 0.9] });                                           // the collar the lantern stands on
  b.box(iron, cx, ly + 0.02, cz, 0.6, 0.04, 0.6, { col: IRON, skip: ['ny'] });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(iron, cx + sx * lh, ly + 0.04 + LN.h / 2, cz + sz * lh, 0.035, LN.h, 0.035, { col: IRON });
  for (const [ax, az, bx, bz] of [[-lh, lh, lh, lh], [lh, lh, lh, -lh], [lh, -lh, -lh, -lh], [-lh, -lh, -lh, lh]]) b.quad('glass', [cx + ax, ly + 0.04, cz + az], [cx + bx, ly + 0.04, cz + bz], [cx + bx, ly + 0.04 + LN.h, cz + bz], [cx + ax, ly + 0.04 + LN.h, cz + az], { col: W });
  b.box('lamp_glow', cx, dress.lamp.y, cz, 0.1, 0.16, 0.1, { col: W });                                                        // the lamp itself: it lights up at night
  const lr = ly + 0.04 + LN.h, lapex = [cx, lr + 0.26, cz], lc = [[-0.4, 0.4], [0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]].map(([x, z]) => [cx + x, lr, cz + z]);
  for (let k = 0; k < 4; k++) {
    const A = lc[k], B = lc[(k + 1) % 4];
    b.tri(tile, A, B, lapex, { col: tileTone(mix3(mix3(A, B, 0.5), lapex, 0.4)) });
    b.tri(wood, [B[0], lr - 0.04, B[2]], [A[0], lr - 0.04, A[2]], [lapex[0], lapex[1] - 0.04, lapex[2]], { col: [1.1, 0.94, 0.8] });
  }
  b.cyl(iron, cx, lr + 0.24, cz, 0.05, 0.16, 6, { r1: 0.012, col: IRON });                                                     // the finial
  const mastTop = lr + 0.24 + 1.7;
  b.cyl(iron, cx, lr + 0.38, cz, 0.018, mastTop - lr - 0.38, 6, { r1: 0.012, col: W });
  for (const [below, h, col] of [[0.12, 0.24, [1, 0.78, 0.08]], [0.3, 0.12, [0.1, 0.22, 0.62]], [0.42, 0.12, [0.72, 0.08, 0.1]]]) b.box('plaster_a', cx - 0.5, mastTop - below, cz, 0.9, h, 0.02, { col });   // the flag: yellow, blue, red
  // The lantern's one warm lamp is a street lamp to the engine: at night a real light for the deck under it (engine/lights.js) and, through engine/glow.js, the halo round the lantern.
  // It is not a ctx.glow.add: world-mesh's vista test counts every entry of that registry as a lit window of the far city.
  ctx.lights?.add({ x: dress.lamp.x, y: dress.lamp.y, z: dress.lamp.z, color: 0xffc890, intensity: 12, distance: 10, kind: 'street' });
  // ---- the maintenance ladder: a steel ladder on the core's east face, out of reach (its lowest rung is 2.6 m over the highest step under it), up to the parapet, with a hooped cage on its top 2.5 m
  const LD = dress.ladder, lx = LD.x + LD.off, rustCol = [1.05, 0.9, 0.75];
  for (const s of [-1, 1]) {
    b.box(rust, lx, (LD.stile0 + LD.stile1) / 2, LD.z + (s * LD.w) / 2, 0.03, LD.stile1 - LD.stile0, 0.06, { col: rustCol, skip: ['ny'] });
    for (const yb of [LD.stile0 + 0.2, LD.stile0 + 1.4, LD.stile0 + 2.6, LD.stile0 + 3.8, LD.stile1 - 0.5]) b.box(rust, LD.x + LD.off / 2, yb, LD.z + (s * LD.w) / 2, LD.off, 0.04, 0.05, { col: rustCol, skip: ['nx'] });
  }
  for (const y of LD.rungs) tube(b, rust, [lx, y, LD.z - LD.w / 2], [lx, y, LD.z + LD.w / 2], 0.014, 0.014, 4, { caps: false, col: rustCol });
  const hoopAt = (th) => [lx + 0.2 + 0.4 * Math.cos(th), LD.z + 0.4 * Math.sin(th)];
  const hoops = [], arc = [-120, -72, -24, 24, 72, 120].map((d) => (d * Math.PI) / 180);
  for (let y = LD.cageTop; y > LD.cageTop - LD.cage - 0.01; y -= 0.6) hoops.push(y);
  for (const y of hoops) {
    for (let k = 0; k + 1 < arc.length; k++) { const [ax, az] = hoopAt(arc[k]), [bx, bz] = hoopAt(arc[k + 1]); tube(b, rust, [ax, y, az], [bx, y, bz], 0.012, 0.012, 4, { caps: false, col: rustCol }); }
    for (const s of [-1, 1]) { const [ax, az] = hoopAt(s * arc[arc.length - 1]); tube(b, rust, [ax, y, az], [lx, y, LD.z + (s * LD.w) / 2], 0.012, 0.012, 4, { caps: false, col: rustCol }); }
  }
  for (const th of [-72, -24, 24, 72]) { const [ax, az] = hoopAt((th * Math.PI) / 180); tube(b, rust, [ax, hoops[hoops.length - 1], az], [ax, hoops[0], az], 0.012, 0.012, 4, { caps: false, col: rustCol }); }
  // ---- the stair's welcome: the first step's nosing in warning stripes, a rusted chain hung on the entry wall, a tag over it
  { const f0 = T.flights[0], nose = y0 + f0.rise / f0.n + 0.004, xf = cx - c, z0 = cz + c, z1 = cz + R, d = 0.16, wd = (z1 - z0) / 8;
    for (let k = 0; k < 8; k++) {                                                                                              // diagonal stripes, clipped to the lane
      const zl = (z) => Math.min(z1, Math.max(z0, z));
      b.quad('plaster_a', [xf, nose, zl(z0 + (k + 1) * wd)], [xf + d, nose, zl(z0 + (k + 1) * wd + d)], [xf + d, nose, zl(z0 + k * wd + d)], [xf, nose, zl(z0 + k * wd)], { col: k % 2 ? [0.12, 0.12, 0.12] : mixc([0.95, 0.74, 0.1], [0.7, 0.6, 0.3], 0.5 * (0.5 + 0.5 * hash2(k, 2, SEED))) });
    }
    const ex0 = cx - c - arm + 0.2, ex1 = cx - c - 0.2, ey = y0 + 1.0, ez = cz + c + 0.03, links = 10, pts = [];                    // the chain hangs from two eyebolts in a slack curve
    for (let k = 0; k <= links; k++) { const t = k / links; pts.push([ex0 + (ex1 - ex0) * t, ey - 0.42 * 4 * t * (1 - t), ez + (k % 2 ? 0.012 : -0.004)]); }
    for (let k = 0; k < links; k++) tube(b, rust, pts[k], pts[k + 1], 0.013, 0.013, 4, { caps: false, col: [0.62, 0.45, 0.35] });
    for (const x of [ex0, ex1]) b.box(rust, x, ey, cz + c + 0.015, 0.04, 0.04, 0.03, { col: rustCol });
  }
  // ---- spalls: a chipped corner at the foot of the south-east landing with the rebar showing, and a patch under the north-east one's cap
  const spall = (O, ex, n, seed, rebars) => {                                                                                  // O a point on the face, ex the unit vector to the viewer's right along it, n the outward normal; a ragged dark patch with a pale rim
    const pt = (a, bb, off) => [O[0] + ex[0] * a + n[0] * off, O[1] + bb, O[2] + ex[2] * a + n[2] * off];
    for (const [sc, off, col] of [[1.35, 0.005, [0.66, 0.64, 0.6]], [1, 0.009, [0.3, 0.28, 0.26]]]) {
      const ring = Array.from({ length: 6 }, (_, k) => { const th = (k / 6) * Math.PI * 2 + 0.4 * hash2(k, seed, SEED), r = sc * (0.1 + 0.07 * (0.5 + 0.5 * hash2(k, seed + 1, SEED))); return pt(Math.cos(th) * r * 1.2, Math.sin(th) * r, off); });
      for (let k = 0; k < 6; k++) b.tri(stone, pt(0, 0, off), ring[k], ring[(k + 1) % 6], { col });
    }
    rebars.forEach(([a, bb, l], k) => tube(b, rust, pt(a, bb, 0.01), [pt(a, bb, 0.01)[0] + n[0] * l, pt(a, bb, 0.01)[1] - 0.03, pt(a, bb, 0.01)[2] + n[2] * l], 0.009, 0.009, 4, { caps: false, col: [0.7, 0.45, 0.3] }));
  };
  { const gSE = H(cx + R, cz + R);
    spall([cx + R - 0.32, gSE + 0.5, cz + R], [1, 0, 0], [0, 0, 1], 1, [[-0.06, 0.1, 0.14], [0.03, 0.02, 0.11], [0.06, -0.08, 0.15]]);
    spall([cx + R, gSE + 0.42, cz + R - 0.32], [0, 0, -1], [1, 0, 0], 3, [[0.0, 0.06, 0.12], [0.07, -0.05, 0.1]]);
    spall([cx + R, y0 + 2 * T.F - 0.45, cz - R + 0.75], [0, 0, -1], [1, 0, 0], 5, [[-0.05, 0.08, 0.13], [0.05, 0.0, 0.1]]);
  }
  // ---- the tags and the bill: flat panels on the wall (a plain wall quad when there is no sign atlas)
  for (const t of dress.tags) panel(K, b, t.key, t.x + t.ox * 0.012, t.z + t.oz * 0.012, t.ox, t.oz, t.w, t.y, t.y + t.tilt, t.h);
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
  ctx.world.tower = { x: cx, z: cz, y0, deckY: dy, half: R, entry: T.entry, route: T.route, sign: { x: sx + side * 0.034, z: sz, y: sy, w: SIGN.w, h: SIGN.h, side, ceil }, dress };
  stats.tower = 1;
  return T;
}
