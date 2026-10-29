// V-23: the quality presets must really change the amount of geometry. The reviewer measured (renderer.info triangles, fresh page per preset) Low at 91-96 % of High on
// sunrise / redrock / neon / frost: the terrain mesh, the wayfinding rings and neon's facade draw ignored the preset. Now the scenery multiplier (Low 0.45, Med 0.7,
// High 1) drives the terrain cell size, the ring tessellation and, on neon, the facade culling.
// For every course and preset: load a FRESH page (?quality=...), fly to a fixed point of the lap and count the triangles of one rendered frame (shadow pass included,
// as `renderer.info` does), plus two exact structural counts: the rings of the wayfinding group and the terrain meshes.
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/scenery-lod.test.mjs      (own static server + headless Chrome, ~6 min for 4 courses x 3 presets)
// Env: LOD_COURSES=sunrise,redrock,neon,frost to pick courses; SKY_URL / SKY_ROOT as in render-det.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from './tools/chrome.mjs';
import { startStaticServer } from './tools/static-server.mjs';

let BASE = process.env.SKY_URL || '';
const COURSES = (process.env.LOD_COURSES || 'sunrise,redrock,neon,frost').split(',');
const PRESETS = ['low', 'med', 'high'];
const POSES = [0.12, 0.4, 0.7];                       // fractions of the lap (plus the grid camera before the race starts)

let chrome, srv, page;
test.before(async () => {
  if (!BASE) { srv = await startStaticServer({ root: process.env.SKY_ROOT || undefined }); BASE = `${srv.url}/skyblitz`; }
  chrome = await launchChrome({ width: 960, height: 540 });
  page = await chrome.newPage();
});
test.after(async () => { await chrome?.close(); await srv?.close(); });

const J = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));
const TRIS = `(()=>{ const g=__sky.game, i=g.renderer.info, a=i.autoReset; i.autoReset=false; i.reset(); g.renderFrame(1,0); const n=i.render.triangles; i.autoReset=a; return n; })()`;
const MEASURE = (grid) => `(()=>{ const g=__sky.game, i=g.renderer.info, out=[${grid}];
  for (const f of ${JSON.stringify(POSES)}) {
    __sky.teleport(g.course.length*f, 0, 0, 95); for (let k=0;k<24;k++) { g.fixedUpdate(); if (k%4===3) g.renderFrame(1,4/60); }
    const a=i.autoReset; i.autoReset=false; i.reset(); g.renderFrame(1,0); out.push(i.render.triangles); i.autoReset=a;
  }
  let rings=0, terrain=0, instanced=0;
  g.course.group.traverse((o)=>{
    if (o.isInstancedMesh) { instanced += o.count; if (o.geometry.type==='TorusGeometry') rings += o.count * o.geometry.index.count / 3; }
    else if (o.isMesh && o.parent && o.parent.name==='terrain' && o.geometry.index) terrain += o.geometry.index.count / 3;
  });
  return { tris: out, avg: Math.round(out.reduce((s,x)=>s+x,0)/out.length), rings, terrain, instanced, quality: g.qualityId, errors: __sky.errors.length };
})()`;

for (const course of COURSES) {
  test(`${course}: Low <= 60 % of High triangles, Med in between, rings and terrain follow the preset`, { timeout: 900000 }, async (t) => {
    const m = {};
    for (const preset of PRESETS) {
      await page.goto(`${BASE}/?` + new URLSearchParams({ manual: 1, autostart: 1, mute: 1, autopilot: 1, course, seed: 7, laps: 1, bots: 7, craft: 'falcon', diff: 'normal', quality: preset }), { timeout: 90000 });
      await page.waitFor('window.__sky && __sky.ready && __sky.game.state==="race" && !!__sky.game.race && !!__sky.game.player', { timeout: 120000 });
      await page.eval('__sky.ui(false)');
      const grid = await J(TRIS);                       // the grid camera, as the page loads
      await page.eval('__sky.step(300, 10)');
      m[preset] = await J(MEASURE(grid));
      assert.equal(m[preset].quality, preset, 'the page honours ?quality=');
      assert.equal(m[preset].errors, 0, '__sky.errors stays empty');
    }
    const pct = (k) => `${Math.round(100 * m[k].avg / m.high.avg)} %`;
    t.diagnostic(`${course} triangles avg low ${m.low.avg} (${pct('low')}) / med ${m.med.avg} (${pct('med')}) / high ${m.high.avg}; rings ${m.low.rings}/${m.med.rings}/${m.high.rings}; terrain ${m.low.terrain}/${m.med.terrain}/${m.high.terrain}; instances ${m.low.instanced}/${m.med.instanced}/${m.high.instanced}`);
    assert.ok(m.low.avg <= 0.6 * m.high.avg, `Low draws ${pct('low')} of High (${m.low.avg} vs ${m.high.avg} triangles): the presets must differ by at least 40 %`);
    assert.ok(m.low.avg < m.med.avg && m.med.avg < m.high.avg, `Med must sit between Low and High: ${m.low.avg} < ${m.med.avg} < ${m.high.avg}`);
    assert.ok(m.low.rings < m.med.rings && m.med.rings < m.high.rings, `ring triangles follow the preset: ${m.low.rings} < ${m.med.rings} < ${m.high.rings}`);
    if (course !== 'neon') assert.ok(m.low.terrain < m.med.terrain && m.med.terrain < m.high.terrain, `terrain triangles follow the preset: ${m.low.terrain} < ${m.med.terrain} < ${m.high.terrain}`);
  });
}
