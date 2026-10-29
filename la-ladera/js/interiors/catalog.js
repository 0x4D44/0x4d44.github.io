// Furniture / decor catalogue: the SINGLE source of layout metadata (size, footprint, tags, clearances).
// The Blender builders (tools/blender/furn_*.py) read the same data (dumped by tools/blender/furn_dump_catalog.mjs) so
// `assets/models/manifest.furniture.json` sizes match by construction; tests/interiors-catalog.test.mjs cross-checks them.
//
// Conventions (all assets):
//   origin = centre of the footprint on the floor (floor items), +z = FRONT (the side a person uses), +y up.
//   wall items : origin = bottom-centre of the BACK face; hung at height `y` (default per item).  `wall:true`
//   top items  : stand on a surface (origin = bottom-centre); `top:true`
//   ceiling    : origin = top-centre (hangs down); `ceil:true`
// Options: arch (stand-in archetype), tags, clear:[front,back,side] free space needed, seat:[seatH,n], bh (blocker height),
//          block:false (never blocks), cols (tint palette key), mat (primary material), y (hang height), dyn (animated kind).

export const PAL = {
  wood: [0x8a5a3a, 0x6b4226, 0xa87445, 0x4e3524, 0xc89a62],
  plastic: [0xf0efe8, 0xd23a32, 0x2f6fbf, 0x2f9a58, 0xe8c332, 0x2a2a2a],
  fabric: [0x9a8a72, 0x7a8a9a, 0x8a6a5a, 0x6a7a62, 0xb09a8a, 0x5a6a8a],
  vinyl: [0x7a4a2e, 0x3a2a24, 0x8a3a2a, 0x2f4a3a, 0x403a52, 0x9a7a52],
  paint: [0xf2efe6, 0x7aa7d9, 0x6fae8f, 0xd9a441, 0xb23a2a, 0x2f3a45, 0xe9c9a0],
  metal: [0xcfd2d4, 0x2f3a45, 0x1d5c63, 0xb23a2a, 0xe9e4d4],
  bedding: [0xe6ddd0, 0xd9a0a8, 0x9db8d0, 0xb7c9a0, 0xe0c88a, 0xb88aa8, 0x8aa0c8],
  white: [0xf2f0ea],
  none: [0xffffff],
};

export const CATALOG = {};
const add = (name, w, h, d, arch, tags, o = {}) => {
  CATALOG[name] = { name, size: [w, h, d], footprint: [w, d], arch, tags: tags.split(' '), cols: 'none', ...o };
};

// ------------------------------------------------------------------ beds
add('bed_single', 0.9, 0.6, 1.9, 'bed', 'bed sleep single', { clear: [0.5, 0, 0.4], cols: 'bedding', mat: 'wood_pine', bh: 0.55 });
add('bed_single_metal', 0.95, 0.95, 1.95, 'bed', 'bed sleep single metal', { clear: [0.5, 0, 0.4], cols: 'bedding', mat: 'metal_painted', bh: 0.55 });
add('bed_double', 1.4, 0.65, 1.9, 'bed', 'bed sleep double', { clear: [0.55, 0, 0.45], cols: 'bedding', mat: 'wood_dark', head: 1.0, bh: 0.6 });
add('bed_double_wood', 1.55, 1.0, 2.0, 'bed', 'bed sleep double', { clear: [0.55, 0, 0.45], cols: 'bedding', mat: 'wood_pine', head: 1.0, bh: 0.6 });
add('bed_bunk', 0.95, 1.75, 1.95, 'bunk', 'bed sleep bunk', { clear: [0.55, 0, 0.3], cols: 'bedding', mat: 'wood_pine', bh: 1.75 });
add('bed_cot', 0.72, 0.5, 1.85, 'cot', 'bed sleep cot', { clear: [0.4, 0, 0.3], cols: 'bedding', mat: 'metal_painted', bh: 0.5 });
add('bed_crib', 0.7, 0.95, 1.25, 'crib', 'bed sleep crib baby', { clear: [0.4, 0, 0.3], cols: 'paint', mat: 'wood_painted' });
add('mattress_floor', 0.9, 0.22, 1.9, 'mattress', 'bed sleep mattress', { clear: [0.4, 0, 0.3], cols: 'bedding', mat: 'mattress_ticking', bh: 0.45 });
add('mattress_leaning', 0.9, 1.7, 0.34, 'mattress_up', 'sleep mattress lean storage', { clear: [0.25, 0, 0.05], cols: 'bedding', mat: 'mattress_ticking' });   // stood on its edge against the wall by day: the bed of a room too small for a bed frame
add('nightstand_a', 0.42, 0.55, 0.38, 'cabinet', 'storage nightstand', { cols: 'wood', mat: 'wood_pine' });
add('nightstand_b', 0.45, 0.5, 0.4, 'cabinet', 'storage nightstand', { cols: 'paint', mat: 'wood_painted' });

// ------------------------------------------------------------------ seating
add('sofa_3_vinyl', 2.0, 0.88, 0.9, 'sofa', 'seat sofa vinyl', { seat: [0.45, 3], clear: [0.6, 0, 0.05], cols: 'vinyl', mat: 'vinyl_sofa' });
add('sofa_3_fabric', 1.9, 0.85, 0.92, 'sofa', 'seat sofa fabric', { seat: [0.45, 3], clear: [0.6, 0, 0.05], cols: 'fabric', mat: 'fabric_sofa' });
add('sofa_2_fabric', 1.5, 0.85, 0.88, 'sofa', 'seat sofa fabric', { seat: [0.45, 2], clear: [0.6, 0, 0.05], cols: 'fabric', mat: 'fabric_sofa' });
add('sofa_2_vinyl', 1.5, 0.88, 0.88, 'sofa', 'seat sofa vinyl', { seat: [0.45, 2], clear: [0.6, 0, 0.05], cols: 'vinyl', mat: 'vinyl_sofa' });
add('armchair_vinyl', 0.85, 0.92, 0.85, 'armchair', 'seat armchair vinyl', { seat: [0.45, 1], clear: [0.5, 0, 0.05], cols: 'vinyl', mat: 'vinyl_sofa' });
add('armchair_fabric', 0.8, 0.95, 0.82, 'armchair', 'seat armchair fabric', { seat: [0.45, 1], clear: [0.5, 0, 0.05], cols: 'fabric', mat: 'fabric_sofa' });
add('rocking_chair', 0.6, 1.0, 0.9, 'chair', 'seat rocking wood', { seat: [0.42, 1], clear: [0.4, 0.3, 0.05], cols: 'wood', mat: 'wood_dark' });
add('chair_wood', 0.44, 0.9, 0.46, 'chair', 'seat chair wood', { seat: [0.46, 1], cols: 'wood', mat: 'wood_pine' });
add('chair_wood_padded', 0.45, 0.92, 0.48, 'chair', 'seat chair wood padded', { seat: [0.47, 1], cols: 'vinyl', mat: 'wood_dark' });
add('chair_plastic', 0.45, 0.82, 0.5, 'chair', 'seat chair plastic', { seat: [0.45, 1], cols: 'plastic', mat: 'plastic_solid' });
add('chair_plastic_arm', 0.55, 0.82, 0.55, 'chair', 'seat chair plastic arm', { seat: [0.45, 1], cols: 'plastic', mat: 'plastic_solid' });
add('chair_metal', 0.42, 0.85, 0.45, 'chair', 'seat chair metal', { seat: [0.45, 1], cols: 'metal', mat: 'metal_painted' });
add('stool_wood', 0.33, 0.46, 0.33, 'stool', 'seat stool wood', { seat: [0.46, 1], cols: 'wood', mat: 'wood_pine' });
add('stool_bar', 0.36, 0.72, 0.36, 'stool', 'seat stool bar', { seat: [0.68, 1], cols: 'plastic', mat: 'metal_painted' });
add('stool_plastic', 0.32, 0.42, 0.32, 'stool', 'seat stool plastic', { seat: [0.42, 1], cols: 'plastic', mat: 'plastic_solid' });
add('pouf', 0.42, 0.4, 0.42, 'stool', 'seat pouf', { seat: [0.4, 1], cols: 'fabric', mat: 'fabric_sofa' });
add('bench_wood', 1.4, 0.46, 0.38, 'bench', 'seat bench wood', { seat: [0.46, 3], cols: 'wood', mat: 'wood_pine' });
add('bench_pew', 2.2, 0.95, 0.6, 'pew', 'seat bench pew chapel', { seat: [0.45, 4], clear: [0.5, 0, 0], cols: 'wood', mat: 'wood_dark' });
add('bench_pew_short', 1.6, 0.95, 0.6, 'pew', 'seat bench pew chapel', { seat: [0.45, 3], clear: [0.5, 0, 0], cols: 'wood', mat: 'wood_dark' });
add('waiting_row', 1.6, 0.85, 0.55, 'waiting', 'seat bench waiting clinic', { seat: [0.45, 3], cols: 'metal', mat: 'metal_painted' });
add('barber_chair', 0.7, 1.1, 0.95, 'barber', 'seat barber shop', { seat: [0.55, 1], clear: [0.8, 0.8, 0.5], cols: 'vinyl', mat: 'vinyl_sofa' });
add('office_chair', 0.56, 0.95, 0.56, 'chair', 'seat chair office', { seat: [0.47, 1], cols: 'plastic', mat: 'plastic_solid' });
add('desk_school', 0.62, 0.78, 0.82, 'pupitre', 'school desk seat', { seat: [0.43, 1], cols: 'paint', mat: 'wood_pine', clear: [0.1, 0, 0] });

// ------------------------------------------------------------------ tables
add('table_formica_4', 1.0, 0.75, 0.7, 'table', 'table formica kitchen', { cols: 'paint', mat: 'formica', top: 'oilcloth_floral' });
add('table_formica_6', 1.4, 0.75, 0.8, 'table', 'table formica dining', { cols: 'paint', mat: 'formica', top: 'oilcloth_check' });
add('table_wood_6', 1.6, 0.75, 0.85, 'table', 'table wood dining', { cols: 'wood', mat: 'wood_dark' });
add('table_plastic', 0.85, 0.73, 0.85, 'table', 'table plastic', { cols: 'plastic', mat: 'plastic_solid' });
add('table_round_small', 0.7, 0.72, 0.7, 'tableRound', 'table round', { cols: 'wood', mat: 'wood_pine', top: 'oilcloth_check' });
add('table_cafe_round', 0.62, 0.74, 0.62, 'tableRound', 'table round cafe', { cols: 'metal', mat: 'metal_painted' });
add('coffee_table', 1.0, 0.45, 0.55, 'table', 'table coffee living', { cols: 'wood', mat: 'wood_dark', glass: true });
add('side_table', 0.45, 0.55, 0.45, 'table', 'table side', { cols: 'wood', mat: 'wood_pine' });
add('desk_wood', 1.2, 0.75, 0.6, 'desk', 'table desk work', { cols: 'wood', mat: 'wood_pine', clear: [0.6, 0, 0] });
add('desk_student', 1.0, 0.76, 0.55, 'desk', 'table desk study', { cols: 'paint', mat: 'melamine_wood', clear: [0.6, 0, 0] });
add('desk_teacher', 1.3, 0.78, 0.65, 'desk', 'table desk teacher school', { cols: 'wood', mat: 'wood_dark', clear: [0.6, 0, 0] });
add('desk_office', 1.4, 0.75, 0.7, 'desk', 'table desk office', { cols: 'wood', mat: 'melamine_wood', clear: [0.6, 0, 0] });
add('workbench', 1.8, 0.9, 0.7, 'bench2', 'table workbench workshop', { cols: 'wood', mat: 'wood_old', clear: [0.7, 0, 0] });
add('workbench_metal', 1.8, 0.95, 0.7, 'bench2', 'table workbench workshop metal', { cols: 'metal', mat: 'metal_painted', clear: [0.7, 0, 0] });
add('sewing_table', 1.2, 0.78, 0.55, 'desk', 'table sewing modista', { cols: 'wood', mat: 'wood_dark', clear: [0.6, 0, 0] });
add('cutting_table', 1.9, 0.85, 1.0, 'table', 'table cutting modista', { cols: 'wood', mat: 'wood_pine', clear: [0.5, 0.5, 0.5] });
add('ironing_board', 1.2, 0.9, 0.35, 'ironing', 'laundry ironing', { cols: 'metal', mat: 'metal_painted' });
add('folding_table', 1.2, 0.74, 0.6, 'table', 'table folding hall', { cols: 'plastic', mat: 'plastic_solid' });
add('dough_table', 1.8, 0.9, 0.8, 'table', 'table dough bakery shop', { cols: 'wood', mat: 'wood_pine', clear: [0.7, 0.5, 0.3] });
add('table_pingpong', 2.74, 0.76, 1.52, 'table', 'table pingpong hall game', { cols: 'none', mat: 'metal_painted', clear: [1, 1, 1] });
add('table_foosball', 1.4, 0.9, 0.75, 'table', 'table foosball hall game', { cols: 'none', mat: 'wood_painted', clear: [0.7, 0.7, 0.2] });

// ------------------------------------------------------------------ storage
add('wardrobe_2', 1.0, 2.0, 0.55, 'cabinet', 'storage wardrobe bedroom', { clear: [0.6, 0, 0], cols: 'wood', mat: 'melamine_wood', doors: 2 });
add('wardrobe_3', 1.5, 2.0, 0.56, 'cabinet', 'storage wardrobe bedroom', { clear: [0.6, 0, 0], cols: 'wood', mat: 'wood_dark', doors: 3 });
add('wardrobe_metal', 0.9, 1.9, 0.5, 'cabinet', 'storage wardrobe metal', { clear: [0.6, 0, 0], cols: 'metal', mat: 'metal_painted', doors: 2 });
add('dresser_4', 0.9, 1.1, 0.45, 'dresser', 'storage dresser bedroom', { clear: [0.6, 0, 0], cols: 'wood', mat: 'wood_pine' });
add('dresser_low', 1.2, 0.8, 0.45, 'dresser', 'storage dresser sideboard', { clear: [0.6, 0, 0], cols: 'wood', mat: 'wood_dark' });
add('wall_unit_big', 2.2, 1.9, 0.45, 'wallunit', 'storage wallunit living knickknacks', { clear: [0.6, 0, 0], cols: 'wood', mat: 'wood_dark' });
add('wall_unit_small', 1.6, 1.8, 0.42, 'wallunit', 'storage wallunit living knickknacks', { clear: [0.6, 0, 0], cols: 'wood', mat: 'melamine_wood' });
add('bookshelf', 0.8, 1.8, 0.3, 'shelf', 'storage shelf books', { clear: [0.5, 0, 0], cols: 'wood', mat: 'wood_pine' });
add('bookshelf_low', 0.9, 1.0, 0.3, 'shelf', 'storage shelf books', { clear: [0.5, 0, 0], cols: 'wood', mat: 'wood_pine' });
add('shoe_rack', 0.8, 0.55, 0.3, 'shelf', 'storage shoes entry', { cols: 'metal', mat: 'metal_painted', clear: [0.4, 0, 0] });
add('display_cabinet', 0.9, 1.75, 0.4, 'vitrine', 'storage display living', { clear: [0.5, 0, 0], cols: 'wood', mat: 'wood_dark' });
add('pantry_cabinet', 0.9, 1.9, 0.45, 'cabinet', 'storage pantry kitchen', { clear: [0.6, 0, 0], cols: 'paint', mat: 'wood_painted', doors: 2 });
add('chest_trunk', 0.8, 0.5, 0.45, 'chest', 'storage chest', { clear: [0.5, 0, 0], cols: 'wood', mat: 'wood_old' });
add('tv_stand', 1.2, 0.5, 0.4, 'cabinet', 'storage tvstand living', { clear: [0.5, 0, 0], cols: 'wood', mat: 'melamine_wood', doors: 2 });
add('filing_cabinet', 0.45, 1.3, 0.6, 'dresser', 'storage filing office', { clear: [0.6, 0, 0], cols: 'metal', mat: 'metal_painted' });
add('locker_pair', 0.8, 1.8, 0.5, 'cabinet', 'storage lockers school', { clear: [0.6, 0, 0], cols: 'metal', mat: 'metal_painted', doors: 2 });
add('cubby_shelf', 1.2, 0.8, 0.35, 'shelf', 'storage cubby school', { clear: [0.5, 0, 0], cols: 'paint', mat: 'wood_painted' });
add('shelf_wall', 0.9, 0.2, 0.22, 'shelfWall', 'storage shelf wall decor', { wall: true, y: 1.5, cols: 'wood', mat: 'wood_pine' });
add('coat_rack_wall', 0.7, 0.3, 0.12, 'hooks', 'storage hooks entry decor', { wall: true, y: 1.6, cols: 'wood', mat: 'wood_pine' });

// ------------------------------------------------------------------ kitchen / laundry
add('stove_gas', 0.6, 0.9, 0.62, 'stove', 'kitchen stove gas', { clear: [0.7, 0, 0.1], cols: 'white', mat: 'enamel_white' });
add('gas_cylinder', 0.32, 0.62, 0.32, 'cylinder', 'kitchen gas pipeta', { cols: 'none', mat: 'metal_painted', pc: 0xcf3a2a });
add('fridge', 0.65, 1.7, 0.68, 'fridge', 'kitchen fridge', { clear: [0.7, 0, 0.05], cols: 'white', mat: 'enamel_white' });
add('fridge_small', 0.5, 0.85, 0.55, 'fridge', 'kitchen fridge small', { clear: [0.6, 0, 0.05], cols: 'white', mat: 'enamel_white' });
add('sink_kitchen', 1.2, 0.92, 0.55, 'sinkunit', 'kitchen sink counter', { clear: [0.7, 0, 0], cols: 'paint', mat: 'wood_painted' });
add('counter_base', 0.6, 0.9, 0.6, 'counter', 'kitchen counter', { clear: [0.7, 0, 0], cols: 'paint', mat: 'wood_painted' });
add('counter_base_long', 1.8, 0.92, 0.6, 'counter', 'kitchen counter', { clear: [0.7, 0, 0], cols: 'paint', mat: 'wood_painted' });
add('kitchen_upper', 0.9, 0.7, 0.34, 'upper', 'kitchen upper cabinet', { wall: true, y: 1.45, cols: 'paint', mat: 'wood_painted', bh: 0.7 });
add('pot_rack_wall', 0.8, 0.5, 0.15, 'hooks', 'kitchen pots decor', { wall: true, y: 1.5, cols: 'metal', mat: 'metal_dark' });
add('water_stand', 0.32, 1.05, 0.32, 'cylinder', 'kitchen water botellon', { cols: 'none', mat: 'plastic_solid', pc: 0x7fb4d8 });
add('washing_machine', 0.6, 0.95, 0.6, 'fridge', 'laundry washing machine', { clear: [0.6, 0, 0.05], cols: 'white', mat: 'enamel_white' });
add('lavadero', 1.0, 0.9, 0.6, 'lavadero', 'laundry wash pila patio', { clear: [0.7, 0, 0.1], cols: 'none', mat: 'floor_cement' });
add('bucket_big', 0.5, 0.7, 0.5, 'cylinder', 'laundry bucket water', { cols: 'plastic', mat: 'plastic_solid' });
add('drying_rack', 1.0, 1.0, 0.5, 'rack', 'laundry drying tendedero', { cols: 'metal', mat: 'metal_painted' });
add('laundry_basket', 0.45, 0.45, 0.35, 'cylinder', 'laundry basket', { cols: 'plastic', mat: 'plastic_solid', block: false });
add('clothesline', 2.4, 0.55, 0.05, 'line', 'laundry line decor', { wall: true, y: 1.85, stretch: true, block: false, cols: 'none', mat: 'fabric_bedding' });

// ------------------------------------------------------------------ bathroom
add('toilet', 0.4, 0.78, 0.7, 'toilet', 'bath toilet', { clear: [0.55, 0, 0.2], cols: 'white', mat: 'ceramic_white' });
add('basin_pedestal', 0.5, 0.85, 0.42, 'basin', 'bath basin', { clear: [0.55, 0, 0.1], cols: 'white', mat: 'ceramic_white' });
add('basin_vanity', 0.6, 0.85, 0.45, 'basin', 'bath basin vanity', { clear: [0.55, 0, 0.1], cols: 'white', mat: 'ceramic_white' });
add('shower_tray', 0.9, 2.1, 0.9, 'shower', 'bath shower electric', { clear: [0.4, 0, 0], cols: 'white', mat: 'wall_tile' });
add('shower_head_electric', 0.2, 0.5, 0.2, 'smallbox', 'bath shower head heater decor', { wall: true, y: 1.85, cols: 'white', mat: 'plastic_solid', block: false });
add('mirror_bath', 0.5, 0.7, 0.03, 'mirror', 'bath mirror decor', { wall: true, y: 1.2, cols: 'none', mat: 'mirror', block: false });
add('towel_rail', 0.6, 0.15, 0.1, 'hooks', 'bath towel decor', { wall: true, y: 1.1, cols: 'bedding', mat: 'towel_terry', block: false });
add('trash_bin', 0.28, 0.35, 0.28, 'cylinder', 'bath trash clutter', { cols: 'plastic', mat: 'plastic_solid', block: false });

// ------------------------------------------------------------------ electronics / lights
add('tv_flat', 0.78, 0.5, 0.1, 'tv', 'tv screen electronics', { top: true, dyn: 'tv', cols: 'none', mat: 'plastic_solid' });
add('tv_crt', 0.55, 0.45, 0.4, 'tvcrt', 'tv screen electronics crt', { top: true, dyn: 'tv', cols: 'none', mat: 'plastic_solid' });
add('tv_wall', 0.9, 0.55, 0.08, 'tv', 'tv screen electronics wall', { wall: true, y: 1.85, dyn: 'tv', cols: 'none', mat: 'plastic_solid', block: false });
add('radio_old', 0.35, 0.2, 0.12, 'radio', 'radio electronics decor', { top: true, cols: 'wood', mat: 'wood_dark' });
add('radio_boombox', 0.5, 0.25, 0.18, 'radio', 'radio electronics boombox', { top: true, cols: 'none', mat: 'plastic_solid' });
add('fan_ceiling', 1.1, 0.35, 1.1, 'fanc', 'fan ceiling dyn', { ceil: true, dyn: 'fan', cols: 'wood', mat: 'wood_pine', block: false });
add('fan_stand', 0.45, 1.25, 0.45, 'fans', 'fan stand', { cols: 'none', mat: 'plastic_solid' });
add('fan_desk', 0.3, 0.4, 0.22, 'fans', 'fan desk', { top: true, cols: 'none', mat: 'plastic_solid' });
add('lamp_floor', 0.35, 1.55, 0.35, 'lamp', 'light lamp floor', { cols: 'fabric', mat: 'lamp_shade', light: true });
add('lamp_table', 0.25, 0.42, 0.25, 'lamp', 'light lamp table', { top: true, cols: 'fabric', mat: 'lamp_shade', light: true });
add('bulb_bare', 0.1, 0.22, 0.1, 'bulb', 'light bulb ceiling', { ceil: true, block: false, cols: 'none', mat: 'bulb_glow' });
add('light_tube', 1.25, 0.08, 0.1, 'tube', 'light tube ceiling', { ceil: true, block: false, cols: 'none', mat: 'tube_glow' });
add('pc_set', 0.6, 0.45, 0.5, 'pc', 'electronics computer pc', { top: true, cols: 'none', mat: 'plastic_solid' });
add('phone_landline', 0.22, 0.1, 0.2, 'smallbox', 'electronics phone decor', { top: true, cols: 'none', mat: 'plastic_solid' });
add('sewing_machine', 0.42, 0.36, 0.2, 'smallbox', 'sewing machine modista', { top: true, cols: 'none', mat: 'metal_dark' });
add('photocopier', 0.7, 0.95, 0.6, 'fridge', 'electronics photocopier shop', { clear: [0.7, 0, 0.1], cols: 'white', mat: 'enamel_white' });
add('printer', 0.4, 0.2, 0.35, 'smallbox', 'electronics printer', { top: true, cols: 'none', mat: 'plastic_solid' });
add('speaker', 0.3, 0.9, 0.3, 'cabinet', 'electronics speaker', { cols: 'none', mat: 'plastic_solid' });
add('clock_wall', 0.3, 0.3, 0.05, 'clock', 'decor clock', { wall: true, y: 2.0, block: false, cols: 'none', mat: 'wood_dark' });

// ------------------------------------------------------------------ decor & religion
add('altar_home', 0.8, 1.05, 0.38, 'altar', 'religion altar decor shrine', { clear: [0.6, 0, 0], cols: 'wood', mat: 'wood_painted' });
add('statue_virgin', 0.22, 0.42, 0.16, 'statue', 'religion statue decor', { top: true, cols: 'none', mat: 'plaster_statue' });
add('candles_set', 0.2, 0.2, 0.12, 'smallbox', 'religion candles decor', { top: true, cols: 'none', mat: 'candle_wax' });
add('vase_flowers', 0.2, 0.4, 0.2, 'vase', 'decor flowers vase', { top: true, cols: 'none', mat: 'ceramic_white' });
add('crucifix_wall', 0.3, 0.5, 0.05, 'cross', 'religion crucifix decor', { wall: true, y: 1.9, block: false, cols: 'wood', mat: 'wood_dark' });
add('crucifix_large', 0.6, 1.0, 0.1, 'cross', 'religion crucifix chapel decor', { wall: true, y: 2.0, block: false, cols: 'wood', mat: 'wood_dark' });
add('altar_main', 2.0, 1.1, 0.7, 'altarMain', 'religion altar chapel', { clear: [0.8, 0, 0.3], cols: 'white', mat: 'wood_painted' });
add('lectern', 0.5, 1.25, 0.45, 'lectern', 'religion lectern chapel', { clear: [0.5, 0, 0.2], cols: 'wood', mat: 'wood_dark' });
add('kneeler', 1.2, 0.4, 0.4, 'bench', 'religion kneeler chapel', { cols: 'wood', mat: 'wood_dark' });
add('candle_rack', 0.7, 1.1, 0.45, 'rack', 'religion candles votive chapel', { clear: [0.6, 0, 0.1], cols: 'metal', mat: 'metal_dark' });
add('statue_saint_large', 0.5, 1.5, 0.4, 'statueBig', 'religion statue chapel', { clear: [0.5, 0, 0.1], cols: 'none', mat: 'plaster_statue' });
add('mirror_wall', 0.6, 0.8, 0.03, 'mirror', 'decor mirror', { wall: true, y: 1.15, block: false, cols: 'none', mat: 'mirror' });
add('mirror_barber', 1.4, 1.0, 0.03, 'mirror', 'decor mirror barber shop', { wall: true, y: 1.0, block: false, cols: 'none', mat: 'mirror' });

// ------------------------------------------------------------------ plants
add('plant_tin', 0.2, 0.35, 0.2, 'plant', 'plant tin decor', { top: true, cols: 'none', mat: 'metal_painted' });
add('plant_bucket', 0.45, 0.85, 0.45, 'plant', 'plant bucket decor', { cols: 'plastic', mat: 'plastic_solid' });
add('plant_pot_clay', 0.35, 0.6, 0.35, 'plant', 'plant pot decor', { cols: 'none', mat: 'clay_terracotta' });
add('plant_hanging', 0.3, 0.5, 0.3, 'plant', 'plant hanging decor', { ceil: true, block: false, cols: 'none', mat: 'clay_terracotta' });
add('plant_big', 0.7, 1.7, 0.7, 'plant', 'plant floor decor', { cols: 'none', mat: 'clay_terracotta' });

// ------------------------------------------------------------------ shops
add('shop_counter_glass', 1.8, 1.0, 0.6, 'counter', 'shop counter glass tienda drogueria', { clear: [0.8, 0.7, 0], cols: 'wood', mat: 'wood_dark', glass: true });
add('shop_counter_wood', 2.0, 1.0, 0.65, 'counter', 'shop counter wood ferreteria papeleria', { clear: [0.8, 0.7, 0], cols: 'wood', mat: 'wood_pine' });
add('shop_counter_short', 1.2, 1.0, 0.6, 'counter', 'shop counter small', { clear: [0.8, 0.7, 0], cols: 'wood', mat: 'wood_pine' });
add('shelf_tienda', 1.2, 2.1, 0.38, 'shopshelf', 'shop shelf tienda goods', { clear: [0.8, 0, 0], cols: 'wood', mat: 'wood_pine', goods: 'tienda' });
add('shelf_ferre', 1.2, 2.1, 0.4, 'shopshelf', 'shop shelf ferreteria goods', { clear: [0.8, 0, 0], cols: 'metal', mat: 'metal_painted', goods: 'ferre' });
add('shelf_pharma', 1.2, 2.1, 0.35, 'shopshelf', 'shop shelf drogueria goods', { clear: [0.8, 0, 0], cols: 'white', mat: 'wood_painted', goods: 'pharma' });
add('shelf_papel', 1.2, 2.0, 0.35, 'shopshelf', 'shop shelf papeleria goods', { clear: [0.8, 0, 0], cols: 'wood', mat: 'wood_pine', goods: 'papel' });
add('shelf_shoes', 1.2, 1.8, 0.32, 'shopshelf', 'shop shelf zapateria goods', { clear: [0.8, 0, 0], cols: 'wood', mat: 'wood_pine', goods: 'shoes' });
add('shelf_fabric', 1.0, 1.9, 0.5, 'shopshelf', 'shop shelf modista goods', { clear: [0.8, 0, 0], cols: 'wood', mat: 'wood_painted', goods: 'fabric' });
add('shelf_cafe', 1.2, 2.0, 0.3, 'shopshelf', 'shop shelf cafe restaurante goods', { clear: [0.7, 0, 0], cols: 'wood', mat: 'wood_dark', goods: 'cafe' });
add('shelf_barber', 1.2, 0.2, 0.25, 'shelfWall', 'shop shelf peluqueria goods', { wall: true, y: 1.15, cols: 'wood', mat: 'wood_dark', goods: 'barber', block: false });
add('fridge_drinks', 0.8, 1.9, 0.72, 'fridge', 'shop fridge drinks tienda cafe restaurante', { clear: [0.8, 0, 0.05], cols: 'white', mat: 'enamel_white', display: true });
add('fridge_meat', 1.8, 1.2, 0.8, 'counter', 'shop fridge display carniceria', { clear: [0.8, 0.7, 0], cols: 'white', mat: 'enamel_white', glass: true });
add('chips_rack', 0.5, 1.7, 0.35, 'shopshelf', 'shop rack chips tienda', { clear: [0.6, 0, 0], cols: 'metal', mat: 'metal_dark', goods: 'chips' });
add('bread_case_glass', 1.6, 1.2, 0.7, 'counter', 'shop case glass bread panaderia', { clear: [0.8, 0.7, 0], cols: 'wood', mat: 'wood_pine', glass: true });
add('bread_rack', 0.6, 1.7, 0.5, 'rack', 'shop rack bread panaderia', { clear: [0.6, 0, 0], cols: 'metal', mat: 'metal_painted' });
add('oven_baker', 0.9, 1.8, 0.9, 'oven', 'shop oven panaderia backroom', { clear: [0.9, 0, 0.1], cols: 'metal', mat: 'metal_steel' });
add('crate_stack_mango', 0.6, 0.8, 0.4, 'crates', 'shop crates fruver mango', { cols: 'none', mat: 'wood_pine', fruit: 'food_mango' });
add('crate_stack_lulo', 0.6, 0.8, 0.4, 'crates', 'shop crates fruver lulo', { cols: 'none', mat: 'wood_pine', fruit: 'food_lulo' });
add('crate_stack_tomato', 0.6, 0.8, 0.4, 'crates', 'shop crates fruver tomato', { cols: 'none', mat: 'wood_pine', fruit: 'food_tomato' });
add('crate_stack_veg', 0.6, 0.8, 0.4, 'crates', 'shop crates fruver veg', { cols: 'none', mat: 'wood_pine', fruit: 'food_veg' });
add('fruit_stand', 1.6, 0.9, 0.9, 'fruitstand', 'shop stand fruver', { clear: [0.8, 0.6, 0.2], cols: 'wood', mat: 'wood_pine', fruit: 'food_banana' });
add('butcher_block', 0.8, 0.85, 0.8, 'chopblock', 'shop block carniceria', { clear: [0.7, 0.7, 0.4], cols: 'wood', mat: 'wood_pine' });
add('meat_hooks', 2.0, 0.5, 0.1, 'hooks', 'shop hooks carniceria decor', { wall: true, y: 1.7, cols: 'metal', mat: 'metal_steel', block: false });
add('barber_station', 1.4, 0.95, 0.4, 'counter', 'shop station peluqueria', { clear: [0.8, 0, 0], cols: 'wood', mat: 'wood_dark' });
add('shampoo_chair', 0.7, 1.1, 1.1, 'barber', 'shop chair shampoo peluqueria', { seat: [0.5, 1], clear: [0.8, 0.8, 0.4], cols: 'vinyl', mat: 'vinyl_sofa' });
add('pipes_bundle', 1.8, 0.3, 0.3, 'pipes', 'shop pipes ferreteria clutter', { cols: 'none', mat: 'plastic_solid', block: false });
add('cement_sacks', 0.5, 0.5, 0.8, 'sacks', 'shop sacks ferreteria cement', { cols: 'none', mat: 'cardboard' });
add('paint_cans_stack', 0.4, 0.6, 0.4, 'cans', 'shop cans ferreteria paint', { cols: 'none', mat: 'metal_painted' });
add('tool_pegboard', 1.2, 1.0, 0.08, 'pegboard', 'shop pegboard ferreteria decor', { wall: true, y: 1.1, cols: 'none', mat: 'plywood', block: false });
add('wheelbarrow', 0.6, 0.6, 1.5, 'wheelbarrow', 'shop wheelbarrow ferreteria workshop', { cols: 'none', mat: 'metal_painted' });
add('pharmacy_counter', 2.0, 1.05, 0.6, 'counter', 'shop counter glass drogueria', { clear: [0.8, 0.7, 0], cols: 'white', mat: 'wood_painted', glass: true });
add('fridge_meds', 0.6, 1.7, 0.6, 'fridge', 'shop fridge drogueria meds', { clear: [0.7, 0, 0.05], cols: 'white', mat: 'enamel_white' });
add('cafe_counter', 2.0, 1.0, 0.65, 'counter', 'shop counter cafe restaurante', { clear: [0.8, 0.7, 0], cols: 'wood', mat: 'wood_dark' });
add('spinner_rack', 0.5, 1.6, 0.5, 'rack', 'shop rack papeleria', { clear: [0.6, 0, 0.1], cols: 'metal', mat: 'metal_dark' });
add('cabin_pc', 0.95, 1.4, 0.75, 'cabin', 'shop cabin minutos computer', { clear: [0.6, 0, 0], cols: 'wood', mat: 'melamine_wood' });
add('phone_booth', 0.8, 2.0, 0.8, 'cabin', 'shop booth minutos phone', { clear: [0.6, 0, 0], cols: 'wood', mat: 'melamine_wood' });
add('mannequin', 0.45, 1.7, 0.4, 'mannequin', 'shop mannequin modista', { cols: 'fabric', mat: 'fabric_sofa' });
add('rack_fabric', 1.0, 1.9, 0.5, 'rack', 'shop rack fabric modista', { clear: [0.7, 0, 0.1], cols: 'wood', mat: 'wood_pine' });
add('fitting_curtain', 1.0, 2.1, 1.0, 'curtainCorner', 'shop fitting modista', { clear: [0.4, 0, 0], cols: 'bedding', mat: 'curtain_fabric' });
add('cobbler_bench', 1.4, 1.0, 0.7, 'bench2', 'shop bench zapateria', { clear: [0.7, 0, 0], cols: 'wood', mat: 'wood_old' });
add('shoe_grinder', 0.5, 1.1, 0.5, 'machine', 'shop machine zapateria', { clear: [0.6, 0, 0.1], cols: 'none', mat: 'metal_dark' });
add('motorbike', 0.75, 1.1, 1.9, 'motorbike', 'workshop motorbike taller vehicle', { clear: [0.8, 0.8, 0.5], cols: 'paint', mat: 'metal_painted' });
add('tire_stack', 0.7, 0.8, 0.7, 'tires', 'workshop tires taller clutter', { cols: 'none', mat: 'rubber_black' });
add('oil_drum', 0.58, 0.88, 0.58, 'cylinder', 'workshop drum taller', { cols: 'paint', mat: 'metal_painted' });
add('tool_cabinet_roll', 0.7, 1.0, 0.5, 'dresser', 'workshop tools cabinet taller', { clear: [0.7, 0, 0.1], cols: 'paint', mat: 'metal_painted' });
add('parts_shelf', 1.0, 1.8, 0.4, 'shopshelf', 'workshop parts shelf taller', { clear: [0.7, 0, 0], cols: 'metal', mat: 'metal_painted', goods: 'parts' });

// ------------------------------------------------------------------ school / clinic / hall
add('exam_bed', 0.8, 0.75, 1.95, 'examBed', 'clinic bed exam', { clear: [0.7, 0, 0.7], cols: 'white', mat: 'vinyl_sofa' });
add('medical_scale', 0.45, 1.5, 0.5, 'scale', 'clinic scale', { clear: [0.5, 0, 0.1], cols: 'white', mat: 'enamel_white' });
add('med_cabinet', 0.8, 1.75, 0.4, 'vitrine', 'clinic cabinet meds', { clear: [0.6, 0, 0], cols: 'white', mat: 'enamel_white' });
add('privacy_screen', 1.6, 1.6, 0.1, 'screen', 'clinic screen', { cols: 'bedding', mat: 'curtain_fabric', block: true });
add('iv_stand', 0.5, 1.8, 0.5, 'stand', 'clinic iv', { cols: 'none', mat: 'metal_chrome' });
add('wheelchair', 0.65, 0.9, 1.05, 'wheelchair', 'clinic wheelchair', { cols: 'none', mat: 'metal_dark', block: true });
add('trophy_case', 1.0, 1.8, 0.4, 'vitrine', 'hall trophy display', { clear: [0.5, 0, 0], cols: 'wood', mat: 'wood_dark' });

// ------------------------------------------------------------------ clutter / small things
add('pot_stack', 0.3, 0.3, 0.3, 'cylinder', 'kitchen pots clutter', { top: true, cols: 'none', mat: 'metal_steel' });
add('kettle', 0.22, 0.28, 0.2, 'cylinder', 'kitchen kettle clutter', { top: true, cols: 'none', mat: 'metal_steel' });
add('thermos_set', 0.3, 0.38, 0.25, 'cylinder', 'cafe thermos tinto clutter', { top: true, cols: 'none', mat: 'metal_steel' });
add('dish_rack', 0.5, 0.3, 0.35, 'smallbox', 'kitchen dishes clutter', { top: true, cols: 'none', mat: 'metal_steel' });
add('fruit_bowl', 0.32, 0.18, 0.32, 'cylinder', 'kitchen fruit clutter', { top: true, cols: 'none', mat: 'ceramic_white' });
add('bread_basket', 0.35, 0.2, 0.28, 'cylinder', 'bread basket clutter', { top: true, cols: 'none', mat: 'wood_pine' });
add('bottles_group', 0.3, 0.3, 0.2, 'smallbox', 'bottles clutter', { top: true, cols: 'none', mat: 'glass' });
add('books_stack', 0.25, 0.2, 0.2, 'smallbox', 'books clutter', { top: true, cols: 'paint', mat: 'book_spines' });
add('knickknacks', 0.5, 0.22, 0.2, 'smallbox', 'knickknacks decor clutter', { top: true, cols: 'none', mat: 'ceramic_white' });
add('photo_frames', 0.3, 0.2, 0.08, 'frames', 'photos decor frames', { top: true, cols: 'wood', mat: 'wood_dark' });
add('trophy_football', 0.14, 0.25, 0.14, 'smallbox', 'football trophy decor', { top: true, cols: 'none', mat: 'metal_chrome' });
add('football', 0.22, 0.22, 0.22, 'ball', 'football toy clutter', { cols: 'none', mat: 'plastic_solid', block: false });
add('toy_pile', 0.5, 0.2, 0.5, 'smallbox', 'toys clutter kids', { cols: 'plastic', mat: 'plastic_solid', block: false });
add('doll', 0.15, 0.35, 0.1, 'smallbox', 'toys doll clutter kids', { cols: 'none', mat: 'fabric_bedding', block: false });
add('shoes_pair', 0.28, 0.12, 0.3, 'smallbox', 'shoes clutter', { cols: 'none', mat: 'rubber_black', block: false });
add('school_bag', 0.32, 0.42, 0.18, 'smallbox', 'bag school clutter', { cols: 'plastic', mat: 'plastic_solid', block: false });
add('broom', 0.3, 1.2, 0.3, 'broom', 'broom clutter cleaning', { cols: 'none', mat: 'wood_pine', block: false });
add('mop_bucket', 0.35, 1.2, 0.35, 'broom', 'mop clutter cleaning', { cols: 'plastic', mat: 'plastic_solid', block: false });
add('box_cardboard_s', 0.3, 0.25, 0.3, 'smallbox', 'box clutter', { cols: 'none', mat: 'cardboard', block: false });
add('box_cardboard_m', 0.5, 0.4, 0.4, 'smallbox', 'box clutter', { cols: 'none', mat: 'cardboard' });
add('box_cardboard_l', 0.6, 0.5, 0.5, 'smallbox', 'box clutter', { cols: 'none', mat: 'cardboard' });
add('cage_canary', 0.3, 0.5, 0.3, 'cage', 'pet canary cage decor', { wall: true, y: 1.55, block: false, cols: 'none', mat: 'metal_chrome', dyn: 'canary' });
add('pet_bed', 0.5, 0.12, 0.4, 'smallbox', 'pet bed clutter', { cols: 'fabric', mat: 'fabric_sofa', block: false });
add('cat_sitting', 0.2, 0.3, 0.3, 'cat', 'pet cat animal', { top: false, cols: 'none', mat: 'fur_cat', block: false });
add('dog_sleeping', 0.7, 0.3, 0.4, 'dog', 'pet dog animal', { cols: 'none', mat: 'fur_dog', block: false });
add('guitar_lean', 0.4, 1.0, 0.2, 'guitar', 'music guitar decor', { cols: 'wood', mat: 'wood_pine', block: false });
add('fruit_crate_small', 0.4, 0.3, 0.3, 'crates', 'shop crate fruit clutter', { cols: 'none', mat: 'wood_pine', fruit: 'food_banana', block: false });
add('pigeon_loft', 1.2, 1.5, 0.8, 'loft', 'terrace pigeon loft roof', { clear: [0.6, 0, 0.1], cols: 'wood', mat: 'wood_old' });
add('water_tank_small', 0.8, 1.0, 0.8, 'cylinder', 'terrace tank water', { cols: 'none', mat: 'plastic_solid', pc: 0x2f5f9a });
add('rug_small', 0.9, 0.02, 0.6, 'rug', 'rug decor', { cols: 'none', mat: 'rug_woven', block: false });
add('rug_big', 2.0, 0.02, 1.4, 'rug', 'rug decor living', { cols: 'none', mat: 'rug_woven', block: false });
add('doormat', 0.6, 0.02, 0.4, 'rug', 'rug doormat entry', { cols: 'none', mat: 'rug_woven', block: false });
add('curtain_window', 1.2, 1.4, 0.08, 'curtain', 'decor curtain window', { wall: true, y: 0.9, cols: 'bedding', mat: 'curtain_fabric', block: false });

// ------------------------------------------------------------------ helpers
export const names = () => Object.keys(CATALOG);
export const get = (name) => CATALOG[name];
export const byTag = (tag) => Object.values(CATALOG).filter((c) => c.tags.includes(tag)).map((c) => c.name);
export const isFloorBlocker = (c) => !c.wall && !c.ceil && !c.top && c.block !== false;
/** Seat positions (item-local x offsets, along the width) for a seating item. */
export function seatOffsets(c) {
  const n = c.seat?.[1] ?? 0; if (!n) return [];
  const out = []; const span = c.size[0] * (c.arch === 'sofa' ? 0.8 : 0.9);
  for (let i = 0; i < n; i++) out.push(n === 1 ? 0 : -span / 2 + span * (i + 0.5) / n);
  return out;
}
