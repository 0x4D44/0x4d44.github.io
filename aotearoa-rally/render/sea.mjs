// Sea for coastal stages: a camera-following wave plane at sea level plus an animated foam line along the shore
// (a single ribbon mesh built from the road corridor's waterline crossings). Two draw calls.

/** Pure: waterline crossings along a lateral profile. h(lat) sampled at `lats`; returns lat values where h - level changes sign. */
export function waterlineCrossings(lats, heights, level) {
  const out = [];
  for (let i = 0; i + 1 < lats.length; i++) {
    const a = heights[i] - level, b = heights[i + 1] - level;
    if ((a <= 0) !== (b <= 0)) {
      const t = a / (a - b);
      out.push({ lat: lats[i] + (lats[i + 1] - lats[i]) * t, seaward: a > b ? 1 : -1 }); // seaward: +1 means lat increases toward the sea
    }
  }
  return out;
}

const FOAM_VERT = /* glsl */ `
attribute vec2 aUv; attribute float aPh; varying vec2 vUv; varying float vPh;
void main(){ vUv = aUv; vPh = aPh; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FOAM_FRAG = /* glsl */ `
precision highp float;
uniform float uTime; uniform float uNight; uniform vec3 uTint;
varying vec2 vUv; varying float vPh;

float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float v = vUv.y, u = vUv.x;
  float wave = 0.5 + 0.5 * sin(uTime * 0.7 + vPh * 6.2831);
  float band = smoothstep(0.42, 0.0, abs(v - (wave * 1.1 - 0.25)));
  float shore = smoothstep(0.4, 0.0, abs(v + 0.05)) * 0.7;
  float lace = vn(vec2(u * 7.0 + vPh * 40.0, v * 5.0 - uTime * 0.4));
  float a = (band * smoothstep(0.35, 0.7, lace) + shore * smoothstep(0.25, 0.6, lace)) * smoothstep(1.0, 0.55, abs(u)) * smoothstep(1.0, 0.7, abs(v));
  if (a < 0.02) discard;
  vec3 c = uTint * (0.3 + 0.7 * (1.0 - uNight));
  gl_FragColor = vec4(c, a * 0.85);
}`;

export function createSea(THREE, SU, makeWaterMaterial) {
  const group = new THREE.Group();
  group.name = "sea";
  let plane = null, foam = null, planeMat = null, foamMat = null, level = 0;

  function build(stage, viewDist) {
    api.dispose(true);
    level = stage.seaLevel ?? 0;
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count;
    g.setAttribute("aEdge", new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    g.setAttribute("normal", new THREE.BufferAttribute(Float32Array.from({ length: n * 3 }, (_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    planeMat = makeWaterMaterial(THREE, SU, { color: 0x2c5a66 });
    planeMat.opacity = 0.9;
    plane = new THREE.Mesh(g, planeMat);
    plane.scale.set(viewDist * 2.4, 1, viewDist * 2.4);
    plane.renderOrder = 2; plane.frustumCulled = false;
    group.add(plane);

    // foam ribbons from waterline crossings of lateral profiles along the road
    const pos = [], uv = [], ph = [], idx = [];
    const lats = []; for (let l = -170; l <= 170; l += 5) lats.push(l);
    const step = Math.max(1, Math.round(9 / (stage.ds || 1)));
    for (let i = 1; i < stage.N - 1; i += step) {
      const tx = stage.px[i + 1] - stage.px[i - 1], tz = stage.pz[i + 1] - stage.pz[i - 1], tl = Math.hypot(tx, tz) || 1;
      const ux = tx / tl, uz = tz / tl, nx = -uz, nz = ux;
      const hs = lats.map((l) => stage.heightAt(stage.px[i] + nx * l, stage.pz[i] + nz * l));
      for (const c of waterlineCrossings(lats, hs, level)) {
        const sx = nx * c.seaward, sz = nz * c.seaward; // unit vector toward the sea
        const cx = stage.px[i] + nx * c.lat, cz = stage.pz[i] + nz * c.lat;
        const L = 5.5, W = 3.2, base = pos.length / 3, y = level + 0.06;
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          pos.push(cx + ux * L * a + sx * W * b, y, cz + uz * L * a + sz * W * b);
          uv.push(a, b); ph.push((i * 0.37) % 1);
        }
        idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      }
    }
    if (idx.length) {
      const fg = new THREE.BufferGeometry();
      fg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      fg.setAttribute("aUv", new THREE.Float32BufferAttribute(uv, 2));
      fg.setAttribute("aPh", new THREE.Float32BufferAttribute(ph, 1));
      fg.setIndex(idx);
      fg.computeBoundingSphere();
      foamMat = new THREE.ShaderMaterial({
        uniforms: { uTime: SU.uTime, uNight: SU.uNight, uTint: { value: new THREE.Color(0.95, 0.97, 1) } },
        vertexShader: FOAM_VERT, fragmentShader: FOAM_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      });
      foam = new THREE.Mesh(fg, foamMat);
      foam.renderOrder = 4; foam.frustumCulled = false;
      group.add(foam);
    }
    api.foamQuads = idx.length / 6;
  }

  const api = {
    group, foamQuads: 0,
    setStage(stage, biome, viewDist) { group.visible = biome === "coast"; if (group.visible) build(stage, viewDist); else api.dispose(true); },
    update(camPos) { if (plane) plane.position.set(camPos.x, level, camPos.z); },
    dispose(keep) {
      for (const m of [plane, foam]) if (m) { group.remove(m); m.geometry.dispose(); m.material.dispose(); }
      plane = foam = null;
      if (!keep) group.clear();
    },
  };
  return api;
}
