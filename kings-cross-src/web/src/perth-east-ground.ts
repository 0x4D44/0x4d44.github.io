// P3's east patch (lead ruling 2026-11-10 13:13): the Tay's corridor below Kinnoull east of the main terrain (x 2624 to 4128,
// z 80 to 1232, past the main terrain's south edge at 912), which pt-kinnoull-cliff looks over, from tools/build-perth-east-terrain.ts (Phase I NO12, 32 m lattice, a ground class
// per node). Phase I has no data north of z 80 there, so the patch ends at z 80; nothing north of it is drawn.
// - Seam: the west column (x 2624), where the main terrain has ground (z up to its 912), is read off the main drawn terrain at every 16 m, its own vertices, so the two meshes share that
//   edge exactly (the patch's other rows are the 32 m data, bilinear at the 16 m rows).
// - Edges (round 3): the north, east and south edges are skirted outward EAST_SKIRT.out m down to just under the world's flat plane
//   (world.ts GROUND_Y), their colour fading to a hazed field tone (EAST_SKIRT, round 4). So the patch runs out in a long, gentle apron that meets
//   the plane far off in the haze, not a ruled edge with grey beyond it (round 2's cliff capture).
// - The Tay (round 3, C3): the river nodes (DTM nodata) trace one winding channel with breaks of one to three nodes, and a stray
//   node on the hill. eastWater closes them into one channel (a morphological closing: grown, then shrunk, by EAST_WATER.close m) and
//   drops pieces under EAST_WATER.minNodes nodes; and a flat water sheet (Perth's WATER look) lies over the wet cells at the river's local level (a low quantile
//   of the wet nodes' ground within EAST_WATER.reach m, never under a node's own ground), so it reads as one river, not a chain of
//   ponds. Wet nodes' ground is painted as the bank's shingle (SHORE.shore), so the sheet's edge meets the bank, not green.
// - Bank trees (round 3, C3): crowns along the river's banks (land nodes beside wet ones), as 2166751 and 46028 show tree-lined banks:
//   EAST_TREES.)
// - Colour: per vertex from the node classes (water where the DTM itself has no ground, else OSM land use, else field): ASSUMED tones
//   matched to the main ground paint (waverley-city-ground.ts GROUND_COLOURS) and Perth's water.
import * as THREE from 'three';
import {createTerrain} from '../../core/terrain.ts';
import {GROUND_Y} from './world.ts';
import {gradeWater, SHORE, WATER} from './perth-city-features.ts';
import type {Terrain, TerrainFile} from '../../core/terrain.ts';
import file from './data/perth-terrain-east.json' with {type: 'json'};

export const PERTH_EAST_FILE = file as unknown as TerrainFile & {classNames: string[]; classes: string};
export const PERTH_EAST = createTerrain(PERTH_EAST_FILE);
/** Round 4 (round-3 score, C3): the grey world plane still showed as a flat band at the cliff view's horizon. The apron now runs `out` m
 *  (past which the haze has the ground), still ending just under the plane, and fades to `tone`, a hazed field green-grey (ASSUMED), not
 *  the plane's grey: the land runs on into the haze. No triangles are added (it is the same skirt ring). */
export const EAST_SKIRT = {out: 6000, to: GROUND_Y - .3, tone: 0x7c8770} as const;
/** Round 5 (round-4 score, C2/C6): the grey world plane still showed at the panorama's horizon and the overview's corners, past the main
 *  terrain's west, north and south edges. The same apron runs out from those edges (the east edge meets the east patch and its skirt),
 *  `step` m pieces from the edge's own height, starting in a field tone `from` (ASSUMED) and fading to EAST_SKIRT.tone; its own mesh.
 *  Round 6 (round-5 score: a grey strip on the cliff view's right horizon): the east patch's own skirt falls from its edge (down to 8 m
 *  under the plane on the Tay's floodplain), so the plane showed past it; the apron also runs out from the patch's east and south edges
 *  and its south-east corner, in `eastStep` m pieces (fewer triangles: those edges are only seen far off). */
export const MAIN_APRON = {step: 64, from: 0x6c7a55, eastStep: 192} as const;
/** Round 10 (round-9 score, C6/C2: with the clearer air the land past the terrain showed as a flat olive plain to the horizon, ending
 *  hard against the sky at the camera's far plane, 9 km). The apron and the east patch fade on into the scene's own haze colour
 *  (fogColor) with view depth, from none at `from` m to all of it by `to` m, on top of the scene's fog, so the land softens into the
 *  haze before the far plane cuts it off, as 155's fields do by 6-8 km. Perth's own materials; the shared fog is unchanged. No
 *  hills: none is sourced. */
export const LAND_HAZE = {from: 2500, to: 6000} as const;
/** Round 10 (round-9 score: the Tay ended on the patch's straight edge in the cliff view). The river leaves the patch by its east edge
 *  (x 4128, z 1072-1232; it runs within 300 m of the south edge all the way, so that edge is not faded): within `run` m of the east
 *  edge the river sheet and its shingle fade to EAST_SKIRT.tone, the hazed field the skirt runs out in. */
export const RIVER_END = {run: 450} as const;
/** Round 11 (round-10 score, C6/C2: the land past the terrain, 2.5-5 km from the summit, was one flat olive; 155 shows a patchwork
 *  of fields there in greens and fawns). Outside the drawn terrain, the apron's and the east skirt's colour is multiplied per field:
 *  fields `size` m (along, across) on a grid turned `turn` rad, each row slid by a hash (so the boundaries do not line up), each field
 *  one of `tones` (linear multipliers on the vertex colour: bright and dark grass, pale grass, stubble fawn, ploughed brown, and the
 *  base). Done per fragment in Perth's own material, not in vertex colour: the apron is one strip of quads 64 m by 6 km, so its
 *  vertices cannot carry fields. ASSUMED sizes and tones, by eye against 155. No triangles; the town is inside the terrain and
 *  untouched. */
export const LAND_FIELDS = {size: [210, 150] as const, turn: .35,
  tones: [[1, 1, 1], [.85, 1.12, .75], [.7, .8, .65], [1.1, 1.15, .95], [1.25, 1.15, .92], [1.05, .85, .7], [1.18, 1.06, .84]] as const,
  spread: [.55, 1.6] as const, hedge: 4, hedgeTone: [.42, .52, .36] as const, hedgeMix: .45, hedgeKeep: .6, near: .6, nearTo: [2500, 4500] as const} as const;
/** Round 13 (round-12 score, C2/C6: the hedgerows read as broad, evenly spaced ruled lines, a graph-paper grid from the cliff, and
 *  nearly every near field the same pale green). Each boundary stretch (one field's end, one field's side) carries a hedgerow only by
 *  a hash under `hedgeKeep`, so the lines break; they are narrower (`hedge` 5 -> 4 m) and lighter (`hedgeMix` 0.85 -> 0.45); a
 *  stubble tone joins the palette; and the near fields keep 0.6 of their contrast (was 0.5). ASSUMED, by eye against 155 and 8703. */
/** Round 12 (round-11 score, C2/C6: near the eye the fields were a hard, high-contrast checkerboard of equal rectangles, the fawn read
 *  yellow, and there were no hedgerows, as 155 shows). Each row's fields are `spread` (min, max) times `size[0]` long, by a hash per
 *  row, so the sizes vary; the fawn is toned down (1.45 -> 1.25 red); a dark hedgerow or tree belt `hedge` m wide (never under about
 *  a pixel, so it does not shimmer) runs along every field boundary, `hedgeMix` of the way to `hedgeTone`; and the field tones are
 *  only `near` of their contrast at `nearTo[0]` m from the eye, full by `nearTo[1]`. ASSUMED, by eye against 155. */
const fieldHash = (a: number) => { const s = Math.sin(a) * 43758.5453; return s - Math.floor(s); };
/** The field at (x, z): row j, field i, the row's field length, and the position across the field (u, v in m): the shader's formula. */
function fieldCell(x: number, z: number): {i: number; j: number; len: number; fu: number; fv: number} {
  const F = LAND_FIELDS, c = Math.cos(F.turn), s = Math.sin(F.turn), u = x * c - z * s, v = x * s + z * c;
  const j = Math.floor(v / F.size[1]), len = F.size[0] * (F.spread[0] + (F.spread[1] - F.spread[0]) * fieldHash(j * 3.71 + 1.3));
  const w = u + fieldHash(j * 7.13) * len, i = Math.floor(w / len);
  return {i, j, len, fu: w - i * len, fv: v - j * F.size[1]};
}
/** The field (index into LAND_FIELDS.tones) at (x, z): the shader's own formula. */
export function landField(x: number, z: number): number {
  const F = LAND_FIELDS, {i, j} = fieldCell(x, z);
  return Math.min(F.tones.length - 1, Math.floor(fieldHash(i * 127.1 + j * 311.7) * F.tones.length));
}
/** The field length (m, along its row) at (x, z). */
export const landFieldLength = (x: number, z: number): number => fieldCell(x, z).len;
/** Whether (x, z) lies on a hedgerow (within LAND_FIELDS.hedge / 2 m of a field boundary). */
export function landHedge(x: number, z: number): boolean {
  const F = LAND_FIELDS, {i, j, len, fu, fv} = fieldCell(x, z);
  const ib = fu < len / 2 ? i : i + 1, jb = fv < F.size[1] / 2 ? j : j + 1;
  const eu = fieldHash(ib * 17.3 + j * 5.1) < F.hedgeKeep ? Math.min(fu, len - fu) : 1e4, ev = fieldHash(i * 3.3 + jb * 41.7) < F.hedgeKeep ? Math.min(fv, F.size[1] - fv) : 1e4;
  return Math.min(eu, ev) < F.hedge / 2;
}
/** How much of the field tones' contrast shows at `d` m from the eye: the shader's own formula. */
export function fieldContrast(d: number): number {
  const F = LAND_FIELDS, t = Math.max(0, Math.min(1, (d - F.nearTo[0]) / (F.nearTo[1] - F.nearTo[0])));
  return F.near + (1 - F.near) * t * t * (3 - 2 * t);
}
/** Fade a Lambert material into the fog colour with view depth (LAND_HAZE); with `fields`, lay LAND_FIELDS outside `inside` (x0, z0,
 *  x1, z1; null: everywhere). */
export function hazeLand(m: THREE.MeshLambertMaterial, fields?: {inside: readonly [number, number, number, number] | null}): void {
  const F = LAND_FIELDS, f = (v: number) => v.toFixed(4);
  m.onBeforeCompile = shader => {
    if (fields) {
      const box = fields.inside, skip = box ? `if (vFieldPos.x > ${f(box[0])} && vFieldPos.x < ${f(box[2])} && vFieldPos.y > ${f(box[1])} && vFieldPos.y < ${f(box[3])}) k = vec3(1.0);` : '';
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFieldPos;\nvarying float vFieldDepth;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vFieldPos = (modelMatrix * vec4(transformed, 1.0)).xz;\n  vFieldDepth = -mvPosition.z;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vFieldPos;
varying float vFieldDepth;
float perthFieldHash(float a) { return fract(sin(a) * 43758.5453); }`).replace('#include <color_fragment>', `#include <color_fragment>
  {
    float c = ${f(Math.cos(F.turn))}, s = ${f(Math.sin(F.turn))};
    float u = vFieldPos.x * c - vFieldPos.y * s, v = vFieldPos.x * s + vFieldPos.y * c;
    float j = floor(v / ${f(F.size[1])}), len = ${f(F.size[0])} * (${f(F.spread[0])} + ${f(F.spread[1] - F.spread[0])} * perthFieldHash(j * 3.71 + 1.3));
    float w = u + perthFieldHash(j * 7.13) * len, i = floor(w / len), fu = w - i * len, fv = v - j * ${f(F.size[1])};
    int t = int(min(${F.tones.length - 1}.0, floor(perthFieldHash(i * 127.1 + j * 311.7) * ${F.tones.length}.0)));
    vec3 tones[${F.tones.length}] = vec3[${F.tones.length}](${F.tones.map(t => `vec3(${t.map(f).join(', ')})`).join(', ')});
    vec3 k = mix(vec3(1.0), tones[t], ${f(F.near)} + ${f(1 - F.near)} * smoothstep(${f(F.nearTo[0])}, ${f(F.nearTo[1])}, vFieldDepth));
    float ib = fu < 0.5 * len ? i : i + 1.0, jb = fv < ${f(F.size[1] / 2)} ? j : j + 1.0;
    float eu = perthFieldHash(ib * 17.3 + j * 5.1) < ${f(F.hedgeKeep)} ? min(fu, len - fu) : 1e4, ev = perthFieldHash(i * 3.3 + jb * 41.7) < ${f(F.hedgeKeep)} ? min(fv, ${f(F.size[1])} - fv) : 1e4;
    float edge = min(eu, ev), hw = max(${f(F.hedge / 2)}, 0.5 * fwidth(u + v));
    k = mix(k, vec3(${F.hedgeTone.map(f).join(', ')}), ${f(F.hedgeMix)} * (1.0 - smoothstep(0.5 * hw, 1.5 * hw, edge)));
    ${skip}
    diffuseColor.rgb *= k;
  }`);
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(${LAND_HAZE.from.toFixed(1)}, ${LAND_HAZE.to.toFixed(1)}, vFogDepth));
#endif`);
  };
  m.customProgramCacheKey = () => `perth-land-haze-${LAND_HAZE.from}-${LAND_HAZE.to}${fields ? `-fields-${fields.inside ?? 'all'}` : ''}`;
}
/** How far the river is faded at x: 1 on the patch's east edge, 0 from RIVER_END.run m in (smoothstep). */
export function riverEnd(x: number): number {
  const d = Math.max(0, PERTH_EAST_FILE.extent.x1 - x), t = Math.min(1, d / RIVER_END.run);
  return 1 - t * t * (3 - 2 * t);
}
/** ASSUMED: the river sheet's level is the `quantile` of the wet nodes' ground within `reach` m, lifted `lift`; the closing radius
 *  `close` m bridges the channel's breaks (up to about twice that); pieces under `minNodes` nodes are dropped. */
export const EAST_WATER = {reach: 160, quantile: .25, lift: .35, close: 96, minNodes: 6} as const;
/** ASSUMED bank trees: one crown on a bank node with this share by hash, `size` m tall, crown `crown` of the height, in WOODLAND-like greens. */
export const EAST_TREES = {share: .7, size: [9, 16] as const, crown: .55, tones: [[.13, .22, .10], [.20, .31, .12], [.26, .36, .15]] as const} as const;

const hash = (x: number, z: number, k: number): number => { const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
/** The wet nodes, closed into one channel: a node's own DTM pixel is nodata (class water); then a closing by EAST_WATER.close m (wet
 *  if any wet node is that near, then dry if any dry node is that near), and pieces under EAST_WATER.minNodes dropped. Indexed j * nx + i. */
export function eastWater(): Uint8Array {
  const g = PERTH_EAST_FILE.grids[0]!, wetCls = String(PERTH_EAST_FILE.classNames.indexOf('water')), N = g.nx * g.nz, r = Math.floor(EAST_WATER.close / g.step);
  const raw = new Uint8Array(N); for (let k = 0; k < N; k++) raw[k] = PERTH_EAST_FILE.classes[k] === wetCls ? 1 : 0;
  // grow (any within reach) or shrink (all within reach, inside the lattice)
  const pass = (src: Uint8Array, grow: boolean) => {
    const out = new Uint8Array(N);
    for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) {
      let hit = !grow;
      for (let dj = -r; dj <= r && hit !== grow; dj++) for (let di = -r; di <= r; di++) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= g.nx || b >= g.nz || Math.hypot(di, dj) * g.step > EAST_WATER.close) continue;
        if (grow ? src[b * g.nx + a] : !src[b * g.nx + a]) { hit = grow; break; }
      }
      out[j * g.nx + i] = hit ? 1 : 0;
    }
    return out;
  };
  const wet = pass(pass(raw, true), false); for (let k = 0; k < N; k++) wet[k] = wet[k]! | raw[k]!;
  // drop the small pieces (8-connected)
  const seen = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    if (!wet[k] || seen[k]) continue;
    const piece = [k]; seen[k] = 1;
    for (let q = 0; q < piece.length; q++) {
      const i = piece[q]! % g.nx, j = Math.floor(piece[q]! / g.nx);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj, n = b * g.nx + a; if (a >= 0 && b >= 0 && a < g.nx && b < g.nz && wet[n] && !seen[n]) { seen[n] = 1; piece.push(n); } }
    }
    if (piece.length < EAST_WATER.minNodes) for (const n of piece) wet[n] = 0;
  }
  return wet;
}
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
  const nx = xs.length, nz = zs.length, pos: number[] = [], col: number[] = [], index: number[] = [], c = new THREE.Color(), plane = new THREE.Color();
  plane.setHex(EAST_SKIRT.tone, THREE.SRGBColorSpace);
  const G = PERTH_EAST_FILE.grids[0]!, wet = eastWater(), wetAt = (x: number, z: number) => wet[Math.max(0, Math.min(G.nz - 1, Math.round((z - G.z0) / G.step))) * G.nx + Math.max(0, Math.min(G.nx - 1, Math.round((x - G.x0) / G.step)))] === 1;
  const shore = parseInt(SHORE.shore.slice(1), 16);
  const toneAt = (x: number, z: number) => wetAt(x, z) ? shore : EAST_TONES[eastClassAt(x, z)]!;
  const vertex = (x: number, z: number, y: number, tone: number, fade = 0) => { c.setHex(tone, THREE.SRGBColorSpace).lerp(plane, fade); pos.push(x, y, z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const id: number[][] = [];
  for (let j = -1; j <= nz; j++) {
    const r: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const ci = Math.min(i, nx - 1), cj = Math.max(0, Math.min(j, nz - 1)), x = xs[ci]!, z = zs[cj]!, y = heightAt(x, z), tone = toneAt(x, z);
      const sx = i === nx ? EAST_SKIRT.out : 0, sz = j === -1 ? -EAST_SKIRT.out : j === nz ? EAST_SKIRT.out : 0;
      // the apron's outer edge: just under the world's flat plane, in the plane's colour
      if (ci === 0 && (j === -1 || j === nz)) { r.push(vertex(x, z + sz, Math.min(y, EAST_SKIRT.to), tone, 1)); continue; }
      // round 10: the shingle by the river's end fades with it (RIVER_END)
      r.push(sx || sz ? vertex(x + sx, z + sz, Math.min(y, EAST_SKIRT.to), tone, 1) : vertex(x, z, y, tone, wetAt(x, z) ? riverEnd(x) : 0));
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
  const gm = new THREE.MeshLambertMaterial({vertexColors: true}); hazeLand(gm, {inside: [E.x0, E.z0, E.x1, E.z1]}); // round 11: fields on the skirt only
  const mesh = new THREE.Mesh(g, gm);
  mesh.name = 'perth-east-ground';
  const group = new THREE.Group(); group.name = 'perth-east'; group.add(mesh);
  const stats = {triangles: index.length / 3, drawCalls: 1};
  // the river sheet over the wet cells, at the local river level
  const wetNodes: [number, number, number][] = [];
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) if (wet[j * G.nx + i]) { const x = G.x0 + i * G.step, z = G.z0 + j * G.step; wetNodes.push([x, z, heightAt(x, z)]); }
  const level = (x: number, z: number) => {
    const hs = wetNodes.filter(([wx, wz]) => Math.hypot(wx - x, wz - z) <= EAST_WATER.reach).map(w => w[2]).sort((a, b) => a - b);
    return Math.max((hs[Math.floor(hs.length * EAST_WATER.quantile)] ?? heightAt(x, z)) + EAST_WATER.lift, heightAt(x, z) + .15);
  };
  const wpos: number[] = [], wcol: number[] = [], widx: number[] = [], wid = new Int32Array(G.nx * G.nz).fill(-1), wc = new THREE.Color();
  // round 10: the sheet's colour per vertex, faded to the skirt's hazed field at the patch's open edges (RIVER_END)
  const wv = (i: number, j: number) => { const k = j * G.nx + i; if (wid[k]! < 0) { const x = G.x0 + i * G.step, z = G.z0 + j * G.step; wpos.push(x, level(x, z), z); wc.setHex(WATER.colour, THREE.SRGBColorSpace).lerp(plane, riverEnd(x)); wcol.push(wc.r, wc.g, wc.b); wid[k] = wpos.length / 3 - 1; } return wid[k]!; };
  for (let j = 0; j + 1 < G.nz; j++) for (let i = 0; i + 1 < G.nx; i++) {
    const a = wet[j * G.nx + i], b = wet[j * G.nx + i + 1], d = wet[(j + 1) * G.nx + i], e = wet[(j + 1) * G.nx + i + 1];
    if (a && b && d && e) { widx.push(wv(i, j), wv(i, j + 1), wv(i + 1, j), wv(i + 1, j), wv(i, j + 1), wv(i + 1, j + 1)); continue; }
    if (a && b && d) widx.push(wv(i, j), wv(i, j + 1), wv(i + 1, j));
    if (b && d && e) widx.push(wv(i + 1, j), wv(i, j + 1), wv(i + 1, j + 1));
    if (a && d && e && !b) widx.push(wv(i, j), wv(i, j + 1), wv(i + 1, j + 1));
    if (a && b && e && !d) widx.push(wv(i, j), wv(i + 1, j + 1), wv(i + 1, j));
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3)); wg.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3)); wg.setIndex(widx); wg.computeVertexNormals();
  const wm = new THREE.MeshPhongMaterial({color: 0xffffff, vertexColors: true, specular: WATER.specular, shininess: WATER.shininess}); gradeWater(wm); // round 10: graded as the main sheet
  const water = new THREE.Mesh(wg, wm);
  water.name = 'perth-east-water'; group.add(water); stats.triangles += widx.length / 3; stats.drawCalls++;
  // bank trees: a crown on a share of the land nodes beside wet ones
  const banks: [number, number][] = [];
  for (let j = 0; j < G.nz; j++) for (let i = 0; i < G.nx; i++) {
    if (wet[j * G.nx + i]) continue; let near = false;
    for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1; di++) if (i + di >= 0 && j + dj >= 0 && i + di < G.nx && j + dj < G.nz && wet[(j + dj) * G.nx + i + di]) { near = true; break; }
    const x = G.x0 + i * G.step, z = G.z0 + j * G.step; if (near && hash(x, z, 81) < EAST_TREES.share) banks.push([x, z]);
  }
  const crown = new THREE.IcosahedronGeometry(1, 0), trees = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial(), Math.max(1, banks.length * 2));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tc = new THREE.Color(); let n = 0;
  for (const [bx, bz] of banks) for (const k of [0, 1]) {
    const x = bx + (hash(bx, bz, 82 + k) - .5) * G.step * .8, z = bz + (hash(bx, bz, 84 + k) - .5) * G.step * .8, h = EAST_TREES.size[0] + (EAST_TREES.size[1] - EAST_TREES.size[0]) * hash(x, z, 86), r = h * EAST_TREES.crown / 2;
    m.compose(new THREE.Vector3(x, heightAt(x, z) + h - r, z), q, new THREE.Vector3(r * 1.1, r, r * 1.1)); trees.setMatrixAt(n, m);
    const t = EAST_TREES.tones[Math.floor(hash(x, z, 87) * EAST_TREES.tones.length)]!; tc.setRGB(t[0], t[1], t[2], THREE.SRGBColorSpace); trees.setColorAt(n, tc); n++;
  }
  trees.count = n; trees.name = 'perth-east-bank-trees'; group.add(trees); stats.triangles += n * crown.getAttribute('position').count / 3; stats.drawCalls++;
  // the main terrain's apron (MAIN_APRON): west edge north to south, then the north and south edges west to east, with the corners
  {
    const apos: number[] = [], acol: number[] = [], aidx: number[] = [], ac = new THREE.Color(), haze = new THREE.Color().setHex(EAST_SKIRT.tone, THREE.SRGBColorSpace);
    const avert = (x: number, z: number, y: number, fade: number) => { ac.setHex(MAIN_APRON.from, THREE.SRGBColorSpace).lerp(haze, fade); apos.push(x, y, z); acol.push(ac.r, ac.g, ac.b); return apos.length / 3 - 1; };
    const M = main.extent, O = EAST_SKIRT.out, S = MAIN_APRON.step, inner = (x: number, z: number) => avert(x, z, Math.max((x > M.x1 + 1e-6 || z > M.z1 + 1e-6 ? heightAt : main.heightAt)(x, z) - .05, GROUND_Y + .3), 0); // over the plane even where the edge lies under it (the Tay's floodplain north of the town)
    const outer = (x: number, z: number) => avert(x, z, EAST_SKIRT.to, 1);
    const strip = (pts: [number, number][], ox: number, oz: number, flip: boolean) => {
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, az] = pts[k]!, [bx, bz] = pts[k + 1]!, a = inner(ax, az), b = inner(bx, bz), d = outer(ax + ox, az + oz), e = outer(bx + ox, bz + oz);
        if (flip) aidx.push(a, b, d, b, e, d); else aidx.push(a, d, b, b, d, e);
      }
    };
    const run = (n0: number, n1: number, s: number = S) => { const r: number[] = []; for (let v = n0; v < n1; v += s) r.push(v); r.push(n1); return r; };
    strip(run(M.z0, M.z1).map(z => [M.x0, z]), -O, 0, false);
    strip(run(M.x0, M.x1).map(x => [x, M.z0]), 0, -O, true);
    strip(run(M.x0, M.x1).map(x => [x, M.z1]), 0, O, false);
    // past the east patch (round 6): its east edge, its south edge, and the corner between them
    strip(run(E.z0, E.z1, MAIN_APRON.eastStep).map(z => [E.x1, z]), O, 0, true);
    strip(run(E.x0, E.x1, MAIN_APRON.eastStep).map(x => [x, E.z1]), 0, O, false);
    // the corners: from the corner out along both sides
    for (const [cx, cz, sx, sz] of [[M.x0, M.z0, -1, -1], [M.x0, M.z1, -1, 1], [E.x1, E.z1, 1, 1]] as const) {
      const c0 = inner(cx, cz), p = outer(cx + sx * O, cz), q = outer(cx + sx * O, cz + sz * O), r = outer(cx, cz + sz * O);
      if (sx * sz > 0) aidx.push(c0, q, p, c0, r, q); else aidx.push(c0, p, q, c0, q, r); // wound to face up
    }
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(apos, 3)); ag.setAttribute('color', new THREE.Float32BufferAttribute(acol, 3));
    ag.setIndex(aidx); ag.computeVertexNormals(); ag.computeBoundingSphere();
    // drawn over the flat plane where the two run nearly level far off (in the overview they z-fought in stripes)
    const amat = new THREE.MeshLambertMaterial({vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2}); hazeLand(amat, {inside: null}); // round 11: fields
    const am = new THREE.Mesh(ag, amat); am.name = 'perth-main-apron';
    group.add(am); stats.triangles += aidx.length / 3; stats.drawCalls++;
  }
  return {group, stats, heightAt};
}
