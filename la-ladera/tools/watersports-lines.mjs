/**
 * A small, dependency-free catenary recipe for the unplaced watersports library.
 * Coordinates are metres, +Y up. `slack` is extra line length / endpoint distance:
 * 0.002 gives a nearly taut kite line; 0.06 gives a visibly hanging mooring rope.
 * No long line mesh is stored in a GLB. Call once per moving endpoint pair, put
 * the segments in a shared THREE.LineSegments buffer, and reuse that buffer.
 * This module is deliberately outside js/ and is not loaded by the game.
 */

function parameters(start, end, options) {
  for (const [name, p] of [['start', start], ['end', end]]) {
    if (!(Array.isArray(p) || ArrayBuffer.isView(p)) || p.length !== 3 || !Array.from(p).every((v) => Number.isFinite(v) && Math.abs(v) <= 1_000_000)) {
      throw new TypeError(`${name} must contain three finite metre coordinates within +/-1000000`);
    }
  }
  const segments = options.segments ?? 12;
  const slack = options.slack ?? 0.002;
  if (!Number.isInteger(segments) || segments < 1 || segments > 256) throw new RangeError('segments must be an integer in 1..256');
  if (!Number.isFinite(slack) || slack < 0 || slack > 2) throw new RangeError('slack must be finite in 0..2');
  return { segments, slack };
}

/** Return (segments + 1) xyz points in a Float32Array, including both endpoints. */
export function sampleCatenary(start, end, options = {}) {
  const { segments, slack } = parameters(start, end, options);
  // Work in JS numbers even when callers pass an integer typed array; mapping
  // that array directly would truncate or wrap negative endpoint differences.
  const [dx, dy, dz] = [0, 1, 2].map((i) => end[i] - start[i]);
  const horizontal = Math.hypot(dx, dz), distance = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(distance) || distance > 100_000) throw new RangeError('line span must be at most 100000 metres');
  const points = new Float32Array((segments + 1) * 3);
  const length = distance * (1 + slack);
  let yAt;
  if (distance < 1e-9 || slack < 1e-10) {
    yAt = (t) => start[1] + t * dy;
  } else if (horizontal < 1e-7 * Math.max(1, distance)) {
    // Vertical limiting catenary: a hanging line folds at its lowest point.
    // There is no arbitrary sideways bulge or undefined horizontal direction.
    const bottom = (start[1] + end[1] - length) / 2;
    const down = start[1] - bottom;
    yAt = (t) => t * length <= down ? start[1] - t * length : bottom + t * length - down;
  } else {
    // Solve sinh(u)/u = sqrt(L² - dy²) / horizontal, u = horizontal/(2a).
    const ratio = Math.sqrt(Math.max(0, length * length - dy * dy)) / horizontal;
    let low = 0, high = 1;
    while (Math.sinh(high) / high < ratio && high < 64) high *= 2;
    for (let i = 0; i < 64; i++) {
      const mid = (low + high) / 2;
      if (Math.sinh(mid) / mid < ratio) low = mid; else high = mid;
    }
    const u = (low + high) / 2, a = horizontal / (2 * u);
    const offset = Math.asinh(dy / (2 * a * Math.sinh(u)));
    const left = -u + offset;
    // cosh(A) - cosh(B) expressed as a product avoids cancellation near taut.
    yAt = (t) => start[1] + 2 * a * Math.sinh(u * t) * Math.sinh(left + u * t);
  }
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.set([start[0] + t * dx, yAt(t), start[2] + t * dz], i * 3);
  }
  // Avoid endpoint rounding accumulating through the hyperbolic evaluation.
  points.set(start, 0); points.set(end, segments * 3);
  return points;
}

/** Return six floats per independent line segment. An optional buffer is reused. */
export function catenarySegments(start, end, options = {}, target = undefined) {
  const points = sampleCatenary(start, end, options);
  const count = points.length / 3 - 1;
  if (target !== undefined && (!(target instanceof Float32Array) || target.length !== count * 6)) {
    throw new RangeError('target must be a Float32Array with segments * 6 values');
  }
  const result = target ?? new Float32Array(count * 6);
  for (let i = 0; i < count; i++) result.set(points.subarray(i * 3, i * 3 + 6), i * 6);
  return result;
}

/** Optional Three.js adapter; the caller supplies its existing THREE namespace. */
export function makeCatenaryLineSegments(THREE, start, end, options = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(catenarySegments(start, end, options), 3));
  const material = options.material ?? new THREE.LineBasicMaterial({ color: 0xdac8a4 });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'watersports-catenary';
  lines.userData.updateEndpoints = (nextStart, nextEnd) => {
    const attribute = geometry.getAttribute('position');
    catenarySegments(nextStart, nextEnd, options, attribute.array);
    attribute.needsUpdate = true;
    geometry.computeBoundingSphere();
  };
  geometry.computeBoundingSphere();
  return lines;
}
