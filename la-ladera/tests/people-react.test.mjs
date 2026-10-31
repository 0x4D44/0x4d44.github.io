// The residents' reactions to an opened drawer (js/people/reactions.js): who notices (awake, in that building, on that storey, in sight, facing it or close), the beat before
// they speak, one gentle line, never two at once, never the same person twice in a row, the second time a shrug; and the lines themselves (bilingual, short, kind, clean
// Spanish for every way the player is addressed). The unit tests run on a stub scene, the integration tests on the real barrio (a shopkeeper at the till).
// Every check here has a mutant that turns it red (.scratch/a4/mutations_react.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-react.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData, readAssetJson } from './headless.mjs';
import { PeopleSim } from '../js/people/sim.js';
import { Npc } from '../js/people/npc.js';
import { Events } from '../js/core/events.js';
import { makeRng } from '../js/core/rng.js';
import { fillTokens } from '../js/people/dialogue.js';
import { CONTAINER_KINDS } from '../js/interiors/content.js';
import { Reactions, POOLS, POOL_OF_GROUP, poolFor, REACH, NEAR, COOLDOWN, GLOBAL_GAP, MAX_PER_WINDOW, WINDOW } from '../js/people/reactions.js';

// ---- the lines ---------------------------------------------------------------------------------------------------------------------------------------
const HOSTILE_ES = /(lárgu|fuera de aquí|ladr[oó]n|polic[ií]a|llamo a|quieto|salga|idiota|est[uú]pid|maldit|carajo|sinverg[uü]enza|robar|robando|mal educad|grosero|cállese|ya basta)/i;
const HOSTILE_EN = /(get out|thief|steal|police|stupid|idiot|damn|how dare|shut up|leave now|hands off)/i;
const SPAIN = /(\bvale\b|vosotros|chaval|coger el autobús|ordenador|\bmóvil\b|\bguay\b|hostia|joder|\bmolar\b|\bcurrar\b)/i;
function problems(es, en, where) {
  const out = [];
  if (!es || !en) return [`${where}: a language is missing`];
  if (/(^|[ ¿¡"(])[Aa] el(?= )/.test(es)) out.push('a el');
  if (/(^|[ ¿¡"(])[Dd]e el(?= )/.test(es)) out.push('de el');
  if (/\s{2,}/.test(es) || /\s{2,}/.test(en)) out.push('doubled space');
  if (/\{|\}/.test(es) || /\{|\}/.test(en)) out.push('unreplaced token');
  if (/(^|[.!?]\s+)[¿¡]?[a-záéíóúñ]/.test(es)) out.push('lowercase sentence start');
  if (/(^|[.!?]\s+)[¿¡]?[a-z]/.test(en)) out.push('lowercase English sentence start');
  if (!/^[¿¡]?[A-ZÁÉÍÓÚÑ]/.test(es) || !/^[¿¡]?[A-Z]/.test(en)) out.push('does not start with a capital');
  if (!/[.!?…]$/.test(es) || !/[.!?…]$/.test(en)) out.push('does not end with a stop');
  if (es.length > 90 || en.length > 90) out.push(`${es.length}/${en.length} chars (a subtitle line is short)`);
  if (/ [,.;:!?]/.test(es) && !/ \.\.\./.test(es)) out.push('space before punctuation');
  if (/,,|\.\.(?!\.)|¿¿|\?\?/.test(es)) out.push('doubled punctuation');
  if (SPAIN.test(es)) out.push('a word of Spain, not of Colombia');
  if (HOSTILE_ES.test(es) || HOSTILE_EN.test(en)) out.push('hostile');
  return out.map((p) => `${where}: ${p}: ${es} | ${en}`);
}
const render = (pair, gender, address) => fillTokens({ es: pair[0], en: pair[1] }, { gender, address, name: 'Rosa', shopName: 'Tienda La Esperanza' });

test('lines: every pool line is bilingual, short, kind and clean for both genders of speaker and both ways the player is addressed', () => {
  let total = 0; const bad = [];
  for (const [name, pool] of Object.entries(POOLS)) {
    assert.ok(pool.length >= 2, `pool ${name} has ${pool.length} lines`);
    for (const pair of pool) {
      total++;
      for (const g of ['m', 'f']) for (const a of ['m', 'f']) { const l = render(pair, g, a); bad.push(...problems(l.es, l.en, `${name}/${g}${a}`)); }
    }
  }
  assert.deepEqual(bad, []);
  assert.ok(total >= 30, `${total} lines`);
  assert.ok(POOLS.private.length >= 6, 'the "private" pool, the one the lead asked for, has 6+ lines');
  assert.ok(POOLS.private.some((p) => /privado/.test(p[0])), 'the line the lead wrote ("¡Eso es privado, vecino!") is in');
});

test('lines: the address forms follow the player ({vecino} -> vecina), never both, and a line says the same in both languages (a number or a name is in both)', () => {
  for (const [name, pool] of Object.entries(POOLS)) for (const pair of pool) {
    const m = render(pair, 'm', 'm'), f = render(pair, 'm', 'f');
    assert.ok(!/\b(vecino|mijo|mijito|señor|amigo)\b/i.test(f.es), `${name}: "${f.es}" speaks to a woman player in the masculine (write {vecino}, not vecino)`);
    assert.ok(!/\b(vecina|mija|mijita|señora|amiga)\b/i.test(m.es), `${name}: "${m.es}" speaks to a man player in the feminine`);
    if (!/\{(vecino|mijo)\}/.test(pair[0])) assert.equal(m.es, f.es, `${name}: a line without an address form is the same for both players`);
    assert.ok(!/vecino|vecina|mijo|mija/.test(pair[1]), `${name}: the English line does not carry a Spanish address form (${pair[1]})`);
  }
});

test('pools: every container kind the interiors can open (A3 / content.js) has a pool; every pool is reachable; the speaker decides', () => {
  const pools = new Set(Object.keys(POOLS));
  for (const k of CONTAINER_KINDS) assert.ok(POOL_OF_GROUP[k], `container kind "${k}" has no pool: add it to POOL_OF_GROUP`);
  for (const [k, p] of Object.entries(POOL_OF_GROUP)) assert.ok(pools.has(p), `${k} -> ${p} is not a pool`);
  const people = [{ age: 'adult' }, { age: 'elder' }, { age: 'teen' }, { age: 'kid' }, { age: 'adult', shopLotId: 'L1' }], reached = new Set(['again']);     // (`again` is the second time round, chosen in _fire)
  for (const k of [...CONTAINER_KINDS, 'something-new']) for (const n of people) reached.add(poolFor(n, k, 'L1'));
  for (const p of pools) assert.ok(reached.has(p), `pool ${p} can never be drawn`);
  assert.equal(poolFor({ age: 'adult', shopLotId: 'L1' }, 'counter', 'L1'), 'ownerTill', 'the keeper at their own till');
  assert.equal(poolFor({ age: 'adult', shopLotId: 'L1' }, 'counter', 'L2'), 'till', 'a keeper in somebody else\'s shop is just a person at a till');
  assert.equal(poolFor({ age: 'kid' }, 'nightstand', 'L1'), 'kid');
  assert.equal(poolFor({ age: 'elder' }, 'wardrobe', 'L1'), 'elder');
  assert.equal(poolFor({ age: 'adult' }, 'fridge', 'L1'), 'food');
});

// ---- who notices, and when -----------------------------------------------------------------------------------------------------------------------------
/** A stub barrio: one building ("L1") unless told otherwise, nothing solid unless `blocked()` says so; time advances by hand. */
function stub(o = {}) {
  const events = new Events();
  const sim = {
    ctx: { events, settings: { v: { address: o.address ?? 'm' } } }, t: 100, ready: true, player: { x: 0, y: 0, z: 5, isPlayer: true }, npcs: [], rng: makeRng(5).fork('people'),
    physics: { segmentBlocked: (...a) => (o.blocked ? o.blocked(...a) : false) }, lotAt: (x, z) => (o.lot ? o.lot(x, z) : 'L1'), talkBusy: false, talk: null,
    _later: [], shown: [],
    later(d, fn) { this._later.push({ at: this.t + d, fn }); },
    advance(secs, dt = 0.1) { for (let s = 0; s < secs; s += dt) { this.t += dt; for (const j of this._later.filter((q) => q.at <= this.t)) { this._later.splice(this._later.indexOf(j), 1); j.fn(); } } },
    onReact(n, line, ev) { this.shown.push({ id: n.id, ...line }); },
  };
  sim.reactions = new Reactions(sim);
  return sim;
}
function person(sim, id, x, z, o = {}) {
  const n = new Npc({ id, name: { display: o.display ?? id, full: id }, persona: 'vecina', bank: 'vecina', age: o.age ?? 'adult', gender: o.gender ?? 'f', rng: makeRng(9).fork(id) });
  n.place(x, o.y ?? 0, z, o.ry ?? 0); n.shopLotId = o.shop ?? null; n.shopName = o.shopName ?? null; n.mode = o.mode ?? 'idle'; n.act = 'idle'; n.until = 1e9;
  sim.npcs.push(n); return n;
}
const OPEN = (o = {}) => ({ id: 'c1', building: 'L1', kind: 'drawer', group: 'nightstand', x: 0, y: 0.6, z: 2, ...o });
const open = (sim, ev = OPEN()) => { sim.ctx.events.emit('container:open', ev); };

test('a person in the room who faces the container notices: after a beat they turn to the player and say one line from the right pool', () => {
  const sim = stub(), n = person(sim, 'a', 0, 0, { ry: 0 });
  open(sim);
  assert.equal(sim.shown.length, 0, 'not at once: first the raised eyebrow');
  sim.advance(0.5); assert.equal(sim.shown.length, 0, 'still not after half a second');
  sim.advance(1.3);
  assert.equal(sim.shown.length, 1, 'one line within two seconds');
  const l = sim.shown[0];
  assert.equal(l.id, 'a'); assert.equal(l.pool, 'private');
  assert.ok(POOLS.private.some((p) => fillTokens({ es: p[0], en: p[1] }, { gender: 'f', address: 'm' }).es === l.es), `"${l.es}" is a line of the private pool`);
  assert.equal(n.mode, 'talk', 'they stop and turn to the player while they say it');
  assert.equal(n.talkWith, sim.player, 'facing the player (the walker turns towards talkWith)');
  sim.advance(8); assert.equal(n.mode, 'idle', 'then back to what they were doing');
  assert.equal(n.talkWith, null);
});

test('only the nearest of two witnesses speaks, and only once per opening', () => {
  const sim = stub(), far = person(sim, 'far', 0, -3), near = person(sim, 'near', 0.5, 0.5);
  open(sim); sim.advance(3);
  assert.deepEqual(sim.shown.map((s) => s.id), ['near']);
  assert.equal(far.mode, 'idle');
});

test('nobody notices what they cannot see: a wall between, another building, another storey, away, busy in a conversation, the player in a conversation', () => {
  const cases = [
    ['a room wall between', { blocked: () => true }, {}, null],
    ['another building', { lot: () => 'L2' }, {}, null],
    ['upstairs', {}, { y: 3.0 }, null],
    ['the drawer is 11 m away (the player stands next to the person, so only the reach says no)', {}, { at: [0, -9], player: [0, -8] }, null],
    ['away (hidden inside)', {}, {}, (n) => { n.away = true; }],
    ['already talking', {}, {}, (n) => { n.mode = 'talk'; }],
    ['holding an inner door open', {}, {}, (n) => { n.gate = 'L1.d1'; }],
    ['the player is in a conversation', {}, {}, (n, sim) => { sim.talkBusy = true; }],
  ];
  for (const [what, so, po, mut] of cases) {
    const sim = stub(so), n = person(sim, 'a', ...(po.at ?? [0, 0]), po); mut?.(n, sim);
    if (po.player) [sim.player.x, sim.player.z] = po.player;
    open(sim); sim.advance(3);
    assert.equal(sim.shown.length, 0, `${what}: nobody reacts`);
  }
  const busy = stub(); person(busy, 'a', 0, 0); busy.talkBusy = true; open(busy); busy.advance(2); busy.talkBusy = false;
  open(busy, OPEN({ id: 'c2' })); busy.advance(3);
  assert.equal(busy.shown.length, 1, 'an opening that was ignored (the player was talking) does not use up the six-second gap of the next one');
  const ok = stub(); person(ok, 'a', 0, 0); open(ok); ok.advance(3); assert.equal(ok.shown.length, 1, 'control: the same scene without the obstacle gets its reaction');
});

test('a person with their back turned does not see it from afar but hears a drawer next to them', () => {
  const far = stub(); person(far, 'a', 0, -3, { ry: Math.PI }); open(far, OPEN({ z: 1.5 })); far.advance(3);
  assert.equal(far.shown.length, 0, `${(1.5 + 3).toFixed(1)} m away and looking the other way: not noticed (NEAR is ${NEAR} m)`);
  const near = stub(); person(near, 'a', 0, 0, { ry: Math.PI }); open(near, OPEN({ z: 1.5 })); near.advance(3);
  assert.equal(near.shown.length, 1, '1.5 m away, back turned: they hear the drawer');
  assert.ok(REACH > 6 && NEAR > 2, 'a shop is a few metres across');
});

test('the person who stops to say it comes back to what they were doing: a walker walks on, a shopkeeper goes on selling', () => {
  const sim = stub(), w = person(sim, 'w', 0, 0, { mode: 'walk' });
  w.path = [{ x: 0, z: 1 }, { x: 0, z: 2 }]; w.pi = 0; w.arrive = null; w.moving = true; w.act = 'walk';
  open(sim); sim.advance(1.8);
  assert.equal(w.mode, 'talk'); assert.equal(w.moving, false);
  sim.advance(8);
  assert.equal(w.mode, 'walk', 'back to the walk'); assert.equal(w.path.length, 2, 'with the same path'); assert.equal(w.pi, 0);
  const s2 = stub(), k = person(s2, 'k', 0, 0); k.act = 'sell'; k.until = s2.t + 500;
  open(s2); s2.advance(8);
  assert.equal(k.mode, 'idle'); assert.equal(k.act, 'sell', 'still selling'); assert.ok(k.until > s2.t, 'the task has not expired');
});

test('never two at once, never the same person twice in a row; a second time within five minutes is a shrug; the third is the last', () => {
  const sim = stub(), n = person(sim, 'a', 0, 0), m = person(sim, 'b', 1.5, -0.5);     // a is 2.0 m from the drawer, b 2.9 m: a is the nearer
  open(sim); sim.advance(2.5);                                               // a speaks
  open(sim, OPEN({ id: 'c2' })); sim.advance(2.5);                           // < GLOBAL_GAP after the first: nobody
  assert.equal(sim.shown.length, 1, `within ${GLOBAL_GAP} s of the first, nobody else speaks (${sim.shown.map((s) => s.id)})`);
  sim.advance(GLOBAL_GAP);                                                   // gap over, a is still in its cool-down: b takes it
  open(sim, OPEN({ id: 'c3' })); sim.advance(2.5);
  assert.deepEqual(sim.shown.map((s) => s.id), ['a', 'b'], `a is in its ${COOLDOWN} s cool-down: b answers`);
  sim.advance(COOLDOWN); open(sim, OPEN({ id: 'c4' })); sim.advance(2.5);
  const third = sim.shown[2]; assert.equal(third.id, 'a'); assert.equal(third.pool, 'again', 'second time within five minutes: the shrug');
  assert.ok(POOLS.again.some((p) => fillTokens({ es: p[0], en: p[1] }, { gender: 'f', address: 'm' }).es === third.es));
  sim.advance(COOLDOWN + GLOBAL_GAP); open(sim, OPEN({ id: 'c5' })); sim.advance(2.5);
  sim.advance(COOLDOWN + GLOBAL_GAP); open(sim, OPEN({ id: 'c6' })); sim.advance(2.5);
  const byA = sim.shown.filter((s) => s.id === 'a').length, byB = sim.shown.filter((s) => s.id === 'b').length;
  assert.ok(byA <= MAX_PER_WINDOW && byB <= MAX_PER_WINDOW, `nobody reacts more than ${MAX_PER_WINDOW} times in ${WINDOW} s (a ${byA}, b ${byB})`);
  assert.ok(byA === MAX_PER_WINDOW || byB === MAX_PER_WINDOW, 'but they do get to the limit');
  const before = sim.shown.length;
  sim.advance(WINDOW + 5); open(sim, OPEN({ id: 'c7' })); sim.advance(2.5);
  assert.equal(sim.shown.length, before + 1, 'after five quiet minutes somebody reacts again');
  assert.equal(sim.shown.at(-1).id, 'a', 'and it is the one who had reached the limit (the nearer one): the count starts over');
  assert.notEqual(sim.shown.at(-1).pool, 'again', 'a fresh first reaction, not the shrug');
});

test('a line is not repeated to the same person until their pool has been through', () => {
  const sim = stub(); person(sim, 'a', 0, 0);
  const seen = new Set(), n = POOLS.private.length;
  for (let i = 0; i < n; i++) {
    sim.advance(WINDOW + COOLDOWN + 1);                                         // every opening is a fresh "first" reaction
    open(sim, OPEN({ id: 'c' + i })); sim.advance(2.5);
    seen.add(sim.shown.at(-1).es);
  }
  assert.equal(seen.size, n, `${n} openings, ${seen.size} different lines`);
});

test('the player leaving the building, or a conversation starting, cancels a line that was about to be said', () => {
  const sim = stub(), n = person(sim, 'a', 0, 0);
  open(sim); sim.ctx.events.emit('player:exit', { buildingId: 'L1' }); sim.advance(3);
  assert.equal(sim.shown.length, 0, 'the player has left');
  const s2 = stub(); person(s2, 'a', 0, 0);
  open(s2); s2.advance(0.4); s2.talkBusy = true; s2.advance(3);
  assert.equal(s2.shown.length, 0, 'the player began a conversation');
  const s3 = stub(); person(s3, 'a', 0, 0);
  open(s3); s3.ctx.events.emit('player:exit', { buildingId: 'L9' }); s3.advance(3);
  assert.equal(s3.shown.length, 1, 'leaving some other building changes nothing');
});

test('if the moment passes during the beat (the person goes indoors, a wall closes, the player walks off) nothing is said', () => {
  const gone = stub(), a = person(gone, 'a', 0, 0); open(gone); gone.advance(0.3); a.away = true; gone.advance(3);
  assert.equal(gone.shown.length, 0, 'they went indoors');
  let wall = false; const shut = stub({ blocked: () => wall }); person(shut, 'a', 0, 0); open(shut); shut.advance(0.3); wall = true; shut.advance(3);
  assert.equal(shut.shown.length, 0, 'a door shut between them');
  const off = stub(); person(off, 'a', 0, 0); open(off); off.advance(0.3); off.player.z = 60; off.advance(3);
  assert.equal(off.shown.length, 0, 'the player walked away');
  const stay = stub(); person(stay, 'a', 0, 0); open(stay); stay.advance(0.3); stay.player.z = 6; stay.advance(3);
  assert.equal(stay.shown.length, 1, 'control: a step or two does not matter');
});

test('a conversation that begins while they are reacting keeps them: the reaction does not end it', () => {
  const sim = stub(), n = person(sim, 'a', 0, 0);
  open(sim); sim.advance(1.8);
  assert.equal(n.mode, 'talk');
  sim.talk = { npc: n };                                                      // the player has pressed E on them
  sim.advance(10);
  assert.equal(n.mode, 'talk', 'the conversation owns them now');
});

test('the way the player is addressed is respected, and a speaking woman and man both come out well', () => {
  const sim = stub({ address: 'f' }); person(sim, 'a', 0, 0);
  open(sim, OPEN({ group: 'nightstand' })); sim.advance(3);
  const said = sim.shown[0].es;
  assert.ok(!/\bvecino\b/.test(said), `a woman player is never "vecino": ${said}`);
  const ss = stub(); person(ss, 'o', 0, 0, { shop: 'L1', shopName: 'Panadería Doña Rosa' });
  open(ss, OPEN({ group: 'counter' })); ss.advance(3);
  assert.equal(ss.shown[0].pool, 'ownerTill', 'the keeper at their own till is the owner');
});

test('one simulation per event bus: a second one replaces the first (tests and reloads build many), so an opening is answered once', () => {
  const bus = new Events(), mk = () => { const s = stub(); s.ctx.events = bus; s.reactions = new Reactions(s); person(s, 'a', 0, 0); return s; };
  const first = mk(), second = mk();
  bus.emit('container:open', OPEN()); first.advance(3); second.advance(3);
  assert.equal(first.shown.length, 0, 'the first simulation no longer listens');
  assert.equal(second.shown.length, 1, 'the second one does');
});

test('a malformed event is ignored, never an exception', () => {
  const sim = stub(); person(sim, 'a', 0, 0);
  for (const ev of [null, undefined, {}, { building: 'L1' }, { building: 'L1', x: NaN, z: 1 }, { x: 0, z: 1 }]) assert.doesNotThrow(() => sim.reactions.onOpen(ev));
  sim.advance(3); assert.equal(sim.shown.length, 0);
});

// ---- the real barrio -------------------------------------------------------------------------------------------------------------------------------------
let _world = null;
async function world() {
  if (_world) return _world;
  const { ctx, plan } = await buildData({ furnish: true, colliders: true });
  const META = await readAssetJson('people/people_meta.json');
  return (_world = { ctx, plan, METAS: new Map(META.people.map((m) => [m.id, m])) });
}
async function fresh(hour) {
  const { ctx, plan, METAS } = await world();
  for (const [id] of ctx.physics.doors) ctx.physics.setDoor(id, false);
  ctx.hour = hour; ctx.errors = [];
  const sim = new PeopleSim(ctx); assert.ok(sim.build(METAS));
  const sp = plan.spawn; sim.setPlayer(sp.x, sp.y ?? 0, sp.z, 0);
  sim.shown = []; sim.onReact = (n, line) => { sim.shown.push({ id: n.id, ...line }); };
  return { sim, ctx, plan };
}
const run = (sim, secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) sim.step(dt); };

test('the barrio: a customer opens the shop\'s till and the keeper, behind the counter, answers once, as the owner; in a building where nobody is, nothing happens', async () => {
  const { sim, ctx } = await fresh(12); run(sim, 6);
  const shop = [...sim.shops.values()].find((s) => s.open && s.cust[0] && !s.sealed && Math.hypot(s.post.x - s.cust[0].x, s.post.z - s.cust[0].z) > 1.2);
  assert.ok(shop, 'an open shop with a keeper at the post and a customer spot');
  const k = sim.byId.get(shop.keeper), c = shop.cust[0];
  sim.setPlayer(c.x, c.y ?? shop.post.y, c.z, 0);
  const tx = shop.post.x + (c.x - shop.post.x) * 0.4, tz = shop.post.z + (c.z - shop.post.z) * 0.4;
  ctx.events.emit('container:open', { id: 'test:till', building: shop.lot, kind: 'drawer', group: 'counter', x: tx, y: shop.post.y + 0.9, z: tz });
  assert.equal(sim.shown.length, 0, 'not at once');
  run(sim, 3);
  assert.equal(sim.shown.length, 1, 'the keeper reacted once');
  assert.equal(sim.shown[0].id, k.id); assert.equal(sim.shown[0].pool, 'ownerTill');
  assert.equal(sim.reactions.log.at(-1).building, shop.lot);
  run(sim, 9); assert.notEqual(k.mode, 'talk', 'and went back to the counter');
  assert.ok(Math.hypot(k.x - shop.post.x, k.z - shop.post.z) < 1.3, 'at the post');
  // a house in the middle of the night: nobody is awake in it
  const night = await fresh(3); run(night.sim, 3);
  const home = night.plan.lots.find((l) => ['house', 'rowhouse'].includes(l.kind) && !l.shop);
  night.sim.setPlayer(home.x, home.y ?? 0, home.z, 0);
  night.ctx.events.emit('container:open', { id: 'test:dresser', building: home.id, kind: 'drawer', group: 'dresser', x: home.x, y: 1, z: home.z });
  run(night.sim, 4); assert.equal(night.sim.shown.length, 0, 'nobody awake in the house at 3');
});

test('the barrio: a hundred openings in a hundred places never throw, never put anybody in a wall, and leave nobody talking', async () => {
  const { sim, ctx, plan } = await fresh(11); run(sim, 4);
  const lots = plan.lots.filter((l) => ctx.buildings.get(l.id)), shops = [...sim.shops.values()].filter((s) => s.open && s.cust[0]), rng = makeRng(77);
  assert.ok(shops.length >= 10, `${shops.length} open shops with a customer spot`);
  for (let i = 0; i < 100; i++) {
    const group = ['counter', 'dresser', 'fridge', 'wardrobe', 'locker'][i % 5];
    if (i % 2) {                                                                        // a customer at a shop counter
      const s = shops[Math.floor(rng.next() * shops.length)], c = s.cust[0];
      sim.setPlayer(c.x, c.y ?? s.post.y, c.z, 0);
      ctx.events.emit('container:open', { id: 'f' + i, building: s.lot, kind: 'drawer', group, x: (s.post.x + c.x) / 2, y: s.post.y + 0.9, z: (s.post.z + c.z) / 2 });
    } else {                                                                            // anywhere else
      const l = lots[Math.floor(rng.next() * lots.length)];
      sim.setPlayer(l.x, l.y ?? 0, l.z, 0);
      ctx.events.emit('container:open', { id: 'f' + i, building: l.id, kind: 'drawer', group, x: l.x + 1, y: l.y ?? 0, z: l.z });
    }
    run(sim, 1.2);
  }
  run(sim, 15);
  assert.ok(sim.shown.length >= 1, `${sim.shown.length} of the openings were noticed (a keeper is not always at the till, and the ${GLOBAL_GAP} s gap lets few through)`);
  assert.equal(sim.faults.length, 0, `faults: ${JSON.stringify(sim.faults.slice(0, 2))}`);
  assert.equal(sim.npcs.filter((n) => n.mode === 'talk').length, 0, 'nobody is left in the middle of a reaction');
});
