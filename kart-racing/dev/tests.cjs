// node dev/tests.cjs [trackId...]  (server on :8000 from repo root)
const { chromium } = require("playwright");
(async () => {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["sunset-coast", "frostbite-pass", "neon-docks"];
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  let fail = 0;
  for (const id of ids) {
    const p = await b.newPage({ viewport: { width: 800, height: 500 } });
    p.on("pageerror", e => console.log("[pageerror]", e.message));
    await p.goto(`http://localhost:8000/kart-racing/dev/view.html?track=${id}&w=800&h=500`);
    await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    const res = await p.evaluate(() => H.runChecks());
    console.log(`\n== ${id} (build ${await p.evaluate(() => H.buildMs.toFixed(0))} ms)`);
    for (const r of res) { console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.info ? "  [" + r.info + "]" : ""}`); if (!r.ok) fail++; }
    await p.close();
  }
  await b.close(); console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED"); process.exit(fail ? 1 : 0);
})();
