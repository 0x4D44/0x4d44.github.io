// The Western Concourse: a glazed diagrid canopy, 20 m at the central stalk falling to 5 m at the
// rim (published heights), clipped to the OSM station footprint and kept clear of the train shed.
// The shape is an approximation of the real single-stalk roof: a shallow dome in a polar grid.
import * as THREE from 'three';
import { concourseHeight, pointInPolygon, worldToShed } from '../../core/station.ts';
import type { ConcourseCanopy, ShedLayout } from '../../core/station.ts';
import type { Pt } from '../../core/geo.ts';

const RINGS = 18;
const SECTORS = 72;
const SPOKE_EVERY = 3;
const RING_EVERY = 2;

export function buildConcourse(canopy: ConcourseCanopy, footprint: Pt[], shed: ShedLayout): THREE.Group {
  const [cx, cz] = canopy.centre;
  const R = canopy.radius;
  const point = (k: number, s: number): [number, number, number] => {
    const r = (R * k) / RINGS;
    const a = (2 * Math.PI * s) / SECTORS;
    return [cx + r * Math.cos(a), concourseHeight(canopy, r), cz + r * Math.sin(a)];
  };
  const keep = (k: number, s: number): boolean => {
    const r = (R * (k + 0.5)) / RINGS;
    const a = (2 * Math.PI * (s + 0.5)) / SECTORS;
    const p: Pt = [cx + r * Math.cos(a), cz + r * Math.sin(a)];
    const { u, v } = worldToShed(shed, p);
    const inShed = u > -1 && u < shed.width + 1 && v > -1 && v < shed.length + 1;
    return !inShed && pointInPolygon(p, footprint);
  };

  const roof: number[] = [];
  const floor: number[] = [];
  const steel: number[] = [];
  for (let k = 0; k < RINGS; k++) {
    for (let s = 0; s < SECTORS; s++) {
      if (!keep(k, s)) continue;
      const a = point(k, s);
      const b = point(k, s + 1);
      const c = point(k + 1, s);
      const d = point(k + 1, s + 1);
      roof.push(...a, ...c, ...b, ...b, ...c, ...d);
      const f = (p: number[]): number[] => [p[0] as number, 0.04, p[2] as number];
      floor.push(...f(a), ...f(b), ...f(c), ...f(b), ...f(d), ...f(c));
      if (k % RING_EVERY === 0) steel.push(...a, ...b);
      if (s % SPOKE_EVERY === 0) steel.push(...a, ...c);
    }
  }

  const group = new THREE.Group();
  group.name = 'western-concourse';
  const geo = (positions: number[]): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    return g;
  };
  const roofMesh = new THREE.Mesh(geo(roof), new THREE.MeshLambertMaterial({ color: 0xb9cde3, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }));
  roofMesh.renderOrder = 2;
  group.add(roofMesh);
  group.add(new THREE.Mesh(geo(floor), new THREE.MeshLambertMaterial({ color: 0x5d6572, side: THREE.DoubleSide })));
  const lines = new THREE.LineSegments(geo(steel), new THREE.LineBasicMaterial({ color: 0xe6edf5 }));
  group.add(lines);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.6, canopy.apex, 20), new THREE.MeshLambertMaterial({ color: 0xdfe3ea }));
  stalk.position.set(cx, canopy.apex / 2, cz);
  group.add(stalk);
  return group;
}
