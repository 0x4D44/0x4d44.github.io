// ============================================================
// Rivers in the Sea — orthographic globe with flowing particles
// Vanilla canvas 2D. Three stacked layers per instance:
//   base   — sphere, land, graticule (redrawn when view changes)
//   trails — particle flow trails (persistent, faded each frame)
//   ui     — labels, markers, drifters, hover ring (redrawn each frame)
// ============================================================
(function () {
  "use strict";

  const DEG = Math.PI / 180;
  const COLORS = window.OC_COLORS;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // tint (-1..1) → colour, per regime
  function tintColor(t, deepMode, alpha) {
    let r, g, b;
    if (deepMode) {
      if (t < 0) { // deep water: violet
        r = 143 + t * 20; g = 127 + t * 40; b = 232;
      } else {     // warm return: amber
        r = lerp(160, 255, t); g = lerp(140, 179, t); b = lerp(220, 122, t);
      }
    } else {
      // cyan (cold) → sand (neutral/mixed) → coral (warm)
      if (t < 0) { const k = -t; r = lerp(185, 84, k); g = lerp(178, 200, k); b = lerp(140, 255, k); }
      else       { const k = t;  r = lerp(185, 255, k); g = lerp(178, 157, k); b = lerp(140, 92, k); }
    }
    return `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
  }

  class OCGlobe {
    constructor(container, opts = {}) {
      this.el = container;
      this.opts = Object.assign({
        mode: "hero",          // "hero" | "drift"
        particles: 4200,
        autoRotate: true,
        labels: true,
        interactive: true,
        initial: { lon: -35, lat: 32 },
        zoom: 1.0,
      }, opts);

      this.lam = -this.opts.initial.lon;   // view rotation (deg)
      this.phi = -this.opts.initial.lat;
      this.zoom = this.opts.zoom;
      this.vlam = 0; this.vphi = 0;        // inertia
      this.deepMode = false;
      this.paused = false;
      this.speedMult = 1;
      this.showLabels = this.opts.labels;
      this.lastInteract = performance.now() - 10000;
      this.hover = null;
      this.pinned = null;
      this.drifters = [];
      this.flyTarget = null;
      this._dirtyBase = true;
      this._raf = null;

      this._makeCanvases();
      this._initParticles();
      if (this.opts.interactive) this._bindInput();
      this._resizeObs = new ResizeObserver(() => this._resize());
      this._resizeObs.observe(this.el);
      this._resize();

      this.running = false;
      this._tick = this._tick.bind(this);
    }

    start() { if (!this.running) { this.running = true; this._last = performance.now(); this._raf = requestAnimationFrame(this._tick); } }
    stop() { this.running = false; if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }

    _makeCanvases() {
      this.el.classList.add("oc-globe");
      this.base = document.createElement("canvas");
      this.trails = document.createElement("canvas");
      this.ui = document.createElement("canvas");
      for (const c of [this.base, this.trails, this.ui]) {
        c.style.position = "absolute"; c.style.inset = "0";
        c.style.width = "100%"; c.style.height = "100%";
        this.el.appendChild(c);
      }
      this.ui.style.touchAction = "none";
    }

    _resize() {
      const r = this.el.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = r.width; this.h = r.height;
      for (const c of [this.base, this.trails, this.ui]) {
        c.width = Math.round(r.width * this.dpr);
        c.height = Math.round(r.height * this.dpr);
      }
      this.cx = this.w / 2; this.cy = this.h / 2;
      this.baseR = Math.min(this.w, this.h) * 0.46;
      this._dirtyBase = true;
      const tc = this.trails.getContext("2d");
      tc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      tc.clearRect(0, 0, this.w, this.h);
    }

    get R() { return this.baseR * this.zoom; }

    // ---------- projection ----------
    project(lon, lat, out) {
      const lam = (lon + this.lam) * DEG;
      const phi = lat * DEG, phi0 = -this.phi * DEG;
      const cosphi = Math.cos(phi);
      const x3 = cosphi * Math.sin(lam);
      const y3 = Math.sin(phi);
      const z3 = cosphi * Math.cos(lam);
      // rotate about x-axis by phi0
      const y2 = y3 * Math.cos(phi0) - z3 * Math.sin(phi0);
      const z2 = y3 * Math.sin(phi0) + z3 * Math.cos(phi0);
      out.x = this.cx + this.R * x3;
      out.y = this.cy - this.R * y2;
      out.z = z2;               // >0 = front hemisphere
      return out;
    }

    invert(x, y) {
      const X = (x - this.cx) / this.R, Y = -(y - this.cy) / this.R;
      const r2 = X * X + Y * Y;
      if (r2 > 1) return null;
      const Z = Math.sqrt(1 - r2);
      const phi0 = -this.phi * DEG;
      // un-rotate about x-axis
      const y3 = Y * Math.cos(phi0) + Z * Math.sin(phi0);
      const z3 = -Y * Math.sin(phi0) + Z * Math.cos(phi0);
      const lat = Math.asin(clamp(y3, -1, 1)) / DEG;
      let lon = Math.atan2(X, z3) / DEG - this.lam;
      while (lon > 180) lon -= 360;
      while (lon < -180) lon += 360;
      return { lon, lat };
    }

    // ---------- input ----------
    _bindInput() {
      const el = this.ui;
      let dragging = false, lastX = 0, lastY = 0, moved = 0;
      const pointers = new Map();
      let pinchD = 0;

      el.style.cursor = "grab";
      el.addEventListener("pointerdown", (e) => {
        pointers.set(e.pointerId, e);
        if (pointers.size === 1) {
          dragging = true; moved = 0;
          lastX = e.clientX; lastY = e.clientY;
          el.setPointerCapture(e.pointerId);
          el.style.cursor = "grabbing";
        } else if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinchD = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        }
        this.lastInteract = performance.now();
        this.flyTarget = null;
      });
      el.addEventListener("pointermove", (e) => {
        if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e);
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          if (pinchD > 0) this.setZoom(this.zoom * d / pinchD);
          pinchD = d;
          this.lastInteract = performance.now();
          return;
        }
        if (dragging) {
          const dx = e.clientX - lastX, dy = e.clientY - lastY;
          moved += Math.abs(dx) + Math.abs(dy);
          lastX = e.clientX; lastY = e.clientY;
          const k = 0.22 / this.zoom;
          this.lam += dx * k;
          this.phi = clamp(this.phi + dy * k, -85, 85);
          this.vlam = dx * k; this.vphi = dy * k;
          this._dirtyBase = true;
          this.lastInteract = performance.now();
        } else {
          this._updateHover(e);
        }
      });
      const up = (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchD = 0;
        if (pointers.size === 0) {
          if (dragging && moved < 6) this._click(e);
          dragging = false;
          el.style.cursor = "grab";
        }
      };
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("pointerleave", () => { if (!dragging) this._setHover(null); });
      el.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
        this.lastInteract = performance.now();
      }, { passive: false });
    }

    setZoom(z) {
      this.zoom = clamp(z, 0.85, 3.2);
      this._dirtyBase = true;
    }

    _click(e) {
      const rect = this.ui.getBoundingClientRect();
      const p = this.invert(e.clientX - rect.left, e.clientY - rect.top);
      if (!p) return;
      if (this.opts.mode === "drift") {
        if (!window.OC_FIELD.isLand(p.lon, p.lat)) {
          this.addDrifter(p.lon, p.lat, "Your drifter");
          if (this.opts.onDrifterAdded) this.opts.onDrifterAdded(p);
        }
        return;
      }
      // hero: pin/unpin nearest current card
      const hit = this._nearestCurrent(p.lon, p.lat);
      this.pinned = (hit && (!this.pinned || this.pinned.id !== hit.id)) ? hit : null;
      if (this.opts.onSelect) this.opts.onSelect(this.pinned);
    }

    _updateHover(e) {
      const rect = this.ui.getBoundingClientRect();
      const p = this.invert(e.clientX - rect.left, e.clientY - rect.top);
      this._setHover(p ? this._nearestCurrent(p.lon, p.lat) : null);
    }

    _setHover(cur) {
      if (this.hover === cur) return;
      this.hover = cur;
      this.ui.style.cursor = cur ? "pointer" : "grab";
      if (this.opts.onHover) this.opts.onHover(cur);
    }

    _nearestCurrent(lon, lat) {
      const list = this.deepMode ? window.OC_DEEP : window.OC_CURRENTS;
      let best = null, bestD = 1e9;
      for (const cur of list) {
        const n = cur.pts.length, segs = cur.closed ? n : n - 1;
        for (let s = 0; s < segs; s++) {
          const a = cur.pts[s], b = cur.pts[(s + 1) % n];
          const cosm = Math.max(0.08, Math.cos((a[1] + b[1]) / 2 * DEG));
          let dl = b[0] - a[0]; while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
          const sx = dl * cosm, sy = b[1] - a[1];
          const slen = Math.hypot(sx, sy) || 1e-9;
          let rl = lon - a[0]; while (rl > 180) rl -= 360; while (rl < -180) rl += 360;
          const rx = rl * cosm, ry = lat - a[1];
          const t = clamp((rx * sx + ry * sy) / (slen * slen), 0, 1);
          const d = Math.hypot(rx - t * sx, ry - t * sy);
          if (d < bestD) { bestD = d; best = cur; }
        }
      }
      return (best && bestD < Math.max(2.2, best.width * 0.9)) ? best : null;
    }

    // ---------- particles ----------
    _initParticles() {
      const n = this.opts.particles;
      this.px = new Float32Array(n);   // lon
      this.py = new Float32Array(n);   // lat
      this.page = new Float32Array(n);
      this.pmax = new Float32Array(n);
      this.sx = new Float32Array(n);   // last screen pos
      this.sy = new Float32Array(n);
      this.sv = new Uint8Array(n);     // last screen valid
      for (let i = 0; i < n; i++) this._spawn(i);
    }

    _spawn(i) {
      const F = window.OC_FIELD;
      const spawn = this.deepMode ? F.deepSpawn : F.surfaceSpawn;
      const o = { lon: 0, lat: 0 };
      if (Math.random() < (this.deepMode ? 0.9 : 0.72) && spawn.length) {
        F.cellToLonLat(spawn[(Math.random() * spawn.length) | 0], o);
      } else {
        let tries = 0;
        do {
          o.lon = Math.random() * 360 - 180;
          o.lat = Math.asin(Math.random() * 2 - 1) / DEG; // area-uniform
        } while (F.isLand(o.lon, o.lat) && ++tries < 20);
      }
      this.px[i] = o.lon; this.py[i] = o.lat;
      this.page[i] = 0;
      this.pmax[i] = 60 + Math.random() * 160;
      this.sv[i] = 0;
    }

    // ---------- render ----------
    _drawBase() {
      const ctx = this.base.getContext("2d");
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const R = this.R;

      // atmosphere glow
      const glow = ctx.createRadialGradient(this.cx, this.cy, R * 0.95, this.cx, this.cy, R * 1.12);
      glow.addColorStop(0, "rgba(80,150,220,0.18)");
      glow.addColorStop(1, "rgba(80,150,220,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, R * 1.12, 0, Math.PI * 2); ctx.fill();

      // ocean sphere
      const og = ctx.createRadialGradient(this.cx - R * 0.35, this.cy - R * 0.4, R * 0.1, this.cx, this.cy, R);
      og.addColorStop(0, "#10202f");
      og.addColorStop(0.65, "#0a1622");
      og.addColorStop(1, "#060d15");
      ctx.fillStyle = og;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2); ctx.fill();

      // graticule
      ctx.save();
      ctx.beginPath(); ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      const P = { x: 0, y: 0, z: 0 };
      for (let lat = -75; lat <= 75; lat += 15) {
        ctx.beginPath(); let pen = false;
        for (let lon = -180; lon <= 180; lon += 3) {
          this.project(lon, lat, P);
          if (P.z > 0.01) { if (!pen) { ctx.moveTo(P.x, P.y); pen = true; } else ctx.lineTo(P.x, P.y); }
          else pen = false;
        }
        ctx.stroke();
      }
      for (let lon = -180; lon < 180; lon += 15) {
        ctx.beginPath(); let pen = false;
        for (let lat = -90; lat <= 90; lat += 3) {
          this.project(lon, lat, P);
          if (P.z > 0.01) { if (!pen) { ctx.moveTo(P.x, P.y); pen = true; } else ctx.lineTo(P.x, P.y); }
          else pen = false;
        }
        ctx.stroke();
      }

      // land: fill with horizon clamping, stroke only front segments
      for (const poly of window.OC_LAND) {
        let anyVisible = false;
        outer: for (const ring of poly) {
          for (let i = 0; i < ring.length; i += 2) {
            this.project(ring[i], ring[i + 1], P);
            if (P.z > 0) { anyVisible = true; break outer; }
          }
        }
        if (!anyVisible) continue;
        ctx.beginPath();
        for (const ring of poly) {
          for (let i = 0; i < ring.length; i += 2) {
            this.project(ring[i], ring[i + 1], P);
            let x = P.x, y = P.y;
            if (P.z <= 0) { // clamp to horizon circle
              const dx = x - this.cx, dy = y - this.cy;
              const d = Math.hypot(dx, dy) || 1;
              x = this.cx + dx / d * R; y = this.cy + dy / d * R;
            }
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
        }
        ctx.fillStyle = COLORS.land;
        ctx.fill("evenodd");
      }
      // coastlines (front only)
      ctx.strokeStyle = COLORS.landEdge;
      ctx.lineWidth = 0.8;
      for (const poly of window.OC_LAND) {
        for (const ring of poly) {
          ctx.beginPath(); let pen = false;
          for (let i = 0; i < ring.length; i += 2) {
            this.project(ring[i], ring[i + 1], P);
            if (P.z > 0.005) { if (!pen) { ctx.moveTo(P.x, P.y); pen = true; } else ctx.lineTo(P.x, P.y); }
            else pen = false;
          }
          ctx.stroke();
        }
      }
      ctx.restore();

      // limb
      ctx.strokeStyle = "rgba(120,180,235,0.25)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(this.cx, this.cy, R, 0, Math.PI * 2); ctx.stroke();
    }

    _stepParticles(rotating) {
      const F = window.OC_FIELD;
      const sampler = this.deepMode ? F.sampleDeep : F.sampleSurface;
      const ctx = this.trails.getContext("2d");
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      // fade old trails
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,${rotating ? 0.30 : (this.deepMode ? 0.045 : 0.075)})`;
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.globalCompositeOperation = "lighter";

      if (this.paused) { ctx.globalCompositeOperation = "source-over"; return; }

      const dtDays = (this.deepMode ? 6 : 1.4) * this.speedMult;
      const P = { x: 0, y: 0, z: 0 };
      const o = { lon: 0, lat: 0, speed: 0, t: 0 };
      const n = this.px.length;
      const R = this.R;
      const maxSeg = R * 0.12;
      ctx.lineWidth = this.deepMode ? 1.7 : 1.25;
      ctx.lineCap = "round";

      for (let i = 0; i < n; i++) {
        const p = { lon: this.px[i], lat: this.py[i] };
        const ok = F.advect(p, sampler, dtDays, o);
        this.page[i]++;
        const slow = o.speed < (this.deepMode ? 0.02 : 0.012);
        if (!ok || this.page[i] > this.pmax[i] || (slow && Math.random() < 0.05)) {
          this._spawn(i);
          continue;
        }
        this.px[i] = o.lon; this.py[i] = o.lat;
        this.project(o.lon, o.lat, P);
        if (P.z > 0.02) {
          if (this.sv[i]) {
            const dx = P.x - this.sx[i], dy = P.y - this.sy[i];
            if (dx * dx + dy * dy < maxSeg * maxSeg) {
              const sp = Math.min(1, o.speed / 1.1);
              const alpha = (this.deepMode ? 0.32 : 0.22) + sp * 0.5;
              ctx.strokeStyle = tintColor(clamp(o.t, -1, 1), this.deepMode, alpha);
              ctx.beginPath();
              ctx.moveTo(this.sx[i], this.sy[i]);
              ctx.lineTo(P.x, P.y);
              ctx.stroke();
            }
          }
          this.sx[i] = P.x; this.sy[i] = P.y; this.sv[i] = 1;
        } else {
          this.sv[i] = 0;
        }
      }
      ctx.globalCompositeOperation = "source-over";
    }

    _drawUI() {
      const ctx = this.ui.getContext("2d");
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      const P = { x: 0, y: 0, z: 0 };

      // deep-mode markers: sinks and rises
      if (this.deepMode) {
        const t = performance.now() / 1000;
        for (const s of window.OC_SINKS) {
          this.project(s.lon, s.lat, P);
          if (P.z < 0.05) continue;
          const pulse = (t % 2) / 2;
          ctx.strokeStyle = `rgba(140,190,255,${0.7 * (1 - pulse)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(P.x, P.y, 4 + pulse * 14, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "rgba(170,210,255,0.9)";
          ctx.font = "600 10px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("▼ sinking", P.x, P.y - 12);
        }
        for (const s of window.OC_RISES) {
          this.project(s.lon, s.lat, P);
          if (P.z < 0.05) continue;
          const pulse = ((t + 1) % 2.6) / 2.6;
          ctx.strokeStyle = `rgba(255,190,130,${0.6 * (1 - pulse)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(P.x, P.y, 4 + pulse * 12, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "rgba(255,205,160,0.9)";
          ctx.font = "600 10px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("▲ rising", P.x, P.y - 12);
        }
      }

      // labels
      if (this.showLabels) {
        const list = this.deepMode ? window.OC_DEEP : window.OC_CURRENTS;
        ctx.font = "600 10.5px system-ui, sans-serif";
        ctx.textAlign = "center";
        const placed = [];
        for (const cur of list) {
          this.project(cur.label[0], cur.label[1], P);
          if (P.z < 0.18) continue;
          if (this.labelAvoidY && P.y < this.labelAvoidY) continue; // keep clear of the hero titles until first interaction
          const wpx = ctx.measureText(cur.name).width;
          const box = { x: P.x - wpx / 2 - 4, y: P.y - 9, w: wpx + 8, h: 14 };
          let collide = false;
          for (const b of placed) {
            if (box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y) { collide = true; break; }
          }
          if (collide) continue;
          placed.push(box);
          const hot = (this.hover && this.hover.id === cur.id) || (this.pinned && this.pinned.id === cur.id);
          ctx.fillStyle = "rgba(5,10,16,0.55)";
          ctx.fillRect(box.x, box.y, box.w, box.h);
          ctx.fillStyle = hot ? "#ffffff" : "rgba(200,220,240,0.78)";
          ctx.fillText(cur.name, P.x, P.y + 2.5);
        }
      }

      // hover/pin highlight: redraw the current's path
      const target = this.pinned || this.hover;
      if (target) {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = Math.max(2, target.width * this.R / 90);
        ctx.lineCap = "round";
        ctx.setLineDash([2, 7]);
        ctx.beginPath();
        let pen = false;
        const n = target.pts.length, m = target.closed ? n + 1 : n;
        for (let i = 0; i < m; i++) {
          const pt = target.pts[i % n];
          this.project(pt[0], pt[1], P);
          if (P.z > 0.01) { if (!pen) { ctx.moveTo(P.x, P.y); pen = true; } else ctx.lineTo(P.x, P.y); }
          else pen = false;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // drifters
      for (const d of this.drifters) {
        // track
        if (d.track.length > 1) {
          ctx.strokeStyle = d.color;
          ctx.lineWidth = 1.6;
          ctx.setLineDash([1, 5]);
          ctx.beginPath();
          let pen = false;
          for (let i = 0; i < d.track.length; i += 2) {
            this.project(d.track[i], d.track[i + 1], P);
            if (P.z > 0.01) { if (!pen) { ctx.moveTo(P.x, P.y); pen = true; } else ctx.lineTo(P.x, P.y); }
            else pen = false;
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        this.project(d.lon, d.lat, P);
        if (P.z > 0.01) {
          ctx.fillStyle = d.color;
          ctx.beginPath(); ctx.arc(P.x, P.y, 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
    }

    // ---------- drifters ----------
    addDrifter(lon, lat, name) {
      const palette = ["#ffd166", "#7ae0c3", "#ff9d5c", "#c3a1ff", "#54c8ff", "#ff7d9c"];
      const d = {
        lon, lat, name: name || "Drifter",
        color: palette[this.drifters.length % palette.length],
        track: [lon, lat], days: 0, dist: 0, stuck: 0,
      };
      this.drifters.push(d);
      if (this.drifters.length > 6) this.drifters.shift();
      return d;
    }
    clearDrifters() { this.drifters.length = 0; if (this.opts.onDrift) this.opts.onDrift(null); }

    _stepDrifters() {
      const F = window.OC_FIELD;
      const o = { lon: 0, lat: 0, speed: 0, t: 0 };
      const dtDays = 2 * this.speedMult;
      for (const d of this.drifters) {
        if (d.stuck > 200) continue;
        const ok = F.advect({ lon: d.lon, lat: d.lat }, F.sampleSurface, dtDays, o);
        if (!ok) { d.stuck++; continue; }
        // distance in km (rough)
        const cosl = Math.cos(d.lat * DEG);
        let dl = o.lon - d.lon; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
        d.dist += Math.hypot(dl * cosl, o.lat - d.lat) * 111.32;
        d.lon = o.lon; d.lat = o.lat; d.days += dtDays;
        d.track.push(d.lon, d.lat);
        if (d.track.length > 3000) d.track.splice(0, 2);
        d.stuck = o.speed < 0.01 ? d.stuck + 1 : 0;
      }
      if (this.opts.onDrift && this.drifters.length) {
        this.opts.onDrift(this.drifters[this.drifters.length - 1]);
      }
      // follow the newest drifter
      if (this.opts.mode === "drift" && this.followDrifter !== false && this.drifters.length) {
        const d = this.drifters[this.drifters.length - 1];
        const tgtLam = -d.lon, tgtPhi = -clamp(d.lat, -60, 60);
        let dl = tgtLam - this.lam; while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
        if (Math.abs(dl) > 0.5 || Math.abs(tgtPhi - this.phi) > 0.5) {
          this.lam += dl * 0.04;
          this.phi += (tgtPhi - this.phi) * 0.04;
          this._dirtyBase = true;
        }
      }
    }

    flyTo(lon, lat, zoom) {
      this.flyTarget = { lam: -lon, phi: -clamp(lat, -80, 80), zoom: zoom || this.zoom };
    }

    setDeepMode(on) {
      if (this.deepMode === on) return;
      this.deepMode = on;
      this.pinned = null; this.hover = null;
      const n = this.px.length;
      for (let i = 0; i < n; i++) this._spawn(i);
      const tc = this.trails.getContext("2d");
      tc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      tc.clearRect(0, 0, this.w, this.h);
      if (this.opts.onSelect) this.opts.onSelect(null);
    }

    // ---------- main loop ----------
    _tick(now) {
      if (!this.running) return;
      const dt = Math.min(50, now - (this._last || now));
      this._last = now;

      // fly-to easing
      if (this.flyTarget) {
        const f = this.flyTarget;
        let dl = f.lam - this.lam; while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
        this.lam += dl * 0.08;
        this.phi += (f.phi - this.phi) * 0.08;
        this.zoom += (f.zoom - this.zoom) * 0.08;
        this._dirtyBase = true;
        if (Math.abs(dl) < 0.2 && Math.abs(f.phi - this.phi) < 0.2 && Math.abs(f.zoom - this.zoom) < 0.01) this.flyTarget = null;
      }

      // inertia + auto-rotate
      const idle = now - this.lastInteract > 4000;
      if (Math.abs(this.vlam) > 0.005 || Math.abs(this.vphi) > 0.005) {
        this.lam += this.vlam; this.phi = clamp(this.phi + this.vphi, -85, 85);
        this.vlam *= 0.94; this.vphi *= 0.94;
        this._dirtyBase = true;
      } else if (this.opts.autoRotate && idle && !this.paused && !this.flyTarget && this.opts.mode !== "drift") {
        this.lam += 0.0045 * dt;
        this._dirtyBase = true;
      }

      const rotating = this._dirtyBase;
      if (this._dirtyBase) { this._drawBase(); this._dirtyBase = false; }
      this._stepParticles(rotating);
      if (this.opts.mode === "drift" && !this.paused) this._stepDrifters();
      this._drawUI();

      this._raf = requestAnimationFrame(this._tick);
    }

    destroy() {
      this.stop();
      this._resizeObs.disconnect();
      this.el.innerHTML = "";
    }
  }

  window.OCGlobe = OCGlobe;
})();
