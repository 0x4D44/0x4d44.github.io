// DYNAMICS round 3: in-browser bot lap vs PAR_TIMES (headless Chrome via the shared harness; ONE browser, BelowNormal).
//   node --import file:///<repo>/aotearoa-rally/tests/lowprio.mjs tests/dynamics-browserlap.mjs [stage,stage,...] [car]
// Exit code 1 when any lap differs from PAR_TIMES by more than 1%. The pure-node twin is tests/dynamics-gamelap.mjs.
import { openGame } from "./harness.mjs";
import { PAR_TIMES } from "../core/partimes.mjs";

const stages = (process.argv[2] || "waitomo,whakarewarewa,fiordland").split(",");
const car = process.argv[3] || "huia";
const g = await openGame({ width: 960, height: 540, query: "nomenu=1&quality=low&mute=1" });
let bad = 0;
try {
  await g.waitForReady(120000);
  for (const sid of stages) {
    if (!process.env.LIVE) await g.evalAsync(`__AR__.startStage({ stageId: ${JSON.stringify(sid)}, carId: ${JSON.stringify(car)}, quality: "low", fresh: true })`);
    let r;
    if (process.env.LIVE) {
      // the real frame loop: bot on, countdown skipped, wait on the wall clock until the stage ends
      await g.evalAsync(`__AR__.startStage({ stageId: ${JSON.stringify(sid)}, carId: ${JSON.stringify(car)}, quality: 'low', fresh: true, bot: true })`);
      const t0 = Date.now();
      for (;;) {
        await g.sleep(5000);
        r = await g.evalAsync(`(() => { const s = __AR__.state(); return { time: s.time, status: s.status, finish: s.finishTime, fps: __AR__.perf().fps }; })()`);
        if (r.status === "finished" || r.status === "dnf" || Date.now() - t0 > 20 * 60000) break;
      }
    } else {
      r = await g.evalAsync(`(() => { const s = __AR__.finishRun(1200); return { time: s.time, status: s.status, finish: s.finishTime, pen: s.penalty }; })()`);
    }
    const t = r.finish != null ? r.finish : r.time;
    const par = PAR_TIMES[sid][car];
    const pct = (t / par - 1) * 100;
    if (Math.abs(pct) > 1) bad++;
    console.log(`${sid.padEnd(14)} ${car}: browser bot ${Number(t).toFixed(1)} s (${r.status}) vs PAR_TIMES ${par.toFixed(1)} s  ${pct.toFixed(2)}%  ${JSON.stringify(r)}`);
  }
} finally {
  await g.close();
}
process.exit(bad ? 1 : 0);
