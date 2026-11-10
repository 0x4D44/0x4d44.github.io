// Train interiors near the camera. Every train is drawn as an outer skin (train.ts), which from inside is culled away: the car seems to vanish.
// This module watches the camera, and when it is inside a car of a kind with an interior, or within REACH metres of one, it gives that car and
// its neighbours (at most MAX_CARS, all of one train) their inside: the fittings (train-interior-at300.ts, loaded on first use) and window
// openings cut through a private copy of the car's skin (train-interior-cut.ts). When the camera moves away they are taken down and their
// geometry disposed; the car gets its shared skin back. Every other train, and every car beyond reach, is drawn exactly as before.
//
// The interior is not a child of the car: trains-live.ts swaps a train's materials when it fades, and the interior keeps its own. It is a
// sibling under the scene that copies the car's world matrix each frame (after the car has been posed, so it never lags it).
import * as THREE from 'three';
import { trainLayout } from '../../core/train.ts';
import type { Car, TrainKind, TrainLayout } from '../../core/train.ts';
import { cutOpenings } from './train-interior-cut.ts';
import type { InteriorBuild } from './train-interior-at300.ts';

/** The kinds with an interior: the Azuma family, whose cars share one body. */
export const INTERIOR_KINDS: ReadonlySet<TrainKind> = new Set<TrainKind>(['lner5', 'lner9', 'hull5', 'lumo5']);
/** A car gets its interior when the camera is inside it or within this many metres of its body. */
export const REACH = 3;
/** The camera's near plane while it is inside a car (the page's own is half a metre, which would clip the seat in front). */
export const INSIDE_NEAR = 0.1;
/** At most this many cars have interiors at once: the nearest and its two neighbours. */
export const MAX_CARS = 3;
/** Only these meshes of a car are cut (the skin, the panes and doors on it, the lettering). */
const CUT_MESHES = ['body-shell', 'body-detail', 'livery-decals'] as const;

export interface InteriorModule {
  buildInterior(kind: TrainKind, car: Car): InteriorBuild;
  setInteriorLight(night?: number): void;
  SKIN: number;
}

export interface InteriorTrain { kind: TrainKind; group: THREE.Object3D }

interface Active {
  key: string;
  train: THREE.Object3D;
  node: THREE.Object3D;
  build: InteriorBuild;
  /** the car's own (shared) geometry of each cut mesh, to give back */
  swapped: { mesh: THREE.Mesh; original: THREE.BufferGeometry; cut: THREE.BufferGeometry }[];
}

export interface InteriorOptions {
  scene: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  trains: () => readonly InteriorTrain[];
  /** loads the builder; a test passes the module itself */
  load?: () => Promise<InteriorModule>;
}

const layouts = new Map<TrainKind, TrainLayout>();
const layoutOf = (kind: TrainKind): TrainLayout => {
  let l = layouts.get(kind);
  if (!l) { l = trainLayout(kind); layouts.set(kind, l); }
  return l;
};

/** Distance from a point in a car's own frame to its body (0 inside): x across +-1.35, y 0.9 to 3.4, z between the car's ends. */
export function distanceToCar(local: THREE.Vector3, car: Pick<Car, 'start' | 'end'>): number {
  const dx = Math.max(0, Math.abs(local.x) - 1.35);
  const dy = Math.max(0, 0.9 - local.y, local.y - 3.4);
  const dz = Math.max(0, car.start - local.z, local.z - car.end);
  return Math.hypot(dx, dy, dz);
}

export function createTrainInteriors(options: InteriorOptions) {
  const { scene, camera } = options;
  const load = options.load ?? ((): Promise<InteriorModule> => import('./train-interior-at300.ts'));
  let mod: InteriorModule | null = null;
  let loading: Promise<void> | null = null;
  let failed: string | null = null;
  const active = new Map<string, Active>();
  let pageNear: number | null = null;
  let inside: { key: string; distance: number } | null = null;
  const inverse = new THREE.Matrix4();
  const local = new THREE.Vector3();

  const release = (a: Active): void => {
    for (const s of a.swapped) { if (s.mesh.geometry === s.cut) s.mesh.geometry = s.original; s.cut.dispose(); }
    scene.remove(a.build.group);
    a.build.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    active.delete(a.key);
  };

  const attach = (key: string, kind: TrainKind, train: THREE.Object3D, node: THREE.Object3D, car: Car): void => {
    const build = mod!.buildInterior(kind, car);
    const swapped: Active['swapped'] = [];
    for (const name of CUT_MESHES) {
      const mesh = node.getObjectByName(name) as THREE.Mesh | undefined;
      if (!mesh?.isMesh) continue;
      const cut = cutOpenings(mesh.geometry, build.openings, mod!.SKIN - 0.03);
      swapped.push({ mesh, original: mesh.geometry, cut });
      mesh.geometry = cut;
    }
    build.group.matrixAutoUpdate = false;
    scene.add(build.group);
    active.set(key, { key, train, node, build, swapped });
  };

  /** Call once a frame, after the trains have been posed and before the render. */
  const frame = (enabled = true): void => {
    // which cars want an interior: the nearest car within reach and its neighbours, of one train
    let best: { train: InteriorTrain; car: Car; d: number } | null = null;
    if (enabled) {
      for (const t of options.trains()) {
        if (!INTERIOR_KINDS.has(t.kind) || !t.group.parent) continue;
        for (const car of layoutOf(t.kind).cars) {
          const node = t.group.getObjectByName(`car-${car.index}`);
          if (!node || !node.visible) continue;
          node.updateWorldMatrix(true, false);
          local.copy(camera.position).applyMatrix4(inverse.copy(node.matrixWorld).invert());
          const d = distanceToCar(local, car);
          if (d <= REACH && (!best || d < best.d)) best = { train: t, car, d };
        }
      }
    }
    const wanted = new Map<string, { car: Car; node: THREE.Object3D }>();
    if (best) {
      const cars = layoutOf(best.train.kind).cars;
      for (const c of cars) {
        if (Math.abs(c.index - best.car.index) > (MAX_CARS - 1) / 2) continue;
        const node = best.train.group.getObjectByName(`car-${c.index}`);
        if (node?.visible) wanted.set(`${best.train.group.uuid}:${c.index}`, { car: c, node });
      }
    }
    for (const a of [...active.values()]) if (!wanted.has(a.key) || !a.node.parent || !a.train.parent) release(a);
    if (wanted.size && !mod && !loading && !failed) {
      loading = load().then((m) => { mod = m; }, (e: unknown) => { failed = (e as Error).message ?? String(e); }).finally(() => { loading = null; });
    }
    if (mod && best) {
      // one new interior a frame at most, nearest first, so a walk down a train does not stall a frame building three
      const order = [...wanted.entries()].sort((p, q) => Math.abs(p[1].car.index - best!.car.index) - Math.abs(q[1].car.index - best!.car.index));
      for (const [key, w] of order) if (!active.has(key)) { attach(key, best.train.kind, best.train.group, w.node, w.car); break; }
      mod.setInteriorLight();
    }
    for (const a of active.values()) {
      a.node.updateWorldMatrix(true, false);
      a.build.group.matrix.copy(a.node.matrixWorld);
      a.build.group.matrixWorldNeedsUpdate = true;
      a.build.group.visible = a.node.visible;
    }
    // inside a car (not merely beside it): the near plane comes in so the seat ahead is not clipped
    const nowInside = best !== null && best.d === 0 && active.has(`${best.train.group.uuid}:${best.car.index}`);
    inside = nowInside && best ? { key: `${best.train.group.uuid}:${best.car.index}`, distance: 0 } : null;
    if (nowInside && pageNear === null) { pageNear = camera.near; camera.near = INSIDE_NEAR; camera.updateProjectionMatrix(); }
    else if (!nowInside && pageNear !== null) { camera.near = pageNear; pageNear = null; camera.updateProjectionMatrix(); }
  };

  const stats = () => ({
    loaded: mod !== null, failed,
    inside: inside?.key ?? null,
    cars: [...active.values()].map((a) => ({ key: a.key, car: a.build.group.userData.car as number, triangles: a.build.triangles,
      draws: a.build.group.children.length, seats: a.build.layout.seats.length })),
  });
  const dispose = (): void => { for (const a of [...active.values()]) release(a); frame(false); };
  /** Resolves once the builder has loaded (or failed); for tests and the capture tools. */
  const ready = async (): Promise<void> => { while (loading) await loading; };
  return { frame, stats, dispose, ready };
}
