// Street scene above a station entrance: terrain patch, entrance kiosk model, city chunks (if present) or
// a procedural tenement block, sky, sun. Returns { scene, update(), ground(x,z), spawn, stair, dispose }.
import { mulberry32, hashStr, clamp } from './util.js';
import { canvasTex } from './gfx.js';

export async function buildStreet(THREE, o) {
  const { entrance, station, terrain, GLTFLoader, kioskTpl, base } = o;
  const scene = new THREE.Scene();
  const sky = new THREE.Color(0xa9c4dc); scene.background = sky; scene.fog = new THREE.Fog(0xb7cadb, 60, 380);
  scene.add(new THREE.HemisphereLight(0xdbe9ff, 0x6a6258, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); sun.position.set(-80, 120, 60); scene.add(sun);
  const ex = entrance.x, ez = entrance.z;
  const gh = (x, z) => { const h = terrain && terrain.groundHeight ? terrain.groundHeight(x, z) : 0; return h > 0.5 ? h : (station.surfaceY || 20); };
  const y0 = gh(ex, ez);
  const group = new THREE.Group(); scene.add(group);
  const dispose = [];
  let cityLoaded = false;
  // try city chunks around the entrance
  try {
    const man = await (await fetch(new URL(base + 'data/city/manifest.json', location.href))).json();
    const near = (man.chunks || []).filter((c) => c.maxX > ex - 260 && c.minX < ex + 260 && c.maxZ > ez - 260 && c.minZ < ez + 260).slice(0, 9);
    for (const c of near) {
      const gltf = await new Promise((res, rej) => new GLTFLoader().load(new URL(base + 'data/city/' + c.file, location.href).href, res, undefined, rej));
      group.add(gltf.scene); cityLoaded = true;
    }
  } catch (e) { /* no city yet: procedural */ }
  const rng = mulberry32(hashStr(station.id));
  const ground = (x, z) => (cityLoaded ? gh(x, z) : gh(x, z));
  if (!cityLoaded) {
    // terrain patch
    const N = 48, S = 280, geo = new THREE.PlaneGeometry(S, S, N, N); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, colr = [];
    for (let i = 0; i < pos.count; i++) { const x = ex + pos.getX(i), z = ez + pos.getZ(i); pos.setXYZ(i, x, gh(x, z) - 0.05, z); const v = 0.85 + rng() * 0.1; colr.push(0.36 * v, 0.42 * v, 0.3 * v); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
    group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
    // pavement plaza + road
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(24, 40), new THREE.MeshLambertMaterial({ color: 0x8c8a86 })); plaza.rotation.x = -Math.PI / 2; plaza.position.set(ex, y0 + 0.02, ez); group.add(plaza);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 260), new THREE.MeshLambertMaterial({ color: 0x3a3b3e })); road.rotation.x = -Math.PI / 2; road.position.set(ex + 22, y0 + 0.04, ez); group.add(road);
    // tenements
    const stoneTex = canvasTex(THREE, 256, 256, (g, w, h) => {
      g.fillStyle = '#b79a7a'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) { g.fillStyle = '#2a3342'; g.fillRect(x * 64 + 14, y * 51 + 10, 36, 32); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x * 64 + 14, y * 51 + 10, 36, 4); }
      g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 600; i++) g.fillRect(rng() * w, rng() * h, 3, 2);
    }, { repeat: true });
    const roofM = new THREE.MeshLambertMaterial({ color: 0x4d4b52 });
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, r = 46 + rng() * 90; const bx = ex + Math.cos(a) * r, bz = ez + Math.sin(a) * r;
      if (Math.abs(bx - (ex + 22)) < 12 || Math.abs(bx - ex) < 22 && bz > ez - 30) continue;
      const w = 16 + rng() * 14, d = 12 + rng() * 10, h = 15 + rng() * 14;
      const t = stoneTex.clone(); t.needsUpdate = true; t.repeat.set(w / 14, h / 14);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ map: t, color: new THREE.Color().setHSL(0.07 + rng() * 0.04, 0.3, 0.55 + rng() * 0.15) }));
      m.position.set(bx, gh(bx, bz) + h / 2, bz); m.rotation.y = Math.atan2(ex - bx, ez - bz) * 0.5; group.add(m);
      const rf = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 1.2, d + 0.6), roofM); rf.position.set(bx, gh(bx, bz) + h + 0.6, bz); rf.rotation.y = m.rotation.y; group.add(rf);
    }
  }
  // kiosk
  let stairPos = new THREE.Vector3(ex, y0, ez + 2), kiosk = null;
  if (kioskTpl) {
    kiosk = kioskTpl.clone(true); kiosk.position.set(ex, y0 + 0.03, ez); kiosk.rotation.y = Math.PI / 2; group.add(kiosk);
    kiosk.updateMatrixWorld(true);
    const sw = kiosk.getObjectByName('stair_top'); if (sw) { stairPos = new THREE.Vector3(); sw.getWorldPosition(stairPos); }
    // station name plates
    const fas = kiosk.getObjectByName('sign_fascia'), pyl = kiosk.getObjectByName('pylon_roundel');
    const nameTex = canvasTex(THREE, 512, 128, (g, w, h) => { g.fillStyle = '#0f2a4a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '600 60px Arial'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(station.name, w / 2, h / 2 + 2); });
    nameTex.flipY = false;
    for (const n of [fas]) if (n) n.traverse((m) => { if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ map: nameTex }); });
  } else {
    const b = new THREE.Mesh(new THREE.BoxGeometry(5, 3.3, 3), new THREE.MeshLambertMaterial({ color: 0xe8741a })); b.position.set(ex, y0 + 1.65, ez + 1); group.add(b);
  }
  const center = new THREE.Vector3(ex, y0, ez);
  let spawn = { x: ex + (kiosk ? -1.5 : 0), z: ez - 7.5, yaw: Math.PI, y: y0 };
  if (kiosk) { const sp = kiosk.localToWorld(new THREE.Vector3(0, 0, 9)); const dx = ex - sp.x, dz = ez - sp.z; spawn = { x: sp.x, z: sp.z, yaw: Math.atan2(-dx, -dz), y: gh(sp.x, sp.z) }; }
  return {
    scene, ground: gh, spawn, stair: stairPos, center, radius: 85,
    update(t) {}, dispose() { scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
