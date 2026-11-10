import { STATIONS } from '../../core/station-config.ts';
import type { StationId } from '../../core/station-config.ts';

export type StationPhase = 'ready' | 'loading' | 'flying' | 'hopping' | 'failed';
export interface StationState { selected: StationId; phase: StationPhase; message: string; error?: string }
export function stationFromSearch(search: string): StationId {
  const values = new URLSearchParams(search).getAll('station');
  return values.length === 1 && Object.hasOwn(STATIONS, values[0]) ? values[0] as StationId : 'kings-cross';
}
/** Preserve the recording, UTC date, replay speed and hash when bookmarking a view. */
export function stationHref(href: string, station: StationId): string {
  const url = new URL(href); url.searchParams.set('station', station); return url.href;
}
export function stationMessage(station: StationId): string {
  if (station === 'st-pancras') return 'St Pancras: view only, live trains not yet enabled';
  if (station === 'edinburgh-waverley') return 'Edinburgh Waverley: model not built yet. Live trains not enabled.';
  if (station === 'perth') return 'Perth: model not built yet. Live trains not enabled.';
  return "King's Cross: London model · live / replay clock continues across views";
}

/** Selection owns neither the feed nor its clock. Late lazy loads cannot replace a newer choice. */
export function createStationSelection<T>(options: {
  load(station: StationId): Promise<T>;
  activate(station: StationId, value: T): Exclude<StationPhase, 'loading' | 'failed'>;
  change(state: StationState): void;
  discard?(value: T): void;
}) {
  let current: StationId = 'kings-cross', serial = 0;
  let state: StationState = { selected: current, phase: 'ready', message: stationMessage(current) };
  const paint = (next: StationState): void => { state = next; options.change({ ...state }); };
  return {
    state: (): StationState => ({ ...state }),
    async select(station: StationId): Promise<void> {
      const request = ++serial;
      paint({ selected: station, phase: 'loading', message: `Loading ${STATIONS[station].name}…` });
      try {
        const value = await options.load(station);
        if (request !== serial) { options.discard?.(value); return; }
        const phase = options.activate(station, value); current = station;
        paint({ selected: station, phase, message: stationMessage(station) });
      } catch (error) {
        if (request !== serial) return;
        paint({ selected: current, phase: 'failed', message: `${STATIONS[station].name} could not load. Select it to retry.`, error: String(error) });
      }
    },
    finish(): void { if (state.phase !== 'loading' && state.phase !== 'failed') paint({ selected: current, phase: 'ready', message: stationMessage(current) }); },
    dispose(): void { ++serial; },
  };
}
