// Effects: pooled GPU-cheap particle system (two Points layers), per-kart emitters, blob shadows,
// and a CSS speed-lines overlay hint.
import * as THREE from "three";

const VERT = `
attribute float size;
attribute float alpha;
attribute vec3 color;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
  vAlpha = alpha; vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
precision mediump float;
varying float vAlpha;
varying vec3 vColor;
uniform float uSoft;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d) * 2.0;
  if (r > 1.0 || vAlpha <= 0.001) discard;
  float a = mix(1.0, 1.0 - r * r, uSoft);
  gl_FragColor = vec4(vColor, vAlpha * a);
}`;

class Layer {
  constructor(scene, n, additive, soft) {
    this.n = n;
    this.head = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1));
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.uniforms = { uScale: { value: 600 }, uSoft: { value: soft ? 1 : 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.geometry = g;
    this.material = m;
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a0, grav, drag) {
    const i = this.head;
    this.head = (i + 1) % this.n;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.grav[i] = grav; this.drag[i] = drag;
    this.size[i] = s0; this.alpha[i] = a0;
  }

  update(dt) {
    const { n, pos, vel, life, maxLife, size, alpha, s0, s1, a0, grav, drag } = this;
    for (let i = 0; i < n; i++) {
      const l = life[i];
      if (l <= 0) { if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; } continue; }
      const nl = l - dt;
      life[i] = nl;
      if (nl <= 0) { alpha[i] = 0; size[i] = 0; continue; }
      const k = i * 3;
      const dr = Math.max(0, 1 - drag[i] * dt);
      vel[k] *= dr; vel[k + 1] = vel[k + 1] * dr - grav[i] * dt; vel[k + 2] *= dr;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      if (pos[k + 1] < 0.05 && grav[i] > 0) { pos[k + 1] = 0.05; vel[k + 1] *= -0.3; }
      const t = 1 - nl / maxLife[i];
      size[i] = s0[i] + (s1[i] - s0[i]) * t;
      alpha[i] = a0[i] * (1 - t) * (t < 0.08 ? t / 0.08 : 1);
    }
    const g = this.geometry.attributes;
    g.position.needsUpdate = true; g.color.needsUpdate = true;
    g.size.needsUpdate = true; g.alpha.needsUpdate = true;
  }

  clear() { this.life.fill(0); this.alpha.fill(0); this.size.fill(0); }
}

const LEVEL_COLORS = [0xffffff, 0x4aa8ff, 0xff9a1f, 0xff3df0];
const _c = new THREE.Color();

function makeBlobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, "rgba(0,0,0,0.65)");
  g.addColorStop(0.6, "rgba(0,0,0,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.soft = new Layer(scene, 1400, false, true);   // smoke, dust, confetti
    this.glow = new Layer(scene, 1800, true, true);    // sparks, flames, sparkle
    this.karts = [];
    this.enabled = true;
    this.lowQuality = false;
    this._blobTex = makeBlobTexture();
    this._blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this._blobMat = new THREE.MeshBasicMaterial({
      map: this._blobTex, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this._speedEl = null;
    this._speedAmt = 0;
    this._makeSpeedOverlay();
  }

  _makeSpeedOverlay() {
    if (typeof document === "undefined") return;
    const el = document.createElement("div");
    el.id = "fx-speed";
    el.style.cssText = "position:fixed;inset:0;pointer-events:none;opacity:0;z-index:1;" +
      "background:repeating-conic-gradient(from 0deg at 50% 52%,rgba(255,255,255,0.0) 0deg,rgba(255,255,255,0.0) 3deg,rgba(255,255,255,0.22) 3.4deg,rgba(255,255,255,0) 4deg,rgba(255,255,255,0) 9deg);" +
      "-webkit-mask-image:radial-gradient(ellipse at 50% 52%,transparent 38%,#000 85%);mask-image:radial-gradient(ellipse at 50% 52%,transparent 38%,#000 85%);" +
      "transition:opacity .12s linear;";
    document.body.appendChild(el);
    this._speedEl = el;
  }

  /** 0..1 intensity of the speed-lines overlay. */
  setSpeedFx(v) {
    v = Math.max(0, Math.min(1, v));
    if (Math.abs(v - this._speedAmt) < 0.03) return;
    this._speedAmt = v;
    if (this._speedEl) this._speedEl.style.opacity = this.enabled ? (v * 0.9).toFixed(2) : "0";
  }

  /** Point-size scale: drawing-buffer height in px / (2*tan(fov/2)). */
  setViewport(heightPx, fovDeg = 70) {
    const s = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.soft.uniforms.uScale.value = s;
    this.glow.uniforms.uScale.value = s;
  }

  setQuality(q) { this.lowQuality = q === "low"; }

  attachToKart(kart) {
    if (this.karts.find((k) => k.kart === kart)) return;
    const blob = new THREE.Mesh(this._blobGeo, this._blobMat);
    blob.scale.set(2.8, 1, 3.6);
    blob.renderOrder = 1;
    this.scene.add(blob);
    this.karts.push({ kart, blob, tSmoke: 0, tSpark: 0, tFlame: 0, tDust: 0 });
  }

  detachKart(kart) {
    const i = this.karts.findIndex((k) => k.kart === kart);
    if (i < 0) return;
    this.scene.remove(this.karts[i].blob);
    this.karts.splice(i, 1);
  }

  detachAll() {
    for (const k of this.karts) this.scene.remove(k.blob);
    this.karts.length = 0;
  }

  clear() { this.soft.clear(); this.glow.clear(); }

  _col(hex, jitter = 0) {
    _c.setHex(hex);
    if (jitter) {
      const j = 1 + (Math.random() - 0.5) * jitter;
      return [Math.min(1, _c.r * j), Math.min(1, _c.g * j), Math.min(1, _c.b * j)];
    }
    return [_c.r, _c.g, _c.b];
  }

  /** burst(pos, kind, opts) kinds: smoke spark boost dust impact confetti sparkle explosion shock */
  burst(pos, kind, opts = {}) {
    if (!this.enabled || !pos) return;
    const x = pos.x, y = pos.y, z = pos.z;
    const R = Math.random;
    const sc = opts.scale || 1;
    let n = opts.count;
    const lowF = this.lowQuality ? 0.5 : 1;
    switch (kind) {
      case "smoke": {
        n = (n || 6) * lowF;
        const [r, g, b] = this._col(opts.color ?? 0xdddddd, 0.2);
        for (let i = 0; i < n; i++)
          this.soft.spawn(x + (R() - 0.5) * 0.4, y + 0.2, z + (R() - 0.5) * 0.4,
            (R() - 0.5) * 2, 0.8 + R() * 1.2, (R() - 0.5) * 2, 0.7 + R() * 0.5, 0.7 * sc, 2.6 * sc, r, g, b, 0.45, -0.3, 1.2);
        break;
      }
      case "dust": {
        n = (n || 5) * lowF;
        const [r, g, b] = this._col(opts.color ?? 0x9b8a5a, 0.3);
        for (let i = 0; i < n; i++)
          this.soft.spawn(x + (R() - 0.5) * 0.5, y + 0.15, z + (R() - 0.5) * 0.5,
            (R() - 0.5) * 3, 0.6 + R() * 1.4, (R() - 0.5) * 3, 0.5 + R() * 0.4, 0.5 * sc, 1.8 * sc, r, g, b, 0.5, 0, 1.5);
        break;
      }
      case "spark": {
        n = (n || 6) * lowF;
        const lv = Math.max(0, Math.min(3, opts.level | 0));
        const [r, g, b] = this._col(opts.color ?? LEVEL_COLORS[lv]);
        for (let i = 0; i < n; i++) {
          const a = R() * Math.PI * 2, s = 2 + R() * 5;
          this.glow.spawn(x, y + 0.2, z, Math.cos(a) * s, 2 + R() * 4, Math.sin(a) * s, 0.25 + R() * 0.25, 0.35 * sc, 0.1 * sc, r, g, b, 1, 14, 1.0);
        }
        break;
      }
      case "impact": {
        n = (n || 14) * lowF;
        for (let i = 0; i < n; i++) {
          const a = R() * Math.PI * 2, s = 3 + R() * 8;
          const hot = R() < 0.5;
          this.glow.spawn(x, y + 0.5, z, Math.cos(a) * s, 1 + R() * 5, Math.sin(a) * s, 0.25 + R() * 0.3, 0.5 * sc, 0.1 * sc,
            1, hot ? 0.9 : 0.55, hot ? 0.5 : 0.1, 1, 12, 1.2);
        }
        this.glow.spawn(x, y + 0.6, z, 0, 0, 0, 0.18, 1.2 * sc, 4 * sc, 1, 0.9, 0.6, 0.9, 0, 0);
        break;
      }
      case "explosion": {
        n = (n || 26) * lowF;
        for (let i = 0; i < n; i++) {
          const a = R() * Math.PI * 2, e = R() * 1.2 - 0.2, s = 3 + R() * 10;
          const hot = R();
          this.glow.spawn(x, y + 0.6, z, Math.cos(a) * s, 2 + e * s * 0.6, Math.sin(a) * s, 0.4 + R() * 0.4, 0.8 * sc, 0.2 * sc,
            1, 0.35 + hot * 0.55, hot * 0.3, 1, 6, 1.4);
        }
        for (let i = 0; i < 8 * lowF; i++)
          this.soft.spawn(x + (R() - 0.5), y + 0.5, z + (R() - 0.5), (R() - 0.5) * 5, 1 + R() * 3, (R() - 0.5) * 5, 0.9 + R() * 0.5, 1 * sc, 4 * sc, 0.25, 0.25, 0.25, 0.6, -0.5, 1.5);
        break;
      }
      case "boost": {
        n = (n || 4) * lowF;
        const dx = opts.dir ? opts.dir.x : 0, dz = opts.dir ? opts.dir.z : 0;
        for (let i = 0; i < n; i++) {
          const hot = R();
          this.glow.spawn(x + (R() - 0.5) * 0.2, y, z + (R() - 0.5) * 0.2, dx * (6 + R() * 5) + (R() - 0.5), (R() - 0.5), dz * (6 + R() * 5) + (R() - 0.5),
            0.18 + R() * 0.15, 0.7 * sc, 0.1 * sc, 1, 0.45 + hot * 0.4, hot < 0.3 ? 1 : 0.1, 0.95, 0, 2);
        }
        break;
      }
      case "sparkle": {
        n = (n || 18) * lowF;
        const [r, g, b] = this._col(opts.color ?? 0xffe066);
        for (let i = 0; i < n; i++) {
          const a = R() * Math.PI * 2, s = 1 + R() * 4;
          this.glow.spawn(x, y + 0.6, z, Math.cos(a) * s, 2 + R() * 4, Math.sin(a) * s, 0.5 + R() * 0.4, 0.45 * sc, 0.05, r, g, b, 1, 6, 0.8);
        }
        break;
      }
      case "shock": {
        n = (n || 40) * lowF;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, s = 14 * sc;
          this.glow.spawn(x, y + 0.5, z, Math.cos(a) * s, 0.5, Math.sin(a) * s, 0.5, 0.9, 0.2, 0.6, 0.8, 1, 1, 0, 0.5);
        }
        break;
      }
      case "confetti": {
        n = (n || 40) * lowF;
        const pal = [0xff4757, 0xffd23f, 0x2ed573, 0x1e90ff, 0xff6bcb, 0xffffff];
        for (let i = 0; i < n; i++) {
          const [r, g, b] = this._col(pal[(R() * pal.length) | 0]);
          const a = R() * Math.PI * 2, s = 2 + R() * 7;
          this.soft.spawn(x + (R() - 0.5) * 6, y + 1 + R() * 3, z + (R() - 0.5) * 6, Math.cos(a) * s, 4 + R() * 8, Math.sin(a) * s, 2 + R() * 1.5, 0.35 * sc, 0.3 * sc, r, g, b, 1, 9, 1.0);
        }
        break;
      }
      default: break;
    }
  }

  update(dt) {
    if (dt > 0.1) dt = 0.1;
    this.soft.update(dt);
    this.glow.update(dt);
    for (const e of this.karts) this._updateKart(e, dt);
  }

  _updateKart(e, dt) {
    const k = e.kart;
    const px = k.position.x, pz = k.position.z;
    e.blob.position.set(px, 0.06, pz);
    e.blob.rotation.y = k.heading || 0;
    if (!this.enabled || !k.mesh || !k.mesh.visible) return;
    const rate = k.isPlayer ? 1 : 0.5;
    const h = k.heading || 0;
    const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
    const speed = Math.abs(k.speed || 0);
    // drift smoke + sparks
    if (k.drifting && speed > 8) {
      e._p = this._tmpPos || (this._tmpPos = new THREE.Vector3());
      e.tSmoke -= dt * rate;
      if (e.tSmoke <= 0) {
        e.tSmoke = 0.035;
        for (const side of [-1, 1]) {
          e._p.set(px - fx * 1.1 + rx * 0.75 * side, 0, pz - fz * 1.1 + rz * 0.75 * side);
          this.burst(e._p, "smoke", { count: 1, scale: 0.9, color: 0xe8e8e8 });
        }
      }
      e.tSpark -= dt * rate;
      if (e.tSpark <= 0) {
        e.tSpark = 0.05;
        const lv = Math.floor(k.driftCharge || 0);
        for (const side of [-1, 1]) {
          e._p.set(px - fx * 1.1 + rx * 0.75 * side, 0.05, pz - fz * 1.1 + rz * 0.75 * side);
          this.burst(e._p, "spark", { count: lv > 0 ? 2 : 1, level: lv });
        }
      }
    }
    // boost flames
    if (k.boostTime > 0) {
      e.tFlame -= dt * rate;
      if (e.tFlame <= 0) {
        e.tFlame = 0.02;
        e._p = this._tmpPos || (this._tmpPos = new THREE.Vector3());
        const dir = this._tmpDir || (this._tmpDir = new THREE.Vector3());
        dir.set(-fx, 0, -fz);
        for (const side of [-0.35, 0.35]) {
          e._p.set(px - fx * 1.5 + rx * side, 0.4, pz - fz * 1.5 + rz * side);
          this.burst(e._p, "boost", { count: 2, dir, scale: 1 });
        }
      }
    }
    // dust off road
    if (k.offRoad && speed > 6) {
      e.tDust -= dt * rate;
      if (e.tDust <= 0) {
        e.tDust = 0.06;
        e._p = this._tmpPos || (this._tmpPos = new THREE.Vector3());
        e._p.set(px - fx * 1.0, 0, pz - fz * 1.0);
        this.burst(e._p, "dust", { count: 2 });
      }
    }
    // spun out
    if (k.spinTime > 0) {
      e.tSmoke -= dt;
      if (e.tSmoke <= 0) {
        e.tSmoke = 0.08;
        e._p = this._tmpPos || (this._tmpPos = new THREE.Vector3());
        e._p.set(px, 0.3, pz);
        this.burst(e._p, "smoke", { count: 2, scale: 1.2, color: 0xbbbbbb });
      }
    }
  }

  dispose() {
    this.detachAll();
    for (const l of [this.soft, this.glow]) {
      this.scene.remove(l.points);
      l.geometry.dispose();
      l.material.dispose();
    }
    this._blobTex.dispose();
    this._blobGeo.dispose();
    this._blobMat.dispose();
    if (this._speedEl) this._speedEl.remove();
  }
}
