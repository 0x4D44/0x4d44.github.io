// Launch platform ("sky pier") under the start grid: deck with painted slots and finish line, truss + pylons, light gantry with the
// countdown lamps (red x3, then green). Aligned to the start frame; the deck height is Course.deckY (also returned by groundHeight).
// Each course dresses its own start (V-34: wood pier / sandstone / glass / ice) and the gantry dithers away as the camera closes in (V-14). Owner: world agent.
import * as THREE from 'three';

// ---- per-course look (V-34). Colours are hex numbers except the canvas paints (css strings). `deck` picks the procedural deck texture ('metal' = the shared asset).
const THEMES = {
  sunrise: { name: 'wood pier', deck: 'wood', deckColor: 0xffffff, deckRough: 0.9, deckMetal: 0, hull: 0x47321f, hullRough: 0.94, hullMetal: 0, leg: 0xf0e8d6, legRough: 0.8, legMetal: 0, accent: 0xd9553a, accentGlow: 0,
    stripe: '#fff0cf', chev: 'rgba(255,205,110,0.95)', glow: [5, 3.0, 0.7] },
  redrock: { name: 'sandstone', deck: 'stone', deckColor: 0xffffff, deckRough: 0.96, deckMetal: 0, hull: 0x7c4a30, hullRough: 0.95, hullMetal: 0, leg: 0xc07a50, legRough: 0.92, legMetal: 0, accent: 0x1fb9a6, accentGlow: 0,
    stripe: '#27c4b0', chev: 'rgba(250,228,186,0.95)', glow: [5, 2.6, 0.5] },
  neon: { name: 'glass', deck: 'glass', deckColor: 0xffffff, deckRough: 0.1, deckMetal: 0.7, deckGlow: 0.85, hull: 0x090b16, hullRough: 0.18, hullMetal: 0.9, leg: 0x131a2e, legRough: 0.2, legMetal: 0.85, accent: 0x35e8ff, accentGlow: 2.2,
    stripe: '#2ee6ff', chev: 'rgba(255,70,200,0.95)', glow: [0.5, 3.0, 5], decalGlow: 1.0 },
  frost: { name: 'ice', deck: 'ice', deckColor: 0xffffff, deckRough: 0.5, deckMetal: 0.05, deckIbl: 0.3, hull: 0x4f86b8, hullRough: 0.3, hullMetal: 0.1, leg: 0xa7d6f5, legRough: 0.22, legMetal: 0.08, accent: 0x66f0ff, accentGlow: 1.4,
    stripe: '#1d78b8', chev: 'rgba(24,110,176,0.92)', glow: [1.2, 3.6, 5], decalGlow: 0.35 },
  default: { name: 'steel', deck: 'metal', deckColor: 0xb8c0c8, deckRough: 0.62, deckMetal: 0.45, hull: 0x3a424c, hullRough: 0.55, hullMetal: 0.65, leg: 0x3a424c, legRough: 0.55, legMetal: 0.65, accent: 0xff6a1a, accentGlow: 0,
    stripe: '#f2b61c', chev: 'rgba(255,200,40,0.9)', glow: [5, 3.2, 0.6] },
};

/** Tileable 10 m deck texture, painted with a canvas (planks, sandstone blocks, a glass grid, cracked ice). Deterministic. */
function makeDeckTexture(kind) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  if (kind === 'wood') {
    g.fillStyle = '#2a1a0e'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 32) {
      const k = 0.78 + rnd() * 0.4; g.fillStyle = `rgb(${Math.round(160 * k)},${Math.round(112 * k)},${Math.round(70 * k)})`; g.fillRect(0, y + 1, S, 29);
      g.strokeStyle = 'rgba(70,40,20,0.4)'; g.lineWidth = 1;
      for (let i = 0; i < 6; i++) { const yy = y + 4 + rnd() * 23; g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(S * 0.3, yy + rnd() * 3 - 1.5, S * 0.7, yy + rnd() * 3 - 1.5, S, yy); g.stroke(); }
      const jx = Math.floor(rnd() * S); g.fillStyle = 'rgba(30,18,10,0.85)'; g.fillRect(jx, y + 1, 2, 29);
      g.fillStyle = 'rgba(30,30,34,0.85)'; for (const nx of [jx - 9, jx + 9]) { g.fillRect(nx, y + 7, 2, 2); g.fillRect(nx, y + 22, 2, 2); }
    }
  } else if (kind === 'stone') {
    g.fillStyle = '#5a3a28'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < 8; r++) for (let b = -1; b < 5; b++) {
      const x = b * 64 + (r & 1) * 32, k = 0.85 + rnd() * 0.3; g.fillStyle = `rgb(${Math.round(214 * k)},${Math.round(160 * k)},${Math.round(112 * k)})`; g.fillRect(x + 2, r * 32 + 2, 60, 28);
      g.fillStyle = 'rgba(120,70,40,0.18)'; for (let i = 0; i < 22; i++) g.fillRect(x + 2 + rnd() * 58, r * 32 + 2 + rnd() * 26, 1 + rnd() * 2, 1);
    }
  } else if (kind === 'glass') {
    g.fillStyle = '#060912'; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(70,110,190,0.10)'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(60,230,255,0.9)'; g.lineWidth = 2; for (let i = 0; i <= S; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
    g.strokeStyle = 'rgba(255,60,200,0.55)'; g.lineWidth = 1; for (let i = 32; i < S; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); }
  } else {                                                                                  // ice: deep glacial blue with pale frost flecks and cracks (R2-V-15: the old pale #9ccaea deck, lit by the sky and bloomed, read as a white sheet that swallowed the craft at GO)
    g.fillStyle = '#2b6aa0'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + rnd() * 0.14})`; g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 10, 1 + rnd() * 3); }
    g.strokeStyle = 'rgba(140,208,255,0.42)'; g.lineWidth = 1.4;
    for (let i = 0; i < 22; i++) { let x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; g.lineTo(((x % S) + S) % S, ((y % S) + S) % S); } g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

/** Screen-door fade by camera distance: gone inside `near` metres, solid beyond `far` (mat.userData.fade = Vector2(near, far), live). Injected into the stock
 *  shaders, so it works on any built-in material (lit or basic, instanced or not) with no transparency sorting. V-14: at GO the chase camera swoops through
 *  the start gantry (10-30 m from a leg) and one leg filled 25-30 % of the frame, hard against the craft. */
function distanceFade(mat, [near, far]) {
  const u = { value: new THREE.Vector2(near, far) };
  mat.userData.fade = u.value;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFade = u;
    // the view-space position is interpolated, so the distance is exact per fragment (a per-vertex distance is badly wrong across a 80 m crossbar of 8 vertices)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFadeP;').replace('#include <project_vertex>', '#include <project_vertex>\n  vFadeP = mvPosition.xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFadeP;\nuniform vec2 uFade;').replace('#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
  if (smoothstep(uFade.x, uFade.y, length(vFadeP)) < fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;`);
  };
  mat.customProgramCacheKey = () => 'pfade';
  return mat;
}
/** [gone, solid] camera distances in metres. The legs (the big dark slabs beside the swoop) go first; the crossbar, banner and lamps, which sit high and
 *  read as the start gate, only dissolve when the camera is almost inside them. */
const FADE_LEG = [34, 90], FADE_TOP = [16, 40];

function deckDecal(course, w, l, back, fwd, th) {
  // canvas covers the deck: x in [-w/2, w/2] (right = +x), y from the front (top) to the rear (bottom)
  const PPM = 6;                                           // pixels per metre
  const c = document.createElement('canvas'); c.width = Math.round(w * PPM); c.height = Math.round(l * PPM);
  const g = c.getContext('2d');
  const X = (x) => (x + w / 2) * PPM, Y = (fwdCoord) => (fwd - fwdCoord) * PPM;   // fwdCoord: metres ahead of the line (+) / behind (-)
  g.clearRect(0, 0, c.width, c.height);
  // hazard-striped edge bands
  const band = 2.2 * PPM;
  for (const side of [0, 1]) {
    for (let y = -band; y < c.height + band; y += band * 1.6) {
      g.fillStyle = th.stripe; g.beginPath();
      const x0 = side ? c.width - band : 0;
      g.moveTo(x0, y); g.lineTo(x0 + band, y + band * 0.8); g.lineTo(x0 + band, y + band * 1.6); g.lineTo(x0, y + band * 0.8); g.fill();
    }
  }
  // centre dashed guide + slot boxes from the real grid
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 0.5 * PPM; g.setLineDash([3 * PPM, 3 * PPM]);
  g.beginPath(); g.moveTo(X(0), 0); g.lineTo(X(0), c.height); g.stroke(); g.setLineDash([]);
  const grid = course.startGrid(8), tmp = new THREE.Vector3();
  for (const sl of grid) {
    tmp.copy(sl.pos).sub(course.startPos);
    const a = tmp.dot(course.startT), b = tmp.dot(course.startR);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.45 * PPM;
    g.strokeRect(X(b - 7), Y(a + 9), 14 * PPM, 22 * PPM);
    g.fillStyle = sl.slot === 0 ? '#ffd23a' : 'rgba(255,255,255,0.9)';
    g.font = `900 ${6 * PPM}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(sl.slot + 1), X(b), Y(a - 4));
  }
  // finish line: checker band across the deck at the line
  const cs = 2 * PPM;
  for (let i = 0; i < Math.floor(c.width / cs); i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 2 ? '#ffffff' : '#101418'; g.fillRect(i * cs, Y(0) - 3 * cs + j * cs, cs, cs); }
  // launch chevrons ahead of the line
  g.fillStyle = th.chev;
  for (let k = 0; k < 4; k++) { const y = Y(14 + k * 12); g.beginPath(); g.moveTo(X(-9), y + 6 * PPM); g.lineTo(X(0), y); g.lineTo(X(9), y + 6 * PPM); g.lineTo(X(9), y + 8.5 * PPM); g.lineTo(X(0), y + 2.5 * PPM); g.lineTo(X(-9), y + 8.5 * PPM); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function buildPlatform(course, game) {
  const cfg = course.startCfg, env = course.environment, deckY = course.deckY;
  const w = cfg.halfW * 2, l = cfg.back + cfg.fwd;
  const group = new THREE.Group(); group.name = 'platform';
  const disposables = [];
  // local frame: +x right, -z forward; origin at the start line on the deck plane
  const f = course.startFrame;
  const up = new THREE.Vector3(0, 1, 0), fwdH = new THREE.Vector3(f.tangent.x, 0, f.tangent.z).normalize(), rightH = new THREE.Vector3().crossVectors(fwdH, up).normalize();
  const root = new THREE.Group();
  root.position.set(f.pos.x, deckY, f.pos.z);
  root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(rightH, up, fwdH.clone().negate()));
  group.add(root);
  const zc = (cfg.back - cfg.fwd) / 2;                       // deck centre along +z (behind the line is +z)

  const th = THEMES[course.id] || THEMES.default;             // V-34: wood pier / sandstone / glass / ice, steel for an unknown course
  group.userData.theme = th.name;
  const deckTex = th.deck === 'metal' ? game.assets.tex('metal_deck') : makeDeckTexture(th.deck);
  if (th.deck !== 'metal') disposables.push(deckTex);
  const deckMat = new THREE.MeshStandardMaterial({ map: deckTex, color: th.deckColor, roughness: th.deckRough, metalness: th.deckMetal });
  if (th.deckGlow) { deckMat.emissive = new THREE.Color(0xffffff); deckMat.emissiveMap = deckTex; deckMat.emissiveIntensity = th.deckGlow;
    // R2-V-13: thin glowing grid lines crawl at distance (0.17 % of pixels for a 3 cm move at the Neon finish): sample coarser mips with distance so they fade to their mean
    deckMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() {\n  float deckBias = smoothstep(6.0, 100.0, length(vViewPosition)) * 3.5;')
        .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'texture2D( map, vMapUv, deckBias )'))
        .replace('#include <emissivemap_fragment>', THREE.ShaderChunk.emissivemap_fragment.replace('texture2D( emissiveMap, vEmissiveMapUv )', 'texture2D( emissiveMap, vEmissiveMapUv, deckBias )'));
    };
  }
  if (th.deckIbl != null) {                                    // R2-V-15: a glossy deck mirrors the pale sky horizon at the grazing angles of the GO swoop; scale its image-based specular (this deck only)
    const prev = deckMat.onBeforeCompile;
    deckMat.onBeforeCompile = (sh, rd) => { prev?.call(deckMat, sh, rd); sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n  reflectedLight.indirectSpecular *= ${th.deckIbl.toFixed(3)};`); };
    deckMat.customProgramCacheKey = () => `deckibl${th.deckIbl}`;
  }
  const hullMat = new THREE.MeshStandardMaterial({ color: th.hull, roughness: th.hullRough, metalness: th.hullMetal });
  // the gantry dithers away as the GO camera swoops into it (V-14): the legs from 90 m, the crossbar / banner / lamps only inside 40 m
  const legMat = distanceFade(new THREE.MeshStandardMaterial({ color: th.leg, roughness: th.legRough, metalness: th.legMetal }), FADE_LEG);
  const barMat = distanceFade(new THREE.MeshStandardMaterial({ color: th.leg, roughness: th.legRough, metalness: th.legMetal }), FADE_TOP);
  const accent = new THREE.MeshStandardMaterial({ color: th.accent, roughness: 0.5, metalness: 0.3 });
  if (th.accentGlow) { accent.emissive = new THREE.Color(th.accent); accent.emissiveIntensity = th.accentGlow; }
  disposables.push(deckMat, hullMat, legMat, barMat, accent);

  const top = new THREE.PlaneGeometry(w, l, 1, 1); top.rotateX(-Math.PI / 2);
  { const uv = top.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 10), uv.getY(i) * (l / 10)); }
  const deck = new THREE.Mesh(top, deckMat); deck.position.set(0, 0, zc); deck.receiveShadow = true; root.add(deck);
  const slab = new THREE.BoxGeometry(w, 5, l); const slabM = new THREE.Mesh(slab, hullMat); slabM.position.set(0, -2.55, zc); slabM.castShadow = true; slabM.receiveShadow = true; root.add(slabM);
  disposables.push(top, slab);

  const decalTex = deckDecal(course, w, l, cfg.back, cfg.fwd, th);
  const decalGeo = new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2);
  const decalMat = new THREE.MeshStandardMaterial({ map: decalTex, transparent: true, roughness: 0.7, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
  if (th.decalGlow) { decalMat.emissive = new THREE.Color(0xffffff); decalMat.emissiveMap = decalTex; decalMat.emissiveIntensity = th.decalGlow; }
  const decal = new THREE.Mesh(decalGeo, decalMat); decal.position.set(0, 0.04, zc); decal.receiveShadow = true; root.add(decal);
  disposables.push(decalTex, decalGeo, decalMat);

  // orange edge beams + underside truss
  const beam = new THREE.BoxGeometry(1.6, 1.6, l); disposables.push(beam);
  for (const sx of [-1, 1]) { const b = new THREE.Mesh(beam, accent); b.position.set(sx * (w / 2 + 0.2), 0.7, zc); root.add(b); }
  const trussH = 14, strut = new THREE.BoxGeometry(0.9, 0.9, 1); disposables.push(strut);
  const struts = [];
  for (let z = -cfg.fwd + 6; z < cfg.back; z += 12) for (const sx of [-1, 1]) {
    struts.push({ p: new THREE.Vector3(sx * (w / 2 - 2), -5 - trussH / 2, z), s: new THREE.Vector3(1, trussH, 1), r: 0 });
    const d = new THREE.Vector3(0, -trussH, 12); const len = d.length();
    struts.push({ p: new THREE.Vector3(sx * (w / 2 - 2), -5 - trussH / 2, z + 6), s: new THREE.Vector3(1, 1, len), r: Math.atan2(trussH, 12), diag: true });
  }
  const im = new THREE.InstancedMesh(strut, hullMat, struts.length); const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  struts.forEach((s, i) => { _e.set(s.diag ? s.r : 0, 0, 0); _q.setFromEuler(_e); _m.compose(s.p, _q, s.s.clone().multiply(new THREE.Vector3(1, 1, 1))); im.setMatrixAt(i, _m); });
  im.castShadow = true; root.add(im);
  // pylons down to the ground / sea
  const pyl = new THREE.CylinderGeometry(3, 4, 1, 14), pylMat = hullMat; disposables.push(pyl);
  const rows = Math.max(3, Math.round(l / 85));
  for (let r = 0; r < rows; r++) for (const sx of [-1, 1]) {
    const z = -cfg.fwd + 12 + (r * (l - 24)) / (rows - 1);
    const wp = new THREE.Vector3(sx * (w / 2 - 6), 0, z).applyQuaternion(root.quaternion).add(root.position);
    const gy = Math.min(course.groundHeight(wp.x, wp.z), deckY - 10), hgt = deckY - 5 - gy + 14;
    const p = new THREE.Mesh(pyl, pylMat); p.scale.set(1, hgt, 1); p.position.set(sx * (w / 2 - 6), -5 - hgt / 2 + 8, z); p.castShadow = true; root.add(p);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 3, 14), accent); band.position.set(sx * (w / 2 - 6), -9, z); root.add(band); disposables.push(band.geometry);
  }

  // ---- start gantry at the line: two towers, a crossbar with a checkered banner and three lamps facing the grid (behind, +z)
  const towerH = 46, gantry = new THREE.Group(); gantry.name = 'gantry'; gantry.position.set(0, 0, 0); root.add(gantry);
  const tw = new THREE.BoxGeometry(3, towerH, 3); disposables.push(tw);
  for (const sx of [-1, 1]) { const t = new THREE.Mesh(tw, legMat); t.name = 'gantry-leg'; t.position.set(sx * (w / 2 + 3), towerH / 2, 0); t.castShadow = true; gantry.add(t); }
  const barGeo = new THREE.BoxGeometry(w + 12, 6, 3.2); const bar = new THREE.Mesh(barGeo, barMat); bar.position.set(0, towerH - 3, 0); bar.castShadow = true; gantry.add(bar); disposables.push(barGeo);
  const bt = (() => {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const g = c.getContext('2d');
    for (let i = 0; i < 64; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#111'; g.fillRect(i * 16, j * 16, 16, 16); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
  })();
  const bannerGeo = new THREE.PlaneGeometry(w + 12, 4), bannerMat = distanceFade(new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide, toneMapped: true }), FADE_TOP);
  const banner = new THREE.Mesh(bannerGeo, bannerMat); banner.position.set(0, towerH - 3, 1.7); gantry.add(banner);
  const banner2 = banner.clone(); banner2.position.z = -1.7; banner2.rotation.y = Math.PI; gantry.add(banner2);
  disposables.push(bt, bannerGeo, bannerMat);
  const lampGeo = new THREE.CircleGeometry(3.4, 24); disposables.push(lampGeo);
  const lamps = [];
  for (let i = 0; i < 3; i++) {
    const m = distanceFade(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.02, 0.02), toneMapped: false }), FADE_TOP);
    const lamp = new THREE.Mesh(lampGeo, m); lamp.position.set((i - 1) * 9, towerH - 11, 1.8); gantry.add(lamp); lamps.push(m);
    const rim = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.2, 24), barMat); rim.position.copy(lamp.position); rim.position.z += 0.02; gantry.add(rim); disposables.push(rim.geometry);
    disposables.push(m);
  }
  const OFF = new THREE.Color(0.12, 0.02, 0.02), RED = new THREE.Color(5, 0.25, 0.15), GREEN = new THREE.Color(0.3, 5, 0.6);
  let goT = 0;
  // side lights along the deck (emissive points, one instanced mesh)
  const ld = new THREE.SphereGeometry(0.9, 8, 6), lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(...th.glow), toneMapped: false }); disposables.push(ld, lm);
  const nl = Math.floor(l / 10) * 2, lights = new THREE.InstancedMesh(ld, lm, nl);
  for (let i = 0; i < nl; i++) { const sx = i & 1 ? 1 : -1, z = -cfg.fwd + 5 + Math.floor(i / 2) * 10; lights.setMatrixAt(i, _m.compose(new THREE.Vector3(sx * (w / 2 + 0.2), 1.9, z), _q.identity(), new THREE.Vector3(1, 1, 1))); }
  root.add(lights);

  const setLamps = (n, green) => { lamps.forEach((m, i) => m.color.copy(green ? GREEN : i < n ? RED : OFF)); };
  setLamps(0, false);
  return {
    group,
    onReady() { goT = 0; setLamps(0, false); },
    onCountdown(n) { setLamps(4 - n, false); },
    onGo() { setLamps(3, true); goT = 3; },
    update(dt) { if (goT > 0) { goT -= dt; if (goT <= 0) setLamps(0, false); } },
    dispose() { for (const d of disposables) d.dispose?.(); },
  };
}
