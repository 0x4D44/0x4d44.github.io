// One station-side Euston Road row. The legacy layer still owns the fixtures,
// the luminous heads and all reflection/fog data.
import * as THREE from 'three';
import { distanceToSegment } from '../../core/ole.ts';
import { lampLevelFor } from '../../core/daylight.ts';
import type { MidlandPlan } from '../../core/landmarks.ts';
import { LAMP_KIND } from '../../core/streetlights.ts';
import type { LampSpot } from '../../core/streetlights.ts';
import type { AtmosphereState } from './atmosphere.ts';
import { coverUniforms } from './cover.ts';
import { headOf } from './streetlights.ts';
import type { StreetLights } from './streetlights.ts';

// Fixed lamp feet in model metres. The suffixes are indices in
// the frozen city lamp plan. Positions identify the posts across plan reorderings.
export const EUSTON_P1_ROW = [
  { id: 'kx/euston-north/1057', x: -107.747, z: 137.974 },
  { id: 'kx/euston-north/1044', x: -62.073, z: 108.657 },
  { id: 'kx/euston-north/1003', x: -26.550, z: 100.981 },
  { id: 'kx/euston-north/1041', x: 17.506, z: 51.575 },
  { id: 'kx/euston-north/1043', x: 48.363, z: 31.919 },
] as const;

export function isEustonPilotLamp(spot: LampSpot): boolean {
  return !spot.mast && spot.kind === LAMP_KIND.sodium
    && EUSTON_P1_ROW.some(({ x, z }) => Math.abs(spot.x - x) < 0.05 && Math.abs(spot.z - z) < 0.05);
}

const REACH = 38;
const RECEIVERS = new Map([
  ['city-asphalt', false], ['city-pavement', false], ['city-paint', false],
  ['landmarks-brickRed', true], ['landmarks-stone', true],
]);

// An asymmetric optic in angular coordinates: a long road-parallel throw,
// a peak near the first lane and a short skirt behind the head on the paving.
// The high-angle lobe reaches street-facing masonry below the head. The
// effective intensity includes Lambert 1/pi. It maps an albedo of .078
// through the existing night exposure into the unclipped sodium road tones.
export const EUSTON_P1_OPTIC = `
vec3 eustonP1One(vec3 p, vec3 n, vec3 centre, vec2 aim, vec3 wall, bool facade) {
  vec3 ray = centre - p;
  float d2 = dot(ray, ray);
  if (d2 >= 1444.0 || ray.y <= 0.0 || dot(p.xz, wall.xy) < wall.z - 0.025) return vec3(0.0);
  float facing = dot(n, ray);
  if (facing <= 0.0) return vec3(0.0);
  float d = sqrt(d2);
  float across = -dot(ray.xz, aim);
  float optic = 0.0;
  if (facade) {
    // Walk the street-side face up to the wall plane. Recess backs and side
    // returns cannot see the fitting; the open arcade glazing is a separate mesh.
    optic = 1.18 * smoothstep(0.0, 0.14, ray.y / d)
      * (1.0 - smoothstep(0.25, 0.57, ray.y / d))
      * smoothstep(0.1, 0.58, dot(n.xz, wall.xy));
  } else {
    float angle = across / ray.y;
    float along = abs(dot(ray.xz, vec2(-aim.y, aim.x))) / ray.y;
    optic = smoothstep(-0.86, -0.30, angle) * (1.0 - smoothstep(0.65, 1.43, angle))
      * (1.0 - smoothstep(0.66, 2.28, along)) / (1.0 + 1.5 * (angle - 0.38) * (angle - 0.38));
  }
  float distanceWindow = 1.0 - smoothstep(27.0, 38.0, d);
  return vec3(1.0, 0.43, 0.19) * (205.0 * optic * distanceWindow * facing / (d * max(d2, 1.0)));
}
`;

export function createNightLightingPilot(scene: THREE.Scene) {
  const level = { value: 0 };
  const uniforms: Record<string, THREE.IUniform> = { uEustonP1Level: level };
  const bounds = new THREE.Vector4();
  uniforms.uEustonP1Bounds = { value: bounds };
  let sourceCount = 0;
  let street: StreetLights | undefined;
  const receivers = new Map<THREE.Mesh, boolean>();
  const swaps = new Map<THREE.Mesh, THREE.Material>();
  const variants = new Map<THREE.Material, THREE.MeshLambertMaterial>();

  function nightMaterial(source: THREE.MeshLambertMaterial, facade: boolean): THREE.MeshLambertMaterial {
    const existing = variants.get(source);
    if (existing) return existing;
    const night = source.clone();
    if (source.defines) night.defines = { ...source.defines };
    const prior = source.onBeforeCompile;
    const key = source.customProgramCacheKey();
    const count = sourceCount;
    const slots = Array.from({ length: count }, (_, i) => `uEustonP1Source${i}`);
    const declarations = slots.map(s => `uniform vec3 ${s}Head; uniform vec2 ${s}Aim; uniform vec3 ${s}Wall;`).join('\n');
    const samples = slots.map(s => `eustonP1One(p, n, ${s}Head, ${s}Aim, ${s}Wall, ${facade})`).join(' + ');
    const field = `
uniform float uEustonP1Level;
uniform vec4 uEustonP1Bounds;
${declarations}
${EUSTON_P1_OPTIC}
vec3 eustonP1At(vec3 p, vec3 n) {
  if (p.x < uEustonP1Bounds.x || p.z < uEustonP1Bounds.y || p.x > uEustonP1Bounds.z || p.z > uEustonP1Bounds.w) return vec3(0.0);
  vec3 light = ${samples};
  if (light.r <= 0.0) return light;
  return light * (1.0 - coverGroundAt(p)) * uEustonP1Level;
}`;
    night.onBeforeCompile = (shader, renderer) => {
      prior.call(source, shader, renderer);
      Object.assign(shader.uniforms, coverUniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        // addRoofShade has already declared the cover reads in <common>.
        .replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>\n${field}`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
${facade ? 'if ( vMidlandNight.x > 0.5 ) ' : ''}{
  vec3 eustonP1 = eustonP1At( cameraPosition - vViewPosition * mat3( viewMatrix ), inverseTransformDirection( normal, viewMatrix ) );
  if ( eustonP1.r > 0.0 ) reflectedLight.directDiffuse += eustonP1 * material.diffuseColor;
}`);
    };
    night.customProgramCacheKey = () => `${key}+euston-p1-${count}-${facade}`;
    variants.set(source, night);
    return night;
  }

  function restoreMaterials(): void {
    for (const [mesh, source] of swaps) mesh.material = source;
    swaps.clear();
  }

  function clearVariants(): void {
    restoreMaterials();
    for (const material of variants.values()) material.dispose();
    variants.clear();
  }

  return {
    register(spots: readonly LampSpot[], midland: MidlandPlan | null, lights: StreetLights): void {
      street?.setReceiverPools?.(false);
      clearVariants();
      street = lights;
      const row = spots.filter(isEustonPilotLamp);
      bounds.set(Infinity, Infinity, -Infinity, -Infinity);
      sourceCount = row.length;
      row.forEach((spot, i) => {
        const head = headOf(spot);
        const aim = new THREE.Vector2(Math.cos(spot.yaw), -Math.sin(spot.yaw));
        const at: [number, number] = [spot.x, spot.z];
        let distance = Infinity;
        let edge: MidlandPlan['front']['edges'][number] | undefined;
        for (const facet of midland?.front.edges ?? []) {
          const d = distanceToSegment(at, facet.a, facet.b);
          if (d < distance) { distance = d; edge = facet; }
        }
        // The survey plane is at the exposed Midland wall. Where the row
        // continues past the hotel, clip spill behind the back of the footway.
        const wall = edge && distance < REACH
          ? new THREE.Vector3(...edge.normal, edge.normal[0] * edge.a[0] + edge.normal[1] * edge.a[1])
          : new THREE.Vector3(aim.x, aim.y, aim.dot(new THREE.Vector2(head[0], head[2])) - 9);
        uniforms[`uEustonP1Source${i}Head`] = { value: new THREE.Vector3(...head) };
        uniforms[`uEustonP1Source${i}Aim`] = { value: aim };
        uniforms[`uEustonP1Source${i}Wall`] = { value: wall };
        bounds.set(Math.min(bounds.x, head[0] - REACH), Math.min(bounds.y, head[2] - REACH),
          Math.max(bounds.z, head[0] + REACH), Math.max(bounds.w, head[2] + REACH));
      });
    },
    scan(): void {
      restoreMaterials();
      receivers.clear();
      if (!sourceCount) return;
      for (const [name, facade] of RECEIVERS) {
        const mesh = scene.getObjectByName(name);
        if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshLambertMaterial) receivers.set(mesh, facade);
      }
    },
    setFrame(displayedScene: THREE.Scene, state: AtmosphereState | null): void {
      // Gloom can light the legacy lamps at noon. The visible scene and the
      // actual sun, rather than that lamp switch alone, select this program.
      const elevation = state?.sun.elevationDeg ?? 90;
      const next = displayedScene === scene && state && elevation < -0.833
        ? Math.min(state.rig.lampLevel, lampLevelFor(elevation)) : 0;
      level.value = receivers.size && next > 0.01 ? next : 0;
      if (level.value === 0 && swaps.size) restoreMaterials();
      if (level.value > 0 && !swaps.size) {
        for (const [mesh, facade] of receivers) {
          const source = mesh.material as THREE.MeshLambertMaterial;
          swaps.set(mesh, source);
          mesh.material = nightMaterial(source, facade);
        }
      }
      street?.setReceiverPools?.(level.value > 0);
    },
    restoreMaterials,
    dispose(): void {
      street?.setReceiverPools?.(false);
      clearVariants();
      receivers.clear();
      street = undefined;
      sourceCount = 0;
      level.value = 0;
    },
  };
}

export type NightLightingPilot = ReturnType<typeof createNightLightingPilot>;
