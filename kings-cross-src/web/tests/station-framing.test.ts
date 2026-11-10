import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { tunnelMouths } from '../../core/landmarks.ts';
import { shedLayout, shedToWorld, stationBuilding, stationPlatforms } from '../../core/station.ts';
import { createTerrain } from '../../core/terrain.ts';
import type { TerrainFile } from '../../core/terrain.ts';
import { kingsCrossLandingView, kingsCrossView } from '../src/station-framing.ts';
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

// The landing view (Arthur, 2026-11-10): above the Gasworks Tunnel, looking south down the throat at the shed.
const field = createTerrain(JSON.parse(readFileSync(new URL('../src/data/kx-terrain.json', import.meta.url), 'utf8')) as TerrainFile);
const southMouth = () => {
  const mouth = tunnelMouths(data).find((m) => m.id === 'gasworks-south');
  assert.ok(mouth, 'the committed OSM tunnel ways give the Gasworks Tunnel a south mouth');
  return mouth;
};
const degrees = (radians: number): number => (radians * 180) / Math.PI;

test('the landing view stands over the Gasworks Tunnel, 30 to 60 m above the ground, inside its south mouth', () => {
  const mouth = southMouth();
  const { eye } = kingsCrossLandingView(data);
  const along = (eye[0] - mouth.origin[0]) * mouth.axis[0] + (eye[2] - mouth.origin[1]) * mouth.axis[1];
  const across = (eye[0] - mouth.origin[0]) * mouth.across[0] + (eye[2] - mouth.origin[1]) * mouth.across[1];
  assert.ok(along >= 10 && along <= 80, `${along.toFixed(1)} m into the tunnel from its south face: over the tunnel, clear of the portal`);
  assert.ok(Math.abs(across) <= mouth.halfWidth, `${across.toFixed(1)} m off the tunnel's axis, inside its ${mouth.halfWidth.toFixed(1)} m half width`);
  const height = eye[1] - field.heightAt(eye[0], eye[2]);
  assert.ok(height >= 30 && height <= 60, `${height.toFixed(1)} m above the terrain: a drone's height`);
});

test('the landing view looks south and down the throat, between the mouth and the shed', () => {
  const mouth = southMouth();
  const shed = shedLayout(data);
  const { eye, target } = kingsCrossLandingView(data);
  const d = sub(target, eye);
  const bearing = degrees(Math.atan2(d[0], d[2])); // 0 is due south (+z), positive is toward the east
  const pitch = degrees(Math.atan2(-d[1], Math.hypot(d[0], d[2])));
  assert.ok(Math.abs(bearing) <= 10, `${bearing.toFixed(1)} degrees off due south`);
  assert.ok(pitch >= 8 && pitch <= 25, `${pitch.toFixed(1)} degrees down: the throat, not the sky and not straight down`);
  const [gableX, gableZ] = shedToWorld(shed, shed.width / 2, shed.length);
  assert.ok(target[2] > mouth.origin[1] + 100 && target[2] < gableZ - 40, `aim z ${target[2].toFixed(1)}: north of the shed gable (${gableZ.toFixed(1)}), well south of the mouth (${mouth.origin[1].toFixed(1)})`);
  assert.ok(Math.abs(target[0] - gableX) < 15, `aim x ${target[0].toFixed(1)} is on the shed's centre line (${gableX.toFixed(1)})`);
  assert.ok(target[1] >= 0 && target[1] <= 10, `aim ${target[1]} m up: platform level`);
});

test('the landing view shows the whole throat: platform ends and both arches of the shed, at every landscape shape', () => {
  const shed = shedLayout(data);
  const at = (u: number, v: number, y: number): V3 => { const [x, z] = shedToWorld(shed, u, v); return [x, y, z]; };
  // each point the picture is about, with a note for the failure: the shed's north gable (foot and crown of each of the two arches), its
  // south end, and the north end of every platform in the shed (platforms 9 and 10 are the western suburban pair, outside it)
  const points: [string, V3][] = [
    ['gable west foot', at(0, shed.length, 0)], ['gable east foot', at(shed.width, shed.length, 0)],
    ['west arch crown', at(shed.width / 4, shed.length, shed.crown)], ['east arch crown', at(3 * shed.width / 4, shed.length, shed.crown)],
    ['south end crown', at(shed.width / 2, 0, shed.crown)],
    ...[...stationPlatforms(data)].filter(([ref]) => Number(ref) <= 8).map(([ref, p]): [string, V3] => {
      const north = p.pts.reduce((a, b) => (b[1] < a[1] ? b : a));
      return [`platform ${ref} north end`, [north[0], 1, north[1]]];
    }),
  ];
  assert.equal(points.length, 5 + 9, 'platforms 0 to 8');
  for (const ratio of [0.9, 1, 1.6, 2.2]) {
    for (const [name, point] of projectedCorners(kingsCrossLandingView(data), points.map(([, p]) => p), ratio).map((ndc, i): [string, [number, number]] => [points[i]![0], ndc])) {
      assert.ok(Math.abs(point[0]) <= 0.9 && Math.abs(point[1]) <= 0.9, `${name} is in frame at ${ratio}: (${point[0].toFixed(2)}, ${point[1].toFixed(2)})`);
    }
  }
});

test('a landscape display lands on the Gasworks view, and a portrait one still fits the station', () => {
  const landing = kingsCrossLandingView(data);
  assert.strictEqual(kingsCrossView(data, landing, 1.6), landing);
  assert.notDeepEqual(kingsCrossView(data, landing, aspect), landing, 'the narrow screen keeps its own whole-station fit');
});
