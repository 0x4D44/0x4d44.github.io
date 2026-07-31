// ============================================================
// Iron Vertex — the hardware: track, structure, station, train.
//
// track.js decides where the steel goes; this file is what it looks
// like. Everything is built from the same centreline and the same frames
// the physics used, so the banking you see is the banking the ride felt.
//
// Each seed also picks its own livery, which is why two circuits never
// look like the same ride repainted.
// ============================================================

import * as THREE from "./three.module.min.js";
import { mergeParts, part } from "./mesh.js";
import { supportColumns } from "./track.js";

export const GAUGE = 1.05;      // spacing between the running rails, metres
const RAIL_RADIUS = 0.13;

const LIVERIES = [
  { name: "Crimson", rail: 0xc0402a, spine: 0x4d565f, support: 0xdfe3e6, car: 0xd2452b, trim: 0x23272e },
  { name: "Cobalt", rail: 0x2f6bb0, spine: 0x49525c, support: 0xe6e9ec, car: 0x2b6fb8, trim: 0x1e2229 },
  { name: "Viridian", rail: 0x2f8a5a, spine: 0x46505a, support: 0xdedfd8, car: 0x2f9560, trim: 0x1f2a26 },
  { name: "Amber", rail: 0xe0921f, spine: 0x545a61, support: 0xf0ece2, car: 0xe89b22, trim: 0x2b2721 },
  { name: "Violet", rail: 0x7b4bb5, spine: 0x4b4a5a, support: 0xe7e4ee, car: 0x8352c0, trim: 0x241f2c },
  { name: "Slate", rail: 0x3f4a56, spine: 0x2f363d, support: 0xc9ced3, car: 0x39424d, trim: 0x191d22 },
  { name: "Coral", rail: 0xe2604a, spine: 0x555058, support: 0xf2e9e2, car: 0xe86a52, trim: 0x2c2422 },
];

export function liveryFor(seed) {
  return LIVERIES[(seed >>> 3) % LIVERIES.length];
}

// ------------------------------------------------------------
// Sweeping the rails
// ------------------------------------------------------------

// A tube of fixed cross-section swept along a centreline, built by hand
// so the frame (and therefore the banking) is exactly the one the physics
// used.
function sweptTube(centres, ups, tangents, radius, radialSegments) {
  const n = centres.length;
  const verts = new Float32Array(n * radialSegments * 3);
  const indices = [];
  const lateral = new THREE.Vector3();
  const up = new THREE.Vector3();
  const tan = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    up.set(ups[i].x, ups[i].y, ups[i].z);
    tan.set(tangents[i].x, tangents[i].y, tangents[i].z);
    lateral.crossVectors(tan, up).normalize();
    for (let j = 0; j < radialSegments; j++) {
      const a = (j / radialSegments) * Math.PI * 2;
      const ca = Math.cos(a) * radius;
      const sa = Math.sin(a) * radius;
      const o = (i * radialSegments + j) * 3;
      verts[o] = centres[i].x + lateral.x * ca + up.x * sa;
      verts[o + 1] = centres[i].y + lateral.y * ca + up.y * sa;
      verts[o + 2] = centres[i].z + lateral.z * ca + up.z * sa;
    }
  }

  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < radialSegments; j++) {
      const j2 = (j + 1) % radialSegments;
      const a = i * radialSegments + j;
      const b = i * radialSegments + j2;
      const c = i2 * radialSegments + j2;
      const d = i2 * radialSegments + j;
      indices.push(a, b, c, a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function offsetLine(track, lateralOffset, upOffset) {
  const out = [];
  const lat = new THREE.Vector3();
  const up = new THREE.Vector3();
  const tan = new THREE.Vector3();
  for (let i = 0; i < track.points.length; i++) {
    up.set(track.ups[i].x, track.ups[i].y, track.ups[i].z);
    tan.set(track.tangents[i].x, track.tangents[i].y, track.tangents[i].z);
    lat.crossVectors(tan, up).normalize();
    out.push({
      x: track.points[i].x + lat.x * lateralOffset + up.x * upOffset,
      y: track.points[i].y + lat.y * lateralOffset + up.y * upOffset,
      z: track.points[i].z + lat.z * lateralOffset + up.z * upOffset,
    });
  }
  return out;
}

// A unit member, one metre long, centred on the origin and pointing up
// +Y — stretched between two points by spanMatrix below.
const memberGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const plateGeo = new THREE.BoxGeometry(1, 1, 1);

const spanA = new THREE.Vector3();
const spanB = new THREE.Vector3();
const spanDir = new THREE.Vector3();
const spanMid = new THREE.Vector3();
const spanQuat = new THREE.Quaternion();
const spanScale = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function spanMatrix(a, b, thickness, out) {
  spanA.set(a.x, a.y, a.z);
  spanB.set(b.x, b.y, b.z);
  spanDir.subVectors(spanB, spanA);
  const length = spanDir.length() || 0.001;
  spanMid.addVectors(spanA, spanB).multiplyScalar(0.5);
  spanQuat.setFromUnitVectors(UP, spanDir.divideScalar(length));
  spanScale.set(thickness, length, thickness);
  out.compose(spanMid, spanQuat, spanScale);
  return out;
}

function instancedSpans(spans, material, thickness, geo = memberGeo) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, spans.length));
  mesh.count = spans.length;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < spans.length; i++) {
    spanMatrix(spans[i][0], spans[i][1], spans[i][2] ?? thickness, matrix);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

// ------------------------------------------------------------
// The track, its structure and its station
// ------------------------------------------------------------

export function buildTrackMesh(track, groundHeight) {
  const livery = liveryFor(track.seed);
  const group = new THREE.Group();
  const updaters = [];

  const railMat = new THREE.MeshStandardMaterial({ color: livery.rail, roughness: 0.42, metalness: 0.42 });
  const spineMat = new THREE.MeshStandardMaterial({ color: livery.spine, roughness: 0.6, metalness: 0.4 });
  const steelMat = new THREE.MeshStandardMaterial({ color: livery.support, roughness: 0.66, metalness: 0.34 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c3238, roughness: 0.8, metalness: 0.2 });

  // ---- running rails and spine ----
  const rails = [];
  for (const side of [-1, 1]) {
    const line = offsetLine(track, side * GAUGE * 0.5, 0);
    rails.push(line);
    const mesh = new THREE.Mesh(sweptTube(line, track.ups, track.tangents, RAIL_RADIUS, 6), railMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const spineLine = offsetLine(track, 0, -0.72);
  const spine = new THREE.Mesh(sweptTube(spineLine, track.ups, track.tangents, 0.34, 6), spineMat);
  spine.castShadow = true;
  group.add(spine);

  // ---- the zig-zag between spine and rails ----
  //
  // Straight cross-ties every couple of samples read as a ladder; real
  // tubular track laces the spine to each rail alternately, which is what
  // gives a coaster its woven look from below.
  {
    const spans = [];
    const step = 3;
    for (let i = 0; i < track.points.length; i += step) {
      const j = (i + step) % track.points.length;
      const left = i % (step * 2) === 0;
      spans.push([spineLine[i], rails[left ? 0 : 1][j], 0.1]);
      spans.push([spineLine[i], rails[left ? 1 : 0][j], 0.1]);
      spans.push([rails[0][i], rails[1][i], 0.085]);
    }
    group.add(instancedSpans(spans, darkMat, 0.1));
  }

  // ---- supports: legs, not sticks ----
  //
  // A single post under a 40 m drop looks like scaffolding. Real
  // structure is a pair of splayed legs with cross-bracing between them,
  // and it costs nothing extra here because it all instances.
  {
    const columns = supportColumns(track, 9.5);
    const legs = [];
    const braces = [];
    const footings = [];
    for (const col of columns) {
      const base = groundHeight(col.x, col.z);
      const height = col.top - base;
      if (height < 2.2) continue;
      const splay = Math.min(4.2, 1.1 + height * 0.09);
      const lx = col.dirX ?? 1;
      const lz = col.dirZ ?? 0;
      const foot = [
        { x: col.x + lx * splay, y: base - 0.4, z: col.z + lz * splay },
        { x: col.x - lx * splay, y: base - 0.4, z: col.z - lz * splay },
      ];
      const head = [
        { x: col.x + lx * 0.55, y: col.top - 0.55, z: col.z + lz * 0.55 },
        { x: col.x - lx * 0.55, y: col.top - 0.55, z: col.z - lz * 0.55 },
      ];
      legs.push([foot[0], head[0], 0.44], [foot[1], head[1], 0.44]);
      footings.push(foot[0], foot[1]);

      // Ladder the two legs together, alternating the diagonal.
      const rungs = Math.max(1, Math.floor(height / 5.5));
      let previous = null;
      for (let r = 1; r <= rungs; r++) {
        const t = r / (rungs + 1);
        const a = {
          x: foot[0].x + (head[0].x - foot[0].x) * t,
          y: foot[0].y + (head[0].y - foot[0].y) * t,
          z: foot[0].z + (head[0].z - foot[0].z) * t,
        };
        const b = {
          x: foot[1].x + (head[1].x - foot[1].x) * t,
          y: foot[1].y + (head[1].y - foot[1].y) * t,
          z: foot[1].z + (head[1].z - foot[1].z) * t,
        };
        braces.push([a, b, 0.16]);
        if (previous) {
          braces.push([previous[r % 2], r % 2 ? a : b, 0.13]);
        }
        previous = [a, b];
      }
    }
    if (legs.length) group.add(instancedSpans(legs, steelMat, 0.44));
    if (braces.length) group.add(instancedSpans(braces, steelMat, 0.16));
    if (footings.length) {
      const pads = new THREE.InstancedMesh(plateGeo, darkMat, footings.length);
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3(1.6, 0.5, 1.6);
      for (let i = 0; i < footings.length; i++) {
        position.set(footings[i].x, footings[i].y - 0.1, footings[i].z);
        matrix.compose(position, new THREE.Quaternion(), scale);
        pads.setMatrixAt(i, matrix);
      }
      pads.receiveShadow = true;
      group.add(pads);
    }
  }

  // ---- the chain, running under the lift ----
  {
    const lift = [];
    for (let i = 0; i < track.points.length; i++) {
      if (track.roles[i] === "lift") lift.push(i);
    }
    if (lift.length > 4) {
      const centre = offsetLine(track, 0, -0.16);
      const positions = [];
      const uvs = [];
      const indices = [];
      let run = 0;
      for (let k = 0; k < lift.length; k++) {
        const i = lift[k];
        const up = track.ups[i];
        const tan = track.tangents[i];
        const lat = new THREE.Vector3(tan.x, tan.y, tan.z)
          .cross(new THREE.Vector3(up.x, up.y, up.z)).normalize().multiplyScalar(0.13);
        positions.push(
          centre[i].x - lat.x, centre[i].y - lat.y, centre[i].z - lat.z,
          centre[i].x + lat.x, centre[i].y + lat.y, centre[i].z + lat.z,
        );
        uvs.push(run, 0, run, 1);
        if (k > 0) {
          const b = (k - 1) * 2;
          indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
        }
        run += track.ds / 0.55; // one link every 55cm
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 8;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#2a2f35";
      ctx.fillRect(0, 0, 32, 8);
      ctx.fillStyle = "#8d949c";
      ctx.fillRect(2, 1, 12, 6);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      const chain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: texture, roughness: 0.7, metalness: 0.5, side: THREE.DoubleSide,
      }));
      group.add(chain);
      // The chain is always running, whether or not a train is on it.
      updaters.push((t) => { texture.offset.x = -t * 1.6; });
    }
  }

  // ---- brake fins on the brake run ----
  {
    const fins = [];
    for (let i = 0; i < track.points.length; i += 4) {
      if (track.roles[i] !== "brake") continue;
      const p = track.points[i];
      const up = track.ups[i];
      fins.push([
        { x: p.x - up.x * 0.62, y: p.y - up.y * 0.62, z: p.z - up.z * 0.62 },
        { x: p.x + up.x * 0.1, y: p.y + up.y * 0.1, z: p.z + up.z * 0.1 },
        0.16,
      ]);
    }
    if (fins.length) group.add(instancedSpans(fins, new THREE.MeshStandardMaterial({
      color: 0xe8b923, roughness: 0.5, metalness: 0.4,
    }), 0.16));
  }

  // ---- the station ----
  const stationIdx = Math.max(0, track.roles.indexOf("station"));
  {
    const p = track.points[stationIdx];
    const tan = track.tangents[stationIdx];
    const heading = Math.atan2(tan.x, tan.z);
    const station = new THREE.Group();
    station.position.set(p.x, p.y, p.z);
    station.rotation.y = heading;

    // The whole shed is one merged, vertex-coloured mesh: it never moves
    // relative to itself, so there is no reason for it to be twenty draws.
    const DECK = 0xa88f6d;
    const POST = 0xf1ece0;
    const parts = [];
    // Platforms either side of the track, with the rails running between.
    for (const side of [-1, 1]) {
      parts.push(part(new THREE.BoxGeometry(3.4, 0.6, 22), DECK, [side * 3.0, -1.15, 0]));
      for (let i = -2; i <= 2; i++) {
        parts.push(part(new THREE.CylinderGeometry(0.16, 0.16, 5.2, 6), POST, [side * 4.3, 1.7, i * 5]));
      }
      parts.push(part(new THREE.BoxGeometry(1.6, 0.8, 24), livery.rail,
        [side * 5.4, 4.0, 0], [1, 1, 1], [0, 0, side * 0.5]));
      // A queue rail along the platform edge.
      parts.push(part(new THREE.BoxGeometry(0.1, 0.1, 21), 0x8b929a, [side * 4.5, -0.2, 0]));
    }
    parts.push(part(new THREE.BoxGeometry(11.4, 0.4, 24), livery.rail, [0, 4.4, 0]));
    // Back wall behind one platform, so the station reads as a building.
    parts.push(part(new THREE.BoxGeometry(0.3, 4.2, 24), POST, [-5.6, 1.9, 0]));
    const shed = new THREE.Mesh(mergeParts(parts), new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.82,
    }));
    shed.castShadow = true;
    shed.receiveShadow = true;
    station.add(shed);

    // The name board.
    const sign = makeSign(track.name, livery);
    sign.position.set(0, 6.4, -11.4);
    station.add(sign);
    const signBack = makeSign(track.name, livery);
    signBack.position.set(0, 6.4, 11.4);
    signBack.rotation.y = Math.PI;
    station.add(signBack);

    group.add(station);
  }

  return { group, updaters, livery, stationIdx };
}

// A painted board with the coaster's name on it, drawn to a canvas.
function makeSign(name, livery) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const paint = new THREE.Color(livery.rail).getStyle();
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fillRect(0, 104, 512, 24);
  ctx.strokeStyle = "rgba(255, 246, 224, 0.85)";
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 108);
  ctx.fillStyle = "#fff6e0";
  ctx.font = "700 62px 'Segoe UI', Roboto, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name.toUpperCase(), 256, 66, 460);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(11, 2.75, 0.3),
    [
      new THREE.MeshStandardMaterial({ color: livery.spine, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: livery.spine, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: livery.spine, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: livery.spine, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 }),
      new THREE.MeshStandardMaterial({ color: livery.spine, roughness: 0.8 }),
    ],
  );
  board.castShadow = true;
  return board;
}

// ------------------------------------------------------------
// The train, and the people in it
//
// A four-car train with four riders in each is about a hundred small
// objects, and a hundred draw calls a frame is enough to bring a weak GPU
// to its knees for no visual gain at all. So the whole train is six
// draws: the lead car, the three trailing cars as one instanced mesh, and
// the sixteen passengers as four (torsos, heads, hair, arms) — every one
// with its own colour, and every arm still free to go up on the airtime.
//
// That means the car transforms are composed here rather than left to the
// scene graph, which is why update() takes the sim: it walks the train
// back along the centreline itself.
// ------------------------------------------------------------

const SHIRTS = [
  0xd94f3d, 0x2f8ac6, 0xf0b429, 0x59b361, 0xb267c9, 0xe8e2d2,
  0x3f4a56, 0xe86a52, 0x36b3a8, 0xc9518c,
];
const SKINS = [0xf0c39a, 0xdba579, 0xb9825a, 0x8d5f3c, 0x60422c];
const HAIRS = [0x2b2119, 0x6a4a2c, 0xa8763f, 0x30323a, 0x8d8f96];

// Where the passengers sit, in car-local metres.
const SEATS = [
  { x: 0.42, z: 0.62 }, { x: -0.42, z: 0.62 },
  { x: 0.42, z: -0.72 }, { x: -0.42, z: -0.72 },
];
const SEAT_Y = 0.95;
const SHOULDER_Y = 0.42;
const CAR_SPACING = 3.45;

function carParts(livery, lead) {
  const parts = [
    part(new THREE.BoxGeometry(1.8, 0.78, 3.15), livery.car, [0, 0.66, 0]),
    part(new THREE.BoxGeometry(1.86, 0.3, 3.2), livery.trim, [0, 0.34, 0]),
    part(new THREE.BoxGeometry(1.3, 0.34, 2.8), livery.trim, [0, 0.1, 0]),
  ];
  // Wheels: running, side and up-stop, the classic three-wheel bogie.
  for (const z of [-1.0, 1.0]) {
    for (const side of [-1, 1]) {
      parts.push(part(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 7), 0x1e2226,
        [side * 0.62, -0.03, z], [1, 1, 1], [0, 0, Math.PI / 2]));
      parts.push(part(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 6), 0x1e2226,
        [side * 0.78, -0.24, z]));
    }
  }
  // Seat backs and the over-the-shoulder restraints.
  for (const seat of SEATS) {
    parts.push(part(new THREE.BoxGeometry(0.62, 0.14, 0.14), livery.trim,
      [seat.x, SEAT_Y + 0.37, seat.z + 0.28]));
    parts.push(part(new THREE.BoxGeometry(0.12, 0.5, 0.12), livery.trim,
      [seat.x, SEAT_Y + 0.17, seat.z + 0.34]));
  }
  for (const z of [0.1, -1.24]) {
    parts.push(part(new THREE.BoxGeometry(1.6, 0.62, 0.16), livery.trim, [0, 1.15, z]));
  }
  if (lead) {
    parts.push(part(new THREE.ConeGeometry(0.78, 1.5, 4), livery.car,
      [0, 0.66, 2.2], [1, 1, 1], [Math.PI / 2, Math.PI / 4, 0]));
    parts.push(part(new THREE.BoxGeometry(1.3, 0.34, 0.14), 0x9fd4e8, [0, 0.95, 1.62]));
    for (const side of [-1, 1]) {
      parts.push(part(new THREE.SphereGeometry(0.15, 7, 5), 0xfff3cf, [side * 0.5, 0.55, 2.3]));
    }
  }
  return parts;
}

export function buildTrain(carCount, seed = 1) {
  const livery = liveryFor(seed);
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.38, metalness: 0.32,
  });
  const riderMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  const lead = new THREE.Mesh(mergeParts(carParts(livery, true)), bodyMaterial);
  lead.castShadow = true;
  lead.matrixAutoUpdate = false;
  group.add(lead);

  const trailingCount = Math.max(0, carCount - 1);
  const trailing = new THREE.InstancedMesh(
    mergeParts(carParts(livery, false)), bodyMaterial, Math.max(1, trailingCount),
  );
  trailing.count = trailingCount;
  trailing.castShadow = true;
  trailing.frustumCulled = false;
  group.add(trailing);

  // The passengers. Each part is its own instanced mesh purely so that
  // shirts, skin and hair can be tinted independently.
  let riderSeed = (seed >>> 0) || 1;
  const random = () => {
    riderSeed = (riderSeed * 1664525 + 1013904223) >>> 0;
    return riderSeed / 4294967296;
  };
  // Each layer goes through mergeParts even when it is a single shape,
  // because that is what bakes the white vertex colour the shared
  // material multiplies the per-rider tint into.
  const riderCount = carCount * SEATS.length;
  const layers = {
    torso: mergeParts([
      part(new THREE.CylinderGeometry(0.17, 0.21, 0.46, 6), 0xffffff, [0, 0.23, 0]),
    ]),
    head: mergeParts([
      part(new THREE.SphereGeometry(0.155, 8, 6), 0xffffff, [0, 0.6, 0]),
    ]),
    hair: mergeParts([
      part(new THREE.SphereGeometry(0.163, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), 0xffffff, [0, 0.605, 0]),
    ]),
    arms: mergeParts([
      part(new THREE.CylinderGeometry(0.055, 0.05, 0.42, 5), 0xffffff, [0.2, -0.21, 0], [1, 1, 1], [0, 0, 0.14]),
      part(new THREE.CylinderGeometry(0.055, 0.05, 0.42, 5), 0xffffff, [-0.2, -0.21, 0], [1, 1, 1], [0, 0, -0.14]),
    ]),
  };

  const riders = [];
  const meshes = {};
  const tint = new THREE.Color();
  for (const name of ["torso", "head", "hair", "arms"]) {
    const mesh = new THREE.InstancedMesh(layers[name], riderMaterial, riderCount);
    mesh.castShadow = name === "torso";
    mesh.frustumCulled = false;
    meshes[name] = mesh;
    group.add(mesh);
  }
  for (let i = 0; i < riderCount; i++) {
    const skin = SKINS[Math.floor(random() * SKINS.length)];
    meshes.torso.setColorAt(i, tint.set(SHIRTS[Math.floor(random() * SHIRTS.length)]));
    meshes.head.setColorAt(i, tint.set(skin));
    meshes.arms.setColorAt(i, tint.set(skin));
    meshes.hair.setColorAt(i, tint.set(HAIRS[Math.floor(random() * HAIRS.length)]));
    riders.push({
      seat: SEATS[i % SEATS.length],
      // Deliberately back to front: the lead car's four passengers are the
      // LAST instances, so hiding them in the front-seat view is a matter
      // of drawing four fewer.
      car: carCount - 1 - Math.floor(i / SEATS.length),
      // Not everybody throws their hands up, and the ones who do are not
      // in time with each other.
      bravery: 0.35 + random() * 0.85,
      phase: random() * Math.PI * 2,
    });
  }
  for (const name of ["torso", "head", "hair", "arms"]) {
    if (meshes[name].instanceColor) meshes[name].instanceColor.needsUpdate = true;
  }

  const carMatrices = Array.from({ length: carCount }, () => new THREE.Matrix4());
  const scratch = {
    matrix: new THREE.Matrix4(),
    local: new THREE.Matrix4(),
    lat: new THREE.Vector3(),
    up: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    pos: new THREE.Vector3(),
  };

  return {
    group,
    cars: carCount,

    // Walk the train back along the centreline from the rider's position,
    // then hang everyone off the car they are sitting in.
    update(sim, s, ride, elapsed, hideLead) {
      for (let i = 0; i < carCount; i++) {
        const sample = sim.sample(s - i * CAR_SPACING);
        scratch.up.set(sample.up.x, sample.up.y, sample.up.z);
        scratch.fwd.set(sample.fwd.x, sample.fwd.y, sample.fwd.z);
        scratch.lat.crossVectors(scratch.fwd, scratch.up).normalize();
        scratch.pos.set(sample.pos.x, sample.pos.y, sample.pos.z)
          .addScaledVector(scratch.up, 0.2);
        const matrix = carMatrices[i];
        matrix.makeBasis(scratch.lat, scratch.up, scratch.fwd);
        matrix.setPosition(scratch.pos);
        if (i === 0) lead.matrix.copy(matrix);
        else trailing.setMatrixAt(i - 1, matrix);
      }
      lead.matrixWorldNeedsUpdate = true;
      lead.visible = !hideLead;
      trailing.instanceMatrix.needsUpdate = true;

      // Airtime puts hands in the air; heavy positive g presses everyone
      // down into the seat.
      const gForce = ride.gForce ?? 1;
      const excited = ride.mode === "free"
        ? Math.min(1, Math.max(0, (1.15 - gForce) / 1.3)) : 0;
      const pressed = Math.min(1, Math.max(0, (gForce - 2.2) / 2.4));
      const jitter = Math.min(1, (ride.v ?? 0) / 26);

      for (let i = 0; i < riders.length; i++) {
        const rider = riders[i];
        const car = carMatrices[rider.car];
        const raise = Math.min(1, excited * rider.bravery);
        const wobble = Math.sin(elapsed * 9 + rider.phase) * 0.11 * jitter;
        const y = SEAT_Y - pressed * 0.05;
        // Riders sit facing forwards, so a per-seat yaw is not needed:
        // the only articulation is the lean and the arms.
        scratch.local.makeRotationX(pressed * 0.2 - raise * 0.12);
        scratch.local.setPosition(rider.seat.x, y, rider.seat.z);
        scratch.matrix.multiplyMatrices(car, scratch.local);
        meshes.torso.setMatrixAt(i, scratch.matrix);
        meshes.head.setMatrixAt(i, scratch.matrix);
        meshes.hair.setMatrixAt(i, scratch.matrix);

        scratch.local.makeRotationX(-raise * 2.75 + wobble * raise);
        scratch.local.setPosition(rider.seat.x, y + SHOULDER_Y, rider.seat.z);
        scratch.matrix.multiplyMatrices(car, scratch.local);
        meshes.arms.setMatrixAt(i, scratch.matrix);
      }
      // In the front seat the rider's own car is hidden so it does not
      // fill the lens — and so are the four people in it. The riders are
      // laid out car by car, so the lead car's four are simply the first
      // four instances, and dropping the count leaves them out.
      const shown = hideLead ? riderCount - SEATS.length : riderCount;
      for (const name of ["torso", "head", "hair", "arms"]) {
        meshes[name].instanceMatrix.needsUpdate = true;
        meshes[name].count = shown;
      }
    },
  };
}
