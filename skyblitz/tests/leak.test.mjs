// E-06, in a real browser: consecutive races in ONE page must not grow GPU buffers, three.js textures or the JS heap.
// For each course the same one-lap race (same seed, autopilot) is run RACES times through the real lifecycle (start -> race -> finish -> game.disposeRace()).
// WebGL objects are counted at the API (createBuffer / deleteBuffer ... wrapped before any page script runs); the heap is read after two forced GCs.
// Compared: the state after race 2 vs after the last race (race 1 fills the one-time caches: shader programs, craft liveries, asset images).
// Before the fix (reviewer probe `leak`, redrock x4): GL buffers 713 -> 781 -> 895 -> 955, three.js textures 57 -> 65 -> 68 -> 71, heap 11.1 -> 13.3 MB.
// Causes: InstancedMesh.dispose() was never called (instanceMatrix / instanceColor buffers, +65 per race on redrock) and a water shore mask that
// UniformsUtils.merge() had cloned was never freed (one texture per race, neon ground mask likewise).
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/leak.test.mjs      (own static server + headless Chrome, ~3-4 min for 4 courses)
// Env: LEAK_COURSES=redrock,sunrise,neon,frost to pick courses; LEAK_RACES=5 (>= 4); SKY_URL / SKY_ROOT as in render-det.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from './tools/chrome.mjs';
import { startStaticServer } from './tools/static-server.mjs';

let BASE = process.env.SKY_URL || '';
const COURSES = (process.env.LEAK_COURSES || 'redrock,sunrise,neon,frost').split(',');
const RACES = Math.max(4, Number(process.env.LEAK_RACES || 5));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// live WebGL object counters (create* minus delete*), installed before any page script runs
const GLCOUNT = `(()=>{const c={buffers:0,bufMB:0,textures:0,programs:0,framebuffers:0,renderbuffers:0,vaos:0};window.__glc=c;const sizes=new WeakMap(),bound=new Map();let bytes=0;
  for(const P of [WebGL2RenderingContext.prototype]){const w=(cr,del,k)=>{const oc=P[cr],od=P[del];P[cr]=function(...a){const o=oc.apply(this,a);if(o)c[k]++;return o};P[del]=function(o){if(o){c[k]--;if(k==='buffers'){bytes-=sizes.get(o)||0;sizes.delete(o);c.bufMB=+(bytes/1048576).toFixed(2);}}return od.call(this,o)}};
  w('createBuffer','deleteBuffer','buffers');w('createTexture','deleteTexture','textures');w('createProgram','deleteProgram','programs');w('createFramebuffer','deleteFramebuffer','framebuffers');w('createRenderbuffer','deleteRenderbuffer','renderbuffers');w('createVertexArray','deleteVertexArray','vaos');
  const ob=P.bindBuffer,obd=P.bufferData;P.bindBuffer=function(t,b){bound.set(t,b);return ob.call(this,t,b)};
  P.bufferData=function(t,d,...r){const b=bound.get(t);if(b){const sz=typeof d==='number'?d:(d&&d.byteLength)||0;bytes+=sz-(sizes.get(b)||0);sizes.set(b,sz);c.bufMB=+(bytes/1048576).toFixed(2);}return obd.call(this,t,d,...r)};}})()`;
const SNAP = `(()=>{const g=__sky.game,i=g.renderer.info;return {gl:{...window.__glc},geometries:i.memory.geometries,textures:i.memory.textures,programs:(i.programs||[]).length,errors:__sky.errors.length}})()`;

let chrome, srv, page;
test.before(async () => {
  if (!BASE) { srv = await startStaticServer({ root: process.env.SKY_ROOT || undefined }); BASE = `${srv.url}/skyblitz`; }
  chrome = await launchChrome({ width: 960, height: 540 });
  page = await chrome.newPage();
  await page.s('Page.addScriptToEvaluateOnNewDocument', { source: GLCOUNT });
});
test.after(async () => { await chrome?.close(); await srv?.close(); });

const J = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));
async function heapMB() {
  try { await page.s('HeapProfiler.enable'); } catch { /* already on */ }
  for (let k = 0; k < 2; k++) { await page.s('HeapProfiler.collectGarbage'); await delay(150); }
  return +((await page.s('Runtime.getHeapUsage')).usedSize / 1048576).toFixed(2);
}
async function runToDone() {
  for (let n = 0; n < 60 * 400; n += 240) {
    const done = await page.eval(`(()=>{const g=__sky.game;for(let i=0;i<240;i++){if(g.race.state==='done')return true;g.fixedUpdate();if(i%6===0)g.renderFrame(1,1/60);}return g.race.state==='done'})()`);
    if (done) return;
  }
  throw new Error('race did not finish');
}

for (const course of COURSES) {
  test(`${course}: ${RACES} consecutive races leave GL buffers, textures and heap flat`, { timeout: 1200000 }, async (t) => {
    await page.goto(`${BASE}/?` + new URLSearchParams({ manual: 1, mute: 1, debug: 1, quality: 'low' }), { timeout: 90000 });
    await page.waitFor('window.__sky && __sky.ready && __sky.game.state==="title"', { timeout: 120000 });
    await page.eval('__sky.step(120, 6)');
    const running = [], disposed = [];
    for (let i = 1; i <= RACES; i++) {
      await page.eval(`(__sky.start({courseId:${JSON.stringify(course)}, laps:1, bots:7, autopilot:true, seed:11, mode:'quick'}), 1)`);
      await page.waitFor('__sky.game.state==="race" && __sky.game.race && __sky.game.race.state!=="grid"', { timeout: 120000 });
      await page.eval('__sky.step(400, 6)');
      running.push({ ...(await J(SNAP)), heap: await heapMB() });
      await runToDone();
      await page.eval('__sky.step(60, 6)');
      await page.eval('__sky.game.disposeRace()');                                   // what quit() / the next start() do first
      await page.eval('__sky.game.renderer.render(__sky.game.scene, __sky.game.camera)');   // three.js frees on the next frame
      disposed.push({ ...(await J(SNAP)), heap: await heapMB() });
    }
    const row = (s) => `buf ${s.gl.buffers} (${s.gl.bufMB} MB) tex ${s.gl.textures}/${s.textures} geo ${s.geometries} prog ${s.programs} heap ${s.heap}`;
    t.diagnostic(`${course} running : ${running.map(row).join('  |  ')}`);
    t.diagnostic(`${course} disposed: ${disposed.map(row).join('  |  ')}`);
    const a = RACES >= 4 ? 1 : 0, b = RACES - 1;                                       // race 2 vs the last race (indices)
    for (const [label, S] of [['while racing', running], ['after dispose', disposed]]) {
      const p = S[a], q = S[b];
      assert.ok(Math.abs(q.gl.buffers - p.gl.buffers) <= 2, `${label}: GL buffers ${p.gl.buffers} (race 2) -> ${q.gl.buffers} (race ${RACES})`);
      assert.ok(Math.abs(q.gl.bufMB - p.gl.bufMB) <= 0.1, `${label}: GL buffer MB ${p.gl.bufMB} -> ${q.gl.bufMB}`);
      assert.ok(q.gl.textures <= p.gl.textures, `${label}: GL textures ${p.gl.textures} -> ${q.gl.textures}`);
      assert.ok(q.textures <= p.textures, `${label}: three.js textures ${p.textures} -> ${q.textures}`);
      assert.ok(Math.abs(q.geometries - p.geometries) <= 2, `${label}: geometries ${p.geometries} -> ${q.geometries}`);
      assert.ok(Math.abs(q.programs - p.programs) <= 2, `${label}: shader programs ${p.programs} -> ${q.programs}`);
      assert.ok(q.gl.framebuffers <= p.gl.framebuffers && q.gl.renderbuffers <= p.gl.renderbuffers, `${label}: framebuffers / renderbuffers grew`);
    }
    const perRace = (disposed[b].heap - disposed[a].heap) / (b - a);
    assert.ok(perRace < 0.2, `heap after GC grows ${perRace.toFixed(2)} MB per race (${disposed[a].heap} -> ${disposed[b].heap} MB)`);
    assert.equal(disposed[b].errors, 0, '__sky.errors stays empty');
  });
}
