// Car visual: lofted procedural rally cars (huia, kea, takahe, piwakawaka). Public API per CONTRACTS.md s5.
import { dimsFor } from "./cars/profiles.mjs";
import { buildBody } from "./cars/body.mjs";
import { buildTyre, buildRim, buildCaliper } from "./cars/wheels.mjs";
import { buildInterior, drawGauges } from "./cars/interior.mjs";
import { drawLivery, ATLAS_W, ATLAS_H } from "./cars/livery.mjs";
import { createUniforms, createCarMaterials } from "./cars/materials.mjs";
import { Geo } from "./cars/geo.mjs";
import { clamp, clamp01, smoothstep, lerp, damp } from "../core/mathx.mjs";
import { SURFACE } from "../core/surfaces.mjs";

/**
 * How a wheel on surface `surf` dirties the body. Pure. Returns { rate, spray, colour } where rate is the dirt (0..1) gained per
 * second at full speed (negative = rain washing the car), spray 0..1 drives the tyre-spray streaks, colour is the mud tint.
 */
export function dirtFor(surf, speed, wetness = 0, rain = 0) {
  const v = clamp01(Math.abs(speed || 0) / 18), wet = clamp01(wetness), r = clamp01(rain);
  let rate = 0, spray = 0, colour = [0.36, 0.28, 0.19];
  switch (surf) {
    case SURFACE.MUD: rate = 0.022; spray = 1; colour = [0.21, 0.145, 0.09]; break;
    case SURFACE.WATER: rate = 0.035; spray = 1; colour = [0.27, 0.23, 0.18]; break;
    case SURFACE.SNOW: case 11: rate = 0.008 + 0.006 * wet; spray = 0.5; colour = [0.52, 0.54, 0.56]; break;
    case SURFACE.TARMAC: rate = r > 0.3 ? -0.004 : 0; spray = wet > 0.45 ? 0.35 * wet : 0; colour = [0.30, 0.30, 0.30]; break;
    case SURFACE.PUMICE: case SURFACE.SAND: rate = 0.004 + 0.012 * wet; spray = 0.4 * wet; colour = [0.52, 0.47, 0.37]; break;
    default: rate = 0.003 + 0.018 * wet * wet; spray = 0.85 * wet; colour = surf === SURFACE.GRAVEL ? [0.36, 0.30, 0.22] : [0.27, 0.20, 0.13]; break;
  }
  return { rate: rate * v, spray: spray * v, colour };
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined" && typeof document === "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}

export function createCarVisual(THREE, spec, opts = {}) {
  const d = dimsFor(spec);
  const cg = spec.cgHeight || 0.5;
  const liveries = spec.liveries && spec.liveries.length ? spec.liveries : [{ name: "Stock", body: 0xcc2222, accent: 0xffffff, number: 7, sponsor: "" }];
  let liveryIdx = clamp(opts.livery | 0, 0, liveries.length - 1);
  let livery = liveries[liveryIdx];
  let number = opts.number ?? livery.number ?? 1;

  const root = new THREE.Group();
  root.name = "car-" + spec.id;
  root.rotation.order = "YXZ";
  const rig = new THREE.Group(); // model space: y = 0 is the ground when the car sits at rest
  rig.position.y = -cg;
  root.add(rig);

  // ---------------------------------------------------------------- textures & materials
  const canvas = makeCanvas(ATLAS_W, ATLAS_H);
  drawLivery(canvas, d, spec, livery, number);
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.flipY = false; atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 8;
  const U = createUniforms(THREE, d);
  // fine woven-fabric / carbon grain for the cabin (tiled; multiplies the vertex colours)
  const grainCanvas = makeCanvas(128, 128);
  {
    const c = grainCanvas.getContext("2d");
    c.fillStyle = "#d8d8d8"; c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) { const v = ((x / 4 + y / 4) & 1) ? 232 : 188; c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, y, 4, 4); }
    for (let i = 0; i < 900; i++) { const v = 150 + Math.random() * 90 | 0; c.fillStyle = `rgba(${v},${v},${v},0.5)`; c.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
  }
  const grain = new THREE.CanvasTexture(grainCanvas); grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(2, 2); grain.colorSpace = THREE.SRGBColorSpace;
  const M = createCarMaterials(THREE, U, livery, atlas, grain);
  const gaugeCanvas = makeCanvas(512, 256);
  drawGauges(gaugeCanvas, spec);
  const gaugeTex = new THREE.CanvasTexture(gaugeCanvas); gaugeTex.colorSpace = THREE.SRGBColorSpace;
  const gaugeMat = new THREE.MeshBasicMaterial({ map: gaugeTex, toneMapped: false });

  // ---------------------------------------------------------------- geometry
  const parts = buildBody(THREE, spec, d);
  const geoms = [];
  const mkMesh = (geo, mat, parent = rig, cast = true) => {
    geoms.push(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false;
    parent.add(m); return m;
  };
  const bodyMesh = mkMesh(parts.body.build(), M.paint);
  // bonnet hinged at its rear edge
  const hinge = { y: d.topC(d.S.bonnetT[1]), z: d.zAt(d.S.bonnetT[1]) };
  const bonnetPivot = new THREE.Group(); bonnetPivot.position.set(0, hinge.y, hinge.z); rig.add(bonnetPivot);
  const bonnetMesh = mkMesh(parts.bonnet.build(), M.paint, bonnetPivot); bonnetMesh.position.set(0, -hinge.y, -hinge.z);
  // bumpers hang from their upper inner edge
  const fPivot = new THREE.Group(); fPivot.position.set(0, d.sill + 0.35, d.zF + 0.3); rig.add(fPivot);
  const bumperF = mkMesh(parts.bumperF.build(), M.paint, fPivot); bumperF.position.set(0, -(d.sill + 0.35), -(d.zF + 0.3));
  const rPivot = new THREE.Group(); rPivot.position.set(0, d.sill + 0.35, d.zR - 0.3); rig.add(rPivot);
  const bumperR = mkMesh(parts.bumperR.build(), M.paint, rPivot); bumperR.position.set(0, -(d.sill + 0.35), -(d.zR - 0.3));
  const cabinMesh = mkMesh(parts.cabin.build(), M.paint);
  const glassMesh = mkMesh(parts.glass.build(), M.glass, rig, false); glassMesh.renderOrder = 5;
  const trimMesh = mkMesh(parts.trim.build(), M.trim);
  // head / tail / reverse lamps share one mesh; attribute aLamp selects the lamp type (0, 1, 2)
  const lampGeo = new Geo(THREE);
  const lampType = [];
  [parts.head, parts.tail, parts.rev].forEach((g, k) => { const n = g.p.length / 3; for (let i = 0; i < n; i++) lampType.push(k); lampGeo.append(g); });
  const lampBuilt = lampGeo.build();
  lampBuilt.setAttribute("aLamp", new THREE.BufferAttribute(new Float32Array(lampType), 1));
  const lampMesh = mkMesh(lampBuilt, M.lamps, rig, false);

  const I = buildInterior(THREE, spec, d, livery);
  const interiorMesh = mkMesh(I.interior, M.interior);
  const helmetMesh = mkMesh(I.helmets, M.helmet);
  const crewMesh = mkMesh(I.crew, M.interior); // suits and gloves: hidden in the driver's own view (arms would fill the lens)
  // steering wheel
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(I.wheelPos.x, I.wheelPos.y, I.wheelPos.z); wheelPivot.rotation.x = -0.45; rig.add(wheelPivot);
  const wheelMesh = mkMesh(I.wheel, M.interior, wheelPivot);
  // instrument cluster: a live canvas (needles, gear, shift lights) on the face of the pod built in interior.mjs
  const gp = I.gaugePos;
  const gauge = new THREE.Mesh(new THREE.PlaneGeometry(gp.w, gp.h), gaugeMat);
  geoms.push(gauge.geometry);
  gauge.position.set(gp.x, gp.y, gp.z); gauge.rotation.x = gp.tilt; gauge.frustumCulled = false;
  rig.add(gauge);
  let gaugeAt = -1, gaugeKey = "";

  // wheels
  const R = d.R, Rr = R * 0.6, tw = R * 0.68;
  const tyreGeo = buildTyre(THREE, R, Rr, tw), rimGeo = buildRim(THREE, R, Rr, tw, d.S.rim, d.S.spokes, d.S.rimStyle), calGeo = buildCaliper(THREE, Rr, tw);
  geoms.push(tyreGeo, rimGeo, calGeo);
  const wheels = [];
  for (let i = 0; i < 4; i++) {
    const w = d.wheels[i];
    const steer = new THREE.Group(); steer.position.set(w.x, R, w.z);
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeo, M.tyre), rim = new THREE.Mesh(rimGeo, M.rim), cal = new THREE.Mesh(calGeo, M.caliper);
    for (const m of [tyre, rim, cal]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; if (w.x < 0) m.scale.x = -1; }
    spin.add(tyre, rim); steer.add(spin, cal);
    rig.add(steer);
    wheels.push({ steer, spin, tyre, rim, cal, restY: R, x: w.x, z: w.z, flat: 0, bend: 0 });
  }

  // windscreen wipers: two blades pivoting at the scuttle, lying on the glass; they sweep when it rains
  const wipers = [];
  {
    const t0 = d.cabin.t0 + 0.012, base = d.topC(t0) - 0.03;
    const dz = d.zAt(d.cabin.rs) - d.zAt(t0), dy = d.roof - base;
    const slope = Math.atan2(dy, dz);
    const hwScreen = d.hw * d.widC(t0) * d.cabin.w * 0.9;
    for (const [px, len] of [[-hwScreen * 0.62, 0.56], [hwScreen * 0.0, 0.5]]) {
      const pivot = new THREE.Group();
      pivot.position.set(px, base + 0.012, d.zAt(t0) + 0.03);
      pivot.rotation.x = -slope;
      const arm = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.02), M.wheelTrim);
      geoms.push(blade.geometry);
      blade.position.set(len / 2, 0.012, 0); blade.castShadow = false; blade.frustumCulled = false;
      arm.add(blade); pivot.add(arm); rig.add(pivot);
      wipers.push({ arm, len });
    }
  }
  // contact shadow blob
  const blobCanvas = makeCanvas(128, 128);
  {
    const c = blobCanvas.getContext("2d");
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
    // always-on ambient-occlusion contact shadow: independent of the sun, so an overcast or canopy-shaded stage still shows the car
    // standing on the road. Dark core under the body, a long soft skirt that reaches well past the sills, bumpers and tyres.
    g.addColorStop(0, "rgba(0,0,0,0.95)"); g.addColorStop(0.45, "rgba(0,0,0,0.8)"); g.addColorStop(0.7, "rgba(0,0,0,0.42)"); g.addColorStop(0.88, "rgba(0,0,0,0.12)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  }
  const blobTex = new THREE.CanvasTexture(blobCanvas);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(d.W * 2.3, d.L * 1.5), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.78, polygonOffset: true, polygonOffsetFactor: -2 }));
  blob.rotation.x = -Math.PI / 2; blob.position.set(0, 0.02, (d.zF + d.zR) / 2); blob.renderOrder = 1; blob.frustumCulled = false;
  rig.add(blob);

  // headlight beam
  const spot = new THREE.SpotLight(0xfff1d8, 0, 90, 0.5, 0.7, 1.6);
  spot.position.set(0, 0.8, d.zF + 0.2); spot.target.position.set(0, 0.35, d.zF - 30);
  rig.add(spot, spot.target);

  // ---------------------------------------------------------------- state
  const S = {
    showroom: false, dirt: 0, view: "exterior", head: null, brake: null, reverse: null, autoHead: false,
    dmg: null, bonnetPop: 0, hangF: 0, hangR: 0, glowHead: 0, glowTail: 0, glowRev: 0, wheelStatic: false, steerWheelAngle: 0,
    rigY: -cg, rigKnown: false, time: 0, spray: 0, mudC: null,
  };
  S.fade = 1;
  const fadeMats = [...new Set([...Object.values(M).filter((m) => m && m.isMaterial), gaugeMat])];
  const fadeBase = new Map(fadeMats.map((m) => [m, { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite }]));
  const qInv = new THREE.Quaternion(), vtmp = new THREE.Vector3();
  const tri = (g) => g.attributes.position.count / 3;

  const api = {
    object3d: root,
    spec, livery: () => livery,
    /** dimension info for cameras / UI */
    dims: { length: d.L, width: d.W, height: d.H, eye: d.eye, zFront: d.zF, zRear: d.zR },

    /**
     * Metres to ADD to object3d.position.y so the lowest tyre contact point sits at y = 0. The model origin is the centre of
     * mass, so a showroom car placed at position.y = turntableTop + groundOffset stands on the turntable. (Physics-driven
     * cars are placed by update(); this is for showrooms and any manual placement.)
     */
    get groundOffset() { return -S.rigY; },

    /**
     * Fade the whole car (0 = hidden, 1 = opaque), e.g. rig.carFade when the chase lens gets close to the body.
     * Uses material opacity, restoring the original transparency flags at 1.
     */
    setFade(f) {
      f = clamp01(f);
      if (f === S.fade) return;
      S.fade = f;
      root.visible = f > 0.02;
      for (const m of fadeMats) {
        const b = fadeBase.get(m);
        if (f >= 0.999) { m.opacity = b.opacity; m.transparent = b.transparent; m.depthWrite = b.depthWrite; }
        else { m.opacity = b.opacity * f; m.transparent = true; m.depthWrite = false; }
        m.needsUpdate = true;
      }
    },

    update(st, dt = 1 / 60, env) {
      S.time += dt;
      root.position.set(st.x, st.y, st.z);
      root.rotation.set(st.pitch || 0, st.yaw || 0, -(st.roll || 0), "YXZ");
      const w = st.wheels;
      // learn where the ground is relative to the body origin (CoM vs ground-projected)
      if (w && !S.rigKnown) {
        let n = 0, sum = 0;
        for (let i = 0; i < 4; i++) if (w[i] && w[i].grounded && Number.isFinite(w[i].contactY)) { sum += w[i].contactY; n++; }
        if (n === 4 && Math.abs(st.pitch) < 0.15 && Math.abs(st.roll) < 0.15 && Math.abs(st.y - sum / 4 - cg) < 0.4) { // stale contacts after a teleport read tens of metres: wait for real ones
          const dy = st.y - sum / 4;
          S.rigY = -clamp(dy, 0, 1.5); S.rigKnown = true;
        }
      }
      rig.position.y = S.rigY;
      if (w) {
        qInv.copy(root.quaternion).invert();
        for (let i = 0; i < 4; i++) {
          const ws = w[i], wh = wheels[i];
          if (!ws) continue;
          let y = wh.restY;
          if (Number.isFinite(ws.y)) {
            vtmp.set(ws.x - st.x, ws.y - st.y, ws.z - st.z).applyQuaternion(qInv);
            y = clamp(vtmp.y - S.rigY, wh.restY - 0.3, wh.restY + 0.3);
          }
          const flat = ws.punctured ? 1 : wh.flat;
          wh.steer.position.set(wh.x, y - flat * R * 0.14, wh.z);
          const bend = wh.bend;
          wh.steer.rotation.set(0, i < 2 ? -(ws.steer || 0) + bend * 0.12 * Math.sign(wh.x) : bend * 0.06, Math.sign(wh.x) * (0.02 + bend * 0.25), "YXZ");
          wh.spin.rotation.x = -(ws.spin || 0);
          const sag = 1 - flat * 0.14;
          wh.tyre.scale.y = sag; wh.tyre.scale.z = sag;
        }
      }
      // gauges: only when the driver's eye can see them, ~20 Hz, and only when a reading moved
      if (S.view === "cockpit" && S.time - gaugeAt > 0.05) {
        const key = Math.round((st.rpm || 0) / 40) + "|" + Math.round(st.speedKmh || 0) + "|" + (st.gear || 0);
        if (key !== gaugeKey) { gaugeKey = key; gaugeAt = S.time; drawGauges(gaugeCanvas, spec, { rpm: st.rpm || 0, kmh: st.speedKmh || 0, gear: st.gear || 0 }); gaugeTex.needsUpdate = true; }
      }
      // steering wheel
      const sa = clamp((st.steerAngle || 0) * 9, -3.2, 3.2);
      wheelMesh.rotation.z = -sa;
      // lights
      const headOn = S.head !== null ? S.head : !!(env && env.headlights);
      const brakeOn = S.brake !== null ? S.brake : (st.brake || 0) > 0.05 || (st.handbrake || 0) > 0.3;
      const revOn = S.reverse !== null ? S.reverse : (st.gear || 0) < 0;
      S.glowHead = damp(S.glowHead, headOn ? 1 : 0, 25, dt);
      M.lampI.value.set(0.12 + S.glowHead * 5, brakeOn ? 4.2 : headOn ? 0.9 : 0.12, revOn ? 3.5 : 0.05);
      spot.intensity = S.glowHead * (S.showroom ? 0 : 420);
      // wipers: sweep while it rains (or snows), park flat along the scuttle otherwise
      {
        const wet = env && (env.rain > 0.1 || env.snow > 0.15) ? 1 : 0;
        S.wipe = damp(S.wipe || 0, wet, 6, dt);
        const ph = (S.time * 1.7) % 2, tri = ph < 1 ? ph : 2 - ph, sm = tri * tri * (3 - 2 * tri);
        const ang = (S.wipe > 0.05 ? sm * 1.25 * S.wipe : 0) + 0.02;
        for (let i = 0; i < wipers.length; i++) wipers[i].arm.rotation.y = -ang * (i ? 0.92 : 1);
      }
      // dirt: build up from the surface under the wheels (and rain); tyre-spray streaks follow what is being thrown up
      if (w && !S.showroom && !S.dirtFrozen) {
        let rate = 0, spray = 0, n = 0, cr = 0, cg2 = 0, cb = 0;
        for (let i = 0; i < 4; i++) {
          const ws = w[i];
          if (!ws || !ws.grounded) continue;
          const o = dirtFor(ws.surf, st.speed, env && env.wetness, env && env.rain);
          rate += o.rate; spray += o.spray; cr += o.colour[0]; cg2 += o.colour[1]; cb += o.colour[2]; n++;
        }
        if (n) {
          rate /= n; spray /= n;
          S.spray = damp(S.spray, spray, spray > S.spray ? 3 : 1.2, dt);
          if (rate > 0) { const m = Math.min(1, rate * 6); S.mudC = S.mudC || [cr / n, cg2 / n, cb / n]; S.mudC[0] = lerp(S.mudC[0], cr / n, m * dt); S.mudC[1] = lerp(S.mudC[1], cg2 / n, m * dt); S.mudC[2] = lerp(S.mudC[2], cb / n, m * dt); U.uMudC.value.set(S.mudC[0], S.mudC[1], S.mudC[2]); }
          S.dirt = clamp01(S.dirt + rate * dt);
        } else S.spray = damp(S.spray, 0, 2, dt);
        U.uDirt.value = S.dirt; U.uSpray.value = S.spray;
      }
      // flutter of a popped bonnet at speed
      if (S.bonnetPop > 0.05) bonnetPivot.rotation.x = S.bonnetPop + Math.sin(S.time * 14) * 0.015 * clamp01(Math.abs(st.speed || 0) / 25) * S.bonnetPop;
      if (st.damage && !S.dmgFed) api.setDamage(st.damage);
      if (st.damage && (S.dmgStamp !== st.damage.total)) { S.dmgStamp = st.damage.total; api.setDamage(st.damage); }
      // rpm-linked: slight engine shake in body (cosmetic) is skipped to keep the pose exact
      void env;
    },

    setDamage(dmg) {
      if (!dmg) return;
      S.dmgFed = true; S.dmg = dmg;
      const b = dmg.body || { front: 0, rear: 0, left: 0, right: 0 };
      const k = S.showroom ? 0 : 1;
      U.uDmg.value.set(clamp01(b.front) * k, clamp01(b.rear) * k, clamp01(b.left) * k, clamp01(b.right) * k);
      U.uDmgTot.value = Math.max(b.front, b.rear, b.left, b.right) * k;
      U.uCrack.value = clamp01(Math.max(b.front, b.rear, b.left, b.right) * 1.25 - 0.18) * k;
      S.bonnetPop = k * clamp01((b.front - 0.55) / 0.35) * 0.8;
      bonnetPivot.rotation.x = S.bonnetPop;
      S.hangF = k * smoothstep(0.45, 0.9, b.front); S.hangR = k * smoothstep(0.45, 0.9, b.rear);
      fPivot.rotation.set(0.28 * S.hangF, 0.1 * S.hangF, -0.22 * S.hangF);
      fPivot.position.z = d.zF + 0.3 - 0.06 * S.hangF; fPivot.position.y = d.sill + 0.35 - 0.05 * S.hangF;
      rPivot.rotation.set(-0.3 * S.hangR, -0.08 * S.hangR, 0.2 * S.hangR);
      rPivot.position.z = d.zR - 0.3 + 0.05 * S.hangR; rPivot.position.y = d.sill + 0.35 - 0.05 * S.hangR;
      for (let i = 0; i < 4; i++) {
        wheels[i].bend = k * (dmg.suspension ? smoothstep(0.35, 0.95, dmg.suspension[i] || 0) : 0);
        wheels[i].flat = k * (dmg.tyres ? smoothstep(0.7, 0.95, dmg.tyres[i] || 0) : 0);
      }
    },

    /** Dirt level 0..1. setDirt(0) cleans the car (call it at service); update() then builds it up again from the surfaces driven. */
    setDirt(v) { S.dirt = clamp01(v); if (S.dirt === 0) S.spray = 0; U.uDirt.value = S.showroom ? 0 : S.dirt; U.uSpray.value = S.showroom ? 0 : S.spray; },
    get dirt() { return S.dirt; },
    /** New stage / restart: clean body, no spray. (Service in the career calls setDirt(0).) */
    reset() { S.dirt = 0; S.spray = 0; S.mudC = null; U.uDirt.value = 0; U.uSpray.value = 0; U.uMudC.value.set(0.28, 0.2, 0.13); S.rigKnown = false; },
    setLights(l = {}) {
      if ("head" in l) S.head = l.head === null ? null : !!l.head;
      if ("brake" in l) S.brake = l.brake === null ? null : !!l.brake;
      if ("reverse" in l) S.reverse = l.reverse === null ? null : !!l.reverse;
    },
    setViewMode(m) {
      S.view = m;
      const inCar = m === "bonnet" || m === "cockpit";
      glassMesh.visible = !inCar;
      cabinMesh.visible = m !== "bonnet"; // pillars and roof panels would only sit in the lens
      cabinMesh.material = m === "cockpit" ? M.liner : M.paint; // from the driver's seat the greenhouse is dark headlining, not sunlit paint
      lampMesh.visible = m !== "bonnet"; // lamp lenses read as bubbles on the bonnet edge
      // bonnet view sits at the base of the windscreen: the cabin furniture would only sit in front of the lens
      interiorMesh.visible = m !== "bonnet";
      helmetMesh.visible = !inCar;
      crewMesh.visible = !inCar; // the driver's own head would sit on the lens
      wheelPivot.visible = m === "exterior" || m === "cockpit"; // steering wheel only in the cockpit (and seen through the glass outside)
      gauge.visible = m !== "bonnet";
    },
    /** Clean look for the car-select screen: no dirt, no damage, headlights optional. */
    setShowroom(on) {
      S.showroom = !!on;
      blob.visible = !on;
      U.uDirt.value = on ? 0 : S.dirt; U.uSpray.value = on ? 0 : S.spray;
      if (S.dmg) api.setDamage(S.dmg); else api.setDamage({ body: { front: 0, rear: 0, left: 0, right: 0 }, suspension: [0, 0, 0, 0], tyres: [0, 0, 0, 0] });
    },
    /** Pose the wheels at rest (for showroom turntables where no physics state exists). */
    setRest(steer = 0) {
      for (let i = 0; i < 4; i++) { wheels[i].steer.position.set(wheels[i].x, wheels[i].restY, wheels[i].z); wheels[i].steer.rotation.set(0, i < 2 ? -steer : 0, 0); }
      wheelMesh.rotation.z = -steer * 9;
    },
    setLivery(idx, num) {
      liveryIdx = clamp(idx | 0, 0, liveries.length - 1); livery = liveries[liveryIdx];
      number = num ?? livery.number ?? number;
      drawLivery(canvas, d, spec, livery, number); atlas.needsUpdate = true;
    },
    /** Triangle / draw-call accounting for budgets. */
    stats() {
      let tris = 0, calls = 0;
      root.traverse((o) => { if (o.isMesh && o.visible) { calls++; const g = o.geometry; tris += g.index ? g.index.count / 3 : tri(g); } });
      return { triangles: Math.round(tris), drawCalls: calls };
    },
    dispose() {
      for (const g of geoms) g.dispose();
      for (const k of Object.keys(M)) if (M[k] && M[k].dispose) M[k].dispose();
      atlas.dispose(); grain.dispose(); gaugeTex.dispose(); gaugeMat.dispose(); blobTex.dispose(); blob.geometry.dispose(); blob.material.dispose();
      if (root.parent) root.parent.remove(root);
    },
  };
  api.setViewMode("exterior");
  api.setRest(0);
  return api;
}
