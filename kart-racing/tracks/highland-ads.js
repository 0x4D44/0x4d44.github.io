// Highland Fling - roadside billboards, gantries and hillside boards. Deadpan tourist-board parody (all brands invented).
import * as THREE from "three";
import { toTexture } from "./highland-tex.js";
import { ADS, paintAd } from "./highland-adart.js";

const byId = (id) => ADS.find((a) => a.id === id);
// [s, side(-1 left,+1 right, 0 = gantry over the road), kind, ad id, extra lateral offset]
const PLAN = [
  [96, 1, "big", "haggis"], [172, -1, "small", "shortbread"], [262, 0, "gantry", "whisky"], [334, 1, "big", "midges"], [422, -1, "big", "fry"],
  [498, 1, "small", "tyres"], [566, 1, "big", "nessie", 6], [642, -1, "big", "rain"], [706, 1, "small", "seasons"], [764, -1, "big", "girder"], [806, 1, "small", "coos"],
  [1132, -1, "big", "wind"], [1204, 1, "small", "porridge"], [1274, 1, "big", "pipes"], [1346, -1, "hill", "cheer"], [1524, -1, "small", "kilts"],
  [1566, 0, "gantry", "tyres"], [1646, 1, "big", "safari"], [1722, -1, "small", "broadband"], [2035, 1, "big", "opticians"], [2090, -1, "small", "midges"],
  [2150, 1, "big", "seasons"], [2205, -1, "big", "whisky"], [2262, 1, "small", "haggis"], [2336, -1, "big", "porridge"], [2422, 0, "gantry", "cheer"],
];
const SIZE = { big: [11.5, 5.75, 3.4], small: [6.6, 3.3, 2.0], hill: [17, 8.5, 5.0], gantry: [27, 6.75, 0] };

export function buildAds(H) {
  const { track, X, K } = H;
  const { group, bake, mat, part, own, wallDist, C } = X;
  const { at } = K, gy = X.groundY;
  const steel = 0x3b4048, wood = 0x6a4a2c, lampC = 0xfff0b0;
  const parts = [], cones = [], panels = [];
  const texCache = new Map();
  const panelMat = (ad, W, Hh, flip) => {
    const key = ad.id + W + (flip ? "f" : ""); let m = texCache.get(key);
    if (!m) { const t = toTexture(paintAd(ad, W, Hh, flip), false); t.anisotropy = 8; own(t); m = own(new THREE.MeshBasicMaterial({ map: t, color: 0xf2f2f2 })); texCache.set(key, m); }
    return m;
  };
  let flipN = 0;
  const darkMat = own(new THREE.MeshLambertMaterial({ color: 0x23272d }));
  const spot = (x, y, z, ry, w, drop = 1.2) => {   // lamp bar on top of a board (local to board centre), pointing down onto the face
    const n = w > 14 ? 5 : w > 9 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const lx = (-0.5 + (i + 0.5) / n) * w * 0.9;
      parts.push(part(new THREE.BoxGeometry(0.1, 0.1, 1.5), mat(x, y, z, 1, 1, 1, 0, ry, 0), steel));
      const o = new THREE.Vector3(lx, 0, 0.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
      parts.push(part(new THREE.CylinderGeometry(0.2, 0.28, 0.4, 8), mat(x + o.x, y - 0.05, z + o.z, 1, 1, 1, 0.5, ry, 0), lampC));
    }
  };

  PLAN.forEach(([s, side, kind, id, extra = 0]) => {
    const ad = byId(id), [bw, bh, lift] = SIZE[kind];
    const flip = (flipN++ % 3) === 1;
    const W = kind === "gantry" ? 1536 : 768, Hh = kind === "gantry" ? 384 : Math.round(768 * bh / bw);
    const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(bw, bh)), panelMat(ad, W, Hh, flip));
    let cx, cz, cy, ry, T;
    if (kind === "gantry") {
      const a = at(s, 0); T = { x: Math.sin(a.h), z: Math.cos(a.h) };
      const span = wallDist + 2.8, yb = a.y + 8.2;
      for (const sg of [-1, 1]) {
        const p = at(s, sg * span);
        const top = yb + bh + 1.2, bot = Math.min(gy(p.x, p.z), p.y) - 1.2;
        parts.push(part(new THREE.BoxGeometry(1.1, top - bot, 1.1), mat(p.x, (top + bot) / 2, p.z, 1, 1, 1, 0, a.h, 0), steel));
        parts.push(part(new THREE.BoxGeometry(2.6, 0.6, 2.6), mat(p.x, bot + 0.3, p.z, 1, 1, 1, 0, a.h, 0), 0x70747c));
        track.addObstacle(p.x, p.z, 0.9, bot, top);
      }
      // truss beams across the road behind the board and a catwalk strip
      for (const yy of [yb - 0.35, yb + bh + 0.55]) parts.push(part(new THREE.BoxGeometry(2 * span + 1.4, 0.45, 0.7), mat(a.x, yy, a.z, 1, 1, 1, 0, a.h, 0), steel));
      for (let k = 0; k <= 12; k++) { const lx = -span + (k / 12) * 2 * span; const o = { x: -Math.cos(a.h) * lx, z: Math.sin(a.h) * lx }; parts.push(part(new THREE.BoxGeometry(0.2, bh + 1.2, 0.3), mat(a.x + o.x, yb + bh / 2 + 0.1, a.z + o.z, 1, 1, 1, 0, a.h, 0), 0x50555e)); }
      parts.push(part(new THREE.BoxGeometry(bw + 1.0, bh + 0.7, 0.4), mat(a.x - T.x * 0.35, yb + bh / 2 + 0.1, a.z - T.z * 0.35, 1, 1, 1, 0, a.h, 0), 0x23272d));
      cx = a.x - T.x * 0.6; cz = a.z - T.z * 0.6; cy = yb + bh / 2 + 0.1; ry = a.h + Math.PI;
      spot(a.x - T.x * 0.6, yb + bh + 0.9, a.z - T.z * 0.6, a.h + Math.PI, bw);
    } else {
      const off = (kind === "hill" ? 17 : kind === "big" ? 5.5 : 4.6) + extra;
      const a = at(s, side * (wallDist + off)); T = { x: Math.sin(a.h), z: Math.cos(a.h) };
      const rx = a.rx, rz = a.rz;
      // face the oncoming driver, turned a little toward the road
      let nx = -T.x - side * rx * 0.28, nz = -T.z - side * rz * 0.28; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
      ry = Math.atan2(nx, nz);
      const lx = Math.cos(ry), lz = -Math.sin(ry);   // board's local +x in world
      const posts = [-1, 1].map((sg) => ({ x: a.x + lx * sg * bw * 0.36, z: a.z + lz * sg * bw * 0.36 }));
      const gmax = Math.max(gy(posts[0].x, posts[0].z), gy(posts[1].x, posts[1].z), gy(a.x, a.z));
      const yb = Math.max(gmax + lift, a.y + lift * 0.8);
      cx = a.x; cz = a.z; cy = yb + bh / 2;
      for (const p of posts) {
        const bot = Math.min(gy(p.x, p.z), a.y) - 1.2, top = yb + bh * 0.8;
        parts.push(part(new THREE.BoxGeometry(0.45, top - bot, 0.45), mat(p.x, (top + bot) / 2, p.z, 1, 1, 1, 0, ry, 0), kind === "small" ? wood : steel));
        parts.push(part(new THREE.BoxGeometry(1.4, 0.5, 1.4), mat(p.x, bot + 0.25, p.z, 1, 1, 1, 0, ry, 0), 0x6f737a));
        track.addObstacle(p.x, p.z, 0.45, bot, top);
        // diagonal brace on the back
        parts.push(part(new THREE.BoxGeometry(0.2, (yb - bot) * 1.1, 0.2), mat(p.x - nx * 1.2, bot + (yb - bot) * 0.5, p.z - nz * 1.2, 1, 1, 1, Math.atan2(1.2, yb - bot) * 1, ry, 0), 0x50555e));
      }
      // frame: thick backing box + a lip all round + a walkway under the board
      parts.push(part(new THREE.BoxGeometry(bw + 0.5, bh + 0.5, 0.3), mat(cx - nx * 0.18, cy, cz - nz * 0.18, 1, 1, 1, 0, ry, 0), 0x23272d));
      parts.push(part(new THREE.BoxGeometry(bw + 0.9, 0.3, 0.9), mat(cx - nx * 0.4, yb - 0.1, cz - nz * 0.4, 1, 1, 1, 0, ry, 0), 0x50555e));
      parts.push(part(new THREE.BoxGeometry(bw + 0.5, 0.18, 0.4), mat(cx + nx * 0.02, cy + bh / 2 + 0.28, cz + nz * 0.02, 1, 1, 1, 0, ry, 0), 0x8a8e96));
      spot(cx + nx * 0.1, cy + bh / 2 + 0.55, cz + nz * 0.1, ry, bw);
      // lamp glow cones
      for (let i = 0; i < (bw > 9 ? 3 : 2); i++) { const n = bw > 9 ? 3 : 2, ox = (-0.5 + (i + 0.5) / n) * bw * 0.9; cones.push({ x: cx + lx * ox + nx * 0.8, y: cy + bh / 2 + 0.2, z: cz + lz * ox + nz * 0.8, ry, h: bh * 0.9, r: bw / n * 0.5 }); }
    }
    mesh.position.set(cx + (kind === "gantry" ? 0 : 0) + Math.sin(ry) * 0.04, cy, cz + Math.cos(ry) * 0.04); mesh.rotation.y = ry; mesh.name = "ad-" + id;
    group.add(mesh); panels.push(mesh);
  });
  if (parts.length) { const m = new THREE.Mesh(own(bake(parts)), own(new THREE.MeshLambertMaterial({ vertexColors: true }))); m.name = "ad-frames"; group.add(m); }
  // soft light spill (additive cones)
  if (cones.length) {
    const cp = [], cg = new THREE.ConeGeometry(1, 1, 10, 1, true); cg.translate(0, -0.5, 0);
    const list = cones.map((c) => { const g = cg.clone(); g.scale(c.r, c.h, c.r * 0.6); g.rotateX(0.35); g.rotateY(c.ry); g.translate(c.x, c.y, c.z); return g; });
    const merged = new THREE.BufferGeometry(); const pos = [], idx = []; let o = 0;
    for (const g of list) { const p = g.attributes.position, ix = g.index; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)); for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + o); o += p.count; }
    merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); merged.setIndex(idx);
    const m = new THREE.Mesh(own(merged), own(new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.04, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    m.name = "ad-spill"; m.renderOrder = 4; group.add(m); void cp;
  }
  H.adCount = PLAN.length; H.adDistinct = new Set(PLAN.map((p) => p[3])).size;
}
