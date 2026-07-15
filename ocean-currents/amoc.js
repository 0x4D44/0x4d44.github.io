// ============================================================
// Rivers in the Sea — charts & the AMOC laboratory
// Hand-rolled canvas charts (dot plot, line chart) with hover
// tooltips, plus the interactive warming/AMOC anomaly map and
// the Scotland readout panel.
// ============================================================
(function () {
  "use strict";

  const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";
  const INK = "#e8eef5", INK2 = "#9fb2c4", INK3 = "#64798d", HAIR = "#1d2c3d";
  const BLUE = "#3987e5", RED = "#e66767";
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  function fit(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(50, r.width), h = +canvas.getAttribute("height");
    if (canvas._w !== w || canvas._dpr !== dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = h + "px";
      canvas._w = w; canvas._h = h; canvas._dpr = dpr;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function showTip(tip, wrap, x, y, html) {
    tip.innerHTML = html;
    tip.style.opacity = "1";
    const r = wrap.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = clamp(x + 14, 4, r.width - tw - 4) + "px";
    tip.style.top = clamp(y - th - 10, 4, r.height - th - 4) + "px";
  }
  function hideTip(tip) { tip.style.opacity = "0"; }

  // Diverging anomaly colour: blue ↔ neutral ↔ red, scaled to ±span °C
  function divColor(v, span) {
    const t = clamp(v / span, -1, 1);
    let r, g, b;
    if (t < 0) { const k = -t; r = lerp(56, 20, k); g = lerp(56, 92, k); b = lerp(53, 171, k); }
    else { const k = t; r = lerp(56, 220, k); g = lerp(56, 70, k); b = lerp(53, 60, k); }
    return [r | 0, g | 0, b | 0];
  }

  // ================= Latitude dot plot =================
  (function latitudeChart() {
    const canvas = document.getElementById("latitude-chart");
    if (!canvas) return;
    const tip = document.getElementById("latitude-tip");
    const wrap = canvas.parentElement;
    const cities = window.OC_CITIES.slice().sort((a, b) => a.lon - b.lon);
    const labelled = new Set(["Sitka, Alaska", "Churchill, Canada", "Glasgow, Scotland", "Moscow, Russia", "Novosibirsk, Russia", "Magadan, Russia"]);
    let dots = [];

    function draw() {
      const { ctx, w, h } = fit(canvas);
      ctx.clearRect(0, 0, w, h);
      const L = 46, R = w - 18, T = 30, B = h - 46;
      const x = (lon) => L + (lon + 180) / 360 * (R - L);
      const yMin = -30, yMax = 10;
      const y = (v) => T + (yMax - v) / (yMax - yMin) * (B - T);

      // grid + axes
      ctx.font = "500 10.5px " + SANS;
      ctx.fillStyle = INK3; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (let v = -30; v <= 10; v += 10) {
        ctx.strokeStyle = v === 0 ? "rgba(160,190,220,0.35)" : "rgba(120,160,200,0.12)";
        ctx.lineWidth = 1;
        ctx.setLineDash(v === 0 ? [] : [3, 4]);
        ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(R, y(v)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText(v + "°", L - 7, y(v));
      }
      ctx.textAlign = "center";
      ctx.fillText("freezing", L + 30, y(0) - 10);
      for (const lon of [-120, -60, 0, 60, 120]) {
        ctx.fillText(lon === 0 ? "0°" : Math.abs(lon) + "°" + (lon < 0 ? "W" : "E"), x(lon), B + 16);
      }
      ctx.fillText("← westward around the 55–59°N circle →", (L + R) / 2, B + 34);

      dots = [];
      for (const c of cities) {
        const cx = x(c.lon), cy = y(c.jan);
        const [r, g, b] = divColor(c.jan, 18);
        // brighten for visibility on dark surface
        ctx.fillStyle = `rgb(${Math.min(255, r + 45)},${Math.min(255, g + 45)},${Math.min(255, b + 45)})`;
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(6,11,18,0.9)"; ctx.lineWidth = 1.5; ctx.stroke();
        dots.push({ x: cx, y: cy, c });
        if (labelled.has(c.name)) {
          ctx.font = "600 10.5px " + SANS;
          ctx.fillStyle = INK2;
          const above = c.jan > -8;
          ctx.fillText(c.name.split(",")[0], cx, cy + (above ? -14 : 16));
          ctx.font = "700 10.5px " + SANS;
          ctx.fillStyle = INK;
          ctx.fillText((c.jan > 0 ? "+" : "") + c.jan.toFixed(1) + "°", cx, cy + (above ? -27 : 29));
        }
      }
      // Scotland shading (label at the bottom, clear of the Glasgow dot label)
      ctx.fillStyle = "rgba(84,200,255,0.05)";
      ctx.fillRect(x(-8), T, x(0) - x(-8), B - T);
      ctx.fillStyle = "#54c8ff";
      ctx.font = "700 10px " + SANS;
      ctx.fillText("SCOTLAND", x(-4), B - 8);
    }

    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = 1e9;
      for (const d of dots) {
        const dd = Math.hypot(mx - d.x, my - d.y);
        if (dd < bd) { bd = dd; best = d; }
      }
      if (best && bd < 26) {
        const c = best.c;
        showTip(tip, wrap, best.x, best.y,
          `<strong>${c.name}</strong> · ${c.lat.toFixed(1)}°N<br>
           January mean <strong>${c.jan > 0 ? "+" : ""}${c.jan.toFixed(1)} °C</strong> · July ${c.jul > 0 ? "+" : ""}${c.jul.toFixed(1)} °C<br>
           <span class="t2">${c.note}</span>`);
      } else hideTip(tip);
    });
    canvas.addEventListener("mouseleave", () => hideTip(tip));

    new ResizeObserver(draw).observe(canvas);
    draw();
  })();

  // ================= AMOC time-series chart =================
  (function amocChart() {
    const canvas = document.getElementById("amoc-chart");
    if (!canvas) return;
    const tip = document.getElementById("amoc-tip");
    const wrap = canvas.parentElement;

    // Schematic reconstruction (after Caesar et al. 2018/2021): index in Sv.
    // Smooth base + multidecadal wiggles; decline sets in from the 1960s–70s.
    const years = [], recon = [], band = [];
    let seedState = 42;
    const rnd = () => { seedState = (seedState * 1103515245 + 12345) & 0x7fffffff; return seedState / 0x7fffffff; };
    let wig = 0;
    for (let yr = 1900; yr <= 2020; yr++) {
      years.push(yr);
      const base = 18.6
        - 1.9 * Math.max(0, (yr - 1965) / 55)                       // modern decline
        - 0.55 * Math.exp(-Math.pow((yr - 1975) / 9, 2))            // the 1970s "great salinity anomaly" dip
        + 0.35 * Math.sin((yr - 1900) / 19)                          // multidecadal wobble
        + 0.25 * Math.sin((yr - 1910) / 7.3);
      wig = wig * 0.82 + (rnd() - 0.5) * 0.28;
      recon.push(base + wig);
      band.push(1.35 - 0.55 * clamp((yr - 1900) / 120, 0, 1));       // wider uncertainty further back
    }
    // RAPID era (2004–2024) annual means, schematic: ~18 → ~16.8 with the 2009–10 dip
    const rapidYears = [], rapid = [];
    for (let yr = 2004; yr <= 2024; yr++) {
      rapidYears.push(yr);
      let v = 18.1 - 0.05 * (yr - 2004);
      if (yr === 2009) v -= 1.6;
      if (yr === 2010) v -= 2.3;
      if (yr === 2011) v -= 0.7;
      v += (rnd() - 0.5) * 0.5;
      rapid.push(v);
    }

    let px = { x: (v) => v, y: (v) => v };
    function draw() {
      const { ctx, w, h } = fit(canvas);
      ctx.clearRect(0, 0, w, h);
      const L = 46, R = w - 16, T = 26, B = h - 40;
      const x = (yr) => L + (yr - 1900) / (2025 - 1900) * (R - L);
      const yMin = 13, yMax = 21;
      const y = (v) => T + (yMax - v) / (yMax - yMin) * (B - T);
      px = { x, y };

      ctx.font = "500 10.5px " + SANS;
      ctx.fillStyle = INK3; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      for (let v = 14; v <= 20; v += 2) {
        ctx.strokeStyle = "rgba(120,160,200,0.12)";
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(R, y(v)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillText(v + " Sv", L - 6, y(v));
      }
      ctx.textAlign = "center";
      for (let yr = 1900; yr <= 2020; yr += 20) ctx.fillText(String(yr), x(yr), B + 16);

      // uncertainty band
      ctx.fillStyle = "rgba(57,135,229,0.16)";
      ctx.beginPath();
      for (let i = 0; i < years.length; i++) ctx.lineTo(x(years[i]), y(recon[i] + band[i]));
      for (let i = years.length - 1; i >= 0; i--) ctx.lineTo(x(years[i]), y(recon[i] - band[i]));
      ctx.closePath(); ctx.fill();

      // reconstruction line
      ctx.strokeStyle = BLUE; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < years.length; i++) {
        if (i === 0) ctx.moveTo(x(years[i]), y(recon[i])); else ctx.lineTo(x(years[i]), y(recon[i]));
      }
      ctx.stroke();

      // RAPID line
      ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let i = 0; i < rapidYears.length; i++) {
        if (i === 0) ctx.moveTo(x(rapidYears[i]), y(rapid[i])); else ctx.lineTo(x(rapidYears[i]), y(rapid[i]));
      }
      ctx.stroke();

      // legend + direct labels
      ctx.textAlign = "left";
      ctx.font = "600 11px " + SANS;
      ctx.fillStyle = BLUE; ctx.fillRect(L + 8, T + 2, 16, 3);
      ctx.fillStyle = INK2; ctx.fillText("reconstruction (schematic, ±band)", L + 30, T + 4);
      ctx.fillStyle = INK; ctx.fillRect(L + 8, T + 20, 16, 3);
      ctx.fillStyle = INK2; ctx.fillText("RAPID array (measured era)", L + 30, T + 22);
      ctx.fillStyle = INK2;
      ctx.font = "600 10px " + SANS;
      ctx.fillText("2009–10 dip", x(2011) - 20, y(14.6));
    }

    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const yr = clamp(Math.round(1900 + (mx - 46) / (r.width - 62) * 125), 1900, 2024);
      const i = clamp(yr - 1900, 0, recon.length - 1);
      const isRapid = yr >= 2004;
      const rv = isRapid ? rapid[clamp(yr - 2004, 0, rapid.length - 1)] : null;
      showTip(tip, wrap, px.x(Math.min(yr, 2020)), px.y(recon[Math.min(i, recon.length - 1)]),
        `<strong>${yr}</strong><br>reconstruction ≈ ${recon[Math.min(i, recon.length - 1)].toFixed(1)} Sv` +
        (rv !== null ? `<br>RAPID ≈ ${rv.toFixed(1)} Sv` : "") +
        `<br><span class="t2">indicative values</span>`);
    });
    canvas.addEventListener("mouseleave", () => hideTip(tip));
    new ResizeObserver(draw).observe(canvas);
    draw();
  })();

  // ================= The AMOC laboratory =================
  (function lab() {
    const mapC = document.getElementById("lab-map");
    if (!mapC) return;
    const monthlyC = document.getElementById("lab-monthly");
    const mapTip = document.getElementById("lab-map-tip");
    const monthlyTip = document.getElementById("lab-monthly-tip");
    const warmSl = document.getElementById("lab-warm");
    const amocSl = document.getElementById("lab-amoc");
    const warmOut = document.getElementById("lab-warm-out");
    const amocOut = document.getElementById("lab-amoc-out");
    const linkCb = document.getElementById("lab-link");
    const seasonBtn = document.getElementById("lab-season");
    const chips = document.querySelectorAll("#lab [data-scen]");

    const state = { dT: 1.3, amoc: 91, winter: true };

    // AMOC strength implied by a warming level (the "linked" curve):
    // gentle decline at first, steepening past ~2.2 °C.
    function linkedAmoc(dT) {
      return clamp(Math.round(100 - 7 * dT - 12 * Math.pow(Math.max(0, dT - 2.2), 1.6)), 3, 100);
    }

    // The anomaly model. lon/lat in degrees; returns °C vs late-20th-c baseline.
    // ΔT term: polar-amplified greenhouse warming (land amplified, winter Arctic boost).
    // AMOC term: subpolar North Atlantic cooling fingerprint, strongest in winter,
    // decaying inland — shaped after Jackson et al. 2015 / van Westen et al. 2024.
    function anomaly(lon, lat, dT, amoc, winter) {
      const land = window.OC_FIELD.isLand(lon, lat);
      let p = (land ? 1.18 : 0.82) * (1 + clamp((lat - 40) / 55, 0, 1) * (winter ? 0.9 : 0.35));
      const warmTerm = dT * p;

      const def = (100 - amoc) / 100;
      // main lobe: subpolar gyre south-east of Greenland
      const g1 = Math.exp(-(Math.pow((lon + 32) / 26, 2) + Math.pow((lat - 57) / 11, 2)) / 2);
      // secondary lobe: Norwegian Sea / Nordic Seas
      const g2 = 0.85 * Math.exp(-(Math.pow((lon - 2) / 20, 2) + Math.pow((lat - 68) / 9, 2)) / 2);
      const shape = Math.max(g1, g2);
      const amp = (winter ? 13.5 : 5.5) * (land ? 0.85 : 1);
      const coolTerm = -def * amp * shape;

      return warmTerm + coolTerm;
    }

    // Scotland box (land average, computed on the same model)
    function scotAnomaly(dT, amoc, winter) {
      let sum = 0, n = 0;
      for (let lon = -6.5; lon <= -2; lon += 0.75) {
        for (let lat = 55; lat <= 58.5; lat += 0.5) {
          sum += anomaly(lon, lat, dT, amoc, winter); n++;
        }
      }
      return sum / n;
    }

    // ---- map rendering ----
    const LON0 = -62, LON1 = 32, LAT0 = 38, LAT1 = 78;
    function drawMap() {
      const { ctx, w, h } = fit(mapC);
      const proj = (lon, lat) => [(lon - LON0) / (LON1 - LON0) * w, (LAT1 - lat) / (LAT1 - LAT0) * h];
      const inv = (x, y) => [LON0 + x / w * (LON1 - LON0), LAT1 - y / h * (LAT1 - LAT0)];

      // anomaly field, coarse cells
      const cell = 6;
      const winter = state.winter;
      for (let yPix = 0; yPix < h; yPix += cell) {
        for (let xPix = 0; xPix < w; xPix += cell) {
          const [lon, lat] = inv(xPix + cell / 2, yPix + cell / 2);
          const v = anomaly(lon, lat, state.dT, state.amoc, winter);
          const [r, g, b] = divColor(v, 8);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(xPix, yPix, cell, cell);
        }
      }

      // sea-ice hatching where ocean anomaly is deeply negative in winter
      if (winter && state.amoc < 35) {
        ctx.strokeStyle = "rgba(210,235,255,0.55)";
        ctx.lineWidth = 1;
        for (let yPix = 0; yPix < h; yPix += 7) {
          for (let xPix = (yPix / 7 % 2) * 7; xPix < w; xPix += 14) {
            const [lon, lat] = inv(xPix, yPix);
            if (window.OC_FIELD.isLand(lon, lat)) continue;
            const v = anomaly(lon, lat, state.dT, state.amoc, true);
            if (v < -6.5 && lat > 55) {
              ctx.beginPath();
              ctx.moveTo(xPix, yPix + 5); ctx.lineTo(xPix + 5, yPix);
              ctx.stroke();
            }
          }
        }
      }

      // coastlines
      ctx.strokeStyle = "rgba(8,14,22,0.85)";
      ctx.lineWidth = 1.4;
      for (const poly of window.OC_LAND) {
        for (const ring of poly) {
          ctx.beginPath();
          let pen = false;
          for (let i = 0; i < ring.length; i += 2) {
            const lon = ring[i], lat = ring[i + 1];
            if (lon < LON0 - 10 || lon > LON1 + 10 || lat < LAT0 - 10 || lat > LAT1 + 10) { pen = false; continue; }
            const [x, y] = proj(lon, lat);
            if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // markers
      const marks = [["Scotland", -4.2, 57.2], ["Iceland", -19, 65], ["Norway", 8, 61.5], ["Newfoundland", -56, 48.5]];
      ctx.font = "700 10.5px " + SANS;
      ctx.textAlign = "center";
      for (const [name, lon, lat] of marks) {
        const [x, y] = proj(lon, lat);
        ctx.fillStyle = "rgba(6,11,18,0.65)";
        const tw = ctx.measureText(name).width;
        ctx.fillRect(x - tw / 2 - 3, y - 8, tw + 6, 15);
        ctx.fillStyle = "#f2f6fa";
        ctx.fillText(name, x, y + 3);
      }

      // colour scale
      const sw = 150, sx = w - sw - 14, sy = h - 26;
      for (let i = 0; i < sw; i++) {
        const v = (i / sw) * 16 - 8;
        const [r, g, b] = divColor(v, 8);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(sx + i, sy, 1.5, 10);
      }
      ctx.font = "600 9.5px " + SANS;
      ctx.fillStyle = "#dbe6f0";
      ctx.textAlign = "center";
      ctx.fillText("−8°", sx, sy - 5);
      ctx.fillText("0", sx + sw / 2, sy - 5);
      ctx.fillText("+8 °C", sx + sw, sy - 5);
    }

    mapC.addEventListener("mousemove", (e) => {
      const r = mapC.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const lon = LON0 + mx / r.width * (LON1 - LON0);
      const lat = LAT1 - my / r.height * (LAT1 - LAT0);
      const v = anomaly(lon, lat, state.dT, state.amoc, state.winter);
      const land = window.OC_FIELD.isLand(lon, lat);
      showTip(mapTip, mapC.parentElement, mx, my,
        `<strong>${v >= 0 ? "+" : ""}${v.toFixed(1)} °C</strong> vs baseline<br>
         <span class="t2">${land ? "land" : "ocean"} · ${Math.abs(lat).toFixed(0)}°N ${Math.abs(lon).toFixed(0)}°${lon < 0 ? "W" : "E"} · ${state.winter ? "winter" : "summer"}</span>`);
    });
    mapC.addEventListener("mouseleave", () => hideTip(mapTip));

    // ---- monthly chart ----
    let monthlyPts = [];
    function drawMonthly() {
      const { ctx, w, h } = fit(monthlyC);
      ctx.clearRect(0, 0, w, h);
      const L = 34, R = w - 12, T = 26, B = h - 26;
      const M = window.OC_SCOT_MONTHLY;
      const wAnom = scotAnomaly(state.dT, state.amoc, true);
      const sAnom = scotAnomaly(state.dT, state.amoc, false);
      // seasonal blend: cosine between winter (Jan) and summer (Jul) anomalies
      const scen = M.baseline.map((v, i) => {
        const k = (1 + Math.cos((i - 0.5) / 12 * 2 * Math.PI)) / 2; // 1 in Jan, 0 in Jul
        return v + wAnom * k + sAnom * (1 - k);
      });
      const all = M.baseline.concat(scen);
      const yMin = Math.floor(Math.min(...all) - 2), yMax = Math.ceil(Math.max(...all) + 2);
      const x = (i) => L + i / 11 * (R - L);
      const y = (v) => T + (yMax - v) / (yMax - yMin) * (B - T);

      ctx.font = "500 9.5px " + SANS;
      ctx.fillStyle = INK3; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let v = Math.ceil(yMin / 5) * 5; v <= yMax; v += 5) {
        ctx.strokeStyle = v === 0 ? "rgba(160,190,220,0.4)" : "rgba(120,160,200,0.12)";
        ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(R, y(v)); ctx.stroke();
        ctx.textAlign = "right"; ctx.fillText(v + "°", L - 4, y(v)); ctx.textAlign = "center";
      }
      M.months.forEach((m, i) => ctx.fillText(m, x(i), B + 12));

      // baseline
      ctx.strokeStyle = "rgba(159,178,196,0.85)"; ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); M.baseline.forEach((v, i) => i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))); ctx.stroke();
      ctx.setLineDash([]);
      // scenario
      const scenCol = (wAnom + sAnom) / 2 < -0.3 ? "#54c8ff" : "#ff8f6b";
      ctx.strokeStyle = scenCol; ctx.lineWidth = 2.4;
      ctx.beginPath(); scen.forEach((v, i) => i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))); ctx.stroke();

      ctx.font = "600 10px " + SANS;
      ctx.textAlign = "left";
      ctx.fillStyle = INK2; ctx.fillText("— today", L + 4, T - 8);
      ctx.fillStyle = scenCol; ctx.fillText("— your scenario", L + 64, T - 8);
      ctx.fillStyle = INK3;
      ctx.fillText("Scottish monthly mean °C", L + 4, B - 6);

      monthlyPts = M.months.map((m, i) => ({ x: x(i), yb: y(M.baseline[i]), ys: y(scen[i]), b: M.baseline[i], s: scen[i], m: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i] }));
    }
    monthlyC.addEventListener("mousemove", (e) => {
      const r = monthlyC.getBoundingClientRect();
      const mx = e.clientX - r.left;
      let best = null, bd = 1e9;
      for (const p of monthlyPts) { const d = Math.abs(mx - p.x); if (d < bd) { bd = d; best = p; } }
      if (best && bd < 30) {
        showTip(monthlyTip, monthlyC.parentElement, best.x, Math.min(best.yb, best.ys),
          `<strong>${best.m}</strong><br>today ${best.b.toFixed(1)} °C<br>scenario <strong>${best.s.toFixed(1)} °C</strong> (${best.s - best.b >= 0 ? "+" : ""}${(best.s - best.b).toFixed(1)})`);
      } else hideTip(monthlyTip);
    });
    monthlyC.addEventListener("mouseleave", () => hideTip(monthlyTip));

    // ---- readouts ----
    function analogue(winterMean) {
      if (winterMean >= 6.5) return "SW Ireland / Brittany";
      if (winterMean >= 4.8) return "Cornwall";
      if (winterMean >= 3.2) return "today's Scotland";
      if (winterMean >= 1.8) return "Denmark";
      if (winterMean >= 0.2) return "southern Sweden";
      if (winterMean >= -1.8) return "Riga / the Baltic coast";
      if (winterMean >= -4.0) return "Helsinki / S. Finland";
      if (winterMean >= -7.0) return "St Petersburg";
      return "interior Newfoundland";
    }

    function fmtDelta(el, d) {
      el.textContent = (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(1) + " °C vs today";
      el.className = "d " + (d > 0.2 ? "up" : d < -0.2 ? "down" : "flat");
    }

    function updateReadouts() {
      const wAnom = scotAnomaly(state.dT, state.amoc, true);
      const sAnom = scotAnomaly(state.dT, state.amoc, false);
      const BASE_W = 3.9, BASE_S = 14.2, BASE_FROST = 50;
      const wMean = BASE_W + wAnom, sMean = BASE_S + sAnom;
      document.getElementById("ro-winter").innerHTML = wMean.toFixed(1) + "<small> °C</small>";
      document.getElementById("ro-summer").innerHTML = sMean.toFixed(1) + "<small> °C</small>";
      fmtDelta(document.getElementById("ro-winter-d"), wAnom);
      fmtDelta(document.getElementById("ro-summer-d"), sAnom);
      const frost = Math.round(clamp(BASE_FROST - 11 * wAnom, 0, 200));
      document.getElementById("ro-frost").innerHTML = frost + "<small> days</small>";
      const fd = document.getElementById("ro-frost-d");
      fd.textContent = (frost - BASE_FROST >= 0 ? "+" : "−") + Math.abs(frost - BASE_FROST) + " vs today";
      fd.className = "d " + (frost > BASE_FROST + 3 ? "down" : frost < BASE_FROST - 3 ? "up" : "flat");
      document.getElementById("ro-analog").textContent = analogue(wMean);

      // verdict
      const v = document.getElementById("lab-verdict");
      let txt;
      if (state.amoc <= 15) {
        txt = `<strong>Collapse regime.</strong> The overturning has effectively stopped. Scotland's winters average
          <strong>${wMean.toFixed(1)} °C</strong> — ${wAnom < 0 ? Math.abs(wAnom).toFixed(1) + " °C colder than today despite " + state.dT.toFixed(1) + " °C of global warming" : "held down hard by the dead circulation"}.
          Winter climate analogue: <strong>${analogue(wMean)}</strong>. Expect winter sea ice pushing toward Scandinavia,
          fiercer storms along the new ice edge, drier summers, and an extra ~25–45 cm of sea-level rise on North
          Atlantic coasts as the circulation's tilt relaxes — all on top of global-warming impacts elsewhere.`;
      } else if (state.amoc <= 55) {
        txt = `<strong>Major weakening.</strong> The North Atlantic cold blob spreads and Scotland feels the drag:
          winters near <strong>${wMean.toFixed(1)} °C</strong> (${wAnom >= 0 ? "+" : ""}${wAnom.toFixed(1)} °C vs today) while the
          rest of the world warms by ${state.dT.toFixed(1)} °C. NW Europe becomes the odd corner of a hot planet —
          storm tracks shift, and continental Europe pulls further away from Scotland in winter.`;
      } else if (state.dT >= 2.6) {
        txt = `<strong>Warming dominates.</strong> The overturning holds (${state.amoc}%), so Scotland warms with the
          planet: winters around <strong>${wMean.toFixed(1)} °C</strong>, frost down to ~${frost} days a year, summers near
          ${sMean.toFixed(1)} °C. The subpolar Atlantic still warms more slowly than anywhere else — Scotland's
          radiator now doubles as a brake on the heat.`;
      } else {
        txt = `<strong>Near today.</strong> Modest warming, modest weakening: winters ~<strong>${wMean.toFixed(1)} °C</strong>,
          the cold blob a mild counterweight offshore. This is roughly the world of the 2020s–2030s.`;
      }
      v.innerHTML = txt;
    }

    // ---- wiring ----
    function render() {
      warmOut.innerHTML = "+" + state.dT.toFixed(1) + "&nbsp;°C";
      amocOut.textContent = state.amoc + "%";
      warmSl.value = Math.round(state.dT * 10);
      amocSl.value = state.amoc;
      seasonBtn.textContent = "Season: " + (state.winter ? "Winter" : "Summer");
      drawMap();
      drawMonthly();
      updateReadouts();
    }

    warmSl.addEventListener("input", () => {
      state.dT = warmSl.value / 10;
      if (linkCb.checked) state.amoc = linkedAmoc(state.dT);
      clearChips();
      render();
    });
    amocSl.addEventListener("input", () => {
      state.amoc = +amocSl.value;
      linkCb.checked = false;
      clearChips();
      render();
    });
    linkCb.addEventListener("change", () => {
      if (linkCb.checked) { state.amoc = linkedAmoc(state.dT); render(); }
    });
    seasonBtn.addEventListener("click", () => { state.winter = !state.winter; render(); });

    const scenarios = {
      today: { dT: 1.3, amoc: 91, link: true },
      paris: { dT: 1.7, amoc: 88, link: true },
      middle: { dT: 2.7, amoc: 77, link: true },
      high: { dT: 4.0, amoc: 41, link: true },
      collapse: { dT: 2.5, amoc: 5, link: false },
    };
    function clearChips(active) {
      chips.forEach(c => c.classList.toggle("on", c === active));
    }
    chips.forEach(chip => {
      chip.addEventListener("click", () => {
        const s = scenarios[chip.dataset.scen];
        state.dT = s.dT; state.amoc = s.amoc;
        linkCb.checked = s.link;
        clearChips(chip);
        render();
      });
    });

    new ResizeObserver(render).observe(mapC);
    render();
  })();

})();
