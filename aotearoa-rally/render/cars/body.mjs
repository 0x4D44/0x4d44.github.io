// Lofted body shell, greenhouse, wheel arches and exterior details. Builds THREE.BufferGeometry parts.
import { Geo } from "./geo.mjs";
import { liveryUV } from "./livery.mjs";
import { inArch } from "./profiles.mjs";
import { clamp, smoothstep } from "../../core/mathx.mjs";

const K = 44; // ring resolution
const sgnPow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

function nose(t, tn = 0.028) {
  const e = Math.min(t, 1 - t);
  if (e >= tn) return 1;
  const x = 1 - e / tn;
  return Math.pow(Math.max(0, 1 - x * x * x), 1 / 3);
}

/** Ring (array of [x,y]) for the lower body at station t. */
export function tubRing(d, t) {
  const sc = nose(t);
  const hw = d.hw * d.widC(t) * sc;
  const yTopC = d.topC(t);
  const lift = 0.15 * Math.pow(1 - clamp(t / 0.1, 0, 1), 2) + 0.15 * Math.pow(1 - clamp((1 - t) / 0.1, 0, 1), 2);
  const yb = d.sill + lift;
  const yt = yb + (yTopC - yb) * Math.pow(sc, 0.6);
  const yc = (yb + yt) / 2, hh = (yt - yb) / 2;
  const nT = d.S.nTop, nB = 5.5;
  const ring = [];
  for (let k = 0; k < K; k++) {
    const phi = -Math.PI / 2 + (2 * Math.PI * k) / K;
    const c = Math.cos(phi), s = Math.sin(phi);
    const n = s > 0 ? nT : nB;
    let x = hw * sgnPow(c, 2 / n);
    const y = yc + hh * sgnPow(s, 2 / n);
    const frac = (y - yb) / Math.max(1e-4, yt - yb);
    x *= 1 - 0.09 * (1 - frac) * (1 - frac);
    ring.push([x, y]);
  }
  return { ring, yb, yt, hw };
}

function roofY(d, t) {
  const c = d.cabin;
  const base = d.topC(t) - 0.06;
  if (t <= c.t0 || t >= c.t1) return base + 0.01;
  let f;
  if (t < c.rs) f = Math.pow((t - c.t0) / (c.rs - c.t0), 0.9);
  else if (t > c.re) f = Math.pow(1 - (t - c.re) / (c.t1 - c.re), d.S.kind === "hatch" ? 0.7 : 0.9);
  else f = 1;
  // slightly crowned roof
  return base + 0.01 + (d.roof - base - 0.01) * f;
}

export function cabinRing(d, t) {
  const base = d.topC(t) - 0.06;
  const yTop = roofY(d, t);
  const wb = d.hw * d.widC(t) * d.cabin.w;
  const yc = (base + yTop) / 2, hh = Math.max(0.005, (yTop - base) / 2);
  const ring = [];
  for (let k = 0; k < K; k++) {
    const phi = -Math.PI / 2 + (2 * Math.PI * k) / K;
    const c = Math.cos(phi), s = Math.sin(phi);
    const n = 3.8;
    const y = yc + hh * sgnPow(s, 2 / n);
    const frac = (y - base) / Math.max(1e-4, yTop - base);
    const tum = d.cabin.tum * smoothstep(0.1, 1, frac);
    ring.push([wb * sgnPow(c, 2 / n) * (1 - tum), y]);
  }
  return { ring, base, yTop, wb };
}

/** Build stations -> grid of positions + smooth normals. */
function makeGrid(d, ringFn, t0, t1, nS, denseEnds) {
  const P = [], N = [], Ts = [];
  for (let i = 0; i < nS; i++) {
    let u = i / (nS - 1);
    if (denseEnds) u = u + (0.5 - 0.5 * Math.cos(Math.PI * u) - u) * 0.3;
    const t = t0 + (t1 - t0) * u;
    const r = ringFn(d, t);
    const z = d.zAt(t);
    P.push(r.ring.map((q) => [q[0], q[1], z]));
    Ts.push({ t, z, info: r });
  }
  for (let i = 0; i < nS; i++) {
    const row = [];
    for (let k = 0; k < K; k++) {
      const a = P[Math.max(0, i - 1)][k], b = P[Math.min(nS - 1, i + 1)][k];
      const c = P[i][(k + 1) % K], e = P[i][(k + K - 1) % K];
      const ds = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dk = [c[0] - e[0], c[1] - e[1], c[2] - e[2]];
      // outward = dk x ds
      let nx = dk[1] * ds[2] - dk[2] * ds[1], ny = dk[2] * ds[0] - dk[0] * ds[2], nz = dk[0] * ds[1] - dk[1] * ds[0];
      let l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) { // degenerate (nose point): use radial direction
        const p = P[i][k]; nx = p[0]; ny = p[1] - Ts[i].info.ring[0][1]; nz = (i === 0 ? -1 : 1) * 0.5; l = Math.hypot(nx, ny, nz) || 1;
      }
      row.push([nx / l, ny / l, nz / l]);
    }
    N.push(row);
  }
  return { P, N, Ts };
}

export function buildBody(THREE, spec, d) {
  const mk = () => new Geo(THREE);
  const B = { body: mk(), bonnet: mk(), bumperF: mk(), bumperR: mk(), glass: mk(), trim: mk(), head: mk(), tail: mk(), rev: mk(), caliperless: null };
  const paintBuckets = new Set(["body", "bonnet", "bumperF", "bumperR"]);
  const [bfT, brT] = d.S.bumper;
  const [bnT0, bnT1] = d.S.bonnetT;

  function emitQuad(bucket, A, Bq, C, D, nA, nB, nC, nD, color) {
    const g = B[bucket];
    const paint = paintBuckets.has(bucket);
    const cx = (A[0] + Bq[0] + C[0] + D[0]) / 4, cy = (A[1] + Bq[1] + C[1] + D[1]) / 4, cz = (A[2] + Bq[2] + C[2] + D[2]) / 4;
    let nx = nA[0] + nB[0] + nC[0] + nD[0], ny = nA[1] + nB[1] + nC[1] + nD[1], nz = nA[2] + nB[2] + nC[2] + nD[2];
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const r = color[0], gg = color[1], b = color[2];
    const uvs = [];
    if (paint) for (const p of [A, Bq, C, D]) uvs.push(liveryUV(d, p[0], p[1], p[2], nx, ny, nz));
    const o = [[A, nA], [Bq, nB], [C, nC], [A, nA], [C, nC], [D, nD]];
    const ui = [0, 1, 2, 0, 2, 3];
    for (let j = 0; j < 6; j++) {
      const p = o[j][0], n = o[j][1];
      const uv = paint ? uvs[ui[j]] : [0.003, 0.003];
      g.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], r, gg, b);
    }
  }
  const WHITE = [1, 1, 1], DARK = [0.035, 0.035, 0.04], BLACK = [0.02, 0.02, 0.022];

  // ------------------------------------------------------------------ tub
  const tub = makeGrid(d, tubRing, 0, 1, 112, true);
  for (let i = 0; i < tub.P.length - 1; i++) {
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K;
      const A = tub.P[i][k], Bq = tub.P[i][k2], C = tub.P[i + 1][k2], D = tub.P[i + 1][k];
      const cx = (A[0] + C[0]) / 2, cy = (A[1] + C[1]) / 2, cz = (A[2] + C[2]) / 2;
      const nA = tub.N[i][k], nB = tub.N[i][k2], nC = tub.N[i + 1][k2], nD = tub.N[i + 1][k];
      const ny = (nA[1] + nC[1]) / 2;
      const t = (tub.Ts[i].t + tub.Ts[i + 1].t) / 2;
      if (inArch(d, cx, cy, cz, 0.05)) continue;
      let bucket = "body", col = WHITE;
      const info = tub.Ts[i].info;
      if (ny < -0.55) { bucket = "trim"; col = DARK; }
      else if (t < bfT && cy < info.yb + (info.yt - info.yb) * 0.62) bucket = "bumperF";
      else if (t > 1 - brT && cy < info.yb + (info.yt - info.yb) * 0.66) bucket = "bumperR";
      else if (t >= bnT0 && t <= bnT1 && ny > 0.55 && Math.abs(cx) < d.hw * d.widC(t) * 0.7) bucket = "bonnet";
      emitQuad(bucket, A, Bq, C, D, nA, nB, nC, nD, col);
    }
  }

  // ------------------------------------------------------------------ cabin
  const cab = d.cabin;
  const cg = makeGrid(d, cabinRing, cab.t0, cab.t1, 64, false);
  const bT = cab.rs + (cab.re - cab.rs) * 0.38; // B pillar position
  for (let i = 0; i < cg.P.length - 1; i++) {
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K;
      const A = cg.P[i][k], Bq = cg.P[i][k2], C = cg.P[i + 1][k2], D = cg.P[i + 1][k];
      const nA = cg.N[i][k], nB = cg.N[i][k2], nC = cg.N[i + 1][k2], nD = cg.N[i + 1][k];
      const cx = (A[0] + C[0]) / 2, cy = (A[1] + C[1]) / 2;
      const nx = (nA[0] + nC[0]) / 2, ny = (nA[1] + nC[1]) / 2;
      const t = (cg.Ts[i].t + cg.Ts[i + 1].t) / 2;
      const info = cg.Ts[i].info;
      if (ny < -0.2 || cy < info.base + 0.015) continue;
      const frac = (cy - info.base) / Math.max(0.02, info.yTop - info.base);
      let bucket = "body";
      const topW = info.wb * (1 - cab.tum);
      if (t >= cab.rs && t <= cab.re && ny > 0.8) bucket = "body";
      else if (Math.abs(nx) > 0.42) {
        const inFrame = t - cab.t0 < 0.012 || cab.t1 - t < 0.02;
        const bp = cab.bPillar && Math.abs(t - bT) < 0.016;
        if (frac > 0.26 && frac < 0.9 && !inFrame && !bp) bucket = "glass";
      } else if (ny > 0.25 && (t < cab.rs || t > cab.re)) {
        if (Math.abs(cx) < topW * 0.9 && frac > 0.04) bucket = "glass";
      }
      emitQuad(bucket, A, Bq, C, D, nA, nB, nC, nD, WHITE);
    }
  }

  // ------------------------------------------------------------------ exterior details
  buildDetails(THREE, spec, d, B, tub);
  return B;
}


/** Cambered aerofoil section as a CCW [z, y] profile: chord (m), relative thickness, camber (negative = inverted), angle (rad, trailing edge up), centre. */
export function foil(chord, thick, camber, aoa, cz, cy, n = 14) {
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos((Math.PI * i) / n)) / 2; // cosine spacing: dense at the leading edge
    const yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);
    const yc = camber * 4 * x * (1 - x);
    top.push([x, yc + yt]); bot.push([x, yc - yt]);
  }
  const pts = [...bot, ...top.reverse().slice(0, -1)];
  const ca = Math.cos(aoa), sa = Math.sin(aoa);
  return pts.map(([x, y]) => { const px = (x - 0.4) * chord, py = y * chord; return [cz + px * ca - py * sa, cy + px * sa + py * ca]; });
}
/** Rear-wing end plate outline (CCW [z, y]); `k` scales it down for smaller wings. */
export function plateProfile(cz, cy, k = 1) {
  return [[-0.27, -0.06], [0.1, -0.11], [0.32, -0.12], [0.36, 0.17], [0.1, 0.2], [-0.12, 0.13], [-0.25, 0.04]].map(([z, y]) => [cz + z * k, cy + y * k]);
}
/** A thin dark band along the end plate's top edge. */
export function plateEdge(cz, cy, k = 1) {
  return [[-0.12, 0.125], [0.1, 0.195], [0.36, 0.165], [0.36, 0.17], [0.1, 0.2], [-0.12, 0.13]].map(([z, y]) => [cz + z * k, cy + y * k]);
}

/** Surface half-width of the tub at station t and height y (scans the ring). */
export function sideX(d, t, y) {
  const { ring } = tubRing(d, t);
  let best = d.hw;
  for (let k = 0; k < K / 2; k++) {
    const a = ring[k], b = ring[k + 1];
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) { best = a[0] + (b[0] - a[0]) * ((y - a[1]) / (b[1] - a[1])); break; }
  }
  return best;
}

function buildDetails(THREE, spec, d, B, tub) {
  const { trim, body, head, tail, rev, glass } = B;
  const hw = d.hw, S = d.S;
  const zF = d.zF, zR = d.zR;
  const BLK = 0x0b0b0d, GREY = 0x2a2c30, RED = 0xb02020, SIL = 0x9a9ea6;

  // ---- wheel arch flares and liners
  for (let i = 0; i < 4; i++) {
    const w = d.wheels[i], sd = Math.sign(w.x);
    const t = d.tAt(w.z);
    const rr = w.r + 0.062;
    const pts = [];
    const steps = 28;
    for (let j = 0; j <= steps; j++) {
      const a = (-0.35 + (Math.PI + 0.7) * (j / steps));
      // angle from rear (-) over the top to the front; arcs above the axle line
      const dz = Math.cos(a) * rr, dy = Math.sin(a) * rr + w.r;
      const x = sideX(d, d.tAt(w.z + dz), dy);
      pts.push([sd * (Math.abs(x) + 0.008), dy, w.z + dz]);
    }
    trim.tube(pts, 0.03, 0x0c0c0e, 6, true);
    // inner liner: open half cylinder, axis along x
    const g = new THREE.CylinderGeometry(w.r + 0.045, w.r + 0.045, hw * 0.45, 22, 1, true, 0, Math.PI);
    trim.add(g, trim.mat(sd * (hw * 0.78), w.r, w.z, 0, 0, Math.PI / 2), 0x060607);
    // flares extend a bit at the wide stance
    trim.box(0.03, 0.05, 0.3, sd * (Math.abs(sideX(d, t, w.r + 0.05)) + 0.0), 0.03, w.z, BLK);
  }

  // ---- door shut lines (thin dark ribbons on the flank)
  const t0 = d.cabin.t0 + 0.012, tB = d.cabin.rs + (d.cabin.re - d.cabin.rs) * 0.38;
  const doorLines = d.S.doors === 4
    ? [t0 + 0.0, (t0 + tB) / 2 + 0.01, tB + 0.005, d.cabin.re + 0.01]
    : [t0 + 0.02, tB + 0.08, d.cabin.re - 0.02];
  for (const sd of [-1, 1]) {
    for (const tl of doorLines) {
      const a = [], b = [];
      const { ring, yb } = tubRing(d, tl);
      const z = d.zAt(tl);
      const yTop = d.topC(tl) - 0.02;
      // right half from the sill up to the shoulder
      for (let k = 0; k < K / 2 + 1; k++) {
        const q = ring[k];
        if (q[1] < yb + 0.1 || q[1] > yTop - 0.04) continue;
        if (inArch(d, sd * q[0], q[1], z, 0.1)) continue;
        a.push([sd * (Math.abs(q[0]) + 0.003), q[1], z - 0.004]);
        b.push([sd * (Math.abs(q[0]) + 0.003), q[1], z + 0.004]);
      }
      if (a.length > 1) trim.strip(sd > 0 ? a : b, sd > 0 ? b : a, 0x050506);
    }
    // sill / belt line seam
    const a = [], b = [];
    for (let j = 0; j <= 30; j++) {
      const t = d.cabin.t0 + 0.03 + (d.cabin.re - d.cabin.t0 - 0.0) * (j / 30);
      const y = d.sill + 0.15;
      const z = d.zAt(t);
      if (inArch(d, sd * hw, y, z, 0.12)) continue;
      const x = Math.abs(sideX(d, t, y)) + 0.003;
      a.push([sd * x, y - 0.004, z]); b.push([sd * x, y + 0.004, z]);
    }
    if (a.length > 1) trim.strip(sd > 0 ? b : a, sd > 0 ? a : b, 0x050506);
    // door handle + mirror
    const hT = d.S.doors === 4 ? tB - 0.035 : tB + 0.02;
    const hy = d.topC(hT) - 0.12, hz = d.zAt(hT);
    trim.box(0.025, 0.026, 0.12, sd * (Math.abs(sideX(d, hT, hy)) + 0.012), hy, hz, 0x131316);
    const mt = d.cabin.t0 + 0.01, my = d.topC(mt) + 0.09, mz = d.zAt(mt);
    const mx = sd * (d.hw * d.widC(mt) * d.cabin.w + 0.04);
    trim.box(0.05, 0.02, 0.05, sd * (Math.abs(mx) - 0.04), my - 0.02, mz + 0.05, BLK);
    const u0 = body.uv.length;
    body.add(new THREE.SphereGeometry(0.1, 12, 8), body.mat(mx + sd * 0.02, my, mz + 0.05, 0, 0, 0, 0.5, 0.75, 1.0), 0xffffff);
    for (let j = u0; j < body.uv.length; j += 2) { body.uv[j] = 0.003; body.uv[j + 1] = 0.003; }
  }

  // ---- front end: grille, splitter, lamps, tow eye
  const zN = zF + 0.02;
  const nz = (t) => d.zAt(t);
  const frontY = d.sill + 0.28;
  trim.box(hw * 0.95, 0.07, 0.34, 0, d.sill + 0.075, zF + 0.19, BLK); // splitter
  trim.box(hw * 0.62, 0.1, 0.05, 0, frontY, zF + 0.075, 0x050506, -0.1); // lower intake
  trim.box(hw * 0.5, 0.11, 0.04, 0, frontY + 0.2, zF + 0.04, 0x07070a, 0); // grille
  for (let i = 0; i < 4; i++) trim.box(hw * 0.46, 0.008, 0.01, 0, frontY + 0.17 + i * 0.025, zF + 0.012, 0x2a2b2e);
  trim.cyl(0.018, 0.018, 0.1, -hw * 0.46, frontY - 0.02, zF + 0.02, RED, Math.PI / 2, 0, 0, 8); // tow eye
  trim.box(hw * 1.4, 0.4, 0.5, 0, 0.45, zF + 0.55, 0x030304); // dark cavity behind nose (radiator)

  const mkLamp = (g, x, y, z, rx, ry, rz, shape = "round", color = 0xffffff) => {
    if (shape === "round") g.add(new THREE.SphereGeometry(rx, 14, 10), g.mat(x, y, z, 0, 0, 0, 1, 1, 0.45), color);
    else g.add(new THREE.SphereGeometry(1, 14, 10), g.mat(x, y, z, 0, 0, 0, rx, ry, rz), color);
  };
  const tn = 0.05;
  const hy = d.topC(tn) - 0.07, hz = zF + 0.12;
  const lx = d.hw * d.widC(tn) * 0.66;
  for (const sd of [-1, 1]) {
    switch (S.lamp) {
      case "round":
        trim.cyl(0.115, 0.115, 0.04, sd * lx, hy, hz - 0.02, 0x101012, Math.PI / 2 + 0.2, 0, 0, 16);
        mkLamp(head, sd * lx, hy, hz - 0.035, 0.1, 0.1, 0.045); mkLamp(head, sd * (lx - 0.2), hy - 0.01, hz + 0.0, 0.07, 0.07, 0.045);
        break;
      case "wide":
        mkLamp(head, sd * lx, hy + 0.01, hz - 0.03, 0.19, 0.07, 0.06, "ellipsoid");
        trim.box(0.4, 0.015, 0.05, sd * lx, hy + 0.085, hz - 0.01, BLK, 0.1);
        break;
      case "slit":
        mkLamp(head, sd * lx, hy, hz - 0.03, 0.17, 0.05, 0.05, "ellipsoid");
        mkLamp(head, sd * (lx - 0.36), hy - 0.02, hz - 0.01, 0.07, 0.07, 0.04);
        break;
      default: // pop-up style: flush lamps in a dark housing
        trim.box(0.3, 0.14, 0.05, sd * lx, hy, hz - 0.01, 0x08080a);
        mkLamp(head, sd * lx, hy, hz - 0.04, 0.12, 0.055, 0.05, "ellipsoid");
        break;
    }
    // indicator
    mkLamp(head, sd * lx * 1.1, hy - 0.14, hz - 0.01, 0.05, 0.03, 0.03, "ellipsoid", 0xffb347);
  }
  // rally spot lamps on a bar across the nose
  if (S.spotBar) {
    const by = d.topC(0.09) + 0.02, bz = d.zAt(0.1);
    trim.box(hw * 1.2, 0.025, 0.04, 0, by - 0.04, bz + 0.05, GREY);
    for (const x of [-0.5, -0.19, 0.19, 0.5]) {
      trim.cyl(0.085, 0.085, 0.09, x * hw * 0.9, by + 0.03, bz, 0x0a0a0c, Math.PI / 2, 0, 0, 14);
      mkLamp(head, x * hw * 0.9, by + 0.03, bz - 0.047, 0.07, 0.07, 0.03);
      trim.box(0.04, 0.05, 0.05, x * hw * 0.9, by - 0.01, bz + 0.03, GREY);
    }
  }

  // ---- tail lights, reverse lights, number plate, exhaust
  const tt = 0.955, ty = d.topC(tt) - 0.1, tz = zR - 0.03, tx = d.hw * d.widC(tt) * 0.72;
  for (const sd of [-1, 1]) {
    mkLamp(tail, sd * tx, ty, tz - 0.02, 0.2, 0.065, 0.05, "ellipsoid", 0xffffff);
    mkLamp(rev, sd * (tx * 0.5), ty - 0.17, tz + 0.0, 0.05, 0.04, 0.03, "ellipsoid", 0xffffff);
    trim.box(0.5, 0.012, 0.06, sd * tx, ty + 0.075, tz - 0.01, BLK, 0.15); // lamp hood
  }
  trim.box(0.5, 0.12, 0.02, 0, ty - 0.06, zR - 0.015, 0xe9e5cf); // plate
  trim.box(0.5, 0.012, 0.025, 0, ty - 0.12, zR - 0.015, 0x111111);
  trim.cyl(0.035, 0.035, 0.22, d.S.kind === "saloon" ? 0.35 : -0.35, d.sill + 0.12, zR - 0.1, 0x8a8d93, Math.PI / 2, 0, 0, 12); // exhaust
  trim.cyl(0.03, 0.03, 0.02, d.S.kind === "saloon" ? 0.35 : -0.35, d.sill + 0.12, zR + 0.0, 0x111111, Math.PI / 2, 0, 0, 12);
  trim.box(hw * 0.9, 0.04, 0.08, 0, d.sill + 0.06, zR - 0.08, BLK); // diffuser lip
  // mud flaps + tow eye rear
  for (let i = 2; i < 4; i++) {
    const w = d.wheels[i], sd = Math.sign(w.x);
    trim.box(0.01, 0.2, 0.22, sd * (Math.abs(sideX(d, d.tAt(w.z + 0.45), 0.2)) + 0.0), 0.2, w.z + 0.43, 0x0b0b0d);
  }
  trim.box(0.015, 0.2, 0.2, d.wheels[0].x < 0 ? -Math.abs(sideX(d, d.tAt(d.wheels[0].z + 0.4), 0.2)) : Math.abs(sideX(d, d.tAt(d.wheels[0].z + 0.4), 0.2)), 0.2, d.wheels[0].z + 0.42, 0x0b0b0d);
  trim.box(0.015, 0.2, 0.2, Math.abs(sideX(d, d.tAt(d.wheels[1].z + 0.4), 0.2)), 0.2, d.wheels[1].z + 0.42, 0x0b0b0d);
  trim.cyl(0.018, 0.018, 0.1, hw * 0.46, d.sill + 0.04, zR - 0.02, RED, Math.PI / 2, 0, 0, 8);


  // ---- aero: wings, scoops (real aerofoil sections, end plates and swan-neck uprights)
  const wingMat = body;
  void wingMat;
  if (S.wing === "gt") {
    const wz2 = d.zAt(0.972), deckY = d.topC(0.94), wy2 = deckY + 0.36;
    // main plane + upper flap (inverted cambered sections, trailing edge up)
    body.extrude(foil(0.4, 0.1, -0.055, 0.12, wz2, wy2), -0.74, 0.74, 0xffffff);
    body.extrude(foil(0.22, 0.07, -0.05, 0.4, wz2 + 0.17, wy2 + 0.1), -0.72, 0.72, 0xffffff);
    trim.box(1.48, 0.014, 0.012, 0, wy2 + 0.1, wz2 + 0.2, 0x0b0b0d, 0.12); // gurney strip
    for (const sd of [-1, 1]) {
      // shaped end plates, swan-neck uprights, plate edge trim
      body.extrude(plateProfile(wz2, wy2), sd * 0.755 - 0.008, sd * 0.755 + 0.008, 0xffffff);
      trim.extrude(plateEdge(wz2, wy2), sd * 0.755 - 0.01, sd * 0.755 + 0.01, 0x0d0d10);
      trim.tube([[sd * 0.5, deckY - 0.02, wz2 + 0.02], [sd * 0.5, deckY + 0.1, wz2 + 0.03], [sd * 0.5, wy2 - 0.2, wz2 + 0.0], [sd * 0.5, wy2 - 0.05, wz2 - 0.04]], 0.022, 0x1a1a1d, 7, true);
      trim.box(0.09, 0.012, 0.16, sd * 0.5, deckY - 0.004, wz2 + 0.02, 0x1a1a1d);
    }
  } else if (S.wing === "roof") {
    const wz2 = d.zAt(d.cabin.t1 - 0.12), wy2 = d.roof - 0.1;
    body.extrude(foil(0.24, 0.07, -0.04, 0.2, wz2 + 0.1, wy2 + 0.1), -hw * 0.6, hw * 0.6, 0xffffff);
    for (const sd of [-1, 1]) {
      body.extrude(plateProfile(wz2 + 0.1, wy2 + 0.1, 0.55), sd * hw * 0.605 - 0.007, sd * hw * 0.605 + 0.007, 0xffffff);
      trim.box(0.03, 0.09, 0.05, sd * hw * 0.38, wy2 + 0.04, wz2 + 0.02, 0x15151a);
    }
  } else if (S.wing === "small") {
    const wz2 = d.zAt(0.953), deckY = d.topC(0.92), wy2 = deckY + 0.2;
    body.extrude(foil(0.3, 0.09, -0.05, 0.16, wz2, wy2), -hw * 0.6, hw * 0.6, 0xffffff);
    for (const sd of [-1, 1]) {
      body.extrude(plateProfile(wz2, wy2, 0.7), sd * hw * 0.605 - 0.007, sd * hw * 0.605 + 0.007, 0xffffff);
      trim.tube([[sd * 0.34, deckY, wz2 + 0.03], [sd * 0.34, wy2 - 0.07, wz2 + 0.0]], 0.02, 0x15151a, 7, false);
    }
  } else if (S.wing === "duck") {
    const wz2 = d.zAt(0.965), wy2 = d.topC(0.95);
    // ducktail: a lip that rises smoothly off the boot lid
    const duck = [[-0.24, 0.0], [0.1, -0.01], [0.24, 0.045], [0.27, 0.085], [0.255, 0.092], [0.12, 0.055], [-0.1, 0.02], [-0.24, 0.012]];
    body.extrude(duck.map((q) => [q[0] + wz2, q[1] + wy2 + 0.005]), -hw * 0.74, hw * 0.74, 0xffffff);
  }
  if (S.scoop === "bonnet") {
    const sz = d.zAt(0.21), sy = d.topC(0.21) + 0.02;
    body.box(0.5, 0.06, 0.55, 0, sy + 0.025, sz, 0xffffff, -0.1);
    trim.box(0.42, 0.045, 0.02, 0, sy + 0.04, sz - 0.28, 0x040404);
  } else if (S.scoop === "bonnet-low") {
    for (const sd of [-1, 1]) trim.box(0.04, 0.012, 0.4, sd * 0.2, d.topC(0.2) + 0.012, d.zAt(0.22), 0x050505, 0, 0, 0);
    trim.box(0.5, 0.012, 0.25, 0, d.topC(0.18) + 0.012, d.zAt(0.18), 0x080808);
  } else if (S.scoop === "side") {
    for (const sd of [-1, 1]) trim.box(0.03, 0.12, 0.3, sd * (Math.abs(sideX(d, 0.64, d.sill + 0.4)) + 0.006), d.sill + 0.4, d.zAt(0.64), 0x060607);
  }
  if (S.roofScoop) {
    const rz = d.zAt((d.cabin.rs + d.cabin.re) / 2 - 0.05);
    body.box(0.36, 0.07, 0.46, 0, d.roof + 0.035, rz, 0xffffff, -0.05);
    trim.box(0.3, 0.05, 0.02, 0, d.roof + 0.04, rz - 0.23, 0x040404);
  }
  // bonnet pins
  for (const sd of [-1, 1]) for (const tz2 of [0.1, 0.3]) trim.cyl(0.012, 0.012, 0.02, sd * hw * 0.46, d.topC(tz2) + 0.012, d.zAt(tz2), 0xb8bcc4, 0, 0, 0, 8);
  // windscreen sun banner
  glass.box(hw * 1.2 * d.cabin.w, 0.015, 0.012, 0, d.topC(d.cabin.t0 + 0.07) + 0.4, d.zAt(d.cabin.t0 + 0.085), 0xffffff);

  // ---- chassis details seen from low angles
  trim.box(hw * 1.2, 0.08, d.zR - d.zF - 1.3, 0, d.sill + 0.02, (d.zR + d.zF) / 2, 0x0c0c0e);
  for (const sd of [-1, 1]) trim.box(0.04, 0.05, d.wheels[2].z - d.wheels[0].z - 0.5, sd * hw * 0.58, d.sill + 0.07, (d.wheels[2].z + d.wheels[0].z) / 2, 0x1a1a1e);
}
