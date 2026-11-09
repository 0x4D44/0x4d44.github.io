// Time of day and weather, applied to the scene. `update` takes the scene clock and the weather state and drives:
//   the sun (direction, colour, strength), the sky ambient and the fills, from core/solar.ts and core/daylight.ts;
//   the sky dome (repainted), a sun disc and, on clear nights, stars; the scene fog and background;
//   the lamps: halos (night.ts), the trains' lit windows and lenses (train-geom.ts), and the daylight stand-ins (the shed's lining,
//   ribs and glazing, the platform canopy glass), which glow like day by day and dim after dark;
//   the ground: darker and a little glossy when wet, covered when it snows (a few lines in the Lambert shader of each surface);
//   rain streaks or snow flakes (precip.ts);
//   the roofs (cover.ts): the weather stops at them, so nothing falls and nothing is wet or white under the shed, the concourse or a canopy.
// All of it is cheap. The sky maths run four times a second, not every frame; the dome is repainted only when its colours move.
// Nothing here fetches anything: the weather arrives as a `WeatherState` (weather.ts).
import * as THREE from 'three';
import { fogRange, skyRig } from '../../core/daylight.ts';
import type { ReferenceRig, Rgb, SkyRig } from '../../core/daylight.ts';
import { solarPosition } from '../../core/solar.ts';
import type { SolarPosition } from '../../core/solar.ts';
import { applyCover, buildCoverMap, COVER_GLSL, coverUniforms, findRoofs } from './cover.ts';
import type { CoverMap } from './cover.ts';
import { createNightLights } from './night.ts';
import type { NightLights, NightLightSites } from './night.ts';
import { createPrecip } from './precip.ts';
import type { Precip } from './precip.ts';
import { trainNight } from './train-geom.ts';
import { LIGHTS } from './world.ts';
import type { World } from './world.ts';
import type { WeatherState } from './weather.ts';

/** The page's long-standing rig, as the reference the sky model scales. */
export const REFERENCE: ReferenceRig = {
  sun: { colour: LIGHTS.sun.colour, intensity: LIGHTS.sun.intensity },
  hemisphere: { sky: LIGHTS.hemisphere.sky, ground: LIGHTS.hemisphere.ground, intensity: LIGHTS.hemisphere.intensity },
  fills: LIGHTS.fills.map((f) => ({ colour: f.colour, intensity: f.intensity })),
};

/**
 * The materials that get wet and take snow, by name. `dark`: how much darker at full wet (0..1); `sheen`: how much of the sky shows
 * in it at a glancing angle; `snow`: how much of the snow cover it takes.
 */
export const SURFACES: ReadonlyMap<string, { dark: number; sheen: number; snow: number }> = new Map([
  ['asphalt', { dark: 0.42, sheen: 1, snow: 1 }],
  ['platformEdge', { dark: 0.3, sheen: 0.8, snow: 0.7 }],
  ['platformEdgeStrip', { dark: 0.3, sheen: 0.8, snow: 0.7 }],
  ['ballast', { dark: 0.4, sheen: 0.15, snow: 0.8 }],
  ['concourseFloor', { dark: 0.22, sheen: 0.7, snow: 0 }],
  ['city-asphalt', { dark: 0.42, sheen: 1, snow: 1 }],
  ['city-pavement', { dark: 0.38, sheen: 0.9, snow: 1 }],
  ['city-plaza', { dark: 0.34, sheen: 0.9, snow: 1 }],
  ['city-grass', { dark: 0.25, sheen: 0, snow: 1 }],
  ['terrain-ground', { dark: 0.35, sheen: 0.1, snow: 1 }],
  ['terrain-bank', { dark: 0.25, sheen: 0, snow: 1 }],
  ['ground-flat', { dark: 0.35, sheen: 0.1, snow: 1 }],
]);

/** Lying snow, linear rgb. */
const SNOW = new THREE.Color(0.72, 0.75, 0.79);

const rgb = (c: THREE.Color, v: Rgb): THREE.Color => c.setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Shared by every wet surface: the weather's wetness and snow cover, and the sky colour the wet ground mirrors. */
const surfaceUniforms = { wet: { value: 0 }, snowCover: { value: 0 }, sheen: { value: new THREE.Color(0, 0, 0) }, snowColour: { value: SNOW } };

/**
 * Add wetness and snow to a Lambert surface in its own shader: after the texture and colours are applied the surface darkens
 * (`uDark` x `uWet`) and blends toward snow (`uSnowK` x `uSnowCover`); after lighting, a sky-coloured sheen that grows at glancing
 * angles is added (`uSheenK` x `uWet`). With uWet and uSnowCover at 0 the surface draws as it always did. Under a roof (cover.ts) none
 * of it applies: the point's world position is read back from the view-space one the fragment already has, and the weather's share of it
 * (`coverOpen`: 1 in the open, 0 under a roof, a soft line between at the roof's edge) multiplies the wet and the snow. In dry weather the
 * cover is not read at all.
 */
function patchSurface(material: THREE.MeshLambertMaterial, spec: { dark: number; sheen: number; snow: number }): void {
  const own = { uDark: { value: spec.dark }, uSheenK: { value: spec.sheen }, uSnowK: { value: spec.snow } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = surfaceUniforms.wet;
    shader.uniforms.uSnowCover = surfaceUniforms.snowCover;
    shader.uniforms.uSheen = surfaceUniforms.sheen;
    shader.uniforms.uSnowColour = surfaceUniforms.snowColour;
    Object.assign(shader.uniforms, coverUniforms, own);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uWet;
uniform float uSnowCover;
uniform vec3 uSheen;
uniform vec3 uSnowColour;
uniform float uDark;
uniform float uSheenK;
uniform float uSnowK;
${COVER_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float coverOpen = 1.0;
if ( uWet + uSnowCover > 0.001 ) coverOpen = 1.0 - coverGroundAt( cameraPosition - vViewPosition * mat3( viewMatrix ) );
float wetHere = uWet * coverOpen;
diffuseColor.rgb *= 1.0 - uDark * wetHere;
diffuseColor.rgb = mix( diffuseColor.rgb, uSnowColour, 0.85 * uSnowCover * coverOpen * uSnowK );`)
      .replace('#include <opaque_fragment>', `{
  float wetFresnel = pow( 1.0 - clamp( dot( normalize( normal ), normalize( vViewPosition ) ), 0.0, 1.0 ), 3.0 );
  outgoingLight += uSheen * uSheenK * wetHere * ( 0.05 + 0.6 * wetFresnel );
}
#include <opaque_fragment>`);
  };
  material.needsUpdate = true;
}

function sunTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.07, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,245,225,0.55)');
  grad.addColorStop(0.35, 'rgba(255,235,200,0.16)');
  grad.addColorStop(1, 'rgba(255,230,190,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Stars: a fixed scatter over the upper sky, the same every load. */
function starPoints(): THREE.Points {
  const n = 700;
  const positions: number[] = [];
  let a = 7;
  const next = (): number => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
  while (positions.length < n * 3) {
    const y = next();
    if (y < 0.06) continue;
    const phi = next() * 2 * Math.PI;
    const r = Math.sqrt(1 - y * y);
    positions.push(4900 * r * Math.cos(phi), 4900 * y, 4900 * r * Math.sin(phi));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xd6e0ff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const points = new THREE.Points(geometry, material);
  points.name = 'stars';
  points.visible = false;
  points.frustumCulled = false;
  return points;
}

export interface AtmosphereOptions {
  scene: THREE.Scene;
  world: World;
  /** where the night lights go (night.ts `nightLightSites`); null leaves them out */
  sites: NightLightSites | null;
}

export interface AtmosphereFrame {
  /** the scene clock, epoch milliseconds (UTC) */
  timeMs: number;
  weather: WeatherState;
  camera: THREE.Camera;
  /** the point the camera orbits */
  target: THREE.Vector3;
  /** a steady wall clock, milliseconds (the animation frame's time) */
  wallMs: number;
}

export interface AtmosphereState {
  timeMs: number;
  sun: SolarPosition;
  weather: WeatherState;
  rig: SkyRig;
}

export interface Atmosphere {
  update(frame: AtmosphereFrame): void;
  /** Look again for materials created since (the city, terrain and landmarks load lazily). */
  rescan(): void;
  state(): AtmosphereState | null;
  /** The roofs the weather stops at, drawn from the scene's roof meshes (cover.ts); null while there are none. */
  cover(): CoverMap | null;
  precip: Precip;
  nightLights: NightLights | null;
  dispose(): void;
}

type Emissive = THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;

/** After dark a daylight stand-in (a shed lining that glows like sky-lit day) keeps this share of its glow, warmed, as the lamps' light on it. */
export const LAMP_SHARE = 0.22;
/** After dark the unlit far-rail lines keep this share of their brightness. */
export const RAIL_NIGHT = 0.3;

export function createAtmosphere({ scene, world, sites }: AtmosphereOptions): Atmosphere {
  const { hemisphere, sun, fills } = world.lights;
  const precip = createPrecip();
  scene.add(precip.group);
  const nightLights = sites ? createNightLights(sites) : null;
  if (nightLights) scene.add(nightLights.group);

  // the sun disc and the stars ride on the dome, which follows the camera
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sunSprite.name = 'sun-disc';
  sunSprite.scale.setScalar(900);
  sunSprite.visible = false;
  const stars = starPoints();
  world.sky.add(sunSprite, stars);

  // ---- surfaces that get wet, and stand-ins for daylight --------------------------------------------------
  const patched = new Set<THREE.Material>();
  const standIns = new Map<Emissive, THREE.Color>();
  const railLines = new Map<THREE.LineBasicMaterial, THREE.Color>();
  // the roofs: the cover map is drawn again only when the set of roof meshes changes (the landmarks arrive after the first frame)
  let roofKey: string | null = null;
  let coverMap: CoverMap | null = null;
  const rescan = (): void => {
    const roofs = findRoofs(scene);
    const key = roofs.map((m) => m.uuid).join(',');
    if (key !== roofKey) {
      roofKey = key;
      coverMap = buildCoverMap(scene, roofs);
      applyCover(coverMap);
    }
    // the far rails are unlit lines, which would glow white against a night city: they follow the daylight
    scene.getObjectByName('track')?.traverse((o) => {
      const line = o as THREE.LineSegments;
      if (!line.isLineSegments) return;
      for (const m of Array.isArray(line.material) ? line.material : [line.material]) {
        const basic = m as THREE.LineBasicMaterial;
        if (basic.isLineBasicMaterial && !railLines.has(basic)) railLines.set(basic, basic.color.clone());
      }
    });
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const lambert = m as THREE.MeshLambertMaterial;
        const spec = SURFACES.get(m.name);
        if (spec && lambert.isMeshLambertMaterial && !patched.has(m)) {
          patched.add(m);
          patchSurface(lambert, spec);
        }
        const emissive = m as Emissive;
        if ((lambert.isMeshLambertMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial) && emissive.emissive.getHex() !== 0 && !standIns.has(emissive)) {
          standIns.set(emissive, emissive.emissive.clone());
        }
      }
    });
  };
  rescan();

  let state: AtmosphereState | null = null;
  let lastCompute = -Infinity;
  const paint = { zenith: [-1, -1, -1] as Rgb, horizon: [-1, -1, -1] as Rgb, glow: -1, sunKey: '' };
  const sunDirection = new THREE.Vector3();
  const colour = new THREE.Color();

  /** Repaint the dome: horizon to zenith, with a glow round the sun. The colours are worked in sRGB, then stored as linear. */
  const paintDome = (rig: SkyRig): void => {
    const geometry = world.sky.geometry;
    const pos = geometry.getAttribute('position');
    const attr = geometry.getAttribute('color') as THREE.BufferAttribute;
    const [sx, sy, sz] = rig.sun.direction;
    const { zenith, horizon } = rig.dome;
    const gc = rig.glow.colour;
    const gs = rig.glow.strength;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, y, z);
      const t = clamp01(y / r);
      const k = Math.pow(t, 0.55);
      const toSun = Math.max(0, (x * sx + y * sy + z * sz) / r);
      const glow = gs * (0.55 * Math.pow(toSun, 24) + 0.45 * Math.pow(toSun, 3) * Math.pow(1 - t, 4));
      colour.setRGB(
        horizon[0] + (zenith[0] - horizon[0]) * k + gc[0] * glow,
        horizon[1] + (zenith[1] - horizon[1]) * k + gc[1] * glow,
        horizon[2] + (zenith[2] - horizon[2]) * k + gc[2] * glow, THREE.SRGBColorSpace);
      attr.setXYZ(i, colour.r, colour.g, colour.b);
    }
    attr.needsUpdate = true;
  };

  const apply = (rig: SkyRig, sunPos: SolarPosition, weather: WeatherState): void => {
    // The key light is the sun while it has any strength and the stylised moon after it; the two never overlap (daylight.ts).
    const key = rig.moon.intensity > rig.sun.intensity ? rig.moon : rig.sun;
    sun.position.set(key.direction[0] * 700, key.direction[1] * 700, key.direction[2] * 700);
    rgb(sun.color, key.colour);
    sun.intensity = key.intensity;
    rgb(hemisphere.color, rig.hemisphere.sky);
    rgb(hemisphere.groundColor, rig.hemisphere.ground);
    hemisphere.intensity = rig.hemisphere.intensity;
    fills.forEach((f, i) => {
      const r = rig.fills[i];
      if (!r) return;
      rgb(f.color, r.colour);
      f.intensity = r.intensity;
    });

    // The dome only when its colours or the sun's place have moved enough to see.
    let moved = Math.abs(rig.glow.strength - paint.glow);
    for (let i = 0; i < 3; i++) moved = Math.max(moved, Math.abs((rig.dome.zenith[i] as number) - (paint.zenith[i] as number)), Math.abs((rig.dome.horizon[i] as number) - (paint.horizon[i] as number)));
    const sunKey = `${Math.round(sunPos.elevationDeg * 4)}/${Math.round(sunPos.azimuthDeg * 2)}`;
    if (moved > 0.004 || sunKey !== paint.sunKey) {
      paintDome(rig);
      paint.zenith = [...rig.dome.zenith];
      paint.horizon = [...rig.dome.horizon];
      paint.glow = rig.glow.strength;
      paint.sunKey = sunKey;
    }
    // the sun's disc: visible from just under the horizon, dimmed by cloud and fog
    sunDirection.set(...rig.sun.direction);
    sunSprite.position.copy(sunDirection).multiplyScalar(4800);
    const disc = clamp01((sunPos.elevationDeg + 1.5) / 2) * (1 - weather.cloud * 0.97) * (1 - rig.fogAmount);
    sunSprite.visible = disc > 0.01;
    const sunMaterial = sunSprite.material;
    sunMaterial.opacity = disc;
    rgb(sunMaterial.color, [Math.min(1, rig.sun.colour[0] * 1.1 + 0.15), Math.min(1, rig.sun.colour[1] * 1.1 + 0.15), Math.min(1, rig.sun.colour[2] * 1.1 + 0.2)]);
    stars.visible = rig.stars > 0.01;
    (stars.material as THREE.PointsMaterial).opacity = rig.stars * 0.9;

    // lamps: halos, and the trains' windows and lenses
    nightLights?.setLevel(rig.lampLevel);
    trainNight.value = rig.lampLevel;
    // what glowed like sky-lit day dims after dark, with a warm share from the lamps
    for (const [m, base] of standIns) {
      const day = rig.daylight;
      const lamp = LAMP_SHARE * rig.lampLevel;
      m.emissive.setRGB(base.r * (day + lamp), base.g * (day + lamp * 0.82), base.b * (day + lamp * 0.52));
    }

    for (const [m, base] of railLines) m.color.copy(base).multiplyScalar(RAIL_NIGHT + (1 - RAIL_NIGHT) * rig.daylight);

    // wet and snowy ground
    rgb(surfaceUniforms.sheen.value, rig.dome.horizon).multiplyScalar(0.55);
    surfaceUniforms.wet.value = weather.wet;
    surfaceUniforms.snowCover.value = weather.snowCover;
  };

  return {
    precip, nightLights,
    rescan,
    state: () => state,
    cover: () => coverMap,
    update(f) {
      // The sky maths run four times a second; a new weather (a new object, which happens when a reading arrives) runs them at once.
      if (state === null || f.weather !== state.weather || f.wallMs - lastCompute >= 250) {
        lastCompute = f.wallMs;
        const sunPos = solarPosition(f.timeMs);
        const w = f.weather;
        const rig = skyRig(sunPos.elevationDeg, sunPos.azimuthDeg, { cloud: w.cloud, rain: w.rain, snow: w.snow, visibilityM: w.visibilityM }, REFERENCE);
        state = { timeMs: f.timeMs, sun: sunPos, weather: w, rig };
        apply(rig, sunPos, w);
      }
      if (!state) return;
      // every frame: the fog follows the camera's height, and the rain follows what is looked at
      if (scene.fog instanceof THREE.Fog) {
        const range = fogRange(state.weather.visibilityM, f.camera.position.y);
        scene.fog.near = range.near;
        scene.fog.far = range.far;
        rgb(scene.fog.color, state.rig.fog);
      }
      if (scene.background instanceof THREE.Color) rgb(scene.background, state.rig.dome.horizon);
      precip.update({ timeS: f.wallMs / 1000, target: f.target, camera: f.camera.position, distance: f.camera.position.distanceTo(f.target), rain: state.weather.rain,
        snow: state.weather.snow, windMs: state.weather.windMs, daylight: state.rig.daylight });
    },
    dispose() {
      applyCover(null);
      precip.dispose();
      nightLights?.dispose();
      world.sky.remove(sunSprite, stars);
      sunSprite.material.dispose();
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
    },
  };
}
