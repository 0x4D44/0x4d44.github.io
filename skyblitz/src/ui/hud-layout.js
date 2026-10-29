// Nameplate layout for the race HUD. Pure geometry (no DOM, no THREE) so it runs under node:test; hud.js feeds it the projected craft positions and the
// rectangles of the HUD panels and touch buttons. A plate stays over its craft when it can, slides up or down past a panel or a neighbour when it
// cannot, is clamped inside the screen (never clipped by an edge) and is dropped rather than drawn over a panel (P-18 / V-28). Owner: UI agent.

export const PLATE = { max: 4, margin: 4, gap: 3, steps: 4 };

const hit = (a, b, pad) => a.l - pad < b.r && b.l < a.r + pad && a.t - pad < b.b && b.t < a.b + pad;

/**
 * cands: [{ id, x, y, w, h }] nearest first; (x, y) is the bottom centre of the plate over its craft, in px.
 * zones: [{ l, t, r, b }] rectangles to keep clear. Returns [{ id, i, l, t }] (candidate index and top-left of each placed plate), at most `max`, in input order.
 * Offsets tried per plate, in plate-heights: 0, -1, +1, -2, +2 ... up to `steps` (up first, so a stack grows away from the craft).
 */
export function layoutPlates(cands, zones, W, H, o = {}) {
  const { max, margin, gap, steps } = { ...PLATE, ...o };
  const placed = [], out = [];
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (out.length >= max) break;
    const l = Math.min(Math.max(c.x - c.w / 2, margin), Math.max(margin, W - margin - c.w));
    const t0 = Math.min(Math.max(c.y - c.h, margin), Math.max(margin, H - margin - c.h)), step = c.h + gap;
    for (let k = 0; k <= steps * 2; k++) {
      const n = (k + 1) >> 1, t = t0 + (k & 1 ? -n : n) * step;
      if (t < margin || t + c.h > H - margin) continue;
      const r = { l, t, r: l + c.w, b: t + c.h };
      if (zones.some((z) => hit(r, z, 0)) || placed.some((p) => hit(r, p, gap))) continue;
      placed.push(r); out.push({ id: c.id, i, l, t });
      break;
    }
  }
  return out;
}
