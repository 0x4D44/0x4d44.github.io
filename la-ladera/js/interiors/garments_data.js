// INTERIORS (A3): the garment library as plain data (assets/models/manifest.garments.json, garments/palette.json, garments/assortments.json), so the furnishing code,
// in node and in the page, knows every garment's size, colours and stock recipes without fetching a manifest. GENERATED, do not edit by hand:
//   node la-ladera/tools/garments_data.mjs > la-ladera/js/interiors/garments_data.js        (tests/interiors-garments.test.mjs fails when the two differ)
// Sizes are the library's metres [w, h, d] of the model as it stands (a hung one hangs from its top edge: h is its drop) and the triangles of its LOD (the one the interiors draw).

export const STATES = ['flat', 'folded', 'hung'];
/** id -> { v: colour variants the model may wear, flat | folded | hung: [w, h, d, LOD triangles] }. A stiff hat has no folded state. */
export const GARMENTS = {
  bikini_bottom: { v: ['plain_teal', 'plain_coral', 'floral_cream', 'floral_teal'], flat: [0.393, 0.027, 0.279, 116], folded: [0.256, 0.039, 0.155, 212], hung: [0.392, 0.283, 0.039, 115] },
  bikini_top: { v: ['plain_teal', 'plain_coral', 'floral_cream', 'floral_teal'], flat: [0.482, 0.028, 0.245, 212], folded: [0.251, 0.061, 0.184, 212], hung: [0.482, 0.247, 0.053, 212] },
  boxers: { v: ['plain_navy', 'stripe_navy', 'stripe_teal', 'plain_coral'], flat: [0.501, 0.026, 0.35, 158], folded: [0.264, 0.049, 0.193, 212], hung: [0.505, 0.354, 0.039, 158] },
  bra: { v: ['plain_cream', 'plain_lavender', 'plain_charcoal', 'floral_cream'], flat: [0.572, 0.032, 0.216, 212], folded: [0.298, 0.061, 0.144, 212], hung: [0.572, 0.218, 0.082, 212] },
  briefs: { v: ['plain_navy', 'plain_charcoal', 'plain_cream', 'stripe_navy'], flat: [0.423, 0.027, 0.299, 124], folded: [0.274, 0.039, 0.166, 212], hung: [0.422, 0.303, 0.038, 124] },
  cap: { v: ['plain_navy', 'plain_coral', 'plain_charcoal', 'football_burgundy_navy'], flat: [0.236, 0.16, 0.316, 89], hung: [0.236, 0.316, 0.16, 88] },
  crop_top: { v: ['plain_coral', 'plain_teal', 'stripe_navy', 'plain_lavender'], flat: [0.632, 0.027, 0.376, 152], folded: [0.43, 0.049, 0.207, 212], hung: [0.631, 0.38, 0.04, 152] },
  high_leg_knickers: { v: ['plain_coral', 'plain_cream', 'plain_teal', 'floral_cream'], flat: [0.393, 0.045, 0.319, 117], folded: [0.262, 0.043, 0.176, 212], hung: [0.4, 0.323, 0.039, 116] },
  knickers: { v: ['plain_cream', 'plain_lavender', 'floral_cream', 'stripe_teal'], flat: [0.405, 0.041, 0.289, 120], folded: [0.268, 0.039, 0.16, 212], hung: [0.407, 0.293, 0.041, 120] },
  leggings: { v: ['plain_charcoal', 'plain_navy', 'plain_lavender'], flat: [0.377, 0.025, 0.971, 152], folded: [0.206, 0.054, 0.325, 211], hung: [0.375, 0.973, 0.04, 152] },
  nightdress: { v: ['plain_lavender', 'plain_cream', 'floral_cream', 'floral_teal'], flat: [0.662, 0.026, 0.972, 142], folded: [0.344, 0.055, 0.328, 211], hung: [0.662, 0.973, 0.043, 141] },
  panties: { v: ['plain_coral', 'plain_lavender', 'floral_cream', 'floral_teal'], flat: [0.383, 0.027, 0.228, 116], folded: [0.25, 0.039, 0.128, 212], hung: [0.382, 0.233, 0.039, 115] },
  shorts: { v: ['plain_navy', 'plain_charcoal', 'plain_teal', 'football_blue_white', 'football_green_yellow'], flat: [0.532, 0.025, 0.43, 159], folded: [0.284, 0.048, 0.235, 212], hung: [0.532, 0.433, 0.038, 158] },
  sock_single: { v: ['plain_cream', 'plain_charcoal', 'plain_navy', 'stripe_teal'], flat: [0.232, 0.026, 0.36, 115], folded: [0.169, 0.046, 0.198, 212], hung: [0.213, 0.359, 0.042, 115] },
  socks_pair: { v: ['plain_cream', 'plain_charcoal', 'plain_navy', 'stripe_teal'], flat: [0.31, 0.032, 0.379, 130], folded: [0.169, 0.054, 0.209, 211], hung: [0.298, 0.378, 0.06, 130] },
  straw_hat: { v: ['straw_natural', 'straw_pale'], flat: [0.41, 0.144, 0.455, 106], hung: [0.41, 0.455, 0.144, 106] },
  sun_hat: { v: ['plain_cream', 'plain_coral', 'plain_teal', 'floral_cream'], flat: [0.354, 0.18, 0.393, 89], folded: [0.262, 0.071, 0.33, 89], hung: [0.354, 0.393, 0.18, 89] },
  swim_trunks: { v: ['plain_navy', 'plain_coral', 'stripe_teal'], flat: [0.493, 0.027, 0.429, 157], folded: [0.324, 0.048, 0.235, 211], hung: [0.492, 0.433, 0.038, 156] },
  swimsuit_onepiece: { v: ['plain_teal', 'plain_navy', 'floral_teal'], flat: [0.464, 0.027, 0.761, 136], folded: [0.299, 0.049, 0.41, 211], hung: [0.459, 0.763, 0.042, 136] },
  thong: { v: ['plain_charcoal', 'plain_lavender', 'plain_coral'], flat: [0.362, 0.027, 0.247, 115], folded: [0.237, 0.039, 0.138, 212], hung: [0.361, 0.253, 0.039, 115] },
  tights: { v: ['plain_charcoal', 'plain_navy', 'plain_lavender'], flat: [0.355, 0.026, 1.052, 151], folded: [0.189, 0.055, 0.35, 212], hung: [0.356, 1.053, 0.038, 150] },
  tshirt: { v: ['plain_cream', 'plain_navy', 'plain_teal', 'stripe_navy', 'stripe_teal', 'football_blue_white', 'football_red_white', 'football_green_yellow', 'football_burgundy_navy'], flat: [0.843, 0.026, 0.697, 119], folded: [0.434, 0.048, 0.377, 211], hung: [0.835, 0.699, 0.049, 119] },
  underwear: { v: ['plain_cream', 'plain_charcoal', 'plain_navy'], flat: [0.413, 0.027, 0.309, 125], folded: [0.268, 0.039, 0.171, 212], hung: [0.41, 0.313, 0.041, 125] },
};

/** colour variant -> the tint a garment wears (palette.json `color`; the prints atlas is not bound in the game). */
export const VARIANTS = {
  plain_cream: 0xe8e1cf,
  plain_navy: 0x344760,
  plain_charcoal: 0x414249,
  plain_coral: 0xc87870,
  plain_teal: 0x4b8981,
  plain_lavender: 0xa89cb8,
  stripe_navy: 0x344760,
  stripe_teal: 0x4b8981,
  floral_cream: 0xe8e1cf,
  floral_teal: 0x4b8981,
  football_blue_white: 0x366696,
  football_red_white: 0xb54f4b,
  football_green_yellow: 0x397456,
  football_burgundy_navy: 0x884857,
  straw_natural: 0xc4a169,
  straw_pale: 0xddc69c,
};

/** assortments.json: id, kind, the host catalogue keys, and the stock as [asset, variant, count]. */
export const ASSORTMENTS = [
  { id: 'drawer_daily_tops', kind: 'drawer', keys: ['dresser_4', 'dresser_low'], items: [['garment_tshirt_folded', 'stripe_navy', 2], ['garment_crop_top_folded', 'plain_coral', 1], ['garment_shorts_folded', 'plain_teal', 1]] },
  { id: 'drawer_soft_underwear', kind: 'drawer', keys: ['dresser_4', 'dresser_low'], items: [['garment_bra_folded', 'plain_lavender', 1], ['garment_knickers_folded', 'floral_cream', 2], ['garment_high_leg_knickers_folded', 'plain_teal', 1], ['garment_panties_folded', 'plain_coral', 1], ['garment_thong_folded', 'plain_lavender', 1]] },
  { id: 'drawer_underwear_basics', kind: 'drawer', keys: ['dresser_4', 'dresser_low'], items: [['garment_underwear_folded', 'plain_cream', 2], ['garment_briefs_folded', 'plain_navy', 2], ['garment_boxers_folded', 'stripe_teal', 1], ['garment_socks_pair_folded', 'plain_charcoal', 2], ['garment_sock_single_folded', 'plain_cream', 1], ['garment_tights_folded', 'plain_charcoal', 1]] },
  { id: 'drawer_swimwear', kind: 'drawer', keys: ['dresser_4', 'dresser_low'], items: [['garment_swimsuit_onepiece_folded', 'plain_teal', 1], ['garment_swim_trunks_folded', 'plain_navy', 1], ['garment_bikini_top_folded', 'floral_teal', 1], ['garment_bikini_bottom_folded', 'floral_teal', 1]] },
  { id: 'wardrobe_daily', kind: 'wardrobe', keys: ['wardrobe_2', 'wardrobe_3', 'wardrobe_metal'], items: [['garment_tshirt_hung', 'plain_cream', 1], ['garment_crop_top_hung', 'plain_teal', 1], ['garment_shorts_hung', 'plain_navy', 1], ['garment_leggings_hung', 'plain_charcoal', 1], ['garment_nightdress_hung', 'floral_cream', 1]] },
  { id: 'wardrobe_hat_shelf', kind: 'wardrobe', keys: ['wardrobe_2', 'wardrobe_3'], items: [['garment_sun_hat_folded', 'plain_coral', 1], ['garment_straw_hat_flat', 'straw_natural', 1], ['garment_cap_flat', 'plain_navy', 1]] },
  { id: 'washing_line_daily', kind: 'washing_line', keys: ['clothesline', 'drying_rack'], items: [['garment_tshirt_hung', 'football_green_yellow', 1], ['garment_shorts_hung', 'plain_teal', 1], ['garment_socks_pair_hung', 'plain_cream', 1], ['garment_sock_single_hung', 'plain_navy', 1]] },
  { id: 'washing_line_delicates', kind: 'washing_line', keys: ['clothesline', 'drying_rack'], items: [['garment_bra_hung', 'plain_cream', 1], ['garment_knickers_hung', 'plain_lavender', 1], ['garment_high_leg_knickers_hung', 'plain_teal', 1], ['garment_underwear_hung', 'plain_cream', 1]] },
  { id: 'shop_folded_basics', kind: 'shop_shelf', keys: ['shelf_fabric', 'shelf_tienda', 'shop_counter_wood'], items: [['garment_tshirt_folded', 'football_blue_white', 3], ['garment_tshirt_folded', 'football_red_white', 2], ['garment_tshirt_folded', 'football_burgundy_navy', 2], ['garment_leggings_folded', 'plain_charcoal', 2], ['garment_socks_pair_folded', 'plain_cream', 3], ['garment_boxers_folded', 'stripe_navy', 2]] },
  { id: 'shop_flat_swimwear', kind: 'shop_shelf', keys: ['shop_counter_wood', 'cutting_table'], items: [['garment_bikini_top_flat', 'floral_cream', 1], ['garment_bikini_bottom_flat', 'floral_cream', 1], ['garment_swim_trunks_folded', 'stripe_teal', 2], ['garment_swimsuit_onepiece_folded', 'plain_navy', 1]] },
  { id: 'shop_sleepwear', kind: 'shop_shelf', keys: ['shelf_fabric', 'shop_counter_wood'], items: [['garment_nightdress_folded', 'plain_lavender', 2], ['garment_nightdress_folded', 'floral_teal', 1], ['garment_tights_folded', 'plain_navy', 2]] },
  { id: 'shop_hats', kind: 'shop_shelf', keys: ['shelf_fabric', 'shop_counter_wood'], items: [['garment_sun_hat_flat', 'floral_cream', 1], ['garment_straw_hat_flat', 'straw_pale', 1], ['garment_cap_flat', 'plain_coral', 2]] },
];
