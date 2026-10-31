// Nameplate layout for the race HUD. Pure geometry (no DOM, no THREE) so it runs under node:test; hud.js feeds it the projected craft positions and the
// rectangles of the HUD panels and touch buttons. A plate stays over its craft when it can, slides up or down past a panel or a neighbour when it
// cannot, is clamped inside the screen (never clipped by an edge) and is dropped rather than drawn over a panel (P-18 / V-28). Owner: UI agent.

export const PLATE = { max: 4, margin: 4, gap: 3, steps: 4 };
export const LOCK_SIDES = ['below', 'above', 'right', 'left'];

const hit = (a, b, pad) => a.l - pad < b.r && b.l < a.r + pad && a.t - pad < b.b && b.t < a.b + pad;

const area =(a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/** Where the target's name sits for a given side of the lock ring: ring = { x, y, r } (centre and half-size of the ring's box), label = { w, h }. */
export function lockLabelBox(side, ring, label, gap = 3) {
  const { x, y, r } = ring, { w, h } = label;
  switch (side) {
    case 'above': return { l: x - w / 2, t: y - r - gap - h, r: x + w / 2, b: y - r - gap };
    case 'right': return { l: x + r + gap, t: y - h / 2, r: x + r + gap + w, b: y + h / 2 };
    case 'left': return { l: x - r - gap - w, t: y - h / 2, r: x - r - gap, b: y + h / 2 };
    default: return { l: x - w / 2, t: y + r + gap, r: x + w / 2, b: y + r + gap + h };
  }
}

/** R2 P-18: the name slides out from the ring in whole LOCK_PUSH.step px (so a drifting target moves it a few times, not every frame); each px of slide costs `weight`; the side the name is on keeps a `stick` bonus. */
export const LOCK_PUSH = { step: 4, weight: 2, stick: 24 };

/**
 * R2 P-18: how far (px) the name must slide out from the ring, along its side's own direction, to come clear of the craft (a rectangle on the screen, or null when it is not in view):
 * 0 when it is clear already. Rounded up to a LOCK_PUSH.step. A name that sits across a wide craft on every side is slid past the craft's edge, not left on it.
 */
export function lockLabelPush(side, ring, label, craft, gap = 3) {
  if (!craft) return 0;
  const b = lockLabelBox(side, ring, label, gap);
  if (!(area(b, craft) > 0)) return 0;
  const d = side === 'above' ? b.b - craft.t : side === 'right' ? craft.r - b.l : side === 'left' ? b.r - craft.l : craft.b - b.t;
  return Math.ceil(d / LOCK_PUSH.step) * LOCK_PUSH.step;
}

/**
 * R2 P-18: which side of the lock ring the target's name sits on. It starts under the ring; with the target close ahead that lands across the player's own craft
 * (`craft`: the craft's rectangle on the screen, or null when it is not in view). Each side is scored by what its box covers after it has slid clear of the craft
 * (lockLabelPush): the outside of the screen (x1000), the HUD panels (`zones`, x0.2) and the slide itself (LOCK_PUSH.weight per px). The first side that costs nothing wins, the
 * current side first, so the name does not hop between frames; with none free, the cheapest wins and the current side keeps a LOCK_PUSH.stick bonus. Ties go in the order
 * below, above, right, left.
 */
export function lockLabelSide(ring, label, craft, zones, W, H, current = 'below', gap = 3) {
  const screen = { l: 0, t: 0, r: W, b: H }, full = label.w * label.h;
  let best = current, bestC = Infinity;
  for (const s of [current, ...LOCK_SIDES.filter((x) => x !== current)]) {
    const push = lockLabelPush(s, ring, label, craft, gap), b = lockLabelBox(s, ring, label, gap + push);
    let c = 1000 * (full - area(b, screen)) + LOCK_PUSH.weight * push;
    for (const z of zones) c += 0.2 * area(b, z);
    if (c < 1) return s;
    if (s === current) c -= LOCK_PUSH.stick;
    if (c < bestC - 1e-6) { best = s; bestC = c; }
  }
  return best;
}

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
