// The neighbourhood around the station: every OSM building with a facade, roof and parapet, the streets
// with kerbs and pavements, the canal, squares, parks and trees. All procedural: geometry is built in code
// from core/city.ts (pure, tested), the textures are drawn into a canvas at runtime (materials.ts, the city
// block at its end). No image assets, nothing to license, and the data is OpenStreetMap (ODbL, credited on
// the page).
//
// Draw calls: one per material that has geometry, at most 13 for the surfaces (six facades, roofs, asphalt,
// pavement, paint, plaza, grass, water) and one for the trees.
//
// Wiring (main.ts), replacing `mergedPrisms(buildingPrisms(data, hidden), ...)` and its `scene.add`:
//   import cityData from './data/kx-city.json';
//   const city = params.has('bare') ? null : addCity(scene, data, cityData as unknown as CityData, { hidden });
//   ... and `parts: { shed, buildings: city?.group ?? null }` in the __kx handle.
import * as THREE from 'three';
import { buildCity, CITY_KEYS } from '../../core/city.ts';
import { railSegments } from '../../core/scene.ts';
import type { CityBuildOptions, CityData, CityKey, CityMeshes, MeshAcc, TreeSpot } from '../../core/city.ts';
import type { KxData } from '../../core/osm.ts';
import { cityMaterial } from './materials.ts';
import { GROUND_Y } from './world.ts';

export interface CityOptions {
  /** OSM building ids drawn some other way (the station, the landmarks, whatever is under the shed) */
  hidden?: ReadonlySet<number>;
  /** extra polygons in which no street, square or tree is drawn; the outlines of the hidden buildings are always used */
  exclude?: readonly (readonly [number, number][])[];
  /** draw the trees (default true) */
  trees?: boolean;
}

export interface CityStats {
  /** meshes added: one draw call each (a tree mesh counts once, however many trees) */
  drawCalls: number;
  triangles: number;
  trees: number;
  byKey: Partial<Record<CityKey, { vertices: number; triangles: number }>>;
  buildings: CityMeshes['stats'];
}

export interface City {
  group: THREE.Group;
  stats: CityStats;
  dispose(): void;
}

/** A BufferGeometry from an accumulator. Normals, UVs and vertex colours are as the core wrote them. */
export function geometryOf(acc: MeshAcc): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(acc.colors, 3));
  g.setIndex(acc.indices);
  return g;
}

/**
 * One tree, 1 m tall: a thin trunk and a faceted crown, trunk brown and crown a muted green in the vertex
 * colours (instances scale it to 6-12 m and tint it a little). About 30 triangles, so a thousand trees are
 * a cheap single draw call.
 */
export function treeGeometry(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.018, 0.028, 0.5, 5, 1, true).toNonIndexed();
  trunk.translate(0, 0.25, 0);
  const crown = new THREE.IcosahedronGeometry(0.3, 0); // already non-indexed
  crown.scale(1, 1.15, 1);
  crown.translate(0, 0.72, 0);
  const paint = (g: THREE.BufferGeometry, base: THREE.Color, spread: number): void => {
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let tri = 0; tri < n; tri += 3) {
      // each facet a slightly different shade, deterministic from its index
      const k = 1 - spread / 2 + spread * (((tri * 2654435761) >>> 0) / 4294967296);
      for (let v = 0; v < 3; v++) colors.set([base.r * k, base.g * k, base.b * k], (tri + v) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };
  paint(trunk, new THREE.Color().setHex(0x4a3b2c), 0.2);
  paint(crown, new THREE.Color().setHex(0x4f7a3a), 0.45);
  const geometry = new THREE.BufferGeometry();
  const parts = [trunk, crown];
  const attrs = ['position', 'normal', 'uv', 'color'] as const;
  for (const name of attrs) {
    const size = (parts[0] as THREE.BufferGeometry).getAttribute(name).itemSize;
    const merged = new Float32Array(parts.reduce((s, p) => s + p.getAttribute(name).count, 0) * size);
    let o = 0;
    for (const p of parts) {
      merged.set(p.getAttribute(name).array as ArrayLike<number>, o);
      o += p.getAttribute(name).count * size;
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(merged, size));
  }
  for (const p of parts) p.dispose();
  return geometry;
}

/** The trees as one InstancedMesh: position, yaw and height from the core's spots, a small per-tree tint. */
export function treeMesh(spots: readonly TreeSpot[], groundY = GROUND_Y): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(treeGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), spots.length);
  mesh.name = 'city-trees';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  spots.forEach((t, i) => {
    q.setFromAxisAngle(up, t.yaw);
    m.compose(new THREE.Vector3(t.x, groundY, t.z), q, new THREE.Vector3(t.height, t.height, t.height));
    mesh.setMatrixAt(i, m);
    c.setRGB(0.88 + 0.2 * t.tone, 0.92 + 0.14 * t.tone, 0.82 + 0.12 * (1 - t.tone));
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** The city: buildings, streets, water, open ground and trees, added to `scene` as one group. */
export function addCity(scene: THREE.Scene, data: KxData, city: CityData, opts: CityOptions = {}): City {
  const hidden = opts.hidden ?? new Set<number>();
  const exclude = [...(opts.exclude ?? []), ...data.buildings.filter((b) => hidden.has(b.id)).map((b) => b.pts)];
  const rails = railSegments(data); // surface track only: a street that crosses it rides over it
  const build: CityBuildOptions = { hidden, exclude, groundY: GROUND_Y, trees: opts.trees !== false, rails: [...rails.main, ...rails.siding] };
  const built = buildCity(data.buildings, city, build);
  const group = new THREE.Group();
  group.name = 'city';
  const stats: CityStats = { drawCalls: 0, triangles: 0, trees: 0, byKey: {}, buildings: built.stats };
  const geometries: THREE.BufferGeometry[] = [];
  for (const key of CITY_KEYS) {
    const acc = built.meshes[key];
    if (acc.triangleCount === 0) continue;
    const geometry = geometryOf(acc);
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, cityMaterial(key));
    mesh.name = `city-${key}`;
    group.add(mesh);
    stats.drawCalls++;
    stats.triangles += acc.triangleCount;
    stats.byKey[key] = { vertices: acc.vertexCount, triangles: acc.triangleCount };
  }
  if (built.trees.length > 0) {
    const trees = treeMesh(built.trees);
    geometries.push(trees.geometry);
    group.add(trees);
    stats.drawCalls++;
    stats.trees = built.trees.length;
    stats.triangles += built.trees.length * (trees.geometry.getAttribute('position').count / 3);
  }
  scene.add(group);
  return {
    group,
    stats,
    dispose() {
      scene.remove(group);
      for (const g of geometries) g.dispose();
    },
  };
}
