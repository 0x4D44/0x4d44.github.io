import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bounds, buildingPrisms, PLATFORM_HEIGHT, platformPrisms, railSegments, ribbonTriangles, twinRails } from '../../core/scene.ts';
import type { Prism } from '../../core/scene.ts';
import { concourseCanopy, platformSouthEnd, shedLayout, stationBuilding, stationPlatforms } from '../../core/station.ts';
import type { KxData } from '../../core/osm.ts';
import { buildConcourse } from './concourse.ts';
import { platformSign } from './labels.ts';
import { buildShed } from './shed.ts';
import { addWorld } from './world.ts';
import trackData from './data/kx-track.json';

const data = trackData as unknown as KxData;
const status = document.getElementById('status') as HTMLElement;
const host = document.getElementById('app') as HTMLElement;

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!webglOk()) {
  document.body.classList.add('no-webgl');
  status.textContent = 'WebGL unavailable';
} else {
  start();
}

/** Extrude a footprint upward: shape in (x, -z) so that after rotateX(-90deg) it lies on the XZ plane. */
function prismGeometry(p: Prism): THREE.BufferGeometry {
  const shape = new THREE.Shape(p.outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: p.height, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

function mergedPrisms(prisms: Prism[], material: THREE.Material): THREE.Mesh | null {
  const geos = prisms.map(prismGeometry);
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged ? new THREE.Mesh(merged, material) : null;
}

function lines(positions: number[], color: number, opacity = 1): THREE.LineSegments {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
}

function triangles(positions: number[], material: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

/** The outline of each footprint as line segments at height y (the yellow platform edge). */
function outlineSegments(prisms: Prism[], y: number): number[] {
  const out: number[] = [];
  for (const p of prisms) {
    for (let i = 0; i < p.outline.length; i++) {
      const a = p.outline[i] as [number, number];
      const b = p.outline[(i + 1) % p.outline.length] as [number, number];
      out.push(a[0], y, a[1], b[0], y, b[1]);
    }
  }
  return out;
}

function start(): void {
  const params = new URLSearchParams(location.search);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const world = addWorld(scene, { grid: params.has('grid') || params.has('bare'), bare: params.has('bare') });

  const rails = railSegments(data);
  const ballast = new THREE.MeshLambertMaterial({ color: 0x4b463f });
  scene.add(triangles(ribbonTriangles(rails.main, 3.2, 0.03), ballast));
  scene.add(triangles(ribbonTriangles(rails.siding, 3.0, 0.03), ballast));
  scene.add(lines(twinRails(rails.main), 0xd5dae2));
  scene.add(lines(twinRails(rails.siding), 0x9a9486));
  scene.add(lines(rails.tunnel, 0x5b6b86, 0.7));

  const platPrisms = platformPrisms(data);
  const platforms = mergedPrisms(platPrisms, new THREE.MeshLambertMaterial({ color: 0xa7b0be }));
  if (platforms) scene.add(platforms);
  scene.add(lines(outlineSegments(platPrisms, PLATFORM_HEIGHT + 0.02), 0xe9d25a));

  // The station footprint is a roof, not a block: skip it as a building and build the shed.
  const station = stationBuilding(data);
  const buildings = mergedPrisms(buildingPrisms(data, new Set(station ? [station.id] : [])), new THREE.MeshLambertMaterial({ color: 0x56627a }));
  // ?bare=1 hides the surrounding buildings, so the evidence shots can measure the shed and platforms.
  if (buildings && !params.has('bare')) scene.add(buildings);
  const layout = shedLayout(data);
  scene.add(buildShed(layout));
  if (station) scene.add(buildConcourse(concourseCanopy(data), station.pts, layout));

  for (const [ref, p] of stationPlatforms(data)) {
    const [x, z] = platformSouthEnd(p.pts);
    scene.add(platformSign(ref, [x, PLATFORM_HEIGHT + 3.1, z - 1.2]));
  }

  // Frame the camera on the platform heads of King's Cross, looking north-west from the south-east.
  const b = bounds(rails.main);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  camera.position.set(cx + 250, 380, cz + 420);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(40, 0, -150);
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 8;
  controls.maxDistance = 3000;
  controls.update();

  const resize = (): void => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    world.follow(camera);
    renderer.render(scene, camera);
  });

  status.textContent = `${data.rails.length} track sections · ${data.platforms.length} platforms · ${data.buildings.length} buildings`;
  (window as unknown as { __kx: unknown }).__kx = { ready: true, scene, camera, controls, renderer, layout };
}
