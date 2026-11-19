// node tools/people_pause_slide.mjs <query> <secs>: walkers that pause (walk/go with v < 0.08 or paused): how far each foot bone travels along the floor while it is ON the floor - within
// 12 mm of that foot's lowest height over the WHOLE episode (worked out after it ends; a running minimum counts a foot that is still in the air at the start as sliding)
import { createRequire } from 'module'; const require = createRequire('/opt/node22/lib/node_modules/'); const { chromium } = require('playwright');
const [query, secs = '120'] = process.argv.slice(2), dt = 0.05;
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }); const p = await (await b.newContext({ viewport: { width: 200, height: 200 } })).newPage();
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto('http://127.0.0.1:8611/glasgow-subway/tools/test_sim.html?pr=1&aa=0&' + query); await p.waitForFunction(() => window.__sim && __sim.mode(), null, { timeout: 110000 });
const r = await p.evaluate(async ({ secs, dt }) => { __sim.loop(false); __sim.render(); await Promise.race([__sim.sim.peopleFull, new Promise((r) => setTimeout(r, 90000))]); const s = __sim.sim; const V = s.camera.position.constructor; const c = s.crowd;
  const st = new Map(), out = [];
  const close = (e) => { if (e.fr.length * dt < 0.5) return; const res = [0, 1].map((k) => { const ys = e.fr.map((f) => f[k] && f[k][1]).filter((y) => y != null), my = Math.min(...ys); let sl = 0, all = 0; for (let i = 1; i < e.fr.length; i++) { const a = e.fr[i - 1][k], b2 = e.fr[i][k]; if (!a || !b2) continue; const h = Math.hypot(b2[0] - a[0], b2[2] - a[2]); all += h; if (a[1] < my + 0.012 && b2[1] < my + 0.012) sl += h; } return [sl, all]; });
    out.push({ id: e.id, dur: +(e.fr.length * dt).toFixed(2), dist: e.dist, slide: res.map((x) => +x[0].toFixed(3)), travel: res.map((x) => +x[1].toFixed(3)) }); };
  for (let i = 0; i < secs / dt; i++) { if (i % 10 === 0) await new Promise((r) => setTimeout(r, 10)); s.tick(dt); s.sync(dt); s.scene.updateMatrixWorld(true);
    const cam = s.camera.getWorldPosition(new V());
    for (const q of c.people) { if (!q.obj || q.static || q.hidden || !q.obj.visible) continue; const w = q.state === 'walk' || q.state === 'go'; let e = st.get(q);
      const slow = w && ((q.v || 0) < 0.08 || q.paused);
      if (!slow) { if (e) { close(e); st.delete(q); } continue; }
      const bp = ['foot_l', 'foot_r'].map((n) => { const bn = q.obj.getObjectByName(n); if (!bn) return null; const v = bn.getWorldPosition(new V()); return [v.x, v.y, v.z]; });
      if (!e) { e = { id: q.char.id, fr: [], dist: +q.obj.getWorldPosition(new V()).distanceTo(cam).toFixed(1) }; st.set(q, e); }
      e.fr.push(bp);
    } }
  for (const e of st.values()) close(e);
  return out;
}, { secs: +secs, dt });
r.sort((a, b) => Math.max(...b.slide) - Math.max(...a.slide)); for (const e of r.slice(0, 10)) console.log(JSON.stringify(e));
console.log('episodes', r.length, 'slide>0.10', r.filter((e) => Math.max(...e.slide) > 0.1).length, 'slide>0.05', r.filter((e) => Math.max(...e.slide) > 0.05).length);
await b.close();
