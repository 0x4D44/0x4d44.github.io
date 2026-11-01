// Small inhabited groupings beside walls and around plaza edges. Existing doors, nav edges, plants and public features
// already occupy their ground before this pass runs. All additions are deterministic and bounded; missing assets add nothing.
import { OCC } from './occupancy.js';
import { localToWorld } from './kit.js';

const GROUND_MASK = OCC.LOT | OCC.CORE | OCC.STAIR | OCC.DOOR | OCC.STEEP;
const STREET_KEYS = ['clutter_crate_wood', 'clutter_crate_plastic', 'clutter_bin_metal', 'clutter_tyre', 'clutter_cone', 'clutter_chair', 'clutter_sign', 'clutter_gas_cylinder'];
const TILE_NAMES = ['graffiti_barrio', 'poster_agua', 'poster_feria', 'repair_sign', 'graffiti_flor', 'poster_baile', 'no_basura', 'tienda_sign'];

/** Clear panels on the ground-floor FRONT wall. An opening anywhere in the panel excludes it, including shop shutters. */
export function clutterFacadePanels(bp, minWidth = 0.6) {
  const out = [];
  for (const wall of bp.shell?.walls ?? []) {
    if (wall.floor !== 0 || wall.side !== 'front' || wall.open) continue;
    let start = wall.a0 + 0.2;
    const openings = [...(wall.openings ?? [])].sort((a, b) => a.u0 - b.u0);
    for (const hole of [...openings, { u0: wall.a1, u1: wall.a1 }]) {
      const end = Math.min(wall.a1 - 0.2, hole.u0 - 0.18);
      if (end - start >= minWidth) out.push({ a: start, b: end, width: end - start });
      start = Math.max(start, hole.u1 + 0.18);
    }
  }
  return out;
}

/** Same 4x2 atlas cells and 8-pixel inner gutters as clutter_build.py. The PNG is bound by matlib, never embedded in GLB. */
export function clutterDecalUV(tile) {
  const i = typeof tile === 'string' ? TILE_NAMES.indexOf(tile) : tile;
  if (!Number.isInteger(i) || i < 0 || i >= 8) throw new Error('unknown clutter decal tile');
  const x = (i % 4) * 256, y = Math.floor(i / 4) * 256;
  return [(x + 8) / 1024, 1 - (y + 248) / 512, (x + 248) / 1024, 1 - (y + 8) / 512];
}

export function buildClutterDress(K) {
  const C = K.ctx.clutter;
  if (!C) return null;
  const placements = [], decals = [], stats = { ground: 0, plaza: 0, helmets: 0, shutters: 0, decals: 0 };
  const record = (r) => { placements.push(r); return true; };

  const ground = (key, x, z, yaw, scene, options = {}) => {
    const size = C.size(key); if (!size) return false;
    const radius = options.radius ?? Math.hypot(size[0], size[2]) / 2;
    // Umbrella cloth is above head height: keep its canopy off facades/doorways, while only its central pole occupies
    // the walking surface. Treating the canopy as a solid floor disc would forbid every plaza's pedestrian lattice.
    if (key === 'clutter_umbrella' && !K.occ.clear(x, z, Math.max(size[0], size[2]) / 2, OCC.LOT | OCC.DOOR | OCC.STAIR)) return false;
    if (Math.max(Math.abs(x), Math.abs(z)) > 96 || !K.occ.clear(x, z, radius, GROUND_MASK)
      || K.occ.overlaps(x, z, radius + 0.1) || K.occ.navDist(x, z) < radius + 0.62 || K.occ.slope(x, z) > 0.18) return false;
    const y = K.H(x, z) + 0.035;
    if (!C.place(key, x, y, z, yaw, { source: 'addition', scene })) return false;
    K.occ.take(x, z, radius + 0.1);
    // The canopy is above the pedestrian; its central pole alone needs a ground collider.
    if (key === 'clutter_umbrella') K.post(x, z, 0.055, 2.0, y);
    else K.rect(x, z, size[0], size[2], yaw, Math.min(size[1], 1.8), y, 0.025);
    stats.ground++; if (scene === 'plaza') stats.plaza++;
    return record({ key, x, y, z, yaw, scene, radius, navDistance: K.occ.navDist(x, z) });
  };

  // An economical rhythm along the facades: a delivery crate, a bin, a tyre outside the workshop, or a neighbour's chair.
  // Each has a real footprint; no item is put in a doorway just because its centre is outside it.
  let chosen = 0;
  for (const lot of K.plan.lots) {
    if (stats.ground >= 48) break;
    const r = K.rng('clutter:' + lot.id), at = localToWorld(lot.x, lot.z, lot.rotY);
    const key = STREET_KEYS[chosen % STREET_KEYS.length];
    const sz = C.size(key); if (!sz) continue;
    const offsets = [-lot.w / 2 + sz[0] / 2 + 0.25, lot.w / 2 - sz[0] / 2 - 0.25, -lot.w * 0.25, lot.w * 0.25];
    if (r.chance(0.5)) offsets.reverse();
    for (const u of offsets) {
      const [x, z] = at(u, lot.d / 2 + sz[2] / 2 + 0.46);
      if (ground(key, x, z, lot.rotY + r.range(-0.09, 0.09), 'alley')) { chosen++; break; }
    }
  }

  // Plaza corners gain a small market/resting place. The strict nav clearance leaves all through-routes open.
  for (const pl of K.plan.plazas) {
    if (pl.kind === 'court') continue;
    const at = localToWorld(pl.cx, pl.cz, pl.ry), slots = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (const inset of [1.5, 2.4, 3.2]) slots.push([sx * (pl.w / 2 - inset), sz * (pl.d / 2 - inset)]);
    }
    let anchor = null;
    for (const [lx, lz] of slots) {
      const [x, z] = at(lx, lz);
      if (ground('clutter_umbrella', x, z, pl.ry, 'plaza', { radius: 0.15 })) { anchor = [lx, lz]; break; }
    }
    if (!anchor) continue;
    // Search the free cells BETWEEN the plaza's nav lines for chairs and a delivery crate next to the umbrella. Fixed
    // corner slots often land exactly on the nav lattice; a deterministic small grid gives a real inhabited grouping.
    const candidates = [];
    for (let ix = -6; ix <= 6; ix++) for (let iz = -6; iz <= 6; iz++) {
      const dx = ix * 0.4, dz = iz * 0.4, d = Math.hypot(dx, dz);
      if (d < 0.9 || d > 3.2) continue;
      candidates.push({ lx: anchor[0] + dx, lz: anchor[1] + dz, score: Math.abs(d - 1.45) });
    }
    candidates.sort((a, b) => a.score - b.score);
    for (const key of ['clutter_chair', 'clutter_crate_plastic', 'clutter_chair']) {
      const size = C.size(key); if (!size) continue;
      const radius = Math.hypot(size[0], size[2]) / 2;
      for (const p of candidates) {
        if (Math.abs(p.lx) > pl.w / 2 - radius - 0.15 || Math.abs(p.lz) > pl.d / 2 - radius - 0.15) continue;
        const [x, z] = at(p.lx, p.lz), yaw = pl.ry + Math.atan2(anchor[0] - p.lx, anchor[1] - p.lz);
        if (ground(key, x, z, yaw, 'plaza')) break;
      }
    }
  }

  // A helmet rests ON an already parked bike. The geometry builder records its exact seat pose, including pitch.
  const motos = K.ctx.world.motoSeats ?? [];
  for (let i = 0; i < motos.length; i += 4) {
    const { x, y, z, yaw, pitch } = motos[i];
    if (C.place('clutter_helmet', x, y, z, yaw, { pitch, source: 'addition', scene: 'street', near: 14, far: 48 })) {
      stats.helmets++; record({ key: 'clutter_helmet', x, y, z, yaw, pitch, scene: 'street' });
    }
  }

  // Original posters and graffiti on solid wall panels. Shared material / texture; two triangles each, no extra shadow pass.
  // A few narrow roller shutters are stored against a BLANK workshop wall, not pasted over any playable door or window.
  let panelCount = 0;
  for (const bp of K.ctx.buildings.values()) {
    if (stats.decals >= 24) break;
    const panels = clutterFacadePanels(bp), lot = bp.lot;
    if (!panels.length) continue;
    const pane = panels.sort((a, b) => b.width - a.width)[0], u = (pane.a + pane.b) / 2;
    const [cx, , cz] = bp.frame.toWorld(u, 0, lot.d / 2 + 0.018);
    const tile = panelCount++ % 8, graffiti = tile === 0 || tile === 4;
    if ((lot.shop === 'taller' || lot.shop === 'ferreteria' || (panelCount % 7 === 0)) && pane.width > 1.15 && stats.shutters < 4) {
      // A spare shutter is a shallow wall fixture, wholly inside the already blocked building strip. Reserve its panel
      // instead of drawing a poster that would disappear behind it.
      const pos = bp.frame.toWorld(u, 0.08, lot.d / 2 + 0.11);
      if (C.fit('clutter_shutter', ...pos, lot.rotY, [Math.min(1.2, pane.width - 0.25), 1.85, 0.16], { source: 'addition', scene: 'alley', building: bp.id })) {
        stats.shutters++; continue;
      }
    }
    const w = Math.min(pane.width * 0.84, graffiti ? 1.5 : 0.64), h = graffiti ? Math.min(1.0, w * 0.65) : 0.85;
    const bottom = graffiti ? 0.65 : 1.05;
    const P = (lx, yy) => bp.frame.toWorld(u + lx, yy, lot.d / 2 + 0.018);
    const uv = clutterDecalUV(tile), b = K.b('clutterDecals', cx, cz, { cast: false });
    b.quad('clutter_decal', P(-w / 2, bottom), P(w / 2, bottom), P(w / 2, bottom + h), P(-w / 2, bottom + h),
      { uv: [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], col: [1, 1, 1] });
    stats.decals++; decals.push({ building: bp.id, tile: TILE_NAMES[tile], x: cx, y: lot.y + bottom, z: cz, width: w, height: h });
  }

  K.ctx.world.clutterDress = stats;
  K.ctx.world.clutterPlacements = placements;
  K.ctx.world.clutterDecals = decals;
  return stats;
}
