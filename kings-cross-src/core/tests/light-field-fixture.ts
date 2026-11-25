import type { LightPoint, LightSource } from '../light-sources.ts';

export function testRoadLight(id = 'test', pos: LightPoint = [0, 10.15, 0]): LightSource {
  return { id, station: 'kx', pos, footY: 0, yaw: 0, spectrum: 'hps', lumens: 16000,
    optic: { kind: 'road', throwM: 40, spreadM: 18, cutoffDeg: 75 }, cover: 'open', tags: ['road', 'euston-road'] };
}

