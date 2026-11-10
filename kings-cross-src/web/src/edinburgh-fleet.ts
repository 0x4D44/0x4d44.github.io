// The kinds the Waverley layer can draw for a live EB train, one row per kind. A row joins the
// evidence it needs (core/train-neutral.ts EdinburghKindRow) to its builder. Append rows; never
// reorder. A kind left out of this table is never drawn at Waverley: the train stays neutral.
import type * as THREE from 'three';
import { KX_REUSED_ROWS } from '../../core/train-neutral.ts';
import type { EdinburghKindRow } from '../../core/train-neutral.ts';
import type { TrainKind } from '../../core/train.ts';
import { buildTrain } from './train.ts';
import { disposeNeutralTrain } from './train-neutral.ts';
import { SR385_ROWS } from './train-385.ts';

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
];

export const edinburghFleetRow = (kind: string): EdinburghFleetRow | undefined => EDINBURGH_FLEET.find(r => r.kind === kind);

/** The page's capture hook (window.__kx.evidenceBuildEdinburgh): builds a row's kind, or undefined for a kind not in the table. */
export const evidenceBuildEdinburgh = (kind: string): THREE.Group | undefined => edinburghFleetRow(kind)?.build();
