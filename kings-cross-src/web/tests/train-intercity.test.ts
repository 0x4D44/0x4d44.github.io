import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { HST, INTERCITY_KINDS, intercityLayout, VOYAGER } from '../../core/train-intercity.ts';
import { checkEdinburghRows } from '../../core/train-neutral.ts';
import { EDINBURGH_FLEET, edinburghFleetRow } from '../src/edinburgh-fleet.ts';
import { buildIntercityTrain, disposeIntercityTrain, INTERCITY_BODIES, intercityFormation, splitPolygon } from '../src/train-intercity.ts';
import { BOGIE_DEPTHS, BP10_TRACE, BT10_TRACE, tracer, VOYAGER221_TRACE } from '../src/train-intercity-bogie.ts';
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

/** The near level of every bogie of a kind: its car, its index, its z, and its geometry's positions and colours. */
const nearBogies = (kind: (typeof INTERCITY_KINDS)[number]) => {
  const root = buildIntercityTrain(kind);
  const out: { car: ReturnType<typeof intercityLayout>['cars'][number]; k: number; z: number; type: string; pos: THREE.BufferAttribute; rgb: THREE.BufferAttribute; wheels: THREE.Object3D[] }[] = [];
  for (const car of intercityLayout(kind).cars) {
    car.bogies.forEach((z, k) => {
      const bogie = root.getObjectByName(`bogie-${car.index}-${k}`) as THREE.Object3D;
      let near: THREE.BufferGeometry | undefined;
      bogie.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.lod === 'near') near = o.geometry; });
      out.push({ car, k, z, type: bogie.userData.bogieType, pos: near!.getAttribute('position') as THREE.BufferAttribute, rgb: near!.getAttribute('color') as THREE.BufferAttribute, wheels: bogie.children.filter((o) => o.name === 'wheel') });
    });
  }
  return out;
};
/** The vertices of a colour. */
const ofColour = (b: { pos: THREE.BufferAttribute; rgb: THREE.BufferAttribute }, hex: number): THREE.Vector3[] => {
  const c = col(hex);
  const out: THREE.Vector3[] = [];
  for (let v = 0; v < b.rgb.count; v++) if (Math.abs(b.rgb.getX(v) - c.r) < 1e-6 && Math.abs(b.rgb.getY(v) - c.g) < 1e-6 && Math.abs(b.rgb.getZ(v) - c.b) < 1e-6) out.push(new THREE.Vector3(b.pos.getX(v), b.pos.getY(v), b.pos.getZ(v)));
  return out;
};

test('Voyager bogies: the 220 keeps its inside frame, the 221 rides the outside frame traced from voyager-bogie-01; both have plain rims and drive only the inner axle (1A\'A1\'); HST couplers are buckeyes, the Voyager\'s Dellners', () => {
  const rust = 0x9b5b36;
  // the inside-frame kit's motor (train-parts.ts PALETTES.siemens) on the 220, the outside-frame kit's (PALETTES.alstom) on the 221
  const motor = { xc220x4: 0x4d5259, xc221x5: 0x5f646b } as const;
  for (const kind of ['xc220x4', 'xc221x5'] as const) {
    for (const b of nearBogies(kind)) {
      const tag = `${kind} bogie-${b.car.index}-${b.k}`;
      assert.equal(b.type, kind === 'xc220x4' ? 'v220' : 'v221', tag);
      assert.equal(ofColour(b, rust).length, 0, `${tag} rims`);
      const motorZ = ofColour(b, motor[kind]).map((p) => p.z);
      assert.ok(motorZ.length > 0, `${tag} has a motor`);
      const inner = b.z < (b.car.start + b.car.end) / 2 ? 1 : -1;
      assert.ok(motorZ.every((mz) => Math.sign(mz) === inner), `${tag} drives only its inner axle`);
      const box = new THREE.Box3().setFromBufferAttribute(b.pos);
      const wheelZ = [...new Set(b.wheels.map((w) => +w.position.z.toFixed(3)))].sort((p, q) => p - q);
      if (kind === 'xc220x4') {
        // inside frame (xc220-05: the wheels' faces show): nothing stands outboard of the wheels' outer faces; the 2.6 m ASSUMED wheelbase
        assert.ok(box.max.x < 0.86 && box.min.x > -0.86, `${tag} inside frame (x ${box.min.x}..${box.max.x})`);
        assert.deepEqual(wheelZ, [-VOYAGER.wheelbase.value / 2, VOYAGER.wheelbase.value / 2], `${tag} wheelbase`);
        // xc220-05: a perforated disc ring on each wheel's outer face, broken toward the bogie's middle where its calliper grips it
        const w = VOYAGER.wheelbase.value / 2;
        const r = VOYAGER.wheelDiameter.value / 2;
        for (const sx of [-1, 1]) {
          for (const az of [-w, w]) {
            const near = (p: THREE.Vector3): boolean => Math.sign(p.x) === sx && Math.abs(p.x) > 0.77 && Math.hypot(p.z - az, p.y - r) < r;
            const ring = ofColour(b, 0xaeb3b9).filter(near);
            const holes = ofColour(b, 0x1b1c1e).filter(near);
            const caliper = ofColour(b, 0x26282b).filter(near);
            assert.ok(ring.length >= 100 && holes.length >= 60, `${tag} disc ring at x ${sx}, z ${az}: ${ring.length} ring, ${holes.length} hole vertices`);
            assert.ok(caliper.length >= 24 && caliper.every((p) => Math.sign(p.z - az) === -Math.sign(az)), `${tag} calliper toward the middle at x ${sx}, z ${az}`);
            // the ring is broken where the calliper is: no ring vertex on the inboard horizontal near the axle line
            assert.ok(!ring.some((p) => Math.abs(p.y - r) < 0.05 && Math.sign(p.z - az) === -Math.sign(az)), `${tag} ring open toward the middle at x ${sx}, z ${az}`);
          }
        }
        continue;
      }
      // the 221 (voyager-bogie-01, unit 221139): the stencilled 2.70 m wheelbase; the frame outboard of the wheels on both sides; a round cover on each axle's line,
      // outboard of the frame; a coil spring beyond each axle at the bogie's end, over the axle line
      const w = VOYAGER.wheelbase221.value / 2;
      const r = VOYAGER.wheelDiameter.value / 2;
      assert.deepEqual(wheelZ, [-w, w], `${tag} wheelbase`);
      assert.ok(box.max.x > 1.05 && box.min.x < -1.05 && box.max.x <= 1.15 && box.min.x >= -1.15, `${tag} outside frame inside the envelope (x ${box.min.x}..${box.max.x})`);
      for (const sx of [-1, 1]) {
        for (const az of [-w, w]) {
          const covers = ofColour(b, 0x6c6258).filter((p) => Math.sign(p.x) === sx && Math.abs(p.x) > 1.06 && Math.abs(p.z - az) < 0.13 && Math.abs(p.y - r) < 0.13);
          assert.ok(covers.length >= 24, `${tag} axle-end cover at x ${sx}, z ${az}: ${covers.length}`);
          const springs = ofColour(b, 0x544a41).filter((p) => Math.sign(p.x) === sx && Math.sign(p.z) === Math.sign(az) && Math.abs(p.z) > w + 0.2 && p.y > r);
          assert.ok(springs.length >= 24, `${tag} end spring at x ${sx}, z ${az}: ${springs.length}`);
        }
        // the grilled box stands by one axle only, on the -z side of the +x beam and the +z side of the -x beam (the far beam is the near one turned half a turn)
        const grille = ofColour(b, 0x26221f).filter((p) => Math.sign(p.x) === sx);
        assert.ok(grille.length > 0 && grille.every((p) => Math.sign(p.z) === -sx), `${tag} grilled box on side ${sx}`);
      }
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

test('HST bogies: the power car rides the BP10 traced from hst-bogie-02, the coaches the BT10 traced from mk3-bogie-01, two different bogies', () => {
  const w = HST.wheelbase.value / 2;
  for (const kind of ['srhstx4', 'srhstx5'] as const) {
    for (const b of nearBogies(kind)) {
      const tag = `${kind} bogie-${b.car.index}-${b.k}`;
      const box = new THREE.Box3().setFromBufferAttribute(b.pos);
      assert.ok(box.max.x <= 1.15 && box.min.x >= -1.15, `${tag} inside the envelope (x ${box.min.x}..${box.max.x})`);
      if (b.car.body === 'class43') {
        assert.equal(b.type, 'bp10', tag);
        const r = HST.powerWheelDiameter.value / 2;
        for (const sx of [-1, 1]) {
          for (const az of [-w, w]) {
            // the axle box's cover on the axle's line, and a coil spring each side of the box (hst-bogie-02: the inboard one; its fellow outboard by symmetry)
            const covers = ofColour(b, 0x474a50).filter((p) => Math.sign(p.x) === sx && Math.abs(p.z - az) < 0.15 && Math.abs(p.y - r) < 0.15);
            assert.ok(covers.length >= 24, `${tag} cover at x ${sx}, z ${az}: ${covers.length}`);
            const springs = ofColour(b, 0x3d4045).filter((p) => Math.sign(p.x) === sx && Math.abs(Math.abs(p.z) - w) < 0.55 && Math.sign(p.z) === Math.sign(az));
            const inboard = springs.filter((p) => Math.abs(p.z) < w - 0.15).length;
            const outboard = springs.filter((p) => Math.abs(p.z) > w + 0.15).length;
            assert.ok(inboard >= 24 && outboard >= 24, `${tag} springs at x ${sx}, z ${az}: ${inboard} inboard, ${outboard} outboard`);
            // the vertical damper outboard of the box, standing over the axle line
            const damper = ofColour(b, 0x1d1f22).filter((p) => Math.sign(p.x) === sx && Math.sign(p.z) === Math.sign(az) && Math.abs(p.z) > w + 0.1);
            assert.ok(damper.length >= 20 && Math.max(...damper.map((p) => p.y)) > r + 0.2, `${tag} damper at x ${sx}, z ${az}`);
          }
          // the step at one end of each beam only (the near end of hst-bogie-02; the far beam's turned half a turn)
          const step = ofColour(b, 0x585c62).filter((p) => Math.sign(p.x) === sx);
          assert.ok(step.length > 0 && step.every((p) => Math.sign(p.z) === sx), `${tag} step on side ${sx}`);
          // only its top plate overhangs the axle box; the ladder under it (stiles and treads) hangs wholly inboard of the box (hst-bogie-02: stiles at px 393 and 505,
          // the cover at 297-377; round 5 ran the ladder across the box)
          // the plate's underside, from its traced row; anything of the step below it is the ladder
          const T = tracer(BP10_TRACE.caps, r, 2 * w, BP10_TRACE.view);
          const pl = BP10_TRACE.step.plate;
          const plateFoot = T.y(pl[3], (pl[0] + pl[2]) / 2, BOGIE_DEPTHS.bp10.step[1]);
          const ladder = step.filter((p) => p.y < plateFoot - 0.02);
          const boxIn = T.len(BP10_TRACE.caps[1][0] - BP10_TRACE.box[0]);
          assert.ok(ladder.length > 0 && ladder.every((p) => Math.abs(p.z) < w - boxIn),`${tag} ladder inboard of the box on side ${sx}: |z| up to ${Math.max(...ladder.map((p) => Math.abs(p.z)))}`);
        }
        // between the axles, what hst-bogie-02 shows there: the two cylinders along the middle, under the beam (no photograph shows a traction motor, so the kit
        // draws none: train-parts.ts draws no drive for its 'electrostar' style, a GAP shared with the London families)
        const cyl = ofColour(b, 0x2f3236).filter((p) => Math.abs(p.z) < w - 0.3 && p.y < r + 0.15);
        assert.ok(cyl.length >= 48, `${tag} middle cylinders: ${cyl.length}`);
        // the lower cylinder lies along the axle line, as the photograph's does (round 5 traced both its ends on one pixel row and tilted it 5 degrees)
        const lower = cyl.filter((p) => p.x > 0);
        const z0 = Math.min(...lower.map((p) => p.z));
        const z1 = Math.max(...lower.map((p) => p.z));
        const endY = (z: number): number => { const e = lower.filter((p) => Math.abs(p.z - z) < 0.1); return e.reduce((s, p) => s + p.y, 0) / e.length; };
        assert.ok(Math.abs(endY(z1) - endY(z0)) / (z1 - z0) < 0.05, `${tag} lower cylinder's tilt ${(endY(z1) - endY(z0)) / (z1 - z0)}`);
      } else {
        assert.equal(b.type, 'bt10', tag);
        const r = HST.coachWheelDiameter.value / 2;
        for (const sx of [-1, 1]) {
          for (const az of [-w, w]) {
            // the yellow coil spring outboard of each axle box (mk3-bogie-01), and the hexagonal cover on the axle's line
            const springs = ofColour(b, 0xe0b020).filter((p) => Math.sign(p.x) === sx && Math.sign(p.z) === Math.sign(az));
            assert.ok(springs.length >= 24 && springs.every((p) => Math.abs(p.z) > w + 0.1), `${tag} yellow spring outboard at x ${sx}, z ${az}`);
            const covers = ofColour(b, 0x3c3d40).filter((p) => Math.sign(p.x) === sx && Math.abs(p.z - az) < 0.16 && Math.abs(p.y - r) < 0.16);
            assert.ok(covers.length >= 12, `${tag} cover at x ${sx}, z ${az}: ${covers.length}`);
          }
        }
        // the straight black beam: its top level end to end (mk3-bogie-01's 100..108 px), about 0.42 m over the axle line
        const beam = ofColour(b, 0x1d1e20).filter((p) => Math.abs(p.x) > 0.96);
        const top = Math.max(...beam.map((p) => p.y));
        assert.ok(Math.abs(top - (r + (212 - 100) / (692 / HST.wheelbase.value))) < 0.005, `${tag} beam top ${top}`);
        // the middle is open: the tank hangs under the beam over a separate lower beam, with space between them (round 5 drew one slab that swallowed the tank)
        const tank = ofColour(b, 0x2c2d30).filter((p) => p.x > 0);
        const lowerBeam = ofColour(b, 0x232426).filter((p) => p.x > 0);
        const tankFoot = Math.min(...tank.map((p) => p.y));
        assert.ok(tank.length > 0 && lowerBeam.length > 0 && Math.max(...tank.map((p) => p.x)) > 0.85, `${tag} the tank shows`);
        const [tz0, tz1] = [Math.min(...tank.map((p) => p.z)), Math.max(...tank.map((p) => p.z))];
        // (a plate's vertices are its outline's corners: the lower beam's dip must have corners under the tank, and every one of them clear below it)
        const under = lowerBeam.filter((p) => p.z > tz0 + 0.02 && p.z < tz1 - 0.02);
        assert.ok(under.length >= 4 && under.every((p) => p.y < tankFoot - 0.005),`${tag} the lower beam stands clear under the tank (foot ${tankFoot}, lower beam to ${Math.max(...lowerBeam.map((p) => p.y))})`);
        // a coach's bogie carries no traction motor, nor the BP10's cylinders
        assert.equal(ofColour(b, 0x5b6068).length, 0, `${tag} no motors`);
        assert.equal(ofColour(b, 0x2f3236).length, 0, `${tag} no BP10 cylinders`);
      }
    }
  }
});

test('the bogie tracer: the two covers land on the two axles at the wheel\'s radius; the BP10\'s is calibrated against its wheels at both ends', () => {
  for (const [caps, view] of [[VOYAGER221_TRACE.caps, undefined], [BT10_TRACE.caps, undefined], [BP10_TRACE.caps, BP10_TRACE.view]] as const) {
    const T = tracer(caps, 0.5, 2.6, view);
    assert.ok(Math.abs(T.z(caps[0][0], caps[0][1]) - 1.3) < 1e-9 && Math.abs(T.z(caps[1][0], caps[1][1]) + 1.3) < 1e-9, `z of the covers ${T.z(caps[0][0], caps[0][1])}, ${T.z(caps[1][0], caps[1][1])}`);
    assert.ok(Math.abs(T.y(caps[0][1], caps[0][0]) - 0.5) < 1e-9 && Math.abs(T.y(caps[1][1], caps[1][0]) - 0.5) < 1e-9, 'y of the covers');
    // every point of the axle line is at the wheel's radius, however the picture is tilted
    const mid: [number, number] = [(caps[0][0] + caps[1][0]) / 2, (caps[0][1] + caps[1][1]) / 2];
    assert.ok(Math.abs(T.y(mid[1], mid[0]) - 0.5) < 1e-9 && Math.abs(T.z(mid[0], mid[1])) < 1e-9, 'the axle line');
  }
  // the BP10: where each wheel meets the rail head (standing at the wheel's contact, ASSUMED 0.75 m out) is the rail head, within 2 cm, at both ends
  const r = HST.powerWheelDiameter.value / 2;
  const T = tracer(BP10_TRACE.caps, r, HST.wheelbase.value, BP10_TRACE.view);
  for (const [px, py] of BP10_TRACE.rail) assert.ok(Math.abs(T.y(py, px, 0.75)) < 0.02, `rail head at px ${px}: ${T.y(py, px, 0.75)}`);
  // the 221's scale: 744 px over the stencilled 2.70 m
  const V = tracer(VOYAGER221_TRACE.caps, 0.43, 2.7);
  assert.ok(Math.abs(V.len(Math.hypot(744, 3)) - 2.7) < 1e-9);
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

test('HST joints carry pipework: each side of every buckeye a red-cocked brake pipe and a yellow-cocked main reservoir hose, and the supply jumper, each meeting its neighbour\'s at the gap\'s middle; the Voyager\'s Dellner joints have none', () => {
  const at = (car: THREE.Object3D, hex: number): THREE.Vector3[] => {
    const g = (car.getObjectByName('body-detail') as THREE.Mesh).geometry;
    return ofColour({ pos: g.getAttribute('position') as THREE.BufferAttribute, rgb: g.getAttribute('color') as THREE.BufferAttribute }, hex);
  };
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    const cars = intercityLayout(kind).cars;
    for (let i = 0; i + 1 < cars.length; i++) {
      const a = cars[i]!;
      const b = cars[i + 1]!;
      const tag = `${kind} joint ${i}/${i + 1}`;
      const sides = [root.getObjectByName(`car-${a.index}`)!, root.getObjectByName(`car-${b.index}`)!];
      if (!kind.startsWith('srhst')) {
        assert.ok(sides.every((c) => at(c, 0x18181a).length === 0), `${tag}: no HST pipework on a Voyager`);
        continue;
      }
      for (const car of sides) {
        const rubber = at(car, 0x18181a).filter((p) => Math.abs(p.z - a.end) < 0.4);
        // two hoses each side and the jumper: five runs, each reaching the joint's middle
        const meeting = rubber.filter((p) => Math.abs(p.z - a.end) < 0.002);
        const xs = [...new Set(meeting.map((p) => Math.round(p.x * 4)))];
        assert.ok(xs.some((x) => x <= -2) && xs.some((x) => x >= 2), `${tag}: hoses reach the middle on both sides (${xs.join(',')})`);
        assert.ok(meeting.length >= 5 * 8, `${tag}: ${meeting.length} hose vertices at the middle`);
        for (const [hex, name] of [[0xb3261e, 'brake pipe'], [0xd9a51a, 'main reservoir']] as const) {
          const cocks = at(car, hex).filter((p) => Math.abs(p.z - a.end) < 0.4);
          assert.ok(cocks.some((p) => p.x < -0.3) && cocks.some((p) => p.x > 0.3), `${tag}: ${name} cocks both sides`);
        }
      }
    }
  }
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
    // round 6: the hatches stand proud enough to throw a shadow (voyager-roof-01), their grilled tops at least 0.12 m over the crown
    assert.ok(grilles.every((p) => p.y > xf.crown + 0.12), `car ${car.index}: hatch tops at ${Math.min(...grilles.map((p) => p.y)) - xf.crown} over the crown`);
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
    // round 6: the slots are recessed between blades: a blade face beside every slot standing proud of the slot by about 2 cm, and the blades' walls
    const faces = verts(detail, 0x8c9299).filter((p) => Math.sign(p.x) === sx && p.y > 2.95 && p.y < 3.35);
    const walls = verts(detail, 0x4a4e55).filter((p) => Math.sign(p.x) === sx && p.y > 2.95 && p.y < 3.35);
    assert.ok(faces.length >= side.length && walls.length >= side.length, `class 43 side ${sx}: ${faces.length} blade-face and ${walls.length} wall vertices for ${side.length} slot vertices`);
    const outward = (p: THREE.Vector3): number => Math.abs(p.x) + (p.y - 3.0);
    const slotOut = Math.max(...side.map(outward));
    assert.ok(Math.min(...faces.map(outward)) > Math.min(...side.map(outward)) + 0.01 && Math.max(...faces.map(outward)) > slotOut + 0.01, `class 43 side ${sx}: blades proud of the slots`);
  }
});
