/* Briefing-room hero: a low-resolution pixel scene (Minecraft-style) of
   HMS Redstone under sail. Her bow chaser lobs a shot along a true parabola
   (constant horizontal velocity, constant downward acceleration, with the
   trail dots dropped at equal time intervals) while an Air Cadet Grob Tutor
   tows a banner. Then the running joke: ten ever-bigger, ever-faster attempts to fly
   past (glider, Hercules, Typhoon, Chinook, Red Arrows, Concorde, 747, A380, a rocket),
   each brought down by a solved parabola, each crew parachuting onto the deck.
   Static for prefers-reduced-motion; paused when off-screen. */
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
  function pilot(x, y, chute, wave, col = "#c8102e") {
    // y is where the boots are
    if (chute) {
      px(x - 3, y - 11, 7, 2, col); px(x - 2, y - 12, 5, 1, col); px(x - 1, y - 11, 1, 2, "#f2ead8"); px(x + 1, y - 11, 1, 2, "#f2ead8");
      px(x - 3, y - 9, 1, 4, "#dddddd"); px(x + 3, y - 9, 1, 4, "#dddddd");
    }
    px(x, y - 5, 1, 1, "#f0c8a0");                 // face
    px(x - 1, y - 4, 3, 2, "#5b6f8f");             // RAF blue-grey flying suit
    px(x - 1, y - 2, 1, 2, "#2a2a2a"); px(x + 1, y - 2, 1, 2, "#2a2a2a");
    if (wave) px(x + 2, y - 6, 1, 2, "#f0c8a0");   // safe on deck: a sheepish wave
  }
  /* ---------- the running joke ----------
     Ten passes, each more desperate than the last. Aircraft sprites are drawn nose-left
     with their top-left at (x, y); a craft flying right (dir +1) is mirrored. */
  const flick = (t, n) => Math.floor(t * n) % 2;
  const SPR = {
    tutor: { cx: 7, cy: 3, h: 7, draw: (x, y) => tutor(x, y) },
    glider: { cx: 9, cy: 2, h: 6, draw(x, y) {
      px(x, y + 2, 18, 2, "#f2f2f2"); px(x - 1, y + 3, 1, 1, "#f2f2f2"); px(x + 2, y + 1, 4, 1, "#5fb6cc");
      px(x + 5, y + 2, 8, 1, "#cfcfcf"); px(x + 15, y - 2, 3, 4, "#f2f2f2"); px(x + 15, y - 2, 3, 2, "#ff7a1e");
    } },
    herc: { cx: 16, cy: 5, h: 10, draw(x, y, t) {
      px(x + 1, y + 4, 32, 5, "#7d8a78"); px(x - 1, y + 5, 2, 3, "#7d8a78"); px(x, y + 5, 2, 1, "#2a3a4a");
      px(x + 26, y - 2, 6, 6, "#7d8a78"); px(x + 8, y + 3, 16, 2, "#5f6b5b");
      px(x + 10, y + 5, 2, 2, "#333"); px(x + 19, y + 5, 2, 2, "#333");
      px(x + 9, y + 2 + flick(t, 20) * 4, 1, 2, "#222"); px(x + 18, y + 2 + flick(t, 20) * 4, 1, 2, "#222");
      px(x + 14, y + 5, 3, 3, "#1c5fb3"); px(x + 15, y + 6, 1, 1, "#c8102e");
    } },
    typhoon: { cx: 10, cy: 3, h: 6, draw(x, y, t) {
      px(x, y + 2, 20, 3, "#9aa3ad"); px(x - 3, y + 3, 3, 1, "#9aa3ad"); px(x + 3, y + 1, 4, 1, "#5fb6cc");
      px(x + 3, y + 4, 3, 1, "#7d8690"); px(x + 8, y + 4, 10, 2, "#7d8690"); px(x + 15, y - 2, 3, 4, "#7d8690");
      px(x + 20, y + 3, 2 + flick(t, 15) * 2, 1, "#ffb21e");
    } },
    chinook: { cx: 14, cy: 6, h: 13, draw(x, y, t, o) {
      px(x, y + 4, 28, 7, "#4b5a3a"); px(x - 2, y + 6, 2, 4, "#4b5a3a"); px(x, y + 5, 4, 3, "#9fd4ff");
      px(x + 1, y + 1, 4, 3, "#4b5a3a"); px(x + 21, y - 1, 6, 5, "#4b5a3a");
      px(x + 6, y + 11, 2, 2, "#222"); px(x + 20, y + 11, 2, 2, "#222");
      const L = o.dead ? 22 : Math.max(2, Math.round(22 * Math.abs(Math.cos(t * 25))));
      px(x + 3 - L / 2, y, L, 1, "#222"); px(x + 24 - L / 2, y - 2, L, 1, "#222");
    } },
    hawk: { cx: 7, cy: 3, h: 5, draw(x, y) {
      px(x, y + 2, 14, 3, "#c8102e"); px(x - 2, y + 3, 2, 1, "#c8102e"); px(x + 2, y + 1, 3, 1, "#5fb6cc");
      px(x + 5, y + 4, 6, 1, "#f2f2f2"); px(x + 11, y - 1, 3, 3, "#c8102e");
    } },
    concorde: { cx: 20, cy: 4, h: 9, draw(x, y, t) {
      px(x, y + 3, 40, 3, "#f4f4f4"); px(x - 5, y + 4, 5, 1, "#f4f4f4"); px(x - 6, y + 5, 1, 1, "#f4f4f4");
      px(x + 2, y + 3, 3, 1, "#1c5fb3"); px(x + 34, y - 3, 5, 6, "#f4f4f4"); px(x + 35, y - 2, 3, 2, "#c8102e");
      px(x + 18, y + 6, 18, 1, "#d8d8d8"); px(x + 24, y + 7, 10, 2, "#aaa");
      px(x + 34, y + 7, 2 + flick(t, 15) * 2, 2, "#ffb21e");
    } },
    b747: { cx: 26, cy: 6, h: 13, draw(x, y) {
      px(x, y + 4, 52, 6, "#f2f2f2"); px(x + 3, y + 2, 16, 2, "#f2f2f2"); px(x - 2, y + 6, 2, 3, "#f2f2f2");
      px(x, y + 7, 52, 1, "#1c5fb3"); for (let i = 0; i < 11; i++) px(x + 5 + i * 4, y + 5, 2, 1, "#3a5f8f");
      px(x + 44, y - 4, 8, 8, "#1c5fb3"); px(x + 18, y + 9, 18, 2, "#c8c8c8");
      px(x + 21, y + 11, 4, 2, "#999"); px(x + 30, y + 11, 4, 2, "#999");
    } },
    a380: { cx: 31, cy: 6, h: 14, draw(x, y) {
      px(x, y + 3, 62, 8, "#f6f6f6"); px(x - 2, y + 5, 2, 5, "#f6f6f6"); px(x - 3, y + 7, 1, 2, "#f6f6f6");
      for (let i = 0; i < 13; i++) { px(x + 4 + i * 4, y + 4, 2, 1, "#3a5f8f"); px(x + 4 + i * 4, y + 7, 2, 1, "#3a5f8f"); }
      px(x + 53, y - 5, 9, 8, "#6b4fa0"); px(x + 22, y + 10, 22, 2, "#c8c8c8");
      px(x + 24, y + 12, 5, 2, "#999"); px(x + 36, y + 12, 5, 2, "#999");
    } },
    rocket: { cx: 3, cy: 12, h: 26, draw(x, y, t, o) {
      px(x + 2, y - 5, 2, 2, "#9aa3ad"); px(x + 1, y - 3, 4, 3, "#9aa3ad");
      px(x, y, 6, 26, "#f2f2f2"); px(x, y + 8, 6, 2, "#1c5fb3"); px(x, y + 16, 6, 1, "#c8102e");
      px(x - 2, y + 20, 2, 6, "#c8102e"); px(x + 6, y + 20, 2, 6, "#c8102e");
      if (o.lit) { const f = 5 + flick(t, 18) * 3; px(x + 1, y + 26, 4, f, "#ffb21e"); px(x + 2, y + 26, 2, f - 2, "#fff6c8"); }
    } },
  };
  // where survivors stand: [x, y] from the ship's origin, y = the deck they stand on
  const SPOTS = [[62, 12], [38, 14], [3, 10], [65, 12], [42, 14], [24, 14]];
  const linear = (x0, v, y) => (u) => ({ x: x0 + v * u, y });
  /* Each pass: craft (sprite, path, speed, drag on the way down, crew) and shots. A shot
     names its gun, its impact time, its flight time, its target craft, and its effect:
     "down" ends the craft, "graze" sets it burning, "miss" is aimed off by `off`. */
  const SEQ = [
    { craft: [{ s: "tutor", dir: 1, path: linear(-16, 24, 14), v: 24, k: 0.9, crew: ["pop"], banner: true }],
      shots: [{ gun: "bow", at: 11.6, fly: 1.5, c: 0, fx: "down" }] },
    { craft: [{ s: "glider", dir: 1, path: (u) => ({ x: -20 + 19 * u, y: 10 + u * 0.35 }), v: 19, k: 0.9, crew: ["pop"] }],
      shots: [{ gun: "bow", at: 14.7, fly: 1.4, c: 0, fx: "down" }] },
    { craft: [{ s: "herc", dir: 1, path: linear(-36, 22, 8), v: 22, k: 1.2, crew: ["jump", "jump", "jump"] }],
      shots: [{ gun: 6, at: 9.9, fly: 1.2, c: 0, fx: "graze" }, { gun: "bow", at: 13.1, fly: 1.4, c: 0, fx: "down" }] },
    { craft: [{ s: "typhoon", dir: 1, path: linear(-30, 105, 9), v: 105, k: 4, crew: ["jet"] }],
      shots: [{ gun: 7, at: 2.4, fly: 1.1, c: 0, fx: "miss", off: [-30, 3] }, { gun: "bow", at: 2.76, fly: 1.3, c: 0, fx: "down" }] },
    { craft: [{ s: "chinook", dir: -1, path: (u) => u < 4 ? { x: 330 - 20.5 * u, y: 16 } : { x: 248 + Math.sin((u - 4) * 1.8) * 3, y: 16 + Math.sin((u - 4) * 2.6) * 1.5 }, v: 3, k: 1, spin: true, crew: ["jump", "jump"] }],
      shots: [{ gun: "bow", at: 7.2, fly: 1.4, c: 0, fx: "down" }] },
    { craft: [0, 1, 2].map((j) => ({ s: "hawk", dir: 1, path: linear(-30 - (j ? 13 : 0), 62, 13 + [0, -5, 5][j]), v: 62, k: 3, crew: ["pop"], smoke: ["#c8102e", "#f2f2f2", "#1c5fb3"][j] })),
      shots: [{ gun: "bow", at: 4.6, fly: 1.3, c: 0, fx: "down" }, { gun: 8, at: 4.95, fly: 1.3, c: 1, fx: "down" }, { gun: 5, at: 5.3, fly: 1.3, c: 2, fx: "down" }] },
    { craft: [{ s: "concorde", dir: 1, path: linear(-50, 82, 7), v: 82, k: 3, crew: ["pop", "pop"] }],
      shots: [{ gun: 7, at: 3.1, fly: 1.2, c: 0, fx: "miss", off: [-34, 4] }, { gun: "bow", at: 3.6, fly: 1.4, c: 0, fx: "down" }] },
    { craft: [{ s: "b747", dir: 1, path: linear(-56, 30, 5), v: 30, k: 1.2, crew: ["jump", "jump", "jump"] }],
      shots: [{ gun: 5, at: 7.6, fly: 1.2, c: 0, fx: "graze" }, { gun: "bow", at: 9.73, fly: 1.5, c: 0, fx: "down" }] },
    { craft: [{ s: "a380", dir: 1, path: linear(-66, 27, 4), v: 27, k: 1.2, crew: ["jump", "jump", "jump", "jump"] }],
      shots: [{ gun: 3, at: 8.4, fly: 1.2, c: 0, fx: "graze" }, { gun: 6, at: 9.5, fly: 1.2, c: 0, fx: "graze" }, { gun: "bow", at: 10.85, fly: 1.5, c: 0, fx: "down" }] },
    { rocket: true,
      craft: [{ s: "rocket", dir: -1, path: (u) => ({ x: 284, y: u < 2 ? 26 : 26 - 3.2 * (u - 2) * (u - 2) }), v: 0, k: 1, spin: true, crew: ["capsule"] }],
      shots: [{ gun: "bow", at: 4.6, fly: 1.6, c: 0, fx: "down" }] },
  ];
  const CREW = { pop: [-20, 0.5], jet: [-46, 0.7], jump: [0, 0.6], capsule: [-14, 0.6] }, CHUTE_T = 5.2;
  const posOf = (cr, u) => cr.path(Math.max(0, u));
  const centre = (cr, u) => { const p = posOf(cr, u), S = SPR[cr.s]; return { x: p.x + S.cx, y: p.y + S.cy }; };
  SEQ.forEach((P) => {
    P.craft.forEach((cr, ci) => { const d = P.shots.find((sh) => sh.c === ci && sh.fx === "down"); cr.down = d ? d.at : Infinity; cr.grazes = P.shots.filter((sh) => sh.c === ci && sh.fx === "graze").map((sh) => sh.at); });
    let spot = 0, last = 0;
    P.craft.forEach((cr) => { cr.spot0 = spot; spot += cr.crew.length; last = Math.max(last, cr.down + 0.25 + (cr.crew.length - 1) * 0.4 + 0.7 + CHUTE_T); });
    P.len = last + 3;
    P.gunFrom = Math.min(...P.shots.map((sh) => sh.at - sh.fly)) - 1.5;
    P.gunTo = Math.max(...P.shots.map((sh) => sh.at)) + 2;
  });
  const CYCLE = SEQ.reduce((a, P) => a + P.len, 0);
  function passAt(tg) { let u = ((tg % CYCLE) + CYCLE) % CYCLE, i = 0; while (u >= SEQ[i].len) { u -= SEQ[i].len; i++; } return { i, u }; }
  const shipAt = (tg) => ({ x: 120 + Math.sin(tg * 0.25) * 30, y: 32 + Math.round(Math.sin(tg * 1.6)) });
  function drawCraft(cr, x, y, ang, t, o) {
    const S = SPR[cr.s];
    c.save(); c.translate(Math.round(x + S.cx), Math.round(y + S.cy));
    if (cr.dir > 0) c.scale(-1, 1);
    if (ang) c.rotate(ang);
    S.draw(-S.cx, -S.cy, t, o);
    if (o.burn && flick(t, 12)) { px(-3, -3, 4, 3, "#ff7a1e"); px(-2, -5, 2, 2, "#ffd23a"); }
    c.restore();
  }
  function burst(x, y, s, big) {
    const fl = Math.min(big, 1.3);
    if (s < 0.12) { px(x - 12 * fl, y - 1, 24 * fl, 3, "#fffbe6"); px(x - 1, y - 10 * fl, 3, 20 * fl, "#fffbe6"); px(x - 5 * fl, y - 5 * fl, 10 * fl, 10 * fl, "#fffbe6"); }
    if (s >= 1) return;
    const r = (3 + s * 16) * big;
    for (let i = 0; i < 12; i++) { const an = i * Math.PI / 6 + s; px(x + Math.cos(an) * r, y + Math.sin(an) * r, 2, 2, i % 3 ? "#ffd23a" : "#ff6a1e"); }
    const fb = Math.max(1, Math.round((9 - s * 8) * big));
    px(x - fb / 2, y - fb / 2, fb, fb, s < 0.25 ? "#fff6c8" : s < 0.6 ? "#ff9a2e" : "#6a6a6a");
    if (big >= 1) [[-14, -24, "#e8e8e8"], [10, -30, "#c8102e"], [18, -14, "#e8e8e8"], [-4, -34, "#1c5fb3"]].forEach(([vx, vy, col]) => {
      const dy = y + vy * s + 13 * s * s; if (dy < 55) px(x + vx * s * big, dy, 2, 1, col);
    });
  }
  function muzzle(gun, sh) { return gun === "bow" ? { x: sh.x + 76, y: sh.y + 10 } : { x: sh.x + 8 + gun * 6, y: sh.y + 16 }; }
  function capsule(x, y, chute) {
    if (chute) [[-7, -15, "#c8102e"], [-2, -17, "#f2ead8"], [3, -15, "#c8102e"]].forEach(([dx, dy, col]) => { px(x + dx, y + dy, 5, 2, col); px(x + dx + 2, y + dy + 2, 1, 10 + dy, "#dddddd"); });
    px(x - 2, y - 4, 5, 4, "#9aa3ad"); px(x - 1, y - 5, 3, 1, "#9aa3ad"); px(x, y - 3, 1, 1, "#5fb6cc");
  }
  function joke(t, sx, sy) {
    const q = passAt(t), P = SEQ[q.i], u = q.u, base = t - u;
    if (P.rocket) { px(278, 52, 18, 2, "#555"); px(280, 54, 2, 3, "#555"); px(292, 54, 2, 3, "#555"); } // an offshore pad
    // kill tallies painted on the hull: one per aircraft brought down so far this cycle
    let kills = 0;
    for (let i = 0; i < q.i; i++) kills += SEQ[i].craft.length;
    P.craft.forEach((cr) => { if (u >= cr.down) kills++; });
    for (let i = 0; i < kills; i++) px(sx + 8 + i * 4, sy + 22, 2, 1, "#f2ead8");
    // the shots
    for (const sh of P.shots) {
      const uL = sh.at - sh.fly, a = u - uL, life = sh.fx === "miss" ? sh.fly + 1.6 : sh.fly;
      if (a < 0 || a > life) continue;
      const m = muzzle(sh.gun, shipAt(base + uL)), tc = centre(P.craft[sh.c], sh.at);
      const tx = tc.x + (sh.off ? sh.off[0] : 0), ty = tc.y + (sh.off ? sh.off[1] : 0);
      const vx = Math.max(sh.fx === "miss" ? 12 : -999, (tx - m.x) / sh.fly), vy = (ty - m.y - 13 * sh.fly * sh.fly) / sh.fly;
      if (a < 0.15) px(m.x - 1, m.y - 2, 4, 4, "#ffb21e");
      for (let k = 0.2; k < a; k += 0.2) { const dy = m.y + vy * k + 13 * k * k; if (dy < 55) px(m.x + vx * k, dy, 1, 1, "#fff6c8"); }
      const bx = m.x + vx * a, by = m.y + vy * a + 13 * a * a;
      if (by < 55) px(bx - 1, by - 1, 3, 3, "#222"); else if (by < 62) { px(bx - 2, 52, 5, 2, "#e8f4ff"); px(bx - 1, 49, 3, 3, "#e8f4ff"); }
    }
    // the aircraft
    P.craft.forEach((cr, ci) => {
      const S = SPR[cr.s], big = Math.min(2.2, Math.max(1, (S.cx * 2) / 18));
      const burnFrom = cr.grazes.length ? cr.grazes[0] : Infinity;
      if (u < cr.down) {
        const p = posOf(cr, u);
        // smoke: display trails for the Red Arrows, a black plume once an engine is on fire, exhaust for the rocket
        if (cr.smoke) for (let k = 0.1; k < 1.6; k += 0.1) { if (u - k < 0) break; const pp = centre(cr, u - k); c.globalAlpha = 1 - k / 1.6; px(pp.x - S.cx - 1, pp.y, 2, 2, cr.smoke); }
        if (u > burnFrom) for (let k = 0.08; k < Math.min(1.5, u - burnFrom); k += 0.08) { const pp = centre(cr, u - k); c.globalAlpha = 0.85 - k / 1.8; px(pp.x - 2, pp.y - 1, 2 + cr.grazes.filter((g) => g < u).length, 2, "#3a3a3a"); }
        if (P.rocket && u > 2) for (let k = 0.1; k < Math.min(1.5, u - 2); k += 0.1) { const pp = posOf(cr, u - k); c.globalAlpha = 0.7 - k / 2.2; px(pp.x - 1 - k * 4, pp.y + 34, 8 + k * 8, 3, "#e8e8e8"); }
        if (P.rocket && u < 2.4) { c.globalAlpha = 0.8; px(270 - u * 4, 48, 34 + u * 8, 5, "#e8e8e8"); }
        c.globalAlpha = 1;
        drawCraft(cr, p.x, p.y, 0, t, { burn: u > burnFrom, lit: P.rocket && u > 1.4 });
        if (cr.banner) { px(p.x - 8, p.y + 3, 8, 1, "#888"); banner(p.x - 98, p.y - 1); }
      } else {
        const s = u - cr.down, P0 = posOf(cr, cr.down), C0 = centre(cr, cr.down);
        const fall = (qq) => ({ x: P0.x + cr.dir * cr.v * (1 - Math.exp(-cr.k * qq)) / cr.k, y: P0.y + 10 * qq * qq });
        const sW = Math.sqrt(Math.max(1, 54 - C0.y) / 10), pw = fall(Math.min(s, sW));
        const ang = (qq) => cr.spin ? -qq * 2.6 : -Math.min(0.9, qq * 1.1);
        if (s < sW) {
          for (let k = Math.max(0, s - 1.2); k < s; k += 0.08) { const f = fall(k); c.globalAlpha = 0.25 + 0.6 * (k - s + 1.2); px(f.x + S.cx - 1, f.y + S.cy, 2, 2, "#3a3a3a"); }
          c.globalAlpha = 1;
          drawCraft(cr, pw.x, pw.y, ang(s), t, { burn: true, dead: true });
        } else if (s < sW + 1.8) {
          const w = s - sW, sp = Math.max(0, (6 - w * 5) * big), xc = pw.x + S.cx;
          px(xc - 6 * big, 54 - sp, 3, sp, "#e8f4ff"); px(xc, 54 - sp * 1.2, 3, sp * 1.2, "#e8f4ff"); px(xc + 6 * big, 54 - sp * 0.7, 3, sp * 0.7, "#e8f4ff");
        }
        // the banner keeps its forward speed, bleeding it off as it flutters down
        if (cr.banner) {
          const fx = P0.x - 98 + cr.v * (1 - Math.exp(-0.45 * s)) / 0.45, fy = P0.y - 1 + 8 * s;
          if (fy < 58) banner(fx, Math.min(fy, 54), Math.sin(s * 5));
        }
        burst(C0.x, C0.y, s, big);
        // the crew bail out, open their chutes and steer for the deck
        cr.crew.forEach((style, m) => {
          const E = 0.25 + m * 0.4, [vy0, A] = CREW[style];
          if (s < E) return;
          const f0 = fall(E), e = s - E, sh = shipAt(t), spot = SPOTS[(cr.spot0 + m) % SPOTS.length];
          const x0 = f0.x + S.cx, y0 = f0.y + S.cy, aX = x0 - cr.dir * 4 * A, aY = y0 + vy0 * A + 13 * A * A;
          const tx = sh.x + spot[0], ty = sh.y + spot[1];
          let x, y, chute = false, landed = false;
          if (e < A) { x = x0 - cr.dir * 4 * e; y = y0 + vy0 * e + 13 * e * e; }
          else if (e < A + CHUTE_T) { const f = (e - A) / CHUTE_T, sm = f * f * (3 - 2 * f); x = aX + (tx - aX) * sm; y = aY + (ty - aY) * f; chute = true; }
          else { x = tx; y = ty; landed = true; }
          const wave = landed && flick(e, 3) === 0;
          if (style === "capsule") { capsule(x, y, chute); if (landed) pilot(x + 5, y, false, wave); }
          else pilot(x, y, chute, wave, ["#c8102e", "#1c5fb3", "#e0b23a", "#4f7a3a"][m % 4]);
        });
      }
    });
    // the finale: once even the rocket is in the sea, the ship flies a signal
    if (P.rocket && u > P.craft[0].down + 1) {
      const fx = sx - 26, fy = sy - 30;
      px(fx + 52, fy + 1, 7, 1, "#3b2a1a");
      px(fx, fy, 52, 7, "#f4ecd8"); px(fx, fy, 52, 1, "#c8102e"); px(fx, fy + 6, 52, 1, "#c8102e");
      text("PHYSICS WINS", fx + 3, fy + 1, "#12284a");
    }
  }
  let t0 = performance.now(), raf = 0, running = true;
  // hold the routine bow chaser while the joke's shots are in the air, so there is one story to follow
  function quietGun(tg) { const q = passAt(tg), P = SEQ[q.i]; return q.u > P.gunFrom && q.u < P.gunTo; }
  function frame(now) {
    const t = reduced ? 6 : (now - t0) / 1000;
    // sky
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#2a5a9a"); g.addColorStop(1, "#9fc6e8");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    px(52, 8, 10, 10, "#ffe27a"); px(54, 6, 6, 14, "#ffe27a"); px(50, 10, 14, 6, "#ffe27a");
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
    // The running joke: ten ever-more-desperate attempts to fly past HMS Redstone. Every
    // shot is a true parabola solved to meet its target, and every crew lands on deck.
    if (!reduced) joke(t, sx, sy);
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
