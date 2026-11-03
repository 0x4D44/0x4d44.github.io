// Daily life: what a person is DOING at an hour of the day. PURE (no THREE, no DOM): the brain asks, the Node tests assert.
//
// The day of everybody is cut into blocks:   sleep  (inside the home, hidden)
//                                            school (kids, teens and teachers inside the school)
//                                            work   (a shopkeeper behind the counter, a nurse in the clinic, a builder on a site, ...)
//                                            free   (anything else: sweep, chat, sit, lean, play, errands, strolls)
// Every person has small personal offsets (npc.jit = [a, b, c] in [0,1)) so a street never empties or fills in the same second.
// Free time is also spent INDOORS (round 4): a stay at home (breakfast, the washing, lunch, the television, supper), a visit to the clinic, the evening meeting of the neighbourhood board
// in the hall, a prayer in the chapel. The brain hides whoever is in; js/people/homelife.js draws them, in the room that fits what they do, while the player is in the building or near it.
//
// `blockAt(npc, hour)`        -> 'sleep' | 'school' | 'work' | 'free'
// `freeChoices(npc, hour)`    -> [[activity, weight], ...]  (what a person at leisure picks; the brain drops what the barrio cannot offer)
// `homeWeight` / `visitWeight`-> how much a person wants to be at home / at the clinic or the hall now (the weight of 'home', 'clinic', 'hall' in freeChoices)
// `homeActs(npc, hour)`       -> [[scene, weight], ...]  (what is done at home: cook eat wash laundry sweep tv read homework pray play phone sit)

/** Opening hours of each shop type [open, close]. Shopkeepers live above the shop: shut, they are upstairs, up and about until bed time (`keeperBedH`), in bed after it. */
export const SHOP_HOURS = {
  tienda: [5.8, 21.2], panaderia: [4.8, 19.6], fruver: [6.4, 19.0], carniceria: [6.5, 18.6], peluqueria: [8.6, 19.2], papeleria: [7.0, 19.6], drogueria: [7.0, 21.6],
  taller: [7.6, 18.6], cafe: [6.0, 20.6], restaurante: [6.6, 20.2], minutos: [8.0, 22.2], zapateria: [8.0, 18.6], modista: [8.6, 18.0], ferreteria: [7.0, 18.2],
};
export const SCHOOL = { start: 6.9, end: 12.8 };                 // the morning shift: lunch at home, the afternoon belongs to the court
export const WORK = {
  obrero: [7.0, 17.0], enfermera: [7.0, 16.0], mototaxista: [6.2, 19.6], ambulante: [6.6, 18.8], maestra: [SCHOOL.start - 0.2, SCHOOL.end + 0.4],
};

const inWin = (h, a, b) => h >= a && h < b;
/** When the shop of this shopkeeper opens and shuts today [open, close]: the type's hours, moved a little by the keeper's own offsets. */
export function shopWindow(npc) {
  const t = SHOP_HOURS[npc.bank] ?? [7, 19]; const j = npc.jit ?? [0.5, 0.5, 0.5];
  return [t[0] + (j[0] - 0.5) * 0.5, t[1] + (j[1] - 0.5) * 0.7];
}
/** True when the shop of this shopkeeper is open at `h`. */
export function shopOpen(npc, h) { const [a, b] = shopWindow(npc); return inWin(h, a, b); }
export const awake = (npc, h) => inWin(h, npc.riseH ?? 5.5, npc.bedH ?? 21.5);
/**
 * When a shopkeeper goes to bed (`u` in [0,1) is the keeper's own offset): half an hour after the shop has shut and not before 21:36, so the barrio is still awake at half past eight (R3-028,
 * twenty of the eighty-six were in bed at 20:30, the keepers among them); the baker, who is up in the small hours, goes from 20:18. Never before the shop shuts (a keeper is not in bed behind an open shop).
 */
export function keeperBedH(npc, u) {
  const baker = npc.bank === 'panaderia';
  return Math.max(baker ? 20.3 : 21.6, shopWindow(npc)[1] + 0.5) + u * (baker ? 1.0 : 1.2);
}

export function blockAt(npc, h) {
  const j = npc.jit ?? [0.5, 0.5, 0.5], r = npc.routine;
  if (r === 'shopkeeper') return shopOpen(npc, h) ? 'work' : awake(npc, h) ? 'free' : 'sleep';       // shut: upstairs and up and about ('free') until bed time, like anybody else's evening
  if (!awake(npc, h)) return 'sleep';
  if (r === 'kid' || r === 'teen') return inWin(h, SCHOOL.start + (j[0] - 0.5) * 0.4, SCHOOL.end + (r === 'teen' ? 0.5 : 0) + (j[1] - 0.5) * 0.4) ? 'school' : 'free';
  const w = WORK[npc.persona];
  if (w) {
    if (!inWin(h, w[0] + (j[0] - 0.5) * 0.6, w[1] + (j[1] - 0.5) * 0.8)) return 'free';
    return npc.persona === 'maestra' ? 'school' : 'work';
  }
  return 'free';
}

/**
 * How much a person at leisure wants to be at home right now: the weight of the brain's `home` beside the other free choices (0: never). Home is where the day starts and ends, where lunch
 * is eaten, where the children do their homework and the old watch television. The kids are at school until SCHOOL.end, so for them home is breakfast, lunch, the afternoon and supper.
 */
export function homeWeight(npc, h) {
  if (npc.routine === 'shopkeeper' || !npc.homeLotId) return 0;
  const morning = h < 9, forenoon = h >= 9 && h < 11.8, lunch = h >= 11.8 && h < 14.3, afternoon = h >= 14.3 && h < 17.6;
  const by = (m, f, l, a, e) => (morning ? m : forenoon ? f : lunch ? l : afternoon ? a : e);
  switch (npc.routine) {
    case 'homemaker': return by(7, 4, 7, 3, 7);
    case 'neighbour': return by(3, 2, 5, 2, 6);
    case 'elder': return by(5, 4, 7, 4, 7);
    case 'kid': return by(5, 3, 4, 2.5, 6);                  // (out of school at 12.8 the children eat, then the court: the street keeps its children)
    case 'teen': return by(4, 2.5, 4, 2.5, 6);
    case 'worker': case 'moto': case 'vendor': case 'teacher': case 'nurse': return by(2, 1, 4, 2, 6);
    case 'beata': return by(1, 0.5, 1, 0.5, 1.5);            // the chapel is where she is
    default: return by(2, 1, 3, 2, 4);
  }
}

/** A visit to a place of the barrio with a stay inside it: [lot kind, weight] by routine and hour (the brain's do_clinic and do_hall). */
export function visitWeight(npc, h, kind) {
  if (npc.routine === 'shopkeeper' || npc.routine === 'nurse' || npc.routine === 'teacher') return 0;
  if (kind === 'clinic') return h >= 7.5 && h < 15.5 ? (npc.routine === 'elder' ? 2.2 : npc.routine === 'homemaker' ? 1.4 : npc.routine === 'kid' || npc.routine === 'teen' ? 0 : 0.8) : 0;
  if (kind === 'hall') return h >= HALL_MEETING[0] - 0.3 && h < HALL_MEETING[1] ? (npc.routine === 'kid' || npc.routine === 'teen' ? 0 : npc.routine === 'neighbour' || npc.routine === 'elder' ? 3 : 1.6) : 0;
  return 0;
}
/** The evening meeting of the neighbourhood board in the hall. */
export const HALL_MEETING = [18.5, 20.3];

/**
 * What a person does at home at hour `h`: [[scene, weight], ...]. The scenes are cook eat wash laundry sweep tv read homework pray play phone sit; js/people/homelife.js drops the ones the house
 * has no place for (a kitchen with no stove, a flat with no television) and puts the person in the right room for the one it picks.
 */
export function homeActs(npc, h) {
  const age = npc.age === 'kid' || npc.age === 'teen' || npc.age === 'elder' ? npc.age : 'adult', woman = npc.gender === 'f', cooks = woman || npc.routine === 'homemaker';
  const per = h < 8.4 ? 0 : h < 11.8 ? 1 : h < 14.3 ? 2 : h < 17.6 ? 3 : h < 20.4 ? 4 : 5;     // morning forenoon lunch afternoon evening night
  const T = {
    adult: [
      [['cook', cooks ? 3.2 : 1.2], ['eat', 3], ['wash', 2], ['sweep', 1], ['tv', 0.5]],
      [['laundry', 3], ['sweep', 2], ['cook', cooks ? 2 : 0.5], ['read', 1], ['tv', 1], ['wash', 1]],
      [['cook', cooks ? 3 : 1], ['eat', 4], ['wash', 1], ['tv', 0.6]],
      [['laundry', 2], ['sweep', 1.5], ['read', 1.5], ['tv', 2], ['cook', cooks ? 1 : 0.3], ['wash', 0.5]],
      [['cook', cooks ? 3 : 1], ['eat', 3.5], ['tv', 3], ['read', 1], ['wash', 1]],
      [['tv', 4], ['read', 2], ['wash', 1.5]],
    ],
    elder: [
      [['eat', 3], ['pray', woman ? 2.5 : 1], ['tv', 1.5], ['wash', 1], ['read', 1]],
      [['tv', 3], ['read', 2], ['sweep', 0.8], ['pray', woman ? 1.5 : 0.5], ['sit', 1]],
      [['eat', 4], ['cook', woman ? 1.5 : 0.2], ['tv', 1]],
      [['tv', 3], ['read', 2], ['sit', 1], ['pray', woman ? 1.5 : 0.5]],
      [['eat', 3], ['tv', 4], ['pray', woman ? 2.5 : 1], ['read', 1]],
      [['tv', 4], ['read', 2], ['pray', 1]],
    ],
    teen: [
      [['eat', 3], ['wash', 2], ['phone', 1]],
      [['tv', 2], ['homework', 2], ['phone', 1.5]],
      [['eat', 4], ['tv', 1], ['homework', 1], ['phone', 1]],
      [['homework', 4], ['tv', 2], ['phone', 2]],
      [['eat', 3], ['tv', 3], ['homework', 2], ['phone', 2]],
      [['tv', 3], ['phone', 2], ['homework', 1]],
    ],
    kid: [
      [['eat', 4], ['wash', 2], ['play', 1]],
      [['play', 2], ['tv', 2], ['homework', 1]],
      [['eat', 4], ['play', 1], ['tv', 1]],
      [['homework', 4], ['play', 3], ['tv', 2]],
      [['eat', 3], ['tv', 3], ['homework', 2], ['play', 1]],
      [['tv', 3], ['play', 1]],
    ],
  };
  return T[age][per];
}

/** Weighted leisure activities by routine and hour. Names are the brain's: sweep lean bench chat play wander errand phone greet stand pray court home clinic hall. */
export function freeChoices(npc, h) {
  const list = freeOutdoors(npc, h), home = homeWeight(npc, h), clinic = visitWeight(npc, h, 'clinic'), hall = visitWeight(npc, h, 'hall');
  if (home > 0) list.push(['home', home]);
  if (clinic > 0) list.push(['clinic', clinic]);
  if (hall > 0) list.push(['hall', hall]);
  return list;
}

/**
 * The hour after which this child or teenager has no choice left out of doors, only home (everybody else: never). The children are in by dusk (the sun is down at 17:55 near 6 deg N in late
 * October and it is dark by 18:20), the teenagers by about nine in the evening. Each has an hour of their own (`jit[2]`), so the street empties of them over half an hour, not in one minute
 * (R3-206: ten children and teenagers were still walking about at 21:30). The brain keeps them in, once they are home, until bed time (`Brain.stayOver`).
 */
export function curfewH(npc) {
  const u = npc.jit?.[2] ?? 0.5;
  return npc.routine === 'kid' ? 17.7 + u * 0.6 : npc.routine === 'teen' ? 20.4 + u * 0.8 : Infinity;
}

/** What a person at leisure does out of doors (see freeChoices for the whole bag). */
function freeOutdoors(npc, h) {
  if (h >= curfewH(npc)) return [];
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
    case 'beata': return [['pray', morning || evening ? 5 : 3], ['bench', 3], ['chat', 2], ['wander', 1], ['greet', 1]];       // (the chapel has somebody in it most of the day)
    default: return [['wander', 2], ['bench', 1], ['chat', 1], ['stand', 1]];
  }
}

/** Hours of the day at which the devout go to the chapel (prayer). */
export const PRAYER_HOURS = [6.0, 12.0, 18.0];
export const nearPrayer = (h) => PRAYER_HOURS.some((p) => Math.abs(h - p) < 0.7);

/** Act name -> animation clip (the world keeps the table; the tests use it too). */
export const CLIP_FOR_ACT = {
  idle: null, sweep: 'sweep', lean: 'lean_wall', sit: 'sit_idle', sit_talk: 'sit_talk', sell: 'sell', cook: 'cook', laundry: 'laundry', pray: 'pray', carry: 'carry_stand',
  phone: 'phone_stand', wave: 'wave', point: 'point', bounce: 'kid_bounce', fidget: 'kid_fidget', wait: 'idle_b', read: 'sit_look', talk: 'talk', class: 'sit_idle',
  // indoors (homelife.js): at the table, in front of the television, at the desk, at the sink or the bench; asleep is the idle clip, lying down (world.js)
  eat: 'sit_idle', tv: 'sit_idle', homework: 'sit_look', wash: 'cook', repair: 'cook', sleep: 'idle_a',
};
