// INTERIORS (A3): what the player can DO inside a building (E on an object, Spanish prompt, a bilingual line from the object) and what they can
// FIND (a tiny story told by an object, registered as a discovery). Pure data + registrations: runs at the end of furnishBuilding().
//
//   interactables  ctx.interact.register({ id:'int:<item>', kind, x,y,z, radius, aim, prompt, use, building })
//                  Each one sits just OUTSIDE its furniture's outline (the targeting rejects a target whose sight line crosses a blocker wall).
//   discoveries    ctx.discover.register({ id:'int:<building>:<n>', name (Spanish), en (one English line), kind, x,y,z (feet level), radius, dy })
//   seats          'Sentarse' on every sofa / armchair / chair that has a reachable seat anchor (see sit.js: only the camera sits down)
//   fans, lamps    'Prender / Apagar' really switch the rotor (anim.js) and the lamp's light
import { makeRng, hashStr } from '../core/rng.js';
import { usePoint, standable } from './reach.js';
import { obbDist } from './layout.js';
import { SAY, STORY, STORY_ALIAS, STORY_WEIGHT, SHOP_STORY, PLACE_STORY } from './stories_text.js';
import { setFan, fanOn } from './anim.js';
import { decalIds } from './decals.js';
import { sitDown, isSitting } from './sit.js';
import { rayHitsBox } from './aim.js';
import { rayBox } from '../core/interact.js';

const CAP_INTERACT = 44, CAP_SEATS = 7, CAP_DECALS = 6, DISC_RADIUS = 1.7, DISC_DY = 1.3;

// ------------------------------------------------------------------ what each object offers
const BY_NAME = new Map();
const add = (names, o) => { for (const n of [].concat(names)) BY_NAME.set(n, { ...o, pri: o.pri ?? 5 }); };
// the home fridge, the small one, the drinks fridge and the pharmacy's cold cabinet are real containers now (containers.js: freezer door + main door open, the shelves hold things)
add('fridge_meat', { key: 'fridge', prompt: 'Mirar la carne', who: 'La cámara de carnes', say: 'meat', pri: 7 });
add('stove_gas', { key: 'stove', prompt: 'Destapar la olla', who: 'La estufa', say: 'stove', pri: 8 });
add(['tv_flat', 'tv_crt', 'tv_wall'], { key: 'tv', prompt: 'Ver la tele', who: 'Televisor', say: 'tv', pri: 9, aim: 0.75 });
add(['radio_old', 'radio_boombox'], { key: 'radio', prompt: 'Prender la radio', who: 'Radio', say: 'radio', pri: 6 });
add('cage_canary', { key: 'canary', prompt: 'Silbarle al canario', who: 'El canario', say: 'canary', pri: 7 });
add('cat_sitting', { key: 'cat', prompt: 'Acariciar al gato', who: 'El gato', say: 'cat', pri: 7 });
add('dog_sleeping', { key: 'dog', prompt: 'Acariciar al perro', who: 'El perro', say: 'dog', pri: 7 });
add('guitar_lean', { key: 'guitar', prompt: 'Tocar la guitarra', who: 'La guitarra', say: 'guitar', pri: 6 });
add('sewing_machine', { key: 'sewing', prompt: 'Coser un poco', who: 'La máquina de coser', say: 'sewing', pri: 6 });
add('altar_home', { key: 'altar', prompt: 'Rezar', who: 'El altar', say: 'altar', pri: 9 });
add('altar_main', { key: 'altar', prompt: 'Rezar', who: 'La capilla', say: 'chapel', pri: 9 });
add(['candle_rack', 'candles_set'], { key: 'candle', prompt: 'Encender una vela', who: 'Las velas', say: 'candle', pri: 6 });
add('pigeon_loft', { key: 'pigeons', prompt: 'Mirar las palomas', who: 'El palomar', say: 'pigeons', pri: 6 });
// wardrobes, trunks and dressers are real containers now (containers.js: they open, and what is inside is a target): no one-line stand-in here
add(['basin_pedestal', 'basin_vanity', 'sink_kitchen', 'sink_small', 'lavadero'], { key: 'tap', prompt: 'Abrir la llave', who: 'La llave', say: 'tap', pri: 4 });
add('toilet', { key: 'toilet', prompt: 'Jalar la cadena', who: 'El baño', say: 'toilet', pri: 3 });
add(['mirror_wall', 'mirror_bath', 'mirror_barber'], { key: 'mirror', prompt: 'Mirarse en el espejo', who: 'El espejo', say: 'mirror', pri: 3 });
add(['bookshelf', 'bookshelf_low', 'books_stack'], { key: 'books', prompt: 'Hojear los libros', who: 'Los libros', say: 'books', pri: 4 });
add(['desk_student', 'desk_wood', 'desk_office'], { key: 'desk', prompt: 'Mirar el escritorio', who: 'El escritorio', say: 'desk', pri: 4 });
add('pc_set', { key: 'pc', prompt: 'Mirar el computador', who: 'El computador', say: 'pc', pri: 4 });
add('phone_landline', { key: 'phone', prompt: 'Descolgar el teléfono', who: 'El teléfono', say: 'phone', pri: 4 });
add('school_bag', { key: 'bag', prompt: 'Mirar la maleta', who: 'La maleta del colegio', say: 'bag', pri: 5 });
add('toy_pile', { key: 'toys', prompt: 'Mirar los juguetes', who: 'Los juguetes', say: 'toys', pri: 5 });
add('thermos_set', { key: 'thermos', prompt: 'Servirse un tinto', who: 'El termo', say: 'thermos', pri: 6 });
add('bread_basket', { key: 'bread', prompt: 'Destapar el pan', who: 'La canasta', say: 'bread', pri: 4 });
add('kettle', { key: 'kettle', prompt: 'Tocar la pava', who: 'La pava', say: 'kettle', pri: 3 });
add('exam_bed', { key: 'exam_bed', prompt: 'Mirar la camilla', who: 'La camilla', say: 'exam_bed', pri: 6 });
add('fan_ceiling', { key: 'fan', toggle: 'fan', pri: 4, aim: 0.6, radius: 2.5 });
add(['lamp_floor', 'lamp_table'], { key: 'lamp', toggle: 'lamp', pri: 3, aim: 0.7 });
add('clock_wall', { key: 'clock', prompt: 'Mirar el reloj', who: 'El reloj', clock: true, pri: 3 });

/** decal id -> [prompt, who, say key]. Decals not listed here are scenery only. */
const DECAL = {
  photo_family_a: ['Mirar la foto', 'La foto', 'photo_family'], photo_family_b: ['Mirar la foto', 'La foto', 'photo_family'],
  photo_wedding: ['Mirar la foto', 'La foto del matrimonio', 'photo_wedding'], photo_grad: ['Mirar la foto', 'La foto del grado', 'photo_grad'],
  photo_collage: ['Mirar las fotos', 'Las fotos', 'photo_collage'],
  kids_drawing_a: ['Mirar el dibujo', 'El dibujo', 'kids_drawing'], kids_drawing_b: ['Mirar el dibujo', 'El dibujo', 'kids_drawing'],
  diploma: ['Leer el diploma', 'El diploma', 'diploma'], exam_notes: ['Leer los apuntes', 'Los apuntes', 'exam_notes'],
  chores: ['Leer la lista', 'La lista de oficios', 'chores'], notice_rent: ['Leer el aviso', 'El aviso', 'notice_rent'],
  calendar_pharma: ['Mirar el calendario', 'El calendario', 'calendar'], calendar_church: ['Mirar el calendario', 'El calendario', 'calendar'], calendar_tienda: ['Mirar el calendario', 'El calendario', 'calendar'],
  picture_landscape: ['Mirar el cuadro', 'El cuadro', 'picture_landscape'], picture_coast: ['Mirar el cuadro', 'El cuadro', 'picture_coast'], picture_flowers: ['Mirar el cuadro', 'El cuadro', 'picture_flowers'],
  picture_virgin: ['Mirar la imagen', 'La Virgen', 'picture_virgin'], picture_heart: ['Mirar la imagen', 'El Sagrado Corazón', 'picture_heart'], picture_saint: ['Mirar la imagen', 'El santo', 'picture_saint'],
  blessing: ['Leer el letrero', 'El letrero', 'blessing'], stations: ['Mirar la estación', 'El Vía Crucis', 'stations'],
  poster_football_a: ['Leer el afiche', 'El afiche', 'poster_football'], poster_football_b: ['Leer el afiche', 'El afiche', 'poster_football'], poster_football_c: ['Leer el afiche', 'El afiche', 'poster_football'],
  poster_music: ['Leer el afiche', 'El afiche', 'poster_music'], poster_map: ['Mirar el mapa', 'El mapa', 'poster_map'],
  price_list: ['Leer los precios', 'La lista de precios', 'price_list'], menu_board: ['Leer el menú', 'El menú', 'menu_board'],
  price_meat: ['Leer los precios', 'Los precios de la carne', 'price_meat'], price_bread: ['Leer los precios', 'Los precios del pan', 'price_bread'], price_hair: ['Leer las tarifas', 'Las tarifas', 'price_hair'],
  price_ferre: ['Leer los precios', 'La lista de precios', 'price_ferre'], price_papel: ['Leer los precios', 'La lista de precios', 'price_papel'], price_shoes: ['Leer las tarifas', 'Las tarifas', 'price_shoes'],
  price_minutos: ['Leer las tarifas', 'Las tarifas', 'price_minutos'], price_modista: ['Leer las tarifas', 'Las tarifas', 'price_modista'], price_taller: ['Leer las tarifas', 'Las tarifas', 'price_taller'],
  chalkboard: ['Leer el tablero', 'El tablero', 'chalkboard'], flag_co: ['Mirar la bandera', 'La bandera', 'flag_co'],
  alphabet_chart: ['Mirar la cartelera', 'La cartelera', 'school_chart'], times_table: ['Mirar la cartelera', 'La cartelera', 'school_chart'], schedule: ['Mirar el horario', 'El horario', 'school_chart'],
  eye_chart: ['Leer el cartel', 'El cartel', 'clinic_chart'], health_poster: ['Leer el cartel', 'El cartel', 'clinic_chart'], vaccines: ['Leer la cartilla', 'La cartilla', 'clinic_chart'],
};
// the generated variants of decals.js (decor.js hangs them so that no two rooms read as copies) tell the story of their family; a few kinds have a line of their own
for (const [prefix, say, d] of [['photo_fam_', 'photo_family', ['Mirar la foto', 'La foto']], ['art_land_', 'picture_landscape', ['Mirar el cuadro', 'El cuadro']], ['art_coast_', 'picture_coast', ['Mirar el cuadro', 'El cuadro']],
  ['art_flow_', 'picture_flowers', ['Mirar el cuadro', 'El cuadro']], ['kids_draw_', 'kids_drawing', ['Mirar el dibujo', 'El dibujo']], ['blessing_', 'blessing', ['Leer el letrero', 'El letrero']],
  ['poster_football_', 'poster_football', ['Leer el afiche', 'El afiche']], ['poster_music_', 'poster_music', ['Leer el afiche', 'El afiche']], ['calendar_', 'calendar', ['Mirar el calendario', 'El calendario']]]) {
  for (const id of decalIds) if (id.startsWith(prefix) && !DECAL[id]) DECAL[id] = [d[0], d[1], say];
}
Object.assign(DECAL, {
  picture_nino: ['Mirar la imagen', 'El Divino Niño', 'picture_nino'], picture_chiqui: ['Mirar la imagen', 'La Virgen de Chiquinquirá', 'picture_chiqui'],
  notice_dog: ['Leer el aviso', 'El aviso', 'notice_dog'], notice_agua: ['Leer el aviso', 'El aviso', 'notice_agua'], notice_junta: ['Leer el aviso', 'El aviso', 'notice_junta'], notice_basura: ['Leer el aviso', 'El aviso', 'notice_basura'],
});
const DECAL_STORY_FIRST = new Set(['exam_notes', 'notice_rent', 'chores', 'photo_wedding', 'diploma', 'price_list', 'chalkboard', 'kids_drawing_a', 'kids_drawing_b']);

// ------------------------------------------------------------------ helpers
const pad2 = (n) => String(n).padStart(2, '0');
/** The time of the in-game day in words (es, en). */
export function clockWords(hour) {
  const h = Math.floor(hour) % 24, m = Math.floor((hour - Math.floor(hour)) * 60);
  const h12 = h % 12 === 0 ? 12 : h % 12, per = h < 5 ? 'de la madrugada' : h < 12 ? 'de la mañana' : h < 18 ? 'de la tarde' : 'de la noche';
  const es = `${h12 === 1 ? 'Es la una' : `Son las ${h12}`}${m ? ` y ${m === 15 ? 'cuarto' : m === 30 ? 'media' : m}` : ' en punto'} ${per}.`;
  return [es, `It is ${h12}:${pad2(m)} ${h < 12 ? 'am' : 'pm'}.`];
}

const cycle = (pool, seed) => { let n = 0; const base = seed % pool.length; return () => pool[(base + n++) % pool.length]; };
const say = (ctx, who, [es, en], ms = 6400) => ctx.ui?.subtitle?.({ who, es, en, ms });

/** Where in the building frame a person stands to use `it` (and the world point of its interaction target). */
function target(bp, room, L, it, conn, h, at = null) {
  let p = null;
  if (at && standable(L, at[0], at[1], conn, 0.2)) p = at;                                        // a given spot (the front of one seat of a bench) when a person can stand there
  else if (it.ceil) p = standable(L, it.x, it.z, conn, 0.2) ? [it.x, it.z] : usePoint(L, it, conn);
  else p = usePoint(L, it, conn);
  if (!p) return null;
  const rel = it.ceil ? Math.min(2.0, (room.h ?? 2.6) - 0.6) : it.wall ? (it.y - (room.y ?? 0)) + (it.h ?? 0.4) / 2 : (it.y - (room.y ?? 0)) + Math.min((it.h ?? 1) * 0.6, 1.25);
  const ly = (room.y ?? 0) + (h ?? Math.min(Math.max(rel, 0.75), 1.6));
  const [wx, wy, wz] = bp.frame.toWorld(p[0], ly, p[1]);
  return { local: p, ly, x: +wx.toFixed(3), y: +wy.toFixed(3), z: +wz.toFixed(3) };
}

// ------------------------------------------------------------------ can anyone see it?
const EYE_H = 1.64;                                                                                   // the player's eye above the feet

/** The wall colliders around a room that are solid at eye level, in world space. core/interact.js offers an object only when physics.segmentBlocked(eye -> target, eye.y - 1.4, 1.2)
 *  finds no wall: a wall counts when its top is above feet + 0.44 and its base below feet + 1.44. Doors do not count (the player opens them). */
function eyeWalls(bp, room) {
  const fy = bp.lot.y + (room.y ?? 0), r = room.rect, xs = [], zs = [];
  for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]) { const w = bp.frame.toWorld(x, 0, z); xs.push(w[0]); zs.push(w[2]); }
  const x0 = Math.min(...xs) - 0.4, x1 = Math.max(...xs) + 0.4, z0 = Math.min(...zs) - 0.4, z1 = Math.max(...zs) + 0.4;
  return (bp.colliders?.walls ?? []).filter((w) => !w.door && w.y1 > fy + 0.44 && w.y0 < fy + 1.44
    && Math.max(w.x1, w.x2) >= x0 && Math.min(w.x1, w.x2) <= x1 && Math.max(w.z1, w.z2) >= z0 && Math.min(w.z1, w.z2) <= z1);
}
/** The room that holds a point of the building frame (the first one, like the stories test): same floor, inside the rectangle. */
function roomAt(bp, lx, ly, lz) {
  return bp.rooms.find((r) => lx >= r.rect.x0 - 0.01 && lx <= r.rect.x1 + 0.01 && lz >= r.rect.z0 - 0.01 && lz <= r.rect.z1 + 0.01 && ly >= (r.y ?? 0) - 0.05 && ly <= (r.y ?? 0) + (r.h ?? 2.6) + 0.05);
}
const cut = (walls, x1, z1, x2, z2) => {                                                               // the segment test of physics.segmentBlocked, over the walls near this room
  const d1x = x2 - x1, d1z = z2 - z1;
  for (const w of walls) {
    const d2x = w.x2 - w.x1, d2z = w.z2 - w.z1, den = d1x * d2z - d1z * d2x;
    if (Math.abs(den) < 1e-9) continue;
    const s = ((w.x1 - x1) * d2z - (w.z1 - z1) * d2x) / den, u = ((w.x1 - x1) * d1z - (w.z1 - z1) * d1x) / den;
    if (s >= 0 && s <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
};
/** Can the targeting ever offer this object? Some free floor cell of the room (a body's width clear of every outline, inside the interaction radius) must see the target
 *  through the walls that are solid at eye level. A coop behind a parapet, a target walled into a pocket by outlines or by a new roof: nobody can press E there, so the object is
 *  not registered (the stories test asserts the same, and A2 keeps changing the roofs). `t` is what target() returns. */
export function targetSeen(bp, room, L, t, radius, walls = eyeWalls(bp, room)) {
  const r = room.rect, fy = bp.lot.y + (room.y ?? 0), blockers = L.blockers(), [lx, lz] = t.local;
  for (let ring = 0.5; ring <= 1.7; ring += 0.3) for (let a = 0; a < 16; a++) {
    const cx = lx + Math.cos(a * Math.PI / 8) * ring, cz = lz + Math.sin(a * Math.PI / 8) * ring;
    if (cx < r.x0 + 0.3 || cx > r.x1 - 0.3 || cz < r.z0 + 0.3 || cz > r.z1 - 0.3) continue;
    if (blockers.some((b) => obbDist(b.ob, cx, cz) < 0.3)) continue;
    const [wx, , wz] = bp.frame.toWorld(cx, 0, cz);
    if (Math.hypot(wx - t.x, wz - t.z, fy + EYE_H - t.y) > radius) continue;
    if (!cut(walls, wx, wz, t.x, t.z)) return true;
  }
  return false;
}

/** The floor point 0.34 m in front of THIS seat of a bench or a two-seat sofa, so a viewer aiming at the far end still aims at its own point (null for a single seat). */
function seatFront(bp, L, it, a) {
  if (!(it.w > 1.0) || it.wall || it.ceil || (it.parent && !it.floor)) return null;
  const [bx, , bz] = bp.frame.toLocal(a.x, a.y, a.z), c = Math.cos(it.ry), s = Math.sin(it.ry);
  return L.rel(it, (bx - it.x) * c - (bz - it.z) * s, it.d / 2 + 0.34);
}

// ------------------------------------------------------------------ interactables
function interactables(ctx, bp, E, rng) {
  const I = bp.interior, shopType = I.shopType ?? null, found = [];
  const seenKey = new Set();
  let decals = 0;
  for (const [rid, L] of I.layouts) {
    const room = L.room, conn = L.connectivity();
    for (const it of L.items) {
      let spec = null, decalId = null;
      if (it.c?.decal) {
        decalId = it.c.decal;
        const d = DECAL[decalId]; if (!d) continue;
        spec = { key: 'decal', prompt: d[0], who: d[1], say: d[2], pri: DECAL_STORY_FIRST.has(decalId) ? 6 : 3, radius: 1.8, aim: 0.85, decal: true };
      } else if (it.flags?.counter && shopType && SAY['shop_' + shopType]) {
        spec = { key: 'counter', prompt: 'Mirar el mostrador', who: 'El mostrador', say: 'shop_' + shopType, pri: 9 };
      } else spec = BY_NAME.get(it.name);
      if (!spec) continue;
      const once = `${rid}|${spec.key}${spec.key === 'decal' ? '|' + decalId : ''}`;                // one of each thing per room (fans and lamps: each one)
      if (spec.key !== 'fan' && spec.key !== 'lamp' && seenKey.has(once)) continue;
      const t = target(bp, room, L, it, conn);
      if (!t) continue;
      seenKey.add(once);
      found.push({ it, L, room, spec, t, decalId });
    }
  }
  // seats: the anchors say which seats a person can reach
  const seats = [], perRoom = new Map();
  const byItem = new Map(); for (const [, L] of I.layouts) for (const it of L.items) byItem.set(it.id, [L, it]);
  for (const a of bp.anchors ?? []) {
    if (!a.item || !['sit', 'tv', 'work', 'read'].includes(a.kind)) continue;
    const hit = byItem.get(a.item); if (!hit) continue;
    const [L, it] = hit, room = L.room;
    const n = perRoom.get(room.id) ?? 0; if (n >= 2) continue;
    const t = target(bp, room, L, it, L.connectivity(), 1.25, seatFront(bp, L, it, a)); if (!t) continue;      // chest height: the point sits near the line of sight of someone looking down at the seat
    perRoom.set(room.id, n + 1);
    seats.push({ a, it, room, t, pri: it.c.arch === 'sofa' || it.c.arch === 'armchair' ? 6 : 4 });
  }
  seats.sort((p, q) => q.pri - p.pri); seats.length = Math.min(seats.length, CAP_SEATS);

  // priorities, caps
  const rank = found.map((f) => ({ f, s: f.spec.pri + rng.next() * 0.9 })).sort((p, q) => q.s - p.s);
  let n = 0, unseen = 0;
  const wallsOf = new Map();                                                  // room id -> the walls solid at eye level around it (made on first use)
  for (const { f } of rank) {
    if (n >= CAP_INTERACT - seats.length) break;
    if (f.spec.decal && decals >= CAP_DECALS) continue;
    const rm = roomAt(bp, f.t.local[0], f.t.ly, f.t.local[1]), RL = rm ? I.layouts.get(rm.id) : null;
    let walls = rm ? wallsOf.get(rm.id) : null; if (rm && !walls) wallsOf.set(rm.id, walls = eyeWalls(bp, rm));
    if (!RL || !targetSeen(bp, rm, RL, f.t, f.spec.radius ?? 1.9, walls)) { unseen++; continue; }       // nobody could ever press E on it: it is not offered
    if (f.spec.decal) decals++;
    register(ctx, bp, f);
    n++;
  }
  if (I.stories) I.stories.unseen = unseen;
  for (const s of seats) {
    const a = s.a;
    // x, y, z is the CUSHION, the centre of the thing like any shaped item's (core/interact.js): whoever aims at the item's point aims at the seat. It used to be the standing point in front of it at chest height
    // (`stand` below still is): a probe that looked at that point looked at the air beside the chair, and one that stood 0.3 m under it for a seat's height started 0.95 m in the air, its head in the fan's box (R4-205, R2d-004)
    ctx.interact?.register({                                                  // a SHAPED target (core/interact.js): the seat is offered while the view ray enters ITS box, and the nearest thing entered wins (R4-009)
      id: `int:${s.it.id}:sit${a.id ?? ''}`, kind: 'sit', x: a.x, y: a.y + (a.seatH ?? 0.45), z: a.z, radius: 2.4, reach: 2.0, static: true, pri: s.pri, lead: 0.5, building: bp.id,   // lead: the walls are tested up to 0.5 m short of the box (the body's own width and the pad)
      hit: aimBox(bp, s.it, 0.2, seatLane(bp, s.it, a)), prompt: 'Sentarse', enabled: () => !isSitting(ctx),
      use: (c) => sitDown(c, { building: bp.id, seat: [a.x, a.y, a.z], seatH: a.seatH ?? 0.45, ry: a.ry, stand: [s.t.x, s.t.z] }),
    });
    n++;
  }
  return n;
}

/** The strip of a bench or sofa that belongs to ONE anchor: [offset of the seat along the item's x axis, half width] (null for a single seat: the whole piece). */
function seatLane(bp, it, a) {
  const n = bp.anchors.filter((x) => x.item === it.id && x.kind !== 'stand' && x.kind !== 'sleep').length;
  if (n < 2) return null;
  const [bx, , bz] = bp.frame.toLocal(a.x, a.y, a.z), c = Math.cos(it.ry), s = Math.sin(it.ry);
  return [(bx - it.x) * c - (bz - it.z) * s, it.w / n / 2];
}

/** The view ray's entry distance into the object's own box (padded by `pad`; `lane` narrows it to one seat of a bench): `hit(ctx, item, eye, dir)` of a shaped target. */
function aimBox(bp, it, pad, lane = null) {
  const o = it.ob, fr = bp.frame, ceil = !!it.ceil, y0 = ceil ? it.y - it.h : it.y, hy = it.h / 2 + pad, off = lane ? lane[0] : 0;
  const mx = o.cx + o.ux[0] * off, mz = o.cz + o.ux[1] * off;
  const c = fr.toWorld(mx, y0 + it.h / 2, mz), p = fr.toWorld(mx, 0, mz), a = fr.toWorld(mx + o.ux[0], 0, mz + o.ux[1]), b = fr.toWorld(mx + o.uz[0], 0, mz + o.uz[1]);
  const ax = a[0] - p[0], az = a[2] - p[2], bx = b[0] - p[0], bz = b[2] - p[2], hx = (lane ? lane[1] : o.hx) + pad, hz = o.hz + pad, cx = c[0], cy = c[1], cz = c[2];
  return (ctx, item, e, v) => {
    const dx = e.x - cx, dz = e.z - cz;
    return rayBox(dx * ax + dz * az, e.y - cy, dx * bx + dz * bz, v.x * ax + v.z * az, v.y, v.x * bx + v.z * bz, hx, hy, hz, 12);
  };
}

/** An object is offered only while the player is LOOKING at it: the view ray must hit the object's own box (padded by `pad`). The targeting scores by
 *  distance to a stand point on the floor, so a clock, a fan, a picture or a canary behind the player's shoulder used to beat the sofa in front of them (R4-009).
 *  Called every frame for every registered object of the world: no allocation, and anything beyond 7 m is left to the radius test. */
function lookAt(bp, it, pad) {
  const o = it.ob, fr = bp.frame, ceil = !!it.ceil, y0 = ceil ? it.y - it.h : it.y, hy = it.h / 2 + pad;
  const c = fr.toWorld(o.cx, y0 + it.h / 2, o.cz), p = fr.toWorld(o.cx, 0, o.cz), a = fr.toWorld(o.cx + o.ux[0], 0, o.cz + o.ux[1]), b = fr.toWorld(o.cx + o.uz[0], 0, o.cz + o.uz[1]);
  const ax = a[0] - p[0], az = a[2] - p[2], bx = b[0] - p[0], bz = b[2] - p[2], hx = o.hx + pad, hz = o.hz + pad, cx = c[0], cy = c[1], cz = c[2];
  return (ctx) => {
    const e = ctx.player?.eye, v = ctx.player?._dir; if (!e || !v) return true;               // headless tools have no view
    if (ceil && e.y > cy - hy) return false;                                        // a fan is looked at from BELOW it: an eye level with the blades (R4's probe stood 0.95 m up) is in its box, and the fan took every seat's E (R4-205)
    const dx = e.x - cx, dz = e.z - cz; if (dx * dx + dz * dz > 49) return true;
    return rayHitsBox(dx * ax + dz * az, e.y - cy, dx * bx + dz * bz, v.x * ax + v.z * az, v.y, v.x * bx + v.z * bz, hx, hy, hz);
  };
}
function register(ctx, bp, f) {
  const { it, L, spec, t } = f, id = `int:${it.id}`;
  const base = { id, kind: 'object', x: t.x, y: t.y, z: t.z, radius: spec.radius ?? 1.9, aim: spec.aim ?? 0.8, building: bp.id, enabled: lookAt(bp, it, spec.decal || it.h < 0.5 ? 0.25 : 0.15) };
  if (spec.toggle === 'fan') {
    ctx.interact.register({ ...base, prompt: (c) => (fanOn(c, it.id) ? 'Apagar el ventilador' : 'Prender el ventilador'),
      use: (c) => { const on = setFan(c, it.id); c.ui?.toast?.(on === null ? 'El ventilador está trabado.' : on ? 'Prendes el ventilador: las aspas empiezan a girar.' : 'Apagas el ventilador: las aspas se frenan poco a poco.', 2400); } });
    return;
  }
  if (spec.toggle === 'lamp') {
    ctx.interact.register({ ...base, prompt: () => (it.light?.on === false ? 'Prender la lámpara' : 'Apagar la lámpara'),
      use: (c) => { if (!it.light) return; it.light.on = it.light.on === false; c.ui?.toast?.(it.light.on ? 'Prendes la lámpara.' : 'Apagas la lámpara.', 1800); } });
    return;
  }
  if (spec.clock) {
    ctx.interact.register({ ...base, prompt: spec.prompt, use: (c) => say(c, spec.who, clockWords(c.hour ?? 12), 4200) });
    return;
  }
  const key = typeof spec.say === 'function' ? spec.say(it, L) : spec.say;
  const pool = SAY[key]; if (!pool?.length) return;
  const next = cycle(pool, hashStr(it.id) >>> 0);
  ctx.interact.register({ ...base, prompt: spec.prompt, use: (c) => say(c, spec.who, next()) });
}

// ------------------------------------------------------------------ discoveries
function discoveries(ctx, bp, E, rng) {
  const I = bp.interior, lot = bp.lot ?? {}, out = [];
  const hooks = new Map();                                                    // story key -> [{ L, it, room }]
  for (const [, L] of I.layouts) for (const it of L.items) {
    const k = STORY_ALIAS[it.name] ?? it.name; (hooks.get(k) ?? hooks.set(k, []).get(k)).push({ L, it, room: L.room });
  }
  const worldUse = (ctx.interiorStoryUse ??= new Map());                      // story key -> how many buildings of the world already tell it
  const used = new Set(), usedRooms = new Set();
  const take = (key, story, o = {}) => {
    const list = hooks.get(STORY_ALIAS[key] ?? key); if (!list) return false;
    const order = list.filter((h) => !used.has(h.it.id)).sort((p, q) => (usedRooms.has(p.room.id) - usedRooms.has(q.room.id)) || (p.room.floor - q.room.floor));
    for (const h of order) {
      const conn = h.L.connectivity();
      let p = o.center ? null : usePoint(h.L, h.it, conn);
      if (!p && standable(h.L, h.it.x, h.it.z, conn, 0.2)) p = [h.it.x, h.it.z];
      if (!p) continue;
      const floorY = (h.room.y ?? 0);
      const [wx, wy, wz] = bp.frame.toWorld(p[0], floorY, p[1]);
      used.add(h.it.id); usedRooms.add(h.room.id);
      out.push({ ...story, x: +wx.toFixed(2), y: +wy.toFixed(2), z: +wz.toFixed(2), radius: story.kind === 'room' ? DISC_RADIUS + 0.5 : DISC_RADIUS, dy: DISC_DY, room: h.room.id, place: !!o.place });
      return true;
    }
    return false;
  };
  const kind = lot.kind, shopType = I.shopType;
  // places with their own story (chapel, school, clinic, hall, tenement)
  for (const s of PLACE_STORY[kind] ?? []) take(s.hook, s, { place: ['chapel', 'school', 'clinic', 'hall'].includes(kind) });      // (the barrio has one of each: two tenements tell theirs twice)
  // the shop
  if (shopType && SHOP_STORY[shopType]) {
    const s = SHOP_STORY[shopType];
    const hit = [...hooks.values()].flat().find((h) => h.it.flags?.counter) ?? null;
    if (hit) { if (!take(hit.it.name, s)) take('motorbike', s); } else if (!take('motorbike', s)) take('stove_gas', s);
  }
  // homes: what the objects of the household tell, a few per building
  const home = !['chapel', 'school', 'clinic', 'hall'].includes(kind);
  if (home) {
    const big = ['apartments', 'tenement', 'courtyard'].includes(kind);
    let want = 1 + (rng.chance(big ? 0.6 : 0.22) ? 1 : 0);
    if (shopType) want = Math.min(want, 1);
    if (kind === 'unfinished' && (worldUse.get('mattress_floor') ?? 0) < 2 && take('mattress_floor', STORY.mattress_floor)) { want--; worldUse.set('mattress_floor', (worldUse.get('mattress_floor') ?? 0) + 1); }
    // weighted draw without replacement (exponential race): unusual objects first, things every house has last; a story is told at most twice in the world
    const keys = Object.keys(STORY).filter((k) => k !== 'mattress_floor' && hooks.has(k) && (worldUse.get(k) ?? 0) < 2)
      .map((k) => ({ k, s: -Math.log(1e-9 + rng.next()) * (1 + (worldUse.get(k) ?? 0) * 2) / (STORY_WEIGHT[k] ?? 2) })).sort((p, q) => p.s - q.s);
    for (const { k } of keys) { if (want <= 0) break; if (take(k, STORY[k])) { want--; worldUse.set(k, (worldUse.get(k) ?? 0) + 1); } }
  }
  // register: a story every house tells (the fiado notebook, the Sunday dress) is told by SOME house, so its title carries the house, the shop or the building it was found in (the lead's R4 list:
  // 53 titles were told twice); the one story a place has of its own (the chapel's altar, the school's bell) is that place's already
  let n = 0;
  for (const d of out) {
    const rec = { id: `int:${bp.id}:${n}`, name: d.place || !lot.name ? d.name : `${d.name} · ${lot.name}`, en: d.en, kind: d.kind, x: d.x, y: d.y, z: d.z, radius: d.radius, dy: d.dy, building: bp.id };
    ctx.discover?.register?.(rec); n++;
  }
  return out.length;
}

/** The interactable pass alone (tests re-run it after changing the walls of a building): registers what is left after the sight check, returns how many. */
export const collectInteractables = (ctx, bp, rng) => interactables(ctx, bp, null, rng);

/** Entry point (called at the end of furnishBuilding). Safe without ctx.interact / ctx.discover (headless tools). */
export function collectStories(ctx, bp, E) {
  const I = bp.interior; if (!I?.layouts) return;
  const rng = makeRng((hashStr('stories:' + bp.id) ^ ((ctx.seed ?? 0) >>> 0)) >>> 0);
  const st = I.stories = { interactables: 0, discoveries: 0 };
  try { if (ctx.interact?.register) st.interactables = interactables(ctx, bp, E, rng.fork('act')); } catch (e) { (ctx.errors ??= []).push({ stage: 'stories', building: bp.id, message: 'interactables ' + String(e?.message ?? e), stack: e?.stack }); }
  try { st.discoveries = discoveries(ctx, bp, E, rng.fork('disc')); } catch (e) { (ctx.errors ??= []).push({ stage: 'stories', building: bp.id, message: 'discoveries ' + String(e?.message ?? e), stack: e?.stack }); }
}
