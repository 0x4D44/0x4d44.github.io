// Launch platform ("sky pier") under the start grid: deck with painted slots and finish line, truss + pylons, light gantry with the
// countdown lamps (red x3, then green). Aligned to the start frame; the deck height is Course.deckY (also returned by groundHeight). Owner: world agent.
import * as THREE from 'three';

function deckDecal(course, w, l, back, fwd) {
  // canvas covers the deck: x in [-w/2, w/2] (right = +x), y from the front (top) to the rear (bottom)
  const PPM = 6;                                           // pixels per metre
  const c = document.createElement('canvas'); c.width = Math.round(w * PPM); c.height = Math.round(l * PPM);
  const g = c.getContext('2d');
  const X = (x) => (x + w / 2) * PPM, Y = (fwdCoord) => (fwd - fwdCoord) * PPM;   // fwdCoord: metres ahead of the line (+) / behind (-)
  g.clearRect(0, 0, c.width, c.height);
  // hazard-striped edge bands
  const band = 2.2 * PPM;
  for (const side of [0, 1]) {
    for (let y = -band; y < c.height + band; y += band * 1.6) {
      g.fillStyle = '#f2b61c'; g.beginPath();
      const x0 = side ? c.width - band : 0;
      g.moveTo(x0, y); g.lineTo(x0 + band, y + band * 0.8); g.lineTo(x0 + band, y + band * 1.6); g.lineTo(x0, y + band * 0.8); g.fill();
    }
  }
  // centre dashed guide + slot boxes from the real grid
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.5 * PPM; g.setLineDash([3 * PPM, 3 * PPM]);
  g.beginPath(); g.moveTo(X(0), 0); g.lineTo(X(0), c.height); g.stroke(); g.setLineDash([]);
  const grid = course.startGrid(8), tmp = new THREE.Vector3();
  for (const sl of grid) {
    tmp.copy(sl.pos).sub(course.startPos);
    const a = tmp.dot(course.startT), b = tmp.dot(course.startR);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.45 * PPM;
    g.strokeRect(X(b - 7), Y(a + 9), 14 * PPM, 22 * PPM);
    g.fillStyle = sl.slot === 0 ? '#ffd23a' : 'rgba(255,255,255,0.9)';
    g.font = `900 ${6 * PPM}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(sl.slot + 1), X(b), Y(a - 4));
  }
  // finish line: checker band across the deck at the line
  const cs = 2 * PPM;
  for (let i = 0; i < Math.floor(c.width / cs); i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 2 ? '#ffffff' : '#101418'; g.fillRect(i * cs, Y(0) - 3 * cs + j * cs, cs, cs); }
  // launch chevrons ahead of the line
  g.fillStyle = 'rgba(255,200,40,0.9)';
  for (let k = 0; k < 4; k++) { const y = Y(14 + k * 12); g.beginPath(); g.moveTo(X(-9), y + 6 * PPM); g.lineTo(X(0), y); g.lineTo(X(9), y + 6 * PPM); g.lineTo(X(9), y + 8.5 * PPM); g.lineTo(X(0), y + 2.5 * PPM); g.lineTo(X(-9), y + 8.5 * PPM); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function buildPlatform(course, game) {
  const cfg = course.startCfg, env = course.environment, deckY = course.deckY;
  const w = cfg.halfW * 2, l = cfg.back + cfg.fwd;
  const group = new THREE.Group(); group.name = 'platform';
  const disposables = [];
  // local frame: +x right, -z forward; origin at the start line on the deck plane
  const f = course.startFrame;
  const up = new THREE.Vector3(0, 1, 0), fwdH = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize(), rightH = new THREE.Vector3().crossVectors(fwdH, up).normalize();
  const root = new THREE.Group();
  root.position.set(f.pos.x, deckY, f.pos.z);
  root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rightH, up, fwdH.clone().negate()));
  group.add(root);
  const zc = (cfg.back - cfg.fwd) / 2;                       // deck centre along +z (behind the line is +z)

  const metal = game.assets.tex('metal_deck');
  const deckMat = new THREE.MeshStandardMaterial({ map: metal, color: 0xb8c0c8, roughness: 0.62, metalness: 0.45 });
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.55, metalness: 0.65 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.5, metalness: 0.3 });
  disposables.push(deckMat, hullMat, accent);

  const top = new THREE.PlaneGeometry(w, l, 1, 1); top.rotateX(-Math.PI / 2);
  { const uv = top.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 10), uv.getY(i) * (l / 10)); }
  const deck = new THREE.Mesh(top, deckMat); deck.position.set(0, 0, zc); deck.receiveShadow = true; root.add(deck);
  const slab = new THREE.BoxGeometry(w, 5, l); const slabM = new THREE.Mesh(slab, hullMat); slabM.position.set(0, -2.55, zc); slabM.castShadow = true; slabM.receiveShadow = true; root.add(slabM);
  disposables.push(top, slab);

  const decalTex = deckDecal(course, w, l, cfg.back, cfg.fwd);
  const decalGeo = new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2);
  const decalMat = new THREE.MeshStandardMaterial({ map: decalTex, transparent: true, roughness: 0.7, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
  const decal = new THREE.Mesh(decalGeo, decalMat); decal.position.set(0, 0.04, zc); decal.receiveShadow = true; root.add(decal);
  disposables.push(decalTex, decalGeo, decalMat);

  // orange edge beams + underside truss
  const beam = new THREE.BoxGeometry(1.6, 1.6, l); disposables.push(beam);
  for (const sx of [-1, 1]) { const b = new THREE.Mesh(beam, accent); b.position.set(sx * (w / 2 + 0.2), 0.7, zc); root.add(b); }
  const trussH = 14, strut = new THREE.BoxGeometry(0.9, 0.9, 1); disposables.push(strut);
  const struts = [];
  for (let z = -cfg.fwd + 6; z < cfg.back; z += 12) for (const sx of [-1, 1]) {
    struts.push({ p: new THREE.Vector3(sx * (w / 2 - 2), -5 - trussH / 2, z), s: new THREE.Vector3(1, trussH, 1), r: 0 });
    const d = new THREE.Vector3(0, -trussH, 12); const len = d.length();
    struts.push({ p: new THREE.Vector3(sx * (w / 2 - 2), -5 - trussH / 2, z + 6), s: new THREE.Vector3(1, 1, len), r: Math.atan2(trussH, 12), diag: true });
  }
  const im = new THREE.InstancedMesh(strut, hullMat, struts.length); const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  struts.forEach((s, i) => { _e.set(s.diag ? s.r : 0, 0, 0); _q.setFromEuler(_e); _m.compose(s.p, _q, s.s.clone().multiply(new THREE.Vector3(1, 1, 1))); im.setMatrixAt(i, _m); });
  im.castShadow = true; root.add(im);
  // pylons down to the ground / sea
  const pyl = new THREE.CylinderGeometry(3, 4, 1, 14), pylMat = hullMat; disposables.push(pyl);
  const rows = Math.max(3, Math.round(l / 85));
  for (let r = 0; r < rows; r++) for (const sx of [-1, 1]) {
    const z = -cfg.fwd + 12 + (r * (l - 24)) / (rows - 1);
    const wp = new THREE.Vector3(sx * (w / 2 - 6), 0, z).applyQuaternion(root.quaternion).add(root.position);
    const gy = Math.min(course.groundHeight(wp.x, wp.z), deckY - 10), hgt = deckY - 5 - gy + 14;
    const p = new THREE.Mesh(pyl, pylMat); p.scale.set(1, hgt, 1); p.position.set(sx * (w / 2 - 6), -5 - hgt / 2 + 8, z); p.castShadow = true; root.add(p);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 3, 14), accent); band.position.set(sx * (w / 2 - 6), -9, z); root.add(band); disposables.push(band.geometry);
  }

  // ---- start gantry at the line: two towers, a crossbar with a checkered banner and three lamps facing the grid (behind, +z)
  const towerH = 46, gantry = new THREE.Group(); gantry.position.set(0, 0, 0); root.add(gantry);
  const tw = new THREE.BoxGeometry(3, towerH, 3); disposables.push(tw);
  for (const sx of [-1, 1]) { const t = new THREE.Mesh(tw, hullMat); t.position.set(sx * (w / 2 + 3), towerH / 2, 0); t.castShadow = true; gantry.add(t); }
  const barGeo = new THREE.BoxGeometry(w + 12, 6, 3.2); const bar = new THREE.Mesh(barGeo, hullMat); bar.position.set(0, towerH - 3, 0); bar.castShadow = true; gantry.add(bar); disposables.push(barGeo);
  const bt = (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const g = c.getContext('2d');
    for (let i = 0; i < 64; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#111'; g.fillRect(i * 16, j * 16, 16, 16); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
  })();
  const bannerGeo = new THREE.PlaneGeometry(w + 12, 4), bannerMat = new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide, toneMapped: true });
  const banner = new THREE.Mesh(bannerGeo, bannerMat); banner.position.set(0, towerH - 3, 1.7); gantry.add(banner);
  const banner2 = banner.clone(); banner2.position.z = -1.7; banner2.rotation.y = Math.PI; gantry.add(banner2);
  disposables.push(bt, bannerGeo, bannerMat);
  const lampGeo = new THREE.CircleGeometry(3.4, 24); disposables.push(lampGeo);
  const lamps = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.02, 0.02), toneMapped: false });
    const lamp = new THREE.Mesh(lampGeo, m); lamp.position.set((i - 1) * 9, towerH - 11, 1.8); gantry.add(lamp); lamps.push(m);
    const rim = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.2, 24), hullMat); rim.position.copy(lamp.position); rim.position.z += 0.02; gantry.add(rim); disposables.push(rim.geometry);
    disposables.push(m);
  }
  const OFF = new THREE.Color(0.12, 0.02, 0.02), RED = new THREE.Color(5, 0.25, 0.15), GREEN = new THREE.Color(0.3, 5, 0.6);
  let goT = 0;
  // side lights along the deck (emissive points, one instanced mesh)
  const ld = new THREE.SphereGeometry(0.9, 8, 6), lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.2, 0.6), toneMapped: false }); disposables.push(ld, lm);
  const nl = Math.floor(l / 10) * 2, lights = new THREE.InstancedMesh(ld, lm, nl);
  for (let i = 0; i < nl; i++) { const sx = i & 1 ? 1 : -1, z = -cfg.fwd + 5 + Math.floor(i / 2) * 10; lights.setMatrixAt(i, _m.compose(new THREE.Vector3(sx * (w / 2 + 0.2), 1.9, z), _q.identity(), new THREE.Vector3(1, 1, 1))); }
  root.add(lights);

  const setLamps = (n, green) => { lamps.forEach((m, i) => m.color.copy(green ? GREEN : i < n ? RED : OFF)); };
  setLamps(0, false);
  return {
    group,
    onReady() { goT = 0; setLamps(0, false); },
    onCountdown(n) { setLamps(4 - n, false); },
    onGo() { setLamps(3, true); goT = 3; },
    update(dt) { if (goT > 0) { goT -= dt; if (goT <= 0) setLamps(0, false); } },
    dispose() { for (const d of disposables) d.dispose?.(); },
  };
}
