// R3-003 (owner: A1), in headless Chrome: with the crosshair on a person's face from where a player talks (1.5 m), E must target THAT person, not the counter, the till,
// the bread box or the door beside them; and nothing says "E ..." over their face while the conversation (any lock on the player) runs.
// For every person in the barrio: __ladera.lookAtNpc(id, { dist: 1.5 }) (the reviewers' helper: the player in front of them, aimed at the face), two frames, then what is targeted.
// People standing on one spot (two children on the same spot of the court) cannot be told apart by any aim: they are listed and must still give a PERSON, but are not scored.
// Quiet box: the browser comes only from tests/chrome.mjs (headless, nothing on the user's screen or speakers).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interact-people.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

let b, page;
before(async () => {
  b = await launch({ width: 1280, height: 720 });
  page = await b.open('la-ladera/index.html?autostart&manual');
  await page.eval('__ladera.setHour(16.5); __ladera.step(600)', 600000);                            // half past four, ten seconds of life: every shop open, the court busy
});
after(async () => { await b?.close(); });

/** For every person: frame them, step, and report what E would use and what stood in the way of the person's own item. */
const probe = (dist) => page.eval(`(() => {
  const L = window.__ladera, ctx = L.ctx, items = ctx.interact.items, out = [], v = new ctx.THREE.Vector3();
  for (const n of L.npcs()) {
    const r = L.lookAtNpc(n.id, { dist: ${dist} }); L.step(2);
    const st = L.state(), t = st.target, eye = ctx.camera.position, dir = ctx.camera.getWorldDirection(v), own = items.get('npc:' + n.id);
    const row = { id: n.id, shop: !!n.shop, ok: !!r.ok, drawn: !!r.drawn, indoors: !!st.indoors, tid: t ? t.id : null, kind: t ? t.kind : null, prompt: t ? t.prompt : null, hit: t?.id === 'npc:' + n.id, co: false, cov: null, own: null };
    if (r.ok && own) {
      row.own = +own.hit(ctx, own, eye, dir).toFixed(2);
      for (const [id, it] of items) {
        if (!id.startsWith('npc:') || it === own || !it.enabled(ctx, it)) continue;
        const tt = it.hit(ctx, it, eye, dir);
        if (Math.hypot(it.x - own.x, it.z - own.z) < 0.25) row.co = true;                                     // on one spot with them
        else if (tt >= 0 && row.own >= 0 && tt < row.own - 0.05) row.cov = id + ' at ' + tt.toFixed(2) + ' m';   // another body is entered first
      }
    }
    out.push(row);
  }
  return out;
})()`, 900000);

const pct = (a, f) => (a.length ? a.filter(f).length / a.length : 0);
const lines = (rows) => rows.map((r) => `${r.id}${r.shop ? '*' : ''}${r.indoors ? ' (in)' : ''} -> ${r.tid ?? 'nothing'}${r.prompt ? ' "' + r.prompt + '"' : ''}${r.cov ? ' [' + r.cov + ']' : ''} own ${r.own}`).join('\n  ');

test('E targets the person with the crosshair on their face at 1.5 m: all drawn people, the 28 shopkeepers included', async () => {
  const rows = await probe(1.5);
  const drawn = rows.filter((r) => r.ok && r.drawn), shops = drawn.filter((r) => r.shop), co = drawn.filter((r) => r.co), scored = drawn.filter((r) => !r.co);
  assert.ok(drawn.length >= 80, `${drawn.length} of ${rows.length} people could be framed and drawn`);
  assert.ok(shops.length >= 28, `${shops.length} shopkeepers framed (the barrio has 28)`);
  const miss = scored.filter((r) => !r.hit), missShops = shops.filter((r) => !r.co && !r.hit);
  console.log(`# 1.5 m: ${scored.length - miss.length}/${scored.length} people target themselves (shopkeepers ${shops.length - missShops.length}/${shops.length}, indoors ${pct(scored.filter((r) => r.indoors), (r) => r.hit).toFixed(2)}); ${co.length} on a spot shared with someone: ${co.map((r) => r.id + (r.kind === 'npc' ? ' ok' : ' ' + r.tid)).join(', ')}`);
  assert.ok(pct(scored, (r) => r.hit) >= 0.95, `${miss.length} of ${scored.length} people did not get the aim:\n  ${lines(miss)}`);
  assert.ok(pct(shops.filter((r) => !r.co), (r) => r.hit) >= 0.95, `${missShops.length} of ${shops.length} shopkeepers did not get the aim:\n  ${lines(missShops)}`);
  assert.ok(co.length <= 6, `${co.length} people stand on another person's spot: ${co.map((r) => r.id).join(', ')}`);
  for (const r of co) assert.equal(r.kind, 'npc', `${r.id} shares a spot, but E must still talk to a person there, not ${r.tid}`);
  assert.ok(miss.every((r) => r.cov), `a miss must be another person's body in front of the face, never an object:\n  ${lines(miss.filter((r) => !r.cov))}`);
  const s = page.summary(); assert.deepEqual([...s.errors, ...s.consoleErrors, ...s.consoleWarnings], [], 'a clean console');
});

test('the prompt and the E hint stay hidden while the player is locked (a conversation), and come back with the crosshair on the person again', async () => {
  const S = (js) => page.eval(`(() => { const L = window.__ladera, ctx = L.ctx, $ = (q) => document.querySelector(q);
    const hud = () => { const p = $('#prompt'), c = $('#crosshair'); return { on: p.classList.contains('on'), text: p.textContent, kbd: !!p.querySelector('kbd'), hot: c.classList.contains('hot'), locked: !!ctx.player.locked, target: L.state().target?.id ?? null }; };
    ${js} })()`);
  const frame = (id) => S(`const r = L.lookAtNpc(${JSON.stringify(id)}, { dist: 1.5 }); L.step(2); return { ok: r.ok, ...hud() };`);
  const ids = await S(`return L.npcs().filter((n) => n.shop && n.drawn).map((n) => n.id);`);
  let id = null, s0 = null;
  for (const c of ids) { const r = await frame(c); if (r.ok && r.target === 'npc:' + c) { id = c; s0 = r; break; } }
  assert.ok(id, 'a shopkeeper with the aim on them');
  assert.deepEqual([s0.on, s0.kbd, s0.hot, s0.locked], [true, true, true, false], 'the prompt and the key hint are up, as before');
  assert.match(s0.text, /^EHablar con /, 'it offers the conversation: ' + s0.text);
  // a real conversation: the player is locked for the dialogue and the person's own item is disabled, so the old aim fell on the door or the till and its prompt hung over the face
  const talk = await S(`const ok = ctx.people.talk(${JSON.stringify(id)}); L.step(3); return { ok, ...hud() };`);
  assert.equal(talk.ok, true, 'the conversation started'); assert.equal(talk.locked, true, 'the player is locked for it');
  assert.deepEqual([talk.on, talk.text, talk.kbd, talk.hot], [false, '', false, false], `nothing says "E ..." while talking (target ${talk.target})`);
  const end = await S(`ctx.people.leave(); for (let i = 0; i < 90 && ctx.player.locked; i++) L.step(1); return hud();`);
  assert.equal(end.locked, false, 'the conversation ended and the player is free');
  const back = await frame(id); assert.ok(back.ok); assert.deepEqual([back.on, back.hot, back.locked], [true, true, false], 'the prompt is back for the next person or door');
  // any lock does it (a menu, a panel, a cutscene), not only the dialogue
  const lock = await S(`ctx.player.lock('r3-003-test'); L.step(3); const a = hud(); ctx.player.unlock('r3-003-test'); L.step(3); return { a, b: hud() };`);
  assert.deepEqual([lock.a.locked, lock.a.on, lock.a.hot], [true, false, false], 'a locked player has no prompt');
  assert.deepEqual([lock.b.locked, lock.b.on, lock.b.hot], [false, true, true], 'and gets it back when free');
  const s = page.summary(); assert.deepEqual([...s.errors, ...s.consoleErrors, ...s.consoleWarnings], [], 'a clean console');
});
