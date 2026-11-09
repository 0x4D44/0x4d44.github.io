import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, shedLayout, shedToWorld, stationBuilding, worldToShed } from '../../core/station.ts';
import { buildConcourse, concourseGrid, FACET_RISE, FASCIA_BOTTOM, FUNNEL_GLAZING_RADIUS, GLAZED_SHARE, keepTriangles, RIM_GLAZING_WIDTH,
  ROOFLIGHT_AZIMUTHS, ROOFLIGHT_RADIUS, SKIN_LIFT, SOFFIT_LIFT } from '../src/concourse.ts';
import { WESTERN_RANGE } from '../src/shed.ts';

// The roof's skin: soffit, cladding, glazing and edge.
// Published: only 15 % of the roof is glazed, "at the perimeter and towards the funnel" (refs/DIMENSIONS.md section 2:
// Building magazine, Construction Index). R-a/conc-ab: a pale solid soffit between white ribs, glass round the funnel.
// R-c, R-c2: silver cladding in diamonds, dark rhombic rooflights in a row, a thin bright edge round the dome.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const station = stationBuilding(data) as NonNullable<ReturnType<typeof stationBuilding>>;
const close = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const EPS = 1e-4; // float32 geometry
const hotel = data.buildings.find(b => b.id === 46821177)!;
const skin = buildConcourse(canopy, station.pts, layout, [hotel.pts]);
skin.updateMatrixWorld(true);
const { centre: axis, grid: skinGrid } = concourseGrid(canopy, station.pts, layout, [hotel.pts]);
const SLOPE_FACE = 0.7; // a roof facet's normal.y is 0.89 or more (26 degrees at the rim); the edge apron's is about 0.4

interface Face { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; mid: THREE.Vector3; normal: THREE.Vector3; area: number }
function faces(name: string): Face[] {
  const mesh = skin.getObjectByName(name) as THREE.Mesh | undefined;
  assert.ok(mesh, `the concourse has no ${name} mesh`);
  const p = mesh.geometry.getAttribute('position'), idx = mesh.geometry.index!;
  const out: Face[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => new THREE.Vector3(p.getX(idx.getX(i + k)), p.getY(idx.getX(i + k)), p.getZ(idx.getX(i + k)))) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    out.push({ a, b, c, mid: a.clone().add(b).add(c).divideScalar(3), normal: n.clone().normalize(), area: n.length() / 2 });
  }
  return out;
}
// Independent of the module's own rim function: the distance from a point to the OSM outline or the northern concourse limit.
const northLimit = Math.max(...station.pts.map(p => worldToShed(layout, p)).filter(p => p.u < -45 && p.v <= WESTERN_RANGE.v1 + .1).map(p => p.v));
function toRim(x: number, z: number): number {
  let best = Math.max(0, northLimit - worldToShed(layout, [x, z]).v);
  for (let i = 0; i < station.pts.length; i++) {
    const a = station.pts[i]!, b = station.pts[(i + 1) % station.pts.length]!, dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return best;
}
const toAxis = (v: THREE.Vector3): number => Math.hypot(v.x - axis[0], v.z - axis[1]);
const inGlazedZone = (f: Face): boolean => toAxis(f.mid) < FUNNEL_GLAZING_RADIUS || toRim(f.mid.x, f.mid.z) < RIM_GLAZING_WIDTH;
const soffitCells = (): Face[] => faces('concourse-panels').filter(f => f.normal.y > SLOPE_FACE);
const crownOf = (glass: Face[]): Face[] => glass.filter(f => [f.a, f.b, f.c].some(v => toAxis(v) < 1e-3));
const roofGlass = (): Face[] => { const glass = faces('concourse-glass'), crown = crownOf(glass); return glass.filter(f => !crown.includes(f)); };

test('roof skin: 15 percent of the roof is glazed, round the funnel and in a band at the outline, as published', () => {
  const glass = faces('concourse-glass'), cladding = faces('concourse-cladding'), area = (fs: Face[]): number => fs.reduce((s, f) => s + f.area, 0);
  const share = area(glass) / (area(glass) + area(cladding));
  assert.ok(Math.abs(share - GLAZED_SHARE.published) <= GLAZED_SHARE.tolerance, `glazed share ${(100 * share).toFixed(1)} % of the roof, published 15 %`);
  const glazed = roofGlass(), soffit = soffitCells();
  assert.equal(soffit.length + glazed.length, keepTriangles(skinGrid, station.pts, layout).length, 'every roof cell is either glazed or has a soffit');
  for (const f of soffit) assert.ok(!inGlazedZone(f), `a solid cell at ${f.mid.x.toFixed(1)}, ${f.mid.z.toFixed(1)} lies in a glazed zone`);
  const lights = glazed.filter(f => !inGlazedZone(f));
  assert.equal(lights.length, 2 * ROOFLIGHT_AZIMUTHS.length, 'outside the two zones only the rooflights are glazed, two cells each');
  assert.ok(glazed.filter(inGlazedZone).length > 100, 'the funnel zone and the band are glazed');
  for (const g of glazed) for (const s of soffit) assert.ok(g.mid.distanceTo(s.mid) > 0.5, 'a soffit lies under a glazed cell');
  // the glazing is not one lump: the zone round the funnel exists and the band at the outline runs all round
  assert.ok(glazed.filter(f => toAxis(f.mid) < 9).length >= 12, 'glazing close round the funnel (within 9 m of its axis)');
  const band = glazed.filter(f => toAxis(f.mid) >= 14 && toRim(f.mid.x, f.mid.z) < 6);
  const compass = new Set(band.map(f => Math.floor(((Math.atan2(f.mid.z - axis[1], f.mid.x - axis[0]) + Math.PI) / (2 * Math.PI)) * 12)));
  assert.ok(compass.size >= 8, `the glazed band covers ${compass.size} of 12 compass sectors`);
});

test('roof skin: the oculus glazes the funnel crown, and one set of panes is bright from below, dark from above', () => {
  const glass = faces('concourse-glass'), crown = crownOf(glass);
  assert.equal(crown.length, skinGrid.nodes.filter(n => n.ring === 0).length, 'one fan triangle per node of the first ring');
  for (const f of crown) for (const v of [f.a, f.b, f.c]) assert.ok(v.y > canopy.apex - 0.3 && v.y < canopy.apex + SKIN_LIFT + 0.01, `oculus corner at ${v.y} m`);
  const below = skin.getObjectByName('concourse-glass') as THREE.Mesh, above = skin.getObjectByName('concourse-glass-top') as THREE.Mesh;
  assert.equal(below.geometry, above.geometry, 'one geometry, two looks');
  assert.equal((below.material as THREE.Material).side, THREE.BackSide);
  assert.equal((above.material as THREE.Material).side, THREE.FrontSide);
  const lum = (m: THREE.Material): number => { const e = (m as THREE.MeshPhongMaterial).emissive; return 0.2126 * e.r + 0.7152 * e.g + 0.0722 * e.b; };
  assert.ok(lum(below.material as THREE.Material) > 4 * lum(above.material as THREE.Material), 'glazing glows from below and does not from above');
  const cases = [
    { start: new THREE.Vector3(axis[0], 40, axis[1]), direction: new THREE.Vector3(0, -1, 0), mesh: 'concourse-glass-top', side: 'above' },
    { start: new THREE.Vector3(axis[0] + 0.2, 1, axis[1]), direction: new THREE.Vector3(0, 1, 0), mesh: 'concourse-glass', side: 'below' },
  ];
  for (const { start, direction, mesh, side } of cases) {
    const first = new THREE.Raycaster(start, direction).intersectObject(skin, true).find(h => !['concourse-column', 'concourse-lattice'].includes(h.object.name));
    assert.equal(first?.object.name, mesh, `a ray up or down the funnel axis meets the crown glazing from ${side}`);
  }
});

test('roof build-up: soffit above the member centre lines, cladding above that, the glazing level with the cladding', () => {
  const nodeY = new Map(skinGrid.nodes.map(n => [`${n.x.toFixed(3)},${n.z.toFixed(3)}`, n.height as number]));
  const lift = (v: THREE.Vector3): number | undefined => { const y = nodeY.get(`${v.x.toFixed(3)},${v.z.toFixed(3)}`); return y === undefined ? undefined : v.y - y; };
  for (const f of soffitCells()) for (const v of [f.a, f.b, f.c]) close(lift(v)!, SOFFIT_LIFT, EPS);
  for (const f of roofGlass()) for (const v of [f.a, f.b, f.c]) close(lift(v)!, SKIN_LIFT, EPS);
  let corners = 0, middles = 0;
  for (const f of faces('concourse-cladding')) for (const v of [f.a, f.b, f.c]) {
    const l = lift(v);
    if (l !== undefined) { close(l, SKIN_LIFT, EPS); corners++; } else middles++; // a diamond's middle is not a node: it stands FACET_RISE above its plane
  }
  assert.ok(corners > 1000 && middles > 1000, `${corners} corner vertices, ${middles} facet middles`);
  // each facet middle rises FACET_RISE above the midpoint of the rib it sits over
  const diamonds = faces('concourse-cladding').filter(f => [f.a, f.b, f.c].some(v => lift(v) === undefined));
  for (const f of diamonds.slice(0, 400)) {
    const middle = [f.a, f.b, f.c].find(v => lift(v) === undefined)!, ends = [f.a, f.b, f.c].filter(v => v !== middle);
    const plane = (ends[0]!.y + ends[1]!.y) / 2; // the sloping skin's height beside the middle, to within the roof's slope across a cell
    assert.ok(middle.y > plane - 1.4 && middle.y < plane + FACET_RISE + 1.4, 'a facet middle stands on the skin');
  }
  assert.ok(SOFFIT_LIFT < SKIN_LIFT - 0.2, 'a cavity between soffit and cladding');
});

test('roof build-up: a ray meets the cladding from above and the soffit from below in a solid cell, and glass both ways in a glazed one', () => {
  // whole cells only: a cell clipped to a sliver by the Range cut can lie wholly under a member (0.15 m rib, 0.22 m tube)
  const soffit = soffitCells().filter(f => f.area > 1.5), glazed = roofGlass().filter(f => f.area > 1.5);
  assert.ok(soffit.length > 1000 && glazed.length > 100, `${soffit.length} solid and ${glazed.length} glazed whole cells`);
  // the roof's own layers only: not the funnel or the fit-out standing under it
  const layers = skin.children.filter(c => !['concourse-column', 'concourse-fitout'].includes(c.name));
  const first = (start: THREE.Vector3, direction: THREE.Vector3): string | undefined => new THREE.Raycaster(start, direction).intersectObjects(layers, true)[0]?.object.name;
  for (let i = 0; i < soffit.length; i += 9) {
    const m = soffit[i]!.mid;
    assert.equal(first(new THREE.Vector3(m.x, 45, m.z), new THREE.Vector3(0, -1, 0)), 'concourse-cladding', `solid cell at ${m.x.toFixed(1)}, ${m.z.toFixed(1)} is not clad from above`);
    assert.equal(first(new THREE.Vector3(m.x, 0.5, m.z), new THREE.Vector3(0, 1, 0)), 'concourse-panels', `solid cell at ${m.x.toFixed(1)}, ${m.z.toFixed(1)} has no soffit from below`);
  }
  for (let i = 0; i < glazed.length; i += 5) {
    const m = glazed[i]!.mid;
    assert.equal(first(new THREE.Vector3(m.x, 45, m.z), new THREE.Vector3(0, -1, 0)), 'concourse-glass-top', `glazed cell at ${m.x.toFixed(1)}, ${m.z.toFixed(1)} is not glass from above`);
    assert.equal(first(new THREE.Vector3(m.x, 0.5, m.z), new THREE.Vector3(0, 1, 0)), 'concourse-glass', `glazed cell at ${m.x.toFixed(1)}, ${m.z.toFixed(1)} is not glass from below`);
  }
});

test('rooflights: a row of rhombi, two adjoining cells each, on the south-west slope about two thirds of the way out', () => {
  const lights = roofGlass().filter(f => !inGlazedZone(f));
  const funnel = worldToShed(layout, axis);
  const key = (v: THREE.Vector3): string => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
  const mates = lights.map(f => lights.filter(g => g !== f && [g.a, g.b, g.c].filter(v => [f.a, f.b, f.c].some(w => key(w) === key(v))).length === 2));
  assert.ok(mates.every(m => m.length === 1), 'each rooflight cell has exactly one partner across an edge');
  const azimuths = new Set<number>();
  for (const [i, f] of lights.entries()) {
    const g = mates[i]![0]!, c = f.mid.clone().add(g.mid).multiplyScalar(0.5), s = worldToShed(layout, [c.x, c.z]);
    const reach = Math.hypot(funnel.u - s.u, funnel.v - s.v), azimuth = (Math.atan2(funnel.v - s.v, funnel.u - s.u) * 180) / Math.PI;
    assert.ok(Math.abs(reach - ROOFLIGHT_RADIUS) < 4, `rooflight ${reach.toFixed(1)} m from the funnel axis, assumed ${ROOFLIGHT_RADIUS} m`);
    assert.ok(azimuth > 8 && azimuth < 90, `rooflight at ${azimuth.toFixed(0)} degrees, which is not south of west`);
    assert.ok(f.normal.angleTo(g.normal) < 0.06, 'the two cells are one plane, a flat rhombus');
    azimuths.add(Math.round(azimuth / 4));
  }
  assert.ok(azimuths.size >= ROOFLIGHT_AZIMUTHS.length, `${azimuths.size} distinct rooflights in the row`);
  const target = shedToWorld(layout, funnel.u - ROOFLIGHT_RADIUS * Math.cos(Math.PI / 6), funnel.v - ROOFLIGHT_RADIUS * Math.sin(Math.PI / 6));
  assert.ok(lights.some(f => Math.hypot(f.mid.x - target[0], f.mid.z - target[1]) < 3.5), 'a rooflight at 30 degrees south of west');
});

test('roof edge: a vertical fascia stands on the outline, over the glazed wall, up to the skin', () => {
  const wall = (skin.getObjectByName('concourse-wall') as THREE.Mesh).geometry.getAttribute('position').count / 4;
  const fascia = faces('concourse-panels').filter(f => f.normal.y <= SLOPE_FACE);
  assert.equal(fascia.length, 2 * wall, 'two triangles of fascia for each pane of the rim wall');
  for (const f of fascia) {
    const out = (f.normal.x * (f.mid.x - axis[0]) + f.normal.z * (f.mid.z - axis[1])) / Math.hypot(f.normal.x, f.normal.z);
    assert.ok(out > 0 && Math.abs(f.normal.y) < 1e-3, 'a fascia face is vertical and looks out of the roof');
    for (const v of [f.a, f.b, f.c]) {
      assert.ok(v.y > canopy.rim - EPS && v.y < canopy.rim + SKIN_LIFT + EPS, `fascia corner at ${v.y} m`);
      assert.ok(toRim(v.x, v.z) < 0.1, `fascia corner ${toRim(v.x, v.z).toFixed(2)} m inside the roof outline`);
    }
  }
  const heights = fascia.flatMap(f => [f.a.y, f.b.y, f.c.y]);
  close(Math.max(...heights), canopy.rim + SKIN_LIFT, EPS);
  close(Math.min(...heights), canopy.rim + FASCIA_BOTTOM, EPS);
  // the fascia stands on the cell outline, so the roof's overall extent is that of its cells (the evidence pack pins it at 137.2787 m)
  const along = new THREE.Vector3(Math.sin(layout.heading), 0, -Math.cos(layout.heading));
  const s = faces('concourse-panels').flatMap(f => [f.a, f.b, f.c]).map(v => v.dot(along));
  close(Math.max(...s) - Math.min(...s), 137.278699, 0.001);
});

test('roof materials: the underside reads light, as the scene lights shine from above', () => {
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const soffit = (skin.getObjectByName('concourse-panels') as THREE.Mesh).material as THREE.Material;
  assert.equal(soffit.type, 'MeshBasicMaterial', 'the soffit is unlit, so it cannot go black');
  assert.equal(soffit.side, THREE.DoubleSide, 'the soffit shows from below, the apron from outside');
  const member = (skin.getObjectByName('concourse-lattice') as THREE.Mesh).material as THREE.MeshLambertMaterial;
  assert.ok(lum(member.emissive) > 0.35, `members glow ${lum(member.emissive).toFixed(2)} from below`);
  const funnel = (skin.getObjectByName('concourse-column') as THREE.Mesh).material as THREE.MeshLambertMaterial;
  assert.equal(funnel.type, 'MeshLambertMaterial', 'the funnel is the same painted steel');
  assert.ok(funnel.color.r > 0.85 && lum(funnel.emissive) > 0.15 && lum(funnel.emissive) < lum(member.emissive), `the funnel's tubes stay white but keep a shaded side (glow ${lum(funnel.emissive).toFixed(2)})`);
});

test('roof edge: the glazed wall is blue-grey reflective glass in thin dark mullions, three posts to an edge and a rail across', () => {
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const wall = skin.getObjectByName('concourse-wall') as THREE.Mesh, bars = skin.getObjectByName('concourse-mullions') as THREE.Mesh;
  const edges = wall.geometry.getAttribute('position').count / 4, p = bars.geometry.getAttribute('position');
  assert.equal(p.count % 24, 0, 'every framing member is a box of 24 vertices');
  let posts = 0, thin = 0, rails = 0;
  for (let b = 0; b < p.count; b += 24) {
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = b; i < b + 24; i++) { const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)); lo.min(v); hi.max(v); }
    const size = hi.sub(lo);
    if (size.y > 2) { posts++; if (Math.max(size.x, size.z) <= 0.13) thin++; } else rails++; // 0.13 m: not the 0.18 m posts of the picket fence it replaces
  }
  // R-c: fine verticals close together: a post at each rim node (one per edge, and one more for each open run of the rim) and two more along every edge
  assert.ok(posts >= 3 * edges && posts <= 3 * edges + 8, `${posts} posts on ${edges} edges`);
  assert.equal(thin, posts, 'every post is at most 0.13 m square');
  assert.equal(rails, edges, 'one rail along each edge');
  const glass = wall.material as THREE.MeshPhongMaterial, steel = bars.material as THREE.MeshLambertMaterial;
  assert.ok(glass.transparent && glass.opacity >= 0.5 && glass.opacity <= 0.7, `the wall glass hides some of what is behind it (opacity ${glass.opacity})`);
  assert.ok(glass.color.b > glass.color.r && lum(glass.color) < 0.5, 'the glass is blue-grey, not clear');
  assert.ok(lum(steel.color) < 0.25 && lum(steel.emissive) < 0.05, `the mullions are dark steel (lit ${lum(steel.color).toFixed(2)}, glow ${lum(steel.emissive).toFixed(3)})`);
});
