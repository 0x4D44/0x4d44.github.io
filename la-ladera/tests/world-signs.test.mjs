// The outdoor signage (js/world/signs.js) under node. There is no canvas here, so a recording stand-in runs the REAL painters and the real atlas code: every sign key has
// exactly one region (a key without one was a TypeError in the page, a console error: hard cap C1), the regions do not overlap, every painter runs; the three murals are
// planned on real walls (no overlap, 3 m tall, under the cap, not across a dip or a corner); and every sign quad the world builds points into a painted region.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-signs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildOccupancy } from '../js/world/occupancy.js';
import { makeKit } from '../js/world/kit.js';
import { buildBoundary } from '../js/world/periphery.js';
import { makeSignAtlas, buildSigns, planMurals, claimMurals, signKeys, muralKeys, edgeMuralKeys, EDGE_MURAL_ASPECT } from '../js/world/signs.js';
import { SEED } from './world-lib.mjs';

/** A canvas that only records the clip rectangles, the text and the scales: every other method is a no-op (gradients and text metrics answer), getImageData hands back opaque white. */
function stubCanvas(w, h, log) {
  const props = {};
  const g = new Proxy(props, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 11 });
      if (k === 'getImageData') return (x, y, ww, hh) => ({ data: new Uint8ClampedArray(ww * hh * 4).fill(255) });
      return (...a) => { if (k === 'rect' || k === 'fillText' || k === 'scale') (log[k] ??= []).push(a); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { width: w, height: h, getContext: () => g };
}
/** Runs fn with `OffscreenCanvas` standing in for a canvas, then takes it away again. Returns [result, log]. */
function withCanvas(fn) {
  const log = {}, had = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
  globalThis.OffscreenCanvas = class { constructor(w, h) { Object.assign(this, stubCanvas(w, h, log)); } };
  try { return [fn(), log]; } finally { if (had) Object.defineProperty(globalThis, 'OffscreenCanvas', had); else delete globalThis.OffscreenCanvas; }
}

const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
/** Names of the keys whose rectangles are not a real sub-rectangle of the unit square, and pairs that overlap. */
function regionProblems(keys, uv) {
  const bad = [];
  keys.forEach((k, i) => {
    const r = uv(k);
    if (!r.every(Number.isFinite) || r[0] < 0 || r[1] < 0 || r[2] > 1 || r[3] > 1 || r[0] >= r[2] || r[1] >= r[3]) bad.push(`${k}: ${r}`);
    for (let j = i + 1; j < keys.length; j++) if (overlap(r, uv(keys[j]))) bad.push(`${k} overlaps ${keys[j]}`);
  });
  return bad;
}

const { plan } = (() => { const ctx = createContext({ seed: SEED, headless: true }); return { ctx, plan: generatePlan(ctx) }; })();

test('every sign key has one region of the atlas, regions do not overlap, and the real painters run on them (TEETH: a key without a region is named, not a TypeError)', () => {
  delete makeSignAtlas.errors;
  const [atlas, log] = withCanvas(() => makeSignAtlas(plan, []));
  assert.ok(atlas?.mural, 'an atlas and a mural atlas came back');
  assert.equal(makeSignAtlas.errors, undefined, `painter or region errors: ${makeSignAtlas.errors}`);
  const keys = signKeys(plan), mkeys = muralKeys(), ekeys = edgeMuralKeys();
  assert.ok(keys.includes('gate.in') && keys.includes('rayuela') && keys.filter((k) => k.startsWith('plaque.')).length === plan.streets.length && mkeys.length === 3, keys.join(' '));
  assert.ok(ekeys.length === 4 && ekeys.every((k) => k.startsWith('edge.') && !mkeys.includes(k)) && new Set(ekeys).size === 4, `the perimeter wall has four paintings of its own (R1-106): ${ekeys}`);
  assert.equal(log.rect.length, keys.length + mkeys.length + ekeys.length, 'one clipped region painted per key');
  assert.ok(log.fillText.length >= keys.length + 3 + 4, `${log.fillText.length} pieces of lettering painted`);
  assert.deepEqual(regionProblems(keys, atlas.uv), []);
  assert.deepEqual(regionProblems([...mkeys, ...ekeys], atlas.mural.uv), []);
  assert.equal(EDGE_MURAL_ASPECT, 2, 'the wall hangs every one of its paintings 2:1');
  for (const k of ekeys) { const [u0, v0, u1, v1] = atlas.mural.uv(k), W = 1024, H = 2080; assert.ok(Math.abs((u1 - u0) * W / ((v1 - v0) * H) - EDGE_MURAL_ASPECT) < 0.02, `${k}: its region is 2:1`); }
  assert.throws(() => atlas.uv('plaque.99'), /no region for "plaque.99"/);
  assert.throws(() => atlas.mural.uv('mural.nope'), /no region for "mural.nope"/);
  assert.throws(() => atlas.uv('mural.condor'), /no region/, 'a mural is not on the boards atlas');
  assert.equal(regionProblems(['a', 'b'], (k) => (k === 'a' ? [0, 0, 0.5, 0.5] : [0.4, 0.4, 1, 1])).length, 1, 'TEETH: two overlapping rectangles are reported');
  assert.equal(regionProblems(['a'], () => [0.5, 0.5, 0.5, 0.9]).length, 1, 'TEETH: an empty rectangle is reported');
});

test('a painting on a wall squarer than 2:1 shows the middle of its scene, cropped and not squeezed; a 2:1 wall (or no wall) shows all of it', () => {
  const scales = (shapes) => withCanvas(() => makeSignAtlas(plan, shapes))[1].scale.map((a) => +a[0].toFixed(3));   // the horizontal scale of each picture: 1024 px over the part of the 640 px scene it shows
  assert.deepEqual(scales([]), [1.6, 1.6, 1.6]);
  assert.deepEqual(scales([{ W: 6.4, h: 3.2 }, { W: 7.0, h: 3.2 }, { W: 4.0, h: 3.5 }]), [1.6, 1.6, +(1024 / (320 * 4.0 / 3.5)).toFixed(3)], 'only the 4.0 x 3.5 m wall crops (to 366 px of the scene)');
  assert.deepEqual(scales([{ W: 3.6, h: 3.6 }]).slice(0, 1), [3.2], 'a square wall shows 320 px, the most it ever crops');
});

test('every sign key the world code names is painted: hand.*, gate.*, mural.*, rayuela (TEETH: the scan sees the code and a made-up key would be caught)', () => {
  const dir = new URL('../js/world/', import.meta.url), found = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/['"`]((?:hand|gate|mural|edge)\.[a-z]+|rayuela)['"`]/g)) found.set(m[1], f);
  }
  const have = new Set([...signKeys(plan), ...muralKeys(), ...edgeMuralKeys()]);
  assert.deepEqual([...found].filter(([k]) => !have.has(k)), [], 'a key the code uses has no region');
  assert.ok(found.size >= 9 && found.has('hand.huerta') && found.has('mural.cerro') && found.has('gate.out'), `${found.size} literals found: ${[...found.keys()].join(' ')}`);
  assert.equal(have.has('hand.nope'), false);
});

// ------------------------------------------------------------------------------------------------ planning the murals on synthetic walls
/** A straight cut wall `len` m long (a sample a metre), cap height hOf(i) over a street edge at 0 and a normal pointing -z; the wall face looks +z. */
const wall = (len, hOf = () => 4.0, turn = 0) => ({
  sign: 1, src: 'street', tall: 5,
  S: Array.from({ length: Math.round(len) + 1 }, (_, i) => { const a = turn * i / len; return { x: i, z: 0, nx: Math.sin(a), nz: -Math.cos(a), W: 3, inner: 0, outer: hOf(i) }; }),
});
const on = (...runs) => ({ ctx: { world: { wallRuns: runs } } });
const spans = (ws) => ws.map((p) => [p.d0, p.d0 + p.W]).sort((a, b) => a[0] - b[0]);

test('planMurals: three paintings on a long tall wall, apart, each 3 m and taller, under the cap, no flatter than 2.2 : 1', () => {
  const ws = planMurals(on(wall(40)));
  assert.equal(ws.length, 3);
  const sp = spans(ws);
  for (let i = 1; i < sp.length; i++) assert.ok(sp[i][0] >= sp[i - 1][1] + 0.3 - 1e-9, `paintings ${i - 1} and ${i} are 0.3 m apart: ${JSON.stringify(sp)}`);
  for (const p of ws) {
    assert.ok(p.W <= 8.0001 && p.h >= 3 && p.W / p.h <= 2.2001 && p.h <= 4.0 - 0.03 - 0.35 + 1e-9, `${p.W} x ${p.h}`);
    assert.equal(p.pts.length, Math.round(p.W / 0.5) + 1);
  }
  assert.deepEqual(ws.map((p) => p.area), ws.map((p) => p.area).sort((a, b) => b - a), 'largest first');
});

test('planMurals: a wall gives as many paintings as fit (more paintings before more paint), and none when it is too low or too short', () => {
  assert.equal(planMurals(on(wall(10))).length, 2, '3.6 + 0.3 + 3.6 m fits in 10 m, a third does not');
  assert.equal(planMurals(on(wall(7))).length, 1, 'two need 7.5 m');
  assert.equal(planMurals(on(wall(3))).length, 0, 'under 3.6 m');
  assert.equal(planMurals(on(wall(40, () => 3.3))).length, 0, 'a 3.3 m wall leaves 2.92 m: under 3 m');
  assert.equal(planMurals(on(wall(40, () => 3.4))).length, 3, 'a 3.4 m wall leaves 3.02 m');
  assert.equal(planMurals(on({ ...wall(40), sign: -1 })).length, 0, 'a fill wall faces away from the street');
  assert.equal(planMurals(on({ ...wall(40), src: 'pad' })).length, 0, 'a lot wall is not on a street');
  assert.equal(planMurals(on(wall(20), wall(20))).length, 3, 'two walls share the paintings (and two runs may overlap in space: only the same run is checked)');
  assert.ok(planMurals(on(wall(20), wall(20))).every((p) => p.pts.every((q) => q.front === 0 && !q.hit)), 'a wall on the same line is not in front of the painting');
});

test('planMurals: never across a dip in the wall (TEETH: the same wall without the dip takes a painting there)', () => {
  const dip = (i) => (i >= 14 && i <= 16 ? 2.5 : 4.0);                  // the wall is under 3.38 m (3 m of painting + the foot and the cap margin) for x 13.41 .. 16.59
  const ws = planMurals(on(wall(30, dip)));
  assert.equal(ws.length, 3);
  for (const p of ws) assert.ok(p.d0 + p.W <= 13.42 || p.d0 >= 16.58, `a painting spans the dip: ${p.d0}..${p.d0 + p.W}`);
  assert.ok(spans(planMurals(on(wall(30)))).some(([a, b]) => a < 16 && b > 14), 'TEETH: without the dip a painting does cover x 14..16');
});

test('planMurals: a painting follows a gentle bend but never a sharp corner (TEETH: the same wall straightened is taken, the corner is refused)', () => {
  const gentle = planMurals(on(wall(40, () => 4.0, Math.PI / 2)));                // a quarter turn in 40 m: 2.25 degrees a metre
  assert.equal(gentle.length, 3);
  for (const p of gentle) {
    const mx = p.pts.reduce((s, q) => s + q.nx, 0), mz = p.pts.reduce((s, q) => s + q.nz, 0), ml = Math.hypot(mx, mz);
    assert.ok(p.pts.every((q) => (q.nx * mx + q.nz * mz) / ml >= 0.95 - 1e-9), `a painting of ${p.W} m turns more than 18 degrees off its mean direction`);
  }
  assert.equal(planMurals(on(wall(16, () => 4.0, Math.PI))).length, 0, 'a half turn in 16 m (11 degrees a metre): no 3.6 m stretch is straight enough');
  assert.equal(planMurals(on(wall(16))).length, 3, 'TEETH: the straight 16 m wall takes three');
});

test('planMurals: a step in the ground along the wall (a stair) stops a painting; a steady slope does not', () => {
  const stepWall = wall(30); stepWall.S.forEach((s, i) => { if (i >= 15) { s.inner = 1.2; s.outer += 1.2; } });
  const ws = planMurals(on(stepWall));
  assert.equal(ws.length, 3);
  for (const p of ws) assert.ok(p.d0 + p.W <= 14.3 || p.d0 >= 14.7, `a painting runs over the 1.2 m step: ${p.d0}..${p.d0 + p.W}`);
  const ramp = wall(30); ramp.S.forEach((s, i) => { s.inner = i * 0.1; s.outer = s.inner + 4.0; });   // a steady 10 % street: 0.05 m per 0.5 m
  assert.equal(planMurals(on(ramp)).length, 3, 'a street that climbs 10 % along the wall still takes paintings');
  const climb = planMurals(on(ramp))[0];
  assert.ok(climb.pts[climb.pts.length - 1].y - climb.pts[0].y > 0.5, 'the painting climbs with the street');
});

/** A lot pad's fill wall in front of a street wall made by wall(): its face stands `gap` m on the street side of the street wall's face, `top` m high (face at the sample + n * W: z = gap). */
const padWall = (len, gap, top) => ({ sign: -1, src: 'pad', tall: 2, S: Array.from({ length: Math.round(len) + 1 }, (_, i) => ({ x: i, z: gap - 1, nx: 0, nz: 1, W: 1, inner: top - 0.02, outer: 0 })) });

test('planMurals: a jog in a lot wall BETWEEN two points of a painting is hung in front of too (TEETH: looking at the wall only at the points leaves its corner through the paint, the condor\'s seam)', () => {
  const street = wall(40), first = planMurals(on(street, padWall(40, 0.3, 4.2)))[0];
  const j = [4, 5, 3, 6].find((i) => { const f = ((first.pts[i].x + first.pts[i + 1].x) / 2) % 1; return f > 0.1 && f < 0.9; }), mid = (first.pts[j].x + first.pts[j + 1].x) / 2;   // the middle of one strip of the biggest painting, clear of a sample of the lot wall
  const jut = padWall(40, 0.3, 4.2), k = jut.S.findIndex((s) => s.x > mid), base = jut.S[k - 1];
  jut.S.splice(k, 0, ...[[-0.045, 0], [-0.04, 0.2], [0.04, 0.2], [0.045, 0]].map(([dx, up]) => ({ ...base, x: mid + dx, z: base.z + up })));   // an 8 cm pier standing 20 cm proud of the lot wall's face, between two points of the painting
  const [p] = planMurals(on(street, jut));
  assert.deepEqual([p.d0, p.W], [first.d0, first.W], 'the pier changes no height, so the same window is chosen');
  const q = p.pts.findIndex((s, i) => s.x <= mid && p.pts[i + 1].x >= mid), a = p.pts[q], b = p.pts[q + 1], chord = a.z + (b.z - a.z) * ((mid - a.x) / (b.x - a.x));
  assert.ok(chord >= 0.5 + 0.005, `the strip passes ${(chord - 0.5).toFixed(3)} m in front of the pier (0.5 m out of the street wall)`);
  assert.ok(first.pts.every((s) => Math.abs(s.front - 0.3) < 1e-6), 'TEETH: without the jog the painting hangs on the plain lot wall (0.3 m)');
});

test('claimMurals: two paintings side by side keep the whole street in front of both, the later row shrinking where it meets the first (TEETH: a refused disc left a gap)', () => {
  const discs = [], occ = {
    take(x, z, r) { if (occ.overlaps(x, z, r)) return false; discs.push([x, z, r]); return true; },
    overlaps(x, z, r) { return discs.some(([a, c, d]) => Math.hypot(a - x, c - z) < d + r); },
  };
  const m = (vx) => ({ W: 6, vx, vz: 0, ox: 0, oz: 1 });                                   // they look +z, so a row runs along +x; three discs of 0.98 m each at 2 m
  claimMurals({ murals: [m(0), m(5.7)], occ });                                             // the second row's first disc (x = 3.7) is 1.7 m from the first row's last (x = 2): too close at 0.98
  for (let x = -2.5; x <= 8.5 + 1e-9; x += 0.4) assert.ok(occ.overlaps(x, 0, 0.3), `x = ${x.toFixed(1)} m of the street in front of the pair is open`);
  assert.ok(discs.some(([x, , r]) => Math.abs(x - 3.7) < 1e-9 && r < 0.98 - 1e-9), 'the disc where the rows meet shrank to fit');
  assert.equal(discs.length, 6);
});

test('planMurals: a painting hangs in front of a lot wall that stands before the street wall, and under its cap (TEETH: without that wall it hangs on the street wall; a kerb under the painting is ignored)', () => {
  const street = wall(40), pad = padWall(40, 0.3, 4.2);
  const ws = planMurals(on(street, pad));
  assert.equal(ws.length, 3);
  for (const p of ws) {
    for (const q of p.pts) {
      assert.ok(Math.abs(q.front - 0.3) < 1e-6 && q.hit.length === 1 && q.hit[0] === pad, `front ${q.front}, hit ${q.hit?.length}`);
      assert.ok(Math.abs(q.z - (0.3 + 0.045)) < 1e-6, `hung ${q.z} m from the street wall face: 4.5 cm in front of the lot wall`);
      assert.ok(q.cap <= 4.0 + 1e-9, 'a lot wall taller than the street wall does not raise the top');
    }
  }
  assert.ok(planMurals(on(street)).every((p) => p.pts.every((q) => q.front === 0 && !q.hit && Math.abs(q.z - 0.045) < 1e-6)), 'TEETH: with no lot wall the painting hangs 4.5 cm off the street wall');
  const low = planMurals(on(street, padWall(40, 0.3, 3.9)));
  assert.equal(low.length, 3);
  for (const p of low) assert.ok(p.h <= 3.88 - 0.03 - 0.35 + 1e-9 && p.pts.every((q) => Math.abs(q.cap - 3.88) < 1e-9), `a lot wall that stops at 3.9 m lowers the top: ${p.h}`);
  const kerb = planMurals(on(street, padWall(40, 0.3, 0.3)));
  assert.equal(kerb.length, 3, 'a 30 cm kerb does not stop the paintings (it would cap them at 0.28 m)');
  assert.ok(kerb.every((p) => p.pts.every((q) => q.front === 0 && !q.hit)), 'a 30 cm kerb is under the painting: ignored');
  const far = planMurals(on(street, padWall(40, 1.5, 4.2)));
  assert.equal(far.length, 3);
  assert.ok(far.every((p) => p.pts.every((q) => q.front === 0)), 'a wall more than 1.2 m away is another street, not this wall\'s lot');
});

// ------------------------------------------------------------------------------------------------ the real world with the real atlas
test('with the atlas painted, every sign and mural quad the world builds points into a painted region, and each mural uses all of its region', async () => {
  const ctx = createContext({ seed: SEED, headless: true });
  ctx.plan = generatePlan(ctx);
  ctx.physics.setTerrain(ctx.plan.heightAt);
  await buildWorld(ctx);
  ctx.world.occ = buildOccupancy(ctx.plan, ctx.buildings);
  const K = makeKit(ctx, ctx.plan, ctx.world.occ);
  K.murals = planMurals(K);
  assert.equal(K.murals.length, 3);
  const band = (m) => { const out = []; for (let t = -m.W / 2 + 0.4; t <= m.W / 2 - 0.4 + 1e-9; t += 0.4) out.push([m.vx + m.oz * t, m.vz - m.ox * t]); return out; };   // the street 2.4 m in front of the painting, along its width
  const gaps = () => K.murals.flatMap((m) => band(m).filter(([x, z]) => !K.occ.overlaps(x, z, 0.3))).length, points = K.murals.flatMap(band).length;
  assert.equal(gaps(), points, 'nothing stands in front of the paintings before they claim their ground (TEETH: the band test sees an empty street)');
  claimMurals(K);
  assert.equal(gaps(), 0, 'claimMurals keeps the whole street in front of every painting open, the viewer\'s spot included, before the poles, vehicles and trees');
  assert.ok(K.murals.every((m) => K.occ.overlaps(m.vx, m.vz, 0.3)), 'the viewer\'s spot (the middle) is covered');
  delete makeSignAtlas.errors;
  const [atlas] = withCanvas(() => makeSignAtlas(ctx.plan, K.murals));
  assert.equal(makeSignAtlas.errors, undefined);
  K.signs = atlas;
  buildBoundary(K);                                                   // the welcome arch the boards hang on
  const stats = buildSigns(K);
  assert.equal(stats.murals, 3); assert.equal(stats.boards, 2); assert.ok(stats.plaques >= 12 && stats.hopscotch === 1, JSON.stringify(stats));
  ctx.batch.flushAll();
  const uvs = (mat) => { const out = []; ctx.scene.traverse((o) => { if (o.isMesh && o.material === mat) { const a = o.geometry.getAttribute('uv'); for (let i = 0; i < a.count; i++) out.push([a.getX(i), a.getY(i)]); } }); return out; };
  const inside = (q, r) => q[0] >= r[0] - 1e-6 && q[0] <= r[2] + 1e-6 && q[1] >= r[1] - 1e-6 && q[1] <= r[3] + 1e-6;
  const board = signKeys(ctx.plan).map((k) => atlas.uv(k)), signUV = uvs(ctx.mat('world_sign'));
  assert.ok(signUV.length >= 100, `${signUV.length} sign vertices`);
  assert.deepEqual(signUV.filter((q) => !board.some((r) => inside(q, r))).slice(0, 3), [], 'every board vertex lies in a painted region');
  const murals = muralKeys().map((k) => atlas.mural.uv(k)), edges = edgeMuralKeys().map((k) => atlas.mural.uv(k)), muralUV = uvs(ctx.mat('world_mural'));
  assert.deepEqual(muralUV.filter((q) => ![...murals, ...edges].some((r) => inside(q, r))).slice(0, 3), [], 'every mural vertex lies in a painted region');
  const reachOf = (r) => { const mine = muralUV.filter((q) => inside(q, r)); return [Math.min(...mine.map((q) => q[0])) - r[0], r[2] - Math.max(...mine.map((q) => q[0])), Math.min(...mine.map((q) => q[1])) - r[1], r[3] - Math.max(...mine.map((q) => q[1]))]; };
  for (const [i, r] of murals.entries()) assert.ok(reachOf(r).every((d) => Math.abs(d) < 1e-6), `mural ${i} shows its whole region: ${reachOf(r)}`);
  // R1-106: the perimeter wall (edgewall.js, built by buildBoundary above) hangs its own paintings: each one it uses shows its whole region, and it uses more than one
  const used = edges.filter((r) => muralUV.some((q) => inside(q, r)));
  assert.ok(used.length >= 2, `${used.length} of the perimeter wall's own paintings are hung`);
  for (const r of used) assert.ok(reachOf(r).every((d) => Math.abs(d) < 1e-6), `a perimeter painting shows its whole region: ${reachOf(r)}`);
});
