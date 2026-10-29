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
import { SAY, STORY, STORY_ALIAS, STORY_WEIGHT, SHOP_STORY, PLACE_STORY } from './stories_text.js';
import { setFan, fanOn } from './anim.js';
import { sitDown, isSitting } from './sit.js';

const CAP_INTERACT = 44, CAP_SEATS = 7, CAP_DECALS = 6, DISC_RADIUS = 1.7, DISC_DY = 1.3;

// ------------------------------------------------------------------ what each object offers
const BY_NAME = new Map();
const add = (names, o) => { for (const n of [].concat(names)) BY_NAME.set(n, { ...o, pri: o.pri ?? 5 }); };
add(['fridge', 'fridge_small'], { key: 'fridge', prompt: 'Abrir la nevera', who: 'La nevera', say: (it, L) => (L.hh?.income ? 'fridge' : 'fridge_poor'), pri: 8 });
add('fridge_drinks', { key: 'fridge', prompt: 'Mirar las bebidas', who: 'La nevera de bebidas', say: 'drinks', pri: 7 });
add('fridge_meat', { key: 'fridge', prompt: 'Mirar la carne', who: 'La cámara de carnes', say: 'meat', pri: 7 });
add('fridge_meds', { key: 'fridge', prompt: 'Mirar las medicinas', who: 'La nevera de medicinas', say: 'meds', pri: 7 });
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
add(['wardrobe_2', 'wardrobe_3', 'wardrobe_metal'], { key: 'wardrobe', prompt: 'Abrir el armario', who: 'El armario', say: 'wardrobe', pri: 5 });
add('chest_trunk', { key: 'trunk', prompt: 'Abrir el baúl', who: 'El baúl', say: 'trunk', pri: 6 });
add(['dresser_4', 'dresser_low'], { key: 'dresser', prompt: 'Abrir la cómoda', who: 'La cómoda', say: 'dresser', pri: 4 });
add(['basin_pedestal', 'basin_vanity', 'sink_kitchen', 'lavadero'], { key: 'tap', prompt: 'Abrir el grifo', who: 'El grifo', say: 'tap', pri: 4 });
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
  chalkboard: ['Leer el tablero', 'El tablero', 'chalkboard'], flag_co: ['Mirar la bandera', 'La bandera', 'flag_co'],
  alphabet_chart: ['Mirar la cartelera', 'La cartelera', 'school_chart'], times_table: ['Mirar la cartelera', 'La cartelera', 'school_chart'], schedule: ['Mirar el horario', 'El horario', 'school_chart'],
  eye_chart: ['Leer el cartel', 'El cartel', 'clinic_chart'], health_poster: ['Leer el cartel', 'El cartel', 'clinic_chart'], vaccines: ['Leer la cartilla', 'La cartilla', 'clinic_chart'],
};
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
function target(bp, room, L, it, conn, h) {
  let p = null;
  if (it.ceil) p = standable(L, it.x, it.z, conn, 0.2) ? [it.x, it.z] : usePoint(L, it, conn);
  else p = usePoint(L, it, conn);
  if (!p) return null;
  const rel = it.ceil ? Math.min(2.0, (room.h ?? 2.6) - 0.6) : it.wall ? (it.y - (room.y ?? 0)) + (it.h ?? 0.4) / 2 : (it.y - (room.y ?? 0)) + Math.min((it.h ?? 1) * 0.6, 1.25);
  const ly = (room.y ?? 0) + (h ?? Math.min(Math.max(rel, 0.75), 1.6));
  const [wx, wy, wz] = bp.frame.toWorld(p[0], ly, p[1]);
  return { local: p, x: +wx.toFixed(3), y: +wy.toFixed(3), z: +wz.toFixed(3) };
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
    const t = target(bp, room, L, it, L.connectivity(), 0.95); if (!t) continue;
    perRoom.set(room.id, n + 1);
    seats.push({ a, it, room, t, pri: it.c.arch === 'sofa' || it.c.arch === 'armchair' ? 6 : 4 });
  }
  seats.sort((p, q) => q.pri - p.pri); seats.length = Math.min(seats.length, CAP_SEATS);

  // priorities, caps
  const rank = found.map((f) => ({ f, s: f.spec.pri + rng.next() * 0.9 })).sort((p, q) => q.s - p.s);
  let n = 0;
  for (const { f } of rank) {
    if (n >= CAP_INTERACT - seats.length) break;
    if (f.spec.decal && decals >= CAP_DECALS) continue;
    if (f.spec.decal) decals++;
    register(ctx, bp, f);
    n++;
  }
  for (const s of seats) {
    const a = s.a;
    ctx.interact?.register({
      id: `int:${s.it.id}:sit${a.id ?? ''}`, kind: 'sit', x: s.t.x, y: s.t.y, z: s.t.z, radius: 1.9, aim: 0.8, building: bp.id,
      prompt: 'Sentarse', enabled: () => !isSitting(ctx),
      use: (c) => sitDown(c, { building: bp.id, seat: [a.x, a.y, a.z], seatH: a.seatH ?? 0.45, ry: a.ry, stand: [s.t.x, s.t.z] }),
    });
    n++;
  }
  return n;
}

function register(ctx, bp, f) {
  const { it, L, spec, t } = f, id = `int:${it.id}`;
  const base = { id, kind: 'object', x: t.x, y: t.y, z: t.z, radius: spec.radius ?? 1.9, aim: spec.aim ?? 0.8, building: bp.id };
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
      out.push({ ...story, x: +wx.toFixed(2), y: +wy.toFixed(2), z: +wz.toFixed(2), radius: story.kind === 'room' ? DISC_RADIUS + 0.5 : DISC_RADIUS, dy: DISC_DY, room: h.room.id });
      return true;
    }
    return false;
  };
  const kind = lot.kind, shopType = I.shopType;
  // places with their own story (chapel, school, clinic, hall, tenement)
  for (const s of PLACE_STORY[kind] ?? []) take(s.hook, s);
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
  // register
  let n = 0;
  for (const d of out) {
    const rec = { id: `int:${bp.id}:${n}`, name: d.name, en: d.en, kind: d.kind, x: d.x, y: d.y, z: d.z, radius: d.radius, dy: d.dy, building: bp.id };
    ctx.discover?.register?.(rec); n++;
  }
  return out.length;
}

/** Entry point (called at the end of furnishBuilding). Safe without ctx.interact / ctx.discover (headless tools). */
export function collectStories(ctx, bp, E) {
  const I = bp.interior; if (!I?.layouts) return;
  const rng = makeRng((hashStr('stories:' + bp.id) ^ ((ctx.seed ?? 0) >>> 0)) >>> 0);
  const st = I.stories = { interactables: 0, discoveries: 0 };
  try { if (ctx.interact?.register) st.interactables = interactables(ctx, bp, E, rng.fork('act')); } catch (e) { (ctx.errors ??= []).push({ stage: 'stories', building: bp.id, message: 'interactables ' + String(e?.message ?? e), stack: e?.stack }); }
  try { st.discoveries = discoveries(ctx, bp, E, rng.fork('disc')); } catch (e) { (ctx.errors ??= []).push({ stage: 'stories', building: bp.id, message: 'discoveries ' + String(e?.message ?? e), stack: e?.stack }); }
}
