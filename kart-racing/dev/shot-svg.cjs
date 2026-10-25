const { chromium } = require("playwright");
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
await p.goto("file://" + __dirname + "/outlines.html"); await p.screenshot({ path: process.argv[2] || "/tmp/claude-0/-home-user/df84d1e2-6362-5e66-83b6-14da7b628379/scratchpad/outlines.png", fullPage: true }); await b.close(); })();
