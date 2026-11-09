// Honest generic appearance: ASSUMED straight grey bodies, glazing, bogies and
// inter-car gaps. No operator colours, logos, claimed class, or borrowed cab nose.
import * as THREE from 'three';
import { NEUTRAL_ASSUMED, neutralTrainLayout } from '../../core/train-neutral.ts';
import type { NeutralLayout } from '../../core/train-neutral.ts';
import { Soup, col, plain, roundedRect } from './train-geom.ts';
import { buildBogie } from './train-parts.ts';

export function buildNeutralTrain(layout: NeutralLayout = neutralTrainLayout()): THREE.Group {
  const root = new THREE.Group(); root.name = 'train-neutral';
  root.userData = { kind: 'neutral', family: 'neutral', allocation: 'assumed fleet', label: layout.spec.label, length: layout.length, cars: layout.cars.length, source: layout.spec.source, assumptions: 'ASSUMED car count, length, dimensions, glazing, equipment and bogies; no actual fleet identified' };
  const half = NEUTRAL_ASSUMED.width.value / 2;
  const floor = NEUTRAL_ASSUMED.floor.value;
  const roof = NEUTRAL_ASSUMED.roof.value;
  const gap = NEUTRAL_ASSUMED.endGap.value;
  for (const car of layout.cars) {
    const group = new THREE.Group(); group.name = `car-${car.index}`;
    group.userData = { ...car, kind: 'neutral', allocation: 'assumed fleet', source: layout.spec.source };
    const soup = new Soup();
    const start = car.start + gap; const end = car.end - gap;
    soup.box(-half, half, floor, roof - 0.2, start, end, col(0x81878b));
    soup.box(-half * 0.94, half * 0.94, roof - 0.2, roof, start, end, col(0xa0a4a6));
    soup.box(-half * 0.8, half * 0.8, 0.65, floor, start + 0.25, end - 0.25, col(0x383e42));
    // Window positions and sizes are ASSUMED visual cues, not a carriage layout.
    for (let z = start + 1.25; z < end - 0.7; z += 1.8) for (const side of [-1, 1]) {
      const x = side * half;
      soup.prismX(roundedRect(z - 0.57, z + 0.57, 1.95, 2.93, 0.08, 3), x - 0.008, x + 0.008, col(0x30434d));
    }
    // Plain dark end windows do not assert a particular operator's cab design.
    if (car.cab) {
      const z = car.cab === 'front' ? start : end;
      soup.box(-0.87, 0.87, 2.15, 3.12, z - 0.012, z + 0.012, col(0x30434d));
    }
    const body = new THREE.Mesh(soup.build(), plain()); body.name = 'body-shell'; group.add(body);
    for (const [index, z] of car.bogies.entries()) {
      const bogie = buildBogie({ radius: NEUTRAL_ASSUMED.wheelDiameter.value / 2, wheelbase: NEUTRAL_ASSUMED.wheelbase.value, track: 1.435, motor: false });
      bogie.name = `bogie-${car.index}-${index}`; bogie.position.z = z; group.add(bogie);
    }
    root.add(group);
  }
  return root;
}

/** Preserve the existing parts builder's shared geometry and plain() material. */
export function disposeNeutralTrain(root: THREE.Group): void {
  const owned = new Set<THREE.BufferGeometry>();
  root.traverse((o) => { if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') owned.add(o.geometry); });
  for (const geometry of owned) geometry.dispose();
}
