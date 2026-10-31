// Regression for the flickering block walls: two construction solids (block, insulation, concrete) must never have faces in the same plane, facing the same
// way, that overlap: from the camera those faces fight for the pixel and the wall flickers (a column's outer face lay exactly in its wall's outer face).
// Downward faces are skipped (they rest on the slab and are never seen). Checked while the walls are up, in the cut state and after the cut lifts.
// A window or door frame is double-sided (the section plane clips it and it is seen from inside): a side face of a frame lying in the plane of a wall's
// reveal fights it, either way round, so frames are checked against the solids too (they are RoundedBoxGeometry, which the first scan skipped).
//   usage: node zfight.test.mjs        (PTB_SITE=<site root> tests another copy of the site)
import { suite, problems } from "./lib/suite.mjs";
import { launch, delay } from "./lib/cdp.mjs";
import { serveDbg } from "./lib/dbg.mjs";
import { waitReady, readFilm, state3D } from "./lib/film.mjs";
import { gpuArgs } from "./lib/chrome.mjs";
import { SITE, PAGE } from "./lib/site.mjs";
import { AT, ZFIGHT } from "./expect.mjs";

const S = suite("zfight");
await S.run(async () => {
  if (!S.needChrome()) return;
  const srv = await serveDbg(SITE, "G3, MAT3, T3");
  const br = await launch({ width: 1200, height: 800, args: gpuArgs() });
  try {
    const page = await br.newPage(`${srv.base}/${PAGE}`);
    const ready = await waitReady(page, 30000), g3 = await state3D(page);
    S.check("page ready", ready && g3.ok, g3.detail);
    const film = await readFilm(page);
    const scan = (t) => page.eval(`(() => {
      const { G3, MAT3 } = window.__tl._dbg;
      const SOLIDS = ${JSON.stringify(ZFIGHT.solids)}, FRAMES = ${JSON.stringify(ZFIGHT.frames)};
      window.__tl.at(${t});
      const names = new Map(); for (const k in MAT3) names.set(MAT3[k], k);
      G3.root.updateMatrixWorld(true);
      const boxes = [], frames = [];
      G3.root.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry || (o.geometry.type !== 'BoxGeometry' && o.geometry.type !== 'RoundedBoxGeometry')) return;
        const mat = names.get(o.material), isFrame = FRAMES.includes(mat);
        if (!SOLIDS.includes(mat) && !isFrame) return;
        if (o.geometry.type === 'RoundedBoxGeometry' && !isFrame) return;
        const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
        const e = o.matrixWorld.elements, bb = g.boundingBox;
        const pts = [];
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z])
          pts.push([e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]);
        const mn = [0, 1, 2].map((a) => Math.min(...pts.map((p) => p[a]))), mx = [0, 1, 2].map((a) => Math.max(...pts.map((p) => p[a])));
        if (mx[0] - mn[0] < 1e-4 || mx[1] - mn[1] < 1e-4 || mx[2] - mn[2] < 1e-4) return;
        (isFrame ? frames : boxes).push({ mn, mx, mat });
      });
      // a window or door frame is double-sided (it is clipped by the section plane and seen from inside): a side face lying in the plane of a wall's reveal fights it, either way round
      const badFrame = [];
      for (const F of frames) for (const B of boxes) for (const a of [0, 2]) {
        const o1 = (a + 1) % 3, o2 = (a + 2) % 3;
        const ov1 = Math.min(F.mx[o1], B.mx[o1]) - Math.max(F.mn[o1], B.mn[o1]), ov2 = Math.min(F.mx[o2], B.mx[o2]) - Math.max(F.mn[o2], B.mn[o2]);
        if (ov1 <= 0.005 || ov2 <= 0.005) continue;
        for (const pf of [F.mn[a], F.mx[a]]) for (const pb of [B.mn[a], B.mx[a]]) if (Math.abs(pf - pb) <= 0.0005) badFrame.push([F.mat + '+' + B.mat, 'xyz'[a], +(ov1 * ov2).toFixed(4)]);
      }
      const bad = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i], B = boxes[j];
        for (let a = 0; a < 3; a++) {
          const o1 = (a + 1) % 3, o2 = (a + 2) % 3;
          const ov1 = Math.min(A.mx[o1], B.mx[o1]) - Math.max(A.mn[o1], B.mn[o1]), ov2 = Math.min(A.mx[o2], B.mx[o2]) - Math.max(A.mn[o2], B.mn[o2]);
          if (ov1 <= 0.005 || ov2 <= 0.005) continue;                                       // slivers under 5 mm wide are sub-pixel
          for (const s of [-1, 1]) {
            if (a === 1 && s < 0) continue;
            const d = Math.abs((s > 0 ? A.mx[a] : A.mn[a]) - (s > 0 ? B.mx[a] : B.mn[a]));
            if (d <= 0.0005) bad.push([A.mat + '+' + B.mat, 'xyz'[a] + (s > 0 ? '+' : '-'), +(ov1 * ov2).toFixed(3)]);
          }
        }
      }
      return JSON.stringify({ boxes: boxes.length, bad, frames: frames.length, badFrame });
    })()`).then((s) => JSON.parse(s));
    for (const { label, at } of ZFIGHT.scans) {
      const dt = AT[at], o = await scan(film.S + dt);
      S.check(`no same-side coplanar overlapping faces among construction solids: ${label} (t=S+${dt})`, o.boxes > ZFIGHT.minSolids && o.bad.length === 0,
        `${o.boxes} solids, ${o.bad.length} fighting face pair(s)` + (o.bad.length ? " e.g. " + JSON.stringify(o.bad.slice(0, 4)) : ""));
      S.check(`no window or door frame has a side face in the plane of a wall reveal: ${label} (t=S+${dt})`, o.frames >= ZFIGHT.minFrames && o.badFrame.length === 0,
        `${o.frames} frame parts, ${o.badFrame.length} coplanar face pair(s)` + (o.badFrame.length ? " e.g. " + JSON.stringify(o.badFrame.slice(0, 3)) : ""));
    }
    const bad = problems(page, /favicon|X4122/);
    S.check("no console errors", bad.length === 0, JSON.stringify(bad.slice(0, 3)));
  } finally { await Promise.race([br.close(), delay(8000)]); await Promise.race([srv.close(), delay(2000)]); }
});
