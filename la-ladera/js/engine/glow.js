// Light glow (owner: A1). A lamp is too small to be a real light and too many to be geometry, so every glow is one point sprite in a single
// additive draw call:
//   * the street lamps in the light registry (kind 'street'): a warm halo round the lamp head whose size follows the viewing distance in pixels
//     (a lamp 150 m up the street is a star, one 6 m away a soft bloom) and that comes on with the night, together with the emissive lamp head;
//   * the far city: a few thousand 2-3 px lights spread over the distant hillsides where plan.urbanDensity says houses stand, switching on one by
//     one through dusk. farCityLights() is pure and deterministic (it runs under node and is tested there);
//   * ctx.glow.add({ x, y, z, color, size, intensity, blink }) for anything else (the mast beacons on the ridge, shop signs).
// Points are depth-tested against the scene, so a lamp behind a wall or a light behind a ridge is hidden exactly as it should be. Linear HDR:
// the bloom pass picks the cores up. Nothing here is drawn by day (ctx.night < 0.01).
import * as THREE from 'three';

// ---- the far city (pure) -----------------------------------------------------------------------------------------------------
function hash(i, j, s) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function vnoise(x, z, scale, seed) {
  const u = x / scale, v = z / scale, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = fu * fu * (3 - 2 * fu), b = fv * fv * (3 - 2 * fv);
  return mix(mix(hash(i, j, seed), hash(i + 1, j, seed), a), mix(hash(i, j + 1, seed), hash(i + 1, j + 1, seed), a), b);
}
// linear-light colours of the city: sodium orange, warm white, cool white, the odd blue-white neon
const CITY_COLOURS = [[1.0, 0.56, 0.22], [1.0, 0.80, 0.52], [0.85, 0.90, 1.0], [0.55, 0.78, 1.0]];

/**
 * Lights for the land round the plot. far(x, z) = ground height there; density(x, z) = 0..1 how built-up it is (world/periphery.js urbanDensity).
 * Returns [{ x, y, z, rgb: [r, g, b] (linear), size (m), phase, on (0..1: the later the number, the later in the dusk it switches on) }].
 * One candidate per cell x cell square, kept with the probability density * a slow "quarter" noise (bright districts, dark parks), jittered inside its cell.
 */
export function farCityLights({ far, density, seed = 1, half = 100, reach = 744, cell = 12, max = 9000 } = {}) {
  const out = [], n = Math.ceil(reach / cell);                                              // the terrain rings end at +-750 m, the camera's far plane is 900 m
  for (let j = -n; j < n && out.length < max; j++) for (let i = -n; i < n && out.length < max; i++) {
    const cx = (i + 0.5) * cell, cz = (j + 0.5) * cell;
    if (Math.abs(cx) < half + 8 && Math.abs(cz) < half + 8) continue;                       // the plot has its own lamps
    if (cx * cx + cz * cz > 840 * 840) continue;                                            // the corners of the square: too far to be seen from the plot
    const d = density(cx, cz);
    if (!(d > 0.03)) continue;
    const quarter = 0.3 + 0.7 * smooth(0.30, 0.62, vnoise(cx, cz, 80, seed + 7));
    if (hash(i, j, seed) > Math.min(0.9, d * quarter * 1.4)) continue;
    const x = cx + (hash(i, j, seed + 1) - 0.5) * cell * 0.9, z = cz + (hash(i, j, seed + 2) - 0.5) * cell * 0.9;
    const c = hash(i, j, seed + 5), k = c < 0.5 ? 0 : c < 0.8 ? 1 : c < 0.93 ? 2 : 3, glare = 1.1 + 1.6 * hash(i, j, seed + 6) ** 2;
    out.push({
      x, z, y: far(x, z) + 2.4 + 6 * hash(i, j, seed + 3) ** 2,                         // a street lamp or a window: mostly low, a few on roofs
      rgb: CITY_COLOURS[k].map((v) => v * glare), size: 2.4 + 2.4 * hash(i, j, seed + 9),
      phase: hash(i, j, seed + 4), on: hash(i, j, seed + 11),
    });
  }
  return out;
}

// ---- the sprites ---------------------------------------------------------------------------------------------------------------
const VERT = /* glsl */`
attribute vec3 aCol;
attribute vec4 aP;                  // x: halo diameter in metres, y: phase, z: flashes per second (0 = steady), w: when it switches on (< 0: with the street lamps)
uniform float uPx, uTime, uNight, uFog, uMinPx, uMaxPx;
varying vec3 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  float depth = max( -mv.z, 0.05 );
  float want = uPx * aP.x / depth;                                            // pixels the halo would cover
  float on = aP.w < 0.0 ? pow( uNight, 0.8 ) : smoothstep( aP.w * 0.55, aP.w * 0.55 + 0.30, uNight );
  float shimmer = 1.0 + 0.16 * sin( uTime * ( 1.7 + 3.1 * fract( aP.y * 3.7 ) ) + aP.y * 6.2831853 ) * smoothstep( 60.0, 200.0, depth );
  float flash = aP.z > 0.0 ? pow( 0.5 + 0.5 * sin( 6.2831853 * ( uTime * aP.z + aP.y ) ), 8.0 ) : 1.0;
  float amt = on * shimmer * flash * smoothstep( 1.2, 5.0, depth ) * exp( -0.4 * pow( depth * uFog, 2.0 ) ) * clamp( want / uMinPx, 0.25, 1.0 );
  if ( amt < 0.003 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); gl_PointSize = 0.0; vCol = vec3( 0.0 ); return; }
  vCol = aCol * amt;
  gl_PointSize = clamp( want, uMinPx, uMaxPx );
  mv.xyz -= normalize( mv.xyz ) * min( 0.45, depth * 0.03 );                  // a little toward the eye, so the lamp head does not hide its own glow
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vCol;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot( p, p );
  if ( r2 >= 1.0 ) discard;
  float a = ( exp( -r2 * 26.0 ) + 0.30 * exp( -r2 * 5.0 ) ) * ( 1.0 - r2 );
  gl_FragColor = vec4( vCol * a, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Glow {
  constructor(ctx) {
    this.ctx = ctx; this.extra = []; this.street = []; this.far = []; this.points = null; this.dirty = false;
    this.maxPx = 150; this.hwMax = 1024; this._v = new THREE.Vector2();
    this.uniforms = { uPx: { value: 600 }, uTime: { value: 0 }, uNight: { value: 0 }, uFog: { value: 0.003 }, uMinPx: { value: 2 }, uMaxPx: { value: 150 } };
  }

  /** An extra glow: { x, y, z, color (hex), size (halo diameter in m), intensity, blink (flashes per second), on (0..1 dusk order; omit to follow the street lamps) }. */
  add(g) { this.extra.push(g); this.dirty = true; return g; }
  clearExtras() { this.extra.length = 0; this.dirty = true; }

  /** Gather the street lamps and the far city and build the single Points object. Call once the world is complete. */
  finalize({ far, density, seed } = {}) {
    const ctx = this.ctx;
    this.street = (ctx.lights?.list ?? []).filter((l) => l.kind === 'street' && l.on !== false && l.intensity > 0);
    this.far = far && density ? farCityLights({ far, density, seed: seed ?? ctx.plan?.seed ?? 1 }) : [];
    this._build();
  }

  _build() {
    const rows = [], c = new THREE.Color();
    for (const l of this.street) {
      c.set(l.color ?? 0xffc27a);
      const k = 0.9 + Math.min(0.9, l.intensity / 40);                            // the strong lamps (floodlights, the tower) glare more
      rows.push([l.x, l.y ?? 2.4, l.z, c.r * k, c.g * k, c.b * k, 2.4 + Math.min(2.6, l.intensity * 0.07), hash(Math.round(l.x * 10), Math.round(l.z * 10), 3), 0, -1]);
    }
    for (const f of this.far) rows.push([f.x, f.y, f.z, f.rgb[0], f.rgb[1], f.rgb[2], f.size, f.phase, 0, f.on]);
    for (const g of this.extra) {
      c.set(g.color ?? 0xffc27a); const k = g.intensity ?? 1.5;
      rows.push([g.x, g.y, g.z, c.r * k, c.g * k, c.b * k, g.size ?? 2.4, g.phase ?? hash(Math.round(g.x * 10), Math.round(g.z * 10), 5), g.blink ?? 0, g.on ?? -1]);
    }
    const n = rows.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), par = new Float32Array(n * 4);
    rows.forEach((r, i) => { pos.set(r.slice(0, 3), i * 3); col.set(r.slice(3, 6), i * 3); par.set([r[6], r[7], r[8], r[9]], i * 4); });
    if (this.points) { this.ctx.scene.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); this.points = null; }
    this.dirty = false;
    if (!n) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); geo.setAttribute('aP', new THREE.BufferAttribute(par, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, fog: false,
    });
    const pts = this.points = new THREE.Points(geo, mat);
    pts.name = 'glow'; pts.frustumCulled = false; pts.visible = false; pts.castShadow = pts.receiveShadow = false;
    this.ctx.scene.add(pts);
    try { const gl = this.ctx.renderer?.getContext?.(); this.hwMax = gl?.getParameter(gl.ALIASED_POINT_SIZE_RANGE)?.[1] ?? 1024; } catch { /* keep the default */ }
  }

  /** Every frame, before the scene is drawn: the uniforms that follow the clock, the camera and the viewport. */
  sync() {
    const ctx = this.ctx, u = this.uniforms;
    if (this.dirty) this._build();
    const pts = this.points; if (!pts) return;
    const night = ctx.night ?? 0;
    pts.visible = night > 0.01;
    if (!pts.visible) return;
    const r = ctx.renderer, cam = ctx.camera, pr = r.getPixelRatio();
    r.getDrawingBufferSize(this._v);
    u.uPx.value = this._v.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    u.uNight.value = night; u.uTime.value = ctx.look?.time ?? 0; u.uFog.value = ctx.scene.fog?.density ?? 0.003;
    u.uMinPx.value = 2 * pr; u.uMaxPx.value = Math.min(this.maxPx * pr, this.hwMax);
  }

  stats() {
    const p = this.points;
    return { street: this.street.length, far: this.far.length, extra: this.extra.length, drawn: !!p?.visible, points: p ? p.geometry.attributes.position.count : 0 };
  }
}
