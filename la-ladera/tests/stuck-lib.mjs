// Whole-world stuck-spot and reachability analysis over the REAL physics kernel (pure; runs under plain Node).
// CLI wrapper: stuck.mjs. Fixture tests: stuck.test.mjs.
//
// Breadth-first search of the DIRECTED graph of moves the player can really make from the spawn: 8 walking directions,
// stepping up, dropping off ledges, and a hop (start 0.6 m above the surface) that clears low walls. Every edge is one
// `physics.move` call, so the kernel decides. Doors are treated as openable (E toggles them).
// Nodes keep their REAL position (never snapped to a grid centre, which would invent standing places inside walls);
// the grid only de-duplicates: one node per (cell, quantised height).
// A backward search from the spawn over the same edges then finds:
//   traps    reachable from the spawn but with no way back (pit, walled terrace, one-way drop ...)
//   boundary reachable positions within 1 m of the plot edge (the player can walk off the map)
//   missing  required places (entrances, rooms, roofs, POIs, nav nodes, anchors) with no spawn-reachable AND return-capable node
const R2 = Math.SQRT1_2;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [R2, R2], [R2, -R2], [-R2, R2], [-R2, -R2]];

export function analyze(o) {
  const { physics: P, spawn, plan = {}, buildings = [], anchors = [] } = o;
  const CELL = o.cell ?? 0.3, LO = o.lo ?? -100, HI = o.hi ?? 100, MAXLIST = o.maxList ?? 12, log = o.log ?? (() => {});
  const N = Math.ceil((HI - LO) / CELL) + 1;
  const [X0, Z0, X1, Z1] = o.region ?? [LO, LO, HI, HI];
  for (const id of [...P.doors.keys()]) P.setDoor(id, true);

  const ci = (v) => Math.round((v - LO) / CELL);
  const nodeOf = new Map(), cellNodes = new Map(), nx = [], ny = [], nz = [], efrom = [], eto = [], queue = [];
  const addNode = (x, y, z) => {
    const i = ci(x), j = ci(z);
    if (i < 0 || j < 0 || i >= N || j >= N) return -1;
    const key = (j * N + i) * 128 + Math.max(0, Math.min(127, Math.round((y + 4) / 0.35)));
    let id = nodeOf.get(key);
    if (id === undefined) {
      id = nx.length; nodeOf.set(key, id); nx.push(x); ny.push(y); nz.push(z); queue.push(id);
      const ck = j * N + i; (cellNodes.get(ck) ?? cellNodes.set(ck, []).get(ck)).push(id);
    }
    return id;
  };

  const spawnId = addNode(spawn.x, P.groundAt(spawn.x, spawn.z, 1e3), spawn.z);
  if (spawnId < 0) throw new Error('spawn is outside the grid');

  const S = { x: 0, y: 0, z: 0, vy: 0, onGround: true, blocked: false };
  const settle = (s) => { for (let f = 0; f < 600 && !s.onGround; f++) P.move(s, 0, 0, 1 / 60); return s.onGround; };
  const tryMove = (id, dx, dz, raise) => {
    S.x = nx[id]; S.z = nz[id]; S.y = ny[id] + raise; S.vy = 0; S.onGround = raise === 0;
    P.move(S, dx * CELL, dz * CELL, 1 / 60);
    if (!settle(S)) return -1;
    if (S.x < X0 || S.x > X1 || S.z < Z0 || S.z > Z1) return -1;
    if (Math.hypot(S.x - nx[id], S.z - nz[id]) < CELL * 0.5) return -1;     // blocked, or only nudged: not an edge
    return addNode(S.x, S.y, S.z);
  };
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    for (const [dx, dz] of DIRS) {
      let to = tryMove(id, dx, dz, 0);
      if (to < 0) to = tryMove(id, dx, dz, 0.6);                               // hop over a low obstacle
      if (to >= 0 && to !== id) { efrom.push(id); eto.push(to); }
    }
    if (head % 50000 === 0) log(`  ... ${head} nodes expanded, ${nx.length} found`);
  }
  const V = nx.length, E = efrom.length;

  // backward reachability from the spawn (reverse CSR)
  const deg = new Int32Array(V + 1);
  for (let e = 0; e < E; e++) deg[eto[e] + 1]++;
  for (let v = 0; v < V; v++) deg[v + 1] += deg[v];
  const radj = new Int32Array(E), fill = deg.slice(0, V);
  for (let e = 0; e < E; e++) radj[fill[eto[e]]++] = efrom[e];
  const back = new Uint8Array(V), q2 = new Int32Array(V); let h2 = 0, t2 = 0;
  back[spawnId] = 1; q2[t2++] = spawnId;
  while (h2 < t2) { const v = q2[h2++]; for (let k = deg[v]; k < deg[v + 1]; k++) { const u = radj[k]; if (!back[u]) { back[u] = 1; q2[t2++] = u; } } }

  // clusters of nodes (8-connected on the grid, within 0.7 m of height)
  const cluster = (ids) => {
    const set = new Set(ids), seen = new Set(), out = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const comp = [], st = [id]; seen.add(id);
      while (st.length) {
        const v = st.pop(); comp.push(v);
        const i = ci(nx[v]), j = ci(nz[v]);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const u of cellNodes.get((j + dj) * N + i + di) ?? []) {
          if (!seen.has(u) && set.has(u) && Math.abs(ny[u] - ny[v]) < 0.7) { seen.add(u); st.push(u); }
        }
      }
      out.push(comp);
    }
    return out.sort((a, b) => b.length - a.length);
  };
  const describe = (comp) => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const v of comp) { x0 = Math.min(x0, nx[v]); x1 = Math.max(x1, nx[v]); z0 = Math.min(z0, nz[v]); z1 = Math.max(z1, nz[v]); y0 = Math.min(y0, ny[v]); y1 = Math.max(y1, ny[v]); }
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, b = buildings.find((bp) => mx >= bp.bounds.x0 && mx <= bp.bounds.x1 && mz >= bp.bounds.z0 && mz <= bp.bounds.z1);
    return { cells: comp.length, area_m2: +(comp.length * CELL * CELL).toFixed(1), bbox: [+x0.toFixed(1), +z0.toFixed(1), +x1.toFixed(1), +z1.toFixed(1)], y: [+y0.toFixed(2), +y1.toFixed(2)], at: [+mx.toFixed(1), +mz.toFixed(1)], building: b?.id ?? null };
  };
  const trapIds = []; for (let v = 0; v < V; v++) if (!back[v]) trapIds.push(v);
  const edgeIds = []; for (let v = 0; v < V; v++) if (Math.min(nx[v] - LO, HI - nx[v], nz[v] - LO, HI - nz[v]) < 1.0) edgeIds.push(v);
  const traps = cluster(trapIds).map(describe), boundary = cluster(edgeIds).map(describe);

  // required places: a node that is reachable from the spawn AND can return to it
  const missing = [];
  const near = (what, id, x, y, z, rad, tolH) => {
    const i0 = ci(x), j0 = ci(z), r = Math.ceil(rad / CELL);
    let ok = false;
    for (let j = j0 - r; j <= j0 + r && !ok; j++) for (let i = i0 - r; i <= i0 + r && !ok; i++) {
      for (const n of cellNodes.get(j * N + i) ?? []) if (back[n] && Math.abs(ny[n] - y) <= tolH && Math.hypot(nx[n] - x, nz[n] - z) <= rad) { ok = true; break; }
    }
    if (!ok) missing.push({ what, id, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) });
  };
  const inPoly = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const inside = (what, id, test, x0, x1, z0, z1, y, tolH) => {
    for (let j = ci(z0) - 1; j <= ci(z1) + 1; j++) for (let i = ci(x0) - 1; i <= ci(x1) + 1; i++) {
      for (const n of cellNodes.get(j * N + i) ?? []) if (back[n] && Math.abs(ny[n] - y) <= tolH && test(nx[n], ny[n], nz[n])) return;
    }
    missing.push({ what, id, x: +((x0 + x1) / 2).toFixed(2), y: +y.toFixed(2), z: +((z0 + z1) / 2).toFixed(2) });
  };
  for (const bp of buildings) {
    for (const e of bp.entrances ?? []) {
      near('entrance.outside', e.id ?? bp.id, e.outside[0], e.outside[1], e.outside[2], 0.45, 0.5);
      near('entrance.inside', e.id ?? bp.id, e.inside[0], e.inside[1], e.inside[2], 0.45, 0.5);
    }
    const f = bp.frame;
    for (const r of bp.rooms ?? []) {                    // any standable spot inside the clear rectangle will do (furniture may fill the middle)
      const c = [[r.rect.x0, r.rect.z0], [r.rect.x1, r.rect.z0], [r.rect.x1, r.rect.z1], [r.rect.x0, r.rect.z1]].map(([lx, lz]) => f.toWorld(lx, r.y, lz));
      const xs = c.map((p) => p[0]), zs = c.map((p) => p[2]);
      inside(`room ${r.id} (${r.type})`, bp.id, (x, y, z) => {
        const [lx, , lz] = f.toLocal(x, y, z);
        return lx >= r.rect.x0 - 0.05 && lx <= r.rect.x1 + 0.05 && lz >= r.rect.z0 - 0.05 && lz <= r.rect.z1 + 0.05;
      }, Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), c[0][1], 0.5);
    }
    if (bp.roof?.walkable && bp.roof.poly?.length) {     // roof.poly and roof.y are WORLD space (see CONTRACT amendments)
      const xs = bp.roof.poly.map((p) => p[0]), zs = bp.roof.poly.map((p) => p[1]);
      inside(`roof ${bp.id}`, bp.id, (x, y, z) => inPoly(bp.roof.poly, x, z), Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs), bp.roof.y, 0.6);
    }
  }
  for (const p of plan.pois ?? []) near(`poi ${p.kind ?? ''} ${p.id ?? ''}`, p.id, p.x, p.y, p.z, 0.9, 0.6);
  for (const n of plan.nav?.nodes ?? []) near(`nav ${n.kind ?? ''} ${n.id}`, n.id, n.x, n.y, n.z, 0.6, 0.6);
  for (const a of anchors) near(`anchor ${a.kind}`, a.id, a.x, a.y, a.z, 1.4, 0.7);   // seats, beds and stoves sit inside blockers: standing NEXT to them is enough

  return {
    cell: CELL, nodes: V, edges: E, backReachable: t2, trapNodes: trapIds.length,
    trapClusters: traps.length, traps, boundaryClusters: boundary.length, boundary,
    missingCount: missing.length, missing, maxList: MAXLIST,
  };
}

/** Trim lists for printing. */
export function brief(r) {
  const m = r.maxList;
  return { ...r, traps: r.traps.slice(0, m), boundary: r.boundary.slice(0, m), missing: r.missing.slice(0, m * 3) };
}
