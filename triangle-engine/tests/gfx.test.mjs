// The renderer core is the page's factual claim: if these fail, the
// pictures are lying. Everything here is checked against the closed-form
// answer, not against a previous run.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(await readFile(resolve(PROJECT, "gfx.js"), "utf8"), sandbox, { filename: "gfx.js" });
const G = sandbox.window.TRI_GFX;

const close = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} to be within ${eps} of ${b}`);
const closeVec = (a, b, eps = 1e-9) => {
  assert.equal(a.length >= b.length, true);
  b.forEach((value, i) => close(a[i], value, eps));
};

test("matrix multiplication composes in the order the API promises", () => {
  const t = G.translation(3, 0, 0);
  const s = G.scaling(2, 2, 2);
  // apply(multiply(a, b), v) must equal apply(a, apply(b, v)).
  const composed = G.apply(G.multiply(t, s), [1, 1, 1, 1]);
  const stepwise = G.apply(t, G.apply(s, [1, 1, 1, 1]));
  closeVec(composed, stepwise);
  // Scale first, then translate: the translation is NOT scaled.
  closeVec(composed, [5, 2, 2, 1]);
  // The other order scales the translation with everything else.
  closeVec(G.apply(G.multiply(s, t), [1, 1, 1, 1]), [8, 2, 2, 1]);
});

test("the identity is an identity and rotations are orthonormal", () => {
  closeVec(G.apply(G.identity(), [4, -2, 7, 1]), [4, -2, 7, 1]);
  for (const make of [G.rotationX, G.rotationY, G.rotationZ]) {
    const m = make(0.7);
    const a = G.applyDirection(m, [1, 0, 0]);
    const b = G.applyDirection(m, [0, 1, 0]);
    close(G.length(a), 1);
    close(G.length(b), 1);
    close(G.dot(a, b), 0);
  }
  // A full turn is the identity.
  closeVec(G.apply(G.rotationY(Math.PI * 2), [1, 2, 3, 1]), [1, 2, 3, 1], 1e-12);
});

test("the perspective matrix puts -z into w and maps the frustum to the unit cube", () => {
  const near = 0.5, far = 100;
  const p = G.perspective(Math.PI / 2, 1, near, far);
  // A point ON the near plane maps to ndc z = -1; on the far plane, +1.
  const onNear = G.perspectiveDivide(G.apply(p, [0, 0, -near, 1]));
  const onFar = G.perspectiveDivide(G.apply(p, [0, 0, -far, 1]));
  close(onNear[2], -1, 1e-9);
  close(onFar[2], 1, 1e-9);
  // w carries the view-space distance, which is the whole trick.
  close(G.apply(p, [0, 0, -7, 1])[3], 7);
  // At a 90 degree field of view the frustum edge is at x = -z.
  const edgePoint = G.perspectiveDivide(G.apply(p, [10, 0, -10, 1]));
  close(edgePoint[0], 1, 1e-9);
  // ndcDepth agrees with the matrix it describes.
  close(G.ndcDepth(7, near, far), G.perspectiveDivide(G.apply(p, [0, 0, -7, 1]))[2], 1e-12);
});

test("depth precision collapses with distance, and with a close near plane", () => {
  const far = 1000;
  // Half the codes are spent between the near plane and twice it.
  const near = 0.1;
  const mid = G.ndcDepth(2 * near, near, far);
  assert.ok(mid > 0, `ndc depth at 2x near is ${mid}: already past the midpoint of the range`);
  // Resolution degrades with the square of distance.
  const at10 = G.depthResolution(10, near, far, 24);
  const at20 = G.depthResolution(20, near, far, 24);
  close(at20 / at10, 4, 1e-9);
  // Pushing the near plane out buys precision back, linearly in near.
  const tight = G.depthResolution(100, 1.0, far, 24);
  const loose = G.depthResolution(100, 0.1, far, 24);
  assert.ok(tight < loose / 5, "moving the near plane out by 10x should recover most of the precision");
});

test("lookAt builds a view matrix that puts the eye at the origin looking down -z", () => {
  const view = G.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
  closeVec(G.apply(view, [0, 0, 5, 1]), [0, 0, 0, 1], 1e-12);
  // The target sits straight ahead, 5 units along -z.
  closeVec(G.apply(view, [0, 0, 0, 1]), [0, 0, -5, 1], 1e-12);
});

test("the edge function is twice the signed area, and its sign is the winding", () => {
  // Unit right triangle, clockwise on a y-down screen.
  close(G.edge(0, 0, 1, 0, 0, 1), 1);
  // Reverse the winding and the sign flips.
  close(G.edge(0, 0, 0, 1, 1, 0), -1);
  // Collinear points give exactly zero.
  close(G.edge(0, 0, 2, 2, 5, 5), 0);
});

// The property that matters most: two triangles sharing an edge must
// cover every pixel on that edge exactly once. Without a fill rule you
// get either a seam of unpainted pixels or a line of doubly-blended
// ones — which is visible the moment you draw anything transparent.
test("the top-left rule makes a shared edge paint exactly once", () => {
  const W = 40, H = 40;
  const quad = [
    { x: 4.0, y: 3.0 }, { x: 33.0, y: 6.0 },
    { x: 30.0, y: 34.0 }, { x: 6.0, y: 31.0 },
  ];
  const counts = new Int32Array(W * H);
  const opts = { width: W, height: H };
  G.rasterTriangle(quad[0], quad[1], quad[2], opts, (x, y) => { counts[y * W + x]++; });
  G.rasterTriangle(quad[0], quad[2], quad[3], opts, (x, y) => { counts[y * W + x]++; });
  const doubled = [];
  for (let i = 0; i < counts.length; i++) if (counts[i] > 1) doubled.push(i);
  assert.deepEqual(doubled, [], "no pixel may be covered by both triangles");
  assert.ok(counts.reduce((a, b) => a + b, 0) > 500, "the quad should actually be filled");
});

test("without the fill rule, the shared edge double-covers", () => {
  const W = 40, H = 40;
  // Vertices on exact half-integer positions so the edge passes through
  // pixel centres, which is when the tie-break actually matters.
  const a = { x: 5.5, y: 4.5 }, b = { x: 25.5, y: 4.5 }, c = { x: 25.5, y: 24.5 }, d = { x: 5.5, y: 24.5 };
  const counts = new Int32Array(W * H);
  const opts = { width: W, height: H, fillRule: false };
  G.rasterTriangle(a, b, c, opts, (x, y) => { counts[y * W + x]++; });
  G.rasterTriangle(a, c, d, opts, (x, y) => { counts[y * W + x]++; });
  let doubled = 0;
  for (const n of counts) if (n > 1) doubled++;
  assert.ok(doubled > 0, "turning the rule off must reintroduce the double-covered diagonal");
});

test("the two halves of a quad tile it without gaps", () => {
  const W = 32, H = 32;
  const a = { x: 4, y: 4 }, b = { x: 28, y: 4 }, c = { x: 28, y: 28 }, d = { x: 4, y: 28 };
  const hit = new Uint8Array(W * H);
  const opts = { width: W, height: H };
  G.rasterTriangle(a, b, c, opts, (x, y) => { hit[y * W + x] = 1; });
  G.rasterTriangle(a, c, d, opts, (x, y) => { hit[y * W + x] = 1; });
  // Every pixel centre strictly inside the quad must be covered.
  for (let y = 5; y < 27; y++) {
    for (let x = 5; x < 27; x++) {
      assert.equal(hit[y * W + x], 1, `gap at ${x},${y}`);
    }
  }
});

test("backface culling follows the winding, and reports which way it faced", () => {
  const a = { x: 2, y: 2 }, b = { x: 20, y: 2 }, c = { x: 2, y: 20 };
  const front = G.rasterTriangle(a, b, c, { cull: "back", width: 32, height: 32 }, () => {});
  assert.equal(front.culled, false);
  assert.equal(front.frontFacing, true);
  const back = G.rasterTriangle(a, c, b, { cull: "back", width: 32, height: 32 }, () => {});
  assert.equal(back.culled, true);
  // With culling off, the reversed triangle still rasterizes — and covers
  // exactly the same pixels, because coverage does not depend on winding.
  const forward = new Set(), reversed = new Set();
  G.rasterTriangle(a, b, c, { width: 32, height: 32 }, (x, y) => forward.add(`${x},${y}`));
  G.rasterTriangle(a, c, b, { width: 32, height: 32 }, (x, y) => reversed.add(`${x},${y}`));
  assert.deepEqual([...forward].sort(), [...reversed].sort());
});

test("barycentrics track the caller's vertex order even when winding is flipped internally", () => {
  const a = { x: 2, y: 2 }, b = { x: 30, y: 2 }, c = { x: 2, y: 30 };
  const sample = (v0, v1, v2) => {
    let found = null;
    G.rasterTriangle(v0, v1, v2, { width: 40, height: 40 }, (x, y, bary) => {
      if (x === 3 && y === 3) found = bary.slice();
    });
    return found;
  };
  const forward = sample(a, b, c);
  const reversed = sample(a, c, b);
  assert.ok(forward && reversed);
  // l0 belongs to the first vertex in both orders.
  close(forward[0], reversed[0], 1e-12);
  // The other two swap with the argument order.
  close(forward[1], reversed[2], 1e-12);
  close(forward[2], reversed[1], 1e-12);
  // Barycentrics always sum to one.
  close(forward[0] + forward[1] + forward[2], 1, 1e-12);
});

test("barycentrics are 1 at their own vertex and sum to 1 everywhere", () => {
  const a = { x: 5, y: 5 }, b = { x: 35, y: 9 }, c = { x: 11, y: 33 };
  let samples = 0;
  G.rasterTriangle(a, b, c, { width: 48, height: 48 }, (x, y, bary) => {
    close(bary[0] + bary[1] + bary[2], 1, 1e-9);
    assert.ok(bary[0] >= -1e-9 && bary[1] >= -1e-9 && bary[2] >= -1e-9);
    samples++;
  });
  assert.ok(samples > 300);
});

// Perspective-correct interpolation is the difference between a floor
// that lies flat and the swimming, folding texture of a 1994 console.
test("perspective-correct interpolation recovers the true midpoint; affine does not", () => {
  // An edge from 1 unit away to 9 units away. Its screen-space midpoint
  // is at the harmonic mean depth, 1.8 units — not the average, 5.
  const w0 = 1, w1 = 9;
  const bary = [0.5, 0.5, 0];
  const depth = G.interpolatePerspective(bary, 0, 1, 0, 1 / w0, 1 / w1, 0);
  // Derive the answer independently: 1/z is what varies linearly across
  // the screen, so the midpoint sits at the HARMONIC mean depth, 1.8 —
  // and 1.8 is one tenth of the way along a segment from 1 to 9.
  const harmonicDepth = 2 / (1 / w0 + 1 / w1);
  close(harmonicDepth, 1.8, 1e-12);
  close(depth, (harmonicDepth - w0) / (w1 - w0), 1e-12);
  close(depth, 0.1, 1e-12);
  // Affine interpolation just says "halfway", which is wrong by 5x here.
  close(G.interpolateAffine(bary, 0, 1, 0), 0.5);
});

test("perspective-correct interpolation is exact when w is constant", () => {
  const bary = [0.2, 0.3, 0.5];
  const affine = G.interpolateAffine(bary, 4, -1, 7);
  const correct = G.interpolatePerspective(bary, 4, -1, 7, 1 / 3, 1 / 3, 1 / 3);
  close(affine, correct, 1e-12);
});

test("near-plane clipping splits a triangle that straddles the eye", () => {
  const v = (x, y, z, w) => ({ clip: [x, y, z, w], attrs: [x] });
  // Two vertices in front, one behind: the clipper must return a quad.
  const poly = G.clipNear([v(-1, -1, 0, 2), v(1, -1, 0, 2), v(0, 1, 0, -1)]);
  assert.equal(poly.length, 4, "one vertex behind the near plane makes a quad");
  for (const p of poly) assert.ok(p.clip[3] > 0, "no clipped vertex may have w <= 0");
  assert.equal(G.fanTriangles(poly).length, 2);
  // Entirely behind: nothing survives.
  assert.equal(G.clipNear([v(0, 0, 0, -1), v(1, 0, 0, -2), v(0, 1, 0, -3)]).length, 0);
  // Entirely in front: untouched.
  assert.equal(G.clipNear([v(0, 0, 0, 1), v(1, 0, 0, 2), v(0, 1, 0, 3)]).length, 3);
});

test("clipping interpolates attributes along with position", () => {
  const a = { clip: [0, 0, 0, 4], attrs: [0, 10] };
  const b = { clip: [0, 0, 0, -4], attrs: [1, 20] };
  const poly = G.clipNear([a, b, { clip: [1, 1, 0, 4], attrs: [0, 10] }], 0);
  const cut = poly.find((p) => Math.abs(p.clip[3]) < 1e-9);
  assert.ok(cut, "there must be a vertex exactly on the near plane");
  close(cut.attrs[0], 0.5, 1e-12);
  close(cut.attrs[1], 15, 1e-12);
});

test("the mip chain halves, and costs exactly one third extra", () => {
  const base = G.checkerTexture(64, [1, 1, 1], [0, 0, 0], 8);
  const levels = G.buildMipChain(base);
  assert.deepEqual(Array.from(levels, (l) => l.size), [64, 32, 16, 8, 4, 2, 1]);
  const texels = levels.reduce((sum, l) => sum + l.size * l.size, 0);
  close(texels / (64 * 64), 1 + 1 / 3, 0.01);
  // A black-and-white checker averages to mid grey at the top of the chain.
  closeVec(levels[levels.length - 1].data.slice(0, 3), [0.5, 0.5, 0.5], 1e-12);
});

test("the LOD formula picks the level that matches the minification", () => {
  const size = 64;
  // One screen pixel steps exactly one texel: level 0, no minification.
  close(G.computeLod(1 / size, 0, 0, 1 / size, size), 0, 1e-12);
  // One screen pixel steps four texels: level 2.
  close(G.computeLod(4 / size, 0, 0, 4 / size, size), 2, 1e-12);
  // The longer axis wins, which is what over-blurs a grazing floor.
  close(G.computeLod(8 / size, 0, 0, 1 / size, size), 3, 1e-12);
  const aniso = G.computeAnisotropy(8 / size, 0, 0, 1 / size, size);
  close(aniso.ratio, 8, 1e-12);
});

test("bilinear filtering hits the texel centres exactly and blends between them", () => {
  const tex = { size: 2, data: Float64Array.from([0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0]) };
  // Texel centres are at 0.25 and 0.75 for a 2x2 texture.
  closeVec(G.sampleBilinear(tex, 0.25, 0.25), [0, 0, 0], 1e-12);
  closeVec(G.sampleBilinear(tex, 0.75, 0.25), [1, 1, 1], 1e-12);
  // Halfway between them is the average.
  closeVec(G.sampleBilinear(tex, 0.5, 0.25), [0.5, 0.5, 0.5], 1e-12);
});

test("the shading models behave the way their papers describe", () => {
  const n = [0, 0, 1];
  // Lambert: full at normal incidence, zero at grazing, clamped below.
  close(G.lambert(n, [0, 0, 1]), 1);
  close(G.lambert(n, [1, 0, 0]), 0);
  close(G.lambert(n, [0, 0, -1]), 0);

  // Phong's lobe is built on the reflected light vector, so a viewer
  // sitting exactly at the mirror direction sees a peak of 1 whatever
  // the exponent. Reflecting [0.5, 0, 0.866] about z gives [-0.5, 0, 0.866].
  const light = G.normalize([0.5, 0, 0.866]);
  const mirror = G.normalize([-0.5, 0, 0.866]);
  for (const exponent of [1, 8, 64]) {
    close(G.phongSpecular(n, light, mirror, exponent), 1, 1e-9);
  }
  // Blinn peaks when the halfway vector meets the normal, which for a
  // head-on viewer is not the same place at all.
  const head = [0, 0, 1];
  const p = G.phongSpecular(n, light, head, 32);
  const b = G.blinnSpecular(n, light, head, 32);
  // The n-h angle is half the r-v angle, so at the same exponent Blinn's
  // highlight is markedly the broader of the two. This is the whole
  // reason engines quote a rough 2-4x exponent conversion between them.
  assert.ok(b > p * 5, `Blinn (${b}) should be far wider than Phong (${p}) at the same exponent`);
  // Both still agree that light behind the surface makes no highlight.
  close(G.phongSpecular(n, [0, 0, -1], head, 8), 0);
  close(G.blinnSpecular(n, [0, 0, -1], head, 8), 0);
});

test("the GGX lobe sharpens as roughness falls, and conserves its shape", () => {
  const peakRough = G.distributionGGX(1, 0.8);
  const peakSmooth = G.distributionGGX(1, 0.1);
  assert.ok(peakSmooth > peakRough * 50, "a smooth surface concentrates far more energy at the peak");
  // Off-peak, the ordering reverses: rough surfaces spread energy wide.
  assert.ok(G.distributionGGX(0.7, 0.8) > G.distributionGGX(0.7, 0.1));
  // Fresnel: grazing angles go to white for every material.
  closeVec(G.fresnelSchlick(0, [0.04, 0.04, 0.04]), [1, 1, 1], 1e-12);
  closeVec(G.fresnelSchlick(1, [0.04, 0.04, 0.04]), [0.04, 0.04, 0.04], 1e-12);
});

test("a metal has no diffuse term and a dielectric does", () => {
  const n = [0, 0, 1], v = [0, 0, 1];
  const albedo = [0.8, 0.2, 0.2];
  // A light well away from the mirror direction, where the specular lobe
  // contributes almost nothing and the diffuse term is all that is left.
  const offAxis = G.normalize([0.9, 0, 0.436]);
  const metalDim = G.shadePbr(n, v, offAxis, albedo, 1, 0.4, [1, 1, 1]);
  const plasticDim = G.shadePbr(n, v, offAxis, albedo, 0, 0.4, [1, 1, 1]);
  assert.ok(plasticDim[1] > metalDim[1] * 4,
    "away from the highlight, a dielectric is far brighter: the metal has no diffuse lobe at all");

  // In the highlight, the difference is colour rather than brightness.
  // A metal tints its reflection with its own albedo; a dielectric's
  // highlight is white, which dilutes the body colour towards grey.
  const inLobe = G.normalize([0.3, 0.3, 1]);
  const metal = G.shadePbr(n, v, inLobe, albedo, 1, 0.4, [1, 1, 1]);
  const plastic = G.shadePbr(n, v, inLobe, albedo, 0, 0.4, [1, 1, 1]);
  close(metal[0] / metal[1], albedo[0] / albedo[1], 0.02);
  assert.ok(plastic[0] / plastic[1] < metal[0] / metal[1] - 0.5,
    "the dielectric's white highlight must desaturate it relative to the metal");

  // Light from behind the surface contributes nothing at all.
  closeVec(G.shadePbr(n, v, [0, 0, -1], albedo, 0, 0.4, [1, 1, 1]), [0, 0, 0]);
});

test("the sRGB transfer function round-trips and is not a plain 2.2 power", () => {
  for (const c of [0, 0.02, 0.25, 0.5, 0.9, 1]) {
    close(G.srgbToLinear(G.linearToSrgb(c)), c, 1e-9);
  }
  // Mid grey in sRGB is a little over a fifth of the light, not a half.
  // Averaging in the wrong space is why so many renderers looked muddy.
  close(G.srgbToLinear(0.5), 0.2140, 1e-3);
});

test("the generated geometry is well formed", () => {
  const cube = G.unitCube();
  assert.equal(cube.positions.length, 8);
  assert.equal(cube.edges.length, 12);
  assert.equal(cube.faces.length, 6);
  const sphere = G.uvSphere(8, 12);
  assert.equal(sphere.positions.length, sphere.normals.length);
  for (const n of sphere.normals) close(G.length(n), 1, 1e-12);
  for (const t of sphere.triangles) {
    for (const i of t) assert.ok(i >= 0 && i < sphere.positions.length);
  }
  // Every triangle has area: no degenerate slivers at the poles.
  for (const [a, b, c] of sphere.triangles) {
    const area = G.length(G.cross(
      G.sub(sphere.positions[b], sphere.positions[a]),
      G.sub(sphere.positions[c], sphere.positions[a]),
    ));
    assert.ok(area > 1e-6, "degenerate triangle in the sphere");
  }
});

test("MSAA sample positions are inside the pixel and distinct on both axes", () => {
  assert.equal(G.MSAA4.length, 4);
  const xs = new Set(), ys = new Set();
  for (const [x, y] of G.MSAA4) {
    assert.ok(x > 0 && x < 1 && y > 0 && y < 1);
    xs.add(x); ys.add(y);
  }
  // A rotated grid: four distinct rows AND four distinct columns, which
  // is what makes near-horizontal edges resolve better than a 2x2 grid.
  assert.equal(xs.size, 4);
  assert.equal(ys.size, 4);
});

test("MSAA reports partial coverage on an edge and full coverage inside", () => {
  const opts = { width: 32, height: 32, samples: G.MSAA4 };
  const coverage = new Map();
  G.rasterTriangle({ x: 4.0, y: 4.0 }, { x: 28.3, y: 6.7 }, { x: 6.2, y: 27.4 }, opts,
    (x, y, bary, info) => { coverage.set(`${x},${y}`, info.coverage); });
  const values = [...coverage.values()];
  assert.ok(values.some((c) => c === 1), "interior pixels are fully covered");
  assert.ok(values.some((c) => c > 0 && c < 1), "edge pixels are partially covered");
});
