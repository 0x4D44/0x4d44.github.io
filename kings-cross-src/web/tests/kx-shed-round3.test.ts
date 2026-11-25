import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { readFileSync } from 'node:fs';
import { shedLayout } from '../../core/station.ts';
import * as shed from '../src/shed.ts';

// Round S3 (shed-round-2b score): B3 the west arcade's arches deep and dark, the glass set back behind brick reveals, no fanlight bars; B1 a slimmer web.
const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const L = layout.length;
const group = shed.buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const hit = (o: [number, number, number], d: [number, number, number], names: string[], far = 4): { name: string; p: THREE.Vector3 } | null => {
  const origin = group.localToWorld(new THREE.Vector3(...o)), dir = new THREE.Vector3(...d).normalize().transformDirection(group.matrixWorld);
  const h = new THREE.Raycaster(origin, dir, 0, far).intersectObjects(names.map(n => group.getObjectByName(n)!), false)[0];
  return h ? { name: h.object.name, p: group.worldToLocal(h.point.clone()) } : null;
};
const gates = (vc: number, r: number): boolean => [12.1, 20.1, 28.1, 36.1, 44.1].some(c => vc + r > c - 3.3 && vc - r < c + 3.3);

test('B3: the west arcade\'s glass stands 0.65 m or more back of its face, behind brick reveals at the jambs and the head, no fanlight bars', () => {
  const D = shed.WEST_ARCADE.depth, G = shed.WEST_GLAZING;
  assert.ok(D - G.glass >= 0.65, `the glass ${(D - G.glass).toFixed(2)} m back`);
  assert.equal(G.radial.length, 0, 'no fanlight bars');
  const names = ['shed-west-arcade', 'shed-west-arcade-panes', 'shed-west-arcade-bars'];
  let n = 0;
  const opens = shed.westArcadeOpenings(L);
  // arches between two other windows: the first and last arches' outer piers, and those beside the gates, are not plain piers
  const plain = opens.filter(({ vc, r }) => !gates(vc, r) && [-1, 1].every(s => opens.some(o => o.vc !== vc && Math.sign(o.vc - vc) === s && Math.abs(o.vc - vc) < 4 * r && !gates(o.vc, o.r))));
  for (const { vc, r, jamb } of plain) {
    // square-on from the shed: the glass, at its depth, in the fanlight and under the transom
    for (const [v, y] of [[vc + 0.3 * r, jamb + 0.5 * r], [vc - 0.3 * r, jamb + 0.4 * r], [vc - r / 4, G.sill + 0.6]] as const) {
      const h = hit([D + 2, y, -v], [-1, 0, 0], names);
      assert.ok(h && h.name === 'shed-west-arcade-panes' && Math.abs(h.p.x - G.glass) < 0.01, `the glass at v ${v.toFixed(2)}, y ${y.toFixed(2)}: ${h?.name} at ${h?.p.x.toFixed(2)}`);
    }
    // where the centre bar stood: glass
    const c = hit([D + 2, jamb + r / 2, -vc], [-1, 0, 0], names);
    assert.ok(c && c.name === 'shed-west-arcade-panes', `the fanlight's middle: ${c?.name}`);
    // inside the recess, looking along the wall: the jambs' brick returns and the head's soffit, the full depth of the reveal
    const u = (G.glass + G.out + 0.05 + D) / 2;
    for (const sd of [-1, 1]) {
      const j = hit([u, G.sill + 0.6, -vc], [0, 0, -sd], ['shed-west-arcade'], r + 0.5);
      assert.ok(j && Math.abs(-j.p.z - (vc + sd * r)) < 0.02, `the ${sd < 0 ? 'south' : 'north'} jamb's return at v ${j && (-j.p.z).toFixed(2)}`);
    }
    const up = hit([u, jamb + 0.2, -vc], [0, 1, 0], ['shed-west-arcade'], r + 0.5);
    assert.ok(up && Math.abs(up.p.y - (jamb + r)) < 0.05, `the head's soffit over the crown at y ${up?.p.y.toFixed(2)}`);
    n++;
  }
  assert.ok(n >= 3, `${n} arches checked`);
});

test('B1: the rib web slimmed to at most 0.07 m either way, the booms as they were', () => {
  const [a, b] = shed.MEMBER_SIZE.web, [c, d] = shed.MEMBER_SIZE.boom;
  assert.ok(a <= 0.07 && b <= 0.07 && a >= 0.04 && b >= 0.04, `web ${a} x ${b}`);
  assert.deepEqual([c, d], [0.26, 0.2]);
  const ribs = group.getObjectByName('shed-ribs') as THREE.InstancedMesh;
  ribs.geometry.computeBoundingBox();
  // the web's z depth is its own: the booms 0.2 deep, the webs no more than 0.07
  const pos = ribs.geometry.getAttribute('position');
  let thin = 0;
  for (let k = 0; k < pos.count; k++) if (Math.abs(Math.abs(pos.getZ(k)) - b / 2) < 1e-6) thin++;
  assert.ok(thin > 0, 'web faces at the web\'s own half-depth');
});
