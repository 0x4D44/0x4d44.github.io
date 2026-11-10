import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { HST, INTERCITY_KINDS, intercityLayout, VOYAGER } from '../../core/train-intercity.ts';
import { checkEdinburghRows } from '../../core/train-neutral.ts';
import { EDINBURGH_FLEET, edinburghFleetRow } from '../src/edinburgh-fleet.ts';
import { buildIntercityTrain, disposeIntercityTrain, INTERCITY_BODIES, intercityFormation, splitPolygon } from '../src/train-intercity.ts';
import { col, plain } from '../src/train-geom.ts';
import { lensLook, setTrainLampState } from '../src/train.ts';

const ownedTriangles = (car: THREE.Object3D): number => {
  let n = 0;
  car.traverse((o) => { if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') n += o.geometry.getAttribute('position').count / 3; });
  return n;
};

test('intercity trains: one car-<i> group per layout car, each spanning its own [start, end], with bogie-<i>-<k> at its bogie centres', () => {
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    const layout = intercityLayout(kind);
    assert.deepEqual(root.children.map((c) => c.name), layout.cars.map((c) => `car-${c.index}`), kind);
    for (const car of layout.cars) {
      const g = root.getObjectByName(`car-${car.index}`) as THREE.Group;
      const box = new THREE.Box3().setFromObject(g);
      assert.ok(box.min.z >= car.start - 0.001 && box.max.z <= car.end + 0.001, `${kind} car ${car.index} within [${car.start}, ${car.end}]: ${box.min.z}..${box.max.z}`);
      assert.ok(box.max.z - box.min.z > car.length - 0.5, `${kind} car ${car.index} fills its span`);
      car.bogies.forEach((z, k) => {
        const b = g.getObjectByName(`bogie-${car.index}-${k}`);
        assert.ok(b && b.parent === g, `${kind} bogie-${car.index}-${k} is a child of its car`);
        assert.equal(b.position.z, z);
      });
    }
  }
});

test('intercity bodies stand at their figures: width, roof under the formation roof top, every vertex finite', () => {
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    const f = intercityFormation(kind);
    const hst = kind.startsWith('srhst');
    const width = hst ? HST.bodyWidth.value : VOYAGER.bodyWidth.value;
    let finite = true;
    root.traverse((o) => { if (o instanceof THREE.Mesh) finite &&= Array.from(o.geometry.getAttribute('position').array as Float32Array).every(Number.isFinite); });
    const box = new THREE.Box3().setFromObject(root);
    assert.ok(finite, kind);
    assert.ok(Math.abs(box.max.x - box.min.x - width) < 0.02, `${kind} width ${box.max.x - box.min.x}`);
    assert.ok(box.max.y <= f.roofTop + 0.001 && box.max.y > f.crown - 0.05, `${kind} roof ${box.max.y} against ${f.crown}..${f.roofTop}`);
    assert.ok(box.min.y > -0.05, `${kind} nothing under the rail head`);
  }
});

test('intercity cars stay within the 40k-triangle and draw budgets, and a power car has no gangway while every coach end does', () => {
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    for (const car of intercityLayout(kind).cars) {
      const g = root.getObjectByName(`car-${car.index}`) as THREE.Group;
      assert.ok(ownedTriangles(g) < 40000, `${kind} car ${car.index}: ${ownedTriangles(g)} triangles`);
      let draws = 0;
      g.traverse((o) => { if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') draws++; });
      assert.ok(draws <= 3, `${kind} car ${car.index}: ${draws} owned draws`);
      const gangways = g.children.filter((o) => o.name === 'gangway').length;
      const want = car.body === 'class43' ? 0 : car.cab ? 1 : 2;
      assert.equal(gangways, want, `${kind} car ${car.index} gangways`);
      assert.equal(g.children.filter((o) => o.name === 'cab-glass').length, car.cab ? 1 : 0, `${kind} car ${car.index} cab glass`);
      assert.equal(g.children.filter((o) => o.name === 'nose-coupler').length, car.cab && car.body === 'voyager' ? 1 : 0, `${kind} car ${car.index} nose coupler`);
    }
  }
});

test('intercity cabs record their lamps as train.ts does: head lenses lit at the front, tail at the rear, two headlights each', () => {
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    const layout = intercityLayout(kind);
    for (const car of layout.cars) {
      const g = root.getObjectByName(`car-${car.index}`) as THREE.Group;
      const lamps = (g.getObjectByName('body-detail') as THREE.Mesh).userData.lamps as { end: string; lenses: { role: string; v0: number; v1: number }[] } | undefined;
      if (!car.cab) { assert.equal(lamps, undefined); continue; }
      assert.ok(lamps, `${kind} car ${car.index} lamps`);
      assert.equal(lamps.end, car.cab);
      assert.deepEqual([...new Set(lamps.lenses.map((l) => l.role))].sort(), ['head', 'marker', 'tail']);
      assert.ok(lamps.lenses.every((l) => l.v1 > l.v0));
      assert.equal(g.children.filter((o) => o.name === 'headlight').length, 2, `${kind} car ${car.index} headlights`);
    }
  }
});

test('the intercity rows: four kinds, their vehicle counts and classes, a formation the planner can trust, and no duplicate (operator, class, cars)', () => {
  const rows = INTERCITY_KINDS.map((k) => edinburghFleetRow(k));
  assert.deepEqual(rows.map((r) => r && [r.kind, r.operator, r.classes, r.cars]), [
    ['xc220x4', 'XC', ['220'], 4], ['xc221x5', 'XC', ['221'], 5], ['srhstx4', 'SR', ['43', 'HST'], 6], ['srhstx5', 'SR', ['43', 'HST'], 7],
  ]);
  checkEdinburghRows(EDINBURGH_FLEET);
  for (const r of rows) {
    const f = r!.formation!();
    const l = r!.layout();
    assert.equal(f.length, l.length);
    assert.equal(f.cars.length, r!.cars);
    assert.ok(f.roofTop >= f.crown && f.half > 1.3 && f.doorWidth > 0.5);
    for (const c of f.cars) for (const d of c.doors) assert.ok(d > c.start && d < c.end, `${r!.kind} car ${c.index} door ${d}`);
  }
  // the Voyager's door centres from the nose, the drawing's; the HST's coach doors at each end
  assert.deepEqual(intercityFormation('xc220x4').cars[0]!.doors.map((d) => Math.round(d * 100) / 100), [7.1, 22.3]);
  assert.deepEqual(intercityFormation('xc220x4').cars[3]!.doors.map((d) => Math.round(d * 100) / 100), [71.4, 86.6]);
  assert.deepEqual(intercityFormation('srhstx4').cars[0]!.doors, []);
});

test('intercity disposal frees the builder geometry and keeps the shared bogie geometry and material', () => {
  const root = buildIntercityTrain('srhstx4');
  let owned = 0; let disposed = 0; let shared = 0;
  const sharedSet = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.name === 'bogie-mesh') sharedSet.add(o.geometry);
    else { owned++; o.geometry.addEventListener('dispose', () => { disposed++; }); }
  });
  for (const g of sharedSet) g.addEventListener('dispose', () => { shared++; });
  const material = plain();
  material.addEventListener('dispose', () => { shared++; });
  disposeIntercityTrain(root);
  assert.ok(owned > 10);
  assert.equal(disposed, owned);
  assert.equal(shared, 0);
});

test('intercity lamps are wired to setTrainLampState: turning the train round swaps white and red at both cabs, and off darkens them', () => {
  type Lens = { role: 'head' | 'tail' | 'marker'; v0: number; v1: number };
  const shows = (root: THREE.Group, end: 'front' | 'rear', mode: 'head' | 'tail' | 'off'): boolean => {
    let ok = false;
    root.traverse((o) => {
      const lamps = o instanceof THREE.Mesh && o.name === 'body-detail' ? (o.userData.lamps as { end: string; lenses: Lens[] } | undefined) : undefined;
      if (!lamps || lamps.end !== end) return;
      const g = (o as THREE.Mesh).geometry;
      const rgb = g.getAttribute('color');
      const glow = g.getAttribute('aGlow');
      ok = lamps.lenses.every((l) => {
        const look = lensLook(l.role, mode);
        const c = col(look.hex);
        return glow.getX(l.v0) === look.glow && Math.abs(rgb.getX(l.v1 - 1) - c.r) < 1e-6 && Math.abs(rgb.getY(l.v0) - c.g) < 1e-6 && Math.abs(rgb.getZ(l.v0) - c.b) < 1e-6;
      });
    });
    return ok;
  };
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    assert.ok(shows(root, 'front', 'head') && shows(root, 'rear', 'tail'), `${kind} built in service state`);
    setTrainLampState(root, { front: 'tail', rear: 'head' });
    assert.ok(shows(root, 'front', 'tail') && shows(root, 'rear', 'head'), `${kind} turned round`);
    setTrainLampState(root, { front: 'off', rear: 'off' });
    assert.ok(shows(root, 'front', 'off') && shows(root, 'rear', 'off'), `${kind} dark`);
    assert.deepEqual(root.userData.lampState, { front: 'off', rear: 'off' });
  }
});

test('Voyager bogies: outside frames with plain steel rims, each driving only its inner axle (1A\'A1\'); HST couplers are buckeyes, the Voyager\'s Dellners', () => {
  const rust = col(0x9b5b36);
  const motor = col(0x5f646b); // the outside-frame kit's traction motor (train-parts.ts PALETTES.alstom)
  for (const kind of ['xc220x4', 'xc221x5'] as const) {
    const root = buildIntercityTrain(kind);
    for (const car of intercityLayout(kind).cars) {
      car.bogies.forEach((z, k) => {
        const bogie = root.getObjectByName(`bogie-${car.index}-${k}`) as THREE.Object3D;
        let near: THREE.BufferGeometry | undefined;
        bogie.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.lod === 'near') near = o.geometry; });
        const rgb = near!.getAttribute('color');
        const pos = near!.getAttribute('position');
        let rusty = 0; const motorZ: number[] = [];
        for (let v = 0; v < rgb.count; v++) {
          const is = (c: THREE.Color): boolean => Math.abs(rgb.getX(v) - c.r) < 1e-6 && Math.abs(rgb.getY(v) - c.g) < 1e-6 && Math.abs(rgb.getZ(v) - c.b) < 1e-6;
          if (is(rust)) rusty++;
          if (is(motor)) motorZ.push(pos.getZ(v));
        }
        assert.equal(rusty, 0, `${kind} bogie-${car.index}-${k} rims`);
        assert.ok(motorZ.length > 0, `${kind} bogie-${car.index}-${k} has a motor`);
        const inner = z < (car.start + car.end) / 2 ? 1 : -1;
        assert.ok(motorZ.every((mz) => Math.sign(mz) === inner), `${kind} bogie-${car.index}-${k} drives only its inner axle`);
        // outside frame (voyager-bogie-01, 221134; the lead's round-4 ruling): the frame stands outboard of the wheels on both sides, a round
        // axle-end cover sits on each axle's line outboard of the frame, and a coil spring stands beyond each axle at the bogie's end
        const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
        assert.ok(box.max.x > 1.05 && box.min.x < -1.05, `${kind} bogie-${car.index}-${k} outside frame (x ${box.min.x}..${box.max.x})`);
        const cover = col(0x6c6258);
        const spring = col(0x544a41);
        const at = (c: THREE.Color): THREE.Vector3[] => {
          const out: THREE.Vector3[] = [];
          for (let v = 0; v < rgb.count; v++) if (Math.abs(rgb.getX(v) - c.r) < 1e-6 && Math.abs(rgb.getY(v) - c.g) < 1e-6 && Math.abs(rgb.getZ(v) - c.b) < 1e-6) out.push(new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v)));
          return out;
        };
        const w = 2.6 / 2;
        const r = 0.43;
        for (const sx of [-1, 1]) {
          for (const az of [-w, w]) {
            const covers = at(cover).filter((p) => Math.sign(p.x) === sx && Math.abs(p.x) > 1.06 && Math.abs(p.z - az) < 0.14 && Math.abs(p.y - r) < 0.14);
            assert.ok(covers.length >= 24, `${kind} bogie-${car.index}-${k} axle-end cover at x ${sx}, z ${az}: ${covers.length}`);
            const springs = at(spring).filter((p) => Math.sign(p.x) === sx && Math.sign(p.z) === Math.sign(az) && Math.abs(p.z) > w + 0.25 && p.y > r);
            assert.ok(springs.length >= 24, `${kind} bogie-${car.index}-${k} end spring at x ${sx}, z ${az}: ${springs.length}`);
          }
        }
      });
    }
  }
  const couplers = (kind: 'xc220x4' | 'srhstx4'): string[] => {
    const names: string[] = [];
    buildIntercityTrain(kind).traverse((o) => { if (o.name === 'coupler') names.push(o.userData.style); });
    return [...new Set(names)];
  };
  assert.deepEqual(couplers('srhstx4'), ['buckeye']);
  assert.deepEqual(couplers('xc220x4'), ['dellner']);
});

test('a loft quad is cut exactly along a paint line, one piece each side, the cut points on the line', () => {
  const v = (s: number, y: number) => ({ p: [1.3, y, s] as [number, number, number], n: [1, 0, 0] as [number, number, number], s });
  const quad = [v(0, 1), v(1, 1), v(1, 2), v(0, 2)];
  const pieces = splitPolygon(quad, (s, y) => s - (y - 1));
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces.map((p) => p.length).sort(), [3, 3]);
  for (const piece of pieces) for (const w of piece) assert.ok(Math.abs(w.s - (w.p[1] - 1)) < 1e-12 || [0, 1].includes(w.s));
  assert.deepEqual(splitPolygon(quad, (s) => s - 5), [quad]);
  const three = splitPolygon(quad, (s) => s - 0.25);
  assert.deepEqual(three.map((p) => p.map((w) => w.s).sort()), [[0.25, 0.25, 1, 1], [0, 0, 0.25, 0.25]]);
});

test('intercity couplers meet: at every joint the two coupler heads touch within 1 cm, at the cars\' common end', () => {
  // the coupling is the only detail in the gap below the gangway and near the centre line: measure how far into the gap it reaches from each side
  const reach = (car: THREE.Object3D, from: number, toward: 1 | -1): number => {
    const pos = (car.getObjectByName('body-detail') as THREE.Mesh).geometry.getAttribute('position');
    let best = from;
    for (let v = 0; v < pos.count; v++) {
      const z = pos.getZ(v);
      if (Math.abs(pos.getX(v)) > 0.22 || pos.getY(v) < 0.6 || pos.getY(v) > 1.14) continue;
      if ((z - from) * toward < -0.001 || (z - from) * toward > 0.5) continue;
      if ((z - best) * toward > 0) best = z;
    }
    return best;
  };
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    const cars = intercityLayout(kind).cars;
    for (let i = 0; i + 1 < cars.length; i++) {
      const a = cars[i]!;
      const b = cars[i + 1]!;
      const headA = reach(root.getObjectByName(`car-${a.index}`)!, a.end - 0.35, 1);
      const headB = reach(root.getObjectByName(`car-${b.index}`)!, b.start + 0.35, -1);
      assert.ok(Math.abs(headA - headB) <= 0.01, `${kind} joint ${i}/${i + 1}: heads at ${headA.toFixed(3)} and ${headB.toFixed(3)}`);
      assert.ok(Math.abs(headA - a.end) <= 0.01, `${kind} joint ${i}/${i + 1}: they meet at the cars' common end ${a.end}, not ${headA.toFixed(3)}`);
    }
  }
});

test('every lamp lens is drawn whole: its area is its outline\'s, not a crescent clipped by the face or sunk in a pod', () => {
  const area3 = (pos: THREE.BufferAttribute, v0: number, v1: number): number => {
    let a = 0;
    for (let v = v0; v < v1; v += 3) {
      const p = [0, 1, 2].map((k) => new THREE.Vector3(pos.getX(v + k), pos.getY(v + k), pos.getZ(v + k)));
      a += p[1]!.clone().sub(p[0]!).cross(p[2]!.clone().sub(p[0]!)).length() / 2;
    }
    return a;
  };
  const area2 = (poly: [number, number][]): number => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]!; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  for (const kind of ['xc220x4', 'srhstx4'] as const) {
    const root = buildIntercityTrain(kind);
    const car = intercityLayout(kind).cars[0]!;
    const detail = (root.getObjectByName('car-0') as THREE.Group).getObjectByName('body-detail') as THREE.Mesh;
    const lenses = detail.userData.lamps.lenses as { role: string; v0: number; v1: number }[];
    const shapes = INTERCITY_BODIES[car.body].face.filter((f) => f.lens).flatMap((f) => (f.mirror ? [f, f] : [f]));
    assert.equal(lenses.length, shapes.length, kind);
    lenses.forEach((l, i) => {
      const want = area2(shapes[i]!.outline);
      const got = area3(detail.geometry.getAttribute('position') as THREE.BufferAttribute, l.v0, l.v1);
      // a lens on a flat face leans with it, one on a pod follows its curve (more area toward the pod's steep edge): never less than its outline
      assert.ok(got >= want * 0.98 && got <= want * 1.4, `${kind} ${l.role} lens ${i}: area ${got.toFixed(5)} against its outline's ${want.toFixed(5)}`);
    });
  }
});

test('the Class 43 screen sits in the upper half of the yellow panel, with yellow below it, and the Voyager nose has a Dellner head with its yellow fittings', () => {
  const root = buildIntercityTrain('srhstx4');
  const glass = (root.getObjectByName('car-0') as THREE.Group).getObjectByName('cab-glass') as THREE.Mesh;
  const pos = glass.geometry.getAttribute('position');
  let lo = Infinity; let hi = -Infinity;
  for (let v = 0; v < pos.count; v++) if (Math.abs(pos.getX(v)) < 0.9) { lo = Math.min(lo, pos.getY(v)); hi = Math.max(hi, pos.getY(v)); }
  // scotrail-hst-04: the navy band tops out at 1.72 m, the yellow panel reaches the cab roof at about 3.3 m; the screen is its upper half and about 0.75 m tall
  assert.ok(lo > 2.4 && lo < 2.7, `screen foot ${lo.toFixed(2)}`);
  assert.ok(hi > 3.15 && hi < 3.4, `screen head ${hi.toFixed(2)}`);
  assert.ok(hi - lo > 0.6, `screen height ${(hi - lo).toFixed(2)}`);
  const xc = buildIntercityTrain('xc220x4');
  const detail = (xc.getObjectByName('car-0') as THREE.Group).getObjectByName('body-detail') as THREE.Mesh;
  const rgb = detail.geometry.getAttribute('color');
  const dp = detail.geometry.getAttribute('position');
  const yellow = col(0xe8b812);
  let fittings = 0;
  for (let v = 0; v < rgb.count; v++) {
    if (Math.abs(rgb.getX(v) - yellow.r) > 1e-6 || Math.abs(rgb.getY(v) - yellow.g) > 1e-6 || Math.abs(rgb.getZ(v) - yellow.b) > 1e-6) continue;
    assert.ok(dp.getZ(v) >= -0.001 && dp.getZ(v) < 0.36 && dp.getY(v) < 1.3, `a yellow fitting at z ${dp.getZ(v)}, y ${dp.getY(v)} is on the coupler`);
    fittings++;
  }
  assert.ok(fittings >= 24, `yellow coupler fittings: ${fittings} vertices`);
});

test('roofs after the overbridge photographs: Voyager cooler hatches with dark grilles at both ends of every car, Class 43 louvre slots along both shoulders', () => {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
  const verts = (m: THREE.Mesh, hex: number): THREE.Vector3[] => {
    const c = col(hex);
    const pos = m.geometry.getAttribute('position');
    const rgb = m.geometry.getAttribute('color');
    const out: THREE.Vector3[] = [];
    for (let v = 0; v < pos.count; v++) if (near(rgb.getX(v), c.r) && near(rgb.getY(v), c.g) && near(rgb.getZ(v), c.b)) out.push(new THREE.Vector3(pos.getX(v), pos.getY(v), pos.getZ(v)));
    return out;
  };
  const xc = buildIntercityTrain('xc220x4');
  const xf = intercityFormation('xc220x4');
  for (const car of intercityLayout('xc220x4').cars) {
    const detail = (xc.getObjectByName(`car-${car.index}`) as THREE.Group).getObjectByName('body-detail') as THREE.Mesh;
    // the grilles stand on the crown: count them in the first and last third of the car's length
    const grilles = verts(detail, 0x17141a).filter((p) => p.y > xf.crown);
    const front = grilles.filter((p) => p.z < car.start + car.length / 3).length;
    const back = grilles.filter((p) => p.z > car.end - car.length / 3).length;
    assert.ok(front >= 48 && back >= 48, `car ${car.index}: grille vertices ${front} at the front third, ${back} at the back third`);
  }
  const hst = buildIntercityTrain('srhstx4');
  const car = intercityLayout('srhstx4').cars[0]!;
  const detail = (hst.getObjectByName('car-0') as THREE.Group).getObjectByName('body-detail') as THREE.Mesh;
  const slots = verts(detail, 0x24272c).filter((p) => p.y > 2.95 && p.y < 3.35);
  for (const sx of [-1, 1]) {
    const side = slots.filter((p) => Math.sign(p.x) === sx);
    const zs = new Set(side.map((p) => Math.round(p.z * 100)));
    // panels of slots at 0.1 m pitch along the engine room: well over a hundred slot edges a side
    assert.ok(zs.size > 100, `class 43 side ${sx}: ${zs.size} distinct slot edges`);
    assert.ok(side.every((p) => p.z > car.start + 4.4 && p.z < car.start + 13.4), `class 43 side ${sx}: slots stay over the engine room`);
  }
});
