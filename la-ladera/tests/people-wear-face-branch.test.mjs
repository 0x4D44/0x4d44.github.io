import './nice.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ClosedSurface, identity, skinPositions } from '../tools/blender/people_wear_math.mjs';

const source = process.env.PEOPLE_WEAR_FACE_TEST_MODULE ? pathToFileURL(process.env.PEOPLE_WEAR_FACE_TEST_MODULE).href : new URL('../tools/blender/people_wear_fit_faces.mjs', import.meta.url).href;
const { repairFaceBranches, boundedMove, protectRest, restartStalledFaces, IDLE_FACE_GARMENTS, FACE_GARMENTS } = await import(source);
const BARYCENTRIC = [[1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5]];
const point = (p, v) => Array.from(p.subarray(v * 3, v * 3 + 3));
const inside = (surfaces, p) => surfaces.some(surface => surface.insideXYZ(...p));
const distance = (a, b) => Math.hypot(...a.map((value, k) => value - b[k]));

function box(center = [0, 0, 0], half = [.02, .02, .02]) {
  const positions = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].flatMap(p => p.map((value, k) => center[k] + value * half[k]));
  const decoded = { vertices: 8, indices: Uint32Array.from([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]), attrs: { POSITION: Float64Array.from(positions) } };
  return new ClosedSurface(decoded);
}

function cloth(points = [[-.04,0,0],[.04,0,0],[0,.05,0]], faces = [[0,1,2]], copies = 2) {
  const vertices = points.length * copies, indices = [];
  for (let copy = 0; copy < copies; copy++) for (const face of faces) indices.push(...face.map(v => v + copy * points.length));
  const decoded = { vertices, indices: Uint32Array.from(indices), attrs: {
    POSITION: Float32Array.from(Array.from({ length: copies }, () => points.flat()).flat()),
    NORMAL: Float32Array.from(Array.from({ length: vertices }, () => [0, 0, 1]).flat()),
    TEXCOORD_0: Float32Array.from(Array.from({ length: vertices }, (_, i) => [i / vertices, .5]).flat()),
    JOINTS_0: new Uint8Array(vertices * 4), WEIGHTS_0: Float32Array.from(Array.from({ length: vertices }, () => [1, 0, 0, 0]).flat()),
  } };
  const membersFor = new Map();
  for (let v = 0; v < points.length; v++) {
    const group = Array.from({ length: copies }, (_, copy) => v + copy * points.length);
    for (const member of group) membersFor.set(member, group);
  }
  const triangles = Array.from({ length: indices.length / 3 }, (_, i) => indices.slice(i * 3, i * 3 + 3));
  return { label: 'independent cloth fixture', decoded, original: new Float64Array(decoded.attrs.POSITION), used: Uint32Array.from(new Set(indices)), membersFor, triangles, maximum: 0 };
}

function samples(surfaces, restSurfaces = surfaces) {
  return { rest: { matrices: [identity()], surfaces: restSurfaces }, contact: { matrices: [identity()], surfaces } };
}

function probes(pool, sample) {
  const p = skinPositions(pool.decoded, sample.matrices);
  return pool.triangles.flatMap(triangle => BARYCENTRIC.map(weights => {
    const position = [0, 1, 2].map(k => triangle.reduce((sum, v, i) => sum + weights[i] * p[v * 3 + k], 0));
    return { position, blocked: inside(sample.surfaces, position) };
  }));
}

function normal(p, face) {
  const [a, b, c] = face.map(v => point(p, v)), u = b.map((value, k) => value - a[k]), w = c.map((value, k) => value - a[k]);
  return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
}

test('face branch search clears a blocked seam without changing topology, skinning or its welded copies', () => {
  const pool = cloth(), { rest, contact } = samples([box([0,0,0],[.021,.021,.021])]), before = structuredClone(pool.decoded), original = new Float64Array(pool.original);
  const initial = probes(pool, contact);
  assert.ok(initial.some(probe => probe.blocked));
  const report = repairFaceBranches(pool, rest, contact);
  assert.ok(report.acceptedGroups > 0); assert.equal(report.after, 0);
  assert.ok(probes(pool, contact).every(probe => !probe.blocked));
  for (const [i, probe] of probes(pool, contact).entries()) if (initial[i].blocked) for (const surface of contact.surfaces) for (const part of surface.components)
    assert.ok(surface.nearest(probe.position, part).distance >= .002, 'a newly cleared probe lost its 2 mm padding');
  assert.deepEqual(pool.original, original); assert.deepEqual(pool.decoded.indices, before.indices);
  for (const key of Object.keys(before.attrs)) if (key !== 'POSITION') assert.deepEqual(pool.decoded.attrs[key], before.attrs[key]);
  for (const v of pool.used) {
    const p = point(pool.decoded.attrs.POSITION, v);
    assert.ok(distance(p, point(original, v)) <= .08, 'movement must retain the original raw baseline');
    for (const member of pool.membersFor.get(v)) assert.deepEqual(point(pool.decoded.attrs.POSITION, member), p, 'a UV seam was split');
    if (distance(p, point(before.attrs.POSITION, v)) > 0) for (const surface of rest.surfaces) for (const part of surface.components)
      assert.ok(surface.nearest(p, part).distance >= .002, 'alternate endpoint lost its 2 mm padding');
  }
});

test('face branch search refuses an exit outside the original 80 mm sphere', () => {
  // Clearing this midpoint requires at least 84 mm movement by one endpoint,
  // and 88 mm including the mandatory 2 mm outside padding.
  const pool = cloth([[-.052,0,0],[.052,0,0],[0,.2,0]]), { rest, contact } = samples([box([0,0,0],[.042,.042,1])]);
  const before = new Float32Array(pool.decoded.attrs.POSITION), initial = probes(pool, contact);
  assert.ok(initial.some(probe => probe.blocked));
  const report = repairFaceBranches(pool, rest, contact);
  assert.equal(report.acceptedGroups, 0); assert.equal(report.after, report.before);
  assert.deepEqual(pool.decoded.attrs.POSITION, before);
});

test('face branch search preserves the orientation of neighboring near and far triangles', () => {
  const pool = cloth([[-.04,0,0],[.04,0,0],[0,.05,0],[-.055,.012,0],[-.025,.012,0]], [[0,1,2],[0,4,3]]);
  const { rest, contact } = samples([box()]), before = new Float32Array(pool.decoded.attrs.POSITION);
  const report = repairFaceBranches(pool, rest, contact);
  assert.ok(report.acceptedGroups > 0); assert.equal(report.after, 0);
  for (const triangle of pool.triangles) {
    const a = normal(before, triangle), b = normal(pool.decoded.attrs.POSITION, triangle);
    assert.ok(Math.hypot(...b) > 1e-12 && a.reduce((sum, value, k) => sum + value * b[k], 0) > 0, 'an alternate direction inverted a neighboring face');
  }
});

test('face branch search keeps the actual rest body clear when its obstruction differs from the posed body', () => {
  const first = cloth(), body = box(), initial = new Float32Array(first.decoded.attrs.POSITION), firstSamples = samples([body]);
  repairFaceBranches(first, firstSamples.rest, firstSamples.contact);
  const moved = [...first.used].find(v => distance(point(first.decoded.attrs.POSITION, v), point(initial, v)) > .01);
  assert.notEqual(moved, undefined, 'fixture must require a material alternate direction');
  const obstacle = box(point(first.decoded.attrs.POSITION, moved), [.003,.003,.003]);
  const pool = cloth(), { rest, contact } = samples([body], [body, obstacle]);
  for (const v of pool.used) assert.ok(!inside(rest.surfaces, point(pool.decoded.attrs.POSITION, v)), 'fixture starts with clear rest vertices');
  const report = repairFaceBranches(pool, rest, contact);
  assert.ok(report.acceptedGroups > 0); assert.equal(report.after, 0);
  const posedRest = skinPositions(pool.decoded, rest.matrices);
  for (const v of pool.used) assert.ok(!inside(rest.surfaces, point(posedRest, v)), 'candidate cleared the pose by entering the rest body');
});

test('face branch search never exchanges an old failed probe for a newly obstructed neighbor', () => {
  const neighboringCloth = () => cloth([[-.04,0,0],[.04,0,0],[0,.05,0],[-.06,.04,.01],[-.06,-.04,.01]], [[0,1,2],[0,3,4]]);
  const first = neighboringCloth(), body = box(), firstSamples = samples([body]), initial = probes(first, firstSamples.contact);
  const initialVertices = [...first.used].map(v => point(first.decoded.attrs.POSITION, v));
  repairFaceBranches(first, firstSamples.rest, firstSamples.contact);
  const preferred = probes(first, firstSamples.contact);
  const target = preferred.find((probe, i) => Math.floor(i / 4) % 2 === 1 && !initial[i].blocked && distance(probe.position, initial[i].position) > .01 &&
    [...initial.map(p => p.position), ...initialVertices].every(p => distance(p, probe.position) > .006));
  assert.ok(target, 'fixture must move an originally clear neighboring probe');
  const obstacle = box(target.position, [.001,.001,.001]), pool = neighboringCloth(), { rest, contact } = samples([body, obstacle]);
  const before = probes(pool, contact), report = repairFaceBranches(pool, rest, contact), after = probes(pool, contact);
  assert.ok(report.after < report.before);
  assert.ok(after.every((probe, i) => !probe.blocked || before[i].blocked), 'repair introduced a new failing face probe');
});

test('expanded static face authoring covers all 23 catalog designs including shoes and the three hats', () => {
  const catalog = JSON.parse(readFileSync(new URL('../tools/blender/people_wear.catalog.json', import.meta.url)));
  assert.equal(catalog.garments.length, 23);
  assert.deepEqual([...IDLE_FACE_GARMENTS].sort(), catalog.garments.map(garment => garment.id).sort());
  assert.ok(['shoes','cap','sun_hat','straw_hat'].every(id => IDLE_FACE_GARMENTS.includes(id)));
  assert.deepEqual(FACE_GARMENTS, ['rash_vest','leggings','skirt','briefs','boxers','bikini_bottom','swimsuit_onepiece']);
});

test('face branch search resolves a narrow padded corridor between raw grid stations', () => {
  // Independently clear rest fitting has already moved this seam 2.5 mm from
  // raw. The two closed walls leave a 4.6 mm channel, hence only 0.6 mm for a
  // candidate after reserving the unchanged 2 mm padding at each wall. None
  // of the original raw-centred 5 mm grid's z coordinates can enter it.
  const pool = cloth([[-.01,0,.0025],[.01,0,.0025],[0,.02,.0025]]);
  for (const v of pool.used) pool.original[v * 3 + 2] = 0;
  const body = box([0,0,0], [.005,.005,1]);
  const walls = [box([0,0,-.5], [2,2,.5002]), box([0,0,.5], [2,2,.4952])];
  const { rest, contact } = samples([body], [body, ...walls]);
  const before = new Float32Array(pool.decoded.attrs.POSITION), original = new Float64Array(pool.original), initial = probes(pool, contact);
  assert.ok(initial.some(probe => probe.blocked));
  for (const v of pool.used) assert.ok(!inside(rest.surfaces, point(before, v)), 'the fixture must begin with independently clear rest vertices');
  const report = repairFaceBranches(pool, rest, contact);
  assert.ok(report.acceptedGroups > 0, 'the finer proposals must reach the padded corridor between raw grid stations');
  assert.equal(report.after, 0);
  const after = probes(pool, contact);
  assert.ok(after.every(probe => !probe.blocked));
  assert.deepEqual(pool.original, original);
  for (const v of pool.used) {
    const p = point(pool.decoded.attrs.POSITION, v);
    assert.ok(distance(p, point(original, v)) <= .08, 'local proposals must retain the immutable raw 80 mm bound');
    assert.ok(p[2] >= .0022 && p[2] <= .0028, 'accepted vertices must retain both walls\' full 2 mm padding');
    for (const member of pool.membersFor.get(v)) assert.deepEqual(point(pool.decoded.attrs.POSITION, member), p);
    for (const surface of rest.surfaces) for (const part of surface.components) assert.ok(surface.nearest(p, part).distance >= .002);
  }
  for (const [i, probe] of after.entries()) if (initial[i].blocked) for (const part of body.components)
    assert.ok(body.nearest(probe.position, part).distance >= .002, 'newly cleared probes must retain the original padding');
  for (const triangle of pool.triangles) {
    const a = normal(before, triangle), b = normal(pool.decoded.attrs.POSITION, triangle);
    assert.ok(a.reduce((sum, value, k) => sum + value * b[k], 0) > 0, 'local proposals must preserve both welded face orientations');
  }
});

function stalledFixture() {
  const pool = cloth([[-.04,0,0],[.04,0,0],[0,.05,0],[-.055,.012,0],[-.025,.012,0]], [[0,1,2],[0,4,3]]);
  pool.fittedInput = new Float64Array(pool.decoded.attrs.POSITION);
  for (const v of pool.used) pool.original[v * 3 + 2] = -.002;
  const reverseNeighbour = () => { for (const v of pool.membersFor.get(3)) pool.decoded.attrs.POSITION.set([-.025,-.012,0], v * 3); };
  reverseNeighbour(); pool.maximum = Math.hypot(.03, .024, .002);
  return { pool, reverseNeighbour, ...samples([box()]) };
}
const recoveryClock = overrides => ({ completedPasses: 98, maxPasses: 160, unimprovedPasses: 32, ...overrides });

test('stalled face recovery requires sustained failure beside a reversed rest neighbour', () => {
  for (const missing of ['sustained stall', 'reversed neighbour', 'failed probe']) {
    const { pool, rest, contact } = stalledFixture(), clock = recoveryClock();
    if (missing === 'sustained stall') clock.unimprovedPasses = 31;
    if (missing === 'reversed neighbour') pool.decoded.attrs.POSITION.set(pool.fittedInput);
    if (missing === 'failed probe') contact.surfaces = [box([1,1,1])];
    const before = new Float32Array(pool.decoded.attrs.POSITION);
    assert.equal(restartStalledFaces(pool, rest, contact, clock), false, 'recovery requires '+missing);
    assert.deepEqual(pool.decoded.attrs.POSITION, before);
    assert.equal(pool.orientationActive, undefined);
  }
});

test('stalled face recovery runs once inside the remaining original pass budget', () => {
  const { pool, rest, contact, reverseNeighbour } = stalledFixture(), before = new Float32Array(pool.decoded.attrs.POSITION);
  assert.equal(restartStalledFaces(pool, rest, contact, recoveryClock({ completedPasses: 129 })), false, '31 remaining passes must not start a new recovery');
  assert.deepEqual(pool.decoded.attrs.POSITION, before);
  assert.equal(restartStalledFaces(pool, rest, contact, recoveryClock()), true);
  assert.equal(pool.referenceRestartPass, 98);
  reverseNeighbour(); const changed = new Float32Array(pool.decoded.attrs.POSITION);
  assert.equal(restartStalledFaces(pool, rest, contact, recoveryClock()), false, 'a pool cannot restart a second time');
  assert.deepEqual(pool.decoded.attrs.POSITION, changed);
  assert.equal(pool.referenceRestartPass, 98);
});

test('stalled face recovery verifies the rest reset and preserves immutable raw movement history', () => {
  const { pool, rest, contact } = stalledFixture(), original = new Float64Array(pool.original), fitted = new Float64Array(pool.fittedInput);
  const maximum = pool.maximum, before = structuredClone(pool.decoded);
  assert.equal(restartStalledFaces(pool, rest, contact, recoveryClock()), true);
  assert.deepEqual(pool.original, original); assert.deepEqual(pool.fittedInput, fitted);
  assert.equal(pool.maximum, maximum, 'recovery must retain earlier maximum movement');
  assert.deepEqual(Array.from(pool.decoded.attrs.POSITION), Array.from(fitted));
  assert.deepEqual(pool.decoded.indices, before.indices);
  for (const key of Object.keys(before.attrs)) if (key !== 'POSITION') assert.deepEqual(pool.decoded.attrs[key], before.attrs[key]);
  for (const v of pool.used) {
    const p = point(pool.decoded.attrs.POSITION, v);
    assert.ok(!inside(rest.surfaces, p));
    assert.ok(distance(p, point(original, v)) <= .08);
    for (const member of pool.membersFor.get(v)) assert.deepEqual(point(pool.decoded.attrs.POSITION, member), p);
  }
  const obstructed = stalledFixture();
  for (const v of obstructed.pool.membersFor.get(1)) obstructed.pool.fittedInput.set([0,0,0], v * 3);
  assert.throws(() => restartStalledFaces(obstructed.pool, obstructed.rest, obstructed.contact, recoveryClock()), /independently clear rest/);
  const tooFar = stalledFixture();
  for (const v of tooFar.pool.membersFor.get(1)) tooFar.pool.fittedInput.set([.3,0,0], v * 3);
  assert.throws(() => restartStalledFaces(tooFar.pool, tooFar.rest, tooFar.contact, recoveryClock()), /original 80 mm/);
});

test('ordinary recovery proposals backtrack against the fixed rest reference for every welded face', () => {
  for (const alreadyBent of [false, true]) {
    const pool = cloth([[0,0,0],[.02,0,0],[0,.02,0]]);
    pool.fittedInput = new Float64Array(pool.decoded.attrs.POSITION); pool.orientationActive = true;
    if (alreadyBent) for (const v of pool.membersFor.get(0)) pool.decoded.attrs.POSITION.set([.009,.009,.012], v * 3);
    const before = new Float32Array(pool.decoded.attrs.POSITION), original = new Float64Array(pool.original), posed = skinPositions(pool.decoded, [identity()]);
    const delta = alreadyBent ? [.004,.004,0] : [.04,.04,0];
    boundedMove(pool, 0, delta, posed, identity());
    assert.ok(distance(point(pool.decoded.attrs.POSITION, 0), point(before, 0)) > 0, 'a safe partial move must remain available');
    assert.ok(distance(point(pool.decoded.attrs.POSITION, 0), point(before, 0).map((v,k) => v+delta[k])) > .001, 'the full reversed proposal must be backtracked');
    assert.deepEqual(pool.original, original);
    for (const triangle of pool.triangles) {
      const reference = normal(pool.fittedInput, triangle), current = normal(pool.decoded.attrs.POSITION, triangle);
      assert.ok(reference.reduce((sum, v, k) => sum + v * current[k], 0) > 0, 'the initial rest reference cannot follow earlier accepted rotations');
    }
    for (const v of pool.used) {
      const p = point(pool.decoded.attrs.POSITION, v);
      assert.ok(distance(p, point(original, v)) <= .08);
      assert.deepEqual(point(posed, v), p);
      for (const member of pool.membersFor.get(v)) assert.deepEqual(point(pool.decoded.attrs.POSITION, member), p);
    }
  }
});

test('recovery rest protection avoids a partial reset that reverses a neighbouring face', () => {
  const pool = cloth([[0,0,0],[.02,0,0],[0,.02,0]]);
  pool.fittedInput = new Float64Array(pool.decoded.attrs.POSITION); pool.orientationActive = true;
  for (const v of pool.used) {
    pool.decoded.attrs.POSITION[v * 3] -= .04; pool.decoded.attrs.POSITION[v * 3 + 1] -= .04;
  }
  pool.maximum = Math.SQRT2 * .04;
  const original = new Float64Array(pool.original), maximum = pool.maximum;
  const { rest } = samples([box([-.11,-.11,0], [.09,.09,1])]);
  assert.ok(inside(rest.surfaces, point(pool.decoded.attrs.POSITION, 0)));
  for (const v of pool.used) assert.ok(!inside(rest.surfaces, point(pool.fittedInput, v)));
  protectRest(pool, rest);
  assert.deepEqual(Array.from(pool.decoded.attrs.POSITION), Array.from(pool.fittedInput), 'the verified full rest input must replace an unsafe partial reset');
  assert.deepEqual(pool.original, original); assert.equal(pool.maximum, maximum);
  for (const v of pool.used) assert.ok(!inside(rest.surfaces, point(pool.decoded.attrs.POSITION, v)));
  for (const triangle of pool.triangles) {
    const reference = normal(pool.fittedInput, triangle), current = normal(pool.decoded.attrs.POSITION, triangle);
    assert.ok(reference.reduce((sum, v, k) => sum + v * current[k], 0) > 0);
  }
});
