// ============================================================
// Rivers in the Sea — field builder
// Turns the hand-authored current polylines into smooth global
// velocity grids (1° resolution) plus a warm/cold tint channel,
// and rasterises the land polygons into a lookup mask.
// Everything here runs once at load.
// ============================================================
(function () {
  "use strict";

  const W = 360, H = 181;              // 1° grid, lat -90..90 inclusive
  const DEG = Math.PI / 180;

  // ---------- Land mask (0.25° raster via offscreen canvas) ----------
  const MW = 1440, MH = 720;
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = MW; maskCanvas.height = MH;
  const mctx = maskCanvas.getContext("2d", { willReadFrequently: true });
  mctx.fillStyle = "#000"; mctx.fillRect(0, 0, MW, MH);
  mctx.fillStyle = "#fff";
  // Rings that cross the antimeridian (Chukotka on the Eurasia ring) must be
  // unwrapped to continuous longitudes, then drawn again shifted ±360°, or the
  // equirect fill paints a false land band right across the map.
  window.OC_UNWRAP = function unwrapRing(ring) {
    const out = new Float64Array(ring.length);
    let prev = ring[0], cum = ring[0];
    out[0] = cum; out[1] = ring[1];
    for (let i = 2; i < ring.length; i += 2) {
      let d = ring[i] - prev;
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      cum += d; prev = ring[i];
      out[i] = cum; out[i + 1] = ring[i + 1];
    }
    return out;
  };
  for (const poly of window.OC_LAND) {
    mctx.beginPath();
    for (const ring of poly) {
      const un = window.OC_UNWRAP(ring);
      for (const shift of [-360, 0, 360]) {
        for (let i = 0; i < un.length; i += 2) {
          const x = (un[i] + shift + 180) / 360 * MW;
          const y = (90 - un[i + 1]) / 180 * MH;
          if (i === 0) mctx.moveTo(x, y); else mctx.lineTo(x, y);
        }
        mctx.closePath();
      }
    }
    mctx.fill("evenodd");
  }
  const maskData = mctx.getImageData(0, 0, MW, MH).data;
  const landMask = new Uint8Array(MW * MH);
  for (let i = 0; i < MW * MH; i++) landMask[i] = maskData[i * 4] > 127 ? 1 : 0;

  function isLand(lon, lat) {
    let x = Math.floor((lon + 180) / 360 * MW);
    let y = Math.floor((90 - lat) / 180 * MH);
    x = ((x % MW) + MW) % MW;
    y = Math.max(0, Math.min(MH - 1, y));
    return landMask[y * MW + x] === 1;
  }

  // ---------- Velocity + tint grids ----------
  const TINT = { warm: 1, cold: -1, mixed: 0.15, deep: -1, "deep-return": 1 };

  function wrapDLon(d) {
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  function buildGrid(currents, withBackground) {
    const u = new Float32Array(W * H);
    const v = new Float32Array(W * H);
    const tw = new Float32Array(W * H);  // tint * weight
    const ww = new Float32Array(W * H);  // weight sum

    if (withBackground) {
      // A whisper of wind-driven background drift so the whole ocean is alive:
      // westward in the trades, eastward in the westerlies.
      for (let j = 0; j < H; j++) {
        const lat = j - 90;
        let bg = 0;
        const a = Math.abs(lat);
        if (a < 25) bg = -0.055 * Math.cos((a / 25) * Math.PI / 2) - 0.01;
        else if (a >= 32 && a <= 62) bg = 0.07 * Math.sin(((a - 32) / 30) * Math.PI);
        for (let i = 0; i < W; i++) u[j * W + i] += bg;
      }
    }

    for (const cur of currents) {
      const pts = cur.pts;
      const n = pts.length;
      const segCount = cur.closed ? n : n - 1;
      const sigma = cur.width;            // degrees
      const cutoff = sigma * 2.6;
      const tint = TINT[cur.type] !== undefined ? TINT[cur.type] : 0;
      for (let s = 0; s < segCount; s++) {
        const a = pts[s], b = pts[(s + 1) % n];
        const midLat = (a[1] + b[1]) / 2;
        const cosm = Math.max(0.08, Math.cos(midLat * DEG));
        // segment vector in scaled-degree frame
        const sx = wrapDLon(b[0] - a[0]) * cosm;
        const sy = b[1] - a[1];
        const slen = Math.hypot(sx, sy) || 1e-9;
        const tx = sx / slen, ty = sy / slen;
        // bounding box in grid cells
        const latMin = Math.min(a[1], b[1]) - cutoff, latMax = Math.max(a[1], b[1]) + cutoff;
        const j0 = Math.max(0, Math.floor(latMin + 90)), j1 = Math.min(H - 1, Math.ceil(latMax + 90));
        const lonSpan = Math.ceil(Math.abs(wrapDLon(b[0] - a[0])) / 2 + cutoff / cosm + 1);
        const lonMid = Math.round(a[0] + wrapDLon(b[0] - a[0]) / 2);
        for (let j = j0; j <= j1; j++) {
          const lat = j - 90;
          for (let di = -lonSpan; di <= lonSpan; di++) {
            const i = (((lonMid + di + 180) % 360) + 360) % 360; // grid col for lon in [-180,180)
            const rx = wrapDLon((i - 180) - a[0]) * cosm;
            const ry = lat - a[1];
            let t = (rx * tx + ry * ty) / slen;
            t = Math.max(0, Math.min(1, t));
            const dx = rx - t * slen * tx, dy = ry - t * slen * ty;
            const d = Math.hypot(dx, dy);
            if (d > cutoff) continue;
            const fall = Math.exp(-(d * d) / (2 * (sigma * 0.55) * (sigma * 0.55)));
            const wgt = cur.speed * fall;
            const idx = j * W + i;
            u[idx] += tx * wgt;
            v[idx] += ty * wgt;
            tw[idx] += tint * wgt;
            ww[idx] += wgt;
          }
        }
      }
    }

    // Collapse tint to a single channel, zero velocity over land.
    const t = new Float32Array(W * H);
    for (let j = 0; j < H; j++) {
      const lat = j - 90;
      for (let i = 0; i < W; i++) {
        const idx = j * W + i;
        t[idx] = ww[idx] > 1e-6 ? tw[idx] / ww[idx] : 0;
        if (isLand(i - 180, lat)) { u[idx] = 0; v[idx] = 0; }
      }
    }
    return { u, v, t };
  }

  function makeSampler(grid) {
    const { u, v, t } = grid;
    return function sample(lon, lat, out) {
      let x = lon + 180;
      x = ((x % 360) + 360) % 360;
      const y = Math.max(0, Math.min(H - 1.001, lat + 90));
      const i0 = Math.floor(x), j0 = Math.floor(y);
      const i1 = (i0 + 1) % W, j1 = Math.min(H - 1, j0 + 1);
      const fx = x - i0, fy = y - j0;
      const a = j0 * W + i0, b = j0 * W + i1, c = j1 * W + i0, d = j1 * W + i1;
      out.u = (u[a] * (1 - fx) + u[b] * fx) * (1 - fy) + (u[c] * (1 - fx) + u[d] * fx) * fy;
      out.v = (v[a] * (1 - fx) + v[b] * fx) * (1 - fy) + (v[c] * (1 - fx) + v[d] * fx) * fy;
      out.t = (t[a] * (1 - fx) + t[b] * fx) * (1 - fy) + (t[c] * (1 - fx) + t[d] * fx) * fy;
      return out;
    };
  }

  // Weighted spawn cells (fast particles seed preferentially inside currents).
  function spawnList(grid) {
    const list = [];
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const idx = j * W + i;
        const s = Math.hypot(grid.u[idx], grid.v[idx]);
        if (s > 0.12) {
          const reps = Math.min(6, Math.ceil(s * 4));
          for (let r = 0; r < reps; r++) list.push(idx);
        }
      }
    }
    return list;
  }

  const surfaceGrid = buildGrid(window.OC_CURRENTS, true);
  const deepGrid = buildGrid(window.OC_DEEP, false);

  window.OC_FIELD = {
    W, H,
    sampleSurface: makeSampler(surfaceGrid),
    sampleDeep: makeSampler(deepGrid),
    surfaceSpawn: spawnList(surfaceGrid),
    deepSpawn: spawnList(deepGrid),
    isLand,
    cellToLonLat(idx, out) {
      out.lon = (idx % W) - 180 + Math.random();
      out.lat = Math.floor(idx / W) - 90 + Math.random();
      return out;
    },
    // Advance a lon/lat position by dtDays using the sampled velocity (m/s).
    // Returns false if the new position is on land.
    advect(p, sampler, dtDays, out) {
      const tmp = { u: 0, v: 0, t: 0 };
      sampler(p.lon, p.lat, tmp);
      const mPerDay = 86400 * dtDays;
      const cosLat = Math.max(0.05, Math.cos(p.lat * DEG));
      out.lon = p.lon + (tmp.u * mPerDay) / (111320 * cosLat);
      out.lat = p.lat + (tmp.v * mPerDay) / 111320;
      if (out.lon > 180) out.lon -= 360;
      if (out.lon < -180) out.lon += 360;
      if (out.lat > 89.5) out.lat = 89.5;
      if (out.lat < -89.5) out.lat = -89.5;
      out.speed = Math.hypot(tmp.u, tmp.v);
      out.t = tmp.t;
      return !isLand(out.lon, out.lat);
    },
  };
})();
