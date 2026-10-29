// In-game chase shots through the real harness: one stage, a list of cars, car parked (0 km/h) so the camera is at its slowest.
//   node tests/machines-chase-shoot.mjs <outDir> <stageId> <car,car,...> [--pos 0.3]
import { resolve } from "node:path";
import { openGame } from "./harness.mjs";

const argv = process.argv.slice(2), flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i]; else pos.push(argv[i]); }
const [outDir, stageId = "remarkables", cars = "huia"] = pos;
if (!outDir) { console.error("usage: node tests/machines-chase-shoot.mjs <outDir> <stageId> <car,car>"); process.exit(2); }
const frac = +(flags.pos || 0.3);
for (const car of cars.split(",")) {
  const g = await openGame({ width: +(flags.w || 1280), height: +(flags.h || 720), query: ["nomenu=1", `stage=${stageId}`, "quality=high", "mute=1", `car=${car}`, "hud=0"].join("&") });
  try {
    await g.waitForReady(180000);
    await g.evalAsync("window.__AR__.hideOverlays()");
    await g.evalAsync("window.__AR__.setCamera('chase')");
    await g.evalAsync(`(() => { const A = window.__AR__, S = A._G.stage; A.teleport(${frac} * S.lengthM, 0, 0); A.stepSim(30); A.renderNow(); return true; })()`);
    await g.sleep(250);
    await g.screenshot(resolve(outDir, `chase-${stageId}-${car}-${flags.w || 1280}x${flags.h || 720}.png`));
    console.log(car, "ok");
  } finally { await g.close(); }
}
process.exit(0);
