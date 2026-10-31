// How the residents take it when the player opens their drawer, their wardrobe or the till while they are in the room and can see it. PURE (no THREE, no DOM):
// it runs under Node for the tests; the world (world.js) only shows the line (subtitle + voice) through the `onReact` hook of the simulation.
//
//   sim.reactions = new Reactions(sim)    listens to ctx.events 'container:open' { id, building, kind, group, x, y, z } (interiors/containers.js, A3)
//
// Who notices: the nearest person who is awake, inside that building, on the player's storey, within REACH of the container with no room wall or shut door between,
// and who is either facing it or close enough (NEAR) to hear it. After a beat (the raised eyebrow, 0.8-1.6 s) they turn to the player and say ONE gentle line: a laugh,
// "¡Eso es privado, vecino!", an offer of coffee at the fridge. Never hostile, never two at once (GLOBAL_GAP), never the same person twice in a row (COOLDOWN), and a
// person who has been through it three times in five minutes lets it go (MAX_PER_WINDOW). Second time round the tone is a shrug ("Bueno, bueno, haga como si estuviera
// en su casa"), not a scolding. Lines are [es, en] pairs with the dialogue tokens ({vecino} {mijo}: how the PLAYER is addressed; {o|a}: the speaker's gender).
import { fillTokens, takeLine } from './dialogue.js';

const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d <= -Math.PI) d += TAU; return d; };

export const REACH = 7.5;          // metres from the person to the container
export const NEAR = 3.0;           // within this a person hears a drawer even with their back turned
export const FACING = 1.9;         // radians (about 109 degrees) either side of where they face: what they see without turning
export const COOLDOWN = 25;        // seconds before the same person reacts again
export const GLOBAL_GAP = 6;       // seconds between two reactions anywhere
export const WINDOW = 300;         // seconds: a second reaction within this is the "again" tone; MAX_PER_WINDOW within it is the limit
export const MAX_PER_WINDOW = 3;
export const BEAT = [0.8, 1.6];    // the pause before they say it

/** The pools. Each line is [es, en]; both languages say the same thing in the register of a Colombian barrio ("usted", "vecino", "plata", "tintico"). */
export const POOLS = {
  private: [                       // a nightstand, a dresser, a wardrobe, a chest, a desk, a filing cabinet
    ['¡Eso es privado, {vecino}!', "That's private, neighbour!"],
    ['Ay, {vecino}, ¿y qué anda buscando ahí?', 'Hey, neighbour, and what are you looking for in there?'],
    ['Eso no se mira sin permiso, ¿sí?', "You don't look in there without asking, okay?"],
    ['Hmm… ¿se le perdió algo?', 'Hmm… did you lose something?'],
    ['Con confianza, pero no tanta, {vecino}.', "Make yourself at home, neighbour, but not that much at home."],
    ['Ja, ja, ¡qué curiosidad la suya!', 'Ha ha, what curiosity you have!'],
    ['¡Uy! Ahí hay secretos de familia, {vecino}.', 'Whoa! There are family secrets in there, neighbour.'],
  ],
  food: [                          // the fridge, the kitchen cupboards, the pantry
    ['¿Tiene hambre, {vecino}? Sírvase con confianza.', 'Hungry, neighbour? Help yourself.'],
    ['¿Le provoca un tintico? Ya se lo sirvo.', "Fancy a little coffee? I'll pour you one right now."],
    ['Ahí hay arepas de ayer, ¡pero buenas!', "There are yesterday's arepas in there, but good ones!"],
    ['Mire, mire, que la nevera no se llena sola, ¡ja, ja!', "Look all you like, the fridge doesn't fill itself, ha ha!"],
  ],
  till: [                          // the cash drawer, said by somebody who does not keep the shop
    ['¡Uy, la caja! Eso sí que es privado, {vecino}.', 'Whoa, the till! That really is private, neighbour.'],
    ['Ja, ja, ¡si encuentra plata ahí, me avisa!', 'Ha ha, if you find any money in there, let me know!'],
    ['Ahí solo hay cambio, {vecino}, se lo aseguro.', "There's only change in there, neighbour, I promise."],
  ],
  ownerTill: [                     // the shopkeeper, at their own cash drawer
    ['¡Eh, {vecino}, esa es la caja! Si necesita cambio, me dice.', "Hey, neighbour, that's the till! If you need change, just tell me."],
    ['¿Buscando la plata? Ja, ja, yo tampoco sé dónde la dejé.', "Looking for the money? Ha ha, I don't know where I left it either."],
    ['Ojo con la libreta, {vecino}: ahí están los fiados.', "Mind the notebook, neighbour: that's where the tabs are."],
  ],
  owner: [                         // the shopkeeper, at anything else in their shop
    ['Eso lo guardo yo, {vecino}. Si busca algo, me pregunta.', "I keep that stuff, neighbour. If you're looking for something, ask me."],
    ['Ja, ja, ¡qué ojo tiene, {vecino}!', 'Ha ha, what a sharp eye you have, neighbour!'],
    ['Con cuidado, {vecino}, que eso es del negocio.', 'Careful, neighbour, that belongs to the business.'],
  ],
  display: [                       // the display cabinet, the TV stand, the living-room unit
    ['Ahí está lo mejor de la casa. ¡Con cuidado, {vecino}!', "That's the best of the house in there. Careful, neighbour!"],
    ['Mire, mire, pero no me vaya a tocar las fotos.', "Look, look, but please don't touch the photos."],
    ['Cada cosa de esas tiene su historia, {vecino}.', 'Every one of those things has a story, neighbour.'],
  ],
  meds: [                          // the clinic or pharmacy cabinet
    ['Las medicinas se miran, pero no se tocan, {vecino}.', 'The medicines are for looking at, not for touching, neighbour.'],
    ['Ahí hay de todo un poco: curitas, aspirinas, jarabes.', "There's a bit of everything in there: plasters, aspirin, syrups."],
  ],
  tools: [                         // the workshop's tool drawers
    ['Esas herramientas son para trabajar, {vecino}, no para curiosear.', 'Those tools are for working with, neighbour, not for snooping.'],
    ['Cuidado con los dedos, que algunas de esas muerden.', 'Careful with your fingers, some of those bite.'],
  ],
  locker: [                        // a school locker, said by a pupil
    ['¡Ese es mi casillero!', "That's my locker!"],
    ['¡Profe, profe, alguien está mirando mi casillero!', "Teacher, teacher, somebody's looking in my locker!"],
  ],
  elder: [                         // a grandmother or a grandfather, at anything private
    ['Ay, {mijo}, eso no se hace… pero bueno, mire, mire.', "Oh dear, that isn't done… but well, go on, have a look."],
    ['Ay, {mijo}, ahí hay cosas de hace muchos años.', 'Oh dear, there are things in there from many years ago.'],
    ['Los papeles viejos, con cariño, ¿sí, {mijo}?', 'Old papers, gently, all right, dear?'],
  ],
  kid: [                           // a child
    ['¡Eso es mío!', "That's mine!"],
    ['¡Está curioseando! ¡Está curioseando!', "You're snooping! You're snooping!"],
    ['¡Mi mamá se enoja si usted mira ahí!', 'My mum gets cross if you look in there!'],
    ['Jejeje… ¡le voy a decir a mi mamá!', "Hehehe… I'm going to tell my mum!"],
  ],
  teen: [                          // a teenager, at anything private
    ['Oiga, ¿qué hace? Eso es mío.', "Hey, what are you doing? That's mine."],
    ['Uy, no, ahí no, ¿sí?', 'Oh no, not in there, okay?'],
    ['Ja, qué atrevimiento… ¡es broma!', 'Ha, what a nerve… just kidding!'],
  ],
  again: [                         // a second or third time within five minutes: a shrug, never a scolding
    ['Bueno, bueno, haga como si estuviera en su casa.', 'All right, all right, make yourself at home.'],
    ['Ya, ya, {vecino}, que me da pena.', "Okay, okay, neighbour, you're embarrassing me."],
    ['Sí, siga no más… yo no vi nada.', 'Go on, then… I saw nothing.'],
  ],
};

/** Container group (A3's vocabulary: nightstand dresser wardrobe chest tvstand wallunit vitrine pantry kitchen fridge desk counter locker medcab toolcab filing) -> pool. */
export const POOL_OF_GROUP = {
  nightstand: 'private', dresser: 'private', wardrobe: 'private', chest: 'private', desk: 'private', filing: 'private',
  counter: 'till', fridge: 'food', kitchen: 'food', pantry: 'food', vitrine: 'display', tvstand: 'display', wallunit: 'display',
  medcab: 'meds', toolcab: 'tools', locker: 'locker',
};

/** The pool this person draws from for this container: the shopkeeper in their own shop is the owner, a child is a child, an elder is gentle about what is private. */
export function poolFor(n, group, building = null) {
  const base = POOL_OF_GROUP[group] ?? 'private';
  if (n.shopLotId && n.shopLotId === building) return base === 'till' ? 'ownerTill' : 'owner';
  if (n.age === 'kid') return base === 'locker' ? 'locker' : 'kid';
  if (base === 'locker') return n.age === 'teen' ? 'locker' : 'private';
  if (n.age === 'teen' && (base === 'private' || base === 'till')) return 'teen';
  if (n.age === 'elder' && (base === 'private' || base === 'till')) return 'elder';
  return base;
}

// Subscriptions are per event bus: a second simulation on the same bus (tests build many) replaces the first one's listeners.
const SUBS = new WeakMap();

export class Reactions {
  constructor(sim) {
    this.s = sim; this.rng = sim.rng.fork('react'); this.hist = new Map(); this.log = []; this.pending = []; this.tok = 0; this.lastAny = -1e9;
    const bus = sim.ctx?.events;
    if (bus?.on) {
      SUBS.get(bus)?.forEach((off) => off());
      SUBS.set(bus, [bus.on('container:open', (e) => this.onOpen(e)), bus.on('player:exit', (e) => this.onExit(e))]);
    }
  }

  /** Does `n` see (or hear) a container at ev.x/ev.y/ev.z being opened? `facing: false` skips the "are they looking" test (the moment they speak). */
  sees(n, ev, { facing = true } = {}) {
    const s = this.s, P = s.player;
    if (n.away || n.mode === 'talk' || n.gate || n.emerging || n.act === 'sleep') return false;       // (asleep: nobody sees or hears a drawer)
    const dx = ev.x - n.st.x, dz = ev.z - n.st.z, d = Math.hypot(dx, dz);
    if (d > REACH) return false;
    if (Math.abs(n.st.y - P.y) > 1.8) return false;                                   // upstairs or downstairs
    if (s.lotAt(n.st.x, n.st.z) !== ev.building) return false;                        // not in that building
    if (facing && d > NEAR && Math.abs(angDiff(n.ry, Math.atan2(dx, dz))) > FACING) return false;   // back turned and too far to hear
    if (s.physics.segmentBlocked(n.st.x, n.st.z, ev.x, ev.z, n.st.y + 0.3, 1.2, null, 1.5)) return false;   // a room wall or a shut door
    return true;
  }

  /** Who could notice, nearest first: [{ n, d }]. */
  witnesses(ev) {
    const out = [];
    for (const n of this.s.npcs) if (this.sees(n, ev)) out.push({ n, d: Math.hypot(ev.x - n.st.x, ev.z - n.st.z) });
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  /** `container:open`. Returns the scheduled reaction (for the tests) or null. */
  onOpen(ev) {
    const s = this.s;
    if (!s.ready || !ev || ev.building == null || !Number.isFinite(ev.x + ev.z)) return null;
    if (s.talkBusy) return null;
    const now = s.t;
    if (now - this.lastAny < GLOBAL_GAP) return null;
    for (const { n } of this.witnesses(ev)) {
      const h = this.hist.get(n.id);
      if (h && now - h.first > WINDOW) this.hist.delete(n.id);
      const hh = this.hist.get(n.id);
      if (hh && (now - hh.last < COOLDOWN || hh.n >= MAX_PER_WINDOW)) continue;
      const r = { tok: ++this.tok, npc: n, ev, cancelled: false };
      this.lastAny = now; this.pending.push(r);
      s.later(BEAT[0] + this.rng.next() * (BEAT[1] - BEAT[0]), () => this._fire(r));
      return r;
    }
    return null;
  }

  /** The player left the building: whatever was about to be said is not said. */
  onExit(e) { for (const r of this.pending) if (e?.buildingId == null || r.ev.building === e.buildingId) r.cancelled = true; }

  _fire(r) {
    const s = this.s, n = r.npc; this.pending = this.pending.filter((p) => p !== r);
    if (r.cancelled || s.talkBusy || !this.sees(n, r.ev, { facing: false })) return;
    if (Math.hypot(s.player.x - n.st.x, s.player.z - n.st.z) > REACH + 3) return;      // the player has gone away
    const now = s.t, h = this.hist.get(n.id), again = !!h && now - h.last < WINDOW;
    const pool = again ? 'again' : poolFor(n, r.ev.group, r.ev.building);
    n.mem.used ??= {}; const used = (n.mem.used['react:' + pool] ??= new Set());
    const pair = takeLine(POOLS[pool], used, this.rng);                                  // the reactions' own stream: the person's own life stream is not disturbed
    const address = s.ctx.settings?.v?.address === 'f' ? 'f' : 'm';
    const line = fillTokens({ es: pair[0], en: pair[1] }, { gender: n.gender, address, name: n.display, shopName: n.shopName });
    this.hist.set(n.id, h && again ? { n: h.n + 1, first: h.first, last: now } : { n: 1, first: now, last: now });
    n.reactTok = r.tok; n.beginTalk(s, s.player);                                         // turn to the player, stop what they were doing
    const words = line.es.split(/\s+/).length, hold = Math.max(2.4, 0.9 + words * 0.4);
    const rec = { t: +now.toFixed(2), id: n.id, name: n.display, pool, es: line.es, en: line.en, group: r.ev.group, building: r.ev.building, container: r.ev.id ?? null };
    this.log.push(rec); if (this.log.length > 200) this.log.shift();
    s.onReact?.(n, { es: line.es, en: line.en, pool, hold }, r.ev);
    s.later(hold, () => this._release(n, r.tok));
  }

  /** Back to what they were doing (unless a real conversation has taken them over). */
  _release(n, tok) {
    if (n.reactTok !== tok) return;
    n.reactTok = null;
    if (this.s.talk?.npc === n) return;
    if (n.mode === 'talk') n.endTalk(this.s);
  }
}
