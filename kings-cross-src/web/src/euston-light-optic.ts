import type { MidlandPlan } from '../../core/landmarks.ts';

// Angular lobes from the Euston Road pilot. The field supplies its own
// range, receiver plane and calibrated source data around these terms.
export const EUSTON_FACADE_LOBE = `    optic = 1.18 * smoothstep(0.0, 0.14, ray.y / d)
      * (1.0 - smoothstep(0.25, 0.57, ray.y / d))
      * smoothstep(0.1, 0.58, dot(n.xz, wall.xy));`;

export const EUSTON_ROAD_LOBES = `    float forward = smoothstep(-0.86, -0.30, angle) * (1.0 - smoothstep(0.65, 1.43, angle))
      * (1.0 - smoothstep(0.90, 2.40, along)) / (1.0 + 1.5 * (angle - 0.38) * (angle - 0.38));
    // A weaker lobe behind the head reaches the pavement and open square.
    float back = 0.36 * smoothstep(-2.45, -1.50, angle) * (1.0 - smoothstep(-1.05, -0.28, angle))
      * (1.0 - smoothstep(0.95, 2.30, along));
    optic = max(forward, back);`;

// The front runs east to west. Each face uses the tangent at its own chainage.
export function eustonFrontPlanes(plan: MidlandPlan | null) {
  return (plan?.front.edges ?? [])
    .toSorted((a, b) => Math.min(b.a[0], b.b[0]) - Math.min(a.a[0], a.b[0]))
    .map(({ a, b, normal: [x, z] }) => [Math.min(a[0], b[0]), x, z, x * a[0] + z * a[1]] as const);
}
