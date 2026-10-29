// Night-city reflection environment for glossy paint: dark sky, magenta/teal horizon haze, warm street glow below, a few neon bars and a moon.
// Browser only (PMREM). Owner: craft agent (role C).
import * as THREE from 'three';

export function makeCityEnvironment(renderer, env) {
  const sc = new THREE.Scene();
  const R = 60, geo = new THREE.SphereGeometry(R, 48, 24);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const top = [0.012, 0.02, 0.07], mid = [0.07, 0.05, 0.2], hor = [0.55, 0.16, 0.5], low = [1.1, 0.42, 0.2], deep = [0.12, 0.04, 0.16];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / R, az = Math.atan2(pos.getX(i), pos.getZ(i)); let c;
    if (y >= 0) {
      const t = Math.min(1, y / 0.55);
      c = [0, 1, 2].map((k) => mid[k] + (top[k] - mid[k]) * t + hor[k] * Math.max(0, 1 - y / 0.2) * (0.7 + 0.3 * Math.sin(az * 3)));
    } else {
      const t = Math.min(1, -y / 0.45);
      c = [0, 1, 2].map((k) => (hor[k] * 0.9 + (low[k] - hor[k] * 0.9) * Math.min(1, t * 3)) * (1 - t * 0.6) + deep[k] * t * 0.6);
    }
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, toneMapped: false })));
  const bars = [[0x35e8ff, 5.5], [0xff3fc8, 5], [0xffb347, 4.2], [0x35e8ff, 4.5], [0xff3fc8, 5.5], [0x9d6bff, 4]];
  const barGeo = new THREE.BoxGeometry(2.2, 14, 2.2), mats = [];
  bars.forEach(([c, k], i) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false }); mats.push(m);
    const b = new THREE.Mesh(barGeo, m), a = (i / bars.length) * Math.PI * 2 + 0.4, e = 0.08 + (i % 3) * 0.1;
    b.position.set(Math.sin(a) * 44, 44 * Math.sin(e) + 4, Math.cos(a) * 44); b.lookAt(0, 0, 0); sc.add(b);
  });
  const moonGeo = new THREE.SphereGeometry(4.2, 16, 12), moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 6.2, 8), toneMapped: false });
  const moon = new THREE.Mesh(moonGeo, moonMat); moon.position.copy((env?.sunDir || new THREE.Vector3(-0.35, 0.55, 0.3)).clone().normalize().multiplyScalar(48)); sc.add(moon);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.03, 0.1, 200);
  pm.dispose(); geo.dispose(); barGeo.dispose(); moonGeo.dispose(); moonMat.dispose(); mats.forEach((m) => m.dispose());
  return rt;
}
