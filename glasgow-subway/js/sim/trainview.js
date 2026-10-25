// 3D train: loads models/train.glb (A3) and splits it into two articulated car groups that are
// posed along the track by bogie chords. Falls back to a procedural box train if the GLB is missing.
// Model conventions (models/train.glb): units metres, origin at train centre on the rail head,
// front = -Z, +X = right when facing front, nodes: cab_eye, cab_screen, cab_speedo, door_L_n/door_R_n,
// headlight_*, interior_light_n, car_0 (front car) / car_1 (rear car).
export async function loadTrainTemplate(THREE, GLTFLoader, url) {
  try {
    const gltf = await new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
    return { scene: gltf.scene, ok: true };
  } catch (e) {
    console.warn('[sim] train.glb unavailable, using placeholder', e && e.message);
    return { scene: proceduralTrain(THREE), ok: false };
  }
}

function proceduralTrain(THREE) {
  const root = new THREE.Group(); root.name = 'train';
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8741a, roughness: 0.6, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.8 });
  for (let c = 0; c < 2; c++) {
    const car = new THREE.Group(); car.name = 'car_' + c;
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.0, 13.8), mat); body.position.set(0, 1.5, (c ? 1 : -1) * 6.9); body.name = 'car_' + c + '_exterior';
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.7, 11), dark); win.position.set(0, 1.9, (c ? 1 : -1) * 6.9);
    car.add(body, win); root.add(car);
  }
  const eye = new THREE.Object3D(); eye.name = 'cab_eye'; eye.position.set(0, 1.98, -12.15); root.add(eye);
  return root;
}

export class TrainView {
  constructor(THREE, template, ctx) {
    this.THREE = THREE;
    const root = template.clone(true);
    root.updateMatrixWorld(true);
    this.carLen = 13.92; this.pivot = [-6.96, 6.96];
    this.cars = [new THREE.Group(), new THREE.Group()];
    this.cars.forEach((g, i) => { g.name = 'carGroup' + i; g.matrixAutoUpdate = false; });
    this.byName = {};
    const kids = [...root.children];
    for (const k of kids) {
      let ci = k.position.z < 0 ? 0 : 1;
      if (/_rear$|car_1|taillight|couple_rear/.test(k.name)) ci = 1;
      if (/^car_0|cab_light$|headlight|couple_front/.test(k.name) && !/rear/.test(k.name)) ci = 0;
      k.position.z -= this.pivot[ci];
      this.cars[ci].add(k);
    }
    this.root = new THREE.Group(); this.root.name = 'trainView';
    this.root.add(this.cars[0], this.cars[1]);
    this.root.traverse((o) => { if (o.name) this.byName[o.name] = o; });
    this.doorsL = [], this.doorsR = [];
    for (let i = 0; i < 8; i++) {
      const l = this.byName['door_L_' + i], r = this.byName['door_R_' + i];
      if (l) this.doorsL.push({ n: l, z0: l.position.z, dir: i % 2 === 0 ? -1 : 1 });
      if (r) this.doorsR.push({ n: r, z0: r.position.z, dir: i % 2 === 0 ? -1 : 1 });
    }
    this.cabEye = this.byName.cab_eye || null;
    this.cabScreen = this.byName.cab_screen || null;
    this.cabSpeedo = this.byName.cab_speedo || null;
    this.eyeLocal = this.cabEye ? this.cabEye.position.clone() : new THREE.Vector3(0, 1.98, -12.15 - this.pivot[0]);
    // collect lights nodes
    this.lights = [];
    root.traverse((o) => { if (o.isMesh && o.material) { o.frustumCulled = false; } });
    this.pose = {};
    this._m = new THREE.Matrix4(); this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.doorsOpenL = 0; this.doorsOpenR = 0;
    this.length = 27.84;
    this.frontOffset = 13.92; // front overhang from model centre
  }

  /** Make the cab shell hide from the player's view when inside (not needed: back-face culling). */
  setDoors(L, R) {
    const move = (list, f) => { for (const d of list) d.n.position.z = d.z0 + d.dir * 0.65 * f; };
    move(this.doorsL, L); move(this.doorsR, R);
  }

  /** Pose both cars given chainage of the FRONT of the train and a Track. */
  place(track, sFront, out) {
    const T = this.THREE, p = this._p || (this._p = [{}, {}, {}, {}]);
    // car centres in chainage: front car centre = sFront - 6.9 - (13.8 - 13.8) ; model front at sFront
    const cA = sFront - this.carLen / 2;          // front car centre
    const cB = sFront - this.carLen * 1.5 - 0.1;  // rear car centre
    this._poseCar(track, this.cars[0], cA);
    this._poseCar(track, this.cars[1], cB);
    this.root.updateMatrixWorld(true);
  }
  _poseCar(track, g, sc) {
    const T = this.THREE, a = track.pose(sc + 4.7, this._pa || (this._pa = {})), b = track.pose(sc - 4.7, this._pb || (this._pb = {}));
    const fx = a.x - b.x, fy = a.y - b.y, fz = a.z - b.z, fl = Math.hypot(fx, fy, fz) || 1;
    const f = [fx / fl, fy / fl, fz / fl];
    // right = f x up
    let rx = -f[2], ry = 0, rz = f[0]; // cross(f,(0,1,0)) = (fy*0 - fz*1, fz*0 - fx*0, fx*1 - fy*0) -> (-fz,0,fx)
    const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    // up = right x f
    const ux = ry * f[2] - rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1] - ry * f[0];
    // basis: X = right, Y = up, Z = -f
    const m = g.matrix;
    m.set(rx, ux, -f[0], (a.x + b.x) / 2,
          ry, uy, -f[1], (a.y + b.y) / 2,
          rz, uz, -f[2], (a.z + b.z) / 2,
          0, 0, 0, 1);
    g.matrixWorldNeedsUpdate = true;
  }
  /** World position + basis of the cab eye (after place()). */
  eyeWorld(outPos, outQuat) {
    const g = this.cars[0];
    if (this.cabEye) this.cabEye.getWorldPosition(outPos); else outPos.copy(this.eyeLocal).applyMatrix4(g.matrix);
    if (outQuat) outQuat.setFromRotationMatrix(this._m.extractRotation(g.matrix));
  }
  dispose() { this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}
