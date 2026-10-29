// Roofs for buildBuilding: the roof MODEL (wall tops that follow the roof, so the shell stays watertight) and the roof MESHES.
// Styles: terrace (flat slab + parapet, optional caseta over the stairs), corrugated (mono-pitch zinc), tile (gable, clay), unfinished
// (open concrete deck with columns and sprouting rebar). Local frame: y = floor-index * fh.
import { CASETA_H, CASETA_T, PRETIL_H } from './roof.js';
import { lin, mulc, mixc, qd, faceQuad, flat, bar, hash01 } from './mb.js';

export function makeRoofModel(G) {
  const { S, bp } = G, yF = S.F * S.fh, O = S.outer;
  const hs = (n) => hash01(bp.id, 100 + n);
  const rm = { style: S.roofStyle, yF, breaks: () => [] };
  if (S.roofStyle === 'terrace') {
    const ph = S.roofLayer?.parapetH ?? 0.7;
    rm.ph = ph; rm.wallTop = () => yF + ph;
  } else if (S.roofStyle === 'corrugated') {
    const axis = S.party.left || S.party.right ? 'z' : S.W <= S.D ? 'x' : 'z';
    const lowPos = hs(1) > 0.5, slope = 0.11 + 0.07 * hs(2), base = 0.3;
    const edgeLow = axis === 'z' ? (lowPos ? O.z1 : O.z0) : (lowPos ? O.x1 : O.x0);
    const y = (c) => yF + base + slope * Math.abs(c - edgeLow);
    rm.wallTop = (wl, u) => (axis === 'z' ? (wl.dir === 'x' ? y(wl.at) : y(u)) : (wl.dir === 'z' ? y(wl.at) : y(u)));
    rm.mono = { axis, y, ov: 0.32 };
  } else if (S.roofStyle === 'tile') {
    const ridgeZ = S.party.left || S.party.right ? false : S.D >= S.W;           // ridge along z: slopes toward +-x
    const pitch = 0.46 + 0.1 * hs(3), eave = 0.25;
    const half = ridgeZ ? S.W / 2 : S.D / 2;
    const h = (c) => yF + eave + pitch * (half - Math.abs(c));                   // roof height over the cross coordinate c (x if ridgeZ else z)
    rm.wallTop = (wl, u) => (ridgeZ ? (wl.dir === 'x' ? h(u) : h(wl.at)) : (wl.dir === 'z' ? h(u) : h(wl.at)));
    rm.breaks = (wl) => (ridgeZ ? (wl.dir === 'x' ? [0] : []) : (wl.dir === 'z' ? [0] : []));
    rm.gable = { ridgeZ, h, half, pitch, ov: 0.3 };
  } else {                                                                       // unfinished (closed slab version or open deck)
    rm.wallTop = () => yF;
  }
  return rm;
}

const box = (G, m, cx, cy, cz, sx, sy, sz, col, skip) => G.b.box(m, cx, cy, cz, sx, sy, sz, { col, skip });

/** Terrace: parapet (roof-side faces + coping) and the roof surface of a non-walkable terrace. */
function terraceRoof(G) {
  const { S, b, fs, rm } = G, O = S.outer, I = S.inner, yF = rm.yF, ph = rm.ph, te = S.te;
  const wc = mulc(fs.wall, 0.9);
  // roof side of the parapet
  const sides = [['x', O.z1 - te, -1, I.x0, I.x1], ['x', O.z0 + te, 1, I.x0, I.x1], ['z', O.x0 + te, 1, I.z0, I.z1], ['z', O.x1 - te, -1, I.z0, I.z1]];
  for (const [dir, plane, side, a, c] of sides) faceQuad(b, 'concrete_bare', dir, plane, side, a, c, yF, yF, yF + ph, yF + ph, { cols: [mulc(wc, 0.7), mulc(wc, 0.7), wc, wc] });
  // coping: a slightly wider cap on the parapet
  const cp = 0.045, ct = te + 2 * cp;
  box(G, 'concrete_bare', 0, yF + ph + 0.025, O.z1 - te / 2, S.W + 2 * cp, 0.05, ct, [0.95, 0.95, 0.93]);
  box(G, 'concrete_bare', 0, yF + ph + 0.025, O.z0 + te / 2, S.W + 2 * cp, 0.05, ct, [0.95, 0.95, 0.93]);
  box(G, 'concrete_bare', O.x0 + te / 2, yF + ph + 0.025, 0, ct, 0.05, S.D - 2 * te, [0.95, 0.95, 0.93]);
  box(G, 'concrete_bare', O.x1 - te / 2, yF + ph + 0.025, 0, ct, 0.05, S.D - 2 * te, [0.95, 0.95, 0.93]);
  if (!S.roofWalkable) {                                                          // the visible roof surface (walkable ones draw their rooms)
    flat(b, 'roof_terrace', I.x0, I.z0, I.x1, I.z1, yF, true, { col: [1, 1, 1] });
  }
  // caseta roof slab over the stair head
  const cas = S.roofLayer?.caseta;
  if (cas) {
    const q = cas.outer, ov = 0.1;
    box(G, 'concrete_bare', (q.x0 + q.x1) / 2, yF + CASETA_H + 0.07, (q.z0 + q.z1) / 2, q.x1 - q.x0 + 2 * ov, 0.14, q.z1 - q.z0 + 2 * ov, [0.92, 0.92, 0.9]);
  }
}

/** Mono-pitch corrugated roof sheet with eaves. */
function monoRoof(G) {
  const { S, b, fs, rm } = G, O = S.outer, M = rm.mono, ov = M.ov, th = 0.07;
  const col = mixc([1, 1, 1], fs.roof, 0.9);
  const hx = S.W / 2 + ov, hz = S.D / 2 + ov;
  const P = (x, z) => [x, M.axis === 'z' ? M.y(z) : M.y(x), z];
  const A = P(-hx, -hz), B = P(hx, -hz), C = P(hx, hz), D = P(-hx, hz);
  qd(b, 'corrugated_zinc', A, B, C, D, [0, 1, 0], { col });
  const dn = (p) => [p[0], p[1] - th, p[2]];
  qd(b, 'corrugated_zinc', dn(A), dn(B), dn(C), dn(D), [0, -1, 0], { col: mulc(col, 0.45) });
  // edge faces (the sheet's thickness) in the trim colour
  const edge = (p, q, nrm) => qd(b, 'plaster_a', p, q, dn(q), dn(p), nrm, { col: mulc(fs.trim, 0.85) });
  edge(A, B, [0, 0, -1]); edge(B, C, [1, 0, 0]); edge(C, D, [0, 0, 1]); edge(D, A, [-1, 0, 0]);
}

/** Gable clay-tile roof with a ridge cap. */
function tileRoof(G) {
  const { S, b, fs, rm } = G, g = rm.gable, ov = g.ov, th = 0.08;
  const tint = [0.95 + 0.1 * hash01(G.bp.id, 5), 0.9 + 0.1 * hash01(G.bp.id, 6), 0.9 + 0.1 * hash01(G.bp.id, 7)];
  const c1 = g.half + ov, along = (g.ridgeZ ? S.D : S.W) / 2 + ov;
  const hh = (c) => g.h(c);
  const pt = (c, a) => (g.ridgeZ ? [c, hh(c), a] : [a, hh(c), c]);
  for (const sgn of [-1, 1]) {
    const e0 = pt(sgn * c1, -along), e1 = pt(sgn * c1, along), r1 = pt(0, along), r0 = pt(0, -along);
    qd(b, 'roof_tile_clay', e0, e1, r1, r0, [0, 1, 0], { col: tint });
    const dn = (p) => [p[0], p[1] - th, p[2]];
    qd(b, 'plaster_a', dn(e0), dn(e1), dn(r1), dn(r0), [0, -1, 0], { col: mulc(lin(0xcfc6b4), 0.7) });
    // eave fascia
    qd(b, 'plaster_a', e0, e1, dn(e1), dn(e0), g.ridgeZ ? [sgn, 0, 0] : [0, 0, sgn], { col: mulc(fs.trim, 0.9) });
  }
  // gable-end barge boards (the two slopes' end edges)
  for (const a of [-along, along]) for (const sgn of [-1, 1]) {
    const e = pt(sgn * c1, a), r = pt(0, a), dn = (p) => [p[0], p[1] - th, p[2]];
    qd(b, 'plaster_a', e, r, dn(r), dn(e), g.ridgeZ ? [0, 0, Math.sign(a)] : [Math.sign(a), 0, 0], { col: mulc(fs.trim, 0.9) });
  }
  // ridge cap
  const r0 = pt(0, -along), r1 = pt(0, along);
  bar(G.b, 'roof_tile_clay', [r0[0], r0[1] + 0.06, r0[2]], [r1[0], r1[1] + 0.06, r1[2]], 0.34, 0.12, { col: mulc(tint, 0.8), caps: true });
}

/** Unfinished top: columns, beams stubs and sprouting rebar; the open deck itself is drawn by the floors pass. */
function unfinishedTop(G) {
  const { S, b, rm } = G, O = S.outer, yk = S.openTop ? (S.F - 1) * S.fh : S.F * S.fh, yF = rm.yF;
  const cs = 0.3, hx = O.x1 - cs / 2, hz = O.z1 - cs / 2;
  const xs = [-hx, hx], zs = [-hz, hz];
  const nx = Math.max(0, Math.ceil((2 * hx) / 3.6) - 1), nz = Math.max(0, Math.ceil((2 * hz) / 3.6) - 1);
  const px = [...xs];
  for (let i = 1; i <= nx; i++) px.push(-hx + (2 * hx * i) / (nx + 1));
  const pts = [];
  for (const x of px) for (const z of zs) pts.push([x, z]);
  for (let i = 1; i <= nz; i++) for (const x of xs) pts.push([x, -hz + (2 * hz * i) / (nz + 1)]);
  const colH = S.openTop ? 2.55 : 0.0;
  for (const [x, z] of pts) {
    if (colH > 0) box(G, 'concrete_formwork', x, yk + colH / 2, z, cs, colH, cs, [0.95, 0.95, 0.93]);
    const top = yk + colH;
    for (const [dx, dz] of [[-0.09, -0.09], [0.09, -0.09], [0.09, 0.09], [-0.09, 0.09]]) {
      const hgt = 0.55 + 0.5 * hash01(G.bp.id + ':' + x.toFixed(1) + z.toFixed(1), Math.round(dx * 100 + dz * 10));
      box(G, 'rebar_rust', x + dx, top + hgt / 2, z + dz, 0.014, hgt, 0.014, null, ['ny']);
    }
  }
  if (S.openTop) {
    // pretil cap (top of the brick parapet, PRETIL_H) and a stub beam across the front
    const t = S.te, ct = 0.04;
    box(G, 'concrete_bare', 0, yk + PRETIL_H + ct / 2, O.z1 - t / 2, S.W, ct, t + 0.04, [0.93, 0.93, 0.9]);
    box(G, 'concrete_bare', 0, yk + PRETIL_H + ct / 2, O.z0 + t / 2, S.W, ct, t + 0.04, [0.93, 0.93, 0.9]);
    box(G, 'concrete_bare', O.x0 + t / 2, yk + PRETIL_H + ct / 2, 0, t + 0.04, ct, S.D - 2 * t, [0.93, 0.93, 0.9]);
    box(G, 'concrete_bare', O.x1 - t / 2, yk + PRETIL_H + ct / 2, 0, t + 0.04, ct, S.D - 2 * t, [0.93, 0.93, 0.9]);
    box(G, 'concrete_formwork', 0, yk + 2.55 - 0.14, O.z1 - cs / 2, S.W - cs, 0.28, cs * 0.9, [0.95, 0.95, 0.93]);
  } else {
    flat(b, 'concrete_bare', S.inner.x0, S.inner.z0, S.inner.x1, S.inner.z1, yF, true, { col: [0.95, 0.95, 0.93] });
  }
}

export function buildRoof(G) {
  const { rm } = G;
  if (rm.style === 'terrace') terraceRoof(G);
  else if (rm.style === 'corrugated') monoRoof(G);
  else if (rm.style === 'tile') tileRoof(G);
  else unfinishedTop(G);
}

export { CASETA_T };
