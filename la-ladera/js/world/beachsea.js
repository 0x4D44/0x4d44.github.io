// THE SEA'S SET PIECES, AS DATA (A5, round 7, phase 2b): the pier, the raft, the swim line, the moored boats, the boats on the sand and the things on the seabed. Pure: the coast plan (coast.js) and a seed
// in, plain records out, so a Node test and the page read the same layout and every collider exists from the first frame, whatever the render loads when. beachfixtures.js turns the walls and floors
// into colliders; waterprops.js draws the items from the Codex watersports library (waterlib.js names it) once that library is loaded, and moves the floating ones with the swell.
//
//   planSea(coast) -> { items, walls, floors, lamps, ropes, sunken, reef, stats }
//   items   { id, group, name, key, x, y, z, yaw, scale?, pitch?, lod: [near, far], float? }   a library piece (key = the name in ctx.assets); yaw 0 faces +Z = south = the sea. A floater has its
//           waterline at `y` (the sea's height, the draft is the library's) and `float: { draft, bob, rock, rig: 'free' | 'rigid', phase }`: 'rigid' pieces (the raft, whose floor does not move) bob a few centimetres at most
//   walls   { id, x1, z1, x2, z2, t, y0, y1 }                              what stops a walker or a swimmer (physics.addWall: a wall blocks when its top is over 0.4 m above the feet)
//   floors  { id, pts: [[x, z]...], y }                                    what a walker stands on (the pier's deck, the raft's): physics.addFloor
//   lamps   { id, x, y, z, light: { x, y, z } }                            the pier's lamps (a real light each: waterprops.js)
//   ropes   { id, a: [x, y, z], item, anchor: [x, y, z] }                  a mooring line from a cleat to the anchor of a floater (the floater moves: waterprops.js redraws it)
//   sunken  { id, x, y, z, depth }                                         what lies on the seabed (the discoveries of phase 2c are made from these)
//   reef    { id, x, y, z, depth, r }                                      the coral patch of phase 2c (a discovery is made from it, like the sunken things), a key of its own so `sunken` stays the two things it was: the centre of a
//                                                                          disc of radius `r` on the seabed where the water is REEF.depth (3.0 m) deep, `z` solved from the coast, and the dressing (seabed.js) stands its coral inside it
//
// The pier is the library's kit assembled on the axis stair's centre line (coast.js PIER): 40 deck modules of 3 x 2 m (z 108 to 188), piles every 4 m on both sides (scaled in Y to reach the seabed),
// crossbraces where the water is deep, a rail of posts and handrails on both sides with a gap at the head for the ladder, a lamp every 10 m, cleats, rod holders and bait crates at the fishermen's
// posts, and the 4 x 3 m head. The deck is a floor at PIER.top: nobody walks under it on the sand (a floor over the head is a head bump, physics.js) and a swimmer passes under it in the water; where the
// seabed is too near the deck for a walker's eyes (ROOM), a skirt and a cap (`pier.skirt`) close the underside, so the camera is never inside the slab.
import { makeRng } from '../core/rng.js';
import { SEA, BUOY_Z, STOP_Z, PIER, RAFT, SAND_BOATS } from './coast.js';
import { assetKey, SIZE, ANCHOR, FLOAT } from './waterlib.js';

export const RAIL = Object.freeze({ h: 0.98, t: 0.05, inset: 0.07 });          // the library's handrail is 0.98 m tall; the colliders are 10 cm thick, 7 cm in from the deck's edge
export const ROOM = 1.78;                                                       // m between the seabed and the deck's underside that a walker's eyes need under the pier: the player's eye 1.64, the camera's near plane 0.1, a margin
export const SWIM = Object.freeze({ z: BUOY_Z, x0: -95, x1: 95, step: 10 });   // twenty buoys across the bay, a rope of floats between them and the bell buoy in the middle
export const REEF = Object.freeze({ x: 58, depth: 3.0, r: 2.6 });              // the coral patch: its x, the water over it (m) and its radius (m); its z is where the coast says the water is that deep
const LOD = Object.freeze({ pier: [60, 300], boat: [60, 240], float: [50, 280], small: [24, 90], sunk: [30, 90] });
const WOODEN = Object.freeze(['wooden_boat_maria_del_mar', 'wooden_boat_la_esperanza', 'wooden_boat_san_pedro', 'wooden_boat_brisa']);

export function planSea(coast, o = {}) {
  const rng = makeRng(((o.seed ?? coast.seed ?? 1) * 2246822519 + 9176) >>> 0), H = coast.heightAt;
  const items = [], walls = [], floors = [], lamps = [], ropes = [], sunken = [], n = {};
  const nid = (g) => `${g}.${(n[g] = (n[g] ?? -1) + 1)}`;
  const f3 = (v) => +v.toFixed(3) + 0;                                                                // (+ 0: a minus zero is not a number the layout should carry)
  const mk = (name, x, y, z, yaw, g, extra = {}) => {
    const it = { id: nid(g), group: g, name, key: assetKey(name), x: f3(x), y: f3(y), z: f3(z), yaw: f3(yaw), lod: extra.lod ?? LOD.small };
    if (extra.scale) it.scale = extra.scale;
    if (extra.pitch) it.pitch = f3(extra.pitch);
    if (extra.of) it.of = extra.of;                                                                   // (the boat a bit of gear belongs to)
    if (extra.float) it.float = { ...FLOAT[name], rig: 'free', phase: f3(rng.range(0, 6.2832)), ...extra.float };
    items.push(it); return it;
  };
  const wall = (g, x1, z1, x2, z2, t, y0, y1) => walls.push({ id: g, x1: f3(x1), z1: f3(z1), x2: f3(x2), z2: f3(z2), t, y0: f3(y0), y1: f3(y1) });
  const post = (g, x, z, r, y0, y1) => wall(g, x, z, x, z, r, y0, y1);
  /** A rectangle as ONE thick wall along its long axis (a stadium: the boats and the crates have no inside to turn in: kit.js rect, `solid`). ry: the prop's yaw. */
  const thick = (g, x, z, w, d, ry, y0, y1) => {
    const lo = Math.min(w, d), c = Math.cos(ry), s = Math.sin(ry), hl = Math.max(0, Math.max(w, d) / 2 - lo / 2), ax = w >= d ? c : s, az = w >= d ? -s : c;
    wall(g, x - ax * hl, z - az * hl, x + ax * hl, z + az * hl, lo / 2, y0, y1);
  };

  // ---- the pier
  const { x: px, w: pw, z0, z1, top } = PIER, stem1 = z1 - 3, hz = z1 - 1.5, hw = 2, base = top - SIZE.pier_deck[1];   // base: the deck's underside (the modules stand on it)
  const xw = px - (pw / 2 - RAIL.inset), xe = px + (pw / 2 - RAIL.inset);
  for (let z = z0 + 1; z < stem1; z += 2) mk('pier_deck', px, base, z, 0, 'deck', { lod: LOD.pier });
  mk('pier_end_platform', px, base, hz, 0, 'head', { lod: LOD.pier });
  floors.push({ id: 'pier.deck', y: top, pts: [[px - pw / 2, z0], [px + pw / 2, z0], [px + pw / 2, stem1], [px + hw, stem1], [px + hw, z1], [px - hw, z1], [px - hw, stem1], [px - pw / 2, stem1]] });

  const pile = (x, z) => {
    const bed = H(x, z), len = base - (bed - 0.35);
    mk('pier_pile', x, bed - 0.35, z, 0, 'pile', { scale: [1, len / SIZE.pier_pile[1], 1], lod: LOD.pier });
    post('pier.pile', x, z, 0.17, bed - 0.4, base);
  };
  for (let z = z0 + 2; z < stem1; z += 4) {
    pile(px - 1.2, z); pile(px + 1.2, z);
    if (H(px, z) < -1.95) mk('pier_crossbrace', px, -1.52, z, ((z - z0 - 2) / 4) % 2 ? Math.PI : 0, 'brace', { lod: LOD.pier });          // (an X on the bents where the water is deep: the lower end would be in the sand otherwise)
  }
  for (const sx of [-1, 1]) for (const dz of [-1, 1]) pile(px + sx * 1.7, hz + dz);

  // the underside: where the seabed is less than ROOM below the deck's underside (the player's eye 1.64 m over the feet, the camera's near plane 0.1, and a margin) a walker who went in would have his eyes in the slab,
  // and the lattice of tests/stuck.mjs finds a row of cells at the edge of the head's own room that it cannot leave. There the pier is a closed platform: a skirt along both edges and a cap across, on the first bent with room
  // (the walls stop under the deck's top, so a walker ON the deck is not stopped by them; the rails are the deck's own edge)
  const bedAt = (z) => Math.max(...[-1, -0.5, 0, 0.5, 1].map((u) => H(px + (u * pw) / 2, z)));
  let zc = z0 + 2;
  while (zc < stem1 - 4 && bedAt(zc) > base - ROOM) zc += 4;
  const low = H(px, zc) - 0.5;
  for (const sx of [-1, 1]) wall('pier.skirt', px + (sx * pw) / 2, z0, px + (sx * pw) / 2, zc, 0.05, low, top);
  wall('pier.skirt', px - pw / 2, zc, px + pw / 2, zc, 0.05, low, top);

  const posts = new Set();
  const rail = (x1, z1, x2, z2) => {                                    // posts at both ends and every 2 m or less, a handrail between each pair (scaled to fit), one wall for the run
    const len = Math.hypot(x2 - x1, z2 - z1), k = Math.max(1, Math.ceil(len / 2 - 1e-9)), yaw = Math.atan2(-(z2 - z1), x2 - x1), at = (i) => [x1 + ((x2 - x1) * i) / k, z1 + ((z2 - z1) * i) / k];
    for (let i = 0; i <= k; i++) { const [x, z] = at(i), key = `${x.toFixed(2)}|${z.toFixed(2)}`; if (!posts.has(key)) { posts.add(key); mk('pier_post', x, top, z, 0, 'post', { lod: LOD.pier }); } }
    for (let i = 0; i < k; i++) { const [x, z] = at(i + 0.5); mk('pier_handrail', x, top, z, yaw, 'rail', { scale: [len / k / 2, 1, 1], lod: LOD.pier }); }
    wall('pier.rail', x1, z1, x2, z2, RAIL.t, top - 0.4, top + RAIL.h);
  };
  const zb = stem1 + RAIL.inset;                                                                      // (the rails of the head's back wings run just inside the shoulders, as the sides run inside their edges)
  rail(xw, z0 + 0.9, xw, zb); rail(xe, z0 + 0.9, xe, zb);                                              // the stem (the first 0.9 m is open: people step on from the promenade and the stair's two flights)
  const gap = 0.6, fx = z1 - RAIL.inset;                                                              // the head: a rail round three sides, and a gap 1.2 m wide at the middle of the front for the ladder (and for jumping)
  rail(px - (hw - RAIL.inset), zb, px - (hw - RAIL.inset), fx); rail(px + (hw - RAIL.inset), zb, px + (hw - RAIL.inset), fx);
  rail(px - (hw - RAIL.inset), fx, px - gap, fx); rail(px + gap, fx, px + (hw - RAIL.inset), fx);
  rail(px - (hw - RAIL.inset), zb, xw, zb); rail(xe, zb, px + (hw - RAIL.inset), zb);                  // (the wings' backs)
  const lad = ANCHOR.pier_ladder.ladder, platform = ANCHOR.pier_end_platform.ladder;
  mk('pier_ladder', px, top - lad.end[1], hz + platform.end[2] - lad.end[2], 0, 'ladder', { lod: LOD.pier });   // its top rung lands where the platform's anchor says, at the gap

  // the lamps: every 10 m on alternate sides, and two at the head; a real light at the top of each
  const lampAt = (x, z) => {
    const it = mk('pier_lamp', x, top, z, 0, 'lamp', { lod: LOD.pier }), l = ANCHOR.pier_lamp.light;
    lamps.push({ id: it.id, x: it.x, y: top, z: it.z, light: { x: f3(x + l[0]), y: f3(top + l[1]), z: f3(z + l[2]) } });
    post('pier.lamp', x, z, 0.2, top - 0.4, top + SIZE.pier_lamp[1]);
  };
  for (let k = 0, z = 115; z < stem1 - 1; z += 10, k++) lampAt(px + (k % 2 ? 1.05 : -1.05), z);
  for (const sx of [-1, 1]) lampAt(px + sx * 1.55, hz - 0.1);

  // the fishermen's places: a rod holder on the handrail and, on every other post, a bait crate on the deck behind the fisherman (the posts are coast.pois 'fish')
  coast.pois.filter((p) => p.kind === 'fish').forEach((p, i) => {
    const sx = Math.sign(p.x - px);
    mk('rod_holder', px + sx * (pw / 2 - RAIL.inset), top + RAIL.h, p.z, sx * Math.PI / 2, 'rod');
    if (i % 2 === 0) { const x = px + sx * 0.9, z = p.z + 0.9, [w, , d] = SIZE.bait_crate; mk('bait_crate', x, top, z, 0, 'crate'); thick('pier.crate', x, z, w, d, 0, top - 0.4, top + 0.5); }   // (0.5: a wall under 0.4 m does not stop a walker, and a crate must)
  });
  // the cleats along the deck's edges, and the four the moored boats' ropes are made fast to
  const cleats = [[-1, 118], [1, 124], [-1, 142], [1, 148], [-1, 160], [1, 164], [1, 169.5], [1, 175], [-1, 186.5]].map(([s, z]) => ({ x: px + s * 1.25, z }));
  for (const c of cleats) mk('mooring_cleat', c.x, top, c.z, Math.PI / 2, 'cleat');
  // the head's gear: a lifebuoy on the deck and a coil of rope
  mk('lifebuoy', px - 1.6, top + FLOAT.lifebuoy.draft, hz + 0.9, 0.4, 'gear'); mk('rope_coil', px + 1.5, top, hz + 0.8, 0.8, 'gear');

  // ---- the moored boats: they ride the swell beside the pier (a lancha on the east side, a rowing boat on the west), each with its ropes to the cleats. The lancha lies bow ashore (yaw pi): its stern ring
  // is on its right (the library's +X), which that way is the pier's side, so no rope crosses the boat.
  const lancha = mk('lancha', -3, SEA, 172, Math.PI, 'moored', { float: {}, lod: LOD.boat }), row = mk('rowing_boat', -10, SEA, 186, 0.05, 'moored', { float: {}, lod: LOD.boat });
  const cleatAt = (x, z) => cleats.find((c) => Math.abs(c.x - x) < 0.01 && Math.abs(c.z - z) < 0.01), cl = (c) => [c.x, top + 0.1, c.z];
  ropes.push({ id: 'rope.lancha.bow', a: cl(cleatAt(px + 1.25, 169.5)), item: lancha.id, anchor: ANCHOR.lancha.moorBow });
  ropes.push({ id: 'rope.lancha.stern', a: cl(cleatAt(px + 1.25, 175)), item: lancha.id, anchor: ANCHOR.lancha.moorStern });
  ropes.push({ id: 'rope.row.bow', a: cl(cleatAt(px - 1.25, 186.5)), item: row.id, anchor: [0, 0.4, 1.7] });         // (the rowing boat has no mooring anchor in the library: a ring at its bow)
  for (const it of [lancha, row]) { const [w, , d] = SIZE[it.name]; thick('boat.moored', it.x, it.z, w, d, it.yaw, SEA - 1.2, SEA + 0.9); }

  // ---- La Balsa: the raft floats at the sea's height, its ladder on the shore side; its deck is a floor and a wall under it keeps swimmers from drifting beneath (a swimmer's head would pass the deck's edge)
  mk('diving_raft', RAFT.x, SEA, RAFT.z, RAFT.yaw, 'raft', { float: { rig: 'rigid' }, lod: LOD.pier });
  const rh = RAFT.size / 2, rb = H(RAFT.x, RAFT.z) - 0.5;
  floors.push({ id: 'raft.deck', y: RAFT.top, pts: [[RAFT.x - rh, RAFT.z - rh], [RAFT.x + rh, RAFT.z - rh], [RAFT.x + rh, RAFT.z + rh], [RAFT.x - rh, RAFT.z + rh]] });
  for (const [x1, z1, x2, z2] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) wall('raft.skirt', RAFT.x + x1 * (rh + 0.05), RAFT.z + z1 * (rh + 0.05), RAFT.x + x2 * (rh + 0.05), RAFT.z + z2 * (rh + 0.05), 0.05, rb, RAFT.top);

  // ---- the swim line: a rope of floats along the buoys' line, twenty buoys 10 m apart and the bell buoy in the middle
  const seg = SIZE.swimline_segment[0], span = SWIM.x1 - SWIM.x0;
  for (let i = 0; i < Math.ceil(span / seg); i++) mk('swimline_segment', SWIM.x0 + seg * (i + 0.5), SEA, SWIM.z, 0, 'line', { float: {}, lod: LOD.float });
  for (let x = SWIM.x0; x <= SWIM.x1 + 1e-6; x += SWIM.step) mk('buoy', x, SEA, SWIM.z, rng.range(0, 6.2832), 'buoy', { float: {}, lod: LOD.float });
  mk('bell_buoy', 0, SEA, SWIM.z, 0, 'bell', { float: {}, lod: LOD.float });

  // ---- the boats on the sand: four named wooden boats and a rowing boat, bows to the sea, each with its oar, and a coil of rope or an anchor beside some of them
  SAND_BOATS.forEach((b, i) => {
    const name = i < 4 ? WOODEN[i] : 'rowing_boat', [w, h, d] = SIZE[name], yaw = rng.range(-0.1, 0.1) + (i === 4 ? 0.3 : 0);
    const lo = H(b.x, b.z - d / 2), hi = H(b.x, b.z + d / 2), ground = (lo + hi) / 2, pitch = Math.atan2(hi - lo, d);
    const y = ground - 0.04 + (name === 'rowing_boat' ? FLOAT.rowing_boat.draft : 0);
    const boat = mk(name, b.x, y, b.z, yaw, 'boat', { pitch, lod: LOD.boat }), of = boat.id;
    thick('boat.sand', b.x, b.z, w, d, yaw, ground - 0.4, ground + h);
    mk('oar', b.x + 1.2, H(b.x + 1.2, b.z - 0.8), b.z - 0.8, rng.range(-0.4, 0.4), 'gear', { of });
    if (i % 2 === 1) mk('rope_coil', b.x - 1.3, H(b.x - 1.3, b.z + 1.9), b.z + 1.9, rng.range(0, 6.2832), 'gear', { of });
    else mk('anchor', b.x + 0.1, H(b.x + 0.1, b.z + d / 2 + 0.5), b.z + d / 2 + 0.5, rng.range(0, 6.2832), 'gear', { of });
  });

  // ---- on the seabed: a moped (the discovery at 3 m) and an anchor with a tyre (2.2 m)
  for (const [id, name, x, z, yaw] of [['moped', 'sunken_moped', -48, 207.5, 0.6], ['anchor', 'sunken_anchor_tyre', -22, 190, -0.4]]) {
    const bed = H(x, z); mk(name, x, bed - 0.03, z, yaw, 'sunken', { lod: LOD.sunk }); sunken.push({ id, x, y: f3(bed), z, depth: f3(SEA - bed) });
  }

  // ---- the coral patch: east of the raft, in the swimmers' water, where the seabed lies REEF.depth under the sea. Its z is solved from the coast (the profile only falls south of the shore, so the water over it
  // only deepens and a bisection finds the one z) and not written down, so a coast that moves its seabed moves the patch with it and the discovery stays at the depth the design names.
  let zlo = 150, zhi = STOP_Z;
  for (let i = 0; i < 48; i++) { const zm = (zlo + zhi) / 2; if (coast.depthAt(REEF.x, zm) < REEF.depth) zlo = zm; else zhi = zm; }
  const rz = f3((zlo + zhi) / 2), reef = { id: 'reef', x: REEF.x, y: f3(H(REEF.x, rz)), z: rz, depth: f3(SEA - H(REEF.x, rz)), r: REEF.r };

  const by = {}; for (const it of items) by[it.group] = (by[it.group] ?? 0) + 1;
  return { items, walls, floors, lamps, ropes, sunken, reef, by, stats: { items: items.length, floaters: items.filter((i) => i.float).length, walls: walls.length, floors: floors.length, lamps: lamps.length, ropes: ropes.length } };
}

/** The sea's colliders (the pier's deck and rails and piles and lamps and crates, the raft's deck and skirt, every hull): part of the world from the first frame, drawn or not. Returns how many were made. */
export function seaColliders(physics, sea) {
  for (const w of sea.walls) physics.addWall({ x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2, t: w.t, y0: w.y0, y1: w.y1, id: w.id });
  for (const f of sea.floors) physics.addFloor({ pts: f.pts, y: f.y, id: f.id });
  return sea.walls.length + sea.floors.length;
}
