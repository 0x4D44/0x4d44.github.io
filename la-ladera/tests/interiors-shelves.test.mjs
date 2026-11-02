// INTERIORS wall shelves (round 6, R4-306): the 442 `shelf_wall` of the barrio were a bare board over two brackets. Every one carries one to three small things of the furniture library now: standing
// on its board (at the height the library model really has, 25 mm over the shelf's bottom, not the 0.2 m of its brackets), between its brackets (measured on the model, for the 0.9 m shelf and for the
// 0.5 m one of a bathroom), clear of each other and of what hangs over them, of a kind the room and the household suit, the same every time for a seed, and with no other piece moved.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-shelves.test.mjs
//   A3_LIST=40 shows more of a failing list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Layout } from '../js/interiors/layout.js';
import { CATALOG } from '../js/interiors/catalog.js';
import { glbParts } from '../js/interiors/build.js';
import { drawStandin } from '../js/interiors/standins.js';
import { MeshBuilder } from '../js/core/mesh.js';
import { makeRng } from '../js/core/rng.js';
import { furnishedBatch, obbOf, penetration } from './interiors-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = join(ROOT, 'assets', 'models');
const report = (problems, what, lim = +(process.env.A3_LIST || 12)) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));
const fmt = (v) => (Math.round(v * 1000) / 1000).toString();

const real = await furnishedBatch({ real: true });
const { ctx, bps } = real;

// ---------------------------------------------------------------- the shelf as the page draws it: the library model, measured
/** The board and the brackets of a wall shelf, measured on a cloud of points [x, y, z] in the model's own frame (origin the bottom, the middle of the back to the front): `top` the board's top, `halfW` and
 *  `halfD` the board's half sizes, `bay` the clear half-width between the brackets, `outer` their outer edge, `z0`..`z1` their depth. */
function frameOf(pts) {
  const xmax = Math.max(...pts.map((p) => Math.abs(p[0]))), end = pts.filter((p) => Math.abs(Math.abs(p[0]) - xmax) < 1e-4);
  const top = Math.max(...end.map((p) => p[1])), board = pts.filter((p) => p[1] <= top + 1e-4), br = pts.filter((p) => p[1] > top + 1e-4);
  return {
    top, halfW: xmax, halfD: Math.max(...board.map((p) => Math.abs(p[2]))), bay: Math.min(...br.map((p) => Math.abs(p[0]))), outer: Math.max(...br.map((p) => Math.abs(p[0]))),
    z0: Math.min(...br.map((p) => p[2])), z1: Math.max(...br.map((p) => p[2])), rise: Math.max(...br.map((p) => p[1])),
  };
}
const entry = ctx.assets.meta('shelf_wall');
{ const b = readFileSync(join(MODELS, entry.glb)); const g = await new Promise((ok, no) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, no)); g.scene.updateMatrixWorld(true); ctx.assets.loaded.set(entry.glb, g); }
const modelPts = glbParts(ctx, 'shelf_wall').flatMap((p) => { const a = p.geometry.attributes.position, out = []; for (let i = 0; i < a.count; i++) out.push([a.getX(i), a.getY(i), a.getZ(i)]); return out; });
const MODEL = frameOf(modelPts);

// ---------------------------------------------------------------- what the barrio's shelves carry
const KINDS_WET = new Set(['bottles_group', 'plant_tin', 'vase_flowers']);                                // a bathroom's shelf: bottles, a plant, flowers
const KEEPSAKES = new Set(['statue_virgin', 'trophy_football', 'doll', 'books_stack']);                   // not for a kitchen, a bathroom or a laundry
const SUIT = {
  statue_virgin: (room, hh) => room.type === 'chapel' || !!hh?.altar,
  trophy_football: (room, hh) => hh?.hobby === 'football',
  doll: (room, hh) => (hh?.kids ?? 0) >= 1,
};
const sxOf = (f) => (f.w && Math.abs(f.w - CATALOG.shelf_wall.size[0]) > 0.02 ? f.w / CATALOG.shelf_wall.size[0] : 1);        // how build.js stretches a hung model to the record
const syOf = (f) => (f.h && Math.abs(f.h - CATALOG.shelf_wall.size[1]) > 0.02 ? f.h / CATALOG.shelf_wall.size[1] : 1);
const toLocal = (f, x, z) => { const c = Math.cos(f.ry), s = Math.sin(f.ry), dx = x - f.x, dz = z - f.z; return [dx * c - dz * s, dx * s + dz * c]; };
/** A part of a shelf in the world: a box in the shelf's frame [lx0, lx1] x [lz0, lz1] as an OBB. */
const boxOf = (f, lx0, lx1, lz0, lz1) => {
  const c = Math.cos(f.ry), s = Math.sin(f.ry), mx = (lx0 + lx1) / 2, mz = (lz0 + lz1) / 2;
  return { cx: f.x + mx * c + mz * s, cz: f.z - mx * s + mz * c, hx: (lx1 - lx0) / 2, hz: (lz1 - lz0) / 2, ux: [c, -s], uz: [s, c] };
};

/** Every wall shelf of a world with what stands on it, and the room and household it is in. */
function shelvesOf(w) {
  const out = [];
  for (const bp of w.bps) {
    const kids = new Map();
    for (const f of bp.furniture) if (f.parent) (kids.get(f.parent) ?? kids.set(f.parent, []).get(f.parent)).push(f);
    for (const f of bp.furniture) {
      if (f.name !== 'shelf_wall') continue;
      const room = bp.rooms.find((r) => r.id === f.room), hh = bp.interior.hh.find((h) => h.id === bp.interior.rooms?.[f.room]?.hh) ?? null;
      out.push({ bp, f, kids: kids.get(f.id) ?? [], room, hh });
    }
  }
  return out;
}
/** The faults of a world's shelves, by kind: nothing is asserted here, the tests below read the lists. */
function judge(w) {
  const o = { n: 0, items: 0, bare: [], many: [], rest: [], board: [], bracket: [], clash: [], ceiling: [], hung: [], suit: [], kinds: {} };
  for (const { bp, f, kids, room, hh } of shelvesOf(w)) {
    const tag = `${bp.id} ${room.type} ${f.id} (${fmt(f.w)} m)`, sx = sxOf(f), sy = syOf(f);
    o.n++; o.items += kids.length;
    if (!kids.length) o.bare.push(tag);
    if (kids.length > 3) o.many.push(`${tag}: ${kids.length} things`);
    const brackets = [-1, 1].map((sg) => boxOf(f, sg > 0 ? MODEL.bay * sx : -MODEL.outer * sx, sg > 0 ? MODEL.outer * sx : -MODEL.bay * sx, MODEL.z0, MODEL.z1));
    const hung = bp.furniture.filter((g) => g.kind === 'wall' && g.room === f.room && g.id !== f.id);
    for (const k of kids) {
      o.kinds[k.name] = (o.kinds[k.name] ?? 0) + 1;
      const c = CATALOG[k.name];
      if (Math.abs(k.y - (f.y + MODEL.top * sy)) > 0.005) o.rest.push(`${tag}: ${k.name} at y ${fmt(k.y)}, the board's top is ${fmt(f.y + MODEL.top * sy)}`);
      const ob = obbOf(k), corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [k.x + ob.ux[0] * a * ob.hx + ob.uz[0] * b * ob.hz, k.z + ob.ux[1] * a * ob.hx + ob.uz[1] * b * ob.hz]);
      for (const [x, z] of corners) {
        const [lx, lz] = toLocal(f, x, z);
        if (Math.abs(lx) > MODEL.halfW * sx + 0.01 || Math.abs(lz) > MODEL.halfD + 0.01) { o.board.push(`${tag}: ${k.name} hangs over the board's edge (${fmt(lx)}, ${fmt(lz)})`); break; }
      }
      for (const [i, br] of brackets.entries()) { const p = penetration(ob, br); if (p > -0.01) o.bracket.push(`${tag}: ${k.name} is ${fmt(p * 100)} cm into (or less than 1 cm from) the ${i ? 'right' : 'left'} bracket`); }
      if ((k.y - (room.y ?? 0)) + c.size[1] > (room.h ?? 2.6) - 0.05 + 1e-6) o.ceiling.push(`${tag}: ${k.name} is ${fmt(k.y + c.size[1])} m high under a ceiling at ${fmt((room.y ?? 0) + (room.h ?? 2.6))}`);
      for (const g of hung) {
        const gh = g.h ?? CATALOG[g.name]?.size[1] ?? 0;
        if (k.y < g.y + gh - 0.003 && k.y + c.size[1] > g.y + 0.003 && penetration(ob, obbOf(g)) > 0.003) o.hung.push(`${tag}: ${k.name} stands in the hung ${g.name} (${g.id})`);
      }
      if (SUIT[k.name] && !SUIT[k.name](room, hh)) o.suit.push(`${tag}: ${k.name} in a home of ${hh ? `${hh.kind}, altar ${!!hh.altar}, hobby ${hh.hobby}, kids ${hh.kids}` : 'nobody'}`);
      if (['kitchen', 'bathroom', 'laundry'].includes(room.type) && KEEPSAKES.has(k.name)) o.suit.push(`${tag}: ${k.name} in a ${room.type}`);
      if (room.type === 'bathroom' && !KINDS_WET.has(k.name)) o.suit.push(`${tag}: ${k.name} in a bathroom`);
    }
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const p = penetration(obbOf(kids[i]), obbOf(kids[j])); if (p > -0.01) o.clash.push(`${tag}: ${kids[i].name} and ${kids[j].name} are ${fmt(p * 100)} cm into each other (or less than 1 cm apart)`); }
  }
  return o;
}
const here = judge(real);
let more;
const moreWorlds = () => more ??= (async () => { const out = []; for (const seed of [11, 23]) out.push(judge(await furnishedBatch({ real: true, seed }))); return out; })();

// ---------------------------------------------------------------- the model, the catalogue, the stand-in
test('the shelf model: its board is 25 mm tall, the brackets rise from it 25 mm square and stand 0.3025 m from the middle, and the catalogue says where a thing stands on it', () => {
  assert.ok(Math.abs(MODEL.top - 0.025) < 0.001, `the board's top is at ${fmt(MODEL.top)} m`);
  assert.ok(Math.abs(MODEL.bay - 0.3025) < 0.001 && Math.abs(MODEL.outer - 0.3275) < 0.001, `the brackets span ${fmt(MODEL.bay)}..${fmt(MODEL.outer)} m from the middle`);
  assert.ok(Math.abs(MODEL.rise - CATALOG.shelf_wall.size[1]) < 0.001, `the brackets rise to ${fmt(MODEL.rise)} m, the catalogue's height is ${CATALOG.shelf_wall.size[1]}`);
  // `size[1]` is the brackets' top (what the wall unit is hung and its headroom counted from); what stands on the shelf stands on the board: `size[1] + topAdd`
  const stands = CATALOG.shelf_wall.size[1] + (CATALOG.shelf_wall.topAdd ?? 0);
  assert.ok(Math.abs(stands - MODEL.top) < 0.001, `a thing on the shelf stands at ${fmt(stands)} m over its bottom (size ${CATALOG.shelf_wall.size[1]} + topAdd ${CATALOG.shelf_wall.topAdd}), the board's top is ${fmt(MODEL.top)}`);
  assert.ok(!Object.keys(CATALOG.shelf_wall).includes('topAdd'), 'topAdd is hidden from the furniture pipeline\'s view of the catalogue (its models and hash are unchanged)');
});

test('the stand-in of the wall shelf (what is drawn while the model loads, or when it fails) has the board and brackets of the model: what stands on the shelf stands on both', () => {
  const rec = (w) => ({ id: 'scratch', name: 'shelf_wall', room: 'r', kind: 'wall', x: 0, y: 0, z: 0, ry: 0, w, d: 0.22, h: 0.2, tint: null, flags: null, parent: null, decal: null, tags: CATALOG.shelf_wall.tags, block: false });
  const b = new MeshBuilder(), c = CATALOG.shelf_wall;
  drawStandin(b, rec(0.9), c);
  const pts = []; for (const [, acc] of b.accs) for (let i = 0; i < acc.pos.length; i += 3) pts.push([acc.pos[i], acc.pos[i + 1], acc.pos[i + 2]]);
  const S = frameOf(pts);
  for (const k of ['top', 'halfW', 'bay', 'outer', 'z0', 'z1', 'rise']) assert.ok(Math.abs(S[k] - MODEL[k]) < 0.002, `${k}: the stand-in ${fmt(S[k])} m, the model ${fmt(MODEL[k])} m`);
});

/** A 4 x 3 m kitchen with one interior door (in the +z wall, at x 2), nothing in it: the -x and -z walls are free. */
function smallRoom(seed = 1) {
  const r = { id: 'S.f0.r1', type: 'kitchen', floor: 0, rect: { x0: 0, z0: 0, x1: 4, z1: 3 }, y: 0, h: 2.6 };
  const bp = { id: 'S', rooms: [r], windows: [], stairs: [], entrances: [], colliders: { walls: [], floors: [] }, doors: [{ id: 'S.d1', kind: 'interior', w: 0.9, rooms: ['S.r0', r.id], swing: 1, hinge: 'left', x: 2.0, z: 3.05 }] };
  return new Layout({ bp, room: r, rng: makeRng(seed), hh: { tints: {} } });
}

test('hang(): a piece is not hung through the side of one on the next wall: a kitchen cabinet reaches 0.34 m out over its corner (13 of the barrio\'s 444 shelves passed through one)', () => {
  const pass = (a, b) => penetration(obbOf(a), obbOf(b));
  for (const order of ['cabinet first', 'shelf first']) {
    const L = smallRoom();
    let up, sh;
    if (order === 'cabinet first') { up = L.hang('kitchen_upper', '-z', { y: 1.45, at: 'start' }); sh = L.hang('shelf_wall', '-x', { y: 1.5, at: 'start' }); }
    else { sh = L.hang('shelf_wall', '-x', { y: 1.5, at: 'start' }); up = L.hang('kitchen_upper', '-z', { y: 1.45, at: 'start' }); }
    assert.ok(up && sh, `${order}: both are hung (somewhere along their walls)`);
    assert.ok(pass(sh, up) <= 0.005, `${order}: the shelf and the cabinet pass through each other by ${fmt(pass(sh, up) * 100)} cm (shelf ${fmt(sh.x)},${fmt(sh.z)} cabinet ${fmt(up.x)},${fmt(up.z)})`);
  }
});

test('top(): a piece is as wide as the record says (a hung shelf is cut to a wall: its `w`), and `px` puts it exactly there or nowhere', () => {
  const L = smallRoom();
  const shelf = L.hang('shelf_wall', '+z', { y: 1.4, w: 0.5 });
  assert.ok(shelf && shelf.w === 0.5, 'a 0.5 m shelf is hung');
  const slab = { size: [0.7, 0.1, 0.1], tags: 'scratch', cols: 'none', mat: 'wood_pine', top: true };
  assert.equal(L.top(shelf, 'scratch_slab', { def: slab }), null, 'a 0.7 m thing does not go on a 0.5 m shelf (the old surface was the catalogue\'s 0.9 m)');
  assert.equal(L.top(shelf, 'scratch_slab', { def: { ...slab, size: [0.5, 0.1, 0.1] } })?.name, 'scratch_slab', 'a 0.5 m thing fills it');
  shelf.tops.length = 0; L.items = L.items.filter((i) => i.name !== 'scratch_slab');
  const one = L.top(shelf, 'bottles_group', { px: 0.1 });
  assert.ok(one && one.px === 0.1, `px 0.1 asked, ${one?.px} got (the old code took the middle)`);
  const c = Math.cos(shelf.ry), s = Math.sin(shelf.ry);
  assert.ok(Math.abs(one.x - (shelf.x + 0.1 * c)) < 0.011 && Math.abs(one.z - (shelf.z - 0.1 * s)) < 0.011, `the thing is 0.1 m along the shelf: ${fmt(one.x)}, ${fmt(one.z)} for a shelf at ${fmt(shelf.x)}, ${fmt(shelf.z)} turned ${fmt(shelf.ry)}`);
  assert.equal(L.top(shelf, 'bottles_group', { px: 0.15 }), null, 'exactly there or nowhere: 0.15 m is inside the first');
  assert.equal(L.top(shelf, 'trophy_football', { px: -0.15 })?.px, -0.15, 'a second one clear of the first (0.3 m and 0.14 m wide, 0.02 m between) goes where it was asked');
});

// ---------------------------------------------------------------- the barrio
test('every wall shelf of the barrio carries one to three things (442 were a bare board)', () => {
  assert.ok(here.n >= 300, `${here.n} wall shelves: the barrio has some hundreds`);
  report(here.bare, `of ${here.n} wall shelves are bare`);
  report(here.many, 'shelves with more than three things');
  const kinds = Object.entries(here.kinds).sort((a, b) => b[1] - a[1]);
  assert.ok(kinds.length >= 6, `${kinds.length} kinds of thing on the shelves (${kinds.map(([k, n]) => k + ' ' + n)}): the shelves look alike`);
  console.log(`# shelves: ${here.n} wall shelves, ${here.items} things (${fmt(here.items / here.n)} a shelf); ${kinds.map(([k, n]) => k + ' ' + n).join(', ')}`);
});

test('what stands on a shelf stands on its board: at the model\'s height, the whole footprint over the board', () => {
  report(here.rest, 'things not on the board');
  report(here.board, 'things over the board\'s edge');
});

test('between the brackets: nothing touches a bracket (the model\'s own, for the 0.9 m shelf and the 0.5 m one), and things on one shelf are clear of each other', () => {
  assert.ok(shelvesOf(real).some((s) => s.f.w === 0.5 && s.kids.length) && shelvesOf(real).some((s) => s.f.w === 0.9 && s.kids.length), 'both widths of shelf are stocked');
  report(here.bracket, 'things in or within 1 cm of a bracket');
  report(here.clash, 'things in or within 1 cm of each other');
});

test('under the ceiling and clear of what hangs over the shelf: no picture, curtain or other shelf passes through a thing', () => {
  report(here.ceiling, 'things reaching the ceiling');
  report(here.hung, 'things standing in a hung piece');
});

test('what the shelf carries suits the room and the household: a statue where there is an altar, a trophy for a football home, a doll where children live, a bathroom\'s bottles and plants', () => {
  report(here.suit, 'things that do not suit their room');
  assert.ok((here.kinds.bottles_group ?? 0) > 20 && (here.kinds.photo_frames ?? 0) > 5, `bottles ${here.kinds.bottles_group}, photographs ${here.kinds.photo_frames}`);
});

test('two more barrios (seeds 11 and 23) pass the same bars', async () => {
  for (const [i, o] of (await moreWorlds()).entries()) {
    const seed = [11, 23][i];
    assert.ok(o.n >= 200, `seed ${seed}: ${o.n} shelves`);
    for (const k of ['bare', 'many', 'rest', 'board', 'bracket', 'clash', 'ceiling', 'hung', 'suit']) report(o[k], `seed ${seed}: ${k} faults (of ${o.n} shelves)`);
  }
});

// ---------------------------------------------------------------- determinism, and nothing else moves
const shelfTop = (bp) => { const names = new Map(bp.furniture.map((f) => [f.id, f.name])); return (f) => f.kind === 'top' && names.get(f.parent) === 'shelf_wall'; };
const sig = (list) => list.map((f) => [f.id, f.name, f.room, f.kind, f.x, f.y, f.z, f.ry, f.tint, f.parent, f.block].join(':')).join('|');
test('the same seed puts the same things on the same shelves; another seed puts others; with the pass off (`?shelves=0`) nothing else is different', async () => {
  const mine = (w) => w.bps.map((bp) => bp.id + '#' + sig(bp.furniture.filter(shelfTop(bp)))).join('\n'), rest = (w) => w.bps.map((bp) => bp.id + '#' + sig(bp.furniture.filter((f) => !shelfTop(bp)(f)))).join('\n');
  const a = await furnishedBatch({ n: 30 }), b = await furnishedBatch({ n: 30 }), c = await furnishedBatch({ n: 30, seed: 11 });
  assert.ok(a.bps.reduce((n, bp) => n + bp.furniture.filter(shelfTop(bp)).length, 0) >= 8, 'a few things on the shelves of 30 synthetic buildings');
  assert.equal(mine(a), mine(b), 'two runs of one seed differ');
  assert.notEqual(mine(a), mine(c), 'another seed gives the same shelves');
  globalThis.__noShelves = true;
  let off;
  try { off = await furnishedBatch({ n: 30 }); } finally { delete globalThis.__noShelves; }
  assert.ok(off.bps.every((bp) => bp.furniture.filter(shelfTop(bp)).length === 0 && bp.interior.shelves?.off === true), 'with the pass off a shelf still has something on it');
  assert.equal(rest(a), rest(off), 'the shelf pass moved, added or removed a piece other than what it put on a shelf (ids included)');
  // the shelves are dressed after the clothes: the clothes' ids must not number them (they are their shelf's id and t0, t1, t2), or the garments test's "no other piece moves" sees them move
  globalThis.__noGarments = true;
  let bare;
  try { bare = await furnishedBatch({ n: 30 }); } finally { delete globalThis.__noGarments; }
  assert.ok(bare.bps.every((bp) => bp.interior.garments?.off === true), 'the garments pass is still on');
  assert.equal(mine(a), mine(bare), 'the clothes pass renumbered what stands on the shelves');
  assert.ok(a.bps.every((bp) => bp.furniture.filter(shelfTop(bp)).every((f) => /^.+\.i[0-9a-z]+t[0-2]$/.test(f.id))), 'a thing on a shelf is named by its shelf: <shelf id>t<0..2>');
});
