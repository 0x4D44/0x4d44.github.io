// A2: door leaves (round 6, R4-311: "37 door leaves sweep through a fixed piece, mostly pedestal basins").
//  * A leaf opens into `rooms[swing]`: every door of every plan has a swing of 0 or 1 and names a room that way. The first round-6 rowhouse plan gave the bedroom over the hall a swing of -1; the door
//    builder and `swingClear` read "not 1" as the other side (the bedroom) but the furnisher (`interiors/layout.js`: `d.rooms[d.swing] === room.id`) found no room, took the leaf for one that swings AWAY
//    from the bedroom and left its quarter disc unguarded: a dresser, a plant and a bed stood where the leaf goes (3 leaves of the barrio).
//  * On the furnished barrio no leaf sweeps through a fixed piece: the quarter disc a leaf really sweeps (its width about the hinge post, on the side it opens into; each leaf of a double door half the
//    opening) holds no blocking floor piece of its floor. R4's census counts the swing's bounding box (`door.clear`), which also takes in the square's far corner, outside the disc, where the leaf never
//    goes: a pedestal basin tucked into that corner is placed on purpose and is not a sweep; the second test shows the two readings apart.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-leafsweep.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData } from './headless.mjs';
import { testLots, planAll } from './arch-lib.mjs';

const real = await buildData({ colliders: false });
const synth = planAll(testLots(), undefined, true, 0.4, 0);
const MIN_OVERLAP = 0.005;                                       // m2 of disc a piece must stand in to count (a piece that only touches the disc's edge does not)
const STEP = 0.02;                                               // the grid the disc is sampled on

/** What is wrong with the swing of a door, or null: a leaf opens into `rooms[swing]`, so the swing is an index into `rooms` and the room it names exists. */
const swingProblem = (d) => (d.swing === 0 || d.swing === 1) && d.rooms?.[d.swing] ? null : `${d.id} swing ${d.swing} of rooms [${(d.rooms ?? []).join(', ')}]`;

/** The leaves of a door as `arch/doors.js` hangs them: one at the hinge jamb as wide as the opening, or for a double door one at each jamb, each half of it. A leaf: { u: its post along the wall, sg: +1/-1 toward the opening, r: its width }. */
function leavesOf(d) {
  const c = d.wall.dir === 'x' ? d.x : d.z;
  if (d.double) return [{ u: c - d.w / 2, sg: 1, r: d.w / 2 }, { u: c + d.w / 2, sg: -1, r: d.w / 2 }];
  return d.hinge === 'left' ? [{ u: c - d.w / 2, sg: 1, r: d.w }] : [{ u: c + d.w / 2, sg: -1, r: d.w }];
}

/** The frame of a leaf: its post, the unit vector along the wall toward the opening, and the one the leaf swings toward (into `rooms[swing]`). `at(a, b)`: the point a along the wall and b out from it. */
function frameOf(d, leaf) {
  const alongX = d.wall.dir === 'x', off = d.ext ? 0.04 : 0;
  const px = alongX ? leaf.u : d.wall.at + off * d.nx, pz = alongX ? d.wall.at + off * d.nz : leaf.u;
  const ax = alongX ? [leaf.sg, 0] : [0, leaf.sg], sn = d.swing === 1 ? [d.nx, d.nz] : [-d.nx, -d.nz];
  return { px, pz, ax, sn, at: (a, b) => [px + ax[0] * a + sn[0] * b, pz + ax[1] * a + sn[1] * b] };
}

/** Area (m2) of the quarter disc of one leaf that the footprint of piece `f` (centre x, z; w x d turned by ry) stands in. */
function overlap(d, leaf, f) {
  const { px, pz, ax, sn } = frameOf(d, leaf), r = leaf.r;
  const co = Math.cos(f.ry), si = Math.sin(f.ry), hw = f.w / 2, hd = f.d / 2;
  if (Math.hypot(f.x - px, f.z - pz) > r + Math.hypot(hw, hd) + 0.05) return 0;
  let n = 0;
  for (let a = STEP / 2; a < r; a += STEP) for (let b = STEP / 2; b < r; b += STEP) {
    if (a * a + b * b > r * r) continue;
    const dx = px + ax[0] * a + sn[0] * b - f.x, dz = pz + ax[1] * a + sn[1] * b - f.z;
    if (Math.abs(dx * co - dz * si) <= hw && Math.abs(dx * si + dz * co) <= hd) n++;
  }
  return n * STEP * STEP;
}

/** The census R4 ran: does the piece's footprint box meet the door's swing box `door.clear` by more than 8 cm each way? */
function inBox(d, f) {
  const k = d.clear, hw = (Math.abs(Math.cos(f.ry)) * f.w + Math.abs(Math.sin(f.ry)) * f.d) / 2, hd = (Math.abs(Math.sin(f.ry)) * f.w + Math.abs(Math.cos(f.ry)) * f.d) / 2;
  return Math.min(k.x1, f.x + hw) - Math.max(k.x0, f.x - hw) > 0.08 && Math.min(k.z1, f.z + hd) - Math.max(k.z0, f.z - hd) > 0.08;
}

/** The blocking pieces that stand on the floor (not ceiling fittings, not pieces on another piece). */
const floorPieces = (bp) => (bp.furniture ?? []).filter((f) => f.block && f.kind !== 'ceil' && !f.parent);

/** Every (door, piece) pair of a building where a leaf's quarter disc holds a piece of its own floor. Shop shutters roll up and arches have no leaf. */
function sweeps(bp) {
  const floorOf = new Map(bp.rooms.map((r) => [r.id, r.floor])), pieces = floorPieces(bp), out = [];
  for (const d of bp.doors) {
    if (d.kind === 'arch' || d.kind === 'shutter') continue;
    for (const leaf of leavesOf(d)) for (const f of pieces) {
      if (floorOf.get(f.room) !== d.floor) continue;
      const area = overlap(d, leaf, f);
      if (area >= MIN_OVERLAP) out.push({ door: d.id, piece: f.name, room: f.room, area: +area.toFixed(3) });
    }
  }
  return out;
}

test('a leaf opens into rooms[swing]: every door of the barrio and of the test lots has a swing of 0 or 1 that names a room', () => {
  const all = [...real.buildings, ...synth.bps].flatMap((bp) => bp.doors);
  assert.ok(all.length > 2000, `doors looked at: ${all.length}`);
  assert.deepEqual(all.map(swingProblem).filter(Boolean), []);
  // TEETH: the swing the first round-6 rowhouse plan gave a bedroom (-1), one past the pair, a missing one, and a swing into the street (no room there)
  const d = all.find((x) => x.rooms[0] && x.rooms[1]), ext = all.find((x) => x.ext);
  assert.equal(swingProblem(d), null);
  for (const swing of [-1, 2, undefined, NaN]) assert.ok(swingProblem({ ...d, swing }), `a swing of ${swing} passes`);
  assert.equal(swingProblem(ext), null);
  assert.ok(swingProblem({ ...ext, swing: 0 }), 'an exterior door that swings out of the building passes');
});

test('no door leaf of the furnished barrio sweeps through a fixed piece (the quarter disc a leaf really sweeps, not the swing box)', () => {
  let leaves = 0, boxed = 0;
  const hits = [];
  for (const bp of real.buildings) {
    const pieces = floorPieces(bp), floorOf = new Map(bp.rooms.map((r) => [r.id, r.floor]));
    for (const d of bp.doors) if (d.kind !== 'arch' && d.kind !== 'shutter') {
      leaves += leavesOf(d).length;
      if (d.clear) for (const f of pieces) if (floorOf.get(f.room) === d.floor && inBox(d, f)) boxed++;
    }
    hits.push(...sweeps(bp).map((h) => `${bp.id}: ${h.door} sweeps ${h.piece} in ${h.room} (${h.area} m2)`));
  }
  assert.ok(leaves > 900, `leaves looked at: ${leaves}`);
  // (the swing boxes that hold a piece in their far corner are what R4 counted: the furnisher puts a basin or a stove there on purpose, outside the disc; there are some, so the check below can tell the two apart)
  assert.ok(boxed > 5, `pieces in a swing box: ${boxed}`);
  assert.deepEqual(hits, []);
});

test('TEETH: the detector finds a piece planted in a real leaf\'s quarter disc, misses one in the far corner of the swing box (R4\'s census counts it), and follows the swing to the other side', () => {
  // a plain single leaf of the barrio with a room on each side, on a floor with furniture
  const bp = real.buildings.find((b) => b.doors.some((d) => d.kind === 'interior' && !d.double && !d.ext && d.clear && d.rooms[0] && d.rooms[1]));
  const d = bp.doors.find((x) => x.kind === 'interior' && !x.double && !x.ext && x.clear && x.rooms[0] && x.rooms[1]);
  const leaf = leavesOf(d)[0], fr = frameOf(d, leaf);
  const into = bp.rooms.find((r) => r.id === d.rooms[d.swing]), away = bp.rooms.find((r) => r.id === d.rooms[1 - d.swing]);
  assert.ok(into && away, `${d.id}: a room on each side`);
  const piece = (at, room) => ({ name: 'planted_box', kind: 'floor', block: true, room: room.id, x: at[0], z: at[1], ry: 0, w: 0.2, d: 0.2, y: 0 });
  const w = d.w, inside = fr.at(0.5 * w, 0.5 * w), corner = fr.at(0.95 * w, 0.95 * w), behind = fr.at(0.5 * w, -0.5 * w);
  const run = (door, ...planted) => sweeps({ ...bp, doors: [door], furniture: planted }).map((h) => h.piece);
  assert.deepEqual(run(d), [], 'a lone door of a real plan, with no furniture, is clean');
  assert.deepEqual(run(d, piece(inside, into)), ['planted_box'], 'a piece in the quarter disc, in the room the leaf opens into');
  assert.deepEqual(run(d, piece(corner, into)), [], 'a piece in the far corner of the swing box is outside the disc');
  assert.ok(inBox(d, piece(corner, into)), 'R4\'s census counts that corner piece (the test would not tell the two readings apart otherwise)');
  assert.deepEqual(run(d, piece(behind, away)), [], 'a piece on the side the leaf does not open into');
  // the same leaf swung to the other side (swing 1 - swing): the disc moves with it
  const flipped = { ...d, swing: 1 - d.swing };
  assert.deepEqual(run(flipped, piece(behind, away)), ['planted_box'], 'the flipped leaf sweeps the other side');
  assert.deepEqual(run(flipped, piece(inside, into)), [], 'and no longer the side it came from');
  // a swing of -1 (the old rowhouse plan) is read here as the other side too, as `doors.js` hangs it: the plan check above is what stops it, the furnisher is the one that misread it
  assert.deepEqual(run({ ...d, swing: -1 }, piece(behind, away)), ['planted_box']);
  // a piece on another floor, one that sits on another piece, a ceiling fitting and a rug (not blocking) are none of a leaf's business
  assert.deepEqual(run(d, { ...piece(inside, into), room: bp.rooms.find((r) => r.floor !== d.floor)?.id ?? 'elsewhere' }), []);
  assert.deepEqual(run(d, { ...piece(inside, into), parent: 'some_table' }), []);
  assert.deepEqual(run(d, { ...piece(inside, into), kind: 'ceil' }), []);
  assert.deepEqual(run(d, { ...piece(inside, into), block: false }), []);
  // a double door: each leaf is half the opening, hinged at its own jamb
  const dbl = { ...d, double: true }, two = leavesOf(dbl);
  assert.equal(two.length, 2);
  assert.ok(Math.abs(two[0].r - w / 2) < 1e-9 && Math.abs(two[1].r - w / 2) < 1e-9);
  assert.deepEqual(run(dbl, piece(frameOf(dbl, two[1]).at(0.2 * w, 0.3 * w), into)), ['planted_box'], 'a piece in the second leaf\'s disc');
  assert.deepEqual(run(dbl, piece(frameOf(dbl, two[1]).at(0.2 * w, 0.9 * w), into)), [], 'and beyond its reach: a half-width leaf is 0.45 m, not 0.9 m');
});
