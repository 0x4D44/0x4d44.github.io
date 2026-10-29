// Shared constants. Units are metres, +Y up, world origin at the centre of the
// 200 x 200 m plot: x east (-100..100), z south (-100..100). The hill rises toward -z.
export const CONFIG = {
  SEED: 20261029,
  HALF: 100,                 // plot is [-100,100] on both axes
  PERIPHERY: 40,             // decorative (non-enterable) ring drawn beyond the plot
  PLAYER: {
    radius: 0.3, height: 1.78, eye: 1.64, crouchEye: 1.15,
    stepUp: 0.5, maxSlope: 0.9,
    walk: 2.3, sprint: 5.0, crouch: 1.2,
    gravity: 9.8, jump: 3.6,
  },
  // Architecture defaults
  FLOOR_H: 2.8,              // floor-to-floor height (informal housing 2.6-2.8, shops 3.2)
  SLAB: 0.18,                // floor slab thickness
  WALL_EXT: 0.22, WALL_INT: 0.12,
  DOOR_W: 0.9, DOOR_H: 2.1,
  // Default time of day (decimal hours). Golden afternoon.
  HOUR: 17.2,
};

// Facade palette: colourwashed plaster as seen in Medellin, Valparaiso, Rio hillside barrios.
// Use as material tints (`ctx.mat('plaster_a#d9a441')`) so a handful of neutral textures give many colours.
export const PALETTE = {
  facade: [
    0xd9a441, // ochre
    0xc8573c, // terracotta
    0xe08aa0, // rose
    0x3a7ca5, // cobalt
    0x6fae8f, // mint
    0xf0d36a, // butter yellow
    0xf2efe6, // whitewash
    0xb9b2a5, // raw cement render
    0xd97b4a, // burnt orange
    0x8f5fa8, // violet
    0x4f9d9a, // teal
    0xe9c9a0, // sand
    0xb04a4a, // brick red paint
    0x7aa7d9, // sky blue
  ],
  roof: [0x9a4a32, 0x6f6a64, 0x3d5a80, 0x7a3b2e, 0x8c8c86],
  trim: [0xf2efe6, 0x2f3a45, 0x1d5c63, 0xb23a2a, 0xe9c14d],
  wood: [0x8a5a3a, 0x6b4226, 0xa87445, 0x4e3524],
  skin: [0xf0c8a0, 0xe0ad82, 0xc88b5e, 0xa66c42, 0x85512f, 0x66391f, 0x4a2a17],
};

export function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }
