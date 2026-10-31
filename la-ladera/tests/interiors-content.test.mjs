// INTERIORS content: the readable papers (js/interiors/papers_*.js) and the special finds (js/interiors/finds.js) that fill the drawers and wardrobes.
// Pure data and pure functions, no Chrome: the shape of every entry, both languages everywhere, the word limits, the household filters resolving against
// real households, and the volume the feature was promised (dev/FEATURE-DRAWERS.md, acceptance 1).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-content.test.mjs
//   C_SABOTAGE=<long|missing_en|token|where|oldwhere|vocab|nofridge|dup|voice|brand|name|nogold|noknickers|shape|filter|few|voiceunused>  corrupt the data on purpose so the matching test must FAIL
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAPERS, papersFor } from '../js/interiors/papers.js';
import { FINDS, findsFor } from '../js/interiors/finds.js';
import { CONTAINER_KINDS, THEMES, PAPER_KINDS, COVERS, FIND_KINDS, FIND_COLLECTIONS, HOME_LOTS, SPECIAL_LOTS, HOME_KEYS, VOICE_ROLES, TOKENS, KNOWN_NAMES, RARITY_WEIGHTS,
  genderOf, authorOf, eligible, resolvePaper, resolveFind, wordCount, rarityWeight, collectionLabel } from '../js/interiors/content.js';
import { FIND_SHAPES, FIND_WRAPS } from '../js/interiors/finds.js';
import { makeHousehold, NAMES } from '../js/interiors/household.js';
import { makeRng } from '../js/core/rng.js';
import { ITEMS } from '../js/interiors/props.js';

const SAB = process.env.C_SABOTAGE;
if (SAB === 'long') PAPERS[0].pages[0].es = Array(130).fill('palabra').join(' ');
if (SAB === 'missing_en') delete PAPERS[1].pages[0].en;
if (SAB === 'token') PAPERS[2].pages[0].es += ' {Z}';
if (SAB === 'where') PAPERS[3].where = ['garage'];
if (SAB === 'oldwhere') PAPERS[3].where = ['cabinet'];                       // the lead's first word for a tv stand: the container system rejects it
if (SAB === 'vocab') FIND_SHAPES.push('teapot');
if (SAB === 'nofridge') for (const x of [...PAPERS, ...FINDS]) { x.where = x.where.filter((k) => k !== 'fridge'); if (!x.where.length) x.where = ['desk']; }
if (SAB === 'dup') PAPERS[5].id = PAPERS[4].id;
if (SAB === 'voice') PAPERS[0].voice = { role: 'ghost' };
if (SAB === 'brand') PAPERS[6].pages[0].en += ' She bought it at Nike.';
if (SAB === 'name') PAPERS.find((p) => p.id === 'dia_camila').pages[0].es += ' Valentina vino.';
if (SAB === 'nogold') for (const f of FINDS) if (f.collection === 'coins') f.gold = false;
if (SAB === 'noknickers') for (const f of FINDS) if (f.id.startsWith('calzones_')) f.min = 0;
if (SAB === 'shape') FINDS[0].shape = 'teapot';
if (SAB === 'filter') PAPERS[0].homes = { kind: ['family'], moonPhase: 'full' };
if (SAB === 'few') PAPERS.length = 20;
if (SAB === 'voiceunused') { const p = PAPERS.find((x) => x.id === 'dia_camila'); p.title = 'Diario'; p.en = 'Diary'; p.who = 'Una chica'; }

const SHOPS = ['panaderia', 'fruver', 'carniceria', 'peluqueria', 'ferreteria', 'drogueria', 'cafe', 'restaurante', 'papeleria', 'minutos', 'modista', 'zapateria', 'taller', 'tienda'];
const HH_KINDS = ['family', 'couple', 'students', 'elder', 'shopkeeper'];
const HOBBIES = ['football', 'music', 'plants', 'reading', 'cooking', 'sewing', 'radio', 'pigeons'];
const PETS = ['cat', 'dog', 'canary'];
const BRANDS = ['Coca-Cola', 'Pepsi', 'Nike', 'Adidas', 'Samsung', 'Nokia', 'Casio', 'Rolex', 'Postobón', 'Bavaria', 'Colombina', 'Crayola', 'Real Madrid', 'FC Barcelona', 'Millonarios', 'Facebook', 'WhatsApp', 'Instagram', 'TikTok', 'Netflix', 'Google'];
const MIN_PAPERS = 70, MIN_THEME = 8, MIN_FINDS = 40;
// papers that can sit in a container kind: the default is 6; these exist in one kind of building only, or are narrow (a fridge holds notes, not diaries)
const MIN_IN = { locker: 3, toolcab: 3, medcab: 4, counter: 5, fridge: 5, vitrine: 5, pantry: 5, filing: 8 };
// the container kinds are A3's (js/interiors/containers.js, dev/REQUESTS.md 22:10): this list is the lock between the two files
const A3_KINDS = ['nightstand', 'dresser', 'wardrobe', 'chest', 'tvstand', 'wallunit', 'vitrine', 'pantry', 'kitchen', 'fridge', 'desk', 'counter', 'locker', 'medcab', 'toolcab', 'filing'];
// the drawing words of A3's finds (same file); `ball` is the one extra, box is A3's fallback
const A3_SHAPES = ['coin', 'watch', 'pocketwatch', 'ring', 'chain', 'roll', 'teeth', 'deed', 'ticket', 'letter', 'map', 'shirt', 'knickers', 'jar', 'box', 'doll', 'key', 'medal', 'photo', 'ball'];
const report = (problems, what, lim = 12) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, lim).join('\n  '));
const strings = (p) => [p.title, p.en, p.who, ...p.pages.flatMap((g) => [g.when, g.es, g.en])];
const tokensIn = (s) => [...String(s).matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
const isStr = (s) => typeof s === 'string' && s.trim().length > 0;

function filterProblems(f, where) {
  const out = [];
  for (const one of Array.isArray(f) ? f : [f]) {
    if (!one || typeof one !== 'object') { out.push(`${where}: filter is not an object`); continue; }
    for (const [k, v] of Object.entries(one)) {
      if (!HOME_KEYS.includes(k)) { out.push(`${where}: unknown household filter "${k}"`); continue; }
      if (k === 'kind' && !(Array.isArray(v) && v.length && v.every((x) => HH_KINDS.includes(x)))) out.push(`${where}: bad kind ${JSON.stringify(v)}`);
      if (k === 'income' && ![0, 1].includes(v)) out.push(`${where}: income must be 0 or 1`);
      if (k === 'kids' && !(Number.isInteger(v) && v >= 1 && v <= 3)) out.push(`${where}: kids must be 1..3`);
      if (['teen', 'elder', 'babies', 'altar', 'rustic'].includes(k) && typeof v !== 'boolean') out.push(`${where}: ${k} must be a boolean`);
      if (k === 'religious' && !(typeof v === 'number' && v > 0 && v <= 1)) out.push(`${where}: religious must be in (0,1]`);
      if (k === 'hobby' && !(Array.isArray(v) && v.length && v.every((x) => HOBBIES.includes(x)))) out.push(`${where}: bad hobby ${JSON.stringify(v)}`);
      if (k === 'pets' && !(Array.isArray(v) && v.length && v.every((x) => PETS.includes(x)))) out.push(`${where}: bad pets ${JSON.stringify(v)}`);
      if (k === 'kidG' && !['f', 'm'].includes(v)) out.push(`${where}: kidG must be f or m`);
    }
  }
  return out;
}

function commonProblems(x, label) {
  const out = [];
  if (!Array.isArray(x.where) || !x.where.length || !x.where.every((k) => CONTAINER_KINDS.includes(k))) out.push(`${label}: bad where ${JSON.stringify(x.where)}`);
  if (x.homes !== undefined) out.push(...filterProblems(x.homes, label));
  if (x.lot !== undefined && !(Array.isArray(x.lot) && x.lot.length && x.lot.every((k) => HOME_LOTS.includes(k) || SPECIAL_LOTS.includes(k)))) out.push(`${label}: bad lot ${JSON.stringify(x.lot)}`);
  if (x.shop !== undefined && !(Array.isArray(x.shop) && x.shop.length && x.shop.every((k) => SHOPS.includes(k)))) out.push(`${label}: bad shop ${JSON.stringify(x.shop)}`);
  if (x.voice !== undefined && !(VOICE_ROLES.includes(x.voice?.role) && (x.voice.g === undefined || ['f', 'm'].includes(x.voice.g)))) out.push(`${label}: bad voice ${JSON.stringify(x.voice)}`);
  return out;
}

// every household a sample of the barrio could hold: each lot kind (and the shops) times many seeds
const LOTS = [...HOME_LOTS.map((kind) => ({ kind })), ...SHOPS.map((shop) => ({ kind: 'shophouse', shop })), ...SPECIAL_LOTS.map((kind) => ({ kind }))];
const HOUSEHOLDS = [];
for (const lot of LOTS) for (let s = 1, n = lot.shop ? 60 : SPECIAL_LOTS.includes(lot.kind) ? 80 : 250; s <= n; s++) {
  HOUSEHOLDS.push({ lot, hh: makeHousehold(makeRng(1000 + s), lot, `${lot.kind}${lot.shop ?? ''}.${s}`, lot.shop ? { shop: true } : {}) });
}

// ------------------------------------------------------------------------------------------------ the vocabulary
test('names: every first name household.js can draw has a known gender (add new names to content.js)', () => {
  const all = [...NAMES.women, ...NAMES.men, ...NAMES.kids];
  report(all.filter((n) => !genderOf(n)), 'names without a gender');
  report(KNOWN_NAMES.filter((n) => !all.includes(n)), 'gendered names household.js no longer draws');
  assert.ok(NAMES.women.every((n) => genderOf(n) === 'f') && NAMES.men.every((n) => genderOf(n) === 'm'));
});

test('vocabulary: the container kinds, find shapes and collection names are exactly the words the container system uses', () => {
  assert.deepEqual([...CONTAINER_KINDS].sort(), [...A3_KINDS].sort());
  assert.deepEqual([...FIND_SHAPES].sort(), [...A3_SHAPES].sort());
  assert.deepEqual(FIND_COLLECTIONS.map((c) => c.es), ['Monedas de oro', 'Relojes', 'Joyas', 'Rarezas']);
  assert.equal(collectionLabel('coins'), 'Monedas de oro');
  assert.equal(collectionLabel('oddities', 'en'), 'Curiosities');
  assert.equal(collectionLabel('nope'), 'nope');
  assert.deepEqual(RARITY_WEIGHTS, [10, 5, 2, 1]);
  assert.ok(FINDS.every((f) => rarityWeight(f) === RARITY_WEIGHTS[f.rarity - 1]));
  assert.ok(rarityWeight({ rarity: 1 }) > rarityWeight({ rarity: 4 }), 'a legendary find must be drawn less often than a common one');
});

// ------------------------------------------------------------------------------------------------ papers
test('props: the ordinary things in drawers, wardrobes and fridges are named in Colombian Spanish, not the peninsular word (R4-110b: a fiambrera in the fridge)', () => {
  const PENINSULAR = /\b(fiambreras?|zumos?|ordenadores?|móviles?|coches?|grifos?|patatas?|jers[eé]is?|melocot[oó]n(es)?)\b/i;
  const bad = ITEMS.filter((i) => PENINSULAR.test(i.id) || PENINSULAR.test(i.line[0])).map((i) => `${i.id}: ${i.line[0]}`);
  assert.ok(ITEMS.length >= 150, `the pantry of things (${ITEMS.length})`);
  assert.ok(ITEMS.some((i) => i.id === 'portacomida'), 'the packed lunch is a portacomida');
  assert.deepEqual(bad, [], `${bad.length} things with a peninsular word: ${bad.join(' | ')}`);
});

test('papers: unique ids, valid kind/cover/themes, both languages on every page, at most 90 words a page', () => {
  const bad = [], seen = new Set();
  for (const p of PAPERS) {
    const L = p.id;
    if (!/^[a-z][a-z0-9_]*$/.test(p.id ?? '')) bad.push(`${L}: bad id`);
    if (seen.has(p.id)) bad.push(`${L}: duplicate id`); seen.add(p.id);
    if (!PAPER_KINDS.includes(p.kind)) bad.push(`${L}: kind ${p.kind}`);
    if (!COVERS.includes(p.cover)) bad.push(`${L}: cover ${p.cover}`);
    if (!isStr(p.title) || !isStr(p.en) || !isStr(p.who)) bad.push(`${L}: title/en/who missing`);
    if (!Array.isArray(p.themes) || !p.themes.length || !p.themes.every((t) => THEMES.includes(t))) bad.push(`${L}: themes ${JSON.stringify(p.themes)}`);
    if (!Array.isArray(p.pages) || p.pages.length < 1 || p.pages.length > 6) bad.push(`${L}: ${p.pages?.length} pages (1 to 6)`);
    for (const [i, g] of (p.pages ?? []).entries()) {
      if (!isStr(g.when)) bad.push(`${L} p${i + 1}: when missing`);
      for (const lang of ['es', 'en']) {
        if (!isStr(g[lang])) { bad.push(`${L} p${i + 1}: ${lang} missing`); continue; }
        const n = wordCount(g[lang]);
        if (n > 90) bad.push(`${L} p${i + 1}: ${n} ${lang} words (max 90)`);
        if (n < 12) bad.push(`${L} p${i + 1}: only ${n} ${lang} words`);
      }
    }
    bad.push(...commonProblems(p, L));
  }
  report(bad, 'paper problems');
});

test('papers: tokens are known, {A} only with a voice, no brands, no stray markup, no pool names in home papers', () => {
  const bad = [];
  const poolRe = new RegExp(`(?<![\\p{L}])(${KNOWN_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}])`, 'u');
  for (const p of PAPERS) {
    if (p.voice && !strings(p).some((s) => tokensIn(s).includes('A'))) bad.push(`${p.id}: has a voice but never uses {A}`);
    const home = !p.lot || p.lot.every((k) => HOME_LOTS.includes(k));
    for (const s of strings(p)) {
      for (const t of tokensIn(s)) {
        if (!TOKENS.includes(t)) bad.push(`${p.id}: unknown token {${t}}`);
        if (t === 'A' && !p.voice) bad.push(`${p.id}: {A} without a voice`);
      }
      for (const b of BRANDS) if (s.includes(b)) bad.push(`${p.id}: brand "${b}"`);
      if (/undefined|null|\[object|<[a-z]+>|\s{2,}|\\n/i.test(s)) bad.push(`${p.id}: stray markup or spacing in "${s.slice(0, 50)}"`);
      const m = home && poolRe.exec(s.replace(/\{[^}]*\}/g, ''));
      if (m) bad.push(`${p.id}: names the household pool name "${m[1]}" (use a token or another name): "${s.slice(Math.max(0, m.index - 20), m.index + 30)}"`);
    }
  }
  report(bad, 'paper text problems');
});

test('papers: every household filter resolves, and a resolved paper has no token left', () => {
  const bad = [];
  for (const { lot, hh } of HOUSEHOLDS.filter((_, i) => i % 5 === 0)) for (const p of papersFor(hh, lot, null)) {
    const r = resolvePaper(p, hh);
    for (const s of [r.title, r.en, r.who, ...r.pages.flatMap((g) => [g.when, g.es, g.en])]) if (/\{|\}|undefined/.test(s)) bad.push(`${p.id}: unresolved "${s.slice(0, 40)}"`);
    if (p.voice) {
      const a = authorOf(p.voice, hh);
      const all = [r.title, r.en, r.who, ...r.pages.flatMap((g) => [g.when, g.es, g.en])].join(' | ');
      if (!a || !all.includes(a)) bad.push(`${p.id}: voice ${JSON.stringify(p.voice)} resolved to ${a}, which the paper never names`);
      if (p.voice.g && genderOf(a) !== p.voice.g) bad.push(`${p.id}: author ${a} is not ${p.voice.g}`);
    }
    if (p.homes && !JSON.stringify(p.homes).includes('kidG')) continue;
    const g = [].concat(p.homes ?? []).flatMap((f) => (f.kidG ? [f.kidG] : []))[0];
    if (g && genderOf(hh.names.kid) !== g) bad.push(`${p.id}: kidG ${g} but {K} = ${hh.names.kid}`);
  }
  report([...new Set(bad)], 'resolution problems');
});

test('papers: every paper fits some household', () => {
  const dead = PAPERS.filter((p) => !HOUSEHOLDS.some(({ lot, hh }) => eligible(p, hh, lot)));
  report(dead.map((p) => p.id), 'papers no household can ever hold');
});

test('papers: every kind of home and special building has enough to read, and every container kind holds something', () => {
  const bad = [];
  for (const kind of HH_KINDS) {
    const hhs = HOUSEHOLDS.filter(({ lot, hh }) => hh.kind === kind && HOME_LOTS.includes(lot.kind));
    if (!hhs.length) continue;
    const worst = Math.min(...hhs.map(({ lot, hh }) => papersFor(hh, lot, null).length));
    if (worst < 6) bad.push(`a ${kind} household can have as few as ${worst} papers to choose from (want >= 6)`);
  }
  for (const kind of SPECIAL_LOTS) {
    const n = new Set(HOUSEHOLDS.filter(({ lot }) => lot.kind === kind).flatMap(({ lot, hh }) => papersFor(hh, lot, null).map((p) => p.id))).size;
    if (n < 1) bad.push(`no paper for a ${kind}`);
  }
  for (const c of CONTAINER_KINDS) if (!PAPERS.some((p) => p.where.includes(c))) bad.push(`no paper can sit in a ${c}`);
  report(bad, 'coverage gaps');
});

test('papers: no two papers share a title or an opening line', () => {
  const t = new Map(), o = new Map(), bad = [];
  for (const p of PAPERS) {
    const a = p.title.toLowerCase(), b = p.pages[0].es.slice(0, 40).toLowerCase();
    if (t.has(a)) bad.push(`${p.id} and ${t.get(a)} share a title`); t.set(a, p.id);
    if (o.has(b)) bad.push(`${p.id} and ${o.get(b)} open the same way`); o.set(b, p.id);
  }
  report(bad, 'repeats');
});

test(`papers: the promised volume (>= ${MIN_PAPERS} papers, >= ${MIN_THEME} per theme, every kind of paper, >= 6 per container kind)`, () => {
    const bad = [];
    if (PAPERS.length < MIN_PAPERS) bad.push(`${PAPERS.length} papers`);
    for (const t of THEMES) { const n = PAPERS.filter((p) => p.themes.includes(t)).length; if (n < MIN_THEME) bad.push(`theme ${t}: ${n}`); }
    for (const k of PAPER_KINDS) if (!PAPERS.some((p) => p.kind === k)) bad.push(`no ${k}`);
    for (const c of CONTAINER_KINDS) { const n = PAPERS.filter((p) => p.where.includes(c)).length; if (n < (MIN_IN[c] ?? 6)) bad.push(`container ${c}: ${n} papers`); }
    report(bad, 'volume gaps');
  });

// ------------------------------------------------------------------------------------------------ finds
test('finds: unique ids, valid kind/collection/shape/wrap/rarity, both languages, short reactions', () => {
  const bad = [], seen = new Set(), cols = FIND_COLLECTIONS.map((c) => c.id);
  for (const f of FINDS) {
    const L = f.id;
    if (!/^[a-z][a-z0-9_]*$/.test(f.id ?? '')) bad.push(`${L}: bad id`);
    if (seen.has(f.id)) bad.push(`${L}: duplicate id`); seen.add(f.id);
    if (!FIND_KINDS.includes(f.kind)) bad.push(`${L}: kind ${f.kind}`);
    if (!cols.includes(f.collection)) bad.push(`${L}: collection ${f.collection}`);
    if (!FIND_SHAPES.includes(f.shape)) bad.push(`${L}: shape ${f.shape}`);
    if (f.in !== undefined && !FIND_WRAPS.includes(f.in)) bad.push(`${L}: wrap ${f.in}`);
    if (!Number.isInteger(f.rarity) || f.rarity < 1 || f.rarity > 4) bad.push(`${L}: rarity ${f.rarity}`);
    if (!Number.isInteger(f.min) || !Number.isInteger(f.max) || f.min < 1 || f.max < f.min || f.max > 15) bad.push(`${L}: min/max ${f.min}/${f.max}`);   // 15: the named treasures turn up about once per building (R4-108)
    if (!(f.size > 0.005 && f.size < 0.6)) bad.push(`${L}: size ${f.size}`);
    if (!Number.isInteger(f.tint) || f.tint < 0 || f.tint > 0xffffff) bad.push(`${L}: tint`);
    for (const lang of ['es', 'en']) {
      if (!isStr(f.name?.[lang]) || !isStr(f.react?.[lang])) { bad.push(`${L}: name/react ${lang} missing`); continue; }
      const n = wordCount(f.react[lang]);
      if (n > 40 || n < 6) bad.push(`${L}: ${n} ${lang} words in the reaction (6 to 40)`);
      if (wordCount(f.name[lang]) > 12) bad.push(`${L}: ${lang} name too long`);
      for (const t of [...tokensIn(f.name[lang]), ...tokensIn(f.react[lang])]) if (!TOKENS.includes(t) || (t === 'A' && !f.voice)) bad.push(`${L}: token {${t}}`);
      for (const b of BRANDS) if (f.name[lang].includes(b) || f.react[lang].includes(b)) bad.push(`${L}: brand "${b}"`);
      if (/undefined|null|\s{2,}/.test(f.name[lang] + f.react[lang])) bad.push(`${L}: stray text`);
    }
    bad.push(...commonProblems(f, L));
  }
  report(bad, 'find problems');
});

test('finds: resolved against real households no token is left, and every find fits some household', () => {
  const bad = [];
  for (const { lot, hh } of HOUSEHOLDS.filter((_, i) => i % 4 === 0)) for (const f of findsFor(hh, lot, null)) {
    const r = resolveFind(f, hh);
    for (const s of [r.name.es, r.name.en, r.react.es, r.react.en]) if (/\{|\}|undefined/.test(s)) bad.push(`${f.id}: unresolved "${s.slice(0, 40)}"`);
  }
  report([...new Set(bad)], 'resolution problems');
  report(FINDS.filter((f) => !HOUSEHOLDS.some(({ lot, hh }) => eligible(f, hh, lot))).map((f) => f.id), 'finds no household can ever hold');
});

test(`finds: the promised volume (>= ${MIN_FINDS} finds; gold coins, watches, frilly knickers, curios)`, () => {
  const sum = (a) => a.reduce((n, f) => n + f.min, 0);
  const bad = [];
  if (FINDS.length < MIN_FINDS) bad.push(`${FINDS.length} distinct finds (want >= ${MIN_FINDS})`);
  if (sum(FINDS) < MIN_FINDS) bad.push(`${sum(FINDS)} placed finds (want >= ${MIN_FINDS})`);
  const gold = FINDS.filter((f) => f.gold && f.collection === 'coins'), watches = FINDS.filter((f) => f.collection === 'watches');
  const knick = FINDS.filter((f) => f.id.startsWith('calzones_')), curios = FINDS.filter((f) => f.kind === 'curio');
  if (sum(gold) < 6) bad.push(`${sum(gold)} gold coins (want >= 6)`);
  if (sum(watches) < 6) bad.push(`${sum(watches)} watches (want >= 6)`);
  if (sum(watches.filter((f) => f.fancy)) < 2) bad.push(`${sum(watches.filter((f) => f.fancy))} fancy watches (want >= 2)`);
  if (sum(knick) < 5) bad.push(`${sum(knick)} frilly-knickers instances (want >= 5)`);
  if (sum(curios) < 20) bad.push(`${sum(curios)} curios (want >= 20)`);
  for (const c of FIND_COLLECTIONS) if (FINDS.filter((f) => f.collection === c.id).length < 3) bad.push(`collection ${c.id}: fewer than 3 finds`);
  for (const k of FIND_KINDS) if (FINDS.filter((f) => f.kind === k).length < 4) bad.push(`kind ${k}: fewer than 4 finds`);
  for (const r of [1, 2, 3, 4]) if (!FINDS.some((f) => f.rarity === r)) bad.push(`no rarity ${r}`);
  for (const kind of SPECIAL_LOTS.filter((k) => k !== 'kiosk')) if (!FINDS.some((f) => f.lot?.includes(kind))) bad.push(`nothing special to find in a ${kind}`);
  // every kind of container can hold a find (a legendary one must not be shut in a drawer no building has): the narrow kinds need fewer
  for (const c of CONTAINER_KINDS) { const n = FINDS.filter((f) => f.where.includes(c)).length; if (n < (c === 'locker' ? 2 : c === 'pantry' ? 2 : 3)) bad.push(`container ${c}: only ${n} finds can sit there`); }
  report(bad, 'volume gaps');
});
