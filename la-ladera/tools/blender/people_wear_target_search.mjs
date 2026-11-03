// CPU-target authoring only. These proposals never replace the independent
// serialized-target checks or the complete saved-clip clearance certificate.
import { skinPositions, transform } from './people_wear_math.mjs';

const LIMIT = .18, PAD = .002, RESERVE = .000001;
const BARYCENTRIC = [[1 / 3, 1 / 3, 1 / 3], [.5, .5, 0], [0, .5, .5], [.5, 0, .5]];
const need = (ok, message) => { if (!ok) throw new Error(message); };
const point = (p, v) => Array.from(p.subarray(v * 3, v * 3 + 3));
const inside = (surfaces, p) => surfaces.some(s => s.insideXYZ(...p));
const count = rows => rows.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
const OFFSETS = Object.freeze((() => {
  const result = [], steps = 18, step = LIMIT / steps;
  for (let x = -steps; x <= steps; x++) for (let y = -steps; y <= steps; y++) for (let z = -steps; z <= steps; z++) {
    const radius2 = x * x + y * y + z * z;
    if (radius2 < steps * steps) result.push({ delta: [x * step, y * step, z * step], radius2 });
  }
  result.sort((a, b) => a.radius2 - b.radius2 || a.delta[0] - b.delta[0] || a.delta[1] - b.delta[1] || a.delta[2] - b.delta[2]);
  return result.map(({ delta }) => Object.freeze(delta));
})());
const LOCAL_OFFSETS = Object.freeze((() => {
  const result = [], steps = 8, step = .0025;
  for (let x = -steps; x <= steps; x++) for (let y = -steps; y <= steps; y++) for (let z = -steps; z <= steps; z++) {
    const radius2 = x * x + y * y + z * z;
    if (radius2 && radius2 <= steps * steps) result.push({ delta: [x * step, y * step, z * step], radius2 });
  }
  result.sort((a, b) => a.radius2 - b.radius2 || a.delta[0] - b.delta[0] || a.delta[1] - b.delta[1] || a.delta[2] - b.delta[2]);
  return result.map(({ delta }) => Object.freeze(delta));
})());

function outsidePadded(surfaces, p) {
  if (inside(surfaces, p)) return false;
  for (const surface of surfaces) for (const part of surface.components) {
    const bounds = part.root.b;
    const distance2 = p.reduce((sum, value, k) => sum + Math.max(bounds[k] - value, 0, value - bounds[k + 3]) ** 2, 0);
    if (distance2 < PAD * PAD && surface.nearest(p, part).distance < PAD) return false;
  }
  return true;
}

function normal(points) {
  const u = points[1].map((value, k) => value - points[0][k]), v = points[2].map((value, k) => value - points[0][k]);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

const preservesOrientation = (before, after) => Math.hypot(...after) > 1e-12 && before.reduce((sum, value, k) => sum + value * after[k], 0) > 0;

/** Try alternate directions within one existing seated authoring iteration.
 * base/baseWorld are immutable shipped-base positions; current is the private
 * Float32 CPU target. The caller retains its original 160-pass hard ceiling.
 */
export function repairTargetBranches(pool, sample) {
  const { decoded, base, current, used, triangles, welds, matrices, baseWorld } = pool;
  need(current instanceof Float32Array && base instanceof Float32Array && current.length === base.length && current.length === decoded.attrs.POSITION.length,
    'target branch search requires matching Float32 base and target streams');
  const data = { ...decoded, attrs: { ...decoded.attrs, POSITION: current } };
  let positions = skinPositions(data, sample.matrices);
  const flagsFor = (triangle, values = positions) => BARYCENTRIC.map(weights => inside(sample.surfaces,
    [0, 1, 2].map(k => triangle.reduce((sum, v, j) => sum + weights[j] * values[v * 3 + k], 0))));
  let flags = triangles.map(triangle => flagsFor(triangle));
  const report = { before: count(flags), after: 0, candidates: 0, attemptedGroups: 0, acceptedGroups: 0, maxBindM: 0, maxPosedM: 0 };
  const groups = [...welds.values()].map(members => {
    const selected = new Set(members), incident = [];
    for (let i = 0; i < triangles.length; i++) if (triangles[i].some(v => selected.has(v))) incident.push(i);
    return { members, selected, incident, lead: Math.min(...members) };
  }).filter(group => group.incident.some(i => flags[i].some(Boolean)))
    .sort((a, b) => count(b.incident.map(i => flags[i])) - count(a.incident.map(i => flags[i])) || a.lead - b.lead);
  for (const { members, selected, incident, lead } of groups) {
    const oldCount = count(incident.map(i => flags[i])); if (!oldCount) continue;
    report.attemptedGroups++;
    const origin = point(base, lead);
    const bindNormals = new Map(incident.map(i => [i, normal(triangles[i].map(v => point(current, v)))]));
    const posedNormals = new Map(incident.map(i => [i, normal(triangles[i].map(v => point(positions, v)))]));
    let best = null;
    // The global grid finds another branch; a small local grid resolves a
    // narrow admissible corridor between the same unchanged bound surfaces.
    // Both still pass the identical immutable-base and posed-space predicates.
    const relative = point(current, lead).map((value, k) => value - origin[k]);
    const offsets = [...OFFSETS, ...LOCAL_OFFSETS.map(delta => delta.map((value, k) => value + relative[k]))];
    for (const delta of offsets) {
      const target = origin.map((value, k) => Math.fround(value + delta[k])); report.candidates++;
      const posed = new Map(); let valid = true, bindMovement = 0, posedMovement = 0;
      for (const v of members) {
        const world = transform(matrices.get(v), target);
        const bind = Math.hypot(...target.map((value, k) => value - base[v * 3 + k]));
        const movement = Math.hypot(...world.map((value, k) => value - baseWorld[v * 3 + k]));
        if (!target.every(Number.isFinite) || bind > LIMIT - RESERVE || movement > LIMIT - RESERVE || !outsidePadded(sample.surfaces, world)) { valid = false; break; }
        bindMovement = Math.max(bindMovement, bind); posedMovement = Math.max(posedMovement, movement); posed.set(v, world);
      }
      if (!valid) continue;
      let remaining = 0;
      for (const i of incident) {
        const triangle = triangles[i], bindPoints = triangle.map(v => selected.has(v) ? target : point(current, v));
        const worldPoints = triangle.map(v => posed.get(v) ?? point(positions, v));
        if (!preservesOrientation(bindNormals.get(i), normal(bindPoints)) || !preservesOrientation(posedNormals.get(i), normal(worldPoints))) { valid = false; break; }
        for (let b = 0; b < BARYCENTRIC.length; b++) {
          const p = [0, 1, 2].map(k => worldPoints.reduce((sum, value, j) => sum + BARYCENTRIC[b][j] * value[k], 0));
          const blocked = inside(sample.surfaces, p);
          if (blocked && !flags[i][b] || !blocked && flags[i][b] && !outsidePadded(sample.surfaces, p)) { valid = false; break; }
          if (blocked) remaining++;
        }
        if (!valid) break;
      }
      if (!valid || remaining >= oldCount) continue;
      if (!best || remaining < best.remaining || remaining === best.remaining && bindMovement < best.bindMovement)
        best = { target, remaining, bindMovement, posedMovement };
      if (!remaining) break;
    }
    if (!best) continue;
    for (const v of members) current.set(best.target, v * 3);
    positions = skinPositions(data, sample.matrices);
    const next = triangles.map(triangle => flagsFor(triangle));
    need(next.every((row, i) => row.every((blocked, b) => !blocked || flags[i][b])), `${pool.label}: alternate target direction added a failed probe`);
    need(count(next) < count(flags), `${pool.label}: alternate target direction did not improve face clearance`);
    for (const v of used) {
      need(Math.hypot(...point(current, v).map((value, k) => value - base[v * 3 + k])) <= LIMIT &&
        Math.hypot(...point(positions, v).map((value, k) => value - baseWorld[v * 3 + k])) <= LIMIT,
      `${pool.label}: alternate target direction exceeded immutable 180 mm bounds`);
    }
    flags = next; report.acceptedGroups++;
    report.maxBindM = Math.max(report.maxBindM, best.bindMovement); report.maxPosedM = Math.max(report.maxPosedM, best.posedMovement);
  }
  report.after = count(flags);
  return report;
}
