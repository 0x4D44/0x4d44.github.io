// Canvas charts: elevation profile, minimap, HUD progress strip. Stage-data only, no THREE.

const SURF_COL = ["#c8b48a", "#b79a6c", "#8f9aa0", "#6b5238", "#e8f1f8", "#d8cdb4"];

function setup(canvas, cssW, cssH) {
  const dpr = Math.min(2, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1);
  const w = Math.max(2, Math.round((cssW || canvas.clientWidth || 300) * dpr));
  const hh = Math.max(2, Math.round((cssH || canvas.clientHeight || 100) * dpr));
  if (canvas.width !== w || canvas.height !== hh) {
    canvas.width = w;
    canvas.height = hh;
  }
  const g = canvas.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, hh);
  return { g, w, h: hh, dpr };
}

/** Elevation profile with surface bands and optional checkpoint ticks. */
export function drawElevation(canvas, stage, opts = {}) {
  const { g, w, h, dpr } = setup(canvas, opts.width, opts.height);
  const N = stage.N, py = stage.py;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) {
    if (py[i] < lo) lo = py[i];
    if (py[i] > hi) hi = py[i];
  }
  const span = Math.max(20, hi - lo);
  const padY = 14 * dpr, bandH = 6 * dpr;
  const X = (i) => (i / (N - 1)) * w;
  const Y = (v) => h - bandH - padY - ((v - lo) / span) * (h - bandH - padY * 2);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, "rgba(143,217,176,.55)");
  grd.addColorStop(1, "rgba(143,217,176,.04)");
  g.beginPath();
  g.moveTo(0, h - bandH);
  for (let i = 0; i < N; i++) g.lineTo(X(i), Y(py[i]));
  g.lineTo(w, h - bandH);
  g.closePath();
  g.fillStyle = grd;
  g.fill();
  g.beginPath();
  for (let i = 0; i < N; i++) (i ? g.lineTo(X(i), Y(py[i])) : g.moveTo(X(i), Y(py[i])));
  g.strokeStyle = "#8fd9b0";
  g.lineWidth = 2 * dpr;
  g.stroke();
  // surface band
  if (stage.surf) {
    for (let i = 0; i < N - 1; i++) {
      g.fillStyle = SURF_COL[stage.surf[i]] || "#999";
      g.fillRect(X(i), h - bandH, Math.ceil(X(i + 1) - X(i)) + 1, bandH);
    }
  }
  // checkpoints
  g.strokeStyle = "rgba(255,200,30,.7)";
  g.lineWidth = dpr;
  g.fillStyle = "#cfdcd5";
  g.font = `${10 * dpr}px sans-serif`;
  for (const cp of stage.checkpoints || []) {
    const x = (cp.s / stage.lengthM) * w;
    g.beginPath();
    g.moveTo(x, padY * 0.6);
    g.lineTo(x, h - bandH);
    g.stroke();
  }
  g.fillText(`${Math.round(hi)} m`, 6 * dpr, 11 * dpr);
  g.fillText(`${Math.round(lo)} m`, 6 * dpr, h - bandH - 4 * dpr);
  g.textAlign = "right";
  g.fillText(`${(stage.lengthM / 1000).toFixed(2)} km`, w - 6 * dpr, 11 * dpr);
}

function mapTransform(stage, w, h, pad) {
  const mm = stage.minimap;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < mm.length; i += 2) {
    if (mm[i] < x0) x0 = mm[i];
    if (mm[i] > x1) x1 = mm[i];
    if (mm[i + 1] < z0) z0 = mm[i + 1];
    if (mm[i + 1] > z1) z1 = mm[i + 1];
  }
  const sc = Math.min((w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, z1 - z0));
  const ox = (w - (x1 - x0) * sc) / 2 - x0 * sc;
  const oz = (h - (z1 - z0) * sc) / 2 - z0 * sc;
  return { sc, ox, oz, X: (x) => x * sc + ox, Z: (z) => z * sc + oz };
}

let mapCache = new WeakMap();
/** Draw the stage route. Returns { toXY(s) } so the HUD can place a dot cheaply. */
export function drawMinimap(canvas, stage, opts = {}) {
  const { g, w, h, dpr } = setup(canvas, opts.width, opts.height);
  const pad = (opts.pad ?? 10) * dpr;
  const T = mapTransform(stage, w, h, pad);
  const mm = stage.minimap;
  const path = () => {
    g.beginPath();
    for (let i = 0; i < mm.length; i += 2) (i ? g.lineTo(T.X(mm[i]), T.Z(mm[i + 1])) : g.moveTo(T.X(mm[i]), T.Z(mm[i + 1])));
  };
  g.lineJoin = g.lineCap = "round";
  path();
  g.strokeStyle = "rgba(0,0,0,.65)";
  g.lineWidth = 7 * dpr;
  g.stroke();
  path();
  g.strokeStyle = opts.colour || "#cfdcd5";
  g.lineWidth = 3.2 * dpr;
  g.stroke();
  const pt = (i) => [T.X(mm[i * 2]), T.Z(mm[i * 2 + 1])];
  const n = mm.length / 2;
  const [sx, sy] = pt(0), [fx, fy] = pt(n - 1);
  g.fillStyle = "#7fe39a";
  g.beginPath();
  g.arc(sx, sy, 5 * dpr, 0, 6.3);
  g.fill();
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.rect(fx - 4.5 * dpr, fy - 4.5 * dpr, 9 * dpr, 9 * dpr);
  g.fill();
  const info = { T, n, dpr, w, h };
  mapCache.set(canvas, info);
  return info;
}

/** Position on the minimap (canvas px, device px) of stage distance s, interpolated along the minimap polyline. */
export function minimapPoint(info, stage, s, out = [0, 0]) {
  const mm = stage.minimap;
  const f = Math.max(0, Math.min(1, s / stage.lengthM)) * (info.n - 1);
  const i = Math.min(info.n - 2, Math.floor(f)), t = f - i;
  const x = mm[i * 2] + (mm[i * 2 + 2] - mm[i * 2]) * t;
  const z = mm[i * 2 + 1] + (mm[i * 2 + 3] - mm[i * 2 + 1]) * t;
  out[0] = info.T.X(x);
  out[1] = info.T.Z(z);
  return out;
}

/** HUD progress strip: elevation silhouette with a progress fill drawn in two halves (static + dynamic). */
export function drawProgressBase(canvas, stage, opts = {}) {
  const { g, w, h, dpr } = setup(canvas, opts.width, opts.height);
  const N = stage.N, py = stage.py;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < N; i++) {
    lo = Math.min(lo, py[i]);
    hi = Math.max(hi, py[i]);
  }
  const span = Math.max(15, hi - lo);
  const Y = (v) => h - 3 * dpr - ((v - lo) / span) * (h - 8 * dpr);
  g.beginPath();
  g.moveTo(0, h);
  const step = Math.max(1, Math.floor(N / 160));
  for (let i = 0; i < N; i += step) g.lineTo((i / (N - 1)) * w, Y(py[i]));
  g.lineTo(w, Y(py[N - 1]));
  g.lineTo(w, h);
  g.closePath();
  g.fillStyle = "rgba(207,220,213,.28)";
  g.fill();
  g.strokeStyle = "rgba(207,220,213,.9)";
  g.lineWidth = 1.5 * dpr;
  g.stroke();
  return { g, w, h, dpr, Y, lo, hi, span, step };
}
