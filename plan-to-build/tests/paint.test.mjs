// The interior walls are plastered and painted, room by room, and nothing outside the building changes.
//  1. the film has a plaster & paint stage; its windows are inside the phase and in the order the rooms are done
//  2. each room's progress is 0 before its window, 1 after, rises monotonically, and is mid-way in the middle of its window
//  3. pixels: with the camera fixed, un-painting ONE room (its window moved to the far future) changes pixels, and only inside the building, and only where
//     that room's faces are (the changes of two different rooms barely overlap); un-painting every room changes nothing outside the building
//  4. the colour that appears is the room's own hue
//  5. the reveal of a window is lined only as deep as its frame: the block beyond the frame is seen from outside and stays as built
//   usage: node paint.test.mjs        (PTB_SITE=<site root> tests another copy of the site; PTB_MUTANT=<id> serves a page with a fix undone, see mutations.test.mjs)
import { suite, problems } from "./lib/suite.mjs";
import { launch, delay } from "./lib/cdp.mjs";
import { serveDbg } from "./lib/dbg.mjs";
import { waitReady, readFilm, state3D } from "./lib/film.mjs";
import { gpuArgs } from "./lib/chrome.mjs";
import { SITE, PAGE } from "./lib/site.mjs";
import { AT, PAINT } from "./expect.mjs";

const S = suite("paint");
await S.run(async () => {
  if (!S.needChrome()) return;
  const srv = await serveDbg(SITE, "THREE, G3, T3, PAINTU, ROOMS, OUT, PAINT");
  const br = await launch({ width: 1200, height: 800, args: gpuArgs() });
  try {
    const page = await br.newPage(`${srv.base}/${PAGE}`);
    const ready = await waitReady(page, 30000), g3 = await state3D(page);
    S.check("page ready", ready && g3.ok, g3.detail);
    const film = await readFilm(page);
    const Sw = film.S;
    const has = await page.eval("(() => { try { const { T3, ROOMS } = window.__tl._dbg; return !!T3.paintT && ROOMS.every((r) => Array.isArray(T3.paintT[r.id])); } catch (e) { return false; } })()");
    S.check("the film has a plaster & paint stage, one window per room", has);
    if (has) {
      // ---- 1. windows
      const w = JSON.parse(await page.eval(`(() => { const { T3, ROOMS } = window.__tl._dbg; return JSON.stringify({ ph: T3.ph[${JSON.stringify(PAINT.phase)}], fx: T3.ph[${JSON.stringify(PAINT.next)}], ids: ROOMS.map((r) => r.id), win: ROOMS.map((r) => T3.paintT[r.id]) }); })()`));
      S.check("every room's window lies inside the paint phase", w.win.every((x) => x[0] >= w.ph[0] - 1e-9 && x[1] <= w.ph[1] + 1e-9 && x[1] - x[0] >= PAINT.minWindow), JSON.stringify(w.ph));
      S.check("the paint phase ends where the fixtures begin", Math.abs(w.ph[1] - w.fx[0]) < 1e-9);
      const t0s = w.win.map((x) => x[0]);
      S.check("rooms are done one after another (starts never go backwards in the order of the list)", t0s.every((v, i) => i === 0 || v >= t0s[i - 1]));
      // ---- 2. progress
      // seek and read in ONE call: the page warms its shaders in the background and renders other frames between two calls
      const progAt = async (t) => JSON.parse(await page.eval(`(() => { window.__tl.at(${t}); return JSON.stringify(Array.from(window.__tl._dbg.PAINTU.value)); })()`));
      const rows = [];
      for (let t = Sw + AT.paintFrom; t <= Sw + AT.paintTo; t += PAINT.step) rows.push({ t, v: await progAt(t) });
      const n = w.ids.length;
      let mono = true, before = true, after = true, mid = true;
      for (let i = 0; i < n; i++) {
        for (let k = 1; k < rows.length; k++) if (rows[k].v[i] < rows[k - 1].v[i] - 1e-6) mono = false;
        for (const r of rows) { if (r.t < w.win[i][0] - 1e-9 && r.v[i] !== 0) before = false; if (r.t > w.win[i][1] + 1e-9 && r.v[i] !== 1) after = false; }
        const v = (await progAt((w.win[i][0] + w.win[i][1]) / 2))[i];
        if (!(v > 0.3 && v < 0.7)) mid = false;
      }
      S.check("progress never goes backwards", mono);
      S.check("every room is unpainted before its window", before);
      S.check("every room is fully painted after its window", after);
      S.check("progress is mid-way in the middle of a room's window", mid);
      // ---- 3. pixels, with the camera fixed on the whole plan
      await page.eval(`(() => { const T = window.__tl._dbg.T3, k = { ...${JSON.stringify(PAINT.camera)}, lp: Math.log(Math.tan(38 * Math.PI / 360)) }; T.cam = [[0, k], [1e6, k]]; window.__shots = {};
        window.__grab = async (label, t, w) => { const u = await window.__tl.png(t, w); const im = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
          const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0); window.__shots[label] = x.getImageData(0, 0, c.width, c.height); return [c.width, c.height]; };
        window.__mask = (a, b, thr) => { const A = window.__shots[a].data, B = window.__shots[b].data, m = new Uint8Array(A.length / 4); for (let i = 0; i < m.length; i++) { const j = i * 4; if (Math.max(Math.abs(A[j] - B[j]), Math.abs(A[j + 1] - B[j + 1]), Math.abs(A[j + 2] - B[j + 2])) > thr) m[i] = 1; } return m; };
      })()`);
      const tAll = Sw + AT.allPainted, W = 960;
      const [gw, gh] = await page.eval(`window.__grab('all', ${tAll}, ${W})`);
      const out = JSON.parse(await page.eval(`(async () => {
        const { T3, ROOMS, THREE, G3, OUT, PAINT } = window.__tl._dbg, ids = ROOMS.map((r) => r.id), res = { px: {}, hue: {}, outside: 0, none: 0, sizes: {} };
        const w = ${gw}, h = ${gh};
        // the building's footprint on screen: a convex hull of its box (padded 0.5 m for the insulation and the edge of the silhouette)
        G3.camera.updateMatrixWorld(true);
        const pts = []; for (const y of [0, 3.2]) for (const x of [OUT[0] / 1000 - 0.5, OUT[2] / 1000 + 0.5]) for (const z of [-OUT[3] / 1000 - 0.5, -OUT[1] / 1000 + 0.5]) {
          const v = new THREE.Vector3(x, y, z).project(G3.camera); pts.push([(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h]); }
        pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const half = (P) => { const H = []; for (const p of P) { while (H.length >= 2 && cross(H[H.length - 2], H[H.length - 1], p) <= 0) H.pop(); H.push(p); } return H; };
        const lo = half(pts), up = half(pts.slice().reverse()); const hull = lo.slice(0, -1).concat(up.slice(0, -1));
        const inside = (x, y) => { let s = 0; for (let i = 0; i < hull.length; i++) { const c = cross(hull[i], hull[(i + 1) % hull.length], [x, y]); if (c < 0) s = -1; } return s === 0; };
        const hullMask = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) hullMask[y * w + x] = inside(x + 0.5, y + 0.5) ? 1 : 0;
        const masks = {};
        for (const id of ids) {
          const keep = T3.paintT[id]; T3.paintT[id] = [1e6, 1e6 + 1];
          await window.__grab('no-' + id, ${tAll}, ${W}); T3.paintT[id] = keep;
          masks[id] = window.__mask('all', 'no-' + id, 12);
          let n = 0, o = 0; for (let i = 0; i < masks[id].length; i++) if (masks[id][i]) { n++; if (!hullMask[i]) o++; }
          res.px[id] = n; res.outside += o;
        }
        // every room un-painted at once
        const keep = ids.map((id) => T3.paintT[id]); ids.forEach((id) => { T3.paintT[id] = [1e6, 1e6 + 1]; });
        await window.__grab('none', ${tAll}, ${W}); ids.forEach((id, i) => { T3.paintT[id] = keep[i]; });
        const mn = window.__mask('all', 'none', 12); let tot = 0, o2 = 0; for (let i = 0; i < mn.length; i++) if (mn[i]) { tot++; if (!hullMask[i]) o2++; }
        res.none = tot; res.outside += o2;
        // overlap between the changes of two different rooms
        let worst = 0, pair = '';
        for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) { let c = 0; for (let i = 0; i < mn.length; i++) if (masks[ids[a]][i] && masks[ids[b]][i]) c++; const f = c / Math.max(1, Math.min(res.px[ids[a]], res.px[ids[b]])); if (f > worst) { worst = f; pair = ids[a] + '/' + ids[b]; } }
        res.worst = worst; res.pair = pair;
        // the hue that appears in the room's own changed pixels, as an angle in an opponent space, weighted by chroma (so grey skirting counts for nothing)
        const hueOf = (r, g, b) => { const a = r - g, c = (r + g) / 2 - b; return Math.atan2(c, a) * 180 / Math.PI; };
        const A = window.__shots['all'].data;
        for (const id of ids) {
          let sa = 0, sc = 0, cnt = 0; const m = masks[id];
          for (let i = 0; i < m.length; i++) if (m[i]) { const j = i * 4; sa += A[j] - A[j + 1]; sc += (A[j] + A[j + 1]) / 2 - A[j + 2]; cnt++; }
          const want = PAINT[id][0], r = parseInt(want.slice(1, 3), 16), g = parseInt(want.slice(3, 5), 16), b = parseInt(want.slice(5, 7), 16);
          res.hue[id] = [Math.atan2(sc, sa) * 180 / Math.PI, hueOf(r, g, b), cnt];
        }
        return JSON.stringify(res);
      })()`));
      for (const id of w.ids) S.check(`un-painting ${id} changes its faces (at least 300 px at ${gw} px wide)`, out.px[id] >= 300, `${out.px[id]} px`);
      S.check("un-painting every room changes pixels", out.none >= 3000, `${out.none} px`);
      S.check("nothing changes outside the building (any room, or all of them)", out.outside === 0, `${out.outside} px outside`);
      S.check("two rooms' changes barely overlap (each wall face belongs to one room)", out.worst <= 0.12, `worst ${(out.worst * 100).toFixed(1)} % (${out.pair})`);
      const dh = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
      for (const id of w.ids) { const [got, want, cnt] = out.hue[id]; S.check(`${id}: the colour that appears is its own hue (within 25 degrees)`, cnt > 0 && dh(got, want) <= 25, `got ${got.toFixed(0)}, palette ${want.toFixed(0)}`); }
      // ---- 5. the reveal of a window is lined only as deep as its frame; the block beyond the frame is seen from outside and stays as built
      //         W01 (south wall, west jamb, x = 0.9 m). The wall runs from z = -0.10 (inside) to +0.20 (outside); the frame fills z = 0.035 .. 0.145.
      //         Painting every room on and off must change the inner reveal and must not change the outer one.
      const rv = JSON.parse(await page.eval(`(async () => {
        const { T3, ROOMS, THREE, G3 } = window.__tl._dbg, ids = ROOMS.map((r) => r.id), res = {}, lp = Math.log(Math.tan(38 * Math.PI / 360));
        const RX = ${JSON.stringify(PAINT.reveal.x)}, RY = ${JSON.stringify(PAINT.reveal.y)};
        const views = {
          outer: { cam: ${JSON.stringify(PAINT.reveal.outer.cam)}, z: ${JSON.stringify(PAINT.reveal.outer.z)} },
          inner: { cam: ${JSON.stringify(PAINT.reveal.inner.cam)}, z: ${JSON.stringify(PAINT.reveal.inner.z)} },
        };
        for (const name in views) {
          const v = views[name]; T3.cam = [[0, { ...v.cam, lp }], [1e6, { ...v.cam, lp }]];
          const [w, h] = await window.__grab('on-' + name, ${Sw + AT.cutLifted}, 1100);
          const keep = ids.map((id) => T3.paintT[id]); ids.forEach((id) => { T3.paintT[id] = [1e6, 1e6 + 1]; });
          await window.__grab('off-' + name, ${Sw + AT.cutLifted}, 1100); ids.forEach((id, i) => { T3.paintT[id] = keep[i]; });
          const m = window.__mask('on-' + name, 'off-' + name, 12);
          G3.camera.updateMatrixWorld(true);
          const P = [[RY[0], v.z[0]], [RY[1], v.z[0]], [RY[1], v.z[1]], [RY[0], v.z[1]]].map(([y, z]) => { const q = new THREE.Vector3(RX, y, z).project(G3.camera); return [(q.x * 0.5 + 0.5) * w, (-q.y * 0.5 + 0.5) * h]; });
          const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
          const inQ = (x, y) => { let pos = 0, neg = 0; for (let i = 0; i < 4; i++) { const c = cr(P[i], P[(i + 1) % 4], [x, y]); if (c > 0) pos++; else if (c < 0) neg++; } return pos === 0 || neg === 0; };
          let area = 0, changed = 0;
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inQ(x + 0.5, y + 0.5)) { area++; if (m[y * w + x]) changed++; }
          res[name] = { area, changed, P: P.map((p) => p.map(Math.round)) };
        }
        return JSON.stringify(res);
      })()`));
      for (const n of ["outer", "inner"]) S.check(`${n} reveal: the probe quad covers a real area on screen (at least 400 px)`, rv[n].area >= 400, `${rv[n].area} px at ${JSON.stringify(rv[n].P)}`);
      S.check("the inner reveal (in front of the frame) is lined: painting changes at least 40 % of it", rv.inner.changed >= 0.4 * rv.inner.area, `${rv.inner.changed} of ${rv.inner.area} px`);
      S.check("the outer reveal (beyond the frame) stays as built: painting changes at most 2 % of it", rv.outer.changed <= 0.02 * rv.outer.area, `${rv.outer.changed} of ${rv.outer.area} px`);
    }
    const bad = problems(page, /favicon|X4122/);
    S.check("no console errors or warnings (apart from the ANGLE X4122 shader note)", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
    S.check("three.js did not fail", await page.eval("window.__tl._dbg ? (!window.__tl._dbg.G3.error && !window.__tl._dbg.G3.lost) : true"));
  } finally { await Promise.race([br.close(), delay(8000)]); await Promise.race([srv.close(), delay(2000)]); }
});
