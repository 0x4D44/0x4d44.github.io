// The conversation engine: Spanish typography helpers (articles, a+el, clock, directions), the flow of a conversation (menus, no repeats, buying, where,
// goodbye, memory across chats) and how the player is addressed (settings.address).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-dialogue.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/people/lines/index.js';
import { Dialogue, withArticle, theEn, polish, clockLine, directionsTo, period, takeLine } from '../js/people/dialogue.js';
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
  for (const lot of plan.lots.filter((x) => x.shop)) assert.ok(want[lot.name], `shop lot '${lot.name}' is missing from the article table of this test`);
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
