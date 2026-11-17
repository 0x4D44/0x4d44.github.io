import type { Precip } from '../web/src/precip.ts';

export function pinWeatherPhase(precip: Precip, timeS: number): { timeS: number };
export interface WeatherFixture {
  phaseSeconds: number;
  rainTime: number | null;
  snowTime: number | null;
  synthetic?: { animated: boolean; travelledM: number } | null;
}
export function weatherFixtureHonoured(scene: string, fixture: WeatherFixture | null, phaseSeconds?: number): boolean;
