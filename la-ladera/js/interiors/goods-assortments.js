// Editable DATA: product keys per shop and fixture. No shop fitting or rendering code belongs in this file.
// layout names select generic support planes in goods.js; sizes are metres, rows pack from front to back.
//
// GOODS_FIXTURES, per fixture (the catalogue key of the piece the stock stands on or in):
//   layout / surfaces / rows / gap / maxItems / topOffset / headroom   where the stock goes (goods.js resolveGoodsSurfaces): a layout's planes, or explicit `surfaces` (local x, z, y, w, d, h)
//   obstacles    boxes of the DRAWN piece the stock must not stand in (local x, y, z, w, h, d), things the model carries on its own work surface
//   stockParts   the stock BAKED INTO the furniture model: { part number: its material }. When the goods library stocks the fixture, build.js leaves those parts out (a part
//                counts only if its material is the one named, so a model rebuilt with other numbers shows its old stock again and a test fails: it never loses a shelf board)

export const GOODS_FIXTURES = {
  shelf_tienda: { layout: 'shelf', maxItems: 44, stockParts: { 2: 'plastic_solid', 3: 'paper' } },
  shelf_ferre: { layout: 'shelf', maxItems: 36, stockParts: { 2: 'cardboard', 3: 'metal_steel' } },
  shelf_pharma: { layout: 'shelf', maxItems: 44, stockParts: { 2: 'paper', 3: 'plastic_solid' } },
  shelf_papel: { layout: 'shelf', maxItems: 36, stockParts: { 2: 'plastic_solid' } },
  shelf_shoes: { layout: 'shelf', maxItems: 20, gap: 0.025, stockParts: { 2: 'rubber_black' } },
  shelf_fabric: { layout: 'shelf', maxItems: 30, stockParts: { 2: 'fabric_bedding' } },
  shelf_cafe: { layout: 'shelf', maxItems: 36, stockParts: { 2: 'plastic_solid', 3: 'paper' } },
  chips_rack: { layout: 'shelf', maxItems: 18, gap: 0.014, stockParts: { 2: 'plastic_solid' } },                  // (the library model is a narrow shelf unit, not the stand-in's wire spinner)
  bread_rack: { layout: 'rack', maxItems: 24, rows: 2, stockParts: { 2: 'food_bread' } },
  rack_fabric: { layout: 'rack', maxItems: 28, stockParts: { 1: 'fabric_bedding' } },
  spinner_rack: { maxItems: 24, rows: 2, stockParts: { 2: 'paper' },                                              // four square trays round a central pole (0.218 + k 0.336)
    surfaces: [0, 1, 2, 3].map((k) => ({ x: 0, z: 0, y: +(0.218 + k * 0.336).toFixed(3), w: 0.4, d: 0.4, h: 0.31 })), obstacles: [{ x: 0, y: 0, z: 0, w: 0.06, h: 1.7, d: 0.06 }] },
  parts_shelf: { layout: 'shelf', maxItems: 30, stockParts: { 2: 'cardboard', 3: 'metal_steel' } },
  shop_counter_glass: { layout: 'case', maxItems: 14 },
  pharmacy_counter: { layout: 'case', maxItems: 20, rows: 2 },
  bread_case_glass: { maxItems: 16, stockParts: { 3: 'plastic_solid' }, surfaces: [{ x: 0, z: 0.1, y: 0.514, w: 1.46, d: 0.36, h: 0.6 }] },       // the hero's glass case: floor 0.514, glass to 1.174
  fridge_meat: { maxItems: 14, stockParts: { 3: 'plastic_solid' }, surfaces: [{ x: 0, z: 0.1, y: 0.514, w: 1.66, d: 0.46, h: 0.6 }] },
  cafe_counter: { layout: 'top', maxItems: 14, rows: 2 },
  shop_counter_wood: { layout: 'top', maxItems: 12, rows: 2 },
  shop_counter_short: { layout: 'top', maxItems: 8, rows: 2 },
  barber_station: { layout: 'top', maxItems: 8, topOffset: 0 },
  butcher_block: { maxItems: 4, surfaces: [{ x: 0, z: -0.22, y: 0.85, w: 0.68, d: 0.28, h: 0.25 }] },
  dough_table: { layout: 'top', maxItems: 8, rows: 2 },                                                           // two rows, the rolling pin lies between them (x -0.08..0.55, z 0)
  cutting_table: { layout: 'top', maxItems: 12, rows: 2 },
  cobbler_bench: { layout: 'top', maxItems: 10, rows: 2, obstacles: [{ x: 0.434, y: 1, z: 0.233, w: 0.2, h: 0.14, d: 0.2 }] },      // the vice at the front right
  workbench_metal: { layout: 'top', maxItems: 10, rows: 2, obstacles: [{ x: 0.558, y: 0.95, z: 0.233, w: 0.2, h: 0.14, d: 0.2 }] },    // and the bench's
  // (the library models carry no leather or tools in the middle of the top: the stand-in's did, and had an obstacle there)
  table_cafe_round: { layout: 'round', maxItems: 3 },
  fruit_stand: { maxItems: 30, rows: 2, gap: 0.012, stockParts: { 1: 'food_banana' }, surfaces: [{ x: 0, z: 0, y: 0.61, w: 1.48, d: 0.78, h: 0.3 }] },       // the library model is one deep tray (floor 0.61, rim 0.834)
  crate_stack_mango: { layout: 'crate', maxItems: 12, rows: 2, stockParts: { 1: 'food_mango' } },
  crate_stack_lulo: { layout: 'crate', maxItems: 12, rows: 2, stockParts: { 1: 'food_lulo' } },
  crate_stack_tomato: { layout: 'crate', maxItems: 12, rows: 2, stockParts: { 1: 'food_tomato' } },
  crate_stack_veg: { layout: 'crate', maxItems: 12, rows: 2, stockParts: { 1: 'food_veg' } },
  fruit_crate_small: { layout: 'crate', maxItems: 6, stockParts: { 1: 'food_banana' } },
};

export const GOODS_ASSORTMENTS = {
  tienda: {
    shelf_tienda: ['goods_preserves_jar', 'goods_beans_tin', 'goods_milk_bottle', 'goods_rice_sack', 'goods_oil_bottle', 'goods_flour_bag', 'goods_pickles_jar', 'goods_beans_sack', 'goods_fish_tin', 'goods_juice_bottle', 'goods_soda_bottle'],
    chips_rack: ['goods_chips_bag'],
    shop_counter_glass: ['goods_cheese_wedge', 'goods_cheese_wheel', 'goods_preserves_jar', 'goods_fish_tin', 'goods_toy_car', 'goods_wooden_blocks'],
    shop_counter_short: ['goods_soda_bottle', 'goods_chips_bag', 'goods_potted_flower'],
  },
  panaderia: {
    shelf_cafe: ['goods_round_loaf', 'goods_bread_roll', 'goods_baguette', 'goods_croissant', 'goods_flour_bag', 'goods_preserves_jar'],
    bread_rack: ['goods_baguette', 'goods_round_loaf', 'goods_bread_roll', 'goods_croissant'],
    bread_case_glass: ['goods_croissant', 'goods_bread_roll', 'goods_round_loaf', 'goods_baguette', 'goods_cheese_wedge'],
    dough_table: ['goods_flour_bag', 'goods_bread_roll', 'goods_round_loaf'],
  },
  fruver: {
    crate_stack_mango: ['goods_orange', 'goods_apple', 'goods_pear'],
    crate_stack_lulo: ['goods_orange', 'goods_grapes', 'goods_pear'],
    crate_stack_tomato: ['goods_tomato', 'goods_pepper'],
    crate_stack_veg: ['goods_potato', 'goods_pepper', 'goods_tomato'],
    fruit_crate_small: ['goods_apple', 'goods_tomato', 'goods_orange'],
    fruit_stand: ['goods_banana_bunch', 'goods_carrots', 'goods_aubergine', 'goods_cabbage', 'goods_watermelon_slice', 'goods_pear', 'goods_grapes', 'goods_apple', 'goods_tomato', 'goods_pepper'],
    shop_counter_short: ['goods_flower_bunch', 'goods_potted_flower', 'goods_orange'],
  },
  carniceria: {
    fridge_meat: ['goods_steak', 'goods_sausages', 'goods_chicken'],
    butcher_block: ['goods_steak', 'goods_sausages', 'goods_chicken'],
  },
  peluqueria: {
    barber_station: ['goods_tonic_bottle', 'goods_sugar_jar'],
    shop_counter_short: ['goods_potted_flower', 'goods_tonic_bottle'],
  },
  ferreteria: {
    shelf_ferre: ['goods_paint_tin', 'goods_rope_coil', 'goods_hammer', 'goods_pliers', 'goods_paint_tin'],
    shop_counter_wood: ['goods_hammer', 'goods_pliers', 'goods_rope_coil', 'goods_paint_tin'],
  },
  drogueria: {
    shelf_pharma: ['goods_remedy_box', 'goods_bandage_box', 'goods_tonic_bottle', 'goods_remedy_box'],
    pharmacy_counter: ['goods_remedy_box', 'goods_bandage_box', 'goods_tonic_bottle'],
  },
  cafe: {
    shelf_cafe: ['goods_cup_saucer', 'goods_coffee_bag', 'goods_sugar_jar', 'goods_takeaway_cup', 'goods_coffee_sack', 'goods_milk_bottle'],
    cafe_counter: ['goods_cup_saucer', 'goods_croissant', 'goods_takeaway_cup', 'goods_sugar_jar'],
    table_cafe_round: ['goods_cup_saucer', 'goods_croissant', 'goods_takeaway_cup'],
  },
  restaurante: {
    shelf_cafe: ['goods_cup_saucer', 'goods_oil_bottle', 'goods_rice_sack', 'goods_beans_sack', 'goods_preserves_jar'],
    cafe_counter: ['goods_cup_saucer', 'goods_soda_bottle', 'goods_sugar_jar', 'goods_bread_roll'],
  },
  papeleria: {
    shelf_papel: ['goods_exercise_book', 'goods_pencil_bundle', 'goods_newspaper', 'goods_wooden_blocks', 'goods_toy_car', 'goods_toy_bear', 'goods_toy_ball'],
    spinner_rack: ['goods_exercise_book', 'goods_pencil_bundle', 'goods_toy_car', 'goods_toy_ball'],
    shop_counter_wood: ['goods_exercise_book', 'goods_newspaper', 'goods_pencil_bundle'],
  },
  minutos: {
    shop_counter_short: ['goods_chips_bag', 'goods_soda_bottle', 'goods_pencil_bundle'],
  },
  modista: {
    shelf_fabric: ['goods_fabric_stack', 'goods_thread_spool', 'goods_fabric_stack'],
    rack_fabric: ['goods_fabric_stack', 'goods_thread_spool', 'goods_fabric_stack'],
    cutting_table: ['goods_fabric_stack', 'goods_thread_spool'],
    shop_counter_short: ['goods_thread_spool', 'goods_fabric_stack'],
  },
  zapateria: {
    shelf_shoes: ['goods_shoe_pair', 'goods_sandal_pair'],
    cobbler_bench: ['goods_shoe_pair', 'goods_hammer', 'goods_pliers'],
    shop_counter_short: ['goods_sandal_pair', 'goods_shoe_pair'],
  },
  taller: {
    parts_shelf: ['goods_rope_coil', 'goods_paint_tin', 'goods_hammer', 'goods_pliers'],
    workbench_metal: ['goods_hammer', 'goods_pliers', 'goods_paint_tin', 'goods_rope_coil'],
  },
};
