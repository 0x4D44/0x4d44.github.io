// Where the stair core goes and the band structure every floor of a building shares.
import { coreDims } from './stairs.js';
import { T_INT, cutSouth, cutEast, cutWest, rw, rd, clamp, R } from './geom.js';

const ti = T_INT;

/**
 * style 'home'  : a full-width FRONT band (sala/dormitorio) in front; behind it a core strip + a rest column.
 * style 'column': full-depth core column [entry | core | back] beside a full-depth rest column (shops, apartments' hall).
 * Returns { orient, coreLeft, core:Rect, front|entry:Rect, B:Rect, strip:Rect, rest:Rect, back:Rect|null, df } or null when no stairs are needed.
 * Returns { fail:true } if nothing fits (caller drops the upper floors).
 */
export function coreGeo(S, style = 'home', o = {}) {
  if (!S.nUp) return null;
  const { inner } = S, cd = coreDims(S.fh), Wi = rw(inner), Di = rd(inner), across = cd.across, along = cd.along;
  const coreLeft = o.coreLeft ?? (S.party.left && !S.party.right ? true : S.party.right && !S.party.left ? false : S.rng.chance(0.5));
  const g = { cd, style, coreLeft, orient: 'z', back: null, flip: false };
  const restW = Wi - across - ti;
  const dfIdeal = style === 'column' ? clamp(0.34 * Di, 2.2, o.entryMax ?? 3.4) : clamp(0.38 * Di, 2.8, 4.8);
  if (Di >= along + ti + 2.0 && restW >= 1.5) {
    let df = dfIdeal, Dr = Di - df - ti, back = 0;
    if (Dr < along) { df = Di - ti - along; Dr = along; }
    else {
      const spare = Dr - along - ti;
      if (spare >= (o.backMin ?? 1.6)) back = spare;
      else if (Dr - along > 1e-6) { df = Di - ti - along; Dr = along; }   // no room for a back strip: the core takes exactly its own depth (a sliver of <= ti must not be left over)
    }
    g.df = df;
    if (style === 'home') {
      const [B, front] = cutSouth(inner, df);
      const [a, b] = coreLeft ? cutWest(B, across) : cutEast(B, across);
      const strip = coreLeft ? a : b, rest = coreLeft ? b : a;
      let core = strip, backRect = null;
      if (back > 0) { const [n, s] = cutSouth(strip, along); backRect = n; core = s; }
      Object.assign(g, { front, B, strip, rest, core, back: backRect });
    } else {
      const [a, b] = coreLeft ? cutWest(inner, across) : cutEast(inner, across);
      const strip = coreLeft ? a : b, rest = coreLeft ? b : a;
      const [upper, entry] = cutSouth(strip, df);
      let core = upper, backRect = null;
      if (back > 0) { const [n, s] = cutSouth(upper, along); backRect = n; core = s; }
      // the same band lines expressed for the upper floors (full-width front band over entry + rest)
      const front = R(inner.x0, entry.z0, inner.x1, entry.z1), B = R(inner.x0, inner.z0, inner.x1, entry.z0 - ti);
      Object.assign(g, { entry, strip, restFull: rest, rest: R(rest.x0, B.z0, rest.x1, B.z1), core, back: backRect, B, front });
    }
    g.restB = g.rest;
    return g;
  }
  // tight plot: core lies along x at the back, a full-width front band keeps the rest
  if (style === 'home' && Wi >= along + ti + 1.4 && Di >= across + ti + 2.2) {
    const dfx = Di - across - ti;
    const [B, front] = cutSouth(inner, dfx);
    const [a, b] = coreLeft ? [R(B.x0, B.z0, B.x0 + along, B.z1), R(B.x0 + along + ti, B.z0, B.x1, B.z1)] : [R(B.x1 - along, B.z0, B.x1, B.z1), R(B.x0, B.z0, B.x1 - along - ti, B.z1)];
    Object.assign(g, { orient: 'x', flip: !coreLeft, front, B, strip: a, core: a, rest: b, df: dfx });
    return g;
  }
  return { fail: true };
}
