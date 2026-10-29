// Outdoor pedestrian graph (plan.nav). Nodes along every street centre-line (<= 4 m; stairs ~1.5 m), junction nodes, a node at
// every entrance.outside (kind 'door'), a small grid inside every plaza / court / mirador. Pure data.
import { Physics, wallsRect } from '../core/physics.js';
import { project, pointAt, pointInPoly, polyDistPoint, footprint, segDist, clamp } from './geom.js';

const NODE_KIND = { road: 'street', street: 'street', alley: 'alley', stair: 'stair', path: 'path' };

export function buildNav(plan, plazaById) {
  const { streets, lots, plazas, heightAt: H } = plan;
  const nodes = [], edges = [], edgeSet = new Set(), hash = new Map(), hwOf = new Map();
  const hk = (a, b) => (a + 512) * 1024 + (b + 512);
  const addNode = (x, z, kind, extra = {}) => {
    const fx = Math.floor(x), fz = Math.floor(z);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const arr = hash.get(hk(fx + a, fz + b));
      if (arr) for (const n of arr) if (Math.hypot(n.x - x, n.z - z) < 0.45) return n;
    }
    const n = { id: 'n' + nodes.length, x: +x.toFixed(2), y: +H(x, z).toFixed(2), z: +z.toFixed(2), kind, ...extra };
    nodes.push(n);
    const k = hk(fx, fz); const arr = hash.get(k); if (arr) arr.push(n); else hash.set(k, [n]);
    return n;
  };
  const link = (a, b) => {
    if (!a || !b || a === b) return;
    const k = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
    if (edgeSet.has(k)) return; edgeSet.add(k); edges.push([a.id, b.id]);
  };
  const fps = lots.map((l) => footprint(l, 0.45));
  const clear = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.75));
    for (let i = 0; i <= n; i++) { const x = a.x + (b.x - a.x) * i / n, z = a.z + (b.z - a.z) * i / n; for (const f of fps) if (pointInPoly(f, x, z)) return false; }
    return true;
  };

  // ---- phase A: anchors (arc positions that must carry a node)
  const anchors = new Map(streets.map((s) => [s.id, []]));
  const endLinks = [];
  for (const j of streets) {
    for (const end of [0, 1]) {
      const p = end === 0 ? j._d.pts[0] : j._d.pts[j._d.pts.length - 1];
      for (const i of streets) {
        if (i === j) continue;
        const pr = project(i._d.pts, i._d.cum, p[0], p[1]);
        if (pr.d <= i.width / 2 + 1.3) { anchors.get(i.id).push(pr.s); endLinks.push({ j, end, i, s: pr.s }); }
      }
    }
  }
  const doorAnchor = [];
  for (const lot of lots) {
    const st = streets.find((s) => s.id === lot.front);
    const [ox, , oz] = lot.entrance.outside;
    if (st) { const pr = project(st._d.pts, st._d.cum, ox, oz); anchors.get(st.id).push(pr.s); doorAnchor.push({ lot, st, s: pr.s }); }
  }

  // ---- phase B: chains along each street
  const chains = new Map();
  for (const st of streets) {
    const L = st._d.cum[st._d.cum.length - 1], ds = st.kind === 'stair' ? 1.5 : st.kind === 'alley' ? 3.0 : 4.0;
    const n = Math.max(1, Math.ceil(L / ds)), A = anchors.get(st.id);
    const list = [];
    for (let k = 0; k <= n; k++) { const s = (L * k) / n; if (!A.some((a) => Math.abs(a - s) < 0.9 && k !== 0 && k !== n)) list.push(s); }
    for (const a of A) list.push(clamp(a, 0, L));
    list.sort((a, b) => a - b);
    const chain = []; let prev = null;
    for (const s of list) {
      const p = pointAt(st._d.pts, st._d.cum, s);
      const nd = addNode(p.x, p.z, NODE_KIND[st.kind]);
      hwOf.set(nd.id, Math.max(hwOf.get(nd.id) || 0, st.width / 2));
      if (prev && prev.node !== nd) link(prev.node, nd);
      chain.push({ s, node: nd }); prev = chain[chain.length - 1];
    }
    chains.set(st.id, chain);
  }
  const nodeAt = (st, s) => { const ch = chains.get(st.id); let b = ch[0], bd = Infinity; for (const c of ch) { const d = Math.abs(c.s - s); if (d < bd) { bd = d; b = c; } } return b.node; };
  for (const e of endLinks) {
    const jn = nodeAt(e.j, e.end === 0 ? 0 : e.j._d.cum[e.j._d.cum.length - 1]);
    link(jn, nodeAt(e.i, e.s));
  }

  // ---- plazas: a grid of nodes inside, joined to each other and to nearby street nodes / door nodes
  const plazaNodes = new Map();
  for (const pl of plazas) {
    const step = pl.kind === 'court' ? 5 : 4.5, xs = pl.poly.map((p) => p[0]), zs = pl.poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    const gx = Math.max(2, Math.round((x1 - x0 - 2.4) / step) + 1), gz = Math.max(2, Math.round((z1 - z0 - 2.4) / step) + 1);
    const grid = [];
    for (let a = 0; a < gx; a++) for (let b = 0; b < gz; b++) {
      const x = x0 + 1.2 + ((x1 - x0 - 2.4) * a) / (gx - 1), z = z0 + 1.2 + ((z1 - z0 - 2.4) * b) / (gz - 1);
      if (!pointInPoly(pl.poly, x, z)) continue;
      grid.push({ a, b, node: addNode(x, z, pl.kind === 'court' ? 'court' : 'plaza', { area: pl.id }) });
    }
    for (const g of grid) for (const h of grid) if (h !== g && Math.abs(h.a - g.a) <= 1 && Math.abs(h.b - g.b) <= 1) link(g.node, h.node);
    plazaNodes.set(pl.id, grid.map((g) => g.node));
  }
  for (const pl of plazas) {
    const pn = plazaNodes.get(pl.id); if (!pn.length) continue;
    for (const n of nodes) {
      if (n.kind === 'plaza' || n.kind === 'court' || n.kind === 'door') continue;
      if (polyDistPoint(pl.poly, n.x, n.z) > (n.kind === 'stair' ? 0.9 : (hwOf.get(n.id) || 1) + 1.6)) continue;
      let b = null, bd = Infinity;
      for (const q of pn) { const d = Math.hypot(q.x - n.x, q.z - n.z); if (d < bd && clear(n, q) && Math.abs(q.y - n.y) <= 0.45 + 0.1 * d) { bd = d; b = q; } }
      if (b && bd < 9) link(n, b);
    }
  }

  // ---- doors
  for (const lot of lots) {
    const [ox, , oz] = lot.entrance.outside;
    const dn = addNode(ox, oz, 'door', { lot: lot.id });
    const da = doorAnchor.find((d) => d.lot === lot);
    if (da) link(dn, nodeAt(da.st, da.s));
    else if (plazaById.has(lot.front)) {
      let b = null, bd = Infinity;
      for (const q of plazaNodes.get(lot.front)) { const d = Math.hypot(q.x - dn.x, q.z - dn.z); if (d < bd) { bd = d; b = q; } }
      if (b) link(dn, b);
    }
  }
  // ---- safety net: every kept edge must be walkable both ways under the real physics kernel (terrain + solid lot blocks)
  const phys = new Physics();
  phys.setTerrain(H);
  for (const l of lots) phys.addWalls(wallsRect(l.x, l.z, l.w, l.d, l.rotY, l.y - 0.3, l.y + 30, 0.06));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kept = [];
  for (const e of edges) {
    const a = byId.get(e[0]), b = byId.get(e[1]);
    if (walkable(phys, a, b) && walkable(phys, b, a)) kept.push(e);
    else plan.warnings.push(`nav edge ${a.id} (${a.kind} ${a.x},${a.z}) <-> ${b.id} (${b.kind} ${b.x},${b.z}) is not walkable: dropped`);
  }
  plan.nav = { nodes, edges: kept };
  return { chains, plazaNodes };
}

/** Walk a character from node a to node b with the real kernel (0.07 m per frame, like 4 m/s at 60 fps). */
export function walkable(phys, a, b) {
  const st = { x: a.x, y: a.y, z: a.z, vy: 0, onGround: true };
  const total = Math.hypot(b.x - a.x, b.z - a.z), maxSteps = Math.ceil(total / 0.07) * 3 + 30;
  let stuck = 0;
  for (let i = 0; i < maxSteps; i++) {
    const dx = b.x - st.x, dz = b.z - st.z, d = Math.hypot(dx, dz);
    if (d < 0.25) return Math.abs(st.y - b.y) < 0.6;
    const k = Math.min(0.07, d) / d, px = st.x, pz = st.z;
    phys.move(st, dx * k, dz * k, 1 / 60);
    if (Math.hypot(st.x - px, st.z - pz) < 0.01) { if (++stuck > 8) return false; } else stuck = 0;
  }
  return false;
}
