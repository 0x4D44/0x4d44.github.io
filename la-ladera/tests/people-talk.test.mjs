// The conversation orchestrator (js/people/talk.js) with a stub world and the real bank: what the person was doing when the player stopped them decides the
// opening line (not the chat pose that beginTalk puts on them), a second visit is greeted as a second visit, and the tips only name public places.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-talk.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { Talk, actBefore } from '../js/people/talk.js';
import { Npc } from '../js/people/npc.js';
import { BANK } from '../js/people/lines/index.js';
import { fillTokens } from '../js/people/dialogue.js';
import { makeRng } from '../js/core/rng.js';

const T0 = 100;
function stub(o = {}) {
  const subs = [], events = [];
  const player = { lock() {}, unlock() {}, s: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, eyeY: 1.6 };
  const ctx = { player, hour: o.hour ?? 10, settings: null, events: { emit: (n, d) => events.push([n, d]) }, discover: o.discover ?? null, ui: { subtitle: (s) => subs.push(s), toast() {} } };
  const w = { ctx, t: T0, svc: { t: T0, doors: null }, player: { x: 0, z: 0, isPlayer: true }, landmarks: o.landmarks ?? [], syncPlayer() {}, ui: { show() {}, hide() {}, setChoices() {} }, speech: { speak: () => ({}), cancel() {}, estimate: () => 1000 } };
  return { w, ctx, subs, events, talk: new Talk(w) };
}
function person(o = {}) {
  const persona = o.persona ?? 'panaderia';
  const n = new Npc({ id: o.id ?? 'n1', name: { display: o.display ?? 'Don Jorge', full: o.display ?? 'Don Jorge' }, persona, bank: persona, age: o.age ?? 'adult', gender: o.gender ?? 'm', shopName: o.shopName ?? null, rng: makeRng(o.seed ?? 1).fork('n') });
  n.place(o.x ?? 0, 0, o.z ?? -1.5, 0);
  n.stand({ t: T0 }, o.act ?? 'idle', 60, null, null);
  return n;
}
/** Every filled line of a pool (persona pool first, as the dialogue does), as Spanish text. */
const poolEs = (persona, key, o = {}) => {
  const pool = BANK.personas[persona]?.[key] ?? BANK.shared[key] ?? [];
  return new Set(pool.map(([es, en]) => fillTokens({ es, en }, { gender: o.gender ?? 'm', address: 'm', name: o.display ?? 'Don Jorge', shopName: o.shopName ?? null }).es));
};
/** The first line said when the player stops `mk()`; the conversation is left again so the next one starts fresh. */
function opener(mk, { visits = 1, hour } = {}) {
  const s = stub({ hour }), n = mk(); let first = null;
  for (let k = 0; k < visits; k++) { assert.equal(s.talk.begin(n), true); first = s.subs.at(-1).es; if (k < visits - 1) s.talk.leave(); }
  return first;
}

test('a lone shopkeeper at the counter opens with the sell line or a greeting, never with the chat line', () => {
  const chat = poolEs('panaderia', 'act_talk', { shopName: 'Panadería La Esperanza' }), sell = poolEs('panaderia', 'act_sell', { shopName: 'Panadería La Esperanza' });
  assert.ok(chat.size >= 2 && sell.size >= 1);
  const got = new Map();
  for (let seed = 1; seed <= 80; seed++) {
    const es = opener(() => person({ seed, act: 'sell', shopName: 'Panadería La Esperanza' }));
    assert.ok(!chat.has(es), `a man alone behind his counter says "${es}" (seed ${seed})`);
    got.set(sell.has(es) ? 'sell' : 'greeting', (got.get(sell.has(es) ? 'sell' : 'greeting') ?? 0) + 1);
  }
  assert.ok((got.get('sell') ?? 0) >= 30, `the sell line shows up in about 60 % of the openings (${JSON.stringify([...got])})`);
  assert.ok((got.get('greeting') ?? 0) >= 10, 'and the greeting of the hour in the others');
});

test('what they were doing: every act has its own opening line, and the two halves of a neighbours\' chat both say they were chatting', () => {
  const acts = ['sweep', 'phone', 'sit', 'cook', 'lean', 'carry', 'laundry', 'read', 'pray', 'wait', 'play', 'fidget', 'bounce', 'class'];
  for (const act of acts) {
    const lines = poolEs('vecina', 'act_' + act, { gender: 'f', display: 'Doña Rosa' }); assert.ok(lines.size >= 1, `a pool for act_${act}`);
    let hit = 0;
    for (let seed = 1; seed <= 60; seed++) if (lines.has(opener(() => person({ persona: 'vecina', gender: 'f', display: 'Doña Rosa', seed, act })))) hit++;
    assert.ok(hit >= 20, `act ${act}: its line opens ${hit}/60 conversations`);
  }
  for (const act of ['talk', 'listen']) {
    const lines = poolEs('vecina', 'act_talk', { gender: 'f', display: 'Doña Rosa' });
    let hit = 0;
    for (let seed = 1; seed <= 60; seed++) if (lines.has(opener(() => person({ persona: 'vecina', gender: 'f', display: 'Doña Rosa', seed, act })))) hit++;
    assert.ok(hit >= 20, `act ${act}: the chat line opens ${hit}/60 conversations`);
  }
  for (const act of ['idle', 'walk', 'wave', 'point']) {
    for (let seed = 1; seed <= 30; seed++) {
      const es = opener(() => person({ persona: 'vecina', gender: 'f', display: 'Doña Rosa', seed, act }));
      for (const k of Object.keys(BANK.shared).filter((q) => q.startsWith('act_'))) assert.ok(!poolEs('vecina', k, { gender: 'f', display: 'Doña Rosa' }).has(es), `act ${act} opened with a line of ${k}: ${es}`);
    }
  }
});

test('somebody already stopped (a remark to the player, a second press of E): the opener still comes from what they were doing before', () => {
  const chat = poolEs('panaderia', 'act_talk', { shopName: 'Panadería La Esperanza' });
  for (let seed = 1; seed <= 40; seed++) {
    const n = person({ seed, act: 'sell', shopName: 'Panadería La Esperanza' }), s = stub();
    n.beginTalk(s.w.svc, s.w.player);                                            // what the reactions of the people do before the player answers
    assert.equal(n.mode, 'talk'); assert.equal(n.act, 'talk');
    assert.equal(s.talk.begin(n), true);
    assert.ok(!chat.has(s.subs.at(-1).es), `"${s.subs.at(-1).es}" (seed ${seed})`);
  }
  assert.equal(actBefore({ mode: 'talk', act: 'talk', prevMode: { act: 'sweep' } }), 'sweep'); assert.equal(actBefore({ mode: 'talk', act: 'talk', prevMode: null }), 'idle');
  assert.equal(actBefore({ mode: 'idle', act: 'listen' }), 'talk'); assert.equal(actBefore({ mode: 'walk', act: 'walk' }), 'walk');
});

test('the tips of a conversation come from the discoveries of the world: the ones inside a home are never told', () => {
  const items = new Map();
  for (const d of [
    { id: 'x:7', name: 'Los Tornillos por unidad', en: 'Screws by the unit, counted out of a jar.', kind: 'object', building: 'L05', x: 1, y: 0, z: -3 },       // only `building` says it is private
    { id: 'w.cruz', name: 'La Cruz de la Cumbre', en: 'The summit cross, lit all night: the whole barrio steers by it.', kind: 'vista', x: 30, y: 10, z: -40 },
  ]) items.set(d.id, d);
  const discover = { items, found: new Set() };
  let told = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = stub({ discover }), n = person({ seed, act: 'idle' });
    assert.equal(s.talk.begin(n), true); s.talk.pick('tip');
    const es = s.subs.at(-1).es;
    assert.doesNotMatch(es, /Tornillos/, es); if (/Cruz de la Cumbre/.test(es)) told++;
    assert.doesNotMatch(es, /Fíjese en|Vale la pena mirar/, `a view is not told like a thing: ${es}`);              // the kind of the discovery reaches the dialogue
  }
  assert.equal(told, 40, 'the public one is the tip, every time');
});

test('the second visit opens with the again line, the third too (the line about what they were doing is for the first time)', () => {
  const again = poolEs('panaderia', 'again', { shopName: 'Panadería La Esperanza' });
  let second = 0, third = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const n = person({ seed, act: 'sell', shopName: 'Panadería La Esperanza' }), s = stub();
    s.talk.begin(n); s.talk.leave();
    assert.equal(n.act, 'sell', 'after the chat they are selling again');
    s.talk.begin(n); if (again.has(s.subs.at(-1).es)) second++; s.talk.leave();
    s.talk.begin(n); if (again.has(s.subs.at(-1).es)) third++; s.talk.leave();
    assert.ok(n.mem.met === 3, 'they remember the visits');
  }
  assert.ok(second >= 45, `${second}/60 second visits open with an again line`);
  assert.ok(third >= 45, `${third}/60 third visits open with an again line`);
});

test('R3-020: the age of the person reaches the conversation: a teenager is never given a parent\'s family line, a grown woman is once her own are used up', () => {
  const PARENT = /Los muchachos crecen volando|Mis hijos se fueron a trabajar/;
  const family = (persona, age, gender) => {
    const out = [];
    for (let seed = 1; seed <= 10; seed++) {
      const s = stub(), n = person({ persona, age, gender, seed, display: 'Alguien' });
      for (let k = 0; k < 10; k++) { assert.equal(s.talk.begin(n), true); s.talk.pick('family'); out.push(s.subs.at(-1).es); s.talk.leave(); }
    }
    return out;
  };
  assert.ok(family('vecina', 'adult', 'f').some((l) => PARENT.test(l)), 'control: the line exists and a grown woman says it');
  assert.ok(!family('adolescente', 'teen', 'm').some((l) => PARENT.test(l)), 'a teenager is not a parent');
});

test('R3-022: the places told are remembered across talks: by the person (in their own memory) and by the barrio (in the session): nobody is sent twice to the same place in a row', () => {
  const PLACES = [
    { id: 'w.cruz', name: 'La Cruz de la Cumbre', en: 'The summit cross.', kind: 'vista', x: 30, y: 10, z: -40, re: /Cruz de la Cumbre/ },
    { id: 'w.virgen', name: 'La Virgen del Carmen', en: "A neighbours' shrine.", kind: 'shrine', x: 20, y: 10, z: 22, re: /Virgen del Carmen/ },
    { id: 'w.cancha', name: 'La Cancha El Cerro', en: 'The futsal court.', kind: 'story', x: -25, y: 10, z: 30, re: /Cancha El Cerro/ },
    { id: 'w.rayuela', name: 'La rayuela', en: 'A hopscotch in chalk.', kind: 'object', x: -5, y: 10, z: -6, re: /rayuela/ },
    { id: 'w.perro', name: 'El perro dormido', en: 'A street dog asleep in the sun.', kind: 'nature', x: 16, y: 10, z: 12, re: /perro dormido/ },
    { id: 'w.fiesta', name: 'El mural de la Fiesta de la Ladera', en: 'A mural.', kind: 'mural', x: -40, y: 10, z: 35, re: /Fiesta de la Ladera/ },
  ];
  const discover = { items: new Map(PLACES.map((p) => [p.id, p])), found: new Set() };
  const asked = (s, n) => { assert.equal(s.talk.begin(n), true); s.talk.pick('tip'); const es = s.subs.at(-1).es; s.talk.leave(); return PLACES.filter((p) => p.re.test(es)).map((p) => p.id).join('+'); };
  for (let seed = 1; seed <= 30; seed++) {
    // five different people, one after the other in one session: five different places (the barrio does not send everybody to the same mural)
    const t = stub({ discover }), many = [0, 1, 2, 3, 4].map((k) => asked(t, person({ seed: seed * 5 + k, id: 'n' + k })));
    assert.ok(many.every((m) => m), 'every one of them named a place');
    assert.equal(new Set(many).size, 5, `five different people in one session: ${many}`);
    // one person is told a place, then five others are asked (the barrio has forgotten it by then) and the first is asked again: not the same place (their own memory)
    const s = stub({ discover }), a = person({ seed, id: 'a' }), first = asked(s, a);
    for (let k = 0; k < 5; k++) asked(s, person({ seed: seed * 9 + k, id: 'o' + k }));
    assert.notEqual(asked(s, a), first, `seed ${seed}: the same person was sent to ${first} twice`);
  }
});
