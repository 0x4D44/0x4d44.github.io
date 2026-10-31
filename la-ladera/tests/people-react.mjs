#!/usr/bin/env node
// Page test for the residents' reactions (js/people/reactions.js, shown by world.js onReact): a customer opens the cash drawer of a shop and the keeper, in the page, turns round and
// answers once, with a subtitle (bilingual) and in their voice; a second opening right after is left alone; the keeper goes back to the counter; the console stays clean.
//   node la-ladera/tests/people-react.mjs [--q "autostart&manual&hour=12"]
// (The event bus wiring - container:open from interiors/containers.js - is tested under Node in people-react.test.mjs; here the world's presentation is.) Headless Chrome; exit code 1 on a failed check.
import { launch } from './chrome.mjs';

const a = process.argv.slice(2), flag = (n, d) => { const i = a.indexOf('--' + n); return i < 0 ? d : a[i + 1]; };
const q = flag('q', 'autostart&manual&hour=12'), slug = flag('slug', 'la-ladera');
const b = await launch({ width: 960, height: 540 });
let code = 0; const fails = [];
try {
  const p = await b.open(`${slug}/index.html?${q}`);
  await p.eval('__ladera.step(600)');                                                       // ten seconds of life: the keepers are at their posts
  const shop = await p.eval(`(() => {
    const W = __ladera.ctx.people._world;
    for (const s of W.shops.values()) { const k = W.byId.get(s.keeper); if (s.open && s.cust[0] && k && !k.away && Math.hypot(k.x - s.post.x, k.z - s.post.z) < 0.8 && Math.hypot(s.post.x - s.cust[0].x, s.post.z - s.cust[0].z) > 1.2) return { lot: s.lot, keeper: k.id, name: k.display, post: s.post, cust: s.cust[0] }; }
    return null; })()`);
  if (!shop) throw new Error(`no open shop with its keeper at the post at ${q}`);
  const open = await p.eval(`(() => {
    const L = __ladera, ctx = L.ctx, W = ctx.people._world, s = ${JSON.stringify(shop)}, pl = ctx.player;
    pl.teleport(s.cust.x, s.cust.z, { y: s.cust.y ?? s.post.y, yaw: Math.atan2(-(s.post.x - s.cust.x), -(s.post.z - s.cust.z)), pitch: 0 });
    L.step(30);
    const ev = { id: 'page:till', building: s.lot, kind: 'drawer', group: 'counter', x: (s.post.x + s.cust.x) / 2, y: s.post.y + 0.9, z: (s.post.z + s.cust.z) / 2 };
    const rec = W.reactions.onOpen(ev);
    return { scheduled: !!rec, spoken: window.__quiet.spoken.length, again: !!W.reactions.onOpen({ ...ev, id: 'page:till2' }) };
  })()`);
  if (!open.scheduled) fails.push('the keeper did not notice the open drawer');
  if (open.again) fails.push('a second opening in the same instant was answered too');
  await p.eval('__ladera.step(150)');                                                       // 2.5 s: the beat is over and the line is said
  await new Promise((r) => setTimeout(r, 600));                                             // (speech.js hands the utterance to the voice engine 30 ms later, in real time)
  const mid = await p.eval(`(() => {
    const W = __ladera.ctx.people._world, k = W.byId.get(${JSON.stringify(shop.keeper)}), e = document.getElementById('subtitle');
    return { log: __ladera.ctx.people.reactions(), spoken: window.__quiet.spoken.slice(${open.spoken}), sub: { on: e.classList.contains('on'), text: e.textContent }, mode: k.mode, act: k.act, talkWith: !!k.talkWith };
  })()`);
  const rec = mid.log.at(-1);
  if (mid.log.length !== 1) fails.push(`${mid.log.length} reactions logged, expected 1`);
  else {
    if (rec.id !== shop.keeper) fails.push(`${rec.id} answered, not the keeper ${shop.keeper}`);
    if (rec.pool !== 'ownerTill') fails.push(`pool ${rec.pool}, expected ownerTill (the keeper at their own till)`);
    if (!mid.sub.on || !mid.sub.text.includes(rec.es)) fails.push(`the subtitle does not show the line: ${JSON.stringify(mid.sub).slice(0, 200)}`);
    if (!mid.sub.text.includes(shop.name)) fails.push(`the subtitle does not name the speaker ${shop.name}`);
    if (!mid.sub.text.includes(rec.en)) fails.push('the English line is not in the subtitle (settings: both languages)');
    if (!mid.spoken.some((s) => s.text === rec.es)) fails.push(`the line was not spoken: ${JSON.stringify(mid.spoken).slice(0, 200)}`);
  }
  if (mid.mode !== 'talk' || !mid.talkWith) fails.push(`while they say it the keeper should be turned to the player (mode ${mid.mode})`);
  await p.eval('__ladera.step(600)');                                                       // ten more seconds: back to the counter
  const end = await p.eval(`(() => { const W = __ladera.ctx.people._world, k = W.byId.get(${JSON.stringify(shop.keeper)}); return { mode: k.mode, act: k.act, d: Math.hypot(k.x - ${shop.post.x}, k.z - ${shop.post.z}), talking: W.talk.active }; })()`);
  if (end.mode === 'talk' || end.talking) fails.push(`the keeper is still in the reaction after ten seconds (${JSON.stringify(end)})`);
  if (end.d > 1.3) fails.push(`the keeper is ${end.d.toFixed(1)} m from the post after the reaction`);
  const sm = p.summary(); if (sm.errors.length || sm.consoleErrors.length || sm.consoleWarnings.length) fails.push(`console: ${JSON.stringify([...sm.errors, ...sm.consoleErrors, ...sm.consoleWarnings]).slice(0, 400)}`);
  console.log(JSON.stringify({ q, shop: shop.lot, keeper: `${shop.keeper} ${shop.name}`, said: rec ? `${rec.es} | ${rec.en}` : null, end, fails }, null, 1));
  if (fails.length) code = 1;
} catch (e) { console.error(e); code = 1; }
await b.close();
process.exit(code);
