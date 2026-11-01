// Build the DATA layers of the world under plain Node (no browser, no WebGL): plan -> building plans -> furnishing ->
// colliders. Use it for fast invariant tests (reachability, overlaps, clearances) and for the reviewers' probes.
//
//   node --import ./la-ladera/tests/register.mjs your-test.mjs
//   import { buildData } from './headless.mjs';
//   const { ctx, plan, buildings } = await buildData({ lots: ['L00'] });   // lots optional
//   const full = await buildData({ world: true });                         // + the page's world: guard walls, perimeter, every prop collider
import './nice.mjs';   // low priority for every data test and probe built on buildData()
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { Clutter } from '../js/world/clutter.js';
import { planBuilding } from '../js/arch/index.js';
import { furnishBuilding } from '../js/interiors/index.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function readAssetJson(rel) {
  try { return JSON.parse(await readFile(resolve(ROOT, 'assets/models', rel), 'utf8')); } catch { return null; }
}

/**
 * The page loads the clutter GLBs in its 'assets' stage (world/clutter.js loadClutter); a headless context never asks, so a Node world build had no street clutter at all: its sweeps could not see a crate on
 * a walker's path, a bin in a doorway or a cone on a nav node. This parses the real files from disk and makes the same `ctx.clutter` the page has, so the colliders, nav clearances and decals are the page's.
 */
export async function loadClutterFromDisk(ctx) {
  const paths = new Set(ctx.assets.names('clutter').map((key) => ctx.assets.meta(key).glb));
  for (const path of paths) {
    const b = await readFile(resolve(ROOT, 'assets/models', path));
    const gl = await ctx.assets.loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
    gl.scene.updateMatrixWorld(true); ctx.assets.loaded.set(path, gl);
  }
  ctx.clutter = new Clutter(ctx);
  return ctx.clutter;
}

/**
 * Returns { ctx, plan, buildings }. `ctx` is a real context (physics, rng, registries, assets manifest) without a renderer.
 * Options: { seed, lots:[ids], furnish:true, colliders:true, world:false, clutter:true }
 * `world: true` runs the page's own stage order around the buildings (plan -> world -> arch -> furnish -> colliders -> props), so the physics holds
 * what the page holds: the retaining 'guard' walls on the street edges, the perimeter, and every prop collider (parked motos, planters, benches, street clutter).
 * Without it a sweep "falls" off street edges the guard walls really close, and cannot see a trap a prop makes.
 * `clutter: false` (or LADERA_CLUTTER=0 in the environment) builds the world without the Blender street clutter, as the page does with ?clutter=0.
 */
export async function buildData(o = {}) {
  const ctx = createContext({ seed: o.seed, headless: true });
  await ctx.assets.init(readAssetJson);
  ctx.plan = generatePlan(ctx);
  ctx.physics.setTerrain(ctx.plan.heightAt);
  if (o.lots) ctx.plan.lots = ctx.plan.lots.filter((l) => o.lots.includes(l.id));
  if (o.world) await buildWorld(ctx);
  for (const lot of ctx.plan.lots) ctx.buildings.set(lot.id, planBuilding(ctx, lot));
  if (o.furnish !== false) for (const bp of ctx.buildings.values()) furnishBuilding(ctx, bp);
  if (o.colliders !== false) for (const bp of ctx.buildings.values()) ctx.physics.add(bp.colliders ?? {});
  if (o.world && o.clutter !== false && process.env.LADERA_CLUTTER !== '0') await loadClutterFromDisk(ctx);
  if (o.world) await buildProps(ctx);
  return { ctx, plan: ctx.plan, buildings: [...ctx.buildings.values()] };
}
