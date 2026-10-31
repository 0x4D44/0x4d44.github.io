// The way to the places outside the court's chain-link: the spectators' benches (behind the north bank and beyond both end lines) and the two fence leans on the north bank. Pure data (runs under Node).
//
// buildNav gives the court a grid inside its fence and joins it to the street only where the fence has gaps (dress.js `exitsOf`: the fence opens wherever a nav edge crosses the court's polygon), the
// south side. places.js then put five places outside it and nobody could walk to them: a walker goes over the graph to the node nearest the place and straight on, into the fence (people/spots.js
// `screen` cuts such a place now). `linkCourtSide` adds the way: a strip of 'path' nodes round the OUTSIDE of the fence, laid in the court's own frame so a court of any heading gets the same strip.
//   - a node FRONT m in front of each end bench: the middle of the free strip between its end-caps and the fence. The seat is reached straight ahead, between the caps (the cap supports stand 0.8 m
//     either side of the seat's middle: a node beside the bench would send the walker into one, the snag brain.js `waypoints` names);
//   - a node BACK m behind the north bench, which stands 1.05 m from the fence (no room for a walker's way in from the front), and one BACK m behind each lean (a lean leans on the fence from the open
//     side, the north);
//   - the strip runs from the street along the south side of the court, up the west side (the west bench's node is on it), round the north-west corner and east behind the leans and the bench; the east
//     bench has its own strip up the east side, from the street too.
// The strip never goes through the fence. A way through it (a gate beside the court's corner nodes, 0.9 m inside the fence) fails the people sim: `waypoints` keeps a walker to the right of an edge by a
// lane of up to 1.1 m, which at those nodes swings the next point of a walker leaving the court out to the fence line, and the leg to the node after it grazes the fence's end: the walker slides along the
// face and stands behind it with his next point on the other side (n69 in A4's soak: four seconds, three times). So the strip leaves the street (the nearest node of the plan outside the fence, as the
// ways into the plazas do) and the people walk round the fence to a bench as they would in the street. The nodes are 0.7 m wide (`w`): people/sim.js `waypoints` offsets a walker by min(lane, w - 0.9),
// none, because the strip is no wider than a lane.
// Every leg is proven with the kernel buildNav uses (terrain + the buildings as solid blocks), stays clear of the buildings and keeps GAP m off the fence. A leg that fails stops its route there: the
// nodes laid so far stay (they are joined to the graph) and `plan.warnings` names the places left without one.
import { Physics, wallsRect } from '../core/physics.js';
import { walkable } from './nav.js';
import { footprint, pointInPoly } from './geom.js';

export const FRONT = 1.125;     // m in front of an end bench's seat: the middle of the free strip between its end-caps and the fence (1.33 m wide for a walker's centre)
export const BACK = 1.5;        // m behind the north bench and the leans
export const GAP = 0.9;         // the least a strip node or leg stands from the fence
const STEP = 4.5;               // the longest leg of the strip: a path-path edge may not pass 5.2 m (tests/world-lib.mjs navErrors)
const SOUTH = 1.5;              // m south of the fence the strip rounds the court's south corners
const JOIN = 14;                // the farthest a node of the plan may be for a route to leave it
const MERGE = 0.45;             // a node within this of another is that node (nav.js addNode)
const WIDTH = 0.7;              // `w` of a strip node

/**
 * The court's chain-link outline in its own frame (x along the width, z along the depth, z > 0 south): { xw, xe, zn, zs, cutN }. dress.js court() builds the fence on it. A cut bank on the north (the ground
 * 2.4 m outside the court is more than 0.4 m higher than its edge) puts the north run on top of the retaining wall, beyond the plaza band.
 */
export function courtFence(plan, pl, band) {
  const hw = pl.w / 2, hd = pl.d / 2, H = plan.heightAt, c = Math.cos(pl.ry), s = Math.sin(pl.ry);
  const north = (d) => H(pl.cx - s * d, pl.cz - c * d);                                                          // the ground d m from the centre towards the court's north (local -z)
  const cutN = north(hd + 2.4) - north(hd - 0.2) > 0.4;
  return { xw: -(hw - 0.3), xe: hw - 0.3, zn: cutN ? -(hd + band + 0.15) : -(hd - 0.3), zs: hd - 0.3, cutN };
}

/**
 * Lay the strip round the outside of the court's fence and join it to the street. Appends to plan.nav (ids go on from the last node). Returns { nodes: [the nodes added], edges: [[a, b]...],
 * by: { poiId: nodeId } }, the node each place is reached from. A plan with no court, or no place outside its fence, is left as it was.
 */
export function linkCourtSide(plan, band) {
  const out = { nodes: [], edges: [], by: {} };
  const pl = plan.plazas?.find((p) => p.kind === 'court');
  if (!pl || !plan.nav?.nodes?.length) return out;
  const f = courtFence(plan, pl, band), c = Math.cos(pl.ry), s = Math.sin(pl.ry);
  const P = (lx, lz) => [pl.cx + lx * c + lz * s, pl.cz - lx * s + lz * c], L = (x, z) => [(x - pl.cx) * c - (z - pl.cz) * s, (x - pl.cx) * s + (z - pl.cz) * c];
  const beyond = (x, z) => { const [lx, lz] = L(x, z); return lx < f.xw - GAP || lx > f.xe + GAP || lz < f.zn - GAP || lz > f.zs + GAP; };       // clear of the fence, whichever side

  // ---- the places outside the fence, each with the point (local frame) it is reached from
  const west = [], east = [], north = [];
  for (const p of plan.pois ?? []) {
    const seat = p.kind === 'bench' && p.tags?.includes('court-side'), lean = p.kind === 'lean' && p.tags?.includes('fence');
    if (!seat && !lean) continue;
    const [lx, lz] = L(p.x, p.z), fy = (p.ry ?? 0) - pl.ry, ux = Math.sin(fy), uz = Math.cos(fy);               // (ux, uz): the way the seat faces, in the local frame
    if (seat && lx < f.xw) west.push({ id: p.id, lx: lx + FRONT * ux, lz: lz + FRONT * uz });
    else if (seat && lx > f.xe) east.push({ id: p.id, lx: lx + FRONT * ux, lz: lz + FRONT * uz });
    else if (lz < f.zn) north.push({ id: p.id, lx: seat ? lx - BACK * ux : lx, lz: seat ? lz - BACK * uz : lz - BACK });
  }
  if (!west.length && !east.length && !north.length) return out;

  // ---- the kernel buildNav proves its edges with: terrain + the buildings as solid blocks
  const H = plan.heightAt, phys = new Physics();
  phys.setTerrain(H);
  for (const l of plan.lots ?? []) phys.addWalls(wallsRect(l.x, l.z, l.w, l.d, l.rotY, l.y - 0.3, l.y + 30, 0.06));
  const fps = (plan.lots ?? []).map((l) => footprint(l, 0.45)), nodes = plan.nav.nodes, edges = plan.nav.edges, old = nodes.slice();
  const at = (lx, lz) => { const [x, z] = P(lx, lz); return { x: +x.toFixed(2), y: +H(x, z).toFixed(2), z: +z.toFixed(2) }; };
  const clear = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.75));
    for (let i = 0; i <= n; i++) { const x = a.x + ((b.x - a.x) * i) / n, z = a.z + ((b.z - a.z) * i) / n; if (fps.some((q) => pointInPoly(q, x, z)) || !beyond(x, z)) return false; }
    return true;
  };
  const fits = (a, b) => clear(a, b) && walkable(phys, a, b) && walkable(phys, b, a);
  /** The node at a point of the local frame, joined to `prev`: a node of the plan within MERGE of it, else a new one. Null when the leg does not fit. */
  const lay = (prev, lx, lz) => {
    const q = at(lx, lz), dup = nodes.find((n) => Math.hypot(n.x - q.x, n.z - q.z) < MERGE);
    if (dup === prev) return prev;
    const n = dup ?? { id: 'n' + nodes.length, ...q, kind: 'path', w: WIDTH, side: 'court' };
    if (!fits(prev, n)) return null;
    if (!dup) { nodes.push(n); out.nodes.push(n); }
    if (!edges.some(([a, b]) => (a === prev.id && b === n.id) || (a === n.id && b === prev.id))) { edges.push([prev.id, n.id]); out.edges.push([prev.id, n.id]); }
    return n;
  };
  /** The nodes the plan had that a route may leave from for a first point of the local frame: not a door, a stair or a court node, outside the fence, within JOIN of it, the nearest first. */
  const anchors = (lx, lz) => {
    const q = at(lx, lz), d = (n) => Math.hypot(n.x - q.x, n.z - q.z);
    return old.filter((n) => n.kind !== 'door' && n.kind !== 'stair' && n.kind !== 'court' && beyond(n.x, n.z) && d(n) <= JOIN).sort((a, b) => d(a) - d(b));
  };
  /** Lay the legs of the straight line from point `a` to point `v` (local frame), each at most STEP, from the node `prev`. Returns [the node at `v`, null] or [null, why]. */
  const legs = (prev, a, v) => {
    const parts = Math.max(1, Math.ceil(Math.hypot(v.lx - a.lx, v.lz - a.lz) / STEP));
    for (let i = 1; i <= parts; i++) {
      const lx = a.lx + ((v.lx - a.lx) * i) / parts, lz = a.lz + ((v.lz - a.lz) * i) / parts, n = lay(prev, lx, lz);
      if (!n) { const t = at(lx, lz); return [null, `the leg from ${prev.id} to (${t.x}, ${t.z}) is blocked`]; }
      prev = n;
    }
    return [prev, null];
  };

  /**
   * Lay a route of vertices { lx, lz, ids }: the first is reached from the nearest node of the plan a straight line fits to, the others follow, each leg cut into pieces of at most STEP; `ids` are the
   * places a vertex serves. Returns the places it could not reach, and why.
   */
  const route = (verts) => {
    const left = verts.flatMap((v) => v.ids ?? []), serve = (n, v) => { for (const id of v.ids ?? []) { out.by[id] = n.id; left.splice(left.indexOf(id), 1); } };
    const q0 = at(verts[0].lx, verts[0].lz);
    let why = `no node of the plan within ${JOIN} m of (${q0.x}, ${q0.z}) to join`;
    for (const anchor of anchors(verts[0].lx, verts[0].lz)) {
      const mark = [nodes.length, edges.length, out.nodes.length, out.edges.length], [ax, az] = L(anchor.x, anchor.z);
      let [prev, fail] = legs(anchor, { lx: ax, lz: az }, verts[0]);
      if (!prev) { nodes.length = mark[0]; edges.length = mark[1]; out.nodes.length = mark[2]; out.edges.length = mark[3]; why = fail; continue; }       // not from this one: take its legs back
      serve(prev, verts[0]);
      for (let k = 1; k < verts.length; k++) {
        [prev, fail] = legs(prev, verts[k - 1], verts[k]);
        if (!prev) return { left, why: fail };
        serve(prev, verts[k]);
      }
      return { left, why: null };
    }
    return { left, why };
  };

  // ---- the west route: from the street round the south-west corner, up the west side, round the north-west corner, east behind the bank; the east route: from the street up the east side
  const xW = west.length ? west[0].lx : f.xw - GAP - 0.075, xE = east.length ? east[0].lx : f.xe + GAP + 0.075, skipped = [];
  let why = null;
  const run = (verts) => { const r = route(verts); skipped.push(...r.left); why ??= r.why; };
  if (west.length || north.length) {
    north.sort((a, b) => a.lx - b.lx);
    const verts = [{ lx: xW, lz: f.zs + SOUTH }, ...west.map((w) => ({ lx: w.lx, lz: w.lz, ids: [w.id] }))];
    if (north.length) verts.push({ lx: xW, lz: Math.min(...north.map((n) => n.lz)) }, ...north.map((n) => ({ lx: n.lx, lz: n.lz, ids: [n.id] })));
    run(verts);
  }
  if (east.length) run([{ lx: xE, lz: f.zs + SOUTH }, ...east.map((e) => ({ lx: e.lx, lz: e.lz, ids: [e.id] }))]);
  if (skipped.length) plan.warnings?.push(`court-side: the strip stops, ${why}; no node for ${skipped.join(' ')}`);
  return out;
}
