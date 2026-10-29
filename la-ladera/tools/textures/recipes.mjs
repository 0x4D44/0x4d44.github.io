// Generation + post-processing knobs for the texture factory (owner: A1). Everything not listed here uses DEFAULTS and
// whatever `desc` the declaring module wrote in its matdefs.js.
//
//   size    final square size in px. HERO surfaces (seen everywhere, close up) get 1024; everything else 512 (GPU budget: ~220 MB for
//           the whole library, so normal maps are capped at 512 and only derived where they add relief)
//   tint    true = neutralise colour + lighting so `name#rrggbb` tints work (grey albedo, mean ~0.86)
//   normal  0 = none, else strength of the derived normal map (relief from the luminance detail); invert = bright parts are recessed
//   mode    'periodic' (stochastic: offset + feathered variance-preserving blend) | 'grid' (regular pattern: crop whole periods) | 'none' (decals)
//   grid    [nx, ny] expected repeat counts for mode 'grid'; even = [bool, bool] force an even number of periods (running bond, checker)
//   flat    strength (0..1) of the large-scale illumination equalisation (0 for patterns whose colour variation IS the look)
//   layout  extra sentence for the image generator (scale, layout, what to avoid)
//   cm      real-world size of the frame in cm (default tile * 100); steers the feature scale in the prompt
export const DEFAULTS = { size: 512, tint: false, normal: 0, mode: 'periodic' };

const SOFT = 'Stains and dark marks must be spread evenly over the whole frame, nothing concentrated against one edge.';

export const RECIPES = {
  // ---- walls (tintable plaster family) ------------------------------------------------------------------------------
  plaster_a: { size: 1024, tint: true, normal: 0.7, gen: 'v2', layout: `Almost colourless warm-grey/white base. Soft blotchy hand-trowelled variation, a few very faint damp streaks, a few hairline cracks and 3 or 4 tiny chips showing grey cement. No large dark areas. ${SOFT}` },
  plaster_rough: { size: 512, tint: true, normal: 1.2, layout: `Almost colourless off-white base. Rough-cast sandy stipple with small pits, a few hairline cracks, very faint stains. Even, no big blotches. ${SOFT}` },
  paint_peeling: { size: 512, tint: true, normal: 0, flat: 0.6, layout: 'Light neutral paint covering about 60 percent of the frame; the rest is flaked away showing darker grey old plaster and bare cement. Spread the flakes evenly over the whole frame. (Used as an overlay / mask, not as a base wall.)' },
  brick_clay_hollow: { size: 1024, normal: 2.2, mode: 'grid', grid: [5, 10], even: [false, true], invert: true, flat: 0.3, layout: 'Exactly 5 bricks across and 10 courses high in a running bond (each course offset by half a brick), mortar joints about 1.5 cm. Orange-red extruded hollow bricks; mortar clearly visible.' },
  brick_red_solid: { size: 512, normal: 1.8, mode: 'grid', grid: [5, 16], even: [false, true], invert: true, flat: 0.3, layout: 'Exactly 5 bricks across and 16 courses high in a running bond (each course offset by half a brick), thin pale mortar joints.' },
  concrete_bare: { size: 512, normal: 0.9, layout: `Even mid-grey concrete with fine pores and faint staining; no large cracks, no formwork lines. ${SOFT}` },
  concrete_formwork: { size: 512, normal: 1.4, layout: `Horizontal timber formwork board impressions, about 8 boards across the height of the frame, subtle board grain; grey; no vertical joints except small offsets. ${SOFT}` },
  stone_wall: { size: 512, normal: 2.6, layout: 'Irregular fieldstones about 25 to 40 cm wide with deep earthy joints, evenly spread over the frame.' },

  // ---- floors -------------------------------------------------------------------------------------------------------
  tile_ceramic_checker: { size: 1024, normal: 0, mode: 'grid', grid: [4, 4], even: [true, true], flat: 0, layout: 'A perfectly regular 4 by 4 grid of square tiles filling the frame: the tiles alternate black and off-white like a chessboard, thin grey grout lines. Top-down.' },
  tile_terracotta: { size: 1024, normal: 0.7, mode: 'grid', grid: [4, 4], invert: true, flat: 0, layout: 'A regular 4 by 4 grid of square terracotta tiles filling the frame, thin pale grout lines, each tile slightly different in colour.' },
  // interiors' tile family (regular grids: whole-period crop, never the stochastic blend, which would cross the grout lines)
  floor_tile_checker: { size: 512, normal: 0.8, mode: 'grid', grid: [4, 4], even: [true, true], flat: 0 },
  floor_tile_terracotta: { size: 512, normal: 0.9, mode: 'grid', grid: [4, 4], flat: 0 },
  floor_tile_ceramic: { size: 512, tint: true, normal: 0.6, mode: 'grid', grid: [3, 3], flat: 0.2 },
  wall_tile: { size: 512, tint: true, normal: 0.5, mode: 'grid', grid: [5, 6], flat: 0.2 },
  cement_screed: { size: 512, normal: 0, layout: `Smooth grey cement floor, soft trowel swirls, very low contrast with a few hairline cracks. ${SOFT}` },
  asphalt: { size: 1024, normal: 1.2, layout: `Dark grey asphalt, evenly worn, fine aggregate visible, a couple of thin cracks and tar repair lines; no road markings, no vehicles. ${SOFT}` },
  cobble_stone: { size: 1024, normal: 3.0, layout: 'Rounded cobbles about 12 to 18 cm across, tightly set, earth in the joints, evenly covering the frame; no paving edge.' },
  dirt_path: { size: 512, normal: 1.0, layout: 'Evenly worn earth, pebbles of 1 to 3 cm, no distinct path edge, no plants except tiny dry weeds.' },
  grass_patchy: { size: 512, normal: 0, layout: 'Seen from above; short grass with straw-coloured tufts and 2 or 3 small patches of bare red-brown soil. No flowers, no big shadows.' },

  // ---- wood, metal, roofs, cloth -----------------------------------------------------------------------------------
  wood_pine: { size: 1024, normal: 0.7, flat: 0.5, layout: 'About 7 boards side by side, vertical grain, thin dark gaps between boards.' },
  wood_dark_door: { size: 512, normal: 0.7, flat: 0.5, layout: 'About 6 vertical planks, dark brown varnish, thin dark gaps between planks.' },
  corrugated_zinc: { size: 512, tint: true, normal: 2.4, mode: 'grid', grid: [10, 1], layout: 'Exactly 10 regular straight vertical corrugation ridges across the frame, running top to bottom; neutral dull grey; faint rust streaks; no overlapping sheet edges, no screws except 2 or 3.' },
  roof_tile_clay: { size: 512, normal: 2.2, layout: 'About 6 columns of curved barrel tiles running top to bottom, overlapped like a roof seen from above, evenly lit.' },
  fabric_woven: { size: 512, tint: true, normal: 0, cm: 25, flat: 0.8, layout: 'Extreme close-up macro of a plain-weave textile filling the whole frame: individual horizontal (weft) and vertical (warp) threads are clearly visible as a tight crosshatch grid, about 2 to 3 mm per thread, slightly fuzzy fibres, matte. It is cloth, NOT metal: no ribs, no corrugation, no folds, no wrinkles, no stitching, no selvedge, perfectly flat.' },
  rusty_iron: { size: 512, normal: 1.2, flat: 0.8, gen: 'v2', layout: `Rust-orange and dark flaking paint over the whole plate, no edges of the plate visible. Medium-sized patches only (each smaller than a fifth of the frame), no large dark areas. ${SOFT}` },
  ground_dirt: { size: 512, normal: 0.9, layout: 'Compacted red-brown earth with stones and sparse dry grass; evenly covered.' },
};

/** Name-based heuristics for materials declared by other modules (no explicit recipe). */
const HERO = /^(plaster_a|brick_clay_hollow|tile_|wood_pine|asphalt|cobble)/;
export function heuristics(name, def) {
  const r = {};
  const d = `${name} ${def.desc ?? ''}`.toLowerCase();
  if (def.tintable || /\btint(ed|able)?\b|neutral (off-white|grey|gray)|nearly colourless|will be tinted/.test(d)) r.tint = true;
  if (/(brick|cobble|stone|rock|masonry|roof|tile|corrugat|rust|bark|thatch|gravel|concrete|plaster|render|asphalt|dirt|earth)/.test(name)) r.normal = 1.2;
  if (/(paint|fabric|cloth|cotton|wool|felt|linen|carpet|rug|screed|oilcloth|vinyl|laminate|formica|plastic)/.test(name)) r.normal = 0;
  if (HERO.test(name)) r.size = 1024;
  if (def.size) r.size = def.size;
  if (def.uv === 'unit') { r.mode = 'none'; r.size = Math.min(r.size ?? 512, 512); r.normal = 0; }
  if (def.alphaTest != null || (def.alpha != null && def.alpha < 1 && def.uv === 'unit')) { r.mode = 'none'; r.alpha = true; r.size = 512; }
  return r;
}
