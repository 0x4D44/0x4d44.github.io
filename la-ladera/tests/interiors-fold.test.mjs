// INTERIORS draw-call diet under Node (no browser): the rare materials are drawn with a neighbour's material (js/interiors/fold.js), so an interior costs about
// 15 draw calls instead of 26, the closed container fronts still point at their own triangles, and a folded material keeps its colour.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-fold.test.mjs      (real plans: ~30 s)
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch } from './interiors-lib.mjs';
import { buildInterior } from '../js/interiors/build.js';
import { FOLD, RATIO, AVG, foldMaterials } from '../js/interiors/fold.js';
import { ALL_DEFS } from '../js/core/matlib.js';
import { MeshBuilder } from '../js/core/mesh.js';

const { ctx, bps } = await furnishedBatch({ real: true });
const stub = new Map();
ctx.mat = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };
for (const bp of bps) buildInterior(ctx, bp);
const groupOf = (bp) => ctx.batch.groups.get(`${bp.id}.int`);
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgbLin = (hex) => [lin((hex >> 16) & 255), lin((hex >> 8) & 255), lin(hex & 255)];

test('the fold table is one step: both materials exist, no target is itself folded away, every coloured one has an average', () => {
  const problems = [];
  for (const [from, to] of Object.entries(FOLD)) {
    if (!ALL_DEFS[from]) problems.push(`${from}: not a material`);
    if (!ALL_DEFS[to]) problems.push(`${from} -> ${to}: the target is not a material`);
    if (FOLD[to]) problems.push(`${from} -> ${to}: the target is folded away too (chains break the front ranges)`);
    const emissive = ALL_DEFS[from]?.emissive != null;
    if (!emissive && (AVG[from] == null || (AVG[to] == null))) problems.push(`${from} -> ${to}: no average colour for the pair (needed to keep the colour)`);
    if (emissive && ALL_DEFS[to]?.emissive == null) problems.push(`${from} -> ${to}: an emissive material folded into a non-emissive one goes dark`);
    if (ALL_DEFS[from]?.side === 'double' && ALL_DEFS[to]?.side !== 'double') problems.push(`${from} -> ${to}: a double-sided material folded into a one-sided one loses its back faces`);
    if (ALL_DEFS[from]?.alpha != null && ALL_DEFS[from].alpha < 1) problems.push(`${from}: a transparent material cannot be folded`);
  }
  assert.equal(problems.length, 0, problems.join('\n'));
});

test('a folded material keeps the colour on screen: target average x factor = original average (linear)', () => {
  for (const [from, [to, r, g, b]] of Object.entries(RATIO)) {
    if (AVG[from] == null) continue;
    const want = rgbLin(AVG[from]), got = rgbLin(AVG[to]).map((v, i) => v * [r, g, b][i]);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(want[i] - got[i]) < 1e-9, `${from} -> ${to} channel ${i}: ${got[i]} vs ${want[i]}`);
  }
  // and on real geometry: a wood_dark box tinted 0x808080 reaches the pine mesh with the tint times the factor
  const b = new MeshBuilder();
  b.box('wood_dark', 0, 0.5, 0, 1, 1, 1, { col: 0x808080 });
  b.box('wood_pine', 3, 0.5, 0, 1, 1, 1, { col: 0xffffff });
  const before = b.accs.get('wood_dark').col.slice(), pine0 = b.accs.get('wood_pine').col.length;
  assert.equal(foldMaterials(b), 1);
  assert.equal(b.accs.has('wood_dark'), false, 'the folded material has no mesh of its own any more');
  const t = b.accs.get('wood_pine'), [, fr, fg, fb] = RATIO.wood_dark;
  assert.equal(t.col.length, pine0 + before.length);
  for (let i = 0; i < before.length; i += 3) {
    assert.ok(Math.abs(t.col[pine0 + i] - before[i] * fr) < 1e-9 && Math.abs(t.col[pine0 + i + 1] - before[i + 1] * fg) < 1e-9 && Math.abs(t.col[pine0 + i + 2] - before[i + 2] * fb) < 1e-9, 'moved vertices carry tint x factor');
  }
  for (let i = 0; i < pine0; i++) assert.equal(t.col[i], 1, 'the target keeps its own colours');
});

test('the front ranges move with their triangles (synthetic): same positions, same triangles, in the target mesh', () => {
  const b = new MeshBuilder();
  b.box('wood_pine', 3, 0.5, 0, 1, 1, 1);                                        // the target already has geometry
  b.box('wood_dark', 0, 0.5, 0, 1, 1, 1);                                        // the front, in a material that folds
  const dark = b.accs.get('wood_dark'), posBefore = dark.pos.slice(), nIdx = dark.idx.length;
  b.fronts = [{ ranges: [{ key: 'wood_dark', from: 0, to: nIdx }] }];
  const i0 = b.accs.get('wood_pine').idx.length;
  foldMaterials(b);
  const r = b.fronts[0].ranges[0], t = b.accs.get('wood_pine');
  assert.equal(r.key, 'wood_pine'); assert.equal(r.from, i0); assert.equal(r.to, i0 + nIdx);
  const used = new Set(t.idx.slice(r.from, r.to));
  const got = []; for (const i of [...used].sort((x, y) => x - y)) got.push(t.pos[i * 3], t.pos[i * 3 + 1], t.pos[i * 3 + 2]);
  const want = []; const seen = new Set(dark.idx); for (const i of [...seen].sort((x, y) => x - y)) want.push(posBefore[i * 3], posBefore[i * 3 + 1], posBefore[i * 3 + 2]);
  assert.deepEqual(got, want, 'the range reaches exactly the front\'s own vertices');
});

test('real plans: an interior is at most 20 meshes, the barrio\'s mean at most 16 (it was 25.6), and no folded material keeps a mesh', () => {
  const rows = bps.map((bp) => ({ id: bp.id, n: groupOf(bp)?.meshes.length ?? 0, keys: (groupOf(bp)?.meshes ?? []).map((m) => m.userData.matKey) }));
  const mean = rows.reduce((a, r) => a + r.n, 0) / rows.length;
  const worst = rows.slice().sort((a, b) => b.n - a.n)[0];
  console.log(`# folded interiors: ${rows.length} buildings, ${rows.reduce((a, r) => a + r.n, 0)} meshes, mean ${mean.toFixed(1)}, max ${worst.n} (${worst.id}), median ${rows.map((r) => r.n).sort((a, b) => a - b)[rows.length >> 1]}`);
  assert.ok(worst.n <= 20, `${worst.id}: ${worst.n} meshes: ${worst.keys.join(' ')}`);
  assert.ok(mean <= 16, `mean ${mean.toFixed(1)} meshes per interior`);
  const left = rows.flatMap((r) => r.keys.filter((k) => FOLD[k]).map((k) => `${r.id}:${k}`));
  assert.equal(left.length, 0, `folded materials still have meshes: ${left.slice(0, 6).join(', ')}`);
});

test('real plans: every container front range reaches whole, live triangles of an existing mesh', () => {
  let ranges = 0; const problems = [];
  for (const bp of bps) {
    const g = groupOf(bp), fronts = g?.builder?.fronts ?? [], meshes = new Map((g?.meshes ?? []).map((m) => [m.userData.matKey, m]));
    for (const f of fronts) for (const r of f.ranges) {
      ranges++;
      const m = meshes.get(r.key), ix = m?.geometry.index;
      if (!ix) { problems.push(`${bp.id} ${f.rec}: range key '${r.key}' has no mesh`); continue; }
      if (!(r.from >= 0 && r.to <= ix.count && r.to > r.from && (r.to - r.from) % 3 === 0 && r.from % 3 === 0)) { problems.push(`${bp.id} ${f.rec}: range ${r.key} [${r.from}, ${r.to}) vs ${ix.count} indices`); continue; }
      for (let i = r.from; i < r.to; i += 3) if (ix.array[i] === ix.array[i + 1] || ix.array[i + 1] === ix.array[i + 2]) { problems.push(`${bp.id} ${f.rec}: a degenerate triangle inside ${r.key} [${r.from}, ${r.to})`); break; }
      // ... and they are THIS front's triangles: every vertex within reach of the front's pivot (a door is at most 0.9 m wide and 2.1 m tall, a drawer front 1.2 m wide)
      const [px, py, pz] = bp.frame.toWorld(...f.piv), pos = m.geometry.attributes.position.array;
      let far = 0;
      for (let i = r.from; i < r.to && !far; i++) { const v = ix.array[i] * 3; if (Math.hypot(pos[v] - px, pos[v + 2] - pz) > 1.3 || pos[v + 1] < py - 0.7 || pos[v + 1] > py + 2.4) far = 1; }
      if (far) problems.push(`${bp.id} ${f.rec}: range ${r.key} [${r.from}, ${r.to}) reaches geometry far from the front (pivot ${px.toFixed(1)}, ${py.toFixed(1)}, ${pz.toFixed(1)})`);
    }
  }
  console.log(`# front ranges checked: ${ranges}`);
  assert.ok(ranges > 3000, `only ${ranges} front ranges: the real plans lost their containers?`);
  assert.equal(problems.length, 0, problems.slice(0, 8).join('\n'));
});
