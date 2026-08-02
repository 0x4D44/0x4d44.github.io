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
import { carveTube, mergeParts, part } from "./mesh.js";
import { BORE_RADIUS, enclosureProfile, hillBump, supportColumns, tunnelSite } from "./track.js";

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
function sweptTube(centres, ups, tangents, radius, radialSegments, closed = true) {
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

  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < radialSegments; j++) {
      const j2 = (j + 1) % radialSegments;
      const a = i * radialSegments + j;
      const b = i * radialSegments + j2;
      const c = i2 * radialSegments + j2;
      const d = i2 * radialSegments + j;
      // Wound a-d-c / a-c-b, NOT a-b-c / a-c-d. `lateral` here is
      // tangent x up, which is a left-handed frame, so the obvious
      // winding puts every normal on the INSIDE of the tube: the rails,
      // the spine and the tunnel bore all rendered their far inner wall
      // instead of their near outer one, lit inside out.
      indices.push(a, d, c, a, c, b);
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

// Contiguous runs of samples carrying one role, as arrays of indices.
// The circuit is closed, so a run may wrap past the start line.
function roleSpans(track, role) {
  const n = track.roles.length;
  const spans = [];
  for (let i = 0; i < n; i++) {
    if (track.roles[i] !== role || track.roles[(i - 1 + n) % n] === role) continue;
    const span = [];
    for (let k = 0; k < n && track.roles[(i + k) % n] === role; k++) span.push((i + k) % n);
    if (span.length > 4) spans.push(span);
  }
  return spans;
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

  // ---- the chain, running under each lift ----
  //
  // A circuit can carry a second chain halfway round, so the strip is
  // built once per CONTIGUOUS run of lift samples. One strip over every
  // lift sample would lace the two together with a ribbon straight across
  // the park.
  for (const lift of roleSpans(track, "lift")) {
    {
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

  // ---- the launch: stator fins down both sides of the spine ----
  //
  // A linear synchronous motor is a pair of stator beams the train's fins
  // run between, so it reads as a corridor of steel rather than a chain.
  {
    const stators = [];
    const lat = new THREE.Vector3();
    const up = new THREE.Vector3();
    const tan = new THREE.Vector3();
    for (const launch of roleSpans(track, "launch")) {
      for (let k = 0; k < launch.length; k += 2) {
        const i = launch[k];
        const p = track.points[i];
        up.set(track.ups[i].x, track.ups[i].y, track.ups[i].z);
        tan.set(track.tangents[i].x, track.tangents[i].y, track.tangents[i].z);
        lat.crossVectors(tan, up).normalize();
        for (const side of [-1, 1]) {
          const base = {
            x: p.x + lat.x * side * 0.62 - up.x * 0.95,
            y: p.y + lat.y * side * 0.62 - up.y * 0.95,
            z: p.z + lat.z * side * 0.62 - up.z * 0.95,
          };
          stators.push([base, {
            x: base.x + up.x * 0.75, y: base.y + up.y * 0.75, z: base.z + up.z * 0.75,
          }, 0.3]);
        }
      }
    }
    if (stators.length) {
      group.add(instancedSpans(stators, new THREE.MeshStandardMaterial({
        color: 0x3f7fbf, roughness: 0.35, metalness: 0.75,
      }), 0.3, plateGeo));
    }
  }

  // ---- a tunnel, bored through a hillside ----
  //
  // track.js picks the site (see tunnelSite); everything here is just
  // building what it decided.
  const keepOuts = [];
  let tunnelSpan = null;
  {
    const site = tunnelSite(track, groundHeight);
    if (site) {
      const { span, hill: hillShape } = site;
      tunnelSpan = span;
      const centres = span.map((i) => track.points[i]);
      const ups = span.map((i) => track.ups[i]);
      const tangents = span.map((i) => track.tangents[i]);

      const bore = new THREE.Mesh(
        sweptTube(centres, ups, tangents, BORE_RADIUS, 10, false),
        new THREE.MeshStandardMaterial({
          color: 0x35302c, roughness: 0.96, side: THREE.DoubleSide,
        }),
      );
      bore.receiveShadow = true;
      group.add(bore);

      // Portals, and a string of lamps so the bore is lit rather than
      // simply black.
      // A chunky stone arch at each mouth, so the entrance reads as a
      // portal rather than as a pipe poking out of a lawn.
      const portalMat = new THREE.MeshStandardMaterial({ color: 0x8c8377, roughness: 0.92 });
      for (const end of [0, span.length - 1]) {
        const portal = new THREE.Mesh(new THREE.TorusGeometry(BORE_RADIUS + 0.55, 1.15, 5, 14), portalMat);
        const p = centres[end];
        const tan = tangents[end];
        portal.position.set(p.x, p.y, p.z);
        portal.lookAt(p.x + tan.x, p.y + tan.y, p.z + tan.z);
        portal.castShadow = true;
        portal.receiveShadow = true;
        group.add(portal);
        // A keystone lintel over it.
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.6), portalMat);
        lintel.position.set(p.x, p.y + BORE_RADIUS + 1.5, p.z);
        lintel.lookAt(p.x + tan.x, p.y + BORE_RADIUS + 1.5 + tan.y, p.z + tan.z);
        lintel.castShadow = true;
        group.add(lintel);
      }
      const lampMesh = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.26, 6, 5),
        new THREE.MeshStandardMaterial({
          color: 0xffe7b0, emissive: 0xffca6a, emissiveIntensity: 1.5,
        }),
        Math.ceil(span.length / 6) + 1,
      );
      let placed = 0;
      const lampMatrix = new THREE.Matrix4();
      for (let k = 3; k < span.length - 2; k += 6) {
        const i = span[k];
        const p = track.points[i];
        const up = track.ups[i];
        lampMatrix.makeTranslation(p.x + up.x * 2.7, p.y + up.y * 2.7, p.z + up.z * 2.7);
        lampMesh.setMatrixAt(placed++, lampMatrix);
      }
      lampMesh.count = placed;
      if (placed) group.add(lampMesh);

      // The hill itself. A third of it is below ground, which is what
      // gives it a shoulder rather than a dome sitting on the grass.
      //
      // And it has a HOLE in it. A tube drawn inside a closed dome is not
      // a tunnel: the bore is hidden inside solid geometry, and riding in
      // you punch through the green skin of the hill — which is exactly
      // what "we crash through the grass" looks like from the front seat.
      // There is no CSG here to subtract one from the other, so the hole
      // is cut by hand: build the hill in WORLD space, then throw away
      // every triangle whose centroid lies within the bore.
      //
      // The ellipsoid comes from the site verbatim (site.hill), never
      // re-derived here: tunnelSite proved that no track outside the
      // span is inside THAT shape, and a second derivation is a second
      // chance for the two to drift apart.
      const hillGeo = new THREE.IcosahedronGeometry(1, 3);
      const hp = hillGeo.attributes.position;
      for (let i = 0; i < hp.count; i++) {
        const x = hp.getX(i);
        const y = hp.getY(i);
        const z = hp.getZ(i);
        // Lumpy, not spherical: a smooth dome reads as a balloon. The
        // displacement comes from track.js, which used the very same
        // function to prove no other track is inside this surface.
        const bump = hillBump(x, y, z);
        hp.setXYZ(
          i,
          hillShape.x + x * bump * hillShape.rx,
          hillShape.y + y * bump * hillShape.ry,
          hillShape.z + z * bump * hillShape.rz,
        );
      }

      const boredHill = carveTube(hillGeo, centres, BORE_RADIUS + 1.0);
      hillGeo.dispose();

      const hill = new THREE.Mesh(
        boredHill,
        // Open at both mouths now, so the inside face has to be drawn or
        // the hill would vanish from within.
        new THREE.MeshLambertMaterial({
          color: 0x6f8f4c, flatShading: true, side: THREE.DoubleSide,
        }),
      );
      hill.castShadow = true;
      hill.receiveShadow = true;
      group.add(hill);
      // A scatter of boulders round each mouth, where the rock was cut.
      const boulders = [];
      const boulderMatrix = new THREE.Matrix4();
      for (const end of [0, span.length - 1]) {
        const p = centres[end];
        const tan = tangents[end];
        for (let b = 0; b < 5; b++) {
          const a = (b / 5) * Math.PI * 2 + end;
          boulders.push({
            x: p.x + Math.cos(a) * 6.5 + tan.x * 2,
            y: groundHeight(p.x, p.z) + 0.4,
            z: p.z + Math.sin(a) * 6.5 + tan.z * 2,
            s: 0.9 + (b % 3) * 0.5,
          });
        }
      }
      const rocks = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshLambertMaterial({ color: 0x8a8073, flatShading: true }),
        boulders.length,
      );
      rocks.castShadow = true;
      rocks.receiveShadow = true;
      boulders.forEach((b, i) => {
        boulderMatrix.makeScale(b.s, b.s * 0.75, b.s);
        boulderMatrix.setPosition(b.x, b.y, b.z);
        rocks.setMatrixAt(i, boulderMatrix);
      });
      group.add(rocks);

      keepOuts.push({ x: hillShape.x, z: hillShape.z, radius: hillShape.rx + 3 });
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

  // How boxed-in the track is, sample by sample — the trailing cameras
  // read it and duck. Computed in track.js, where it can be tested.
  const enclosure = enclosureProfile(track, stationIdx, tunnelSpan);

  return { group, updaters, livery, stationIdx, keepOuts, enclosure };
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

// The car floats this far up its own frame, so anything placed in
// car-local metres has to be lifted by it too.
export const CAR_RIDE_HEIGHT = 0.2;

// Where a rider's eyes are, in car-local metres — the middle of the row,
// between the two seats, at head height. The POV camera goes HERE rather
// than a metre behind the car: sit outside the bodywork and the ride
// stops feeling like a ride and starts feeling like a drone shot.
//
// The back row is higher for a reason that is pure framing. It sits
// right behind its own over-the-shoulder bar (the one at z = 0.1 in
// carParts) — 1.6m wide and 0.8m in front of your face, so at the front
// row's eye height it blanks the bottom third of the frame. Half a head
// higher and it drops to a rail across the nose, which is what it looks
// like from the seat.
export const EYES = {
  front: { y: CAR_RIDE_HEIGHT + SEAT_Y + 0.55, z: 0.62 },
  back: { y: CAR_RIDE_HEIGHT + SEAT_Y + 0.86, z: -0.72 },
};

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

// ------------------------------------------------------------
// Lost property.
//
// Once in a while, at the exact moment the floor drops away, somebody's
// wig or somebody's glasses leave the train. From there they are on their
// own: thrown forward at the speed the train was doing, tumbling, and
// falling under gravity until they hit the grass, where they stay for a
// while as evidence. The rider gets their wig back at the station and is
// visibly bare-headed until then.
//
// Rare on purpose. It should be a thing you eventually notice, not a
// thing that happens every lap.
// ------------------------------------------------------------
const LOST_CHANCE = 0.05;       // per frame of a qualifying moment
const LOST_COOLDOWN = 40;       // seconds before it can happen again
const LOST_LINGER = 14;         // seconds it lies on the grass

function makeLostProperty(group, groundHeight) {
  const wig = new THREE.Mesh(
    mergeParts([
      part(new THREE.SphereGeometry(0.17, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), 0xffffff),
      part(new THREE.TorusGeometry(0.16, 0.035, 5, 10), 0xffffff, [0, 0.02, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
    ]),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  const glasses = new THREE.Mesh(
    mergeParts([
      part(new THREE.TorusGeometry(0.075, 0.018, 5, 10), 0x2a2d33, [0.085, 0, 0]),
      part(new THREE.TorusGeometry(0.075, 0.018, 5, 10), 0x2a2d33, [-0.085, 0, 0]),
      part(new THREE.BoxGeometry(0.06, 0.016, 0.016), 0x2a2d33),
      part(new THREE.BoxGeometry(0.016, 0.016, 0.2), 0x2a2d33, [0.15, 0, -0.1]),
      part(new THREE.BoxGeometry(0.016, 0.016, 0.2), 0x2a2d33, [-0.15, 0, -0.1]),
    ]),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  for (const item of [wig, glasses]) {
    item.visible = false;
    item.castShadow = true;
    group.add(item);
  }

  const flying = { item: null, resting: 0 };
  const velocity = new THREE.Vector3();
  const spin = new THREE.Vector3();
  const world = new THREE.Vector3();
  let cooldown = LOST_COOLDOWN * 0.5;
  let previous = -1;

  return {
    update(riderList, carMatrices, ride, elapsed) {
      const dt = previous < 0 ? 0 : Math.min(0.2, Math.max(0, elapsed - previous));
      previous = elapsed;
      if (dt === 0) return;

      if (flying.item) {
        if (flying.resting > 0) {
          flying.resting -= dt;
          if (flying.resting <= 0) {
            flying.item.visible = false;
            flying.item = null;
          }
        } else {
          velocity.y -= 9.81 * dt;
          flying.item.position.addScaledVector(velocity, dt);
          flying.item.rotation.x += spin.x * dt;
          flying.item.rotation.y += spin.y * dt;
          flying.item.rotation.z += spin.z * dt;
          const floor = groundHeight(flying.item.position.x, flying.item.position.z) + 0.12;
          if (flying.item.position.y <= floor) {
            flying.item.position.y = floor;
            flying.item.rotation.set(Math.PI / 2, flying.item.rotation.y, 0);
            flying.resting = LOST_LINGER;
          }
        }
        return;
      }

      cooldown -= dt;
      if (cooldown > 0) return;
      // The moment the restraints go light, at speed.
      const airborne = ride.mode === "free" && (ride.gForce ?? 1) < 0.25 && (ride.v ?? 0) > 17;
      if (!airborne || Math.random() > LOST_CHANCE * dt * 60) return;

      const wearing = riderList.filter((r) => r.hat);
      if (!wearing.length) return;
      const rider = wearing[Math.floor(Math.random() * wearing.length)];
      const takeWig = Math.random() < 0.5;
      const item = takeWig ? wig : glasses;
      const car = carMatrices[rider.car];

      world.set(rider.seat.x, SEAT_Y + (takeWig ? 0.62 : 0.58), rider.seat.z).applyMatrix4(car);
      item.position.copy(world);
      item.rotation.set(0, 0, 0);
      item.visible = true;
      if (takeWig) {
        item.material.color.setHex(rider.hairColor);
        rider.hat = false;
      }
      // Thrown along the train's heading — the third column of the car's
      // basis — with a kick upwards and a bit of sideways luck.
      velocity.set(car.elements[8], car.elements[9], car.elements[10])
        .multiplyScalar((ride.v ?? 0) * 0.92)
        .add(new THREE.Vector3(
          (Math.random() - 0.5) * 3,
          2.5 + Math.random() * 2.5,
          (Math.random() - 0.5) * 3,
        ));
      spin.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
      );
      flying.item = item;
      flying.resting = 0;
      cooldown = LOST_COOLDOWN;
    },
  };
}

export function buildTrain(carCount, seed = 1, groundHeight = () => 0) {
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
    const hair = HAIRS[Math.floor(random() * HAIRS.length)];
    meshes.torso.setColorAt(i, tint.set(SHIRTS[Math.floor(random() * SHIRTS.length)]));
    meshes.head.setColorAt(i, tint.set(skin));
    meshes.arms.setColorAt(i, tint.set(skin));
    meshes.hair.setColorAt(i, tint.set(hair));
    riders.push({
      seat: SEATS[i % SEATS.length],
      hairColor: hair,
      // Still wearing it. See makeLostProperty.
      hat: true,
      // How keen they are to wave at the crowd on the way up.
      waves: random() < 0.55 ? 0.6 + random() * 0.6 : 0,
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
    arm: new THREE.Matrix4(),
    lat: new THREE.Vector3(),
    up: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    pos: new THREE.Vector3(),
  };
  const lostProperty = makeLostProperty(group, groundHeight);

  return {
    group,
    cars: carCount,

    // Walk the train back along the centreline from the rider's position,
    // then hang everyone off the car they are sitting in.
    // `hiddenCar` is the index of the car the camera is sitting in, or
    // -1 when the camera is outside the train.
    update(sim, s, ride, elapsed, hiddenCar = -1) {
      for (let i = 0; i < carCount; i++) {
        const sample = sim.sample(s - i * CAR_SPACING);
        scratch.up.set(sample.up.x, sample.up.y, sample.up.z);
        scratch.fwd.set(sample.fwd.x, sample.fwd.y, sample.fwd.z);
        // up x fwd, not fwd x up: the latter is left-handed, and a car
        // built on it is MIRRORED — every triangle wound backwards, so
        // the outer skin is back-facing and gets culled. Looking up at
        // the train you saw straight through the side walls into the
        // seats.
        scratch.lat.crossVectors(scratch.up, scratch.fwd).normalize();
        scratch.pos.set(sample.pos.x, sample.pos.y, sample.pos.z)
          .addScaledVector(scratch.up, CAR_RIDE_HEIGHT);
        const matrix = carMatrices[i];
        matrix.makeBasis(scratch.lat, scratch.up, scratch.fwd);
        matrix.setPosition(scratch.pos);
        if (i === 0) {
          lead.matrix.copy(matrix);
        } else if (i === hiddenCar) {
          // Scaled to nothing rather than skipped: the instance has to be
          // written every frame either way.
          scratch.local.makeScale(0, 0, 0);
          scratch.matrix.multiplyMatrices(matrix, scratch.local);
          trailing.setMatrixAt(i - 1, scratch.matrix);
        } else {
          trailing.setMatrixAt(i - 1, matrix);
        }
      }
      lead.matrixWorldNeedsUpdate = true;
      lead.visible = hiddenCar !== 0;
      trailing.instanceMatrix.needsUpdate = true;

      // What the riders are doing depends on what the ride is doing:
      //
      //   airtime      hands up, hard
      //   heavy g      pressed down into the seat, arms in
      //   the chain    bored, so they wave at the people below
      //   the launch   braced, then hands up as it lets go
      //   the station  waving at whoever is waiting on the platform
      //
      // The wave is a roll of the shoulders rather than a raise, which is
      // what makes it read as waving rather than as more airtime.
      const gForce = ride.gForce ?? 1;
      const speed = ride.v ?? 0;
      const mode = ride.mode;
      const excited = mode === "free"
        ? Math.min(1, Math.max(0, (1.15 - gForce) / 1.3)) : 0;
      const pressed = Math.min(1, Math.max(0, (gForce - 2.2) / 2.4));
      const jitter = Math.min(1, speed / 26);
      // Slow and safe: a good moment to wave at the crowd.
      const waving = (mode === "lift" || mode === "station") ? 1
        : mode === "launch" ? 0
          : Math.max(0, 1 - speed / 12) * 0.5;

      for (let i = 0; i < riders.length; i++) {
        const rider = riders[i];
        const car = carMatrices[rider.car];
        const raise = Math.min(1, excited * rider.bravery);
        const wobble = Math.sin(elapsed * 9 + rider.phase) * 0.11 * jitter;
        // Not everyone waves, and never quite together.
        const wave = waving * rider.waves;
        const swing = Math.sin(elapsed * 5.2 + rider.phase * 2) * wave;
        const y = SEAT_Y - pressed * 0.05;
        // Riders sit facing forwards, so a per-seat yaw is not needed:
        // the only articulation is the lean and the arms.
        scratch.local.makeRotationX(pressed * 0.2 - raise * 0.12);
        scratch.local.setPosition(rider.seat.x, y, rider.seat.z);
        scratch.matrix.multiplyMatrices(car, scratch.local);
        meshes.torso.setMatrixAt(i, scratch.matrix);
        meshes.head.setMatrixAt(i, scratch.matrix);
        if (rider.hat) meshes.hair.setMatrixAt(i, scratch.matrix);

        const lift = Math.max(raise, wave * 0.8);
        scratch.local.makeRotationX(-lift * 2.75 + wobble * raise);
        scratch.arm.makeRotationZ(swing * 0.55);
        scratch.local.multiply(scratch.arm);
        scratch.local.setPosition(rider.seat.x, y + SHOULDER_Y, rider.seat.z);
        scratch.matrix.multiplyMatrices(car, scratch.local);
        meshes.arms.setMatrixAt(i, scratch.matrix);

        // Nobody is drawn in the car the camera is sitting in.
        if (rider.car === hiddenCar) {
          scratch.local.makeScale(0, 0, 0);
          scratch.matrix.multiplyMatrices(car, scratch.local);
          for (const name of ["torso", "head", "hair", "arms"]) {
            meshes[name].setMatrixAt(i, scratch.matrix);
          }
          continue;
        }

        // A rider who has lost their hat keeps it off until the train
        // gets back to the station, where they sheepishly retrieve it.
        if (!rider.hat) {
          scratch.local.makeScale(0, 0, 0);
          scratch.local.setPosition(rider.seat.x, y, rider.seat.z);
          scratch.matrix.multiplyMatrices(car, scratch.local);
          meshes.hair.setMatrixAt(i, scratch.matrix);
          if (mode === "station") rider.hat = true;
        }
      }
      lostProperty.update(riders, carMatrices, ride, elapsed);
      for (const name of ["torso", "head", "hair", "arms"]) {
        meshes[name].instanceMatrix.needsUpdate = true;
      }
    },
  };
}
