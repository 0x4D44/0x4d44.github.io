// Per-frame cost of audio.update over N seconds of bot-driven play (p50/p95/p99/max, ms), through the real page. Headless Chrome is launched
// with --mute-audio and the master gain is 0, so nothing is audible.
//   node tests/machines-audio-cost.mjs [stageId] [seconds=60] [car=huia]
import { openGame } from "./harness.mjs";

const [stageId = "waitomo", secs = "60", car = "huia"] = process.argv.slice(2);
const g = await openGame({ width: 640, height: 360, query: ["nomenu=1", `stage=${stageId}`, "quality=low", `car=${car}`, "hud=0"].join("&") });
let code = 0;
try {
  await g.waitForReady(180000);
  const res = await g.evalAsync(`(async () => {
    const A = window.__AR__, G = A._G;
    if (!G.audio) G.audio = G.mods.audio.createAudio({ master: 0, engine: 1, effects: 1, voice: 1, ambience: 1 });
    G.audio.resume && G.audio.resume();
    G.audio.setStage(G.stage.def || G.stageDef); G.audio.setCarSpec(G.carVis.spec);
    A.setBot(true); A.teleport(40, 0, 0);
    const n = Math.round(${+secs} * 60), ms = new Float64Array(n), o = { cameraMode: "chase", paused: false };
    let w = 0;
    for (let i = 0; i < n; i++) {
      A.stepSim(1);
      const t0 = performance.now();
      G.audio.update(1 / 60, G.vehicle.state, G.stage, o);
      ms[i] = performance.now() - t0;
      if (G.vehicle.state.s > G.stage.lengthM - 60) A.teleport(40, 0, 80);
      if ((i & 255) === 255) await new Promise((r) => setTimeout(r, 0));
    }
    const a = Array.from(ms).sort((x, y) => x - y), q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
    return { frames: n, p50: q(0.5), p95: q(0.95), p99: q(0.99), p999: q(0.999), max: a[a.length - 1], over4: a.filter((x) => x > 4).length, ctx: G.audio.state || null, writes: G.audio.paramWrites, endS: G.vehicle.state.s };
  })()`);
  console.log(JSON.stringify(res));
  const errs = [...g.consoleErrors(), ...(await g.evalAsync("window.__AR__.errors"))];
  if (errs.length) { console.error(errs.slice(0, 5)); code = 1; }
} finally { await g.close(); }
process.exit(code);
