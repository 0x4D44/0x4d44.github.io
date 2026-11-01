/**
 * Catenary spans for the uninstalled substation library. Metres; +Y is up.
 * `sag` is the vertical distance below the endpoint chord at half horizontal
 * span, including unequal-height endpoints. There are no long conductor meshes:
 * the optional renderer instances one short unit cylinder along the samples.
 * This is visual geometry, not a conductor tension or clearance calculation.
 */

const finite3 = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const positive = (n, label) => {
  if (!Number.isFinite(n) || n <= 0) throw new RangeError(`${label} must be finite and positive`);
};
const presets = {
  uk: {
    hv: { voltageKV: 132, spanM: 90, sagM: 3.6, phaseSpacingM: 4.8, circuits: 2, conductorRadiusM: 0.018 },
    mv: { voltageKV: 33, spanM: 48, sagM: 1.4, phaseSpacingM: 2, circuits: 1, conductorRadiusM: 0.012 },
    lv: { voltageKV: 11, spanM: 36, sagM: 0.75, phaseSpacingM: 0.96, circuits: 1, conductorRadiusM: 0.009 },
  },
  co: {
    hv: { voltageKV: 115, spanM: 80, sagM: 3.2, phaseSpacingM: 4.4, circuits: 2, conductorRadiusM: 0.018 },
    mv: { voltageKV: 34.5, spanM: 44, sagM: 1.35, phaseSpacingM: 2, circuits: 1, conductorRadiusM: 0.012 },
    lv: { voltageKV: 13.2, spanM: 34, sagM: 0.7, phaseSpacingM: 0.96, circuits: 1, conductorRadiusM: 0.009 },
  },
};
for (const variant of Object.values(presets)) {
  for (const profile of Object.values(variant)) Object.freeze(profile);
  Object.freeze(variant);
}
export const SPAN_PRESETS = Object.freeze(presets);

/** Solve y(s)=a*cosh((s-b)/a)+c; s is horizontal distance from start. */
export function solveCatenary(start, end, { sag = 1 } = {}) {
  if (!finite3(start) || !finite3(end)) throw new TypeError('start and end must be finite 3D points');
  start = [...start]; end = [...end];
  positive(sag, 'sag');
  const dx = end[0] - start[0], dz = end[2] - start[2];
  const horizontal = Math.hypot(dx, dz), rise = end[1] - start[1];
  if (horizontal < 1e-5) throw new RangeError('horizontal span must be at least 0.00001 metres');
  if (sag < horizontal * 1e-9 || sag > horizontal * 20) throw new RangeError('sag/span ratio must be in [1e-9,20]');
  // u=L/(2a), v=asinh(rise/(2a*sinh(u))). The midpoint sag is
  // a*cosh(v)*(cosh(u)-1). sinh(u/2)^2 avoids cancellation for taut spans.
  function sagFor(u) {
    const a = horizontal / (2 * u);
    const v = Math.asinh(rise / (2 * a * Math.sinh(u)));
    return 2 * a * Math.cosh(v) * Math.sinh(u / 2) ** 2;
  }
  let lo = 1e-12, hi = 1;
  while (sagFor(hi) < sag && hi < 64) hi *= 2;
  if (sagFor(hi) < sag) throw new RangeError('catenary parameters exceed numerical range');
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (sagFor(mid) < sag) lo = mid; else hi = mid;
  }
  const u = (lo + hi) / 2, a = horizontal / (2 * u);
  const v = Math.asinh(rise / (2 * a * Math.sinh(u)));
  const b = horizontal / 2 - a * v;
  const arcStart = Math.sinh(-b / a);
  const arcLength = 2 * a * Math.cosh(v) * Math.sinh(u);
  if (![a, b, arcLength].every(Number.isFinite)) throw new RangeError('non-finite catenary solution');
  const point = (t) => {
    if (!Number.isFinite(t) || t < 0 || t > 1) throw new RangeError('fraction must lie in [0,1]');
    if (t === 0) return [...start];
    if (t === 1) return [...end];
    const s = horizontal * t;
    // Difference-of-cosh identity avoids subtracting two large near-equal values.
    const y = start[1] + 2 * a * Math.sinh(s / (2 * a)) * Math.sinh((s - 2 * b) / (2 * a));
    return [start[0] + dx * t, y, start[2] + dz * t];
  };
  const atArcFraction = (fraction) => {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new RangeError('arc fraction must lie in [0,1]');
    if (fraction === 0 || fraction === 1) return point(fraction);
    const s = b + a * Math.asinh(arcStart + fraction * arcLength / a);
    return point(Math.max(0, Math.min(1, s / horizontal)));
  };
  return Object.freeze({ a, b, horizontal, rise, sag, arcLength, point, atArcFraction });
}

/** Equal-arc-length samples bound every cylinder by maxSegmentLength. */
export function catenarySegments(start, end, { sag = 1, maxSegmentLength = 0.6, maxSegments = 8192 } = {}) {
  positive(maxSegmentLength, 'maxSegmentLength');
  if (!Number.isInteger(maxSegments) || maxSegments < 1 || maxSegments > 65536) throw new RangeError('maxSegments must be an integer in [1,65536]');
  const curve = solveCatenary(start, end, { sag });
  const count = Math.ceil(curve.arcLength / maxSegmentLength);
  if (count > maxSegments) throw new RangeError(`span needs ${count} instances, exceeding maxSegments ${maxSegments}`);
  const segments = [];
  let p = curve.atArcFraction(0);
  for (let i = 1; i <= count; i++) {
    const q = curve.atArcFraction(i / count), delta = q.map((v, j) => v - p[j]);
    const length = Math.hypot(...delta), direction = delta.map((v) => v / length);
    segments.push({ start: p, end: q, midpoint: p.map((v, j) => (v + q[j]) / 2), direction, length });
    p = q;
  }
  return { segments, arcLength: curve.arcLength, horizontal: curve.horizontal, sag: curve.sag };
}

/**
 * Optional Three.js r180 adapter. Caller supplies THREE and one shared material.
 * Geometry is a unit-height +Y cylinder; each segment is only a matrix instance.
 * Dispose the returned object's geometry when a span is removed; material is owned
 * by the caller. Nothing is imported, fetched or attached to the game by this file.
 */
export function createSpanInstances(THREE, start, end, {
  sag = 1, maxSegmentLength = 0.6, maxSegments = 8192, radius = 0.018, radialSegments = 5, material,
} = {}) {
  positive(radius, 'radius');
  if (!Number.isInteger(radialSegments) || radialSegments < 3 || radialSegments > 12) throw new RangeError('radialSegments must be an integer in [3,12]');
  if (!THREE?.InstancedMesh || !THREE?.CylinderGeometry || !material) throw new TypeError('THREE and a caller-owned material are required');
  const sampled = catenarySegments(start, end, { sag, maxSegmentLength, maxSegments });
  const geometry = new THREE.CylinderGeometry(1, 1, 1, radialSegments, 1, true);
  const mesh = new THREE.InstancedMesh(geometry, material, sampled.segments.length);
  const up = new THREE.Vector3(0, 1, 0), position = new THREE.Vector3(), direction = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), matrix = new THREE.Matrix4();
  for (const [index, segment] of sampled.segments.entries()) {
    position.fromArray(segment.midpoint); direction.fromArray(segment.direction);
    rotation.setFromUnitVectors(up, direction); scale.set(radius, segment.length, radius);
    mesh.setMatrixAt(index, matrix.compose(position, rotation, scale));
  }
  mesh.name = 'substation-catenary-span';
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  mesh.userData.substation = { sag, arcLength: sampled.arcLength, segmentCount: sampled.segments.length, maxSegmentLength };
  return mesh;
}
