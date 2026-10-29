// Fallback sky environment (PMREM) so glossy paint always has something to reflect, in labs or if the course sets none.
// Browser-only (needs a WebGLRenderer). Owner: craft agent.
import * as THREE from 'three';

export function makeSkyEnvironment(renderer, { top = [0.28, 0.5, 1.0], horizon = [1.0, 0.95, 0.85], ground = [0.32, 0.3, 0.27], sun = [7, 5.8, 4], sunDir = [0.5, 0.62, 0.45] } = {}) {
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(60, 32, 16);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 60; let c;
    if (y > 0) { const t = Math.pow(y, 0.55); c = [0, 1, 2].map((k) => horizon[k] + (top[k] - horizon[k]) * t); }
    else { const t = Math.pow(-y, 0.6); c = [0, 1, 2].map((k) => horizon[k] * 0.35 + (ground[k] - horizon[k] * 0.35) * t); }
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false })));
  const d = new THREE.Vector3(...sunDir).normalize().multiplyScalar(48);
  const s = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(...sun), toneMapped: false }));
  s.position.copy(d); scene.add(s);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose(); geo.dispose();
  return rt.texture;
}
