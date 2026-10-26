// Tiny stadium-oval Track implementing the contract (clockwise, right turns). Dev only.
import * as THREE from "three";
const L = 300, R = 70, HALF = 10, WALL = 13;
const LEN = 2 * L + 2 * Math.PI * R;
const wrap = (s) => ((s % LEN) + LEN) % LEN;
export function createFakeTrack() {
  const group = new THREE.Group();
  const road = new THREE.Mesh(new THREE.RingGeometry(R - HALF, R + HALF, 48), new THREE.MeshStandardMaterial({ color: 0x444a52 }));
  // build as stadium: two half rings + two strips
  const mk = (geom, x, z, rot) => { const m = new THREE.Mesh(geom, road.material); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z); if (rot) m.rotation.z = rot; group.add(m); return m; };
  mk(new THREE.RingGeometry(R - HALF, R + HALF, 64, 1, 0, Math.PI), 0, L / 2).rotation.set(-Math.PI / 2, 0, 0);
  const rb = mk(new THREE.RingGeometry(R - HALF, R + HALF, 64, 1, Math.PI, Math.PI), 0, -L / 2);
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, L), road.material); m.rotation.x = -Math.PI / 2; m.position.set(sx * R, 0.01, 0); group.add(m); }
  // wall markers
  const wm = new THREE.MeshStandardMaterial({ color: 0xcc3333 });
  for (let s = 0; s < LEN; s += 6) for (const side of [-1, 1]) {
    const p = pointAt(s); const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 4), wm);
    m.position.set(p.x + p.rx * side * WALL, 0.6, p.z + p.rz * side * WALL); m.rotation.y = p.h; group.add(m);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x3d7a3a })); ground.rotation.x = -Math.PI / 2; group.add(ground);
  // s -> pose
  function pointAt(s) {
    s = wrap(s); let x, z, h;
    if (s < L) { x = R; z = -L / 2 + s; h = 0; }
    else if (s < L + Math.PI * R) { const phi = (s - L) / R; x = R * Math.cos(phi); z = L / 2 + R * Math.sin(phi); h = -phi; }
    else if (s < 2 * L + Math.PI * R) { x = -R; z = L / 2 - (s - L - Math.PI * R); h = -Math.PI; }
    else { const phi = (s - 2 * L - Math.PI * R) / R; x = -R * Math.cos(phi); z = -L / 2 - R * Math.sin(phi); h = -Math.PI - phi; }
    return { x, z, h, tx: Math.sin(h), tz: Math.cos(h), rx: -Math.cos(h), rz: Math.sin(h) };
  }
  const tmp = { pos: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), halfWidth: HALF, wallDist: WALL };
  const boostPads = [{ s: 100, lateral: 0, length: 12, width: 6 }];
  const track = {
    id: "fake", name: "Fake Oval", laps: 3, length: LEN, def: {}, group, boostPads, itemBoxes: [],
    setupScene(scene) { scene.background = new THREE.Color(0x87b6e8); const a = new THREE.HemisphereLight(0xffffff, 0x446644, 1.2); const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(50, 100, 30); scene.add(a, d); return () => { scene.remove(a, d); }; },
    sample(s) { const p = pointAt(s); tmp.pos.set(p.x, 0, p.z); tmp.tangent.set(p.tx, 0, p.tz); tmp.right.set(p.rx, 0, p.rz); return tmp; },
    locate(pos) {
      const x = pos.x, z = pos.z; let s, lat;
      if (z > L / 2) { const phi = Math.atan2(z - L / 2, x); const r = Math.hypot(x, z - L / 2); s = L + phi * R; lat = R - r; }
      else if (z < -L / 2) { const phi = Math.atan2(-(z + L / 2), -x); const r = Math.hypot(x, z + L / 2); s = 2 * L + Math.PI * R + phi * R; lat = R - r; }
      else if (x >= 0) { s = z + L / 2; lat = R - x; }
      else { s = L + Math.PI * R + (L / 2 - z); lat = x + R; }
      s = wrap(s);
      const a = Math.abs(lat);
      const boost = s > 100 && s < 112 && a < 3;
      return { s, lateral: lat, halfWidth: HALF, wallDist: WALL, onRoad: a <= HALF, surface: boost ? "boost" : (a <= HALF ? "road" : "grass"), boost, dist: a };
    },
    grid(i) { const p = pointAt(-8 - Math.floor(i / 2) * 8); const lat = (i % 2 ? 3 : -3); return { pos: new THREE.Vector3(p.x + p.rx * lat, 0, p.z + p.rz * lat), heading: p.h }; },
    aiLine() { return 0; }, curvature(s) { s = wrap(s); return (s >= L && s < L + Math.PI * R) || s >= 2 * L + Math.PI * R ? 1 / R : 0; },
    minimap: [], bounds: { minX: -100, maxX: 100, minZ: -250, maxZ: 250 }, update() {},
  };
  return track;
}
