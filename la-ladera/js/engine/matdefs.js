// Material definitions owned by the ENGINE agent: shared basics every module may use (glass, plaster, brick, concrete,
// roofing, ground, wood, fabric...). A module may re-declare any of these in its own matdefs.js (its definition wins at
// runtime: see the merge order in core/matlib.js); the texture factory (tools/textures/build.mjs) generates ONE photographic
// swatch per name, so re-declaring only changes tile/colour/roughness, not the picture.
// Fields: see core/matlib.js. `desc` = plain-language brief for the texture generator (the REAL surface). prio 1|2|3 = generation order.
export default {
  missing_asset: { color: 0xff00ff, rough: 1, tex: false, vertexColors: false },
  glass: { color: 0xcfe3ee, rough: 0.04, metal: 0, alpha: 0.22, tex: false, vertexColors: false, env: 1.5, side: 'double' },

  // ---- ground ---------------------------------------------------------------------------------------------------
  ground_dirt: { color: 0x8a6a4a, rough: 1, tile: 3, prio: 1, desc: 'packed reddish-brown hillside earth with small stones, dry roots and patchy dry grass, top-down' },
  dirt_path: { color: 0x8c6c4c, rough: 1, tile: 3, prio: 1, desc: 'compacted ochre-brown earth footpath worn smooth in the middle, scattered pebbles, small dry weeds at the edges, top-down' },
  grass_patchy: { color: 0x7b8a47, rough: 1, tile: 4, prio: 1, desc: 'patchy Andean hillside grass, kikuyu green mixed with straw-yellow tufts and bare reddish soil patches, top-down' },
  asphalt: { color: 0x4a4a4c, rough: 0.95, tile: 3, prio: 1, desc: 'worn dark-grey asphalt road surface, fine aggregate, tyre-polished patches, hairline cracks and a few tar-filled repairs, top-down' },
  cobble_stone: { color: 0x77746c, rough: 0.9, tile: 1.5, prio: 1, desc: 'old rounded river-stone cobbles (adoquin, piedra bola) in grey, brown and ochre, soil and moss in the joints, top-down' },

  // ---- walls ----------------------------------------------------------------------------------------------------
  plaster_a: { color: 0xe8dcc8, rough: 0.95, tile: 2.5, prio: 1, tintable: true, desc: 'neutral off-white lime-wash plaster wall (panete), hand-trowelled, subtle trowel marks, hairline cracks, faint damp streaks and tiny chips showing grey cement; base colour nearly colourless because it will be tinted any paint colour' },
  plaster_rough: { color: 0xdad0bd, rough: 1, tile: 2, prio: 1, tintable: true, desc: 'neutral off-white rough-cast render with a sandy stippled texture, small pits, a few hairline cracks and faint stains; nearly colourless because it will be tinted any paint colour' },
  paint_peeling: { color: 0xd8d0c0, rough: 0.9, tile: 2, prio: 1, tintable: true, desc: 'light neutral painted plaster with large flakes of paint peeling away to show a darker grey plaster layer and bare cement beneath, damp bloom near the bottom; nearly colourless paint because it will be tinted' },
  brick_clay_hollow: { color: 0xc0623a, rough: 0.95, tile: 1.2, prio: 1, desc: 'exposed orange-red hollow clay brick wall (ladrillo hueco) laid in running bond, extruded horizontal ribs on every brick face, grey cement mortar joints, some smears of old cement, a few darker over-fired bricks' },
  brick_red_solid: { color: 0x9a4a38, rough: 0.95, tile: 1.2, prio: 1, desc: 'solid red-brown clay brick masonry (ladrillo tolete) in running bond, slightly irregular bricks, pale mortar joints, lime efflorescence streaks and soot stains' },
  concrete_bare: { color: 0x9a9a94, rough: 0.95, tile: 3, prio: 1, desc: 'bare cast-in-place grey concrete with fine pores, faint rain streaks, hairline cracks and tiny air holes, a few rust-brown stains' },
  concrete_formwork: { color: 0x8f8f89, rough: 0.95, tile: 3, prio: 1, desc: 'grey concrete wall showing the impression of horizontal timber formwork boards, board grain, fins of cement slurry at the joints, rain stains and moss at the bottom' },
  stone_wall: { color: 0x84796a, rough: 1, tile: 2, prio: 1, desc: 'old mortared retaining wall of irregular grey-brown fieldstone, deep joints with earth and moss, weep holes, lichen patches' },

  // ---- floors ---------------------------------------------------------------------------------------------------
  tile_ceramic_checker: { color: 0xb8b0a0, rough: 0.35, tile: 1.32, prio: 1, desc: 'glazed ceramic floor tiles 33 cm square in a black and off-white checkerboard, grey grout, worn glaze, a few chipped corners and scuffs' },
  tile_terracotta: { color: 0xb4623c, rough: 0.6, tile: 1.2, prio: 1, desc: 'square terracotta clay floor tiles 30 cm (baldosa de barro), warm orange-red with colour variation, slightly uneven, pale grout lines, wear and dust' },
  cement_screed: { color: 0x8c8a84, rough: 0.7, tile: 2, prio: 1, desc: 'smooth hand-trowelled grey cement floor screed (piso en cemento alisado), soft trowel swirls, hairline cracks, subtle polish and a few stains' },

  // ---- wood, metal, roofs, cloth -------------------------------------------------------------------------------
  wood_pine: { color: 0xc9a06a, rough: 0.7, tile: 1, prio: 1, desc: 'pine boards laid side by side, honey-yellow with darker knots and visible grain, thin gaps between boards, light wear' },
  wood_dark_door: { color: 0x4a3020, rough: 0.6, tile: 1, prio: 1, desc: 'old dark-brown varnished hardwood planks with vertical grain, scuffs, worn edges and a few dents' },
  corrugated_zinc: { color: 0x9aa3a6, rough: 0.5, metal: 0.35, tile: 1, prio: 1, tintable: true, desc: 'galvanised corrugated zinc roofing sheet seen from above, regular vertical corrugations, dull grey with faint rust streaks and nail marks; nearly neutral grey because it will be tinted rust, blue or red' },
  roof_tile_clay: { color: 0xa8502e, rough: 0.9, tile: 1.2, prio: 1, desc: 'weathered barrel (Spanish) clay roof tiles in rows, orange-brown with dark streaks, lichen and moss patches, some chipped tiles, seen from above' },
  fabric_woven: { color: 0xb8a58a, rough: 1, tile: 0.5, prio: 1, tintable: true, desc: 'coarse woven cotton fabric with a visible weave, soft and slightly fuzzy, neutral light grey-beige because it will be tinted' },
  rusty_iron: { color: 0x6e4a36, rough: 0.75, metal: 0.55, tile: 1, prio: 1, desc: 'old corroded painted iron plate with flaking dark paint and orange-brown rust bloom, pitting and a few rivets, top-down' },
};
