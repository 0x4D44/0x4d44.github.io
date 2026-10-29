// INTERIORS (A3): meshes. One MeshBuilder per building (group `${bp.id}.int`): every furniture record becomes either its Blender GLB
// (when a model for that catalogue key is loaded) or a stand-in made of a few boxes / cylinders (standins.js). Both are merged by the
// Batcher into ONE mesh per material, tinted with vertex colours, so a building's whole interior costs ~20-30 draw calls and only
// the buildings near the player are shown (engine/visibility.js toggles the group).
//
// A GLB replaces its stand-in through the SAME catalogue key (assets/models/manifest.furniture.json); anything without a GLB keeps
// its stand-in, so the page is never empty and one broken model never breaks a building.
import * as THREE from 'three';
import { CATALOG } from './catalog.js';
import { decalDef } from './decals.js';
import { drawStandin, setAtlas } from './standins.js';
import { paintDecalAtlas, atlasMaterial } from './atlas.js';
import { dressWindows } from './windows.js';
import { buildRotors, buildTvGlow, makeTvGlowMaterial } from './anim.js';

const M = new THREE.Matrix4(), S = new THREE.Matrix4();
const MAX_REPORTED = 12;

/** Preload the GLBs of every catalogue key that has an asset; the keys that actually loaded are remembered on ctx.interiorGlb. Paints the decal atlas (browser only). */
export async function loadInteriorAssets(ctx) {
  ctx.interiorGlb = new Set();
  try {
    const atlas = ctx.matlib?.cache ? paintDecalAtlas() : null;
    if (atlas) { ctx.matlib.cache.set('decal_atlas', atlasMaterial(atlas)); setAtlas(atlas); ctx.interiorAtlas = atlas; }
    makeTvGlowMaterial(ctx);
  } catch (e) { (ctx.errors ??= []).push({ stage: 'interiors', message: 'atlas ' + String(e?.message ?? e) }); }
  const a = ctx.assets;
  if (!a?.names) return;
  const names = a.names().filter((n) => CATALOG[n]);
  if (!names.length) return;
  try { await a.preload(names); } catch (e) { (ctx.errors ??= []).push({ stage: 'interiors', message: 'preload ' + String(e?.message ?? e) }); }
  for (const n of names) { const e = a.meta(n); if (e && a.loaded?.has(e.glb)) ctx.interiorGlb.add(n); }
}

/** Draw one record from its GLB; returns the number of parts drawn (0 = use the stand-in). */
function drawGlb(ctx, b, rec, c) {
  const parts = ctx.assets.parts(rec.name);
  if (!parts.length) return 0;
  M.makeRotationY(rec.ry ?? 0).setPosition(rec.x, rec.y, rec.z);
  if (rec.kind === 'wall' && ((rec.w && Math.abs(rec.w - c.size[0]) > 0.02) || (rec.h && Math.abs(rec.h - c.size[1]) > 0.02))) {
    M.multiply(S.makeScale(rec.w ? rec.w / c.size[0] : 1, rec.h ? rec.h / c.size[1] : 1, 1));          // stretched hangings (clothesline)
  }
  for (const p of parts) b.geometry(p.matKey, p.geometry, M, { col: p.matKey === c.mat ? (rec.tint ?? undefined) : undefined });
  return parts.length;
}

/**
 * Build the interior meshes of one building from `bp.furniture` (made by furnishBuilding). Safe to call once per building; it flushes its
 * own group straight away so the temporary vertex arrays of one building are released before the next one is built.
 */
export function buildInterior(ctx, bp) {
  const recs = bp.furniture;
  if (!recs?.length) return;
  const id = `${bp.id}.int`, lot = bp.lot ?? {};
  const group = ctx.batch.group(id, { cast: false, receive: true });
  const b = group.builder;
  b.setBasePose(lot.x ?? 0, lot.y ?? 0, lot.z ?? 0, lot.rotY ?? 0);
  const glb = ctx.interiorGlb, st = { records: recs.length, glb: 0, standin: 0, prims: 0, failed: 0 };
  let reported = 0;
  for (const rec of recs) {
    const c = rec.decal ? decalDef(rec.decal) : CATALOG[rec.name];
    if (!c) { st.failed++; continue; }
    try {
      let n = 0;
      if (glb?.has(rec.name)) n = drawGlb(ctx, b, rec, c);
      if (n) st.glb++; else { n = drawStandin(b, rec, c); st.standin++; }
      st.prims += n;
    } catch (e) {
      st.failed++;
      if (reported++ < MAX_REPORTED) (ctx.errors ??= []).push({ stage: 'interiors', building: bp.id, item: rec.id, name: rec.name, message: String(e?.message ?? e), stack: e?.stack });
    }
  }
  try {
    st.curtains = dressWindows(b, bp);
    st.fans = buildRotors(ctx, bp, group, recs, CATALOG);
    st.tvs = buildTvGlow(ctx, bp, b, recs, CATALOG);
  } catch (e) { (ctx.errors ??= []).push({ stage: 'interiors', building: bp.id, message: 'dressing ' + String(e?.message ?? e), stack: e?.stack }); }
  st.tris = b.tris; st.materials = b.accs.size;
  ctx.batch.flush(id);
  if (bp.interior) bp.interior.stats = st;
}
