import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { Pt } from '../../core/geo.ts';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, pointInPolygon, shedLayout, stationBuilding, worldToShed } from '../../core/station.ts';
import { buildConcourse, concourseGrid, keepTriangles, MULLION, STRUT_DIAMETER, TREES, treeSites, WEST_WALL } from '../src/concourse.ts';

// What holds the roof up at its edge. Published (refs/DIMENSIONS.md section 2): "perimeter tree columns, 12 m apart and 52.1 m from the
// centre of the funnel" (Arup Journal 2/2012 p16, fig 10 caption), 16 of them (Construction Index, Architect magazine). R-a, R-b: a
// white trunk forking into four branches that meet the roof. R-c, R-c2: white struts from the glazed wall's rail to the roof's glass brim.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const station = stationBuilding(data) as NonNullable<ReturnType<typeof stationBuilding>>;
const hotel = data.buildings.find(b => b.id === 46821177)!;
const { centre, grid } = concourseGrid(canopy, station.pts, layout, [hotel.pts]);
const funnel = worldToShed(layout, centre);
const sites = treeSites(layout, centre);
const kept = keepTriangles(grid, station.pts, layout);
const roofNodes = [...new Set(kept.flat())].map(i => grid.nodes[i]!);

const supportsOf = (g: THREE.Group): THREE.Mesh => g.getObjectByName('concourse-supports') as THREE.Mesh;
const verticesOf = (mesh: THREE.Mesh): THREE.Vector3[] => {
  const p = mesh.geometry.getAttribute('position');
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
};
const build = (exclusions: Pt[][]): THREE.Group => {
  const g = buildConcourse(canopy, station.pts, layout, exclusions);
  g.updateMatrixWorld(true);
  return g;
};
const group = build([hotel.pts]);
const supports = supportsOf(group), points = verticesOf(supports);
const across = (a: THREE.Vector3, x: number, z: number): number => Math.hypot(a.x - x, a.z - z);
/** the vertices on a trunk's base ring: on the floor, round the site */
const baseOf = (site: Pt, pool = points): THREE.Vector3[] => pool.filter(v => v.y < 0.01 && across(v, site[0], site[1]) < 0.4);
const distanceToOutline = (p: Pt): number => {
  let best = Infinity;
  for (let i = 0; i < station.pts.length; i++) {
    const a = station.pts[i]!, b = station.pts[(i + 1) % station.pts.length]!, dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz));
  }
  return best;
};
/** the roof is over the point: it lies inside one of the roof's cells */
const underRoof = (p: Pt): boolean => kept.some(t => pointInPolygon(p, t.map(i => [grid.nodes[i]!.x, grid.nodes[i]!.z] as Pt)));
/** a site that is drawn: under the roof, 3 m or more inside the outline (the wall stands 3 m in), and in no other building */
const standsAt = (p: Pt, others: Pt[][]): boolean => underRoof(p) && distanceToOutline(p) >= 3 && !others.some(h => pointInPolygon(p, h));

test('tree columns: sixteen sites, 12 m apart by chord on an arc 52.1 m from the funnel axis, the arc symmetric about it', () => {
  assert.equal(sites.length, 16, 'sixteen tree columns');
  assert.deepEqual([TREES.count, TREES.spacing, TREES.radius], [16, 12, 52.1], 'the published figures');
  for (let i = 0; i < sites.length; i++) {
    const s = worldToShed(layout, sites[i]!);
    assert.ok(Math.abs(Math.hypot(s.u - funnel.u, s.v - funnel.v) - 52.1) < 0.001, `site ${i} is ${Math.hypot(s.u - funnel.u, s.v - funnel.v).toFixed(3)} m from the funnel axis`);
    if (i > 0) assert.ok(Math.abs(Math.hypot(sites[i]![0] - sites[i - 1]![0], sites[i]![1] - sites[i - 1]![1]) - 12) < 0.001, `sites ${i - 1} and ${i} are 12 m apart`);
    const mirror = worldToShed(layout, sites[15 - i]!);
    assert.ok(Math.abs(s.u - mirror.u) < 0.001 && Math.abs(s.v - funnel.v + (mirror.v - funnel.v)) < 0.001, `site ${i} mirrors site ${15 - i} about the funnel's v`);
    assert.ok(s.u < funnel.u + 10, 'the arc faces west, over the concourse');
  }
});

test('tree columns: a trunk stands at each site that is under the roof, inside the outline and in no other building; the two beyond the Range\'s wall are not drawn', () => {
  const drawn = sites.filter(s => standsAt(s, [hotel.pts]));
  assert.ok(drawn.length >= 12 && drawn.length < 16, `${drawn.length} of 16 are drawn`);
  const omitted = sites.map((s, i) => [i, s] as const).filter(([, s]) => !standsAt(s, [hotel.pts]));
  assert.deepEqual(omitted.map(([i]) => i), [0, 15], 'the two end sites are the ones left out');
  for (const [i, s] of omitted) assert.ok(worldToShed(layout, s).u > WEST_WALL - 3, `site ${i} lies inside the Range (u ${worldToShed(layout, s).u.toFixed(1)}, the roof is cut at ${WEST_WALL})`);
  const sides = baseOf(drawn[0]!).length / 2;
  assert.ok(sides >= 6, `a round trunk of ${sides} flat sides`);
  for (const s of sites) {
    const base = baseOf(s), should = standsAt(s, [hotel.pts]);
    assert.equal(base.length, should ? 2 * sides : 0, `site ${sites.indexOf(s)} ${should ? 'has' : 'has no'} trunk`);
    // 0.6 m through
    for (const v of base) assert.ok(Math.abs(across(v, s[0], s[1]) - TREES.trunk / 2) < 0.005, `a trunk ${(2 * across(v, s[0], s[1])).toFixed(2)} m through`);
  }
  // a building near a site displaces its tree: put a block over site 5 and that one trunk goes and no other
  const [x, z] = sites[5]!, block: Pt[] = [[x - 4, z - 4], [x + 4, z - 4], [x + 4, z + 4], [x - 4, z + 4]];
  const without = verticesOf(supportsOf(build([hotel.pts, block])));
  assert.equal(baseOf(sites[5]!, without).length, 0, 'no trunk where another building stands');
  for (const i of [3, 4, 6, 7]) assert.equal(baseOf(sites[i]!, without).length, 2 * sides, `site ${i} is unaffected`);
  // nothing the supports draw stands inside the hotel
  const inHotel = points.filter(v => pointInPolygon([v.x, v.z], hotel.pts));
  assert.equal(inHotel.length, 0, `${inHotel.length} support vertices inside the Great Northern Hotel`);
});

test('tree columns: the trunk forks 2.4 m under the lowest of four branches, which land on the four nearest roof nodes and are 0.3 m through', () => {
  for (const [i, s] of sites.entries()) {
    if (!standsAt(s, [hotel.pts])) continue;
    const near = [...roofNodes].sort((a, b) => Math.hypot(a.x - s[0], a.z - s[1]) - Math.hypot(b.x - s[0], b.z - s[1])).slice(0, 4);
    assert.equal(near.length, 4);
    for (const n of near) {
      const tip = new THREE.Vector3(n.x, n.height as number, n.z), around = points.filter(v => v.distanceTo(tip) < 0.2);
      assert.ok(around.length >= 8, `site ${i}: a branch ends on the roof node at ${n.x.toFixed(1)}, ${n.z.toFixed(1)}`);
      if (n.ring < grid.rings) for (const v of around) assert.ok(Math.abs(v.distanceTo(tip) - Math.hypot(TREES.branch / 2, 0.05)) < 0.012, `site ${i}: a branch ${(2 * v.distanceTo(tip)).toFixed(2)} m from its axis, 0.3 m through`); // rings stand 0.05 m past the node
    }
    const lowest = Math.min(...near.map(n => n.height as number)), ring = points.filter(v => Math.abs(across(v, s[0], s[1]) - TREES.trunk / 2) < 0.005 && v.y > 1);
    const forkAt = Math.max(...ring.map(v => v.y)) - 0.05; // the trunk's end ring stands 0.05 m past its end
    assert.ok(ring.length >= 8 && Math.abs(lowest - forkAt - TREES.fork) < 0.005, `site ${i}: the trunk ends ${(lowest - forkAt).toFixed(2)} m under the lowest branch tip, not ${TREES.fork}`);
  }
});

test('struts: two white struts to each pane of the wall, in a V from its rail to the roof edge, and the supports are these and the trees', () => {
  const wall = group.getObjectByName('concourse-wall') as THREE.Mesh, p = wall.geometry.getAttribute('position'), panes = p.count / 4;
  const drawn = sites.filter(s => standsAt(s, [hotel.pts])).length, sides = baseOf(sites[1]!).length / 2;
  // a trunk and four branches to each drawn tree are round tubes of `sides` sides, two triangles to a side; a strut is an open V of four sides, its two lower faces: two triangles each, four in all
  assert.equal(supports.geometry.index!.count / 3, 2 * sides * 5 * drawn + 4 * 2 * panes, 'a trunk and four branches to each drawn tree, two struts to each pane');
  assert.ok(STRUT_DIAMETER <= 0.07, `the struts are thin rods, ${STRUT_DIAMETER} m through (R-c, round 5: a light zigzag of thin grey struts under the brim, not stout bars)`);
  const struts = new THREE.Raycaster();
  let rails = 0;
  const centre3 = new THREE.Vector3(centre[0], 0, centre[1]);
  for (let i = 0; i < p.count; i += 4) {
    const f0 = new THREE.Vector3(p.getX(i), 0, p.getZ(i)), f1 = new THREE.Vector3(p.getX(i + 1), 0, p.getZ(i + 1));
    const top = (p.getY(i + 2) + p.getY(i + 3)) / 2, rail = new THREE.Vector3((f0.x + f1.x) / 2, (MULLION.transom * (p.getY(i + 2) + p.getY(i + 3))) / 2, (f0.z + f1.z) / 2);
    assert.ok(top > canopy.rim && rail.y > 1 && rail.y < top, `pane ${i / 4}: the rail at ${rail.y.toFixed(2)} m of ${top.toFixed(2)}`);
    for (const f of [f0, f1]) {
      // the strut ends on the roof edge, where the wall's foot looks out WALL_INSET m along the line from the funnel (or on it, beside the hotel)
      const outwards = f.clone().sub(centre3).setY(0).normalize(), guess = f.clone().addScaledVector(outwards, 3);
      const gap = (n: (typeof roofNodes)[number]): number => Math.min(Math.hypot(n.x - guess.x, n.z - guess.z), Math.hypot(n.x - f.x, n.z - f.z));
      const nodeOut = roofNodes.filter(n => n.ring === grid.rings).reduce((best, n) => (gap(n) < gap(best) ? n : best));
      const end = new THREE.Vector3(nodeOut.x, nodeOut.height as number, nodeOut.z);
      const mid = rail.clone().add(end).multiplyScalar(0.5), axis = end.clone().sub(rail).normalize();
      const side = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
      for (const sign of [1, -1]) {
        // a strut is an open V, the faces under its axis: a ray 1 cm under the axis meets one a hair inside the full radius
        struts.set(mid.clone().addScaledVector(side, sign * 0.6).setY(mid.y - 0.01), side.clone().multiplyScalar(-sign));
        const hit = struts.intersectObject(supports, false)[0];
        assert.ok(hit && Math.abs(hit.distance - (0.6 - STRUT_DIAMETER / 2)) < 0.02, `pane ${i / 4}: a strut ${STRUT_DIAMETER} m through between the rail and the roof edge (hit at ${hit?.distance.toFixed(3)})`);
      }
      rails++;
    }
  }
  assert.ok(rails >= 2 * panes - 6, `${rails} struts checked on ${panes} panes`);
});
