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
import { drawStandin, setAtlas, tintFor, u01 } from './standins.js';
import { paintDecalAtlas, atlasMaterial } from './atlas.js';
import { dressWindows } from './windows.js';
import { buildRotors, buildTvGlow, makeTvGlowMaterial } from './anim.js';

const M = new THREE.Matrix4(), S = new THREE.Matrix4();
const MAX_REPORTED = 12;

/** Preload the GLBs of every catalogue key that has an asset; the keys that actually loaded are remembered on ctx.interiorGlb. Paints the decal atlas (browser only). */
export async function loadInteriorAssets(ctx) {
  ctx.interiorGlb = new Set();
  // A retry may replace a previously failed model. Do not retain flattened parts from an older load.
  for (const parts of ctx.interiorGlbParts?.values() ?? []) for (const p of parts) {
    p.geometry.dispose(); for (const g of p.tinted.values()) g.dispose();
  }
  ctx.interiorGlbParts = new Map();
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
  for (const n of names) {
    const e = a.meta(n);
    if (!e || !a.loaded?.has(e.glb)) continue;
    try {
      // Loading a shared file does not prove that this particular named asset exists and is drawable.
      if (glbParts(ctx, n).length) ctx.interiorGlb.add(n);
    } catch (e) { (ctx.errors ??= []).push({ stage: 'interiors', name: n, message: 'model fallback: ' + String(e?.message ?? e) }); }
  }
}

const _tc = new THREE.Color();

/** Reject a broken part before any vertices are appended to a building. Checked once per loaded asset. */
function checkPart(geometry, name) {
  const p = geometry?.attributes?.position;
  if (!p || p.itemSize !== 3 || p.count < 3) throw new Error(`${name}: missing mesh positions`);
  for (const [key, width] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
    const a = geometry.attributes[key];
    if (!a) continue;
    if (a.count !== p.count || a.itemSize < width) throw new Error(`${name}: invalid ${key} attribute`);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < width; k++) {
      if (!Number.isFinite(a.getComponent(i, k))) throw new Error(`${name}: non-finite ${key}`);
    }
  }
  const index = geometry.index, count = index?.count ?? p.count;
  if (!count || count % 3) throw new Error(`${name}: invalid triangle indices`);
  if (index) for (let i = 0; i < count; i++) {
    const k = index.getX(i);
    if (!Number.isInteger(k) || k < 0 || k >= p.count) throw new Error(`${name}: index outside mesh`);
  }
}

/**
 * The drawable parts of one asset, read once from its loaded GLB (tools/blender/furn_lib.py names them `<key>-<flag>-...-<n>`):
 *   tint            the part takes the record's tint (its vertex colours, if it has any, are shades that multiply the tint)
 *   made / unmade   drawn only for a made / an unmade bed (rec.flags.unmade)
 *   magnets         drawn only when the record asks for fridge magnets (rec.flags.magnets)
 *   p<a-z><k>       one of several alternatives of channel <a-z>: exactly one k is drawn, picked by the record id
 * Anything else is always drawn. A part keeps its own library material (the glTF material name) and its own vertex colours.
 */
export function glbParts(ctx, name) {
  const cache = (ctx.interiorGlbParts ??= new Map());
  let parts = cache.get(name);
  if (parts) return parts;
  parts = [];
  const e = ctx.assets.meta(name), gl = e && ctx.assets.loaded.get(e.glb), node = gl?.scene.getObjectByName(e.node);
  if (node) {
    node.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(node.matrixWorld).invert(), mm = new THREE.Matrix4();
    try { node.traverse((o) => {
      if (!o.isMesh) return;
      const geometry = o.geometry.clone().applyMatrix4(mm.multiplyMatrices(inv, o.matrixWorld));
      const matKey = (Array.isArray(o.material) ? o.material[0] : o.material)?.name;
      try {
        checkPart(geometry, o.name);
        if (!matKey || matKey === 'missing_asset' || (ctx.matlib?.has && !ctx.matlib.has(matKey))) throw new Error(`${o.name}: unknown material '${matKey}'`);
      } catch (e) { geometry.dispose(); throw e; }
      const flags = o.name.split('-').slice(1, -1), pick = flags.map((f) => /^p([a-z])(\d+)$/.exec(f)).find(Boolean);
      parts.push({
        geometry, matKey, colored: !!geometry.attributes.color,
        tint: flags.includes('tint'), made: flags.includes('made'), unmade: flags.includes('unmade'), magnets: flags.includes('magnets'),
        ch: pick ? pick[1] : null, k: pick ? +pick[2] : 0, tinted: new Map(),
      });
    }); } catch (e) { for (const p of parts) p.geometry.dispose(); throw e; }
    const n = {};                                                                    // alternatives per channel = highest index + 1
    for (const p of parts) if (p.ch) n[p.ch] = Math.max(n[p.ch] ?? 0, p.k + 1);
    for (const p of parts) p.choices = p.ch ? n[p.ch] : 0;
  }
  // Missing nodes are not cached: a later successful load can replace the stand-in.
  if (parts.length) cache.set(name, parts);
  return parts;
}

/** The part's geometry with its shades multiplied by the tint (cached per tint colour: palettes are small). */
function tintedGeometry(p, tint) {
  let g = p.tinted.get(tint);
  if (!g) {
    g = p.geometry.clone(); _tc.setHex(tint);
    const a = g.attributes.color;
    for (let i = 0; i < a.count; i++) a.setXYZ(i, a.getX(i) * _tc.r, a.getY(i) * _tc.g, a.getZ(i) * _tc.b);
    p.tinted.set(tint, g);
  }
  return g;
}

/** Draw one record from its GLB; returns the number of parts drawn (0 = use the stand-in). */
function drawGlb(ctx, b, rec, c) {
  const parts = glbParts(ctx, rec.name);
  if (!parts.length) return 0;
  M.makeRotationY(rec.ry ?? 0).setPosition(rec.x, rec.kind === 'ceil' ? rec.y - c.size[1] : rec.y, rec.z);       // ceiling fixtures: rec.y is the ceiling, the model stands on y = 0 like every other
  if (rec.kind === 'wall' && ((rec.w && Math.abs(rec.w - c.size[0]) > 0.02) || (rec.h && Math.abs(rec.h - c.size[1]) > 0.02))) {
    M.multiply(S.makeScale(rec.w ? rec.w / c.size[0] : 1, rec.h ? rec.h / c.size[1] : 1, 1));          // stretched hangings (clothesline)
  }
  const tint = rec.tint == null ? null : tintFor(c, rec.tint), unmade = !!rec.flags?.unmade;
  const chosen = {};
  const draws = [];
  for (const p of parts) {
    if (p.made && unmade) continue;
    if (p.unmade && !unmade) continue;
    if (p.magnets && !rec.flags?.magnets) continue;
    if (p.ch) { chosen[p.ch] ??= Math.floor(u01(rec.id, 11 + p.ch.charCodeAt(0)) * p.choices) % p.choices; if (chosen[p.ch] !== p.k) continue; }
    const shaded = p.tint && tint != null && p.colored;
    draws.push({ p, geometry: shaded ? tintedGeometry(p, tint) : p.geometry, col: p.tint && !p.colored && tint != null ? tint : undefined });
  }
  // Prepare every selected part (including tint copies) before writing any of them.
  for (const { p, geometry, col } of draws) b.geometry(p.matKey, geometry, M, { col });
  return draws.length;
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
      if (glb?.has(rec.name)) {
        try { n = drawGlb(ctx, b, rec, c); }
        catch (e) {
          // A malformed GLB must not leave a hole in an otherwise furnished room.
          glb.delete(rec.name);
          if (reported++ < MAX_REPORTED) (ctx.errors ??= []).push({ stage: 'interiors', building: bp.id, name: rec.name, message: 'model fallback: ' + String(e?.message ?? e) });
        }
      }
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
