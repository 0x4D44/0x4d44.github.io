// Appearance: garment colour maths and the per-person variant generator. PURE (no THREE, no DOM) so Node tests can import it.
//
// A character GLB bakes `tint * ambient occlusion` into COLOR_0 and stores a garment slot id in the alpha channel. A variant { top, bottom, shoes, hat,
// accessory, inner } (hex colours) multiplies the colours of its slots by newTint / bakedTint (rig.js recolourAttribute), so one body gives dozens of looks.
// The maths here mirrors hex_tint in tools/blender/people_build.py: linear * gain, clamped to 1.
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function hexLinear(hex) {
  let h = hex.toLowerCase(); if (h.length === 4) h = '#' + [...h.slice(1)].map((c) => c + c).join('');
  return [1, 3, 5].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
}
export const tintOf = (hex, gain = 1.25) => hexLinear(hex).map((c) => Math.min(1, c * gain));
/** rig.js clamps newTint / bakedTint at this ratio; a variant that needs more would come out darker than asked. */
export const RATIO_MAX = 6;

/** Stable text key of a variant (also the cache key and the second half of the `appearance` string published by ctx.people). */
export const variantKey = (spec) => Object.keys(spec ?? {}).sort().map((k) => `${k}:${spec[k]}`).join(',');
export const appearanceKey = (charId, spec) => `${charId}|${variantKey(spec)}`;

/** Per-channel newTint / bakedTint of one slot (what recolourAttribute multiplies the baked colour by). */
export function slotRatio(slot, hex) {
  const base = tintOf(slot.hex, slot.gain), now = tintOf(hex, slot.gain);
  return [0, 1, 2].map((c) => now[c] / Math.max(base[c], 0.004));
}
/** How far (linear tint space) a new colour sits from the baked one: a variant must be clearly different to count as one. */
export const slotDistance = (slot, hex) => { const a = tintOf(slot.hex, slot.gain), b = tintOf(hex, slot.gain); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };

// Natural palettes of a Colombian barrio. Tops are the most visible garment, so they get the widest range.
export const PALETTE = {
  top: ['#c8573c', '#d9a441', '#3a7ca5', '#6fae8f', '#e08aa0', '#8f5fa8', '#e9e4d6', '#2f6f5e', '#b03a48', '#d4a373', '#5a7fb0', '#7a8f3c', '#e07a2f', '#9b6b4a', '#4b6584',
    '#f2c14e', '#a3446b', '#2e8b8b', '#cfd2d6', '#5b7f4a', '#c99a6a', '#7a4f8c', '#d65f5f', '#3f5f8a', '#e8c9a0'],
  topElder: ['#8a5a3a', '#6e6a5e', '#5a6a82', '#7d5a78', '#4f6b58', '#a08060', '#6c7a8a', '#8a4a4a', '#b0a58a', '#566b73'],
  topKid: ['#f0d36a', '#e07a2f', '#3a7ca5', '#c8573c', '#6fae8f', '#e08aa0', '#8f5fa8', '#4fb3bf', '#d65f5f', '#7bbf5a'],
  bottom: ['#2f3e57', '#3a3f4a', '#4a4d52', '#6a5a44', '#2b2b3a', '#5a6c8a', '#8a7a5e', '#3d4f3a', '#59392b', '#1f2430', '#6b6f78', '#4b3a5a'],
  shoes: ['#2a1c14', '#f2f2f2', '#3a3a3a', '#6b4a2a', '#b03060', '#2a2a2e', '#c0c0c0', '#8a3b2a', '#2f4f7a'],
  hat: ['#cdb88a', '#58564f', '#d6c08a', '#8a5a3a', '#3a3a46', '#c8573c', '#e6e0d0', '#2f4f7a'],
  accessory: ['#7e57c2', '#8a5a3a', '#202225', '#c0392b', '#e0609a', '#d9a441', '#2e8b8b', '#4b6584'],
  inner: ['#e8e0f0', '#d8d2c2', '#f2f2f2', '#cfe3d6', '#e9d8c0', '#c9d6e8'],
};
const TOP_BY_AGE = (tags) => (tags.includes('kid') ? PALETTE.topKid : tags.includes('elder') ? PALETTE.topElder : PALETTE.top);
/** Chance that a character re-colours each slot (a uniform keeps its look and only changes footwear / small details). */
const P_SLOT = { top: 1, bottom: 0.7, shoes: 0.55, hat: 0.7, accessory: 0.6, inner: 0.5 };
const P_SLOT_UNIFORM = { shoes: 0.6, accessory: 0.35 };

function pickColour(rng, slotName, slot, tags, forbid) {
  const list = slotName === 'top' ? TOP_BY_AGE(tags) : PALETTE[slotName];
  if (!list) return null;
  for (let k = 0; k < 14; k++) {
    const hex = rng.pick(list);
    if (forbid?.has(hex)) continue;
    if (Math.max(...slotRatio(slot, hex)) > 5 || slotDistance(slot, hex) < 0.09) continue;     // too extreme a jump, or too close to what is baked
    return hex;
  }
  return null;
}

/**
 * A garment variant for one person: re-colours the slots of `meta.slots` that the character has. Distinct from every key in `taken` (a Set of
 * `appearanceKey`s, updated by the caller) when possible; `{}` means the base look.
 */
export function makeVariant(meta, rng, taken = null, tries = 20) {
  const slots = meta.slots ?? {}, tags = meta.tags ?? [], uniform = tags.includes('uniform'), chance = uniform ? P_SLOT_UNIFORM : P_SLOT;
  let last = {};
  for (let t = 0; t < tries; t++) {
    const spec = {}; let topHex = null;
    for (const [name, p] of Object.entries(chance)) {
      const slot = slots[name]; if (!slot || !rng.chance(p)) continue;
      const hex = pickColour(rng, name, slot, tags, name === 'bottom' ? new Set([topHex]) : null); if (!hex) continue;
      spec[name] = hex; if (name === 'top') topHex = hex;
    }
    last = spec;
    if (!taken || !taken.has(appearanceKey(meta.id, spec))) return spec;
  }
  return last;
}
