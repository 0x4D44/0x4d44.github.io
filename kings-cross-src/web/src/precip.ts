// Rain and snow as two bounded GPU draws: one LineSegments (rain streaks) and one Points (snow flakes), a few thousand vertices in all.
// Nothing is simulated on the CPU. Each drop's seed is fixed in its vertex; the vertex shader places it from the clock, so a frame
// costs two uniform updates. The drops fill a box that lies between the camera and what it is looking at (the orbit target), as wide
// as the view is deep: near a train the box is a few metres across and the streaks short, from the default view it is a few hundred
// metres and the streaks long, and the drops on screen look about the same either way. The drops fade toward the box's edges, so
// nothing pops as the box moves.
import * as THREE from 'three';

/** The most streaks and flakes ever drawn: the buffers are built once at this size and `drawRange` shows a share of them. */
export const RAIN_STREAKS = 3200;
export const SNOW_FLAKES = 2400;
/** The widest the box of drops ever is, metres: beyond this a drop is too thin to see. */
export const MAX_WIDTH = 560;
/** Snow falls in a box this much of the rain's width (and so denser): flakes are few and need to be near to be seen. */
export const SNOW_SCALE = 0.6;

export interface PrecipFrame {
  /** seconds on any steady clock */
  timeS: number;
  /** the point the viewer is looking at, metres */
  target: THREE.Vector3;
  /** where the viewer is, metres */
  camera: THREE.Vector3;
  /** camera to target, metres */
  distance: number;
  /** 0..1 */
  rain: number;
  /** 0..1 */
  snow: number;
  /** wind, metres per second, blowing toward +x and +z by this much */
  windMs: number;
  /** 0 (night) to 1 (day): the drops are lighter by day */
  daylight: number;
}

export interface Precip {
  group: THREE.Group;
  rain: THREE.LineSegments;
  snow: THREE.Points;
  update(frame: PrecipFrame): void;
  /** what is drawn, for tests and the dev page */
  stats(): { rainVertices: number; snowPoints: number; drawCalls: number };
  dispose(): void;
}

/** A small deterministic generator, so every load draws the same rain. */
function lcg(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

/** How much of a drop shows: faded at the box's edges, far from the camera, very near it, and where it enters and leaves at the top and the ground. */
const FADE = /* glsl */`
float dropFade(vec3 world, float cycle) {
  vec2 off = abs(world.xz - uCentre.xz) / (0.5 * uBox.xz);
  float edge = 1.0 - smoothstep(0.7, 1.0, max(off.x, off.y));
  float reach = 1.1 * max(uBox.x, uBox.z);
  float d = length(world - cameraPosition);
  return edge * (1.0 - smoothstep(0.7 * reach, reach, d)) * smoothstep(0.5, 3.0, d)
    * smoothstep(0.0, 0.04, cycle) * (1.0 - smoothstep(0.96, 1.0, cycle));
}
`;

const RAIN_VERTEX = /* glsl */`
uniform float uTime;
uniform vec3 uCentre;
uniform vec3 uBox;
uniform float uFall;
uniform float uLen;
uniform vec2 uWind;
uniform float uOpacity;
attribute vec2 aRand; // x: speed jitter, y: 0 at the streak's tail, 1 at its head
varying float vAlpha;
${FADE}
float wrap1(float v) { return v - floor(v); }
void main() {
  float speed = uFall * (0.85 + 0.3 * aRand.x);
  float cycle = wrap1(position.y - uTime * speed / uBox.y); // 1 at the top of the box, falling to 0 at the ground
  float sinceTop = (1.0 - cycle) * uBox.y / speed;
  vec2 across = vec2(position.x * uBox.x + uWind.x * sinceTop, position.z * uBox.z + uWind.y * sinceTop);
  // the lattice is fixed in the world and repeats every box, so the rain does not slide with the box as the view moves
  vec3 p = vec3(
    uCentre.x + (wrap1((across.x - uCentre.x) / uBox.x) - 0.5) * uBox.x,
    cycle * uBox.y,
    uCentre.z + (wrap1((across.y - uCentre.z) / uBox.z) - 0.5) * uBox.z);
  vec3 dir = normalize(vec3(uWind.x, -speed, uWind.y));
  vec3 world = p - dir * uLen * (1.0 - aRand.y);
  vAlpha = uOpacity * dropFade(world, cycle);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const RAIN_FRAGMENT = /* glsl */`
uniform vec3 uColor;
varying float vAlpha;
void main() {
  gl_FragColor = vec4(uColor, vAlpha);
}
`;

const SNOW_VERTEX = /* glsl */`
uniform float uTime;
uniform vec3 uCentre;
uniform vec3 uBox;
uniform float uFall;
uniform vec2 uWind;
uniform float uOpacity;
uniform float uSize;
attribute vec2 aRand;
varying float vAlpha;
${FADE}
float wrap1(float v) { return v - floor(v); }
void main() {
  float speed = uFall * (0.7 + 0.6 * aRand.x);
  float cycle = wrap1(position.y - uTime * speed / uBox.y);
  float sinceTop = (1.0 - cycle) * uBox.y / speed;
  float sway = sin(uTime * (0.6 + aRand.y) + position.z * 40.0) * 0.02 * uBox.x;
  vec2 across = vec2(position.x * uBox.x + uWind.x * sinceTop + sway, position.z * uBox.z + uWind.y * sinceTop + sway * 0.7);
  vec3 world = vec3(
    uCentre.x + (wrap1((across.x - uCentre.x) / uBox.x) - 0.5) * uBox.x,
    cycle * uBox.y,
    uCentre.z + (wrap1((across.y - uCentre.z) / uBox.z) - 0.5) * uBox.z);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vAlpha = uOpacity * dropFade(world, cycle);
  gl_PointSize = clamp(uSize * 420.0 / max(-mv.z, 0.1), 2.0, 6.5);
  gl_Position = projectionMatrix * mv;
}
`;

const SNOW_FRAGMENT = /* glsl */`
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - vec2(0.5));
  gl_FragColor = vec4(uColor, vAlpha * (1.0 - smoothstep(0.18, 0.5, r)));
}
`;

export function createPrecip(): Precip {
  const rand = lcg(20261109);
  // rain: 2 vertices per streak. `position` holds the streak's seed (x, y, z in 0..1), aRand its jitter and which end it is.
  const rainSeed = new Float32Array(RAIN_STREAKS * 2 * 3);
  const rainRand = new Float32Array(RAIN_STREAKS * 2 * 2);
  for (let i = 0; i < RAIN_STREAKS; i++) {
    const x = rand(), y = rand(), z = rand(), j = rand();
    for (let end = 0; end < 2; end++) {
      const v = i * 2 + end;
      rainSeed.set([x, y, z], v * 3);
      rainRand.set([j, end], v * 2);
    }
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainSeed, 3));
  rainGeometry.setAttribute('aRand', new THREE.BufferAttribute(rainRand, 2));
  const rainUniforms = {
    uTime: { value: 0 }, uCentre: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(100, 100, 100) }, uFall: { value: 9 },
    uLen: { value: 3 }, uWind: { value: new THREE.Vector2() }, uOpacity: { value: 0 }, uColor: { value: new THREE.Vector3(0.8, 0.85, 0.92) },
  };
  const rainMaterial = new THREE.ShaderMaterial({ vertexShader: RAIN_VERTEX, fragmentShader: RAIN_FRAGMENT, uniforms: rainUniforms, transparent: true, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.name = 'rain';
  rain.frustumCulled = false;
  rain.renderOrder = 10;
  rain.visible = false;

  const snowSeed = new Float32Array(SNOW_FLAKES * 3);
  const snowRand = new Float32Array(SNOW_FLAKES * 2);
  for (let i = 0; i < SNOW_FLAKES; i++) {
    snowSeed.set([rand(), rand(), rand()], i * 3);
    snowRand.set([rand(), rand()], i * 2);
  }
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowSeed, 3));
  snowGeometry.setAttribute('aRand', new THREE.BufferAttribute(snowRand, 2));
  const snowUniforms = {
    uTime: { value: 0 }, uCentre: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(100, 100, 100) }, uFall: { value: 1.2 },
    uWind: { value: new THREE.Vector2() }, uOpacity: { value: 0 }, uSize: { value: 0.06 }, uColor: { value: new THREE.Vector3(0.95, 0.97, 1) },
  };
  const snowMaterial = new THREE.ShaderMaterial({ vertexShader: SNOW_VERTEX, fragmentShader: SNOW_FRAGMENT, uniforms: snowUniforms, transparent: true, depthWrite: false });
  const snow = new THREE.Points(snowGeometry, snowMaterial);
  snow.name = 'snow';
  snow.frustumCulled = false;
  snow.renderOrder = 10;
  snow.visible = false;

  const group = new THREE.Group();
  group.name = 'precipitation';
  group.add(rain, snow);

  return {
    group, rain, snow,
    update(f) {
      const rainShown = Math.round(RAIN_STREAKS * Math.min(1, Math.max(0, f.rain)));
      const snowShown = Math.round(SNOW_FLAKES * Math.min(1, Math.max(0, f.snow)));
      rain.visible = rainShown > 0;
      snow.visible = snowShown > 0;
      if (!rain.visible && !snow.visible) return;
      // The box is a little wider than the view is deep (16 m near a train to 560 m from the default view) and four fifths as tall. It
      // lies between the camera and the target: centred halfway, or, when the view is deeper than the box, so that the camera is well inside.
      const dx = f.target.x - f.camera.x;
      const dz = f.target.z - f.camera.z;
      const across = Math.hypot(dx, dz);
      const place = (width: number, out: THREE.Vector3): void => {
        const along = across > 1e-6 ? Math.min(across * 0.5, width * 0.45) / across : 0;
        out.set(f.camera.x + dx * along, 0, f.camera.z + dz * along);
      };
      const width = Math.min(MAX_WIDTH, Math.max(16, f.distance * 1.2));
      const height = width * 0.8;
      const wind = Math.min(8, Math.max(0, f.windMs));
      if (rain.visible) {
        rainGeometry.setDrawRange(0, rainShown * 2);
        rainUniforms.uTime.value = f.timeS;
        place(width, rainUniforms.uCentre.value);
        rainUniforms.uBox.value.set(width, height, width);
        // fast enough that the apparent motion is the same near and far: a wider box falls proportionally faster
        rainUniforms.uFall.value = (9 + 2 * f.rain) * Math.min(8, Math.max(1, width / 40));
        rainUniforms.uLen.value = Math.min(9, Math.max(0.5, width * 0.035));
        rainUniforms.uWind.value.set(wind * 0.5, wind * 0.3);
        rainUniforms.uOpacity.value = (0.18 + 0.32 * f.rain) * (0.45 + 0.55 * f.daylight);
        rainUniforms.uColor.value.set(0.55 + 0.3 * f.daylight, 0.62 + 0.28 * f.daylight, 0.72 + 0.2 * f.daylight);
      }
      if (snow.visible) {
        snowGeometry.setDrawRange(0, snowShown);
        snowUniforms.uTime.value = f.timeS;
        const snowWidth = Math.max(16, width * SNOW_SCALE);
        place(snowWidth, snowUniforms.uCentre.value);
        snowUniforms.uBox.value.set(snowWidth, snowWidth * 0.8, snowWidth);
        snowUniforms.uFall.value = 1.2 * Math.min(4, Math.max(1, snowWidth / 60));
        snowUniforms.uWind.value.set(wind * 0.4, wind * 0.25);
        snowUniforms.uOpacity.value = (0.5 + 0.4 * f.snow) * (0.55 + 0.45 * f.daylight);
        snowUniforms.uSize.value = Math.min(0.2, Math.max(0.05, snowWidth * 0.0022));
        snowUniforms.uColor.value.set(0.7 + 0.28 * f.daylight, 0.74 + 0.25 * f.daylight, 0.82 + 0.18 * f.daylight);
      }
    },
    stats() {
      return { rainVertices: rain.visible ? rainGeometry.drawRange.count : 0, snowPoints: snow.visible ? snowGeometry.drawRange.count : 0, drawCalls: (rain.visible ? 1 : 0) + (snow.visible ? 1 : 0) };
    },
    dispose() {
      rainGeometry.dispose(); rainMaterial.dispose(); snowGeometry.dispose(); snowMaterial.dispose();
    },
  };
}
