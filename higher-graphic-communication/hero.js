/* Briefing-room hero for "Planes, Plans & Pennants": a low-resolution pixel scene (320 x 80, scaled up
   crisply) of HMS Vellum, a 74-gun ship of the line built from blocks, at dusk on a sea ruled with an
   isometric grid under an aubergine sky. The running joke: the Plan Room cannot leave her alone, and keeps
   redrawing the scene in each kind of drawing the course teaches.
     1. AT SEA          the ship in a cabinet-oblique pictorial view; a Grob Tutor tows a pennant past
     2. SKETCH          the same view as a pencil wireframe: faint construction lines first, then firm lines
     3. ORTHOGRAPHIC    third-angle projection: elevation, then the PLAN projected up and placed ABOVE it,
                        then the END ELEVATION (seen from the bow, the right-hand end) placed to the RIGHT,
                        with projection lines, a 45-degree mitre line, chain centre lines, dashed hidden
                        detail (the middle hull step under the deck, in the plan) and the third-angle symbol
     4. ISOMETRIC       true 30-degree isometric, built block by block on isometric grid paper
     5. EXPLODED        hull, decks, masts and sails separate along one vertical axis, with chain lines on it
     6. RENDER          the model sited on the sea: a light source, shading, a cast shadow and a reflection
     7. PRINT           the render becomes a proof: bleed, trim, crop marks, registration marks, a CMYK bar
   One 3D model (boxes, flat polygons and sticks) is projected for every view, so the views agree.
   Static (the finished orthographic sheet) for prefers-reduced-motion; paused off-screen or by the button. */
(function () {
  "use strict";
  const cv = document.getElementById("hero-canvas");
  if (!cv || !cv.getContext) return;
  const W = 320, H = 80, WL = 3, HZ = 40;            // canvas, waterline height (model units), horizon row
  cv.width = W; cv.height = H;
  const main = cv.getContext("2d");
  let c = main;
  let reduced = !!(window.HG && window.HG.reduced);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const hash = (a, b) => (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)) >>> 0;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  function buffer() { const o = document.createElement("canvas"); o.width = W; o.height = H; return o; }
  function into(canvas, fn) { const prev = c; c = canvas.getContext("2d"); c.imageSmoothingEnabled = false; fn(); c = prev; }
  function layer(fn) { const o = buffer(); into(o, fn); return o; }

  /* ---------- pixel lines (with dash patterns) and polygons ---------- */
  function onPat(pat, total, k) { let m = k % total; for (let i = 0; i < pat.length; i++) { if (m < pat[i]) return i % 2 === 0; m -= pat[i]; } return true; }
  function line(x0, y0, x1, y1, col, pat) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    const total = pat ? pat.reduce((a, b) => a + b, 0) : 0;
    let err = dx + dy;
    c.fillStyle = col;
    for (let k = 0; k < 900; k++) {
      if (!pat || onPat(pat, total, k)) c.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function fillPoly(P, col) {
    let y0 = Infinity, y1 = -Infinity;
    for (const p of P) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    c.fillStyle = col;
    const n = P.length;
    for (let y = Math.ceil(y0 - 0.5); y <= Math.floor(y1 - 0.5); y++) {
      if (y < 0 || y >= H) continue;
      const sy = y + 0.5, xs = [];
      for (let i = 0; i < n; i++) {
        const a = P[i], b = P[(i + 1) % n];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + (sy - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.ceil(xs[k] - 0.5), xb = Math.floor(xs[k + 1] - 0.5);
        if (xb >= xa) c.fillRect(xa, y, xb - xa + 1, 1);
      }
    }
  }
  function outline(P, col, pat) { for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; line(a[0], a[1], b[0], b[1], col, pat); } }
  function circle(cx, cy, r, col) { for (let k = 0; k < 48; k++) { const a = k * Math.PI / 24; px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1, col); } }

  /* ---------- a 3x5 pixel font ---------- */
  const FONT = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
    F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
    K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
    P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
    Z: "111001010100111",
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
    "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111",
    "-": "000000111000000", "+": "000010111010000", ".": "000000000000010", ":": "000010000010000", ",": "000000000010100",
    "&": "010101010101011", "°": "010101010000000", " ": "000000000000000",
  };
  const textW = (s) => s.length * 4 - 1;
  function text(s, x, y, col) {
    x = Math.round(x); y = Math.round(y); c.fillStyle = col;
    [...s].forEach((ch, i) => { const g = FONT[ch] || FONT[" "]; for (let q = 0; q < 15; q++) if (g[q] === "1") c.fillRect(x + i * 4 + (q % 3), y + Math.floor(q / 3), 1, 1); });
  }
  const CMYK = ["#00a3d9", "#d4147a", "#f7d117", "#15121c"];
  // the stage caption: a dark tag with a tiny CMYK strip, centred near the top (inside the phone crop)
  function tag(s, cx = 160, y = 2) {
    const w = textW(s), x = Math.round(cx - w / 2);
    px(x - 5, y - 1, w + 8, 7, "rgba(29,15,48,.9)");
    CMYK.forEach((col, i) => px(x - 4, y - 1 + i * 2 - (i === 3 ? 1 : 0), 1, i === 3 ? 1 : 2, col));
    text(s, x, y, "#fff3d6");
  }
  function label(s, x, y, col = "#2a1740") { text(s, x, y, col); }

  /* ---------- colours ---------- */
  const hexRGB = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const shadeCache = new Map();
  function shade(col, k, tint) {
    const key = col + (Math.round(k * 40)) + (tint || "");
    let v = shadeCache.get(key);
    if (!v) {
      const t = tint === "dusk" ? [1.06, 0.88, 0.92] : tint === "night" ? [0.62, 0.55, 0.78] : [1, 1, 1];
      const q = Math.round(k * 40) / 40, a = hexRGB(col);
      v = `rgb(${a.map((x, i) => clamp(Math.round(x * q * t[i]), 0, 255)).join(",")})`;
      shadeCache.set(key, v);
    }
    return v;
  }
  const BLACK = "#2e2723", OCHRE = "#cf9a3e", COPPER = "#b8733a", DECK = "#b08452", OAK = "#7d5733", GOLD = "#e8b93a",
    SAILC = "#efe3c6", MASTC = "#5a3a1e", RED = "#c8102e", PORT = "#120d0a";

  /* ---------- the model: HMS Vellum in model units (x: stern 0 to bow 51; y: port -/starboard +; z: up) ---------- */
  const TH = 50 * Math.PI / 180, SU = [Math.sin(TH), Math.cos(TH)];      // yards braced 50 degrees from square
  const MASTS = [[11.5, 26, [[13, 19, 5], [21, 24.5, 3.6]]], [21.5, 33, [[13, 21, 6.5], [23, 30, 5]]], [31.5, 30, [[13, 20, 6], [22, 27, 4.5]]]];
  const LAYER = { hull: 0, deck: 1, mast: 2, sail: 2 };
  function hullDecals(n) {
    if (Math.abs(n[1]) !== 1) return null;
    const y = n[1] * 6, D = [];
    [[5, 6.4], [7.4, 8.8]].forEach(([z0, z1]) => {
      D.push({ pts: [[0, y, z0], [40, y, z0], [40, y, z1], [0, y, z1]], col: OCHRE });
      for (let i = 0; i < 14; i++) { const x = 2.6 + i * 2.6, zm = (z0 + z1) / 2; D.push({ pts: [[x - 0.5, y, zm - 0.45], [x + 0.5, y, zm - 0.45], [x + 0.5, y, zm + 0.45], [x - 0.5, y, zm + 0.45]], col: PORT, port: true }); }
    });
    return D;
  }
  function addBox(F, it, b, col, grp, o = {}) {
    const [x0, x1, y0, y1, z0, z1] = b, V = (x, y, z) => [x, y, z];
    [
      [[0, -1, 0], [V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1)]],
      [[0, 1, 0], [V(x1, y1, z0), V(x0, y1, z0), V(x0, y1, z1), V(x1, y1, z1)]],
      [[-1, 0, 0], [V(x0, y1, z0), V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1)]],
      [[1, 0, 0], [V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), V(x1, y0, z1)]],
      [[0, 0, -1], [V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), V(x1, y0, z0)]],
      [[0, 0, 1], [V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1)]],
    ].forEach(([n, pts]) => F.push({ kind: "face", pts, n, col: o.top && n[2] === 1 ? o.top : col, grp, it, decals: o.decals ? o.decals(n) : null }));
  }
  function addPoly(F, it, pts, col, grp) {
    const a = pts[0], b = pts[1], d = pts[2], u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const f = { kind: "face", pts, n: norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]), col, grp, it, double: true };
    F.push(f); return f;
  }
  function buildModel(cut) {
    const F = []; let it = 0;
    const zc = (z) => (cut ? Math.max(z, WL) : z);
    if (!cut) addBox(F, it++, [6, 34, -1.5, 1.5, 0, 2], COPPER, "hull");
    addBox(F, it++, [3, 37, -3.5, 3.5, zc(2), 4], COPPER, "hull");
    addBox(F, it++, [0, 40, -6, 6, 4, 10], BLACK, "hull", { top: DECK, decals: hullDecals });
    addBox(F, it++, [40, 43, -3, 3, 5, 10], BLACK, "hull", { top: DECK });
    addBox(F, it++, [43, 44, -1, 1, 7, 9], GOLD, "hull");
    addBox(F, it++, [0, 9, -4.5, 4.5, 10, 12], OAK, "deck", { top: DECK });
    addBox(F, it++, [34, 40, -4.5, 4.5, 10, 11], OAK, "deck", { top: DECK });
    F.push({ kind: "stick", a: [1, -3.5, 12], b: [1, -3.5, 13.2], col: GOLD, grp: "deck", it: it++, glow: true });
    F.push({ kind: "stick", a: [1, 3.5, 12], b: [1, 3.5, 13.2], col: GOLD, grp: "deck", it: it++, glow: true });
    F.push({ kind: "stick", a: [43, 0, 10], b: [51, 0, 14], col: MASTC, grp: "mast", it: it++ });
    F.push({ kind: "stick", a: [0, 0, 12], b: [-1.5, 0, 16.6], col: MASTC, grp: "mast", it: it++ });
    MASTS.forEach(([mx, top]) => F.push({ kind: "stick", a: [mx, 0, 10], b: [mx, 0, top], col: MASTC, grp: "mast", it: it++ }));
    MASTS.forEach(([mx, , sails]) => sails.forEach(([z0, z1, w]) => {
      const dx = w * SU[0], dy = w * SU[1];
      addPoly(F, it++, [[mx - dx, -dy, z1], [mx + dx, dy, z1], [mx + dx, dy, z0], [mx - dx, -dy, z0]], SAILC, "sail");
      F.push({ kind: "stick", a: [mx - dx * 1.15, -dy * 1.15, z1], b: [mx + dx * 1.15, dy * 1.15, z1], col: MASTC, grp: "sail", it: it++, bias: -0.2 });
    }));
    addPoly(F, it++, [[32, 0, 25.5], [50.5, 0, 14.4], [42, 0, 11.3]], SAILC, "sail");                 // the jib, fore and aft
    const pennant = addPoly(F, it++, [[21.5, 0, 33.4], [21.5, 0, 32.4], [14, 0, 32.9]], RED, "sail");   // the masthead pennant
    const ensign = addPoly(F, it++, [[-1.3, 0, 16.4], [-1.3, 0, 13.8], [-6, 0, 14], [-6, 0, 16.6]], RED, "sail");
    F.flags = { pennant, ensign };
    F.items = it;
    return F;
  }
  function flutter(F, T) {
    const p = F.flags.pennant.pts, e = F.flags.ensign.pts;
    p[2][0] = 14 + Math.sin(T * 5) * 0.6; p[2][2] = 32.9 + Math.sin(T * 7) * 0.7;
    e[2][2] = 14 + Math.sin(T * 4 + 1) * 0.5; e[3][2] = 16.6 + Math.sin(T * 4 + 1.6) * 0.5;
  }
  const FULL = buildModel(false), CUT = buildModel(true);

  /* ---------- projections. P maps model units to canvas pixels; d is the viewing direction (into the screen) ---------- */
  const isoView = (ox, oy, s) => ({ P: (p) => [ox + (p[0] + p[1]) * 0.8660254 * s, oy + ((p[0] - p[1]) * 0.5 - p[2]) * s], d: norm([-1, 1, -1]) });
  const obliqueView = (ox, oy, s) => ({ P: (p) => [ox + (p[0] + 0.3536 * p[1]) * s, oy - (p[2] + 0.3536 * p[1]) * s], d: norm([-0.3536, 1, -0.3536]) });
  // third angle: elevation looks from the front (-y) with the bow to the right; the plan (from above) sits
  // ABOVE it with the front edge nearest the elevation; the end elevation (from the bow, +x) sits to the RIGHT
  // with the front edge nearest the elevation
  const S = 1.2, EX = 92, EY = 71, PY = 20, NX = 176;
  const ORTHO = {
    elev: { P: (p) => [EX + p[0] * S, EY - p[2] * S], d: [0, 1, 0] },
    plan: { P: (p) => [EX + p[0] * S, PY - p[1] * S], d: [0, 0, -1] },
    end: { P: (p) => [NX + p[1] * S, EY - p[2] * S], d: [-1, 0, 0] },
  };
  function fit(F, mk, box, off) {
    const V = mk(0, 0, 1);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const f of F) {
      const dz = off ? off(f) || 0 : 0;
      for (const p of f.kind === "stick" ? [f.a, f.b] : f.pts) { const q = V.P([p[0], p[1], p[2] + dz]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    }
    const s = Math.min(box.w / (x1 - x0), box.h / (y1 - y0));
    return { s, ox: box.x + (box.w - (x1 - x0) * s) / 2 - x0 * s, oy: box.y + (box.h - (y1 - y0) * s) / 2 - y0 * s };
  }

  /* ---------- the renderer: painter's algorithm per face, hull before decks before rigging ---------- */
  const L_DUSK = norm([-0.7, -0.25, 0.5]);
  function render(F, V, mode, o = {}) {
    const list = [];
    for (const f of F) {
      const dz = o.off ? o.off(f) : 0;
      if (dz === null) continue;
      const T = o.mirror ? (p) => [p[0], p[1], 2 * WL - (p[2] + dz)] : (p) => [p[0], p[1], p[2] + dz];
      const lay = o.mirror ? 2 - LAYER[f.grp] : LAYER[f.grp];
      if (f.kind === "stick") {
        const a = T(f.a), b = T(f.b), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        list.push({ f, a, b, lay, depth: dot(m, V.d) + (f.bias || -0.05) });
        continue;
      }
      const n = o.mirror ? [f.n[0], f.n[1], -f.n[2]] : f.n;
      if (!f.double && dot(n, V.d) > -1e-6) continue;
      const P = f.pts.map(T), m = [0, 0, 0];
      P.forEach((p) => { m[0] += p[0] / P.length; m[1] += p[1] / P.length; m[2] += p[2] / P.length; });
      list.push({ f, P, n, lay, depth: dot(m, V.d), T });
    }
    list.sort((a, b) => a.lay - b.lay || b.depth - a.depth);
    for (const e of list) {
      const f = e.f;
      if (e.a) {
        const a = V.P(e.a), b = V.P(e.b);
        if (mode === "ink") line(a[0], a[1], b[0], b[1], o.ink);
        else if (mode === "shadow") line(a[0], a[1], b[0], b[1], o.col);
        else { line(a[0], a[1], b[0], b[1], shade(f.col, o.dim || 1, o.tint)); if (f.glow && o.glow) px(b[0], b[1] - 1, 1, 1, o.glow); }
        continue;
      }
      const Q = e.P.map(V.P);
      if (mode === "ink") {
        fillPoly(Q, o.paper); outline(Q, o.ink);
        if (f.decals) for (const d of f.decals) if (d.port) { const q = V.P(e.T([d.pts[0][0] + 0.5, d.pts[0][1], d.pts[0][2] + 0.45])); px(q[0], q[1], 1, 1, o.ink); }
        continue;
      }
      if (mode === "shadow") { fillPoly(Q, o.col); outline(Q, o.col); continue; }
      let k;
      if (o.light) { const l = dot(e.n, o.light); k = 0.42 + 0.62 * (f.double ? Math.abs(l) : Math.max(0, l)); }
      else k = e.n[2] > 0.5 ? 1 : e.n[2] < -0.5 ? 0.55 : Math.abs(e.n[1]) > 0.5 ? 0.82 : Math.abs(e.n[0]) > 0.5 ? 0.64 : 0.9;
      k *= o.dim || 1;
      const col = shade(f.col, k, o.tint);
      fillPoly(Q, col);
      if (Q.length && (f.grp === "sail" || o.edges)) outline(Q, shade(f.col, k * 0.8, o.tint));
      if (f.decals) for (const d of f.decals) fillPoly(d.pts.map((p) => V.P(e.T(p))), shade(d.col, k, o.tint));
    }
  }
  // a shadow cast on the water plane (z = WL) by light from direction L
  function castShadow(F, V, L, col) {
    const proj = (p) => { const k = (p[2] - WL) / L[2]; return [p[0] - L[0] * k, p[1] - L[1] * k, WL]; };
    const S2 = F.map((f) => (f.kind === "stick" ? { ...f, a: proj(f.a), b: proj(f.b) } : { ...f, pts: f.pts.map(proj), double: true, decals: null }));
    render(S2, V, "shadow", { col });
  }

  /* ---------- scenery: aubergine dusk sky, sea ruled in a 30-degree isometric grid ---------- */
  const skyLayer = layer(() => {
    const g = c.createLinearGradient(0, 0, 0, HZ);
    g.addColorStop(0, "#150a26"); g.addColorStop(0.45, "#3b1d55"); g.addColorStop(0.8, "#8c3a6c"); g.addColorStop(1, "#e88a5c");
    c.fillStyle = g; c.fillRect(0, 0, W, HZ);
    for (let i = 0; i < 46; i++) { const x = hash(i, 3) % W, y = hash(i, 7) % 22; px(x, y, 1, 1, i % 5 ? "rgba(255,240,220,.5)" : "#fff6d8"); }
    // a low square sun on the port side and blocky headlands
    px(36, HZ - 9, 11, 9, "#ffd88a"); px(38, HZ - 11, 7, 2, "#ffd88a"); px(34, HZ - 7, 15, 7, "#ffcf7a");
    px(37, HZ - 8, 9, 6, "#fff0c0");
    for (let x = 230; x < W; x += 4) { const h = 2 + (hash(x >> 2, 5) % 5); px(x, HZ - h, 4, h, "#4a2547"); }
    for (let x = 0; x < 30; x += 4) { const h = 1 + (hash(x >> 2, 9) % 3); px(x, HZ - h, 4, h, "#4a2547"); }
  });
  const seaBase = layer(() => {
    const g = c.createLinearGradient(0, HZ, 0, H);
    g.addColorStop(0, "#7b3a63"); g.addColorStop(0.35, "#3a2453"); g.addColorStop(1, "#0f1c33");
    c.fillStyle = g; c.fillRect(0, HZ, W, H - HZ);
  });
  const PER = 12, TAN30 = 0.57735;
  const gridTile = (() => {
    const o = document.createElement("canvas"); o.width = W + 2 * PER; o.height = H;
    const g = o.getContext("2d");
    for (let y = HZ + 1; y < H; y++) {
      const f = (y - HZ) / (H - HZ), d = ((y - HZ) / TAN30) % PER;
      g.fillStyle = `rgba(140,220,235,${(0.08 + 0.28 * f).toFixed(3)})`;
      for (let x = -PER; x < o.width + PER; x += PER) { g.fillRect(Math.round(x + d), y, 2, 1); g.fillRect(Math.round(x + PER - d), y, 2, 1); }
    }
    return o;
  })();
  function drawSky() { c.drawImage(skyLayer, 0, 0); }
  function drawSea(T) {
    c.drawImage(seaBase, 0, 0);
    const off = Math.round(T * 3) % PER;
    for (let y = HZ + 1; y < H; y++) {
      const dx = Math.round(Math.sin(y * 0.55 - T * 1.8) * (y - HZ) / 26);
      c.drawImage(gridTile, 0, y, W + 2 * PER, 1, -PER - off + dx, y, W + 2 * PER, 1);
    }
    px(0, HZ, W, 1, "#f2a070");
    // the sun's glitter path
    for (let y = HZ + 2; y < H; y += 2) if ((hash(y, Math.floor(T * 5)) & 3) !== 0) { const w = 2 + (hash(y, 11) % 5); px(41 - w / 2 + Math.sin(y + T * 3) * 2, y, w, 1, "rgba(255,214,150,.55)"); }
  }
  const reflBuf = buffer(), shadBuf = buffer(), stripBuf = buffer();
  function composite(buf, alpha, T, wobble) {
    c.globalAlpha = alpha;
    for (let y = HZ + 1; y < H; y++) { const dx = wobble ? Math.round(Math.sin(y * 0.9 + T * 2.6) * 1.2) : 0; c.drawImage(buf, 0, y, W, 1, dx, y, W, 1); }
    c.globalAlpha = 1;
  }
  function clearBuf(b) { b.getContext("2d").clearRect(0, 0, W, H); }

  /* ---------- the Grob Tutor (and a towed pennant) ---------- */
  const TUT = ["XX..............", "XXX.......CC....", "XWWWWWWWWWWWWWW.", ".WWWWRBRWWWWWWWP", "......LLLLLL...."];
  const TCOL = { X: "#c8102e", W: "#eceae2", C: "#7cc0e8", R: "#c8102e", B: "#1f3f8a", L: "#a9a59a", P: "#555" };
  function tutor(x, y, dir, T, style) {
    x = Math.round(x); y = Math.round(y);
    for (let r = 0; r < TUT.length; r++) for (let q = 0; q < 16; q++) {
      const ch = TUT[r][q]; if (ch === ".") continue;
      if (ch === "P" && Math.floor(T * 16) % 2) continue;
      const X = dir > 0 ? x + q : x + 15 - q;
      if (style === "pencil") {
        const nb = (rr, qq) => rr >= 0 && rr < TUT.length && qq >= 0 && qq < 16 && TUT[rr][qq] !== ".";
        if (nb(r - 1, q) && nb(r + 1, q) && nb(r, q - 1) && nb(r, q + 1)) continue;
        px(X, y + r, 1, 1, "#4d4858");
      } else px(X, y + r, 1, 1, TCOL[ch]);
    }
  }
  function towedBanner(x, y, s, T) {
    // the Tutor flies right; the banner trails behind on a tow line
    const w = textW(s) + 6, bx = Math.round(x - 10 - w);
    line(x, y + 3, bx + w, y + 3, "rgba(230,230,230,.7)");
    for (let i = 0; i < w; i++) {
      const dy = Math.round(Math.sin(i * 0.25 - T * 7) * 1.2 * (1 - i / w) + Math.sin(i * 0.25 - T * 7) * 0.4);
      px(bx + i, y + dy, 1, 9, "#f4ecd8"); px(bx + i, y + dy, 1, 1, "#d4147a"); px(bx + i, y + dy + 8, 1, 1, "#d4147a");
    }
    [...s].forEach((ch, k) => {
      const g = FONT[ch] || FONT[" "];
      for (let q = 0; q < 15; q++) if (g[q] === "1") { const i = 3 + k * 4 + (q % 3); const dy = Math.round(Math.sin(i * 0.25 - T * 7) * 1.2 * (1 - i / w) + Math.sin(i * 0.25 - T * 7) * 0.4); px(bx + i, y + 2 + dy + Math.floor(q / 3), 1, 1, "#2a1740"); }
    });
  }

  /* ================= the seven stages ================= */
  const BOB = (T) => Math.round(Math.sin(T * 1.1));
  const LIVE_O = { ox: 132, oy: 67, s: 1.25 };

  // 1. at sea: cabinet oblique, flat block shading, reflection, a fly-past
  function drawLive(u, T) {
    drawSky(); drawSea(T);
    flutter(CUT, T);
    const sy = BOB(T), V = obliqueView(LIVE_O.ox, LIVE_O.oy + sy, LIVE_O.s);
    clearBuf(reflBuf); into(reflBuf, () => render(CUT, V, "shade", { mirror: true, tint: "night", dim: 0.85 }));
    composite(reflBuf, 0.4, T, true);
    render(CUT, V, "shade", { tint: "dusk", glow: Math.floor(T * 3) % 2 ? "#fff3a0" : "#ffcf5a" });
    for (let x = Math.round(LIVE_O.ox - 1); x < LIVE_O.ox + 44 * LIVE_O.s; x++) if ((hash(x, Math.floor(T * 6)) % 3) === 0) px(x, LIVE_O.oy + sy - 1, 1, 1, "rgba(240,248,255,.8)");
    const tx = -20 + (u - 0.6) * 72;
    if (u > 0.6 && tx < W + 130) { towedBanner(tx, 13, "PLANES, PLANS & PENNANTS", T); tutor(tx, 11, 1, T); }
    tag("HMS VELLUM, 74 GUNS");
  }

  // 2. a wireframe sketch of the same oblique view: construction lines, then firm lines, then the pencil moves on
  const SK = fit(FULL, obliqueView, { x: 92, y: 12, w: 136, h: 64 });
  const sketchPaper = layer(() => {
    px(0, 0, W, H, "#efe6d0");
    for (let i = 0; i < 260; i++) px(hash(i, 1) % W, hash(i, 2) % H, 1, 1, "rgba(120,100,70,.12)");
    for (let y = 9; y < H; y += 8) px(0, y, W, 1, "rgba(80,110,170,.12)");
  });
  const EDGES = (() => {
    const out = [];
    FULL.forEach((f) => {
      if (f.kind === "stick") out.push([f.a, f.b]);
      else for (let i = 0; i < f.pts.length; i++) out.push([f.pts[i], f.pts[(i + 1) % f.pts.length]]);
    });
    return out;
  })();
  // finished edges are kept in a buffer, so each frame draws only the edge the pencil is on
  const skBuf = buffer(); let skDone = 0;
  function sketchEdge(V, i, part) {
    const [a3, b3] = EDGES[i], a = V.P(a3), b = V.P(b3);
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ex = dx / L * 2, ey = dy / L * 2;
    line(a[0] - ex, a[1] - ey, b[0] + ex, b[1] + ey, "rgba(110,100,120,.35)");      // light construction line, overshooting
    if (part < 1) { const fx = a[0] + dx * part, fy = a[1] + dy * part; line(a[0], a[1], fx, fy, "#4d4858"); return [fx, fy]; }
    const j = ((hash(i, 4) % 3) - 1) * 0.6, mx = (a[0] + b[0]) / 2 + j, my = (a[1] + b[1]) / 2 - j;
    line(a[0], a[1], mx, my, "#4d4858"); line(mx, my, b[0], b[1], "#4d4858");
    return b;
  }
  function drawSketch(u) {
    c.drawImage(sketchPaper, 0, 0);
    const V = obliqueView(SK.ox, SK.oy, SK.s), n = EDGES.length, done = ease(u / 3.6) * n, whole = Math.min(n, Math.floor(done));
    if (whole < skDone) { clearBuf(skBuf); skDone = 0; }
    if (whole > skDone) { into(skBuf, () => { for (let i = skDone; i < whole; i++) sketchEdge(V, i, 1); }); skDone = whole; }
    c.drawImage(skBuf, 0, 0);
    let pen = whole > 0 ? V.P(EDGES[whole - 1][1]) : null;
    if (whole < n && done > whole) pen = sketchEdge(V, whole, done - whole);
    if (pen && u < 3.8) {                                  // the pencil
      const [x, y] = pen;
      line(x + 1, y - 1, x + 7, y - 7, "#f2c230"); line(x + 2, y - 1, x + 8, y - 7, "#d9a520"); px(x, y, 1, 1, "#2a2a2a"); px(x + 8, y - 8, 2, 2, "#e88aa0");
    }
    if (u > 3.4) tutor(240 - (u - 3.4) * 30, 12, -1, 0, "pencil");
    tag("WIREFRAME SKETCH");
  }

  // 3. third-angle orthographic projection
  const INK = "#2a1740", THIN = "#8a7aa8", CL = "#a3236b", HID = "#2f5fa8", SHEET = "#f4eddc";
  // the sheet, with the title block placed so it stays inside the phone crop (x 60 to 260) when narrow
  function makeSheet(x0) {
    return layer(() => {
      px(0, 0, W, H, SHEET);
      for (let i = 0; i < 200; i++) px(hash(i, 5) % W, hash(i, 6) % H, 1, 1, "rgba(120,100,70,.10)");
      outline([[2, 1], [317, 1], [317, 78], [2, 78]], THIN);
      outline([[x0, 46], [x0 + 55, 46], [x0 + 55, 78], [x0, 78]], INK);
      px(x0, 56, 56, 1, INK);
      label("HMS VELLUM", x0 + 4, 49);
      label("PLAN ROOM", 6, 5, THIN);
      label("DRG 1805", 6, 70, THIN);
      // symbol: a frustum (narrow end to the right) and, to its right, its end view seen from that narrow end
      const sx = x0 + 4;
      line(sx, 59, sx, 69, INK); line(sx + 8, 61, sx + 8, 67, INK); line(sx, 59, sx + 8, 61, INK); line(sx, 69, sx + 8, 67, INK);
      circle(x0 + 23, 64, 5, INK); circle(x0 + 23, 64, 3, INK);
      line(x0 + 2, 64, x0 + 30, 64, CL, [5, 1, 1, 1]); line(x0 + 23, 57, x0 + 23, 71, CL, [5, 1, 1, 1]);
      label("3RD", x0 + 32, 59); label("ANGLE", x0 + 32, 66);
    });
  }
  const sheetWide = makeSheet(212), sheetNarrow = makeSheet(204);
  const narrowMQ = window.matchMedia ? matchMedia("(max-width: 560px)") : null;
  function reveal(k, x, y, w, h, fn) {
    if (k <= 0) return;
    c.save(); c.beginPath(); c.rect(x, y, w * k, h); c.clip(); fn(); c.restore();
  }
  function drawOrtho(u) {
    c.drawImage(narrowMQ && narrowMQ.matches ? sheetNarrow : sheetWide, 0, 0);
    const k1 = ease((u - 0.2) / 1.0), k2 = ease((u - 1.2) / 0.5), k3 = ease((u - 1.5) / 0.9), k4 = ease((u - 2.4) / 0.6), k5 = ease((u - 2.9) / 0.8);
    // projection lines: up from the elevation into the plan, across from the elevation to the end elevation
    if (k2 > 0) [0, 9, 11.5, 21.5, 31.5, 40, 43, 51].forEach((x) => { const X = EX + x * S; line(X, 31, X, 31 - k2 * 20, THIN, [1, 1]); });
    if (k4 > 0) {
      const mx = (Y) => NX - (Y - PY);                      // the 45-degree mitre line through the centre lines' crossing
      line(mx(10), 10, mx(30), 30, THIN);
      [6, -6, 3.5, -3.5].forEach((y) => { const Y = PY - y * S, X = mx(Y); line(156, Y, lerp(156, X, k4), Y, THIN, [1, 1]); if (k4 >= 1) line(X, Y, X, 33, THIN, [1, 1]); });
      [0, 4, 10, 12, 21, 30, 33].forEach((z) => { const Y = EY - z * S; line(156, Y, lerp(156, 166, k4), Y, THIN, [1, 1]); });
    }
    reveal(k1, 80, 28, 78, 48, () => render(FULL, ORTHO.elev, "ink", { paper: SHEET, ink: INK }));
    c.save(); c.beginPath(); c.rect(78, 30 - k3 * 21, 82, k3 * 21); c.clip(); render(FULL, ORTHO.plan, "ink", { paper: SHEET, ink: INK }); c.restore();
    reveal(k5, 165, 28, 22, 48, () => render(FULL, ORTHO.end, "ink", { paper: SHEET, ink: INK }));
    // chain centre lines, then dashed hidden detail (the lower hull steps under the deck, seen from above)
    const k6 = ease((u - 3.8) / 0.5), k7 = ease((u - 4.3) / 0.5);
    if (k6 > 0) { line(83, PY, 83 + k6 * 77, PY, CL, [6, 1, 1, 1]); line(NX, 27, NX, 27 + k6 * 49, CL, [6, 1, 1, 1]); }
    if (k7 > 0) reveal(k7, 90, 10, 60, 20, () => {
      const r = (x0, x1, y0, y1) => outline([[EX + x0 * S, PY - y0 * S], [EX + x1 * S, PY - y0 * S], [EX + x1 * S, PY - y1 * S], [EX + x0 * S, PY - y1 * S]], HID, [2, 1]);
      r(3, 37, -3.5, 3.5);
    });
    if (k3 >= 1) label("PLAN", 64, 18);
    if (k1 >= 1) label("ELEVATION", 116 - textW("ELEVATION") / 2, 73);
    if (k5 >= 1) label("END ELEVATION", NX - textW("END ELEVATION") / 2 + 1, 73);
    if (k7 >= 1) { label("HIDDEN", 216, 14, HID); line(214, 16, 131, 24, HID, [1, 2]); label("CENTRE LINE", 196, 30, CL); line(194, 32, 178, 38, CL, [1, 2]); }
    tag("THIRD ANGLE ORTHOGRAPHIC");
  }

  // 4 and 5. isometric (built block by block) and exploded along the vertical axis
  const EXPL = { hull: 0, deck: 1, mast: 2, sail: 3 }, EMAX = 7;
  const IS = fit(FULL, isoView, { x: 80, y: 11, w: 160, h: 66 });
  const EXF = fit(FULL, isoView, { x: 80, y: 11, w: 160, h: 67 }, (f) => EXPL[f.grp] * EMAX);
  function isoPaper(F) {
    return layer(() => {
      px(0, 0, W, H, "#f1ead8");
      const g = 8 * F.s, cx = 0.8660254 * g, col = "rgba(82,48,138,.16)";
      for (let j = -40; j <= 40; j++) {
        const x0 = F.ox + j * cx, y0 = F.oy - j * g * 0.5, x1 = F.ox + j * cx, y1 = F.oy + j * g * 0.5;
        line(x0 - 400, y0 - 400 * TAN30, x0 + 400, y0 + 400 * TAN30, col);
        line(x1 - 400, y1 + 400 * TAN30, x1 + 400, y1 - 400 * TAN30, col);
        const vx = F.ox + j * cx; if (vx > -1 && vx < W + 1) line(vx, 0, vx, H, "rgba(82,48,138,.07)");
      }
    });
  }
  const isoPaperA = isoPaper(IS), isoPaperB = isoPaper(EXF);
  function drawIso(u) {
    c.drawImage(isoPaperA, 0, 0);
    const V = isoView(IS.ox, IS.oy, IS.s), step = 2.6 / FULL.items;
    render(FULL, V, "shade", { edges: true, off: (f) => { const k = (u - 0.15 - f.it * step) / 0.25; return k < 0 ? null : (1 - ease(k)) * 6; } });
    // the isometric axes: 30 degrees each side of the vertical
    const ax = 234, ay = 70;
    line(ax, ay, ax + 12, ay - 7, CL); line(ax, ay, ax - 12, ay - 7, CL); line(ax, ay, ax, ay - 12, CL);
    label("30°", ax + 9, ay - 5, CL);
    tag("ISOMETRIC");
  }
  function drawExploded(u) {
    c.drawImage(isoPaperB, 0, 0);
    const e = ease(u / 1.6) * EMAX, off = (f) => EXPL[f.grp] * e, V = isoView(EXF.ox, EXF.oy, EXF.s);
    // chain lines on the explosion axis, through each mast and the stern
    if (e > 0.3) [[11.5, 26], [21.5, 33], [31.5, 30]].forEach(([mx, top]) => { const a = V.P([mx, 0, 10]), b = V.P([mx, 0, top + 3 * e]); line(a[0], a[1], b[0], b[1], CL, [5, 1, 1, 1]); });
    render(FULL, V, "shade", { edges: true, off });
    if (u > 1.7) {
      const names = { hull: "HULL", deck: "DECKS", mast: "MASTS", sail: "SAILS" };
      const cz = { hull: 6, deck: 11, mast: 17, sail: 22 };
      let last = 99;
      ["hull", "deck", "mast", "sail"].forEach((g) => {
        const p = V.P([0, 6, cz[g] + EXPL[g] * e]); const y = Math.min(p[1] - 2, last - 7); last = y;
        const s = names[g]; label(s, 84 - textW(s), y, INK); line(86, y + 2, p[0] - 2, p[1], THIN, [1, 1]);
      });
    }
    tag("EXPLODED");
  }

  // 6. render: the model sited on the sea, lit by the low sun, with a cast shadow and a reflection
  const R_BOX = { x: 100, y: 8, w: 120, h: 64 }, P_BOX = { x: 116, y: 17, w: 88, h: 48 };
  function renderScene(T, box) {
    const F = fit(CUT, isoView, box);
    const foot = isoView(F.ox, F.oy, F.s).P([0, 6, WL])[1];
    if (foot < HZ + 2) F.oy += HZ + 2 - foot;
    flutter(CUT, T);
    const sy = BOB(T), V = isoView(F.ox, F.oy + sy, F.s);
    drawSky(); drawSea(T);
    clearBuf(reflBuf); into(reflBuf, () => render(CUT, V, "shade", { mirror: true, light: L_DUSK, tint: "night", dim: 0.8 }));
    composite(reflBuf, 0.42, T, true);
    clearBuf(shadBuf); into(shadBuf, () => castShadow(CUT, V, L_DUSK, "#06040c"));
    composite(shadBuf, 0.55, T, false);
    render(CUT, V, "shade", { light: L_DUSK, tint: "dusk", edges: true, glow: "#fff3a0" });
    return V;
  }
  function drawRender(u, T) {
    const V = renderScene(T, R_BOX);
    if (u > 1.0) {                                           // name the rendering techniques
      line(47, HZ - 12, 96, 20, "rgba(255,230,160,.6)", [2, 2]);
      label("LIGHT", 30, HZ - 20, "#ffe6a8");
      const s = V.P([30, 0, WL]); label("SHADOW", 228, 60, "#ffe6a8"); line(226, 62, s[0] + 26, s[1] + 4, "rgba(255,230,160,.6)", [1, 1]);
      label("REFLECTION", 64, 72, "#ffe6a8"); line(104, 74, 120, 74, "rgba(255,230,160,.6)", [1, 1]);
    }
    const tx = W + 10 - (u - 0.4) * 70;
    if (u > 0.4 && tx > -20) tutor(tx, 10, -1, T);
    tag("RENDER");
  }

  // 7. print: the render becomes a proof with bleed, trim, crop marks, registration marks and a colour bar
  const BLEED = { x: 69, y: 9, w: 182, h: 62 }, TRIM = { x: 72, y: 12, w: 176, h: 56 };
  function regMark(x, y) { const col = "#15121c"; circle(x, y, 3, col); line(x - 5, y, x + 5, y, col); line(x, y - 5, x, y + 5, col); }
  function drawPrint(u, T) {
    px(0, 0, W, H, "#f7f3ea");
    const k = ease(u / 1.2);
    const bx = lerp(0, BLEED.x, k), by = lerp(0, BLEED.y, k), bw = lerp(W, BLEED.w, k), bh = lerp(H, BLEED.h, k);
    const box = { x: lerp(R_BOX.x, P_BOX.x, k), y: lerp(R_BOX.y, P_BOX.y, k), w: lerp(R_BOX.w, P_BOX.w, k), h: lerp(R_BOX.h, P_BOX.h, k) };
    c.save(); c.beginPath(); c.rect(Math.round(bx), Math.round(by), Math.round(bw), Math.round(bh)); c.clip();
    renderScene(T, box);
    if (k >= 1) { label("HMS VELLUM", TRIM.x + 4, TRIM.y + 3, "#ffd88a"); label("SAILS AT DUSK", TRIM.x + 4, TRIM.y + 10, "#f4ecd8"); }
    c.restore();
    const m = ease((u - 1.2) / 1.0);
    if (m > 0) {
      const o = (1 - m) * 12, ck = "#15121c";
      // the trim line (where the guillotine cuts), dashed for teaching; the image runs past it into the bleed
      outline([[TRIM.x, TRIM.y], [TRIM.x + TRIM.w, TRIM.y], [TRIM.x + TRIM.w, TRIM.y + TRIM.h], [TRIM.x, TRIM.y + TRIM.h]], "rgba(255,255,255,.75)", [2, 2]);
      // crop marks: in line with the trim edges, outside the bleed
      [[TRIM.x, TRIM.y, -1, -1], [TRIM.x + TRIM.w, TRIM.y, 1, -1], [TRIM.x, TRIM.y + TRIM.h, -1, 1], [TRIM.x + TRIM.w, TRIM.y + TRIM.h, 1, 1]].forEach(([x, y, sx, sy]) => {
        line(x + sx * (6 + o), y, x + sx * (12 + o), y, ck);
        line(x, y + sy * (5 + o), x, y + sy * (9 + o), ck);
      });
      regMark(66 - o, 40); regMark(254 + o, 40);
      CMYK.forEach((col, i) => { px(128 + i * 8, 73 + o, 7, 5, col); px(160 + i * 8, 73 + o, 7, 5, col); c.globalAlpha = 1; });
      c.globalAlpha = 0.5; CMYK.forEach((col, i) => px(160 + i * 8, 73 + o, 7, 5, "#f7f3ea")); c.globalAlpha = 1;
      if (m >= 1) { label("BLEED", 77, 73, "#7a5c96"); label("CROP", 224, 73, "#7a5c96"); label("PROOF 1", 80, 2, "#7a5c96"); label("CMYK", 222, 2, "#7a5c96"); }
    }
    tag("PRINT: BLEED + CROP");
  }

  const STAGES = [
    { len: 8, draw: drawLive }, { len: 6, draw: drawSketch }, { len: 8.5, draw: drawOrtho },
    { len: 5.5, draw: drawIso }, { len: 6, draw: drawExploded }, { len: 6.5, draw: drawRender }, { len: 7, draw: drawPrint },
  ];
  const CYCLE = STAGES.reduce((a, s) => a + s.len, 0), WIPE = 0.7;
  const START = [];
  { let a = 0; STAGES.forEach((s) => { START.push(a); a += s.len; }); }
  function frame(T) {
    c = main; c.imageSmoothingEnabled = false;
    let u = ((T % CYCLE) + CYCLE) % CYCLE, i = 0;
    while (u >= STAGES[i].len) { u -= STAGES[i].len; i++; }
    const S0 = STAGES[i];
    if (u < WIPE) {
      // the redraw: a T-square sweeps across, the new drawing appears behind it
      const P = STAGES[(i + STAGES.length - 1) % STAGES.length];
      P.draw(P.len, T);
      const wx = Math.round(ease(u / WIPE) * (W + 8));
      c.save(); c.beginPath(); c.rect(0, 0, wx, H); c.clip(); S0.draw(u, T); c.restore();
      px(wx, 0, 2, H, "#d4147a"); px(wx + 2, 0, 1, H, "rgba(212,20,122,.35)");
      for (let k = 0; k < 7; k++) px(wx - 7 + k, 2 + k, 7 - k, 1, "#f7d117");
    } else S0.draw(u, T);
  }

  /* ---------- the loop, pause, off-screen and reduced-motion handling ---------- */
  const STILL = START[2] + 7.5;                               // the finished orthographic sheet
  let t0 = performance.now() - WIPE * 1000, raf = 0, running = true, tPaused = 0, last = 0, onScreen = true;
  function tick(now) {
    raf = 0;
    if (!running || reduced || !onScreen) return;
    if (now - last >= 33) { last = now; frame((now - t0) / 1000); }   // about 30 frames a second
    raf = requestAnimationFrame(tick);
  }
  const start = () => { if (!raf) raf = requestAnimationFrame(tick); };
  const btn = document.getElementById("hero-pause");
  function sync() { if (btn) { const on = running && !reduced; btn.textContent = on ? "Pause animation" : "Play animation"; btn.setAttribute("aria-pressed", on ? "false" : "true"); } }
  if (btn) btn.addEventListener("click", () => {
    if (reduced) { reduced = false; running = true; t0 = performance.now() - STILL * 1000; start(); sync(); return; }
    running = !running;
    if (running) { t0 = performance.now() - tPaused * 1000; start(); } else { tPaused = (performance.now() - t0) / 1000; cancelAnimationFrame(raf); raf = 0; }
    sync();
  });
  if ("IntersectionObserver" in window) new IntersectionObserver((e) => {
    onScreen = e[0].isIntersecting;
    if (onScreen && running && !reduced) start(); else { cancelAnimationFrame(raf); raf = 0; }
  }).observe(cv);
  // a seek hook for screenshots: heroSeek(seconds) shows that moment and holds it
  cv.heroSeek = (s) => { running = false; cancelAnimationFrame(raf); raf = 0; frame(s); sync(); };
  cv.heroStages = START.slice();
  frame(reduced ? STILL : WIPE);
  if (!reduced) start();
  sync();
})();
