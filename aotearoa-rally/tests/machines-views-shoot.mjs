// In-game first-person view shots through the real harness: bumper, bonnet and cockpit on one or more stages.
// "cockpit" is not a player camera mode (only a cinematic cabin shot), so it is posed here: bonnet rig + the cockpit eye point.
//   node tests/machines-views-shoot.mjs <outDir> [stageId ...] [--weather rain] [--quality high] [--car huia] [--pos 0.4]
import { resolve } from "node:path";
import { openGame } from "./harness.mjs";

const argv = process.argv.slice(2), flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i]; else pos.push(argv[i]); }
const outDir = pos.shift();
if (!outDir) { console.error("usage: node tests/machines-views-shoot.mjs <outDir> [stageId ...]"); process.exit(2); }
const stages = pos.length ? pos : ["waitomo", "fiordland"];
const W = 1280, H = 720, frac = +(flags.pos || 0.4);
let failed = 0;
for (const stageId of stages) {
  const q = ["nomenu=1", `stage=${stageId}`, `quality=${flags.quality || "high"}`, "mute=1", flags.car && `car=${flags.car}`, flags.weather && `weather=${flags.weather}`, "hud=0"].filter(Boolean).join("&");
  const g = await openGame({ width: W, height: H, query: q });
  try {
    await g.waitForReady(180000);
    await g.evalAsync("window.__AR__.hideOverlays()");
    for (const view of ["bumper", "bonnet", "cockpit"]) {
      const mode = view === "cockpit" ? "bonnet" : view;
      const got = await g.evalAsync(`window.__AR__.setCamera(${JSON.stringify(mode)})`);
      if (got !== mode) throw new Error(`camera ${mode} not applied (${got})`);
      await g.evalAsync(`(async () => { const A = window.__AR__, G = A._G, S = G.stage; A.teleport(${frac} * S.lengthM, 0, 80); A.stepSim(36); A.renderNow();
        const cv = G.carVis, cam = G.world.camera;
        if (${view === "cockpit"}) {
          const { eyePoints } = await import("./render/cars/" + "profiles.mjs");
          const e = eyePoints(G.mods.cars.CARS ? G.mods.cars.CARS[G.carId] : G.vehicle.spec);
          cam.translateX(e.cockpit[0] - e.bonnet[0]); cam.translateY(e.cockpit[1] - e.bonnet[1]); cam.translateZ(e.cockpit[2] - e.bonnet[2]);
          cv.setViewMode("cockpit");
          G.world.render();
        }
        return true; })()`);
      await g.sleep(200);
      await g.screenshot(resolve(outDir, `${stageId}-${view}${flags.weather ? "-" + flags.weather : ""}.png`));
      console.log(JSON.stringify({ stage: stageId, view, camera: await g.evalAsync("window.__AR__.state().camera") }));
    }
    const errs = [...g.consoleErrors(), ...(await g.evalAsync("window.__AR__.errors"))];
    if (errs.length) { failed++; console.error(`${stageId}: ${errs.length} error(s)`, errs.slice(0, 5)); }
  } finally { await g.close(); }
}
process.exit(failed ? 1 : 0);
