// Lofted body shell, greenhouse, wheel arches and exterior details. Builds THREE.BufferGeometry parts.
import { Geo } from "./geo.mjs";
import { liveryUV } from "./livery.mjs";
import { inArch, doorLinesT } from "./profiles.mjs";
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

// Greenhouse cross-section: the right half (base -> wall -> roof corner -> apex) is mirrored into one open arc.
// Ring vertex k = 0..GH_K-1 runs right base -> apex -> left base; glass / pillar boundaries sit on fixed vertex indices
// and fixed station values, so every edge is a smooth polyline (no per-quad classification, no sawtooth).
const GH_NW = 10, GH_NR = 8, GH_NP = GH_NW + GH_NR + 1, GH_K = 2 * GH_NP - 1;
const GH_SIDE = [3, 9], GH_ROOF0 = 13; // side-glass vertex range, first windscreen / rear-window vertex

export function cabinRing(d, t) {
  const c = d.cabin, base = d.topC(t) - 0.06, yTop = roofY(d, t);
  const h = Math.max(0.004, yTop - base), wb = d.hw * d.widC(t) * c.w, fw = 0.72;
  const half = [];
  for (let j = 0; j <= GH_NW; j++) { const fy = (fw * j) / GH_NW; half.push([wb * (1 - c.tum * smoothstep(0.1, 1, fy)), base + h * fy]); }
  const xw = half[GH_NW][0], yw = half[GH_NW][1];
  for (let j = 1; j <= GH_NR; j++) {
    const a = (j / GH_NR) * Math.PI / 2;
    half.push([j === GH_NR ? 0 : xw * Math.pow(Math.cos(a), 0.7), yw + (yTop - yw) * Math.pow(Math.sin(a), 0.8)]);
  }
  const ring = half.slice();
  for (let j = GH_NP - 2; j >= 0; j--) ring.push([-half[j][0], half[j][1]]);
  return { ring, base, yTop, wb };
}

/** Station values of the greenhouse loft, with the glass / pillar boundaries as exact stations. */
export function ghStations(d) {
  const c = d.cabin;
  const bT = c.rs + (c.re - c.rs) * 0.38;
  const tG1 = c.re + (c.t1 - c.re) * ({ saloon: 0.3, hatch: 0.45, kit: 0.3, coupe: 0.35 }[d.S.kind] ?? 0.3);
  const keys = [c.t0, c.t0 + 0.012, c.rs, c.re, tG1, c.t1 - 0.014, c.t1];
  if (c.bPillar) keys.push(bT - 0.014, bT + 0.014);
  const ts = keys.slice();
  const N = 72;
  for (let i = 1; i < N; i++) { const t = c.t0 + ((c.t1 - c.t0) * i) / N; if (keys.every((k) => Math.abs(k - t) > 0.006)) ts.push(t); }
  ts.sort((a, b) => a - b);
  return { ts, bT, tG1, gt0: c.t0 + 0.012, gt1: c.t1 - 0.014 };
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
  const B = { body: mk(), bonnet: mk(), bumperF: mk(), bumperR: mk(), cabin: mk(), glass: mk(), trim: mk(), head: mk(), tail: mk(), rev: mk(), caliperless: null };
  const paintBuckets = new Set(["body", "bonnet", "bumperF", "bumperR", "cabin"]);
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

  // ------------------------------------------------------------------ greenhouse
  const cab = d.cabin;
  const gh = ghStations(d);
  const cg = { P: [], N: [] };
  for (const t of gh.ts) { const z = d.zAt(t); cg.P.push(cabinRing(d, t).ring.map((q) => [q[0], q[1], z])); }
  const nS = gh.ts.length;
  for (let i = 0; i < nS; i++) {
    const row = [];
    for (let k = 0; k < GH_K; k++) {
      const a = cg.P[Math.max(0, i - 1)][k], b = cg.P[Math.min(nS - 1, i + 1)][k];
      const c = cg.P[i][Math.min(GH_K - 1, k + 1)], e = cg.P[i][Math.max(0, k - 1)];
      const ds = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dk = [c[0] - e[0], c[1] - e[1], c[2] - e[2]];
      let nx = dk[1] * ds[2] - dk[2] * ds[1], ny = dk[2] * ds[0] - dk[0] * ds[2], nz = dk[0] * ds[1] - dk[1] * ds[0];
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) { nx = 0; ny = 1; nz = 0; } else { nx /= l; ny /= l; nz /= l; }
      row.push([nx, ny, nz]);
    }
    cg.N.push(row);
  }
  const iAt = (t) => { let best = 0; for (let i = 0; i < nS; i++) if (Math.abs(gh.ts[i] - t) < Math.abs(gh.ts[best] - t)) best = i; return best; };
  // glass panels as (station range, vertex range); the cabin paint gets every other cell
  const panels = [];
  const sideKs = [[GH_SIDE[0], GH_SIDE[1]], [GH_K - 1 - GH_SIDE[1], GH_K - 1 - GH_SIDE[0]]];
  const frontEnd = cab.bPillar ? gh.bT - 0.014 : gh.tG1;
  for (const [k0, k1] of sideKs) {
    panels.push({ i0: iAt(gh.gt0), i1: iAt(frontEnd), k0, k1 });
    if (cab.bPillar) panels.push({ i0: iAt(gh.bT + 0.014), i1: iAt(gh.tG1), k0, k1 });
  }
  panels.push({ i0: iAt(gh.gt0), i1: iAt(cab.rs), k0: GH_ROOF0, k1: GH_K - 1 - GH_ROOF0 }); // windscreen
  panels.push({ i0: iAt(cab.re), i1: iAt(gh.gt1), k0: GH_ROOF0, k1: GH_K - 1 - GH_ROOF0 }); // rear window
  const inGlass = (i, k) => panels.some((p) => i >= p.i0 && i < p.i1 && k >= p.k0 && k < p.k1);
  for (let i = 0; i < nS - 1; i++) {
    for (let k = 0; k < GH_K - 1; k++) {
      const A = cg.P[i][k], Bq = cg.P[i][k + 1], C = cg.P[i + 1][k + 1], D = cg.P[i + 1][k];
      emitQuad(inGlass(i, k) ? "glass" : "cabin", A, Bq, C, D, cg.N[i][k], cg.N[i][k + 1], cg.N[i + 1][k + 1], cg.N[i + 1][k], WHITE);
    }
  }
  // rubber bead around every glass panel
  for (const p of panels) {
    const pts = [];
    const at = (i, k) => { const q = cg.P[i][k], n = cg.N[i][k]; return [q[0] + n[0] * 0.004, q[1] + n[1] * 0.004, q[2] + n[2] * 0.004]; };
    for (let i = p.i0; i <= p.i1; i++) pts.push(at(i, p.k0));
    for (let k = p.k0 + 1; k <= p.k1; k++) pts.push(at(p.i1, k));
    for (let i = p.i1 - 1; i >= p.i0; i--) pts.push(at(i, p.k1));
    for (let k = p.k1 - 1; k >= p.k0; k--) pts.push(at(p.i0, k));
    B.trim.tube(pts, 0.0065, 0x070708, 5, false);
  }
  B.gh = { gh, cg };

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

/** Height of the tub's top surface at lateral offset x and station t. */
export function surfTop(d, t, x) {
  const { ring } = tubRing(d, t), ax = Math.abs(x);
  for (let k = K / 4; k < K / 2; k++) {
    const a = ring[k], b = ring[k + 1];
    if (a[0] >= ax && b[0] <= ax) { const u = a[0] === b[0] ? 0 : (a[0] - ax) / (a[0] - b[0]); return a[1] + (b[1] - a[1]) * u; }
  }
  return ring[K / 2][1];
}

/** z of the tub's end face at (|x|, y): scans inwards from the tip. rear = true for the tail. */
export function edgeZ(d, x, y, rear) {
  const ax = Math.abs(x);
  for (let n = 0; n <= 140; n++) {
    const t = rear ? 1 - n * 0.002 : n * 0.002;
    const { ring } = tubRing(d, t);
    for (let k = 0; k < K / 2; k++) {
      const a = ring[k], b = ring[k + 1];
      if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
        const xw = a[0] + (b[0] - a[0]) * ((y - a[1]) / (b[1] - a[1]));
        if (xw >= ax) return d.zAt(t);
        break;
      }
    }
  }
  return rear ? d.zR - 0.3 : d.zF + 0.3;
}

function buildDetails(THREE, spec, d, B, tub) {
  const { trim, body, head, tail, rev, glass } = B;
  body.fixUV = [0.003, 0.003];
  const hw = d.hw, S = d.S, zF = d.zF, zR = d.zR;
  const BLK = 0x0b0b0d, GREY = 0x2a2c30, RED = 0xb02020, SIL = 0xb8bcc4, RUB = 0x08080a;

  /** Surface point + orientation (euler x, y for an ellipsoid whose z axis follows the surface normal). */
  const face = (x, y, rear) => {
    const z = edgeZ(d, x, y, rear), e = 0.05;
    const dzdx = (edgeZ(d, Math.abs(x) + e, y, rear) - edgeZ(d, Math.max(0, Math.abs(x) - e), y, rear)) / (Math.abs(x) + e - Math.max(0, Math.abs(x) - e)) * Math.sign(x || 1);
    const dzdy = (edgeZ(d, x, y + e, rear) - edgeZ(d, x, y - e, rear)) / (2 * e);
    return { z, ry: Math.atan(-dzdx), rx: Math.atan(dzdy) };
  };
  /** A lamp lens (type bucket g) set into the end face, with a dark bezel; rx/ry are half extents, depth the lens thickness. */
  const lens = (g, x, y, rear, rx, ry, depth, color = 0xffffff, bezel = 1.14) => {
    const f = face(x, y, rear), s = rear ? 1 : -1;
    trim.add(new THREE.SphereGeometry(1, 18, 10), trim.mat(x, y, f.z - s * depth * 0.2, f.rx, f.ry, 0, rx * bezel, ry * bezel, depth * 0.45), 0x0a0a0c);
    g.add(new THREE.SphereGeometry(1, 18, 10), g.mat(x, y, f.z - s * depth * 0.32, f.rx, f.ry, 0, rx, ry, depth), color);
  };

  // ---- wheel arch lips: tapered ribbons that follow the body side, ending above the sill (no pegs)
  for (let i = 0; i < 4; i++) {
    const w = d.wheels[i], sd = Math.sign(w.x);
    const rr = w.r + 0.058;
    const a0 = Math.asin(clamp((d.sill + 0.045 - w.r) / rr, -1, 1));
    const pts = [];
    const steps = 30;
    for (let j = 0; j <= steps; j++) {
      const a = a0 + (Math.PI - 2 * a0) * (j / steps);
      const dz = Math.cos(a) * rr, dy = Math.sin(a) * rr + w.r;
      const x = sideX(d, d.tAt(w.z + dz), dy);
      pts.push([sd * (Math.abs(x) + 0.006), dy, w.z + dz]);
    }
    trim.tubeR(pts, (u) => 0.0205 * Math.pow(Math.min(1, 5 * u, 5 * (1 - u)), 0.55) + 0.001, 0x0c0c0e, 8, true, 56);
    const g = new THREE.CylinderGeometry(w.r + 0.045, w.r + 0.045, hw * 0.45, 22, 1, true, 0, Math.PI);
    trim.add(g, trim.mat(sd * (hw * 0.78), w.r, w.z, 0, 0, Math.PI / 2), 0x060607);
  }

  // ---- door shut lines, belt seam, handles and mirrors
  const t0 = d.cabin.t0 + 0.012, tB = d.cabin.rs + (d.cabin.re - d.cabin.rs) * 0.38;
  const doorLines = doorLinesT(d);
  for (const sd of [-1, 1]) {
    for (const tl of doorLines) {
      const a = [], b = [];
      const { ring, yb } = tubRing(d, tl);
      const z = d.zAt(tl);
      const yTop = d.topC(tl) - 0.02;
      for (let k = 0; k < K / 2 + 1; k++) {
        const q = ring[k];
        if (q[1] < yb + 0.1 || q[1] > yTop - 0.04) continue;
        if (inArch(d, sd * q[0], q[1], z, 0.1)) continue;
        a.push([sd * (Math.abs(q[0]) + 0.003), q[1], z - 0.004]);
        b.push([sd * (Math.abs(q[0]) + 0.003), q[1], z + 0.004]);
      }
      if (a.length > 1) trim.strip(sd > 0 ? a : b, sd > 0 ? b : a, 0x050506);
    }
    const a = [], b = [];
    for (let j = 0; j <= 30; j++) {
      const t = d.cabin.t0 + 0.03 + (d.cabin.re - d.cabin.t0) * (j / 30);
      const y = d.sill + 0.15, z = d.zAt(t);
      if (inArch(d, sd * hw, y, z, 0.12)) continue;
      const x = Math.abs(sideX(d, t, y)) + 0.003;
      a.push([sd * x, y - 0.004, z]); b.push([sd * x, y + 0.004, z]);
    }
    if (a.length > 1) trim.strip(sd > 0 ? b : a, sd > 0 ? a : b, 0x050506);
    const hT = d.S.doors === 4 ? tB - 0.035 : tB + 0.02;
    const hy = d.topC(hT) - 0.12, hz = d.zAt(hT);
    trim.box(0.025, 0.026, 0.12, sd * (Math.abs(sideX(d, hT, hy)) + 0.012), hy, hz, 0x131316);
    // wing mirror: small housing on a short stalk from the door top at the A-pillar foot
    const mt = d.cabin.t0 + 0.03, mz = d.zAt(mt) + 0.06, my0 = d.topC(mt);
    const wbm = d.hw * d.widC(mt) * d.cabin.w;
    const ex = sd * (wbm + 0.12), ey = my0 + 0.09;
    trim.tube([[sd * (wbm - 0.03), my0 - 0.012, mz], [sd * (wbm + 0.05), my0 + 0.04, mz + 0.01], [ex, ey - 0.01, mz + 0.025]], 0.011, 0x101012, 6, true);
    body.add(new THREE.SphereGeometry(1, 14, 10), body.mat(ex, ey, mz + 0.035, 0, 0, 0, 0.032, 0.046, 0.08), 0xffffff);
    trim.box(0.05, 0.07, 0.008, ex, ey, mz + 0.035 + 0.078, 0x1d2228, 0, 0, 0); // glass face
  }

  // ---- front end: splitter lip, intake, grille, tow eye
  const frontFace = (y) => edgeZ(d, 0, y, false);
  const nb = tubRing(d, 0.03).yb;
  {
    // splitter: a thin plate under the nose following its outline, with a short front skirt
    const fo = [], bk = [], sk = [];
    for (let q = -0.72; q <= 0.7201; q += 0.12) { const z = edgeZ(d, q * hw, nb + 0.03, false); fo.push([q * hw, nb - 0.006, z - 0.035]); bk.push([q * hw, nb - 0.006, z + 0.12]); sk.push([q * hw, nb - 0.03, z - 0.035]); }
    trim.strip(fo, bk, 0x050506);
    trim.strip(sk, fo, 0x050506);
  }
  const gy = nb + 0.2, gz = edgeZ(d, 0, gy, false);
  trim.box(hw * 0.5, 0.11, 0.03, 0, gy, gz + 0.012, 0x050506); // grille recess
  for (let i = 0; i < 4; i++) trim.box(hw * 0.46, 0.008, 0.012, 0, gy - 0.036 + i * 0.024, gz - 0.003, 0x2a2b2e);
  trim.box(hw * 0.7, 0.06, 0.03, 0, nb + 0.07, edgeZ(d, 0, nb + 0.07, false) + 0.012, 0x050506); // lower intake
  {
    const ty = nb + 0.08, tx = -hw * 0.55, tz = edgeZ(d, tx, ty, false);
    trim.add(new THREE.TorusGeometry(0.028, 0.0075, 6, 14), trim.mat(tx, ty, tz - 0.012, 0, 0, 0), RED); // tow eye
  }
  trim.box(hw * 1.4, 0.4, 0.5, 0, 0.45, zF + 0.55, 0x030304);

  // main lamps
  const hy = d.topC(0.05) - 0.12, lx = d.hw * d.widC(0.05) * 0.62;
  for (const sd of [-1, 1]) {
    switch (S.lamp) {
      case "round": lens(head, sd * lx, hy, false, 0.092, 0.092, 0.05); trim.add(new THREE.TorusGeometry(0.1, 0.007, 6, 20), trim.mat(sd * lx, hy, edgeZ(d, sd * lx, hy, false) - 0.004, 0, 0, 0), SIL); break;
      case "wide": lens(head, sd * lx, hy + 0.01, false, 0.17, 0.058, 0.045); break;
      case "slit": lens(head, sd * lx, hy, false, 0.16, 0.044, 0.045); break;
      default: lens(head, sd * lx * 0.92, hy, false, 0.11, 0.046, 0.04, 0xffffff, 1.35); break;
    }
    lens(head, sd * lx * 1.2, hy - 0.13, false, 0.045, 0.025, 0.03, 0xffb347); // indicator
  }
  // rally spot lamps on a bar above the nose
  if (S.spotBar) {
    const bt = 0.1, bz = d.zAt(bt);
    const xs = [-0.5, -0.19, 0.19, 0.5].map((q) => q * hw * 0.9);
    for (const x of xs) {
      const by = surfTop(d, bt, x) + 0.012;
      trim.box(0.05, 0.045, 0.06, x, by + 0.022, bz + 0.03, GREY); // bracket
      const zc = bz - 0.01, yc = by + 0.085;
      trim.cyl(0.075, 0.07, 0.05, x, yc, zc + 0.015, 0x0a0a0c, Math.PI / 2, 0, 0, 20); // housing
      trim.add(new THREE.TorusGeometry(0.074, 0.007, 6, 22), trim.mat(x, yc, zc - 0.012, 0, 0, 0), SIL); // chrome ring
      head.add(new THREE.SphereGeometry(1, 20, 10), head.mat(x, yc, zc - 0.004, 0, 0, 0, 0.068, 0.068, 0.022), 0xffffff);
    }
    trim.box(hw * 1.2, 0.02, 0.04, 0, surfTop(d, bt, 0) + 0.015, bz + 0.05, GREY);
  }

  // ---- tail end: lamps set into the face, plate, reverse lamps, exhaust, tow eye
  const ty = d.topC(0.955) - 0.12, tx = d.hw * d.widC(0.955) * 0.6;
  for (const sd of [-1, 1]) {
    lens(tail, sd * tx, ty, true, 0.16, 0.05, 0.022, 0xffffff, 1.08);
    lens(rev, sd * hw * 0.5, d.sill + 0.2, true, 0.04, 0.03, 0.016, 0xffffff, 1.08);
  }
  const py = 0.43;
  trim.box(0.5, 0.11, 0.014, 0, py, edgeZ(d, 0, py, true) - 0.002, 0xe9e5cf); // plate
  trim.box(0.5, 0.012, 0.018, 0, py - 0.065, edgeZ(d, 0, py - 0.065, true) - 0.002, 0x111111);
  const ex = S.kind === "saloon" ? 0.35 : -0.35, ez = edgeZ(d, ex, d.sill + 0.12, true);
  trim.cyl(0.036, 0.036, 0.2, ex, d.sill + 0.12, ez - 0.02, 0x9a9da4, Math.PI / 2, 0, 0, 14);
  trim.cyl(0.028, 0.028, 0.02, ex, d.sill + 0.12, ez + 0.075, 0x111111, Math.PI / 2, 0, 0, 14);
  trim.add(new THREE.TorusGeometry(0.028, 0.0075, 6, 14), trim.mat(hw * 0.46, d.sill + 0.12, edgeZ(d, hw * 0.46, d.sill + 0.12, true) + 0.012, 0, 0, 0), RED);
  trim.box(hw * 0.9, 0.035, 0.07, 0, tubRing(d, 0.97).yb - 0.005, zR - 0.1, BLK); // diffuser lip

  // ---- mud flaps: thin rubber plates hung behind the wheels, just inside the body line
  for (let i = 0; i < 4; i++) {
    const w = d.wheels[i], sd = Math.sign(w.x), zf = w.z + 0.43;
    const x = Math.abs(sideX(d, d.tAt(zf), d.sill + 0.12)) - 0.012;
    trim.box(0.012, 0.16, 0.18, sd * x, d.sill + 0.04, zf, RUB);
    trim.box(0.014, 0.02, 0.18, sd * x, d.sill + 0.115, zf, 0x16161a);
  }

  // ---- aero
  if (S.wing === "gt") {
    // GT wing: one aerofoil on two swan-neck uprights with mounting pads, end plates outboard of the plane
    const wz2 = d.zAt(0.925), span = 0.62, ux = 0.3;
    const deckY = surfTop(d, 0.925, ux), wy2 = deckY + 0.21;
    body.extrude(foil(0.27, 0.085, -0.04, 0.1, wz2, wy2), -span, span, 0xffffff);
    trim.box(span * 2 - 0.02, 0.012, 0.012, 0, wy2 + 0.045, wz2 + 0.12, BLK, 0.1); // gurney strip
    for (const sd of [-1, 1]) {
      body.extrude(plateProfile(wz2 - 0.02, wy2 + 0.01, 0.42), sd * (span + 0.012) - 0.006, sd * (span + 0.012) + 0.006, 0xffffff);
      trim.box(0.13, 0.012, 0.2, sd * ux, deckY + 0.004, wz2 + 0.0, 0x1a1a1d); // mounting pad
      trim.tubeR([[sd * ux, deckY, wz2 + 0.03], [sd * ux, wy2 - 0.12, wz2 + 0.025], [sd * ux, wy2 - 0.04, wz2 - 0.01]], () => 0.0215, 0x1a1a1d, 8, true, 24);
    }
  } else if (S.wing === "roof") {
    const wz2 = d.zAt(d.cabin.t1 - 0.12), wy2 = d.roof - 0.1;
    const span = hw * 0.6;
    body.extrude(foil(0.22, 0.07, -0.04, 0.2, wz2 + 0.1, wy2 + 0.1), -span, span, 0xffffff);
    for (const sd of [-1, 1]) {
      body.extrude(plateProfile(wz2 + 0.1, wy2 + 0.1, 0.4), sd * span - 0.006 + sd * 0.006, sd * span + 0.006 + sd * 0.006, 0xffffff);
      trim.box(0.03, 0.09, 0.05, sd * hw * 0.38, wy2 + 0.04, wz2 + 0.02, 0x15151a);
    }
  } else if (S.wing === "small") {
    const wz2 = d.zAt(0.93), ux = 0.3, deckY = surfTop(d, 0.93, ux), wy2 = deckY + 0.16, span = hw * 0.5;
    body.extrude(foil(0.22, 0.08, -0.04, 0.12, wz2, wy2), -span, span, 0xffffff);
    for (const sd of [-1, 1]) {
      body.extrude(plateProfile(wz2, wy2, 0.38), sd * (span + 0.012) - 0.006, sd * (span + 0.012) + 0.006, 0xffffff);
      trim.box(0.1, 0.012, 0.16, sd * ux, deckY + 0.003, wz2 + 0.01, 0x15151a);
      trim.tubeR([[sd * ux, deckY, wz2 + 0.03], [sd * ux, wy2 - 0.06, wz2]], () => 0.02, 0x15151a, 8, false, 12);
    }
  } else if (S.wing === "duck") {
    const wz2 = d.zAt(0.925), wy2 = surfTop(d, 0.925, 0);
    const duck = [[-0.24, 0.0], [0.1, -0.01], [0.24, 0.045], [0.27, 0.085], [0.255, 0.092], [0.12, 0.055], [-0.1, 0.02], [-0.24, 0.012]];
    body.extrude(duck.map((q) => [q[0] + wz2, q[1] + wy2 + 0.005]), -hw * 0.74, hw * 0.74, 0xffffff);
  }

  // ---- scoops and vents (profiles follow the surface they sit on)
  const wedge = (t, halfW, zLen, hMax, front = true) => {
    // intake scoop on the bonnet / roof: open end toward the front, ramp down toward the rear
    const z0 = d.zAt(t), n = 8, up = [], dn = [];
    for (let j = 0; j <= n; j++) {
      const z = z0 - zLen / 2 + (zLen * j) / n, tt = d.tAt(z), y = surfTop(d, tt, 0) - 0.006;
      const u = j / n, hh = hMax * (front ? Math.pow(1 - u, 1.4) * 0.85 + 0.15 * (1 - u) : u) * (j === n ? 0 : 1);
      dn.push([z, y]); up.push([z, y + hh]);
    }
    return { prof: [...dn, ...up.reverse()], z0 };
  };
  if (S.scoop === "bonnet") {
    const { prof } = wedge(0.19, 0.2, 0.4, 0.06);
    body.extrude(prof, -0.2, 0.2, 0xffffff);
    trim.box(0.3, 0.04, 0.012, 0, surfTop(d, 0.19, 0) + 0.03, d.zAt(0.19) - 0.2 - 0.002, 0x040404);
  } else if (S.scoop === "bonnet-low") {
    for (const sd of [-1, 1]) trim.box(0.04, 0.012, 0.4, sd * 0.28, surfTop(d, 0.24, 0.28) + 0.004, d.zAt(0.24), 0x050505);
  } else if (S.scoop === "side") {
    for (const sd of [-1, 1]) {
      const vz = d.zAt(0.64), vy = d.sill + 0.4, vx = Math.abs(sideX(d, 0.64, vy));
      trim.box(0.012, 0.11, 0.3, sd * (vx + 0.001), vy, vz, 0x060607);
      for (let j = 0; j < 4; j++) trim.box(0.016, 0.009, 0.28, sd * (vx + 0.003), vy - 0.04 + j * 0.027, vz, 0x2a2c30);
    }
  }
  if (S.roofScoop) {
    const rz = d.zAt((d.cabin.rs + d.cabin.re) / 2 - 0.05), ry0 = d.roof - 0.012;
    const prof = [[-0.24, 0], [0.24, 0], [0.24, 0.01], [0.1, 0.04], [-0.08, 0.066], [-0.22, 0.07], [-0.245, 0.045]].map(([z, y]) => [rz + z, ry0 + y]);
    body.extrude(prof, -0.17, 0.17, 0xffffff);
    trim.box(0.3, 0.036, 0.01, 0, ry0 + 0.04, rz - 0.246, 0x040404);
  }
  // bonnet pins sit on the surface
  for (const sd of [-1, 1]) for (const tz2 of [0.1, 0.3]) {
    const x = sd * hw * 0.46, y = surfTop(d, tz2, x);
    trim.cyl(0.012, 0.012, 0.022, x, y + 0.006, d.zAt(tz2), 0xb8bcc4, 0, 0, 0, 10);
    trim.cyl(0.008, 0.008, 0.012, x, y + 0.018, d.zAt(tz2), 0x1a1a1d, 0, 0, 0, 8);
  }
  // chassis details seen from low angles
  trim.box(hw * 1.2, 0.08, d.zR - d.zF - 1.3, 0, d.sill + 0.02, (d.zR + d.zF) / 2, 0x0c0c0e);
  for (const sd of [-1, 1]) trim.box(0.04, 0.05, d.wheels[2].z - d.wheels[0].z - 0.5, sd * hw * 0.58, d.sill + 0.07, (d.wheels[2].z + d.wheels[0].z) / 2, 0x1a1a1e);
}
