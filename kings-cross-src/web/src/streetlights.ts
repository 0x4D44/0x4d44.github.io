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

export function createStreetLights(spots: readonly LampSpot[]): StreetLights {
  const n = spots.length;
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
    for (const point of spot.mast ? stripPoints(spot) : [headOf(spot)]) {
      heads.push(...point);
      colours.push(tint.r, tint.g, tint.b);
    }
  }
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute('position', new THREE.Float32BufferAttribute(heads, 3));
  haloGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const haloMaterial = new THREE.PointsMaterial({ size: 2.6, sizeAttenuation: true, map: haloTexture(), vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const halos = new THREE.Points(haloGeometry, haloMaterial);
  halos.name = 'street-lamp-halos';
  halos.visible = false;
  halos.frustumCulled = false;
  halos.renderOrder = 5;
  group.add(halos);

  // the pool under each head: a flat quad with the halo's gradient, scaled to the lamp's reach, an instance colour for its light
  const poolGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const poolMaterial = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const pools = new THREE.InstancedMesh(poolGeometry, poolMaterial, n);
  pools.name = 'street-lamp-pools';
  spots.forEach((spot, i) => {
    const [x, , z] = headOf(spot);
    const r = poolRadius(spot.height) * 2;
    const [gx, gz] = spot.slope;
    // the quad lies in the ground's own plane (a shear: height follows x by gx and z by gz), so on a slope it neither sinks into the ground on the uphill side nor hangs over it downhill
    matrix.set(r, 0, 0, x, gx * r, 1, gz * r, spot.y + gx * (x - spot.x) + gz * (z - spot.z) + POOL_LIFT, 0, 0, r, z, 0, 0, 0, 1);
    pools.setMatrixAt(i, matrix);
    const light = LAMP_LIGHT[spot.kind];
    pools.setColorAt(i, tint.setHex(light.pool).multiplyScalar(light.strength));
  });
  pools.instanceMatrix.needsUpdate = true;
  if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
  pools.visible = false;
  pools.frustumCulled = false;
  pools.renderOrder = 4;
  group.add(pools);

  return {
    group,
    setLevel(level) {
      const l = Math.min(1, Math.max(0, level));
      haloMaterial.opacity = l * 0.9;
      poolMaterial.opacity = l;
      halos.visible = pools.visible = l > 0.01;
    },
    counts: () => ({ lamps: n, triangles: meshes.reduce((sum, m) => sum + (m.geometry.index as THREE.BufferAttribute).count / 3 * m.count, 0) + 2 * n, draws: meshes.length + 2 }),
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of meshes) m.dispose();
      haloGeometry.dispose();
      poolGeometry.dispose();
      material.dispose();
      haloMaterial.dispose();
      poolMaterial.dispose();
      pools.dispose();
    },
  };
}
