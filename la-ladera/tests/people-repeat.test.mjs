// Nobody repeats anybody (R3-017: two cafe owners gave the same seven lines, goodbye included; two neighbours the same news and mood; two grandfathers opened with the same parqués line;
// one person repeated a line on a later visit). The engine keeps a barrio-wide memory per pool (dialogue.js newLineMemory, owned by the session) beside each NPC's own, and a persona
// draws from its own lines first and then from the shared ones, so two people of one persona differ until the bank is exhausted. Under Node, no browser. Every check has a mutant that
// turns it red (.scratch/a4/mutations_repeat.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-repeat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../js/people/lines/index.js';
import * as D from '../js/people/dialogue.js';
import { PERSONAS, bankOf } from '../js/people/personas.js';
import { makeRng } from '../js/core/rng.js';

const LM = [
  { id: 'mirador', name: 'Mirador del Cielo', en: 'Sky Viewpoint', kind: 'viewpoint', x: 26, y: 29, z: -91 },
  { id: 'cancha', name: 'Cancha El Cerro', en: 'El Cerro Court', kind: 'court', x: -58, y: 0, z: 77 },
  { id: 'capilla', name: 'Capilla de la Virgen del Carmen', en: 'Chapel of Our Lady of Mount Carmel', kind: 'chapel', x: 4, y: 10, z: -67 },
];
const here = { x: 0, y: 2, z: 0, yaw: 0 };
const newMemory = () => (D.newLineMemory ? D.newLineMemory() : null);
const genderOf = (persona) => (['vecino', 'abuelo', 'obrero', 'mototaxista'].includes(persona) ? 'm' : 'f');

/** One talk, the way a player has it: the opener, then mood, job, barrio, family, news, the goodbye. Returns [{ kind, es }] (the dynamic answers, the clock and the directions, left out). */
function talk(persona, id, { memory, mem, hour = 10, act = null, seed = 1 }) {
  const npc = { id, persona: bankOf(persona), name: 'Persona ' + id, gender: genderOf(persona), mem, shopName: PERSONAS[persona]?.kind === 'shop' ? 'Tienda Doña Rosa' : undefined, x: 0, z: -2, act };
  const d = new D.Dialogue({ npc, bank: BANK, rng: makeRng(seed).fork('npc:' + id), hour, world: { landmarks: LM, player: here, discoveries: [] }, address: 'm', memory });
  const out = []; let s = d.open(); out.push({ kind: 'open', es: s.line.es });
  for (const topic of ['mood', 'job', 'barrio', 'family', 'news']) {
    if (!d.availableTopics().includes(topic)) continue;
    s = d.pick(topic); if (s.line) out.push({ kind: topic, es: s.line.es });
  }
  s = d.pick('bye'); out.push({ kind: 'bye', es: s.line.es });
  return out;
}
const fresh = () => ({ met: 0, lastHour: null, used: {}, heard: new Set() });
const shared = (a, b) => { const sb = new Set(b.map((x) => x.es)); return [...new Set(a.map((x) => x.es))].filter((es) => sb.has(es)); };

// ---- the engine ------------------------------------------------------------------------------------------------------------------------------------------
test('takeLine: a line the barrio has said waits behind the ones nobody has, and the barrio starts a new round that never opens with the line just said', () => {
  const pool = [['a', 'a'], ['b', 'b'], ['c', 'c'], ['d', 'd']], barrio = new Set([0, 1]), rng = makeRng(3);
  for (let n = 0; n < 12; n++) {                                         // twelve different NPCs, one line each
    const before = new Set(barrio), got = D.takeLine(pool, new Set(), rng, barrio), i = pool.indexOf(got);
    if (before.size < pool.length) assert.ok(!before.has(i), `${got[0]} was said already (barrio ${[...before]}) while a free one was left`);
    assert.ok(barrio.size <= pool.length && barrio.has(i), 'the line is on the barrio\'s list');
  }
  const last = new Set([0, 1, 2]);                                        // one left: it goes, then the round starts over holding only the line just said
  assert.equal(D.takeLine(pool, new Set(), makeRng(1), last)[0], 'd'); assert.deepEqual([...last], [3]);
});

test('takeLine: this NPC never repeats itself before it has said everything, whatever the barrio has said', () => {
  const pool = [['a', 'a'], ['b', 'b'], ['c', 'c']], used = new Set(), barrio = new Set([0, 1, 2]), rng = makeRng(5), got = [];
  for (let n = 0; n < 3; n++) got.push(D.takeLine(pool, used, rng, barrio)[0]);
  assert.deepEqual(got.sort(), ['a', 'b', 'c']);
  // the barrio has said three of four lines and this NPC the fourth: it takes one the barrio has said (it has said the fourth itself), never its own again
  for (let seed = 1; seed <= 40; seed++) {
    const four = [['a', 'a'], ['b', 'b'], ['c', 'c'], ['d', 'd']], mine = new Set([3]), said = new Set([0, 1, 2]);
    assert.notEqual(D.takeLine(four, mine, makeRng(seed), said)[0], 'd', `seed ${seed}: it said "d" itself a moment ago`);
  }
});

test('R3-017: when the barrio has said everything the topic can say, a new round starts: the next person never repeats the line just said, and a round says each line once', () => {
  const size = (persona, k) => BANK.personas[bankOf(persona)][k].length + BANK.shared[k].length;
  for (const persona of ['vecina', 'abuelo']) {
    const memory = newMemory(), n = size(persona, 'news'), lines = [];
    for (let k = 0; k < 3 * n + 4; k++) {
      const npc = { id: `${persona}-${k}`, persona: bankOf(persona), name: 'N' + k, gender: genderOf(persona), mem: fresh(), x: 0, z: -2 };
      const d = new D.Dialogue({ npc, bank: BANK, rng: makeRng(9).fork('npc:' + k), hour: 10, world: { landmarks: LM, player: here, discoveries: [] }, memory });
      d.open(); lines.push(d.pick('news').line.es);
    }
    for (let k = 1; k < lines.length; k++) assert.notEqual(lines[k], lines[k - 1], `${persona}: persons ${k - 1} and ${k} said the same line`);
    assert.equal(new Set(lines.slice(0, n)).size, n, `${persona}: the first round of ${n} people says ${n} different lines`);
    const second = lines.slice(n, 2 * n - 1);
    assert.equal(new Set([lines[n - 1], ...second]).size, n, `${persona}: the second round (it opens holding the line just said) says each line once`);
  }
});

// ---- the barrio -------------------------------------------------------------------------------------------------------------------------------------------
const PAIRS = ['vecina', 'vecino', 'abuela', 'abuelo', 'cafe', 'tienda'];

test('R3-017: twelve talks, two people of each of six personas, in one session: they share no opener, mood, news, job, barrio, family or goodbye line', () => {
  const memory = newMemory(), seen = [];
  for (const persona of PAIRS) {
    const a = talk(persona, persona + '-1', { memory, mem: fresh(), seed: 11 }), b = talk(persona, persona + '-2', { memory, mem: fresh(), seed: 11 });
    seen.push(a, b);
    assert.deepEqual(shared(a, b), [], `${persona}: both said ${JSON.stringify(shared(a, b))}`);
    assert.ok(a.length >= 5 && b.length >= 5, `${persona}: ${a.length} and ${b.length} lines: a real talk`);
  }
  assert.equal(seen.length, 12);
});

test('R3-017: the same two NPCs with the SAME random seed still differ (the barrio memory, not luck)', () => {
  for (const persona of PAIRS) for (const hour of [9, 15, 20, 2]) {
    const memory = newMemory(), a = talk(persona, persona + '-1', { memory, mem: fresh(), hour, seed: 5 }), b = talk(persona, persona + '-2', { memory, mem: fresh(), hour, seed: 5 });
    assert.deepEqual(shared(a, b), [], `${persona} at ${hour}h: both said ${JSON.stringify(shared(a, b))}`);
  }
});

test('R3-017: a cast of the size the barrio has (four of a persona) says a different line each, for every kind of line, while the bank has them', () => {
  for (const persona of ['vecina', 'vecino', 'abuela', 'abuelo', 'nino', 'adolescente', 'cafe', 'tienda', 'obrero']) {
    const memory = newMemory(), talks = [0, 1, 2, 3].map((i) => talk(persona, `${persona}-${i}`, { memory, mem: fresh(), seed: 20 + i }));
    for (const kind of ['open', 'mood', 'news', 'bye']) {
      const lines = talks.map((t) => t.find((x) => x.kind === kind)?.es).filter(Boolean);
      assert.equal(new Set(lines).size, lines.length, `${persona} ${kind}: four people, ${new Set(lines).size} different lines: ${JSON.stringify(lines)}`);
    }
  }
});

test('R3-017: what they say when stopped (the parqués line of the grandfathers, the sweeping, the phone): two people stopped at the same task say different lines', () => {
  for (const [persona, act] of [['abuelo', 'play'], ['abuelo', 'sit'], ['abuela', 'sit'], ['vecina', 'sweep'], ['vecina', 'phone'], ['vecino', 'lean'], ['nino', 'bounce'], ['adolescente', 'phone']]) {
    const memory = newMemory(), openers = [];
    for (let i = 0; i < 4; i++) openers.push(talk(persona, `${persona}-${act}-${i}`, { memory, mem: fresh(), act, seed: 7 + i })[0].es);
    assert.equal(new Set(openers).size, 4, `${persona} stopped at "${act}": four openers, ${new Set(openers).size} different: ${JSON.stringify(openers)}`);
  }
});

test('R3-017: one person over four visits does not repeat a mood, news or goodbye line (with the barrio\'s memory and without it: the NPC\'s own memory is enough)', () => {
  for (const withMemory of [true, false]) for (const persona of ['vecina', 'abuelo', 'cafe', 'nino']) {
    const memory = withMemory ? newMemory() : null, mem = fresh(), seenBy = { mood: [], news: [], bye: [] };
    for (let visit = 0; visit < 4; visit++) {
      const t = talk(persona, persona + '-visit', { memory, mem, seed: 30 + visit });
      for (const k of Object.keys(seenBy)) { const x = t.find((y) => y.kind === k); if (x) seenBy[k].push(x.es); }
    }
    for (const [k, list] of Object.entries(seenBy)) assert.equal(new Set(list).size, list.length, `${persona} ${k} (memory ${withMemory}): ${JSON.stringify(list)}`);
  }
});

// ---- talk.js hands the session's memory to every conversation ----------------------------------------------------------------------------------------------
test('talk.js: the people of one session share one memory, so two neighbours stopped one after the other say different lines', async () => {
  const { Talk } = await import('../js/people/talk.js');
  const { Npc } = await import('../js/people/npc.js');
  const T0 = 100, subs = [];
  const player = { lock() {}, unlock() {}, s: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, eyeY: 1.6 };
  const ctx = { player, hour: 10, settings: null, events: { emit() {} }, discover: null, ui: { subtitle: (s) => subs.push(s), toast() {} } };
  const w = { ctx, t: T0, svc: { t: T0, doors: null }, player: { x: 0, z: 0, isPlayer: true }, landmarks: [], syncPlayer() {}, ui: { show() {}, hide() {}, setChoices() {} }, speech: { speak: () => ({}), cancel() {}, estimate: () => 1000 } };
  const talkTo = new Talk(w);
  const person = (persona, id, seed) => { const n = new Npc({ id, name: { display: 'Doña ' + id, full: id }, persona, bank: persona, gender: genderOf(persona), shopName: null, rng: makeRng(seed).fork('n') }); n.place(0, 0, -1.5, 0); n.stand({ t: T0 }, 'idle', 60, null, null); return n; };
  const said = (n) => { subs.length = 0; assert.equal(talkTo.begin(n), true); const out = [subs.at(-1).es]; for (const t of ['mood', 'news']) { talkTo.pick(t); out.push(subs.at(-1).es); } talkTo.leave(); return out; };
  const both = [];
  for (const persona of ['vecina', 'vecino', 'abuela', 'abuelo', 'nino', 'adolescente', 'obrero', 'maestra']) {
    const a = said(person(persona, persona + 'A', 3)), b = said(person(persona, persona + 'B', 3));
    both.push(...a.map((es, i) => (es === b[i] ? `${persona}: "${es}"` : null)).filter(Boolean));
  }
  assert.deepEqual(both, [], `the same line twice in a session: ${both.join(' | ')}`);
  assert.ok(w.lineMemory, 'the world carries the memory');
});

test('a session with no memory (the old way) still talks: nothing needs it', () => {
  const t = talk('vecina', 'solo', { memory: null, mem: fresh(), seed: 3 });
  assert.ok(t.length >= 5 && t.every((x) => x.es.length > 3));
});

test('the pools the barrio draws from are deep enough: every persona has at least 6 lines to give for its goodbye, news, mood, tip and opener (own and shared together)', () => {
  const size = (persona, k) => (BANK.personas[bankOf(persona)]?.[k]?.length ?? 0) + (BANK.shared[k] && BANK.shared[k] !== BANK.personas[bankOf(persona)]?.[k] ? BANK.shared[k].length : 0);
  const bad = [];
  for (const persona of Object.keys(PERSONAS)) {
    const topics = BANK.personas[bankOf(persona)]?.topics ?? ['mood', 'job', 'barrio', 'family', 'news', 'tip', 'where', 'time'];
    for (const k of ['bye', 'bye_n', 'again', 'greet_m', 'greet_a', 'greet_e', 'greet_n', 'news', 'mood', 'tip']) {
      if (['news', 'mood', 'tip'].includes(k) && !topics.includes(k)) continue;
      const n = k === 'bye' ? size(persona, 'bye') : size(persona, k);
      if (n < 6) bad.push(`${persona}.${k}=${n}`);
    }
  }
  const acts = new Set(Object.keys(BANK.shared).filter((k) => k.startsWith('act_')));
  for (const persona of Object.keys(PERSONAS)) for (const k of acts) if (size(persona, k) < 4) bad.push(`${persona}.${k}=${size(persona, k)}`);          // what they were doing when stopped: four lines at least
  assert.deepEqual(bad, [], `shallow pools: ${bad.join(' ')}`);
});
