// The train model's contract: the group is the size core/train.ts says, every named part is where
// the layout says, and nothing pokes out of the published envelope. Pure geometry: no WebGL, no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { worldToShed } from '../../core/station.ts';
import { FIGURES, roofHeight, TRAIN_KINDS, trainLayout } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { LIVERIES } from '../src/livery.ts';
import { ASSUMED, buildTrain, carPlan, END_GAP, standTrain } from '../src/train.ts';
import { FLANGE_HEIGHT } from '../src/train-parts.ts';

const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

function built(kind: TrainKind): THREE.Group {
  const g = buildTrain(kind);
  g.updateMatrixWorld(true);
  return g;
}
const boxOf = (o: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(o);
const named = (root: THREE.Object3D, name: string): THREE.Object3D => {
  const o = root.getObjectByName(name);
  assert.ok(o, `${root.name} has no ${name}`);
  return o;
};
const all = (root: THREE.Object3D, name: string): THREE.Object3D[] => {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.name === name) out.push(o);
  });
  return out;
};
/** Every vertex of a mesh, in world space. */
function worldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const p = mesh.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
  return out;
}
const worldZ = (o: THREE.Object3D): number => o.getWorldPosition(new THREE.Vector3()).z;

test('train: the root carries kind, length and car count, and the group is as long as the layout says', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    assert.equal(g.userData.kind, kind);
    assert.equal(g.userData.cars, layout.cars.length);
    near(g.userData.length as number, layout.length, 1e-9, `${kind} userData.length`);
    const b = boxOf(g);
    near(b.min.z, 0, 0.01, `${kind} nose at z = 0`);
    near(b.max.z, layout.length, 0.01, `${kind} overall length`);
  }
});

test('train: each car sits at its place in the layout, is exactly body-wide, and carries only its own parts', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    assert.equal(g.children.filter((c) => /^car-\d+$/.test(c.name)).length, layout.cars.length, `${kind} car groups`);
    for (const car of layout.cars) {
      const group = named(g, `car-${car.index}`);
      const b = boxOf(group);
      near(b.min.z, car.start, 0.01, `${kind} car ${car.index} start`);
      near(b.max.z, car.end, 0.01, `${kind} car ${car.index} end`);
      near(b.max.z - b.min.z, car.length, 0.01, `${kind} car ${car.index} length`);
      // the body is bodyWidth wide; wheels and the pantograph are narrower, so the whole car is too
      const body = new THREE.Box3().union(boxOf(named(group, 'body-shell'))).union(boxOf(named(group, 'body-detail')));
      near(body.max.x - body.min.x, FIGURES.bodyWidth.value, 0.02, `${kind} car ${car.index} body width`);
      assert.ok(b.max.x - b.min.x <= FIGURES.bodyWidth.value + 0.02, `${kind} car ${car.index}: something is wider than the body (${b.max.x - b.min.x})`);
      near((b.max.x + b.min.x) / 2, 0, 0.01, `${kind} car ${car.index} centred on the track`);
    }
  }
});

test('train: the roof covers reach the published roof height and nothing goes above it or below the rail head but a wheel flange', () => {
  for (const kind of TRAIN_KINDS) {
    const b = boxOf(built(kind));
    near(b.max.y, roofHeight(), 0.02, `${kind} highest point`);
    assert.ok(b.max.y >= roofHeight() - 0.1, `${kind} highest point ${b.max.y} is below the covers`);
    // CHANGED with the flanged wheels (it was `near(b.min.y, 0, 0.01)`): the treads still sit on the rail head (the bogie test pins
    // that), but a flange stands FLANGE_HEIGHT below the running surface, in the gap beside the rail
    near(b.min.y, -FLANGE_HEIGHT, 0.005, `${kind} lowest point: the wheel flanges`);
  }
});

test('train: a through car\'s cross-section rises from the top of the side wall to a crown on the centre line at the roof edge, with no dent', () => {
  const g = built('lner5');
  const car = trainLayout('lner5').cars[1];
  assert.ok(car && car.cab === null, 'car 1 is a through car');
  const group = named(g, `car-${car.index}`);
  // the vertices of the section at the body's end (it stands END_GAP inside the car's start now, with the gangway in the gap;
  // it was `car.start` before the gangways), the right half from the wall up: the side is in body-shell and the roof in body-detail
  const seen = new Map<string, [number, number]>();
  for (const part of ['body-shell', 'body-detail']) {
    for (const v of worldVertices(named(group, part) as THREE.Mesh)) {
      if (Math.abs(v.z - (car.start + END_GAP)) > 1e-6 || v.x < -1e-6 || v.y < 2.9 - 1e-6) continue;
      seen.set(`${v.x.toFixed(6)},${v.y.toFixed(6)}`, [v.x, v.y]);
    }
  }
  const profile = [...seen.values()].sort((a, b) => a[1] - b[1]);
  assert.ok(profile.length >= 5, `only ${profile.length} points between the wall top and the crown`);
  for (let i = 1; i < profile.length; i++) {
    const [x0, y0] = profile[i - 1] as [number, number];
    const [x1, y1] = profile[i] as [number, number];
    assert.ok(y1 > y0 + 1e-6 && x1 < x0 - 1e-6, `the roof curve dents between (${x0.toFixed(3)}, ${y0.toFixed(3)}) and (${x1.toFixed(3)}, ${y1.toFixed(3)})`);
  }
  const crown = profile[profile.length - 1] as [number, number];
  near(crown[0], 0, 1e-6, 'the crown is on the centre line');
  near(crown[1], FIGURES.roofEdgeHeight.value, 1e-6, 'the crown is at the roof edge');
  near((profile[0] as [number, number])[1], 2.9, 1e-6, 'the curve starts at the top of the side wall');
});

test('train: every bogie is at its layout position with four wheels of the right size on the rail head', () => {
  const radius = FIGURES.wheelDiameter.value / 2;
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    for (const car of trainLayout(kind).cars) {
      car.bogies.forEach((z, k) => {
        const bogie = named(g, `bogie-${car.index}-${k}`);
        near(worldZ(bogie), z, 0.01, `${kind} bogie ${car.index}-${k} z`);
        const wheels = bogie.children.filter((c) => c.name === 'wheel');
        assert.equal(wheels.length, 4, `${kind} bogie ${car.index}-${k} wheels`);
        const spots = new Set<string>();
        for (const w of wheels) {
          assert.equal(w.userData.radius, radius, 'wheel radius is wheelDiameter / 2');
          near(w.position.y, radius, 1e-9, 'wheel axle height');
          near(Math.abs(w.position.x), FIGURES.gauge.value / 2, 1e-9, 'wheel track is the gauge');
          near(Math.abs(w.position.z), FIGURES.bogieWheelbase.value / 2, 1e-9, 'axle spacing is the wheelbase');
          spots.add(`${Math.sign(w.position.x)},${Math.sign(w.position.z)}`);
        }
        assert.equal(spots.size, 4, 'one wheel at each corner');
        // the markers are not decoration: the merged mesh has a wheel tread on the rail head under each one
        const mesh = named(bogie, 'bogie-mesh') as THREE.Mesh;
        const vs = worldVertices(mesh);
        for (const w of wheels) {
          const at = w.getWorldPosition(new THREE.Vector3());
          assert.ok(
            vs.some((v) => Math.abs(v.y) < 1e-6 && Math.abs(v.z - at.z) < 1e-4 && Math.abs(v.x - at.x) <= (w.userData.width as number) / 2 + 1e-4),
            `${kind} bogie ${car.index}-${k}: no wheel tread under the marker at x=${at.x}, z=${at.z}`,
          );
        }
        const bb = boxOf(mesh);
        // CHANGED with the flanged wheels (it was 0): the flange dips FLANGE_HEIGHT below the treads, which the vertex check above pins at 0
        near(bb.min.y, -FLANGE_HEIGHT, 0.005, 'bogie bottom: the flanges');
        // CHANGED with the flanges (it was wheelbase + wheel, within 0.05): the flange is the widest part of a wheel, FLANGE_HEIGHT outside the tread
        near(bb.max.z - bb.min.z, FIGURES.bogieWheelbase.value + FIGURES.wheelDiameter.value + 2 * FLANGE_HEIGHT, 0.02, 'bogie length is the wheelbase plus a flanged wheel');
        assert.ok(bb.max.y < 1.0, 'the bogie fits under the floor');
      });
    }
  }
});

test('train: two pantographs, one on each driving car, folded, over the span the layout gives', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const pans = all(g, 'pantograph');
    const carriers = layout.cars.filter((c) => c.pantograph !== null);
    assert.equal(carriers.length, 2, `${kind} cars with a pantograph in the layout`);
    assert.equal(pans.length, 2, `${kind} pantographs`);
    for (const car of carriers) {
      const pan = pans.find((p) => p.parent?.name === `car-${car.index}`);
      assert.ok(pan, `${kind} car ${car.index} has its pantograph`);
      const [p0, p1] = car.pantograph as readonly [number, number];
      const b = boxOf(pan as THREE.Object3D);
      near(b.min.z, p0, 0.02, `${kind} pantograph base start`);
      near(b.max.z, p1, 0.02, `${kind} pantograph base end`);
      near(b.max.y, FIGURES.roofEdgeHeight.value + FIGURES.pantographFoldedHeight.value, 0.01, `${kind} folded height above the roof edge`);
      assert.ok(b.max.y < roofHeight(), `${kind} the folded pantograph stays under the roof covers`);
      assert.ok(b.min.y >= FIGURES.roofEdgeHeight.value - 0.05, `${kind} pantograph stands on the roof`);
      assert.ok(b.max.x - b.min.x < FIGURES.bodyWidth.value, `${kind} pantograph is narrower than the body`);
      // the roof covers leave the pantograph's span clear
      const carBox = boxOf(named(g, `car-${car.index}`));
      assert.ok(carBox.max.y <= roofHeight() + 0.02);
    }
  }
});

test('train: two single-leaf doors per side per car, on the car and on the skin of the body', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    for (const car of trainLayout(kind).cars) {
      const group = named(g, `car-${car.index}`);
      const doors = all(group, 'door');
      for (const side of ['left', 'right']) {
        const ds = doors.filter((d) => d.userData.side === side);
        assert.equal(ds.length, 2, `${kind} car ${car.index} ${side} doors`);
        for (const d of ds) {
          const at = d.getWorldPosition(new THREE.Vector3());
          assert.ok(at.z > car.start && at.z < car.end, `${kind} car ${car.index}: a door is outside its car`);
          near(Math.abs(at.x), FIGURES.bodyWidth.value / 2, 1e-9, 'a door is on the side of the body');
        }
        // one near each end, not both together
        const zs = ds.map((d) => d.getWorldPosition(new THREE.Vector3()).z).sort((a, b) => a - b);
        assert.ok((zs[1] as number) - (zs[0] as number) > car.length / 2, `${kind} car ${car.index}: the two doors are at the same end`);
      }
      assert.equal(doors.length, 4, `${kind} car ${car.index} doors in all`);
      // each door is drawn: the body mesh has an outer face at the door's x, within the door's width of its z
      const vs = worldVertices(named(group, 'body-detail') as THREE.Mesh);
      for (const d of doors) {
        const at = d.getWorldPosition(new THREE.Vector3());
        assert.ok(
          vs.some((v) => Math.abs(v.x - at.x) < 1e-6 && Math.abs(v.z - at.z) <= (d.userData.width as number) / 2),
          `${kind} car ${car.index}: no door geometry at z=${at.z}`,
        );
      }
    }
  }
});

test('train: a cab narrows in plan and slopes in elevation toward the end of the train, and stays inside its own car', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    for (const car of layout.cars) {
      const group = named(g, `car-${car.index}`);
      const body = [named(group, 'body-shell') as THREE.Mesh, named(group, 'body-detail') as THREE.Mesh].flatMap(worldVertices);
      const tipSide = car.cab === 'front' ? (z: number) => z - car.start : (z: number) => car.end - z;
      if (car.cab === null) continue;
      const nearTip = body.filter((v) => tipSide(v.z) < 0.3 && v.y > 0.7);
      assert.ok(nearTip.length > 0, `${kind} car ${car.index}: no nose`);
      assert.ok(Math.max(...nearTip.map((v) => Math.abs(v.x))) < 0.9, `${kind} car ${car.index}: the nose tip is not narrow`);
      assert.ok(Math.max(...nearTip.map((v) => v.y)) < FIGURES.roofEdgeHeight.value - 1.0, `${kind} car ${car.index}: the nose tip is not lower than the roof`);
      // vertices are float32, so a z near 130 m is only good to about 1e-5
      assert.ok(body.every((v) => v.z >= car.start - 1e-4 && v.z <= car.end + 1e-4), `${kind} car ${car.index}: the body leaves its own car`);
    }
    // cars with no cab have none of that: full width at both ends
    const mid = named(g, 'car-1');
    const midBody = worldVertices(named(mid, 'body-shell') as THREE.Mesh);
    assert.ok(Math.max(...midBody.map((v) => Math.abs(v.x))) > 1.3);
  }
});

test('train: a nine-car train draws in no more than 80 calls, with four materials in all', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    let meshes = 0;
    const materials = new Set<THREE.Material>();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        meshes++;
        materials.add(m.material as THREE.Material);
      }
    });
    assert.ok(meshes <= 80, `${kind} has ${meshes} meshes`);
    // CHANGED from 3 (the shared vertex-colour material and a shell material for each of the two roles): the shell is now one
    // material per livery (a through car reads the texture's last column), and the cab glass (reflective) and the lettering
    // (one atlas) each need their own: plain, shell, decals, glass
    assert.ok(materials.size <= 4, `${kind} uses ${materials.size} materials`);
  }
  // the bogie mesh geometry is built once and shared
  const g = built('lner9');
  const geos = new Set<THREE.BufferGeometry>();
  g.traverse((o) => {
    if (o.name === 'bogie-mesh') geos.add((o as THREE.Mesh).geometry);
  });
  assert.equal(geos.size, 1);
});

test('train: every livery says how good its colours are and cites its sources, and the Hull Trains door colour is flagged as unverified', () => {
  for (const [name, def] of Object.entries(LIVERIES)) {
    assert.ok(def.basis.length > 10, `${name} has no basis note`);
    assert.ok(def.sources.length >= 1 && def.sources.every((x) => x.length > 20), `${name} cites no source`);
  }
  // CHANGED (it asserted the whole Hull Trains livery was a PLACEHOLDER): the body and nose cone are now sourced from two articles;
  // the door colour is from one snippet that could not be opened, and the basis says so
  assert.doesNotMatch(LIVERIES.hulltrains.basis, /PLACEHOLDER/);
  assert.match(LIVERIES.hulltrains.basis, /door colour .*single unopened snippet/);
  assert.doesNotMatch(LIVERIES.lner.basis, /PLACEHOLDER/);
});

test('train: a standing train is nose-in at its buffer stop with every car north of it, on the stop track', () => {
  const heading = 0.0287;
  const shed = { origin: [7, -13] as [number, number], heading };
  const stop = { x: 30, z: -20 };
  const toShed = (x: number, z: number): { u: number; v: number } => worldToShed(shed, [x, z]);
  const s = toShed(stop.x, stop.z);
  for (const kind of TRAIN_KINDS) {
    const g = buildTrain(kind);
    const nose = standTrain(g, shed, stop, 1.5);
    const noseShed = toShed(nose[0], nose[2]);
    near(noseShed.v, s.v + 1.5, 1e-6, `${kind} nose is 1.5 m north of the stop`);
    // each car's middle is on the track line, and the cars follow one another northwards
    let last = s.v;
    for (const car of trainLayout(kind).cars) {
      const c = boxOf(named(g, `car-${car.index}`)).getCenter(new THREE.Vector3());
      const p = toShed(c.x, c.z);
      near(p.u, s.u, 0.2, `${kind} car ${car.index} on the track line`);
      near(p.v, s.v + 1.5 + (car.start + car.end) / 2, 0.2, `${kind} car ${car.index} along the track`);
      assert.ok(p.v > last, `${kind} car ${car.index} is further north than the one before`);
      last = p.v;
    }
    // the rear of the last car is a full train length north of the nose
    const rear = new THREE.Vector3(0, 0, trainLayout(kind).length).applyMatrix4(g.matrixWorld);
    near(toShed(rear.x, rear.z).v, noseShed.v + trainLayout(kind).length, 1e-6, `${kind} rear along`);
    near(toShed(rear.x, rear.z).u, s.u, 1e-6, `${kind} rear across`);
  }
});

test('train: windows sit between the doors, about 2 m apart: nine on a through car, six on a driving car', () => {
  for (const kind of TRAIN_KINDS) {
    for (const car of trainLayout(kind).cars) {
      const p = carPlan(car);
      // gbtrains.uk: "the DPTS has six saloon windows"; the through cars are the same length with a door at each end
      assert.equal(p.windows.length, car.cab !== null ? 6 : 9, `${kind} car ${car.index} ${car.type} window count`);
      assert.equal(p.doors.length, 2, `${kind} car ${car.index} doors`);
      const [d0, d1] = p.doors as [number, number];
      const first = p.windows[0] as [number, number];
      // a window is 1.6 to 1.75 m long: the 2 to 2.15 m pitch less a 0.4 m pier (an assumption; none is published)
      assert.ok(first[1] - first[0] > 1.45 && first[1] - first[0] < 1.8, `${kind} car ${car.index} window length ${first[1] - first[0]}`);
      for (const [a, b] of p.windows) {
        assert.ok(a >= d0 + ASSUMED.doorWidth / 2 && b <= d1 - ASSUMED.doorWidth / 2, `${kind} car ${car.index} window ${a}-${b} between the doors`);
        near(b - a, first[1] - first[0], 1e-9, 'every window is the same size');
      }
      for (let k = 1; k < p.windows.length; k++) {
        const pitch = (p.windows[k] as [number, number])[0] - (p.windows[k - 1] as [number, number])[0];
        assert.ok(pitch > 1.9 && pitch < 2.25, `${kind} car ${car.index} window pitch ${pitch}`);
      }
    }
  }
});

test('train: the liveries are what they are named for: LNER white with a red sweep, Lumo blue, Hull Trains dark blue with a dark nose cone', () => {
  const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const [lr, lg, lb] = rgb(LIVERIES.lner.body);
  assert.ok(lr > 225 && lg > 225 && lb > 220, 'LNER body is white');
  assert.notEqual(LIVERIES.lner.swoosh, null, 'LNER has a sweep');
  const [sr, sg, sb] = rgb(LIVERIES.lner.swoosh as number);
  assert.ok(sr > 170 && sg < 60 && sb < 80, 'the LNER sweep is red');
  const [wr, wg, wb] = rgb(LIVERIES.lner.surround as number);
  assert.ok(wr < 40 && wg < 40 && wb < 40, 'the LNER window surround is black');
  const [yr, yg, yb] = rgb(LIVERIES.lner.noseFront);
  assert.ok(yr > 220 && yg > 170 && yb < 40, 'the LNER nose front is yellow');
  const [br, bg, bb] = rgb(LIVERIES.lumo.body);
  assert.ok(bb > 170 && br < 60 && bg < 110, 'the Lumo body is blue');
  // CHANGED (it asserted the Hull Trains livery was an unsourced PLACEHOLDER): dark blue body and a dark grey/black nose cone, from two articles
  const [hr, hg, hb] = rgb(LIVERIES.hulltrains.body);
  assert.ok(hb > hr + 30 && hb > hg + 20 && hb < 140, 'the Hull Trains body is dark blue');
  assert.notEqual(LIVERIES.hulltrains.noseCone, null, 'the Hull Trains nose cone is its own colour');
  const [nr, ng, nb] = rgb(LIVERIES.hulltrains.noseCone as number);
  assert.ok(nr < 70 && ng < 70 && nb < 70, 'the Hull Trains nose cone is dark grey or black');
  assert.match(LIVERIES.lner.basis, /sourced/);
  assert.match(LIVERIES.lumo.basis, /blue sourced/);
});
