import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bounds, buildingPrisms, platformPrisms, railSegments } from '../../core/scene.ts';
import type { Prism } from '../../core/scene.ts';
import type { KxData } from '../../core/osm.ts';
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

function start(): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1218);
  scene.fog = new THREE.Fog(0x0e1218, 900, 3200);

  scene.add(new THREE.HemisphereLight(0xbfd3ff, 0x2a2f38, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(-300, 500, 200);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x1a2029 }),
  );
  ground.position.y = -0.05;
  scene.add(ground);

  const rails = railSegments(data);
  scene.add(lines(rails.main, 0xd9a441));
  scene.add(lines(rails.siding, 0x8a7a55));
  scene.add(lines(rails.tunnel, 0x5b6b86, 0.7));

  const platforms = mergedPrisms(platformPrisms(data), new THREE.MeshLambertMaterial({ color: 0x8c96a6 }));
  if (platforms) scene.add(platforms);
  const buildings = mergedPrisms(buildingPrisms(data), new THREE.MeshLambertMaterial({ color: 0x3a4454 }));
  if (buildings) scene.add(buildings);

  // Frame the camera on the main-line track, a little south-east of the platform heads, looking north-west.
  const b = bounds(rails.main);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 8000);
  camera.position.set(cx + 250, 380, cz + 420);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(40, 0, -220); // the platform heads of King's Cross
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 20;
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
    renderer.render(scene, camera);
  });

  status.textContent = `${data.rails.length} track sections · ${data.platforms.length} platforms · ${data.buildings.length} buildings`;
  (window as unknown as { __kx: unknown }).__kx = { ready: true, scene, camera, controls, renderer };
}
