// Soft ground-shadow blobs under every racer: the key altitude cue. One instanced quad per racer, placed on max(groundHeight(x,z), waterLevel)
// (groundHeight is the sea FLOOR; over water the shadow belongs on the surface you would hit, V-4), stretched along the craft heading,
// fading and widening with altitude above that surface. Zero allocation per frame. Owner: world agent.
import * as THREE from 'three';

const VS = `
attribute float aAlpha;
varying vec2 vUv; varying float vA;
void main(){
  vUv = uv; vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FS = `
varying vec2 vUv; varying float vA;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  float a = smoothstep(1.0, 0.15, d);
  a *= a;
  gl_FragColor = vec4(0.0, 0.02, 0.05, a * vA);
}`;

export function buildBlobs(course, game) {
  const MAX = 10, wl = course.def?.waterLevel;                  // undefined on a dry course (frost)
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const alpha = new Float32Array(MAX);
  geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 2;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler(), fw = new THREE.Vector3();
  return {
    group: mesh,
    update(dt, g) {
      const racers = g.race?.racers;
      if (!racers) { mesh.count = 0; return; }
      let n = 0;
      for (let i = 0; i < racers.length && n < MAX; i++) {
        const r = racers[i]; if (!r.render) continue;
        const pos = r.render.pos, floor = course.groundHeight(pos.x, pos.z), gh = wl != null && wl > floor ? wl : floor, alt = pos.y - gh;
        if (alt > 420) continue;
        fw.set(0, 0, -1).applyQuaternion(r.render.quat); fw.y = 0;
        const yaw = fw.lengthSq() > 1e-4 ? Math.atan2(-fw.x, -fw.z) : 0;
        const spread = 1 + Math.min(alt, 300) * 0.012, base = r.spec?.radius ?? 5;
        const w = (base * 2.6 + 4) * spread, l = (base * 3.2 + 5) * spread;
        p.set(pos.x, gh + 0.25, pos.z); q.setFromEuler(e.set(0, yaw, 0)); s.set(w, 1, l);
        mesh.setMatrixAt(n, m.compose(p, q, s));
        alpha[n] = (r.isPlayer ? 0.75 : 0.6) * Math.max(0.12, 1 - alt / 380);
        n++;
      }
      mesh.count = n; mesh.instanceMatrix.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); mesh.dispose(); },
  };
}
