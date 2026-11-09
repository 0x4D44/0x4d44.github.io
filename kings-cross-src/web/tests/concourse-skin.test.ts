import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, concourseHeight, shedLayout, shedToWorld, stationBuilding, worldToShed } from '../../core/station.ts';
import { buildConcourse, concourseGrid, FACET_RISE, FASCIA_BOTTOM, FUNNEL_GLAZING_RADIUS, GLAZED_SHARE, keepTriangles, RIM_GLAZING_WIDTH,
  ROOFLIGHT_AZIMUTHS, ROOFLIGHT_FRAME, ROOFLIGHT_HALF, ROOFLIGHT_RADIUS, SKIN_LIFT, SOFFIT_LIFT } from '../src/concourse.ts';
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
const SLOPE_FACE = 0.7; // a roof facet's normal.y is 0.89 or more (26 degrees at the rim)

/** A triangle of a mesh; `tone` is the luminance of its (first) vertex colour, linear, NaN in a mesh with none. */
interface Face { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; mid: THREE.Vector3; normal: THREE.Vector3; area: number; tone: number }
function faces(name: string): Face[] {
  const mesh = skin.getObjectByName(name) as THREE.Mesh | undefined;
  assert.ok(mesh, `the concourse has no ${name} mesh`);
  const p = mesh.geometry.getAttribute('position'), idx = mesh.geometry.index!, colour = mesh.geometry.getAttribute('color');
  const out: Face[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => new THREE.Vector3(p.getX(idx.getX(i + k)), p.getY(idx.getX(i + k)), p.getZ(idx.getX(i + k)))) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const n = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)), v = idx.getX(i);
    out.push({ a, b, c, mid: a.clone().add(b).add(c).divideScalar(3), normal: n.clone().normalize(), area: n.length() / 2,
      tone: colour ? 0.2126 * colour.getX(v) + 0.7152 * colour.getY(v) + 0.0722 * colour.getZ(v) : NaN });
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
const soffitCells = (): Face[] => {
  const cells = faces('concourse-panels');
  for (const f of cells) assert.ok(f.normal.y > SLOPE_FACE, `the panels hold a face that is not a roof facet (normal.y ${f.normal.y.toFixed(2)})`);
  return cells;
};
const standing = (): Face[] => { // fascia on the outline, upstands between solid and glazed cells: the panels' child
  const walls = faces('concourse-edges');
  for (const f of walls) assert.ok(Math.abs(f.normal.y) < 1e-3, `the edge band holds a face that is not vertical (normal.y ${f.normal.y.toFixed(2)})`);
  return walls;
};
// The cladding mesh holds the roof's facets, and the dome's skin turned down the Range cut (upright faces: the Range side's view of the cut).
const claddingFacets = (): Face[] => {
  const all = faces('concourse-cladding'), upright = all.filter(f => Math.abs(f.normal.y) < 1e-3);
  for (const f of all) assert.ok(f.normal.y > 0 || upright.includes(f), `the cladding holds a face that is neither a roof facet nor upright (normal.y ${f.normal.y.toFixed(2)})`);
  return all.filter(f => !upright.includes(f));
};
const claddingGable = (): Face[] => faces('concourse-cladding').filter(f => Math.abs(f.normal.y) < 1e-3);
const crownOf = (glass: Face[]): Face[] => glass.filter(f => [f.a, f.b, f.c].some(v => toAxis(v) < 1e-3));
const roofGlass = (): Face[] => { const glass = faces('concourse-glass'), crown = crownOf(glass); return glass.filter(f => !crown.includes(f)); };
// The roof's layers, and the height of the roof over a point of the floor.
const roofLayers = skin.children.filter(c => ['concourse-closure', 'concourse-glass', 'concourse-panels', 'concourse-lattice', 'concourse-cladding'].includes(c.name));
const roofAt = (u: number, v: number): number => { const w = shedToWorld(layout, u, v); return new THREE.Raycaster(new THREE.Vector3(w[0], 0, w[1]), new THREE.Vector3(0, 1, 0)).intersectObjects(roofLayers, true)[0]?.point.y ?? 0; };
const CORNICE = WESTERN_RANGE.storey * WESTERN_RANGE.storeys + 0.5;
const SILL = WESTERN_RANGE.storey + 0.15; // the first string course's top
const eastward = ((): THREE.Vector3 => { const east = shedToWorld(layout, 1, 0), origin = shedToWorld(layout, 0, 0); return new THREE.Vector3(east[0] - origin[0], 0, east[1] - origin[1]).normalize(); })();

test('roof skin: 15 percent of the roof is glazed, round the funnel and in a band at the outline, as published', () => {
  const glass = faces('concourse-glass'), cladding = claddingFacets(), area = (fs: Face[]): number => fs.reduce((s, f) => s + f.area, 0);
  const share = area(glass) / (area(glass) + area(cladding));
  assert.ok(Math.abs(share - GLAZED_SHARE.published) <= GLAZED_SHARE.tolerance, `glazed share ${(100 * share).toFixed(1)} % of the roof, published 15 %`);
  const glazed = roofGlass(), soffit = soffitCells();
  assert.equal(soffit.length + glazed.length, keepTriangles(skinGrid, station.pts, layout).length, 'every roof cell is either glazed or has a soffit');
  for (const f of soffit) assert.ok(!inGlazedZone(f), `a solid cell at ${f.mid.x.toFixed(1)}, ${f.mid.z.toFixed(1)} lies in a glazed zone`);
  assert.equal(glazed.filter(f => !inGlazedZone(f)).length, 0, 'every glazed cell lies in the funnel zone or the band at the outline: the rooflights are laid on the cladding, not cut into the lattice');
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
  assert.ok(below.geometry === above.geometry, 'one geometry, two looks'); // not assert.equal: a failed one would diff two geometries, which never finishes
  assert.equal((below.material as THREE.Material).side, THREE.BackSide);
  assert.equal((above.material as THREE.Material).side, THREE.FrontSide);
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  assert.equal((below.material as THREE.Material).type, 'MeshBasicMaterial', 'seen from below the glazing is unlit, so it is daylight whatever the scene lights');
  assert.ok(lum((below.material as THREE.MeshBasicMaterial).color) > 0.9 && lum((above.material as THREE.MeshPhongMaterial).emissive) < 0.05, 'glazing glows from below and does not from above');
  // R-a: from inside it is clear sky blue, each pane its own shade, so that the white members stand out against it (round 2: milky white)
  const tint = below.geometry.getAttribute('color'), mean = [0, 1, 2].map(k => Array.from({ length: tint.count }, (_, i) => tint.getComponent(i, k)).reduce((s, x) => s + x, 0) / tint.count);
  assert.ok(mean[2]! > 0.9 && mean[1]! < 0.9 * mean[2]! && mean[0]! < 0.8 * mean[2]!, `the panes are tinted blue: mean (${mean.map(x => x.toFixed(2)).join(', ')})`);
  const cases = [
    { start: new THREE.Vector3(axis[0], 40, axis[1]), direction: new THREE.Vector3(0, -1, 0), mesh: 'concourse-glass-top', side: 'above' },
    { start: new THREE.Vector3(axis[0] + 0.2, 1, axis[1]), direction: new THREE.Vector3(0, 1, 0), mesh: 'concourse-glass', side: 'below' },
  ];
  for (const { start, direction, mesh, side } of cases) {
    const first = new THREE.Raycaster(start, direction).intersectObject(skin, true).find(h => !['concourse-column', 'concourse-lattice', 'concourse-supports'].includes(h.object.name));
    assert.equal(first?.object.name, mesh, `a ray up or down the funnel axis meets the crown glazing from ${side}`);
  }
});

test('roof build-up: soffit above the member centre lines, cladding above that, the glazing level with the cladding', () => {
  const nodeY = new Map(skinGrid.nodes.map(n => [`${n.x.toFixed(3)},${n.z.toFixed(3)}`, n.height as number]));
  const lift = (v: THREE.Vector3): number | undefined => { const y = nodeY.get(`${v.x.toFixed(3)},${v.z.toFixed(3)}`); return y === undefined ? undefined : v.y - y; };
  for (const f of soffitCells()) for (const v of [f.a, f.b, f.c]) close(lift(v)!, SOFFIT_LIFT, EPS);
  for (const f of roofGlass()) for (const v of [f.a, f.b, f.c]) close(lift(v)!, SKIN_LIFT, EPS);
  let corners = 0, middles = 0;
  for (const f of claddingFacets()) for (const v of [f.a, f.b, f.c]) {
    const l = lift(v);
    if (l !== undefined) { close(l, SKIN_LIFT, EPS); corners++; } else middles++; // a diamond's middle is not a node: it stands FACET_RISE above its plane
  }
  assert.ok(corners > 1000 && middles > 1000, `${corners} corner vertices, ${middles} facet middles`);
  // each facet middle rises FACET_RISE above the midpoint of the rib it sits over
  const diamonds = claddingFacets().filter(f => [f.a, f.b, f.c].some(v => lift(v) === undefined));
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
  // the roof's own layers only: not the funnel or the fit-out standing under it, nor the wall's framing, which a straight sight line up from the floor can meet
  const layers = skin.children.filter(c => !['concourse-column', 'concourse-fitout', 'concourse-supports', 'concourse-mullions'].includes(c.name));
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

// A rooflight is read back from the built cladding: its faces are the ones that stand clear of every pillow, a flat sheet of dark glass (linear luminance under 0.1)
// in a frame of darker silver than the dome's (0.5 to 0.65). `hover` is a point's height over the roof's smooth surface (the profile, drawn in to the outline, so that the roof
// falls to the rim where the outline is: the nodes' height law, written out again here): the skin is 0.45 m over the nodes and a diamond rises 0.2 m more.
const surfaceAt = (x: number, z: number): number => { const r = Math.hypot(x - axis[0], z - axis[1]); return concourseHeight(canopy, (canopy.radius * r) / (r + toRim(x, z))); };
const hover = (v: THREE.Vector3): number => v.y - surfaceAt(v.x, v.z);
const PILLOW_TOP = SKIN_LIFT + FACET_RISE; // the highest a pillow reaches over the roof's surface
interface Rooflight { faces: Face[]; outer: THREE.Vector3[]; inner: THREE.Vector3[]; centre: THREE.Vector3 }
const rooflightsBuilt = (): Rooflight[] => {
  const lights = claddingFacets().filter(f => [f.a, f.b, f.c].every(v => hover(v) > PILLOW_TOP + 0.02)); // the frame and the glass stand clear of every pillow
  const key = (v: THREE.Vector3): string => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
  const group = lights.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i]!)));
  const owner = new Map<string, number>();
  lights.forEach((f, i) => { for (const v of [f.a, f.b, f.c]) { const k = key(v), o = owner.get(k); if (o === undefined) owner.set(k, i); else group[root(i)] = root(o); } });
  const by = new Map<number, Face[]>();
  lights.forEach((f, i) => by.set(root(i), [...(by.get(root(i)) ?? []), f]));
  return [...by.values()].map(fs => {
    const corners = new Map(fs.flatMap(f => [f.a, f.b, f.c]).map(v => [key(v), v] as const));
    const all = [...corners.values()], lift = all.map(hover), lo = Math.min(...lift), hi = Math.max(...lift);
    const outer = all.filter((_, i) => lift[i]! < lo + 0.01), inner = all.filter((_, i) => lift[i]! > hi - 0.01);
    assert.equal(outer.length + inner.length, all.length, 'a rooflight has two rings of corners, an outer one and an inner one');
    return { faces: fs, outer, inner, centre: inner.reduce((m, v) => m.add(v), new THREE.Vector3()).divideScalar(inner.length) };
  });
};
/** Four corners seen from above: two diagonals that bisect one another at right angles, a rhombus. Their lengths, and the direction of the short one. */
const rhombus = (corners: THREE.Vector3[]): { long: number; short: number; along: THREE.Vector3 } => {
  assert.equal(corners.length, 4, 'four corners');
  const mid = corners.reduce((m, v) => m.add(v), new THREE.Vector3()).divideScalar(4);
  const [p, q, r, s] = corners.map(v => new THREE.Vector3(v.x - mid.x, 0, v.z - mid.z)).sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  assert.ok(p.clone().add(r).length() < 1e-3 && q.clone().add(s).length() < 1e-3, 'the diagonals bisect one another');
  assert.ok(Math.abs(p.dot(q)) < 1e-3, 'the diagonals are at right angles: a rhombus');
  return p.length() > q.length() ? { long: 2 * p.length(), short: 2 * q.length(), along: q.clone().normalize() } : { long: 2 * q.length(), short: 2 * p.length(), along: p.clone().normalize() };
};

test('rooflights: four clean rhombi of dark glass in a thin silver frame that rises to it, wider across the slope than up it, three quarters of the way out', () => {
  const lights = rooflightsBuilt(), funnel = worldToShed(layout, axis);
  assert.equal(lights.length, ROOFLIGHT_AZIMUTHS.length, 'one rooflight to each azimuth');
  const azimuths = new Set<number>();
  for (const light of lights) {
    const { long, short, along } = rhombus(light.outer), inside = rhombus(light.inner), s = worldToShed(layout, [light.centre.x, light.centre.z]);
    const reach = Math.hypot(funnel.u - s.u, funnel.v - s.v), azimuth = (Math.atan2(funnel.v - s.v, funnel.u - s.u) * 180) / Math.PI;
    assert.ok(Math.abs(long - 2 * ROOFLIGHT_HALF.across) < 1e-3 && Math.abs(short - 2 * ROOFLIGHT_HALF.along) < 1e-3, `a rhombus ${long.toFixed(2)} m by ${short.toFixed(2)} m`);
    assert.ok(long > 1.15 * short && long > 8 && long < 13 && short > 5, `wider across the slope (${long.toFixed(1)} m) than up it (${short.toFixed(1)} m), R-c: a twelfth of the dome across`);
    const way = reach / (reach + toRim(light.centre.x, light.centre.z)); // the share of the way from the funnel axis to the outline
    assert.ok(Math.abs(reach - ROOFLIGHT_RADIUS) < 0.05 && way > 0.65 && way < 0.85, `${reach.toFixed(1)} m from the funnel axis, ${(100 * way).toFixed(0)} % of the way out to the outline`);
    assert.ok(azimuth > -50 && azimuth < 20, `at ${azimuth.toFixed(0)} degrees from due west, which is not on the dome's west face`);
    const radial = new THREE.Vector3(light.centre.x - axis[0], 0, light.centre.z - axis[1]).normalize();
    assert.ok(Math.abs(radial.dot(along)) > 0.999, 'the short diagonal runs up the slope, the long one round the dome');
    // the glass is the outer rhombus drawn in by the frame's share, on the same centre: a frame a dozenth or so of the way in (R-c2: a thin edge), not a hairline and not most of it
    assert.ok(inside.long > 0.8 * long && inside.long < 0.95 * long, `the glass is ${(100 * inside.long / long).toFixed(0)} % of the rhombus across`);
    close(inside.long, long * (1 - ROOFLIGHT_FRAME), 1e-3);
    close(inside.short, short * (1 - ROOFLIGHT_FRAME), 1e-3);
    const centre = light.outer.reduce((m, v) => m.add(v), new THREE.Vector3()).divideScalar(4);
    close(Math.hypot(centre.x - light.centre.x, centre.z - light.centre.z), 0, 1e-3);
    // the frame stands clear of the pillows (a low kerb, not a chimney) and rises to the glass, which is flat
    const lo = Math.min(...light.outer.map(hover)), hi = Math.min(...light.inner.map(hover));
    assert.ok(lo > PILLOW_TOP + 0.03 && lo < 1 && hi > lo + 0.2 && hi < lo + 0.7, `the frame stands ${lo.toFixed(2)} m over the nodes at its edge and ${hi.toFixed(2)} m at the glass`);
    const [c0, c1, c2, c3] = light.inner as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3], plane = new THREE.Plane().setFromCoplanarPoints(c0, c1, c2);
    assert.ok(Math.abs(plane.distanceToPoint(c3)) < 0.12, `the glass is a flat sheet, to within the roof's curve over its width (${plane.distanceToPoint(c3).toFixed(3)} m out of true)`);
    // dark glass, silver frame: the faces of the inner ring are the glass
    const glass = light.faces.filter(f => [f.a, f.b, f.c].every(v => light.inner.some(w => w.equals(v)))), frame = light.faces.filter(f => !glass.includes(f));
    assert.equal(glass.length, 2, 'the glass is one quad');
    assert.equal(frame.length, 8, 'the frame is four strips of two triangles');
    for (const f of glass) assert.ok(f.tone < 0.1, `the glass is dark (${f.tone.toFixed(3)})`);
    for (const f of frame) assert.ok(f.tone > 0.3 && f.tone < 0.6, `the frame is a rim of darker silver than the dome, not a white band (${f.tone.toFixed(3)})`); // R-c, R-c2: a thin edge round the glass
    for (const f of light.faces) assert.ok(f.normal.y > 0.5, 'a rooflight face looks up');
    azimuths.add(Math.round(azimuth / 10));
  }
  assert.equal(azimuths.size, ROOFLIGHT_AZIMUTHS.length, 'four distinct rooflights in the row');
});

test('rooflights: on the solid cladding, over the roof and clear of the glazed zones, with no pillow through the frame', () => {
  const cladding = claddingFacets();
  for (const light of rooflightsBuilt()) {
    const corners = [...light.outer, light.centre];
    for (const v of corners) {
      assert.ok(toAxis(v) > FUNNEL_GLAZING_RADIUS + 3 && toRim(v.x, v.z) > RIM_GLAZING_WIDTH + 3, `a rooflight corner ${toAxis(v).toFixed(1)} m from the axis and ${toRim(v.x, v.z).toFixed(1)} m from the outline stands in a glazed zone`);
      const s = worldToShed(layout, [v.x, v.z]);
      assert.ok(roofAt(s.u, s.v) > 0, 'a rooflight corner lies over the roof');
    }
    // no cladding vertex inside the outer ring stands as high as the frame's edge
    const [a, b, c, d] = [light.outer[0]!, light.outer[1]!, light.outer[2]!, light.outer[3]!];
    const side = (p: THREE.Vector3, q: THREE.Vector3, v: THREE.Vector3): number => (q.x - p.x) * (v.z - p.z) - (q.z - p.z) * (v.x - p.x);
    const ring = [a, b, c, d].sort((p, q) => Math.atan2(p.z - light.centre.z, p.x - light.centre.x) - Math.atan2(q.z - light.centre.z, q.x - light.centre.x));
    let under = 0;
    for (const f of cladding) for (const v of [f.a, f.b, f.c]) {
      if (hover(v) > PILLOW_TOP + 0.02) continue; // the rooflight's own
      const signs = ring.map((p, i) => Math.sign(side(p, ring[(i + 1) % 4]!, v)));
      if (signs.every(k => k === signs[0])) { under++; assert.ok(hover(v) < Math.min(...light.outer.map(hover)) - 0.03, `cladding stands ${hover(v).toFixed(2)} m over the nodes under a rooflight's frame`); }
    }
    assert.ok(under > 8, `${under} cladding corners lie under a rooflight`);
  }
});

// concourse-exterior-west: eye 1.1 m, 38 m west of the canopy's west rim, 4 m north of the funnel's line, fov 60 over 1280 x 800 (tools/evidence.mjs). Seen from so
// low a standpoint the dome's near slope is nearly edge-on: a rooflight two thirds of the way out is a line a few pixels tall, and one south of west is behind the
// dome's shoulder.
test('rooflights: from a low standpoint in the west each is in sight, a diamond of dark glass 40 px wide and 150 square pixels at least', () => {
  const eye = shedToWorld(layout, -129.9, 77), look = shedToWorld(layout, -30.3, 77);
  const camera = new THREE.PerspectiveCamera(60, 1280 / 800, 0.1, 4000);
  camera.position.set(eye[0], 1.1, eye[1]);
  camera.lookAt(look[0], 8, look[1]);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const px = (v: THREE.Vector3): [number, number] => { const p = v.clone().project(camera); return [(p.x + 1) * 640, (1 - p.y) * 400]; };
  const layers = skin.children.filter(c => !['concourse-column', 'concourse-fitout'].includes(c.name));
  for (const light of rooflightsBuilt()) {
    const shape = light.inner.map(px), cx0 = shape.reduce((s, p) => s + p[0], 0) / 4, cy0 = shape.reduce((s, p) => s + p[1], 0) / 4;
    shape.sort((p, q) => Math.atan2(p[1] - cy0, p[0] - cx0) - Math.atan2(q[1] - cy0, q[0] - cx0));
    const width = Math.max(...shape.map(p => p[0])) - Math.min(...shape.map(p => p[0])), area = Math.abs(shape.reduce((s, p, i) => s + p[0] * shape[(i + 1) % 4]![1] - shape[(i + 1) % 4]![0] * p[1], 0)) / 2;
    assert.ok(width >= 40 && area >= 150, `a rooflight ${width.toFixed(0)} px wide, ${area.toFixed(0)} square pixels`);
    // the first thing the sight line to its middle meets is the rooflight (its frame or its glass), not the roof in front of it
    const from = camera.position, hit = new THREE.Raycaster(from, light.centre.clone().sub(from).normalize()).intersectObjects(layers, true)[0];
    assert.ok(hit && hit.object.name === 'concourse-cladding' && hover(hit.point) > PILLOW_TOP + 0.02, `the glass is hidden by ${hit?.object.name ?? 'nothing'}, ${hit ? hover(hit.point).toFixed(2) : ''} m over the roof`);
  }
});

test('roof edge: a vertical fascia stands on the outline, over the glazed wall, up to the skin', () => {
  const wall = (skin.getObjectByName('concourse-wall') as THREE.Mesh).geometry.getAttribute('position').count / 4;
  const fascia = standing().filter(f => Math.min(f.a.y, f.b.y, f.c.y) < canopy.rim + FASCIA_BOTTOM + EPS);
  assert.equal(fascia.length, 2 * wall, 'two triangles of fascia for each pane of the rim wall');
  for (const f of fascia) {
    const out = (f.normal.x * (f.mid.x - axis[0]) + f.normal.z * (f.mid.z - axis[1])) / Math.hypot(f.normal.x, f.normal.z);
    assert.ok(out > 0 && Math.abs(f.normal.y) < 1e-3, 'a fascia face is vertical and looks out of the roof');
    for (const v of [f.a, f.b, f.c]) {
      assert.ok(v.y > canopy.rim - EPS && v.y < canopy.rim + SKIN_LIFT + EPS, `fascia corner at ${v.y} m`);
      assert.ok(toRim(v.x, v.z) < 0.1, `fascia corner ${toRim(v.x, v.z).toFixed(2)} m inside the roof outline`);
    }
  }
  for (const f of fascia) assert.ok(f.tone > 0.25 && f.tone < 0.55, `the brim's edge is a grey band, not a white one (${f.tone.toFixed(2)}; R-c)`);
  const heights = fascia.flatMap(f => [f.a.y, f.b.y, f.c.y]);
  close(Math.max(...heights), canopy.rim + SKIN_LIFT, EPS);
  close(Math.min(...heights), canopy.rim + FASCIA_BOTTOM, EPS);
  // the fascia stands on the cell outline, so the roof's overall extent is that of its cells (the evidence pack pins it at 137.2787 m)
  const along = new THREE.Vector3(Math.sin(layout.heading), 0, -Math.cos(layout.heading));
  const s = [...faces('concourse-panels'), ...standing()].flatMap(f => [f.a, f.b, f.c]).map(v => v.dot(along));
  close(Math.max(...s) - Math.min(...s), 137.278699, 0.001);
});

test('roof materials: the underside reads light, as the scene lights shine from above', () => {
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const material = (name: string): THREE.Material => { const mesh = skin.getObjectByName(name) as THREE.Mesh | undefined; assert.ok(mesh, `the concourse has no ${name} mesh`); return mesh.material as THREE.Material; };
  const soffit = material('concourse-panels');
  assert.equal(soffit.type, 'MeshBasicMaterial', 'the soffit is unlit, so it cannot go black');
  assert.equal(soffit.side, THREE.DoubleSide, 'the soffit shows from below, the apron from outside');
  const member = material('concourse-lattice') as THREE.MeshLambertMaterial;
  assert.ok(lum(member.emissive) > 0.35, `members glow ${lum(member.emissive).toFixed(2)} from below`);
  const funnel = material('concourse-column') as THREE.MeshLambertMaterial;
  assert.equal(funnel.type, 'MeshLambertMaterial', 'the funnel is the same painted steel');
  assert.ok(funnel.color.r > 0.85 && lum(funnel.emissive) > 0.15 && lum(funnel.emissive) < lum(member.emissive), `the funnel's tubes stay white but keep a shaded side (glow ${lum(funnel.emissive).toFixed(2)})`);
});

// R-ab: dark coffers between bright, deep members; R-a: the glazing round the funnel a large bright field with the lattice in sharp silhouette. Linear luminance of
// the cells' own colours: the silver of the cladding is 0.5 to 0.65, so the recess is well under it and the glass well over it.
test('roof skin: the coffers are a grey recess, flat, under white members, and the glazing is a bright clear field (R-ab, R-a)', () => {
  const soffit = soffitCells().map(f => f.tone), glass = roofGlass().map(f => f.tone), mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(soffit.length > 1000 && glass.length > 100, `${soffit.length} coffers, ${glass.length} panes`);
  assert.ok(Math.min(...soffit) > 0.3 && Math.max(...soffit) < 0.5, `every coffer is mid grey, ${Math.min(...soffit).toFixed(2)} to ${Math.max(...soffit).toFixed(2)}, not near white`);
  assert.ok(Math.min(...glass) > 0.7, `every pane is bright, from ${Math.min(...glass).toFixed(2)}`);
  assert.ok(mean(glass) > 1.7 * mean(soffit), `the glazing (${mean(glass).toFixed(2)}) stands out from the recess (${mean(soffit).toFixed(2)}) as the brightest field`);
  const member = (skin.getObjectByName('concourse-lattice') as THREE.Mesh).material as THREE.MeshLambertMaterial;
  assert.ok(member.color.r > 0.9 && member.color.g > 0.9, 'the members are painted white');
});

test('roof edge: the glazed wall is dark reflective glass in thin dark mullions, three posts to an edge and a rail across', () => {
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
  assert.ok(glass.transparent && glass.opacity >= 0.7 && glass.opacity <= 0.9, `the wall glass hides most of what is behind it (opacity ${glass.opacity}; R-c: the interior does not show)`);
  assert.ok(glass.color.b > glass.color.r && lum(glass.color) < 0.3, 'the glass is dark blue-grey, not clear');
  assert.ok(lum(steel.color) < 0.25 && lum(steel.emissive) < 0.05, `the mullions are dark steel (lit ${lum(steel.color).toFixed(2)}, glow ${lum(steel.emissive).toFixed(3)})`);
});

test('roof edge: the wall stands about 3 m inside the outline, under the brim, and rises to the brim glass', () => {
  const wall = skin.getObjectByName('concourse-wall') as THREE.Mesh, p = wall.geometry.getAttribute('position');
  const layers = skin.children.filter(c => ['concourse-glass', 'concourse-panels'].includes(c.name));
  let inside = 0, tops = 0, beside = 0;
  for (let i = 0; i < p.count; i += 4) {
    // quad corners: foot, foot, top, top; the first foot is the node's, the pane's top is over the foot
    const foot = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)), top = new THREE.Vector3(p.getX(i + 3), p.getY(i + 3), p.getZ(i + 3));
    assert.ok(Math.abs(foot.y) < EPS && top.y > canopy.rim + 1, `pane ${i / 4}: foot ${foot.y}, top ${top.y}`);
    const set = toRim(foot.x, foot.z);
    assert.ok(set < 3.3, `the wall's foot stands ${set.toFixed(2)} m inside the outline (R-c: a brim of 3 m or so)`);
    if (set < 0.1) { beside++; continue; } // no roof over the inset line beside the hotel, so the wall stays on the outline there
    inside += set;
    // the roof is directly over the top of the wall: the brim glass (at the top) or, over a solid cell, its soffit 0.33 m under the skin
    const hit = new THREE.Raycaster(new THREE.Vector3(top.x, top.y - 0.5, top.z), new THREE.Vector3(0, 1, 0)).intersectObjects(layers, true)[0];
    assert.ok(hit && hit.point.y > top.y - 0.36 && hit.point.y < top.y + 0.15, `pane ${i / 4}: the roof is ${hit ? (hit.point.y - top.y).toFixed(2) : 'not'} m over the top of the wall`);
    tops++;
  }
  assert.ok(inside / tops > 2 && inside / tops < 3.1 && beside < 12 && tops > 30, `the wall is ${(inside / tops).toFixed(2)} m inside the outline on average on ${tops} panes, ${beside} stay on it`);
});

test('roof edge: the glass closes the Range cut from the cornice to the roof skin, so that no sky shows between the roof and the Range', () => {
  const closure = skin.getObjectByName('concourse-closure') as THREE.Mesh;
  assert.ok(closure, 'the concourse has a closure');
  assert.equal((closure.material as THREE.Material).side, THREE.BackSide, 'bright from the concourse, as the glazing is');
  // standing in the concourse, looking east at the Range's top from the floor: every sight line between the cornice and the roof meets glass at u = -12.3
  let sampled = 0;
  for (let v = WESTERN_RANGE.v0 + 6; v < WESTERN_RANGE.v1 - 6; v += 4.3) for (const y of [CORNICE + 0.6, CORNICE + 3, CORNICE + 5.5]) {
    if (roofAt(-26, v) < y + 0.3 || roofAt(-13, v) < y + 0.3) continue; // the roof is lower than this sight line here, so it would meet the roof first
    const w = shedToWorld(layout, -26, v), hit = new THREE.Raycaster(new THREE.Vector3(w[0], y, w[1]), eastward).intersectObjects(roofLayers, true)[0];
    assert.equal(hit?.object.name, 'concourse-closure', `a sight line at v ${v.toFixed(1)}, ${y.toFixed(1)} m high, meets ${hit?.object.name ?? 'the open sky'}`);
    assert.ok(Math.abs(worldToShed(layout, [hit!.point.x, hit!.point.z]).u + 12.3) < 0.02, "the glass stands 0.3 m in front of the Range's face");
    sampled++;
  }
  assert.ok(sampled >= 24, `${sampled} sight lines checked`);
  // its foot rests on the cornice over the brick centre and on the first string course either side of it, and never lower; its top is the roof's skin
  const q = closure.geometry.getAttribute('position'), ys = Array.from({ length: q.count }, (_, i) => q.getY(i));
  const feet = (at: number): number => ys.filter(y => Math.abs(y - at) < EPS).length;
  assert.ok(feet(CORNICE) > ys.length / 25 && feet(SILL) > ys.length / 4 && Math.min(...ys) > SILL - EPS, `the closure stands on the cornice (${feet(CORNICE)} of ${ys.length} vertices) and on the sill (${feet(SILL)}), none lower than ${Math.min(...ys).toFixed(3)}`);
  assert.ok(Math.max(...ys) > CORNICE + 5, `the closure rises to ${Math.max(...ys).toFixed(1)} m`);
});

// R-a: either side of the brick centre the roof's glass comes down to the Range's first string course as a curtain wall of tall panes between thin white fins, one at every half-bay
// (1.7 m: the bays are 3.4 m, so the fins stand over each opening's crown and each pier). The brick centre is v 56.1 to 90.1 (western-front.test.ts), and the wall stops exactly there.
test('roof edge: beside the Range\'s brick centre the glass is a curtain wall from the first string course up, in panes between white fins; over the centre it stops on the cornice', () => {
  const sight = (v: number, y: number, among: THREE.Object3D[] = roofLayers): THREE.Intersection | undefined => { const w = shedToWorld(layout, -26, v); return new THREE.Raycaster(new THREE.Vector3(w[0], y, w[1]), eastward).intersectObjects(among, true)[0]; };
  const beside = [38, 44, 50, 55.9, 56.07, 90.13, 90.3, 94, 100, 108, 114], over = [56.13, 56.3, 59, 66, 73, 80, 87, 89.9, 90.07]; // 56.07 and 90.13 are in the half-fins the walls end in
  for (const v of beside) {
    assert.ok(roofAt(-13, v) > CORNICE + 0.3, `the roof is over the cornice at v ${v}`);
    for (const y of [SILL + 0.3, 6, 9, CORNICE - 0.3]) {
      const hit = sight(v, y);
      assert.equal(hit?.object.name, 'concourse-closure', `a sight line at v ${v}, ${y.toFixed(1)} m high, beside the brick centre meets ${hit?.object.name ?? 'the Range'}`);
      assert.ok(Math.abs(worldToShed(layout, [hit!.point.x, hit!.point.z]).u + 12.3) < 0.02, 'the curtain stands in the plane of the roof glass');
    }
    assert.equal(sight(v, SILL - 0.3)?.object.name, undefined, `nothing below the sill at v ${v}`); // the name, not the hit: a failing assert prints its operand, and a hit holds the whole scene
  }
  for (const v of over) for (const y of [SILL + 0.3, 8, CORNICE - 0.3]) assert.equal(sight(v, y)?.object.name, undefined, `over the brick centre the Range's own wall shows at v ${v}, ${y.toFixed(1)} m: no glass`);
  // across a stretch of wall, at a height, the fins are the white stripes of the glass
  const finsAt = (from: number, to: number, y: number): number[][] => {
    const runs: number[][] = [];
    for (let v = from; v < to; v += 0.01) {
      const hit = sight(v, y, [skin.getObjectByName('concourse-closure')!]), colour = hit && (hit.object as THREE.Mesh).geometry.getAttribute('color');
      if (!colour || colour.getX(hit.face!.a) < 0.99 || colour.getZ(hit.face!.a) < 0.99) continue; // the panes are blue: red well under 1
      const last = runs[runs.length - 1];
      if (last && v - last[1]! < 0.015) last[1] = v; else runs.push([v, v]);
    }
    return runs;
  };
  for (const y of [5, 8, 11]) {
    const row = finsAt(92, 116, y), widths = row.map(r => r[1]! - r[0]! + 0.01), centres = row.map(r => (r[0]! + r[1]!) / 2);
    assert.ok(row.length === 14 || row.length === 15, `${row.length} fins in 24 m of wall at ${y} m`);
    assert.ok(widths.every(w => w > 0.08 && w < 0.12), `fins ${Math.min(...widths).toFixed(2)} to ${Math.max(...widths).toFixed(2)} m wide at ${y} m`);
    for (const c of centres) assert.ok(Math.abs(c / 1.7 - Math.round(c / 1.7)) * 1.7 < 0.02, `a fin at v ${c.toFixed(2)} is not on a half-bay`);
  }
  assert.equal(finsAt(58, 88, CORNICE + 1).length, 0, 'no fins in the glass over the brick centre');
});

test("roof edge: from the Range side the cut is closed too, by the dome's skin turned down it, so no hole opens onto the funnel and the floor", () => {
  // The closure glass is drawn from the concourse only (it is the back face that shows), so without a face for the other side the cut is a hole seen from
  // above the Range: the funnel's thin white legs and the fit-out show through it, and at a distance the legs read as a white speckle (the overview).
  const gable = claddingGable(), area = (fs: Face[]): number => fs.reduce((s, f) => s + f.area, 0), closure = faces('concourse-closure');
  assert.ok(gable.filter(f => f.area > 1).length >= 20, `${gable.length} upright cladding faces`);
  for (const f of gable.filter(g => g.area > 0)) {
    assert.ok(f.normal.dot(eastward) > 0.999, 'a gable face looks east, to the Range side');
    for (const v of [f.a, f.b, f.c]) assert.ok(Math.abs(worldToShed(layout, [v.x, v.z]).u + 12.3) < 0.02, "the gable stands on the glass's plane, 0.3 m in front of the Range's face");
  }
  assert.ok(Math.abs(area(gable) - area(closure)) < 1e-3 * area(closure), `the gable covers what the glass does: ${area(gable).toFixed(1)} m2 against ${area(closure).toFixed(1)} m2`);
  const material = (skin.getObjectByName('concourse-cladding') as THREE.Mesh).material as THREE.Material;
  assert.ok(material.side === THREE.FrontSide && !material.transparent && material.type === 'MeshPhongMaterial', 'an opaque lit face, so that it keeps to the weather and the hour as the unlit glass cannot');
  // from above the Range, looking west: every sight line between the cornice and the roof meets the gable, at the plane of the glass
  let sampled = 0;
  for (let v = WESTERN_RANGE.v0 + 6; v < WESTERN_RANGE.v1 - 6; v += 4.3) for (const y of [CORNICE + 0.6, CORNICE + 3, CORNICE + 5.5]) {
    if (roofAt(-13, v) < y + 0.3) continue; // the roof is lower than this sight line here
    const w = shedToWorld(layout, -8, v), hit = new THREE.Raycaster(new THREE.Vector3(w[0], y, w[1]), eastward.clone().negate()).intersectObjects(roofLayers, true)[0];
    assert.equal(hit?.object.name, 'concourse-cladding', `a sight line at v ${v.toFixed(1)}, ${y.toFixed(1)} m high, from the Range side, meets ${hit?.object.name ?? 'the open sky'}`);
    assert.ok(Math.abs(worldToShed(layout, [hit!.point.x, hit!.point.z]).u + 12.3) < 0.02, "at the glass's plane");
    sampled++;
  }
  assert.ok(sampled >= 24, `${sampled} sight lines checked`);
});

test('roof build-up: an upstand of the cavity depth closes the slot where a solid cell meets a glazed one, so no sky shows through it', () => {
  const upstands = standing().filter(f => Math.min(f.a.y, f.b.y, f.c.y) >= canopy.rim + FASCIA_BOTTOM + EPS);
  const key = (v: THREE.Vector3): string => `${v.x.toFixed(3)},${v.z.toFixed(3)}`;
  const glazed = roofGlass(), solid = soffitCells();
  let borders = 0;
  for (const g of glazed) for (const f of solid) if ([f.a, f.b, f.c].filter(v => [g.a, g.b, g.c].some(w => key(w) === key(v))).length === 2) borders++;
  assert.equal(upstands.length, 2 * borders, 'two triangles of upstand for each edge between a solid cell and a glazed one');
  for (const f of upstands) {
    assert.ok(Math.abs(f.normal.y) < 1e-3, 'an upstand is vertical');
    const ys = [f.a.y, f.b.y, f.c.y];
    assert.ok(Math.max(...ys) - Math.min(...ys) >= SKIN_LIFT - SOFFIT_LIFT - EPS, 'an upstand stands from the soffit up to the skin');
    const ends = [...new Set([f.a, f.b, f.c].map(key))], beside = glazed.filter(g => ends.every(e => [g.a, g.b, g.c].some(v => key(v) === e)));
    assert.equal(ends.length, 2, 'an upstand stands on one cell edge');
    assert.equal(beside.length, 1, 'one glazed cell lies along that edge');
    assert.ok(f.normal.x * (beside[0]!.mid.x - f.mid.x) + f.normal.z * (beside[0]!.mid.z - f.mid.z) > 0, 'an upstand faces the glazed cell');
  }
});
