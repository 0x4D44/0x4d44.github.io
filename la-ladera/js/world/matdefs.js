// Material definitions owned by the ENVIRONMENT agent (A5): streets, plazas, walls, street furniture. The shared basics
// (ground_dirt, grass_patchy, asphalt, cobble_stone, concrete_*, stone_wall, brick_*, rusty_iron ...) live in engine/matdefs.js.
// Fields: see core/matlib.js. `desc` = plain-language brief for the texture generator, `prio` 1|2|3 = generation order.
export default {
  // ---- streets and paving
  street_concrete: { color: 0x9b988f, rough: 0.92, tile: 3, prio: 2, desc: 'poured grey concrete street slab with a transverse broom finish, expansion joints every three metres, hairline cracks, oil stains and dried mud tracks down the middle, top-down' },
  sidewalk_slab: { color: 0xaaa69d, rough: 0.9, tile: 1.8, prio: 2, desc: 'pale grey broom-finished concrete sidewalk slabs about 1.2 m wide separated by thin joints, worn edges, patches of dried mud and a few stains, top-down' },
  paving_plaza: { color: 0xb8ab94, rough: 0.9, tile: 2.4, prio: 2, desc: 'plaza paving of square pale-ochre concrete pavers 40 cm wide with thin dark joints, some chipped corners, weeds in a few joints and sun-faded patches, top-down' },
  court_floor: { color: 0x58845f, rough: 0.8, tile: 4, prio: 2, tintable: true, desc: 'smooth painted concrete sports court surface, mid-green, faded and scuffed with ball marks, hairline cracks and a few repaired patches, top-down' },
  stair_tread: { color: 0xa09c93, rough: 0.9, tile: 1.2, prio: 3, desc: 'concrete stair tread seen from above, trowelled grey cement with a worn nosing line, a little dirt and moss in the corners' },
  road_line_white: { color: 0xe9e5d8, rough: 0.85, tex: false, vertexColors: false },
  road_line_yellow: { color: 0xe0b52a, rough: 0.85, tex: false, vertexColors: false },
  drain_grate: { color: 0x2a2a2a, rough: 0.7, metal: 0.5, tex: false, vertexColors: false },

  // ---- vegetation: cards from the sprite atlas painted at boot (world/sprites.js), so the texture factory leaves them alone
  foliage: { color: 0xffffff, rough: 0.85, alphaTest: 0.42, side: 'double', tex: false, env: 0.35 },
  // the same atlas for low plants (tufts, reeds, shrubs, agaves, bananas, cypresses, drapes), lit as if every card faced the sky: no black back faces by night (props.js patches the normal)
  foliage_low: { color: 0xffffff, rough: 0.9, alphaTest: 0.42, side: 'double', tex: false, env: 0.3 },
  bark_trunk: { color: 0xffffff, rough: 0.95, tex: false },
  bark_euca: { color: 0xffffff, rough: 0.95, tex: false },
  bark_palm: { color: 0xffffff, rough: 0.9, tex: false },
  pot_clay: { color: 0xffffff, rough: 0.9, tex: false },

  // ---- painted signage: ONE atlas (murals, gate boards, plaques, hand signs, chalk) painted at boot by world/signs.js and bound in props.js.
  // Alpha-tested so the chalk hopscotch needs no blending; A2's `sign_atlas` (shop fascias) is a different material with its own canvas.
  world_sign: { color: 0xffffff, rough: 0.78, alphaTest: 0.4, tex: false, env: 0.4 },
  // animal parts and cloth for the living props (life.js): flat colours tinted per vertex
  fur: { color: 0xffffff, rough: 0.95, tex: false },

  // ---- railings, poles, metal furniture
  iron_green: { color: 0x2d5b46, rough: 0.55, metal: 0.45, tex: false },
  iron_blue: { color: 0x2c4f86, rough: 0.55, metal: 0.45, tex: false },
  iron_black: { color: 0x25262a, rough: 0.6, metal: 0.5, tex: false },
  galvanised: { color: 0x9aa2a6, rough: 0.45, metal: 0.7, tex: false },
  gold: { color: 0xd9b24a, rough: 0.35, metal: 0.8, tex: false, vertexColors: false, side: 'double', env: 1.1 },
  fence_mesh: { color: 0xb8bcc0, rough: 0.6, metal: 0.5, side: 'double', tex: false, vertexColors: false },   // chain-link: the diamond-mesh alpha texture is painted at boot (sprites.js) and bound in props.js
  wire_dark: { color: 0x16171a, rough: 0.8, metal: 0.2, tex: false, vertexColors: false, side: 'double' },
  insulator: { color: 0x8a6a58, rough: 0.35, tex: false },
  paper_flyer: { color: 0xf0eadb, rough: 0.9, tex: false },
  laundry: { color: 0xffffff, rough: 0.95, side: 'double', tex: false },
  // vehicles, carts, bins (flat colours, tinted per vertex)
  car_paint: { color: 0xffffff, rough: 0.32, metal: 0.35, tex: false, env: 1.0 },
  tyre: { color: 0x141416, rough: 0.9, tex: false },
  chrome: { color: 0xc8ccd0, rough: 0.25, metal: 0.9, tex: false, env: 1.2 },
  glass_dark: { color: 0x1b2630, rough: 0.12, metal: 0.4, tex: false, env: 1.3, vertexColors: false },
  bumper: { color: 0x2a2a2e, rough: 0.7, tex: false },
  light_head: { color: 0xf4f0e0, emissive: 0xfff2cc, emissiveIntensity: 0.12, rough: 0.2, tex: false, vertexColors: false },
  light_tail: { color: 0xc01818, emissive: 0xff2010, emissiveIntensity: 0.2, rough: 0.3, tex: false, vertexColors: false },
  light_roof: { color: 0xf0f0e8, emissive: 0xfff2cc, emissiveIntensity: 0.3, tex: false, vertexColors: false },
  seat: { color: 0x151518, rough: 0.8, tex: false },
  sign_route: { color: 0xf2f2e8, rough: 0.6, tex: false },
  produce: { color: 0xffffff, rough: 0.7, tex: false },
  bag: { color: 0xffffff, rough: 0.5, tex: false },
  plastic_bin: { color: 0xffffff, rough: 0.6, tex: false },
  // lamps: emissive at night only (the engine drives glow * ctx.night)
  lamp_glow: { color: 0xfff1cf, emissive: 0xffd596, emissiveIntensity: 0, glow: 3.4, tex: false, vertexColors: false },
  lamp_glow_cool: { color: 0xf3f7ff, emissive: 0xdfeaff, emissiveIntensity: 0, glow: 3.2, tex: false, vertexColors: false },
};
