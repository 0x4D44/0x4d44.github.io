// Neon Skyline ground plane: wet asphalt street grid (matches the lot gaps of city.js) with streaming headlight/taillight streaks, plus the
// river: dark water that mirrors the city lights as vertical neon smears and a lit quay. One camera-following plane, one draw call.
// Owner: craft agent (role C).
import * as THREE from 'three';

const VS = `
#include <common>
#include <fog_pars_vertex>
varying vec3 vW;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FS = `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D tMask, tN;
uniform vec4 uB;                 // minX, minZ, 1/sizeX, 1/sizeZ
uniform float uTime, uP, uStreet, uQ;
varying vec3 vW;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 neonPal(float k){
  k = fract(k);
  return k < 0.33 ? vec3(0.1, 0.9, 1.0) : (k < 0.62 ? vec3(1.0, 0.18, 0.75) : (k < 0.82 ? vec3(1.0, 0.62, 0.16) : vec3(0.65, 0.4, 1.0)));
}
// one lane of traffic: a = coordinate along the street, l = lateral offset from the street centre, dir = +-1, id = street id
vec3 lane(float a, float l, float dir, float id, float lc, float dist, float t){
  float cellLen = 15.0 + 3.0 * abs(lc);
  float v = a - dir * t * (18.0 + 6.0 * abs(lc));
  float cc = floor(v / cellLen);
  float r = h21(vec2(cc, id * 3.1 + lc * 7.7));
  if (r < 0.42) return vec3(0.0);
  float f = fract(v / cellLen) * cellLen;
  float head = cellLen * (0.35 + 0.4 * h21(vec2(cc + 9.0, id)));
  float widen = 1.0 + dist * 0.0014 * uQ;
  float dl = (f - head) * dir;                 // distance behind the head (positive = trail)
  float body = smoothstep(0.0, 1.0, 1.0 - abs(dl - 4.0) / (4.5 * widen)) ;
  float trail = exp(-max(dl, 0.0) / (7.0 * widen)) * step(0.0, dl) * 0.5;
  float across = 1.0 - smoothstep(0.7 * widen, 1.5 * widen, abs(l - lc));
  vec3 c = dir > 0.0 ? vec3(1.0, 0.92, 0.72) * 3.0 : vec3(1.0, 0.1, 0.08) * 2.4;
  float amp = 1.0 / widen;
  return c * (body * 0.9 + trail) * across * amp;
}
void main(){
  vec2 p = vW.xz;
  float dist = length(cameraPosition - vW);
  float t = uTime;
  vec2 su = (p - uB.xy) * uB.zw;
  float rd = 1000.0;
  if (su.x > 0.0 && su.y > 0.0 && su.x < 1.0 && su.y < 1.0) rd = texture2D(tMask, su).r * 240.0 - 80.0;
  float water = 1.0 - smoothstep(-1.2, 1.2, rd);
  vec3 col = vec3(0.012, 0.013, 0.024);
  // ---- streets
  vec2 sc = p / uP;
  vec2 dl = (fract(sc + 0.5) - 0.5) * uP;            // lateral offset from the nearest street centre line in x and z
  vec2 id = floor(sc + 0.5);
  float sx = 1.0 - smoothstep(7.2, 8.2, abs(dl.x));  // a street running along z (x close to a grid line)
  float sz = 1.0 - smoothstep(7.2, 8.2, abs(dl.y));
  float street = max(sx, sz);
  vec3 lights = vec3(0.0);
  float fadeD = 1.0 - smoothstep(1800.0, 5200.0, dist);
  if (sx > 0.01) { lights += lane(p.y, dl.x, 1.0, id.x, 2.6, dist, t) * sx; lights += lane(p.y, dl.x, -1.0, id.x, -2.6, dist, t) * sx; lights += lane(p.y, dl.x, 1.0, id.x + 40.0, 5.4, dist, t) * sx * 0.7; }
  if (sz > 0.01) { lights += lane(p.x, dl.y, 1.0, id.y + 77.0, 2.6, dist, t) * sz; lights += lane(p.x, dl.y, -1.0, id.y + 77.0, -2.6, dist, t) * sz; lights += lane(p.x, dl.y, -1.0, id.y + 120.0, -5.4, dist, t) * sz * 0.7; }
  // wet asphalt: coloured sheen from the neon above
  vec2 bl = floor(p / 160.0);
  vec3 sheen = neonPal(h21(bl) * 3.0) * 0.06 + neonPal(h21(bl + 7.0) * 3.0) * 0.04;
  col += street * (vec3(0.02, 0.022, 0.04) + sheen * (0.5 + 0.5 * sin(p.x * 0.05 + p.y * 0.03)));
  col += lights * uStreet * fadeD;
  // ---- river
  if (water > 0.001) {
    vec3 V = normalize(cameraPosition - vW);
    vec2 vh = normalize(V.xz + 1e-4);
    vec3 n1 = texture2D(tN, p * 0.006 + vec2(t * 0.011, t * 0.007)).rgb * 2.0 - 1.0;
    vec3 n2 = texture2D(tN, p * 0.021 + vec2(-t * 0.02, t * 0.013)).rgb * 2.0 - 1.0;
    float s = dot(p, vh) + n1.x * 28.0 + n2.y * 9.0;
    float c = dot(p, vec2(-vh.y, vh.x)) + n2.x * 6.0;
    vec3 refl = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float sc2 = 6.0 + float(i) * 5.0;
      float cc = floor(c / sc2);
      float r = h21(vec2(cc, float(i) * 11.0));
      float on = step(0.7, r);
      float ph = fract(c / sc2);
      float line = 1.0 - smoothstep(0.1, 0.45, abs(ph - 0.5));
      float ripple = 0.55 + 0.45 * sin(s * 0.22 + t * 1.6 + r * 40.0);
      float lenMask = smoothstep(0.0, 1.0, 1.0 - fract(h21(vec2(cc, 5.0)) + s * 0.0007) * 1.4);
      refl += neonPal(r * 7.0 + float(i) * 0.31) * on * line * ripple * (0.35 + 0.65 * lenMask) * 1.8;
    }
    float bank = 1.0 - smoothstep(0.0, 200.0, rd + 70.0);
    float ndv = max(dot(vec3(n1.x * 0.2, 1.0, n1.y * 0.2), V), 0.0);
    float fres = 0.04 + 0.96 * pow(1.0 - ndv, 4.0);
    vec3 body = vec3(0.006, 0.02, 0.04) + vec3(0.03, 0.02, 0.09) * fres;
    // quay lights along the bank
    float quay = smoothstep(1.0, 2.5, rd) * (1.0 - smoothstep(4.0, 6.0, rd));
    vec2 qc = floor(p / 11.0);
    float qd = step(0.35, h21(qc)) * quay;
    vec3 water3 = body + refl * (0.35 + 0.65 * (1.0 - bank * 0.4)) * (0.5 + 0.9 * fres) + vec3(1.0, 0.62, 0.22) * qd * 2.5;
    col = mix(col, water3, water);
  } else {
    // quay edge line on the land side
    float q2 = (1.0 - smoothstep(0.0, 1.6, abs(rd - 2.4))) * step(0.0, rd);
    vec2 qc = floor(p / 11.0);
    col += vec3(1.0, 0.62, 0.22) * q2 * step(0.35, h21(qc)) * 2.2 * fadeD;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

/** city = heightFn.city; bounds {minX,maxX,minZ,maxZ} must cover the river. */
export function createGround(env, game, city, bounds) {
  const res = 1024, data = new Uint8Array(res * res * 4), w = city.river.width / 2;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = bounds.minX + ((i + 0.5) / res) * (bounds.maxX - bounds.minX), z = bounds.minZ + ((j + 0.5) / res) * (bounds.maxZ - bounds.minZ);
    const d = city.polyDist(city.river.pts, x, z) - w, v = Math.min(1, Math.max(0, (d + 80) / 240));
    const k = (j * res + i) * 4; data[k] = Math.round(v * 255); data[k + 3] = 255;
  }
  const mask = new THREE.DataTexture(data, res, res, THREE.RGBAFormat); mask.magFilter = mask.minFilter = THREE.LinearFilter; mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping; mask.needsUpdate = true;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    tMask: { value: mask }, tN: { value: game.assets.tex('water_n') },
    uB: { value: new THREE.Vector4(bounds.minX, bounds.minZ, 1 / (bounds.maxX - bounds.minX), 1 / (bounds.maxZ - bounds.minZ)) },
    uTime: { value: 0 }, uP: { value: city.P }, uStreet: { value: 1 }, uQ: { value: game.q.scenery < 0.6 ? 2.2 : 1 },
  }]);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, fog: true });
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat); mesh.scale.set(40000, 1, 40000); mesh.frustumCulled = false; mesh.name = 'ground'; mesh.renderOrder = -1;
  return {
    group: mesh,
    update(dt, g, course, cam) { uniforms.uTime.value += dt; mesh.position.x = Math.round(cam.position.x / 80) * 80; mesh.position.z = Math.round(cam.position.z / 80) * 80; },
    dispose() { geo.dispose(); mat.dispose(); mask.dispose(); },
  };
}
