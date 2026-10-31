// The player and the film's chapters.
//  1. determinism: the same t renders byte-identical PNGs, even after seeking elsewhere in between (2D and 3D times)
//  2. controls: big play, play/pause, chapter chips, scrub bar, speed select, arrow keys, end of film
//  3. no console errors / failed requests
//   usage: node player.test.mjs        (PTB_SITE=<site root> tests another copy of the site; PTB_SHOTS=<folder> also saves two screenshots of the page there)
import { suite, problems } from "./lib/suite.mjs";
import { launch, delay } from "./lib/cdp.mjs";
import { serveDbg } from "./lib/dbg.mjs";
import { waitReady, readFilm, state3D } from "./lib/film.mjs";
import { gpuArgs } from "./lib/chrome.mjs";
import { SITE, PAGE } from "./lib/site.mjs";
import { join } from "node:path";
import { FILM, PLAYER } from "./expect.mjs";

const S = suite("player");
await S.run(async () => {
  if (!S.needChrome()) return;
  const srv = await serveDbg(SITE);
  const br = await launch({ width: 1400, height: 900, args: gpuArgs() });
  try {
    const page = await br.newPage(`${srv.base}/${PAGE}`);
    const ready = await waitReady(page, 40000), g3 = await state3D(page);
    S.check("page ready", ready && g3.ok, g3.detail);
    const film = await readFilm(page);
    const png = (t, w) => page.eval(`window.__tl.png(${t}, ${w})`);
    const Sw = film.S, T = film.T;
    // in-page pixel diff: count of differing pixels and the largest channel delta
    await page.eval(`window.__diff = async (a, b) => {
      const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
      x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0, max = 0;
      for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); if (d > 0) { n++; if (d > max) max = d; } }
      return { n, max, total: da.length / 4 };
    }`);
    const diff = (a, b) => page.eval(`window.__diff(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
    // ---- 1. determinism. The GPU may flip a handful of pixels by 1/255 around the window glass between two identical renders
    //         (measured: back-to-back renders of one t, no seeking at all); anything beyond that is a real dependence on history.
    const A = [];
    for (const t of PLAYER.determinismTimes(film)) {
      const a = await png(t, 640);
      await png(5, 640); await png(Sw + 40, 640); await png(t - 3, 640);          // wander elsewhere, forwards and backwards
      const b = await png(t, 640);
      const d = a === b ? { n: 0, max: 0 } : await diff(a, b);
      S.check(`t=${t.toFixed(2)} renders the same after seeking away (<= 64 pixels, delta <= 1)`, d.n <= 64 && d.max <= 1, a === b ? "byte-identical" : `${d.n} px differ, max delta ${d.max}`);
      A.push(a);
    }
    const d2 = await diff(A[1], await png(PLAYER.stepTime(film), 640));
    S.check("a 50 ms step is far above that tolerance (the tolerance cannot hide a real change)", d2.n > 500, `${d2.n} px differ`);
    S.check("different times differ", new Set(A).size === A.length);
    // ---- 2. controls (DOM clicks; the export button is covered by export.test.mjs)
    const st = () => page.eval("JSON.stringify({ playing: window.__export.state().playing, t: window.__export.state().t, big: !document.getElementById('bigplay').hidden, playTxt: document.getElementById('play').textContent, time: document.getElementById('time').textContent, seek: +document.getElementById('seek').value, speed: document.getElementById('speed').value })").then(JSON.parse);
    let s = await st();
    S.check("starts paused at 0 with the big play button", !s.playing && s.t === 0 && s.big, JSON.stringify(s));
    await page.eval("document.getElementById('bigplay').click()"); await delay(1500);
    s = await st();
    S.check("big play starts the film", s.playing && s.t > 0.2 && s.t < 4 && !s.big, `t=${s.t.toFixed(2)}`);
    await page.eval("document.getElementById('play').click()"); const tp = (await st()).t; await delay(600);
    s = await st();
    S.check("play button pauses (clock stops)", !s.playing && Math.abs(s.t - tp) < 1e-9, `t=${s.t.toFixed(3)}`);
    const nchips = await page.eval("document.querySelectorAll('#chips button').length");
    const marks = JSON.parse(await page.eval("JSON.stringify(window.__tl.TR.chap.map((c) => c.t))"));
    S.check(`one chip per chapter (${FILM.chapters})`, nchips === marks.length && nchips === FILM.chapters, `${nchips} chips`);
    for (const i of PLAYER.chips(film)) {                                                 // 2D start, first 3D chapter, floors, plaster & paint, last
      await page.eval(`document.querySelectorAll('#chips button')[${i}].click()`); await delay(250);
      s = await st();
      S.check(`chip ${i + 1} seeks to its chapter and plays`, s.playing && s.t >= marks[i] && s.t < marks[i] + 1.5, `t=${s.t.toFixed(2)} (mark ${marks[i].toFixed(2)})`);
      await page.eval("document.getElementById('play').click()");                         // pause again
    }
    await page.eval("(() => { const e = document.getElementById('seek'); e.value = 150; e.dispatchEvent(new Event('input', { bubbles: true })); })()"); await delay(200);
    s = await st();
    S.check("scrub bar seeks", Math.abs(s.t - 150) < 1e-6 && /2:30/.test(s.time), s.time);
    await page.eval("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))"); s = await st();
    S.check("ArrowRight skips 2 s", Math.abs(s.t - 152) < 1e-6, `t=${s.t}`);
    await page.eval("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true }))"); s = await st();
    S.check("Shift+ArrowLeft skips back 10 s", Math.abs(s.t - 142) < 1e-6, `t=${s.t}`);
    // the clock advances per animation frame (at most 0.1 s of wall time per frame), so a starved box slows both speeds alike: compare them with each other
    const run = async (speed) => {
      await page.eval(`(() => { const e = document.getElementById('speed'); e.value = '${speed}'; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      const a = (await st()).t; await page.eval("document.getElementById('play').click()"); await delay(1500);
      const b = (await st()).t; await page.eval("document.getElementById('play').click()");
      return b - a;
    };
    const d1 = await run(1), d2x = await run(2);
    S.check("speed 2x runs the clock about twice as fast as 1x", d2x / d1 > 1.5 && d2x / d1 < 2.6, `1x +${d1.toFixed(2)} s, 2x +${d2x.toFixed(2)} s, ratio ${(d2x / d1).toFixed(2)}`);
    await page.eval("(() => { const e = document.getElementById('speed'); e.value = '1'; e.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await page.eval("window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))"); await delay(300);
    s = await st(); S.check("space toggles play", s.playing);
    // real key events (CDP dispatches them inside the page; nothing touches the OS keyboard): a focused control keeps its own keys
    const key = async (k, code, vk, text) => {
      await page.S("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, text });
      await page.S("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
    };
    await page.eval("document.getElementById('play').click()");                       // pause
    await page.eval("document.getElementById('play').focus()");
    await key(" ", "Space", 32, " ");
    s = await st(); S.check("Space on the focused play button presses it once (not twice)", s.playing, `playing=${s.playing}`);
    await key(" ", "Space", 32, " ");
    s = await st(); S.check("Space on the focused play button again pauses", !s.playing, `playing=${s.playing}`);
    await page.eval("document.getElementById('chips').querySelectorAll('button')[3].focus()");
    const tBefore = (await st()).t; await key(" ", "Space", 32, " ");
    s = await st(); S.check("Space on a focused chapter chip activates that chip, not play/pause", s.playing && Math.abs(s.t - marks[3]) < 1.5 && Math.abs(s.t - tBefore) > 0.5, `t=${s.t.toFixed(2)} (mark ${marks[3].toFixed(2)})`);
    await page.eval("document.getElementById('play').click()");                       // pause
    await page.eval("document.activeElement && document.activeElement.blur()");
    await key(" ", "Space", 32, " ");
    s = await st(); S.check("Space with nothing focused plays", s.playing);
    await page.eval("document.getElementById('play').click()");                       // pause
    await page.eval("document.getElementById('speed').focus()");
    const tSel = (await st()).t; await key("ArrowRight", "ArrowRight", 39);
    s = await st(); S.check("an arrow key on the focused speed select does not seek", Math.abs(s.t - tSel) < 1e-9, `t ${tSel.toFixed(2)} -> ${s.t.toFixed(2)}`);
    await page.eval("document.activeElement && document.activeElement.blur()");
    await key("ArrowRight", "ArrowRight", 39);
    s = await st(); S.check("an arrow key with nothing focused seeks 2 s", Math.abs(s.t - (tSel + 2)) < 1e-9, `t ${tSel.toFixed(2)} -> ${s.t.toFixed(2)}`);
    await page.eval("(() => { const e = document.getElementById('seek'); e.focus(); })()");
    for (let i = 0; i < 100; i++) { const q = await st(); if (Math.abs(q.seek - q.t) < 0.02) break; await delay(50); }     // the slider follows the clock on the next animation frame
    const tSl = (await st()).t; await key("ArrowRight", "ArrowRight", 39);
    s = await st(); S.check("an arrow key on the focused timeline slider skips 2 s like everywhere else (its own step is 10 ms: unusable)", Math.abs(s.t - (tSl + 2)) < 1e-6, `t ${tSl.toFixed(2)} -> ${s.t.toFixed(2)}`);   // changed by the review: it used to keep the native 10 ms step
    await page.eval("document.activeElement && document.activeElement.blur()");
    await page.eval("(() => { const e = document.getElementById('seek'); e.value = 142; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await page.eval("window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))"); await delay(200);   // back to playing for the checks below
    s = await st();
    await page.eval(`(() => { const e = document.getElementById('seek'); e.value = ${T - 0.5}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`); await delay(1500);
    s = await st();
    S.check("film stops at the end and the button resets", !s.playing && Math.abs(s.t - T) < 1e-6 && s.playTxt.charCodeAt(0) === 9654 && Math.abs(T - FILM.seconds) <= FILM.secondsTol, `t=${s.t} (expect.mjs: the film is ${FILM.seconds} s)`);
    await page.eval("document.getElementById('play').click()");
    s = await st(); S.check("play at the end restarts from 0", s.playing && s.t < 1, `t=${s.t.toFixed(2)}`);
    await page.eval("document.getElementById('play').click()");
    await page.eval("(() => { const e = document.getElementById('seek'); e.value = 190; e.dispatchEvent(new Event('input', { bubbles: true })); })()"); await delay(500);
    if (process.env.PTB_SHOTS) await page.screenshot(join(process.env.PTB_SHOTS, "player-page-end.png"));
    await page.eval("(() => { const e = document.getElementById('seek'); e.value = 20; e.dispatchEvent(new Event('input', { bubbles: true })); })()"); await delay(500);
    if (process.env.PTB_SHOTS) await page.screenshot(join(process.env.PTB_SHOTS, "player-page-2d.png"));
    // ---- 3. console
    const bad = problems(page, /X4122/);
    S.check("no console errors or warnings (apart from the ANGLE X4122 shader note)", bad.length === 0, JSON.stringify(bad.slice(0, 4)));
  } finally { await Promise.race([br.close(), delay(8000)]); await Promise.race([srv.close(), delay(2000)]); }
});
