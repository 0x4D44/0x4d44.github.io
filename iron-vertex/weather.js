// ============================================================
// Iron Vertex — weather.
//
// Rain and snow, both as ONE draw call each, both locked to the camera.
//
// The trick that makes it cheap is that nothing is simulated on the CPU.
// A fixed cloud of particles is generated once in a box around the
// origin; the whole object is then moved to the camera every frame, and
// the falling happens in the vertex shader as a modulo of elapsed time.
// A particle that reaches the bottom of the box reappears at the top
// because the arithmetic wraps, not because anybody moved it.
//
// Locking the box to the camera means the volume is always exactly where
// it can be seen, so a few thousand particles do the work of the
// hundreds of thousands it would take to fill a city. The eye cannot
// tell: rain has no landmarks.
//
// Rain is drawn as LineSegments — a drop at speed is a streak, not a
// dot, and a streak is what the eye expects. Snow is drawn as points,
// because it is slow enough to see the shape of.
// ============================================================

import * as THREE from "./three.module.min.js";

// The box the particles live in, in metres. Tall enough that the top is
// out of shot when you look up, wide enough to cover a fast pan.
const BOX = { x: 90, y: 60, z: 90 };

export const WEATHER_MODES = ["clear", "rain", "snow"];

function rainMesh(count) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(count * 6);   // two ends per drop
  const seed = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * BOX.x;
    const y = Math.random() * BOX.y;
    const z = (Math.random() - 0.5) * BOX.z;
    const length = 0.7 + Math.random() * 1.4;
    position.set([x, y, z, x, y - length, z], i * 6);
    // Both ends of a drop share a seed, or the streak tears in half.
    const s = Math.random();
    seed.set([s, s], i * 2);
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seed, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.5 },
      uColour: { value: new THREE.Color("#c8d8e8") },
      uTilt: { value: new THREE.Vector2(0.16, 0.05) },
    },
    vertexShader: `
      attribute float seed;
      uniform float uTime;
      uniform vec2 uTilt;
      varying float vFade;
      void main() {
        vec3 p = position;
        float speed = 26.0 + seed * 16.0;
        // The fall, wrapped. mod() is what recycles the drop: no CPU,
        // no buffer update, no per-particle bookkeeping at all.
        float fallen = mod(uTime * speed + seed * ${BOX.y.toFixed(1)}, ${BOX.y.toFixed(1)});
        p.y = mod(p.y - fallen, ${BOX.y.toFixed(1)});
        p.x += uTilt.x * (${BOX.y.toFixed(1)} - p.y);
        p.z += uTilt.y * (${BOX.y.toFixed(1)} - p.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // Fade out at the edge of the box so drops do not pop into
        // existence on a straight wall a few metres away.
        vFade = 1.0 - smoothstep(24.0, 44.0, length(mv.xyz));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColour;
      uniform float uOpacity;
      varying float vFade;
      void main() {
        gl_FragColor = vec4(uColour, uOpacity * vFade);
      }`,
  });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function snowMesh(count) {
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    position.set([
      (Math.random() - 0.5) * BOX.x,
      Math.random() * BOX.y,
      (Math.random() - 0.5) * BOX.z,
    ], i * 3);
    seed[i] = Math.random();
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("seed", new THREE.BufferAttribute(seed, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.85 },
      uColour: { value: new THREE.Color("#f4f8ff") },
      uScale: { value: 1 },
    },
    vertexShader: `
      attribute float seed;
      uniform float uTime;
      uniform float uScale;
      varying float vFade;
      void main() {
        vec3 p = position;
        float speed = 1.7 + seed * 1.8;
        float fallen = mod(uTime * speed + seed * ${BOX.y.toFixed(1)}, ${BOX.y.toFixed(1)});
        p.y = mod(p.y - fallen, ${BOX.y.toFixed(1)});
        // Snow does not fall straight; it wanders. Two sines out of
        // phase are enough to read as drifting.
        p.x += sin(uTime * 0.6 + seed * 31.0) * 2.4;
        p.z += cos(uTime * 0.47 + seed * 17.0) * 2.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vFade = 1.0 - smoothstep(26.0, 46.0, length(mv.xyz));
        gl_PointSize = (5.0 + seed * 7.0) * uScale / max(1.0, -mv.z * 0.06);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColour;
      uniform float uOpacity;
      varying float vFade;
      void main() {
        // Round flakes: a square one reads as a bug, not as snow.
        vec2 d = gl_PointCoord - 0.5;
        float mask = 1.0 - smoothstep(0.32, 0.5, length(d));
        if (mask <= 0.01) discard;
        gl_FragColor = vec4(uColour, uOpacity * vFade * mask);
      }`,
  });
  const mesh = new THREE.Points(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

export function buildWeather({ rainCount = 2600, snowCount = 1400 } = {}) {
  const group = new THREE.Group();
  const rain = rainMesh(rainCount);
  const snow = snowMesh(snowCount);
  rain.visible = false;
  snow.visible = false;
  group.add(rain);
  group.add(snow);

  let mode = "clear";
  let density = 1;

  return {
    group,
    get mode() { return mode; },

    setMode(next) {
      mode = WEATHER_MODES.includes(next) ? next : "clear";
      rain.visible = mode === "rain";
      snow.visible = mode === "snow";
    },

    // The quality ladder thins the weather before it touches shadows: a
    // thousand fewer raindrops is cheaper to lose than every shadow in
    // the park, and much harder to notice.
    setDensity(value) {
      density = Math.min(1, Math.max(0, value));
      rain.geometry.setDrawRange(0, Math.round(rainCount * 2 * density));
      snow.geometry.setDrawRange(0, Math.round(snowCount * density));
    },

    // How much the world should be darkened and dampened. The renderer
    // reads it rather than the weather doing the darkening itself,
    // because "wet" is a property of the ground, not of the rain.
    get wetness() {
      return mode === "rain" ? 1 : mode === "snow" ? 0.35 : 0;
    },

    update(elapsed, camera) {
      if (mode === "clear") return;
      // The box follows the camera. Rounded to whole metres so the
      // particles are not sliding a fraction of a millimetre every
      // frame, which reads as a shimmer.
      group.position.set(
        Math.round(camera.position.x),
        Math.round(camera.position.y) - BOX.y * 0.45,
        Math.round(camera.position.z),
      );
      const target = mode === "rain" ? rain : snow;
      target.material.uniforms.uTime.value = elapsed;
    },
  };
}
