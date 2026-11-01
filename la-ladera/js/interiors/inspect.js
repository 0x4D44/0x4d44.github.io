// INTERIORS (A3): the close-inspection objects in the drawers. assets/models/inspect holds 24 handheld things modelled in metres (a coin, a pocket watch, a diary, a letter, a toy car ...);
// js/interiors/inspect-bindings.json says which find, paper or ordinary thing of the game each one stands for, and inspect_data.js (generated from that file and the manifest) is what this
// file reads. A thing that is bound is drawn as its model, in the same drawer, on the same spot, under the same targets as before:
//
//   * FOOTPRINT   comes from the manifest's size (modelFor), never from what happens to be loaded: a drawer is packed the same in node and in the page, with the models or without them.
//   * STAND-IN    the thing's old flat-colour shape (props.js) is drawn until its GLB has loaded, and for good when the file is missing or broken (loadInspectAssets, inspectParts): a
//                 model that fails costs the look of one thing, never a drawer.
//   * POSE        a model lies the way the thing would: flat on its back, front up and head to the back of the drawer (a coin, a letter, a watch, the top on its side), or standing on its
//                 base (a toy car, the teddy, the harmonica).
//   * UNCHANGED   targets, the reader, the discovery, the journal and the 'Examinar' lines are the container's (containers.js, contents.js): nothing here knows about them.
// Pure data (no THREE, no DOM): the Pen (standins.js `model`) does the drawing, so node and the page share the file.
import { INSPECT, BINDINGS } from './inspect_data.js';

export { INSPECT, BINDINGS };
export const INSPECT_KEYS = Object.keys(INSPECT);

/** Models that do not lie flat on their back: 'stand' = as modelled, on its base (+Y up). Everything else is 'flat': turned a quarter about the width so its front faces up and its head points to
 *  the back of the drawer (the top, a solid of revolution along its own +Y, comes to lie on its side with its tip to the front). */
export const POSES = { inspect_toy_car: 'stand', inspect_toy_teddy: 'stand', inspect_harmonica: 'stand' };
/** A thing the library modelled smaller than the thing that stands for it (a crocheted tapete is a doily as wide as a hand and a half): the model is drawn this much bigger. */
export const SCALES = { inspect_lace: 2 };
/** The gold coin is the one model that follows the size of the find (a sovereign is 2.2 cm, a morrocota 3.7 cm): its scale is the find's size over the model's diameter, within these limits. */
export const COIN = 'inspect_gold_coin', COIN_LIMITS = [0.5, 1.3];
/** Room kept round a model on the shelf (each side), so two things never touch. */
export const MARGIN = 0.004;

const r4 = (v) => Math.round(v * 10000) / 10000;

/**
 * What draws the thing `id` (a find, a paper or an ordinary thing), or null when nothing is bound to it. `size` = the find's own size in metres (only the coin follows it), `sc` = the shrink
 * the packer asks for when the first try does not fit. `{ key, pose, s, h, w, d }`: the model's key, its pose, its scale, its height (the model's own: it rests on the surface) and the
 * footprint it takes on the shelf (w across, d deep, a margin included).
 */
export function modelFor(id, size = null, sc = 1) {
  const key = BINDINGS[id]; if (!key) return null;
  const [sx, sy, sz] = INSPECT[key].s, pose = POSES[key] ?? 'flat', up = pose === 'stand';
  const fit = key === COIN && size ? Math.max(COIN_LIMITS[0], Math.min(COIN_LIMITS[1], size / sx)) : SCALES[key] ?? 1, s = fit * sc;
  // a model that lies has its thickness (z) for height and its length (y) for depth; one that stands keeps them as modelled
  return { key, pose, s: r4(s), h: r4((up ? sy : sz) * s), w: r4(sx * s + 2 * MARGIN), d: r4((up ? sz : sy) * s + 2 * MARGIN) };
}

/** Is this key one of the library's models (a catalogue key of the inspect manifest)? */
export const isInspectKey = (key) => Object.hasOwn(INSPECT, key);

// ------------------------------------------------------------------ loading
/** The models whose GLB has loaded and whose parts are sound: `ctx.inspectGlb` (like `ctx.interiorGlb` for furniture and `ctx.garmentGlb` for clothes). */
function sound(ctx, parts) {
  if (!parts?.length) return false;
  for (const p of parts) {
    const pos = p.geometry?.attributes?.position, idx = p.geometry?.index;
    if (!pos || pos.itemSize !== 3 || pos.count < 3 || (ctx.matlib?.has && !ctx.matlib.has(p.matKey))) return false;
    for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) return false;
    if (idx) for (let i = 0; i < idx.count; i++) if (idx.getX(i) >= pos.count) return false;
  }
  return true;
}

/**
 * Load the library's GLBs (assets/models/manifest.inspect.json is one of the manifests Assets.init reads, so the keys are registered already) and remember the keys that loaded and can be drawn
 * in `ctx.inspectGlb`. A file that fails to download is a warning from the asset loader; its things keep their stand-ins. Returns how many models loaded.
 */
export async function loadInspectAssets(ctx) {
  ctx.inspectGlb = new Set();
  const a = ctx.assets, keys = INSPECT_KEYS.filter((k) => a?.has?.(k));
  if (!keys.length) return 0;
  try { await a.preload(keys); } catch (e) { (ctx.errors ??= []).push({ stage: 'interiors', message: 'inspect preload ' + String(e?.message ?? e) }); }
  for (const k of keys) {
    const e = a.meta(k);
    if (!e || !a.loaded?.has(e.glb)) continue;
    try { if (sound(ctx, a.parts(k))) ctx.inspectGlb.add(k); }
    catch (err) { (ctx.errors ??= []).push({ stage: 'interiors', name: k, message: 'inspect fallback: ' + String(err?.message ?? err) }); }
  }
  return ctx.inspectGlb.size;
}

/** The drawable parts of a loaded model ([{ geometry, matKey }] in the model's own space), or null while it is not loaded (the stand-in is drawn). */
export function inspectParts(ctx, key) {
  if (!ctx?.inspectGlb?.has(key)) return null;
  try { const parts = ctx.assets.parts(key); if (parts?.length) return parts; } catch { /* a model that cannot be read is a stand-in from now on */ }
  ctx.inspectGlb.delete(key);
  return null;
}
