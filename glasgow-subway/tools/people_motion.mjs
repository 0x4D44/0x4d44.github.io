// How well do the people walk and move, the way the GAME moves them? Records scripted walks through the game's own crowd code (tools/people_motion.html), measures them
// (js/sim/motion_metrics.mjs) and scores them against research/people-motion-rubric.md.
//   node tools/people_motion.mjs [--people a,b,c|default|all] [--speeds 0.4,0.8,1.2,1.6,1.9] [--scen steady,startstop,turn,spin] [--gait clip|default] [--detail 0|1]
//                                [--items] [--worst N] [--json out.json] [--rec DIR] [--from DIR] [--film DIR] [--seed N] [--base URL] [--no-mesh]
//     --detail 1       record the simplified (LOD1) model the crowd wears beyond ~11 m, not the full-detail one the nearest people have (default 0)
//     --gait clip      the clip-driven walk the game had before the procedural gait layer (the baseline); default = whatever the game does now
//     --items          print every sub-metric (mean value and score over the recordings, and what its band rests on); --worst N the N lowest-scoring recordings, item by item
//     --rec DIR        keep the raw recordings (landmarks per frame) as JSON, with a meta.json (who, what, which scenarios), so a reviewer can re-score or plot them
//     --from DIR       do not record: re-score the recordings kept by an earlier --rec run (no browser, no server; seconds, not minutes). The scenarios the recordings were made to must be
//                      the ones motion_metrics.mjs now holds (their hash is checked), and the roster the run covered is read from meta.json, so a re-score cannot be passed off as a bigger run
//     --no-mesh        do not record the RENDERED shoes: the lowest point of each (shoeY, and per foot shoe.l / shoe.r = height of the lowest vertex and the horizontal speed of that very
//                      vertex). By default every frame records them, and GRD.sink / float / flight / slip / clear and the contact timing judge them instead of the gait's own foot
//                      landmarks (a walker cannot mark its own homework: see the rubric's Revisions). Without it they fall back to the landmarks, and the gate cannot be met.
//     --film DIR       side / front / top filmstrips of one stride at 1.2 m/s per person, as PNG
//     --rubric         print the rubric table (with what each band rests on) and exit
// The gate (overall > 9, the 55 discriminating points > 9, every category >= 8 on average and at its 10th percentile, no recording < 8) counts only for --people all with every scenario
// at every speed, and only when every person's rendered shoes were found and checked; the printout says which clause fails. The hash of motion_metrics.mjs is printed with the scores, so a
// number can be tied to the instrument that produced it.
// Serves the repo root with python3 -m http.server unless --base is given. Needs Playwright (like tools/people_holes.mjs).
import { createRequire } from 'module';
import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as M from '../js/sim/motion_metrics.mjs';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const METRICS_SHA = sha(fs.readFileSync(path.join(here, '../js/sim/motion_metrics.mjs'))).slice(0, 12);
// what the recordings were made to do: a recording can only be re-scored under the same scenarios (plan and analysis window of every one)
const SCEN_SHA = sha(JSON.stringify([...M.SPEEDS.map((v) => M.SCEN.steady(v)), M.SCEN.startstop(), M.SCEN.turn(90), M.SCEN.turn(-90), M.SCEN.spin(120)])).slice(0, 12);
if (flag('--rubric')) {
  console.log(M.rubricTable());
  const sh = M.basisShares(); console.log('\nweight resting on each kind of basis (points of 100): ' + M.BASIS.map((b) => `${b} ${sh[b].toFixed(1)}`).join(', '));
  process.exit(0);
}
const FROM = arg('--from', null), NO_MESH = flag('--no-mesh');
const DEFAULT_PEOPLE = ['man_commuter', 'woman_midi', 'boy', 'man_elder', 'girl_school_kilt', 'woman_coat'];
let GAIT = arg('--gait', 'default'), DETAIL = arg('--detail', '0'), SEED = +arg('--seed', 1), SPEEDS = arg('--speeds', M.SPEEDS.join(',')).split(',').map(Number), SCENS = arg('--scen', 'steady,startstop,turn,spin').split(',');
let PEOPLE = arg('--people', FROM ? 'meta' : 'default'); const WORST = +arg('--worst', 0);
let BASE = arg('--base', null), server = null, browser = null, page = null, meta = null, ids = null;
const recDir = arg('--rec', null);
let exit = 0;
try {
  if (FROM) {
    const mp = path.join(FROM, 'meta.json');
    if (fs.existsSync(mp)) {
      meta = JSON.parse(fs.readFileSync(mp, 'utf8'));
      if (meta.scenSha !== SCEN_SHA) throw new Error(`these recordings were made to scenarios ${meta.scenSha}, motion_metrics.mjs now holds ${SCEN_SHA}: re-record them (--rec) instead of re-scoring`);
      GAIT = meta.gait; DETAIL = meta.detail; SEED = meta.seed; if (!arg('--speeds', null)) SPEEDS = meta.speeds; if (!arg('--scen', null)) SCENS = meta.scens; ids = meta.ids;
      console.log(`re-scoring ${FROM}: recorded ${meta.date} with motion_metrics.mjs ${meta.metricsSha}, scored with ${METRICS_SHA}`);
    } else console.log(`(no meta.json in ${FROM}: the roster and the scenarios cannot be vouched for, so the gate cannot be met)`);
    PEOPLE = PEOPLE === 'meta' ? (meta ? meta.people : fs.readdirSync(FROM).filter((f) => /_steady_/.test(f)).map((f) => f.replace(/_steady_.*$/, '')).filter((x, i, a) => a.indexOf(x) === i)) : PEOPLE.split(',');
  } else {
    if (!BASE) { const port = 8330 + Math.floor(Math.random() * 60); server = spawn('python3', ['-m', 'http.server', String(port), '--directory', root], { stdio: 'ignore' }); BASE = `http://localhost:${port}`; await new Promise((r) => setTimeout(r, 1200)); }
    const { chromium } = require('playwright');
    browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    page = await browser.newPage({ viewport: { width: 300, height: 400 } });
    page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
    await page.goto(`${BASE}/glasgow-subway/tools/people_motion.html?gait=${GAIT}&detail=${DETAIL}`);
    await page.waitForFunction('window.__ready', null, { timeout: 300000 });
    const err = await page.evaluate('window.__err'); if (err) throw new Error('load: ' + err);
    ids = await page.evaluate('window.__ids');
    PEOPLE = PEOPLE === 'all' ? ids : PEOPLE === 'default' ? DEFAULT_PEOPLE.filter((p) => ids.includes(p)) : PEOPLE.split(',');
    if (recDir) fs.mkdirSync(recDir, { recursive: true });
  }
  // the whole roster, every scenario at every speed: the only run the gate can be met on
  const rosterAll = !!(ids && PEOPLE.length === ids.length && ids.every((i) => PEOPLE.includes(i)) && ['steady', 'startstop', 'turn', 'spin'].every((s) => SCENS.includes(s)) && SPEEDS.join() === M.SPEEDS.join() && (!FROM || (meta && meta.rosterAll)));
  const meshErrors = {}; let meshSeen = 0, meshMissing = 0;
  const record = async (id, spec, tag) => {
    let raw;
    if (FROM) raw = JSON.parse(fs.readFileSync(path.join(FROM, `${id}_${tag}.json`), 'utf8'));
    else { raw = await page.evaluate((s) => window.__run(s), { id, plan: spec.plan, seed: SEED, mesh: !NO_MESH }); if (recDir) fs.writeFileSync(path.join(recDir, `${id}_${tag}.json`), JSON.stringify(raw)); }
    if (raw.shoeError) meshErrors[id] = raw.shoeError;
    if (raw.shoeY) meshSeen++; else meshMissing++;
    return new M.Rec(raw);
  };
  const results = { steady: {}, trans: {}, gait: GAIT, people: PEOPLE, speeds: SPEEDS, rosterAll }, t0 = Date.now();
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
  console.log(` ${PEOPLE.length} people ${FROM ? 're-scored' : 'recorded'} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  // the rendered-shoe channel must exist for everybody, and must have been found on the shoes (tools/people_motion.html checks that): otherwise the floor is the gait's own landmarks
  results.meshOk = !NO_MESH && meshMissing === 0 && Object.keys(meshErrors).length === 0;
  for (const [id, e] of Object.entries(meshErrors)) console.log(`SHOE CHANNEL ERROR ${id}: ${e}`);
  if (meshMissing && !Object.keys(meshErrors).length) console.log(`(${meshMissing} of ${meshSeen + meshMissing} recordings carry no rendered-shoe channel: the floor is judged on the landmarks there)`);
  if (recDir && !FROM) fs.writeFileSync(path.join(recDir, 'meta.json'), JSON.stringify({ people: PEOPLE, ids, gait: GAIT, detail: DETAIL, seed: SEED, mesh: !NO_MESH, speeds: SPEEDS, scens: SCENS, rosterAll, meshOk: results.meshOk, scenSha: SCEN_SHA, metricsSha: METRICS_SHA, date: new Date().toISOString().slice(0, 19) + 'Z' }, null, 1));
  if (!SCENS.includes('steady')) { console.log('(steady walks not run: no scores)'); }
  else {
    const S = M.scoreAll(results), f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : ' n/a'), f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
    console.log(`\npeople-motion rubric   gait: ${GAIT}${DETAIL === '1' ? ' (LOD1 models)' : ''}   people: ${PEOPLE.length}${rosterAll ? ' (the whole roster)' : ` of ${ids ? ids.length : '?'}`}   speeds: ${SPEEDS.join(', ')}   floor: ${results.meshOk ? 'rendered shoe' : 'LANDMARKS (not the rendered shoe)'}   instrument: motion_metrics.mjs ${METRICS_SHA}`);
    console.log('category'.padEnd(10) + 'name'.padEnd(36) + 'weight'.padStart(7) + 'score'.padStart(8) + 'p10'.padStart(7));
    for (const c of Object.keys(M.CATS)) console.log(c.padEnd(10) + M.CAT_NAMES[c].padEnd(36) + String(M.CATS[c]).padStart(7) + f1(S.cats[c]).padStart(8) + f1(S.p10[c]).padStart(7) + (S.cats[c] < 8 ? '   <-- mean below 8' : S.p10[c] < 8 ? '   <-- tenth percentile below 8' : ''));
    console.log('OVERALL'.padEnd(46) + '100'.padStart(7) + f2(S.overall).padStart(8) + `   worst recording: ${S.worst ? `${S.worst.person} @ ${S.worst.v} m/s = ${f1(S.worst.score)}` : 'n/a'}`);
    console.log('DISCRIMINATING (GRD, TIM, LEG, SMO, TRN)'.padEnd(46) + ' 55'.padStart(7) + f2(S.disc).padStart(8) + '   the categories whose targets are not the gait\'s own design numbers');
    const sh = M.basisShares(); console.log('what the bands rest on (points of 100): ' + M.BASIS.map((b) => `${b} ${sh[b].toFixed(0)}`).join(', ') + '   [pub = published numbers, derived = from a published relation, text = textbook norm, phys = physics, judge = the author\'s judgement]');
    console.log(`GATE (overall > 9, 55 points > 9, every category and every category p10 >= 8, no recording < 8, whole roster, floor on the rendered shoe): ${S.gate ? 'PASS' : 'NOT MET'}`);
    for (const w of S.why) console.log('   - ' + w);
    // the per-item picture: mean value and score over every recording the item is judged on
    const acc = {}; for (const r of S.rows) for (const i of r.items) { const a = (acc[i.id] = acc[i.id] || { i, v: [], s: [] }); a.v.push(i.value); a.s.push(i.score); }
    for (const p of Object.keys(S.trn)) for (const i of S.trn[p].items) { const a = (acc[i.id] = acc[i.id] || { i, v: [], s: [] }); a.v.push(i.value); a.s.push(i.score); }
    for (const i of S.rng.items) acc[i.id] = { i, v: [i.value], s: [i.score] };
    const mean = (a) => { const b = a.filter(Number.isFinite); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : NaN; };
    const srcOf = (id) => [...M.ITEMS, ...M.TRN_ITEMS, ...M.RNG_ITEMS].find((x) => x.id === id).src;
    if (flag('--items')) { console.log('\nitem'.padEnd(13) + 'w'.padStart(4) + '  measured'.padEnd(64) + 'mean'.padStart(10) + 'score'.padStart(7) + '  basis'); for (const a of Object.values(acc)) console.log(a.i.id.padEnd(12) + String(a.i.w).padStart(4) + ('  ' + a.i.label + ' (' + a.i.unit + ')').padEnd(64).slice(0, 64) + (Number.isFinite(mean(a.v)) ? mean(a.v).toPrecision(3) : 'n/a').padStart(10) + f1(mean(a.s)).padStart(7) + '  ' + srcOf(a.i.id)); }
    // each person at each speed: the headline numbers
    console.log('\nperson'.padEnd(21) + 'v'.padStart(5) + 'cad'.padStart(6) + '(exp)'.padStart(7) + 'step'.padStart(6) + '(exp)'.padStart(7) + 'slip'.padStart(6) + 'hip'.padStart(6) + 'knee'.padStart(6) + 'bob'.padStart(6) + 'arm'.padStart(6) + 'score'.padStart(7));
    for (const r of S.rows) { const a = r.a; if (!a.ok) { console.log(r.person.padEnd(20) + String(r.v).padStart(5) + '  ' + a.reason); continue; } const sc = S.per.find((x) => x.person === r.person && x.v === r.v);
      console.log(r.person.padEnd(20) + a.v.toFixed(2).padStart(6) + a.cadence.toFixed(0).padStart(6) + ('(' + a.ex.cadence.toFixed(0) + ')').padStart(7) + a.stepLen.toFixed(2).padStart(6) + ('(' + a.ex.stepLen.toFixed(2) + ')').padStart(7) + a.slip.toFixed(1).padStart(6) + a.hip.range.toFixed(0).padStart(6) + a.knee.swing.toFixed(0).padStart(6) + a.pelvis.bobPP.toFixed(0).padStart(6) + a.arm.range.toFixed(0).padStart(6) + f1(sc.score).padStart(7)); }
    if (WORST) for (const w of S.per.slice().sort((a, b) => a.score - b.score).slice(0, WORST)) { const r = S.rows.find((x) => x.person === w.person && x.v === w.v); console.log(`\n-- ${w.person} @ ${w.v} m/s: ${f1(w.score)}`); for (const i of r.items) if (i.score < 8) console.log('   ' + i.id.padEnd(12) + i.label.padEnd(58) + (Number.isFinite(i.value) ? i.value.toPrecision(3) : 'n/a').padStart(9) + ' ' + i.unit.padEnd(10) + f1(i.score).padStart(6)); }
    const j = arg('--json', null); if (j) { fs.writeFileSync(j, JSON.stringify({ results, cats: S.cats, p10: S.p10, overall: S.overall, disc: S.disc, per: S.per, gate: S.gate, why: S.why, rng: S.rng, trn: S.trn, instrument: METRICS_SHA, scenarios: SCEN_SHA })); console.log('wrote', j); }
  }
  const filmDir = arg('--film', null);
  if (filmDir && FROM) console.log('(--film needs the browser: not available with --from)');
  else if (filmDir) { fs.mkdirSync(filmDir, { recursive: true }); for (const id of PEOPLE) for (const view of ['side', 'front', 'top']) { const url = await page.evaluate((s) => window.__film(s), { id, v: 1.2, frames: 8, span: 1.0, view, seed: SEED }); fs.writeFileSync(path.join(filmDir, `${id}_${view}.png`), Buffer.from(url.split(',')[1], 'base64')); } console.log('filmstrips in', filmDir); }
} catch (e) { console.error(e); exit = 1; }
finally { if (browser) await browser.close(); if (server) server.kill(); }
process.exit(exit);
