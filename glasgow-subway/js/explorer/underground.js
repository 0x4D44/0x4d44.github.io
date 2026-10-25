// Everything below the street: twin tunnel tubes, station vaults, entrance shafts, beacons and the live service.
import * as THREE from 'three';
import { Track } from './track.js';
import { clamp, lerp } from './util.js';

export const COL = { outer: new THREE.Color('#ff7a1f'), inner: new THREE.Color('#34c6e8'), river: new THREE.Color('#e9fbff'), deep: new THREE.Color('#3b2a78') };

function ringTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#bdbdbd'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#6d6d6d'; g.fillRect(0, 0, 6, 64); g.fillRect(64, 0, 4, 64);        // ring flanges (every 0.6 m)
  g.fillStyle = '#d8d8d8'; g.fillRect(6, 0, 2, 64); g.fillRect(68, 0, 2, 64);
  g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 64; i += 16) g.fillRect(8, i, 56, 2), g.fillRect(70, i, 56, 2); // segment joints
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Underground {
  constructor({ scene, env, subway, ground, quality }) {
    Object.assign(this, { scene, env, subway, ground, quality });
    this.tracks = { outer: new Track(subway.tracks.outer, 'outer'), inner: new Track(subway.tracks.inner, 'inner') };
    this.group = new THREE.Group(); this.group.name = 'underground'; scene.add(this.group);
    this.uni = { uBoost: { value: 0 }, uGlow: { value: 0.35 } };
    this.ringTex = ringTexture();
    this.exag = 1; this.clock = 0; this.timescale = 10; this.selected = null; this.hovered = null;
    this.vis = { tunnels: true, stations: true };
    this.stationInfo = new Map(); this.pickMeshes = []; this.crossings = []; this.focusY = 0;
    this.R = (subway.tunnel?.innerDiameterM || 3.35) / 2 + 0.25;
    for (const k of ['outer', 'inner']) this.tracks[k].schedule = this.makeSchedule(this.tracks[k]);
    this.build(1);
  }
  yMap(x, z, y, k = this.exag) { const g = this.ground(x, z); return y >= g ? y : g + (y - g) * k; }

  makeSchedule(tr) {
    const N = 1600, L = tr.length, ds = L / N, vmax = 16, dwell = 25;
    const stops = (tr.def.stops || []).map((s) => s.s - tr.offset); const T = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) {
      const s = i * ds; let d = 1e9; for (const q of stops) { let e = Math.abs(((s - q) % L + L) % L); e = Math.min(e, L - e); if (e < d) d = e; }
      const v = vmax * clamp(d / 300, 0.28, 1); let dt = ds / v;
      for (const q of stops) if (q >= s && q < s + ds) dt += dwell;
      T[i + 1] = T[i] + dt;
    }
    return { T, N, ds, P: T[N] };
  }
  sAt(tr, t) {
    const { T, N, ds, P } = tr.schedule; t = ((t % P) + P) % P; let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= t) lo = m; else hi = m; }
    return (lo + (t - T[lo]) / Math.max(1e-6, T[hi] - T[lo])) * ds;
  }

  clear() {
    this.group.traverse((o) => { o.geometry?.dispose?.(); if (o.material && !o.material.userData?.shared) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    this.group.clear(); this.pickMeshes = []; this.stationInfo.clear(); this.crossings = [];
  }
  makeTubeMaterial() {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.ringTex, roughness: 0.55, metalness: 0.25, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uni);
      sh.vertexShader = 'uniform float uBoost;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += objectNormal * uBoost;');
      sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight += diffuseColor.rgb * uGlow;\n#include <opaque_fragment>');
    };
    m.userData.shared = false; return m;
  }
  crossingRanges(key) {
    const rc = this.subway.tunnel?.riverCrossings || []; const tr = this.tracks[key]; const out = [];
    for (const c of rc) {
      if (c.track && c.track !== key && c.track !== 'both') continue;
      let s0 = c.s0 - this.tracks.outer.offset, s1 = c.s1 - this.tracks.outer.offset;
      if (key === 'inner' && !c.track) { // map outer chainage range onto the inner loop by position
        const o = this.tracks.outer; const a = o.at(s0), b = o.at(s1);
        const na = tr.nearest(a.x, a.z), nb = tr.nearest(b.x, b.z); s0 = Math.min(na.s, nb.s); s1 = Math.max(na.s, nb.s);
        if (s1 - s0 > tr.length / 2) { const t = s0; s0 = s1; s1 = t + tr.length; }
      }
      out.push({ s0, s1, name: c.name });
    }
    return out;
  }
  buildTube(key, k) {
    const tr = this.tracks[key], segs = this.quality.tubeSegs, step = this.quality.tubeStep, R = this.R;
    const M = Math.max(8, Math.ceil(tr.length / step)); const rings = M + 1;
    const pos = new Float32Array(rings * (segs + 1) * 3), col = new Float32Array(pos.length), uv = new Float32Array(rings * (segs + 1) * 2);
    const cr = this.crossingRanges(key); const base = COL[key]; const c = new THREE.Color(); const P = []; const tmp = {};
    for (let i = 0; i < rings; i++) {
      const s = (i % M) * tr.length / M + (i === M ? 0 : 0); tr.at(i === M ? 0 : s, tmp);
      const yc = tmp.y + 1.0; const g = this.ground(tmp.x, tmp.z);
      P.push({ x: tmp.x, z: tmp.z, ym: this.yMap(tmp.x, tmp.z, yc, k), depth: Math.max(0, g - yc), s: i * tr.length / M, ss: s });
    }
    P[M].x = P[0].x; P[M].z = P[0].z; P[M].ym = P[0].ym;
    const right = new THREE.Vector3(), up = new THREE.Vector3(), t = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < rings; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(M, i + 1)];
      let pa = a, pb = b; if (i === 0) pa = P[M - 1]; if (i === M) pb = P[1];
      t.set(pb.x - pa.x, pb.ym - pa.ym, pb.z - pa.z).normalize();
      right.crossVectors(t, Y).normalize(); up.crossVectors(right, t);
      const p = P[i]; const df = clamp(p.depth / 32, 0, 1);
      c.copy(base).lerp(COL.deep, df * 0.55).multiplyScalar(1.15 - df * 0.35);
      const inR = cr.some((q) => (p.ss >= q.s0 && p.ss <= q.s1) || (q.s1 > tr.length && p.ss <= q.s1 - tr.length));
      if (inR) c.copy(COL.river);
      for (let j = 0; j <= segs; j++) {
        const an = (j / segs) * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an); const o = (i * (segs + 1) + j);
        pos[o * 3] = p.x + (right.x * cs + up.x * sn) * R; pos[o * 3 + 1] = p.ym + (right.y * cs + up.y * sn) * R; pos[o * 3 + 2] = p.z + (right.z * cs + up.z * sn) * R;
        col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b; uv[o * 2] = p.s / 1.2; uv[o * 2 + 1] = j / segs * 2;
      }
    }
    const idx = []; for (let i = 0; i < M; i++) for (let j = 0; j < segs; j++) { const a = i * (segs + 1) + j, b = a + segs + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.makeTubeMaterial()); mesh.name = 'tube_' + key; mesh.renderOrder = 1; mesh.frustumCulled = false;
    // analytic pick samples
    mesh.userData.samples = P; return mesh;
  }
  build(k) {
    this.clear(); this.exag = k; const sub = this.subway;
    this.tubes = new THREE.Group(); this.stationsG = new THREE.Group(); this.live = new THREE.Group();
    this.group.add(this.tubes, this.stationsG, this.live);
    for (const key of ['outer', 'inner']) this.tubes.add(this.buildTube(key, k));
    // crossings
    for (const c of this.crossingRanges('outer')) {
      const o = this.tracks.outer; const m = o.at((c.s0 + c.s1) / 2); const g = this.ground(m.x, m.z);
      this.crossings.push({ name: c.name || 'River Clyde crossing', pos: new THREE.Vector3(m.x, this.yMap(m.x, m.z, m.y, k), m.z), surface: new THREE.Vector3(m.x, Math.max(g, 3) + 25, m.z), s0: c.s0, s1: c.s1 });
    }
    const edgeMat = new THREE.LineBasicMaterial({ color: '#ffa35c', transparent: true, opacity: 0.75, depthWrite: false });
    const glassMat = new THREE.MeshBasicMaterial({ color: '#ff8a3a', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    this.glass = glassMat; this.glassSel = glassMat.clone(); this.glassSel.color.set('#ffd9a8'); this.glassSel.opacity = 0.3;
    const slabMat = new THREE.MeshStandardMaterial({ color: '#d9d2c4', roughness: 0.8, emissive: '#6b5a40', emissiveIntensity: 0.5 });
    const shaftMat = new THREE.MeshBasicMaterial({ color: '#ffb067', transparent: true, opacity: 0.5, depthWrite: false });
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ff8a3a', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending });
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffb067', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const pickMat = new THREE.MeshBasicMaterial({ visible: false });
    for (const m of [edgeMat, glassMat, slabMat, shaftMat, beamMat, ringMat, pickMat]) m.userData.shared = false;
    const Z = new THREE.Vector3(0, 1, 0);
    for (const st of sub.stations) {
      const pl = st.platform || {}; const cx = pl.centreX ?? st.x, cz = pl.centreZ ?? st.z; const g = this.ground(st.x, st.z);
      const L = pl.lengthM || 55, Wp = pl.widthM || 8; const W = Wp + 9, H = 7.5;
      const railY = st.railY ?? (g - (st.depth || 12)); const ym = this.yMap(cx, cz, railY, k);
      const sg = new THREE.Group(); sg.position.set(cx, ym, cz); sg.rotation.y = Math.PI / 2 - THREE.MathUtils.degToRad(pl.headingDeg ?? 90);
      const box = new THREE.Mesh(new THREE.BoxGeometry(L + 6, H, W), glassMat); box.position.y = H / 2 - 1; box.renderOrder = 1; sg.add(box);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), edgeMat.clone()); edges.position.copy(box.position); edges.renderOrder = 1; sg.add(edges);
      const addSlab = (z0, w) => { const s = new THREE.Mesh(new THREE.BoxGeometry(L, 1, w), slabMat); s.position.set(0, 0.35, z0); sg.add(s); };
      if (pl.type === 'side') { addSlab(-(W / 2 - 1.8), 3.2); addSlab(W / 2 - 1.8, 3.2); } else if (pl.type === 'split') { addSlab(-W / 4, Wp / 2.2); addSlab(W / 4, Wp / 2.2); } else addSlab(0, Wp);
      this.stationsG.add(sg);
      // entrances -> inclined escalator shafts
      const ents = st.entrances?.length ? st.entrances : [{ x: st.x, z: st.z }];
      const vault = new THREE.Vector3(cx, ym + 3.5, cz);
      for (const e of ents) {
        if (!Number.isFinite(e.x)) continue; const eg = this.ground(e.x, e.z); const top = new THREE.Vector3(e.x, eg + 0.5, e.z);
        const dir = new THREE.Vector3().subVectors(vault, top); const len = dir.length(); if (len < 1) continue;
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, len, 6), shaftMat); cyl.position.copy(top).addScaledVector(dir, 0.5); cyl.quaternion.setFromUnitVectors(Z, dir.normalize()); cyl.renderOrder = 1; this.stationsG.add(cyl);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 1.2, 12), ringMat); cap.position.copy(top); cap.renderOrder = 6; this.stationsG.add(cap);
      }
      // beacon + ground ring + pick volume
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 160, 10, 1, true), beamMat); beam.position.set(st.x, g + 80, st.z); beam.renderOrder = 6; this.stationsG.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(15, 17.5, 48), ringMat.clone()); ring.rotation.x = -Math.PI / 2; ring.position.set(st.x, g + 1, st.z); ring.renderOrder = 6; ring.material.userData.shared = false; this.stationsG.add(ring);
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 200, 8), pickMat); pick.position.set(st.x, g + 90, st.z); pick.userData.station = st.id; this.stationsG.add(pick); this.pickMeshes.push(pick);
      this.stationInfo.set(st.id, { st, surface: new THREE.Vector3(st.x, g, st.z), vault: new THREE.Vector3(cx, ym + 2, cz), box, edges, beam, ring, pick, heading: pl.headingDeg ?? 90, depth: st.depth ?? (g - railY) });
    }
    // live service
    const tg = new THREE.BoxGeometry(39, 2.8, 2.5); tg.translate(0, 1.4, 0);
    const ag = new THREE.ConeGeometry(1.7, 6, 4); ag.rotateZ(-Math.PI / 2);
    this.trainSets = [];
    for (const key of ['outer', 'inner']) {
      const tr = this.tracks[key]; const col = COL[key];
      const tm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.8, roughness: 0.4 });
      const trains = new THREE.InstancedMesh(tg, tm, this.quality.trains); trains.frustumCulled = false; trains.renderOrder = 0;
      const na = this.quality.arrows; const arrows = new THREE.InstancedMesh(ag, new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color('#fff'), 0.35) }), Math.max(1, Math.floor(tr.length / 130)));
      arrows.frustumCulled = false; this.live.add(trains, arrows); this.trainSets.push({ key, tr, trains, arrows });
    }
    this.tubes.visible = this.vis.tunnels && !!this._xrayOn; this.stationsG.visible = this.vis.stations; this.live.visible = this.tubes.visible;
    this.setSelected(this.selected);
  }
  setExaggeration(k) { if (Math.abs(k - this.exag) > 1e-3) this.build(k); }
  setVisible(layer, on) { this.vis[layer] = on; if (this.tubes) { this.tubes.visible = this.vis.tunnels && this._xrayOn; this.live.visible = this.vis.tunnels && this._xrayOn; this.stationsG.visible = this.vis.stations; } }
  setXray(v) { this._xrayOn = v > 0.02; this.xray = v; this.setVisible('tunnels', this.vis.tunnels); this.stationsG.visible = this.vis.stations; }
  setSelected(id) {
    this.selected = id;
    for (const [sid, i] of this.stationInfo) { const on = sid === id; i.edges.material.color.set(on ? '#fff3d6' : '#ffa35c'); i.edges.material.opacity = on ? 1 : 0.75; i.box.material = on ? this.glassSel : this.glass; }
  }
  /** World-space focus point and heading for a station */
  focus(id, underground) {
    const i = this.stationInfo.get(id); if (!i) return null;
    return { surface: i.surface.clone(), vault: i.vault.clone(), point: (underground ? i.vault : i.surface).clone(), heading: i.heading, depth: i.depth };
  }
  trainPositions(out = []) { // for follow-cam: world positions of the first train of each loop
    out.length = 0; for (const set of this.trainSets) { const s = this.sAt(set.tr, this.clock); const p = set.tr.at(s); out.push({ key: set.key, x: p.x, y: this.yMap(p.x, p.z, p.y + 1.3), z: p.z, tx: p.tx, tz: p.tz }); } return out;
  }
  update(dt, camera, camDist, scale) {
    this.clock += dt * this.timescale; this.uni.uGlow.value = this.env.glow;
    const sc = Math.max(1, camDist / 1400), boost = Math.max(0, camDist * 0.0034 - this.R);
    this.uni.uBoost.value = this.xray > 0.02 ? Math.min(boost, 32) : 0;
    // stations: beacons scale with distance so they remain visible
    const bs = clamp(camDist / 650, 1, 6); const t = performance.now() / 1000;
    for (const [id, i] of this.stationInfo) {
      const sel = id === this.selected, hov = id === this.hovered;
      i.beam.scale.set(bs * (sel ? 1.8 : 1), 1, bs * (sel ? 1.8 : 1));
      i.beam.material.opacity = (sel ? 0.6 : hov ? 0.5 : 0.25) * clamp(camDist / 600, 0.3, 1);
      const rs = clamp(camDist / 1500, 1, 4) * (sel ? 1.15 + 0.1 * Math.sin(t * 3) : 1);
      i.ring.scale.set(rs, rs, 1); i.pick.scale.set(clamp(camDist / 500, 1, 12), 1, clamp(camDist / 500, 1, 12));
    }
    if (!this.live.visible) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, sc, sc);
    const X = new THREE.Vector3(), Zv = new THREE.Vector3(), Yv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tmp = {};
    const place = (mesh, i, tr, sPos, yoff, sc2) => {
      tr.at(sPos, tmp); const y = this.yMap(tmp.x, tmp.z, tmp.y + yoff);
      X.set(tmp.tx, tmp.ty * this.exag, tmp.tz).normalize(); Zv.crossVectors(X, up).normalize(); Yv.crossVectors(Zv, X);
      m.makeBasis(X, Yv, Zv); q.setFromRotationMatrix(m); p.set(tmp.x, y, tmp.z); s.set(1, sc2, sc2);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    };
    for (const set of this.trainSets) {
      const { tr, trains, arrows } = set; const P = tr.schedule.P;
      for (let i = 0; i < trains.count; i++) place(trains, i, tr, this.sAt(tr, this.clock + (i * P) / trains.count), 1.3, sc);
      trains.instanceMatrix.needsUpdate = true;
      const spacing = tr.length / arrows.count, off = (t * 16) % spacing;
      for (let i = 0; i < arrows.count; i++) place(arrows, i, tr, i * spacing + off, 1.3, Math.max(1, sc * 1.2));
      arrows.instanceMatrix.needsUpdate = true;
    }
  }
  /** Ray -> nearest tunnel point within tolerance (for the depth gauge). */
  pickTube(ray, camDist) {
    if (!this.tubes?.visible) return null; const tol = Math.max(this.R * 1.5, camDist * 0.006) + this.uni.uBoost.value;
    let best = null; const o = ray.origin, d = ray.direction;
    for (const mesh of this.tubes.children) {
      const key = mesh.name.slice(5); const S = mesh.userData.samples;
      for (let i = 0; i < S.length; i++) {
        const p = S[i]; const vx = p.x - o.x, vy = p.ym - o.y, vz = p.z - o.z; const t = vx * d.x + vy * d.y + vz * d.z; if (t < 0) continue;
        const dx = vx - d.x * t, dy = vy - d.y * t, dz = vz - d.z * t; const dist = Math.hypot(dx, dy, dz);
        if (dist < tol && (!best || t < best.t - tol * 0.5 || (Math.abs(t - best.t) < tol * 0.5 && dist < best.dist))) best = { key, i, t, dist, p };
      }
    }
    if (!best) return null; const tr = this.tracks[best.key]; const g = this.ground(best.p.x, best.p.z);
    return { key: best.key, s: best.p.ss, x: best.p.x, z: best.p.z, y: best.p.ym, ground: g, depth: best.p.depth + 1 };
  }
}
