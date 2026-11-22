// CPU-only report over the committed geographic scenes.
// node tools/night-light-capacity.mjs
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { lightSourcesFor } from '../core/light-sources.ts';
import { lightingProbe, perthCameras, stationCameras, VIEWPORTS, waverleyCameras } from './evidence.mjs';
import { lightGrid, measureCap, measureSeams, occupancy } from './light-capacity.ts';
import { loadNightLightScene } from './night-light-scenes.ts';

const GRIDS = { desktop: 8, phone: 16 };
const CAPS = [8, 12, 16, 24, 32];
const STEP = 2;
const HALF_SEAM = .01;

function cameraFor(view, { width, height }) {
  const camera = new THREE.PerspectiveCamera(view.fov ?? 50, width / height, view.near ?? .1, 20000);
  camera.position.fromArray(view.pos);
  camera.lookAt(...view.target);
  camera.updateMatrixWorld(true);
  return camera;
}

function regionSamples(region, sizeM) {
  const [x0, z0, x1, z1] = region.bounds;
  const samples = [], seams = [];
  const addSeam = (a, b) => {
    if (a && b && a.covered === b.covered && Math.abs(a.pos[1] - b.pos[1]) < .05) seams.push([a, b]);
  };
  for (let z = Math.floor(z0 / STEP) * STEP; z <= z1; z += STEP) {
    for (let x = Math.floor(x0 / STEP) * STEP; x <= x1; x += STEP) {
      const centre = region.at(x + STEP / 2, z + STEP / 2);
      if (centre) samples.push(centre);
      if (x % sizeM === 0) addSeam(region.at(x - HALF_SEAM, z + STEP / 2), region.at(x + HALF_SEAM, z + STEP / 2));
      if (z % sizeM === 0) addSeam(region.at(x + STEP / 2, z - HALF_SEAM), region.at(x + STEP / 2, z + HALF_SEAM));
    }
  }
  return { samples, seams };
}

export async function nightLightCapacity() {
  const result = {};
  for (const [station, views] of [['kx', stationCameras()], ['wv', waverleyCameras()], ['pt', perthCameras()]]) {
    const { scene, regions, dispose } = await loadNightLightScene(station);
    try {
      const sources = lightSourcesFor(scene);
      const context = { scene, lightSourcesFor, renderer: { toneMappingExposure: 1 } };
      const cameras = Object.fromEntries(Object.entries(views).map(([name, view]) => [name,
        Object.fromEntries(Object.entries(VIEWPORTS).map(([viewport, size]) => {
          const { inFrustum, directInFrustum } = lightingProbe({ ...context, camera: cameraFor(view, size) }).lampRegistry;
          return [viewport, { inFrustum, directInFrustum }];
        }))]));
      const grids = Object.fromEntries(Object.entries(GRIDS).map(([viewport, sizeM]) => {
        const grid = lightGrid(sources, sizeM);
        const measured = Object.fromEntries(regions.map(region => {
          const { samples, seams } = regionSamples(region, sizeM);
          return [region.name, Object.fromEntries(CAPS.map(cap => [cap,
            { ...measureCap(grid, samples, cap), seam: measureSeams(grid, seams, cap) }]))];
        }));
        return [viewport, { sizeM, ...occupancy(grid), regions: measured }];
      }));
      result[station] = { ...lightingProbe(context).lampRegistry, cameras, grids };
    } finally {
      dispose();
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await nightLightCapacity(), null, 2));
}
