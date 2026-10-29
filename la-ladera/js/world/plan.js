// STUB - owner: ENVIRONMENT agent (A5). Replace entirely; keep the export and the Plan shape in dev/CONTRACT.md.
// generatePlan must be PURE DATA (no meshes, no DOM) so it can run under node for tests.
export function generatePlan(ctx) {
  const mk = (i, kind, x, z, rotY, w, d, floors, extra = {}) => ({
    id: 'L' + String(i).padStart(2, '0'), name: `Lote ${i}`, kind, x, y: 0, z, rotY, w, d, floors, fh: 2.8,
    street: 'S0', entrance: { side: 'front', u: 0 }, party: { left: false, right: false }, style: {}, seed: 1000 + i, ...extra,
  });
  return {
    seed: ctx.seed, bounds: { min: -100, max: 100 },
    heightAt: () => 0,
    lots: [
      mk(0, 'house', -22, 8, 0, 8, 10, 2),
      mk(1, 'apartments', -6, 8, 0, 12, 12, 4),
      mk(2, 'shop-house', 10, 8, 0, 7, 12, 3),
      mk(3, 'courtyard-house', 28, 8, 0, 14, 14, 2),
    ],
    streets: [{ id: 'S0', kind: 'road', width: 6, pts: [[-60, 22], [60, 22]] }],
    stairs: [], plazas: [], spaces: [], nav: { nodes: [], edges: [] }, pois: [], landmarks: [],
    spawn: { x: 0, z: 32, yaw: 0 },
  };
}
