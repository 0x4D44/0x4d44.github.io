// Procedural 3D model of the Sulzer 12LDA28: two inline-6 banks, each with its own
// crankshaft, geared to a central generator shaft. 1 scene unit = 100 mm.
import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { GEOM, TIMING } from "./data.js";
import {
  fireAngle, cycleAngle, strokeOf, exhaustLift, intakeLift, pistonDown, injecting,
  exhaustOpen, intakeOpen, BANK_OFFSET, FIRING,
} from "./sim.js";

const U = 0.01;                                   // mm -> scene units
const R = GEOM.stroke / 2 * U;                    // crank radius 1.8
const L = GEOM.rod * U;                           // rod length 7.2
const BORE = GEOM.bore * U;                       // 2.8
const PITCH = GEOM.pitch * U;                     // 5.0
const BANKZ = GEOM.bankSpacing * U / 2;           // +-3.2
const TDC_PIN = R + L;                            // wrist-pin height at TDC, 9.0
const CROWN = 2.0;                                // pin -> crown
const HEAD_BOT = TDC_PIN + CROWN + 0.3;           // 11.3
const X0 = -2.5 * PITCH;                          // cylinder 1 x

export const PART_INFO = {
  crankcase: { name: "Crankcase and sump", conf: "M", text: "A welded steel-plate fabrication, crankcase and sump made as one piece, with welded-in cast-steel transverse girders carrying the main bearings. Main bearings are held by adjustable wedges rather than studded caps. It is the structural backbone: the whole engine and generator sit on a common underbed." },
  block: { name: "Cylinder block", conf: "M", text: "A second welded fabrication carrying the water jacket. The 12LDA28 is built as two six-cylinder engines side by side, each in an integral crankcase and block." },
  liner: { name: "Cylinder liner", conf: "M", text: "Centrifugally cast iron liners (Sheepbridge Stokes) 280 mm bore, with upper sealing rings. Coolant flows around the outside; early engines used magnesium-alloy anti-corrosion elements." },
  piston: { name: "Piston", conf: "M", text: "A two-piece oil-cooled piston introduced by Sulzer in 1955, with both scraper rings below the gudgeon pin. Lubricating oil cools the crown and drains through six unstressed holes. Stroke 360 mm; mean piston speed 9 m/s at 750 rpm." },
  rod: { name: "Connecting rod", conf: "E", text: "Transmits the gas force to the crankpin. The exact rod type was not found in a source; a plain rod is shown. Rod length is assumed at 720 mm." },
  crank: { name: "Crankshaft (x2)", conf: "E", text: "One crankshaft per bank, made by Mitchell Shackleton, with seven main bearings (Glacier) and six throws. The throw angles drawn here are an assumption tied to the assumed firing order. The two crankshafts are tied together by synchronising gears." },
  head: { name: "Cylinder head", conf: "M", text: "A separate head for every cylinder with two valves (one inlet, one exhaust) and a central injector. Direct injection into the piston crown." },
  valveIn: { name: "Inlet valve", conf: "M", text: "Admits pressurised charge air from the turbocharger and intercooler. Opens roughly 60 degrees before TDC (estimated timing)." },
  valveEx: { name: "Exhaust valve", conf: "M", text: "Austenitic-steel exhaust valve (the original high-tensile valves were replaced for durability). Opens roughly 50 degrees before BDC (estimated timing)." },
  injector: { name: "Injector and fuel pump", conf: "E", text: "Each cylinder has its own injection pump (makers included Bryce Berger, CAV, Wilson, Kyle) driven from the camshaft, feeding a nozzle in the head. Fuel is injected about 22 degrees before TDC (estimated)." },
  cam: { name: "Camshaft and pushrods", conf: "M", text: "Each bank has a camshaft turning at half crank speed, with an inlet and exhaust lobe per cylinder. The governor flyweights are driven from the camshaft, with the overspeed trip on its other end." },
  exhaust: { name: "Exhaust manifold", conf: "L", text: "Collects exhaust from each cylinder and feeds the turbocharger turbine. Whether it was a pulse or constant-pressure arrangement was not found; a simple collector is drawn." },
  inlet: { name: "Charge-air manifold", conf: "M", text: "Carries boosted air from the intercooler to the inlet valves. Charge air pressure is 16 to 18 lb/sq in at full power on the Peaks (A/B); the Class 47 manual asks for at least 12 lb/sq in." },
  turbo: { name: "Turbocharger", conf: "M", text: "Exhaust-gas turbocharger by de Havilland to a Sulzer design. Early blades shed after 8,000 to 12,000 miles; wire damping and a peg impeller drive cured it. Its compressor feeds an air-to-water intercooler (fitted on the B and C engines)." },
  cooler: { name: "Charge-air cooler", conf: "M", text: "Air-to-water intercooler between turbocharger and inlet manifold. Cooler, denser air allows more fuel and so more power. Intercooling raised the six-cylinder 6LDA28 from 1,160 to 1,250 hp and probably accounts for most of the A to B step (an inference)." },
  gears: { name: "Synchronising gears", conf: "M", text: "Spur gearing with a step-up ratio of 1 : 1.44 ties the two crankshafts together and drives the central generator shaft at about 1,080 rpm when the engine turns 750 (a 1,150 rpm rating matches 800 engine rpm; single source)." },
  generator: { name: "Main generator (Brush TG160-60)", conf: "M", text: "A DC generator rated about 1,800 kW (Class 47 data; other units differ) feeds six traction motors. On the Class 47 it sits directly on the engine underbed." },
  governor: { name: "Governor and overspeed trip", conf: "M", text: "Vickers Hydraulics unit to a Sulzer design, driven from the camshaft and sensing speed by simple flyweights. An all-speed governor: controller position sets the speed, and power follows." },
};

function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({
    color, metalness: o.metal ?? 0.45, roughness: o.rough ?? 0.5,
    transparent: o.opacity !== undefined && o.opacity < 1, opacity: o.opacity ?? 1,
    depthWrite: o.depthWrite ?? (o.opacity === undefined || o.opacity >= 1),
    emissive: o.emissive ?? 0x000000, side: o.side ?? THREE.FrontSide,
  });
}

function cylX(r, len, mt, seg = 24) { // cylinder along X
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mt);
  m.rotation.z = Math.PI / 2; return m;
}
function cylZ(r, len, mt, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mt);
  m.rotation.x = Math.PI / 2; return m;
}

function webGeometry(thick) {
  const pts = [];
  const pinY = R, pr = 1.0;
  for (let a = 0; a <= 180; a += 15) pts.push([pr * Math.cos(a * Math.PI / 180), pinY + pr * Math.sin(a * Math.PI / 180)]);
  pts.push([-1.4, 0.5]);
  for (let a = 205; a <= 335; a += 10) pts.push([2.7 * Math.cos(a * Math.PI / 180), 2.7 * Math.sin(a * Math.PI / 180)]);
  pts.push([1.4, 0.5]);
  const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2); g.rotateY(Math.PI / 2);
  return g;
}

function gearGeometry(N, rad, width) {
  const s = new THREE.Shape(); const steps = N * 4;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2; const ph = i % 4;
    const r = (ph === 1 || ph === 2) ? rad * 1.08 : rad * 0.92;
    const x = r * Math.cos(a), y = r * Math.sin(a);
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  g.translate(0, 0, -width / 2); g.rotateY(Math.PI / 2);
  return g;
}

function camLobeGeometry(profile, r0, h, thick) {
  const s = new THREE.Shape(); const n = 120;
  for (let i = 0; i < n; i++) {
    const beta = (i / n) * 360;
    const r = r0 + h * profile(beta);
    const a = beta * Math.PI / 180;
    // lobe frame: beta=0 points +Y; angle measured toward +Z -> shape x = -Z (after rotateY), so use (-sin, cos)
    const x = -r * Math.sin(a), y = r * Math.cos(a);
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2); g.rotateY(Math.PI / 2);
  return g;
}

export const CATS = {
  crankcase: [0, -14, 0], block: [0, 2, 5], liner: [0, 8, 3], head: [0, 12, 0], valves: [0, 20, 0],
  piston: [0, 3, 0], rod: [0, -5, 0], crank: [0, -9, 0], cam: [0, 0, 8], inj: [0, 5, 13],
  exhaust: [0, 6, 11], inlet: [0, 18, 0], turbo: [14, 14, 0], cooler: [8, 20, 0],
  gears: [10, 0, 0], generator: [20, 0, 0], governor: [-11, 0, 0],
};

export class EngineView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.onSelect = opts.onSelect || (() => {}); this.onHover = opts.onHover || (() => {});
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserve, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr ?? 2));
    this.renderer.localClippingEnabled = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1117);
    this.scene.fog = new THREE.Fog(0x0d1117, 90, 220);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
    this.camera.position.set(44, 30, 52);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(6, 4, 0); this.controls.enableDamping = true; this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 160; this.controls.minDistance = 8;
    this.controls.update();
    this.explode = 0; this.groups = {}; this.parts = {}; this.pickables = []; this.cyl = [];
    this.catVis = {}; this.clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    this._build();
    this._lights();
    this._pick();
    this.resize();
    this.hoverMesh = null;
  }

  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a1f26, 0.9));
    const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(30, 60, 40); this.scene.add(d);
    const d2 = new THREE.DirectionalLight(0x88aaff, 0.6); d2.position.set(-40, 20, -30); this.scene.add(d2);
    const grid = new THREE.GridHelper(160, 32, 0x2a3340, 0x1a2029); grid.position.set(8, -18, 0); this.scene.add(grid);
  }

  _grp(cat, bank) {
    const key = cat + (bank === undefined ? "" : bank);
    if (this.groups[key]) return this.groups[key];
    const g = new THREE.Group();
    const sign = bank === undefined ? 0 : (bank === 0 ? -1 : 1);
    g.userData.base = new THREE.Vector3(0, 0, bank === undefined ? 0 : sign * BANKZ);
    g.userData.cat = cat; g.userData.sign = sign || 1; g.userData.bank = bank;
    g.position.copy(g.userData.base);
    this.root.add(g); this.groups[key] = g;
    (this.catList ||= {})[cat] = (this.catList[cat] || []).concat(g);
    return g;
  }

  _add(group, mesh, partId) {
    mesh.userData.part = partId; group.add(mesh); this.pickables.push(mesh);
    mesh.userData.baseMat = mesh.material;
    return mesh;
  }

  _build() {
    this.root = new THREE.Group(); this.scene.add(this.root);
    const mCase = mat(0x4d6b88, { opacity: 0.30, rough: 0.7 }), mBlock = mat(0x5f7d96, { opacity: 0.28, rough: 0.6 });
    const mLiner = mat(0xbfd0dc, { opacity: 0.22, metal: 0.2, side: THREE.DoubleSide });
    const mPiston = mat(0xd5dade, { metal: 0.8, rough: 0.3 }), mRing = mat(0x20242a, { metal: 0.9 });
    const mRod = mat(0xa6b0b8, { metal: 0.8, rough: 0.35 }), mCrank = mat(0x8c9198, { metal: 0.8, rough: 0.35 });
    const mPin = mat(0xd9b24a, { metal: 0.8, rough: 0.3 });
    const mHead = mat(0x73848f, { rough: 0.6 }), mIn = mat(0x58a6d8, { metal: 0.6 }), mEx = mat(0xe08a3c, { metal: 0.6 });
    const mCam = mat(0xc9a227, { metal: 0.8, rough: 0.35 }), mRod2 = mat(0xc9ced2, { metal: 0.7 });
    const mInj = mat(0xe2c15a, { metal: 0.7 }), mPump = mat(0xa83a3a, { rough: 0.5 });
    const mExM = mat(0x7a4b3a, { rough: 0.6 }), mInM = mat(0x3a7ca5, { rough: 0.6 });
    const mGear = mat(0xc9a227, { metal: 0.85, rough: 0.35 }), mGen = mat(0x2c5f8a, { metal: 0.5, rough: 0.55 });

    // --- crankcase / sump (single piece spanning both banks)
    {
      const g = this._grp("crankcase");
      this._add(g, new THREE.Mesh(new THREE.BoxGeometry(34, 7.4, 2 * BANKZ + 6.4), mCase), "crankcase").position.set(0, -0.8, 0);
      this._add(g, new THREE.Mesh(new THREE.BoxGeometry(34, 3.4, 2 * BANKZ + 2), mCase), "crankcase").position.set(0, -6.5, 0);
      for (let i = 0; i < 7; i++) { // transverse girders (visual ribs)
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.6, 2 * BANKZ + 6.6), mat(0x2c3a49));
        rib.position.set((i - 3) * PITCH, -0.8, 0); this._add(g, rib, "crankcase");
      }
    }

    // --- per bank
    this.bankState = [];
    for (let b = 0; b < 2; b++) {
      const sign = b === 0 ? -1 : 1;
      const gBlock = this._grp("block", b), gLiner = this._grp("liner", b), gHead = this._grp("head", b),
        gValves = this._grp("valves", b), gPiston = this._grp("piston", b), gRod = this._grp("rod", b),
        gCrank = this._grp("crank", b), gCam = this._grp("cam", b), gInj = this._grp("inj", b);
      // block
      const blk = new THREE.Mesh(new THREE.BoxGeometry(6 * PITCH + 1, HEAD_BOT - 3.2, BORE + 2.4), mBlock);
      blk.position.set(0, (HEAD_BOT + 3.2) / 2, 0); this._add(gBlock, blk, "block");

      // crankshaft (rotating group lives in gCrank)
      const crankRot = new THREE.Group(); gCrank.add(crankRot);
      const shaft = { crankRot };
      for (let k = 0; k < 7; k++) {
        const j = cylX(0.95, 1.5, mCrank); j.position.set((k - 3) * PITCH, 0, 0); this._add(crankRot, j, "crank");
      }
      const ext = cylX(0.95, 3.2, mCrank); ext.position.set(-15 - 1.4, 0, 0); this._add(crankRot, ext, "crank");
      const extG = cylX(0.95, 4.2, mCrank); extG.position.set(15 + 1.8, 0, 0); this._add(crankRot, extG, "crank");
      const webG = webGeometry(0.7);
      for (let c = 1; c <= 6; c++) {
        const idx = FIRING.indexOf(c);
        const lt = -idx * 120; // local throw angle (deg) so that TDC occurs at firing angle
        const x = X0 + (c - 1) * PITCH;
        const tg = new THREE.Group(); tg.position.x = x; tg.rotation.x = (lt * Math.PI) / 180; crankRot.add(tg);
        for (const dx of [-1.15, 1.15]) {
          const w = new THREE.Mesh(webG, mCrank); w.position.x = dx; this._add(tg, w, "crank");
        }
        const pin = cylX(0.9, 1.7, mPin); pin.position.set(0, R, 0); this._add(tg, pin, "crank");
      }

      // camshaft assembly (outboard of the bank, above the crankcase)
      const camRot = new THREE.Group(); camRot.position.set(0, 8.5, sign * (BORE / 2 + 2.6)); gCam.add(camRot);
      camRot.position.z = sign * (BORE / 2 + 2.6) - 0; // relative to bank-group origin (z=sign*BANKZ)
      const camBar = cylX(0.55, 36, mCam); this._add(camRot, camBar, "cam");
      shaft.camRot = camRot; shaft.cylinders = [];

      for (let c = 1; c <= 6; c++) {
        const x = X0 + (c - 1) * PITCH, fa = fireAngle(b, c);
        const cyl = { c, b, x, fa };
        // liner
        const liner = new THREE.Mesh(new THREE.CylinderGeometry(BORE / 2 + 0.25, BORE / 2 + 0.25, HEAD_BOT - 3.4, 32, 1, true), mLiner);
        liner.position.set(x, (HEAD_BOT + 3.4) / 2, 0); this._add(gLiner, liner, "liner");
        // head
        const head = new THREE.Mesh(new THREE.BoxGeometry(PITCH - 0.5, 3.4, BORE + 2), mHead); head.position.set(x, HEAD_BOT + 1.7, 0); this._add(gHead, head, "head");
        const cover = new THREE.Mesh(new THREE.BoxGeometry(PITCH - 1.2, 1.0, BORE + 0.2), mat(0x4a5a66)); cover.position.set(x, HEAD_BOT + 3.9, 0); this._add(gHead, cover, "head");
        // injector (central) and its pump on the outboard side
        const inj = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 3.2, 12), mInj); inj.position.set(x, HEAD_BOT + 1.6, 0); this._add(gInj, inj, "injector");
        const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.4, 16), mPump); pump.position.set(x, 5.8, sign * (BORE / 2 + 1.5)); this._add(gInj, pump, "injector");
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), mInj); this._add(gInj, line, "injector");
        const pa = new THREE.Vector3(x, 7.0, sign * (BORE / 2 + 1.5)), pb = new THREE.Vector3(x, HEAD_BOT + 2.4, 0);
        line.position.copy(pa).add(pb).multiplyScalar(0.5); line.scale.y = pa.distanceTo(pb);
        line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pb.clone().sub(pa).normalize());
        // fuel spray / flame (animated)
        const spray = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.0, depthWrite: false }));
        spray.rotation.x = Math.PI; spray.position.set(x, HEAD_BOT - 1.0, 0); gInj.add(spray); cyl.spray = spray;
        // valves (inlet toward the inlet-manifold/inboard side, exhaust outboard)
        const mkValve = (zoff, mt, id) => {
          const v = new THREE.Group(); v.position.set(x, HEAD_BOT + 0.0, zoff);
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8), mt); stem.position.y = 1.8; v.add(stem);
          const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 20), mt); disc.position.y = 0; v.add(disc);
          this._add(gValves, stem, id); this._add(gValves, disc, id);
          gValves.add(v); v.userData.baseY = HEAD_BOT; return v;
        };
        cyl.vIn = mkValve(-sign * 0.7, mIn, "valveIn"); cyl.vEx = mkValve(sign * 0.7, mEx, "valveEx");
        // pushrods + rocker arms
        const mkPush = (zoff, id) => {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6.2, 8), mRod2); this._add(gCam, p, "cam"); return p;
        };
        cyl.pushIn = mkPush(0, "cam"); cyl.pushEx = mkPush(0, "cam");
        // cam lobes
        const exCenter = (TIMING.exhOpen + TIMING.exhClose) / 2, inCenter = (TIMING.inOpen + TIMING.inClose) / 2;
        const lobeSpec = (liftFn) => (beta) => liftFn(((-2 * beta - fa) % 720 + 720) % 720);
        for (const [fn, dx, tag] of [[exhaustLift, -0.8, "ex"], [intakeLift, 0.8, "in"]]) {
          const lobe = new THREE.Mesh(camLobeGeometry(lobeSpec(fn), 0.75, 0.55, 0.9), mCam);
          lobe.position.set(x + dx, 0, 0); this._add(camRot, lobe, "cam");
        }
        // piston
        const pg = new THREE.Group(); gPiston.add(pg); cyl.pg = pg;
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(BORE / 2 - 0.05, BORE / 2 - 0.05, CROWN + 0.2, 32), mPiston); crown.position.y = 0.1; this._add(pg, crown, "piston");
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(BORE / 2 - 0.1, BORE / 2 - 0.1, 1.6, 32, 1, true), mat(0xb8bec4, { metal: 0.7, side: THREE.DoubleSide })); skirt.position.y = -1.0; this._add(pg, skirt, "piston");
        for (const ry of [1.0, 0.75, 0.5, -0.5, -0.8]) {
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(BORE / 2 + 0.02, BORE / 2 + 0.02, 0.08, 32), mRing); ring.position.y = ry; this._add(pg, ring, "piston");
        }
        const gp = cylX(0.38, BORE - 0.5, mat(0x555d65, { metal: 0.9 })); gp.position.y = 0; this._add(pg, gp, "piston");
        pg.userData.cyl = cyl;
        // rod (in gRod, positioned by update())
        const rod = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.65), mRod); this._add(gRod, rod, "rod"); cyl.rod = rod;
        const big = cylX(1.25, 1.5, mRod); this._add(gRod, big, "rod"); cyl.big = big;
        const bigCore = cylX(1.3, 0.2, mat(0x777f86)); // visual only
        // gas volume
        const gas = new THREE.Mesh(new THREE.CylinderGeometry(BORE / 2 - 0.1, BORE / 2 - 0.1, 1, 24), new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.3, depthWrite: false }));
        gLiner.add(gas); cyl.gas = gas;
        shaft.cylinders.push(cyl);
        this.cyl.push(cyl);
      }
      this.bankState.push(shaft);
    }

    // --- manifolds
    for (let b = 0; b < 2; b++) {
      const sign = b === 0 ? -1 : 1;
      const gEx = this._grp("exhaust", b), gIn = this._grp("inlet", b);
      const exm = cylX(0.9, 33, mExM, 20); exm.position.set(0, HEAD_BOT + 1.7, sign * (BORE / 2 + 2.6)); this._add(gEx, exm, "exhaust");
      const inm = cylX(0.9, 33, mInM, 20); inm.position.set(0, HEAD_BOT + 4.2, -sign * 0.0); this._add(gIn, inm, "inlet");
      this.bankState[b].exManifold = exm; this.bankState[b].inManifold = inm;
      this.bankState[b].cylinders.forEach((cyl) => {
        const e = cylZ(0.4, 2.2, mExM, 12); e.position.set(cyl.x, HEAD_BOT + 1.7, sign * (BORE / 2 + 1.5)); this._add(gEx, e, "exhaust"); cyl.exPort = e;
        const i = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 2.3, 12), mInM); i.position.set(cyl.x, HEAD_BOT + 3.0, 0); this._add(gIn, i, "inlet"); cyl.inPort = i;
      });
    }
    // --- turbochargers (one per bank, generator end; arrangement illustrative) and coolers
    this.turbos = [];
    for (let b = 0; b < 2; b++) {
      const sign = b === 0 ? -1 : 1;
      const gT = this._grp("turbo", b), gC = this._grp("cooler", b);
      const t = new THREE.Group(); t.position.set(21, HEAD_BOT + 3, sign * (BORE / 2 + 3.2)); gT.add(t);
      const turbine = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 3.0, 28), mat(0xa24f3a, { metal: 0.6 })); turbine.rotation.z = Math.PI / 2; turbine.position.x = 1.5; this._add(t, turbine, "turbo");
      const comp = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 1.6, 3.0, 28), mat(0x4b86b4, { metal: 0.6 })); comp.rotation.z = Math.PI / 2; comp.position.x = -1.7; this._add(t, comp, "turbo");
      const rotor = new THREE.Group(); rotor.position.x = 0; t.add(rotor);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.5), mat(0xdfe6ea, { metal: 0.9 }));
      for (let k = 0; k < 8; k++) { const f = fin.clone(); f.rotation.x = (k / 8) * Math.PI; f.position.x = 3.1; rotor.add(f); }
      for (let k = 0; k < 8; k++) { const f = fin.clone(); f.rotation.x = (k / 8) * Math.PI; f.position.x = -3.3; rotor.add(f); }
      this.turbos.push(rotor);
      const cooler = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 4.0), mat(0x2d8f8a, { rough: 0.5 })); cooler.position.set(21, HEAD_BOT + 7.0, -sign * 0.0); this._add(gC, cooler, "cooler");
      // ducts
      const duct = cylX(0.55, 10, mExM, 12); duct.position.set(17, HEAD_BOT + 1.7, sign * (BORE / 2 + 2.6)); this._add(gT, duct, "exhaust");
    }
    // --- gears, generator, governor
    {
      const gG = this._grp("gears");
      const Rb = 1.89, Rc = Rb / 1.44;
      const gb = gearGeometry(36, Rb, 1.2), gc = gearGeometry(25, Rc, 1.2);
      this.gearB = [-1, 1].map((s) => { const m = new THREE.Mesh(gb, mGear); m.position.set(20.4, 0, s * BANKZ); this._add(gG, m, "gears"); return m; });
      this.gearC = new THREE.Mesh(gc, mGear); this.gearC.position.set(20.4, 0, 0); this._add(gG, this.gearC, "gears");
      const gGen = this._grp("generator");
      const gen = cylX(4.8, 14, mGen, 40); gen.position.set(30, 0, 0); this._add(gGen, gen, "generator");
      const shaftG = cylX(0.9, 8, mCrank); shaftG.position.set(24, 0, 0); this._add(gGen, shaftG, "generator");
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 12, 24), mat(0xbfc7ce, { metal: 0.9, rough: 0.3 })); rotor.rotation.z = Math.PI / 2; rotor.position.x = 30; this._add(gGen, rotor, "generator");
      this.genRotor = rotor;
      const gGov = this._grp("governor");
      const gov = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 2.6), mat(0x3b7a57, { rough: 0.5 })); gov.position.set(-19.5, 8.5, 0); this._add(gGov, gov, "governor");
      const stalk = cylX(0.4, 3, mCam); stalk.position.set(-17.8, 8.5, 0); this._add(gGov, stalk, "governor");
      const ball = new THREE.Group(); ball.position.set(-19.5, 10.4, 0); gGov.add(ball); this.govBalls = [];
      for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), mat(0xe8ecef, { metal: 0.9 })); m.position.z = s * 0.8; this._add(ball, m, "governor"); this.govBalls.push(m); }
      this.govSpin = ball;
    }
    // initial gear phase offset (half pitch on the central gear so teeth interleave)
    this.gearC.userData.phase = Math.PI / 25;
    this.explodeScale = 1;
    this.applyExplode();
  }

  applyExplode() {
    for (const key in this.groups) {
      const g = this.groups[key], v = CATS[g.userData.cat]; if (!v) continue;
      const sz = g.userData.bank === undefined ? 1 : g.userData.sign;
      g.position.set(g.userData.base.x + v[0] * this.explode, g.userData.base.y + v[1] * this.explode, g.userData.base.z + sz * v[2] * this.explode);
    }
  }
  setExplode(v) {
    this.explode = v; this.applyExplode();
    const cur = this.camera.position.clone().sub(this.controls.target);
    const last = this._exLast ?? 0;
    if (Math.abs(last - v) > 1e-6) { this.camera.position.copy(this.controls.target).add(cur.setLength(Math.min(this.controls.maxDistance, cur.length() * (1 + 0.8 * v) / (1 + 0.8 * last)))); }
    this._exLast = v;
  }

  setSection(on) {
    this.renderer.localClippingEnabled = false;
    this.renderer.clippingPlanes = on ? [this.clip] : [];
    this.clip.constant = 3.2; // keep z <= 3.2: cuts through the bank-B cylinder axis
    this.clip.normal.set(0, 0, -1);
  }

  setCategoryVisible(cat, vis) { (this.catList[cat] || []).forEach((g) => (g.visible = vis)); }

  setXray(on) {
    // make solid structure translucent so the running gear shows
    for (const m of this.pickables) {
      const id = m.userData.part;
      if (id === "crankcase" || id === "head" || id === "generator") {
        const base = m.userData.baseMat;
        if (on) { if (!m.userData.xr) { m.userData.xr = base.clone(); m.userData.xr.transparent = true; m.userData.xr.opacity = 0.18; m.userData.xr.depthWrite = false; } m.material = m.userData.xr; }
        else m.material = base;
      }
    }
  }

  setView(name) {
    const P = { iso: [44, 30, 52, 6, 4, 0], top: [6, 90, 1, 6, 4, 0], front: [6, 6, 80, 6, 4, 0], side: [95, 8, 0, 6, 4, 0], gen: [50, 14, 24, 14, 4, 0], free: [-42, 14, 30, 0, 4, 0] };
    const p = P[name] || P.iso; this._tween = { t: 0, from: [this.camera.position.clone(), this.controls.target.clone()], to: [new THREE.Vector3(p[0], p[1], p[2]), new THREE.Vector3(p[3], p[4], p[5])] };
  }

  focusPart(id) {
    const box = new THREE.Box3(); let any = false;
    for (const m of this.pickables) if (m.userData.part === id) { box.expandByObject(m); any = true; }
    if (!any) return; const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()).length();
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this._tween = { t: 0, from: [this.camera.position.clone(), this.controls.target.clone()], to: [c.clone().add(dir.multiplyScalar(Math.max(24, s * 1.4))), c] };
    this.highlight(id, 1800);
  }

  highlight(id, ms = 1200) {
    this._hl = { id, until: performance.now() + ms };
  }

  _pick() {
    const ray = new THREE.Raycaster(), v = new THREE.Vector2();
    const set = (e) => { const r = this.canvas.getBoundingClientRect(); v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(v, this.camera); };
    const hit = () => { const h = ray.intersectObjects(this.pickables.filter((m) => m.visible && m.parent && m.parent.visible), false); const solid = h.find((x) => !(x.object.material && x.object.material.transparent && x.object.material.opacity < 0.5)); return h.length ? (solid || h[0]).object : null; };
    let down = null;
    this.canvas.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
    this.canvas.addEventListener("pointercancel", () => { down = null; });
    this.canvas.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; set(e); const m = hit();
      if (m) { this.selected = m.userData.part; this.onSelect(m.userData.part); this.highlight(m.userData.part, 1500); }
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (e.buttons) return; set(e); const m = hit(); this.hoverPart = m ? m.userData.part : null;
      this.canvas.style.cursor = m ? "pointer" : "grab"; this.onHover(this.hoverPart, e);
    });
  }

  resize() {
    const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 500;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    const portrait = w / h < 0.9; // pull back on tall phone canvases so the engine fits
    if (portrait !== this._portrait) { this._portrait = portrait; const d = this.camera.position.clone().sub(this.controls.target); d.multiplyScalar(portrait ? 1.7 : 1 / 1.7); this.camera.position.copy(this.controls.target).add(d); }
    this.camera.updateProjectionMatrix();
  }

  // Update animated state from the Engine
  update(eng, dt) {
    const th = eng.theta, running = eng.running, load = eng.load, boost = eng.boost, rpm = eng.rpm;
    for (let b = 0; b < 2; b++) {
      const bs = this.bankState[b];
      bs.crankRot.rotation.x = ((th - BANK_OFFSET[b]) * Math.PI) / 180;
      bs.camRot.rotation.x = ((th / 2) * Math.PI) / 180;
      for (const cyl of bs.cylinders) {
        const alpha = cycleAngle(th, b, cyl.c), phi = ((th - cyl.fa) * Math.PI) / 180;
        const down = pistonDown(th - cyl.fa) * U;
        const pinY = TDC_PIN - down;
        cyl.pg.position.set(cyl.x, pinY, 0);
        // crank pin world offset (in bank-group frame): angle phi from +Y toward +Z
        const cpY = R * Math.cos(phi), cpZ = R * Math.sin(phi);
        const dy = pinY - cpY, dz = -cpZ, len = Math.hypot(dy, dz);
        cyl.rod.position.set(cyl.x, cpY + dy / 2, cpZ + dz / 2); cyl.rod.scale.y = len;
        cyl.rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, dy / len, dz / len));
        cyl.big.position.set(cyl.x, cpY, cpZ);
        // valves
        const liftEx = exhaustLift(alpha), liftIn = intakeLift(alpha);
        cyl.vEx.position.y = HEAD_BOT - liftEx * 0.9; cyl.vIn.position.y = HEAD_BOT - liftIn * 0.9;
        // pushrods rest on the lobe tops
        const rb = 0.75 + 0.55; // base radius + h
        const baseTop = 8.5 + 0.75 + liftEx * 0.55; // approximates the camshaft axis y + cam radius
        const sign = b === 0 ? -1 : 1;
        cyl.pushEx.position.set(cyl.x - 0.8, 8.5 + 0.75 + liftEx * 0.55 + 3.1, sign * (BORE / 2 + 2.6)); // camRot origin is in gCam frame
        cyl.pushIn.position.set(cyl.x + 0.8, 8.5 + 0.75 + liftIn * 0.55 + 3.1, sign * (BORE / 2 + 2.6));
        // gas volume
        const crownY = pinY + CROWN, top = HEAD_BOT, hgt = Math.max(0.05, top - crownY);
        cyl.gas.scale.y = hgt; cyl.gas.position.set(cyl.x, crownY + hgt / 2, 0);
        const s = strokeOf(alpha), gm = cyl.gas.material;
        if (!running && rpm < 1) { gm.color.setHex(0x33557a); gm.opacity = 0.18; }
        else if (s === 2) { gm.color.setHex(0x4aa8ff); gm.opacity = 0.32; }
        else if (s === 3) { const k = (alpha - 540) / 180; gm.color.setRGB(0.3 + 0.7 * k, 0.55 + 0.1 * k, 1 - 0.7 * k); gm.opacity = 0.35 + 0.25 * k; }
        else if (s === 0) { const k = Math.max(0, 1 - alpha / 180); gm.color.setRGB(1, 0.35 + 0.5 * k * k, 0.05 + 0.4 * Math.max(0, k - 0.6)); gm.opacity = running ? 0.25 + 0.65 * (0.25 + 0.75 * load) * k : 0.3; }
        else { const k = (alpha - 180) / 180; gm.color.setRGB(0.55, 0.42 - 0.12 * k, 0.32 - 0.12 * k); gm.opacity = 0.42 - 0.2 * k; }
        // spray
        const sp = running && injecting(alpha) ? 1 : 0; cyl.spray.material.opacity = sp * 0.9;
        // ports glow
        cyl.exPort.material = cyl.exPort.userData.m || (cyl.exPort.userData.m = cyl.exPort.material.clone());
        cyl.exPort.material.emissive.setRGB(liftEx > 0.02 ? 0.9 * liftEx * (running ? 1 : 0.3) : 0, liftEx > 0.02 ? 0.3 * liftEx : 0, 0);
        cyl.inPort.material = cyl.inPort.userData.m || (cyl.inPort.userData.m = cyl.inPort.material.clone());
        cyl.inPort.material.emissive.setRGB(0, liftIn > 0.02 ? 0.3 * liftIn : 0, liftIn > 0.02 ? 0.7 * liftIn : 0);
      }
    }
    // turbo spin: scales with boost
    const spin = (running ? (0.2 + boost - 1) * 40 : 0) * dt * (rpm / 750 + 0.2);
    this.turbos.forEach((r) => (r.rotation.x += spin * 3));
    // gears: bank gears turn with crank; central gear at -1.44x
    const a = (th * Math.PI) / 180;
    this.gearB[0].rotation.x = a - (BANK_OFFSET[0] * Math.PI) / 180; this.gearB[1].rotation.x = a - (BANK_OFFSET[1] * Math.PI) / 180;
    this.gearC.rotation.x = -a * 1.44 + this.gearC.userData.phase;
    this.genRotor.rotation.x = -a * 1.44;
    this.govSpin.rotation.y = (th / 2) * Math.PI / 180;
    const open = 0.8 + 0.5 * Math.min(1, rpm / 750);
    this.govBalls[0].position.z = -open; this.govBalls[1].position.z = open;
    // exhaust manifold colour with load
    for (const bs of this.bankState) { bs.exManifold.material.emissive.setRGB(0.35 * load * (running ? 1 : 0), 0.08 * load, 0); }
    // camera tween
    if (this._tween) {
      this._tween.t = Math.min(1, this._tween.t + dt / 0.9); const k = this._tween.t * this._tween.t * (3 - 2 * this._tween.t);
      this.camera.position.lerpVectors(this._tween.from[0], this._tween.to[0], k); this.controls.target.lerpVectors(this._tween.from[1], this._tween.to[1], k);
      if (this._tween.t >= 1) this._tween = null;
    }
    // highlight
    const now = performance.now();
    for (const m of this.pickables) {
      const id = m.userData.part; const em = m.material.emissive; if (!em) continue;
      const hl = (this._hl && this._hl.until > now && this._hl.id === id) ? 0.5 + 0.3 * Math.sin(now / 90) : (this.hoverPart === id ? 0.25 : 0);
      if (id === "exhaust" || m.userData.part === "valveEx" || m.userData.part === "valveIn" || m.userData.part === "inlet") { if (hl > 0 && m.userData.m === undefined) { /* shared materials: flash via color */ } }
      m.userData._hl = hl;
    }
    this.controls.update();
  }

  render() {
    // apply highlight by temporary emissive boost on non-port meshes
    const touched = [];
    for (const m of this.pickables) {
      const hl = m.userData._hl; if (!hl || !m.material.emissive) continue;
      const e = m.material.emissive; touched.push([e, e.r, e.g, e.b]); e.setRGB(Math.max(e.r, 0.2 * hl * 2), Math.max(e.g, 0.55 * hl * 1.6), Math.max(e.b, 0.85 * hl * 1.4));
    }
    this.renderer.render(this.scene, this.camera);
    for (const [e, r, g, b] of touched) e.setRGB(r, g, b);
  }
}
