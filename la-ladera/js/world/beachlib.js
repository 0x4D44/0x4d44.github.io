// THE BEACH'S PROPS LIBRARY, AS THE WORLD NEEDS IT BEFORE IT IS LOADED (A5, round 7, phase 2).
// The Codex library (assets/models/beach_props/*.glb, manifest.beach_props.json: 97 props, each with a `_lod1` twin) is NOT in the boot manifest: a later sector loads it once the
// page is playable (beachprops.js). The plan of the front (beachfront.js) and its colliders, though, are part of the world from the first frame and of every Node test, so the sizes
// they stand on are kept here. tests/world-beachlib.test.mjs holds this table to the manifest: a library that changes size fails there, not in a picture.
//
//   sizeOf('kiosk') -> [3.2, 3, 3.2]      (width, height, depth in metres; the root is at the base centre; +Z is the front, yaw 0 faces +Z = south = the sea)
//   assetKey('kiosk') -> 'beach_kiosk'    (the name in ctx.assets)
export const BEACH_MANIFESTS = Object.freeze(['manifest.beach_props.json']);
export const assetKey = (name) => 'beach_' + name;

export const SIZE = Object.freeze({
  parasol_01_open: [2.2, 2.35, 2.2], parasol_01_furled: [0.36, 2.35, 0.36], parasol_02_open: [2.2, 2.35, 2.2], parasol_02_furled: [0.36, 2.35, 0.36],
  parasol_03_open: [2.2, 2.35, 2.2], parasol_03_furled: [0.36, 2.35, 0.36], parasol_04_open: [2.2, 2.35, 2.2], parasol_04_furled: [0.36, 2.35, 0.36],
  parasol_05_open: [2.2, 2.35, 2.2], parasol_05_furled: [0.36, 2.35, 0.36], parasol_06_open: [2.2, 2.35, 2.2], parasol_06_furled: [0.36, 2.35, 0.36],
  lounger_plastic_blue: [0.7, 0.88, 1.95], lounger_wood_canvas: [0.72, 0.9, 2], chair_plastic_coral: [0.62, 0.92, 0.66],
  chair_wood_canvas: [0.63, 0.94, 0.7], chair_folding_steel: [0.62, 0.88, 0.65], towel_01_flat: [0.9, 0.03, 1.8], towel_01_draped: [0.63, 0.96, 0.7],
  towel_02_flat: [0.9, 0.03, 1.8], towel_02_draped: [0.63, 0.96, 0.7], towel_03_flat: [0.9, 0.03, 1.8], towel_03_draped: [0.63, 0.96, 0.7],
  towel_04_flat: [0.9, 0.03, 1.8], towel_04_draped: [0.63, 0.96, 0.7], towel_05_flat: [0.9, 0.03, 1.8], towel_05_draped: [0.63, 0.96, 0.7],
  towel_06_flat: [0.9, 0.03, 1.8], towel_06_draped: [0.63, 0.96, 0.7], towel_07_flat: [0.9, 0.03, 1.8], towel_07_draped: [0.63, 0.96, 0.7],
  towel_08_flat: [0.9, 0.03, 1.8], towel_08_draped: [0.63, 0.96, 0.7], towel_09_flat: [0.9, 0.03, 1.8], towel_09_draped: [0.63, 0.96, 0.7],
  towel_10_flat: [0.9, 0.03, 1.8], towel_10_draped: [0.63, 0.96, 0.7], towel_11_flat: [0.9, 0.03, 1.8], towel_11_draped: [0.63, 0.96, 0.7],
  towel_12_flat: [0.9, 0.03, 1.8], towel_12_draped: [0.63, 0.96, 0.7], bag_01: [0.42, 0.48, 0.22], bag_02: [0.42, 0.48, 0.22],
  bag_03: [0.42, 0.48, 0.22], bag_04: [0.42, 0.48, 0.22], cool_box: [0.58, 0.4, 0.36], thermos: [0.13, 0.31, 0.13], flipflops_pair: [0.3, 0.06, 0.28],
  flipflop_left: [0.12, 0.06, 0.28], flipflop_right: [0.12, 0.06, 0.28], bucket_spade: [0.42, 0.34, 0.24], sandcastle: [0.9, 0.42, 0.76],
  ball_buried: [0.3, 0.18, 0.3], pool_ring_deflated: [0.74, 0.07, 0.61], volleyball_court: [16.04, 2.5, 8.04], volleyball_ball: [0.21, 0.21, 0.21],
  sign_zona_bano: [0.72, 0.48, 0.04], sign_bandera_roja: [0.72, 0.48, 0.04], sign_prohibido_paso: [0.72, 0.48, 0.04], sign_cocadas: [0.72, 0.48, 0.04],
  sign_ceviche: [0.72, 0.48, 0.04], sign_jugos: [0.72, 0.48, 0.04], sign_helados: [0.72, 0.48, 0.04], sign_alquiler_tablas: [0.72, 0.48, 0.04],
  sign_cooperativa: [0.72, 0.48, 0.04], sign_salvavidas: [0.72, 0.48, 0.04], kiosk: [3.2, 3, 3.2], vendor_cart: [1.6, 2.16, 2],
  cooler_stand: [0.9, 1.16, 0.7], sign_easel: [0.74, 1.2, 0.6], lifeguard_tower: [2.2, 3.6, 2.2], rescue_buoy: [0.32, 0.13, 0.86],
  first_aid: [0.42, 0.3, 0.28], red_flag: [0.92, 2.02, 0.22], lamp: [0.32, 1.03, 0.32], bench: [1.85, 0.92, 0.66], bin: [0.52, 0.96, 0.52],
  bike_rack: [1.8, 0.8, 0.55], fountain: [0.5, 1.06, 0.54], railing: [2, 0.95, 0.12], steps_small: [1.2, 0.46, 0.84], steps_medium: [2, 0.77, 1.4],
  steps_wide: [3, 0.77, 1.4], shower: [0.44, 2.35, 0.76], groyne_rock_1: [1.6, 0.95, 1.25], groyne_rock_2: [1.25, 1.1, 1.45],
  groyne_rock_3: [1.85, 0.8, 1.15], seawall_stones: [1.8, 0.55, 0.65], driftwood_1: [1.5, 0.22, 0.32], driftwood_2: [1.1, 0.3, 0.45],
  driftwood_3: [1.8, 0.34, 0.5], fishing_net: [1.7, 0.14, 1.25], seaweed: [0.7, 0.22, 0.55], shell_conch: [0.27, 0.14, 0.12],
  shell_scallop: [0.16, 0.04, 0.15], palm_small: [3.1, 4.2, 3.1], palm_large: [4.5, 6.6, 4.5],
});

export const sizeOf = (name) => SIZE[name.replace(/^beach_/, '')];
