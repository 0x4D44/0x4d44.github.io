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
  bark_trunk: { color: 0xffffff, rough: 0.95, tex: false },
  bark_euca: { color: 0xffffff, rough: 0.95, tex: false },
  bark_palm: { color: 0xffffff, rough: 0.9, tex: false },
  pot_clay: { color: 0xffffff, rough: 0.9, tex: false },

  // ---- railings, poles, metal furniture
  iron_green: { color: 0x2d5b46, rough: 0.55, metal: 0.45, tex: false },
  iron_blue: { color: 0x2c4f86, rough: 0.55, metal: 0.45, tex: false },
  iron_black: { color: 0x25262a, rough: 0.6, metal: 0.5, tex: false },
  galvanised: { color: 0x9aa2a6, rough: 0.45, metal: 0.7, tex: false },
  wire_dark: { color: 0x16171a, rough: 0.8, metal: 0.2, tex: false, vertexColors: false },
};
