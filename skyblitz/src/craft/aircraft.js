// STUB aircraft model. The craft agent REPLACES the geometry/materials (six distinct, detailed procedural aircraft) but keeps:
//   buildAircraft(spec, liveryIndex, game) -> THREE.Group  (nose = -Z, right wing = +X, y up, origin at the centre of mass)
//   group.userData = { radius, wingTips: [Vector3 left, Vector3 right] (local), exhausts: [Vector3...] (local), parts: {...} }
//   updateAircraft(model, racer, dt)  animates control surfaces / propellers / afterburner from racer.controls + racer.flight.
import * as THREE from 'three';

export function buildAircraft(spec, liveryIndex = 0, game) {
  const lv = spec.liveries[liveryIndex % spec.liveries.length];
  const g = new THREE.Group(); g.name = 'aircraft:' + spec.id;
  const mat = new THREE.MeshStandardMaterial({ color: lv.primary, roughness: 0.4, metalness: 0.2 });
  const acc = new THREE.MeshStandardMaterial({ color: lv.accent, roughness: 0.5 });
  const L = spec.visual.length, W = spec.visual.wingspan;
  const body = new THREE.Mesh(new THREE.ConeGeometry(L * 0.12, L, 12), mat); body.rotation.x = -Math.PI / 2; g.add(body);   // tip -> -Z
  const wing = new THREE.Mesh(new THREE.BoxGeometry(W, 0.25, L * 0.3), acc); wing.position.z = L * 0.1; g.add(wing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, L * 0.2, L * 0.2), acc); fin.position.set(0, L * 0.1, L * 0.4); g.add(fin);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { radius: Math.max(L, W) * 0.5, wingTips: [new THREE.Vector3(-W / 2, 0, L * 0.1), new THREE.Vector3(W / 2, 0, L * 0.1)], exhausts: [new THREE.Vector3(0, 0, L * 0.5)], parts: {} };
  return g;
}

export function updateAircraft(model, racer, dt) {}
