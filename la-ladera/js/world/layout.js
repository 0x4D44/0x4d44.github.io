// Hand-authored master layout of La Ladera (data only). plan.js turns it into heights, lots, nav, pois.
// Coordinates: x east, z south (the hill rises toward -z). Plot is [-100,100]^2.
//
// ITEMS are processed IN ORDER (dependencies first): a 'street' or 'plaza' may reference earlier ones.
//   street: { type:'street', id, name, en, kind:'road'|'street'|'alley'|'stair'|'path', width, surface, corners:[[x,z]..], radii:[..],
//             snap0/snap1:'Sx' (snap that end onto street Sx's centre-line and take its height),
//             from0/from1:'Sx'|'Px' (take the end height from that street's profile / plaza's y, no snapping), y0/y1 (explicit),
//             sidewalk, lamps, hold:[s0,s1] (stairs: a mandatory flat landing between those arc positions) }
//   plaza:  { type:'plaza', id, name, en, kind:'plaza'|'court'|'yard'|'mirador', rect:[cx,cz,w,d,ry], yFrom:'Sx' | null }
// ROWS: frontage runs of lots along a straight chord = corner k -> k+1 of that street's RAW corners (after snapping).
//   { st:'S1', leg:1, side:'N'|'S'|'E'|'W' (which side of the chord the lots stand on), s0:12 (metres along the chord),
//     items:[ [w, d, floors | [min,max], kind, shop|null, { g: gap before, name, u: door offset, roof, roofAccess } ] ] }
//   A row may instead be { st:'P4', at:[x,z], ry, items } : lots placed explicitly facing a plaza (front = that plaza).

const st = (o) => ({ type: 'street', surface: 'concrete', ...o });

export const ITEMS = [
  // ============================================================================================== roads and streets
  st({ id: 'S1', name: 'Calle del Sol', en: 'Sun Street', kind: 'road', width: 8, surface: 'asphalt', sidewalk: true, lamps: true,
    corners: [[46, 100], [46, 74], [-60, 48], [-60, 34], [56, 6], [56, -8], [-60, -32], [-60, -46], [24, -60]],
    radii: [0, 10, 9, 9, 9, 9, 9, 9, 0] }),
  st({ id: 'S2', name: 'Calle del Comercio', en: 'Commerce Street', kind: 'street', width: 5, surface: 'asphalt', sidewalk: true, lamps: true,
    corners: [[46, 88], [-62, 88]], snap0: 'S1' }),
  // Paseo de la Virgen: the gentle approach from the bottom street to the foot of the grand stair
  st({ id: 'S3', name: 'Paseo de la Virgen', en: 'Virgin Promenade', kind: 'path', width: 5, surface: 'concrete', lamps: true,
    corners: [[-6.5, 86], [-6.5, 64.5]], from0: 'S2', from1: 'S1', lin: true }),
  // The grand stair, L1 -> L2, with the shrine plaza as the middle landing
  st({ id: 'S4', name: 'Escalinata de la Virgen', en: 'Stairway of the Virgin', kind: 'stair', width: 4.2, lamps: true,
    corners: [[-6.5, 57.4], [-6.5, 25.3]], from0: 'S1', from1: 'S1', hold: [11.5, 19.5] }),
  { type: 'plaza', id: 'P1', name: 'Plazoleta de la Virgen', en: 'Little Square of the Virgin', kind: 'plaza', rect: [-6.5, 41.4, 14, 8, 0], yFrom: 'S4' },
  st({ id: 'S5', name: 'Calle de los Almendros', en: 'Almond Tree Street', kind: 'street', width: 4.4, lamps: true,
    corners: [[46, 40], [0.5, 40]], from1: 'P1' }),
  st({ id: 'S6', name: 'Calle de los Almendros', en: 'Almond Tree Street (west)', kind: 'street', width: 4.4, lamps: true,
    corners: [[-12.5, 40], [-38, 36]], from0: 'P1' }),
  st({ id: 'S7', name: 'Escalera de los Almendros', en: 'Almond Stairs', kind: 'stair', width: 2.6, lamps: true,
    corners: [[41, 68.9], [41, 41.8]], from0: 'S1', from1: 'S5' }),
  st({ id: 'S8', name: 'Escalera del Chorro', en: 'Spout Stairs', kind: 'stair', width: 2.4, lamps: true,
    corners: [[46, 38], [46, 13]], from0: 'S5', from1: 'S1' }),
  { type: 'plaza', id: 'P2', name: 'Plazoleta de los Almendros', en: 'Almond Tree Square', kind: 'plaza', rect: [20, 47.2, 17, 9, 0], yFrom: 'S5' },

  // region C: between Calle del Sol legs 2 and 3
  st({ id: 'S9', name: 'Callejón de los Faroles', en: 'Lantern Alley', kind: 'alley', width: 3.4, lamps: true,
    corners: [[34, 11.3], [28, 3], [10, 0], [-22, -2], [-46, -4]], radii: [0, 8, 12, 12, 0], snap0: 'S1' }),
  st({ id: 'S10', name: 'Escalera de la Cruz', en: 'Cross Stairs', kind: 'stair', width: 2.4, lamps: true,
    corners: [[-20, 19.8], [-20, -0.3]], from0: 'S1', from1: 'S9' }),
  st({ id: 'S11', name: 'Escalera del Farol', en: 'Lamp Stairs', kind: 'stair', width: 2.4, lamps: true,
    corners: [[-26, -4.4], [-26, -20.8]], from0: 'S9', from1: 'S1' }),

  // region D: between legs 3 and 4
  st({ id: 'S12', name: 'Callejón de la Cruz', en: 'Cross Alley', kind: 'alley', width: 3.4, lamps: true,
    corners: [[40, -33], [14, -38], [-14, -40], [-34, -41]], radii: [0, 12, 12, 0] }),
  st({ id: 'S13', name: 'Escalera del Mirto', en: 'Myrtle Stairs', kind: 'stair', width: 2.6, lamps: true,
    corners: [[14, -20.9], [14, -36.0]], from0: 'S1', from1: 'S12' }),
  st({ id: 'S14', name: 'Escalera de la Cumbre', en: 'Summit Stairs', kind: 'stair', width: 3.2, lamps: true,
    corners: [[2, -41.4], [2, -52.2]], from0: 'S12', from1: 'S1' }),

  // summit
  { type: 'plaza', id: 'P4', name: 'Plazoleta de la Capilla', en: 'Chapel Square', kind: 'plaza', rect: [4.25, -67.55, 20, 11, 0.166], yFrom: 'S1' },
  st({ id: 'S15', name: 'Camino del Mirador', en: 'Viewpoint Path', kind: 'path', width: 2.4, surface: 'dirt', lamps: true,
    corners: [[14.6, -70.2], [24, -79], [26, -86]], radii: [0, 8, 0], from0: 'P4' }),
  { type: 'plaza', id: 'P5', name: 'Mirador del Cielo', en: 'Sky Viewpoint', kind: 'mirador', rect: [26, -91, 20, 8, 0], yFrom: 'S15' },

  // the court on the bottom shelf and its pocket links
  { type: 'plaza', id: 'P3', name: 'Cancha El Cerro', en: 'El Cerro Court', kind: 'court', rect: [-58, 77.25, 28, 14.5, 0], yFrom: 'S2' },
];

const I = (w, d, fl, kind, shop = null, o = {}) => [w, d, fl, kind, shop, o];

export const ROWS = [
  // ---- the town entrance: school and kiosk on the east of the entry road
  { st: 'S1', leg: 0, side: 'E', s0: 2, items: [I(14, 15, 2, 'school'), I(4, 8, 1, 'kiosk', 'tienda', { g: 2 })] },
  // ---- Calle del Comercio, north side (facing south)
  { st: 'S2', leg: 0, side: 'N', s0: 12, items: [
    I(6, 9, 2, 'shophouse', 'panaderia'), I(5, 9, 2, 'shophouse', 'fruver'), I(5.5, 9, 2, 'shophouse', 'carniceria'), I(4.5, 9.5, 2, 'shophouse', 'peluqueria'),
    I(9, 10, 4, 'apartments', null, { g: 2.4 }), I(5, 10, 3, 'shophouse', 'papeleria'),
    I(6, 10, 3, 'shophouse', 'drogueria', { g: 6.2 }), I(9, 10, 2, 'clinic'), I(10, 10, 2, 'hall'),
  ] },
  // ---- Calle del Comercio, south side (facing north); the spawn stands in the gap at x = -6.5
  { st: 'S2', leg: 0, side: 'S', s0: 8, items: [
    I(9, 7, 2, 'workshop', 'taller'), I(7, 7, 2, 'cornerstore', 'cafe'), I(5, 7, 2, 'house'), I(6, 7, 2, 'shophouse', 'restaurante'), I(5, 7, 2, 'shophouse', 'minutos'),
  ] },
  // ---- Calle del Sol leg 1: north side (facing south), east of the grand stair, then west of it
  { st: 'S1', leg: 1, side: 'N', s0: 12, items: [
    I(9, 9, 4, 'apartments'), I(6, 9, [1, 3], 'house'), I(5, 9, 3, 'unfinished'), I(5.5, 9, 3, 'shophouse', 'zapateria'), I(6, 9, 3, 'cornerstore', 'tienda'),
  ] },
  { st: 'S1', leg: 1, side: 'N', s0: 62, items: [
    I(6.5, 10, 2, 'house'), I(5, 10, 3, 'unfinished'), I(7, 10, 4, 'apartments'),
  ] },
  // ---- Calle del Sol leg 1: south side (facing north)
  { st: 'S1', leg: 1, side: 'S', s0: 60, items: [
    I(4.5, 8.5, 2, 'rowhouse'), I(4.5, 8.5, 2, 'rowhouse'), I(4.5, 8.5, 2, 'rowhouse'), I(4.5, 8.5, 2, 'rowhouse'),
  ] },
  // ---- Calle de los Almendros east: north side
  { st: 'S5', leg: 0, side: 'N', s0: 4, items: [
    I(5, 9, 2, 'house'), I(4.4, 9, 2, 'rowhouse'), I(4.4, 9, 2, 'rowhouse'), I(5.5, 9, 3, 'shophouse', 'modista', { g: 1 }), I(4.2, 9, 2, 'rowhouse'), I(4.2, 9, 2, 'rowhouse'),
  ] },
  // ---- Callejon de los Faroles (S9): both sides
  { st: 'S9', leg: 2, side: 'N', s0: 2, items: [
    I(10, 11, 3, 'tenement'), I(9, 11, 2, 'courtyard', null, { g: 2.4 }), I(5, 10, 3, 'unfinished'),
  ] },
  { st: 'S9', leg: 3, side: 'N', s0: 6.5, items: [ I(6, 10, 3, 'unfinished') ] },
  { st: 'S9', leg: 2, side: 'S', s0: 4, items: [
    I(10, 10, 3, 'tenement'), I(9, 10, 2, 'courtyard', null, { g: 2.4 }), I(7, 10, 4, 'apartments'),
  ] },
  // ---- Calle de la Cruz (S12)
  { st: 'S12', leg: 0, side: 'N', s0: 1.5, items: [
    I(6, 9, 3, 'shophouse', 'ferreteria'), I(6, 9, 2, 'house'), I(5, 9, 3, 'unfinished'),
  ] },
  { st: 'S12', leg: 1, side: 'S', s0: 3, items: [ I(8, 9, 2, 'workshop') ] },
  // ---- Calle del Sol leg 4 (uphill of the summit stairs), west of the chapel square
  { st: 'S1', leg: 7, side: 'N', s0: 14, items: [ I(6.5, 10, 2, 'house'), I(5, 10, 3, 'unfinished'), I(6, 10, 2, 'house') ] },
  // ---- chapel on its square
  { st: 'P4', at: [2.1, -80.65], ry: 0.166, items: [I(11, 14, 1, 'chapel')] },
];
