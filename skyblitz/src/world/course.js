// STUB course: a flat circular route with ring markers. The world agent REPLACES the internals (spline frames with loops/banks,
// scenery, shortcuts, collision) but keeps every public member below with the same meaning (see the design contract, "Course").
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();

export class Course {
  constructor(def, game) {
    this.id = def.id; this.name = def.name; this.def = def;
    this.length = def.lapLength; this.laps = def.laps ?? 3;
    this.group = new THREE.Group(); this.group.name = 'course:' + def.id;
    this.N = 720;
    const R = this.length / (Math.PI * 2);
    this.samples = [];
    for (let i = 0; i < this.N; i++) {
      const th = (i / this.N) * Math.PI * 2;
      this.samples.push({ pos: new THREE.Vector3(-R + R * Math.cos(th), 140 + 40 * Math.sin(3 * th), -R * Math.sin(th)) });
    }
    for (let i = 0; i < this.N; i++) {
      const s = this.samples[i], nx = this.samples[(i + 1) % this.N], pv = this.samples[(i - 1 + this.N) % this.N];
      s.tangent = nx.pos.clone().sub(pv.pos).normalize();
      s.up = new THREE.Vector3(0, 1, 0).addScaledVector(s.tangent, -s.tangent.y).normalize();
      s.right = new THREE.Vector3().crossVectors(s.tangent, s.up).normalize();
    }
    this.sectors = [0, this.length * 0.25, this.length * 0.5, this.length * 0.75];
    this.gates = []; this.boostRings = []; this.itemBoxes = []; this.branches = []; this.hazards = [];
    const ringGeo = new THREE.TorusGeometry(40, 1.6, 8, 40), ringMat = new THREE.MeshBasicMaterial({ color: 0xffb020 });
    for (let s = 125; s < this.length; s += 250) {
      const f = this.frameAt(s, {});
      const m = new THREE.Mesh(ringGeo, ringMat); m.position.copy(f.pos); m.quaternion.setFromRotationMatrix(_m.makeBasis(f.right, f.up, _a.copy(f.tangent).negate()));
      this.group.add(m); this.gates.push({ s, radius: 40, kind: 'ring', pos: f.pos.clone(), quat: m.quaternion.clone() });
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30000, 48), new THREE.MeshBasicMaterial({ color: 0x2b8a6e }));
    ground.rotation.x = -Math.PI / 2; this.group.add(ground);
    const night = def.id === 'neon';
    this.environment = {
      sunDir: new THREE.Vector3(0.4, 0.7, -0.5).normalize(), sunColor: new THREE.Color(0xfff0d0), sunIntensity: 3,
      skyTop: new THREE.Color(night ? 0x050a1c : 0x3b82e8), skyHorizon: new THREE.Color(night ? 0x24214f : 0xbfe0ff),
      fogColor: new THREE.Color(night ? 0x14163a : 0xbfe0ff), fogDensity: 0.00018, exposure: 1, night,
      bloom: { strength: 0.6, threshold: 0.9, radius: 0.5 }, grade: { saturation: 1.1, contrast: 1.05, vignette: 0.25 },
    };
    this.minimap = { pts: [], bounds: { minX: -2 * R, maxX: 0, minZ: -R, maxZ: R }, branches: [] };
    for (let i = 0; i < this.N; i += 6) this.minimap.pts.push(this.samples[i].pos.x, this.samples[i].pos.z);
    this._lights = [];
  }

  /** Optional async build phase (called by loadCourse). */
  async build() {}

  attach(game) {
    const e = this.environment, scene = game.scene;
    scene.background = e.skyHorizon.clone(); scene.fog = new THREE.FogExp2(e.fogColor, e.fogDensity);
    const hemi = new THREE.HemisphereLight(e.skyTop, 0x305040, 1.0), sun = new THREE.DirectionalLight(e.sunColor, e.sunIntensity);
    sun.position.copy(e.sunDir).multiplyScalar(500);
    this._lights = [hemi, sun]; for (const l of this._lights) scene.add(l);
    scene.add(this.group);
    game.renderer.toneMappingExposure = e.exposure;
  }
  detach(game) {
    game.scene.remove(this.group); for (const l of this._lights) game.scene.remove(l);
    game.scene.background = null; game.scene.fog = null; this._lights = [];
  }
  update(dt, game) {}
  dispose() { this.group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); }

  /** Frame of the MAIN path at arc length s (wraps). out gets: pos, tangent, up, right (Vector3, allocated if missing), halfWidth, halfHeight, bank, curvature. */
  frameAt(s, out) {
    const L = this.length; s = ((s % L) + L) % L;
    const x = (s / L) * this.N, i0 = Math.floor(x) % this.N, i1 = (i0 + 1) % this.N, t = x - Math.floor(x);
    const a = this.samples[i0], b = this.samples[i1];
    out.pos = (out.pos || new THREE.Vector3()).lerpVectors(a.pos, b.pos, t);
    out.tangent = (out.tangent || new THREE.Vector3()).lerpVectors(a.tangent, b.tangent, t).normalize();
    out.up = (out.up || new THREE.Vector3()).lerpVectors(a.up, b.up, t).normalize();
    out.right = (out.right || new THREE.Vector3()).crossVectors(out.tangent, out.up).normalize();
    out.halfWidth = 90; out.halfHeight = 70; out.bank = 0; out.curvature = 1 / (L / (Math.PI * 2));
    return out;
  }

  /** Nearest point on the route. hintS (previous s) restricts the search window and disambiguates loops/crossings.
   *  out: { s, lateral (+right), vertical (+up), dist, branch (-1 = main path) } */
  project(pos, hintS, out) {
    const N = this.N, L = this.length; let best = Infinity, bi = 0;
    const scan = (i) => { const d2 = this.samples[i].pos.distanceToSquared(pos); if (d2 < best) { best = d2; bi = i; } };
    if (hintS == null || !isFinite(hintS)) for (let i = 0; i < N; i++) scan(i);
    else { const c = Math.round((hintS / L) * N); for (let k = -24; k <= 24; k++) scan((((c + k) % N) + N) % N); }
    const sm = this.samples[bi]; _a.copy(pos).sub(sm.pos);
    out.s = ((((bi / N) * L + _a.dot(sm.tangent)) % L) + L) % L;
    out.lateral = _a.dot(sm.right); out.vertical = _a.dot(sm.up); out.dist = Math.sqrt(best); out.branch = -1;
    return out;
  }

  /** Terrain / water height under (x, z); used for shadows, low-altitude effects and ground collision. */
  groundHeight(x, z) { return 0; }

  /** Collision query for a sphere of `radius` at `pos`. proj = result of project() for the same pos (optional).
   *  Returns false, or fills out = { kind: 'ground'|'hazard'|'wall', depth, normal: Vector3, soft: bool } and returns true.
   *  'wall' is the soft corridor boundary (the response should be a gentle push, not a bounce). */
  collide(pos, radius, proj, out) {
    const gh = this.groundHeight(pos.x, pos.z);
    if (pos.y - radius < gh) { out.kind = 'ground'; out.depth = gh - (pos.y - radius); (out.normal ||= new THREE.Vector3()).set(0, 1, 0); out.soft = false; return true; }
    return false;
  }

  /** Spawn slots behind the start line: [{ pos, quat, slot }] for n racers (slot 0 = pole). */
  startGrid(n) {
    const f = this.frameAt(0, {}), out = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 2), col = i % 2 ? 1 : -1;
      const pos = f.pos.clone().addScaledVector(f.tangent, -(16 + row * 28)).addScaledVector(f.right, col * 18 + (row % 2) * 0);
      const quat = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(f.right, f.up, _b.copy(f.tangent).negate()));
      out.push({ pos, quat, slot: i });
    }
    return out;
  }

  /** AI helper: preferred lateral offset (m) and an optional speed cap (m/s) at arc length s. */
  aiHints(s) { return { lateral: 0, speedCap: Infinity }; }
}
