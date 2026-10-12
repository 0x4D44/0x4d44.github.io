/* Briefing-room hero: a low-resolution pixel scene (Minecraft-style) of
   HMS Redstone under sail. Her bow chaser lobs a shot along a true parabola
   (constant horizontal velocity, constant downward acceleration, with the
   trail dots dropped at equal time intervals) while an Air Cadet Grob Tutor
   tows a banner. Static for prefers-reduced-motion; paused when off-screen. */
(function () {
  "use strict";
  const cv = document.getElementById("hero-canvas");
  if (!cv) return;
  const W = 320, H = 80;
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  let reduced = !!(window.HP && window.HP.reduced);
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  // tiny 3x5 pixel font for the banner
  const FONT = { A: "010101111101101", C: "011100100100011", E: "111100110100111", G: "011100101101011", H: "101101111101101", L: "100100100100111", Y: "101101010010010", K: "101101110101101", W: "101101111111101", B: "110101110101110", D: "110101101101110", I: "111010010010111", M: "101111111101101", N: "110101101101101", O: "010101101101010", P: "110101110100100", R: "110101110101101", S: "011100010001110", T: "111010010010010", U: "101101101101111", "": "000000000000000", " ": "000000000000000" };
  const text = (s, x, y, col) => { [...s].forEach((ch, i) => { const g = FONT[ch] || FONT[" "]; for (let k = 0; k < 15; k++) if (g[k] === "1") px(x + i * 4 + (k % 3), y + Math.floor(k / 3), 1, 1, col); }); };
  const clouds = [[20, 10, 26], [120, 6, 34], [230, 14, 22], [300, 8, 30]];
  const smoke = [];
  const balls = [];
  function ship(x, y) {
    // hull (black and ochre "Nelson chequer"), three masts, sails
    px(x + 2, y + 18, 62, 3, "#2a1f14");
    px(x, y + 14, 66, 4, "#1d1d1d"); px(x + 2, y + 21, 58, 3, "#1d1d1d"); px(x + 6, y + 24, 50, 2, "#3b2a1a");
    for (let i = 0; i < 9; i++) { px(x + 6 + i * 6, y + 15, 3, 2, "#c99a2e"); px(x + 6 + i * 6, y + 19, 3, 1, "#c99a2e"); }
    px(x + 60, y + 12, 8, 3, "#3b2a1a"); px(x + 66, y + 10, 10, 1, "#3b2a1a"); // bowsprit
    px(x - 2, y + 10, 8, 5, "#3b2a1a"); px(x - 1, y + 11, 6, 1, "#e0b23a"); // stern
    [[14, 34], [32, 40], [50, 32]].forEach(([mx, h]) => {
      px(x + mx, y + 14 - h, 2, h, "#3b2a1a");
      for (let k = 0; k < 3; k++) px(x + mx - 6 + k, y + 14 - h + 4 + k * 10, 14 - 2 * k, 7, "#f2ead8");
    });
    px(x + 33, y + 14 - 40 - 4, 6, 3, "#c8102e"); // ensign
  }
  function tutor(x, y) {
    px(x, y + 2, 14, 3, "#e8e8e8"); px(x + 4, y, 4, 7, "#e8e8e8"); px(x + 11, y, 2, 3, "#c8102e"); px(x + 1, y + 2, 2, 2, "#1c5fb3");
    px(x + 6, y + 3, 1, 1, "#c8102e"); px(x - 1, y + 3, 1, 1, "#555");
  }
  let t0 = performance.now(), raf = 0, running = true;
  function frame(now) {
    const t = reduced ? 6 : (now - t0) / 1000;
    // sky
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#2a5a9a"); g.addColorStop(1, "#9fc6e8");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    px(276, 8, 10, 10, "#ffe27a"); px(278, 6, 6, 14, "#ffe27a"); px(274, 10, 14, 6, "#ffe27a");
    clouds.forEach(([x, y, w]) => { const cx = ((x + t * 3) % (W + 60)) - 40; px(cx, y, w, 4, "#fff"); px(cx + 4, y - 3, w - 10, 3, "#fff"); });
    // distant land (a blocky Arran)
    px(0, 50, 70, 6, "#4f7a3a"); px(10, 46, 30, 4, "#4f7a3a"); px(18, 42, 12, 4, "#5f8a4a");
    // sea
    px(0, 54, W, 26, "#2f6fb5");
    for (let i = 0; i < 24; i++) { const wx = ((i * 37 + t * 8) % (W + 20)) - 10, wy = 58 + (i * 7) % 20; px(wx, wy, 6, 1, "#7fb2e6"); }
    // ship, gently pitching
    const sx = 120 + Math.sin(t * 0.25) * 30, sy = 32 + Math.round(Math.sin(t * 1.6));
    ship(sx, sy);
    // broadside every ~7 seconds
    const phase = (t + 3.5) % 7;
    if (phase < 0.25 && !reduced) if (!smoke.length || smoke[smoke.length - 1].born < t - 1) for (let i = 0; i < 9; i++) smoke.push({ x: sx + 8 + i * 6, y: sy + 17, r: 1, a: 0.9, born: t });
    if (phase < 0.12) for (let i = 0; i < 9; i++) px(sx + 7 + i * 6, sy + 18, 3, 2, "#ffb21e");
    // the bow chaser fires half a cycle later: a real projectile, g = 26 px/s²
    const bphase = t % 7;
    if (!reduced && bphase < 0.05 && (!balls.length || balls[balls.length - 1].born < t - 1)) balls.push({ x0: sx + 76, y0: sy + 10, vx: 34, vy: -22, born: t });
    if (bphase < 0.15) { px(sx + 75, sy + 8, 4, 4, "#ffb21e"); }
    for (const b of balls) {
      const age = t - b.born;
      // trail: one dot every 0.25 s — equal spacing across, growing spacing down
      for (let k = 0.25; k < age; k += 0.25) { const dx = b.x0 + b.vx * k, dy = b.y0 + b.vy * k + 13 * k * k; if (dy < 56) px(dx, dy, 1, 1, "#fff6c8"); }
      const x = b.x0 + b.vx * age, y = b.y0 + b.vy * age + 13 * age * age;
      if (y < 55) px(x - 1, y - 1, 3, 3, "#222"); else if (y < 60) { px(x - 2, 52, 5, 2, "#e8f4ff"); px(x - 1, 49, 3, 3, "#e8f4ff"); }
    }
    while (balls.length && t - balls[0].born > 5) balls.shift();
    if (reduced) {
      // a single frozen shot with its trail, so the still frame still shows the parabola
      const b = { x0: sx + 76, y0: sy + 10, vx: 34, vy: -22 };
      for (let k = 0.25; k < 2.6; k += 0.25) px(b.x0 + b.vx * k, b.y0 + b.vy * k + 13 * k * k, 1, 1, "#fff6c8");
      px(b.x0 + b.vx * 2.6 - 1, b.y0 + b.vy * 2.6 + 13 * 2.6 * 2.6 - 1, 3, 3, "#222");
    }
    for (const s of smoke) { s.y -= 0.06; s.x -= 0.15; s.r = Math.min(3, s.r + 0.02); s.a -= 0.008; }
    while (smoke.length && smoke[0].a <= 0) smoke.shift();
    smoke.forEach((s) => { c.globalAlpha = Math.max(0, s.a); px(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2, "#e8e8e8"); });
    c.globalAlpha = 1;
    // Air Cadet Tutor towing a banner
    const bx = W + 140 - ((t * 22) % (W + 300));
    const by = 14 + Math.round(Math.sin(t * 1.3) * 1.5);
    tutor(bx, by);
    px(bx + 14, by + 3, 8, 1, "#888");
    px(bx + 22, by - 1, 90, 9, "#f4ecd8"); px(bx + 22, by - 1, 90, 1, "#c8102e"); px(bx + 22, by + 7, 90, 1, "#c8102e");
    text("HIGHER PHYSICS", bx + 28, by + 1, "#12284a");
    if (running && !reduced) raf = requestAnimationFrame(frame);
  }
  frame(performance.now());
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((e) => {
      running = e[0].isIntersecting;
      cancelAnimationFrame(raf);
      if (running && !reduced) raf = requestAnimationFrame(frame);
    }).observe(cv);
  }
  // follow a change to the reduced-motion setting while the page is open
  const mq = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  if (mq && mq.addEventListener) mq.addEventListener("change", (e) => {
    reduced = e.matches; cancelAnimationFrame(raf);
    if (reduced) frame(performance.now()); else if (running) raf = requestAnimationFrame(frame);
  });
  // progress reset on the briefing page
  const rb = document.getElementById("reset-progress");
  if (rb) rb.addEventListener("click", () => {
    if (!confirm("Reset every pre-flight check and your rank?")) return;
    try { localStorage.removeItem("hp-higher.v1"); } catch (e) { /* ignore */ }
    location.reload();
  });
})();
