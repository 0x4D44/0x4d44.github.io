import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { SCOTRAIL_DMU_FIGURES, SCOTRAIL_DMU_KINDS, scotrailDmuLayout } from '../../core/train-scotrail-dmu.ts';
import { bsiCoupler, BUFFER_170_Y, buildScotrailDmu, CHROME, SALTIRE_BLUE, VALANCE_170, VALANCE_170_PROUD, disposeScotrailDmu, FRAME as FRAME_COLOUR, dmuCarPlan, DOT_BLUE, DOT_WHITE, GANGWAY_158, GANGWAY_INNER, GANGWAY_RUBBER, LAMP_170, LAMP_170_HOUSING, LAMP_170_PROUD, SR_YELLOW, scotrailDmuFormation, scotrailDmuLook, TUMBLEHOME } from '../src/train-scotrail-dmu.ts';
import { lensLook, SERVICE_LAMPS, setTrainLampState } from '../src/train.ts';
import type { LensRole, TrainLampMode, TrainLampState } from '../src/train.ts';
import { col, Soup } from '../src/train-geom.ts';
import { BOGIE_HALF_WIDTH, BOGIE_TOP, couplerHalf } from '../src/train-parts.ts';
import { DMU_BOGIE_COLOURS, dmuBeamAt, dmuBogieFarSoup, dmuBogieSoup, dmuFrameSoup, P4_SPRING } from '../src/train-scotrail-dmu-bogie.ts';
import { atlasHeight, atlasRect, atlasTexts, registerAtlasTexts, ROW_H } from '../src/livery.ts';
import type { CouplerStyle } from '../src/train-parts.ts';

const names = (root: THREE.Object3D): string[] => { const out: string[] = []; root.traverse((o) => out.push(o.name)); return out; };

test('ScotRail DMU builder: one car group per car spanning its own extent, assumed-fleet metadata', () => {
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    const layout = scotrailDmuLayout(kind);
    assert.equal(root.userData.kind, kind);
    assert.equal(root.userData.length, layout.length);
    assert.equal(root.userData.pantographs, 0);
    assert.match(root.userData.assumptions, /ASSUMED/);
    assert.deepEqual(root.children.map((c) => c.name), layout.cars.map((c) => `car-${c.index}`));
    for (const car of layout.cars) {
      const g = root.getObjectByName(`car-${car.index}`)!;
      const b = new THREE.Box3().setFromObject(g);
      assert.ok(b.min.z >= car.start - 1e-3 && b.max.z <= car.end + 1e-3, `${kind} car ${car.index} stays in [${car.start}, ${car.end}]: ${b.min.z}..${b.max.z}`);
    }
    disposeScotrailDmu(root);
  }
});

test('ScotRail DMU geometry: finite, the published width within a door relief, the roof under its height plus the housings', () => {
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    const f = SCOTRAIL_DMU_FIGURES[scotrailDmuLayout(kind).spec.family];
    let finite = true; let triangles = 0;
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.name === 'bogie-mesh') return;
      const a = o.geometry.getAttribute('position'); triangles += a.count / 3;
      finite &&= Array.from(a.array as ArrayLike<number>).every(Number.isFinite);
      const c = o.geometry.getAttribute('color');
      if (c) assert.equal(c.count, a.count, `${kind} ${o.name}: a colour for every vertex`);
    });
    const box = new THREE.Box3().setFromObject(root);
    // (the body and its fittings, without the bogies: a wheel's flange rightly reaches below the rail head)
    const body = new THREE.Box3();
    root.traverse((o) => { if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') body.expandByObject(o, true); });
    assert.ok(finite);
    assert.ok(Math.abs(box.max.x - box.min.x - f.width.value) < 0.02, `${kind} width ${box.max.x - box.min.x}`);
    // the drawn top is the roof top the capture tool is told (the crown plus the tallest housing), to float32's precision
    const roofTop = scotrailDmuFormation(kind).roofTop;
    assert.ok(roofTop <= f.height.value + 0.15, `${kind} roof top ${roofTop}`);
    assert.ok(Math.abs(box.max.y - roofTop) < 1e-5, `${kind} top ${box.max.y}, told ${roofTop}`);
    assert.ok(body.min.y >= 0.1, `${kind} body and fittings clear the rail head: ${body.min.y}`);
    assert.ok(triangles / root.children.length < 40000, `${kind}: ${triangles / root.children.length} triangles a car, under the 40k budget`);
  }
});

test('ScotRail DMU parts: diesel units with no pantograph, two bogies and two doors a side per car, both cabs glazed and lit', () => {
  const tally = (kind: (typeof SCOTRAIL_DMU_KINDS)[number]) => {
    const root = buildScotrailDmu(kind);
    const n = names(root);
    const count = (name: string): number => n.filter((x) => x === name).length;
    const heads: boolean[] = [];
    root.traverse((o) => { if (o.name === 'headlight') heads.push(o.userData.lit as boolean); });
    return {
      pantograph: count('pantograph'), bogies: n.filter((x) => /^bogie-\d+-\d$/.test(x)).length, doors: count('door'), glass: count('cab-glass'),
      underfloor: count('underfloor'), noseCouplers: count('nose-coupler'), buffers: count('buffer'), litHeads: heads.filter(Boolean).length, heads: heads.length,
      domeLamps: count('dome-lamp'), ploughs: count('plough'), roofKit: count('roof-equipment'),
    };
  };
  // (round 2: the 170's dome marker lamp; the 158's sloped plough, and its cab roof a low housing at each roof edge, not a slab across it)
  // (round 4, from the roof photographs: the 170 cab car's scoop, grille, housing and vent panel, and two vent panels on every car;
  // the 158's two cab-roof units and, on every car, the exhaust group of plate, cover, louvred box and hump)
  // (round 4, from bogie-158-a2: the 158's eight masses a car, the air cleaner, silencer and reservoir drums added to the five boxes)
  assert.deepEqual(tally('sr170x3'), { pantograph: 0, bogies: 6, doors: 12, glass: 3, underfloor: 15, noseCouplers: 2, buffers: 4, litHeads: 2, heads: 4, domeLamps: 2, ploughs: 0, roofKit: 25 });
  assert.deepEqual(tally('sr158x2'), { pantograph: 0, bogies: 4, doors: 8, glass: 2, underfloor: 16, noseCouplers: 2, buffers: 0, litHeads: 2, heads: 4, domeLamps: 0, ploughs: 2, roofKit: 12 });
});

test('ScotRail DMU front: the leading cab lights its headlights, the trailing cab its tail lamps', () => {
  const root = buildScotrailDmu('sr158x2');
  const heads: { z: number; lit: boolean }[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.name === 'headlight') heads.push({ z: o.getWorldPosition(new THREE.Vector3()).z, lit: o.userData.lit as boolean }); });
  const length = scotrailDmuLayout('sr158x2').length;
  assert.ok(heads.filter((h) => h.z < 1).every((h) => h.lit) && heads.filter((h) => h.z > length - 1).every((h) => !h.lit));
});

test('ScotRail DMU glazing: the 170 has four panes between its doors on every car, and only the DMCL carries the yellow first-class line', () => {
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const layout = scotrailDmuLayout(kind);
    const look = scotrailDmuLook(layout.spec.family);
    const root = buildScotrailDmu(kind);
    for (const car of layout.cars) {
      const plan = dmuCarPlan(car, look);
      const [d0, d1] = plan.doors as [number, number];
      const between = plan.windows.filter(([a, b]) => a > d0 && b < d1).length;
      if (kind === 'sr170x3') assert.equal(between, 4, `${kind} car ${car.index}: panes between the doors`);
      const lines = names(root.getObjectByName(`car-${car.index}`)!).filter((n) => n === 'first-class-line').length;
      assert.equal(lines, car.type === 'DMCL' ? 1 : 0, `${kind} car ${car.index} (${car.type}): first-class line`);
      // every pane keeps a pillar between it and the next
      plan.windows.forEach(([, b], i) => { const next = plan.windows[i + 1]; if (next) assert.ok(next[0] - b >= look.windowPier - 1e-9); });
    }
    disposeScotrailDmu(root);
  }
});

test('ScotRail DMU coupler: both classes carry the BSI head, whose front is exactly `reach` out, starts at the wall, and is neither a Scharfenberg nor a Dellner', () => {
  const y = 0.7;
  const shape = (style: CouplerStyle, dir: 1 | -1, reach: number): { z: number[]; x: number[]; y: number[]; tris: number } => {
    const s = new Soup();
    couplerHalf(s, 10, dir, reach, y, style);
    const at = (k: number): number[] => s.pos.filter((_, i) => i % 3 === k);
    return { x: at(0), y: at(1), z: at(2).map((z) => (z - 10) * dir), tris: s.pos.length / 9 };
  };
  for (const dir of [1, -1] as const) for (const reach of [0.35, 0.7]) {
    const h = shape('bsi', dir, reach);
    const what = `bsi dir ${dir} reach ${reach}`;
    assert.ok(Math.abs(Math.max(...h.z) - reach) < 1e-6, `${what}: the head's front`);
    assert.ok(Math.abs(Math.min(...h.z)) < 1e-6, `${what}: the barrel starts at the wall`);
    assert.ok(Math.abs(Math.min(...h.x) + Math.max(...h.x)) < 1e-6 && Math.max(...h.x) > 0.12 && Math.max(...h.x) < 0.27, `${what}: as wide each side`);
    assert.ok(Math.min(...h.y) >= y - 0.32 && Math.max(...h.y) <= y + 0.25, `${what}: its height`);
  }
  const tris = (style: CouplerStyle): number => shape(style, 1, 0.7).tris;
  assert.equal(new Set([tris('bsi'), tris('scharfenberg'), tris('dellner'), tris('plain')]).size, 4, 'four styles, four shapes');
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    const styles: unknown[] = [];
    root.traverse((o) => { if (o.name === 'nose-coupler') styles.push(o.userData.style); });
    assert.deepEqual(styles, ['bsi', 'bsi'], `${kind}: the cab couplers`);
    disposeScotrailDmu(root);
  }
});


test('ScotRail DMU BSI coupler, as the Inverness 170624 photograph shows it: draft-gear pads at the wall, a top plate, a sideways tongue on the left, the pocket on the right as the head\'s front, and the electrical drum with its warning triangle', () => {
  const y = 0.7;
  const k = (hex: number): number[] => { const c = col(hex); return [c.r, c.g, c.b]; };
  for (const dir of [1, -1] as const) for (const reach of [0.4, 0.7]) {
    const s = new Soup();
    bsiCoupler(s, 10, dir, reach, y);
    const n = s.pos.length / 3;
    const X = (i: number): number => s.pos[3 * i]!; const Y = (i: number): number => s.pos[3 * i + 1]!; const U = (i: number): number => (s.pos[3 * i + 2]! - 10) * dir;
    const is = (i: number, hex: number): boolean => k(hex).every((v, j) => Math.abs(s.clr[3 * i + j]! - v) < 1e-6);
    const all = Array.from({ length: n }, (_, i) => i);
    const what = `dir ${dir} reach ${reach}`;
    assert.ok(Math.abs(Math.max(...all.map(U)) - reach) < 1e-6, `${what}: the head's front`);
    assert.ok(Math.abs(Math.min(...all.map(U))) < 1e-6, `${what}: from the wall`);
    assert.ok(Math.min(...all.map(Y)) >= y - 0.32 - 1e-9 && Math.max(...all.map(Y)) <= y + 0.17 + 1e-9, `${what}: its height`);
    // facing the coupler, its left is +x when it points -z (dir -1), and -x when it points +z
    const left = -dir;
    // the front: only the pocket, right of the middle as you face it
    const front = all.filter((i) => Math.abs(U(i) - reach) < 1e-6);
    assert.ok(front.length > 0 && front.every((i) => X(i) * left < 0 && Math.abs(X(i)) < 0.14), `${what}: the pocket is the head's front, on the right`);
    // the draft gear: pads out to 0.3 either side, within 0.14 of the wall
    for (const sx of [-1, 1]) assert.ok(all.some((i) => Math.abs(X(i) - sx * 0.3) < 1e-6 && U(i) <= 0.14 + 1e-9), `${what}: draft gear side ${sx}`);
    assert.ok(all.every((i) => Math.abs(X(i)) <= 0.3 + 1e-9), `${what}: no wider than the draft gear`);
    // the tongue: out past the head on the left only, near the front
    const tongue = all.filter((i) => X(i) * left > 0.21 && U(i) > 0.15);
    assert.ok(tongue.length > 0 && tongue.every((i) => U(i) > reach - 0.12), `${what}: the tongue on the left`);
    assert.ok(!all.some((i) => X(i) * left < -0.21 && U(i) > 0.15), `${what}: nothing out past the head on the right`);
    // the top plate wider than the head, over it
    assert.ok(all.some((i) => Math.abs(Math.abs(X(i)) - 0.21) < 1e-6 && Math.abs(Y(i) - (y + 0.17)) < 1e-6), `${what}: the top plate`);
    // the warning triangle, on the drum's front under the head, facing out
    const label = all.filter((i) => is(i, 0xf2c21c));
    assert.equal(label.length, 3, `${what}: one warning triangle`);
    assert.ok(label.every((i) => Y(i) < y - 0.2 && Math.abs(U(i) - (reach - 0.069)) < 1e-6), `${what}: the triangle on the drum's front`);
  }
  // both classes' cab couplers are this one: each cab's detail carries the triangle under its coupler
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    const yc = scotrailDmuLook(kind === 'sr170x3' ? 'turbostar' : 'sprinter158').coupler.y;
    for (const car of scotrailDmuLayout(kind).cars) {
      const d = (root.getObjectByName(`car-${car.index}`)!.getObjectByName('body-detail') as THREE.Mesh).geometry;
      const p = d.getAttribute('position'); const c = d.getAttribute('color'); const yl = col(0xf2c21c);
      let tri = 0;
      for (let i = 0; i < p.count; i++) if (Math.abs(c.getX(i) - yl.r) < 1e-6 && Math.abs(c.getY(i) - yl.g) < 1e-6 && Math.abs(c.getZ(i) - yl.b) < 1e-6 && Math.abs(p.getY(i) - (yc - 0.25)) < 0.03) tri++;
      assert.equal(tri, car.cab ? 3 : 0, `${kind} car ${car.index}: the electrical head's triangle`);
    }
    disposeScotrailDmu(root);
  }
});

test('ScotRail DMU inner ends, both classes: a rubber surround standing out of the end wall with a round-cornered head, then pleated bellows to the car\'s end', () => {
  const g = GANGWAY_INNER;
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    for (const car of scotrailDmuLayout(kind).cars) {
      const grp = root.getObjectByName(`car-${car.index}`)!;
      const ends: THREE.Object3D[] = [];
      grp.traverse((o) => { if (o.name === 'gangway' && o.userData.front === false) ends.push(o); });
      assert.equal(ends.length, car.cab ? 1 : 2, `${kind} car ${car.index}: an inner gangway at each inner end`);
      const d = (grp.getObjectByName('body-detail') as THREE.Mesh).geometry;
      const p = d.getAttribute('position'); const c = d.getAttribute('color');
      const is = (i: number, hex: number): boolean => { const k = col(hex); return Math.abs(c.getX(i) - k.r) < 1e-6 && Math.abs(c.getY(i) - k.g) < 1e-6 && Math.abs(c.getZ(i) - k.b) < 1e-6; };
      for (const m of ends) {
        const zw = m.position.z; const out = Math.sign(zw - (car.start + car.end) / 2);
        const ze = out > 0 ? car.end : car.start;
        const u = (i: number): number => (p.getZ(i) - zw) * out;
        const where = `${kind} car ${car.index} end ${out}`;
        // the surround: rubber from the wall out to `frame`, its top at `top`, posts out to `half`, the head's outer corners rounded
        const sur = Array.from({ length: p.count }, (_, i) => i).filter((i) => is(i, GANGWAY_RUBBER) && u(i) > -1e-4 && u(i) < g.frame + 1e-4 && p.getY(i) > 0.95);
        assert.ok(sur.length > 0, `${where}: the surround`);
        assert.ok(Math.abs(Math.min(...sur.map(u))) < 1e-4 && Math.abs(Math.max(...sur.map(u)) - g.frame) < 1e-4, `${where}: it stands ${g.frame} m out of the wall`);
        assert.ok(Math.abs(Math.max(...sur.map((i) => p.getY(i))) - g.top) < 1e-5, `${where}: its top`);
        assert.ok(Math.abs(Math.max(...sur.map((i) => Math.abs(p.getX(i)))) - g.half) < 1e-5, `${where}: its width`);
        // (in the corner square every rubber vertex lies within the radius of the arc's centre: a square corner is r·√2 out)
        assert.ok(sur.filter((i) => Math.abs(p.getX(i)) > g.half - g.radius && p.getY(i) > g.top - g.radius).every((i) => Math.hypot(Math.abs(p.getX(i)) - (g.half - g.radius), p.getY(i) - (g.top - g.radius)) <= g.radius + 1e-5), `${where}: the head's outer corners rounded`);
        assert.ok(sur.some((i) => Math.abs(p.getX(i)) < g.half - 0.04 && Math.abs(p.getX(i)) > g.half - g.radius && p.getY(i) > g.top - g.radius + 0.03 && p.getY(i) < g.top - 0.005), `${where}: the corner's curve`);
        // the opening: no surround rubber between the posts above the sill and under the head
        assert.ok(!sur.some((i) => Math.abs(p.getX(i)) < g.inner - 0.01 && p.getY(i) > 1.1 && p.getY(i) < g.top - g.radius - 0.01), `${where}: the opening`);
        // the bellows: from the surround's front to the car's end, rounded at the top, under the surround's top
        const bel = Array.from({ length: p.count }, (_, i) => i).filter((i) => is(i, 0x222327) && Math.abs(p.getZ(i) - zw) <= Math.abs(ze - zw) + 1e-4 && (p.getZ(i) - zw) * out >= -1e-4);
        assert.ok(bel.some((i) => Math.abs(p.getZ(i) - ze) < 1e-4) && bel.some((i) => Math.abs(u(i) - g.frame) < 1e-4), `${where}: the bellows reach from the surround to the car's end`);
        assert.ok(Math.abs(Math.max(...bel.map((i) => p.getY(i))) - g.bellows.top) < 1e-5 && g.bellows.top < g.top, `${where}: the bellows' top`);
        assert.ok(bel.filter((i) => Math.abs(p.getX(i)) > g.bellows.half - g.bellows.radius && p.getY(i) > g.bellows.top - g.bellows.radius).every((i) => Math.hypot(Math.abs(p.getX(i)) - (g.bellows.half - g.bellows.radius), p.getY(i) - (g.bellows.top - g.bellows.radius)) <= g.bellows.radius + 1e-5), `${where}: the bellows' round top`);
        assert.ok((m.userData.pleats as number) >= 3, `${where}: ${m.userData.pleats} pleats`);
        const pleat = Array.from({ length: p.count }, (_, i) => i).filter((i) => is(i, GANGWAY_RUBBER) && u(i) > g.frame + 1e-4 && Math.abs(p.getX(i)) > g.bellows.half + 0.01);
        assert.ok(pleat.length >= 3 * 4, `${where}: the pleats stand out round the bellows`);
      }
    }
    disposeScotrailDmu(root);
  }
});


test('ScotRail 158 underfloor, as bogie-158-a2 shows it: from the cab end a raked tank, a case, the air cleaner drum across, the engine, the silencer along, the transmission, a reservoir drum, a battery box, hung from a raft between the bogies', () => {
  const root = buildScotrailDmu('sr158x2');
  for (const car of scotrailDmuLayout('sr158x2').cars) {
    const g = root.getObjectByName(`car-${car.index}`)!;
    const items: THREE.Object3D[] = [];
    g.traverse((o) => { if (o.name === 'underfloor') items.push(o); });
    // in order from the cab end (s grows from it)
    items.sort((a, b) => (a.userData.s as number[])[0]! - (b.userData.s as number[])[0]!);
    assert.deepEqual(items.map((o) => o.userData.form), ['tank', 'cooler', 'air-cleaner', 'engine', 'silencer', 'transmission', 'reservoir', 'battery'], `car ${car.index}: the masses in order from the cab end`);
    assert.deepEqual(items.map((o) => o.userData.shape), ['sloped', 'box', 'drum-x', 'box', 'drum-z', 'box', 'drum-x', 'box'], `car ${car.index}: their shapes`);
    // the silencer off the centre line; every mass clear of the next and of both bogies' wheels
    assert.ok(Math.abs(items[4]!.position.x) > 0.2, `car ${car.index}: the silencer off the centre line`);
    for (let i = 1; i < items.length; i++) assert.ok((items[i]!.userData.s as number[])[0]! > (items[i - 1]!.userData.s as number[])[1]!, `car ${car.index}: mass ${i} clear of the one before`);
    const dir = car.cab === 'rear' ? -1 : 1; const base = car.cab === 'rear' ? car.end : car.start;
    const bs = car.bogies.map((z) => (z - base) * dir).sort((p, q) => p - q);
    const f = SCOTRAIL_DMU_FIGURES.sprinter158;
    const wheels = f.wheelbase.value / 2 + f.wheelDiameter.value / 2;
    assert.ok((items[0]!.userData.s as number[])[0]! > bs[0]! + wheels && (items[7]!.userData.s as number[])[1]! < bs[1]! - wheels, `car ${car.index}: between the bogies' wheels`);
    // the raft over them all
    const raft = g.getObjectByName('raft')!;
    assert.ok(raft && (raft.userData.s as number[])[0]! <= (items[0]!.userData.s as number[])[0]! && (raft.userData.s as number[])[1]! >= (items[7]!.userData.s as number[])[1]!, `car ${car.index}: the raft over the masses`);
    // the shapes in the mesh: the tank's raked ends (its bottom shorter than its top), the drums round
    const d = (g.getObjectByName('body-detail') as THREE.Mesh).geometry;
    const p = d.getAttribute('position'); const c = d.getAttribute('color');
    const sOf = (z: number): number => (z - base) * dir;
    const of = (hex: number, s0: number, s1: number): number[] => {
      const k = col(hex); const out: number[] = [];
      for (let i = 0; i < p.count; i++) if (Math.abs(c.getX(i) - k.r) < 1e-6 && Math.abs(c.getY(i) - k.g) < 1e-6 && Math.abs(c.getZ(i) - k.b) < 1e-6 && p.getY(i) < 1.0 && sOf(p.getZ(i)) > s0 - 1e-3 && sOf(p.getZ(i)) < s1 + 1e-3) out.push(i);
      return out;
    };
    const look = scotrailDmuLook('sprinter158');
    const [t0, t1] = items[0]!.userData.s as number[];
    const tank = of(look.underfloor[0]!.colour, t0!, t1!);
    const yb = Math.min(...tank.map((i) => p.getY(i))); const yt = Math.max(...tank.map((i) => p.getY(i)));
    const span = (ys: number[]): number => { const ss = ys.map((i) => sOf(p.getZ(i))); return Math.max(...ss) - Math.min(...ss); };
    const bottomLen = span(tank.filter((i) => Math.abs(p.getY(i) - yb) < 1e-4)); const topLen = span(tank.filter((i) => Math.abs(p.getY(i) - yt) < 1e-4));
    assert.ok(topLen - bottomLen > 0.4, `car ${car.index}: the tank's ends raked in (top ${topLen}, bottom ${bottomLen})`);
    for (const j of [2, 6]) {
      const [s0, s1] = items[j]!.userData.s as number[];
      const it = look.underfloor[j]!;
      const drum = of(it.colour, s0!, s1!).filter((i) => Math.abs(p.getX(i)) < it.half - 1e-3 || Math.abs(Math.abs(p.getX(i)) - it.half) < 1e-4);
      const ys = drum.map((i) => p.getY(i)); const zs = drum.map((i) => p.getZ(i));
      const yc = (Math.min(...ys) + Math.max(...ys)) / 2; const zc = (Math.min(...zs) + Math.max(...zs)) / 2;
      const radii = drum.filter((i) => Math.abs(p.getY(i) - yc) > 1e-4 || Math.abs(p.getZ(i) - zc) > 1e-4).map((i) => Math.hypot(p.getY(i) - yc, p.getZ(i) - zc));
      assert.ok(radii.length > 16 && Math.max(...radii) - Math.min(...radii) < 2e-3, `car ${car.index} ${it.form}: a round drum lying across the car (radii ${Math.min(...radii)}..${Math.max(...radii)})`);
    }
  }
  disposeScotrailDmu(root);
});


test('ScotRail DMU side glazing (t3c/a-inner, t3c/e-inner): the 170 one flush dark band between doors with thin pillars; the 158 thin-framed panes, two a side with hopper top-lights', () => {
  const hit = (mesh: THREE.Mesh, x: number, y: number, z: number, side: number): THREE.Intersection | undefined => {
    const r = new THREE.Raycaster(new THREE.Vector3(side * (x + 1), y, z), new THREE.Vector3(-side, 0, 0));
    return r.intersectObject(mesh, false)[0];
  };
  const colourAt = (mesh: THREE.Mesh, h: THREE.Intersection): number[] => {
    const c = mesh.geometry.getAttribute('color'); const i = h.face!.a; return [c.getX(i), c.getY(i), c.getZ(i)];
  };
  const same = (a: number[], hex: number): boolean => { const k = col(hex); return Math.abs(a[0]! - k.r) < 1e-6 && Math.abs(a[1]! - k.g) < 1e-6 && Math.abs(a[2]! - k.b) < 1e-6; };
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const look = scotrailDmuLook(kind === 'sr170x3' ? 'turbostar' : 'sprinter158');
    const gz = look.glazing;
    const W = SCOTRAIL_DMU_FIGURES[look.family].width.value / 2 - 0.02;
    const [y0, y1] = look.windowY; const ym = (y0 + y1) / 2;
    const root = buildScotrailDmu(kind);
    root.updateMatrixWorld(true);
    for (const car of scotrailDmuLayout(kind).cars) {
      const g = root.getObjectByName(`car-${car.index}`)!;
      const glass = g.getObjectByName('cab-glass') as THREE.Mesh; const detail = g.getObjectByName('body-detail') as THREE.Mesh;
      const dir = car.cab === 'rear' ? -1 : 1; const base = car.cab === 'rear' ? car.end : car.start;
      const Z = (s: number): number => base + dir * s;
      const marks: THREE.Object3D[] = []; g.traverse((o) => { if (o.name === 'glazing') marks.push(o); });
      const plan = dmuCarPlan(car, look);
      for (const side of [-1, 1]) {
        if (gz.kind === 'band') {
          // every pier between two panes of a run is glazed over, with a dark pillar on the glass
          assert.ok(marks.length >= 2 && marks.every((m) => m.userData.kind === 'band' && (m.userData.panes as number) >= 1), `${kind} car ${car.index}: bands`);
          const panes = marks.reduce((acc, m) => acc + (m.userData.panes as number), 0);
          assert.equal(panes, plan.windows.length, `${kind} car ${car.index}: every pane in a band`);
          assert.ok(marks.some((m) => (m.userData.panes as number) >= 3), `${kind} car ${car.index}: the panes between the doors one band`);
          for (const m of marks) for (const s of m.userData.pillars as number[]) {
            assert.ok(hit(glass, W, ym, Z(s), side), `${kind} car ${car.index} side ${side}: glass across the pier at ${s}`);
            const d = hit(detail, W, ym, Z(s), side);
            assert.ok(d && same(colourAt(detail, d), gz.pillarColour) && Math.abs(Math.abs(d.point.x) - (W + 0.011)) < 1e-3, `${kind} car ${car.index} side ${side}: a pillar on the glass at ${s}`);
            assert.ok(!hit(detail, W, ym, Z(s + gz.pillar / 2 + 0.01), side) || Math.abs(hit(detail, W, ym, Z(s + gz.pillar / 2 + 0.01), side)!.point.x) < W + 0.005, `${kind} car ${car.index}: the pillar ${gz.pillar} m wide`);
          }
        } else {
          assert.equal(marks.length, plan.windows.length, `${kind} car ${car.index}: a frame for each pane`);
          assert.deepEqual(marks.filter((m) => m.userData.hopper).length, 2, `${kind} car ${car.index}: two hoppers a side`);
          for (const m of marks) {
            const [s0, s1] = m.userData.s as number[];
            const sm = (s0! + s1!) / 2;
            if (m.userData.hopper) {
              const yb = m.userData.hopperY as number;
              const d = hit(detail, W, yb, Z(sm), side);
              assert.ok(d && same(colourAt(detail, d), gz.frameColour), `${kind} car ${car.index} side ${side}: the hopper's transom at ${sm}`);
              const top = hit(glass, W, (yb + y1) / 2, Z(sm), side); const low = hit(glass, W, (y0 + yb) / 2, Z(sm), side);
              assert.ok(top && low && Math.abs(top.point.x) - Math.abs(low.point.x) > 0.008, `${kind} car ${car.index} side ${side}: the top-light stands proud`);
            }
          }
        }
        // thin frames: just outside a pane's top edge, 2.5 cm up, is body, not frame
        const [s0, s1] = plan.windows[1]!;
        const d = hit(detail, W, y1 + 0.025, Z((s0 + s1) / 2), side);
        assert.ok(!d || !(same(colourAt(detail, d), FRAME_COLOUR) || (gz.kind === 'framed' && same(colourAt(detail, d), gz.frameColour))), `${kind} car ${car.index} side ${side}: a frame wider than 2.5 cm`);
      }
    }
    disposeScotrailDmu(root);
  }
});


test('ScotRail 170 face: a navy valance box either side of the coupler, standing out of the face (Inverness 170624), the small buffers under them', () => {
  const root = buildScotrailDmu('sr170x3');
  const [vx0, vx1] = [Math.min(...VALANCE_170.map(([x]) => x)), Math.max(...VALANCE_170.map(([x]) => x))];
  const [vy0, vy1] = [Math.min(...VALANCE_170.map(([, y]) => y)), Math.max(...VALANCE_170.map(([, y]) => y))];
  for (const index of [0, 2]) {
    const g = root.getObjectByName(`car-${index}`)!;
    const d = (g.getObjectByName('body-detail') as THREE.Mesh).geometry;
    const p = d.getAttribute('position'); const c = d.getAttribute('color'); const navy = col(SALTIRE_BLUE);
    for (const sx of [-1, 1]) {
      const byXY = new Map<string, number[]>();
      for (let i = 0; i < p.count; i++) {
        if (Math.sign(p.getX(i)) !== sx || Math.abs(c.getX(i) - navy.r) > 1e-6 || Math.abs(c.getY(i) - navy.g) > 1e-6 || Math.abs(c.getZ(i) - navy.b) > 1e-6) continue;
        const ax = Math.abs(p.getX(i)); const y = p.getY(i);
        if (ax < vx0 - 1e-4 || ax > vx1 + 1e-4 || y < vy0 - 1e-4 || y > vy1 + 1e-4) continue;
        const k = `${ax.toFixed(4)},${y.toFixed(4)}`; byXY.set(k, [...(byXY.get(k) ?? []), p.getZ(i)]);
      }
      const standing = [...byXY.values()].filter((zs) => Math.max(...zs) - Math.min(...zs) >= VALANCE_170_PROUD - 1e-3);
      assert.ok(standing.length >= 8, `car ${index} side ${sx}: the valance box stands ${VALANCE_170_PROUD} m out (${standing.length} rim points)`);
      // spanning most of its drawn width: from near the coupler's recess to near the face's edge
      const xs = [...byXY.keys()].map((k) => Number(k.split(',')[0]));
      assert.ok(Math.min(...xs) < vx0 + 0.02 && Math.max(...xs) > vx1 - 0.1, `car ${index} side ${sx}: the box's width (${Math.min(...xs)}..${Math.max(...xs)})`);
    }
    const buffers: THREE.Object3D[] = []; g.traverse((o) => { if (o.name === 'buffer') buffers.push(o); });
    assert.ok(buffers.length === 2 && buffers.every((b) => b.position.y === BUFFER_170_Y && BUFFER_170_Y + 0.1 <= vy0), `car ${index}: the buffers under the boxes`);
  }
  disposeScotrailDmu(root);
});

test('ScotRail DMU lettering: the wordmark on both sides of every car, from a row of the shared atlas, and no unit number (no allocated unit reaches the builder)', () => {
  const texts = atlasTexts();
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    const layout = scotrailDmuLayout(kind);
    for (const car of layout.cars) {
      const g = root.getObjectByName(`car-${car.index}`)!;
      const said: string[] = [];
      g.traverse((o) => { if (o.name === 'lettering') said.push(o.userData.text as string); });
      assert.deepEqual(said, ['ScotRail'], `${kind} car ${car.index}: its lettering`);
      for (const t of said) assert.ok(texts.includes(t), `"${t}" has a row in the atlas`);
      const mesh = g.getObjectByName('livery-decals') as THREE.Mesh;
      assert.ok(mesh, `${kind} car ${car.index}: a decal mesh`);
      const uv = mesh.geometry.getAttribute('uv');
      const pos = mesh.geometry.getAttribute('position');
      assert.ok(uv && uv.count === pos.count, 'every decal vertex has its place in the atlas');
      // two wordmarks, one a side: two triangles each
      assert.equal(pos.count / 3, 4, `${kind} car ${car.index}: decal triangles`);
      // every u, v inside the rows of the car's texts (to float32's precision)
      const rows = said.map((t) => atlasRect(t));
      const e = 1e-6;
      for (let i = 0; i < uv.count; i++) assert.ok(rows.some((r) => uv.getX(i) >= r.u0 - e && uv.getX(i) <= r.u1 + e && uv.getY(i) >= r.v0 - e && uv.getY(i) <= r.v1 + e), `uv ${i} off its rows`);
    }
    disposeScotrailDmu(root);
  }
});

test('ScotRail DMU section: the sides are upright down to the waist and draw in by the tumblehome below it, and the door leaves follow them', () => {
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    const f = SCOTRAIL_DMU_FIGURES[scotrailDmuLayout(kind).spec.family];
    const look = scotrailDmuLook(scotrailDmuLayout(kind).spec.family);
    const shell = root.getObjectByName('car-0')!.getObjectByName('body-shell') as THREE.Mesh;
    const p = shell.geometry.getAttribute('position');
    const widest = (y0: number, y1: number): number => {
      let m = 0;
      // (the body behind the nose: car 0's nose is its first 1.4 m)
      for (let i = 0; i < p.count; i++) if (p.getY(i) >= y0 && p.getY(i) <= y1 && p.getZ(i) > 3) m = Math.max(m, Math.abs(p.getX(i)));
      return m;
    };
    const upright = widest(look.windowY[0] - 0.1, look.wallTop + 0.01);
    const low = widest(f.floor.value + 0.2, f.floor.value + 0.3);
    assert.ok(upright - low > TUMBLEHOME - 0.005 && upright - low < TUMBLEHOME + 0.005, `${kind}: drawn in ${upright - low} m at the floor`);
    // a door's outer face is 2 cm out from the side at every height, upright part and drawn-in part alike
    const detail = root.getObjectByName('car-0')!.getObjectByName('body-detail') as THREE.Mesh;
    const d = detail.geometry.getAttribute('position');
    const door = dmuCarPlan(scotrailDmuLayout(kind).cars[0]!, look).doors[0]!;
    let lowDoor = 0;
    // (the leaf's vertices are at its edges, so the window takes in the whole door's width)
    for (let i = 0; i < d.count; i++) if (Math.abs(d.getZ(i) - door) <= f.doorWidth.value / 2 + 1e-3 && d.getY(i) > look.doorY[0] - 1e-6 && d.getY(i) < look.doorY[0] + 0.05) lowDoor = Math.max(lowDoor, Math.abs(d.getX(i)));
    assert.ok(lowDoor < upright - TUMBLEHOME / 2, `${kind}: the door's foot (${lowDoor}) stands out of the upright side (${upright})`);
    disposeScotrailDmu(root);
  }
});

test('lettering atlas: its height is bounded (a row a text, plus the patch), and a text registered after the atlas is laid out is refused', () => {
  const texts = atlasTexts();
  assert.equal(atlasHeight(), (texts.length + 1) * ROW_H);
  // 4096 px is the texture size every WebGL device the page targets supports; the atlas must stay within it as builders register texts
  assert.ok(atlasHeight() <= 4096, `atlas ${atlasHeight()} px tall`);
  assert.ok(texts.includes('ScotRail'), 'the DMU builder registered its wordmark at load');
  // and no unit number: the photographed units' numbers are not in the atlas
  assert.ok(!texts.some((t) => /^1[57]\d{4}$/.test(t)), 'a unit number in the atlas');
  assert.throws(() => registerAtlasTexts(['a text nobody registered in time']), /after the atlas was laid out/);
  assert.doesNotThrow(() => registerAtlasTexts(['ScotRail']), 'a text already laid out may be registered again');
});

/** A lens in a cab car's detail mesh (web/src/train.ts LampLens), and the cab cars with what they record of their lamps, front cab first. */
interface Lens { role: LensRole; v0: number; v1: number }
interface Cab { mesh: THREE.Mesh; end: 'front' | 'rear'; interior: boolean; lenses: Lens[] }
const cabLamps = (root: THREE.Object3D): Cab[] => {
  const out: Cab[] = [];
  root.traverse((o) => { if (o.name === 'body-detail' && o.userData.lamps) out.push({ mesh: o as THREE.Mesh, ...(o.userData.lamps as Omit<Cab, 'mesh'>) }); });
  return out;
};
/** What a lens shows, after checking every vertex of it agrees. */
const shows = (mesh: THREE.Mesh, l: Lens): { glow: number; rgb: number[] } => {
  const c = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
  const g = mesh.geometry.getAttribute('aGlow') as THREE.BufferAttribute;
  const first = { glow: g.getX(l.v0), rgb: [c.getX(l.v0), c.getY(l.v0), c.getZ(l.v0)] };
  for (let v = l.v0; v < l.v1; v++) assert.ok(g.getX(v) === first.glow && c.getX(v) === first.rgb[0] && c.getY(v) === first.rgb[1] && c.getZ(v) === first.rgb[2], `vertex ${v} agrees with its lens`);
  return first;
};
const rgbOf = (hex: number): number[] => { const c = col(hex); return [Math.fround(c.r), Math.fround(c.g), Math.fround(c.b)]; };
const MODES: TrainLampMode[] = ['head', 'tail', 'off'];

test('ScotRail DMU lamps: each cab records its white lamps and two tail lamps, built in service state, and setTrainLampState sets every pair of ends', () => {
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    const cabs = cabLamps(root);
    const roles = (c: Cab, role: LensRole): number => c.lenses.filter((l) => l.role === role).length;
    // (the 170 has a third white lamp, the marker on its dome)
    const heads = kind === 'sr170x3' ? 3 : 2;
    assert.deepEqual(cabs.map((c) => [c.end, c.interior, roles(c, 'head'), roles(c, 'tail')]), [['front', false, heads, 2], ['rear', false, heads, 2]], `${kind}: the lamp records`);
    assert.deepEqual(root.userData.lampState, SERVICE_LAMPS);
    // every lens covers vertices of its own, and no two in a cab overlap
    for (const cab of cabs) {
      const spans = [...cab.lenses].sort((a, b) => a.v0 - b.v0);
      spans.forEach((l, i) => {
        assert.ok(l.v1 > l.v0, `${kind}: a lens has vertices`);
        const next = spans[i + 1];
        if (next) assert.ok(next.v0 >= l.v1, `${kind}: lenses do not overlap`);
      });
    }
    const expect = (state: TrainLampState, what: string): void => {
      for (const cab of cabs) {
        for (const l of cab.lenses) {
          const want = lensLook(l.role, state[cab.end]);
          const got = shows(cab.mesh, l);
          assert.equal(got.glow, want.glow, `${kind} ${what}: ${cab.end} ${l.role} glow`);
          assert.deepEqual(got.rgb, rgbOf(want.hex), `${kind} ${what}: ${cab.end} ${l.role} colour`);
        }
      }
    };
    expect(SERVICE_LAMPS, 'as built');
    for (const front of MODES) for (const rear of MODES) {
      setTrainLampState(root, { front, rear });
      expect({ front, rear }, `${front}/${rear}`);
      assert.deepEqual(root.userData.lampState, { front, rear });
    }
    disposeScotrailDmu(root);
  }
});

test('ScotRail DMU lamps: a clone sharing the template\'s geometry keeps its lamps when the template is switched', () => {
  const template = buildScotrailDmu('sr170x3');
  const clone = template.clone(true);
  setTrainLampState(template, { front: 'tail', rear: 'head' });
  const [front] = cabLamps(clone);
  assert.ok(front);
  const head = front.lenses.find((l) => l.role === 'head')!;
  assert.deepEqual(shows(front.mesh, head).rgb, rgbOf(lensLook('head', 'head').hex));
  const [switched] = cabLamps(template);
  assert.deepEqual(shows(switched!.mesh, head).rgb, rgbOf(lensLook('head', 'tail').hex));
  disposeScotrailDmu(template);
});

test('ScotRail DMU bogies: the 170 rides on B5000s and the 158 on P4s, each a shared geometry inside the shared bogie envelope', () => {
  const want = { sr170x3: 'b5000', sr158x2: 'brel-p4' } as const;
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    const layout = scotrailDmuLayout(kind);
    const geos = new Map<boolean, THREE.BufferGeometry>();
    for (const car of layout.cars) {
      car.bogies.forEach((_, k) => {
        const b = root.getObjectByName(`bogie-${car.index}-${k}`)!;
        assert.equal(b.userData.style, want[kind]);
        const near = b.getObjectByName('bogie-lod')!.children.find((m) => m.userData.lod === 'near') as THREE.Mesh;
        assert.equal(near.userData.style, want[kind], `${kind} car ${car.index} bogie ${k}`);
        assert.equal(b.children.filter((c) => c.name === 'wheel').length, 4);
        const motor = car.motor[k] ?? false;
        const seen = geos.get(motor);
        if (seen) assert.equal(near.geometry, seen, `${kind}: every ${motor ? 'driven' : 'trailer'} bogie shares one geometry`);
        else geos.set(motor, near.geometry);
      });
    }
    disposeScotrailDmu(root);
    // (the disposer spares the bogies' shared geometry)
    for (const g of geos.values()) assert.ok(g.getAttribute('position').count > 0);
  }
  for (const style of ['b5000', 'brel-p4'] as const) {
    for (const motor of [false, true]) {
      const s = dmuBogieSoup({ radius: 0.42, wheelbase: 2.6, track: 1.435, motor, style });
      for (let i = 0; i < s.pos.length; i += 3) {
        assert.ok(Math.abs(s.pos[i] as number) <= BOGIE_HALF_WIDTH + 1e-6, `${style}: x ${s.pos[i]} outside the envelope`);
        assert.ok((s.pos[i + 1] as number) <= BOGIE_TOP + 1e-6, `${style}: y ${s.pos[i + 1]} above the bogie top`);
      }
      assert.equal(s.clr.length, s.pos.length, `${style}: a colour for every vertex`);
    }
  }
});

test('ScotRail DMU bogies: the frames the photographs show (P4: coils under the beam ends and a deep middle; B5000: a hump over each box, a low middle, rubber blocks)', () => {
  const r = 0.42;
  const w = 1.3;
  const colourAt = (s: Soup, hex: number, pick: (v: [number, number, number]) => boolean): number => {
    const c = col(hex);
    let n = 0;
    for (let i = 0; i < s.pos.length; i += 3) {
      const same = Math.abs((s.clr[i] as number) - c.r) < 1e-6 && Math.abs((s.clr[i + 1] as number) - c.g) < 1e-6 && Math.abs((s.clr[i + 2] as number) - c.b) < 1e-6;
      if (same && pick([s.pos[i] as number, s.pos[i + 1] as number, s.pos[i + 2] as number])) n++;
    }
    return n;
  };
  const p4 = dmuFrameSoup({ radius: r, wheelbase: 2 * w, style: 'brel-p4' });
  const b5 = dmuFrameSoup({ radius: r, wheelbase: 2 * w, style: 'b5000' });
  const P = DMU_BOGIE_COLOURS['brel-p4'];
  const B = DMU_BOGIE_COLOURS.b5000;
  // P4: the beam's end rests on the coil (its underside over the axle box is the spring's top), the middle hangs deeper than the ends
  const p4End = dmuBeamAt('brel-p4', w, w)!;
  const p4Mid = dmuBeamAt('brel-p4', w, 0)!;
  assert.ok(Math.abs(p4End.bottom - P4_SPRING.top) < 1e-9, `P4 beam end underside ${p4End.bottom}`);
  assert.ok(p4Mid.bottom < p4End.bottom - 0.3, `P4 middle ${p4Mid.bottom} hangs below the ends ${p4End.bottom}`);
  // its coils stand over each axle box, between the box's top and the beam's end, on both sides
  for (const sx of [-1, 1]) for (const az of [-w, w]) {
    const n = colourAt(p4, P.coil, (v) => Math.sign(v[0]) === sx && Math.abs(v[2] - az) <= P4_SPRING.radius + 1e-6 && v[1] >= r + 0.11 - 1e-6 && v[1] <= r + P4_SPRING.top + 1e-6);
    assert.ok(n > 0, `P4: a coil at x ${sx} z ${az}`);
  }
  // B5000: the hump over each box stands well above the low middle, and its underside clears the box
  const hump = dmuBeamAt('b5000', w, w)!;
  const low = dmuBeamAt('b5000', w, 0)!;
  assert.ok(hump.top - low.top >= 0.2, `B5000 hump ${hump.top} over middle ${low.top}`);
  assert.ok(hump.bottom >= 0.11, `B5000 hump underside ${hump.bottom} clears the box top`);
  // its rubber blocks flank each box on both sides (outside the box's own length), and the P4 has none; the B5000 has no coils
  for (const sx of [-1, 1]) for (const az of [-w, w]) for (const zs of [-1, 1]) {
    const n = colourAt(b5, B.rubber, (v) => Math.sign(v[0]) === sx && (v[2] - az) * zs >= 0.125 - 1e-6 && (v[2] - az) * zs <= 0.27 + 1e-6 && v[1] < r + 0.2);
    assert.ok(n > 0, `B5000: a rubber block at x ${sx}, z ${az}${zs > 0 ? '+' : '-'}`);
  }
  assert.equal(colourAt(b5, B.coil, () => true), 0, 'the B5000 has no coil springs');
  assert.equal(colourAt(p4, P.rubber, (v) => v[1] < r + 0.25), 0, 'the P4 has no rubber blocks at its boxes (its rubber is the air bag, on the middle)');
  // the far level wears the style's frame colour, not the shared Alstom's
  for (const style of ['b5000', 'brel-p4'] as const) {
    const far = dmuBogieFarSoup({ radius: r, wheelbase: 2 * w, track: 1.435, style });
    assert.ok(colourAt(far, DMU_BOGIE_COLOURS[style].frame, () => true) > 0, `${style} far frame`);
    assert.equal(colourAt(far, 0x66625a, () => true) + colourAt(far, 0x55514a, () => true), 0, `${style} far: no Alstom colour left`);
  }
});

test('ScotRail DMU roof: the equipment the roof photographs show, at its stations and on its side of every car, standing on the roof', () => {
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const layout = scotrailDmuLayout(kind);
    const look = scotrailDmuLook(layout.spec.family);
    const f = SCOTRAIL_DMU_FIGURES[layout.spec.family];
    const crown = f.height.value;
    const W = f.width.value / 2 - 0.02; // carSection's W: the half-width less DOOR_RELIEF (web/src/train.ts, 0.02)
    const rx = 0.55; const ry = crown - look.wallTop - 0.012;
    const root = buildScotrailDmu(kind);
    for (const car of layout.cars) {
      const g = root.getObjectByName(`car-${car.index}`)!;
      const p = (g.getObjectByName('body-detail') as THREE.Mesh).geometry.getAttribute('position');
      const c = (g.getObjectByName('body-detail') as THREE.Mesh).geometry.getAttribute('color');
      const dir = car.cab === 'rear' ? -1 : 1;
      const base = car.cab === 'rear' ? car.end : car.start;
      const sOf = (z: number): number => (z - base) * dir;
      const is = (i: number, hex: number): boolean => { const k = col(hex); return Math.abs(c.getX(i) - k.r) < 1e-6 && Math.abs(c.getY(i) - k.g) < 1e-6 && Math.abs(c.getZ(i) - k.b) < 1e-6; };
      const want = look.roofGear.filter((r) => !r.cab || car.cab);
      const got = g.children.filter((o) => o.name === 'roof-equipment');
      assert.deepEqual(got.map((o) => o.userData.name).sort(), want.map((r) => r.name).sort(), `${kind} car ${car.index}: its roof equipment`);
      for (const r of want) {
        const m = got.find((o) => o.userData.name === r.name && (r.kind === 'vents' || Math.abs((o.userData.x as number[])[0]! - Math.min(r.x0 * dir, r.x1 * dir)) < 1e-9))!;
        assert.ok(m, `${kind} car ${car.index}: ${r.name}`);
        const [lo, hi] = m.userData.s as [number, number];
        const s0 = r.fromEnd ? car.length - r.s1 : r.s0; const s1 = r.fromEnd ? car.length - r.s0 : r.s1;
        assert.ok(Math.abs(lo - Math.min(s0, s1)) < 1e-9 && Math.abs(hi - Math.max(s0, s1)) < 1e-9, `${kind} car ${car.index} ${r.name}: at ${lo}..${hi}`);
        if (r.kind === 'vents') {
          // on its shoulder: the driver's right is +x at a front cab, -x on a car turned round (rotated, not mirrored)
          assert.equal(Math.sign(m.position.x), r.side * dir, `${kind} car ${car.index} ${r.name}: on its side`);
          let slots = 0;
          for (let i = 0; i < p.count; i++) {
            if (!is(i, r.dark) || Math.sign(p.getX(i)) !== r.side * dir) continue;
            const s = sOf(p.getZ(i)); if (s < lo - 1e-4 || s > hi + 1e-4) continue;
            const e = ((Math.abs(p.getX(i)) - (W - rx)) / rx) ** 2 + ((p.getY(i) - look.wallTop) / ry) ** 2;
            assert.ok(e >= 1 && e <= 1.08, `${kind} car ${car.index} ${r.name}: a slot vertex off the shoulder (${e})`);
            slots++;
          }
          assert.ok(slots >= r.slots * 6, `${kind} car ${car.index} ${r.name}: ${slots / 6} slots`);
          continue;
        }
        // standing on the roof inside the crown's flat, its top `h` over the crown (and a cap's over that)
        const [xa, xb] = m.userData.x as [number, number];
        assert.ok(Math.max(Math.abs(xa), Math.abs(xb)) <= W - 0.5, `${kind} car ${car.index} ${r.name}: inside the crown (${xa}..${xb})`);
        let top = -Infinity; let bottom = Infinity;
        for (let i = 0; i < p.count; i++) {
          if (!is(i, r.colour)) continue;
          const s = sOf(p.getZ(i));
          if (p.getX(i) < xa - 1e-4 || p.getX(i) > xb + 1e-4 || s < lo - 1e-4 || s > hi + 1e-4 || p.getY(i) < crown - 0.2) continue;
          top = Math.max(top, p.getY(i)); bottom = Math.min(bottom, p.getY(i));
        }
        assert.ok(Math.abs(top - (crown + r.h + (r.cap?.h ?? 0))) < 1e-4, `${kind} car ${car.index} ${r.name}: top ${top}`);
        assert.ok(bottom < crown - 0.012, `${kind} car ${car.index} ${r.name}: seated into the roof (${bottom})`);
        if (r.kind === 'louvred') {
          let dark = 0;
          for (let i = 0; i < p.count; i++) if (is(i, r.dark!) && p.getX(i) >= xa - 1e-4 && p.getX(i) <= xb + 1e-4 && sOf(p.getZ(i)) >= lo - 1e-4 && sOf(p.getZ(i)) <= hi + 1e-4) dark++;
          assert.equal(dark / 6, r.slats, `${kind} car ${car.index} ${r.name}: its louvres`);
        }
        if (r.kind === 'housing' && (r.topVents || r.grille)) {
          // the square vents or grille slats on its top, 2 mm proud, each a quad of its dark colour
          const want = r.topVents ? [r.topVents.dark, r.topVents.n] : [r.grille!.dark, r.grille!.slats];
          let on = 0;
          for (let i = 0; i < p.count; i++) if (is(i, want[0]!) && Math.abs(p.getY(i) - (crown + r.h + 0.002)) < 1e-4 && p.getX(i) >= xa - 1e-4 && p.getX(i) <= xb + 1e-4 && sOf(p.getZ(i)) >= lo - 1e-4 && sOf(p.getZ(i)) <= hi + 1e-4) on++;
          assert.equal(on / 6, want[1], `${kind} car ${car.index} ${r.name}: what stands on its top`);
        }
        if (r.kind === 'scoop') {
          // the mouth is the face toward the cab end, just before it
          const mouth: number[] = [];
          for (let i = 0; i < p.count; i++) if (is(i, r.dark!) && p.getX(i) >= xa && p.getX(i) <= xb && p.getY(i) > crown) mouth.push(sOf(p.getZ(i)));
          assert.ok(mouth.length === 6 && mouth.every((s) => Math.abs(s - (lo - 0.003)) < 1e-4), `${kind} car ${car.index}: the scoop's mouth faces the cab (${mouth})`);
        }
      }
      // seams across the roof at their pitch, and a rain strip along each shoulder
      const seams = g.children.find((o) => o.name === 'roof-seams')!;
      const at = seams.userData.at as number[];
      assert.ok(at.length >= 9, `${kind} car ${car.index}: ${at.length} seams`);
      for (let k = 1; k < at.length; k++) assert.ok(Math.abs(at[k]! - at[k - 1]! - look.roofSeams.pitch) < 1e-9);
      assert.equal(seams.userData.rainStrips, 2);
    }
    disposeScotrailDmu(root);
  }
  // what the photographs settle, as relations: the 170 (roof-170-cowd) has its scoop ahead of the flat housing, the cap at the housing's
  // rear, the cab grille and the vent panels on opposite shoulders, vent panels at the middle and near the inner end of every car; the
  // 158 (roof-158-filton, roof-158-pil) its exhaust group within 3.2 m of every car's inner end, and a low unit each side behind the cab
  const t = scotrailDmuLook('turbostar').roofGear;
  const by = (name: string) => t.find((r) => r.name === name)!;
  const unit = by('cab-roof-unit'); const housing = by('cab-vent-housing');
  assert.ok(by('cab-scoop').s1 < unit.s0 && by('cab-scoop').s1 < housing.s0 && unit.kind !== 'vents' && unit.cap && unit.cap.at > (unit.s0 + unit.s1) / 2);
  // (round 6a) the raised housing with its row of square vents beside the long unit with its grille, the two side by side across the roof
  assert.ok(housing.kind === 'housing' && housing.topVents && housing.topVents.n >= 4 && unit.kind === 'housing' && unit.grille && unit.grille.slats >= 12);
  assert.ok(housing.h > unit.h && Math.min(housing.x0, housing.x1) >= Math.max(unit.x0, unit.x1) && unit.s1 - unit.s0 > 2 * (housing.s1 - housing.s0));
  const grille = by('cab-grille'); const vents = by('cab-vents');
  assert.ok(grille.kind === 'vents' && vents.kind === 'vents' && grille.side === -vents.side);
  assert.ok(!by('vents-middle').cab && !by('vents-inner').cab && by('vents-inner').fromEnd);
  // vent panels on both shoulders of every car, at least five a car, spread along it
  const every = t.filter((r) => !r.cab && r.kind === 'vents');
  assert.ok(every.length >= 5 && every.some((r) => r.kind === 'vents' && r.side === 1) && every.some((r) => r.kind === 'vents' && r.side === -1));
  const s = scotrailDmuLook('sprinter158').roofGear;
  for (const r of s.filter((q) => q.name.startsWith('exhaust') || q.name === 'roof-hump')) assert.ok(r.fromEnd && !r.cab && r.s1 <= 3.2, r.name);
  const cabUnits = s.filter((q) => q.name === 'cab-roof-unit');
  assert.ok(cabUnits.length === 2 && cabUnits.every((q) => q.cab && q.kind !== 'vents') && cabUnits.some((q) => q.kind !== 'vents' && q.x0 > 0) && cabUnits.some((q) => q.kind !== 'vents' && q.x1 < 0));
  assert.equal(s.find((q) => q.kind === 'louvred')?.name, 'exhaust');
});

test('ScotRail DMU dots: the white field on the cab flank is drawn at its pitch and sizes; the 158\'s at the size scotrail158-05 shows (0.15 m dots on a 0.17 m pitch)', () => {
  // each dot is a fan whose triangles all start at its centre; read every white dot on the +x side of the leading cab car
  const dots = (kind: (typeof SCOTRAIL_DMU_KINDS)[number]): { c: [number, number, number]; r: number }[] => {
    const root = buildScotrailDmu(kind);
    const detail = root.getObjectByName('car-0')!.getObjectByName('body-detail') as THREE.Mesh;
    const p = detail.geometry.getAttribute('position'); const c = detail.geometry.getAttribute('color'); const w = col(DOT_WHITE);
    const byCentre = new Map<string, { c: [number, number, number]; r: number }>();
    for (let i = 0; i + 2 < p.count; i += 3) {
      if (Math.abs(c.getX(i) - w.r) > 1e-6 || Math.abs(c.getY(i) - w.g) > 1e-6 || Math.abs(c.getZ(i) - w.b) > 1e-6 || p.getX(i) < 0) continue;
      const centre: [number, number, number] = [p.getX(i), p.getY(i), p.getZ(i)];
      const key = centre.map((v) => v.toFixed(4)).join(',');
      const r = Math.max(...[1, 2].map((k) => Math.hypot(p.getY(i + k) - centre[1], p.getZ(i + k) - centre[2])));
      const seen = byCentre.get(key);
      byCentre.set(key, { c: centre, r: Math.max(r, seen?.r ?? 0) });
    }
    disposeScotrailDmu(root);
    return [...byCentre.values()];
  };
  const pitchOf = (ds: { c: [number, number, number] }[]): number => {
    // the smallest rise between two dots of one column (same z: on the flat side, behind the nose)
    let best = Infinity;
    for (const a of ds) for (const b of ds) if (a !== b && Math.abs(a.c[2] - b.c[2]) < 1e-4 && b.c[1] > a.c[1]) best = Math.min(best, b.c[1] - a.c[1]);
    return best;
  };
  for (const [kind, family] of [['sr158x2', 'sprinter158'], ['sr170x3', 'turbostar']] as const) {
    const { pitch, r0, shrink } = scotrailDmuLook(family).whiteDots;
    const ds = dots(kind);
    const radii = ds.map((d) => d.r);
    assert.ok(ds.length > 20, `${kind}: ${ds.length} white dots`);
    assert.ok(Math.max(...radii) <= r0 + 1e-5 && Math.max(...radii) >= r0 * (1 - shrink * 0.15), `${kind}: the biggest dot ${Math.max(...radii)} (front ${r0})`);
    assert.ok(Math.min(...radii) >= r0 * (1 - shrink) - 1e-5, `${kind}: the smallest dot ${Math.min(...radii)}`);
    assert.ok(Math.abs(pitchOf(ds) - pitch) < 1e-4, `${kind}: the pitch up the side ${pitchOf(ds)}`);
  }
  // the 158's, measured on scotrail158-05 against its cab side window: about 0.15 m across low in the field, 0.11 m at its rear, on a 0.17-0.18 m pitch
  const s = scotrailDmuLook('sprinter158').whiteDots;
  assert.ok(s.r0 * 2 >= 0.14 && s.r0 * 2 <= 0.16, `158 front dots ${s.r0 * 2} m across`);
  assert.ok(s.r0 * (1 - s.shrink) * 2 >= 0.08, `158 rear dots ${s.r0 * (1 - s.shrink) * 2} m across`);
  assert.ok(s.pitch >= 0.16 && s.pitch <= 0.18 && s.pitch > 2 * s.r0, `158 pitch ${s.pitch}: the dots nearly touch, never overlap`);
});

test('ScotRail 158 face: lamps in a dark recess in a raised panel, lenses standing out of it; a transom over each screen; a deep rubber gangway surround with a round-cornered head', () => {
  const root = buildScotrailDmu('sr158x2');
  const tip = 0.35; // END_GAP: the face's plane on a front cab, which looks along -z
  const detail = root.getObjectByName('car-0')!.getObjectByName('body-detail') as THREE.Mesh;
  const p = detail.geometry.getAttribute('position'); const c = detail.geometry.getAttribute('color');
  const is = (i: number, hex: number): boolean => { const k = col(hex); return Math.abs(c.getX(i) - k.r) < 1e-6 && Math.abs(c.getY(i) - k.g) < 1e-6 && Math.abs(c.getZ(i) - k.b) < 1e-6; };
  const out = (i: number): number => tip - p.getZ(i); // metres out of the face
  const where = (hex: number, keep: (i: number) => boolean = () => true): number[] => { const r: number[] = []; for (let i = 0; i < p.count; i++) if (is(i, hex) && keep(i)) r.push(i); return r; };
  // the pill-shaped recess floor, dark, at the face; the yellow panel round it 35 mm proud, so the pill is a 3 cm recess
  const pillAt = where(0x0c0d0e, (i) => p.getX(i) > 0.6 && p.getX(i) < 1.2 && p.getY(i) > 1.45 && p.getY(i) < 1.8);
  assert.ok(pillAt.length > 0 && Math.max(...pillAt.map(out)) < 0.006, 'the recess floor at the face');
  const panel = where(0xd9a514, (i) => p.getX(i) > 0.6 && p.getX(i) < 1.25 && p.getY(i) > 1.45 && p.getY(i) < 1.8);
  assert.ok(Math.abs(Math.max(...panel.map(out)) - 0.0395) < 1e-4, `the panel's front ${Math.max(...panel.map(out))} out of the face`);
  // no panel in front of the recess: every panel vertex at the pill's middle height lies outside its round-ended outline
  for (const i of panel) {
    const dx = Math.abs(p.getX(i) - 0.875) - (0.17 - 0.085); const dy = p.getY(i) - 1.615;
    const inside = dx <= 0 ? Math.abs(dy) < 0.085 - 1e-3 : Math.hypot(dx, dy) < 0.085 - 1e-3;
    assert.ok(!inside, `a panel vertex over the recess at (${p.getX(i)}, ${p.getY(i)})`);
  }
  // the lenses stand out of the recess floor, the headlight domed and outboard of the tail cluster
  const lamps = detail.userData.lamps as { lenses: { role: LensRole; v0: number; v1: number }[] };
  const right = lamps.lenses.filter((l) => p.getX(l.v0) > 0 && p.getY(l.v0) < 2);
  const head = right.find((l) => l.role === 'head')!; const tail = right.find((l) => l.role === 'tail')!;
  assert.ok(head && tail && p.getX(head.v0) > p.getX(tail.v0), 'the headlight outboard of the tail cluster');
  for (const l of [head, tail]) {
    const zs: number[] = []; for (let i = l.v0; i < l.v1; i++) zs.push(out(i));
    assert.ok(Math.max(...zs) - Math.min(...zs) >= 0.019, `${l.role}: stands ${Math.max(...zs) - Math.min(...zs)} out of the recess`);
  }
  const front = (l: { v0: number; v1: number }): number => { let r = 0; for (let i = l.v0; i < l.v1; i++) if (out(i) > out(l.v0) - 1e-6) r = Math.max(r, Math.hypot(p.getX(i) - p.getX(l.v0), p.getY(i) - p.getY(l.v0))); return r; };
  let back = 0; for (let i = head.v0; i < head.v1; i++) back = Math.max(back, Math.hypot(p.getX(i) - p.getX(head.v0), p.getY(i) - p.getY(head.v0)));
  assert.ok(front(head) < 0.85 * back, `the headlight domed: front ${front(head)}, foot ${back}`);
  // a yellow transom across each screen about a metre above its foot, in front of the glass
  for (const sx of [-1, 1]) {
    // (the surround shares the yellow, at its own 1.5 mm lift behind the glass's 4.5 mm: the transom is the yellow in front of the glass)
    const bar = where(0xe0ac16, (i) => Math.sign(p.getX(i)) === sx && p.getY(i) > 2.78 && p.getY(i) < 2.88 && out(i) > 0.0045);
    const xs = bar.map((i) => Math.abs(p.getX(i)));
    assert.ok(bar.length >= 3 && Math.min(...xs) <= 0.62 && Math.max(...xs) >= 1.1, `side ${sx}: the transom right across the glass (${Math.min(...xs)}..${Math.max(...xs)})`);
  }
  // the gangway surround: rubber 0.14 m out of the face; its head's outer corners rounded (no rubber in the square corner), its top
  // at the middle reaching `top`; a lighter lip stepped back round the opening; fasteners on its front
  const g = GANGWAY_158;
  const rubber = where(GANGWAY_RUBBER);
  assert.ok(Math.abs(Math.max(...rubber.map(out)) - g.depth) < 1e-4, 'the surround\'s depth');
  assert.ok(Math.abs(Math.max(...rubber.map((i) => p.getY(i))) - g.top) < 1e-4, 'its top');
  const cut = g.radius * (1 - Math.SQRT1_2) * 0.9;
  assert.ok(rubber.every((i) => !(Math.abs(p.getX(i)) > g.outer - cut && p.getY(i) > g.top - cut)), 'its head\'s outer corners rounded');
  const lip = where(0x2c2d30);
  assert.ok(lip.length > 0 && Math.abs(Math.max(...lip.map(out)) - (g.depth - 0.04)) < 1e-4, 'the lip stepped 4 cm back');
  assert.ok(where(0x8a8d90, (i) => out(i) > g.depth).length >= 6 * 20, 'fasteners on its front');
  disposeScotrailDmu(root);
});

test('ScotRail 170 face: round headlight and tail lenses wholly on the face, in one silver housing standing out of it; the yellow brow an even band right across', () => {
  const root = buildScotrailDmu('sr170x3');
  for (const index of [0, 2]) {
    const detail = root.getObjectByName(`car-${index}`)!.getObjectByName('body-detail') as THREE.Mesh;
    const p = detail.geometry.getAttribute('position');
    const lamps = detail.userData.lamps as { lenses: { role: LensRole; v0: number; v1: number }[] };
    // the face lenses (the dome lamp, high on the dome, is an oval by design)
    const face = lamps.lenses.filter((l) => p.getY(l.v0) < 2.5);
    assert.deepEqual(face.map((l) => l.role).sort(), ['head', 'head', 'tail', 'tail'], `car ${index}: two heads, two tails on the face`);
    for (const l of face) {
      const want = l.role === 'head' ? LAMP_170.head : LAMP_170.tail;
      // every triangle of the lens's fan starts at its centre; every other vertex is on the rim, all at one radius: an uncut round
      const cx = p.getX(l.v0); const cy = p.getY(l.v0);
      const radii: number[] = [];
      for (let i = l.v0; i < l.v1; i++) if (i % 3 !== l.v0 % 3) radii.push(Math.hypot(p.getX(i) - cx, p.getY(i) - cy));
      assert.ok(Math.max(...radii) - Math.min(...radii) < 1e-4, `car ${index} ${l.role}: a round lens (radii ${Math.min(...radii)}..${Math.max(...radii)})`);
      assert.ok(Math.abs(Math.max(...radii) - want.r) < 1e-4, `car ${index} ${l.role}: radius ${Math.max(...radii)}`);
      assert.ok(Math.abs(Math.abs(cx) - want.x) < 1e-4 && Math.abs(cy - want.y) < 1e-4, `car ${index} ${l.role}: at (${cx}, ${cy})`);
    }
    // the headlight outboard of its tail lamp, the tail a little lower, both in ONE silver housing (scotrail170-01, roof-170-cowd): on
    // each side of the face the chrome below the screen is a single solid whose outline is the hull of the two rounds, standing
    // LAMP_170_PROUD out of the face at every point of that outline, with the lenses standing out of its front
    assert.ok(LAMP_170.head.x > LAMP_170.tail.x && LAMP_170.tail.y < LAMP_170.head.y);
    const cc = detail.geometry.getAttribute('color'); const chrome = col(CHROME);
    for (const sx of [-1, 1]) {
      const byXY = new Map<string, number[]>();
      for (let i = 0; i < p.count; i++) {
        if (Math.sign(p.getX(i)) !== sx || p.getY(i) > 2 || Math.abs(cc.getX(i) - chrome.r) > 1e-6 || Math.abs(cc.getY(i) - chrome.g) > 1e-6 || Math.abs(cc.getZ(i) - chrome.b) > 1e-6) continue;
        const k = `${Math.abs(p.getX(i)).toFixed(4)},${p.getY(i).toFixed(4)}`;
        byXY.set(k, [...(byXY.get(k) ?? []), p.getZ(i)]);
      }
      const want = new Set(LAMP_170_HOUSING.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`));
      const rim = [...byXY.keys()].filter((k) => want.has(k));
      assert.equal(rim.length, LAMP_170_HOUSING.length, `car ${index} side ${sx}: one housing on the hull's outline (${rim.length} of ${LAMP_170_HOUSING.length})`);
      for (const k of rim) { const zs = byXY.get(k)!; assert.ok(Math.max(...zs) - Math.min(...zs) >= LAMP_170_PROUD - 1e-4, `car ${index} side ${sx}: the housing stands out at ${k}`); }
    }
    // (out of the face is -z at the front cab, +z at the rear one)
    const outward = (z: number): number => (index === 0 ? -z : z);
    // (the face leans back, so compare the lens's front with the housing's front at the same height: the lens's centre)
    for (const l of face) {
      const lens = outward(p.getZ(l.v0)); const yc = p.getY(l.v0);
      let housing = -Infinity;
      for (let i = 0; i < p.count; i++) {
        if (Math.sign(p.getX(i)) !== Math.sign(p.getX(l.v0)) || Math.abs(p.getY(i) - yc) > 0.02 || Math.abs(cc.getX(i) - chrome.r) > 1e-6 || Math.abs(cc.getY(i) - chrome.g) > 1e-6 || Math.abs(cc.getZ(i) - chrome.b) > 1e-6) continue;
        housing = Math.max(housing, outward(p.getZ(i)));
      }
      assert.ok(lens - housing >= 0.006, `car ${index} ${l.role}: the lens stands ${lens - housing} out of the housing's front`);
    }
    // the brow: its top over the orange foot line (3.215) at each x across the middle 1.4 m, read off the yellow triangles above the screen
    const c = detail.geometry.getAttribute('color'); const y = col(SR_YELLOW);
    const tris: [number, number][][] = [];
    for (let i = 0; i + 2 < p.count; i += 3) {
      if (Math.abs(c.getX(i) - y.r) > 1e-6 || Math.abs(c.getY(i) - y.g) > 1e-6 || Math.abs(c.getZ(i) - y.b) > 1e-6 || p.getY(i) < 3.0) continue;
      tris.push([0, 1, 2].map((k): [number, number] => [p.getX(i + k), p.getY(i + k)]));
    }
    const topAt = (x: number): number => {
      let best = -Infinity;
      for (const t of tris) for (const [a, b] of [[t[0]!, t[1]!], [t[1]!, t[2]!], [t[2]!, t[0]!]] as const) {
        if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
        best = Math.max(best, a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]));
      }
      return best;
    };
    const depths = [-0.7, -0.5, -0.3, -0.1, 0.1, 0.3, 0.5, 0.7].map((x) => topAt(x) - 3.215);
    assert.ok(Math.min(...depths) >= 0.8 * Math.max(...depths), `car ${index}: the brow's depth ${depths.map((d) => d.toFixed(3)).join(' ')} is even`);
    assert.ok(Math.min(...depths) >= 0.18 && Math.max(...depths) <= 0.26, `car ${index}: the brow about 0.2 m deep`);
  }
  disposeScotrailDmu(root);
});

test('ScotRail DMU dots: every point of every dot on the leading cab car lies just outside the body, on the nose as on the drawn-in side', () => {
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    const g = root.getObjectByName('car-0')!;
    // the shell and the dots share the car's frame; cast in it, from 0.3 m outboard of each dot point straight in (-x), either face
    const shell = new THREE.Mesh((g.getObjectByName('body-shell') as THREE.Mesh).geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    shell.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const detail = (g.getObjectByName('body-detail') as THREE.Mesh).geometry;
    const p = detail.getAttribute('position'); const c = detail.getAttribute('color');
    for (const [hex, name] of [[DOT_WHITE, 'white'], [DOT_BLUE, 'blue']] as const) {
      const k = col(hex);
      const seen = new Set<string>();
      let worst = Infinity; let at = '';
      for (let i = 0; i < p.count; i++) {
        if (p.getX(i) < 0 || Math.abs(c.getX(i) - k.r) > 1e-6 || Math.abs(c.getY(i) - k.g) > 1e-6 || Math.abs(c.getZ(i) - k.b) > 1e-6) continue;
        const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ray.set(new THREE.Vector3(p.getX(i) + 0.3, p.getY(i), p.getZ(i)), new THREE.Vector3(-1, 0, 0));
        const hit = ray.intersectObject(shell, false)[0];
        if (!hit) continue;
        const gap = p.getX(i) - hit.point.x;
        if (gap < worst) { worst = gap; at = key; }
      }
      assert.ok(seen.size > 100, `${kind}: ${seen.size} ${name} dot points`);
      assert.ok(worst >= 0.001, `${kind}: a ${name} dot point ${(worst * 1000).toFixed(1)} mm off the body at ${at} (buried if negative)`);
    }
    disposeScotrailDmu(root);
  }
});

test('ScotRail 170 first-class line: the white dot field keeps 2 cm clear of the yellow line over the DMCL windows', () => {
  const kind = 'sr170x3';
  const root = buildScotrailDmu(kind);
  const look = scotrailDmuLook('turbostar');
  const ly0 = look.windowY[1] + 0.07; const ly1 = look.windowY[1] + 0.1;
  let cars = 0;
  for (const car of scotrailDmuLayout(kind).cars) {
    const g = root.getObjectByName(`car-${car.index}`)!;
    let line = false;
    g.traverse((o) => { if (o.name === 'first-class-line') line = true; });
    if (!line) continue;
    cars++;
    const detail = (g.getObjectByName('body-detail') as THREE.Mesh).geometry;
    const p = detail.getAttribute('position'); const c = detail.getAttribute('color');
    const is = (i: number, hex: number): boolean => { const k = col(hex); return Math.abs(c.getX(i) - k.r) < 1e-6 && Math.abs(c.getY(i) - k.g) < 1e-6 && Math.abs(c.getZ(i) - k.b) < 1e-6; };
    // the line's length along the car: the +x side's yellow at its height
    const zs: number[] = [];
    for (let i = 0; i < p.count; i++) if (p.getX(i) > 1 && is(i, SR_YELLOW) && p.getY(i) >= ly0 - 1e-4 && p.getY(i) <= ly1 + 1e-4) zs.push(p.getZ(i));
    assert.ok(zs.length > 0, `car ${car.index}: the line drawn`);
    const z0 = Math.min(...zs) - 0.02; const z1 = Math.max(...zs) + 0.02;
    const near: string[] = [];
    for (let i = 0; i < p.count; i++) {
      if (p.getX(i) > 0 && is(i, DOT_WHITE) && p.getY(i) > ly0 - 0.02 && p.getY(i) < ly1 + 0.02 && p.getZ(i) > z0 && p.getZ(i) < z1) near.push(`${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`);
    }
    assert.deepEqual([...new Set(near)], [], `car ${car.index}: white dot points on the yellow line`);
  }
  assert.ok(cars >= 1, 'a DMCL with its first-class line');
  disposeScotrailDmu(root);
});

test('ScotRail DMU wordmark: no plate behind it: on the 170 the blue dots run on under the lettering, on the 158 it follows the blue field over the navy; no white dot comes near it', () => {
  for (const kind of SCOTRAIL_DMU_KINDS) {
    const root = buildScotrailDmu(kind);
    for (const car of scotrailDmuLayout(kind).cars) {
      const g = root.getObjectByName(`car-${car.index}`)!;
      const text = (g.getObjectByName('livery-decals') as THREE.Mesh).geometry.getAttribute('position');
      const zs: number[] = []; const ys: number[] = [];
      for (let i = 0; i < text.count; i++) if (text.getX(i) > 0) { zs.push(text.getZ(i)); ys.push(text.getY(i)); }
      const [z0, z1, y0, y1] = [Math.min(...zs), Math.max(...zs), Math.min(...ys), Math.max(...ys)];
      const detail = (g.getObjectByName('body-detail') as THREE.Mesh).geometry;
      const p = detail.getAttribute('position'); const c = detail.getAttribute('color');
      // the dots' centres on the +x side (every triangle of a dot's fan starts at its centre), by colour
      const centres = (hex: number): [number, number][] => {
        const k = col(hex); const out = new Map<string, [number, number]>();
        for (let i = 0; i + 2 < p.count; i += 3) {
          if (p.getX(i) < 0 || Math.abs(c.getX(i) - k.r) > 1e-6 || Math.abs(c.getY(i) - k.g) > 1e-6 || Math.abs(c.getZ(i) - k.b) > 1e-6) continue;
          out.set(`${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`, [p.getY(i), p.getZ(i)]);
        }
        return [...out.values()];
      };
      const under = centres(DOT_BLUE).filter(([y, z]) => y > y0 && y < y1 && z > z0 && z < z1);
      if (kind === 'sr170x3') {
        // the 170's over the blue field (scotrail170-01)
        assert.ok(under.length >= 5, `${kind} car ${car.index}: ${under.length} blue dots under the wordmark`);
      } else {
        // the 158's at the blue field's rear end, over the navy (scotrail158-05): no blue dot under it, the field's last dots just before it
        assert.equal(under.length, 0, `${kind} car ${car.index}: blue dots under the wordmark`);
        const dir = car.cab === 'rear' ? -1 : 1; const base = car.cab === 'rear' ? car.end : car.start;
        const sOf = (z: number): number => (z - base) * dir;
        const front = Math.min(sOf(z0), sOf(z1));
        const blue = centres(DOT_BLUE).map(([, z]) => sOf(z));
        assert.ok(blue.every((s) => s < front), `${kind} car ${car.index}: a blue dot behind the wordmark`);
        assert.ok(front - Math.max(...blue) < 0.3, `${kind} car ${car.index}: the wordmark ${front - Math.max(...blue)} m behind the field's last dots`);
      }
      // under it, not through it: the lettering is one flat quad (x linear in y); every blue dot vertex in its box at least 2 mm inside it
      const xAt = new Map<number, number>();
      for (let i = 0; i < text.count; i++) if (text.getX(i) > 0) xAt.set(text.getY(i), text.getX(i));
      const xText = (yy: number): number => xAt.get(y0)! + ((yy - y0) / (y1 - y0)) * (xAt.get(y1)! - xAt.get(y0)!);
      const kb = col(DOT_BLUE);
      let worst = Infinity;
      for (let i = 0; i < p.count; i++) {
        if (p.getX(i) < 0 || Math.abs(c.getX(i) - kb.r) > 1e-6 || Math.abs(c.getY(i) - kb.g) > 1e-6 || Math.abs(c.getZ(i) - kb.b) > 1e-6) continue;
        if (p.getY(i) < y0 || p.getY(i) > y1 || p.getZ(i) < z0 || p.getZ(i) > z1) continue;
        worst = Math.min(worst, xText(p.getY(i)) - p.getX(i));
      }
      assert.ok(worst >= 0.002, `${kind} car ${car.index}: a blue dot stands ${(-worst * 1000).toFixed(1)} mm through the lettering`);
      const nearWhite = centres(DOT_WHITE).filter(([y, z]) => y > y0 - 0.08 && y < y1 + 0.08 && z > z0 - 0.08 && z < z1 + 0.08);
      assert.equal(nearWhite.length, 0, `${kind} car ${car.index}: white dots by the white lettering`);
    }
    disposeScotrailDmu(root);
  }
});
