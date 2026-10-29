// Colliders (WORLD space) from the wall records, slabs, stair flights and roof layer. Pure data.
import { floorRamp } from '../core/physics.js';
import { R, rectMinusRects, rpoly } from './geom.js';

export function buildColliders(S) {
  const fr = S.frame, y0w = fr.y, walls = [], floors = [];
  const wp = (x, z) => { const p = fr.toWorld(x, 0, z); return [p[0], p[2]]; };
  const wpoly = (rect) => rpoly(rect).map(([x, z]) => wp(x, z));
  const addSeg = (dir, at, a, b, t, ya, yb, extra = {}) => {
    if (b - a < 1e-3) return;
    const P = dir === 'x' ? wp(a, at) : wp(at, a), Q = dir === 'x' ? wp(b, at) : wp(at, b);
    walls.push({ x1: P[0], z1: P[1], x2: Q[0], z2: Q[1], t, y0: ya, y1: yb, ...extra });
  };
  const doorById = new Map(S.doors.map((d) => [d.id, d]));

  // The physics kernel inflates every wall segment by R + t on ALL sides (round caps), so a wall piece that stops exactly at the
  // jamb leaves only (w - 2(R + t)) of walkable corridor in a doorway (0.9 m door, 0.22 m wall: 0.08 m!). Pieces beside an opening
  // are therefore shortened by their half thickness: the cap then reaches the jamb and the corridor is w - 2R (0.3 m for 0.9).
  const wallColliders = (wl, ya, yb) => {
    const k = wl.t / 2;
    const piece = (a, b) => addSeg(wl.dir, wl.at, a, b, k, ya, yb, { id: wl.id });
    let cur = wl.a0, afterOpening = false;
    for (const o of wl.openings) {
      if (o.kind !== 'door' && o.kind !== 'arch' && o.kind !== 'shutter') continue;
      if (o.u0 > cur) piece(afterOpening ? cur + k : cur, o.u0 - k);
      cur = Math.max(cur, o.u1); afterOpening = true;
      if (o.kind !== 'arch') {
        const d = doorById.get(o.ref);
        addSeg(wl.dir, wl.at, o.u0, o.u1, Math.min(0.045, k), y0w + (d?.y ?? wl.floor * S.fh), y0w + (d?.y ?? wl.floor * S.fh) + (d?.h ?? 2.1), { door: o.ref });
      }
    }
    piece(afterOpening ? cur + k : cur, wl.a1);
  };

  for (const wl of S.walls) {
    const yf = wl.floor * S.fh;
    const ya = wl.floor === 0 && wl.ext ? y0w + S.foundY : y0w + yf;
    const yb = y0w + yf + (wl.open ? 1.1 : S.fh);
    wallColliders(wl, ya, yb);
  }

  // slabs (walkable surfaces) with their holes
  const outer = S.outer;
  for (let k = 0; k <= S.F; k++) {
    if (k === S.F && !S.roofWalkable) continue;
    if (k === S.F && S.openTop) continue;
    const holes = S.floorsData[k].voids.map((v) => v.rect);
    for (const p of rectMinusRects(outer, holes)) floors.push({ pts: wpoly(p), y: y0w + k * S.fh, id: `${S.lot.id}.slab${k}` });
  }

  // stairs
  const c = S.core;
  if (c) {
    for (const f of c.flights) {
      const a = wp(f.from[0], f.from[1]), b = wp(f.to[0], f.to[1]);
      floors.push(floorRamp(wpoly(f.rect), a, b, y0w + f.yFrom, y0w + f.yTo, { id: `${S.lot.id}.flight${f.id}` }));
    }
    for (const h of c.halfLandings) floors.push({ pts: wpoly(h.rect), y: y0w + h.y, id: `${S.lot.id}.half${h.t}` });
    for (const d of c.dividers) { const P = wp(...d.p1), Q = wp(...d.p2); walls.push({ x1: P[0], z1: P[1], x2: Q[0], z2: Q[1], t: d.half, y0: y0w + d.y0, y1: y0w + d.y1, id: `${S.lot.id}.div${d.t}` }); }
    for (const n of c.nooks) { const P = wp(...n.p1), Q = wp(...n.p2); walls.push({ x1: P[0], z1: P[1], x2: Q[0], z2: Q[1], t: 0.06, y0: y0w + n.y0, y1: y0w + n.y1, id: `${S.lot.id}.nook${n.t}` }); }
  }
  for (const g of S.guards) { const P = wp(...g.p1), Q = wp(...g.p2); walls.push({ x1: P[0], z1: P[1], x2: Q[0], z2: Q[1], t: 0.04, y0: y0w + g.y0, y1: y0w + g.y1, id: `${S.lot.id}.guard` }); }

  // roof layer: parapet + caseta
  const rl = S.roofLayer;
  if (rl && S.roofWalkable && !S.openTop) {
    const yr = y0w + S.F * S.fh, o = S.outer, pt = 0.075;
    const ring = [['x', o.z0 + pt, o.x0, o.x1], ['x', o.z1 - pt, o.x0, o.x1], ['z', o.x0 + pt, o.z0, o.z1], ['z', o.x1 - pt, o.z0, o.z1]];
    for (const [dir, at, a, b] of ring) addSeg(dir, at, a, b, pt, yr, yr + rl.parapetH);
    if (rl.caseta) for (const wl of rl.caseta.walls) wallColliders(wl, yr, yr + rl.caseta.h);
  }
  return { walls, floors };
}

export { R };
