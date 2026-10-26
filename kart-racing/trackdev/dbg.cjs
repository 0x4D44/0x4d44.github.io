const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  p.on("pageerror", e => console.log("[pageerror]", e.message));
  await p.goto(`http://localhost:8000/kart-racing/trackdev/view.html?track=${process.argv[2]}&w=400&h=300`);
  await p.waitForFunction(() => window.__ready);
  console.log(await p.evaluate(process.argv[3]));
  await b.close();
})();
