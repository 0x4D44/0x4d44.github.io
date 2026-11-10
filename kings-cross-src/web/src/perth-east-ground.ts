// P3's east patch (lead ruling 2026-11-10 13:13): the Tay's corridor below Kinnoull east of the main terrain (x 2624 to 4128,
// z 80 to 1232, past the main terrain's south edge at 912), which pt-kinnoull-cliff looks over, from tools/build-perth-east-terrain.ts (Phase I NO12, 32 m lattice, a ground class
// per node). Phase I has no data north of z 80 there, so the patch ends at z 80; nothing north of it is drawn.
// - Seam: the west column (x 2624), where the main terrain has ground (z up to its 912), is read off the main drawn terrain at every 16 m, its own vertices, so the two meshes share that
//   edge exactly (the patch's other rows are the 32 m data, bilinear at the 16 m rows).
// - Edges: the north, east and south edges are skirted outward EAST_SKIRT.out m and down EAST_SKIRT.down m, a slope falling away
//   from the patch rather than a wall, so from the cliff camera the edge is a skyline and the haze takes the far side.
// - Colour: per vertex from the node classes (water where the DTM itself has no ground, else OSM land use, else field): ASSUMED tones
//   matched to the main ground paint (waverley-city-ground.ts GROUND_COLOURS) and Perth's water.
import * as THREE from 'three';
import {createTerrain} from '../../core/terrain.ts';
import type {Terrain, TerrainFile} from '../../core/terrain.ts';
import file from './data/perth-terrain-east.json' with {type: 'json'};

export const PERTH_EAST_FILE = file as unknown as TerrainFile & {classNames: string[]; classes: string};
export const PERTH_EAST = createTerrain(PERTH_EAST_FILE);
export const EAST_SKIRT = {out: 400, down: 90} as const;
/** ASSUMED tones per class (sRGB): field and grass as the main paint's park and grass, the houses' gardens darker, wood, scrub, rock,
 *  and the Tay as the water sheet. */
export const EAST_TONES: Record<string, number> = {field: 0x6b6f3a, water: 0x6f8794, wood: 0x2d4120, scrub: 0x45502c, grass: 0x566b2e, houses: 0x4a5a30, rock: 0x6f6c66};

/** The class at a point: the nearest node's. */
export function eastClassAt(x: number, z: number): string {
  const g = PERTH_EAST_FILE.grids[0]!, i = Math.max(0, Math.min(g.nx - 1, Math.round((x - g.x0) / g.step))), j = Math.max(0, Math.min(g.nz - 1, Math.round((z - g.z0) / g.step)));
  return PERTH_EAST_FILE.classNames[Number(PERTH_EAST_FILE.classes[j * g.nx + i])]!;
}

/** The patch mesh over `main` (the drawn main terrain, whose east edge it meets). */
export function buildPerthEastGround(main: Pick<Terrain, 'heightAt' | 'extent'>): {group: THREE.Group; stats: {triangles: number; drawCalls: number}; heightAt(x: number, z: number): number} {
  const E = PERTH_EAST_FILE.extent, step = PERTH_EAST_FILE.grids[0]!.step, row = step / 2;
  const xs: number[] = []; for (let x = E.x0; x <= E.x1 + 1e-6; x += step) xs.push(x);
  const zs: number[] = []; for (let z = E.z0; z <= E.z1 + 1e-6; z += row) zs.push(z);
  const heightAt = (x: number, z: number) => x <= E.x0 + 1e-6 && z <= main.extent.z1 + 1e-6 ? main.heightAt(E.x0, z) : PERTH_EAST.heightAt(x, z);
  // the lattice, then a skirt ring round the three outer edges (index -1 and n are the skirt)
  const nx = xs.length, nz = zs.length, pos: number[] = [], col: number[] = [], index: number[] = [], c = new THREE.Color();
  const vertex = (x: number, z: number, y: number, tone: number) => { c.setHex(tone, THREE.SRGBColorSpace); pos.push(x, y, z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const id: number[][] = [];
  for (let j = -1; j <= nz; j++) {
    const r: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const ci = Math.min(i, nx - 1), cj = Math.max(0, Math.min(j, nz - 1)), x = xs[ci]!, z = zs[cj]!, y = heightAt(x, z), tone = EAST_TONES[eastClassAt(x, z)]!;
      const sx = i === nx ? EAST_SKIRT.out : 0, sz = j === -1 ? -EAST_SKIRT.out : j === nz ? EAST_SKIRT.out : 0;
      if (ci === 0 && (j === -1 || j === nz)) { r.push(vertex(x, z + sz, y - EAST_SKIRT.down, tone)); continue; }
      r.push(vertex(x + sx, z + sz, sx || sz ? y - EAST_SKIRT.down : y, tone));
    }
    id.push(r);
  }
  for (let j = 0; j + 1 < id.length; j++) for (let i = 0; i + 1 < id[j]!.length; i++) {
    const a = id[j]![i]!, b = id[j]![i + 1]!, d = id[j + 1]![i]!, e = id[j + 1]![i + 1]!;
    index.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index); g.computeVertexNormals(); g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({vertexColors: true}));
  mesh.name = 'perth-east-ground';
  const group = new THREE.Group(); group.name = 'perth-east'; group.add(mesh);
  return {group, stats: {triangles: index.length / 3, drawCalls: 1}, heightAt};
}
