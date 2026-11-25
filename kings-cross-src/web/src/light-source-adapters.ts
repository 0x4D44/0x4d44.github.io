import type { LightPoint, LightSource, LightStation, Spectrum } from '../../core/light-sources.ts';
import { LAMP_KIND } from '../../core/streetlights.ts';
import type { LampKind, LampSpot } from '../../core/streetlights.ts';

export const lampSpectrum: Readonly<Record<LampKind, Spectrum>> = {
  [LAMP_KIND.sodium]: 'hps',
  [LAMP_KIND.warm]: 'led-3000',
  [LAMP_KIND.cool]: 'led-4000',
};

export function roadLight(station: LightStation, id: string, spot: LampSpot, pos: LightPoint, {
  spectrum = lampSpectrum[spot.kind], lumens = 10000, throwM = 4 * spot.height, spreadM = 1.8 * spot.height,
  tags = ['road'],
}: { spectrum?: Spectrum; lumens?: number; throwM?: number; spreadM?: number; tags?: readonly string[] } = {}): LightSource {
  return { id, station, pos, footY: spot.y, yaw: spot.yaw, spectrum, lumens,
    optic: { kind: 'road', throwM, spreadM, cutoffDeg: spot.kind === LAMP_KIND.sodium ? 75 : 65 }, cover: 'open', tags };
}

export function downlight(station: LightStation, set: string, index: number, pos: LightPoint, footY: number,
  spectrum: Spectrum, lumens: number, halfAngleDeg: number, radiusM: number, cover: LightSource['cover']): LightSource {
  return { id: `${station}/${set}/${index}`, station, pos, footY, yaw: 0, spectrum, lumens,
    optic: { kind: 'downlight', halfAngleDeg, softDeg: 10, radiusM }, cover, tags: [set] };
}

/** The KX legacy sprites and their replacement layer use the same input sites. */
export function kxStationLights(set: 'platform' | 'shed' | 'concourse', heads: readonly number[], footY: number,
  radii: readonly number[] = []): LightSource[] {
  const lights: LightSource[] = [];
  // Roof lanterns are close to 20 m above the floor. Use the direct-light
  // footprint for capacity; the current reflection layer has short decals.
  const defaultRadius = set === 'shed' ? 25 : set === 'concourse' ? 16 : 10;
  for (let i = 0; i < heads.length; i += 3) {
    const pos: LightPoint = [heads[i]!, heads[i + 1]!, heads[i + 2]!];
    lights.push(downlight('kx', set, i / 3, pos, footY, set === 'platform' ? 'led-4000' : 'led-3000',
      set === 'shed' ? 8000 : set === 'platform' ? 4000 : 3000, set === 'shed' ? 70 : 60,
      radii[i / 3] ?? defaultRadius, set === 'platform' ? 'open' : 'under-roof'));
  }
  return lights;
}
