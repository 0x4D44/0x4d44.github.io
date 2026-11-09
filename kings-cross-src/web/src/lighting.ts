// How the light lands on the model: the camera's grade (a filmic tone map), the sun's shadow, and the shade under the roofs.
//
// THE GRADE. The page's light is physical (a sun of 3.0 over a sky of 1.0), so the picture needs a tone map: a straight sRGB curve clips
// a sunlit white wall and crushes the shade. three's ACES filmic curve rolls the highlights off and keeps the shadows' detail. Every scene
// that has a climate (atmosphere.ts: London's, and Edinburgh Waverley's own, which the same rig lights at its own sun) is drawn through it,
// at the exposure its own sky gives; a scene without one (the fixed ?bare=1 rig, the placeholder) keeps its lights as they were and no tone
// map. The sky dome, the sun's disc, the stars, the lamps' halos, the labels and the far rail lines are authored in display colours and
// are left out of it (`toneMapped: false`), so they, and every label and board, read as they always did.
//
// THE SUN'S SHADOW. One directional light casts one 2048 x 2048 map (no cascades). The map follows what the camera looks at: its box is
// centred on the orbit target and sized from the camera's distance to it, in a few fixed steps (so zooming does not make the shadows
// swim) and snapped to the map's own texels (so moving does not either). Only the structure that stands in the sun casts: the train shed
// and its front, the concourse's lattice and panels, the landmarks, the King's Cross Central blocks, the city's buildings and the
// canopies' steel. Glass lets the sun through (R-lighting-materials-b, the shed glazing: the sun lies on the platforms in patches
// under the crown glazing, between the dark ribs, and the slate flanks leave the rest in shade), so no glazing casts; small things (signals, lamps, benches, trains, trees, rails) do not cast, which keeps the map
// to about forty draws in the busiest view. The map is drawn again only when something it depends on has moved, not every frame.
//
// THE SHADE UNDER A ROOF. A roof also takes away the sky: under the shed, the concourse or a canopy the hemisphere's light is mostly
// gone and the sun's reaches only through the glazing, so a Lambert surface whose point is under a roof (the cover map of cover.ts, the
// same one the rain stops at) keeps only part of its hemisphere light and a little less of its direct light. (R-lighting-materials-b:
// the platforms under the Barlow shed are a fifth as bright as the forecourt, and the tarmac is near black.)
import * as THREE from 'three';
import { COVER_GLSL, coverUniforms } from './cover.ts';

const materialsOf = (o: THREE.Object3D): THREE.Material[] => {
  const m = (o as { material?: THREE.Material | THREE.Material[] }).material;
  return m ? (Array.isArray(m) ? m : [m]) : [];
};

// ---- the grade ---------------------------------------------------------------------------------------------------------------------------

/**
 * Set the renderer's light grade for the scene it is about to draw: for a scene with a climate the filmic tone map at `exposure` (its own
 * sky's) and the shade under its roofs; for one without, neither. The shared materials (steel, ballast, asphalt, stone ...) carry the roof
 * shade into every scene that uses them, and the cover map it reads is the shown scene's (station-weather.ts), which a scene with no
 * climate does not have, so there it is switched off.
 */
export function grade(renderer: THREE.WebGLRenderer, graded: boolean, exposure: number): void {
  const mapping = graded ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  if (renderer.toneMapping !== mapping) renderer.toneMapping = mapping;
  renderer.toneMappingExposure = graded ? exposure : 1;
  roofShadeUniforms.uRoofShade.value.set(...(graded ? ROOF_SHADE_LOSS : NO_ROOF_SHADE));
}

/**
 * Materials that are not lit surfaces and are authored in display colours: lines (the far rails, the grid), points (stars, halos, rain),
 * sprites (labels, the sun's disc). Left out of the tone map so they keep the colours they were given. True when this call changed one.
 */
export function leaveOutOfGrade(material: THREE.Material): boolean {
  const unlit = material as THREE.Material & { isLineBasicMaterial?: boolean; isPointsMaterial?: boolean; isSpriteMaterial?: boolean };
  if ((unlit.isLineBasicMaterial || unlit.isPointsMaterial || unlit.isSpriteMaterial) && material.toneMapped) {
    material.toneMapped = false;
    material.needsUpdate = true;
    return true;
  }
  return false;
}

/**
 * A scan that leaves the unlit things of a scene out of the grade (`leaveOutOfGrade`). Call the function it returns on the scene about to be
 * drawn, every frame: it looks only at objects it has not seen, so a train, a label or a rail line that arrives later is caught on the frame
 * it does. It answers how many materials it changed. (The sun's disc and the stars are made exempt where they are made, in atmosphere.ts.)
 */
export function createUngradedScan(): (root: THREE.Object3D) => number {
  const known = new WeakSet<THREE.Object3D>();
  return (root) => {
    let changed = 0;
    root.traverse((o) => {
      if (known.has(o)) return;
      known.add(o);
      for (const m of materialsOf(o)) if (leaveOutOfGrade(m)) changed++;
    });
    return changed;
  };
}

// ---- the sun's shadow --------------------------------------------------------------------------------------------------------------------

export const SHADOW_MAP_SIZE = 2048;
/** Half the width of the shadow box, metres: the steps the box takes as the camera comes closer or goes further. */
export const SHADOW_STEPS: readonly number[] = [48, 72, 108, 160, 240, 360, 540, 800];

/** The meshes that cast the sun's shadow, by name (the census of the scene's meshes is in tests/lighting.test.ts). Glass and small things are left out. */
export const SHADOW_CASTERS: ReadonlySet<string> = new Set([
  // the train shed (shed.ts): the slate vaults and aisle roofs (not the glazed crowns), the ribs, the south front, its porch arches, the walls, the towers and the range
  'shed-roof-cladding', 'shed-aisle-roofs', 'shed-ribs', 'shed-front', 'shed-front-porch-arches', 'shed-brick', 'shed-stone', 'shed-arch-rings',
  'range-brick', 'range-stone', 'range-roof', 'tower-brick', 'tower-stone', 'tower-cap',
  // the Western Concourse (concourse.ts): the lattice, the roof panels and the columns (not the glass)
  'concourse-lattice', 'concourse-panels', 'concourse-column',
  // the landmarks (landmarks.ts): the hotels and the Barlow shed's lattice ribs (the extension's pale panels and girders, 'landmarks-metal', are left out: one more draw in the pass for a shadow nobody frames)
  'landmarks-brick', 'landmarks-brickRed', 'landmarks-stone', 'landmarks-slate', 'landmarks-rib',
  // King's Cross Central (kxcentral.ts)
  'kxcentral-brick', 'kxcentral-brickRed', 'kxcentral-stone', 'kxcentral-slate', 'kxcentral-iron', 'kxcentral-drum', 'kxcentral-timber', 'kxcentral-alu', 'kxcentral-curtain',
  // the city (city.ts): every building's walls and roofs
  'city-stock', 'city-red', 'city-stone', 'city-panel', 'city-glass', 'city-shop', 'city-roof',
  // the platform canopies (furniture.ts)
  'canopy-steel',
]);

type V3 = readonly [number, number, number];
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a: V3): [number, number, number] => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** The light's own frame: `dir` toward the sun, and `x` and `y` across it, the plane the shadow map covers (`y` is the more upright). */
export function lightAxes(toSun: V3): { dir: [number, number, number]; x: [number, number, number]; y: [number, number, number] } {
  const dir = unit3(toSun);
  const x = unit3(cross3(Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0], dir));
  return { dir, x, y: cross3(dir, x) };
}

/** Where the shadow box stands, and how big it is. */
export interface ShadowFit {
  /** half the box's width and height, metres (one of `SHADOW_STEPS`) */
  half: number;
  /** metres across one texel of the map */
  texel: number;
  /** the point the light looks at: the focus, moved in the light's plane to a texel corner */
  target: [number, number, number];
  /** the light's own position, on the line from the target toward the sun */
  position: [number, number, number];
  near: number;
  far: number;
  /** depth bias (the map's own units) and the offset along the surface normal (metres) that stop a lit surface shadowing itself */
  bias: number;
  normalBias: number;
}

/**
 * The shadow box for a camera `distance` metres from its `focus`, with the sun in the unit direction `toSun`. The box is about 1.6 times
 * the distance across each way (the picture's width at the target, and the ground in front of it), taken up to the next step; its centre is
 * the focus, held to the map's texels in the plane the light looks along; its depth covers 150 m of casters standing above it and the
 * ground the box slopes across, up to a sun 10 degrees up (a lower sun uses the 10 degree depth, and its shadows stop at the box's far edge).
 */
export function shadowFit(focus: V3, distance: number, toSun: V3, mapSize = SHADOW_MAP_SIZE): ShadowFit {
  const want = Math.min(SHADOW_STEPS[SHADOW_STEPS.length - 1] as number, Math.max(SHADOW_STEPS[0] as number, distance * 1.6));
  const half = SHADOW_STEPS.find((s) => s >= want) as number;
  const texel = (2 * half) / mapSize;
  const { dir, x, y } = lightAxes(toSun);
  const fx = dot3(focus, x), fy = dot3(focus, y);
  const dx = Math.round(fx / texel) * texel - fx, dy = Math.round(fy / texel) * texel - fy;
  const target: [number, number, number] = [focus[0] + x[0] * dx + y[0] * dy, focus[1] + x[1] * dx + y[1] * dy, focus[2] + x[2] * dx + y[2] * dy];
  const lift = Math.max(Math.asin(Math.min(1, Math.max(-1, dir[1]))), (10 * Math.PI) / 180);
  const back = half * 1.2 + 150;
  const far = back + half / Math.tan(lift) + 200;
  return {
    half, texel, target,
    position: [target[0] + dir[0] * back, target[1] + dir[1] * back, target[2] + dir[2] * back],
    near: 1, far,
    bias: -(0.02 + texel * 0.25) / far, normalBias: Math.min(0.3, Math.max(0.03, texel * 0.8)),
  };
}

export interface SunShadow {
  /** mark the scene's casters and receivers; true when the set of casters changed since the last call */
  tag(): boolean;
  /** fit the box to the camera's view and say whether the map has to be drawn again (it is flagged on the light) */
  update(camera: THREE.Camera, target: THREE.Vector3, toSun: V3): boolean;
  /** the meshes that cast now */
  casters(): readonly THREE.Mesh[];
  dispose(): void;
}

/**
 * The shadow map's render target, made here and not by three. Left to itself three makes an RGBA8 colour attachment beside the depth texture, and
 * nothing reads it: the lit shaders compare against the depth texture (three samples the colour one only when it is two-channel). At 2048 x 2048
 * that is 16.8 MB for nothing, 33.6 MB for the pair against 21 MB here, and the cap on the page's texture memory is +32 MB. The depth texture is set up
 * as three sets it up for PCFShadowMap (a hardware comparison, linearly filtered), and three keeps a map it finds already made.
 */
function shadowMapTarget(size: number): THREE.WebGLRenderTarget {
  const map = new THREE.WebGLRenderTarget(size, size, { format: THREE.RedFormat, type: THREE.UnsignedByteType });
  const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
  depth.name = 'sun.shadowMap';
  depth.format = THREE.DepthFormat;
  depth.compareFunction = THREE.LessEqualCompare;
  depth.minFilter = THREE.LinearFilter;
  depth.magFilter = THREE.LinearFilter;
  map.depthTexture = depth;
  return map;
}

/** Make `sun` cast a shadow over `scene` (see the header). The caller adds nothing: the light's target is added here. */
export function createSunShadow(scene: THREE.Scene, sun: THREE.DirectionalLight): SunShadow {
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.radius = 1.6;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  sun.shadow.map = shadowMapTarget(SHADOW_MAP_SIZE);
  scene.add(sun.target);
  const cam = sun.shadow.camera;
  const casters: THREE.Mesh[] = [];
  const known = new WeakSet<THREE.Object3D>();
  let key = '';
  let half = 0;
  let far = 0;

  const tag = (): boolean => {
    let changed = false;
    scene.traverse((o) => {
      if (known.has(o)) return;
      known.add(o);
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = materialsOf(o);
      // every lit surface takes the shadow
      if (mats.some((m) => (m as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial)) mesh.receiveShadow = true;
      if (SHADOW_CASTERS.has(mesh.name)) {
        mesh.castShadow = true;
        // a roof or a wall is one sheet: both of its faces are drawn into the map, or the sheet that faces the sun would not shade what is behind it
        for (const m of mats) m.shadowSide = THREE.DoubleSide;
        casters.push(mesh);
        changed = true;
      }
    });
    return changed;
  };

  return {
    tag,
    casters: () => casters,
    update(camera, focus, toSun) {
      const fit = shadowFit([focus.x, focus.y, focus.z], camera.position.distanceTo(focus), toSun);
      let seen = '';
      for (const m of casters) seen += m.visible ? '1' : '0';
      // what the map holds depends on its size, the texel it is centred on in its own plane (its depth along the light only shifts the planes it is cut at),
      // the sun's direction and which casters are shown; a pan along the light's own direction alone must not redraw it
      const { x, y } = lightAxes(toSun);
      const cell = `${Math.round(dot3(fit.target, x) / fit.texel)},${Math.round(dot3(fit.target, y) / fit.texel)}`;
      const next = `${fit.half}|${cell}|${toSun.map((n) => n.toFixed(4)).join(',')}|${seen}|${casters.length}`;
      sun.target.position.set(...fit.target);
      sun.position.set(...fit.position);
      sun.target.updateMatrixWorld();
      if (fit.half !== half || fit.far !== far) {
        half = fit.half;
        far = fit.far;
        cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
        cam.near = fit.near; cam.far = fit.far;
        cam.updateProjectionMatrix();
      }
      sun.shadow.bias = fit.bias;
      sun.shadow.normalBias = fit.normalBias;
      if (next === key) return false;
      key = next;
      sun.shadow.needsUpdate = true;
      return true;
    },
    dispose() {
      scene.remove(sun.target);
      sun.castShadow = false;
      sun.shadow.map?.dispose();
    },
  };
}

// ---- the shade under a roof --------------------------------------------------------------------------------------------------------------

/**
 * What a point wholly under a roof LOSES (these are losses, not what is kept: it keeps 0.80, 0.64 and 0.40 of its hemisphere light, red,
 * green and blue, and 0.85 of its direct light). Of its hemisphere light, per colour: the roof hides the sky, and the blue of it goes first,
 * so what is left is the warm-neutral light thrown back by the pale lining, the buff brick and the platforms (R-lighting-materials-b: the
 * shade under the Barlow shed is neutral grey-brown, never blue). The sky's linear colour is (0.55, 0.67, 1.0), so these losses leave an
 * up-facing surface (0.44, 0.43, 0.40): a little under half of the sky's light, and warm. The amounts are ASSUMED, judged by eye against that
 * photograph. Of its direct light: the glazing's share, a little (the map holds the shed's own ribs and slate; the glass lets the sun through).
 */
export const ROOF_SHADE = { ambient: [0.2, 0.36, 0.6], direct: 0.15 } as const;
const ROOF_SHADE_LOSS: readonly [number, number, number, number] = [...ROOF_SHADE.ambient, ROOF_SHADE.direct];
const NO_ROOF_SHADE: readonly [number, number, number, number] = [0, 0, 0, 0];

/**
 * GLSL: `roofShade(p, loss)` is the factor on a Lambert surface's (hemisphere light as r, g, b; direct light as a) at the world point `p`: 1 in
 * the open or over a roof, `1 - loss` wholly under one, and between across a roof's soft edge (cover.ts `coverGroundAt`).
 */
export const ROOF_SHADE_GLSL = /* glsl */`
vec4 roofShade( vec3 p, vec4 loss ) {
  float under = coverGroundAt( p );
  return vec4( 1.0 ) - loss * under;
}
`;

/** The one uniform every roof-shaded program shares: its loss (see `ROOF_SHADE`), or zero while a scene other than London's is drawn. */
export const roofShadeUniforms = { uRoofShade: { value: new THREE.Vector4(...ROOF_SHADE_LOSS) } };

const shaded = new WeakSet<THREE.Material>();

/**
 * Give a Lambert material the shade under roofs: after the lights are summed, the hemisphere and direct terms are scaled by `roofShade` at the
 * fragment's world position (read back from the view-space one, as atmosphere.ts does for the wet ground). Any `onBeforeCompile` the
 * material already has still runs, first, and its cache key is kept in the program's, so a surface that is also wet-patched is its own program.
 * A material is shaded once, however many atmospheres or scans reach it (the station's materials are shared between scenes).
 */
export function addRoofShade(material: THREE.MeshLambertMaterial): void {
  if (shaded.has(material)) return;
  shaded.add(material);
  const prior = material.onBeforeCompile;
  const priorKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prior.call(material, shader, renderer);
    Object.assign(shader.uniforms, coverUniforms, roofShadeUniforms);
    let fragment = shader.fragmentShader;
    if (!fragment.includes('float coverGroundAt')) fragment = fragment.replace('#include <common>', `#include <common>\n${COVER_GLSL}`);
    fragment = fragment.replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>\nuniform vec4 uRoofShade;\n${ROOF_SHADE_GLSL}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  vec4 roofK = roofShade( cameraPosition - vViewPosition * mat3( viewMatrix ), uRoofShade );
  reflectedLight.indirectDiffuse *= roofK.rgb;
  reflectedLight.directDiffuse *= roofK.a;
}`);
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => `${priorKey}+roofShade`;
  material.needsUpdate = true;
}
