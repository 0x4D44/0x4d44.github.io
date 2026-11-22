import * as THREE from 'three';
import { lampLevelFor } from '../../core/daylight.ts';
import type { MidlandPlan } from '../../core/landmarks.ts';
import { buildLightField, EUSTON_FACADE_REACH, EUSTON_ROAD_REACH, EUSTON_ROAD_SPECTRUM, LIGHT_FIELD_DOWNLIGHT, LIGHT_FIELD_EUSTON, LIGHT_FIELD_FACADE_REACH,
  LIGHT_FIELD_ROAD, LIGHT_FIELD_STRIP, LIGHT_FIELD_TEXELS_PER_SOURCE } from '../../core/light-field.ts';
import type { LightField, LightGridSpec } from '../../core/light-field.ts';
import { lightSourcesFor } from '../../core/light-sources.ts';
import type { AtmosphereState } from './atmosphere.ts';
import { EUSTON_FACADE_LOBE, EUSTON_ROAD_LOBES, eustonFrontPlanes } from './euston-light-optic.ts';
import type { StreetLights } from './streetlights.ts';

// Side-street lanterns on the ground: the share of each weaker overlapping pool
// that adds to the strongest, and the light (linear luma) that the summed pool's
// centre rolls off by half at.
const SIDE_OVERLAP = 0.8;
const SIDE_KNEE = 1.2;
// Their gain on the carriageway and on other paving, in clear air and rain
// (fog and lying snow already fill the street), the carriageway's own knee,
// and the scale on the along-street distance that stretches each pool down
// its street.
const SIDE_ROAD_GAIN = 3.6;
const SIDE_ROAD_KNEE = 1.0;
const SIDE_PAVING_GAIN = 0.8;
const SIDE_ALONG = 0.5;
// The light (linear luma) that a lantern's spill on a wall beside it levels off at.
const SIDE_WALL_KNEE = 0.6;
// The most of a mast's ground spill that takes a sodium pool's hue, on clear
// ground and on lying snow.
const MAST_SHARE = 0.6;
const MAST_SNOW_SHARE = 1.0;
// The same on wet ground and in ground fog, where the wet sheen and the haze
// otherwise thin the pool's amber (main's decals kept it).
const MAST_WET_SHARE = 1.0;

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
// The pilot's own light from P1's five posts, which the field never undercuts.
vec3 nightLightFloor;
// Forecourt mast spill on the ground, held apart from the street lamps (see nightMastBlend).
vec3 nightLightMast;
// Light from the side-street lanterns, on the ground or a wall: their sum and per-channel peak (see nightLightAt).
vec3 nightLightSide;
vec3 nightLightSideTop;
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
float nightLightRoadLobe(float angle, float along) {
  float optic = 0.0;
${EUSTON_ROAD_LOBES}
  return optic;
}
float nightLightSlot(float slot) {
  float address = floor(slot * 0.5);
  vec4 bytes = nightLightGridBytes(address);
  return slot == address * 2.0 ? dot(bytes.rg, vec2(1.0, 256.0)) : dot(bytes.ba, vec2(1.0, 256.0));
}
vec3 nightLightOne(vec3 p, vec3 n, float covered, float id, bool facade, vec3 frontPlane,
  float fog, float snowRoad, float lowerBrick) {
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
  // Euston records carry P1's strength in place of a spectrum (see packLight).
  float pilot = euston ? colour.r * receipt * facing / (d * max(d2, 1.0)) : 0.0;
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
    // P1 lit the Midland front without the along-wall taper.
    if (pilot > 0.0 && dot(frontPlane.xy, frontPlane.xy) > 0.0) {
      nightLightFloor += spectrum * (pilot * optic * (1.0 - smoothstep(27.0, reach, d)));
    }
    if (euston && lowerBrick > 0.0) {
      // The narrow upper-wall lobe misses lower bays between the fittings.
      // Broaden their side-on spill within the same front plane and reach.
      float shoulder = 0.86 * (1.0 - smoothstep(35.0, reach, d))
        * (1.0 - smoothstep(8.0, 27.0, alongWall))
        * smoothstep(0.1, 0.58, dot(n.xz, wall.xy));
      float extra = max(0.0, shoulder - optic * window) * lowerBrick;
      return (spectrum * (optic * window) + vec3(1.0, 0.68, 0.23) * extra)
        * (head.w * receipt * facing / (d * max(d2, 1.0)));
    }
  } else if (road) {
    vec2 aim = vec2(cos(params.x), -sin(params.x));
    float angle = -dot(ray.xz, aim) * params.z / ray.y;
    float along = abs(dot(ray.xz, vec2(-aim.y, aim.x))) * params.w / ray.y * (euston ? 1.0 : ${SIDE_ALONG.toFixed(2)});
    optic = nightLightRoadLobe(angle, along);
    if (pilot > 0.0) {
      // P1's lobes take unscaled angles and its own distance window.
      nightLightFloor += vec3(${EUSTON_ROAD_SPECTRUM.map(v => v.toFixed(2)).join(', ')}) * (pilot * (1.0 - smoothstep(27.0, reach, d))
        * nightLightRoadLobe(angle / params.z, along / params.w));
    }
    window = 1.0 - smoothstep(reach * mix(27.0 / 38.0, 0.56, fog), reach, d);
    if (euston) {
      // Separate the pools along the carriageway. Fog broadens the optical
      // shoulder while preserving the pool's centre and the cross-street skirt.
      // A narrow lift under the head puts the pool's peak beside the post, as
      // main's pools had it, without filling the gaps the halving opened.
      window *= 0.50 + 0.12 * (1.0 - smoothstep(0.05, 0.45, abs(angle))) * (1.0 - smoothstep(0.2, 0.6, along));
      optic *= 1.0 - smoothstep(mix(0.32, 0.23, fog), mix(1.04, 1.27, fog), along);
      // The forward lobe reaches on across the far lanes. Main drew the
      // fittings outside P1 as pools that ended about 6 m in front of the post,
      // so taper their throw beyond 4 m (fog softens the edge). P1's posts keep
      // the pilot's throw. Lying snow keeps it too: the cleared lanes meet
      // their shoulder with it, as main's snow pools did.
      if (colour.r <= 0.0) {
        optic *= mix(1.0 - smoothstep(0.40, mix(0.64, 0.90, fog), angle), 1.0, smoothstep(0.02, 0.75, uNightLightLevels.y));
      }
      if (snowRoad > 0.0) {
        // A weak, wider shoulder bridges the ends of opposing beams on
        // cleared lanes, where slush scatters a little light into the gap.
        // It starts beyond the beam's own end, so it leaves the dark gaps
        // between lamps along the lane alone (main's snow pools had them).
        float shoulder = smoothstep(0.85, 1.2, abs(angle)) * (1.0 - smoothstep(1.1, 2.6, abs(angle)))
          * (1.0 - smoothstep(0.65, 1.65, along));
        optic = max(optic, 0.35 * snowRoad * shoulder);
      }
      if (fog > 0.0) {
        // Feather the light from the beam core into the wider fog shoulder.
        // The core sits at the pool's clear-air peak beside the post (main's
        // fog pools peaked there), not at the lobe's peak across the road.
        vec2 fromCore = vec2(angle - 0.10, 0.65 * along);
        window *= mix(1.0, 0.46 + 0.54 / (1.0 + 70.0 * dot(fromCore, fromCore)), fog);
      }
      spectrum = vec3(1.0, 0.55, 0.18);
    }
  } else if (kind == ${LIGHT_FIELD_STRIP.toFixed(1)}) {
    vec2 aim = vec2(cos(params.x), -sin(params.x));
    float r = length(vec2(dot(ray.xz, aim) / params.z, dot(ray.xz, vec2(-aim.y, aim.x)) / params.w));
    optic = 1.0 - smoothstep(0.52, 1.0, r);
  } else if (kind == ${LIGHT_FIELD_DOWNLIGHT.toFixed(1)}) {
    optic = smoothstep(params.z - 0.10 * fog, params.w, ray.y / d);
    window = 1.0 - smoothstep(0.75 * reach, reach, sqrt(horizontal2));
  }
  vec3 lit = spectrum * (head.w * optic * window * receipt * facing / (d * max(d2, 1.0)));
  if (!facade && kind == ${LIGHT_FIELD_DOWNLIGHT.toFixed(1)}) {
    nightLightMast += lit;
    return vec3(0.0);
  }
  if (kind == ${LIGHT_FIELD_ROAD.toFixed(1)}) {
    nightLightSide += lit;
    nightLightSideTop = max(nightLightSideTop, lit);
    return vec3(0.0);
  }
  return lit;
}
vec3 nightMastBlend(vec3 lamps, vec3 mast, float snow) {
  // Where a sodium pool overlaps a mast's neutral spill, the sum washed the
  // amber out (main's decals kept it). Shift part of the mast's light toward
  // the sodium chroma at the mast's own luminance, so the pool keeps its hue
  // and the mast its brightness; away from sodium the mast stays neutral.
  // Lying snow under the pool is otherwise blue with moonlight, which main's
  // decals covered, so there all of the overlapping spill takes the hue.
  float amber = max(lamps.r - lamps.b, 0.0);
  float wet = max(uNightLightWeather.x, smoothstep(0.40, 0.90, uNightLightWeather.y));
  float share = mix(mix(${MAST_SHARE.toFixed(2)}, ${MAST_WET_SHARE.toFixed(2)}, wet), ${MAST_SNOW_SHARE.toFixed(2)}, snow)
    * smoothstep(0.08, 0.45, amber / (amber + mast.g + 1e-6));
  vec3 luma = vec3(0.2126, 0.7152, 0.0722);
  vec3 tint = lamps * (dot(mast, luma) / max(dot(lamps, luma), 1e-6));
  return mix(mast, tint, share);
}
vec3 nightLightAt(vec3 p, vec3 n, bool facade, vec3 frontPlane, bool carriageway, float lowerBrick) {
  // City roofs are excluded by the receiver list. Mixed façade batches also
  // contain upward faces, such as parapet caps, that should receive no spill.
  // P1's façade lobe gives them nothing either.
  nightLightFloor = vec3(0.0);
  nightLightMast = vec3(0.0);
  nightLightSide = vec3(0.0);
  nightLightSideTop = vec3(0.0);
  if (uNightLightLevels.x <= 0.0 || (facade && n.y > 0.5)) return vec3(0.0);
  vec2 cell = floor((p.xz - uNightLightGridRect.xy) / uNightLightCellM);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uNightLightGridRect.z || cell.y >= uNightLightGridRect.w) return vec3(0.0);
  vec4 header = nightLightGridBytes(cell.y * uNightLightGridRect.z + cell.x);
  float offset = dot(header, vec4(1.0, 256.0, 65536.0, 16777216.0));
  float count = nightLightSlot(offset);
  if (count <= 0.0) return vec3(0.0);
  float covered = coverGroundAt(p);
  float fog = facade ? 0.0 : smoothstep(0.40, 0.90, uNightLightWeather.y);
  float snowRoad = carriageway ? smoothstep(0.02, 0.75, uNightLightLevels.y) : 0.0;
  vec3 light = vec3(0.0);
  for (int i = 0; i < ${cap}; i += 1) {
    if (float(i) >= count) break;
    float id = nightLightSlot(offset + float(i) + 1.0);
    light += nightLightOne(p, n, covered, id, facade, frontPlane, fog, snowRoad, lowerBrick);
  }
  // Side-street lanterns stand in clusters (Pancras Road has a 5 m and a 9 m
  // post 4 m apart, and a third 7 m on), and their summed pools out-shone
  // Euston Road. Overlaps add most of the weaker pools to the strongest, and
  // the low posts' hot centres roll off.
  vec3 luma = vec3(0.2126, 0.7152, 0.0722);
  if (facade) {
    // A lantern a few metres from a wall clipped it to white. Level the
    // spill off softly; the dimmer glow along the terrace keeps its strength.
    float wall = dot(nightLightSide, luma) / ${SIDE_WALL_KNEE.toFixed(2)};
    light += nightLightSide / sqrt(sqrt(1.0 + wall * wall * wall * wall));
  } else {
    // Main's decals filled each side street evenly along the carriageway.
    // Lift the dark asphalt more than the paving beside it, where the back
    // lobe already reached, and give the pools Euston Road's sodium hue at
    // their own luminance: the narrow-band orange read as a saturated spot.
    vec3 side = (nightLightSideTop + ${SIDE_OVERLAP.toFixed(2)} * (nightLightSide - nightLightSideTop))
      * mix(carriageway ? ${SIDE_ROAD_GAIN.toFixed(2)} : ${SIDE_PAVING_GAIN.toFixed(2)}, 1.0, max(fog, smoothstep(0.02, 0.75, uNightLightLevels.y)));
    vec3 sodium = vec3(1.0, 0.55, 0.18);
    side = sodium * (dot(side, luma) / dot(sodium, luma));
    light += side / (1.0 + dot(side, luma) / (carriageway ? ${SIDE_ROAD_KNEE.toFixed(2)} : ${SIDE_KNEE.toFixed(2)}));
  }
  nightLightFloor *= uNightLightLevels.x;
  light *= uNightLightLevels.x;
  if (facade) return max(light, nightLightFloor);
  // P1's floor raises the street-lamp light alone. Taking it against the sum
  // let a mast's neutral spill replace the pilot's amber instead of adding to it.
  vec3 lamps = max(light, nightLightFloor);
  float snow = smoothstep(0.02, 0.75, uNightLightLevels.y);
  return lamps + nightMastBlend(lamps, nightLightMast * uNightLightLevels.x, snow);
}
vec3 nightFieldDiffuse(vec3 light, vec3 albedo, bool carriageway) {
  // Wet paving darkens through the receiving albedo alone. A further field
  // factor left lamp-lit wet roads and mast pools below main's decals.
  vec3 paving = light * albedo;
  if (uNightLightLevels.y <= 0.02) return paving;
  float snow = smoothstep(0.02, 0.75, uNightLightLevels.y);
  // Cleared lanes and their paint share a dark slush reflectance. The
  // narrow tyre and kerb masks still affect the base surface.
  // Grey slush under sodium reads tan rather than orange (McKay): it takes a
  // share of the light's luminance as well as its hue.
  vec3 slush = mix(light, vec3(dot(light, vec3(0.2126, 0.7152, 0.0722))), 0.25) * vec3(0.049, 0.051, 0.055);
  vec3 scatter = carriageway ? slush : light * 0.80;
  float peak = max(max(scatter.r, scatter.g), scatter.b);
  if (carriageway) return mix(paving, scatter * (0.22 / max(0.22, peak)), snow);
  // Ploughed tyre tracks and snow piled along kerbs still show in the base
  // surface. Broad snow scatter across the join avoids lighting those narrow
  // masks as stripes. Roll off the sum so overlapping lights cannot clip it.
  return mix(paving, scatter / (1.0 + peak / 0.22), snow);
}
vec3 nightGroundDiffuse(vec3 light, vec3 albedo, bool carriageway) {
  // P1 lit the receiving albedo in every weather; nightLightAt has just set the floor.
  return max(nightFieldDiffuse(light, albedo, carriageway), nightLightFloor * albedo);
}
`;
}

const carriagewayReceivers = new Set(['city-asphalt', 'city-paint']);
const groundReceivers = new Set(['city-pavement', 'city-plaza', 'city-grass',
  'terrain-ground', 'terrain-bank']);
const facadeReceivers = new Set(['city-stock', 'city-red', 'city-stone', 'city-panel', 'city-shop']);
const midlandReceivers = new Set(['landmarks-brickRed', 'landmarks-stone']);
type Receiver = 'ground' | 'carriageway' | 'facade' | 'midland' | 'midland-brick';

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
    const isMidland = receiver === 'midland' || receiver === 'midland-brick';
    const carriageway = receiver === 'carriageway';
    const ground = receiver === 'ground' || carriageway;
    const planes = isMidland ? Object.keys(front).length : 0;
    const field = nightLightGLSL(spec.cap, planes);
    const plane = planes ? 'nightLightFrontPlane(nightP.x)' : 'vec3(0.0)';
    const lowerBrick = receiver === 'midland-brick' ? '1.0 - smoothstep(6.0, 11.0, vMidlandHeight)' : '0.0';
    const sample = `nightLightAt(nightP, nightN, ${!ground}, ${plane}, ${carriageway}, ${lowerBrick})`;
    const diffuse = ground ? `nightGroundDiffuse(${sample}, material.diffuseColor, ${carriageway})` : `${sample} * material.diffuseColor`;
    night.onBeforeCompile = (shader, renderer) => {
      // Leave the include in place so addRoofShade inserts its shade and
      // headlamps before this contribution. The original hook still owns them.
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
${isMidland ? 'if (vMidlandNight.x > 0.5) ' : ''}{
  vec3 nightP = cameraPosition - vViewPosition * mat3( viewMatrix );
  vec3 nightN = inverseTransformDirection( normal, viewMatrix );
  reflectedLight.directDiffuse += ${diffuse};
}`);
      prior.call(source, shader, renderer);
      Object.assign(shader.uniforms, uniforms, isMidland ? front : {});
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
        if (carriagewayReceivers.has(mesh.name)) receivers.set(mesh, 'carriageway');
        else if (groundReceivers.has(mesh.name) || mesh.material.name === 'ground-flat') receivers.set(mesh, 'ground');
        else if (facadeReceivers.has(mesh.name)) receivers.set(mesh, 'facade');
        else if (midlandReceivers.has(mesh.name) && mesh.geometry.hasAttribute('midlandNight')) {
          receivers.set(mesh, mesh.name === 'landmarks-brickRed' ? 'midland-brick' : 'midland');
        }
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
