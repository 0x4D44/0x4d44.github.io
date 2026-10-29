// INTERIORS stories: what the player can do (Spanish E-prompts on objects, sitting, fans) and find (tiny stories = discoveries) inside buildings.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-stories.test.mjs
//   A3_SABOTAGE=<nostory|english|badname|inside|offfloor|nosit> makes the matching test fail (proof the test can fail).
import test from 'node:test';
import assert from 'node:assert/strict';
import { furnishedBatch, physicsFor, roomOf } from './interiors-lib.mjs';
import { obbDist } from '../js/interiors/layout.js';
import { clockWords } from '../js/interiors/stories.js';
import { setFan, fanOn } from '../js/interiors/anim.js';
import { sitDown, ensureSit, isSitting, stand } from '../js/interiors/sit.js';
import { SAY, STORY, SHOP_STORY, PLACE_STORY } from '../js/interiors/stories_text.js';

const SAB = process.env.A3_SABOTAGE;
const synth = await furnishedBatch({ n: +(process.env.A3_N || 42) });
const real = await furnishedBatch({ real: true });
const worlds = [['synthetic', synth], ['A2 plans', real]];

/** The first interactable of the world that belongs to a building, by prompt; used by the sabotage hooks. */
function sabotageWorld(w) {
  const D = [...w.ctx.discover.items.values()], I = [...w.ctx.interact.items.values()].filter((i) => i.id.startsWith('int:'));
  if (SAB === 'nostory') w.ctx.discover.items.clear();
  if (SAB === 'badname') D[0].name = 'The fridge corner';
  if (SAB === 'english') I.find((i) => i.prompt === 'Abrir la nevera').prompt = 'Open the fridge';
  if (SAB === 'offfloor') D[0].y += 1.4;                    // half way between two floors
  if (SAB === 'inside') {                                   // drop a target into the middle of a blocker
    const i = I.find((x) => x.kind === 'object' && x.prompt === 'Abrir la nevera'), bp = w.bps.find((b) => b.id === i.building);
    const f = bp.furniture.find((r) => r.name === 'fridge' || r.name === 'fridge_small');
    const [wx, , wz] = bp.frame.toWorld(f.x, 0, f.z); i.x = wx; i.z = wz;
  }
}
sabotageWorld(real); sabotageWorld(synth);

const report = (problems, what) => assert.equal(problems.length, 0, `${problems.length} ${what}:\n  ` + problems.slice(0, 12).join('\n  '));
const ours = (w) => [...w.ctx.interact.items.values()].filter((i) => i.id.startsWith('int:'));
const VERBS = /^(Abrir|Mirar|Mirarse|Leer|Ver|Prender|Apagar|Sentarse|Rezar|Acariciar|Tocar|Destapar|Servirse|Descolgar|Silbarle|Encender|Jalar|Hojear|Coser)\b/;
const ENGLISH = /\b(the|open|look|read|sit|and|with|of|to|press|turn)\b/i;
const SPANISH_IN_ENGLISH = /[¿¡]|\b(el|los|las|una|del|que|con|para|por|casa|barrio de)\b/i;      // an English gloss may keep Spanish names (Medellín), not Spanish sentences
const KINDS = new Set(['room', 'story', 'object', 'shrine', 'hidden']);
const promptOf = (w, i) => (typeof i.prompt === 'function' ? i.prompt(w.ctx, i) : i.prompt);

test('no errors while telling stories, and every building has interactables', () => {
  for (const [name, w] of worlds) {
    report((w.ctx.errors ?? []).filter((e) => e.stage === 'stories').map((e) => `${e.building}: ${e.message}`), `${name}: story errors`);
    const bare = w.bps.filter((b) => (b.interior?.stories?.interactables ?? 0) < 4 && b.furniture.length > 20).map((b) => b.id);
    report(bare, `${name}: furnished buildings with fewer than 4 interactables`);
    const heavy = w.bps.filter((b) => (b.interior?.stories?.interactables ?? 0) > 60).map((b) => b.id);
    report(heavy, `${name}: buildings with more than 60 interactables (the per-frame targeting scan)`);
  }
});

test('the world gets >= 24 interior discoveries (>= 12 on the synthetic batch), with Spanish names and an English line', () => {
  const nReal = real.ctx.discover.items.size, nSynth = synth.ctx.discover.items.size;
  assert.ok(nReal >= 24, `A2 plans: only ${nReal} interior discoveries (rubric C10: the world needs >= 24, A5 adds its own)`);
  assert.ok(nSynth >= 12, `synthetic: only ${nSynth} interior discoveries`);
  const problems = [];
  for (const [name, w] of worlds) {
    const ids = new Set();
    for (const d of w.ctx.discover.items.values()) {
      if (ids.has(d.id)) problems.push(`${name}: duplicate id ${d.id}`); ids.add(d.id);
      if (!KINDS.has(d.kind)) problems.push(`${d.id}: kind ${d.kind}`);
      if (!/[a-záéíóúñ]/i.test(d.name) || d.name.length < 6 || ENGLISH.test(d.name)) problems.push(`${d.id}: name not Spanish: ${d.name}`);
      if (!d.en || d.en.length < 25 || SPANISH_IN_ENGLISH.test(d.en)) problems.push(`${d.id}: English gloss missing / not English: ${d.en}`);
      if (!(d.radius >= 1 && d.radius <= 3.5) || !(d.dy > 0 && d.dy <= 1.6)) problems.push(`${d.id}: radius ${d.radius} dy ${d.dy}`);
    }
  }
  report(problems, 'discovery problems');
});

test('each discovery stands on a floor of its own building, inside a room, on free floor', () => {
  const problems = [];
  for (const [name, w] of worlds) for (const d of w.ctx.discover.items.values()) {
    const bp = w.bps.find((b) => b.id === d.building); if (!bp) { problems.push(`${name} ${d.id}: unknown building`); continue; }
    const [lx, , lz] = bp.frame.toLocal(d.x, d.y, d.z);
    const room = bp.rooms.find((r) => lx >= r.rect.x0 && lx <= r.rect.x1 && lz >= r.rect.z0 && lz <= r.rect.z1 && Math.abs(bp.lot.y + (r.y ?? 0) - d.y) < 0.25);
    if (!room) { problems.push(`${name} ${d.id}: no room of ${bp.id} at floor level ${d.y.toFixed(2)} contains (${lx.toFixed(2)}, ${lz.toFixed(2)})`); continue; }
    const L = bp.interior.layouts.get(room.id);
    for (const it of L.blockers()) if (obbDist(it.ob, lx, lz) < 0.15) { problems.push(`${name} ${d.id}: inside ${it.name} (${it.id})`); break; }
  }
  report(problems, 'misplaced discoveries');
});

test('every interior interactable has a Spanish prompt that starts with a verb, and a use() that speaks', () => {
  const problems = [];
  for (const [name, w] of worlds) {
    const calls = [];
    w.ctx.ui = { subtitle: (o) => calls.push(o), toast: (t) => calls.push({ toast: t }) };
    for (const i of ours(w)) {
      const p = promptOf(w, i);
      if (typeof p !== 'string' || !VERBS.test(p) || ENGLISH.test(p)) problems.push(`${name} ${i.id}: prompt ${JSON.stringify(p)}`);
      if (typeof i.use !== 'function') problems.push(`${name} ${i.id}: no use()`);
    }
    // use() each distinct prompt once: it must say something in both languages (sit and fans need a player: skipped)
    const done = new Set();
    for (const i of ours(w)) {
      const p = promptOf(w, i); if (done.has(p) || i.kind === 'sit' || /ventilador|lámpara/.test(p)) continue; done.add(p);
      calls.length = 0; i.use(w.ctx, i);
      const o = calls[0];
      if (!o?.es || !o?.en || !o?.who) problems.push(`${name} ${i.id} (${p}): use() said ${JSON.stringify(o)}`);
    }
  }
  report(problems, 'interactable problems');
});

test('interactables are on free floor in front of their object and can really be targeted (sight line not cut by a furniture outline)', () => {
  const problems = [];
  for (const [name, w] of worlds) {
    const byB = new Map(w.bps.map((b) => [b.id, b])), phs = new Map();
    for (const i of ours(w)) {
      const bp = byB.get(i.building); if (!bp) { problems.push(`${name} ${i.id}: unknown building`); continue; }
      const [lx, ly, lz] = bp.frame.toLocal(i.x, i.y, i.z);
      const room = bp.rooms.find((r) => lx >= r.rect.x0 - 0.01 && lx <= r.rect.x1 + 0.01 && lz >= r.rect.z0 - 0.01 && lz <= r.rect.z1 + 0.01 && ly >= (r.y ?? 0) - 0.05 && ly <= (r.y ?? 0) + (r.h ?? 2.6) + 0.05);
      if (!room) { problems.push(`${name} ${i.id}: outside every room of ${bp.id} at ${lx.toFixed(2)},${ly.toFixed(2)},${lz.toFixed(2)}`); continue; }
      const L = bp.interior.layouts.get(room.id), blockers = L.blockers();
      for (const b of blockers) if (obbDist(b.ob, lx, lz) < 0.12) { problems.push(`${name} ${i.id}: target inside / touching ${b.name}`); break; }
      // some floor cell within the interaction radius sees the target (what the player needs to press E)
      let ph = phs.get(bp.id); if (!ph) phs.set(bp.id, ph = physicsFor(bp));
      const fy = bp.lot.y + (room.y ?? 0), [tx, , tz] = [i.x, 0, i.z];
      let ok = false;
      for (let ring = 0.5; ring <= 1.7 && !ok; ring += 0.3) for (let a = 0; a < 16 && !ok; a++) {
        const cx = lx + Math.cos(a * Math.PI / 8) * ring, cz = lz + Math.sin(a * Math.PI / 8) * ring;
        if (cx < room.rect.x0 + 0.3 || cx > room.rect.x1 - 0.3 || cz < room.rect.z0 + 0.3 || cz > room.rect.z1 - 0.3) continue;
        if (blockers.some((b) => obbDist(b.ob, cx, cz) < 0.3)) continue;
        const [wx, , wz] = bp.frame.toWorld(cx, 0, cz);
        if (Math.hypot(wx - tx, wz - tz, (fy + 1.64) - i.y) > (i.radius ?? 2.6)) continue;
        if (!ph.segmentBlocked(wx, wz, tx, tz, fy + 1.64 - 1.4, 1.2)) ok = true;
      }
      if (!ok) problems.push(`${name} ${i.id} (${promptOf(w, i)}): no standing spot sees it`);
    }
  }
  report(problems, 'untargetable interactables');
});

test('every reachable seat can be sat on; the sofas and armchairs of each home are offered', () => {
  for (const [name, w] of worlds) {
    const sits = ours(w).filter((i) => i.kind === 'sit');
    if (SAB === 'nosit') sits.length = 0;
    assert.ok(sits.length >= w.bps.length, `${name}: only ${sits.length} seats for ${w.bps.length} buildings`);
    for (const i of sits) assert.equal(i.prompt, 'Sentarse');
    const homes = w.bps.filter((b) => b.furniture.some((f) => /^sofa_|^armchair_/.test(f.name)));
    const without = homes.filter((b) => !sits.some((i) => i.building === b.id)).map((b) => b.id);
    report(without, `${name}: buildings with a sofa but no 'Sentarse'`);
  }
});

test('stories are deterministic: the same plan tells the same stories', async () => {
  const again = await furnishedBatch({ real: false, n: +(process.env.A3_N || 42) });
  const a = [...synth.ctx.discover.items.values()].map((d) => `${d.id}|${d.name}|${d.x}|${d.z}`).join('\n');
  const b = [...again.ctx.discover.items.values()].map((d) => `${d.id}|${d.name}|${d.x}|${d.z}`).join('\n');
  assert.equal(a, b);
});

test('texts: every SAY / STORY entry is a Spanish line with an English gloss; every shop type and special place has a story', () => {
  const problems = [];
  for (const [k, pool] of Object.entries(SAY)) for (const [es, en] of pool) {
    if (!es || !en || es.length < 20 || en.length < 15) problems.push(`SAY.${k}: too short`);
    if (/\b(the|and|with)\b/i.test(es)) problems.push(`SAY.${k}: Spanish line looks English: ${es}`);
  }
  for (const [k, s] of [...Object.entries(STORY), ...Object.entries(SHOP_STORY)]) {
    if (!s.name || !s.en || !KINDS.has(s.kind)) problems.push(`story ${k}: incomplete`);
    if (SPANISH_IN_ENGLISH.test(s.en)) problems.push(`story ${k}: the English gloss has Spanish words`);
  }
  for (const t of ['tienda', 'panaderia', 'fruver', 'carniceria', 'peluqueria', 'papeleria', 'drogueria', 'zapateria', 'modista', 'ferreteria', 'taller', 'cafe', 'restaurante', 'minutos']) {
    if (!SHOP_STORY[t]) problems.push(`no shop story for ${t}`);
    if (!SAY['shop_' + t]) problems.push(`no counter text for ${t}`);
  }
  for (const k of ['chapel', 'school', 'clinic', 'hall', 'tenement']) if (!PLACE_STORY[k]?.length) problems.push(`no place story for ${k}`);
  report(problems, 'text problems');
});

test('clock words: Spanish time of day in words', () => {
  assert.deepEqual(clockWords(13.5), ['Es la una y media de la tarde.', 'It is 1:30 pm.']);
  assert.deepEqual(clockWords(0), ['Son las 12 en punto de la madrugada.', 'It is 12:00 am.']);
  assert.deepEqual(clockWords(17.25), ['Son las 5 y cuarto de la tarde.', 'It is 5:15 pm.']);
  assert.deepEqual(clockWords(23.75), ['Son las 11 y 45 de la noche.', 'It is 11:45 pm.']);
  assert.deepEqual(clockWords(8), ['Son las 8 en punto de la mañana.', 'It is 8:00 am.']);
});

test('ceiling fans: switching changes the target speed and the prompt follows', () => {
  const ctx = { interiorAnim: { byId: new Map([['f1', { base: 5, want: 5, spd: 5 }], ['f2', { base: 6, want: 0, spd: 0 }]]) } };
  assert.equal(fanOn(ctx, 'f1'), true); assert.equal(fanOn(ctx, 'f2'), false); assert.equal(fanOn(ctx, 'nope'), false);
  assert.equal(setFan(ctx, 'f1'), false); assert.equal(ctx.interiorAnim.byId.get('f1').want, 0);
  assert.equal(setFan(ctx, 'f2'), true); assert.equal(ctx.interiorAnim.byId.get('f2').want, 6);
  assert.equal(setFan(ctx, 'f2', true), true); assert.equal(setFan(ctx, 'f2', false), false);
  assert.equal(setFan(ctx, 'nope'), null);
});

test('sitting: the camera moves to the seat, any walking key stands up, E stands up only when nothing is targeted', () => {
  const sys = [], cam = { position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } };
  const looks = [], toasts = [];
  const keys = new Set(), player = { keys, s: { x: 5, z: 5 }, building: 'B', setLook: (y, p) => looks.push([y, p]) };
  const ctx = { camera: cam, player, interact: { target: null }, ui: { toast: (t) => toasts.push(t) }, addSystem: (n, f, o) => sys.push({ n, f, o }) };
  ensureSit(ctx);
  const tick = (dt = 0.1) => sys.find((s) => s.n === 'interiors-sit').f(dt);
  assert.equal(sitDown(ctx, { building: 'B', seat: [5, 10, 6], seatH: 0.45, ry: 0, stand: [5, 5] }), true);
  assert.equal(isSitting(ctx), true); assert.equal(toasts.length, 1);
  assert.ok(Math.abs(looks[0][0] - Math.PI) < 1e-9, 'looks the way the seat faces');
  tick(); assert.ok(Math.abs(cam.position.y - (10 + 0.45 + 0.64)) < 1e-9 && Math.abs(cam.position.z - 6.12) < 1e-9, 'eye above the cushion');
  tick(); tick(); assert.equal(isSitting(ctx), true, 'still sitting');
  keys.add('KeyW'); tick(); assert.equal(isSitting(ctx), false, 'W stands up');
  keys.clear(); sitDown(ctx, { building: 'B', seat: [5, 10, 6], seatH: 0.45, ry: 0, stand: [5, 5] }); tick(0.4);
  ctx.interact.target = { id: 'x' }; keys.add('KeyE'); tick(); assert.equal(isSitting(ctx), true, 'E with a target keeps sitting');
  keys.delete('KeyE'); tick(); keys.add('KeyE'); ctx.interact.target = null; tick(); assert.equal(isSitting(ctx), false, 'E with nothing targeted stands up');
  keys.clear(); sitDown(ctx, { building: 'B', seat: [5, 10, 6], seatH: 0.45, ry: 0, stand: [5, 5] }); tick(0.4); player.s.x = 7; tick(); assert.equal(isSitting(ctx), false, 'walking away stands up');
  assert.equal(stand(ctx), false);
});
