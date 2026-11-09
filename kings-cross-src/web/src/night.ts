// The lights that come on at dusk: soft halos at the platform lamps, hung under the shed roof, and under the concourse dome.
// Where they go is pure data (`nightLightSites`, testable without a renderer); `createNightLights` makes three additive Points
// draws from it (one per place, a few hundred points in all) and `setLevel` fades them with the sun. The trains' own lamps and
// lit windows are in the train meshes (train-geom.ts `trainNight`), the signals are self-lit already.
import * as THREE from 'three';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { concourseHeight, pointInPolygon, SHED_SPAN_WIDTH, shedToWorld, worldToShed } from '../../core/station.ts';
import type { ConcourseCanopy, ShedLayout } from '../../core/station.ts';
import type { Pt } from '../../core/geo.ts';
import { FIGURES } from './furniture.ts';
import type { Placement } from './furniture.ts';

export interface NightLightSites {
  /** the lanterns on the platform lamp standards, flat x, y, z (metres) */
  platform: number[];
  /** lights hung under the shed roof, flat x, y, z */
  shed: number[];
  /** lights under the concourse dome, flat x, y, z */
  concourse: number[];
}

export interface NightLightInput {
  lamps: readonly Pick<Placement, 'x' | 'z'>[];
  layout: ShedLayout;
  canopy: ConcourseCanopy;
  /** the station building's footprint (the concourse lights stay inside it) */
  footprint: readonly Pt[];
}

/** How far below the roof the shed's lights hang, metres. */
const HANG = 1.8;

export function nightLightSites({ lamps, layout, canopy, footprint }: NightLightInput): NightLightSites {
  const platform: number[] = [];
  for (const lamp of lamps) platform.push(lamp.x, PLATFORM_HEIGHT + FIGURES.lampHeight - 0.14, lamp.z);

  // Two rows under each of the shed's two vaults, a light every second rib (12.2 m), 8 m either side of the vault's crown line.
  const shed: number[] = [];
  const radius = SHED_SPAN_WIDTH / 2;
  for (const uc of [layout.aisle + radius, layout.aisle + 3 * radius]) {
    for (const offset of [-8, 8]) {
      const y = layout.springing + Math.sqrt(radius * radius - offset * offset) - HANG;
      for (let v = 6.1; v < layout.length - 6; v += 12.2) {
        const [x, z] = shedToWorld(layout, uc + offset, v);
        shed.push(x, y, z);
      }
    }
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
  return { platform, shed, concourse };
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
