// Trees, palms, bananas, shrubs, agaves, grass tufts, bougainvillea drapes and potted plants. All foliage is alpha-tested cards from
// the sprite atlas (one material), trunks are tubes. Groups props.flora.<i>.<j> and props.tufts.<i>.<j> (50 m chunks).
import { card, tube, V } from './mk.js';
import { TILE } from './sprites.js';
import { OCC } from './occupancy.js';
import { ss, vnoise, pointInPoly, polyDistPoint } from './geom.js';

const rgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const lerpc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
const BLOCK = OCC.ROAD | OCC.PLAZA | OCC.STAIR | OCC.LOT | OCC.STEEP | OCC.NAV | OCC.DOOR;

/** Cards scattered in an ellipsoid (the canopy). */
function canopy(K, b, tile, c0, rx, ry, rz, n, size, r, base, o = {}) {
  const uv = K.atlas ? K.atlas.uv(tile) : [0, 0, 1, 1];
  for (let i = 0; i < n; i++) {
    const u = r.range(-1, 1), phi = r.range(0, Math.PI * 2), k = Math.sqrt(1 - u * u), rad = Math.cbrt(r.range(o.inner ?? 0.25, 1));
    const dx = k * Math.cos(phi) * rad, dy = u * rad, dz = k * Math.sin(phi) * rad;
    const yaw = r.range(0, Math.PI), fwd = [Math.sin(yaw), 0, Math.cos(yaw)], right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const tau = o.droop ? r.range(-0.15, 0.25) : r.range(-0.45, 0.95) * (dy > 0.3 ? 1.2 : 1), up = V.nrm([fwd[0] * Math.sin(tau), Math.cos(tau), fwd[2] * Math.sin(tau)]);
    const w = size * r.range(0.85, 1.25), h = (o.tall ? o.tall : 1) * w, p = [c0[0] + dx * rx, c0[1] + dy * ry, c0[2] + dz * rz];
    const bottom = o.hang ? V.sub(p, V.mul(up, h * 0.15)) : V.sub(p, V.mul(up, h / 2));
    const shade = 0.66 + 0.34 * (dy * 0.5 + 0.5) + r.range(-0.06, 0.06);
    card(b, 'foliage', bottom, right, up, w, h, uv, scale(lerpc(base, o.alt ?? base, r.next()), shade), V.nrm([dx, dy * 0.8 + 0.45, dz]));
  }
}

const BARK = { broad: [0.36, 0.28, 0.22], euca: [0.74, 0.7, 0.62], palm: [0.55, 0.5, 0.42] };

// ---------------------------------------------------------------------------------------------------- trees
export function broadTree(K, x, z, o = {}) {
  const r = o.rng, b = K.b('flora', x, z), gy = K.H(x, z);
  const h = o.h ?? r.range(5.5, 8), cr = o.crown ?? r.range(2.6, 3.6), tr = o.trunk ?? r.range(0.14, 0.2), lean = r.range(-0.25, 0.25), lean2 = r.range(-0.25, 0.25);
  const top = [x + lean, gy + h * 0.62, z + lean2], base = o.leaf ?? rgb(0x6f9a44);
  const bark = BARK.broad;
  tube(b, 'bark_trunk', [x, gy - 0.25, z], top, tr, tr * 0.62, 7, { colFn: (i) => scale(bark, 0.85 + 0.25 * ((i * 37) % 5) / 5) });
  for (let i = 0; i < 3; i++) {                       // limbs
    const a = r.range(0, 6.28), out = cr * r.range(0.45, 0.7), end = [top[0] + Math.cos(a) * out, top[1] + h * r.range(0.14, 0.25), top[2] + Math.sin(a) * out];
    tube(b, 'bark_trunk', [top[0], top[1] - 0.3, top[2]], end, tr * 0.5, tr * 0.22, 5, { col: scale(bark, 0.95), caps: false });
  }
  canopy(K, b, o.tile ?? TILE.BROADLEAF, [top[0], gy + h * 0.78, top[2]], cr, cr * 0.62, cr * 0.92, o.cards ?? 24, cr * 0.95, r, base, { alt: o.alt });
  K.post(x, z, tr + 0.08, 4);
  K.occ.take(x, z, tr + 0.6);
}

export function eucalyptus(K, x, z, o = {}) {
  const r = o.rng, b = K.b('flora', x, z), gy = K.H(x, z), h = o.h ?? r.range(11, 17), tr = r.range(0.16, 0.24), lean = r.range(-0.9, 0.9), lz = r.range(-0.9, 0.9);
  const top = [x + lean, gy + h, z + lz];
  tube(b, 'bark_euca', [x, gy - 0.3, z], top, tr, tr * 0.38, 7, { colFn: (i) => scale(BARK.euca, 0.82 + 0.3 * ((i * 53) % 7) / 7) });
  for (let i = 0; i < 4; i++) {
    const a = r.range(0, 6.28), s = r.range(1.4, 2.4), y0 = gy + h * r.range(0.62, 0.8);
    const p0 = [x + lean * (y0 - gy) / h, y0, z + lz * (y0 - gy) / h];
    tube(b, 'bark_euca', p0, [p0[0] + Math.cos(a) * s, y0 + r.range(1.2, 2.4), p0[2] + Math.sin(a) * s], tr * 0.34, tr * 0.14, 5, { col: scale(BARK.euca, 0.92), caps: false });
  }
  canopy(K, b, TILE.EUCA, [top[0], top[1] - 1.2, top[2]], 3.0, 2.4, 3.0, 17, 2.6, r, rgb(o.leafHex ?? 0xb5cfb0), { droop: true, hang: true, tall: 1.7, alt: rgb(0x8ca98b) });
  K.post(x, z, tr + 0.06, 5);
  K.occ.take(x, z, 0.8);
}

export function palm(K, x, z, o = {}) {
  const r = o.rng, b = K.b('flora', x, z), gy = K.H(x, z), h = o.h ?? r.range(8, 13), tr = 0.17, lean = r.range(-0.4, 0.4), lz = r.range(-0.4, 0.4);
  const segs = Math.ceil(h / 0.8);
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs, bend = (t) => [x + lean * t * t, gy + h * t - (i === 0 ? 0.25 : 0), z + lz * t * t];
    tube(b, 'bark_palm', bend(t0), bend(t1), tr * (1 - 0.3 * t0), tr * (1 - 0.3 * t1), 6, { col: scale(BARK.palm, i % 2 ? 0.86 : 1.05), caps: i === segs - 1 });
  }
  const top = [x + lean, gy + h, z + lz], uv = K.atlas ? K.atlas.uv(TILE.FROND) : [0, 0, 1, 1], n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2), tau = r.range(-0.15, 0.85) * (i % 2 ? 1 : 0.55), len = r.range(3.1, 3.9);
    const d = V.nrm([Math.cos(a) * Math.cos(tau), Math.sin(tau) + 0.1, Math.sin(a) * Math.cos(tau)]), right = V.nrm(V.cross(d, [0, 1, 0]));
    card(b, 'foliage', [top[0], top[1] - 0.1, top[2]], right, d, len * 0.62, len, uv, scale(rgb(0x6f9a44), r.range(0.8, 1.1)), V.nrm([Math.cos(a), 0.7, Math.sin(a)]));
  }
  tube(b, 'bark_trunk', [top[0], top[1] - 0.2, top[2]], [top[0], top[1] + 0.35, top[2]], 0.18, 0.12, 6, { col: [0.3, 0.36, 0.2] });
  K.post(x, z, tr + 0.08, 4); K.occ.take(x, z, 0.7);
}

export function cypress(K, x, z, o = {}) {
  const r = o.rng, b = K.b('flora', x, z), gy = K.H(x, z), h = o.h ?? r.range(6, 9.5), w = h * 0.34, uv = K.atlas ? K.atlas.uv(TILE.CYPRESS) : [0, 0, 1, 1];
  const n = 3, rot = r.range(0, 3);
  for (let i = 0; i < n; i++) {
    const yaw = rot + (i * Math.PI) / n, right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    card(b, 'foliage', [x, gy - 0.1, z], right, [0, 1, 0], w * 1.25, h, uv, scale(rgb(0x8da58a), r.range(0.85, 1.08)), V.nrm([Math.sin(yaw), 0.55, Math.cos(yaw)]));
  }
  tube(b, 'bark_trunk', [x, gy - 0.2, z], [x, gy + 1.4, z], 0.16, 0.1, 5, { col: BARK.broad });
  K.post(x, z, 0.28, 4); K.occ.take(x, z, 0.8);
}

export function banana(K, x, z, o = {}) {
  const r = o.rng, b = K.b('flora', x, z), gy = K.H(x, z), h = r.range(1.7, 2.7), uv = K.atlas ? K.atlas.uv(TILE.BANANA) : [0, 0, 1, 1];
  tube(b, 'bark_trunk', [x, gy - 0.1, z], [x, gy + h, z], 0.13, 0.08, 6, { col: [0.55, 0.62, 0.38] });
  const n = r.int(6, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.3, 0.3), tau = r.range(0.7, 1.25), len = r.range(2.0, 2.9);
    const d = V.nrm([Math.cos(a) * Math.sin(tau), Math.cos(tau) * 0.9, Math.sin(a) * Math.sin(tau)]), right = V.nrm(V.cross(d, [0, 1, 0]));
    card(b, 'foliage', [x, gy + h - 0.1, z], right, d, len * 0.5, len, uv, scale(rgb(0x7fb04a), r.range(0.8, 1.1)), V.nrm([Math.cos(a), 0.8, Math.sin(a)]));
  }
}

// ---------------------------------------------------------------------------------------------------- low plants
export function shrub(K, x, z, o = {}) {
  const r = o.rng, b = K.b('flora', x, z, { cast: false }), gy = K.H(x, z), s = o.size ?? r.range(0.7, 1.2), tile = o.tile ?? TILE.SHRUB;
  canopy(K, b, tile, [x, gy + s * 0.45, z], s * 0.7, s * 0.45, s * 0.7, o.cards ?? 6, s * 0.95, r, o.leaf ?? rgb(0x7ca24d), { inner: 0.4, alt: o.alt });
  if (o.flowers) canopy(K, b, TILE.FLOWERS, [x, gy + s * 0.8, z], s * 0.5, s * 0.2, s * 0.5, 3, s * 0.8, r, rgb(0xffffff), { inner: 0.5 });
}

export function agave(K, x, z, o = {}) {
  const r = o.rng, b = K.b('flora', x, z, { cast: false }), gy = K.H(x, z), s = o.size ?? r.range(1.1, 1.6), uv = K.atlas ? K.atlas.uv(TILE.AGAVE) : [0, 0, 1, 1], rot = r.range(0, 3);
  for (let i = 0; i < 3; i++) {
    const yaw = rot + (i * Math.PI) / 3, right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    card(b, 'foliage', [x, gy - 0.05, z], right, [0, 1, 0], s * 1.3, s, uv, scale(rgb(0xc9e0d3), r.range(0.85, 1.05)), V.nrm([Math.sin(yaw), 0.8, Math.cos(yaw)]));
  }
}

export function tuft(K, x, z, rng, big = 1) {
  const b = K.b('tufts', x, z, { cast: false }), gy = K.H(x, z), uv = K.atlas ? K.atlas.uv(rng.chance(0.18) ? TILE.REED : TILE.TUFT) : [0, 0, 1, 1];
  const s = rng.range(0.6, 1.1) * big, rot = rng.range(0, 3), col = scale(rgb(0xbfd08a), rng.range(0.8, 1.1));
  for (let i = 0; i < 2; i++) {
    const yaw = rot + (i * Math.PI) / 2, right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    card(b, 'foliage', [x, gy - 0.04, z], right, [0, 1, 0], s, s * 0.85, uv, col, [0, 1, 0]);
  }
}

export function pottedPlant(K, x, z, rng, solid = true) {
  const b = K.b('flora', x, z, { cast: false }), gy = K.H(x, z), s = rng.range(0.5, 0.8);
  tube(b, 'pot_clay', [x, gy, z], [x, gy + 0.34, z], 0.17, 0.23, 8, { col: scale(rgb(0xc8683c), rng.range(0.85, 1.1)), caps: true });
  canopy(K, b, rng.chance(0.5) ? TILE.FLOWERS : TILE.SHRUB, [x, gy + 0.34 + s * 0.4, z], s * 0.5, s * 0.4, s * 0.5, 4, s * 0.9, rng, rgb(0xd8e8c8), { inner: 0.3 });
  if (solid) K.post(x, z, 0.24, 0.9);
}

/** Bougainvillea sheets hanging over a wall edge: pts = [{x,z,nx,nz,y}] along the crest (y = crest height), n = outward normal. */
export function drape(K, pts, rng, o = {}) {
  const tile = o.tile ?? TILE.BOUGAIN, uv = K.atlas ? K.atlas.uv(tile) : [0, 0, 1, 1];
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i], q = pts[i + 1], l = Math.hypot(q.x - p.x, q.z - p.z);
    acc += l;
    if (acc < (o.step ?? 2.2)) continue;
    acc = 0;
    const b = K.b('flora', p.x, p.z, { cast: false }), hang = Math.max(0.6, rng.range(0.8, 1.2) * (o.hang ?? 1.4)), w = rng.range(2.0, 2.8);
    const right = V.nrm([q.x - p.x, 0, q.z - p.z]), col = scale(rgb(o.hex ?? 0xffffff), rng.range(0.85, 1.1));
    card(b, 'foliage', [p.x + p.nx * 0.14, p.y - hang + 0.12, p.z + p.nz * 0.14], right, [0, 1, 0], w, hang, uv, col, V.nrm([p.nx, 0.35, p.nz]));
  }
}

// ---------------------------------------------------------------------------------------------------- placement
export function buildFlora(K) {
  const plan = K.plan, occ = K.occ, R = K.rng('flora'), dirt = K.ctx.world?.masks?.dirt;
  const sp = { n: 0, euca: 0, palm: 0, broad: 0, cypress: 0, banana: 0, shrub: 0, agave: 0, tuft: 0, pots: 0, drape: 0 };
  const free = (x, z, r, mask = BLOCK) => occ.clear(x, z, r, mask) && !occ.overlaps(x, z, r * 0.8);

  // ---- plaza trees (inside planters)
  for (const pl of plan.plazas) {
    if (pl.kind !== 'plaza') continue;
    const want = pl.id === 'P2' ? 5 : pl.id === 'P1' ? 2 : 3, spec = pl.id === 'P1' ? 'palm' : pl.id === 'P4' ? 'cypress' : 'almendro';
    const xs = pl.poly.map((p) => p[0]), zs = pl.poly.map((p) => p[1]), tries = 600, got = [];
    const r = R.fork('plaza:' + pl.id);
    for (let t = 0; t < tries && got.length < want; t++) {
      const x = r.range(Math.min(...xs), Math.max(...xs)), z = r.range(Math.min(...zs), Math.max(...zs));
      if (!pointInPoly(pl.poly, x, z) || polyDistPoint(pl.poly, x, z) > 99) continue;
      let dEdge = Infinity; for (let i = 0; i < pl.poly.length; i++) { const a = pl.poly[i], c = pl.poly[(i + 1) % pl.poly.length]; const vx = c[0] - a[0], vz = c[1] - a[1], l2 = vx * vx + vz * vz || 1; const u = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / l2)); dEdge = Math.min(dEdge, Math.hypot(x - a[0] - vx * u, z - a[1] - vz * u)); }
      if (dEdge < 0.9 || dEdge > 2.6) continue;
      if (!occ.clear(x, z, 0.9, BLOCK & ~OCC.PLAZA) || occ.overlaps(x, z, 2.6)) continue;
      got.push([x, z]); occ.take(x, z, 0.5);
      if (spec === 'palm') palm(K, x, z, { rng: r.fork('t' + got.length) }); else if (spec === 'cypress') cypress(K, x, z, { rng: r.fork('t' + got.length) });
      else broadTree(K, x, z, { rng: r.fork('t' + got.length), h: r.range(6.5, 8.5), crown: r.range(3.2, 4.2), cards: 30 });
      sp[spec === 'palm' ? 'palm' : spec === 'cypress' ? 'cypress' : 'broad']++; sp.n++;
    }
  }

  // ---- entry-road palms (palma de cera) and kerb-side trees on the main road
  for (const st of plan.streets) {
    if (st.kind !== 'road') continue;
    const d = st._d, rr = R.fork('road:' + st.id);
    let acc = 6;
    for (let k = 1; k < d.pts.length; k++) {
      const a = d.pts[k - 1], c = d.pts[k], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      let s = 0;
      while (s < l) {
        if (acc >= 14) {
          acc = 0;
          const t = s / l, x = a[0] + (c[0] - a[0]) * t, z = a[1] + (c[1] - a[1]) * t, nx = -(c[1] - a[1]) / l, nz = (c[0] - a[0]) / l;
          for (const side of [-1, 1]) {
            if (!rr.chance(0.55)) continue;
            const off = st.width / 2 + rr.range(1.4, 2.6), px = x + nx * off * side, pz = z + nz * off * side;
            if (!free(px, pz, 1.6)) continue;
            if (rr.chance(0.5)) palm(K, px, pz, { rng: rr.fork('p' + sp.n) }); else broadTree(K, px, pz, { rng: rr.fork('p' + sp.n) });
            sp.n++; sp.palm++;
          }
        }
        s += 1; acc += 1;
      }
    }
  }

  // ---- the hillside: zones by position
  const sc = R.fork('scatter');
  for (let gz = -98; gz < 98; gz += 3.2) for (let gx = -98; gx < 98; gx += 3.2) {
    const x = gx + sc.range(0, 3.2), z = gz + sc.range(0, 3.2);
    if (x < -98 || x > 98 || z < -98 || z > 98) continue;
    const north = ss(-66, -88, z), east = ss(58, 80, x), west = ss(-58, -80, x), n1 = vnoise(x, z, 13, plan.seed + 21), n2 = vnoise(x, z, 5, plan.seed + 23);
    const wild = Math.max(north, east, west), terrace = 0.12 + 0.1 * (n1 + 1);
    const dens = wild * (0.55 + 0.45 * n1) + (1 - wild) * terrace * 0.5;
    if (sc.next() > dens * 0.55) continue;
    if (occ.slope(x, z) > 0.55) continue;
    const r = sc.fork('c' + sp.n);
    if (north > 0.5 && free(x, z, 2.4)) {
      if (r.chance(0.62)) eucalyptus(K, x, z, { rng: r }), sp.euca++; else cypress(K, x, z, { rng: r }), sp.cypress++;
      sp.n++;
    } else if (east > 0.4 && free(x, z, 2.0)) {
      if (r.chance(0.42)) banana(K, x, z, { rng: r }), sp.banana++; else if (r.chance(0.5)) eucalyptus(K, x, z, { rng: r }), sp.euca++; else broadTree(K, x, z, { rng: r }), sp.broad++;
      sp.n++;
    } else if (west > 0.4 && free(x, z, 1.6)) {
      if (r.chance(0.45)) agave(K, x, z, { rng: r }), sp.agave++; else if (r.chance(0.5)) shrub(K, x, z, { rng: r, size: r.range(1.0, 1.7) }), sp.shrub++; else broadTree(K, x, z, { rng: r, h: r.range(4.5, 6.5) }), sp.broad++;
      sp.n++;
    } else if (wild < 0.3 && free(x, z, 1.7)) {
      const k = r.next();
      if (k < 0.28) broadTree(K, x, z, { rng: r, h: r.range(4.5, 6.5), crown: r.range(2.2, 3), leaf: rgb(r.pick([0x6f9a44, 0x7fa84a, 0x5f8f3b])) }), sp.broad++;
      else if (k < 0.5) banana(K, x, z, { rng: r }), sp.banana++;
      else if (k < 0.62) agave(K, x, z, { rng: r }), sp.agave++;
      else shrub(K, x, z, { rng: r, flowers: r.chance(0.4) }), sp.shrub++;
      sp.n++;
    }
    void n2;
  }

  // ---- grass tufts on the open grass
  const tr = R.fork('tufts');
  for (let i = 0; i < 6500; i++) {
    const x = tr.range(-99, 99), z = tr.range(-99, 99);
    if (!occ.clear(x, z, 0.4, BLOCK) || occ.slope(x, z) > 0.6) continue;
    if (dirt) { const gi = Math.round((x + 100) / 0.5), gj = Math.round((z + 100) / 0.5); if (dirt[gj * 401 + gi] > 0.5) continue; }
    tuft(K, x, z, tr, 0.9 + 0.5 * Math.max(ss(58, 90, Math.abs(x)), ss(-66, -90, z)));
    sp.tuft++;
  }

  // ---- bougainvillea / vine over the tall retaining walls
  const runs = K.ctx.world?.wallRuns ?? [], dr = R.fork('drape');
  for (const run of runs) {
    if (run.tall < 0.9 || !dr.chance(0.5)) continue;
    // cut wall (sign > 0): face on the edge looking at the structure, crest = upper ground; fill wall: face on the outer line, crest = structure level
    const pts = run.S.map((s) => (run.sign > 0
      ? { x: s.x, z: s.z, nx: -s.nx, nz: -s.nz, y: s.outer + 0.02 }
      : { x: s.x + s.nx * run.B, z: s.z + s.nz * run.B, nx: s.nx, nz: s.nz, y: s.inner + 0.02 }));
    drape(K, pts, dr, { tile: dr.chance(0.55) ? TILE.BOUGAIN : TILE.VINE, step: 2.4, hang: Math.min(1.4, run.tall * 0.6) });
    sp.drape++;
  }
  K.ctx.world && (K.ctx.world.flora = sp);
  return sp;
}
