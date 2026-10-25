// node dev/shots.cjs <trackId> <outPrefix> [viewsJSON]  — expects http.server on :8000 from the repo root
const { chromium } = require("playwright");
const SC = "/tmp/claude-0/-home-user/df84d1e2-6362-5e66-83b6-14da7b628379/scratchpad";
(async () => {
  const id = process.argv[2], prefix = process.argv[3] || id;
  const views = JSON.parse(process.argv[4] || '[{"mode":"top"}]');
  const w = +(process.env.W || 1100), h = +(process.env.HH || 700);
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("console", m => { if (m.type() === "error" || m.type() === "warning") console.log("[console]", m.type(), m.text()); });
  p.on("pageerror", e => console.log("[pageerror]", e.message));
  await p.goto(`http://localhost:8000/kart-racing/dev/view.html?track=${id}&w=${w}&h=${h}`);
  await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  for (let i = 0; i < views.length; i++) {
    await p.evaluate(v => { H.view(v); }, views[i]);
    await p.screenshot({ path: `${SC}/${prefix}-${i}.png` });
  }
  console.log("errors:", JSON.stringify(await p.evaluate(() => H.errors)));
  console.log("calls", await p.evaluate(() => H.renderer.info.render.calls + " tris " + H.renderer.info.render.triangles));
  await b.close();
})();
