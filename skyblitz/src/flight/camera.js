// STUB chase camera. The flight agent REPLACES this (spring-damped follow, bank follow, FOV/boost kick, shake, look-back, cinematic modes).
// Contract: createCameraRig(game) -> { mode, init(), reset(racer, mode), cycle(), shake(amount), update(dt, game, alpha) }.
// It must read the racer's INTERPOLATED transform (racer.render.pos / racer.render.quat), never flight.pos.
import * as THREE from 'three';

export function createCameraRig(game) {
  const pos = new THREE.Vector3(), tmp = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3();
  const rig = {
    mode: 'chase', target: null, first: true,
    init() {},
    reset(racer, mode = 'chase') { this.target = racer; this.mode = mode; this.first = true; },
    cycle() {}, shake() {},
    update(dt, g) {
      const r = this.target; if (!r) return;
      const back = this.mode === 'cinematic' ? 26 : 11;
      tmp.set(0, back * 0.3, back).applyQuaternion(r.render.quat).add(r.render.pos);
      if (this.first) { pos.copy(tmp); this.first = false; } else pos.lerp(tmp, 1 - Math.exp(-6 * dt));
      g.camera.position.copy(pos);
      look.set(0, 1, -30).applyQuaternion(r.render.quat).add(r.render.pos);
      up.set(0, 1, 0).applyQuaternion(r.render.quat).lerp(THREE.Object3D.DEFAULT_UP, 0.6).normalize();
      g.camera.up.copy(up); g.camera.lookAt(look);
    },
  };
  return rig;
}
