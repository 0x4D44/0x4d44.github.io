// The phone layout (owner: A1): ?touch gives a desktop browser the coarse-pointer page, so it can be tested headless.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/ui-touch.test.mjs
// Review (round 2, phones): nobody knew where the stick was, the title card and the first toast spoke of WASD, and the answers card and the discovery toast took the middle of the view.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

let b, page;
const tick = (ms = 120) => page.eval(`new Promise((r) => setTimeout(r, ${ms}))`, 20000);
const R = `(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height, op: +cs.opacity, disp: cs.display, fs: parseFloat(cs.fontSize), text: e.textContent }; }`;
const rect = (s) => page.eval(`(${R})(${JSON.stringify(s)})`);
const mouse = (type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' });
const hits = (a, c) => a.x < c.r && a.r > c.x && a.y < c.b && a.b > c.y;
before(async () => {
  b = await launch({ width: 390, height: 844 });
  page = await b.open('la-ladera/index.html?touch&manual');
  await page.eval('window.__ladera.ready.then(() => true)', 240000);
});
after(async () => { await b?.close(); });

test('the title card on a phone speaks of the thumbs, not of WASD, and fits at 390x844 and 320x568', async () => {
  for (const [w, h] of [[390, 844], [320, 568]]) {
    await page.viewport(w, h); await tick(250);
    const m = JSON.parse(await page.eval(`(() => { const R = ${R}; const vis = (e) => { const r = e?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; };
      return JSON.stringify({ touch: document.body.classList.contains('touch'), keys: R('#title .keys'), tkeys: R('#title .tkeys'), kbd: [...document.querySelectorAll('#title .tkeys kbd')].length,
        startOn: vis(document.getElementById('start')), start: R('#start'), vw: innerWidth, vh: innerHeight, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }); })()`));
    assert.equal(m.touch, true, 'body.touch');
    assert.equal(m.keys.disp, 'none', `${w}x${h}: the keyboard strip is not shown on a phone`);
    assert.equal(m.tkeys.disp, 'flex', `${w}x${h}: the phone strip is`);
    assert.match(m.tkeys.text, /palanca|Pulgar izquierdo/i); assert.match(m.tkeys.text, /arrastra para mirar/i); assert.doesNotMatch(m.tkeys.text, /WASD|\bShift\b|\bEsc\b/);
    assert.ok(m.tkeys.x >= 0 && m.tkeys.r <= m.vw + 1 && m.over <= 1, `${w}x${h}: the strip stays inside the screen: ${JSON.stringify(m.tkeys)} over ${m.over}`);
    assert.ok(m.start.y >= 0 && m.start.b <= m.vh, `${w}x${h}: the start button is on screen`);
  }
  await page.viewport(390, 844); await tick(250);
});

test('Entrar on a phone: the first toast says stick left to walk, drag right to look; the stick is on screen from the first frame, labelled, clear of the buttons; the look hint goes away on the first drag', async () => {
  await page.eval('document.getElementById("start").click()'); await tick(500);
  const t = await rect('#toast');
  assert.ok(t.op > 0.5, 'the toast is up'); assert.match(t.text, /Palanca a la izquierda/); assert.match(t.text, /Arrastra a la derecha/); assert.doesNotMatch(t.text, /W A S D|Esc/);
  const m = JSON.parse(await page.eval(`(() => { const R = ${R}; const st = document.querySelector('#touch .stick');
    return JSON.stringify({ mode: document.body.dataset.mode, stick: R('#touch .stick'), cls: st.className, label: st.getAttribute('data-label'), after: getComputedStyle(st, '::after').content, hint: R('#touch .lookhint'), use: R('#touch .tbtn.use'), jump: R('#touch .tbtn.jump'), crouch: R('#touch .tbtn.crouch'), menu: R('#menubtn'), vw: innerWidth, vh: innerHeight }); })()`));
  assert.equal(m.mode, 'play');
  assert.ok(/\bidle\b/.test(m.cls) && m.stick.disp !== 'none' && m.stick.op >= 0.5 && m.stick.w >= 80, `an idle ring is visible: ${JSON.stringify(m.stick)} ${m.cls}`);
  assert.ok(m.stick.x >= 0 && m.stick.r <= m.vw * 0.46 && m.stick.b <= m.vh && m.stick.y > m.vh * 0.6, `in the left thumb's corner: ${JSON.stringify(m.stick)}`);
  assert.equal(m.label, 'caminar'); assert.match(m.after, /attr|caminar/i, 'and named');
  for (const k of ['use', 'jump', 'crouch', 'menu']) assert.ok(!hits(m.stick, m[k]), `the stick does not touch the ${k} button`);
  assert.ok(m.hint.op > 0.5 && /mirar/i.test(m.hint.text) && m.hint.x > m.vw * 0.4, `the look hint is on the right: ${JSON.stringify(m.hint)}`);
  // a drag on the right half looks and takes the hint away
  await mouse('mousePressed', 300, 300); await mouse('mouseMoved', 330, 310); await mouse('mouseReleased', 330, 310); await tick(900);
  assert.equal(await page.eval('document.querySelector("#touch .lookhint").classList.contains("gone")'), true, 'the hint is gone after the first look drag');
  assert.equal((await rect('#touch .lookhint')).op, 0, '(and invisible)');
});

test('the stick moves under the thumb, walks and runs when pushed to the rim, and comes back to its rest point', async () => {
  const at = () => page.eval(`(() => { const s = document.querySelector('#touch .stick'), r = s.getBoundingClientRect(), p = __ladera.ctx.player.input; return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, idle: s.classList.contains('idle'), f: p.f, s: p.s, sprint: p.sprint, thumb: s.firstElementChild.style.transform }; })()`);
  const rest = await at(); assert.equal(rest.idle, true);
  await mouse('mousePressed', 100, 600); await tick(60);
  let d = await at(); assert.equal(d.idle, false, 'down: the ring leaves its rest point and the full-size stick is under the thumb');
  assert.ok(Math.abs(d.cx - 100) < 2 && Math.abs(d.cy - 600) < 2, `under the finger: ${JSON.stringify(d)}`);
  await mouse('mouseMoved', 100, 560); await tick(60);                       // 40 px up: forward, no run
  d = await at(); assert.ok(d.f > 0.4 && d.f < 1 && Math.abs(d.s) < 0.05 && d.sprint === false, `forward, walking: ${JSON.stringify(d)}`);
  await mouse('mouseMoved', 100, 530); await tick(60);                       // 70 px: past the rim
  d = await at(); assert.ok(d.f > 0.95 && d.sprint === true, `the rim runs: ${JSON.stringify(d)}`);
  await mouse('mouseReleased', 100, 530); await tick(60);
  d = await at(); assert.deepEqual([d.idle, d.f, d.s, d.sprint, d.thumb], [true, 0, 0, false, ''], 'up: back to rest, nothing held');
  assert.ok(Math.abs(d.cx - rest.cx) < 1 && Math.abs(d.cy - rest.cy) < 1, 'at the same rest point');
});

test('a conversation on a phone: the stick and buttons step aside, the answers card is smaller and lower with the NPC\'s line under it, nothing overlaps', async () => {
  const id = await page.eval(`__ladera.npcs().filter((n) => n.shop && n.drawn).map((n) => n.id)[0] ?? null`);
  assert.ok(id, 'a shopkeeper to talk to');
  assert.equal(await page.eval(`__ladera.ctx.people.talk(${JSON.stringify(id)})`), true); await tick(700);
  const m = JSON.parse(await page.eval(`(() => { const R = ${R}; return JSON.stringify({ talking: document.body.classList.contains('talking'), dlg: R('#dlg'), sub: R('#subtitle'), subOn: document.getElementById('subtitle').classList.contains('on'), btn: R('.dlg-choices button'), n: document.querySelectorAll('.dlg-choices button').length,
    stick: R('#touch .stick'), use: R('#touch .tbtn.use'), jump: R('#touch .tbtn.jump'), menu: R('#menubtn'), zone: getComputedStyle(document.querySelector('#touch .zone.r')).pointerEvents, vw: innerWidth, vh: innerHeight }); })()`));
  assert.equal(m.talking, true, 'body.talking');
  for (const k of ['stick', 'use', 'jump']) assert.equal(m[k].disp, 'none', `the ${k} is hidden while talking`);
  assert.equal(m.zone, 'none', 'the look zone no longer sits over the card');
  assert.ok(m.n >= 3 && m.dlg.fs <= 14, `the card is compact: ${m.n} answers, ${m.dlg.fs}px`);
  assert.ok(m.dlg.h <= m.vh * 0.4, `the card takes at most 40% of the height: ${Math.round(m.dlg.h)} of ${m.vh}`);
  assert.ok(m.dlg.y >= m.vh * 0.45, `and sits in the lower half, not over the NPC: top ${Math.round(m.dlg.y)} of ${m.vh}`);
  assert.ok(m.dlg.x >= 0 && m.dlg.r <= m.vw, 'inside the screen');
  assert.equal(m.subOn, true); assert.ok(m.dlg.b <= m.sub.y + 1, `the NPC's line is under the card, not behind it: card bottom ${Math.round(m.dlg.b)}, line top ${Math.round(m.sub.y)}`);
  assert.ok(m.sub.b <= m.vh, 'and on screen');
  assert.ok(!hits(m.dlg, m.menu), 'the card is clear of the menu button');
  await page.key('KeyQ'); await tick(400);
  assert.equal(await page.eval('document.body.classList.contains("talking")'), false, 'the talk ends: the controls come back');
  assert.notEqual((await rect('#touch .stick')).disp, 'none');
});

test('in the water (player:swim) the jump and crouch buttons read subir and bucear, small enough to fit; Bucear is a toggle that is let go on the way out; the labels come back', async () => {
  const B = (c) => `document.querySelector('#touch .tbtn.${c}')`;
  const look = async () => JSON.parse(await page.eval(`JSON.stringify({ swim: document.getElementById('touch').classList.contains('swim'), jump: ${B('jump')}.textContent, crouch: ${B('crouch')}.textContent, jl: ${B('jump')}.getAttribute('aria-label'), cl: ${B('crouch')}.getAttribute('aria-label'), crouchOn: ${B('crouch')}.classList.contains('on'), input: __ladera.ctx.player.input.crouch,
    fit: [${B('jump')}, ${B('crouch')}].map((e) => e.scrollWidth <= e.clientWidth + 1) })`));
  assert.deepEqual(await look(), { swim: false, jump: '⤒', crouch: '⤓', jl: 'saltar', cl: 'agacharse', crouchOn: false, input: false, fit: [true, true] }, 'on land: the arrows');
  await page.eval(`__ladera.ctx.events.emit('player:swim', { on: true, how: 'teleport' })`); await tick(150);
  assert.deepEqual(await look(), { swim: true, jump: 'subir', crouch: 'bucear', jl: 'subir', cl: 'bucear', crouchOn: false, input: false, fit: [true, true] }, 'in the water: Subir and Bucear');
  await page.eval(`${B('crouch')}.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 41 }))`);
  let m = await look(); assert.deepEqual([m.crouchOn, m.input], [true, true], 'Bucear is a toggle: down');
  await page.eval(`__ladera.ctx.events.emit('player:swim', { on: false, how: 'walk' })`); await tick(150);
  assert.deepEqual(await look(), { swim: false, jump: '⤒', crouch: '⤓', jl: 'saltar', cl: 'agacharse', crouchOn: false, input: false, fit: [true, true] }, 'out of the water: the arrows, the toggle let go (else he would land crouched)');
});

test('the discovery toast on a phone is small and clear of the pill and the menu button', async () => {
  await page.eval(`__ladera.ctx.ui.toast({ tag: 'Descubrimiento 3 de 40', title: 'El perro dormido', sub: 'The sleeping dog' }, 20000)`); await tick(500);
  const t = await rect('#toast'), title = await rect('#toast.rich b'), menu = await rect('#menubtn');
  assert.ok(t.op > 0.5 && t.w <= 260 && t.h <= 80, `compact: ${Math.round(t.w)}x${Math.round(t.h)}`);
  assert.ok(title.fs <= 17, `title ${title.fs}px`);
  assert.ok(t.y >= 60, `below the pill and the menu button: top ${Math.round(t.y)}`); assert.ok(!hits(t, menu), 'not over the menu button');
  const s = page.summary(); assert.deepEqual([s.errors, s.netErrors, s.consoleErrors, s.consoleWarnings], [[], [], [], []]);
});
