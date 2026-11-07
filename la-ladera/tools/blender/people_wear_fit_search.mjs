// Authoring-only alternative directions for a bounded rest fit. The runtime
// correction algorithm and the independent clearance predicates stay intact.
import { inverseVector, transform, rayUnionExit } from './people_wear_math.mjs';

const need = (ok, message) => { if (!ok) throw new Error(message); };
const finiteVector = (value, length) => value?.length === length && Array.from(value).every(Number.isFinite);
const DIRECTIONS = Object.freeze(Array.from({ length: 1024 }, (_, i) => {
  const y = 1 - 2 * (i + .5) / 1024, radius = Math.sqrt(1 - y * y);
  const angle = i * Math.PI * (3 - Math.sqrt(5));
  return Object.freeze([radius * Math.cos(angle), y, radius * Math.sin(angle)]);
}));

/** Search from the immutable generated bind position, never a reset origin.
 * Returns a Float32 candidate only if its cumulative displacement and actual
 * re-skinned union membership pass. A missing candidate remains a hard failure
 * in the caller. Denser directions improve search, not the clearance tolerance.
 */
export function boundedAuthorExit(surfaces, original, current, matrix, { padding = .0015, maxMove = .08 } = {}) {
  need(Array.isArray(surfaces) && surfaces.length > 0 && surfaces.every(s => typeof s?.insideXYZ === 'function'), 'bounded author exit requires closed surfaces');
  need(finiteVector(original, 3) && finiteVector(current, 3) && finiteVector(matrix, 16), 'bounded author exit requires finite bind positions and matrix');
  need(Number.isFinite(padding) && padding > 0 && Number.isFinite(maxMove) && maxMove > 0 && maxMove <= .18 && padding < maxMove, 'invalid bounded author exit limits');
  inverseVector(matrix, [0, 0, 0]); // Reject singular skinning before any shortcut.
  const origin = transform(matrix, original), contains = p => surfaces.some(s => s.insideXYZ(...p));
  const evaluate = target => {
    target = target.map(Math.fround);
    const displacement = Math.hypot(...target.map((value, k) => value - original[k]));
    const posed = transform(matrix, target);
    if (!target.every(Number.isFinite) || displacement > maxMove || contains(posed)) return null;
    return { target, point: posed, displacement, deltaBind: target.map((value, k) => value - current[k]) };
  };
  if (!contains(origin)) return evaluate(Array.from(original));
  // sqrt(||A||_1 ||A||_inf) bounds the linear skin map's spectral norm. The
  // ray radius can contain the bind ball, but cannot authorize a larger result.
  const column = Math.max(...[0, 1, 2].map(c => [0, 1, 2].reduce((sum, r) => sum + Math.abs(matrix[c * 4 + r]), 0)));
  const row = Math.max(...[0, 1, 2].map(r => [0, 1, 2].reduce((sum, c) => sum + Math.abs(matrix[c * 4 + r]), 0)));
  const radius = Math.sqrt(column * row) * maxMove;
  let best = null;
  for (const direction of DIRECTIONS) {
    const exit = rayUnionExit(surfaces, origin, direction, { padding, maxDistance: radius });
    if (!exit) continue;
    const delta = inverseVector(matrix, exit.point.map((value, k) => value - origin[k]));
    const candidate = evaluate(original.map((value, k) => value + delta[k]));
    if (candidate && (!best || candidate.displacement < best.displacement)) best = candidate;
  }
  return best;
}
