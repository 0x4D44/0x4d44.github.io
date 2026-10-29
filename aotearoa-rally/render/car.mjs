// Car visual: lofted procedural rally cars (huia, kea, takahe, piwakawaka). Public API per CONTRACTS.md s5.
import { dimsFor } from "./cars/profiles.mjs";
import { buildBody } from "./cars/body.mjs";
import { buildTyre, buildRim, buildCaliper } from "./cars/wheels.mjs";
import { buildInterior, drawGauges } from "./cars/interior.mjs";
import { drawLivery, ATLAS_W, ATLAS_H } from "./cars/livery.mjs";
import { createUniforms, createCarMaterials } from "./cars/materials.mjs";
import { Geo } from "./cars/geo.mjs";
import { clamp, clamp01, smoothstep, lerp, damp } from "../core/mathx.mjs";

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
  const M = createCarMaterials(THREE, U, livery, atlas);
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
  const glassMesh = mkMesh(parts.glass.build(), M.glass, rig, false); glassMesh.renderOrder = 5;
  const trimMesh = mkMesh(parts.trim.build(), M.trim);
  // head / tail / reverse lamps share one mesh; attribute aLamp selects the lamp type (0, 1, 2)
  const lampGeo = new Geo(THREE);
  const lampType = [];
  [parts.head, parts.tail, parts.rev].forEach((g, k) => { const n = g.p.length / 3; for (let i = 0; i < n; i++) lampType.push(k); lampGeo.append(g); });
  const lampBuilt = lampGeo.build();
  lampBuilt.setAttribute("aLamp", new THREE.BufferAttribute(new Float32Array(lampType), 1));
  mkMesh(lampBuilt, M.lamps, rig, false);

  const I = buildInterior(THREE, spec, d, livery);
  const interiorMesh = mkMesh(I.interior, M.interior);
  const helmetMesh = mkMesh(I.helmets, M.helmet);
  // steering wheel
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(I.wheelPos.x, I.wheelPos.y, I.wheelPos.z); wheelPivot.rotation.x = -0.45; rig.add(wheelPivot);
  const wheelMesh = mkMesh(I.wheel, M.interior, wheelPivot);
  // instrument cluster
  const gauge = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), gaugeMat);
  geoms.push(gauge.geometry);
  gauge.position.set(I.wheelPos.x, I.topY - 0.03, I.zD + 0.545); gauge.rotation.x = -0.2; gauge.frustumCulled = false;
  rig.add(gauge);

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

  // contact shadow blob
  const blobCanvas = makeCanvas(128, 128);
  {
    const c = blobCanvas.getContext("2d");
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, "rgba(0,0,0,0.75)"); g.addColorStop(0.6, "rgba(0,0,0,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  }
  const blobTex = new THREE.CanvasTexture(blobCanvas);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(d.W * 1.5, d.L * 1.12), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }));
  blob.rotation.x = -Math.PI / 2; blob.position.set(0, 0.012, (d.zF + d.zR) / 2); blob.renderOrder = 1; blob.frustumCulled = false;
  rig.add(blob);

  // headlight beam
  const spot = new THREE.SpotLight(0xfff1d8, 0, 90, 0.5, 0.7, 1.6);
  spot.position.set(0, 0.8, d.zF + 0.2); spot.target.position.set(0, 0.35, d.zF - 30);
  rig.add(spot, spot.target);

  // ---------------------------------------------------------------- state
  const S = {
    showroom: false, dirt: 0, view: "exterior", head: null, brake: null, reverse: null, autoHead: false,
    dmg: null, bonnetPop: 0, hangF: 0, hangR: 0, glowHead: 0, glowTail: 0, glowRev: 0, wheelStatic: false, steerWheelAngle: 0,
    rigY: -cg, rigKnown: false, time: 0,
  };
  const qInv = new THREE.Quaternion(), vtmp = new THREE.Vector3();
  const tri = (g) => g.attributes.position.count / 3;

  const api = {
    object3d: root,
    spec, livery: () => livery,
    /** dimension info for cameras / UI */
    dims: { length: d.L, width: d.W, height: d.H, eye: d.eye, zFront: d.zF, zRear: d.zR },

    update(st, dt = 1 / 60, env) {
      S.time += dt;
      root.position.set(st.x, st.y, st.z);
      root.rotation.set(st.pitch || 0, st.yaw || 0, -(st.roll || 0), "YXZ");
      const w = st.wheels;
      // learn where the ground is relative to the body origin (CoM vs ground-projected)
      if (w && !S.rigKnown) {
        let n = 0, sum = 0;
        for (let i = 0; i < 4; i++) if (w[i] && w[i].grounded && Number.isFinite(w[i].contactY)) { sum += w[i].contactY; n++; }
        if (n === 4 && Math.abs(st.pitch) < 0.15 && Math.abs(st.roll) < 0.15) {
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

    setDirt(v) { S.dirt = clamp01(v); U.uDirt.value = S.showroom ? 0 : S.dirt; },
    setLights(l = {}) {
      if ("head" in l) S.head = l.head === null ? null : !!l.head;
      if ("brake" in l) S.brake = l.brake === null ? null : !!l.brake;
      if ("reverse" in l) S.reverse = l.reverse === null ? null : !!l.reverse;
    },
    setViewMode(m) {
      S.view = m;
      glassMesh.visible = m !== "bonnet";
      helmetMesh.visible = true;
    },
    /** Clean look for the car-select screen: no dirt, no damage, headlights optional. */
    setShowroom(on) {
      S.showroom = !!on;
      blob.visible = !on;
      U.uDirt.value = on ? 0 : S.dirt;
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
      atlas.dispose(); gaugeTex.dispose(); gaugeMat.dispose(); blobTex.dispose(); blob.geometry.dispose(); blob.material.dispose();
      if (root.parent) root.parent.remove(root);
    },
  };
  api.setViewMode("exterior");
  api.setRest(0);
  return api;
}
