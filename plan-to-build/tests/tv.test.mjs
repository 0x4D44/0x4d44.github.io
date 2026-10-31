// The film ends on the television: the walk crosses the room to the sofa line and the lens closes in until the TV screen fills the frame, and the screen shows an
// advert for Claude Code (Sonnet 5.5).
//   1. the structure: a last chapter, ON THE TELEVISION, opens where the walk proper ends; the film ends 66 s after the walk's start; the advert's window is where it should be
//   2. the picture (adFrame, alone): each scene of the advert looks like itself; the picture is a pure function of the time into the advert (what was painted before does not matter)
//   3. the set: the screen mesh wears the advert's canvas, unlit by the room and untouched by the tone map; the canvas follows the film's clock, forwards, backwards and on a seek
//   4. the camera: it crosses the room at a walking pace, never near the TV unit, and ends on a seated eye facing north to the screen
//   5. the last frame (before the fade): the screen fills the whole frame, in the end card's colour, with no label or title over it
//   usage: node tv.test.mjs        (PTB_SITE=<site root> tests another copy of the site; PTB_MUTANT=<id> serves a page with a fix undone, see mutations.test.mjs)
import { suite, problems } from "./lib/suite.mjs";
import { launch, delay } from "./lib/cdp.mjs";
import { serveDbg } from "./lib/dbg.mjs";
import { waitReady, readFilm, state3D } from "./lib/film.mjs";
import { gpuArgs } from "./lib/chrome.mjs";
import { SITE, PAGE } from "./lib/site.mjs";
import { FILM, TV as X } from "./expect.mjs";

const T = suite("tv");
const near = (a, b, tol) => Math.abs(a - b) <= tol;
await T.run(async () => {
  if (!T.needChrome()) return;
  const srv = await serveDbg(SITE, "THREE, G3, T3, MAT3, TVAD, AD, adFrame, walkAt3, itemBox, ITEMS");
  const br = await launch({ width: 1200, height: 800, args: gpuArgs() });
  try {
    const page = await br.newPage(`${srv.base}/${PAGE}`);
    const ready = await waitReady(page, 30000), g3 = await state3D(page);
    T.check("page ready", ready && g3.ok, g3.detail);
    const film = await readFilm(page);
    const W = JSON.parse(await page.eval(`(() => { const T3 = window.__tl._dbg.T3; return JSON.stringify({ Z: T3.walk[0][0], walkEnd: T3.walkEnd, ad: T3.tvAd, titleOut: T3.titleOut, end: T3.end, adLen: window.__tl._dbg.AD.len }); })()`));
    const Z = W.Z;

    // ---- 1. the structure
    const last = film.chapters[film.chapters.length - 1];
    T.check(`the last chapter is "${X.chapter}" and it opens where the walk proper ends (Z + ${X.after} s, to within 1 s)`, last.name === X.chapter && near(last.t - Z, X.after, 1), `${last.num} ${last.name} at Z${last.t - Z >= 0 ? "+" : ""}${(last.t - Z).toFixed(2)}`);
    T.check(`the film ends ${X.seconds} s after the walk's start, on the film's own length (${FILM.seconds} s)`, near(film.T - Z, X.seconds, FILM.secondsTol) && near(film.T, FILM.seconds, FILM.secondsTol) && near(W.end, film.T, 1e-9), `Z = ${Z.toFixed(2)}, film ${film.T.toFixed(2)}`);
    T.check(`the walk proper ends at Z + ${X.after} s, and the end title leaves with it`, near(W.walkEnd - Z, X.after, 1e-6) && near(W.titleOut - Z, X.after, 1e-6), `walk ends Z+${(W.walkEnd - Z).toFixed(2)}, title out Z+${(W.titleOut - Z).toFixed(2)}`);
    T.check(`the set changes channel at Z + ${X.adStart} s and the advert runs ${X.adLen} s, ending well before the film does (the end card stays up)`, near(W.ad[0] - Z, X.adStart, 1e-6) && near(W.ad[1] - W.ad[0], X.adLen, 1e-6) && near(W.adLen, X.adLen, 1e-9) && W.ad[1] < film.T - 1, `advert Z+${(W.ad[0] - Z).toFixed(2)} .. Z+${(W.ad[1] - Z).toFixed(2)}, adLen ${W.adLen}`);

    // ---- 2. the picture, scene by scene, and as a pure function of the time into the advert
    const P = JSON.parse(await page.eval(`(() => {
      const d = window.__tl._dbg, X = ${JSON.stringify(X)}, w = 480, h = 270, c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true }), res = {};
      const lum = (r, gg, b) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      const hash = () => { const p = g.getImageData(0, 0, w, h).data; let a = 0; for (let i = 0; i < p.length; i++) a = (Math.imul(a, 31) + p[i]) | 0; return a; };
      const stat = (ph) => {
        d.adFrame(g, w, h, ph.u); const p = g.getImageData(0, 0, w, h).data; let n = w * h, s = 0, s2 = 0, clay = 0;
        for (let i = 0; i < p.length; i += 4) { const l = lum(p[i], p[i + 1], p[i + 2]); s += l; s2 += l * l; if (Math.abs(p[i] - 217) < 14 && Math.abs(p[i + 1] - 119) < 14 && Math.abs(p[i + 2] - 87) < 14) clay++; }
        const mean = s / n, o = { u: ph.u, what: ph.what, lum: mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)), clay: clay / n, bands: [] };
        for (const [a, b] of ph.bands || []) { let dark = 0, m = 0; for (let y = Math.round(a * h); y < Math.round(b * h); y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; m++; if (lum(p[i], p[i + 1], p[i + 2]) < 80) dark++; } o.bands.push(dark / m); }
        return o;
      };
      res.phases = X.phases.map(stat);
      // pure: the card at 7.6 s painted fresh, then after other scenes on the same canvas
      d.adFrame(g, w, h, 7.6); const fresh = hash(); d.adFrame(g, w, h, 0.2); d.adFrame(g, w, h, 13.4); d.adFrame(g, w, h, 3.9); d.adFrame(g, w, h, 7.6); res.pureCard = fresh === hash();
      d.adFrame(g, w, h, 0.2); const s1 = hash(); d.adFrame(g, w, h, 11); d.adFrame(g, w, h, 0.2); res.pureSnow = s1 === hash();
      d.adFrame(g, w, h, 0.2); const sa = hash(); d.adFrame(g, w, h, 0.25); res.snowMoves = sa !== hash();
      return JSON.stringify(res);
    })()`, { timeout: 60000 }));
    for (const ph of P.phases) {
      const x = X.phases.find((q) => q.u === ph.u), why = `lum ${ph.lum.toFixed(0)}, std ${ph.std.toFixed(0)}, terracotta ${(ph.clay * 100).toFixed(2)} %${ph.bands.length ? ", dark text in bands " + ph.bands.map((b) => (b * 100).toFixed(2) + " %").join(" / ") : ""}`;
      const ok = (x.stdMin === undefined || ph.std >= x.stdMin) && (x.lumMax === undefined || ph.lum <= x.lumMax) && (x.lumMin === undefined || ph.lum >= x.lumMin) && (x.clayMin === undefined || ph.clay >= x.clayMin) && ph.bands.every((b) => b >= x.bandDark);
      const need = [x.stdMin !== undefined && `std >= ${x.stdMin}`, x.lumMax !== undefined && `brightness <= ${x.lumMax}`, x.lumMin !== undefined && `brightness >= ${x.lumMin}`, x.clayMin !== undefined && `terracotta >= ${x.clayMin * 100} %`, x.bands && `a line of dark text in each of ${x.bands.length} bands`].filter(Boolean).join(", ");
      T.check(`the advert at ${ph.u} s is the ${ph.what} (${need})`, ok, why);
    }
    T.check("the picture is a pure function of the time into the advert (the card painted after other scenes is the card painted fresh)", P.pureCard && P.pureSnow);
    T.check("the snow moves from one frame to the next (it is not a still)", P.snowMoves);

    // ---- 3. the set
    const S = JSON.parse(await page.eval(`(async () => {
      const d = window.__tl._dbg, { TVAD, MAT3, G3 } = d, Z = ${Z}, ad = ${JSON.stringify(W.ad)}, res = {};
      window.__tl.at(Z + 10);
      let mesh = null; G3.root.traverse((o) => { if (o.isMesh && o.material === MAT3.screen) mesh = o; });
      res.mesh = !!mesh; res.mapOk = !!(MAT3.screen && MAT3.screen.emissiveMap === TVAD.tex); res.toneMapped = MAT3.screen ? MAT3.screen.toneMapped : null; res.intensity = MAT3.screen ? MAT3.screen.emissiveIntensity : null; res.size = [TVAD.w, TVAD.h];
      const sc = document.createElement('canvas'); sc.width = TVAD.w; sc.height = TVAD.h; const sg = sc.getContext('2d', { willReadFrequently: true });
      const sum = () => { sg.clearRect(0, 0, TVAD.w, TVAD.h); sg.drawImage(TVAD.c, 0, 0); const p = sg.getImageData(0, 0, TVAD.w, TVAD.h).data; let a = 0; for (let i = 0; i < p.length; i += 4) a = (Math.imul(a, 31) + p[i] + 3 * p[i + 1] + 7 * p[i + 2]) | 0; return a; };
      const at = (t) => { window.__tl.at(t); return { h: sum(), state: TVAD.state }; };
      const idle1 = at(Z + 10), idle2 = at(ad[0] - 0.5), a1 = at(ad[0] + 6.1), a2 = at(ad[0] + 9.3), back = at(ad[0] + 6.1), idle3 = at(Z + 10), e1 = at(ad[1] + 0.2), e2 = at(window.__tl.T - 0.1);
      res.states = [idle1, idle2, a1, a2, back, idle3, e1, e2].map((q) => q.state);
      res.idleSame = idle1.h === idle2.h && idle1.h === idle3.h; res.advertMoves = a1.h !== idle1.h && a2.h !== a1.h && a1.h !== e1.h; res.seekBack = back.h === a1.h; res.endHeld = e1.h === e2.h;
      return JSON.stringify(res);
    })()`, { timeout: 120000 }));
    T.check("the TV unit's screen is in the scene and wears the advert's canvas (1920 x 1080), lit as a set: emissive 1, not tone-mapped", S.mesh && S.mapOk && S.toneMapped === false && S.intensity === 1 && S.size[0] === 1920 && S.size[1] === 1080, JSON.stringify({ mesh: S.mesh, mapOk: S.mapOk, toneMapped: S.toneMapped, intensity: S.intensity, size: S.size }));
    T.check("before the advert the set shows its old picture; during it the picture changes; seeking back to a time gives that time's picture again; after it the end card is held", S.idleSame && S.advertMoves && S.seekBack && S.endHeld && JSON.stringify(S.states) === JSON.stringify(["idle", "idle", "play", "play", "play", "idle", "end", "end"]), `${S.states.join(" ")}; idle same ${S.idleSame}, moves ${S.advertMoves}, seek back ${S.seekBack}, end held ${S.endHeld}`);

    // ---- 4. the camera
    const C = JSON.parse(await page.eval(`(() => {
      const d = window.__tl._dbg, T3 = d.T3, X = ${JSON.stringify(X)}, DEG = Math.PI / 180, DT = 1 / 60, Z = ${Z};
      const tvu = d.ITEMS.find((it) => it.type === 'tvu'), box = d.itemBox(tvu);
      const dist = (x, y, r) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3])) / 1000;
      let prev = null, speed = 0, yaw = 0, pit = 0, near = 1e9, nearT = 0;
      for (let t = T3.walkEnd; t <= T3.end + 1e-9; t += DT) {
        const w = d.walkAt3(t);
        if (prev) { speed = Math.max(speed, Math.hypot(w.ex - prev.ex, w.ey - prev.ey, w.ez - prev.ez) / DT); yaw = Math.max(yaw, Math.abs(w.hd - prev.hd) / DT); pit = Math.max(pit, Math.abs(w.pd - prev.pd) / DT); }
        const q = dist(w.ex * 1000, -w.ez * 1000, box); if (q < near) { near = q; nearT = t - Z; }
        prev = w;
      }
      const e = d.walkAt3(T3.end), f = 2 * Math.atan(Math.exp(e.lp)) / DEG;
      return JSON.stringify({ speed, yaw, pit, near, nearT, end: { ex: e.ex, ey: e.ey, ez: e.ez, hd: e.hd, pd: e.pd, fov: f }, tvu: !!tvu });
    })()`, { timeout: 60000 }));
    T.check(`the camera crosses the room slowly (<= ${X.maxSpeed} m/s) and turns steadily (<= ${X.maxYaw} deg/s, tips <= ${X.maxPitch} deg/s)`, C.tvu && C.speed <= X.maxSpeed && C.yaw <= X.maxYaw && C.pit <= X.maxPitch, `${C.speed.toFixed(2)} m/s, ${C.yaw.toFixed(1)} deg/s, ${C.pit.toFixed(1)} deg/s`);
    T.check(`the eye is never within ${X.clearTv} m of the TV unit`, C.near >= X.clearTv, `closest ${C.near.toFixed(2)} m at Z+${C.nearT.toFixed(2)}`);
    const hd = ((C.end.hd % 360) + 360) % 360;
    T.check(`the film ends on a seated eye on the sofa line (${X.endEye.join(", ")} m), facing north (${X.endHeading} deg) to the screen`, near(C.end.ex, X.endEye[0], X.endEyeTol) && near(C.end.ey, X.endEye[1], X.endEyeTol) && near(C.end.ez, X.endEye[2], X.endEyeTol) && near(hd, X.endHeading, X.endHeadingTol), `eye ${C.end.ex.toFixed(2)}, ${C.end.ey.toFixed(2)}, ${C.end.ez.toFixed(2)}; heading ${hd.toFixed(1)} deg, lens ${C.end.fov.toFixed(1)} deg`);

    // ---- 5. the last frame before the fade: the screen fills the frame
    const L = JSON.parse(await page.eval(`(async () => {
      const X = ${JSON.stringify(X)}, W = 1280, t = ${Z} + X.fillAt, res = {};
      const im = new Image(); im.src = window.__tl.png(t, W); await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
      const avg = (x, y, r = 3) => { const p = g.getImageData(x - r, y - r, 2 * r + 1, 2 * r + 1).data; let a = 0, b = 0, e = 0, n = p.length / 4; for (let i = 0; i < p.length; i += 4) { a += p[i]; b += p[i + 1]; e += p[i + 2]; } return [a / n, b / n, e / n]; };
      const w = c.width, h = c.height, m = 14, pts = { tl: [m, m], tr: [w - m, m], bl: [m, h - m], br: [w - m, h - m], top: [w / 2, m], bottom: [w / 2, h - m], left: [m, h / 2], right: [w - m, h / 2] };
      res.px = Object.fromEntries(Object.entries(pts).map(([k, [x, y]]) => [k, avg(x, y)]));
      const strip = (x0, y0, sw, sh) => { const p = g.getImageData(x0, y0, sw, sh).data, n = p.length / 4, m = [0, 0, 0]; for (let i = 0; i < p.length; i += 4) for (let k = 0; k < 3; k++) m[k] += p[i + k] / n; let dev = 0; for (let i = 0; i < p.length; i += 4) for (let k = 0; k < 3; k++) dev = Math.max(dev, Math.abs(p[i + k] - m[k])); return dev; };
      res.dev = { topLeft: strip(0, 0, 260, 60), bottomLeft: strip(0, h - 150, 400, 130) };       // (the card's own fine print starts at x = 450)
      return JSON.stringify(res);
    })()`, { timeout: 90000 }));
    const fmt = (p) => p.map((v) => Math.round(v)).join(",");
    const off = (p) => Math.max(...p.map((v, i) => Math.abs(v - X.card[i])));
    const bad = Object.entries(L.px).filter(([k, p]) => off(p) > (/^(tl|tr|top)$/.test(k) ? X.cardTolTop : X.cardTol));
    T.check(`at Z + ${X.fillAt} s the screen fills the frame: all four corners and four edges are the end card's colour (${X.card.join(",")} within ${X.cardTol}, ${X.cardTolTop} along the top)`, bad.length === 0, Object.entries(L.px).map(([k, p]) => `${k} ${fmt(p)}`).join(" | "));
    T.check(`and nothing is laid over it: no viewport label at the top left, no end title at the bottom left (no colour channel strays more than ${X.hudDev} from the strip's mean)`, L.dev.topLeft <= X.hudDev && L.dev.bottomLeft <= X.hudDev, `top left ${L.dev.topLeft.toFixed(1)}, bottom left ${L.dev.bottomLeft.toFixed(1)}`);

    // how long the advert's frames take to draw (report only: the machine decides)
    const ms = await page.eval(`(() => { const t0 = performance.now(), a = ${W.ad[0]} + 4; for (let i = 0; i < 20; i++) window.__tl.at(a + i * 0.4); return (performance.now() - t0) / 20; })()`, { timeout: 120000 });
    T.soft(`an advert frame (painting and drawing, 1 / 20 of 8 s) takes under 250 ms here`, ms < 250, `${ms.toFixed(0)} ms per frame`);

    const bad2 = problems(page, /favicon|X4122/);
    T.check("no console errors", bad2.length === 0, JSON.stringify(bad2.slice(0, 3)));
  } finally { await Promise.race([br.close(), delay(8000)]); await Promise.race([srv.close(), delay(2000)]); }
});
