// The city's street lamps (core/streetlights.ts places them; round seven, night lighting): a post to each (instanced: one draw call, there by day), a glow at its head (one additive Points
// draw) and a pool of light on the ground under it (one instanced additive draw). No real light is cast: by night the glow and the pools fade in with the night lights' level (night.ts
// `attach`, the same `rig.lampLevel` that lights the windows and the platform lamps), and by day they are not drawn.
// What the colours and sizes are read from (gfx-rubrics/refs/night/, see core/streetlights.ts for the photographs): night-b-euston-road-sodium-2019-oatsy40.jpg for the sodium lamp's
// white-hot head in an orange halo and the orange pool on the road, night-b-euston-road-2025-brown.jpg for the warm-white LED, night-a-kx-square-2015-skinner.jpg for the forecourt's masts
// (a steel column with a strip of white LEDs near its top: (246, 247, 250) in the photograph) and their cool white.
import * as THREE from 'three';
import { LAMP_KIND, MAST_HEIGHT, POOL_REACH, poolRadius } from '../../core/streetlights.ts';
import type { LampKind, LampSpot } from '../../core/streetlights.ts';
import { Batch, rgb } from './materials.ts';
import type { Rgb } from './materials.ts';
import { haloTexture } from './night.ts';
import type { NightLayer } from './night.ts';
import { surfaceUniforms } from './atmosphere.ts';
import { COVER_GLSL, coverUniforms } from './cover.ts';
import { createLampWeather, fadeLightInFog } from './streetlight-weather.ts';

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
  [LAMP_KIND.sodium]: { halo: 0xffa84a, pool: 0xffbc74, strength: 0.13 },
  [LAMP_KIND.warm]: { halo: 0xffd8a0, pool: 0xffd9a8, strength: 0.11 },
  [LAMP_KIND.cool]: { halo: 0xcfe4ff, pool: 0xe6ecf5, strength: 0.05 },
};

/** How far out the lamp's arm reaches, metres at `POST_HEIGHT` (the head hangs at its end). */
const ARM = 1.72;

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
  counts(): { lamps: number; triangles: number; draws: number };
  dispose(): void;
}

export interface StreetLightOptions {
  /** Existing station fixtures need only the shared heads and pools. */
  posts?: boolean;
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
  /** Clip raised platform light to the physical platforms instead of the tracks. */
  poolFloor?: { map: THREE.Texture; rect: THREE.Vector4; appliesAt?: (spot: LampSpot, index: number) => boolean };
  /** Wet open ground absorbs more light; dense fog reduces the ground pool. */
  poolWeather?: boolean;
  /** Opt-in wet head reflections and a wider fog-scattering halo. */
  weatherEffects?: boolean;
  /** Allocate reflection geometry only for this scene's nearby wet surfaces. */
  reflectionAt?: (spot: LampSpot, index: number) => boolean;
  haloSize?: number;
  /** A small white-hot core in pixels, including at panorama distances. */
  coreSize?: number;
}

export function createStreetLights(spots: readonly LampSpot[], options: StreetLightOptions = {}): StreetLights {
  const n = spots.length;
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
    const some = spots.filter((spot) => !!spot.mast === mast);
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
  const tint = new THREE.Color();
  for (const spot of spots) {
    tint.setHex(LAMP_LIGHT[spot.kind].halo);
    for (const point of spot.mast ? stripPoints(spot) : [headAt(spot)]) {
      heads.push(...point);
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
  if (options.fog) fadeLightInFog(haloMaterial);
  halos.name = 'street-lamp-halos';
  halos.visible = false;
  halos.frustumCulled = false;
  halos.renderOrder = 5;
  group.add(halos);

  let cores: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | undefined;
  if (options.coreSize && heads.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', haloGeometry.getAttribute('position'));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours.map(c => .92 + .08 * c), 3));
    const material = new THREE.PointsMaterial({ size: options.coreSize, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: options.fog ?? false, toneMapped: false });
    if (options.fog) fadeLightInFog(material);
    cores = new THREE.Points(geometry, material); cores.name = 'street-lamp-cores';
    cores.raycast = (): void => {};
    cores.frustumCulled = false; cores.renderOrder = 6; cores.visible = false;
    group.add(cores);
  }

  // the pool under each head: a flat quad with the halo's gradient, scaled to the lamp's reach, an instance colour for its light
  const poolGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  if (options.poolFloor || options.weatherEffects) poolGeometry.setAttribute('poolFloorWeight', new THREE.InstancedBufferAttribute(new Float32Array(spots.map((s,i)=>Number(options.poolFloor ? options.poolFloor.appliesAt?.(s,i) ?? true : false))),1));
  if (options.poolLineAt) poolGeometry.setAttribute('poolLine', new THREE.InstancedBufferAttribute(new Float32Array(spots.map((s,i)=>Number(options.poolLineAt!(s,i)))),1));
  const bounded = options.poolCeiling !== undefined;
  const poolMaterial = new THREE.MeshBasicMaterial({ map: options.analyticPool ? null : poolTexture(), transparent: true, opacity: 0, blending: bounded ? THREE.NormalBlending : THREE.AdditiveBlending,
    toneMapped: !bounded, depthWrite: false, fog: options.fog ?? false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const pools = new THREE.InstancedMesh(poolGeometry, poolMaterial, n);
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
      if (options.analyticPool) {
        shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPoolUv;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvPoolUv = uv;');
        declarations += '\nvarying vec2 vPoolUv;';
        if (options.poolLineAt) {
          shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float poolLine;\nvarying float vPoolLine;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvPoolLine = poolLine;');
          declarations += '\nvarying float vPoolLine;';
        }
        body += `
// pool-profile-begin
float poolR = length( 2.0 * vPoolUv - 1.0 );
${options.poolLineAt ? `float poolProfile = pow( 1.0 + 4.0 * poolR * poolR, -1.5 ) * ( 1.0 - smoothstep( 0.55, 1.0, poolR ) );
poolProfile = mix( poolProfile, (1.0 - smoothstep(.82,1.0,abs(2.0*vPoolUv.x-1.0))) * (1.0 - smoothstep(.72,1.0,abs(2.0*vPoolUv.y-1.0))), vPoolLine );
gl_FragColor.a *= poolProfile;` : 'gl_FragColor.a *= pow( 1.0 + 4.0 * poolR * poolR, -1.5 ) * ( 1.0 - smoothstep( 0.55, 1.0, poolR ) );'}
// pool-profile-end`;
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
    poolMaterial.customProgramCacheKey = () => `street-pool-${bounded}-${!!options.fog}-${!!options.poolFloor}-${!!options.poolWeather}-${!!options.analyticPool}${options.poolLineAt ? '-line' : ''}`;
  }
  pools.name = 'street-lamp-pools';
  spots.forEach((spot, i) => {
    const [x, , z] = headAt(spot);
    const r = 2 * (options.poolRadiusAt?.(spot, i) ?? poolRadius(spot.height) * (options.poolSpread ?? 1));
    const size = options.poolSizeAt?.(spot,i), rx = size?.[0] ?? r, rz = size?.[1] ?? r;
    const [gx, gz] = spot.slope;
    // the quad lies in the ground's own plane (a shear: height follows x by gx and z by gz), so on a slope it neither sinks into the ground on the uphill side nor hangs over it downhill
    matrix.set(rx, 0, 0, x, gx * rx, 1, gz * rz, spot.y + gx * (x - spot.x) + gz * (z - spot.z) + (options.poolLiftAt?.(spot,i) ?? POOL_LIFT), 0, 0, rz, z, 0, 0, 0, 1);
    pools.setMatrixAt(i, matrix);
    const light = LAMP_LIGHT[spot.kind];
    pools.setColorAt(i, tint.setHex(light.pool).multiplyScalar(options.poolCeiling ?? light.strength));
  });
  pools.instanceMatrix.needsUpdate = true;
  if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
  pools.visible = false;
  pools.frustumCulled = false;
  pools.renderOrder = 4;
  group.add(pools);
  const weather = options.weatherEffects && n ? createLampWeather(pools, spots.flatMap(s=>headAt(s)), halos, options.poolFloor,
    spots.flatMap((s,i)=>options.reflectionAt?.(s,i) === false ? [] : [i])) : undefined;
  if (weather) group.add(weather.group);

  return {
    group,
    setLevel(level) {
      const l = Math.min(1, Math.max(0, level));
      haloMaterial.opacity = l * 0.9;
      poolMaterial.opacity = l;
      halos.visible = pools.visible = l > 0.01;
      if (cores) { cores.material.opacity = l; cores.visible = l > 0.01; }
      weather?.setLevel(l);
    },
    counts: () => ({ lamps: n, triangles: meshes.reduce((sum, m) => sum + (m.geometry.index as THREE.BufferAttribute).count / 3 * m.count, 0) + 2 * n + (weather?.triangles ?? 0), draws: meshes.length + 2 + Number(!!cores) + (weather?.draws ?? 0) }),
    dispose() {
      weather?.dispose();
      for (const g of geometries) g.dispose();
      for (const m of meshes) m.dispose();
      haloGeometry.dispose();
      poolGeometry.dispose();
      material.dispose();
      haloMaterial.dispose();
      cores?.geometry.dispose(); cores?.material.dispose();
      poolMaterial.dispose();
      pools.dispose();
    },
  };
}
