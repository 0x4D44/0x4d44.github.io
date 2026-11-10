// The kinds the Waverley layer can draw for a live EB train, one row per kind. A row joins the
// evidence it needs (core/train-neutral.ts EdinburghKindRow) to its builder. Append rows; never
// reorder. A kind left out of this table is never drawn at Waverley: the train stays neutral.
import type * as THREE from 'three';
import { KX_REUSED_ROWS } from '../../core/train-neutral.ts';
import type { EdinburghKindRow } from '../../core/train-neutral.ts';
import type { TrainKind } from '../../core/train.ts';
import { buildTrain } from './train.ts';
import { disposeNeutralTrain } from './train-neutral.ts';

export interface EdinburghFleetRow extends EdinburghKindRow {
  /** Children named car-<index>; bogies named bogie-<index>-<k>. */
  readonly build: () => THREE.Group;
  /** Frees the geometry the builder owns (shared bogie geometry and plain() stay alive). */
  readonly dispose: (train: THREE.Group) => void;
}

/** The King's Cross Azuma builder disposes like the neutral one: its owned meshes, never the shared bogie mesh. */
const kxRow = (row: EdinburghKindRow): EdinburghFleetRow => ({ ...row, build: () => buildTrain(row.kind as TrainKind), dispose: disposeNeutralTrain });

export const EDINBURGH_FLEET: readonly EdinburghFleetRow[] = [
  ...KX_REUSED_ROWS.map(kxRow),
];

export const edinburghFleetRow = (kind: string): EdinburghFleetRow | undefined => EDINBURGH_FLEET.find(r => r.kind === kind);
