// The kinds the Waverley layer can draw for a live EB train, one row per kind. A row joins the
// evidence it needs (core/train-neutral.ts EdinburghKindRow) to its builder. Append rows; never
// reorder. A kind left out of this table is never drawn at Waverley: the train stays neutral.
import * as THREE from 'three';
import { KX_REUSED_ROWS } from '../../core/train-neutral.ts';
import type { EdinburghKindRow, EdinburghUnit } from '../../core/train-neutral.ts';
import type { TrainKind } from '../../core/train.ts';
import { buildTrain, setTrainLampState } from './train.ts';
import { disposeNeutralTrain } from './train-neutral.ts';
import { SR385_ROWS } from './train-385.ts';
import { wvEmuLayout } from '../../core/train-wv-emu.ts';
import { buildWvEmuTrain, disposeWvEmuTrain, wvEmuFormation } from './train-wv-emu.ts';

/** A figure the capture sidecars report, with its basis ('published', 'drawn', 'assumed', or a '+' join of them). */
export interface CaptureDimension { readonly value: number; readonly basis: string; readonly figures: readonly string[]; readonly figureM?: number }
/**
 * What tools/train-capture.mjs needs to photograph a kind (the shape of its describeFormation): the rubric's camera
 * poses are planned from these numbers alone. Positions are metres from the front nose; `doors` are door centres.
 */
export interface CaptureFormation {
  readonly family: string;
  readonly classes: string;
  readonly classNote: string | null;
  readonly length: number;
  /** Half the body width, the crown (roof edge) height, the roof equipment's height above it, and the highest point. */
  readonly half: number; readonly crown: number; readonly coverHeight: number; readonly roofTop: number;
  readonly doorWidth: number;
  readonly cars: readonly {
    readonly index: number; readonly type: string; readonly length: number; readonly start: number; readonly end: number;
    readonly cab: 'front' | 'rear' | null; readonly bogies: readonly number[]; readonly motor: readonly boolean[];
    readonly pantograph: readonly number[] | null; readonly doors: readonly number[];
  }[];
  readonly dimensions: { readonly lengthM: CaptureDimension; readonly widthM: CaptureDimension; readonly roofTopM: CaptureDimension };
}

export interface EdinburghFleetRow extends EdinburghKindRow {
  /** Children named car-<index>; bogies named bogie-<index>-<k>. */
  readonly build: () => THREE.Group;
  /** Frees the geometry the builder owns (shared bogie geometry and plain() stay alive). */
  readonly dispose: (train: THREE.Group) => void;
  /**
   * For the rubric captures: with it, `tools/train-capture.mjs --mode catalogue --kinds <kind>` photographs the kind
   * (the page builds it through window.__kx.evidenceBuildEdinburgh). The reused King's Cross kinds leave it out:
   * they are captured as King's Cross kinds.
   */
  readonly formation?: () => CaptureFormation;
}

/** The King's Cross Azuma builder disposes like the neutral one: its owned meshes, never the shared bogie mesh. */
const kxRow = (row: EdinburghKindRow): EdinburghFleetRow => ({ ...row, build: () => buildTrain(row.kind as TrainKind), dispose: disposeNeutralTrain });

export const EDINBURGH_FLEET: readonly EdinburghFleetRow[] = [
  ...KX_REUSED_ROWS.map(kxRow),
  ...SR385_ROWS,
  { kind: 'sr334x3', operator: 'SR', operatorName: 'ScotRail', classes: ['334'], cars: 3, layout: () => wvEmuLayout('sr334x3'), build: () => buildWvEmuTrain('sr334x3'), dispose: disposeWvEmuTrain, formation: () => wvEmuFormation('sr334x3') },
  { kind: 'tpe397x5', operator: 'TP', operatorName: 'TransPennine Express', classes: ['397'], cars: 5, layout: () => wvEmuLayout('tpe397x5'), build: () => buildWvEmuTrain('tpe397x5'), dispose: disposeWvEmuTrain, formation: () => wvEmuFormation('tpe397x5') },
];

export const edinburghFleetRow = (kind: string): EdinburghFleetRow | undefined => EDINBURGH_FLEET.find(r => r.kind === kind);

/** The page's capture hook (window.__kx.evidenceBuildEdinburgh): builds a row's kind, or undefined for a kind not in the table. */
export const evidenceBuildEdinburgh = (kind: string): THREE.Group | undefined => edinburghFleetRow(kind)?.build();

/**
 * Builds a chosen train (core createEdinburghKinds' EdinburghChoice): one row's own model, or for coupled units each
 * unit's model end to end. A unit's car groups move whole into the train: renamed car-<n> / bogie-<n>-<k> along the
 * train (composeUnits numbers them the same way) and shifted back by the unit's offset, so carPoses places them like
 * any other car. Undefined if a kind has no row.
 */
export function buildEdinburghTrain(choice: { readonly kind: string; readonly units: readonly EdinburghUnit[] }): THREE.Group | undefined {
  if (choice.units.length <= 1) return edinburghFleetRow(choice.kind)?.build();
  const rows = choice.units.map(u => edinburghFleetRow(u.kind));
  if (rows.some(r => !r)) return undefined;
  const root = new THREE.Group();
  root.name = `train-${choice.kind}`;
  let base = 0;
  choice.units.forEach((unit, u) => {
    const built = rows[u]!.build();
    for (const car of [...built.children]) {
      const i = Number(/^car-(\d+)$/.exec(car.name)?.[1]);
      if (!Number.isInteger(i)) throw new Error(`${unit.kind}: unexpected child ${car.name}`);
      car.name = `car-${base + i}`;
      car.traverse(o => { const m = /^bogie-(\d+)-(\d+)$/.exec(o.name); if (m) o.name = `bogie-${base + Number(m[1])}-${m[2]}`; });
      for (const part of car.children) part.position.z += unit.offset;
      car.userData = { ...car.userData, unit: u, unitKind: unit.kind };
      // a unit's cab that meets another unit is an inner cab end: dark, and left alone by setTrainLampState
      for (const mesh of car.children) {
        const lamps = mesh.name === 'body-detail' ? mesh.userData.lamps as { end: 'front' | 'rear'; interior: boolean } | undefined : undefined;
        if (!lamps || lamps.interior || !((lamps.end === 'front' && u > 0) || (lamps.end === 'rear' && u < choice.units.length - 1))) continue;
        setTrainLampState(mesh, { front: 'off', rear: 'off' });
        lamps.interior = true;
      }
      root.add(car);
    }
    base += unit.cars;
  });
  root.userData = { kind: choice.kind, units: choice.units.map(u => ({ ...u })), cars: base };
  return root;
}

/** Frees a train buildEdinburghTrain made: each unit's cars by their own row's disposer. */
export function disposeEdinburghTrain(root: THREE.Group): void {
  const units = root.userData.units as readonly EdinburghUnit[] | undefined;
  if (!units || units.length <= 1) { (edinburghFleetRow(String(root.userData.kind))?.dispose ?? disposeNeutralTrain)(root); return; }
  units.forEach((unit, u) => {
    const holder = new THREE.Group();
    for (const car of root.children.filter(c => c.userData.unit === u)) holder.add(car);
    (edinburghFleetRow(unit.kind)?.dispose ?? disposeNeutralTrain)(holder);
  });
}
