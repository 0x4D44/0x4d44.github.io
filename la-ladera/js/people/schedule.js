// Daily life: what a person is DOING at an hour of the day. PURE (no THREE, no DOM): the brain asks, the Node tests assert.
//
// The day of everybody is cut into blocks:   sleep  (inside the home, hidden)
//                                            school (kids, teens and teachers inside the school)
//                                            work   (a shopkeeper behind the counter, a nurse in the clinic, a builder on a site, ...)
//                                            free   (anything else: sweep, chat, sit, lean, play, errands, strolls)
// Every person has small personal offsets (npc.jit = [a, b, c] in [0,1)) so a street never empties or fills in the same second.
//
// `blockAt(npc, hour)`        -> 'sleep' | 'school' | 'work' | 'free'
// `freeChoices(npc, hour)`    -> [[activity, weight], ...]  (what a person at leisure picks; the brain drops what the barrio cannot offer)

/** Opening hours of each shop type [open, close]. Shopkeepers live above the shop and sleep when it is closed. */
export const SHOP_HOURS = {
  tienda: [5.8, 21.2], panaderia: [4.8, 19.6], fruver: [6.4, 19.0], carniceria: [6.5, 18.6], peluqueria: [8.6, 19.2], papeleria: [7.0, 19.6], drogueria: [7.0, 21.6],
  taller: [7.6, 18.6], cafe: [6.0, 20.6], restaurante: [6.6, 20.2], minutos: [8.0, 22.2], zapateria: [8.0, 18.6], modista: [8.6, 18.0], ferreteria: [7.0, 18.2],
};
export const SCHOOL = { start: 6.9, end: 12.8 };                 // the morning shift: lunch at home, the afternoon belongs to the court
export const WORK = {
  obrero: [7.0, 17.0], enfermera: [7.0, 16.0], mototaxista: [6.2, 19.6], ambulante: [6.6, 18.8], maestra: [SCHOOL.start - 0.2, SCHOOL.end + 0.4],
};

const inWin = (h, a, b) => h >= a && h < b;
/** True when the shop of this shopkeeper is open at `h`. */
export function shopOpen(npc, h) {
  const t = SHOP_HOURS[npc.bank] ?? [7, 19]; const j = npc.jit ?? [0.5, 0.5, 0.5];
  return inWin(h, t[0] + (j[0] - 0.5) * 0.5, t[1] + (j[1] - 0.5) * 0.7);
}
export const awake = (npc, h) => inWin(h, npc.riseH ?? 5.5, npc.bedH ?? 21.5);

export function blockAt(npc, h) {
  const j = npc.jit ?? [0.5, 0.5, 0.5], r = npc.routine;
  if (r === 'shopkeeper') return shopOpen(npc, h) ? 'work' : 'sleep';
  if (!awake(npc, h)) return 'sleep';
  if (r === 'kid' || r === 'teen') return inWin(h, SCHOOL.start + (j[0] - 0.5) * 0.4, SCHOOL.end + (r === 'teen' ? 0.5 : 0) + (j[1] - 0.5) * 0.4) ? 'school' : 'free';
  const w = WORK[npc.persona];
  if (w) {
    if (!inWin(h, w[0] + (j[0] - 0.5) * 0.6, w[1] + (j[1] - 0.5) * 0.8)) return 'free';
    return npc.persona === 'maestra' ? 'school' : 'work';
  }
  return 'free';
}

/** Weighted leisure activities by routine and hour. Names are the brain's: sweep lean bench chat play wander errand phone greet stand pray court. */
export function freeChoices(npc, h) {
  const morning = h < 10, midday = h >= 10 && h < 14, afternoon = h >= 14 && h < 18, evening = h >= 18;
  switch (npc.routine) {
    case 'homemaker': return morning ? [['sweep', 4], ['errand', 3], ['chat', 2], ['wander', 1], ['bench', 1]]
      : midday ? [['errand', 2], ['chat', 2], ['bench', 2], ['wander', 1], ['sweep', 1], ['phone', 1]]
      : afternoon ? [['chat', 3], ['bench', 2], ['errand', 2], ['wander', 1], ['greet', 1], ['sweep', 1]]
      : [['chat', 3], ['lean', 2], ['wander', 1], ['bench', 1], ['phone', 1]];
    case 'neighbour': return [['lean', 3], ['chat', 3], ['bench', 2], ['wander', 1], ['errand', 2], ['phone', 2], ['stand', 1]];
    case 'elder': return npc.gender === 'f' && (morning || evening)
      ? [['bench', 4], ['sweep', 2], ['chat', 3], ['wander', 1], ['pray', 1], ['greet', 1]] : [['bench', 5], ['chat', 3], ['wander', 1], ['greet', 1], ['sweep', 1]];
    case 'kid': return morning ? [['wander', 2], ['stand', 1], ['court', 1]] : [['court', 7], ['wander', 1], ['bench', 1], ['chat', 1]];
    case 'teen': return afternoon || evening ? [['lean', 3], ['phone', 3], ['chat', 3], ['court', 2], ['wander', 1], ['bench', 1]] : [['wander', 2], ['lean', 2], ['phone', 2], ['chat', 1]];
    case 'worker': return [['lean', 3], ['chat', 2], ['errand', 2], ['bench', 1], ['wander', 1]];
    case 'teacher': case 'nurse': return [['errand', 2], ['wander', 1], ['bench', 2], ['chat', 2], ['sweep', 1]];
    case 'moto': case 'vendor': return [['lean', 2], ['chat', 2], ['bench', 2], ['wander', 1], ['errand', 1]];
    case 'beata': return [['pray', morning || evening ? 3 : 1], ['bench', 3], ['chat', 2], ['wander', 1], ['greet', 1]];
    default: return [['wander', 2], ['bench', 1], ['chat', 1], ['stand', 1]];
  }
}

/** Hours of the day at which the devout go to the chapel (prayer). */
export const PRAYER_HOURS = [6.0, 12.0, 18.0];
export const nearPrayer = (h) => PRAYER_HOURS.some((p) => Math.abs(h - p) < 0.7);

/** Act name -> animation clip (the world keeps the table; the tests use it too). */
export const CLIP_FOR_ACT = {
  idle: null, sweep: 'sweep', lean: 'lean_wall', sit: 'sit_idle', sit_talk: 'sit_talk', sell: 'sell', cook: 'cook', laundry: 'laundry', pray: 'pray', carry: 'carry_stand',
  phone: 'phone_stand', wave: 'wave', point: 'point', bounce: 'kid_bounce', fidget: 'kid_fidget', wait: 'idle_b', read: 'sit_look', talk: 'talk',
};
