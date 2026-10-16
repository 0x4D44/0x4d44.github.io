/* Briefing-room hero: a low-resolution pixel scene (Minecraft-style) of the frigate
   HMS Lodestone on a graph-paper sea. Every moving thing is a Higher Maths curve:
   the swell is a wave function, 0.9 cos t + 0.6 sin t, drawn as its two parts and their sum;
   the bow chaser's shot is a parabola with a red tangent riding along it.
   Then the running joke: nine passes by the squadron's Grob Tutor, each flying a graph
   and each graph behaving exactly as the maths says it must:
     y = c level flight · y = sin x · y = tan x (lost at the asymptotes, back out of the sea)
     · y = 1/x (never quite lands) · the forgotten +C · exponential parrots
     · a roll of 360 radians · flying into 1/0 · the wave function, and Q.E.D.
   Static for prefers-reduced-motion; paused when off-screen or by the button. */
(function () {
  "use strict";
  const cv = document.getElementById("hero-canvas");
  if (!cv) return;
  const W = 320, H = 80, SEA = 56;
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  let reduced = !!(window.HE && window.HE.reduced);
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  /* ---------- a 3x5 pixel font: capitals for banners, lower case for the maths ---------- */
  const FONT = {
    A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
    F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
    K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
    P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
    U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
    Z: "111001010100111",
    a: "000011101101011", c: "000011100100011", d: "001001111101111", e: "000010111100011", g: "000011101011110",
    i: "010000010010010", l: "110010010010111", m: "000111111101101", n: "000110101101101", o: "000010101101010",
    p: "000110101110100", r: "000101110100100", s: "000011100001110", t: "010111010010001", x: "000101010101000",
    y: "000101111001110", k: "100101110110101", h: "100100110101101",
    "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
    "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111",
    "-": "000000111000000", "+": "000010111010000", ".": "000000000000010", "=": "000111000111000", "/": "001001010100100",
    "^": "010101000000000", "(": "001010010010001", ")": "100010010010100", "!": "010010010000010", "?": "111001010000010", ":": "000010000010000", " ": "000000000000000",
  };
  const text = (s, x, y, col, k = 1) => { [...s].forEach((ch, i) => { const g = FONT[ch] || FONT[" "]; for (let q = 0; q < 15; q++) if (g[q] === "1") px(x + (i * 4 + (q % 3)) * k, y + Math.floor(q / 3) * k, k, k, col); }); };
  const flick = (t, n) => Math.floor(t * n) % 2;
  const readout = (s, col = "#fff6c8") => text(s, W - 4 - s.length * 4, 4, col);
  /* ---------- the cast ---------- */
  function ship(x, y) {
    // a frigate: one gun deck, black and ochre, three masts
    px(x + 2, y + 16, 52, 3, "#2a1f14");
    px(x, y + 12, 56, 4, "#1d1d1d"); px(x + 3, y + 19, 48, 3, "#1d1d1d");
    for (let i = 0; i < 8; i++) px(x + 6 + i * 6, y + 13, 3, 2, "#c99a2e");
    px(x + 52, y + 10, 8, 3, "#3b2a1a"); px(x + 58, y + 8, 9, 1, "#3b2a1a"); // bowsprit
    px(x - 2, y + 8, 7, 5, "#3b2a1a"); px(x - 1, y + 9, 5, 1, "#e0b23a");
    [[12, 30], [28, 36], [44, 28]].forEach(([mx, h]) => {
      px(x + mx, y + 12 - h, 2, h, "#3b2a1a");
      for (let k = 0; k < 3; k++) px(x + mx - 5 + k, y + 12 - h + 3 + k * 9, 12 - 2 * k, 6, "#f2ead8");
    });
    // a lodestone block flag at the main truck: grey stone with a blue core
    px(x + 29, y + 12 - 36 - 5, 5, 4, "#6b707a"); px(x + 30, y + 12 - 36 - 4, 3, 2, "#5fa9b8");
  }
  // the Grob Tutor, drawn nose-left about its centre; mirrored when it flies right
  function tutor(x, y, dir, o = {}) {
    c.save(); c.translate(Math.round(x), Math.round(y));
    if (dir > 0) c.scale(-1, 1);
    if (o.ang) c.rotate(dir > 0 ? -o.ang : o.ang);
    if (o.roll !== undefined) c.scale(1, Math.abs(o.roll) < 0.2 ? 0.2 : o.roll);
    const X = -7, Y = -3, body = o.body || "#e8e8e8";
    px(X, Y + 2, 14, 3, body); px(X + 4, Y, 4, 7, body); px(X + 11, Y, 2, 3, "#c8102e"); px(X + 1, Y + 2, 2, 2, "#1c5fb3");
    px(X + 6, Y + 3, 1, 1, "#c8102e"); px(X - 1, Y + 3 - flick(o.t || 0, 16), 1, 2, "#555");
    c.restore();
  }
  function pilot(x, y, chute, wave, col = "#c8102e") {
    // y is where the boots are
    if (chute) {
      px(x - 3, y - 11, 7, 2, col); px(x - 2, y - 12, 5, 1, col); px(x - 1, y - 11, 1, 2, "#f2ead8"); px(x + 1, y - 11, 1, 2, "#f2ead8");
      px(x - 3, y - 9, 1, 4, "#dddddd"); px(x + 3, y - 9, 1, 4, "#dddddd");
    }
    px(x, y - 5, 1, 1, "#f0c8a0");
    px(x - 1, y - 4, 3, 2, "#5b6f8f");
    px(x - 1, y - 2, 1, 2, "#2a2a2a"); px(x + 1, y - 2, 1, 2, "#2a2a2a");
    if (wave) px(x + 2, y - 6, 1, 2, "#f0c8a0");
  }
  // banners are pre-rendered once, then laid column by column along the flight path
  const bannerCache = {};
  function bannerImg(s) {
    if (bannerCache[s]) return bannerCache[s];
    const b = document.createElement("canvas"); b.width = s.length * 4 + 7; b.height = 9;
    const g = b.getContext("2d");
    g.fillStyle = "#f4ecd8"; g.fillRect(0, 0, b.width, 9);
    g.fillStyle = "#c8102e"; g.fillRect(0, 0, b.width, 1); g.fillRect(0, 8, b.width, 1);
    g.fillStyle = "#0d3436";
    [...s].forEach((ch, i) => { const gl = FONT[ch] || FONT[" "]; for (let q = 0; q < 15; q++) if (gl[q] === "1") g.fillRect(4 + i * 4 + (q % 3), 2 + Math.floor(q / 3), 1, 1); });
    return (bannerCache[s] = b);
  }
  /* Where each banner column hangs, for a craft at time u: either at fixed horizontal
     distances behind it on the graph y = f(x) (so a banner tears across an asymptote), or at
     fixed distances back along the flown path. Returns [{x, y, col}]. */
  function bannerCols(P, img, u) {
    const out = [], dir = P.dir, GAP = 12;
    if (P.fx) {
      const p = P.pos(u);
      for (let i = 0; i < img.width; i++) { const x = p.x - dir * (GAP + i); out.push({ x, y: P.fx(x), col: dir > 0 ? img.width - 1 - i : i }); }
      return out;
    }
    const pts = []; for (let k = 0; k < 480; k++) pts.push(P.pos(u - k * 0.025));
    let acc = 0, j = 0;
    for (let i = 0; i < img.width; i++) {
      const d = GAP + i;
      let seg = Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y);
      while (j < pts.length - 2 && acc + seg < d) { acc += seg; j++; seg = Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y); }
      const f = Math.min(1, (d - acc) / (seg || 1e-9));
      out.push({ x: pts[j].x + (pts[j + 1].x - pts[j].x) * f, y: pts[j].y + (pts[j + 1].y - pts[j].y) * f, col: dir > 0 ? img.width - 1 - i : i });
    }
    return out;
  }
  function drawBanner(P, u, s, fall) {
    const img = bannerImg(s), cols = bannerCols(P, img, fall ? fall.at : u), p = P.pos(fall ? fall.at : u);
    const e = fall ? u - fall.at : 0;
    if (!fall) for (let k = 7; k < 12; k += 2) { const q = cols[0]; if (q && Math.abs(q.y - p.y) < 30) px(p.x - P.dir * k, p.y + (q.y - p.y) * (k - 7) / 5, 1, 1, "#777"); }
    cols.forEach((q, i) => {
      let x = q.x, y = q.y - 4;
      if (fall) { x += P.dir * 14 * (1 - Math.exp(-0.6 * e)) / 0.6; y += 9 * e * e + Math.sin(e * 6 + i * 0.25) * 1.5; }
      if (y > SEA - 2 || y < -10 || x < -2 || x > W + 2) return;
      c.drawImage(img, q.col, 0, 1, 9, Math.round(x), Math.round(y), 1, 9);
    });
  }
  function splash(x, s) { const h = Math.max(0, 6 - s * 6); if (h > 0) { px(x - 4, SEA - h, 2, h, "#e9f6ff"); px(x, SEA - h * 1.3, 2, h * 1.3, "#e9f6ff"); px(x + 4, SEA - h * 0.8, 2, h * 0.8, "#e9f6ff"); } }
  // the swell: a cos t + b sin t, and the ship riding it
  const swell = (x, t) => 0.9 * Math.cos(x / 14 - t * 1.1) + 0.6 * Math.sin(x / 14 - t * 1.1);
  const shipAt = (t) => { const x = 96 + Math.sin(t * 0.2) * 24; return { x, y: SEA - 20 + Math.round(swell(x + 28, t) * 2) }; };
  /* A shot from the bow chaser that leaves at global time tf and is at (tx, ty) at time ta:
     a true parabola, g = 26 px/s², with its tangent and gradient drawn while it flies. */
  function shot(tf, ta, tx, ty, t, showGrad) {
    const a = t - tf, T = ta - tf;
    if (a < 0 || a > T + 1.4) return null;
    const sp = shipAt(tf), mx = sp.x + 66, my = sp.y + 8;
    const vx = (tx - mx) / T, vy = (ty - my - 13 * T * T) / T;
    if (a < 0.15) { const s2 = shipAt(t); px(s2.x + 65, s2.y + 6, 4, 4, "#ffb21e"); }
    for (let k = 0.2; k < a; k += 0.2) { const dy = my + vy * k + 13 * k * k; if (dy < SEA) px(mx + vx * k, dy, 1, 1, "rgba(255,255,255,.8)"); }
    const bx = mx + vx * a, by = my + vy * a + 13 * a * a;
    if (by < SEA) {
      if (showGrad) {
        const m = (vy + 26 * a) / vx; // dy/dx on screen (y grows downwards)
        for (let k = -8; k <= 8; k++) px(bx + k, by + m * k, 1, 1, "#ff4b3a");
        readout("shot dy/dx=" + (-m).toFixed(1).replace("-0.0", "0.0"));
      }
      px(bx - 1, by - 1, 3, 3, "#111");
    } else splash(bx, (by - SEA) / 20);
    return { x: bx, y: by };
  }
  /* ---------- the nine passes ---------- */
  const lvl = (x0, v, y, dir = 1) => (u) => ({ x: x0 + dir * v * u, y });
  const TANC = 130, TANS = 57.3, TANA = 6;
  const tanY = (x) => 24 - TANA * Math.tan((x - TANC) / TANS);
  const BLOCKS = Array.from({ length: 16 }, (_, i) => ({ vx: -14 + ((i * 37) % 29), vy: -18 + ((i * 53) % 23), s: 1 + (i % 3), col: ["#e8e8e8", "#c8102e", "#1c5fb3", "#e8e8e8", "#555"][i % 5] }));
  const PARROTS = Array.from({ length: 128 }, (_, i) => ({ x: 8 + ((i * 97) % 300), y: 4 + ((i * 41) % 40), col: ["#d8302e", "#3aa04a", "#2f6fd0", "#e0c030", "#38b8c8"][i % 5] }));
  const SEQ = [
    // 1. level flight: y = c
    { label: "y=c", len: 13, gun: true, dir: 1, fx: () => 13, pos: lvl(-20, 34, 13), banner: "HIGHER MATHS" },
    // 2. the sine curve, its smoke trail drawn as the graph
    { label: "y=sin x", len: 13, gun: true, dir: 1, fx: (x) => 22 + 7 * Math.sin(x / 13), pos(u) { const x = -20 + 32 * u; return { x, y: this.fx(x) }; }, banner: "SINE OF THE TIMES", smoke: true },
    // 3. tan x: up to infinity at each asymptote, and back out of the sea
    { label: "y=tan x", len: 14, dir: 1, fx: tanY, pos(u) { const x = -20 + 28 * u; return { x, y: tanY(x) }; }, banner: "MIND THE ASYMPTOTE", asym: [TANC - Math.PI / 2 * TANS, TANC + Math.PI / 2 * TANS] },
    // 4. y = 1/x: the gap to the sea keeps halving, so it never quite lands
    { label: "y=1/x", len: 13, dir: -1, banner: "NEVER QUITE LANDS",
      pos(u) {
        if (u < 0) return { x: 300 - 30 * u, y: SEA - 40 }; // level, on the way in
        const x = 300 - 11 * Math.min(u, 9.5), y = SEA - 4 - 36 / (1 + 0.9 * Math.min(u, 9.5));
        if (u <= 9.5) return { x, y };
        const e = u - 9.5; return { x: x + 30 * e * e, y: y - 18 * e * e }; // gives up, climbs away
      }, gap: true },
    // 5. the forgotten +C: aimed at the right curve, a constant out
    { label: "+C", len: 16, dir: 1, fx: () => 12, pos: lvl(-20, 30, 12), banner: "YOU FORGOT THE +C", plusC: true },
    // 6. exponential growth: parrots double every second
    { label: "y=2^t", len: 12, dir: 1, fx: () => 9, pos: lvl(-30, 34, 9), banner: "EXPONENTIAL GROWTH", parrots: true },
    // 7. a roll of 360... radians
    { label: "roll 360", len: 14, dir: 1, pos(u) { const x = -20 + 28 * u, w = u > 7.5 ? Math.sin(u * 9) * 3 * Math.exp(-(u - 7.5) / 2) : 0; return { x, y: 18 + w }; }, banner: "MEANT 360 DEGREES", roll: [3.5, 7.5] },
    // 8. dividing by zero
    { label: "1/0", len: 13, dir: 1, fx: () => 20, pos: lvl(-20, 30, 20), banner: "DIVIDE BY ZERO", zero: 228 },
    // 9. the wave function in formation, and the ship signals Q.E.D.
    { label: "3cos x+2sin x", len: 15, dir: 1, wave: true },
  ];
  let acc = 0; SEQ.forEach((P) => { P.start = acc; acc += P.len; });
  const CYCLE = acc;
  const passAt = (t) => { let u = ((t % CYCLE) + CYCLE) % CYCLE, i = 0; while (u >= SEQ[i].len) { u -= SEQ[i].len; i++; } return { P: SEQ[i], u }; };
  function slope(P, x) { return P.fx ? (P.fx(x + 0.5) - P.fx(x - 0.5)) : 0; }
  function joke(t) {
    const { P, u } = passAt(t), base = t - u;
    // ---- 3: the asymptotes, dashed
    if (P.asym) P.asym.forEach((ax) => { for (let y = 0; y < SEA; y += 4) px(ax, y, 1, 2, "rgba(255,90,70,.75)"); });
    // ---- 2: the smoke trail is the graph of the function flown so far
    if (P.smoke) { const p = P.pos(u); for (let x = Math.max(0, p.x - 260); x < p.x - 8; x += 1.5) px(x, P.fx(x), 1, 1, `rgba(255,255,255,${0.15 + 0.6 * (x - p.x + 260) / 260})`); }
    // ---- 6: the parrots double every second, then scatter
    if (P.parrots) {
      const n = Math.min(128, 2 ** Math.floor(Math.max(0, u - 0.5)));
      const leave = Math.max(0, u - 8.5);
      for (let i = 0; i < n; i++) { const q = PARROTS[i], x = q.x + Math.sin(t * 2 + i) * 2 + leave * leave * (12 + (i % 7) * 4), y = q.y + Math.cos(t * 3 + i) * 1.5 - leave * leave * (i % 3); px(x, y, 2, 2, q.col); px(x - 1 + flick(t + i * 0.1, 6) * 2, y - 1, 1, 1, q.col); }
      if (leave < 2) readout("n=" + n);
    }
    // ---- 8: the sign
    if (P.zero) {
      const hitU = (P.zero - 2 + 20) / 30;
      if (u < hitU) { px(P.zero - 2, 9, 30, 20, "rgba(13,52,54,.85)"); text("1/0", P.zero + 2, 12, "#ffd23a", 2); }
      else if (u < hitU + 6) text("UNDEFINED", P.zero - 16, 10 + Math.round(Math.sin(u * 4)), flick(u, 4) ? "#ffd23a" : "#ff6a1e");
    }
    // ---- 9: three Tutors fly 3 cos x, 2 sin x and their sum, R cos(x - a)
    if (P.wave) {
      const lanes = [[15, (x) => 4.5 * Math.cos(x / 16), "#ff6a6a"], [27, (x) => 3 * Math.sin(x / 16), "#ffffff"], [40, (x) => 4.5 * Math.cos(x / 16) + 3 * Math.sin(x / 16), "#7fb2ff"]];
      lanes.forEach(([y0, f, col], i) => {
        const x = -20 + 30 * (u - i * 0.6);
        for (let xx = Math.max(0, x - 280); xx < x - 8; xx += 1.5) px(xx, y0 - f(xx), 1, 1, col);
        if (x > -20 && x < W + 20) tutor(x, y0 - f(x), 1, { t, ang: -Math.atan(f(x + 0.5) - f(x - 0.5)) });
      });
      if (u > 3 && u < 12) readout("=k cos(x-a)", "#cfe6ff");
      if (u > 8.5) {
        const sp = shipAt(t), fx = sp.x + 33, fy = sp.y - 31;
        px(fx - 1, fy, 1, 10, "#3b2a1a");
        px(fx, fy, 33, 7, "#f4ecd8"); px(fx, fy, 33, 1, "#c8102e"); px(fx, fy + 6, 33, 1, "#c8102e");
        text("Q.E.D", fx + 3, fy + 1, "#0d3436"); px(fx + 25, fy + 2, 4, 4, "#0d3436"); // the tombstone that ends a proof
      }
      return;
    }
    // ---- 5: the bow chaser aims a solved parabola at the Tutor, and misses by exactly C
    let tear = null;
    if (P.plusC) {
      const T1 = 8.6, p1 = P.pos(T1), C = 14, tf1 = base + T1 - 2;
      shot(tf1, base + T1, p1.x, p1.y + C, t, true);
      if (u > T1 - 0.2 && u < T1 + 2.6) {
        // the curve it should have flown: the same parabola, C higher, dashed through the Tutor
        const s0 = shipAt(tf1), mx = s0.x + 66, my = s0.y + 8, T = 2, vx = (p1.x - mx) / T, vy = (p1.y + C - my - 13 * T * T) / T;
        for (let k = 0.1; k < T; k += 0.1) if (Math.floor(k * 10) % 2) px(mx + vx * k, my + vy * k + 13 * k * k - C, 1, 1, "#ffd23a");
        if (u > T1) { for (let y = p1.y + 3; y < p1.y + C; y += 2) px(p1.x, y, 1, 1, "#ff4b3a"); text("C", p1.x + 3, p1.y + 4, "#ff4b3a"); }
      }
      // the second shot remembers the +C, and finds the banner
      const T2 = 11.2, img = bannerImg(P.banner), mid = bannerCols(P, img, T2)[Math.floor(img.width / 2)];
      shot(base + T2 - 1.8, base + T2, mid.x, mid.y, t, u > T1 + 1.2);
      if (u > T2) tear = { at: T2 };
    }
    // ---- the Tutor and its banner
    const crash = P.zero ? (P.zero - 2 + 20) / 30 : Infinity;
    if (P.zero && u >= crash) tear = { at: crash };
    if (P.banner) drawBanner(P, u, P.banner, tear);
    if (u < crash) {
      const p = P.pos(u);
      if (P.asym && (p.y > SEA - 2 || p.y < -10)) { if (p.y > SEA - 2 && p.y < SEA + 40) splash(p.x, 0.2); }
      else {
        let roll;
        if (P.roll && u > P.roll[0] && u < P.roll[1]) {
          const f = (u - P.roll[0]) / (P.roll[1] - P.roll[0]), th = 360 * f;
          roll = Math.cos(th);
          { const n = Math.floor(th / (2 * Math.PI)); readout(n + (n === 1 ? " roll" : " rolls")); }
        } else if (P.roll && u >= P.roll[1]) readout("57.3 rolls");
        const ang = P.fx ? -Math.atan(slope(P, p.x)) : 0;
        tutor(p.x, p.y, P.dir, { t, ang, roll });
        if (P.asym) { const q = P.pos(u - 0.06); if (q.y > SEA - 2 && p.y <= SEA - 2) splash(p.x, 0); }
      }
      if (P.gap && u < 9.8) {
        for (let y = p.y + 4; y < SEA - 1; y += 2) px(p.x - 9, y, 1, 1, "#ffd23a");
        const g = 36 / (1 + 0.9 * Math.min(u, 9.5));
        readout("gap=" + (g / 8).toFixed(2));
      }
    } else {
      // 8: the Tutor breaks into blocks; the pilot parachutes onto the deck
      const s = u - crash, x0 = P.zero - 2, y0 = 20;
      if (s < 0.15) px(x0 - 8, y0 - 8, 16, 16, "#fffbe6");
      BLOCKS.forEach((b) => { const x = x0 + b.vx * s, y = y0 + b.vy * s + 13 * s * s; if (y < SEA) px(x, y, b.s + 1, b.s + 1, b.col); else if (y < SEA + 20) splash(x, (y - SEA) / 20); });
      const sp = shipAt(t), tx = sp.x + 22, ty = sp.y + 12;
      if (s < 0.7) pilot(x0 - 6 * s, y0 - 14 * s + 13 * s * s, false, false);
      else if (s < 5.7) { const f = (s - 0.7) / 5, sm = f * f * (3 - 2 * f), ax = x0 - 4.2, ay = y0 - 14 * 0.7 + 13 * 0.49; pilot(ax + (tx - ax) * sm, ay + (ty - ay) * f, true, false); }
      else pilot(tx, ty, false, flick(s, 3) === 0);
    }
  }
  /* ---------- the frame ---------- */
  let t0 = performance.now(), raf = 0, running = true, tPaused = 0;
  function frame(now) {
    // the still frame for reduced motion: mid-way through the sine pass
    const t = reduced ? SEQ[1].start + 6.2 : (now - t0) / 1000;
    const g = c.createLinearGradient(0, 0, 0, SEA); g.addColorStop(0, "#1f5e66"); g.addColorStop(1, "#9fd2d0");
    c.fillStyle = g; c.fillRect(0, 0, W, SEA);
    c.fillStyle = "rgba(255,255,255,.07)";
    for (let x = 0; x < W; x += 8) c.fillRect(x, 0, 1, SEA);
    for (let y = 0; y < SEA; y += 8) c.fillRect(0, y, W, 1);
    px(296, 20, 10, 10, "#ffe27a"); px(298, 18, 6, 14, "#ffe27a"); px(294, 22, 14, 6, "#ffe27a");
    px(0, SEA - 6, 64, 6, "#4f7a3a"); px(10, SEA - 10, 28, 4, "#4f7a3a"); px(18, SEA - 14, 10, 4, "#5f8a4a");
    // sea, with the swell drawn as its sum (white crest) and, faintly, its two parts
    px(0, SEA, W, H - SEA, "#226f86");
    for (let x = 0; x < W; x++) {
      const a = 0.9 * Math.cos(x / 14 - t * 1.1), b = 0.6 * Math.sin(x / 14 - t * 1.1);
      px(x, SEA + 9 + Math.round(a * 3), 1, 1, "rgba(160,215,240,.55)");
      px(x, SEA + 15 + Math.round(b * 3), 1, 1, "rgba(160,215,240,.4)");
      px(x, SEA + 1 + Math.round(swell(x, t) * 2), 1, 1, "#e9f6ff");
    }
    const sp = shipAt(t);
    ship(sp.x, sp.y);
    // the routine bow chaser, every 5.5 s on the quiet passes: a parabola with its tangent
    const { P, u } = passAt(t);
    if (P.gun) {
      const k = Math.floor(u / 5.5), tf = t - u + k * 5.5;
      if (u - k * 5.5 < 4.2) { const s0 = shipAt(tf); shot(tf, tf + 3, s0.x + 66 + 110, SEA + 2, t, true); }
    }
    // the function being flown, on a chart-table label (under the banners, so it never hides one)
    const L = P.label;
    px(2, 2, L.length * 4 + 3, 9, "rgba(13,52,54,.8)"); text(L, 4, 4, "#fff6c8");
    joke(t);
    if (running && !reduced) raf = requestAnimationFrame(frame);
  }
  const btn = document.getElementById("hero-pause");
  function sync() { if (btn) { btn.textContent = running && !reduced ? "Pause animation" : "Play animation"; } }
  if (btn) btn.addEventListener("click", () => {
    if (reduced) { reduced = false; running = true; t0 = performance.now(); raf = requestAnimationFrame(frame); sync(); return; }
    running = !running;
    if (running) { t0 = performance.now() - tPaused * 1000; raf = requestAnimationFrame(frame); } else { tPaused = (performance.now() - t0) / 1000; cancelAnimationFrame(raf); }
    sync();
  });
  if ("IntersectionObserver" in window) new IntersectionObserver((e) => {
    cancelAnimationFrame(raf);
    if (e[0].isIntersecting && running && !reduced) raf = requestAnimationFrame(frame);
  }).observe(cv);
  frame(performance.now());
  sync();
})();
