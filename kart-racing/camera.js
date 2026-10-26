// Chase camera: smooth follow, drift lag, speed FOV, shake, look-back, menu orbit.
import * as THREE from "three";
import { clamp } from "./roster.js";

const MODES = {
  chase: { dist: 7.6, height: 3.5, look: 7, lookH: 1.2, fov: 66 },
  far:   { dist: 11.5, height: 5.4, look: 8, lookH: 1.0, fov: 64 },
};
const wrapPi = (a) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; else if (a < -Math.PI) a += Math.PI * 2; return a; };

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.target = null;
    this.mode = "chase";
    this.shake = 0;
    this.back = false;
    this.yaw = 0;          // camera's own smoothed heading
    this.backBlend = 0;
    this.fov = MODES.chase.fov;
    this._pos = new THREE.Vector3(); this._look = new THREE.Vector3();
    this._orbitAngle = 0;
    this._hooked = new WeakSet();
    this._t = 0;
    this._track = null; this._camHint = undefined; this._ly = 0;
  }

  setTarget(kart) {
    this.target = kart;
    if (kart && !this._hooked.has(kart)) {
      this._hooked.add(kart);
      kart.on("wall", (i) => { if (this.target === kart) this.setShake(clamp(i / 25, 0.15, 0.7)); });
      kart.on("bump", (o, i) => { if (this.target === kart) this.setShake(clamp(i / 30, 0.1, 0.5)); });
      kart.on("spin", () => { if (this.target === kart) this.setShake(0.6); });
    }
    this.snap();
  }
  setMode(m) { this.mode = MODES[m] ? m : "chase"; }
  setShake(a) { this.shake = Math.max(this.shake, clamp(a, 0, 1)); }
  lookBack(b) { this.back = !!b; }

  snap() {
    const k = this.target; if (!k) return;
    this.yaw = k.heading; this.backBlend = this.back ? 1 : 0; this._camHint = undefined; this._ly = k.position.y;
    this._place(0, true);
  }

  update(dt, track) {
    const k = this.target; if (!k) return;
    this._track = track || this._track;
    dt = Math.min(dt, 0.1);
    this._t += dt;
    // yaw lag: lazier while drifting, so the kart visibly slides across the view
    const lag = k.drifting ? 2.6 : (k.speed < 0 ? 3 : 5.5);
    let targetYaw = k.heading;
    if (k.drifting) targetYaw += k.driftDir * 0.0;
    this.yaw = wrapPi(this.yaw + wrapPi(targetYaw - this.yaw) * (1 - Math.exp(-lag * dt)));
    this.backBlend += ((this.back ? 1 : 0) - this.backBlend) * (1 - Math.exp(-10 * dt));
    this._place(dt, false);
  }

  _place(dt, snap) {
    const k = this.target, M = MODES[this.mode], cam = this.camera;
    const sf = clamp(k.speed / (k.maxSpeed || 40), 0, 1.4);
    const boosting = k.boostTime > 0 ? Math.min(1, k.boostTime / 0.4) * (0.5 + 0.5 * Math.min(1, k.boostStrength)) : 0;
    this._boostSm = (this._boostSm || 0) + (boosting - (this._boostSm || 0)) * (snap ? 1 : 1 - Math.exp(-6 * dt));
    const dist = M.dist * (1 + 0.1 * sf) + this._boostSm * 0.9;
    const yaw = this.yaw + Math.PI * this.backBlend;
    // slide offset: camera sits slightly toward the outside of the drift so the car angle reads
    const side = (k.drifting ? -k.driftDir * 0.0 : 0);
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const tx = k.position.x - sy * dist + cy * side;
    const tz = k.position.z - cy * dist - sy * side;
    const ty = k.position.y + M.height * (1 - 0.1 * sf);
    if (snap) this._pos.set(tx, ty, tz);
    else {
      const f = 1 - Math.exp(-14 * dt);
      this._pos.x += (tx - this._pos.x) * f; this._pos.z += (tz - this._pos.z) * f;
      this._pos.y += (ty - this._pos.y) * (1 - Math.exp(-9 * dt));
    }
    // look target ahead of the kart (blend between heading and camera yaw)
    const lookYaw = this.yaw + Math.PI * this.backBlend;
    const lx = k.position.x + Math.sin(lookYaw) * M.look, lz = k.position.z + Math.cos(lookYaw) * M.look;
    // look slightly along the slope the kart is on
    this._ly += ((k.position.y + M.lookH + Math.tan(-(k._sp || 0)) * M.look * 0.7) - this._ly) * (snap ? 1 : 1 - Math.exp(-10 * dt));
    this._look.set(lx, this._ly, lz);
    // never sink into the road on crests/dips
    const tr = this._track;
    if (tr && !snap) {
      const hint = this._camHint !== undefined ? this._camHint : (k.s !== undefined ? k.s : undefined);
      const l = tr.locate(this._pos, hint);
      if (l) {
        this._camHint = l.s;
        if (typeof l.y === "number" && Math.abs(l.s - (k.s || 0)) < 60 && Math.abs(l.y - k.position.y) < 12) this._pos.y = Math.max(this._pos.y, l.y + 1.4);
      }
    }

    cam.position.copy(this._pos);
    if (this.shake > 0.001) {
      const a = this.shake * 0.45;
      cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a * 0.7; cam.position.z += (Math.random() - 0.5) * a;
      this.shake *= Math.exp(-5 * (dt || 0.016));
    } else this.shake = 0;
    cam.lookAt(this._look);

    const targetFov = M.fov + 9 * clamp(sf, 0, 1) + 9 * this._boostSm;
    this.fov += (targetFov - this.fov) * (snap ? 1 : 1 - Math.exp(-5 * dt));
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }

  // Menu backdrop: circle `centre` at radius/height. Independent of any target.
  orbit(dt, centre, radius = 14, height = 5) {
    this._orbitAngle += dt * 0.35;
    const c = this.camera;
    c.position.set(centre.x + Math.sin(this._orbitAngle) * radius, (centre.y || 0) + height, centre.z + Math.cos(this._orbitAngle) * radius);
    c.lookAt(centre.x, (centre.y || 0) + 0.8, centre.z);
    if (Math.abs(c.fov - 45) > 0.01) { c.fov = 45; c.updateProjectionMatrix(); }
    this.fov = 45;
  }
}
