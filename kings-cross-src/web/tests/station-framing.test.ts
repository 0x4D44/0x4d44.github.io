import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { shedLayout, stationBuilding, stationPlatforms } from '../../core/station.ts';
import { kingsCrossView } from '../src/station-framing.ts';
import type { StationView } from '../src/station-transition.ts';

const data = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;
const desktop: StationView = { eye: [300.65, 380, -168.3], target: [40, 0, -150] };
const aspect = 390 / 844;

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: V3): [number, number, number] => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};

function stationBoxCorners(): { target: [number, number, number]; corners: V3[]; heading: number; roof: number } {
  const station = stationBuilding(data);
  assert.ok(station, 'committed OSM data has the named King’s Cross station polygon');
  const platforms = [...stationPlatforms(data).values()];
  assert.ok(platforms.length > 0, 'committed OSM data has surface King’s Cross platforms');
  const points = [...station.pts, ...platforms.flatMap((platform) => platform.pts)];
  const x0 = Math.min(...points.map(([x]) => x));
  const x1 = Math.max(...points.map(([x]) => x));
  const z0 = Math.min(...points.map(([, z]) => z));
  const z1 = Math.max(...points.map(([, z]) => z));
  const shed = shedLayout(data);
  const roof = Math.max(shed.crown, station.height ?? 0);
  const y0 = 0;
  const y1 = roof;
  return {
    target: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    heading: shed.heading,
    roof,
    corners: [
      [x0, y0, z0], [x0, y0, z1], [x0, y1, z0], [x0, y1, z1],
      [x1, y0, z0], [x1, y0, z1], [x1, y1, z0], [x1, y1, z1],
    ],
  };
}

function projectedCorners(view: StationView, corners: V3[], ratio: number): [number, number][] {
  const camera = new THREE.PerspectiveCamera(50, ratio, 0.5, 9000);
  camera.position.fromArray(view.eye);
  camera.lookAt(...view.target);
  camera.updateMatrixWorld(true);
  return corners.map((point) => {
    const ndc = new THREE.Vector3(...point).project(camera);
    return [ndc.x, ndc.y];
  });
}

test('landscape keeps the legacy view without reading station geometry', () => {
  assert.strictEqual(kingsCrossView({} as KxData, desktop, 0.9), desktop);
  assert.strictEqual(kingsCrossView({} as KxData, desktop, 1), desktop);
});

test('portrait framing targets the OSM station/platform bounding-box centre and aims from south-southeast', () => {
  const box = stationBoxCorners();
  const view = kingsCrossView(data, desktop, aspect);
  const cosine = Math.cos(box.heading);
  const sine = Math.sin(box.heading);
  const expectedDirection = unit([
    0.35 * cosine - sine,
    0.9,
    0.35 * sine + cosine,
  ]);
  const actualDirection = unit(sub(view.eye, view.target));
  assert.ok(Math.hypot(...sub(view.target, box.target)) < 1e-9, 'aim point is the derived OSM extents centre');
  assert.ok(Math.hypot(...sub(actualDirection, expectedDirection)) < 1e-9, 'eye direction follows the shed-local framing vector');
});

test('portrait fit keeps all eight station bounds corners in the mobile safe region and improves on legacy', () => {
  const { corners } = stationBoxCorners();
  const portrait = kingsCrossView(data, desktop, aspect);
  const portraitNdc = projectedCorners(portrait, corners, aspect);
  assert.ok(portraitNdc.every(([x, y]) => Math.abs(x) <= 0.85 && Math.abs(y) <= 0.5), 'every corner clears the mobile nav/footer region');

  const legacyNdc = projectedCorners(desktop, corners, aspect);
  assert.ok(legacyNdc.some(([x, y]) => Math.abs(x) > 0.85 || Math.abs(y) > 0.5), 'the legacy desktop pose does not fit the narrow viewport');
});

test('aspect immediately below the cutoff selects portrait geometry', () => {
  assert.notStrictEqual(kingsCrossView(data, desktop, 0.899), desktop);
});
