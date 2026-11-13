// Keep the orbit camera above the ground (ALM-BUG-FLU-00020). OrbitControls limits only the angle about its target and the
// zoom; nothing stopped a pan (or a target on low ground beside a hill, as at Perth) from carrying the camera under the
// terrain. While the reader drives the controls (between OrbitControls' 'start' and 'end'), every 'change' lifts the
// target onto the ground at its x/z, carrying the camera up with it so the view's angle holds, then lifts the camera to
// CAMERA_CLEARANCE above the ground at its own x/z and never below the target. Programmatic poses (the landing views, the
// station flights and hops, the evidence tools' close-ups under a train) are not touched: they fire no 'start'.
import * as THREE from 'three';

/** Metres the camera keeps above the ground under it: well clear of the 0.5 m near plane. */
export const CAMERA_CLEARANCE = 2;

/** The ground under a point of the scene on show (core/terrain.ts `Terrain.heightAt`, or a flat plane). */
export type GroundAt = (x: number, z: number) => number;

/** Lift `target` onto the ground and `eye` above it. Returns true if either moved. Two ground lookups. */
export function clampToGround(eye: THREE.Vector3, target: THREE.Vector3, groundAt: GroundAt, clearance = CAMERA_CLEARANCE): boolean {
  let moved = false;
  const under = groundAt(target.x, target.z);
  if (Number.isFinite(under) && target.y < under) { const lift = under - target.y; target.y = under; eye.y += lift; moved = true; }
  const floor = Math.max(groundAt(eye.x, eye.z) + clearance, target.y);
  if (Number.isFinite(floor) && eye.y < floor) { eye.y = floor; moved = true; }
  return moved;
}

/** The OrbitControls seam this needs. */
export interface GroundClampControls {
  object: THREE.Object3D;
  target: THREE.Vector3;
  addEventListener(type: 'start' | 'end' | 'change', listener: () => void): void;
  removeEventListener(type: 'start' | 'end' | 'change', listener: () => void): void;
}

/**
 * Clamp the reader's moves of `controls` to the ground `ground()` names (null: no clamp, e.g. an empty placeholder scene).
 * Returns the unbinder.
 */
export function bindGroundClamp(controls: GroundClampControls, ground: () => GroundAt | null, clearance = CAMERA_CLEARANCE): () => void {
  let driving = false;
  const start = (): void => { driving = true; };
  const end = (): void => { driving = false; };
  const change = (): void => {
    if (!driving) return;
    const groundAt = ground();
    if (groundAt && clampToGround(controls.object.position, controls.target, groundAt, clearance)) controls.object.lookAt(controls.target);
  };
  controls.addEventListener('start', start); controls.addEventListener('end', end); controls.addEventListener('change', change);
  return () => { controls.removeEventListener('start', start); controls.removeEventListener('end', end); controls.removeEventListener('change', change); };
}
