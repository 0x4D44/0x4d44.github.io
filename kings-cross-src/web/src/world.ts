// Sky, ground, light and the optional measuring grid. No assets: the sky is a gradient on a dome. The ground is
// a flat plane until the terrain (Environment Agency DTM, core/terrain.ts) arrives; `addTerrain` then draws the
// real ground over the model's extent and `World.carve` leaves the flat plane only outside it.
import * as THREE from 'three';
import { buildTerrainMesh, distanceField, overMesh, splitBySlope, toleranceNearRails } from '../../core/terrain.ts';
import type { Extent, Terrain, TerrainMesh } from '../../core/terrain.ts';
import { material, terrainMaterial } from './materials.ts';

export const HORIZON = 0x35465e;
const ZENITH = 0x0b1322;
/**
 * The ground plane, metres. The rail head top is y = 0 (the trains' wheels touch there), so the
 * ground sits 0.2 m below it: that leaves room for a track bed (ballast, sleepers, a rail foot)
 * that is visibly proud of the ground instead of buried under it. Anything built on the ground
 * (platform walls, building walls) should start here, not at 0, or it floats 0.2 m clear.
 * With the terrain loaded this is the height of the ground under every rail and platform, and of
 * everything outside the terrain's extent (tools/build-terrain.ts holds the same number).
 */
export const GROUND_Y = -0.2;
const GROUND_COLOUR = 0x3a4049;
const FLAT_SIZE = 9000;

export interface World {
  /** keep the dome centred on the camera so it never reaches an edge */
  follow(camera: THREE.Camera): void;
  /** the terrain covers `extent`: draw the flat plane only outside it (four strips) */
  carve(extent: Extent): void;
}

function skyDome(): THREE.Mesh {
  const g = new THREE.SphereGeometry(5200, 32, 18);
  const pos = g.getAttribute('position');
  const colors: number[] = [];
  const top = new THREE.Color(ZENITH);
  const horizon = new THREE.Color(HORIZON);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 5200));
    c.copy(horizon).lerp(top, Math.pow(t, 0.55));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1;
  return m;
}

/**
 * 10 m grids for the evidence screenshots (?grid=1): one on the ground over the station, and one
 * standing upright in the middle of the shed (x = 45) for side views, 10 m squares both.
 */
function measuringGrid(): THREE.Group {
  const group = new THREE.Group();
  const floor = new THREE.GridHelper(600, 60, 0x66a3ff, 0x3f6fb5);
  floor.position.set(40, 0.12, -180);
  const wall = new THREE.GridHelper(300, 30, 0xff9f43, 0xb8742f);
  wall.rotation.z = Math.PI / 2; // lie in the y-z plane
  wall.position.set(45, 0, -135);
  for (const g of [floor, wall]) {
    const mat = g.material as THREE.LineBasicMaterial;
    mat.transparent = true;
    mat.opacity = 0.55;
    group.add(g);
  }
  return group;
}

/** The flat ground outside a rectangle: four strips (north, south, west, east) as one mesh, counter-clockwise from above. */
export function flatRing(hole: Extent, half = FLAT_SIZE / 2, y = GROUND_Y): THREE.BufferGeometry {
  const rects: [number, number, number, number][] = [
    [-half, -half, half, hole.z0],
    [-half, hole.z1, half, half],
    [-half, hole.z0, hole.x0, hole.z1],
    [hole.x1, hole.z0, half, hole.z1],
  ];
  const pos: number[] = [];
  for (const [x0, z0, x1, z1] of rects) pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [0, 1, 0]).flat(), 3));
  return g;
}

export function addWorld(scene: THREE.Scene, opts: { grid: boolean; bare?: boolean }): World {
  scene.background = new THREE.Color(HORIZON);
  // Bare (measuring) views look from far away; fog would wash the model out.
  scene.fog = opts.bare ? null : new THREE.Fog(HORIZON, 1100, 3600);

  const sky = skyDome();
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xc4d6ff, 0x3a3f48, 1.25));
  const sun = new THREE.DirectionalLight(0xffe8c2, 1.7);
  sun.position.set(-320, 520, 260);
  scene.add(sun);

  const flat = new THREE.MeshLambertMaterial({ color: GROUND_COLOUR });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FLAT_SIZE, FLAT_SIZE).rotateX(-Math.PI / 2), flat);
  ground.position.y = GROUND_Y;
  scene.add(ground);

  if (opts.grid) scene.add(measuringGrid());

  return {
    follow(camera) {
      sky.position.copy(camera.position);
    },
    carve(extent) {
      scene.remove(ground);
      ground.geometry.dispose();
      const ring = new THREE.Mesh(flatRing(extent), flat);
      ring.name = 'ground-outside-terrain';
      scene.add(ring);
    },
  };
}

// ---- the terrain ---------------------------------------------------------------------------------

/** How far the drawn surface may stray from the DTM, by block size, when nothing says where the railway is: 3 cm up to 16 m blocks, a little more beyond. */
export const terrainTolerance = (size: number): number => (size <= 16 ? 0.03 : 0.03 + (size - 16) * 0.004);

export interface TerrainDraw {
  group: THREE.Group;
  /** the adaptive mesh, as built (positions and indices in world coordinates) */
  mesh: TerrainMesh;
  /** the terrain with its ground read off the drawn mesh: seat everything that stands on the ground on this one */
  ground: Terrain;
  stats: { meshes: number; vertices: number; triangles: number; leaves: number; ground: number; bank: number; wall: number };
  dispose(): void;
}

export interface TerrainOptions {
  /** leave out triangles whose centre is here (a portal's cliff strip, see portals.ts `portalHole`) */
  exclude?: (x: number, z: number) => boolean;
  /**
   * The open rails (core/scene.ts `railSegments`: flat x, y, z, x, y, z per segment): the mesh then hugs the ground
   * within a few centimetres near them and relaxes with distance (core/terrain.ts `toleranceNearRails`).
   * Without rails, or `railDistance`, it is `terrainTolerance` everywhere.
   */
  rails?: { main: readonly number[]; siding: readonly number[] };
  /** distance to the nearest open rail, if you have it already (wins over `rails`) */
  railDistance?: (x: number, z: number) => number;
  /** the tolerance by block size, for the plain case (no `railDistance`) */
  tolerance?: (size: number) => number;
}

/**
 * Faces steeper than the wall limit as a non-indexed geometry with UVs in metres (the brick contract of
 * materials.ts): along x or z, whichever the face leans toward least, and up the face for v.
 */
function wallGeometry(position: THREE.BufferAttribute, normal: THREE.BufferAttribute, indices: Uint32Array): THREE.BufferGeometry {
  const n = indices.length;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 3) {
    const a = indices[i] as number;
    const b = indices[i + 1] as number;
    const c = indices[i + 2] as number;
    const ex = position.getX(b) - position.getX(a);
    const ey = position.getY(b) - position.getY(a);
    const ez = position.getZ(b) - position.getZ(a);
    const fx = position.getX(c) - position.getX(a);
    const fy = position.getY(c) - position.getY(a);
    const fz = position.getZ(c) - position.getZ(a);
    const alongZ = Math.abs(ey * fz - ez * fy) > Math.abs(ex * fy - ey * fx); // |face normal x| > |face normal z|: the face runs along z
    for (let k = 0; k < 3; k++) {
      const v = indices[i + k] as number;
      const o = (i + k) * 3;
      pos[o] = position.getX(v);
      pos[o + 1] = position.getY(v);
      pos[o + 2] = position.getZ(v);
      nor[o] = normal.getX(v);
      nor[o + 1] = normal.getY(v);
      nor[o + 2] = normal.getZ(v);
      uv[(i + k) * 2] = alongZ ? position.getZ(v) : position.getX(v);
      uv[(i + k) * 2 + 1] = position.getY(v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Draw the terrain: the adaptive mesh over the whole extent in three draws, by slope (level ground, grassed bank,
 * brick retaining wall). Normals are smooth over the whole mesh, so the seams between the three are not visible.
 */
export function addTerrain(scene: THREE.Scene, terrain: Terrain, opts: TerrainOptions = {}): TerrainDraw {
  let distance = opts.railDistance;
  if (!distance && opts.rails) {
    const segments: [number, number, number, number][] = [];
    for (const flat of [opts.rails.main, opts.rails.siding]) {
      for (let i = 0; i + 5 < flat.length; i += 6) segments.push([flat[i] as number, flat[i + 2] as number, flat[i + 3] as number, flat[i + 5] as number]);
    }
    distance = distanceField(segments, terrain.extent);
  }
  const mesh = buildTerrainMesh(terrain, {
    exclude: opts.exclude,
    tolerance: opts.tolerance ?? terrainTolerance,
    toleranceAt: distance ? toleranceNearRails(distance) : undefined,
  });
  const all = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(mesh.positions, 3);
  all.setAttribute('position', position);
  all.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  all.computeVertexNormals();
  const normal = all.getAttribute('normal') as THREE.BufferAttribute;
  const split = splitBySlope(mesh);
  const group = new THREE.Group();
  group.name = 'terrain';
  const geometries: THREE.BufferGeometry[] = [all];
  const add = (name: string, indices: Uint32Array, mat: THREE.Material, wall: boolean): void => {
    if (indices.length === 0) return;
    let g: THREE.BufferGeometry;
    if (wall) g = wallGeometry(position, normal, indices);
    else {
      g = new THREE.BufferGeometry();
      g.setAttribute('position', position);
      g.setAttribute('normal', normal);
      g.setIndex(new THREE.BufferAttribute(indices, 1));
    }
    geometries.push(g);
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    group.add(m);
  };
  add('terrain-ground', split.ground, terrainMaterial('ground'), false);
  add('terrain-bank', split.bank, terrainMaterial('bank'), false);
  add('terrain-wall', split.wall, material('brick'), true);
  scene.add(group);
  return {
    group,
    mesh,
    ground: overMesh(terrain, mesh),
    stats: { meshes: group.children.length, vertices: mesh.vertices, triangles: mesh.triangles, leaves: mesh.leaves, ground: split.ground.length / 3, bank: split.bank.length / 3, wall: split.wall.length / 3 },
    dispose() {
      scene.remove(group);
      for (const g of geometries) g.dispose();
    },
  };
}
