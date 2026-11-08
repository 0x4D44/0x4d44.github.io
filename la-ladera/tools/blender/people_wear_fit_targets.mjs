#!/usr/bin/env node
// Reproducible authoring of CPU-only seated targets. This is a finite authoring
// proof, never a replacement for the independent all-clips release certificate.
import '../../tests/nice.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readWearGlb, readWearGeometry, checkGeometry } from './people_wear_validate.mjs';
import { compareSkin, readPoseBank, sampleRotations, poseMatrices, skinPositions, usedVertices, blendedMatrix,
  inverseVector, transform, ClosedSurface, closestUnionExit, pushOutPose, preparePoseTarget } from './people_wear_math.mjs';
import { repairTargetBranches } from './people_wear_target_search.mjs';

const STATIC_LIMIT = 0.08, RUNTIME_LIMIT = 0.18, PAD = 0.002, RELAXATION = 0.25, RESERVE = 0.000001;
const BARYCENTRIC = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]];
const ACTIVATION = Object.freeze({ parentJoint: 'hips', thighJoints: Object.freeze(['thigh_l', 'thigh_r']), startRadians: Math.PI / 4, fullRadians: 4 * Math.PI / 9 });
export const TARGET_GARMENTS = Object.freeze(['trousers', 'leggings']);
const need = (ok, message) => { if (!ok) throw new Error(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => a?.length === b?.length && a.every((value, i) => value === b[i]);
const point = (p, v) => Array.from(p.subarray(v * 3, v * 3 + 3));
const distance = (a, b, v) => Math.hypot(a[v * 3] - b[v * 3], a[v * 3 + 1] - b[v * 3 + 1], a[v * 3 + 2] - b[v * 3 + 2]);
const inside = (surfaces, q) => surfaces.some(surface => surface.insideXYZ(...q));
const trianglePoint = (p, triangle, weights) => [0, 1, 2].map(k => triangle.reduce((sum, v, i) => sum + weights[i] * p[v * 3 + k], 0));
const withPositions = (decoded, positions) => ({ ...decoded, attrs: { ...decoded.attrs, POSITION: positions } });
const trianglesOf = decoded => Array.from({ length: decoded.indices.length / 3 }, (_, i) => Array.from(decoded.indices.subarray(i * 3, i * 3 + 3)));

function unchanged(raw, base, label, allowPositions = true) {
  need(equal(raw.indices, base.indices) && raw.vertices === base.vertices, `${label}: pristine/raw triangle or row mapping changed`);
  need(Object.keys(raw.attrs).sort().join('/') === Object.keys(base.attrs).sort().join('/'), `${label}: pristine/raw attributes changed`);
  for (const name of Object.keys(raw.attrs)) if (!allowPositions || !['POSITION', 'NORMAL'].includes(name))
    need(equal(raw.attrs[name], base.attrs[name]), `${label}: pristine/raw ${name} changed`);
}

function checkPoints(decoded, positions, sample, { faces = true, independent = false } = {}) {
  let vertexFailures = 0, faceFailures = 0, faceChecks = 0, solidAngleChecks = 0;
  const occupied = q => {
    if (!independent) return inside(sample.surfaces, q);
    let hit = false;
    for (const surface of sample.surfaces) for (const part of surface.components) {
      const bounds = part.root.b;
      if (q.some((value, k) => value < bounds[k] || value > bounds[k + 3])) continue;
      const fast = Boolean(surface.containsPart(part, ...q)), winding = surface.windingInside(part, ...q);
      solidAngleChecks++;
      need(fast === winding, `${sample.name}: ray and independent solid-angle occupancy disagree`);
      if (winding) hit = true;
    }
    return hit;
  };
  const used = usedVertices(decoded);
  for (const v of used) if (occupied(point(positions, v))) vertexFailures++;
  if (faces) for (const triangle of trianglesOf(decoded)) for (const weights of BARYCENTRIC) {
    faceChecks++; if (occupied(trianglePoint(positions, triangle, weights))) faceFailures++;
  }
  return { vertexChecks: used.length, vertexFailures, faceChecks, faceFailures, solidAngleChecks };
}

function checkStaticBase(decoded, rawPositions, basePositions, samples, label, independent = true) {
  const data = withPositions(decoded, basePositions), used = usedVertices(data);
  let maximumFromPristineRawM = 0;
  for (const v of used) maximumFromPristineRawM = Math.max(maximumFromPristineRawM, distance(basePositions, rawPositions, v));
  need(maximumFromPristineRawM <= STATIC_LIMIT, `${label}: static base exceeds cumulative 80 mm from pristine raw`);
  const rest = checkPoints(data, skinPositions(data, samples.rest.matrices), samples.rest, { faces: false, independent });
  need(rest.vertexFailures === 0, `${label}: authored base has a raw-rest vertex inside the body`);
  const corrected = pushOutPose(data, samples.idle.matrices, samples.idle.surfaces, { used, padding: PAD, maxDistance: RUNTIME_LIMIT });
  const idle = checkPoints(data, corrected.posedPositions, samples.idle, { independent });
  need(idle.vertexFailures === 0 && idle.faceFailures === 0, `${label}: authored base has unresolved idle faces (${idle.faceFailures})`);
  return { maximumFromPristineRawM, rest, idle };
}

function totalBounds(decoded, base, target, sample) {
  const baseWorld = skinPositions(withPositions(decoded, base), sample.matrices), targetWorld = skinPositions(withPositions(decoded, target), sample.matrices);
  let maxBindM = 0, maxPosedM = 0;
  for (const v of usedVertices(decoded)) { maxBindM = Math.max(maxBindM, distance(target, base, v)); maxPosedM = Math.max(maxPosedM, distance(targetWorld, baseWorld, v)); }
  need(maxBindM <= RUNTIME_LIMIT && maxPosedM <= RUNTIME_LIMIT, `seated target exceeds total 180 mm from its immutable base (${maxBindM}/${maxPosedM})`);
  return { maxBindM, maxPosedM };
}

function uploadTarget(decoded, base, absoluteTarget, rig, sample) {
  const delta = Float32Array.from(absoluteTarget, (value, i) => value - base[i]);
  const poseTarget = preparePoseTarget({ version: 1, kind: 'seated', delta, activation: ACTIVATION }, rig.jointNames, rig.worlds);
  const data = { ...withPositions(decoded, base), poseTarget };
  const result = pushOutPose(data, sample.matrices, sample.surfaces, { used: usedVertices(data), padding: PAD, maxDistance: RUNTIME_LIMIT });
  need(result.targetWeight === 1, 'authoring contact pose did not fully activate the seated target');
  const bounds = totalBounds(decoded, base, result.bindPositions, sample), clearance = checkPoints(data, result.posedPositions, sample, { independent: true });
  need(clearance.vertexFailures === 0 && clearance.faceFailures === 0, `serialized Float32 target has unresolved seated constraints (${clearance.vertexFailures} vertices/${clearance.faceFailures} faces)`);
  return { ...bounds, ...clearance, targetCount: result.targetCount, finalPushCount: result.pushCount };
}

function solveTarget(entry, sample, { maxPasses, onProgress }) {
  const decoded = entry.decoded, base = new Float32Array(decoded.attrs.POSITION), current = new Float32Array(base), data = withPositions(decoded, current), used = usedVertices(data);
  const baseWorld = skinPositions(withPositions(decoded, base), sample.matrices), matrices = new Map([...used].map(v => [v, blendedMatrix(decoded.attrs, v, sample.matrices)]));
  const triangles = [...new Map(trianglesOf(data).map(t => [[...t].sort((a, b) => a - b).join('/'), t])).values()];
  const welds = new Map(), groupFor = new Map();
  for (const v of used) {
    const influences = [];
    for (let k = 0; k < 4; k++) if (decoded.attrs.WEIGHTS_0[v * 4 + k]) influences.push([decoded.attrs.JOINTS_0[v * 4 + k], decoded.attrs.WEIGHTS_0[v * 4 + k]]);
    influences.sort((a, b) => a[0] - b[0]);
    const key = point(base, v).join(',') + '/' + JSON.stringify(influences);
    if (!welds.has(key)) welds.set(key, []);
    const group = welds.get(key); group.push(v); groupFor.set(v, group);
  }
  const first = pushOutPose(data, sample.matrices, sample.surfaces, { used, padding: PAD, maxDistance: RUNTIME_LIMIT });
  current.set(first.bindPositions); let posed = skinPositions(data, sample.matrices);
  const bounds = () => {
    let maxBindM = 0, maxPosedM = 0;
    for (const v of used) { maxBindM = Math.max(maxBindM, distance(current, base, v)); maxPosedM = Math.max(maxPosedM, distance(posed, baseWorld, v)); }
    need(maxBindM <= RUNTIME_LIMIT && maxPosedM <= RUNTIME_LIMIT, `${entry.label}: total target movement exceeded 180 mm`);
    return { maxBindM, maxPosedM };
  };
  function move(lead, delta) {
    const matrix = matrices.get(lead), before = point(current, lead), origin = point(base, lead), posedOrigin = point(baseWorld, lead);
    const targetAt = scale => before.map((value, k) => Math.fround(value + delta[k] * scale));
    const valid = target => Math.hypot(...target.map((value, k) => value - origin[k])) <= RUNTIME_LIMIT - RESERVE &&
      Math.hypot(...transform(matrix, target).map((value, k) => value - posedOrigin[k])) <= RUNTIME_LIMIT - RESERVE;
    let scale = 1, target = targetAt(scale);
    if (!valid(target)) {
      let low = 0, high = 1;
      for (let step = 0; step < 24; step++) { const middle = (low + high) / 2; if (valid(targetAt(middle))) low = middle; else high = middle; }
      scale = low; target = targetAt(scale);
    }
    if (!valid(target)) return true;
    const world = transform(matrix, target);
    for (const v of groupFor.get(lead)) { current.set(target, v * 3); posed.set(world, v * 3); }
    return scale < 1;
  }
  const report = { label: entry.label, vertices: used.length, triangles: decoded.indices.length / 3, initial: checkPoints(data, posed, sample), passes: [] };
  let final = report.initial, bestFailures = final.faceFailures, stalledPasses = 0;
  for (let pass = 0; (final.vertexFailures || final.faceFailures) && pass < maxPasses; pass++) {
    let constraints = 0, vertexConstraints = 0, clamped = 0;
    for (const triangle of triangles) for (const weights of BARYCENTRIC) {
      const q = trianglePoint(posed, triangle, weights); if (!inside(sample.surfaces, q)) continue;
      const exit = closestUnionExit(sample.surfaces, q, { padding: PAD, maxDistance: RUNTIME_LIMIT });
      need(exit, `${entry.label}: no bounded seated face exit`);
      const groups = new Map();
      for (let i = 0; i < 3; i++) if (weights[i]) { const lead = groupFor.get(triangle[i])[0]; groups.set(lead, (groups.get(lead) ?? 0) + weights[i]); }
      const denominator = [...groups.values()].reduce((sum, weight) => sum + weight * weight, 0);
      for (const [lead, weight] of groups) clamped += Number(move(lead, inverseVector(matrices.get(lead), exit.deltaWorld.map(value => value * weight / denominator * RELAXATION))));
      constraints++;
    }
    for (let iteration = 0; iteration < 12; iteration++) {
      let failures = 0;
      for (const group of welds.values()) {
        const lead = group[0], q = point(posed, lead); if (!inside(sample.surfaces, q)) continue;
        failures++; vertexConstraints++;
        const exit = closestUnionExit(sample.surfaces, q, { padding: PAD, maxDistance: RUNTIME_LIMIT });
        need(exit, `${entry.label}: no bounded seated vertex exit`);
        clamped += Number(move(lead, inverseVector(matrices.get(lead), exit.deltaWorld)));
      }
      if (!failures) break;
    }
    // The private target is the real working stream. Re-skin it; no frozen
    // projection offset is carried across authoring transactions or frames.
    posed = skinPositions(data, sample.matrices); final = checkPoints(data, posed, sample);
    stalledPasses = final.faceFailures < bestFailures ? 0 : stalledPasses + 1;
    bestFailures = Math.min(bestFailures, final.faceFailures);
    if (final.faceFailures && (stalledPasses >= 8 || pass + 1 === maxPasses)) {
      const alternative = repairTargetBranches({ decoded, base, current, used, triangles, welds, matrices, baseWorld, label: entry.label }, sample);
      (report.alternativeDirections ??= []).push({ pass: pass + 1, ...alternative });
      posed = skinPositions(data, sample.matrices); final = checkPoints(data, posed, sample);
      bestFailures = Math.min(bestFailures, final.faceFailures); stalledPasses = 0;
    }
    const row = { pass: pass + 1, constraints, vertexConstraints, clamped, ...final, ...bounds() }; report.passes.push(row);
    if (onProgress && (pass === 0 || (pass + 1) % 20 === 0 || (!final.vertexFailures && !final.faceFailures))) onProgress({ target: entry.label, ...row });
  }
  report.final = { ...final, ...bounds() };
  report.converged = final.vertexFailures === 0 && final.faceFailures === 0;
  return { bindPositions: current, report };
}

/** Input is a pristine generated GLB plus its independently clear idle fit.
 * Returns full original-pool arrays; the writer subsequently compacts each LOD
 * and computes Float32 delta(target - ACTUAL shipped base). Near/far targets are
 * solved independently. Explicit source topology choices select complete cuts,
 * never omitted faces or a different collision body. */
export async function fitWearPoseTargets(rawGlb, idleBaseGlb, fit, { id, maxPasses = 160, onProgress = null } = {}) {
  need(typeof id === 'string' && id.length > 0 && rawGlb?.g && idleBaseGlb?.g && fit?.garments &&
    Number.isInteger(maxPasses) && maxPasses > 0 && maxPasses <= 160, 'invalid seated target authoring inputs/options');
  need(Object.keys(fit.garments).length === 23 && TARGET_GARMENTS.every(gid => fit.garments[gid]) && fit.garments.jeans, `${id}: complete adult garment library required`);
  need(!rawGlb.g.nodes.some(n => n.extras?.poseTarget) && !idleBaseGlb.g.nodes.some(n => n.extras?.poseTarget), 'pose targets must be authored before CPU target export; an existing target is not a new baseline');
  const bodies = [];
  for (const [name, ranges] of [[fit.bodyNode, fit.bodyComponents], [fit.bodyLodNode, fit.bodyFarComponents], [fit.proxyNode, fit.proxyComponents]]) {
    const entry = await readWearGeometry(idleBaseGlb, name), raw = await readWearGeometry(rawGlb, name);
    unchanged(raw.decoded, entry.decoded, name, false); compareSkin(raw.rig, entry.rig, name);
    bodies.push({ entry, ranges: ranges ?? entry.node.extras?.components ?? null });
  }
  const rig = bodies[0].entry.rig, bank = readPoseBank(), idleClip = bank.find(c => c.name === 'idle_a'), seatedClip = bank.find(c => c.name === 'sit_idle');
  const samples = {};
  for (const [key, name, clip, phase] of [['rest', 'rest', null, 0], ['idle', 'idle_a', idleClip, 0.27], ['seated', 'sit_idle', seatedClip, 0.25]]) {
    const matrices = poseMatrices(rig, clip ? sampleRotations(clip, clip.duration * phase) : null);
    samples[key] = { name, phase, matrices, surfaces: bodies.map(({ entry, ranges }) => new ClosedSurface(entry.decoded, ranges, entry.name).pose(skinPositions(entry.decoded, matrices))) };
  }
  const report = { schema: 1, id, authoringOnly: true, complete: false, converged: false,
    rawInputSha256: rawGlb.shippedSha256 ?? rawGlb.sha256, sourceBaseSha256: idleBaseGlb.shippedSha256 ?? idleBaseGlb.sha256,
    maxStaticDisplacementM: STATIC_LIMIT, maxRuntimeDisplacementM: RUNTIME_LIMIT, relaxation: RELAXATION, paddingM: PAD,
    clip: 'sit_idle', phase: 0.25, time: seatedClip.duration * 0.25, topologyChoices: structuredClone(fit.topologyChoices ?? {}),
    staticRows: [], targets: [], maximumStaticFromPristineRawM: 0, maximumTotalBindM: 0, maximumTotalPosedM: 0 };
  const entries = new Map(), targets = [], solved = new Map();
  try {
    for (const [gid, record] of Object.entries(fit.garments)) for (const lod of [0, 1]) {
      const choice = lod === 0 ? fit.topologyChoices?.[gid] : null;
      if (choice) need(choice.nearCut === 'complete-far-cut' && choice.sourceLod === 1, `${id}/${gid}: unsupported source topology choice`);
      const sourceLod = choice ? 1 : lod, name = sourceLod ? record.lodNode : record.node;
      const entry = await readWearGeometry(idleBaseGlb, name), raw = await readWearGeometry(rawGlb, name);
      unchanged(raw.decoded, entry.decoded, name); compareSkin(entry.rig, rig, name); compareSkin(raw.rig, rig, name);
      checkGeometry(entry.decoded, lod ? 600 : 1800, name);
      entry.rawPositions = new Float32Array(raw.decoded.attrs.POSITION); entry.sourceLod = sourceLod; entry.label = `${id}/${gid}/${lod}`;
      const baseAudit = checkStaticBase(entry.decoded, entry.rawPositions, new Float32Array(entry.decoded.attrs.POSITION), samples, entry.label);
      report.staticRows.push({ garment: gid, lod, sourceLod, triangles: entry.decoded.indices.length / 3, ...baseAudit });
      report.maximumStaticFromPristineRawM = Math.max(report.maximumStaticFromPristineRawM, baseAudit.maximumFromPristineRawM);
      entries.set(`${gid}/${lod}`, entry);
    }
    for (const lod of [0, 1]) {
      const trousers = entries.get(`trousers/${lod}`), jeans = entries.get(`jeans/${lod}`);
      need(trousers.sourceLod === jeans.sourceLod && equal(trousers.decoded.indices, jeans.decoded.indices) &&
        Object.keys(trousers.decoded.attrs).every(name => equal(trousers.decoded.attrs[name], jeans.decoded.attrs[name])), 'trousers/jeans must retain the same complete cut');
    }
    for (const garment of TARGET_GARMENTS) for (const lod of [0, 1]) {
      const entry = entries.get(`${garment}/${lod}`), a = entry.primitive.attributes;
      const key = `${a.POSITION}/${a.JOINTS_0}/${a.WEIGHTS_0}/${entry.primitive.indices}/${entry.node.skin}`;
      let result = solved.get(key), reused = Boolean(result);
      if (!result) { result = solveTarget(entry, samples.seated, { maxPasses, onProgress }); solved.set(key, result); }
      const row = { garment, lod, sourceLod: entry.sourceLod, reusedCompleteCutTarget: reused, ...result.report }; report.targets.push(row);
      need(result.report.converged, `${entry.label}: unresolved seated target after ${maxPasses} passes (${result.report.final.vertexFailures} vertices/${result.report.final.faceFailures} faces)`);
      const originalBase = new Float32Array(entry.decoded.attrs.POSITION), baseOverride = new Float32Array(originalBase), used = usedVertices(entry.decoded);
      let margin = null, effectiveBase = originalBase;
      // This is a physical source-position proposal, never an accounting reset.
      // It retains the pristine raw origin and is accepted only if every static
      // and seated constraint still passes under the original two bounds.
      if (result.report.final.maxBindM > 0.17) {
        for (const v of used) for (let k = 0; k < 3; k++) baseOverride[v * 3 + k] = originalBase[v * 3 + k] + 0.05 * (result.bindPositions[v * 3 + k] - originalBase[v * 3 + k]);
        const maximumBaseChangeM = Math.max(...[...used].map(v => distance(baseOverride, originalBase, v)));
        try {
          need(maximumBaseChangeM <= 0.01, 'base margin proposal exceeds 10 mm');
          const staticProof = checkStaticBase(entry.decoded, entry.rawPositions, baseOverride, samples, `${entry.label}/base-margin`);
          const runtimeProof = uploadTarget(entry.decoded, baseOverride, result.bindPositions, rig, samples.seated);
          margin = { fraction: 0.05, accepted: true, maximumBaseChangeM, ...staticProof, runtime: runtimeProof }; effectiveBase = baseOverride;
          report.maximumStaticFromPristineRawM = Math.max(report.maximumStaticFromPristineRawM, staticProof.maximumFromPristineRawM);
        } catch (error) { margin = { fraction: 0.05, accepted: false, maximumBaseChangeM, reason: error.message }; }
      }
      const final = uploadTarget(entry.decoded, effectiveBase, result.bindPositions, rig, samples.seated);
      row.baseMargin = margin; row.finalUpload = final;
      report.maximumTotalBindM = Math.max(report.maximumTotalBindM, final.maxBindM); report.maximumTotalPosedM = Math.max(report.maximumTotalPosedM, final.maxPosedM);
      targets.push({ garment, lod, sourceLod: entry.sourceLod, bindPositions: new Float32Array(result.bindPositions),
        ...(effectiveBase !== originalBase ? { baseOverride: new Float32Array(effectiveBase) } : {}) });
      if (onProgress) onProgress({ target: entry.label, complete: true, ...final, baseMargin: margin });
    }
    report.converged = true;
    return { sourceBaseSha256: report.sourceBaseSha256, targets, report };
  } catch (error) { error.report = report; throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  try {
    for (const name of ['--raw', '--base', '--fit', '--id', '--out-dir', '--report']) need(value(name), `missing ${name}`);
    const fit = JSON.parse(readFileSync(resolve(value('--fit')))), result = await fitWearPoseTargets(readWearGlb(resolve(value('--raw'))), readWearGlb(resolve(value('--base'))), fit, { id: value('--id') });
    const directory = resolve(value('--out-dir')); mkdirSync(directory, { recursive: true });
    const manifest = { id: value('--id'), sourceBaseSha256: result.sourceBaseSha256, targets: [] };
    for (const target of result.targets) {
      const file = resolve(directory, `${target.garment}-${target.lod}.positions`), bytes = Buffer.from(target.bindPositions.buffer); writeFileSync(file, bytes);
      const row = { garment: target.garment, lod: target.lod, sourceLod: target.sourceLod, file, count: target.bindPositions.length / 3, sha256: hash(bytes), format: 'absolute-bind-position-float32-le' };
      if (target.baseOverride) { row.baseOverride = resolve(directory, `${target.garment}-${target.lod}.base.positions`); writeFileSync(row.baseOverride, Buffer.from(target.baseOverride.buffer)); }
      manifest.targets.push(row);
    }
    writeFileSync(resolve(directory, 'targets.json'), JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(resolve(value('--report')), JSON.stringify(result.report, null, 2) + '\n');
    console.log(JSON.stringify({ id: value('--id'), authoringOnly: true, complete: false, converged: true, maxBindM: result.report.maximumTotalBindM, maxPosedM: result.report.maximumTotalPosedM }));
  } catch (error) {
    if (value('--report') && error.report) writeFileSync(resolve(value('--report')), JSON.stringify({ ...error.report, error: error.message }, null, 2) + '\n');
    console.error(error.stack ?? String(error)); process.exitCode = 1;
  }
}
