// South front re-proportion, phase 1 (wrk-designs 2026.11.26 - KX - front re-proportion, signed off 2026-11-26; measured in
// gfx-rubrics/scores/front-measure-2.md from R-kx-front-a/b): each great window is a semicircle about 19.5 m across, its sill and
// springing about 7.5 m and its crown about 17.7 m above the forecourt, centred on its vault, not the vault's whole 32 m section; the
// vault's end round it is brick, inside as well; the lower arcade's crowns about 5.5 m. Held here on the built geometry, to 5%.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { SHED_SPAN_WIDTH, shedLayout, shedVaultCentres } from '../../core/station.ts';
import { SHADOW_CASTERS } from '../src/lighting.ts';
import { buildShed, TOWER_SIZE } from '../src/shed.ts';
import { GROUND_Y } from '../src/world.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const group = buildShed(layout, { range: false });
group.updateMatrixWorld(true);
const near = (got: number, want: number, what: string): void => assert.ok(Math.abs(got - want) <= 0.05 * want, `${what}: ${got.toFixed(2)} m, want ${want} m +-5%`);

/** The forecourt-datum heights of the glass of the window about `uc`: [west edge, east edge, lowest, highest] in the shed's frame. */
function windowGlass(uc: number): [number, number, number, number] {
  const glass = group.getObjectByName('shed-front-glass') as THREE.Mesh;
  const pos = glass.geometry.getAttribute('position');
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k);
    if (Math.abs(x - uc) > 16) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, x1, y0 - GROUND_Y, y1 - GROUND_Y];
}

const hitsFront = (x: number, y: number, name: string, dir: 1 | -1 = -1): boolean => {
  const origin = group.localToWorld(new THREE.Vector3(x, y, dir < 0 ? 3 : -30));
  const direction = new THREE.Vector3(0, 0, dir).transformDirection(group.matrixWorld);
  const hits = new THREE.Raycaster(origin, direction, 0, 40).intersectObject(group.getObjectByName(name)!, true);
  return hits.length > 0;
};

test('each great window is a 19.5 m semicircle centred on its vault, sill 7.5 m and crown 17.7 m above the forecourt', () => {
  for (const uc of shedVaultCentres(layout)) {
    const [x0, x1, sill, crown] = windowGlass(uc);
    near(x1 - x0, 19.5, 'span');
    near(sill, 7.5, 'sill / springing');
    near(crown, 17.7, 'crown');
    near(crown - sill, 10.2, 'rise');
    assert.ok(Math.abs((x0 + x1) / 2 - uc) < 0.05, `centred on the vault's axis ${uc.toFixed(2)}: ${((x0 + x1) / 2).toFixed(2)}`);
    // a semicircle: as tall as half its span
    assert.ok(Math.abs((crown - sill) - (x1 - x0) / 2) < 0.1, 'a semicircle');
  }
});

test('the vault end round the window is brick: the wall stands where the old vault-section window was, from outside and from inside the shed', () => {
  for (const uc of shedVaultCentres(layout)) {
    const crownVault = layout.crown;
    assert.ok(!hitsFront(uc, GROUND_Y + 12, 'shed-front'), 'the window is open in the wall');
    assert.ok(hitsFront(uc, crownVault - 1.5, 'shed-front'), 'above the window\'s crown, under the vault\'s, is wall');
    assert.ok(hitsFront(uc + 12.5, layout.springing + 3, 'shed-front'), 'beside the window, inside the vault\'s section, is wall');
    // from inside (looking south) the end wall is its own brick, under the vault and round the window
    assert.ok(hitsFront(uc, crownVault - 1.5, 'shed-front-endwall', 1), 'the end wall fills the vault over the window');
    assert.ok(hitsFront(uc + 12.5, layout.springing + 3, 'shed-front-endwall', 1), 'and beside it');
    assert.ok(!hitsFront(uc, GROUND_Y + 12, 'shed-front-endwall', 1), 'and leaves the window open');
  }
  assert.ok(!SHADOW_CASTERS.has('shed-front-endwall'), 'the end wall casts no sun shadow (the pass is full)');
});

test('the lower storey rises with the window: the springing course\'s top at the sill, the porch arches\' crowns about 5.5 m', () => {
  const stone = group.getObjectByName('shed-stone') as THREE.Mesh;
  const box = new THREE.Box3();
  const pos = stone.geometry.getAttribute('position');
  // the springing course: the stone that runs the front's whole width at the sill
  const [uc0, uc1] = shedVaultCentres(layout), sill = GROUND_Y + 7.5;
  let found = false;
  for (let k = 0; k < pos.count; k++) if (Math.abs(pos.getY(k) - sill) < 0.4 && pos.getZ(k) > 0.5) { box.expandByPoint(new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k))); found = true; }
  assert.ok(found && box.min.x < uc0 - 12 && box.max.x > uc1 + 12, 'a proud stone course runs across the front at the sill');
  // the porch openings: the wall is open just under 5.5 m on an arch's axis and closed just over it
  // the first opening's axis: the front runs from spine - SHED_SPAN_WIDTH, the openings centred in six equal bays either side of the 6.4 m tower
  const x = layout.spine - SHED_SPAN_WIDTH + (2 * SHED_SPAN_WIDTH - 6.4) / 12;
  assert.ok(!hitsFront(x, GROUND_Y + 5.5 * 0.95, 'shed-front'), 'open under the crown');
  assert.ok(hitsFront(x, GROUND_Y + 5.5 * 1.05, 'shed-front'), 'wall over it');
});

test('the window\'s glass counts its panes on its own bars: the rows the sky glint reads are its transoms\' (a third of its radius over its sill)', () => {
  const glass = group.getObjectByName('shed-front-glass') as THREE.Mesh;
  const rows = glass.userData.paneRows as [number, number] | undefined;
  assert.ok(rows, 'the front glass names its pane rows');
  const [uc] = shedVaultCentres(layout), [, , sill, crown] = windowGlass(uc);
  const r = crown - sill + 0.02;
  near(rows[0] - GROUND_Y, 7.5, 'the rows\' origin, the sill');
  assert.ok(Math.abs(rows[1] - r / 3) < 0.01, `a row a third of the radius: ${rows[1].toFixed(3)} against ${(r / 3).toFixed(3)}`);
  const bars = group.getObjectByName('shed-front-bars') as THREE.Mesh;
  bars.geometry.computeBoundingBox();
  assert.ok(bars.geometry.boundingBox!.max.y - GROUND_Y < crown + 0.05, 'and the bars stay in the window');
});

// front phase 1b (the lead's day captures: a pale line and a dark band traced the old vault-section outline across the new brick over each window): from
// the forecourt, along the old outline (the vaults' radius, either side of it) nothing of the vault stands on or out of the front's brick. Each ray from a
// forecourt eye to the front's face there (not behind the tower) meets the front (behind the tower or a proud brick or stone dressing, at most) before anything else, and nothing
// else lies within a few mm behind that hit
test('the old vault outline over each window is plain brick from the forecourt: nothing of the vault stands on or out of the front', () => {
  const front = new Set(['shed-front', 'shed-brick', 'shed-stone']), R = layout.crown - layout.springing, sp = layout.springing;
  const bad: string[] = [];
  let rays = 0;
  for (const uc of shedVaultCentres(layout)) for (let a = 0.1; a < Math.PI; a += 0.05) for (const dr of [-0.3, 0, 0.15, 0.3, 0.45]) {
    const x = uc + (R + dr) * Math.cos(a);
    if (Math.abs(x - layout.spine) < TOWER_SIZE / 2) continue; // behind the tower (the spine wall's end meets the front there, both brick, unseen)
    for (const [ex, ey, ez] of [[-25, 2, 40], [25, 2, 40], [0, 30, 60], [0, 2, 25]]) {
      const eye = group.localToWorld(new THREE.Vector3(uc + ex, GROUND_Y + ey, ez));
      const at = group.localToWorld(new THREE.Vector3(x, sp + (R + dr) * Math.sin(a), -0.3));
      const hits = new THREE.Raycaster(eye, at.sub(eye).normalize(), 0, 200).intersectObject(group, true).filter(h => !h.object.name.startsWith('tower'));
      const k = hits.findIndex(h => h.object.name === 'shed-front');
      if (k < 0) continue;
      rays++;
      const wrong = hits.filter((h, i) => (i < k && !front.has(h.object.name)) || (i > k && !front.has(h.object.name) && h.distance - hits[k]!.distance < 0.005));
      if (wrong.length) bad.push(`${wrong[0]!.object.name} at the vault ${uc.toFixed(1)}, ${a.toFixed(2)} rad, r ${(R + dr).toFixed(2)}`);
    }
  }
  assert.ok(rays > 1000, `rays reaching the front: ${rays}`);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} of ${rays} rays meet something of the vault on or out of the front's brick`);
});
