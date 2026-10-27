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
    if (this.cabEye) this.cabEye.position.z += 0.09;      // driver sits closer to the glass (0.88 m)
    this.eyeLocal = this.cabEye ? this.cabEye.position.clone() : this.eyeLocal;
    const ey = this.eyeLocal;
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, ...o });
    // procedural panel textures (seams) so the lining does not read as a flat slab
    const tex = (base, seam, nx, ny) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 128, 128); x.strokeStyle = seam; x.lineWidth = 3; x.strokeRect(1, 1, 126, 126); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(nx, ny); return t; };
    const ceilM = std(0xffffff, { map: tex('#c9ccd0', '#8e9296', 6, 2), emissive: 0x303234 });
    const wallM = std(0xffffff, { map: tex('#4a5058', '#2a2d31', 4, 1), emissive: 0x141517 });
    const blackM = std(0x0b0c0e, { roughness: 0.6 }), deskM = std(0x282c32, { emissive: 0x08090a }), deskTop = std(0x32363c, { emissive: 0x0b0c0d, roughness: 0.55 });
    const R = 1.085, YC = 1.487, FL = 0.695, zf = -19.62, zr = -17.85;
    const add = (o) => { g.add(o); return o; };
    const prof = []; prof.push([-R, FL], [-R, YC]); for (let i = 1; i < 24; i++) { const a = Math.PI - Math.PI * i / 24; prof.push([R * Math.cos(a), YC + R * Math.sin(a)]); } prof.push([R, YC], [R, FL]);
    // tube strip between z0..z1; skip(i) drops profile segment i (side window opening)
    const strip = (z0, z1, mat, pick, skip) => { const pos = [], uv = [], idx = []; let n = 0;
      for (let i = 0; i < prof.length - 1; i++) { if (skip && skip(i)) continue; const A = prof[i], B = prof[i + 1], my = (A[1] + B[1]) / 2; if (pick && !pick(my)) continue;
        pos.push(A[0], A[1], z0 - zc, B[0], B[1], z0 - zc, B[0], B[1], z1 - zc, A[0], A[1], z1 - zc); uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4; }
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals(); return add(new THREE.Mesh(ge, mat)); };
    const w0 = ey.z - 0.62, w1 = ey.z + 0.30;                                   // left side window z range
    const inWin = (i) => prof[i][0] < 0 && prof[i][1] >= 1.22 && prof[i + 1][1] <= 2.02 && prof[i][1] < 2.02 && prof[i + 1][0] <= 0;
    const lowSeg = (my) => my < 1.30, hiSeg = (my) => my >= 1.30;
    strip(zf, zr, wallM, lowSeg); strip(zf, w0, ceilM, hiSeg); strip(w0, w1, ceilM, hiSeg, inWin); strip(w1, zr, ceilM, hiSeg);
    // window frame bars
    const bar = (a, b, r, m) => { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 6), m); c.position.copy(a).addScaledVector(d, 0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return add(c); };
    { const ids = []; for (let i = 0; i < prof.length - 1; i++) if (inWin(i)) ids.push(i);
      const pts = ids.map((i) => prof[i]).concat([prof[ids[ids.length - 1] + 1]]);
      for (const zz of [w0, w1]) for (let k = 0; k < pts.length - 1; k++) bar(new THREE.Vector3(pts[k][0], pts[k][1], zz - zc), new THREE.Vector3(pts[k + 1][0], pts[k + 1][1], zz - zc), 0.022, blackM);
      for (const p of [pts[0], pts[pts.length - 1]]) bar(new THREE.Vector3(p[0], p[1], w0 - zc), new THREE.Vector3(p[0], p[1], w1 - zc), 0.022, blackM); }
    // front wall with three windscreen bays (driver / centre evacuation door / right); frames are the black wall between them
    { const sh = new THREE.Shape(); sh.moveTo(prof[0][0], prof[0][1]); for (const p of prof) sh.lineTo(p[0], p[1]);
      const arch = (x) => Math.abs(x) >= R ? FL : YC + Math.sqrt(R * R - x * x);
      for (const [xa, xb] of [[-0.97, -0.32], [-0.255, 0.255], [0.32, 0.97]]) { const top = (x) => Math.min(2.42, arch(x) - 0.045); const h = new THREE.Path(); h.moveTo(xa, 1.40); h.lineTo(xb, 1.40); h.lineTo(xb, top(xb)); h.lineTo(xa, top(xa)); h.lineTo(xa, 1.40); sh.holes.push(h); }
      const fm = new THREE.Mesh(new THREE.ShapeGeometry(sh), blackM); fm.position.z = zf - zc; add(fm);
      // central door: thin grey handle strip + hinge line
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.2, 0.012), std(0x8a8f95)); hd.position.set(0.215, 1.62, zf + 0.02 - zc); add(hd); }
    // rear partition (solid, with a small door window) and floor
    { const sh = new THREE.Shape(); sh.moveTo(prof[0][0], prof[0][1]); for (const p of prof) sh.lineTo(p[0], p[1]);
      const h = new THREE.Path(); h.moveTo(-0.55, 1.5); h.lineTo(-0.15, 1.5); h.lineTo(-0.15, 2.05); h.lineTo(-0.55, 2.05); h.lineTo(-0.55, 1.5); sh.holes.push(h);
      const pm = new THREE.Mesh(new THREE.ShapeGeometry(sh), wallM); pm.position.z = zr - zc; add(pm); }
    { const fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, zr - zf), std(0x23262a)); fl.rotation.x = -Math.PI / 2; fl.position.set(0, FL + 0.01, (zf + zr) / 2 - zc); add(fl); }
    // desk: extruded side profile (z, y): cowl at the glass, sloping down toward the driver
    { const sh = new THREE.Shape(); const P = [[0.02, FL], [0.02, 1.50], [0.28, 1.50], [0.58, 1.37], [0.60, 1.34], [0.60, FL]]; sh.moveTo(zf + P[0][0], P[0][1]); for (const p of P) sh.lineTo(zf + p[0], p[1]);
      const ge = new THREE.ExtrudeGeometry(sh, { depth: 2 * R - 0.02, bevelEnabled: false }); ge.rotateY(-Math.PI / 2); ge.translate(R - 0.01, 0, -zc);
      add(new THREE.Mesh(ge, deskM)); const top = new THREE.Mesh(new THREE.BoxGeometry(2 * R - 0.04, 0.012, 0.32), deskTop); top.position.set(0, 1.434, zf + 0.44 - zc); top.rotation.x = Math.atan2(0.13, 0.30) * -1; add(top); }
    const deskY = (u) => 1.50 - Math.max(0, u - 0.28) * (0.13 / 0.30);    // desk top height at u metres behind the glass
    // TMS screens: bezel + display, turned toward the driver's eye
    const eyeV = new THREE.Vector3(ey.x, ey.y, ey.z);
    const screen = (x, u, w, h, tx, ratio) => { const gr = new THREE.Group(); gr.position.set(x, deskY(u) + h * 0.45, zf + u - zc); const bz = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.03), blackM); bz.position.z = -0.016; gr.add(bz);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false })); pl.position.z = 0.002; gr.add(pl);
      const uv = pl.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); add(gr); gr.lookAt(eyeV.x, eyeV.y - 0.12, eyeV.z - zc); return gr; };
    screen(-0.80, 0.22, 0.34, 0.34 * 320 / 512, texTms);
    // controls on the driver's right: master controller (traction) and brake handle, door buttons, emergency mushroom
    const cyl = (r, h, x, y, z, m, rx = 0) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), m); c.position.set(x, y, z - zc); c.rotation.x = rx; return add(c); };
    const steel = std(0xb9bdc2, { metalness: 0.6, roughness: 0.35 }), redM = std(0xb02020, { emissive: 0x300808 }), grip = std(0x101113);
    const handle = (x, u, cap) => { const y0 = deskY(u); cyl(0.055, 0.04, x, y0 + 0.02, zf + u, deskM); cyl(0.010, 0.17, x, y0 + 0.10, zf + u - 0.03, steel, 0.35); const k = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.10), cap); k.position.set(x, y0 + 0.19, zf + u - 0.065 - zc); k.rotation.x = 0.35; add(k); };
    handle(-0.20, 0.40, grip);      // master controller
    handle(-0.64, 0.40, redM);      // brake handle
    [[0x2d9a55], [0x2d9a55], [0xc98a1c], [0xd8d8d0], [0x2c6fb0]].forEach(([c], i) => { const b = cyl(0.016, 0.012, -0.40 + i * 0.075, deskY(0.47) + 0.006, zf + 0.47, std(c, { emissive: c, emissiveIntensity: 0.12 }), 0.4); });
    cyl(0.032, 0.05, 0.05, deskY(0.34) + 0.025, zf + 0.34, redM);
    // driver's seat (seen when looking round) and side-wall furniture
    { const sm = std(0x1d2024), sx = ey.x, sz = ey.z + 0.28; const cu = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.46), sm); cu.position.set(sx, FL + 0.45, sz - zc); add(cu);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.60, 0.09), sm); bk.position.set(sx, FL + 0.82, sz + 0.24 - zc); bk.rotation.x = -0.12; add(bk);
      const hr = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.08), sm); hr.position.set(sx, FL + 1.22, sz + 0.27 - zc); add(hr);
      cyl(0.04, 0.45, sx, FL + 0.22, sz, std(0x777b80)); }
    { const pa = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.17), std(0x16181b)); pa.position.set(-R + 0.02, 1.55, ey.z + 0.55 - zc); add(pa);
      const ex = cyl(0.05, 0.3, R - 0.07, 1.05, zr - 0.15, redM); ex.position.y = 1.0;
      bar(new THREE.Vector3(R - 0.06, 1.2, zf + 0.9 - zc), new THREE.Vector3(R - 0.06, 1.2, zr - 0.4 - zc), 0.013, steel); }
    // ceiling LED strip
    { const led = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 1.0), new THREE.MeshBasicMaterial({ color: 0xf4f6ff })); led.position.set(0, YC + R - 0.015, (zf + zr) / 2 - zc); add(led); }
    this.cabKit = g; F.add(g);
    this.setDest('INNER CIRCLE');
  }
  /** Paints the amber LED destination display above the cab glazing (cab_dest / cab_dest_rear, UV 0..1, flipY=false). */
  setDest(text) {
    const THREE = this.THREE; if (this._destText === text) return; this._destText = text;
    const nodes = [this.byName.cab_dest, this.byName.cab_dest_rear].filter(Boolean); if (!nodes.length) return;
    if (!this._destCanvas) { const c = document.createElement('canvas'); c.width = 512; c.height = 68; this._destCanvas = c; this._destTex = new THREE.CanvasTexture(c); this._destTex.colorSpace = THREE.SRGBColorSpace; this._destTex.flipY = false;
      for (const n of nodes) n.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.map = this._destTex; o.material.emissiveMap = this._destTex; o.material.emissive.set(0xffffff); o.material.needsUpdate = true; } }); }
    const g = this._destCanvas.getContext('2d'); g.fillStyle = '#120900'; g.fillRect(0, 0, 512, 68); g.fillStyle = '#ffb02e'; g.font = '700 40px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 36); this._destTex.needsUpdate = true;
  }
  /** Drive mode swaps A3's cab shell for the procedural cab (see buildCab). */
  setDriveCab(on) {
    on = !!on && !!this.cabKit; if (this._driveCab === on) return; this._driveCab = on;
    if (this.cabKit) this.cabKit.visible = on;
    for (const nm of ['car_0_exterior', 'car_0_glass', 'car_0_cab', 'car_0_saloon', 'cab_dest']) { const n = this.byName[nm]; if (n) n.visible = !on; }
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
