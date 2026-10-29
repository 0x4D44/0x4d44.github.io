// Walks title, menu, options, garage, stages, briefing, results and service, and probes layout at each viewport.
// Used by the browser suite (walkLayout) and by hand: node tests/layout-walk.mjs <shotDir>
import { join } from "node:path";
import { openGame } from "./harness.mjs";
import { LAYOUT_PROBE } from "./layout-probe.mjs";

export const VIEWPORTS = [[844, 390, true], [390, 844, true], [1280, 720, false]];

const on = (g, name, ms = 60000) => g.waitFor(`window.__AR__.screenName() === ${JSON.stringify(name)}`, ms);
const click = async (g, label) => { if (!(await g.evalAsync(`window.__AR__.click(${JSON.stringify(label)})`))) throw new Error(`no button "${label}" on ${await g.evalAsync("window.__AR__.screenName()")}`); };

/** Returns { "<screen>@WxH": probeResult }. shotDir (optional) keeps a screenshot of each. */
export async function walkLayout(shotDir) {
  const out = {};
  const snap = async (g, label) => {
    for (const [w, h, m] of VIEWPORTS) {
      await g.setViewport(w, h, 1, m);
      await g.sleep(250);
      out[`${label}@${w}x${h}`] = await g.eval(LAYOUT_PROBE);
      if (shotDir) await g.screenshot(join(shotDir, `${label}-${w}x${h}.png`));
    }
  };
  // title needs its own page (?title=1 forces it even under webdriver)
  let g = await openGame({ width: 1280, height: 720, query: "title=1&quality=low&mute=1" });
  try {
    await g.waitForReady(); await on(g, "title");
    await snap(g, "title");
  } finally { await g.close(); }
  g = await openGame({ width: 1280, height: 720, query: "menu=1&quality=low&mute=1" });
  try {
    await g.waitForReady(); await on(g, "menu");
    await snap(g, "menu");
    await click(g, "Options"); await on(g, "options");
    for (const t of ["controls", "driving", "display", "audio", "data"]) { await click(g, t); await snap(g, "options-" + t); }
    await click(g, "Back"); await on(g, "menu");
    await click(g, "Garage"); await on(g, "car"); await g.sleep(400);
    await snap(g, "garage");
    await click(g, "Menu"); await on(g, "menu");
    await click(g, "Single stage"); await on(g, "stages");
    await snap(g, "stages");
    await click(g, "Waitomo"); await on(g, "car");
    await click(g, "Briefing"); await on(g, "briefing");
    await snap(g, "briefing");
    await g.evalAsync("window.__AR__.eraseSave(); 1");
    await g.goto("menu=1&quality=low&mute=1"); await g.waitForReady(); await on(g, "menu");
    await click(g, "Championship"); await on(g, "difficulty");
    await snap(g, "difficulty");
    await click(g, "Expert"); await on(g, "car");
    await click(g, "Choose stage 1"); await on(g, "briefing");
    await click(g, "Start stage");
    await g.waitFor("window.__AR__.state().screen === 'stage' && window.__AR__.state().status !== 'none'");
    await g.evalAsync("window.__AR__.whenOverlayGone().then(() => 1)");
    await g.evalAsync("window.__AR__.stepSim(120 * 4); window.__AR__.renderNow(); 1");
    await g.evalAsync("window.__AR__.finishRun(); window.__AR__.showResults(); 1");
    await on(g, "results");
    await snap(g, "results");
    await click(g, "Standings"); await on(g, "standings");
    await snap(g, "standings");
    await click(g, "Service area"); await on(g, "service");
    await snap(g, "service");
  } finally { await g.close(); }
  return out;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const res = await walkLayout(process.argv[2]);
  let bad = 0;
  for (const [k, v] of Object.entries(res)) { if (v.problems.length) { bad++; console.log(k, JSON.stringify(v.problems)); } else console.log(k, "ok", v.n, v.scrollable ? "(scrolls)" : ""); }
  process.exit(bad ? 1 : 0);
}
