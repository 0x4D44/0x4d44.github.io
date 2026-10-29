// Conversation engine. PURE logic (no DOM, no THREE): the UI (ui.js) renders what this returns, the tests drive it directly.
//
//   const d = new Dialogue({ npc, bank, rng, hour, world });   // npc: { id, persona, name, mem:{...}, act?, shopName? }
//   let step = d.open();            // { line:{es,en}, choices:[{id,es,en}], end:false }
//   step = d.pick('job');           // NPC answer + a fresh menu (no repeated lines inside one conversation)
//   step = d.pick('bye');           // { line, choices:[], end:true }
//
// Bank shape (see lines/*.js): bank.shared = pools; bank.personas[id] = pools + { topics:[...], menu:{topic:[es,en]}, items:[...] }.
// A pool is an array of [es, en] pairs. Every NPC keeps `mem.used[pool]` = Set of line indices already said (across conversations too),
// so a second chat first shows lines not heard yet; a line is never repeated inside one conversation.
//
// Special topics handled here (not pools): 'where' (directions via world.landmarks), 'tip' (hint from undiscovered items), 'time' (clock),
// 'buy' (persona.items: a small purchase menu, emits no state - the caller may listen to step.buy), 'bye'.

export const period = (h) => (h >= 5 && h < 12 ? 'm' : h >= 12 && h < 18 ? 'a' : h >= 18 && h < 22 ? 'e' : 'n');

export const TOPIC_MENU = {
  mood:   ['¿Cómo va todo por aquí?', 'How is everything going here?'],
  job:    ['¿A qué se dedica usted?', 'What do you do for a living?'],
  wares:  ['¿Qué me recomienda hoy?', 'What do you recommend today?'],
  barrio: ['Cuénteme del barrio.', 'Tell me about the neighbourhood.'],
  family: ['¿Y su familia?', 'And your family?'],
  news:   ['¿Qué se cuenta por ahí?', 'What is the news around here?'],
  tip:    ['¿Algo que valga la pena ver?', 'Anything worth seeing?'],
  where:  ['¿Me indica cómo llegar a un sitio?', 'Can you tell me how to get somewhere?'],
  time:   ['¿Qué hora es, por favor?', 'What time is it, please?'],
  buy:    ['Quisiera comprar algo.', 'I would like to buy something.'],
  bye:    ['Hasta luego, muchas gracias.', 'See you later, thank you.'],
};
const BASE_TOPICS = ['mood', 'job', 'barrio', 'family', 'news', 'tip', 'where', 'time'];
const FALLBACK_MENU = ['Cuénteme algo más.', 'Tell me something more.'];

const pickFrom = (arr, rng) => arr[Math.floor(rng.next() * arr.length)];

/** Unused-first line pick from a pool; marks it used. Returns [es,en] or null for an empty pool. */
export function takeLine(pool, used, rng) {
  if (!pool?.length) return null;
  let free = []; for (let i = 0; i < pool.length; i++) if (!used.has(i)) free.push(i);
  if (!free.length) { used.clear(); free = pool.map((_, i) => i); }          // pool exhausted: start over (never inside one conversation: see Dialogue._say)
  const i = free[Math.floor(rng.next() * free.length)]; used.add(i); return pool[i];
}

// ---- the clock, said the Colombian way ------------------------------------------------------------------------------------------------
const HOUR_ES = ['doce', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once'];
const MIN_ES = { 5: 'y cinco', 10: 'y diez', 15: 'y cuarto', 20: 'y veinte', 25: 'y veinticinco', 30: 'y media', 35: 'menos veinticinco', 40: 'menos veinte', 45: 'menos cuarto', 50: 'menos diez', 55: 'menos cinco' };
/** Spanish + English clock phrase for an hour of the day (0..24, fractional). Rounds to 5 minutes. */
export function clockLine(h) {
  const ticks = Math.round((((h % 24) + 24) % 24) * 12) % 288;       // five-minute ticks since midnight (288 per day)
  const hh = Math.floor(ticks / 12), mm = (ticks % 12) * 5;
  if (hh === 0 && mm === 0) return { es: 'Es la medianoche en punto.', en: 'It is midnight on the dot.' };
  const target = mm > 30 ? (hh + 1) % 24 : hh;                       // Spanish counts "menos" towards the next hour
  const h12 = target % 12;
  const part = target < 5 ? 'de la madrugada' : target < 12 ? 'de la mañana' : target === 12 ? 'del día' : target < 19 ? 'de la tarde' : 'de la noche';
  const lead = h12 === 1 ? 'Es la una' : `Son las ${HOUR_ES[h12]}`;
  const es = `${lead} ${mm === 0 ? 'en punto' : MIN_ES[mm]} ${part}.`;
  const eh = hh % 12 || 12, epart = hh < 5 ? 'at night' : hh < 12 ? 'in the morning' : hh === 12 && mm === 0 ? 'at noon' : hh < 19 ? 'in the afternoon' : 'at night';
  const en = mm === 0 ? `It is ${eh} o'clock ${epart}.` : `It is ${eh}:${String(mm).padStart(2, '0')} ${epart}.`;
  return { es, en };
}

const DIRS = {
  front: ['todo derecho', 'recto, de frente'], right: ['a mano derecha', 'a su derecha'], left: ['a mano izquierda', 'a su izquierda'],
  back: ['por donde usted venía', 'para atrás'],
};
const DIR_EN = { front: 'straight ahead', right: 'on your right', left: 'on your left', back: 'back the way you came' };

/** Spanish + English walking directions from (px,pz) facing `yaw` (camera convention: yaw 0 looks toward -z) to a landmark. */
export function directionsTo(lm, p, rng) {
  const dx = lm.x - p.x, dz = lm.z - p.z, d = Math.hypot(dx, dz);
  const fx = -Math.sin(p.yaw ?? 0), fz = -Math.cos(p.yaw ?? 0);                 // forward in the XZ plane (x east, z south)
  const rx = -fz, rz = fx;                                                     // right-hand vector: forward rotated 90 deg clockwise seen from above
  const dot = fx * dx + fz * dz, side = rx * dx + rz * dz;
  const ang = Math.atan2(side, dot) * 180 / Math.PI;                           // 0 = ahead, +90 = right, -90 = left
  const a = Math.abs(ang);
  const dir = a < 28 ? 'front' : a > 125 ? 'back' : ang > 0 ? 'right' : 'left';
  const dy = (lm.y ?? p.y ?? 0) - (p.y ?? 0);
  const hill = dy > 3 ? ['cuesta arriba', 'uphill'] : dy < -3 ? ['cuesta abajo', 'downhill'] : ['más o menos al mismo nivel', 'about the same level'];
  const dist = d < 18 ? ['ahí no más', 'right there'] : d < 45 ? ['a una cuadra larga', 'about a block away'] : d < 90 ? ['como a dos cuadras', 'a couple of blocks away'] : ['bien lejos, por allá arriba y abajo', 'quite far'];
  const dn = DIRS[dir][Math.floor((rng?.next() ?? 0) * 2) % 2];
  const es = dir === 'back'
    ? `${lm.name} queda ${hill[0]}, ${dist[0]}, ${dn}. Se devuelve y sigue.`
    : `Mire, ${lm.name} queda ${hill[0]}, ${dist[0]}, ${dn}.`;
  const en = `${lm.en ?? lm.name} is ${hill[1]}, ${dist[1]}, ${DIR_EN[dir]}.`;
  return { es, en, dir, dist: d };
}

export class Dialogue {
  /**
   * opts: { npc, bank, rng, hour, world:{ landmarks, discoveries, player:{x,y,z,yaw} } }
   * npc.mem is created on first use: { met, lastHour, used:{pool:Set}, heard:Set }
   */
  constructor({ npc, bank, rng, hour = 12, world = {} }) {
    this.npc = npc; this.bank = bank; this.rng = rng; this.hour = hour; this.world = world;
    this.persona = bank.personas?.[npc.persona] ?? {}; this.shared = bank.shared ?? {};
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

  _tokens(line) {
    if (!line) return line;
    const n = this.npc, fem = n.gender === 'f';
    // {nombre} {shop} {barrio}; {dueño|dueña} picks the masculine / feminine form by the speaker's gender
    const rep = (s) => s.replaceAll('{nombre}', n.name ?? '').replaceAll('{shop}', n.shopName ?? 'la tienda').replaceAll('{barrio}', 'La Ladera')
      .replace(/\{([^{}|]+)\|([^{}|]+)\}/g, (_, m, w) => (fem ? w : m));
    return { ...line, es: rep(line.es), en: rep(line.en) };
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

  entry(t) {
    const m = this.persona.menu?.[t] ?? TOPIC_MENU[t] ?? FALLBACK_MENU;
    const again = this.topicsDone.has(t) && !['where', 'tip', 'time', 'buy'].includes(t);
    return { id: t, es: again ? 'Cuénteme algo más sobre eso.' : m[0], en: again ? 'Tell me something more about that.' : m[1] };
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
    const dr = directionsTo({ x: d.x, y: d.y, z: d.z, name: d.name, en: d.en }, p, this.rng);
    const intro = pickFrom([
      ['Dicen que vale la pena asomarse a', 'They say it is worth a look at'],
      ['Si le gusta lo bonito, pase por', 'If you like pretty things, drop by'],
      ['Yo que usted miraría', 'If I were you I would check out'],
    ], this.rng);
    return { es: `${intro[0]} ${d.name}. ${dr.es.replace(/^Mire, /, '')}`, en: `${intro[1]} ${d.en ?? d.name}. ${dr.en}` };
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
      const dr = lm ? directionsTo(lm, p, this.rng) : { es: 'Pues, no sé decirle.', en: 'Well, I could not tell you.' };
      return { line: dr, choices: this.menu(), end: false };
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
    if (!line) line = { es: 'Pues… mire, de eso no sé mucho.', en: 'Well… look, I do not know much about that.' };
    return { line: this._tokens(line), choices: this.menu(), end: false };
  }
}
