// Wheel parts, built with the wheel axis along +X and the outer face toward +X.
import { Geo } from "./geo.mjs";

/** Tyre with sidewall bulge, shoulder and a lugged tread (grid mesh with analytic smooth normals). */
export function buildTyre(THREE, R, Rr, tw, J = 96) {
  const prof = [
    [-0.46, 0], [-0.5, 0.25], [-0.525, 0.55], [-0.49, 0.8], [-0.44, 0.93], [-0.36, 1], [-0.12, 1], [0.12, 1], [0.36, 1], [0.44, 0.93], [0.49, 0.8], [0.525, 0.55], [0.5, 0.25], [0.46, 0],
  ];
  const nP = prof.length;
  const dr = R - Rr;
  const P = [], P0 = [];
  for (let j = 0; j < J; j++) {
    const a = (j / J) * Math.PI * 2;
    const row = [], row0 = [];
    for (let p = 0; p < nP; p++) {
      let r = Rr + 0.004 + (prof[p][1] === 1 ? dr - 0.004 : prof[p][1] * dr);
      const r0 = r;
      if (prof[p][1] >= 0.93 || p === 3 || p === 10) {
        // lug pattern: shoulder blocks every 4th segment, centre blocks offset by half
        const sh = (p === 4 || p === 5 || p === 8 || p === 9 || p === 3 || p === 10);
        const m = sh ? (j % 6 < 3 ? 0 : 1) : ((j + 3) % 6 < 3 ? 0 : 1);
        const groove = (p === 6 || p === 7) ? (Math.abs(((j % 12) - 5.5)) < 0.6 ? 1 : 0) * 0.5 : 0;
        r -= 0.008 * m * (sh ? 1 : 0.8) + 0.004 * groove;
      }
      const x = prof[p][0] * tw;
      row.push([x, Math.cos(a) * r, Math.sin(a) * r, a, r]);
      row0.push([x, Math.cos(a) * r0, Math.sin(a) * r0, a, r0]);
    }
    P.push(row); P0.push(row0);
  }
  const g = new Geo(THREE);
  const rc = (R + Rr) / 2;
  const nrm = (j, p) => {
    const pj = P0[(j + 1) % J][p], mj = P0[(j + J - 1) % J][p];
    const pp = P0[j][Math.min(nP - 1, p + 1)], mp = P0[j][Math.max(0, p - 1)];
    const t1 = [pj[0] - mj[0], pj[1] - mj[1], pj[2] - mj[2]], t2 = [pp[0] - mp[0], pp[1] - mp[1], pp[2] - mp[2]];
    let nx = t1[1] * t2[2] - t1[2] * t2[1], ny = t1[2] * t2[0] - t1[0] * t2[2], nz = t1[0] * t2[1] - t1[1] * t2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const c = P[j][p];
    const ox = c[0], oy = c[1] - Math.cos(c[3]) * rc, oz = c[2] - Math.sin(c[3]) * rc;
    if (nx * ox + ny * oy + nz * oz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    return [nx, ny, nz];
  };
  const N = P.map((row, j) => row.map((_, p) => nrm(j, p)));
  const col = (p, j) => {
    // sidewall lettering ring: a lighter band on the outer sidewall for a few segments
    const side = p >= 10 && p <= 12;
    const v = side && j % 24 < 8 ? 0.085 : 0.04;
    return [v, v, v * 1.02];
  };
  for (let j = 0; j < J; j++) {
    const j2 = (j + 1) % J;
    for (let p = 0; p < nP - 1; p++) {
      const A = P[j][p], B = P[j2][p], C = P[j2][p + 1], D = P[j][p + 1];
      const nA = N[j][p], nB = N[j2][p], nC = N[j2][p + 1], nD = N[j][p + 1];
      const c = col(p, j);
      for (const [q, n] of [[A, nA], [B, nB], [C, nC], [A, nA], [C, nC], [D, nD]]) g.vert(q[0], q[1], q[2], n[0], n[1], n[2], 0, 0, c[0], c[1], c[2]);
    }
  }
  return g.build();
}

/** Rim + hub + brake disc, vertex-coloured. `style` "spoke" | "mesh". */
export function buildRim(THREE, R, Rr, tw, color, spokes, style) {
  const g = new Geo(THREE);
  const rotZ = -Math.PI / 2; // lathe axis Y -> X
  const lathePts = [[Rr - 0.03, 0.47], [Rr + 0.013, 0.485], [Rr + 0.013, 0.43], [Rr, 0.4], [Rr - 0.012, -0.2], [Rr, -0.4], [Rr + 0.01, -0.45], [Rr - 0.012, -0.47]]
    .map((p) => new THREE.Vector2(p[0], p[1] * tw));
  g.add(new THREE.LatheGeometry(lathePts, 28), g.mat(0, 0, 0, 0, 0, rotZ), color);
  // dished back so the wheel is never see-through
  g.add(new THREE.CylinderGeometry(Rr - 0.02, Rr - 0.02, 0.01, 24), g.mat(0.18 * tw, 0, 0, 0, 0, rotZ), 0x16171a);
  // brake disc and hat
  g.add(new THREE.CylinderGeometry(Rr * 0.84, Rr * 0.84, 0.026, 28), g.mat(0.02 * tw, 0, 0, 0, 0, rotZ), 0x6a6d73);
  g.add(new THREE.CylinderGeometry(Rr * 0.84 - 0.012, Rr * 0.84 - 0.012, 0.028, 28), g.mat(0.02 * tw, 0, 0, 0, 0, rotZ), 0x2e3034);
  g.add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 18), g.mat(0.2 * tw, 0, 0, 0, 0, rotZ), 0x3b3d42);
  // spokes (long axis along +Y, rotated about X by the spoke angle)
  const sx = 0.34 * tw;
  const n = spokes;
  const len = Rr - 0.035;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (style === 'mesh') {
      for (const off of [-0.07, 0.07]) {
        const sp = new THREE.BoxGeometry(0.022, len, 0.024);
        sp.translate(0, 0.04 + len / 2, 0);
        g.add(sp, g.mat(sx, 0, 0, a + off, 0, 0), color);
      }
    } else {
      const inner = new THREE.BoxGeometry(0.028, len * 0.5, 0.032);
      inner.translate(0, 0.045 + len * 0.25, 0);
      const outer = new THREE.BoxGeometry(0.032, len * 0.55, 0.066);
      outer.translate(0, 0.045 + len * 0.5 + len * 0.275 - 0.02, 0);
      const m = g.mat(sx, 0, 0, a, 0, 0);
      g.add(inner, m, color); g.add(outer, m, color);
    }
  }
  // hub cap and lug nuts
  g.add(new THREE.CylinderGeometry(0.052, 0.058, 0.03, 16), g.mat(0.38 * tw, 0, 0, 0, 0, rotZ), 0xb9bcc2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    g.add(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 6), g.mat(0.4 * tw, Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0, 0, rotZ), 0xcfd2d8);
  }
  return g.build();
}

/** Brake caliper (static relative to the steered hub). */
export function buildCaliper(THREE, Rr, tw, color = 0xc01d18) {
  const g = new Geo(THREE);
  const a = 0.95; // up and slightly rearward
  const body = new THREE.BoxGeometry(0.07, 0.11, 0.2);
  body.translate(0, Rr * 0.8, 0);
  g.add(body, g.mat(0.03 * tw, 0, 0, a, 0, 0), color);
  const line = new THREE.BoxGeometry(0.02, 0.05, 0.05);
  line.translate(0, Rr * 0.66, 0);
  g.add(line, g.mat(0.03 * tw, 0, 0, a, 0, 0), 0x8f1410);
  return g.build();
}
