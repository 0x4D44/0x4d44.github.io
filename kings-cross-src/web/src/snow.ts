// Surface roles that material names cannot express: custom Scottish paving and
// land-use draws, glazed roofs and traffic-cleared carriageways. All numbers are
// assumed retention under the page's forced snowfall, not measured snow depths.
import * as THREE from 'three';
import { ROOF_MESHES } from './cover.ts';
import type { Pt } from '../../core/geo.ts';
import type { Extent } from '../../core/terrain.ts';

export interface SurfaceWeather { dark: number; sheen: number; snow: number; traffic?: number; roof?: boolean; snowOnly?: boolean }
export interface SnowMask { texture: THREE.Texture; rect: THREE.Vector4 }
const open: SurfaceWeather = {dark: .35, sheen: .1, snow: 1, snowOnly: true};
const roof: SurfaceWeather = {dark: 0, sheen: 0, snow: 1.15, roof: true};
const road: SurfaceWeather = {dark: .42, sheen: 1, snow: .08, traffic: 1};
const roofs = new Set([...ROOF_MESHES, 'city-roof', 'perth-west-roofs', 'waverley-central-block-top',
  'perth-island-building-top', 'waverley-roof-strips', 'perth-roof-strips', 'waverley-steps-canopy']);
const paving = new Set(['waverley-platform-surfaces', 'perth-platform-ramps', 'perth-forecourt',
  'perth-forecourt-setts', 'perth-forecourt-markings', 'waverley-ground-cover', 'perth-west-ground-cover', 'perth-west-ground', 'perth-summit-ground',
  'perth-kinnoull-crag', 'perth-kinnoull-canopy', 'perth-summit-gorse', 'city-trees', 'kxcentral-trees',
  'waverley-tree-crowns', 'waverley-wood-crowns', 'perth-west-wood-crowns']);
const mixedRoofs = new Set(['perth-hotel-roofs-and-stone', 'perth-station-front', 'waverley-frontage-structure']);
const roads = new Set(['waverley-bridge-decks', 'perth-bridge-roads']);

/** A mesh role takes precedence over a reused material name (concourseFloor is
 * also Waverley's outdoor platform). The shader still tests normal and cover. */
export function snowSurface(mesh: string, material: string): SurfaceWeather | undefined {
  if (material === 'city-asphalt' || roads.has(mesh)) return road;
  if (roofs.has(mesh) || mixedRoofs.has(mesh) || material === 'city-roof' || (mesh.startsWith('kxcentral-') && mesh !== 'kxcentral-trees')) return roof;
  if (material === 'train-body') return {dark: 0, sheen: 0, snow: .75};
  if (mesh === 'waverley-platform-surfaces') return {dark: .22, sheen: .7, snow: 1};
  if (paving.has(mesh) || material === 'waverley-tree-crowns') return open;
  return undefined;
}

export interface SnowLanduse {
  extent: Extent;
  roads: readonly {width: number; line: readonly Pt[]}[];
  paths?: readonly {width: number; line: readonly Pt[]}[];
  water?: readonly (readonly (readonly Pt[])[])[];
}
/** Retention matches the land-use widths: pedestrian streets (<=4 m) keep snow,
 * lanes hold compacted slush, main carriageways are cleared by traffic. */
export const roadSnow = (width: number): number => width <= 4 ? .95 : width < 7 ? .35 : .08;

/** One small linear mask per land-use draw; red is snow retention, zero is water.
 * It uses the same mapped strokes as the colour canvas, not a colour heuristic.
 * The fetch runs only in snow; no geometry, draws or day/clear shader changes. */
export function snowLanduseMask(land: SnowLanduse, width = 1024): SnowMask | undefined {
  if (typeof document === 'undefined') return undefined;
  const {x0, x1, z0, z1} = land.extent, s = width / (x1 - x0), height = Math.round((z1 - z0) * s);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d'); if (!g) return undefined;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, width, height);
  const point = (p: Pt): Pt => [(p[0] - x0) * s, (p[1] - z0) * s];
  g.fillStyle = '#000000';
  for (const rings of land.water ?? []) {
    g.beginPath();
    for (const ring of rings) { ring.forEach((p, i) => i ? g.lineTo(...point(p)) : g.moveTo(...point(p))); g.closePath(); }
    g.fill('evenodd');
  }
  g.lineCap = g.lineJoin = 'round';
  const stroke = (line: readonly Pt[], metres: number, retention: number) => {
    g.strokeStyle = `rgb(${Math.round(retention * 255)},0,0)`; g.lineWidth = metres * s;
    g.beginPath(); line.forEach((p, i) => i ? g.lineTo(...point(p)) : g.moveTo(...point(p))); g.stroke();
  };
  for (const p of land.paths ?? []) stroke(p.line, p.width, .95);
  for (const r of [...land.roads].sort((a,b) => a.width - b.width)) stroke(r.line, r.width, roadSnow(r.width));
  const texture = new THREE.CanvasTexture(canvas); texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  return {texture, rect: new THREE.Vector4(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0))};
}
