// Reads the film's own description out of the running page (window.__tl), so the tests derive times from the film instead of hard-coding them.
import { delay } from "./cdp.mjs";

// Waits for window.__ready (the page sets it once three.js has loaded and the 3D scene is built, or has failed to).
export async function waitReady(page, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.eval("window.__ready === true").catch(() => false)) return true;
    await delay(100);
  }
  return false;
}

// Did the 3D scene get built? The page sets __ready even when three.js never arrived (the drafting then plays on its own), so a test that needs the
// 3D half checks this too. The page imports three.js and mp4-muxer from cdn.jsdelivr.net: offline, every 3D check would fail without saying why.
export async function state3D(page) {
  const g = await page.eval("JSON.stringify(window.__tl ? window.__tl.g3 : null)").then(JSON.parse).catch(() => null);
  if (g && g.ready && !g.error && !g.lost) return { ok: true, detail: "" };
  return { ok: false, detail: `3D not ready: ${JSON.stringify(g)} (the page loads three.js and mp4-muxer from cdn.jsdelivr.net: is it reachable?)` };
}

// { S, T, chapters: [{ t, num, name }], ph, paintT, cutT, end }
//   S         T3.swap: the moment the 2D drafting hands over to the 3D model (every 3D time in the film is S + an offset)
//   T         the film's length in seconds
//   chapters  the player's chapter marks
//   ph, paintT, cutT, end   the 3D schedule (phase windows, one painting window per room, the section cut), when the page has them
export async function readFilm(page) {
  return JSON.parse(await page.eval(`JSON.stringify((() => {
    const t = window.__tl;
    return { S: t.T3.swap, T: t.T, chapters: t.TR.chap.map((c) => ({ t: c.t, num: c.num, name: c.name })), ph: t.T3.ph || null, paintT: t.T3.paintT || null, cutT: t.T3.cutT || null, end: t.T3.end === undefined ? null : t.T3.end };
  })())`));
}
