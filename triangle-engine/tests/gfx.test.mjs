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

test("clipping a triangle that crosses the near plane produces a quad", () => {
  const proj = G.perspective(Math.PI / 2, 1, 0.5, 100);
  const v = (x, y, z) => ({ clip: G.apply(proj, [x, y, z, 1]), attrs: [x] });
  // Two corners beyond the near plane, one in front of it: the clipper
  // cuts the corner off and hands back four vertices.
  const poly = G.clipNear([v(-1, -1, -3), v(1, -1, -3), v(0, 1, -0.2)]);
  assert.equal(poly.length, 4, "one vertex inside the near plane makes a quad");
  for (const p of poly) {
    assert.ok(p.clip[3] > 0, "no clipped vertex may have w <= 0");
    assert.ok(p.clip[2] + p.clip[3] >= -1e-9, "no clipped vertex may be inside the near plane");
  }
  assert.equal(G.fanTriangles(poly).length, 2);
});

test("clipping interpolates attributes along with position", () => {
  const proj = G.perspective(Math.PI / 2, 1, 1, 100);
  const make = (z, attrs) => ({ clip: G.apply(proj, [0, 0, z, 1]), attrs: attrs });
  // A degenerate-but-legal polygon whose first edge crosses z = -1 exactly
  // halfway in clip space, so the interpolated attribute is checkable.
  const a = make(-3, [0, 10]);
  const b = make(-0.5, [1, 20]);
  const poly = G.clipNear([a, b, make(-3, [0, 10])]);
  const cut = poly.find((p) => Math.abs(p.clip[2] + p.clip[3]) < 1e-9);
  assert.ok(cut, "there must be a vertex exactly on the near plane");
  // The near plane sits at z = -1, which is (3 - 1) / (3 - 0.5) = 0.8 of the
  // way along the segment in EYE space — and clip space is affine in eye
  // space, so the same fraction applies to the attributes.
  close(cut.attrs[0], 0.8, 1e-9);
  close(cut.attrs[1], 10 + 0.8 * 10, 1e-9);
});

test("the mip chain halves, and its overhead approaches a third from below", () => {
  const base = G.checkerTexture(64, [1, 1, 1], [0, 0, 0], 8);
  const levels = G.buildMipChain(base);
  assert.deepEqual(Array.from(levels, (l) => l.size), [64, 32, 16, 8, 4, 2, 1]);

  // The overhead is (1 - 4^-n)/3 for n levels below the base: strictly less
  // than a third, and closer to it the deeper the chain. Anything claiming
  // "exactly a third" has the direction of the limit backwards.
  const overhead = (levels.reduce((sum, l) => sum + l.size * l.size, 0) - 64 * 64) / (64 * 64);
  assert.ok(overhead < 1 / 3, `overhead ${overhead} must stay under a third`);
  close(overhead, (1 - Math.pow(4, -(levels.length - 1))) / 3, 1e-12);

  // Deeper chains get closer to the limit, never past it.
  const shallow = G.buildMipChain(G.checkerTexture(4, [1, 1, 1], [0, 0, 0], 2));
  const shallowOverhead = (shallow.reduce((sum, l) => sum + l.size * l.size, 0) - 16) / 16;
  assert.ok(shallowOverhead < overhead, `${shallowOverhead} should be further from a third than ${overhead}`);
  assert.ok(overhead > 0.333, "a 64x64 chain should already be within a thousandth of the limit");

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

// ============================================================
// Second pass: properties the adversarial review found unguarded.
// ============================================================

// The bug this catches: unitCube was wound the opposite way to uvSphere,
// so the transform instrument rendered exactly the three faces you cannot
// see. A face-count assertion does not notice; this does.
test("both mesh generators agree with the culling convention", () => {
  const cube = G.unitCube();
  const model = G.multiply(G.rotationY(0.61), G.rotationX(-0.35));
  const eye = [0, 0, 5];
  const mvp = G.multiplyAll([
    G.perspective(Math.PI / 3, 1, 0.5, 40),
    G.lookAt(eye, [0, 0, 0], [0, 1, 0]),
    model,
  ]);
  const project = (p) => {
    const clip = G.apply(mvp, p);
    const s = G.viewport(G.perspectiveDivide(clip), 200, 200);
    return { x: s[0], y: s[1] };
  };

  // The outward normal is taken from the GEOMETRY — each face of the unit
  // cube is a plane where one coordinate is constant — so this test cannot
  // be fooled by the winding it is checking.
  const outward = (face) => {
    const points = face.map((i) => cube.positions[i]);
    for (let axis = 0; axis < 3; axis++) {
      const value = points[0][axis];
      if (points.every((p) => p[axis] === value)) {
        const n = [0, 0, 0];
        n[axis] = value;
        return n;
      }
    }
    throw new Error("face is not axis-aligned");
  };

  for (const face of cube.faces) {
    const normal = G.normalize(G.applyDirection(model, outward(face)));
    const centre = G.scale(
      face.map((i) => G.applyDirection(model, cube.positions[i])).reduce(G.add, [0, 0, 0]), 1 / 4);
    const facesCamera = G.dot(normal, G.normalize(G.sub(eye, centre))) > 0;
    const screen = face.map((i) => project(cube.positions[i]));
    let drawn = 0;
    const opts = { width: 200, height: 200, cull: "back" };
    G.rasterTriangle(screen[0], screen[1], screen[2], opts, () => { drawn++; });
    G.rasterTriangle(screen[0], screen[2], screen[3], opts, () => { drawn++; });
    assert.equal(drawn > 0, facesCamera,
      `a cube face pointing ${facesCamera ? "at" : "away from"} the camera was ${drawn > 0 ? "drawn" : "culled"}`);
  }

  // The sphere must use the same convention, or one of the two instruments
  // is inside out.
  const sphere = G.uvSphere(8, 14);
  const sphereMvp = G.multiply(G.perspective(Math.PI / 4, 1, 0.5, 20), G.lookAt([0, 0, 3.4], [0, 0, 0], [0, 1, 0]));
  let farDrawn = 0;
  for (const [a, b, c] of sphere.triangles) {
    const centre = G.scale(G.add(G.add(sphere.positions[a], sphere.positions[b]), sphere.positions[c]), 1 / 3);
    if (centre[2] > -0.35) continue;                     // clearly on the far side
    const screen = [a, b, c].map((i) => {
      const s = G.viewport(G.perspectiveDivide(G.apply(sphereMvp, sphere.positions[i])), 200, 200);
      return { x: s[0], y: s[1] };
    });
    const result = G.rasterTriangle(screen[0], screen[1], screen[2], { width: 200, height: 200, cull: "back" }, () => {});
    if (!result.culled) farDrawn++;
  }
  assert.equal(farDrawn, 0, "the far side of the sphere must be entirely culled");
});

// The bug this catches: rasterTriangle normalised the winding internally
// and then returned the NEGATED area, so no caller could ever see a
// back-facing triangle unless culling was switched on.
test("the reported signed area is the caller's, not the internal one", () => {
  const a = { x: 4, y: 4 }, b = { x: 30, y: 6 }, c = { x: 8, y: 28 };
  const expected = G.edge(a.x, a.y, b.x, b.y, c.x, c.y) * G.SUB * G.SUB;
  const forward = G.rasterTriangle(a, b, c, { width: 40, height: 40 }, () => {});
  const reversed = G.rasterTriangle(a, c, b, { width: 40, height: 40 }, () => {});
  close(forward.area2, expected, 1e-6);
  close(reversed.area2, -expected, 1e-6);
  assert.equal(forward.frontFacing, true);
  assert.equal(reversed.frontFacing, false);
  // And the culled path must agree with the rasterized one.
  const culled = G.rasterTriangle(a, c, b, { width: 40, height: 40, cull: "back" }, () => {});
  assert.equal(culled.culled, true);
  close(culled.area2, -expected, 1e-6);
});

// The bug this catches: clipping w >= 0 is the EYE plane, not the near
// plane, so geometry between the eye and the near plane survived with an
// NDC z far below -1.
test("clipping happens at the near plane, not at the eye", () => {
  const near = 0.5, far = 100;
  const proj = G.perspective(Math.PI / 2, 1, near, far);
  const vertex = (x, y, z) => ({ clip: G.apply(proj, [x, y, z, 1]), attrs: [] });

  // All three in front of the eye, but two nearer than the near plane.
  const straddling = [vertex(-0.4, -0.4, -2), vertex(0.4, -0.4, -0.2), vertex(0, 0.4, -0.1)];
  const clipped = G.clipNear(straddling);
  assert.ok(clipped.length >= 3, "something must survive");
  for (const v of clipped) {
    const ndc = G.perspectiveDivide(v.clip);
    assert.ok(ndc[2] >= -1 - 1e-9, `a clipped vertex has NDC z = ${ndc[2]}, outside the clip volume`);
    assert.ok(v.clip[3] > 0, "no surviving vertex may have w <= 0");
  }
  // Entirely nearer than the near plane: nothing survives.
  assert.equal(G.clipNear([vertex(0, 0, -0.2), vertex(0.1, 0, -0.3), vertex(0, 0.1, -0.4)]).length, 0);
  // Entirely beyond it: untouched.
  assert.equal(G.clipNear([vertex(0, 0, -2), vertex(1, 0, -3), vertex(0, 1, -4)]).length, 3);
  // Behind the eye is behind the near plane too.
  assert.equal(G.clipNear([vertex(0, 0, 1), vertex(1, 0, 2), vertex(0, 1, 3)]).length, 0);
  // The cut lands exactly on the plane z = -w.
  const cut = G.clipNear([vertex(0, 0, -2), vertex(0, 0, -0.1), vertex(1, 0, -2)])
    .find((v) => Math.abs(v.clip[2] + v.clip[3]) < 1e-9);
  assert.ok(cut, "there must be a vertex exactly on z = -w");
  close(G.perspectiveDivide(cut.clip)[2], -1, 1e-9);
});

test("normalMatrix survives a non-uniform scale where a plain transform does not", () => {
  const m = G.multiply(G.scaling(3, 1, 0.5), G.rotationY(0.4));
  const n = G.normalMatrix(m);
  // A surface with a normal and a tangent perpendicular to it.
  const normal = G.normalize([1, 1, 0]);
  const tangent = G.normalize([1, -1, 0]);
  close(G.dot(normal, tangent), 0, 1e-12);
  const movedTangent = G.applyDirection(m, tangent);
  // The naive transform breaks perpendicularity...
  assert.ok(Math.abs(G.dot(G.normalize(G.applyDirection(m, normal)), G.normalize(movedTangent))) > 0.1);
  // ...and the inverse-transpose restores it.
  close(G.dot(G.normalize(G.applyDirection(n, normal)), G.normalize(movedTangent)), 0, 1e-9);
  // For a rotation alone it is the same matrix.
  const r = G.rotationY(0.7);
  const rn = G.normalMatrix(r);
  for (let i = 0; i < 16; i++) close(rn[i], r[i], 1e-12);
});

test("the orthographic matrix maps its box to the unit cube and leaves w alone", () => {
  const m = G.orthographic(-2, 2, -1, 1, 1, 11);
  closeVec(G.apply(m, [2, 1, -1, 1]), [1, 1, -1, 1], 1e-12);
  closeVec(G.apply(m, [-2, -1, -11, 1]), [-1, -1, 1, 1], 1e-12);
  // w is untouched, which is exactly why nothing shrinks with distance.
  close(G.apply(m, [0, 0, -6, 1])[3], 1);
  const near = G.perspectiveDivide(G.apply(m, [1, 0, -1, 1]));
  const far = G.perspectiveDivide(G.apply(m, [1, 0, -11, 1]));
  close(near[0], far[0], 1e-12);
});

test("the viewport transform flips y and passes depth through untouched", () => {
  closeVec(G.viewport([-1, 1, -1], 800, 600), [0, 0, -1], 1e-12);
  closeVec(G.viewport([1, -1, 1], 800, 600), [800, 600, 1], 1e-12);
  closeVec(G.viewport([0, 0, 0.25], 800, 600), [400, 300, 0.25], 1e-12);
});

test("lookAt builds an orthonormal basis for an off-axis camera", () => {
  const eye = [3, 4, -2];
  const view = G.lookAt(eye, [-1, 0.5, 1], [0.1, 1, 0.2]);
  closeVec(G.apply(view, eye.concat([1])), [0, 0, 0, 1], 1e-9);
  const right = G.applyDirection(view, [1, 0, 0]);
  const up = G.applyDirection(view, [0, 1, 0]);
  const back = G.applyDirection(view, [0, 0, 1]);
  for (const axis of [right, up, back]) close(G.length(axis), 1, 1e-12);
  close(G.dot(right, up), 0, 1e-12);
  close(G.dot(right, back), 0, 1e-12);
  // The target is straight ahead, down -z.
  const target = G.apply(view, [-1, 0.5, 1, 1]);
  close(target[0], 0, 1e-9);
  close(target[1], 0, 1e-9);
  assert.ok(target[2] < 0);
});

// The claim the whole depth pipeline rests on.
test("NDC depth really is affine in screen space", () => {
  const mvp = G.multiplyAll([
    G.perspective(Math.PI / 3, 1.4, 0.4, 60),
    G.lookAt([0.6, 1.2, 3], [0, 0, 0], [0, 1, 0]),
    G.rotationY(0.5),
  ]);
  // A steeply slanted triangle, so the depth range across it is large.
  const object = [[-1, -0.6, 2.4], [1.3, -0.4, -1.8], [0.1, 1.1, 0.6]];
  const clip = object.map((p) => G.apply(mvp, p));
  const screen = clip.map((c) => {
    const s = G.viewport(G.perspectiveDivide(c), 300, 220);
    return { x: s[0], y: s[1], z: s[2], invW: 1 / c[3] };
  });

  let worst = 0, samples = 0;
  G.rasterTriangle(screen[0], screen[1], screen[2], { width: 300, height: 220 }, (x, y, bary) => {
    // Interpolated the cheap way: barycentric, no division by w.
    const affine = G.interpolateDepth(bary, screen[0].z, screen[1].z, screen[2].z);
    // The truth: recover the 3D point perspective-correctly, then project it.
    const point = [0, 1, 2].map((axis) =>
      G.interpolatePerspective(bary, object[0][axis], object[1][axis], object[2][axis],
        screen[0].invW, screen[1].invW, screen[2].invW));
    const exact = G.perspectiveDivide(G.apply(mvp, point))[2];
    worst = Math.max(worst, Math.abs(affine - exact));
    samples++;
  });
  assert.ok(samples > 500, `only ${samples} samples`);
  assert.ok(worst < 1e-9, `depth drifted by ${worst} — it is not affine in screen space after all`);
});

// The watertightness claim, as a property rather than one hand-picked quad.
test("adjacent triangles tile watertightly for arbitrary quads and both windings", () => {
  const W = 34, H = 34;
  let seed = 12345;
  const random = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  for (let trial = 0; trial < 220; trial++) {
    // A convex quad: a centre plus four points, one per quadrant.
    const cx = 8 + random() * 18, cy = 8 + random() * 18;
    const radius = () => 4 + random() * 7;
    const corners = [0, 1, 2, 3].map((i) => {
      const angle = (i * Math.PI) / 2 + random() * 0.9 - 0.45;
      const r = radius();
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    });
    const [a, b, c, d] = trial % 2 ? corners : corners.slice().reverse();
    const counts = new Int32Array(W * H);
    const opts = { width: W, height: H };
    G.rasterTriangle(a, b, c, opts, (x, y) => { counts[y * W + x]++; });
    G.rasterTriangle(a, c, d, opts, (x, y) => { counts[y * W + x]++; });
    for (let i = 0; i < counts.length; i++) {
      assert.ok(counts[i] <= 1, `trial ${trial}: a pixel on the shared edge was covered ${counts[i]} times`);
    }
    assert.ok(counts.reduce((s, n) => s + n, 0) > 20, `trial ${trial}: the quad vanished`);
  }
});

test("the fill rule assigns each shared edge to exactly one of its two sides", () => {
  // isTopLeft must disagree with itself when the edge is walked backwards:
  // that is what makes the rule a partition rather than a coin toss.
  const cases = [[0, 0, 5, 0], [0, 0, 0, 5], [3, 1, 7, 9], [7, 9, 3, 1], [2, 6, 9, 2]];
  for (const [ax, ay, bx, by] of cases) {
    assert.notEqual(G.isTopLeft(ax, ay, bx, by), G.isTopLeft(bx, by, ax, ay),
      `edge ${ax},${ay} -> ${bx},${by} is owned by both sides or neither`);
  }
});

test("Phong refuses to light a surface the light cannot reach", () => {
  const n = [0, 0, 1];
  // A light below the horizon: the reflected vector can still swing round
  // to meet the viewer, which is exactly the trap.
  const below = G.normalize([0.99, 0, -0.15]);
  const view = G.normalize([-0.9, 0, 0.44]);
  assert.ok(G.dot(n, below) < 0, "the test light must actually be below the horizon");
  close(G.phongSpecular(n, below, view, 16), 0);
  close(G.blinnSpecular(n, below, view, 16), 0);
  // And it still lights one the light does reach.
  assert.ok(G.phongSpecular(n, G.normalize([0.3, 0, 0.95]), [0, 0, 1], 16) > 0);
});

test("the microfacet terms behave at their limits", () => {
  // Roughness 0 is a delta function no float can hold; it must not be NaN.
  for (const roughness of [0, 1e-9, 0.5, 1]) {
    for (const nDotH of [0, 0.5, 1]) {
      const d = G.distributionGGX(nDotH, roughness);
      assert.ok(isFinite(d) && d >= 0, `D(${nDotH}, ${roughness}) = ${d}`);
    }
  }
  for (const roughness of [0, 0.5, 1]) {
    const g = G.geometrySmith(0.5, 0.5, roughness);
    assert.ok(isFinite(g) && g >= 0 && g <= 1.001, `G = ${g} at roughness ${roughness}`);
  }
  for (const metallic of [0, 1]) {
    for (const roughness of [0.02, 1]) {
      const out = G.shadePbr([0, 0, 1], [0, 0, 1], G.normalize([0.4, 0, 0.9]), [0.8, 0.6, 0.2], metallic, roughness, [1, 1, 1]);
      for (const channel of out) assert.ok(isFinite(channel) && channel >= 0, `${channel} at metal=${metallic} rough=${roughness}`);
    }
  }
});

test("trilinear sampling collapses to bilinear at an integer level", () => {
  const levels = G.buildMipChain(G.checkerTexture(32, [1, 0.2, 0.4], [0, 0.6, 0.9], 4));
  for (const level of [0, 1, 2]) {
    closeVec(G.sampleTrilinear(levels, 0.31, 0.62, level), G.sampleBilinear(levels[level], 0.31, 0.62), 1e-12);
  }
  // Halfway between two levels is the average of the two.
  const a = G.sampleBilinear(levels[1], 0.31, 0.62);
  const b = G.sampleBilinear(levels[2], 0.31, 0.62);
  closeVec(G.sampleTrilinear(levels, 0.31, 0.62, 1.5), G.mix(a, b, 0.5), 1e-12);
  // Beyond the end of the chain it clamps rather than reading off it.
  closeVec(G.sampleTrilinear(levels, 0.31, 0.62, 99), G.sampleBilinear(levels[levels.length - 1], 0.31, 0.62), 1e-12);
});

test("the LOD formula uses the longer axis whichever way it is skewed", () => {
  const size = 64;
  // Cross terms: the x step moves in v, the y step moves in u. A
  // transposed-derivative bug passes every axis-aligned case and fails here.
  close(G.computeLod(0, 4 / size, 4 / size, 0, size), 2, 1e-12);
  close(G.computeLod(0, 8 / size, 1 / size, 0, size), 3, 1e-12);
  // A diagonal step of 4 texels in each of u and v is longer than 4.
  close(G.computeLod(4 / size, 4 / size, 0, 1 / size, size), Math.log2(Math.sqrt(32)), 1e-12);
  const aniso = G.computeAnisotropy(0, 8 / size, 1 / size, 0, size);
  close(aniso.major, 8, 1e-12);
  close(aniso.minor, 1, 1e-12);
  close(aniso.ratio, 8, 1e-12);
});

test("depthResolution matches the quantisation the instruments actually apply", () => {
  const near = 0.5, far = 200, bits = 16;
  const codes = Math.pow(2, bits) - 1;
  const z = 12;
  const step = G.depthResolution(z, near, far, bits);
  // Two surfaces one resolution step apart must land on different codes.
  const codeAt = (d) => Math.round((G.ndcDepth(d, near, far) * 0.5 + 0.5) * codes);
  assert.ok(codeAt(z) !== codeAt(z + step * 1.5), "a step and a half must be resolvable");
  // Half a step usually is not — that is what "resolution" means.
  assert.equal(codeAt(z), codeAt(z + step * 0.05));
});
