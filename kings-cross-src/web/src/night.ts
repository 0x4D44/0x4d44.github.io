// The lights that come on at dusk: soft halos at the platform lamps, hung under the shed roof, and under the concourse dome.
// Where they go is pure data (`nightLightSites`, testable without a renderer); `createNightLights` makes three additive Points
// draws from it (one per place, a few hundred points in all) and `setLevel` fades them with the sun. The trains' own lamps and
// lit windows are in the train meshes (train-geom.ts `trainNight`), the signals are self-lit already.
import * as THREE from 'three';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { concourseHeight, pointInPolygon, SHED_PLATFORM_REFS, SHED_SPAN_WIDTH, shedToWorld, stationPlatforms, uRangeAtV, worldToShed } from '../../core/station.ts';
import type { ConcourseCanopy, ShedLayout } from '../../core/station.ts';
import type { KxData } from '../../core/osm.ts';
import type { Pt } from '../../core/geo.ts';
import type { ClockDial } from './clocks.ts';
import { FIGURES } from './furniture.ts';
import type { Placement } from './furniture.ts';

export interface NightLightSites {
  /** the lanterns on the platform lamp standards, flat x, y, z (metres) */
  platform: number[];
  /** lights hung under the shed roof, flat x, y, z */
  shed: number[];
  /** the floor pool's radius of each shed light, metres: 0.6 x the spacing along its own row (station-lamps.ts `createPlatformLamps` `poolReach`); left out, the pools keep that rule over all the lights */
  shedReach?: number[];
  /** lights under the concourse dome, flat x, y, z */
  concourse: number[];
}

export interface NightLightInput {
  lamps: readonly Pick<Placement, 'x' | 'z'>[];
  layout: ShedLayout;
  /** the station's platforms: the shed's lights hang over its islands (shedIslands) */
  data: Pick<KxData, 'platforms'>;
  canopy: ConcourseCanopy;
  /** the station building's footprint (the concourse lights stay inside it) */
  footprint: readonly Pt[];
}

/** How far below the roof the shed's lights hang, metres. */
const HANG = 1.8;
/** A row whose line comes within this of a wall under the vaults (the spine, the east arcade: 1.0 m thick, furniture keeps 0.3 m off it) splits across it, metres. */
const WALL_CLEAR = 1.5;
/** How far below the east aisle's flat roof (its underside 0.3 m below the springing, shed.ts) a light over platform 0 hangs, metres. */
const AISLE_HANG = 0.5;
/** A shed light's floor pool reaches this share of the spacing to the next light in its row (the platform lamps' rule, station-lamps.ts). */
const POOL_SHARE = 0.6;

/**
 * The shed's islands, west to east: the platforms under the two vaults (SHED_PLATFORM_REFS) whose faces touch, as the u of the island's middle
 * and of each platform's, averaged along the shed. An island is the platforms either side of no track (0/1, 2/3, 4/5, 6/7, and 8 on its own).
 */
export function shedIslands(data: Pick<KxData, 'platforms'>, layout: ShedLayout): { centre: number; platforms: number[] }[] {
  const all = stationPlatforms(data);
  const spans: [number, number][] = [];
  for (const ref of SHED_PLATFORM_REFS) {
    const p = all.get(ref);
    if (!p) continue;
    let lo = 0, hi = 0, n = 0;
    for (let v = 12; v < layout.length; v += 6) {
      const r = uRangeAtV(layout, p.pts, v);
      if (r) { lo += r[0]; hi += r[1]; n++; }
    }
    if (n > 0) spans.push([lo / n, hi / n]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const islands: [number, number][][] = [];
  for (const s of spans) {
    const last = islands[islands.length - 1];
    if (last && s[0] - last[last.length - 1]![1] < 1) last.push(s); else islands.push([s]);
  }
  return islands.map((ps) => ({ centre: (ps[0]![0] + ps[ps.length - 1]![1]) / 2, platforms: ps.map(([lo, hi]) => (lo + hi) / 2) }));
}

export function nightLightSites({ lamps, layout, data, canopy, footprint }: NightLightInput): NightLightSites {
  const platform: number[] = [];
  for (const lamp of lamps) platform.push(lamp.x, PLATFORM_HEIGHT + FIGURES.lampHeight - 0.14, lamp.z);

  // One row over each island under the vaults, a light every second rib (12.2 m), hung below the vault above it. A row that would meet a
  // wall zig-zags across it, a light over each platform under the vaults in turn (4/5, either side of the spine); a platform beyond the
  // vaults (0, in the east aisle beyond the east arcade) gets a row of its own under the aisle roof, off the wall, and its neighbour (1)
  // keeps its row over its own middle, so both track-side edges are in a pool (the 0/1 island is 11.5 m across, too wide for one row).
  const shed: number[] = [];
  const shedReach: number[] = [];
  const radius = SHED_SPAN_WIDTH / 2;
  const underVault = (u: number): boolean => u > 0 && u < layout.spine + radius * 2;
  const walls = [layout.spine, layout.spine + 2 * radius];
  const rows: { line: number[]; aisle: boolean }[] = [];
  for (const island of shedIslands(data, layout)) {
    const wall = walls.find((w) => Math.abs(island.centre - w) < WALL_CLEAR);
    if (wall === undefined) { rows.push({ line: [island.centre], aisle: false }); continue; }
    const vault = island.platforms.filter(underVault), beyond = island.platforms.filter((u) => !underVault(u));
    rows.push({ line: vault.length ? vault : [wall + Math.sign(island.centre - wall || -1) * WALL_CLEAR], aisle: false });
    if (beyond.length) rows.push({ line: beyond.map((u) => Math.max(u, wall + WALL_CLEAR)), aisle: true });
  }
  for (const { line, aisle } of rows) {
    const row: [number, number, number][] = [];
    let k = 0;
    for (let v = 6.1; v < layout.length - 6; v += 12.2, k++) {
      const u = line[k % line.length]!;
      if (aisle ? !(u < layout.width) : !underVault(u)) continue;
      const off = u - (u < layout.spine ? layout.spine - radius : layout.spine + radius);
      const [x, z] = shedToWorld(layout, u, v);
      row.push([x, aisle ? layout.springing - 0.3 - AISLE_HANG : layout.springing + Math.sqrt(radius * radius - off * off) - HANG, z]);
    }
    row.forEach(([x, y, z], i) => {
      const next = Math.min(...row.filter((_, j) => j !== i).map(([qx, , qz]) => Math.hypot(qx - x, qz - z)));
      shed.push(x, y, z);
      shedReach.push(Math.min(10, POOL_SHARE * next));
    });
  }

  // Rings of lights under the dome, kept to the footprint west of the shed.
  const concourse: number[] = [];
  for (const share of [0.3, 0.55, 0.8]) {
    const r = canopy.radius * share;
    const n = Math.max(6, Math.round((2 * Math.PI * r) / 14));
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const p: Pt = [canopy.centre[0] + r * Math.cos(a), canopy.centre[1] + r * Math.sin(a)];
      if (!pointInPolygon(p, footprint as Pt[]) || worldToShed(layout, p).u > -1) continue;
      concourse.push(p[0], concourseHeight(canopy, r) - 1.2, p[1]);
    }
  }
  return { platform, shed, shedReach, concourse };
}

let halo: THREE.Texture | null | undefined;
/** A soft round glow: white in the middle, clear at the edge. Null where there is no canvas (Node). */
export function haloTexture(): THREE.Texture | null {
  if (halo !== undefined) return halo;
  halo = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.18, 'rgba(255,255,255,0.7)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      halo = new THREE.CanvasTexture(c);
      halo.colorSpace = THREE.SRGBColorSpace;
    }
  }
  return halo;
}

/** Something else that comes on at dusk and goes out at dawn: the street lamps, which are built when the city arrives (streetlights.ts). */
export interface NightLayer {
  /** 0 (off) to 1 (full) */
  setLevel(level: number): void;
}

export interface NightLights {
  group: THREE.Group;
  /** 0 (off) to 1 (full); the halos are hidden at 0 */
  setLevel(level: number): void;
  /** Hand a layer the level from now on (and at once): the city's lamps arrive after the first frame. The function returned stops it (the city is gone). */
  attach(layer: NightLayer): () => void;
  counts(): { platform: number; shed: number; concourse: number };
  dispose(): void;
}

export function createNightLights(sites: NightLightSites): NightLights {
  const group = new THREE.Group();
  group.name = 'night-lights';
  const layers: { points: THREE.Points; material: THREE.PointsMaterial; strength: number }[] = [];
  const add = (name: string, flat: number[], colour: number, size: number, strength: number): void => {
    if (flat.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3));
    const material = new THREE.PointsMaterial({ color: colour, size, sizeAttenuation: true, map: haloTexture(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(geometry, material);
    points.name = name;
    points.visible = false;
    points.frustumCulled = false;
    points.renderOrder = 5;
    group.add(points);
    layers.push({ points, material, strength });
  };
  let level = 0;
  const attached: NightLayer[] = [];
  add('lights-platform', sites.platform, 0xffd9a0, 7, 0.95);
  add('lights-shed', sites.shed, 0xffe2b0, 13, 0.55);
  add('lights-concourse', sites.concourse, 0xffe6bc, 11, 0.6);
  return {
    group,
    setLevel(next) {
      level = Math.min(1, Math.max(0, next));
      for (const layer of layers) {
        layer.material.opacity = level * layer.strength;
        layer.points.visible = level > 0.01;
      }
      for (const layer of attached) layer.setLevel(level);
    },
    attach(layer) {
      attached.push(layer);
      layer.setLevel(level);
      return () => {
        const i = attached.indexOf(layer);
        if (i >= 0) attached.splice(i, 1);
      };
    },
    counts: () => ({ platform: sites.platform.length / 3, shed: sites.shed.length / 3, concourse: sites.concourse.length / 3 }),
    dispose() {
      for (const layer of layers) { layer.points.geometry.dispose(); layer.material.dispose(); }
      attached.length = 0;
    },
  };
}

/**
 * What a lit clock dial adds to its face, in display colours (the glow is left out of the tone map): the face's own cream, scaled up to the bright white of the photographs. MEASURED, in
 * night-a-kx-square-2015-skinner.jpg the tower's two dials have a median of (250, 250, 248) and (250, 250, 250) over a 20 x 20 px patch of each, their brightest pixels 255 (the Balmoral's, in
 * night-f-waverley-balmoral-2023-crowsus.jpg, is (247, 244, 234)); this model's, added to the blue-grey the night sky leaves on the unlit face (about (63, 78, 109)), is (255, 255, 255) over the brighter half
 * of the face (capture of 10 November: tower-close, south-front, front-oblique). A stronger glow would only clip.
 */
export const DIAL_GLOW: readonly [number, number, number] = [1.06, 1.1, 1.2];
/** A disc this near a dial's declared centre (clocks.ts `ClockDial`) is that dial's face, metres. */
export const DIAL_REACH = 0.05;
/** A dial's glow stands this far off its face, metres: under the hands (clocks.ts `HANDS`, 4 cm and 8 cm off the face), over the face by more than the depth buffer tells apart from far off. */
export const DIAL_LIFT = 0.02;

export interface DialLights extends NightLayer {
  /** Give a glow to every dial face under `root` that has none yet; how many were added. A scene's dials arrive after the first frame (the landmarks), so this is called again as they do. */
  scan(root: THREE.Object3D): number;
  /** How many dials have a glow. */
  count(): number;
  /** Take the glows out of the scene and give their materials back. */
  dispose(): void;
}

/**
 * The clock dials that a building declares (`userData.clockDials`, clocks.ts) and draws as a Lambert disc (the King's Cross tower's: shed.ts; the Midland's is a MeshBasicMaterial, bright by day and by
 * night, and the Balmoral's is flooded, station-weather.ts), lit white after dark (round seven, the E4 scorer: "the King's Cross clock dials do not glow; they are the same grey face"). Each gets a second
 * disc standing a hand's breadth off it, with the face's own texture, added to the picture and scaled by the lamps' level: the numerals and ticks stay dark, the cream goes white. The face's material is not
 * touched (it stays what the sun and the sky light, and the atmosphere's stand-ins do not see a glow), and by day the discs are hidden, so the noon picture and the noon programs are what they were.
 */
export function createDialLights(): DialLights {
  const glows = new Map<THREE.Mesh, THREE.Mesh>(); // a face to its glow
  const materials = new Map<THREE.Texture | null, THREE.MeshBasicMaterial>(); // a glow material for each face texture (and glow scale: a face may cap its glow, see below)
  const scaled = new Map<string, THREE.MeshBasicMaterial>();
  let level = 0;
  const show = (): void => {
    for (const material of [...materials.values(), ...scaled.values()]) material.color.setRGB(...DIAL_GLOW).multiplyScalar(level * ((material.userData.glowScale as number | undefined) ?? 1));
    for (const glow of glows.values()) glow.visible = level > 0.01;
  };
  const glowMaterial = (map: THREE.Texture | null, scale = 1): THREE.MeshBasicMaterial => {
    const key = `${map?.uuid ?? 'none'}:${scale}`;
    let material = scale === 1 ? materials.get(map) : scaled.get(key);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      material.userData.glowScale = scale;
      if (scale === 1) materials.set(map, material);
      else scaled.set(key, material);
    }
    return material;
  };
  return {
    setLevel(next) {
      level = Math.max(0, Math.min(1, next));
      show();
    },
    scan(root) {
      root.updateMatrixWorld(true);
      const centre = new THREE.Vector3();
      const at = new THREE.Vector3();
      const faces: THREE.Mesh[] = [];
      root.traverse((owner) => {
        for (const dial of (owner.userData.clockDials ?? []) as ClockDial[]) {
          owner.localToWorld(centre.set(...dial.centre));
          owner.traverse((o) => {
            const face = o as THREE.Mesh;
            if (!face.isMesh || !(face.material as THREE.MeshLambertMaterial).isMeshLambertMaterial || face.geometry.type !== 'CircleGeometry') return;
            if (!glows.has(face) && !faces.includes(face) && face.getWorldPosition(at).distanceTo(centre) <= DIAL_REACH) faces.push(face);
          });
        }
      });
      for (const face of faces) {
        // a face may give its glow a mask (shed.ts clockMaterial: the field lit, the bezel dark), else its own texture
        const material = face.material as THREE.MeshLambertMaterial;
        // round 15: a face may cap its glow (`glowScale`, shed.ts buildPlatformClock), so its lit field stays under clipping and the ring of numerals survives
        const glow = new THREE.Mesh(face.geometry, glowMaterial((material.userData.glowMap as THREE.Texture | undefined) ?? material.map, (material.userData.glowScale as number | undefined) ?? 1));
        glow.name = 'clock-dial-glow';
        glow.position.copy(face.position);
        glow.quaternion.copy(face.quaternion);
        glow.scale.copy(face.scale);
        glow.translateZ(DIAL_LIFT);
        glow.renderOrder = 6;
        face.parent?.add(glow);
        glows.set(face, glow);
      }
      show();
      return faces.length;
    },
    count: () => glows.size,
    dispose() {
      for (const glow of glows.values()) glow.removeFromParent();
      for (const material of [...materials.values(), ...scaled.values()]) material.dispose();
      glows.clear();
      materials.clear();
      scaled.clear();
    },
  };
}
