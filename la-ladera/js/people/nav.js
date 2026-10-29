// Outdoor pedestrian graph + A*. PURE (no THREE, no DOM): runs under node for tests.
//
//   const g = NavGraph.fromPlan(plan);           // uses plan.nav when it has >= 4 nodes, else builds a graph from plan.streets
//   const a = g.nearest(x, z), b = g.nearest(x2, z2);
//   const idx = g.path(a, b);                    // [nodeIdx...] or null
//   g.pos(i) -> {x,y,z,kind}
const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}

export class NavGraph {
  constructor() { this.nodes = []; this.adj = []; this.grid = new Map(); this.cell = 8; this.fallback = false; this.w = new Map(); }

  add(x, y, z, kind = 'street', extra = null) {
    const i = this.nodes.length; this.nodes.push({ i, x, y, z, kind, ...(extra ?? {}) }); this.adj.push([]);
    const k = this._k(x, z); let c = this.grid.get(k); if (!c) this.grid.set(k, c = []); c.push(i);
    return i;
  }
  _k(x, z) { return Math.floor(x / this.cell) * 100003 + Math.floor(z / this.cell); }
  link(a, b) {
    if (a === b || this.adj[a].includes(b)) return;
    const A = this.nodes[a], B = this.nodes[b], d = Math.hypot(A.x - B.x, A.z - B.z, (A.y - B.y) * 1.5);
    this.adj[a].push(b); this.adj[b].push(a); this.w.set(a * 1e6 + b, d); this.w.set(b * 1e6 + a, d);
  }
  pos(i) { return this.nodes[i]; }
  get size() { return this.nodes.length; }

  /** Nearest node to (x,z) within maxD (default: unlimited); optional y penalty so stairs above/below are not mixed up. */
  nearest(x, z, maxD = Infinity, y = null) {
    let best = -1, bd = maxD * maxD;
    const r = Math.min(40, Math.max(1, Math.ceil(Math.min(maxD, 200) / this.cell)));
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let ring = 0; ring <= r; ring++) {
      for (let i = cx - ring; i <= cx + ring; i++) for (let j = cz - ring; j <= cz + ring; j++) {
        if (Math.max(Math.abs(i - cx), Math.abs(j - cz)) !== ring) continue;
        const c = this.grid.get(i * 100003 + j); if (!c) continue;
        for (const n of c) { const N = this.nodes[n]; let d = dist2(x, z, N.x, N.z); if (y != null) d += ((N.y - y) * 1.5) ** 2; if (d < bd) { bd = d; best = n; } }
      }
      if (best >= 0 && ring * this.cell > Math.sqrt(bd) + this.cell) break;
    }
    return best;
  }

  /** A* between node indices. Returns [idx...] (inclusive) or null. */
  path(a, b, avoid = null) {
    if (a < 0 || b < 0) return null; if (a === b) return [a];
    const N = this.nodes, g = new Map([[a, 0]]), from = new Map(), open = new MinHeap(), closed = new Set();
    const h = (i) => Math.hypot(N[i].x - N[b].x, N[i].z - N[b].z);
    open.push(h(a), a);
    while (open.size) {
      const [, u] = open.pop(); if (closed.has(u)) continue; if (u === b) break; closed.add(u);
      for (const v of this.adj[u]) {
        if (closed.has(v)) continue;
        const A = N[u], B = N[v];
        let w = this.w.get(u * 1e6 + v) ?? Math.hypot(A.x - B.x, A.z - B.z);
        if (avoid && avoid.has(v)) w += 25;
        const ng = g.get(u) + w;
        if (ng < (g.get(v) ?? Infinity)) { g.set(v, ng); from.set(v, u); open.push(ng + h(v), v); }
      }
    }
    if (!from.has(b)) return null;
    const out = [b]; for (let c = b; c !== a;) { c = from.get(c); out.push(c); } return out.reverse();
  }

  /** Connected-component id per node (to find the main walkable component). */
  components() {
    const comp = new Int32Array(this.nodes.length).fill(-1); let n = 0; const sizes = [];
    for (let s = 0; s < comp.length; s++) {
      if (comp[s] >= 0) continue; let cnt = 0; const st = [s]; comp[s] = n;
      while (st.length) { const u = st.pop(); cnt++; for (const v of this.adj[u]) if (comp[v] < 0) { comp[v] = n; st.push(v); } }
      sizes.push(cnt); n++;
    }
    return { comp, sizes };
  }

  randomNode(rng, filter = null) {
    for (let k = 0; k < 40; k++) { const i = Math.floor(rng.next() * this.nodes.length); if (!filter || filter(this.nodes[i])) return i; }
    return Math.floor(rng.next() * this.nodes.length);
  }

  /**
   * Build from the master plan. `heightAt(x,z)` (plan.heightAt) refreshes node heights. When plan.nav is missing/tiny, a fallback graph is made from
   * plan.streets centre-lines (resampled every `step` m, crossings welded within `weld` m).
   */
  static fromPlan(plan, { step = 3, weld = 2.6 } = {}) {
    const g = new NavGraph(), nav = plan?.nav, hy = plan?.heightAt ?? (() => 0);
    if (nav?.nodes?.length >= 4 && nav.edges?.length) {
      const ix = new Map();
      for (const n of nav.nodes) ix.set(n.id, g.add(n.x, n.y ?? hy(n.x, n.z), n.z, n.kind ?? 'street', { id: n.id, w: n.w }));
      for (const [a, b] of nav.edges) { const A = ix.get(a), B = ix.get(b); if (A != null && B != null) g.link(A, B); }
      return g;
    }
    g.fallback = true;
    const streets = (plan?.streets ?? []).filter((s) => s.pts?.length >= 2);
    const owner = [];
    for (const s of streets) {
      let prev = -1, carry = 0;
      for (let k = 0; k < s.pts.length - 1; k++) {
        const [x0, z0] = s.pts[k], [x1, z1] = s.pts[k + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
        for (let t = (k === 0 ? 0 : 1); t <= n; t++) {
          const x = x0 + ((x1 - x0) * t) / n, z = z0 + ((z1 - z0) * t) / n;
          const i = g.add(x, hy(x, z), z, s.kind === 'stair' ? 'stair' : 'street', { street: s.id, w: (s.width ?? 4) / 2 });
          owner[i] = s.id; if (prev >= 0) g.link(prev, i); prev = i;
        }
      }
    }
    // weld crossings between different streets
    for (let i = 0; i < g.nodes.length; i++) {
      const A = g.nodes[i];
      for (let j = i + 1; j < g.nodes.length; j++) { const B = g.nodes[j]; if (owner[i] !== owner[j] && dist2(A.x, A.z, B.x, B.z) < weld * weld) g.link(i, j); }
    }
    return g;
  }
}
