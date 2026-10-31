// Prop-aware pedestrian graph. plan.nav was proven walkable against terrain + lot blocks; the props arrived later (a vendor's cart, a corner planter,
// a bench end-cap, a pole on a plaza lattice line). Every edge that passes near a prop collider is walked again with the real kernel, and one a
// pedestrian cannot walk is dropped unless that would split the graph. Only EDGES go: people and POIs hold node ids, so nodes stay.
// The walls' invisible guard lines exist now too, and people do not walk the line of an edge: each keeps to the right of it, by a lane of up to 1.25 m
// (people/sim.js waypoints). A way into a plaza arrives at a node 1.2 m inside the plaza's edge; where a retaining wall runs along that edge its guard
// line (zone 0.35 m) leaves the lane no room, and everyone who comes in on the wall's side pushes against the end of the line and stalls. The node a way
// in arrives at is therefore moved off the wall, by the shortfall and by no more than NUDGE_MAX (`from` keeps where the plan put it).
// A line ends in a blunt post (the line's 0.1 m plus a walker's 0.25 m round its end), and a way in that passes one closer than SCRAPE has the whole range of lanes walk at it: whoever
// meets the post head-on creeps along it too slowly to count as walking and stands there until the stall check gives up on him. Such a way in is dropped when the graph stays whole.
import { Physics, wallsRect } from '../core/physics.js';
import { walkable } from './nav.js';
import { HALF } from './field.js';
import { pointInPoly, segDist } from './geom.js';

const CELL = 4, NEAR = 0.95;                                    // bucket size; an edge is a candidate when a prop collider lies within NEAR m of it
const LANE_ROOM = 1.8, NUDGE_MAX = 0.6;                         // a way-in node keeps this far from a guard line: its zone (0.1 + 0.25) + the widest lane (1.25) + a hand's width; and moves no farther than this
const SCRAPE = 1.0;                                             // a way in passes the open end of a guard line this close: the narrowest lane (0.55) and the post (0.35) meet at 0.9
const cellKey = (x, z) => (Math.floor(x / CELL) + 64) * 256 + (Math.floor(z / CELL) + 64);
const edgeKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const onLevel = (w, y) => w.y1 > y + 0.3 && w.y0 < y + 1.7;       // a line on another level is not in the walker's way

function closest(w, x, z) {
  const dx = w.x2 - w.x1, dz = w.z2 - w.z1, l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / l2)) : 0;
  return [w.x1 + t * dx, w.z1 + t * dz];
}
function distToWall(w, x, z) { const [cx, cz] = closest(w, x, z); return Math.hypot(x - cx, z - cz) - (w.t ?? 0) / 2; }
const edgeRoom = (poly, x, z) => poly.reduce((m, p, i) => Math.min(m, segDist(x, z, p, poly[(i + 1) % poly.length])), Infinity);     // how far inside the outline (polyDistPoint is 0 there)

/**
 * Move the plaza nodes a way in arrives at (one end on a plaza, the other outside it) off the retaining walls' guard lines: to LANE_ROOM from the nearest one, by at most NUDGE_MAX in
 * all, to a spot that is inside the plaza with its edge behind it, on the same ground, clear of every prop, and where every edge that walked before still walks. Returns [[id, dx, dz]].
 */
function giveLaneRoom(plan, nav, byId, guards, props, ph) {
  const plazas = new Map((plan.plazas ?? []).map((p) => [p.id, p])), entry = new Set(), moved = [];
  for (const [ia, ib] of nav.edges) { const a = byId.get(ia), b = byId.get(ib); if (a && b && !a.area !== !b.area) entry.add(a.area ? a : b); }
  for (const n of entry) {
    const pl = plazas.get(n.area), from = n.from ?? [n.x, n.z];
    if (n.kind !== 'plaza' || !pl) continue;
    let x = n.x, z = n.z;
    for (let pass = 0; pass < 4; pass++) {
      let near = null;
      for (const w of guards) {
        if (!onLevel(w, n.y)) continue;
        const [cx, cz] = closest(w, x, z), d = Math.hypot(x - cx, z - cz);
        if (d < LANE_ROOM && (!near || d < near.d)) near = { d, cx, cz };
      }
      const left = NUDGE_MAX - Math.hypot(x - from[0], z - from[1]);
      if (!near || near.d < 1e-6 || left < 0.02) break;
      const step = Math.min(LANE_ROOM - near.d, left);
      x += ((x - near.cx) / near.d) * step; z += ((z - near.cz) / near.d) * step;
    }
    if (Math.hypot(x - n.x, z - n.z) < 0.05) continue;
    const y = plan.heightAt(x, z);
    if (!pointInPoly(pl.poly, x, z) || edgeRoom(pl.poly, x, z) < 0.9 || Math.abs(y - n.y) > 0.15 || props.some((w) => distToWall(w, x, z) < 0.4)) continue;
    const incident = nav.edges.filter(([ia, ib]) => ia === n.id || ib === n.id).map(([ia, ib]) => [byId.get(ia), byId.get(ib)]);
    const walks = () => incident.map(([a, b]) => walkable(ph, a, b) && walkable(ph, b, a)), was = walks(), at = [n.x, n.z, n.y];
    n.x = +x.toFixed(2); n.z = +z.toFixed(2); n.y = +y.toFixed(2);
    if (walks().some((ok, i) => was[i] && !ok)) { [n.x, n.z, n.y] = at; continue; }      // it would shut an edge that walked: stay where the plan put it
    n.from = from; moved.push([n.id, +(n.x - from[0]).toFixed(2), +(n.z - from[1]).toFixed(2)]);
  }
  return moved;
}

/** Is `to` reachable from `from` over the edges of the adjacency map `adj` (id -> Set of ids)? */
function connected(adj, from, to) {
  const seen = new Set([from]), q = [from];
  while (q.length) { const c = q.pop(); if (c === to) return true; for (const d of adj.get(c) ?? []) if (!seen.has(d)) { seen.add(d); q.push(d); } }
  return false;
}

/** The open ends of the guard lines: a point no other line starts or stops at (the joints of a chain of segments share their coordinates, and are no ends). */
function guardEnds(guards) {
  const key = (x, z) => Math.round(x * 100) + ',' + Math.round(z * 100), count = new Map(), ends = [];
  for (const w of guards) for (const [x, z] of [[w.x1, w.z1], [w.x2, w.z2]]) count.set(key(x, z), (count.get(key(x, z)) ?? 0) + 1);
  for (const w of guards) for (const [x, z] of [[w.x1, w.z1], [w.x2, w.z2]]) if (count.get(key(x, z)) === 1) ends.push({ x, z, w });
  return ends;
}

/**
 * Drop the ways into a plaza that pass the open end of a guard line closer than SCRAPE (on the plaza node's level), when the graph stays whole. The worst goes first, so where two ways into
 * one node both scrape, the one that scrapes less stays. At the Plazoleta de los Almendros the leg n247-n424 ends 0.9 m from the north end of the terrace's wall and 8 of the 15 lanes stalled on it
 * (A4's soak: 61 % of all unstick events), while its neighbour n246-n424, 1.5 m from the same end, walks clean at every lane and takes the traffic. Returns [[a, b]]; nav.edges loses them.
 */
function dropScraped(nav, byId, guards) {
  const ends = guardEnds(guards), found = [], gone = [], adj = new Map(nav.nodes.map((n) => [n.id, new Set()]));
  for (const [a, b] of nav.edges) { adj.get(a)?.add(b); adj.get(b)?.add(a); }
  for (const [ia, ib] of nav.edges) {
    const a = byId.get(ia), b = byId.get(ib);
    if (!a || !b || !a.area === !b.area) continue;                                      // not a way into a plaza
    const inner = a.area ? a : b;
    let d = Infinity;
    for (const e of ends) if (onLevel(e.w, inner.y)) d = Math.min(d, segDist(e.x, e.z, [a.x, a.z], [b.x, b.z]));
    if (d < SCRAPE) found.push({ ia, ib, d });
  }
  for (const { ia, ib } of found.sort((p, q) => p.d - q.d)) {
    adj.get(ia).delete(ib); adj.get(ib).delete(ia);
    if (connected(adj, ia, ib)) gone.push([ia, ib]);
    else { adj.get(ia).add(ib); adj.get(ib).add(ia); }                                  // the only way: it stays
  }
  if (gone.length) {
    const cut = new Set(gone.map(([a, b]) => edgeKey(a, b)));
    nav.edges.splice(0, nav.edges.length, ...nav.edges.filter(([a, b]) => !cut.has(edgeKey(a, b))));
  }
  return gone;
}

/**
 * Drop the nav edges nobody can walk. Returns { checked, candidates, dropped: [[a, b]], stranded: [[a, b]], outside: [[a, b]], moved: [[id, dx, dz]], scraped: [[a, b]] }:
 * dropped = a prop blocks it and the graph stays whole; stranded = blocked but the only link, kept (a defect: the tests report it);
 * outside = an end lies beyond the perimeter wall (the road that leaves the plot), where nobody can stand: dropped, the inner end stays a dead end;
 * moved = a plaza node a way in arrives at, taken off a retaining wall's guard line (giveLaneRoom);
 * scraped = a way in that runs into the open end of a guard line, dropped (dropScraped).
 */
export function fitNav(ctx) {
  const plan = ctx.plan, nav = plan?.nav, out = { checked: 0, candidates: 0, dropped: [], stranded: [], outside: [], moved: [], scraped: [] };
  if (!nav?.edges?.length || !ctx.physics?.walls) return out;
  const byId = new Map(nav.nodes.map((n) => [n.id, n])), lim = HALF - 0.6;           // beyond the perimeter wall nothing can be walked
  const solid = ctx.physics.walls.filter((w) => w.id === 'prop' || w.id === 'guard');
  const props = solid.filter((w) => w.id === 'prop'), guards = solid.filter((w) => w.id === 'guard');

  // the same kernel the plan used (terrain + lot blocks), plus everything the world and the props built
  const ph = new Physics();
  ph.setTerrain(plan.heightAt);
  for (const l of plan.lots) ph.addWalls(wallsRect(l.x, l.z, l.w, l.d, l.rotY, l.y - 0.3, l.y + 30, 0.06));
  for (const w of solid) ph.addWall(w);

  out.moved = giveLaneRoom(plan, nav, byId, guards, props, ph);                      // before the edges are walked: they are walked where the nodes are now
  out.scraped = dropScraped(nav, byId, guards);
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

  const adj = new Map(nav.nodes.map((n) => [n.id, new Set()]));
  for (const [a, b] of nav.edges) { adj.get(a)?.add(b); adj.get(b)?.add(a); }
  const reachable = (from, to) => connected(adj, from, to);                           // is `to` still reachable from `from` over the edges that remain?

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
    const gone = new Set([...out.dropped, ...out.outside].map(([a, b]) => edgeKey(a, b)));
    const kept = nav.edges.filter(([a, b]) => !gone.has(edgeKey(a, b)));
    nav.edges.splice(0, nav.edges.length, ...kept);                                   // in place: whoever holds plan.nav sees the fitted graph
  }
  return out;
}
