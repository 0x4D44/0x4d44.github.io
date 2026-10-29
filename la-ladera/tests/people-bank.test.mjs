// The Spanish bank has teeth: wiring (every persona -> an existing bank, every bank reachable by casting, no man speaks a woman's lines), typography of
// every rendered line (no "a el", no doubled spaces, no lowercase sentence start, no stray tokens, <= 140 chars), systematic rules from the native-speaker
// review (.scratch/R3a/spanish-review.md) and the M8 counts.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-bank.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANK, countLines } from '../js/people/lines/index.js';
import { BANK_GENDER } from '../js/people/lines/genders.js';
import { PERSONAS, SHOP_PERSONAS, COMMUNITY_PERSONAS, bankOf, bankGender, bankFits, genderOf } from '../js/people/personas.js';
import { planCast, unusedBanks } from '../js/people/cast.js';
import { fillTokens, Dialogue, TOPIC_MENU, TOPIC_MENU_TU, FORMS } from '../js/people/dialogue.js';
import { makeRng } from '../js/core/rng.js';
import { buildData } from './headless.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const META = JSON.parse(readFileSync(resolve(ROOT, 'assets/models/people/people_meta.json'), 'utf8'));
const CHARS = new Map(META.people.map((m) => [m.id, m]));
const isPool = (v) => Array.isArray(v) && v.length > 0 && Array.isArray(v[0]) && typeof v[0][0] === 'string';

/** Every { es, en, where } the bank can put on screen: pools, purchase replies, purchase menu labels, persona menu labels. */
function allLines(bank = BANK) {
  const out = [];
  const addPools = (owner, pools) => {
    for (const [k, v] of Object.entries(pools)) {
      if (isPool(v)) v.forEach(([es, en], i) => out.push({ es, en, where: `${owner}.${k}[${i}]`, owner, pool: k }));
      else if (k === 'items') for (const it of v) {
        out.push({ es: it.es, en: it.en, where: `${owner}.items.${it.id}.menu`, owner, pool: 'item_menu' });
        out.push({ es: it.say[0], en: it.say[1], where: `${owner}.items.${it.id}.say`, owner, pool: 'item_say' });
      } else if (k === 'menu') for (const [t, m] of Object.entries(v)) out.push({ es: m[0], en: m[1], where: `${owner}.menu.${t}`, owner, pool: 'menu' });
    }
  };
  addPools('shared', bank.shared);
  for (const [id, p] of Object.entries(bank.personas)) addPools(id, p);
  return out;
}
const LINES = allLines();
const SAMPLE = { name: 'Rosa', shopName: 'Panadería La Esperanza' };

// ---- wiring -------------------------------------------------------------------------------------------------------------------------------------
test('every persona resolves to a bank that exists', () => {
  for (const id of Object.keys(PERSONAS)) assert.ok(BANK.personas[bankOf(id)], `persona ${id} -> bank '${bankOf(id)}' does not exist`);
});

test('every bank is cast by some persona (no written line is unreachable)', () => {
  const reachable = new Set(Object.keys(PERSONAS).map(bankOf));
  for (const key of Object.keys(BANK.personas)) assert.ok(reachable.has(key), `bank '${key}' is written but no persona uses it`);
});

test('a masculine bank is never cast with a woman, nor a feminine bank with a man', () => {
  for (const [id, p] of Object.entries(PERSONAS)) {
    const bg = bankGender(bankOf(id));
    if (p.gender === 'f' || p.gender === 'm') assert.ok(bg === 'any' || bg === p.gender, `persona ${id} (${p.gender}) uses the ${bg} bank '${bankOf(id)}'`);
    else assert.equal(bg, 'any', `persona ${id} is cast with either gender but its bank '${bankOf(id)}' is written as ${bg}`);
  }
  for (const k of Object.keys(BANK_GENDER)) assert.ok(BANK.personas[k], `BANK_GENDER names a bank that does not exist: ${k}`);
});

test('every character a persona lists exists in the shipped library and has the persona gender', () => {
  for (const [id, p] of Object.entries(PERSONAS)) {
    assert.ok(p.chars.length, `${id} lists no characters`);
    for (const c of p.chars) {
      const m = CHARS.get(c); assert.ok(m, `${id}: unknown character ${c}`);
      if (p.gender === 'f' || p.gender === 'm') assert.equal(genderOf(m.tags), p.gender, `${id}: ${c} is not ${p.gender}`);
    }
  }
});

test('the default cast: >= 60 people, >= 30 distinct appearances, every bank spoken, the right gender per bank', async () => {
  const { plan } = await buildData({ furnish: false, colliders: false });
  const cast = planCast({ plan, charMetas: CHARS, rng: makeRng(plan.seed ?? 1).fork('people').fork('cast') });
  assert.ok(cast.length >= 60, `only ${cast.length} people`);
  assert.ok(new Set(cast.map((c) => c.appearance)).size >= 30, 'fewer than 30 distinct appearances');
  assert.equal(new Set(cast.map((c) => c.id)).size, cast.length, 'duplicate ids');
  assert.deepEqual(unusedBanks(cast), [], 'banks nobody speaks');
  for (const c of cast) assert.ok(bankFits(c.bank, c.gender), `${c.id} (${c.gender}, ${c.charId}) speaks the ${bankGender(c.bank)} bank '${c.bank}'`);
  const shops = plan.lots.filter((l) => l.shop);
  assert.equal(cast.filter((c) => c.shopLot).length, shops.length, 'one shopkeeper per shop lot');
  for (const lot of shops) {
    const c = cast.find((x) => x.shopLot?.id === lot.id); assert.ok(c, `${lot.id} has no shopkeeper`);
    assert.equal(c.bank, lot.shop, `${lot.id} (${lot.shop}) is served by the '${c.bank}' bank`);
    if (/Doña /.test(lot.name)) assert.equal(c.gender, 'f', `${lot.name} must be a woman`);
    if (/Don /.test(lot.name)) assert.equal(c.gender, 'm', `${lot.name} must be a man`);
  }
  const names = cast.map((c) => c.name.display); assert.equal(new Set(names).size, names.length, 'two people share a display name');
});

// ---- counts (rubric M8) -------------------------------------------------------------------------------------------------------------------------
test('bank size: >= 600 lines over >= 14 personas, >= 12 lines in each', () => {
  const n = countLines();
  assert.ok(n.total >= 600, `${n.total} lines`);
  assert.ok(n.personas >= 14, `${n.personas} personas`);
  for (const [k, c] of Object.entries(n.per)) if (k !== 'shared') assert.ok(c >= 12, `${k} has only ${c} lines`);
});

test('every line has Spanish and English; the English is English', () => {
  for (const l of LINES) {
    assert.ok(typeof l.es === 'string' && l.es.length > 1, `${l.where}: empty Spanish`);
    assert.ok(typeof l.en === 'string' && l.en.length > 1, `${l.where}: empty English`);
    assert.notEqual(l.es, l.en, `${l.where}: English equals Spanish`);
    assert.ok(!/[¿¡]/.test(l.en), `${l.where}: Spanish punctuation in the English: ${l.en}`);
    assert.ok(!/\b(vecino|vecina)\b/.test(l.en) || /neighbou?r/.test(l.en) || /vecin/.test(l.es), `${l.where}: Spanish word left in the English`);
  }
});

// ---- typography of every rendered line ------------------------------------------------------------------------------------------------------------
const RENDERS = [];
for (const speaker of ['m', 'f']) for (const address of ['m', 'f']) RENDERS.push({ speaker, address });

function problems(es, en, where) {
  const out = [];
  if (/(^|[ ¿¡"(])[Aa] el(?= )/.test(es)) out.push('a el');
  if (/(^|[ ¿¡"(])[Dd]e el(?= )/.test(es)) out.push('de el');
  if (/\s{2,}/.test(es) || /\s{2,}/.test(en)) out.push('doubled space');
  if (/\{|\}/.test(es) || /\{|\}/.test(en)) out.push('unreplaced token');
  if (/(^|[.!?]\s+)[¿¡]?[a-záéíóúñ]/.test(es)) out.push('lowercase sentence start');
  if (/(^|[.!?]\s+)[¿¡]?[a-z]/.test(en)) out.push('lowercase English sentence start');
  if (es.length > 140) out.push(`${es.length} chars`);
  if (/ [,.;:!?]/.test(es) && !/ \.\.\./.test(es)) out.push('space before punctuation');
  if (/,,|\.\.(?!\.)|¿¿|\?\?/.test(es)) out.push('doubled punctuation');
  return out.map((p) => `${where}: ${p}: ${es}`);
}

test('every rendered line is clean Spanish typography (both speaker genders x both player-address settings)', () => {
  const bad = [];
  for (const l of LINES) for (const r of RENDERS) {
    const f = fillTokens({ es: l.es, en: l.en }, { gender: r.speaker, address: r.address, ...SAMPLE });
    bad.push(...problems(f.es, f.en, `${l.where} [speaker ${r.speaker}, address ${r.address}]`));
  }
  assert.deepEqual([...new Set(bad)].slice(0, 25), []);
});

test('the typography check itself catches a seeded fault', () => {
  const seeded = fillTokens({ es: 'Vaya a {shop}. entre, que es de el barrio.', en: 'Go to {shop}. come in.' }, { shopName: 'Mirador del Cielo' });
  assert.equal(seeded.es, 'Vaya al Mirador del Cielo. Entre, que es del barrio.', 'fillTokens must repair a + el, de + el and the capital after a full stop');
  const raw = problems('Vaya a el Mirador.  entre', 'ok', 'x'); assert.ok(raw.length >= 3, `expected the raw faults to be flagged, got ${JSON.stringify(raw)}`);
});

// ---- player gender (settings.address) ---------------------------------------------------------------------------------------------------------------
test('lines never hard-code how the player is addressed: they use tokens', () => {
  const bad = [];
  for (const l of LINES) {
    const es = l.es.replace(/\{[^{}]*\}/g, '{}');                                  // a token is exactly what we want to see
    if (/\b(mijo|mija|mijito|mijita|bienvenid[oa]s?|verlo|verla|verle|verte)\b/i.test(es)) bad.push(`${l.where}: hard-coded address form: ${l.es}`);
    if (/(^|[,¡¿]\s*)(señor|señora|vecin[oa]|amig[oa]|compadre|comadre)\s*[.,!?]/i.test(es) || /^(señor|señora|vecin[oa]|amig[oa]),/i.test(es)) bad.push(`${l.where}: hard-coded vocative: ${es}`);
  }
  assert.deepEqual(bad.slice(0, 25), []);
});

test('the player-address tokens follow settings.address and `joven` never changes', () => {
  const t = (s, address) => fillTokens({ es: s, en: s }, { address }).es;
  assert.equal(t('Buenas, {vecino}. Qué gusto ver{lo}. {Bienvenido}, {mijo}.', 'm'), 'Buenas, vecino. Qué gusto verlo. Bienvenido, mijo.');
  assert.equal(t('Buenas, {vecino}. Qué gusto ver{lo}. {Bienvenido}, {mijo}.', 'f'), 'Buenas, vecina. Qué gusto verla. Bienvenida, mija.');
  assert.equal(t('Buenos días, joven, {señor}.', 'f'), 'Buenos días, joven, señora.');
  assert.equal(t('Buenos días, joven.', 'm'), t('Buenos días, joven.', 'f'));
  for (const k of Object.keys(FORMS)) assert.equal(FORMS[k].length, 2, `FORMS.${k} needs [masculine, feminine]`);
  const sp = (s, gender) => fillTokens({ es: s, en: s }, { gender }).es;
  assert.equal(sp('Estoy cansad{o|a}.', 'm'), 'Estoy cansado.'); assert.equal(sp('Estoy cansad{o|a}.', 'f'), 'Estoy cansada.');
});

test('neutral banks use {o|a} for gendered self-description (a shopkeeper of either gender speaks them)', () => {
  const GENDERED = /\b(cansad|content|ocupad|agradecid|orgullos|preocupad|dispuest|encantad|emocionad|sorprendid|asustad|aburrid|agotad|acostumbrad|enamorad|recostad|quiet|tranquil|bendecid|jubilad|casad|solter)[oa]s?\b/i;
  const bad = [];
  for (const l of LINES) {
    if (l.owner !== 'shared' && bankGender(l.owner) !== 'any') continue;
    if (['item_menu', 'menu'].includes(l.pool)) continue;                         // what the PLAYER says
    const es = l.es.replace(/\{[^{}]*\}/g, '');                                   // tokens are fine
    const m = GENDERED.exec(es); if (m) bad.push(`${l.where}: '${m[0]}' needs {o|a}: ${l.es}`);
  }
  assert.deepEqual(bad.slice(0, 25), []);
});

// ---- systematic rules from the review -----------------------------------------------------------------------------------------------------------------
test('shops do not share template openings (greet_n / mood / news / again / bye)', () => {
  const first3 = (s) => s.toLowerCase().replace(/[^a-záéíóúñ ]/g, '').split(/\s+/).slice(0, 3).join(' ');
  for (const pool of ['greet_n', 'mood', 'news', 'again', 'bye', 'job']) {
    const seen = new Map();
    for (const l of LINES) {
      if (l.pool !== pool || !SHOP_PERSONAS.includes(l.owner)) continue;
      const k = first3(l.es); const set = seen.get(k) ?? new Set(); set.add(l.owner); seen.set(k, set);
    }
    for (const [k, set] of seen) assert.ok(set.size <= 2, `pool ${pool}: ${set.size} shops open with '${k}' (${[...set].join(', ')})`);
  }
});

test('no exact duplicate Spanish line across different banks', () => {
  const seen = new Map(), dup = [];
  for (const l of LINES) {
    if (l.pool === 'menu' || l.pool === 'item_menu') continue;
    const k = l.es.toLowerCase(); const prev = seen.get(k);
    if (prev && prev.owner !== l.owner) dup.push(`${prev.where} == ${l.where}: ${l.es}`); else if (!prev) seen.set(k, l);
  }
  assert.deepEqual(dup.slice(0, 20), []);
});

test('"Dicen que" is a seasoning, not a template', () => {
  const n = LINES.filter((l) => /^dicen que\b/i.test(l.es)).length;
  assert.ok(n <= 8, `${n} lines start with "Dicen que"`);
});

test('English keeps its contractions: no stiff "do not / is not / I am / it is / you are"', () => {
  const stiff = /\b(do not|does not|did not|is not|are not|cannot|I am|it is|It is|you are|we are|they are|I have not|I will|will not|would not)\b/;
  const idioms = /Here you are|where I am|how it is|here we are|as it is|what it is/gi;                 // set phrases keep their full form
  const bad = LINES.filter((l) => stiff.test(l.en.replace(idioms, ''))).map((l) => `${l.where}: ${l.en}`);
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} stiff English lines`);
});

test('Colombian words, not Spanish ones', () => {
  const bad = LINES.filter((l) => /(\bvale\b|vosotros|chaval|coger el autobús|ordenador|\bmóvil\b|\bguay\b|hostia|joder|\bmolar\b|\bcurrar\b)/i.test(l.es)).map((l) => `${l.where}: ${l.es}`);
  assert.deepEqual(bad, []);
});

// ---- tú for children, usted for adults, in EVERY menu entry --------------------------------------------------------------------------------------------------
const USTED = /\b(usted|ustedes|su familia|se dedica|me indica|cuénteme|dígame|siga|quisiera|me recomienda|su barrio|tiene usted|puede decirme|perdone|disculpe)\b/i;
test('kids and teens are addressed with tú in every menu entry of a full conversation', () => {
  for (const id of ['nino', 'adolescente']) {
    const persona = BANK.personas[id]; assert.equal(persona.register, 'tu', `${id} must be register 'tu'`);
    for (const [t, m] of Object.entries(persona.menu ?? {})) assert.ok(!USTED.test(m[0]), `${id}.menu.${t} uses usted: ${m[0]}`);
    for (const [t, m] of Object.entries(TOPIC_MENU_TU)) assert.ok(!USTED.test(m[0]), `TOPIC_MENU_TU.${t} uses usted: ${m[0]}`);
    const world = { landmarks: [{ id: 'a', name: 'Mirador del Cielo', en: 'Sky Viewpoint', x: 0, z: -50, y: 20 }, { id: 'b', name: 'Cancha El Cerro', en: 'The Court', x: 40, z: 10, y: 0 }], player: { x: 0, y: 0, z: 0, yaw: 0 }, discoveries: [] };
    for (let seed = 1; seed <= 6; seed++) {
      const d = new Dialogue({ npc: { id: 'x' + seed, persona: id, name: 'Sofía', gender: 'f', mem: null }, bank: BANK, rng: makeRng(seed), hour: 14, world });
      let s = d.open();
      for (let k = 0; k < 14 && !s.end; k++) {
        for (const c of s.choices) assert.ok(!USTED.test(c.es), `${id}: usted in a menu entry: '${c.es}'`);
        const ch = s.choices.find((c) => c.id !== 'bye') ?? s.choices[0]; s = d.pick(k >= 12 ? 'bye' : ch.id);
      }
    }
  }
  assert.ok(Object.keys(TOPIC_MENU).length >= Object.keys(TOPIC_MENU_TU).length - 1);
});

test('buying: the player asks the Colombian way ("¿Me regala ...?") and every shop sells three things with the price in words', () => {
  for (const id of SHOP_PERSONAS) {
    const p = BANK.personas[bankOf(id)];
    assert.equal(p.items?.length, 3, `${id} sells ${p.items?.length} things`);
    for (const it of p.items) {
      assert.ok(/^¿(Me |Podría |Me regala|Me vende|Me saca|Me hace|Me arregla|Me sube|Me cambia|Me corta|Me despincha|Me revisa|Me lustra|Me cose|Me da)/.test(it.es), `${id}.${it.id}: '${it.es}'`);
      assert.ok(Number.isFinite(it.price) && it.price > 0, `${id}.${it.id}: no price`);
      assert.ok(!/\d/.test(it.say[0]), `${id}.${it.id}: digits in a spoken line (the voice reads them badly): ${it.say[0]}`);
    }
    assert.ok(isPool(p.buy_ask), `${id} has no buy_ask`);
  }
});
