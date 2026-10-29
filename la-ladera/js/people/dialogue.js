// Conversation engine. PURE logic (no DOM, no THREE): the UI (ui.js) renders what this returns, the tests drive it directly.
//
//   const d = new Dialogue({ npc, bank, rng, hour, world, address });   // npc: { id, persona, name, mem:{...}, act?, shopName?, gender }
//   let step = d.open();            // { line:{es,en}, choices:[{id,es,en}], end:false }
//   step = d.pick('job');           // NPC answer + a fresh menu (no repeated lines inside one conversation)
//   step = d.pick('bye');           // { line, choices:[], end:true }
//
// Bank shape (see lines/*.js): bank.shared = pools; bank.personas[id] = pools + { topics:[...], menu:{topic:[es,en]}, items:[...], register:'tu' }.
// A pool is an array of [es, en] pairs. Every NPC keeps `mem.used[pool]` = Set of line indices already said (across conversations too),
// so a second chat first shows lines not heard yet; a line is never repeated inside one conversation.
//
// Special topics handled here (not pools): 'where' (directions via world.landmarks), 'tip' (hint from undiscovered items), 'time' (clock),
// 'buy' (persona.items: a small purchase menu, emits no state - the caller may listen to step.buy), 'bye'.
//
// Tokens inside a line (both languages):
//   {nombre} {shop} {barrio}   the speaker's name, "la <shop name>" (article included), La Ladera
//   {o|a}                      the SPEAKER's gender form (masculine|feminine)
//   {vecino} {mijo} {señor} {amigo} {bienvenido} {parado} {perdido} {sir} {youngster} ...   how the PLAYER is addressed (opts.address 'm' | 'f', the
//                              player's setting, default 'm'); `joven` never changes. A capital first letter ({Mijo}) capitalises the result.

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
const AGAIN = [['Cuénteme algo más sobre eso.', 'Tell me more about that.'], ['¿Y qué más?', 'And what else?'], ['Siga, que me interesa.', "Go on, I'm interested."]];
const AGAIN_TU = [['Cuéntame más.', 'Tell me more.'], ['¿Y qué más?', 'And what else?'], ['Sigue, sigue.', 'Go on, go on.']];
const BASE_TOPICS = ['mood', 'job', 'barrio', 'family', 'news', 'tip', 'where', 'time'];
const FALLBACK_MENU = ['Cuénteme algo más.', 'Tell me more.'];

/** How the player is addressed: [masculine, feminine]. `joven`, `usted` and the like are invariant and are written plainly in the lines. */
export const FORMS = {
  vecino: ['vecino', 'vecina'], mijo: ['mijo', 'mija'], mijito: ['mijito', 'mijita'], señor: ['señor', 'señora'], amigo: ['amigo', 'amiga'],
  bienvenido: ['bienvenido', 'bienvenida'], parado: ['parado', 'parada'], perdido: ['perdido', 'perdida'], cansado: ['cansado', 'cansada'],
  despierto: ['despierto', 'despierta'], nuevo: ['nuevo', 'nueva'], lo: ['lo', 'la'], solo: ['solo', 'sola'],
  sir: ['sir', "ma'am"], youngster: ['young man', 'young lady'],
};

const pickFrom = (arr, rng) => arr[Math.floor(rng.next() * arr.length)];
const hashStr = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
/** Capitalise the first letter. */
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Unused-first line pick from a pool; marks it used. Returns [es,en] or null for an empty pool. */
export function takeLine(pool, used, rng) {
  if (!pool?.length) return null;
  let free = []; for (let i = 0; i < pool.length; i++) if (!used.has(i)) free.push(i);
  if (!free.length) { used.clear(); free = pool.map((_, i) => i); }          // pool exhausted: start over (never inside one conversation: see Dialogue._say)
  const i = free[Math.floor(rng.next() * free.length)]; used.add(i); return pool[i];
}

// ---- Spanish typography: article + preposition contraction, capital after a full stop ---------------------------------------------------
const FEM_NOUN = new Set(['calle', 'plaza', 'plazoleta', 'cancha', 'capilla', 'escuela', 'escalinata', 'parada', 'iglesia', 'tienda', 'casa', 'obra', 'quebrada', 'terraza', 'esquina', 'cuadra', 'ladera', 'fuente', 'carrera', 'avenida', 'vereda', 'banca', 'cabina']);
/** "Mirador del Cielo" -> "el Mirador del Cielo", "Calle del Sol" -> "la Calle del Sol"; a name that already carries its article keeps it. */
export function withArticle(name) {
  const s = String(name ?? '').trim(); if (!s) return s;
  const m = /^(el|la|los|las)\s+(.*)$/i.exec(s); if (m) return m[1].toLowerCase() + ' ' + m[2];
  const w = s.split(/\s+/)[0].toLowerCase();
  if (/as$/.test(w) && /^[a-záéíóúñ]+as$/.test(w) && w.length > 4) return 'las ' + s;
  if (/os$/.test(w) && w.length > 4) return 'los ' + s;
  const fem = FEM_NOUN.has(w) || (/(a|ía|ción|sión|dad|tad)$/.test(w) && !['mapa', 'día', 'sofá'].includes(w));
  return (fem ? 'la ' : 'el ') + s;
}
/** English "the" for a place (streets are proper names without one). */
export const theEn = (en, kind) => (!en ? en : /^(the|a|an)\s/i.test(en) || kind === 'street' || kind === 'busstop' ? en : 'the ' + en);
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

const DIRS = {
  front: ['todo derecho', 'recto, de frente'], right: ['a mano derecha', 'a su derecha'], left: ['a mano izquierda', 'a su izquierda'],
  back: ['por donde usted venía', 'para atrás'],
};
const DIR_EN = { front: 'straight ahead', right: 'on your right', left: 'on your left', back: 'back the way you came' };

/**
 * Spanish + English walking directions from (px,pz) facing `yaw` (camera convention: yaw 0 looks toward -z) to a landmark { name, en, kind?, x, y?, z }.
 * `o.short` drops the name ("Queda cuesta arriba, ...") for a sentence that follows one that already named the place.
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
  const hill = dy > 3 ? ['cuesta arriba', 'uphill'] : dy < -3 ? ['cuesta abajo', 'downhill'] : ['más o menos al mismo nivel', 'about the same level'];
  const dist = d < 18 ? ['ahí no más', 'right there'] : d < 45 ? ['a una cuadra larga', 'about a block away'] : d < 90 ? ['como a dos cuadras', 'a couple of blocks away'] : ['bien lejos, por allá', 'quite far'];
  const dn = DIRS[dir][Math.floor((rng?.next() ?? 0) * 2) % 2];
  const where = `${hill[0]}, ${dist[0]}, ${dn}`, whereEn = `${hill[1]}, ${dist[1]}, ${DIR_EN[dir]}`;
  const name = withArticle(lm.name), nameEn = theEn(lm.en ?? lm.name, lm.kind);
  let es, en;
  if (o.short) { es = dir === 'back' ? `Queda ${where}. Se devuelve y sigue.` : `Queda ${where}.`; en = `It's ${whereEn}.`; }
  else {
    es = dir === 'back' ? `${cap(name)} queda ${where}. Se devuelve y sigue.` : `Mire, ${name} queda ${where}.`;
    en = `${cap(nameEn)} is ${whereEn}.`;
  }
  return { es: polish(es), en, dir, dist: d };
}

export class Dialogue {
  /**
   * opts: { npc, bank, rng, hour, world:{ landmarks, discoveries, player:{x,y,z,yaw} }, address:'m'|'f' }
   * npc.mem is created on first use: { met, lastHour, used:{pool:Set}, heard:Set }
   */
  constructor({ npc, bank, rng, hour = 12, world = {}, address = 'm' }) {
    this.npc = npc; this.bank = bank; this.rng = rng; this.hour = hour; this.world = world; this.address = address === 'f' ? 'f' : 'm';
    this.persona = bank.personas?.[npc.persona] ?? {}; this.shared = bank.shared ?? {}; this.tu = this.persona.register === 'tu';
    const m = npc.mem ??= { met: 0, lastHour: null, used: {}, heard: new Set() };
    this.mem = m; this.spoken = new Set(); this.topicsDone = new Set(); this.turns = 0; this.ended = false; this.stage = 'menu'; this.sub = null;
  }

  pool(key) { return this.persona[key] ?? this.shared[key] ?? null; }
  _used(key) { return this.mem.used[key] ??= new Set(); }

  /** Say one line from a pool; never the same ES text twice inside this conversation. */
  _say(key, fallbackKey = null) {
    for (const k of [key, fallbackKey]) {
      const pool = k && this.pool(k); if (!pool?.length) continue;
      const used = this._used(k);
      for (let tries = 0; tries < pool.length + 2; tries++) {
        const ln = takeLine(pool, used, this.rng);
        if (ln && !this.spoken.has(ln[0])) { this.spoken.add(ln[0]); return { es: ln[0], en: ln[1] }; }
      }
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
    if (actKey && this.pool(actKey)?.length && this.rng.next() < 0.6) line = this._say(actKey);       // what they are doing right now
    if (!line && m.met > 0 && this.pool('again')?.length && this.rng.next() < 0.85) line = this._say('again');
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
      if (t === 'buy') return (this.persona.items?.length ?? 0) > 0;
      if (t === 'tip' || t === 'time') return true;
      const pool = this.pool(t); if (!pool?.length) return false;
      const used = this._used(t); let free = 0; for (let i = 0; i < pool.length; i++) if (!used.has(i) && !this.spoken.has(pool[i][0])) free++;
      return free > 0 || !this.topicsDone.has(t);
    });
  }

  menu() {
    if (this.stage === 'where') return this.whereMenu();
    if (this.stage === 'buy') return this.buyMenu();
    const av = this.availableTopics().filter((t) => !this.topicsDone.has(t) || t === 'buy' || (this.pool(t)?.length ?? 0) > 2);
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

  buyMenu() {
    const items = (this.persona.items ?? []).slice(0, 3);
    const out = items.map((it) => ({ id: 'item:' + it.id, es: it.es, en: it.en }));
    out.push({ id: 'back', es: 'Mejor otra cosa.', en: 'Something else, actually.' });
    return out;
  }

  landmarkChoices() {
    if (this._lmc) return this._lmc;
    const all = (this.world.landmarks ?? []).filter((l) => !this.mem.heard.has('lm:' + l.id) || this.world.landmarks.length < 5);
    const n = this.npc, p = this.world.player ?? n;
    const sorted = [...all].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    // two nearby, one far, shuffled by rng: a variety of answers every time
    const pickN = [...sorted.slice(0, 2), ...this.rng.shuffle(sorted.slice(2)).slice(0, 1)].filter(Boolean);
    return (this._lmc = pickN.slice(0, 3));
  }

  /** One discoverable thing the NPC "heard about": one of the nearest undiscovered items. */
  hint() {
    const items = [...(this.world.discoveries ?? [])].filter((d) => !d.found);
    if (!items.length) return null;
    const p = this.world.player ?? this.npc;
    items.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const pool = items.slice(0, Math.min(6, items.length));
    const d = pool[Math.floor(this.rng.next() * pool.length)];
    const dr = directionsTo({ x: d.x, y: d.y, z: d.z, name: d.name, en: d.en, kind: d.kind }, p, this.rng, { short: true });
    const intro = pickFrom([
      ['Dicen que vale la pena asomarse a', 'They say it is worth a look at'],
      ['Si le gusta lo bonito, pase por', 'If you like pretty things, drop by'],
      ['Yo que usted miraría', "If I were you I'd check out"],
    ], this.rng);
    return { es: polish(`${intro[0]} ${withArticle(d.name)}. ${dr.es}`), en: `${intro[1]} ${theEn(d.en ?? d.name, d.kind)}. ${dr.en}` };
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
