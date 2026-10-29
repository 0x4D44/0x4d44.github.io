// Highland Fling - the kilted piper beside the start/finish arch. Appears (and plays) only on the player's FINAL lap.
// Hook: track.onRaceStart(race, player, audio, game) is called by main.js when a race is created.
import * as THREE from "three";
import { TAU } from "./highland-geo.js";
import { tartanCanvas, TARTAN_RED, toTexture } from "./highland-tex.js";

export function buildPiper(H) {
  const { track, X, K } = H;
  const { group, bake, part, own, anim, wallDist } = X;
  const { at } = K, gy = X.groundY;

  // ---------------------------------------------------------------- placement beside the arch (opposite the grandstand)
  const gs = X.grandstand, sideSign = -gs.side;
  const sPos = 2.8, a = at(sPos, sideSign * (wallDist + 2.7));
  const toRoad = new THREE.Vector3(-sideSign * a.rx, 0, -sideSign * a.rz), back = new THREE.Vector3(-Math.sin(a.h), 0, -Math.cos(a.h));
  const face = toRoad.clone().multiplyScalar(0.8).add(back.clone().multiplyScalar(0.6));
  const yaw = Math.atan2(face.x, face.z);
  const baseY = Math.max(gy(a.x, a.z), a.y - 0.1);
  const SCALE = 1.3;

  const root = new THREE.Group(); root.position.set(a.x, baseY, a.z); root.rotation.y = yaw; root.name = "piper";
  const figure = new THREE.Group(); figure.scale.setScalar(SCALE); root.add(figure);

  // helpers (local coords, metres, facing +z)
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0), One = new THREE.Vector3(1, 1, 1);
  const place = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const limb = (p0, p1, r0, r1, hex, seg = 8) => {
    const d = new THREE.Vector3().subVectors(p1, p0), l = d.length(); Q.setFromUnitVectors(U, d.clone().normalize());
    const g = new THREE.CylinderGeometry(r1, r0, l, seg); M.compose(V.copy(p0).add(p1).multiplyScalar(0.5).clone(), Q, One);
    return { g, m: M.clone(), c: new THREE.Color(hex) };
  };
  const ball = (x, y, z, r, hex, sx = 1, sy = 1, sz = 1) => part(new THREE.SphereGeometry(r, 10, 8), place(x, y, z, sx, sy, sz), hex);
  const cyl = (x, y, z, rt, rb, h, hex, rx = 0, ry = 0, rz = 0, seg = 8) => part(new THREE.CylinderGeometry(rt, rb, h, seg), place(x, y, z, 1, 1, 1, rx, ry, rz), hex);
  const box = (x, y, z, w, h, d, hex, rx = 0, ry = 0, rz = 0) => part(new THREE.BoxGeometry(w, h, d), place(x, y, z, 1, 1, 1, rx, ry, rz), hex);
  const lam = (o) => own(new THREE.MeshLambertMaterial(o));
  const vmat = lam({ vertexColors: true });
  const tt = own(toTexture(tartanCanvas(128, TARTAN_RED))); tt.repeat.set(2.4, 1.4);
  const tmat = lam({ map: tt, side: THREE.DoubleSide });
  const tt2 = own(toTexture(tartanCanvas(128, TARTAN_RED))); tt2.repeat.set(1, 1);
  const tmat2 = lam({ map: tt2 });
  const meshOf = (parts, m = vmat) => new THREE.Mesh(own(bake(parts)), m);

  const SKIN = 0xe9b896, BLACK = 0x17171a, GREEN = 0x1f4a33, WHITE = 0xf2efe6, GOLD = 0xc8a030, GINGER = 0xc4601f, WOOD = 0x2a1a12, IVORY = 0xefe6cc;

  // plinth / rug
  figure.add(meshOf([cyl(0, 0.07, 0, 1.0, 1.1, 0.14, 0x6b4a2c, 0, 0, 0, 16), cyl(0, 0.15, 0, 0.9, 0.9, 0.03, 0x8a1c24, 0, 0, 0, 16)]));
  // legs, socks (diced red/white hose), brogues, sporran, kilt, belt
  const legs = [];
  for (const sx of [-1, 1]) {
    if (sx > 0) continue;   // right leg is its own animated group (foot tap)
    legs.push(limb(new THREE.Vector3(sx * 0.11, 0.17, 0), new THREE.Vector3(sx * 0.11, 0.62, 0), 0.07, 0.085, 0xb3202a), limb(new THREE.Vector3(sx * 0.11, 0.38, 0), new THREE.Vector3(sx * 0.11, 0.44, 0), 0.075, 0.075, WHITE));
    legs.push(box(sx * 0.11, 0.1, 0.07, 0.11, 0.07, 0.28, BLACK), cyl(sx * 0.11, 0.62, 0, 0.09, 0.09, 0.04, WHITE));
  }
  figure.add(meshOf(legs));
  const footR = new THREE.Group(); footR.position.set(0.11, 0.62, 0);   // pivot at the knee
  footR.add(meshOf([limb(new THREE.Vector3(0, -0.45, 0), new THREE.Vector3(0, 0, 0), 0.07, 0.085, 0xb3202a), limb(new THREE.Vector3(0, -0.24, 0), new THREE.Vector3(0, -0.18, 0), 0.075, 0.075, WHITE), box(0, -0.52, 0.07, 0.11, 0.07, 0.28, BLACK)]));
  figure.add(footR);
  const kilt = new THREE.Mesh(own(new THREE.CylinderGeometry(0.255, 0.34, 0.5, 24, 1, true)), tmat); kilt.position.y = 0.82; figure.add(kilt);
  const kiltTop = new THREE.Mesh(own(new THREE.CylinderGeometry(0.255, 0.255, 0.02, 24)), tmat2); kiltTop.position.y = 1.06; figure.add(kiltTop);
  const sporran = [ball(0, 0.88, 0.31, 0.1, 0xe8e2d4, 1, 1.3, 0.7), box(0, 1.02, 0.28, 0.12, 0.05, 0.05, GOLD)];
  for (let i = 0; i < 6; i++) sporran.push(cyl((i - 2.5) * 0.028, 0.77, 0.33, 0.008, 0.008, 0.16, BLACK));
  figure.add(meshOf(sporran));
  figure.add(meshOf([cyl(0, 1.06, 0, 0.262, 0.262, 0.06, BLACK, 0, 0, 0, 24), box(0, 1.06, 0.262, 0.07, 0.06, 0.02, GOLD)]));

  // ---------------------------------------------------------------- upper body (rocks about the hips)
  const upper = new THREE.Group(); upper.position.set(0, 1.06, 0); figure.add(upper);
  const U0 = 1.06;   // local y -> subtract
  const torso = [
    part(new THREE.BoxGeometry(0.44, 0.52, 0.27), place(0, 1.33 - U0, 0), GREEN),
    box(0, 1.1 - U0 + 0.03, 0, 0.46, 0.14, 0.29, GREEN),
    box(0, 1.5 - U0, 0.135, 0.12, 0.22, 0.02, WHITE),                    // shirt front
    ball(0, 1.62 - U0, 0, 0.065, SKIN, 1, 1, 1),
    part(new THREE.BoxGeometry(0.03, 0.02, 0.02), place(0, 1.3 - U0, 0.14), GOLD), ...[1.22, 1.32, 1.42].map((y) => ball(0, y - U0, 0.14, 0.014, GOLD)),
  ];
  upper.add(meshOf(torso));
  // plaid sash across the shoulder
  const sash = new THREE.Mesh(own(new THREE.BoxGeometry(0.1, 0.62, 0.32)), tmat2); sash.position.set(0.0, 1.33 - U0, 0); sash.rotation.z = 0.7; sash.scale.set(1, 1, 1); upper.add(sash);
  // head, face, ginger beard, tam o' shanter
  const head = new THREE.Group(); head.position.set(0, 1.7 - U0, 0.015); upper.add(head);
  const cheeks = [ball(-0.07, -0.03, 0.09, 0.05, SKIN), ball(0.07, -0.03, 0.09, 0.05, SKIN)];
  const hp = [
    ball(0, 0, 0, 0.115, SKIN, 0.95, 1.05, 1), ball(0, -0.09, 0.07, 0.085, GINGER, 1.05, 0.95, 0.8), ball(0, 0.0, 0.115, 0.022, 0xd9a07c),
    ball(-0.045, 0.03, 0.098, 0.012, 0x111111), ball(0.045, 0.03, 0.098, 0.012, 0x111111),
    box(-0.045, 0.062, 0.1, 0.05, 0.012, 0.012, GINGER), box(0.045, 0.062, 0.1, 0.05, 0.012, 0.012, GINGER),
    cyl(0, 0.12, -0.005, 0.15, 0.125, 0.05, 0x173a72, 0.12, 0, 0.08, 14), cyl(0, 0.155, -0.01, 0.16, 0.15, 0.05, 0x1d4a8a, 0.12, 0, 0.08, 14), ball(0.02, 0.2, -0.02, 0.032, 0xc8102e),
    cyl(0, 0.1, -0.003, 0.131, 0.131, 0.025, 0xc8102e, 0.12, 0, 0.08, 14),
    cyl(-0.12, 0.17, 0, 0.012, 0.004, 0.16, WHITE, 0, 0, 0.5),
  ];
  head.add(meshOf(hp)); const ch = meshOf(cheeks); head.add(ch);
  // bag (tartan-covered), stock, three drones, blowpipe, chanter
  const bagG = new THREE.Group(); bagG.position.set(0.17, 1.28 - U0, 0.2); upper.add(bagG);
  const bag = new THREE.Mesh(own(new THREE.SphereGeometry(0.2, 14, 10)), tmat2); bag.scale.set(0.82, 0.78, 1.55); bag.rotation.x = -0.35; bagG.add(bag);
  bagG.add(meshOf([ball(0, 0.06, 0.22, 0.045, GOLD), ball(0.0, -0.1, -0.2, 0.04, 0xc8102e)]));
  const drones = new THREE.Group(); drones.position.set(0.23, 1.42 - U0, 0.06); upper.add(drones);
  const dp = [];
  const drone = (x, z, hgt, bass) => {
    const lean = 0.12;
    const L1 = hgt * 0.34, L2 = hgt * 0.33;
    dp.push(limb(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + lean * 0.3, L1, z - 0.02), 0.026, 0.024, WOOD));
    dp.push(limb(new THREE.Vector3(x + lean * 0.3, L1 - 0.02, z - 0.02), new THREE.Vector3(x + lean * 0.6, L1 + 0.04, z - 0.04), 0.036, 0.036, IVORY));
    dp.push(limb(new THREE.Vector3(x + lean * 0.6, L1 + 0.04, z - 0.04), new THREE.Vector3(x + lean * 0.8, L1 + L2, z - 0.06), 0.023, 0.02, WOOD));
    dp.push(limb(new THREE.Vector3(x + lean * 0.8, L1 + L2 - 0.03, z - 0.06), new THREE.Vector3(x + lean * 0.85, L1 + L2 + 0.03, z - 0.065), 0.034, 0.034, IVORY));
    dp.push(limb(new THREE.Vector3(x + lean * 0.85, L1 + L2 + 0.03, z - 0.065), new THREE.Vector3(x + lean, hgt - 0.08, z - 0.08), 0.02, 0.017, WOOD));
    dp.push(part(new THREE.ConeGeometry(0.058, 0.13, 10), place(x + lean, hgt - 0.01, z - 0.08, 1, 1, 1, 0, 0, 0), WOOD));
    dp.push(limb(new THREE.Vector3(x + lean, hgt - 0.01, z - 0.08), new THREE.Vector3(x + lean, hgt + 0.02, z - 0.08), 0.062, 0.062, IVORY));
    if (bass) dp.push(limb(new THREE.Vector3(x + lean * 0.5, hgt * 0.5, z - 0.03), new THREE.Vector3(x + lean * 0.5, hgt * 0.5 + 0.02, z - 0.03), 0.044, 0.044, GOLD));
  };
  drone(0.0, 0.0, 0.95, false); drone(0.07, -0.06, 0.95, false); drone(0.14, -0.12, 1.28, true);
  // cord and tassels
  dp.push(limb(new THREE.Vector3(0.02, 0.8, -0.03), new THREE.Vector3(0.14, 0.9, -0.1), 0.006, 0.006, 0xc8102e), ball(0.1, 0.62, -0.1, 0.03, 0xc8102e), cyl(0.1, 0.55, -0.1, 0.006, 0.02, 0.1, GOLD));
  drones.add(meshOf(dp));
  upper.add(meshOf([limb(new THREE.Vector3(0.0, 1.57 - U0, 0.1), new THREE.Vector3(0.14, 1.4 - U0, 0.2), 0.012, 0.012, WOOD), cyl(0.0, 1.575 - U0, 0.115, 0.02, 0.02, 0.04, IVORY, 1.0, 0, 0)]));
  // chanter hangs from the bag, pointing down in front of the kilt
  upper.add(meshOf([limb(new THREE.Vector3(0.18, 1.16 - U0, 0.36), new THREE.Vector3(0.17, 0.74 - U0, 0.4), 0.014, 0.011, WOOD), limb(new THREE.Vector3(0.17, 0.78 - U0, 0.4), new THREE.Vector3(0.17, 0.72 - U0, 0.4), 0.025, 0.02, IVORY)]));
  // arms: pivot at the shoulders. L (his left, +x) clamps the bag; R fingers the chanter.
  const armL = new THREE.Group(); armL.position.set(0.25, 1.52 - U0, 0.02); upper.add(armL);
  const armR = new THREE.Group(); armR.position.set(-0.25, 1.52 - U0, 0.02); upper.add(armR);
  const sh = new THREE.Vector3(0, 0, 0);
  armL.add(meshOf([limb(sh, new THREE.Vector3(0.1, -0.24, 0.1), 0.06, 0.05, GREEN), limb(new THREE.Vector3(0.1, -0.24, 0.1), new THREE.Vector3(-0.07, -0.33, 0.3), 0.048, 0.04, GREEN), ball(-0.07, -0.34, 0.31, 0.04, SKIN), box(0.1, -0.24, 0.1, 0.1, 0.05, 0.1, WHITE)]));
  armR.add(meshOf([limb(sh, new THREE.Vector3(-0.07, -0.28, 0.12), 0.06, 0.05, GREEN), limb(new THREE.Vector3(-0.07, -0.28, 0.12), new THREE.Vector3(0.42, -0.62, 0.32), 0.048, 0.04, GREEN), ball(0.43, -0.63, 0.33, 0.04, SKIN), ball(0.42, -0.72, 0.36, 0.03, SKIN)]));
  armR.children[0].geometry.computeBoundingSphere();
  // left hand on the chanter (lower), a static fist
  upper.add(meshOf([ball(0.17, 0.86 - U0, 0.41, 0.036, SKIN), ball(0.17, 0.79 - U0, 0.41, 0.03, SKIN)]));
  figure.traverse((o) => { o.matrixAutoUpdate = true; });

  root.visible = false; root.scale.setScalar(0.001);
  group.add(root);
  H.piper = { root, pos: { x: a.x, y: baseY + 1.7, z: a.z } };
  X.piperPos = H.piper.pos;

  // ---------------------------------------------------------------- state driven from the race
  const st = { race: null, player: null, audio: null, game: null, shown: 0, t0: 0, playing: false };
  track.onRaceStart = (race, player, audio, game) => { Object.assign(st, { race, player, audio, game, shown: 0, playing: false, everShown: false }); root.visible = false; root.scale.setScalar(0.001); };

  const BEAT = 0.534;
  anim.push((dt, time) => {
    const { race, player, audio, game } = st;
    // present & playing only while the player is on the final lap of a live race
    let want = false;
    if (race && player && player.race && game && race.state === "racing") want = player.race.lap >= race.laps && !player.race.finished;
    const live = want && !game.paused && (game.stateName === "racing");
    if (want && !st.playing) { st.t0 = time; }
    st.playing = want;
    if (want) st.everShown = true;
    st.shown += ((st.everShown ? 1 : 0) - st.shown) * Math.min(1, dt * 5);
    root.visible = st.everShown; root.scale.setScalar(Math.max(0.001, st.shown));
    // sound: on while playing on the final lap; off (faded) at the finish, on pause, or when the race ends
    if (audio && audio.setPiper) { if (live) audio.setPiper(true, H.piper.pos); else if (st.audioOn) audio.setPiper(false); st.audioOn = live; }
    // animation (only while playing)
    const k = want ? 1 : 0, t = time - st.t0;
    const beat = (t / BEAT) * TAU;
    upper.rotation.z = k * Math.sin(beat / 2) * 0.06; upper.rotation.x = k * (0.05 + Math.sin(beat) * 0.015); upper.rotation.y = k * Math.sin(beat / 4) * 0.08;
    head.rotation.z = -upper.rotation.z * 0.8; head.rotation.y = k * Math.sin(beat / 6) * 0.2;
    const sq = k * (0.5 + 0.5 * Math.sin((t / 2.2) * TAU)), sq2 = Math.pow(sq, 2);
    armL.rotation.z = -sq2 * 0.12; armL.rotation.x = sq2 * 0.06; bagG.scale.set(1 - sq2 * 0.12, 1 - sq2 * 0.14, 1 - sq2 * 0.06);
    armR.rotation.x = k * Math.sin(beat * 2) * 0.03; armR.rotation.z = k * Math.sin(beat * 4 + 1) * 0.025;
    const tap = k * Math.max(0, Math.sin(beat)); footR.rotation.x = -tap * 0.45;
    drones.rotation.z = k * Math.sin(beat / 2 + 1) * 0.03; drones.rotation.x = k * Math.sin(beat / 3) * 0.02;
    const puff = 1 + k * (0.28 + 0.2 * Math.sin((t / 2.2) * TAU + 1.2)); ch.scale.set(puff, puff, puff);
  });
}
