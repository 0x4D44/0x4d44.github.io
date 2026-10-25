// First-person walker over "zones" (flat or ramped rectangles) with AABB obstacles.
// Coordinates are in a local frame (x, z) with heights y. Pure maths (no THREE) except for camera output.
import { clamp } from './util.js';

export const EYE = 1.62, RADIUS = 0.3;

export function zoneHeight(z, x, zz) {
  if (z.kind === 'flat') return z.y;
  const t = clamp((zz - z.z0) / (z.z1 - z.z0), 0, 1);
  return z.y0 + (z.y1 - z.y0) * t;
}
const inZone = (z, x, zz, m = 0) => x >= z.x0 - m && x <= z.x1 + m && zz >= z.z0 - m && zz <= z.z1 + m;

export class Walker {
  constructor() { this.eye = EYE; this.radius = RADIUS; this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.pitch = 0; this.zones = []; this.obstacles = []; this.bob = 0; this.vx = 0; this.vz = 0; this.speed = 0; this.onPush = 0; this.sprint = false; this.vy = 0; }
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
    const sp = (this.sprint ? 2.7 : 1.55);
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
      this.x = nx; this.z = nz; this.tgtY = h; return true;
    };
    if (!tryMove(this.x + mx, this.z + mz)) {
      if (!tryMove(this.x + mx, this.z)) tryMove(this.x, this.z + mz);
    }
    const h = this.heightAt(this.x, this.z, this.y);
    if (h != null) { this.y += (h - this.y) * clamp(dt * 14, 0, 1); if (Math.abs(h - this.y) < 0.002) this.y = h; }
    const moved = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
    this.speed = moved;
    this.bob += moved * dt * 4.2;
  }
  eyeY() { return this.y + this.eye + Math.sin(this.bob) * 0.025 * Math.min(1, this.speed / 1.5); }
}
