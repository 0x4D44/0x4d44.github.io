// BASELINE first-person controller (owner: ENGINE agent - extend or replace freely, keep the public surface).
// Camera convention: yaw 0 looks toward -z (north, uphill). forward = (-sin yaw, -cos yaw).
import * as THREE from 'three';
import { CONFIG } from '../core/config.js';
import { clamp } from '../core/util.js';

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.s = { x: 0, y: 0, z: 0, vy: 0, onGround: false };   // physics state (y = feet)
    this.yaw = 0; this.pitch = 0; this.crouch = 0; this.camY = 0;
    this.input = { f: 0, s: 0, sprint: false, jump: false, crouch: false };   // programmatic input (debug/touch)
    this.keys = new Set(); this.locks = new Set();
    this.sens = 0.0022; this.invertY = false;
    this.building = null; this.floor = 0;
    this._eye = new THREE.Vector3(); this._dir = new THREE.Vector3();
  }

  get pos() { return this.s; }
  get eyeY() { return this.camY + CONFIG.PLAYER.eye - (CONFIG.PLAYER.eye - CONFIG.PLAYER.crouchEye) * this.crouch; }
  lock(reason) { this.locks.add(reason); }
  unlock(reason) { this.locks.delete(reason); }
  get locked() { return this.locks.size > 0; }

  teleport(x, z, o = {}) {
    const s = this.s; s.x = x; s.z = z; s.vy = 0; s.onGround = false;
    const hs = this.ctx.physics.heightsAt(x, z);
    s.y = o.y ?? (hs.length ? hs[Math.min(o.floor ?? 0, hs.length - 1)] : 0);
    if (o.yaw != null) this.yaw = o.yaw; if (o.pitch != null) this.pitch = o.pitch;
    this.camY = s.y; this.ctx.physics.move(s, 0, 0, 0.001);
  }

  attach(dom) {
    const ctx = this.ctx, canvas = dom ?? document.getElementById('gl');
    const down = (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' && !this.locked) ctx.interact.use();
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas || this.locked) return;
      this.yaw -= e.movementX * this.sens;
      this.pitch = clamp(this.pitch - e.movementY * this.sens * (this.invertY ? -1 : 1), -1.5, 1.5);
    });
    canvas.addEventListener('mousedown', () => {
      if (document.pointerLockElement !== canvas && !ctx.opts.autostart) canvas.requestPointerLock?.();
      else if (!this.locked) ctx.interact.use();
    });
  }

  _axis(neg, pos) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); }

  update(dt) {
    const ctx = this.ctx, P = CONFIG.PLAYER, k = this.keys, inp = this.input;
    let f = 0, st = 0, sprint = false, jump = false, crouch = false;
    if (!this.locked) {
      f = this._axis('KeyS', 'KeyW') + this._axis('ArrowDown', 'ArrowUp') + inp.f;
      st = this._axis('KeyA', 'KeyD') + this._axis('ArrowLeft', 'ArrowRight') + inp.s;
      sprint = k.has('ShiftLeft') || k.has('ShiftRight') || inp.sprint;
      jump = k.has('Space') || inp.jump;
      crouch = k.has('KeyC') || k.has('ControlLeft') || inp.crouch;
    }
    f = clamp(f, -1, 1); st = clamp(st, -1, 1);
    this.crouch += ((crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    const sp = (crouch ? P.crouch : sprint && f > 0 ? P.sprint : P.walk) * (f && st ? Math.SQRT1_2 : 1);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const dx = (-sy * f + cy * st) * sp * dt, dz = (-cy * f - sy * st) * sp * dt;
    ctx.physics.move(this.s, dx, dz, dt, { ...P, jump: jump && this.s.onGround ? P.jump : 0 });
    const target = this.s.y;                                   // smooth stair steps, snap on big changes
    this.camY = Math.abs(target - this.camY) > 0.9 ? target : this.camY + (target - this.camY) * Math.min(1, dt * 16);
    const cam = ctx.camera;
    cam.position.set(this.s.x, this.eyeY, this.s.z);
    cam.rotation.set(this.pitch, this.yaw, 0);
    this._eye.copy(cam.position);
    cam.getWorldDirection(this._dir);
    ctx.interact.update(this._eye, this._dir);
    ctx.ui.prompt(ctx.interact.prompt());
    ctx.discover.check(this.s.x, this.s.y, this.s.z);
  }
}
