// The King's Cross Central landmarks, drawn from the numbers in core/kxcentral.ts: Coal Drops Yard under Heatherwick's
// kissing roofs, the Granary and its transit sheds, the gasholders, the Francis Crick Institute, the British Library, the
// German Gymnasium and the Platform 37 landscraper. Everything is procedural: geometry is built in code, the textures
// are the shared ones in materials.ts or the few drawn below into a canvas at runtime (no image assets, nothing to
// license). All geometry is built in world coordinates (x east, y up, z south), UVs are in METRES (materials.ts's
// contract), and every wall, roof and band goes into a `Batch` per material, merged across the landmarks into one mesh
// per material: about fourteen draw calls, and one more for the roof-garden trees.
//
// THE FIVE TEXTURES AND THE TREE MATERIAL BELOW ARE LOCAL to this file, because materials.ts has an open block (the city
// worker's) at its end. They belong in materials.ts: KX_TEXTURES beside TEXTURES, KX_PAINTERS beside PAINTERS, the
// five tiled materials beside the makers there.
//
// Wiring (main.ts):
//   const kx = params.has('bare') ? null : addKxCentral(scene, data);          // once, after the scene exists
//   const hidden = new Set([...buildingsUnderStation(...), ...LANDMARK_OSM_IDS, ...KXCENTRAL_OSM_IDS]);  // before the city / buildingPrisms
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import {
  coalDropsPlan,
  crickPlan,
  distToPolyline,
  earClip,
  FIG,
  gasholderPlan,
  granaryComplex,
  gymnasiumPlan,
  KXCENTRAL_OSM_IDS,
  landscraperPlan,
  libraryPlan,
  meshPolygon,
  polygonEdges,
  surfaceNormal,
} from '../../core/kxcentral.ts';
import type { CoalDropsPlan, CrickPlan, Edge, Facet, Gasholder, GasholderPlan, GranaryComplex, GranaryPlan, GymnasiumPlan, LandscraperPlan, LibraryPlan, PolyMesh, RaisedWall, ShedPlan, Tree } from '../../core/kxcentral.ts';
import type { KxData } from '../../core/osm.ts';
import { addBand, addFramedWindow, addSash, segmentsOutside } from './landmarks.ts';
import { Batch, material, mergeParts, part, rng } from './materials.ts';
import type { PartMap, TextureSpec, V2, V3 } from './materials.ts';
import { GROUND_Y } from './world.ts';

/** The OSM building ids this module replaces: leave them out of the city / buildingPrisms(). */
export { KXCENTRAL_OSM_IDS };

const UP: V3 = [0, 1, 0];

// ---- textures local to this module -------------------------------------------------------------------------------

export type KxTextureName = 'drum' | 'curtain' | 'alu' | 'timber' | 'green';

/** Tile sizes, canvas sizes and texel densities, as for TEXTURES in materials.ts (the density test in the web tests holds each to its range). */
export const KX_TEXTURES: Readonly<Record<KxTextureName, TextureSpec>> = {
  // The gasholder drums: one storey (2.7 m, ASSUMED) tall and two 1.5 m panels (ASSUMED) wide, silver aluminium with a
  // perforated shutter in each panel and a dark ring beam over the storey [AR in core/kxcentral.ts].
  drum: { tile: [3.0, 2.7], px: [192, 173], density: [60, 68], average: 0x9aa2aa, repeat: true, source: '[AR] silver aluminium, perforated shutters, dark ring beams; storey 2.7 m and panel 1.5 m ASSUMED' },
  // The Crick's glass envelope: one 1.5 m module (ASSUMED) by one 4.0 m storey (ASSUMED), vision glass over a spandrel in
  // the terracotta of the labs behind [ADF].
  curtain: { tile: [1.5, 4.0], px: [96, 256], density: [60, 68], average: 0x6f8190, repeat: true, source: '[ADF] a mostly glass envelope over terracotta-wrapped labs; module 1.5 m and storey 4.0 m ASSUMED' },
  // The Crick's roof: louvre blades 0.2 m deep (ASSUMED) with a photovoltaic blade in every fourth [ADF].
  alu: { tile: [1.6, 1.6], px: [128, 128], density: [76, 84], average: 0x9ba3aa, repeat: true, source: '[ADF] louvre blades and photovoltaic blades; blade depth 0.2 m ASSUMED' },
  // Platform 37's facade: vertical Accoya timber fins [DZ] on a 0.15 m pitch (ASSUMED) over glass, one 4.2 m storey (ASSUMED) per tile.
  timber: { tile: [1.5, 4.2], px: [96, 269], density: [60, 68], average: 0x6f5a42, repeat: true, source: '[DZ] a slatted facade of glass and Accoya timber; fin pitch 0.15 m and storey 4.2 m ASSUMED' },
  // A roof garden: mown grass and planting, drawn at 32 texels per metre. ASSUMED.
  green: { tile: [4, 4], px: [128, 128], density: [30, 34], average: 0x5f7e45, repeat: true, source: 'ASSUMED: roof-garden planting drawn at 32 texels per metre' },
};

type Ctx = CanvasRenderingContext2D;
const chan = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const clamp8 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
/** Mix two 0xRRGGBB colours (t = 0 gives a), then scale the lightness by k, as a CSS colour. */
function mix(a: number, b: number, t: number, k = 1): string {
  const [ar, ag, ab] = chan(a);
  const [br, bg, bb] = chan(b);
  return `rgb(${clamp8((ar + (br - ar) * t) * k)},${clamp8((ag + (bg - ag) * t) * k)},${clamp8((ab + (bb - ab) * t) * k)})`;
}

function paintDrum(g: Ctx, w: number, h: number): void {
  const r = rng(301);
  const pxm = w / KX_TEXTURES.drum.tile[0];
  g.fillStyle = '#b5bdc4'; // anodised aluminium
  g.fillRect(0, 0, w, h);
  const panel = w / 2;
  for (let p = 0; p < 2; p++) {
    const x0 = p * panel;
    const fx = x0 + 0.18 * pxm;
    const fw = panel - 0.36 * pxm;
    g.fillStyle = '#929ca6'; // the shutter
    g.fillRect(fx, 0.5 * pxm, fw, h - 0.75 * pxm);
    g.fillStyle = 'rgba(30,38,46,0.38)'; // its slits
    for (let y = 0.52 * pxm; y < h - 0.3 * pxm; y += 0.05 * pxm) g.fillRect(fx, y, fw, 1);
    if (r() < 0.5) {
      g.fillStyle = 'rgba(25,32,40,0.22)'; // a shutter part closed
      g.fillRect(fx, 0.5 * pxm, fw * (0.4 + r() * 0.6), h - 0.75 * pxm);
    }
    g.fillStyle = 'rgba(255,255,255,0.22)'; // the panel joint
    g.fillRect(x0, 0.35 * pxm, 1.5, h);
  }
  g.fillStyle = '#353c43'; // the dark ring beam at the top of the storey
  g.fillRect(0, 0, w, 0.35 * pxm);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(0, 0.35 * pxm, w, 1.5);
}

function paintCurtain(g: Ctx, w: number, h: number): void {
  const pxm = w / KX_TEXTURES.curtain.tile[0];
  g.fillStyle = '#4a5f70'; // the frame
  g.fillRect(0, 0, w, h);
  const slab = 0.95 * pxm;
  const lg = g.createLinearGradient(0, 0, 0, h - slab);
  lg.addColorStop(0, '#a3c0d2');
  lg.addColorStop(1, '#4f6e85');
  g.fillStyle = lg; // vision glass
  g.fillRect(2, 0.1 * pxm, w - 4, h - slab - 0.1 * pxm);
  g.fillStyle = 'rgba(255,255,255,0.13)'; // a sky reflection
  g.beginPath();
  g.moveTo(w * 0.1, 0.1 * pxm);
  g.lineTo(w * 0.6, 0.1 * pxm);
  g.lineTo(w * 0.25, h - slab);
  g.lineTo(w * -0.25, h - slab);
  g.closePath();
  g.fill();
  g.fillStyle = '#935f4a'; // the spandrel: the terracotta of the labs behind
  g.fillRect(0, h - slab, w, slab - 0.14 * pxm);
  g.fillStyle = 'rgba(0,0,0,0.18)'; // tile joints in it
  for (let x = 0.25 * pxm; x < w; x += 0.25 * pxm) g.fillRect(x, h - slab, 1, slab - 0.14 * pxm);
  g.fillStyle = '#d9dde0'; // the slab edge
  g.fillRect(0, h - 0.14 * pxm, w, 0.14 * pxm);
  g.fillStyle = '#232d36'; // mullions
  g.fillRect(0, 0, 3, h);
  g.fillRect(w - 3, 0, 3, h);
}

function paintAlu(g: Ctx, w: number, h: number): void {
  const bands = 8;
  const bh = h / bands;
  g.fillStyle = '#6e767e';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < bands; i++) {
    const y = i * bh;
    const pv = i % 4 === 3; // a photovoltaic blade in every fourth
    const gr = g.createLinearGradient(0, y, 0, y + bh);
    gr.addColorStop(0, pv ? '#2f4465' : '#d6dce1');
    gr.addColorStop(1, pv ? '#1c2a44' : '#8d959d');
    g.fillStyle = gr;
    g.fillRect(0, y + 1, w, bh - 2);
    if (pv) {
      g.fillStyle = 'rgba(170,190,220,0.25)'; // cell lines
      for (let x = 0; x < w; x += w / 4) g.fillRect(x, y + 1, 1, bh - 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, y + bh - 2, w, 1);
  }
}

function paintTimber(g: Ctx, w: number, h: number): void {
  const r = rng(331);
  const pxm = w / KX_TEXTURES.timber.tile[0];
  g.fillStyle = '#27323a'; // the glass and the shadow behind the fins
  g.fillRect(0, 0, w, h);
  const pitch = 0.15 * pxm;
  const spandrel = 1.0 * pxm; // the lowest metre of each storey is closed cladding
  for (let k = 0; k < 10; k++) {
    const x = k * pitch;
    g.fillStyle = mix(0xc4a06c, 0x9c744a, r(), 0.9 + r() * 0.2);
    g.fillRect(x + pitch * 0.12, 0, pitch * 0.76, h);
    g.fillStyle = 'rgba(255,236,190,0.20)'; // the lit edge of a fin
    g.fillRect(x + pitch * 0.12, 0, 1, h);
    g.fillStyle = 'rgba(55,36,18,0.25)'; // and the shaded one
    g.fillRect(x + pitch * 0.88 - 1, 0, 1, h);
    for (let s = 0; s < 5; s++) {
      g.fillStyle = r() < 0.5 ? 'rgba(70,46,22,0.22)' : 'rgba(255,225,170,0.14)'; // grain
      g.fillRect(x + pitch * (0.2 + r() * 0.6), r() * h, 1, 6 + r() * 30);
    }
  }
  g.fillStyle = mix(0x9c744a, 0x86603a, 0.5); // closed cladding below the glass
  g.fillRect(0, h - spandrel, w, spandrel);
  for (let k = 0; k < 10; k++) {
    g.fillStyle = 'rgba(40,26,12,0.34)';
    g.fillRect(k * pitch + pitch * 0.88, h - spandrel, pitch * 0.24, spandrel);
  }
  g.fillStyle = 'rgba(0,0,0,0.3)'; // the slab shadow
  g.fillRect(0, h - spandrel - 2, w, 2);
}

function paintGreen(g: Ctx, w: number, h: number): void {
  const r = rng(347);
  g.fillStyle = '#5c7a42';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    const x = r() * w;
    const y = r() * h;
    g.fillStyle = r() < 0.5 ? `rgba(${38 + r() * 30},${68 + r() * 36},${28 + r() * 20},0.45)` : `rgba(${110 + r() * 50},${140 + r() * 40},${66 + r() * 30},0.35)`;
    for (const dx of x > w - 4 ? [-w, 0] : [0]) for (const dy of y > h - 4 ? [-h, 0] : [0]) g.fillRect(x + dx, y + dy, 1 + r() * 2, 1 + r() * 3);
  }
  for (let i = 0; i < 26; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(226,196,86,0.8)' : 'rgba(214,120,150,0.75)'; // a few flowers
    g.fillRect(r() * w, r() * h, 2, 2);
  }
}

export const KX_PAINTERS: Readonly<Record<KxTextureName, (g: Ctx, w: number, h: number) => void>> = {
  drum: paintDrum,
  curtain: paintCurtain,
  alu: paintAlu,
  timber: paintTimber,
  green: paintGreen,
};

/** The canvas texture for one of the local textures, or null where there is no document (Node). A fresh one each call: the caller owns it. */
export function kxTexture(name: KxTextureName): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const spec = KX_TEXTURES[name];
  const c = document.createElement('canvas');
  [c.width, c.height] = spec.px;
  const g = c.getContext('2d');
  if (!g) return null;
  KX_PAINTERS[name](g, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / spec.tile[0], 1 / spec.tile[1]);
  return t;
}

// ---- materials ----------------------------------------------------------------------------------------------------

export type Key = 'brick' | 'brickRed' | 'stone' | 'slate' | 'sash' | 'sashArch' | 'pane' | 'roofGlass' | 'iron' | 'drum' | 'curtain' | 'alu' | 'timber' | 'green';

export interface MaterialSet {
  table: Record<Key, THREE.Material>;
  /** the materials (and textures) this set made itself, to dispose; the shared ones from materials.ts are not ours */
  owned: (THREE.Material | THREE.Texture)[];
}

export function createMaterials(): MaterialSet {
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const own = <T extends THREE.Material | THREE.Texture>(x: T): T => {
    owned.push(x);
    return x;
  };
  const mapped = (name: KxTextureName): { map: THREE.CanvasTexture | null; color: number } => {
    const t = kxTexture(name);
    if (t) own(t);
    return { map: t, color: t ? 0xffffff : KX_TEXTURES[name].average };
  };
  return {
    table: {
      brick: material('brick'),
      brickRed: material('brickRed'),
      stone: material('stone'),
      slate: material('slateBothSides'),
      sash: material('sash'),
      sashArch: material('sashArch'),
      pane: material('pane'),
      roofGlass: material('roofGlass'),
      // the gasholder frames: painted battleship grey [AR]; the shade is ASSUMED
      iron: own(new THREE.MeshLambertMaterial({ color: 0x737b82 })),
      drum: own(new THREE.MeshLambertMaterial(mapped('drum'))),
      // glass and louvres catch the sun: a Phong sheen on top of the drawn pattern
      curtain: own(new THREE.MeshPhongMaterial({ ...mapped('curtain'), specular: 0x6f8190, shininess: 45 })),
      alu: own(new THREE.MeshPhongMaterial({ ...mapped('alu'), specular: 0x4a525a, shininess: 18, side: THREE.DoubleSide })),
      timber: own(new THREE.MeshLambertMaterial(mapped('timber'))),
      green: own(new THREE.MeshLambertMaterial(mapped('green'))),
    },
    owned,
  };
}

// ---- building blocks ----------------------------------------------------------------------------------------------

const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * A vertical wall piece over the edge a-b, from `lo` to `hi` at each end, u from u0 to u1 along it and v the height in metres. A quad,
 * or the one triangle it is where an end has no height (a quad would carry a zero-area half), or nothing where both ends have none
 * (`tri` leaves out the sliver).
 */
function wallPiece(m: Batch, a: Pt, b: Pt, loA: number, loB: number, hiA: number, hiB: number, u0: number, u1: number, normal: Pt): void {
  const n: V3 = [normal[0], 0, normal[1]];
  const noA = hiA - loA < 1e-9;
  const noB = hiB - loB < 1e-9;
  const p0: V3 = [a[0], loA, a[1]];
  const p1: V3 = [b[0], loB, b[1]];
  const p2: V3 = [b[0], hiB, b[1]];
  const p3: V3 = [a[0], hiA, a[1]];
  if (noA) m.tri(p0, p1, p2, [[u0, loA], [u1, loB], [u1, hiB]], n);
  else if (noB) m.tri(p0, p1, p3, [[u0, loA], [u1, loB], [u0, hiA]], n);
  else m.quadUV(p0, p1, p2, p3, [[u0, loA], [u1, loB], [u1, hiB], [u0, hiA]], n);
}

/**
 * Vertical wall strips over some edges of a ring, from y0 up to `top` (a height, or a function of the plan point for a gable
 * end or a vault). Outward normals; u runs along the edges given and v up, in metres.
 */
export function wallEdges(m: Batch, edges: readonly Edge[], y0: number, top: number | ((p: Pt) => number)): void {
  let s = 0;
  for (const e of edges) {
    const s0 = s;
    const s1 = s + e.length;
    s = s1;
    const ya = typeof top === 'number' ? top : top(e.a);
    const yb = typeof top === 'number' ? top : top(e.b);
    if (ya <= y0 + 1e-6 && yb <= y0 + 1e-6) continue;
    wallPiece(m, e.a, e.b, y0, y0, ya, yb, s0, s1, e.normal);
  }
}

/**
 * The walls that stand over a lower neighbour (core's raisedWalls): one trapezoid per edge piece, from the neighbour's roof up to this
 * building's own top. u is the distance along the wall's direction, so the courses carry on across the pieces; v is the height, in metres.
 */
export function raisedWallQuads(m: Batch, walls: readonly RaisedWall[]): void {
  for (const w of walls) {
    const e = w.edge;
    const u0 = e.a[0] * e.dir[0] + e.a[1] * e.dir[1];
    wallPiece(m, e.a, e.b, w.baseA, w.baseB, w.topA, w.topB, u0, u0 + e.length, e.normal);
  }
}

/** The triangles of a flat (planar) roof face: ear-clipped, each point at `height(p)`. UVs are plan metres. */
export function planarRoof(m: Batch, ring: readonly Pt[], height: (p: Pt) => number): void {
  if (ring.length < 3) return;
  const p3 = (k: number): V3 => [(ring[k] as Pt)[0], height(ring[k] as Pt), (ring[k] as Pt)[1]];
  const uv = (k: number): V2 => [(ring[k] as Pt)[0], (ring[k] as Pt)[1]];
  for (const [a, b, c] of earClip(ring)) m.tri(p3(a), p3(b), p3(c), [uv(a), uv(b), uv(c)], UP);
}

/** A roof over a refined polygon mesh: every vertex at its height, smooth normals from the height field, UVs in plan metres (or `uvOf`'s, also metres). */
export function meshRoof(m: Batch, mesh: PolyMesh, height: (p: Pt) => number, uvOf?: (p: Pt) => V2): void {
  const pts = mesh.points;
  const y = pts.map((p) => height(p));
  const nrm = pts.map((p) => surfaceNormal(height, p, 1));
  const v = (i: number): V3 => [(pts[i] as Pt)[0], y[i] as number, (pts[i] as Pt)[1]];
  const uv = (i: number): V2 => (uvOf ? uvOf(pts[i] as Pt) : [(pts[i] as Pt)[0], (pts[i] as Pt)[1]]);
  for (const [i, j, k] of mesh.tris) {
    const a = pts[i] as Pt;
    const b = pts[j] as Pt;
    const c = pts[k] as Pt;
    if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9) continue;
    m.poly([v(i), v(j), v(k)], [uv(i), uv(j), uv(k)], { normals: [nrm[i] as V3, nrm[j] as V3, nrm[k] as V3] });
  }
}

/**
 * The walls under a mesh roof, on the mesh's own boundary so they meet it exactly: `wall` from y0 up to the roof (or only to
 * `eaves` where a `band` is given, which takes over from there to the roof). `skip` leaves out a boundary segment (a shared wall).
 */
export function boundaryWalls(wall: Batch, band: Batch | null, mesh: PolyMesh, height: (p: Pt) => number, eaves: number, skip?: (a: Pt, b: Pt) => boolean): void {
  const ring = mesh.boundary.map((i) => mesh.points[i] as Pt);
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Pt;
    const b = ring[(i + 1) % ring.length] as Pt;
    const len = dist(a, b);
    const s0 = s;
    const s1 = s + len;
    s = s1;
    if (len < 1e-9 || skip?.(a, b)) continue;
    const ha = height(a);
    const hb = height(b);
    const n: V3 = [(b[1] - a[1]) / len, 0, -(b[0] - a[0]) / len]; // the boundary runs the positive way: outward is to its right
    const ta = band ? Math.min(ha, eaves) : ha;
    const tb = band ? Math.min(hb, eaves) : hb;
    wall.quadUV([a[0], GROUND_Y, a[1]], [b[0], GROUND_Y, b[1]], [b[0], tb, b[1]], [a[0], ta, a[1]], [[s0, GROUND_Y], [s1, GROUND_Y], [s1, tb], [s0, ta]], n);
    if (band && (ha > eaves + 1e-6 || hb > eaves + 1e-6)) {
      // two triangles, not a quad: where the roof comes down to the eaves at one end the quad has a sliver, which `tri` leaves out
      const lo = (p: Pt): V3 => [p[0], eaves, p[1]];
      const hi = (p: Pt, h: number): V3 => [p[0], Math.max(h, eaves), p[1]];
      band.tri(lo(a), lo(b), hi(b, hb), undefined, n);
      band.tri(lo(a), hi(b, hb), hi(a, ha), undefined, n);
    }
  }
}

export interface Row {
  y: number;
  h: number;
  w: number;
  key: 'sash' | 'sashArch';
}

/** Rows of window decals along edges, one bay per `pitch` metres; a window is left out where the wall is not tall enough for it. Returns how many were placed. */
export function dressEdges(parts: PartMap<Key>, edges: readonly Edge[], rows: readonly Row[], pitch: number, topAt: (p: Pt) => number): number {
  let n = 0;
  for (const e of edges) {
    if (e.length < pitch * 0.9) continue;
    const bays = Math.max(1, Math.round(e.length / pitch));
    for (let k = 0; k < bays; k++) {
      const t = (k + 0.5) / bays;
      const at: Pt = [e.a[0] + e.dir[0] * e.length * t, e.a[1] + e.dir[1] * e.length * t];
      const top = topAt(at);
      for (const r of rows) {
        if (r.y + r.h + 0.3 > top) continue;
        addSash(parts, r.key, { at, dir: e.dir, normal: e.normal }, r.y, r.w, r.h);
        n++;
      }
    }
  }
  return n;
}

/** Plain dark window panes in a grid (the library's 7.8 m bay split in two): `storeys` rows of w x h panes, `storeyHeight` apart. */
export function paneGrid(parts: PartMap<Key>, edges: readonly Edge[], storeys: number, storeyHeight: number, pitch: number, topAt: (p: Pt) => number, w = 2.6, h = 2.2): number {
  let n = 0;
  const m = part(parts, 'pane');
  for (const e of edges) {
    if (e.length < pitch * 0.9) continue;
    const bays = Math.max(1, Math.round(e.length / pitch));
    for (let k = 0; k < bays; k++) {
      const t = (k + 0.5) / bays;
      const at: Pt = [e.a[0] + e.dir[0] * e.length * t, e.a[1] + e.dir[1] * e.length * t];
      const top = topAt(at);
      for (let s = 0; s < storeys; s++) {
        const y = s * storeyHeight + 1.0;
        if (y + h + 0.3 > top) continue;
        const q = (x: number, yy: number): V3 => [at[0] + e.dir[0] * x + e.normal[0] * 0.1, y + yy, at[1] + e.dir[1] * x + e.normal[1] * 0.1];
        m.quadUV(q(-w / 2, 0), q(w / 2, 0), q(w / 2, h), q(-w / 2, h), undefined, [e.normal[0], 0, e.normal[1]]);
        n++;
      }
    }
  }
  return n;
}

/**
 * A pitched roof from an outline (at y0) climbing to a ring (at y1) that has a vertex inside each of the outline's, and a flat cap on the
 * ring. A ring of one repeated point makes a pyramid, with no cap. Each face is laid flat in UV, in metres along the eaves and up the
 * slope (landmarks.ts's addRoof runs u along the eaves and v by the slant, which stretches the slate where a ring edge is shorter than
 * its outline edge: the hips of a stepped roof).
 */
export function climbingRoof(m: Batch, outline: readonly Pt[], ring: readonly Pt[], y0: number, y1: number, cap = true): void {
  const n = outline.length;
  const rise = y1 - y0;
  let s = 0;
  for (const e of polygonEdges(outline)) {
    const j = (e.i + 1) % n;
    const ra = ring[e.i] as Pt;
    const rb = ring[j] as Pt;
    const a: V3 = [e.a[0], y0, e.a[1]];
    const b: V3 = [e.b[0], y0, e.b[1]];
    const top = (r: Pt): V3 => [r[0], y1, r[1]];
    // the slope axis: from the middle of the eaves edge to the middle of the ring edge, less what lies along the edge
    const dx = (ra[0] + rb[0]) / 2 - e.mid[0];
    const dz = (ra[1] + rb[1]) / 2 - e.mid[1];
    const along = dx * e.dir[0] + dz * e.dir[1];
    const sx = dx - along * e.dir[0];
    const sz = dz - along * e.dir[1];
    const sl = Math.hypot(sx, rise, sz) || 1;
    const uv = (p: V3): V2 => [s + (p[0] - e.a[0]) * e.dir[0] + (p[2] - e.a[1]) * e.dir[1], ((p[0] - e.a[0]) * sx + (p[1] - y0) * rise + (p[2] - e.a[1]) * sz) / sl];
    const out: V3 = [e.normal[0], 1, e.normal[1]];
    if (dist(ra, rb) < 1e-6) m.tri(a, b, top(rb), [uv(a), uv(b), uv(top(rb))], out);
    else m.quadUV(a, b, top(rb), top(ra), [uv(a), uv(b), uv(top(rb)), uv(top(ra))], out);
    s += e.length;
  }
  if (cap) planarRoof(m, ring, () => y1);
}

/** A disc (or part of a ring) of `n` sides as flat fans at height y, facing up. */
function disc(m: Batch, c: Pt, r: number, y: number, n = 24): void {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const p0: V3 = [c[0] + Math.cos(a0) * r, y, c[1] + Math.sin(a0) * r];
    const p1: V3 = [c[0] + Math.cos(a1) * r, y, c[1] + Math.sin(a1) * r];
    m.tri([c[0], y, c[1]], p0, p1, [[c[0], c[1]], [p0[0], p0[2]], [p1[0], p1[2]]], UP);
  }
}

// ---- Coal Drops Yard ----------------------------------------------------------------------------------------------

const COAL_ROWS: readonly Row[] = [
  { y: 0.5, h: 3.2, w: 1.9, key: 'sashArch' }, // the ground-floor arches
  { y: 4.3, h: 2.0, w: 1.4, key: 'sash' },
  { y: 7.8, h: 2.0, w: 1.4, key: 'sash' }, // the storey Heatherwick added
];

/** The two Victorian brick sheds under their kissing roofs: slate on a mesh lifted into a cone at the kiss, glass (a dark band) between the old eaves and the lifted roof. */
export function coalDropsGeometry(plan: CoalDropsPlan): PartMap<Key> {
  const parts: PartMap<Key> = {};
  for (const which of ['west', 'east'] as const) {
    const b = plan[which];
    const height = (p: Pt): number => plan.roofHeight(which, p);
    const mesh = meshPolygon(b.outline, FIG.coal.maxEdge);
    meshRoof(part(parts, 'slate'), mesh, height);
    boundaryWalls(part(parts, 'brick'), part(parts, 'pane'), mesh, height, plan.eaves);
    dressEdges(parts, polygonEdges(b.outline), COAL_ROWS, 3.8, () => plan.eaves);
  }
  return parts;
}

// ---- the Granary, the transit sheds and the street ------------------------------------------------------------------

const SHED_ROWS: readonly Row[] = [
  { y: 0.9, h: 3.0, w: 1.5, key: 'sashArch' },
  { y: 6.0, h: 2.3, w: 1.4, key: 'sash' },
];

/** The Granary: a nine-bay south front (four projecting hoist bays between five casement bays), string courses, a cornice, a double-hipped slate roof. */
export function granaryGeometry(plan: GranaryPlan): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const f = FIG.granary;
  const brick = part(parts, 'brick');
  const stone = part(parts, 'stone');
  wallEdges(brick, plan.walls, GROUND_Y, plan.eaves);
  raisedWallQuads(brick, plan.raised); // above the sheds' and the street's roofs, where the walls it shares with them stand in the open
  const segs = segmentsOutside(plan.walls, []);
  addBand(stone, segs, (plan.floors[1] as number) - 0.15, 0.3, 0.08);
  addBand(stone, segs, plan.eaves - 0.55, 0.55, 0.35);
  addBand(stone, segmentsOutside(plan.raised.map((w) => w.edge), []), plan.eaves - 0.55, 0.55, 0.35);
  const hoistHalf = 1.6;
  plan.bays.forEach((bay, i) => {
    if (!plan.hoist.includes(i)) {
      // a casement bay: segmental-arched windows [HE-GRA] (the shared round-headed decal stands in for the segment) on every storey
      addSash(parts, 'sashArch', bay, 0.9, 1.4, 2.9);
      for (let s = 1; s < f.storeys; s++) addSash(parts, 'sashArch', bay, (plan.floors[s] as number) + 0.5, 1.2, 1.9);
      return;
    }
    // a hoist bay: a full-height brick pier standing out from the wall, with a dark recess up its face
    const proj = f.hoistProjection;
    const edge = (side: number, out: number): Pt => [bay.at[0] + bay.dir[0] * hoistHalf * side + bay.normal[0] * out, bay.at[1] + bay.dir[1] * hoistHalf * side + bay.normal[1] * out];
    const a = edge(-1, 0);
    const b = edge(1, 0);
    const a2 = edge(-1, proj);
    const b2 = edge(1, proj);
    const top = plan.eaves;
    const w = hoistHalf * 2;
    brick.quadUV([a2[0], GROUND_Y, a2[1]], [b2[0], GROUND_Y, b2[1]], [b2[0], top, b2[1]], [a2[0], top, a2[1]], [[0, GROUND_Y], [w, GROUND_Y], [w, top], [0, top]], [bay.normal[0], 0, bay.normal[1]]);
    brick.quadUV([a[0], GROUND_Y, a[1]], [a2[0], GROUND_Y, a2[1]], [a2[0], top, a2[1]], [a[0], top, a[1]], [[0, GROUND_Y], [proj, GROUND_Y], [proj, top], [0, top]], [-bay.dir[0], 0, -bay.dir[1]]);
    brick.quadUV([b2[0], GROUND_Y, b2[1]], [b[0], GROUND_Y, b[1]], [b[0], top, b[1]], [b2[0], top, b2[1]], [[0, GROUND_Y], [proj, GROUND_Y], [proj, top], [0, top]], [bay.dir[0], 0, bay.dir[1]]);
    const face = (x: number, y: number): V3 => [bay.at[0] + bay.dir[0] * x + bay.normal[0] * (proj + 0.06), y, bay.at[1] + bay.dir[1] * x + bay.normal[1] * (proj + 0.06)];
    part(parts, 'pane').quadUV(face(-1.0, 0.4), face(1.0, 0.4), face(1.0, top - 1.2), face(-1.0, top - 1.2), undefined, [bay.normal[0], 0, bay.normal[1]]);
  });
  for (const facet of plan.roof) part(parts, 'slate').poly(facet, facet.map((p) => [p[0], p[2]] as V2), { facing: UP });
  return parts;
}

/** A transit shed (slate) or the street between them (a glazed roof): brick walls rising to the gable ends, a ridge, rows of windows on the walls that show. */
export function shedGeometry(plan: ShedPlan, roofKey: 'slate' | 'roofGlass'): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const roof = plan.roof;
  wallEdges(part(parts, 'brick'), plan.walls, GROUND_Y, roof.height);
  raisedWallQuads(part(parts, 'brick'), plan.raised);
  for (const half of roof.halves) planarRoof(part(parts, roofKey), half, roof.height);
  dressEdges(parts, plan.walls, SHED_ROWS, 4.6, roof.height);
  return parts;
}

export function granaryComplexGeometry(c: GranaryComplex): PartMap<Key>[] {
  return [granaryGeometry(c.granary), shedGeometry(c.westShed, 'slate'), shedGeometry(c.eastShed, 'slate'), shedGeometry(c.street, 'roofGlass')];
}

// ---- the gasholders -----------------------------------------------------------------------------------------------

const COLUMN = 0.7; // ASSUMED: section of a guide-frame column
const GIRDER: V3 = [1, 0.55, 0.45]; // ASSUMED: ring girder section (the length is set per bay)
const BRACE = 0.32; // ASSUMED: diagonal section

/** A guide frame: columns round a circle, ring girders at each tier and a diagonal brace in every bay of every tier, painted iron. */
export function frameGeometry(b: Batch, g: Gasholder): void {
  const n = g.columns;
  const r = g.radius - COLUMN / 2; // the OSM outline is the outside of the frame
  const col = (i: number): Pt => [g.centre[0] + Math.cos((i / n) * Math.PI * 2) * r, g.centre[1] + Math.sin((i / n) * Math.PI * 2) * r];
  for (let i = 0; i < n; i++) {
    const p = col(i);
    b.box([p[0], (g.height + GROUND_Y) / 2, p[1]], [COLUMN, g.height - GROUND_Y, COLUMN], { skip: ['-y'] });
  }
  for (let i = 0; i < n; i++) {
    const a = col(i);
    const c = col((i + 1) % n);
    const chord = dist(a, c);
    const ry = Math.atan2(-(c[1] - a[1]), c[0] - a[0]);
    const mx = (a[0] + c[0]) / 2;
    const mz = (a[1] + c[1]) / 2;
    for (let k = 1; k <= g.tiers; k++) b.box([mx, (g.height * k) / g.tiers, mz], [chord, GIRDER[1], GIRDER[2]], { rotY: ry, skip: ['+x', '-x'] });
    for (let k = 0; k < g.tiers; k++) {
      const y0 = k === 0 ? 0 : (g.height * k) / g.tiers;
      const y1 = (g.height * (k + 1)) / g.tiers;
      const rising = (i + k) % 2 === 0; // alternate the lean bay by bay
      const dy = (rising ? 1 : -1) * (y1 - y0);
      b.box([mx, (y0 + y1) / 2, mz], [Math.hypot(chord, y1 - y0), BRACE, BRACE], { rotY: ry, rotZ: Math.atan2(dy, chord), skip: ['+x', '-x'] });
    }
  }
}

/** An apartment drum: silver cladding round a ring roof (a roof garden) and a circular courtyard walled in the same cladding. */
export function drumGeometry(cladding: Batch, garden: Batch, g: Gasholder, sides = 48): void {
  const d = g.drum;
  if (!d) return;
  const ring = (rad: number, i: number): Pt => [g.centre[0] + Math.cos((i / sides) * Math.PI * 2) * rad, g.centre[1] + Math.sin((i / sides) * Math.PI * 2) * rad];
  const top = d.height;
  for (let i = 0; i < sides; i++) {
    const am = ((i + 0.5) / sides) * Math.PI * 2;
    const o0 = ring(d.radius, i);
    const o1 = ring(d.radius, i + 1);
    const c0 = ring(d.court, i);
    const c1 = ring(d.court, i + 1);
    const s0 = (i / sides) * Math.PI * 2 * d.radius;
    const s1 = ((i + 1) / sides) * Math.PI * 2 * d.radius;
    cladding.quadUV([o0[0], GROUND_Y, o0[1]], [o1[0], GROUND_Y, o1[1]], [o1[0], top, o1[1]], [o0[0], top, o0[1]], [[s0, GROUND_Y], [s1, GROUND_Y], [s1, top], [s0, top]], [Math.cos(am), 0, Math.sin(am)]);
    const t0 = (i / sides) * Math.PI * 2 * d.court;
    const t1 = ((i + 1) / sides) * Math.PI * 2 * d.court;
    cladding.quadUV([c0[0], GROUND_Y, c0[1]], [c1[0], GROUND_Y, c1[1]], [c1[0], top, c1[1]], [c0[0], top, c0[1]], [[t0, GROUND_Y], [t1, GROUND_Y], [t1, top], [t0, top]], [-Math.cos(am), 0, -Math.sin(am)]);
    garden.quadUV([o0[0], top, o0[1]], [o1[0], top, o1[1]], [c1[0], top, c1[1]], [c0[0], top, c0[1]], [[o0[0], o0[1]], [o1[0], o1[1]], [c1[0], c1[1]], [c0[0], c0[1]]], UP);
  }
  disc(garden, g.centre, d.court, GROUND_Y + 0.05, 24); // the courtyard lawn
}

/** The triplet's three frames with a drum inside each, and Gasholder Park's lone frame with its disc canopy. */
export function gasholderGeometry(plan: GasholderPlan): PartMap<Key> {
  const parts: PartMap<Key> = {};
  for (const g of plan.triplet) {
    frameGeometry(part(parts, 'iron'), g);
    drumGeometry(part(parts, 'drum'), part(parts, 'green'), g);
  }
  frameGeometry(part(parts, 'iron'), plan.park);
  // Gasholder Park's canopy: a thin stainless-steel disc [AM] on slim posts (the posts' number and the disc's thickness are ASSUMED)
  const canopy = part(parts, 'drum');
  const c = plan.park.centre;
  const h = FIG.gas.canopyHeight;
  const r = FIG.gas.canopyRadius;
  const sides = 32;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const p0: V3 = [c[0] + Math.cos(a0) * r, h, c[1] + Math.sin(a0) * r];
    const p1: V3 = [c[0] + Math.cos(a1) * r, h, c[1] + Math.sin(a1) * r];
    canopy.tri([c[0], h, c[1]], p0, p1, [[c[0], c[1]], [p0[0], p0[2]], [p1[0], p1[2]]], UP);
    canopy.tri([c[0], h - 0.35, c[1]], p1.map((v, k) => (k === 1 ? h - 0.35 : v)) as V3, p0.map((v, k) => (k === 1 ? h - 0.35 : v)) as V3, [[c[0], c[1]], [p1[0], p1[2]], [p0[0], p0[2]]], [0, -1, 0]);
    canopy.quadUV([p0[0], h - 0.35, p0[2]], [p1[0], h - 0.35, p1[2]], [p1[0], h, p1[2]], [p0[0], h, p0[2]], [[0, 0], [1, 0], [1, 0.35], [0, 0.35]], [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
  }
  const iron = part(parts, 'iron');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    iron.box([c[0] + Math.cos(a) * r * 0.7, (h - 0.35 + GROUND_Y) / 2, c[1] + Math.sin(a) * r * 0.7], [0.3, h - 0.35 - GROUND_Y, 0.3], { skip: ['-y', '+y'] });
  }
  return parts;
}

// ---- the Francis Crick Institute ---------------------------------------------------------------------------------

/** Two barrel vaults of louvred aluminium over a glass and terracotta envelope; the wall tops follow the vault, and the shared valley between the parts has no wall. */
export function crickGeometry(plan: CrickPlan): PartMap<Key> {
  const parts: PartMap<Key> = {};
  for (const p of plan.parts) {
    const mesh = meshPolygon(p.outline, FIG.crick.maxEdge);
    const perp: Pt = [-p.axis[1], p.axis[0]];
    // the louvre blades run along the vault: u along its axis, v across it
    meshRoof(part(parts, 'alu'), mesh, p.roofHeight, (q) => [q[0] * p.axis[0] + q[1] * p.axis[1], q[0] * perp[0] + q[1] * perp[1]]);
    const onShared = (q: Pt): boolean => distToPolyline(q, p.shared) < 0.25;
    boundaryWalls(part(parts, 'curtain'), null, mesh, p.roofHeight, p.eaves, (a, b) => onShared(a) && onShared(b));
  }
  return parts;
}

// ---- the British Library ------------------------------------------------------------------------------------------

/** The British Library: a six-storey east block under a gabled slate roof, a four-storey west block with two stepped slate roofs, a clock tower and the piazza front's gateway. */
export function libraryGeometry(plan: LibraryPlan): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const f = FIG.library;
  const brick = part(parts, 'brickRed');
  const stone = part(parts, 'stone');
  const slate = part(parts, 'slate');
  const onCut = (p: Pt): boolean => Math.abs((p[0] - plan.cut.origin[0]) * plan.cut.normal[0] + (p[1] - plan.cut.origin[1]) * plan.cut.normal[1]) < 0.3;
  const isCut = (e: Edge): boolean => onCut(e.a) && onCut(e.b);
  // west block: four storeys
  const westWalls = polygonEdges(plan.west).filter((e) => !isCut(e));
  wallEdges(brick, westWalls, GROUND_Y, plan.westEaves);
  addBand(stone, segmentsOutside(westWalls, []), plan.westEaves - 0.5, 0.5, 0.3);
  paneGrid(parts, westWalls, f.westStoreys, f.storeyHeight, f.grid / 2, () => plan.westEaves);
  // east block: six storeys, gabled; its west face above the west block's eaves is a wall too
  const roof = plan.eastRoof;
  const eastEdges = polygonEdges(roof.ring);
  const eastWalls = eastEdges.filter((e) => !isCut(e));
  wallEdges(brick, eastWalls, GROUND_Y, roof.height);
  wallEdges(brick, eastEdges.filter(isCut), plan.westEaves, roof.height);
  addBand(stone, segmentsOutside(eastWalls, []), plan.eastEaves - 0.5, 0.5, 0.3);
  paneGrid(parts, eastWalls, f.eastStoreys, f.storeyHeight, f.grid / 2, roof.height);
  for (const half of roof.halves) planarRoof(slate, half, roof.height);
  // the stepped roofs of the west block
  const [s1, s2] = plan.steps as [LibraryPlan['steps'][number], LibraryPlan['steps'][number]];
  climbingRoof(slate, s1.outline, s1.ring, s1.base, s1.top);
  wallEdges(brick, polygonEdges(plan.upper.ring), plan.upper.base, plan.upper.top);
  addBand(stone, segmentsOutside(polygonEdges(plan.upper.ring), []), plan.upper.top - 0.4, 0.4, 0.25);
  climbingRoof(slate, s2.outline, s2.ring, s2.base, s2.top);
  // the clock tower
  const ck = plan.clock;
  const ckEdges = polygonEdges(ck.corners);
  wallEdges(brick, ckEdges, plan.eastEaves - 1.5, ck.height);
  addBand(stone, segmentsOutside(ckEdges, []), ck.height - 0.6, 0.6, 0.3);
  addBand(stone, segmentsOutside(ckEdges, []), ck.height - 9, 0.4, 0.2);
  climbingRoof(slate, ck.corners, ck.corners.map(() => ck.centre), ck.height, ck.height + 3.4, false);
  const face = ck.faces[0] as LibraryPlan['clock']['faces'][number];
  const cy = ck.height - 5;
  const dial = (rad: number, lift: number, key: 'stone' | 'pane'): void => {
    const m = part(parts, key);
    const sides = 16;
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const q = (a: number, r: number): V3 => [face.at[0] + face.dir[0] * Math.cos(a) * r + face.normal[0] * lift, cy + Math.sin(a) * r, face.at[1] + face.dir[1] * Math.cos(a) * r + face.normal[1] * lift];
      m.tri(q(0, 0), q(a0, rad), q(a1, rad), undefined, [face.normal[0], 0, face.normal[1]]);
    }
  };
  dial(1.9, 0.15, 'stone');
  dial(1.5, 0.2, 'pane');
  // the gateway in the piazza front: a stone surround round a dark opening
  const g = plan.gate;
  const gq = (x: number, y: number, lift: number): V3 => [g.at[0] + g.dir[0] * x + g.normal[0] * lift, y, g.at[1] + g.dir[1] * x + g.normal[1] * lift];
  const gn: V3 = [g.normal[0], 0, g.normal[1]];
  stone.quadUV(gq(-g.width / 2 - 0.7, 0, 0.18), gq(g.width / 2 + 0.7, 0, 0.18), gq(g.width / 2 + 0.7, 9.6, 0.18), gq(-g.width / 2 - 0.7, 9.6, 0.18), [[0, 0], [g.width + 1.4, 0], [g.width + 1.4, 9.6], [0, 9.6]], gn);
  part(parts, 'pane').quadUV(gq(-g.width / 2, 0, 0.24), gq(g.width / 2, 0, 0.24), gq(g.width / 2, 8.8, 0.24), gq(-g.width / 2, 8.8, 0.24), undefined, gn);
  return parts;
}

// ---- the German Gymnasium -----------------------------------------------------------------------------------------

/** The Gymnasium: stock brick under a gabled slate roof with a ridge lantern, pointed windows along the walls, and on the east end five pointed windows over an oculus. */
export function gymnasiumGeometry(plan: GymnasiumPlan): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const roof = plan.roof;
  const edges = polygonEdges(roof.ring);
  wallEdges(part(parts, 'brick'), edges, GROUND_Y, roof.height);
  addBand(part(parts, 'stone'), segmentsOutside(edges, []), plan.eaves - 0.45, 0.45, 0.25);
  for (const half of roof.halves) planarRoof(part(parts, 'slate'), half, roof.height);
  // long walls: tall pointed windows between pilasters
  const east = plan.east;
  for (const e of edges) {
    if (e.length < 8 || (east && Math.abs(e.mid[0] - east.mid[0]) < 0.01 && Math.abs(e.mid[1] - east.mid[1]) < 0.01)) continue;
    const bays = Math.max(1, Math.round(e.length / 4));
    for (let k = 0; k < bays; k++) {
      const t = (k + 0.5) / bays;
      const at: Pt = [e.a[0] + e.dir[0] * e.length * t, e.a[1] + e.dir[1] * e.length * t];
      if (roof.height(at) < 9.5) continue;
      addFramedWindow(parts, { at, dir: e.dir, normal: e.normal }, 3.2, 1.3, 5.6, 'pointed', 0.2);
    }
  }
  // the east end: five pointed windows above an oculus [HE-GYM]
  if (east) {
    const n = FIG.gymnasium.eastWindows;
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * 3.2;
      const at: Pt = [east.mid[0] + east.dir[0] * x, east.mid[1] + east.dir[1] * x];
      addFramedWindow(parts, { at, dir: east.dir, normal: east.normal }, 6.6, 1.5, 4.4, 'pointed', 0.2);
    }
    const ring: V3[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ring.push([east.mid[0] + east.normal[0] * 0.1 + east.dir[0] * Math.cos(a) * 1.3, 3.0 + Math.sin(a) * 1.3, east.mid[1] + east.normal[1] * 0.1 + east.dir[1] * Math.cos(a) * 1.3]);
    }
    part(parts, 'pane').fan(ring, [east.normal[0], 0, east.normal[1]]);
  }
  // the ridge lantern: a glazed box with a slate cap
  const lan = plan.lantern;
  const mid: Pt = [(lan.a[0] + lan.b[0]) / 2, (lan.a[1] + lan.b[1]) / 2];
  const len = dist(lan.a, lan.b);
  const ry = Math.atan2(-(lan.b[1] - lan.a[1]), lan.b[0] - lan.a[0]);
  part(parts, 'pane').box([mid[0], (lan.base - 0.8 + lan.top) / 2, mid[1]], [len, lan.top - lan.base + 0.8, lan.width], { rotY: ry, skip: ['-y', '+y'] });
  part(parts, 'slate').box([mid[0], lan.top + 0.1, mid[1]], [len + 0.6, 0.2, lan.width + 0.6], { rotY: ry });
  return parts;
}

// ---- Platform 37, the landscraper ---------------------------------------------------------------------------------

/** Three terraces of timber-finned storeys stepping up to the north, each roofed in a garden. */
export function landscraperGeometry(plan: LandscraperPlan): PartMap<Key> {
  const parts: PartMap<Key> = {};
  const timber = part(parts, 'timber');
  const onCut = (p: Pt, j: number): boolean => {
    const c = plan.cuts[j] as { origin: Pt; normal: Pt };
    return Math.abs((p[0] - c.origin[0]) * c.normal[0] + (p[1] - c.origin[1]) * c.normal[1]) < 0.3;
  };
  plan.zones.forEach((z, i) => {
    for (const e of polygonEdges(z.ring)) {
      const north = i < plan.cuts.length && onCut(e.a, i) && onCut(e.b, i); // shared with the taller terrace
      const south = i > 0 && onCut(e.a, i - 1) && onCut(e.b, i - 1); // the step up from the lower one
      if (north) continue;
      wallEdges(timber, [e], south ? (plan.zones[i - 1] as { height: number }).height : GROUND_Y, z.height);
    }
    planarRoof(part(parts, 'green'), z.ring, () => z.height);
  });
  return parts;
}

/** The roof-garden trees: one instanced mesh of low-poly crowns, sized and tinted per tree (a seeded set, the same every load). */
export function treeMesh(trees: readonly Tree[]): THREE.InstancedMesh {
  const geometry = new THREE.IcosahedronGeometry(0.5, 0);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: 0xffffff }), trees.length);
  mesh.name = 'kxcentral-trees';
  const r = rng(77);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const axis = new THREE.Vector3(0, 1, 0);
  trees.forEach((t, i) => {
    q.setFromAxisAngle(axis, r() * Math.PI * 2);
    s.set(t.size, t.size * 0.85, t.size);
    p.set(t.x, t.y + 0.5 + t.size * 0.45, t.z); // a trunk's worth above the soil
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    c.setHSL(0.24 + r() * 0.07, 0.42 + r() * 0.12, 0.24 + r() * 0.1);
    mesh.setColorAt(i, c);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

// ---- assembly -----------------------------------------------------------------------------------------------------

export interface KxPlans {
  coal: CoalDropsPlan;
  granary: GranaryComplex;
  gas: GasholderPlan;
  crick: CrickPlan;
  library: LibraryPlan;
  gymnasium: GymnasiumPlan;
  landscraper: LandscraperPlan;
}

export function kxPlans(data: Pick<KxData, 'buildings'>): KxPlans {
  return {
    coal: coalDropsPlan(data),
    granary: granaryComplex(data),
    gas: gasholderPlan(),
    crick: crickPlan(data),
    library: libraryPlan(data),
    gymnasium: gymnasiumPlan(data),
    landscraper: landscraperPlan(data),
  };
}

/** Every landmark's parts, by landmark (the sets `addKxCentral` merges). */
export function kxGeometry(plans: KxPlans): Record<string, PartMap<Key>[]> {
  return {
    coalDrops: [coalDropsGeometry(plans.coal)],
    granary: granaryComplexGeometry(plans.granary),
    gasholders: [gasholderGeometry(plans.gas)],
    crick: [crickGeometry(plans.crick)],
    library: [libraryGeometry(plans.library)],
    gymnasium: [gymnasiumGeometry(plans.gymnasium)],
    landscraper: [landscraperGeometry(plans.landscraper)],
  };
}

export interface KxCentral {
  group: THREE.Group;
  /** OSM building ids replaced: pass them to the city / buildingPrisms() as the exclusion set */
  excludeIds: readonly number[];
  stats: { meshes: number; triangles: number; materials: number; instances: number; byLandmark: Record<string, number> };
  dispose(): void;
}

const triangleCount = (sets: readonly PartMap<Key>[]): number => sets.reduce((n, s) => n + Object.values(s).reduce((m, b) => m + (b as Batch).triangles, 0), 0);

/**
 * Add the landmarks to the scene. In main.ts: call this once after building the scene, and add KXCENTRAL_OSM_IDS (or
 * `kx.excludeIds`) to the set the city / buildingPrisms() leaves out, so the generic boxes for these buildings are not drawn as well.
 */
export function addKxCentral(scene: THREE.Scene, data: KxData): KxCentral {
  const set = createMaterials();
  const plans = kxPlans(data);
  const geometry = kxGeometry(plans);
  const byLandmark: Record<string, number> = {};
  for (const [name, sets] of Object.entries(geometry)) byLandmark[name] = triangleCount(sets);
  const { group, triangles } = mergeParts<Key>(Object.values(geometry).flat(), set.table, 'kxcentral', { roofGlass: 2 });
  const trees = treeMesh(plans.landscraper.trees);
  group.add(trees);
  scene.add(group);
  const geometries: THREE.BufferGeometry[] = [];
  const ownedMaterials: THREE.Material[] = [trees.material as THREE.Material];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) geometries.push(o.geometry);
  });
  const treeTriangles = (trees.geometry.index ? trees.geometry.index.count : trees.geometry.getAttribute('position').count) / 3;
  return {
    group,
    excludeIds: KXCENTRAL_OSM_IDS,
    stats: {
      meshes: group.children.length,
      triangles: triangles + treeTriangles * trees.count,
      materials: Object.keys(set.table).length + 1,
      instances: trees.count,
      byLandmark: { ...byLandmark, trees: treeTriangles * trees.count },
    },
    dispose(): void {
      scene.remove(group);
      for (const g of geometries) g.dispose();
      trees.dispose();
      for (const m of ownedMaterials) m.dispose();
      for (const o of set.owned) o.dispose();
    },
  };
}

export type { Facet };
