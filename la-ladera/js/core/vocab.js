// Shared vocabulary - the words agents use to talk to each other. Add to it only via dev/REQUESTS.md (lead applies).
export const LOT_KINDS = [
  'house',        // 1-3 storey single family home, narrow, party walls
  'rowhouse',     // one unit of a terrace of identical-ish narrow houses
  'apartments',   // 4-5 storey block with shared stairwell, one flat per floor or two
  'shophouse',    // ground floor shop (see shop) + family home above
  'courtyard',    // casa patio: rooms around an open central patio with a gallery
  'tenement',     // inquilinato: many small rooms off an open-air corridor + shared patio, wash basin, shared bathrooms
  'unfinished',   // concrete frame + hollow-brick infill, top floor open with rebar sprouting ("obra negra")
  'cornerstore',  // corner building with a shop on the corner and a family upstairs
  'chapel',       // small neighbourhood chapel (capilla)
  'school',       // small primary school: classrooms around a yard
  'clinic',       // community health post
  'workshop',     // taller: motorbike repair / carpentry / welding, with living space above
  'kiosk',        // street kiosk or market stall large enough to step inside
  'hall',         // community hall / sports club room by the court
];

export const SHOP_TYPES = [
  'tienda',       // miscelanea / corner store: snacks, drinks fridge, phone minutes, bags of rice
  'panaderia',    // bakery: breads in glass cases, display, oven room
  'fruver',       // fruit & vegetable shop: crates of mango, lulo, platano, tomato
  'carniceria',   // butcher
  'peluqueria',   // hair salon / barber
  'ferreteria',   // hardware store
  'drogueria',    // pharmacy
  'cafe',         // tinto / cafe with a few tables
  'restaurante',  // menu-del-dia restaurant, plastic chairs, TV
  'papeleria',    // stationery + photocopies
  'minutos',      // internet cabins / phone minutes
  'modista',      // seamstress / tailor
  'zapateria',    // shoe repair
  'taller',       // motorbike workshop
];

export const ROOM_TYPES = [
  'living', 'dining', 'kitchen', 'bedroom', 'bathroom', 'hall', 'corridor', 'stairwell', 'landing',
  'shop', 'backroom', 'patio', 'terrace', 'balcony', 'laundry', 'workshop', 'chapel', 'classroom', 'office', 'garage', 'entry',
];

export const STREET_KINDS = ['road', 'street', 'alley', 'stair', 'path', 'plaza', 'court'];

/** Seat/eye heights etc. shared by interiors + people so sitting NPCs line up with furniture. */
export const HUMAN = { stand: 1.7, seat: 0.45, counter: 0.95, table: 0.75, bed: 0.5 };
