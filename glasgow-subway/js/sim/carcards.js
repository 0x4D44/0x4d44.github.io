/**
 * Adverts and passenger-information screens inside the train (runtime, onto a TrainView; the GLB is untouched).
 *  - Car-cards: 3:1 cards on the ceiling lining above the windows (the same arc band as the route diagrams), filling each side
 *    of each car between the doors, the route diagrams, the cab and the car ends (models/adverts_cards.jpg, 2 x 4 cells).
 *  - Screens: a small 16:10 screen on the bulkhead beside every gangway, all showing one shared canvas that cycles the
 *    Subway logo, the next station (with the circle and a clock) and the landscape adverts (models/adverts_land.jpg).
 * The meshes are parented to each car's saloon node, so TrainView.cull() hides them with the interior.
 */
import { quadGroups } from './hall.js';
import { planRow, freeIntervals, advertOrder, LAND_POSTERS, ADVERT_GRID } from './adverts.js';

// cross-section, mirrored from tools/assets_train.py (pinned by research/train-dimensions.md): interior lining radius and arch centre height
export const RI = 1.085, CZ = 1.487;
export const CARD = { a0: 50, a1: 64, w: 0.8, gap: 0.15, inset: 0.01 };        // 14 deg of lining at RI = 0.265 m tall: 3:1 at 0.8 m wide
export const CARD_COLS = 2, CARD_ROWS = 4, CARDS = CARD_COLS * CARD_ROWS;
export const SCREEN = { w: 0.22, h: 0.1375, x: 0.775, y: 2.02, px: 512, py: 320 }; // centre |x| on the bulkhead (aperture edge 0.65), height above rail

/** UV rectangle [u0, v0, u1, v1] of a car-card cell (atlas 2048 x 1408, 8 px gutter; v0 = top edge) */
export function cardRect(i) {
  const c = i % CARD_COLS, r = Math.floor(i / CARD_COLS) % CARD_ROWS, iu = 8 / 2048, iv = 8 / 1408;
  return [c / CARD_COLS + iu, r / CARD_ROWS + iv, (c + 1) / CARD_COLS - iu, (r + 1) / CARD_ROWS - iv];
}

/** Matrix taking `node`'s local frame into `anc`'s frame (multiplies the local matrices up the parent chain). */
function relMatrix(THREE, node, anc) {
  const m = new THREE.Matrix4(); for (let n = node; n && n !== anc; n = n.parent) { n.updateMatrix(); m.premultiply(n.matrix); }
  return m;
}

/** Car-frame z intervals [z0, z1] on side +1 / -1 where nothing sits in the card band: the whole saloon less doors, route diagrams, cab and ends. */
export function cardTaken(THREE, tv, ci) {
  const car = tv.cars[ci], sal = tv.byName['car_' + ci + '_saloon']; if (!car || !sal) return null;
  const toCar = relMatrix(THREE, sal, car), box = new THREE.Box3(), v = new THREE.Vector3();
  sal.traverse((m) => { if (m.isMesh && m.geometry) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(relMatrix(THREE, m, car))); } });
  const zc = tv.carInfo[ci].zc, taken = { [-1]: [], [1]: [] };
  for (const dz of tv.doorZ) { const z = dz - zc; if (z > box.min.z && z < box.max.z) for (const s of [-1, 1]) taken[s].push([z - 0.8, z + 0.8]); }
  const cab = tv.byName['car_' + ci + '_cab'];
  if (cab) { const cb = new THREE.Box3(); cab.traverse((m) => { if (m.isMesh && m.geometry) { m.geometry.computeBoundingBox(); cb.union(m.geometry.boundingBox.clone().applyMatrix4(relMatrix(THREE, m, car))); } }); if (!cb.isEmpty()) for (const s of [-1, 1]) taken[s].push([cb.min.z - 0.15, cb.max.z + 0.15]); }
  sal.traverse((m) => {
    if (!m.isMesh || !m.material || m.material.name !== 'route_map_panel') return;
    const pos = m.geometry.attributes.position, M = relMatrix(THREE, m, car);
    for (const vs of quadGroups(m.geometry)) { let x = 0, z0 = 1e9, z1 = -1e9; for (const i of vs) { v.fromBufferAttribute(pos, i).applyMatrix4(M); x += v.x; z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); } taken[x < 0 ? -1 : 1].push([z0 - 0.1, z1 + 0.1]); }
  });
  return { lo: box.min.z + 0.3, hi: box.max.z - 0.3, taken, toCar };
}

/** Appends one card bent round the lining (car frame). */
function addCard(buf, side, z0, z1, rect) {
  const r = RI - CARD.inset, n = 4, base = buf.pos.length / 3, [u0, v0, u1, v1] = rect;
  for (let k = 0; k <= n; k++) {
    const a = (CARD.a0 + (CARD.a1 - CARD.a0) * k / n) * Math.PI / 180, x = side * r * Math.cos(a), y = CZ + r * Math.sin(a), v = v1 + (v0 - v1) * k / n;
    for (const z of [z0, z1]) { buf.pos.push(x, y, z); const fu = side > 0 ? (z - z0) / (z1 - z0) : (z1 - z) / (z1 - z0); buf.uv.push(u0 + (u1 - u0) * fu, v); }
  }
  for (let k = 0; k < n; k++) { const a = base + k * 2; buf.idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
}

/** Bulkhead face z (car frame) at the given end (e = -1 / +1): a ray from the car's middle along z at the screen's spot, against the whole car. */
function bulkheadZ(THREE, tv, ci, e) {
  const car = tv.cars[ci], sal = tv.byName['car_' + ci + '_saloon']; if (!car || !sal) return null;
  car.updateMatrixWorld(true);
  const W = car.matrixWorld, o = new THREE.Vector3(-SCREEN.x, SCREEN.y, 0).applyMatrix4(W), d = new THREE.Vector3(0, 0, e).transformDirection(W);
  const ray = new THREE.Raycaster(o, d, 0.5, 15), meshes = []; car.traverse((m) => { if (m.isMesh && !/_(pis|pis_bezel|cards)$/.test(m.name)) meshes.push(m); });   // the end wall is part of the exterior mesh
  const hit = ray.intersectObjects(meshes, false)[0]; if (!hit) return null;
  return hit.point.clone().applyMatrix4(new THREE.Matrix4().copy(W).invert()).z;
}

/** The shared screen canvas: logo, next station, adverts. update() redraws only when the picture changes (at most once a second). */
export class Pis {
  constructor(THREE, landscape) {
    this.c = document.createElement('canvas'); this.c.width = SCREEN.px; this.c.height = SCREEN.py; this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.land = landscape || null; this.key = ''; this.order = advertOrder('pis', LAND_POSTERS);
    this.update(0, null);
  }
  /** which slide shows at time t (s): a 28 s cycle of logo 4, next 6, advert 6, next 6, advert 6 (adverts replace "next" when there is no info) */
  static slide(t, hasInfo) {
    const T = ((t % 28) + 28) % 28, cyc = Math.floor(t / 28);
    if (T < 4) return { kind: 'logo' };
    if (T < 10) return hasInfo ? { kind: 'next' } : { kind: 'ad', n: cyc * 4 };
    if (T < 16) return { kind: 'ad', n: cyc * 4 + 1 };
    if (T < 22) return hasInfo ? { kind: 'next' } : { kind: 'ad', n: cyc * 4 + 2 };
    return { kind: 'ad', n: cyc * 4 + 3 };
  }
  update(t, info) {
    const s = Pis.slide(t, !!(info && info.next)), clock = new Date().toTimeString().slice(0, 8);
    if (s.kind === 'ad' && !(this.land && this.land.image)) s.kind = 'logo';
    const key = s.kind === 'logo' ? 'logo' : s.kind === 'ad' ? 'ad' + (s.n % LAND_POSTERS) : `next|${info.line}|${info.next}|${info.at}|${clock}`;
    if (key === this.key) return false; this.key = key;
    const g = this.g, W = SCREEN.px, H = SCREEN.py;
    if (s.kind === 'logo') {
      g.fillStyle = '#f2f3f5'; g.fillRect(0, 0, W, H);
      const r = 58, gap = 22; g.font = 'bold 70px Arial, sans-serif'; const tw = g.measureText('Subway').width, cx = (W - (2 * r + gap + tw)) / 2 + r, cy = H / 2;   // roundel + wordmark, centred
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = '#f08a1c'; g.fill();
      g.beginPath(); g.arc(cx, cy, r * 0.8, 0, Math.PI * 2); g.fillStyle = '#3a3f5c'; g.fill();
      g.beginPath(); g.arc(cx, cy, r * 0.56, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
      g.fillStyle = '#f08a1c'; g.font = 'bold 50px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('S', cx, cy + 2);
      g.textAlign = 'left'; g.font = 'bold 70px Arial, sans-serif'; g.fillText('Subway', cx + r + gap, cy + 4);
    } else if (s.kind === 'ad') {
      const cell = this.order[s.n % LAND_POSTERS], im = this.land.image, cs = im.width / ADVERT_GRID, gu = cs * 8 / 512;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      g.drawImage(im, (cell % ADVERT_GRID) * cs + gu, Math.floor(cell / ADVERT_GRID) * cs + gu, cs - 2 * gu, cs - 2 * gu, (W - H * 1.5) / 2, 0, H * 1.5, H);   // the 3:2 poster, letterboxed
    } else {
      g.fillStyle = '#0d0e10'; g.fillRect(0, 0, W, H);
      g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = '#e8e8e8'; g.font = 'bold 34px Arial, sans-serif'; g.fillText(info.line === 'inner' ? 'Inner' : 'Outer', 22, 48);
      g.textAlign = 'right'; g.fillStyle = '#9a9a9a'; g.font = '28px Arial, sans-serif'; g.fillText(clock, W - 22, 46);
      g.textAlign = 'left'; g.fillStyle = '#b8b8b8'; g.font = '34px Arial, sans-serif'; g.fillText(info.at ? 'This is' : 'Next Station', 60, 130);
      let fs = 72; g.font = `bold ${fs}px Arial, sans-serif`; while (g.measureText(info.next).width > W - 80 && fs > 36) { fs -= 4; g.font = `bold ${fs}px Arial, sans-serif`; }
      g.fillStyle = '#ffffff'; g.fillText(info.next, 60, 130 + fs + 10);
      g.fillStyle = '#f08a1c'; g.fillRect(0, H - 14, W, 14);
    }
    this.tex.needsUpdate = true; return true;
  }
}

/**
 * Fits car-cards and screens to a TrainView (once). atlases = { cards, landscape } (either may be null). Returns { cards, screens }.
 */
export function fitTrainAdverts(THREE, tv, atlases, seed = 'train') {
  const res = { cards: 0, screens: 0 };
  if (!tv || !atlases || tv._advertsFitted) return res; tv._advertsFitted = true;
  const order = advertOrder(seed + '/cards', CARDS); let k = 0;
  const cardMat = atlases.cards ? new THREE.MeshLambertMaterial({ name: 'car_card', map: atlases.cards, emissive: 0xffffff, emissiveMap: atlases.cards, emissiveIntensity: 0.25, side: THREE.DoubleSide }) : null;
  tv.pis = new Pis(THREE, atlases.landscape);
  const scrMat = new THREE.MeshBasicMaterial({ name: 'pis_screen', map: tv.pis.tex, toneMapped: false }), bezMat = new THREE.MeshLambertMaterial({ name: 'pis_bezel', color: 0x1b1c1f });
  tv.ownMats = (tv.ownMats || []).concat([cardMat, scrMat, bezMat].filter(Boolean));
  for (let ci = 0; ci < tv.cars.length; ci++) {
    const info = cardTaken(THREE, tv, ci); if (!info) continue;
    const sal = tv.byName['car_' + ci + '_saloon'], toSal = new THREE.Matrix4().copy(info.toCar).invert();
    const add = (geo, mat, name) => { geo.applyMatrix4(toSal); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.name = name; sal.add(m); return m; };
    if (cardMat) {
      const buf = { pos: [], uv: [], idx: [] };
      for (const s of [-1, 1]) for (const f of planRow(freeIntervals(info.taken[s], info.lo, info.hi, 0, CARD.w), [{ kind: 'card', w: CARD.w }], CARD.gap)) { addCard(buf, s, f.z0, f.z1, cardRect(order[k++ % CARDS])); res.cards++; }
      if (buf.idx.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2)); g.setIndex(buf.idx); add(g, cardMat, 'car_' + ci + '_cards'); }
    }
    // screens on each gangway bulkhead (not the cab end), on the -x side of the opening (the SOS box is on +x), facing into the car
    tv.cars[ci].updateMatrixWorld(true);
    const cab = tv.byName['car_' + ci + '_cab'], cabZ = cab ? new THREE.Box3().setFromObject(cab).getCenter(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().copy(tv.cars[ci].matrixWorld).invert()).z : null;
    for (const e of [-1, 1]) {
      if (cabZ != null && Math.sign(cabZ) === e) continue;
      const bz = bulkheadZ(THREE, tv, ci, e); if (bz == null) continue;
      const zf = bz - e * 0.012, sw = SCREEN.w, sh = SCREEN.h, uSign = -e;   // a viewer facing the bulkhead has -e*x on their right
      const scr = new THREE.PlaneGeometry(sw, sh); scr.rotateY(e > 0 ? Math.PI : 0); scr.translate(-SCREEN.x, SCREEN.y, zf);
      const uv = scr.attributes.uv, p = scr.attributes.position; for (let i = 0; i < uv.count; i++) uv.setX(i, uSign > 0 ? (p.getX(i) - (-SCREEN.x - sw / 2)) / sw : ((-SCREEN.x + sw / 2) - p.getX(i)) / sw);
      add(scr, scrMat, 'car_' + ci + '_pis');
      const bez = new THREE.BoxGeometry(sw + 0.03, sh + 0.03, 0.012); bez.translate(-SCREEN.x, SCREEN.y, bz - e * 0.006); add(bez, bezMat, 'car_' + ci + '_pis_bezel');
      res.screens++;
    }
  }
  tv.updatePis = (t, info) => tv.pis.update(t, info);
  return res;
}
