// Walking inside a building. The outdoor graph (nav.js) stops at the door; inside a shop or the chapel the way from the post to the door goes round the counter,
// between the pews, through the doors between the rooms. A small grid over the footprint, blocked where the colliders (walls and furniture) are, an A* search and
// line-of-sight smoothing give the waypoints. PURE (no THREE, no DOM): the physics object comes from the simulation.
//
//   const pts = indoor.route('L07', from, to, floorY)    // [{x,z,y}, ...]; the last point is exactly `to`; never empty
//
// Doors between rooms are passable cells: the route threads each one at its midpoint (a point 0.5 m before it, the door, a point 0.5 m after it) and the
// waypoint on the door carries `door: id`; the walker (npc.js) asks Doors to open it as it comes near and lets go once it is through. Entrance doors are not
// routed through: a route never leaves the building.
const CELL = 0.2;            // grid step (m): a 0.9 m doorway keeps two free cells, a 0.8 m gap beside a counter one
const RADIUS = 0.26;         // the walker's body radius (npc.js BODY, 0.25) and a hair
const MAX_CELLS = 20000;     // the biggest building (school, ~22 x 14 m) is ~9 500 cells
const NO_DOOR = -1;

export class Indoor {
  constructor(sim) { this.w = sim; this.grids = new Map(); this.built = 0; }

  /** The blocked-cell grid of a building's floor at height y, built once. null when the building has no footprint (or is too big). */
  grid(lotId, y) {
    const key = lotId + '|' + Math.round(y * 4);
    if (this.grids.has(key)) return this.grids.get(key);
    const bp = this.w.ctx.buildings?.get?.(lotId), fp = bp?.footprint, ph = this.w.physics; let g = null;
    if (fp?.length && ph?._overlaps) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of fp) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      x0 -= 0.9; z0 -= 0.9; x1 += 0.9; z1 += 0.9;                         // a step beyond the walls: the doorstep belongs to the grid
      const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL);
      if (nx * nz <= MAX_CELLS) {
        const doors = this._doorsOf(lotId, bp, y, ph), opened = [];
        for (const d of doors) for (const w of d.walls) { opened.push([w, w.on]); w.on = false; }         // doors between rooms are open while the grid is measured
        const blocked = new Uint8Array(nx * nz);
        try {
          for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
            const cx = x0 + (i + 0.5) * CELL, cz = z0 + (j + 0.5) * CELL;
            blocked[j * nx + i] = ph._overlaps(cx, cz, y, RADIUS, 1.5) || !Indoor.flat(ph, cx, cz, y) ? 1 : 0;           // a wall or a piece of furniture, or stairs / a low ceiling here
          }
        } finally { for (const [w, on] of opened) w.on = on; }
        const soft = new Uint8Array(nx * nz);                                                          // free cells next to a blocked one: the route avoids them when it can
        for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
          if (blocked[j * nx + i]) continue;
          for (let dj = -1; dj <= 1 && !soft[j * nx + i]; dj++) for (let di = -1; di <= 1; di++) {
            const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
            if (blocked[b * nx + a]) { soft[j * nx + i] = 1; break; }
          }
        }
        const doorCell = new Int8Array(nx * nz).fill(NO_DOOR);
        doors.forEach((d, k) => {
          const reach = d.half + 0.2 + 0.45, i0 = Math.max(0, Math.floor((d.x - reach - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((d.x + reach - x0) / CELL));
          const j0 = Math.max(0, Math.floor((d.z - reach - z0) / CELL)), j1 = Math.min(nz - 1, Math.ceil((d.z + reach - z0) / CELL));
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
            const px = x0 + (i + 0.5) * CELL - d.x, pz = z0 + (j + 0.5) * CELL - d.z, u = px * d.dx + pz * d.dz, v = px * d.nx + pz * d.nz;
            if (Math.abs(u) <= d.half + 0.1 && Math.abs(v) <= 0.45) doorCell[j * nx + i] = k;
          }
          this.w.doors?.know?.(d.id, { outside: { x: d.x, y, z: d.z }, inside: { x: d.x, y, z: d.z } });
        });
        g = { x0, z0, nx, nz, blocked, soft, doorCell, doors, y };
        this.built++;
      }
    }
    this.grids.set(key, g); return g;
  }

  /**
   * Is (x, z) flat floor at height y with head room: a surface within 0.12 m of y and nothing (a stair ramp, a landing, a low ceiling, a furniture top) between
   * 0.12 m and 1.85 m above it? A post or a route over the stairs of a house would put a person inside them.
   */
  static flat(ph, x, z, y) {
    let floor = false;
    for (const h of ph.heightsAt?.(x, z) ?? [y]) {
      if (Math.abs(h - y) <= 0.12) floor = true;
      else if (h > y + 0.12 && h < y + 1.85) return false;
    }
    return floor;
  }

  /** The doors between rooms of this floor: [{ id, walls, x, z, dx, dz (along the leaf), nx, nz (across it), half (half the opening) }]. */
  _doorsOf(lotId, bp, y, ph) {
    const ext = new Set((bp?.entrances ?? []).map((e) => e.doorId)), out = [], prefix = lotId + '.';
    for (const [id, walls] of ph.doors ?? []) {
      if (!id.startsWith(prefix) || ext.has(id) || !walls?.length) continue;
      const w0 = walls[0]; if (w0.y1 <= y + 0.4 || w0.y0 >= y + 1.6) continue;               // a door of another storey
      let sx = 0, sz = 0, len = 0; for (const w of walls) { sx += (w.x1 + w.x2) / 2; sz += (w.z1 + w.z2) / 2; len += Math.hypot(w.x2 - w.x1, w.z2 - w.z1); }
      const l0 = Math.hypot(w0.x2 - w0.x1, w0.z2 - w0.z1) || 1, dx = (w0.x2 - w0.x1) / l0, dz = (w0.z2 - w0.z1) / l0;
      out.push({ id, walls, x: sx / walls.length, z: sz / walls.length, dx, dz, nx: -dz, nz: dx, half: len / 2 });
    }
    return out;
  }

  cellOf(g, x, z) { return [Math.min(g.nx - 1, Math.max(0, Math.floor((x - g.x0) / CELL))), Math.min(g.nz - 1, Math.max(0, Math.floor((z - g.z0) / CELL)))]; }
  free(g, i, j) { return i >= 0 && j >= 0 && i < g.nx && j < g.nz && !g.blocked[j * g.nx + i]; }
  at(g, c) { return { x: g.x0 + (c[0] + 0.5) * CELL, z: g.z0 + (c[1] + 0.5) * CELL }; }

  /** The free cell nearest to (i, j) within `rmax` steps (1 m at the default), or null. */
  _snap(g, i, j, rmax = 5) {
    if (this.free(g, i, j)) return [i, j];
    for (let r = 1; r <= rmax; r++) {
      let best = null, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !this.free(g, i + di, j + dj)) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i + di, j + dj]; }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * The straight line between two cells crosses no blocked cell and no door cell other than those of door `allowA` / `allowB` (sampled at half a cell), and keeps
   * off the soft cells beside walls and furniture except within 0.6 m of either end: a shortcut that grazes a corner is not worth taking.
   */
  _los(g, a, b, allowA = NO_DOOR, allowB = NO_DOOR, skip = null) {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
    for (let k = 0; k <= n; k++) {
      const i = Math.round(a[0] + ((b[0] - a[0]) * k) / n), j = Math.round(a[1] + ((b[1] - a[1]) * k) / n);
      if (!this.free(g, i, j)) return false;
      const d = g.doorCell[j * g.nx + i]; if (d !== NO_DOOR && d !== allowA && d !== allowB && !skip?.has(d)) return false;
      if (k > 6 && k < n - 6 && g.soft[j * g.nx + i] && d === NO_DOOR) return false;
    }
    return true;
  }

  /** A* over the free cells, 8 neighbours (octile distance, no squeezing diagonally between two blocked corners). Returns the cells from s to t, or null. */
  _search(g, s, t) {
    const nx = g.nx, N = nx * g.nz, gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - t[0]), dz = Math.abs(j - t[1]); return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz); };
    const sk = s[1] * nx + s[0], tk = t[1] * nx + t[0]; gs[sk] = 0; push(sk, h(s[0], s[1]));
    let found = false;
    while (heap.length) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1;
      if (k === tk) { found = true; break; }
      const i = k % nx, j = (k / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj; if (!this.free(g, a, b)) continue;
        if (di && dj && (!this.free(g, i + di, j) || !this.free(g, i, j + dj))) continue;
        const nk = b * nx + a; if (closed[nk]) continue;
        const ng = gs[k] + (di && dj ? 1.4142 : 1) * (g.soft[nk] ? 2.5 : 1);
        if (ng < gs[nk]) { gs[nk] = ng; came[nk] = k; push(nk, ng + h(a, b)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = tk; k >= 0; k = came[k]) { cells.push([k % nx, (k / nx) | 0]); if (k === sk) break; }
    return cells.reverse();
  }

  /** String pulling: from each anchor jump to the farthest cell still in sight. Returns the cells after the first, up to and including the last. */
  _pull(g, cells, allowA, allowB, skip = null) {
    const out = []; let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1; while (b > a + 1 && !this._los(g, cells[a], cells[b], allowA, allowB, skip)) b--;
      out.push(cells[b]); a = b;
    }
    return out;
  }

  /**
   * The doors a cell path really goes through: { anchors: [{ k (the cell nearest the door's midpoint), door, from, to, sgn (which way it crosses) }], skip }. A door counts when the
   * cells just before and just after its zone lie on opposite sides of the leaf. A corridor that only runs along a door in its wall (the way down a narrow room past a door in
   * its side, as in the shops with a nook) crosses nothing: its door is in `skip`, no waypoint is made for it and a straight line may pass its zone.
   */
  _crossings(g, cells) {
    const at = (c) => g.doorCell[c[1] * g.nx + c[0]], anchors = [], skip = new Set();
    for (let k = 0; k < cells.length; k++) {
      const d = at(cells[k]); if (d === NO_DOOR) continue;
      let e = k; while (e + 1 < cells.length && at(cells[e + 1]) === d) e++;
      const D = g.doors[d], a = this.at(g, cells[Math.max(0, k - 1)]), b = this.at(g, cells[Math.min(cells.length - 1, e + 1)]);
      const sa = (a.x - D.x) * D.nx + (a.z - D.z) * D.nz, sb = (b.x - D.x) * D.nx + (b.z - D.z) * D.nz;
      if (sa * sb >= 0) skip.add(d);
      else {
        let best = k, bd = 1e9;                                                                          // the cell of the run nearest to the door's midpoint
        for (let q = k; q <= e; q++) { const p = this.at(g, cells[q]), dd = Math.hypot(p.x - D.x, p.z - D.z); if (dd < bd) { bd = dd; best = q; } }
        anchors.push({ k: best, door: d, from: k, to: e, sgn: Math.sign(sb - sa) });
      }
      k = e;
    }
    for (const A of anchors) skip.delete(A.door);
    return { anchors, skip };
  }

  /**
   * Everything a person standing at `from` can walk to inside the lot: { g, mask, count } with mask[j * nx + i] = 1 on a reachable cell; null without a grid.
   * `throughDoors: false` stops at the doors between rooms (the room alone).
   */
  reachable(lotId, from, y = from.y ?? 0, throughDoors = true) {
    const g = this.grid(lotId, y); if (!g) return null;
    const s0 = this.cellOf(g, from.x, from.z), s = this._snap(g, s0[0], s0[1], 2); if (!s) return { g, mask: new Uint8Array(g.nx * g.nz), count: 0 };
    const nx = g.nx, mask = new Uint8Array(nx * g.nz), stack = [s[1] * nx + s[0]]; mask[stack[0]] = 1; let count = 1;
    while (stack.length) {
      const k = stack.pop(), i = k % nx, j = (k / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj; if (!this.free(g, a, b) || mask[b * nx + a]) continue;
        if (!throughDoors && g.doorCell[b * nx + a] !== NO_DOOR) continue;
        if (di && dj && (!this.free(g, i + di, j) || !this.free(g, i, j + dj))) continue;
        mask[b * nx + a] = 1; count++; stack.push(b * nx + a);
      }
    }
    return { g, mask, count };
  }

  /** Can a person from the region `r` (see reachable) walk to the point p (a cell within 0.4 m of it is reachable)? True when there is no grid to say otherwise. */
  canReach(r, p) {
    if (!r) return true;
    const c = this.cellOf(r.g, p.x, p.z), s = this._snap(r.g, c[0], c[1], 2);
    return !!s && r.mask[s[1] * r.g.nx + s[0]] === 1;
  }

  /** Is there a way from `from` to `to` inside the lot (through its inner doors)? -> { ok, doors: [ids] }. */
  connected(lotId, from, to, y = to.y ?? from.y ?? 0) {
    const g = this.grid(lotId, y); if (!g) return { ok: false, doors: [] };
    const s0 = this.cellOf(g, from.x, from.z), t0 = this.cellOf(g, to.x, to.z), s = this._snap(g, s0[0], s0[1], 2), t = this._snap(g, t0[0], t0[1], 2);
    if (!s || !t) return { ok: false, doors: [] };
    const cells = this._search(g, s, t); if (!cells) return { ok: false, doors: [] };
    const ids = []; for (const A of this._crossings(g, cells).anchors) if (!ids.includes(g.doors[A.door].id)) ids.push(g.doors[A.door].id);
    return { ok: true, doors: ids };
  }

  /** Waypoints from `from` to `to` inside lot `lotId`. Falls back to the straight line when there is no grid or no way through. */
  route(lotId, from, to, y = to.y ?? from.y ?? 0) {
    const goal = { x: to.x, z: to.z, y: to.y ?? y };
    const g = this.grid(lotId, y); if (!g) return [goal];
    const s0 = this.cellOf(g, from.x, from.z), t0 = this.cellOf(g, to.x, to.z);
    const s = this._snap(g, s0[0], s0[1]), t = this._snap(g, t0[0], t0[1]); if (!s || !t) return [goal];
    if (this._los(g, s, t)) return [goal];
    const cells = this._search(g, s, t); if (!cells) return [goal];
    // an anchor on every door the cells really cross (a corridor that runs along a door in its wall is no crossing: see _crossings)
    const { anchors, skip } = this._crossings(g, cells);
    const pts = []; let prev = 0, prevDoor = NO_DOOR;
    const flat = (c) => ({ ...this.at(g, c), y: goal.y, tight: true });          // `tight`: the walker passes within 0.3 m of each of these, it does not cut the corner
    for (const A of anchors) {
      const seg = cells.slice(prev, A.k + 1);
      const pulled = this._pull(g, seg, prevDoor, A.door, skip); pulled.pop();                // the door cell itself is replaced by the door points
      for (const c of pulled) pts.push(flat(c));
      const D = g.doors[A.door], sgn = A.sgn;
      const pre ={ x: D.x - sgn * D.nx * 0.5, z: D.z - sgn * D.nz * 0.5, y: goal.y, tight: true }, post = { x: D.x + sgn * D.nx * 0.5, z: D.z + sgn * D.nz * 0.5, y: goal.y, tight: true };
      const okp = (p) => { const c = this.cellOf(g, p.x, p.z); return this.free(g, c[0], c[1]); };
      if (sgn && okp(pre)) pts.push(pre);
      pts.push({ x: D.x, z: D.z, y: goal.y, door: D.id, tight: true });
      if (sgn && okp(post)) pts.push(post);
      prev = A.k; prevDoor = A.door;
    }
    const tail = this._pull(g, cells.slice(prev), prevDoor, NO_DOOR, skip);
    for (const c of tail) pts.push(flat(c));
    if (!pts.length || pts[pts.length - 1].door) pts.push(goal); else pts[pts.length - 1] = goal;       // the last waypoint is exactly where the caller wants to stand
    return pts;
  }
}
