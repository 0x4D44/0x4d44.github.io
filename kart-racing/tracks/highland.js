// Highland Fling: Scottish Highlands circuit - theme, terrain carving (loch, burn, glen), water, weather and the scenery orchestration.
import * as THREE from "three";
import { TAU, LOCH, S, BURN, VIADUCT, sm, vnoise, lochR, burnQuery, burnBed } from "./highland-geo.js";
import { tartanCanvas, TARTAN_RED, TARTAN_BLUE, TARTAN_GREEN, toTexture } from "./highland-tex.js";
import { buildNature, silageBales } from "./highland-nature.js";
import { buildStructs } from "./highland-structs.js";
import { buildAds } from "./highland-ads.js";
import { buildPiper } from "./highland-piper.js";

const theme = {
  shoulder: 4.0, kerb: [0xb3202a, 0x16365f], wallBase: "#e6e1d2", wallAccent: "#9b1c24", wallText: ["HIGHLAND FLING", "APEX KARTS", "WEE DRAM", "MIND THE COOS"],
  asphalt: "#4a4c52", line: "#eceae0", padColor: "#ffd24a", padColor2: "#c8102e",
  ground: "#5d6e3c", groundVar: 12, shoulderCol: "#7a7258",
  fog: [0x9ba5af, 80, 620],
  hemi: [0xc7d0dc, 0x4e4c3c, 1.05], sun: { color: 0xffe2b8, i: 1.55, dir: [-0.55, 0.24, -0.42] },
  sky: {
    stops: [[0, "#58636f"], [0.22, "#76818c"], [0.4, "#a3adb6"], [0.48, "#c6cbcf"], [0.52, "#a8b1b8"], [0.56, "#9ba5af"], [1, "#9ba5af"]],
    sun: { glow: "#fff0cc", disc: "#fff6e0", size: 0.011 }, clouds: "#cfd4d9", ridge: ["#6f6d88", "#5b5c7c"], stars: false,
  },
};

let _bridgeInfo = null;
export default {
  id: "highland",
  theme,
  terrainAmp: 14,

  // runs before the terrain is built: open a gully under the humpback bridge by releasing the road-following constraint there
  prepTerrain(track) {
    const X = track._ctx, { N, ds } = X.C, L = track.length;
    for (let i = 0; i < N; i++) {
      let d = Math.abs(i * ds - S.bridge); d = Math.min(d, L - d);
      const u = sm(20, 54, d); X.cor[i] = Math.min(X.cor[i], u);
    }
  },

  // extra terrain shaping applied to the background height (the road corridor is blended in afterwards)
  carve(track, x, z, h) {
    // the glen the railway viaduct strides across
    const dz = Math.abs(z - VIADUCT.z);
    if (dz < 50 && x > 30 && x < 262) {
      const w = (1 - sm(14, 50, dz)) * sm(30, 56, x) * (1 - sm(238, 262, x));
      const target = 6.8 + 0.21 * Math.abs(x - VIADUCT.cx);
      if (target < h) h += (target - h) * w;
    }
    // the loch
    const r = lochR(x, z);
    if (r < 1.4) {
      const w = 1 - sm(1.0, 1.4, r);
      const bed = LOCH.y - 0.45 - (r < 1 ? 5 * (1 - r) : 0);
      h += (bed - h) * w;
    }
    // the burn: a V-gully following an absolute bed height (downhill all the way, deep under the bridge)
    const q = burnQuery(x, z);
    if (q.d < 40) {
      const hb = burnBed(q.t) + 0.5 * Math.max(0, q.d - 7.5);
      if (hb < h) h += (hb - h) * sm(2, 40, q.t);
    }
    return h;
  },

  scenery(track, X, K) {
    const { group, anim, own, rng, canvas, toTex, bake, mat, part } = X;
    const H = { THREE, track, X, K, rng, theme };
    H.tartan = (bands, rep = 1) => { const t = toTexture(tartanCanvas(128, bands)); t.repeat.set(rep, rep); return own(t); };

    // ---- tartan kerbs + barriers
    {
      const kerb = group.getObjectByName("kerbs"), walls = group.getObjectByName("walls");
      if (kerb) { const t = H.tartan(TARTAN_RED); t.anisotropy = 4; kerb.material.map = t; kerb.material.needsUpdate = true; }
      if (walls) {
        const c = canvas(1024, 128), g = c.getContext("2d");
        g.fillStyle = "#e9e4d4"; g.fillRect(0, 0, 1024, 128);
        const tc = tartanCanvas(128, TARTAN_BLUE);
        g.fillStyle = g.createPattern(tc, "repeat"); g.fillRect(0, 48, 1024, 80);
        g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(0, 46, 1024, 3);
        g.fillStyle = "#16365f"; g.font = "900 25px Arial Black, Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        theme.wallText.forEach((t, i) => g.fillText(t, 128 + i * 256, 29));
        g.fillStyle = "rgba(0,0,0,0.18)"; for (let x = 0; x < 1024; x += 256) g.fillRect(x, 0, 3, 48);
        g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(0, 0, 1024, 9);
        walls.material.map = own(toTex(c)); walls.material.needsUpdate = true;
      }
    }

    // ---- terrain recolour: heather / bracken / grass / scree
    {
      const tm = group.getObjectByName("terrain");
      if (tm) {
        const pa = tm.geometry.attributes.position, ca = tm.geometry.attributes.color, nrm = tm.geometry.attributes.normal;
        const heatherA = new THREE.Color(0x80609a), heatherB = new THREE.Color(0xa070b4), bracken = new THREE.Color(0x6e7a36), rust = new THREE.Color(0x8a6532), grass = new THREE.Color(0x4a6f38), peat = new THREE.Color(0x4a3f33), scree = new THREE.Color(0x7d786e), t = new THREE.Color(), road = new THREE.Color(0x56733a);
        for (let i = 0; i < pa.count; i++) {
          const x = pa.getX(i), z = pa.getZ(i), y = pa.getY(i), n1 = vnoise(x / 70 + 3, z / 70), n2 = vnoise(x / 19, z / 19), n3 = vnoise(x / 150 - 9, z / 150 + 4);
          t.copy(grass).lerp(bracken, sm(0.35, 0.7, n1));
          t.lerp(rust, 0.55 * sm(0.55, 0.85, n3) * (1 - n2 * 0.4));
          t.lerp(n2 > 0.5 ? heatherB : heatherA, sm(0.4, 0.62, vnoise(x / 55 + 11, z / 55 - 5)) * (0.55 + 0.45 * sm(1, 14, y)));
          const d = track.nearestDist(x, z);
          t.lerp(road, 0.45 * (1 - sm(14, 40, d)));
          const lr = lochR(x, z); if (lr < 1.35) t.lerp(peat, 0.7 * (1 - sm(1.05, 1.35, lr)));
          const slope = 1 - nrm.getY(i); t.lerp(scree, sm(0.18, 0.5, slope));
          const v = 1.08 + 0.2 * n2; ca.setXYZ(i, t.r * v, t.g * v, t.b * v);
        }
        ca.needsUpdate = true;
      }
    }

    // ---- loch, mist, burn, Nessie
    const waterY = LOCH.y;
    const wc = canvas(256, 256), wg = wc.getContext("2d");
    wg.fillStyle = "#2e4a5c"; wg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 300; i++) { wg.strokeStyle = `rgba(${170 + rng() * 60 | 0},${190 + rng() * 50 | 0},${210 + rng() * 40 | 0},${0.04 + rng() * 0.13})`; wg.lineWidth = 1 + rng() * 1.5; wg.beginPath(); const x = rng() * 256, y = rng() * 256, w = 8 + rng() * 26; wg.moveTo(x, y); wg.quadraticCurveTo(x + w / 2, y - 2 - rng() * 2, x + w, y); wg.stroke(); }
    const wtex = own(toTex(wc)); wtex.repeat.set(28, 28);
    const loch = new THREE.Mesh(own(new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2)), own(new THREE.MeshStandardMaterial({ map: wtex, roughness: 0.18, metalness: 0.3, color: 0xc8d4de })));
    loch.scale.set(LOCH.rx * 1.3, 1, LOCH.rz * 1.3); loch.position.set(LOCH.x, waterY, LOCH.z); loch.name = "loch"; group.add(loch);
    anim.push((dt) => { wtex.offset.x += dt * 0.003; wtex.offset.y += dt * 0.004; });

    // mist drifting over the loch
    {
      const c = canvas(128, 128), g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(225,230,236,0.55)"); gr.addColorStop(1, "rgba(225,230,236,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const mt = own(toTex(c, { repeat: false })), mm = own(new THREE.MeshBasicMaterial({ map: mt, transparent: true, depthWrite: false, opacity: 0.45 }));
      const pg = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), mists = [];
      for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(pg, mm); const a = rng() * TAU, r = rng() * 0.8; m.position.set(LOCH.x + Math.cos(a) * LOCH.rx * r, waterY + 0.9 + rng() * 1.2, LOCH.z + Math.sin(a) * LOCH.rz * r); m.scale.set(60 + rng() * 60, 1, 40 + rng() * 40); m.renderOrder = 3; group.add(m); mists.push({ m, p: rng() * 6, x: m.position.x }); }
      anim.push((dt, t) => { for (const k of mists) k.m.position.x = k.x + Math.sin(t * 0.05 + k.p) * 10; });
    }

    // the burn (water ribbon following the carved channel, always running downhill)
    {
      const pts = []; let acc = 0, lastY = 0;
      for (let i = 0; i < BURN.length; i++) { if (i) acc += Math.hypot(BURN[i][0] - BURN[i - 1][0], BURN[i][1] - BURN[i - 1][1]); pts.push({ x: BURN[i][0], z: BURN[i][1], t: acc }); }
      // smooth the polyline sideways a little so it meanders
      const pos = [], uv = [], idx = [];
      pts.forEach((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const y = burnBed(p.t) + 0.5; lastY = y; p.y = y;
        const wdt = 2.7 + 0.5 * Math.sin(p.t * 0.05);
        pos.push(p.x + dz * wdt, y, p.z - dz * 0 - dx * wdt, p.x - dz * wdt, y, p.z + dx * wdt);
        uv.push(0, p.t / 8, 1, p.t / 8);
        if (i < pts.length - 1) { const o = i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      });
      const g = own(new THREE.BufferGeometry()); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const c = canvas(64, 128), cg = c.getContext("2d"); cg.fillStyle = "#3d6478"; cg.fillRect(0, 0, 64, 128);
      for (let i = 0; i < 60; i++) { cg.fillStyle = `rgba(255,255,255,${0.15 + rng() * 0.4})`; cg.fillRect(rng() * 60, rng() * 128, 2 + rng() * 5, 1 + rng() * 6); }
      const bt = own(toTex(c)); const bm = new THREE.Mesh(g, own(new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })));
      bm.name = "burn"; group.add(bm); anim.push((dt) => { bt.offset.y -= dt * 0.35; });
      H.burnPts = pts;
    }

    // Nessie
    {
      const g = new THREE.Group(), skin = own(new THREE.MeshLambertMaterial({ color: 0x40584a })), skin2 = own(new THREE.MeshLambertMaterial({ color: 0x4d6957 }));
      const hump = (x, z, r, sy, ln) => { const m = new THREE.Mesh(own(new THREE.SphereGeometry(r, 12, 8, 0, TAU, 0, Math.PI / 2)), skin); m.scale.set(1, sy, ln); m.position.set(x, 0, z); g.add(m); return m; };
      const h1 = hump(0, 0, 3.4, 0.8, 1.7), h2 = hump(0, 9, 2.8, 0.75, 1.5), h3 = hump(0, 17, 2.1, 0.7, 1.4);
      const neck = new THREE.Group(); neck.position.set(0, 0, -6.5);
      const segs = [[0, 0, 0, 0.0], [0, 2.2, -0.4, -0.25], [0, 4.4, -1.4, -0.5], [0, 6.2, -3.0, -0.95]];
      segs.forEach(([x, y, z, tilt], i) => { const m = new THREE.Mesh(own(new THREE.CylinderGeometry(0.75 - i * 0.1, 0.95 - i * 0.1, 2.5, 8)), skin2); m.position.set(x, y + 1.0, z); m.rotation.x = tilt; neck.add(m); });
      const head = new THREE.Mesh(own(new THREE.SphereGeometry(0.9, 9, 7)), skin2); head.scale.set(0.85, 0.8, 1.35); head.position.set(0, 8.1, -4.6); neck.add(head);
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(own(new THREE.SphereGeometry(0.17, 5, 4)), own(new THREE.MeshBasicMaterial({ color: 0xfff2a0 }))); e.position.set(sx * 0.5, 8.35, -5.2); neck.add(e); const o = new THREE.Mesh(own(new THREE.CylinderGeometry(0.07, 0.1, 0.7, 4)), skin); o.position.set(sx * 0.35, 9.0, -4.4); neck.add(o); }
      g.add(neck);
      const ring = own(new THREE.RingGeometry(0.975, 1, 48).rotateX(-Math.PI / 2)), rmat = own(new THREE.MeshBasicMaterial({ color: 0xdfe8ee, transparent: true, opacity: 0.35, depthWrite: false }));
      const rings = [0, 1, 2].map((i) => { const m = new THREE.Mesh(ring, rmat.clone()); m.position.y = 0.05; g.add(m); return m; });
      g.position.set(372, waterY - 0.15, 172); g.rotation.y = 2.4; g.name = "nessie"; group.add(g);
      anim.push((dt, t) => {
        const cyc = (t % 46) / 46, up = sm(0.52, 0.6, cyc) * (1 - sm(0.8, 0.88, cyc));
        neck.scale.y = Math.max(0.001, up); neck.visible = up > 0.01; neck.position.y = -0.4 + 0.4 * up;
        g.position.y = waterY - 0.15 + Math.sin(t * 0.7) * 0.18;
        h1.position.y = Math.sin(t * 0.7 + 1) * 0.1; h2.position.y = Math.sin(t * 0.7 + 2) * 0.12 - 0.05; h3.position.y = Math.sin(t * 0.7 + 3) * 0.1 - 0.1;
        rings.forEach((r, i) => { const f = ((t * 0.18 + i / 3) % 1); r.scale.set(5 + f * 16, 1, 7 + f * 22); r.position.z = 9; r.material.opacity = 0.4 * (1 - f) * Math.min(1, f * 6); });
        
      });
    }

    // ---- everything else
    buildNature(H);
    silageBales(H);
    buildStructs(H);
    buildAds(H);
    buildPiper(H);

    // ---- recolour the generic start-area flags in Scottish colours
    {
      const fm = group.getObjectByName("flags");
      if (fm) {
        const ca = fm.geometry.attributes.color, pairs = [[0x0a4fa6, 0xffffff], [0xf6c812, 0xc8102e], [0x1d5a34, 0xf4f0e0]], c = new THREE.Color(), per = 27;
        for (let f = 0; f < ca.count / per; f++) for (let v = 0; v < per; v++) { c.set(pairs[f % pairs.length][v < 18 ? 0 : 1]); ca.setXYZ(f * per + v, c.r, c.g, c.b); }
        ca.needsUpdate = true;
      }
    }

    // ---- drizzle
    {
      const n = 1400, pos = new Float32Array(n * 2 * 3), end = new Float32Array(n * 2), seed = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { const x = rng() * 70, y = rng() * 40, z = rng() * 70, s = rng(); for (let k = 0; k < 2; k++) { pos.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; seed[i * 2 + k] = s; } }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("aEnd", new THREE.BufferAttribute(end, 1)); g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      const m = own(new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, fog: false,
        vertexShader: `uniform float uTime; attribute float aEnd; attribute float aSeed; varying float vA;
          void main(){ vec3 p = position; p.y -= uTime * (22.0 + aSeed * 8.0); p.x += uTime * 4.0; p = mod(p, vec3(70.0, 40.0, 70.0)) - vec3(35.0, 14.0, 35.0);
            vec3 w = p + cameraPosition; w += vec3(-0.18, 1.0, -0.05) * 1.1 * aEnd; vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv; vA = smoothstep(35.0, 8.0, length(p)) * (0.25 + 0.2 * aSeed); }`,
        fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.82, 0.88, 0.95, vA); }`,
      }));
      const rain = new THREE.LineSegments(g, m); rain.frustumCulled = false; rain.renderOrder = 6; rain.name = "drizzle"; group.add(rain);
      anim.push((dt, t) => { m.uniforms.uTime.value = t; });
    }
  },
};
