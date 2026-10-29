// Stair meshes (the dogleg core of stairs.js): treads, risers, soffits, half landings, divider, nook panel, handrails, and the balustrades
// of every guard in the plan. Colliders are floor ramps (colliders.js); these meshes only have to agree with them to within a few cm.
import { STAIR } from './stairs.js';
import { lin, mulc, qd, bar, hash01 } from './mb.js';

const SOFFIT = 0.19;                                           // thickness of the stair waist below the nosing line

export function buildStairs(G) {
  const { S, b, fs } = G, c = S.core;
  if (c) stairCore(G, c);
  for (const g of S.guards) balustrade(G, g);
  void fs;
}

function stairCore(G, c) {
  const { S, b } = G;
  const { FW, DIV, LH } = STAIR, { nh, rise, run, lfl, across } = c, fh = S.fh;
  const uB = FW + DIV, P = c.P, Sx = c.S[0], Sz = c.S[1];
  const up = [0, 1, 0], dn = [0, -1, 0];
  const treadCol = [0.92, 0.9, 0.86], riserCol = [0.8, 0.78, 0.74], soffitCol = lin(0xe9e4d6);
  const pt = (u, s, y) => { const p = P(u, s); return [p[0], y, p[1]]; };
  const wantS = [Sx, 0, Sz], wantNS = [-Sx, 0, -Sz];
  for (let t = 0; t < c.nUp; t++) {
    const yb = t * fh, yh = yb + nh * rise;
    // ---- lane A: from the landing (s=0) up to the half landing (s=lfl)
    for (let j = 0; j < nh; j++) {
      const s0 = j * run;
      qd(b, 'cement_screed', pt(0, s0, yb + j * rise), pt(FW, s0, yb + j * rise), pt(FW, s0, yb + (j + 1) * rise), pt(0, s0, yb + (j + 1) * rise), wantNS, { col: riserCol });
      if (j < nh - 1) qd(b, 'cement_screed', pt(0, s0, yb + (j + 1) * rise), pt(FW, s0, yb + (j + 1) * rise), pt(FW, s0 + run, yb + (j + 1) * rise), pt(0, s0 + run, yb + (j + 1) * rise), up, { col: treadCol });
    }
    qd(b, 'plaster_a', pt(0, 0, yb + rise - SOFFIT), pt(FW, 0, yb + rise - SOFFIT), pt(FW, lfl, yh - SOFFIT), pt(0, lfl, yh - SOFFIT), dn, { col: soffitCol });
    // ---- lane B: from the half landing back toward the landing, arriving on the next floor
    for (let j = 0; j < nh; j++) {
      const s1 = lfl - j * run;
      qd(b, 'cement_screed', pt(uB, s1, yh + j * rise), pt(c.across, s1, yh + j * rise), pt(c.across, s1, yh + (j + 1) * rise), pt(uB, s1, yh + (j + 1) * rise), wantS, { col: riserCol });
      if (j < nh - 1) qd(b, 'cement_screed', pt(uB, s1 - run, yh + (j + 1) * rise), pt(c.across, s1 - run, yh + (j + 1) * rise), pt(c.across, s1, yh + (j + 1) * rise), pt(uB, s1, yh + (j + 1) * rise), up, { col: treadCol });
    }
    qd(b, 'plaster_a', pt(uB, lfl, yh + rise - SOFFIT), pt(c.across, lfl, yh + rise - SOFFIT), pt(c.across, 0, yb + fh - SOFFIT), pt(uB, 0, yb + fh - SOFFIT), dn, { col: soffitCol });
    // ---- half landing slab
    qd(b, 'cement_screed', pt(0, lfl, yh), pt(across, lfl, yh), pt(across, lfl + LH, yh), pt(0, lfl + LH, yh), up, { col: treadCol });
    qd(b, 'plaster_a', pt(0, lfl, yh - 0.2), pt(across, lfl, yh - 0.2), pt(across, lfl + LH, yh - 0.2), pt(0, lfl + LH, yh - 0.2), dn, { col: soffitCol });
    // ---- divider wall between the lanes
    const d0 = P(FW, 0), d1 = P(uB, lfl), top = yb + fh + (t === c.nUp - 1 ? 1.0 : 0);
    b.boxMinMax('plaster_a', Math.min(d0[0], d1[0]), yb, Math.min(d0[1], d1[1]), Math.max(d0[0], d1[0]), top, Math.max(d0[1], d1[1]), { col: lin(0xe6dfd0) });
    // ---- handrails (wall side and divider side) 0.9 m above the nosing line
    const rcol = G.fs.metal;
    for (const [u, lane] of [[0.06, 'A'], [FW - 0.05, 'A'], [uB + 0.05, 'B'], [across - 0.06, 'B']]) {
      const y0 = lane === 'A' ? yb + rise : yh + rise, s0 = lane === 'A' ? 0 : lfl, s1 = lane === 'A' ? lfl : 0;
      const slope = rise / run;
      const a = pt(u, s0, y0 + 0.92), z = pt(u, s1, y0 + (nh - 1) * rise + 0.92);
      void slope;
      bar(b, 'rail_metal', a, z, 0.045, 0.045, { col: rcol, caps: true });
    }
  }
  // ground-floor nook under the first flight B: a plain panel closes it off (collider matches)
  if (c.nUp > 0) {
    const ys = fh - SOFFIT;
    qd(b, 'plaster_a', pt(uB, 0.02, 0), pt(across, 0.02, 0), pt(across, 0.02, ys), pt(uB, 0.02, ys), wantNS, { col: lin(0xd8d2c4) });
  }
}

/** Iron balustrade along a guard segment (rails + balusters). g = { p1:[x,z], p2:[x,z], y0, y1 } in local coordinates. */
function balustrade(G, g) {
  const { b } = G, col = G.fs.metal;
  const [x1, z1] = g.p1, [x2, z2] = g.p2, len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.1) return;
  const h = g.y1 - g.y0;
  const at = (s, y) => [x1 + ((x2 - x1) * s) / len, y, z1 + ((z2 - z1) * s) / len];
  bar(b, 'rail_metal', at(0, g.y1 - 0.03), at(len, g.y1 - 0.03), 0.05, 0.05, { col, caps: true });
  bar(b, 'rail_metal', at(0, g.y0 + 0.08), at(len, g.y0 + 0.08), 0.035, 0.035, { col, caps: true });
  const n = Math.max(2, Math.round(len / 0.12));
  for (let i = 0; i <= n; i++) {
    const s = (len * i) / n;
    bar(b, 'rail_metal', at(s, g.y0 + 0.08), at(s, g.y1 - 0.03), 0.018, 0.018, { col });
  }
  void h; void hash01; void mulc;
}
