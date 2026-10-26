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

  /** Measures the interior ceiling height (m above rail head) vs lateral x by casting rays up through the middle cars.
   *  Returns { xs[], head[] } where head = height of the lowest surface above PY+1.2, or null if none. */
  computeHeadroom(floorY = 0.695) {
    const THREE = this.THREE, rc = new THREE.Raycaster(); rc.firstHitOnly = true;
    // put the cars into the root frame temporarily
    this.cars.forEach((g, i) => { g.matrix.makeTranslation(0, 0, this.carInfo[i].zc); g.matrixWorldNeedsUpdate = true; });
    this.root.updateMatrixWorld(true);
    const meshes = []; this.root.traverse((m) => { if (m.isMesh && /(saloon|exterior|cab)(_\d+)?$/.test(m.name || '') || /(saloon|exterior|cab)$/.test((m.parent && m.parent.name) || '')) meshes.push(m); });
    const mid = this.carInfo.slice(1, -1).length ? this.carInfo.slice(1, -1) : this.carInfo;
    const zs = []; for (const c of mid) for (const f of [-0.3, -0.15, 0.15, 0.3]) zs.push(c.zc + f * c.len);
    const xs = [], head = [];
    for (let x = -1.15; x <= 1.1501; x += 0.05) {
      let best = Infinity;
      for (const z of zs) { rc.set(new THREE.Vector3(x, floorY + 1.2, z), new THREE.Vector3(0, 1, 0)); rc.near = 0; rc.far = 3; const h = rc.intersectObjects(meshes, false); if (h.length) best = Math.min(best, h[0].point.y); }
      xs.push(+x.toFixed(3)); head.push(isFinite(best) ? best : null);
    }
    this.headroom = head.some((h) => h != null) ? { xs, head, floorY } : null;
    return this.headroom;
  }
  /** Procedural driver's cab (drive mode only): low sloping desk, TMS on the desk, full-width windscreen with slim pillars,
   *  dark lining. Replaces A3's cab shell, glass and furniture while driving (the nose shell seen from inside is a white vault). */
  buildCab(texTms, texSpeedo) {
    if (this.cabKit) return;
    const THREE = this.THREE, g = new THREE.Group(); g.name = 'cabKit'; g.visible = false;
    const zc = this.carInfo[0].zc, F = this.cars[0];
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, ...o });
    const lining = std(0x4a4e56, { emissive: 0x15171a }), wall = std(0x3c4048, { emissive: 0x101214 }), desk = std(0x2b2f35, { emissive: 0x0c0d0f }), trim = std(0x1b1d21);
    const box = (w, h, d, x, y, z, m, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z - zc); b.rotation.x = rx; g.add(b); return b; };
    const zf = -19.55, zr = -17.85;                       // windscreen plane / rear partition
    box(2.2, 0.05, zr - zf + 0.2, 0, 2.275, (zf + zr) / 2, lining);                 // roof
    box(0.05, 1.6, zr - zf, -1.1, 1.49, (zf + zr) / 2 - 0.05, wall);               // side walls (solid below/above the side window below)
    box(0.05, 1.6, zr - zf, 1.1, 1.49, (zf + zr) / 2 - 0.05, wall);
    box(2.2, 1.6, 0.05, 0, 1.49, zr, wall);                                         // rear partition
    box(2.2, 0.62, 0.06, 0, 0.99, zf, wall);                                        // nose below the windscreen
    box(2.2, 0.07, 0.12, 0, 2.215, zf, trim);                                         // slim header
    for (const sx of [-1, 1]) box(0.13, 1.0, 0.12, sx * 1.035, 1.75, zf, trim);      // A pillars (windscreen opening is ~1.97 m wide)
    box(2.18, 0.03, zr - zf, 0, 0.7, (zf + zr) / 2, std(0x2a2c30));                  // floor
    // desk: low, top slopes down toward the driver
    box(1.7, 0.04, 0.62, 0, 1.19, -19.2, desk, 0.22);
    box(1.7, 0.5, 0.6, 0, 0.94, -19.22, desk);
    box(0.1, 0.5, 0.42, -0.95, 1.0, -19.05, trim); box(0.1, 0.5, 0.42, 0.95, 1.0, -19.05, trim);
    // TMS screen on the desk (angled up toward the driver) + secondary speed display
    const scr = new THREE.Group(); scr.position.set(-0.72, 1.24, -19.14 - zc); scr.rotation.x = -0.6; g.add(scr);
    const bz = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.25, 0.03), trim); bz.position.set(0, 0.12, -0.012); scr.add(bz);
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35 * 320 / 512), new THREE.MeshBasicMaterial({ map: texTms, toneMapped: false })); sp.position.set(0, 0.12, 0.006); scr.add(sp);
    const s2 = new THREE.Group(); s2.position.set(0.34, 1.21, -19.12 - zc); s2.rotation.x = -0.6; g.add(s2);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.17, 0.025), trim); b2.position.set(0, 0.09, -0.01); s2.add(b2);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.21 * 170 / 256), new THREE.MeshBasicMaterial({ map: texSpeedo, toneMapped: false })); p2.position.set(0, 0.09, 0.004); s2.add(p2);
    // master controller: dark base, short lever, small dark grip (non-emissive)
    const cyl = (r, h, x, y, z, m) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), m); c.position.set(x, y, z - zc); g.add(c); return c; };
    cyl(0.05, 0.04, -0.05, 1.17, -18.88, trim); cyl(0.012, 0.13, -0.05, 1.24, -18.88, trim);
    const grip = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), std(0x15161a)); grip.position.set(-0.05, 1.32, -18.88 - zc); g.add(grip);
    // door buttons (dull, only slightly emissive)
    [[0x2d7a46, 0.12], [0x9a6a1c, 0.08], [0x8c2b2b, 0.08]].forEach(([c, e], i) => { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 12), std(c, { emissive: c, emissiveIntensity: e })); b.position.set(0.62 + i * 0.07, 1.19, -19.05 - zc); b.rotation.x = 0.25; g.add(b); });
    for (const pl of [sp, p2]) { const uv = pl.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }   // the TMS canvas textures use flipY=false
    this.cabKit = g; F.add(g);
  }
  /** Drive mode swaps A3's cab shell for the procedural cab (see buildCab). */
  setDriveCab(on) {
    on = !!on && !!this.cabKit; if (this._driveCab === on) return; this._driveCab = on;
    if (this.cabKit) this.cabKit.visible = on;
    for (const nm of ['car_0_exterior', 'car_0_glass', 'car_0_cab', 'car_0_saloon']) { const n = this.byName[nm]; if (n) n.visible = !on; }
    for (const n of [this.cabScreen, this.cabSpeedo]) if (n) n.visible = !on;
    this._cullT0 = 0;
  }
  setWalkable(j) { this.walk = j; }
  /** max head height above the floor at lateral x (interpolated); 0 outside the carbody */
  headroomAt(x) {
    const wk = this.walk && this.walk.headroomVsX;
    if (wk) { const ax = Math.abs(x); if (ax >= wk[wk.length - 1][0]) return 0; for (let i = 0; i < wk.length - 1; i++) if (ax <= wk[i + 1][0]) { const f = (ax - wk[i][0]) / (wk[i + 1][0] - wk[i][0]); return wk[i][1] + (wk[i + 1][1] - wk[i][1]) * f; } return 0; }
    const h = this.headroom; if (!h) return 9;
    const ax = Math.abs(x); const f = (ax - h.xs[0] * 0) ; 
    const t = (x - h.xs[0]) / 0.05, i = Math.floor(t); if (i < 0 || i >= h.xs.length - 1) return 0;
    const a = h.head[i], b = h.head[i + 1]; if (a == null || b == null) return 0;
    return (a + (b - a) * (t - i)) - h.floorY;
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
      if (!(i === 0 && this._driveCab)) for (const nm of ['car_' + i + '_saloon', 'car_' + i + '_cab']) { const n = this.byName[nm]; if (n) n.visible = d < R || (nm.endsWith('cab') && i === 0 && mode === 'drive'); }
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
