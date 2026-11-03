// THE SEABED'S DRESSING (A5, js/world/seabed.js, dev/FEATURE-BEACH.md phase 2c): a seagrass meadow and a coral patch on the floor of the bay, one atlas, one mesh, one draw call. The plan is pure (the coast and the sea's
// plan in, plain records out: where every tuft and every coral head stands); the geometry, the baked atlas and the loader run in Node with no renderer (the atlas is read from disk, or stood in for), so the page draws
// the plan this file checks (tests/world-seabed-page.test.mjs boots the real thing).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-seabed.test.mjs
// Every check has a deliberately broken input selected by SD_SABOTAGE=<id>|all (or several ids, comma apart), and each must then FAIL:
//   toomany   forty tufts too many                          nograss   no seagrass at all                                 reefn      a coral head fewer             statslie  the plan's own totals are wrong
//   tall      a tuft two metres tall                        tiny      a coral head a tenth of a metre high               nan        a tuft with no position        flat      every tuft the same height
//   float     a plant half a metre over the seabed          buried    a plant a metre into it                            land       a tuft on the beach's sand     outside   a coral head outside the walls
//   shallow   a tuft in water half a metre deep             deep      a tuft in water 3.4 m deep                         tip        the shallowest tuft at its tallest (its tip in the air)
//   pile      a tuft against a pile of the pier             deck      a tuft under the pier's deck                       moped      a tuft on the sunken moped     rail      a tuft against the raft's skirt
//   scatter   every tuft sown at random (no meadows)        corner    every tuft in one corner of the bay                nopier     no tuft by the piles or the raft
//   reefout   a coral head five metres from the patch       reefcell  a coral head that is a tuft of grass               reefstack  two coral heads on one spot
//   random    a plan that is not a function of the seed     sameseed  another seed, the same plan                        clock      a clock read in the module's source
//   stretch   the cards twice as wide as their art           flipv     the cards' art upside down                         fullcell   the cards cut to the whole cell, empty margin and all
//   dull      the cards lit as a roof's underside            sunk      the cards a metre into the seabed                  uncrossed  the second card of every plant on the first
//   cells     the manifest's crop one pixel off the code's    nobleed   the atlas as the file has it (white under the clear pixels)             plainmips  the mips a plain average of the raw file makes
//   thin      an atlas of one-pixel blades (a plain chain loses them)
//   twomesh   a second mesh in the group                    shown     a group that was built hidden is shown             blend      a blended (not cut-out) material
//   hook      a material that hides the town's look uniforms system    a per-frame system left behind                    silent     a failed load that tells nobody
//   drawn     a failed load that draws something anyway     keepreef  a coral patch the plan was meant not to have
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { SEA, PIER, RAFT, XW, STOP_Z } from '../js/world/coast.js';
import { planSea } from '../js/world/beachsea.js';
import { SIZE } from '../js/world/waterlib.js';
import { planSeabed, seabedGeometry, bleedColour, mipChain, loadSeabed, SEABED, CELLS, ATLAS } from '../js/world/seabed.js';
import { decodePng } from '../tools/textures/beach_png.mjs';
import { segDist } from './geom2d.mjs';

const SABS = new Set((process.env.SD_SABOTAGE ?? '').split(',').filter(Boolean));
const on = (...ids) => SABS.has('all') || ids.some((id) => SABS.has(id));
const SEED = 20261029;
const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

const ctx0 = createContext({ seed: SEED, headless: true });
const plan0 = generatePlan(ctx0), coast = plan0.coast, H = coast.heightAt, S = planSea(coast);
let tick = 0;

const KINDS = ['turtle_grass', 'branching_coral', 'brain_coral'];
const sig = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 12);                    // (a short name for a whole plan: a failed comparison prints twelve characters, not the plan)
const round3 = (v) => +v.toFixed(3);
const rooted = (t) => { t.y = round3(H(t.x, t.z) - SEABED.sink); return t; };                       // (the foot back on the seabed under a tuft that was moved)
const lowH = (i) => round3(0.35 + 0.002 * ((i * 37) % 100));                                         // (a hundred different heights, none over 0.55 m: a sabotage that only moves the tufts must not break the height rules too)
const piles = S.items.filter((i) => i.group === 'pile');

/** The plan the checks look at: the real one, or a broken copy when SD_SABOTAGE asks. */
function seabed() {
  const p = planSeabed(coast, S, ctx0.rng.fork('seabed'));
  const g = p.grass, r = p.reef;
  if (on('toomany')) for (let i = 0; i < 40; i++) g.push(rooted({ x: -88 + i * 4, y: 0, z: 200 + (i % 3) * 0.5, h: 0.5, yaw: 0.5 }));       // (in open water, clear of everything: only the count is wrong)
  if (on('nograss')) g.length = 0;
  if (on('reefn')) r.pop();
  if (on('tall')) g[7].h = 2;
  if (on('tiny')) r[3].h = 0.1;
  if (on('nan')) g[11].z = NaN;
  if (on('flat')) for (const t of g) t.h = 0.5;
  if (on('float')) g[5].y = round3(g[5].y + 0.5);
  if (on('buried')) r[4].y = round3(r[4].y - 1);
  if (on('land')) { g[9].z = 125; g[9].x = 30; rooted(g[9]); }
  if (on('outside')) { r[2].x = 104; rooted(r[2]); }
  if (on('shallow')) { g[13].x = 0; g[13].z = 153; rooted(g[13]); }
  if (on('deep')) { g[13].x = 10; g[13].z = 218; rooted(g[13]); }
  if (on('tip')) g.reduce((a, b) => (H(b.x, b.z) > H(a.x, a.z) ? b : a)).h = 0.8;                       // (the shallowest tuft, as tall as a tuft may be: in range, but its tip stands in the air)
  if (on('pile')) { const w = S.walls.find((q) => q.id === 'pier.pile' && q.z1 > 160); g[2].x = round3(w.x1 + w.t + 0.4); g[2].z = round3(w.z1); rooted(g[2]); }
  if (on('deck')) { g[3].x = PIER.x; g[3].z = 170; rooted(g[3]); }
  if (on('moped')) { const m = S.sunken[0]; g[4].x = round3(m.x + 0.3); g[4].z = m.z; rooted(g[4]); }
  if (on('rail')) { const w = S.walls.find((q) => q.id === 'raft.skirt') ?? S.walls.find((q) => /^raft/.test(q.id)); g[6].x = round3(w.x1 + 0.3); g[6].z = round3(w.z1); rooted(g[6]); }
  if (on('scatter')) { let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; g.forEach((t, i) => { t.x = round3(-88 + 176 * rnd()); t.z = round3(158 + 45 * rnd()); t.h = lowH(i); rooted(t); }); }
  if (on('corner')) g.forEach((t, i) => { t.x = round3(-90 + (i % 20)); t.z = round3(160 + (i % 7)); t.h = lowH(i); rooted(t); });
  if (on('nopier')) p.grass = g.filter((t) => !piles.some((q) => Math.hypot(q.x - t.x, q.z - t.z) < 7) && Math.hypot(t.x - RAFT.x, t.z - RAFT.z) > 7.5);
  if (on('reefout')) { r[1].x = round3(S.reef.x + 5); r[1].z = S.reef.z; rooted(r[1]); }
  if (on('reefcell')) r[0].cell = 'turtle_grass';
  if (on('reefstack')) { r[6].x = r[5].x; r[6].z = r[5].z; r[6].y = r[5].y; }
  const q = p.grass, plants = q.length + r.length;
  p.stats = on('statslie') ? { ...p.stats, tris: p.stats.tris - 4 } : { grass: q.length, reef: r.length, plants, tris: plants * SEABED.tris, calls: plants ? 1 : 0 };
  return p;
}
const P = seabed();
const all = [...P.grass.map((p) => ({ ...p, kind: 'turtle_grass' })), ...P.reef.map((p) => ({ ...p, kind: p.cell }))];

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ the plan
test('the plan: at most 380 tufts, exactly 28 coral heads, 4 triangles a plant under 1,800, one draw call', () => {
  assert.ok(P.grass.length >= 250 && P.grass.length <= 380, `${P.grass.length} tufts of seagrass (a meadow, and no more than 380)`);
  assert.equal(P.reef.length, 28, 'the coral patch is 28 heads');
  assert.equal(P.reef.filter((p) => p.cell === 'branching_coral').length, SEABED.reefBranching, `${SEABED.reefBranching} branching`);
  assert.equal(P.reef.filter((p) => p.cell === 'brain_coral').length, 28 - SEABED.reefBranching, 'and the rest brain coral');
  const plants = P.grass.length + P.reef.length;
  assert.deepEqual(P.stats, { grass: P.grass.length, reef: P.reef.length, plants, tris: plants * 4, calls: 1 }, 'the totals the plan reports are the totals it holds: 4 triangles a plant, one draw call');
  assert.ok(P.stats.tris <= 1800, `${P.stats.tris} triangles (budget 1,800)`);
  assert.deepEqual(Object.keys(P).sort(), ['grass', 'reef', 'stats'], 'grass, reef and stats, nothing else');
});

test('every plant is a finite record, rounded to the millimetre, with a height of its kind and a turn', () => {
  for (const p of all) {
    for (const k of ['x', 'y', 'z', 'h', 'yaw']) {
      assert.ok(Number.isFinite(p[k]), `${p.kind} at ${p.x},${p.z}: ${k} is a number (${p[k]})`);
      assert.equal(p[k], round3(p[k]), `${k} is rounded to the millimetre (${p[k]})`);
    }
    assert.ok(p.yaw >= 0 && p.yaw <= 3.142, `a turn (${p.yaw})`);
  }
  for (const p of P.grass) assert.ok(p.h >= 0.35 && p.h <= 0.8, `a tuft of seagrass is 0.35 to 0.8 m tall (${p.h} m at ${p.x},${p.z})`);
  for (const p of P.reef) assert.ok(p.h >= 0.3 && p.h <= 0.9, `a coral head is 0.3 to 0.9 m tall (${p.h} m, ${p.cell})`);
  for (const p of P.reef) { const [lo, hi] = p.cell === 'brain_coral' ? SEABED.brainH : SEABED.branchingH; assert.ok(p.h >= lo && p.h <= hi, `${p.cell} is ${lo} to ${hi} m (${p.h})`); }
  assert.ok(new Set(P.grass.map((p) => p.h)).size > 50, 'the tufts are not all one height');
  assert.ok(P.grass.some((p) => p.yaw < 1.2) && P.grass.some((p) => p.yaw > 2), 'nor all turned one way');
});

test('every plant is rooted in the seabed (2 cm of coast.heightAt), under the sea, and inside the swim zone', () => {
  for (const p of all) {
    const ground = H(p.x, p.z), at = `${p.kind} at ${p.x},${p.z}`;
    assert.ok(Math.abs(p.y - ground) <= 0.02, `${at}: its foot (${p.y}) is within 2 cm of the seabed (${ground.toFixed(3)})`);
    assert.ok(ground < SEA - 0.5, `${at}: the seabed is under the sea (${ground.toFixed(2)} m, the sea ${SEA})`);
    const lim = coast.limit(p.x, p.z);
    assert.ok(!lim.hard && lim.x === p.x && lim.z === p.z, `${at}: the swim zone lets a swimmer reach it, and does not move her (${JSON.stringify(lim)})`);
    assert.ok(Math.abs(p.x) <= XW - 6 && p.z <= STOP_Z - 6, `${at}: a margin inside the walls`);
  }
});

test('seagrass grows where the water over the seabed is 0.7 to 3.2 m deep, and the coral patch 3 m down; no tip stands in the air', () => {
  for (const p of P.grass) { const d = SEA - H(p.x, p.z); assert.ok(d >= 0.7 && d <= 3.2, `a tuft at ${p.x},${p.z} stands in ${d.toFixed(2)} m of water`); }
  for (const p of all) assert.ok(SEA - (p.y + p.h) >= 0.1, `${p.kind} at ${p.x},${p.z}: its tip is ${(SEA - p.y - p.h).toFixed(3)} m under the still surface (0.1 at least: a tip that stands in the air is a blade out of the water)`);
  assert.ok(P.grass.some((p) => SEA - H(p.x, p.z) < 0.9), 'the check can see the wading depth (under 0.9 m of water a tuft is cut short: a tip rule that no tuft is near would be no rule)');
  const deeper = Math.max(...P.grass.map((p) => SEA - H(p.x, p.z))), shallower = Math.min(...P.grass.map((p) => SEA - H(p.x, p.z)));
  assert.ok(deeper > 2.4 && shallower < 1.0, `the meadow runs from the wading depth (${shallower.toFixed(2)} m) to where a swimmer's eyes are under the surface (${deeper.toFixed(2)} m)`);
  for (const p of P.reef) { const d = SEA - H(p.x, p.z); assert.ok(d >= 2.7 && d <= 3.3, `a coral head at ${p.x},${p.z} stands in ${d.toFixed(2)} m of water`); }
});

// the same distances the plan keeps, worked out here from the sea's plan (a wall's thickness is part of it, a floor is 0 inside, a sunken thing is its footprint)
const inside = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const edgeDist = (pts, x, z) => Math.min(...pts.map((a, i) => { const b = pts[(i + 1) % pts.length]; return segDist(x, z, { x1: a[0], z1: a[1], x2: b[0], z2: b[1] }); }));
const sunkenR = (s) => { const it = S.items.find((i) => i.group === 'sunken' && Math.hypot(i.x - s.x, i.z - s.z) < 0.01), sz = SIZE[it.name]; return Math.max(sz[0], sz[2]) / 2; };
const gapTo = (p) => ({
  wall: Math.min(...S.walls.map((w) => segDist(p.x, p.z, w) - w.t)),
  floor: Math.min(...S.floors.map((f) => (inside(f.pts, p.x, p.z) ? 0 : edgeDist(f.pts, p.x, p.z)))),
  sunken: Math.min(...S.sunken.map((s) => Math.hypot(p.x - s.x, p.z - s.z) - sunkenR(s))),
});

test('nothing grows through what stands: no plant within 1 m of a wall (a pile, a hull, a skirt, a rail), a floor (the pier\'s deck, the raft\'s) or a sunken thing; none on the pier', () => {
  assert.equal(S.sunken.length, 2, 'the moped and the anchor lie on the seabed');
  for (const p of all) {
    const g = gapTo(p), at = `${p.kind} at ${p.x},${p.z}`;
    assert.ok(g.wall >= 1, `${at}: ${g.wall.toFixed(2)} m from a wall (a pile, a hull, a skirt, a rail)`);
    assert.ok(g.floor >= 1, `${at}: ${g.floor.toFixed(2)} m from a floor (the pier's deck, the raft's)`);
    assert.ok(g.sunken >= 1, `${at}: ${g.sunken.toFixed(2)} m from a sunken thing`);
    assert.ok(!(Math.abs(p.x - PIER.x) < PIER.w / 2 + 1 && p.z > PIER.z0 - 1 && p.z < PIER.z1 + 1), `${at}: not on the pier's footprint`);
  }
  assert.ok(Math.min(...all.map((p) => gapTo(p).wall)) < 6, 'the check can see a wall: the nearest plant to one is within 6 m');   // (a check that no plant is anywhere near anything would pass on an empty sea)
});

test('the grass grows in meadows: clustered, thick by the pier\'s piles on both flanks and round the raft, and spread across the shallows of the whole bay', () => {
  const g = P.grass, near = (p, r) => g.filter((q) => q !== p && Math.hypot(q.x - p.x, q.z - p.z) <= r).length;
  const crowd = g.filter((p) => near(p, 1.5) >= 3).length / g.length;
  assert.ok(crowd >= 0.4, `${(crowd * 100).toFixed(0)}% of the tufts have three neighbours within 1.5 m (a scatter has almost none: ${crowd.toFixed(2)})`);
  const byPiers = g.filter((p) => piles.some((q) => Math.hypot(q.x - p.x, q.z - p.z) <= 6) || Math.hypot(p.x - RAFT.x, p.z - RAFT.z) <= 7).length / g.length;
  assert.ok(byPiers >= 0.25, `${(byPiers * 100).toFixed(0)}% of the tufts are within 6 m of a pile or 7 m of the raft`);
  const flank = (sign) => g.filter((p) => Math.sign(p.x - PIER.x) === sign && Math.abs(p.x - PIER.x) < 7 && p.z > 150 && p.z < 195).length;
  assert.ok(flank(1) >= 8 && flank(-1) >= 8, `a stand on each flank of the pier (${flank(-1)} to the west, ${flank(1)} to the east)`);
  assert.ok(g.filter((p) => Math.hypot(p.x - RAFT.x, p.z - RAFT.z) <= 7).length >= 20, 'a ring round the raft');
  const xs = g.map((p) => p.x), zs = g.map((p) => p.z);
  assert.ok(Math.min(...xs) >= -90 && Math.max(...xs) <= 90, `x ${Math.min(...xs)} to ${Math.max(...xs)}: inside -90..90`);
  assert.ok(Math.min(...zs) >= 150 && Math.max(...zs) <= 205, `z ${Math.min(...zs)} to ${Math.max(...zs)}: inside 150..205`);
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 120, 'the shallows are sown across the bay, west to east');
  assert.ok(Math.min(...zs) <= 165 && Math.max(...zs) >= 195, 'and from the wading depth out to the swim line');
});

test('the coral patch: 28 heads inside the patch\'s radius, on the seabed, apart from each other, none outside the swim zone, and away from every wall and floor', () => {
  const R = S.reef;
  for (const p of P.reef) {
    assert.ok(KINDS.slice(1).includes(p.cell), `a coral head is branching or brain coral (${p.cell})`);
    assert.ok(Math.hypot(p.x - R.x, p.z - R.z) <= R.r, `a head at ${p.x},${p.z} is ${Math.hypot(p.x - R.x, p.z - R.z).toFixed(2)} m from the patch's centre (radius ${R.r})`);
  }
  let nearest = Infinity; for (let i = 0; i < P.reef.length; i++) for (let j = i + 1; j < P.reef.length; j++) nearest = Math.min(nearest, Math.hypot(P.reef[i].x - P.reef[j].x, P.reef[i].z - P.reef[j].z));
  assert.ok(nearest >= 0.2, `no two heads on one spot (the nearest pair are ${nearest.toFixed(2)} m apart)`);
  const mid = P.reef.filter((p) => Math.hypot(p.x - R.x, p.z - R.z) <= R.r / 2).length;
  assert.ok(mid >= 4, `a patch with a middle: ${mid} heads within half its radius`);
});

test('the same seed gives the same plan, whatever else has drawn from the stream; another seed gives another', () => {
  const base = planSeabed(coast, S, ctx0.rng.fork('seabed'));
  const again = planSeabed(coast, S, ctx0.rng.fork('seabed' + (on('random') ? ++tick : '')));
  const people = ctx0.rng.fork('people'); for (let i = 0; i < 50; i++) people.next(); ctx0.rng.fork('furnish:3').next();     // (the root stream is only ever forked: a draw from it would move every fork after it)
  const after = planSeabed(coast, S, ctx0.rng.fork('seabed' + (on('random') ? ++tick : '')));
  assert.equal(sig(again), sig(base), 'the plan is a function of the seed: twice, the same');
  assert.equal(sig(after), sig(base), 'and of nothing the other forked streams drew');
  assert.equal(sig(planSeabed(coast, S, createContext({ seed: SEED, headless: true }).rng.fork('seabed'))), sig(base), 'nor of the context it was made in');
  const other = planSeabed(coast, S, createContext({ seed: on('sameseed') ? SEED : SEED + 5, headless: true }).rng.fork('seabed'));
  assert.notEqual(sig(other.grass), sig(base.grass), 'another seed lays the meadow out another way');
  assert.notEqual(sig(other.reef), sig(base.reef), 'and the coral');
  assert.ok(other.grass.length <= 380 && other.reef.length === 28 && other.stats.tris <= 1800, 'within the same budget');
});

test('seabed.js reads no clock and no system randomness (a layout is a function of the seed)', () => {
  const src = readFileSync(here('../js/world/seabed.js'), 'utf8') + (on('clock') ? '\nconst t0 = performance.now();\n' : '');
  const hit = src.match(/Math\.random|Date\.now|performance\.now|new Date\b|getRandomValues|crypto\.random/g);
  assert.equal(hit, null, `no ${hit}`);
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ the geometry
const MANIFEST = JSON.parse(readFileSync(here('../assets/textures/manifest.beach.json'), 'utf8')).textures.seagrass_coral;
const cellOfManifest = (id) => { const c = MANIFEST.cells.find((q) => q.id === id); return on('cells') && id === 'branching_coral' ? { ...c, contentRect: [c.contentRect[0] + 1, c.contentRect[1], c.contentRect[2], c.contentRect[3]] } : c; };

test('the crop: each card is the manifest\'s contentRect of its cell (not the cell with its empty margin), and the atlas is the 512 x 512 file the manifest names', () => {
  assert.equal(MANIFEST.map, 'beach/' + ATLAS.file); assert.deepEqual(MANIFEST.size, [ATLAS.size, ATLAS.size]);
  const png = decodePng(here('../assets/textures/beach/' + ATLAS.file));
  assert.deepEqual([png.width, png.height], [ATLAS.size, ATLAS.size], 'the file is the size the code expects');
  for (const id of KINDS) {
    const c = cellOfManifest(id);
    assert.deepEqual(CELLS[id].rect, c.rect, `${id}: the cell`); assert.deepEqual(CELLS[id].content, c.contentRect, `${id}: the art inside it`);
    assert.ok(Math.abs(CELLS[id].aspect - c.contentRect[2] / c.contentRect[3]) < 1e-9, `${id}: the aspect of the art`);
  }
});

test('the geometry: one indexed mesh, 4 triangles a plant, every card cut to its art, upright, not stretched, crossed with its twin, standing on its plant, lit as if it faced the sky', () => {
  const g = seabedGeometry(P), n = P.grass.length + P.reef.length, pos = g.getAttribute('position').array, uv = g.getAttribute('uv').array, nrm = g.getAttribute('normal').array, col = g.getAttribute('color').array;
  const cellId = [...P.grass.map(() => 'turtle_grass'), ...P.reef.map((p) => p.cell)];
  if (on('stretch')) for (let q = 0; q < n * 2; q++) { let cx = 0, cz = 0; for (let k = 0; k < 4; k++) { cx += pos[(q * 4 + k) * 3] / 4; cz += pos[(q * 4 + k) * 3 + 2] / 4; } for (let k = 0; k < 4; k++) { const o = (q * 4 + k) * 3; pos[o] = cx + (pos[o] - cx) * 2; pos[o + 2] = cz + (pos[o + 2] - cz) * 2; } }
  if (on('flipv')) for (let q = 0; q < n * 2; q++) { const vs = [0, 1, 2, 3].map((k) => uv[(q * 4 + k) * 2 + 1]), lo = Math.min(...vs), hi = Math.max(...vs); for (let k = 0; k < 4; k++) uv[(q * 4 + k) * 2 + 1] = lo + hi - vs[k]; }
  if (on('fullcell')) for (let q = 0; q < n * 2; q++) { const c = CELLS[cellId[q >> 1]], [a0, b0, a1, b1] = c.uv, [x, y, w, h] = c.rect, S2 = ATLAS.size; for (let k = 0; k < 4; k++) { const o = (q * 4 + k) * 2; uv[o] = x / S2 + ((uv[o] - a0) / (a1 - a0)) * (w / S2); uv[o + 1] = 1 - (y + h) / S2 + ((uv[o + 1] - b0) / (b1 - b0)) * (h / S2); } }
  if (on('dull')) for (let i = 1; i < nrm.length; i += 3) nrm[i] = -1;
  if (on('sunk')) for (let i = 1; i < pos.length; i += 3) pos[i] -= 1;
  if (on('uncrossed')) for (let q = 1; q < n * 2; q += 2) for (let k = 0; k < 4; k++) { const o = (q * 4 + k) * 3, f = ((q - 1) * 4 + k) * 3; pos[o] = pos[f]; pos[o + 2] = pos[f + 2]; }
  assert.ok(g.index.array instanceof Uint16Array && g.index.count === n * 12, 'a 16-bit index of 12 a plant');
  assert.equal(g.index.count / 3, n * 4, '4 triangles a plant'); assert.ok(g.index.count / 3 <= 1800, `${g.index.count / 3} triangles (budget 1,800)`);
  assert.equal(g.userData.triangles, n * 4, 'and the geometry says so');
  assert.equal(pos.length, n * 24, 'two cards of four vertices a plant'); assert.ok(Math.max(...g.index.array) < n * 8, 'the index reads only vertices that exist');
  for (let i = 0; i < n; i++) {
    const p = i < P.grass.length ? P.grass[i] : P.reef[i - P.grass.length], c = cellOfManifest(cellId[i]).contentRect, S2 = ATLAS.size;
    const want = [c[0] / S2, 1 - (c[1] + c[3]) / S2, (c[0] + c[2]) / S2, 1 - c[1] / S2];                    // the art's rectangle in the uv space of an image flipped on upload
    const dir = [];
    for (let q = 0; q < 2; q++) {
      const v = (i * 2 + q) * 4, at = `${cellId[i]} ${i}, card ${q}`;
      const vs = [0, 1, 2, 3].map((k) => ({ x: pos[(v + k) * 3], y: pos[(v + k) * 3 + 1], z: pos[(v + k) * 3 + 2], u: uv[(v + k) * 2], v: uv[(v + k) * 2 + 1] }));
      const foot = vs.slice(0, 2), top = vs.slice(2);
      assert.ok(foot.every((a) => Math.abs(a.y - foot[0].y) < 1e-6) && top.every((a) => Math.abs(a.y - top[0].y) < 1e-6), `${at}: level foot, level top`);
      assert.ok(Math.abs(top[0].y - foot[0].y - p.h) < 1e-5, `${at}: as tall as its plant (${(top[0].y - foot[0].y).toFixed(4)} of ${p.h})`);
      assert.ok(foot[0].y <= p.y + 1e-6 && foot[0].y >= p.y - 0.15 * p.h - 1e-6, `${at}: its foot (${foot[0].y.toFixed(3)}) is on its plant's seabed (${p.y}), at most a seventh of it buried`);
      const width = Math.hypot(foot[1].x - foot[0].x, foot[1].z - foot[0].z), aspect = c[2] / c[3];
      assert.ok(Math.abs(width / p.h - aspect) < 1e-3 * aspect, `${at}: the width over the height is the art's (${(width / p.h).toFixed(4)} of ${aspect.toFixed(4)}): not stretched`);
      assert.ok(Math.abs((foot[0].x + foot[1].x) / 2 - p.x) < 1e-4 && Math.abs((foot[0].z + foot[1].z) / 2 - p.z) < 1e-4, `${at}: centred on its plant`);
      assert.ok(foot.every((a) => Math.abs(a.v - want[1]) < 1e-6) && top.every((a) => Math.abs(a.v - want[3]) < 1e-6), `${at}: the art stands on its foot (not upside down)`);
      assert.ok(Math.abs(Math.min(...vs.map((a) => a.u)) - want[0]) < 1e-6 && Math.abs(Math.max(...vs.map((a) => a.u)) - want[2]) < 1e-6, `${at}: the u of the art, edge to edge, no margin`);
      dir.push([foot[1].x - foot[0].x, foot[1].z - foot[0].z]);
    }
    const cos = (dir[0][0] * dir[1][0] + dir[0][1] * dir[1][1]) / (Math.hypot(...dir[0]) * Math.hypot(...dir[1]));
    assert.ok(Math.abs(cos) < 1e-3, `${cellId[i]} ${i}: its two cards cross at a right angle (cos ${cos.toFixed(4)}): it reads from every side`);
  }
  for (let i = 0; i < nrm.length; i += 3) assert.ok(nrm[i] === 0 && nrm[i + 1] === 1 && nrm[i + 2] === 0, 'every normal is up');
  assert.ok(Array.from(col).every((c) => Number.isFinite(c) && c >= 0 && c <= 1.3), 'the vertex colours are a tint: finite and no brighter than the sun lets them be');
  const bb = g.boundingBox; assert.ok(bb.min.x >= -XW && bb.max.x <= XW && bb.max.z <= 219.5 && bb.min.y < SEA - 0.5 && bb.max.y < SEA - 0.1, 'every card is in the water (its top 0.1 m under the still surface), in the bay');
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ the atlas
const FILE = new Uint8Array(decodePng(here('../assets/textures/beach/' + ATLAS.file)).rgba);
/** What a plain box filter makes of the atlas (the sabotage: the baked chain's rival). */
const naiveChain = (px) => {
  const flip = (d, w) => { const o = new Uint8Array(d.length); for (let y = 0; y < w; y++) o.set(d.subarray(y * w * 4, (y + 1) * w * 4), (w - 1 - y) * w * 4); return o; };
  const out = [{ data: flip(px, 512), width: 512, height: 512 }]; let cur = px;
  for (let w = 512; w > 1;) { const h = w >> 1, nx = new Uint8Array(h * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) for (let c = 0; c < 4; c++) nx[(y * h + x) * 4 + c] = Math.round((cur[((2 * y) * w + 2 * x) * 4 + c] + cur[((2 * y) * w + 2 * x + 1) * 4 + c] + cur[((2 * y + 1) * w + 2 * x) * 4 + c] + cur[((2 * y + 1) * w + 2 * x + 1) * 4 + c]) / 4); cur = nx; w = h; out.push({ data: flip(cur, w), width: w, height: w }); }
  return out;
};
/** The share of a cell's texels (cell c of the file's own layout; a level's rows run bottom first) that the material's cut keeps. */
const cover = (lv, c) => { const w = lv.width, cs = w / 2, cx = (c % 2) * cs, cy = w - cs - (c >> 1) * cs; let n = 0; for (let y = 0; y < cs; y++) for (let x = 0; x < cs; x++) if (lv.data[((cy + y) * w + cx + x) * 4 + 3] >= ATLAS.cut) n++; return n / (cs * cs); };

/** An atlas of one-pixel blades (every fourth column of the art kept): what a thin-bladed file would be, and what a plain mip chain loses. */
const thinned = (px) => { const o = Uint8Array.from(px); for (let i = 0; i < ATLAS.size * ATLAS.size; i++) if (i % 4 !== 0) o[i * 4 + 3] = 0; return o; };
const meanRgb = (lv) => { let n = 0; const s = [0, 0, 0]; for (let i = 0; i < lv.data.length; i += 4) if (lv.data[i + 3] >= ATLAS.cut) { n++; s[0] += lv.data[i]; s[1] += lv.data[i + 1]; s[2] += lv.data[i + 2]; } return s.map((v) => v / n); };

test('the atlas is baked for cut-outs: the colour under a clear pixel is its neighbour\'s (no pale rim round a leaf), the alpha is the file\'s, and no level of the mips loses the blades or whitens them', () => {
  const SRC = on('thin') ? thinned(FILE) : FILE, bled = on('nobleed') ? SRC : bleedColour(SRC), size = ATLAS.size;
  let rim = 0, rimWhite = 0, alphaMoved = 0, drawnMoved = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, a = bled[i * 4 + 3];
    if (a !== SRC[i * 4 + 3]) alphaMoved++;
    if (a >= ATLAS.cut) { if (bled[i * 4] !== SRC[i * 4] || bled[i * 4 + 1] !== SRC[i * 4 + 1] || bled[i * 4 + 2] !== SRC[i * 4 + 2]) drawnMoved++; continue; }
    const nb = [x > 0 && i - 1, x < size - 1 && i + 1, y > 0 && i - size, y < size - 1 && i + size].filter((j) => j !== false && SRC[j * 4 + 3] >= ATLAS.cut);
    if (!nb.length) continue;
    rim++;
    if (!nb.some((j) => bled[j * 4] === bled[i * 4] && bled[j * 4 + 1] === bled[i * 4 + 1] && bled[j * 4 + 2] === bled[i * 4 + 2])) rimWhite++;
  }
  assert.equal(alphaMoved, 0, 'the alpha is not touched'); assert.equal(drawnMoved, 0, 'nor the colour of a pixel that is drawn');
  assert.ok(rim > 3000, `the atlas has a rim to bleed into (${rim} clear pixels beside a drawn one)`);
  assert.equal(rimWhite, 0, `no clear pixel beside a drawn one keeps a colour of its own (${rimWhite} of ${rim} do: the file's white, which a filter draws as a pale fringe)`);
  const levels = on('plainmips') ? naiveChain(SRC) : mipChain(bled);
  assert.deepEqual(levels.map((l) => l.width), [512, 256, 128, 64, 32, 16, 8, 4, 2, 1], 'ten levels, down to one pixel');
  assert.ok(levels.every((l) => l.data.length === l.width * l.width * 4), 'each level is RGBA of its size');
  for (let c = 0; c < 3; c++) {
    const base = cover(levels[0], c);
    assert.ok(base > 0.05 && base < 0.6, `cell ${c}: the art covers ${(base * 100).toFixed(0)}% of its cell`);
    for (let k = 1; k <= 5; k++) { const cv = cover(levels[k], c); assert.ok(Math.abs(cv - base) <= 0.1 * base, `cell ${c}, level ${k} (${levels[k].width} px): it keeps ${(cv * 100).toFixed(1)}% of the cell over the cut, the base has ${(base * 100).toFixed(1)}%`); }
  }
  const m0 = meanRgb(levels[0]);
  for (let k = 1; k <= 5; k++) { const m = meanRgb(levels[k]); assert.ok(m.every((v, c) => Math.abs(v - m0[c]) <= 4), `level ${k} (${levels[k].width} px): the drawn texels' mean colour is ${m.map(Math.round)}, the base's is ${m0.map(Math.round)} (the file's white under the clear pixels must not whiten them)`); }
  const top = (lv, w) => lv.data.subarray((w - 1) * w * 4, w * w * 4);                                  // (the last row of a level is the image's first)
  assert.deepEqual(Array.from(top(levels[0], 512)), Array.from(bled.subarray(0, 512 * 4)), 'the base level is the image, its rows bottom first (the texture is not flipped on upload)');
});

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ the loader
const STAND_IN = () => Object.assign(new THREE.DataTexture(new Uint8Array([40, 160, 60, 255]), 1, 1), { needsUpdate: true });
const mkctx = (beach = true) => { const ctx = createContext({ seed: SEED, headless: true }); ctx.plan = plan0; (ctx.world ??= {}); if (beach) ctx.world.beachSea = S; return ctx; };
const groupsOf = (ctx) => ctx.scene.children.filter((o) => o.name === 'props.seabed');

test('the loader: ONE group `props.seabed` of ONE mesh, hidden while the caller warms it, the counters say what was drawn, and a second call adds nothing', async () => {
  const ctx = mkctx(), h = await loadSeabed(ctx, { hidden: true, load: async () => STAND_IN() });
  assert.ok(h && groupsOf(ctx).length === 1 && groupsOf(ctx)[0] === h.group, 'one group, named props.seabed, in the scene');
  assert.equal(h.group.visible, false, 'built hidden when the caller asks (LateWarm shows it once its program is made)');
  if (on('shown')) h.group.visible = true;
  assert.equal(h.group.visible, false, 'and it stays hidden until the caller shows it');
  if (on('twomesh')) h.group.add(new THREE.Mesh(h.geometry, h.material));
  assert.equal(h.group.children.length, 1, 'one child'); assert.ok(h.group.children[0].isMesh && h.group.children[0] === h.mesh, 'a mesh: one draw call');
  let meshes = 0; h.group.traverse((o) => { if (o.isMesh) meshes++; }); assert.equal(meshes, 1, 'and no other mesh below it');
  const ref = planSeabed(coast, S, mkctx().rng.fork('seabed')), tris = h.geometry.index.count / 3;
  assert.deepEqual(ctx.world.seabed, { grass: ref.grass.length, reef: ref.reef.length, tris, calls: 1, failed: [] }, 'ctx.world.seabed = { grass, reef, tris, calls }');
  assert.equal(tris, (ref.grass.length + ref.reef.length) * 4); assert.ok(tris <= 1800, `${tris} triangles`);
  assert.deepEqual(ctx.errors, [], 'no error');
  assert.equal(await loadSeabed(ctx, { load: async () => STAND_IN() }), h, 'a second call is the first one');
  assert.equal(groupsOf(ctx).length, 1, 'still one group');
  const shown = await loadSeabed(mkctx(), { load: async () => STAND_IN() }); assert.equal(shown.group.visible, true, 'without `hidden` the group is shown');
  h.dispose(); assert.equal(groupsOf(ctx).length, 0, 'dispose takes it out of the scene');
});

test('the material: a cut-out of the opaque pass (never blended, so the water is drawn over it), double sided, tinted by the vertices, with the town\'s look uniforms and an upward normal; nothing runs per frame', async () => {
  const ctx = mkctx(), proto = THREE.Material.prototype, was = proto.onBeforeCompile, systems = ctx.systems.length; let seen = 0;
  proto.onBeforeCompile = function spy(shader) { seen++; shader.uniforms.lookSpy = { value: 1 }; };           // (what engine/shaderpatch.js puts on the prototype, for the fog)
  let h; try { h = await loadSeabed(ctx, { load: async () => STAND_IN() }); } finally { proto.onBeforeCompile = was; }
  const m = h.material;
  if (on('blend')) m.transparent = true;
  assert.ok(m.isMeshStandardMaterial && m.map && m.vertexColors === true, 'a standard material, textured, tinted by the vertex colours');
  assert.equal(m.alphaTest, 0.5, 'a cut-out'); assert.equal(m.alphaToCoverage, true, 'its edge softened by the multisample coverage'); assert.equal(m.transparent, false, 'opaque pass: no sorting, and the water (blended, drawn after it) goes over it');
  assert.equal(m.depthWrite, true); assert.equal(m.side, THREE.DoubleSide, 'seen from both sides'); assert.equal(h.mesh.castShadow, false, 'casts no shadow'); assert.equal(h.mesh.receiveShadow, true);
  if (on('hook')) m.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n\tnormal = vec3( 0.0, 1.0, 0.0 );'); };
  const shader = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: 'void main() {\n#include <normal_fragment_begin>\n}' };
  m.onBeforeCompile(shader, null);
  assert.ok(shader.uniforms.lookSpy, 'the hook the town puts on every material ran first (the fog and the sun glow read its uniforms)'); assert.equal(seen, 1);
  assert.match(shader.fragmentShader, /normal = normalize\( \( viewMatrix \* vec4\( 0\.0, 1\.0, 0\.0, 0\.0 \) \)\.xyz \);/, 'every card is lit as if it faced the sky (three flips a back face\'s normal)');
  assert.equal(typeof m.customProgramCacheKey(), 'string'); assert.match(m.customProgramCacheKey(), /seabed/, 'and its program has a key of its own');
  if (on('system')) ctx.systems.push({ name: 'seabed-sway', update() {} });
  assert.equal(ctx.systems.length, systems, 'no per-frame system'); assert.equal(h.mesh.matrixAutoUpdate, false, 'a mesh that is never re-posed');
  assert.ok(h.mesh.onBeforeRender === THREE.Object3D.prototype.onBeforeRender && h.mesh.onBeforeShadow === THREE.Object3D.prototype.onBeforeShadow, 'no hook on the draw');
});

test('a texture that does not come: the loader ends without throwing, the reason is in ctx.errors, nothing is drawn, and the counters say so (and no beach, no seabed)', async () => {
  for (const how of ['rejects', 'throws']) {
    const ctx = mkctx(), warn = console.warn, said = []; console.warn = (...a) => said.push(a.join(' '));
    let r; try { r = await loadSeabed(ctx, { load: how === 'rejects' ? () => Promise.reject(new Error('seabed: cannot load atlas')) : () => { throw new Error('seabed: cannot load atlas'); } }); } finally { console.warn = warn; }
    if (on('silent')) ctx.errors.length = 0;
    if (on('drawn')) ctx.scene.add(Object.assign(new THREE.Group(), { name: 'props.seabed' }));
    assert.equal(r, null, `${how}: it ends (does not throw) and hands back nothing`);
    assert.deepEqual(ctx.errors.map((e) => `${e.stage}: ${e.message}`), ['seabed: seabed: cannot load atlas'], `${how}: the reason is in ctx.errors`);
    assert.equal(said.length, 1, `${how}: and said once on the console`);
    assert.equal(groupsOf(ctx).length, 0, `${how}: nothing is drawn`);
    assert.deepEqual(ctx.world.seabed, { grass: 0, reef: 0, tris: 0, calls: 0, failed: ['seabed: cannot load atlas'] }, `${how}: the counters say nothing was drawn`);
    assert.equal(ctx.seabed, undefined, `${how}: and no handle`);
  }
  const bare = mkctx(false); assert.equal(await loadSeabed(bare, { load: async () => STAND_IN() }), null, 'with no sea in the plan (?skip=coast) there is nothing to dress');
  assert.equal(groupsOf(bare).length, 0); assert.deepEqual(bare.errors, [], 'and that is not an error'); assert.equal(bare.world.seabed, undefined);
});

test('a sea without a coral patch plants no coral and still plants grass (the plan does not need the patch)', () => {
  const sea = on('keepreef') ? S : { ...S, reef: undefined }, p = planSeabed(coast, sea, ctx0.rng.fork('seabed'));
  assert.equal(p.reef.length, 0, 'no patch, no coral'); assert.ok(p.grass.length > 250, `${p.grass.length} tufts of seagrass`);
  assert.deepEqual(p.stats, { grass: p.grass.length, reef: 0, plants: p.grass.length, tris: p.grass.length * 4, calls: 1 });
  const bare = planSeabed(coast, {}, ctx0.rng.fork('seabed')); assert.ok(bare.grass.length > 0 && bare.reef.length === 0, 'and a sea plan with nothing in it does not throw');
});
