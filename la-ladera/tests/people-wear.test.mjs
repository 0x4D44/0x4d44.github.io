// Wearable binary/geometry contract and deliberate input corruption.
// node --import ./la-ladera/tests/register.mjs la-ladera/tests/people-wear.test.mjs
// Mandatory full posed release gate (separate to avoid running it twice):
// node la-ladera/tools/blender/people_wear_validate.mjs --mode all --report <path>
import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Quaternion, Triangle, Vector3 } from '../vendor/three/build/three.core.min.js';
import { CONTRACT, parseGlb, readGlb, readAccessor, decodePrimitive, readClipBank } from '../tools/blender/people_validate.mjs';
import { ROOT, LIMITS, validateWear, inspectFit, checkGeometry, checkTopologyChoices, checkAccessorAlignment, geometryGpuBytes, checkGpuBudget, checkWearPolicy, checkInventory, safePath, compactBuffers, mergeWearReports, readWearGlb, readWearGeometry, readWearPoseTarget } from '../tools/blender/people_wear_validate.mjs';
import { identity, multiply, skinInfo, compareSkin, readPoseBank, poseSamples, sampleRotations, poseMatrices, skinPositions, usedVertices, ClosedSurface, checkPenetrations, inverseVector, closestUnionExit, rayUnionExit, pushOutPose } from '../tools/blender/people_wear_math.mjs';
import { fitWearFaces, FACE_GARMENTS } from '../tools/blender/people_wear_fit_faces.mjs';
import { fitWearPoseTargets } from '../tools/blender/people_wear_fit_targets.mjs';
import { preparePoseTarget, evaluatePoseTarget } from '../js/people/wear_pose.js';

function cube(offset = 0) {
  const p = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
  for (let i = 0; i < p.length; i += 3) p[i] += offset;
  return { vertices: 8, indices: Uint32Array.from([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]), attrs: {
    POSITION: Float64Array.from(p), NORMAL: Float64Array.from(Array.from({ length: 8 }, () => [0, 0, 1]).flat()), TEXCOORD_0: new Float64Array(16).fill(0.5),
    JOINTS_0: new Float64Array(32), WEIGHTS_0: Float64Array.from(Array.from({ length: 8 }, () => [1, 0, 0, 0]).flat()),
  } };
}

test('closed-surface predicate distinguishes outside, inside and the boundary', () => {
  const s = new ClosedSurface(cube());
  assert.ok(s.inside([0, 0, 0])); assert.ok(s.inside([0.999, 0.2, -0.3]));
  assert.equal(s.inside([1.001, 0, 0]), null); assert.equal(s.inside([1, 0, 0]), null);
  assert.equal(s.inside([-2, 0, 0]), null);
  const push = s.penetration([0.9, 0, 0], 0.002);
  assert.ok(push.depth > 0.099 && push.depth < 0.101);
  assert.equal(s.inside([0.9 + push.deltaWorld[0], push.deltaWorld[1], push.deltaWorld[2]]), null);
});

test('numeric nearest-surface BVH agrees with Three.js triangle closest points', () => {
  const decoded = cube(), surface = new ClosedSurface(decoded), query = new Vector3(), scratch = new Vector3(); let seed = 0x12345678;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000 * 4 - 2; };
  for (const deformed of [false, true]) {
    const p = new Float64Array(decoded.attrs.POSITION), matrix = identity();
    if (deformed) { matrix[4] = 0.35; matrix[9] = 0.2; matrix[2] = -0.15; }
    if (deformed) for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1], z = p[i + 2]; p[i] = x + y * 0.35; p[i + 1] = y + z * 0.2; p[i + 2] = z - x * 0.15; }
    surface.pose(p);
    const triangles = [];
    for (let i = 0; i < decoded.indices.length; i += 3) triangles.push(new Triangle(...[0, 1, 2].map(k => new Vector3().fromArray(p, decoded.indices[i + k] * 3))));
    for (let i = 0; i < 200; i++) {
      query.set(random(), random(), random()); let best = Infinity;
      for (const triangle of triangles) { triangle.closestPointToPoint(query, scratch); best = Math.min(best, scratch.distanceTo(query)); }
      const actual = surface.nearest(query.toArray(), surface.components[0]);
      assert.ok(Math.abs(actual.distance - best) < 1e-11); assert.ok(Math.abs(new Vector3().fromArray(actual.point).distanceTo(query) - best) < 1e-11);
      const bind = inverseVector(matrix, query.toArray());
      assert.equal(Boolean(surface.insideXYZ(query.x, query.y, query.z)), bind.every(v => Math.abs(v) < 1), 'cached ray coefficients must update with the posed surface');
    }
  }
});

test('overlapping body solids use union semantics, including the doubly enclosed region', () => {
  const a = cube(), b = cube(0.5), d = { vertices: 16, indices: Uint32Array.from([...a.indices, ...b.indices.map(i => i + 8)]), attrs: {} };
  for (const key of Object.keys(a.attrs)) d.attrs[key] = Float64Array.from([...a.attrs[key], ...b.attrs[key]]);
  const s = new ClosedSurface(d, [{ name: 'torso', firstIndex: 0, indexCount: 36 }, { name: 'arm', firstIndex: 36, indexCount: 36 }]);
  assert.ok(s.inside([0.25, 0, 0]), 'a single parity test across both solids would incorrectly clear this point');
  assert.ok(s.inside([1.4, 0, 0])); assert.equal(s.inside([1.6, 0, 0]), null);
});

test('self-overlap within one posed body part keeps signed occupancy and internal sheets occupied', () => {
  for (const reversed of [false, true]) for (const kind of ['nested', 'thin_nested', 'overlap', 'coincident']) {
    const a = cube(), b = cube(kind === 'overlap' ? 0.5 : kind === 'coincident' ? 3 : 0);
    const innerSize = kind === 'thin_nested' ? Math.fround(1 - 2e-7) : 0.5;
    if (kind === 'nested' || kind === 'thin_nested') b.attrs.POSITION = b.attrs.POSITION.map(value => value * innerSize);
    const d = { vertices: 16, indices: Uint32Array.from([...a.indices, ...b.indices.map(i => i + 8)]), attrs: {} };
    for (const key of Object.keys(a.attrs)) d.attrs[key] = Float64Array.from([...a.attrs[key], ...b.attrs[key]]);
    if (reversed) for (let i = 0; i < d.indices.length; i += 3) [d.indices[i + 1], d.indices[i + 2]] = [d.indices[i + 2], d.indices[i + 1]];
    // A posed closed limb can fold over itself without changing its original
    // triangle topology. One declared part must retain occupancy two or minus
    // two, rather than clearing it because an even number of sheets overlap.
    const surface = new ClosedSurface(d, [{ name: 'folded_part', firstIndex: 0, indexCount: d.indices.length }]);
    if (kind === 'coincident') {
      const posed = new Float64Array(d.attrs.POSITION);
      for (let i = 8 * 3; i < posed.length; i += 3) posed[i] -= 3;
      surface.pose(posed);
    }
    const x = kind === 'overlap' ? 0.25 : 0, outer = kind === 'overlap' ? 1.5 : 1, point = [x, 0.12, 0.07];
    assert.ok(surface.inside(point), `${kind}/${reversed}: a doubly occupied region is inside`);
    if (kind !== 'coincident') {
      const internal = [kind === 'nested' || kind === 'thin_nested' ? innerSize : 1, 0.12, 0.07];
      assert.ok(surface.inside(internal), 'an internal sheet does not expose the occupied layer behind it');
      assert.ok(surface.windingInside(surface.components[0], ...internal), 'the independent solid-angle path must preserve internal-sheet occupancy too');
    }
    assert.equal(surface.inside([outer, 0.12, 0.07]), null, 'the genuine exterior boundary remains clear, even for coincident sheets');
    const exit = rayUnionExit([surface], point, [1, 0, 0], { padding: 0.002, maxDistance: 4 });
    assert.ok(exit && Math.abs(exit.point[0] - outer - 0.002) < 1e-9, 'a two-to-one crossing is not a union exit');
  }
  const first = cube(), second = cube(2 - 1.2e-7), data = { vertices: 16, indices: Uint32Array.from([...first.indices, ...second.indices.map(i => i + 8)]), attrs: {} };
  for (const key of Object.keys(first.attrs)) data.attrs[key] = Float64Array.from([...first.attrs[key], ...second.attrs[key]]);
  const thinOverlap = new ClosedSurface(data, [{ name: 'thin_overlap', firstIndex: 0, indexCount: data.indices.length }]);
  const exit = rayUnionExit([thinOverlap], [0, 0.12, 0.07], [1, 0, 0], { padding: 0.002, maxDistance: 4 });
  assert.ok(exit && Math.abs(exit.point[0] - (3 - 1.2e-7 + 0.002)) < 1e-9, 'event state uses off-surface winding multiplicity even inside a thin overlap');
});

test('grazing rays cannot turn an outside point inside or clear a point inside a concave body', () => {
  const direction = [1, 0.3713906763541037, 0.6947465906068658], diamond = cube(), k = Math.SQRT1_2;
  for (let i = 0; i < diamond.attrs.POSITION.length; i += 3) { const x = diamond.attrs.POSITION[i], y = diamond.attrs.POSITION[i + 1]; diamond.attrs.POSITION[i] = (x + y) * k; diamond.attrs.POSITION[i + 1] = (y - x) * k; }
  const convex = new ClosedSurface(diamond);
  for (const depth of [0, 1e-8, 2e-8, 5e-8]) {
    const target = [0, Math.SQRT2 - depth, 0], point = target.map((v, i) => v - direction[i] * 0.2);
    assert.ok(Math.abs(point[0]) + Math.abs(point[1]) > Math.SQRT2);
    assert.equal(convex.inside(point), null, 'two distinct grazing crossings must not be merged into an inside result');
  }
  // A U-shaped extrusion: the ray exits the lower arm, then only touches the
  // upper arm's far corner. Counting that tangent as a crossing falsely clears
  // the starting point, even though it is well inside the lower arm.
  const polygon = [[-4, -1.5], [1, -1.5], [1, -0.5], [-3, -0.5], [-3, 0.5], [1, 0.5], [1, 1.5], [-4, 1.5]], cap = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 7], [4, 5, 6], [4, 6, 7]], indices = [];
  for (const [a, b, c] of cap) indices.push(a, c, b, a + 8, b + 8, c + 8);
  for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; indices.push(i, j, j + 8, i, j + 8, i + 8); }
  const concave = new ClosedSurface({ vertices: 16, indices: Uint32Array.from(indices), attrs: { POSITION: Float64Array.from([-3, 3].flatMap(z => polygon.flatMap(([x, y]) => [x, y, z]))) } });
  const point = [1, 0.5, 0].map((v, i) => v - direction[i] * 3);
  assert.ok(point[0] > -3 && point[0] < 1 && point[1] > -1.5 && point[1] < -0.5 && Math.abs(point[2]) < 3);
  assert.ok(concave.inside(point), 'a grazing remote corner must not produce a false clear');
});

test('authoring push-out exits the whole body union instead of oscillating between adjacent parts', () => {
  const surfaces = [new ClosedSurface(cube(), null, 'first'), new ClosedSurface(cube(0.5), null, 'second')], point = [0.25, 0, 0];
  const first = surfaces[0].penetration(point, 0.002), firstExit = point.map((v, i) => v + first.deltaWorld[i]);
  assert.ok(surfaces[1].inside(firstExit), 'a nearest exit from one solid is still inside its neighbour');
  const exit = closestUnionExit(surfaces, point, { padding: 0.002, maxDistance: 3 });
  assert.ok(surfaces.every(s => !s.inside(exit.point))); assert.ok(exit.distance >= 1 && exit.distance < 1.01);
});

test('ray exits include initially outside components, overlapping solids, short gaps and tangencies', () => {
  const point = [0.9, 0, 0], direction = [1, 0, 0], first = new ClosedSurface(cube());
  let other = new ClosedSurface(cube(0.5)), result = rayUnionExit([first, other], point, direction, { maxDistance: 4, padding: 0.002 });
  assert.ok(Math.abs(result.point[0] - 1.502) < 1e-10);
  // A 1 mm gap cannot hold the required 2 mm padding. The ray must also exit
  // the initially outside second cube, rather than landing inside it.
  other = new ClosedSurface(cube(2.001)); result = rayUnionExit([first, other], point, direction, { maxDistance: 4, padding: 0.002 });
  assert.ok(Math.abs(result.point[0] - 3.003) < 1e-10); assert.ok(!first.inside(result.point) && !other.inside(result.point));
  result = rayUnionExit([first, new ClosedSurface(cube())], point, direction, { maxDistance: 1, padding: 0.002 });
  assert.ok(Math.abs(result.point[0] - 1.002) < 1e-10, 'coincident near/far surfaces and diagonal triangle seams contribute one crossing per component');
  const touching = cube(2); for (let i = 1; i < touching.attrs.POSITION.length; i += 3) touching.attrs.POSITION[i] += 1;
  other = new ClosedSurface(touching); result = rayUnionExit([first, other], point, direction, { maxDistance: 1, padding: 0.002 });
  assert.ok(Math.abs(result.point[0] - 1.002) < 1e-10, 'coplanar tangency is boundary contact, not entering the other solid');
});

test('pose correction rechecks the actual float32 upload, stays bounded and never accumulates between frames', () => {
  const garment = cube(), surface = new ClosedSurface(cube()), matrices = [identity()], used = Uint32Array.of(0);
  garment.attrs.POSITION.set([0.95, 0, 0], 0); const original = garment.attrs.POSITION.slice();
  const corrected = pushOutPose(garment, matrices, [surface], { used, padding: 0.002, maxDistance: 0.18 });
  assert.ok(corrected.bindPositions instanceof Float32Array); assert.equal(corrected.count, 1);
  assert.ok(corrected.maxPush > 0.05 && corrected.maxPush < 0.06); assert.ok(corrected.maxBindPush < 0.06);
  assert.deepEqual(garment.attrs.POSITION, original);
  const uploaded = { ...garment, attrs: { ...garment.attrs, POSITION: corrected.bindPositions } }, posed = skinPositions(uploaded, matrices);
  assert.deepEqual(checkPenetrations([surface], uploaded, posed, matrices, { used }), []);
  const firstUpload = corrected.bindPositions.slice(), again = pushOutPose(garment, matrices, [surface], { used, out: corrected }); assert.deepEqual(again.bindPositions, firstUpload);
  matrices[0][12] = 0.2;
  const nextFrame = pushOutPose(garment, matrices, [surface], { used, out: corrected });
  assert.equal(nextFrame.count, 0); assert.equal(nextFrame.bindPositions[0], Math.fround(original[0]), 'the next frame starts from authored positions');
  matrices[0][12] = 0;
  assert.throws(() => pushOutPose(garment, matrices, [surface], { used, maxDistance: 0.02 }), /correction radius|exceeds/);
  const smallBody = cube(); smallBody.attrs.POSITION = smallBody.attrs.POSITION.map(value => value * 0.1);
  const compressed = identity(); compressed[0] = compressed[5] = compressed[10] = 0.05;
  const deepBind = cube(); deepBind.attrs.POSITION.set([1.9, 0, 0], 0);
  // The posed exit is only 7 mm, but every clear bind-space correction exceeds
  // the 20 mm cap. The alternate-direction fallback must still reject it.
  assert.throws(() => pushOutPose(deepBind, [compressed], [new ClosedSurface(smallBody)], { used, maxDistance: 0.02 }), /exceeds 0.02/);
  const alias = { ...garment, attrs: { ...garment.attrs, POSITION: new Float32Array(original) } };
  assert.throws(() => pushOutPose(alias, matrices, [surface], { used, out: { bindPositions: alias.attrs.POSITION, posedPositions: new Float64Array(original.length) } }), /overwrite the authored/);
});

function poseTargetFixture(delta) {
  const names = ['hips', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'], rest = names.map(() => identity());
  rest[3][13] = rest[4][13] = -1;
  for (const index of [5, 6]) { rest[index][5] = rest[index][10] = 0; rest[index][6] = 1; rest[index][9] = -1; }
  const descriptor = { version: 1, kind: 'seated', delta, activation: { parentJoint: 'hips', thighJoints: ['thigh_l', 'thigh_r'], startRadians: Math.PI / 4, fullRadians: 4 * Math.PI / 9 } };
  const seated = names.map(() => identity());
  for (const index of [1, 2]) { seated[index][5] = seated[index][10] = 0; seated[index][6] = -1; seated[index][9] = 1; }
  return { names, rest, descriptor, prepared: preparePoseTarget(descriptor, names, rest), seated };
}

test('seated pose targets follow bilateral articulation across all saved clips, independent of scene transforms', () => {
  const fit = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))).fits.m_tendero, doc = readWearGlb(join(ROOT, fit.file)), rig = skinInfo(doc, fit.bodyNode);
  const fixture = poseTargetFixture(new Float32Array(3)), target = preparePoseTarget(fixture.descriptor, rig.jointNames, rig.worlds), scene = identity();
  const angle = 0.31; scene[0] = scene[5] = Math.cos(angle); scene[1] = Math.sin(angle); scene[4] = -Math.sin(angle); scene[12] = 11; scene[13] = -7;
  const seatedNames = new Set(['sit_idle', 'sit_phone', 'sit_look', 'sit_cross_legs', 'sit_talk']); let checks = 0;
  for (const sample of poseSamples(readPoseBank(), 'all')) {
    const matrices = poseMatrices(rig, sampleRotations(sample.clip, sample.time)), expected = seatedNames.has(sample.clipName) ? 1 : 0;
    assert.equal(evaluatePoseTarget(target, matrices), expected, `${sample.clipName}/${sample.time}`);
    assert.equal(evaluatePoseTarget(target, matrices.map(matrix => multiply(scene, matrix))), expected, 'a moved/rotated resident keeps the same articulated activation');
    checks++;
  }
  assert.equal(checks, 7763, 'the activation proof uses the unchanged complete release schedule');
  assert.equal(evaluatePoseTarget(fixture.prepared, fixture.seated), 1);
  const unilateral = fixture.seated.map(matrix => matrix.slice()); unilateral[2] = identity();
  assert.equal(evaluatePoseTarget(fixture.prepared, unilateral), 0, 'lifting one leg alone does not activate the seated target');
  const midpoint = fixture.seated.map(() => identity()), a = (Math.PI / 4 + 4 * Math.PI / 9) / 2;
  for (const index of [1, 2]) { midpoint[index][5] = midpoint[index][10] = Math.cos(a); midpoint[index][6] = -Math.sin(a); midpoint[index][9] = Math.sin(a); }
  assert.ok(Math.abs(evaluatePoseTarget(fixture.prepared, midpoint) - 0.25) < 1e-12, 'both continuous smoothstep factors contribute during a transition');
  assert.throws(() => preparePoseTarget({ ...fixture.descriptor, delta: new Float32Array([NaN, 0, 0]) }, fixture.names, fixture.rest), /finite/);
  assert.throws(() => preparePoseTarget({ ...fixture.descriptor, activation: { ...fixture.descriptor.activation, fullRadians: 0 } }, fixture.names, fixture.rest), /activation/);
  assert.throws(() => preparePoseTarget(fixture.descriptor, fixture.names.slice(1), fixture.rest.slice(1)), /missing hips/);
  assert.throws(() => evaluatePoseTarget({ ...fixture.prepared }, fixture.seated), /prepared/);
  const singular = fixture.seated.map(matrix => matrix.slice()); singular[0][0] = 0;
  assert.throws(() => evaluatePoseTarget(fixture.prepared, singular), /singular/);
});

test('pose-target-only outside vertices consume the unchanged total bounds and update normals without accumulating', () => {
  const garment = cube(), used = Uint32Array.of(0), body = new ClosedSurface(cube()), delta = new Float32Array(garment.attrs.POSITION.length);
  garment.attrs.POSITION.set([1.05, 0, 0]); delta[0] = 0.05;
  const fixture = poseTargetFixture(delta); garment.poseTarget = fixture.prepared;
  const original = garment.attrs.POSITION.slice(), result = pushOutPose(garment, fixture.seated, [body], { used });
  assert.equal(result.targetWeight, 1); assert.equal(result.targetCount, 1); assert.equal(result.pushCount, 0); assert.equal(result.count, 1, 'a target-only change still requires updated normals');
  assert.ok(result.maxBindPush > 0.0499 && result.maxBindPush < 0.0501); assert.ok(result.maxPush < 0.0501);
  const first = result.bindPositions.slice(), again = pushOutPose(garment, fixture.seated, [body], { used, out: result });
  assert.deepEqual(again.bindPositions, first); assert.deepEqual(garment.attrs.POSITION, original);
  const standing = pushOutPose(garment, fixture.seated.map(() => identity()), [body], { used, out: result });
  assert.equal(standing.targetWeight, 0); assert.equal(standing.count, 0); assert.equal(standing.bindPositions[0], Math.fround(original[0]));
  delta[0] = 0.19;
  assert.throws(() => pushOutPose(garment, fixture.seated, [body], { used }), /pose target exceeds 0.18/, 'an already-outside vertex cannot bypass the bind-space budget');
  delta[0] = 0.1; const scaled = fixture.seated.map(matrix => matrix.slice()); scaled[0][0] = scaled[0][5] = scaled[0][10] = 2;
  assert.throws(() => pushOutPose(garment, scaled, [body], { used }), /pose target exceeds 0.18/, 'an outside vertex also cannot bypass the posed-space budget');
  delta[0] = NaN;
  assert.throws(() => pushOutPose(garment, fixture.seated, [body], { used }), /non-finite pose target/);
  garment.poseTarget = poseTargetFixture(new Float32Array(3)).prepared;
  assert.throws(() => pushOutPose(garment, fixture.seated, [body], { used }), /does not match/);
});

test('pose target plus final push-out share one immutable displacement origin', () => {
  const garment = cube(), used = Uint32Array.of(0), body = new ClosedSurface(cube()), delta = new Float32Array(garment.attrs.POSITION.length);
  garment.attrs.POSITION.set([0.8, 0, 0]); delta[0] = 0.1;
  const fixture = poseTargetFixture(delta); garment.poseTarget = fixture.prepared;
  // Target and push are each about 100 mm. Their combined 202 mm displacement
  // is inadmissible; replacing the source by the target would wrongly pass.
  assert.throws(() => pushOutPose(garment, fixture.seated, [body], { used }), /exceeds 0.18/);
  assert.equal(garment.attrs.POSITION[0], 0.8);
  garment.attrs.POSITION[0] = 0.9; delta[0] = 0.05;
  const result = pushOutPose(garment, fixture.seated, [body], { used });
  assert.equal(result.targetCount, 1); assert.equal(result.pushCount, 1); assert.equal(result.count, 1);
  assert.ok(result.maxBindPush > 0.101 && result.maxBindPush < 0.103); assert.ok(result.maxPush < 0.103);
  assert.equal(body.inside(Array.from(result.posedPositions.subarray(0, 3))), null);
});

test('an actual exported outside garment vertex cannot bypass a corrupt seated target budget', async () => {
  const fit = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))).fits.m_tendero, doc = readWearGlb(join(ROOT, fit.file)), rig = skinInfo(doc, fit.bodyNode);
  const decode = async name => { const node = doc.g.nodes.find(n => n.name === name); return { node, data: await decodePrimitive(doc, doc.g.meshes[node.mesh].primitives[0]) }; };
  const garment = (await decode(fit.garments.trousers.node)).data, clip = readPoseBank().find(row => row.name === 'sit_idle'), matrices = poseMatrices(rig, sampleRotations(clip, clip.duration * 0.25)), surfaces = [];
  for (const [name, ranges] of [[fit.bodyNode, fit.bodyComponents], [fit.bodyLodNode, fit.bodyFarComponents], [fit.proxyNode, fit.proxyComponents]]) {
    const entry = await decode(name); surfaces.push(new ClosedSurface(entry.data, ranges ?? entry.node.extras?.components, name).pose(skinPositions(entry.data, matrices)));
  }
  const points = skinPositions(garment, matrices), vertex = [...usedVertices(garment)].find(v => surfaces.every(surface => !surface.insideXYZ(points[v * 3], points[v * 3 + 1], points[v * 3 + 2])));
  assert.notEqual(vertex, undefined); const delta = new Float32Array(garment.attrs.POSITION.length); delta[vertex * 3] = 0.19;
  garment.poseTarget = preparePoseTarget(poseTargetFixture(delta).descriptor, rig.jointNames, rig.worlds);
  assert.throws(() => pushOutPose(garment, matrices, surfaces, { used: Uint32Array.of(vertex) }), /pose target exceeds 0.18/);
});

test('removing a body triangle or reversing one face fails instead of treating holes as clear', () => {
  let d = cube(); d.indices = d.indices.slice(3); assert.throws(() => new ClosedSurface(d), /open|nonmanifold/);
  d = cube(); [d.indices[1], d.indices[2]] = [d.indices[2], d.indices[1]]; assert.throws(() => new ClosedSurface(d), /wound/);
  d = cube(); d.attrs.POSITION.fill(0); assert.throws(() => new ClosedSurface(d), /degenerate/);
  assert.throws(() => new ClosedSurface(cube(), [{ name: 'hidden hole', firstIndex: 0, indexCount: 33 }]), /omit/);
});

test('every original clip contributes saved keys, intermediate samples and its endpoints', () => {
  const clips = readPoseBank(), samples = poseSamples(clips, 'all');
  assert.equal(clips.length, 32); assert.equal(samples[0].clipName, 'rest');
  for (const clip of clips) {
    const times = new Set(samples.filter(p => p.clipName === clip.name).map(p => p.time));
    assert.ok(times.has(0)); assert.ok(times.has(clip.duration));
    for (const track of clip.tracks) for (const t of track.times) assert.ok(times.has(t), `${clip.name}/${track.name}/${t}`);
    const orderedKeys = [...new Set(clip.tracks.flatMap(t => [...t.times]))].sort((a, b) => a - b);
    // Additional geodesic peaks can split an interval; each such sub-interval
    // has a midpoint. No saved-key interval is checked at its endpoints alone.
    for (let i = 1; i < orderedKeys.length; i++) assert.ok([...times].some(t => t > orderedKeys[i - 1] && t < orderedKeys[i]));
  }
});

test('STEP jumps and their left-hand poses remain in the extreme-pose plan', () => {
  const clip = { name: 'fixture', duration: 2, tracks: [{ name: 'head', interpolation: 'STEP', times: new Float64Array([0, 1, 2]), values: new Float64Array([0, 0, 0, 1, 0, 0.6, 0, 0.8, 0, 0, 0, 1]) }] };
  const samples = poseSamples([clip], 'extrema');
  assert.ok(samples.some(p => p.time === 1)); assert.ok(samples.some(p => p.time < 1 && p.time > 0.99999));
  assert.deepEqual(sampleRotations(clip, 1 - 1e-7).get('head'), [0, 0, 0, 1]);
  assert.deepEqual(sampleRotations(clip, 1).get('head'), [0, 0.6, 0, 0.8]);
});

test('CPU quaternion interpolation agrees with the actual vendored Three.js path', () => {
  for (const clip of readPoseBank()) for (const track of clip.tracks) {
    if (track.interpolation !== 'LINEAR' || track.times.length < 2) continue;
    const i = Math.min(3, track.times.length - 2), fraction = 0.371, time = track.times[i] * (1 - fraction) + track.times[i + 1] * fraction;
    const actual = sampleRotations({ tracks: [track] }, time).get(track.name), wanted = new Float64Array(4);
    const f = (time - track.times[i]) / (track.times[i + 1] - track.times[i]);
    Quaternion.slerpFlat(wanted, 0, track.values, i * 4, track.values, (i + 1) * 4, f);
    actual.forEach((v, k) => assert.ok(Math.abs(v - wanted[k]) < 2e-14, `${clip.name}/${track.name}/${k}`));
  }
});

test('missing clips, unsupported interpolation and malformed joint tracks fail', () => {
  let bank = readClipBank(); bank.g.animations.pop(); assert.throws(() => readPoseBank(bank), /all 32/);
  bank = readClipBank(); bank.g.animations[0].samplers[0].interpolation = 'CUBICSPLINE'; assert.throws(() => readPoseBank(bank), /unsupported interpolation/);
  bank = readClipBank(); bank.g.animations[0].channels[0].target.path = 'translation'; assert.throws(() => readPoseBank(bank), /unsupported animation target/);
  bank = readClipBank(); bank.g.animations[0].channels.pop(); assert.throws(() => readPoseBank(bank), /incomplete/);
});

test('geometry mutations reject over-budget triangles, foreign joints and invalid weights', () => {
  assert.deepEqual(checkGeometry(cube(), 12, 'fixture'), { triangles: 12, usedVertices: 8 });
  assert.throws(() => checkGeometry(cube(), 11, 'fixture'), /triangles exceeds/);
  let d = cube(); d.attrs.JOINTS_0[0] = 21; assert.throws(() => checkGeometry(d, 12, 'fixture'), /invalid skin joint/);
  d = cube(); d.attrs.WEIGHTS_0[0] = 0.5; assert.throws(() => checkGeometry(d, 12, 'fixture'), /unnormalised/);
  d = cube(); d.indices[0] = 800; assert.throws(() => checkGeometry(d, 12, 'fixture'), /index outside/);
  d = cube(); d.attrs.POSITION[0] = Infinity; assert.throws(() => checkGeometry(d, 12, 'fixture'), /non-finite/);
});

test('a declared complete-cut choice must be actual complete near geometry, not metadata alone', () => {
  const near = cube(), far = cube(), fit = { garments: { shirt: {} }, topologyChoices: { shirt: { nearCut: 'complete-far-cut', sourceLod: 1 } } };
  // Reversing the stored row order is a valid independent LOD compaction.
  for (const [name, values] of Object.entries(far.attrs)) {
    const width = values.length / far.vertices, reordered = new Float64Array(values.length);
    for (let v = 0; v < far.vertices; v++) for (let k = 0; k < width; k++) reordered[v * width + k] = values[(far.vertices - 1 - v) * width + k];
    far.attrs[name] = reordered;
  }
  far.indices = far.indices.map(index => far.vertices - 1 - index);
  const entries = [{ gid: 'shirt', lod: 0, decoded: near }, { gid: 'shirt', lod: 1, decoded: far }];
  checkTopologyChoices(fit, entries);
  far.attrs.POSITION[0] += 0.01;
  assert.throws(() => checkTopologyChoices(fit, entries), /declared complete-cut geometry differs/);
  far.attrs.POSITION[0] -= 0.01; far.indices = far.indices.slice(3);
  assert.throws(() => checkTopologyChoices(fit, entries), /omits or changes faces/);
  fit.topologyChoices.shirt.sourceLod = 0;
  assert.throws(() => checkTopologyChoices(fit, entries), /unsupported complete-cut/);
});

function gpuFixture() {
  const g = { buffers: [{ byteLength: 54 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 }, { buffer: 0, byteOffset: 36, byteLength: 12, byteStride: 4, target: 34962 }, { buffer: 0, byteOffset: 48, byteLength: 6, target: 34963 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 3 }, { bufferView: 1, componentType: 5120, normalized: true, type: 'VEC3', count: 3 }, { bufferView: 2, componentType: 5123, type: 'SCALAR', count: 3 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }], nodes: [], extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'] };
  return { g, bin: Buffer.alloc(54) };
}
test('GPU accounting shares actual accessors, and packed attribute alignment is enforced', () => {
  const doc = gpuFixture(); assert.equal(geometryGpuBytes(doc), 54);
  doc.g.meshes.push(structuredClone(doc.g.meshes[0])); assert.equal(geometryGpuBytes(doc), 54, 'a shared pool is uploaded once');
  checkAccessorAlignment(doc, doc.g.meshes[0].primitives[0]);
  doc.g.bufferViews[1].byteStride = 3; assert.throws(() => checkAccessorAlignment(doc, doc.g.meshes[0].primitives[0]), /4-byte-aligned/);
  doc.g.bufferViews[1].byteStride = 4; doc.g.accessors[1].byteOffset = 1; assert.throws(() => checkAccessorAlignment(doc, doc.g.meshes[0].primitives[0]), /4-byte-aligned/);
  doc.g.accessors[1].byteOffset = 0; doc.g.extensionsRequired = []; assert.throws(() => checkAccessorAlignment(doc, doc.g.meshes[0].primitives[0]), /requires KHR_mesh_quantization/);
  doc.g.extensionsRequired = ['KHR_mesh_quantization']; doc.g.accessors[2].normalized = true; assert.throws(() => checkAccessorAlignment(doc, doc.g.meshes[0].primitives[0]), /triangle index format/);
});

test('GPU limit uses actual image dimensions, not a declared compressed file size', () => {
  const b = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b); b.writeUInt32BE(512, 16); b.writeUInt32BE(512, 20);
  const budget = checkGpuBudget(1000000, [{ path: 'atlas.png', bytes: b, width: 512, height: 512 }]); assert.equal(budget.textureBytes, Math.ceil(512 * 512 * 4 * 4 / 3));
  assert.throws(() => checkGpuBudget(LIMITS.gpuBytes, []), /12 MB/);
  b.writeUInt32BE(2048, 16); b.writeUInt32BE(2048, 20);
  assert.throws(() => checkGpuBudget(0, [{ path: 'atlas.png', bytes: b }]), /12 MB/);
  assert.throws(() => checkGpuBudget(0, [{ path: 'atlas.png', bytes: b, width: 512, height: 512 }]), /disagree/);
});

test('compacting corrected buffers preserves referenced identity/skin/mesh data only', () => {
  const doc = gpuFixture(); doc.g.bufferViews.push({ buffer: 0, byteOffset: 54, byteLength: 12 }); doc.g.accessors.push({ bufferView: 3, componentType: 5126, type: 'VEC3', count: 1 });
  doc.g.buffers[0].byteLength = 66; doc.bin = Buffer.alloc(66); doc.bin.fill(77, 0, 54); doc.bin.fill(99, 54);
  doc.g.nodes.push({ name: 'identity', extras: { sourceIndicesAccessor: 2 } });
  const compact = compactBuffers(doc.g, doc.bin); assert.equal(compact.length, 54); assert.equal(doc.g.accessors.length, 3); assert.equal(doc.g.nodes[0].extras.sourceIndicesAccessor, 2);
  assert.ok(compact.every(v => v === 77));
});

test('CPU pose-target references survive compaction and corrupt base/delta references fail', () => {
  function fixture() {
    const doc = gpuFixture(), original = doc.g.accessors;
    doc.g.bufferViews.push({ buffer: 0, byteOffset: 56, byteLength: 12 }, { buffer: 0, byteOffset: 68, byteLength: 36 });
    // Deliberately leave unused accessors before both retained references, so
    // the test proves remapping rather than only keeping the original numbers.
    doc.g.accessors = [{ bufferView: 3, componentType: 5126, type: 'VEC3', count: 1 }, ...original,
      { bufferView: 3, componentType: 5126, type: 'VEC3', count: 1 }, { bufferView: 4, componentType: 5126, type: 'VEC3', count: 3 }];
    doc.g.meshes[0].primitives[0] = { attributes: { POSITION: 1, NORMAL: 2 }, indices: 3 };
    doc.g.nodes.push({ name: 'target', mesh: 0, extras: { poseTarget: { version: 1, kind: 'seated', basePositionAccessor: 1, deltaAccessor: 5,
      activation: { parentJoint: 'hips', thighJoints: ['thigh_l', 'thigh_r'], startRadians: Math.PI / 4, fullRadians: 4 * Math.PI / 9 } } } });
    doc.g.buffers[0].byteLength = 104; doc.bin = Buffer.alloc(104);
    for (let i = 0; i < 9; i++) doc.bin.writeFloatLE((i + 1) * 0.001, 68 + i * 4);
    return doc;
  }
  const doc = fixture(), before = readWearPoseTarget(doc, 'target').delta, budget = geometryGpuBytes(doc), packed = compactBuffers(doc.g, doc.bin);
  assert.equal(doc.g.nodes[0].extras.poseTarget.basePositionAccessor, 0); assert.equal(doc.g.nodes[0].extras.poseTarget.deltaAccessor, 3);
  assert.equal(doc.g.accessors.length, 4); assert.equal(packed.length, 92);
  assert.deepEqual(readWearPoseTarget({ g: doc.g, bin: packed }, 'target').delta, before);
  assert.equal(geometryGpuBytes({ g: doc.g, bin: packed }), budget, 'CPU deltas never become GPU attributes');
  let bad = fixture(); bad.g.nodes[0].extras.poseTarget.basePositionAccessor = 2;
  assert.throws(() => compactBuffers(bad.g, bad.bin), /immutable base POSITION/);
  bad = fixture(); bad.g.nodes[0].extras.poseTarget.deltaAccessor = 99;
  assert.throws(() => readWearPoseTarget(bad, 'target'), /Float32 VEC3/);
  bad = fixture(); bad.g.bufferViews[4].target = 34962;
  assert.throws(() => readWearPoseTarget(bad, 'target'), /CPU buffer/);
  bad = fixture(); bad.bin.writeFloatLE(NaN, 68);
  assert.throws(() => readWearPoseTarget(bad, 'target'), /non-finite/);
  bad = fixture(); bad.g.accessors[5].count--;
  assert.throws(() => readWearPoseTarget(bad, 'target'), /per base vertex/);
  bad = fixture(); bad.g.nodes[0].extras.poseTarget.activation.startRadians = 0;
  assert.throws(() => readWearPoseTarget(bad, 'target'), /activation/);
});

test('inventory mutations catch stale bytes and cannot escape the model directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'ladera-wear-test-'));
  try {
    const data = Buffer.from('actual wearable bytes'); writeFileSync(join(root, 'fit.glb'), data);
    const row = { path: 'fit.glb', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
    checkInventory(root, [row]); writeFileSync(join(root, 'fit.glb'), Buffer.from('changed wearable bytes'));
    assert.throws(() => checkInventory(root, [row]), /stale bytes/);
    assert.throws(() => safePath(root, '../secret'), /escapes/); assert.throws(() => safePath(root, 'https://example.com/file'), /local/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('gzip transport is decoded before geometry checks and GPU accounting', () => {
  const root = mkdtempSync(join(tmpdir(), 'ladera-wear-gzip-'));
  try {
    const fit = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))).fits.m_tendero, path = join(ROOT, fit.file), shipped = readFileSync(path);
    const raw = shipped[0] === 0x1f && shipped[1] === 0x8b ? gunzipSync(shipped) : shipped, compressed = gzipSync(raw), zipped = join(root, 'fit.glb.gz');
    writeFileSync(zipped, compressed);
    const actual = readWearGlb(zipped), original = readWearGlb(path);
    assert.equal(actual.gzip, true); assert.equal(actual.shippedBytes, compressed.length); assert.equal(actual.bytes, raw.length);
    assert.equal(geometryGpuBytes(actual), geometryGpuBytes(original)); assert.deepEqual(actual.g, original.g);
    const broken = Buffer.from(compressed); broken[broken.length - 8] ^= 1; writeFileSync(zipped, broken);
    assert.throws(() => readWearGlb(zipped), /incorrect|invalid|checksum/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('split reports cannot hide changed input, a missing fit, pose, clip, vertex or head check', () => {
  const clipCoverage = Object.fromEntries(['rest', ...CONTRACT.clips].map(n => [n, 1])), count = 33;
  const fits = ['adult_a', 'adult_b'].map(id => ({ id, garments: 23, maxNearTriangles: 1000, maxFarTriangles: 300, geometryBytes: 100,
    bodyComponents: 20, farBodyComponents: 20, proxyComponents: 1, sourceVisibleNode: `identity_${id}`, verticesPerPose: 8, identityVerticesPerPose: 3,
    poses: count, clipCoverage, vertexChecks: 8 * count, proxyEnclosureChecks: 3 * count, rawRestClear: true, rawRestChecks: 8,
    correctedVertices: 1, maxPosePush: 0.05, maxBindPush: 0.05, finalPenetrations: 0, issues: [] }));
  const expected = { schema: 2, mode: 'all', requiredClipCount: 32, samplesPerFit: count, inventoryVerified: true, collisionChecked: false,
    inputs: { sha256: 'current-input-hash', files: [], sampling: { clips: clipCoverage } }, fits, issues: [] };
  const reports = fits.map(fit => ({ ...structuredClone(expected), ok: true, collisionChecked: true, fits: [structuredClone(fit)] }));
  const merged = mergeWearReports(reports, expected); assert.equal(merged.complete, true); assert.equal(merged.fits.length, 2);
  assert.throws(() => mergeWearReports(reports.slice(0, 1), expected), /omit.*adult/);
  assert.throws(() => mergeWearReports([reports[0], reports[0]], expected), /duplicate/);
  let bad = structuredClone(reports); bad[0].inputs.sha256 = 'older-input-hash'; assert.throws(() => mergeWearReports(bad, expected), /inputs changed/);
  bad = structuredClone(reports); bad[0].schema = 1; bad[0].diagnosticOnly = true; assert.throws(() => mergeWearReports(bad, expected), /collision gate/);
  bad = structuredClone(reports); bad[0].collisionChecked = false; assert.throws(() => mergeWearReports(bad, expected), /collision gate/);
  bad = structuredClone(reports); bad[0].fits[0].poses--; assert.throws(() => mergeWearReports(bad, expected), /omitted a pose/);
  bad = structuredClone(reports); delete bad[0].fits[0].clipCoverage[CONTRACT.clips[0]]; assert.throws(() => mergeWearReports(bad, expected), /omitted a pose or clip/);
  bad = structuredClone(reports); bad[0].fits[0].vertexChecks--; assert.throws(() => mergeWearReports(bad, expected), /vertex coverage/);
  bad = structuredClone(reports); bad[0].fits[0].verticesPerPose--; bad[0].fits[0].vertexChecks = bad[0].fits[0].verticesPerPose * count; bad[0].fits[0].rawRestChecks = bad[0].fits[0].verticesPerPose;
  assert.throws(() => mergeWearReports(bad, expected), /geometry changed/);
  bad = structuredClone(reports); bad[0].fits[0].proxyEnclosureChecks--; assert.throws(() => mergeWearReports(bad, expected), /head enclosure/);
  bad = structuredClone(reports); bad[0].fits[0].rawRestClear = false; assert.throws(() => mergeWearReports(bad, expected), /raw rest/);
  bad = structuredClone(reports); bad[0].fits[0].maxPosePush = 0.181; assert.throws(() => mergeWearReports(bad, expected), /excessive pose correction/);
});

test('all shipped adult fits preserve skin ABI, budgets, catalogue and exact generated data', async () => {
  const report = await validateWear({ collision: false });
  assert.ok(report.ok); assert.equal(report.fits.length, 23); assert.ok(report.gpuBytes < 12000000);
  assert.ok(report.fits.every(f => f.garments === 23 && f.maxNearTriangles <= 1800));
  assert.equal(report.complete, false, 'structure-only inspection is never presented as a completed collision sweep');
  for (const path of ['tools/blender/people_wear_build.py', 'tools/blender/people_wear_shapes.py', 'tools/blender/people_wear_fit_faces.mjs', 'tools/blender/people_wear_fit_targets.mjs',
    'tools/blender/people_build.py', 'tools/blender/people_cast.py', 'assets/models/garments/prints.png', 'js/people/wear_pose.js']) {
    const entry = report.inputs.files.find(file => file.path === path), bytes = readFileSync(resolve(ROOT, '../..', path));
    assert.ok(entry, `${path}: authoring recipe must be part of the release fingerprint`);
    assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(entry.bytes, bytes.length);
  }
});

test('the complete clearance certificate matches every current asset, recipe and checker byte', async () => {
  const path = resolve(ROOT, '../../dev/wear/clearance.json');
  const guidance = 'Run the mandatory full gate: LADERA_PRIO=idle node la-ladera/tools/blender/people_wear_validate.mjs --mode all --report la-ladera/dev/wear/clearance.json';
  let certificate;
  try { certificate = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { assert.fail(`Missing or invalid complete clearance certificate (${error.message}). ${guidance}`); }
  assert.equal(certificate.complete, true, `A partial or diagnostic report is not a release certificate. ${guidance}`);
  try {
    const expected = await validateWear({ mode: 'all', collision: false });
    assert.ok(expected.ok, 'current assets must pass the independent structural and inventory checks');
    const verified = mergeWearReports([certificate], expected);
    assert.equal(verified.complete, true); assert.equal(verified.fits.length, 23);
  } catch (error) { assert.fail(`Stale or incomplete clearance certificate (${error.message}). ${guidance}`); }
});

test('face authoring preserves shared cuts and rejects an extra 81 mm above its exact raw baseline', async () => {
  const metadata = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))), fit = metadata.fits.m_tendero;
  const shipped = readWearGlb(join(ROOT, fit.file)), shippedBefore = createHash('sha256').update(JSON.stringify(shipped.g)).update(shipped.bin).digest('hex');
  assert.ok(shipped.g.nodes.some(node => node.extras?.poseTarget), 'the shipped fixture includes the later seated-target stage');
  // Face authoring precedes seated targets. Replacing its base POSITION must
  // reject a later-stage target reference instead of silently rebasing it.
  await assert.rejects(() => fitWearFaces(shipped, shipped, fit, { id: 'm_tendero' }), /pose target: reference does not match immutable base POSITION/);
  assert.equal(createHash('sha256').update(JSON.stringify(shipped.g)).update(shipped.bin).digest('hex'), shippedBefore, 'rejected stage order must preserve the shipped input');
  // Use the clear exported physical positions as a no-op pre-target fixture.
  // Remove only later-stage CPU-target metadata, as in the seated-authoring
  // fixture below; retain every body/garment byte and all original assertions.
  const input = { ...shipped, g: structuredClone(shipped.g), bin: Buffer.from(shipped.bin) };
  for (const node of input.g.nodes) if (node.extras) delete node.extras.poseTarget;
  assert.deepEqual(input.bin, shipped.bin, 'the pre-target fixture must retain every physical mesh byte');
  const before = createHash('sha256').update(JSON.stringify(input.g)).update(input.bin).digest('hex');
  const result = await fitWearFaces(input, input, fit, { id: 'm_tendero' }), output = parseGlb(result.bytes);
  assert.equal(createHash('sha256').update(JSON.stringify(input.g)).update(input.bin).digest('hex'), before, 'authoring must not mutate its pristine input');
  assert.equal(result.report.authoringOnly, true); assert.equal(result.report.complete, false);
  assert.equal(result.report.maxDisplacementLimitM, 0.08); assert.equal(result.report.faceFailures, 0); assert.ok(result.report.rawRestClear);
  assert.deepEqual(result.report.garmentIds, FACE_GARMENTS);
  const primitive = (doc, name) => { const node = doc.g.nodes.find(n => n.name === name); return doc.g.meshes[node.mesh].primitives[0]; };
  let expectedChecks = 0;
  for (const gid of FACE_GARMENTS) for (const name of [fit.garments[gid].node, fit.garments[gid].lodNode]) expectedChecks += readAccessor(output, primitive(output, name).indices).length / 3 * 4;
  assert.equal(result.report.faceChecks, expectedChecks, 'authoring verifies every near/far centroid and edge midpoint');
  for (const [a, b] of [['trousers', 'jeans'], ['shorts', 'swim_trunks']]) {
    assert.equal(primitive(output, fit.garments[a].node).attributes.POSITION, primitive(output, fit.garments[b].node).attributes.POSITION);
    assert.equal(primitive(output, fit.garments[a].node).attributes.NORMAL, primitive(output, fit.garments[b].node).attributes.NORMAL);
  }
  const corrupt = { ...input, g: structuredClone(input.g), bin: Buffer.from(input.bin) }, p = primitive(corrupt, fit.garments.rash_vest.node), vertex = readAccessor(corrupt, p.indices)[0];
  const accessor = corrupt.g.accessors[p.attributes.POSITION], view = corrupt.g.bufferViews[accessor.bufferView], offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + vertex * (view.byteStride ?? 12);
  corrupt.bin.writeFloatLE(corrupt.bin.readFloatLE(offset) + 0.081, offset);
  await assert.rejects(() => fitWearFaces(input, corrupt, fit, { id: 'm_tendero' }), /cumulative 80 mm/);
  await assert.rejects(() => fitWearFaces(input, input, fit, { id: 'm_tendero', maxPasses: 0 }), /invalid face authoring options/);
  await assert.rejects(() => fitWearFaces(input, input, fit, { id: 'm_tendero', garmentIds: ['rash_vest'] }), /retain every original guarded design/);
});

test('seated authoring rejects an existing target as a new origin and preserves the pristine 80 mm base bound', async () => {
  const fit = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))).fits.m_tendero, input = readWearGlb(join(ROOT, fit.file));
  await assert.rejects(() => fitWearPoseTargets(input, input, fit, { id: 'm_tendero', maxPasses: 0 }), /invalid seated target authoring/);
  const alreadyExported = { ...input, g: structuredClone(input.g), bin: Buffer.from(input.bin) }, node = alreadyExported.g.nodes.find(n => n.name === fit.garments.trousers.node);
  node.extras = { ...node.extras, poseTarget: { version: 1, kind: 'seated' } };
  await assert.rejects(() => fitWearPoseTargets(input, alreadyExported, fit, { id: 'm_tendero' }), /existing target is not a new baseline/);
  // A no-op pristine fixture can start from a clear exported POSITION stream,
  // with CPU targets removed. The mutation still changes the physical bytes;
  // it is not a checksum or author-report failure.
  const raw = { ...input, g: structuredClone(input.g), bin: Buffer.from(input.bin) };
  for (const n of raw.g.nodes) if (n.extras) delete n.extras.poseTarget;
  const corrupt = { ...raw, g: structuredClone(raw.g), bin: Buffer.from(raw.bin) }, name = Object.values(fit.garments)[0].node;
  const first = corrupt.g.nodes.find(n => n.name === name), primitive = corrupt.g.meshes[first.mesh].primitives[0], vertex = readAccessor(corrupt, primitive.indices)[0];
  const accessor = corrupt.g.accessors[primitive.attributes.POSITION], view = corrupt.g.bufferViews[accessor.bufferView], offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + vertex * (view.byteStride ?? 12);
  corrupt.bin.writeFloatLE(corrupt.bin.readFloatLE(offset) + 0.081, offset);
  await assert.rejects(() => fitWearPoseTargets(raw, corrupt, fit, { id: 'm_tendero' }), /cumulative 80 mm from pristine raw/);
});

test('a declared complete target set cannot omit one real long-garment LOD', async () => {
  const fit = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))).fits.m_tendero, doc = readWearGlb(join(ROOT, fit.file));
  const node = doc.g.nodes.find(n => n.name === fit.garments.trousers.node);
  if (node.extras) delete node.extras.poseTarget;
  await assert.rejects(() => inspectFit(doc, { ...fit, poseTargetCpuBytes: fit.poseTargetCpuBytes || 4 }, { id: 'm_tendero', collision: false }), /missing required seated pose target/);
});

test('adult policy, eligibility, beach separation and colour sets reject corrupt input', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.people-wear.json'))), meta = JSON.parse(readFileSync(join(ROOT, 'people/people_meta.json'))), palette = JSON.parse(readFileSync(join(ROOT, 'garments/palette.json')));
  checkWearPolicy(manifest, meta, palette);
  let bad = structuredClone(manifest); bad.fits.b_boy = bad.fits.m_tendero; assert.throws(() => checkWearPolicy(bad, meta, palette), /nonadult/);
  bad = structuredClone(manifest); bad.garments[0].variants.push('invented_colour'); assert.throws(() => checkWearPolicy(bad, meta, palette), /colour/);
  bad = structuredClone(manifest); bad.garments.find(g => g.id === 'bikini_top').contexts.push('daily'); assert.throws(() => checkWearPolicy(bad, meta, palette), /beach-only/);
  bad = structuredClone(manifest); bad.garments.pop(); assert.throws(() => checkWearPolicy(bad, meta, palette), /required design/);
  bad = structuredClone(manifest); bad.defaultEnabled = true; assert.throws(() => checkWearPolicy(bad, meta, palette), /disabled by default/);
});

test('mutating an exported inverse bind matrix is rejected by the real skin check', () => {
  const metadata = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))), fit = metadata.fits.m_tendero;
  const doc = readWearGlb(join(ROOT, fit.file));
  const mesh = doc.g.nodes.find(n => n.name === fit.bodyNode), skin = doc.g.skins[mesh.skin], ai = doc.g.accessors[skin.inverseBindMatrices], view = doc.g.bufferViews[ai.bufferView], offset = (view.byteOffset ?? 0) + (ai.byteOffset ?? 0);
  const original = skinInfo(doc, fit.bodyNode), source = skinInfo(readGlb(join(ROOT, 'people/people.glb')), 'person_m_tendero_mesh'); compareSkin(original, source);
  const reordered = { ...original, jointNames: [...original.jointNames].reverse() };
  assert.throws(() => compareSkin(reordered, source), /joint order changed/);
  doc.bin.writeFloatLE(doc.bin.readFloatLE(offset) + 0.25, offset);
  assert.throws(() => skinInfo(doc, fit.bodyNode), /inverse bind/);
});

test('a real exported garment vertex moved inside its body fails geometry, independent of hashes', async context => {
  const metadata = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))), fit = metadata.fits.m_tendero;
  const doc = readWearGlb(join(ROOT, fit.file));
  const readMesh = async name => { const n = doc.g.nodes.find(n => n.name === name), p = doc.g.meshes[n.mesh].primitives[0]; return { n, p, d: await decodePrimitive(doc, p) }; };
  const body = await readMesh(fit.bodyNode), cloth = await readMesh(fit.garments.tshirt.node), rig = skinInfo(doc, fit.bodyNode), matrices = poseMatrices(rig);
  const surface = new ClosedSurface(body.d, fit.bodyComponents); surface.pose(skinPositions(body.d, matrices));
  const positions = skinPositions(cloth.d, matrices), vertex = [...usedVertices(cloth.d)].find(v => !surface.insideXYZ(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]));
  assert.notEqual(vertex, undefined, 'positive-control garment vertex exists outside the body');
  assert.deepEqual(checkPenetrations([surface], cloth.d, positions, matrices, { used: Uint32Array.of(vertex) }), []);
  const torso = fit.bodyComponents.find(c => c.name === 'torso'), torsoIndices = body.d.indices.subarray(torso.firstIndex, torso.firstIndex + torso.indexCount), ids = [...new Set(torsoIndices)], centre = [0, 0, 0];
  for (const i of ids) for (let k = 0; k < 3; k++) centre[k] += body.d.attrs.POSITION[i * 3 + k] / ids.length;
  assert.ok(surface.inside(centre), 'the injected position is inside the actual closed torso');
  const ai = doc.g.accessors[cloth.p.attributes.POSITION], view = doc.g.bufferViews[ai.bufferView]; assert.equal(ai.componentType, 5126);
  const offset = (view.byteOffset ?? 0) + (ai.byteOffset ?? 0) + vertex * (view.byteStride ?? 12);
  for (let k = 0; k < 3; k++) doc.bin.writeFloatLE(centre[k], offset + k * 4);
  const corrupt = await decodePrimitive(doc, cloth.p), badPositions = skinPositions(corrupt, matrices), failures = checkPenetrations([surface], corrupt, badPositions, matrices, { used: Uint32Array.of(vertex), push: true });
  assert.equal(failures.length, 1); assert.equal(failures[0].vertex, vertex); assert.ok(failures[0].depth > 0.01); assert.ok(failures[0].deltaBind.every(Number.isFinite));
  const samples = [{ clip: null, clipName: 'rest', time: 0 }, ...readPoseBank().map(clip => ({ clip, clipName: clip.name, time: 0 }))];
  const rejected = await inspectFit(doc, fit, { id: 'm_tendero', sourceGlb: readGlb(join(ROOT, 'people/people.glb')), samples, issueLimit: 10000 });
  assert.ok(rejected.issues.some(i => i.kind === 'penetration' && i.vertex === vertex && i.garments.some(g => g.startsWith('tshirt:'))));
  assert.equal(rejected.rawRestClear, false); assert.equal(rejected.poses, 0); assert.equal(rejected.correctedVertices, 0, 'pose correction must not silently heal corrupt authored rest input');
  context.diagnostic(JSON.stringify({ mutation: 'actual exported tshirt POSITION', fit: 'm_tendero', vertex,
    penetrationM: failures[0].depth, rawRestClear: rejected.rawRestClear, processedPoses: rejected.poses,
    correctedVertices: rejected.correctedVertices, rejectedBeforePose: true }));
});

test('exact grazing poses found by the full release sweep remain clear within the original correction bound', async () => {
  const metadata = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))), clips = readPoseBank();
  const cases = [
    ['m_tendero', 'swimsuit_onepiece', 'idle_b', 0.2083333283662796],
    ['w_elder', 'shorts', 'walk_fast', 0.375],
    ['m_elder', 'blouse', 'idle_a', 0.04680224448610583],
    ['w_vecina', 'rash_vest', 'idle_a', 3.125],
    ['w_vecina', 'tshirt', 'laundry', 1.0104166269302368],
    ['w_ama', null, 'phone_stand', 0.3645833358269678],
  ];
  for (const [id, garmentId, clipName, time] of cases) {
    const fit = metadata.fits[id], doc = readWearGlb(join(ROOT, fit.file));
    const mesh = async name => { const entry = await readWearGeometry(doc, name); return { ...entry, data: entry.decoded }; };
    const matrices = poseMatrices(skinInfo(doc, fit.bodyNode), sampleRotations(clips.find(c => c.name === clipName), time)), surfaces = [];
    for (const [name, ranges] of [[fit.bodyNode, fit.bodyComponents], [fit.bodyLodNode, fit.bodyFarComponents], [fit.proxyNode, fit.proxyComponents]]) {
      const entry = await mesh(name); surfaces.push(new ClosedSurface(entry.data, ranges ?? entry.node.extras?.components ?? null, name).pose(skinPositions(entry.data, matrices)));
    }
    for (const gid of garmentId ? [garmentId] : Object.keys(fit.garments)) {
      for (const name of [fit.garments[gid].node, fit.garments[gid].lodNode]) {
        const entry = await mesh(name), used = usedVertices(entry.data), result = pushOutPose(entry.data, matrices, surfaces, { used, maxDistance: 0.18 });
        assert.ok(result.maxPush <= 0.18 && result.maxBindPush <= 0.18, `${id}/${gid}/${name}/${clipName}/${time}`);
        assert.deepEqual(checkPenetrations(surfaces, entry.data, result.posedPositions, matrices, { used }), []);
      }
    }
  }
});

test('actual folded-arm poses leave every corrected garment vertex outside signed solid-angle occupancy', async context => {
  const metadata = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))), clips = readPoseBank(), failures = [];
  let checks = 0, solidAngleChecks = 0;
  for (const id of ['w_joven', 'm_tendero', 'w_vecina']) {
    const fit = metadata.fits[id], doc = readWearGlb(join(ROOT, fit.file));
    const mesh = async name => { const entry = await readWearGeometry(doc, name); return { ...entry, data: entry.decoded }; };
    const bodies = [];
    for (const [name, ranges] of [[fit.bodyNode, fit.bodyComponents], [fit.bodyLodNode, fit.bodyFarComponents], [fit.proxyNode, fit.proxyComponents]]) {
      const entry = await mesh(name); bodies.push({ ...entry, surface: new ClosedSurface(entry.data, ranges ?? entry.node.extras?.components ?? null, name) });
    }
    const garments = [];
    for (const [gid, row] of Object.entries(fit.garments)) {
      const near = await mesh(row.node), far = await mesh(row.lodNode);
      for (const [lod, entry] of [[0, near], [1, far]]) garments.push({ gid, lod, entry, used: usedVertices(entry.data) });
    }
    for (const clipName of ['idle_b', 'phone_call']) {
      const clip = clips.find(c => c.name === clipName), time = clip.duration * 0.37;
      const matrices = poseMatrices(skinInfo(doc, fit.bodyNode), sampleRotations(clip, time));
      for (const body of bodies) body.surface.pose(skinPositions(body.data, matrices));
      const surfaces = bodies.map(body => body.surface);
      for (const { gid, lod, entry, used } of garments) {
        const result = pushOutPose(entry.data, matrices, surfaces, { used, maxDistance: 0.18 });
        assert.ok(result.maxBindPush <= 0.18 && result.maxPush <= 0.18);
        for (const vertex of used) {
          checks++; const point = Array.from(result.posedPositions.subarray(vertex * 3, vertex * 3 + 3));
          for (const surface of surfaces) for (const part of surface.components) {
            const b = part.root.b;
            if (point[0] < b[0] || point[0] > b[3] || point[1] < b[1] || point[1] > b[4] || point[2] < b[2] || point[2] > b[5]) continue;
            solidAngleChecks++;
            if (surface.windingInside(part, ...point) && failures.length < 24) failures.push({ id, garment: gid, lod, clip: clipName, time, vertex, surface: surface.label, component: part.name, point });
          }
        }
      }
    }
  }
  context.diagnostic(JSON.stringify({ foldedArmSolidAngleChecks: { vertices: checks, solidAngleChecks, failures } }));
  assert.ok(checks > 20000, 'the folded-arm regression must inspect the actual exported garments');
  assert.deepEqual(failures, [], 'oriented solid-angle occupancy must independently reject a false clear from an even number of crossings');
});

test('bust, crotch and hip garment faces clear the rendered body at both contact-sheet LODs', async context => {
  const metadata = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))), clip = readPoseBank().find(c => c.name === 'idle_a');
  const garmentIds = ['rash_vest', 'leggings', 'skirt', 'briefs', 'boxers', 'bikini_bottom', 'swimsuit_onepiece'], failures = [];
  const componentCounts = new Map(), garmentCounts = new Map(), files = []; let checks = 0, triangles = 0, failedProbes = 0;
  for (const id of ['w_joven', 'm_tendero', 'w_vecina']) {
    const fit = metadata.fits[id], doc = readWearGlb(join(ROOT, fit.file));
    files.push({ id, file: fit.file, bytes: doc.shippedBytes, sha256: doc.shippedSha256 });
    const mesh = async name => { const entry = await readWearGeometry(doc, name); return { ...entry, data: entry.decoded }; };
    const matrices = poseMatrices(skinInfo(doc, fit.bodyNode), sampleRotations(clip, clip.duration * 0.27)), surfaces = [];
    for (const [name, ranges] of [[fit.bodyNode, fit.bodyComponents], [fit.bodyLodNode, fit.bodyFarComponents], [fit.proxyNode, fit.proxyComponents]]) {
      const entry = await mesh(name); surfaces.push(new ClosedSurface(entry.data, ranges ?? entry.node.extras?.components ?? null, name).pose(skinPositions(entry.data, matrices)));
    }
    for (const gid of garmentIds) {
      const near = await mesh(fit.garments[gid].node), far = await mesh(fit.garments[gid].lodNode);
      for (const [lod, entry] of [[0, near], [1, far]]) {
        const used = usedVertices(entry.data), { posedPositions: p } = pushOutPose(entry.data, matrices, surfaces, { used, maxDistance: 0.18 });
        const ix = entry.data.indices, garmentRow = { id, garment: gid, lod, triangles: ix.length / 3, probes: 0, failedProbes: 0 };
        garmentCounts.set([id, gid, lod].join('/'), garmentRow);
        for (let t = 0; t < ix.length; t += 3) {
          triangles++;
          const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
          const probes = [[(p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3],
            ...[[a, b], [b, c], [c, a]].map(([u, v]) => [(p[u] + p[v]) / 2, (p[u + 1] + p[v + 1]) / 2, (p[u + 2] + p[v + 2]) / 2])];
          for (let probe = 0; probe < probes.length; probe++) {
            const point = probes[probe]; checks++; garmentRow.probes++; let penetrated = false;
            for (const surface of surfaces) for (const part of surface.components) if (surface.containsPart(part, ...point)) {
              penetrated = true;
              const key = [id, gid, lod, surface.label, part.name].join('/');
              if (!componentCounts.has(key)) componentCounts.set(key, { id, garment: gid, lod, surface: surface.label, component: part.name, probes: 0, maxDepth: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
              const row = componentCounts.get(key); row.probes++; row.maxDepth = Math.max(row.maxDepth, surface.nearest(point, part).distance);
              for (let k = 0; k < 3; k++) { row.min[k] = Math.min(row.min[k], point[k]); row.max[k] = Math.max(row.max[k], point[k]); }
              if (failures.length < 24) failures.push({ id, garment: gid, lod, triangle: t / 3, probe: probe === 0 ? 'centroid' : `edge${probe}`, surface: surface.label, component: part.name, point });
            }
            if (penetrated) { failedProbes++; garmentRow.failedProbes++; }
          }
        }
      }
    }
  }
  context.diagnostic(JSON.stringify({ faceProbeSummary: { fits: 3, files, garmentsPerFit: garmentIds.length, lods: 2, clip: 'idle_a', phase: 0.27, triangles, probes: checks, failedProbes, garments: [...garmentCounts.values()], components: [...componentCounts.values()] } }));
  assert.ok(checks > 10000, 'the focused face regression must actually inspect exported triangles');
  assert.deepEqual(failures, [], `face-interior clothing penetrations: ${JSON.stringify(failures)}`);
});

test('seated trousers, jeans and leggings clear both actual body LODs across their complete faces', async context => {
  const metadata = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))), clip = readPoseBank().find(c => c.name === 'sit_idle');
  const failures = [], rows = [], files = []; let probes = 0, failedProbes = 0;
  for (const id of ['w_joven', 'm_tendero', 'w_vecina']) {
    const fit = metadata.fits[id], doc = readWearGlb(join(ROOT, fit.file)); files.push({ id, sha256: doc.shippedSha256 });
    const mesh = async name => { const entry = await readWearGeometry(doc, name); return { ...entry, data: entry.decoded }; };
    const matrices = poseMatrices(skinInfo(doc, fit.bodyNode), sampleRotations(clip, clip.duration * 0.25)), surfaces = [];
    for (const [name, ranges] of [[fit.bodyNode, fit.bodyComponents], [fit.bodyLodNode, fit.bodyFarComponents], [fit.proxyNode, fit.proxyComponents]]) {
      const entry = await mesh(name); surfaces.push(new ClosedSurface(entry.data, ranges ?? entry.node.extras?.components ?? null, name).pose(skinPositions(entry.data, matrices)));
    }
    for (const gid of ['trousers', 'jeans', 'leggings']) {
      const near = await mesh(fit.garments[gid].node), far = await mesh(fit.garments[gid].lodNode);
      for (const [lod, entry] of [[0, near], [1, far]]) {
        const used = usedVertices(entry.data), { posedPositions: p } = pushOutPose(entry.data, matrices, surfaces, { used, maxDistance: 0.18 });
        const row = { id, garment: gid, lod, triangles: entry.data.indices.length / 3, probes: 0, failedProbes: 0, maxDepth: 0, components: {} }; rows.push(row);
        const ix = entry.data.indices;
        for (let t = 0; t < ix.length; t += 3) {
          const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]].map(v => v * 3);
          const points = [[0, 1, 2].map(k => (p[a + k] + p[b + k] + p[c + k]) / 3), ...[[a, b], [b, c], [c, a]].map(([u, v]) => [0, 1, 2].map(k => (p[u + k] + p[v + k]) / 2))];
          for (const point of points) {
            probes++; row.probes++; let penetrated = false;
            for (const surface of surfaces) for (const part of surface.components) if (surface.containsPart(part, ...point)) {
              penetrated = true; const component = `${surface.label}/${part.name}`;
              row.components[component] = (row.components[component] ?? 0) + 1;
              row.maxDepth = Math.max(row.maxDepth, surface.nearest(point, part).distance);
              if (failures.length < 24) failures.push({ id, garment: gid, lod, triangle: t / 3, component, point });
            }
            if (penetrated) { failedProbes++; row.failedProbes++; }
          }
        }
      }
    }
  }
  context.diagnostic(JSON.stringify({ seatedFaceProbeSummary: { files, clip: 'sit_idle', phase: 0.25, probes, failedProbes, rows } }));
  assert.ok(probes > 10000, 'the seated regression must inspect the actual near/far exported triangles');
  assert.deepEqual(failures, [], `seated face-interior clothing penetrations: ${JSON.stringify(failures)}`);
});

test('far everyday tops clear both actual body LODs across their complete idle faces', async context => {
  const metadata = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))), clip = readPoseBank().find(c => c.name === 'idle_a');
  const failures = [], rows = [], files = []; let probes = 0, failedProbes = 0;
  for (const id of ['w_joven', 'm_tendero', 'w_vecina']) {
    const fit = metadata.fits[id], doc = readWearGlb(join(ROOT, fit.file)); files.push({ id, sha256: doc.shippedSha256 });
    const mesh = async name => { const entry = await readWearGeometry(doc, name); return { ...entry, data: entry.decoded }; };
    const matrices = poseMatrices(skinInfo(doc, fit.bodyNode), sampleRotations(clip, clip.duration * 0.27)), surfaces = [];
    for (const [name, ranges] of [[fit.bodyNode, fit.bodyComponents], [fit.bodyLodNode, fit.bodyFarComponents], [fit.proxyNode, fit.proxyComponents]]) {
      const entry = await mesh(name); surfaces.push(new ClosedSurface(entry.data, ranges ?? entry.node.extras?.components ?? null, name).pose(skinPositions(entry.data, matrices)));
    }
    for (const gid of ['tshirt', 'shirt', 'blouse', 'jumper']) {
      const far = await mesh(fit.garments[gid].lodNode), used = usedVertices(far.data);
      const { posedPositions: p } = pushOutPose(far.data, matrices, surfaces, { used, maxDistance: 0.18 });
      const row = { id, garment: gid, lod: 1, triangles: far.data.indices.length / 3, probes: 0, failedProbes: 0, maxDepth: 0, components: {} }; rows.push(row);
      const ix = far.data.indices;
      for (let t = 0; t < ix.length; t += 3) {
        const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]].map(v => v * 3);
        const points = [[0, 1, 2].map(k => (p[a + k] + p[b + k] + p[c + k]) / 3), ...[[a, b], [b, c], [c, a]].map(([u, v]) => [0, 1, 2].map(k => (p[u + k] + p[v + k]) / 2))];
        for (const point of points) {
          probes++; row.probes++; let penetrated = false;
          for (const surface of surfaces) for (const part of surface.components) if (surface.containsPart(part, ...point)) {
            penetrated = true; const component = `${surface.label}/${part.name}`;
            row.components[component] = (row.components[component] ?? 0) + 1;
            row.maxDepth = Math.max(row.maxDepth, surface.nearest(point, part).distance);
            if (failures.length < 24) failures.push({ id, garment: gid, lod: 1, triangle: t / 3, component, point });
          }
          if (penetrated) { failedProbes++; row.failedProbes++; }
        }
      }
    }
  }
  context.diagnostic(JSON.stringify({ farTopFaceProbeSummary: { files, clip: 'idle_a', phase: 0.27, probes, failedProbes, rows } }));
  assert.ok(probes > 10000, 'the far-top regression must inspect the actual exported triangles');
  assert.deepEqual(failures, [], `far-top face-interior clothing penetrations: ${JSON.stringify(failures)}`);
});

test('every garment has clear complete near and far faces on the three idle contact-sheet bodies', async context => {
  const metadata = JSON.parse(readFileSync(join(ROOT, 'wear/metadata.json'))), clip = readPoseBank().find(c => c.name === 'idle_a');
  const failures = [], rows = [], files = []; let probes = 0, failedProbes = 0;
  for (const id of ['w_joven', 'm_tendero', 'w_vecina']) {
    const fit = metadata.fits[id], doc = readWearGlb(join(ROOT, fit.file)); files.push({ id, sha256: doc.shippedSha256 });
    assert.equal(Object.keys(fit.garments).length, 23, 'the complete contact guard includes every design');
    const mesh = async name => { const entry = await readWearGeometry(doc, name); return { ...entry, data: entry.decoded }; };
    const matrices = poseMatrices(skinInfo(doc, fit.bodyNode), sampleRotations(clip, clip.duration * 0.27)), surfaces = [];
    for (const [name, ranges] of [[fit.bodyNode, fit.bodyComponents], [fit.bodyLodNode, fit.bodyFarComponents], [fit.proxyNode, fit.proxyComponents]]) {
      const entry = await mesh(name); surfaces.push(new ClosedSurface(entry.data, ranges ?? entry.node.extras?.components ?? null, name).pose(skinPositions(entry.data, matrices)));
    }
    for (const [gid, garment] of Object.entries(fit.garments)) {
      const near = await mesh(garment.node), far = await mesh(garment.lodNode);
      for (const [lod, entry] of [[0, near], [1, far]]) {
        const used = usedVertices(entry.data), { posedPositions: p } = pushOutPose(entry.data, matrices, surfaces, { used, maxDistance: 0.18 });
        const row = { id, garment: gid, lod, triangles: entry.data.indices.length / 3, probes: 0, failedProbes: 0, maxDepth: 0, components: {} }; rows.push(row);
        const ix = entry.data.indices;
        for (let t = 0; t < ix.length; t += 3) {
          const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]].map(v => v * 3);
          const points = [[0, 1, 2].map(k => (p[a + k] + p[b + k] + p[c + k]) / 3), ...[[a, b], [b, c], [c, a]].map(([u, v]) => [0, 1, 2].map(k => (p[u + k] + p[v + k]) / 2))];
          for (const point of points) {
            probes++; row.probes++; let penetrated = false;
            for (const surface of surfaces) for (const part of surface.components) if (surface.containsPart(part, ...point)) {
              penetrated = true; const component = `${surface.label}/${part.name}`;
              row.components[component] = (row.components[component] ?? 0) + 1;
              row.maxDepth = Math.max(row.maxDepth, surface.nearest(point, part).distance);
              if (failures.length < 24) failures.push({ id, garment: gid, lod, triangle: t / 3, component, point });
            }
            if (penetrated) { failedProbes++; row.failedProbes++; }
          }
        }
      }
    }
  }
  context.diagnostic(JSON.stringify({ completeIdleFaceProbeSummary: { files, clip: 'idle_a', phase: 0.27, garmentsPerFit: 23, probes, failedProbes, rows } }));
  assert.equal(rows.length, 3 * 23 * 2, 'no garment or contact-sheet LOD may be omitted');
  assert.ok(probes > 100000, 'the complete idle guard must inspect the actual exported triangles');
  assert.deepEqual(failures, [], `idle face-interior clothing penetrations: ${JSON.stringify(failures)}`);
});

test('push-out inversion rejects a singular skin transform', () => {
  assert.deepEqual(inverseVector(identity(), [0.1, 0.2, -0.1]), [0.1, 0.2, -0.1]);
  assert.throws(() => inverseVector(new Float64Array(16), [1, 0, 0]), /singular/);
});
