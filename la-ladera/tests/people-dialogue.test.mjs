// The conversation engine: Spanish typography helpers (articles, a+el, clock, directions), the flow of a conversation (menus, no repeats, buying, where,
// goodbye, memory across chats) and how the player is addressed (settings.address).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-dialogue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BANK } from '../js/people/lines/index.js';
import { Dialogue, withArticle, theEn, polish, clockLine, directionsTo, period, takeLine, inWindow, lineFits, fillTokens, newLineMemory } from '../js/people/dialogue.js';
import { PERSONAS } from '../js/people/personas.js';
import { collectLandmarks } from '../js/people/sim.js';
import { makeRng } from '../js/core/rng.js';
import { buildData } from './headless.mjs';

const LM = [
  { id: 'mirador', name: 'Mirador del Cielo', en: 'Sky Viewpoint', kind: 'viewpoint', x: 26, y: 29, z: -91 },
  { id: 'cancha', name: 'Cancha El Cerro', en: 'El Cerro Court', kind: 'court', x: -58, y: 0, z: 77 },
  { id: 'capilla', name: 'Capilla de la Virgen del Carmen', en: 'Chapel of Our Lady of Mount Carmel', kind: 'chapel', x: 4, y: 10, z: -67 },
];
const here = { x: 0, y: 2, z: 0, yaw: 0 };
const dlg = (persona, o = {}) => new Dialogue({
  npc: { id: o.id ?? 'n1', persona, name: o.name ?? 'Rosa', gender: o.gender ?? 'f', mem: o.mem ?? null, shopName: o.shopName, act: o.act },
  bank: BANK, rng: makeRng(o.seed ?? 7), hour: o.hour ?? 10, world: { landmarks: LM, player: here, discoveries: o.discoveries ?? [] }, address: o.address ?? 'm',
});

test('withArticle: every landmark and shop name of the real plan gets the right article', async () => {
  const want = {
    'Mirador del Cielo': 'el', 'Calle del Sol': 'la', 'Calle del Comercio': 'la', 'Paseo de la Virgen': 'el', 'Callejón de los Faroles': 'el', 'Escalinata de la Virgen': 'la',
    'Plazoleta de la Virgen': 'la', 'Plazoleta de los Almendros': 'la', 'Plazoleta de la Capilla': 'la', 'Cancha El Cerro': 'la', 'Capilla de la Virgen del Carmen': 'la',
    'Escuela El Cerro': 'la', 'Puesto de Salud El Cerro': 'el', 'Salón Comunal Los Almendros': 'el', 'Taller de Motos El Rayo': 'el', 'Panadería La Esperanza': 'la', 'Parada del Bus': 'la',
    'Tienda El Vecino': 'la', 'Fruver Los Andes': 'el', 'Carnicería La Ternera': 'la', 'Barbería El Corte Fino': 'la', 'Papelería La Plumita': 'la', 'Droguería La Salud': 'la',
    'Café La Ladera': 'el', 'Corrientazo Doña Lucía': 'el', 'Cabinas La Ladera': 'las', 'Zapatería El Remiendo': 'la', 'Tienda Doña Rosa': 'la', 'Modistería Hilos de Oro': 'la', 'Ferretería Don Hernando': 'la',
  };
  for (const [name, art] of Object.entries(want)) assert.equal(withArticle(name), `${art} ${name}`, name);
  const { plan } = await buildData({ furnish: false, colliders: false });
  for (const l of plan.landmarks) assert.ok(/^(el|la|los|las) /.test(withArticle(l.name)), l.name);
  // every shop name the world can make (both pools of js/world/names.js, not only the ones this seed drew): the article follows the generic first word, written down here by hand
  const HEAD = {
    Panadería: 'la', Pan: 'el', Fruver: 'el', Frutas: 'las', Verduras: 'las', Carnicería: 'la', Carnes: 'las', Peluquería: 'la', Barbería: 'la', Salón: 'el', Ferretería: 'la', Depósito: 'el',
    Droguería: 'la', Café: 'el', Tinto: 'el', Cafetería: 'la', Restaurante: 'el', Corrientazo: 'el', Asadero: 'el', Papelería: 'la', Minutos: 'los', Internet: 'el', Cabinas: 'las',
    Modistería: 'la', Confecciones: 'las', Arreglos: 'los', Zapatería: 'la', Remontadora: 'la', Taller: 'el', Mecánica: 'la', Tienda: 'la', Miscelánea: 'la', Minimercado: 'el',
  };
  const namesSrc = readFileSync(new URL('../js/world/names.js', import.meta.url), 'utf8');
  const pools = ['SHOP', 'SHOP_MORE'].flatMap((k) => [...(new RegExp(`const ${k} = \\{([\\s\\S]*?)\\n\\};`).exec(namesSrc)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
  assert.ok(pools.length >= 90, `${pools.length} shop names in the pools of names.js`);
  for (const name of new Set([...pools, ...plan.lots.filter((x) => x.shop).map((l) => l.name)])) {
    const art = want[name] ?? HEAD[name.split(/\s+/)[0]];
    assert.ok(art, `the first word of the shop name '${name}' is not in the article table of this test: decide its article`);
    assert.equal(withArticle(name), `${art} ${name}`, name);
  }
  assert.equal(withArticle('el Parque'), 'el Parque', 'a name that carries its article keeps it');
  assert.equal(theEn('Sky Viewpoint', 'viewpoint'), 'the Sky Viewpoint'); assert.equal(theEn('Calle del Sol', 'street'), 'Calle del Sol');
});

test('polish: a + el, de + el, capital after a full stop, no doubled blanks; proper names keep "El"', () => {
  assert.equal(polish('Bienvenido a el Café La Ladera'), 'Bienvenido al Café La Ladera');
  assert.equal(polish('Vengo de el pueblo.'), 'Vengo del pueblo.');
  assert.equal(polish('Suba por ahí. queda cerca.  Y ya'), 'Suba por ahí. Queda cerca. Y ya');
  assert.equal(polish('¿Dónde queda? ¡ahí no más!'), '¿Dónde queda? ¡Ahí no más!');
  assert.equal(polish('Vaya a El Progreso, y de El Cerro baje.'), 'Vaya a El Progreso, y de El Cerro baje.');
  assert.equal(polish('Pues… mire, de eso no sé.'), 'Pues… mire, de eso no sé.');
});

test('clockLine says the time the Colombian way', () => {
  const es = (h) => clockLine(h).es;
  assert.equal(es(0), 'Es medianoche en punto.');
  assert.equal(es(1), 'Es la una en punto de la madrugada.');
  assert.equal(es(5), 'Son las cinco en punto de la mañana.');
  assert.equal(es(8.5), 'Son las ocho y media de la mañana.');
  assert.equal(es(12), 'Son las doce en punto del día.');
  assert.equal(es(13.25), 'Es la una y cuarto de la tarde.');
  assert.equal(es(17.75), 'Son las seis menos cuarto de la tarde.');
  assert.equal(es(19.5), 'Son las siete y media de la noche.');
  assert.equal(es(22.2), 'Son las diez y diez de la noche.');
  assert.equal(es(23.92), 'Son las doce menos cinco de la noche.');
  assert.equal(es(0.5), 'Son las doce y media de la madrugada.');
  assert.equal(clockLine(17.2).en, "It's 5:10 in the afternoon.");
  assert.equal(clockLine(9).en, "It's 9 o'clock in the morning.");
});

test('directionsTo: side, distance, uphill and the article of the place', () => {
  const rng = makeRng(3);
  const at = (x, z, yaw = 0, y = 2) => directionsTo({ name: 'Mirador del Cielo', en: 'Sky Viewpoint', kind: 'viewpoint', x, y: 2, z }, { x: 0, y, z: 0, yaw }, rng);
  assert.equal(at(0, -50).dir, 'front'); assert.equal(at(50, 0).dir, 'right'); assert.equal(at(-50, 0).dir, 'left'); assert.equal(at(0, 50).dir, 'back');
  assert.equal(at(0, -50, Math.PI / 2).dir, 'right', 'turning left by 90 degrees puts a place that was straight ahead on the right');
  const d = at(0, -50); assert.match(d.es, /^Mire, el Mirador del Cielo queda /); assert.doesNotMatch(d.es, / a el | de el /);
  assert.match(directionsTo({ name: 'Calle del Sol', en: 'Sun Street', kind: 'street', x: 0, y: 2, z: -60 }, here, rng).es, /la Calle del Sol queda/);
  const hill = directionsTo({ name: 'Capilla', en: 'Chapel', x: 0, y: 12, z: -60 }, here, rng); assert.match(hill.es, /cuesta arriba/); assert.match(hill.en, /uphill/);
  const down = directionsTo({ name: 'Capilla', en: 'Chapel', x: 0, y: -8, z: -60 }, here, rng); assert.match(down.es, /cuesta abajo/);
  const short = directionsTo(LM[0], here, rng, { short: true }); assert.match(short.es, /^Queda /); assert.ok(!short.es.includes('Mirador'));
  assert.match(directionsTo(LM[0], here, rng).es, /^Mire, /);
  assert.ok(directionsTo({ name: 'Cancha', x: 3, y: 2, z: -4 }, here, rng).es.includes('ahí no más'));
});

test('directionsTo: the verb agrees with what is told (R3-202): Queda / Quedan, Está / Están for an animal, English It\'s / They\'re; the full answer too', () => {
  const rng = makeRng(5), almendros = { name: 'Los Almendros', en: 'the almond trees', kind: 'nature', x: 0, y: 2, z: -30 }, behind = { ...almendros, z: 30 };
  const say = (o, lm = almendros) => directionsTo(lm, here, rng, { short: true, ...o });
  for (const [o, es, en] of [[{}, /^Queda /, /^It's /], [{ plural: true }, /^Quedan /, /^They're /], [{ estar: true }, /^Está /, /^It's /], [{ estar: true, plural: true }, /^Están /, /^They're /]]) {
    assert.match(say(o).es, es, JSON.stringify(o)); assert.match(say(o).en, en, JSON.stringify(o)); assert.match(say(o, behind).es, new RegExp(es.source + '.*Se devuelve'), 'behind the visitor: ' + JSON.stringify(o));
  }
  assert.match(directionsTo(almendros, here, rng, { plural: true }).es, /^Mire, los Almendros quedan /); assert.match(directionsTo(almendros, here, rng, { plural: true }).en, /^The almond trees are /);
  assert.match(directionsTo(almendros, here, rng, { plural: true, estar: true }).es, /^Mire, los Almendros están /); assert.match(directionsTo(almendros, here, rng).es, /^Mire, los Almendros queda /, 'a caller who says nothing gets the old singular answer');
  assert.match(directionsTo(behind, here, rng, { plural: true }).es, /^Los Almendros quedan .*Se devuelve/);
});

test('a conversation: greeting by hour, menu of <= 4 with a goodbye, never the same line twice, then a goodbye that ends it', () => {
  for (const [hour, key] of [[8, 'greet_m'], [15, 'greet_a'], [20, 'greet_e'], [2, 'greet_n']]) {
    assert.equal(period(hour), key.slice(-1));
    const d = dlg('tienda', { hour, seed: 11, shopName: 'Tienda El Vecino', gender: 'm' });
    const s = d.open(); assert.ok(s.line.es.length > 3 && s.line.en.length > 3);
    assert.ok(s.choices.length >= 2 && s.choices.length <= 4, `${s.choices.length} choices`);
    assert.ok(s.choices.some((c) => c.id === 'bye'), 'no way to say goodbye');
  }
  const d = dlg('vecina', { seed: 5 }), said = new Set(); let s = d.open(); said.add(s.line.es);
  for (let k = 0; k < 25 && !s.end; k++) {
    const pick = s.choices.find((c) => c.id !== 'bye' && c.id !== 'where' && c.id !== 'back'); if (!pick) break;       // topics used up: only the goodbye is left
    s = d.pick(pick.id); if (!s.line) break;
    assert.ok(!said.has(s.line.es) || /^\d|hora|Son las|Es la/.test(s.line.es), `repeated inside one conversation: ${s.line.es}`); said.add(s.line.es);
  }
  const end = d.pick('bye'); assert.equal(end.end, true); assert.equal(end.choices.length, 0); assert.ok(end.line.es);
  assert.equal(d.pick('mood').end, true, 'after goodbye the conversation stays closed');
});

test('memory: the second chat says "again" lines and uses fresh pool lines first', () => {
  const mem = { met: 0, lastHour: null, used: {}, heard: new Set() }, seen = new Set();
  for (let chat = 0; chat < 3; chat++) {
    const d = dlg('panaderia', { mem, seed: 20 + chat, shopName: 'Panadería La Esperanza' }); const s = d.open();
    if (chat > 0) assert.ok(mem.met === chat + 1);
    const m = d.pick('mood'); assert.ok(!seen.has(m.line.es) || BANK.personas.panaderia.mood.length < 3, 'a mood line repeated across chats before the pool ran out'); seen.add(m.line.es);
    d.pick('bye');
  }
  assert.equal(mem.met, 3);
});

test('where: the menu lists landmarks (nearest first), the answer names the place with its article and says which way', () => {
  const d = dlg('vecino', { gender: 'm', seed: 9 }); d.open();
  const w = d.pick('where'); assert.ok(w.choices.length >= 3 && w.choices.some((c) => c.id === 'back'));
  assert.match(w.choices[0].id, /^lm:/);
  const a = d.pick(w.choices[0].id); assert.match(a.line.es, /^(Mire, )?(el|la|los|las) |^(El|La|Los|Las) /); assert.doesNotMatch(a.line.es, / a el | de el /);
  assert.ok(a.choices.length >= 2, 'the menu comes back after directions');
});

test('buying: a shop sells, the reply carries the price and the step reports the purchase', () => {
  const d = dlg('cafe', { gender: 'f', shopName: 'Café La Ladera', seed: 4 }); const s = d.open();
  assert.equal(s.choices[0].id, 'buy', 'a shop offers the purchase first');
  const b = d.pick('buy'); assert.ok(b.choices.length >= 3 && b.choices.some((c) => c.id.startsWith('item:')));
  const it = d.pick(b.choices.find((c) => c.id.startsWith('item:')).id);
  assert.ok(it.buy && it.buy.price > 0 && it.buy.name?.length === 2, JSON.stringify(it.buy)); assert.match(it.line.es, /pesos/);
  assert.ok(!it.choices.some((c) => c.id.startsWith('item:')), 'back at the main menu after a purchase');
});

test('the hint no longer says "a el" and starts every sentence with a capital', () => {
  const disc = [{ id: 'd1', name: 'Mirador del Cielo', en: 'Sky Viewpoint', kind: 'viewpoint', x: 26, y: 29, z: -91, found: false }];
  for (let seed = 1; seed <= 12; seed++) {
    const d = dlg('vecino', { gender: 'm', discoveries: disc, seed }); d.open();
    const t = d.pick('tip'); assert.ok(t.line, 'a hint');
    if (!/Mirador/.test(t.line.es)) continue;                                    // the pool line instead of the discovery hint
    assert.doesNotMatch(t.line.es, / a el | de el /, t.line.es); assert.doesNotMatch(t.line.es, /\. [a-záéíóúñ]/, t.line.es); assert.match(t.line.es, /el Mirador del Cielo|al Mirador del Cielo/);
    assert.match(t.line.es, /(Queda|queda) /); return;
  }
  assert.fail('no seed produced the discovery hint');
});

// ---- the tips ("anything worth seeing?"): public places only, short names, said by kind ----------------------------------------------------------------
const LONG = 'The big bed was a wedding gift; a heart is scratched into the headboard.';
const D = (id, name, en, kind, x, z, o = {}) => ({ id, name, en, kind, x, y: 2, z, found: false, ...o });
const PRIVATE = [
  D('int:L02:3', 'La cama de matrimonio', LONG, 'story', 1, -3, { building: 'L02' }),
  D('x:7', 'Los Tornillos por unidad', 'Screws by the unit, counted out of a jar.', 'object', 2, -4, { building: 'L05' }),                       // a building says so, whatever its id
  D('int:L09:1', 'El cuarto del hijo mayor', 'The eldest son kept his football cards under the mattress.', 'story', 3, -2),                         // the id says so, whatever else is missing
  D('cont:L02:k:1', 'El escurridor', 'A dish rack with one plate that nobody dares to wash.', 'object', 2, -2, { building: 'L02' }),
  D('find:1', 'El peine de carey', 'A tortoiseshell comb.', 'hallazgo', 1, -1),
];
const PUBLIC = [
  D('w.cruz', 'La Cruz de la Cumbre', 'The summit cross, lit all night: the whole barrio steers by it.', 'vista', 30, -40),
  D('w.perro', 'El perro dormido', 'A street dog asleep in the sun on the warm paving; he lifts his head, thinks it over, and decides you are fine.', 'nature', 36, -30),
  D('w.rayuela', 'La rayuela', 'A hopscotch in chalk, redrawn every week by whoever is small enough to care.', 'object', -30, -35),
  D('w.virgen', 'La Virgen del Carmen', "A neighbours' shrine: candles, plastic flowers and a blue niche.", 'shrine', 25, 25),
  D('w.cancha', 'La Cancha El Cerro', 'The futsal court: every afternoon begins with arguments over the teams.', 'story', -25, 30),
];
const tips = (discoveries, seeds = 60) => {
  const out = [];
  for (let seed = 1; seed <= seeds; seed++) { const d = dlg('vecino', { gender: 'm', discoveries, seed }); d.open(); out.push(d.pick('tip').line); }
  return out;
};

test('the tips only name public places and things: never a bed, a child\'s room or a drawer in somebody\'s home, nor a find', () => {
  const lines = tips([...PRIVATE, ...PUBLIC]);
  for (const l of lines) {
    assert.doesNotMatch(l.es, /cama|Tornillos|cuarto|escurridor|peine/i, l.es); assert.doesNotMatch(l.en, /bed|screws|room|dish rack|comb/i, l.en);
    assert.match(l.es, /Cruz de la Cumbre|perro dormido|rayuela|Virgen del Carmen|Cancha El Cerro/, l.es);
  }
  assert.equal(dlg('vecino', { discoveries: PRIVATE }).hint(), null, 'nothing public left to tell: no hint (the generic tip pool answers)');
  const generic = dlg('vecino', { discoveries: PRIVATE, seed: 3 }); generic.open(); const g = generic.pick('tip').line;
  assert.doesNotMatch(g.es, /cama|Tornillos|cuarto|escurridor|peine/i); assert.ok(g.es.length > 20, 'the shared tip pool answers instead');
  for (const l of tips(PUBLIC.map((p) => ({ ...p, found: true })), 10)) assert.doesNotMatch(l.es, /Cruz de la Cumbre|perro dormido|rayuela|Virgen del Carmen|Cancha El Cerro/, 'a place already found is not recommended');
});

test('the tips say a short name in English (not the journal sentence), with no capital in the middle and no double full stop', () => {
  const lines = tips(PUBLIC, 80), all = lines.map((l) => l.en).join('\n');
  for (const l of lines) {
    for (const p of PUBLIC) assert.ok(!l.en.includes(p.en.replace(/\.$/, '')) && !l.en.includes(p.en.slice(0, 30)), `the journal sentence was pasted: ${l.en}`);
    assert.doesNotMatch(l.en, /\.\./, l.en); assert.doesNotMatch(l.en, /\bis about the same level/, l.en);
    assert.match(l.en, /^(They say it's worth stopping to look at|If you like looking, don't miss|If I were you I'd have a look at|Drop by|If you're out for a walk, don't miss|They say it's worth seeing|Go and see|It's worth seeing|Don't miss|Take a look at|If you like nature, look at|If you like animals, look at|It's worth looking at|If you like art, don't miss) (the|Lantern|Canelo|Don|Doña|El) [a-z]/, l.en);
    assert.doesNotMatch(l.en, /\b(it is|It is|you are|I am)\b/, `English keeps its contractions: ${l.en}`);
    assert.match(l.en, /\. It's (uphill|downhill|at about the same level), /, l.en);
  }
  for (const w of ['the summit cross', 'the sleeping street dog', 'the hopscotch', 'the shrine of the Virgin of Carmen', 'the futsal court']) assert.ok(all.includes(w), `"${w}" is said`);
  // a discovery the table does not know: the Spanish name, as a proper name (a sentence is not a name); a short English name is used as it is
  const NEW = [D('w.nuevo', 'El Mural Nuevo', 'A long wall, repainted by the whole school: every child signed a corner of it.', 'mural', 20, -30)], NEW2 = [D('w.otro', 'El Puente', 'Wooden Bridge', 'vista', 20, -30)];
  for (const l of tips(NEW, 12)) { assert.match(l.es, /(ver|Fíjese en|no se pierda) el Mural Nuevo\./, l.es); assert.match(l.en, / El Mural Nuevo\. It's /, l.en); }
  for (const l of tips(NEW2, 12)) { assert.match(l.es, / (al|el) Puente\./, l.es); assert.match(l.en, / the Wooden Bridge\. It's /, l.en); }
});

test('the tips are said by kind: a view is looked at, a place is dropped by, a shrine is seen, an animal is noticed', () => {
  const say = (item, seeds = 80) => tips([item], seeds).map((l) => l.es).join('\n');
  const view = say(PUBLIC[0]), nature = say(PUBLIC[1]), shrine = say(PUBLIC[3]), place = say(PUBLIC[4]);
  assert.match(view, /asomarse a la Cruz/); assert.doesNotMatch(view, /Pase por|Pase a ver|Fíjese en/);
  assert.match(nature, /Fíjese en el perro dormido/); assert.doesNotMatch(nature, /asomarse|Pase por|Pase a ver/);
  assert.match(shrine, /Pase a ver la Virgen del Carmen/); assert.doesNotMatch(shrine, /asomarse|Pase por|Fíjese en/);
  assert.match(place, /Pase por la Cancha El Cerro/); assert.doesNotMatch(place, /asomarse|Fíjese en|Pase a ver/);
  for (const t of [view, nature, shrine, place]) { assert.doesNotMatch(t, / a el | de el /); assert.doesNotMatch(t, /[a-záéíóúñ,] (La|El|Los|Las) (Cruz|Virgen)/); }
  // the table can say a kind is wrong: the kite is registered as a 'vista', but nobody "looks out over" a kite
  const kite = say(D('w.cometa', 'La cometa del mirador', 'A red-and-yellow kite on a long string tied to a stake at the viewpoint.', 'vista', 20, -30));
  assert.match(kite, /Fíjese en la cometa del mirador/); assert.doesNotMatch(kite, /asomarse|Si le gusta mirar/);
});

test('where: nobody is sent to the shop they stand in, nor to a place a few steps away (the rest still come, nearest first)', () => {
  const LMS = [
    { id: 'panaderia', name: 'Panadería La Esperanza', en: 'Bakery', kind: 'shop', x: 60, y: 2, z: 60 },                    // his own shop (named), though he stands far from the point
    { id: 'busstop', name: 'Parada del Bus', en: 'Bus Stop', kind: 'busstop', x: 8, y: 2, z: 5 },                            // a few steps away
    { id: 'cancha30', name: 'Cancha El Cerro', en: 'El Cerro Court', kind: 'court', x: 30, y: 2, z: 0 },                     // far enough
    LM[0], LM[1], LM[2],
  ];
  const ask = (seed, o = {}) => {
    const d = new Dialogue({ npc: { id: 'n1', persona: 'panaderia', name: 'Don Jorge', gender: 'm', shopName: 'Panadería La Esperanza', x: 0, z: -1.5, mem: null }, bank: BANK, rng: makeRng(seed), hour: 10, world: { landmarks: o.landmarks ?? LMS, player: here, discoveries: [] } });
    d.open(); return d.pick('where').choices.map((c) => c.id).filter((id) => id.startsWith('lm:'));
  };
  for (let seed = 1; seed <= 60; seed++) {
    const ids = ask(seed);
    assert.ok(ids.length >= 3, ids.join()); assert.ok(!ids.includes('lm:panaderia'), 'his own shop'); assert.ok(!ids.includes('lm:busstop'), 'a place 9 m away');
    assert.ok(ids.includes('lm:cancha30'), 'a place 30 m away is a fine answer: the nearest of the rest');
  }
  const tiny = [{ id: 'a', name: 'Calle A', en: 'A Street', kind: 'street', x: 5, y: 2, z: 0 }, { id: 'b', name: 'Calle B', en: 'B Street', kind: 'street', x: 0, y: 2, z: 9 }];
  assert.deepEqual(ask(1, { landmarks: tiny }).sort(), ['lm:a', 'lm:b'], 'when everything is near, something is still offered');
});

test('directions in English read as sentences: "is at about the same level", "the Bus Stop"', async () => {
  const rng = makeRng(2), y2 = (lm) => directionsTo({ y: 2, ...lm }, here, rng);
  const level = y2({ name: 'Panadería La Esperanza', en: 'Bakery', kind: 'shop', x: 0, z: -30 });
  assert.match(level.en, /^The Bakery is at about the same level, about a block away, straight ahead\.$/);
  assert.match(directionsTo({ name: 'Panadería', en: 'Bakery', x: 0, y: 2, z: -30 }, here, rng, { short: true }).en, /^It's at about the same level, about a block away, straight ahead\.$/);
  assert.match(y2({ name: 'Parada del Bus', en: 'Bus Stop', kind: 'busstop', x: 0, z: -30 }).en, /^The Bus Stop is /); assert.equal(theEn('Bus Stop', 'busstop'), 'the Bus Stop');
  assert.match(y2({ name: 'Calle del Sol', en: 'Sun Street', kind: 'street', x: 0, z: -30 }).en, /^Sun Street is /, 'a street keeps its name without an article');
  const { plan } = await buildData({ furnish: false, colliders: false });
  for (const lm of plan.landmarks) for (const yaw of [0, 1.6, 3.1, 4.7]) for (const y of [-6, 2, 12]) {
    const en = directionsTo({ ...lm, y: lm.y ?? 0 }, { x: 0, y: (lm.y ?? 0) + y - 2, z: 0, yaw }, rng).en;
    assert.match(en, /^(The |Sun |Commerce |Virgin |Lantern |El |La |Los |Las )[A-Z]?[^.]* is (at about the same level|uphill|downhill), (right there|about a block away|a couple of blocks away|quite far), (straight ahead|on your right|on your left|back the way you came)\.$/, `${lm.id}: ${en}`);
  }
});

test('how the player is addressed follows settings.address (default masculine), the speaker\'s own gender forms follow the NPC', () => {
  const saw = (address, gender = 'f') => {
    const out = [];
    for (let seed = 1; seed <= 40; seed++) {
      const d = dlg('abuela', { gender, address, seed, id: 'a' + seed }); out.push(d.open().line.es);
      for (const t of ['mood', 'job', 'barrio']) out.push(d.pick(t).line?.es ?? '');
      out.push(d.pick('bye').line.es);
    }
    return out.join(' | ');
  };
  const m = saw('m'), f = saw('f');
  assert.match(m, /mijo|mijito/); assert.doesNotMatch(m, /\bmija\b|\bmijita\b/);
  assert.match(f, /\bmija\b|\bmijita\b/); assert.doesNotMatch(f, /\bmijo\b|\bmijito\b/);
  const sp = (gender) => { const d = dlg('tienda', { gender, shopName: 'Tienda El Vecino', seed: 2 }); const all = []; for (let k = 0; k < 6; k++) { const s = d.open(); all.push(s.line.es); } return all.join(' '); };
  assert.ok(sp('m').length > 10 && sp('f').length > 10);
});

test('takeLine: unused lines first, then the pool starts over', () => {
  const pool = [['a', 'a'], ['b', 'b'], ['c', 'c']], used = new Set(), rng = makeRng(1);
  const first = [takeLine(pool, used, rng), takeLine(pool, used, rng), takeLine(pool, used, rng)].map((x) => x[0]).sort();
  assert.deepEqual(first, ['a', 'b', 'c']); assert.ok(takeLine(pool, used, rng), 'an exhausted pool starts over instead of returning nothing'); assert.equal(takeLine([], used, rng), null);
});

// ---- R3-018: wording and the hour ---------------------------------------------------------------------------------------------------------------
test('theEn: a name that opens with a Spanish article keeps it ("El Cerro School", not "the El Cerro School"); the rest take "the"', () => {
  assert.equal(theEn('El Cerro School', 'school'), 'El Cerro School'); assert.equal(theEn('La Esperanza Bakery', 'shop'), 'La Esperanza Bakery'); assert.equal(theEn('Los Almendros Plaza', 'plaza'), 'Los Almendros Plaza');
  assert.equal(theEn('School', 'school'), 'the School'); assert.equal(theEn('Lantern Alley', 'street'), 'Lantern Alley'); assert.equal(theEn('Elm Court', 'court'), 'the Elm Court', 'a word that only begins with the letters "el" is not an article');
  const y2 = directionsTo({ name: 'Escuela El Cerro', en: 'El Cerro School', kind: 'school', x: 0, y: 2, z: -30 }, here, makeRng(2));
  assert.match(y2.en, /^El Cerro School is /, y2.en); assert.doesNotMatch(y2.en, /\bthe El\b|\bThe El\b/i);
});

test('a line of a pool can carry an hour window { from, to }: lunch is asked until three o\'clock, tea after it, the blazing sun only until half past four', () => {
  assert.equal(inWindow(undefined, 3), true); assert.equal(inWindow({ to: 15 }, 14.99), true); assert.equal(inWindow({ to: 15 }, 15), false); assert.equal(inWindow({ from: 15 }, 15), true); assert.equal(inWindow({ from: 15 }, 14.9), false);
  const greetings = (persona, hour, n = 60) => { const out = new Set(); for (let s = 1; s <= n; s++) out.add(dlg(persona, { hour, seed: s, gender: persona === 'vecino' ? 'm' : 'f' }).open().line.es); return [...out].join(' | '); };
  for (const persona of ['vecina', 'vecino']) {
    assert.match(greetings(persona, 13), /almorz/, `${persona} asks at one o'clock whether you have had lunch`);
    assert.doesNotMatch(greetings(persona, 17.2), /almorz/, `${persona} does not ask it at seventeen past five`);
    assert.match(greetings(persona, 17.2), /onces|luz|fresquito/, `${persona} says something of the hour instead`);
    assert.doesNotMatch(greetings(persona, 17.2), /solazo/, `${persona}: no blazing sun at seventeen past five`);
    assert.doesNotMatch(greetings(persona, 13), /onces/, `${persona}: no tea at one o'clock`);
  }
  for (const [persona, pool] of Object.entries(BANK.personas)) for (const l of pool.greet_a ?? []) if (/almorz/.test(l[0])) assert.ok(l[2]?.to <= 15, `${persona}: "${l[0]}" is asked after lunch`);
});

test('the barrio\'s round of greetings starts over when everything that can be said at this hour has been said, and does not open with the line just said', () => {
  const valid = (pool) => (pool ?? []).filter((l) => inWindow(l[2], 17.2)).length, N = valid(BANK.personas.vecina.greet_a) + valid(BANK.shared.greet_a);
  assert.ok(valid(BANK.personas.vecina.greet_a) >= 2 && valid(BANK.personas.vecina.greet_a) < BANK.personas.vecina.greet_a.length, 'the premise: some of the persona\'s lines are out of hour');
  for (let s = 1; s <= 40; s++) {
    const memory = newLineMemory(), say = (k) => new Dialogue({ npc: { id: 'n' + k, persona: 'vecina', name: 'Rosa', gender: 'f', mem: null }, bank: BANK, rng: makeRng(s * 100 + k), hour: 17.2, world: { landmarks: LM, player: here, discoveries: [] }, address: 'm', memory }).open().line.es;
    const said = []; for (let k = 0; k < 2 * N - 1; k++) said.push(say(k));
    assert.equal(new Set(said.slice(0, N)).size, N, `seed ${s}: ${N} neighbours, ${N} different greetings (the barrio does not repeat itself until it has said them all)`);
    assert.ok(!said.slice(N).includes(said[N - 1]), `seed ${s}: the next round does not open with the line just said`);
    assert.equal(new Set(said.slice(N)).size, N - 1, `seed ${s}: and the round after it says the other ${N - 1} once each, not the two lines of the persona over and over`);
  }
});

test('"Mi señora" is "my wife" in English and "mi esposo" is "my husband": the English follows the speaker\'s gender like the Spanish', () => {
  const all = Object.values(BANK.personas).flatMap((p) => p.family ?? []), mine = all.find((l) => /^\{Mi señora\|Mi esposo\}/.test(l[0])); assert.ok(mine, 'the family line of the shop exists');
  const m = fillTokens({ es: mine[0], en: mine[1] }, { gender: 'm' }), f = fillTokens({ es: mine[0], en: mine[1] }, { gender: 'f' });
  assert.match(m.es, /^Mi señora trae/); assert.match(m.en, /^My wife brings/); assert.match(f.es, /^Mi esposo trae/); assert.match(f.en, /^My husband brings/);
  for (const p of Object.values(BANK.personas)) for (const [k, pool] of Object.entries(p)) if (Array.isArray(pool)) for (const l of pool) if (Array.isArray(l) && typeof l[1] === 'string') assert.doesNotMatch(l[1], /\bMy spouse\b|\bmy spouse\b|nearly hung me up|\bworth a look at\b/, `${k}: ${l[1]}`);
});

// ---- R3-106: lines that name the hour carry its window; R3-111: the barber's goodbye -------------------------------------------------------------
const again1 = () => ({ met: 1, lastHour: null, used: {}, heard: new Set() });                 // somebody met once: their next greeting is an "again" line
/** What `persona` says to 80 different visitors at `hour` when asked `ask` ('open': the greeting, 'bye', or a topic), as one string. */
const saidAt = (persona, hour, ask, o = {}) => {
  const out = new Set();
  for (let s = 1; s <= 80; s++) {
    const d = dlg(persona, { hour, seed: s, id: 'h' + s, gender: o.gender ?? 'f', shopName: o.shopName, mem: o.again ? again1() : null }), first = d.open().line.es;
    out.add(ask === 'open' ? first : d.pick(ask).line?.es ?? '');
  }
  return [...out].join(' | ');
};
test('a line that names the hour is said only in it: no lunch waiting at supper time, no harsh sun at dusk or after dark (R3-106)', () => {
  const M = { gender: 'm' }, shop = (name) => ({ shopName: name });
  // the builder's wife: lunch at lunchtime, supper after it, neither before ten (the sheet: "con el almuerzo" at 17:20 and 18:25)
  for (const h of [8, 17.3, 18.4, 21]) assert.doesNotMatch(saidAt('obrero', h, 'family', M), /almuerzo/, `obrero, family, ${h}`);
  assert.match(saidAt('obrero', 12, 'family', M), /almuerzo/);
  assert.match(saidAt('obrero', 18.4, 'family', M), /con la comida|en la casa/); assert.doesNotMatch(saidAt('obrero', 8, 'family', M), /con la comida/);
  // "with the sun and the mortar", "the sun is harsh", "especially in the sun": by day only (the sheet: 19:35 and 18:25)
  assert.doesNotMatch(saidAt('obrero', 19.6, 'mood', M), /\bsol\b/); assert.match(saidAt('obrero', 10, 'mood', M), /con el sol y la mezcla/);
  assert.doesNotMatch(saidAt('enfermera', 19.6, 'bye'), /el sol es duro/); assert.match(saidAt('enfermera', 10, 'bye'), /el sol es duro/);
  assert.doesNotMatch(saidAt('enfermera', 19.6, 'open', { again: true }), /el sol es traicionero/); assert.match(saidAt('enfermera', 10, 'open', { again: true }), /el sol es traicionero/);
  assert.doesNotMatch(saidAt('drogueria', 18.4, 'wares', shop('Droguería La Salud')), /con el sol/); assert.match(saidAt('drogueria', 10, 'wares', shop('Droguería La Salud')), /con el sol/);
  // what the day has done by now
  assert.doesNotMatch(saidAt('drogueria', 8, 'mood', shop('Droguería La Salud')), /Toda la mañana/); assert.match(saidAt('drogueria', 12, 'mood', shop('Droguería La Salud')), /Toda la mañana/);
  assert.doesNotMatch(saidAt('restaurante', 9, 'mood', shop('Corrientazo Doña Lucía')), /se llenó al almuerzo/); assert.match(saidAt('restaurante', 15, 'mood', shop('Corrientazo Doña Lucía')), /se llenó al almuerzo/);
  assert.doesNotMatch(saidAt('restaurante', 19, 'wares', shop('Corrientazo Doña Lucía')), /almuerzo del día/); assert.match(saidAt('restaurante', 12, 'wares', shop('Corrientazo Doña Lucía')), /almuerzo del día/);
  assert.doesNotMatch(saidAt('restaurante', 17.3, 'open', shop('Corrientazo Doña Lucía')), /almuerzo|almuerza/); assert.match(saidAt('restaurante', 13, 'open', shop('Corrientazo Doña Lucía')), /almuerzo|almuerza/);
  assert.doesNotMatch(saidAt('vecina', 9, 'mood'), /Hoy hice sancocho/); assert.match(saidAt('vecina', 14, 'mood'), /Hoy hice sancocho/);
  assert.doesNotMatch(saidAt('mototaxista', 8, 'mood', M), /varias carreras/); assert.match(saidAt('mototaxista', 11, 'mood', M), /varias carreras/);
  assert.doesNotMatch(saidAt('nino', 9, 'mood'), /no hubo tarea/); assert.match(saidAt('nino', 15, 'mood'), /no hubo tarea/);
  assert.doesNotMatch(saidAt('adolescente', 18.2, 'open'), /hasta las nueve/); assert.match(saidAt('adolescente', 20.5, 'open'), /hasta las nueve/);
  assert.doesNotMatch(saidAt('vecina', 21.3, 'open'), /casi buenas noches/);
  // a reply to a purchase is not windowed, so it names no part of the day
  for (const [id, p] of Object.entries(BANK.personas)) for (const it of p.items ?? []) assert.doesNotMatch(it.say[0], /esta (tarde|mañana|noche)/, `${id}.${it.id}`);
});
test('a pool with an hour window never runs dry: at every quarter hour each persona has a line for every topic, and its greeting pool one for every hour of its period (R3-106)', () => {
  const TOPICS = ['mood', 'job', 'wares', 'barrio', 'family', 'news', 'tip', 'bye', 'again'], bad = [];
  for (const [id, p] of Object.entries(PERSONAS)) {
    const own = BANK.personas[id]; if (!own) continue;
    const npc = { persona: id, age: p.age ?? 'adult', shopName: p.kind === 'shop' ? 'Tienda X' : null };
    const keys = [...TOPICS, ...['m', 'a', 'e', 'n'].map((k) => 'greet_' + k)].filter((k) => own[k]?.length || BANK.shared[k]?.length);
    for (const k of keys) {
      const per = /^greet_(.)$/.exec(k)?.[1], tiers = [own[k], BANK.shared[k]].filter(Boolean);
      for (let h = 0; h < 24; h += 0.25) if ((!per || period(h) === per) && !tiers.some((t) => t.some((l) => lineFits(l[2], npc, h)))) bad.push(`${id}.${k} at ${h}`);
    }
  }
  assert.deepEqual(bad.slice(0, 12), []);
});
test('the barber\'s goodbye is a thing a person says: "Aquí lo espero cuando quiera retocarse", not "the doors are open" (R3-111)', () => {
  const bye = BANK.personas.peluqueria.bye.map((l) => l[0]);
  assert.ok(bye.includes('Aquí {lo} espero cuando quiera retocarse.'), bye.join(' | ')); assert.ok(!bye.some((s) => /puertas están abiertas/.test(s)));
  const said = new Set(); for (let s = 1; s <= 60; s++) { const d = dlg('peluqueria', { hour: 10, seed: s, id: 'p' + s, gender: 'm', shopName: 'Barbería El Corte Fino', address: s % 2 ? 'm' : 'f' }); d.open(); said.add(d.pick('bye').line.es); }
  assert.ok([...said].some((s) => /^Aquí (lo|la) espero cuando quiera retocarse\.$/.test(s)), [...said].join(' | '));
});

// ---- R3-107: directions are not one template, and the far places can be asked about ------------------------------------------------------------------
test('directions say one thing in several ways: no phrase is most of the answers of its band, a slope past 6 m names the stairs, the near band keeps "ahí no más" (R3-107)', () => {
  const rng = makeRng(11), at = { x: 0, y: 2, z: 0, yaw: 0 }, N = 400;
  const ask = (z, dy = 0) => Array.from({ length: N }, () => directionsTo({ name: 'Panadería La Esperanza', en: 'Bakery', kind: 'shop', x: 0, y: 2 + dy, z }, at, rng));
  const share = (list, re) => list.filter((a) => re.test(a.es)).length / list.length;
  // the sheet counted 31 of 42 answers saying "a una cuadra larga" and 28 saying "más o menos al mismo nivel"
  const block = ask(-30), level = ask(-70);
  assert.ok(share(block, /a una cuadra larga/) < 0.3, `a block: ${share(block, /a una cuadra larga/)}`); assert.ok(share(level, /más o menos al mismo nivel/) < 0.3, `level: ${share(level, /más o menos al mismo nivel/)}`);
  for (const [name, list] of Object.entries({ near: ask(-8), block, two: level, far: ask(-120), farther: ask(-200), up: ask(-30, 4), stairsUp: ask(-30, 9), down: ask(-30, -4), stairsDown: ask(-30, -9), high: ask(-30, 20) })) {
    assert.ok(new Set(list.map((a) => a.es)).size >= 20, `${name}: ${new Set(list.map((a) => a.es)).size} different answers in ${N}`);
    assert.ok(new Set(list.map((a) => a.en)).size === 1, `${name}: the English subtitle says one thing: ${[...new Set(list.map((a) => a.en))].join(' / ')}`);
  }
  assert.ok(ask(-8).every((a) => a.es.includes('ahí no más')), 'the near band always says it');
  const stairs = (list, word) => list.every((a) => /escaleras/.test(a.es) && a.es.includes(word));
  assert.ok(stairs(ask(-30, 9), 'cuesta arriba') && stairs(ask(-30, -9), 'cuesta abajo'), 'between 6 and 12 m: the stairs, and still "cuesta arriba" / "cuesta abajo"');
  assert.ok(ask(-30, 20).every((a) => /escaleras/.test(a.es)) && ask(-30, -20).every((a) => /escaleras/.test(a.es)), 'past 12 m: the stairs');
  assert.ok(ask(-30, 4).every((a) => /cuesta arriba/.test(a.es) && !/escalera/.test(a.es)) && ask(-30, -4).every((a) => /cuesta abajo/.test(a.es) && !/escalera/.test(a.es)), 'a slope of 3 to 6 m is no stairs');
  assert.ok(ask(-30).every((a) => !/escalera|cuesta/.test(a.es)), 'level ground is neither');
  assert.ok(ask(-30).some((a) => /^Mire, la Panadería La Esperanza queda /.test(a.es)) && ask(-30).every((a) => /^Mire, /.test(a.es)), 'the opening stays');
  assert.ok(Array.from({ length: 60 }, () => directionsTo({ name: 'Tienda', x: 0, y: 2, z: 30 }, at, rng).es).every((s) => /^La Tienda queda /.test(s) && /Se devuelve/.test(s)), 'behind the visitor: "Se devuelve y sigue"');
  assert.ok(ask(-30).every((a) => /\.$/.test(a.es) && !/\. [a-záéíóúñ]/.test(a.es) && !/ a el | de el /.test(a.es)), 'one sentence, no "a el"');
});
test('the "where" menu always offers a place a stranger crosses the barrio for, and a visitor who asks five neighbours is offered each of them (R3-107)', async () => {
  const { plan } = await buildData({ furnish: false, colliders: false });
  const lms = collectLandmarks(plan), sp = plan.spawn, player = { x: sp.x, y: plan.heightAt(sp.x, sp.z), z: sp.z, yaw: 0 };       // the foot of the barrio: the lower street
  const MAJOR = new Set(['viewpoint', 'plaza', 'chapel', 'school']), majors = lms.filter((l) => MAJOR.has(l.kind) && Math.hypot(l.x - sp.x, l.z - sp.z) >= 25).map((l) => l.id);
  assert.ok(majors.includes('mirador') && majors.includes('chapel') && majors.length >= 5, `the premise: ${majors.join()}`);
  const ask = (seed, memory) => {
    const d = new Dialogue({ npc: { id: 'n' + seed, persona: 'vecino', name: 'Don Luis', gender: 'm', x: sp.x, z: sp.z, mem: null }, bank: BANK, rng: makeRng(seed), hour: 10, world: { landmarks: lms, player, discoveries: [] }, memory });
    d.open(); return d.pick('where').choices.map((c) => c.id).filter((id) => id.startsWith('lm:')).map((id) => id.slice(3));
  };
  for (let seed = 1; seed <= 40; seed++) { const ids = ask(seed, null); assert.equal(ids.length, 3, ids.join()); assert.ok(ids.some((id) => majors.includes(id)), `seed ${seed}: ${ids.join()} offers no major place`); assert.equal(new Set(ids).size, 3); }
  const memory = newLineMemory(), offered = new Set();
  for (let k = 1; k <= majors.length; k++) for (const id of ask(100 + k, memory)) offered.add(id);
  for (const id of majors) assert.ok(offered.has(id), `${id}: offered by none of ${majors.length} neighbours (${[...offered].join()})`);
  const town = newLineMemory();
  assert.ok(new Set(Array.from({ length: 40 }, (_, k) => ask(200 + k, town).join())).size >= 8, 'the neighbours do not all offer the same three');
});
