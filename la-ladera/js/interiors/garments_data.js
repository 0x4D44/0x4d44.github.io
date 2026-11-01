// INTERIORS (A3): adult and child garment manifests, shared palette and adult assortments as plain data, so the furnishing code
// in node and in the page knows every garment's size tag, dimensions, colours and stock recipes without fetching a manifest. GENERATED, do not edit by hand:
//   node la-ladera/tools/garments_data.mjs > la-ladera/js/interiors/garments_data.js        (tests/interiors-garments.test.mjs fails when the two differ)
// Sizes are the library's metres [w, h, d] of the model as it stands (a hung one hangs from its top edge: h is its drop) and the triangles of its LOD (the one the interiors draw).

export const STATES = ['flat', 'folded', 'hung'];
/** LOD packs by size tag and pose, taken from the manifests rather than inferred from an asset name. */
export const GARMENT_FILES = {
  adult: { flat: "garments/garments_flat_lod.glb", folded: "garments/garments_folded_lod.glb", hung: "garments/garments_hung_lod.glb" },
  child: { flat: "garments-child/garments_flat_lod.glb", folded: "garments-child/garments_folded_lod.glb", hung: "garments-child/garments_hung_lod.glb" },
};

/** id -> { sizeTag: adult | child, v: colour variants, flat | folded | hung: [w, h, d, LOD triangles] }. Only applicable poses are present. */
export const GARMENTS = {
  bikini_bottom: { sizeTag: 'adult', v: ['plain_teal', 'plain_coral', 'floral_cream', 'floral_teal'], flat: [0.393, 0.027, 0.279, 116], folded: [0.256, 0.039, 0.155, 212], hung: [0.392, 0.283, 0.039, 115] },
  bikini_top: { sizeTag: 'adult', v: ['plain_teal', 'plain_coral', 'floral_cream', 'floral_teal'], flat: [0.482, 0.028, 0.245, 212], folded: [0.251, 0.061, 0.184, 212], hung: [0.482, 0.247, 0.053, 212] },
  boxers: { sizeTag: 'adult', v: ['plain_navy', 'stripe_navy', 'stripe_teal', 'plain_coral'], flat: [0.501, 0.026, 0.35, 158], folded: [0.264, 0.049, 0.193, 212], hung: [0.505, 0.354, 0.039, 158] },
  bra: { sizeTag: 'adult', v: ['plain_cream', 'plain_lavender', 'plain_charcoal', 'floral_cream'], flat: [0.572, 0.032, 0.216, 212], folded: [0.298, 0.061, 0.144, 212], hung: [0.572, 0.218, 0.082, 212] },
  briefs: { sizeTag: 'adult', v: ['plain_navy', 'plain_charcoal', 'plain_cream', 'stripe_navy'], flat: [0.423, 0.027, 0.299, 124], folded: [0.274, 0.039, 0.166, 212], hung: [0.422, 0.303, 0.038, 124] },
  cap: { sizeTag: 'adult', v: ['plain_navy', 'plain_coral', 'plain_charcoal', 'football_burgundy_navy'], flat: [0.236, 0.16, 0.316, 89], hung: [0.236, 0.316, 0.16, 88] },
  child_backpack: { sizeTag: 'child', v: ['plain_teal', 'plain_coral', 'plain_navy'], flat: [0.24, 0.126, 0.329, 44], hung: [0.24, 0.329, 0.126, 44] },
  child_cap: { sizeTag: 'child', v: ['plain_navy', 'plain_coral', 'plain_teal'], flat: [0.142, 0.096, 0.19, 88], hung: [0.142, 0.19, 0.096, 88] },
  child_cardigan: { sizeTag: 'child', v: ['plain_navy', 'plain_coral', 'plain_lavender'], flat: [0.65, 0.015, 0.436, 114], folded: [0.332, 0.029, 0.231, 212], hung: [0.647, 0.437, 0.025, 113] },
  child_dress: { sizeTag: 'child', v: ['plain_coral', 'floral_cream', 'plain_teal'], flat: [0.481, 0.015, 0.583, 107], folded: [0.248, 0.032, 0.197, 212], hung: [0.481, 0.584, 0.023, 106] },
  child_hoodie: { sizeTag: 'child', v: ['plain_teal', 'plain_navy', 'plain_coral'], flat: [0.675, 0.014, 0.53, 112], folded: [0.344, 0.027, 0.319, 212], hung: [0.664, 0.531, 0.032, 112] },
  child_jeans: { sizeTag: 'child', v: ['plain_navy', 'plain_charcoal'], flat: [0.32, 0.015, 0.583, 111], folded: [0.171, 0.032, 0.195, 212], hung: [0.319, 0.584, 0.022, 111] },
  child_pinafore: { sizeTag: 'child', v: ['plain_navy', 'plain_charcoal'], flat: [0.397, 0.015, 0.589, 96], folded: [0.206, 0.032, 0.197, 211], hung: [0.397, 0.59, 0.022, 96] },
  child_pyjama_bottoms: { sizeTag: 'child', v: ['stripe_teal', 'plain_lavender', 'plain_cream'], flat: [0.331, 0.015, 0.559, 104], folded: [0.177, 0.032, 0.187, 212], hung: [0.33, 0.56, 0.022, 104] },
  child_pyjama_top: { sizeTag: 'child', v: ['stripe_teal', 'plain_lavender', 'plain_cream'], flat: [0.65, 0.015, 0.419, 119], folded: [0.332, 0.029, 0.222, 212], hung: [0.648, 0.42, 0.024, 118] },
  child_rash_vest: { sizeTag: 'child', v: ['plain_teal', 'plain_coral', 'stripe_teal'], flat: [0.482, 0.015, 0.401, 96], folded: [0.248, 0.029, 0.213, 212], hung: [0.48, 0.402, 0.023, 96] },
  child_school_polo: { sizeTag: 'child', v: ['plain_cream', 'plain_navy'], flat: [0.506, 0.017, 0.418, 102], folded: [0.26, 0.031, 0.222, 212], hung: [0.504, 0.419, 0.025, 102] },
  child_school_shirt: { sizeTag: 'child', v: ['plain_cream', 'plain_teal'], flat: [0.506, 0.017, 0.418, 114], folded: [0.26, 0.031, 0.222, 212], hung: [0.504, 0.419, 0.025, 113] },
  child_school_shorts: { sizeTag: 'child', v: ['plain_navy', 'plain_charcoal'], flat: [0.319, 0.015, 0.258, 108], folded: [0.17, 0.028, 0.141, 212], hung: [0.319, 0.26, 0.023, 108] },
  child_school_trousers: { sizeTag: 'child', v: ['plain_charcoal', 'plain_navy'], flat: [0.32, 0.015, 0.583, 108], folded: [0.171, 0.032, 0.195, 212], hung: [0.319, 0.584, 0.022, 108] },
  child_shoes: { sizeTag: 'child', v: ['plain_charcoal', 'plain_navy'], flat: [0.172, 0.084, 0.18, 92], hung: [0.172, 0.18, 0.084, 92] },
  child_skirt: { sizeTag: 'child', v: ['plain_navy', 'plain_coral', 'plain_teal'], flat: [0.373, 0.015, 0.348, 95], folded: [0.194, 0.029, 0.189, 212], hung: [0.373, 0.35, 0.022, 95] },
  child_socks_pair: { sizeTag: 'child', v: ['plain_cream', 'plain_navy', 'stripe_teal'], flat: [0.186, 0.021, 0.228, 112], folded: [0.101, 0.033, 0.132, 211], hung: [0.174, 0.228, 0.037, 112] },
  child_swim_trunks: { sizeTag: 'child', v: ['plain_teal', 'plain_navy', 'stripe_teal'], flat: [0.296, 0.015, 0.258, 104], folded: [0.159, 0.028, 0.141, 211], hung: [0.295, 0.26, 0.023, 104] },
  child_swimsuit_onepiece: { sizeTag: 'child', v: ['plain_teal', 'plain_coral', 'stripe_navy'], flat: [0.278, 0.015, 0.457, 102], folded: [0.146, 0.029, 0.246, 212], hung: [0.274, 0.458, 0.023, 102] },
  child_tshirt: { sizeTag: 'child', v: ['plain_teal', 'plain_coral', 'stripe_navy'], flat: [0.506, 0.015, 0.418, 96], folded: [0.26, 0.029, 0.222, 211], hung: [0.504, 0.419, 0.023, 96] },
  crop_top: { sizeTag: 'adult', v: ['plain_coral', 'plain_teal', 'stripe_navy', 'plain_lavender'], flat: [0.632, 0.027, 0.376, 152], folded: [0.43, 0.049, 0.207, 212], hung: [0.631, 0.38, 0.04, 152] },
  high_leg_knickers: { sizeTag: 'adult', v: ['plain_coral', 'plain_cream', 'plain_teal', 'floral_cream'], flat: [0.393, 0.045, 0.319, 117], folded: [0.262, 0.043, 0.176, 212], hung: [0.4, 0.323, 0.039, 116] },
  knickers: { sizeTag: 'adult', v: ['plain_cream', 'plain_lavender', 'floral_cream', 'stripe_teal'], flat: [0.405, 0.041, 0.289, 120], folded: [0.268, 0.039, 0.16, 212], hung: [0.407, 0.293, 0.041, 120] },
  leggings: { sizeTag: 'adult', v: ['plain_charcoal', 'plain_navy', 'plain_lavender'], flat: [0.377, 0.025, 0.971, 152], folded: [0.206, 0.054, 0.325, 211], hung: [0.375, 0.973, 0.04, 152] },
  nightdress: { sizeTag: 'adult', v: ['plain_lavender', 'plain_cream', 'floral_cream', 'floral_teal'], flat: [0.662, 0.026, 0.972, 142], folded: [0.344, 0.055, 0.328, 211], hung: [0.662, 0.973, 0.043, 141] },
  panties: { sizeTag: 'adult', v: ['plain_coral', 'plain_lavender', 'floral_cream', 'floral_teal'], flat: [0.383, 0.027, 0.228, 116], folded: [0.25, 0.039, 0.128, 212], hung: [0.382, 0.233, 0.039, 115] },
  shorts: { sizeTag: 'adult', v: ['plain_navy', 'plain_charcoal', 'plain_teal', 'football_blue_white', 'football_green_yellow'], flat: [0.532, 0.025, 0.43, 159], folded: [0.284, 0.048, 0.235, 212], hung: [0.532, 0.433, 0.038, 158] },
  sock_single: { sizeTag: 'adult', v: ['plain_cream', 'plain_charcoal', 'plain_navy', 'stripe_teal'], flat: [0.232, 0.026, 0.36, 115], folded: [0.169, 0.046, 0.198, 212], hung: [0.213, 0.359, 0.042, 115] },
  socks_pair: { sizeTag: 'adult', v: ['plain_cream', 'plain_charcoal', 'plain_navy', 'stripe_teal'], flat: [0.31, 0.032, 0.379, 130], folded: [0.169, 0.054, 0.209, 211], hung: [0.298, 0.378, 0.06, 130] },
  straw_hat: { sizeTag: 'adult', v: ['straw_natural', 'straw_pale'], flat: [0.41, 0.144, 0.455, 106], hung: [0.41, 0.455, 0.144, 106] },
  sun_hat: { sizeTag: 'adult', v: ['plain_cream', 'plain_coral', 'plain_teal', 'floral_cream'], flat: [0.354, 0.18, 0.393, 89], folded: [0.262, 0.071, 0.33, 89], hung: [0.354, 0.393, 0.18, 89] },
  swim_trunks: { sizeTag: 'adult', v: ['plain_navy', 'plain_coral', 'stripe_teal'], flat: [0.493, 0.027, 0.429, 157], folded: [0.324, 0.048, 0.235, 211], hung: [0.492, 0.433, 0.038, 156] },
  swimsuit_onepiece: { sizeTag: 'adult', v: ['plain_teal', 'plain_navy', 'floral_teal'], flat: [0.464, 0.027, 0.761, 136], folded: [0.299, 0.049, 0.41, 211], hung: [0.459, 0.763, 0.042, 136] },
  thong: { sizeTag: 'adult', v: ['plain_charcoal', 'plain_lavender', 'plain_coral'], flat: [0.362, 0.027, 0.247, 115], folded: [0.237, 0.039, 0.138, 212], hung: [0.361, 0.253, 0.039, 115] },
  tights: { sizeTag: 'adult', v: ['plain_charcoal', 'plain_navy', 'plain_lavender'], flat: [0.355, 0.026, 1.052, 151], folded: [0.189, 0.055, 0.35, 212], hung: [0.356, 1.053, 0.038, 150] },
  tshirt: { sizeTag: 'adult', v: ['plain_cream', 'plain_navy', 'plain_teal', 'stripe_navy', 'stripe_teal', 'football_blue_white', 'football_red_white', 'football_green_yellow', 'football_burgundy_navy'], flat: [0.843, 0.026, 0.697, 119], folded: [0.434, 0.048, 0.377, 211], hung: [0.835, 0.699, 0.049, 119] },
  underwear: { sizeTag: 'adult', v: ['plain_cream', 'plain_charcoal', 'plain_navy'], flat: [0.413, 0.027, 0.309, 125], folded: [0.268, 0.039, 0.171, 212], hung: [0.41, 0.313, 0.041, 125] },
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
