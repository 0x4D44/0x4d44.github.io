// INTERIORS (A3, round 7): what hangs on a wall (R4-710, R2b-206).
//  - A shelf or a cabinet (0.15 m or more out of the wall) does not hang where the head of whoever sits on the seat below it reaches: the barber's shelf of L05 hung 1.0 m over the waiting bench, where a sitter's
//    head reaches 1.36 m (the shop's furnisher hung the shelf first and the bench went in under it). A picture, a clock, a mirror (3 to 5 cm deep) may still hang over a seat.
//  - A garment hung on a wall hangs on a hanger from a peg: the library's model is the cloth alone, so build.js's add-on draws the hanger across the garment's top edge and the peg out of the wall that its wire
//    goes over (R2b-206: the clothes on the walls were flat panels with no hook). The garment pass counts the triangles of the two (HANGER_TRIS) into the building's budget.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-hangs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Layout, mkObb, obbOverlap } from '../js/interiors/layout.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { shopRoom } from '../js/interiors/shops.js';
import { HANGER_TRIS, roomState, onWall } from '../js/interiors/garments.js';
import { GARMENTS } from '../js/interiors/garments_data.js';
import { drawAddon, ADDONS } from '../js/interiors/standins.js';
import { MeshBuilder } from '../js/core/mesh.js';
import { makeRng } from '../js/core/rng.js';
import { furnishedBatch } from './interiors-lib.mjs';

const w = await furnishedBatch({ real: true });
const SITTING = 0.9;                  // how far over the seat the head of a seated adult reaches (m): this test's own figure, not layout.js's
const KNEES = 0.3;                    // ... and how far the knees do (a wall piece that ends below this, over the seat, is no business of a sitter's)
const DEEP = 0.15;                    // a piece this deep or deeper is one a head can meet; a picture is not

/** Every deep wall piece (shelf, cabinet) of the barrio that hangs where the head of a sitter on a seat of its room, under it, reaches: it overlaps the seat's footprint and its span meets the height of the head. */
function headPairs(bps) {
  const pairs = []; let seats = 0, deep = 0;
  for (const bp of bps) {
    const rooms = new Map(bp.rooms.map((r) => [r.id, r]));
    const seatRecs = bp.furniture.filter((f) => f.kind === 'floor' && !f.parent && CATALOG[f.name]?.seat);
    const wallRecs = bp.furniture.filter((f) => f.kind === 'wall' && !f.decal && CATALOG[f.name]?.size[2] >= DEEP && f.wallSide);
    seats += seatRecs.length; deep += wallRecs.length;
    for (const wl of wallRecs) {
      const c = CATALOG[wl.name], y0 = wl.y - (rooms.get(wl.room)?.y ?? 0), slab = mkObb(wl.x, wl.z, wl.w ?? c.size[0], wl.d ?? c.size[2], wl.ry ?? 0);
      for (const s of seatRecs) {
        if (s.room !== wl.room) continue;
        const sc = CATALOG[s.name], seat = sc.seat[0];
        if (y0 >= seat + SITTING || y0 + (wl.h ?? c.size[1]) <= seat + KNEES) continue;                       // above the head, or below the lap
        if (obbOverlap(slab, mkObb(s.x, s.z, s.w ?? sc.size[0], s.d ?? sc.size[2], s.ry ?? 0), 0)) pairs.push(`${wl.room} ${wl.name} (${y0.toFixed(2)} to ${(y0 + (wl.h ?? c.size[1])).toFixed(2)} m) over ${s.name} (seat ${seat} m) at ${s.x.toFixed(2)},${s.z.toFixed(2)}`);
      }
    }
  }
  return { pairs, seats, deep };
}

test('no shelf or cabinet of the barrio hangs where the head of a sitter on the seat below it reaches (R4-710: the barber\'s shelf of L05 hung 1.0 m over the waiting bench)', () => {
  const { pairs, seats, deep } = headPairs(w.bps);
  console.log(`# ${deep} deep wall pieces and ${seats} seats in the barrio: ${pairs.length} pieces over a head`);
  assert.ok(seats >= 500 && deep >= 300, `${seats} seats and ${deep} deep wall pieces: the census has nothing to look at`);
  assert.equal(pairs.length, 0, `${pairs.length} deep wall pieces over a sitter's head:\n  ` + pairs.slice(0, 10).join('\n  '));
});

/** A 4 x 3 m room with one door in the +z wall: the -z wall is free, and a bench stands against its start. */
function benchRoom(seed = 1) {
  const r = { id: 'S.f0.r1', type: 'shop', floor: 0, rect: { x0: 0, z0: 0, x1: 4, z1: 3 }, y: 0, h: 2.6 };
  const bp = { id: 'S', rooms: [r], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'S.d1', kind: 'interior', w: 0.9, rooms: ['S.r0', r.id], swing: 1, hinge: 'left', x: 2.0, z: 3.05 }] };
  const L = new Layout({ bp, room: r, rng: makeRng(seed), hh: { tints: {} } });
  return { L, bench: L.wall('bench_wood', '-z', { at: 'start' }) };
}
const slab = (it) => mkObb(it.x, it.z, it.w ?? CATALOG[it.name].size[0], it.d ?? CATALOG[it.name].size[2], it.ry ?? 0);

test('hang(): a shelf (0.25 m deep) at 1.0 m is not hung over a bench whose sitter\'s head reaches 1.36 m, and goes beside it; the same shelf at 1.4 m, a clock and a mirror at 1.0 m still hang over the bench', () => {
  {
    const { L, bench } = benchRoom();
    assert.ok(bench, 'the bench stands against the wall');
    const shelf = L.hang('shelf_barber', '-z', { y: 1.0, at: 'start' });
    assert.ok(shelf, 'the shelf is hung, beside the bench');
    assert.ok(!obbOverlap(slab(shelf), slab(bench), 0), `the shelf (${shelf.x.toFixed(2)},${shelf.z.toFixed(2)}) hangs over the bench (${bench.x.toFixed(2)},${bench.z.toFixed(2)}) at 1.0 m`);
  }
  for (const [name, y, over] of [['shelf_barber', 1.4, true], ['clock_wall', 1.0, true], ['mirror_wall', 1.0, true], ['kitchen_upper', 1.2, false], ['kitchen_upper', 1.45, true]]) {
    const { L, bench } = benchRoom();
    const it = L.hang(name, '-z', { y, at: 'start' });
    assert.ok(it, `${name} at ${y} m is hung`);
    assert.equal(obbOverlap(slab(it), slab(bench), 0), over, `${name} at ${y} m ${over ? 'hangs over the bench (clear of a head, or no deeper than 5 cm)' : 'is hung beside it'}: it is at ${it.x.toFixed(2)},${it.z.toFixed(2)}, the bench at ${bench.x.toFixed(2)},${bench.z.toFixed(2)}`);
  }
});

test('hang(): the head of a sitter on a sofa, a chair or a stool reaches its own seat\'s height over it (0.9 m), not the bench\'s', () => {
  const room = () => { const r = { id: 'S.f0.r1', type: 'living', floor: 0, rect: { x0: 0, z0: 0, x1: 4, z1: 3 }, y: 0, h: 2.6 }; const bp = { id: 'S', rooms: [r], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [] }; return new Layout({ bp, room: r, rng: makeRng(1), hh: { tints: {} } }); };
  for (const [seat, y, over] of [['sofa_3_fabric', 1.2, false], ['sofa_3_fabric', 1.4, true], ['stool_bar', 1.5, false], ['stool_bar', 1.6, true]]) {
    const L = room(), s = L.wall(seat, '-z', { at: 'start' });
    assert.ok(s, `${seat} stands against the wall`);
    const it = L.hang('shelf_wall', '-z', { y, at: 'start' });
    assert.ok(it, `a shelf at ${y} m is hung`);
    assert.equal(obbOverlap(slab(it), slab(s), 0), over, `a shelf at ${y} m over a ${seat} (seat ${CATALOG[seat].seat[0]} m): ${over ? 'clear of the head' : 'beside it'}`);
  }
});

test('the narrow barber shops of the real plans (L05, 1.93 m wide, and L49) keep a bench and a shelf for any seed, and the shelf is never over the bench (R4-710)', () => {
  let runs = 0; const bad = [];
  for (const [bid, rid] of [['L05', 'L05.f0.r2'], ['L49', 'L49.f0.r2']]) {
    const bp = w.bps.find((b) => b.id === bid), room = bp.rooms.find((r) => r.id === rid);
    assert.equal(bp.interior?.rooms?.[rid]?.shopType, 'peluqueria', `${rid} is a barber's`);
    for (let seed = 1; seed <= 30; seed++) {
      runs++;
      const hh = { tints: {}, income: 0, kind: 'family', kids: 0, pets: [], tidy: 0.5, religious: 0, hobby: null }, L = new Layout({ bp, room, rng: makeRng(seed), hh });
      shopRoom(L, { bp, used: new Set(), forceShop: 'peluqueria' }, hh);
      const bench = L.items.find((i) => i.name === 'bench_wood'), shelf = L.items.find((i) => i.name === 'shelf_barber');
      if (!bench || !shelf) { bad.push(`${rid} seed ${seed}: ${bench ? '' : 'no bench '}${shelf ? '' : 'no shelf'}`); continue; }
      const seat = CATALOG.bench_wood.seat[0];
      if (shelf.y < seat + SITTING && shelf.y + shelf.h > seat + KNEES && obbOverlap(slab(shelf), slab(bench), 0)) bad.push(`${rid} seed ${seed}: the shelf (${shelf.x.toFixed(2)},${shelf.z.toFixed(2)}, ${shelf.y.toFixed(2)} m) is over the bench (${bench.x.toFixed(2)},${bench.z.toFixed(2)})`);
    }
  }
  assert.equal(bad.length, 0, `${bad.length} of ${runs} runs:\n  ` + bad.slice(0, 10).join('\n  '));
});

// ---------------------------------------------------------------- the hanger and the peg of a hung garment (R2b-206)
const HUNG = Object.getOwnPropertyNames(CATALOG).filter((k) => CATALOG[k].hang);                           // (the clothes are not enumerable in the catalogue)
const recOf = (name, o = {}) => { const c = CATALOG[name]; return { id: 'scratch', name, room: 'r', kind: c.wall ? 'wall' : c.ceil ? 'ceil' : 'floor', x: 0, y: c.wall ? c.y : 0, z: 0, ry: 0, w: c.size[0], d: c.size[2], h: c.size[1], tint: null, flags: null, parent: null, decal: null, tags: c.tags, block: false, ...o }; };
const boundsOf = (b) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const acc of b.accs.values()) for (let i = 0; i < acc.pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = acc.pos[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  return { lo, hi };
};

/** Draw a record's add-on and keep every box it asks the builder for as { x0, x1, y0, y1, z0, z1 } (the record stands at the origin, unturned: the boxes are in its own frame, y up from the world's floor). */
function boxesOf(rec, c) {
  const b = new MeshBuilder(), boxes = [], draw = b.box.bind(b);
  b.box = (mat, x, y, z, sx, sy, sz, ...rest) => { boxes.push({ x0: x - sx / 2, x1: x + sx / 2, y0: y - sy / 2, y1: y + sy / 2, z0: z - sz / 2, z1: z + sz / 2 }); return draw(mat, x, y, z, sx, sy, sz, ...rest); };
  return { n: drawAddon(b, rec, c), boxes, tris: b.tris };
}

test('a garment hung on a wall hangs on a hanger across its top edge from a peg out of the wall: three boxes, the wire joining the two, the peg 2 cm square from the wall\'s face 7 cm out (3 cm past the middle of a thick thing), and as many triangles as the pass counts (HANGER_TRIS)', () => {
  assert.ok(HUNG.length >= 60, `${HUNG.length} hung garments in the library`);
  const bad = [];
  for (const key of HUNG) {
    const c = CATALOG[key], [W, H, D] = c.size, rec = recOf(key), top = rec.y + H, { n, boxes, tris } = boxesOf(rec, c), e = 1e-6;
    if (n !== 3 || boxes.length !== 3) { bad.push(`${key}: ${n} primitives drawn (a bar, a wire and a peg)`); continue; }
    const [bar, wire, peg] = boxes, say = (what) => bad.push(`${key} (${W} x ${H} x ${D}): ${what}`);
    if (!(bar.y0 <= top - 0.005 && bar.y1 >= top + 0.005)) say(`the bar of the hanger is y ${bar.y0.toFixed(3)}..${bar.y1.toFixed(3)}, it does not straddle the garment's top edge ${top.toFixed(3)}`);
    if (!(bar.x1 - bar.x0 >= Math.min(W, 0.5) / 2 - e && bar.x1 - bar.x0 <= Math.min(W, 0.5) + e && Math.abs(bar.x0 + bar.x1) < e)) say(`the bar is ${(bar.x1 - bar.x0).toFixed(3)} m wide at x ${bar.x0.toFixed(3)}..${bar.x1.toFixed(3)} (a bar across the middle of the cloth, between half its width and all of it, 0.5 m at most)`);
    if (!(peg.x1 - peg.x0 > 0.0199 && peg.x1 - peg.x0 < 0.0201 && peg.y1 - peg.y0 > 0.0199 && peg.y1 - peg.y0 < 0.0201 && Math.abs(peg.x0 + peg.x1) < e)) say(`the peg is not 2 cm square on the middle of the cloth: x ${peg.x0.toFixed(3)}..${peg.x1.toFixed(3)}, y ${peg.y0.toFixed(3)}..${peg.y1.toFixed(3)}`);
    if (!(peg.y0 >= bar.y1 && peg.y0 - top <= 0.06)) say(`the peg is y ${peg.y0.toFixed(3)}..${peg.y1.toFixed(3)}: it is not a hand above the bar (${bar.y1.toFixed(3)}) and the top edge (${top.toFixed(3)})`);
    if (!(Math.abs(peg.z0 + D / 2) < 0.0011 && peg.z1 - peg.z0 >= 0.07 - e && peg.z1 >= 0.03 - e && peg.z1 <= 0.06 + 0.0011)) say(`the peg is z ${peg.z0.toFixed(3)}..${peg.z1.toFixed(3)}: from the wall's face ${(-D / 2).toFixed(3)}, 7 cm out and 3 cm past the middle of the cloth`);
    if (!(wire.y0 <= bar.y1 + 0.001 && wire.y1 >= peg.y0 + 0.005 && wire.x0 > peg.x0 && wire.x1 < peg.x1 && wire.z0 >= peg.z0 && wire.z1 <= peg.z1)) say(`the wire (y ${wire.y0.toFixed(3)}..${wire.y1.toFixed(3)}, z ${wire.z0.toFixed(3)}..${wire.z1.toFixed(3)}) does not join the bar (${bar.y1.toFixed(3)}) to the peg (${peg.y0.toFixed(3)}, z ${peg.z0.toFixed(3)}..${peg.z1.toFixed(3)})`);
    if (tris !== HANGER_TRIS) say(`${tris} triangles, the pass counts ${HANGER_TRIS} (a building's budget and what is drawn would part)`);
  }
  assert.equal(bad.length, 0, `${bad.length} of ${HUNG.length} hung garments:\n  ` + bad.slice(0, 8).join('\n  '));
});

test('only a garment that hangs gets a hanger and a peg: flat and folded clothes, the other pieces of a wall, the furniture, and a hung garment drawn as a floor piece get nothing; the butcher\'s rail keeps its cuts', () => {
  const GARMENT = Object.getOwnPropertyNames(CATALOG).filter((k) => CATALOG[k].garment && !CATALOG[k].hang);
  assert.ok(GARMENT.length >= 100, `${GARMENT.length} flat and folded garments`);
  const none = [];
  for (const key of [...GARMENT, 'clock_wall', 'mirror_wall', 'shelf_wall', 'kitchen_upper', 'picture_frame', 'bed_double', 'chair_wood', 'sofa_3_fabric', 'light_tube'].filter((k) => CATALOG[k])) {
    const c = CATALOG[key], b = new MeshBuilder(), n = drawAddon(b, recOf(key), c);
    if (n || b.tris) none.push(`${key}: ${n} primitives, ${b.tris} triangles`);
  }
  assert.equal(none.length, 0, 'drawn for pieces that hang from nothing:\n  ' + none.slice(0, 8).join('\n  '));
  { const key = HUNG[0], c = CATALOG[key], b = new MeshBuilder(); assert.equal(drawAddon(b, recOf(key, { kind: 'floor' }), c), 0, 'a hung garment lying on a floor has no wall to hang from'); }
  { const b = new MeshBuilder(), n = drawAddon(b, { ...recOf('meat_hooks'), id: 'hooks' }, CATALOG.meat_hooks); assert.ok(ADDONS.meat_hooks && n > 0 && b.tris > 100, `the butcher's rail keeps its cuts (${n} primitives, ${b.tris} triangles)`); }
});

test('the hangers of the barrio: every hung garment of the real plans has its hanger and peg clear of every piece of furniture and of every other piece on the wall', () => {
  let garments = 0, pegs = 0; const bad = [];
  for (const bp of w.bps) {
    const items = bp.furniture.filter((f) => !f.decal && !f.parent && CATALOG[f.name] && !CATALOG[f.name].hang);
    for (const g of bp.furniture.filter((f) => CATALOG[f.name]?.hang)) {
      garments++;
      const c = CATALOG[g.name], b = new MeshBuilder();
      if (!drawAddon(b, g, c)) { bad.push(`${g.room} ${g.name}: no hanger`); continue; }
      pegs++;
      const { lo, hi } = boundsOf(b), peg = mkObb((lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2, hi[0] - lo[0], hi[2] - lo[2], 0);               // (the box round all three, in the world's axes: a record turned by a quarter turn has its own box round it)
      for (const f of items) {
        if (f.room !== g.room) continue;
        const fc = CATALOG[f.name], y0 = f.y, y1 = f.y + (f.h ?? fc.size[1]);
        if (y1 <= lo[1] || y0 >= hi[1]) continue;
        if (obbOverlap(peg, mkObb(f.x, f.z, f.w ?? fc.size[0], f.d ?? fc.size[2], f.ry ?? 0), 0)) bad.push(`${g.room} ${g.name}: its hanger or peg meets ${f.name} (${y0.toFixed(2)} to ${y1.toFixed(2)} m, the hanger and peg ${lo[1].toFixed(2)} to ${hi[1].toFixed(2)})`);
      }
    }
  }
  console.log(`# hung garments: ${garments}, with a hanger and a peg ${pegs}`);
  assert.ok(garments >= 20, `${garments} hung garments in the barrio`);
  assert.equal(bad.length, 0, `${bad.length} faults:\n  ` + bad.slice(0, 8).join('\n  '));
});

test('a hung garment costs the triangles of its hanger and peg too: a room whose share of the building\'s budget covers the cloth alone is given none, one whose share covers both gets it and the pass counts both (a building near its triangle limit was taken over it by 22 triangles a garment)', () => {
  const id = Object.keys(GARMENTS).find((k) => GARMENTS[k].hung);
  assert.ok(id, 'the library has a garment that hangs');
  const cloth = GARMENTS[id].hung[3], mix = [[id, 1]];
  const short = roomState(benchRoom().L, makeRng(1), cloth + HANGER_TRIS - 1);
  assert.equal(onWall(short, null, mix), null, `${id}: the cloth (${cloth} triangles) fits the share and its hanger (${HANGER_TRIS}) does not: nothing is hung`);
  assert.equal(short.tris, 0, 'nothing is counted for what was not hung');
  const room = benchRoom().L, enough = roomState(room, makeRng(1), cloth + HANGER_TRIS), it = onWall(enough, null, mix);
  assert.ok(it && room.items.includes(it), `${id}: a share that covers the cloth and the hanger hangs it`);
  assert.equal(enough.tris, cloth + HANGER_TRIS, 'and the pass counts the cloth and the hanger');
});
