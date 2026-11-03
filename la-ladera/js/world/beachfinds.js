// THE BEACH'S DISCOVERIES (A5, round 7, phase 2c, dev/FEATURE-BEACH.md 1.6): eight things a walker finds by going up to them, each bound to something that is really there. Pure: the coast plan (coast.js), the
// front (beachfront.js) and the sea's set pieces (beachsea.js) in, plain records out, so a Node test and the page read the same places; `buildBeachFinds` hands them to discover.js, which registers them last
// (ctx.world.extra: { id, name, en, kind, x, z, y, radius, dy }) like every other find of the world.
//
//   muelle   'vista'    the end of the pier: the head's deck (y 0.22), not the water under it
//   balsa    'object'   the diving raft out at (34, 185): on its deck, or in the water beside it
//   libro    'story'    the lifeguard's logbook, at the foot of the lifeguard tower
//   pizarra  'object'   the cooperative's board: the spot a reader stands at, 0.9 m in front of the cooperative's plaque on a kiosk's front corner (discover.js cannot move a find clear of a collider south of z 100:
//                       the occupancy grid ends there, so every spot of this module is chosen clear of the fixtures' colliders, and tests/world-beachfinds.test.mjs checks it)
//   botella  'hidden'   a message in a bottle, on the wrack line beside a piece of driftwood
//   moto     'hidden'   the sunken moped (seabed 2.9 m down), el ancla 'object' (the anchor with its tyre, 2.2 m) and coral 'nature' (the coral patch, 3.0 m): each a DIVE
// `y` is the height the player's feet are at when the thing is found and `dy` the window round it (core/registries.js Discoveries.check: |y - find.y| < dy), so depth works without a rule of its own: a
// swimmer's feet are at the surface (-1.5), the three on the seabed are windows round the seabed (a diver's feet 0.9 m above it) that the surface is outside of, and the controller dives to the seabed + 0.3 m.
import { SEA, PIER, RAFT } from './coast.js';

/** A swimmer's feet at the surface (the swim controller keeps `y` here: dev/FEATURE-BEACH.md 3.3) and how far above the seabed a diver's feet are when he is next to what lies on it. */
export const SURFACE_Y = SEA - 0.3, DIVE_ABOVE = 0.9;

export function planBeachFinds(coast, front, sea) {
  const H = coast.heightAt, out = [];
  const at = (id, name, en, kind, x, z, y, radius, dy) => out.push({ id, name, en, kind, x: +x.toFixed(2), z: +z.toFixed(2), y: +y.toFixed(2), radius, dy });
  const item = (pred) => front?.items.find(pred);

  at('muelle', 'El final del muelle', 'The very end of the fishermen\'s pier: a rail, a ladder and a lamp, and the whole bay open in front of you.', 'vista', PIER.x, PIER.z1 - 2, PIER.top, 3, 1.3);
  at('balsa', 'La balsa de los nadadores', 'A diving raft anchored beyond the surf. Everybody races to be first to reach it, and nobody admits to losing.', 'object', RAFT.x, RAFT.z, RAFT.top, 4, 1.7);

  const tower = item((i) => i.name === 'lifeguard_tower');
  if (tower) at('libro', 'El libro del salvavidas', 'The lifeguard\'s logbook, left on the tower\'s step: tides, flags and rescues in pencil, and one entry that only says "nothing happened, a very good day".', 'story', tower.x, tower.z + 2.4, H(tower.x, tower.z + 2.4), 3.2, 2.5);
  const board = item((i) => i.name === 'sign_cooperativa');
  if (board) at('pizarra', 'La pizarra de la cooperativa', 'The fishermen\'s cooperative board: the morning\'s catch and its price in chalk, and a column of names under "debe".', 'object', board.x, board.z + 0.9, H(board.x, board.z + 0.9), 3.2, 2.5);
  const wood = front?.items.filter((i) => i.group === 'driftwood') ?? [];
  if (wood.length) { const d = wood[Math.floor(wood.length / 3)], x = d.x + 0.9, z = d.z - 0.5; at('botella', 'La botella con un mensaje', 'A green bottle wedged among the driftwood, with a rolled note inside. The ink has run; the one word left is "mañana".', 'hidden', x, z, H(x, z), 2.4, 2.5); }

  const bed = (id) => sea?.sunken.find((s) => s.id === id);
  const moped = bed('moped'), anchor = bed('anchor'), reef = sea?.reef;
  if (moped) at('moto', 'La moto hundida', 'A moped lying on its side in three metres of water, shell-crusted and perfectly parked. Nobody on the beach will say how it got there.', 'hidden', moped.x, moped.z, moped.y + DIVE_ABOVE, 3.2, 1.3);
  if (anchor) at('ancla', 'El ancla y la llanta', 'An old anchor and a tractor tyre on the seabed: a mooring somebody gave up on. A small crab has moved in under the tyre.', 'object', anchor.x, anchor.z, anchor.y + DIVE_ABOVE - 0.1, 3, 0.9);
  if (reef) at('coral', 'El parche de coral', 'A patch of coral on the sand at three metres: the only reef in the bay, no bigger than a living room, and busy with small fish.', 'nature', reef.x, reef.z, reef.y + DIVE_ABOVE, (reef.r ?? 2.6) + 1.4, 1.3);
  return out;
}

/** The step of the props stage: the finds join `ctx.world.extra` (discover.js registers them last). A world without a live beach has none. */
export function buildBeachFinds(K) {
  const { ctx } = K, W = ctx.world ?? {};
  if (!W.beach?.live) return [];
  const finds = planBeachFinds(ctx.plan.coast, W.beachFront, W.beachSea);
  (W.extra ??= []).push(...finds);
  return finds;
}
