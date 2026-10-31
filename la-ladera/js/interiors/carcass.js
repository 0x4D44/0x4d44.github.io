// INTERIORS (A3): hollow carcasses and openable fronts of the storage furniture. Pure data + drawing, no runtime (containers.js opens them).
//
// Every piece of storage (wardrobe, dresser, nightstand, kitchen cupboard, tv stand, pantry, vitrine, chest, locker, shop counter, desk ...) is described by a
// LAYOUT computed from its catalogue entry alone, so a stand-in and a Blender hero of the same key agree on where the doors and drawers are:
//   slots[]   one per thing that opens: { i, kind: 'doors'|'drawer'|'lid', group (container kind of papers.js `where`), leaves[], rect, cav, surf[], rail,
//             travel, prompt:[open, close], who, pool, cap:[min,max] }       (item-local metres: x right, y up from the item's base, z = front)
//   panels[]  the shell round the cavities (sides, back, top, bottom, dividers, shelves)
// The stand-in draws panels + closed fronts; each front's index range in the merged building mesh is logged on the builder (`b.fronts`) so the runtime can
// hide the closed front and move a copy of it. A Blender hero follows the same layout and names its movable parts door_L / door_R / drawer_<k> / lid with the
// object origin at the hinge (doors, lids) or the slide origin (drawers): see dev/progress/A3.md "Openable heroes".

import { hashStr } from '../core/rng.js';

export const T = 0.018, TF = 0.02, GAP = 0.004, BACK = 0.012;
const hu = (id, k) => (hashStr(`${id}|${k}`) % 10007) / 10007;                                        // a stable number in [0, 1) per (record, k)
const MAGNETS = [0xd23a32, 0x2f6fbf, 0xe8c332, 0x2f9a58, 0xf0efe8];
export const CONTAINER_KINDS = ['nightstand', 'dresser', 'wardrobe', 'chest', 'tvstand', 'wallunit', 'vitrine', 'pantry', 'kitchen', 'fridge', 'desk', 'counter', 'locker', 'medcab', 'toolcab', 'filing'];

const spanN = (a, b, n) => Array.from({ length: n }, (_, i) => [a + ((b - a) * i) / n, a + ((b - a) * (i + 1)) / n]);
const hingeFor = (i, n) => (i < n / 2 ? 'L' : 'R');
const leaf = (x0, x1, y0, y1, hinge, o = {}) => ({ x0: x0 + GAP / 2, x1: x1 - GAP / 2, y0: y0 + GAP / 2, y1: y1 - GAP / 2, hinge, ...o });
const unite = (ls) => ({ x0: Math.min(...ls.map((l) => l.x0)), x1: Math.max(...ls.map((l) => l.x1)), y0: Math.min(...ls.map((l) => l.y0)), y1: Math.max(...ls.map((l) => l.y1)) });
/** A resting area: x0..x1, z0..z1 at height y with h of free height above it. `panel` (drawers): how far the drawer's front stands over y, which hides the thin things right behind it.
 *  `roof` (a closed cabinet): the underside of what covers it, which hides the deep part of the floor from a person who stands in front and looks down into it (contents.js seenDepth);
 *  `o.open` = no roof to speak of (a chest's lid swings away, glass shelves let the eye through). `o.margin` = how far under the roof the sight line must pass (contents.js ROOF_MARGIN when absent). */
const surf = (cav, y, h, o = {}) => ({ x0: o.x0 ?? cav.x0, x1: o.x1 ?? cav.x1, z0: cav.z0, z1: cav.z1, y, h, ...(o.panel === undefined ? (o.open ? null : { roof: y + h, margin: o.margin }) : { panel: o.panel, cot: o.cot, zr: o.zr }) });
/** The floor of the tray a drawer carries is TRAY thick (containers.js drawTray builds it from this number): whatever lies in the drawer rests on its TOP, not on the bottom of the cavity
 *  (R4-101: a 1.2 cm coin, a letter, a photo sank into the plywood and the drawer looked empty). */
export const TRAY = 0.012;
/** What a drawer's contents rest on: the top of the tray's floor, and only the part of the tray that slides out from under the carcass (`zf` = the front plane of the carcass, `travel` = how far the
 *  drawer comes out): the rear of a tray stays inside the box, under the top, where nobody looks. `lf` = the drawer's front, whose height over the floor hides what lies close behind it. */
const drawerSurf = (cav, lf, zf, travel) => {
  const y = cav.y0 + TRAY, panel = lf.y1 - y, rim = cav.y1 - 0.004;
  const cot = Math.min(1.2, Math.max(0.35, (EYE_AT - travel) / (EYE_Y - lf.y1)));                  // the eye over the top edge of the front, as a run per metre of drop
  const zr = cav.z0 + 0.01 + TRAY;                                                                  // the inside of the tray's back wall
  return surf({ ...cav, x0: cav.x0 + 0.004 + TRAY, x1: cav.x1 - 0.004 - TRAY, z0: Math.max(zr, zf - travel) + 0.01, z1: cav.z1 - 0.004 - 0.012 }, y, Math.min(rim - y, panel) - 0.004, { panel, cot, zr });
};
/** Where a person stands to open a drawer: this far in front of the carcass, eyes this high over the floor the piece stands on. */
export const EYE_AT = 0.75, EYE_Y = 1.6;

/** Panels are boxes in item-local min/max form: { x0,x1,y0,y1,z0,z1, m: 'body'|'ply', k: shade, skip }. */
const panel = (x0, x1, y0, y1, z0, z1, m = 'body', k = 1, skip) => ({ x0, x1, y0, y1, z0, z1, m, k, skip });
/** The shell of a box of width W, depth D whose fronts sit at zf (default D/2) from y0 to y1, and its x range [xa, xb]. */
function shell(W, D, y0, y1, o = {}) {
  const xa = o.xa ?? -W / 2, xb = o.xb ?? W / 2, zf = o.zf ?? D / 2 - TF, zb = o.zb ?? -D / 2, out = [];
  out.push(panel(xa, xa + T, y0, y1, zb, zf, 'body', 0.94, ['ny']), panel(xb - T, xb, y0, y1, zb, zf, 'body', 0.94, ['ny']));
  out.push(panel(xa + T, xb - T, y0 + (o.bottom === false ? 0 : 0), y0 + T, zb, zf, 'ply', 0.9, ['ny']));
  if (o.top !== false) out.push(panel(xa + T, xb - T, y1 - T, y1, zb, zf, 'body', 0.9));
  out.push(panel(xa + T, xb - T, y0 + T, y1 - (o.top === false ? 0 : T), zb, zb + BACK, 'ply', 0.82, o.wallBack ? ['nz'] : undefined));
  return out;
}
const cavity = (W, D, y0, y1, o = {}) => ({ x0: o.xa ?? -W / 2 + T, x1: o.xb ?? W / 2 - T, y0, y1, z0: (o.zb ?? -D / 2) + BACK, z1: o.zf ?? D / 2 - TF });

// ------------------------------------------------------------------ layouts by piece
function wardrobe(c) {
  const [W, H, D] = c.size, n = c.doors ?? 2, cav = cavity(W, D, 0.06, H - T), metal = c.mat === 'metal_painted';
  const split = -W / 2 + W * (n >= 3 ? 2 / 3 : 0.55), railY = H - 0.38;
  const panels = shell(W, D, 0, H);
  panels.push(panel(split - T / 2, split + T / 2, 0.06, H - T, cav.z0, cav.z1, 'ply', 0.9));                                   // divider: hanging | shelves
  panels.push(panel(cav.x0, split - T / 2, railY + 0.1, railY + 0.1 + T, cav.z0, cav.z1, 'ply', 0.95));                       // the shelf over the rail
  const sh = [];
  for (const y of metal ? [0.5, 0.95, 1.4] : [0.42, 0.8, 1.18, 1.56]) { panels.push(panel(split + T / 2, cav.x1, y, y + T, cav.z0, cav.z1, 'ply', 0.95)); sh.push(y + T); }
  const ls = spanN(-W / 2, W / 2, n).map(([a, b], i) => leaf(a, b, 0.0, H, hingeFor(i, n), i === 0 && H > 1.6 && !metal ? { deco: 'mirror' } : {}));
  const surfaces = [surf(cav, 0.06, 0.7, { x1: split - T / 2 }), surf(cav, railY + 0.1 + T, H - T - (railY + 0.1 + T), { x1: split - T / 2 }), surf(cav, 0.06, 0.36, { x0: split + T / 2 })];
  for (let k = 0; k < sh.length; k++) surfaces.push(surf(cav, sh[k], (sh[k + 1] ?? H - T) - sh[k] - T, { x0: split + T / 2 }));
  return { panels, slots: [{ i: 0, kind: 'doors', group: 'wardrobe', leaves: ls, rect: unite(ls), cav, surf: surfaces, rail: { x0: cav.x0 + 0.03, x1: split - T / 2 - 0.03, y: railY, z: 0 }, prompt: ['Abrir el armario', 'Cerrar el armario'], who: 'El armario', pool: 'wardrobe', cap: [5, 8] }] };
}
function nightstand(c) {
  const [W, H, D] = c.size, dh = 0.15, yd = H - 0.03 - dh, panels = shell(W, D, 0, H);
  panels.push(panel(-W / 2 + T, W / 2 - T, yd - T, yd, -D / 2 + BACK, D / 2 - TF, 'ply', 0.9));
  const dl = [leaf(-W / 2, W / 2, yd, H - 0.03, null)], cl = [leaf(-W / 2, W / 2, 0.04, yd, 'L')];
  const cd = cavity(W, D, yd + 0.002, H - T), cc = cavity(W, D, 0.04, yd - T);
  return { panels, slots: [
    { i: 0, kind: 'drawer', group: 'nightstand', leaves: dl, rect: unite(dl), cav: cd, surf: [drawerSurf(cd, dl[0], D / 2, Math.min(0.3, D * 0.75))], travel: Math.min(0.3, D * 0.75), prompt: ['Abrir el cajón de la mesita', 'Cerrar el cajón'], who: 'El cajón de la mesita', pool: 'nightstand_drawer', cap: [3, 5] },
    { i: 1, kind: 'doors', group: 'nightstand', leaves: cl, rect: unite(cl), cav: cc, surf: [surf(cc, 0.04, cc.y1 - cc.y0)], prompt: ['Abrir la mesita de noche', 'Cerrar la mesita de noche'], who: 'La mesita de noche', pool: 'nightstand_door', cap: [2, 4] },
  ] };
}
/** Rows of drawers across the whole front (dressers, filing cabinets, tool cabinets). */
function dresser(c) {
  const [W, H, D] = c.size, group = c.tags.includes('filing') ? 'filing' : c.tags.includes('tools') ? 'toolcab' : 'dresser', panels = shell(W, D, 0, H), slots = [];
  const mk = (i, xa, xb, ya, yb, pool, cap, prompt) => {
    const lf = [leaf(xa, xb, ya, yb, null)], cav = cavity(W, D, ya + 0.004, yb - 0.012, { xa: xa + (xa <= -W / 2 + 1e-6 ? T : T / 2), xb: xb - (xb >= W / 2 - 1e-6 ? T : T / 2) });
    slots.push({ i, kind: 'drawer', group, leaves: lf, rect: unite(lf), cav, surf: [drawerSurf(cav, lf[0], D / 2, Math.min(0.34, D * 0.75))], travel: Math.min(0.34, D * 0.75), prompt: prompt ?? ['Abrir el cajón', 'Cerrar el cajón'], who: 'El cajón', pool, cap });
  };
  if (c.name === 'dresser_low') {                                                                                           // a sideboard: three drawers over two doors
    const yd = H - 0.03 - 0.19;
    spanN(-W / 2, W / 2, 3).forEach(([a, b], i) => mk(i, a, b, yd, H - 0.03, 'dresser', [3, 5]));
    for (const x of [-W / 6, W / 6]) panels.push(panel(x - T / 2, x + T / 2, yd, H - T, -D / 2 + BACK, D / 2 - TF, 'ply', 0.9));
    panels.push(panel(-W / 2 + T, W / 2 - T, yd - T, yd, -D / 2 + BACK, D / 2 - TF, 'ply', 0.9));
    const ls = spanN(-W / 2, W / 2, 2).map(([a, b], i) => leaf(a, b, 0.04, yd, hingeFor(i, 2))), cv = cavity(W, D, 0.04, yd - T);
    slots.push({ i: 3, kind: 'doors', group, leaves: ls, rect: unite(ls), cav: cv, surf: [surf(cv, 0.04, cv.y1 - cv.y0)], prompt: ['Abrir el aparador', 'Cerrar el aparador'], who: 'El aparador', pool: 'sideboard', cap: [3, 6] });
    return { panels, slots };
  }
  const rows = group === 'dresser' ? (H > 0.7 ? 4 : 3) : group === 'filing' ? 4 : 4, y0 = 0.04, y1 = H - 0.03, dh = (y1 - y0) / rows;
  const pool = group === 'filing' ? 'filing' : group === 'toolcab' ? 'tools' : 'dresser', pr = group === 'filing' ? ['Abrir el archivador', 'Cerrar el archivador'] : group === 'toolcab' ? ['Abrir el cajón de herramientas', 'Cerrar el cajón'] : undefined;
  for (let r = 0; r < rows; r++) {
    mk(r, -W / 2, W / 2, y0 + (rows - 1 - r) * dh, y0 + (rows - r) * dh, pool, group === 'filing' ? [3, 5] : [3, 6], pr);        // slot 0 = the top drawer
    if (r < rows - 1) panels.push(panel(-W / 2 + T, W / 2 - T, y0 + (rows - 1 - r) * dh - T / 2, y0 + (rows - 1 - r) * dh + T / 2, -D / 2 + BACK, D / 2 - TF, 'ply', 0.9));
  }
  return { panels, slots };
}
/** Doors (n leaves) over one cavity: tv stand, pantry, the lower cabinet of a wall unit. */
function doorsBox(c, o) {
  const [W, H, D] = c.size, yb = o.yb ?? H, panels = shell(W, D, 0, yb), cav = cavity(W, D, o.floor ?? 0.04, yb - T), n = o.n ?? 2, ls = spanN(-W / 2, W / 2, n).map(([a, b], i) => leaf(a, b, 0.0, yb, o.hinges?.[i] ?? hingeFor(i, n)));
  const surfaces = [surf(cav, cav.y0, ((o.shelves?.[0] ?? cav.y1) - cav.y0))];
  (o.shelves ?? []).forEach((y, k) => { panels.push(panel(cav.x0, cav.x1, y, y + T, cav.z0, cav.z1, 'ply', 0.95)); surfaces.push(surf(cav, y + T, (o.shelves[k + 1] ?? cav.y1) - y - T)); });
  return { panels, slots: [{ i: 0, kind: 'doors', group: o.group, leaves: ls, rect: unite(ls), cav, surf: surfaces, prompt: o.prompt, who: o.who, pool: o.pool, cap: o.cap ?? [4, 7] }] };
}
function vitrine(c) {
  const [W, H, D] = c.size, ys = 0.7, med = c.tags.includes('clinic'), group = med ? 'medcab' : 'vitrine', panels = shell(W, D, 0, H);
  panels.push(panel(-W / 2 + T, W / 2 - T, ys - T, ys, -D / 2 + BACK, D / 2 - TF, 'ply', 0.9));
  const up = spanN(-W / 2, W / 2, 2).map(([a, b], i) => leaf(a, b, ys, H - 0.03, hingeFor(i, 2), { glass: true })), lo = spanN(-W / 2, W / 2, 2).map(([a, b], i) => leaf(a, b, 0.0, ys, hingeFor(i, 2)));
  const cu = cavity(W, D, ys + 0.01, H - 0.04), cl = cavity(W, D, 0.04, ys - T);
  const shelves = [0.72 + 0.33, 0.72 + 0.66].map((y) => { panels.push(panel(cu.x0, cu.x1, y, y + 0.012, cu.z0, cu.z1, 'glass', 1)); return y + 0.012; });
  const gl = { open: true };                                                                                                    // glass shelves: the eye sees through them
  const us = [surf(cu, cu.y0, shelves[0] - cu.y0 - 0.012, gl), surf(cu, shelves[0], shelves[1] - shelves[0] - 0.012, gl), surf(cu, shelves[1], cu.y1 - shelves[1], gl)];
  return { panels, slots: [
    { i: 0, kind: 'doors', group, leaves: up, rect: unite(up), cav: cu, surf: us, prompt: [med ? 'Abrir el botiquín' : 'Abrir la vitrina', med ? 'Cerrar el botiquín' : 'Cerrar la vitrina'], who: med ? 'El botiquín' : 'La vitrina', pool: med ? 'medcab' : 'vitrine', cap: [3, 6] },
    { i: 1, kind: 'doors', group, leaves: lo, rect: unite(lo), cav: cl, surf: [surf(cl, cl.y0, cl.y1 - cl.y0)], prompt: ['Abrir el mueble', 'Cerrar el mueble'], who: 'El mueble', pool: med ? 'medcab_low' : 'sideboard', cap: [3, 5] },
  ] };
}
function chest(c) {
  const [W, H, D] = c.size, yl = H - 0.06, cav = { x0: -W / 2 + T, x1: W / 2 - T, y0: T, y1: yl, z0: -D / 2 + T, z1: D / 2 - T };
  const panels = [panel(-W / 2, W / 2, 0, yl, -D / 2, -D / 2 + T, 'body', 0.94), panel(-W / 2, W / 2, 0, yl, D / 2 - T, D / 2, 'body', 0.94), panel(-W / 2, -W / 2 + T, 0, yl, -D / 2 + T, D / 2 - T, 'body', 0.94), panel(W / 2 - T, W / 2, 0, yl, -D / 2 + T, D / 2 - T, 'body', 0.94), panel(-W / 2 + T, W / 2 - T, 0, T, -D / 2 + T, D / 2 - T, 'ply', 0.9, ['ny'])];
  const lf = [{ x0: -W / 2 - 0.01, x1: W / 2 + 0.01, y0: yl, y1: H, z0: -D / 2 - 0.01, z1: D / 2 + 0.01, hinge: 'T' }];
  // a lift-out tray (the till of a trunk) 15 cm under the rim: what lies in the box lies up here, where a standing visitor sees it (R4-112: on the floor of a 0.4 m box a gold watch read as two white strips)
  const yt = yl - 0.15; panels.push(panel(cav.x0, cav.x1, yt - T, yt, cav.z0, cav.z1, 'ply', 0.9));
  return { panels, slots: [{ i: 0, kind: 'lid', group: 'chest', leaves: lf, rect: { x0: -W / 2, x1: W / 2, y0: yl, y1: H }, cav, surf: [surf(cav, yt, yl - yt - 0.01, { open: true })], prompt: ['Abrir el baúl', 'Cerrar el baúl'], who: 'El baúl', pool: 'chest', cap: [4, 7] }] };
}
function locker(c) {
  const [W, H, D] = c.size, panels = shell(W, D, 0, H), slots = [];
  panels.push(panel(-T / 2, T / 2, 0.06, H - T, -D / 2 + BACK, D / 2 - TF, 'ply', 0.9));
  spanN(-W / 2, W / 2, 2).forEach(([a, b], i) => {
    const ls = [leaf(a, b, 0.0, H, i ? 'R' : 'L')], cav = cavity(W, D, 0.06, H - T, { xa: i ? T / 2 : -W / 2 + T, xb: i ? W / 2 - T : -T / 2 });
    panels.push(panel(cav.x0, cav.x1, 1.45, 1.45 + T, cav.z0, cav.z1, 'ply', 0.95));
    slots.push({ i, kind: 'doors', group: 'locker', leaves: ls, rect: unite(ls), cav, surf: [surf(cav, 0.06, 1.38), surf(cav, 1.45 + T, H - T - 1.45 - T)], rail: { x0: cav.x0 + 0.03, x1: cav.x1 - 0.03, y: 1.38, z: 0 }, prompt: ['Abrir el casillero', 'Cerrar el casillero'], who: 'El casillero', pool: 'locker', cap: [3, 5] });
  });
  return { panels, slots };
}
/** Kitchen base units: one door per 0.6 m, each its own cupboard; wall cupboards: a pair of doors over one cavity. */
function kitchenBase(c) {
  const [W, H, D] = c.size, yb = H - 0.04, k = Math.max(1, Math.round(W / 0.6)), panels = shell(W, D, 0, yb, { top: false }), slots = [], sink = c.tags.includes('sink');
  spanN(-W / 2, W / 2, k).forEach(([a, b], i) => {
    const ls = [leaf(a, b, 0.0, yb, hingeFor(i, k))], cav = cavity(W, D, 0.04, yb, { xa: i ? a + T / 2 : -W / 2 + T, xb: i < k - 1 ? b - T / 2 : W / 2 - T });
    if (i) panels.push(panel(a - T / 2, a + T / 2, 0.04, yb, cav.z0, cav.z1, 'ply', 0.9));
    const mid = 0.04 + (yb - 0.04) / 2; panels.push(panel(cav.x0, cav.x1, mid, mid + T, cav.z0, cav.z1, 'ply', 0.95));
    slots.push({ i, kind: 'doors', group: 'kitchen', leaves: ls, rect: unite(ls), cav, surf: [surf(cav, 0.04, mid - 0.04), surf(cav, mid + T, yb - mid - T)], prompt: ['Abrir el mueble', 'Cerrar el mueble'], who: 'El mueble', pool: sink && i === 0 ? 'under_sink' : 'kitchen_base', cap: [3, 6] });
  });
  return { panels, slots };
}
function kitchenUpper(c) {
  const [W, H, D] = c.size, n = Math.max(2, Math.round(W / 0.45)), panels = shell(W, D, 0, H), cav = cavity(W, D, T, H - T), mid = H / 2, ls = spanN(-W / 2, W / 2, n).map(([a, b], i) => leaf(a, b, 0.0, H, hingeFor(i, n), { hy: 0.08 }));
  panels.push(panel(cav.x0, cav.x1, mid, mid + T, cav.z0, cav.z1, 'ply', 0.95));
  return { panels, slots: [{ i: 0, kind: 'doors', group: 'kitchen', leaves: ls, rect: unite(ls), cav, surf: [surf(cav, T, mid - T), surf(cav, mid + T, H - T - mid - T)], prompt: ['Abrir la alacena', 'Cerrar la alacena'], who: 'La alacena', pool: 'kitchen_upper', cap: [4, 7] }] };
}
/** A fridge: a freezer door over the main door (the small one, the shop's drinks fridge and the pharmacy's cold cabinet: one door). White inside, glass shelves. */
function fridgeBox(c) {
  const [W, H, D] = c.size, n = c.name, K = 0.03, two = n === 'fridge', split = two ? H * 0.62 : H;
  const panels = shell(W, D, K, H);
  for (const p of panels) if (p.m === 'ply') p.m = 'body';                                                                    // no plywood inside a fridge
  const shelfAt = (cv, ys) => ys.map((y) => { panels.push(panel(cv.x0, cv.x1, y, y + 0.012, cv.z0, cv.z1, 'glass', 1)); return y + 0.012; });
  const surfaces = (cv, sh) => { const ys = [cv.y0, ...sh], out = []; ys.forEach((y, k) => out.push(surf(cv, y, (sh[k] === undefined ? cv.y1 : sh[k] - 0.012) - y, { open: sh[k] !== undefined, margin: 0.09 }))); return out; };       // (a glass shelf lets the eye through, the top of the compartment does not: its edge is the freezer door's, whose target reaches 2.5 cm under it and 4 cm out in front of it: containers.js PAD and `slab`)
  const hinge = 'L', slots = [];
  const cm = cavity(W, D, K + T, two ? split - T / 2 : H - T), ys = n === 'fridge_drinks' ? [0.5, 0.95, 1.4] : n === 'fridge_small' ? [0.42] : [0.38, 0.68, 0.98].filter((y) => y < cm.y1 - 0.2);
  const shm = shelfAt(cm, ys);
  const main = [leaf(-W / 2, W / 2, K, split, hinge, { hy: two ? split - 0.36 : H * 0.5 - 0.12, hh: 0.3, glass: n === 'fridge_drinks' })];
  const pool = n === 'fridge_drinks' ? 'drinks' : n === 'fridge_meds' ? 'fridge_meds' : 'fridge';
  const nm = n === 'fridge_drinks' ? ['la nevera de bebidas', 'La nevera de bebidas'] : n === 'fridge_meds' ? ['la nevera de medicinas', 'La nevera de medicinas'] : ['la nevera', 'La nevera'];
  slots.push({ i: 0, kind: 'doors', group: 'fridge', leaves: main, rect: unite(main), cav: cm, surf: surfaces(cm, shm), prompt: [`Abrir ${nm[0]}`, 'Cerrar la nevera'], who: nm[1], pool, cap: [3, 6] });
  if (two) {
    panels.push(panel(-W / 2 + T, W / 2 - T, split - T / 2, split + T / 2, cm.z0, cm.z1, 'body', 0.95));
    const cf = cavity(W, D, split + T / 2, H - T), shf = shelfAt(cf, [split + 0.3]);
    const fr = [leaf(-W / 2, W / 2, split, H, hinge, { hy: split + 0.07, hh: 0.26, deco: 'magnets' })];
    slots.push({ i: 1, kind: 'doors', group: 'fridge', leaves: fr, rect: unite(fr), cav: cf, surf: surfaces(cf, shf), prompt: ['Abrir el congelador', 'Cerrar el congelador'], who: 'El congelador', pool: 'freezer', cap: [2, 4] });
  }
  return { panels, slots };
}

/** A shop counter: one drawer under the top, on the customer's side (+z) so the player can reach it. The rest of the body is solid. */
function counterDrawer(c) {
  const [W, H, D] = c.size, name = c.name, w = Math.min(0.55, W * (name === 'barber_station' ? 0.34 : 0.38)), yb = name === 'barber_station' ? H - 0.05 : 0.62, y1 = yb - 0.04, y0 = y1 - 0.2;
  const xs = name === 'barber_station' ? [-W / 4, W / 4] : [0];
  const slots = xs.map((x, i) => {
    const ls = [leaf(x - w / 2, x + w / 2, y0, y1, null)], cav = { x0: x - w / 2 + T, x1: x + w / 2 - T, y0: y0 + 0.004, y1: y1 - 0.012, z0: -D / 2 + 0.06, z1: D / 2 - TF };
    return { i, kind: 'drawer', group: 'counter', leaves: ls, rect: unite(ls), cav, surf: [drawerSurf(cav, ls[0], D / 2, Math.min(0.4, D * 0.6))], travel: Math.min(0.4, D * 0.6), prompt: name === 'barber_station' ? ['Abrir el cajón del tocador', 'Cerrar el cajón'] : ['Abrir el cajón del mostrador', 'Cerrar el cajón'], who: 'El cajón', pool: name === 'barber_station' ? 'barber' : name === 'pharmacy_counter' ? 'pharmacy_cash' : 'cash', cap: [4, 7] };
  });
  return { panels: [], pocket: { body: [-W / 2, W / 2, 0, yb, -D / 2, D / 2 - 0.004], windows: slots.map((s) => s.cav), fronts: slots.map((s) => s.rect) }, slots };
}
/** Where the drawer pedestal of a desk ends, from the desk's left end. What is left of the front is the knee-hole, and its middle is where a chair stands: KNEEHOLE m from the desk's middle (to the right), so
 *  the pedestal's drawers stay reachable beside the chair (a chair in the desk's middle stood half in front of them). */
const PEDESTAL = 0.39;
export const KNEEHOLE = PEDESTAL / 2;
/** Desk: a pedestal of three drawers at the left end. */
function deskDrawers(c) {
  const [W, H, D] = c.size, ph = H - 0.04, xa = -W / 2 + 0.01, xb = -W / 2 + PEDESTAL, zf = D / 2 - 0.02 - TF, zb = -(D - 0.04) / 2, panels = shell(W, D, 0, ph, { xa, xb, zf, zb }), slots = [], rows = 3, y0 = 0.03, dh = (ph - y0 - 0.02) / rows;
  const pool = c.name === 'desk_teacher' ? 'teacher_desk' : c.name === 'sewing_table' ? 'sewing' : c.name === 'desk_student' ? 'student_desk' : 'desk';
  for (let r = 0; r < rows; r++) {
    const ya = y0 + (rows - 1 - r) * dh, yb2 = y0 + (rows - r) * dh, ls = [leaf(xa, xb, ya, yb2, null)], cav = { x0: xa + T, x1: xb - T, y0: ya + 0.004, y1: yb2 - 0.012, z0: zb + BACK, z1: zf };
    if (r < rows - 1) panels.push(panel(xa + T, xb - T, ya - T / 2 + dh * 0, ya + T / 2, zb + BACK, zf, 'ply', 0.9));
    slots.push({ i: r, kind: 'drawer', group: 'desk', leaves: ls, rect: unite(ls), cav, surf: [drawerSurf(cav, ls[0], zf + TF, Math.min(0.3, D * 0.55))], travel: Math.min(0.3, D * 0.55), prompt: ['Abrir el cajón del escritorio', 'Cerrar el cajón'], who: 'El cajón', pool, cap: [3, 5], zf: zf + TF });
  }
  return { panels, slots, zf: zf + TF };
}

const BY_NAME = {
  wardrobe_2: wardrobe, wardrobe_3: wardrobe, wardrobe_metal: wardrobe, nightstand_a: nightstand, nightstand_b: nightstand,
  dresser_4: dresser, dresser_low: dresser, filing_cabinet: dresser, tool_cabinet_roll: dresser,
  tv_stand: (c) => doorsBox(c, { group: 'tvstand', n: 2, prompt: ['Abrir el mueble de la tele', 'Cerrar el mueble'], who: 'El mueble de la tele', pool: 'tvstand', cap: [3, 6] }),
  pantry_cabinet: (c) => doorsBox(c, { group: 'pantry', n: 2, floor: 0.06, shelves: [0.5, 0.92, 1.3, 1.62], prompt: ['Abrir la alacena', 'Cerrar la alacena'], who: 'La alacena', pool: 'pantry', cap: [5, 8] }),
  wall_unit_big: (c) => doorsBox(c, { group: 'wallunit', yb: 0.75, n: 3, hinges: ['L', 'L', 'R'], prompt: ['Abrir el mueble', 'Cerrar el mueble'], who: 'El mueble', pool: 'wallunit', cap: [4, 7] }),
  wall_unit_small: (c) => doorsBox(c, { group: 'wallunit', yb: 0.75, n: 3, hinges: ['L', 'L', 'R'], prompt: ['Abrir el mueble', 'Cerrar el mueble'], who: 'El mueble', pool: 'wallunit', cap: [4, 7] }),
  display_cabinet: vitrine, trophy_case: vitrine, med_cabinet: vitrine, chest_trunk: chest, locker_pair: locker,
  counter_base: kitchenBase, counter_base_long: kitchenBase, sink_kitchen: kitchenBase, sink_small: kitchenBase, kitchen_upper: kitchenUpper,
  shop_counter_glass: counterDrawer, shop_counter_wood: counterDrawer, shop_counter_short: counterDrawer, cafe_counter: counterDrawer, pharmacy_counter: counterDrawer, barber_station: counterDrawer,
  desk_wood: deskDrawers, desk_student: deskDrawers, desk_teacher: deskDrawers, desk_office: deskDrawers, sewing_table: deskDrawers,
  fridge: fridgeBox, fridge_small: fridgeBox, fridge_drinks: fridgeBox, fridge_meds: fridgeBox,
};
const CACHE = new Map();
/** The layout of a catalogue entry, or null when it does not open. Cached per key; a layout is a pure function of the entry. */
export function layoutOf(c) {
  if (!c?.name || !BY_NAME[c.name]) return null;
  let l = CACHE.get(c.name);
  if (!l) {
    l = BY_NAME[c.name](c); l.name = c.name; l.zf = l.zf ?? c.size[2] / 2;
    for (const s of l.slots) { s.zf = l.zf; s.n = s.leaves.length; if (s.kind === 'doors') s.travel = 0; }
    CACHE.set(c.name, l);
  }
  return l;
}
export const openableNames = () => Object.keys(BY_NAME);
/** Slot rect (the thing aimed at) of a layout slot, with its front plane. */
export const slotsOf = (c) => layoutOf(c)?.slots ?? [];

// ------------------------------------------------------------------ drawing (P = the stand-in Pen)
const mulc = (hex, k) => (hex == null ? undefined : ((Math.min(255, ((hex >> 16) & 255) * k) | 0) << 16) | ((Math.min(255, ((hex >> 8) & 255) * k) | 0) << 8) | (Math.min(255, (hex & 255) * k) | 0));
const bx = (P, mat, x0, x1, y0, y1, z0, z1, col, skip) => P.box(mat, (x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col, skip);
/** The colour of a door's pull: the door's own, well darkened (an untinted door is white, so only darker reads against it). */
export const pull = (col) => mulc(col ?? 0xffffff, 0.4);

/** The panels of the shell (and the pocket of a counter) of one piece. `col` = the tint of the body. */
export function drawShell(P, c, col, lay) {
  for (const p of lay.panels) bx(P, p.m === 'ply' ? 'plywood' : p.m === 'glass' ? 'glass' : c.mat, p.x0, p.x1, p.y0, p.y1, p.z0, p.z1, p.m === 'glass' ? undefined : mulc(col, p.k), p.skip);
  const pk = lay.pocket;
  if (pk) {                                                                                           // a solid body with one pocket per window: strips round the window, a block behind it, a floor and a ceiling
    const [X0, X1, Y0, Y1, Z0, Z1] = pk.body;
    const wins = pk.windows.slice().sort((a, b) => a.x0 - b.x0);
    let cx = X0;
    for (const w of wins) {
      if (w.x0 > cx + 1e-4) bx(P, c.mat, cx, w.x0, Y0, Y1, Z0, Z1, col, ['ny']);
      bx(P, c.mat, w.x0, w.x1, Y0, w.y0, Z0, Z1, col, ['ny']);                                       // below the window
      bx(P, c.mat, w.x0, w.x1, w.y1, Y1, Z0, Z1, col);                                               // above it
      bx(P, c.mat, w.x0, w.x1, w.y0, w.y1, Z0, w.z0, col);                                           // behind it
      cx = w.x1;
    }
    if (cx < X1 - 1e-4) bx(P, c.mat, cx, X1, Y0, Y1, Z0, Z1, col, ['ny']);
  }
  for (const s of lay.slots) if (s.rail) P.hcyl('metal_chrome', (s.rail.x0 + s.rail.x1) / 2, s.rail.y, s.rail.z, 0.009, s.rail.x1 - s.rail.x0, 'x', 8);        // the hanging rail
}

/** One front (a leaf of doors, a drawer front, a lid): drawn closed, its index ranges and its moving frame logged on the builder for containers.js. */
export function drawLeaf(P, c, col, lay, slot, j) {
  const lf = slot.leaves[j], zf = lay.zf, m = P.mark();
  if (slot.kind === 'lid') {
    bx(P, c.mat, lf.x0, lf.x1, lf.y0, lf.y1, lf.z0, lf.z1, mulc(col, 0.85));
    for (const sx of [-1, 1]) bx(P, 'metal_dark', sx * (lf.x1 - lf.x0) * 0.32 - 0.025, sx * (lf.x1 - lf.x0) * 0.32 + 0.025, lf.y0, lf.y1 + 0.004, lf.z0, lf.z1 + 0.004);
  } else {
    const x0 = lf.x0, x1 = lf.x1, y0 = lf.y0, y1 = lf.y1, w = x1 - x0, h = y1 - y0;
    if (lf.glass) {
      const f = 0.025;
      bx(P, c.mat, x0, x1, y0, y0 + f, zf - TF, zf, col); bx(P, c.mat, x0, x1, y1 - f, y1, zf - TF, zf, col);
      bx(P, c.mat, x0, x0 + f, y0 + f, y1 - f, zf - TF, zf, col); bx(P, c.mat, x1 - f, x1, y0 + f, y1 - f, zf - TF, zf, col);
      bx(P, 'glass', x0 + f, x1 - f, y0 + f, y1 - f, zf - 0.012, zf - 0.004);
    } else bx(P, c.mat, x0, x1, y0, y1, zf - TF, zf, col);
    if (lf.deco === 'mirror') bx(P, 'mirror', x0 + w * 0.15, x1 - w * 0.15, y0 + 0.3, y0 + 0.3 + h * 0.55, zf, zf + 0.004);
    if (slot.kind === 'drawer') bx(P, 'metal_chrome', (x0 + x1) / 2 - Math.min(0.07, w * 0.2), (x0 + x1) / 2 + Math.min(0.07, w * 0.2), (y0 + y1) / 2 - 0.008, (y0 + y1) / 2 + 0.008, zf, zf + 0.02);
    else {
      const hy = lf.hy ?? (h > 1.2 ? h * 0.5 - 0.07 : Math.max(y0 + 0.04, y1 - 0.2)), hh = lf.hh ?? (h > 1.2 ? 0.14 : Math.min(0.1, h * 0.4)), hx = lf.hinge === 'R' ? x0 + 0.04 : x1 - 0.04;
      bx(P, c.mat, hx - 0.008, hx + 0.008, hy, hy + hh, zf, zf + 0.02, pull(col));                      // the pull is the door's own material, a darker shade: ONE mesh per leaf while it swings (a chrome pull made every leaf two draw calls, a three-door wardrobe 8)
    }
    if (lf.deco === 'magnets' && P.r?.flags?.magnets) {                                                  // souvenirs on the fridge door: they swing with it
      const room = Math.min(0.1, (h - 0.25) / 5);
      for (let i = 0; i < 5; i++) { const u = hu(P.id, i), v = hu(P.id, 20 + i); bx(P, 'plastic_solid', x0 + w * 0.12 + u * w * 0.5, x0 + w * 0.12 + u * w * 0.5 + 0.05 + v * 0.04, y0 + 0.1 + i * room, y0 + 0.15 + i * room, zf, zf + 0.01, MAGNETS[Math.floor(hu(P.id, 40 + i) * MAGNETS.length)]); }
    }
  }
  const ranges = P.since(m);
  const x = lf.hinge === 'L' ? lf.x0 : lf.hinge === 'R' ? lf.x1 : (lf.x0 + lf.x1) / 2;
  const piv = slot.kind === 'doors' ? [x, lf.y0, zf - TF / 2] : slot.kind === 'lid' ? [0, lf.y1, lf.z0] : [(lf.x0 + lf.x1) / 2, (lf.y0 + lf.y1) / 2, zf - TF / 2];
  (P.b.fronts ??= []).push({ rec: P.id, slot: slot.i, leaf: j, kind: slot.kind, hinge: lf.hinge, ranges, piv: [P.X(piv[0], piv[2]), P.y0 + piv[1], P.Z(piv[0], piv[2])], fwd: [P.sn, P.cs], right: [P.cs, -P.sn] });
}

/** Panels + every closed front of a piece (the whole of the stand-in of a wardrobe, a dresser, a tv stand ...). */
export function drawOpenable(P, c, col, lay) {
  drawShell(P, c, col, lay);
  for (const s of lay.slots) for (let j = 0; j < s.leaves.length; j++) drawLeaf(P, c, col, lay, s, j);
}
