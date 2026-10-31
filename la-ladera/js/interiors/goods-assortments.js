// Editable DATA: product keys per shop and fixture. No shop fitting or rendering code belongs in this file.
// layout names select generic support planes in goods.js; sizes are metres, rows pack from front to back.
export const GOODS_FIXTURES = {
  shelf_tienda: { layout: 'shelf', maxItems: 44 },
  shelf_ferre: { layout: 'shelf', maxItems: 36 },
  shelf_pharma: { layout: 'shelf', maxItems: 44 },
  shelf_papel: { layout: 'shelf', maxItems: 36 },
  shelf_shoes: { layout: 'shelf', maxItems: 20, gap: 0.025 },
  shelf_fabric: { layout: 'shelf', maxItems: 30 },
  shelf_cafe: { layout: 'shelf', maxItems: 36 },
  chips_rack: { layout: 'chips', maxItems: 18, gap: 0.014 },
  bread_rack: { layout: 'rack', maxItems: 24, rows: 2 },
  rack_fabric: { layout: 'rack', maxItems: 28 },
  spinner_rack: { layout: 'rack', maxItems: 24 },
  parts_shelf: { layout: 'shelf', maxItems: 30 },
  shop_counter_glass: { layout: 'case', maxItems: 14 },
  pharmacy_counter: { layout: 'case', maxItems: 20, rows: 2 },
  bread_case_glass: { layout: 'case', maxItems: 16 },
  fridge_meat: { layout: 'case', maxItems: 14 },
  cafe_counter: { layout: 'top', maxItems: 14, rows: 2 },
  shop_counter_wood: { layout: 'top', maxItems: 12, rows: 2 },
  shop_counter_short: { layout: 'top', maxItems: 8, rows: 2 },
  barber_station: { layout: 'top', maxItems: 8, topOffset: 0 },
  butcher_block: { maxItems: 4, surfaces: [{ x: 0, z: -0.22, y: 0.85, w: 0.68, d: 0.28, h: 0.25 }] },
  dough_table: { layout: 'top', maxItems: 8 },
  cutting_table: { layout: 'top', maxItems: 12, rows: 2 },
  cobbler_bench: { layout: 'top', maxItems: 10, rows: 2, obstacles: [
    { x: 0.476, y: 1, z: -0.14, w: 0.12, h: 0.1, d: 0.1 },
    { x: -0.28, y: 1, z: 0, w: 0.3, h: 0.04, d: 0.2 },
  ] },
  workbench_metal: { layout: 'top', maxItems: 10, rows: 2, obstacles: [
    { x: 0.612, y: 0.95, z: -0.14, w: 0.12, h: 0.1, d: 0.1 },
    { x: -0.36, y: 0.95, z: 0, w: 0.3, h: 0.04, d: 0.2 },
  ] },
  table_cafe_round: { layout: 'round', maxItems: 3 },
  fruit_stand: { layout: 'fruitstand', maxItems: 30, rows: 2, gap: 0.012 },
  crate_stack_mango: { layout: 'crate', maxItems: 12, rows: 2 },
  crate_stack_lulo: { layout: 'crate', maxItems: 12, rows: 2 },
  crate_stack_tomato: { layout: 'crate', maxItems: 12, rows: 2 },
  crate_stack_veg: { layout: 'crate', maxItems: 12, rows: 2 },
  fruit_crate_small: { layout: 'crate', maxItems: 6 },
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
