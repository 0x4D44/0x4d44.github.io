#!/usr/bin/env node
// Reproducible authoring only. This never replaces the independent release gate.
import '../../tests/nice.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGlb, decodePrimitive } from './people_validate.mjs';
import { readWearGlb, checkGeometry, compactBuffers, geometryGpuBytes } from './people_wear_validate.mjs';
import { skinInfo, compareSkin, readPoseBank, sampleRotations, poseMatrices, usedVertices, skinPositions,
  ClosedSurface, closestUnionExit, blendedMatrix, inverseVector, transform, pushOutPose } from './people_wear_math.mjs';

export const FACE_GARMENTS = Object.freeze(['rash_vest', 'leggings', 'skirt', 'briefs', 'boxers', 'bikini_bottom', 'swimsuit_onepiece']);
export const IDLE_FACE_GARMENTS = Object.freeze(['tshirt', 'shirt', 'blouse', 'jumper', 'trousers', 'jeans', 'skirt', 'dress', 'shorts', 'leggings',
  'socks_pair', 'briefs', 'boxers', 'bra', 'bikini_top', 'bikini_bottom', 'swimsuit_onepiece', 'swim_trunks', 'rash_vest',
  'shoes', 'cap', 'sun_hat', 'straw_hat']);
const MAX_MOVE = 0.08, PAD = 0.002, RELAXATION = 0.25, ROUNDING_RESERVE = 0.000001;
const BARYCENTRIC = Object.freeze([[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]);
const need = (ok, message) => { if (!ok) throw new Error(message); };
const equal = (a, b) => a?.length === b?.length && a.every((value, i) => value === b[i]);
const pointAt = (p, v) => Array.from(p.subarray(v * 3, v * 3 + 3));
const inside = (surfaces, point) => surfaces.some(surface => surface.insideXYZ(...point));
const displacement = (p, original, v) => Math.hypot(p[v * 3] - original[v * 3], p[v * 3 + 1] - original[v * 3 + 1], p[v * 3 + 2] - original[v * 3 + 2]);

async function mesh(doc, name) {
  const node = doc.g.nodes.find(n => n.name === name);
  need(node?.mesh != null, `missing authoring mesh ${name}`);
  const primitives = doc.g.meshes[node.mesh].primitives;
  need(primitives.length === 1, `${name}: expected one primitive`);
  return { name, node, primitive: primitives[0], decoded: await decodePrimitive(doc, primitives[0]), rig: skinInfo(doc, name) };
}

function unchangedStreams(raw, fitted, label, allowPositions = true) {
  need(equal(raw.indices, fitted.indices), `${label}: the rest fit changed triangle topology`);
  need(raw.vertices === fitted.vertices && Object.keys(raw.attrs).sort().join('/') === Object.keys(fitted.attrs).sort().join('/'), `${label}: raw/rest vertex streams differ`);
  for (const key of Object.keys(raw.attrs)) if (!(allowPositions && ['POSITION', 'NORMAL'].includes(key)))
    need(equal(raw.attrs[key], fitted.attrs[key]), `${label}: the rest fit changed ${key}`);
}

function trianglePoint(positions, triangle, weights) {
  return [0, 1, 2].map(k => triangle.reduce((sum, v, i) => sum + weights[i] * positions[v * 3 + k], 0));
}

function weld(pool) {
  const groups = new Map(), membersFor = new Map(), a = pool.decoded.attrs;
  for (const v of pool.used) {
    const influences = [];
    for (let k = 0; k < 4; k++) if (a.WEIGHTS_0[v * 4 + k] > 0) influences.push([a.JOINTS_0[v * 4 + k], a.WEIGHTS_0[v * 4 + k]]);
    influences.sort((x, y) => x[0] - y[0]);
    // UVs and normal hard edges do not split a physical cloth seam. Different
    // skin influences do: those vertices can occupy different animated points.
    const key = pointAt(pool.original, v).join(',') + '/' + JSON.stringify(influences);
    if (!groups.has(key)) groups.set(key, []);
    const members = groups.get(key); members.push(v); membersFor.set(v, members);
  }
  for (const members of groups.values()) {
    const start = pointAt(pool.fittedInput, members[0]);
    for (const v of members) {
      need(Math.hypot(...pointAt(pool.fittedInput, v).map((value, k) => value - start[k])) <= 1e-7, `${pool.label}: the rest fit split a raw cloth seam`);
      a.POSITION.set(start, v * 3);
    }
  }
  pool.weldGroups = groups; pool.membersFor = membersFor;
}

function boundedMove(pool, vertex, delta, posed, matrix) {
  const a = pool.decoded.attrs, offset = vertex * 3;
  const relative = [0, 1, 2].map(k => a.POSITION[offset + k] + delta[k] - pool.original[offset + k]);
  const length = Math.hypot(...relative), bound = MAX_MOVE - ROUNDING_RESERVE, scale = length > bound ? bound / length : 1;
  const target = relative.map((value, k) => Math.fround(pool.original[offset + k] + value * scale));
  for (const member of pool.membersFor.get(vertex)) {
    const at = member * 3, actual = target.map((value, k) => value - a.POSITION[at + k]);
    a.POSITION.set(target, at);
    for (let k = 0; k < 3; k++) posed[at + k] += matrix[k] * actual[0] + matrix[4 + k] * actual[1] + matrix[8 + k] * actual[2];
  }
  pool.maximum = Math.max(pool.maximum, displacement(a.POSITION, pool.original, vertex));
  need(pool.maximum <= MAX_MOVE, `${pool.label}: float32 authoring result exceeds 80 mm from the generated bind positions`);
  return length > bound;
}

function protectRest(pool, sample) {
  const positions = skinPositions(pool.decoded, sample.matrices), a = pool.decoded.attrs;
  for (const v of pool.used) {
    const point = pointAt(positions, v); if (!inside(sample.surfaces, point)) continue;
    const matrix = blendedMatrix(a, v, sample.matrices), exit = closestUnionExit(sample.surfaces, point, { padding: PAD, maxDistance: 0.18 });
    if (exit) boundedMove(pool, v, inverseVector(matrix, exit.deltaWorld), positions, matrix);
    if (inside(sample.surfaces, pointAt(positions, v))) {
      // The independently verified rest input is a safe fallback. The original
      // generated point can be inside; it is solely the displacement baseline.
      const start = pointAt(pool.fittedInput, v), posedStart = transform(matrix, start);
      for (const member of pool.membersFor.get(v)) { a.POSITION.set(start, member * 3); positions.set(posedStart, member * 3); }
    }
  }
}

function inspectPool(pool, sample, { faces = true, correct = true, full = false } = {}) {
  const positions = correct ? pushOutPose(pool.decoded, sample.matrices, sample.surfaces, { used: pool.used, padding: PAD, maxDistance: 0.18 }).posedPositions
    : skinPositions(pool.decoded, sample.matrices);
  let vertexFailures = 0, faceFailures = 0, faceChecks = 0;
  for (const v of pool.used) if (inside(sample.surfaces, pointAt(positions, v))) vertexFailures++;
  if (faces) for (const triangle of full ? pool.allTriangles : pool.triangles) for (const weights of BARYCENTRIC) {
    faceChecks++; if (inside(sample.surfaces, trianglePoint(positions, triangle, weights))) faceFailures++;
  }
  return { vertexChecks: pool.used.length, vertexFailures, faceChecks, faceFailures };
}

// A shortest exit can choose opposite sides of the arm/torso corridor for two
// neighbouring cloth vertices. Repeating that direction then fights protectRest
// indefinitely. This authoring-only search changes the proposal, not any gate:
// every candidate is an actual float32 bind position inside the ORIGINAL 80 mm
// ball, and every accepted move strictly removes existing failed face probes.
const BRANCH_OFFSETS = Object.freeze((() => {
  const result = [], steps = 16, step = MAX_MOVE / steps;
  for (let x = -steps; x <= steps; x++) for (let y = -steps; y <= steps; y++) for (let z = -steps; z <= steps; z++) {
    const radius2 = x * x + y * y + z * z;
    if (radius2 < steps * steps) result.push({ delta: [x * step, y * step, z * step], radius2 });
  }
  result.sort((a, b) => a.radius2 - b.radius2 || a.delta[0] - b.delta[0] || a.delta[1] - b.delta[1] || a.delta[2] - b.delta[2]);
  return result.map(({ delta }) => Object.freeze(delta));
})());

function outsidePadded(surfaces, point) {
  if (inside(surfaces, point)) return false;
  for (const surface of surfaces) for (const part of surface.components) {
    const b = part.root.b, distance2 = point.reduce((sum, value, k) => sum + Math.max(b[k] - value, 0, value - b[k + 3]) ** 2, 0);
    if (distance2 < PAD * PAD && surface.nearest(point, part).distance < PAD) return false;
  }
  return true;
}

function faceNormal(points) {
  const u = points[1].map((value, k) => value - points[0][k]), v = points[2].map((value, k) => value - points[0][k]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

function keepsOrientation(before, after) {
  const norm = Math.hypot(...after);
  return norm > 1e-12 && before.reduce((sum, value, k) => sum + value * after[k], 0) > 0;
}

/** Deterministic alternate bind directions for a stalled cloth seam.
 * This runs inside an existing face-authoring pass. It never changes indices,
 * weights, original baselines, iteration limits, body surfaces or runtime code.
 * The same welded group moves together. New failing probes, inverted faces and
 * candidates without the original 2 mm clearance padding are rejected. */
export function repairFaceBranches(pool, rest, contact) {
  const a = pool.decoded.attrs, triangles = pool.triangles, groups = new Map();
  for (const v of pool.used) {
    const members = pool.membersFor.get(v), representative = Math.min(...members);
    if (!groups.has(representative)) groups.set(representative, members);
  }
  let positions = pushOutPose(pool.decoded, contact.matrices, contact.surfaces, { used: pool.used, padding: PAD, maxDistance: 0.18 }).posedPositions;
  const failuresFor = (triangle, data = positions) => BARYCENTRIC.map(weights => inside(contact.surfaces, trianglePoint(data, triangle, weights)));
  let flags = triangles.map(triangle => failuresFor(triangle));
  const count = rows => rows.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const report = { candidates: 0, attemptedGroups: 0, acceptedGroups: 0, before: count(flags), after: 0, maximumDisplacementM: 0 };
  const order = [...groups.entries()].map(([representative, members]) => {
    const selected = new Set(members), incident = [];
    for (let i = 0; i < triangles.length; i++) if (triangles[i].some(v => selected.has(v))) incident.push(i);
    return { representative, members, selected, incident };
  }).filter(group => group.incident.some(i => flags[i].some(Boolean)))
    .sort((x, y) => count(y.incident.map(i => flags[i])) - count(x.incident.map(i => flags[i])) || x.representative - y.representative);
  for (const group of order) {
    const { representative, members, selected, incident } = group;
    const oldCount = count(incident.map(i => flags[i])); if (!oldCount) continue;
    report.attemptedGroups++;
    const origin = pointAt(pool.original, representative), matrices = new Map(members.map(v => [v, blendedMatrix(a, v, contact.matrices)]));
    const restMatrices = new Map(members.map(v => [v, blendedMatrix(a, v, rest.matrices)]));
    const bindNormals = new Map(incident.map(i => [i, faceNormal(triangles[i].map(v => pointAt(a.POSITION, v)))]));
    const posedNormals = new Map(incident.map(i => [i, faceNormal(triangles[i].map(v => pointAt(positions, v)))]));
    let best = null;
    for (const delta of BRANCH_OFFSETS) {
      const candidate = origin.map((value, k) => Math.fround(value + delta[k])); report.candidates++;
      // Check the rounded upload against every alias's immutable raw origin.
      const movement = Math.max(...members.map(v => Math.hypot(...candidate.map((value, k) => value - pool.original[v * 3 + k]))));
      if (movement > MAX_MOVE - ROUNDING_RESERVE) continue;
      const posed = new Map(); let valid = true;
      for (const v of members) {
        const atRest = transform(restMatrices.get(v), candidate), atContact = transform(matrices.get(v), candidate);
        // These vertices need no runtime push. Unchanged vertices still use
        // the original bounded pushOutPose; the full pass is rechecked below.
        if (!outsidePadded(rest.surfaces, atRest) || !outsidePadded(contact.surfaces, atContact)) { valid = false; break; }
        posed.set(v, atContact);
      }
      if (!valid) continue;
      let remaining = 0;
      for (const i of incident) {
        const triangle = triangles[i], bindPoints = triangle.map(v => selected.has(v) ? candidate : pointAt(a.POSITION, v));
        const posedPoints = triangle.map(v => posed.get(v) ?? pointAt(positions, v));
        if (!keepsOrientation(bindNormals.get(i), faceNormal(bindPoints)) || !keepsOrientation(posedNormals.get(i), faceNormal(posedPoints))) { valid = false; break; }
        for (let b = 0; b < BARYCENTRIC.length; b++) {
          const point = [0, 1, 2].map(k => posedPoints.reduce((sum, p, j) => sum + BARYCENTRIC[b][j] * p[k], 0));
          const blocked = inside(contact.surfaces, point);
          if (blocked && !flags[i][b] || !blocked && flags[i][b] && !outsidePadded(contact.surfaces, point)) { valid = false; break; }
          if (blocked) remaining++;
        }
        if (!valid) break;
      }
      if (!valid || remaining >= oldCount) continue;
      if (!best || remaining < best.remaining || remaining === best.remaining && movement < best.movement) best = { candidate, movement, remaining };
      // Offsets are sorted by distance from the immutable raw point. A full
      // repair at this radius needs no farther, more distorted alternative.
      if (!remaining) break;
    }
    if (!best) continue;
    for (const v of members) a.POSITION.set(best.candidate, v * 3);
    pool.maximum = Math.max(pool.maximum, best.movement);
    need(pool.maximum <= MAX_MOVE, `${pool.label}: alternate face direction exceeds cumulative 80 mm`);
    // Re-skin the actual float32 positions and rerun the unchanged bounded
    // runtime correction. Incremental proposal coordinates cannot certify it.
    positions = pushOutPose(pool.decoded, contact.matrices, contact.surfaces, { used: pool.used, padding: PAD, maxDistance: 0.18 }).posedPositions;
    const next = triangles.map(triangle => failuresFor(triangle));
    need(next.every((row, i) => row.every((blocked, b) => !blocked || flags[i][b])), `${pool.label}: alternate face direction added a failed probe`);
    need(count(next) < count(flags), `${pool.label}: alternate face direction did not improve face clearance`);
    flags = next; report.acceptedGroups++; report.maximumDisplacementM = Math.max(report.maximumDisplacementM, best.movement);
  }
  report.after = count(flags);
  return report;
}

function appendCorrectedPools(doc, pools) {
  const chunks = [Buffer.from(doc.bin.subarray(0, doc.g.buffers[0].byteLength))]; let length = chunks[0].length;
  const append = (bytes, accessor, byteStride = null) => {
    const padding = (4 - length % 4) % 4; if (padding) { chunks.push(Buffer.alloc(padding)); length += padding; }
    const bufferView = doc.g.bufferViews.length;
    doc.g.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length, target: 34962, ...(byteStride ? { byteStride } : {}) });
    chunks.push(bytes); length += bytes.length;
    const index = doc.g.accessors.length; doc.g.accessors.push({ ...accessor, bufferView }); return index;
  };
  for (const pool of pools) {
    const a = pool.decoded.attrs, p = a.POSITION, count = p.length / 3, normals = new Float64Array(p.length), seen = new Set();
    for (const entry of pool.entries.filter(e => e.lod === 0)) {
      const ix = entry.decoded.indices;
      for (let i = 0; i < ix.length; i += 3) {
        const key = `${ix[i]}/${ix[i + 1]}/${ix[i + 2]}`; if (seen.has(key)) continue; seen.add(key);
        const v = [ix[i], ix[i + 1], ix[i + 2]], [x, y, z] = [0, 1, 2].map(k => p[v[1] * 3 + k] - p[v[0] * 3 + k]), [u, w, q] = [0, 1, 2].map(k => p[v[2] * 3 + k] - p[v[0] * 3 + k]);
        const normal = [y * q - z * w, z * u - x * q, x * w - y * u];
        for (const vertex of v) for (let k = 0; k < 3; k++) normals[vertex * 3 + k] += normal[k];
      }
    }
    const positions = Buffer.alloc(count * 12), packedNormals = Buffer.alloc(count * 4), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < count; v++) {
      let norm = Math.hypot(...normals.subarray(v * 3, v * 3 + 3));
      if (norm < 1e-12) { normals.set(a.NORMAL.subarray(v * 3, v * 3 + 3), v * 3); norm = Math.hypot(...normals.subarray(v * 3, v * 3 + 3)); }
      need(norm > 0, `${pool.label}: invalid corrected normal`);
      for (let k = 0; k < 3; k++) {
        positions.writeFloatLE(p[v * 3 + k], v * 12 + k * 4); min[k] = Math.min(min[k], p[v * 3 + k]); max[k] = Math.max(max[k], p[v * 3 + k]);
        packedNormals.writeInt8(Math.round(normals[v * 3 + k] / norm * 127), v * 4 + k);
      }
    }
    const pi = append(positions, { componentType: 5126, type: 'VEC3', count, min, max });
    const ni = append(packedNormals, { componentType: 5120, normalized: true, type: 'VEC3', count }, 4);
    for (const entry of pool.entries) { entry.primitive.attributes.POSITION = pi; entry.primitive.attributes.NORMAL = ni; }
  }
  doc.g.buffers[0].byteLength = length;
  const bin = compactBuffers(doc.g, Buffer.concat(chunks));
  const text = Buffer.from(JSON.stringify(doc.g)), json = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 0x20)]);
  const binary = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]), output = Buffer.alloc(28 + json.length + binary.length);
  output.writeUInt32LE(0x46546c67, 0); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12); output.writeUInt32LE(0x4e4f534a, 16); json.copy(output, 20);
  output.writeUInt32LE(binary.length, 20 + json.length); output.writeUInt32LE(0x004e4942, 24 + json.length); binary.copy(output, 28 + json.length);
  return output;
}

/** The raw argument must be a fresh parse of the untouched generated GLB.
 * pushOutFit mutates its input JSON, so do not reuse that object as the baseline.
 * Every authoring displacement is measured from raw positions, never from the
 * already fitted input. No output is returned on an unresolved constraint. */
export async function fitWearFaces(rawGlb, restFittedGlb, fit, { id, maxPasses = 160, garmentIds = FACE_GARMENTS, onProgress = null } = {}) {
  need(typeof id === 'string' && id.length && Number.isInteger(maxPasses) && maxPasses > 0 && maxPasses <= 1000, 'invalid face authoring options');
  need(Array.isArray(garmentIds) && new Set(garmentIds).size === garmentIds.length && FACE_GARMENTS.every(gid => garmentIds.includes(gid)) && garmentIds.every(gid => IDLE_FACE_GARMENTS.includes(gid)),
    'face authoring selection must retain every original guarded design and contain only supported idle garments');
  need(garmentIds.every(gid => fit.garments?.[gid]), `${id}: missing required face-fit garment`);
  const doc = { ...restFittedGlb, g: structuredClone(restFittedGlb.g), bin: Buffer.from(restFittedGlb.bin) };
  const bodyNames = [[fit.bodyNode, fit.bodyComponents], [fit.bodyLodNode, fit.bodyFarComponents], [fit.proxyNode, fit.proxyComponents]], bodies = [];
  for (const [name, ranges] of bodyNames) {
    const current = await mesh(doc, name), raw = await mesh(rawGlb, name);
    unchangedStreams(raw.decoded, current.decoded, name, false); compareSkin(raw.rig, current.rig, name);
    checkGeometry(current.decoded, Infinity, name); bodies.push({ ...current, ranges: ranges ?? current.node.extras?.components ?? null });
  }
  const rig = bodies[0].rig, clip = readPoseBank().find(c => c.name === 'idle_a'); need(clip, 'missing idle_a face-fit pose');
  const samples = [];
  for (const [name, rotations] of [['rest', null], ['idle_a', sampleRotations(clip, clip.duration * 0.27)]]) {
    const matrices = poseMatrices(rig, rotations ?? new Map()), surfaces = bodies.map(body => new ClosedSurface(body.decoded, body.ranges, body.name).pose(skinPositions(body.decoded, matrices)));
    samples.push({ name, matrices, surfaces });
  }
  const [rest, contact] = samples, pools = new Map();
  for (const [gid, garment] of Object.entries(fit.garments)) for (const [lod, name] of [[0, garment.node], [1, garment.lodNode]]) {
    const entry = await mesh(doc, name), raw = await mesh(rawGlb, name), a = entry.primitive.attributes;
    unchangedStreams(raw.decoded, entry.decoded, name); compareSkin(entry.rig, rig, name); compareSkin(raw.rig, rig, name);
    checkGeometry(entry.decoded, lod ? 600 : 1800, name);
    const key = `${a.POSITION}/${a.JOINTS_0}/${a.WEIGHTS_0}/${entry.node.skin}`;
    if (!pools.has(key)) pools.set(key, { label: `${id}/${gid}`, decoded: entry.decoded, original: new Float64Array(raw.decoded.attrs.POSITION), fittedInput: new Float64Array(entry.decoded.attrs.POSITION), entries: [], vertices: new Set(), maximum: 0 });
    const pool = pools.get(key); need(equal(pool.original, raw.decoded.attrs.POSITION), `${name}: shared pool has conflicting raw baselines`);
    entry.gid = gid; entry.lod = lod; pool.entries.push(entry);
    for (const v of usedVertices(entry.decoded)) pool.vertices.add(v);
  }
  const report = { schema: 1, id, authoringOnly: true, complete: false, rawInputSha256: rawGlb.sha256, restInputSha256: restFittedGlb.sha256,
    maxDisplacementLimitM: MAX_MOVE, paddingM: PAD, relaxation: RELAXATION, clip: 'idle_a', phase: 0.27, time: clip.duration * 0.27,
    garmentIds: [...garmentIds], rawRestChecks: 0, faceChecks: 0, faceFailures: 0, maximumDisplacementM: 0, pools: [] };
  const selected = [];
  for (const pool of pools.values()) {
    pool.used = Uint32Array.from(pool.vertices);
    for (const v of pool.used) {
      pool.maximum = Math.max(pool.maximum, displacement(pool.decoded.attrs.POSITION, pool.original, v));
      need(pool.maximum <= MAX_MOVE, `${pool.label}: input already exceeds the cumulative 80 mm authoring bound`);
    }
    const initialRest = inspectPool(pool, rest, { faces: false, correct: false });
    need(initialRest.vertexFailures === 0, `${pool.label}: face fitting requires independently clear raw-rest input`);
    if (!pool.entries.some(entry => garmentIds.includes(entry.gid))) continue;
    weld(pool); pool.allTriangles = []; const unique = new Map();
    for (const entry of pool.entries) for (let at = 0; at < entry.decoded.indices.length; at += 3) {
      const triangle = Array.from(entry.decoded.indices.subarray(at, at + 3)), key = [...triangle].sort((x, y) => x - y).join('/');
      pool.allTriangles.push(triangle); if (!unique.has(key)) unique.set(key, triangle);
    }
    pool.triangles = [...unique.values()];
    const row = { garments: [...new Set(pool.entries.map(entry => entry.gid))], vertices: pool.used.length, weldGroups: pool.weldGroups.size,
      faceChecks: pool.allTriangles.length * 4, initialFaceFailures: inspectPool(pool, contact, { full: true }).faceFailures, passes: [], maximumDisplacementM: pool.maximum };
    let final = inspectPool(pool, contact, { full: true }), bestFailures = final.faceFailures, stalledPasses = 0;
    for (let pass = 0; final.faceFailures && pass < maxPasses; pass++) {
      const positions = pushOutPose(pool.decoded, contact.matrices, contact.surfaces, { used: pool.used, padding: PAD, maxDistance: 0.18 }).posedPositions;
      const matrices = new Map(Array.from(pool.used, v => [v, blendedMatrix(pool.decoded.attrs, v, contact.matrices)]));
      let corrections = 0, clamped = 0;
      for (const triangle of pool.triangles) for (const weights of BARYCENTRIC) {
        const point = trianglePoint(positions, triangle, weights); if (!inside(contact.surfaces, point)) continue;
        const exit = closestUnionExit(contact.surfaces, point, { padding: PAD, maxDistance: 0.18 });
        need(exit, `${pool.label}: face has no bounded union exit`);
        const denominator = weights.reduce((sum, value) => sum + value * value, 0);
        for (let i = 0; i < 3; i++) if (weights[i]) {
          const matrix = matrices.get(triangle[i]), delta = exit.deltaWorld.map(value => value * weights[i] / denominator * RELAXATION);
          clamped += Number(boundedMove(pool, triangle[i], inverseVector(matrix, delta), positions, matrix));
        }
        corrections++;
      }
      protectRest(pool, rest); final = inspectPool(pool, contact, { full: true });
      stalledPasses = final.faceFailures < bestFailures ? 0 : stalledPasses + 1;
      bestFailures = Math.min(bestFailures, final.faceFailures);
      if (final.faceFailures && (stalledPasses >= 8 || pass + 1 === maxPasses)) {
        const alternative = repairFaceBranches(pool, rest, contact);
        (row.alternativeDirections ??= []).push({ pass: pass + 1, ...alternative });
        final = inspectPool(pool, contact, { full: true });
        bestFailures = Math.min(bestFailures, final.faceFailures); stalledPasses = 0;
      }
      row.passes.push({ pass: pass + 1, corrections, clamped, faceFailures: final.faceFailures, maximumDisplacementM: pool.maximum });
    }
    need(final.faceFailures === 0 && final.vertexFailures === 0, `${pool.label}: unresolved face constraints after ${maxPasses} passes (${final.faceFailures} faces)`);
    row.maximumDisplacementM = pool.maximum; row.finalFaceFailures = 0;
    report.pools.push(row); selected.push(pool); if (onProgress) onProgress(row);
  }
  const bytes = appendCorrectedPools(doc, selected), emitted = parseGlb(bytes, `${id}: face-fit output`);
  // Re-decode the bytes actually returned to the builder. These checks are
  // independent of incremental solver caches and include every LOD triangle.
  for (const pool of pools.values()) {
    const actual = await mesh(emitted, pool.entries[0].name), checked = { ...pool, decoded: actual.decoded };
    for (const entry of pool.entries) {
      const e = await mesh(emitted, entry.name); checkGeometry(e.decoded, entry.lod ? 600 : 1800, entry.name);
      need(e.primitive.attributes.POSITION === actual.primitive.attributes.POSITION && e.primitive.attributes.NORMAL === actual.primitive.attributes.NORMAL, `${pool.label}: output broke a shared garment pool`);
    }
    for (const v of pool.used) {
      const distance = displacement(actual.decoded.attrs.POSITION, pool.original, v);
      need(distance <= MAX_MOVE, `${pool.label}: emitted displacement exceeds cumulative 80 mm`);
      report.maximumDisplacementM = Math.max(report.maximumDisplacementM, distance);
    }
    const restResult = inspectPool(checked, rest, { faces: false, correct: false }); report.rawRestChecks += restResult.vertexChecks;
    need(restResult.vertexFailures === 0, `${pool.label}: emitted rest vertex is inside the body`);
    if (selected.includes(pool)) {
      const contactResult = inspectPool(checked, contact, { full: true }); report.faceChecks += contactResult.faceChecks; report.faceFailures += contactResult.faceFailures;
      need(contactResult.faceFailures === 0 && contactResult.vertexFailures === 0, `${pool.label}: emitted face failed the independent check`);
    }
  }
  for (const body of bodies) unchangedStreams(body.decoded, (await mesh(emitted, body.name)).decoded, body.name, false);
  report.converged = true; report.rawRestClear = true; report.outputSha256 = emitted.sha256;
  report.gpuGeometryBytes = geometryGpuBytes(emitted); report.bytes = bytes.length;
  return { bytes, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = name => { const index = args.indexOf(name); return index < 0 ? null : args[index + 1]; };
  try {
    for (const name of ['--raw', '--rest', '--fit', '--id', '--out', '--report']) need(value(name), `missing ${name}`);
    const fit = JSON.parse(readFileSync(resolve(value('--fit'))));
    const result = await fitWearFaces(readWearGlb(resolve(value('--raw'))), readWearGlb(resolve(value('--rest'))), fit,
      { id: value('--id'), garmentIds: args.includes('--expanded') ? IDLE_FACE_GARMENTS : FACE_GARMENTS });
    writeFileSync(resolve(value('--out')), result.bytes); writeFileSync(resolve(value('--report')), JSON.stringify(result.report, null, 2) + '\n');
    console.log(JSON.stringify({ id: result.report.id, authoringOnly: true, complete: false, converged: true, maximumDisplacementM: result.report.maximumDisplacementM, faceChecks: result.report.faceChecks }));
  } catch (error) { console.error(error.stack ?? String(error)); process.exitCode = 1; }
}
