import * as THREE from 'three';
import { lampLevelFor } from '../../core/daylight.ts';
import type { MidlandPlan } from '../../core/landmarks.ts';
import { buildLightField, EUSTON_FACADE_REACH, EUSTON_ROAD_REACH, LIGHT_FIELD_DOWNLIGHT, LIGHT_FIELD_EUSTON, LIGHT_FIELD_FACADE_REACH,
  LIGHT_FIELD_STRIP, LIGHT_FIELD_TEXELS_PER_SOURCE } from '../../core/light-field.ts';
import type { LightField, LightGridSpec } from '../../core/light-field.ts';
import { lightSourcesFor } from '../../core/light-sources.ts';
import type { AtmosphereState } from './atmosphere.ts';
import { EUSTON_FACADE_LOBE, EUSTON_ROAD_LOBES, eustonFrontPlanes } from './euston-light-optic.ts';
import type { StreetLights } from './streetlights.ts';

export function nightLightGLSL(cap: number, frontPlanes = 0): string {
  const planes = Array.from({ length: frontPlanes }, (_, i) => `uNightLightFront${i}`);
  return `
uniform vec2 uNightLightLevels;
uniform vec2 uNightLightWeather;
uniform vec4 uNightLightGridRect;
uniform float uNightLightCellM;
uniform float uNightLightDataWidth;
uniform float uNightLightGridWidth;
uniform sampler2D uNightLightData;
uniform sampler2D uNightLightGrid;
${planes.map(name => `uniform vec4 ${name};`).join('\n')}
${planes.length ? `
vec3 nightLightFrontPlane(float x) {
${planes.slice(0, -1).map(name => `  if (x >= ${name}.x) return ${name}.yzw;`).join('\n')}
  return ${planes.at(-1)}.yzw;
}
` : ''}
vec4 nightLightTexel(sampler2D tex, float address, float width) {
  float row = floor(address / width);
  return texelFetch(tex, ivec2(address - row * width, row), 0);
}
vec4 nightLightGridBytes(float address) {
  return floor(nightLightTexel(uNightLightGrid, address, uNightLightGridWidth) * 255.0 + 0.5);
}
float nightLightSlot(float slot) {
  float address = floor(slot * 0.5);
  vec4 bytes = nightLightGridBytes(address);
  return slot == address * 2.0 ? dot(bytes.rg, vec2(1.0, 256.0)) : dot(bytes.ba, vec2(1.0, 256.0));
}
vec3 nightLightOne(vec3 p, vec3 n, float covered, float id, bool facade, vec3 frontPlane) {
  float address = id * ${LIGHT_FIELD_TEXELS_PER_SOURCE.toFixed(1)};
  vec4 head = nightLightTexel(uNightLightData, address, uNightLightDataWidth);
  vec3 ray = head.xyz - p;
  float d2 = dot(ray, ray);
  float facing = dot(n, ray);
  if (ray.y <= 0.0 || facing <= 0.0) return vec3(0.0);

  vec4 colour = nightLightTexel(uNightLightData, address + 1.0, uNightLightDataWidth);
  float receipt = colour.w < 0.0 ? covered : 1.0 - covered;
  if (receipt <= 0.0) return vec3(0.0);
  float kind = abs(colour.w);
  bool road = kind <= ${LIGHT_FIELD_EUSTON.toFixed(1)};
  vec4 params = nightLightTexel(uNightLightData, address + 2.0, uNightLightDataWidth);
  bool euston = kind == ${LIGHT_FIELD_EUSTON.toFixed(1)};
  float facadeReach = euston ? ${EUSTON_FACADE_REACH.toFixed(1)} : ${LIGHT_FIELD_FACADE_REACH.toFixed(1)};
  float groundReach = euston ? min(params.y, ${EUSTON_ROAD_REACH.toFixed(1)}) : params.y;
  float reach = facade && road ? facadeReach : groundReach;
  // Road cutoffs use full distance as in P1. The strip and downlight radii
  // describe the horizontal footprint, so an elevated fixture still reaches the ground.
  float horizontal2 = dot(ray.xz, ray.xz);
  if ((road ? d2 : horizontal2) >= reach * reach) return vec3(0.0);

  vec4 plane = nightLightTexel(uNightLightData, address + 3.0, uNightLightDataWidth);
  // Midland masonry uses the receiving facet's plane. Ground and other
  // facades use the plane recorded on the individual lamp, when present.
  if (facade && road && dot(frontPlane.xy, frontPlane.xy) > 0.0) {
    plane = vec4(frontPlane.x, 0.0, frontPlane.y, frontPlane.z);
  }
  if (dot(p, plane.xyz) < plane.w) return vec3(0.0);

  float d = sqrt(d2);
  float optic = 0.0;
  float window = 1.0;
  vec3 spectrum = colour.rgb;
  if (road && facade) {
    // With no recorded plane, the fragment's local normal supplies N.L.
    vec3 wall = dot(plane.xz, plane.xz) > 0.0 ? plane.xzw : vec3(n.xz, 0.0);
${EUSTON_FACADE_LOBE}
    // The Euston fittings stand up to 33 m from the Midland front. Keep
    // their cross-street throw and taper spill along the individual facade.
    float alongWall = abs(dot(ray.xz, vec2(-wall.y, wall.x)));
    window = (1.0 - smoothstep(euston ? 27.0 : 10.0, reach, d))
      * (1.0 - smoothstep(3.0, 12.0, alongWall));
    if (euston) spectrum = vec3(1.0, 0.43, 0.19);
  } else if (road) {
    vec2 aim = vec2(cos(params.x), -sin(params.x));
    float angle = -dot(ray.xz, aim) * params.z / ray.y;
    float along = abs(dot(ray.xz, vec2(-aim.y, aim.x))) * params.w / ray.y;
${EUSTON_ROAD_LOBES}
    window = 1.0 - smoothstep(reach * (27.0 / 38.0), reach, d);
    if (euston) {
      // Parallel rows can feed the same fragments. Keep the cross-street
      // skirt and let each pool taper sooner along the carriageway.
      window *= 0.50 * (1.0 - smoothstep(0.45, 1.15, along));
      spectrum = vec3(1.0, 0.48, 0.18);
    }
  } else if (kind == ${LIGHT_FIELD_STRIP.toFixed(1)}) {
    vec2 aim = vec2(cos(params.x), -sin(params.x));
    float r = length(vec2(dot(ray.xz, aim) / params.z, dot(ray.xz, vec2(-aim.y, aim.x)) / params.w));
    optic = 1.0 - smoothstep(0.52, 1.0, r);
  } else if (kind == ${LIGHT_FIELD_DOWNLIGHT.toFixed(1)}) {
    optic = smoothstep(params.z, params.w, ray.y / d);
    window = 1.0 - smoothstep(0.75 * reach, reach, sqrt(horizontal2));
  }
  return spectrum * (head.w * optic * window * receipt * facing / (d * max(d2, 1.0)));
}
vec3 nightLightAt(vec3 p, vec3 n, bool facade, vec3 frontPlane) {
  if (uNightLightLevels.x <= 0.0) return vec3(0.0);
  vec2 cell = floor((p.xz - uNightLightGridRect.xy) / uNightLightCellM);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uNightLightGridRect.z || cell.y >= uNightLightGridRect.w) return vec3(0.0);
  vec4 header = nightLightGridBytes(cell.y * uNightLightGridRect.z + cell.x);
  float offset = dot(header, vec4(1.0, 256.0, 65536.0, 16777216.0));
  float count = nightLightSlot(offset);
  if (count <= 0.0) return vec3(0.0);
  float covered = coverGroundAt(p);
  vec3 light = vec3(0.0);
  for (int i = 0; i < ${cap}; i += 1) {
    if (float(i) >= count) break;
    float id = nightLightSlot(offset + float(i) + 1.0);
    light += nightLightOne(p, n, covered, id, facade, frontPlane);
  }
  return light * uNightLightLevels.x;
}
vec3 nightGroundReceipt(vec3 albedo) {
  // Ploughed tyre tracks and snow piled along kerbs still show in the base
  // surface. The added lamplight uses subdued, broad snow scatter so it
  // does not turn those narrow albedo changes into high-contrast stripes.
  float snow = smoothstep(0.02, 0.75, uNightLightLevels.y);
  vec3 ground = mix(albedo, vec3(0.065, 0.068, 0.075), snow);
  // Camera fog is applied later. Dense local fog also veils the pool at
  // short camera distances, and wet paving leaves more light to reflections.
  float fog = smoothstep(0.40, 0.90, uNightLightWeather.y);
  return ground * (1.0 - 0.77 * uNightLightWeather.x) * (1.0 - 0.68 * fog);
}
`;
}

const groundReceivers = new Set(['city-asphalt', 'city-pavement', 'city-paint', 'city-plaza', 'city-grass',
  'terrain-ground', 'terrain-bank']);
const facadeReceivers = new Set(['city-stock', 'city-red', 'city-stone', 'city-panel', 'city-shop']);
const midlandReceivers = new Set(['landmarks-brickRed', 'landmarks-stone']);
type Receiver = 'ground' | 'facade' | 'midland';

function dataTexture(data: Float32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>, width: number, height: number) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat,
    data instanceof Float32Array ? THREE.FloatType : THREE.UnsignedByteType);
  texture.internalFormat = data instanceof Float32Array ? 'RGBA32F' : 'RGBA8';
  texture.needsUpdate = true;
  return texture;
}

function fieldTextures(field: LightField) {
  return {
    data: dataTexture(field.data, field.dataWidth, field.dataHeight),
    grid: dataTexture(field.grid, field.gridWidth, field.gridHeight),
  };
}

export function createNightLightLayer(scene: THREE.Scene, spec: LightGridSpec) {
  const levels = new THREE.Vector2();
  const weather = new THREE.Vector2();
  const uniforms = {
    uNightLightLevels: { value: levels },
    uNightLightWeather: { value: weather },
    uNightLightGridRect: { value: new THREE.Vector4() },
    uNightLightCellM: { value: spec.cellM },
    uNightLightDataWidth: { value: 1 },
    uNightLightGridWidth: { value: 1 },
    uNightLightData: { value: null as THREE.Texture | null },
    uNightLightGrid: { value: null as THREE.Texture | null },
  };
  let front: Record<string, THREE.IUniform> = {};
  let textures: ReturnType<typeof fieldTextures> | undefined;
  let street: StreetLights | undefined;
  const receivers = new Map<THREE.Mesh, Receiver>();
  const swaps = new Map<THREE.Mesh, { original: THREE.MeshLambertMaterial; night: THREE.MeshLambertMaterial }>();
  const variants = new Map<THREE.MeshLambertMaterial, Map<Receiver, THREE.MeshLambertMaterial>>();

  function nightMaterial(source: THREE.MeshLambertMaterial, receiver: Receiver): THREE.MeshLambertMaterial {
    const variantsByReceiver = variants.get(source) ?? new Map();
    const existing = variantsByReceiver.get(receiver);
    if (existing) return existing;
    const night = source.clone();
    if (source.defines) night.defines = { ...source.defines };
    const prior = source.onBeforeCompile;
    const key = source.customProgramCacheKey();
    const planes = receiver === 'midland' ? Object.keys(front).length : 0;
    const field = nightLightGLSL(spec.cap, planes);
    night.onBeforeCompile = (shader, renderer) => {
      // Leave the include in place so addRoofShade inserts its shade and
      // headlamps before this contribution. The original hook still owns them.
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
${receiver === 'midland' ? 'if (vMidlandNight.x > 0.5) ' : ''}{
  vec3 nightP = cameraPosition - vViewPosition * mat3( viewMatrix );
  vec3 nightN = inverseTransformDirection( normal, viewMatrix );
  reflectedLight.directDiffuse += nightLightAt(nightP, nightN, ${receiver !== 'ground'}, ${planes ? 'nightLightFrontPlane(nightP.x)' : 'vec3(0.0)'})
    * ${receiver === 'ground' ? 'nightGroundReceipt(material.diffuseColor)' : 'material.diffuseColor'};
}`);
      prior.call(source, shader, renderer);
      Object.assign(shader.uniforms, uniforms, receiver === 'midland' ? front : {});
      // The prior Lambert hook has already declared coverGroundAt in <common>.
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>\n${field}`);
    };
    night.customProgramCacheKey = () => `${key}+night-light-${receiver}-${spec.cap}-${planes}`;
    variantsByReceiver.set(receiver, night);
    variants.set(source, variantsByReceiver);
    return night;
  }

  function restoreMaterials(): void {
    for (const [mesh, { original, night }] of swaps) {
      if (mesh.material === night) mesh.material = original;
    }
    swaps.clear();
  }

  function deactivate(): void {
    restoreMaterials();
    levels.set(0, 0);
    weather.set(0, 0);
    uniforms.uNightLightData.value = null;
    uniforms.uNightLightGrid.value = null;
    street?.setReceiverPools?.(false);
  }

  function releaseField(): void {
    deactivate();
    for (const group of variants.values()) for (const material of group.values()) material.dispose();
    variants.clear();
    textures?.data.dispose();
    textures?.grid.dispose();
    textures = undefined;
  }

  return {
    register(lights: StreetLights, midland: MidlandPlan | null): void {
      releaseField();
      street = lights;
      // The registry also contains platforms, sheds and reflection panels.
      const field = buildLightField(lightSourcesFor(scene).filter(source =>
        source.station === 'kx' && (source.tags.includes('road') || source.tags.includes('mast'))), spec);
      if (!field.sources.length) return;
      textures = fieldTextures(field);
      uniforms.uNightLightGridRect.value.set(...field.origin, field.columns, field.rows);
      uniforms.uNightLightDataWidth.value = field.dataWidth;
      uniforms.uNightLightGridWidth.value = field.gridWidth;
      front = Object.fromEntries(eustonFrontPlanes(midland).map(([x, nx, nz, offset], i) =>
        [`uNightLightFront${i}`, { value: new THREE.Vector4(x, nx, nz, offset - .025) }]));
    },
    restoreMaterials,
    scan(): void {
      restoreMaterials();
      receivers.clear();
      scene.traverse(mesh => {
        if (!(mesh instanceof THREE.Mesh) || !(mesh.material instanceof THREE.MeshLambertMaterial)) return;
        if (groundReceivers.has(mesh.name) || mesh.material.name === 'ground-flat') receivers.set(mesh, 'ground');
        else if (facadeReceivers.has(mesh.name)) receivers.set(mesh, 'facade');
        else if (midlandReceivers.has(mesh.name) && mesh.geometry.hasAttribute('midlandNight')) receivers.set(mesh, 'midland');
      });
    },
    setFrame(displayed: THREE.Scene, state: AtmosphereState | null): void {
      const elevation = state?.sun.elevationDeg ?? 90;
      const level = state && elevation < -0.833 ? Math.min(state.rig.lampLevel, lampLevelFor(elevation)) : 0;
      if (displayed !== scene || !textures || !receivers.size || level <= .01) {
        if (levels.x > 0) deactivate();
        return;
      }
      levels.set(level, state!.weather.snowCover);
      weather.set(state!.weather.wet, state!.rig.fogAmount);
      uniforms.uNightLightData.value = textures.data;
      uniforms.uNightLightGrid.value = textures.grid;
      for (const [mesh, receiver] of receivers) {
        let swap = swaps.get(mesh);
        if (!swap || mesh.material !== swap.night) {
          const original = mesh.material;
          if (!(original instanceof THREE.MeshLambertMaterial)) continue;
          swap = { original, night: nightMaterial(original, receiver) };
          swaps.set(mesh, swap);
          mesh.material = swap.night;
        }
        // Atmosphere updates emissive stand-ins on the original material.
        swap.night.emissive.copy(swap.original.emissive);
        swap.night.emissiveIntensity = swap.original.emissiveIntensity;
        swap.night.shadowSide = swap.original.shadowSide;
        swap.night.depthWrite = swap.original.depthWrite;
      }
      street?.setReceiverPools?.(true);
    },
    dispose(): void {
      releaseField();
      receivers.clear();
      street = undefined;
    },
  };
}
export type NightLightLayer = ReturnType<typeof createNightLightLayer>;
