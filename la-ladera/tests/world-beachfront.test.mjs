// The front of the beach as data (A5, js/world/beachfront.js, dev/FEATURE-BEACH.md phase 2a): where every fixture, prop and collider of the promenade and the sand stands. Pure: the coast
// plan in, plain records out; so this runs in Node with no renderer and no library loaded, and the page reads the same layout.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-beachfront.test.mjs
// Every check has a deliberately broken input selected by BF_SABOTAGE=<id>|all, and each must then FAIL:
//   pier     a kiosk stands on the pier's corridor            access   a bench stands at the foot of a stair             lane     a lamp stands in the promenade's walking lane
//   sea      a lounger is in the water                        random   a layout that is not a function of the seed       size     the kiosk's collider is a metre too small
//   few      half the loungers are gone                       overlap  a bench is stacked on another                     ground   a prop floats a metre above the sand
//   dup      two props share an id                            budget   nine hundred props                                poi      the court's anchors a metre off the court
//   tower    the lifeguard stands on the sand under the tower  inside   a vendor's post inside a kiosk
//   groyne   a groyne's rock stands on the beach itself        boat     a towel is laid on a boat's hull                  nonet    the nets are gone from between the boats
//   nosign   a safety sign is missing                          nopost   a safety sign hangs on no post                    signfar  the Bandera roja is a long way from the lifeguard tower
//   signturn the Zona de baño faces the sea, away from the stairs                nosolid  a safety sign's post is not solid
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { DECK_Z, STAIR_FLIGHT, XW, SEA, SAND_BOATS } from '../js/world/coast.js';
import { planFront, PIER } from '../js/world/beachfront.js';
import { SIZE } from '../js/world/beachlib.js';
import { shapeOf, overlaps, box } from './geom2d.mjs';

const SAB = process.env.BF_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029;

const ctx = createContext({ seed: SEED, headless: true });
const plan = generatePlan(ctx), coast = plan.coast;
let tick = 0;

/** The front the checks look at: the real one, or a broken copy when BF_SABOTAGE asks. */
function front(seed) {
  const f = planFront(coast, seed !== undefined ? { seed } : on('random') ? { seed: 1 + (tick++) } : {});         // (random: every call lays the sand out from another seed)
  if (seed !== undefined) return f;
  const it = (name, x, z, y = coast.heightAt(x, z)) => ({ id: 'x.' + name, group: name, name, key: 'beach_' + name, x, y, z, yaw: 0, lod: [10, 30] });
  const rect = (x, z, w, d) => ({ id: 'solid.x', kind: 'rect', x, z, w, d, ry: 0, h: 2 });
  if (on('pier')) { f.items.push(it('kiosk', PIER.x, 112)); f.solids.push(rect(PIER.x, 112, 3.2, 3.2)); }
  if (on('access')) { const a = coast.accesses[1], x = a.x + 0.2, z = STAIR_FLIGHT[1] + 0.3; f.items.push(it('bench', x, z)); f.solids.push(rect(x, z, 1.85, 0.66)); }
  if (on('lane')) f.lamps.push({ id: 'lamp.x', x: 30, y: 0.2, z: 104 }), f.solids.push({ id: 'solid.lamp.x', kind: 'post', x: 30, z: 104, r: 0.11, h: 4 });
  if (on('sea')) { const x = 40, z = coast.shoreZ(x) + 12; f.items.push(it('lounger_plastic_blue', x, z, SEA)); }
  if (on('size')) { const k = f.solids.find((s) => s.id.startsWith('solid.kiosk')); k.w -= 1; k.d -= 1; }
  if (on('few')) { const ls = f.items.filter((i) => i.group === 'lounger'); const drop = new Set(ls.slice(0, Math.ceil(ls.length / 2)).map((i) => i.id)); f.items = f.items.filter((i) => !drop.has(i.id)); }
  if (on('overlap')) { const b = f.solids.find((s) => s.id.startsWith('solid.bench')); f.solids.push({ ...b, id: 'solid.bench.dup', x: b.x + 0.3 }); }
  if (on('ground')) { const t = f.items.find((i) => i.group === 'towel'); t.y += 1; }
  if (on('groyne')) f.groynes[0].x = XW - 5;
  if (on('boat')) f.items.push(it('towel_01_flat', SAND_BOATS[2].x, SAND_BOATS[2].z));
  if (on('nonet')) f.items = f.items.filter((i) => i.group !== 'net');
  if (on('nosign')) f.items = f.items.filter((i) => i.name !== 'sign_prohibido_paso');
  if (on('nopost')) { const s = f.items.find((i) => i.name === 'sign_zona_bano'); f.posts = f.posts.filter((p) => Math.hypot(p.x - s.x, p.z - s.z) > 0.2); }
  if (on('nosolid')) { const s = f.items.find((i) => i.name === 'sign_zona_bano'); f.solids = f.solids.filter((q) => !(q.kind === 'post' && Math.hypot(q.x - s.x, q.z - s.z) < 0.1)); }
  if (on('signfar')) { const s = f.items.find((i) => i.name === 'sign_bandera_roja'), p = f.posts.find((q) => Math.hypot(q.x - s.x, q.z - s.z) < 0.1), k = f.solids.find((q) => q.kind === 'post' && Math.hypot(q.x - p.x, q.z - p.z) < 0.01); s.x += 40; p.x += 40; k.x += 40; }   // (the whole sign, post and collider, forty metres along the sand)
  if (on('signturn')) { const s = f.items.find((i) => i.name === 'sign_zona_bano'); s.yaw = 0; s.z += 0.09; }   // (turned round to face the sea, its 4.5 cm offset turned with it)
  if (on('dup')) f.items.push({ ...f.items[3] });
  if (on('budget')) for (let i = 0; i < 900; i++) f.items.push(it('seaweed', -90 + (i % 180), 135, SEA));
  return f;
}
const F = front();

const accessZones = () => coast.accesses.map((a) => box(a.x - a.w / 2 - 0.35, DECK_Z - 1, a.x + a.w / 2 + 0.35, (a.kind === 'ramp' ? coast.rampEnd : STAIR_FLIGHT[1]) + 0.5));
const pierZone = () => box(PIER.x - PIER.w / 2, PIER.z0, PIER.x + PIER.w / 2, PIER.z1);
const NOT_A_BLOCK = /^(riprap|seaweed|shell|driftwood)/;          // (the stones at the wall's foot, the wrack and the shells lie on the ground and stop nobody: no collider)

test('the layout is a function of the coast and the seed: the same twice, another with another seed', () => {
  const a = front(), b = front();
  assert.deepEqual(a.items, b.items); assert.deepEqual(a.solids, b.solids); assert.deepEqual(a.lamps, b.lamps);
  const c = front(SEED + 1);
  assert.notDeepEqual(c.items.map((i) => [i.x, i.z]), a.items.map((i) => [i.x, i.z]), 'a different seed lays the sand out differently');
});

test('the promenade is furnished as designed: kiosks at the vending posts, lamps, benches, huts, showers, palapas, a lifeguard tower, loungers on every sunbathing post', () => {
  const n = (g) => F.items.filter((i) => i.group === g).length;
  assert.equal(n('kiosk'), coast.pois.filter((p) => p.kind === 'vend' && p.z < 120).length, 'one kiosk at each vending post at the wall');
  assert.ok(n('lounger') >= coast.pois.filter((p) => p.kind === 'lie').length, 'a lounger on every sunbathing post');
  assert.ok(n('parasol') >= 16, 'umbrellas over the pairs');
  assert.ok(n('bench') >= 10 && n('shower') === 3 && n('lifeguard_tower') === 1 && n('court') === 1, 'benches, three showers, a tower, a court');
  assert.ok(n('bin') >= Math.floor(n('bench') / 2) - 1 && n('fountain') >= 1, `a litter bin by every second bench (${n('bin')} of ${n('bench')} benches), and a drinking fountain by a stair`);
  assert.ok(n('palm') >= 10, 'a line of palms');
  assert.equal(F.huts.length, 8, 'two banks of four changing huts'); assert.equal(F.palapas.length, 2, 'a palapa at each end');
  assert.ok(F.lamps.length >= 10, 'the deck is lit');
  assert.ok(n('towel') >= 12 && n('seaweed') >= 20 && n('shell') >= 20 && n('driftwood') >= 8, 'towels on the sand and the shore dressed');
  assert.ok(F.items.length <= 600 && F.solids.length <= 260, `a budget: ${F.items.length} props and ${F.solids.length} colliders`);
});

test('every record has a unique id and a library prop it can draw; the colliders match the library\'s sizes', () => {
  const ids = new Set();
  for (const it of F.items) {
    assert.ok(!ids.has(it.id), `duplicate id ${it.id}`); ids.add(it.id);
    assert.ok(SIZE[it.name], `${it.id}: ${it.name} is not in the library`);
    assert.equal(it.key, 'beach_' + it.name);
    assert.ok(Number.isFinite(it.x + it.y + it.z + it.yaw), `${it.id}: a finite pose`);
    assert.ok(it.lod[0] > 0 && it.lod[1] > it.lod[0], `${it.id}: a LOD range`);
  }
  const OF = { kiosk: 'kiosk', tower: 'lifeguard_tower', bikerack: 'bike_rack', bench: 'bench', shower: 'shower', cart: 'vendor_cart', cooler: 'cooler_stand', easel: 'sign_easel' };
  for (const s of F.solids.filter((q) => q.kind === 'rect')) {
    const g = s.id.replace(/^solid\./, '').replace(/\.\d+$/, ''), name = OF[g]; if (!name) continue;
    const [w, , d] = SIZE[name];
    assert.ok(Math.abs(s.w - w) <= 0.06 && Math.abs(s.d - d) <= 0.06, `${s.id}: collider ${s.w} x ${s.d}, library ${name} ${w} x ${d}`);
    assert.ok(F.items.some((i) => i.name === name && Math.hypot(i.x - s.x, i.z - s.z) < 0.01), `${s.id}: the ${name} it is the collider of`);
  }
});

test('everything stands on the ground: on land, above the water, and on the height the ground has there', () => {
  for (const it of F.items) {
    assert.ok(it.z >= 100 && Math.abs(it.x) <= XW, `${it.id} is inside the beach (${it.x}, ${it.z})`);
    if (it.group === 'sign') { assert.ok(it.y - coast.heightAt(it.x, it.z) > 1 && it.y - coast.heightAt(it.x, it.z) < 2, `${it.id}: a plaque on its post`); continue; }
    const h = coast.heightAt(it.x, it.z);
    assert.ok(Math.abs(it.y - h) < 0.011, `${it.id} (${it.name}) at y ${it.y}, the ground ${h.toFixed(3)}`);
    if (!/^(seaweed|shell)/.test(it.name)) assert.ok(h > SEA + 0.05, `${it.id} (${it.name}) is not in the water: ground ${h.toFixed(2)}`);
  }
});

test('the groynes: forty rocks in two lines outside the east and west walls, from the promenade out into the sea, sunk into the ground a quarter of their height, and not part of the beach\'s own list', () => {
  assert.equal(F.groynes.length, 40);
  assert.ok(F.items.every((i) => i.group !== 'groyne'), 'the groynes are not on the beach');
  for (const side of [-1, 1]) {
    const g = F.groynes.filter((r) => Math.sign(r.x) === side), zs = g.map((r) => r.z);
    assert.equal(g.length, 20, `twenty rocks on the ${side < 0 ? 'west' : 'east'} side`);
    assert.ok(Math.min(...zs) < 106 && Math.max(...zs) > 180, `the line runs from the promenade (z ${Math.min(...zs).toFixed(0)}) out into the sea (z ${Math.max(...zs).toFixed(0)})`);
    for (const r of g) {
      assert.ok(Math.abs(r.x) > XW + 0.5 && Math.abs(r.x) < XW + 6, `${r.id} stands ${(Math.abs(r.x) - XW).toFixed(1)} m outside the wall`);
      assert.ok(SIZE[r.name] && r.key === 'beach_' + r.name && /^groyne_rock_[123]$/.test(r.name), `${r.id}: a groyne rock of the library`);
      assert.ok(r.scale && r.scale.every((v) => v >= 1.2 && v <= 2 && v === r.scale[0]), `${r.id}: a boulder, 1.2 to 2 times the library's rock`);
      const h = coast.heightAt(r.x, r.z), sink = h - r.y;
      assert.ok(sink > 0.25 * 1.2 - 0.01 && sink < 0.25 * 2 + 0.01, `${r.id}: sunk ${sink.toFixed(2)} m into the ground`);
      assert.ok(r.lod[1] >= 250, `${r.id}: a groyne is seen from the whole beach`);
    }
  }
});

test('the five boats on the sand have their ground: nothing is laid on a hull, and a net dries in the gap between the first two and the third and fourth', () => {
  assert.equal(SAND_BOATS.length, 5);
  const hull = (b) => box(b.x - 0.95 - 0.3, b.z - 2.75 - 0.3, b.x + 0.95 + 0.3, b.z + 2.75 + 0.3);
  for (const it of F.items) {
    if (it.group === 'net') continue;
    for (const b of SAND_BOATS) assert.ok(!overlaps({ c: [it.x, it.z], r: 0.2 }, hull(b)), `${it.id} (${it.name}) lies on the boat at ${b.x}`);
  }
  for (const s of F.solids) for (const b of SAND_BOATS) assert.ok(!overlaps(shapeOf(s), hull(b)), `${s.id} stands on the boat at ${b.x}`);
  const nets = F.items.filter((i) => i.group === 'net');
  assert.equal(nets.length, 2, 'two nets');
  for (const [k, n] of nets.entries()) {
    const a = SAND_BOATS[2 * k], c = SAND_BOATS[2 * k + 1];
    assert.ok(n.x > a.x + 1.2 && n.x < c.x - 1.2 && Math.abs(n.z - (a.z + c.z) / 2) < 2.2 && n.name === 'fishing_net', `${n.id}: in the gap between the boats at ${a.x} and ${c.x}`);
  }
});

test('no collider overlaps another, and none stands in a stair, the ramp or the pier\'s corridor', () => {
  const shapes = [...F.solids.map((s) => [s, shapeOf(s)]), ...F.lamps.map((l) => [{ id: l.id }, { c: [l.x, l.z], r: 0.11 }])];       // (a lamp post's collider is poles.js globePost's: 0.11 m)
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    assert.ok(!overlaps(shapes[i][1], shapes[j][1]), `${shapes[i][0].id} overlaps ${shapes[j][0].id}`);
  }
  const zones = [...accessZones().map((z, k) => [z, 'the access at x ' + coast.accesses[k].x]), [pierZone(), 'the pier']];
  for (const [s, sh] of shapes) for (const [z, what] of zones) assert.ok(!overlaps(sh, z), `${s.id} stands in ${what}`);
  for (const it of F.items) {
    if (NOT_A_BLOCK.test(it.name)) continue;
    const sh = { c: [it.x, it.z], r: 0.3 };
    for (const [z, what] of zones) assert.ok(!overlaps(sh, z), `${it.id} (${it.name}) stands in ${what}`);
  }
});

test('the plan agrees with the points of interest the people will use: a lounger on each lie post, the court\'s four anchors, the lifeguard on the tower, a vendor post in front of each kiosk, and no post inside a collider', () => {
  let pois = coast.pois;
  if (on('poi')) pois = pois.map((p) => (p.kind === 'volley' ? { ...p, x: p.x + 1 } : p));                                         // (the court's anchors a metre off the court)
  if (on('tower')) pois = pois.map((p) => (p.kind === 'watch' ? { ...p, y: coast.heightAt(p.x, p.z) } : p));                     // (the lifeguard on the sand under the tower, not on it)
  if (on('inside')) { const k = F.items.find((i) => i.group === 'kiosk'), first = pois.find((p) => p.kind === 'vend'); pois = pois.map((p) => (p === first ? { ...p, x: k.x, z: k.z } : p)); }   // (a vendor's post inside a kiosk)
  const of = (kind) => pois.filter((p) => p.kind === kind), near = (a, b, m) => Math.hypot(a.x - b.x, a.z - b.z) <= m;
  for (const p of of('lie')) assert.ok(F.items.some((i) => i.group === 'lounger' && near(i, p, 0.01)), `${p.id}: a lounger at its post`);
  const court = F.items.find((i) => i.group === 'court'), tower = F.items.find((i) => i.group === 'lifeguard_tower');
  const ANCHORS = [[-4, -2], [-4, 2], [4, -2], [4, 2]];                                          // the library's `volley` anchors of the court (assets/models/manifest.beach_props.json), metres from its centre
  assert.equal(of('volley').length, 4);
  for (const [ax, az] of ANCHORS) {
    const p = of('volley').find((q) => near(q, { x: court.x + ax, z: court.z + az }, 0.06));
    assert.ok(p, `no volleyball post at the court's anchor (${ax}, ${az})`);
    assert.ok(Math.abs(Math.sin(p.ry) - Math.sign(-ax)) < 0.01, `${p.id} faces the net`);
  }
  const watch = of('watch')[0];
  assert.ok(near(watch, { x: tower.x, z: tower.z + 0.12 }, 0.2), 'the first lookout post is the tower\'s own anchor');
  assert.ok(Math.abs(watch.y - (coast.heightAt(tower.x, tower.z) + 1.73)) < 0.06, `and it is up on the platform (y ${watch.y})`);
  const kiosks = F.items.filter((i) => i.group === 'kiosk');
  for (const p of of('vend').filter((q) => q.z < 120)) {
    const k = kiosks.find((q) => Math.abs(q.x - p.x) < 0.01);
    assert.ok(k, `${p.id}: a kiosk behind its post`);
    assert.ok(p.z - k.z > 1.6 && p.z - k.z < 3, `${p.id} stands at the counter (${(p.z - k.z).toFixed(2)} m from the kiosk's middle)`);
    assert.ok(Math.abs(Math.cos(p.ry) + 1) < 0.01, `${p.id} faces the kiosk`);
  }
  for (const p of pois.filter((q) => q.z > 100 && q.kind !== 'raft')) {
    const mine = (s) => (p.kind === 'lie' && s.id.startsWith('solid.lounger')) || (p.kind === 'watch' && s.id.startsWith('solid.tower'));      // (a sunbather lies on a lounger, the lookout stands in the tower)
    for (const s of F.solids) if (!mine(s)) assert.ok(!overlaps({ c: [p.x, p.z], r: 0.25 }, shapeOf(s)), `${p.id} (${p.kind}) stands inside ${s.id}`);
  }
});

test('the promenade keeps a walking lane the whole length of the deck: nothing but the plaza\'s own furniture between z 101.6 and 106.0', () => {
  const lane = box(-XW, 101.6, XW, 106.0);
  for (const s of F.solids) assert.ok(!overlaps(shapeOf(s), lane), `${s.id} stands in the lane`);
  for (const l of F.lamps) assert.ok(l.z >= 106.0, `${l.id} at z ${l.z}`);
  for (const l of F.lamps) assert.ok(!accessZones().some((z) => overlaps({ c: [l.x, l.z], r: 0.11 }, z)), `${l.id} stands in a stair`);
  const xs = F.lamps.map((l) => l.x).sort((p, q) => p - q);
  for (let i = 1; i < xs.length; i++) { const gap = xs[i] - xs[i - 1]; if (gap < 30) continue; assert.ok(coast.accesses.some((a) => a.x > xs[i - 1] && a.x < xs[i]), `${gap.toFixed(1)} m of the deck without a lamp or a stair between`); }
});

test('the three safety signs: the Zona de baño on the dry sand above the bathing water, the Bandera roja by the lifeguard tower, the Prohibido el paso at an end of the beach; each a plaque on a post of its own, 1 to 2 m up, facing the way a walker comes, off the stairs and the pier', () => {
  const NAMES = ['sign_zona_bano', 'sign_bandera_roja', 'sign_prohibido_paso'];
  for (const name of NAMES) assert.equal(F.items.filter((i) => i.name === name).length, 1, `one ${name}`);
  const [zona, bandera, paso] = NAMES.map((name) => F.items.find((i) => i.name === name)), tower = F.items.find((i) => i.group === 'lifeguard_tower');
  for (const s of [zona, bandera, paso]) {
    assert.equal(s.group, 'sign', `${s.id}: a plaque`);
    const post = F.posts.find((p) => Math.hypot(p.x - s.x, p.z - s.z) < 0.1);
    assert.ok(post, `${s.name}: it hangs on a post`);
    assert.ok(F.solids.some((q) => q.kind === 'post' && Math.hypot(q.x - post.x, q.z - post.z) < 0.01), `${s.name}: and the post is solid`);
    assert.ok(Math.abs(s.x - post.x - Math.sin(s.yaw) * 0.045) < 0.002 && Math.abs(s.z - post.z - Math.cos(s.yaw) * 0.045) < 0.002, `${s.name}: the plaque stands 4.5 cm in front of its post, on the side it faces`);
    const g = coast.heightAt(post.x, post.z);
    assert.ok(s.y - g > 1 && s.y - g < 2 && post.h >= 1.8, `${s.name}: a plaque at head height on a post of ${post.h} m`);
    assert.ok(post.z < coast.shoreZ(post.x) - 3 && g > SEA + 0.25 && Math.abs(post.x) <= XW - 1.5, `${s.name}: on the dry sand, 3 m or more from the waterline and 0.25 m above the sea (ground ${g.toFixed(2)})`);
    assert.ok(!accessZones().some((z) => overlaps({ c: [post.x, post.z], r: 0.3 }, z)) && !overlaps({ c: [post.x, post.z], r: 0.3 }, pierZone()), `${s.name}: clear of the stairs, the ramp and the pier`);
  }
  assert.ok(coast.shoreZ(zona.x) - zona.z < 8 && zona.z > 130, `the Zona de baño is at the bathing water, ${(coast.shoreZ(zona.x) - zona.z).toFixed(1)} m from the waterline`);
  assert.ok(Math.hypot(bandera.x - tower.x, bandera.z - tower.z) < 8, 'the Bandera roja is by the tower and its flags');
  assert.ok(Math.abs(paso.x) > 90, 'the Prohibido el paso is at an end of the beach');
  assert.ok(Math.cos(zona.yaw) < -0.9 && Math.cos(bandera.yaw) < -0.9, 'the two on the sand face north, toward the stairs a bather comes down');
  assert.ok(Math.sin(paso.yaw) * Math.sign(paso.x) < -0.9, 'the one at the end faces in along the beach');
});
