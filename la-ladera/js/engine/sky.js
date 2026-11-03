// Procedural sky dome (owner: A1). One cheap fragment shader: zenith->horizon gradient whose horizon band equals the fog
// colour (+ the same sun-scatter glow as shaderpatch.js, so distant geometry dissolves into it), a sun disc and halo, thin
// golden-hour clouds lit from the sun side, stars + moon at night, a dim ground colour below the horizon.
// The dome is drawn last at the far plane (early-z rejects everything covered by geometry). Everything is linear HDR.
import * as THREE from 'three';

// The glow of the lights on the air above them (round 8): the valley city is gone from the plan, and the lights on the horizon are the village on the west headland: 163 houses and about 470 lit windows against the city's 1,500,
// seen from the plaza at atan(x, z) = atan(-0.777, 0.629) = -0.89 rad (west-south-west). The glow is centred there, narrow, and thin; `citySector` is the shader's sector in JS, which is what tests/engine-sky.test.mjs holds the shape of.
export const CITY_GLOW = Object.freeze({ centre: -0.89, inner: 0.12, outer: 0.50, floor: 0.04, gain: 0.05 });
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The glow's share at the azimuth `a` = atan(rd.x, rd.z) (0 due south, negative toward the west): 1 over the headland, the floor beyond it. */
export function citySector(a) {
  let d = Math.abs(a - CITY_GLOW.centre); if (d > Math.PI) d = 2 * Math.PI - d;
  return CITY_GLOW.floor + (1 - CITY_GLOW.floor) * (1 - smoothstep(CITY_GLOW.inner, CITY_GLOW.outer, d));
}
const f3 = (x) => x.toFixed(3);

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  #ifdef USE_REVERSED_DEPTH_BUFFER
  gl_Position = vec4( p.xy, 0.0, p.w );     // reversed-Z: the far plane is depth 0
  #else
  gl_Position = p.xyww;                     // the far plane is depth 1
  #endif
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uGround, uSunCol, uGlowCol;
uniform float uGlowAmt, uStars, uTime, uCloudAmt, uSunVis, uMoonVis, uAspect, uCity;

float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float hash13( vec3 p3 ) { p3 = fract( p3 * 0.1031 ); p3 += dot( p3, p3.zyx + 31.32 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash12( i ), hash12( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash12( i + vec2( 0.0, 1.0 ) ), hash12( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float fbm( vec2 p ) {
  float a = 0.5, s = 0.0;
  for ( int i = 0; i < 5; i ++ ) { s += a * vnoise( p ); p = p * 2.03 + vec2( 17.1, 9.2 ); a *= 0.5; }
  return s;
}
float starField( vec3 rd ) {
  vec3 p = rd * 150.0, id = floor( p ), f = fract( p ) - 0.5;
  float h = hash13( id );
  if ( h < 0.985 ) return 0.0;
  vec3 o = vec3( hash13( id + 1.7 ), hash13( id + 3.1 ), hash13( id + 5.3 ) ) - 0.5;
  float d = length( f - o * 0.7 );
  float mag = 0.35 + 1.65 * hash13( id + 9.9 );
  float tw = 0.75 + 0.25 * sin( uTime * ( 1.5 + 3.0 * hash13( id + 2.2 ) ) + h * 80.0 );
  return smoothstep( 0.16, 0.0, d ) * mag * tw;
}
// The glow of the far village on the air above it: orange, hugging the horizon, over the west headland (CITY_GLOW above: about -0.89 rad, narrow), thin,
// patchy where the lanes are. The lights themselves are real points on the far hillside (engine/glow.js): the terrain ring covers everything of the
// dome below the horizon. Fades in with uCity at dusk.
vec3 cityGlow( vec3 rd ) {
  float h = rd.y, a = atan( rd.x, rd.z );
  float d = abs( a - ${f3(CITY_GLOW.centre)} ); d = min( d, 6.2831853 - d );
  float sector = ${f3(CITY_GLOW.floor)} + ${f3(1 - CITY_GLOW.floor)} * ( 1.0 - smoothstep( ${f3(CITY_GLOW.inner)}, ${f3(CITY_GLOW.outer)}, d ) );
  float districts = 0.55 + 0.45 * vnoise( vec2( a * 5.0, 1.0 ) + 3.0 );
  return vec3( 0.95, 0.50, 0.22 ) * ${f3(CITY_GLOW.gain)} * sector * districts * exp( -abs( h ) * 13.0 ) * ( h > 0.0 ? 1.0 : 0.6 );
}

void main() {
  vec3 rd = normalize( vDir );
  float h = rd.y;
  // base gradient: zenith <- horizon haze -> dim ground below
  vec3 sky = mix( uHorizon, uZenith, pow( clamp( h, 0.0, 1.0 ), 0.5 ) );
  vec3 gnd = mix( uHorizon, uGround, smoothstep( 0.0, -0.30, h ) );
  vec3 col = mix( sky, gnd, smoothstep( 0.0, -0.012, h ) );
  float sd = max( dot( rd, uSunDir ), 0.0 );
  // sun scatter: IDENTICAL to the fog formula (shaderpatch.js), fading with height so the zenith stays clean
  col += uGlowCol * ( pow( sd, 4.0 ) * 0.35 + pow( sd, 20.0 ) * 0.65 ) * uGlowAmt * ( 1.0 - smoothstep( 0.0, 0.75, max( h, 0.0 ) ) );
  // clouds (thin, high; lit from the sun side)
  float cov = 0.0;
  if ( h > 0.0 && uCloudAmt > 0.01 ) {
    vec2 uv = rd.xz / ( h + 0.14 ) * 0.33 + vec2( uTime * 0.0035, uTime * 0.0012 );
    float c = fbm( uv * 1.7 + 3.0 );
    float cs = fbm( ( uv + normalize( uSunDir.xz + 1e-4 ) * 0.06 ) * 1.7 + 3.0 );
    float streak = fbm( vec2( uv.x * 0.45, uv.y * 3.2 ) + 11.0 );
    cov = max( smoothstep( 0.54 - 0.16 * uCloudAmt, 0.9, c ), smoothstep( 0.55, 0.92, streak ) * 0.55 ) * smoothstep( 0.0, 0.16, h ) * uCloudAmt;
    float lit = clamp( 0.55 + ( c - cs ) * 3.2, 0.0, 1.0 );
    vec3 shade = mix( uHorizon, uZenith, 0.4 ) * 0.78;
    vec3 bright = uSunCol * ( 0.85 + 0.9 * pow( sd, 3.0 ) ) + uHorizon * 0.25;
    col = mix( col, mix( shade, bright, lit ), cov * 0.92 );
  }
  // sun disc + tight halo (HDR so the bloom pass makes it glow)
  float vis = smoothstep( -0.02, 0.01, h );
  col += uSunCol * ( smoothstep( 0.99974, 0.99987, sd ) * 24.0 + pow( sd, 400.0 ) * 1.4 ) * uSunVis * vis * ( 1.0 - cov * 0.8 );
  // moon
  float md = max( dot( rd, uMoonDir ), 0.0 );
  col += vec3( 0.82, 0.88, 1.0 ) * ( smoothstep( 0.99984, 0.99991, md ) * 4.5 + pow( md, 160.0 ) * 0.22 ) * uMoonVis * vis * ( 1.0 - cov * 0.9 );
  // stars
  if ( uStars > 0.01 && h > 0.0 ) col += vec3( 0.85, 0.9, 1.0 ) * starField( rd ) * uStars * smoothstep( 0.0, 0.12, h ) * ( 1.0 - cov );
  if ( uCity > 0.01 && abs( h ) < 0.5 ) col += cityGlow( rd ) * uCity;
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky() {
  const u = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uZenith: { value: new THREE.Color(0x3866ad) }, uHorizon: { value: new THREE.Color(0xe9b58c) }, uGround: { value: new THREE.Color(0x2a2118) },
    uSunCol: { value: new THREE.Color(1, 0.65, 0.35) }, uGlowCol: { value: new THREE.Color(1, 0.62, 0.35) },
    uGlowAmt: { value: 0.4 }, uStars: { value: 0 }, uTime: { value: 0 }, uCloudAmt: { value: 0.6 }, uSunVis: { value: 1 }, uMoonVis: { value: 0 }, uAspect: { value: 1 }, uCity: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
  mat.depthFunc = THREE.LessEqualDepth;
  const geo = new THREE.SphereGeometry(1, 40, 20);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky'; mesh.frustumCulled = false; mesh.renderOrder = 100000; mesh.castShadow = mesh.receiveShadow = false;
  // second mesh for the PMREM capture (separate scene, same material)
  const envScene = new THREE.Scene();
  const envMesh = new THREE.Mesh(geo, mat); envMesh.frustumCulled = false; envScene.add(envMesh);
  return { mesh, material: mat, uniforms: u, envScene };
}
