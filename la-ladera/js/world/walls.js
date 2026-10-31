// Retaining walls, derived from the height field itself: along the edge of every street, stair, plaza and lot pad the ground
// beside the structure is compared with the structure's own level; where they differ by more than ~0.3 m the transition
// (a steep ramp in plan.heightAt) is hidden inside a wall "box" as thick as the ramp is wide: its face looks at the lower ground,
// its cap sits at the upper level. Fill edges (a drop beside the structure) also get an invisible guard collider.
// The height field still holds the ramp inside the box, so a walker could climb it and stand "inside" the wall: under the cap, looking out through the
// face (single-sided, culled from behind) at the lowered lattice's steep strip, the planar dirt stretched into vertical streaks (R1-D07). A face taller than
// FACE_DROP is therefore a physical wall as well: its face line from the low side and, for a cut, the cap's far edge from the hill above (the cap looks like
// ground, a walker would sink into it); fill edges already carry the guard at the structure's side. Ids stay 'guard' (navfit and discover.js treat them as solid).
// The ramp is as wide as the nominal band (BAND / PAD_BAND / PLAZA_BAND) where the field levels off inside it, and wider where two
// structures stand closer together than the slope between them allows (a plaza 1.8 m above a road 6 m lower): measured along the
// normal until the field stops falling steeply. A box only as thick as the band left the rest of such a ramp standing in front of the
// face as a steep strip of bare earth.
// The terrain mesh (a 0.5 m lattice, linear triangles) cannot step up a wall either: terrain.js lowers the nodes inside every box to
// the lower ground (wallNodes below) so no sliver of the ramp is drawn in front of the face, and this file lays a strip of earth over
// the one cell of ground that then climbs beside the cap.
// Group world.walls. Pure function of plan.heightAt, so it follows the plan whatever the layout does.
import { footprint, pointInPoly, polyDistPoint } from './geom.js';
import { tangents, quadOut } from './mk.js';
import { BAND, PAD_BAND, PLAZA_BAND } from './plan.js';
import { CELL, HALF, N as NODES } from './field.js';
import { CONFIG } from '../core/config.js';

const THRESH = 0.3;       // below this the band is just a gentle ramp
const GUARD_DROP = 0.7;   // drops above this get a collider along the edge
export const FACE_DROP = 1.2;    // a face this tall puts a walker's eye (1.65 m) under the cap if he can stand behind it: its box is closed to walkers on both sides
const FILL_GAP = 0.7;    // guard lines this close shut the channel between them: a walker's zone is 0.4 m each side of a line (t 0.1 + radius 0.3)
const RAMP_GRAD = 0.6;   // the field is still a ramp where it falls (or rises) faster than this per metre
const RAMP_MAX = 5;       // never read a ramp wider than this: past it the ground is just a steep hill
// A guard line must not be jumped or walked over. physics.js lets a wall block a walker whose feet are more than WALL_CLEAR under its top; a jump lifts the feet JUMP_RISE (0.66 m: the apex, which a
// walker slow enough is at over the line when it starts within APEX_AT of it) and, at a sprint, flies JUMP_REACH (3.67 m). So a line stands WALL_CLEAR + GUARD_SLACK above the highest feet a jump can have over
// it from any ground within that reach: GUARD_UP above flat ground, and higher where the ground beside the box is higher than the box's own two edges (a lot's plinth, the hill beyond a cap) (guardTop).
const WALL_CLEAR = 0.4, GUARD_SLACK = 0.34;
const JUMP_RISE = (CONFIG.PLAYER.jump * CONFIG.PLAYER.jump) / (2 * CONFIG.PLAYER.gravity);
const JUMP_REACH = (2 * CONFIG.PLAYER.jump * CONFIG.PLAYER.sprint) / CONFIG.PLAYER.gravity;
const APEX_AT = (CONFIG.PLAYER.sprint * CONFIG.PLAYER.jump) / CONFIG.PLAYER.gravity;
const GUARD_UP = JUMP_RISE + WALL_CLEAR + GUARD_SLACK;
// The earth beside a wall is the hillside's own dirt, tinted as terrain.js colour() tints it (the terracotta map pulled toward a dusty tan: a vertex colour is a plain multiplier, so
// green and blue sit above 1): the strip, the cap and the bank round a corner then run on into the terrain without a seam (R1-D10, D16: the old dark red earth beside a grey slab read as a wedge of fill).
export const EARTH = [0.92, 1.26, 1.46];
const COPING = 0.18, COPING_H = 0.07;   // the narrow concrete lip along a face line, and how far it stands above the cap
// What a face is built of: rubble, board-marked concrete, hollow brick. Never a plain sand-coloured plaster: a smooth beige slab under a cap that follows the ground read as an
// unfinished wedge of fill beside the street (R1-D10, D16).
export const FACE_MATS_TALL = ['stone_wall', 'stone_wall', 'concrete_formwork'];
export const FACE_MATS = ['stone_wall', 'concrete_formwork', 'brick_clay_hollow', 'concrete_formwork', 'stone_wall', 'stone_wall'];

/** Width of the ramp beside an edge point, along its outward normal: the band `B`, or as far as the field keeps changing faster than RAMP_GRAD. */
export function rampWidth(H, x, z, nx, nz, B) {
  const h = (u) => H(x + nx * u, z + nz * u);
  let w = B;
  for (let u = B; u < RAMP_MAX; u += 0.1) {
    if (Math.abs(h(u + 0.2) - h(u)) < 0.2 * RAMP_GRAD) break;
    w = u + 0.1;
  }
  return w;
}

/**
 * Every retaining-wall run of the plan, in scan order: { S: samples {x, z, nx, nz, W (ramp width), inner, outer}, sign (+1 cut: the ground rises behind the
 * wall, -1 fill), B (nominal band), tall, src }. Pure: reads plan.heightAt and the plan's shapes.
 */
export function findWallRuns(plan) {
  const H = plan.heightAt, runs = [], lotFps = plan.lots.map((l) => footprint(l, 0.05));
  let src = 'street';                                                    // which kind of edge the current scan walks: street | stair | plaza:<id> | pad

  /** pts = [[x,z,nx,nz],...] along one boundary (n = outward unit normal). */
  const scan = (pts, B, skipFn) => {
    const S = pts.map(([x, z, nx, nz]) => {
      const W = rampWidth(H, x, z, nx, nz, B);
      return { x, z, nx, nz, W, inner: H(x - nx * 0.12, z - nz * 0.12), outer: H(x + nx * (W + 0.12), z + nz * (W + 0.12)) };
    });
    const act = S.map((s) => Math.abs(s.outer - s.inner) >= THRESH && !(skipFn && skipFn(s)));
    const sg = (s) => (s.outer > s.inner ? 1 : -1);
    for (let i = 0; i < S.length;) {
      if (!act[i]) { i++; continue; }
      const sign = sg(S[i]); let j = i;
      while (j + 1 < S.length && act[j + 1] && sg(S[j + 1]) === sign) j++;
      const part = S.slice(Math.max(0, i - 1), Math.min(S.length, j + 2)).map((s) => ({ ...s }));
      const wide = part.map((s, k) => Math.max(part[k - 1]?.W ?? 0, s.W, part[k + 1]?.W ?? 0));          // a box never thinner than a neighbour's ramp
      part.forEach((s, k) => { s.W = wide[k]; });
      runs.push({ S: part, sign, B, tall: part.reduce((m, s) => Math.max(m, Math.abs(s.outer - s.inner)), 0), src });
      i = j + 1;
    }
  };

  // ---- street and stair sides, and open ends
  for (const st of plan.streets) {
    const d = st._d, hw = st.width / 2, B = BAND[st.kind] ?? 0.5, T = tangents(d.pts);
    src = st.kind === 'stair' ? 'stair' : 'street';
    for (const side of [-1, 1]) {
      scan(d.pts.map((p, k) => { const nx = -T[k][1] * side, nz = T[k][0] * side; return [p[0] + nx * hw, p[1] + nz * hw, nx, nz]; }), B);
    }
    for (const end of [0, 1]) {
      const k = end === 0 ? 0 : d.pts.length - 1, p = d.pts[k], sgn = end === 0 ? -1 : 1, tx = T[k][0] * sgn, tz = T[k][1] * sgn;
      if (plan.streets.some((o) => o !== st && o.kind !== 'stair' && st.kind !== 'stair' && distToStreet(o, p) <= o.width / 2 + 0.6)) continue;
      if (plan.plazas.some((pl) => pointInPoly(pl.poly, p[0] + tx * 0.5, p[1] + tz * 0.5))) continue;
      const pts = []; for (let u = -hw; u <= hw + 1e-6; u += 0.5) pts.push([p[0] - T[k][1] * u, p[1] + T[k][0] * u, tx, tz]);
      scan(pts, B);
    }
  }
  // ---- plazas
  for (const pl of plan.plazas) { src = 'plaza:' + pl.id; scanPoly(pl.poly, PLAZA_BAND, scan); }
  // ---- lot pads (the +0.3 m margin of the plinth rule); no wall where another lot is
  src = 'pad';
  plan.lots.forEach((l, i) => {
    scanPoly(footprint(l, 0.3), PAD_BAND, scan, (s) => lotFps.some((f, j) => j !== i && (pointInPoly(f, s.x, s.z) || pointInPoly(f, s.x + s.nx * 0.8, s.z + s.nz * 0.8))));
  });
  return runs;
}

const dirOf = (a, b) => { const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return [(b.x - a.x) / l, (b.z - a.z) / l]; };

/**
 * Convex corners where two runs of one outline meet (a pad or plaza corner, the end of a street beside its side): each run's box stops at the corner and the
 * square of ramp beside it belongs to neither. { sign, A, B: the two end samples (their normals, widths and levels), runA, runB }.
 */
export function findCorners(runs) {
  const ends = [];
  for (const r of runs) {
    const n = r.S.length;
    if (n >= 2) ends.push({ r, s: r.S[n - 1], out: dirOf(r.S[n - 2], r.S[n - 1]) }, { r, s: r.S[0], out: dirOf(r.S[1], r.S[0]) });
  }
  const corners = [], taken = new Set();
  ends.forEach((A, ia) => {
    if (taken.has(ia)) return;
    for (let ib = ia + 1; ib < ends.length; ib++) {
      const B = ends[ib];
      if (taken.has(ib) || A.r === B.r || A.r.sign !== B.r.sign || Math.hypot(A.s.x - B.s.x, A.s.z - B.s.z) > 0.05) continue;
      if (Math.abs(A.s.nx * B.s.nz - A.s.nz * B.s.nx) < 0.3) continue;                                  // a bend, not a corner
      const qx = A.s.x + (A.s.nx * A.s.W + B.s.nx * B.s.W) / 2, qz = A.s.z + (A.s.nz * A.s.W + B.s.nz * B.s.W) / 2;
      const beyond = (E) => (qx - E.s.x) * E.out[0] + (qz - E.s.z) * E.out[1] > 0;
      if (!beyond(A) || !beyond(B)) continue;                                                            // a concave corner: the two boxes overlap there
      taken.add(ia); taken.add(ib);
      corners.push({ sign: A.r.sign, A: A.s, B: B.s, runA: A.r, runB: B.r });
      break;
    }
  });
  return corners;
}

/** The parallelogram of ground behind (cut) or outside (fill) a convex corner: C the corner, P1 along A's normal, P3 along B's, P2 the far corner; its cap level and the lower ground. */
export function cornerShape(c) {
  const a = c.A, b = c.B, cut = c.sign > 0;
  const C = [a.x, a.z], P1 = [a.x + a.nx * a.W, a.z + a.nz * a.W], P3 = [a.x + b.nx * b.W, a.z + b.nz * b.W], P2 = [P1[0] + b.nx * b.W, P1[1] + b.nz * b.W];
  const top = (cut ? Math.max(a.outer, b.outer) : Math.max(a.inner, b.inner)) + 0.02, low = cut ? Math.min(a.inner, b.inner) : Math.min(a.outer, b.outer);
  return { C, P1, P2, P3, top, low, bot: low - 0.25 };
}

/**
 * The lattice nodes (i, j, x, z) of the terrain mesh that lie inside a wall box, with the ground level that belongs to them: the LOWER of the two grounds
 * the wall separates. Lowering those nodes keeps the mesh flat at the foot of every face; left at the height field's own values they slope up the ramp
 * and a wedge of earth stands in front of the face (the "mulch cones" the reviewers saw along every wall).
 */
export function wallNodes(runs, corners, N, HALF, visit) {
  for (const c of corners) {
    const { C, P1, P2, P3, low } = cornerShape(c), a = c.A, b = c.B, det = a.nx * b.nz - a.nz * b.nx;
    const xs = [C[0], P1[0], P2[0], P3[0]], zs = [C[1], P1[1], P2[1], P3[1]];
    const i0 = Math.max(0, Math.floor((Math.min(...xs) + HALF) / CELL)), i1 = Math.min(N - 1, Math.ceil((Math.max(...xs) + HALF) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(...zs) + HALF) / CELL)), j1 = Math.min(N - 1, Math.ceil((Math.max(...zs) + HALF) / CELL));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const dx = -HALF + ii * CELL - C[0], dz = -HALF + j * CELL - C[1];
      const u = (dx * b.nz - dz * b.nx) / det, v = (a.nx * dz - a.nz * dx) / det;
      if (u >= -0.01 && u <= a.W + 0.01 && v >= -0.01 && v <= b.W + 0.01) visit(j * N + ii, low);
    }
  }
  for (const run of runs) {
    const { S, sign } = run, low = (s) => (sign > 0 ? s.inner : s.outer);
    for (let i = 0; i + 1 < S.length; i++) {
      const p = S[i], q = S[i + 1], tx = q.x - p.x, tz = q.z - p.z, len = Math.hypot(tx, tz);
      if (len < 1e-6) continue;
      const ux = tx / len, uz = tz / len;
      let nx = p.nx + q.nx, nz = p.nz + q.nz; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      const reach = Math.max(p.W, q.W) + CELL, xs = [p.x, q.x, p.x + nx * reach, q.x + nx * reach], zs = [p.z, q.z, p.z + nz * reach, q.z + nz * reach];
      const i0 = Math.max(0, Math.floor((Math.min(...xs) + HALF) / CELL)), i1 = Math.min(N - 1, Math.ceil((Math.max(...xs) + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(...zs) + HALF) / CELL)), j1 = Math.min(N - 1, Math.ceil((Math.max(...zs) + HALF) / CELL));
      for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
        const x = -HALF + ii * CELL, z = -HALF + j * CELL, dx = x - p.x, dz = z - p.z;
        const t = (dx * ux + dz * uz) / len, u = dx * nx + dz * nz;
        if (t < -0.02 || t > 1.02 || u < -0.01 || u > p.W + (q.W - p.W) * Math.min(1, Math.max(0, t)) + 0.01) continue;
        visit(j * N + ii, low(p) + (low(q) - low(p)) * Math.min(1, Math.max(0, t)));
      }
    }
  }
}

/** How far a jump has lifted a walker's feet when it passes over a line `d` m from where it left the ground: the apex when it can be slow enough to be there, else the sprint's arc. */
function jumpRise(d) {
  if (d <= APEX_AT) return JUMP_RISE;
  const t = d / CONFIG.PLAYER.sprint;
  return Math.max(0, CONFIG.PLAYER.jump * t - 0.5 * CONFIG.PLAYER.gravity * t * t);
}

/**
 * The top of the guard lines inside the box `poly` ([[x, z], ...]): WALL_CLEAR + GUARD_SLACK above the highest feet a jump can have over them, from any ground within JUMP_REACH of the box (the ground
 * there plus the jump's lift at that distance). The samples are the field's lattice nodes: it is bilinear between them, so the ground at any point is no higher than its four nodes. Each node counts
 * with the lift of the point nearest the box in its cell (the lift only falls with distance), and the nodes a cell's width beyond the reach count too, for the ground inside the reach beside them.
 * `nodeH(x, z)` = H at a lattice node (a memo: neighbouring stretches read the same ones); a node that cannot beat the top found so far, even with the highest lift, is not measured.
 */
export function guardTop(H, poly, nodeH = H) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const cell = CELL * Math.SQRT2, reach = JUMP_REACH + cell;                 // a node is at most this far from any point of the cells it bounds
  for (const [x, z] of poly) top = Math.max(top, H(x, z) + JUMP_RISE);       // the box's own corners seed the top: most nodes then lose at once
  const i0 = Math.ceil((x0 - reach + HALF) / CELL), i1 = Math.floor((x1 + reach + HALF) / CELL);
  const j0 = Math.ceil((z0 - reach + HALF) / CELL), j1 = Math.floor((z1 + reach + HALF) / CELL);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const x = -HALF + i * CELL, z = -HALF + j * CELL, h = nodeH(x, z);
      if (h + JUMP_RISE <= top) continue;
      const d = polyDistPoint(poly, x, z);
      if (d <= reach) top = Math.max(top, h + jumpRise(Math.max(0, d - cell)));
    }
  }
  return top + WALL_CLEAR + GUARD_SLACK;
}

export function buildRetaining(ctx, plan, runs = findWallRuns(plan), corners = findCorners(runs)) {
  const H = plan.heightAt, b = ctx.batch.builder('world.walls'), phys = ctx.physics, rnd = ctx.rng.fork('world:walls');
  const stats = { runs: 0, metres: 0, guards: 0, faces: 0, fills: 0, corners: corners.length }, look = new Map();
  const memo = new Float32Array(NODES * NODES).fill(NaN);              // the height at each lattice node, read once (guardTop: a stretch reads some 400, its neighbour mostly the same)
  const nodeH = (x, z) => {
    const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
    if (i < 0 || j < 0 || i >= NODES || j >= NODES) return H(x, z);
    const k = j * NODES + i; let v = memo[k];
    if (v !== v) memo[k] = v = H(x, z);
    return v;
  };

  for (const run of runs) {
    const { S, sign, tall, src } = run;
    const mat = rnd.pick(tall > 2.2 ? FACE_MATS_TALL : FACE_MATS), k = 0.9 + rnd.next() * 0.2, col = [k, k, k];
    look.set(run, { mat, col });
    for (let i = 0; i + 1 < S.length; i++) {
      const p = S[i], q = S[i + 1];
      const f = (s) => (sign > 0 ? 0 : s.W);                          // face line offset from the edge
      const top = (s) => (sign > 0 ? s.outer : s.inner) + 0.02, bot = (s) => (sign > 0 ? s.inner : s.outer) - 0.25;
      const at = (s, d, y) => [s.x + s.nx * d, y, s.z + s.nz * d];
      const F = (s, y) => at(s, f(s), y), E = (s, y) => at(s, 0, y), G = (s, y) => at(s, s.W, y);
      const ctr = [(p.x + q.x) / 2 + (p.nx * p.W + q.nx * q.W) / 4, (top(p) + top(q) + bot(p) + bot(q)) / 4, (p.z + q.z) / 2 + (p.nz * p.W + q.nz * q.W) / 4];
      quadOut(b, mat, F(p, bot(p)), F(q, bot(q)), F(q, top(q)), F(p, top(p)), ctr, { col });
      // the cap is the ground on top of the box (the pad's, or the hill's above a cut): earth, running on into the terrain; the concrete is a narrow coping on the face line
      quadOut(b, 'ground_dirt', E(p, top(p)), E(q, top(q)), G(q, top(q)), G(p, top(p)), [ctr[0], ctr[1] - 5, ctr[2]], { col: EARTH });
      const onto = (s) => (sign > 0 ? [s.nx, s.nz] : [-s.nx, -s.nz]);                    // from the face line onto the cap
      coping(b, F(p, top(p)), F(q, top(q)), onto(p), onto(q), col);
      // one cell of earth beside the cap, where the lowered lattice climbs back to the ground (cut: behind the wall; fill beside a lot: on the pad side)
      const strip = (d0, d1) => {
        const y1 = (s) => H(s.x + s.nx * d1(s), s.z + s.nz * d1(s)) + 0.015;
        const P = [at(p, d0(p), top(p)), at(q, d0(q), top(q)), at(q, d1(q), y1(q)), at(p, d1(p), y1(p))];
        quadOut(b, 'ground_dirt', P[0], P[1], P[2], P[3], [ctr[0], ctr[1] - 5, ctr[2]], { col: EARTH, uv: P.flatMap((v) => [v[0], v[2]]) });
      };
      if (sign > 0) strip((s) => s.W, (s) => s.W + CELL);
      else if (src === 'pad') strip(() => 0, () => -CELL);
      let gTop = null;                                                  // the guards' top over this stretch, worked out once a line of it needs it
      const guardY1 = () => (gTop ??= Math.max(guardTop(H, [[p.x, p.z], [q.x, q.z], [q.x + q.nx * q.W, q.z + q.nz * q.W], [p.x + p.nx * p.W, p.z + p.nz * p.W]], nodeH), Math.max(p.inner, p.outer, q.inner, q.outer) + GUARD_UP));
      if (sign < 0 && p.inner - p.outer > GUARD_DROP && q.inner - q.outer > GUARD_DROP) {
        phys.addWall({ x1: p.x + p.nx * 0.1, z1: p.z + p.nz * 0.1, x2: q.x + q.nx * 0.1, z2: q.z + q.nz * 0.1, t: 0.1, y0: Math.min(p.outer, q.outer) - 1, y1: guardY1(), id: 'guard' });
        stats.guards++;
      }
      if (tall >= FACE_DROP && Math.abs(p.outer - p.inner) >= FACE_DROP / 2 && Math.abs(q.outer - q.inner) >= FACE_DROP / 2) {     // the run's tall stretch and the lower ramp that leads into it: no open end to slip in by
        const y0 = Math.min(p.inner, p.outer, q.inner, q.outer) - 1, y1 = guardY1();
        const line = (d) => phys.addWall({ x1: p.x + p.nx * d(p), z1: p.z + p.nz * d(p), x2: q.x + q.nx * d(q), z2: q.z + q.nz * d(q), t: 0.1, y0, y1, id: 'guard' });
        line(sign > 0 ? () => 0.1 : (s) => s.W - 0.1);              // the face, just behind it (the wall's solid side): nobody climbs the ramp into the box
        if (sign > 0) line((s) => s.W - 0.1);                       // a cut: and nobody walks down off the hill onto the cap and into the ramp under it
        const room = (s) => Math.max(0, s.W - 0.2), n = Math.max(0, Math.ceil(Math.min(room(p), room(q)) / FILL_GAP) - 1);   // a box wider than a walker leaves a channel between the two lines:
        for (let k = 1; k <= n; k++) line((s) => 0.1 + room(s) * (k / (n + 1)));                                              // shut it with lines a walker's width apart, so no pocket is left to be dropped into
        stats.faces++; stats.fills += n;
      }
      stats.metres += Math.hypot(q.x - p.x, q.z - p.z);
    }
    stats.runs++;
  }
  // ---- corners: the cap over the square of ramp that neither neighbouring box covers, the two faces that close a fill box around it, and the earth that
  // hides the lattice climbing beyond a cut one
  for (const c of corners) {
    const { C, P1, P2, P3, top, bot } = cornerShape(c), la = look.get(c.runA), lb = look.get(c.runB);
    const V = (p, y) => [p[0], y, p[1]], mid = [(C[0] + P2[0]) / 2, (top + bot) / 2, (C[1] + P2[1]) / 2], under = [mid[0], mid[1] - 5, mid[2]];
    quadOut(b, 'ground_dirt', V(C, top), V(P1, top), V(P2, top), V(P3, top), under, { col: EARTH });
    if (Math.abs(c.A.outer - c.A.inner) >= FACE_DROP && Math.abs(c.B.outer - c.B.inner) >= FACE_DROP) {   // the two outer sides of the square, as for a run: the same closed box
      const y0 = Math.min(c.A.inner, c.A.outer, c.B.inner, c.B.outer) - 1, y1 = Math.max(guardTop(H, [C, P1, P2, P3], nodeH), Math.max(c.A.inner, c.A.outer, c.B.inner, c.B.outer) + GUARD_UP);
      const side = (P, Q, n) => phys.addWall({ x1: P[0] - n[0] * 0.1, z1: P[1] - n[1] * 0.1, x2: Q[0] - n[0] * 0.1, z2: Q[1] - n[1] * 0.1, t: 0.1, y0, y1, id: 'guard' });
      side(P1, P2, [c.A.nx, c.A.nz]); side(P3, P2, [c.B.nx, c.B.nz]);
      stats.faces += 2;
    }
    if (c.sign < 0) {
      quadOut(b, la.mat, V(P1, bot), V(P2, bot), V(P2, top), V(P1, top), mid, { col: la.col });
      quadOut(b, lb.mat, V(P3, bot), V(P2, bot), V(P2, top), V(P3, top), mid, { col: lb.col });
      coping(b, V(P1, top), V(P2, top), [-c.A.nx, -c.A.nz], [-c.A.nx, -c.A.nz], la.col);    // the two faces carry the lip on, back toward the corner
      coping(b, V(P3, top), V(P2, top), [-c.B.nx, -c.B.nz], [-c.B.nx, -c.B.nz], lb.col);
    } else {
      const out = (p, n) => [p[0] + n[0] * CELL, p[1] + n[1] * CELL], nA = [c.A.nx, c.A.nz], nB = [c.B.nx, c.B.nz], ground = (p) => V(p, H(p[0], p[1]) + 0.015);
      const earth = (...P) => quadOut(b, 'ground_dirt', P[0], P[1], P[2], P[3], under, { col: EARTH, uv: P.flatMap((v) => [v[0], v[2]]) });
      earth(V(P1, top), V(P2, top), ground(out(P2, nA)), ground(out(P1, nA)));
      earth(V(P3, top), V(P2, top), ground(out(P2, nB)), ground(out(P3, nB)));
      earth(V(P2, top), ground(out(P2, nA)), ground(out(out(P2, nA), nB)), ground(out(P2, nB)));
    }
  }
  ctx.batch.flush('world.walls');
  if (ctx.world) { ctx.world.walls = stats; ctx.world.wallRuns = runs; ctx.world.wallCorners = corners; }
}

/**
 * The coping: a narrow concrete lip along a face line, COPING wide and COPING_H above the cap. `a`, `c` = the 3D ends of the face line at the cap level, `da`, `dc` = the unit [x, z]
 * pointing from the line onto the cap at each end. Two faces: the top and the face side (the cap side is a step of COPING_H that no one looks at, and each face costs a pair of
 * triangles per 0.7 m of wall, about 2 800 m of it); the ends stay open, since the next lip starts where this one stops.
 */
function coping(b, a, c, da, dc, col) {
  const a1 = [a[0] + da[0] * COPING, a[1], a[2] + da[1] * COPING], c1 = [c[0] + dc[0] * COPING, c[1], c[2] + dc[1] * COPING];
  const up = (p) => [p[0], p[1] + COPING_H, p[2]], mid = [(a[0] + c[0] + a1[0] + c1[0]) / 4, (a[1] + c[1]) / 2 + COPING_H / 2, (a[2] + c[2] + a1[2] + c1[2]) / 4];
  quadOut(b, 'concrete_bare', up(a), up(c), up(c1), up(a1), mid, { col });
  quadOut(b, 'concrete_bare', a, c, up(c), up(a), mid, { col });
}

function distToStreet(o, p) {
  let m = Infinity;
  for (const q of o._d.pts) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < m) m = d; }
  return m;
}

/** Sample the edges of a convex polygon (outward normals), one scan per edge. */
function scanPoly(poly, B, scan, skipFn) {
  let cx = 0, cz = 0; for (const p of poly) { cx += p[0]; cz += p[1]; } cx /= poly.length; cz /= poly.length;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]), n = Math.max(1, Math.ceil(l / 0.7));
    let nx = -(c[1] - a[1]) / l, nz = (c[0] - a[0]) / l;
    if (nx * ((a[0] + c[0]) / 2 - cx) + nz * ((a[1] + c[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    const pts = []; for (let k = 0; k <= n; k++) pts.push([a[0] + ((c[0] - a[0]) * k) / n, a[1] + ((c[1] - a[1]) * k) / n, nx, nz]);
    scan(pts, B, skipFn);
  }
}
