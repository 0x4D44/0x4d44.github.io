// Sky, ground, light and the optional measuring grid. No assets: the sky is a gradient on a dome.
import * as THREE from 'three';

export const HORIZON = 0x35465e;
const ZENITH = 0x0b1322;

export interface World {
  /** keep the dome centred on the camera so it never reaches an edge */
  follow(camera: THREE.Camera): void;
}

function skyDome(): THREE.Mesh {
  const g = new THREE.SphereGeometry(5200, 32, 18);
  const pos = g.getAttribute('position');
  const colors: number[] = [];
  const top = new THREE.Color(ZENITH);
  const horizon = new THREE.Color(HORIZON);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 5200));
    c.copy(horizon).lerp(top, Math.pow(t, 0.55));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -1;
  return m;
}

/**
 * 10 m grids for the evidence screenshots (?grid=1): one on the ground over the station, and one
 * standing upright in the middle of the shed (x = 45) for side views, 10 m squares both.
 */
function measuringGrid(): THREE.Group {
  const group = new THREE.Group();
  const floor = new THREE.GridHelper(600, 60, 0x66a3ff, 0x3f6fb5);
  floor.position.set(40, 0.12, -180);
  const wall = new THREE.GridHelper(300, 30, 0xff9f43, 0xb8742f);
  wall.rotation.z = Math.PI / 2; // lie in the y-z plane
  wall.position.set(45, 0, -135);
  for (const g of [floor, wall]) {
    const mat = g.material as THREE.LineBasicMaterial;
    mat.transparent = true;
    mat.opacity = 0.55;
    group.add(g);
  }
  return group;
}

export function addWorld(scene: THREE.Scene, opts: { grid: boolean; bare?: boolean }): World {
  scene.background = new THREE.Color(HORIZON);
  // Bare (measuring) views look from far away; fog would wash the model out.
  scene.fog = opts.bare ? null : new THREE.Fog(HORIZON, 1100, 3600);

  const sky = skyDome();
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xc4d6ff, 0x3a3f48, 1.25));
  const sun = new THREE.DirectionalLight(0xffe8c2, 1.7);
  sun.position.set(-320, 520, 260);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a4049 }));
  ground.position.y = -0.05;
  scene.add(ground);

  if (opts.grid) scene.add(measuringGrid());

  return {
    follow(camera) {
      sky.position.copy(camera.position);
    },
  };
}
