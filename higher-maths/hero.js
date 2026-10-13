/* Briefing-room hero: a low-resolution pixel scene (Minecraft-style) of the frigate
   HMS Lodestone on a graph-paper sea. Every moving thing is a Higher Maths curve:
   - the swell is a wave function, 3 cos t + 2 sin t = √13 cos(t − α), drawn as its two parts
     and their sum;
   - the bow chaser's shot follows a parabola, and a red tangent rides along it with its
     gradient (the derivative) shown in the corner;
   - an Air Cadet Grob Tutor flies a sine curve, leaving a smoke trail that is its graph.
   Static for prefers-reduced-motion; paused when off-screen or by the button. */
(function () {
  "use strict";
  const cv = document.getElementById("hero-canvas");
  if (!cv) return;
  const W = 320, H = 80;
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  let reduced = !!(window.HM && window.HM.reduced);
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  // tiny 3x5 pixel font
  const FONT = { "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001", "5": "111100111001111", "6": "111100111101111", "7": "111001001001001", "8": "111101111101111", "9": "111101111001111", "-": "000000111000000", "+": "000010111010000", ".": "000000000000010", "=": "000111000111000", "/": "001001010100100", d: "001001111101111", x: "000101010101000", y: "000101111001110", m: "000111111101101", " ": "000000000000000" };
  const text = (s, x, y, col) => { [...s].forEach((ch, i) => { const g = FONT[ch] || FONT[" "]; for (let k = 0; k < 15; k++) if (g[k] === "1") px(x + i * 4 + (k % 3), y + Math.floor(k / 3), 1, 1, col); }); };
  const SEA = 56;
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
  function tutor(x, y) {
    px(x, y + 2, 14, 3, "#e8e8e8"); px(x + 4, y, 4, 7, "#e8e8e8"); px(x + 11, y, 2, 3, "#c8102e"); px(x + 1, y + 2, 2, 2, "#1c5fb3");
    px(x + 6, y + 3, 1, 1, "#c8102e"); px(x - 1, y + 3, 1, 1, "#555");
  }
  // the swell: two component waves and their sum (a cos t + b sin t)
  const swell = (x, t) => 0.9 * Math.cos(x / 14 - t * 1.1) + 0.6 * Math.sin(x / 14 - t * 1.1);
  let t0 = performance.now(), raf = 0, running = true, tPaused = 0;
  function frame(now) {
    const t = reduced ? 4.2 : (now - t0) / 1000;
    // sky with faint graph-paper squares
    const g = c.createLinearGradient(0, 0, 0, SEA); g.addColorStop(0, "#1f5e66"); g.addColorStop(1, "#9fd2d0");
    c.fillStyle = g; c.fillRect(0, 0, W, SEA);
    c.fillStyle = "rgba(255,255,255,.07)";
    for (let x = 0; x < W; x += 8) c.fillRect(x, 0, 1, SEA);
    for (let y = 0; y < SEA; y += 8) c.fillRect(0, y, W, 1);
    px(282, 8, 10, 10, "#ffe27a"); px(284, 6, 6, 14, "#ffe27a"); px(280, 10, 14, 6, "#ffe27a");
    // distant blocky island
    px(0, SEA - 6, 64, 6, "#4f7a3a"); px(10, SEA - 10, 28, 4, "#4f7a3a"); px(18, SEA - 14, 10, 4, "#5f8a4a");
    // sea, with the swell drawn as its sum (white crest) and, faintly, its two parts
    px(0, SEA, W, H - SEA, "#226f86");
    for (let x = 0; x < W; x++) {
      const a = 0.9 * Math.cos(x / 14 - t * 1.1), b = 0.6 * Math.sin(x / 14 - t * 1.1);
      px(x, SEA + 9 + Math.round(a * 3), 1, 1, "rgba(160,215,240,.55)");
      px(x, SEA + 15 + Math.round(b * 3), 1, 1, "rgba(160,215,240,.4)");
      px(x, SEA + 1 + Math.round(swell(x, t) * 2), 1, 1, "#e9f6ff");
    }
    // the ship rides the swell
    const sx = 96 + Math.sin(t * 0.2) * 24, sy = SEA - 20 + Math.round(swell(sx + 28, t) * 2);
    ship(sx, sy);
    // the bow chaser: a parabola, with a tangent riding along it
    const period = 5.5, ph = (t % period) / period;
    const x0 = sx + 66, y0 = sy + 8, span = 120, peak = 30;
    const yAt = (u) => y0 - 4 * peak * u * (1 - u) + 10 * u * u; // a downward-opening quadratic in u
    for (let k = 0; k <= 24; k++) { const u = k / 24; if (u <= ph) px(x0 + u * span, yAt(u), 1, 1, "rgba(255,255,255,.75)"); }
    const bx = x0 + ph * span, by = yAt(ph);
    if (ph < 0.98) {
      // derivative: dy/dx in pixel units, drawn as a short red tangent and shown as a number
      const dydu = -4 * peak * (1 - 2 * ph) + 20 * ph, m = dydu / span; // screen y grows downwards
      for (let k = -9; k <= 9; k++) px(bx + k, by + m * k, 1, 1, "#ff4b3a");
      px(bx - 1, by - 1, 3, 3, "#111");
      text("dy/dx=" + (-m).toFixed(1).replace("-0.0", "0.0"), 4, 4, "#fff6c8");
    } else {
      // a splash on landing
      px(bx - 2, SEA - 3, 5, 3, "#e9f6ff");
    }
    // the Tutor flies y = sin x, its smoke trail is the graph
    const tx = ((t * 22) % (W + 60)) - 30;
    for (let k = 0; k < 70; k++) { const xx = tx - k * 1.5; if (xx < 0) break; px(xx, 22 + Math.round(6 * Math.sin(xx / 12)), 1, 1, "rgba(255,255,255," + (0.8 - k / 90) + ")"); }
    tutor(tx, 19 + Math.round(6 * Math.sin(tx / 12)));
    text("y=sin x", 214, 4, "#e9f6ff");
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
    if (!e[0].isIntersecting) { cancelAnimationFrame(raf); } else if (running && !reduced) { raf = requestAnimationFrame(frame); }
  }).observe(cv);
  frame(performance.now());
  sync();
})();
