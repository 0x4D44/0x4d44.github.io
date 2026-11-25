import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CLOCK_TOWER_HEIGHT } from '../../core/station.ts';
import { buildTower, TOWER_SIZE } from '../src/shed.ts';

// Tower round 2 (rubric A4), the fresh scorer against R-kx-front-c: brick corner pilasters with the panel recessed between them, a low hipped
// dark cap whose edge stands past the corona, a soffit and frieze that are not near-black, and a compass cross under the vane's banner.
const tower = buildTower(0);
tower.position.set(0, 0, 0);
tower.updateMatrixWorld(true);
const named = (n: string): THREE.Mesh => { const m = tower.getObjectByName(n) as THREE.Mesh | undefined; assert.ok(m, `${n} is built`); return m; };
const hit = (o: THREE.Vector3, d: THREE.Vector3, target: THREE.Object3D): THREE.Intersection | undefined => new THREE.Raycaster(o, d, 0, 60).intersectObject(target, false)[0];
const south = (x: number, y: number, target: THREE.Object3D): number | null => hit(new THREE.Vector3(x, y, 30), new THREE.Vector3(0, 0, -1), target)?.point.z ?? null;
const shaftTop = CLOCK_TOWER_HEIGHT - 8.2, eavesY = CLOCK_TOWER_HEIGHT - 3.3;
/** each triangle of a mesh: its corners, the normal its winding gives and its three vertex normals */
const triangles = (m: THREE.Mesh): { p: THREE.Vector3[]; n: THREE.Vector3; vn: THREE.Vector3[] }[] => {
  const pos = m.geometry.getAttribute('position'), nor = m.geometry.getAttribute('normal'), idx = m.geometry.index;
  const out = [], count = idx ? idx.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const k = [0, 1, 2].map(j => (idx ? idx.getX(i + j) : i + j));
    const p = k.map(v => new THREE.Vector3().fromBufferAttribute(pos, v));
    const n = new THREE.Vector3().crossVectors(p[1]!.clone().sub(p[0]!), p[2]!.clone().sub(p[0]!)).normalize();
    out.push({ p, n, vn: k.map(v => new THREE.Vector3().fromBufferAttribute(nor, v)) });
  }
  return out;
};

test('the shaft\'s corners are pilasters in the panel\'s brick, about 0.13 of the shaft wide, the panel 0.15 m behind them (R-kx-front-c)', () => {
  const brick = named('tower-brick');
  for (const y of [8, 15, shaftTop - 1.5]) {
    const panel = south(0, y, brick);
    assert.ok(panel !== null && Math.abs(panel - TOWER_SIZE / 2) < 0.02, `the panel at ${y} m is the shaft's face`);
    let front = -Infinity, run = 0, x0 = Infinity, x1 = -Infinity;
    for (let x = -TOWER_SIZE; x <= TOWER_SIZE; x += 0.01) {
      const first = new THREE.Raycaster(new THREE.Vector3(x, y, 30), new THREE.Vector3(0, 0, -1), 0, 60).intersectObject(tower, true)[0];
      if (!first) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      if ((first.object as THREE.Mesh).name !== 'tower-brick') continue; // the slits
      front = Math.max(front, first.point.z);
      if (x > 0 && first.point.z > panel! + 0.1) run += 0.01;
    }
    assert.ok(Math.abs(front - panel! - 0.15) < 0.02, `the pilasters stand ${(front - panel!).toFixed(2)} m proud of the panel at ${y} m, in brick`);
    const ratio = run / (x1 - x0);
    assert.ok(ratio >= 0.11 && ratio <= 0.15, `a pilaster ${ratio.toFixed(3)} of the shaft's ${(x1 - x0).toFixed(2)} m`);
  }
});

test('the cap is a low hipped dark metal roof, about 0.6 m high, its dark edge 0.2 m deep or more and standing past the corona', () => {
  const cap = named('tower-cap'), pos = cap.geometry.getAttribute('position'), v = new THREE.Vector3(), clockY = eavesY - 2;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) if (v.fromBufferAttribute(pos, i).y > clockY) pts.push(v.clone());
  const outer = Math.max(...pts.map(p => p.z)), rim = pts.filter(p => p.z > outer - 1e-6);
  const edgeTop = Math.max(...rim.map(p => p.y)), edgeFoot = Math.min(...rim.map(p => p.y)), apex = Math.max(...pts.map(p => p.y));
  assert.ok(edgeTop - edgeFoot >= 0.2, `the dark edge ${(edgeTop - edgeFoot).toFixed(2)} m deep`);
  assert.ok(apex - edgeTop >= 0.45 && apex - edgeTop <= 0.8, `the hip rises ${(apex - edgeTop).toFixed(2)} m`);
  let corona = -Infinity;
  for (let y = eavesY; y < edgeFoot; y += 0.02) corona = Math.max(corona, south(0.05, y, named('tower-stone')) ?? -Infinity);
  assert.ok(outer - corona >= 0.1, `the edge stands ${(outer - corona).toFixed(2)} m past the corona`);
});

test('the soffit under the corona and the frieze between the brackets take the sky\'s light: their normals turned out, not straight down', () => {
  const sky = (n: THREE.Vector3): number => (1 + n.y) / 2; // the hemisphere light's sky share for a normal
  const cw = TOWER_SIZE - 1.8;
  let soffit = 0, frieze = 0;
  for (const t of triangles(named('tower-stone'))) {
    const c = t.p.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(3), out = Math.max(Math.abs(c.x), Math.abs(c.z));
    if (t.n.y < -0.9 && c.y > eavesY + 1 && out > cw / 2 + 0.05) {
      soffit++;
      for (const n of t.vn) assert.ok(sky(n) >= 0.3 && n.x * c.x + n.z * c.z > 0, `a soffit's normal (${n.toArray().map(q => q.toFixed(2))}) takes ${sky(n).toFixed(2)} of the sky, turned out`);
    }
    if (Math.abs(t.n.y) < 0.1 && c.y > eavesY && c.y < eavesY + 0.3 && Math.abs(out - (cw / 2 + 0.1)) < 0.01) {
      frieze++;
      for (const n of t.vn) assert.ok(sky(n) >= 0.65, `the frieze between the brackets takes ${sky(n).toFixed(2)} of the sky`);
    }
  }
  assert.ok(soffit >= 8 && frieze >= 8, `the corona's soffit (${soffit}) and the frieze's faces (${frieze}) are drawn`);
});

test('the vane carries a compass cross well under its banner, arms about 0.9 m each way, a letter over each arm\'s end, clear of the cap', () => {
  const vane = named('tower-vane'), cap = named('tower-cap');
  const ys: number[] = [];
  for (let y = CLOCK_TOWER_HEIGHT - 2; y < CLOCK_TOWER_HEIGHT; y += 0.01) if (south(0.6, y, vane) !== null) ys.push(y);
  const foot = Math.min(...ys), arms = ys.filter(y => y < foot + 0.1), arm = (foot + Math.max(...arms)) / 2, banner = Math.min(...ys.filter(y => y > foot + 0.1));
  assert.ok(banner - arm >= 0.35, `the cross ${(banner - arm).toFixed(2)} m under the banner's foot`);
  for (const [o, d] of [[[30, arm, 0], [-1, 0, 0]], [[-30, arm, 0], [1, 0, 0]], [[0, arm, 30], [0, 0, -1]], [[0, arm, -30], [0, 0, 1]]] as const) {
    const h = hit(new THREE.Vector3(...o), new THREE.Vector3(...d), vane);
    assert.ok(h && Math.hypot(h.point.x, h.point.z) >= 0.85 && Math.hypot(h.point.x, h.point.z) <= 1.1, `an arm reaches ${h ? Math.hypot(h.point.x, h.point.z).toFixed(2) : 'nothing'} m`);
  }
  const letterY = arm + 0.18;
  for (const [o, d, name] of [[[0.77, letterY, 30], [0, 0, -1], 'E'], [[-0.77, letterY, 30], [0, 0, -1], 'W'], [[30, letterY, -0.77], [-1, 0, 0], 'N'], [[30, letterY, 0.77], [-1, 0, 0], 'S']] as const) {
    // a 9 x 9 grid of rays through the letter's 0.24 m square: a letter's bars, not a stray end
    let on = 0;
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      const a = (i * 0.12) / 4, o2 = d[0] === 0 ? [o[0] + a, o[1] + (j * 0.12) / 4, o[2]] : [o[0], o[1] + (j * 0.12) / 4, o[2] + a];
      if (hit(new THREE.Vector3(...o2), new THREE.Vector3(...d), vane)) on++;
    }
    assert.ok(on >= 8, `the ${name} letter: ${on} of 81 rays meet it`);
  }
  for (const [x, z] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
    const roof = hit(new THREE.Vector3(x, CLOCK_TOWER_HEIGHT + 5, z), new THREE.Vector3(0, -1, 0), cap);
    assert.ok(roof && roof.point.y < arm - 0.1, `the cap ${roof ? (arm - roof.point.y).toFixed(2) : '?'} m under an arm's end`);
  }
});
