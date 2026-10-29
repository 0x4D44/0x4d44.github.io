// Material definitions owned by the ENGINE agent (shared basics: glass, metal, ground fallbacks).
// See core/matlib.js for the field list. Add textures by dropping files in assets/textures/ + manifest.json.
export default {
  missing_asset: { color: 0xff00ff, rough: 1, tex: false, vertexColors: false },
  glass: { color: 0xcfe3ee, rough: 0.04, metal: 0, alpha: 0.22, tex: false, vertexColors: false, env: 1.5, side: 'double' },
  ground_dirt: { color: 0x8a6a4a, rough: 1, tile: 3, desc: 'packed reddish-brown hillside earth with small stones and patchy dry grass, top-down' },
};
