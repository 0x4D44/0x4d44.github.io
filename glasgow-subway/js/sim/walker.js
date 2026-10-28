// First-person walker over "zones" (flat or ramped rectangles) with AABB obstacles.
// Coordinates are in a local frame (x, z) with heights y. Pure maths (no THREE) except for camera output.
import { clamp } from './util.js';

export const EYE = 1.52, SIT_EYE = 1.13, RADIUS = 0.3;   // standing eye of a ~1.62 m person; seated on a 0.43 m bench / crouched

export function zoneHeight(z, x, zz) {
  if (z.kind === 'flat') return z.y;
  const t = clamp((zz - z.z0) / (z.z1 - z.z0), 0, 1);
  return z.y0 + (z.y1 - z.y0) * t;
}
const inZone = (z, x, zz, m = 0) => x >= z.x0 - m && x <= z.x1 + m && zz >= z.z0 - m && zz <= z.z1 + m;

export class Walker {
  constructor() { this.headroomFn = null; this.minHead = 1.45; this.eye = EYE; this.sit = false; this.sitK = 0; this.radius = RADIUS; this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.pitch = 0; this.zones = []; this.obstacles = []; this.bob = 0; this.vx = 0; this.vz = 0; this.speed = 0; this.onPush = 0; this.sprint = false; this.vy = 0; }
  setWorld(zones, obstacles) { this.zones = zones; this.obstacles = obstacles; }
  place(x, z, yaw = this.yaw) { this.x = x; this.z = z; this.yaw = yaw; this.y = this.heightAt(x, z, 1e9); }
  heightAt(x, z, nearY) {
    if (this.heightFn) return this.heightFn(x, z);
    let best = null, bd = 1e9;
    for (const zn of this.zones) {
      if (!inZone(zn, x, z, 0.0)) continue;
      const h = zoneHeight(zn, x, z), d = Math.abs(h - nearY);
      if (d < bd) { bd = d; best = h; }
    }
    return best == null ? null : (bd < 0.75 || nearY > 1e8 ? best : null);
  }
  blocked(x, z, y) {
    for (const o of this.obstacles) {
      if (!o.tall && Math.abs(o.y - y) > 1.2) continue;
      const cx = clamp(x, o.x0, o.x1), cz = clamp(z, o.z0, o.z1);
      if ((x - cx) ** 2 + (z - cz) ** 2 < this.radius * this.radius) return true;
    }
    return false;
  }
  /** forward/strafe in [-1,1]; yaw 0 faces local -z. */
  update(dt, fwd, strafe) {
    this.sitK += ((this.sit ? 1 : 0) - this.sitK) * clamp(dt * 7, 0, 1); if (Math.abs((this.sit ? 1 : 0) - this.sitK) < 0.002) this.sitK = this.sit ? 1 : 0;
    if (this.sit) { fwd = 0; strafe = 0; }
    const sp = (this.sprint ? 3.8 : 2.0);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward vector (local frame): yaw=0 -> (0,-1)
    let dx = (-sy * fwd + cy * strafe), dz = (-cy * fwd - sy * strafe);
    const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
    let mx = dx * sp * dt, mz = dz * sp * dt;
    // escalator push
    let push = 0;
    for (const zn of this.zones) if (zn.push && inZone(zn, this.x, this.z, -0.05) && Math.abs(zoneHeight(zn, this.x, this.z) - this.y) < 0.6) push = zn.push;
    this.onPush = push; mz += push * dt;
    const tryMove = (nx, nz) => {
      const h = this.heightAt(nx, nz, this.y);
      if (h == null || this.blocked(nx, nz, h)) return false;
      if (this.headroomFn && this.headroomFn(nx, nz) < this.minHead) return false;
      this.x = nx; this.z = nz; this.tgtY = h; return true;
    };
    let did = tryMove(this.x + mx, this.z + mz);
    if (!did) { if (Math.abs(mx) > 1e-6 && tryMove(this.x + mx, this.z)) did = true; else if (Math.abs(mz) > 1e-6 && tryMove(this.x, this.z + mz)) did = true; }
    if (!did) {   // blocked head-on (e.g. a standing passenger): side-step around it, whichever side is free
      const len = Math.hypot(mx, mz); if (len > 1e-6) { const px = -mz / len, pz = mx / len, k = len * 1.1; if (!tryMove(this.x + px * k + mx * 0.5, this.z + pz * k + mz * 0.5)) tryMove(this.x - px * k + mx * 0.5, this.z - pz * k + mz * 0.5); }
    }
    const h = this.heightAt(this.x, this.z, this.y);
    if (h != null) { this.y += (h - this.y) * clamp(dt * 14, 0, 1); if (Math.abs(h - this.y) < 0.002) this.y = h; }
    const moved = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
    this.speed = moved;
    this.bob += moved * dt * 4.2;
  }
  eyeY() { let e = this.eye + (SIT_EYE - this.eye) * this.sitK; if (this.headroomFn) e = Math.min(e, this.headroomFn(this.x, this.z) - 0.14); return this.y + e + Math.sin(this.bob) * 0.02 * Math.min(1, this.speed / 1.5); }
}
