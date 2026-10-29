// Roof layer planning (pure data): style, parapet, walkable terrace rooms, the stair-head "caseta", guards on open floors.
import { R, rectMinusRects, rw, rd, rcx, rcz } from './geom.js';

export const CASETA_T = 0.14, CASETA_H = 2.45;

const ROOF_WEIGHTS = {
  house: { terrace: 0.45, corrugated: 0.3, tile: 0.25 }, rowhouse: { terrace: 0.5, corrugated: 0.3, tile: 0.2 },
  shophouse: { terrace: 0.55, corrugated: 0.25, tile: 0.2 }, cornerstore: { terrace: 0.55, corrugated: 0.25, tile: 0.2 },
  apartments: { terrace: 0.85, corrugated: 0.15 }, unfinished: { unfinished: 1 },
  courtyard: { tile: 0.7, corrugated: 0.3 }, tenement: { corrugated: 0.6, terrace: 0.4 }, chapel: { tile: 1 },
  school: { corrugated: 0.5, terrace: 0.5 }, clinic: { terrace: 0.6, corrugated: 0.4 }, hall: { corrugated: 0.6, terrace: 0.4 },
  workshop: { corrugated: 0.8, terrace: 0.2 }, kiosk: { corrugated: 1 },
};

/** Decide roof style / walkability before layout (needed to know whether the stair continues to the roof). */
export function resolveRoof(S) {
  const rng = S.rng.fork('roof'), lot = S.lot;
  S.openTop = S.kind === 'unfinished' && S.F >= 2;
  let style = lot.style?.roof;
  if (!style) {
    const wts = ROOF_WEIGHTS[S.kind] ?? ROOF_WEIGHTS.house;
    style = rng.weighted(Object.entries(wts), (e) => e[1])[0];
  }
  if (S.openTop) style = 'unfinished';
  if (S.roofAccess && style !== 'unfinished') style = 'terrace';
  S.roofStyle = style;
  S.roofWalkable = S.openTop || (S.roofAccess && style === 'terrace');
  S.nUp = S.F - 1 + (S.roofAccess && !S.openTop && S.roofWalkable ? 1 : 0);
  if (S.nUp === 0 && !S.openTop) S.roofWalkable = false;
}

/** After the layout: build the roof layer. */
export function planRoof(S) {
  const F = S.F, fd = S.floorsData[F];
  const rl = S.roofLayer = { style: S.roofStyle, walkable: S.roofWalkable, parapetH: S.roofStyle === 'terrace' ? (S.roofWalkable ? 1.0 : 0.7) : 0, caseta: null, terraceRooms: [] };
  if (!S.core || !S.roofWalkable || S.openTop) {
    if (S.roofWalkable && !S.core) S.roofWalkable = false;
    // open skeleton top: guards around the stair void, rebar/columns are meshed in the shell
    if (S.openTop && S.core) {
      const v = S.core.voidRect, top = F - 1, yt = top * S.fh;
      const sides = [];
      const lz = S.core.landing;
      const edge = (x1, z1, x2, z2) => sides.push({ floor: top, p1: [x1, z1], p2: [x2, z2], y0: yt, y1: yt + 1.0, rail: true });
      const eps = 0.04;
      // perimeter of the void minus the edge shared with the landing
      if (Math.abs(lz.z1 - v.z0) < 1e-3) { edge(v.x0, v.z1, v.x1, v.z1); edge(v.x0 + eps, v.z0, v.x0 + eps, v.z1); edge(v.x1 - eps, v.z0, v.x1 - eps, v.z1); }
      else if (Math.abs(lz.z0 - v.z1) < 1e-3) { edge(v.x0, v.z0, v.x1, v.z0); edge(v.x0 + eps, v.z0, v.x0 + eps, v.z1); edge(v.x1 - eps, v.z0, v.x1 - eps, v.z1); }
      else if (Math.abs(lz.x1 - v.x0) < 1e-3) { edge(v.x1, v.z0, v.x1, v.z1); edge(v.x0, v.z0 + eps, v.x1, v.z0 + eps); edge(v.x0, v.z1 - eps, v.x1, v.z1 - eps); }
      else { edge(v.x0, v.z0, v.x0, v.z1); edge(v.x0, v.z0 + eps, v.x1, v.z0 + eps); edge(v.x0, v.z1 - eps, v.x1, v.z1 - eps); }
      S.guards.push(...sides);
    }
    return rl;
  }
  // walkable terrace + caseta over the stair core
  const c = S.core, cr = c.rect, T = CASETA_T;
  const outerC = R(cr.x0 - T, cr.z0 - T, cr.x1 + T, cr.z1 + T);
  const landing = S.addRoom(F, 'landing', c.landing, { core: true, noFurnish: true }); landing.h = CASETA_H; landing.stair = S.lot.id + '.s0';
  fd.voids.push({ rect: R(c.voidRect.x0, c.voidRect.z0, c.voidRect.x1, c.voidRect.z1), owner: landing.id, core: true });
  const pieces = rectMinusRects(S.inner, [outerC]).filter((p) => rw(p) >= 0.7 && rd(p) >= 0.7);
  const terraces = pieces.map((p) => { const r = S.addRoom(F, 'terrace', p, { outdoor: true }); r.h = 3.0; return r; });
  rl.terraceRooms = terraces.map((r) => r.id);
  const id = (n) => `${S.lot.id}.f${F}.cw${n}`;
  const walls = [
    { id: id(0), floor: F, dir: 'x', at: cr.z0 - T / 2, a0: cr.x0 - T, a1: cr.x1 + T, t: T, ext: true, side: 'north', openings: [] },
    { id: id(1), floor: F, dir: 'x', at: cr.z1 + T / 2, a0: cr.x0 - T, a1: cr.x1 + T, t: T, ext: true, side: 'south', openings: [] },
    { id: id(2), floor: F, dir: 'z', at: cr.x0 - T / 2, a0: cr.z0, a1: cr.z1, t: T, ext: true, side: 'west', openings: [] },
    { id: id(3), floor: F, dir: 'z', at: cr.x1 + T / 2, a0: cr.z0, a1: cr.z1, t: T, ext: true, side: 'east', openings: [] },
  ];
  // door: on the wall that faces the open terrace nearest the landing (prefer the landing end)
  let best = null;
  for (const t of terraces) {
    const touch = [
      ['south', Math.abs(t.rect.z0 - outerC.z1) < 0.02 && Math.min(t.rect.x1, cr.x1) - Math.max(t.rect.x0, cr.x0) > 0.9],
      ['north', Math.abs(t.rect.z1 - outerC.z0) < 0.02 && Math.min(t.rect.x1, cr.x1) - Math.max(t.rect.x0, cr.x0) > 0.9],
      ['east', Math.abs(t.rect.x0 - outerC.x1) < 0.02 && Math.min(t.rect.z1, cr.z1) - Math.max(t.rect.z0, cr.z0) > 0.9],
      ['west', Math.abs(t.rect.x1 - outerC.x0) < 0.02 && Math.min(t.rect.z1, cr.z1) - Math.max(t.rect.z0, cr.z0) > 0.9],
    ].filter((q) => q[1]).map((q) => q[0]);
    for (const side of touch) {
      // is this side adjacent to the landing rect?
      const lz = c.landing;
      const adj = side === 'south' ? Math.abs(lz.z1 - cr.z1) < 1e-3 : side === 'north' ? Math.abs(lz.z0 - cr.z0) < 1e-3 : side === 'east' ? Math.abs(lz.x1 - cr.x1) < 1e-3 : Math.abs(lz.x0 - cr.x0) < 1e-3;
      if (!adj) continue;
      const score = rw(t.rect) * rd(t.rect) + (side === 'south' || side === 'north' ? 5 : 0);
      if (!best || score > best.score) best = { t, side, score };
    }
  }
  if (best) {
    const lz = c.landing;
    const d = S.link(best.t, landing, { w: 0.9, mat: 'door_metal', atX: rcx(lz), atZ: rcz(lz), h: 2.05 });
    d.roof = true; d.entrance = 'roof';
    const wl = walls.find((w) => w.dir === d.wall.dir && Math.abs(w.at - d.wall.at) < 0.02);
    const cc = d.wall.dir === 'z' ? d.z : d.x;
    if (wl) wl.openings.push({ kind: 'door', u0: cc - d.w / 2, u1: cc + d.w / 2, y0: 0, y1: d.h, ref: d.id });
    else S.notes.push('caseta door has no wall');
  } else S.notes.push('caseta has no free side: roof not reachable');
  rl.caseta = { outer: outerC, inner: cr, walls, h: CASETA_H, T };
  return rl;
}
