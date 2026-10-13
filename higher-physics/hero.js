/* Briefing-room hero: a low-resolution pixel scene (Minecraft-style) of
   HMS Redstone under sail. Her bow chaser lobs a shot along a true parabola
   (constant horizontal velocity, constant downward acceleration, with the
   trail dots dropped at equal time intervals) while an Air Cadet Grob Tutor
   tows a banner. On every pass a shot finds the Tutor: it ditches, and the cadet
   parachutes onto the ship. Static for prefers-reduced-motion; paused when off-screen. */
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
  function banner(x, y, flap = 0) {
    const sag = Math.round(flap * 2);
    px(x, y + sag, 90, 9, "#f4ecd8"); px(x, y + sag, 90, 1, "#c8102e"); px(x, y + 8 + sag, 90, 1, "#c8102e");
    text("HIGHER PHYSICS", x + 6, y + 2 + sag, "#12284a");
  }
  function pilot(x, y, chute, wave) {
    // y is where the boots are
    if (chute) {
      px(x - 3, y - 11, 7, 2, "#c8102e"); px(x - 2, y - 12, 5, 1, "#c8102e"); px(x - 1, y - 11, 1, 2, "#f2ead8"); px(x + 1, y - 11, 1, 2, "#f2ead8");
      px(x - 3, y - 9, 1, 4, "#dddddd"); px(x + 3, y - 9, 1, 4, "#dddddd");
    }
    px(x, y - 5, 1, 1, "#f0c8a0");                 // face
    px(x - 1, y - 4, 3, 2, "#5b6f8f");             // RAF blue-grey flying suit
    px(x - 1, y - 2, 1, 2, "#2a2a2a"); px(x + 1, y - 2, 1, 2, "#2a2a2a");
    if (wave) px(x + 2, y - 6, 1, 2, "#f0c8a0");   // safe on deck: a sheepish wave
  }
  let t0 = performance.now(), raf = 0, running = true;
  // hold the routine bow chaser while the aimed shot is in the air, so there is one ball to follow
  function quietGun(tg) { const P = (W + 300) / 22, n = Math.floor(tg / P), u = tg - n * P; return u > 6.4 && u < 11.5; }
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
    if (!reduced && bphase < 0.05 && !quietGun(t) && (!balls.length || balls[balls.length - 1].born < t - 1)) balls.push({ x0: sx + 76, y0: sy + 10, vx: 34, vy: -22, born: t });
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
    // Air Cadet Tutor towing a banner. Every pass is the joke pass: the bow chaser
    // lands one aimed shot, the Tutor goes into the sea, and the cadet pilot parachutes
    // onto the forecastle of the very ship that shot them down.
    const PASS = (W + 300) / 22, pass = Math.floor(t / PASS), tau = t - pass * PASS;
    const joke = !reduced;
    const planeY = (tg) => 14 + Math.round(Math.sin(tg * 1.3) * 1.5);
    const shipAt = (tg) => ({ x: 120 + Math.sin(tg * 0.25) * 30, y: 32 + Math.round(Math.sin(tg * 1.6)) });
    const TH = 9.8, FLY = 1.4, TL = TH - FLY;           // hit time, shot flight time, launch time
    const bx = W + 140 - 22 * tau;
    if (!joke || tau < TH) {
      const by = planeY(t);
      tutor(bx, by);
      px(bx + 14, by + 3, 8, 1, "#888");
      banner(bx + 22, by - 1);
    }
    if (joke) {
      const tH = t - tau + TH, hx = W + 140 - 22 * TH + 6, hy = planeY(tH) + 3;
      // the aimed shot: still a true parabola, solved so it meets the Tutor at time TH
      if (tau >= TL && tau < TH) {
        const sL = shipAt(t - tau + TL), x0 = sL.x + 76, y0 = sL.y + 10;
        const vx = (hx - x0) / FLY, vy = (hy - y0 - 13 * FLY * FLY) / FLY, a = tau - TL;
        if (a < 0.15) px(x0 - 1, y0 - 2, 4, 4, "#ffb21e");
        for (let k = 0.2; k < a; k += 0.2) px(x0 + vx * k, y0 + vy * k + 13 * k * k, 1, 1, "#fff6c8");
        px(x0 + vx * a - 1, y0 + vy * a + 13 * a * a - 1, 3, 3, "#222");
      }
      if (tau >= TH) {
        const s = tau - TH;
        // the plane: drag bleeds off its forward speed while it drops, trailing smoke
        const plane = (q) => ({ x: hx - 6 - 22 * (1 - Math.exp(-1.5 * q)) / 1.5, y: hy - 3 + 10 * q * q });
        const sW = Math.sqrt((54 - (hy - 3)) / 10), pw = plane(Math.min(s, sW));
        if (s < sW) {
          for (let k = Math.max(0, s - 1.2); k < s; k += 0.08) { const q = plane(k); c.globalAlpha = 0.25 + 0.6 * (k - s + 1.2); px(q.x + 12, q.y + 1, 2, 2, "#3a3a3a"); }
          c.globalAlpha = 1;
          // tip nose-down as it falls (the nose is on the left, so a negative turn)
          c.save(); c.translate(pw.x + 7, pw.y + 3); c.rotate(-Math.min(0.9, s * 1.1));
          tutor(-7, -3);
          if (Math.floor(s * 12) % 2) { px(1, -3, 4, 3, "#ff7a1e"); px(2, -5, 2, 2, "#ffd23a"); }
          c.restore();
        } else if (s < sW + 1.6) {
          const w = s - sW, sp = Math.max(0, 6 - w * 5);
          px(pw.x + 2, 54 - sp, 3, sp, "#e8f4ff"); px(pw.x + 9, 54 - sp * 0.7, 3, sp * 0.7, "#e8f4ff");
          if (w < 0.9) px(pw.x + 10, 52 + w * 4, 3, 2, "#c8102e"); // the tail goes under
        }
        // the banner flutters down on its own and sinks
        const fy = hy - 4 + 9 * s, fx = hx + 16 + 4 * s;
        if (fy < 58) banner(fx, Math.min(fy, 54), Math.sin(s * 5));
        // the hit itself
        if (s < 0.12) { c.globalAlpha = 0.5; px(hx - 12, hy - 1, 24, 3, "#fffbe6"); px(hx - 1, hy - 10, 3, 21, "#fffbe6"); px(hx - 5, hy - 5, 11, 11, "#fffbe6"); c.globalAlpha = 1; } // the flash
        if (s < 1) {
          const r = 3 + s * 16;
          for (let i = 0; i < 12; i++) { const an = i * Math.PI / 6 + s; px(hx + Math.cos(an) * r, hy + Math.sin(an) * r, 2, 2, i % 3 ? "#ffd23a" : "#ff6a1e"); }
          const fb = Math.max(1, Math.round(9 - s * 8));
          px(hx - fb / 2, hy - fb / 2, fb, fb, s < 0.25 ? "#fff6c8" : s < 0.6 ? "#ff9a2e" : "#6a6a6a");
        }
        // debris: bits of airframe tumbling on their own parabolas
        [[-14, -24, "#e8e8e8"], [10, -30, "#c8102e"], [18, -14, "#e8e8e8"], [-4, -34, "#1c5fb3"]].forEach(([vx, vy, col]) => {
          const dy = hy + vy * s + 13 * s * s;
          if (dy < 55) px(hx + vx * s, dy, 2, 1, col);
        });
        // the pilot: pops out, opens the chute, steers for the forecastle
        const E = 0.25, A = 0.5, D = 5.2;
        if (s >= E) {
          const p0 = plane(E), u = s - E, sh = shipAt(t);
          const aX = p0.x + 4 - 4 * A, aY = p0.y - 20 * A + 13 * A * A;
          const tx = sh.x + 62, ty = sh.y + 11;
          let x, y, chute = false, landed = false;
          if (u < A) { x = p0.x + 4 - 4 * u; y = p0.y - 20 * u + 13 * u * u; }
          else if (u < A + D) { const f = (u - A) / D, e = f * f * (3 - 2 * f); x = aX + (tx - aX) * e; y = aY + (ty - aY) * f; chute = true; }
          else { x = tx; y = ty; landed = true; }
          pilot(x, y, chute, landed && Math.floor((u - A - D) * 3) % 2 === 0);
        }
      }
    }
    if (running && !reduced && !paused) raf = requestAnimationFrame(frame);
  }
  let paused = false;
  frame(performance.now());
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((e) => {
      running = e[0].isIntersecting;
      cancelAnimationFrame(raf);
      if (running && !reduced && !paused) raf = requestAnimationFrame(frame);
    }).observe(cv);
  }
  // follow a change to the reduced-motion setting while the page is open
  const mq = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
  if (mq && mq.addEventListener) mq.addEventListener("change", (e) => {
    reduced = e.matches; cancelAnimationFrame(raf);
    if (reduced) frame(performance.now()); else if (running && !paused) raf = requestAnimationFrame(frame);
    syncBtn();
  });
  // WCAG 2.2.2: anything that moves for more than five seconds can be paused
  const pb = document.getElementById("hero-pause");
  let pausedAt = 0;
  function syncBtn() { if (pb) pb.hidden = reduced; }
  if (pb) {
    syncBtn();
    pb.addEventListener("click", () => {
      paused = !paused;
      pb.textContent = paused ? "Play animation" : "Pause animation";
      cancelAnimationFrame(raf);
      if (paused) pausedAt = performance.now();
      else { t0 += performance.now() - pausedAt; if (running && !reduced) raf = requestAnimationFrame(frame); }
    });
  }
  // progress reset on the briefing page
  const rb = document.getElementById("reset-progress");
  if (rb) rb.addEventListener("click", () => {
    if (!confirm("Reset every pre-flight check and your rank?")) return;
    try { localStorage.removeItem("hp-higher.v1"); } catch (e) { /* ignore */ }
    location.reload();
  });
})();
