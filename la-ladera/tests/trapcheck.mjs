// Second stage of the stuck probe (lead tool): verify its trap clusters with the REAL player controller in the quiet headless harness.
//
//   node --import ./la-ladera/tests/register.mjs la-ladera/tests/stuck.mjs --cell 0.2 --json .scratch/stuck.json     (about 1 min)
//   node la-ladera/tests/trapcheck.mjs .scratch/stuck.json [out.json]                                              (about 1 min)
//
// stuck.mjs searches a lattice (0.2 m cells, one node per cell and 0.35 m of height), which loses edges on narrow or steep things, so many "traps"
// are lattice artefacts. Here the player is put in each cluster (teleport) and walks away in 12 headings, hopping every other step, with the real
// physics kernel. Verdicts by the best straight-line distance covered:
//   out    > 3 m   the player leaves: a lattice artefact, ignore
//   tight  1-3 m   it moves but is boxed in a small area (a stair flight, a landing, a pocket): INCONCLUSIVE, a straight walk cannot turn corners
//   STUCK  < 1 m   it cannot move at all: a real pocket (a parapet, a planter, furniture or a stair housing closes it); fix or open it
//   misplaced      the teleport put the feet on another surface than the cluster's, so it cannot be judged this way
// Exit code 1 when any cluster is STUCK. Console errors in the page are listed (and also fail the run).
import { readFileSync, writeFileSync } from 'node:fs';
import { launch } from './chrome.mjs';

const traps = JSON.parse(readFileSync(process.argv[2] ?? '.scratch/stuck.json', 'utf8')).traps ?? [];
const outFile = process.argv[3] ?? null;
const b = await launch({ width: 960, height: 540 });
const rows = [];
let pageErrors = 0;
try {
  const p = await b.open('la-ladera/index.html?autostart&manual');
  for (const [k, t] of traps.entries()) {
    const [x, z] = t.at, y = t.y[0];
    const r = JSON.parse(await p.eval(`(() => { const L = __ladera, out = { best: 0, spawn: null };
      for (let h = 0; h < 12; h++) { const yaw = h * Math.PI / 6;
        L.teleport(${x}, ${z}, { yaw, y: ${y} }); L.step(6); const s0 = L.state().pos.slice(); out.spawn ??= s0; L.look(yaw, 0);
        for (let i = 0; i < 8; i++) L.walk(1, 0, 0.35, { jump: i % 2 === 0 });
        const s1 = L.state().pos, d = Math.hypot(s1[0] - s0[0], s1[2] - s0[2]); if (d > out.best) out.best = d; if (out.best > 3) break; }
      return JSON.stringify(out); })()`));
    const misplaced = Math.abs(r.spawn[1] - y) > 0.35;
    rows.push({ k, building: t.building, at: t.at, y, area: t.area_m2, spawn: r.spawn.map((v) => +v.toFixed(2)), best: +r.best.toFixed(2), verdict: misplaced ? 'misplaced' : r.best > 3 ? 'out' : r.best >= 1 ? 'tight' : 'STUCK' });
  }
  const s = p.summary(); pageErrors = s.consoleErrors.length + s.errors.length;
} finally { await b.close(); }
if (outFile) writeFileSync(outFile, JSON.stringify(rows, null, 1));
const by = (v) => rows.filter((r) => r.verdict === v);
console.log(`clusters ${rows.length} | out ${by('out').length} | tight ${by('tight').length} | STUCK ${by('STUCK').length} | misplaced ${by('misplaced').length} | page errors ${pageErrors}`);
const list = (v) => by(v).sort((a, c) => c.area - a.area).map((r) => [r.building ?? 'outdoor', r.at, r.y, r.area, r.best]);
console.log('STUCK  [building, [x, z], y, m2, best m]:', JSON.stringify(list('STUCK')));
console.log('tight  [building, [x, z], y, m2, best m]:', JSON.stringify(list('tight')));
process.exit(by('STUCK').length || pageErrors ? 1 : 0);
