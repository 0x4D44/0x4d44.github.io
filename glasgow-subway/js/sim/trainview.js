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
  /** Generic over the number of cars / doors in the GLB (car_0..car_N, door_L_i / door_R_i). */
  constructor(THREE, template, ctx) {
    this.THREE = THREE;
    const root = template.clone(true);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    this.zMin = box.min.z; this.zMax = box.max.z; this.length = box.max.z - box.min.z; this.frontOffset = -box.min.z;
    const wz = new THREE.Vector3(), worldDoorZ = {};
    root.traverse((o) => { if (/^door_[LR]_\d+$/.test(o.name)) { o.getWorldPosition(wz); worldDoorZ[o.name] = wz.z; } });
    const top = (root.children.length === 1 && root.children[0].name === 'train') ? root.children[0] : root;
    const carNodes = top.children.filter((c) => /^car_\d+$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    this.carInfo = carNodes.map((n) => { const b = new THREE.Box3().setFromObject(n); return { node: n, zc: (b.min.z + b.max.z) / 2, len: b.max.z - b.min.z, zmin: b.min.z }; });
    if (!this.carInfo.length) this.carInfo = [{ node: null, zc: -this.length / 4, len: this.length / 2 }, { node: null, zc: this.length / 4, len: this.length / 2 }];
    this.cars = this.carInfo.map((c, i) => { const g = new THREE.Group(); g.name = 'carGroup' + i; g.matrixAutoUpdate = false; return g; });
    this.byName = {};
    const nearest = (z) => { let bi = 0, bd = 1e9; this.carInfo.forEach((c, i) => { const d = Math.abs(c.zc - z); if (d < bd) { bd = d; bi = i; } }); return bi; };
    for (const k of [...top.children]) {
      const m = /^car_(\d+)/.exec(k.name);
      const ci = m && this.carInfo[+m[1]] ? +m[1] : nearest(k.position.z || 0);
      k.position.z -= this.carInfo[ci].zc; k._car = ci;
      this.cars[ci].add(k);
    }
    this.root = new THREE.Group(); this.root.name = 'trainView';
    this.cars.forEach((g) => this.root.add(g));
    this.root.traverse((o) => { if (o.name) this.byName[o.name] = o; });
    this.doorsL = []; this.doorsR = []; this.doorZ = [];
    for (let i = 0; i < 40; i++) {
      const l = this.byName['door_L_' + i], r = this.byName['door_R_' + i];
      if (!l && !r) break;
      const dir = 1; // revision 2: every leaf slides 1.2 m toward the rear
      if (l) this.doorsL.push({ n: l, z0: l.position.z, dir });
      if (r) this.doorsR.push({ n: r, z0: r.position.z, dir });
    }
    // door opening centres in root coordinates (one leaf per opening, centre of the opening = leaf closed pos)
    const refKey = this.doorsR.length ? 'door_R_' : 'door_L_';
    for (let i = 0; i < 40 && worldDoorZ[refKey + i] != null; i++) this.doorZ.push(worldDoorZ[refKey + i]);
    this.cabEye = this.byName.cab_eye || null;
    this.cabScreen = this.byName.cab_screen || null;
    this.cabSpeedo = this.byName.cab_speedo || null;
    this.eyeLocal = this.cabEye ? this.cabEye.position.clone() : new THREE.Vector3(0, 1.98, this.zMin + 1.8);
    root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this._m = new THREE.Matrix4();
    this.bogie = this.carInfo.map((c) => Math.max(2, c.len * 0.34));
    const bA = this.byName['car_0_bogie_a'], bB = this.byName['car_0_bogie_b'];
    if (bA && bB) { const half = Math.abs(bA.position.z - bB.position.z) / 2; this.bogie = this.carInfo.map(() => half); }
  }

  setDoors(L, R) {
    const move = (list, f) => { for (const d of list) d.n.position.z = d.z0 + d.dir * 1.2 * f; };
    move(this.doorsL, L); move(this.doorsR, R);
  }

  /** Pose all cars given chainage of the FRONT tip of the train and a Track. */
  place(track, sFront) {
    this.carInfo.forEach((c, i) => {
      const sc = sFront - (c.zc - this.zMin);
      this._poseCar(track, this.cars[i], sc, this.bogie[i]);
    });
    this.root.updateMatrixWorld(true);
  }
  _poseCar(track, g, sc, hb) {
    const a = track.pose(sc + hb, this._pa || (this._pa = {})), b = track.pose(sc - hb, this._pb || (this._pb = {}));
    const fx = a.x - b.x, fy = a.y - b.y, fz = a.z - b.z, fl = Math.hypot(fx, fy, fz) || 1;
    const f = [fx / fl, fy / fl, fz / fl];
    let rx = -f[2], rz = f[0]; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * f[1], uy = rz * f[0] - rx * f[2], uz = rx * f[1];
    g.matrix.set(rx, ux, -f[0], (a.x + b.x) / 2, 0, uy, -f[1], (a.y + b.y) / 2, rz, uz, -f[2], (a.z + b.z) / 2, 0, 0, 0, 1);
    g.matrixWorldNeedsUpdate = true;
  }
  /** Distance based detail: hides saloon/cab interiors and bogies of cars the camera cannot meaningfully see. */
  cull(camPos, mode, low) {
    const R = { drive: low ? 14 : 30, ride: low ? 24 : 1e9, explore: low ? 22 : 1e9 }[mode] ?? 1e9;
    const Rb = mode === 'explore' ? (low ? 18 : 45) : 0;       // bogies only matter seen from the platform
    this.cars.forEach((g, i) => {
      const e = g.matrix.elements, d = Math.hypot(e[12] - camPos.x, e[13] - camPos.y, e[14] - camPos.z);
      for (const nm of ['car_' + i + '_saloon', 'car_' + i + '_cab']) { const n = this.byName[nm]; if (n) n.visible = d < R || (nm.endsWith('cab') && i === 0 && mode === 'drive'); }
      for (const nm of ['car_' + i + '_bogie_a', 'car_' + i + '_bogie_b']) { const n = this.byName[nm]; if (n) n.visible = d < Rb; }
    });
  }
  /** car index + car-local z for a root-frame z */
  carAt(z) { let bi = 0, bd = 1e9; this.carInfo.forEach((c, i) => { const d = Math.abs(c.zc - z); if (d < bd) { bd = d; bi = i; } }); return bi; }
  eyeWorld(outPos, outQuat) {
    const g = this.cars[0];
    if (this.cabEye) this.cabEye.getWorldPosition(outPos); else outPos.copy(this.eyeLocal).applyMatrix4(g.matrix);
    if (outQuat) outQuat.setFromRotationMatrix(this._m.extractRotation(g.matrix));
  }
  dispose() { this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}
