// Utility poles with crossarms, transformers and tangled cable runs, service drops to the facades, cables and laundry lines across
// the alleys, street lamps (pole arms, iron lanterns in alleys, globe posts in the plazas). Real lights go to ctx.lights (kind 'street').
// Groups: props.poles.<i>.<j>, props.wires, props.laundry, props.lamps.
import { tube, V } from './mk.js';
import { OCC } from './occupancy.js';
import { pointAt, footprint, pointInPoly, segDist } from './geom.js';

const POLE_H = 8.6;
const WIRE = 'wire_dark';

/** Droopy cable between two points: parabola sag, drawn as two crossed ribbons (double-sided material) so it reads from any side. */
export function wire(b, a, c, sag, w = 0.03, segs) {
  const L = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]), n = segs ?? Math.max(3, Math.min(14, Math.ceil(L / 2.2)));
  const pt = (t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (c[2] - a[2]) * t];
  const dx = c[0] - a[0], dz = c[2] - a[2], hl = Math.hypot(dx, dz) || 1, sx = -dz / hl * w / 2, sz = dx / hl * w / 2;
  for (let i = 0; i < n; i++) {
    const p = pt(i / n), q = pt((i + 1) / n);
    b.quad(WIRE, [p[0] - sx, p[1], p[2] - sz], [p[0] + sx, p[1], p[2] + sz], [q[0] + sx, q[1], q[2] + sz], [q[0] - sx, q[1], q[2] - sz], { uv: [0, 0, 1, 0, 1, 1, 0, 1] });
    b.quad(WIRE, [p[0], p[1] - w / 2, p[2]], [p[0], p[1] + w / 2, p[2]], [q[0], q[1] + w / 2, q[2]], [q[0], q[1] - w / 2, q[2]], { uv: [0, 0, 1, 0, 1, 1, 0, 1] });
  }
}

const lotTopOf = (K, lot) => K.ctx.buildings?.get?.(lot.id)?.bounds?.y1 ?? lot.y + lot.floors * (lot.fh ?? 2.8) + 0.6;

export function buildPoles(K) {
  const { plan, occ, ctx, H } = K, R = K.rng('poles');
  const lotFps = plan.lots.map((l) => ({ lot: l, poly: footprint(l, 0) }));
  const lotAt = (x, z) => { for (const f of lotFps) if (pointInPoly(f.poly, x, z)) return f.lot; return null; };
  const poles = [], stats = { poles: 0, spans: 0, drops: 0, lamps: 0, lanterns: 0, alleyWires: 0, laundry: 0, transformers: 0 };
  const lampBuilder = K.one('lamps', { cast: false }), wires = K.one('wires', { cast: false });

  const busStop = plan.pois.filter((q) => (q.tags ?? []).includes('busstop'));
  // ---- 1. pole positions along roads and streets
  for (const st of plan.streets.filter((s) => s.kind === 'road' || s.kind === 'street')) {
    const hw = st.width / 2, d = st._d, L = st.len, off = hw - 0.72;
    let s = 6 + R.range(0, 6), side = R.chance(0.5) ? 1 : -1, idx = 0;
    while (s < L - 4) {
      let placed = false;
      for (const dsh of [0, 1.6, -1.6, 3.2, -3.2, 4.8]) {
        const q = pointAt(d.pts, d.cum, Math.min(L - 1, Math.max(1, s + dsh)));
        for (const sd of [side, -side]) {
          const nx = -q.tz * sd, nz = q.tx * sd, x = q.x + nx * off, z = q.z + nz * off;
          if (!occ.clear(x, z, 0, OCC.LOT | OCC.STAIR | OCC.PLAZA) || !occ.clear(x, z, 0.5, OCC.DOOR | OCC.STAIR) || occ.slope(x, z) > 0.45) continue;
          if (poles.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue;
          if (busStop.some((q) => Math.hypot(q.x - x, q.z - z) < 6.5)) continue;                // the shelter and the parked buseta need this stretch
          poles.push({ x, z, gy: H(x, z), st, tx: q.tx, tz: q.tz, nx, nz, s: s + dsh, idx: idx++ });
          placed = true; side = -sd; break;
        }
        if (placed) break;
      }
      s += R.range(21, 27) * (placed ? 1 : 0.45);
    }
  }

  // ---- 2. pole + fittings
  poles.forEach((p, k) => {
    const b = K.b('poles', p.x, p.z), r = R.fork('pole' + k), top = p.gy + POLE_H;
    const col = (i) => [0.7 + 0.06 * ((i * 7) % 3), 0.69 + 0.05 * ((i * 5) % 3), 0.65];
    tube(b, 'concrete_bare', [p.x, p.gy - 0.3, p.z], [p.x, top, p.z], 0.135, 0.085, 8, { colFn: col });
    const ry = Math.atan2(-p.nz, p.nx);                       // arm runs across the street direction... along the normal
    const armY = top - 0.45;
    b.box('galvanised', p.x, armY, p.z, 1.7, 0.08, 0.1, { ry });
    b.box('galvanised', p.x, armY - 0.55, p.z, 0.08, 0.08, 0.7, { ry });          // diagonal-ish stay (reads as a brace)
    p.ins = [];
    for (const o of [-0.72, 0, 0.72]) {
      const ix = p.x + p.nx * o, iz = p.z + p.nz * o;
      b.cyl('insulator', ix, armY + 0.04, iz, 0.045, 0.2, 6, { r1: 0.025, col: [1, 1, 1] });
      p.ins.push([ix, armY + 0.26, iz]);
    }
    // lower telecom bracket
    const lowY = top - 2.1;
    b.box('galvanised', p.x, lowY, p.z, 1.0, 0.07, 0.07, { ry });
    p.low = [[p.x - p.nx * 0.42, lowY - 0.05, p.z - p.nz * 0.42], [p.x + p.nx * 0.42, lowY - 0.05, p.z + p.nz * 0.42]];
    // junction box + conduit
    b.box('iron_black', p.x + p.nx * 0.16, p.gy + 2.3, p.z + p.nz * 0.16, 0.26, 0.38, 0.14, { ry: ry + Math.PI / 2 });
    tube(b, 'iron_black', [p.x + p.nx * 0.13, p.gy + 2.5, p.z + p.nz * 0.13], [p.x + p.nx * 0.13, top - 0.7, p.z + p.nz * 0.13], 0.018, 0.018, 4, { caps: false });
    if (k % 3 === 1) {                                                                 // pole-top transformer
      const tx = p.x + p.nx * 0.42, tz = p.z + p.nz * 0.42;
      b.cyl('galvanised', tx, top - 2.2, tz, 0.27, 0.85, 10, { col: [0.78, 0.8, 0.8] });
      b.cyl('iron_black', tx, top - 1.35, tz, 0.2, 0.1, 8, { col: [0.3, 0.3, 0.32] });
      b.box('galvanised', p.x + p.nx * 0.2, top - 1.8, p.z + p.nz * 0.2, 0.55, 0.06, 0.06, { ry });
      stats.transformers++;
    }
    // flyers wrapped on the pole at eye height
    const fcols = [[0.95, 0.9, 0.5], [0.92, 0.92, 0.95], [0.9, 0.55, 0.5], [0.6, 0.8, 0.9]];
    for (let f = 0; f < 3; f++) {
      const a = r.range(0, 6.28), y = p.gy + r.range(1.2, 2.0), w = r.range(0.14, 0.22), h = r.range(0.2, 0.3), cx = p.x + Math.cos(a) * 0.14, cz = p.z + Math.sin(a) * 0.14;
      b.box('paper_flyer', cx, y, cz, w, h, 0.012, { ry: -a + Math.PI / 2, col: r.pick(fcols) });
    }
    K.post(p.x, p.z, 0.16, 4);
    occ.take(p.x, p.z, 0.4);
    stats.poles++;
    // street lamp on this pole
    if (p.st.lamps && k % 2 === 0) {
      const sx = -p.nx, sz = -p.nz;                                                     // arm points to the street centre line
      const ay = top - 1.15, hx = p.x + sx * 1.35, hz = p.z + sz * 1.35;
      tube(lampBuilder, 'iron_black', [p.x, ay - 0.3, p.z], [p.x + sx * 0.6, ay + 0.1, p.z + sz * 0.6], 0.04, 0.035, 5, { col: [0.25, 0.25, 0.28] });
      tube(lampBuilder, 'iron_black', [p.x + sx * 0.6, ay + 0.1, p.z + sz * 0.6], [hx, ay, hz], 0.035, 0.03, 5, { col: [0.25, 0.25, 0.28] });
      lampBuilder.box('iron_black', hx, ay - 0.06, hz, 0.62, 0.1, 0.26, { ry: Math.atan2(-sz, sx), skip: ['ny'] });
      lampBuilder.box('lamp_glow', hx, ay - 0.12, hz, 0.52, 0.02, 0.2, { ry: Math.atan2(-sz, sx), skip: ['py', 'px', 'nx', 'pz', 'nz'], col: [1, 1, 1] });
      ctx.lights.add({ x: hx, y: ay - 0.5, z: hz, color: 0xffc078, intensity: 18, distance: 15, kind: 'street' });
      stats.lamps++;
    }
  });

  // ---- 3. cable runs between consecutive poles (and to the nearest pole of another street at junctions)
  const linked = new Set(), link = (a, c) => {
    const key = a.x < c.x ? `${a.x},${a.z}|${c.x},${c.z}` : `${c.x},${c.z}|${a.x},${a.z}`;
    if (linked.has(key)) return; linked.add(key);
    const L = Math.hypot(a.x - c.x, a.z - c.z), b = wires, sag = Math.max(0.15, L * 0.016);
    for (let i = 0; i < 3; i++) wire(b, a.ins[i], c.ins[i], sag, 0.032);
    if (ctx.world) (ctx.world.cableSpans ??= []).push({ a: a.ins[1], c: c.ins[1], sag, L });      // the middle wire: pigeons sit on it (life.js)
    wire(b, a.low[0], c.low[0], sag * 1.5, 0.05); wire(b, a.low[1], c.low[1], sag * 1.7, 0.04);
    if (L > 10) wire(b, [a.low[0][0], a.low[0][1] - 0.35, a.low[0][2]], [c.low[1][0], c.low[1][1] - 0.5, c.low[1][2]], sag * 1.9, 0.026);   // a sagging dead cable
    stats.spans++;
  };
  for (const st of plan.streets) {
    const row = poles.filter((p) => p.st === st).sort((u, v) => u.s - v.s);
    for (let i = 0; i + 1 < row.length; i++) link(row[i], row[i + 1]);
  }
  for (const p of poles) {
    let best = null, bd = 28;
    for (const q of poles) { if (q.st === p.st) continue; const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < bd) { bd = d; best = q; } }
    if (best) link(p, best);
  }

  // ---- 4. service drops from the poles to the nearest facade
  poles.forEach((p, k) => {
    const r = R.fork('drop' + k), n = r.int(1, 3), used = new Set();
    for (let i = 0; i < n; i++) {
      let best = null, bd = 17;
      for (const f of lotFps) {
        if (used.has(f.lot.id)) continue;
        for (let e = 0; e < f.poly.length; e++) {
          const a = f.poly[e], c = f.poly[(e + 1) % f.poly.length], dd = segDist(p.x, p.z, a, c);
          if (dd < bd && dd > 2.0) { bd = dd; best = { lot: f.lot, a, c }; }
        }
      }
      if (!best) break;
      used.add(best.lot.id);
      const vx = best.c[0] - best.a[0], vz = best.c[1] - best.a[1], l2 = vx * vx + vz * vz || 1, u = Math.max(0.12, Math.min(0.88, ((p.x - best.a[0]) * vx + (p.z - best.a[1]) * vz) / l2));
      const hx = best.a[0] + vx * u, hz = best.a[1] + vz * u, hl = Math.sqrt(l2), ox = -vz / hl, oz = vx / hl;
      const sgn = (p.x - hx) * ox + (p.z - hz) * oz >= 0 ? 1 : -1, ax = hx + ox * sgn * 0.06, az = hz + oz * sgn * 0.06;
      const gy = H(hx, hz), top = lotTopOf(K, best.lot), ay = Math.min(p.gy + 6.4, Math.max(gy + 3.4, top - 0.7));
      if (top - gy < 3.6) continue;
      wire(wires, i % 2 ? p.low[0] : p.ins[1], [ax, ay, az], Math.max(0.12, bd * 0.018), 0.026);
      wires.box('iron_black', ax + ox * sgn * 0.02, ay, az + oz * sgn * 0.02, 0.1, 0.1, 0.14, { ry: Math.atan2(-oz * sgn, ox * sgn) });
      stats.drops++;
    }
  });

  // ---- 5. alleys: cable bundles and laundry lines from facade to facade; iron lanterns
  const laundry = K.one('laundry', { cast: false });
  const CLOTH = [[0.95, 0.95, 0.92], [0.8, 0.85, 0.95], [0.85, 0.25, 0.22], [0.92, 0.78, 0.25], [0.25, 0.3, 0.38], [0.35, 0.55, 0.8], [0.9, 0.55, 0.65], [0.2, 0.2, 0.22], [0.45, 0.7, 0.45], [0.9, 0.9, 0.55]];
  const hit = (x0, z0, dx, dz, maxD) => { for (let t = 0.3; t <= maxD; t += 0.1) { const lot = lotAt(x0 + dx * t, z0 + dz * t); if (lot) return { x: x0 + dx * t, z: z0 + dz * t, lot }; } return null; };
  for (const st of plan.streets.filter((s) => s.kind === 'alley' || s.kind === 'path' || s.kind === 'street')) {
    const hw = st.width / 2, d = st._d, L = st.len, r = R.fork('alley' + st.id), isAlley = st.kind === 'alley';
    for (let s = 3.5 + r.range(0, 2); s < L - 2; s += r.range(isAlley ? 5 : 11, isAlley ? 8.5 : 18)) {
      const q = pointAt(d.pts, d.cum, s), nx = -q.tz, nz = q.tx;
      const A = hit(q.x, q.z, nx, nz, hw + 2.4), B = hit(q.x, q.z, -nx, -nz, hw + 2.4);
      if (!A || !B || A.lot === B.lot) continue;
      const gy = H(q.x, q.z), top = Math.min(lotTopOf(K, A.lot), lotTopOf(K, B.lot)) - gy;
      if (top < 4.0) continue;
      const isLine = isAlley && r.chance(0.5), y = gy + (isLine ? r.range(3.1, 3.6) : Math.min(top - 0.7, r.range(4.3, 5.4)));
      const a = [A.x + nx * -0.0, y + r.range(-0.15, 0.15), A.z], c = [B.x, y + r.range(-0.15, 0.15), B.z];
      const off = (v, sgn) => [v[0] - nx * 0.05 * sgn, v[1], v[2] - nz * 0.05 * sgn];
      const pa = off(a, 1), pc = off(c, -1);
      if (isLine) {
        wire(laundry, pa, pc, 0.14, 0.014, 8);
        const len = Math.hypot(pc[0] - pa[0], pc[2] - pa[2]), m = Math.max(2, Math.floor(len / 0.75));
        for (let g = 0; g < m; g++) {
          if (!r.chance(0.78)) continue;
          const t = (g + 0.5) / m + r.range(-0.03, 0.03), x = pa[0] + (pc[0] - pa[0]) * t, z = pa[2] + (pc[2] - pa[2]) * t, yy = pa[1] + (pc[1] - pa[1]) * t - 4 * 0.14 * t * (1 - t);
          const w = r.range(0.32, 0.8), h = r.range(0.35, 0.95), col = r.pick(CLOTH), ry = Math.atan2(-(pc[2] - pa[2]), pc[0] - pa[0]);
          const hx = Math.cos(ry) * w / 2, hz = -Math.sin(ry) * w / 2, k = r.range(0.05, 0.1), bx = -Math.sin(ry) * k, bz = -Math.cos(ry) * k;
          laundry.quad('laundry', [x - hx, yy - h, z - hz], [x + bx, yy - h * 0.97, z + bz], [x, yy, z], [x - hx, yy, z - hz], { col, uv: [0, 0, 1, 0, 1, 1, 0, 1] });
          laundry.quad('laundry', [x + bx, yy - h * 0.97, z + bz], [x + hx, yy - h, z + hz], [x + hx, yy, z + hz], [x, yy, z], { col: [col[0] * 0.9, col[1] * 0.9, col[2] * 0.9], uv: [0, 0, 1, 0, 1, 1, 0, 1] });
        }
        stats.laundry++;
      } else {
        for (let i = 0; i < r.int(2, 3); i++) wire(wires, [pa[0], pa[1] + i * 0.1, pa[2]], [pc[0], pc[1] + i * 0.1, pc[2]], 0.28 + 0.05 * i, 0.026);
        wires.box('iron_black', pa[0], pa[1], pa[2], 0.12, 0.12, 0.16, { ry: Math.atan2(-nz, nx) }); wires.box('iron_black', pc[0], pc[1], pc[2], 0.12, 0.12, 0.16, { ry: Math.atan2(-nz, nx) });
        stats.alleyWires++;
      }
    }
    // cable bundles running along the facades of an alley / street (between two facade points on the same side)
    if (st.kind === 'alley' || st.kind === 'street') {
      for (const sd of [-1, 1]) {
        let prev = null;
        for (let s = 1.5; s < L - 1; s += 5) {
          const q = pointAt(d.pts, d.cum, s), nx = -q.tz * sd, nz = q.tx * sd, A = hit(q.x, q.z, nx, nz, hw + 1.3);
          if (!A) { prev = null; continue; }
          const gy = H(A.x, A.z), top = lotTopOf(K, A.lot) - gy;
          const cur = { x: A.x - nx * 0.07, z: A.z - nz * 0.07, y: gy + Math.min(top - 0.6, r.range(3.7, 4.8)), top };
          if (prev && top > 4.2 && Math.hypot(cur.x - prev.x, cur.z - prev.z) < 7) {
            for (let i = 0; i < r.int(1, 2); i++) wire(wires, [prev.x, prev.y - i * 0.09, prev.z], [cur.x, cur.y - i * 0.09, cur.z], 0.16 + 0.04 * i, 0.028);
            wires.box('iron_black', cur.x, cur.y, cur.z, 0.1, 0.1, 0.1, { ry: 0 }); stats.alleyWires++;
          }
          prev = cur;
        }
      }
    }
    // lanterns (faroles) on short iron posts at the alley/path edge, every ~12 m
    if (st.lamps && (st.kind === 'alley' || st.kind === 'path')) {
      const off = hw - 0.28;
      let acc = 5 + r.range(0, 4);
      for (let s = acc; s < L - 2; s += r.range(10, 14)) {
        const q = pointAt(d.pts, d.cum, s);
        for (const sd of [r.chance(0.5) ? 1 : -1, 1, -1]) {
          const x = q.x - q.tz * off * sd, z = q.z + q.tx * off * sd;
          if (!occ.clear(x, z, 0.2, OCC.LOT | OCC.STAIR | OCC.PLAZA | OCC.DOOR) || occ.overlaps(x, z, 0.3)) continue;
          farol(K, lampBuilder, x, z, ctx);
          occ.take(x, z, 0.3); stats.lanterns++; break;
        }
      }
    }
  }
  // ---- 6. plaza lamp posts (double globes) and court floodlights
  for (const pl of plan.plazas) {
    const cs = Math.cos(pl.ry), sn = Math.sin(pl.ry), P = (lx, lz) => [pl.cx + lx * cs + lz * sn, pl.cz - lx * sn + lz * cs];
    const hw = pl.w / 2 - 0.9, hd = pl.d / 2 - 0.9;
    const spots = pl.kind === 'court' ? [[-hw - 1.4, -hd - 1.4], [hw + 1.4, -hd - 1.4], [-hw - 1.4, hd + 1.4], [hw + 1.4, hd + 1.4]] : pl.kind === 'mirador' ? [[-hw, hd], [0, hd], [hw, hd]] : [[-hw * 0.7, -hd * 0.6], [hw * 0.7, hd * 0.6], [hw * 0.7, -hd * 0.6], [-hw * 0.7, hd * 0.6]];
    spots.slice(0, pl.kind === 'plaza' ? (pl.w > 14 ? 4 : 2) : 4).forEach(([lx, lz]) => {
      const [x, z] = P(lx, lz);
      if (!occ.clear(x, z, 0.25, OCC.STAIR | OCC.DOOR) || occ.overlaps(x, z, 0.4)) return;
      if (pl.kind === 'court') floodlight(K, lampBuilder, x, z, ctx); else globePost(K, lampBuilder, x, z, ctx);
      occ.take(x, z, 0.35);
    });
  }
  ctx.world && (ctx.world.poles = stats, ctx.world.poleList = poles.map((p) => ({ x: p.x, z: p.z, y: p.gy })));
  return stats;
}

function farol(K, b, x, z, ctx) {
  const gy = K.H(x, z), top = gy + 3.0;
  tube(b, 'iron_black', [x, gy - 0.1, z], [x, top - 0.2, z], 0.04, 0.03, 6, { col: [0.2, 0.2, 0.22] });
  b.box('iron_black', x, top - 0.14, z, 0.3, 0.05, 0.3, { col: [0.2, 0.2, 0.22] });
  for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12]]) b.box('iron_black', x + dx, top + 0.1, z + dz, 0.02, 0.4, 0.02, { col: [0.2, 0.2, 0.22] });
  b.box('lamp_glow', x, top + 0.1, z, 0.2, 0.34, 0.2, { col: [1, 1, 1] });
  b.box('iron_black', x, top + 0.34, z, 0.34, 0.05, 0.34, { col: [0.2, 0.2, 0.22] });
  b.cyl('iron_black', x, top + 0.37, z, 0.17, 0.12, 4, { r1: 0.02, col: [0.2, 0.2, 0.22] });
  ctx.lights.add({ x, y: top + 0.1, z, color: 0xffb865, intensity: 11, distance: 9, kind: 'street' });
  K.post(x, z, 0.07, 3);
}

function globePost(K, b, x, z, ctx) {
  const gy = K.H(x, z), top = gy + 4.1;
  tube(b, 'iron_green', [x, gy - 0.1, z], [x, top, z], 0.07, 0.045, 8, { col: [1, 1, 1] });
  tube(b, 'iron_green', [x, gy + 0.05, z], [x, gy + 0.55, z], 0.14, 0.09, 8, { col: [1, 1, 1] });
  for (const s of [-1, 1]) {
    tube(b, 'iron_green', [x, top - 0.25, z], [x + s * 0.5, top - 0.05, z], 0.03, 0.025, 5, { col: [1, 1, 1], caps: false });
    b.cyl('lamp_glow', x + s * 0.5, top - 0.5, z, 0.2, 0.3, 10, { r1: 0.17, col: [1, 1, 1] });
    b.cyl('iron_green', x + s * 0.5, top - 0.2, z, 0.12, 0.08, 8, { r1: 0.03, col: [1, 1, 1] });
  }
  ctx.lights.add({ x, y: top - 0.4, z, color: 0xffc480, intensity: 22, distance: 16, kind: 'street' });
  K.post(x, z, 0.11, 3);
}

function floodlight(K, b, x, z, ctx) {
  const gy = K.H(x, z), top = gy + 8.0;
  tube(b, 'galvanised', [x, gy - 0.1, z], [x, top, z], 0.1, 0.07, 8, { col: [1, 1, 1] });
  b.box('iron_black', x, top + 0.1, z, 1.1, 0.5, 0.12, { ry: 0.6 });
  b.box('lamp_glow_cool', x, top + 0.1, z, 1.0, 0.4, 0.02, { ry: 0.6, skip: ['px', 'nx', 'py', 'ny', 'nz'], col: [1, 1, 1] });
  ctx.lights.add({ x, y: top - 0.3, z, color: 0xe8f0ff, intensity: 40, distance: 24, kind: 'street' });
  K.post(x, z, 0.14, 4);
}
