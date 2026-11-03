// THE SEA (A1, dev/FEATURE-BEACH.md 2.1): the water south of the beach, three world-fixed transparent meshes and ONE shader.
//
//   const water = buildWater(ctx);     adds `water.group` to ctx.scene, registers ctx.addSystem('water', update, 5) and sets ctx.sea
//   water.group.visible = false        costs nothing: three skips the whole group, the system only advances the clock
//   water.setQuality('high' | 'medium' | 'low')      (it also follows ctx.quality and the 'quality:change' event)
//   water.ready                        resolves when the three textures are in (until then the water draws flat and without foam or caustics)
//   water.dispose()
//
//   ctx.sea = { state, time, level(x, z, t?), depth(x, z, t?), slope(x, z, t?) }
//     state      { wind, amp[4] } the live sea state (core/sea.js seaState(ctx.hour)), updated every frame
//     time       seconds the swell has run (a getter). It keeps counting while the group is hidden, so a sea that comes back is where it should be
//     level      the swell's height above the still sea at (x, z) now (or at t): core/sea.js `level` times nearWeight, i.e. exactly the surface the near mesh draws (the mid and far meshes are flat)
//     depth      still sea level + level - the ground: the water over the ground at (x, z), negative on land. The ground is plan.coast.heightAt for |x| <= 100 and plan._far beyond
//     slope      [dh/dx, dh/dz] of that surface: the product rule, w dh + h dw (the weight is flat nearly everywhere, but not on the last 24 m before the near mesh's seams)
//
// The meshes: NEAR x +-132, z 118..262 (2.4 m cells), MID x +-480, z 118..598 (12 m cells), FAR x +-960, z 118..982 (96 m cells, flat). Each carries a per-vertex
// `aBed` = the ground height under the vertex, so the shader knows the depth without a depth pass: depth = surface - bed. A fragment more than 2 cm over dry ground is discarded.
// Only the NEAR mesh moves (core/sea.js waves in the vertex shader, fading to nothing where its box ends); the shading, though, reads the swell's analytic gradient everywhere
// (each wave fading before it can alias), so a flat mesh still shows the swell and the glitter.
// Where the meshes meet there is no seam to crack. The layout (core/sea.js seaGrid) makes the three meshes share every vertex along their joins: the coarse mesh leaves out the cells inside the finer
// one's box and cuts the cells along its edge into fans through the finer mesh's vertices, and every vertex is a point of a 0.4 m lattice, so a shared vertex is the same float in both. A rasterizer
// never leaves a gap or draws twice along an edge two triangles share, so no pixel (and no MSAA sample) along a join is missed or blended twice, from the air or at the grazing angle of a person's eye.
// (Meshes that merely abut, or that overlap and let each pixel shader keep what lies inside its own box, left pinholes: a pixel here and there showing the sea bed through the sea.)
//
// Draw order: the group sorts first among the transparent things (renderOrder -10), so glass, glow sprites and splashes in front of the sea draw over it; whatever lies UNDER the sea
// and is transparent (seagrass cards, fish) must have a renderOrder below -10 to be blended by it. One draw call per mesh.
// Culling: three culls a mesh by its bounding SPHERE, and the sphere of a 264 x 144 m box holds the player whatever way he looks, so the near mesh would draw behind his back. `water.cull`
// (a THREE.LOD node, whose update() three calls at render time with the real camera) tests the three boxes against the frustum instead and shows or hides the meshes.
// Colour: premultiplied alpha, linear HDR into the post chain's target (the tone mapping and sRGB chunks do nothing there; they only matter if the chain is down). The fog is FogExp2 of
// scene.fog with the same sun-scatter glow as the standard materials (engine/shaderpatch.js), applied by hand.
import * as THREE from 'three';
import { SEA, BAY_X } from '../world/coast.js';
import { makeFarHeight } from '../world/periphery.js';
import { lookUniforms } from './shaderpatch.js';
import { SHADER, NEAR, PEAK, CALM, MESH, seaMeshes, seaState, level as swellLevel, slope as swellSlope, nearWeight, nearWeightGrad, waveAmps, waveTime } from '../core/sea.js';

// ---- the geometry -----------------------------------------------------------------------------------------------------------------------
const QUALITY_LEVEL = { low: 0, medium: 1, high: 2 };

/** A BufferGeometry from one of core/sea.js' grids ({ pos: x, z per vertex, idx, tris }): the sea level for y and the ground height under each vertex for `aBed`. The wave amplitude is part of its
 *  bounds: two unused vertices at SEA +- PEAK, so that any recomputation of the box or the sphere keeps it. */
function toGeometry(grid, bed) {
  const n = grid.pos.length / 2, pos = new Float32Array((n + 2) * 3), bd = new Float32Array(n + 2);
  for (let i = 0; i < n; i++) { const x = grid.pos[2 * i], z = grid.pos[2 * i + 1]; pos[3 * i] = x; pos[3 * i + 1] = SEA; pos[3 * i + 2] = z; bd[i] = bed(x, z); }
  const x0 = grid.pos[0], z0 = grid.pos[1];
  pos.set([x0, SEA + PEAK, z0, x0, SEA - PEAK, z0], 3 * n); bd[n] = bd[n + 1] = SEA;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aBed', new THREE.BufferAttribute(bd, 1));
  g.setIndex(new THREE.BufferAttribute(n + 2 > 65535 ? grid.idx : Uint16Array.from(grid.idx), 1));
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.triangles = grid.tris;
  return g;
}

// ---- the shader -----------------------------------------------------------------------------------------------------------------------
/** The wave sum, shared by the vertex shader, the fragment shader and the page test's parity probe. The uniforms are core/sea.js' (SHADER, waveAmps, waveTime). */
export const WAVE_GLSL = /* glsl */`
uniform vec4 uWk, uWx, uWz, uWp, uWa, uWt;       // wavenumber, direction x, direction z, phase, live amplitude (m), omega * t reduced to a turn
float waveHeight( vec2 p ) { return dot( uWa, sin( uWk * ( uWx * p.x + uWz * p.y ) - uWt + uWp ) ); }
`;

const VERT = /* glsl */`
${WAVE_GLSL}
attribute float aBed;
uniform vec4 uBox;                               // the near mesh's box: half width, south end, fade length
uniform float uDisp;                             // 1 on the mesh that moves
varying vec3 vPos;
varying float vBed;
varying float vFogDepth;

void main() {
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  if ( uDisp > 0.5 ) {
    float d = min( uBox.x - abs( wp.x ), uBox.y - wp.z ), t = clamp( d / uBox.z, 0.0, 1.0 );
    wp.y += waveHeight( wp.xz ) * ( t * t * ( 3.0 - 2.0 * t ) );
  }
  vPos = wp.xyz; vBed = aBed;
  vec4 vp = viewMatrix * wp;
  vFogDepth = - vp.z;
  gl_Position = projectionMatrix * vp;
}`;

const FRAG = /* glsl */`
${WAVE_GLSL}
uniform vec3 uZenith, uHorizon, uSunDir, uSunCol, uMoonDir, uGlowCol, uFogColor, ladGlowCol;
uniform float uGlowAmt, uSunVis, uMoonVis, uFogDensity, ladGlowAmt, uWindF, uAmpSum, uRip, uPix;
uniform vec4 uFlow, uFlow2;
uniform vec2 uFlow3;
uniform sampler2D tNormal, tFoam, tCaustic;
varying vec3 vPos;
varying float vBed;
varying float vFogDepth;

const vec3 SHALLOW = vec3( 0.18, 0.72, 0.70 ), DEEP = vec3( 0.015, 0.20, 0.34 );
const vec2 NMEAN = vec2( -0.1133, -0.0097 );     // the mean of the ripple map's x and y: taken out so the surface does not lean

vec3 skyColor( vec3 r ) {                        // the sky dome's gradient and sun glow (engine/sky.js), without clouds, stars and discs
  float h = max( r.y, 0.0 );
  vec3 c = mix( uHorizon, uZenith, pow( h, 0.5 ) );
  float sd = max( dot( r, uSunDir ), 0.0 );
  return c + uGlowCol * ( pow( sd, 4.0 ) * 0.35 + pow( sd, 20.0 ) * 0.65 ) * uGlowAmt * ( 1.0 - smoothstep( 0.0, 0.75, h ) );
}

void main() {
  float depth = vPos.y - vBed;
  float dw = fwidth( depth );                    // (before the discard: derivatives want every pixel of the quad) a foam rim a few pixels wide however the ground lies
  if ( depth < -0.02 ) discard;                  // dry land (the water only shows on sand where the swash covers it)
  vec3 toCam = cameraPosition - vPos;
  float dist = length( toCam );
  vec3 V = toCam / dist;

  // ---- the surface normal: the swell's analytic gradient, a slow irregular swell, and two scrolling layers of ripples. Each fades out as the ground one pixel covers along the line
  // of sight (fp, metres: it grows with the square of the distance at a low eye) outgrows its wavelength, so the far sea goes flat and melts into the horizon, and nothing aliases.
  float fp = dist * uPix / max( V.y, 0.012 );
  vec2 g = vec2( 0.0 );
  float hn = 0.0;
  vec4 ph = uWk * ( uWx * vPos.x + uWz * vPos.z ) - uWt + uWp;
  #if WATER_QUALITY >= 1
    vec4 lam = 6.2831853 / uWk;
    vec4 aw = uWa * ( 1.0 - smoothstep( lam * 0.25, lam * 1.0, vec4( fp ) ) );
    vec4 ac = aw * uWk * cos( ph );
    g = vec2( dot( ac, uWx ), dot( ac, uWz ) );
    hn = dot( aw, sin( ph ) ) / max( uAmpSum, 0.001 );        // the swell's height here as a share of its full height, -1..1
    vec2 q1 = texture2D( tNormal, vPos.xz * ( 1.0 / 6.0 ) + uFlow.xy ).rg * 2.0 - 1.0 - NMEAN;
    vec2 q2 = texture2D( tNormal, vec2( vPos.x * 0.8 + vPos.z * 0.6, vPos.z * 0.8 - vPos.x * 0.6 ) * ( 1.0 / 4.3 ) + uFlow.zw ).rg * 2.0 - 1.0 - NMEAN;
    q2 = vec2( 0.8 * q2.x - 0.6 * q2.y, 0.6 * q2.x + 0.8 * q2.y );
    vec2 q3 = texture2D( tNormal, vPos.xz * ( 1.0 / 53.0 ) + uFlow3 ).rg * 2.0 - 1.0 - NMEAN;
    g += ( q1 + q2 ) * ( 0.5 * uRip * ( 1.0 - smoothstep( 0.4, 5.0, fp ) ) ) + q3 * ( 0.17 * ( 1.0 - smoothstep( 3.0, 40.0, fp ) ) );
  #endif
  vec3 N = normalize( vec3( - g.x, 1.0, - g.y ) );

  // ---- light: the sky's own uniforms, so the sea follows the hour. E is the irradiance the water body is lit with.
  float up = max( uSunDir.y, 0.0 );
  vec3 E = uSunCol * ( up * 0.9 * uSunVis ) + mix( uHorizon, uZenith, 0.5 ) * 0.55 + vec3( 0.010, 0.016, 0.034 ) + vec3( 0.7, 0.8, 1.0 ) * ( 0.03 * uMoonVis * max( uMoonDir.y, 0.0 ) );

  // ---- colour by depth, and how much of the bed shows through
  float tD = smoothstep( 0.1, 2.5, depth );
  vec3 body = mix( SHALLOW, DEEP, tD ) * E;
  float aBody = mix( 0.35, 0.96, tD );

  // ---- Fresnel, the sky in the water, the sun and moon glitter
  float F = 0.02 + 0.98 * pow( 1.0 - clamp( dot( N, V ), 0.0, 1.0 ), 5.0 );
  vec3 R = reflect( - V, N ); R.y = abs( R.y );
  vec3 refl = skyColor( R );
  vec3 spec = vec3( 0.0 );
  #if WATER_QUALITY >= 1
    float rs = max( dot( R, uSunDir ), 0.0 ), rm = max( dot( R, uMoonDir ), 0.0 );
    float sharp = 1.0 - smoothstep( 2.0, 8.0, fp );                                   // the sparkle lobe goes where a pixel is wider than the facets that make it
    spec = uSunCol * ( pow( rs, 1400.0 ) * 18.0 * sharp + pow( rs, 180.0 ) * 1.1 + pow( rs, 24.0 ) * 0.05 ) * uSunVis
         + vec3( 0.8, 0.88, 1.0 ) * ( pow( rm, 900.0 ) * 6.0 * sharp + pow( rm, 90.0 ) * 0.18 ) * uMoonVis;
  #endif

  // ---- the water layer, premultiplied: what it adds, and how much of what lies behind it still shows
  vec3 C = ( 1.0 - F ) * aBody * body + F * refl + spec;
  float T = ( 1.0 - F ) * ( 1.0 - aBody );

  #if WATER_QUALITY >= 2
    // caustics on the bed, seen through the shallows: the tile is read where the refracted view ray meets the bed
    vec2 bedXZ = vPos.xz - V.xz / max( V.y, 0.25 ) * depth * 0.75;
    float c1 = texture2D( tCaustic, bedXZ * 0.25 + uFlow2.zw ).r, c2 = texture2D( tCaustic, bedXZ.yx * 0.19 - uFlow2.zw * 0.7 ).r;
    float caust = ( c1 * c2 * 3.0 + ( c1 + c2 ) * 0.25 ) * smoothstep( 0.1, 0.4, depth ) * ( 1.0 - smoothstep( 1.2, 3.8, depth ) );
    C += caust * 0.45 * vec3( 1.0, 0.96, 0.85 ) * up * uSunVis * T;
  #endif

  // the layer fades out at the waterline
  float edge = smoothstep( -0.02, 0.06, depth );
  C *= edge; float A = ( 1.0 - T ) * edge;

  // ---- foam, three bands: the swash (a bright rim at the very edge and lace behind it), the break line on the crests in 0.6..1.1 m, and white caps in deep water that the wind raises
  #if WATER_QUALITY >= 1
    float sw = 0.30 + 0.12 * sin( ph.x + 0.9 );                                  // the reach of the swash breathes with the long swell
    float rim = 1.0 - smoothstep( 0.004 + 0.5 * dw, 0.012 + 3.0 * dw, depth );
    float wash = 1.0 - smoothstep( 0.0, sw, depth );
    float b2 = smoothstep( 0.55, 0.8, depth ) * ( 1.0 - smoothstep( 0.95, 1.2, depth ) ) * smoothstep( 0.35, 0.8, hn );
    float b3 = smoothstep( 1.3, 2.2, depth ) * smoothstep( 0.55, 0.95, hn ) * uWindF;
    #if WATER_QUALITY >= 2
      float lace1 = texture2D( tFoam, vPos.xz * 0.37 + uFlow2.xy ).a, lace2 = texture2D( tFoam, vPos.xz * 1.1 - uFlow2.yx + 0.31 ).a;
    #else
      float lace1 = 0.55, lace2 = 0.5;                                            // no lace lookup: plain bands
    #endif
    float foam = clamp( rim * 0.8 + wash * wash * lace1 * 0.8 + b2 * lace1 * 0.8 + b3 * lace2 * 0.6, 0.0, 1.0 ) * smoothstep( -0.02, 0.012, depth );
    vec3 foamCol = vec3( 0.93, 0.96, 0.98 ) * ( E * 0.85 + 0.03 );
    C = mix( C, foamCol, foam ); A = mix( A, 1.0, foam );
  #endif

  gl_FragColor = vec4( C, A );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // ---- the fog: FogExp2 of the scene, with the sun-scatter glow of the standard materials; the far sea becomes the horizon haze
  float sd = max( dot( - V, uSunDir ), 0.0 );
  vec3 fogCol = uFogColor + ladGlowCol * ( pow( sd, 4.0 ) * 0.35 + pow( sd, 20.0 ) * 0.65 ) * ladGlowAmt;
  float ff = 1.0 - exp( - uFogDensity * uFogDensity * vFogDepth * vFogDepth );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, ff );
  gl_FragColor.a = mix( gl_FragColor.a, 1.0, ff );
}`;

// ---- the module ---------------------------------------------------------------------------------------------------------------------
const TEXTURES = { tNormal: 'water_ripple_n.png', tFoam: 'foam_noise.png', tCaustic: 'caustic_tile.png' };
const placeholder = (rgba) => { const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1); t.needsUpdate = true; return t; };
const wrap1 = (v) => ((v % 1) + 1) % 1;
const FLOW = { ripple: 0.28, lace: 0.10, caustic: 0.05 };           // m/s of the three scrolling layers at calm; the wind quickens them

/** Fallback sky uniforms when engine/look.js failed and there is no ctx.look.sky (the fallback lighting): a plain bright day. */
function plainSky(ctx) {
  const c = (hex) => ({ value: new THREE.Color(hex) });
  return { uZenith: c(0x3478c0), uHorizon: c(0xb7cadb), uSunDir: { value: (ctx.sunDir ?? new THREE.Vector3(0.45, 0.8, 0.4)).clone().normalize() }, uSunCol: c(0xffe5c6), uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uGlowCol: c(0xffc88c), uGlowAmt: { value: 0.2 }, uSunVis: { value: 1 }, uMoonVis: { value: 0 } };
}

export function buildWater(ctx) {
  const scene = ctx.scene, plan = ctx.plan;
  const state = { wind: CALM.wind, amp: [1, 1, 1, 1] };
  let time = 0, flowClock = 0, disposed = false, level = QUALITY_LEVEL[ctx.quality] ?? 2;

  // ---- the ground under the sea (for aBed and for ctx.sea.depth)
  const far = () => (plan._far ??= makeFarHeight(plan));
  const ground = (x, z) => (plan.coast && Math.abs(x) <= BAY_X ? plan.coast.heightAt(x, z) : far()(x, z));

  // ---- the uniforms: the sky's by reference, so the water follows the hour with no copying
  const sky = ctx.look?.sky?.uniforms ?? plainSky(ctx);
  const loaded = {}, own = [];
  for (const [key, rgba] of [['tNormal', [113, 126, 250, 255]], ['tFoam', [255, 255, 255, 0]], ['tCaustic', [0, 0, 0, 255]]]) { loaded[key] = { value: placeholder(rgba) }; own.push(loaded[key].value); }
  const u = {
    uWk: { value: new THREE.Vector4(...SHADER.k) }, uWx: { value: new THREE.Vector4(...SHADER.dx) }, uWz: { value: new THREE.Vector4(...SHADER.dz) }, uWp: { value: new THREE.Vector4(...SHADER.phase) },
    uWa: { value: new THREE.Vector4() }, uWt: { value: new THREE.Vector4() },
    uBox: { value: new THREE.Vector4(NEAR.x, NEAR.z1, NEAR.fade, 0) },
    uFlow: { value: new THREE.Vector4() }, uFlow2: { value: new THREE.Vector4() }, uFlow3: { value: new THREE.Vector2() },
    uWindF: { value: 0 }, uAmpSum: { value: 0.3 }, uRip: { value: 0.75 }, uPix: { value: 0.00094 },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0 },
    uZenith: sky.uZenith, uHorizon: sky.uHorizon, uSunDir: sky.uSunDir, uSunCol: sky.uSunCol, uMoonDir: sky.uMoonDir, uGlowCol: sky.uGlowCol, uGlowAmt: sky.uGlowAmt,
    uSunVis: sky.uSunVis, uMoonVis: sky.uMoonVis,
    ladGlowCol: lookUniforms.ladGlowCol, ladGlowAmt: lookUniforms.ladGlowAmt,
    ...loaded,
  };
  const defines = () => ({ WATER_QUALITY: level });
  const makeMaterial = (disp) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...u, uDisp: { value: disp } }, vertexShader: VERT, fragmentShader: FRAG, defines: defines(),
      transparent: true, depthWrite: false, depthTest: true, side: THREE.FrontSide, fog: false, lights: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,   // premultiplied
    });
    m.name = disp ? 'water.near' : 'water.flat';
    return m;
  };
  const materials = [makeMaterial(1), makeMaterial(0), makeMaterial(0)];

  // ---- the meshes (core/sea.js lays them out so that they meet vertex to vertex; see the header)
  const bed = (x, z) => ground(x, z);
  let cell = MESH.cells[ctx.quality] ?? MESH.cells.high;
  const grids = seaMeshes(cell);
  // what depends on the frame being drawn, read just before each draw (the fog and the sky are set in ctx.render(), after the systems ran): the fog, and the angle a pixel covers
  const size = new THREE.Vector2();
  const beforeDraw = (renderer, sc, camera) => {
    const fog = sc.fog;
    u.uFogDensity.value = fog?.isFogExp2 ? fog.density : 0;
    if (fog) u.uFogColor.value.copy(fog.color);
    const target = renderer.getRenderTarget(), h = target ? target.height : (renderer.getDrawingBufferSize(size), size.y);
    if (camera?.fov > 0 && h > 0) u.uPix.value = (2 * Math.tan(camera.fov * Math.PI / 360)) / h;
  };
  const mk = (name, geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.renderOrder = -10; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); m.frustumCulled = true;
    m.onBeforeRender = beforeDraw;
    return m;
  };
  const near = mk('water.near', toGeometry(grids.near, bed), materials[0]);
  const mid = mk('water.mid', toGeometry(grids.mid, bed), materials[1]);
  const farMesh = mk('water.far', toGeometry(grids.far, bed), materials[2]);
  const meshes = [near, mid, farMesh];

  // ---- the group, and the cull (see the header): a LOD node's update(camera) is called by the renderer with the camera it is drawing from
  const group = new THREE.Group(); group.name = 'water'; group.renderOrder = -10; group.userData.water = true;
  const cull = new THREE.LOD(); cull.name = 'water.cull';
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4(), box = new THREE.Box3();
  cull.update = (camera) => {
    pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv, camera.coordinateSystem, camera.reversedDepth);
    for (const m of meshes) m.visible = frustum.intersectsBox(box.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
  };
  cull.add(...meshes); group.add(cull);
  scene.add(group);

  // ---- textures: straight from the files (they are not in the manifest); the placeholders hold their place until the images arrive
  const loader = new THREE.TextureLoader(), base = new URL('../../assets/textures/beach/', import.meta.url);
  const aniso = ctx.matlib?.anisotropy ?? ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
  const ready = Promise.allSettled(Object.entries(TEXTURES).map(([key, file]) => new Promise((res, rej) => {
    loader.load(new URL(file, base).href, (t) => {
      if (disposed) { t.dispose(); res(); return; }
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; own.push(t);
      loaded[key].value = t; res();
    }, undefined, () => rej(new Error('water: cannot load ' + file)));
  }))).then((rs) => { for (const r of rs) if (r.status === 'rejected') { (ctx.errors ??= []).push({ stage: 'water', message: String(r.reason?.message ?? r.reason) }); console.warn(String(r.reason?.message ?? r.reason)); } });

  // ---- per frame
  const amps = [0, 0, 0, 0], phases = [0, 0, 0, 0];
  function sync(dt) {
    seaState(ctx.hour ?? 15, state);
    waveAmps(state, amps); waveTime(time, phases);
    u.uWa.value.set(amps[0], amps[1], amps[2], amps[3]); u.uWt.value.set(phases[0], phases[1], phases[2], phases[3]);
    u.uAmpSum.value = amps[0] + amps[1] + amps[2] + amps[3];
    u.uWindF.value = state.wind * state.wind;
    u.uRip.value = 0.5 + 0.35 * state.wind;
    const f = (0.7 + 0.6 * state.wind) * dt;
    flowClock += f;
    const r = flowClock * FLOW.ripple;
    u.uFlow.value.set(wrap1(-0.12 * r / 6), wrap1(r / 6), wrap1(0.55 * r / 4.3), wrap1(0.8 * r / 4.3));
    u.uFlow2.value.set(wrap1(-0.2 * flowClock * FLOW.lace * 0.37), wrap1(flowClock * FLOW.lace * 0.37), wrap1(flowClock * FLOW.caustic * 0.25), wrap1(-0.6 * flowClock * FLOW.caustic * 0.25));
    u.uFlow3.value.set(wrap1(-0.08 * r / 53), wrap1(0.8 * r / 53));
  }
  function update(dt) {
    if (disposed) return;
    time += dt;
    if (!group.visible) { seaState(ctx.hour ?? 15, state); return; }
    sync(dt);
  }
  sync(0);

  // ---- quality: medium = the near mesh in 4 m cells and no foam lace or caustics, low = flat water with Fresnel only (6 m cells). The mid mesh's fans run through the near mesh's vertices, so a new
  // near cell means a new mid mesh too (the far mesh's fans run through the mid mesh's, which do not change)
  function setQuality(q) {
    if (disposed) return;
    if (!(q in QUALITY_LEVEL)) q = 'high';
    level = QUALITY_LEVEL[q];
    for (const m of materials) { m.defines = defines(); m.needsUpdate = true; m.uniforms.uDisp.value = m === materials[0] && level > 0 ? 1 : 0; }
    if (MESH.cells[q] !== cell) {
      cell = MESH.cells[q];
      const g = seaMeshes(cell), oldNear = near.geometry, oldMid = mid.geometry;
      near.geometry = toGeometry(g.near, bed); mid.geometry = toGeometry(g.mid, bed);
      oldNear.dispose(); oldMid.dispose();
    }
  }
  materials[0].uniforms.uDisp.value = level > 0 ? 1 : 0;
  const offQuality = ctx.events?.on?.('quality:change', (e) => setQuality(e?.level));
  ctx.addSystem('water', update, 5);

  // ---- ctx.sea
  const gw = [0, 0];
  const sea = {
    state,
    get time() { return time; },
    level: (x, z, t = time) => swellLevel(x, z, t, state) * nearWeight(x, z),
    /** [d/dx, d/dz] of `level`: the product rule, w dh + h dw (the weight is flat nearly everywhere, but not on the last 24 m before the near mesh's seams) */
    slope: (x, z, t = time, out = [0, 0]) => {
      swellSlope(x, z, t, state, out);
      const w = nearWeight(x, z);
      if (w === 0) { out[0] = out[1] = 0; return out; }
      if (w === 1) return out;
      nearWeightGrad(x, z, gw);
      const h = swellLevel(x, z, t, state);
      out[0] = out[0] * w + h * gw[0]; out[1] = out[1] * w + h * gw[1];
      return out;
    },
    depth: (x, z, t = time) => SEA + sea.level(x, z, t) - ground(x, z),
  };
  ctx.sea = sea;

  function dispose() {
    if (disposed) return;
    disposed = true; offQuality?.();
    const i = ctx.systems.findIndex((s) => s.fn === update); if (i >= 0) ctx.systems.splice(i, 1);
    scene.remove(group);
    for (const m of meshes) m.geometry.dispose();
    for (const m of materials) m.dispose();
    for (const t of own) t.dispose();
    if (ctx.sea === sea) delete ctx.sea;
  }
  return {
    group, cull, meshes, materials, uniforms: u, ready, update, setQuality, dispose,
    stats: () => ({ near: near.geometry.userData.triangles, mid: mid.geometry.userData.triangles, far: farMesh.geometry.userData.triangles, cell, quality: level, shown: meshes.map((m) => m.visible) }),
  };
}
