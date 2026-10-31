// Trunks wear A1's bark swatches (D04: bark_dark, bark_eucalyptus). The tubes carry UVs in swatch repeats: one wrap round the trunk (u 0..1), the swatch's own proportions (a 1 : 2 eucalyptus swatch is twice as
// tall as it is wide on the trunk), and a v that runs on from the last piece of a trunk to the next so the bark does not restart at every joint. A vertex colour is only a tint on the swatch (flora.js BARK).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-bark.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createContext } from '../js/core/ctx.js';
import { MeshBuilder } from '../js/core/mesh.js';
import { tube } from '../js/world/mk.js';
import { trunk, broadTree, eucalyptus, palm, banana } from '../js/world/flora.js';
import MATDEFS from '../js/world/matdefs.js';

const A = createContext({ seed: 20261029, headless: true });
const TEX = JSON.parse(readFileSync(new URL('../assets/textures/manifest.json', import.meta.url), 'utf8')).textures;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('the trunk materials wear A1\'s swatches, and the swatches are there', () => {
  const want = { bark_trunk: 'bark_dark', bark_euca: 'bark_eucalyptus', bark_palm: 'bark_dark', trunk_banana: 'trunk_banana' };
  for (const [mat, tex] of Object.entries(want)) {
    assert.equal(MATDEFS[mat].tex, tex, `${mat} wears ${tex}`);
    assert.ok(TEX[tex], `${tex} is in the texture manifest`);
    assert.ok(existsSync(new URL('../assets/textures/' + TEX[tex].map, import.meta.url)), `${TEX[tex].map} exists`);
  }
  assert.deepEqual([TEX.bark_eucalyptus.w, TEX.bark_eucalyptus.h, TEX.bark_dark.w, TEX.bark_dark.h], [512, 1024, 512, 512], 'the swatches are 1 : 2 (eucalyptus) and 1 : 1 (dark)');
});

test('tube: a textured tube wraps its swatch once and runs v on from where the last piece ended; without the options the uvs are metres', () => {
  const seg = 8, b = new MeshBuilder();
  tube(b, 'm', [0, 0, 0], [0, 2, 0], 0.2, 0.1, seg, { turns: 1, vper: 4, v0: 0.5, caps: false });
  const uv = b.accs.get('m').uv;                                                                    // per side: the vertex on the first ring, then the one on the second: u, v, u, v
  for (let i = 0; i <= seg; i++) {
    assert.ok(near(uv[4 * i], i / seg) && near(uv[4 * i + 2], i / seg), `side ${i}: u runs 0..1 round the tube (${uv[4 * i]})`);
    assert.ok(near(uv[4 * i + 1], 0.5), `side ${i}: the first ring is at v0`);
    assert.ok(near(uv[4 * i + 3], 0.5 + 2 / 4), `side ${i}: the second ring is a length / vper further on (${uv[4 * i + 3]})`);
  }
  const d = new MeshBuilder();
  tube(d, 'm', [0, 0, 0], [0, 2, 0], 0.2, 0.1, seg, { caps: false });
  const du = d.accs.get('m').uv;
  assert.ok(near(du[4 * seg], 2 * Math.PI * 0.2), 'by default u is the circumference in metres');
  assert.ok(near(du[1], 0) && near(du[3], 2), 'and v the length in metres');
});

test('trunk: the swatch keeps its proportions and a chain of pieces runs on without a restart', () => {
  const pieces = [[[0, 0, 0], [0, 1.5, 0], 0.2, 0.18], [[0, 1.5, 0], [0.1, 3, 0], 0.18, 0.15], [[0.1, 3, 0], [0.1, 4.5, 0.1], 0.15, 0.12]];
  for (const aspect of [1, 2]) {
    const b = new MeshBuilder(), seg = 6, per = 2 * (seg + 1);                                     // vertices per piece without caps
    let v = 0;
    const ends = [];
    for (const [a, c, r0, r1] of pieces) {
      const next = trunk(b, 'm', a, c, r0, r1, seg, { caps: false }, v, aspect);
      ends.push({ from: v, to: next, len: Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), rbar: (r0 + r1) / 2 });
      v = next;
    }
    const uv = b.accs.get('m').uv;
    pieces.forEach((_, k) => {
      const e = ends[k], va = uv[2 * k * per + 1], vc = uv[2 * (k * per + 1) + 1];
      assert.ok(near(va, e.from) && near(vc, e.to), `aspect ${aspect}, piece ${k}: v runs ${e.from.toFixed(3)} .. ${e.to.toFixed(3)} (the mesh has ${va.toFixed(3)} .. ${vc.toFixed(3)})`);
      assert.ok(near((vc - va) * 2 * Math.PI * e.rbar * aspect, e.len, 1e-9), `aspect ${aspect}, piece ${k}: a swatch is ${aspect} circumferences tall`);
      if (k > 0) assert.ok(near(va, uv[2 * ((k - 1) * per + 1) + 1]), `aspect ${aspect}, piece ${k} starts where the piece below ended`);
    });
  }
});

/** Build one tree on its own into a MeshBuilder. */
function grow(tree, salt, o = {}) {
  const b = new MeshBuilder(), K = { b: () => b, H: () => 0, post() {}, occ: { take() {} }, atlas: null };
  tree(K, 0, 0, { rng: A.rng.fork('bark-test:' + salt), ...o });
  return b;
}
const median = (a) => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
const pearson = (x, y) => {
  const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
};

/** For every side triangle of a material (the cap triangles share one normal): how many texels of the swatch lie along a metre of trunk, along over round (1 = the swatch is not stretched). */
function density(b, mat, w, h) {
  const acc = b.accs.get(mat), P = (i) => [acc.pos[3 * i], acc.pos[3 * i + 1], acc.pos[3 * i + 2]], U = (i) => [acc.uv[2 * i], acc.uv[2 * i + 1]], N = (i) => [acc.nor[3 * i], acc.nor[3 * i + 1], acc.nor[3 * i + 2]];
  const sub = (p, q) => p.map((x, k) => x - q[k]), len = (p) => Math.hypot(...p), out = [];
  for (let t = 0; t < acc.idx.length; t += 3) {
    const [i0, i1, i2] = [acc.idx[t], acc.idx[t + 1], acc.idx[t + 2]];
    if ([1, 2].every((k) => N([i0, i1, i2][k]).every((x, c) => near(x, N(i0)[c], 1e-9)))) continue;
    const e1 = sub(P(i1), P(i0)), e2 = sub(P(i2), P(i0)), [du1, dv1] = sub(U(i1), U(i0)), [du2, dv2] = sub(U(i2), U(i0)), det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) continue;
    const pu = len(e1.map((x, k) => (x * dv2 - e2[k] * dv1) / det)), pv = len(e2.map((x, k) => (x * du1 - e1[k] * du2) / det));    // metres per unit of u and of v
    if (pu > 1e-6 && pv > 1e-6) out.push((h / pv) / (w / pu));
  }
  return out;
}

test('a trunk wears its swatch undistorted: one wrap round, as many texels along as round (broadleaf, eucalyptus, palm, banana)', () => {
  const cases = [
    ['broadTree', broadTree, 'bark_trunk', 'bark_dark', {}],
    ['eucalyptus', eucalyptus, 'bark_euca', 'bark_eucalyptus', { h: 14 }],
    ['palm', palm, 'bark_palm', 'bark_dark', { h: 10 }],
    ['banana', banana, 'trunk_banana', 'trunk_banana', {}],
  ];
  for (const [name, tree, mat, tex, o] of cases) {
    for (let i = 0; i < 3; i++) {
      const b = grow(tree, name + i, o), acc = b.accs.get(mat), ratio = median(density(b, mat, TEX[tex].w, TEX[tex].h));
      assert.ok(acc && acc.pos.length > 0, `${name} draws ${mat}`);
      assert.ok(ratio > 0.8 && ratio < 1.25, `${name} ${i}: the median texel density along the trunk over round is ${ratio.toFixed(2)} (1 = not stretched)`);
      let uMax = -Infinity; for (let k = 0; k < acc.uv.length; k += 2) uMax = Math.max(uMax, acc.uv[k]);
      assert.ok(uMax <= 1 + 1e-9 && uMax > 0.9, `${name} ${i}: the swatch wraps once round (u tops out at ${uMax.toFixed(2)})`);
    }
  }
});

/** The middle of the ring a piece of a chain of tubes starts on (`end` false) or ends on: the mean of the ring's distinct rim vertices, the axis point, as the rim is regular. A piece of `seg` sides is 2 (seg + 1) vertices: a bottom and a top for each rim vertex. */
const ringAt = (acc, piece, seg, end) => {
  const c = [0, 0, 0], first = piece * 2 * (seg + 1);
  for (let i = 0; i < seg; i++) { const k = first + 2 * i + (end ? 1 : 0); for (let a = 0; a < 3; a++) c[a] += acc.pos[3 * k + a] / seg; }
  return c;
};

test('a trunk is one column: every piece starts where the one below it ended (no gap above the foot, no step at a joint)', () => {
  for (const [name, tree, mat, seg, pieces, o] of [['palm', palm, 'bark_palm', 6, Math.ceil(10 / 0.8), { h: 10 }], ['eucalyptus', eucalyptus, 'bark_euca', 7, Math.max(5, Math.round(14 / 2.3)), { h: 14 }]]) {
    for (let i = 0; i < 3; i++) {
      const acc = grow(tree, 'column-' + name + i, o).accs.get(mat);
      for (let k = 0; k + 1 < pieces; k++) {
        const top = ringAt(acc, k, seg, true), next = ringAt(acc, k + 1, seg, false), gap = Math.hypot(top[0] - next[0], top[1] - next[1], top[2] - next[2]);
        assert.ok(gap < 1e-6, `${name} ${i}: piece ${k + 1} starts ${gap.toFixed(2)} m from where piece ${k} ended`);
      }
      assert.ok(ringAt(acc, 0, seg, false)[1] < -0.1, `${name} ${i}: the foot is sunk into the ground, not standing on it`);
    }
  }
});

test('the bark runs on up a trunk: v climbs with the height, the pieces do not each start the swatch again', () => {
  for (const [name, tree, mat, o, below] of [['eucalyptus', eucalyptus, 'bark_euca', { h: 14 }, 7.6], ['palm', palm, 'bark_palm', { h: 10 }, 99], ['banana', banana, 'trunk_banana', {}, 99]]) {   // below: the euca's limbs start again at v 0
    for (let i = 0; i < 3; i++) {
      const b = grow(tree, 'chain-' + name + i, o), acc = b.accs.get(mat), ys = [], vs = [];
      for (let k = 0; k < acc.pos.length / 3; k++) if (acc.pos[3 * k + 1] < below && Math.abs(acc.nor[3 * k + 1]) < 0.5) { ys.push(acc.pos[3 * k + 1]); vs.push(acc.uv[2 * k + 1]); }      // sides only: a cap's uv is planar
      assert.ok(ys.length > 40, `${name} ${i}: ${ys.length} vertices of trunk`);
      assert.ok(pearson(ys, vs) > 0.97, `${name} ${i}: v follows the height (correlation ${pearson(ys, vs).toFixed(2)}; a sawtooth if every piece starts again)`);
    }
  }
});
