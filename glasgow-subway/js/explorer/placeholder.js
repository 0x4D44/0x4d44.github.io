// Development fallbacks: used only when data/subway.json or terrain.json are not (yet) available.
import { project } from '../shared/geo.js';

export const WATER_Y = 3;
export function fakeGround(x, z) {
  const zr = 640 + 420 * Math.sin(x / 2300 + 0.9) + 0.0001 * x * x * 0.02;
  const d = Math.abs(z - zr);
  const base = 24 + 13 * Math.sin(x / 1300 + 0.6) * Math.cos(z / 1500) + 9 * Math.sin(z / 650 + x / 900);
  const rise = Math.min(1, Math.max(0, (d - 70) / 380));
  const s = rise * rise * (3 - 2 * rise);
  return WATER_Y + 0.5 + s * Math.max(2, base - WATER_Y);
}
export function fakeTerrainModule() {
  return { placeholder: true, WATER_Y, groundHeight: fakeGround, loadTerrain: async () => {} };
}

const ST = [
  ['buchanan-street', 'Buchanan Street', 55.8612, -4.2530, 8.5, 'island'],
  ['st-enoch', 'St Enoch', 55.8559, -4.2564, 9.8, 'island'],
  ['bridge-street', 'Bridge Street', 55.8517, -4.2585, 10.6, 'island'],
  ['west-street', 'West Street', 55.8484, -4.2640, 12.0, 'island'],
  ['shields-road', 'Shields Road', 55.8467, -4.2708, 11.2, 'island'],
  ['kinning-park', 'Kinning Park', 55.8492, -4.2790, 11.9, 'island'],
  ['cessnock', 'Cessnock', 55.8536, -4.2885, 12.5, 'island'],
  ['ibrox', 'Ibrox', 55.8535, -4.3095, 11.2, 'island'],
  ['govan', 'Govan', 55.8617, -4.3125, 14.0, 'island'],
  ['partick', 'Partick', 55.8697, -4.3090, 13.5, 'island'],
  ['kelvinhall', 'Kelvinhall', 55.8692, -4.3063, 12.0, 'island'],
  ['hillhead', 'Hillhead', 55.8744, -4.2938, 21.0, 'island'],
  ['kelvinbridge', 'Kelvinbridge', 55.8744, -4.2827, 15.3, 'island'],
  ['st-georges-cross', "St George's Cross", 55.8714, -4.2680, 14.2, 'island'],
  ['cowcaddens', 'Cowcaddens', 55.8665, -4.2594, 14.8, 'island'],
];

function catmull(pts, step) {
  const n = pts.length; const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z); const m = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z), y: f(p0.y, p1.y, p2.y, p3.y), seg: i });
    }
  }
  return out;
}

export function makePlaceholderSubway(ground) {
  const stations = ST.map((s, i) => {
    const p = project(s[2], s[3]); const sy = ground(p.x, p.z);
    return {
      id: s[0], name: s[1], order: i, lat: s[2], lon: s[3], x: p.x, z: p.z, surfaceY: sy, railY: sy - s[4], depth: s[4],
      platform: { type: s[5], lengthM: 52, widthM: 9, headingDeg: 90, centreX: p.x, centreZ: p.z, tracks: { outer: { x: p.x, z: p.z - 4 }, inner: { x: p.x, z: p.z + 4 } } },
      entrances: [{ name: s[1] + ' entrance', lat: s[2], lon: s[3], x: p.x + 28, z: p.z - 22, kind: 'street' }],
      opened: '1896', rebuilt: [], interchange: ['Subway'],
      summary: 'Placeholder text for ' + s[1] + ' - the real research data (data/subway.json) has not been generated yet.',
      description: 'Placeholder description.\n\nThe explorer is running against a procedural stand-in dataset.',
      facts: ['Placeholder fact'], nearby: [], architecture: '',
    };
  });
  const ctr = stations.map((s) => ({ x: s.x, z: s.z, y: s.railY }));
  const mk = (off, rev) => {
    const base = catmull(ctr, 10);
    const pts = base.map((p, i) => {
      const q = base[(i + 1) % base.length]; const dx = q.x - p.x, dz = q.z - p.z; const l = Math.hypot(dx, dz) || 1;
      return { x: p.x - dz / l * off, z: p.z + dx / l * off, y: p.y };
    });
    const out = rev ? pts.slice().reverse() : pts; let s = 0;
    return out.map((p, i) => { if (i) s += Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z); return { ...p, s }; });
  };
  const outer = mk(-4, false), inner = mk(4, true);
  const stops = (pts) => stations.map((st) => { let b = 0, bd = 1e12; pts.forEach((p, i) => { const d = (p.x - st.x) ** 2 + (p.z - st.z) ** 2; if (d < bd) { bd = d; b = i; } }); return { station: st.id, s: pts[b].s, dwellS: 25 }; });
  const os = stops(outer).sort((a, b) => a.s - b.s), is = stops(inner).sort((a, b) => a.s - b.s);
  const L = (pts) => pts[pts.length - 1].s;
  return {
    meta: { name: 'Glasgow Subway', operator: 'SPT', opened: '1896-12-14', length_km: L(outer) / 1000, stations: 15, gauge_mm: 1220, tunnel_diameter_m: 3.35, sources: [], generated: 'placeholder', placeholder: true },
    stations,
    tracks: { outer: { name: 'Outer Circle', direction: 'clockwise', closed: true, points: outer, stops: os, speedLimits: [] }, inner: { name: 'Inner Circle', direction: 'anticlockwise', closed: true, points: inner, stops: is, speedLimits: [] } },
    tunnel: { innerDiameterM: 3.35, tubeSeparationM: 8, lining: 'cast iron', riverCrossings: [{ name: 'Clyde (Bridge St - Shields Rd)', s0: 2000, s1: 2300, clearanceBelowBedM: 4 }], depot: null },
    rollingStock: { current: {}, history: [] },
    timeline: [{ year: 1896, title: 'Opened', text: 'Placeholder timeline entry.' }],
  };
}

/** Procedural city used when data/city/manifest.json is missing: instanced boxes. */
export function placeholderCityData(THREE, ground, bounds) {
  const g = new THREE.Group(); g.name = 'placeholder-city';
  const { minX, maxX, minZ, maxZ } = bounds;
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  const items = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let x = minX; x < maxX; x += 46) for (let z = minZ; z < maxZ; z += 46) {
    const px = x + rnd() * 10, pz = z + rnd() * 10; const y = ground(px, pz);
    if (y < WATER_Y + 1.2 || ((Math.floor(x / 46) % 5 === 0) || (Math.floor(z / 46) % 6 === 0))) continue;
    items.push([px, y, pz, 18 + rnd() * 16, 10 + rnd() * rnd() * 40, 16 + rnd() * 14]);
  }
  const im = new THREE.InstancedMesh(geo, mat, items.length); im.name = 'buildings_placeholder';
  const m = new THREE.Matrix4(), c = new THREE.Color();
  items.forEach((it, i) => {
    m.compose(new THREE.Vector3(it[0], it[1] - 1, it[2]), new THREE.Quaternion(), new THREE.Vector3(it[3], it[4] + 1, it[5])); im.setMatrixAt(i, m);
    c.setHSL(0.07 + rnd() * 0.04, 0.25 + rnd() * 0.15, 0.4 + rnd() * 0.2); im.setColorAt(i, c);
  });
  im.matrixAutoUpdate = false; g.add(im);
  const seg = 150, W = maxX - minX, D = maxZ - minZ;
  const pg = new THREE.PlaneGeometry(W, D, seg, seg); pg.rotateX(-Math.PI / 2); pg.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = pg.attributes.position; const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = ground(pos.getX(i), pos.getZ(i)); pos.setY(i, y);
    const wet = y < WATER_Y + 1.2; const t = Math.min(1, Math.max(0, (y - 5) / 55));
    const cc = wet ? [0.12, 0.2, 0.28] : [0.2 + t * 0.15, 0.3 + t * 0.05, 0.16 + t * 0.06];
    col.set(cc, i * 3);
  }
  pg.setAttribute('color', new THREE.BufferAttribute(col, 3)); pg.computeVertexNormals();
  const ter = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); ter.name = 'terrain_placeholder'; g.add(ter);
  return g;
}
