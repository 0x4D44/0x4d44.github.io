// How well do the people walk and move, the way the GAME moves them? Records scripted walks through the game's own crowd code (tools/people_motion.html), measures them
// (js/sim/motion_metrics.mjs) and scores them against research/people-motion-rubric.md.
//   node tools/people_motion.mjs [--people a,b,c|default|all] [--speeds 0.4,0.8,1.2,1.6,1.9] [--scen steady,startstop,turn,spin] [--gait clip|default] [--detail 0|1]
//                                [--items] [--worst N] [--json out.json] [--rec DIR] [--film DIR] [--seed N] [--base URL] [--no-mesh]
//     --detail 1       record the simplified (LOD1) model the crowd wears beyond ~11 m, not the full-detail one the nearest people have (default 0)
//     --gait clip      the clip-driven walk the game had before the procedural gait layer (the baseline); default = whatever the game does now
//     --items          print every sub-metric (mean value and score over the recordings); --worst N the N lowest-scoring recordings, item by item
//     --rec DIR        keep the raw recordings (landmarks per frame) as JSON, so a reviewer can re-score or plot them
//     --no-mesh        do not record the RENDERED shoes: the lowest point of each (shoeY, and per foot shoe.l / shoe.r = height of the lowest vertex and the horizontal speed of that very
//                      vertex). By default every frame records them, and GRD.sink / float / flight / slip / clear and the contact timing judge them instead of the gait's own foot
//                      landmarks (a walker cannot mark its own homework: see the rubric's Revisions). Without it they fall back to the landmarks.
//     --film DIR       side / front / top filmstrips of one stride at 1.2 m/s per person, as PNG
//     --rubric         print the rubric table and exit
// Serves the repo root with python3 -m http.server unless --base is given. Needs Playwright (like tools/people_holes.mjs).
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as M from '../js/sim/motion_metrics.mjs';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
if (flag('--rubric')) { console.log(M.rubricTable()); process.exit(0); }
const { chromium } = require('playwright');
const DEFAULT_PEOPLE = ['man_commuter', 'woman_midi', 'boy', 'man_elder', 'girl_school_kilt', 'woman_coat'];
const GAIT = arg('--gait', 'default'), DETAIL = arg('--detail', '0'), SEED = +arg('--seed', 1), SPEEDS = arg('--speeds', M.SPEEDS.join(',')).split(',').map(Number), SCENS = arg('--scen', 'steady,startstop,turn,spin').split(',');
let PEOPLE = arg('--people', 'default'); const WORST = +arg('--worst', 0);
let BASE = arg('--base', null), server = null;
if (!BASE) { const port = 8330 + Math.floor(Math.random() * 60); server = spawn('python3', ['-m', 'http.server', String(port), '--directory', root], { stdio: 'ignore' }); BASE = `http://localhost:${port}`; await new Promise((r) => setTimeout(r, 1200)); }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let exit = 0;
try {
  const page = await browser.newPage({ viewport: { width: 300, height: 400 } });
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
  await page.goto(`${BASE}/glasgow-subway/tools/people_motion.html?gait=${GAIT}&detail=${DETAIL}`);
  await page.waitForFunction('window.__ready', null, { timeout: 300000 });
  const err = await page.evaluate('window.__err'); if (err) throw new Error('load: ' + err);
  const ids = await page.evaluate('window.__ids');
  PEOPLE = PEOPLE === 'all' ? ids : PEOPLE === 'default' ? DEFAULT_PEOPLE.filter((p) => ids.includes(p)) : PEOPLE.split(',');
  const recDir = arg('--rec', null); if (recDir) fs.mkdirSync(recDir, { recursive: true });
  const record = async (id, spec, tag) => { const raw = await page.evaluate((s) => window.__run(s), { id, plan: spec.plan, seed: SEED, mesh: !flag('--no-mesh') }); if (recDir) fs.writeFileSync(path.join(recDir, `${id}_${tag}.json`), JSON.stringify(raw)); return new M.Rec(raw); };
  const results = { steady: {}, trans: {}, gait: GAIT, people: PEOPLE, speeds: SPEEDS }, t0 = Date.now();
  for (const id of PEOPLE) {
    results.steady[id] = {}; results.trans[id] = {};
    if (SCENS.includes('steady')) for (const v of SPEEDS) { const sc = M.SCEN.steady(v); results.steady[id][v] = M.analyseSteady(await record(id, sc, 'steady_' + v), sc.win); }
    const T = results.trans[id];
    if (SCENS.includes('startstop')) { const sc = M.SCEN.startstop(), rec = await record(id, sc, 'startstop'); T.start = M.analyseStart(rec); T.stop = M.analyseStop(rec); }
    if (SCENS.includes('turn')) {
      const rs = []; for (const d of [90, -90]) { const sc = M.SCEN.turn(d); rs.push(M.analyseTurn(await record(id, sc, 'turn_' + d), sc.win)); }
      T.turn = { ok: true, slip: Math.max(...rs.map((r) => r.slip)), yawRate: Math.max(...rs.map((r) => r.yawRate)), turned: rs.map((r) => r.turned) };
    }
    if (SCENS.includes('spin')) { const sc = M.SCEN.spin(120); T.spin = M.analyseSpin(await record(id, sc, 'spin'), sc.win); }
    process.stdout.write('.');
  }
  console.log(` ${PEOPLE.length} people recorded in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (!SCENS.includes('steady')) { console.log('(steady walks not run: no scores)'); }
  else {
    const S = M.scoreAll(results), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : ' n/a'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
    console.log(`\npeople-motion rubric   gait: ${GAIT}   people: ${PEOPLE.length}   speeds: ${SPEEDS.join(', ')}`);
    console.log('category'.padEnd(10) + 'name'.padEnd(36) + 'weight'.padStart(7) + 'score'.padStart(8));
    for (const c of Object.keys(M.CATS)) console.log(c.padEnd(10) + M.CAT_NAMES[c].padEnd(36) + String(M.CATS[c]).padStart(7) + f1(S.cats[c]).padStart(8) + (S.cats[c] < 8 ? '   <-- below 8' : ''));
    console.log('OVERALL'.padEnd(46) + '100'.padStart(7) + f2(S.overall).padStart(8) + `   worst recording: ${S.worst ? `${S.worst.person} @ ${S.worst.v} m/s = ${f1(S.worst.score)}` : 'n/a'}   gate (> 9, every category >= 8, no recording < 8): ${S.gate ? 'PASS' : 'no'}`);
    // the per-item picture: mean value and mean score over every recording the item is judged on
    const acc = {}; for (const r of S.rows) for (const i of r.items) { const a = (acc[i.id] = acc[i.id] || { i, v: [], s: [] }); a.v.push(i.value); a.s.push(i.score); }
    for (const p of Object.keys(S.trn)) for (const i of S.trn[p].items) { const a = (acc[i.id] = acc[i.id] || { i, v: [], s: [] }); a.v.push(i.value); a.s.push(i.score); }
    for (const i of S.rng.items) acc[i.id] = { i, v: [i.value], s: [i.score] };
    const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : NaN; };
    if (flag('--items')) { console.log('\nitem'.padEnd(13) + 'w'.padStart(4) + '  measured'.padEnd(64) + 'mean'.padStart(10) + 'score'.padStart(7)); for (const a of Object.values(acc)) console.log(a.i.id.padEnd(12) + String(a.i.w).padStart(4) + ('  ' + a.i.label + ' (' + a.i.unit + ')').padEnd(64).slice(0, 64) + (Number.isFinite(mean(a.v)) ? mean(a.v).toPrecision(3) : 'n/a').padStart(10) + f1(mean(a.s)).padStart(7)); }
    // each person at each speed: the headline numbers
    console.log('\nperson'.padEnd(21) + 'v'.padStart(5) + 'cad'.padStart(6) + '(exp)'.padStart(7) + 'step'.padStart(6) + '(exp)'.padStart(7) + 'slip'.padStart(6) + 'hip'.padStart(6) + 'knee'.padStart(6) + 'bob'.padStart(6) + 'arm'.padStart(6) + 'score'.padStart(7));
    for (const r of S.rows) { const a = r.a; if (!a.ok) { console.log(r.person.padEnd(20) + String(r.v).padStart(5) + '  ' + a.reason); continue; } const sc = S.per.find((x) => x.person === r.person && x.v === r.v);
      console.log(r.person.padEnd(20) + a.v.toFixed(2).padStart(6) + a.cadence.toFixed(0).padStart(6) + ('(' + a.ex.cadence.toFixed(0) + ')').padStart(7) + a.stepLen.toFixed(2).padStart(6) + ('(' + a.ex.stepLen.toFixed(2) + ')').padStart(7) + a.slip.toFixed(1).padStart(6) + a.hip.range.toFixed(0).padStart(6) + a.knee.swing.toFixed(0).padStart(6) + a.pelvis.bobPP.toFixed(0).padStart(6) + a.arm.range.toFixed(0).padStart(6) + f1(sc.score).padStart(7)); }
    if (WORST) for (const w of S.per.slice().sort((a, b) => a.score - b.score).slice(0, WORST)) { const r = S.rows.find((x) => x.person === w.person && x.v === w.v); console.log(`\n-- ${w.person} @ ${w.v} m/s: ${f1(w.score)}`); for (const i of r.items) if (i.score < 8) console.log('   ' + i.id.padEnd(12) + i.label.padEnd(58) + (Number.isFinite(i.value) ? i.value.toPrecision(3) : 'n/a').padStart(9) + ' ' + i.unit.padEnd(10) + f1(i.score).padStart(6)); }
    const j = arg('--json', null); if (j) { fs.writeFileSync(j, JSON.stringify({ results, cats: S.cats, overall: S.overall, per: S.per, gate: S.gate, rng: S.rng, trn: S.trn })); console.log('wrote', j); }
  }
  const filmDir = arg('--film', null);
  if (filmDir) { fs.mkdirSync(filmDir, { recursive: true }); for (const id of PEOPLE) for (const view of ['side', 'front', 'top']) { const url = await page.evaluate((s) => window.__film(s), { id, v: 1.2, frames: 8, span: 1.0, view, seed: SEED }); fs.writeFileSync(path.join(filmDir, `${id}_${view}.png`), Buffer.from(url.split(',')[1], 'base64')); } console.log('filmstrips in', filmDir); }
} catch (e) { console.error(e); exit = 1; }
finally { await browser.close(); if (server) server.kill(); }
process.exit(exit);
