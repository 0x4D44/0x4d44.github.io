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
// under the crown glazing, between the dark ribs, and the slate flanks leave the rest in shade), so no glazing casts; small things (signals, lamps, benches, trains, rails) do not cast, and the trees do (one instanced draw), which keeps the map
// to about forty draws in the busiest view. The map is drawn again only when something it depends on has moved, not every frame.
//
// THE SHADE UNDER A ROOF. A roof also takes away the sky: under the shed, the concourse or a canopy the hemisphere's light is mostly
// gone and the sun's reaches only through the glazing, so a Lambert surface whose point is under a roof (the cover map of cover.ts, the
// same one the rain stops at) keeps only part of its hemisphere light and a little less of its direct light. (R-lighting-materials-b:
// the platforms under the Barlow shed are a fifth as bright as the forecourt, and the tarmac is near black.)
import * as THREE from 'three';
import { COVER_GLSL, coverUniforms } from './cover.ts';
import { windowNight } from './materials.ts';

const materialsOf = (o: THREE.Object3D): THREE.Material[] => {
  const m = (o as { material?: THREE.Material | THREE.Material[] }).material;
  return m ? (Array.isArray(m) ? m : [m]) : [];
};

// ---- the grade ---------------------------------------------------------------------------------------------------------------------------

/**
 * Set the renderer's light grade for the scene it is about to draw: for a scene with a climate the filmic tone map at `exposure` (its own
 * sky's) and the shade under its roofs; for one without, neither. The shared materials (steel, ballast, asphalt, stone ...) carry the roof
 * shade into every scene that uses them, and the cover map it reads is the shown scene's (station-weather.ts), which a scene with no
 * climate does not have, so there it is switched off. `hemisphere` and `cloud` (the shown sky's hemisphere intensity and cloud) are given
 * for London's scene only, and give the concourse its fill (`INTERIOR`); left out, there is none.
 */
export function grade(renderer: THREE.WebGLRenderer, graded: boolean, exposure: number, hemisphere = 0, cloud = 0): void {
  const mapping = graded ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  if (renderer.toneMapping !== mapping) renderer.toneMapping = mapping;
  renderer.toneMappingExposure = graded ? exposure : 1;
  roofShadeUniforms.uRoofShade.value.set(...(graded ? ROOF_SHADE_LOSS : NO_ROOF_SHADE));
  interiorFillFor(graded ? hemisphere : 0, cloud, roofShadeUniforms.uInteriorFill.value);
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

/**
 * A look at whether anything has been added to a scene since the last look. The scans of this module (the ungraded scan above, the shadow's
 * `tag`) visit every object of the scene, a few thousand of them, to find the few it has not seen: a tenth of a millisecond a frame, on
 * every frame, to find nothing on nearly all of them (a train arrives every few seconds). The watch hears three's 'childadded' on every
 * object it has met, so it says yes on the first look at a scene, and after that only on the frame after an object was added anywhere in
 * it. Call the function it returns with the scene about to be drawn; run the scans when it answers true.
 */
export function createAdditionsWatch(): (root: THREE.Object3D) => boolean {
  const heard = new WeakSet<THREE.Object3D>();
  let dirty = true;
  let last: THREE.Object3D | null = null;
  const hear = (): void => { dirty = true; };
  return (root) => {
    if (root === last && !dirty) return false;
    last = root;
    dirty = false;
    root.traverse((o) => {
      if (heard.has(o)) return;
      heard.add(o);
      o.addEventListener('childadded', hear);
    });
    return true;
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
  // the landmarks (landmarks.ts): the hotels (the Barlow shed's lattice ribs, 'landmarks-rib', and the extension's pale panels and girders, 'landmarks-metal', are left out: 18,666 triangles
  // a frame in the pass for a shadow that falls under a glazed roof nobody frames, round 5's 800,000-triangle ruling)
  'landmarks-brick', 'landmarks-brickRed', 'landmarks-brickDeep', 'landmarks-stone', 'landmarks-slate',
  // King's Cross Central (kxcentral.ts)
  'kxcentral-brick', 'kxcentral-brickRed', 'kxcentral-stone', 'kxcentral-slate', 'kxcentral-iron', 'kxcentral-drum', 'kxcentral-timber', 'kxcentral-alu', 'kxcentral-curtain',
  // the city (city.ts): every building's walls and roofs, and the trees (one instanced draw of about 30 triangles a tree: without them the forecourt's trees stand in the sun and
  // cast nothing, and float on the ground in the picture, R-lighting-materials-b and the round 3 score)
  'city-stock', 'city-red', 'city-stone', 'city-panel', 'city-glass', 'city-shop', 'city-roof', 'city-trees',
  // the platform canopies (furniture.ts)
  'canopy-steel',
]);

/**
 * The casters that shade only what stands under their own roof, by room: 0 the Western Concourse's lattice and columns, 1 the shed's ribs. They cast while the camera is within
 * `ROOM_REACH` of their room (a camera outside sees their shadow through no more than a glazed roof), and the trees, whose shadows are in the open, cast while it is in none. The
 * rest of the pass is whole-city meshes that three can only cull whole: with these on everywhere the pass came to 237,000 triangles and the frame to 879,000, over the page's
 * 800,000 (round 5's ruling); with them as here no view of the rubric's nine is over 780,000, and each draws what its own picture shows.
 */
const ROOM_OF: ReadonlyMap<string, number> = new Map([['concourse-lattice', 0], ['concourse-column', 0], ['shed-ribs', 1]]);
export const ROOM_REACH = 10;

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

/**
 * How many times the soft edge of a shadow asks the map. three takes five; each ask is a hardware 2 x 2 comparison and the asks are turned a different angle at each
 * pixel, so three leave a fine grain on the edge where five leave a little less, and the edge is a pixel or two wide.
 */
export const SHADOW_TAPS = 3;

/** Replace `from` in three's shader chunk `name` with `to`, once for the page; a chunk that no longer reads as expected (three has moved on) is an error, not a silent no-op. */
function patchChunk(name: 'lights_fragment_begin' | 'shadowmap_pars_fragment', from: string | RegExp, to: string): void {
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  const text = chunks[name] as string;
  if (text.includes(to)) return; // made already (this module loaded twice)
  const next = text.replace(from, to);
  if (next === text) throw new Error(`lighting.ts: three's ${name} chunk has changed`);
  chunks[name] = next;
}

/**
 * Two changes to three's own shadow shader, made when this module loads (the chunks are shared by every lit material on the page). A face turned away from the sun
 * (N.L <= 0) gets none of its light, shadow or no shadow, so it is not asked whether it is in the shadow: the picture is the same and the fragment skips the look-up.
 * And the soft edge takes `SHADOW_TAPS` asks, not five. Together they are most of the shadow's cost in a view full of lit fragments.
 */
patchChunk('lights_fragment_begin', 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ]', // the directional light's line, not the point's, spot's or sun's
  'directLight.color *= ( directLight.visible && receiveShadow && dot( geometryNormal, directLight.direction ) > 0.0 ) ? getShadow( directionalShadowMap[ i ]');
if (SHADOW_TAPS < 5) {
  const asks = Array.from({ length: SHADOW_TAPS }, (_, i) => `texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( ${i}, ${SHADOW_TAPS}, phi ) * radius, shadowCoord.z ) )`);
  patchChunk('shadowmap_pars_fragment', /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \)[\s\S]*?\) \* 0\.2;/,
    `shadow = ( ${asks.join(' + ')} ) * ${(1 / SHADOW_TAPS).toFixed(8)};`);
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
  const rooms = [0, 1].map(() => ({ box: new THREE.Box3(), meshes: [] as THREE.Mesh[] }));
  const trees: THREE.Mesh[] = [];
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
      // every lit surface takes the shadow, but glass: a pane is seen through, so the sun's patch on it is not what the eye reads, and the shed's glazing and the
      // cars' windows are the large see-through surfaces of a view, where the look-up cost a tenth of a frame (round 4, measured interleaved against the build without it)
      if (mats.some((m) => (m as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial) && !mats.some((m) => m.transparent)) mesh.receiveShadow = true;
      if (SHADOW_CASTERS.has(mesh.name)) {
        mesh.castShadow = true;
        // a roof or a wall is one sheet: both of its faces are drawn into the map, or the sheet that faces the sun would not shade what is behind it
        for (const m of mats) m.shadowSide = THREE.DoubleSide;
        casters.push(mesh);
        const room = rooms[ROOM_OF.get(mesh.name) ?? -1];
        if (room) { mesh.updateWorldMatrix(true, false); room.box.expandByObject(mesh); room.meshes.push(mesh); } else if (mesh.name === 'city-trees') trees.push(mesh);
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
      let inside = false;
      for (const { box, meshes } of rooms) {
        const near = box.distanceToPoint(camera.position) < ROOM_REACH;
        for (const m of meshes) m.castShadow = near;
        inside ||= near;
      }
      for (const m of trees) m.castShadow = !inside;
      let seen = '';
      for (const m of casters) seen += m.visible && m.castShadow ? '1' : '0';
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

/**
 * THE FILL UNDER THE CONCOURSE. The shade above is the Barlow shed's: it keeps 0.4 to 0.8 of the hemisphere's light and the sun's reaches only through the glass. The
 * Western Concourse is not that. Its roof is a solid white soffit under a glazed rim, so the room is lit by the light thrown back from the soffit and the glass wall, and
 * its floor and the Range's brick read as a daylit hall (the Western Concourse's conc-ab and conc-b: the floor a mid grey, the Range's buff brick at about (110, 94, 71),
 * its lit courses brighter). With the shed's shade alone the floor drew at L 9 and the Range's face at L 24, neutral and half the brightness. So where the highest roof
 * over a point is the concourse's (cover.ts `ROOM_ROOFS`) a Lambert surface also gets a fill: a warm-neutral irradiance that follows the hemisphere's own intensity (so it
 * follows the hour and the sky), kept less under cloud (the exposure already doubles then), added as the hemisphere's light is, scaled by the surface's own colour and by
 * how far under the roof it is. The amounts are ASSUMED, judged by the Range's and the floor's colour in the frozen views against those photographs.
 *
 * It is weighted twice, in the shader (round five, the concourse worker's finding). Added alike in every direction it put about +0.44 (linear) on white steel, and the tone map's shoulder (from
 * 0.45 up, at the noon rig's exposure) squeezed the diagrid's members and the funnel's legs into 225 to 235 whatever way a face turned, tinted warm: the legs' luminance spread (p90 less p10, at
 * concourse-funnel-up) fell from 39 to 4, and under cloud the roof and the legs dissolved into the sky. So the fill is scaled by how far down the face seen looks (`down`: the room's light comes
 * from above, so a face straight down keeps 1 less `down` of it, a floor or a wall all of it) and by how pale the surface is (`pale`: 1 less `pale` times the square of its green, so white steel,
 * green 0.92 to 0.95, keeps about half of it, the Range's brick, 0.25, 0.96, and the floor, 0.36, 0.92). Noon-clear, the legs' spread and mean luminance, and the roof members' mean, at concourse-funnel-up and
 * concourse-roof-detail: the concourse's own emissive is a flat glow on the steel (0x91979d on the funnel, 0xa9aeb4 on the members) that no weight here reaches, so with it on, the spread is 10
 * (mean 217, members 219) against 4 (228, 230) before; with it off (the concourse worker is removing it), 32 (mean 182, members 154) against 10 (212, 207). The photographs (conc-ab, conc-b) read the
 * legs at a mean of 176 to 188 and the roof's underside at about 152. The Range's brick moves from (110, 91, 64) to (108, 90, 63) with the emissive on and (109, 92, 65) off, the floor from L 32.9 to 32.8.
 */
export const INTERIOR = { level: 1.5, cloud: 0.5, tint: [1, 0.94, 0.84], down: 0.5, pale: 0.6 } as const;

/**
 * The fill's irradiance, per colour (linear), for a hemisphere of this intensity under this much cloud (0 clear, 1 overcast); written into `out`. It is the amount for a surface wholly
 * under the dome, divided by the shade's blue loss: the shader has that loss times how far under the roof the surface is (`1 - roofK.b`), and the product is the amount, scaled.
 */
export function interiorFillFor(hemisphereIntensity: number, cloud: number, out = new THREE.Vector3()): THREE.Vector3 {
  const k = (INTERIOR.level * hemisphereIntensity * (1 - INTERIOR.cloud * cloud)) / ROOF_SHADE.ambient[2];
  return out.set(INTERIOR.tint[0] * k, INTERIOR.tint[1] * k, INTERIOR.tint[2] * k);
}

/** What every roof-shaded program shares: the shade's loss (see `ROOF_SHADE`; zero while a scene other than London's is drawn) and the concourse's fill (`interiorFillFor`, set by `grade` every frame, for London's scene only). */
export const roofShadeUniforms = {
  uRoofShade: { value: new THREE.Vector4(...ROOF_SHADE_LOSS) },
  uInteriorFill: { value: new THREE.Vector3(0, 0, 0) },
};

/**
 * A define a roof-shaded Lambert material can carry (`material.defines = { [GLOW_BELOW]: '' }`) to be seen against the light from underneath: the roof's own emissive glow
 * (what it holds for sky-lit day, which follows the hour like every glowing stand-in) is multiplied by `1 + GLOW_BELOW_GAIN * (how far the face seen looks down)`. Glass is lit
 * by the sun from above and dark from below, where a real glazed roof is the brightest thing in the shed, the sky itself (hist-d, hist-d2: the crown is the brightest band of the
 * vault); one face, and the two views, so the pane cannot hold both in its colour. The face seen is the one that looks at the camera, whichever way the geometry winds, so
 * this is the view from underneath and not the back of a quad.
 */
export const GLOW_BELOW = 'GLOW_BELOW';
export const GLOW_BELOW_GAIN = 30;

/**
 * A define a wall material with a map can carry (`material.defines = { [FOOT_SHADE]: '0.08' }`) for the contact shade at the foot of a wall: the light the surface reflects, the sun's and the
 * sky's, is multiplied by `1 - d exp( -0.3 h ) - 0.4 exp( -2.5 h )`, d the define's value (0.08 for the landmarks; round six gave the King's Cross front 0.32) and h the height up the wall in tiles of its texture (0.6 m for the brick and the stone, whose walls here have their
 * UVs in metres from the foot; never below the foot). Round five (the E2 scorer: "No contact or ambient occlusion: building bases ... meet the ground with no darkening (GNH, MGF,
 * front-oblique)"): the landmarks' walls and the King's Cross front stood on the ground with none. The two terms are a thin dark line where the wall meets the ground and a long, slight
 * fall-off above it: 0.52 at the foot, 0.82 at 0.3 m, 0.91 at 0.6 m, 0.95 at 1.2 m, 0.98 at 2.4 m. The long term is slight on purpose: the stone of the hotel's ground floor is held to a
 * colour measured in a photograph (round five's E3 fit), and a deeper, longer fall-off (0.25 over 3.8 m and 0.2 over half a metre, a mean of 0.855 over the ground floor) took 4 L off it, where
 * this takes 1.2 (the noon view of the hotel, the pixels of the stone in the ground floor). A part whose UVs start at zero in the air (a window sill, a keystone, a course) is darkened at its own foot, which reads as the shade under a projection that it is.
 */
export const FOOT_SHADE = 'FOOT_SHADE';

/**
 * A define a wall material with a map can carry (`material.defines = { [FLOOD]: 'vec4( 0.25, 14.0, 0.35, 0.0 )' }`) for the floodlight on a floodlit wall after dark: the wall's own colour, in a warm
 * light (1, 0.82, 0.5), is added to what it glows with, as `x * ( z + ( 1 - z ) exp( -h / y ) )` of that colour, `x` the define's first number (the strength), `y` its second (how far up the wall the
 * light carries, metres), `z` its third (what is left far above the lamps) and `h` the fragment's height in the world above the fourth (`w`, the foot of the lit wall: 0 where the ground is the datum,
 * the rail head, as it is within a metre at the lit walls of King's Cross, 0.4 m under it at the hotel and the Barlow shed and up to 2.7 m over it at the Midland's uphill end; the Balmoral's is
 * where its tower stands on the Scottish scene's ground). It is not the wall's own v, which starts again at zero on every trim and course. All of it times the night's level (`windowNight`, 0 by
 * day: the wall is the sun's alone). A wall is lit from its foot, from the lamps in the ground (night-a-kx-square-2015-skinner.jpg: the front's brick
 * is a gold (123, 109, 77) halfway up and (187, 178, 102) at the foot, and the tower's brick falls from (122, 102, 53) at its foot to (84, 67, 32) at its top; night-c-st-pancras-hotel-2011-johndoes.jpg:
 * the Midland's arcade and porch are warm-lit from below and the upper brick is only lightly graded, and night-c-st-pancras-hotel-clock-2013-bourez.jpg: "how little floodlight the upper masonry gets").
 */
export const FLOOD = 'FLOOD';

/**
 * A define a paving material with a map can carry (`material.defines = { [MOTTLE]: '' }`) for the tone of one slab against the next: the surface's colour is multiplied by 0.8 to 1.2
 * by a hash of the slab, a slab being half a tile of the paving's texture on a side (1.2 m on the forecourt: the texture's 2 x 2 slabs, whose joints the hash's cells follow). The same number
 * every time for one slab. The texture itself cannot do this: it is one tile of four slabs repeated every 2.4 m, and its mip levels average the four to one grey a little way off. The number is
 * faded to 1 as the slab shrinks on the screen, from a slab eight pixels across (full) to two (none): a hash read once a pixel is noise, and it shimmers when the camera moves. It is applied to
 * the colour, straight after the texture and the vertex colour and before the weather's wet and snow (atmosphere.ts), so lying snow covers the slabs' tones as it covers their joints.
 */
export const MOTTLE = 'MOTTLE';

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
    // the night's level is read only by a floodlit wall: every other program is as it was
    const flooded = material.defines?.[FLOOD] !== undefined;
    if (flooded) shader.uniforms.uWinNight = windowNight;
    let fragment = shader.fragmentShader;
    if (!fragment.includes('float coverGroundAt')) fragment = fragment.replace('#include <common>', `#include <common>\n${COVER_GLSL}`);
    if (flooded && !fragment.includes('uniform float uWinNight;')) fragment = fragment.replace('#include <common>', '#include <common>\nuniform float uWinNight;');
    fragment = fragment.replace('#include <lights_lambert_pars_fragment>', `#include <lights_lambert_pars_fragment>\nuniform vec4 uRoofShade;\nuniform vec3 uInteriorFill;\n${ROOF_SHADE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef ${MOTTLE}
  vec2 slab = vMapUv * 2.0;
  diffuseColor.rgb *= mix( 0.8 + 0.4 * fract( sin( dot( floor( slab ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ), 1.0, smoothstep( 0.125, 0.5, length( fwidth( slab ) ) ) );
#endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  vec4 roofK = roofShade( cameraPosition - vViewPosition * mat3( viewMatrix ), uRoofShade );
  float looksDown = max( -dot( normal, viewMatrix[ 1 ].xyz ), 0.0 );
  reflectedLight.indirectDiffuse *= roofK.rgb;
  reflectedLight.directDiffuse *= roofK.a;
#ifdef ${FOOT_SHADE}
  float h = max( vMapUv.y, 0.0 );
  float foot = 1.0 - ${FOOT_SHADE} * exp( -0.3 * h ) - 0.40 * exp( -2.5 * h );
  reflectedLight.directDiffuse *= foot;
  reflectedLight.indirectDiffuse *= foot;
#endif
  if ( roofK.b < 1.0 ) reflectedLight.indirectDiffuse += uInteriorFill * ( ( 1.0 - roofK.b ) * coverRoomAt( cameraPosition - vViewPosition * mat3( viewMatrix ) + 0.6 * inverseTransformDirection( normal, viewMatrix ) ) * ( 1.0 - ${INTERIOR.down.toFixed(2)} * looksDown ) * ( 1.0 - ${INTERIOR.pale.toFixed(2)} * material.diffuseColor.g * material.diffuseColor.g ) ) * material.diffuseColor * RECIPROCAL_PI;
#ifdef ${GLOW_BELOW}
  totalEmissiveRadiance *= 1.0 + ${GLOW_BELOW_GAIN.toFixed(1)} * looksDown;
#endif
#ifdef ${FLOOD}
  totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.82, 0.5 ) * uWinNight * ${FLOOD}.x * mix( ${FLOOD}.z, 1.0, exp( -max( ( cameraPosition - vViewPosition * mat3( viewMatrix ) ).y - ${FLOOD}.w, 0.0 ) / ${FLOOD}.y ) );
#endif
}`);
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => `${priorKey}+roofShade`;
  material.needsUpdate = true;
}
