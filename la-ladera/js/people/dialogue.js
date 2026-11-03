// Conversation engine. PURE logic (no DOM, no THREE): the UI (ui.js) renders what this returns, the tests drive it directly.
//
//   const d = new Dialogue({ npc, bank, rng, hour, world, address });   // npc: { id, persona, name, mem:{...}, act?, shopName?, gender }
//   let step = d.open();            // { line:{es,en}, choices:[{id,es,en}], end:false }
//   step = d.pick('job');           // NPC answer + a fresh menu (no repeated lines inside one conversation)
//   step = d.pick('bye');           // { line, choices:[], end:true }
//
// `npc.act` is what they were doing when the player stopped them (talk.js reads it before beginTalk puts them in the chat pose): the pool `act_<act>` is the opener.
// Bank shape (see lines/*.js): bank.shared = pools; bank.personas[id] = pools + { topics:[...], menu:{topic:[es,en]}, items:[...], register:'tu' }.
// A pool is an array of [es, en] pairs. Every NPC keeps `mem.used[pool]` = Set of line indices already said (across conversations too),
// so a second chat first shows lines not heard yet; a line is never repeated inside one conversation. A topic draws first from the persona's own pool, then from the shared one, and
// the session's `memory` (newLineMemory, opts.memory) remembers what ANYBODY said: two people of one persona say different lines until all of them have been said.
//
// Special topics handled here (not pools): 'where' (directions via world.landmarks), 'tip' (hint from undiscovered items), 'time' (clock),
// 'buy' (persona.items: a small purchase menu, emits no state - the caller may listen to step.buy), 'bye'.
//
// Tokens inside a line (both languages):
//   {nombre} {shop} {barrio}   the speaker's name, "la <shop name>" (article included), La Ladera
//   {o|a}                      the SPEAKER's gender form (masculine|feminine)
//   {vecino} {mijo} {señor} {amigo} {bienvenido} {parado} {perdido} {sir} {youngster} ...   how the PLAYER is addressed (opts.address 'm' | 'f', the
//                              player's setting, default 'm'); `joven` never changes. A capital first letter ({Mijo}) capitalises the result.
//   {lo}                       the pronoun for the player: "lo" | "la" ("Qué gusto ver{lo}", "Dios {lo} bendiga"): never write lo / la / le next to a token

import { publicDiscovery, hintPhrase, HINT_INTRO } from './hints.js';

export const period = (h) => (h >= 5 && h < 12 ? 'm' : h >= 12 && h < 18 ? 'a' : h >= 18 && h < 22 ? 'e' : 'n');

export const TOPIC_MENU = {
  mood:   ['¿Cómo va todo por aquí?', "How's everything going around here?"],
  job:    ['¿A qué se dedica usted?', 'What do you do for a living?'],
  wares:  ['¿Qué me recomienda hoy?', 'What do you recommend today?'],
  barrio: ['Cuénteme del barrio.', 'Tell me about the neighbourhood.'],
  family: ['¿Y su familia?', 'And your family?'],
  news:   ['¿Qué se cuenta por ahí?', "What's the news around here?"],
  tip:    ['¿Algo que valga la pena ver?', 'Anything worth seeing?'],
  where:  ['¿Me indica cómo llegar a un sitio?', 'Can you tell me how to get somewhere?'],
  time:   ['¿Qué hora es, por favor?', 'What time is it, please?'],
  buy:    ['Quisiera comprar algo.', "I'd like to buy something."],
  bye:    ['Muchas gracias, hasta luego.', 'Thank you, see you later.'],
};
/** The player talks to kids and teens with tú (personas with `register: 'tu'`); the kids keep answering with usted. */
export const TOPIC_MENU_TU = {
  mood:   ['¿Cómo estás?', 'How are you?'],
  job:    ['¿Qué haces tú?', 'What do you do?'],
  barrio: ['Cuéntame del barrio.', 'Tell me about the neighbourhood.'],
  family: ['¿Y tu familia?', 'And your family?'],
  news:   ['¿Qué se cuenta por ahí?', "What's the news around here?"],
  tip:    ['¿Algo chévere para ver?', 'Anything cool to see?'],
  where:  ['¿Me dices cómo llegar a un sitio?', 'Can you tell me how to get somewhere?'],
  time:   ['¿Qué hora es?', 'What time is it?'],
  bye:    ['Chao, gracias.', 'Bye, thanks.'],
};
const NEAR = 25;                                  // metres: nearer than this nobody asks the way
const AGAIN = [['Cuénteme algo más sobre eso.', 'Tell me more about that.'], ['¿Y qué más?', 'And what else?'], ['Siga, que me interesa.', "Go on, I'm interested."]];
const AGAIN_TU = [['Cuéntame más.', 'Tell me more.'], ['¿Y qué más?', 'And what else?'], ['Sigue, sigue.', 'Go on, go on.']];
const BASE_TOPICS = ['mood', 'job', 'barrio', 'family', 'news', 'tip', 'where', 'time'];
const FALLBACK_MENU = ['Cuénteme algo más.', 'Tell me more.'];
const TOLD = Object.freeze({});          // the key, in the session's line memory (a WeakMap), of the places the barrio has told a stranger lately (R3-022)
const RECENT_TIPS = 4;                   // so many of them wait before anybody names one again
const MAJOR_KINDS = new Set(['viewpoint', 'plaza', 'chapel', 'school']);       // the places a stranger crosses the barrio for: every "where" menu offers one of them (R3-107)
const OFFERED = Object.freeze({});       // the key, in the session's line memory, of the major places the menus have offered lately
const RECENT_OFFERS = 8;

/** How the player is addressed: [masculine, feminine]. `joven`, `usted` and the like are invariant and are written plainly in the lines. */
export const FORMS = {
  vecino: ['vecino', 'vecina'], mijo: ['mijo', 'mija'], mijito: ['mijito', 'mijita'], señor: ['señor', 'señora'], amigo: ['amigo', 'amiga'],
  bienvenido: ['bienvenido', 'bienvenida'], parado: ['parado', 'parada'], perdido: ['perdido', 'perdida'], cansado: ['cansado', 'cansada'],
  despierto: ['despierto', 'despierta'], nuevo: ['nuevo', 'nueva'], lo: ['lo', 'la'], solo: ['solo', 'sola'],
  sir: ['sir', "ma'am"], youngster: ['young man', 'young lady'],
};

/** A line of a pool may carry a third element `{ from, to }` (clock hours): it is only said from `from` (default 0) until `to` (default 24): "¿Ya almorzó?" is asked until three o'clock, "¿ya se tomó las onces?" after it (R3-018). */
export const inWindow = (w, h) => !w || ((w.from ?? 0) <= h && h < (w.to ?? 24));
/**
 * The same third element can also say WHO may say the line (R3-020), so a shared pool never puts a line in the wrong mouth:
 *   age: ['adult', 'elder']   only a speaker of these ages (a parent's line is not a teenager's)      only: ['abuela']      only these personas
 *   not: ['mototaxista']      never these personas                                                     shop: false           never a shopkeeper (true: only a shopkeeper)
 * A speaker without an `age` counts as an adult. `lineFits` is the guards and the hour window together: what `_take` draws from.
 */
export function mayBeSaid(w, npc = {}) {
  if (!w) return true;
  if (w.age && !w.age.includes(npc.age ?? 'adult')) return false;
  if (w.only && !w.only.includes(npc.persona)) return false;
  if (w.not?.includes(npc.persona)) return false;
  if (w.shop !== undefined && w.shop !== !!npc.shopName) return false;
  return true;
}
export const lineFits = (w, npc, h) => inWindow(w, h) && mayBeSaid(w, npc);
const pickFrom = (arr, rng) => arr[Math.floor(rng.next() * arr.length)];
const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
/** Capitalise the first letter. */
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * What the barrio has said, pool by pool: a WeakMap from the pool (the array) to the Set of the indices of its lines that anybody has said. The session owns one (people/talk.js), so two
 * people who draw from the same pool (two of one persona, or two who both fall back to a shared pool) say different lines until the pool has been used up.
 */
export const newLineMemory = () => new WeakMap();

/**
 * Unused-first line pick from a pool; marks it used. Returns [es,en] or null for an empty pool.
 * `used`: the lines THIS speaker has said (across conversations: never one of them twice before all have been said); `barrio`: the lines anybody has said (a Set of indices, or null): a line
 * the barrio has said waits behind the ones nobody has. Once every line has been said the barrio's list starts over, holding only the line just said (so the next person does not repeat it).
 */
export function takeLine(pool, used, rng, barrio = null) {
  if (!pool?.length) return null;
  const all = pool.map((_, i) => i);
  let free = all.filter((i) => !used.has(i) && !barrio?.has(i));             // nobody has said it
  if (!free.length) free = all.filter((i) => !used.has(i));                  // the barrio has, this speaker has not
  if (!free.length) { used.clear(); free = all; }                            // this speaker has said them all: start over (never inside one conversation: see Dialogue._say)
  const i = free[Math.floor(rng.next() * free.length)]; used.add(i);
  if (barrio) { barrio.add(i); if (barrio.size >= pool.length) { barrio.clear(); barrio.add(i); } }
  return pool[i];
}

// ---- Spanish typography: article + preposition contraction, capital after a full stop ---------------------------------------------------
const FEM_NOUN = new Set(['calle', 'plaza', 'plazoleta', 'cancha', 'capilla', 'escuela', 'escalinata', 'parada', 'iglesia', 'tienda', 'casa', 'obra', 'quebrada', 'terraza', 'esquina', 'cuadra', 'ladera', 'fuente', 'carrera', 'avenida', 'vereda', 'banca', 'cabina']);
const FEM_PLURAL = new Set(['carnes', 'flores']);                                                  // feminine plurals in -es the endings below do not catch
/** "Mirador del Cielo" -> "el Mirador del Cielo", "Calle del Sol" -> "la Calle del Sol"; a name that already carries its article keeps it. */
export function withArticle(name) {
  const s = String(name ?? '').trim(); if (!s) return s;
  const m = /^(el|la|los|las)\s+(.*)$/i.exec(s); if (m) return m[1].toLowerCase() + ' ' + m[2];
  const w = s.split(/\s+/)[0].toLowerCase();
  if (/as$/.test(w) && /^[a-záéíóúñ]+as$/.test(w) && w.length > 4) return 'las ' + s;
  if (/(ciones|siones|dades|tades)$/.test(w) || FEM_PLURAL.has(w)) return 'las ' + s;                    // "Confecciones Doña Carmen", "Carnes La Sabana": feminine plurals in -es
  if (/os$/.test(w) && w.length > 4) return 'los ' + s;
  const fem = FEM_NOUN.has(w) || (/(a|ía|ción|sión|dad|tad)$/.test(w) && !['mapa', 'día', 'sofá'].includes(w));
  return (fem ? 'la ' : 'el ') + s;
}
/** English "the" for a place (streets are proper names without one: "Sun Street is ..."; "the Bus Stop"). */
export const theEn = (en, kind) => (!en ? en : /^(the|a|an|el|la|los|las)\s/i.test(en) || kind === 'street' ? en : 'the ' + en);       // a name that opens with a Spanish article ("El Cerro School") has its article: never "the El Cerro School"
/** a el -> al, de el -> del (a lowercase "el" only: the proper names "El Progreso" keep their capital and their "a"); a capital after . ! ? ; blank runs collapsed. */
export function polish(s) {
  return String(s)
    .replace(/(^|[\s¿¡"“(])([Aa]) el(?=\s)/g, '$1$2l').replace(/(^|[\s¿¡"“(])([Dd]e) el(?=\s)/g, '$1$2l')
    .replace(/([.!?]\s+[¿¡]?)([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\s{2,}/g, ' ').trim();
}

/**
 * Fill the tokens of one { es, en } line: the speaker's name, shop (with its article in Spanish), the speaker's gender forms `{o|a}` and the forms
 * the PLAYER is addressed with (`address` 'm' | 'f'); then tidy the Spanish with polish().
 */
export function fillTokens(line, { gender = 'm', address = 'm', name = '', shopName = null } = {}) {
  if (!line) return line;
  const fem = gender === 'f', pf = address === 'f' ? 1 : 0;
  const shop = shopName ? withArticle(shopName) : 'la tienda';
  const rep = (s, shopText) => String(s).replaceAll('{nombre}', name ?? '').replaceAll('{shop}', shopText).replaceAll('{barrio}', 'La Ladera')
    .replace(/\{([^{}|]+)\|([^{}|]+)\}/g, (_, m, w) => (fem ? w : m))
    .replace(/\{([^{}|]+)\}/g, (all, k) => {
      const f = FORMS[k.toLowerCase()]; if (!f) return all;
      return k[0] === k[0].toLowerCase() ? f[pf] : cap(f[pf]);
    });
  return { ...line, es: polish(rep(line.es, shop)), en: rep(line.en, shopName ?? 'the shop').replace(/\s{2,}/g, ' ').trim() };
}

// ---- the clock, said the Colombian way ------------------------------------------------------------------------------------------------
const HOUR_ES = ['doce', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once'];
const MIN_ES = { 5: 'y cinco', 10: 'y diez', 15: 'y cuarto', 20: 'y veinte', 25: 'y veinticinco', 30: 'y media', 35: 'menos veinticinco', 40: 'menos veinte', 45: 'menos cuarto', 50: 'menos diez', 55: 'menos cinco' };
/** Spanish + English clock phrase for an hour of the day (0..24, fractional). Rounds to 5 minutes. */
export function clockLine(h) {
  const ticks = Math.round((((h % 24) + 24) % 24) * 12) % 288;       // five-minute ticks since midnight (288 per day)
  const hh = Math.floor(ticks / 12), mm = (ticks % 12) * 5;
  if (hh === 0 && mm === 0) return { es: 'Es medianoche en punto.', en: "It's midnight on the dot." };
  const target = mm > 30 ? (hh + 1) % 24 : hh;                       // Spanish counts "menos" towards the next hour
  const h12 = target % 12;
  const part = hh === 23 && target === 0 ? 'de la noche' : target < 5 ? 'de la madrugada' : target < 12 ? 'de la mañana' : target === 12 ? 'del día' : target < 19 ? 'de la tarde' : 'de la noche';
  const lead = h12 === 1 ? 'Es la una' : `Son las ${HOUR_ES[h12]}`;
  const es = `${lead} ${mm === 0 ? 'en punto' : MIN_ES[mm]} ${part}.`;
  const eh = hh % 12 || 12, epart = hh < 5 ? 'at night' : hh < 12 ? 'in the morning' : hh === 12 && mm === 0 ? 'at noon' : hh < 19 ? 'in the afternoon' : 'at night';
  const en = mm === 0 ? `It's ${eh} o'clock ${epart}.` : `It's ${eh}:${String(mm).padStart(2, '0')} ${epart}.`;
  return { es, en };
}

// ---- directions -------------------------------------------------------------------------------------------------------------------------
// Each clause of an answer ("cuesta arriba, a una cuadra larga, a mano derecha") is one of several ways of saying the same thing, so a stranger who asks three people does not hear one sentence three times
// (R3-107: 31 of 42 answers said "a una cuadra larga", 28 "más o menos al mismo nivel"). The English keeps one wording per clause: it is the subtitle, and says what the Spanish says.
// A slope past 6 m always has stairs on the way (every one of the 152 routes of the plan that climbs or drops more than 6 m between two landmarks crosses a stair node), so those phrases say so.
const DIRS = {
  front: ['todo derecho', 'recto, de frente', 'derechito', 'de frente'],
  right: ['a mano derecha', 'a su derecha', 'por la derecha', 'hacia la derecha'],
  left: ['a mano izquierda', 'a su izquierda', 'por la izquierda', 'hacia la izquierda'],
  back: ['por donde usted venía', 'para atrás', 'hacia atrás'],
};
const DIR_EN = { front: 'straight ahead', right: 'on your right', left: 'on your left', back: 'back the way you came' };
const BACK_TAIL = ['Se devuelve y sigue.', 'Se devuelve un poco y sigue.', 'Se devuelve y sigue derecho.'];
const LEVEL = ['más o menos al mismo nivel', 'casi al mismo nivel', 'en plano', 'sin subir ni bajar', 'por lo plano'];
/** Up to `max` metres of climb: the phrases ("cuesta arriba" stays in every phrase up to 12 m: it is what a visitor listens for). */
const CLIMB = {
  up: [[6, ['cuesta arriba', 'un poco cuesta arriba', 'cuesta arriba, subiendo']],
    [12, ['cuesta arriba, por las escaleras', 'subiendo, cuesta arriba, por las escaleras', 'por las escaleras, cuesta arriba']],
    [Infinity, ['bien arriba, por las escaleras', 'allá arriba, por las escaleras', 'cuesta arriba, un buen tramo de escaleras']]],
  down: [[6, ['cuesta abajo', 'un poco cuesta abajo', 'cuesta abajo, bajando']],
    [12, ['cuesta abajo, por las escaleras', 'bajando, cuesta abajo, por las escaleras', 'por las escaleras, cuesta abajo']],
    [Infinity, ['bien abajo, por las escaleras', 'allá abajo, por las escaleras', 'cuesta abajo, un buen tramo de escaleras']]],
};
/** Up to `max` metres of distance: the phrases and the English (a block is about 40 m; the near band always says "ahí no más"). */
const DIST = [
  [18, ['ahí no más', 'ahí no más, a unos pasos', 'a unos pasos, ahí no más'], 'right there'],
  [45, ['a una cuadra larga', 'a una cuadra más o menos', 'como a una cuadra', 'a una cuadra de aquí', 'a una cuadrita'], 'about a block away'],
  [90, ['como a dos cuadras', 'a dos cuadras más o menos', 'a un par de cuadras', 'a dos cuadras largas', 'a unas dos cuadras'], 'a couple of blocks away'],
  [150, ['como a tres cuadras', 'a unas tres cuadras', 'a un buen trecho, por allá'], 'quite far'],
  [Infinity, ['bien lejos, por allá', 'lejos, lejos, por allá', 'a un buen camino, por allá', 'bien lejos de aquí'], 'quite far'],
];
const ORDERS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];     // the order of (slope, distance, side) in the Spanish answer
const oneOf = (arr, rng) => arr[Math.floor((rng?.next() ?? 0) * arr.length) % arr.length];

/**
 * Spanish + English walking directions from (px,pz) facing `yaw` (camera convention: yaw 0 looks toward -z) to a landmark { name, en, kind?, x, y?, z }.
 * `o.short` drops the name ("Queda cuesta arriba, ...") for a sentence that follows one that already named the place. The verb agrees with what the sentence is about (R3-202): `o.plural`
 * ("Quedan ...", English "They're ..."), and `o.estar` for an animal, which is somewhere rather than located ("Está ...", "Están ...").
 */
export function directionsTo(lm, p, rng, o = {}) {
  const dx = lm.x - p.x, dz = lm.z - p.z, d = Math.hypot(dx, dz);
  const fx = -Math.sin(p.yaw ?? 0), fz = -Math.cos(p.yaw ?? 0);                 // forward in the XZ plane (x east, z south)
  const rx = -fz, rz = fx;                                                     // right-hand vector: forward rotated 90 deg clockwise seen from above
  const dot = fx * dx + fz * dz, side = rx * dx + rz * dz;
  const ang = Math.atan2(side, dot) * 180 / Math.PI;                           // 0 = ahead, +90 = right, -90 = left
  const a = Math.abs(ang);
  const dir = a < 28 ? 'front' : a > 125 ? 'back' : ang > 0 ? 'right' : 'left';
  const dy = (lm.y ?? p.y ?? 0) - (p.y ?? 0);
  const band = (T) => T.find(([max]) => Math.abs(dy) <= max)[1];
  const hill = dy > 3 ? [oneOf(band(CLIMB.up), rng), 'uphill'] : dy < -3 ? [oneOf(band(CLIMB.down), rng), 'downhill'] : [oneOf(LEVEL, rng), 'at about the same level'];
  const far = DIST.find(([max]) => d < max), dist = [oneOf(far[1], rng), far[2]];
  const dn = oneOf(DIRS[dir], rng);
  const parts = [hill[0], dist[0], dn], order = oneOf(ORDERS, rng);
  const where = order.map((i) => parts[i]).join(', '), whereEn = `${hill[1]}, ${dist[1]}, ${DIR_EN[dir]}`;
  const name = withArticle(lm.name), nameEn = theEn(lm.en ?? lm.name, lm.kind);
  let es, en;
  if (o.short) {
    const verb = o.estar ? (o.plural ? 'Están' : 'Está') : (o.plural ? 'Quedan' : 'Queda');
    es = dir === 'back' ? `${verb} ${where}. ${oneOf(BACK_TAIL, rng)}` : `${verb} ${where}.`; en = `${o.plural ? "They're" : "It's"} ${whereEn}.`;
  } else {
    const verb = o.estar ? (o.plural ? 'están' : 'está') : (o.plural ? 'quedan' : 'queda');
    es = dir === 'back' ? `${cap(name)} ${verb} ${where}. ${oneOf(BACK_TAIL, rng)}` : `Mire, ${name} ${verb} ${where}.`;
    en = `${cap(nameEn)} ${o.plural ? 'are' : 'is'} ${whereEn}.`;
  }
  return { es: polish(es), en, dir, dist: d };
}

/** A Spanish opening that ends in a preposition ("Fíjese en", "Pase por", "asomarse a") has its own; any other ("mire", "Vale la pena mirar", "no se pierda") takes what it names straight, and an animal then needs the personal "a". */
const ENDS_IN_PREPOSITION = /\b(en|a|de|por|con|hacia|para|sobre|ante)$/i;

export class Dialogue {
  /**
   * opts: { npc, bank, rng, hour, world:{ landmarks, discoveries, player:{x,y,z,yaw} }, address:'m'|'f', memory }
   * npc.mem is created on first use: { met, lastHour, used:{pool:Set}, heard:Set }   (the keys of `used`: a topic's own pool by its name, the shared one with a * before it)
   * memory: newLineMemory(), what the whole barrio has said (see takeLine); null = only each NPC's own memory counts.
   */
  constructor({ npc, bank, rng, hour = 12, world = {}, address = 'm', memory = null }) {
    this.npc = npc; this.bank = bank; this.rng = rng; this.hour = hour; this.world = world; this.address = address === 'f' ? 'f' : 'm'; this.memory = memory;
    this.persona = bank.personas?.[npc.persona] ?? {}; this.shared = bank.shared ?? {}; this.tu = this.persona.register === 'tu';
    const m = npc.mem ??= { met: 0, lastHour: null, used: {}, heard: new Set() };
    this.mem = m; this.spoken = new Set(); this.topicsDone = new Set(); this.turns = 0; this.ended = false; this.stage = 'menu'; this.sub = null;
  }

  pool(key) { return this.persona[key] ?? this.shared[key] ?? null; }
  _used(key) { return this.mem.used[key] ??= new Set(); }

  /** The pools a topic draws from, in order: the persona's own lines, then the shared ones every persona falls back to (so a persona with two lines of its own is never out of things to say). */
  _tiers(key) {
    const own = this.persona[key], sh = this.shared[key], out = [];
    if (own?.length) out.push({ pool: own, uk: key });
    if (sh?.length && sh !== own) out.push({ pool: sh, uk: '*' + key });
    return out;
  }
  /** How many lines a topic can say in all, and how many of them this NPC has not said (nor said already in this conversation). */
  _size(key) { return this._tiers(key).reduce((n, t) => n + t.pool.filter((l) => mayBeSaid(l[2], this.npc)).length, 0); }     // (only the lines this speaker may say: R3-020)
  _fresh(key) {
    let n = 0;
    for (const t of this._tiers(key)) { const used = this._used(t.uk); for (let i = 0; i < t.pool.length; i++) if (!used.has(i) && !this.spoken.has(t.pool[i][0]) && mayBeSaid(t.pool[i][2], this.npc)) n++; }
    return n;
  }
  _barrio(pool) { if (!this.memory) return null; let s = this.memory.get(pool); if (!s) this.memory.set(pool, s = new Set()); return s; }
  /** The barrio has said every line of tier `t` that can be said at this hour. */
  _said(t) { const b = this._barrio(t.pool); return t.pool.every((l, j) => b.has(j) || !lineFits(l[2], this.npc, this.hour)); }

  /**
   * One line of a topic: first a line nobody in the barrio has said and this NPC has not, from the first pool that has one (the persona's own, then the shared); else one this NPC has not
   * said (the barrio has); else, this NPC having said everything, its memory starts over. Never the same ES text twice inside one conversation.
   */
  _take(tiers) {
    const ok = (t, i) => !this.spoken.has(t.pool[i][0]) && lineFits(t.pool[i][2], this.npc, this.hour);
    const mark = (t, i) => {
      this._used(t.uk).add(i); this.spoken.add(t.pool[i][0]);
      const b = this._barrio(t.pool);
      if (b) {
        b.add(i);
        if (tiers.every((x) => this._said(x))) { for (const x of tiers) this._barrio(x.pool).clear(); b.add(i); }   // everything the topic can say (at this hour) has been said: a new round, which does not open with the line just said
      }
      return t.pool[i];
    };
    const idx = (t, keep) => t.pool.map((_, i) => i).filter(keep);
    for (const t of tiers) {
      const used = this._used(t.uk), b = this.memory ? this._barrio(t.pool) : null, free = idx(t, (i) => !used.has(i) && !b?.has(i) && ok(t, i));
      if (free.length) return mark(t, free[Math.floor(this.rng.next() * free.length)]);
    }
    for (const t of tiers) {
      const used = this._used(t.uk), free = idx(t, (i) => !used.has(i) && ok(t, i));
      if (free.length) return mark(t, free[Math.floor(this.rng.next() * free.length)]);
    }
    for (const t of tiers) this._used(t.uk).clear();
    for (const t of tiers) { const free = idx(t, (i) => ok(t, i)); if (free.length) return mark(t, free[Math.floor(this.rng.next() * free.length)]); }
    return null;
  }

  /** Say one line of a topic (`fallbackKey` when `key` has no pool at all); never the same ES text twice inside this conversation. */
  _say(key, fallbackKey = null) {
    for (const k of [key, fallbackKey]) {
      const tiers = k ? this._tiers(k) : [];
      if (!tiers.length) continue;
      const ln = this._take(tiers);
      if (ln) return { es: ln[0], en: ln[1] };
    }
    return null;
  }

  /** Fill the tokens of a line and tidy the Spanish (article contraction, capitals). */
  _tokens(line) {
    const n = this.npc;
    return fillTokens(line, { gender: n.gender, address: this.address, name: n.name, shopName: n.shopName });
  }

  open() {
    const n = this.npc, m = this.mem, per = period(this.hour);
    let line = null;
    const actKey = n.act ? 'act_' + n.act : null;
    // a second visit is greeted as one ("again"); the first time they say what they were doing right now, else the greeting of the hour
    if (m.met > 0 && this._size('again') && this.rng.next() < 0.85) line = this._say('again');
    if (!line && actKey && this._size(actKey) && this.rng.next() < 0.6) line = this._say(actKey);
    if (!line) line = this._say('greet_' + per);
    if (!line) line = { es: 'Buenas.', en: 'Hello.' };
    m.met++; m.lastHour = this.hour;
    this.turns = 1;
    return { line: this._tokens(line), choices: this.menu(), end: false };
  }

  availableTopics() {
    const topics = [...(this.persona.topics ?? BASE_TOPICS)].filter((t) => t !== 'bye');
    if (!topics.includes('time')) topics.push('time');
    return topics.filter((t) => {
      if (t === 'where') return (this.world.landmarks?.length ?? 0) > 0;
      if (t === 'buy') return this.onSale().length > 0;
      if (t === 'tip' || t === 'time') return true;
      if (!this._size(t)) return false;
      return this._fresh(t) > 0 || !this.topicsDone.has(t);
    });
  }

  menu() {
    if (this.stage === 'where') return this.whereMenu();
    if (this.stage === 'buy') return this.buyMenu();
    const av = this.availableTopics().filter((t) => !this.topicsDone.has(t) || t === 'buy' || this._size(t) > 2);
    const rest = av.filter((t) => !this.topicsDone.has(t) || t === 'buy');
    // shops: offer the purchase first, it is what a visitor most likely wants
    const order = this.rng.shuffle(rest.length >= 3 ? rest.filter((t) => t !== 'buy') : [...rest.filter((t) => t !== 'buy'), ...av.filter((t) => this.topicsDone.has(t) && t !== 'buy')]);
    const out = [];
    if (rest.includes('buy')) out.push(this.entry('buy'));
    for (const t of order) { if (out.length >= 3) break; if (!out.find((c) => c.id === t)) out.push(this.entry(t)); }
    out.push(this.entry('bye'));
    return out;
  }

  /** The menu label of a topic: the persona's own wording, else the tú / usted default; a topic heard already asks for "more" in a varied way. */
  entry(t) {
    const m = this.persona.menu?.[t] ?? (this.tu ? TOPIC_MENU_TU[t] : null) ?? TOPIC_MENU[t] ?? FALLBACK_MENU;
    const again = this.topicsDone.has(t) && !['where', 'tip', 'time', 'buy'].includes(t);
    const a = (this.tu ? AGAIN_TU : AGAIN)[hashStr(t) % 3];
    return { id: t, es: again ? a[0] : m[0], en: again ? a[1] : m[1] };
  }

  whereMenu() {
    const lms = this.landmarkChoices(); const out = lms.map((l) => ({ id: 'lm:' + l.id, es: l.name, en: l.en ?? l.name }));
    out.push({ id: 'back', es: 'Mejor otra cosa.', en: 'Something else, actually.' });
    return out.slice(0, 4);
  }

  /** What the shop has on sale at this hour: an item may carry `{ from, to }` like a line (R3-207: the set lunch was offered at half past seven, right after "Todavía estamos con el desayuno"). */
  onSale() { return (this.persona.items ?? []).filter((it) => inWindow(it, this.hour)); }

  buyMenu() {
    const items = this.onSale().slice(0, 3);
    const out = items.map((it) => ({ id: 'item:' + it.id, es: it.es, en: it.en }));
    out.push({ id: 'back', es: 'Mejor otra cosa.', en: 'Something else, actually.' });
    return out;
  }

  /**
   * The places the menu offers: nobody gives directions to the shop they stand in, or to a place a few steps away (NEAR m round the speaker), so those wait
   * unless nothing else is left. The nearest of the rest (the one answer that is always a short walk), one of the next three (so the neighbours do not all offer the same pair), and a
   * place a stranger crosses the barrio for (a viewpoint, a plaza, the chapel, the school: `majorPlace`), so those are never out of reach however far down the hill the visitor stands (R3-107).
   */
  landmarkChoices() {
    if (this._lmc) return this._lmc;
    const n = this.npc, p = this.world.player ?? n, at = Number.isFinite(n.x) && Number.isFinite(n.z) ? n : p, every = this.world.landmarks ?? [];
    const away = every.filter((l) => !(n.shopName && l.name === n.shopName) && Math.hypot(l.x - at.x, l.z - at.z) >= NEAR);
    const pool = away.length >= 3 ? away : every;
    const all = pool.filter((l) => !this.mem.heard.has('lm:' + l.id) || pool.length < 5);
    const sorted = [...all].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const picks = sorted.slice(0, 1), major = this.majorPlace(sorted.slice(1)), others = sorted.slice(1).filter((l) => l !== major);
    if (others.length) picks.push(others[Math.floor(this.rng.next() * Math.min(3, others.length))]);
    if (major) picks.push(major);
    else { const left = others.filter((l) => !picks.includes(l)); if (left.length) picks.push(left[Math.floor(this.rng.next() * left.length)]); }
    return (this._lmc = picks.slice(0, 3));
  }

  /**
   * One of the major places among `rest`, taken in turn: the one the session's menus offered least recently (the barrio remembers the last RECENT_OFFERS, whoever was asked), the farthest first
   * among those not offered yet, so a visitor who asks five people has been offered each of the five. Null when there is none.
   */
  majorPlace(rest) {
    const majors = rest.filter((l) => MAJOR_KINDS.has(l.kind));
    if (!majors.length) return null;
    const seen = this.memory ? this.memory.get(OFFERED) ?? [] : this.mem.offered ?? [], p = this.world.player ?? this.npc, far = (l) => Math.hypot(l.x - p.x, l.z - p.z);
    const best = [...majors].sort((a, b) => seen.lastIndexOf(a.id) - seen.lastIndexOf(b.id) || far(b) - far(a))[0];
    const next = [...seen.filter((id) => id !== best.id), best.id].slice(-RECENT_OFFERS);
    if (this.memory) this.memory.set(OFFERED, next); else this.mem.offered = next;
    return best;
  }

  /**
   * One discoverable thing the NPC "heard about", for a stranger who asks what is worth seeing: one of the nearest undiscovered PUBLIC places or things
   * (never what is inside somebody's home), named by a short noun phrase and introduced the way that kind of thing is (hints.js).
   * R3-022: a person remembers what they have named (`mem.told`, across talks) and tells the rest first; the barrio remembers the last few places it named (a session-wide list in the
   * line memory), so the next person asked does not name the same one; of what is left, one of the six nearest (when only those just named are left, any but the last one).
   */
  hint() {
    const items = [...(this.world.discoveries ?? [])].filter((d) => !d.found && publicDiscovery(d));
    if (!items.length) return null;
    const p = this.world.player ?? this.npc;
    items.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const told = (this.mem.told ??= new Set()), recent = (this.memory && this.memory.get(TOLD)) || [];
    let fresh = items.filter((d) => !told.has(d.id));
    if (!fresh.length) { told.clear(); fresh = items; }                                            // everything has been told: start over
    const apart = fresh.filter((d) => !recent.includes(d.id)), other = fresh.filter((d) => d.id !== recent[recent.length - 1]);
    const pool = (apart.length ? apart : other.length ? other : fresh).slice(0, 6);
    const d = pool[Math.floor(this.rng.next() * pool.length)];
    told.add(d.id);
    if (this.memory) this.memory.set(TOLD, [...recent.filter((id) => id !== d.id), d.id].slice(-RECENT_TIPS));
    // (R3-202) the verb agrees with the thing told ("Quedan" after a plural, "Está" for an animal), and an animal that is the object of "mire" or "mirar" has its personal "a" ("mire al perro")
    const h = hintPhrase(d), es = h.es ?? withArticle(d.name), plural = h.plural ?? /^(los|las)\s/i.test(es), animal = h.group === 'animal';
    const dr = directionsTo({ x: d.x, y: d.y, z: d.z, name: d.name, en: d.en, kind: d.kind }, p, this.rng, { short: true, plural, estar: animal });
    const intro = pickFrom(HINT_INTRO[h.group], this.rng);
    return { es: polish(`${intro[0]} ${animal && !ENDS_IN_PREPOSITION.test(intro[0]) ? 'a ' : ''}${es}. ${dr.es}`), en: `${intro[1]} ${h.en}. ${dr.en}` };
  }

  /** The player picked a choice id. Returns the next step. */
  pick(id) {
    if (this.ended) return { line: null, choices: [], end: true };
    this.turns++;
    if (id === 'bye') {
      this.ended = true;
      const line = this._say('bye_' + period(this.hour), 'bye') ?? this._say('bye') ?? { es: 'Hasta luego.', en: 'See you later.' };
      return { line: this._tokens(line), choices: [], end: true };
    }
    if (id === 'where') { this.stage = 'where'; this._lmc = null; return { line: this._tokens(this._say('where_ask') ?? { es: '¿A cuál sitio, pues?', en: 'Which place, then?' }), choices: this.menu(), end: false }; }
    if (id === 'buy') { this.stage = 'buy'; return { line: this._tokens(this._say('buy_ask', 'anything') ?? { es: 'Dígame, ¿qué le sirvo?', en: 'Tell me, what can I get you?' }), choices: this.menu(), end: false }; }
    if (id === 'back') { this.stage = 'menu'; return { line: this._tokens(this._say('anything') ?? { es: 'Dígame, pues.', en: 'Go on, then.' }), choices: this.menu(), end: false }; }
    if (id.startsWith('lm:')) {
      const lm = (this.world.landmarks ?? []).find((l) => 'lm:' + l.id === id);
      this.mem.heard.add(id); this.stage = 'menu'; this.topicsDone.add('where');
      const p = this.world.player ?? this.npc;
      const dr = lm ? directionsTo(lm, p, this.rng) : { es: 'Pues, no sé decirle.', en: "Well, I couldn't tell you." };
      return { line: this._tokens(dr), choices: this.menu(), end: false };
    }
    if (id.startsWith('item:')) {
      const it = (this.persona.items ?? []).find((x) => 'item:' + x.id === id);
      this.stage = 'menu'; this.bought = (this.bought ?? 0) + 1;
      const line = it ? { es: it.say[0], en: it.say[1] } : { es: 'Con gusto.', en: 'My pleasure.' };
      return { line: this._tokens(line), choices: this.menu(), end: false, buy: it ? { id: it.id, price: it.price ?? 0, name: it.name ?? null } : null };
    }
    this.topicsDone.add(id);
    let line = null;
    if (id === 'tip') line = this.hint() ?? this._say('tip');
    else if (id === 'time') line = clockLine(this.hour);
    else line = this._say(id) ?? this._say('filler');
    if (!line) line = { es: 'Pues… mire, de eso no sé mucho.', en: "Well… look, I don't know much about that." };
    return { line: this._tokens(line), choices: this.menu(), end: false };
  }
}
