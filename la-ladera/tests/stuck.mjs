// Whole-world stuck-spot and reachability probe (lead tool). Real physics kernel, plain Node, no browser.
//
//   node --import ./la-ladera/tests/register.mjs la-ladera/tests/stuck.mjs [--cell 0.3] [--region x0,z0,x1,z1]
//        [--lots L00,L01] [--seed N] [--json out.json] [--max 12] [--arcs 0] [--world 0] [--coast 1 --hi 225]
//   --coast 1 opens the beach's south gate (as the page does once the beach is built) and --hi 225 lets the lattice reach the sea (the square is [lo, hi], lo -100): sweep the beach with
//   --coast 1 --hi 225 --region -100,88,100,225 (the region keeps the spawn inside it)
//   --arcs 0 drops the real jump-arc moves (default on: the player jumps at walk or sprint speed). With arcs the "missing" list is trustworthy
//   (36 -> 0 on the 15:30 tree: a 0.3 m-wide stair corridor is hard to follow on a lattice) but the trap list is noisy: verify it with
//   tests/trapcheck.mjs (the real controller walks out of 120 of 158 "traps").
//   The physics is built the way the page builds it, WORLD INCLUDED (buildData({ world: true }): the retaining 'guard' walls along the street edges,
//   the perimeter, every prop collider). Without them (--world 0) the sweep "falls" off street edges the guard walls really close and lists 0.3 m
//   slots that nobody can reach (trapcheck then teleports into one, a spot the page's walls cover, and reports STUCK: a tool artefact), and it cannot
//   see a trap a prop makes (a parked moto's 0.62 m outline once held a walker for good). The JSON records `world` so trapcheck can say which it got.
//
// Exit code 1 when the world has traps (reachable but no way back), walk-off-the-map edges, or required places
// (entrances, room centres, POIs, nav nodes, anchors) the player cannot reach and return from. See stuck-lib.mjs.
import { writeFileSync } from 'node:fs';
import { buildData } from './headless.mjs';
import { analyze, brief } from './stuck-lib.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const lots = opt('lots', null)?.split(',');
const seed = opt('seed', null), world = opt('world', '1') !== '0', coast = opt('coast', '0') === '1';
const { ctx, plan, buildings } = await buildData({ seed: seed == null ? undefined : +seed, lots, world, coast });
const t0 = Date.now();
const r = analyze({
  physics: ctx.physics, spawn: plan.spawn, plan, buildings, anchors: ctx.anchors,
  cell: +opt('cell', 0.3), lo: +opt('lo', -100), hi: +opt('hi', 100), region: opt('region', null)?.split(',').map(Number), maxList: +opt('max', 12), arcs: opt('arcs', '1') !== '0',
  log: (m) => console.error(m),
});
r.world = world;
if (opt('json', null)) writeFileSync(opt('json'), JSON.stringify(r, null, 1));
console.log(JSON.stringify({ ...brief(r), seconds: +((Date.now() - t0) / 1000).toFixed(1) }, null, 2));
process.exit(r.trapNodes || r.boundaryClusters || r.missingCount ? 1 : 0);
