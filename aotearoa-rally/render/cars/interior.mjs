// Cockpit: dash, seats, harnesses, roll cage, crew (suits + helmets), steering wheel, instrument cluster.
import { Geo } from "./geo.mjs";
import { cabinRing } from "./body.mjs";
import { cockpitLayout } from "./layout.mjs";

export function buildInterior(THREE, spec, d, livery) {
  const I = new Geo(THREE), H = new Geo(THREE), H2 = new Geo(THREE), SW = new Geo(THREE), CREW = new Geo(THREE);
  const cab = d.cabin;
  const L = cockpitLayout(d);
  const zD = L.zD; // dash front
  const hwC = d.hw * cab.w * 0.92;
  const ZS = L.ZS, hrDrop = L.hrDrop;
  const seatW = L.seatW;
  const topY = d.topC(cab.t0) - 0.05;
  const suit = livery.accent, suit2 = livery.body;
  const DARK = 0x2a2c32, MID = 0x40434a, SEAT = 0x323a52, HARN = 0xc9231f, CAGE = 0x1c1d20;

  // ---- tub interior surfaces
  I.box(hwC * 1.9, 0.04, d.zAt(cab.t1) - zD + 0.2, 0, d.sill + 0.12, (zD + d.zAt(cab.t1)) / 2, 0x0e0e10); // floor
  I.box(0.28, 0.2, d.zAt(cab.t1 - 0.12) - zD, 0, d.sill + 0.25, (zD + d.zAt(cab.t1 - 0.12)) / 2, MID); // tunnel
  for (const sd of [-1, 1]) I.box(0.05, 0.38, d.zAt(cab.re) - zD + 0.1, sd * (hwC - 0.02), d.sill + 0.42, (zD + d.zAt(cab.re)) / 2, MID); // door cards
  // dash: a padded top that rolls from the scuttle to a soft lip (smooth-shaded extrusion), a raised instrument pod in front of the
  // driver, a centre stack with a small amber read-out. Plastics pin their uv to one flat texel so the cabin weave never stripes them.
  const wheelPos = { x: L.wheel.x, y: L.wheel.y, z: L.wheel.z };
  const dk = L.dashDepth / 0.535, dz = (o) => zD + o * dk; // dash offsets scale with the dash depth (shallow on short cabins)
  const gaugePos = { x: wheelPos.x, y: wheelPos.y + 0.1, z: Math.min(wheelPos.z - 0.1, Math.max(dz(0.25), wheelPos.z - 0.3)), w: 0.34, h: 0.17, tilt: -0.28 };
  I.fixUV = [0.002, 0.002];
  const DASH = 0x1d1e22, TRIM = 0x2a2b30;
  I.extrude([[zD, topY - 0.2], [dz(0.5), topY - 0.2], [dz(0.535), topY - 0.09], [dz(0.47), topY - 0.025], [dz(0.3), topY + 0.008], [dz(0.08), topY + 0.006], [zD - 0.02, topY - 0.04]], -hwC * 0.95, hwC * 0.95, DASH);
  // instrument pod: a hooded housing on the driver's side carrying the gauge face (drawn live in car.mjs)
  const pz0 = gaugePos.z - 0.16, pz1 = gaugePos.z - 0.006, py1 = gaugePos.y + gaugePos.h / 2 + 0.035;
  I.extrude([[pz0, topY - 0.05], [pz1, topY - 0.05], [pz1 + 0.01, gaugePos.y - gaugePos.h / 2 - 0.02], [pz1 - 0.02, py1], [pz0 + 0.04, py1 + 0.012], [pz0, py1 - 0.03]], gaugePos.x - gaugePos.w / 2 - 0.03, gaugePos.x + gaugePos.w / 2 + 0.03, 0x121316);
  I.box(0.3, 0.2, 0.1, 0, topY - 0.2, dz(0.47), TRIM); // centre stack
  I.box(0.1, 0.026, 0.01, 0, topY - 0.13, dz(0.526), 0x6a4a14); // amber read-out
  for (let k = 0; k < 4; k++) I.cyl(0.014, 0.014, 0.012, -0.09 + k * 0.06, topY - 0.22, dz(0.526), 0x0c0c0e, Math.PI / 2, 0, 0, 12); // knobs
  I.box(0.46, 0.012, 0.24, 0.36, topY + 0.006, dz(0.2), 0x08080a); // anti-glare mat
  I.fixUV = null;
  I.box(0.1, 0.24, 0.08, 0, d.sill + 0.42, wheelPos.z + 0.3, 0x101012); // gear lever base
  I.cyl(0.012, 0.012, 0.22, 0, d.sill + 0.5, wheelPos.z + 0.33, 0xaaaaaa, -0.2, 0, 0, 8); // gear lever
  I.sphere(0.028, 0, d.sill + 0.61, wheelPos.z + 0.36, 0x111111);
  I.cyl(0.014, 0.014, 0.26, 0.17, d.sill + 0.32, wheelPos.z + 0.5, 0x222222, 1.2, 0, 0, 8); // handbrake
  // pedals
  for (const [x, w] of [[0.3, 0.07], [0.37, 0.05], [0.44, 0.05]]) I.box(w, 0.04, 0.05, x, d.sill + 0.32, wheelPos.z - 0.08, 0x2e2e32, -0.5);
  I.box(0.08, 0.1, 0.02, 0.3, d.sill + 0.24, wheelPos.z - 0.08, 0x777777);
  // co-driver kit: rally computer + footwell extinguisher
  I.box(0.12, 0.06, 0.06, -0.18, d.sill + 0.37, ZS - 0.1, 0x151518);
  I.cyl(0.04, 0.04, 0.2, -0.46, d.sill + 0.28, ZS - 0.22, 0xc01c18, 0, 0, 0, 10);
  // rear bulkhead and spare wheel
  const zB = d.zAt(cab.t1 - 0.03);
  I.box(hwC * 1.9, 0.4, 0.04, 0, d.sill + 0.4, zB - 0.02, 0x1a1a1d);
  I.cyl(0.3, 0.3, 0.2, 0, d.sill + 0.3, d.S.kind === "hatch" ? zB - 0.38 : zB + 0.2, 0x111113, Math.PI / 2, 0, 0, 20); // spare (cargo area in the hatch)
  // ---- seats and harnesses
  for (const sd of [-1, 1]) {
    const sx = sd * seatW;
    I.box(0.46, 0.1, 0.44, sx, d.sill + 0.28, ZS + 0.18, SEAT, 0.0); // base
    I.box(0.46, 0.62 - hrDrop, 0.1, sx, d.sill + 0.58 - hrDrop / 2, ZS + 0.38, SEAT, -0.28); // back
    for (const bx of [-1, 1]) I.box(0.05, 0.6 - hrDrop, 0.15, sx + bx * 0.23, d.sill + 0.58 - hrDrop / 2, ZS + 0.33, 0x222428, -0.28);
    I.box(0.4, 0.16, 0.1, sx, d.sill + 0.96 - hrDrop, ZS + 0.47, SEAT, -0.28); // head rest
    for (const hx of [-0.11, 0.11]) I.box(0.06, 0.62, 0.012, sx + hx, d.sill + 0.7, ZS + 0.285, HARN, -0.3 + 0); // shoulder belts
    I.box(0.4, 0.05, 0.012, sx, d.sill + 0.4, ZS + 0.12, HARN, 0.1);
  }
  // ---- roll cage
  const rY = d.roof - 0.04, bY = d.sill + 0.28;
  const zA = d.zAt(cab.t0 + 0.03), zRs = d.zAt(cab.rs), zMain = d.zAt(cab.re - 0.02), zRear = d.zAt(cab.t1 - 0.06);
  const w = hwC * 0.98;
  // keep every cage point inside the tumbled-home shell: below the roof crown and inboard of the side wall at that height
  const fit = (p) => {
    const { ring, yTop } = cabinRing(d, d.tAt(p[2]));
    const y = Math.min(p[1], yTop - 0.03);
    let sx = Infinity;
    for (let k = 0; k < ring.length / 2; k++) {
      const a = ring[k], b = ring[k + 1];
      if (a[1] <= y && b[1] >= y && b[1] > a[1]) { sx = a[0] + (b[0] - a[0]) * ((y - a[1]) / (b[1] - a[1])); break; }
    }
    if (sx === Infinity) sx = ring[0][0];
    return [Math.sign(p[0]) * Math.min(Math.abs(p[0]), Math.max(0.05, sx - 0.03)), y, p[2]];
  };
  const dense = (pts) => {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.08));
      for (let j = 1; j <= n; j++) out.push([a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n, a[2] + ((b[2] - a[2]) * j) / n]);
    }
    return out;
  };
  // round matte tubes (<= 2 cm radius): 14 sides, smooth normals, one flat texel so the cabin weave cannot band them
  const T = (pts, r = 0.0185) => { I.fixUV = [0.002, 0.002]; I.tube(dense(pts).map(fit), r, CAGE, 14, false); I.fixUV = null; };
  // main hoop
  T([[-w, bY, zMain], [-w, rY - 0.12, zMain], [-w * 0.93, rY, zMain], [w * 0.93, rY, zMain], [w, rY - 0.12, zMain], [w, bY, zMain]]);
  // front hoop (A pillars)
  // On a cabin where the driver sits close under the header (short, raked screen), the cross-bar would hang in the lens: build the two
  // A-pillar legs only and let them run into the roof rails.
  if (L.eye.z - (zRs - 0.02) >= 0.7) T([[-w, bY, zA + 0.02], [-w, topY + 0.1, zA + 0.04], [-w * 0.86, rY - 0.05, zRs - 0.02], [w * 0.86, rY - 0.05, zRs - 0.02], [w, topY + 0.1, zA + 0.04], [w, bY, zA + 0.02]]);
  else for (const sd of [-1, 1]) T([[sd * w, bY, zA + 0.02], [sd * w, topY + 0.1, zA + 0.04], [sd * w * 0.86, rY - 0.05, zRs - 0.02]]);
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
  const crew = [{ x: seatW, driver: true }, { x: -seatW, driver: false }];
  const eyeY = d.eye.y;
  for (const c of crew) {
    const hx = c.x, hy = c.driver ? L.eye.y - 0.04 : eyeY + 0.02, hz = L.headZ;
    // torso, hips, legs
    CREW.sphere(0.2, hx, d.sill + 0.7, ZS + 0.25, suit, 1.0, 1.25, 0.8);
    CREW.sphere(0.17, hx, d.sill + 0.42, ZS + 0.18, suit2, 1.1, 0.7, 1.2);
    for (const lx of [-1, 1]) {
      CREW.tube([[hx + lx * 0.1, d.sill + 0.4, ZS + 0.1], [hx + lx * 0.12, d.sill + 0.55, ZS - 0.28], [hx + lx * 0.1, d.sill + 0.34, wheelPos.z - 0.08]], 0.05, suit2, 8, true);
    }
    CREW.sphere(0.07, hx, hy - 0.2, hz + 0.0, 0x222222, 1.4, 0.8, 1); // neck/collar
    // arms
    for (const lx of [-1, 1]) {
      const sxp = hx + lx * 0.22;
      if (c.driver) CREW.tube([[sxp, d.sill + 0.82, ZS + 0.2], [hx + lx * 0.34, d.sill + 0.74, ZS - 0.12], [hx + lx * 0.15, wheelPos.y - 0.02, wheelPos.z + 0.04]], 0.03, suit, 10, true);
      else CREW.tube([[sxp, d.sill + 0.82, ZS + 0.2], [hx + lx * 0.2, d.sill + 0.7, ZS - 0.05], [hx + lx * 0.1, d.sill + 0.62, ZS - 0.22]], 0.034, suit, 8, true);
      // glove: flattened ellipsoid palm + four knuckle/finger bumps + a coloured cuff, so hands on the wheel do not read as balls
      const gx = c.driver ? hx + lx * 0.15 : hx + lx * 0.1, gy = c.driver ? wheelPos.y - 0.02 : d.sill + 0.62, gz = c.driver ? wheelPos.z + 0.01 : ZS - 0.24;
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
  // padded rim (round, 14 sides) with suede grips at 3 and 9 o'clock, three flat spokes (left, right, bottom: the top stays open so the
  // gauge pod reads through it), a domed hub with a centre cap, and a red top marker
  const R = 0.14;
  SW.fixUV = [0.002, 0.002];
  SW.add(new THREE.TorusGeometry(R, 0.0185, 14, 48), null, 0x151517);
  for (const a of [0, Math.PI]) SW.add(new THREE.TorusGeometry(R, 0.0215, 14, 12, 1.0), SW.mat(0, 0, 0, 0, 0, a - 0.5), 0x2c2d31);
  for (const sd of [-1, 1]) SW.box(R - 0.04, 0.026, 0.013, sd * (0.04 + (R - 0.04) / 2), -0.004, 0, 0x4a4d53);
  SW.box(0.026, R - 0.04, 0.013, 0, -(0.04 + (R - 0.04) / 2), 0, 0x4a4d53);
  SW.cyl(0.042, 0.048, 0.04, 0, 0, 0.004, 0x131315, Math.PI / 2, 0, 0, 28);
  SW.cyl(0.03, 0.036, 0.012, 0, 0, 0.026, 0x75787e, Math.PI / 2, 0, 0, 28);
  SW.box(0.022, 0.014, 0.012, 0, R, 0.0, 0xd01c18); // top marker
  SW.fixUV = null;
  // steering column in interior
  I.fixUV = [0.002, 0.002];
  I.cyl(0.03, 0.03, 0.4, wheelPos.x, wheelPos.y - 0.12, wheelPos.z - 0.14, 0x111113, 1.1, 0, 0, 14);
  // interior mirror under the roof header, centred: housing, a dark glass face turned to the driver, and a short stalk
  const mz = d.zAt(cab.rs) - 0.01, my = d.roof - 0.1;
  // a short cabin (the V8 coupe) puts the header 0.27 m from the driver's eye, where the housing fills the top-left of the lens: no mirror there
  if (Math.hypot(L.eye.x, my - L.eye.y, mz - L.eye.z) >= 0.5) {
    I.cyl(0.007, 0.007, 0.08, 0, my + 0.07, mz - 0.01, 0x15161a, 0, 0, 0, 8);
    I.box(0.22, 0.062, 0.03, 0, my, mz, 0x15161a);
    I.box(0.2, 0.046, 0.004, 0, my, mz + 0.017, 0x56626e);
  }
  I.fixUV = null;

  return { interior: I.build(), helmets: H.build(), wheel: SW.build(), crew: CREW.build(), wheelPos, gaugePos, zD, topY };
}

/**
 * Instrument cluster texture: tacho (x1000 rpm) and speedo (km/h) dials, a gear letter between them and a row of shift lights.
 * `live` = { rpm, kmh, gear } moves the needles and lights; omitted, the needles rest at idle. The static face is drawn once per
 * canvas and restored from a cached copy, so a live update is one putImageData plus two needles.
 */
const FACE = new WeakMap();
export function drawGauges(canvas, spec, live = null) {
  const W = 512, H = 256;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const c = canvas.getContext("2d");
  const redK = Math.max(4, Math.round((spec.engine?.redline || 7500) / 1000)), maxK = redK + 1;
  const TACHO = { x: 124, y: 138, r: 104 }, SPEEDO = { x: 388, y: 138, r: 104 };
  const ang = (f) => Math.PI * 0.75 + Math.min(1, Math.max(0, f)) * Math.PI * 1.5;
  if (!FACE.has(canvas)) {
    c.fillStyle = "#08090b"; c.fillRect(0, 0, W, H);
    const dial = (D, max, step, label, redFrom, unit) => {
      c.save(); c.translate(D.x, D.y);
      c.beginPath(); c.arc(0, 0, D.r, 0, 7); c.fillStyle = "#101216"; c.fill(); c.lineWidth = 5; c.strokeStyle = "#5c6068"; c.stroke();
      c.font = "bold 17px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      for (let v = 0; v <= max; v += step) {
        const a = ang(v / max), red = redFrom != null && v >= redFrom;
        c.strokeStyle = red ? "#ff3a2a" : "#e8e8e8"; c.lineWidth = 3;
        c.beginPath(); c.moveTo(Math.cos(a) * D.r * 0.82, Math.sin(a) * D.r * 0.82); c.lineTo(Math.cos(a) * D.r * 0.95, Math.sin(a) * D.r * 0.95); c.stroke();
        c.fillStyle = red ? "#ff6a5a" : "#f2f2f2"; c.fillText(String(label(v)), Math.cos(a) * D.r * 0.64, Math.sin(a) * D.r * 0.64);
      }
      c.fillStyle = "#3df0ff"; c.font = "bold 14px sans-serif"; c.fillText(unit, 0, D.r * 0.42);
      c.restore();
    };
    dial(TACHO, maxK, 1, (v) => v, redK - 1, "x1000 rpm");
    dial(SPEEDO, 240, 40, (v) => v, null, "km/h");
    FACE.set(canvas, c.getImageData(0, 0, W, H));
  } else c.putImageData(FACE.get(canvas), 0, 0);
  const rpm = live ? live.rpm : (spec.engine?.idleRpm || 1000), kmh = live ? live.kmh : 0;
  const needle = (D, f, colour) => {
    const a = ang(f);
    c.save(); c.translate(D.x, D.y); c.strokeStyle = colour; c.lineWidth = 5; c.lineCap = "round";
    c.beginPath(); c.moveTo(-Math.cos(a) * 14, -Math.sin(a) * 14); c.lineTo(Math.cos(a) * D.r * 0.84, Math.sin(a) * D.r * 0.84); c.stroke();
    c.fillStyle = "#222"; c.beginPath(); c.arc(0, 0, 9, 0, 7); c.fill(); c.restore();
  };
  needle(TACHO, rpm / 1000 / maxK, "#ff5a1c");
  needle(SPEEDO, kmh / 240, "#ff5a1c");
  // gear letter and digital speed between the dials
  const gear = live ? live.gear : 0;
  c.fillStyle = "#3df0ff"; c.font = "bold 46px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(gear < 0 ? "R" : gear === 0 ? "N" : String(gear), 256, 118);
  c.font = "bold 22px sans-serif"; c.fillStyle = "#f2f2f2"; c.fillText(String(Math.round(Math.abs(kmh))), 256, 170);
  // shift lights: 9 over the last fifth of the rev range
  const lit = Math.max(0, Math.min(9, Math.round(((rpm / 1000 / redK) - 0.82) / 0.18 * 9)));
  for (let i = 0; i < 9; i++) {
    const on = i < lit, col = i < 3 ? "#20e060" : i < 6 ? "#ffd020" : "#ff3030";
    c.fillStyle = on ? col : "#1b1d21"; c.beginPath(); c.arc(100 + i * 39, 20, 7, 0, 7); c.fill();
  }
  return canvas;
}
