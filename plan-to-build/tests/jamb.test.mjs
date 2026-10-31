// Does the hollow of a cut window frame shimmer? The camera creeps 0.03 degrees a frame (8 frames); in the jamb's crop we count pixels whose value departs
// from the mean of its two neighbours in time by more than 10/255 (smooth motion cancels, z-fighting and shadow acne do not). A case passes when at most
// JAMB.limitPct of the crop shimmers. Run with the sun's shadow on and off: if the noise stays with the shadow off, the frame fights with the wall behind
// it; if it goes, it was shadow acne.
// Guards FRAME_CLEAR: a frame as wide as its opening has side faces in the plane of the block reveals; seen through the section cut 8 to 11 % of a 1:1
// jamb crop shimmered, and 0.1 % does with the frames 2 mm a side narrower.
//   usage: node jamb.test.mjs        (PTB_SITE=<site root> tests another copy of the site; PTB_JAMB_T=<seconds> picks another instant)
import { suite } from "./lib/suite.mjs";
import { launch, delay } from "./lib/cdp.mjs";
import { serveDbg } from "./lib/dbg.mjs";
import { waitReady, readFilm } from "./lib/film.mjs";
import { gpuArgs } from "./lib/chrome.mjs";
import { SITE, PAGE } from "./lib/site.mjs";
import { AT, JAMB } from "./expect.mjs";

const S = suite("jamb");
await S.run(async () => {
  if (!S.needChrome()) return;
  const srv = await serveDbg(SITE, "G3, T3");
  const br = await launch({ width: 1200, height: 800, args: gpuArgs() });
  try {
    const page = await br.newPage(`${srv.base}/${PAGE}`);
    await waitReady(page, 30000);
    const film = await readFilm(page);
    const T = process.env.PTB_JAMB_T ? +process.env.PTB_JAMB_T : film.S + AT.jambs;
    S.info(`instant t = ${T.toFixed(3)} s (S + ${(T - film.S).toFixed(3)})`);
    const run = async (shadow, cam, crop) => JSON.parse(await page.eval(`(async () => {
      const { G3, T3 } = window.__tl._dbg, lp = Math.log(Math.tan(38 * Math.PI / 360)), cam = ${JSON.stringify(cam)}, crop = ${JSON.stringify(crop)};
      G3.scene.traverse((o) => { if (o.isDirectionalLight) o.castShadow = ${shadow}; });
      const imgs = [];
      for (let i = 0; i < 8; i++) {
        const k = { ...cam, az: cam.az + i * 0.03, lp }; T3.cam = [[0, k], [1e6, k]];
        const u = await window.__tl.png(${T}, 1100);
        const im = await new Promise((r) => { const e = new Image(); e.onload = () => r(e); e.src = u; });
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
        imgs.push(x.getImageData(crop[0], crop[1], crop[2], crop[3]).data);
      }
      let bad = 0, n = crop[2] * crop[3] * 6;
      for (let f = 1; f < 7; f++) for (let i = 0; i < imgs[f].length; i += 4) {
        let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(imgs[f][i + c] - (imgs[f - 1][i + c] + imgs[f + 1][i + c]) / 2));
        if (m > 10) bad++;
      }
      return JSON.stringify({ bad, n });
    })()`));
    for (const { name, cam, crop } of JAMB.cases) for (const shadow of [true, false]) {
      const r = await run(shadow, cam, crop);
      const pct = 100 * r.bad / r.n;
      S.check(`${name.padEnd(12)} shadow ${shadow ? "on " : "off"}`, pct <= JAMB.limitPct, `shimmering pixels ${String(r.bad).padStart(6)} of ${r.n}  (${pct.toFixed(2)} %, limit ${JAMB.limitPct} %)`);
    }
  } finally { await Promise.race([br.close(), delay(8000)]); await Promise.race([srv.close(), delay(2000)]); }
});
