// The sea's set pieces as data (A5, js/world/beachsea.js, dev/FEATURE-BEACH.md phase 2b): the pier, the raft, the swim line, the moored boats, the boats on the sand and the things on the seabed.
// Pure: the coast plan in, plain records out, so this runs in Node with no renderer and no library loaded, and the page reads the same layout.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-beachsea.test.mjs
// Every check has a deliberately broken input selected by BS_SABOTAGE=<id>|all, and each must then FAIL:
//   gap      a deck module of the pier is missing        narrow   the walkable floor is half a metre narrower than the deck       short    a pile stops half way to the deck
//   wall     the piles have no colliders                  open     a rail is gone from the stem                                    shut     the head's rail gap is closed
//   block    a wall of crates across the deck             dark     a lamp has no light                                             far      every other lamp is gone
//   ladder   the pier's ladder is two metres out of place  sunk     a buoy sits under the sea                                       moor     the lancha is moored on the pier
//   rope     a mooring line ends in the air               raft     the raft has no deck to stand on                                line     a buoy of the swim line is gone
//   float    a boat on the sand is a metre in the air     oar      the boats on the sand have no oars                              shallow  the moped lies in the shallows
//   many     nine hundred more pieces                     random   a layout that is not a function of the seed
//   nocap    nothing closes the underside's south end     capnear  the cap is a bent too soon                                              capfar   the cap is a bent too late
//   noside   nothing closes the underside's edges
//   reef     the coral patch is in the shallows              reefx    it is outside the beach's walls                                reefmoped it lies on the moped
//   reefwall a wall stands 3 m from it                       reefrand a coral patch that is not a function of the coast
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { SEA, BUOY_Z, PIER, RAFT, SAND_BOATS, XW } from '../js/world/coast.js';
import { planSea, RAIL, ROOM, SWIM } from '../js/world/beachsea.js';
import { planFront } from '../js/world/beachfront.js';
import { SIZE, ANCHOR, FLOAT, WATER_MANIFESTS, assetKey } from '../js/world/waterlib.js';
import { readAssetJson } from './headless.mjs';
import { shapeOf, overlaps, box, segDist } from './geom2d.mjs';

const SAB = process.env.BS_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029;

const ctx = createContext({ seed: SEED, headless: true });
const plan = generatePlan(ctx), coast = plan.coast, H = coast.heightAt;
let tick = 0;

/** The sea the checks look at: the real one, or a broken copy when BS_SABOTAGE asks. */
function sea(seed) {
  const s = planSea(coast, seed !== undefined ? { seed } : on('random') ? { seed: 1 + (tick++) } : {});     // (random: every call lays the sea out from another seed)
  if (seed !== undefined) return s;
  const wall = (id, x1, z1, x2, z2, t, y0, y1) => s.walls.push({ id, x1, z1, x2, z2, t, y0, y1 });
  const item = (pred) => s.items.find(pred);
  if (on('gap')) { const d = s.items.filter((i) => i.group === 'deck')[17]; s.items = s.items.filter((i) => i !== d); }
  if (on('narrow')) { const f = s.floors.find((q) => q.id === 'pier.deck'); f.pts = f.pts.map(([x, z]) => [x > PIER.x ? x - 0.5 : x, z]); }
  if (on('short')) { const p = item((i) => i.group === 'pile' && i.z > 150); p.scale = [1, p.scale[1] * 0.5, 1]; }
  if (on('wall')) s.walls = s.walls.filter((w) => w.id !== 'pier.pile');
  if (on('open')) { const east = s.walls.find((w) => w.id === 'pier.rail' && w.x1 === w.x2 && w.x1 > PIER.x && Math.abs(w.z2 - w.z1) > 40); s.walls = s.walls.filter((w) => w !== east); }
  if (on('shut')) wall('pier.rail', PIER.x - 0.6, PIER.z1 - RAIL.inset, PIER.x + 0.6, PIER.z1 - RAIL.inset, RAIL.t, PIER.top - 0.4, PIER.top + RAIL.h);
  if (on('block')) wall('pier.crate', PIER.x - 1.5, 140, PIER.x + 1.5, 140, 0.3, PIER.top - 0.4, PIER.top + 0.5);
  if (on('dark')) delete s.lamps[3].light;
  if (on('far')) s.lamps = s.lamps.filter((l) => { const k = +l.id.split('.')[1]; return k >= 8 || k % 2 === 0; });
  if (on('ladder')) item((i) => i.group === 'ladder').z -= 2;
  if (on('sunk')) item((i) => i.group === 'buoy').y -= 0.3;
  if (on('moor')) { const b = item((i) => i.group === 'moored'); b.x = PIER.x; for (const w of s.walls.filter((q) => q.id === 'boat.moored').slice(0, 1)) { w.x1 = w.x2 = PIER.x; } }
  if (on('rope')) s.ropes[0].a = [20, PIER.top + 0.1, 120];
  if (on('raft')) s.floors = s.floors.filter((f) => f.id !== 'raft.deck');
  if (on('line')) s.items = s.items.filter((i) => i.id !== 'buoy.7');
  if (on('float')) item((i) => i.group === 'boat').y += 1;
  if (on('oar')) s.items = s.items.filter((i) => i.name !== 'oar');
  if (on('shallow')) { const m = item((i) => i.name === 'sunken_moped'); m.z = 150; s.sunken[0].z = 150; }
  if (on('nocap')) s.walls = s.walls.filter((w) => !(w.id === 'pier.skirt' && w.z1 === w.z2));
  if (on('capnear', 'capfar')) { const d = on('capnear') ? -4 : 4; for (const w of s.walls.filter((q) => q.id === 'pier.skirt')) { if (w.z1 > PIER.z0 + 10) w.z1 += d; if (w.z2 > PIER.z0 + 10) w.z2 += d; } }
  if (on('noside')) s.walls = s.walls.filter((w) => !(w.id === 'pier.skirt' && w.x1 === w.x2));
  if (on('reef')) s.reef = { ...s.reef, z: 150 };
  if (on('reefx')) s.reef = { ...s.reef, x: 100 };
  if (on('reefmoped')) s.reef = { ...s.reef, x: -48 };
  if (on('reefwall')) wall('sea.test', 61, 209, 61, 211, 0.5, SEA - 1, SEA + 1);
  if (on('reefrand')) s.reef = { ...s.reef, x: s.reef.x + 0.001 * (++tick) };
  if (on('many')) for (let i = 0; i < 900; i++) s.items.push({ id: 'x.' + i, group: 'gear', name: 'rope_coil', key: assetKey('rope_coil'), x: -90 + (i % 180), y: -4, z: 200, yaw: 0, lod: [10, 30] });
  return s;
}
const S = sea();

/** A walker with feet at `feet`: is the wall in its way? (physics.js: a wall blocks when its top is over 0.4 m above the feet and its foot under the head) */
const blocks = (w, feet) => w.y1 > feet + 0.4 && w.y0 < feet + 1.78 - 0.1;
const inside = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const edgeDist = (pts, x, z) => Math.min(...pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return segDist(x, z, { x1: a[0], z1: a[1], x2: b[0], z2: b[1] }); }));
const area = (pts) => Math.abs(pts.reduce((s, a, i) => { const b = pts[(i + 1) % pts.length]; return s + (a[0] * b[1] - b[0] * a[1]); }, 0)) / 2;
/** A point of a design's own frame in the world (yaw only: the pier's pieces and the floaters at rest). */
const at = (it, [x, y, z]) => [it.x + x * Math.cos(it.yaw) + z * Math.sin(it.yaw), it.y + y, it.z - x * Math.sin(it.yaw) + z * Math.cos(it.yaw)];
const named = (name) => S.items.filter((i) => i.name === name);
const group = (g) => S.items.filter((i) => i.group === g);

/** Where a walker on the deck can go: a grid of 10 cm cells inside the floor, a cell free when the body's circle (0.3 m) touches no wall that would stop it, flooded from the stair's foot. */
let reach = null;
function deckReach() {
  if (reach) return reach;
  const floor = S.floors.find((f) => f.id === 'pier.deck'), cell = 0.1, x0 = PIER.x - 2.2, z0 = PIER.z0 - 0.5, nx = Math.round(4.4 / cell), nz = Math.round((PIER.z1 + 0.5 - z0) / cell);
  const walls = S.walls.filter((w) => w.id.startsWith('pier.') && blocks(w, PIER.top)), xz = (i, j) => [x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell];
  const free = (i, j) => { const [x, z] = xz(i, j); return inside(floor.pts, x, z) && walls.every((w) => segDist(x, z, w) >= w.t + 0.3); };
  const seen = new Uint8Array(nx * nz), todo = [], start = [Math.round((PIER.x - x0) / cell), Math.round((PIER.z0 + 0.45 - z0) / cell)];
  if (free(...start)) { seen[start[1] * nx + start[0]] = 1; todo.push(start); }
  for (let k = 0; k < todo.length; k++) {
    const [i, j] = todo[k];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a >= 0 && b >= 0 && a < nx && b < nz && !seen[b * nx + a] && free(a, b)) { seen[b * nx + a] = 1; todo.push([a, b]); }
    }
  }
  const cells = todo.map(([i, j]) => xz(i, j));
  const leaks = cells.filter(([x, z]) => edgeDist(floor.pts, x, z) < 0.38 && z > PIER.z0 + 1.0 && !(z > PIER.z1 - 0.9 && Math.abs(x - PIER.x) < 0.9));
  return (reach = { cells, leaks });
}

test('the layout is a function of the coast and the seed: the same twice; another seed moves the details, never the pier', () => {
  const a = sea(), b = sea();
  assert.deepEqual(a, b, 'the same coast and seed give the same sea, to the last record');
  const c = sea(SEED + 1), kit = (s) => s.items.filter((i) => !i.float && ['deck', 'head', 'pile', 'brace', 'post', 'rail', 'lamp', 'rod', 'crate', 'cleat', 'ladder'].includes(i.group));
  assert.deepEqual(kit(c), kit(sea(SEED)), 'the pier does not depend on the seed');
  assert.notDeepEqual(c.items, sea(SEED).items, 'but the buoys\' turns, the boats\' lie and the swell\'s phases do');
  assert.deepEqual(Object.keys(a).sort(), ['by', 'floors', 'items', 'lamps', 'reef', 'ropes', 'stats', 'sunken', 'walls']);
  const ids = new Set(a.items.map((i) => i.id)); assert.equal(ids.size, a.items.length, 'every piece has its own id');
  for (const i of a.items) assert.ok(SIZE[i.name] && i.key === assetKey(i.name), `${i.id}: ${i.name} is a design of the library the world holds the size of`);
});

test('the pier is the library\'s kit on the axis stair: forty deck modules and the head with no gap between, and a floor over all of it at the deck\'s height', () => {
  const decks = group('deck').sort((a, b) => a.z - b.z), head = group('head')[0], [dw, dh, dd] = SIZE.pier_deck, [, , hd] = SIZE.pier_end_platform;
  assert.equal(decks.length, 40, 'forty modules');
  decks.forEach((d, i) => {
    assert.equal(d.x, PIER.x, `module ${i} is on the axis`); assert.equal(d.y, +(PIER.top - dh).toFixed(3), `module ${i} stands so that its top is the deck`);
    if (i) assert.ok(Math.abs(d.z - decks[i - 1].z - dd) < 1e-6, `module ${i} follows the one before it with no gap and no overlap`);
  });
  assert.equal(decks[0].z - dd / 2, PIER.z0, 'the first module starts where the stair does');
  assert.ok(head, 'the head is there'); assert.ok(Math.abs(decks.at(-1).z + dd / 2 - (head.z - hd / 2)) < 1e-6, 'the last module meets the head');
  assert.ok(Math.abs(head.z + hd / 2 - PIER.z1) < 1e-6, 'and the head ends where the pier does');
  const floor = S.floors.find((f) => f.id === 'pier.deck');
  assert.ok(floor && floor.y === PIER.top, 'a floor at the deck\'s height');
  const modules = decks.length * dw * dd + SIZE.pier_end_platform[0] * hd;
  assert.ok(Math.abs(area(floor.pts) - modules) < 1e-6, `the floor (${area(floor.pts).toFixed(2)} m2) is exactly the modules' (${modules.toFixed(2)} m2): nothing to stand on that is not deck, no deck that cannot be stood on`);
  for (const [x, z] of floor.pts) assert.ok(Math.abs(x - PIER.x) <= 2 + 1e-9 && z >= PIER.z0 && z <= PIER.z1, 'and it is inside the pier\'s box');
});

test('the piles: every one reaches from the seabed to the deck\'s underside, stands in a bent of two with the head\'s four, and stops a swimmer', () => {
  const piles = group('pile'), base = PIER.top - SIZE.pier_deck[1], bents = new Set(piles.filter((p) => p.z < PIER.z1 - 3).map((p) => p.z));
  assert.equal(bents.size, 20, 'a bent every 4 m along the stem');
  assert.equal(piles.length, 44, 'forty piles in the bents and four at the head');
  for (const p of piles) {
    const top = p.y + SIZE.pier_pile[1] * p.scale[1], bed = H(p.x, p.z);
    assert.ok(Math.abs(top - base) < 1e-2, `${p.id}: its top (${top.toFixed(3)}) is the deck's underside (${base})`);
    assert.ok(p.y < bed - 0.2 && p.y > bed - 0.6, `${p.id}: it is driven ${(bed - p.y).toFixed(2)} m into the seabed`);
    const w = S.walls.find((q) => q.id === 'pier.pile' && q.x1 === p.x && q.z1 === p.z);
    assert.ok(w, `${p.id} has a collider`); assert.ok(w.y0 <= bed && Math.abs(w.y1 - base) < 1e-9, `${p.id}: the collider runs from the seabed to the deck's underside`);
  }
  for (const z of bents) { const row = piles.filter((p) => p.z === z).map((p) => p.x).sort((a, b) => a - b); if (z < PIER.z1 - 3) assert.deepEqual(row, [PIER.x - 1.2, PIER.x + 1.2], `the bent at ${z}`); }
});

test('the underside is closed where the seabed is too near the deck for a walker\'s eyes: a skirt along both edges and a cap across, on the first bent with room, and nothing beyond it', () => {
  const skirts = S.walls.filter((w) => w.id === 'pier.skirt'), cap = skirts.filter((w) => w.z1 === w.z2), sides = skirts.filter((w) => w.x1 === w.x2);
  const base = PIER.top - SIZE.pier_deck[1], bed = (z) => Math.max(...[-1, -0.5, 0, 0.5, 1].map((u) => H(PIER.x + (u * PIER.w) / 2, z)));
  assert.equal(cap.length, 1, 'a cap across'); assert.equal(sides.length, 2, 'a skirt along each edge'); assert.equal(skirts.length, 3, 'and nothing else');
  const zc = cap[0].z1;
  assert.ok(group('pile').some((p) => p.z === zc), `the cap stands on a bent (z ${zc})`);
  assert.ok(base - bed(zc) >= ROOM - 1e-9, `there is room for the eyes at the cap (${(base - bed(zc)).toFixed(2)} m under the deck's underside, ${ROOM} wanted)`);
  assert.ok(base - bed(zc - 4) < ROOM, `and there was none on the bent before it (${(base - bed(zc - 4)).toFixed(2)} m), so the cap is on the first with room`);
  assert.deepEqual(sides.map((w) => Math.min(w.z1, w.z2)), [PIER.z0, PIER.z0], 'the skirts start where the pier does'); assert.deepEqual(sides.map((w) => Math.max(w.z1, w.z2)), [zc, zc], 'and end at the cap');
  assert.deepEqual(sides.map((w) => +(w.x1 - PIER.x).toFixed(3)).sort((a, b) => a - b), [-PIER.w / 2, PIER.w / 2], 'on the deck\'s two edges');
  assert.ok(Math.min(cap[0].x1, cap[0].x2) <= PIER.x - PIER.w / 2 && Math.max(cap[0].x1, cap[0].x2) >= PIER.x + PIER.w / 2, 'and the cap spans the deck');
  for (const w of skirts) {
    assert.equal(w.y1, PIER.top, 'up to the deck\'s top');
    assert.ok(!blocks(w, PIER.top), 'so a walker on the deck is not stopped by it');
    assert.ok(blocks(w, bed(zc)) && blocks(w, bed(PIER.z0 + 20)), 'but a walker on the seabed is');
    assert.ok(w.y0 < bed(zc) - 0.3, 'and it goes down into the seabed');
  }
  for (let z = zc; z < PIER.z1 - 3; z += 0.5) assert.ok(base - bed(z) >= ROOM - 1e-9, `z ${z}: beyond the cap the eyes have room`);
});

test('the rails keep a walker on the deck: closed along the stem and round the head but for the gap at the middle of the front and the open foot, and they stop it', () => {
  const rails = S.walls.filter((w) => w.id === 'pier.rail');
  for (const w of rails) { assert.ok(blocks(w, PIER.top), 'a rail stops a walker standing on the deck'); assert.equal(w.t, RAIL.t); assert.ok(w.y0 <= PIER.top - 0.4 + 1e-9, 'and it starts under the deck, so no one steps over its foot from the sand'); }
  const r = deckReach();
  assert.ok(r.cells.length > 1000, `a walker can walk the deck (${r.cells.length} cells)`);
  assert.deepEqual(r.leaks.slice(0, 3), [], `a walker never reaches the deck's edge: ${r.leaks.length} cells of the deck are within 0.38 m of it outside the foot and the gap`);
  assert.ok(r.cells.some(([x, z]) => z > PIER.z1 - 0.2 && Math.abs(x - PIER.x) < 0.3), 'and it can walk out to the very edge at the gap in the head\'s rail, to climb down the ladder or jump');
  assert.ok(r.cells.some(([x, z]) => z > PIER.z1 - 2 && Math.abs(x - PIER.x) > 1.0), 'and the head\'s wings');
  const posts = group('post'), handrails = group('rail');
  assert.ok(posts.length > 80 && handrails.length > 80, `${posts.length} posts and ${handrails.length} handrails`);
  for (const h of handrails) assert.ok(h.scale[0] > 0.2 && h.scale[0] <= 1.0 + 1e-9, `${h.id} is the 2 m handrail shortened to fit between its posts, never stretched`);
  for (const p of coast.pois.filter((q) => q.kind === 'fish')) {
    assert.ok(r.cells.some(([x, z]) => Math.hypot(x - p.x, z - p.z) <= 0.9), `${p.id}: a walker can come within 0.9 m of the fishing post (the stuck sweep asks as much)`);
    const holder = named('rod_holder').find((i) => Math.abs(i.z - p.z) < 0.01 && Math.sign(i.x - PIER.x) === Math.sign(p.x - PIER.x));
    assert.ok(holder, `${p.id} has a rod holder on the rail beside it`); assert.ok(Math.abs(holder.y - (PIER.top + RAIL.h)) < 1e-9 && Math.abs(holder.x - p.x) < 0.35);
  }
});

test('the lamps: ten on the pier, one every 10 m along the stem and two at the head, each with its light inside the lamp\'s head', () => {
  assert.equal(S.lamps.length, 10);
  const stem = S.lamps.filter((l) => l.z < PIER.z1 - 3).sort((a, b) => a.z - b.z);
  assert.equal(stem.length, 8);
  stem.forEach((l, i) => { if (i) assert.ok(l.z - stem[i - 1].z <= 10 + 1e-9, `${l.id} is ${(l.z - stem[i - 1].z).toFixed(1)} m from the one before`); });
  for (const l of S.lamps) {
    const it = S.items.find((i) => i.id === l.id);
    assert.ok(it && it.name === 'pier_lamp', `${l.id} is a lamp of the library`);
    assert.ok(l.light && Number.isFinite(l.light.x + l.light.y + l.light.z), `${l.id} has a light`);
    assert.ok(l.light.y > PIER.top + 2 && l.light.y < PIER.top + SIZE.pier_lamp[1], `${l.id}: the light is at the top of the lamp`);
    assert.ok(Math.hypot(l.light.x - l.x, l.light.z - l.z) < 0.1, `${l.id}: and over its foot`);
    assert.ok(Math.abs(l.x - PIER.x) < 1.6 && l.y === PIER.top, `${l.id} stands on the deck`);
  }
  assert.equal(S.walls.filter((w) => w.id === 'pier.lamp').length, 10, 'each lamp has a collider');
});

test('the ladders: the pier\'s and the raft\'s each hang where the climb says, from the deck\'s height to the water, inside the climb\'s reach', () => {
  const pierLadder = group('ladder')[0], raft = named('diving_raft')[0];
  const climb = (id) => coast.climbs.find((c) => c.id === id);
  const lad = ANCHOR.pier_ladder.ladder, top = at(pierLadder, lad.end), bottom = at(pierLadder, lad.start), pc = climb('pier.ladder');
  assert.ok(pc, 'the pier\'s ladder is a climb of the coast');
  assert.ok(Math.abs(top[1] - PIER.top) < 0.01, `its top rung is at the deck (${top[1].toFixed(3)})`);
  assert.ok(Math.abs(bottom[1] - pc.y) < 0.01, `its foot is where the climb starts (${bottom[1].toFixed(3)}, the climb ${pc.y})`);
  assert.ok(Math.hypot(bottom[0] - pc.x, bottom[2] - pc.z) <= pc.r, `the foot is inside the climb's reach (${Math.hypot(bottom[0] - pc.x, bottom[2] - pc.z).toFixed(2)} of ${pc.r} m)`);
  assert.ok(top[2] < PIER.z1 && top[2] > PIER.z1 - 0.6 && Math.abs(top[0] - PIER.x) < 0.01, 'the top is at the front edge, at the gap in the rail');
  const rl = ANCHOR.diving_raft.ladder, rtop = at(raft, rl.end), rbottom = at(raft, rl.start), rc = climb('raft.ladder');
  assert.ok(rc, 'the raft\'s ladder is a climb of the coast');
  assert.ok(Math.abs(rtop[1] - RAFT.top) < 0.01 && Math.abs(rtop[1] - rc.top) < 0.01, 'the raft\'s ladder ends at the raft\'s deck');
  assert.ok(Math.abs(rbottom[1] - rc.y) < 0.01, 'and starts where the climb starts');
  assert.ok(Math.hypot(rbottom[0] - rc.x, rbottom[2] - rc.z) <= rc.r, 'inside its reach');
  assert.ok(rtop[2] < RAFT.z, 'the raft\'s ladder is on the shore side');
});

test('the floaters ride the sea: at its height, with the library\'s draft, bob and rock; only the raft is rigid; the moored boats are in deep enough water and clear of the pier and of each other, and every rope ends on a cleat and a ring', () => {
  for (const i of S.items) {
    if (!i.float) { assert.ok(!FLOAT[i.name] || ['gear', 'boat'].includes(i.group), `${i.id} (${i.name}) floats in the library; it is placed as a fixed piece only as gear on the deck or a boat drawn up on the sand`); continue; }
    assert.equal(i.y, SEA, `${i.id} has its waterline at the sea's height`);
    const f = FLOAT[i.name]; assert.ok(f, `${i.name} floats in the library`);
    assert.deepEqual({ draft: i.float.draft, bob: i.float.bob, rock: i.float.rock }, f, `${i.id}: the library's numbers`);
    assert.equal(i.float.rig, i.name === 'diving_raft' ? 'rigid' : 'free', `${i.id}: rig`);
    assert.ok(Number.isFinite(i.float.phase) && i.float.phase >= 0 && i.float.phase < 6.2832, `${i.id}: a phase of the swell`);
  }
  const deck = box(PIER.x - 2.0 - 0.4, PIER.z0, PIER.x + 2.0 + 0.4, PIER.z1), moored = group('moored'), hulls = S.walls.filter((w) => w.id === 'boat.moored');
  assert.equal(moored.length, 2); assert.equal(hulls.length, 2, 'each has a collider');
  for (const w of hulls) assert.ok(!overlaps(shapeOf(w), deck), `a moored boat's hull is 0.4 m clear of the pier (${JSON.stringify([w.x1, w.z1])})`);
  moored.forEach((b, k) => {
    const [bw, , bd] = SIZE[b.name], c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = b.x + dx * bw / 2 * c + dz * bd / 2 * s, z = b.z - dx * bw / 2 * s + dz * bd / 2 * c;
      assert.ok(coast.depthAt(x, z) >= FLOAT[b.name].draft + 0.5, `${b.id}: ${coast.depthAt(x, z).toFixed(2)} m of water under a corner of the hull`);
    }
    for (const o of moored.slice(k + 1)) assert.ok(Math.hypot(b.x - o.x, b.z - o.z) > 5, `${b.id} and ${o.id} are apart`);
  });
  const cleats = named('mooring_cleat');
  assert.ok(S.ropes.length >= 3);
  for (const r of S.ropes) {
    const cl = cleats.find((c) => Math.abs(c.x - r.a[0]) < 0.01 && Math.abs(c.z - r.a[2]) < 0.01);
    assert.ok(cl && Math.abs(r.a[1] - (PIER.top + 0.1)) < 1e-9, `${r.id} is made fast to a cleat of the deck`);
    const boat = S.items.find((i) => i.id === r.item);
    assert.ok(boat?.float, `${r.id} runs to a floater`);
    const ring = at(boat, r.anchor), len = Math.hypot(ring[0] - r.a[0], ring[1] - r.a[1], ring[2] - r.a[2]);
    assert.ok(len > 0.8 && len < 3.5, `${r.id} is ${len.toFixed(2)} m long`);
    assert.ok(ring[1] > SEA + 0.3 && ring[1] < SEA + 1.0, `${r.id}: the ring is above the water (${ring[1].toFixed(2)})`);
  }
});

test('the raft: a floor 3 m square at its deck, a skirt of four walls under the edge that shuts swimmers out from under it, in water deep enough', () => {
  const raft = named('diving_raft'), f = S.floors.find((q) => q.id === 'raft.deck');
  assert.equal(raft.length, 1); assert.ok(f, 'a floor to stand on');
  assert.equal(f.y, RAFT.top); assert.ok(Math.abs(area(f.pts) - 9) < 1e-9, 'three metres square');
  assert.ok(f.pts.every(([x, z]) => Math.abs(x - RAFT.x) <= 1.5 + 1e-9 && Math.abs(z - RAFT.z) <= 1.5 + 1e-9), 'on the raft');
  const skirt = S.walls.filter((w) => w.id === 'raft.skirt');
  assert.equal(skirt.length, 4);
  const ends = skirt.flatMap((w) => [[w.x1, w.z1], [w.x2, w.z2]].map(([x, z]) => `${x.toFixed(3)}|${z.toFixed(3)}`));
  assert.ok(ends.every((e) => ends.filter((q) => q === e).length === 2), 'the four walls make one closed loop');
  for (const w of skirt) { assert.ok(w.y1 === RAFT.top && w.y0 < H(RAFT.x, RAFT.z) + 0.6, 'from the seabed to the deck'); assert.ok(blocks(w, SEA - 0.9), 'and it stops a swimmer'); }
  assert.ok(coast.depthAt(RAFT.x, RAFT.z) >= FLOAT.diving_raft.draft + 0.5, `${coast.depthAt(RAFT.x, RAFT.z).toFixed(2)} m of water under the raft`);
  assert.ok(Math.abs(RAFT.top - (SEA + ANCHOR.diving_raft.stand[1])) < 1e-9, 'the deck is the raft\'s stand height over the sea');
});

test('the swim line: twenty buoys 10 m apart on the buoys\' line, the bell buoy in the middle, and a rope of floats with no gap from end to end', () => {
  const buoys = group('buoy').sort((a, b) => a.x - b.x);
  assert.equal(buoys.length, 20);
  buoys.forEach((b, i) => { assert.equal(b.z, BUOY_Z); assert.ok(Math.abs(b.x - (SWIM.x0 + i * SWIM.step)) < 1e-9, `buoy ${i}`); });
  assert.equal(buoys[0].x, SWIM.x0); assert.equal(buoys.at(-1).x, SWIM.x1);
  const bell = group('bell'); assert.equal(bell.length, 1); assert.equal(bell[0].x, 0); assert.equal(bell[0].z, BUOY_Z);
  const segs = group('line').sort((a, b) => a.x - b.x), len = SIZE.swimline_segment[0];
  assert.ok(segs.length >= Math.ceil((SWIM.x1 - SWIM.x0) / len));
  segs.forEach((s, i) => { assert.equal(s.z, BUOY_Z); if (i) assert.ok(Math.abs(s.x - segs[i - 1].x - len) < 1e-6, `segment ${i} meets the one before`); });
  assert.ok(segs[0].x - len / 2 <= SWIM.x0 + 1e-9 && segs.at(-1).x + len / 2 >= SWIM.x1 - 1e-9, 'it runs from the first buoy to the last');
  assert.ok(buoys.every((b) => Math.abs(b.x) < XW - 3), 'and inside the beach\'s walls');
});

test('the boats on the sand: five, each on its place with its keel on the slope (pitched with it) and a hull collider, an oar beside it and a coil or an anchor', () => {
  const boats = group('boat'), hulls = S.walls.filter((w) => w.id === 'boat.sand');
  assert.equal(boats.length, SAND_BOATS.length); assert.equal(hulls.length, SAND_BOATS.length);
  assert.equal(new Set(boats.slice(0, 4).map((b) => b.name)).size, 4, 'four different named boats');
  assert.equal(boats[4].name, 'rowing_boat');
  SAND_BOATS.forEach((p, i) => {
    const b = boats[i], [, bh, bd] = SIZE[b.name];
    assert.equal(b.x, p.x); assert.equal(b.z, p.z);
    const ends = [-1, 1].map((k) => ({ ground: H(b.x + k * Math.sin(b.yaw) * bd / 2, b.z + k * Math.cos(b.yaw) * bd / 2), y: b.y + k * Math.sin(b.pitch ?? 0) * bd / 2 - (b.name === 'rowing_boat' ? FLOAT.rowing_boat.draft : 0) }));
    for (const e of ends) assert.ok(e.y - e.ground > -0.25 && e.y - e.ground < 0.3, `${b.id}: the hull is ${(e.y - e.ground).toFixed(2)} m over the sand at one end`);
    assert.ok(Math.abs((b.pitch ?? 0)) < 0.2, 'pitched with the beach, never on its end');
    const hull = hulls.find((w) => Math.hypot((w.x1 + w.x2) / 2 - p.x, (w.z1 + w.z2) / 2 - p.z) < 0.1);
    assert.ok(hull, `${b.id} has a hull collider`); assert.ok(hull.y1 >= H(p.x, p.z) + bh - 0.05 && blocks(hull, H(p.x, p.z)), 'that stops a walker');
    const gear = S.items.filter((q) => q.of === b.id);
    assert.ok(gear.some((q) => q.name === 'oar'), `${b.id} has an oar beside it`);
    assert.ok(gear.some((q) => q.name === 'rope_coil' || q.name === 'anchor'), `and a coil of rope or an anchor`);
    for (const q of gear) assert.ok(Math.abs(q.y - H(q.x, q.z)) < 0.05, `${q.id} lies on the sand`);
  });
  const sand = S.walls.filter((w) => w.id === 'boat.sand').map(shapeOf), front = planFront(coast);
  for (const s of front.solids) for (const h of sand) assert.ok(!overlaps(shapeOf(s), h), `${s.id} stands on a boat`);
});

test('on the seabed: the moped about 3 m down and the anchor about 2 m, in the swimming water, clear of the pier, the raft and the swim line, standing on the bottom', () => {
  assert.equal(S.sunken.length, 2);
  const by = Object.fromEntries(S.sunken.map((s) => [s.id, s]));
  const depth = (s) => SEA - H(s.x, s.z);
  assert.ok(depth(by.moped) > 2.5 && depth(by.moped) < 3.5, `the moped is ${depth(by.moped).toFixed(2)} m down`);
  assert.ok(depth(by.anchor) > 1.8 && depth(by.anchor) < 2.6, `the anchor is ${depth(by.anchor).toFixed(2)} m down`);
  for (const s of S.sunken) {
    assert.ok(Math.abs(s.depth - depth(s)) < 0.01, `${s.id}: the record's depth is the coast's`);
    assert.ok(Math.abs(s.x) < XW - 8 && s.z > 150 && s.z < BUOY_Z, `${s.id} is inside the buoys, a swimmer's water`);
    assert.ok(Math.hypot(s.x - RAFT.x, s.z - RAFT.z) > 6 && Math.abs(s.z - BUOY_Z) > 1, `${s.id} is clear of the raft and of the line`);
    assert.ok(Math.abs(s.x - PIER.x) > 2.5 || s.z > PIER.z1 + 3, `${s.id} is not under the pier's piles`);
    const it = S.items.find((i) => i.group === 'sunken' && Math.abs(i.x - s.x) < 0.01 && Math.abs(i.z - s.z) < 0.01);
    assert.ok(it && Math.abs(it.y - H(s.x, s.z)) < 0.05, `${s.id} stands on the bottom`);
  }
  assert.deepEqual(group('sunken').map((i) => i.name).sort(), ['sunken_anchor_tyre', 'sunken_moped']);
});

test('the coral patch: a key of its own (the sunken things stay two), 3 m down where a swimmer can dive, inside the swim zone, 8 m from the pier, the raft, every boat and every wall, 6 m from both sunken things, and the same twice', () => {
  const R = S.reef, polyDist = (pts, x, z) => (inside(pts, x, z) ? 0 : edgeDist(pts, x, z));
  assert.equal(S.sunken.length, 2, 'the coral patch is not a third sunken thing');
  assert.ok(R && R.id === 'reef', 'the sea plan holds the coral patch');
  assert.deepEqual(Object.keys(R).sort(), ['depth', 'id', 'r', 'x', 'y', 'z'], 'its record: id, x, y, z, depth, r');
  assert.ok([R.x, R.y, R.z, R.depth, R.r].every(Number.isFinite), 'finite numbers');
  const depth = SEA - H(R.x, R.z);
  assert.ok(depth >= 2.95 && depth <= 3.05, `the water over the coral patch is ${depth.toFixed(3)} m deep (2.95 to 3.05 wanted)`);
  assert.ok(Math.abs(R.depth - depth) < 0.01, `the record's depth (${R.depth}) is the coast's (${depth.toFixed(3)})`);
  assert.ok(Math.abs(R.y - H(R.x, R.z)) < 0.005, `its y (${R.y}) is the seabed's (${H(R.x, R.z).toFixed(3)})`);
  assert.equal(R.r, 2.6, 'a patch 2.6 m in radius');
  const lim = coast.limit(R.x, R.z);
  assert.ok(!lim.hard && lim.x === R.x && lim.z === R.z, `it is inside the swim zone: the player can reach it and the limit does not move it (${JSON.stringify(lim)})`);
  for (const f of S.floors) assert.ok(polyDist(f.pts, R.x, R.z) >= 8, `${f.id} (the pier's deck, the raft's) is ${polyDist(f.pts, R.x, R.z).toFixed(1)} m from the coral patch`);
  for (const w of S.walls) assert.ok(segDist(R.x, R.z, w) - w.t >= 8, `${w.id} (${w.x1}, ${w.z1}) is ${(segDist(R.x, R.z, w) - w.t).toFixed(1)} m from the coral patch`);
  for (const b of S.items.filter((i) => ['moored', 'boat'].includes(i.group))) assert.ok(Math.hypot(b.x - R.x, b.z - R.z) >= 8, `${b.id} (${b.name}) is ${Math.hypot(b.x - R.x, b.z - R.z).toFixed(1)} m from the coral patch`);
  for (const s of S.sunken) assert.ok(Math.hypot(s.x - R.x, s.z - R.z) >= 6, `${s.id} is ${Math.hypot(s.x - R.x, s.z - R.z).toFixed(1)} m from the coral patch (6 wanted)`);
  assert.deepEqual(sea().reef, sea().reef, 'the same coast gives the same patch to the last digit');
  assert.deepEqual(sea(SEED + 5).reef, sea(SEED).reef, 'and it is the coast\'s depth that puts it there, not the seed');
});

test('colliders are well-formed and the budget holds: every wall and floor has finite numbers, nothing is outside the beach, and the whole sea is under 450 pieces and the near triangles under a bound', async () => {
  for (const w of S.walls) { assert.ok([w.x1, w.z1, w.x2, w.z2, w.t, w.y0, w.y1].every(Number.isFinite), `${w.id}: finite`); assert.ok(w.t > 0 && w.y1 > w.y0, `${w.id}: positive`); }
  for (const f of S.floors) { assert.ok(f.pts.length >= 3 && f.pts.every((p) => p.every(Number.isFinite)) && Number.isFinite(f.y), `${f.id}: finite`); }
  for (const i of S.items) { assert.ok([i.x, i.y, i.z, i.yaw].every(Number.isFinite), `${i.id}: finite`); assert.ok(Math.abs(i.x) <= XW && i.z >= PIER.z0 && i.z <= 225, `${i.id} is on the beach's side of the world`); assert.ok(i.lod[0] < i.lod[1], `${i.id}: lod`); }
  assert.ok(S.items.length <= 450, `${S.items.length} pieces (406 when written)`);
  assert.ok(S.items.filter((i) => i.float).length <= 100, 'the swell moves at most 100 pieces a frame');
  const manifest = await readAssetJson(WATER_MANIFESTS[0]), tri = Object.fromEntries(manifest.files.flatMap((f) => Object.entries(f.assets)).map(([n, e]) => [n, e.triangles]));
  let near = 0, low = 0; for (const i of S.items) { near += tri[i.key]; low += tri[i.key + '_lod1']; }
  assert.ok(near < 80000, `${(near / 1000).toFixed(0)} k triangles with every piece at its near model (41 k when written)`);
  assert.ok(low < near / 2.5, `${(low / 1000).toFixed(0)} k triangles with every piece at its low twin (11 k when written)`);
});
