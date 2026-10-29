// Wall decals (pictures, posters, calendars, notices, menus, school charts...). Pure data here; the pictures themselves are
// painted at load time into ONE canvas atlas (browser only) so every decal in the world is a single material / draw call per building
// and every piece of text is real, legible Spanish.
//   w,h metres.  y = default hang height (bottom edge).  frame = border colour or null.  kind groups them for the decorator.
export const DECALS = {
  // religion
  picture_virgin: { w: 0.40, h: 0.56, y: 1.35, frame: 0x5a3a24, kind: 'religion' },
  picture_heart: { w: 0.42, h: 0.56, y: 1.35, frame: 0x3a2a1c, kind: 'religion' },
  picture_saint: { w: 0.32, h: 0.46, y: 1.4, frame: 0x6b4226, kind: 'religion' },
  blessing: { w: 0.42, h: 0.22, y: 1.75, frame: 0x6b4226, kind: 'religion' },
  stations: { w: 0.30, h: 0.30, y: 1.5, frame: 0x3a2a1c, kind: 'religion' },
  // family and art
  photo_family_a: { w: 0.36, h: 0.27, y: 1.45, frame: 0x4e3524, kind: 'photo' },
  photo_family_b: { w: 0.27, h: 0.36, y: 1.4, frame: 0x8a5a3a, kind: 'photo' },
  photo_wedding: { w: 0.30, h: 0.40, y: 1.4, frame: 0xc8a050, kind: 'photo' },
  photo_grad: { w: 0.30, h: 0.40, y: 1.4, frame: 0x2f3a45, kind: 'photo' },
  photo_collage: { w: 0.72, h: 0.50, y: 1.3, frame: 0x4e3524, kind: 'photo' },
  picture_landscape: { w: 0.62, h: 0.44, y: 1.4, frame: 0x6b4226, kind: 'art' },
  picture_flowers: { w: 0.44, h: 0.58, y: 1.35, frame: 0xc8a050, kind: 'art' },
  picture_coast: { w: 0.56, h: 0.40, y: 1.4, frame: 0x2f3a45, kind: 'art' },
  kids_drawing_a: { w: 0.32, h: 0.42, y: 1.0, frame: null, kind: 'kids' },
  kids_drawing_b: { w: 0.42, h: 0.30, y: 1.05, frame: null, kind: 'kids' },
  // posters
  poster_football_a: { w: 0.50, h: 0.70, y: 1.2, frame: null, kind: 'poster' },
  poster_football_b: { w: 0.50, h: 0.70, y: 1.2, frame: null, kind: 'poster' },
  poster_football_c: { w: 0.70, h: 0.50, y: 1.3, frame: null, kind: 'poster' },
  poster_music: { w: 0.50, h: 0.70, y: 1.2, frame: null, kind: 'poster' },
  poster_map: { w: 0.90, h: 0.66, y: 1.1, frame: null, kind: 'poster' },
  // calendars, notices, documents
  calendar_pharma: { w: 0.28, h: 0.42, y: 1.45, frame: null, kind: 'calendar' },
  calendar_church: { w: 0.30, h: 0.44, y: 1.45, frame: null, kind: 'calendar' },
  calendar_tienda: { w: 0.30, h: 0.40, y: 1.45, frame: null, kind: 'calendar' },
  diploma: { w: 0.40, h: 0.30, y: 1.5, frame: 0x2f3a45, kind: 'document' },
  exam_notes: { w: 0.30, h: 0.40, y: 0.95, frame: null, kind: 'notes' },
  notice_rent: { w: 0.24, h: 0.32, y: 1.35, frame: null, kind: 'notice' },
  chores: { w: 0.30, h: 0.40, y: 1.3, frame: null, kind: 'notice' },
  // shops
  price_list: { w: 0.50, h: 0.70, y: 1.3, frame: null, kind: 'shop' },
  menu_board: { w: 0.90, h: 1.10, y: 0.95, frame: 0x3a2a1c, kind: 'shop' },
  sign_tinto: { w: 0.50, h: 0.30, y: 1.7, frame: 0x3a2a1c, kind: 'shop' },
  sign_pan: { w: 0.70, h: 0.30, y: 1.9, frame: 0x6b4226, kind: 'shop' },
  sign_pharma: { w: 0.34, h: 0.34, y: 1.9, frame: null, kind: 'shop' },
  sign_barber: { w: 0.60, h: 0.40, y: 1.7, frame: 0x2f3a45, kind: 'shop' },
  sign_minutos: { w: 0.70, h: 0.30, y: 1.9, frame: 0x2f3a45, kind: 'shop' },
  sign_ferre: { w: 0.70, h: 0.30, y: 2.0, frame: 0x3a2a1c, kind: 'shop' },
  // school and clinic
  chalkboard: { w: 2.40, h: 1.10, y: 0.95, frame: 0x6b4226, kind: 'school', big: true },
  alphabet_chart: { w: 1.20, h: 0.50, y: 1.7, frame: null, kind: 'school' },
  times_table: { w: 0.60, h: 0.80, y: 1.0, frame: null, kind: 'school' },
  flag_co: { w: 0.90, h: 0.60, y: 1.7, frame: null, kind: 'school' },
  schedule: { w: 0.50, h: 0.60, y: 1.2, frame: null, kind: 'school' },
  eye_chart: { w: 0.40, h: 0.80, y: 1.0, frame: null, kind: 'clinic' },
  health_poster: { w: 0.50, h: 0.70, y: 1.2, frame: null, kind: 'clinic' },
  vaccines: { w: 0.50, h: 0.60, y: 1.2, frame: null, kind: 'clinic' },
};
export const decalIds = Object.keys(DECALS);
/** Catalogue-shaped definition for Layout.hang(). */
export function decalDef(id) {
  const d = DECALS[id]; if (!d) throw new Error('unknown decal ' + id);
  return { name: 'decal:' + id, size: [d.w, d.h, 0.025], footprint: [d.w, 0.025], arch: 'decal', tags: ['decal', d.kind], wall: true, y: d.y, block: false, cols: 'none', decal: id };
}
