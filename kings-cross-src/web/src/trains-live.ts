// The motion core owns occupied track. Each car follows its own two bogie samples, so
// coaches articulate through points instead of rotating one rigid 234 m train.
import * as THREE from 'three';
import type { Graph } from '../../core/graph.ts';
import type { Pt } from '../../core/geo.ts';
import type { TrainView } from '../../core/motion.ts';
import { trainLayout } from '../../core/train.ts';
import type { Car, TrainKind, TrainLayout } from '../../core/train.ts';
import { buildTrain } from './train.ts';

export const COUPLING_CLEARANCE = 0.35; // Per body end, inside the layout's coupling-inclusive length.
export const kindForDescription = (description: string): TrainKind => description[0] === '1' ? 'lner9' : 'lner5';
const layouts = new Map<TrainKind, TrainLayout>();
export function layoutForDescription(description: string): TrainLayout {
  const kind = kindForDescription(description);
  if (!layouts.has(kind)) layouts.set(kind, trainLayout(kind));
  return layouts.get(kind)!;
}
export const lengthForDescription = (description: string): number => layoutForDescription(description).length;

export interface TrailSample { point: Pt; back: Pt }
export interface CarPose {
  car: Car;
  frontBogie: TrailSample;
  rearBogie: TrailSample;
  position: Pt;
  rotationY: number;
  scaleZ: number;
}

/** Walk from the leading end back over the core's tail-to-nose intervals. Never invent track. */
export function sampleOccupied(graph: Graph, train: TrainView, behindM: number): TrailSample | null {
  if (!Number.isFinite(behindM) || behindM < 0) return null;
  let left = behindM;
  for (let i = train.occupied.length - 1; i >= 0; i--) {
    const s = train.occupied[i]!;
    const length = Math.abs(s.toT - s.fromT) * s.edge.length;
    if (length < 1e-9) continue;
    if (left <= length + 1e-8) {
      const t = s.toT + (s.fromT - s.toT) * Math.min(1, left / length);
      const a = graph.pos.get(s.edge.a)!, b = graph.pos.get(s.edge.b)!;
      const sign = Math.sign(s.fromT - s.toT);
      return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], back: [(b[0] - a[0]) * sign / s.edge.length, (b[1] - a[1]) * sign / s.edge.length] };
    }
    left -= length;
  }
  return null;
}

export function carPoses(graph: Graph, train: TrainView, layout = layoutForDescription(train.description)): CarPose[] {
  const poses: CarPose[] = [];
  for (const car of layout.cars) {
    // A first observation at the model boundary may not have a full train's track behind it.
    if (car.end > train.occupiedLengthM + 1e-7) continue;
    const frontBogie = sampleOccupied(graph, train, car.bogies[0]);
    const rearBogie = sampleOccupied(graph, train, car.bogies[1]);
    if (!frontBogie || !rearBogie) continue;
    const dx = rearBogie.point[0] - frontBogie.point[0], dz = rearBogie.point[1] - frontBogie.point[1];
    const chord = Math.hypot(dx, dz);
    if (chord < 1e-8) continue;
    const scaleZ = chord / (car.bogies[1] - car.bogies[0]);
    poses.push({ car, frontBogie, rearBogie, rotationY: Math.atan2(dx, dz), scaleZ,
      position: [frontBogie.point[0] - dx / chord * scaleZ * car.bogies[0], frontBogie.point[1] - dz / chord * scaleZ * car.bogies[0]],
    });
  }
  return poses;
}

export interface DrawnTrain {
  description: string;
  kind: TrainKind;
  group: THREE.Group;
  noseWorld: [number, number, number];
  headingRad: number;
}

export function createLiveTrains(graph: Graph, parent: THREE.Object3D) {
  const templates = new Map<TrainKind, THREE.Group>();
  const drawn = new Map<string, DrawnTrain>();
  const ownedMaterials = new Map<string, THREE.Material[]>();
  const build = (description: string): DrawnTrain => {
    const kind = kindForDescription(description), layout = layoutForDescription(description);
    if (!templates.has(kind)) templates.set(kind, buildTrain(kind));
    const group = templates.get(kind)!.clone(true);
    const copies = new Map<THREE.Material, THREE.Material>();
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const copy = (m: THREE.Material): THREE.Material => { if (!copies.has(m)) copies.set(m, m.clone()); return copies.get(m)!; };
      o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
    });
    ownedMaterials.set(description, [...copies.values()]);
    // Car lengths include couplings. Leave a visible clearance in the body meshes, while
    // preserving bogie positions, car pitch, the front nose and the train's full length.
    for (const car of layout.cars) {
      const node = group.getObjectByName(`car-${car.index}`)!;
      const front = car.index === 0 ? 0 : COUPLING_CLEARANCE;
      const rear = car.index === layout.cars.length - 1 ? 0 : COUPLING_CLEARANCE;
      for (const name of ['body-shell', 'body-detail']) {
        const mesh = node.getObjectByName(name)!;
        mesh.scale.z = (car.length - front - rear) / car.length;
        mesh.position.z = car.start * (1 - mesh.scale.z) + front;
      }
    }
    group.userData.description = description;
    parent.add(group);
    const record: DrawnTrain = { description, kind, group, noseWorld: [0, 0, 0], headingRad: 0 };
    drawn.set(description, record);
    return record;
  };
  const remove = (id: string): void => {
    const t = drawn.get(id);
    if (!t) return;
    parent.remove(t.group); drawn.delete(id);
    for (const material of ownedMaterials.get(id) ?? []) material.dispose();
    ownedMaterials.delete(id);
  };
  const update = (views: readonly TrainView[]): void => {
    const present = new Set(views.map((t) => t.description));
    for (const id of drawn.keys()) if (!present.has(id)) remove(id);
    for (const view of views) {
      const t = drawn.get(view.description) ?? build(view.description);
      t.noseWorld = [view.leading.point[0], 0, view.leading.point[1]]; t.headingRad = view.heading;
      const poses = carPoses(graph, view);
      for (const node of t.group.children) node.visible = false;
      for (const pose of poses) {
        const node = t.group.getObjectByName(`car-${pose.car.index}`)!;
        node.visible = true;
        node.position.set(pose.position[0], 0, pose.position[1]);
        node.rotation.y = pose.rotationY; node.scale.set(1, 1, pose.scaleZ);
        for (const [k, sample] of [pose.frontBogie, pose.rearBogie].entries()) {
          const bogie = node.getObjectByName(`bogie-${pose.car.index}-${k}`)!;
          bogie.rotation.y = Math.atan2(sample.back[0], sample.back[1]) - pose.rotationY;
        }
      }
      for (const material of ownedMaterials.get(view.description) ?? []) {
        const transparent = view.opacity < 1;
        if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
        material.opacity = view.opacity; material.depthWrite = !transparent;
      }
    }
  };
  const dispose = (): void => {
    for (const id of [...drawn.keys()]) remove(id);
    const geometries = new Set<THREE.BufferGeometry>();
    for (const template of templates.values()) template.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') geometries.add(o.geometry);
    });
    for (const g of geometries) g.dispose();
    // Bogie geometry and original materials are train.ts caches shared with static samples.
    templates.clear();
  };
  return { update, trains: (): DrawnTrain[] => [...drawn.values()], dispose };
}
