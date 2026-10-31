// The checks behind the independent review of the page. Each one names the behaviour a visitor sees. One headless Chrome, trusted CDP input only, lowest
// priority, no windows.
//   usage: node review.test.mjs [section...]     sections: player, urls, slow, blocked, nopicker, mux (default: all)
//   env:   PTB_SITE=<site root>        another copy of the site
//          PTB_STRICT_TIMING=1         the 120 ms "first draw of each 3D part" check FAILS instead of printing a WARN. That check depends on how busy the
//                                      box is (it failed twice at 100 % CPU and passed at 75 to 100 %), so by default it only reports.
// The page loads three.js and mp4-muxer from cdn.jsdelivr.net: this suite needs the network.
import { suite, hardLogs, until } from "./lib/suite.mjs";
import { launch, delay } from "./lib/cdp.mjs";
import { serveDbg } from "./lib/dbg.mjs";
import { gpuArgs } from "./lib/chrome.mjs";
import { readFilm } from "./lib/film.mjs";
import { SITE, PAGE } from "./lib/site.mjs";
import { AT, REVIEW } from "./expect.mjs";

const R = suite("review");
const WANT = new Set(process.argv.slice(2));
const want = (s) => WANT.size === 0 || WANT.has(s);
await R.run(async () => {
  if (!R.needChrome()) return;
  const srv = await serveDbg(SITE);
  const br = await launch({ width: 1400, height: 900, args: gpuArgs() });
  const URL0 = `${srv.base}/${PAGE}`;
  const ready = (page, ms = 60000) => until(() => page.eval("window.__ready === true"), ms);
  const state = (page) => page.eval("JSON.stringify({ t: window.__export.state().t, playing: window.__export.state().playing, big: !document.getElementById('bigplay').hidden, playLabel: document.getElementById('play').getAttribute('aria-label'), seek: +document.getElementById('seek').value, active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null, msg: document.getElementById('msg').textContent })").then(JSON.parse);
  const key = (page, k, code, vk, { text, shift, repeat } = {}) => page.S("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, text, modifiers: shift ? 8 : 0, autoRepeat: !!repeat })
    .then(() => page.S("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 }));
  const centre = (page, id, frac = 0.5) => page.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.scrollIntoView({ block: "center" }); const b = e.getBoundingClientRect(); return { x: b.x + b.width * ${frac}, y: b.y + b.height / 2 }; })()`);
  // a trusted mouse click (clicks 2 = a double-click: the second press has clickCount 2). frac: how far across the element the pointer sits;
  // the Render button shrinks to "Cancel" when it is clicked, so a double-click only lands on it again from its right-hand part
  const mouse = async (page, id, clicks = 1, frac = 0.5) => {
    const r = await centre(page, id, frac);
    await page.S("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
    for (let c = 1; c <= clicks; c++) {
      await page.S("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: c });
      await page.S("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: c });
    }
  };
  const DIFF = `window.__diff = async (a, b) => {
    const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0, max = 0;
    for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); if (d > 0) { n++; if (d > max) max = d; } }
    return { n, max, total: da.length / 4 };
  }`;
  const setT = (page, t) => page.eval(`(() => { const e = document.getElementById('seek'); e.value = ${t}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  try {
    // ======================================================================== the player
    if (want("player")) {
      R.heading("player");
      const page = await br.newPage(URL0);
      R.check("page ready", await ready(page));
      await page.eval(DIFF);
      const film = await readFilm(page), S = film.S, T = film.T;
      R.check("fullscreen letterboxes a film that is not 16:9 (canvas object-fit: contain)", (await page.eval("getComputedStyle(document.getElementById('screen')).objectFit")) === "contain");

      // 3D: the warm-up has taken the first-time costs out of playback. First, before any fault is injected into the page (a thrown frame stops the warm-up).
      const warm = await until(() => page.eval("window.__tl.g3 ? window.__tl.g3.warm : true"), 240000, 250);
      R.check("3D warm-up finishes (or there is none)", !!warm);
      const W = await page.eval("document.getElementById('screen').width");
      const grid = []; for (let t = S + 1; t < T; t += 1.5) grid.push(+t.toFixed(3));          // offset from the warm-up's own 2 s grid
      const cost = await page.eval(`(() => { const r = []; for (const t of ${JSON.stringify(grid)}) r.push([t, window.__tl.ms(t, ${W})]); return r; })()`, { timeout: 600000 });
      const worst = [...cost].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, ms]) => `S+${(t - S).toFixed(1)}: ${ms.toFixed(0)} ms`);
      // load-sensitive (a spike is the box, not a missed first-time cost): report only, unless PTB_STRICT_TIMING=1
      R.soft("no part of the 3D half costs more than 120 ms the first time it is drawn", Math.max(...cost.map((c) => c[1])) <= 120, `slowest ${worst.join(", ")} (${grid.length} times)`, process.env.PTB_STRICT_TIMING === "1");

      // timeline slider: its keys skip like the rest of the page (its own step is 10 ms)
      await setT(page, 100); await page.eval("document.getElementById('seek').focus()");
      await until(async () => Math.abs((await state(page)).seek - 100) < 0.02, 5000, 50);
      await key(page, "ArrowRight", "ArrowRight", 39);
      let s = await state(page); R.check("slider focused: ArrowRight skips 2 s", Math.abs(s.t - 102) < 1e-6, `t=${s.t}`);
      await key(page, "ArrowLeft", "ArrowLeft", 37, { shift: true });
      s = await state(page); R.check("slider focused: Shift+ArrowLeft skips back 10 s", Math.abs(s.t - 92) < 1e-6, `t=${s.t}`);
      await key(page, "PageUp", "PageUp", 33);
      s = await state(page); R.check("slider focused: PageUp skips 10 s", Math.abs(s.t - 102) < 1e-6, `t=${s.t}`);
      await key(page, "End", "End", 35);
      s = await state(page); R.check("slider focused: End goes to the end", Math.abs(s.t - T) < 1e-6, `t=${s.t}`);
      await key(page, "Home", "Home", 36);
      s = await state(page); R.check("slider focused: Home goes to the start", s.t === 0, `t=${s.t}`);
      await page.eval("document.activeElement && document.activeElement.blur()");

      // the big play button follows the clock when the keyboard seeks
      s = await state(page); R.check("paused at 0: the big play button shows", s.big && !s.playing);
      await key(page, "ArrowRight", "ArrowRight", 39);
      s = await state(page); R.check("a keyboard seek away from 0 takes the big play button away", !s.big && Math.abs(s.t - 2) < 1e-6, `big=${s.big} t=${s.t}`);
      await setT(page, 0);

      // after a mouse click on play, the keys belong to the film again
      await mouse(page, "play");
      await delay(300);
      s = await state(page); R.check("a mouse click on play starts the film", s.playing && s.t > 0.05, `t=${s.t.toFixed(2)}`);
      R.check("... and play no longer holds the keyboard focus", s.active !== "play", `active=${s.active}`);
      R.check("play button is labelled Pause while playing", s.playLabel === "Pause", s.playLabel);
      await key(page, " ", "Space", 32, { text: " " });
      s = await state(page); R.check("Space then pauses the film", !s.playing, `playing=${s.playing}`);
      R.check("play button is labelled Play when paused", s.playLabel === "Play", s.playLabel);
      const t1 = s.t; await key(page, "ArrowRight", "ArrowRight", 39);
      s = await state(page); R.check("ArrowRight skips 2 s straight after the mouse click", Math.abs(s.t - (t1 + 2)) < 1e-6, `t ${t1.toFixed(2)} -> ${s.t.toFixed(2)}`);

      // a held Space must not flicker the film (nothing focused, so the page's own handler decides)
      await page.eval("document.activeElement && document.activeElement.blur()");
      await page.S("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " });
      await page.S("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " ", autoRepeat: true });
      await page.S("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
      s = await state(page); R.check("Space held down (key repeat) toggles play once, not on every repeat", s.playing, `playing=${s.playing}`);
      await key(page, " ", "Space", 32, { text: " " });                // pause

      // screen readers: the active chapter (not during the intro, which no chapter covers), the timeline position
      await setT(page, REVIEW.ariaAt); await delay(300);
      const aria = await page.eval("JSON.stringify({ cur: document.querySelectorAll('#chips button[aria-current=true]').length, vt: document.getElementById('seek').getAttribute('aria-valuetext') })").then(JSON.parse);
      R.check("exactly one chapter chip is aria-current", aria.cur === 1, JSON.stringify(aria));
      R.check("the timeline reads out its position (aria-valuetext)", /^\d+:\d\d of \d+:\d\d$/.test(aria.vt || ""), aria.vt);

      // a frame that throws: playback stops, the canvas starts afresh, the next frame is right
      if (!(await state(page)).playing) await page.eval("document.getElementById('play').click()");          // playing, whatever state the checks above left it in
      await delay(200);
      await page.eval("(() => { window.__ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function () { throw new Error('boom'); }; })()");
      await delay(600);
      s = await state(page);
      await page.eval("CanvasRenderingContext2D.prototype.fillText = window.__ft");
      R.check("a frame that throws stops the playback (it does not repeat the error every frame)", !s.playing && /render error/.test(s.msg), JSON.stringify({ playing: s.playing, msg: s.msg.slice(0, 60) }));
      const nErr = hardLogs(page).filter((l) => /render failed/.test(l.text)).length;
      R.check("... after one console error, not sixty a second", nErr >= 1 && nErr <= 3, `${nErr} console errors`);
      await page.eval("window.__tl.at(31)"); await delay(200);
      const d1 = await page.eval(`(async () => { const c = document.getElementById('screen'); return window.__diff(c.toDataURL(), window.__tl.png(31, c.width)); })()`);
      R.check("the next frame after the error is drawn whole (no clip or state left over)", d1.n <= 64 && d1.max <= 1, `${d1.n} px differ, max ${d1.max}`);
      await page.eval("document.getElementById('msg').textContent = ''");

      // a lost GL context: an export stops, and the picture comes back the same when the context does
      const gl = await page.eval("window.__tl.glc ? true : false");
      if (gl) {
        const tt = S + AT.determinism, wA = await page.eval(`window.__tl.png(${tt}, 640)`);
        await page.eval("window.__lc = window.__tl.glc.getContext('webgl2').getExtension('WEBGL_lose_context'); window.__lc.loseContext()");
        const lost = await until(() => page.eval("window.__tl.g3.lost === true"), 10000, 50);
        R.check("a lost GL context is noticed", !!lost);
        const ex = await page.eval(`__export.run({ from: ${S + AT.determinism}, to: ${S + AT.determinism + 0.25} }).then(() => "resolved").catch((e) => e.message)`, { timeout: 120000 });
        R.check("an export over the 3D half refuses to write blank frames", /graphics context was lost/.test(ex), String(ex).slice(0, 100));
        await page.eval("window.__lc.restoreContext()");
        const back = await until(() => page.eval("window.__tl.g3.lost === false"), 10000, 50);
        R.check("the context comes back", !!back);
        await delay(300);
        const wB = await page.eval(`window.__tl.png(${tt}, 640)`);
        const d2 = await page.eval(`window.__diff(${JSON.stringify(wA)}, ${JSON.stringify(wB)})`);
        R.check("the 3D picture after the restore matches the one before (environment light rebuilt)", d2.n <= 64 && d2.max <= 1, `${d2.n} px differ, max channel delta ${d2.max}`);
      } else R.check("a lost GL context is noticed", false, "no hook to lose the context (page predates the fix)");
      const hard = hardLogs(page);
      R.check("no console errors on the main page (apart from the one provoked above)", hard.filter((l) => !/render failed|boom/.test(l.text)).length === 0, JSON.stringify(hard.filter((l) => !/render failed|boom/.test(l.text)).slice(0, 3)));
      await page.close();
    }

    // ======================================================================== ?t=
    if (want("urls")) {
      R.heading("?t= links");
      for (const [q, want_, label] of [["1:30", 90, "m:ss"], ["45s", 45, "seconds with an s"], ["12.5", 12.5, "plain seconds"], ["abc", 0, "text"], ["-5", 0, "a negative"], ["1:xx", 0, "a half-typed time"]]) {
        const page = await br.newPage(`${URL0}?t=${encodeURIComponent(q)}`);
        const ok = await ready(page);
        await page.eval(DIFF); await delay(400);
        const s = ok ? await state(page) : { t: NaN };
        const d = ok ? await page.eval(`(async () => { const c = document.getElementById('screen'); return window.__diff(c.toDataURL(), window.__tl.png(${want_}, c.width)); })()`) : { n: -1, max: -1 };
        R.check(`?t=${q} (${label}) opens at ${want_} s`, ok && s.t !== null && Math.abs(s.t - want_) < 1e-6, `t=${s.t}`);          // t is null when it is NaN
        R.check(`?t=${q}: the frame on screen is the frame at ${want_} s, and nothing throws`, d.n >= 0 && d.n <= 64 && d.max <= 1 && hardLogs(page).length === 0, `${d.n} px differ, ${hardLogs(page).length} console errors`);
        await page.close();
      }
    }

    // ======================================================================== a slow link
    if (want("slow")) {
      R.heading("three.js held back for 6 s");
      const page = await br.newPage(URL0, { hold: { pattern: "*cdn.jsdelivr.net/npm/three@*", ms: 6000 } });
      const t0 = Date.now();
      const early = await until(() => page.eval("typeof window.__tl === 'object'"), 3500, 50);
      R.check("the drafting is there before three.js arrives (page not blocked on the import)", !!early, `${Date.now() - t0} ms`);
      if (early) {
        await page.eval("document.getElementById('bigplay').click()"); await delay(1200);
        const s = await state(page);
        const g = await page.eval("JSON.stringify(window.__tl.g3)").then(JSON.parse);
        R.check("... and plays while three.js is still on its way", s.playing && s.t > 0.3 && g.ready === false, `t=${s.t.toFixed(2)} ready=${g.ready}`);
        const done = await ready(page, 60000);
        const g2 = await page.eval("JSON.stringify(window.__tl.g3)").then(JSON.parse);
        R.check("when three.js arrives the 3D scene is built", done && g2.ready === true && g2.error === null, JSON.stringify(g2));
        const S = await page.eval("window.__tl.T3.swap");
        await page.eval(`window.__tl.at(${S + AT.determinism})`); await delay(200);
        const lit = await page.eval("(() => { const c = document.getElementById('screen'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n; })()");
        R.check("... and the film draws it", lit > 500, `${lit} bright samples`);
        R.check("no errors on the slow-link page", hardLogs(page).length === 0, JSON.stringify(hardLogs(page).slice(0, 3)));
      } else await ready(page, 20000);
      await page.close();
    }

    // ======================================================================== three.js blocked
    if (want("blocked")) {
      R.heading("three.js blocked");
      const init = "window.__picks = 0; window.showSaveFilePicker = function () { window.__picks++; return Promise.reject(new DOMException('no', 'AbortError')); };";
      const page = await br.newPage(URL0, { blocked: ["*cdn.jsdelivr.net/npm/three@*"], init });
      R.check("page ready without three.js", await ready(page, 30000));
      const s0 = await state(page);
      R.check("the visitor is told the 3D view did not load", /3D view could not be loaded/.test(s0.msg), s0.msg.slice(0, 90));
      await page.eval("document.getElementById('bigplay').click()"); await delay(1000);
      const s1 = await state(page);
      R.check("the drafting still plays", s1.playing && s1.t > 0.2, `t=${s1.t.toFixed(2)}`);
      await mouse(page, "exportBtn"); await delay(800);
      const u = await page.eval("JSON.stringify({ picks: window.__picks, msg: document.getElementById('msg').textContent, txt: document.getElementById('progTxt').textContent, btn: document.getElementById('exportBtn').textContent })").then(JSON.parse);
      R.check("Render says why it cannot, and does not open the save dialog first", u.picks === 0 && /3D scene did not load/.test(u.txt) && u.btn === "Render 1440p60 MP4", JSON.stringify({ picks: u.picks, txt: u.txt.slice(0, 70), btn: u.btn }));
      const bad = hardLogs(page).filter((l) => l.type !== "netfail");              // the blocked requests themselves are the point of this page
      R.check("no exceptions on the blocked page", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
      await page.close();
    }

    // ======================================================================== no file picker (Firefox, Safari)
    if (want("nopicker")) {
      R.heading("no showSaveFilePicker");
      const page = await br.newPage(URL0, { init: "window.showSaveFilePicker = undefined;" });
      R.check("page ready", await ready(page));
      const sel = await page.eval("JSON.stringify({ v: document.getElementById('bitrate').value, off: [...document.getElementById('bitrate').options].filter((o) => o.disabled).map((o) => o.value) })").then(JSON.parse);
      R.check("the file is held in memory, so the bitrate is capped at 16 Mbps (24 and 40 are disabled)", sel.v === "16" && sel.off.join() === "24,40", JSON.stringify(sel));
      await page.eval("__export.range(10, 16)");
      const ui = () => page.eval("(() => { const a = document.getElementById('again'); return JSON.stringify({ txt: document.getElementById('progTxt').textContent, btn: document.getElementById('exportBtn').textContent, active: document.activeElement ? document.activeElement.id : null, again: a ? { hidden: a.hidden, href: a.getAttribute('href'), dl: a.getAttribute('download') } : { hidden: true, href: null, dl: null, missing: true } }); })()").then(JSON.parse);
      const settle = () => until(async () => { const x = await ui(); return /^(Done|cancelled|export failed)/.test(x.txt) && x.btn === "Render 1440p60 MP4" && x; }, 300000, 250);
      // 1. a double-click on Render must not cancel the run it just started. The pointer sits on the button's right-hand part: the label shrinks to
      //    "Cancel" with the first click, and only that part is still under the pointer for the second.
      await page.eval("document.getElementById('exportBtn').focus()");
      await mouse(page, "exportBtn", 2, 0.9);
      await delay(1800);
      let u = await ui();
      R.check("a double-click on Render starts the run and does not cancel it", u.btn === "Cancel" && /^frame/.test(u.txt), JSON.stringify({ btn: u.btn, txt: u.txt.slice(0, 50) }));
      await settle();
      // 2. the button had the keyboard focus (as a mouse click gives it): Space, meant for the film, must not press it again
      await page.eval("document.getElementById('exportBtn').focus()");
      await mouse(page, "exportBtn", 1, 0.9);
      await delay(300);
      u = await ui();
      R.check("after a mouse click Render no longer holds the keyboard focus", u.active !== "exportBtn", `active=${u.active}`);
      await key(page, " ", "Space", 32, { text: " " });
      await delay(500);
      u = await ui();
      R.check("Space meant for the film does not cancel the render", u.btn === "Cancel" && !/cancel/.test(u.txt), JSON.stringify({ btn: u.btn, txt: u.txt.slice(0, 50) }));
      u = await settle();
      R.check("the run finishes: 'Done · … · 0:06 · downloaded'", u && /^Done · [\d.]+ MB · 0:06 · downloaded$/.test(u.txt), u && u.txt);
      R.check("a 'save the MP4 again' link keeps the file (blob URL, file name)", u && u.again.hidden === false && /^blob:/.test(u.again.href || "") && u.again.dl === "plan-to-build-1440p60.mp4", JSON.stringify(u && u.again));
      // 3. an ordinary cancel still works once the run is under way
      await mouse(page, "exportBtn", 1, 0.9); await delay(1300);
      u = await ui();
      R.check("the next render hides the old link", u.again.hidden === true, JSON.stringify(u.again));
      await mouse(page, "exportBtn", 1, 0.9);
      u = await settle();
      R.check("a click on Cancel after the first second still cancels", u && u.txt === "cancelled", u && u.txt);
      const bad = hardLogs(page);
      R.check("no exceptions on the no-picker page", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
      await page.close();
    }

    // ======================================================================== the muxer refuses the first chunk
    if (want("mux")) {
      R.heading("muxer error on the first chunk");
      const page = await br.newPage(URL0);
      R.check("page ready", await ready(page));
      const cod = await page.eval("__export.codecs()");
      R.check("the codec list ends H.264 with Baseline L5.2 before VP9 and AV1", cod.map((c) => c.codec).join().includes("avc1.4d0034,avc1.4d0034,avc1.420034,avc1.420034,vp09"), cod.map((c) => c.codec).filter((x, i, a) => a.indexOf(x) === i).join(" "));
      const w0 = page.logs.length;
      const r = await page.eval(`(async () => {
        const M = await import('mp4-muxer'); const orig = M.Muxer.prototype.addVideoChunkRaw; let n = 0;
        M.Muxer.prototype.addVideoChunkRaw = function (...a) { if (n++ === 0) throw new Error('boom'); return orig.apply(this, a); };
        try { const x = await __export.run({ from: 10, to: 10.25 }); return { frames: x.frames, codec: x.codec, hw: x.hw }; }
        catch (e) { return { error: e.message }; }
        finally { M.Muxer.prototype.addVideoChunkRaw = orig; }
      })()`, { timeout: 300000 });
      R.check("a muxer error before the first chunk is out: the next encoder takes over", !r.error && r.frames === 15, JSON.stringify(r));
      const warn = page.logs.slice(w0).filter((l) => /warn/.test(l.type) && /failed before its first frame/.test(l.text));
      R.check("... and says so on the console", warn.length === 1, `${warn.length} warning(s)`);
      await page.close();
    }
  } finally {
    await Promise.race([br.close(), delay(8000)]); await Promise.race([srv.close(), delay(2000)]);
  }
});
