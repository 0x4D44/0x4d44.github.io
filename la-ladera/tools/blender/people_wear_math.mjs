// CPU skinning and closed-surface queries shared by the wearable build gate and
// failure-injection tests. Operates on the exported glTF bytes, not author claims.
import { readAccessor, CONTRACT, readClipBank } from './people_validate.mjs';
import { identity, multiply } from '../../js/people/wear_geometry.js';
export { identity, multiply, transform, inverseVector, usedVertices, blendedMatrix, skinPositions, ClosedSurface, closestUnionExit, rayUnionExit, pushOutPose, checkPenetrations } from '../../js/people/wear_geometry.js';
export { preparePoseTarget, evaluatePoseTarget } from '../../js/people/wear_pose.js';

const fail = (ok, message) => { if (!ok) throw new Error(message); };
export const canon = (name = '') => name.replace(/(?:_\d+|\.\d+)$/, '');
export function nodeMatrix(n, rotation = null) {
  if (n.matrix) { fail(rotation === null, 'animated matrix-only bone is unsupported'); return Float64Array.from(n.matrix); }
  rotation ??= n.rotation ?? [0, 0, 0, 1];
  const [x, y, z, w] = rotation, [sx, sy, sz] = n.scale ?? [1, 1, 1], t = n.translation ?? [0, 0, 0];
  return new Float64Array([(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, ...t, 1]);
}
const near = (a, b, eps = 0.0002) => a.length === b.length && a.every((v, i) => Number.isFinite(v) && Math.abs(v - b[i]) <= eps);

/** Skin matrices must be usable with the resident's unchanged skeleton. */
export function skinInfo(glb, meshNode) {
  const { g } = glb, ni = typeof meshNode === 'string' ? g.nodes.findIndex(n => n.name === meshNode) : meshNode;
  fail(ni >= 0 && g.nodes[ni]?.mesh != null, `${meshNode}: missing mesh node`);
  const node = g.nodes[ni], skin = g.skins?.[node.skin];
  fail(skin && skin.joints.length === 21, `${node.name}: expected 21-joint skin`);
  const jointNames = skin.joints.map(j => canon(g.nodes[j]?.name));
  fail(new Set(jointNames).size === 21 && CONTRACT.bones.every(n => jointNames.includes(n)), `${node.name}: noncanonical skin joint`);
  const parents = new Int32Array(g.nodes.length).fill(-1);
  g.nodes.forEach((n, i) => (n.children ?? []).forEach(c => {
    fail(Number.isInteger(c) && c >= 0 && c < g.nodes.length && c !== i && parents[c] === -1, `${node.name}: invalid node hierarchy`); parents[c] = i;
  }));
  const cache = new Map(), visiting = new Set();
  const worldAtRest = i => {
    if (cache.has(i)) return cache.get(i);
    fail(!visiting.has(i), `${node.name}: cyclic node hierarchy`); visiting.add(i);
    const local = nodeMatrix(g.nodes[i]);
    fail([...local].every(Number.isFinite), `${node.name}: non-finite rest transform`);
    const w = parents[i] < 0 ? local : multiply(worldAtRest(parents[i]), local);
    visiting.delete(i); cache.set(i, w); return w;
  };
  const meshWorld = worldAtRest(ni);
  fail(near([...meshWorld], [...identity()], 0.00001), `${node.name}: apply mesh/root transforms before export`);
  fail(g.accessors[skin.inverseBindMatrices]?.type === 'MAT4', `${node.name}: missing inverse bind matrices`);
  const bind = readAccessor(glb, skin.inverseBindMatrices);
  fail(bind.length === 21 * 16, `${node.name}: wrong inverse bind matrix count`);
  const worlds = {}, locals = {}, boneParents = {};
  skin.joints.forEach((j, k) => {
    const n = jointNames[k], w = worldAtRest(j); worlds[n] = w;
    locals[n] = nodeMatrix(g.nodes[j]);
    boneParents[n] = parents[j] < 0 ? null : canon(g.nodes[parents[j]].name);
    if (!CONTRACT.bones.includes(boneParents[n])) boneParents[n] = null;
    fail(near([...multiply(w, bind.subarray(k * 16, k * 16 + 16))], [...identity()], 0.0003), `${node.name}/${n}: inverse bind does not cancel rest transform`);
  });
  return { glb, nodeIndex: ni, skinIndex: node.skin, joints: skin.joints, jointNames, parents, bind, worlds, locals, boneParents };
}
export function compareSkin(actual, source, label = 'wearable') {
  fail(actual.jointNames.every((n, i) => n === source.jointNames[i]), `${label}: joint order changed`);
  for (const name of CONTRACT.bones) {
    fail(actual.boneParents[name] === source.boneParents[name], `${label}/${name}: parent changed`);
    fail(near([...actual.locals[name]], [...source.locals[name]], 1e-7), `${label}/${name}: local rest transform changed`);
    fail(near([...actual.worlds[name]], [...source.worlds[name]], 1e-7), `${label}/${name}: rest transform changed`);
    const a = actual.jointNames.indexOf(name), b = source.jointNames.indexOf(name);
    fail(near([...actual.bind.subarray(a * 16, a * 16 + 16)], [...source.bind.subarray(b * 16, b * 16 + 16)], 1e-7), `${label}/${name}: inverse bind changed`);
  }
}

function slerp(a, offsetA, b, offsetB, t) {
  if (t === 0) return Array.from(a.subarray(offsetA, offsetA + 4));
  if (t === 1) return Array.from(b.subarray(offsetB, offsetB + 4));
  if ([0, 1, 2, 3].every(k => a[offsetA + k] === b[offsetB + k])) return Array.from(a.subarray(offsetA, offsetA + 4));
  let dot = 0; for (let k = 0; k < 4; k++) dot += a[offsetA + k] * b[offsetB + k];
  const sign = dot < 0 ? -1 : 1;
  let x = 1 - t, y = t;
  const sqrSin = 1 - dot * dot;
  if (sqrSin > Number.EPSILON) { const sin = Math.sqrt(sqrSin), theta = Math.atan2(sin, dot * sign); x = Math.sin((1 - t) * theta) / sin; y = Math.sin(t * theta) / sin; }
  const q = Array.from({ length: 4 }, (_, k) => a[offsetA + k] * x + b[offsetB + k] * y * sign), len = Math.hypot(...q);
  fail(len > 0 && Number.isFinite(len), 'invalid quaternion interpolation'); return x === 1 - y ? q.map(v => v / len) : q;
}
export function readPoseBank(bank = readClipBank()) {
  const names = bank.g.animations?.map(a => a.name) ?? [];
  fail(names.length === CONTRACT.clips.length && new Set(names).size === names.length && CONTRACT.clips.every(n => names.includes(n)), 'pose bank must contain all 32 clips');
  return bank.g.animations.map(a => {
    fail(a.channels.length === CONTRACT.bones.length, `${a.name}: incomplete bone channels`);
    const tracks = a.channels.map(c => {
      const name = canon(bank.g.nodes[c.target.node]?.name), sampler = a.samplers[c.sampler];
      fail(c.target.path === 'rotation' && CONTRACT.bones.includes(name), `${a.name}: unsupported animation target`);
      const interpolation = sampler?.interpolation ?? 'LINEAR';
      fail(interpolation === 'LINEAR' || interpolation === 'STEP', `${a.name}/${name}: unsupported interpolation`);
      const times = readAccessor(bank, sampler.input), values = readAccessor(bank, sampler.output);
      fail(bank.g.accessors[sampler.input].type === 'SCALAR' && bank.g.accessors[sampler.output].type === 'VEC4' && values.length === times.length * 4, `${a.name}/${name}: invalid track format`);
      for (let i = 0; i < times.length; i++) {
        fail(Number.isFinite(times[i]) && times[i] >= 0 && (i === 0 || times[i] > times[i - 1]), `${a.name}/${name}: invalid keyframe time`);
        const q = values.subarray(i * 4, i * 4 + 4); fail([...q].every(Number.isFinite) && Math.abs(Math.hypot(...q) - 1) < 0.0001, `${a.name}/${name}: invalid quaternion`);
      }
      return { name, times, values, interpolation };
    });
    fail(new Set(tracks.map(t => t.name)).size === 21, `${a.name}: duplicate bone channel`);
    return { name: a.name, tracks, duration: Math.max(...tracks.map(t => t.times.at(-1))) };
  });
}
export function sampleRotations(clip, time) {
  if (!clip) return null;
  const out = new Map();
  for (const t of clip.tracks) {
    let lo = 0, hi = t.times.length - 1;
    if (time >= t.times[hi]) { out.set(t.name, Array.from(t.values.subarray(hi * 4, hi * 4 + 4))); continue; }
    while (lo + 1 < hi) { const m = (lo + hi) >>> 1; if (t.times[m] <= time) lo = m; else hi = m; }
    const f = t.interpolation === 'STEP' ? 0 : Math.max(0, Math.min(1, (time - t.times[lo]) / (t.times[hi] - t.times[lo])));
    out.set(t.name, slerp(t.values, lo * 4, t.values, hi * 4, f));
  }
  return out;
}
/** All saved keyframes plus the midpoint of every sampled interval. Extrema mode
 * includes every quaternion component turning point and geodesic interior peak. */
export function poseSamples(clips = readPoseBank(), mode = 'all') {
  fail(mode === 'all' || mode === 'extrema', 'unknown pose sampling mode');
  const out = [{ clip: null, clipName: 'rest', time: 0 }];
  for (const clip of clips) {
    const keys = new Set([0, clip.duration]);
    for (const track of clip.tracks) {
      const { times, values: q } = track;
      if (mode === 'all') for (const t of times) keys.add(t);
      if (track.interpolation === 'STEP') for (let i = 1; i < times.length; i++) {
        if ([0, 1, 2, 3].some(k => q[i * 4 + k] !== q[(i - 1) * 4 + k])) {
          keys.add(times[i]); keys.add(Math.max(times[i - 1], times[i] - 1e-7));
        }
      }
      for (let i = 1; i < times.length - 1; i++) for (let k = 0; k < 4; k++) {
        const a = q[i * 4 + k] - q[(i - 1) * 4 + k], b = q[(i + 1) * 4 + k] - q[i * 4 + k];
        if (a * b < -1e-14) keys.add(times[i]);
      }
      // Slerp follows a great circle. Its component derivative can be zero
      // between saved keys, so add those exact t values as well.
      for (let i = 0; track.interpolation !== 'STEP' && i < times.length - 1; i++) {
        let dot = 0; for (let k = 0; k < 4; k++) dot += q[i * 4 + k] * q[(i + 1) * 4 + k];
        const sign = dot < 0 ? -1 : 1; dot = Math.min(1, Math.abs(dot));
        if (1 - dot * dot <= Number.EPSILON) continue;
        const theta = Math.acos(dot), sin = Math.sin(theta);
        for (let k = 0; k < 4; k++) {
          const a = q[i * 4 + k], b = (q[(i + 1) * 4 + k] * sign - a * dot) / sin;
          let angle = Math.atan2(b, a); while (angle < 0) angle += Math.PI;
          if (angle > 1e-8 && angle < theta - 1e-8) keys.add(times[i] + (times[i + 1] - times[i]) * angle / theta);
        }
      }
    }
    const sorted = [...keys].sort((a, b) => a - b), times = new Set(sorted);
    for (let i = 0; i < sorted.length - 1; i++) times.add((sorted[i] + sorted[i + 1]) / 2);
    for (const time of [...times].sort((a, b) => a - b)) out.push({ clip, clipName: clip.name, time });
  }
  return out;
}
export function poseMatrices(rig, rotations = null) {
  const { glb: { g }, parents, joints, bind } = rig, cache = new Map();
  function world(i) {
    if (cache.has(i)) return cache.get(i);
    const n = g.nodes[i], q = rotations?.get(canon(n.name));
    const local = q ? nodeMatrix(n, q) : nodeMatrix(n);
    const m = parents[i] < 0 ? local : multiply(world(parents[i]), local); cache.set(i, m); return m;
  }
  return joints.map((n, i) => multiply(world(n), bind.subarray(i * 16, i * 16 + 16)));
}
