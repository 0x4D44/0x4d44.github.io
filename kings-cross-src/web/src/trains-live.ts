// The motion core owns occupied track. Each car follows its own two bogie samples, so
// coaches articulate through points instead of rotating one rigid 234 m train.
import * as THREE from 'three';
import { edgePoint } from '../../core/graph.ts';
import type { Graph } from '../../core/graph.ts';
import type { Pt } from '../../core/geo.ts';
import type { MotionBirth, TrainView } from '../../core/motion.ts';
import { STATIONS } from '../../core/station-config.ts';
import type { StationId } from '../../core/station-config.ts';
import { DEFAULT_BUFFER_CLEARANCE_M } from '../../core/motion.ts';
import type { KxData } from '../../core/osm.ts';
import { platformFormationLimits } from '../../core/station.ts';
import type { ScheduleCall } from '../../core/schedule.ts';
import { ALL_KINDS, TRAIN_SPECS, trainLayout } from '../../core/train.ts';
import type { Car, TrainKind, TrainLayout } from '../../core/train.ts';
import { buildTrain, END_GAP } from './train.ts';
import trackData from './data/kx-track.json' with { type: 'json' };

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

type OperatorService = Pick<ScheduleCall, 'operator' | 'origin' | 'destination'> & Partial<Pick<ScheduleCall, 'platform'>>;
/** Formation length is evidence only within an operator's fleet: a 717 is almost
 * the length of a five-car Azuma. Read the catalogue so new 700/180 kinds slot in. */
export function kindForService(service: OperatorService | undefined, lengthM: number, maxLengthM?: number): TrainKind | undefined {
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
  const fitting = candidates.filter(kind => maxLengthM === undefined || layoutForKind(kind).length <= maxLengthM + 1e-8);
  // An unsupported fleet remains unresolved. If none of a known fleet fits, retain
  // its shortest actual kind; the birth choice below flags that unresolved mismatch.
  if (!fitting.length) return candidates.reduce<TrainKind | undefined>((best, kind) => best === undefined ||
    layoutForKind(kind).length < layoutForKind(best).length ? kind : best, undefined);
  return fitting.reduce<TrainKind | undefined>((best, kind) => best === undefined ||
    Math.abs(layoutForKind(kind).length - lengthM) < Math.abs(layoutForKind(best).length - lengthM) ? kind : best, undefined);
}

export interface FormationChoice {
  readonly kind: TrainKind | undefined;
  readonly platform?: string;
  readonly limitM?: number;
  readonly capped: boolean;
  readonly doesNotFit: boolean;
  readonly note?: string;
}
/** UI enrichment of the ephemeral motion view. The tooltip already consumes this
 * same object after rendering; the motion core continues to own length and position. */
export interface FormationView extends TrainView { formationNote?: string }
type KindResolver = ((view: TrainView) => TrainKind | undefined) & {
  suppressUnresolved?: boolean;
  formationFor?: (view: Pick<TrainView, 'id'>) => FormationChoice | undefined;
};
export interface TrainKindOptions { platformLimitsM?: ReadonlyMap<string, number>; stationId?: StationId }
const defaultPlatformLimits = platformFormationLimits(trackData as unknown as KxData, DEFAULT_BUFFER_CLEARANCE_M);

/** One resolver per motion instance: both motion and drawing consume its birth choice. Late timetable loads apply
 * to future physical trains; renaming or updating a visible train cannot resize it. */
export function createTrainKinds(serviceFor: (description: string, atTime: number) => OperatorService | undefined, options: TrainKindOptions = {}) {
  const born = new Map<number, FormationChoice>();
  const station = STATIONS[options.stationId ?? 'kings-cross'];
  const limits = options.platformLimitsM ?? (station.id === 'kings-cross' ? defaultPlatformLimits : new Map<string, number>());
  const lengths = new Map<number, number>();
  const formationFor = (view: Pick<TrainView, 'id'>): FormationChoice | undefined => born.get(view.id);
  const kindFor = Object.assign((view: TrainView): TrainKind | undefined => born.get(view.id)?.kind, { formationFor, suppressUnresolved: !station.legacyLnerFallback });
  return {
    lengthM(description: string, birth: MotionBirth): number {
      const previous = born.get(birth.id);
      if (previous) return lengths.get(birth.id)!;
      const service = serviceFor(description, birth.timeMs), platform = service?.platform ?? undefined;
      const limitM = platform === undefined ? undefined : limits.get(platform);
      const length = lengthForDescription(description);
      const preferred = kindForService(service, length) ?? kindForDescription(description);
      // King's Cross retains its legacy LNER assumption. Other stations leave
      // unsupported fleets unresolved; no operator is inferred from headcode.
      const kind = kindForService(service, length, limitM) ?? (station.legacyLnerFallback ? kindForService({ operator: 'GR', origin: '', destination: '' }, length, limitM) : undefined);
      if (kind === undefined) {
        // Explicit modelling length; no fleet or livery is claimed or drawn.
        const assumedLength = 130;
        born.set(birth.id, Object.freeze({ kind, platform, limitM, capped: false, doesNotFit: false, note: 'formation unavailable' }));
        lengths.set(birth.id, assumedLength);
        return assumedLength;
      }
      const doesNotFit = limitM !== undefined && layoutForKind(kind).length > limitM + 1e-8;
      const capped = !doesNotFit && kind !== preferred;
      const where = `P${platform}, ${Math.floor(limitM ?? 0)} m usable`;
      const note = doesNotFit ? `shortest available; exceeds platform length: ${where}` : capped ? `capped to platform length: ${where}` : undefined;
      born.set(birth.id, Object.freeze({ kind, platform, limitM, capped, doesNotFit, note }));
      lengths.set(birth.id, layoutForKind(kind).length);
      return layoutForKind(kind).length;
    },
    kindFor, formationFor,
  };
}

/** Legacy fallback without timetable evidence; compare only the two LNER lengths. */
export function layoutForLength(lengthM: number): TrainLayout {
  const short = layoutForKind('lner5'), long = layoutForKind('lner9');
  return Math.abs(lengthM - long.length) <= Math.abs(lengthM - short.length) ? long : short;
}

export interface TrailSample { point: Pt; back: Pt }
export interface CarPose<C = Car> {
  car: C;
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
      // on the edge's drawn curve when the graph carries one (core/curves.ts), else on its chord
      const { point, dir } = edgePoint(graph, s.edge, t);
      const sign = Math.sign(s.fromT - s.toT);
      return { point, back: [dir[0] * sign, dir[1] * sign] };
    }
    left -= length;
  }
  return null;
}

type PositionedCar = Pick<Car, 'index' | 'end' | 'bogies'>;
export function carPoses(graph: Graph, train: TrainView): CarPose[];
export function carPoses<C extends PositionedCar>(graph: Graph, train: TrainView, layout: { readonly cars: readonly C[] }): CarPose<C>[];
export function carPoses(graph: Graph, train: TrainView, layout: { readonly cars: readonly PositionedCar[] } = layoutForLength(train.lengthM)): CarPose<PositionedCar>[] {
  const poses: CarPose<PositionedCar>[] = [];
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

interface MaterialPalette {
  opacity: number;
  copies: Map<THREE.Material, THREE.Material>;
}

/**
 * Material.clone() copies a material's settings but not its shader hooks. A material that patches its own shader (train-geom.ts `plain`: the lit windows and the lamp lenses
 * after dark) would be drawn as a plain Lambert material once cloned, so a live train would lose its night glow. The copy takes the hooks the original sets for itself.
 */
export function cloneWithShaderHooks<M extends THREE.Material>(original: M): M {
  const copy = original.clone() as M;
  if (Object.prototype.hasOwnProperty.call(original, 'onBeforeCompile')) copy.onBeforeCompile = original.onBeforeCompile;
  if (Object.prototype.hasOwnProperty.call(original, 'customProgramCacheKey')) copy.customProgramCacheKey = original.customProgramCacheKey;
  return copy;
}

export function createLiveTrains(graph: Graph, parent: THREE.Object3D, kindFor?: KindResolver) {
  const templates = new Map<TrainKind, THREE.Group>();
  const drawn = new Map<number, DrawnTrain>();
  const palettes = new Map<TrainKind, Map<number, MaterialPalette>>();
  const assigned = new Map<number, MaterialPalette>();
  const originals = new WeakMap<THREE.Material, THREE.Material>();
  const setOpacity = (material: THREE.Material, opacity: number): void => {
    const transparent = opacity < 1;
    if (material.transparent !== transparent) { material.transparent = transparent; material.needsUpdate = true; }
    material.opacity = opacity; material.depthWrite = !transparent;
  };
  const paletteFor = (kind: TrainKind, opacity: number, needed: Set<number>, previous?: MaterialPalette): MaterialPalette => {
    let buckets = palettes.get(kind);
    if (!buckets) { buckets = new Map(); palettes.set(kind, buckets); }
    const shared = buckets.get(opacity);
    if (shared) return shared;
    // A unique fading phase can keep its material objects. Reuse only when no
    // train in this frame needs the old opacity; never quantize a physical fade.
    if (previous && !needed.has(previous.opacity)) {
      buckets.delete(previous.opacity);
      previous.opacity = opacity;
      for (const material of previous.copies.values()) setOpacity(material, opacity);
      buckets.set(opacity, previous);
      return previous;
    }
    const palette: MaterialPalette = { opacity, copies: new Map() };
    buckets.set(opacity, palette);
    return palette;
  };
  const bind = (train: DrawnTrain, palette: MaterialPalette): void => {
    if (assigned.get(train.id) === palette) return;
    const copy = (material: THREE.Material): THREE.Material => {
      const original = originals.get(material) ?? material;
      if (!palette.copies.has(original)) {
        const shared = cloneWithShaderHooks(original);
        setOpacity(shared, palette.opacity);
        palette.copies.set(original, shared); originals.set(shared, original);
      }
      return palette.copies.get(original)!;
    };
    train.group.traverse((node) => {
      if (node instanceof THREE.Mesh) node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
    });
    assigned.set(train.id, palette);
  };
  const releaseUnused = (used: Set<MaterialPalette>): void => {
    for (const [kind, buckets] of palettes) {
      for (const [opacity, palette] of buckets) if (!used.has(palette)) {
        for (const material of palette.copies.values()) material.dispose();
        buckets.delete(opacity);
      }
      if (!buckets.size) palettes.delete(kind);
    }
  };
  const build = (view: TrainView): DrawnTrain => {
    const resolvedKind = kindFor?.(view);
    const layout = resolvedKind === undefined ? layoutForLength(view.lengthM) : layoutForKind(resolvedKind), kind = layout.spec.kind;
    if (!templates.has(kind)) templates.set(kind, buildTrain(kind));
    const group = templates.get(kind)!.clone(true);
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
    assigned.delete(id);
  };
  const update = (incoming: readonly FormationView[]): void => {
    for (const view of incoming) view.formationNote = kindFor?.formationFor?.(view)?.note;
    const views = kindFor?.suppressUnresolved ? incoming.filter(view => kindFor(view) !== undefined) : incoming;
    const present = new Set(views.map((t) => t.id));
    for (const id of drawn.keys()) if (!present.has(id)) remove(id);
    const needed = new Map<TrainKind, Set<number>>();
    for (const view of views) {
      const t = drawn.get(view.id) ?? build(view);
      if (!needed.has(t.kind)) needed.set(t.kind, new Set());
      needed.get(t.kind)!.add(view.opacity);
    }
    const used = new Set<MaterialPalette>();
    for (const view of views) {
      const t = drawn.get(view.id)!;
      const palette = paletteFor(t.kind, view.opacity, needed.get(t.kind)!, assigned.get(view.id));
      bind(t, palette); used.add(palette);
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
    }
    releaseUnused(used);
  };
  const dispose = (): void => {
    for (const id of [...drawn.keys()]) remove(id);
    releaseUnused(new Set());
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
