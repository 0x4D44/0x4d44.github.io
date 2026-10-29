// Review kit: collects reviewer evidence from the real game in headless GPU Chrome. One command, one output folder:
//   node skyblitz/tests/tools/review-kit.mjs --course sunrise --out <dir> [--seed 7] [--diff normal] [--laps 1] [--bots 7]
//        [--craft falcon] [--quality high] [--w 1280] [--h 720] [--shots 8] [--max 420] [--port 8100] [--race 1] [--vantages 8]
// Writes <dir>/report.json plus JPEG screenshots:
//   race-NN.jpg      chase-camera view with the HUD, spread over the race (autopilot flies the player)
//   clean-NN.jpg     the same moments with the UI hidden
//   vantage-NN.jpg   fixed fly-through cameras along the main path (course design / scenery review)
//   overview-top.jpg / overview-oblique.jpg   the whole course from above
// report.json: timings, finish order, lap times, event counts (overtakes, hits, item use...), per-second player telemetry,
// frame cost (ms, draw calls, triangles) and every console error. Exit code 1 when the page logged errors.
import { launchChrome } from './chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d; };
const out = arg('out');
if (!out) { console.error('usage: review-kit.mjs --course <id> --out <dir> [options] (see file header)'); process.exit(2); }
mkdirSync(out, { recursive: true });
const o = {
  course: arg('course', 'sunrise'), seed: arg('seed', '7'), diff: arg('diff', 'normal'), laps: arg('laps', '1'), bots: arg('bots', '7'),
  craft: arg('craft', 'falcon'), quality: arg('quality', 'high'), w: +arg('w', 1280), h: +arg('h', 720), shots: +arg('shots', 8),
  max: +arg('max', 420), port: arg('port', '8100'), race: arg('race', '1') !== '0', vantages: +arg('vantages', 8),
};
const url = `http://127.0.0.1:${o.port}/skyblitz/?` + new URLSearchParams({
  manual: '1', autostart: '1', mute: '1', autopilot: '1', course: o.course, seed: o.seed, diff: o.diff, laps: o.laps, bots: o.bots, craft: o.craft, quality: o.quality,
});
const report = { options: o, url, startedAt: new Date().toISOString(), shots: [], series: [], errors: [] };
const jpg = (name) => join(out, name);

const chrome = await launchChrome({ width: o.w, height: o.h });
try {
  const page = await chrome.newPage();
  const t0 = Date.now();
  await page.goto(url);
  await page.waitFor('window.__sky && window.__sky.ready', { timeout: 90000 });
  report.loadMs = Date.now() - t0;
  await page.eval('__sky.events(true)');
  // hotspot recorder: where along the lap do tumbles, stalls, wrong-way flags, respawns, hits and wall/ground grazes happen?
  await page.eval(`(()=>{window.__hot=[];const g=__sky.game,ev=g.events;for(const t of ['racer:tumble','racer:stall','race:wrongway','race:respawn','racer:hit','racer:graze']){ev.on(t,(d)=>{const r=d&&(d.racer||d.target||d.victim);if(r&&r.flight)__hot.push({t,s:Math.round(r.s||0),lap:r.lap,n:r.name,k:d.kind||d.surface||(d.on===false?'off':''),c:+(g.race?.clock||0).toFixed(1)});});}return 1})()`);
  const shot = async (name) => { await page.screenshot(jpg(name), { format: 'jpeg', quality: 88 }); report.shots.push(name); };
  const J = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));

  // ---- 1. the race, flown by the autopilot -------------------------------------------------------------------------------
  if (o.race) {
    const every = Math.max(10, Math.floor(o.max / o.shots));   // seconds between screenshots (race time)
    let t = 0, shotNo = 0, done = false;
    // let the countdown run first: steps are fixed 1/60 s
    while (t < o.max && !done) {
      const wantShot = shotNo < o.shots && t >= 6 + shotNo * every;
      if (wantShot) {
        await page.eval('__sky.step(75, 1)');          // render every step so particles/trails/camera settle
        t += 1.25;
        await shot(`race-${String(shotNo).padStart(2, '0')}.jpg`);
        await page.eval('__sky.ui(false)'); await page.eval('__sky.step(1)');
        await shot(`clean-${String(shotNo).padStart(2, '0')}.jpg`);
        await page.eval('__sky.ui(true)');
        shotNo++;
      } else { await page.eval('__sky.sim(60)'); t += 1; }
      const st = await J('__sky.state()');
      const me = st.race?.racers.find((r) => r.player) || st.race?.racers[0];
      report.series.push({ t: +t.toFixed(1), state: st.state, race: st.race?.state, clock: st.race?.clock, s: me?.s, lap: me?.lap, place: me?.place, speed: me?.speed, alt: me?.alt, boost: me?.boost, item: me?.item });
      if (st.race?.state === 'done' || st.state === 'results' || st.state === 'finish') done = true;
      if (st.race && st.race.racers.every((r) => r.finished)) done = true;
    }
    report.raceEnded = done;
    report.result = await J(`(()=>{const r=__sky.game.race; if(!r) return null; return {clock:+r.clock.toFixed(2), state:r.state, racers:r.racers.map(x=>({name:x.name,player:!!x.isPlayer,place:x.place,lap:x.lap,finished:!!x.finished,finishTime:x.finishTime,bestLap:x.bestLap,lapTimes:x.lapTimes,stats:x.stats}))}})()`);
    report.events = await J('__sky.eventCounts()');
    // hotspots: 100 m bins along the main path (s wraps per lap), top bins per event type + hit kinds
    const hot = await J('window.__hot||[]'), L = await J('__sky.game.course.length');
    const by = {};
    for (const h of hot) { const key = h.t + (h.t === 'racer:hit' || h.t === 'racer:graze' ? ':' + h.k : ''); ((by[key] ||= {})[Math.floor((((h.s % L) + L) % L) / 100)] ||= 0); by[key][Math.floor((((h.s % L) + L) % L) / 100)]++; }
    report.hotspots = Object.fromEntries(Object.entries(by).map(([k, bins]) => [k, { total: Object.values(bins).reduce((a, b) => a + b, 0), top: Object.entries(bins).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([b, n]) => `s=${b * 100}-${b * 100 + 99}: ${n}`) }]));
  }

  // ---- 2. fixed vantage cameras along the main path + whole-course overview -----------------------------------------------
  if (o.vantages > 0) {
    if (!o.race) { await page.eval('__sky.step(5)'); }
    else { await page.eval('__sky.step(45)'); }       // sim() renders nothing, so the last hit's screen flash is still at full strength: it would veil the first vantages
    const geo = await J(`(()=>{const g=__sky.game,c=g.course,L=c.length,f={};const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<240;i++){c.frameAt(i/240*L,f);const p=[f.pos.x,f.pos.y,f.pos.z];for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}}return {L,mn,mx,laps:c.laps,sectors:c.sectors?.length,gates:c.gates?.length,rings:c.boostRings?.length,boxes:c.itemBoxes?.length,branches:(c.branches||[]).map(b=>({id:b.id,from:b.fromS,to:b.toS,len:b.length}))};})()`);
    report.course = geo;
    for (let k = 0; k < o.vantages; k++) {
      const s = geo.L * (k + 0.5) / o.vantages;
      await page.eval(`(()=>{const c=__sky.game.course,f={};c.frameAt(${s},f);const p=f.pos,t=f.tangent,u=f.up;__sky.cam([p.x-t.x*16+u.x*5.5,p.y-t.y*16+u.y*5.5,p.z-t.z*16+u.z*5.5],[p.x+t.x*50,p.y+t.y*50,p.z+t.z*50],72);})()`);
      await page.eval('__sky.ui(false)'); await page.eval('__sky.step(2)');
      await shot(`vantage-${String(k).padStart(2, '0')}.jpg`);
    }
    const cx = (geo.mn[0] + geo.mx[0]) / 2, cz = (geo.mn[2] + geo.mx[2]) / 2, cy = (geo.mn[1] + geo.mx[1]) / 2;
    const ext = Math.max(geo.mx[0] - geo.mn[0], geo.mx[2] - geo.mn[2]);
    await page.eval(`__sky.cam([${cx},${cy + ext * 1.25},${cz + 1}],[${cx},${cy},${cz}],50)`); await page.eval('__sky.step(2)'); await shot('overview-top.jpg');
    await page.eval(`__sky.cam([${cx + ext * 0.75},${cy + ext * 0.7},${cz + ext * 0.75}],[${cx},${cy},${cz}],50)`); await page.eval('__sky.step(2)'); await shot('overview-oblique.jpg');
    await page.eval('__sky.cam(null)'); await page.eval('__sky.ui(true)');
  }

  // ---- 3. frame cost -------------------------------------------------------------------------------------------------------
  // renderer.info resets every render() call, so with a post pipeline it only shows the last pass: accumulate over the whole frame instead.
  report.frameCost = await J(`(()=>{const g=__sky.game;const r=g.renderer,gl=r.getContext(),i=r.info;const auto=i.autoReset;i.autoReset=false;const ms=[];let calls=0,tris=0;for(let k=0;k<150;k++){g.fixedUpdate();i.reset();const t=performance.now();g.renderFrame(1,1/60);gl.finish();ms.push(performance.now()-t);calls=Math.max(calls,i.render.calls);tris=Math.max(tris,i.render.triangles);}i.autoReset=auto;ms.sort((a,b)=>a-b);const q=(p)=>+ms[Math.min(ms.length-1,Math.floor(p*ms.length))].toFixed(2);return {frames:ms.length,avgMs:+(ms.reduce((a,b)=>a+b,0)/ms.length).toFixed(2),p50:q(.5),p95:q(.95),max:q(.999),calls,triangles:tris,geometries:i.memory.geometries,textures:i.memory.textures,quality:g.qualityId}})()`);
  report.errors = [...page.errors().map((e) => e.text), ...(await J('__sky.errors'))];
  report.finishedAt = new Date().toISOString();
} finally {
  await chrome.close();
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
const res = report.result;
console.log(`review-kit ${o.course}: loaded in ${report.loadMs} ms, ${report.shots.length} shots, errors=${report.errors.length}`);
if (res) console.log(`  race clock ${res.clock}s state=${res.state}; finished ${res.racers.filter((r) => r.finished).length}/${res.racers.length}; player place ${res.racers.find((r) => r.player)?.place}`);
if (report.frameCost) console.log(`  frame ${report.frameCost.avgMs} ms avg / ${report.frameCost.p95} p95, ${report.frameCost.calls} calls, ${report.frameCost.triangles} tris @ ${report.frameCost.quality}`);
if (report.hotspots) for (const [k, v] of Object.entries(report.hotspots)) console.log(`  hot ${k}: ${v.total}  (${v.top.slice(0, 3).join(' | ')})`);
console.log(`  report: ${join(out, 'report.json')}`);
process.exit(report.errors.length ? 1 : 0);
