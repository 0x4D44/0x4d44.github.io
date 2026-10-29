// Keyboard bot: flies the real game the way a human on a keyboard does, through real key events (CDP Input.dispatchKeyEvent), so it measures
// how flyable the KEYBOARD path is (input smoothing, flight assist, camera) next to the same craft on the analog autopilot.
// The decisions come from the AI pilot's analog command (race.player.ai.think, run every sim step at the sim's own dt so its internal state is
// the real thing) delayed by a human reaction time and then turned into W/A/S/D, Shift, X, Space, F, Q/E presses: a command below the dead
// zone is no key, a strong one is a held key, and a weak one is a tap whose length is its strength (pulse-width, how people tap).
//   node skyblitz/tests/tools/keybot.mjs --course sunrise --out <dir> [--laps 1] [--seed 7] [--diff normal] [--craft falcon] [--bots 7]
//        [--interval 0.1] [--delay 0.12] [--dead 0.12] [--pwm tap|sd|track] [--nodouble 0|1] [--mode keys|autopilot] [--max 400] [--shots 5]
//        [--port 8100] [--w 1280] [--h 720] [--noise 0]
// --pwm tap: weak commands are taps whose length is their strength (a person); --pwm sd: sigma-delta pulse train every step; --pwm track: key
// state chosen each step so the sim's ramped input follows the wanted value (the ideal keyboard player, an upper bound for any person).
// --mode autopilot flies the same craft with the analog AI (the reference lap). Writes <dir>/keybot-<course>.json (+ shot-NN.jpg), prints a
// summary, exit code 1 on console errors. Headless, below-normal priority (chrome.mjs).
import { launchChrome } from './chrome.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : d; };
const o = {
  course: arg('course', 'sunrise'), out: arg('out'), laps: arg('laps', '1'), seed: arg('seed', '7'), diff: arg('diff', 'normal'), craft: arg('craft', 'falcon'),
  bots: arg('bots', '7'), interval: +arg('interval', 0.1), delay: +arg('delay', 0.12), dead: +arg('dead', 0.12), mode: arg('mode', 'keys'), pwm: arg('pwm', 'tap'), nodouble: arg('nodouble', '0') === '1' ? 1 : 0,
  max: +arg('max', 400), shots: +arg('shots', 5), port: arg('port', '8100'), w: +arg('w', 1280), h: +arg('h', 720), noise: +arg('noise', 0),
};
if (!o.out) { console.error('usage: keybot.mjs --course <id> --out <dir> [options] (see file header)'); process.exit(2); }
mkdirSync(o.out, { recursive: true });
const url = `http://127.0.0.1:${o.port}/skyblitz/?` + new URLSearchParams({ manual: '1', autostart: '1', mute: '1', course: o.course, seed: o.seed, diff: o.diff, laps: o.laps, bots: o.bots, craft: o.craft });
const chrome = await launchChrome({ width: o.w, height: o.h });
const report = { options: o, url, ticks: 0, series: [], errors: [] };
const tag = o.mode === 'autopilot' ? 'autopilot' : `keys ${o.pwm} delay ${o.delay}s every ${o.interval}s${o.nodouble ? ' no-double-tap' : ''}`;
try {
  const page = await chrome.newPage();
  await page.goto(url);
  await page.waitFor('!!(window.__sky && window.__sky.ready && window.__sky.game.race && window.__sky.game.player)', { timeout: 90000 });   // !!: waitFor serialises the result
  const J = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));
  await page.eval('__sky.events(true)');
  await page.eval(`(()=>{window.__c={graze:0,tumble:0,stall:0,hit:0,wrong:0,respawn:0,stunt:0};const ev=__sky.game.events,p=()=>__sky.game.player;const on=(t,k,f)=>ev.on(t,(d)=>{if(!d||(d.racer||d.target||d.victim)===p())__c[k]++;});on('racer:graze','graze');on('racer:tumble','tumble');on('racer:stall','stall');on('racer:hit','hit');on('race:wrongway','wrong');on('race:respawn','respawn');on('racer:stunt','stunt');return 1})()`);
  // page side: the AI mind runs every sim step at SIM_DT (its internal state is continuous); we read its command from `delay` steps ago.
  // performance.now follows SIM time, so the double-tap barrel-roll window (input.js, DOUBLE_TAP) measures what it would in real-time play.
  await page.eval(`(()=>{const g=__sky.game,p=g.player,DT=1/60,ring=[],o={pitch:0,roll:0,yaw:0,boost:false,fire:false,item:false,itemBack:false,barrel:0,airbrake:0,throttle:1};
    const snap=()=>({p:o.pitch,r:o.roll,boost:!!o.boost,fire:!!o.fire,item:!!o.item,barrel:o.barrel|0,brake:o.airbrake>0.3});
    const t0=performance.now();let bump=0;const simMs=()=>t0+g.simTime*1000+bump;performance.now=simMs;
    if(${o.nodouble}){addEventListener('keydown',()=>{bump+=1000;},true);}                 // --nodouble: no key press ever counts as a double tap (isolates that rule)
    window.__kb={advance(n,draw){for(let i=0;i<n;i++){p.ai.think(DT,o);ring.push(snap());if(ring.length>90)ring.shift();g.fixedUpdate();}g.renderFrame(1,DT);},
      cmd(delay){return ring[Math.max(0,ring.length-1-delay)]||snap();}};return 1})()`);

  const held = new Set();
  const setKeys = async (want) => {                    // press/release only the differences, like fingers do
    for (const k of [...held]) if (!want.has(k)) { await page.key(k, { type: 'up' }); held.delete(k); }
    for (const k of want) if (!held.has(k)) { await page.key(k, { type: 'down' }); held.add(k); }
  };
  const advance = (n) => page.eval(`__kb.advance(${n})`);
  const tap = async (k) => { await page.key(k, { type: 'down' }); await advance(2); await page.key(k, { type: 'up' }); };
  const noise = () => (o.noise ? (Math.random() * 2 - 1) * o.noise : 0);
  const nStep = Math.max(1, Math.round(o.interval * 60)), delaySteps = Math.round(o.delay * 60), sdAcc = { r: 0, p: 0 };
  let shot = 0, nextShot = 8;

  // countdown: step to the rocket-start window and press boost once at ~0.3 s before GO (a perfect start is <= 0.18 s)
  for (let guard = 0; guard < 800; guard++) {
    const st = await J('(()=>{const r=__sky.game.race;return {s:r.state,t:+(r.cd-1.2).toFixed(3)}})()');
    if (st.s === 'racing') break;
    if (o.mode === 'keys' && st.s === 'countdown' && st.t <= 0.3 && !held.has('ShiftLeft')) await setKeys(new Set(['ShiftLeft']));
    await page.eval(`__sky.step(${st.s === 'countdown' && st.t < 1 ? 2 : 10}, 10)`);
  }
  await setKeys(new Set());
  if (o.mode === 'autopilot') await page.eval('__sky.autopilot(true)');

  const poll = async () => J(`(()=>{const g=__sky.game,r=g.player,rc=g.race;return {clock:+rc.clock.toFixed(1),state:rc.state,s:Math.round(r.s),lap:r.lap,place:r.place,spd:Math.round(r.flight.speed),lat:Math.round(r.lateral),vert:Math.round(r.vertical||0),tumble:+(r.tumble||0).toFixed(1),finished:!!r.finished,dist:Math.round(r.dist),wrong:!!r.wrongWay}})()`);
  for (let tick = 0; tick < (o.max * 60) / nStep; tick++) {
    if (o.mode === 'autopilot') await page.eval(`__sky.step(${nStep}, ${nStep})`);
    else {
      const a = await J(`__kb.cmd(${delaySteps})`);
      const want = new Set(), part = [];               // part: [key, hold steps] for taps shorter than the interval
      const axis = (v, neg, pos) => {
        v += noise(); const m = Math.abs(v); if (m < o.dead) return;
        const key = v > 0 ? pos : neg;
        want.add(key); if (m < 0.85) part.push([key, Math.max(1, Math.round(m * nStep))]);
      };
      if (o.pwm === 'track') {                         // closed loop on the ramped input the sim actually sees: press while below the wanted value, release above it
        const cur = await J('(()=>{const c=__sky.game.input.controls;return {r:c.roll,p:c.pitch}})()');
        const trk = (v, x, neg, pos) => { v += noise(); if (v > o.dead) { if (x < v) want.add(pos); } else if (v < -o.dead) { if (x > v) want.add(neg); } };
        trk(a.r, cur.r, 'KeyA', 'KeyD'); trk(a.p, cur.p, 'KeyW', 'KeyS');
      } else if (o.pwm === 'sd') {                     // sigma-delta pulse train: average key state = the analog command, every sim step (ignores the ramp)
        const sd = (v, ax, neg, pos) => { sdAcc[ax] += v + noise(); if (sdAcc[ax] >= 0.5) { want.add(pos); sdAcc[ax] -= 1; } else if (sdAcc[ax] <= -0.5) { want.add(neg); sdAcc[ax] += 1; } };
        sd(a.r, 'r', 'KeyA', 'KeyD'); sd(a.p, 'p', 'KeyW', 'KeyS');
      } else { axis(a.r, 'KeyA', 'KeyD'); axis(a.p, 'KeyW', 'KeyS'); }   // 'flight' pitch mode: S / Down = pull = nose up
      if (a.boost) want.add('ShiftLeft'); if (a.fire) want.add('Space'); if (a.brake) want.add('KeyX');
      await setKeys(want);
      if (a.item) await tap('KeyF');
      if (a.barrel) await tap(a.barrel < 0 ? 'KeyQ' : 'KeyE');
      let done = 0;
      for (const [key, hold] of part.sort((x, y) => x[1] - y[1])) {      // release each tap at its own length
        if (hold > done) { await advance(hold - done); done = hold; }
        if (held.has(key)) { await page.key(key, { type: 'up' }); held.delete(key); }
      }
      if (nStep > done) await advance(nStep - done);
    }
    report.ticks++;
    const st = await poll();
    if (tick % 8 === 0) report.series.push(st);
    if (shot < o.shots && st.clock >= nextShot) { await page.screenshot(join(o.out, `shot-${String(shot).padStart(2, '0')}.jpg`), { format: 'jpeg', quality: 85 }); shot++; nextShot += Math.max(10, (o.max / 2) / o.shots); }
    if (st.finished || st.state === 'done' || st.clock > o.max) break;
  }
  await setKeys(new Set());
  report.counts = await J('__c');
  report.result = await J(`(()=>{const r=__sky.game.player,rc=__sky.game.race;return {clock:+rc.clock.toFixed(1),place:r.place,lap:r.lap,finished:!!r.finished,finishTime:r.finishTime,bestLap:r.bestLap,lapTimes:r.lapTimes,dist:Math.round(r.dist),courseLen:Math.round(__sky.game.course.length),stats:r.stats,ai:rc.racers.filter(x=>!x.isPlayer).map(x=>({n:x.name,place:x.place,fin:x.finishTime,dist:Math.round(x.dist)}))}})()`);
  report.errors = [...page.errors().map((e) => e.text), ...(await J('__sky.errors'))];
} finally { await chrome.close(); }
writeFileSync(join(o.out, `keybot-${o.course}${o.mode === 'autopilot' ? '-autopilot' : ''}.json`), JSON.stringify(report, null, 2));
const r = report.result, c = report.counts;
const ais = (r?.ai || []).map((x) => x.fin).filter(Boolean).sort((a, b) => a - b);
const lat = report.series.map((s) => Math.abs(s.lat)), spd = report.series.map((s) => s.spd);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
console.log(`keybot ${o.course} [${tag}] dead ${o.dead}: place ${r?.place}/8, finished=${r?.finished} time=${(r?.finishTime ?? r?.clock)?.toFixed?.(1)}s (AI winner ${ais[0]?.toFixed(1)}s, median ${ais[Math.floor(ais.length / 2)]?.toFixed(1)}s) dist ${r?.dist}/${r?.courseLen * Number(o.laps)}`);
console.log(`  player: grazes ${c?.graze} tumbles ${c?.tumble} stalls ${c?.stall} hits ${c?.hit} wrongway ${c?.wrong} respawns ${c?.respawn} stunts ${c?.stunt}; mean speed ${mean(spd).toFixed(0)} m/s, mean |lateral| ${mean(lat).toFixed(0)} m; errors ${report.errors.length}`);
process.exit(report.errors.length ? 1 : 0);
