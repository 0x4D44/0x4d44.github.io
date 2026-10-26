const { chromium } = require("playwright");
(async () => {
  const ids = process.argv[2] ? [process.argv[2]] : ["sunset-coast", "frostbite-pass", "neon-docks"];
  const laps = +(process.argv[3] || 2), diff = process.argv[4] || "normal";
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  for (const id of ids) {
    const p = await b.newPage({ viewport: { width: 600, height: 400 } });
    p.on("pageerror", e => console.log("[pageerror]", e.message));
    p.on("console", m => { if (m.type() === "error") console.log("[console.error]", m.text()); });
    await p.goto("http://localhost:8000/kart-racing/trackdev/ai-test.html");
    await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    const t0 = Date.now();
    const rep = await p.evaluate(({ id, laps, diff }) => { __t.setup({ trackId: id, laps, difficulty: diff, seed: 3 }); return __t.runUntilDone(400); }, { id, laps, diff });
    console.log(`\n== ${id} ${diff} laps=${laps} simT=${rep.t}s wall=${((Date.now() - t0) / 1000).toFixed(0)}s`);
    for (const k of rep.karts) console.log(`${k.n.padEnd(7)} fin=${k.fin} ft=${k.ft} lap=${k.lap} best=${k.best} resp=${k.resp} slowT=${k.slowT} wall=${k.wall} grass=${k.grass} rev=${k.rev} place=${k.place}`);
    await p.close();
  }
  await b.close();
})();
