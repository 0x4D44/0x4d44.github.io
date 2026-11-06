// Does the body hop when a person sets off? For the start-and-stop recordings that tools/people_motion.mjs keeps (--rec DIR): how far the placement height of the person (the recorded
// root's y: where the game puts the whole body, p.obj.position.y) rises in the 0.4 s after the walk command, measured from the last frame before it.
//   node tools/people_hop.mjs DIR [DIR ...] [--rows]
//     DIR     a directory of recordings (--rec of a run that included the startstop scenario); one summary line per directory
//     --rows  and one line per person: the rise, the rise in the first frame alone, when the peak is (s after the command), and the lowest height in the next second
//             relative to the height before the command (a negative number: how far the body comes down onto the floor from the idle clip's hover)
// Why: in research/people-motion-rubric.md (round 2, parts 6 and 7) the walk-start latency item was found to be reading a hop of 9-25 mm at the first walking frame. js/sim/people_start.test.mjs
// guards the mechanism; this reads it off real, skinned, recorded people.
import fs from 'fs';
import path from 'path';
import { Rec } from '../js/sim/motion_metrics.mjs';

const args = process.argv.slice(2), ROWS = args.includes('--rows'), dirs = args.filter((a) => !a.startsWith('--'));
if (!dirs.length) { console.error('usage: node tools/people_hop.mjs DIR [DIR ...] [--rows]'); process.exit(2); }
const med = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const WIN = 0.4, LOOK = 1.0;   // s: the window the rise is read over, and the one the lowest point is
for (const dir of dirs) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('_startstop.json')).sort();
  if (!files.length) { console.log(`${dir}: no *_startstop.json recordings`); continue; }
  let detail = '?'; try { detail = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')).detail; } catch (e) { /* no meta.json: the label stays ? */ }
  const rows = [];
  for (const f of files) {
    const rec = new Rec(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))), k0 = rec.seg.findIndex((s) => s === 1);
    if (k0 < 1) throw new Error(`${f}: no walking segment`);
    const y = (k) => rec.root[k * 3 + 1] * 1000, base = y(k0 - 1), kw = k0 + Math.round(WIN / rec.dt), kl = k0 + Math.round(LOOK / rec.dt);
    let kp = k0; for (let k = k0; k < kw; k++) if (y(k) > y(kp)) kp = k;
    let low = 1e9; for (let k = k0; k < Math.min(kl, rec.n); k++) low = Math.min(low, y(k) - base);
    rows.push({ id: f.replace('_startstop.json', ''), rise: y(kp) - base, first: y(k0) - base, tPeak: (kp - k0) * rec.dt, low });
  }
  const r = rows.map((x) => x.rise), f1 = rows.map((x) => x.first), over = (mm) => r.filter((x) => x > mm).length;
  console.log(`${dir} (detail ${detail}, ${rows.length} people): rise in the first ${WIN} s after the command: min ${Math.min(...r).toFixed(1)}, median ${med(r).toFixed(1)}, max ${Math.max(...r).toFixed(1)} mm; ` +
    `in the first frame alone: median ${med(f1).toFixed(1)}, max ${Math.max(...f1).toFixed(1)} mm; people who rise over 5 mm: ${over(5)}, over 10 mm: ${over(10)}, over 20 mm: ${over(20)}; ` +
    `lowest point in the next ${LOOK} s: ${Math.min(...rows.map((x) => x.low)).toFixed(1)} to ${Math.max(...rows.map((x) => x.low)).toFixed(1)} mm`);
  if (ROWS) for (const x of rows) console.log(`  ${x.id.padEnd(18)} rise ${x.rise.toFixed(1).padStart(6)}  first frame ${x.first.toFixed(1).padStart(6)}  peak at ${x.tPeak.toFixed(3)} s  lowest ${x.low.toFixed(1).padStart(6)} mm`);
}
