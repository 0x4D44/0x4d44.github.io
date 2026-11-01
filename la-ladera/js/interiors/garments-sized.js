// Additional garment libraries are loaded separately from the established adult
// furnishing pass. Runtime keys include age; GLB node names retain their source names.
import { SIZED_GARMENTS } from './garments_data.js';
import { garmentsOff } from './garments.js';
import { glbParts } from './build.js';

export async function loadSizedGarmentAssets(ctx) {
  const keys = Object.keys(SIZED_GARMENTS);
  for (const key of keys) {
    const parts = ctx.interiorGlbParts?.get(key);
    for (const part of parts ?? []) { part.geometry.dispose(); for (const g of part.tinted.values()) g.dispose(); }
    ctx.interiorGlbParts?.delete(key);
  }
  ctx.sizedGarmentGlb = new Set();
  const a = ctx.assets;
  if (garmentsOff() || !a?.entries || !a.preload) return;
  const registered = keys.filter((key) => a.has(key));
  for (const key of registered) {
    const g = SIZED_GARMENTS[key], current = a.meta(key);
    // A caller may already have flattened the detail root through Assets.parts.
    // Those are owned clones; clear them when rebinding so the next draw uses LOD.
    for (const part of a.partCache?.get(key) ?? []) part.geometry.dispose();
    a.partCache?.delete(key);
    a.entries.set(key, { ...current, glb: g.lod.glb, node: g.lod.node });
  }
  // Assets.preload de-duplicates by GLB and catches individual fetch failures;
  // a missing library leaves its ready set empty and the other library available.
  try { await a.preload(registered); } catch (e) { (ctx.errors ??= []).push({ stage: 'garments-sized', message: 'preload ' + String(e?.message ?? e) }); }
  for (const key of registered) {
    const entry = a.meta(key);
    if (!a.loaded?.has(entry.glb)) continue;
    try { if (glbParts(ctx, key).length) ctx.sizedGarmentGlb.add(key); }
    catch (e) { (ctx.errors ??= []).push({ stage: 'garments-sized', name: key, message: 'model fallback: ' + String(e?.message ?? e) }); }
  }
}
