import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, concourseHeight, pointInPolygon, shedLayout, stationBuilding, worldToShed } from '../../core/station.ts';
import { buildConcourse, columnRadius, concourseGrid, diagrid, EDGE, edgesOf, FUNNEL_RADIUS, funnelHead, keepTriangles, RANGE_FACE } from '../src/concourse.ts';
import * as concourse from '../src/concourse.ts';
import type { Diagrid } from '../src/concourse.ts';
import { WESTERN_RANGE } from '../src/shed.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const station = stationBuilding(data) as NonNullable<ReturnType<typeof stationBuilding>>;
const close = (a: number, b: number, eps = 1e-6): void => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const EPS = 1e-4; // float32 geometry
type V3 = [number, number, number];
const positions = (mesh: THREE.Mesh): V3[] => { const p = mesh.geometry.getAttribute('position'); return Array.from({ length: p.count }, (_, i): V3 => [p.getX(i), p.getY(i), p.getZ(i)]); };
/** The roof's panels and everything that hangs under them: the evidence pack (tools/axis01-evidence.ts) measures the roof's reach the same way. */
const panelVertices = (group: THREE.Group): V3[] => {
  const out: V3[] = [];
  (group.getObjectByName('concourse-panels') as THREE.Mesh).traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(...positions(o as THREE.Mesh)); });
  return out;
};
const ringCounts = (d: Diagrid): number[] => {
  const counts: number[] = Array.from({ length: d.rings + 1 }, () => 0);
  for (const n of d.nodes) counts[n.ring] = (counts[n.ring] as number) + 1;
  return counts;
};
const area = (d: Diagrid, t: [number, number, number]): number => {
  const [a, b, c] = t.map((i) => d.nodes[i] as Diagrid['nodes'][number]) as [Diagrid['nodes'][number], Diagrid['nodes'][number], Diagrid['nodes'][number]];
  return Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z)) / 2;
};

test('diagrid: rings of nodes on circles, counts growing in sixes from the funnel to the rim', () => {
  const d = diagrid(canopy.radius, canopy.centre);
  const counts = ringCounts(d);
  assert.equal(counts.length, d.rings + 1);
  assert.equal(counts.reduce((s, n) => s + n, 0), d.nodes.length);
  for (let k = 0; k < counts.length; k++) {
    const n = counts[k] as number;
    assert.equal(n % 6, 0, `ring ${k} has ${n} nodes`);
    assert.ok(n >= 12);
    if (k > 0) assert.ok(n >= (counts[k - 1] as number), 'rings do not shrink outward');
  }
  for (const n of d.nodes) {
    const r = Math.hypot(n.x - canopy.centre[0], n.z - canopy.centre[1]);
    close(r, n.r, 1e-9);
  }
  close((d.nodes[0] as Diagrid['nodes'][number]).r, FUNNEL_RADIUS, 1e-9);
  close((d.nodes[d.nodes.length - 1] as Diagrid['nodes'][number]).r, canopy.radius, 1e-9);
});

test('diagrid: the triangles close up with no gap or overlap, and are all about EDGE metres across', () => {
  const d = diagrid(canopy.radius, canopy.centre);
  const counts = ringCounts(d);
  const edges = edgesOf(d.tris);
  // every interior edge is shared by exactly two triangles; the only free edges are the two boundary rings
  let free = 0;
  for (const e of edges.values()) {
    assert.ok(e.uses === 1 || e.uses === 2, `edge ${e.a}-${e.b} is used ${e.uses} times`);
    if (e.uses === 1) {
      free++;
      const ra = (d.nodes[e.a] as Diagrid['nodes'][number]).ring;
      const rb = (d.nodes[e.b] as Diagrid['nodes'][number]).ring;
      assert.ok(ra === rb && (ra === 0 || ra === d.rings), `free edge between rings ${ra} and ${rb}`);
    }
  }
  assert.equal(free, (counts[0] as number) + (counts[d.rings] as number));
  // an annulus: V - E + F = 0
  assert.equal(d.nodes.length - edges.size + d.tris.length, 0);
  // the triangles tile the annulus: their areas add up to it (the polygonal rings lose a fraction of a percent to the circle)
  const total = d.tris.reduce((s, t) => s + area(d, t), 0);
  const annulus = Math.PI * (canopy.radius ** 2 - FUNNEL_RADIUS ** 2);
  assert.ok(total / annulus > 0.995 && total / annulus <= 1, `triangles cover ${(100 * total) / annulus} % of the annulus`);
  for (const e of edges.values()) {
    const a = d.nodes[e.a] as Diagrid['nodes'][number];
    const b = d.nodes[e.b] as Diagrid['nodes'][number];
    const len = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(len > 0.5 * EDGE && len < 1.8 * EDGE, `member ${e.a}-${e.b} is ${len.toFixed(2)} m long`);
  }
  for (const t of d.tris) assert.ok(area(d, t) > 2, 'a sliver triangle');
});

test('keepTriangles: inside the OSM footprint, clear of the shed and of the Western Range, and nothing else dropped', () => {
  const d = diagrid(canopy.radius, canopy.centre);
  const kept = keepTriangles(d, station.pts, layout);
  assert.ok(kept.length > 0.5 * d.tris.length && kept.length < d.tris.length, `${kept.length} of ${d.tris.length} kept`);
  const centre = (t: [number, number, number]): [number, number] => {
    const p = t.map((i) => d.nodes[i] as Diagrid['nodes'][number]);
    return [((p[0] as Diagrid['nodes'][number]).x + (p[1] as Diagrid['nodes'][number]).x + (p[2] as Diagrid['nodes'][number]).x) / 3, ((p[0] as Diagrid['nodes'][number]).z + (p[1] as Diagrid['nodes'][number]).z + (p[2] as Diagrid['nodes'][number]).z) / 3];
  };
  const keptSet = new Set(kept);
  for (const t of d.tris) {
    const c = centre(t);
    const { u, v } = worldToShed(layout, c);
    const inShed = u > -1 && u < layout.width + 1 && v > -1 && v < layout.length + 1;
    const inRange = u > -WESTERN_RANGE.depth - 0.3 && v > WESTERN_RANGE.v0 - 1 && v < WESTERN_RANGE.v1 + 1;
    const inside = pointInPolygon(c, station.pts);
    if (keptSet.has(t)) {
      assert.ok(inside && !inShed && !inRange, `kept a triangle at u=${u.toFixed(1)} v=${v.toFixed(1)} that is outside the footprint or inside the shed or Range`);
    } else {
      assert.ok(!inside || inShed || inRange, `dropped a triangle at u=${u.toFixed(1)} v=${v.toFixed(1)} that belongs`);
    }
  }
});

test('columnRadius: a trumpet that rises from a splayed foot, narrows to a waist near the floor and opens out to the mouth under the roof', () => {
  const mouth = 11.5, radii = [0, 0.06, 0.17, 0.29, 0.41, 0.53, 0.65, 0.75, 0.84, 0.92, 1].map(t => columnRadius(t, mouth));
  const waist = radii.indexOf(Math.min(...radii));
  assert.ok(waist > 0 && waist < 3, 'the waist is just above the splayed foot');
  for (let i = waist + 1; i < radii.length; i++) assert.ok((radii[i] as number) > (radii[i - 1] as number), 'the trumpet only opens above its waist');
  close(radii[radii.length - 1] as number, mouth, 1e-9);
  assert.ok(Math.max(...radii) <= mouth + 1e-9 && radii[0]! * 2 > 3.6 && radii[0]! * 2 < 4.8, 'the feet span about 4 m (R-ab) and nothing is wider than the mouth');
});

test('buildConcourse: lattice under the published apex, panels and floor facing up, rim glazing facing out', () => {
  const group = buildConcourse(canopy, station.pts, layout);
  const named = (n: string): THREE.Mesh => group.getObjectByName(n) as THREE.Mesh;
  assert.deepEqual(group.children.map(c => c.name).sort(), ['concourse-cladding', 'concourse-closure', 'concourse-column', 'concourse-fitout', 'concourse-floor', 'concourse-glass', 'concourse-glass-top',
    'concourse-lattice', 'concourse-mullions', 'concourse-panels', 'concourse-supports', 'concourse-wall'], 'the concourse is these meshes and no others');
  const bbox = (m: THREE.Mesh): THREE.Box3 => {
    m.geometry.computeBoundingBox();
    return m.geometry.boundingBox as THREE.Box3;
  };
  // the roof is 20 m at the stalk, 5 m at the rim; members are 0.3 m deep
  const lattice = bbox(named('concourse-lattice'));
  assert.ok(lattice.max.y > 19 && lattice.max.y < canopy.apex + 0.3, `lattice tops out at ${lattice.max.y}`);
  assert.ok(lattice.min.y > canopy.rim - 0.5 && lattice.min.y < canopy.rim + 2);
  // the funnel is 20 m high (R3); its head stands on the roof's third ring, where the roof has dipped 0.1 to 0.7 m
  assert.ok(bbox(named('concourse-column')).max.y > 19.3 && bbox(named('concourse-column')).max.y < canopy.apex, `the funnel is ${bbox(named('concourse-column')).max.y} m high`);
  // roof infill, soffit and floor face up; the edge band under the panels is the roof's vertical upstands and fascia, which look sideways but never down
  for (const n of ['concourse-glass', 'concourse-panels', 'concourse-floor']) {
    const g = named(n).geometry;
    const normal = g.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) > 0.3, `${n}: a face points down`);
  }
  const edgeNormal = named('concourse-edges').geometry.getAttribute('normal');
  for (let i = 0; i < edgeNormal.count; i++) assert.ok(Math.abs(edgeNormal.getY(i)) < 1e-6, `concourse-edges: a face is not vertical (${edgeNormal.getY(i)})`);
  close(bbox(named('concourse-floor')).max.y, 0.02, EPS);
  // each rim glazing quad faces away from the column
  const wall = named('concourse-wall').geometry;
  const wp = wall.getAttribute('position');
  const wn = wall.getAttribute('normal');
  assert.ok(wp.count >= 20, `${wp.count / 4} rim panes`);
  for (let i = 0; i < wp.count; i++) {
    const out = (wp.getX(i) - canopy.centre[0]) * wn.getX(i) + (wp.getZ(i) - canopy.centre[1]) * wn.getZ(i);
    assert.ok(out > 0, 'a rim pane faces the column');
    assert.ok(Math.abs(wn.getY(i)) < 1e-6, 'a rim pane is vertical');
  }
  // the rim glazing runs from the floor to the brim glass, a little above the roof edge (the roof there is the lowest on the ring, 5 m, and
  // rises about 2 m in the 3 m the wall stands back, R-c)
  const rimTop = concourseHeight(canopy, canopy.radius);
  close(rimTop, canopy.rim, 1e-9);
  assert.ok(bbox(named('concourse-wall')).max.y > rimTop + 1 && bbox(named('concourse-wall')).max.y < rimTop + 3.5, `the wall is ${bbox(named('concourse-wall')).max.y} m high`);
});

// Arup Journal 2/2012, printed p.15 fig.6 explicitly measures the overall N–S roof extent:
// https://www.arup.com/globalassets/downloads/arup-journal/the-arup-journal-2012-issue-2.pdf#page=15
test('the drawn concourse spans Arup’s 138 m overall roof within the structure tolerance', () => {
  const group = buildConcourse(canopy, station.pts, layout);
  const v = panelVertices(group).map(([x, , z]) => worldToShed(layout, [x, z]).v);
  const span = Math.max(...v) - Math.min(...v);
  assert.ok(Math.abs(span - 138) < 3, `drawn overall N–S extent ${span} m, not a fitted-circle diameter`);
});

// Arup pp.12–16 and JMP put the funnel next to the Western Range façade. The existing
// full-round funnel approximation must clear that façade; its exact survey position is unknown.
test('the funnel stands beside the Western Range without entering its brickwork', () => {
  const column = buildConcourse(canopy, station.pts, layout).getObjectByName('concourse-column')!;
  const {u} = worldToShed(layout, [column.position.x, column.position.z]);
  const gap = -WESTERN_RANGE.depth - (u + FUNNEL_RADIUS);
  assert.ok(gap >= 0 && gap <= 1, `funnel top is ${gap} m from the façade`);
  assert.ok(RANGE_FACE > u + FUNNEL_RADIUS, 'the roof grid\'s first ring stays west of the Range face');
});

test('the roof reaches the OSM concourse arc including its north and south canopy ends', () => {
  const roof = panelVertices(buildConcourse(canopy, station.pts, layout));
  for (const point of station.pts) {
    const {u,v} = worldToShed(layout, point);
    if (u >= -45 || v > WESTERN_RANGE.v1 + .1) continue;
    let nearest = Infinity;
    for (const [x, , z] of roof) nearest = Math.min(nearest, Math.hypot(x-point[0],z-point[1]));
    assert.ok(nearest < 3, `OSM roof edge u=${u}, v=${v} is ${nearest} m from the drawn roof`);
  }
});

// The weather's cover test (web/tests/cover.test.ts) reads the roof meshes' vertices three at a time, each triple a triangle: a vertical quad among them
// would shift every triple after it. The panels are a pure soup, and the standing faces hang under them, where the evidence pack still finds them.
test('the roof meshes the weather reads are triangle soups, and the standing faces are the panels\' child so the roof still reaches the outline', () => {
  const group = buildConcourse(canopy, station.pts, layout);
  for (const name of ['concourse-panels', 'concourse-glass']) {
    const geometry = (group.getObjectByName(name) as THREE.Mesh).geometry, p = geometry.getAttribute('position'), index = geometry.getIndex()!;
    assert.equal(p.count % 3, 0, `${name}: vertices come in threes`);
    for (let i = 0; i < index.count; i += 3) for (let k = 0; k < 3; k++) assert.equal(Math.floor(index.getX(i + k) / 3), i / 3, `${name}: triangle ${i / 3} has a vertex of another triangle`);
  }
  const panels = group.getObjectByName('concourse-panels') as THREE.Mesh, edges = group.getObjectByName('concourse-edges') as THREE.Mesh;
  assert.ok(edges.parent === panels, 'the edge band hangs under the panels'); // not assert.equal: a failed one would diff two scene graphs
  assert.ok(edges.material === panels.material, 'in the soffit\'s own material');
  const along = new THREE.Vector3(Math.sin(layout.heading), 0, -Math.cos(layout.heading));
  const reach = (vertices: V3[]): number => { const s = vertices.map(([x, y, z]) => new THREE.Vector3(x, y, z).dot(along)); return Math.max(...s) - Math.min(...s); };
  const reached = reach(panelVertices(group)), soffitOnly = reach(positions(panels));
  // the fascia stands on the outline itself and the soffit's cells stop a little short of it (the glazed band, round 5: 1.5 m wide, sits between): the edge band reaches further
  assert.ok(reached - soffitOnly > 0.1, `the soffit alone reaches ${soffitOnly.toFixed(2)} m: only the edge band, on the outline, brings the roof to ${reached.toFixed(2)} m`);
});

// JMP built photo shows brickwork through the crossing white stalk members.
test('column lattice: rays pass through open branching gaps instead of a continuous shell', () => {
  const column = buildConcourse(canopy, station.pts, layout).getObjectByName('concourse-column') as THREE.Mesh;
  column.updateMatrixWorld(true);
  for (const y of [3, 8, 11, 14, 17, 19]) {
    let hits = 0;
    for (let i = 0; i < 120; i++) {
      const angle = (i + .37) * 2 * Math.PI / 120;
      const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const origin = new THREE.Vector3(column.position.x, y, column.position.z).addScaledVector(direction, 15);
      hits += Number(new THREE.Raycaster(origin, direction.negate(), 0, 30).intersectObject(column).length > 0);
    }
    assert.ok(hits > 0 && hits < 108, `height ${y}: ${hits}/120 rays hit, expected members and open gaps`);
  }
});

test('column lattice: connected branching members are drawn inside the trumpet\'s envelope, each one where the graph says', () => {
  const api = concourse as typeof concourse & { columnMembers?: (head: [number, number, number][]) => {nodes: [number,number,number][]; edges: [number,number][]} };
  assert.equal(typeof api.columnMembers, 'function', 'column needs an inspectable member graph');
  const { centre, grid } = concourseGrid(canopy, station.pts, layout);
  const head = funnelHead(grid, centre, layout);
  const {nodes, edges} = api.columnMembers!(head);
  const adjacent = nodes.map(() => new Set<number>());
  for (const [a,b] of edges) { adjacent[a]!.add(b); adjacent[b]!.add(a); }
  const reached = new Set([0]), pending = [0];
  for (const a of pending) for (const b of adjacent[a]!) if (!reached.has(b)) {reached.add(b); pending.push(b);}
  assert.equal(reached.size, nodes.length, 'every member joins the same structure');
  assert.ok(adjacent.some(n => n.size >= 4), 'members branch at shared nodes');
  assert.ok(nodes.some(n => n[1] === 0) && nodes.some(n => n[1] > 19.2), 'floor to roof');
  const column = buildConcourse(canopy, station.pts, layout).getObjectByName('concourse-column') as THREE.Mesh;
  const positions = column.geometry.getAttribute('position');
  // each member is drawn: the surface passes within a leg's width of the middle of its chord (the leg curves a little between its nodes)
  for (const [a,b] of edges) {
    const p = new THREE.Vector3(...nodes[a]!).lerp(new THREE.Vector3(...nodes[b]!), .5);
    let nearest = Infinity;
    for (let i=0;i<positions.count;i++) nearest = Math.min(nearest, Math.hypot(positions.getX(i)-p.x, positions.getY(i)-p.y, positions.getZ(i)-p.z));
    const chord = Math.hypot(nodes[b]![0] - nodes[a]![0], nodes[b]![1] - nodes[a]![1], nodes[b]![2] - nodes[a]![2]);
    assert.ok(nearest < chord / 6 + 0.7, `missing drawn member ${a}:${b} (${nearest.toFixed(2)} m from its middle; its rings stand a sixth of ${chord.toFixed(1)} m apart)`);
  }
  // the whole is the trumpet: no vertex wider than the mouth's radius at its height, plus half a metre, and none above the roof
  const mouth = Math.min(...head.map(p => Math.hypot(p[0], p[2]))), top = head.reduce((s, p) => s + p[1], 0) / head.length;
  for (let i=0;i<positions.count;i++) {
    const y=positions.getY(i), r=Math.hypot(positions.getX(i),positions.getZ(i));
    assert.ok(y >= -EPS && y <= canopy.apex, 'height envelope');
    // below the last ring of the bell, where the legs sweep out to the roof's own nodes
    if (y < 0.8 * top) assert.ok(r <= columnRadius(y / top, mouth) + 0.6, `member radius ${r} exceeds the trumpet at ${y}`);
  }
  assert.ok(!column.children.length && column.geometry.groups.length <= 1, 'one batched member mesh');
});
