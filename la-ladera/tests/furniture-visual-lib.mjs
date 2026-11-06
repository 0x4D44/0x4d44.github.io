// Studio inspection of model files. The world renderer still chooses hollow,
// opening carcasses for some keys; a model contact sheet must inspect those GLBs
// too, without changing the world's furniture policy or drawing a stand-in.
import { CATALOG, PAL } from '../js/interiors/catalog.js';
import { loadInteriorAssets, drawGlb } from '../js/interiors/build.js';

export const VISUAL_SOURCES = ['library', 'runtime'];

/** Load the base library or the effective model registry (including hero overrides). */
export async function loadVisualFurniture(ctx, { source = 'library', read } = {}) {
  if (!VISUAL_SOURCES.includes(source)) throw new Error(`Unknown furniture visual source '${source}'`);
  if (source === 'runtime') await ctx.assets.init(read);
  else {
    const readManifest = read ?? (async (file) => {
      const response = await fetch(ctx.assets.root + file, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      return response.json();
    });
    await ctx.assets.init((file) => file === 'manifest.json'
      ? { files: ['manifest.furniture.json'] } : readManifest(file));
  }
  await loadInteriorAssets(ctx);
  const keys = Object.keys(CATALOG);
  for (const key of keys) if (!ctx.interiorGlb.has(key)) throw new Error(`Missing drawable ${source} GLB for catalogue key ${key}`);
  return { source, keys, files: [...new Set(keys.map((key) => ctx.assets.meta(key).glb))] };
}

/** Render one actual GLB with production tint/variant selection and material batching. */
export function drawVisualFurniture(ctx, key, overrides = {}) {
  const c = CATALOG[key];
  if (!c || !ctx.interiorGlb?.has(key)) throw new Error(`Missing drawable GLB for ${key}`);
  const palette = PAL[c.cols] ?? PAL.none;
  const kind = c.ceil ? 'ceil' : c.wall ? 'wall' : c.top === true ? 'top' : 'floor';
  const rec = {
    id: 'contact.' + key, name: key, x: 0, y: kind === 'ceil' ? c.size[1] : 0, z: 0, ry: 0, kind,
    w: c.size[0], h: c.size[1], d: c.size[2], tint: c.cols === 'none' ? undefined : palette[0],
    flags: { magnets: true }, ...overrides,
  };
  const id = 'contact-' + key + '.int';
  if (ctx.batch.groups.has(id)) throw new Error(`Visual sample ${key} has not been disposed`);
  const group = ctx.batch.group(id, { cast: true, receive: true }), b = group.builder;
  try {
    const prims = drawGlb(ctx, b, rec, c);
    if (!prims || !b.tris) throw new Error(`${key}: model has no selected drawable geometry`);
    const stats = { glb: 1, standin: 0, failed: 0, prims, tris: b.tris, materials: b.accs.size };
    ctx.batch.flush(id);
    return { group, stats, kind, file: ctx.assets.meta(key).glb };
  } catch (e) {
    for (const mesh of group.meshes) mesh.geometry.dispose();
    group.obj.removeFromParent(); ctx.batch.groups.delete(id);
    throw e;
  }
}
