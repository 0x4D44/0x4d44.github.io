// ============================================================
// Iron Vertex — the park the coaster stands in.
//
// Everything here is generated: no textures are loaded, no models are
// fetched. Textures are drawn on a canvas in code, and the trees, crowd
// and skyline are merged into a handful of instanced meshes so that a few
// thousand objects cost a few dozen draw calls.
//
// The world is laid out in rings, because the coaster's own footprint is
// only known at run time:
//
//   r <  27   the infield — always inside the plan curve, so a bandstand
//             and a picnic lawn can stand there unconditionally
//   r < 190   coaster ground: mown grass and nothing solid
//   r ~ 220   the midway — gravel path, stalls, tents, lamps, crowd
//   r ~ 270   the big rides: wheel, carousel, drop tower
//   r > 300   countryside, a lake, a town on the horizon, hills beyond
//
// The plan curve can reach 190 m, so the midway is close enough to be
// caught by a big circuit. Anything that could be fouled registers as a
// prop with a keep-out radius, and carve() hides whatever the track
// actually runs through — the same treatment the trees have always had.
// ============================================================

import * as THREE from "./three.module.min.js";
import { canvasTexture, instance, mergeParts, part, vertexLit } from "./mesh.js";

export const PARK_RADIUS = 470;
export const WATER_LEVEL = -6.5;

const LAKE = { x: -330, z: 225, radius: 140 };
const MIDWAY = 220;
const INFIELD = 27;

// ------------------------------------------------------------
// Terrain
// ------------------------------------------------------------

export function scatterRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

// Smoothstep, which also runs backwards when edge0 > edge1.
function ramp(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function groundHeight(x, z) {
  // Flat where the coaster stands, gently rolling further out, so the
  // horizon has shape without the track ever burying itself.
  const d = Math.hypot(x, z);
  const rise = ramp(170, 380, d);
  const rolling = (
    Math.sin(x * 0.0075) * Math.cos(z * 0.0061) * 13 +
    Math.sin(x * 0.019 + 1.7) * Math.cos(z * 0.017 - 0.6) * 4 +
    Math.sin(x * 0.041 - 0.4) * Math.cos(z * 0.037 + 2.2) * 1.6
  ) * rise;
  // The lake sits in a basin scooped out of the far countryside.
  const basin = ramp(LAKE.radius, LAKE.radius * 0.3, Math.hypot(x - LAKE.x, z - LAKE.z));
  return rolling - 34 * basin;
}

// ------------------------------------------------------------
// Textures, drawn in code
// ------------------------------------------------------------

function grassTexture() {
  // Tufts, not noise: a wash of short strokes reads as grass at any
  // distance and tiles without an obvious seam.
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4800; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const shade = Math.round(196 + Math.random() * 58);
      ctx.strokeStyle = `rgba(${shade}, ${shade}, ${shade - 14}, 0.45)`;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 1.4 - Math.random() * 2.6);
      ctx.stroke();
    }
  }, [120, 120]);
}

function stripeTexture(a, b, count = 10) {
  return canvasTexture(128, 32, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    for (let i = 0; i < count; i += 2) ctx.fillRect((i / count) * w, 0, w / count, h);
  });
}

// ------------------------------------------------------------
// The world
// ------------------------------------------------------------

export function buildWorld() {
  const group = new THREE.Group();
  const updaters = [];
  const props = [];
  const carveable = [];

  const registerProp = (object, x, z, keepOut) => {
    props.push({ object, x, z, keepOut });
    return object;
  };

  // ---- sun and sky ----------------------------------------------------
  const sunDirection = new THREE.Vector3(-0.44, 0.55, 0.36).normalize();
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.5);
  sun.position.copy(sunDirection).multiplyScalar(320);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 60;
  sun.shadow.camera.far = 720;
  sun.shadow.camera.left = -230;
  sun.shadow.camera.right = 230;
  sun.shadow.camera.top = 230;
  sun.shadow.camera.bottom = -230;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.6;
  group.add(sun);
  group.add(sun.target);
  group.add(new THREE.HemisphereLight(0xcfe6ff, 0x51703d, 1.0));
  // A cool counter-light from the shadow side, so nothing goes flat black.
  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.38);
  fill.position.set(150, 95, -180);
  group.add(fill);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color("#1c5aa8") },
        middle: { value: new THREE.Color("#8dbfe8") },
        horizon: { value: new THREE.Color("#e6dcc4") },
        sunColor: { value: new THREE.Color("#fff4d2") },
        sunDir: { value: sunDirection.clone() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vDir = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 middle;
        uniform vec3 horizon;
        uniform vec3 sunColor;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, -1.0, 1.0);
          vec3 col = mix(middle, top, clamp(h * 1.5, 0.0, 1.0));
          col = mix(col, horizon, pow(clamp(1.0 - h, 0.0, 1.0), 7.0));
          float d = max(dot(dir, sunDir), 0.0);
          col += sunColor * pow(d, 900.0) * 2.6;   // the disc itself
          col += sunColor * pow(d, 26.0) * 0.42;   // the glare around it
          col += sunColor * pow(d, 3.0) * 0.09;    // haze over that half of the sky
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  group.add(sky);

  // ---- ground ---------------------------------------------------------
  const shades = {
    grass: new THREE.Color("#79a94a"),
    far: new THREE.Color("#8db65f"),
    dry: new THREE.Color("#a5b565"),
    gravel: new THREE.Color("#bdb197"),
    sand: new THREE.Color("#d9cba3"),
    rock: new THREE.Color("#8d998a"),
  };
  {
    const size = PARK_RADIUS * 2.9;
    const segments = 150;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const position = geo.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const shade = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const y = groundHeight(x, z);
      position.setY(i, y);
      const d = Math.hypot(x, z);

      shade.copy(shades.grass).lerp(shades.far, ramp(140, PARK_RADIUS, d));
      shade.lerp(shades.dry, ramp(250, 70, d) * 0.5);              // worn ground round the ride
      shade.lerp(shades.gravel, ramp(15, 5, Math.abs(d - MIDWAY))); // the midway
      const lakeDistance = Math.hypot(x - LAKE.x, z - LAKE.z);
      shade.lerp(shades.sand, ramp(LAKE.radius, LAKE.radius * 0.62, lakeDistance));
      shade.lerp(shades.rock, ramp(9, 18, y) * 0.55);               // exposed tops
      // Break up the flats so mown ground is not one solid green.
      shade.offsetHSL(0, 0, Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.03
        + Math.sin(x * 0.37 + z * 0.29) * 0.018);
      colors[i * 3] = shade.r;
      colors[i * 3 + 1] = shade.g;
      colors[i * 3 + 2] = shade.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: grassTexture(),
    }));
    ground.receiveShadow = true;
    group.add(ground);
  }

  // ---- the lake -------------------------------------------------------
  {
    const geo = new THREE.PlaneGeometry(LAKE.radius * 2.2, LAKE.radius * 2.2, 26, 26);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        time: { value: 0 },
        shallow: { value: new THREE.Color("#63a3b6") },
        deep: { value: new THREE.Color("#1d4a63") },
        sunDir: { value: sunDirection.clone() },
        haze: { value: new THREE.Color("#c8dcea") },
      },
      vertexShader: `
        uniform float time;
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          vec3 p = position;
          // Two crossing wave trains: enough to move and to catch the sun.
          float a = sin(p.x * 0.09 + time * 1.1) * cos(p.z * 0.07 - time * 0.8);
          float b = sin((p.x + p.z) * 0.045 - time * 0.6);
          p.y += a * 0.35 + b * 0.5;
          float dx = cos(p.x * 0.09 + time * 1.1) * 0.0315 + cos((p.x + p.z) * 0.045 - time * 0.6) * 0.0225;
          float dz = -sin(p.z * 0.07 - time * 0.8) * 0.0245 + cos((p.x + p.z) * 0.045 - time * 0.6) * 0.0225;
          vNormal = normalize(vec3(-dx, 1.0, -dz));
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: `
        uniform vec3 shallow;
        uniform vec3 deep;
        uniform vec3 sunDir;
        uniform vec3 haze;
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          vec3 view = normalize(cameraPosition - vWorld);
          vec3 n = normalize(vNormal);
          float fresnel = pow(1.0 - clamp(dot(view, n), 0.0, 1.0), 3.0);
          vec3 col = mix(deep, shallow, fresnel * 0.85 + 0.12);
          vec3 halfway = normalize(sunDir + view);
          col += vec3(1.0, 0.96, 0.86) * pow(max(dot(n, halfway), 0.0), 90.0) * 1.6;
          col = mix(col, haze, clamp((length(cameraPosition - vWorld) - 340.0) / 900.0, 0.0, 0.7));
          gl_FragColor = vec4(col, 0.93);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    water.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
    group.add(water);
    updaters.push((t) => { water.material.uniforms.time.value = t; });
  }

  // ---- the midway path ------------------------------------------------
  {
    const segments = 220;
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const indices = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      for (const [k, r] of [[0, MIDWAY - 6], [1, MIDWAY + 6]]) {
        const x = c * r;
        const z = s * r;
        const o = (i * 2 + k) * 3;
        positions[o] = x;
        positions[o + 1] = groundHeight(x, z) + 0.09;
        positions[o + 2] = z;
      }
      if (i < segments) {
        const b = i * 2;
        indices.push(b, b + 1, b + 3, b, b + 3, b + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const path = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0xc9bda2 }));
    path.receiveShadow = true;
    group.add(path);
  }

  // ---- trees ----------------------------------------------------------
  //
  // Four species, each merged into one geometry and instanced twice: once
  // for the near ring, which casts shadows and can be carved away by the
  // track, and once for the far scatter, which does neither. The shadow
  // pass is the expensive half of a forest, and nothing out beyond the
  // shadow camera contributes to it anyway.
  const species = {
    conifer: mergeParts([
      part(new THREE.CylinderGeometry(0.22, 0.4, 3.4, 6), 0x6a4a33, [0, 1.7, 0]),
      part(new THREE.ConeGeometry(2.9, 5.2, 7), 0x2f6b39, [0, 5.0, 0]),
      part(new THREE.ConeGeometry(2.3, 4.6, 7), 0x357441, [0, 8.0, 0]),
      part(new THREE.ConeGeometry(1.5, 3.8, 7), 0x3d7f47, [0, 10.9, 0]),
    ]),
    broadleaf: mergeParts([
      part(new THREE.CylinderGeometry(0.3, 0.52, 4.2, 5), 0x775138, [0, 2.1, 0]),
      part(new THREE.IcosahedronGeometry(2.8, 0), 0x3f7f38, [0, 6.2, 0], [1.15, 0.95, 1.15]),
      part(new THREE.IcosahedronGeometry(2.1, 0), 0x4a8c3e, [1.9, 5.0, 0.7], [1, 0.9, 1]),
      part(new THREE.IcosahedronGeometry(1.9, 0), 0x376f33, [-1.5, 5.5, -1.2], [1, 0.95, 1]),
    ]),
    poplar: mergeParts([
      part(new THREE.CylinderGeometry(0.18, 0.3, 5.0, 5), 0x8a7256, [0, 2.5, 0]),
      part(new THREE.IcosahedronGeometry(1.9, 0), 0x5b9448, [0, 8.6, 0], [1, 2.4, 1]),
    ]),
    shrub: mergeParts([
      part(new THREE.IcosahedronGeometry(1.2, 0), 0x497f3a, [0, 0.9, 0], [1.3, 0.85, 1.3]),
      part(new THREE.IcosahedronGeometry(0.9, 0), 0x3f7134, [0.9, 0.7, 0.5], [1.1, 0.8, 1.1]),
    ]),
  };

  {
    const rng = scatterRng(0x5eed17);
    const near = { conifer: [], broadleaf: [], poplar: [], shrub: [] };
    const far = { conifer: [], broadleaf: [], poplar: [], shrub: [] };
    const draw = ["broadleaf", "conifer", "broadleaf", "poplar", "conifer", "shrub", "shrub"];
    const tint = new THREE.Color();
    for (let guard = 0, placed = 0; placed < 1500 && guard < 60000; guard++) {
      const angle = rng() * Math.PI * 2;
      const radius = 18 + Math.sqrt(rng()) * (PARK_RADIUS - 18);
      if (Math.abs(radius - MIDWAY) < 12) continue;         // keep the path clear
      if (radius > INFIELD - 5 && radius < 36) continue;    // and the infield lawn
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = groundHeight(x, z);
      if (y < WATER_LEVEL + 1.5) continue;                  // no trees in the lake
      const kind = draw[Math.floor(rng() * draw.length)];
      const s = (kind === "shrub" ? 0.75 : 0.55) + rng() * 0.85;
      tint.setHSL(0.23 + rng() * 0.09, 0.4 + rng() * 0.24, 0.4 + rng() * 0.24);
      (radius < 200 ? near : far)[kind].push({
        x, y: y - 0.15, z,
        s,
        sy: s * (0.85 + rng() * 0.55),
        ry: rng() * Math.PI * 2,
        rz: (rng() - 0.5) * 0.07,
        color: tint.getHex(),
      });
      placed++;
    }
    const material = vertexLit();
    for (const kind of Object.keys(species)) {
      const nearMesh = instance(species[kind], material, near[kind], { shadows: true });
      group.add(nearMesh, instance(species[kind], material, far[kind], { shadows: false }));
      carveable.push({ mesh: nearMesh, placements: near[kind] });
    }
  }

  // ---- little people --------------------------------------------------
  //
  // One merged figure, instanced along the midway and across the infield,
  // each with its own shirt colour and its own idle sway.
  {
    const figure = mergeParts([
      part(new THREE.CylinderGeometry(0.19, 0.26, 0.9, 6), 0xffffff, [0, 0.75, 0]),
      part(new THREE.SphereGeometry(0.17, 7, 6), 0xe8b48c, [0, 1.36, 0]),
      part(new THREE.BoxGeometry(0.36, 0.5, 0.22), 0x3a4152, [0, 0.28, 0]),
    ]);
    const rng = scatterRng(0xc0ffee);
    const placements = [];
    const tint = new THREE.Color();
    for (let i = 0; i < 200; i++) {
      // Two thirds stroll the midway, the rest are out on the infield lawn.
      const onMidway = rng() < 0.66;
      const angle = rng() * Math.PI * 2;
      const radius = onMidway ? MIDWAY + (rng() - 0.5) * 10 : rng() * (INFIELD - 3);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      tint.setHSL(rng(), 0.55, 0.55);
      placements.push({
        x, y: groundHeight(x, z), z,
        s: 0.9 + rng() * 0.25,
        ry: rng() * Math.PI * 2,
        color: tint.getHex(),
        phase: rng() * Math.PI * 2,
      });
    }
    const mesh = instance(figure, vertexLit(), placements, { shadows: false });
    group.add(mesh);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    updaters.push((t) => {
      for (let i = 0; i < placements.length; i++) {
        const p = placements[i];
        const sway = Math.sin(t * 1.6 + p.phase);
        euler.set(0, p.ry + sway * 0.25, sway * 0.03);
        quaternion.setFromEuler(euler);
        position.set(p.x, p.y + Math.abs(sway) * 0.05, p.z);
        scale.setScalar(p.s);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- midway: stalls, tents, lamps, flags ----------------------------
  {
    const rng = scatterRng(0x57a115);
    const awning = [
      stripeTexture("#f4f2ec", "#c0392b"),
      stripeTexture("#f4f2ec", "#2b6ca3"),
      stripeTexture("#f7f3e3", "#2e8b57"),
      stripeTexture("#f7f3e3", "#e08a1e"),
    ];
    const stallBody = new THREE.MeshLambertMaterial({ color: 0xe8e2d2 });
    const stallTrim = new THREE.MeshLambertMaterial({ color: 0x6b4f34 });

    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + 0.12;
      const outside = i % 2 === 0;
      const radius = MIDWAY + (outside ? 12 : -12);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const stall = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 5), stallBody);
      body.position.y = 1.7;
      body.castShadow = true;
      body.receiveShadow = true;
      stall.add(body);
      const roof = new THREE.Mesh(
        new THREE.CylinderGeometry(4.6, 4.6, 5.6, 12, 1, false, 0, Math.PI),
        new THREE.MeshLambertMaterial({ map: awning[i % awning.length] }),
      );
      roof.rotation.z = Math.PI / 2;
      roof.rotation.y = Math.PI / 2;
      roof.position.y = 3.5;
      roof.castShadow = true;
      stall.add(roof);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.3, 1.4), stallTrim);
      counter.position.set(0, 2.0, 3.1);
      stall.add(counter);
      stall.position.set(x, groundHeight(x, z), z);
      stall.rotation.y = -angle + (outside ? Math.PI : 0);
      group.add(registerProp(stall, x, z, 9));
    }

    // Marquees, for the shade.
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + 0.5;
      const radius = MIDWAY + 24 + rng() * 16;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const tent = new THREE.Group();
      const canvasRoof = new THREE.Mesh(
        new THREE.ConeGeometry(8.5, 7, 12),
        new THREE.MeshLambertMaterial({ map: awning[(i + 1) % awning.length] }),
      );
      canvasRoof.position.y = 7.4;
      canvasRoof.castShadow = true;
      tent.add(canvasRoof);
      const walls = new THREE.Mesh(
        new THREE.CylinderGeometry(7.4, 7.4, 4, 12, 1, true),
        new THREE.MeshLambertMaterial({ color: 0xf1ece0, side: THREE.DoubleSide }),
      );
      walls.position.y = 2;
      tent.add(walls);
      tent.position.set(x, groundHeight(x, z), z);
      tent.rotation.y = rng() * Math.PI;
      group.add(registerProp(tent, x, z, 12));
    }

    // Lamp posts and pennants down both sides of the path.
    const lampGeo = mergeParts([
      part(new THREE.CylinderGeometry(0.13, 0.2, 6.4, 6), 0x39434f, [0, 3.2, 0]),
      part(new THREE.SphereGeometry(0.42, 8, 6), 0xfff4cf, [0, 6.7, 0]),
      part(new THREE.TorusGeometry(0.5, 0.07, 4, 10), 0x39434f, [0, 6.7, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
    ]);
    const lamps = [];
    const flags = [];
    for (let i = 0; i < 44; i++) {
      const angle = (i / 44) * Math.PI * 2;
      const radius = MIDWAY + (i % 2 ? 7.4 : -7.4);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      lamps.push({ x, y: groundHeight(x, z), z, ry: -angle });
      if (i % 4 === 0) flags.push({ x, z, angle });
    }
    group.add(instance(lampGeo, vertexLit(), lamps));

    const flagCloth = new THREE.MeshLambertMaterial({ color: 0xd8452c, side: THREE.DoubleSide });
    const flagPole = new THREE.MeshLambertMaterial({ color: 0xb9c0c8 });
    const flagObjects = [];
    for (const f of flags) {
      const pole = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 11, 5), flagPole);
      mast.position.y = 5.5;
      mast.castShadow = true;
      pole.add(mast);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), flagCloth);
      cloth.position.set(1.5, 10, 0);
      pole.add(cloth);
      pole.position.set(f.x, groundHeight(f.x, f.z), f.z);
      pole.rotation.y = -f.angle;
      group.add(pole);
      flagObjects.push(cloth);
    }
    updaters.push((t) => {
      for (let i = 0; i < flagObjects.length; i++) {
        const cloth = flagObjects[i];
        cloth.rotation.y = Math.sin(t * 2.4 + i) * 0.4;
        cloth.rotation.z = Math.sin(t * 3.1 + i * 1.7) * 0.12;
      }
    });
  }

  // ---- the big rides --------------------------------------------------
  {
    // A Ferris wheel, turning. The gondolas hang from the rim, so they
    // counter-rotate: parented to the wheel they would tip their riders
    // out at the top.
    const wheelAngle = 2.2;
    const wx = Math.cos(wheelAngle) * 285;
    const wz = Math.sin(wheelAngle) * 285;
    const wheel = new THREE.Group();
    wheel.position.set(wx, groundHeight(wx, wz), wz);
    wheel.rotation.y = -wheelAngle + Math.PI / 2;
    const radius = 30;
    const hubHeight = 36;
    const steel = new THREE.MeshStandardMaterial({ color: 0xd7dde4, roughness: 0.5, metalness: 0.55 });
    for (const side of [-1, 1]) {
      for (const lean of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, hubHeight * 1.08, 6), steel);
        leg.position.set(lean * 11, hubHeight / 2, side * 4);
        leg.rotation.z = -lean * 0.3;
        leg.castShadow = true;
        wheel.add(leg);
      }
    }
    const rim = new THREE.Group();
    rim.position.y = hubHeight;
    wheel.add(rim);
    for (const side of [-3.2, 3.2]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.45, 6, 40), steel);
      hoop.position.z = side;
      hoop.castShadow = true;
      rim.add(hoop);
    }
    const gondolas = [];
    const gondolaColors = [0xd94f3d, 0xf0a92b, 0x3f8fd0, 0x59b361, 0xb267c9, 0xe8e2d2];
    const spokeCount = 16;
    for (let i = 0; i < spokeCount; i++) {
      const a = (i / spokeCount) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, radius, 4), steel);
      spoke.position.set(Math.cos(a) * radius * 0.5, Math.sin(a) * radius * 0.5, 0);
      spoke.rotation.z = a - Math.PI / 2;
      rim.add(spoke);

      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
      const car = new THREE.Mesh(
        new THREE.CylinderGeometry(1.7, 1.5, 2.4, 8),
        new THREE.MeshStandardMaterial({
          color: gondolaColors[i % gondolaColors.length], roughness: 0.6, metalness: 0.1,
        }),
      );
      car.position.y = -2.6;
      car.castShadow = true;
      pivot.add(car);
      rim.add(pivot);
      gondolas.push(pivot);
    }
    group.add(registerProp(wheel, wx, wz, radius + 8));
    updaters.push((t) => {
      rim.rotation.z = t * 0.16;
      for (const gondola of gondolas) gondola.rotation.z = -rim.rotation.z;
    });

    // A carousel, turning the other way.
    const carouselAngle = 4.1;
    const cx = Math.cos(carouselAngle) * 262;
    const cz = Math.sin(carouselAngle) * 262;
    const carousel = new THREE.Group();
    carousel.position.set(cx, groundHeight(cx, cz), cz);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(11, 11.4, 1.2, 20),
      new THREE.MeshLambertMaterial({ color: 0xbfa88a }),
    );
    base.position.y = 0.6;
    base.receiveShadow = true;
    carousel.add(base);
    const spinner = new THREE.Group();
    spinner.position.y = 1.2;
    carousel.add(spinner);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(11.5, 4.4, 20),
      new THREE.MeshLambertMaterial({ map: stripeTexture("#f6f1e4", "#c8342b", 20) }),
    );
    canopy.position.y = 8.4;
    canopy.castShadow = true;
    spinner.add(canopy);
    const centrePost = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 6.4, 10), steel);
    centrePost.position.y = 3.2;
    spinner.add(centrePost);
    const horses = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const mount = new THREE.Group();
      mount.position.set(Math.cos(a) * 8.2, 0, Math.sin(a) * 8.2);
      mount.rotation.y = -a;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 6.2, 5), steel);
      pole.position.y = 3.1;
      mount.add(pole);
      const horse = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 1.1, 0.7),
        new THREE.MeshLambertMaterial({ color: i % 2 ? 0xf3e9dc : 0xc98b5a }),
      );
      horse.position.y = 2.3;
      horse.castShadow = true;
      mount.add(horse);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.1, 0.5), horse.material);
      neck.position.set(0.75, 3.0, 0);
      neck.rotation.z = -0.4;
      mount.add(neck);
      spinner.add(mount);
      horses.push({ mount, phase: a });
    }
    group.add(registerProp(carousel, cx, cz, 16));
    updaters.push((t) => {
      spinner.rotation.y = -t * 0.42;
      for (const h of horses) h.mount.position.y = Math.sin(t * 2.4 + h.phase * 2) * 0.45;
    });

    // A drop tower, because the coaster should not be the only thing here
    // that falls.
    const towerAngle = 0.55;
    const tx = Math.cos(towerAngle) * 272;
    const tz = Math.sin(towerAngle) * 272;
    const tower = new THREE.Group();
    tower.position.set(tx, groundHeight(tx, tz), tz);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, 62, 8), steel);
    mast.position.y = 31;
    mast.castShadow = true;
    tower.add(mast);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3, 5, 8), new THREE.MeshStandardMaterial({
      color: 0xd94f3d, roughness: 0.6,
    }));
    cap.position.y = 64;
    tower.add(cap);
    const carrier = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.8, 6, 16), steel);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = true;
    carrier.add(ring);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 1.3, 1.1),
        new THREE.MeshLambertMaterial({ color: 0x2f3947 }),
      );
      seat.position.set(Math.cos(a) * 4.2, -0.9, Math.sin(a) * 4.2);
      carrier.add(seat);
    }
    tower.add(carrier);
    group.add(registerProp(tower, tx, tz, 14));
    updaters.push((t) => {
      // Twelve seconds up, a held beat, then straight down.
      const cycle = (t % 15) / 15;
      const height = cycle < 0.72
        ? Math.pow(cycle / 0.72, 0.8)
        : Math.max(0, 1 - Math.pow((cycle - 0.72) / 0.2, 2.4));
      carrier.position.y = 5 + height * 50;
      carrier.rotation.y = t * 0.3;
    });
  }

  // ---- the infield: a bandstand on the lawn ---------------------------
  {
    const stand = new THREE.Group();
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7.4, 1.1, 12),
      new THREE.MeshLambertMaterial({ color: 0xb7a184 }),
    );
    deck.position.y = 0.55;
    deck.receiveShadow = true;
    deck.castShadow = true;
    stand.add(deck);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(8, 3.4, 12),
      new THREE.MeshLambertMaterial({ color: 0x3f6b53 }),
    );
    roof.position.y = 6.5;
    roof.castShadow = true;
    stand.add(roof);
    const postMaterial = new THREE.MeshLambertMaterial({ color: 0xf0ebdd });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4, 6), postMaterial);
      post.position.set(Math.cos(a) * 6.2, 3.1, Math.sin(a) * 6.2);
      post.castShadow = true;
      stand.add(post);
    }
    stand.position.set(0, groundHeight(0, 0), 0);
    group.add(registerProp(stand, 0, 0, 11));

    // Picnic tables, scattered on the grass around it.
    const tableGeo = mergeParts([
      part(new THREE.BoxGeometry(2.6, 0.16, 1.1), 0xc09a6b, [0, 0.78, 0]),
      part(new THREE.BoxGeometry(2.6, 0.14, 0.42), 0xa8845c, [0, 0.44, 0.78]),
      part(new THREE.BoxGeometry(2.6, 0.14, 0.42), 0xa8845c, [0, 0.44, -0.78]),
      part(new THREE.BoxGeometry(0.16, 0.8, 1.6), 0x8f6f4b, [1.1, 0.4, 0]),
      part(new THREE.BoxGeometry(0.16, 0.8, 1.6), 0x8f6f4b, [-1.1, 0.4, 0]),
    ]);
    const rng = scatterRng(0xbeeffed);
    const tables = [];
    for (let i = 0; i < 22; i++) {
      const a = rng() * Math.PI * 2;
      const r = 9 + rng() * (INFIELD - 12);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      tables.push({ x, y: groundHeight(x, z), z, ry: rng() * Math.PI });
    }
    group.add(instance(tableGeo, vertexLit(), tables));
  }

  // ---- the town on the horizon ----------------------------------------
  //
  // Three silhouettes, banded so the floors read at distance, instanced
  // and tinted. Nothing out here casts a shadow — it is all well beyond
  // the shadow camera and would only cost fill rate.
  {
    const banded = (width, height, depth, floors, base, band) => {
      const parts = [];
      for (let i = 0; i < floors; i++) {
        const h = height / floors;
        parts.push(part(
          new THREE.BoxGeometry(width, h * 0.82, depth),
          i % 2 ? band : base,
          [0, h * (i + 0.5), 0],
        ));
        parts.push(part(
          new THREE.BoxGeometry(width * 1.02, h * 0.18, depth * 1.02),
          base,
          [0, h * (i + 0.95), 0],
        ));
      }
      return parts;
    };
    const towerGeo = mergeParts([
      ...banded(1, 1, 1, 6, 0xc9ccd2, 0x8fa3b8),
      part(new THREE.BoxGeometry(0.6, 0.06, 0.6), 0xb0b6be, [0, 1.03, 0]),
    ]);
    const setbackGeo = mergeParts([
      ...banded(1, 0.62, 1, 4, 0xd6cfc3, 0x93a6b4),
      ...banded(0.62, 0.38, 0.62, 3, 0xd6cfc3, 0x93a6b4).map((p) => {
        p.matrix.premultiply(new THREE.Matrix4().makeTranslation(0, 0.62, 0));
        return p;
      }),
    ]);
    const spireGeo = mergeParts([
      ...banded(1, 0.8, 1, 5, 0xcfc7bb, 0x8b9fb0),
      part(new THREE.ConeGeometry(0.5, 0.34, 6), 0xb85f3f, [0, 0.97, 0]),
      part(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 4), 0x8a8f96, [0, 1.24, 0]),
    ]);

    const rng = scatterRng(0xb01dface);
    const buckets = [[], [], []];
    const tint = new THREE.Color();
    const base = new THREE.Color("#c6ccd4");
    for (let i = 0; i < 130; i++) {
      const angle = rng() * Math.PI * 2;
      const radius = 300 + rng() * 320;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius * 1.15) continue; // not in the lake
      const kind = rng() < 0.18 ? 2 : rng() < 0.5 ? 1 : 0;
      const footprint = 10 + rng() * 20;
      tint.copy(base).offsetHSL((rng() - 0.5) * 0.06, (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.16);
      buckets[kind].push({
        x, y: groundHeight(x, z) - 0.5, z,
        sx: footprint,
        sy: 14 + rng() * (kind === 2 ? 78 : 46),
        sz: footprint * (0.7 + rng() * 0.6),
        ry: rng() * Math.PI,
        color: tint.getHex(),
      });
    }
    const cityMaterial = vertexLit();
    group.add(instance(towerGeo, cityMaterial, buckets[0], { shadows: false }));
    group.add(instance(setbackGeo, cityMaterial, buckets[1], { shadows: false }));
    group.add(instance(spireGeo, cityMaterial, buckets[2], { shadows: false }));

    // Hills, right at the back, hazed almost into the sky.
    const hillGeo = new THREE.ConeGeometry(1, 1, 7);
    hillGeo.translate(0, 0.5, 0);
    const hills = [];
    const hillTint = new THREE.Color();
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2 + rng() * 0.16;
      const radius = 780 + rng() * 260;
      hillTint.setHSL(0.36, 0.16 + rng() * 0.1, 0.42 + rng() * 0.12);
      hills.push({
        x: Math.cos(angle) * radius, y: -10, z: Math.sin(angle) * radius,
        sx: 210 + rng() * 190,
        sy: 70 + rng() * 130,
        sz: 210 + rng() * 190,
        ry: rng() * Math.PI,
        color: hillTint.getHex(),
      });
    }
    group.add(instance(hillGeo, new THREE.MeshLambertMaterial({ fog: false }), hills, { shadows: false }));
  }

  // ---- weather and wildlife -------------------------------------------
  {
    const rng = scatterRng(0xc10bd5);
    const clouds = new THREE.Group();
    const cloudMaterial = new THREE.MeshLambertMaterial({
      color: 0xfdfeff, transparent: true, opacity: 0.95, fog: false,
    });
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 20; i++) {
      const puff = new THREE.Group();
      const lumps = 3 + Math.floor(rng() * 3);
      for (let j = 0; j < lumps; j++) {
        const lump = new THREE.Mesh(puffGeo, cloudMaterial);
        lump.position.set((rng() - 0.5) * 40, (rng() - 0.5) * 7, (rng() - 0.5) * 20);
        const s = 8 + rng() * 14;
        lump.scale.set(s, s * (0.42 + rng() * 0.28), s * 0.85);
        puff.add(lump);
      }
      const angle = rng() * Math.PI * 2;
      const radius = 120 + rng() * 620;
      puff.position.set(Math.cos(angle) * radius, 130 + rng() * 110, Math.sin(angle) * radius);
      puff.userData.drift = 0.6 + rng() * 1.1;
      clouds.add(puff);
    }
    group.add(clouds);
    updaters.push((t, dt) => {
      for (const puff of clouds.children) {
        puff.position.x += puff.userData.drift * dt;
        if (puff.position.x > 900) puff.position.x = -900;
      }
    });

    // Three flocks, circling. A bird is two wings; the roll of the whole
    // body at distance reads perfectly well as a wingbeat.
    const birdGeo = mergeParts([
      part(new THREE.BoxGeometry(2.6, 0.12, 0.9), 0x2b3038, [1.3, 0.2, 0], [1, 1, 1], [0, 0, -0.35]),
      part(new THREE.BoxGeometry(2.6, 0.12, 0.9), 0x2b3038, [-1.3, 0.2, 0], [1, 1, 1], [0, 0, 0.35]),
      part(new THREE.BoxGeometry(1.1, 0.22, 0.32), 0x3c434d, [0, 0.2, 0]),
    ]);
    const flocks = [];
    for (let f = 0; f < 3; f++) {
      const members = [];
      for (let i = 0; i < 13; i++) {
        members.push({ x: 0, y: 0, z: 0, phase: rng() * Math.PI * 2, lift: rng() * 8, lag: i * 0.13 });
      }
      const mesh = instance(birdGeo, vertexLit(), members, { shadows: false });
      group.add(mesh);
      flocks.push({
        mesh,
        members,
        centre: new THREE.Vector3((rng() - 0.5) * 500, 78 + rng() * 46, (rng() - 0.5) * 500),
        radius: 60 + rng() * 70,
        speed: 0.1 + rng() * 0.09,
      });
    }
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    updaters.push((t) => {
      for (const flock of flocks) {
        for (let i = 0; i < flock.members.length; i++) {
          const bird = flock.members[i];
          const a = t * flock.speed + bird.lag;
          position.set(
            flock.centre.x + Math.cos(a) * flock.radius,
            flock.centre.y + bird.lift + Math.sin(t * 0.4 + bird.phase) * 4,
            flock.centre.z + Math.sin(a) * flock.radius * 0.8,
          );
          euler.set(Math.sin(t * 6 + bird.phase) * 0.5, -a + Math.PI / 2, 0.25);
          quaternion.setFromEuler(euler);
          matrix.compose(position, quaternion, scale);
          flock.mesh.setMatrixAt(i, matrix);
        }
        flock.mesh.instanceMatrix.needsUpdate = true;
      }
    });
  }

  // ------------------------------------------------------------
  // carve(): get out of the coaster's way.
  //
  // Trees are sunk below the ground rather than removed, so that every
  // other tree stays exactly where it was; props are simply hidden. Both
  // are reversible, which matters because a new track is generated into
  // the same world every time the button is pressed.
  // ------------------------------------------------------------
  const carveMatrix = new THREE.Matrix4();
  const carveQuat = new THREE.Quaternion();
  const carveEuler = new THREE.Euler();
  const carvePos = new THREE.Vector3();
  const carveScale = new THREE.Vector3();

  function carve(track, extraKeepOuts = []) {
    let outerLimit = 0;
    for (const p of track.points) outerLimit = Math.max(outerLimit, Math.hypot(p.x, p.z));

    const foulsTrack = (x, z, keepOut) => {
      // Structures the track brings with it — the hill a tunnel is bored
      // through — displace scenery exactly as the track itself does.
      for (const zone of extraKeepOuts) {
        const reach = zone.radius + keepOut * 0.35;
        if ((zone.x - x) * (zone.x - x) + (zone.z - z) * (zone.z - z) < reach * reach) return true;
      }
      if (Math.hypot(x, z) > outerLimit + keepOut) return false;
      const limit = keepOut * keepOut;
      for (let k = 0; k < track.points.length; k += 2) {
        const p = track.points[k];
        const dx = p.x - x;
        const dz = p.z - z;
        if (dx * dx + dz * dz < limit) return true;
      }
      return false;
    };

    for (const { mesh, placements } of carveable) {
      let dirty = false;
      for (let i = 0; i < placements.length; i++) {
        const p = placements[i];
        const wanted = foulsTrack(p.x, p.z, 9) ? -80 : p.y;
        if (p.placedY === wanted) continue;
        p.placedY = wanted;
        carveEuler.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
        carveQuat.setFromEuler(carveEuler);
        carvePos.set(p.x, wanted, p.z);
        carveScale.set(p.sx ?? p.s ?? 1, p.sy ?? p.s ?? 1, p.sz ?? p.s ?? 1);
        carveMatrix.compose(carvePos, carveQuat, carveScale);
        mesh.setMatrixAt(i, carveMatrix);
        dirty = true;
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    }

    for (const item of props) {
      item.object.visible = !foulsTrack(item.x, item.z, item.keepOut);
    }
  }

  return {
    group,
    sun,
    sky,
    carve,
    update(elapsed, dt) {
      for (const fn of updaters) fn(elapsed, dt);
    },
  };
}
