// Course LAYOUT: pure logic built from a course definition (no DOM / WebGL): main path, shortcut branches, marks, sectors, gates, rings,
// item clusters, hazards, ai hints, ground height, start grid, collision. Course (course.js) adds visuals on top; previewCourse uses it alone.
// Owner: world agent.
import * as THREE from 'three';
import { PathData } from './path.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const CLEAR = 5;               // path height above the launch deck
const _m = new THREE.Matrix4(), _a = new THREE.Vector3();

export function basisQuat(f, out = new THREE.Quaternion()) {
  _m.makeBasis(f.right, f.up, _a.copy(f.tangent).negate());
  return out.setFromRotationMatrix(_m);
}

/** A shortcut: its own open path from main(fromS) to main(toS). u = arc length along the branch. */
export class Branch {
  constructor(main, bdef, index) {
    this.index = index; this.id = bdef.id; this.name = bdef.name; this.def = bdef; this.risk = bdef.risk ?? 0.5;
    this.fromS = main.marks[bdef.from] + (bdef.fromOffset ?? 0);
    this.toS = main.marks[bdef.to] + (bdef.toOffset ?? 0);
    this.span = this.toS - this.fromS;                      // main-path distance replaced by this branch
    const mp = main.path, f0 = mp.frameAt(this.fromS, {}), f1 = mp.frameAt(this.toS, {});
    const gA = mp.frameAt(this.fromS - 120, {}).pos, gB = mp.frameAt(this.toS + 120, {}).pos;
    const mk = (p, o = {}) => ({ p: [p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]], bank: o.bank ?? null, hw: o.hw ?? null, hh: o.hh ?? null });
    const j0 = f0.pos.clone().addScaledVector(f0.tangent, 70), j1 = f1.pos.clone().addScaledVector(f1.tangent, -70);
    const pts = [mk(gA), mk(f0.pos), mk(j0), ...bdef.points.map((q) => mk(q.slice(0, 3), { bank: q[3], hw: q[4], hh: q[5] })), mk(j1), mk(f1.pos), mk(gB)];
    this.path = new PathData(pts, {
      closed: false, ds: main.ds, lead: 1, trail: 1, hw: bdef.hw ?? 50, hh: bdef.hh ?? 40,
      upStart: f0.up, upEnd: f1.up, hwStart: f0.halfWidth, hhStart: f0.halfHeight, hwEnd: f1.halfWidth, hhEnd: f1.halfHeight, taper: bdef.taper ?? 150,
    });
    this.length = this.path.length; this.halfWidth = bdef.hw ?? 50; this.halfHeight = bdef.hh ?? 40;
    this.marks = {};
    for (const k in bdef.marks || {}) this.marks[k] = this.path.sAtParam(bdef.marks[k] + 3);   // index 0 = first user point (after ghost, junction, join)
    this.gates = [];
  }
  frameAt(u, out) { return this.path.frameAt(u, out); }
  /** Main-path s equivalent of branch distance u. */
  sOf(u) { return this.fromS + (u / this.length) * this.span; }
}

export class CourseLayout {
  constructor(def, { ds = 2.5 } = {}) {
    this.def = def; this.laps = def.laps ?? 3; this.ds = ds;
    this.path = new PathData(def.points, { closed: true, ds, hw: def.hw ?? 100, hh: def.hh ?? 70, autoBank: def.autoBank, bankSpeed: def.bankSpeed });
    this.length = this.path.length;
    this.marks = {};
    for (const k in def.marks) this.marks[k] = this.path.sAtParam(def.marks[k]);
    this.branches = (def.branches || []).map((b, i) => new Branch(this, b, i));
    this.heightFn = () => 0;
    this._pm = {}; this._pb = {}; this._fs = {}; this._fb = {};
    this._buildStart();
    this._buildSectors();
    this._buildGates();
    this._buildBoost();
    this._buildItems();
    this._buildHazards();
    this._buildAiHints();
    this._buildMinimap();
    this.heightFn = def.makeHeight ? def.makeHeight(this) : (def.height || (() => 0));
  }

  // ---------------------------------------------------------------- frames
  frameAt(s, out) { return this.path.frameAt(s, out); }

  // ---------------------------------------------------------------- projection
  /** Nearest-point projection on main path / shortcut branches. out: {s, lateral, vertical, dist, branch, u}. A reused `out` carries the
   *  previous branch id and gives the branch choice hysteresis (no flicker near junctions). */
  project(pos, hintS, out) {
    const pm = this.path.project(pos, hintS, this._pm);
    const hinted = hintS != null && isFinite(hintS);
    const prev = hinted && out.branch >= 0 ? out.branch : -1;
    let best = -1, bd = pm.dist;
    if (this.branches.length) {
      const L = this.length, hs = hinted ? ((hintS % L) + L) % L : 0;
      for (const b of this.branches) {
        if (hinted && (hs < b.fromS - 90 || hs > b.toS + 90) && prev !== b.index) continue;
        b.path.project(pos, null, this._pb);
        const f = b.path.frameAt(this._pb.s, this._fb);
        const e = Math.hypot(this._pb.lateral / f.halfWidth, this._pb.vertical / f.halfHeight);
        const margin = prev === b.index ? 8 : -3;
        if (e < 1.3 && this._pb.dist < bd + margin && (best < 0 || this._pb.dist < bd)) {
          best = b.index; bd = this._pb.dist; out.s = b.sOf(this._pb.s); out.lateral = this._pb.lateral; out.vertical = this._pb.vertical; out.u = this._pb.s;
        }
      }
    }
    if (best < 0) { out.s = pm.s; out.lateral = pm.lateral; out.vertical = pm.vertical; out.u = pm.s; out.dist = pm.dist; }
    else out.dist = bd;
    out.branch = best;
    return out;
  }

  // ---------------------------------------------------------------- terrain / start platform
  /** Deck rectangle of the launch platform in the start frame: forward range [-back, fwd], half width. */
  _buildStart() {
    const c = this.def.start || {};
    this.startCfg = { back: c.back ?? 300, fwd: c.fwd ?? 70, halfW: c.halfW ?? 45 };
    const f = this.path.frameAt(0, {});
    this.startFrame = f;
    this.deckY = f.pos.y - CLEAR;
    this.startPos = f.pos.clone(); this.startT = f.tangent.clone(); this.startR = f.right.clone();
    this._sx = f.pos.x; this._sz = f.pos.z;
    // horizontal axes of the deck (the start straight is level)
    const th = Math.hypot(f.tangent.x, f.tangent.z) || 1;
    this._dx = f.tangent.x / th; this._dz = f.tangent.z / th;
  }
  /** Is (x,z) on the deck? returns forward coordinate a (m behind the line negative) or NaN. */
  _onDeck(x, z) {
    const a = (x - this._sx) * this._dx + (z - this._sz) * this._dz, b = -(x - this._sx) * this._dz + (z - this._sz) * this._dx;
    const c = this.startCfg;
    return a >= -c.back && a <= c.fwd && Math.abs(b) <= c.halfW;
  }
  groundHeight(x, z) {
    const h = this.heightFn(x, z);
    if (this._onDeck(x, z)) return Math.max(h, this.deckY);
    return h;
  }

  startGrid(n) {
    const out = [], f = this._fs, rows = Math.ceil(n / 2);
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const row = i >> 1, col = i & 1 ? 1 : -1;
      const back = 26 + row * 38 + (col > 0 ? 12 : 0);                  // staggered like a road-race grid
      this.path.frameAt(-back, f);
      const lat = col * Math.min(20, f.halfWidth * 0.3);
      const pos = f.pos.clone().addScaledVector(f.right, lat); pos.y = this.deckY + CLEAR;
      out.push({ pos, quat: basisQuat(f, q).clone(), slot: i });
    }
    void rows;
    return out;
  }

  // ---------------------------------------------------------------- sectors
  _inBranchSpan(s, pad = 0) { for (const b of this.branches) if (s > b.fromS - pad && s < b.toS + pad) return true; return false; }
  _buildSectors() {
    const L = this.length, names = this.def.sectors || ['q1', 'q2', 'q3'];
    const s = [0];
    for (const m of names) {
      let v = typeof m === 'string' ? this.marks[m] : m * L;
      if (v == null) continue;
      for (const b of this.branches) if (v > b.fromS - 40 && v < b.toS + 40) v = b.toS + 60;
      if (v > s[s.length - 1] + 200 && v < L - 200) s.push(v);
    }
    this.sectors = s;
  }

  // ---------------------------------------------------------------- gates / rings / boost / items / hazards
  _buildGates() {
    const L = this.length, step = this.def.gateSpacing ?? 250, n = Math.round(L / step), sp = L / n, r = this.def.gateRadius ?? 36;
    this.gates = [];
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * sp, f = this.path.frameAt(s, {});
      const rad = Math.max(24, Math.min(r, Math.min(f.halfWidth, f.halfHeight) * 0.75));
      this.gates.push({ s, radius: rad, kind: 'ring', pos: f.pos.clone(), quat: basisQuat(f), halfWidth: f.halfWidth });
    }
    for (const b of this.branches) {
      // big orange entry gate just after the junction, plus decorative rings inside (not scored; listed on the branch)
      const u = Math.min(b.length * 0.06 + 30, 90), f = b.frameAt(u, {});
      const g = { s: b.sOf(u), radius: 52, kind: 'ring', shortcut: true, branch: b.index, pos: f.pos.clone(), quat: basisQuat(f), big: true, halfWidth: f.halfWidth };
      this.gates.push(g);
      const cnt = Math.max(1, Math.floor((b.length - 200) / 110));
      for (let k = 1; k <= cnt; k++) {
        const uu = 120 + (k * (b.length - 240)) / (cnt + 1), ff = b.frameAt(uu, {});
        b.gates.push({ u: uu, s: b.sOf(uu), radius: Math.min(30, ff.halfWidth * 0.7), kind: 'ring', branch: b.index, pos: ff.pos.clone(), quat: basisQuat(ff) });
      }
    }
    this.gates.sort((a, b) => a.s - b.s);
    // drop main gates that sit within 60 m of the junction's big gate (they are the same place)
    const bigs = this.gates.filter((g) => g.big);
    this.gates = this.gates.filter((g) => g.big || !bigs.some((b) => Math.abs(b.s - g.s) < 70));
  }

  _buildBoost() {
    this.boostRings = [];
    const L = this.length;
    for (const spec of this.def.boost || []) {
      const base = spec.s ?? (this.marks[spec.mark] + (spec.offset || 0));
      const count = spec.count ?? 1, gap = spec.gap ?? 40;
      for (let k = 0; k < count; k++) {
        const s = (((base + k * gap) % L) + L) % L, f = this.path.frameAt(s, {});
        const lat = (spec.lateral ?? 0) + (spec.weave ? Math.sin(k * 1.7) * spec.weave : 0);
        const pos = f.pos.clone().addScaledVector(f.right, lat).addScaledVector(f.up, spec.vertical ?? 0);
        this.boostRings.push({ s, pos, quat: basisQuat(f), radius: spec.radius ?? 20, power: spec.power ?? 1.35, duration: spec.duration ?? 1.4, lateral: lat });
      }
    }
    this.boostRings.sort((a, b) => a.s - b.s);
  }

  _buildItems() {
    this.itemBoxes = []; this.itemClusters = [];
    const L = this.length, spec = this.def.items || [0.1, 0.3, 0.5, 0.7, 0.9];
    spec.forEach((v, ci) => {
      let s = typeof v === 'string' ? this.marks[v] : v * L;
      for (const b of this.branches) if (s > b.fromS - 60 && s < b.toS + 60) s = b.fromS - 130;   // keep orbs out of the shortcut mouth
      const f = this.path.frameAt(s, {});
      const hw = Math.min(f.halfWidth, 90) * 0.55, hh = f.halfHeight * 0.3, cnt = 4;
      this.itemClusters.push(s);
      for (let k = 0; k < cnt; k++) {
        const lat = (k / (cnt - 1) - 0.5) * 2 * hw, vert = (k % 2 ? 1 : -1) * hh * 0.4;
        const pos = f.pos.clone().addScaledVector(f.right, lat).addScaledVector(f.up, vert);
        this.itemBoxes.push({ s, pos, lateral: lat, vertical: vert, cluster: ci });
      }
    });
  }

  _buildHazards() {
    this.hazards = [];
    const f = {};
    for (const h of this.def.hazards || []) {
      const s = h.s ?? (this.marks[h.mark] + (h.offset || 0));
      if (h.branch != null) {
        const b = this.branches[h.branch]; b.frameAt(s, f);
      } else this.path.frameAt(s, f);
      const pos = f.pos.clone().addScaledVector(f.right, h.lateral ?? 0).addScaledVector(f.up, h.vertical ?? 0);
      this.hazards.push({ kind: h.kind, pos, radius: h.radius, column: !!h.column, bottom: h.column ? pos.y - (h.below ?? 400) : null, top: h.column ? pos.y + (h.above ?? 22) : null, s, branch: h.branch ?? -1, home: pos.clone(), sway: h.sway || 0, phase: h.phase || 0, data: h.data });
    }
  }

  // ---------------------------------------------------------------- AI hints
  _buildAiHints() {
    const L = this.length, step = 10, n = Math.ceil(L / step), hs = this.def.aiLatAccel ?? 70, f = {};
    this._hStep = L / n; this._hN = n;
    const cap = new Float32Array(n), turn = new Float32Array(n), lat = new Float32Array(n), loop = new Uint8Array(n);
    const loopRanges = [];
    for (const k in this.marks) if (k.endsWith('Entry')) { const nm = k.slice(0, -5); if (this.marks[nm + 'Exit'] != null) loopRanges.push([this.marks[k] - 20, this.marks[nm + 'Exit'] + 30]); }
    for (let i = 0; i < n; i++) {
      const s = i * this._hStep; this.path.frameAt(s, f);
      cap[i] = Math.sqrt(hs / Math.max(f.curvature, 1e-4)); turn[i] = f.turn;
      for (const [a, b] of loopRanges) if (s >= a && s <= b) { loop[i] = 1; }
      if (loop[i]) cap[i] = Infinity;
    }
    // braking preview: v_i <= sqrt(v_{i+1}^2 + 2 d step), two passes around the lap
    const d = this.def.aiBrake ?? 24;
    for (let pass = 0; pass < 2; pass++) for (let i = n - 1; i >= -n; i--) { const a = ((i % n) + n) % n, b = (a + 1) % n; cap[a] = Math.min(cap[a], Math.sqrt(cap[b] * cap[b] + 2 * d * this._hStep)); }
    // racing line: lean to the inside of sustained turns, centre on the rings
    const W = 6, sm = new Float32Array(n);
    for (let i = 0; i < n; i++) { let a = 0; for (let k = -W; k <= W; k++) a += turn[(i + k + 3 + n * 4) % n]; sm[i] = a / (2 * W + 1); }
    for (let i = 0; i < n; i++) {
      this.path.frameAt(i * this._hStep, f);
      let l = Math.max(-0.55, Math.min(0.55, sm[i] * 140)) * Math.min(f.halfWidth, 110);
      let dg = 1e9; for (const g of this.gates) { let dd = Math.abs(g.s - i * this._hStep); dd = Math.min(dd, L - dd); if (dd < dg) dg = dd; }
      l *= 1 - 0.8 * Math.exp(-((dg / 28) ** 2));
      lat[i] = loop[i] ? 0 : l;
    }
    this._hCap = cap; this._hLat = lat; this._hLoop = loop;
  }
  /** AI helper. Optional `out` avoids an allocation. Returns {lateral, speedCap, loop}. */
  aiHints(s, out = {}) {
    const L = this.length, x = (((s % L) + L) % L) / this._hStep, i0 = Math.floor(x) % this._hN, i1 = (i0 + 1) % this._hN, t = x - Math.floor(x);
    out.lateral = this._hLat[i0] + (this._hLat[i1] - this._hLat[i0]) * t;
    out.speedCap = Math.min(this._hCap[i0], this._hCap[i1]);
    out.loop = !!this._hLoop[i0];
    return out;
  }

  // ---------------------------------------------------------------- minimap / preview
  _buildMinimap() {
    const L = this.length, step = 18, pts = [], f = {};
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const grow = (x, z) => { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; };
    for (let s = 0; s < L; s += step) { this.path.frameAt(s, f); pts.push(+f.pos.x.toFixed(1), +f.pos.z.toFixed(1)); grow(f.pos.x, f.pos.z); }
    const branches = this.branches.map((b) => {
      const bp = [];
      for (let u = 0; u <= b.length; u += step) { b.frameAt(u, f); bp.push(+f.pos.x.toFixed(1), +f.pos.z.toFixed(1)); grow(f.pos.x, f.pos.z); }
      return { pts: bp, id: b.id, name: b.name };
    });
    this.minimap = { pts, bounds: { minX, maxX, minZ, maxZ }, branches };
  }

  // ---------------------------------------------------------------- collision
  /** Sphere vs ground / hazards / soft corridor wall. proj = project() result for pos (recomputed from scratch if omitted). */
  collide(pos, radius, proj, out) {
    const gh = this.groundHeight(pos.x, pos.z);
    if (pos.y - radius < gh) {
      out.kind = 'ground'; out.depth = gh - (pos.y - radius); (out.normal ||= new THREE.Vector3()).set(0, 1, 0); out.soft = false; return true;
    }
    for (let i = 0; i < this.hazards.length; i++) {
      const h = this.hazards[i];
      const dx = pos.x - h.pos.x, dz = pos.z - h.pos.z, r = h.radius + radius;
      if (h.column) {
        if (pos.y > h.bottom && pos.y < h.top + radius && dx * dx + dz * dz < r * r) {
          const d = Math.hypot(dx, dz) || 1e-3;
          out.kind = 'hazard'; out.depth = r - d; (out.normal ||= new THREE.Vector3()).set(dx / d, 0, dz / d); out.soft = false; out.hazard = h; return true;
        }
        continue;
      }
      const dy = pos.y - h.pos.y, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 1e-3;
        out.kind = 'hazard'; out.depth = r - d; (out.normal ||= new THREE.Vector3()).set(dx / d, dy / d, dz / d); out.soft = false; out.hazard = h; return true;
      }
    }
    if (!proj) { proj = this._cp || (this._cp = {}); this.project(pos, null, proj); }
    const br = proj.branch >= 0 ? this.branches[proj.branch] : null;
    const f = br ? br.frameAt(proj.u, this._fb) : this.path.frameAt(proj.s, this._fb);
    const a = proj.lateral / f.halfWidth, b = proj.vertical / f.halfHeight, e = Math.hypot(a, b);
    if (e > 1) {
      const nx = -proj.lateral / (f.halfWidth * f.halfWidth), ny = -proj.vertical / (f.halfHeight * f.halfHeight), nl = Math.hypot(nx, ny) || 1;
      out.kind = 'wall'; out.depth = (e - 1) * Math.min(f.halfWidth, f.halfHeight); out.soft = true;
      (out.normal ||= new THREE.Vector3()).set(0, 0, 0).addScaledVector(f.right, nx / nl).addScaledVector(f.up, ny / nl);
      return true;
    }
    return false;
  }
}
