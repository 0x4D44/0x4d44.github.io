// Material definitions owned by the INTERIORS agent (A3): floors, wall paints, tiles, wood, fabric, metal, clutter, emissives.
// Fields: see core/matlib.js. `desc` is the plain-language brief the texture generator receives (A1); `prio` 1 = needed first.
//
// Conventions
//  * TINTABLE materials have a NEUTRAL light texture: interiors tint them with VERTEX COLOURS (same material key, so no
//    extra draw calls) - `color` is the flat fallback shown while a texture is missing.
//  * `tex:false` = flat-colour material, never textured (small clutter, plastics, emissives).
//  * Finish materials (floor_*, wall_*, ceiling_*) are also read by A2 through `room.finish`.
//  * `decal_atlas` is a runtime canvas texture built by interiors/decals.js (posters, calendars, notes, menus...).
export default {
  // ---------------------------------------------------------------- floors
  floor_tile_checker: { color: 0xcdbb9c, rough: 0.55, tile: 1.2, prio: 1, desc: 'cream and dark-brown ceramic checkerboard floor tiles about 30 cm square with thin dirty grout lines, slightly dull and scuffed, seen from straight above, flat even light' },
  floor_tile_terracotta: { color: 0xb4663c, rough: 0.8, tile: 1.2, prio: 1, desc: 'handmade terracotta clay floor tiles about 30 cm square, orange-brown with natural colour variation, dark grout, waxed and worn surface, seen from straight above, flat even light' },
  floor_tile_ceramic: { color: 0xcfc6b4, rough: 0.4, tile: 1.2, prio: 1, desc: 'plain glazed light beige-grey ceramic floor tiles 40 cm square with thin grout and a faint speckle, neutral so it can be tinted, seen from straight above, flat even light' },
  floor_cement: { color: 0x9c9a94, rough: 0.9, tile: 2, prio: 1, desc: 'troweled grey cement screed floor with hairline cracks, dark stains, dust and patchy polish, seen from straight above, flat even light' },
  floor_cement_red: { color: 0xa8493a, rough: 0.55, tile: 2, prio: 2, desc: 'polished red-oxide cement floor of an old Colombian house, glossy worn patches, hairline cracks and small chips, seen from straight above, flat even light' },
  floor_pine: { color: 0xc89a62, rough: 0.6, tile: 1.5, prio: 1, desc: 'pine plank floorboards about 9 cm wide, orange-yellow with knots and worn varnish, thin gaps between boards, seen from straight above, flat even light' },
  floor_laminate: { color: 0xa9825c, rough: 0.5, tile: 1.5, prio: 2, desc: 'cheap laminate flooring imitating oak planks, mid-brown printed grain, visible plank joints, a few swollen edges, seen from straight above, flat even light' },
  floor_vinyl: { color: 0x8a8f86, rough: 0.5, tile: 1.5, prio: 3, desc: 'sheet vinyl flooring with a faint stone-like pattern in grey-green, slightly scuffed with dark seams, seen from straight above, flat even light' },
  floor_concrete_raw: { color: 0x8d8b86, rough: 0.95, tile: 2.5, prio: 2, desc: 'raw poured concrete floor with formwork marks, pits, sand patches and dust, seen from straight above, flat even light' },

  // ---------------------------------------------------------------- walls / ceilings / trim
  wall_paint: { color: 0xe8dcc8, rough: 0.95, tile: 2.5, prio: 1, desc: 'neutral off-white matte painted plaster interior wall with a soft roller texture, a few hairline cracks and scuffs, flat even light, neutral so it can be tinted any colour' },
  wall_paint_worn: { color: 0xdcd0bc, rough: 0.95, tile: 2.5, prio: 2, desc: 'neutral off-white painted plaster wall with damp stains rising from the bottom, flaking paint and scuffs, flat even light, neutral so it can be tinted' },
  wall_gloss: { color: 0xd8d0c0, rough: 0.45, tile: 1.5, prio: 2, desc: 'glossy oil-paint dado band on plaster, smooth enamel with faint brush marks and small chips, neutral so it can be tinted a dark colour' },
  wall_tile: { color: 0xf0f0ea, rough: 0.3, tile: 1.2, prio: 1, desc: 'glazed white ceramic wall tiles 20x25 cm with thin grout lines, bathroom or kitchen splashback, slightly yellowed edges, flat even light, neutral so it can be tinted' },
  wall_cement_raw: { color: 0x9b9892, rough: 0.95, tile: 2.5, prio: 2, desc: 'bare grey cement render wall, rough sand-textured with trowel swirls, stains and a few exposed hollow-brick patches, flat even light' },
  ceiling_white: { color: 0xf0ece2, rough: 1, tile: 3, prio: 1, desc: 'whitewashed plaster ceiling with faint brush marks, a few yellowish damp stains and hairline cracks, seen from straight below, flat even light' },
  ceiling_pine: { color: 0xb98954, rough: 0.7, tile: 2, prio: 3, desc: 'pine tongue-and-groove ceiling boards with dark knots and light varnish, seen from straight below, flat even light' },
  ceiling_concrete: { color: 0x9a9892, rough: 0.95, tile: 3, prio: 3, desc: 'underside of a cast concrete slab with formwork marks, pits and stains, seen from straight below, flat even light' },
  trim_paint: { color: 0xf2efe6, rough: 0.45, tex: false },

  // ---------------------------------------------------------------- wood / boards
  wood_pine: { color: 0xc8985c, rough: 0.65, tile: 1, prio: 1, desc: 'light pine wood boards with clear vertical grain and knots, natural oil finish, slightly worn, flat even light' },
  wood_dark: { color: 0x5a3a24, rough: 0.5, tile: 1, prio: 1, desc: 'dark stained cedar-walnut veneer with long straight grain, satin varnish and small scratches, flat even light' },
  wood_painted: { color: 0xd8cfc0, rough: 0.5, tile: 1, prio: 2, desc: 'wooden furniture panel painted with glossy enamel, brush marks and small chipped edges showing bare wood, neutral so it can be tinted' },
  wood_old: { color: 0x8a7456, rough: 0.9, tile: 1, prio: 2, desc: 'weathered old grey-brown wood with splits, nail holes and dark stains, flat even light' },
  melamine_wood: { color: 0xa5845c, rough: 0.45, tile: 1.2, prio: 2, desc: 'wood-grain melamine laminate chipboard in pale oak, printed grain, white chipped edges, flat even light' },
  plywood: { color: 0xc9a36d, rough: 0.8, tile: 1.2, prio: 3, desc: 'raw plywood sheet with pale layered grain, a few patches and stains, flat even light' },
  formica: { color: 0xdcd6c8, rough: 0.35, tile: 0.8, prio: 1, desc: 'pale formica table laminate with a fine speckled boomerang pattern, glossy with worn edges and tiny scratches, neutral so it can be tinted' },
  oilcloth_floral: { color: 0xd8b8b0, rough: 0.35, tile: 0.5, prio: 2, desc: 'plastic oilcloth tablecloth with bold printed red and green flowers on a cream ground, slightly shiny, flat even light' },
  oilcloth_check: { color: 0xd88a80, rough: 0.35, tile: 0.4, prio: 3, desc: 'red and white small gingham check plastic tablecloth, slightly shiny, flat even light' },

  // ---------------------------------------------------------------- fabric / soft
  fabric_sofa: { color: 0xcab8a0, rough: 1, tile: 0.6, prio: 1, desc: 'coarse woven upholstery fabric with a tight weave and slight pilling, neutral beige so it can be tinted, flat even light' },
  vinyl_sofa: { color: 0x9a6a46, rough: 0.4, tile: 0.8, prio: 1, desc: 'faux leather vinyl upholstery with creases and button-tufting dimples and worn shiny patches, neutral mid-brown so it can be tinted, flat even light' },
  crochet_cover: { color: 0xf2eadb, rough: 1, tile: 0.4, prio: 2, desc: 'white-ecru crocheted doily lace pattern, flat on a plain ground so it reads clearly as crochet, cotton thread' },
  fabric_bedding: { color: 0xe6ddd0, rough: 1, tile: 0.6, prio: 1, desc: 'plain cotton bed sheet and blanket with soft wrinkles and a faint weave, neutral cream so it can be tinted, flat even light' },
  blanket_andean: { color: 0xb04a3a, rough: 1, tile: 0.8, prio: 2, desc: 'Andean wool blanket (cobija) with bold horizontal stripes in red, black, ochre and green, woven texture, flat even light' },
  bedspread_floral: { color: 0xd9a0a8, rough: 0.9, tile: 0.7, prio: 2, desc: 'polyester bedspread with large pink and white printed roses on a pastel ground, quilted puckering, flat even light' },
  mattress_ticking: { color: 0xcfc8bb, rough: 1, tile: 0.5, prio: 3, desc: 'mattress cover in striped ticking, pale blue and cream stripes, a few stains, flat even light' },
  curtain_fabric: { color: 0xe9e0d0, rough: 1, tile: 0.8, prio: 2, side: 'double', desc: 'light cotton curtain fabric with a small faint printed pattern in soft folds, neutral so it can be tinted, flat even light' },
  rug_woven: { color: 0xa05c3a, rough: 1, tile: 1.2, prio: 2, desc: 'woven fique or wool rug with geometric Andean stripes and diamonds in earthy red, ochre, black and cream, flat even light' },
  towel_terry: { color: 0xffffff, rough: 1, tex: false },

  // ---------------------------------------------------------------- plastic / metal / glass-like (flat unless noted)
  plastic_solid: { color: 0xffffff, rough: 0.45, tex: false },
  metal_painted: { color: 0xd0d0d0, rough: 0.5, metal: 0.3, tile: 1, prio: 2, desc: 'painted steel sheet with chipped paint and rust speckles, neutral light grey so it can be tinted, flat even light' },
  metal_steel: { color: 0xb8bcc0, rough: 0.35, metal: 0.8, tile: 1, prio: 2, desc: 'brushed stainless steel sheet with fine linear scratches and a few water marks, flat even light' },
  metal_chrome: { color: 0xdedede, rough: 0.15, metal: 1, tex: false },
  metal_dark: { color: 0x2b2b2d, rough: 0.6, metal: 0.5, tex: false },
  enamel_white: { color: 0xeeeeea, rough: 0.3, metal: 0.05, tex: false },
  ceramic_white: { color: 0xf4f4f0, rough: 0.15, tex: false },
  mirror: { color: 0xcfd6da, rough: 0.04, metal: 1, tex: false, env: 1.4, vertexColors: false },
  rubber_black: { color: 0x1c1c1c, rough: 0.9, tex: false },

  // ---------------------------------------------------------------- misc / clutter
  cardboard: { color: 0xb08a5a, rough: 0.95, tile: 0.5, prio: 3, desc: 'corrugated cardboard box surface, brown with packing tape strips and faded printed marks, flat even light' },
  paper: { color: 0xf0ece0, rough: 0.9, tex: false },
  book_spines: { color: 0x806040, rough: 0.8, tile: 0.5, prio: 2, desc: 'a tight row of book spines of many colours and thicknesses, faded and worn, flat frontal view' },
  clay_terracotta: { color: 0xb5603a, rough: 0.9, tex: false },
  soil: { color: 0x3a2a1c, rough: 1, tex: false },
  leaf_green: { color: 0x4a8a3a, rough: 0.7, tex: false, side: 'double' },
  leaf_dark: { color: 0x2c5a2a, rough: 0.7, tex: false, side: 'double' },
  flower_red: { color: 0xc8302a, rough: 0.7, tex: false },
  flower_yellow: { color: 0xe8c030, rough: 0.7, tex: false },
  candle_wax: { color: 0xf2ead2, rough: 0.6, tex: false },
  plaster_statue: { color: 0xe8e2d4, rough: 0.7, tex: false },
  fur_cat: { color: 0xffffff, rough: 1, tex: false },
  fur_dog: { color: 0xb08850, rough: 1, tex: false },
  feather_canary: { color: 0xf0d020, rough: 1, tex: false },
  feather_pigeon: { color: 0x8a8f98, rough: 1, tex: false },
  skin_figure: { color: 0xc88b5e, rough: 0.8, tex: false },
  food_bread: { color: 0xc98a4a, rough: 0.9, tex: false },
  food_cake: { color: 0xe8d0b0, rough: 0.8, tex: false },
  food_mango: { color: 0xe9a23b, rough: 0.6, tex: false },
  food_banana: { color: 0xe2c84f, rough: 0.6, tex: false },
  food_lulo: { color: 0xe4952f, rough: 0.6, tex: false },
  food_tomato: { color: 0xc83a2e, rough: 0.5, tex: false },
  food_veg: { color: 0x5e9c3f, rough: 0.6, tex: false },
  food_meat: { color: 0xa8403c, rough: 0.5, tex: false },
  food_white: { color: 0xeee4cc, rough: 0.7, tex: false },

  // ---------------------------------------------------------------- emissive
  bulb_glow: { color: 0xfff2cc, emissive: 0xffd890, emissiveIntensity: 2.2, tex: false, vertexColors: false },
  tube_glow: { color: 0xeef6ff, emissive: 0xe4f0ff, emissiveIntensity: 2.0, tex: false, vertexColors: false },
  lamp_shade: { color: 0xf0dcb0, emissive: 0xffc87a, emissiveIntensity: 0.9, rough: 0.9, tex: false },
  tv_screen_a: { color: 0x1a2230, emissive: 0x6fa0ff, emissiveIntensity: 0.9, rough: 0.2, tex: false, vertexColors: false },
  tv_screen_b: { color: 0x1a2230, emissive: 0xffb070, emissiveIntensity: 0.8, rough: 0.2, tex: false, vertexColors: false },
  tv_screen_c: { color: 0x1a2230, emissive: 0x80e0a0, emissiveIntensity: 0.7, rough: 0.2, tex: false, vertexColors: false },
  tv_off: { color: 0x0c0e12, rough: 0.12, tex: false, vertexColors: false },
  candle_flame: { color: 0xffc060, emissive: 0xffa640, emissiveIntensity: 3, tex: false, vertexColors: false },
  led_red: { color: 0xff3020, emissive: 0xff2010, emissiveIntensity: 2, tex: false, vertexColors: false },
  sign_neon: { color: 0xffe0f0, emissive: 0xff5ca8, emissiveIntensity: 1.6, tex: false, vertexColors: false },

  // ---------------------------------------------------------------- runtime decals (canvas atlas built in interiors/decals.js)
  decal_atlas: { color: 0xffffff, rough: 0.85, uv: 'unit', tex: false },
};
