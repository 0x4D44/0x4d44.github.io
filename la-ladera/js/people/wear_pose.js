// CPU-only pose-target activation. The authored garment positions remain the
// displacement origin; this module only measures the actual articulated pose.
const need = (condition, message) => { if (!condition) throw new Error(message); };
const preparedTargets = new WeakSet();
const canonical = name => String(name).replace(/(?:_\d+|\.\d+)$/, '');
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalized = (v, label) => {
  const length = Math.hypot(...v);
  need(Number.isFinite(length) && length > 1e-10, `${label}: degenerate pose direction`);
  return Object.freeze(v.map(value => value / length));
};
function elements(value, label) {
  const matrix = value?.elements ?? value;
  need(matrix?.length === 16 && Array.from(matrix).every(Number.isFinite), `${label}: invalid pose matrix`);
  need(Math.abs(matrix[3]) < 1e-9 && Math.abs(matrix[7]) < 1e-9 && Math.abs(matrix[11]) < 1e-9 && Math.abs(matrix[15] - 1) < 1e-9,
    `${label}: pose matrix must be affine`);
  return matrix;
}
function direction(matrix, vector) {
  const [x, y, z] = vector;
  return [matrix[0] * x + matrix[4] * y + matrix[8] * z,
    matrix[1] * x + matrix[5] * y + matrix[9] * z,
    matrix[2] * x + matrix[6] * y + matrix[10] * z];
}
function inverseDirection(matrix, vector) {
  const a = matrix[0], b = matrix[4], c = matrix[8], d = matrix[1], e = matrix[5], f = matrix[9], g = matrix[2], h = matrix[6], i = matrix[10];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  need(Number.isFinite(determinant) && Math.abs(determinant) > 1e-10, 'pose target has a singular parent transform');
  const [x, y, z] = vector;
  return [((e * i - f * h) * x + (c * h - b * i) * y + (b * f - c * e) * z) / determinant,
    ((f * g - d * i) * x + (a * i - c * g) * y + (c * d - a * f) * z) / determinant,
    ((d * h - e * g) * x + (b * g - a * h) * y + (a * e - b * d) * z) / determinant];
}

/** Prepare an immutable descriptor using REST world matrices in joint order,
 * or a canonical-name-to-matrix object. Matrix4 objects are also accepted.
 * The Float32 delta is borrowed CPU data, never a renderer attribute. */
export function preparePoseTarget(descriptor, jointNames, restWorldMatrices) {
  need(descriptor?.version === 1 && descriptor.kind === 'seated', 'unsupported wearable pose target');
  const delta = descriptor.delta, activation = descriptor.activation;
  need(delta instanceof Float32Array && delta.length > 0 && delta.length % 3 === 0 && delta.every(Number.isFinite),
    'pose target requires finite Float32 VEC3 deltas');
  need(activation?.parentJoint === 'hips' && Array.isArray(activation.thighJoints) && activation.thighJoints.length === 2 &&
    activation.thighJoints[0] === 'thigh_l' && activation.thighJoints[1] === 'thigh_r' &&
    activation.startRadians === Math.PI / 4 && activation.fullRadians === 4 * Math.PI / 9,
  'unsupported seated pose target activation');
  need(Array.isArray(jointNames) && jointNames.length > 0, 'pose target requires canonical joint names');
  const names = jointNames.map(canonical);
  need(new Set(names).size === names.length, 'pose target has duplicate joint names');
  const indexOf = name => { const index = names.indexOf(name); need(index >= 0, `pose target is missing ${name}`); return index; };
  const rest = name => {
    const index = indexOf(name), value = Array.isArray(restWorldMatrices) ? restWorldMatrices[index] : restWorldMatrices?.[name];
    return elements(value, `pose target rest ${name}`);
  };
  const parentIndex = indexOf('hips');
  // Check the parent's rest matrix too; the immutable bases must never be
  // derived from the skeleton's current, already animated matrixWorld values.
  inverseDirection(rest('hips'), [1, 0, 0]);
  const sides = ['l', 'r'].map(side => {
    const thigh = rest(`thigh_${side}`), shin = rest(`shin_${side}`), foot = rest(`foot_${side}`);
    const down = normalized([shin[12] - thigh[12], shin[13] - thigh[13], shin[14] - thigh[14]], 'pose target rest thigh');
    const footForward = [foot[4], foot[5], foot[6]], projection = dot(footForward, down);
    const forward = normalized(footForward.map((value, k) => value - projection * down[k]), 'pose target rest foot');
    return Object.freeze({ thighIndex: indexOf(`thigh_${side}`), down, forward });
  });
  const prepared = Object.freeze({ version: 1, kind: 'seated', delta, parentIndex, sides: Object.freeze(sides),
    activation: Object.freeze({ parentJoint: 'hips', thighJoints: Object.freeze(['thigh_l', 'thigh_r']),
      startRadians: activation.startRadians, fullRadians: activation.fullRadians }) });
  preparedTargets.add(prepared);
  return prepared;
}

/** Bilateral thigh flexion, independent of clip names and scene transforms.
 * Effective matrices are the same bone-world × inverse-bind matrices used by
 * skinning. Both legs must flex before the seated corrective becomes active. */
export function evaluatePoseTarget(prepared, effectiveSkinMatrices) {
  need(preparedTargets.has(prepared), 'pose target must be prepared from immutable rest matrices');
  const parent = elements(effectiveSkinMatrices?.[prepared.parentIndex], 'pose target parent');
  const { startRadians, fullRadians } = prepared.activation;
  let weight = 1;
  for (const side of prepared.sides) {
    const thigh = elements(effectiveSkinMatrices?.[side.thighIndex], 'pose target thigh');
    const relative = normalized(inverseDirection(parent, direction(thigh, side.down)), 'pose target posed thigh');
    const angle = Math.atan2(dot(relative, side.forward), dot(relative, side.down));
    const t = Math.max(0, Math.min(1, (angle - startRadians) / (fullRadians - startRadians)));
    weight *= t * t * (3 - 2 * t);
  }
  return weight;
}
