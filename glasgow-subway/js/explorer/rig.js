// Camera rig: OrbitControls + WASD/QE keys + smooth fly-to (arcing, spherical interpolation).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp, lerp, easeInOut } from './util.js';

export class Rig {
  constructor(camera, dom, ground) {
    this.camera = camera; this.dom = dom; this.ground = ground;
    const c = this.controls = new OrbitControls(camera, dom);
    c.enableDamping = true; c.dampingFactor = 0.09; c.screenSpacePanning = false; c.zoomToCursor = true;
    c.minDistance = 18; c.maxDistance = 6500; c.maxPolarAngle = THREE.MathUtils.degToRad(87); c.minPolarAngle = 0.02;
    c.rotateSpeed = 0.7; c.panSpeed = 1.0; c.zoomSpeed = 0.9;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.keys = new Set(); this.flight = null; this.onUserInput = () => {};
    this.bounds = { minX: -9000, maxX: 9000, minZ: -9000, maxZ: 9000 };
    const stop = () => { if (this.flight) this.cancelFlight(); this.onUserInput(); };
    dom.addEventListener('pointerdown', stop); dom.addEventListener('wheel', stop, { passive: true });
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input,textarea,select,[contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase(); if ('wasdqerf+-=_'.includes(k) && k.length === 1 || k.startsWith('arrow')) { this.keys.add(k); if (k.startsWith('arrow')) e.preventDefault(); stop(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    this.sph = new THREE.Spherical(); this.v = new THREE.Vector3();
  }
  get target() { return this.controls.target; }
  get distance() { return this.camera.position.distanceTo(this.controls.target); }
  get azimuth() { return this.controls.getAzimuthalAngle(); }
  get polar() { return this.controls.getPolarAngle(); }
  getView() { return { target: this.target.clone(), dist: this.distance, polar: this.polar, azim: this.azimuth }; }
  setView(v) { this.cancelFlight(); this.apply(v.target, v.dist, v.polar, v.azim); }
  apply(target, dist, polar, azim) {
    this.controls.target.copy(target); this.sph.set(dist, polar, azim); this.v.setFromSpherical(this.sph);
    this.camera.position.copy(target).add(this.v); this.camera.lookAt(target);
  }
  cancelFlight() { if (this.flight) { const f = this.flight; this.flight = null; f.resolve?.(false); this.controls.enabled = true; } }
  flyTo(v, dur = 2.2) {
    this.cancelFlight();
    return new Promise((resolve) => {
      const from = this.getView(); let az1 = v.azim ?? from.azim; while (az1 - from.azim > Math.PI) az1 -= Math.PI * 2; while (az1 - from.azim < -Math.PI) az1 += Math.PI * 2;
      const to = { target: v.target.clone(), dist: v.dist ?? from.dist, polar: v.polar ?? from.polar, azim: az1 };
      const travel = from.target.distanceTo(to.target); const lift = clamp(travel * 0.55, 0, 2600);
      if (dur <= 0) { this.apply(to.target, to.dist, to.polar, to.azim); resolve(true); return; }
      dur = clamp(dur * (0.75 + Math.min(1, travel / 3000) * 0.5), 0.8, 5);
      this.controls.enabled = false;
      this.flight = { t: 0, dur, from, to, lift, resolve };
    });
  }
  /** Gently circle around the target (used by the tour). */
  update(dt) {
    const c = this.controls;
    if (this.flight) {
      const f = this.flight; f.t += dt; const u = Math.min(1, f.t / f.dur), e = easeInOut(u);
      const tgt = new THREE.Vector3().lerpVectors(f.from.target, f.to.target, e);
      // distance eases in log space plus an arcing lift so long hops rise then dive
      const d = Math.exp(lerp(Math.log(f.from.dist), Math.log(f.to.dist), e)) + f.lift * Math.sin(Math.PI * e);
      this.apply(tgt, d, lerp(f.from.polar, f.to.polar, e), lerp(f.from.azim, f.to.azim, e));
      if (u >= 1) { this.flight = null; c.enabled = true; f.resolve(true); }
    } else {
      const k = this.keys; const dist = this.distance;
      if (k.size) {
        const sp = dist * 0.9 * dt, rot = 1.4 * dt; const az = this.azimuth;
        const fx = -Math.sin(az), fz = -Math.cos(az); // forward on the ground plane (away from the camera)
        const rx = Math.cos(az), rz = -Math.sin(az); let mx = 0, mz = 0;
        if (k.has('w')) { mx += fx; mz += fz; } if (k.has('s')) { mx -= fx; mz -= fz; }
        if (k.has('d')) { mx += rx; mz += rz; } if (k.has('a')) { mx -= rx; mz -= rz; }
        const l = Math.hypot(mx, mz); if (l) { c.target.x += mx / l * sp; c.target.z += mz / l * sp; this.camera.position.x += mx / l * sp; this.camera.position.z += mz / l * sp; }
        const dA = ((k.has('q') || k.has('arrowleft')) ? -1 : 0) + ((k.has('e') || k.has('arrowright')) ? 1 : 0);
        const dP = ((k.has('arrowup')) ? -1 : 0) + ((k.has('arrowdown')) ? 1 : 0);
        const dZ = ((k.has('r') || k.has('+') || k.has('=')) ? -1 : 0) + ((k.has('f') || k.has('-') || k.has('_')) ? 1 : 0);
        if (dA || dP || dZ) {
          const off = this.camera.position.clone().sub(c.target); this.sph.setFromVector3(off);
          this.sph.theta += dA * rot; this.sph.phi = clamp(this.sph.phi + dP * rot * 0.6, 0.05, c.maxPolarAngle); this.sph.radius = clamp(this.sph.radius * (1 + dZ * 1.2 * dt), c.minDistance, c.maxDistance);
          this.camera.position.copy(c.target).add(this.v.setFromSpherical(this.sph));
        }
      }
      // keep the focus point inside the world & the camera above the ground
      const b = this.bounds; c.target.x = clamp(c.target.x, b.minX, b.maxX); c.target.z = clamp(c.target.z, b.minZ, b.maxZ);
      c.update();
      const gy = this.ground(this.camera.position.x, this.camera.position.z) + 6;
      if (this.camera.position.y < gy) this.camera.position.y = gy;
    }
    if (this.flight) this.camera.lookAt(c.target);
  }
}
