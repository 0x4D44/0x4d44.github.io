// Prop-aware pedestrian graph. plan.nav was proven walkable against terrain + lot blocks; the props arrived later (a vendor's cart, a corner planter,
// a bench end-cap, a pole on a plaza lattice line). Every edge that passes near a prop collider is walked again with the real kernel, and one a
// pedestrian cannot walk is dropped unless that would split the graph. Only EDGES go: people and POIs hold node ids, so nodes stay.
import { Physics, wallsRect } from '../core/physics.js';
import { walkable } from './nav.js';
import { HALF } from './field.js';

const CELL = 4, NEAR = 0.95;                                    // bucket size; an edge is a candidate when a prop collider lies within NEAR m of it
const cellKey = (x, z) => (Math.floor(x / CELL) + 64) * 256 + (Math.floor(z / CELL) + 64);

function distToWall(w, x, z) {
  const dx = w.x2 - w.x1, dz = w.z2 - w.z1, l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / l2)) : 0;
  return Math.hypot(x - (w.x1 + t * dx), z - (w.z1 + t * dz)) - (w.t ?? 0) / 2;
}

/**
 * Drop the nav edges nobody can walk. Returns { checked, candidates, dropped: [[a, b]], stranded: [[a, b]], outside: [[a, b]] }:
 * dropped = a prop blocks it and the graph stays whole; stranded = blocked but the only link, kept (a defect: the tests report it);
 * outside = an end lies beyond the perimeter wall (the road that leaves the plot), where nobody can stand: dropped, the inner end stays a dead end.
 */
export function fitNav(ctx) {
  const plan = ctx.plan, nav = plan?.nav, out = { checked: 0, candidates: 0, dropped: [], stranded: [], outside: [] };
  if (!nav?.edges?.length || !ctx.physics?.walls) return out;
  const byId = new Map(nav.nodes.map((n) => [n.id, n])), lim = HALF - 0.6;           // beyond the perimeter wall nothing can be walked
  const solid = ctx.physics.walls.filter((w) => w.id === 'prop' || w.id === 'guard');
  const props = solid.filter((w) => w.id === 'prop');
  if (!props.length) return out;

  // bucket the prop colliders so that an edge only looks at its neighbourhood
  const cells = new Map();
  for (const w of props) {
    const m = NEAR + (w.t ?? 0) / 2;
    const i0 = Math.floor((Math.min(w.x1, w.x2) - m) / CELL), i1 = Math.floor((Math.max(w.x1, w.x2) + m) / CELL);
    const j0 = Math.floor((Math.min(w.z1, w.z2) - m) / CELL), j1 = Math.floor((Math.max(w.z1, w.z2) + m) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = (i + 64) * 256 + (j + 64); (cells.get(k) ?? cells.set(k, []).get(k)).push(w); }
  }
  const touchesProp = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
    for (let s = 0; s <= n; s++) {
      const x = a.x + ((b.x - a.x) * s) / n, z = a.z + ((b.z - a.z) * s) / n;
      for (const w of cells.get(cellKey(x, z)) ?? []) if (distToWall(w, x, z) < NEAR) return true;
    }
    return false;
  };

  // the same kernel the plan used (terrain + lot blocks), plus everything the world and the props built
  const ph = new Physics();
  ph.setTerrain(plan.heightAt);
  for (const l of plan.lots) ph.addWalls(wallsRect(l.x, l.z, l.w, l.d, l.rotY, l.y - 0.3, l.y + 30, 0.06));
  for (const w of solid) ph.addWall(w);

  const adj = new Map(nav.nodes.map((n) => [n.id, new Set()]));
  for (const [a, b] of nav.edges) { adj.get(a)?.add(b); adj.get(b)?.add(a); }
  const reachable = (from, to) => {                                                   // is `to` still reachable from `from` over the edges that remain?
    const seen = new Set([from]), q = [from];
    while (q.length) { const c = q.pop(); if (c === to) return true; for (const d of adj.get(c) ?? []) if (!seen.has(d)) { seen.add(d); q.push(d); } }
    return false;
  };

  for (const [ia, ib] of nav.edges.slice()) {
    const a = byId.get(ia), b = byId.get(ib);
    if (!a || !b) continue;
    if (Math.max(Math.abs(a.x), Math.abs(a.z), Math.abs(b.x), Math.abs(b.z)) > lim) { adj.get(ia).delete(ib); adj.get(ib).delete(ia); out.outside.push([ia, ib]); continue; }
    out.checked++;
    if (!touchesProp(a, b)) continue;
    out.candidates++;
    if (walkable(ph, a, b) && walkable(ph, b, a)) continue;
    adj.get(ia).delete(ib); adj.get(ib).delete(ia);
    if (reachable(ia, ib)) out.dropped.push([ia, ib]);
    else { adj.get(ia).add(ib); adj.get(ib).add(ia); out.stranded.push([ia, ib]); }
  }
  if (out.dropped.length || out.outside.length) {
    const gone = new Set([...out.dropped, ...out.outside].map(([a, b]) => (a < b ? a + '|' + b : b + '|' + a)));
    const kept = nav.edges.filter(([a, b]) => !gone.has(a < b ? a + '|' + b : b + '|' + a));
    nav.edges.splice(0, nav.edges.length, ...kept);                                   // in place: whoever holds plan.nav sees the fitted graph
  }
  return out;
}
