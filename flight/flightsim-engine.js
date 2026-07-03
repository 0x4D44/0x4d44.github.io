/* ============================================================
   0x4D44 :: FLIGHT — engine
   A self-contained flight simulator core built on THREE (r128,
   global THREE). Exposes window.FlightSim with a small API the
   almanac chrome drives. Owns a WebGL canvas (world) and a 2D
   canvas (amber-phosphor HUD). Physics is a tuned 6-DOF-lite
   model; the world is infinite procedural terrain with biomes.
   ============================================================ */
(function () {
"use strict";
if (window.FlightSim) { return; }   // singleton: DC env may evaluate this script twice

var THREE = window.THREE;
var DEG = Math.PI / 180, RAD = 180 / Math.PI;
var G = 9.81;

/* ---------- tiny deterministic value noise ---------- */
function hash2(x, y) {
  var h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 100000) / 100000; // 0..1
}
function smoother(t){ return t*t*t*(t*(t*6-15)+10); }
function vnoise(x, y) {
  var xi = Math.floor(x), yi = Math.floor(y);
  var xf = x - xi, yf = y - yi;
  var a = hash2(xi, yi), b = hash2(xi+1, yi);
  var c = hash2(xi, yi+1), d = hash2(xi+1, yi+1);
  var u = smoother(xf), v = smoother(yf);
  return (a*(1-u)+b*u)*(1-v) + (c*(1-u)+d*u)*v; // 0..1
}
function fbm(x, y, oct, lac, gain) {
  oct = oct||4; lac = lac||2.0; gain = gain||0.5;
  var amp = 1, freq = 1, sum = 0, norm = 0;
  for (var i=0;i<oct;i++){ sum += amp*vnoise(x*freq, y*freq); norm += amp; amp*=gain; freq*=lac; }
  return sum/norm; // 0..1
}
function ridged(x,y,oct){
  oct=oct||4; var amp=1,freq=1,sum=0,norm=0;
  for(var i=0;i<oct;i++){ var n=1-Math.abs(vnoise(x*freq,y*freq)*2-1); n=n*n; sum+=amp*n; norm+=amp; amp*=0.5; freq*=2.0; }
  return sum/norm;
}
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,t){ return a+(b-a)*t; }
function smoothstep(a,b,x){ var t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); }

/* ============================================================
   WORLD CONSTANTS
   ============================================================ */
var CONT_FREQ = 0.000085;   // land vs sea
var ELEV_FREQ = 0.00035;    // hills
var MTN_FREQ  = 0.00022;    // mountains
var MOIST_FREQ= 0.00013;
var SETTLE_FREQ = 0.00030;
var SEA = 0.0;              // sea level (world y)
var MTN_H = 1500;          // max mountain height

/* biome colours (linear-ish) */
var COL = {
  ocean:   new THREE.Color(0x14344a),
  sand:    new THREE.Color(0xcdb079),
  desert:  new THREE.Color(0xc79a5b),
  grass:   new THREE.Color(0x5c7d43),
  plains:  new THREE.Color(0x7c8f4e),
  forest:  new THREE.Color(0x3f5c33),
  rock:    new THREE.Color(0x7d7361),
  snow:    new THREE.Color(0xe9eef2),
  city:    new THREE.Color(0x8a8577),
};

/* continent field: >0 land, <0 sea. Smooth coastlines. */
function continentAt(x, z) {
  var n = fbm(x*CONT_FREQ, z*CONT_FREQ, 4, 2.1, 0.55); // 0..1
  return (n - 0.46);
}
function settlementAt(x, z) {
  // 0..1 how "settled" — city cores where high
  var s = fbm(x*SETTLE_FREQ+51.3, z*SETTLE_FREQ-19.7, 3, 2.0, 0.5);
  return s;
}

/* Full terrain sample: returns {h, biome, color, slopeCity} */
var _c = new THREE.Color();
function sampleTerrain(x, z) {
  var cont = continentAt(x, z);
  var moist = fbm(x*MOIST_FREQ+8.1, z*MOIST_FREQ+2.3, 3, 2.0, 0.5);
  var h, biome;
  if (cont < 0) {
    // ocean floor
    h = SEA - 40 - (-cont) * 900;
    return { h: h, biome: "ocean", color: COL.ocean };
  }
  var coast = smoothstep(0.0, 0.05, cont); // 0 at shoreline ->1 inland
  // base rolling elevation
  var base = fbm(x*ELEV_FREQ, z*ELEV_FREQ, 5, 2.0, 0.5); // 0..1
  // mountain mask from a low-freq field
  var mtnMask = smoothstep(0.55, 0.85, fbm(x*MTN_FREQ+100, z*MTN_FREQ-40, 3, 2.0, 0.5));
  var mtn = ridged(x*MTN_FREQ*1.6, z*MTN_FREQ*1.6, 5) * mtnMask;
  var elev = base*120 + mtn*MTN_H;
  elev *= coast;
  h = SEA + 6 + elev;

  var settle = settlementAt(x, z);
  var flatEnough = base < 0.62 && mtnMask < 0.25;
  var isCity = settle > 0.66 && flatEnough && coast > 0.4;
  var isTown = !isCity && settle > 0.56 && flatEnough && coast > 0.35;

  var col;
  if (h > SEA + 950) { col = COL.snow; biome = "snow"; }
  else if (mtn*MTN_H > 260 || (h > SEA+520 && base>0.5)) { col = COL.rock; biome = "mountains"; }
  else if (isCity) { col = COL.city; biome = "city"; }
  else if (isTown) { col = COL.plains; biome = "town"; }
  else if (coast < 0.16) { col = COL.sand; biome = "beach"; }
  else if (moist < 0.34) { col = COL.desert; biome = "desert"; }
  else if (moist > 0.60) { col = COL.forest; biome = "forest"; }
  else { col = COL.plains; biome = "plains"; }

  // slight elevation shading
  var shade = clamp(0.82 + (base-0.4)*0.35, 0.6, 1.12);
  _c.copy(col).multiplyScalar(shade);
  return { h: h, biome: biome, color: _c.clone() };
}

/* ============================================================
   AIRCRAFT DEFINITIONS
   thrust in Newtons; S wing area m^2; mass kg. Rates deg/s.
   ============================================================ */
var AIRCRAFT = {
  cessna172: {
    name: "Cessna 172", cat: "Light prop", icon: "prop",
    mass: 1100, S: 16.2, thrust: 5200, prop: true, ab: false,
    CL0: 0.28, CLa: 5.0, CLmax: 1.45, CD0: 0.032, k: 0.045,
    stall: 27, cruise: 62, vmax: 90, cruiseAlt: 900,
    pitchRate: 40, rollRate: 90, yawRate: 24, agility: 1.0, damp: 2.4,
    length: 8.3, span: 11, scale: 1.0, engineHz: 82, jet: false,
    color: 0xdfe4ea, accent: 0xa0442a,
    desc: "Docile four-seat trainer. Forgiving, slow, honest."
  },
  businessjet: {
    name: "Meridian J-40", cat: "Business jet", icon: "bizjet",
    mass: 8500, S: 30, thrust: 30000, prop: false, ab: false,
    CL0: 0.16, CLa: 5.2, CLmax: 1.5, CD0: 0.021, k: 0.043,
    stall: 52, cruise: 205, vmax: 265, cruiseAlt: 3200,
    pitchRate: 26, rollRate: 95, yawRate: 14, agility: 1.15, damp: 2.2,
    length: 17, span: 16, scale: 1.0, engineHz: 150, jet: true,
    color: 0xf3f5f7, accent: 0x2a5b8a,
    desc: "Swept-wing light jet. Quick, clean, business-class calm."
  },
  f16: {
    name: "F-16 Falcon", cat: "Fighter", icon: "fighter",
    mass: 12000, S: 28, thrust: 76000, abThrust: 128000, prop: false, ab: true,
    CL0: 0.10, CLa: 5.6, CLmax: 1.9, CD0: 0.020, k: 0.11,
    stall: 62, cruise: 260, vmax: 600, cruiseAlt: 4500,
    pitchRate: 90, rollRate: 260, yawRate: 22, agility: 2.4, damp: 1.6,
    length: 15, span: 10, scale: 1.0, engineHz: 210, jet: true,
    color: 0x8b929b, accent: 0x3a4048,
    desc: "Fly-by-wire dogfighter. Afterburner, vicious roll, unforgiving."
  },
  b757: {
    name: "Boeing 757", cat: "Narrowbody", icon: "airliner",
    mass: 95000, S: 185, thrust: 320000, prop: false, ab: false,
    CL0: 0.19, CLa: 5.0, CLmax: 1.6, CD0: 0.019, k: 0.045,
    stall: 66, cruise: 240, vmax: 300, cruiseAlt: 5200,
    pitchRate: 14, rollRate: 30, yawRate: 8, agility: 0.72, damp: 2.6,
    length: 47, span: 38, scale: 1.0, engineHz: 130, jet: true,
    color: 0xeef1f4, accent: 0xb0132a,
    desc: "Overpowered narrowbody — famous climb rate, twin-jet grace."
  },
  b767: {
    name: "Boeing 767", cat: "Widebody", icon: "airliner",
    mass: 135000, S: 283, thrust: 440000, prop: false, ab: false,
    CL0: 0.20, CLa: 5.0, CLmax: 1.62, CD0: 0.019, k: 0.045,
    stall: 70, cruise: 250, vmax: 300, cruiseAlt: 5600,
    pitchRate: 12, rollRate: 27, yawRate: 7, agility: 0.66, damp: 2.7,
    length: 55, span: 48, scale: 1.06, engineHz: 122, jet: true,
    color: 0xecf0f3, accent: 0x1d4e79,
    desc: "Transatlantic widebody. Big, smooth, deliberate."
  },
  b747: {
    name: "Boeing 747", cat: "Jumbo", icon: "jumbo",
    mass: 320000, S: 511, thrust: 1000000, prop: false, ab: false,
    CL0: 0.21, CLa: 4.8, CLmax: 1.65, CD0: 0.018, k: 0.043,
    stall: 76, cruise: 255, vmax: 300, cruiseAlt: 6000,
    pitchRate: 10, rollRate: 22, yawRate: 6, agility: 0.55, damp: 2.9,
    length: 70, span: 64, scale: 1.12, engineHz: 108, jet: true, quad: true,
    color: 0xf1f3f5, accent: 0xc19a2e,
    desc: "Queen of the Skies. Four engines, upper deck, immense inertia."
  },
  a380: {
    name: "Airbus A380", cat: "Superjumbo", icon: "superjumbo",
    mass: 510000, S: 845, thrust: 1240000, prop: false, ab: false,
    CL0: 0.22, CLa: 4.8, CLmax: 1.68, CD0: 0.018, k: 0.042,
    stall: 78, cruise: 255, vmax: 300, cruiseAlt: 6200,
    pitchRate: 9, rollRate: 19, yawRate: 5, agility: 0.5, damp: 3.1,
    length: 73, span: 80, scale: 1.18, engineHz: 100, jet: true, quad: true,
    doubledeck: true,
    color: 0xf4f6f8, accent: 0x1b6ca8,
    desc: "The largest passenger jet ever. Full double-deck. Serene, colossal."
  },
};
var AIRCRAFT_ORDER = ["cessna172","businessjet","f16","b757","b767","b747","a380"];

/* ============================================================
   AIRCRAFT MESH BUILDER (low-poly, from primitives)
   ============================================================ */
function mat(color, opts){
  opts = opts || {};
  return new THREE.MeshStandardMaterial({ color: color, roughness: opts.rough!=null?opts.rough:0.55, metalness: opts.metal!=null?opts.metal:0.25, flatShading: true });
}
function buildAircraft(def) {
  var g = new THREE.Group();
  var body = mat(def.color, {rough:0.5, metal:0.35});
  var accent = mat(def.accent, {rough:0.5, metal:0.3});
  var dark = mat(0x2a2e33, {rough:0.6, metal:0.5});
  var glass = new THREE.MeshStandardMaterial({ color:0x122636, roughness:0.15, metalness:0.6, transparent:true, opacity:0.85, flatShading:true });
  var L = def.length, span = def.span;

  // fuselage — stretched cylinder + nose cone
  var fr = clamp(L*0.055, 0.5, 4.2);
  var fus = new THREE.Mesh(new THREE.CylinderGeometry(fr, fr*0.82, L, def.jet?18:12), body);
  fus.rotation.x = Math.PI/2; g.add(fus);
  var nose = new THREE.Mesh(new THREE.ConeGeometry(fr, L*0.18, 16), body);
  nose.rotation.x = -Math.PI/2; nose.position.z = -L*0.5 - L*0.07; g.add(nose);
  var tailcone = new THREE.Mesh(new THREE.ConeGeometry(fr*0.82, L*0.16, 14), body);
  tailcone.rotation.x = Math.PI/2; tailcone.position.z = L*0.5 + L*0.06; g.add(tailcone);

  // main wing
  var wingChord = span*0.16, wingThick = clamp(fr*0.35,0.15,1.2);
  var wing = new THREE.Mesh(new THREE.BoxGeometry(span, wingThick, wingChord), body);
  var wingZ = def.prop ? -L*0.02 : L*0.02;
  wing.position.set(0, def.prop? fr*0.7 : -fr*0.1, wingZ);
  if (!def.prop) { wing.geometry.translate(0,0,0); wing.rotation.x = -3*DEG; } // slight sweep hint via skew below
  g.add(wing);
  // swept look: add tapered tips for jets
  if (def.jet) {
    var tip = new THREE.Mesh(new THREE.BoxGeometry(span*0.5, wingThick*0.8, wingChord*0.5), body);
    tip.position.set(0, wing.position.y, wingZ + wingChord*0.35);
    g.add(tip);
  }

  // horizontal stabiliser
  var hs = new THREE.Mesh(new THREE.BoxGeometry(span*0.42, wingThick*0.7, wingChord*0.55), body);
  hs.position.set(0, fr*0.2, L*0.46); g.add(hs);
  // vertical fin
  var vf = new THREE.Mesh(new THREE.BoxGeometry(wingThick*0.8, span*0.16, wingChord*0.7), accent);
  vf.position.set(0, fr*0.2 + span*0.08, L*0.44); g.add(vf);

  // cockpit glass
  var cpZ = -L*0.30;
  var cp = new THREE.Mesh(new THREE.SphereGeometry(fr*0.85, 12, 8, 0, Math.PI*2, 0, Math.PI*0.55), glass);
  cp.scale.set(0.9, 0.7, 1.7); cp.position.set(0, fr*0.55, cpZ); g.add(cp);

  // engines
  function podEngine(x, z, r, len) {
    var e = new THREE.Group();
    var nac = new THREE.Mesh(new THREE.CylinderGeometry(r, r*0.9, len, 14), dark);
    nac.rotation.x = Math.PI/2; e.add(nac);
    var intake = new THREE.Mesh(new THREE.TorusGeometry(r*0.98, r*0.12, 8, 16), accent);
    intake.position.z = -len*0.5; e.add(intake);
    var fan = new THREE.Mesh(new THREE.CircleGeometry(r*0.85, 16), new THREE.MeshStandardMaterial({color:0x11151a, roughness:0.3, metalness:0.7, side:THREE.DoubleSide}));
    fan.position.z = -len*0.5+0.02; e.add(fan);
    e.position.set(x, wing.position.y - r*0.9, z);
    return e;
  }
  if (def.prop) {
    var spin = new THREE.Mesh(new THREE.ConeGeometry(fr*0.5, L*0.10, 14), accent);
    spin.rotation.x = -Math.PI/2; spin.position.set(0,0,-L*0.5-L*0.15); g.add(spin);
    var propDisc = new THREE.Mesh(new THREE.CircleGeometry(span*0.18, 20), new THREE.MeshBasicMaterial({color:0x1a1a1a, transparent:true, opacity:0.22, side:THREE.DoubleSide}));
    propDisc.position.set(0,0,-L*0.5-L*0.16); g.add(propDisc);
    g.userData.propDisc = propDisc;
    // high wing struts already implied
  } else if (def.cat === "Fighter") {
    var eng = new THREE.Mesh(new THREE.CylinderGeometry(fr*0.7, fr*0.8, L*0.3, 14), dark);
    eng.rotation.x = Math.PI/2; eng.position.z = L*0.5; g.add(eng);
    var burner = new THREE.Mesh(new THREE.CylinderGeometry(fr*0.55, fr*0.4, L*0.06, 14), new THREE.MeshBasicMaterial({color:0x552211}));
    burner.rotation.x = Math.PI/2; burner.position.z = L*0.62; g.add(burner);
    g.userData.burner = burner;
  } else {
    var er = fr*0.62, elen = L*0.12;
    var xs = def.quad ? [span*0.19, span*0.34] : [span*0.28];
    for (var s=0;s<xs.length;s++){
      var e1 = podEngine(xs[s], wingZ+wingChord*0.2, er, elen); g.add(e1);
      var e2 = podEngine(-xs[s], wingZ+wingChord*0.2, er, elen); g.add(e2);
    }
  }

  // double-deck bulge (A380) / hump (747)
  if (def.doubledeck) {
    var deck = new THREE.Mesh(new THREE.CylinderGeometry(fr*0.98, fr*0.98, L*0.72, 18), body);
    deck.rotation.x = Math.PI/2; deck.position.set(0, fr*0.35, 0); deck.scale.set(1.0,0.72,1); g.add(deck);
  } else if (def.icon === "jumbo") {
    var hump = new THREE.Mesh(new THREE.CylinderGeometry(fr*0.7, fr*0.7, L*0.26, 14), body);
    hump.rotation.x = Math.PI/2; hump.position.set(0, fr*0.6, -L*0.24); hump.scale.set(1,0.7,1); g.add(hump);
  }

  // window strip for airliners
  if (def.mass > 40000) {
    var winMat = new THREE.MeshBasicMaterial({color:0x0d1a24});
    var strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, fr*0.16, L*0.7), winMat);
    strip.position.set(fr*0.99, fr*0.15, 0); g.add(strip);
    var strip2 = strip.clone(); strip2.position.x = -fr*0.99; g.add(strip2);
  }

  g.scale.setScalar(def.scale);
  return g;
}

/* ============================================================
   MAIN ENGINE OBJECT
   ============================================================ */
var FS = {
  ready: false, running: false, paused: false,
  cb: {},               // callbacks {onState, onReady}
  aircraftKey: "cessna172",
  cameraMode: 0,         // 0 chase,1 cockpit,2 hud,3 orbit,4 tower
  cameraModes: ["Chase","Cockpit","HUD","Orbit","Fly-by"],
  timeOfDay: "day",
  aids: { stability: true, autoTrim: true, stallProtect: true, easyLand: true },
  ap: { on:false, hdg:false, alt:false, spd:false, tgtHdg:0, tgtAlt:1000, tgtSpd:0 },
  invertPitch: false,
  failures: { engine:false, engineOut:0, hydraulics:false, gearStuck:false, instruments:false, flaps:false, randomOn:false },
};

/* live physics state */
var st = null;
var spawnBase = { x: 0, z: 0 };
function findGoodSpawn() {
  var order = { city:6, town:5, plains:4, forest:3, desert:2, beach:2, mountains:1 };
  var best = null, bestScore = -1;
  for (var i=0;i<1400;i++){
    var ang = Math.random()*Math.PI*2, r = 3000 + Math.random()*42000;
    var x = Math.cos(ang)*r, z = Math.sin(ang)*r;
    var b = sampleTerrain(x, z);
    var sc = order[b.biome] || 0;
    if (sc <= 0) continue;
    // bonus if coast nearby (some ocean within 3km) for scenery variety
    if (sampleTerrain(x+2600, z).biome==='ocean' || sampleTerrain(x, z+2600).biome==='ocean') sc += 1.5;
    sc += Math.random()*0.5;
    if (sc > bestScore){ bestScore = sc; best = {x:x, z:z}; if (sc>=7) break; }
  }
  if (best) spawnBase = best;
}
function freshState(def, spawn) {
  var gh = groundHeight(spawnBase.x, spawnBase.z);
  var y0 = Math.max(def.cruiseAlt, gh + def.cruiseAlt*0.55);
  var s = {
    pos: new THREE.Vector3(spawnBase.x, y0, spawnBase.z),
    quat: new THREE.Quaternion(),
    vel: new THREE.Vector3(0,0,-def.cruise),
    omega: new THREE.Vector3(0,0,0),   // body angular rates rad/s
    throttle: def.prop?0.72:0.62,
    flaps: 0, gear: 0, brakes: 0, spoilers:0,
    onGround: false, crashed: false, g: 1, aoa: 0, ias: def.cruise, vs:0,
    heading: 0, propPhase: 0, abActive:false, ktick:0, engineN: 0.6,
  };
  // orient nose along -Z, level
  s.quat.identity();
  s.vel.set(0,0,-def.cruise);
  FS.ap.tgtAlt = Math.round(def.cruiseAlt/100)*100;
  FS.ap.tgtSpd = def.cruise;
  FS.ap.tgtHdg = 0;
  return s;
}

/* ---------- THREE setup ---------- */
var renderer, scene, cam, sun, hemi, worldEl, hudCanvas, hudCtx;
var acMesh = null, acDef = null;
var water, skyMesh, stars, sunSprite;
var tiles = [], TILE = 1200, GRID = 7, SEG = 24, HALF = 3;
var centerGX = 1e9, centerGZ = 1e9;
var treeMesh, bldgMesh;
var _raf = 0, _last = 0, _acc = 0, _lastRaf = 0;
var input = { pitch:0, roll:0, yaw:0, thrRate:0 };
var keys = {};
var virtualInput = { pitch:0, roll:0, yaw:0, thrRate:0, yokeActive:false };
var mouseYoke = false, mx=0, my=0;

function clearInputState() {
  keys = {};
  input.pitch = 0; input.roll = 0; input.yaw = 0; input.thrRate = 0;
  virtualInput.pitch = 0; virtualInput.roll = 0; virtualInput.yaw = 0; virtualInput.thrRate = 0;
  virtualInput.yokeActive = false;
}

function setVirtualControls(ctrl) {
  if (!ctrl) return;
  if (Object.prototype.hasOwnProperty.call(ctrl, "pitch")) virtualInput.pitch = clamp(Number(ctrl.pitch) || 0, -1, 1);
  if (Object.prototype.hasOwnProperty.call(ctrl, "roll")) virtualInput.roll = clamp(Number(ctrl.roll) || 0, -1, 1);
  if (Object.prototype.hasOwnProperty.call(ctrl, "yaw")) virtualInput.yaw = clamp(Number(ctrl.yaw) || 0, -1, 1);
  if (Object.prototype.hasOwnProperty.call(ctrl, "thrRate")) virtualInput.thrRate = clamp(Number(ctrl.thrRate) || 0, -1, 1);
  if (Object.prototype.hasOwnProperty.call(ctrl, "yokeActive")) virtualInput.yokeActive = !!ctrl.yokeActive;
}

function makeSkyTexture(day) {
  var c = document.createElement("canvas"); c.width=16; c.height=256;
  var g = c.getContext("2d");
  var grd = g.createLinearGradient(0,0,0,256);
  if (day) {
    grd.addColorStop(0, "#2b5c93");
    grd.addColorStop(0.5, "#77a9d0");
    grd.addColorStop(0.82, "#bcd6e6");
    grd.addColorStop(1, "#dfeaf0");
  } else {
    grd.addColorStop(0, "#05060f");
    grd.addColorStop(0.55, "#0b1226");
    grd.addColorStop(0.85, "#1a2340");
    grd.addColorStop(1, "#2b3350");
  }
  g.fillStyle = grd; g.fillRect(0,0,16,256);
  var t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

function initThree() {
  renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:"high-performance", preserveDrawingBuffer:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 1.75));
  renderer.setSize(worldEl.clientWidth, worldEl.clientHeight);
  renderer.domElement.style.display = "block";
  worldEl.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(62, worldEl.clientWidth/worldEl.clientHeight, 0.6, 60000);

  hemi = new THREE.HemisphereLight(0xbcd6e6, 0x5b6144, 0.9);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
  sun.position.set(-0.5, 1, 0.3).multiplyScalar(1000);
  scene.add(sun);

  // sky dome
  var skyGeo = new THREE.SphereGeometry(48000, 24, 16);
  skyMesh = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: makeSkyTexture(true), side: THREE.BackSide, depthWrite:false, fog:false }));
  scene.add(skyMesh);

  // sun sprite
  var sc = document.createElement("canvas"); sc.width=sc.height=128;
  var sg = sc.getContext("2d");
  var rad = sg.createRadialGradient(64,64,4,64,64,64);
  rad.addColorStop(0,"rgba(255,250,230,1)"); rad.addColorStop(0.25,"rgba(255,240,200,0.9)"); rad.addColorStop(1,"rgba(255,240,200,0)");
  sg.fillStyle=rad; sg.fillRect(0,0,128,128);
  sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:new THREE.CanvasTexture(sc), depthWrite:false, depthTest:false, fog:false }));
  sunSprite.scale.setScalar(3400); scene.add(sunSprite);

  // stars
  var sp = new THREE.BufferGeometry(); var arr=[];
  for (var i=0;i<1400;i++){
    var v = new THREE.Vector3((Math.random()-0.5), Math.random()*0.5+0.05, (Math.random()-0.5)).normalize().multiplyScalar(46000);
    arr.push(v.x,v.y,v.z);
  }
  sp.setAttribute("position", new THREE.Float32BufferAttribute(arr,3));
  stars = new THREE.Points(sp, new THREE.PointsMaterial({color:0xffffff, size:120, sizeAttenuation:true, fog:false, transparent:true, opacity:0}));
  scene.add(stars);

  scene.fog = new THREE.Fog(0xbcd6e6, TILE*2.2, TILE*HALF*1.02);

  // water plane (follows camera)
  water = new THREE.Mesh(new THREE.PlaneGeometry(TILE*GRID*1.4, TILE*GRID*1.4, 1, 1),
    new THREE.MeshStandardMaterial({ color:0x1b4763, roughness:0.25, metalness:0.55, transparent:true, opacity:0.9 }));
  water.rotation.x = -Math.PI/2; water.position.y = SEA; scene.add(water);

  buildTiles();
  buildScatterMeshes();
}

/* ---------- terrain tiles ---------- */
function buildTiles() {
  var geoBase = new THREE.PlaneGeometry(TILE, TILE, SEG, SEG);
  for (var i=0;i<GRID;i++) for (var j=0;j<GRID;j++){
    var geo = geoBase.clone();
    geo.rotateX(-Math.PI/2);
    var m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:0.95, metalness:0.0, flatShading:false }));
    m.userData = { gx: null, gz: null };
    scene.add(m); tiles.push(m);
  }
}
function regenTile(m, gx, gz) {
  m.userData.gx = gx; m.userData.gz = gz;
  var ox = gx*TILE, oz = gz*TILE;
  m.position.set(ox, 0, oz);
  var pos = m.geometry.attributes.position;
  var n = pos.count;
  if (!m.geometry.attributes.color) m.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n*3),3));
  var col = m.geometry.attributes.color;
  for (var i=0;i<n;i++){
    var lx = pos.getX(i), lz = pos.getZ(i);
    var t = sampleTerrain(ox+lx, oz+lz);
    pos.setY(i, t.h);
    col.setXYZ(i, t.color.r, t.color.g, t.color.b);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
  m.geometry.computeVertexNormals();
  m.geometry.computeBoundingSphere();
}
function recenterTiles(cx, cz) {
  var gcx = Math.round(cx/TILE), gcz = Math.round(cz/TILE);
  if (gcx===centerGX && gcz===centerGZ) return false;
  centerGX = gcx; centerGZ = gcz;
  var k=0;
  for (var i=0;i<GRID;i++) for (var j=0;j<GRID;j++){
    var gx = gcx + (i-HALF), gz = gcz + (j-HALF);
    var m = tiles[k++];
    if (m.userData.gx!==gx || m.userData.gz!==gz) regenTile(m, gx, gz);
  }
  return true;
}

/* ---------- scatter (trees + buildings) ---------- */
function buildScatterMeshes() {
  var treeGeo = new THREE.ConeGeometry(7, 22, 6);
  treeGeo.translate(0, 11, 0);
  treeMesh = new THREE.InstancedMesh(treeGeo, new THREE.MeshStandardMaterial({color:0x33502a, roughness:0.9, flatShading:true}), 2200);
  treeMesh.count = 0; treeMesh.frustumCulled = false; scene.add(treeMesh);

  var bGeo = new THREE.BoxGeometry(1,1,1); bGeo.translate(0,0.5,0);
  bldgMesh = new THREE.InstancedMesh(bGeo, new THREE.MeshStandardMaterial({color:0xffffff, vertexColors:false, roughness:0.7, metalness:0.15, flatShading:true}), 1600);
  bldgMesh.count = 0; bldgMesh.frustumCulled = false;
  bldgMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1600*3), 3);
  scene.add(bldgMesh);
}
var _mtx = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), _s0 = new THREE.Vector3(), _p0 = new THREE.Vector3(), _col0 = new THREE.Color();
function rebuildScatter(cx, cz) {
  if (!treeMesh) return;
  var ti=0, bi=0;
  var R = HALF*TILE*0.92;
  var step = 70; // sample spacing
  var startX = Math.floor((cx-R)/step)*step, endX = cx+R;
  var startZ = Math.floor((cz-R)/step)*step, endZ = cz+R;
  for (var x=startX; x<=endX; x+=step) {
    for (var z=startZ; z<=endZ; z+=step) {
      var jx = x + (hash2(Math.floor(x),Math.floor(z))-0.5)*step*0.9;
      var jz = z + (hash2(Math.floor(z),Math.floor(x))-0.5)*step*0.9;
      var dd = (jx-cx)*(jx-cx)+(jz-cz)*(jz-cz);
      if (dd > R*R) continue;
      var t = sampleTerrain(jx, jz);
      var rr = hash2(Math.floor(jx*0.5), Math.floor(jz*0.5));
      if (t.biome==="forest" && ti<2200 && rr<0.72) {
        var sc = 0.7 + rr*1.4;
        _p0.set(jx, t.h, jz); _q0.identity(); _s0.set(sc,sc,sc);
        _mtx.compose(_p0,_q0,_s0); treeMesh.setMatrixAt(ti++, _mtx);
      } else if ((t.biome==="plains"||t.biome==="beach") && ti<2200 && rr>0.93) {
        var sc2=0.6+rr*0.7; _p0.set(jx,t.h,jz);_q0.identity();_s0.set(sc2,sc2,sc2);
        _mtx.compose(_p0,_q0,_s0); treeMesh.setMatrixAt(ti++, _mtx);
      } else if ((t.biome==="city"||t.biome==="town") && bi<1600) {
        var dens = t.biome==="city" ? 0.85 : 0.5;
        if (rr > dens) continue;
        var w = 8 + rr*18;
        var h = t.biome==="city" ? (14 + hash2(Math.floor(jx),Math.floor(jz*3))*120*(rr*rr)) : (6+rr*16);
        var d = 8 + hash2(Math.floor(jz),Math.floor(jx))*16;
        _p0.set(jx, t.h, jz); _q0.identity(); _s0.set(w,h,d);
        _mtx.compose(_p0,_q0,_s0); bldgMesh.setMatrixAt(bi, _mtx);
        var g = 0.55 + rr*0.4; _col0.setRGB(g*0.9, g*0.92, g*0.95);
        bldgMesh.setColorAt(bi, _col0); bi++;
      }
    }
  }
  treeMesh.count = ti; treeMesh.instanceMatrix.needsUpdate = true;
  bldgMesh.count = bi; bldgMesh.instanceMatrix.needsUpdate = true;
  if (bldgMesh.instanceColor) bldgMesh.instanceColor.needsUpdate = true;
}

/* ---------- terrain height query (for ground contact) ---------- */
function groundHeight(x, z) { return sampleTerrain(x, z).h; }
function biomeName(x, z) { return sampleTerrain(x, z).biome; }

/* ============================================================
   PHYSICS
   ============================================================ */
var _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _right = new THREE.Vector3();
var _vb = new THREE.Vector3(), _tmpQ = new THREE.Quaternion(), _invQ = new THREE.Quaternion();
var _liftDir = new THREE.Vector3(), _dragDir = new THREE.Vector3(), _force = new THREE.Vector3();

function rho(alt){ return 1.225 * Math.exp(-Math.max(alt,0)/9200); }

function stepPhysics(dt) {
  var d = acDef;
  // body axes
  _fwd.set(0,0,-1).applyQuaternion(st.quat);
  _up.set(0,1,0).applyQuaternion(st.quat);
  _right.set(1,0,0).applyQuaternion(st.quat);

  var V = st.vel.length();
  var alt = st.pos.y;
  var density = rho(alt);

  // velocity in body frame
  _invQ.copy(st.quat).invert();
  _vb.copy(st.vel).applyQuaternion(_invQ);
  var aoa = 0, beta = 0;
  if (V > 0.5) { aoa = Math.atan2(-_vb.y, -_vb.z); beta = Math.atan2(_vb.x, -_vb.z); }
  st.aoa = aoa;

  // lift coefficient with stall
  var aStall = 16*DEG;
  var CL = d.CL0 + d.CLa*aoa;
  var stalled = Math.abs(aoa) > aStall && !st.onGround;
  if (stalled) {
    var over = Math.abs(aoa) - aStall;
    CL = (d.CL0 + d.CLa*aStall*Math.sign(aoa)) * Math.max(0.25, 1 - over*3.2);
  }
  CL = clamp(CL, -d.CLmax, d.CLmax);
  if (st.flaps>0) CL += 0.35*st.flaps;

  var q = 0.5*density*V*V;
  var lift = q*d.S*CL;
  var CD = d.CD0 + d.k*CL*CL + st.gear*0.02 + st.flaps*0.03 + st.spoilers*0.06;
  var drag = q*d.S*CD;

  // thrust
  var maxT = d.thrust;
  if (d.ab && st.throttle>0.92) { maxT = d.abThrust; st.abActive=true; } else st.abActive=false;
  var engFactor = 1;
  if (FS.failures.engineOut>0) engFactor = 0;               // total loss
  else if (FS.failures.engine) engFactor = 0.0;
  var thrust = st.throttle*maxT*engFactor;
  if (d.prop) thrust *= clamp(1 - V/(d.vmax*1.15), 0.12, 1); // prop thrust falls with speed
  st.engineN = lerp(st.engineN, st.throttle*engFactor, dt*2.2);

  // force accumulation (world frame)
  _force.set(0,0,0);
  // thrust along fwd
  _force.addScaledVector(_fwd, thrust);
  // drag opposite velocity
  if (V>0.01){ _dragDir.copy(st.vel).multiplyScalar(-1/V); _force.addScaledVector(_dragDir, drag); }
  // lift perpendicular to velocity, in the plane of body-up
  if (V>0.5){
    _liftDir.copy(_up);
    // remove component along velocity to keep lift perpendicular
    var along = _liftDir.dot(st.vel)/(V*V);
    _liftDir.addScaledVector(st.vel, -along).normalize();
    _force.addScaledVector(_liftDir, lift);
    // side force from sideslip (weak)
    _force.addScaledVector(_right, -q*d.S*beta*0.6);
  }
  // gravity
  _force.y -= d.mass*G;

  // linear accel
  var ax = _force.x/d.mass, ay = _force.y/d.mass, az = _force.z/d.mass;
  // g-force (felt, along body up)
  st.g = clamp((lift/(d.mass*G)) + Math.cos(aoa), -3, 9);

  st.vel.x += ax*dt; st.vel.y += ay*dt; st.vel.z += az*dt;

  // ---------- rotational control ----------
  var hyd = FS.failures.hydraulics ? 0.35 : 1;
  var ail = input.roll, ele = input.pitch, rud = input.yaw;
  // desired body rates from input
  var pr = ele * d.pitchRate*DEG * hyd;
  var rr = ail * d.rollRate*DEG * hyd;
  var yr = rud * d.yawRate*DEG * hyd;

  // aerodynamic damping + stability
  var damp = d.damp * (0.4 + 0.6*clamp(V/d.cruise,0,1.4));
  st.omega.x += (pr - st.omega.x)*clamp(dt*4*d.agility,0,1);
  st.omega.z += (rr - st.omega.z)*clamp(dt*5*d.agility,0,1);
  st.omega.y += (yr - st.omega.y)*clamp(dt*3*d.agility,0,1);
  // natural damping toward zero when no input
  st.omega.multiplyScalar(1 - clamp(dt*damp*0.25,0,0.5));

  // pitch stability: weathervane toward velocity (reduce aoa)
  if (V>4 && !st.onGround) {
    var restore = -aoa * d.CLa * q * d.S * 0.00018 / d.agility;
    st.omega.x += restore*dt* (FS.aids.stability?1.5:1.0);
    // sideslip damping
    st.omega.y += -beta * 0.5 * dt;
  }

  // stall buffet
  if (stalled) {
    st.omega.x += (Math.random()-0.5)*1.4*dt;
    st.omega.z += (Math.random()-0.5)*1.4*dt;
  }

  // ---------- flying aids ----------
  applyAids(dt, V);
  // ---------- autopilot ----------
  if (FS.ap.on) applyAutopilot(dt, V, alt);

  // integrate orientation from body rates
  var wlen = st.omega.length();
  if (wlen > 1e-6) {
    var axis = _right.set(st.omega.x, st.omega.y, st.omega.z).applyQuaternion(st.quat).normalize();
    _tmpQ.setFromAxisAngle(axis, wlen*dt);
    st.quat.premultiply(_tmpQ).normalize();
  }

  // integrate position
  st.pos.x += st.vel.x*dt; st.pos.y += st.vel.y*dt; st.pos.z += st.vel.z*dt;

  // ---------- ground contact ----------
  var gh = groundHeight(st.pos.x, st.pos.z);
  var gearH = acDef.length*0.11 + (st.gear>0.5? acDef.length*0.05:0);
  var contactY = gh + gearH;
  var wasAir = !st.onGround;
  if (st.pos.y <= contactY) {
    var vy = st.vel.y;
    st.pos.y = contactY;
    var overWater = biomeName(st.pos.x, st.pos.z)==="ocean";
    if (overWater || vy < -(FS.aids.easyLand?9:5.5) || Math.abs(st.omega.z)>1.2 || (st.gear<0.5 && !FS.aids.easyLand)) {
      if (wasAir) doCrash(overWater?"ditched in the ocean":"heavy landing / gear up");
    }
    st.onGround = true;
    if (st.vel.y<0) st.vel.y = 0;
    // roll resistance + braking
    var horiz = Math.sqrt(st.vel.x*st.vel.x+st.vel.z*st.vel.z);
    var fr = (st.brakes>0? 1.4:0.12) + st.spoilers*0.3;
    var newH = Math.max(0, horiz - fr*dt*9);
    if (horiz>0.01){ st.vel.x *= newH/horiz; st.vel.z *= newH/horiz; }
    // level the aircraft gently on ground
    st.omega.multiplyScalar(0.6);
  } else {
    st.onGround = false;
  }

  // altitude floor safety
  if (st.pos.y < -1200) doCrash("terrain");

  // telemetry derived
  st.ias = V;
  st.vs = st.vel.y;
  _fwd.set(0,0,-1).applyQuaternion(st.quat);
  st.heading = (Math.atan2(_fwd.x, -_fwd.z)*RAD + 360) % 360;

  // NaN guard
  if (!isFinite(st.pos.x)||!isFinite(st.pos.y)||!isFinite(st.vel.x)) { resetFlight(); }
}

function applyAids(dt, V) {
  if (!FS.aids.stability && !FS.aids.autoTrim && !FS.aids.stallProtect) return;
  // auto-level roll when no aileron input (wings leveler)
  _fwd.set(0,0,-1).applyQuaternion(st.quat);
  _up.set(0,1,0).applyQuaternion(st.quat);
  _right.set(1,0,0).applyQuaternion(st.quat);
  if (FS.aids.stability && Math.abs(input.roll)<0.03 && !FS.ap.on && !st.onGround) {
    var bank = Math.atan2(_right.y, _up.y); // roll angle
    st.omega.z += clamp(-bank*1.4, -0.6,0.6)*dt*2.2;
  }
  if (FS.aids.autoTrim && Math.abs(input.pitch)<0.03 && !FS.ap.on && !st.onGround) {
    // hold pitch attitude gently level-ish
    var pitch = Math.asin(clamp(-_fwd.y,-1,1));
    var tgt = clamp(-st.vs*0.02, -6*DEG, 8*DEG);
    st.omega.x += clamp((tgt-pitch)*0.8,-0.4,0.4)*dt*2.0;
  }
  if (FS.aids.stallProtect && st.aoa>15*DEG && V>4) {
    st.omega.x += -0.8*dt; // push nose down
  }
}

function applyAutopilot(dt, V, alt) {
  _fwd.set(0,0,-1).applyQuaternion(st.quat);
  _up.set(0,1,0).applyQuaternion(st.quat);
  _right.set(1,0,0).applyQuaternion(st.quat);
  var pitch = Math.asin(clamp(-_fwd.y,-1,1));
  var bank = Math.atan2(_right.y, _up.y);
  if (FS.ap.alt) {
    var altErr = FS.ap.tgtAlt - alt;
    var tgtVs = clamp(altErr*0.5, -12, 12);
    var vsErr = tgtVs - st.vs;
    var tgtPitch = clamp(vsErr*0.6*DEG + pitch, -12*DEG, 15*DEG);
    st.omega.x += clamp((tgtPitch-pitch)*1.6,-0.5,0.5)*dt*2.4;
  }
  if (FS.ap.hdg) {
    var hdgErr = ((FS.ap.tgtHdg - st.heading + 540)%360)-180;
    var tgtBank = clamp(-hdgErr*0.6*DEG, -25*DEG, 25*DEG);
    st.omega.z += clamp((tgtBank-bank)*1.5,-0.6,0.6)*dt*2.4;
    // coordinate turn: yaw a touch
    st.omega.y += clamp(bank*0.4,-0.2,0.2)*dt;
  } else {
    // wings level under AP
    st.omega.z += clamp(-bank*1.6,-0.6,0.6)*dt*2.2;
  }
  if (FS.ap.spd) {
    var spdErr = FS.ap.tgtSpd - V;
    st.throttle = clamp(st.throttle + spdErr*0.02*dt, 0, 1);
  }
}

function doCrash(reason) {
  if (st.crashed) return;
  st.crashed = true; FS.running = false; FS.paused = false;
  FS._crashReason = reason || "terrain contact";
  clearInputState();
  sound.crash();
  emit();
}

/* ============================================================
   CAMERA
   ============================================================ */
var _camPos = new THREE.Vector3(), _camLook = new THREE.Vector3(), _off = new THREE.Vector3();
var orbitA = 0;
function updateCamera(dt) {
  _fwd.set(0,0,-1).applyQuaternion(st.quat);
  _up.set(0,1,0).applyQuaternion(st.quat);
  var mode = FS.cameraMode;
  if (mode===0) { // chase
    var back = acDef.length*2.4 + 8, upo = acDef.length*0.6 + 3;
    _off.set(0,0,1).applyQuaternion(st.quat).multiplyScalar(back);
    _camPos.copy(st.pos).add(_off).add(new THREE.Vector3(0,upo,0));
    cam.position.lerp(_camPos, clamp(dt*5,0,1));
    _camLook.copy(st.pos).addScaledVector(_fwd, acDef.length*1.5);
    cam.lookAt(_camLook);
  } else if (mode===1) { // cockpit
    var eye = new THREE.Vector3(0, acDef.length*0.06+0.5, -acDef.length*0.28).applyQuaternion(st.quat);
    cam.position.copy(st.pos).add(eye);
    _camLook.copy(cam.position).addScaledVector(_fwd, 40).addScaledVector(_up,-1);
    cam.up.copy(_up); cam.lookAt(_camLook);
  } else if (mode===2) { // hud (nose, wide)
    var eye2 = new THREE.Vector3(0, acDef.length*0.02, -acDef.length*0.4).applyQuaternion(st.quat);
    cam.position.copy(st.pos).add(eye2);
    _camLook.copy(cam.position).addScaledVector(_fwd, 60);
    cam.up.copy(_up); cam.lookAt(_camLook);
  } else if (mode===3) { // orbit
    orbitA += dt*0.3;
    var r = acDef.length*2.6+12;
    _camPos.set(Math.cos(orbitA)*r, acDef.length*0.7+4, Math.sin(orbitA)*r).add(st.pos);
    cam.position.copy(_camPos); cam.up.set(0,1,0); cam.lookAt(st.pos);
  } else { // fly-by (static ground point, camera passes)
    if (!updateCamera._fb || st.pos.distanceTo(updateCamera._fb) > acDef.length*30 || updateCamera._fbT>8) {
      updateCamera._fb = st.pos.clone().addScaledVector(_fwd, acDef.length*10).add(new THREE.Vector3((Math.random()-0.5)*60, -st.pos.y*0.3+20, (Math.random()-0.5)*60));
      updateCamera._fb.y = Math.max(groundHeight(updateCamera._fb.x, updateCamera._fb.z)+8, updateCamera._fb.y);
      updateCamera._fbT = 0;
    }
    updateCamera._fbT += dt;
    cam.position.copy(updateCamera._fb); cam.up.set(0,1,0); cam.lookAt(st.pos);
  }
}

/* ============================================================
   SOUND (Web Audio)
   ============================================================ */
var sound = (function(){
  var ctx=null, master=null;
  var eng={}, wind={}, warn={}, started=false;
  function init(){
    if (ctx) return;
    var AC = window.AudioContext||window.webkitAudioContext; if(!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value=0.0; master.connect(ctx.destination);
    // engine: two detuned oscillators + noise through lowpass
    eng.g = ctx.createGain(); eng.g.gain.value=0; eng.g.connect(master);
    eng.o1 = ctx.createOscillator(); eng.o1.type="sawtooth"; eng.o1.frequency.value=90;
    eng.o2 = ctx.createOscillator(); eng.o2.type="square"; eng.o2.frequency.value=91.5;
    eng.lp = ctx.createBiquadFilter(); eng.lp.type="lowpass"; eng.lp.frequency.value=800;
    eng.o1.connect(eng.lp); eng.o2.connect(eng.lp); eng.lp.connect(eng.g);
    // jet whine
    eng.wg = ctx.createGain(); eng.wg.gain.value=0; eng.wg.connect(master);
    var nb = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate);
    var dta = nb.getChannelData(0); for (var i=0;i<dta.length;i++) dta[i]=Math.random()*2-1;
    eng.noise = ctx.createBufferSource(); eng.noise.buffer=nb; eng.noise.loop=true;
    eng.bp = ctx.createBiquadFilter(); eng.bp.type="bandpass"; eng.bp.frequency.value=1600; eng.bp.Q.value=1.4;
    eng.noise.connect(eng.bp); eng.bp.connect(eng.wg);
    eng.o1.start(); eng.o2.start(); eng.noise.start();
    // wind
    wind.g = ctx.createGain(); wind.g.gain.value=0; wind.g.connect(master);
    var wb = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate);
    var wd = wb.getChannelData(0); for (var j=0;j<wd.length;j++) wd[j]=Math.random()*2-1;
    wind.src = ctx.createBufferSource(); wind.src.buffer=wb; wind.src.loop=true;
    wind.lp = ctx.createBiquadFilter(); wind.lp.type="lowpass"; wind.lp.frequency.value=700;
    wind.src.connect(wind.lp); wind.lp.connect(wind.g); wind.src.start();
  }
  function resume(){ if(ctx && ctx.state==="suspended") ctx.resume(); }
  function setVol(v){ if(master) master.gain.linearRampToValueAtTime(v, ctx.currentTime+0.4); }
  function stopContinuous(){
    if(!ctx) return;
    var t = ctx.currentTime;
    [eng.g, eng.wg, wind.g].forEach(function(g){
      if(!g) return;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0, t, 0.035);
    });
  }
  function update(){
    if(!ctx||!st||!acDef) return;
    var thr = st.engineN;
    var V = st.ias;
    if (acDef.prop){
      eng.g.gain.setTargetAtTime(0.16*thr+0.02, ctx.currentTime, 0.1);
      var f = acDef.engineHz*(0.7+thr*1.1);
      eng.o1.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
      eng.o2.frequency.setTargetAtTime(f*1.01, ctx.currentTime, 0.08);
      eng.lp.frequency.setTargetAtTime(500+thr*1400, ctx.currentTime, 0.1);
      eng.wg.gain.setTargetAtTime(0.02*thr, ctx.currentTime, 0.1);
    } else {
      eng.wg.gain.setTargetAtTime(0.10*thr+0.015, ctx.currentTime, 0.12);
      eng.bp.frequency.setTargetAtTime(900 + thr*2600 + (st.abActive?1200:0), ctx.currentTime, 0.1);
      eng.g.gain.setTargetAtTime(0.05*thr, ctx.currentTime, 0.12);
      var lf = acDef.engineHz*(0.6+thr*0.8);
      eng.o1.frequency.setTargetAtTime(lf, ctx.currentTime, 0.1);
      eng.o2.frequency.setTargetAtTime(lf*1.005, ctx.currentTime, 0.1);
      eng.lp.frequency.setTargetAtTime(300+thr*400, ctx.currentTime, 0.12);
    }
    var wv = clamp((V-30)/300,0,1);
    wind.g.gain.setTargetAtTime(wv*wv*0.32, ctx.currentTime, 0.15);
    wind.lp.frequency.setTargetAtTime(400+wv*2200, ctx.currentTime, 0.15);
  }
  function beep(freq, dur, vol, type){
    if(!ctx) return; var o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type||"square"; o.frequency.value=freq; g.gain.value=0;
    o.connect(g); g.connect(master);
    var t=ctx.currentTime; g.gain.linearRampToValueAtTime(vol||0.14,t+0.01); g.gain.linearRampToValueAtTime(0,t+dur);
    o.start(t); o.stop(t+dur+0.02);
  }
  var lastStall=0, lastGear=0;
  function stall(){ var t=Date.now(); if(t-lastStall>380){ beep(420,0.22,0.12,"sawtooth"); lastStall=t; } }
  function warnBeep(){ var t=Date.now(); if(t-lastGear>700){ beep(760,0.12,0.1,"square"); lastGear=t; } }
  function crash(){ if(!ctx) return; stopContinuous(); beep(80,0.6,0.3,"sawtooth"); beep(55,0.9,0.25,"sawtooth"); }
  function click(){ beep(1200,0.04,0.05,"square"); }
  return { init:init, resume:resume, update:update, setVol:setVol, stopContinuous:stopContinuous, stall:stall, warnBeep:warnBeep, crash:crash, click:click,
           get ctx(){return ctx;} };
})();

/* ============================================================
   INPUT
   ============================================================ */
function onKey(e, down){
  var k = e.key.toLowerCase();
  keys[k] = down;
  if (down) {
    if (k==="c"){ cycleCamera(); e.preventDefault(); }
    else if (k==="g"){ api.toggleGear(); }
    else if (k==="f"){ api.stepFlaps(1); }
    else if (k==="v"){ api.stepFlaps(-1); }
    else if (k==="b"){ st.brakes = st.brakes>0?0:1; emit(); }
    else if (k==="p"){ api.pause(); }
    else if (k==="a" && !e.repeat){}
  }
  if (["arrowup","arrowdown","arrowleft","arrowright"," "].indexOf(k)>=0) e.preventDefault();
}
function readInput(dt){
  var p=0,r=0,y=0,tr=0;
  if (keys["arrowdown"]||keys["s"]) p += 1;   // pull back -> nose up
  if (keys["arrowup"]||keys["w"]) p -= 1;     // push -> nose down
  if (FS.invertPitch) p = -p;
  if (keys["arrowleft"]||keys["a"]) r += 1;   // roll left
  if (keys["arrowright"]||keys["d"]) r -= 1;
  if (keys["q"]) y += 1;
  if (keys["e"]) y -= 1;
  if (keys["shift"]) tr += 1;
  if (keys["control"]) tr -= 1;
  if (keys["="]||keys["+"]) tr += 1;
  if (keys["-"]||keys["_"]) tr -= 1;

  // direct yokes override keyboard pitch/roll; touch takes precedence over mouse while held
  var useVirtualYoke = virtualInput.yokeActive || Math.abs(virtualInput.pitch)>0.03 || Math.abs(virtualInput.roll)>0.03;
  if (useVirtualYoke) {
    input.pitch = lerp(input.pitch, clamp(FS.invertPitch ? -virtualInput.pitch : virtualInput.pitch, -1, 1), clamp(dt*12,0,1));
    input.roll  = lerp(input.roll, clamp(virtualInput.roll, -1, 1), clamp(dt*14,0,1));
  } else if (mouseYoke) {
    input.pitch = clamp(my, -1, 1);
    input.roll  = clamp(-mx, -1, 1);
  } else {
    input.pitch = lerp(input.pitch, p, clamp(dt*6,0,1));
    input.roll  = lerp(input.roll, r, clamp(dt*8,0,1));
  }
  var yawTarget = clamp(y + virtualInput.yaw, -1, 1);
  var thrTarget = clamp(tr + virtualInput.thrRate, -1, 1);
  input.yaw = lerp(input.yaw, yawTarget, clamp(dt*6,0,1));
  if (thrTarget!==0 && !(FS.ap.on&&FS.ap.spd)) {
    st.throttle = clamp(st.throttle + thrTarget*dt*0.4, 0, 1);
  }
}

/* ============================================================
   HUD (2D amber-phosphor)
   ============================================================ */
var AMBER = "#ffbf6b", AMBER_DIM="rgba(255,191,107,0.5)", GREENP="#8fe39a", REDP="#ff6a5a";
var HUD_PRESETS = { amber:["#ffbf6b","rgba(255,191,107,0.5)"], green:["#8fe39a","rgba(143,227,154,0.5)"], ice:["#8fd0ff","rgba(140,208,255,0.5)"] };
function drawHUD() {
  var w = hudCanvas.width, h = hudCanvas.height, ctx = hudCtx;
  ctx.clearRect(0,0,w,h);
  if (!st || !FS.running) return;
  var cx = w/2, cy = h/2;
  var dpr = hudCanvas._dpr||1;
  ctx.save();
  ctx.lineWidth = 1.4*dpr;
  ctx.font = (13*dpr)+"px 'JetBrains Mono', monospace";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 3*dpr;
  var amber = AMBER;
  var stalled = st.aoa>16*DEG && !st.onGround;

  // ---- attitude: pitch ladder + roll ----
  _fwd.set(0,0,-1).applyQuaternion(st.quat);
  _up.set(0,1,0).applyQuaternion(st.quat);
  _right.set(1,0,0).applyQuaternion(st.quat);
  var pitch = Math.asin(clamp(-_fwd.y,-1,1));
  var roll = Math.atan2(_right.y, _up.y);
  var pxPerDeg = h/60;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(roll);
  ctx.strokeStyle = amber; ctx.fillStyle = amber;
  for (var a=-30;a<=30;a+=5){
    if (a===0) continue;
    var yy = (a*DEG - pitch)*RAD*pxPerDeg;
    if (Math.abs(yy) > h*0.42) continue;
    var half = a>0? 70*dpr : 54*dpr;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    if (a<0){ ctx.setLineDash([7*dpr,6*dpr]); } else ctx.setLineDash([]);
    ctx.moveTo(-half, -yy); ctx.lineTo(-half+20*dpr, -yy);
    ctx.moveTo(half, -yy); ctx.lineTo(half-20*dpr, -yy);
    ctx.moveTo(-half+20*dpr,-yy); ctx.lineTo(-half+20*dpr, -yy + (a>0?8*dpr:-8*dpr));
    ctx.moveTo(half-20*dpr,-yy); ctx.lineTo(half-20*dpr, -yy + (a>0?8*dpr:-8*dpr));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font=(10*dpr)+"px 'JetBrains Mono',monospace";
    ctx.fillText((a>0?"+":"")+a, half+6*dpr, -yy);
    ctx.textAlign="right"; ctx.fillText((a>0?"+":"")+a, -half-6*dpr, -yy); ctx.textAlign="left";
  }
  // horizon line
  var hy = (-pitch)*RAD*pxPerDeg;
  ctx.globalAlpha=1; ctx.lineWidth=1.8*dpr;
  ctx.beginPath(); ctx.moveTo(-w*0.4, -hy); ctx.lineTo(-30*dpr,-hy);
  ctx.moveTo(30*dpr,-hy); ctx.lineTo(w*0.4,-hy); ctx.stroke();
  ctx.restore();

  // roll arc + pointer
  ctx.strokeStyle=amber; ctx.fillStyle=amber; ctx.globalAlpha=0.9; ctx.lineWidth=1.4*dpr;
  var arcR = h*0.34;
  ctx.beginPath(); ctx.arc(cx,cy, arcR, -Math.PI*0.5-0.9, -Math.PI*0.5+0.9); ctx.stroke();
  [-60,-45,-30,-20,-10,0,10,20,30,45,60].forEach(function(b){
    var ang=-Math.PI/2 + b*DEG; var r1=arcR, r2=arcR- (b%30===0?11*dpr:6*dpr);
    ctx.beginPath(); ctx.moveTo(cx+Math.cos(ang)*r1, cy+Math.sin(ang)*r1); ctx.lineTo(cx+Math.cos(ang)*r2, cy+Math.sin(ang)*r2); ctx.stroke();
  });
  // roll pointer (triangle) rotates with roll
  var pang = -Math.PI/2 - roll;
  ctx.beginPath();
  ctx.moveTo(cx+Math.cos(pang)*(arcR-2*dpr), cy+Math.sin(pang)*(arcR-2*dpr));
  var pl=pang+0.02, pr2=pang-0.02;
  ctx.lineTo(cx+Math.cos(pl)*(arcR-13*dpr), cy+Math.sin(pl)*(arcR-13*dpr));
  ctx.lineTo(cx+Math.cos(pr2)*(arcR-13*dpr), cy+Math.sin(pr2)*(arcR-13*dpr));
  ctx.closePath(); ctx.fill();

  // waterline / boresight
  ctx.globalAlpha=1; ctx.lineWidth=2*dpr; ctx.strokeStyle=amber;
  ctx.beginPath();
  ctx.moveTo(cx-46*dpr, cy); ctx.lineTo(cx-16*dpr, cy); ctx.lineTo(cx-8*dpr, cy+8*dpr);
  ctx.moveTo(cx+46*dpr, cy); ctx.lineTo(cx+16*dpr, cy); ctx.lineTo(cx+8*dpr, cy+8*dpr);
  ctx.moveTo(cx,cy-6*dpr); ctx.lineTo(cx,cy-1*dpr);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,3*dpr,0,Math.PI*2); ctx.stroke();

  // ---- tapes ----
  ctx.font=(13*dpr)+"px 'JetBrains Mono',monospace";
  // airspeed (left)
  drawTape(ctx, cx- (arcR+64*dpr), cy, dpr, st.ias*1.9438, "KIAS", true); // m/s -> knots
  // altitude (right)
  drawTape(ctx, cx+ (arcR+64*dpr), cy, dpr, st.pos.y*3.2808, "ALT ft", false);

  // heading tape (top)
  drawHeadingTape(ctx, cx, 26*dpr, w, dpr);

  // VSI (far right)
  var vsX = cx+(arcR+118*dpr);
  ctx.strokeStyle=AMBER_DIM; ctx.fillStyle=amber; ctx.globalAlpha=0.9;
  ctx.strokeRect(vsX, cy-70*dpr, 8*dpr, 140*dpr);
  var vsN = clamp(st.vs*3.2808*60/2000, -1, 1); // fpm/2000
  ctx.fillRect(vsX, cy - vsN*70*dpr, 8*dpr, -vsN*70*dpr);
  ctx.textAlign="left"; ctx.font=(9*dpr)+"px 'JetBrains Mono',monospace";
  ctx.fillText(Math.round(st.vs*3.2808*60)+" fpm", vsX-2*dpr, cy+82*dpr);

  // ---- bottom-left block: throttle, g, aoa, mach ----
  var bx=18*dpr, by=h-96*dpr;
  ctx.textAlign="left"; ctx.font=(12*dpr)+"px 'JetBrains Mono',monospace"; ctx.fillStyle=amber; ctx.globalAlpha=1;
  var thrPct = Math.round(st.throttle*100);
  ctx.fillText("THR "+thrPct+"%"+(st.abActive?"  AB":""), bx, by);
  // throttle bar
  ctx.strokeStyle=AMBER_DIM; ctx.strokeRect(bx, by+8*dpr, 120*dpr, 8*dpr);
  ctx.fillStyle= st.abActive?REDP:amber; ctx.fillRect(bx, by+8*dpr, 120*dpr*st.throttle, 8*dpr);
  ctx.fillStyle=amber;
  ctx.fillText("G "+st.g.toFixed(1), bx, by+30*dpr);
  ctx.fillText("AOA "+(st.aoa*RAD).toFixed(1)+"\u00b0", bx+70*dpr, by+30*dpr);
  var mach = st.ias/300; // approx
  ctx.fillText("M "+mach.toFixed(2), bx, by+48*dpr);
  ctx.fillText("GS "+Math.round(st.ias*1.9438)+"kt", bx+70*dpr, by+48*dpr);

  // ---- bottom-right block: gear/flaps/config ----
  var rx=w-18*dpr, ry=h-96*dpr;
  ctx.textAlign="right";
  ctx.fillStyle = st.gear>0.5?GREENP:AMBER_DIM;
  ctx.fillText(st.gear>0.5?"GEAR DN":"GEAR UP", rx, ry);
  ctx.fillStyle=amber; ctx.fillText("FLAPS "+Math.round(st.flaps*100)+"%", rx, ry+18*dpr);
  ctx.fillStyle= st.brakes>0?REDP:AMBER_DIM; ctx.fillText(st.brakes>0?"BRK":"", rx, ry+36*dpr);
  ctx.fillStyle=amber; ctx.fillText("RAD "+Math.max(0,Math.round((st.pos.y-groundHeight(st.pos.x,st.pos.z))*3.2808))+"ft", rx, ry+54*dpr);

  // ---- autopilot annunciation (top center under heading) ----
  if (FS.ap.on) {
    ctx.textAlign="center"; ctx.fillStyle=GREENP; ctx.font=(12*dpr)+"px 'JetBrains Mono',monospace";
    var ann=[]; if(FS.ap.hdg)ann.push("HDG "+Math.round(FS.ap.tgtHdg)); if(FS.ap.alt)ann.push("ALT "+Math.round(FS.ap.tgtAlt*3.2808)); if(FS.ap.spd)ann.push("SPD "+Math.round(FS.ap.tgtSpd*1.9438));
    ctx.fillText("AP  "+(ann.join("  ")||"CWS"), cx, 52*dpr);
  }

  // ---- warnings (center bottom) ----
  var warns=[];
  if (stalled) warns.push("STALL");
  if (FS.failures.engine||FS.failures.engineOut>0) warns.push("ENGINE FAIL");
  if (FS.failures.hydraulics) warns.push("HYD LOW");
  if (FS.failures.gearStuck) warns.push("GEAR FAULT");
  if (FS.failures.instruments) warns.push("INST FAIL");
  if (st.ias > acDef.vmax) warns.push("OVERSPEED");
  if (st.pos.y-groundHeight(st.pos.x,st.pos.z) < 150 && st.vs<-4 && st.gear<0.5 && !st.onGround) warns.push("TERRAIN");
  if (warns.length){
    ctx.textAlign="center"; ctx.font="bold "+(15*dpr)+"px 'JetBrains Mono',monospace";
    var blink = (Math.floor(Date.now()/350)%2)===0;
    ctx.fillStyle = blink?REDP:"rgba(255,106,90,0.35)";
    ctx.fillText(warns.join("   "), cx, cy+arcR+8*dpr);
    if (stalled) sound.stall();
    if (warns.indexOf("TERRAIN")>=0||warns.indexOf("OVERSPEED")>=0) sound.warnBeep();
  }

  // instrument failure static overlay
  if (FS.failures.instruments){
    ctx.globalAlpha=1; ctx.fillStyle="rgba(255,191,107,0.04)";
    for(var i2=0;i2<40;i2++){ ctx.fillRect(Math.random()*w, Math.random()*h, Math.random()*60*dpr, 1.5*dpr); }
  }
  ctx.restore();
}
function drawTape(ctx, x, cy, dpr, value, label, left){
  var h = hudCanvas.height;
  ctx.save();
  ctx.strokeStyle=AMBER_DIM; ctx.fillStyle=AMBER; ctx.globalAlpha=0.95;
  var boxW=58*dpr, boxH=200*dpr;
  var bx = left? x-boxW : x;
  // tick ladder
  var span=40, step= (label.indexOf("ALT")>=0)?100:10;
  var per = boxH/span;
  ctx.beginPath(); ctx.moveTo(left?x:x, cy-boxH/2); ctx.lineTo(left?x:x, cy+boxH/2); ctx.stroke();
  ctx.font=(11*dpr)+"px 'JetBrains Mono',monospace";
  var base = Math.round(value/step)*step;
  for (var v=base-span/2*step; v<=base+span/2*step; v+=step){
    var yy = cy + (value - v)*per*(step/ (label.indexOf("ALT")>=0?100:10) );
    if (Math.abs(yy-cy)>boxH/2) continue;
    var major = (v % (step*5)===0);
    ctx.beginPath();
    if (left){ ctx.moveTo(x, yy); ctx.lineTo(x-(major?12*dpr:6*dpr), yy);} else { ctx.moveTo(x, yy); ctx.lineTo(x+(major?12*dpr:6*dpr), yy); }
    ctx.stroke();
    if (major){ ctx.textAlign= left?"right":"left"; ctx.fillText(String(Math.round(v)), left? x-16*dpr : x+16*dpr, yy); }
  }
  // current value box
  ctx.fillStyle="rgba(20,16,8,0.55)";
  var vw=54*dpr, vh=22*dpr;
  var vbx = left? x-vw-2*dpr : x+2*dpr;
  ctx.fillRect(vbx, cy-vh/2, vw, vh);
  ctx.strokeStyle=AMBER; ctx.strokeRect(vbx, cy-vh/2, vw, vh);
  ctx.fillStyle=AMBER; ctx.textAlign="center"; ctx.font="bold "+(14*dpr)+"px 'JetBrains Mono',monospace";
  ctx.fillText(String(Math.round(value)), vbx+vw/2, cy);
  // label
  ctx.font=(10*dpr)+"px 'JetBrains Mono',monospace"; ctx.globalAlpha=0.8;
  ctx.fillText(label, vbx+vw/2, cy-boxH/2-10*dpr);
  ctx.restore();
}
function drawHeadingTape(ctx, cx, y, w, dpr){
  ctx.save();
  ctx.strokeStyle=AMBER_DIM; ctx.fillStyle=AMBER; ctx.globalAlpha=0.95;
  ctx.font=(11*dpr)+"px 'JetBrains Mono',monospace"; ctx.textAlign="center";
  var per = 4*dpr; // px per degree
  var span=70;
  for (var d=-span; d<=span; d+=5){
    var hd = (Math.round(st.heading/5)*5 + d);
    var xx = cx + (d - (st.heading - Math.round(st.heading/5)*5))*per;
    if (Math.abs(xx-cx)>w*0.32) continue;
    var hh=((hd%360)+360)%360;
    var major = hh%10===0;
    ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y+(major?9*dpr:5*dpr)); ctx.stroke();
    if (hh%30===0){ var lab = hh===0?"N":hh===90?"E":hh===180?"S":hh===270?"W":String(hh/10); ctx.fillText(lab, xx, y-8*dpr); }
  }
  // center pointer + readout
  ctx.fillStyle="rgba(20,16,8,0.55)"; ctx.fillRect(cx-22*dpr, y-2*dpr, 44*dpr, 20*dpr);
  ctx.strokeStyle=AMBER; ctx.strokeRect(cx-22*dpr, y-2*dpr, 44*dpr, 20*dpr);
  ctx.fillStyle=AMBER; ctx.font="bold "+(13*dpr)+"px 'JetBrains Mono',monospace";
  ctx.fillText(String(Math.round(st.heading)).padStart(3,"0"), cx, y+8*dpr);
  ctx.beginPath(); ctx.moveTo(cx, y+18*dpr); ctx.lineTo(cx-5*dpr,y+24*dpr); ctx.lineTo(cx+5*dpr,y+24*dpr); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* ============================================================
   LOOP
   ============================================================ */
function frame(t) {
  _raf = requestAnimationFrame(frame);
  _lastRaf = (typeof performance!=='undefined'?performance.now():Date.now());
  try {
  var now = t/1000; if (!_last) _last = now;
  var dt = Math.min(now-_last, 0.05); _last = now;
  if (!FS.paused && FS.running && st && !st.crashed) {
    readInput(dt);
    _acc += dt;
    var STEP = 1/120, guard=0;
    while (_acc >= STEP && guard<8) { stepPhysics(STEP); _acc -= STEP; guard++; }
    // random failure roll
    if (FS.failures.randomOn) maybeRandomFailure(dt);
    sound.update();
  }
  if (st && acMesh) {
    acMesh.position.copy(st.pos);
    acMesh.quaternion.copy(st.quat);
    acMesh.visible = (FS.cameraMode!==1 && FS.cameraMode!==2);
    if (acMesh.userData.propDisc) acMesh.userData.propDisc.rotation.z += (0.3+st.engineN*2.5);
    if (acMesh.userData.burner) { var bs = st.abActive?1.6:(st.engineN>0.5?0.7:0.2); acMesh.userData.burner.scale.set(bs,bs,0.6+st.engineN); acMesh.userData.burner.material.color.setHex(st.abActive?0xff7722:0x662211); }
    updateCamera(dt);
    // move world followers
    water.position.set(st.pos.x, SEA, st.pos.z);
    skyMesh.position.copy(cam.position);
    stars.position.copy(cam.position);
    sunSprite.position.copy(cam.position).add(sun.position.clone().normalize().multiplyScalar(40000));
    // terrain streaming
    if (recenterTiles(st.pos.x, st.pos.z)) rebuildScatter(centerGX*TILE, centerGZ*TILE);
  }
  if (renderer) renderer.render(scene, cam);
  drawHUD();
  } catch(err){ if(!frame._warned){ console.error("FlightSim frame error:", err); frame._warned=true; } }
}

var _emitAcc=0;
function emit(){ if (FS.cb.onState) FS.cb.onState(snapshot()); }
function snapshot(){
  return {
    ready: FS.ready, running: FS.running, paused: FS.paused, crashed: st? st.crashed:false,
    crashReason: FS._crashReason||"",
    aircraftKey: FS.aircraftKey, aircraft: acDef? {name:acDef.name, cat:acDef.cat, icon:acDef.icon, desc:acDef.desc}:null,
    cameraMode: FS.cameraMode, cameraName: FS.cameraModes[FS.cameraMode],
    timeOfDay: FS.timeOfDay,
    aids: Object.assign({}, FS.aids),
    ap: Object.assign({}, FS.ap),
    failures: Object.assign({}, FS.failures),
    telem: st? { ias: st.ias, kias: st.ias*1.9438, alt: st.pos.y, altft: st.pos.y*3.2808, vs: st.vs, hdg: st.heading, thr: st.throttle, gear: st.gear, flaps: st.flaps, onGround: st.onGround, g: st.g, biome: biomeName(st.pos.x, st.pos.z) } : null
  };
}

/* random failures */
function maybeRandomFailure(dt){
  FS.failures._rt = (FS.failures._rt||0) + dt;
  if (FS.failures._rt < 25) return;
  if (Math.random() < dt*0.01) {
    var pool=["engine","hydraulics","gearStuck","instruments"].filter(function(k){return !FS.failures[k];});
    if (pool.length){ var pick=pool[Math.floor(Math.random()*pool.length)]; api.triggerFailure(pick,true); FS.failures._rt=0; }
  }
}

/* ============================================================
   PUBLIC API
   ============================================================ */
function cycleCamera(){ FS.cameraMode = (FS.cameraMode+1)%FS.cameraModes.length; sound.click(); emit(); }
function resetFlight(){
  st = freshState(acDef);
  st.crashed=false; FS.running=true; _acc=0;
  emit();
}
function applyTime(){
  var day = FS.timeOfDay==="day";
  skyMesh.material.map = makeSkyTexture(day); skyMesh.material.needsUpdate=true;
  var horiz = day? 0xbcd6e6 : 0x18203a;
  scene.fog.color.setHex(horiz);
  renderer.setClearColor(horiz,1);
  hemi.intensity = day? 0.9 : 0.28; hemi.color.setHex(day?0xbcd6e6:0x25304f);
  sun.intensity = day? 1.5 : 0.18; sun.color.setHex(day?0xfff2d8:0x8090c0);
  sun.position.set(day?-0.5:0.4, day?1:0.4, 0.3).multiplyScalar(1000);
  stars.material.opacity = day?0:0.9;
  sunSprite.visible = day;
  water.material.color.setHex(day?0x1b4763:0x0c1c2b);
}

var api = {
  boot: function(container, hudCv, callbacks){
   if (FS.ready) { return; }
   try {
    worldEl = container; hudCanvas = hudCv; hudCtx = hudCanvas.getContext("2d");
    FS.cb = callbacks||{};
    initThree();
    window.addEventListener("resize", api.resize);
    // container may be laid out AFTER boot (0x0 at first) — re-size when it gains size
    if (window.ResizeObserver) {
      try { new ResizeObserver(function(){ api.resize(); }).observe(worldEl); } catch(e){}
    }
    // also poll briefly in case ResizeObserver is unavailable
    var _rt = 0, _rp = setInterval(function(){ api.resize(); if (worldEl.clientWidth>0 && worldEl.clientHeight>0 || ++_rt>40) clearInterval(_rp); }, 80);
    window.addEventListener("keydown", function(e){ if(FS.running) onKey(e,true); });
    window.addEventListener("keyup", function(e){ if(FS.running) onKey(e,false); });
    worldEl.addEventListener("mousemove", function(e){
      if (!mouseYoke) return;
      var r = worldEl.getBoundingClientRect();
      mx = clamp((e.clientX-r.left)/r.width*2-1,-1,1);
      my = clamp((e.clientY-r.top)/r.height*2-1,-1,1);
    });
    api.resize();
    // find a scenic land spawn, then pre-generate terrain around it
    findGoodSpawn();
    recenterTiles(spawnBase.x, spawnBase.z); rebuildScatter(centerGX*TILE, centerGZ*TILE);
    applyTime();
    FS.ready = true;
    if (FS.cb.onReady) FS.cb.onReady(snapshot());
    _raf = requestAnimationFrame(frame);
    // safety net: if rAF is throttled (background tab / capture), keep progressing
    if (!FS._safety) FS._safety = setInterval(function(){
      var nowp = (typeof performance!=='undefined'?performance.now():Date.now());
      if (nowp - _lastRaf > 180) frame(nowp);
    }, 90);
   } catch(err){ console.error("FlightSim boot error:", err); }
  },
  resize: function(){
    if (!renderer) return;
    var w = worldEl.clientWidth, h = worldEl.clientHeight;
    if (!w || !h) return;   // container not laid out yet — wait for a real size
    renderer.setSize(w,h); cam.aspect=w/h; cam.updateProjectionMatrix();
    var dpr = Math.min(window.devicePixelRatio||1, 2);
    hudCanvas.width = w*dpr; hudCanvas.height = h*dpr; hudCanvas._dpr = dpr;
    hudCanvas.style.width=w+"px"; hudCanvas.style.height=h+"px";
  },
  selectAircraft: function(key){
    if (!AIRCRAFT[key]) return;
    FS.aircraftKey = key; acDef = AIRCRAFT[key];
    if (acMesh) { scene.remove(acMesh); }
    acMesh = buildAircraft(acDef); scene.add(acMesh);
    st = freshState(acDef);
    emit();
  },
  start: function(){
    if (!acDef) api.selectAircraft(FS.aircraftKey);
    clearInputState();
    sound.init(); sound.resume(); sound.setVol(0.9);
    st = freshState(acDef); st.crashed=false;
    FS.running = true; FS.paused=false; _acc=0; _last=0;
    // spawn moving forward, trimmed
    emit();
  },
  stop: function(){ FS.running=false; FS.paused=false; clearInputState(); sound.stopContinuous(); sound.setVol(0.0); emit(); },
  pause: function(){ FS.paused = !FS.paused; if(FS.paused){ clearInputState(); sound.setVol(0.0); } else sound.setVol(0.9); emit(); },
  restart: function(){ FS._crashReason=""; clearInputState(); st=freshState(acDef); st.crashed=false; FS.running=true; FS.paused=false; _acc=0; sound.setVol(0.9); emit(); },
  setCamera: function(i){ FS.cameraMode = i%FS.cameraModes.length; emit(); },
  cycleCamera: cycleCamera,
  forceFrame: function(){ frame((typeof performance!=='undefined'?performance.now():Date.now())); },
  setThrottle: function(v){ if(st) st.throttle=clamp(v,0,1); },
  toggleGear: function(){ if(!st) return; if(FS.failures.gearStuck){ sound.warnBeep(); return;} st.gear = st.gear>0.5?0:1; sound.click(); emit(); },
  stepFlaps: function(dir){ if(!st) return; st.flaps = clamp(Math.round((st.flaps+dir*0.25)*4)/4,0,1); sound.click(); emit(); },
  toggleSpoilers: function(){ if(!st) return; st.spoilers = st.spoilers>0?0:1; emit(); },
  toggleBrakes: function(){ if(!st) return; st.brakes = st.brakes>0?0:1; emit(); },
  toggleAid: function(k){ FS.aids[k] = !FS.aids[k]; sound.click(); emit(); },
  setAllAids: function(on){ for(var k in FS.aids) FS.aids[k]=on; emit(); },
  toggleAP: function(){ FS.ap.on=!FS.ap.on; if(FS.ap.on && st){ if(!FS.ap.hdg&&!FS.ap.alt&&!FS.ap.spd){FS.ap.hdg=FS.ap.alt=FS.ap.spd=true;} FS.ap.tgtHdg=Math.round(st.heading); FS.ap.tgtAlt=st.pos.y; FS.ap.tgtSpd=st.ias; } sound.click(); emit(); },
  setAPMode: function(k,v){ FS.ap[k]= v!=null?v:!FS.ap[k]; emit(); },
  setAPTarget: function(k,v){ FS.ap[k]=v; emit(); },
  nudgeAP: function(k,d){ FS.ap[k]= (FS.ap[k]||0)+d; if(k==="tgtHdg") FS.ap.tgtHdg=((FS.ap.tgtHdg%360)+360)%360; emit(); },
  triggerFailure: function(k, on){
    if (k==="engine"){ FS.failures.engine=on; if(on) FS.failures.engineOut=1; else FS.failures.engineOut=0; }
    else FS.failures[k]=on;
    if (on) sound.warnBeep();
    emit();
  },
  clearFailures: function(){ FS.failures={engine:false,engineOut:0,hydraulics:false,gearStuck:false,instruments:false,flaps:false,randomOn:FS.failures.randomOn}; emit(); },
  setRandomFailures: function(on){ FS.failures.randomOn=on; FS.failures._rt=0; emit(); },
  setTime: function(t){ FS.timeOfDay=t; if(renderer) applyTime(); emit(); },
  setMouseYoke: function(on){ mouseYoke=on; },
  setVirtualControls: setVirtualControls,
  setInvertPitch: function(on){ FS.invertPitch=!!on; },
  setHudColor: function(name){ var p=HUD_PRESETS[name]||HUD_PRESETS.amber; AMBER=p[0]; AMBER_DIM=p[1]; },
  teleportAlt: function(mult){ if(!st) return; st.pos.y = acDef.cruiseAlt*(mult||1); st.vel.set(0,0,-acDef.cruise); st.quat.identity(); emit(); },
  scenery: function(kind){
    // jump to a region matching a biome by scanning outward
    if (!st) return;
    var best=null, bestd=1e18;
    for (var i=0;i<900;i++){
      var ang=Math.random()*Math.PI*2, r=2000+Math.random()*60000;
      var x=Math.cos(ang)*r, z=Math.sin(ang)*r;
      var b=sampleTerrain(x,z);
      var match = (kind==="mountains"&&b.biome==="mountains")||(kind==="ocean"&&b.biome==="ocean")||
                  (kind==="city"&&b.biome==="city")||(kind==="desert"&&b.biome==="desert")||
                  (kind==="forest"&&b.biome==="forest")||(kind==="town"&&b.biome==="town");
      if (match){ best={x:x,z:z,h:b.h}; break; }
    }
    if (best){
      st.pos.set(best.x, Math.max(best.h+ acDef.cruiseAlt*0.6, best.h+400), best.z);
      st.vel.set(0,0,-acDef.cruise); st.quat.identity();
      centerGX=1e9; recenterTiles(st.pos.x, st.pos.z); rebuildScatter(centerGX*TILE, centerGZ*TILE);
      emit();
    }
  },
  getState: snapshot,
  aircraftList: function(){ return AIRCRAFT_ORDER.map(function(k){ var d=AIRCRAFT[k]; return {key:k, name:d.name, cat:d.cat, icon:d.icon, desc:d.desc, stall:Math.round(d.stall*1.9438), cruise:Math.round(d.cruise*1.9438), vmax:Math.round(d.vmax*1.9438), mass:d.mass, agility:d.agility}; }); },
};

window.FlightSim = api;
})();
