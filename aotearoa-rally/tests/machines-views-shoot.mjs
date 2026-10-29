// In-game first-person view shots through the real harness: bumper, bonnet and cockpit on one or more stages.
//   node tests/machines-views-shoot.mjs <outDir> [stageId ...] [--weather rain] [--quality high] [--car huia] [--pos 0.4] [--w 1920 --h 1080]
import { resolve } from "node:path";
import { openGame } from "./harness.mjs";

const argv = process.argv.slice(2), flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i]; else pos.push(argv[i]); }
const outDir = pos.shift();
if (!outDir) { console.error("usage: node tests/machines-views-shoot.mjs <outDir> [stageId ...]"); process.exit(2); }
const stages = pos.length ? pos : ["waitomo", "fiordland"];
const W = +(flags.w || 1280), H = +(flags.h || 720), frac = +(flags.pos || 0.4);
let failed = 0;
for (const stageId of stages) {
  const q = ["nomenu=1", `stage=${stageId}`, `quality=${flags.quality || "high"}`, "mute=1", flags.car && `car=${flags.car}`, flags.weather && `weather=${flags.weather}`, "hud=0"].filter(Boolean).join("&");
  const g = await openGame({ width: W, height: H, query: q });
  try {
    await g.waitForReady(180000);
    await g.evalAsync("window.__AR__.hideOverlays()");
    for (const view of ["bumper", "bonnet", "cockpit"]) {
      const got = await g.evalAsync(`window.__AR__.setCamera(${JSON.stringify(view)})`);
      if (got !== view) throw new Error(`camera ${view} not applied (${got})`);
      await g.evalAsync(`(() => { const A = window.__AR__, S = A._G.stage; A.teleport(${frac} * S.lengthM, 0, ${flags.speed || 80}); A.stepSim(${flags.steps || 36}); A.renderNow(); return true; })()`);
      await g.sleep(200);
      await g.screenshot(resolve(outDir, `${stageId}${flags.car ? "-" + flags.car : ""}-${view}${flags.weather ? "-" + flags.weather : ""}.png`));
      console.log(JSON.stringify({ stage: stageId, view, camera: await g.evalAsync("window.__AR__.state().camera") }));
    }
    const errs = [...g.consoleErrors(), ...(await g.evalAsync("window.__AR__.errors"))];
    if (errs.length) { failed++; console.error(`${stageId}: ${errs.length} error(s)`, errs.slice(0, 5)); }
  } finally { await g.close(); }
}
process.exit(failed ? 1 : 0);
