// Screenshot every stage (or the ones named) at several positions along the road.
//   node tests/shoot.mjs <outDir> [stageId ...] [--w 960] [--h 540] [--quality low|medium|high] [--positions 0.03,0.4,0.75]
//                         [--weather rain] [--camera chase|far|bumper|bonnet] [--car huia] [--livery 0] [--hud 0|1] [--speed 90]
// Prints one JSON line per shot with the renderer stats, then exits non-zero if the page logged errors.

import { resolve } from "node:path";
import { openGame } from "./harness.mjs";

const STAGES = ["waitomo", "whakarewarewa", "coromandel", "otago", "remarkables", "fiordland"];
const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
  else pos.push(argv[i]);
}
const outDir = pos.shift();
if (!outDir) {
  console.error("usage: node tests/shoot.mjs <outDir> [stageId ...] [--w 960 --h 540 --quality low --positions 0.03,0.4,0.75 --weather rain --camera chase --car huia]");
  process.exit(2);
}
const stages = pos.length ? pos : STAGES;
for (const s of stages) if (!STAGES.includes(s)) { console.error("unknown stage " + s); process.exit(2); }
const W = +(flags.w || 960), H = +(flags.h || 540);
const quality = flags.quality || "low";
const positions = (flags.positions || "0.03,0.4,0.75").split(",").map(Number);
const speed = +(flags.speed || 90);

let failed = 0;
for (const stageId of stages) {
  const q = [`nomenu=1`, `stage=${stageId}`, `quality=${quality}`, `mute=1`, flags.car && `car=${flags.car}`, flags.livery && `livery=${flags.livery}`, flags.weather && `weather=${flags.weather}`, flags.camera && `camera=${flags.camera}`, flags.hud === "0" && "hud=0"].filter(Boolean).join("&");
  const g = await openGame({ width: W, height: H, query: q, mobile: W < 600 });
  try {
    await g.waitForReady(180000);
    await g.evalAsync("window.__AR__.hideOverlays()");
    if (flags.camera) {
      // use the game's own API so the requested view is really active (not the silent chase fallback)
      const got = await g.evalAsync(`window.__AR__.setCamera(${JSON.stringify(flags.camera)})`);
      if (got !== flags.camera) throw new Error(`camera "${flags.camera}" not applied (rig reports ${got}); valid: chase, far, bumper, bonnet`);
    }
    const len = await g.evalAsync("window.__AR__.state().stageId && window.__AR__.perf() && 1");
    void len;
    for (let i = 0; i < positions.length; i++) {
      const frac = positions[i];
      const st = await g.evalAsync(`(() => { const S = window.__AR__._G.stage; window.__AR__.teleport(${frac} * S.lengthM, 0, ${speed}); window.__AR__.stepSim(36); window.__AR__.renderNow(); return window.__AR__.state(); })()`);
      await g.sleep(150);
      const file = resolve(outDir, `${stageId}-${W}x${H}-${quality}-p${String(i + 1)}.png`);
      await g.screenshot(file);
      const perf = await g.evalAsync("window.__AR__.perf()");
      if (flags.camera) { const m = await g.evalAsync("window.__AR__.state().camera"); if (m !== flags.camera) throw new Error(`camera drifted to ${m}`); }
      console.log(JSON.stringify({ stage: stageId, file, s: Math.round(st.s), speedKmh: Math.round(st.speedKmh), drawCalls: perf && perf.drawCalls, triangles: perf && perf.triangles }));
    }
    const errs = [...g.consoleErrors(), ...(await g.evalAsync("window.__AR__.errors"))];
    if (errs.length) { failed++; console.error(`${stageId}: ${errs.length} error(s)`, errs.slice(0, 5)); }
  } finally {
    await g.close();
  }
}
process.exit(failed ? 1 : 0);
