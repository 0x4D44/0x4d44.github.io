// ============================================================
// Rivers in the Sea — animated explainers
// Each explainer registers itself in window.OC_ANIMS keyed by its
// canvas id; main.js starts/stops them as they scroll into view.
// All vanilla canvas 2D.
// ============================================================
(function () {
  "use strict";

  window.OC_ANIMS = window.OC_ANIMS || new Map();
  const ANIMS = window.OC_ANIMS;
  const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  function makeAnim(canvasId, draw, opts = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const state = { canvas, raf: null, running: false, t0: 0 };
    function frame(now) {
      if (!state.running) return;
      fit(canvas);
      draw(canvas.getContext("2d"), canvas._w, canvas._h, now / 1000);
      state.raf = requestAnimationFrame(frame);
    }
    const anim = {
      el: canvas,
      start() { if (!state.running) { state.running = true; state.raf = requestAnimationFrame(frame); } },
      stop() { state.running = false; if (state.raf) cancelAnimationFrame(state.raf); state.raf = null; },
    };
    ANIMS.set(canvasId, anim);
    return anim;
  }

  function fit(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(50, r.width), h = canvas.getAttribute("height") ? +canvas.getAttribute("height") : r.height;
    if (canvas._w !== w || canvas._dpr !== dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = h + "px";
      canvas._w = w; canvas._h = h; canvas._dpr = dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function arrow(ctx, x1, y1, x2, y2, headLen) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const hl = headLen || 7;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(a - 0.45), y2 - hl * Math.sin(a - 0.45));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(a + 0.45), y2 - hl * Math.sin(a + 0.45));
    ctx.stroke();
  }

  function label(ctx, text, x, y, opts = {}) {
    ctx.font = (opts.weight || 600) + " " + (opts.size || 11) + "px " + SANS;
    ctx.textAlign = opts.align || "center";
    ctx.textBaseline = opts.baseline || "middle";
    if (opts.halo !== false) {
      ctx.fillStyle = "rgba(6,11,18,0.75)";
      const w = ctx.measureText(text).width;
      const ax = opts.align === "left" ? 0 : opts.align === "right" ? -w : -w / 2;
      ctx.fillRect(x + ax - 3, y - 8, w + 6, 16);
    }
    ctx.fillStyle = opts.color || "#c9d8e6";
    ctx.fillText(text, x, y);
  }

  // ================= 1. CORIOLIS =================
  (function coriolis() {
    const canvas = document.getElementById("coriolis-canvas");
    if (!canvas) return;
    let omega = 0.45;         // rad/s at slider midpoint
    let hemi = 1;             // 1 = NH (counterclockwise disc), -1 = SH
    let puck = null;          // {x,y,vx,vy,trailI:[],trailR:[],theta0}
    let theta = 0;
    let lastT = null;

    function firePuck() {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
      puck = {
        x: 0, y: 0,
        vx: Math.cos(ang) * 60, vy: Math.sin(ang) * 60,
        trailI: [], trailR: [], dead: 0,
      };
    }
    firePuck();

    const slider = document.getElementById("coriolis-speed");
    const out = document.getElementById("coriolis-speed-out");
    const hemiBtn = document.getElementById("coriolis-hemi");
    const fireBtn = document.getElementById("coriolis-fire");
    slider.addEventListener("input", () => {
      omega = slider.value / 100;
      out.textContent = omega < 0.25 ? "slow" : omega < 0.6 ? "medium" : "fast";
    });
    hemiBtn.addEventListener("click", () => {
      hemi = -hemi;
      hemiBtn.textContent = (hemi > 0 ? "Northern" : "Southern") + " hemisphere ⇄";
      firePuck();
    });
    fireBtn.addEventListener("click", firePuck);

    makeAnim("coriolis-canvas", (ctx, w, h, t) => {
      if (lastT === null) lastT = t;
      const dt = clamp(t - lastT, 0, 0.05);
      lastT = t;
      // canvas y points down, so a *negative* canvas angle rate is the
      // counterclockwise spin of the NH seen from above — giving the
      // correct rightward apparent deflection in the rotating panel.
      const om = -omega * 1.6 * hemi;
      theta += om * dt;

      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w / 4 - 24, h / 2 - 52);
      const cxs = [w * 0.25, w * 0.75];
      const cy = h / 2 + 8;

      // physics: straight line in inertial frame
      if (puck) {
        puck.x += puck.vx * dt; puck.y += puck.vy * dt;
        const r = Math.hypot(puck.x, puck.y);
        if (r < R) {
          puck.trailI.push(puck.x, puck.y);
          const c = Math.cos(-theta), s = Math.sin(-theta);
          puck.trailR.push(puck.x * c - puck.y * s, puck.x * s + puck.y * c);
        } else {
          puck.dead += dt;
          if (puck.dead > 1.6) firePuck();
        }
      }

      for (let panel = 0; panel < 2; panel++) {
        const cx = cxs[panel];
        // disc
        ctx.fillStyle = "#0d1b2a";
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#27415c"; ctx.lineWidth = 1.5; ctx.stroke();
        // reference spokes: rotate in panel 0, fixed in panel 1
        ctx.strokeStyle = "rgba(90,130,170,0.3)";
        ctx.lineWidth = 1;
        for (let k = 0; k < 6; k++) {
          const a = k * Math.PI / 3 + (panel === 0 ? theta : 0);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
          ctx.stroke();
        }
        // rim arrows showing spin (panel 0 only)
        if (panel === 0) {
          ctx.strokeStyle = "rgba(140,180,220,0.7)"; ctx.lineWidth = 1.6;
          for (let k = 0; k < 3; k++) {
            const a = k * 2 * Math.PI / 3 + theta;
            const a2 = a + 0.3 * Math.sign(om || 1);
            arrow(ctx,
              cx + (R + 9) * Math.cos(a), cy + (R + 9) * Math.sin(a),
              cx + (R + 9) * Math.cos(a2), cy + (R + 9) * Math.sin(a2), 6);
          }
        }
        // trail
        const trail = panel === 0 ? puck.trailI : puck.trailR;
        if (trail.length > 2) {
          ctx.strokeStyle = panel === 0 ? "#54c8ff" : "#ff9d5c";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx + trail[0], cy + trail[1]);
          for (let i = 2; i < trail.length; i += 2) ctx.lineTo(cx + trail[i], cy + trail[i + 1]);
          ctx.stroke();
          // puck dot
          const n = trail.length;
          ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(cx + trail[n - 2], cy + trail[n - 1], 4, 0, Math.PI * 2); ctx.fill();
        }
        label(ctx, panel === 0 ? "SEEN FROM SPACE — dead straight" : "SEEN FROM THE TURNTABLE — it curves",
          cx, cy - R - 22, { color: panel === 0 ? "#54c8ff" : "#ff9d5c", size: 11.5 });
      }
      label(ctx, hemi > 0
        ? "Northern hemisphere: the deflection is to the RIGHT of the motion"
        : "Southern hemisphere: the deflection is to the LEFT of the motion",
        w / 2, h - 14, { color: "#8fa7bd", weight: 500 });
    });
  })();

  // ================= 2. EKMAN SPIRAL =================
  (function ekman() {
    const canvas = document.getElementById("ekman-canvas");
    if (!canvas) return;
    let windDir = 90 * Math.PI / 180;   // screen angle; 0 = east
    let hemi = 1;
    const slider = document.getElementById("ekman-dir");
    const out = document.getElementById("ekman-dir-out");
    const hemiBtn = document.getElementById("ekman-hemi");
    function updOut() { out.textContent = String(Math.round(slider.value)).padStart(3, "0") + "°"; }
    slider.addEventListener("input", () => { windDir = slider.value * Math.PI / 180 - Math.PI / 2; updOut(); });
    updOut(); windDir = 90 * Math.PI / 180 - Math.PI / 2;
    hemiBtn.addEventListener("click", () => {
      hemi = -hemi;
      hemiBtn.textContent = "Hemisphere: " + (hemi > 0 ? "North" : "South");
    });

    const LAYERS = 9;
    makeAnim("ekman-canvas", (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w * 0.42, topY = 74, dy = (h - 140) / (LAYERS - 1);
      const persp = 0.30;      // ellipse squash

      // depth axis
      ctx.strokeStyle = "#22364b"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, topY - 34); ctx.lineTo(cx, topY + dy * (LAYERS - 1) + 22); ctx.stroke();
      label(ctx, "surface", cx - 8, topY - 6, { align: "right", color: "#64798d", weight: 500 });
      label(ctx, "~100 m", cx - 8, topY + dy * (LAYERS - 1), { align: "right", color: "#64798d", weight: 500 });

      // wind arrow above surface
      const wl = 64;
      ctx.strokeStyle = "#e8eef5"; ctx.lineWidth = 3;
      arrow(ctx, cx - Math.cos(windDir) * wl, (topY - 40) - Math.sin(windDir) * wl * persp,
        cx + Math.cos(windDir) * wl, (topY - 40) + Math.sin(windDir) * wl * persp, 9);
      label(ctx, "WIND", cx + Math.cos(windDir) * (wl + 26), (topY - 40) + Math.sin(windDir) * (wl + 26) * persp, { color: "#e8eef5" });

      // layers
      let sumX = 0, sumY = 0;
      for (let i = 0; i < LAYERS; i++) {
        const y = topY + i * dy;
        // canvas y-down: +angle turns clockwise on screen = right of the wind (NH)
        const dev = (Math.PI / 4 + i * (Math.PI / 5.2)) * hemi; // 45° at surface, spiralling
        const mag = 92 * Math.exp(-i * 0.16);
        const a = windDir + dev;
        sumX += Math.cos(a) * mag; sumY += Math.sin(a) * mag;
        // layer disc
        ctx.strokeStyle = "rgba(70,110,150,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, y, 98, 98 * persp, 0, 0, Math.PI * 2); ctx.stroke();
        // current arrow, with a pulse dot running along it to show motion
        const hue = lerp(28, 205, i / (LAYERS - 1));
        ctx.strokeStyle = `hsl(${hue} 92% ${lerp(68, 58, i / LAYERS)}%)`;
        ctx.lineWidth = 3;
        arrow(ctx, cx, y, cx + Math.cos(a) * mag, y + Math.sin(a) * mag * persp, 9);
        const ph = (t * 0.55 + i * 0.09) % 1;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * mag * ph, y + Math.sin(a) * mag * persp * ph, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // net transport panel
      const nx = w * 0.82, ny = h * 0.44;
      ctx.strokeStyle = "#22364b";
      ctx.beginPath(); ctx.ellipse(nx, ny, 78, 78 * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
      // wind reference (thin)
      ctx.strokeStyle = "rgba(232,238,245,0.5)"; ctx.lineWidth = 1.6;
      arrow(ctx, nx, ny, nx + Math.cos(windDir) * 54, ny + Math.sin(windDir) * 54 * 0.5, 6);
      // net transport = wind + 90° (right in NH; +90° is clockwise on screen)
      const na = windDir + (Math.PI / 2) * hemi;
      const g = ctx.createLinearGradient(nx, ny, nx + Math.cos(na) * 70, ny + Math.sin(na) * 70 * 0.5);
      g.addColorStop(0, "#54c8ff"); g.addColorStop(1, "#8fd8ff");
      ctx.strokeStyle = g; ctx.lineWidth = 5; ctx.lineCap = "round";
      arrow(ctx, nx, ny, nx + Math.cos(na) * 70, ny + Math.sin(na) * 70 * 0.5, 11);
      ctx.lineCap = "butt";
      label(ctx, "NET WATER MOVEMENT", nx, ny + 62, { color: "#54c8ff", size: 11.5 });
      label(ctx, "90° to the wind", nx, ny + 78, { color: "#8fa7bd", weight: 500 });
      label(ctx, "wind", nx + Math.cos(windDir) * 66, ny + Math.sin(windDir) * 66 * 0.5, { color: "#c9d8e6", weight: 500, size: 10 });

      label(ctx, "each layer: slower, and further " + (hemi > 0 ? "right" : "left"), cx, h - 18, { color: "#8fa7bd", weight: 500 });
    });
  })();

  // ================= shared flat-map helpers =================
  function drawFlatLand(ctx, w, h, proj) {
    ctx.fillStyle = "#16222f";
    ctx.strokeStyle = "#2b3f54";
    ctx.lineWidth = 0.7;
    for (const poly of window.OC_LAND) {
      ctx.beginPath();
      for (const ring of poly) {
        // unwrap antimeridian-crossing rings, draw at ±360° too (see field.js)
        const un = window.OC_UNWRAP(ring);
        for (const shift of [-360, 0, 360]) {
          for (let i = 0; i < un.length; i += 2) {
            const [x, y] = proj(un[i] + shift, un[i + 1]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.closePath();
        }
      }
      ctx.fill("evenodd");
      ctx.stroke();
    }
  }

  // ================= 3. GYRES MAP =================
  (function gyres() {
    const canvas = document.getElementById("gyres-canvas");
    if (!canvas) return;
    let active = null;
    const cap = document.getElementById("gyres-cap");
    const controls = document.getElementById("gyres-controls");
    const defaultCap = cap.textContent;

    for (const g of window.OC_GYRES) {
      const b = document.createElement("button");
      b.className = "chip";
      b.textContent = g.name;
      b.addEventListener("click", () => {
        active = active === g ? null : g;
        for (const el of controls.children) el.classList.toggle("on", el === b && !!active);
        cap.innerHTML = active
          ? `<strong style="color:#e8eef5">${g.name}</strong> — turns ${g.turn}. ${g.blurb}`
          : defaultCap;
      });
      controls.appendChild(b);
    }

    makeAnim("gyres-canvas", (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const proj = (lon, lat) => [(lon + 180) / 360 * w, (78 - lat) / 156 * h];
      drawFlatLand(ctx, w, h, proj);

      const activeIds = active ? new Set(active.ids) : null;
      for (const cur of window.OC_CURRENTS) {
        if (cur.id === "transpolar") continue;
        const inGyre = window.OC_GYRES.some(g => g.ids.includes(cur.id));
        const hot = activeIds ? activeIds.has(cur.id) : false;
        const dim = activeIds && !hot;
        const col = cur.type === "warm" ? "#ff9d5c" : cur.type === "cold" ? "#54c8ff" : "#cfc593";
        ctx.strokeStyle = col;
        ctx.globalAlpha = dim ? 0.13 : hot ? 1 : (inGyre ? 0.75 : 0.4);
        ctx.lineWidth = hot ? 3 : Math.min(2.4, 0.9 + cur.speed);
        ctx.setLineDash([7, 6]);
        ctx.lineDashOffset = -t * 22 * Math.max(0.4, cur.speed);
        ctx.beginPath();
        const n = cur.pts.length, m = cur.closed ? n + 1 : n;
        for (let i = 0; i < m; i++) {
          const p = cur.pts[i % n];
          const [x, y] = proj(p[0], p[1]);
          // break at antimeridian jumps
          if (i > 0) {
            const prev = cur.pts[(i - 1) % n];
            if (Math.abs(p[0] - prev[0]) > 180) { ctx.moveTo(x, y); continue; }
          }
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // arrowhead at end
        if (!dim && !cur.closed) {
          const pA = cur.pts[n - 2], pB = cur.pts[n - 1];
          const [x1, y1] = proj(pA[0], pA[1]); const [x2, y2] = proj(pB[0], pB[1]);
          if (Math.abs(pB[0] - pA[0]) < 180) {
            ctx.lineWidth = hot ? 3 : 1.6;
            arrow(ctx, (x1 + x2) / 2, (y1 + y2) / 2, x2, y2, 6);
          }
        }
        ctx.globalAlpha = 1;
      }

      // gyre rotation glyphs
      for (const g of window.OC_GYRES) {
        const [x, y] = proj(g.center[0], g.center[1]);
        const hot = active === g;
        ctx.strokeStyle = hot ? "#ffffff" : "rgba(200,220,240,0.5)";
        ctx.lineWidth = hot ? 2 : 1.3;
        const dir = g.turn === "clockwise" ? 1 : -1;
        const a0 = t * dir * 0.9;
        ctx.beginPath();
        ctx.arc(x, y, 13, a0, a0 + Math.PI * 1.4, dir < 0);
        ctx.stroke();
        const ae = a0 + Math.PI * 1.4 * (dir < 0 ? -1 : 1);
        arrow(ctx, x + 13 * Math.cos(ae - dir * 0.15), y + 13 * Math.sin(ae - dir * 0.15),
          x + 13 * Math.cos(ae), y + 13 * Math.sin(ae), 5);
        label(ctx, g.name.replace(" Gyre", ""), x, y + 27, { size: 10, weight: 600, color: hot ? "#fff" : "#8fa7bd" });
      }
    });

    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      const lon = (e.clientX - r.left) / r.width * 360 - 180;
      const lat = 78 - (e.clientY - r.top) / r.height * 156;
      let best = null, bd = 1e9;
      for (const g of window.OC_GYRES) {
        const d = Math.hypot(lon - g.center[0], (lat - g.center[1]) * 1.6);
        if (d < bd) { bd = d; best = g; }
      }
      if (best && bd < 55) {
        const btn = [...controls.children][window.OC_GYRES.indexOf(best)];
        btn.click();
      }
    });
  })();

  // ================= 4. UPWELLING =================
  (function upwelling() {
    const canvas = document.getElementById("upwell-canvas");
    if (!canvas) return;
    let mode = 1;            // 1 = upwelling, -1 = downwelling
    let s = 1;               // eased state
    const btnEq = document.getElementById("upwell-eq");
    const btnPole = document.getElementById("upwell-pole");
    btnEq.addEventListener("click", () => { mode = 1; btnEq.classList.add("on"); btnPole.classList.remove("on"); });
    btnPole.addEventListener("click", () => { mode = -1; btnPole.classList.add("on"); btnEq.classList.remove("on"); });

    // particles in section coordinates (x: 0..1 offshore→coast, z: 0..1 surface→bottom)
    const N = 260;
    const px = new Float32Array(N), pz = new Float32Array(N);
    for (let i = 0; i < N; i++) { px[i] = Math.random(); pz[i] = Math.random(); }

    function vel(x, z, out) {
      // one circulation cell; sign flips with s
      const X = Math.PI * x, Z = Math.PI * z;
      out.u = -s * Math.cos(X) * Math.sin(Z) * 0.5 - s * 0.25 * Math.sin(Z); // offshore at surface when s>0
      out.w = s * Math.sin(X) * Math.cos(Z) * 0.5;                            // up near coast when s>0
      out.u *= -1; out.w *= -1;
    }

    makeAnim("upwell-canvas", (ctx, w, h, t) => {
      s += (mode - s) * 0.03;
      ctx.clearRect(0, 0, w, h);
      const seaTop = 56, seaBot = h - 24, seaL = 14, seaR = w - 14;
      const sw = seaR - seaL, sh = seaBot - seaTop;
      const coastX = seaL + sw * 0.82; // shoreline position at surface

      // water: temperature bands with isotherms bent near coast
      const img = 90;
      for (let iy = 0; iy < img; iy++) {
        const z = iy / img;
        // effective depth shifted near the coast by the upwelling plume
        const y = seaTop + z * sh;
        const grd = ctx.createLinearGradient(seaL, 0, seaR, 0);
        for (let k = 0; k <= 10; k++) {
          const x = k / 10;
          const plume = Math.exp(-Math.pow((x - 0.74) * 5.5, 2)); // just seaward of the shore
          const zEff = clamp(z + s * 0.6 * plume, 0, 1);
          const warm = 1 - zEff;
          const rr = lerp(14, 232, Math.pow(warm, 2.4));
          const gg = lerp(40, 125, Math.pow(warm, 2.0));
          const bb = lerp(78, 72, Math.pow(warm, 2));
          grd.addColorStop(x, `rgb(${rr | 0},${gg | 0},${bb | 0})`);
        }
        ctx.fillStyle = grd;
        ctx.fillRect(seaL, y, sw, sh / img + 1);
      }

      // land wedge (right)
      ctx.fillStyle = "#1b2836";
      ctx.beginPath();
      ctx.moveTo(coastX, seaTop);
      ctx.lineTo(seaR, seaTop);
      ctx.lineTo(seaR, seaBot);
      ctx.lineTo(coastX - sw * 0.10, seaBot);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#31465c"; ctx.lineWidth = 1.5; ctx.stroke();
      label(ctx, "COAST", (coastX + seaR) / 2, seaTop + 22, { color: "#8fa7bd" });

      // sky
      ctx.fillStyle = "#060b12";
      ctx.fillRect(0, 0, w, seaTop);
      ctx.strokeStyle = "rgba(150,190,230,0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(seaL, seaTop, sw, sh);

      // wind glyph (along-shore = into/out of screen)
      const gx = seaL + 60, gy = 28;
      ctx.strokeStyle = "#e8eef5"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gx, gy, 11, 0, Math.PI * 2); ctx.stroke();
      if (s > 0) { // into the screen: cross
        ctx.beginPath();
        ctx.moveTo(gx - 6, gy - 6); ctx.lineTo(gx + 6, gy + 6);
        ctx.moveTo(gx + 6, gy - 6); ctx.lineTo(gx - 6, gy + 6);
        ctx.stroke();
      } else {   // out of screen: dot
        ctx.fillStyle = "#e8eef5";
        ctx.beginPath(); ctx.arc(gx, gy, 3.4, 0, Math.PI * 2); ctx.fill();
      }
      label(ctx, s > 0 ? "wind: along the coast, equatorward (into the page)" : "wind: along the coast, poleward (out of the page)",
        gx + 18, gy, { align: "left", weight: 500, color: "#c9d8e6" });

      // Ekman transport arrow at surface: offshore when upwelling, onshore when downwelling
      const ea = s > 0 ? -1 : 1;
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.6;
      arrow(ctx, coastX - 40 - (ea > 0 ? 70 : 0), seaTop + 16, coastX - 40 + ea * 70 - (ea > 0 ? 70 : 0), seaTop + 16, 8);
      label(ctx, "Ekman transport", coastX - 75, seaTop + 32, { weight: 600, size: 10.5 });

      // particles
      const o = { u: 0, w: 0 };
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 0; i < N; i++) {
        vel(px[i], pz[i], o);
        px[i] += o.u * 0.004; pz[i] += o.w * 0.004;
        if (px[i] < 0) px[i] = 0.999; if (px[i] > 1) px[i] = 0.001;
        if (pz[i] < 0) pz[i] = 0.02; if (pz[i] > 1) pz[i] = 0.98;
        // stay out of the land wedge (its left edge slopes seaward with depth)
        const xpix = seaL + px[i] * sw, zpix = seaTop + pz[i] * sh;
        if (xpix > coastX - sw * 0.10 * ((zpix - seaTop) / sh)) { px[i] = Math.random() * 0.5; }
        ctx.fillRect(seaL + px[i] * sw - 1, seaTop + pz[i] * sh - 1, 2, 2);
      }

      label(ctx, s > 0.3 ? "cold deep water DRAWN UP near the coast" : s < -0.3 ? "warm surface water FORCED DOWN at the coast" : "…adjusting…",
        seaL + sw * 0.45, seaBot - 18, { color: s > 0 ? "#54c8ff" : "#ff9d5c", size: 12 });
      label(ctx, "0 m", seaL + 20, seaTop + 12, { weight: 600, size: 10, color: "#dce6f0" });
      label(ctx, "~300 m", seaL + 30, seaBot - 12, { weight: 600, size: 10, color: "#dce6f0" });
    });
  })();

  // ================= 5. CONVEYOR CROSS-SECTION =================
  (function conveyor() {
    const canvas = document.getElementById("conveyor-canvas");
    if (!canvas) return;
    let strength = 1;
    const slider = document.getElementById("conveyor-strength");
    const out = document.getElementById("conveyor-strength-out");
    slider.addEventListener("input", () => {
      strength = slider.value / 100;
      out.textContent = slider.value + "%";
    });

    // loop path in unit coords (x: 0=equator → 1=Nordic Seas; z: 0=surface → 1=4km)
    // param u in [0,1)
    function pathPoint(u, out) {
      if (u < 0.42) {          // surface northward
        const k = u / 0.42;
        out.x = k * 0.94; out.z = 0.06 + Math.sin(k * Math.PI) * 0.02;
        out.leg = 0;
      } else if (u < 0.52) {   // sinking
        const k = (u - 0.42) / 0.10;
        out.x = 0.94 + Math.sin(k * Math.PI) * 0.025; out.z = 0.06 + k * 0.80;
        out.leg = 1;
      } else if (u < 0.94) {   // deep southward
        const k = (u - 0.52) / 0.42;
        out.x = 0.94 - k * 0.90; out.z = 0.86 + Math.sin(k * Math.PI) * 0.05;
        out.leg = 2;
      } else {                 // slow rise at the equatorial end
        const k = (u - 0.94) / 0.06;
        out.x = 0.04 - Math.sin(k * Math.PI) * 0.015; out.z = 0.86 - k * 0.80;
        out.leg = 3;
      }
      return out;
    }

    const NP = 90;
    const parcels = new Float32Array(NP);
    for (let i = 0; i < NP; i++) parcels[i] = Math.random();

    makeAnim("conveyor-canvas", (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const L = 52, R = w - 18, T = 40, B = h - 34;
      const X = (x) => L + x * (R - L), Z = (z) => T + z * (B - T);

      // water body: stratified blues
      const g = ctx.createLinearGradient(0, T, 0, B);
      g.addColorStop(0, "#123044"); g.addColorStop(0.35, "#0c2032"); g.addColorStop(1, "#071119");
      ctx.fillStyle = g;
      ctx.fillRect(L, T, R - L, B - T);

      // shelf at the Nordic end
      ctx.fillStyle = "#1b2836";
      ctx.beginPath();
      ctx.moveTo(R, T); ctx.lineTo(R, B); ctx.lineTo(X(0.985), B); ctx.lineTo(X(0.985), Z(0.35)); ctx.lineTo(R, Z(0.2));
      ctx.closePath(); ctx.fill();

      ctx.strokeStyle = "rgba(150,190,230,0.4)"; ctx.lineWidth = 1;
      ctx.strokeRect(L, T, R - L, B - T);

      // axis labels
      label(ctx, "EQUATOR", X(0.03), B + 16, { align: "left", size: 10.5, color: "#64798d", halo: false });
      label(ctx, "NORDIC SEAS · 65°N", X(0.97), B + 16, { align: "right", size: 10.5, color: "#64798d", halo: false });
      label(ctx, "0 km", L - 6, T + 6, { align: "right", size: 10, color: "#64798d", halo: false });
      label(ctx, "2 km", L - 6, Z(0.5), { align: "right", size: 10, color: "#64798d", halo: false });
      label(ctx, "4 km", L - 6, B - 4, { align: "right", size: 10, color: "#64798d", halo: false });

      // winter air heat loss (fades with strength)
      if (strength > 0.15) {
        const n = Math.round(6 * strength);
        for (let i = 0; i < n; i++) {
          const ph = (t * 0.35 + i / n) % 1;
          const x = X(0.80 + (i % 3) * 0.055);
          const y = Z(0.045) - ph * 26;
          ctx.strokeStyle = `rgba(255,157,92,${(1 - ph) * 0.75 * strength})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x, y + 8);
          ctx.quadraticCurveTo(x + 4, y + 4, x, y);
          ctx.quadraticCurveTo(x - 4, y - 4, x, y - 8);
          ctx.stroke();
        }
        label(ctx, "heat given up to winter air", X(0.83), T - 14, { size: 10.5, color: "#ff9d5c" });
      }

      // the loop guide (faint)
      ctx.strokeStyle = "rgba(120,160,200,0.14)";
      ctx.lineWidth = 8; ctx.lineCap = "round";
      ctx.beginPath();
      const gp = { x: 0, z: 0, leg: 0 };
      for (let k = 0; k <= 140; k++) {
        pathPoint(k / 140 % 1, gp);
        if (k === 0) ctx.moveTo(X(gp.x), Z(gp.z)); else ctx.lineTo(X(gp.x), Z(gp.z));
      }
      ctx.stroke(); ctx.lineCap = "butt";

      // parcels
      const p = { x: 0, z: 0, leg: 0 };
      for (let i = 0; i < NP; i++) {
        parcels[i] = (parcels[i] + 0.00085 * (0.12 + strength)) % 1;
        pathPoint(parcels[i], p);
        let col;
        if (p.leg === 0) { // warming colours along surface, cooling near the end
          const k = clamp((p.x - 0.6) / 0.34, 0, 1);
          col = `rgb(${lerp(255, 120, k) | 0},${lerp(157, 190, k) | 0},${lerp(92, 235, k) | 0})`;
        } else if (p.leg === 1) col = "#7cc4f0";
        else col = "#5f74d9";
        ctx.fillStyle = col;
        const rr = p.leg === 0 ? 2.6 : 2.2;
        ctx.beginPath(); ctx.arc(X(p.x), Z(p.z), rr, 0, Math.PI * 2); ctx.fill();
      }

      // captions on the limbs
      label(ctx, "warm, salty surface flow →", X(0.32), Z(0.03) - 6, { size: 11, color: "#ff9d5c" });
      if (strength > 0.25) label(ctx, "SINKING", X(0.945), Z(0.45), { size: 10.5, color: "#7cc4f0" });
      label(ctx, "← North Atlantic Deep Water", X(0.42), Z(0.965), { size: 11, color: "#8f9fe8" });
      if (strength <= 0.25) {
        label(ctx, strength < 0.05 ? "OVERTURNING STOPPED" : "overturning nearly stalled", X(0.5), Z(0.45), { size: 13, color: "#e34948" });
      }
    });
  })();

  // ================= 6. ENSO =================
  (function enso() {
    const canvas = document.getElementById("enso-canvas");
    if (!canvas) return;
    const cap = document.getElementById("enso-cap");
    const states = {
      normal: {
        s: 0,
        cap: "<strong style='color:#e8eef5'>Normal:</strong> trades pile warm water west; rain sits over Indonesia; cold upwelling keeps the east cool. The thermocline tilts steeply.",
      },
      nino: {
        s: 1,
        cap: "<strong style='color:#ffb37a'>El Niño:</strong> the trades falter and warm water sloshes east, taking the rainstorms with it. Peruvian upwelling shuts off. Downstream: drought in Australia/Indonesia, floods in coastal South America, a reshuffled northern jet stream, a warmer year worldwide.",
      },
      nina: {
        s: -1,
        cap: "<strong style='color:#54c8ff'>La Niña:</strong> the trades strengthen; the warm pool squeezes further west and the eastern cold tongue grows. Odds tilt to Australian floods, American south-west drought, and a busier Atlantic hurricane season.",
      },
    };
    let target = states.normal, s = 0;
    const btns = { normal: document.getElementById("enso-normal"), nino: document.getElementById("enso-nino"), nina: document.getElementById("enso-nina") };
    function setState(k) {
      target = states[k];
      for (const [kk, b] of Object.entries(btns)) b.classList.toggle("on", kk === k);
      cap.innerHTML = target.cap;
    }
    for (const k of Object.keys(btns)) btns[k].addEventListener("click", () => setState(k));
    setState("normal");

    makeAnim("enso-canvas", (ctx, w, h, t) => {
      s += (target.s - s) * 0.04;
      ctx.clearRect(0, 0, w, h);
      const L = 46, R = w - 20, T = 96, B = h - 30;
      const skyB = T;

      // ocean box
      ctx.fillStyle = "#0a1826"; ctx.fillRect(L, T, R - L, B - T);

      // warm pool: blob whose centre slides with s
      const cx = lerp(L + (R - L) * 0.22, L + (R - L) * 0.62, clamp(s, 0, 1)) + (s < 0 ? s * 30 : 0);
      const px = clamp(s, -1, 0) * -0.1; // nina squeeze
      const poolW = (R - L) * (0.42 - px * 0.9 + clamp(s, 0, 1) * 0.30);
      const poolD = (B - T) * (0.42 + clamp(s, 0, 1) * 0.10);
      const pg = ctx.createRadialGradient(cx, T, 6, cx, T, poolD * 1.4);
      pg.addColorStop(0, "rgba(255,140,70,0.9)");
      pg.addColorStop(0.55, "rgba(230,110,60,0.55)");
      pg.addColorStop(1, "rgba(230,110,60,0)");
      ctx.save();
      ctx.beginPath(); ctx.rect(L, T, R - L, B - T); ctx.clip();
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.ellipse(cx, T + 4, poolW / 2, poolD, 0, 0, Math.PI * 2); ctx.fill();

      // cold tongue east
      const coldA = 0.75 - clamp(s, 0, 1) * 0.7 + Math.max(0, -s) * 0.25;
      const cg = ctx.createLinearGradient(R, 0, R - (R - L) * 0.45, 0);
      cg.addColorStop(0, `rgba(70,170,235,${coldA})`);
      cg.addColorStop(1, "rgba(70,170,235,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(R, T);
      ctx.lineTo(R, T + (B - T) * 0.5);
      ctx.quadraticCurveTo(R - (R - L) * 0.3, T + 20, R - (R - L) * 0.5, T);
      ctx.closePath(); ctx.fill();

      // thermocline: deep west / shallow east in a normal year; El Niño (s→1)
      // flattens it, La Niña (s→−1) steepens it further
      const nino = clamp(s, 0, 1), nina = Math.max(0, -s);
      const tcW = lerp(0.62, 0.28, nino) + nina * 0.10;   // west depth fraction
      const tcE = lerp(0.10, 0.42, nino) - nina * 0.05;   // east depth fraction
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.setLineDash([7, 6]); ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const x = L + (R - L) * k / 40;
        const f = k / 40;
        const z = lerp(tcW, tcE, f * f * (3 - 2 * f));
        const y = T + (B - T) * (0.25 + z * 0.6);
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
      label(ctx, "thermocline", L + (R - L) * 0.5, T + (B - T) * (0.25 + lerp(tcW, tcE, 0.5) * 0.6) + 14, { size: 10.5, color: "#c9d8e6" });
      ctx.restore();

      // coasts
      ctx.fillStyle = "#1b2836";
      ctx.fillRect(L - 26, T - 40, 26, B - T + 40);
      ctx.fillRect(R, T - 40, 26, B - T + 40);
      label(ctx, "AUSTRALIA / INDONESIA", L + 6, B + 16, { align: "left", size: 10, color: "#64798d", halo: false });
      label(ctx, "SOUTH AMERICA", R - 6, B + 16, { align: "right", size: 10, color: "#64798d", halo: false });

      // trade winds (arrows marching west), strength varies
      const tw = lerp(1.0, -0.15, clamp(s, 0, 1)) + Math.max(0, -s) * 0.5;
      const ny = T - 58;
      for (let i = 0; i < 5; i++) {
        const ph = ((t * 40 * Math.abs(tw) + i * 60) % ((R - L) * 0.9));
        const x = tw >= 0 ? R - 30 - ph : L + 30 + ph;
        ctx.strokeStyle = `rgba(232,238,245,${0.35 + Math.abs(tw) * 0.4})`;
        ctx.lineWidth = 2;
        arrow(ctx, x + (tw >= 0 ? 34 : -34), ny, x, ny, 7);
      }
      label(ctx, Math.abs(tw) < 0.3 ? "trade winds: collapsed" : tw > 1.2 ? "trade winds: strengthened" : "trade winds: steady",
        (L + R) / 2, ny - 16, { size: 11, color: "#c9d8e6" });

      // rain cloud over warm pool
      const rainX = clamp(cx, L + 30, R - 40);
      ctx.font = "26px " + SANS; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🌧", rainX, T - 26);
      label(ctx, "deep rainstorms follow the warm pool", rainX, T - 50, { size: 10.5, color: "#8fa7bd" });

      // upwelling arrows at east
      const up = 0.9 - clamp(s, 0, 1) * 0.85 + Math.max(0, -s) * 0.2;
      if (up > 0.15) {
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.5 + i / 3) % 1;
          ctx.strokeStyle = `rgba(84,200,255,${(1 - ph) * up})`;
          ctx.lineWidth = 2;
          const x = R - 26 - i * 16, y = B - 20 - ph * (B - T - 70);
          arrow(ctx, x, y + 16, x, y, 6);
        }
        label(ctx, "upwelling", R - 46, B - 14, { size: 10, color: "#54c8ff" });
      } else {
        label(ctx, "upwelling off", R - 52, B - 14, { size: 10, color: "#e34948" });
      }
    });
  })();

  // ================= 7. FRANKLIN'S RACE =================
  (function route() {
    const canvas = document.getElementById("route-canvas");
    if (!canvas) return;
    const statusEl = document.getElementById("route-status");
    const goBtn = document.getElementById("route-go");
    // domain: lon -82..2, lat 24..58
    const LON0 = -82, LON1 = 2, LAT0 = 24, LAT1 = 58;
    const NY = { lon: -73.6, lat: 40.4 }, FAL = { lon: -5.1, lat: 50.1 };

    // stream-rider waypoints: out to the stream axis, along it, then to Falmouth
    const smartWp = [
      NY, { lon: -71.5, lat: 39.2 }, { lon: -66, lat: 38.7 }, { lon: -59, lat: 39.4 },
      { lon: -51, lat: 41.3 }, { lon: -44, lat: 45.3 }, { lon: -36, lat: 48.4 },
      { lon: -28, lat: 50.6 }, { lon: -20, lat: 52 }, { lon: -12, lat: 52 }, FAL,
    ];
    const BASE = 3.1; // still-water speed m/s (~6 kn packet average)
    let ships = null, done = false, raceT = 0;

    function reset() {
      ships = [
        { name: "Stream rider", wp: smartWp, i: 0, lon: NY.lon, lat: NY.lat, days: 0, trail: [NY.lon, NY.lat], col: "#ff9d5c", useCur: 1, done: false },
        { name: "Rhumb-liner", wp: [NY, FAL], i: 0, lon: NY.lon, lat: NY.lat, days: 0, trail: [NY.lon, NY.lat], col: "#8fa7bd", useCur: 1, done: false },
      ];
      done = false;
      statusEl.textContent = "";
    }
    reset();
    goBtn.addEventListener("click", () => { reset(); });

    makeAnim("route-canvas", (ctx, w, h, t) => {
      ctx.clearRect(0, 0, w, h);
      const proj = (lon, lat) => [(lon - LON0) / (LON1 - LON0) * w, (LAT1 - lat) / (LAT1 - LAT0) * h];
      // land
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      drawFlatLand(ctx, w, h, proj);
      // gulf stream ribbon (from data)
      const F = window.OC_FIELD;
      const streamIds = ["gulf", "nac", "caribbean"];
      for (const cur of window.OC_CURRENTS) {
        if (!streamIds.includes(cur.id)) continue;
        ctx.strokeStyle = "rgba(255,157,92,0.35)";
        ctx.lineWidth = 12; ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i < cur.pts.length; i++) {
          const [x, y] = proj(cur.pts[i][0], cur.pts[i][1]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.lineCap = "butt";
      label(ctx, "the Gulf Stream & North Atlantic Current", ...proj(-45, 45.5), { size: 10.5, color: "#ffb37a" });

      // ships
      const smp = { u: 0, v: 0, t: 0 };
      let allDone = true;
      for (const sh of ships) {
        if (!sh.done) {
          allDone = false;
          const tgt = sh.wp[sh.i + 1];
          const cosl = Math.max(0.2, Math.cos(sh.lat * Math.PI / 180));
          let dx = (tgt.lon - sh.lon) * cosl, dy = tgt.lat - sh.lat;
          const dist = Math.hypot(dx, dy);
          // capture radius must exceed one integration step, or a cross-current
          // can make the ship orbit a waypoint forever
          if (dist < 0.8) {
            sh.i++;
            if (sh.i >= sh.wp.length - 1) { sh.done = true; }
          } else {
            dx /= dist; dy /= dist;
            F.sampleSurface(sh.lon, sh.lat, smp);
            const dtDays = 0.12;
            const mPerDay = 86400 * dtDays;
            const ve = dx * BASE + smp.u * sh.useCur;
            const vn = dy * BASE + smp.v * sh.useCur;
            sh.lon += ve * mPerDay / (111320 * cosl);
            sh.lat += vn * mPerDay / 111320;
            sh.days += dtDays;
            sh.trail.push(sh.lon, sh.lat);
          }
        }
        // draw trail
        ctx.strokeStyle = sh.col; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < sh.trail.length; i += 2) {
          const [x, y] = proj(sh.trail[i], sh.trail[i + 1]);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        const [sx, sy] = proj(sh.lon, sh.lat);
        ctx.fillStyle = sh.col;
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#0b141f"; ctx.lineWidth = 1.5; ctx.stroke();
        const lyOff = sh.name === "Rhumb-liner" ? 18 : -14; // keep finish labels apart
        label(ctx, `${sh.name} — day ${sh.days.toFixed(0)}`, sx, sy + lyOff, { size: 10.5, color: sh.col });
      }
      // ports
      for (const [p, name] of [[NY, "New York"], [FAL, "Falmouth"]]) {
        const [x, y] = proj(p.lon, p.lat);
        ctx.fillStyle = "#e8eef5";
        ctx.beginPath(); ctx.arc(x, y, 3.4, 0, Math.PI * 2); ctx.fill();
        label(ctx, name, x, y + 14, { size: 10.5 });
      }
      ctx.restore();

      if (allDone && !done) {
        done = true;
        const d0 = ships[0].days, d1 = ships[1].days;
        statusEl.textContent = `The stream rider arrives in ${d0.toFixed(0)} days — ${(d1 - d0).toFixed(1)} days ahead. Franklin's captains saved about two weeks westbound by the same trick in reverse (leaving the stream).`;
        statusEl.style.color = "#ffb37a";
      }
    });
  })();

})();
