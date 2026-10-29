// Whole-world stuck-spot and reachability probe (lead tool). Real physics kernel, plain Node, no browser.
//
//   node --import ./la-ladera/tests/register.mjs la-ladera/tests/stuck.mjs [--cell 0.3] [--region x0,z0,x1,z1]
//        [--lots L00,L01] [--seed N] [--json out.json] [--max 12]
//
// Exit code 1 when the world has traps (reachable but no way back), walk-off-the-map edges, or required places
// (entrances, room centres, POIs, nav nodes, anchors) the player cannot reach and return from. See stuck-lib.mjs.
import { writeFileSync } from 'node:fs';
import { buildData } from './headless.mjs';
import { analyze, brief } from './stuck-lib.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const lots = opt('lots', null)?.split(',');
const seed = opt('seed', null);
const { ctx, plan, buildings } = await buildData({ seed: seed == null ? undefined : +seed, lots });
const t0 = Date.now();
const r = analyze({
  physics: ctx.physics, spawn: plan.spawn, plan, buildings, anchors: ctx.anchors,
  cell: +opt('cell', 0.3), region: opt('region', null)?.split(',').map(Number), maxList: +opt('max', 12),
  log: (m) => console.error(m),
});
if (opt('json', null)) writeFileSync(opt('json'), JSON.stringify(r, null, 1));
console.log(JSON.stringify({ ...brief(r), seconds: +((Date.now() - t0) / 1000).toFixed(1) }, null, 2));
process.exit(r.trapNodes || r.boundaryClusters || r.missingCount ? 1 : 0);
