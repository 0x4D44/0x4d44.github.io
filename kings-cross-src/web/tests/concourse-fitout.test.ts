import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, pointInPolygon, shedLayout, shedToWorld, stationBuilding, worldToShed } from '../../core/station.ts';
import { ATLAS, buildConcourse, columnMembers, columnTubeDiameter, concourseGrid, FITOUT, FITOUT_TEXT, funnelHead, plateCentres, RANGE_FACE } from '../src/concourse.ts';
import { buildWesternRange, WESTERN_ARCH, WESTERN_RANGE, westernArches, westernWindows } from '../src/shed.ts';

// The ground-level fit-out. R-ab (conc-ab-funnel-brick-2025) and R-b (conc-b-roof-meets-range-2025-08) show: red-topped
// ticket machines in a block of four (2 x 2, round 5) on the open floor; navy wayfinding totems with white lettering and a lit screen; navy plates
// with white lettering over the Range's ground-floor openings; lit shopfronts behind the glazing; a dark charcoal floor of
// large slabs. R-a shows long dark departure boards with amber lettering on the Range's face. Arup Journal 2/2012 pp.24-29:
// a gateline across five bays. Positions are ASSUMED (scaled from the people in the photographs, about 1.7 m); the brief
// allows generic signage only, so no operator or shop brand appears anywhere.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const station = stationBuilding(data) as NonNullable<ReturnType<typeof stationBuilding>>;
const hotel = data.buildings.find(b => b.id === 46821177)!;
const group = buildConcourse(canopy, station.pts, layout, [hotel.pts]);
group.updateMatrixWorld(true);
const fitout = group.getObjectByName('concourse-fitout') as THREE.Group;
const solid = fitout?.getObjectByName('concourse-fitout-solid') as THREE.Mesh;
const signs = fitout?.getObjectByName('concourse-fitout-signs') as THREE.Mesh;
const { centre, grid } = concourseGrid(canopy, station.pts, layout, [hotel.pts]);
const funnel = worldToShed(layout, centre);
const range = buildWesternRange();
range.updateMatrixWorld(true);
const pieces = fitOutFootprints(funnel.v);
const BAY = 3.3; // half the 6.6 m clear width of a gateline bay (shed.ts, Arup 2/2012 p29)

// The test's own statement of what the fit-out must fill.
interface Footprint { kind: 'cluster' | 'totem' | 'board' | 'gate' | 'plate'; u0: number; u1: number; v0: number; v1: number; bottom: number; top: number }
/** Where each solid piece stands, in the shed frame, given the funnel axis's v. */
function fitOutFootprints(funnelV: number): Footprint[] {
  const { cluster, totem, board, gate, plate } = FITOUT, out: Footprint[] = [];
  for (const [u, dv] of FITOUT.clusters) out.push({ kind: 'cluster', u0: u - cluster.depth / 2, u1: u + cluster.depth / 2, v0: funnelV + dv - cluster.width / 2, v1: funnelV + dv + cluster.width / 2, bottom: 0, top: cluster.height });
  // a totem stands on a plinth 0.3 m deep and 0.1 m wider than its body
  for (const [u, dv] of FITOUT.totems) out.push({ kind: 'totem', u0: u - 0.15, u1: u + 0.15, v0: funnelV + dv - totem.width / 2 - 0.05, v1: funnelV + dv + totem.width / 2 + 0.05, bottom: 0, top: totem.height });
  for (const v of FITOUT.boards) out.push({ kind: 'board', u0: RANGE_FACE - board.standoff - board.depth, u1: RANGE_FACE, v0: v, v1: v + board.length, bottom: board.bottom, top: board.bottom + board.height });
  for (let i = 0; i < gate.bays; i++) for (const o of gate.offsets) {
    const v = WESTERN_RANGE.v0 + gate.firstBay + i * gate.pitch + o;
    out.push({ kind: 'gate', u0: gate.u - gate.length / 2, u1: gate.u + gate.length / 2, v0: v - gate.width / 2 - 0.01, v1: v + gate.width / 2 + 0.01, bottom: 0, top: gate.height + 0.02 });
  }
  for (const [i, v] of plateCentres().entries()) {
    const half = (i < gate.bays ? plate.bayWidth : plate.shopWidth) / 2;
    out.push({ kind: 'plate', u0: RANGE_FACE - plate.standoff - plate.depth, u1: RANGE_FACE, v0: v - half, v1: v + half, bottom: plate.bottom, top: plate.bottom + plate.height });
  }
  return out;
}

function vertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const p = mesh.geometry.getAttribute('position');
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
}
// the shed's frame: u = x, v = -z
const inside = (f: Footprint, v: THREE.Vector3, eps: number): boolean => v.x >= f.u0 - eps && v.x <= f.u1 + eps && -v.z >= f.v0 - eps && -v.z <= f.v1 + eps && v.y >= f.bottom - eps && v.y <= f.top + eps;
const overlap = (a: Footprint, b: Footprint): boolean => a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1 && a.bottom < b.top && b.bottom < a.top;

test('fit-out: two meshes, lit solids and unlit signs, in a group turned into the shed frame', () => {
  assert.ok(fitout, 'the concourse has a fit-out group');
  assert.ok(fitout.parent === group, 'the fit-out hangs under the concourse group'); // not assert.equal: a failed one would diff two scene graphs
  assert.deepEqual(fitout.children.map(c => c.name).sort(), ['concourse-fitout-signs', 'concourse-fitout-solid']);
  assert.ok(solid.material instanceof THREE.MeshLambertMaterial && solid.material.vertexColors, 'solids are lit and coloured');
  assert.ok(signs.material instanceof THREE.MeshBasicMaterial, 'signs are unlit, so they glow as lit signs do');
  assert.ok(Math.abs(fitout.rotation.y + layout.heading) < 1e-9 && fitout.position.x === layout.origin[0] && fitout.position.z === layout.origin[1], 'the group stands in the shed frame');
  // a point on the floor 12 m south of the funnel, 23.5 m west of the shed's wall, in the shed's frame and in the world
  const world = fitout.localToWorld(new THREE.Vector3(-23.5, 0, -(funnel.v - 12))), expected = shedToWorld(layout, -23.5, funnel.v - 12);
  assert.ok(Math.hypot(world.x - expected[0], world.z - expected[1]) < 1e-6, 'x is u and z is minus v');
  assert.ok(solid.geometry.index!.count / 3 + signs.geometry.index!.count / 3 < 6000, 'a few thousand triangles at most');
});

test('fit-out: the solids are the footprints, and nothing stands outside them', () => {
  const kinds = new Map<string, number>();
  for (const f of pieces) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
  assert.deepEqual([...kinds].sort(), [['board', 2], ['cluster', 2], ['gate', 30], ['plate', 7], ['totem', 3]], 'two ticket blocks, three totems, two boards, thirty gate cabinets and seven plates (the Range\'s own stone is shed.ts\'s)');
  const all = vertices(solid), stray = all.filter(v => !pieces.some(f => inside(f, v, 0.02)));
  assert.equal(stray.length, 0, `${stray.length} solid vertices outside every footprint, the first at ${stray[0]?.x.toFixed(2)}, ${stray[0]?.y.toFixed(2)}, ${stray[0] ? (-stray[0].z).toFixed(2) : ''}`);
  // and each footprint is the box round what is drawn in it, to 3 cm: a piece neither missing nor smaller than its footprint says
  for (const f of pieces) {
    const mine = all.filter(v => inside(f, v, 0.02));
    assert.ok(mine.length > 0, `${f.kind} at u ${f.u0.toFixed(1)}, v ${f.v0.toFixed(1)} is drawn`);
    const bounds = [Math.min(...mine.map(v => v.x)), Math.max(...mine.map(v => v.x)), Math.min(...mine.map(v => -v.z)), Math.max(...mine.map(v => -v.z)), Math.min(...mine.map(v => v.y)), Math.max(...mine.map(v => v.y))];
    const wanted = [f.u0, f.u1, f.v0, f.v1, f.bottom, f.top];
    bounds.forEach((b, i) => assert.ok(Math.abs(b - wanted[i]!) < 0.03, `${f.kind} at u ${f.u0.toFixed(1)}, v ${f.v0.toFixed(1)}: drawn ${b.toFixed(2)}, footprint ${wanted[i]!.toFixed(2)} (u0 u1 v0 v1 bottom top, index ${i})`));
  }
});

test('fit-out: floor pieces stand in the concourse, clear of the funnel\'s feet and of the Range; pieces on the Range stand off its face; none touch', () => {
  const reach = Math.max(...columnMembers(funnelHead(grid, centre, layout)).nodes.filter(n => n[1] === 0).map(n => Math.hypot(n[0], n[2]))) + columnTubeDiameter(0, 19.5) / 2;
  for (const f of pieces.filter(p => p.kind === 'cluster' || p.kind === 'totem')) {
    const nearest = Math.hypot(Math.max(f.u0 - funnel.u, 0, funnel.u - f.u1), Math.max(f.v0 - funnel.v, 0, funnel.v - f.v1));
    assert.ok(nearest > reach + 3, `${f.kind} at u ${f.u0.toFixed(1)}, v ${f.v0.toFixed(1)} is ${nearest.toFixed(1)} m from the funnel axis; its feet reach ${reach.toFixed(1)} m`);
    assert.ok(f.u1 < RANGE_FACE - 3, `${f.kind} is ${(RANGE_FACE - f.u1).toFixed(1)} m from the Range's face`);
    for (const [u, v] of [[f.u0, f.v0], [f.u0, f.v1], [f.u1, f.v0], [f.u1, f.v1]] as const) {
      const p = shedToWorld(layout, u, v);
      assert.ok(pointInPolygon(p, station.pts) && !pointInPolygon(p, hotel.pts), `a corner of the ${f.kind} at u ${u.toFixed(1)}, v ${v.toFixed(1)} is on the concourse floor`);
    }
  }
  for (const f of pieces.filter(p => p.kind === 'board' || p.kind === 'plate')) {
    assert.ok(Math.abs(f.u1 - RANGE_FACE) < 1e-9 && f.u0 > RANGE_FACE - 0.6, `${f.kind} hangs on brackets from the Range's face`);
    assert.ok(f.v0 > WESTERN_RANGE.v0 && f.v1 < WESTERN_RANGE.v1, `${f.kind} is within the Range's length`);
  }
  // R-a: the boards hang on the curtain wall either side of the brick centre (v 56.1 to 90.1), a metre clear of it, not across its dressed windows (round 3, C5)
  const [brickFrom, brickTo] = [56.1, 90.1];
  for (const f of pieces.filter(p => p.kind === 'board')) assert.ok(f.v1 <= brickFrom - 1 + 1e-6 || f.v0 >= brickTo + 1 - 1e-6, `a board from v ${f.v0.toFixed(1)} to ${f.v1.toFixed(1)} hangs over the brick centre's windows`);
  assert.deepEqual(pieces.filter(p => p.kind === 'board').map(f => f.v0 < brickFrom).sort(), [false, true], 'one board either side of the brick centre');
  for (const f of pieces.filter(p => p.kind === 'gate')) assert.ok(f.u0 > RANGE_FACE && f.u1 < -0.01, 'a gate cabinet stands inside the Range\'s depth');
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) assert.ok(!overlap(pieces[i]!, pieces[j]!), `${pieces[i]!.kind} ${i} meets ${pieces[j]!.kind} ${j}`);
});

test('fit-out: each gate cabinet stands in an open bay of the built Range, clear of its reveals; the shop panes and the Range\'s face are where the fit-out assumes', () => {
  const range = buildWesternRange();
  range.updateMatrixWorld(true);
  const walls = ['range-brick', 'range-stone', 'range-public-glazing', 'range-public-frames'].map(n => range.getObjectByName(n) as THREE.Object3D);
  const firstHit = (u: number, y: number, v: number): THREE.Intersection | undefined =>
    new THREE.Raycaster(new THREE.Vector3(u, y, -v), new THREE.Vector3(1, 0, 0)).intersectObjects(walls, true)[0];
  const gates = pieces.filter(p => p.kind === 'gate'), bays = plateCentres().slice(0, FITOUT.gate.bays);
  for (const f of gates) {
    const v = (f.v0 + f.v1) / 2, bay = bays.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    assert.ok(Math.abs(v - bay) + (f.v1 - f.v0) / 2 <= BAY - 0.1, `the cabinet at v ${v.toFixed(2)} is within 0.1 m of bay ${bay.toFixed(1)}'s reveal`);
    for (const y of [0.5, 1.0]) {
      const hit = firstHit(RANGE_FACE - 1, y, v);
      assert.ok(!hit || hit.point.x > f.u1 + 0.1, `the Range blocks the way to the cabinet at v ${v.toFixed(2)}: ${hit?.object.name} at u ${hit?.point.x.toFixed(2)}`);
    }
  }
  // between the bays the face is solid, 12 m deep ending 0.01 m inside the shed's wall: RANGE_FACE
  for (const v of [WESTERN_RANGE.v0 + 8]) {
    const hit = firstHit(RANGE_FACE - 1, 1.5, v);
    assert.ok(hit && Math.abs(hit.point.x - RANGE_FACE) < 0.05, `the Range's face is at u ${hit?.point.x.toFixed(3)}, RANGE_FACE ${RANGE_FACE}`);
  }
  // each shop's pane is 0.375 m inside the face, 2.8 m wide, and the lit interior stands 4 cm in front of it
  for (const v of FITOUT.shops) {
    const hit = firstHit(RANGE_FACE - 1, 1.5, v + 0.5); // the shop's central mullion stands at v itself
    assert.equal(hit?.object.name, 'range-public-glazing', 'the first thing a ray meets at a shop is its glazing');
    assert.ok(Math.abs(hit!.point.x - (FITOUT.shopfront.u + 0.04)) < 0.005, `the pane's face is at u ${hit!.point.x.toFixed(3)}; the shopfront is drawn at ${FITOUT.shopfront.u}`);
    // and it is in front of the pane in the depth buffer however far away it is seen: its polygon offset beats the pane's
    const paneOffset = ((hit!.object as THREE.Mesh).material as THREE.Material).polygonOffsetFactor, signOffset = (signs.material as THREE.Material).polygonOffsetFactor;
    assert.ok((signs.material as THREE.Material).polygonOffset && signOffset < paneOffset, `signs offset ${signOffset}, pane ${paneOffset}`);
    assert.ok(firstHit(RANGE_FACE - 1, 1.5, v + 1.35)?.object.name === 'range-public-glazing' && firstHit(RANGE_FACE - 1, 1.5, v + 1.46)?.object.name !== 'range-public-glazing', 'the glazing ends 1.4 m from the shop\'s centre');
    assert.ok(FITOUT.shopfront.width / 2 < 1.4 && FITOUT.shopfront.top < 3.2, 'the lit interior fits inside the pane');
  }
  // each tall opening of the Range wears a lit interior 2 cm in front of its dark pane, 2 m wide and up to the springing of its arch: the pane is 1 m a side and rounds off above that
  assert.equal(westernArches().length, 21, 'an opening under each of the brick centre\'s six windows and in each of the 15 bays north of it');
  for (const v of westernArches()) {
    const hit = firstHit(RANGE_FACE - 1, 2, v + 0.9);
    assert.equal(hit?.object.name, 'range-public-glazing', `an opening's pane at v ${(v + 0.9).toFixed(1)}`);
    assert.ok(Math.abs(hit!.point.x - (RANGE_FACE - WESTERN_ARCH.pane)) < 0.005, `the opening's pane is at u ${hit!.point.x.toFixed(3)}`);
  }
  // and the interiors themselves: a quad in each opening, a metre either side of its centre, from the floor (4 cm up) to the springing (3 m), 2 cm in front of the pane
  assert.ok(WESTERN_ARCH.half === 1 && WESTERN_ARCH.spring === 3, 'the pane is 2 m wide to 3 m, then rounds off to 4 m');
  const p = signs.geometry.getAttribute('position'), lit = Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))).filter(q => Math.abs(q.x - (RANGE_FACE - WESTERN_ARCH.pane - 0.02)) < 1e-4);
  assert.equal(lit.length, 4 * westernArches().length, 'one quad in front of each opening\'s pane, and nothing else there');
  for (const v of westernArches()) {
    const mine = lit.filter(q => Math.abs(-q.z - v) < 1.01), set = (f: (q: THREE.Vector3) => number): number[] => [...new Set(mine.map(q => +f(q).toFixed(3)))].sort((a, b) => a - b);
    assert.deepEqual(set(q => -q.z - v), [-1, 1], `the interior at v ${v.toFixed(1)} is 2 m wide about the opening's centre`);
    assert.deepEqual(set(q => q.y), [0.04, 3], `the interior at v ${v.toFixed(1)} runs from the floor to the springing`);
  }
});

test('the Range\'s brick centre is centred on the funnel: its axis is the v the Range builder is told (WESTERN_RANGE.centre), and the six windows about it run 0.25 m off', () => {
  assert.ok(Math.abs(funnel.v - WESTERN_RANGE.centre) < 0.5, `the funnel's axis is at v ${funnel.v.toFixed(2)}, the Range is built about ${WESTERN_RANGE.centre}`);
  const windows = westernWindows(), middle = (windows[0]! + windows[windows.length - 1]!) / 2;
  assert.equal(windows.length, 6, 'about six windows, larger than a bay each (round 5, C4)');
  assert.ok(Math.abs(middle - funnel.v) < 0.5, `the brick centre is at v ${middle.toFixed(2)}, the funnel's axis at ${funnel.v.toFixed(2)}`);
  // the funnel stands between the middle pair, not in front of a window's centre
  assert.ok(Math.abs(windows[2]! - funnel.v) > 2 && Math.abs(windows[3]! - funnel.v) > 2, 'the funnel stands between two windows');
});

test('fit-out: the lettering is generic: no operator, shop or product brand', () => {
  const words = [...FITOUT_TEXT.totem, ...FITOUT_TEXT.board, ...FITOUT_TEXT.plates].map(w => w.toLowerCase());
  const brands = ['costa', 'pret', 'leon', 'starbucks', 'boots', 'smith', 'marks', 'spencer', 'tesco', 'mcdonald', 'burger', 'greggs', 'sainsbury', 'nero', 'upper crust', 'virgin', 'lner',
    'network rail', 'chocolat', 'timothy', 'itsu', 'wasabi', 'subway', 'kfc', 'pizza', 'waitrose', 'amazon', 'apple', 'google', 'coca', 'pepsi', 'nike', 'adidas', 'hotel', 'bank', 'ltd', 'plc', 'cafe nero', 'eat.', 'harry potter'];
  for (const w of words) {
    for (const brand of brands) assert.ok(!w.includes(brand), `"${w}" names a brand (${brand})`);
    assert.ok(w.length > 0 && w.length <= 36, `"${w}" is not a sign's worth of words`);
  }
  for (const line of FITOUT_TEXT.board) assert.match(line, /^[A-Z][a-z]+ Platform [0-8] (On time|Delayed)$/, 'a board line is a destination, a platform and a status');
  // the five bays are the gateline, so each carries the platforms' sign, not a word for the toilets or the left luggage (round 2, C5): one text for all five, then one for each shop
  assert.equal(plateCentres().length, 7, 'a plate over each of the five bays and two shops');
  assert.deepEqual([...FITOUT_TEXT.plates], ['Platforms 0 to 8  →', 'Cafe', 'News and gifts', 'Family Waiting', 'Tickets', 'Toilets'], 'generic wayfinding words only: the platforms over the gateline, the two shops, then the three plates of the openings\' interiors');
  assert.match(FITOUT_TEXT.plates[0], /^Platforms \d to \d/, 'the gateline leads to the platforms');
  for (const bay of FITOUT_TEXT.plates.slice(1)) assert.ok(!/platform/i.test(bay), 'a shop\'s plate does not read as a way to the platforms');
});

test('fit-out: every sign faces the concourse (or its own side, for a totem) and its lettering reads left to right and upright', () => {
  const p = signs.geometry.getAttribute('position'), n = signs.geometry.getAttribute('normal'), uv = signs.geometry.getAttribute('uv'), index = signs.geometry.index!;
  assert.ok(uv, 'signs have texture coordinates');
  let west = 0, east = 0;
  for (let i = 0; i < index.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => index.getX(i + k)) as [number, number, number];
    const P = [a, b, c].map(k => new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k))) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const geometric = new THREE.Vector3().crossVectors(P[1].clone().sub(P[0]), P[2].clone().sub(P[0])).normalize();
    const declared = new THREE.Vector3(n.getX(a), n.getY(a), n.getZ(a));
    assert.ok(geometric.dot(declared) > 0.999, 'the winding faces the way the normal says');
    assert.ok(Math.abs(Math.abs(declared.x) - 1) < 1e-6, 'a sign faces along the shed\'s u axis');
    if (declared.x < 0) west++; else east++;
    // texture axes: s runs to the viewer's right, t upward (right = up x normal)
    const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(up, declared);
    const e1 = P[1].clone().sub(P[0]), e2 = P[2].clone().sub(P[0]);
    const ds1 = uv.getX(b) - uv.getX(a), dt1 = uv.getY(b) - uv.getY(a), ds2 = uv.getX(c) - uv.getX(a), dt2 = uv.getY(c) - uv.getY(a), r = 1 / (ds1 * dt2 - ds2 * dt1);
    const tangent = e1.clone().multiplyScalar(dt2).sub(e2.clone().multiplyScalar(dt1)).multiplyScalar(r);
    const bitangent = e2.clone().multiplyScalar(ds1).sub(e1.clone().multiplyScalar(ds2)).multiplyScalar(r);
    assert.ok(tangent.dot(right) > 0, 'lettering runs left to right, not mirrored');
    assert.ok(bitangent.dot(up) > 0, 'lettering stands upright');
  }
  // two triangles to a face: a totem has two faces, a board, a plate, a shopfront and a tall opening's interior one each; the totems' east faces are the only ones turned from the concourse
  assert.equal(index.count / 3, 2 * (FITOUT.totems.length * 2 + FITOUT.boards.length + plateCentres().length + FITOUT.shops.length + westernArches().length), 'every lettered face and no other');
  assert.equal(east, 2 * FITOUT.totems.length, 'only the totems have a face on their east side');
  assert.ok(west > east, 'the rest face west, toward the concourse');
});

// Round 2 read "Toilets" and "Left luggage" over the gates: the five bays of the gateline are one sign, the platforms', and the shops' two differ from it and from each other.
test('fit-out: the five gateline plates wear one face of the sign atlas and each shop its own', () => {
  const uv = signs.geometry.getAttribute('uv'), p = signs.geometry.getAttribute('position'), index = signs.geometry.index!;
  const faces: { v: number; key: string }[] = [];
  for (let i = 0; i < index.count; i += 6) { // two triangles to a face, its four corners the six indices' distinct ones
    const corners = [...new Set(Array.from({ length: 6 }, (_, k) => index.getX(i + k)))];
    const y = corners.map(c => p.getY(c)), lo = Math.min(...y), hi = Math.max(...y), v = -corners.reduce((s, c) => s + p.getZ(c), 0) / corners.length;
    if (Math.abs(lo - FITOUT.plate.bottom - 0.02) > 1e-6 || Math.abs(hi - FITOUT.plate.bottom - FITOUT.plate.height + 0.02) > 1e-6) continue; // not a plate
    faces.push({ v, key: [Math.min(...corners.map(c => uv.getX(c))), Math.max(...corners.map(c => uv.getX(c))), Math.min(...corners.map(c => uv.getY(c))), Math.max(...corners.map(c => uv.getY(c)))].map(x => x.toFixed(6)).join() });
  }
  faces.sort((a, b) => a.v - b.v);
  assert.equal(faces.length, 7, 'a lettered face over each of the five bays and two shops');
  assert.equal(new Set(faces.slice(0, 5).map(f => f.key)).size, 1, 'the five bays show one sign');
  assert.equal(new Set(faces.map(f => f.key)).size, 3, 'the shops differ from the bays and from each other');
  const centres = [...plateCentres()].sort((a, b) => a - b);
  faces.forEach((f, i) => assert.ok(Math.abs(f.v - centres[i]!) < 0.01, `face ${i} is over the opening at v ${centres[i]!.toFixed(1)}, not at ${f.v.toFixed(1)}`));
});

// Round 5 (C5): the scorer read 24 identical lit openings, a cloned row. They now differ by use: a shop, a waiting room, a ticket office, glazed doors, a shutter.
test('fit-out: the lit openings differ by use: five looks, each in use along the row, no two neighbours alike, and the atlas holds them', () => {
  const uv = signs.geometry.getAttribute('uv'), p = signs.geometry.getAttribute('position'), index = signs.geometry.index!, u = RANGE_FACE - WESTERN_ARCH.pane - 0.02;
  const rect = (x: number, y: number, w: number, h: number): string => [x / ATLAS.width, (x + w) / ATLAS.width, 1 - (y + h) / ATLAS.height, 1 - y / ATLAS.height].map(n => n.toFixed(6)).join();
  const faces: { v: number; key: string }[] = [];
  for (let i = 0; i < index.count; i += 6) { // two triangles to a face
    const corners = [...new Set(Array.from({ length: 6 }, (_, k) => index.getX(i + k)))];
    if (corners.some(c => Math.abs(p.getX(c) - u) > 1e-4)) continue; // not an opening's interior
    faces.push({ v: -corners.reduce((sum, c) => sum + p.getZ(c), 0) / corners.length, key: [Math.min(...corners.map(c => uv.getX(c))), Math.max(...corners.map(c => uv.getX(c))), Math.min(...corners.map(c => uv.getY(c))), Math.max(...corners.map(c => uv.getY(c)))].map(x => x.toFixed(6)).join() });
  }
  faces.sort((a, b) => a.v - b.v);
  assert.equal(faces.length, westernArches().length, 'a lit interior in each opening');
  const looks = ATLAS.uses.map(r => rect(...r));
  for (const f of faces) assert.ok(looks.includes(f.key), `the interior at v ${f.v.toFixed(1)} wears no face of the atlas's five`);
  for (const k of looks) assert.ok(faces.filter(f => f.key === k).length >= 3, 'each look is in use three times at least');
  for (let i = 1; i < faces.length; i++) assert.notEqual(faces[i]!.key, faces[i - 1]!.key, `the openings at v ${faces[i - 1]!.v.toFixed(1)} and ${faces[i]!.v.toFixed(1)} look alike`);
});

test('fit-out: the sign atlas lays its regions inside the canvas, none over another, and the three interiors that carry a name wear its plate across their heads', () => {
  const alone = [ATLAS.totem, ATLAS.board, ...ATLAS.plates.slice(0, 3), ...ATLAS.uses] as readonly (readonly number[])[];
  for (const [x, y, w, h] of [...alone, ...ATLAS.plates]) assert.ok(x! >= 0 && y! >= 0 && x! + w! <= ATLAS.width && y! + h! <= ATLAS.height, `a region ${[x, y, w, h]} lies outside the ${ATLAS.width} x ${ATLAS.height} canvas`);
  for (let i = 0; i < alone.length; i++) for (let j = i + 1; j < alone.length; j++) {
    const [a, b] = [alone[i]!, alone[j]!];
    assert.ok(a[0]! + a[2]! <= b[0]! || b[0]! + b[2]! <= a[0]! || a[1]! + a[3]! <= b[1]! || b[1]! + b[3]! <= a[1]!, `the regions ${a} and ${b} overlap`);
  }
  const named = ATLAS.plates.slice(3);
  assert.equal(named.length, FITOUT_TEXT.plates.length - 3, 'a plate for each name the interiors carry');
  assert.equal(named.length, 3, 'three of the five interiors carry a name; the shop and the shutter do not');
  for (const [x, y, w, h] of named) {
    const interior = ATLAS.uses.find(r => r[0] === x && r[1] === y && r[2] === w);
    assert.ok(interior && h >= 30 && h <= interior[3] / 4, `the plate ${[x, y, w, h]} lies across the head of an interior, a few dozen pixels deep`);
  }
});

test('floor: dark charcoal stone in the references\' tone, in the slab texture, not the shared pale paving', () => {
  const floor = (group.getObjectByName('concourse-floor') as THREE.Mesh).material as THREE.MeshLambertMaterial;
  assert.ok(floor instanceof THREE.MeshLambertMaterial);
  const shared = new THREE.Color(0x9ea2a8); // the slab texture's average, and the shared paving's colour where there is no canvas
  const luminance = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear light, which is what the lights multiply
  // Node has no canvas: the colour then stands in for the texture's average times the tint, which is what the browser draws
  const ratio = luminance(floor.map ? floor.color.clone().multiply(shared) : floor.color) / luminance(shared);
  // lit 64 to 87 a channel in R-ab and R-b against the earlier 136, which is 0.19 to 0.35 of the light in linear terms
  assert.ok(ratio > 0.2 && ratio < 0.4, `the floor reflects ${(100 * ratio).toFixed(0)} % as much light as the shared paving`);
});

test('fit-out: each ticket block is four machines about 2 m tall, two back to back and two side by side, white-bodied under one red slab; boards hang in the first-floor storey; totems stand twice a person\'s height', () => {
  const colour = solid.geometry.getAttribute('color'), all = vertices(solid);
  const tone = (i: number): 'red' | 'paper' | 'screen' | 'other' => (colour.getX(i) > 0.3 && colour.getY(i) < 0.1 ? 'red' : colour.getX(i) > 0.7 && colour.getY(i) > 0.7 && colour.getZ(i) > 0.7 ? 'paper' : colour.getX(i) < 0.05 && colour.getY(i) < 0.05 && colour.getZ(i) < 0.06 ? 'screen' : 'other');
  const blocks = pieces.filter(p => p.kind === 'cluster');
  assert.equal(blocks.length, 2, 'two blocks of ticket machines');
  for (const f of blocks) {
    // R-ab, R-b: a machine stands a head above the people beside it, about 2 m (ASSUMED, scaled from people of 1.7 m)
    assert.ok(f.top >= 1.9 && f.top <= 2.4, `a ticket machine ${f.top} m tall`);
    const cu = (f.u0 + f.u1) / 2, cv = (f.v0 + f.v1) / 2, mine = all.map((v, i) => ({ v, t: tone(i) })).filter(({ v }) => inside(f, v, 0.02));
    const bodies = mine.filter(m => m.t === 'paper').map(m => m.v), slab = mine.filter(m => m.t === 'red').map(m => m.v), screens = mine.filter(m => m.t === 'screen').map(m => m.v);
    const du = (v: THREE.Vector3): number => v.x - cu, dv = (v: THREE.Vector3): number => -v.z - cv, span = (vs: THREE.Vector3[], f: (v: THREE.Vector3) => number): number => Math.max(...vs.map(f)) - Math.min(...vs.map(f));
    // R-ab, R-b (round 5, C5): a block of four, 2 x 2: a white body in each quarter, a back-to-back pair along u and a side-by-side pair along v, a hand's breadth between them
    for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const quarter = bodies.filter(v => su * du(v) > 0 && sv * dv(v) > 0), front = screens.filter(v => su * du(v) > 0.5 && sv * dv(v) > 0);
      assert.equal(quarter.length, 24, `a white machine, a box of 24 vertices, in the (${su}, ${sv}) quarter of the block at u ${cu.toFixed(1)}`);
      assert.ok(span(quarter, du) > 0.5 && span(quarter, du) < 0.6 && span(quarter, dv) > 0.8 && span(quarter, dv) < 0.95, `a machine ${span(quarter, du).toFixed(2)} m deep and ${span(quarter, dv).toFixed(2)} m wide`);
      assert.ok(Math.min(...quarter.map(v => su * du(v))) > 0.01 && Math.min(...quarter.map(v => sv * dv(v))) > 0.04, 'a gap between the machines back to back and side by side');
      assert.equal(front.length, 24, `a screen, a box of 24 vertices, on the outer face of the machine in the (${su}, ${sv}) quarter`);
    }
    // one red slab 0.4 m deep over the whole block, the machines standing up to its underside, and no red lower
    assert.equal(slab.length, 24, 'one red slab');
    assert.ok(Math.abs(Math.max(...slab.map(v => v.y)) - f.top) < 0.01 && Math.abs(span(slab, v => v.y) - 0.4) < 0.01, 'a slab 0.4 m deep caps the block');
    assert.ok(Math.abs(span(slab, du) - (f.u1 - f.u0)) < 0.03 && Math.abs(span(slab, dv) - (f.v1 - f.v0)) < 0.03, 'the slab covers the whole footprint');
    assert.ok(Math.abs(Math.max(...bodies.map(v => v.y)) - Math.min(...slab.map(v => v.y))) < 0.01, 'the machines stand up to the slab');
  }
  // R-a, R-e: large dark boards of tall panels, many rows each, hang in the first-floor storey (5.0 to 7.6 m) on the curtain wall, well over the plates above the openings (top 4.24 m)
  for (const f of pieces.filter(p => p.kind === 'board')) {
    assert.ok(f.bottom >= WESTERN_RANGE.storey + 0.8 && f.top <= 2 * WESTERN_RANGE.storey - 0.5, `a board from ${f.bottom.toFixed(2)} to ${f.top.toFixed(2)} m, in the first-floor storey (${WESTERN_RANGE.storey} to ${2 * WESTERN_RANGE.storey} m)`);
    assert.ok(f.top - f.bottom >= 2.4 && f.v1 - f.v0 >= 14, `a board ${(f.v1 - f.v0).toFixed(1)} m long and ${(f.top - f.bottom).toFixed(1)} m tall is a large one, not a strip`);
    assert.ok(f.bottom - (FITOUT.plate.bottom + FITOUT.plate.height) >= 0.5, 'a board hangs clear of the plates');
    const panel = (f.v1 - f.v0) / FITOUT.board.panels;
    assert.ok(panel >= 1.4 && panel <= 2 && panel < 0.8 * (f.top - f.bottom), `${FITOUT.board.panels} panels to a board, each ${panel.toFixed(2)} m wide and taller than wide`);
    // the bank is near black the whole length between two pale bars, each 0.1 m deep (R-e: a white frame round dark panels)
    const mine = all.flatMap((p, i) => (inside(f, p, 0.02) ? [{ p, dark: colour.getX(i) < 0.02 && colour.getY(i) < 0.02 && colour.getZ(i) < 0.02 }] : []));
    const dark = mine.filter(m => m.dark).map(m => m.p), pale = mine.filter(m => !m.dark && m.p.x < RANGE_FACE - 0.35).map(m => m.p);
    assert.ok(dark.length > 0 && Math.abs(Math.min(...dark.map(p => p.y)) - (f.bottom + 0.1)) < 0.01 && Math.abs(Math.max(...dark.map(p => p.y)) - (f.top - 0.1)) < 0.01, 'the dark bank stands between the bars');
    assert.ok(Math.abs(Math.min(...dark.map(p => -p.z)) - f.v0) < 0.01 && Math.abs(Math.max(...dark.map(p => -p.z)) - f.v1) < 0.01, 'the dark bank runs the whole length');
    assert.ok(pale.some(p => Math.abs(p.y - f.bottom) < 0.01) && pale.some(p => Math.abs(p.y - f.top) < 0.01), 'a pale bar at the foot and another at the head');
  }
  // R-a: a totem is about twice the height of the people at its foot (ASSUMED 3 m)
  for (const f of pieces.filter(p => p.kind === 'totem')) assert.ok(f.top >= 2.8 && f.top <= 3.4, `a totem ${f.top} m tall`);
});
