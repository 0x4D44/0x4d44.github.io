import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { SCOTRAIL_DMU_FIGURES, SCOTRAIL_DMU_KINDS, scotrailDmuLayout } from '../../core/train-scotrail-dmu.ts';
import { buildScotrailDmu, disposeScotrailDmu, dmuCarPlan, DOT_BLUE, DOT_WHITE, LAMP_170, SR_YELLOW, scotrailDmuFormation, scotrailDmuLook, TUMBLEHOME } from '../src/train-scotrail-dmu.ts';
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
  assert.deepEqual(tally('sr170x3'), { pantograph: 0, bogies: 6, doors: 12, glass: 3, underfloor: 15, noseCouplers: 2, buffers: 4, litHeads: 2, heads: 4, domeLamps: 2, ploughs: 0, roofKit: 5 });
  assert.deepEqual(tally('sr158x2'), { pantograph: 0, bogies: 4, doors: 8, glass: 2, underfloor: 10, noseCouplers: 2, buffers: 0, litHeads: 2, heads: 4, domeLamps: 0, ploughs: 2, roofKit: 6 });
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

test('ScotRail DMU roof: the 170 cab housing ramps up off the dome, runs low and steps up at its rear; slatted louvres sit on both shoulders of every 170 car', () => {
  const look = scotrailDmuLook('turbostar');
  const hs = look.cabHousing!;
  const lv = look.louvres!;
  const f = SCOTRAIL_DMU_FIGURES.turbostar;
  const crown = f.height.value;
  const root = buildScotrailDmu('sr170x3');
  const layout = scotrailDmuLayout('sr170x3');
  const verts = (mesh: THREE.Mesh, hex: number): [number, number, number][] => {
    const p = mesh.geometry.getAttribute('position'); const c = mesh.geometry.getAttribute('color'); const k = col(hex);
    const out: [number, number, number][] = [];
    for (let i = 0; i < p.count; i++) if (Math.abs(c.getX(i) - k.r) < 1e-6 && Math.abs(c.getY(i) - k.g) < 1e-6 && Math.abs(c.getZ(i) - k.b) < 1e-6) out.push([p.getX(i), p.getY(i), p.getZ(i)]);
    return out;
  };
  for (const car of layout.cars) {
    const g = root.getObjectByName(`car-${car.index}`)!;
    const detail = g.getObjectByName('body-detail') as THREE.Mesh;
    const dir = car.cab === 'rear' ? -1 : 1;
    const base = car.cab === 'rear' ? car.end : car.start;
    const sOf = (z: number): number => (z - base) * dir;
    const housing = verts(detail, hs.colour);
    if (!car.cab) {
      assert.equal(housing.length, 0, `car ${car.index}: no cab housing on an intermediate car`);
    } else {
      const topIn = (a: number, b: number): number => Math.max(...housing.filter((v) => sOf(v[2]) >= a - 1e-4 && sOf(v[2]) <= b + 1e-4).map((v) => v[1]));
      // the front edge stands at the roof, the slab is `low` tall once the ramp is climbed, the rear block `high`
      assert.ok(Math.abs(Math.min(...housing.map((v) => sOf(v[2]))) - hs.s0) < 1e-4, `car ${car.index}: the housing starts at ${hs.s0}`);
      assert.ok(Math.abs(topIn(hs.s0, hs.s0) - crown) < 1e-4, `car ${car.index}: its front edge is at the crown, ramped (${topIn(hs.s0, hs.s0)})`);
      assert.ok(Math.abs(topIn(hs.s0 + hs.ramp, hs.step - 0.01) - (crown + hs.low)) < 1e-4, `car ${car.index}: the low slab`);
      assert.ok(Math.abs(topIn(hs.step + 0.1, hs.s1) - (crown + hs.high)) < 1e-4, `car ${car.index}: the rear block`);
      assert.ok(hs.high > 2 * hs.low, 'the block stands well above the slab (scotrail170-01)');
      // across the roof, inside the flat of the crown (carSection: |x| under W - 0.55)
      assert.ok(Math.max(...housing.map((v) => Math.abs(v[0]))) <= hs.half + 1e-6);
    }
    // louvres: one panel a side at each station, its slats on it, every vertex on or just proud of the shoulder's ellipse
    const markers = g.children.filter((o) => o.name === 'roof-louvre');
    assert.equal(markers.length, 2 * lv.at.length, `car ${car.index}: louvre groups`);
    assert.deepEqual(markers.map((m) => Math.sign(m.position.x)).sort(), [...lv.at.map(() => -1), ...lv.at.map(() => 1)]);
    const W = f.width.value / 2 - 0.02; // carSection's W: the half-width less DOOR_RELIEF (web/src/train.ts, 0.02)
    const rx = 0.55; const ry = crown - look.wallTop - 0.012;
    for (const hex of [lv.panel, lv.slat]) {
      const vs = verts(detail, hex);
      assert.equal(vs.length, 2 * lv.at.length * (hex === lv.panel ? 1 : lv.slats) * 6, `car ${car.index}: ${hex === lv.panel ? 'panels' : 'slats'}`);
      for (const v of vs) {
        const e = ((Math.abs(v[0]) - (W - rx)) / rx) ** 2 + ((v[1] - look.wallTop) / ry) ** 2;
        assert.ok(e >= 1 && e <= 1.08, `car ${car.index}: louvre vertex off the shoulder (${e})`);
      }
    }
  }
  disposeScotrailDmu(root);
  // the 158 has neither
  const s158 = scotrailDmuLook('sprinter158');
  assert.equal(s158.cabHousing, undefined);
  assert.equal(s158.louvres, undefined);
  const r158 = buildScotrailDmu('sr158x2');
  assert.equal(names(r158).filter((n) => n === 'roof-louvre').length, 0);
  disposeScotrailDmu(r158);
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

test('ScotRail 170 face: round headlight and tail lenses wholly on the face, in a two-round bezel; the yellow brow an even band right across', () => {
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
    // the headlight outboard of its tail lamp, the tail a little lower, the two bezel rounds overlapping (one peanut-shaped bezel)
    assert.ok(LAMP_170.head.x > LAMP_170.tail.x && LAMP_170.tail.y < LAMP_170.head.y);
    assert.ok(LAMP_170.head.x - LAMP_170.tail.x < LAMP_170.head.r + 0.035 + LAMP_170.tail.r + 0.028, 'the bezel rounds overlap');
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

test('ScotRail DMU wordmark: no plate behind it: the blue dots run on under the lettering, and no white dot comes near it', () => {
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
      assert.ok(under.length >= 5, `${kind} car ${car.index}: ${under.length} blue dots under the wordmark`);
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
