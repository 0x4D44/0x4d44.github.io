// Procedural station: platform room (island / side), vault, tiles, signs, benches, columns,
// escalator+stairs ramp, ticket-hall concourse, exit stair. Built in a LOCAL frame:
//   x_l = lateral (right of the direction of travel), y = metres above rail head, z_l = -u (forward = -z).
// Origin = platform centre on the (straightened) track. Group is rotated/positioned into the world.
// Also returns walker zones / obstacles (in x_l, z_l) and interaction anchors.
import { GeoBuilder, canvasTex, tileTexture, nameSignTexture, infoPanelTexture, styleFor, drawRoundel, wrapText } from './gfx.js';
import { hashStr, mulberry32, clamp } from './util.js';

export const PY = 0.695;           // platform surface above rail head
export const EDGE = 1.5;          // track centre to platform edge
export const END_PAD = 5;         // room beyond platform ends

export function stationFacts(st) {
  const f = [];
  if (st.facts && st.facts.length) f.push(...st.facts);
  if (st.opened) f.push(`Opened ${st.opened.slice ? st.opened.slice(0, 4) : st.opened}${st.rebuilt && st.rebuilt.length ? ', rebuilt ' + st.rebuilt.join(', ') : ''}.`);
  if (st.depth) f.push(`Rail level is about ${Math.round(st.depth)} m below the street.`);
  if (st.platform && st.platform.type) f.push(`${st.platform.type[0].toUpperCase() + st.platform.type.slice(1)} platform, ${Math.round(st.platform.lengthM || 45)} m long.`);
  if (st.interchange && st.interchange.length) f.push('Interchange: ' + st.interchange.filter((x) => x !== 'Subway').join(', ') + '.');
  if (st.nearby && st.nearby.length) f.push('Nearby: ' + st.nearby.slice(0, 6).join(', ') + '.');
  if (st.architecture) f.push(st.architecture);
  return f.filter(Boolean);
}

export function buildStation(THREE, o) {
  const { station: st, stop, side: S, lineKey, trainLen, idx } = o;
  const style = styleFor(st, idx);
  const seed = hashStr(st.id); const rng = mulberry32(seed);
  const type = (st.platform && st.platform.type) || 'island';
  const island = type === 'island';
  const PL = Math.max(st.platform && st.platform.lengthM || 45, trainLen + 6) / 2;
  const W = clamp((st.platform && st.platform.widthM || 5) * 0.85, 3.8, 5.6);
  const xe = S * EDGE;                       // platform edge
  const xo = S * (EDGE + W);                 // platform outer edge (island: edge of second track gap)
  const otherTrackX = S * (EDGE + W + EDGE); // island: other line's track
  const xa = -S * 2.9;                       // room edge on own-track side
  const xb = island ? S * (EDGE + W + EDGE + 2.9) : S * (EDGE + W + 0.15);
  const xmin = Math.min(xa, xb), xmax = Math.max(xa, xb), xc0 = (xmin + xmax) / 2, hw = (xmax - xmin) / 2;
  const zE = PL + END_PAD;                   // room half-length
  const wallH = 3.1, archH = island ? 2.5 : 2.3;
  const ceilY = (x) => wallH + archH * Math.sqrt(Math.max(0, 1 - ((x - xc0) / hw) ** 2));
  const xcP = S * (EDGE + W / 2);            // platform centreline
  const depth = st.depth || 10;
  const Hc = clamp(depth * 0.55, 5.2, 8.5);  // concourse floor
  const Hs = Math.max(Hc + 3.2, depth);      // street level (relative)
  const rampW = 4.2, rampZ0 = zE, slope = 0.56, Lr = (Hc - PY) / slope, rampZ1 = rampZ0 + Lr;
  const zc0 = rampZ1, conL = 22, conW = 9;   // concourse half width conW
  const exitZ0 = zc0 + conL, Ls = (Hs - Hc) / 0.52, exitZ1 = exitZ0 + Ls;

  const group = new THREE.Group(); group.name = 'station_' + st.id;
  const zones = [], obstacles = [], anchors = {}, anim = [], lights = [];

  // ------------ materials
  const mTile = new THREE.MeshLambertMaterial({ map: tileTexture(THREE, style.dado, '#cfc8b4', 8, seed), side: THREE.DoubleSide });
  const mUpper = new THREE.MeshLambertMaterial({ map: tileTexture(THREE, style.upper, '#d8d2c0', 8, seed + 1), side: THREE.DoubleSide });
  const stoneTex = canvasTex(THREE, 256, 256, (g, w, h) => { g.fillStyle = '#6f6f72'; g.fillRect(0, 0, w, h); const r = mulberry32(5); for (let i = 0; i < 2500; i++) { const v = 90 + r() * 60; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(r() * w, r() * h, 2, 2); } g.strokeStyle = 'rgba(0,0,0,.25)'; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); }, { repeat: true });
  const mFloor = new THREE.MeshLambertMaterial({ map: stoneTex, side: THREE.DoubleSide });
  const mConFloor = new THREE.MeshLambertMaterial({ map: stoneTex, color: 0xcbb99a, side: THREE.DoubleSide });
  const mVC = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mLamp = new THREE.MeshBasicMaterial({ color: 0xfff1c8 });
  const mStep = (() => { const t = canvasTex(THREE, 64, 64, (g, w, h) => { g.fillStyle = '#9aa0a6'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a4f55'; for (let i = 0; i < 4; i++) g.fillRect(0, i * 16 + 11, w, 5); }, { repeat: true }); return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }); })();
  const stoneRep = (x, y) => { stoneTex.repeat.set(x, y); };
  const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const cDado = col(style.dado), cTrim = col(style.trim), cAcc = col(style.accent);
  const Bt = new GeoBuilder(), Bu = new GeoBuilder(), Bf = new GeoBuilder(), Bc = new GeoBuilder(), Bv = new GeoBuilder(), Bl = new GeoBuilder(), Bs = new GeoBuilder();
  const tileU = 1 / 1.2;

  // ------------ platform room
  // floor of pit (track bed) and platform
  Bv.box(xmin, -0.5, -zE, xmax, -0.2, zE, [0.12, 0.12, 0.13], 2);
  const pxa = Math.min(xe, xo), pxb = Math.max(xe, xo);
  Bf.quad([pxa, PY, zE], [pxb, PY, zE], [pxb, PY, -zE], [pxa, PY, -zE], [0, 0, (pxb - pxa) / 2.4, (2 * zE) / 2.4], [1, 1, 1]);
  Bv.box(Math.min(xe, xe - S * 0.08), -0.2, -zE, Math.max(xe, xe - S * 0.08) + (S > 0 ? 0 : 0), PY, zE, [0.55, 0.55, 0.55], 1); // platform face
  // fix: face slab sits inside the platform edge
  // tactile yellow strip
  const ty0 = Math.min(xe, xe + S * 0.55), ty1 = Math.max(xe, xe + S * 0.55);
  Bl.quad([ty0, PY + 0.012, zE], [ty1, PY + 0.012, zE], [ty1, PY + 0.012, -zE], [ty0, PY + 0.012, -zE], [0, 0, 1, 1], [1, 1, 1]);
  // rails
  const rails = (tx, len) => {
    for (const dx of [-0.61, 0.61]) Bv.box(tx + dx - 0.04, 0, -len, tx + dx + 0.04, 0.13, len, [0.5, 0.5, 0.52], 1);
    Bv.box(tx + 0.9, 0.0, -len, tx + 1.0, 0.16, len, [0.35, 0.28, 0.2], 1);
    for (let z = -len; z < len; z += 0.75) Bv.box(tx - 0.95, -0.2, z, tx + 0.95, -0.08, z + 0.2, [0.22, 0.2, 0.18], 1);
  };
  rails(0, zE); if (island) rails(otherTrackX, zE);
  // walls
  const wallQuad = (x, zA, zB, y0, y1, B, c, tx) => { B.quad([x, y0, zA], [x, y0, zB], [x, y1, zB], [x, y1, zA], [0, y0 * tx, Math.abs(zB - zA) * tx, y1 * tx], c); };
  const dadoH = 2.2;
  // own-track side wall (x = xa) and far wall
  for (const [x, flip] of [[xa, 0], [xb, 1]]) {
    wallQuad(x, -zE, zE, -0.2, dadoH, Bt, [1, 1, 1], tileU);
    wallQuad(x, -zE, zE, dadoH, wallH, Bu, [1, 1, 1], tileU);
    // trim band
    const dir = x > xc0 ? -1 : 1;
    Bl.box(x - (dir > 0 ? 0 : 0.05), dadoH, -zE, x + dir * 0.05 + (dir > 0 ? 0.05 : 0), dadoH + 0.12, zE, cTrim, 1);
  }
  // vault surface (upper tile) across the room
  const NS = 18;
  for (let i = 0; i < NS; i++) {
    const x0 = xmin + (xmax - xmin) * i / NS, x1 = xmin + (xmax - xmin) * (i + 1) / NS;
    Bu.quad([x0, ceilY(x0), zE], [x1, ceilY(x1), zE], [x1, ceilY(x1), -zE], [x0, ceilY(x0), -zE], [x0 * tileU, 0, x1 * tileU, 2 * zE * tileU], [0.95, 0.95, 0.9]);
  }
  // wall/ceiling arc between wallH level: arch springs from wallH, so walls go up to wallH. (already)
  // accent ribs every 6 m
  for (let z = -PL; z <= PL + 0.1; z += 6) {
    for (let i = 0; i < NS; i++) {
      const x0 = xmin + (xmax - xmin) * i / NS, x1 = xmin + (xmax - xmin) * (i + 1) / NS;
      Bl.quad([x0, ceilY(x0) - 0.04, z + 0.16], [x1, ceilY(x1) - 0.04, z + 0.16], [x1, ceilY(x1) - 0.04, z - 0.16], [x0, ceilY(x0) - 0.04, z - 0.16], [0, 0, 1, 1], cTrim);
    }
    // lamp boxes
    for (const lx of [xc0 - hw * 0.45, xc0 + hw * 0.45]) Bs.box(lx - 0.35, ceilY(lx) - 0.14, z - 0.9, lx + 0.35, ceilY(lx) - 0.04, z + 0.9, [1, 1, 1], 1);
  }
  // end walls with bore holes (and ramp opening at +z)
  const endWall = (zz, withRamp) => {
    const shp = new THREE.Shape();
    shp.moveTo(xmin, -0.5); shp.lineTo(xmax, -0.5);
    const seg = 24; for (let i = 0; i <= seg; i++) { const x = xmax - (xmax - xmin) * i / seg; shp.lineTo(x, ceilY(x)); }
    shp.lineTo(xmin, -0.5);
    const holes = [];
    const circ = (cx, cy, r) => { const h = new THREE.Path(); for (let i = 0; i <= 28; i++) { const a = -i / 28 * Math.PI * 2; const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; if (i) h.lineTo(px, py); else h.moveTo(px, py); } return h; };
    holes.push(circ(0, 1.2, 1.68)); if (island) holes.push(circ(otherTrackX, 1.2, 1.68));
    if (withRamp) {
      const h = new THREE.Path(); const a = xcP - rampW / 2 + 0.1, b = xcP + rampW / 2 - 0.1;
      h.moveTo(a, PY); h.lineTo(a, PY + 2.7); h.lineTo(b, PY + 2.7); h.lineTo(b, PY); h.lineTo(a, PY); holes.push(h);
    }
    shp.holes = holes;
    const geo = new THREE.ShapeGeometry(shp, 8);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) { uv.setXY(i, pos.getX(i) * tileU, pos.getY(i) * tileU); pos.setZ(i, zz); }
    const m = new THREE.Mesh(geo, mUpper); group.add(m);
  };
  endWall(-zE, false); endWall(zE, true);
  // bore stub beyond the end walls (dark tube) so that holes do not show void
  const stubMat = new THREE.MeshLambertMaterial({ color: 0x2b2d30, side: THREE.BackSide });
  const stubs = [0].concat(island ? [otherTrackX] : []);
  for (const tx of stubs) for (const dz of [-1, 1]) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1.68, 1.68, 40, 16, 1, true), stubMat);
    cyl.rotation.x = Math.PI / 2; cyl.position.set(tx, 1.2, dz * (zE + 20)); group.add(cyl);
    if (tx !== 0) { const t = new GeoBuilder(); t.box(tx - 1, -0.3, dz * (zE), tx + 1, -0.1, dz * (zE + 40), [0.15, 0.15, 0.15], 1); group.add(new THREE.Mesh(t.build(THREE), mVC)); }
  }
  // platform end barriers (front end, -z)
  Bv.box(pxa, PY, -PL - 0.1, pxb, PY + 1.0, -PL, [0.3, 0.33, 0.36], 1);

  // ------------ columns (island centreline) and benches
  const columns = [];
  if (island) for (let z = -PL + 4; z <= PL - 4; z += 7) {
    Bv.box(xcP - 0.22, PY, z - 0.22, xcP + 0.22, ceilY(xcP), z + 0.22, col(style.dado).map((v) => v * 0.9), 1);
    Bl.box(xcP - 0.25, PY + 1.2, z - 0.25, xcP + 0.25, PY + 1.32, z + 0.25, cTrim, 1);
    obstacles.push({ x0: xcP - 0.3, x1: xcP + 0.3, z0: z - 0.3, z1: z + 0.3, y: PY });
    columns.push(z);
  }
  const benchZs = [];
  for (let z = -PL + 7.5; z <= PL - 3; z += 14) {
    const bx = island ? xcP + S * 0.0 : xo - S * 0.35;
    const bz = island ? z + 3.5 : z;
    Bv.box(bx - 0.28, PY + 0.42, bz - 1.0, bx + 0.28, PY + 0.5, bz + 1.0, [0.55, 0.38, 0.2], 1);
    Bv.box(bx - 0.25, PY, bz - 0.9, bx + 0.25, PY + 0.42, bz - 0.8, [0.2, 0.2, 0.22], 1); Bv.box(bx - 0.25, PY, bz + 0.8, bx + 0.25, PY + 0.42, bz + 0.9, [0.2, 0.2, 0.22], 1);
    obstacles.push({ x0: bx - 0.35, x1: bx + 0.35, z0: bz - 1.05, z1: bz + 1.05, y: PY });
    benchZs.push([bx, bz]);
  }
  // wall-side (non-island) back wall at xb is the platform wall: tiles already.

  // ------------ signs (name) along the platform walls and over the track wall
  const nameTex = nameSignTexture(THREE, st.name, style, { sub: lineKey === 'outer' ? 'Outer circle - clockwise' : 'Inner circle - anticlockwise' });
  const mName = new THREE.MeshBasicMaterial({ map: nameTex, side: THREE.DoubleSide });
  const signs = new GeoBuilder();
  const plane = (cx, cy, cz, nx, nz, w, h, mat) => { // plane facing direction (nx,0,nz)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(cx, cy, cz); m.rotation.y = Math.atan2(nx, nz); group.add(m); return m;
  };
  // on the wall behind the train (track-side wall xa), faces +x direction toward the platform = sign(S)
  for (let z = -PL + 6; z <= PL - 4; z += 12) {
    plane(xa + S * 0.03, 2.55, z, S, 0, 3.2, 0.8, mName);
    if (island) plane(xb - S * 0.03, 2.55, z, -S, 0, 3.2, 0.8, mName); else plane(xb - S * 0.03, 2.55, z, -S, 0, 3.2, 0.8, mName);
    // pillar signs: island - hang from columns
  }
  if (island) for (const z of columns.filter((_, i) => i % 2 === 0)) { plane(xcP, 2.4, z - 0.26, 0, -1, 1.6, 0.4, mName); plane(xcP, 2.4, z + 0.26, 0, 1, 1.6, 0.4, mName); }
  // info panels (facts) - on platform-side wall
  const facts = stationFacts(st);
  const panelPos = [];
  const nPanels = Math.min(4, Math.max(2, Math.ceil(facts.length / 2)));
  const infoMats = [];
  for (let i = 0; i < nPanels; i++) {
    const body = facts.slice(i * 2, i * 2 + 2).join(' ') || `Welcome to ${st.name}.`;
    const tex = infoPanelTexture(THREE, i === 0 ? st.name : 'Did you know?', body, style);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    const z = -PL + 8 + i * ((2 * PL - 16) / Math.max(1, nPanels - 1)) * (nPanels > 1 ? 1 : 0);
    const wx = island ? xb : xb; // far wall (platform back wall for side type; other track wall for island)
    plane(wx - S * 0.04, 1.55, z + 0.0, -S, 0, 0.95, 1.2, mat);
    panelPos.push({ z, x: wx, title: st.name, body });
    infoMats.push(mat);
  }
  anchors.panels = panelPos;

  // ------------ lamps
  // collect lights
  const addLight = (x, y, z, c = 0xffe3b0, i = 9, d = 28) => { const l = new THREE.PointLight(c, i, d, 1.4); l.position.set(x, y, z); group.add(l); lights.push(l); return l; };
  addLight(xc0, wallH + 1, -PL * 0.5); addLight(xc0, wallH + 1, PL * 0.5);

  // ------------ ramp (escalators + stairs)
  const rc = xcP; const lanes = [
    { x0: rc - rampW / 2, x1: rc - rampW / 2 + 1.15, kind: 'up' },
    { x0: rc - rampW / 2 + 1.3, x1: rc + rampW / 2 - 1.3, kind: 'stairs' },
    { x0: rc + rampW / 2 - 1.15, x1: rc + rampW / 2, kind: 'down' },
  ];
  const incl = Math.atan(slope), rl = Math.hypot(Lr, Hc - PY);
  // ramp tunnel: walls & ceiling & floor
  Bv.quad([rc - rampW / 2, PY, rampZ0], [rc + rampW / 2, PY, rampZ0], [rc + rampW / 2, Hc, rampZ1], [rc - rampW / 2, Hc, rampZ1], [0, 0, 1, 1], [0.35, 0.36, 0.38]);
  for (const sx of [-1, 1]) {
    const x = rc + sx * rampW / 2;
    Bt.quad([x, PY, rampZ0], [x, Hc, rampZ1], [x, Hc + 2.8, rampZ1], [x, PY + 2.8, rampZ0], [0, 0, rl * tileU, 2.8 * tileU], [1, 1, 1], false);
  }
  Bu.quad([rc - rampW / 2, PY + 2.8, rampZ0], [rc + rampW / 2, PY + 2.8, rampZ0], [rc + rampW / 2, Hc + 2.8, rampZ1], [rc - rampW / 2, Hc + 2.8, rampZ1], [0, 0, 3, 8], [0.9, 0.9, 0.85]);
  for (let k = 0; k < 6; k++) { const t = (k + 0.5) / 6; Bs.box(rc - 0.5, PY + 2.7 + t * (Hc - PY), rampZ0 + t * Lr - 0.5, rc + 0.5, PY + 2.78 + t * (Hc - PY), rampZ0 + t * Lr + 0.5, [1, 1, 1], 1); }
  // lanes: moving steps (texture scroll) on escalators, fixed steps for stairs
  const escMeshes = [];
  for (const ln of lanes) {
    const w = ln.x1 - ln.x0;
    const geo = new THREE.BufferGeometry();
    const P = [ln.x0, PY, rampZ0, ln.x1, PY, rampZ0, ln.x1, Hc, rampZ1, ln.x0, Hc, rampZ1];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w * 1.4, 0, w * 1.4, rl / 0.4, 0, rl / 0.4], 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mat = ln.kind === 'stairs' ? mStep : mStep.clone();
    if (ln.kind !== 'stairs') { mat.map = mStep.map.clone(); mat.map.needsUpdate = true; mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; escMeshes.push({ mat, dir: ln.kind === 'up' ? 1 : -1 }); }
    const m = new THREE.Mesh(geo, mat); group.add(m);
    // handrail
    Bs.box(ln.x0 - 0.05, 0, 0, ln.x0, 0, 0, [0, 0, 0], 1);
    zones.push({ kind: 'ramp', x0: ln.x0, x1: ln.x1, z0: rampZ0, z1: rampZ1, y0: PY, y1: Hc, push: ln.kind === 'up' ? 0.62 : ln.kind === 'down' ? -0.62 : 0, lane: ln.kind });
  }
  // lane dividers (balustrades)
  const bal = (x) => {
    const n = 14; for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      Bv.quad([x, PY + 0.9 + t0 * (Hc - PY), rampZ0 + t0 * Lr], [x, PY + 0.9 + t1 * (Hc - PY), rampZ0 + t1 * Lr], [x, PY + 0.2 + t1 * (Hc - PY), rampZ0 + t1 * Lr], [x, PY + 0.2 + t0 * (Hc - PY), rampZ0 + t0 * Lr], [0, 0, 1, 1], [0.22, 0.24, 0.26]);
    }
    obstacles.push({ x0: x - 0.08, x1: x + 0.08, z0: rampZ0 - 0.1, z1: rampZ1 + 0.1, y: -99, tall: true });
  };
  bal(lanes[0].x1 + 0.075); bal(lanes[1].x1 + 0.075);
  addLight(rc, PY + 3.4, rampZ0 + Lr * 0.5, 0xffe9c0, 7, 20);
  zones.push({ kind: 'flat', x0: pxa, x1: pxb, z0: -PL, z1: zE, y: PY, name: 'platform' });
  // opening neck between room and ramp is covered by ramp zone start
  anchors.platform = { x0: pxa, x1: pxb, edgeX: xe, z0: -PL, z1: PL };

  // ------------ concourse
  const cx = rc, cxa = cx - conW, cxb = cx + conW, cH = 4.4;
  const cz0 = zc0, cz1 = exitZ0;
  Bf.quad([cxa, Hc, cz1], [cxb, Hc, cz1], [cxb, Hc, cz0], [cxa, Hc, cz0], [0, 0, 2 * conW / 2.4, conL / 2.4], [0.85, 0.8, 0.7]);
  const wallBox = (x0, x1, z0, z1, y0, y1) => { Bt.box(x0, y0, z0, x1, Math.min(y1, y0 + 2.2), z1, [1, 1, 1], 1.2); if (y1 > y0 + 2.2) Bu.box(x0, y0 + 2.2, z0, x1, y1, z1, [1, 1, 1], 1.2); };
  // concourse walls drawn as quads facing inward
  wallQuad(cxa, cz0, cz1, Hc, Hc + 2.2, Bt, [1, 1, 1], tileU); wallQuad(cxa, cz0, cz1, Hc + 2.2, Hc + cH, Bu, [1, 1, 1], tileU);
  wallQuad(cxb, cz0, cz1, Hc, Hc + 2.2, Bt, [1, 1, 1], tileU); wallQuad(cxb, cz0, cz1, Hc + 2.2, Hc + cH, Bu, [1, 1, 1], tileU);
  const zq = (z, xA, xB, y0, y1, B, c) => B.quad([xA, y0, z], [xB, y0, z], [xB, y1, z], [xA, y1, z], [xA * tileU, y0 * tileU, xB * tileU, y1 * tileU], c);
  // near wall (z=cz0) with ramp opening: draw pieces left and right of opening and above
  const oA = rc - rampW / 2, oB = rc + rampW / 2;
  zq(cz0, cxa, oA, Hc, Hc + cH, Bu, [1, 1, 1]); zq(cz0, oB, cxb, Hc, Hc + cH, Bu, [1, 1, 1]); zq(cz0, oA, oB, Hc + 2.8, Hc + cH, Bu, [1, 1, 1]);
  const eA = rc - 1.2, eB = rc + 1.2;
  zq(cz1, cxa, eA, Hc, Hc + cH, Bu, [1, 1, 1]); zq(cz1, eB, cxb, Hc, Hc + cH, Bu, [1, 1, 1]); zq(cz1, eA, eB, Hc + 2.7, Hc + cH, Bu, [1, 1, 1]);
  Bu.quad([cxa, Hc + cH, cz0], [cxb, Hc + cH, cz0], [cxb, Hc + cH, cz1], [cxa, Hc + cH, cz1], [0, 0, 6, 6], [0.92, 0.92, 0.88]);
  for (let z = cz0 + 3; z < cz1 - 1; z += 4) for (const lx of [cx - 4.5, cx, cx + 4.5]) Bs.box(lx - 0.6, Hc + cH - 0.06, z - 0.25, lx + 0.6, Hc + cH, z + 0.25, [1, 1, 1], 1);
  addLight(cx, Hc + 3.3, cz0 + 5, 0xfff0d0, 10, 26); addLight(cx, Hc + 3.3, cz0 + 16, 0xfff0d0, 10, 26);
  // gate line
  const gz = cz0 + 7.5; const gates = [];
  const gateLanes = [-2.4, -0.8, 0.8, 2.4];
  Bv.box(cxa, Hc, gz - 0.2, cx - 3.5, Hc + 1.0, gz + 0.2, [0.35, 0.37, 0.4], 1); obstacles.push({ x0: cxa, x1: cx - 3.5, z0: gz - 0.25, z1: gz + 0.25, y: Hc });
  Bv.box(cx + 3.5, Hc, gz - 0.2, cxb, Hc + 1.0, gz + 0.2, [0.35, 0.37, 0.4], 1); obstacles.push({ x0: cx + 3.5, x1: cxb, z0: gz - 0.25, z1: gz + 0.25, y: Hc });
  for (let i = 0; i <= gateLanes.length; i++) {
    const gx = i === 0 ? cx - 3.2 : i === gateLanes.length ? cx + 3.2 : cx + (gateLanes[i - 1] + gateLanes[i]) / 2;
    Bv.box(gx - 0.12, Hc, gz - 0.55, gx + 0.12, Hc + 1.0, gz + 0.55, [0.3, 0.32, 0.36], 1); Bl.box(gx - 0.1, Hc + 1.0, gz - 0.4, gx + 0.1, Hc + 1.04, gz + 0.4, cAcc, 1);
    obstacles.push({ x0: gx - 0.14, x1: gx + 0.14, z0: gz - 0.6, z1: gz + 0.6, y: Hc });
  }
  // ticket machines + info boards along side walls
  const tm = [];
  for (let i = 0; i < 3; i++) {
    const z = cz0 + 11 + i * 2.6, x = cxa + 0.45; Bv.box(x - 0.4, Hc, z - 0.45, x + 0.4, Hc + 1.7, z + 0.45, [0.2, 0.22, 0.28], 1); Bl.box(x + 0.4, Hc + 1.1, z - 0.3, x + 0.42, Hc + 1.5, z + 0.3, cAcc, 1);
    obstacles.push({ x0: x - 0.45, x1: x + 0.45, z0: z - 0.5, z1: z + 0.5, y: Hc }); tm.push({ x, z });
  }
  // shop kiosk
  Bv.box(cxb - 2.4, Hc, cz0 + 12, cxb - 0.2, Hc + 2.3, cz0 + 16, col(style.accent).map((v) => v * 0.7), 1);
  Bl.box(cxb - 2.45, Hc + 1.4, cz0 + 12, cxb - 2.38, Hc + 1.8, cz0 + 16, [1, 0.95, 0.8], 1);
  obstacles.push({ x0: cxb - 2.45, x1: cxb - 0.1, z0: cz0 + 11.9, z1: cz0 + 16.1, y: Hc });
  // benches
  for (const z of [cz0 + 3, cz0 + 17]) { Bv.box(cx - 6.4, Hc + 0.42, z, cx - 5.4, Hc + 0.5, z + 2, [0.5, 0.36, 0.2], 1); obstacles.push({ x0: cx - 6.5, x1: cx - 5.3, z0: z - 0.05, z1: z + 2.05, y: Hc }); }
  // concourse signs
  const way = (txt, bg) => canvasTex(THREE, 512, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; let fs = 64; g.font = `600 ${fs}px Arial`; while (g.measureText(txt).width > w - 150 && fs > 20) { fs -= 4; g.font = `600 ${fs}px Arial`; } g.textBaseline = 'middle'; g.fillText(txt, 130, 66); drawRoundel(g, 64, 64, 40, style.accent); });
  plane(rc, Hc + 3.4, cz1 - 0.05, 0, -1, 3.2, 0.8, new THREE.MeshBasicMaterial({ map: way('Way out', '#14532d'), side: THREE.DoubleSide }));
  plane(rc, Hc + 3.9, cz0 + 0.05, 0, 1, 3.4, 0.85, new THREE.MeshBasicMaterial({ map: way('Platforms', '#0f2a4a'), side: THREE.DoubleSide }));
  plane(cx, Hc + 3.1, gz - 0.1, 0, -1, 4.2, 0.7, new THREE.MeshBasicMaterial({ map: way('Tickets - Gates', '#6b2020'), side: THREE.DoubleSide }));
  // station name big board on concourse side wall + info panels
  const nameBig = new THREE.MeshBasicMaterial({ map: nameTex, side: THREE.DoubleSide });
  plane(cxb - 0.04, Hc + 2.9, cz0 + 8, -1, 0, 4.0, 1.0, nameBig);
  plane(cxa + 0.04, Hc + 2.9, cz0 + 17, 1, 0, 4.0, 1.0, nameBig);
  const cpanel = [];
  facts.slice(0, 8).forEach((f, i) => {
    if (i < nPanels * 2) return;
  });
  const extra = facts.slice(nPanels * 2);
  const conPanelTexts = [];
  for (let i = 0; i < 3; i++) {
    const body = (extra.slice(i * 2, i * 2 + 2).join(' ') || facts[(i * 3 + 1) % Math.max(1, facts.length)] || `Welcome to ${st.name}.`);
    const mat = new THREE.MeshBasicMaterial({ map: infoPanelTexture(THREE, i === 0 ? 'About this station' : i === 1 ? 'Nearby' : 'Did you know?', body, style), side: THREE.DoubleSide });
    const z = cz0 + 4 + i * 5.5;
    plane(cxb - 0.04, Hc + 1.6, z + 3.2 * (i === 0 ? 1.5 : 1), -1, 0, 0.95, 1.2, mat);
    conPanelTexts.push({ z, body });
  }
  anchors.conPanels = conPanelTexts;
  zones.push({ kind: 'flat', x0: cxa, x1: cxb, z0: cz0, z1: cz1, y: Hc, name: 'concourse' });

  // ------------ exit stair to the street
  const xw = 2.4;
  Bv.quad([rc - xw / 2, Hc, exitZ0], [rc + xw / 2, Hc, exitZ0], [rc + xw / 2, Hs, exitZ1], [rc - xw / 2, Hs, exitZ1], [0, 0, 1, 1], [0.3, 0.3, 0.32]);
  const stairGeo = new THREE.BufferGeometry();
  { const P = [rc - 1.1, Hc, exitZ0, rc + 1.1, Hc, exitZ0, rc + 1.1, Hs, exitZ1, rc - 1.1, Hs, exitZ1];
    stairGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); stairGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 2, Ls / 0.4, 0, Ls / 0.4], 2));
    stairGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); stairGeo.setIndex([0, 1, 2, 0, 2, 3]); group.add(new THREE.Mesh(stairGeo, mStep)); }
  for (const sx of [-1, 1]) { const x = rc + sx * xw / 2; Bt.quad([x, Hc, exitZ0], [x, Hs, exitZ1], [x, Hs + 2.8, exitZ1], [x, Hc + 2.8, exitZ0], [0, 0, 6, 3], [1, 1, 1]); }
  Bu.quad([rc - xw / 2, Hc + 2.8, exitZ0], [rc + xw / 2, Hc + 2.8, exitZ0], [rc + xw / 2, Hs + 2.8, exitZ1], [rc - xw / 2, Hs + 2.8, exitZ1], [0, 0, 2, 6], [0.9, 0.9, 0.85]);
  // landing + door frame
  const landZ1 = exitZ1 + 3.2;
  Bf.quad([rc - xw / 2, Hs, landZ1], [rc + xw / 2, Hs, landZ1], [rc + xw / 2, Hs, exitZ1], [rc - xw / 2, Hs, exitZ1], [0, 0, 1, 1], [0.9, 0.9, 0.9]);
  Bt.quad([rc - xw / 2, Hs, exitZ1], [rc - xw / 2, Hs, landZ1], [rc - xw / 2, Hs + 2.8, landZ1], [rc - xw / 2, Hs + 2.8, exitZ1], [0, 0, 3, 3], [1, 1, 1]);
  Bt.quad([rc + xw / 2, Hs, exitZ1], [rc + xw / 2, Hs, landZ1], [rc + xw / 2, Hs + 2.8, landZ1], [rc + xw / 2, Hs + 2.8, exitZ1], [0, 0, 3, 3], [1, 1, 1]);
  Bu.quad([rc - xw / 2, Hs + 2.8, landZ1], [rc + xw / 2, Hs + 2.8, landZ1], [rc + xw / 2, Hs + 2.8, exitZ1], [rc - xw / 2, Hs + 2.8, exitZ1], [0, 0, 1, 1], [0.9, 0.9, 0.9]);
  // glowing daylight door
  const mDay = new THREE.MeshBasicMaterial({ color: 0xcfe7ff, side: THREE.DoubleSide });
  const dayDoor = new THREE.Mesh(new THREE.PlaneGeometry(xw - 0.2, 2.7), mDay); dayDoor.position.set(rc, Hs + 1.4, landZ1 - 0.02); group.add(dayDoor);
  plane(rc, Hs + 2.45, landZ1 - 0.08, 0, -1, 1.6, 0.35, new THREE.MeshBasicMaterial({ map: way('Exit', '#14532d'), side: THREE.DoubleSide }));
  addLight(rc, Hs + 2.3, exitZ1 + 1.2, 0xdff0ff, 6, 14);
  zones.push({ kind: 'ramp', x0: rc - 1.1, x1: rc + 1.1, z0: exitZ0, z1: exitZ1, y0: Hc, y1: Hs, push: 0, lane: 'exit' });
  zones.push({ kind: 'flat', x0: rc - xw / 2, x1: rc + xw / 2, z0: exitZ1, z1: landZ1, y: Hs, name: 'landing' });
  obstacles.push({ x0: rc - 1.3, x1: rc - 1.1, z0: exitZ0, z1: exitZ1, y: -99, tall: true }, { x0: rc + 1.1, x1: rc + 1.3, z0: exitZ0, z1: exitZ1, y: -99, tall: true });
  anchors.exit = { x: rc, z: landZ1 - 0.9, y: Hs };
  anchors.rampTop = { x: rc, z: rampZ1 };
  anchors.ceilY = ceilY; anchors.Hc = Hc; anchors.Hs = Hs;

  // ------------ build meshes
  const mk = (B, mat, name) => { if (!B.count) return; const m = new THREE.Mesh(B.build(THREE), mat); m.name = name; group.add(m); return m; };
  mk(Bt, mTile, 'dado'); mk(Bu, mUpper, 'upper'); mk(Bf, mFloor, 'floor'); mk(Bv, mVC, 'misc'); mk(Bl, mVC, 'trim');
  const lampMesh = mk(Bs, mLamp, 'lamps');
  mk(Bc, mVC, 'c');
  // tactile strip colour
  const tact = group.children.find((c) => c.name === 'trim'); // uses vertex colours (white) -> tint via separate mesh
  // convert tactile quad to yellow: rebuild small mesh
  const tg = new GeoBuilder(); tg.quad([ty0, PY + 0.016, zE], [ty1, PY + 0.016, zE], [ty1, PY + 0.016, -zE], [ty0, PY + 0.016, -zE], [0, 0, 1, 1], [0.95, 0.78, 0.1]);
  group.add(new THREE.Mesh(tg.build(THREE), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  // ---- platform side-view collider zones for people
  const info = {
    PL, W, xe, xo, island, S, otherTrackX, xcP, zE, rampZ0, rampZ1, zc0, cz1: exitZ0, exitZ1, Hc, Hs, PY, style, benches: benchZs, columns,
  };
  const update = (t) => { for (const e of escMeshes) e.mat.map.offset.y = (-t * 0.9 * e.dir) % 1; };
  const dispose = () => {
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } });
  };
  return { group, zones, obstacles, anchors, info, update, dispose, lights, style, facts };
}

/** Place the station group in the world from the Track stop's straightened frame. */
export function placeStation(THREE, built, stop) {
  const sr = stop.straight; const g = built.group;
  g.position.set(sr.cx, sr.y, sr.cz);
  g.rotation.set(0, Math.atan2(-sr.tx, -sr.tz), 0);
  g.updateMatrixWorld(true);
  built.stop = stop;
  return built;
}
