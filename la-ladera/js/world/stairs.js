// Stairways: block steps (tread tops at the mid height of the physics ramp), landings, hand rails. Group world.stairs.
// The physics surface of a stair is the smooth ramp stamped in plan.heightAt; the steps are +-half a riser around it.
import { pointInPoly } from './geom.js';
import { beam } from './mk.js';

const RAILS = ['iron_green', 'iron_blue', 'iron_black'];

export function buildStairs(ctx, plan) {
  const b = ctx.batch.builder('world.stairs');
  let idx = 0;
  for (const st of plan.streets) {
    if (st.kind !== 'stair') continue;
    stair(b, plan, st, RAILS[idx++ % RAILS.length]);
  }
  ctx.batch.flush('world.stairs');
}

function stair(b, plan, st, railMat) {
  const p0 = st._d.pts[0], p1 = st._d.pts[st._d.pts.length - 1], L = st.len;
  const tx = (p1[0] - p0[0]) / L, tz = (p1[1] - p0[1]) / L, nx = -tz, nz = tx, w = st.width, ry = Math.atan2(tx, tz);
  const W = (s, off = 0) => [p0[0] + tx * s + nx * off, p0[1] + tz * s + nz * off];
  const kn = st.knots, yRamp = (s) => {
    let i = 1; while (i < kn.length - 1 && kn[i][0] < s) i++;
    const a = kn[i - 1], c = kn[i], u = Math.min(1, Math.max(0, (s - a[0]) / ((c[0] - a[0]) || 1)));
    return a[1] + (c[1] - a[1]) * u;
  };
  // steps
  for (const [s0, s1, ya, yb, n] of st.flights) {
    const tread = (s1 - s0) / n, r = Math.abs(yb - ya) / n;
    for (let k = 0; k < n; k++) {
      const sc = s0 + (k + 0.5) * tread, top = ya + ((yb - ya) * (k + 0.5)) / n, bot = top - r - 0.26, [cx, cz] = W(sc);
      b.box({ py: 'stair_tread', all: 'concrete_bare' }, cx, (top + bot) / 2, cz, w, top - bot, tread, { ry, skip: ['ny'] });
    }
  }
  // landings (flat parts, including the approach aprons at both ends)
  for (const [s0, s1] of st.landings) {
    const y = yRamp((s0 + s1) / 2) + 0.012, a = W(s0, -w / 2), c = W(s0, w / 2), e = W(s1, w / 2), f = W(s1, -w / 2);
    b.quad('street_concrete', [a[0], y, a[1]], [c[0], y, c[1]], [e[0], y, e[1]], [f[0], y, f[1]], { uv: [0, s0, w, s0, w, s1, 0, s1] });
  }
  // rails: posts every <= 1.6 m on both sides (and a centre rail on wide stairs)
  const offs = [-(w / 2 - 0.07), w / 2 - 0.07]; if (w >= 3.2) offs.push(0);
  const stations = [];
  for (let i = 0; i + 1 < kn.length; i++) {
    const a = kn[i][0], c = kn[i + 1][0], m = Math.max(1, Math.ceil((c - a) / 1.6));
    for (let q = 0; q < m; q++) stations.push(a + ((c - a) * q) / m);
  }
  stations.push(kn[kn.length - 1][0]);
  const inPlaza = (x, z) => plan.plazas.some((pl) => pointInPoly(pl.poly, x, z));
  for (const off of offs) {
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i], [x, z] = W(s, off), y = yRamp(s);
      if (inPlaza(x, z)) continue;
      beam(b, railMat, [x, y - 0.1, z], [x, y + 0.95, z], 0.05, 0.05);
      if (i + 1 < stations.length) {
        const s2 = stations[i + 1], [x2, z2] = W(s2, off);
        if (inPlaza(x2, z2)) continue;
        beam(b, railMat, [x, y + 0.95, z], [x2, yRamp(s2) + 0.95, z2], 0.05, 0.05);
        beam(b, railMat, [x, y + 0.5, z], [x2, yRamp(s2) + 0.5, z2], 0.03, 0.03);
      }
    }
  }
}
