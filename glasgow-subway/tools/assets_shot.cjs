// Usage: node tools/assets_shot.js out.png "f=train.glb&cam=..." [w h]   (needs a static server at :8765 serving repo root)
const { chromium } = require('/opt/node-tools/node_modules/playwright');
(async () => {
  const [out, qs, w = '1000', h = '640'] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('http://127.0.0.1:8765/tools/assets_preview.html?' + qs);
  await p.waitForFunction('window.__ready', null, { timeout: 60000 });
  await p.waitForTimeout(300);
  const err = await p.evaluate('window.__err');
  if (err) console.log('LOAD ERR', err);
  if (errs.length) console.log('CONSOLE', errs.slice(0, 5));
  if (process.env.INFO) console.log(JSON.stringify(await p.evaluate('window.__info')));
  await p.screenshot({ path: out });
  await b.close();
})();
