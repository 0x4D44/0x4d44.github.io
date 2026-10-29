// Helpers for the architecture tests (A2). Not a test file itself.
import { createContext } from '../js/core/ctx.js';
import { planBuilding } from '../js/arch/index.js';
import { LOT_KINDS } from '../js/core/vocab.js';

/** Test lots: every LOT_KIND plus size / floor / party / roof variations. Positions are spread out; terrain is flat with a plinth. */
export function testLots() {
  let n = 0;
  const lots = [];
  const mk = (kind, w, d, floors, extra = {}) => {
    const i = n++;
    lots.push({
      id: 'T' + String(i).padStart(2, '0'), name: `Prueba ${i}`, kind, x: (i % 8) * 30 - 105, y: 0, z: Math.floor(i / 8) * 30 - 60, rotY: [0, 0.5, -0.9, 1.57, 3.1][i % 5], w, d, floors, fh: 2.8,
      front: 'S0', entrance: { side: 'front', u: 0 }, party: { left: false, right: false, back: false }, style: {}, seed: 4000 + i * 17, roofAccess: false, ...extra,
    });
  };
  mk('house', 6, 10, 2); mk('house', 5, 11, 3, { roofAccess: true }); mk('house', 7, 12, 2, { party: { left: true, right: true, back: false }, roofAccess: true });
  mk('house', 6, 8, 1); mk('house', 8, 9, 3, { roofAccess: true, style: { roof: 'tile' } }); mk('house', 5.5, 7.4, 2); mk('house', 9, 13, 4, { party: { left: true, right: false, back: true } });
  mk('rowhouse', 4.5, 9, 2, { party: { left: true, right: true, back: true } }); mk('rowhouse', 4.2, 10, 3, { party: { left: true, right: true, back: false }, roofAccess: true });
  mk('shophouse', 7, 11, 2, { shop: 'tienda' }); mk('shophouse', 6.4, 12, 3, { shop: 'panaderia', roofAccess: true, party: { left: true, right: false, back: false } });
  mk('shophouse', 8, 10, 1, { shop: 'peluqueria' }); mk('shophouse', 5.2, 9.2, 2, { shop: 'fruver' });
  mk('cornerstore', 7, 10, 2, { shop: 'tienda', roofAccess: true }); mk('cornerstore', 6, 9, 3, { shop: 'drogueria' });
  mk('apartments', 12, 12, 5, { roofAccess: true }); mk('apartments', 11, 13, 4, { party: { left: true, right: true, back: false } }); mk('apartments', 10, 11, 3);
  mk('unfinished', 6, 10, 3); mk('unfinished', 7, 9, 2, { roofAccess: true }); mk('unfinished', 5, 9, 4);
  for (const k of LOT_KINDS) if (!['house', 'rowhouse', 'apartments', 'shophouse', 'cornerstore', 'unfinished'].includes(k)) {
    mk(k, k === 'kiosk' ? 3.5 : k === 'school' ? 16 : k === 'chapel' ? 8 : 10, k === 'kiosk' ? 3.5 : k === 'school' ? 14 : k === 'chapel' ? 14 : 11, k === 'school' ? 2 : k === 'tenement' ? 3 : k === 'kiosk' ? 1 : 2, { shop: k === 'workshop' ? 'taller' : undefined });
  }
  return lots;
}

/** Terrain: flat at y=0 except a plinth (lot.y - 0.3) under every footprint (+0.3 margin), as A5 promises. */
export function makeHeightAt(lots) {
  const boxes = lots.map((l) => ({ x: l.x, z: l.z, c: Math.cos(l.rotY), s: Math.sin(l.rotY), hw: l.w / 2 + 0.3, hd: l.d / 2 + 0.3, y: l.y - 0.3 }));
  return (x, z) => {
    for (const b of boxes) {
      const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) <= b.hw && Math.abs(lz) <= b.hd) return b.y;
    }
    return 0;
  };
}

export function makeCtx(lots, seed = 20261029) {
  const ctx = createContext({ seed, headless: true });
  ctx.plan = { heightAt: makeHeightAt(lots), lots };
  ctx.physics.setTerrain(ctx.plan.heightAt);
  return ctx;
}

export function planAll(lots, seed, colliders = true) {
  const ctx = makeCtx(lots, seed);
  const bps = lots.map((l) => planBuilding(ctx, l));
  if (colliders) for (const bp of bps) ctx.physics.add(bp.colliders);
  return { ctx, bps };
}

const P = { radius: 0.3, height: 1.78, stepUp: 0.5, maxSlope: 0.9, gravity: 9.8 };

/** Flood-fill walk with the real physics kernel. Returns { visited:[{x,y,z}], drops:[...] }. */
export function explore(ctx, bp, o = {}) {
  const ph = ctx.physics, step = o.step ?? 0.25, seen = new Map(), drops = [], queue = [];
  const key = (x, y, z) => `${Math.round(x / step)},${Math.round(z / step)},${Math.round(y / 0.35)}`;
  const start = o.start ?? bp.entrances[0].outside;
  const s0 = { x: start[0], z: start[2], y: start[1], vy: 0, onGround: true };
  ph.move(s0, 0, 0, 0.016, P);
  seen.set(key(s0.x, s0.y, s0.z), s0); queue.push(s0);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const b = bp.bounds, pad = 3;
  let guard = 0;
  while (queue.length && guard++ < (o.max ?? 400000)) {
    const a = queue.pop();
    for (const [dx, dz] of dirs) {
      const s = { x: a.x, y: a.y, z: a.z, vy: 0, onGround: true };
      const mx = dx * step, mz = dz * step;
      ph.move(s, mx, mz, 1 / 60, P);
      if (s.blocked) continue;
      if (Math.hypot(s.x - (a.x + mx), s.z - (a.z + mz)) > 0.05) continue;
      for (let i = 0; i < 40 && !s.onGround; i++) ph.move(s, 0, 0, 1 / 60, P);
      if (s.y < a.y - 0.55) { drops.push({ from: [a.x, a.y, a.z], to: [s.x, s.y, s.z] }); continue; }
      if (s.x < b.x0 - pad || s.x > b.x1 + pad || s.z < b.z0 - pad || s.z > b.z1 + pad) continue;
      const k = key(s.x, s.y, s.z);
      if (seen.has(k)) continue;
      seen.set(k, s); queue.push(s);
    }
  }
  return { visited: [...seen.values()], drops, exhausted: guard >= (o.max ?? 400000) };
}

/** Is there a visited state within `r` (xz) of local point (lx,lz) at local floor height ly (+-0.35)? */
export function reached(bp, visited, lx, lz, ly, r = 0.5) {
  const p = bp.frame.toWorld(lx, ly, lz);
  return visited.some((s) => Math.hypot(s.x - p[0], s.z - p[2]) <= r && Math.abs(s.y - p[1]) <= 0.35);
}

export function openAllDoors(ctx, bp, open = true) { for (const d of bp.doors) if (d.kind !== 'arch') ctx.physics.setDoor(d.id, open); }
export { P as PLAYER, planBuilding };
