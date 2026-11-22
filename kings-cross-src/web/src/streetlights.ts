// The city's street lamps (core/streetlights.ts places them; round seven, night lighting): a post to each (instanced: one draw call, there by day), a glow at its head (one additive Points
// draw) and a pool of light on the ground under it (one instanced additive draw). No real light is cast: by night the glow and the pools fade in with the night lights' level (night.ts
// `attach`, the same `rig.lampLevel` that lights the windows and the platform lamps), and by day they are not drawn.
// What the colours and sizes are read from (gfx-rubrics/refs/night/, see core/streetlights.ts for the photographs): night-b-euston-road-sodium-2019-oatsy40.jpg for the sodium lamp's
// white-hot head in an orange halo and the orange pool on the road, night-b-euston-road-2025-brown.jpg for the warm-white LED, night-a-kx-square-2015-skinner.jpg for the forecourt's masts
// (a steel column with a strip of white LEDs near its top: (246, 247, 250) in the photograph) and their cool white.
import * as THREE from 'three';
import { legacyLampLight } from '../../core/light-photometry.ts';
import { LAMP_KIND, MAST_HEIGHT, POOL_REACH, poolRadius } from '../../core/streetlights.ts';
import type { LampKind, LampSpot } from '../../core/streetlights.ts';
import { Batch, rgb } from './materials.ts';
import type { Rgb } from './materials.ts';
import { haloTexture } from './night.ts';
import type { NightLayer } from './night.ts';
import { surfaceUniforms } from './atmosphere.ts';
import { COVER_GLSL, coverUniforms } from './cover.ts';
import type { LampWetSurface } from './lamp-wet-surface.ts';
import { LAMP_RECEIVER_GLSL } from './lamp-wet-surface.ts';
import { createLampWeather, fadeLightInFog, sharpenPlatformCoreInFog } from './streetlight-weather.ts';

/** The tall post's height as built; an instance scales it to its own height (the arm and the head with it). */
export const POST_HEIGHT = 8;

/**
 * The glow, the pool and the colour of each kind of lamp: the halo's colour at its head, the pool's colour on the ground and the pool's strength. The pool is an unlit additive layer, authored in display
 * colours (lighting.ts `leaveOutOfGrade`: the tone map skips it) and added to the frame after the ground's own colour, so its strength is in linear light and small: 0.15 of the sodium's colour is
 * +100 on the display's red at the foot of a lamp. From the photographs (night-b-euston-road-sodium-2019-oatsy40.jpg): the sodium lamp's halo median is (223, 180, 98), an orange, and the road under it a
 * brown-orange, (145, 109, 73) near a lamp, about +100, +70, +35 over the asphalt; night-a-kx-square-2015-skinner.jpg: the forecourt's paving is a neutral grey, (83, 91, 95) in the brightest of it, about +55
 * over the night's own light, so the white LEDs' pools are weak. The strengths are fitted to those.
 */
export const LAMP_LIGHT: Readonly<Record<LampKind, { halo: number; pool: number; strength: number }>> = {
  [LAMP_KIND.sodium]: legacyLampLight('hps'),
  [LAMP_KIND.warm]: legacyLampLight('led-3000'),
  [LAMP_KIND.cool]: legacyLampLight('led-4000'),
};

/** How far out the lamp's arm reaches, metres at `POST_HEIGHT` (the head hangs at its end). */
const ARM = 1.72;
const LOW_PRESSURE_LAMP_LIGHT = legacyLampLight('lps');

/** A six-sided column from its foot at the origin, `r0` across at the bottom and `r1` at `height`, flat vertex colour. */
function column(batch: Batch, r0: number, r1: number, height: number, color: Rgb): void {
  const ring = (r: number, y: number, k: number): [number, number, number] => [Math.cos((k * Math.PI) / 3) * r, y, Math.sin((k * Math.PI) / 3) * r];
  for (let k = 0; k < 6; k++) {
    const mid = ((k + 0.5) * Math.PI) / 3;
    batch.poly([ring(r0, 0, k), ring(r0, 0, k + 1), ring(r1, height, k + 1), ring(r1, height, k)], undefined, { facing: [Math.cos(mid), 0, Math.sin(mid)], color });
  }
}

/**
 * One street lamp at its foot, the arm along +x: a six-sided column tapering from 0.22 m across to 0.14 m, an arm out over the road, a flat lamp head at its end. 36 triangles, flat vertex
 * colours (the column dark steel, the head a lighter grey). Not drawn lit: the glow is the halo's.
 */
export function lampGeometry(): THREE.BufferGeometry {
  const batch = new Batch({ colored: true, uv: false });
  column(batch, 0.11, 0.07, POST_HEIGHT, rgb(0x2b2f33));
  batch.box([ARM / 2, POST_HEIGHT + 0.1, 0], [ARM, 0.07, 0.07], { rotZ: 0.06, color: rgb(0x2b2f33) });
  batch.box([ARM, POST_HEIGHT + 0.2, 0], [0.8, 0.1, 0.3], { color: rgb(0x555b62) });
  return batch.build();
}

/** Where along a mast, in metres up it, its strip of LEDs runs (night-a-kx-square-2015-skinner.jpg: the strip is about a third of the mast, at its top). */
export const MAST_STRIP = [8.2, 11.8] as const;

/** One forecourt mast at its foot, `MAST_HEIGHT` tall: a brushed-steel column 0.3 m across and the strip of LEDs along its top, a pale box that the halos light by night. 24 triangles. */
export function mastGeometry(): THREE.BufferGeometry {
  const batch = new Batch({ colored: true, uv: false });
  column(batch, 0.15, 0.13, MAST_HEIGHT, rgb(0x8d949b));
  batch.box([0, (MAST_STRIP[0] + MAST_STRIP[1]) / 2, 0], [0.2, MAST_STRIP[1] - MAST_STRIP[0], 0.2], { color: rgb(0xd9e2ea) });
  return batch.build();
}

/** Where a lamp's glow is: at the end of its arm and the top of its post, scaled to its height (a mast's, at its foot: its glow is the strip's, `stripPoints`). */
export function headOf(spot: LampSpot): [number, number, number] {
  const s = spot.height / POST_HEIGHT;
  const arm = spot.mast ? 0 : ARM * s;
  return [spot.x + Math.cos(spot.yaw) * arm, spot.y + (spot.mast ? 0 : (POST_HEIGHT + 0.12) * s), spot.z - Math.sin(spot.yaw) * arm];
}

/** The points of glow along a mast's strip, from its bottom to its top, 0.6 m apart. */
export function stripPoints(spot: LampSpot): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let h = MAST_STRIP[0]; h <= MAST_STRIP[1] + 1e-6; h += 0.6) out.push([spot.x, spot.y + h, spot.z]);
  return out;
}

/** How far above the pavement a pool of light lies: over the asphalt (2 cm above it) and its paint (3 cm), under nothing (polygon offset does the rest). */
const POOL_LIFT = 0.07;

let pool: THREE.Texture | null | undefined;
/**
 * A pool of lamplight on the ground: white and bright under the lamp, falling off as a lamp's light does (the cube of the cosine from its foot, so a third at a post's height out, a tenth at
 * twice that), and clear at the edge of the square it is drawn on. Null where there is no canvas (Node).
 */
export function poolTexture(): THREE.Texture | null {
  if (pool !== undefined) return pool;
  pool = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      // the edge of the square is `POOL_REACH` post heights from the lamp: cos^3 of the angle at that distance, taken to nothing at the edge itself
      for (const r of [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1]) {
        const d = r * POOL_REACH;
        grad.addColorStop(r, `rgba(255,255,255,${(r === 1 ? 0 : Math.pow(1 / Math.sqrt(1 + d * d), 3)).toFixed(3)})`);
      }
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      pool = new THREE.CanvasTexture(c);
      pool.colorSpace = THREE.SRGBColorSpace;
    }
  }
  return pool;
}

export interface StreetLights extends NightLayer {
  group: THREE.Group;
  setReceiverPools?(active: boolean): void;
  counts(): { lamps: number; triangles: number; draws: number };
  dispose(): void;
}

export interface StreetLightOptions {
  /** Existing station fixtures need only the shared heads and pools. */
  posts?: boolean;
  /** A promoted existing street head reuses its daylight post. */
  postAt?: (spot:LampSpot)=>boolean;
  headAt?: (spot: LampSpot) => [number, number, number];
  /** Geographic scenes can fade their distant lamps with their own visibility. */
  fog?: boolean;
  /** Opt-in display-linear pool ceiling. Normal alpha blending approaches this
   * colour through overlaps, without the exposure or additive hot spots. */
  poolCeiling?: number;
  /** Broaden the falloff and reach together, keeping the peak unchanged. */
  poolSpread?: number;
  /** Metres to the edge of this head's own pool, e.g. from fixture spacing. */
  poolRadiusAt?: (spot: LampSpot, index: number) => number;
  /** Optional full width/depth of a directional pool, metres. */
  poolSizeAt?: (spot: LampSpot, index: number) => readonly [number, number] | undefined;
  /** A mast's narrow rectangular optic, with a short soft edge. */
  poolLineAt?: (spot: LampSpot, index: number) => boolean;
  /** Small floor clearance for raised station slabs at grazing camera angles. */
  poolLiftAt?: (spot: LampSpot, index: number) => number;
  /** Evaluate the radial profile per fragment, without grazing-angle mip blur. */
  analyticPool?: boolean;
  /** Broaden a pool's lit centre independently of its bounded peak/reach. */
  poolFocus?: number;
  /** Keep distant head cores without allocating unseen pools on distant roads. */
  poolAt?: (spot:LampSpot,index:number)=>boolean;
  /** Pools drawn by the receiving shader when that night variant is active. */
  receiverPoolAt?: (spot: LampSpot) => boolean;
  /** Drape urban pools onto the same physical paving as their reflections. */
  poolSurface?: LampWetSurface;
  /** Receiver samples across a pool on tightly folded urban terrain. */
  poolSegments?: number;
  /** Clip raised platform light to the physical platforms instead of the tracks. */
  poolFloor?: { map: THREE.Texture; rect: THREE.Vector4; appliesAt?: (spot: LampSpot, index: number) => boolean };
  /** Wet open ground absorbs more light; dense fog reduces the ground pool. */
  poolWeather?: boolean;
  /** Opt-in wet head reflections and a wider fog-scattering halo. */
  weatherEffects?: boolean;
  /** Allocate reflection geometry only for this scene's nearby wet surfaces. */
  reflectionAt?: (spot: LampSpot, index: number) => boolean;
  /** Finite reflected patch around its head, rather than an infinite tangent plane. */
  reflectionReach?: number;
  /** Extra rough-paving tail towards the eye; the wet footprint still clips it. */
  reflectionTail?: (spot:LampSpot,index:number)=>number;
  /** Actual urban road/paving receiver heights and wet footprint. */
  reflectionSurface?: LampWetSurface;
  /** Follow a rising road rather than reflecting through neighbouring buildings. */
  reflectionRoad?: (spot:LampSpot,index:number)=>boolean;
  /** Urban puddles form long, narrow streaks with irregular soft breaks. */
  reflectionBroken?: boolean;
  /** Station/city optics only; the Perth path remains unchanged. */
  enhancedFog?: boolean;
  /** Scene-selected soft urban scattering; legacy/default/Perth stay exact. */
  softFog?: boolean;
  /** Station-specific scattering and resolved lamp cores in dense fog. */
  boundedFog?: 'kx' | 'wv';
  /** Limit the overlapping street scatter around Princes Street in dense fog. */
  waverleyStreetFog?: boolean;
  /** Wider scattering on Scottish city lights, independent of the clear head. */
  fogHaloSpread?: number;
  /** One low-opacity volume per LED strip, separate from its bright samples. */
  mastHaze?: boolean;
  /** KX-only broad mast air glow, directional pool core and rough wet streaks. */
  kxOptics?: boolean;
  /** A caller can retain the original full radial footprint after review. */
  poolRoadShape?: boolean;
  /** KX road optics: extend the accepted footprint, with LED cutoffs and a
   * softer sodium skirt. Other scenes retain their original pool program. */
  luminairePools?: boolean;
  /** Production KX road exposure and warm LED receiver balance. */
  roadPoolBalance?: boolean;
  /** Relative optical reach for selected sodium lamps, zero for the regular beam. */
  localSodiumScaleAt?: (spot: LampSpot) => number;
  /** Tapered, irregular wet streaks without changing the pool or clear head. */
  roughReflections?: boolean;
  /** KX window/lamp emission has a longer fog tail than opaque surfaces. */
  lightFog?: boolean;
  /** Snow receives diffuse pools, never mirror streaks. */
  suppressSnow?: boolean;
  /** Low-pressure sodium on selected approaches, including fittings reused in
   * the city batch. Other streets and Perth retain their reference palette. */
  lowPressureSodium?: boolean | ((spot:LampSpot)=>boolean);
  /** Preserve a sodium core's orange hue at panorama scale. */
  coreTint?: boolean;
  /** Clear-air lens profiles drawn by the existing fixed-pixel core layer. */
  sourceCores?: 'street' | 'kx-platform' | 'wv-platform';
  /** A promoted lens is drawn only by its approach batch in clear air. */
  sourceCoreAt?: (spot: LampSpot) => boolean;
  haloSize?: number;
  /** Relative head diameter, e.g. the forecourt's blazing LED strips. */
  haloScaleAt?: (spot:LampSpot)=>number;
  /** A small white-hot core in pixels, including at panorama distances. */
  coreSize?: number;
}

const CORE_SIZE = 5;
const CORE_SIZE_GLSL = `
float lampCoreDiameter( float nearSize, float farSize, float depth ) {
  return mix( nearSize, farSize, smoothstep( 75.0, 260.0, depth ) );
}
`;
const CORE_GLSL = `
float lampCoreProfile( vec2 uv, vec2 shape ) {
  float radius = length( ( uv - 0.5 ) * 2.0 / shape );
  return 0.78 * ( 1.0 - smoothstep( 0.24, 0.61, radius ) )
       + 0.22 * ( 1.0 - smoothstep( 0.36, 1.0, radius ) );
}
`;

export function createStreetLights(spots: readonly LampSpot[], options: StreetLightOptions = {}): StreetLights {
  const n = spots.length;
  const lightOf = (spot:LampSpot) => spot.kind===LAMP_KIND.sodium && (typeof options.lowPressureSodium==='function'?options.lowPressureSodium(spot):options.lowPressureSodium)
    ? LOW_PRESSURE_LAMP_LIGHT : LAMP_LIGHT[spot.kind];
  const headAt = options.headAt ?? headOf;
  const group = new THREE.Group();
  group.name = 'street-lamps';

  // the posts: an instanced mesh for the lamps and one for the forecourt's masts, there by day and night
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const geometries: THREE.BufferGeometry[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  for (const mast of [false, true]) {
    if (options.posts === false) continue;
    const some = spots.filter((spot) => !!spot.mast === mast && options.postAt?.(spot)!==false);
    if (!some.length) continue;
    const geometry = mast ? mastGeometry() : lampGeometry();
    const posts = new THREE.InstancedMesh(geometry, material, some.length);
    posts.name = mast ? 'forecourt-masts' : 'street-lamp-posts';
    some.forEach((spot, i) => {
      const s = mast ? 1 : spot.height / POST_HEIGHT;
      matrix.compose(at.set(spot.x, spot.y, spot.z), turn.setFromAxisAngle(up, spot.yaw), scale.set(s, s, s));
      posts.setMatrixAt(i, matrix);
    });
    posts.instanceMatrix.needsUpdate = true;
    posts.frustumCulled = false;
    group.add(posts);
    geometries.push(geometry);
    meshes.push(posts);
  }

  // the glow at each head (a mast's, along its strip): additive sprites, a colour to each, hidden by day
  const heads: number[] = [];
  const colours: number[] = [];
  const haloScales: number[] = [];
  const tint = new THREE.Color();
  for (const spot of spots) {
    tint.setHex(lightOf(spot).halo);
    for (const point of spot.mast ? stripPoints(spot) : [headAt(spot)]) {
      heads.push(...point);
      haloScales.push(options.haloScaleAt?.(spot) ?? 1);
      colours.push(tint.r, tint.g, tint.b);
    }
  }
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute('position', new THREE.Float32BufferAttribute(heads, 3));
  haloGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const haloMaterial = new THREE.PointsMaterial({ size: options.haloSize ?? 2.6, sizeAttenuation: true, map: haloTexture(), vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: options.fog ?? false });
  const halos = new THREE.Points(haloGeometry, haloMaterial);
  // Light has no solid surface, even when hidden by day: sightlines pass through.
  halos.raycast = (): void => {};
  if (options.fog) fadeLightInFog(haloMaterial,false,false,!!(options.kxOptics || options.lightFog),!!options.softFog);
  if (options.haloScaleAt) {
    haloGeometry.setAttribute('lampHaloScale',new THREE.Float32BufferAttribute(haloScales,1));
    const before=haloMaterial.onBeforeCompile;
    haloMaterial.onBeforeCompile=(shader,renderer)=>{
      before.call(haloMaterial,shader,renderer);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float lampHaloScale;')
        .replace('gl_PointSize = size;','gl_PointSize = size;\ngl_PointSize *= lampHaloScale;');
    };
    haloMaterial.customProgramCacheKey=()=> 'street-head-strip-glow';
  }
  halos.name = 'street-lamp-halos';
  halos.visible = false;
  halos.frustumCulled = false;
  halos.renderOrder = 5;
  group.add(halos);

  let cores: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | undefined;
  let clearCoreMaterial: THREE.PointsMaterial | undefined;
  let fogCoreMaterial: THREE.PointsMaterial | undefined;
  let sourceCore: { geometry: THREE.BufferGeometry; material: THREE.PointsMaterial } | undefined;
  let legacyCoreGeometry: THREE.BufferGeometry | undefined;
  if (options.coreSize && heads.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', haloGeometry.getAttribute('position'));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(options.coreTint ? colours : colours.map(c => .92 + .08 * c), 3));
    const material = new THREE.PointsMaterial({ size: options.coreSize, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: options.fog ?? false, toneMapped: false });
    if (options.fog) fadeLightInFog(material,false,!!options.enhancedFog,!!(options.kxOptics || options.lightFog),!!options.softFog);
    clearCoreMaterial=material;
    legacyCoreGeometry = geometry;
    if (options.boundedFog && options.fog && options.enhancedFog) {
      fogCoreMaterial=material.clone();
      fogCoreMaterial.onBeforeCompile=material.onBeforeCompile;
      fogCoreMaterial.customProgramCacheKey=material.customProgramCacheKey;
      sharpenPlatformCoreInFog(fogCoreMaterial);
    }
    if (options.sourceCores) {
      const positions: number[] = [], lensColours: number[] = [], shapes: number[] = [];
      for (const spot of spots) {
        const street = options.sourceCores === 'street';
        const sodium = spot.kind === LAMP_KIND.sodium;
        const lowPressure = lightOf(spot).halo === 0xff993c;
        const hex = spot.mast ? 0xddeeff
          : sodium ? lowPressure ? 0xffb85a : 0xffcb83
          : spot.kind === LAMP_KIND.warm ? 0xffe5be
          : street ? 0xe2f0ff : options.sourceCores === 'kx-platform' ? 0xffe0b0 : 0xffeed8;
        tint.setHex(options.sourceCoreAt?.(spot) === false ? 0 : hex);
        for (const [x,y,z] of spot.mast ? stripPoints(spot) : [headAt(spot)]) {
          // Clear the rim of the fitting when looking up at the glass.
          positions.push(x, y - (spot.mast ? 0 : street ? .14 * spot.height / POST_HEIGHT : .045), z);
          lensColours.push(tint.r,tint.g,tint.b);
          shapes.push(...(spot.mast ? [.69,1] : [1,street ? .65 : .58]));
        }
      }
      const lens = new THREE.BufferGeometry();
      lens.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
      lens.setAttribute('color', new THREE.Float32BufferAttribute(lensColours,3));
      lens.setAttribute('lampCoreShape', new THREE.Float32BufferAttribute(shapes,2));
      const optic = material.clone();
      optic.size = CORE_SIZE;
      const farSize = { value: options.coreSize };
      optic.onBeforeCompile = (shader, renderer) => {
        material.onBeforeCompile(shader,renderer);
        shader.uniforms.uLampCoreFarSize = farSize;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\nattribute vec2 lampCoreShape;\nvarying vec2 vLampCoreShape;\nuniform float uLampCoreFarSize;${CORE_SIZE_GLSL}`)
          .replace('gl_PointSize = size;', 'gl_PointSize = lampCoreDiameter( size, uLampCoreFarSize, -mvPosition.z );\nvLampCoreShape = lampCoreShape;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\nvarying vec2 vLampCoreShape;${CORE_GLSL}`)
          .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\ndiffuseColor.a *= lampCoreProfile( gl_PointCoord, vLampCoreShape );');
      };
      optic.customProgramCacheKey = () => material.customProgramCacheKey() + '-lens-core';
      sourceCore = { geometry:lens, material:optic };
    }
    cores = new THREE.Points(geometry, material); cores.name = 'street-lamp-cores';
    cores.raycast = (): void => {};
    cores.frustumCulled = false; cores.renderOrder = 6; cores.visible = false;
    group.add(cores);
  }

  // the pool under each head: a flat quad with the halo's gradient, scaled to the lamp's reach, an instance colour for its light
  const poolEntries=spots.flatMap((spot,index)=>options.poolAt?.(spot,index)===false?[]:[{spot,index}]);
  // A road can curve through the centre of a footprint. Sampling only its four
  // corners tilted the Euston pool through the asphalt, exposing a hard edge.
  const poolSegments = options.poolSegments ?? (options.poolSurface ? 2 : 1);
  const poolGeometry = new THREE.PlaneGeometry(1, 1, poolSegments, poolSegments).rotateX(-Math.PI / 2);
  if (options.poolFloor || options.weatherEffects) poolGeometry.setAttribute('poolFloorWeight', new THREE.InstancedBufferAttribute(new Float32Array(poolEntries.map(({spot:s,index:i})=>Number(options.poolFloor ? options.poolFloor.appliesAt?.(s,i) ?? true : false))),1));
  if (options.poolLineAt) poolGeometry.setAttribute('poolLine', new THREE.InstancedBufferAttribute(new Float32Array(poolEntries.map(({spot:s,index:i})=>Number(options.poolLineAt!(s,i)))),1));
  const roadPoolShape=!!options.kxOptics&&options.poolRoadShape!==false;
  if (roadPoolShape) poolGeometry.setAttribute('poolRoadDirection',new THREE.InstancedBufferAttribute(new Float32Array(poolEntries.flatMap(({spot})=>[Math.sin(spot.yaw),-Math.cos(spot.yaw)])),2));
  if (options.luminairePools) poolGeometry.setAttribute('poolBeam',new THREE.InstancedBufferAttribute(new Float32Array(poolEntries.flatMap(({spot})=>[Math.sin(spot.yaw),-Math.cos(spot.yaw),spot.kind,Number(!!spot.mast)])),4));
  const localScales = options.luminairePools && options.localSodiumScaleAt
    ? Float32Array.from(poolEntries, ({spot}) => options.localSodiumScaleAt!(spot)) : undefined;
  const localSodium = localScales !== undefined;
  const localExtent = 1.6;
  if (localScales) poolGeometry.setAttribute('poolLocalScale',new THREE.InstancedBufferAttribute(localScales,1));
  const bounded = options.poolCeiling !== undefined;
  const poolMaterial = new THREE.MeshBasicMaterial({ map: options.analyticPool ? null : poolTexture(), transparent: true, opacity: 0, blending: bounded ? THREE.NormalBlending : THREE.AdditiveBlending,
    toneMapped: !bounded, depthWrite: false, fog: options.fog ?? false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const pools = new THREE.InstancedMesh(poolGeometry, poolMaterial, poolEntries.length);
  pools.raycast = (): void => {};
  if (options.fog) fadeLightInFog(poolMaterial, bounded);
  if (options.poolFloor || options.poolWeather || options.analyticPool) {
    const before = poolMaterial.onBeforeCompile;
    poolMaterial.onBeforeCompile = (shader, renderer) => {
      before.call(poolMaterial, shader, renderer);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPoolWorld;')
        .replace('#include <project_vertex>', `#include <project_vertex>
vec4 poolWorld = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
poolWorld = instanceMatrix * poolWorld;
#endif
vPoolWorld = ( modelMatrix * poolWorld ).xyz;`);
      let declarations = 'varying vec3 vPoolWorld;', body = '';
      if(options.poolSurface){
        Object.assign(shader.uniforms,{uLampSurface:{value:options.poolSurface.map},uLampSurfaceRect:{value:options.poolSurface.rect}});
        shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${LAMP_RECEIVER_GLSL}`)
          .replace('#include <logdepthbuf_vertex>',`vec2 poolAnchorReceiver = lampReceiver((modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xz);
// pool-receiver-begin
vec2 poolReceiver = lampReceiver(vPoolWorld.xz);
vPoolWorld.y = (poolReceiver.y > 0.001 ? poolReceiver.x : poolAnchorReceiver.x)+0.07;
// pool-receiver-end
mvPosition = viewMatrix*vec4(vPoolWorld,1.0);
gl_Position = projectionMatrix*mvPosition;
#include <logdepthbuf_vertex>`);
        declarations+=`\n${LAMP_RECEIVER_GLSL}`;
        body+='\n// pool-receiver-mask-begin\ngl_FragColor.a *= lampReceiver(vPoolWorld.xz).y;\n// pool-receiver-mask-end';
      }
      if (options.analyticPool) {
        const roadShape = roadPoolShape ? `
// pool-road-shape-begin
// Lamp arms point across the road. Shape the existing analytic profile
// along the road tangent, retaining its bounded head peak and soft edge.
${options.poolLineAt?'if(poolLine < 0.5) {':''}
vec2 roadPoolUv=2.0*uv-1.0;
float roadAlong=dot(roadPoolUv,poolRoadDirection);
float roadAcross=dot(roadPoolUv,vec2(-poolRoadDirection.y,poolRoadDirection.x));
vPoolUv=0.5+0.5*vec2(roadAlong,1.8*roadAcross);
${options.poolLineAt?'}':''}
// pool-road-shape-end` : '';
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>${roadPoolShape ? '\nattribute vec2 poolRoadDirection;' : ''}${options.luminairePools?'\nattribute vec4 poolBeam;\nvarying vec4 vPoolBeam;':''}${localSodium?'\nattribute float poolLocalScale;\nvarying float vPoolLocalScale;':''}\nvarying vec2 vPoolUv;`)
          .replace('#include <project_vertex>', `#include <project_vertex>\nvPoolUv = uv;${roadShape}${options.luminairePools?'\nvPoolBeam = poolBeam;\nvPoolUv = 0.5+(uv-0.5)*mix(1.8,1.0,poolBeam.w);':''}${localSodium?`\nvPoolLocalScale = poolLocalScale;\nif (poolLocalScale > 0.0) vPoolUv = 0.5+(vPoolUv-0.5)*${localExtent};`:''}`);
        declarations += '\nvarying vec2 vPoolUv;';
        if(options.luminairePools)declarations+='\nvarying vec4 vPoolBeam;';
        if(localSodium)declarations+='\nvarying float vPoolLocalScale;';
        if (options.poolLineAt) {
          shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float poolLine;\nvarying float vPoolLine;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvPoolLine = poolLine;');
          declarations += '\nvarying float vPoolLine;';
        }
        body += `${options.luminairePools?`
// pool-luminaire-input-begin
float poolInputAlpha = gl_FragColor.a;
// pool-luminaire-input-end`:''}
// pool-profile-begin
float poolR = length( 2.0 * vPoolUv - 1.0 );
${options.poolLineAt ? `float poolProfile = pow( 1.0 + ${options.poolFocus?.toFixed(1)??'4.0'} * poolR * poolR, -1.5 ) * ( 1.0 - smoothstep( 0.55, 1.0, poolR ) );
poolProfile = mix( poolProfile, exp(-${options.kxOptics?'1.15':'1.8'}*(2.0*vPoolUv.x-1.0)*(2.0*vPoolUv.x-1.0)-${options.kxOptics?'2.0':'2.5'}*(2.0*vPoolUv.y-1.0)*(2.0*vPoolUv.y-1.0)) * (1.0 - smoothstep(${options.kxOptics?'.78':'.65'},1.0,abs(2.0*vPoolUv.x-1.0))) * (1.0 - smoothstep(${options.kxOptics?'.72':'.55'},1.0,abs(2.0*vPoolUv.y-1.0))), vPoolLine );
gl_FragColor.a *= poolProfile;` : `gl_FragColor.a *= pow( 1.0 + ${options.poolFocus?.toFixed(1)??'4.0'} * poolR * poolR, -1.5 ) * ( 1.0 - smoothstep( 0.55, 1.0, poolR ) );`}
// pool-profile-end${options.luminairePools?`
// pool-luminaire-begin
vec2 beamPosition = 2.0*vPoolUv-1.0;
vec2 beamLocal = vec2(dot(beamPosition,vPoolBeam.xy)/1.8,dot(beamPosition,vec2(-vPoolBeam.y,vPoolBeam.x)));
beamLocal = mix(beamLocal,beamPosition,vPoolBeam.w);
float sodiumRadius = length(beamLocal);
float sodiumBeam = pow(1.0+0.8*sodiumRadius*sodiumRadius,-1.5)*(1.0-smoothstep(0.72,1.0,sodiumRadius));
float ledRadius = pow(pow(abs(beamLocal.x),4.0)+pow(abs(beamLocal.y),4.0),0.25);
float ledBeam = (0.35+0.65*exp(-1.5*dot(beamLocal,beamLocal)))*(1.0-smoothstep(0.90,1.0,ledRadius));
float luminaireBeam = mix(sodiumBeam,ledBeam,step(0.5,vPoolBeam.z));
// Retain every accepted diffuse-pool sample. Only extend/intensify the road
// beam; the original receiver mask, weather scale and peak ceiling remain.
gl_FragColor.a = max(gl_FragColor.a,poolInputAlpha*luminaireBeam);
// pool-luminaire-end
// pool-source-colour-begin
// Diffuse asphalt desaturates the broad skirt. Keep the lamp's actual colour
// on its head/halo/reflection; LEDs light this receiver neutral white. A
// separate tight lobe identifies each source without reducing road coverage.
float poolEnergy = max(gl_FragColor.r,max(gl_FragColor.g,gl_FragColor.b));
float poolWhite = step(0.5,vPoolBeam.z);
vec3 poolSkirt = mix(vec3(1.0,0.8,0.55),vec3(1.0),poolWhite);
gl_FragColor.rgb = max(gl_FragColor.rgb,poolEnergy*poolSkirt);
float poolHead = exp(-7.0*dot(beamPosition,beamPosition));
gl_FragColor.rgb += poolEnergy*poolHead*mix(vec3(0.9,0.35,0.0),vec3(0.8),poolWhite);
// pool-source-colour-end${options.roadPoolBalance?`
// pool-road-balance-begin
float roadBalance = (1.0-step(1.5,vPoolBeam.z))*(1.0-vPoolBeam.w);
float roadGap = mix(0.66,1.0,poolHead);
float warmLed = step(0.5,vPoolBeam.z)*(1.0-step(1.5,vPoolBeam.z));
gl_FragColor.rgb *= mix(vec3(1.0),roadGap*mix(vec3(1.0),vec3(1.0,0.83,0.65),warmLed),roadBalance);
// pool-road-balance-end`:''}${localSodium?`
// pool-local-sodium-begin
if (vPoolLocalScale > 0.0) {
  vec2 acrossRoad = vec2(-vPoolBeam.y,-vPoolBeam.x);
  vec2 alongRoad = vec2(-acrossRoad.y,acrossRoad.x);
  vec2 localBeam = vec2(dot(beamPosition,alongRoad),dot(beamPosition,acrossRoad)-0.22);
  float localRadius = length(localBeam / (vec2(1.08,0.68)*vPoolLocalScale));
  float localLight = pow(1.0 + 1.5*localRadius*localRadius,-1.5) * (1.0-smoothstep(0.48,1.0,localRadius));
  // A weak, road-aligned skirt overlaps the neighbouring lamp while leaving
  // the brighter optical core and the peak ceiling of this fixture intact.
  float skirtRadius = length(localBeam / (vec2(2.55,1.50)*vPoolLocalScale));
  float skirt = 0.18 * pow(1.0+2.0*skirtRadius*skirtRadius,-1.2) * (1.0-smoothstep(0.46,1.0,skirtRadius));
  localLight += (1.0-localLight)*skirt;
  gl_FragColor.a = poolInputAlpha * localLight;
  gl_FragColor.rgb = vec3(0.285,0.145,0.063);
}
// pool-local-sodium-end`:''}`:''}`;
      }
      if (options.poolFloor) {
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float poolFloorWeight;\nvarying float vPoolFloorWeight;')
          .replace('#include <project_vertex>','#include <project_vertex>\nvPoolFloorWeight = poolFloorWeight;');
        shader.uniforms.uPoolFloorMap = { value: options.poolFloor.map };
        shader.uniforms.uPoolFloorRect = { value: options.poolFloor.rect };
        declarations += '\nvarying float vPoolFloorWeight;\nuniform sampler2D uPoolFloorMap;\nuniform vec4 uPoolFloorRect;';
        body += '\ngl_FragColor.a *= mix( 1.0, texture2D( uPoolFloorMap, ( vPoolWorld.xz - uPoolFloorRect.xy ) * uPoolFloorRect.zw ).r, vPoolFloorWeight );';
      }
      if (options.poolWeather) {
        shader.uniforms.uPoolWet = surfaceUniforms.wet;
        shader.uniforms.uPoolFog = surfaceUniforms.fog;
        Object.assign(shader.uniforms, coverUniforms);
        declarations += `\nuniform float uPoolWet;\nuniform float uPoolFog;\n${COVER_GLSL}`;
        body += `
float poolOpen = 1.0 - coverGroundAt( vPoolWorld );
// pool-weather-begin
gl_FragColor.a *= ( 1.0 - 0.38 * uPoolWet * poolOpen ) * ( 1.0 - 0.55 * uPoolFog );
// pool-weather-end`;
      }
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${declarations}`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>\n${body}`);
    };
    poolMaterial.customProgramCacheKey = () => `street-pool-${bounded}-${!!options.fog}-${!!options.poolFloor}-${!!options.poolWeather}-${!!options.analyticPool}${options.poolLineAt ? '-line' : ''}${options.poolSurface?'-receiver':''}${options.poolFocus===undefined?'':`-focus${options.poolFocus}`}${options.kxOptics?'-kx':''}${roadPoolShape?'-road':''}${options.luminairePools?'-luminaire':''}${options.roadPoolBalance?'-balanced':''}${localSodium?'-local-sodium':''}`;
  }
  pools.name = 'street-lamp-pools';
  poolEntries.forEach(({spot,index}, i) => {
    const [x, , z] = headAt(spot);
    const r = 2 * (options.poolRadiusAt?.(spot, index) ?? poolRadius(spot.height) * (options.poolSpread ?? 1)) * (options.luminairePools&&!spot.mast?1.8:1);
    const size = options.poolSizeAt?.(spot,index), extent = (localScales?.[i] ?? 0) > 0 ? localExtent : 1;
    const rx = (size?.[0] ?? r) * extent, rz = (size?.[1] ?? r) * extent;
    const [gx, gz] = spot.slope;
    // the quad lies in the ground's own plane (a shear: height follows x by gx and z by gz), so on a slope it neither sinks into the ground on the uphill side nor hangs over it downhill
    matrix.set(rx, 0, 0, x, gx * rx, 1, gz * rz, spot.y + gx * (x - spot.x) + gz * (z - spot.z) + (options.poolLiftAt?.(spot,index) ?? POOL_LIFT), 0, 0, rz, z, 0, 0, 0, 1);
    pools.setMatrixAt(i, matrix);
    const light = lightOf(spot);
    pools.setColorAt(i, tint.setHex(light.pool).multiplyScalar(options.poolCeiling ?? light.strength));
  });
  pools.instanceMatrix.needsUpdate = true;
  if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
  pools.visible = false;
  pools.frustumCulled = false;
  pools.renderOrder = 4;
  group.add(pools);
  const legacyIndices = options.receiverPoolAt
    ? poolEntries.flatMap(({spot}, i) => options.receiverPoolAt!(spot) ? [] : [i]) : undefined;
  let receiverPools: typeof pools | undefined;
  if (legacyIndices && legacyIndices.length < poolEntries.length) {
    const geometry = poolGeometry.clone();
    // Preserve the original instance order and every retained decal attribute.
    for (const [name, attr] of Object.entries(poolGeometry.attributes)) {
      if (!(attr instanceof THREE.InstancedBufferAttribute)) continue;
      const values = new Float32Array(legacyIndices.length * attr.itemSize);
      legacyIndices.forEach((index, i) => values.set(attr.array.subarray(index * attr.itemSize, (index + 1) * attr.itemSize), i * attr.itemSize));
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(values, attr.itemSize, attr.normalized));
    }
    receiverPools = new THREE.InstancedMesh(geometry, poolMaterial, legacyIndices.length);
    const compact = receiverPools;
    const instanceColour = new THREE.Color();
    legacyIndices.forEach((index, i) => {
      pools.getMatrixAt(index, matrix);
      compact.setMatrixAt(i, matrix);
      if (pools.instanceColor) {
        pools.getColorAt(index, instanceColour);
        compact.setColorAt(i, instanceColour);
      }
    });
    compact.name = 'street-lamp-pools-euston-p1';
    compact.raycast = pools.raycast;
    compact.visible = false;
    compact.frustumCulled = false;
    compact.renderOrder = pools.renderOrder;
    group.add(compact);
  }
  // Reflections, halos and fog still read the full original pool data.
  const weather = options.weatherEffects && poolEntries.length ? createLampWeather(pools, poolEntries.flatMap(({spot})=>headAt(spot)), halos, options.poolFloor,
    poolEntries.flatMap(({spot,index},i)=>options.reflectionAt?.(spot,index) === false ? [] : [i]), options.reflectionReach, options.reflectionSurface, options.reflectionBroken, {enhancedFog:options.enhancedFog,softFog:options.softFog,boundedFog:options.boundedFog,waverleyStreetFog:options.waverleyStreetFog,fogHaloSpread:options.fogHaloSpread,mastHaze:options.mastHaze,kxOptics:options.kxOptics,roughReflections:options.roughReflections,reflectionRoadAt:options.reflectionRoad&&options.reflectionSurface?source=>{const e=poolEntries[source]!;return options.reflectionRoad!(e.spot,e.index)?[Math.sin(e.spot.yaw),Math.cos(e.spot.yaw)]:[0,0];}:undefined,reflectionTailAt:options.reflectionTail?source=>options.reflectionTail!(poolEntries[source]!.spot,poolEntries[source]!.index):undefined,lightFog:options.lightFog,suppressSnow:options.suppressSnow}) : undefined;
  if (weather) group.add(weather.group);
  let receiverActive = false;
  const drawPools = () => {
    pools.visible = halos.visible && !receiverActive;
    if (receiverPools) receiverPools.visible = halos.visible && receiverActive && receiverPools.count > 0;
  };

  return {
    group,
    setReceiverPools(active) { receiverActive = !!receiverPools && active; drawPools(); },
    setLevel(level) {
      const l = Math.min(1, Math.max(0, level));
      haloMaterial.opacity = l * 0.9;
      poolMaterial.opacity = l;
      halos.visible = l > 0.01;
      drawPools();
      if (cores && clearCoreMaterial) {
        const denseFog = surfaceUniforms.fog.value > .65;
        const lens = l > .01 && !denseFog ? sourceCore : undefined;
        cores.geometry = lens?.geometry ?? legacyCoreGeometry!;
        cores.material = lens?.material ?? (denseFog && fogCoreMaterial ? fogCoreMaterial : clearCoreMaterial);
        cores.material.opacity = l;
        cores.visible = l > 0.01;
      }
      weather?.setLevel(l);
    },
    counts: () => {
      const poolCount = receiverActive ? receiverPools!.count : poolEntries.length;
      return { lamps: n, triangles: meshes.reduce((sum, m) => sum + (m.geometry.index as THREE.BufferAttribute).count / 3 * m.count, 0) + poolGeometry.index!.count / 3 * poolCount + (weather?.triangles ?? 0), draws: meshes.length + 1 + Number(!receiverActive || poolCount > 0) + Number(!!cores) + (weather?.draws ?? 0) };
    },
    dispose() {
      weather?.dispose();
      for (const g of geometries) g.dispose();
      for (const m of meshes) m.dispose();
      haloGeometry.dispose();
      poolGeometry.dispose();
      receiverPools?.geometry.dispose();
      receiverPools?.dispose();
      material.dispose();
      haloMaterial.dispose();
      legacyCoreGeometry?.dispose();
      sourceCore?.geometry.dispose();
      sourceCore?.material.dispose();
      clearCoreMaterial?.dispose();
      fogCoreMaterial?.dispose();
      poolMaterial.dispose();
      pools.dispose();
    },
  };
}
