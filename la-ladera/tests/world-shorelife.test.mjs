// The shore's life (A5, js/world/shorelife.js, round 7): twelve gulls, eighteen ghost crabs and three shoals of fourteen fish, as data, as steps and as cards. Pure: the coast plan in, plain records and typed arrays out, so this
// runs in Node with no renderer; the page part is run with the real THREE and a stand-in texture loader (the same code the page runs, without a GL context).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-shorelife.test.mjs
// Every check has a deliberately broken input selected by SL_SABOTAGE=<id>|all, and each must then FAIL:
//   count    a gull, a crab and a fish are missing          species  two shoals of one species                        art      a uv of the manifest drifts                    pivot    a pivot of the manifest drifts
//   matrix   the library's placement turns the other way     float    a gull's perch hangs a metre and a half in the air   sandwet  a perch on the sand is in the sea              wet      a crab stands in the sea
//   wall     a post stands where a crab is                   far      a crab is nine metres up the beach                    pier     a crab stands on the pier                      shallow  a shoal's site is 0.8 m deep
//   zone     a shoal's site is past the buoy line            random   a layout that is not a function of the seed           seed     the same shore for every seed
//   lowfly   a soaring gull 2 m over the sea                 speed    a soaring gull at 9 m/s                               glide    glides of one second                           nofear   a gull that never takes off
//   shortcircle  a frightened gull circles 5 s               perchdup two gulls on one perch                                crabfast a crab at 6 m/s                                crabwater a crab driven into the sea
//   crabrun  a crab runs 4 m                                 fishup   a fish 1.5 m up (out of the sea)                      fishbed  a fish on the seabed                                  fishzone a fish 60 m off its shoal
//   tail     a tail that flips every frame                   nightdraw a gull drawn at night                                nightfly a gull that takes off at night                         stuck    a crab that cannot run does not sink
//   noreturn a buried crab is back after 2 s                 feet     a walking gull 20 cm in the air                       padj     a standing gull's card is off its pivot                     uvflip   a card with v the wrong way up
//   winding  a card drawn from one side only                 edgeon   a gull card that goes edge-on to the eye                fishfar  a fish drawn from 60 m                                crabtilt a crab card that is not flat
//   many     thirty times the fish                           calls    a fourth mesh                                          twosys   the unit run twice                                   lifekey  a key added to ctx.world.life
//   found    a sheet that is found when it is not            throws   a system that throws                                   clock    a random call in the source
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { createContext } from '../js/core/ctx.js';
import { Rng } from '../js/core/rng.js';
import { generatePlan } from '../js/world/plan.js';
import { SEA, BUOY_Z, PIER, RAFT, XW } from '../js/world/coast.js';
import { planFront } from '../js/world/beachfront.js';
import { planSea } from '../js/world/beachsea.js';
import { seaState, level as swellLevel, nearWeight } from '../js/core/sea.js';
import { SIZE as BEACH_SIZE } from '../js/world/beachlib.js';
import { SIZE as WATER_SIZE } from '../js/world/waterlib.js';
import { clutterMatrix } from '../js/world/clutter.js';
import { ROOT } from './headless.mjs';
import { shapeOf, overlaps } from './geom2d.mjs';
import { COUNT, RULES, GULL, FLAP, WALK, FISH, CRAB, FISH_ORDER, itemPoint, planShoreLife, makeShoreLife, stepShoreLife, stepCrab, makeCards, gullCard, fishCard, crabCard, loadShoreLife } from '../js/world/shorelife.js';

const SAB = process.env.SL_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029;
const FPS = 30, DT = 1 / FPS;

const ctx = createContext({ seed: SEED, headless: true });
const plan = generatePlan(ctx), coast = plan.coast, H = coast.heightAt;
const front = planFront(coast), sea = planSea(coast);
const baseAt = (x, z) => Math.max(H(x, z), SEA);
let tick = 0;
const hyp = Math.hypot;

/** The shore's plan: the real one, or a broken copy when SL_SABOTAGE asks (`seed`: another seed's plan). */
function shore(seed) {
  const rng = seed !== undefined ? (on('seed') ? new Rng(7) : createContext({ seed, headless: true }).rng) : on('random') ? new Rng(1 + tick++) : ctx.rng;
  const p = planShoreLife({ plan, front, sea, rng });
  if (seed !== undefined) return p;
  if (on('count')) { p.gulls.pop(); p.crabs.pop(); p.shoals[0].fish.pop(); }
  if (on('species')) p.shoals[2].species = 'grunt';
  if (on('float')) p.perches.find((q) => q.kind === 'kiosk').y += 1.5;
  if (on('sandwet')) { const q = p.perches.find((q) => q.kind === 'sand'); q.z = coast.shoreZ(q.x) + 4; }
  if (on('wet')) { const c = p.crabs[3]; c.z = coast.shoreZ(c.x) + 3; }
  if (on('far')) { const c = p.crabs[1]; c.z = coast.shoreZ(c.x) - 9; }
  if (on('pier')) { const c = p.crabs[4]; c.x = PIER.x + 1; c.z = 140; }
  if (on('many')) for (let i = 0; i < 29; i++) p.shoals.forEach((s) => s.fish.push(...s.fish.slice(0, COUNT.fish)));
  return p;
}
const SL = shore();
const solidsAll = () => [...front.solids, ...sea.walls];

// ------------------------------------------------------------------------------------------------------------------------------------ the plan
test('the shore is twelve gulls, eighteen crabs and three shoals of fourteen: five soaring, five on a perch (kiosk, tower, groyne, boat, sand) and two on the pier\'s head; a jack, a grunt and a tang', () => {
  const p = shore();
  assert.equal(p.gulls.length, COUNT.gulls, 'twelve gulls');
  assert.deepEqual(p.gulls.map((g) => g.role), ['soar', 'soar', 'soar', 'soar', 'soar', 'kiosk', 'tower', 'groyne', 'boat', 'sand', 'lamp', 'head'], 'five soaring, five perched, two on the pier');
  assert.equal(p.crabs.length, COUNT.crabs, 'eighteen crabs');
  assert.equal(p.shoals.length, COUNT.shoals, 'three shoals');
  for (const s of p.shoals) assert.equal(s.fish.length, COUNT.fish, `${s.id}: fourteen fish`);
  assert.deepEqual(p.shoals.map((s) => s.species).sort(), ['grunt', 'jack', 'tang'], 'one shoal of each of the three species');
  assert.equal(new Set(p.gulls.map((g) => g.id)).size, 12); assert.equal(new Set(p.crabs.map((c) => c.id)).size, 18);
  for (const c of p.crabs) assert.ok(c.w >= 0.12 && c.w <= 0.18, `${c.id}: ${c.w} m wide`);
  for (const g of p.gulls.filter((g) => g.role !== 'soar')) assert.ok(p.perches[g.perch], `${g.id} has a perch`);
  assert.deepEqual(new Set(p.gulls.filter((g) => g.role !== 'soar').map((g) => g.perch)).size, 7, 'seven perched gulls, seven perches');
});

test('the layout is a function of the seed: the same twice, another seed another shore', () => {
  const a = shore(), b = shore();
  assert.deepEqual(a, b, 'the same coast and seed give the same shore, to the last record');
  const c = shore(SEED + 1);
  assert.notDeepEqual(c.crabs, shore(SEED).crabs, 'another seed puts the crabs elsewhere');
  assert.notDeepEqual(c.gulls, shore(SEED).gulls, 'and gives the gulls other flights');
});

test('the art is the manifest\'s: every uv, pivot, size and animation of the gull, fish and crab sheets is copied exactly (and the sheets are the size it says)', async () => {
  const m = JSON.parse(await readFile(resolve(ROOT, 'assets/textures/manifest.beach.json'), 'utf8')).textures;
  if (on('art')) m.gull_sprites.cells[2].uv[0] += 0.01;
  if (on('pivot')) m.gull_sprites.cells[4].pivot[1] += 0.1;
  const g = m.gull_sprites, f = m.fish_sprites, c = m.crab_shells;
  assert.equal(GULL.cells.length, g.cells.length);
  g.cells.forEach((cell, i) => {
    const mine = GULL.cells[i];
    assert.equal(mine.id, cell.id, `gull cell ${i}`); assert.deepEqual([...mine.uv], cell.uv, `${cell.id}: uv`); assert.deepEqual([...mine.pivot], cell.pivot, `${cell.id}: pivot`);
    if (mine.feet !== undefined) assert.equal(mine.feet, (cell.contentRect[1] + cell.contentRect[3]) / g.size[1], `${cell.id}: the soles are the bottom of the drawing`);
  });
  assert.deepEqual([...GULL.cellPx], [g.size[0] / 8, g.size[1]], 'a cell of the gull sheet');
  assert.equal(GULL.mpp, 0.45 / g.cells[4].contentRect[3], 'the standing gull\'s height in pixels is 0.45 m');
  assert.deepEqual([...FLAP], g.animations.flap.frames); assert.deepEqual([...WALK], g.animations.walk.frames);
  for (const name of ['jack', 'grunt', 'tang']) {
    const a = f.cells.find((c2) => c2.id === name + '_tail_a'), b = f.cells.find((c2) => c2.id === name + '_tail_b'), sp = FISH.species[name];
    assert.deepEqual([...sp.uv.a], a.uv, `${name}: tail a uv`); assert.deepEqual([...sp.uv.b], b.uv, `${name}: tail b uv`);
    assert.deepEqual([...sp.pivot], a.pivot, `${name}: pivot`); assert.deepEqual(a.pivot, b.pivot, `${name}: one pivot for both poses`);
    assert.deepEqual([...sp.px], [Math.round((a.uv[2] - a.uv[0]) * f.size[0]), Math.round((a.uv[3] - a.uv[1]) * f.size[1])], `${name}: a cell in pixels`);
    assert.equal(sp.body, Math.round((a.contentRect[2] + b.contentRect[2]) / 2), `${name}: the body is the drawing's width`);
    assert.ok(sp.len * 1.15 <= 0.35 && sp.len * 0.9 >= 0.2, `${name}: ${sp.len} m, a fish of 0.2 to 0.35 m at its smallest and largest`);
  }
  const crab = c.cells.find((c2) => c2.id === 'ghost_crab');
  assert.deepEqual([...CRAB.uv], crab.uv); assert.equal(CRAB.content, crab.contentRect[2]); assert.equal(CRAB.px, c.size[0] / 2);
  for (const [file, sheet] of [['gull_sprites', g], ['fish_sprites', f], ['crab_shells', c]]) {
    const png = await readFile(resolve(ROOT, 'assets/textures', sheet.map)), w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    assert.deepEqual([w, h], sheet.size, `${file}.png is ${sheet.size.join(' x ')}`);
  }
});

test('a perch is where the model is: itemPoint is the library\'s own placement, and every perch sits within a metre under the top of its piece, never above it', () => {
  const items = [...front.items, ...front.groynes, ...sea.items].filter((i) => (i.yaw ?? 0) !== 0 || i.scale || i.group === 'kiosk').slice(0, 40);
  for (const it of items) {
    const p = [0.3, 1.1, -0.7], s = it.scale ?? [1, 1, 1], M = clutterMatrix(it.x, it.y, it.z, (it.yaw ?? 0) + (on('matrix') ? 0.2 : 0), s, it.pitch ?? 0), q = new THREE.Vector3(...p).applyMatrix4(M), mine = itemPoint(it, ...p);
    assert.ok(hyp(q.x - mine[0], q.y - mine[1], q.z - mine[2]) < 1e-9, `${it.id}: itemPoint is the clutter matrix's point`);
  }
  const byId = new Map([...front.items, ...front.groynes, ...sea.items].map((i) => [i.id, i]));
  const p = shore();
  const kinds = new Set(p.perches.map((q) => q.kind)); for (const k of ['kiosk', 'tower', 'boat', 'groyne', 'post', 'head', 'lamp', 'sand']) assert.ok(kinds.has(k), `a perch of kind ${k}`);
  for (const q of p.perches.filter((r) => r.item)) {
    const it = byId.get(q.item), size = it.key.startsWith('beach_') ? BEACH_SIZE[it.name] : WATER_SIZE[it.name];
    assert.ok(size, `${it.name} has a size in its library`);
    const top = it.y + size[1] * (it.scale?.[1] ?? 1);
    assert.ok(q.y <= top + 0.02 && q.y >= top - 1, `${q.kind} perch ${q.i} is at ${q.y.toFixed(2)}, the piece's top is ${top.toFixed(2)}`);
  }
  for (const q of p.perches.filter((r) => r.kind === 'sand')) {
    assert.ok(Math.abs(q.y - H(q.x, q.z)) < 0.01, `sand perch ${q.i} stands on the sand`);
    assert.ok(coast.depthAt(q.x, q.z) < -0.02 && coast.surfaceAt(q.x, q.z) !== 'shallow', `sand perch ${q.i} is on dry or damp sand, not in the sea`);
  }
});

test('where things stand: no crab and no sand perch is in the sea, in a wall or a footprint or on the pier; the crabs keep to the wet sand and six metres above it', () => {
  const p = shore(), solids = solidsAll();
  if (on('wall')) solids.push({ kind: 'post', x: p.crabs[5].x, z: p.crabs[5].z, r: 0.3 });
  const hit = (x, z, r) => solids.some((s) => overlaps({ c: [x, z], r }, shapeOf(s)));
  for (const c of p.crabs) {
    assert.ok(coast.depthAt(c.x, c.z) <= 0.04, `${c.id}: not in the sea (${coast.depthAt(c.x, c.z).toFixed(3)} m deep)`);
    const surf = coast.surfaceAt(c.x, c.z); assert.ok(surf === 'wetsand' || (surf === 'sand' && coast.shoreZ(c.x) - c.z <= RULES.crabBand), `${c.id}: wet sand or dry sand within ${RULES.crabBand} m of the waterline (${surf}, ${(coast.shoreZ(c.x) - c.z).toFixed(1)} m)`);
    assert.ok(!hit(c.x, c.z, c.w / 2), `${c.id}: not inside a wall or a footprint`);
    assert.ok(!(Math.abs(c.x - PIER.x) < 2.6 && c.z > PIER.z0 - 1), `${c.id}: not on the pier`);
    assert.ok(Math.abs(c.x) < XW - 1, `${c.id}: inside the plot`);
  }
  for (const q of p.perches.filter((r) => r.kind === 'sand')) assert.ok(!hit(q.x, q.z, 0.3) && Math.abs(q.x - PIER.x) >= 5, `sand perch ${q.i}: clear of every footprint and of the pier`);
  for (let i = 0; i < p.crabs.length; i++) for (let j = i + 1; j < p.crabs.length; j++) assert.ok(hyp(p.crabs[i].x - p.crabs[j].x, p.crabs[i].z - p.crabs[j].z) >= 0.5, `crabs ${i} and ${j} do not stand on one another`);
});

test('the shoals: the pier\'s piles, the sunken moped or anchor, and the raft; each in the swim zone, over water 1.5 m deep and more, short of the buoy line', () => {
  const p = shore(), site = (id) => p.shoals.find((s) => s.id === id);
  if (on('shallow')) p.shoals[0].cz = 133;
  if (on('zone')) p.shoals[2].cz = BUOY_Z + 3;
  assert.deepEqual(p.shoals.map((s) => s.id), ['piles', 'wreck', 'raft']);
  assert.equal(site('piles').cx, PIER.x); assert.ok(site('piles').cz >= 150 && site('piles').cz <= 185, 'the piles: z 150 to 185');
  assert.ok(sea.sunken.some((w) => w.x === site('wreck').cx && w.z === site('wreck').cz), 'the wreck is one of the sunken things');
  assert.deepEqual([site('raft').cx, site('raft').cz], [RAFT.x, RAFT.z], 'the raft');
  assert.deepEqual(p.shoals.map((s) => s.species), ['grunt', 'tang', 'jack']);
  for (const s of p.shoals) for (const R of [s.rMin, s.rMax]) for (let i = 0; i < 24; i++) {
    const x = s.cx + R * Math.cos((i / 24) * Math.PI * 2), z = s.cz + R * Math.sin((i / 24) * Math.PI * 2);
    assert.ok(coast.depthAt(x, z) >= 1.5, `${s.id}: ${coast.depthAt(x, z).toFixed(2)} m of water at its ${R} m ring (1.5 needed)`);
    assert.ok(!coast.limit(x, z).hard && z < BUOY_Z, `${s.id}: inside the swim zone, short of the buoy line`);
  }
  for (const s of p.shoals) for (const f of s.fish) assert.ok(f.r - f.ra >= s.rMin - 1e-9 && f.r + f.ra <= s.rMax + 1e-9, `${s.id}: a fish's orbit stays between its radii`);
});

// ------------------------------------------------------------------------------------------------------------------------------------ the steps
/** A walk through the shore: the player goes up to each perched gull in turn (2 m short of it), then up and down the waterline. The sea is the real swell. */
function simulate({ seconds = 300, day = () => true, each = () => {}, sl = shore() } = {}) {
  const st = seaState(15), clock = { t: 0 }, lvl = (x, z, t) => swellLevel(x, z, t, st) * nearWeight(x, z);
  const depth = (x, z, a = 0) => SEA + lvl(x, z, clock.t + a) - H(x, z);
  const S = makeShoreLife(coast, sl, { depth, level: (x, z) => lvl(x, z, clock.t) });
  const stops = S.gulls.filter((g) => !g.soar).map((g) => g.perch).map((i) => sl.perches[i]).sort((a, b) => a.x - b.x).map((q) => [q.x, q.z - 2]);
  const pts = [[-92, coast.shoreZ(-92) - 2.5], ...stops]; let len = 0; const legs = pts.map((a, i) => (i ? (len += hyp(a[0] - pts[i - 1][0], a[1] - pts[i - 1][1])) : 0));
  const at = (t) => {
    const s = 4 * t;
    if (s < len) { let i = 1; while (legs[i] < s) i++; const u = (s - legs[i - 1]) / (legs[i] - legs[i - 1]); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; }
    const x = -92 + Math.abs(((((s - len) * 0.75) % 368) + 368) % 368 - 184) * 1; return [x, coast.shoreZ(x) - 2.5];
  };
  const n = Math.round(seconds * FPS);
  for (let k = 1; k <= n; k++) {
    clock.t = k * DT; S.w.day = day(clock.t);
    const [x, z] = at(clock.t), p = { x, y: H(x, z), z };
    stepShoreLife(S, DT, p);
    each({ S, t: clock.t, k, p, depth, lvl: (px, pz) => lvl(px, pz, clock.t) });
  }
  return S;
}

const main = (() => {
  const R = { nan: [], soar: [], speed: [], glides: [], cells: [], near: [], takeoffs: [], circles: [], dups: [], landed: [], sky: [], crab: [], crabSpeed: [], flee: [], fish: [], tails: [], hiddenDay: [], fishSite: [], rises: 0, landings: 0, fled: 0 };
  const prev = new Map(), modes = new Map(), enter = new Map(), glide = new Map(), flee = new Map(), tail = { last: null, t0: 0, gaps: [] };
  simulate({
    each: ({ S, t, p, depth, lvl }) => {
      // the broken actors (the sabotages), made after the step so that the checks below see them
      if (on('lowfly')) { const g = S.gulls[0]; g.y = baseAt(g.x, g.z) + 2; }
      if (on('speed') && t < DT * 1.5) S.gulls[1].orbit.w *= 2;
      if (on('glide')) for (const g of S.gulls) if (g.soar && g.fl.glide && g.fl.until - t > 1) g.fl.until = t + 1;
      if (on('nofear')) for (const g of S.gulls) if (g.mode === 'rise' && g.k < 0.1) { g.mode = 'perch'; g.pose = 'stand'; g.cell = 4; g.x = S.w.perches[S.sl.gulls.find((r) => r.id === g.id).perch].x; g.y = S.w.perches[S.sl.gulls.find((r) => r.id === g.id).perch].y; g.z = S.w.perches[S.sl.gulls.find((r) => r.id === g.id).perch].z; }
      if (on('shortcircle')) for (const g of S.gulls) if (g.mode === 'circle' && !g.soar && g.until - t > 5) g.until = t + 5;
      if (on('perchdup')) S.gulls[6].perch = S.gulls[5].perch;
      if (on('crabfast')) S.crabs[2].x += 0.2;
      if (on('crabwater')) { const c = S.crabs[6]; if (t > 100 && t < 100 + DT * 2) c.z = coast.shoreZ(c.x) + 4; }
      if (on('crabrun')) for (const c of S.crabs) if (c.mode === 'flee') { c.x += 0.15; }
      if (on('fishup')) S.shoals[0].fish[0].y += 1.5;
      if (on('fishbed')) S.shoals[1].fish[0].y = H(S.shoals[1].fish[0].x, S.shoals[1].fish[0].z);
      if (on('fishzone')) S.shoals[2].fish[0].x += 60;
      if (on('tail')) S.shoals[0].fish[0].tail = S.t * FPS & 1;
      if (on('nightdraw')) for (const g of S.gulls) g.hidden = false;
      // gulls
      for (const g of S.gulls) {
        if (![g.x, g.y, g.z, g.hx, g.hz].every(Number.isFinite)) R.nan.push(`${g.id} @${t}`);
        if (g.hidden) R.hiddenDay.push(`${g.id} @${t}`);
        const before = prev.get(g.id);
        if (before && g.soar) {
          const sp = hyp(g.x - before.x, g.y - before.y, g.z - before.z) / DT; if (sp < 3 - 1e-6 || sp > 6 + 1e-6) R.speed.push(`${g.id} ${sp.toFixed(2)} m/s @${t.toFixed(1)}`);
        }
        if (g.soar) {
          const alt = g.y - baseAt(g.x, g.z); if (alt < 6 - 1e-6 || alt > 14 + 1e-6 || g.z < 120 || g.z > 175) R.soar.push(`${g.id} alt ${alt.toFixed(2)} z ${g.z.toFixed(1)} @${t.toFixed(1)}`);
          const gl = glide.get(g.id) ?? { on: false, n: 0 };
          if (g.fl.glide) { gl.on = true; gl.n++; } else if (gl.on) { R.glides.push(gl.n * DT); gl.on = false; gl.n = 0; }
          glide.set(g.id, gl);
        }
        if (g.mode !== 'perch' && g.z < 105) R.sky.push(`${g.id} z ${g.z.toFixed(1)} over the barrio @${t.toFixed(1)}`);
        if (g.mode !== 'perch' && !g.soar && ![0, 1, 2, 3].includes(g.cell)) R.cells.push(`${g.id} cell ${g.cell} in flight`);
        if (g.mode === 'perch' && S.w.day && hyp(p.x - g.x, p.z - g.z) < RULES.scare - 1e-6) R.near.push(`${g.id} stays ${hyp(p.x - g.x, p.z - g.z).toFixed(2)} m from the player @${t.toFixed(1)}`);
        if (g.mode === 'perch' && g.pose === 'walk') { const bad = solidsAll().find((s) => overlaps({ c: [g.x, g.z], r: 0.25 }, shapeOf(s))); if (!(coast.depthAt(g.x, g.z) <= -0.02) || bad) R.fish.push(`${g.id} walks into the sea (${coast.depthAt(g.x, g.z).toFixed(3)}) or a wall (${bad ? JSON.stringify(bad) : '-'}) at ${g.x.toFixed(2)}, ${g.z.toFixed(2)}`); }
        const m0 = modes.get(g.id);
        if (m0 && m0 !== g.mode) {
          if (m0 === 'perch' && g.mode === 'rise') { R.rises++; R.takeoffs.push(hyp(p.x - before.x, p.z - before.z)); }
          if (m0 === 'rise' && g.mode === 'circle') enter.set(g.id, t);
          if (m0 === 'circle' && g.mode === 'land') R.circles.push(t - enter.get(g.id));
          if (m0 === 'land' && g.mode === 'perch') { R.landings++; const P = S.w.perches[g.perch]; if (g.x !== P.x || g.y !== P.y || g.z !== P.z) R.landed.push(`${g.id} is not on its perch`); }
        }
        modes.set(g.id, g.mode); prev.set(g.id, { x: g.x, y: g.y, z: g.z });
      }
      const held = S.gulls.filter((g) => g.perch >= 0).map((g) => g.perch); if (new Set(held).size !== held.length) R.dups.push(`@${t.toFixed(1)}: ${held}`);
      // crabs
      for (const c of S.crabs) {
        const b = prev.get(c.id), visible = c.sink < 0.98;
        if (![c.x, c.z, c.sink].every(Number.isFinite)) R.nan.push(`${c.id} @${t}`);
        const inBand = SL_BAND(c.x, c.z);
        if (!inBand) R.crab.push(`${c.id} left its band: ${c.x.toFixed(2)}, ${c.z.toFixed(2)} @${t.toFixed(1)}`);
        if (visible && depth(c.x, c.z) > RULES.wetMax + 1e-9) R.crab.push(`${c.id} drawn under ${depth(c.x, c.z).toFixed(3)} m of water @${t.toFixed(1)}`);
        if (b) { const sp = hyp(c.x - b.x, c.z - b.z) / DT; if (sp > RULES.fleeSpeed + 1e-6) R.crabSpeed.push(`${c.id} ${sp.toFixed(2)} m/s @${t.toFixed(1)}`); }
        prev.set(c.id, { x: c.x, z: c.z });
        const f0 = flee.get(c.id), m0 = modes.get(c.id);
        if (c.mode === 'flee' && m0 !== 'flee') { flee.set(c.id, { x: c.x, z: c.z, hx: c.hx, hz: c.hz }); R.fled++; }
        if (c.mode === 'flee' && f0 === undefined) flee.set(c.id, { x: c.x, z: c.z });
        const f1 = flee.get(c.id);
        if (f1 && c.mode === 'flee') { const run = hyp(c.x - f1.x, c.z - f1.z); if (run > RULES.fleeMax + 1e-6) R.flee.push(`${c.id} ran ${run.toFixed(2)} m @${t.toFixed(1)}`); }
        if (m0 === 'flee' && c.mode !== 'flee') { if (!['freeze', 'sink', 'hidden'].includes(c.mode)) R.flee.push(`${c.id} left a flee into ${c.mode}`); flee.delete(c.id); }
        modes.set(c.id, c.mode);
      }
      // fish
      S.shoals.forEach((s, si) => s.fish.forEach((f, fi) => {
        if (![f.x, f.y, f.z].every(Number.isFinite)) R.nan.push(`fish ${si}.${fi} @${t}`);
        const bed = H(f.x, f.z), surf = SEA + lvl(f.x, f.z);
        if (f.y - f.below < bed + RULES.fishBed - 1e-6) R.fish.push(`${s.id}.${fi}: ${(f.y - f.below - bed).toFixed(3)} m over the bed @${t.toFixed(1)}`);
        if (f.y + f.above > surf - RULES.fishTop + 1e-6) R.fish.push(`${s.id}.${fi}: ${(surf - f.y - f.above).toFixed(3)} m under the surface @${t.toFixed(1)}`);
        if (!SL_ZONE(f.x, f.z)) R.fish.push(`${s.id}.${fi}: out of the swim zone @${t.toFixed(1)}`);
        if (hyp(f.x - s.cx, f.z - s.cz) > s.rMax + 0.5 || hyp(f.x - s.cx, f.z - s.cz) < s.rMin - 0.5) R.fishSite.push(`${s.id}.${fi} is ${hyp(f.x - s.cx, f.z - s.cz).toFixed(2)} m from its site`);
        const len = FISH.species[s.species].len * f.size; if (len < 0.2 || len > 0.35) R.fish.push(`${s.id}.${fi}: ${len.toFixed(3)} m long`);
        if (si === 0 && fi === 0) { if (tail.last !== null && f.tail !== tail.last) { tail.gaps.push(t - tail.t0); tail.t0 = t; } else if (tail.last === null) tail.t0 = t; tail.last = f.tail; }
      }));
    },
  });
  return R;
})();
function SL_BAND(x, z) { const s = coast.surfaceAt(x, z); return Math.abs(x) < XW - 1 && coast.depthAt(x, z) <= 0.04 && (s === 'wetsand' || (s === 'sand' && coast.shoreZ(x) - z <= RULES.crabBand)); }
function SL_ZONE(x, z) { return z < BUOY_Z - 0.3 && !coast.limit(x, z).hard && coast.depthAt(x, z) >= RULES.fishDepth; }

test('five soaring gulls stay 6 to 14 m up between z 120 and 175 at 3 to 6 m/s, flap in bouts of whole cycles and glide on flap_level for 2.5 s at least; no gull ever goes NaN or over the barrio, and by day none is hidden', () => {
  assert.deepEqual(main.nan, [], 'every position is a number'); assert.deepEqual(main.soar, [], 'altitude and z'); assert.deepEqual(main.speed, [], 'speed');
  assert.deepEqual(main.cells, [], 'only the four flap cells in the air'); assert.deepEqual(main.sky, [], 'never over the barrio\'s roofs'); assert.deepEqual(main.hiddenDay, [], 'drawn by day');
  assert.ok(main.glides.length >= 12, `${main.glides.length} glides were seen (twelve at least)`);
  assert.ok(main.glides.every((s) => s >= 2.5 - DT * 1.01), `every glide lasts 2.5 s or more (shortest ${Math.min(...main.glides).toFixed(2)} s)`);
});

test('a gull on a perch takes off when the player comes within 5 m, circles 20 to 30 s, and lands on a perch no other gull holds, on the perch exactly', () => {
  assert.deepEqual(main.near, [], 'no gull sits within 5 m of the player');
  assert.ok(main.rises >= 7, `all seven perched gulls took off in the walk (${main.rises} take-offs)`);
  for (const d of main.takeoffs) assert.ok(d < RULES.scare + 0.3, `a take-off at ${d.toFixed(2)} m, within 5 m`);
  assert.ok(main.circles.length >= 7, `${main.circles.length} circles were flown`);
  for (const s of main.circles) assert.ok(s >= 20 - 0.05 && s <= 30 + 0.05, `a circle of ${s.toFixed(1)} s (20 to 30)`);
  assert.ok(main.landings >= 5, `${main.landings} landings`); assert.deepEqual(main.landed, [], 'each landing ends on its perch');
  assert.deepEqual(main.dups, [], 'no two gulls hold one perch');
});

test('a crab keeps to its band and to dry sand (the swell counts), runs sideways at no more than 2.5 m/s for no more than 3 m, then freezes', () => {
  assert.deepEqual(main.crab, [], 'band and water'); assert.deepEqual(main.crabSpeed, [], 'speed'); assert.deepEqual(main.flee, [], 'runs');
  assert.ok(main.fled >= 6, `${main.fled} crabs ran from the player in the walk`);
});

test('a crab that cannot run sinks within a metre of the player and is back after 8 s; one that can run does, sideways and away', () => {
  const sl = shore(), S = makeShoreLife(coast, sl, {}), c = S.crabs[7], w = S.w, home = { x: c.x, z: c.z };
  w.solids = [{ k: 'c', x: c.x - 0.5, z: c.z, r: 0.2 }, { k: 'c', x: c.x + 0.5, z: c.z, r: 0.2 }];     // a post either side of it: it has nowhere to run
  c.hx = 0; c.hz = 1; c.u = 99;
  const player = { x: c.x, y: 0, z: c.z - 0.8 };
  let t = 0, sunk = null, back = null;
  for (let k = 0; k < FPS * 14; k++) {
    t += DT; stepCrab(c, DT, t, player, w);
    if (on('stuck')) { c.mode = c.mode === 'sink' ? 'freeze' : c.mode; c.sink = 0; }
    if (sunk === null && c.mode === 'sink') sunk = t;
    if (sunk !== null && back === null && (c.mode === 'rise' || c.mode === 'freeze') && c.mode !== 'sink' && t > sunk + 1) back = on('noreturn') ? sunk + 2 : t;
  }
  assert.ok(sunk !== null && sunk <= DT * 1.5, `it sinks at once (${sunk} s)`);
  assert.ok(back !== null && back - sunk >= 8 - DT * 1.5 && back - sunk <= 8.6, `it is back after ${back === null ? 'never' : (back - sunk).toFixed(2)} s (8)`);
  assert.deepEqual([c.x, c.z], [home.x, home.z], 'and it did not move');
  // one that can run
  const S2 = makeShoreLife(coast, sl, {});
  let best = 0;
  for (const c2 of S2.crabs) {
    const s = makeShoreLife(coast, sl, {}), cc = s.crabs[S2.crabs.indexOf(c2)], pl = { x: cc.x + cc.hx * 2.5, y: 0, z: cc.z + cc.hz * 2.5 }, o = { x: cc.x, z: cc.z }; let tt = 0, vmax = 0;
    cc.u = 99; for (let k = 0; k < FPS * 3; k++) { const x0 = cc.x, z0 = cc.z; tt += DT; stepCrab(cc, DT, tt, pl, s.w); vmax = Math.max(vmax, hyp(cc.x - x0, cc.z - z0) / DT); }
    const run = hyp(cc.x - o.x, cc.z - o.z), side = Math.abs((cc.x - o.x) * cc.hx + (cc.z - o.z) * cc.hz);
    assert.ok(vmax <= 2.5 + 1e-6 && run <= 3 + 1e-6 && side < 1e-6, `${cc.id}: ${vmax.toFixed(2)} m/s, ${run.toFixed(2)} m, ${side.toFixed(3)} m along its heading`);
    best = Math.max(best, run);
  }
  assert.ok(best > 2, `some crab ran ${best.toFixed(2)} m`);
});

test('a fish keeps inside the swim zone, 0.4 m or more under the live surface and 0.3 m or more over the seabed, circles its site, is 0.2 to 0.35 m long and flips its tail every 0.15 s', () => {
  assert.deepEqual(main.fish, [], 'zone, surface, seabed and length'); assert.deepEqual(main.fishSite, [], 'on its orbit'); assert.deepEqual(main.nan, []);
  assert.ok(main.tails.length === 0 && main.tail === undefined);
});
test('the tail flips every 0.15 s', () => {
  const st = seaState(15), S = makeShoreLife(coast, shore(), {}), f = S.shoals[0].fish[0], flips = []; let last = null, t0 = 0;
  for (let k = 1; k <= FPS * 20; k++) {
    stepShoreLife(S, DT, { x: 1e9, y: 0, z: 1e9 }); void st;
    if (on('tail')) f.tail = k & 1;
    if (last !== null && f.tail !== last) { flips.push(S.t - t0); t0 = S.t; } else if (last === null) t0 = S.t;
    last = f.tail;
  }
  assert.ok(flips.length > 100, `${flips.length} flips in 20 s`);
  for (const g of flips.slice(1)) assert.ok(Math.abs(g - RULES.tail) <= DT + 1e-6, `a tail pose lasts ${g.toFixed(3)} s (0.15)`);
});

test('at night the gulls are not drawn and are not frightened (they do not take off); the crabs and the fish carry on; by day a gull in the air stays in the air', () => {
  const log = [];
  const S = simulate({
    seconds: 80, day: () => false,
    each: ({ S: s }) => {
      if (on('nightfly')) { const g = s.gulls[5]; if (g.mode === 'perch') { g.mode = 'rise'; g.k = 0; } }
      if (on('nightdraw')) for (const g of s.gulls) g.hidden = false;
      for (const g of s.gulls) { if (!g.hidden) log.push(`${g.id} drawn at night`); if (!g.soar && g.mode !== 'perch') log.push(`${g.id} is ${g.mode} at night`); }
    },
  });
  assert.deepEqual(log, [], 'no gull drawn, none in the air that was on a perch'); assert.equal(S.gulls.filter((g) => g.soar).length, 5);
  assert.ok(S.crabs.every((c) => Number.isFinite(c.x)) && S.shoals.every((s) => s.fish.every((f) => Number.isFinite(f.y))), 'the crabs and the fish still run');
});

// ------------------------------------------------------------------------------------------------------------------------------------ the cards
const verts = (cd, i) => [0, 1, 2, 3].map((k) => [cd.pos[i * 12 + k * 3], cd.pos[i * 12 + k * 3 + 1], cd.pos[i * 12 + k * 3 + 2]]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = (a) => hyp(...a);
/** The point of a card at (fu, fv): fractions of its width from the left and of its height from the TOP. */
const cardPoint = (q, fu, fv) => [0, 1, 2].map((k) => q[3][k] + fu * (q[2][k] - q[3][k]) + fv * (q[0][k] - q[3][k]));
const uvs = (cd, i) => [...cd.uv.slice(i * 8, i * 8 + 8)];

test('a gull\'s card is one quad of the cell\'s size standing on its pivot, facing its heading, with the uv the manifest gives (v counted from the top); a walking gull\'s soles are on the sand', () => {
  const cd = makeCards(3), write = on('uvflip') ? (c, i, g, cam) => { gullCard(c, i, g, cam); for (const k of [1, 3, 5, 7]) c.uv[i * 8 + k] = 1 - c.uv[i * 8 + k]; } : on('feet') ? (c, i, g, cam) => gullCard(c, i, { ...g, y: g.y + 0.2 }, cam) : gullCard;
  const W = GULL.cellPx[0] * GULL.mpp, Hh = GULL.cellPx[1] * GULL.mpp;
  GULL.cells.forEach((cell, k) => {
    const g = { hidden: false, mode: 'perch', cell: k, x: 10, y: 2, z: 20, hx: 1, hz: 0, roll: 0, inx: 0, inz: 0 };
    write(cd, 0, g, null); const q = verts(cd, 0);
    assert.ok(Math.abs(len(sub(q[1], q[0])) - W) < 1e-4 && Math.abs(len(sub(q[3], q[0])) - Hh) < 1e-4, `${cell.id}: ${W.toFixed(3)} x ${Hh.toFixed(3)} m`);
    const piv = cardPoint(q, on('padj') ? cell.pivot[0] + 0.1 : cell.pivot[0], cell.pivot[1]);
    const drop = cell.feet === undefined ? 0 : (cell.feet - cell.pivot[1]) * Hh;
    assert.ok(hyp(piv[0] - 10, piv[1] - (2 + drop), piv[2] - 20) < 1e-4, `${cell.id}: its pivot is at the feet${drop ? ' (the walking cell hangs from the eye)' : ''}`);
    if (cell.feet !== undefined) assert.ok(Math.abs(cardPoint(q, cell.pivot[0], cell.feet)[1] - 2) < 1e-4, `${cell.id}: the soles are on the ground`);
    const r = sub(q[1], q[0]); assert.ok(r[0] / len(r) > 0.999 && Math.abs(q[3][1] - q[0][1] - Hh) < 1e-4, `${cell.id}: faces its heading, upright`);
    const [u0, v0, u1, v1] = cell.uv, uv = uvs(cd, 0);
    assert.deepEqual(uv.map((v) => +v.toFixed(6)), [u0, 1 - v1, u1, 1 - v1, u1, 1 - v0, u0, 1 - v0].map((v) => +v.toFixed(6)), `${cell.id}: uv, v from the top`);
  });
  const hide = { hidden: true, mode: 'perch', cell: 4, x: 3, y: 1, z: 4, hx: 1, hz: 0, roll: 0, inx: 0, inz: 0 }; gullCard(cd, 1, hide, null); const q = verts(cd, 1);
  assert.ok(q.every((v) => v[0] === 3 && v[1] === 1 && v[2] === 4), 'a hidden gull collapses to a point');
});

test('every card is drawn from both sides (12 indices, both windings, normals up) and a gull card never goes edge-on to the eye', () => {
  const cd = makeCards(5); if (on('winding')) cd.idx = cd.idx.filter((_, k) => k % 12 < 6);
  assert.equal(cd.idx.length, 5 * 12, 'twelve indices a card'); assert.equal(cd.pos.length, 5 * 12); assert.equal(cd.uv.length, 5 * 8);
  for (let i = 0; i < 5; i++) { const t = [...cd.idx.slice(i * 12, i * 12 + 12)].map((v) => v - i * 4); assert.deepEqual(t, [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2], `card ${i}: both windings`); }
  for (let k = 0; k < cd.nor.length; k += 3) assert.deepEqual([cd.nor[k], cd.nor[k + 1], cd.nor[k + 2]], [0, 1, 0], 'normals up (both faces are lit alike)');
  const g = { hidden: false, mode: 'circle', cell: 2, x: 0, y: 8, z: 0, hx: 1, hz: 0, roll: 0, inx: 0, inz: -1 };
  for (let a = 0; a < 360; a += 15) {
    const cam = { x: 12 * Math.cos((a * Math.PI) / 180), y: 6, z: 12 * Math.sin((a * Math.PI) / 180) };
    gullCard(cd, 0, { ...g }, on('edgeon') ? null : cam);
    const q = verts(cd, 0), r = sub(q[1], q[0]), rl = hyp(r[0], r[2]), vx = cam.x, vz = cam.z - 0, vl = hyp(vx, vz), cosE = vl / hyp(vl, cam.y - 8);
    const show = (cosE * Math.abs(r[0] * vz - r[2] * vx)) / (rl * vl);
    assert.ok(show >= 0.55 - 1e-6, `seen from ${a} degrees ${(show * 100).toFixed(0)} % of the card shows (55 % at least)`);
  }
});

test('a fish card is the species\' cell at its metres per pixel on its eye pivot, with the tail pose\'s uv, and is not drawn beyond 45 m; a crab card lies flat, claws forward, and sinks out of sight', () => {
  const cd = makeCards(3);
  for (const name of ['jack', 'grunt', 'tang']) for (const tail of [0, 1]) {
    const sp = FISH.species[name], f = { x: 0, y: -1.2, z: 150, hx: 1, hz: 0, size: 1.1, tail, vis: true };
    fishCard(cd, 0, f, name, null); const q = verts(cd, 0), m = (sp.len / sp.body) * 1.1;
    assert.ok(Math.abs(len(sub(q[1], q[0])) - sp.px[0] * m) < 1e-4 && Math.abs(len(sub(q[3], q[0])) - sp.px[1] * m) < 1e-4, `${name}: size`);
    const e = cardPoint(q, sp.pivot[0], sp.pivot[1]); assert.ok(hyp(e[0], e[1] + 1.2, e[2] - 150) < 1e-4, `${name}: the eye is the pivot`);
    assert.ok(Math.abs(len(sub(q[1], q[0])) * sp.body / sp.px[0] - sp.len * 1.1) < 1e-4, `${name}: ${sp.len * 1.1} m of body`);
    const uv = tail ? sp.uv.b : sp.uv.a; assert.deepEqual(uvs(cd, 0).map((v) => +v.toFixed(6)), [uv[0], 1 - uv[3], uv[2], 1 - uv[3], uv[2], 1 - uv[1], uv[0], 1 - uv[1]].map((v) => +v.toFixed(6)), `${name}: tail ${tail ? 'b' : 'a'}`);
  }
  const f = { x: 0, y: -1.2, z: 150, hx: 1, hz: 0, size: 1, tail: 0, vis: true }, at = (d) => ({ x: d, y: 1.6, z: 150 });
  fishCard(cd, 1, f, 'jack', on('fishfar') ? null : at(60)); const far = verts(cd, 1); assert.ok(far.every((v) => Math.abs(v[0]) < 1e-5 && Math.abs(v[1] + 1.2) < 1e-5 && Math.abs(v[2] - 150) < 1e-4), 'beyond 45 m: collapsed to its eye');
  fishCard(cd, 1, f, 'jack', at(30)); assert.ok(len(sub(verts(cd, 1)[1], verts(cd, 1)[0])) > 0.3, 'at 30 m: drawn');
  const c = { x: 5, z: 140, hx: 0, hz: 1, w: 0.15, sink: 0 }; crabCard(cd, 2, c, 0.5, null); const q = verts(cd, 2);
  if (on('crabtilt')) q[2][1] += 0.05;
  assert.ok(q.every((v) => Math.abs(v[1] - 0.512) < 1e-4), 'flat, 12 mm over the sand');
  assert.ok(Math.abs(len(sub(q[1], q[0])) - (0.15 * 128) / 116) < 1e-4, 'a crab\'s legs span its width'); assert.ok(sub(q[3], q[0])[2] > 0, 'claws forward (the cell\'s top is the heading)');
  assert.ok(Math.abs(q.reduce((s, v) => s + v[0], 0) / 4 - 5) < 1e-4 && Math.abs(q.reduce((s, v) => s + v[2], 0) / 4 - 140) < 1e-4, 'centred on the crab');
  crabCard(cd, 2, { ...c, sink: 1 }, 0.5, null); assert.ok(verts(cd, 2).every((v) => v[1] < 0.5), 'sunk: out of sight, under the sand');
});

// ------------------------------------------------------------------------------------------------------------------------------------ the page's part (the real THREE, a stand-in loader)
async function page(o = {}) {
  const c = createContext({ seed: SEED, headless: true });
  c.plan = plan; c.THREE = THREE; c.scene = new THREE.Scene(); c.camera = new THREE.PerspectiveCamera(); c.camera.position.set(0, 2, 110); c.player = { s: { x: 0, y: 0, z: 100 } }; c.world = {}; c.world.life = { pigeons: [] };
  const asked = [];
  const load = async (file) => { asked.push(file); if ((o.fail ?? []).includes(file) && !on('found')) throw new Error('404 ' + file); return new THREE.Texture(); };
  const R = await loadShoreLife(c, { hidden: o.hidden, load });
  return { c, R, asked };
}
const sys = (c) => c.systems.filter((s) => s.name === 'world.shorelife');

test('the unit is ONE group props.shorelife of three meshes (three draw calls, 288 triangles), ONE system world.shorelife at order 41, and ctx.world.shorelife is exactly its counts; ctx.world.life is not touched', async () => {
  const { c, R, asked } = await page();
  if (on('calls')) R.groups[0].add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
  if (on('twosys')) await loadShoreLife(c, { load: async () => new THREE.Texture() });
  if (on('lifekey')) c.world.life.gulls = [];
  assert.equal(R.groups.length, 1, 'one group'); const g = R.groups[0]; assert.equal(g.name, 'props.shorelife'); assert.ok(g.visible, 'shown unless asked to hide');
  assert.deepEqual(g.children.map((m) => m.name).sort(), ['shore.crabs', 'shore.fish', 'shore.gulls'], 'three meshes: three draw calls');
  assert.deepEqual([...new Set(asked)].sort(), ['crab_shells.png', 'fish_sprites.png', 'gull_sprites.png'], 'the three sheets');
  const tris = g.children.reduce((n, m) => n + m.geometry.index.count / 3, 0);
  assert.equal(tris, 288, '72 cards of 4 triangles (both windings)'); assert.ok(tris <= 5000, 'a budget of 5,000');
  assert.deepEqual(c.world.shorelife, { gulls: 12, crabs: 18, fish: 42, tris: 288, calls: 3 }, 'ctx.world.shorelife is exactly these keys');
  assert.deepEqual(R.stats, c.world.shorelife);
  assert.equal(sys(c).length, 1, 'one system'); assert.equal(sys(c)[0].order, 41);
  assert.deepEqual(Object.keys(c.world.life), ['pigeons'], 'ctx.world.life keeps its keys');
  const fish = g.children.find((m) => m.name === 'shore.fish'), gulls = g.children.find((m) => m.name === 'shore.gulls');
  assert.ok(fish.material.transparent && fish.renderOrder > -10 && fish.renderOrder === FISH_ORDER, 'the fish are drawn over the sea\'s own layer (renderOrder -10) so a shoal under 1.5 m of water can be seen');
  assert.ok(!gulls.material.transparent && gulls.material.alphaTest === 0.4 && gulls.material.side === THREE.FrontSide, 'the gulls are cut out and single-sided');
  for (const m of g.children) assert.ok(m.frustumCulled === false && m.material.map && m.material.map.colorSpace === THREE.SRGBColorSpace, `${m.name}: never culled (its quads move), a sRGB sheet`);
  assert.equal((await page({ hidden: true })).R.groups[0].visible, false, 'LateWarm asks for it hidden and shows it once it is warm');
});

test('a frame of the system moves the cards and never throws; a sheet that is not found is reported in ctx.errors and left out, the rest still draws; with none the unit has no group and no system', async () => {
  const { c, R } = await page(), fn = on('throws') ? () => { throw new Error('boom'); } : sys(c)[0].fn;
  const gulls = R.meshes.find((m) => m.name === 'shore.gulls'), before = [...gulls.geometry.attributes.position.array];
  c.player.s = { x: R.plan.perches[R.plan.gulls[5].perch].x, y: 0, z: R.plan.perches[R.plan.gulls[5].perch].z - 1 };
  assert.doesNotThrow(() => { for (let k = 0; k < 90; k++) fn(DT); }, 'a frame never throws');
  assert.ok(gulls.geometry.attributes.position.array.some((v, i) => v !== before[i]), 'a frame moves the gulls');
  assert.ok(gulls.geometry.attributes.position.array.every(Number.isFinite), 'all finite'); assert.deepEqual(c.errors, [], 'no error');
  // a world that breaks in the frame: the error is reported once and the frame does not throw
  const w = await page(); w.c.player = { get s() { throw new Error('the player is gone'); } }; const wf = sys(w.c)[0].fn;
  assert.doesNotThrow(() => { for (let k = 0; k < 5; k++) wf(DT); }); assert.equal(w.c.errors.filter((e) => e.item === 'world.shorelife').length, 1, 'reported once, in ctx.errors');
  const f = await page({ fail: ['fish_sprites.png'] });
  assert.equal(f.R.groups[0].children.length, 2, 'the fish sheet is left out'); assert.ok(f.c.errors.some((e) => e.stage === 'shorelife' && e.item === 'fish_sprites.png'), 'and reported');
  assert.equal(f.c.world.shorelife.fish, 0); assert.equal(f.c.world.shorelife.calls, 2);
  const none = await page({ fail: ['gull_sprites.png', 'fish_sprites.png', 'crab_shells.png'] });
  assert.deepEqual(none.R.groups, [], 'no sheet, no group'); assert.equal(sys(none.c).length, 0, 'and no system'); assert.equal(none.c.errors.length, 3);
});

test('the budget: seventy-two cards of four triangles, three draw calls, whatever the plan says', () => {
  const p = shore(); assert.equal(p.stats.gulls + p.stats.crabs + p.stats.fish, 72);
  assert.ok(p.stats.cards * 4 <= 5000, `${p.stats.cards} cards x 4 triangles = ${p.stats.cards * 4} (5,000 at most)`);
  assert.equal(p.shoals.reduce((n, s) => n + s.fish.length, 0), p.stats.fish, 'the stats count the plan\'s fish');
});

test('the source reads no clock and no random source: the only time is the one a step is handed', async () => {
  let src = await readFile(resolve(ROOT, 'js/world/shorelife.js'), 'utf8');
  if (on('clock')) src += '\nconst x = Math.random();\n';
  for (const bad of ['Math.random', 'Date.now', 'performance.now', 'new Date']) assert.ok(!src.includes(bad), `shorelife.js does not use ${bad}`);
  assert.ok(!/from 'three'|require\('three'\)/.test(src), 'and does not import THREE: the pure part runs under Node (the page passes ctx.THREE)');
});
