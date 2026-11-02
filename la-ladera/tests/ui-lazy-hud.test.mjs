// LAZY HUD (A1; `?lazy=1`, dev/FEATURE-LAZY.md): what the page says and where it says it while the barrio is still coming in (review round 6: R2b-002 / R2a-003, R2b-003 / R2a-004).
//   * "N de M" (the discovery toast, the pause card's counter, the journal's tab, header and bar) says M is not known yet ('…') until the data pass has sealed: the interiors' discoveries are made as it
//     goes, so `ctx.discover.total` is only the world's until then (32 of 149). When it seals the number is printed, in the pause card's counter and in a journal that is open at that moment.
//   * the small progress cue (#stream) never shares a line with the place label, the toast, the subtitle or the prompt: at 1280x720, at 768x1024, and on a phone at 390x844 (where it goes to the top,
//     between the Almanac pill and the round buttons, the bottom corners being the thumbs').
// Quiet box: the browser comes only from tests/chrome.mjs (headless, simulated pointer lock, speech recorded). ?manual: nothing advances unless a test steps it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/ui-lazy-hud.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './chrome.mjs';

test('while the data pass is under way "N de M" says M is not known yet, and the number is printed the moment it seals (toast, pause card, an open journal)', async () => {
  const b = await launch({ width: 960, height: 540 });
  try {
    const page = await b.open('la-ladera/index.html?autostart&manual&lazy=1');
    await page.eval('__ladera.setHour(10)');
    const r = JSON.parse(await page.eval(`JSON.stringify((() => {
      const L = __ladera, c = L.ctx, m = c.interiors, D = c.discover, T = (s) => document.querySelector(s)?.textContent ?? null, W = (s) => document.querySelector(s)?.style.width ?? null;
      const world = [...D.items.values()].filter((d) => d.kind !== 'hallazgo' && d.kind !== 'find'), out = { early: { sealed: m.sealed, settled: D.settled, label: D.totalLabel, partial: D.total } };
      D.mark(world[0]);                                                                                   // the first discovery, found while the houses are still coming in
      out.toast1 = T('#toast em'); out.count1 = T('#pause .count');
      c.flow.openPanel('journal');
      out.tab1 = T('.jtab[data-tab="discover"] i'); out.head1 = T('.jpane .jhead strong'); out.bar1 = W('.jpane .jbar i'); out.note1 = !!document.querySelector('.jpane .note');
      m.drain({ meshes: false });                                                                         // the data pass to its end, with the journal open: the seal
      out.late = { sealed: m.sealed, settled: D.settled, label: D.totalLabel, total: D.total };
      out.count2 = T('#pause .count'); out.tab2 = T('.jtab[data-tab="discover"] i'); out.head2 = T('.jpane .jhead strong'); out.bar2 = W('.jpane .jbar i'); out.note2 = !!document.querySelector('.jpane .note'); out.panel = c.flow.current;
      c.flow.closePanel(); D.mark(world[1]); out.toast2 = T('#toast em');
      out.errors = L.state().errors;
      return out;
    })())`));
    assert.equal(r.early.sealed, false, 'the boot ends at the milestone with the data pass still to do'); assert.equal(r.early.settled, false); assert.equal(r.early.label, '…');
    assert.ok(r.early.partial > 0 && r.early.partial < 100, `${r.early.partial} discoveries are registered at the milestone (the world's only)`);
    assert.equal(r.toast1, 'Descubrimiento 1 de …', 'the toast does not print the world\'s partial total as if it were the barrio\'s');
    assert.equal(r.count1, '1/…', 'the pause card\'s counter');
    assert.equal(r.tab1, '1 de …', 'the journal\'s tab'); assert.equal(r.head1, '1 de … descubrimientos', 'the journal\'s header');
    assert.equal(r.bar1, '0%', 'a bar against a total that is not known stays empty'); assert.equal(r.note1, true, 'and the journal says why');
    assert.equal(r.late.sealed, true); assert.equal(r.late.settled, true); assert.ok(r.late.total > 100, `${r.late.total} discoveries once the interiors' are made (the eager boot's count)`);
    assert.equal(r.late.label, String(r.late.total), 'the label is the number once it is final');
    assert.equal(r.panel, 'journal', 'the journal was open when it sealed');
    assert.equal(r.count2, `1/${r.late.total}`, 'the pause card\'s counter is drawn again by the seal');
    assert.equal(r.tab2, `1 de ${r.late.total}`, 'so is the journal that is open'); assert.equal(r.head2, `1 de ${r.late.total} descubrimientos`);
    assert.notEqual(r.bar2, '0%', 'the bar has a total to measure against'); assert.equal(r.note2, false, 'and the note is gone');
    assert.equal(r.toast2, `Descubrimiento 2 de ${r.late.total}`, 'a discovery after the seal');
    assert.equal(r.errors, 0);
    // and when the whole queue is done the cue is gone, and the place label has its own corner back
    await page.eval('__ladera.settle({ timeout: 300000 }).then(() => true)', 400000);
    await page.eval('new Promise((r) => setTimeout(r, 1200))');
    const e = JSON.parse(await page.eval(`JSON.stringify({ streaming: document.body.classList.contains('streaming'), cue: !!document.getElementById('stream'), bottom: getComputedStyle(document.getElementById('place')).bottom })`));
    assert.equal(e.streaming, false, 'body.streaming is off once everything has come in'); assert.equal(e.cue, false, 'the cue is gone'); assert.equal(e.bottom, '14px', 'and the place label is back on the corner line');
  } finally { await b.close(); }
});

const VIEWS = [['desktop 1280x720', 1280, 720, false], ['tablet 768x1024', 768, 1024, false], ['phone 390x844 (touch)', 390, 844, true]];
for (const [name, w, h, touch] of VIEWS) {
  test(`the progress cue never shares a line with another piece of the HUD, whatever it says: ${name}`, async () => {
    const b = await launch({ width: w, height: h });
    try {
      const page = await b.open('la-ladera/index.html?autostart&manual&lazy=1' + (touch ? '&touch' : ''));
      await page.eval('__ladera.setHour(10)');
      const r = JSON.parse(await page.eval(`(async () => JSON.stringify(await (async () => {
        const L = __ladera, c = L.ctx, st = c.staged, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const labels = [...st.units.values()].map((u) => u.label);                                          // every unit's own words (the longest decides, a later sector's too)
        c.ui.place('Plaza de la Capilla', 'Chapel Square');
        c.ui.toast({ tag: 'Descubrimiento 3 de …', title: 'La Cruz de la Cumbre', sub: 'The summit cross, lit all night: the whole barrio steers by it.' }, 60000);
        c.ui.subtitle({ who: 'Doña Rosa', es: 'Buenas tardes, mijo. ¿Va para la capilla?', en: 'Good afternoon, dear. Are you headed for the chapel?' });
        c.ui.prompt('Abrir la puerta');
        await sleep(900);                                                                                   // (the label's own animation has reached its place)
        const R = (s, grow = 0) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom + grow, shown: q.width > 0 && getComputedStyle(e).display !== 'none' }; };
        const rows = [], own = Object.getOwnPropertyDescriptor(st, 'label');
        for (const label of labels) {
          Object.defineProperty(st, 'label', { get: () => label, configurable: true }); st._emit(); await sleep(60);
          rows.push({ label, text: document.getElementById('stream')?.textContent, stream: R('#stream'), place: R('#place'), toast: R('#toast'), subtitle: R('#subtitle'), prompt: R('#prompt'), stick: R('#touch .stick', 18), menu: R('#menubtn'), map: R('#touch .tbtn.map') });
        }
        if (own) Object.defineProperty(st, 'label', own); else delete st.label;
        return { rows, vw: innerWidth, vh: innerHeight, cls: document.body.className, errors: L.state().errors };
      })()))()`, 60000));
      assert.ok(r.rows.length >= 6, `${r.rows.length} units in the queue`);
      assert.equal(/\btouch\b/.test(r.cls), touch);
      const hit = (a, c) => a.l < c.r + 2 && a.r > c.l - 2 && a.t < c.b + 2 && a.b > c.t - 2;                 // (two pixels of air between any two pieces)
      for (const row of r.rows) {
        const s = row.stream;
        assert.ok(s?.shown, `${name}: the cue is on the page for "${row.label}"`); assert.match(row.text, new RegExp(row.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' · \\d+ %'), 'it says what is coming and how far');
        assert.ok(s.l >= 0 && s.t >= 0 && s.r <= r.vw && s.b <= r.vh, `${name}: "${row.label}" is inside the screen: ${JSON.stringify(s)}`);
        assert.ok(!hit(s, { l: 0, t: 0, r: 109, b: 41 }), `${name}: "${row.label}" is not under the Almanac pill: ${JSON.stringify(s)}`);
        for (const k of ['place', 'toast', 'subtitle', 'prompt', 'stick', 'menu', 'map']) {
          if (row[k]?.shown) assert.ok(!hit(s, row[k]), `${name}: the cue ("${row.text}") is over the ${k}: ${JSON.stringify(s)} against ${JSON.stringify(row[k])}`);
        }
        if (touch) assert.ok(s.t < 48, `${name}: on a phone the cue is at the top: ${JSON.stringify(s)}`);
      }
      assert.ok(r.rows.every((x) => x.place?.shown), 'the place label was up for every row'); assert.equal(r.errors, 0);
      assert.equal(/\bstreaming\b/.test(r.cls), true, 'body.streaming while the cue is up (it is what lifts the place label)');
    } finally { await b.close(); }
  });
}
