// Material definitions owned by the ARCHITECTURE agent (doors, shutters, window glow, iron, roof terrace...). The generic wall/floor/roof
// materials (plaster_a, plaster_rough, paint_peeling, brick_*, concrete_*, cement_screed, tile_*, corrugated_zinc, roof_tile_clay, glass...)
// are declared by the engine (js/engine/matdefs.js) and reused here, tinted through vertex colours.
// Fields: see core/matlib.js. `desc` is the plain-language brief the texture generator receives; `prio` is its generation order.
export default {
  // ---- doors and shutters -----------------------------------------------------------------------------------------------
  door_wood: { color: 0x7a5636, rough: 0.7, tile: 1.0, prio: 2, tintable: true,
    desc: 'old painted timber boards (tongue-and-groove planks laid vertically) filling the whole image edge to edge, fine V-grooves between boards, thick enamel paint in a light neutral grey-beige (it will be tinted any colour) worn through to bare wood along some edges, scuffs, small dents and a few nail heads; no frame, no handle, seamless flat surface' },
  door_metal: { color: 0x68737a, rough: 0.55, metal: 0.4, tile: 1.0, prio: 2, tintable: true,
    desc: 'painted pressed sheet steel filling the whole image edge to edge: fine vertical stiffening ribs, a few rivet heads, light neutral grey paint (it will be tinted any colour) scratched and chipped to rust-brown in patches, faint drips; no frame, no handle, seamless flat surface' },
  shutter_steel: { color: 0x8c9296, rough: 0.5, metal: 0.5, tile: 0.8, prio: 2,
    desc: 'galvanised steel roll-up shop shutter (persiana metalica enrollable) seen straight on: tight horizontal interlocking slats about 8 cm tall, dull grey with dents, rust streaks at the bottom edge, scratches and a faint chalk scribble' },
  frame_paint: { color: 0xeae6dc, rough: 0.55, tile: 0.8, prio: 3, tintable: true,
    desc: 'smooth enamel-painted timber trim seen straight on, very light neutral colour (it will be tinted any colour), fine brush marks, small chips showing grey primer and bare wood at the corners, a hairline crack' },

  // ---- glass ------------------------------------------------------------------------------------------------------------
  // See-through in daylight, glows warm at night (the engine drives emissiveIntensity = glow * ctx.night).
  window_lit: { color: 0xa9bfcc, rough: 0.06, metal: 0, alpha: 0.3, depthWrite: false, tex: false, vertexColors: false, env: 1.3, side: 'double',
    emissive: 0xffc46b, glow: 2.2 },

  // ---- plain-colour details (no texture needed) -------------------------------------------------------------------------
  grille_iron: { color: 0x1e2023, rough: 0.5, metal: 0.45, tex: false, vertexColors: true },
  rail_metal: { color: 0x2b2e31, rough: 0.45, metal: 0.55, tex: false, vertexColors: true },
  rebar_rust: { color: 0x7a4a2c, rough: 0.85, metal: 0.4, tex: false, vertexColors: false },
  tank_plastic: { color: 0x2c5f8f, rough: 0.6, tex: false, vertexColors: true },

  // ---- roofs ------------------------------------------------------------------------------------------------------------
  roof_terrace: { color: 0x9a968d, rough: 0.95, tile: 3, prio: 2,
    desc: 'weathered flat concrete roof terrace surface (azotea) seen from above: grey rendered cement with a faint trowel pattern, dark tar-paper patches and sealant lines, rust stains from tank stands, moss and dust collecting along the edges, a few shallow puddle marks' },
};
