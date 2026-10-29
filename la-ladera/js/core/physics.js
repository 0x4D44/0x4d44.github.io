// Pure collision + character physics. NO three.js, NO DOM: it must run under `node` so that
// reachability / stuck-spot tests can walk the whole world in seconds.
//
// World model (all WORLD space, metres):
//   terrain   : a function heightAt(x,z) -> y             (outdoor ground; set with setTerrain)
//   walls     : vertical slabs along a 2D segment         { x1,z1,x2,z2, t(half thickness), y0,y1, door?, id? }
//   floors    : walkable surface patches (polygons in XZ) { pts:[[x,z],...], y, a?, b?, px?, pz?, id? }
//               height(x,z) = y + a*(x-px) + b*(z-pz)  -> flat slab, or a ramp / stair flight
// A character is a vertical capsule approximated by a circle (radius R) in XZ plus a height H.
//   * a wall blocks only if its [y0,y1] overlaps [feet+WALL_CLEAR, feet+H]  (curbs < 0.4 m do not)
//   * a surface up to `stepUp` above the feet is stepped onto; a surface between stepUp and head height
//     blocks (retaining walls, low stair soffits = head bump); surfaces above the head are ceilings.
//   * steep terrain (gradient > maxSlope) cannot be climbed.
const WALL_CLEAR = 0.4;
const CELL = 4;

export class Physics {
  constructor() {
    this.cells = new Map();
    this.terrain = null;
    this.walls = []; this.floors = [];
    this.doors = new Map();           // doorId -> [walls]
    this._r = { best: 0, lowest: 0, blocked: false };
  }

  setTerrain(fn) { this.terrain = fn; }

  _key(ix, iz) { return (ix + 4096) * 8192 + (iz + 4096); }
  _cell(ix, iz, make) {
    const k = this._key(ix, iz); let c = this.cells.get(k);
    if (!c && make) this.cells.set(k, c = { walls: [], floors: [] });
    return c;
  }
  _insert(kind, rec, x0, z0, x1, z1) {
    const i0 = Math.floor(x0 / CELL), i1 = Math.floor(x1 / CELL), j0 = Math.floor(z0 / CELL), j1 = Math.floor(z1 / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) this._cell(i, j, true)[kind].push(rec);
  }

  addWall(w) {
    const r = { x1: w.x1, z1: w.z1, x2: w.x2, z2: w.z2, t: w.t ?? 0.06, y0: w.y0 ?? -1e3, y1: w.y1 ?? 1e3, door: w.door ?? null, id: w.id ?? null, on: true };
    this.walls.push(r);
    const m = 0.7 + r.t;                                  // query radius margin: character radius + slack
    this._insert('walls', r, Math.min(r.x1, r.x2) - m, Math.min(r.z1, r.z2) - m, Math.max(r.x1, r.x2) + m, Math.max(r.z1, r.z2) + m);
    if (r.door) { let a = this.doors.get(r.door); if (!a) this.doors.set(r.door, a = []); a.push(r); }
    return r;
  }
  addWalls(list) { for (const w of list) this.addWall(w); }

  addFloor(f) {
    const pts = f.pts ?? f.poly;
    const r = { pts, y: f.y, a: f.a ?? 0, b: f.b ?? 0, px: f.px ?? 0, pz: f.pz ?? 0, id: f.id ?? null };
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    r.x0 = x0; r.x1 = x1; r.z0 = z0; r.z1 = z1;
    this.floors.push(r);
    this._insert('floors', r, x0, z0, x1, z1);
    return r;
  }
  addFloors(list) { for (const f of list) this.addFloor(f); }

  /** Open/close a door: closed doors are solid walls, open ones are removed. */
  setDoor(id, open) { const a = this.doors.get(id); if (a) for (const w of a) w.on = !open; }
  doorOpen(id) { const a = this.doors.get(id); return !!a && !a[0].on; }

  add(c) { if (c.walls) this.addWalls(c.walls); if (c.floors) this.addFloors(c.floors); }

  // ---- surfaces -----------------------------------------------------------------------------
  static inside(pts, x, z) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  /** Classify every surface at (x,z) relative to a character with feet at y. */
  _surf(x, z, y, stepUp, headH) {
    const r = this._r, lim = y + stepUp, top = y + headH;
    let best = -Infinity, lowest = Infinity, blocked = false;
    if (this.terrain) {
      const h = this.terrain(x, z);
      if (h <= lim) { if (h > best) best = h; } else if (h < top) blocked = true;
      if (h < lowest) lowest = h;
    }
    const c = this._cell(Math.floor(x / CELL), Math.floor(z / CELL), false);
    if (c) for (const f of c.floors) {
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1 || !Physics.inside(f.pts, x, z)) continue;
      const h = f.y + f.a * (x - f.px) + f.b * (z - f.pz);
      if (h <= lim) { if (h > best) best = h; } else if (h < top) blocked = true;
      if (h < lowest) lowest = h;
    }
    r.best = best; r.lowest = lowest; r.blocked = blocked;
    return r;
  }

  /** Highest surface at (x,z) not above maxY (falls back to the lowest surface if all are above). */
  groundAt(x, z, maxY = 1e4) {
    const r = this._surf(x, z, maxY, 0, 0);
    return r.best > -Infinity ? r.best : r.lowest;
  }

  /** All surface heights at (x,z), ascending. Used by tests and by NPC placement. */
  heightsAt(x, z) {
    const out = [];
    if (this.terrain) out.push(this.terrain(x, z));
    const c = this._cell(Math.floor(x / CELL), Math.floor(z / CELL), false);
    if (c) for (const f of c.floors) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && Physics.inside(f.pts, x, z)) out.push(f.y + f.a * (x - f.px) + f.b * (z - f.pz));
    return out.sort((a, b) => a - b);
  }

  _terrainGrad(x, z) {
    const e = 0.25, h = this.terrain;
    return Math.hypot(h(x + e, z) - h(x - e, z), h(x, z + e) - h(x, z - e)) / (2 * e);
  }

  // ---- walls ----------------------------------------------------------------------------------
  /** Push (x,z) out of every overlapping wall; returns [x,z] or null if nothing overlapped. */
  _push(x, z, y, R, H) {
    const c = this._cell(Math.floor(x / CELL), Math.floor(z / CELL), false);
    if (!c) return null;
    let moved = false;
    for (let pass = 0; pass < 3; pass++) {
      let any = false;
      for (const w of c.walls) {
        if (!w.on || w.y1 <= y + WALL_CLEAR || w.y0 >= y + H - 0.1) continue;
        const vx = w.x2 - w.x1, vz = w.z2 - w.z1, l2 = vx * vx + vz * vz;
        let t = l2 > 1e-9 ? ((x - w.x1) * vx + (z - w.z1) * vz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = w.x1 + vx * t, cz = w.z1 + vz * t;
        let dx = x - cx, dz = z - cz;
        const md = R + w.t, d2 = dx * dx + dz * dz;
        if (d2 >= md * md) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-5) { const k = (md - d) / d; x += dx * k; z += dz * k; }
        else { const l = Math.sqrt(l2) || 1; x += (-vz / l) * md; z += (vx / l) * md; }
        any = true; moved = true;
      }
      if (!any) break;
    }
    return moved ? [x, z] : null;
  }

  /** True when a wall still overlaps the character at (x,z) (used to reject corner-wedged moves). */
  _overlaps(x, z, y, R, H) {
    const c = this._cell(Math.floor(x / CELL), Math.floor(z / CELL), false);
    if (!c) return false;
    for (const w of c.walls) {
      if (!w.on || w.y1 <= y + WALL_CLEAR || w.y0 >= y + H - 0.1) continue;
      const vx = w.x2 - w.x1, vz = w.z2 - w.z1, l2 = vx * vx + vz * vz;
      let t = l2 > 1e-9 ? ((x - w.x1) * vx + (z - w.z1) * vz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (w.x1 + vx * t), dz = z - (w.z1 + vz * t), md = R + w.t - 0.02;
      if (dx * dx + dz * dz < md * md) return true;
    }
    return false;
  }

  /** Does the straight line (x1,z1)->(x2,z2) cross a wall that is solid at height y..y+h? (line of sight, NPC paths) */
  segmentBlocked(x1, z1, x2, z2, y = 0, h = 1.6, ignoreDoor = null) {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(len / (CELL * 0.5)));
    const seen = new Set();
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n, z = z1 + ((z2 - z1) * i) / n;
      const c = this._cell(Math.floor(x / CELL), Math.floor(z / CELL), false);
      if (!c) continue;
      for (const w of c.walls) {
        if (seen.has(w) || !w.on || w.y1 <= y + 0.2 || w.y0 >= y + h) continue;
        if (ignoreDoor && w.door === ignoreDoor) continue;
        seen.add(w);
        const d1x = x2 - x1, d1z = z2 - z1, d2x = w.x2 - w.x1, d2z = w.z2 - w.z1;
        const den = d1x * d2z - d1z * d2x;
        if (Math.abs(den) < 1e-9) continue;
        const s = ((w.x1 - x1) * d2z - (w.z1 - z1) * d2x) / den, u = ((w.x1 - x1) * d1z - (w.z1 - z1) * d1x) / den;
        if (s >= 0 && s <= 1 && u >= 0 && u <= 1) return true;
      }
    }
    return false;
  }

  // ---- character ------------------------------------------------------------------------------
  /**
   * Advance a character one frame. state: { x,y,z,vy,onGround }  (y = feet).  (dx,dz) = desired
   * horizontal displacement this frame. opts: { radius, height, stepUp, maxSlope, gravity, jump }.
   * Sub-steps at <= 0.1 m so thin walls cannot be tunnelled even at low frame rates.
   */
  move(s, dx, dz, dt, o = {}) {
    const R = o.radius ?? 0.3, H = o.height ?? 1.78, STEP = o.stepUp ?? 0.5, SL = o.maxSlope ?? 0.9, G = o.gravity ?? 9.8;
    s.blocked = false;
    const dist = Math.hypot(dx, dz), n = dist > 1e-6 ? Math.ceil(dist / 0.1) : 0;
    const tx = n ? dx / n : 0, tz = n ? dz / n : 0;
    for (let i = 0; i < n; i++) {
      if (this._step(s, s.x + tx, s.z + tz, R, H, STEP, SL)) continue;
      const okx = Math.abs(tx) > 1e-7 && this._step(s, s.x + tx, s.z, R, H, STEP, SL);
      const okz = Math.abs(tz) > 1e-7 && this._step(s, s.x, s.z + tz, R, H, STEP, SL);
      if (!okx && !okz) { s.blocked = true; break; }
    }
    // vertical
    const f = this._surf(s.x, s.z, s.y, STEP, H);
    const ground = f.best > -Infinity ? f.best : f.lowest;
    if (o.jump && s.onGround) { s.vy = o.jump; s.onGround = false; }
    if (s.vy > 0) {
      s.y += s.vy * dt; s.vy -= G * dt; s.onGround = false;
      if (s.y < ground) { s.y = ground; s.vy = 0; s.onGround = true; }
    } else {
      const drop = s.y - ground;
      if (drop <= 0) { s.y = ground; s.vy = 0; s.onGround = true; }
      else if (s.onGround && drop <= 0.4) { s.y = ground; s.vy = 0; }
      else {
        s.onGround = false; s.vy -= G * dt; s.y += s.vy * dt;
        if (s.y <= ground) { s.y = ground; s.vy = 0; s.onGround = true; }
      }
    }
    s.ground = ground;
    return s;
  }

  _step(s, nx, nz, R, H, STEP, SL) {
    let px = nx, pz = nz;
    const p = this._push(px, pz, s.y, R, H);
    if (p) { px = p[0]; pz = p[1]; if (this._overlaps(px, pz, s.y, R, H)) return false; }
    const f = this._surf(px, pz, s.y, STEP, H);
    if (f.blocked) return false;
    if (this.terrain && f.best > s.y + 0.05 && this._terrainGrad(px, pz) > SL && Math.abs(f.best - this.terrain(px, pz)) < 0.02) return false;
    s.x = px; s.z = pz;
    return true;
  }

  stats() { return { walls: this.walls.length, floors: this.floors.length, cells: this.cells.size, doors: this.doors.size }; }
}

// ---- collider authoring helpers (pure data in, pure data out) ------------------------------------
/** Closed rectangle outline as 4 walls. (cx,cz) centre, w along local x, d along local z, rotated ry about Y. */
export function wallsRect(cx, cz, w, d, ry, y0, y1, t = 0.06, extra = {}) {
  const c = Math.cos(ry), s = Math.sin(ry), hw = w / 2, hd = d / 2;
  const P = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
  const a = P(-hw, -hd), b = P(hw, -hd), cc = P(hw, hd), dd = P(-hw, hd);
  return [[a, b], [b, cc], [cc, dd], [dd, a]].map(([p, q]) => ({ x1: p[0], z1: p[1], x2: q[0], z2: q[1], t, y0, y1, ...extra }));
}
/** Oriented rectangle floor patch (flat). */
export function floorRect(cx, cz, w, d, ry, y, extra = {}) {
  const c = Math.cos(ry), s = Math.sin(ry), hw = w / 2, hd = d / 2;
  const P = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
  return { pts: [P(-hw, -hd), P(hw, -hd), P(hw, hd), P(-hw, hd)], y, ...extra };
}
/** Floor patch that is a ramp: height goes yFrom -> yTo along the straight line from->to (both [x,z]). */
export function floorRamp(pts, from, to, yFrom, yTo, extra = {}) {
  const dx = to[0] - from[0], dz = to[1] - from[1], l2 = dx * dx + dz * dz, k = (yTo - yFrom) / l2;
  return { pts, y: yFrom, px: from[0], pz: from[1], a: k * dx, b: k * dz, ...extra };
}
