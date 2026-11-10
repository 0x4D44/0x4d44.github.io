// Train interiors near the camera. Every train is drawn as an outer skin (train.ts), which from inside is culled away: the car seems to vanish.
// This module watches the camera, and when it is inside a car of a kind with an interior, or within REACH metres of one, it gives that car and
// the train's other cars within SPAN metres (at most MAX_CARS, all of one train) their inside: the fittings (one module a family, loaded on first
// use: train-interior-at300.ts and the rest, FAMILY_INTERIORS) and window openings cut through a private copy of the car's skin
// (train-interior-cut.ts). When the camera moves away they are taken down and their geometry disposed; the car gets its shared skin back. Every
// other train, and every car beyond reach, is drawn exactly as before.
//
// The edge of the reach: a car whose windows are open beside one whose panes are solid is a step the eye catches from a platform. So the reach is
// the span a platform view takes in, and over its last FADE metres each car's outer glass thickens to the car's own pane (its livery's window
// colour, glowing after dark as the panes do: train-geom.ts `plain`), so the last car with an interior looks as its neighbour without one does.
//
// The interior is not a child of the car: trains-live.ts swaps a train's materials when it fades, and the interior keeps its own. It is a
// sibling under the scene that copies the car's world matrix each frame (after the car has been posed, so it never lags it).
import * as THREE from 'three';
import { ALL_KINDS, TRAIN_SPECS, trainLayout } from '../../core/train.ts';
import type { Car, Family, TrainKind, TrainLayout } from '../../core/train.ts';
import { cutOpenings } from './train-interior-cut.ts';
import type { InteriorBuild } from './train-interior-kit.ts';
import { trainNight } from './train-geom.ts';
import { liveryFor } from './train-livery.ts';

export interface InteriorModule {
  buildInterior(kind: TrainKind, car: Car): InteriorBuild;
  setInteriorLight(night?: number): void;
}

/** Each family's interior, a module of its own, loaded the first time a car of the family is in reach. */
export const FAMILY_INTERIORS: Readonly<Record<Family, () => Promise<InteriorModule>>> = {
  at300: () => import('./train-interior-at300.ts'),
  electrostar: () => import('./train-interior-electrostar.ts'),
  desiro: () => import('./train-interior-desiro.ts'),
  desiro700: () => import('./train-interior-desiro700.ts'),
  adelante: () => import('./train-interior-adelante.ts'),
};
/** The kinds with an interior: every kind whose family has one. */
export const INTERIOR_KINDS: ReadonlySet<TrainKind> = new Set<TrainKind>(ALL_KINDS.filter((k) => TRAIN_SPECS[k].family in FAMILY_INTERIORS));
/** A train's interiors come on when the camera is inside one of its cars or within this many metres of its body. */
export const REACH = 3;
/** Then every car of that train within this many metres of the camera has its interior: what a look along a platform takes in. */
export const SPAN = 45;
/** Over the span's last this many metres, a car's outer glass thickens to its own pane's look. */
export const FADE = 20;
/** The camera's near plane while it is inside a car (the page's own is half a metre, which would clip the seat in front). */
export const INSIDE_NEAR = 0.1;
/** At most this many cars have interiors at once, nearest first. */
export const MAX_CARS = 6;
/** Only these meshes of a car are cut (the skin, the panes and doors on it, the lettering). */
const CUT_MESHES = ['body-shell', 'body-detail', 'livery-decals'] as const;
/** How a lit pane glows after dark (train-geom.ts `plain`: the warm glow it adds to a tagged vertex). */
const PANE_GLOW = new THREE.Color(1.0 * 1.1, 0.82 * 1.1, 0.52 * 1.1);

export interface InteriorTrain { kind: TrainKind; group: THREE.Object3D }

interface Active {
  key: string;
  train: THREE.Object3D;
  node: THREE.Object3D;
  build: InteriorBuild;
  /** the car's own (shared) geometry of each cut mesh, to give back */
  swapped: { mesh: THREE.Mesh; original: THREE.BufferGeometry; cut: THREE.BufferGeometry }[];
  /** this car's own copy of the outer glass, and the pane it fades to */
  glass: THREE.MeshLambertMaterial | null;
  fade: number;
}

export interface InteriorOptions {
  scene: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  trains: () => readonly InteriorTrain[];
  /** loads a family's builder; a test passes the modules themselves */
  load?: (family: Family) => Promise<InteriorModule>;
}

const layouts = new Map<TrainKind, TrainLayout>();
const layoutOf = (kind: TrainKind): TrainLayout => {
  let l = layouts.get(kind);
  if (!l) { l = trainLayout(kind); layouts.set(kind, l); }
  return l;
};

/** Distance from a point in a car's own frame to its body (0 inside): x across +-1.4, y 0.9 to 3.4, z between the car's ends. */
export function distanceToCar(local: THREE.Vector3, car: Pick<Car, 'start' | 'end'>): number {
  const dx = Math.max(0, Math.abs(local.x) - 1.35);
  const dy = Math.max(0, 0.9 - local.y, local.y - 3.4);
  const dz = Math.max(0, car.start - local.z, local.z - car.end);
  return Math.hypot(dx, dy, dz);
}

/** How far a car at distance `d` has faded to its own panes: 0 within SPAN - FADE, 1 at SPAN, smooth between. */
export function glassFade(d: number): number {
  const t = Math.min(1, Math.max(0, (d - (SPAN - FADE)) / FADE));
  return t * t * (3 - 2 * t);
}

export function createTrainInteriors(options: InteriorOptions) {
  const { scene, camera } = options;
  const load = options.load ?? ((f: Family): Promise<InteriorModule> => FAMILY_INTERIORS[f]());
  const mods = new Map<Family, InteriorModule>();
  const loading = new Map<Family, Promise<void>>();
  const failed = new Map<Family, string>();
  const active = new Map<string, Active>();
  let pageNear: number | null = null;
  let inside: string | null = null;
  const inverse = new THREE.Matrix4();
  const local = new THREE.Vector3();
  const familyOf = (kind: TrainKind): Family => TRAIN_SPECS[kind].family;

  const release = (a: Active): void => {
    for (const s of a.swapped) { if (s.mesh.geometry === s.cut) s.mesh.geometry = s.original; s.cut.dispose(); }
    scene.remove(a.build.group);
    a.build.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    a.glass?.dispose();
    active.delete(a.key);
  };

  const attach = (key: string, kind: TrainKind, train: THREE.Object3D, node: THREE.Object3D, car: Car): void => {
    const build = mods.get(familyOf(kind))!.buildInterior(kind, car);
    const swapped: Active['swapped'] = [];
    for (const name of CUT_MESHES) {
      const mesh = node.getObjectByName(name) as THREE.Mesh | undefined;
      if (!mesh?.isMesh) continue;
      const cut = cutOpenings(mesh.geometry, build.openings, build.skin - 0.03, build.ends);
      swapped.push({ mesh, original: mesh.geometry, cut });
      mesh.geometry = cut;
    }
    // the outer glass: this car's own copy, in the colour of the car's panes
    const out = build.group.getObjectByName('interior-glass-out') as THREE.Mesh | undefined;
    let glass: THREE.MeshLambertMaterial | null = null;
    if (out) {
      glass = (out.material as THREE.MeshLambertMaterial).clone();
      glass.color.setHex(liveryFor(kind).window);
      out.material = glass;
    }
    build.group.matrixAutoUpdate = false;
    scene.add(build.group);
    active.set(key, { key, train, node, build, swapped, glass, fade: 0 });
  };

  /** Call once a frame, after the trains have been posed and before the render. */
  const frame = (enabled = true): void => {
    // the nearest car within reach picks the train; then that train's cars within the span, nearest first
    let best: { train: InteriorTrain; car: Car; d: number } | null = null;
    const near = new Map<THREE.Object3D, { car: Car; node: THREE.Object3D; d: number }[]>();
    if (enabled) {
      for (const t of options.trains()) {
        if (!INTERIOR_KINDS.has(t.kind) || !t.group.parent) continue;
        const list: { car: Car; node: THREE.Object3D; d: number }[] = [];
        for (const car of layoutOf(t.kind).cars) {
          const node = t.group.getObjectByName(`car-${car.index}`);
          if (!node || !node.visible) continue;
          node.updateWorldMatrix(true, false);
          local.copy(camera.position).applyMatrix4(inverse.copy(node.matrixWorld).invert());
          const d = distanceToCar(local, car);
          list.push({ car, node, d });
          if (d <= REACH && (!best || d < best.d)) best = { train: t, car, d };
        }
        near.set(t.group, list);
      }
    }
    const wanted = new Map<string, { car: Car; node: THREE.Object3D; d: number }>();
    if (best) {
      const list = (near.get(best.train.group) ?? []).filter((c) => c.d <= SPAN).sort((p, q) => p.d - q.d).slice(0, MAX_CARS);
      for (const c of list) wanted.set(`${best.train.group.uuid}:${c.car.index}`, c);
    }
    for (const a of [...active.values()]) if (!wanted.has(a.key) || !a.node.parent || !a.train.parent) release(a);
    const family = best ? familyOf(best.train.kind) : null;
    if (family && wanted.size && !mods.has(family) && !loading.has(family) && !failed.has(family)) {
      loading.set(family, load(family).then((m) => { mods.set(family, m); }, (e: unknown) => { failed.set(family, (e as Error).message ?? String(e)); }).finally(() => { loading.delete(family); }));
    }
    const mod = family ? mods.get(family) : undefined;
    if (mod && best) {
      // one new interior a frame at most, nearest first, so a walk down a train does not stall a frame building several
      for (const [key, w] of wanted) if (!active.has(key)) { attach(key, best.train.kind, best.train.group, w.node, w.car); break; }
      mod.setInteriorLight();
    }
    for (const a of active.values()) {
      a.node.updateWorldMatrix(true, false);
      a.build.group.matrix.copy(a.node.matrixWorld);
      a.build.group.matrixWorldNeedsUpdate = true;
      a.build.group.visible = a.node.visible;
      // toward the span's edge the glass thickens to the car's own pane, glowing after dark as the panes do
      a.fade = glassFade(wanted.get(a.key)?.d ?? SPAN);
      if (a.glass) {
        a.glass.opacity = 0.55 + 0.45 * a.fade;
        a.glass.emissive.copy(PANE_GLOW).multiplyScalar(trainNight.value * a.fade);
        a.glass.depthWrite = a.fade >= 1;
      }
    }
    // inside a car (not merely beside it): the near plane comes in so the seat ahead is not clipped
    const insideKey = best && best.d === 0 ? `${best.train.group.uuid}:${best.car.index}` : null;
    inside = insideKey && active.has(insideKey) ? insideKey : null;
    if (inside && pageNear === null) { pageNear = camera.near; camera.near = INSIDE_NEAR; camera.updateProjectionMatrix(); }
    else if (!inside && pageNear !== null) { camera.near = pageNear; pageNear = null; camera.updateProjectionMatrix(); }
  };

  const stats = () => ({
    loaded: mods.size > 0,
    families: [...mods.keys()],
    failed: failed.size ? Object.fromEntries(failed) : null,
    inside,
    cars: [...active.values()].map((a) => ({ key: a.key, car: a.build.group.userData.car as number, triangles: a.build.triangles,
      draws: a.build.group.children.length, seats: a.build.seats, fade: a.fade })),
  });
  const dispose = (): void => { for (const a of [...active.values()]) release(a); frame(false); };
  /** Resolves once every builder asked for has loaded (or failed); for tests and the capture tools. */
  const ready = async (): Promise<void> => { while (loading.size) await Promise.all(loading.values()); };
  return { frame, stats, dispose, ready };
}
