// The motion core owns occupied track. Each car follows its own two bogie samples, so
// coaches articulate through points instead of rotating one rigid 234 m train.
import * as THREE from 'three';
import type { Graph } from '../../core/graph.ts';
import type { Pt } from '../../core/geo.ts';
import type { MotionBirth, TrainView } from '../../core/motion.ts';
import type { ScheduleCall } from '../../core/schedule.ts';
import { ALL_KINDS, TRAIN_SPECS, trainLayout } from '../../core/train.ts';
import type { Car, TrainKind, TrainLayout } from '../../core/train.ts';
import { buildTrain, END_GAP } from './train.ts';

/** Per body end, inside the layout's coupling-inclusive length: train.ts insets each body by this. */
export const COUPLING_CLEARANCE = END_GAP;
export const kindForDescription = (description: string): TrainKind => description[0] === '1' ? 'lner9' : 'lner5';
const layouts = new Map<TrainKind, TrainLayout>();
function layoutForKind(kind: TrainKind): TrainLayout {
  if (!layouts.has(kind)) layouts.set(kind, trainLayout(kind));
  return layouts.get(kind)!;
}
export const layoutForDescription = (description: string): TrainLayout => layoutForKind(kindForDescription(description));
export const lengthForDescription = (description: string): number => layoutForDescription(description).length;

type OperatorService = Pick<ScheduleCall, 'operator' | 'origin' | 'destination'>;
/** Formation length is evidence only within an operator's fleet: a 717 is almost
 * the length of a five-car Azuma. Read the catalogue so new 700/180 kinds slot in. */
export function kindForService(service: OperatorService | undefined, lengthM: number): TrainKind | undefined {
  if (!service) return undefined;
  const moorgate = [service.origin, service.destination].some(s => /^(?:MORGATE|MOORGATE)$/i.test(s.trim()));
  const candidates = ALL_KINDS.filter(kind => {
    const spec = TRAIN_SPECS[kind];
    switch (service.operator) {
      case 'GR': return spec.operator === 'LNER';
      case 'HT': return spec.operator === 'Hull Trains';
      case 'LD': return spec.operator === 'Lumo';
      case 'GN': return spec.operator === 'Great Northern' && new RegExp(moorgate ? '717' : '387').test(spec.classes);
      case 'TL': return spec.operator === 'Thameslink' && /700/.test(spec.classes);
      case 'GC': return spec.operator === 'Grand Central' && /180/.test(spec.classes);
      default: return false;
    }
  });
  // Unsupported fleets retain the legacy headcode fallback until their kind exists.
  return candidates.reduce<TrainKind | undefined>((best, kind) => best === undefined ||
    Math.abs(layoutForKind(kind).length - lengthM) < Math.abs(layoutForKind(best).length - lengthM) ? kind : best, undefined);
}

/** One resolver per motion instance: both motion and drawing consume its birth choice. Late timetable loads apply
 * to future physical trains; renaming or updating a visible train cannot resize it. */
export function createTrainKinds(serviceFor: (description: string, atTime: number) => OperatorService | undefined) {
  const born = new Map<number, TrainKind>();
  return {
    lengthM(description: string, birth: MotionBirth): number {
      const kind = born.get(birth.id) ?? kindForService(serviceFor(description, birth.timeMs), lengthForDescription(description)) ?? kindForDescription(description);
      born.set(birth.id, kind);
      return layoutForKind(kind).length;
    },
    kindFor(view: TrainView): TrainKind | undefined { return born.get(view.id); },
  };
}

/** Legacy fallback without timetable evidence; compare only the two LNER lengths. */
export function layoutForLength(lengthM: number): TrainLayout {
  const short = layoutForKind('lner5'), long = layoutForKind('lner9');
  return Math.abs(lengthM - long.length) <= Math.abs(lengthM - short.length) ? long : short;
}

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

export function carPoses(graph: Graph, train: TrainView, layout = layoutForLength(train.lengthM)): CarPose[] {
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
  readonly id: number;
  description: string;
  readonly kind: TrainKind;
  readonly layout: TrainLayout;
  readonly group: THREE.Group;
  noseWorld: [number, number, number];
  headingRad: number;
}

export function createLiveTrains(graph: Graph, parent: THREE.Object3D, kindFor?: (view: TrainView) => TrainKind | undefined) {
  const templates = new Map<TrainKind, THREE.Group>();
  const drawn = new Map<number, DrawnTrain>();
  const ownedMaterials = new Map<number, THREE.Material[]>();
  const build = (view: TrainView): DrawnTrain => {
    const resolvedKind = kindFor?.(view);
    const layout = resolvedKind === undefined ? layoutForLength(view.lengthM) : layoutForKind(resolvedKind), kind = layout.spec.kind;
    if (!templates.has(kind)) templates.set(kind, buildTrain(kind));
    const group = templates.get(kind)!.clone(true);
    const copies = new Map<THREE.Material, THREE.Material>();
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const copy = (m: THREE.Material): THREE.Material => { if (!copies.has(m)) copies.set(m, m.clone()); return copies.get(m)!; };
      o.material = Array.isArray(o.material) ? o.material.map(copy) : copy(o.material);
    });
    ownedMaterials.set(view.id, [...copies.values()]);
    // Car lengths include couplings. train.ts already stops each body END_GAP short of its car
    // end and fills the gap with gangway bellows and couplers, so no rescale here.
    group.userData.id = view.id;
    parent.add(group);
    const record: DrawnTrain = { id: view.id, description: view.description, kind, layout, group, noseWorld: [0, 0, 0], headingRad: 0 };
    drawn.set(view.id, record);
    return record;
  };
  const remove = (id: number): void => {
    const t = drawn.get(id);
    if (!t) return;
    parent.remove(t.group); drawn.delete(id);
    for (const material of ownedMaterials.get(id) ?? []) material.dispose();
    ownedMaterials.delete(id);
  };
  const update = (views: readonly TrainView[]): void => {
    const present = new Set(views.map((t) => t.id));
    for (const id of drawn.keys()) if (!present.has(id)) remove(id);
    for (const view of views) {
      const t = drawn.get(view.id) ?? build(view);
      t.description = view.description; t.group.userData.description = view.description;
      t.noseWorld = [view.leading.point[0], 0, view.leading.point[1]]; t.headingRad = view.heading;
      const poses = carPoses(graph, view, t.layout);
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
      for (const material of ownedMaterials.get(view.id) ?? []) {
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
