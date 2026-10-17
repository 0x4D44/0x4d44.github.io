/* Briefing-room hero for "Rivets, Relays & Rigging": a low-resolution pixel scene (320 x 80,
   scaled up crisply) of HMS Ratchet, a 74-gun ship of the line built from Minecraft blocks,
   moored beside a dock. The engineering does the moving:
     - a two-gear train on the forecastle (12-tooth driver turning an 8-tooth driven gear: VR = driven/driver = 8/12 = 0.67, the other way)
     - the ship's wheel under closed-loop feedback: a gust pushes the heading off (error),
       the wheel turns against it (correction), the error dies away
     - redstone dust carrying a pulse: signal strength 15 falling by one a block, a repeater
       restoring it, and a row of lamps counting the arriving pulses in binary
     - a Warren-truss dock bridge that flexes (and changes its tension and compression) as a minecart crosses
   Then the running joke: eight passes by the squadron's Grob Tutor, towing a banner with a
   formula, and obeying each law literally:
     V=IR (the resistor halves its current: it slows) - P=2*pi*n*T (n in rev/min, not rev/s: it
     is gone) - positive feedback (the error grows until it hits the pier) - negative feedback
     (the same error dies away) - a comparator's output clips at the rails - a 3-bit ADC flies
     in steps - Young's modulus (the banner stretches, yields, and snaps) - pi = 3 (the loop
     does not close).
   Static for prefers-reduced-motion; paused when off-screen or by the button. */
(function () {
  "use strict";
  const cv = document.getElementById("hero-canvas");
  if (!cv) return;
  const W = 320, H = 80, SEA = 56;
  cv.width = W; cv.height = H;
  const mainCtx = cv.getContext("2d");
  let c = mainCtx;
  let reduced = !!(window.HE && window.HE.reduced);
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const hash = (a, b) => (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0;
  function line(x0, y0, x1, y1, col, th = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 600; n++) {
      px(x0, y0, th, th, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /* ---------- a 3x5 pixel font (capitals for banners, a few lower-case letters for the maths) ---------- */
  const FONT = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
    F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
    K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
    P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
    Z: "111001010100111",
    n: "000110101101101", p: "000110101110100", r: "000101110100100", x: "000101010101000", e: "000010111100011",
    "π": "111101101101101",
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
    "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111",
    "-": "000000111000000", "+": "000010111010000", ".": "000000000000010", "=": "000111000111000", "/": "001001010100100",
    "(": "001010010010001", ")": "100010010010100", "!": "010010010000010", "?": "111001010000010", ":": "000010000010000", " ": "000000000000000",
  };
  const text = (s, x, y, col, k = 1) => { [...s].forEach((ch, i) => { const g = FONT[ch] || FONT[" "]; for (let q = 0; q < 15; q++) if (g[q] === "1") px(x + (i * 4 + (q % 3)) * k, y + Math.floor(q / 3) * k, k, k, col); }); };
  const flick = (t, n) => Math.floor(t * n) % 2;
  const readout = (s, col = "#fff0c0") => { px(W - 6 - s.length * 4, 2, s.length * 4 + 3, 9, "rgba(20,12,6,.72)"); text(s, W - 4 - s.length * 4, 4, col); };

  /* ---------- palette ---------- */
  const OAK = ["#6e4f2f", "#5d4127", "#7a5834"], SEAM = "#3f2b18";
  const IRON = "#8d949c", IRON_D = "#5b616a", IRON_DD = "#3c4148", IRON_L = "#c5ccd2";
  const BRASS = "#d9a04f", BRASS_L = "#f0cf86", COPPER = "#b87333";
  const SAIL = "#e8dcc0", SAIL_D = "#cdbf9f";
  const DUST_DIM = [74, 20, 16], DUST_HOT = [255, 48, 30];
  const mix = (a, b, k) => `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`;

  /* ---------- static layers, drawn once ---------- */
  function layer(draw) {
    const o = document.createElement("canvas"); o.width = W; o.height = H;
    const prev = c; c = o.getContext("2d"); draw(); c = prev; return o;
  }
  const skyLayer = layer(() => {
    const g = c.createLinearGradient(0, 0, 0, SEA);
    g.addColorStop(0, "#26384a"); g.addColorStop(0.55, "#7c7f86"); g.addColorStop(1, "#dba26a");
    c.fillStyle = g; c.fillRect(0, 0, W, SEA);
    // dot-grid drawing-office paper, faintly, over the sky
    c.fillStyle = "rgba(255,230,190,.10)";
    for (let y = 6; y < SEA; y += 8) for (let x = 4; x < W; x += 8) c.fillRect(x, y, 1, 1);
    // a Minecraft square sun, low and copper
    px(222, 8, 7, 7, "#ffe9a6"); px(224, 6, 3, 11, "#ffe9a6"); px(220, 10, 11, 3, "#ffe9a6");
    // distant blocky headland
    for (let x = 196; x < 320; x += 4) { const h = 3 + (hash(x >> 2, 5) % 4); px(x, SEA - h - 2, 4, h, "#6d5a52"); }
    for (let x = 0; x < 70; x += 4) { const h = 2 + (hash(x >> 2, 9) % 4); px(x, SEA - h - 8, 4, h, "#6d5a52"); }
  });
  const shipLayer = layer(() => {
    // hull, block by block (4 x 4 blocks of oak), tapering at stern and bow
    for (let r = 0; r < 17; r++) {
      const y = SEA - 14 + r, L = 70 + Math.max(0, r - 10) * 2, R = 192 - Math.max(0, r - 9) * 2;
      for (let bx = L; bx < R;) {
        const nb = Math.min(R, Math.floor(bx / 4) * 4 + 4), k = hash(Math.floor(bx / 4), Math.floor(y / 4)) % 3;
        px(bx, y, nb - bx, 1, OAK[k]);
        if (bx % 4 === 0) px(bx, y, 1, 1, SEAM);
        bx = nb;
      }
    }
    px(70, 47, 122, 1, IRON_DD); px(70, 52, 120, 1, IRON_DD);                    // iron wales
    for (let x = 74; x < 190; x += 12) { px(x, 47, 2, 2, IRON); px(x, 52, 2, 2, IRON); } // iron-block fittings
    for (let i = 0; i < 23; i++) {                                                // 74 guns: ports in two tiers
      const x = 76 + i * 5;
      px(x, 43, 3, 2, "#17110a"); px(x, 49, 3, 2, "#17110a");
      if (i % 3 === 0) px(x + 1, 44, 1, 1, IRON); if (i % 2 === 0) px(x + 1, 50, 1, 1, IRON);
    }
    // quarterdeck (the wheel stands here) and forecastle (the gear train)
    px(70, 36, 26, 6, "#7a5834"); px(70, 36, 26, 1, "#8d6a40");
    for (let x = 70; x < 96; x += 4) px(x, 36, 1, 6, SEAM);
    [74, 80, 86].forEach((x) => { px(x - 1, 38, 5, 3, "#17110a"); px(x, 38, 3, 2, BRASS_L); });
    px(70, 34, 1, 2, IRON); px(73, 34, 1, 2, IRON); px(70, 33, 4, 1, IRON); px(93, 34, 1, 2, IRON); px(95, 34, 1, 2, IRON); px(93, 33, 3, 1, IRON);
    px(172, 38, 20, 4, "#7a5834"); px(172, 38, 20, 1, "#8d6a40");
    px(167, 36, 25, 2, IRON_D);                                                   // the iron bedplate under the gears
    px(190, 35, 2, 3, IRON); px(189, 34, 3, 1, IRON);
    px(192, 41, 3, 3, BRASS); px(193, 42, 1, 1, "#7a5808");                       // the gold-block figurehead
    line(190, 38, 207, 31, "#4a3320");                                            // bowsprit
    // three masts, shrouds, yards and block-wool sails
    [[100, 12], [128, 4], [156, 10]].forEach(([mx, top]) => {
      line(mx, top + 8, mx - 14, 42, IRON_D); line(mx + 1, top + 8, mx + 15, 42, IRON_D);
      px(mx, top, 2, 42 - top, "#4a3320");
      [[top + 3, 11, 14], [top + 16, 36 - (top + 16), 20]].forEach(([y0, h, w]) => {
        px(mx + 1 - w / 2, y0, w, h, SAIL); px(mx + 1 - w / 2, y0 + h - 2, w, 2, SAIL_D);
        for (let x = mx + 1 - w / 2 + 5; x < mx + 1 + w / 2 - 1; x += 5) px(x, y0, 1, h, SAIL_D);
        px(mx + 1 - w / 2 - 1, y0 - 1, w + 2, 2, "#4a3320");
      });
    });
    px(129, 1, 5, 3, "#c8102e"); px(129, 1, 5, 1, "#f2ead8");                    // pennant
  });
  const quayLayer = layer(() => {
    const stone = (x0, y0, w, h) => {
      for (let y = y0; y < y0 + h; y += 4) for (let x = x0; x < x0 + w; x += 4) {
        const k = hash(x >> 2, y >> 2) % 3;
        px(x, y, Math.min(4, x0 + w - x), Math.min(4, y0 + h - y), ["#6b6f76", "#5c6067", "#767a82"][k]);
        px(x, y, Math.min(4, x0 + w - x), 1, "rgba(255,255,255,.12)");
      }
    };
    stone(0, 48, 9, 16); stone(57, 48, 10, 16); stone(194, 52, 126, 12);
    px(0, 48, 9, 1, BRASS); px(57, 48, 10, 1, BRASS); px(194, 52, 126, 1, BRASS);
    // the lamp board: eight redstone lamps on a brass-framed post
    px(298, 44, 3, 8, BRASS); px(282, 35, 36, 11, BRASS); px(283, 36, 34, 9, "#24242a");
  });

  /* ---------- gears: per-pixel, so teeth really mesh ---------- */
  function gear(cx, cy, N, R, phi, body, edge) {
    const rr = Math.ceil(R + 2);
    for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
      const r = Math.hypot(dx, dy);
      if (r > R + 1.4) continue;
      const th = Math.atan2(dy, dx), tooth = Math.cos(N * (th - phi)) > 0 ? R + 1.3 : R - 1.3;
      if (r > tooth) continue;
      if (r < 1.2) { px(cx + dx, cy + dy, 1, 1, IRON_DD); continue; }
      if (r > R - 2.4 && r < R - 1.1 && Math.cos(N * (th - phi)) < 0) { px(cx + dx, cy + dy, 1, 1, edge); continue; }
      px(cx + dx, cy + dy, 1, 1, r > tooth - 1.2 ? edge : body);
    }
  }
  function gears(t, sy) {
    const NA = 12, NB = 8, wA = 1.1, phiA = wA * t;
    const phiB = Math.PI - Math.PI / NB - phiA * NA / NB;         // B turns the other way, NA/NB times as fast, teeth into gaps
    gear(176, 31 + sy, NA, 6, phiA, BRASS, BRASS_L);
    gear(186, 31 + sy, NB, 4, phiB, IRON, IRON_L);
  }

  /* ---------- the ship's wheel under closed-loop feedback ---------- */
  const DT = 1 / 60, GUST_T = 9, GUST_D = 1.6;
  const gustAt = (tm) => { const k = Math.floor((tm - 3) / GUST_T), s = tm - (3 + k * GUST_T); return k >= 0 && s < GUST_D ? Math.pow(Math.sin(Math.PI * s / GUST_D), 2) * (k % 2 ? -1 : 1) : 0; };
  const loop = { h: 0, w: 0, T: 0 };
  function loopTo(t) {
    if (t < loop.T) { loop.h = 0; loop.w = 0; loop.T = 0; }
    if (t - loop.T > 20) loop.T = t - 20;
    while (loop.T < t) {
      const g = gustAt(loop.T);
      loop.h += (7 * g - 3 * loop.w) * DT;             // the gust pushes the heading off; the wheel pulls it back
      loop.w += ((0.55 * loop.h - loop.w) / 0.22) * DT; // the wheel follows the error (negative feedback)
      loop.T += DT;
    }
  }
  function wheel(t, sy) {
    loopTo(t);
    const cx = 82, cy = 30 + sy, a = loop.w * 0.55, g = gustAt(t);
    for (let k = 0; k < 8; k++) {
      const an = a + k * Math.PI / 4, ex = cx + Math.cos(an) * 5, ey = cy + Math.sin(an) * 5;
      line(cx, cy, ex, ey, "#a9783c");
      px(cx + Math.cos(an) * 6.4, cy + Math.sin(an) * 6.4, 1, 1, BRASS_L);
    }
    for (let k = 0; k < 28; k++) px(cx + Math.cos(k * Math.PI / 14) * 4.6, cy + Math.sin(k * Math.PI / 14) * 4.6, 1, 1, "#7a5834");
    px(cx - 1, cy - 1, 2, 2, BRASS_L);
    // the error gauge: set point at the centre, a red marker for the heading error
    const gy = 19 + sy;
    px(72, gy + 1, 22, 1, IRON_DD); px(83, gy - 1, 1, 5, BRASS_L);
    px(83 + clamp(Math.round(loop.h * 2.2), -10, 10) - 1, gy - 1, 3, 4, flick(t, 6) && Math.abs(loop.h) > 2 ? "#ffb09a" : "#ff3a2a");
    if (Math.abs(g) > 0.02) {
      const dirn = g > 0 ? 1 : -1;
      for (let i = 0; i < 6; i++) { const x = ((t * 70 * dirn + i * 17) % 44 + 44) % 44 + 56; px(x, 12 + i * 3 + sy, 6, 1, "rgba(255,255,255,.65)"); }
    }
  }

  /* ---------- redstone dust: a pulse, signal strength falling, a repeater restoring it, lamps counting ---------- */
  const PER = 1.6, SP = 18, NB = 26, DX = 198;
  const strengthOf = (i) => (i < 15 ? 16 - i : 31 - i);
  function dust(t) {
    const k = Math.floor(t / PER), head = (t - k * PER) * SP;
    for (let i = 1; i < NB; i++) {
      if (i === 15) continue;
      const d = head - i, b = d < 0 ? 0 : Math.max(0, 1 - d / 6), sf = strengthOf(i) / 15;
      px(DX + 3 * i, 50, 2, 2, mix(DUST_DIM, DUST_HOT, b * (0.3 + 0.7 * sf)));
      if (d >= 0 && d < 1) px(DX + 3 * i, 50, 2, 1, "#ffc8b8");
    }
    // the lever/button at the source and the repeater at block 15
    px(DX - 4, 48, 4, 4, IRON); px(DX - 3, 49, 2, 2, head < 3 ? "#ff4b3a" : "#7a1f18");
    const rl = head > 14 && head < 17;
    px(DX + 45 - 1, 48, 5, 4, BRASS); px(DX + 45, 47, 1, 1, rl ? "#ff5a3a" : "#7a1f18"); px(DX + 47, 47, 1, 1, rl ? "#ff5a3a" : "#7a1f18");
    const hi = Math.floor(head);
    // the lamp board counts arriving pulses in binary
    const n = Math.max(0, Math.floor((t - 25.5 / SP) / PER) + 1) & 255;
    for (let i = 0; i < 8; i++) {
      const on = (n >> (7 - i)) & 1, x = 285 + i * 4;
      px(x, 38, 3, 3, on ? "#ffd55a" : "#3b2c14"); if (on) px(x, 38, 3, 1, "#fff2b0");
    }
  }

  /* ---------- the dock bridge: a Warren truss that flexes as a minecart crosses ---------- */
  function bridge(t) {
    const L = 48, X0 = 9, PW = 8, per = 11, ph = (t % per) / per, tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
    const cx = 2 + tri * 62, a = clamp(cx - X0, 0, L);
    const dl = (x) => { let xx = x, aa = a; if (xx > aa) { xx = L - xx; aa = L - aa; } const b = L - aa; return 3.4 * (b * xx * (L * L - b * b - xx * xx) / (6 * L)) / (L * L * L / 48); };
    const B = [], T = [];
    for (let i = 0; i <= 6; i++) { const d = dl(PW * i); B.push([X0 + PW * i, 46 + d]); T.push([X0 + PW * i, 37 + 0.9 * d]); }
    const web = "#aab1b9";
    // Warren truss: equilateral-style zig-zag of diagonals, no verticals; top joints at 1, 3, 5
    for (let i = 0; i < 6; i += 2) { line(B[i][0], B[i][1], T[i + 1][0], T[i + 1][1], web); line(T[i + 1][0], T[i + 1][1], B[i + 2][0], B[i + 2][1], web); }
    const load = clamp(dl(L / 2) / 3.4, 0, 1), tens = load > 0.15 ? "#8fd4ff" : "#6fb0d6", comp = load > 0.15 ? "#ff8a5c" : "#d9805a";
    for (let i = 1; i < 5; i += 2) line(T[i][0], T[i][1], T[i + 2][0], T[i + 2][1], comp, 2);
    for (let i = 0; i < 6; i++) { line(B[i][0], B[i][1], B[i + 1][0], B[i + 1][1], tens, 2); }
    [B[0], B[2], B[4], B[6], T[1], T[3], T[5]].forEach(([x, y]) => px(x - 1, y - 1, 3, 3, BRASS_L));              // pinned joints
    // the minecart and its iron load
    const x = cx, yd = x >= X0 && x <= X0 + L ? 46 + dl(x - X0) : 47;
    px(x - 3, yd - 4, 7, 3, IRON); px(x - 3, yd - 4, 7, 1, IRON_L); px(x - 2, yd - 6, 5, 2, BRASS);
    px(x - 2, yd - 1, 2, 1, "#222"); px(x + 1, yd - 1, 2, 1, "#222");
  }

  /* ---------- the Grob Tutor ---------- */
  function tutor(x, y, hd, dir, t, o = {}) {
    c.save(); c.translate(Math.round(x), Math.round(y));
    c.rotate(hd - Math.PI);
    if (dir > 0) c.scale(1, -1);
    const X = -7, Y = -3, body = o.body || "#eceae2";
    px(X, Y + 2, 14, 3, body); px(X + 4, Y, 4, 7, body); px(X + 11, Y, 2, 3, "#c8102e"); px(X + 1, Y + 2, 2, 2, "#2f6fd0");
    px(X + 6, Y + 3, 1, 1, "#c8102e"); px(X + 5, Y + 6, 3, 1, COPPER);
    if (o.blur) px(X - 2, Y, 1, 7, "rgba(200,200,200,.6)"); else px(X - 1, Y + 3 - flick(t, 16), 1, 2, "#555");
    c.restore();
  }
  function pilot(x, y, chute, wave) {
    if (chute) {
      px(x - 3, y - 11, 7, 2, "#c8102e"); px(x - 2, y - 12, 5, 1, "#c8102e"); px(x - 1, y - 11, 1, 2, "#f2ead8"); px(x + 1, y - 11, 1, 2, "#f2ead8");
      px(x - 3, y - 9, 1, 4, "#dddddd"); px(x + 3, y - 9, 1, 4, "#dddddd");
    }
    px(x, y - 5, 1, 1, "#f0c8a0"); px(x - 1, y - 4, 3, 2, "#5b6f8f"); px(x - 1, y - 2, 1, 2, "#2a2a2a"); px(x + 1, y - 2, 1, 2, "#2a2a2a");
    if (wave) px(x + 2, y - 6, 1, 2, "#f0c8a0");
  }
  const bannerCache = {};
  function bannerImg(s) {
    if (bannerCache[s]) return bannerCache[s];
    const b = document.createElement("canvas"); b.width = [...s].length * 4 + 7; b.height = 9;
    const g = b.getContext("2d");
    g.fillStyle = "#f4ecd8"; g.fillRect(0, 0, b.width, 9);
    g.fillStyle = "#b04a12"; g.fillRect(0, 0, b.width, 1); g.fillRect(0, 8, b.width, 1);
    g.fillStyle = "#3a1c0c";
    [...s].forEach((ch, i) => { const gl = FONT[ch] || FONT[" "]; for (let q = 0; q < 15; q++) if (gl[q] === "1") g.fillRect(4 + i * 4 + (q % 3), 2 + Math.floor(q / 3), 1, 1); });
    return (bannerCache[s] = b);
  }
  // where each banner column hangs: at fixed distances back along the path actually flown
  function bannerCols(P, img, u, eps) {
    const out = [], dir = P.dir, GAP = 12, pts = [];
    for (let k = 0; k < 520; k++) pts.push(P.pos(u - k * 0.025));
    let acc = 0, j = 0;
    for (let i = 0; i < img.width; i++) {
      const d = GAP + i * (1 + (eps || 0));
      let seg = Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y);
      while (j < pts.length - 2 && acc + seg < d) { acc += seg; j++; seg = Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y); }
      const f = Math.min(1, (d - acc) / (seg || 1e-9));
      out.push({ x: pts[j].x + (pts[j + 1].x - pts[j].x) * f, y: pts[j].y + (pts[j + 1].y - pts[j].y) * f, col: dir > 0 ? img.width - 1 - i : i });
    }
    return out;
  }
  function drawBanner(P, u, fall) {
    const img = bannerImg(P.banner), at = fall ? fall.at : u, eps = P.eps ? P.eps(at) : 0, cols = bannerCols(P, img, at, eps), p = P.pos(at);
    const e = fall ? u - fall.at : 0, wide = eps > 0.02 ? 2 : 1;
    if (!fall) { const q = cols[0]; for (let k = 7; k < 12; k += 2) if (q) px(p.x - P.dir * k, p.y + (q.y - 4 - p.y) * (k - 7) / 5, 1, 1, "#aaa"); }
    cols.forEach((q, i) => {
      let x = q.x, y = q.y - 4;
      if (fall) { x += P.dir * 14 * (1 - Math.exp(-0.6 * e)) / 0.6; y += 9 * e * e + Math.sin(e * 6 + i * 0.25) * 1.5; }
      if (y > SEA - 2 || y < -10 || x < -2 || x > W + 2) return;
      c.drawImage(bannerImg(P.banner), q.col, 0, 1, 9, Math.round(x), Math.round(y), wide, 9);
    });
  }
  function splash(x, s) { const h = Math.max(0, 6 - s * 6); if (h > 0) { px(x - 4, SEA - h, 2, h, "#e9f6ff"); px(x, SEA - h * 1.3, 2, h * 1.3, "#e9f6ff"); px(x + 4, SEA - h * 0.8, 2, h * 0.8, "#e9f6ff"); } }
  const heading = (P, u) => { if (P.hd) return P.hd(u); const a = P.pos(u - 0.04), b = P.pos(u + 0.04); return Math.atan2(b.y - a.y, b.x - a.x) || (P.dir > 0 ? 0 : Math.PI); };

  /* ---------- the eight passes ---------- */
  const BLOCKS = Array.from({ length: 16 }, (_, i) => ({ vx: -14 + ((i * 37) % 29), vy: -18 + ((i * 53) % 23), s: 1 + (i % 3), col: ["#e8e8e8", "#c8102e", "#2f6fd0", "#e8e8e8", "#555"][i % 5] }));
  // 3. positive feedback: the error feeds itself
  const pfY = (u) => 26 + 1.4 * Math.exp(0.4 * u) * Math.sin(2.4 * u);
  let CRASH = 8; for (let u = 4; u < 12; u += 0.01) if (pfY(u) > SEA - 5) { CRASH = u; break; }
  // 7. stress-strain: strain of the banner and the matching stress on the mini graph
  const eps7 = (u) => (u < 2 ? 0 : u < 6 ? 0.04 * (u - 2) : u < 8 ? 0.16 + 0.11 * (u - 6) : 0.38 + 0.08 * Math.min(u - 8, 1.4));
  const sig7 = (e) => (e < 0.16 ? e / 0.16 * 0.8 : e < 0.38 ? 0.8 + 0.02 * (e - 0.16) / 0.22 : 0.82 + 0.18 * (e - 0.38) / 0.12);
  // 8. pi = 3
  const LC = 150, LR = 14, LY = 26, LU1 = (LC + 20) / 30, LA = 6, LDUR = LA * LR / 30;
  const loopPos = (u) => {
    if (u < LU1) return { x: -20 + 30 * u, y: LY + LR };
    if (u < LU1 + LDUR) { const al = (u - LU1) * 30 / LR; return { x: LC + LR * Math.sin(al), y: LY + LR * Math.cos(al) }; }
    const tau = u - LU1 - LDUR, th0 = Math.atan2(-Math.sin(LA), Math.cos(LA)), xe = LC + LR * Math.sin(LA), ye = LY + LR * Math.cos(LA);
    return { x: xe + 30 * tau, y: ye + 30 * Math.sin(th0) * (1 - Math.exp(-1.5 * tau)) / 1.5 };
  };
  const SEQ = [
    { label: "V=IR", len: 15, dir: 1, banner: "V=IR", pos: (u) => ({ x: u < 4.25 ? -20 + 40 * u : 150 + 20 * (u - 4.25), y: 18 }) },
    { label: "P=2πnT", len: 11, dir: -1, banner: "P=2πnT", tear: 5.2,
      pos: (u) => { if (u < 5) return { x: 335 - 34 * u, y: 16 }; const e = u - 5; return { x: 165 - 650 * e, y: 16 - 4 * e }; } },
    { label: "POSITIVE FEEDBACK", len: CRASH + 7.5, dir: 1, banner: "POSITIVE FEEDBACK", crash: CRASH, pos: (u) => ({ x: -20 + 36 * Math.min(u, CRASH), y: pfY(Math.min(u, CRASH)) }) },
    { label: "NEGATIVE FEEDBACK", len: 13, dir: 1, banner: "NEGATIVE FEEDBACK", pos: (u) => ({ x: -20 + 34 * u, y: 28 - 20 * Math.exp(-0.5 * u) * Math.cos(2.4 * u) }) },
    { label: "COMPARATOR", len: 13, dir: -1, banner: "CLIPPED AT THE RAILS", pos: (u) => { const x = 335 - 32 * u; return { x, y: 28 + clamp(18 * Math.sin(x / 18), -11, 11) }; } },
    { label: "3 BIT ADC", len: 13, dir: 1, banner: "3 BIT ADC", hd: () => 0,
      pos: (u) => { const x = -20 + 30 * u, s = Math.sin((Math.floor(x / 12) * 12 + 6) / 20), q = clamp(Math.round(3.5 + 3.5 * s), 0, 7); return { x, y: 42 - 4 * q }; } },
    { label: "E=SIGMA/EPSILON", len: 14, dir: 1, banner: "E=STRESS/STRAIN", tear: 9.4, eps: eps7, pos: (u) => ({ x: -20 + 30 * u, y: 22 }) },
    { label: "PI=3", len: 15, dir: 1, banner: "USE THE PI BUTTON", pos: loopPos },
  ];
  SEQ[6].label = "E=STRESS/STRAIN";
  let acc = 0; SEQ.forEach((P) => { P.start = acc; acc += P.len; });
  const CYCLE = acc;
  const passAt = (t) => { let u = ((t % CYCLE) + CYCLE) % CYCLE, i = 0; while (u >= SEQ[i].len) { u -= SEQ[i].len; i++; } return { P: SEQ[i], u, i }; };

  // things drawn under the banner and aircraft (graphs, rails, signs)
  function under(P, i, u, t, sy) {
    if (i === 0) {   // the resistor: a zigzag in the Tutor's path
      const hot = u > 4.25 && u < 7 ? Math.max(0, 1 - (u - 4.25) / 2.75) : 0;
      px(147, 5, 2, 28, IRON_D); px(152, 5, 2, 28, IRON_D);
      const col = hot > 0 ? (flick(t, 12) ? "#ff7a3a" : "#ffb25a") : BRASS_L;
      let yy = 7; for (let k = 0; k < 8; k++) { line(150 + (k % 2 ? 2 : -2), yy, 150 + (k % 2 ? -2 : 2), yy + 3, col); yy += 3; }
    }
    if (i === 2) {   // the exponentially growing envelope of the error
      for (let x = 0; x < W; x += 3) { const uu = (x + 20) / 36; if (uu > CRASH || uu > u) continue; const e = 1.4 * Math.exp(0.4 * uu); px(x, 26 - e, 1, 1, "rgba(255,120,100,.8)"); px(x, 26 + e, 1, 1, "rgba(255,120,100,.8)"); }
      for (let x = 0; x < W; x += 4) px(x, 26, 2, 1, "rgba(255,255,255,.35)");
    }
    if (i === 3) {   // the same error with a settling envelope
      for (let x = 0; x < W; x += 3) { const uu = (x + 20) / 34; if (uu > u) continue; const e = 20 * Math.exp(-0.5 * uu); px(x, 28 - e, 1, 1, "rgba(120,220,150,.8)"); px(x, 28 + e, 1, 1, "rgba(120,220,150,.8)"); }
      for (let x = 0; x < W; x += 4) px(x, 28, 2, 1, "rgba(255,255,255,.35)");
    }
    if (i === 4) {   // the rails, the ideal sine and the clipped output
      for (let x = 0; x < W; x += 4) { px(x, 17, 2, 1, "rgba(255,90,70,.85)"); px(x, 39, 2, 1, "rgba(255,90,70,.85)"); }
      for (let x = 0; x < W; x += 2) px(x, 28 + 18 * Math.sin(x / 18), 1, 1, "rgba(255,255,255,.3)");
    }
    if (i === 5) {   // eight levels and the ideal curve
      for (let k = 0; k < 8; k++) for (let x = 0; x < W; x += 4) px(x, 14 + 4 * k, 1, 1, "rgba(255,255,255,.28)");
      for (let x = 0; x < W; x += 2) px(x, 28 - 14 * Math.sin(x / 20), 1, 1, "rgba(120,200,255,.5)");
    }
    if (i === 6) {   // the stress-strain graph, with a dot riding the curve
      const gx = 248, gy = 14;
      px(gx - 2, gy - 2, 36, 28, "rgba(20,12,6,.78)");
      line(gx, gy, gx, gy + 22, "#fff0c0"); line(gx, gy + 22, gx + 31, gy + 22, "#fff0c0");
      for (let e = 0; e <= 0.5; e += 0.01) px(gx + e * 60, gy + 22 - sig7(e) * 20, 1, 1, "#ffb25a");
      const live = u < P.tear;
      if (live) { const e = eps7(u); px(gx + e * 60 - 1, gy + 22 - sig7(e) * 20 - 1, 3, 3, "#ff3a2a"); }
      else { px(gx + 0.5 * 60 - 1, gy + 22 - 20 - 1, 3, 3, "#ff3a2a");  }
    }
    if (i === 7) {   // the circle the loop should have made, and the gap
      for (let k = 0; k < 64; k++) { const a = k * Math.PI / 32; if (k % 2) px(LC + LR * Math.sin(a), LY + LR * Math.cos(a), 1, 1, "rgba(255,255,255,.4)"); }
      if (u > LU1 + LDUR) { const ex = LC + LR * Math.sin(LA), ey = LY + LR * Math.cos(LA); line(ex, ey + 2, LC, LY + LR + 2, "#ff4b3a");  }
    }
  }
  function readoutFor(P, i, u) {
    if (i === 0) readout(u < 4.25 ? "R=6 I=2" : "R=12 I=1");
    else if (i === 1) { readout(u < 5 ? "n=50 REV/S" : "n=3000 REV/MIN"); }
    else if (i === 2 && u < P.crash) readout("ERR=" + Math.round(1.4 * Math.exp(0.4 * u)));
    else if (i === 2) readout("ERR=MAX");
    else if (i === 3) readout("ERR=" + Math.round(20 * Math.exp(-0.5 * u)));
    else if (i === 4) { const p = P.pos(u), y = 28 + 18 * Math.sin(p.x / 18); readout(y < 17 ? "VO=+VCC" : y > 39 ? "VO=-VCC" : "VO=LINEAR"); }
    else if (i === 5) { const p = P.pos(u), q = (42 - p.y) / 4; readout("ADC=" + ((q >> 2) & 1) + ((q >> 1) & 1) + (q & 1)); }
    else if (i === 6) readout(u < P.tear ? "STRAIN " + eps7(u).toFixed(2) : "FRACTURE");
    else if (i === 7) readout(u > LU1 ? "PI=3" : "C=2PIR");
  }
  function overlay(P, i, u, t, sy) {
    const base = t - u;
    if (i === 1 && u > 5.4 && u < 10.4) { px(194, 17, 69, 9, "rgba(20,12,6,.8)"); text("WRONG UNITS: /60", 196, 19, flick(u, 3) ? "#ffd23a" : "#ff8a3a"); }
    let tear = null;
    if (P.tear && u >= P.tear) tear = { at: P.tear };
    if (P.crash && u >= P.crash) tear = { at: P.crash };
    drawBanner(P, u, tear);
    if (P.crash && u >= P.crash) {
      const s = u - P.crash, p = P.pos(P.crash), x0 = p.x, y0 = p.y;
      if (s < 0.15) px(x0 - 8, y0 - 8, 16, 16, "#fffbe6");
      BLOCKS.forEach((b) => { const x = x0 + b.vx * s, y = y0 + b.vy * s + 13 * s * s; if (y < SEA) px(x, y, b.s + 1, b.s + 1, b.col); else if (y < SEA + 20) splash(x, (y - SEA) / 20); });
      const tx = 134, ty = SEA - 14 + sy;
      if (s < 0.7) pilot(x0 - 6 * s, y0 - 14 * s + 13 * s * s, false, false);
      else if (s < 6.7) { const f = (s - 0.7) / 6, sm = f * f * (3 - 2 * f), ax = x0 - 4.2, ay = y0 - 14 * 0.7 + 13 * 0.49; pilot(ax + (tx - ax) * sm, ay + (ty - ay) * f, true, false); }
      else pilot(tx, ty, false, flick(s, 3) === 0);
      return;
    }
    if (P.tear && u >= P.tear && i === 1) return;                    // gone: n was in rev/min
    const p = P.pos(u), hd = heading(P, u);
    if (p.x > -16 && p.x < W + 16) tutor(p.x, p.y, hd, P.dir, t, { blur: i === 1 && u > 4.9 });
    if (i === 1 && u >= 5 && u < 5.5) for (let k = 0; k < 6; k++) px(Math.max(0, p.x + 10 + k * 14), p.y + 2 + (k % 2), 8, 1, "rgba(255,255,255,.6)");
  }

  /* ---------- the frame ---------- */
  const seaGrad = (() => { const g = mainCtx.createLinearGradient(0, SEA, 0, H); g.addColorStop(0, "#2b6174"); g.addColorStop(1, "#102c3c"); return g; })();
  const CLOUDS = [[20, 9, 22], [140, 20, 28], [250, 6, 18]];
  function frame(now) {
    const t = reduced ? still : (now - t0) / 1000;
    const sy = Math.round(Math.sin(t * 1.1 + 0.5));
    c = mainCtx;
    c.drawImage(skyLayer, 0, 0);
    CLOUDS.forEach(([x0, y0, w]) => { const x = ((x0 + t * 1.6) % (W + 60)) - 30; px(x, y0, w, 2, "rgba(255,240,220,.35)"); px(x + 4, y0 - 1, w - 10, 1, "rgba(255,240,220,.3)"); });
    c.fillStyle = seaGrad; c.fillRect(0, SEA, W, H - SEA);
    for (let x = 0; x < W; x += 2) {
      px(x, SEA + Math.round(1.3 * Math.sin(x / 10 - t * 1.5)), 2, 1, "#d6ecf2");
      px(x, SEA + 7 + Math.round(1.2 * Math.sin(x / 8 - t * 1.2 + 1)), 2, 1, "rgba(160,215,235,.4)");
      px(x, SEA + 14 + Math.round(1.2 * Math.sin(x / 12 - t * 1.0 + 2)), 2, 1, "rgba(160,215,235,.25)");
    }
    c.drawImage(shipLayer, 0, sy);
    c.drawImage(quayLayer, 0, 0);
    bridge(t);
    gears(t, sy);
    wheel(t, sy);
    // signal flags strung between the main and fore mastheads
    for (let k = 0; k < 6; k++) { const f = (k + 0.5) / 6, x = lerp(129, 157, f), y = lerp(5, 11, f) + 1 + Math.round(Math.sin(t * 5 + k) * 0.6) + sy; px(x, y, 2, 3, ["#c8102e", "#f2ead8", "#2f6fd0", "#e0b23a", "#f2ead8", "#c8102e"][k]); }
    dust(t);
    const { P, u, i } = passAt(t);
    // the label of the law being flown
    under(P, i, u, t, sy);
    overlay(P, i, u, t, sy);
  }
  /* ---------- the loop, pause, off-screen and reduced-motion handling ---------- */
  let t0 = performance.now(), raf = 0, running = true, tPaused = 0, last = 0;
  // the still frame: the stress-strain pass, banner stretched flat across the sky, a gust blowing at the wheel
  let still = SEQ[6].start + 4.8;
  { const gs = 3 + GUST_T * Math.ceil((SEQ[6].start + 2 - 3) / GUST_T); if (gs + 0.9 - SEQ[6].start < SEQ[6].len - 6) still = gs + 1.4; }
  function tick(now) {
    if (!running || reduced) return;
    if (now - last >= 30) { last = now; frame(now); }   // about 30 frames a second: smooth enough, half the cost
    raf = requestAnimationFrame(tick);
  }
  const btn = document.getElementById("hero-pause");
  function sync() { if (btn) btn.textContent = running && !reduced ? "Pause animation" : "Play animation"; }
  if (btn) btn.addEventListener("click", () => {
    if (reduced) { reduced = false; running = true; t0 = performance.now(); raf = requestAnimationFrame(tick); sync(); return; }
    running = !running;
    if (running) { t0 = performance.now() - tPaused * 1000; raf = requestAnimationFrame(tick); } else { tPaused = (performance.now() - t0) / 1000; cancelAnimationFrame(raf); }
    sync();
  });
  if ("IntersectionObserver" in window) new IntersectionObserver((e) => {
    cancelAnimationFrame(raf);
    if (e[0].isIntersecting && running && !reduced) raf = requestAnimationFrame(tick);
  }).observe(cv);
  // a seek hook for testing screenshots: heroSeek(seconds) shows that moment and holds it
  cv.heroSeek = (s) => { running = false; reduced = false; cancelAnimationFrame(raf); t0 = performance.now() - s * 1000; frame(performance.now()); };
  frame(performance.now());
  sync();
})();
