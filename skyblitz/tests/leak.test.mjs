// E-06, in a real browser: consecutive races in ONE page must not grow GPU buffers, three.js textures or the JS heap.
// For each course the same one-lap race (same seed, autopilot) is run RACES times through the real lifecycle (start -> race -> finish -> game.disposeRace()).
// WebGL objects are counted at the API (createBuffer / deleteBuffer ... wrapped before any page script runs); the heap and the live three.js objects (Object3D,
// BufferGeometry, Material, Texture, BufferAttribute: Runtime.queryObjects) are read after two forced GCs.
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
const RACES = Math.max(4, Number(process.env.LEAK_RACES || 7));          // 7: six deltas after the warm-up race for the median
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// live WebGL object counters (create* minus delete*), installed before any page script runs
const GLCOUNT = `(()=>{const c={buffers:0,bufMB:0,textures:0,programs:0,framebuffers:0,renderbuffers:0,vaos:0};window.__glc=c;const sizes=new WeakMap(),bound=new Map();let bytes=0;
  for(const P of [WebGL2RenderingContext.prototype]){const w=(cr,del,k)=>{const oc=P[cr],od=P[del];P[cr]=function(...a){const o=oc.apply(this,a);if(o)c[k]++;return o};P[del]=function(o){if(o){c[k]--;if(k==='buffers'){bytes-=sizes.get(o)||0;sizes.delete(o);c.bufMB=+(bytes/1048576).toFixed(2);}}return od.call(this,o)}};
  w('createBuffer','deleteBuffer','buffers');w('createTexture','deleteTexture','textures');w('createProgram','deleteProgram','programs');w('createFramebuffer','deleteFramebuffer','framebuffers');w('createRenderbuffer','deleteRenderbuffer','renderbuffers');w('createVertexArray','deleteVertexArray','vaos');
  const ob=P.bindBuffer,obd=P.bufferData;P.bindBuffer=function(t,b){bound.set(t,b);return ob.call(this,t,b)};
  P.bufferData=function(t,d,...r){const b=bound.get(t);if(b){const sz=typeof d==='number'?d:(d&&d.byteLength)||0;bytes+=sz-(sizes.get(b)||0);sizes.set(b,sz);c.bufMB=+(bytes/1048576).toFixed(2);}return obd.call(this,t,d,...r)};}})()`;
const SNAP = `(()=>{const g=__sky.game,i=g.renderer.info;return {gl:{...window.__glc},geometries:i.memory.geometries,textures:i.memory.textures,programs:(i.programs||[]).length,errors:__sky.errors.length}})()`;
// JS objects that are alive after the forced GCs, by three.js class (Runtime.queryObjects walks the prototype chain, so Object3D covers every mesh / group / light).
// A course that is not let go leaves whole scene graphs behind, which no GL counter sees.
const CLASSES = { object3d: 'Object3D', geometry: 'BufferGeometry', material: 'Material', texture: 'Texture', attribute: 'BufferAttribute' };

let chrome, srv, page;
test.before(async () => {
  if (!BASE) { srv = await startStaticServer({ root: process.env.SKY_ROOT || undefined }); BASE = `${srv.url}/skyblitz`; }
  chrome = await launchChrome({ width: 960, height: 540 });
  page = await chrome.newPage();
  await page.s('Page.addScriptToEvaluateOnNewDocument', { source: GLCOUNT });
});
test.after(async () => { await chrome?.close(); await srv?.close(); });

const J = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));
// usedSize is the JS heap only. Typed arrays (bake tiles, attributes, particle buffers: this game's main data) keep their bytes in ArrayBuffer backing
// stores outside it, so a disposed race that retains 0.5 MB of Float64Array was invisible (R2-E-12, mutation L1): add backingStorageSize.
async function heapMB() {
  try { await page.s('HeapProfiler.enable'); } catch { /* already on */ }
  for (let k = 0; k < 2; k++) { await page.s('HeapProfiler.collectGarbage'); await delay(150); }
  const h = await page.s('Runtime.getHeapUsage');
  return +(((h.usedSize || 0) + (h.backingStorageSize || 0)) / 1048576).toFixed(2);
}
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
async function liveObjects() {
  const out = {};
  for (const [key, cls] of Object.entries(CLASSES)) {
    const proto = await page.s('Runtime.evaluate', { expression: `__sky.game.THREE.${cls}.prototype`, objectGroup: 'qo' });
    const found = await page.s('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId, objectGroup: 'qo' });
    out[key] = (await page.s('Runtime.callFunctionOn', { objectId: found.objects.objectId, functionDeclaration: 'function(){return this.length}', returnByValue: true })).result.value;
  }
  await page.s('Runtime.releaseObjectGroup', { objectGroup: 'qo' });
  return out;
}
const slope = (ys) => { const n = ys.length, mx = (n - 1) / 2, my = ys.reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0; ys.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) ** 2; }); return sxy / sxx; };
async function runToDone() {
  for (let n = 0; n < 60 * 400; n += 240) {
    const done = await page.eval(`(()=>{const g=__sky.game;for(let i=0;i<240;i++){if(g.race.state==='done')return true;g.fixedUpdate();if(i%6===0)g.renderFrame(1,1/60);}return g.race.state==='done'})()`);
    if (done) return;
  }
  throw new Error('race did not finish');
}

// every course at Low (cheap, fast), plus one course at High, the desktop default: shadows, bloom, SMAA, full water and the High-only scenery
// never went through a dispose cycle (R2-E-12). LEAK_HIGH=none skips it, LEAK_HIGH=neon picks another course.
const RUNS = COURSES.map((course) => ({ course, quality: 'low' }));
if ((process.env.LEAK_HIGH || 'redrock') !== 'none') RUNS.push({ course: process.env.LEAK_HIGH || 'redrock', quality: 'high' });
for (const { course, quality } of RUNS) {
  test(`${course}${quality === 'high' ? ' (High preset)' : ''}: ${RACES} consecutive races leave GL buffers, textures and heap flat`, { timeout: 1200000 }, async (t) => {
    await page.goto(`${BASE}/?` + new URLSearchParams({ manual: 1, mute: 1, debug: 1, quality }), { timeout: 90000 });
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
      const snap = await J(SNAP), heap = await heapMB();
      disposed.push({ ...snap, heap, live: await liveObjects() });
    }
    const row = (s) => `buf ${s.gl.buffers} (${s.gl.bufMB} MB) tex ${s.gl.textures}/${s.textures} geo ${s.geometries} prog ${s.programs} heap ${s.heap}`;
    t.diagnostic(`${course} running : ${running.map(row).join('  |  ')}`);
    t.diagnostic(`${course} disposed: ${disposed.map(row).join('  |  ')}`);
    t.diagnostic(`${course} live objects after dispose: ${disposed.map((s) => Object.values(s.live).join('/')).join('  |  ')}  (${Object.keys(CLASSES).join('/')})`);
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
    // JS objects: nothing of a finished course may stay alive (flat from race 2 on, a few lazily created pool objects aside)
    for (const key of Object.keys(CLASSES)) {
      const p = disposed[a].live[key], q = disposed[b].live[key];
      assert.ok(q - p <= Math.max(25, p * 0.02), `after dispose: live ${CLASSES[key]} objects ${p} (race 2) -> ${q} (race ${RACES})`);
    }
    // Heap MB: least-squares slope over the races after the warm-up race. It is not zero and cannot be: a heap snapshot diff of neon races 3 -> 8 (+0.96 MB)
    // is 0.91 MB V8 code (bytecode and feedback vectors of functions that warm up as the races repeat), 0.05 MB Chrome performance-entry buffers and 2 KB of game
    // objects (65 Objects, 26 Arrays). That warm-up measures 0.10-0.20 MB per race; the leak this test was written for grew 0.55 MB per race (redrock, 11.1 -> 13.3 MB
    // in 4 races), so the limit sits between them, and the live-object counts above carry the sharp check.
    // R2-E-12: the figure is JS heap + ArrayBuffer backing stores, and the verdict is the MEDIAN per-race delta over the races after the warm-up race (a
    // one-off lump from a lazily created pool cannot decide it), against 0.15 MB: baseline medians are 0.03-0.10 MB per race (mutation L4, 0.26 MB of
    // small objects per race, and L1, 0.5 MB of Float64Array per race, must go red).
    const heaps = disposed.slice(a).map((s) => s.heap), perRace = slope(heaps);
    const deltas = heaps.slice(1).map((v, i) => +(v - heaps[i]).toFixed(2)), med = median(deltas);
    t.diagnostic(`${course} heap+backing per race: slope ${perRace.toFixed(3)} MB, median delta ${med.toFixed(3)} MB, deltas ${deltas.join(' ')}`);
    assert.ok(med < 0.15, `heap + backing stores after GC grow by a median ${med.toFixed(2)} MB per race (${heaps.join(' -> ')} MB)`);
    assert.ok(perRace < 0.3, `heap after GC grows ${perRace.toFixed(2)} MB per race (${heaps.join(' -> ')} MB)`);
    assert.equal(disposed[b].errors, 0, '__sky.errors stays empty');
  });
}
