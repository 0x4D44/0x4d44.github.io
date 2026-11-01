// Highland Fling - Nessie. She lurks in Loch Ness (west of the hairpin), dead ahead of the karts hurtling down the long straight.
// When the leading kart comes over the castle hill she rears up, faces the oncoming karts and sprays a fan of water across the road
// (wet sheen + a slippery patch, track.slickAt). If nobody comes by she surfaces now and then anyway.
import * as THREE from "three";
import { TAU, NESS } from "./highland-geo.js";

export function buildNessie(H, { waterY, sm }) {
  const { track, X, rng } = H;
  const { group, anim, own } = X;
  const NX = NESS.x, NZ = NESS.z, NS = NESS.scale, SPLASH_S = NESS.splashS;
  const NK = 1.45;   // neck stretch: she rears up well above the hills behind her, so she shows against the sky from the far end of the straight

  // ---------------------------------------------------------------- the monster (local -z = the way she faces; rotation.y = -PI/2 turns that to world +x)
  const g = new THREE.Group();
  const skin = own(new THREE.MeshLambertMaterial({ color: 0x4f7a5a })), skin2 = own(new THREE.MeshLambertMaterial({ color: 0x62936b })), belly = own(new THREE.MeshLambertMaterial({ color: 0xc2d1a6 }));
  const hump = (x, z, r, sy, ln) => { const m = new THREE.Mesh(own(new THREE.SphereGeometry(r, 12, 8, 0, TAU, 0, Math.PI / 2)), skin); m.scale.set(1, sy, ln); m.position.set(x, 0, z); g.add(m); return m; };
  const h1 = hump(0, 0, 3.4, 0.8, 1.7), h2 = hump(0, 9, 2.8, 0.75, 1.5), h3 = hump(0, 17, 2.1, 0.7, 1.4);
  const neck = new THREE.Group(); neck.position.set(0, 0, -6.5); neck.scale.x = 1.9;   // a fat neck + head, so she reads as a monster from dead ahead
  const segs = [[0, 0, 0, 0.0], [0, 2.2, -0.4, -0.25], [0, 4.4, -1.4, -0.5], [0, 6.2, -3.0, -0.95]];
  segs.forEach(([x, y, z, tilt], i) => { const m = new THREE.Mesh(own(new THREE.CylinderGeometry(0.75 - i * 0.1, 0.95 - i * 0.1, 2.5, 8)), i % 2 ? skin2 : skin); m.position.set(x, y + 1.0, z); m.rotation.x = tilt; neck.add(m); });
  const throat = new THREE.Mesh(own(new THREE.CylinderGeometry(0.5, 0.7, 6.6, 8)), belly); throat.position.set(0, 4.2, 0.45); throat.rotation.x = 0.1; throat.scale.set(0.55, 1, 0.5); neck.add(throat);   // pale throat, seen from the front
  const head = new THREE.Mesh(own(new THREE.SphereGeometry(0.9, 9, 7)), skin2); head.scale.set(0.85, 0.8 / NK, 1.35); head.position.set(0, 8.1, -4.6); neck.add(head);
  const maw = new THREE.Mesh(own(new THREE.SphereGeometry(0.42, 8, 6)), own(new THREE.MeshBasicMaterial({ color: 0x14100e }))); maw.scale.set(1.2, 0.7 / NK, 0.7); maw.position.set(0, 7.85, -5.7); neck.add(maw);
  const eyeM = own(new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(own(new THREE.SphereGeometry(0.4, 7, 5)), eyeM); e.scale.y = 1 / NK; e.position.set(sx * 0.58, 8.4, -5.15); neck.add(e);
    const o = new THREE.Mesh(own(new THREE.CylinderGeometry(0.07, 0.1, 0.7, 4)), skin); o.scale.y = 1 / NK; o.position.set(sx * 0.35, 9.0, -4.4); neck.add(o);
  }
  g.add(neck);
  const ring = own(new THREE.RingGeometry(0.975, 1, 48).rotateX(-Math.PI / 2)), rmat = own(new THREE.MeshBasicMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.35, depthWrite: false }));
  const rings = [0, 1, 2].map(() => { const m = new THREE.Mesh(ring, rmat.clone()); m.position.y = 0.05; g.add(m); return m; });
  g.position.set(NX, waterY - 0.15, NZ); g.rotation.y = -Math.PI / 2; g.scale.setScalar(NS); g.name = "nessie"; group.add(g);

  // ---------------------------------------------------------------- the jet: a fan of ballistic drops lobbed from her mouth onto the road ahead of her
  const SP = { N: 260, G: 15 };
  const mouth = new THREE.Vector3(NX + 12.0 * NS, waterY - 0.15 + 8.2 * NS * NK, NZ);
  const gy = X.groundY;
  const dropG = own(new THREE.SphereGeometry(0.5, 6, 4)), dropM = own(new THREE.MeshBasicMaterial({ color: 0xd6ecf8, transparent: true, opacity: 0.78, depthWrite: false }));
  const drops = new THREE.InstancedMesh(dropG, dropM, SP.N); drops.frustumCulled = false; drops.visible = false; drops.name = "nessie-spray"; drops.renderOrder = 4; group.add(drops);
  // each drop has its own landing spot on the road (spread along ~100 m and across its width), its own lob angle, and the speed that makes it land there
  const dr = Array.from({ length: SP.N }, () => {
    const sL = SPLASH_S - 45 + rng() * 100, lat = (rng() * 2 - 1) * (X.hw - 1.5), q = track.sample(sL);
    const tx = q.pos.x + q.right.x * lat, tz = q.pos.z + q.right.z * lat, dx = tx - mouth.x, dz = tz - mouth.z, R = Math.hypot(dx, dz), az = Math.atan2(dz, dx);
    const th = 0.42 + rng() * 0.3, h0 = Math.max(2, mouth.y - gy(tx, tz)), c = Math.cos(th);
    const v = Math.sqrt(0.5 * SP.G * R * R / (c * c * (h0 + R * Math.tan(th)))), T = R / (v * c);
    return { ph: rng(), az: az + (rng() - 0.5) * 0.012, vh: v * c, vv: v * Math.sin(th), T, sz: 0.85 + rng() * 0.9 };
  });
  // wet sheen laid over the road where she soaks it (fades back out as it dries)
  const sheenS = new X.Strips(X.C);
  { const i0 = Math.round((SPLASH_S - 80) / X.C.ds), n = Math.round(160 / X.C.ds); sheenS.add({ profile: [[-X.hw, 0.045, 0], [X.hw, 0.045, 1]], from: ((i0 % X.C.N) + X.C.N) % X.C.N, count: n, tile: 8, color: () => [1, 1, 1] }); }
  const sheenM = own(new THREE.MeshBasicMaterial({ color: 0x486f94, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
  const sheen = new THREE.Mesh(own(sheenS.geometry()), sheenM); sheen.renderOrder = 2; sheen.visible = false; group.add(sheen);

  // ---------------------------------------------------------------- behaviour: down -> rising -> up (spraying) -> falling -> down
  const RISE = 2.6, HOLD = 11, FALL = 2.6, GAP = 12, IDLE_MAX = 38;
  let up = false, pt = 0, downFor = GAP, wet = 0, trigger = false;
  track.slickAt = (s) => {
    if (!up && downFor >= GAP && s > 1040 && s < 1150) trigger = true;   // the leader has come over the castle hill: she's coming up for them
    if (wet < 0.01) return 1;
    let d = Math.abs(s - SPLASH_S); d = Math.min(d, track.length - d);
    return 1 - 0.8 * wet * (1 - sm(30, 75, d));
  };
  const dm = new THREE.Matrix4();
  anim.push((dt, t) => {
    if (up) { pt += dt; if (pt > RISE + HOLD + FALL) { up = false; downFor = 0; pt = 0; } }
    else { downFor += dt; if (trigger || downFor > IDLE_MAX) { up = true; pt = 0; } }
    trigger = false;
    const lift = up ? sm(0, RISE, pt) * (1 - sm(RISE + HOLD, RISE + HOLD + FALL, pt)) : 0;
    const env = up ? sm(1.9, 2.7, pt) * (1 - sm(RISE + HOLD - 1.4, RISE + HOLD - 0.2, pt)) : 0;
    // she bobs low in the water when idle and heaves herself up when she rises
    g.position.y = waterY - 0.15 - (1 - lift) * 2.1 * NS + Math.sin(t * 0.7) * 0.18 * NS * 0.5;
    neck.scale.y = Math.max(0.001, lift * NK); neck.scale.x = 1.9; neck.visible = lift > 0.01; neck.position.y = -0.4 + 0.4 * lift;
    h1.position.y = Math.sin(t * 0.7 + 1) * 0.1; h2.position.y = Math.sin(t * 0.7 + 2) * 0.12 - 0.05; h3.position.y = Math.sin(t * 0.7 + 3) * 0.1 - 0.1;
    rings.forEach((r, i) => { const f = ((t * 0.18 + i / 3) % 1); r.scale.set(4 + f * 11, 1, 6 + f * 16); r.position.z = 9; r.material.opacity = 0.4 * (1 - f) * Math.min(1, f * 6) * (0.4 + 0.6 * lift); });
    // the spray soaks the road while it lasts, then dries slowly
    if (env > wet) wet = env; else wet = Math.max(0, wet - dt / 9);
    drops.visible = env > 0.01;
    if (drops.visible) {
      for (let i = 0; i < SP.N; i++) {
        const q = dr[i], age = ((t / q.T + q.ph) % 1) * q.T, h = q.vh * age;
        const x = mouth.x + Math.cos(q.az) * h, z = mouth.z + Math.sin(q.az) * h, y = mouth.y + q.vv * age - 0.5 * SP.G * age * age;
        const s = y > gy(x, z) + 0.1 ? q.sz * env * (0.3 + 0.7 * age / q.T) : 0;   // thin at her mouth, fat by the time it lands on you
        dm.makeScale(s, s, s); dm.setPosition(x, y, z); drops.setMatrixAt(i, dm);
      }
      drops.instanceMatrix.needsUpdate = true;
    }
    sheen.visible = wet > 0.02; sheenM.opacity = 0.42 * Math.min(1, wet * 1.3);
  });
  H.nessie = { group: g, mouth };
}
