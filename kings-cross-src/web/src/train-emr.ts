// Standalone EMR appearances. All visual measurements below are ASSUMED from the
// EMR222-01..04, EMR810-01..04 and EMR360-01..04 reference photographs (2024–26).
// They are an illustrative exterior, not a dimensioned engineering reconstruction.
import * as THREE from 'three';
import { EMR_ASSUMED, EMR_FIGURES, emrTrainLayout } from '../../core/train-emr.ts';
import type { EmrCar, EmrKind, EmrLayout } from '../../core/train-emr.ts';
import { Soup, col, ellipse, plain, roundedRect } from './train-geom.ts';
import type { V3 } from './train-geom.ts';
import { eggSection, halfAt, loopFromHalf, normalised, ringAt, ringStations, yAtX } from './train-nose.ts';
import type { NoseSpec } from './train-nose.ts';
import { carSection } from './train.ts';
import { buildBogie, buildPantograph, couplerHalf } from './train-parts.ts';

const PLUM = 0x532338;
const WHITE = 0xdadad6;
const GLASS = 0x20333e;
const DARK = 0x29292d;
const YELLOW = 0xf3cc24;

function carModel(car: EmrCar, layout: EmrLayout): THREE.Group {
  const family = layout.spec.family;
  const f = EMR_FIGURES[family];
  const half = f.width.value / 2;
  const crown = f.roof.value;
  const floor = 1.05;
  const commuter = family === 'desiro360';
  const aurora = family === 'aurora';
  const noseLength = commuter ? 1.55 : aurora ? 4.6 : 3.05;
  const tip = commuter ? 0.4 : 0.24;
  const topTip = commuter ? crown - 0.28 : aurora ? 1.55 : 2.72;
  const nose: NoseSpec = {
    length: noseLength, fillet: commuter ? 0.14 : 0.21, filletLoss: 0.11,
    roundLen: noseLength, widest: 0.48, boxiness: commuter ? 4 : 2.5,
    knots: [
      { s: 0, top: topTip, ws: commuter ? 0.88 : aurora ? 0.42 : 0.56, bottom: 0.66 },
      { s: noseLength * 0.4, top: crown - (commuter ? 0.04 : 0.65), ws: 0.9, bottom: floor - 0.2 },
      { s: noseLength, top: crown, ws: 1, bottom: floor },
    ],
  };
  const section = carSection({ half: half + 0.035, floor, crown, wallTop: crown - 0.5 });
  const norm = normalised(section);
  const egg = eggSection(norm, nose.widest, nose.boxiness);
  const gap = EMR_ASSUMED.endGap.value;
  const zAt = (s: number): number => car.cab === 'rear' ? car.end - s : car.start + s;
  const world = (p: V3): V3 => [p[0], p[1], zAt(p[2])];
  const shell = new Soup();
  const detail = new Soup();
  const group = new THREE.Group();
  group.name = `car-${car.index}`;
  group.userData = { ...car, allocation: 'assumed fleet', geometryBasis: 'assumed', source: layout.spec.source };
  const stations = car.cab ? [...ringStations(nose).map((s) => s + tip), car.length - gap] : [gap, car.length - gap];
  const loops = stations.map((s) => {
    const h = car.cab && s < tip + noseLength ? halfAt(section, norm, egg, ringAt(nose, s - tip)) : section.half;
    return loopFromHalf(h).map(([x, y]): V3 => [x, y, s]);
  });
  for (let i = 0; i + 1 < loops.length; i++) {
    const a = loops[i]!;
    const b = loops[i + 1]!;
    for (let j = 0; j < a.length; j++) {
      const j1 = (j + 1) % a.length;
      const points = [a[j]!, a[j1]!, b[j1]!, b[j]!] as [V3, V3, V3, V3];
      const y = points.reduce((sum, p) => sum + p[1], 0) / 4;
      const s = (stations[i]! + stations[i + 1]!) / 2;
      let colour = y > crown - 0.28 ? DARK : PLUM;
      // Meridian's broad ivory window surround; Aurora and Connect have plum sides.
      if (family === 'meridian' && s > noseLength + tip + 1.4 && y > 1.55 && y < 3.2) colour = WHITE;
      if (y < 1.15) colour = DARK;
      shell.face(points.map(world) as [V3, V3, V3, V3], world([0, (floor + crown) / 2, s]), col(colour));
    }
  }
  const cap = (index: number, direction: number, colour: number): void => shell.fan(loops[index]!.map(world), [0, 0, direction * (car.cab === 'rear' ? -1 : 1)], col(colour));
  cap(0, -1, car.cab && !aurora ? YELLOW : PLUM);
  cap(loops.length - 1, 1, DARK);

  const box = (x0: number, x1: number, y0: number, y1: number, s0: number, s1: number, colour: number): void => {
    const a = zAt(s0); const b = zAt(s1);
    detail.box(x0, x1, y0, y1, Math.min(a, b), Math.max(a, b), col(colour));
  };
  const marker = (name: string, x: number, y: number, s: number, data: Record<string, unknown> = {}): void => {
    const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, zAt(s)); o.userData = data; group.add(o);
  };
  const from = car.cab ? noseLength + tip + 0.45 : gap + 0.45;
  const to = car.length - gap - 0.6;
  const doors = commuter ? [Math.max(from + 0.5, car.length / 3), 2 * car.length / 3] : [from + 0.55, to - 0.65];
  const doorWidth = commuter ? 1.35 : 0.85;
  for (const s of doors) for (const side of [-1, 1]) {
    const a = side * half; const b = side * (half + 0.025);
    box(Math.min(a, b), Math.max(a, b), 1.1, 3.06, s - doorWidth / 2, s + doorWidth / 2, WHITE);
    box(Math.min(a, b) - 0.002, Math.max(a, b) + 0.002, 2.1, 2.92, s - doorWidth * 0.28, s + doorWidth * 0.28, GLASS);
    if (commuter) box(Math.min(a, b) - 0.004, Math.max(a, b) + 0.004, 1.1, 3.06, s - 0.015, s + 0.015, DARK);
    marker('door', side * half, 2.08, s, { side: side < 0 ? 'left' : 'right', width: doorWidth });
  }
  for (let s = from + 1.6; s < to - 0.7; s += commuter ? 1.65 : 1.72) {
    if (doors.some((d) => Math.abs(d - s) < doorWidth / 2 + 0.72)) continue;
    for (const side of [-1, 1]) {
      const x = side * (half + 0.006);
      detail.prismX(roundedRect(zAt(s) - 0.63, zAt(s) + 0.63, 1.92, 2.96, 0.12, 3), x - 0.007, x + 0.007, col(GLASS));
    }
  }
  // ASSUMED nose glass and fascia outlines follow the loft itself, avoiding floating plates.
  if (car.cab) {
    const glassStart = commuter ? 0.1 : aurora ? 1.8 : 0.55;
    const glassEnd = commuter ? 0.75 : aurora ? 3.5 : 2.1;
    const patch = (s0: number, s1: number, fraction: number, colour: number, name: string): void => {
      const soup = new Soup();
      const at = (i: number, j: number): V3 => {
        const s = s0 + (s1 - s0) * i / 18;
        const r = ringAt(nose, s);
        const h = halfAt(section, norm, egg, r);
        const x = fraction * r.ws * half * (2 * j / 16 - 1);
        return world([x, yAtX(h, Math.abs(x)) + 0.018, tip + s]);
      };
      for (let i = 0; i < 18; i++) for (let j = 0; j < 16; j++) {
        const p = [at(i, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j)] as [V3, V3, V3, V3];
        soup.face(p, [0, 0, p[0][2]], col(colour));
      }
      const mesh = new THREE.Mesh(soup.build(), plain()); mesh.name = name; group.add(mesh);
    };
    patch(0.02, glassStart, aurora ? 0.7 : 0.88, aurora ? 0xc3c0b7 : YELLOW, 'nose-fascia');
    patch(glassStart, glassEnd, 0.74, DARK, 'windscreen-frame');
    patch(glassStart + 0.06, glassEnd - 0.06, 0.68, GLASS, 'cab-glass');
    for (const side of [-1, 1]) {
      const s = tip + (commuter ? 0.03 : 0.38);
      const x = side * half * (commuter ? 0.65 : 0.48);
      detail.fan(ellipse(x, commuter ? 1.55 : 1.35, 0.12, 0.12, 14).map(([xx, y]): V3 => world([xx, y, s - 0.006])), [0, 0, car.cab === 'rear' ? 1 : -1], col(car.cab === 'rear' ? 0xe23c39 : 0xffefc5));
      marker('headlight', x, commuter ? 1.55 : 1.35, s, { rear: car.cab === 'rear' });
    }
    couplerHalf(detail, zAt(0), car.cab === 'rear' ? -1 : 1, tip + 0.18, 0.86, 'dellner');
    marker('coupler', 0, 0.86, tip / 2, { nose: true });
  }
  // Underframe and rooftop equipment remain ASSUMED where photographs hide detail.
  box(-half * 0.8, half * 0.8, 0.69, floor, from, to, DARK);
  if (!commuter) for (let s = from + 1.4; s < to - 1.5; s += 3.2) box(-0.8, 0.8, 0.42, 0.94, s, s + 1.9, 0x464749);
  for (let s = from; s < to - 1.5; s += 4.3) {
    const global = zAt(s + 1.1);
    if (car.pantograph && global > car.pantograph[0] - 0.8 && global < car.pantograph[1] + 0.8) continue;
    box(-0.85, 0.85, crown - 0.08, crown + 0.16, s, Math.min(to, s + 2.8), 0x8b8e92);
  }
  for (const [index, z] of car.bogies.entries()) {
    const bogie = buildBogie({ radius: EMR_ASSUMED.wheelDiameter.value / 2, wheelbase: EMR_ASSUMED.wheelbase.value, track: 1.435, motor: car.motor[index]! });
    bogie.name = `bogie-${car.index}-${index}`; bogie.position.z = z; group.add(bogie);
  }
  if (car.pantograph) {
    const p = buildPantograph(EMR_ASSUMED.pantographLength.value, 0.32);
    p.position.set(0, crown, (car.pantograph[0] + car.pantograph[1]) / 2); group.add(p);
  }
  const ends = car.cab ? [car.length - gap] : [gap, car.length - gap];
  for (const s of ends) { box(-0.64, 0.64, 1.12, 3.15, s - gap / 2, s + gap / 2, DARK); marker('gangway', 0, 2.1, s); }
  const shellMesh = new THREE.Mesh(shell.build(), plain()); shellMesh.name = 'body-shell';
  const details = new THREE.Mesh(detail.build(), plain()); details.name = 'body-detail'; group.add(shellMesh, details);
  return group;
}

/** Independent EMR builder; never substitutes LNER when a service's actual fleet is unknown. */
export function buildEmrTrain(kind: EmrKind): THREE.Group {
  const layout = emrTrainLayout(kind);
  const root = new THREE.Group(); root.name = `train-${kind}`;
  root.userData = { kind, length: layout.length, cars: layout.cars.length, family: layout.spec.family, operator: layout.spec.operator, label: layout.spec.label, allocation: 'assumed fleet', dimensionsProvisional: layout.spec.dimensionsProvisional, source: layout.spec.source, assumptions: 'ASSUMED roof height, bogie positions, wheel dimensions, nose, doors, glazing, equipment and coupling endpoints; Class 810 all dimensions provisional' };
  for (const car of layout.cars) root.add(carModel(car, layout));
  return root;
}

/** Release this builder's geometry, keeping shared bogie geometry and plain() material alive. */
export function disposeEmrTrain(root: THREE.Group): void {
  const owned = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') owned.add(o.geometry);
  });
  for (const geometry of owned) geometry.dispose();
}
