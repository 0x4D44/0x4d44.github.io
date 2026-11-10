// Station identity is separate from map extents and TD signalling areas. These are
// configuration labels, never SMART rows, recordings, or derived operational data.
export type StationId = 'kings-cross' | 'st-pancras' | 'edinburgh-waverley' | 'perth';
export interface StationConfig {
  readonly id: StationId;
  readonly name: string;
  readonly tdAreas: readonly string[];
  readonly tiplocs: readonly string[];
  readonly stanox: readonly string[];
  readonly platformRefs: readonly string[];
  readonly schedule: 'available' | 'unavailable';
  readonly legacyLnerFallback: boolean;
}
export const STATIONS: Readonly<Record<StationId, StationConfig>> = {
  'kings-cross': {
    id: 'kings-cross', name: "King's Cross", tdAreas: ['Y9'], tiplocs: ['KNGX'], stanox: ['54311'],
    platformRefs: Array.from({ length: 11 }, (_, n) => String(n)), schedule: 'available', legacyLnerFallback: true,
  },
  'st-pancras': {
    id: 'st-pancras', name: 'St Pancras', tdAreas: ['WH', 'X0', 'CT'],
    // TODO: verify schedule location identifiers before enabling this station's schedule.
    tiplocs: [], stanox: [], platformRefs: ['A', 'B', ...Array.from({ length: 13 }, (_, n) => String(n + 1))],
    schedule: 'unavailable', legacyLnerFallback: false,
  },
  'edinburgh-waverley': {
    id: 'edinburgh-waverley', name: 'Edinburgh Waverley', tdAreas: ['EB'],
    // TODO: verify schedule location identifiers before enabling this station's schedule.
    tiplocs: [], stanox: [], platformRefs: Array.from({ length: 20 }, (_, n) => String(n + 1)),
    schedule: 'unavailable', legacyLnerFallback: false,
  },
  perth: {
    // TODO: the train-describer area that covers Perth is not yet identified from the feed, and the relay does not record one, so no
    // TD area is configured and no live trains are drawn. The lead adds the area once it is confirmed.
    id: 'perth', name: 'Perth', tdAreas: [],
    // TODO: verify schedule location identifiers before enabling this station's schedule.
    tiplocs: [], stanox: [], platformRefs: Array.from({ length: 7 }, (_, n) => String(n + 1)),
    schedule: 'unavailable', legacyLnerFallback: false,
  },
};
/** Tuple encoding cannot alias even when a local identifier contains punctuation. */
export const areaIdentity = (area: string, local: string | number): string => JSON.stringify([area, local]);
