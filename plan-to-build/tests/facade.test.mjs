// The facade: mineral render over the insulation and cedar boarding in panels, on every elevation, put on during one lap of the building after HOME.
//   1. the film has a FACADE chapter, directly after HOME and before the walk-through; the lap is one full turn that ends on the pose it began with
//   2. the panels (FACADE in the page): every elevation carries both finishes, the panels are real panels, and their edges stand in piers, never in an opening
//   3. the elevations are worked one after another in the order the camera meets them; each one's progress is 0 before its window, 1 after, and rises in between
//   4. pixels, from a camera square on each elevation: before the facade the face is bare insulation (yellow) everywhere; once it is finished the render is near white,
//      the cedar is clearly coloured and differs from the render, and the plinth is dark
//   usage: node facade.test.mjs        (PTB_SITE=<site root> tests another copy of the site; PTB_MUTANT=<id> serves a page with a fix undone, see mutations.test.mjs)
import { suite, problems } from "./lib/suite.mjs";
import { launch, delay } from "./lib/cdp.mjs";
import { serveDbg } from "./lib/dbg.mjs";
import { waitReady, readFilm, state3D } from "./lib/film.mjs";
import { gpuArgs } from "./lib/chrome.mjs";
import { SITE, PAGE } from "./lib/site.mjs";
import { FACADE as X } from "./expect.mjs";

const T = suite("facade");
// a camera square on each elevation: orbit azimuth (0 looks north from the south, 90 west from the east, ...), a little above the horizon, the whole face in view
const CAMS = {
  S: { tx: 6.0, ty: 1.4, tz: -4.475, az: 0, el: 3, H: 11 },
  E: { tx: 6.0, ty: 1.4, tz: -4.475, az: 90, el: 3, H: 9.5 },
  N: { tx: 6.0, ty: 1.4, tz: -4.475, az: 180, el: 3, H: 11 },
  W: { tx: 6.0, ty: 1.4, tz: -4.475, az: 270, el: 3, H: 9.5 },
};
await T.run(async () => {
  if (!T.needChrome()) return;
  const srv = await serveDbg(SITE, "THREE, G3, T3, FACADE, FACADEU, FACADE_IDS, OPENINGS, INSO, camAt3");
  const br = await launch({ width: 1200, height: 800, args: gpuArgs() });
  try {
    const page = await br.newPage(`${srv.base}/${PAGE}`);
    const ready = await waitReady(page, 30000), g3 = await state3D(page);
    T.check("page ready", ready && g3.ok, g3.detail);
    const film = await readFilm(page);
    const F0 = film.S + X.after, F1 = F0 + X.seconds;

    // ---- 1. the chapter and the lap
    const names = film.chapters.map((c) => c.name), i = names.indexOf(X.chapter);
    T.check(`the film has a ${X.chapter} chapter, after HOME and before ${names[i + 1] || "the walk-through"}`, i > 0 && names[i - 1] === "HOME" && names[i + 1] === "WALK-THROUGH", names.slice(Math.max(0, i - 1), i + 2).join(" > "));
    T.check(`it starts where the HOME orbit ends (S + ${X.after} s) and lasts ${X.seconds} s, up to the walk`, i > 0 && Math.abs(film.chapters[i].t - F0) < 0.01 && Math.abs(film.chapters[i + 1].t - (F1 - 0.6)) < 0.01, `starts ${i > 0 ? (film.chapters[i].t - film.S).toFixed(2) : "?"} after S`);
    const lap = JSON.parse(await page.eval(`(() => { const d = window.__tl._dbg, a = d.camAt3(${F0}), b = d.camAt3(${F1}); return JSON.stringify({ a, b }); })()`));
    const same = ["tx", "ty", "tz", "el", "H", "lp"].every((k) => Math.abs(lap.a[k] - lap.b[k]) < 1e-9);
    T.check(`the camera makes one full turn (${X.lapDegrees} deg) and ends on the pose it began with`, same && Math.abs(lap.b.az - lap.a.az - X.lapDegrees) < 1e-6, `az ${lap.a.az.toFixed(2)} -> ${lap.b.az.toFixed(2)}`);

    // ---- 2. the panels
    const D = JSON.parse(await page.eval(`(() => { const d = window.__tl._dbg; return JSON.stringify({ F: d.FACADE, ids: d.FACADE_IDS, INSO: d.INSO, ops: d.OPENINGS.filter((o) => o.ext).map((o) => ({ id: o.id, wall: o.wall, a0: o.a0, a1: o.a1 })) }); })()`));
    const ext = { S: [D.INSO[0], D.INSO[2]], N: [D.INSO[0], D.INSO[2]], E: [D.INSO[1], D.INSO[3]], W: [D.INSO[1], D.INSO[3]] };
    const sane = D.ids.every((id) => { const p = D.F[id] || []; return p.length >= 1 && p.length <= 3 && p.every((q, k) => q[1] - q[0] >= X.panelMin && q[0] >= ext[id][0] && q[1] <= ext[id][1] && (k === 0 || q[0] > p[k - 1][1])); });
    T.check("every elevation has one to three cedar panels, each wide enough, inside the elevation, in order", sane && D.ids.length === 4, JSON.stringify(D.F));
    const shares = D.ids.map((id) => ({ id, s: (D.F[id] || []).reduce((n, q) => n + q[1] - q[0], 0) / (ext[id][1] - ext[id][0]) }));
    T.check(`both finishes show on every elevation: cedar is ${X.share[0] * 100} to ${X.share[1] * 100} % of each`, shares.every((q) => q.s >= X.share[0] && q.s <= X.share[1]), shares.map((q) => `${q.id} ${(q.s * 100).toFixed(0)} %`).join(", "));
    const bad = [];
    for (const id of D.ids) for (const q of D.F[id] || []) for (const o of D.ops.filter((o) => o.wall === id)) {
      const inside = o.a0 >= q[0] && o.a1 <= q[1], outside = o.a1 <= q[0] || o.a0 >= q[1];
      if (!inside && !outside) bad.push(`${id} panel ${q} cuts through ${o.id} (${o.a0}..${o.a1})`);
      else { const gap = inside ? Math.min(o.a0 - q[0], q[1] - o.a1) : Math.min(Math.abs(o.a0 - q[1]), Math.abs(q[0] - o.a1)); if (gap < X.clear) bad.push(`${id} panel ${q} is ${gap} mm from ${o.id}`); }
    }
    T.check(`no panel edge cuts through an opening or stands within ${X.clear} mm of one`, bad.length === 0, bad.slice(0, 3).join("; "));

    // ---- 3. the order of work and the progress of each elevation
    const W = JSON.parse(await page.eval(`(() => { const d = window.__tl._dbg; return JSON.stringify(d.T3.facT); })()`));
    const starts = X.order.map((id) => W[id][0]);
    T.check(`the elevations are worked in the order the camera meets them (${X.order.join(", ")}), each for at least ${X.windowMin} s, inside the lap`, X.order.every((id) => W[id] && W[id][1] - W[id][0] >= X.windowMin && W[id][0] >= F0 - 1e-9 && W[id][1] <= F1 + 1e-9) && starts.every((v, k) => k === 0 || v > starts[k - 1]), JSON.stringify(W));
    const prog = async (t) => JSON.parse(await page.eval(`(() => { window.__tl.at(${t}); return JSON.stringify(Array.from(window.__tl._dbg.FACADEU.value)); })()`));
    let before = true, after = true, mono = true, mid = true, prev = null;
    for (let t = F0 - 0.5; t <= F1 + 0.5; t += 0.25) {
      const v = await prog(t);
      D.ids.forEach((id, k) => { const w = W[id]; if (t < w[0] - 1e-9 && v[k] !== 0) before = false; if (t > w[1] + 1e-9 && v[k] !== 1) after = false; if (prev && v[k] < prev[k] - 1e-6) mono = false; });
      prev = v;
    }
    for (const id of D.ids) { const k = D.ids.indexOf(id), v = (await prog((W[id][0] + W[id][1]) / 2))[k]; if (!(v > 0.3 && v < 0.7)) mid = false; }
    T.check("every elevation is untouched before its window", before);
    T.check("and finished after it, by the end of the lap", after);
    T.check("progress never goes backwards", mono);
    T.check("progress is mid-way in the middle of a window", mid);

    // ---- 4. pixels
    const out = JSON.parse(await page.eval(`(async () => {
      const d = window.__tl._dbg, { T3, THREE, G3, FACADE, INSO } = d, OPS = d.OPENINGS.filter((o) => o.ext), CAMS = ${JSON.stringify(CAMS)}, X = ${JSON.stringify(X)}, WID = 1280, res = {};
      const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
      const ext = { S: [INSO[0], INSO[2]], N: [INSO[0], INSO[2]], E: [INSO[1], INSO[3]], W: [INSO[1], INSO[3]] };
      const pt = (id, a, y) => id === 'S' ? [a / 1000, y, -INSO[1] / 1000] : id === 'N' ? [a / 1000, y, -INSO[3] / 1000] : id === 'E' ? [INSO[2] / 1000, y, -a / 1000] : [INSO[0] / 1000, y, -a / 1000];
      for (const state of ['before', 'after']) {
        const t = state === 'before' ? ${F0 - 0.05} : ${F1 - 0.05};
        for (const id of ['S', 'E', 'N', 'W']) {
          const k = { ...CAMS[id], lp: Math.log(Math.tan(38 * Math.PI / 360)) }; T3.cam = [[0, k], [1e6, k]];
          const im = await load(window.__tl.png(t, WID)), c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
          G3.camera.updateMatrixWorld(true);
          const at = (a, y) => {
            const v = new THREE.Vector3(...pt(id, a, y)).project(G3.camera), x = Math.round((v.x * 0.5 + 0.5) * c.width), yy = Math.round((-v.y * 0.5 + 0.5) * c.height);
            if (x < 3 || yy < 3 || x > c.width - 4 || yy > c.height - 4) return null;
            const p = g.getImageData(x - 2, yy - 2, 5, 5).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < p.length; i += 4) { r += p[i]; gg += p[i + 1]; b += p[i + 2]; }
            const n = p.length / 4; return [r / n, gg / n, b / n];
          };
          // a point along a stretch that is not in front of an opening (the plinth sample must be on the wall, not on a glazed door that starts at the floor)
          const clear = (a, b) => { const free = (m) => !OPS.some((o) => o.wall === id && m > o.a0 - 250 && m < o.a1 + 250); const mid = (a + b) / 2; for (let dx = 0; dx <= (b - a) / 2 - 100; dx += 50) for (const m of [mid + dx, mid - dx]) if (free(m)) return m; return mid; };
          const rs = [], cs = [];
          // render stretches: between the panels (and at the ends); cedar stretches: the panels
          const gaps = []; let from = ext[id][0]; for (const q of FACADE[id]) { gaps.push([from, q[0]]); from = q[1]; } gaps.push([from, ext[id][1]]);
          for (const [a, b] of gaps) if (b - a >= X.sampleMin) { const m = clear(a, b); rs.push({ a, b, m, px: at(m, X.sampleY), plinth: at(m, X.plinthY) }); }
          for (const q of FACADE[id]) if (q[1] - q[0] >= X.sampleMin) { const m = clear(q[0], q[1]); cs.push({ a: q[0], b: q[1], m, px: at(m, X.sampleY), plinth: at(m, X.plinthY) }); }
          res[state + id] = { rs, cs };
        }
      }
      return JSON.stringify(res);
    })()`, { timeout: 180000 }));
    const lum = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2], chroma = (p) => Math.max(...p) - Math.min(...p), dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
    const fmt = (p) => (p ? p.map((v) => Math.round(v)).join(",") : "off screen");
    for (const id of ["S", "E", "N", "W"]) {
      const b = out["before" + id], a = out["after" + id];
      const all = [...b.rs, ...b.cs].map((s) => s.px);
      T.check(`${id} elevation, before: bare insulation everywhere (yellow, chroma >= 100)`, b.rs.length >= 1 && b.cs.length >= 1 && all.every((p) => p && chroma(p) >= 100), all.map(fmt).join(" | "));
      const rOk = a.rs.length >= 1 && a.rs.every((s) => s.px && chroma(s.px) <= X.chromaRender && lum(s.px) >= X.lumRender);
      T.check(`${id} elevation, finished: the render is near white (chroma <= ${X.chromaRender}, brightness >= ${X.lumRender})`, rOk, a.rs.map((s) => fmt(s.px)).join(" | "));
      const cOk = a.cs.length >= 1 && a.cs.every((s) => s.px && chroma(s.px) >= X.chromaCedar && s.px[0] > s.px[1] && s.px[1] > s.px[2]);
      T.check(`${id} elevation, finished: the cedar is clearly coloured, warm (r > g > b, chroma >= ${X.chromaCedar})`, cOk, a.cs.map((s) => fmt(s.px)).join(" | "));
      const apart = a.rs.length && a.cs.length ? Math.min(...a.rs.flatMap((r) => a.cs.map((c) => (r.px && c.px ? dist(r.px, c.px) : 0)))) : 0;
      T.check(`${id} elevation, finished: render and cedar differ by at least ${X.apart}`, apart >= X.apart, `smallest difference ${apart.toFixed(0)}`);
      const pl = [...a.rs, ...a.cs].map((s) => s.plinth);
      T.check(`${id} elevation, finished: the plinth is dark (brightness <= ${X.lumPlinthMax}) under both`, pl.length >= 2 && pl.every((p) => p && lum(p) <= X.lumPlinthMax), pl.map(fmt).join(" | "));
    }

    const bad2 = problems(page, /favicon|X4122/);
    T.check("no console errors", bad2.length === 0, JSON.stringify(bad2.slice(0, 3)));
  } finally { await Promise.race([br.close(), delay(8000)]); await Promise.race([srv.close(), delay(2000)]); }
});
