// E-04, in a real browser: rendering must never feed the simulation. Same seed, same autopilot, one lap; only the RENDER cadence differs
// (sim only / a rendered frame after every step / after every 3rd step). Every cadence must end with identical finish times, racer positions
// and moving-hazard positions. Sunrise (balloons) and neon (hovercars, blimps) are the courses with moving hazards; frost is the control.
// Before the fix the hazards advanced on render time in the scenery update(), so the three cadences gave three different races
// (reviewer probe renderdet: sunrise seed 7 54.617 s / 8 finishers vs 53.508 s with a DNF; neon 54.798 / 57.803 / 56.003 s).
//   node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/render-det.test.mjs        (own static server on a free port; headless Chrome)
// Env: SKY_URL (e.g. http://127.0.0.1:8100/skyblitz) to use a server that is already running; SKY_ROOT=<dir holding skyblitz/> to serve a frozen copy
// of the game (other agents editing the tree mid-run change the code between the three page loads); RENDERDET=sunrise,neon,frost to pick courses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChrome } from './tools/chrome.mjs';
import { startStaticServer } from './tools/static-server.mjs';

let BASE = process.env.SKY_URL || '';
const COURSES = (process.env.RENDERDET || 'sunrise,neon').split(',');
const SEED = 7;

let chrome, srv, page;
test.before(async () => {
  if (!BASE) { srv = await startStaticServer({ root: process.env.SKY_ROOT || undefined }); BASE = `${srv.url}/skyblitz`; }
  chrome = await launchChrome({ width: 960, height: 540 });
  page = await chrome.newPage();
});
test.after(async () => { await chrome?.close(); await srv?.close(); });

const qs = (o) => new URLSearchParams(o).toString();
const J = async (expr) => JSON.parse(await page.eval(`JSON.stringify(${expr})`));

/** One lap in a fresh page; `every` = render after every Nth fixed step (0 = never). */
async function lap(course, every) {
  await page.goto(`${BASE}/?` + qs({ manual: 1, autostart: 1, mute: 1, autopilot: 1, course, seed: SEED, laps: 1, bots: 7, diff: 'normal', craft: 'falcon', quality: 'low' }), { timeout: 90000 });
  await page.waitFor('window.__sky && __sky.ready && __sky.game.state==="race" && !!__sky.game.race', { timeout: 120000 });
  const res = await J(`(()=>{const g=__sky.game,r=g.race,c=g.course,E=${every};let n=0;
    while(r.state!=='done'&&n<60*140){g.fixedUpdate();n++;if(E&&n%E===0)g.renderFrame(1,E/60);}
    const f=(v,k)=>v.toFixed(k), movers=c.hazards.filter((h)=>h.vel);
    return {steps:n,clock:+r.clock.toFixed(4),state:r.state,finished:r.racers.filter((x)=>x.finishTime!=null).length,
      finish:r.racers.map((x)=>x.id+':'+(x.finishTime==null?'x':f(x.finishTime,3))).join('|'),
      pos:r.racers.map((x)=>f(x.flight.pos.x,2)+','+f(x.flight.pos.y,2)+','+f(x.flight.pos.z,2)).join('|'),
      haz:c.hazards.map((h)=>f(h.pos.x,3)+','+f(h.pos.y,3)+','+f(h.pos.z,3)).join('|'),
      swing:movers.length?Math.max(...movers.map((h)=>h.pos.distanceTo(h.home))):0,movers:movers.length}})()`);
  return { ...res, errors: page.errors().map((e) => e.text.slice(0, 200)) };
}

for (const course of COURSES) {
  test(`${course}: sim-only, render-every-step and render-every-3rd-step run the same race`, { timeout: 600000 }, async (t) => {
    const simOnly = await lap(course, 0);
    const every = await lap(course, 1);
    const third = await lap(course, 3);
    const fin = simOnly.finish.split('|').map((s) => s.split(':')).filter((x) => x[1] !== 'x').map((x) => +x[1]).sort((a, b) => a - b);
    t.diagnostic(`${course} seed ${SEED}: ${simOnly.finished}/8 finished, winner ${fin[0]} s, last ${fin.at(-1)} s, ${simOnly.steps} steps, hazard swing ${simOnly.swing.toFixed(1)} m`);
    for (const r of [simOnly, every, third]) assert.deepEqual(r.errors, [], 'no console errors');
    assert.equal(simOnly.state, 'done', `the lap finishes (${simOnly.steps} steps)`);
    assert.ok(simOnly.finished >= 6, `${simOnly.finished}/8 finished`);
    if (course !== 'frost' && course !== 'redrock') assert.ok(simOnly.movers >= 2 && simOnly.swing > 1, `moving hazards moved in the sim-only lap (${simOnly.movers} movers, swing ${simOnly.swing.toFixed(1)} m)`);
    for (const [name, r] of [['render every step', every], ['render every 3rd step', third]]) {
      assert.equal(r.haz, simOnly.haz, `${name}: hazard positions`);
      assert.equal(r.finish, simOnly.finish, `${name}: finish times`);
      assert.equal(r.pos, simOnly.pos, `${name}: end positions`);
      assert.equal(r.clock, simOnly.clock, `${name}: race clock`);
    }
  });
}
