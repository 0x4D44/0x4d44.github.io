// Build the DATA layers of the world under plain Node (no browser, no WebGL): plan -> building plans -> furnishing ->
// colliders. Use it for fast invariant tests (reachability, overlaps, clearances) and for the reviewers' probes.
//
//   node --import ./la-ladera/tests/register.mjs your-test.mjs
//   import { buildData } from './headless.mjs';
//   const { ctx, plan, buildings } = await buildData({ lots: ['L00'] });   // lots optional
import './nice.mjs';   // low priority for every data test and probe built on buildData()
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { planBuilding } from '../js/arch/index.js';
import { furnishBuilding } from '../js/interiors/index.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function readAssetJson(rel) {
  try { return JSON.parse(await readFile(resolve(ROOT, 'assets/models', rel), 'utf8')); } catch { return null; }
}

/**
 * Returns { ctx, plan, buildings }. `ctx` is a real context (physics, rng, registries, assets manifest) without a renderer.
 * Options: { seed, lots:[ids], furnish:true, colliders:true }
 */
export async function buildData(o = {}) {
  const ctx = createContext({ seed: o.seed, headless: true });
  await ctx.assets.init(readAssetJson);
  ctx.plan = generatePlan(ctx);
  ctx.physics.setTerrain(ctx.plan.heightAt);
  if (o.lots) ctx.plan.lots = ctx.plan.lots.filter((l) => o.lots.includes(l.id));
  for (const lot of ctx.plan.lots) ctx.buildings.set(lot.id, planBuilding(ctx, lot));
  if (o.furnish !== false) for (const bp of ctx.buildings.values()) furnishBuilding(ctx, bp);
  if (o.colliders !== false) for (const bp of ctx.buildings.values()) ctx.physics.add(bp.colliders ?? {});
  return { ctx, plan: ctx.plan, buildings: [...ctx.buildings.values()] };
}
