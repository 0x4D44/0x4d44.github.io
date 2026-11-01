// Developer preview (dev/garments/size-compare.html): the shipped LOD models (the ones the interiors draw) of the child, teen (small, big) and adult libraries, laid flat and seen from above at one
// physical scale, so the four sizes of a garment can be compared by eye. Ten rows: six garments every library has, four that only the child and teen libraries have. Not part of the game.
// Capture the sheet with `node la-ladera/tests/garments-size-compare.mjs` (needs CHROME_PATH), or open the page from any static server of the repository root.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GARMENTS, GARMENT_FILES } from '../../js/interiors/garments_data.js';

// [row label, child, teen small, teen big, adult (null: the adult library has no such garment)] as ids of the data module
const ROWS = [
  ['T-shirt', 'child_tshirt', 'tshirt_cream_small', 'tshirt_cream_big', 'tshirt'],
  ['Shorts', 'child_school_shorts', 'shorts_chino_small', 'shorts_chino_big', 'shorts'],
  ['Swim shorts', 'child_swim_trunks', 'swim_shorts_small', 'swim_shorts_big', 'swim_trunks'],
  ['One-piece swimsuit', 'child_swimsuit_onepiece', 'swim_onepiece_small', 'swim_onepiece_big', 'swimsuit_onepiece'],
  ['Socks (pair)', 'child_socks_pair', 'socks_pair_small', 'socks_pair_big', 'socks_pair'],
  ['Cap', 'child_cap', 'cap_small', 'cap_big', 'cap'],
  ['Jeans', 'child_jeans', 'denim_jeans_small', 'denim_jeans_big', null],
  ['Dress', 'child_dress', 'dress_midi_small', 'dress_midi_big', null],
  ['Hoodie', 'child_hoodie', 'hoodie_small', 'hoodie_big', null],
  ['Shoes (pair)', 'child_shoes', 'school_shoes_pair_small', 'school_shoes_pair_big', null],
];
const COLUMNS = [
  { title: 'Child', note: 'about 6 to 10, 60% of adult', tint: '#d9a441' },
  { title: 'Teen, small', note: 'about 12 to 15, 70%', tint: '#6fb5ae' },
  { title: 'Teen, big', note: 'about 16 to 19, 90%', tint: '#2f7770' },
  { title: 'Adult', note: '100%', tint: '#8f877c' },
];
const PX_PER_M = 200, CELL_W = 330, CELL_H = 250, LABEL = 178, HEAD = 96, FOOT = 74;
const status = document.getElementById('status'), errorBox = document.getElementById('error');

async function main() {
  const loader = new GLTFLoader(), files = new Map();
  for (const tag of ['adult', 'child', 'teen']) {
    const path = GARMENT_FILES[tag].flat;
    if (!files.has(path)) files.set(path, await loader.loadAsync(`../../assets/models/${path}`));
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(CELL_W, CELL_H, false); renderer.setClearColor('#f6f3ec');
  const camera = new THREE.OrthographicCamera(-CELL_W / 2 / PX_PER_M, CELL_W / 2 / PX_PER_M, CELL_H / 2 / PX_PER_M, -CELL_H / 2 / PX_PER_M, 0.1, 10);
  camera.position.set(0, 5, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);     // from above; the garment's front (+z) is down the page
  const sheet = document.createElement('canvas'), g = sheet.getContext('2d');
  sheet.width = LABEL + COLUMNS.length * CELL_W; sheet.height = HEAD + ROWS.length * CELL_H + FOOT;
  g.fillStyle = '#f6f3ec'; g.fillRect(0, 0, sheet.width, sheet.height);
  g.fillStyle = '#282d2c'; g.font = '600 26px system-ui, sans-serif'; g.fillText('La Ladera garments · four sizes at one physical scale', 20, 38);
  g.fillStyle = '#626962'; g.font = '15px system-ui, sans-serif';
  g.fillText('Shipped LOD models laid flat, seen from above (front down the page). Each size is its own model; nothing is scaled again when it is placed.', 20, 62);
  COLUMNS.forEach((c, i) => {
    g.fillStyle = c.tint; g.fillRect(LABEL + i * CELL_W + 14, HEAD - 28, 14, 14);
    g.fillStyle = '#282d2c'; g.font = '600 15px system-ui, sans-serif'; g.fillText(c.title, LABEL + i * CELL_W + 34, HEAD - 16);
    g.fillStyle = '#626962'; g.font = '12px system-ui, sans-serif'; g.fillText(c.note, LABEL + i * CELL_W + 34, HEAD - 2);
  });
  const cells = [];
  for (const [r, row] of ROWS.entries()) {
    const y = HEAD + r * CELL_H;
    g.fillStyle = '#282d2c'; g.font = '600 15px system-ui, sans-serif'; g.fillText(row[0], 20, y + CELL_H / 2 + 5);
    for (let c = 0; c < COLUMNS.length; c++) {
      const id = row[1 + c], x = LABEL + c * CELL_W;
      const frame = () => { g.strokeStyle = '#d9d3c6'; g.lineWidth = 1; g.strokeRect(x + .5, y + .5, CELL_W - 1, CELL_H - 1); };      // (after the render: the picture would cover it)
      if (!id) { frame(); g.fillStyle = '#9a9288'; g.font = 'italic 13px system-ui, sans-serif'; g.fillText('no adult counterpart', x + 98, y + CELL_H / 2 + 4); continue; }
      const design = GARMENTS[id], key = `garment_${id}_flat`, root = files.get(GARMENT_FILES[design.sizeTag].flat).scene.getObjectByName(`${key}_lod`);
      if (!root) throw new Error(`${key}_lod is not in ${GARMENT_FILES[design.sizeTag].flat}`);
      const scene = new THREE.Scene(), model = root.clone(true), material = new THREE.MeshLambertMaterial({ vertexColors: true, color: COLUMNS[c].tint, side: THREE.DoubleSide });
      model.traverse((o) => { if (o.isMesh) o.material = material; });
      const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(0.6, 4, 1.2);
      scene.add(model, new THREE.AmbientLight('#ffffff', 1.1), sun);
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
      renderer.render(scene, camera);
      g.drawImage(renderer.domElement, x, y);
      frame();
      const [dw, , dd] = design.flat;
      g.fillStyle = '#282d2c'; g.font = '12px ui-monospace, monospace'; g.textAlign = 'center';
      g.fillText(`${Math.round(size.x * 100)} x ${Math.round(size.z * 100)} cm`, x + CELL_W / 2, y + CELL_H - 8); g.textAlign = 'left';
      cells.push({ row: row[0], column: COLUMNS[c].title, id, key, measuredCm: [size.x, size.z].map((v) => Math.round(v * 1000) / 10), dataCm: [dw, dd].map((v) => Math.round(v * 1000) / 10), triangles: design.flat[3] });
      material.dispose();
    }
  }
  const baseY = HEAD + ROWS.length * CELL_H + 30;                                       // the scale bar: 50 cm, a tick every 10 cm
  g.strokeStyle = '#282d2c'; g.lineWidth = 2; g.beginPath(); g.moveTo(20, baseY); g.lineTo(20 + PX_PER_M / 2, baseY); g.stroke();
  for (let i = 0; i <= 5; i++) { g.beginPath(); g.moveTo(20 + i * PX_PER_M / 10, baseY - 5); g.lineTo(20 + i * PX_PER_M / 10, baseY + 5); g.stroke(); }
  g.fillStyle = '#282d2c'; g.font = '13px system-ui, sans-serif'; g.fillText('50 cm', 20 + PX_PER_M / 2 + 12, baseY + 4);
  g.fillStyle = '#626962'; g.fillText(`${PX_PER_M} px = 1 m. Sizes are the measured width x length of the model in the data module (js/interiors/garments_data.js).`, 190, baseY + 4);
  const dataUrl = sheet.toDataURL('image/jpeg', 0.92);
  document.getElementById('sheet').src = dataUrl;
  status.textContent = `${cells.length} models at ${PX_PER_M} px per metre`;
  window.__sizeCompare = { ready: true, dataUrl, pxPerMetre: PX_PER_M, cells, revision: THREE.REVISION };
}
main().catch((e) => { errorBox.textContent = e.stack || String(e); window.__sizeCompare = { ready: false, error: e.stack || String(e) }; });
