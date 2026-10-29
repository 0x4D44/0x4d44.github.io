// Cockpit: dash, seats, harnesses, roll cage, crew (suits + helmets), steering wheel, instrument cluster.
import { Geo } from "./geo.mjs";

export function buildInterior(THREE, spec, d, livery) {
  const I = new Geo(THREE), H = new Geo(THREE), H2 = new Geo(THREE), SW = new Geo(THREE), CREW = new Geo(THREE);
  const cab = d.cabin;
  const zD = d.zAt(cab.t0) + 0.06; // dash front
  const hwC = d.hw * cab.w * 0.92;
  const ZS = d.seatZ;
  const topY = d.topC(cab.t0) - 0.05;
  const suit = livery.accent, suit2 = livery.body;
  const DARK = 0x2a2c32, MID = 0x40434a, SEAT = 0x323a52, HARN = 0xc9231f, CAGE = 0xd4d6d2;

  // ---- tub interior surfaces
  I.box(hwC * 1.9, 0.04, d.zAt(cab.t1) - zD + 0.2, 0, d.sill + 0.12, (zD + d.zAt(cab.t1)) / 2, 0x0e0e10); // floor
  I.box(0.28, 0.2, d.zAt(cab.t1 - 0.12) - zD, 0, d.sill + 0.25, (zD + d.zAt(cab.t1 - 0.12)) / 2, MID); // tunnel
  for (const sd of [-1, 1]) I.box(0.05, 0.38, d.zAt(cab.re) - zD + 0.1, sd * (hwC - 0.02), d.sill + 0.42, (zD + d.zAt(cab.re)) / 2, MID); // door cards
  // dash
  I.box(hwC * 1.9, 0.2, 0.42, 0, topY - 0.14, zD + 0.21, DARK);
  I.box(hwC * 1.9, 0.05, 0.3, 0, topY - 0.015, zD + 0.12, 0x0b0b0c, 0.12);
  I.box(0.46, 0.14, 0.3, 0.36, topY - 0.01, zD + 0.38, 0x0c0c0d, 0.0); // instrument hood
  I.box(0.34, 0.22, 0.12, 0, topY - 0.22, zD + 0.46, 0x202226); // centre stack
  I.box(0.22, 0.04, 0.02, 0, topY - 0.14, zD + 0.525, 0x3df0ff); // trip computer (bright)
  I.box(0.1, 0.24, 0.08, 0, d.sill + 0.42, zD + 0.8, 0x101012); // gear lever base
  I.cyl(0.012, 0.012, 0.22, 0, d.sill + 0.5, zD + 0.83, 0xaaaaaa, -0.2, 0, 0, 8); // gear lever
  I.sphere(0.028, 0, d.sill + 0.61, zD + 0.86, 0x111111);
  I.cyl(0.014, 0.014, 0.26, 0.17, d.sill + 0.32, zD + 1.0, 0x222222, 1.2, 0, 0, 8); // handbrake
  // pedals
  for (const [x, w] of [[0.3, 0.07], [0.37, 0.05], [0.44, 0.05]]) I.box(w, 0.04, 0.05, x, d.sill + 0.32, zD + 0.55, 0x2e2e32, -0.5);
  I.box(0.08, 0.1, 0.02, 0.3, d.sill + 0.24, zD + 0.55, 0x777777);
  // co-driver kit: rally computer + footwell extinguisher
  I.box(0.12, 0.06, 0.06, -0.18, d.sill + 0.37, ZS - 0.1, 0x151518);
  I.cyl(0.04, 0.04, 0.2, -0.46, d.sill + 0.28, ZS - 0.22, 0xc01c18, 0, 0, 0, 10);
  // rear bulkhead and spare wheel
  const zB = d.zAt(cab.t1 - 0.03);
  I.box(hwC * 1.9, 0.4, 0.04, 0, d.sill + 0.4, zB - 0.02, 0x1a1a1d);
  I.cyl(0.3, 0.3, 0.2, 0, d.sill + 0.3, zB + 0.2, 0x111113, Math.PI / 2, 0, 0, 20);
  // ---- seats and harnesses
  for (const sd of [-1, 1]) {
    const sx = sd * 0.36;
    I.box(0.46, 0.1, 0.44, sx, d.sill + 0.28, ZS + 0.18, SEAT, 0.0); // base
    I.box(0.46, 0.62, 0.1, sx, d.sill + 0.58, ZS + 0.38, SEAT, -0.28); // back
    for (const bx of [-1, 1]) I.box(0.05, 0.6, 0.15, sx + bx * 0.25, d.sill + 0.58, ZS + 0.33, 0x222428, -0.28);
    I.box(0.4, 0.16, 0.1, sx, d.sill + 0.96, ZS + 0.47, SEAT, -0.28); // head rest
    for (const hx of [-0.11, 0.11]) I.box(0.06, 0.62, 0.012, sx + hx, d.sill + 0.7, ZS + 0.285, HARN, -0.3 + 0); // shoulder belts
    I.box(0.4, 0.05, 0.012, sx, d.sill + 0.4, ZS + 0.12, HARN, 0.1);
  }
  // ---- roll cage
  const rY = d.roof - 0.04, bY = d.sill + 0.28;
  const zA = d.zAt(cab.t0 + 0.03), zRs = d.zAt(cab.rs), zMain = d.zAt(cab.re - 0.02), zRear = d.zAt(cab.t1 - 0.06);
  const w = hwC * 0.98;
  const T = (pts, r = 0.0185) => I.tube(pts, r, CAGE, 6, false);
  // main hoop
  T([[-w, bY, zMain], [-w, rY - 0.12, zMain], [-w * 0.93, rY, zMain], [w * 0.93, rY, zMain], [w, rY - 0.12, zMain], [w, bY, zMain]]);
  // front hoop (A pillars)
  T([[-w, bY, zA + 0.02], [-w, topY + 0.1, zA + 0.04], [-w * 0.86, rY - 0.05, zRs - 0.02], [w * 0.86, rY - 0.05, zRs - 0.02], [w, topY + 0.1, zA + 0.04], [w, bY, zA + 0.02]]);
  for (const sd of [-1, 1]) {
    T([[sd * w * 0.86, rY - 0.05, zRs - 0.02], [sd * w * 0.93, rY, zMain]]); // roof rails
    T([[sd * w, bY + 0.05, zA + 0.04], [sd * w, rY - 0.2, zMain]]); // door top bar
    T([[sd * w, bY + 0.1, zA + 0.1], [sd * w, topY - 0.1, zMain - 0.1]]); // door cross
    T([[sd * w, topY - 0.1, zA + 0.1], [sd * w, bY + 0.1, zMain - 0.1]]);
    T([[sd * w * 0.9, rY - 0.02, zMain], [sd * (w - 0.1), bY, zRear]]); // rear stays
  }
  T([[-w * 0.4, rY, zMain], [-w * 0.4, rY, zRs - 0.02]], 0.015);
  T([[w * 0.4, rY, zMain], [w * 0.4, rY, zRs - 0.02]], 0.015);
  T([[-w, rY - 0.12, zMain], [w, rY - 0.4, zMain]], 0.015);

  // ---- crew
  const crew = [{ x: 0.36, driver: true }, { x: -0.36, driver: false }];
  const eyeY = d.eye.y;
  for (const c of crew) {
    const hx = c.x, hy = eyeY + 0.02, hz = ZS + 0.2;
    // torso, hips, legs
    CREW.sphere(0.2, hx, d.sill + 0.7, ZS + 0.25, suit, 1.0, 1.25, 0.8);
    CREW.sphere(0.17, hx, d.sill + 0.42, ZS + 0.18, suit2, 1.1, 0.7, 1.2);
    for (const lx of [-1, 1]) {
      CREW.tube([[hx + lx * 0.1, d.sill + 0.4, ZS + 0.1], [hx + lx * 0.12, d.sill + 0.55, ZS - 0.28], [hx + lx * 0.1, d.sill + 0.34, zD + 0.58]], 0.05, suit2, 8, true);
    }
    CREW.sphere(0.07, hx, hy - 0.2, hz + 0.0, 0x222222, 1.4, 0.8, 1); // neck/collar
    // arms
    for (const lx of [-1, 1]) {
      const sxp = hx + lx * 0.22;
      if (c.driver) CREW.tube([[sxp, d.sill + 0.82, ZS + 0.2], [hx + lx * 0.34, d.sill + 0.74, ZS - 0.12], [hx + lx * 0.2, d.sill + 0.88, ZS - 0.42]], 0.03, suit, 10, true);
      else CREW.tube([[sxp, d.sill + 0.82, ZS + 0.2], [hx + lx * 0.2, d.sill + 0.7, ZS - 0.05], [hx + lx * 0.1, d.sill + 0.62, ZS - 0.22]], 0.034, suit, 8, true);
      // glove: flattened ellipsoid palm + four knuckle/finger bumps + a coloured cuff, so hands on the wheel do not read as balls
      const gx = c.driver ? hx + lx * 0.2 : hx + lx * 0.1, gy = c.driver ? d.sill + 0.88 : d.sill + 0.62, gz = c.driver ? ZS - 0.44 : ZS - 0.24;
      CREW.sphere(0.036, gx, gy, gz, 0x15161a, 1.15, 0.85, 1.3, 12);
      for (let f = 0; f < 4; f++) CREW.sphere(0.011, gx + (f - 1.5) * 0.017, gy + 0.004, gz - 0.044, 0x15161a, 1, 1.4, 1.3, 6);
      CREW.cyl(0.03, 0.028, 0.035, gx, gy + 0.002, gz + 0.05, suit, Math.PI / 2, 0, 0, 10);
    }
    // helmet (separate glossy mesh): shell, visor, chin bar
    const HH = H;
    HH.sphere(0.158, hx, hy, hz, livery.body, 1, 1.07, 1.12, 18);
    HH.sphere(0.162, hx, hy + 0.012, hz - 0.012, livery.accent, 0.9, 0.5, 1.0, 14);
    HH.sphere(0.1, hx, hy - 0.02, hz - 0.1, 0x0b0d12, 1.05, 0.55, 0.75, 14); // visor
    HH.sphere(0.07, hx, hy - 0.115, hz - 0.1, 0x191a1d, 1.0, 0.55, 0.9, 10); // chin
  }

  // ---- steering wheel (own mesh so it can turn); built in a frame whose normal is +Z
  const R = 0.14;
  SW.add(new THREE.TorusGeometry(R, 0.0165, 8, 28), null, 0x1b1b1d);
  SW.box(0.26, 0.03, 0.02, 0, 0, 0, 0x2a2b2f);
  SW.box(0.03, 0.12, 0.02, 0, -0.07, 0, 0x2a2b2f);
  SW.cyl(0.04, 0.045, 0.05, 0, 0, 0.0, 0x111113, Math.PI / 2, 0, 0, 12);
  SW.box(0.025, 0.012, 0.014, 0, R, 0.0, 0xd01c18); // top marker
  const wheelPos = { x: 0.36, y: d.sill + 0.9, z: zD + 0.5 };
  // steering column in interior
  I.cyl(0.03, 0.03, 0.4, wheelPos.x, wheelPos.y - 0.12, wheelPos.z - 0.14, 0x111113, 1.1, 0, 0, 8);

  I.append(CREW);
  return { interior: I.build(), helmets: H.build(), wheel: SW.build(), crew: CREW.build(), wheelPos, zD, topY };
}

/** Instrument cluster texture (tacho + speedo + shift lights), drawn once. */
export function drawGauges(canvas, spec) {
  canvas.width = 512; canvas.height = 256;
  const c = canvas.getContext("2d");
  c.fillStyle = "#0a0b0d"; c.fillRect(0, 0, 512, 256);
  const dial = (cx, cy, r, max, step, label, redFrom) => {
    c.save(); c.translate(cx, cy);
    c.beginPath(); c.arc(0, 0, r, 0, 7); c.fillStyle = "#111318"; c.fill(); c.lineWidth = 4; c.strokeStyle = "#666a72"; c.stroke();
    c.font = "bold 16px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    for (let v = 0; v <= max; v += step) {
      const a = Math.PI * 0.75 + (v / max) * Math.PI * 1.5;
      const red = redFrom && v >= redFrom;
      c.strokeStyle = red ? "#ff3a2a" : "#e8e8e8"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82); c.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); c.stroke();
      c.fillStyle = red ? "#ff6a5a" : "#f2f2f2"; c.fillText(String(label(v)), Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66);
    }
    // needle at idle-ish
    const a0 = Math.PI * 0.75 + 0.12 * Math.PI * 1.5;
    c.strokeStyle = "#ff5a1c"; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a0) * r * 0.8, Math.sin(a0) * r * 0.8); c.stroke();
    c.restore();
  };
  const red = Math.round((spec.engine?.redline || 7500) / 1000);
  dial(150, 128, 112, red, 1, (v) => v, red - 1);
  dial(370, 128, 100, 240, 40, (v) => v);
  c.fillStyle = "#3df0ff"; c.font = "bold 14px sans-serif"; c.textAlign = "center"; c.fillText("x1000 rpm", 150, 190); c.fillText("km/h", 370, 190);
  for (let i = 0; i < 9; i++) { c.fillStyle = i < 3 ? "#20e060" : i < 6 ? "#ffd020" : "#ff3030"; c.beginPath(); c.arc(100 + i * 39, 20, 7, 0, 7); c.fill(); }
  return canvas;
}
