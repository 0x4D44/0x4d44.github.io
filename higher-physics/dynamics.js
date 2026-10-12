/* Our Dynamic Universe — the simulations on the gun deck.
   Every number a widget shows comes from the same relationships the text
   teaches (and that the relationships sheet gives you). g = 9.8 m s⁻²,
   c = 3.00 × 10⁸ m s⁻¹, H₀ = 2.3 × 10⁻¹⁸ s⁻¹, speed of sound 340 m s⁻¹. */
(function () {
  "use strict";
  const HP = window.HP;
  const g = 9.8;
  const $ = (id) => document.getElementById(id);
  const F = HP.fmt;

  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  function canvasIn(box, cls) {
    const c = HP.el("canvas", { class: "sim" + (cls ? " " + cls : ""), role: "img" });
    box.append(c);
    return c;
  }
  const readouts = (box, items) => {
    const wrap = HP.el("div", { class: "readouts", "aria-live": "polite" });
    const map = {};
    items.forEach(([k, label]) => { const b = HP.quiet(HP.el("b")); map[k] = b; wrap.append(HP.el("div", null, b, HP.el("span", { html: label }))); });
    box.append(wrap);
    return map;
  };
  const font = (px, bold) => `${bold ? "bold " : ""}${px}px "Atkinson Hyperlegible", system-ui, sans-serif`;

  /* little pixel sprites shared by several scenes */
  function pxRect(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function drawTutor(ctx, x, y, s = 2) {
    // a Grob Tutor in profile, pointing right, wheels at (x, y)
    const p = (a, b, w, h, c) => pxRect(ctx, x + a * s, y + b * s, w * s, h * s, c);
    p(-12, -9, 24, 4, "#f2f2f2"); p(-4, -12, 8, 3, "#9fd0ff"); p(10, -9, 3, 3, "#f2f2f2");
    p(-13, -13, 3, 5, "#f2f2f2"); p(-12, -12, 2, 2, "#c8102e"); p(-5, -7, 14, 1, "#d6d6d6");
    p(12, -11, 1, 7, "#555"); p(-2, -5, 1, 4, "#333"); p(6, -5, 1, 4, "#333"); p(-3, -2, 3, 2, "#222"); p(5, -2, 3, 2, "#222");
    p(-1, -8, 2, 2, "#1c5fb3"); p(-0.5, -7.5, 1, 1, "#fff");
  }
  function drawCadet(ctx, x, y, s = 2) {
    // a blocky Air Cadet (RAF blue), feet at (x, y)
    const p = (a, b, w, h, c) => pxRect(ctx, x + a * s, y + b * s, w * s, h * s, c);
    p(-2, -16, 4, 4, "#d9a77a"); p(-2, -17, 4, 1, "#1c3b66"); p(-3, -12, 6, 6, "#5b7fb3"); p(-2, -6, 2, 6, "#1c3b66"); p(0, -6, 2, 6, "#1c3b66");
    p(-4, -12, 1, 5, "#5b7fb3"); p(3, -12, 1, 5, "#5b7fb3");
  }

  /* =====================================================================
     1. Motion-graph lab: scene + s–t, v–t, a–t drawn live
     ===================================================================== */
  mount("w-graphs", (box) => {
    const scen = {
      taxi: {
        name: "Tutor taxiing out", T: 13, up: "forward",
        // a: 2 m/s² for 5 s, steady 10 m/s for 4 s, −2.5 m/s² for 4 s (brakes to a stop at the holding point)
        state(t) {
          if (t < 5) return { s: t * t, v: 2 * t, a: 2 };
          if (t < 9) return { s: 25 + 10 * (t - 5), v: 10, a: 0 };
          const u = t - 9; return { s: 65 + 10 * u - 1.25 * u * u, v: 10 - 2.5 * u, a: -2.5 };
        },
        smax: 85, vmin: 0, vmax: 12, amin: -3, amax: 3,
        notes: [[5, "0–5 s: steady acceleration of 2 m s⁻². The v–t line is straight and sloping up, so a is constant and positive. The s–t curve gets steeper and steeper."],
          [9, "5–9 s: constant velocity 10 m s⁻¹. Acceleration is zero, and the s–t graph is a straight line whose gradient is the velocity."],
          [13, "9–13 s: braking at 2.5 m s⁻². The acceleration is negative while the velocity is still positive: the aircraft is still moving forwards, just more slowly. Displacement keeps increasing until v = 0."]],
      },
      throw: {
        name: "Shot fired straight up", T: 4, up: "up",
        state(t) { return { s: 19.6 * t - 4.9 * t * t, v: 19.6 - 9.8 * t, a: -9.8 }; },
        smax: 22, smin: -2, vmin: -22, vmax: 22, amin: -12, amax: 12,
        notes: [[2, "Going up, taking upwards as positive: the velocity is positive but falling by 9.8 m s⁻¹ every second. The acceleration is −9.8 m s⁻² the whole time."],
          [2.06, "At the top (t = 2.0 s) the velocity is zero for an instant, but the acceleration is still −9.8 m s⁻². Gravity has not switched off."],
          [4, "Coming down, the velocity is negative (downwards) and growing. The v–t graph is one straight line all the way: same gradient, so same acceleration, up and down."]],
      },
      bounce: {
        name: "Bouncing ball", T: 3.6, up: "up",
        // dropped from 1.80 m; each bounce keeps 70% of the speed; contact lasts 0.04 s
        state(t) { return bounceState(t); },
        smax: 2, smin: 0, vmin: -7, vmax: 7, amin: -12, amax: 12, spike: true,
        notes: [[0.6, "Falling: taking up as positive, the velocity is negative and growing in size; the acceleration is −9.8 m s⁻²."],
          [0.66, "The bounce: for a few hundredths of a second the floor pushes up hard. The velocity flips from negative to positive and the acceleration is a large upward spike."],
          [3.6, "Each rise and fall gives a straight v–t line with the same gradient (−9.8 m s⁻²). The ball leaves each bounce more slowly than it arrived, so each peak is lower."]],
      },
    };
    function bounceState(t) {
      let h0 = 1.8, tt = t, vUp = 0, first = true;
      const contact = 0.04;
      for (let i = 0; i < 12; i++) {
        // phase: flight (starting at height 0 going up with vUp, or the first drop from h0)
        const tf = first ? Math.sqrt(2 * h0 / g) : 2 * vUp / g;
        if (tt < tf) {
          if (first) return { s: h0 - 0.5 * g * tt * tt, v: -g * tt, a: -g };
          return { s: vUp * tt - 0.5 * g * tt * tt, v: vUp - g * tt, a: -g };
        }
        tt -= tf;
        const vIn = first ? g * Math.sqrt(2 * h0 / g) : vUp; // speed on arrival
        const vOut = 0.7 * vIn;
        if (tt < contact) { const f = tt / contact; return { s: 0, v: -vIn + (vIn + vOut) * f, a: (vIn + vOut) / contact, contact: true }; }
        tt -= contact; vUp = vOut; first = false;
      }
      return { s: 0, v: 0, a: 0 };
    }
    let key = "taxi", upPos = true;
    const top = HP.el("div");
    box.append(top);
    HP.choice(top, "Scenario:", [["taxi", "Tutor taxiing out"], ["throw", "Shot fired upwards"], ["bounce", "Bouncing ball"]], key, (v) => { key = v; sim.reset(); if (!sim.playing) sim.play(); pb.sync(); });
    const signSeg = HP.choice(top, "Sign convention:", [["up", "up is positive"], ["down", "down is positive"]], "up", (v) => { upPos = v === "up"; sim.redraw(); });
    const cv = canvasIn(box);
    cv.setAttribute("aria-label", "Animated scene with displacement–time, velocity–time and acceleration–time graphs drawn as the motion happens.");
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" });
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 560 : 400),
      draw(ctx, t, dt, C, S) {
        const sc = scen[key];
        if (t > sc.T + 1.5) { S.t = 0; t = 0; }
        const tc = Math.min(t, sc.T);
        const sgn = key === "taxi" || upPos ? 1 : -1;
        signSeg.hidden = key === "taxi";
        const narrow = S.w < 560;
        const scene = narrow ? { x: 0, y: 0, w: S.w, h: 140 } : { x: 0, y: 0, w: 190, h: S.h };
        const gx = narrow ? 50 : 250, gw = S.w - gx - 14;
        const gy0 = narrow ? 160 : 14, gh = narrow ? 115 : 112, gap = narrow ? 18 : 18;
        // scene
        ctx.fillStyle = C.paper2; ctx.fillRect(scene.x, scene.y, scene.w, scene.h);
        const st = sc.state(tc);
        if (key === "taxi") {
          const gyy = scene.y + scene.h - 26;
          pxRect(ctx, scene.x, gyy, scene.w, 26, "#555"); for (let k = 0; k < scene.w; k += 30) pxRect(ctx, k + 6, gyy + 12, 14, 2, "#ddd");
          const x = scene.x + 30 + st.s / sc.smax * (scene.w - 70);
          drawTutor(ctx, x, gyy, narrow ? 2 : 1.6);
          HP.label(ctx, `s = ${st.s.toFixed(1)} m`, scene.x + 8, scene.y + 16, { size: 12, haloCol: C.paper2 });
          HP.label(ctx, `v = ${st.v.toFixed(1)} m s⁻¹`, scene.x + 8, scene.y + 32, { size: 12, haloCol: C.paper2 });
        } else {
          const floorY = scene.y + scene.h - 18;
          pxRect(ctx, scene.x, floorY, scene.w, 18, "#7a5532"); pxRect(ctx, scene.x, floorY, scene.w, 4, "#3f7426");
          const hMax = key === "throw" ? 21 : 2;
          const ballY = floorY - 8 - Math.max(0, st.s) / hMax * (scene.h - 40);
          const bx = scene.x + scene.w / 2;
          ctx.fillStyle = key === "throw" ? "#222" : "#c8102e"; ctx.beginPath(); ctx.arc(bx, ballY, 7, 0, 7); ctx.fill();
          if (key === "throw") { pxRect(ctx, bx - 22, floorY - 12, 30, 10, "#3b2a1a"); pxRect(ctx, bx - 6, floorY - 30, 12, 20, "#333"); }
          // velocity arrow
          HP.arrow(ctx, bx + 18, ballY, bx + 18, ballY - st.v * (key === "throw" ? 2.4 : 6), C.sea, 2.5);
          HP.label(ctx, "v", bx + 26, ballY - st.v * (key === "throw" ? 1.2 : 3), { size: 12, col: C.sea, haloCol: C.paper2 });
          HP.label(ctx, upPos ? "↑ positive" : "↓ positive", scene.x + 8, scene.y + 16, { size: 12, haloCol: C.paper2 });
        }
        // graphs
        const rows = [["s", "s / m", sc.smin || 0, sc.smax], ["v", "v / m s⁻¹", sc.vmin, sc.vmax], ["a", "a / m s⁻²", sc.amin, sc.amax]];
        rows.forEach(([k, lab, lo, hi], i) => {
          let y0 = lo, y1 = hi;
          if (sgn < 0) { y0 = -hi; y1 = -lo; }
          const boxR = { x: gx, y: gy0 + i * (gh + gap), w: gw, h: gh };
          const rng = hi - lo, step = rng > 60 ? 20 : rng > 30 ? 10 : rng > 12 ? 5 : rng > 4 ? 2 : 0.5;
          const ax = HP.plot(ctx, boxR, { x0: 0, x1: sc.T, y0, y1, xt: sc.T > 6 ? 2 : 0.5, yt: step, xl: "t / s", yl: lab, C, fs: 11, tf: (v) => (+v.toFixed(6) + "").replace("-", "−") });
          ctx.save(); ctx.beginPath(); ctx.rect(boxR.x - 2, boxR.y - 2, boxR.w + 4, boxR.h + 4); ctx.clip();
          ctx.strokeStyle = i === 0 ? C.navy : i === 1 ? C.red : C.grass; ctx.lineWidth = 2.5; ctx.beginPath();
          const N = 600;
          for (let n = 0; n <= N; n++) {
            const tt = tc * n / N;
            const val = sc.state(tt)[k] * sgn;
            const yy = ax.Y(Math.max(y0 - 5, Math.min(y1 + 5, val)));
            n ? ctx.lineTo(ax.X(tt), yy) : ctx.moveTo(ax.X(tt), yy);
          }
          ctx.stroke(); ctx.restore();
          if (sc.spike && k === "a") HP.label(ctx, "(bounce spikes are much taller than shown)", boxR.x + boxR.w, boxR.y + 8, { size: 11, align: "right", col: C.muted });
          // cursor
          ctx.strokeStyle = C.gold; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(ax.X(tc), boxR.y); ctx.lineTo(ax.X(tc), boxR.y + boxR.h); ctx.stroke(); ctx.setLineDash([]);
        });
        const n = sc.notes.find((nn) => tc <= nn[0]) || sc.notes[sc.notes.length - 1];
        if (note.textContent !== n[1]) note.textContent = n[1];
      },
      loop: true,
    });
    const pb = HP.playButton(sim);
    const restart = HP.el("button", { class: "btn small", type: "button" }, "↺ Restart");
    restart.addEventListener("click", () => { sim.reset(); if (!sim.playing) { sim.play(); pb.sync(); } });
    box.append(HP.el("div", { class: "btn-row" }, pb, restart), note);
  });

  /* =====================================================================
     2. Which equation of motion? (picker)
     ===================================================================== */
  mount("w-suvat", (box) => {
    const Q = ["s", "u", "v", "a", "t"];
    const NAMES = { s: "displacement s", u: "initial velocity u", v: "final velocity v", a: "acceleration a", t: "time t" };
    const EQ = {
      s: { eq: "v = u + at", rear: { v: "v = u + at", u: "u = v − at", a: "a = (v − u) / t", t: "t = (v − u) / a" } },
      v: { eq: "s = ut + ½at²", rear: { s: "s = ut + ½at²", u: "u = (s − ½at²) / t", a: "a = 2(s − ut) / t²", t: "solve the quadratic ½at² + ut − s = 0 (or find v first with v² = u² + 2as, then use v = u + at)" } },
      t: { eq: "v² = u² + 2as", rear: { v: "v = √(u² + 2as)", u: "u = √(v² − 2as)", a: "a = (v² − u²) / 2s", s: "s = (v² − u²) / 2a" } },
      a: { eq: "s = ½(u + v)t", rear: { s: "s = ½(u + v)t", u: "u = 2s/t − v", v: "v = 2s/t − u", t: "t = 2s / (u + v)" } },
      u: { eq: "none on the relationships sheet uses s, v, a and t without u", rear: {} },
    };
    const state = { s: "know", u: "know", v: "want", a: "know", t: "skip" };
    const grid = HP.el("div", { class: "readouts" });
    const out = HP.el("div", { class: "sim-note", "aria-live": "polite" });
    Q.forEach((q) => {
      const cell = HP.el("div");
      cell.append(HP.el("span", null, NAMES[q]));
      HP.choice(cell, "", [["know", "know"], ["want", "want"], ["skip", "not involved"]], state[q], (v) => { state[q] = v; render(); });
      grid.append(cell);
    });
    box.append(grid, out);
    function render() {
      const know = Q.filter((q) => state[q] === "know"), want = Q.filter((q) => state[q] === "want"), skip = Q.filter((q) => state[q] === "skip");
      if (want.length !== 1) return (out.innerHTML = "Mark exactly <b>one</b> quantity as <b>want</b>.");
      if (know.length < 3) return (out.innerHTML = `You know ${know.length} quantit${know.length === 1 ? "y" : "ies"}. Every equation of motion links four of s, u, v, a, t, so you need <b>three</b> known values to find the fourth.`);
      if (know.length > 3 && skip.length === 0) {
        return (out.innerHTML = "You know four quantities, so more than one equation will work. Mark the one you <em>don't</em> need as <b>not involved</b> to see the quickest.");
      }
      const missing = skip.length === 1 ? skip[0] : Q.find((q) => state[q] === "skip");
      const e = EQ[missing];
      if (missing === "u") return (out.innerHTML = "No single equation on the relationships sheet links s, v, a and t. Find u first with <b>v = u + at</b>, then use any equation with s. (Or use s = vt − ½at², which is true but not on the sheet.)");
      out.innerHTML = `The equation <em>without</em> ${NAMES[missing].split(" ").slice(-1)} is <b class="eqi">${e.eq}</b>.<br>Rearranged for ${NAMES[want[0]]}: <b class="eqi">${e.rear[want[0]]}</b>`;
    }
    render();
  });

  /* =====================================================================
     3. Forces on a slope
     ===================================================================== */
  mount("w-slope", (box) => {
    let mode = "slide";
    HP.choice(box, "Situation:", [["slide", "released from rest"], ["tow", "towed up the slope at steady speed"]], mode, (v) => { mode = v; sim.reset(); update(); });
    const cv = canvasIn(box);
    cv.setAttribute("aria-label", "A block on a slope with arrows for its weight, the weight's components parallel and normal to the slope, friction and, when towed, the tension in the rope.");
    const ctr = HP.el("div", { class: "sim-controls" });
    box.append(ctr);
    const sA = HP.slider(ctr, { label: "Slope angle θ", min: 5, max: 45, step: 1, value: 25, unit: "°", oninput: () => { sim.reset(); update(); } });
    const sM = HP.slider(ctr, { label: "Mass m", min: 2, max: 20, step: 1, value: 10, unit: "kg", oninput: () => { sim.reset(); update(); } });
    const sF = HP.slider(ctr, { label: "Friction force", min: 0, max: 80, step: 1, value: 15, unit: "N", oninput: () => { sim.reset(); update(); } });
    const R = readouts(box, [["W", "weight W = mg"], ["par", "component down the slope = mg sin θ"], ["nor", "component into the slope = mg cos θ"], ["net", "unbalanced force"], ["a", "acceleration"]]);
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" });
    box.append(note);
    cv.after(HP.el("p", { class: "sim-note" }, "Arrow lengths are to scale (forces in newtons)."));
    let phys = {};
    function update() {
      const th = sA.value * Math.PI / 180, m = sM.value, Ff = sF.value;
      const W = m * g, par = W * Math.sin(th), nor = W * Math.cos(th);
      let net, a, T = 0, txt;
      if (mode === "slide") {
        if (par > Ff) { net = par - Ff; a = net / m; txt = `mg sin θ (${F(par, 3)} N) is bigger than friction (${Ff} N), so there is an unbalanced force of ${F(net, 3)} N down the slope and the block accelerates at a = F/m = ${F(a, 3)} m s⁻².`; }
        else { net = 0; a = 0; txt = `The friction setting (${Ff} N) is at least as big as mg sin θ (${F(par, 3)} N), so the block does not slide: it stays at rest with balanced forces. Steepen the slope or reduce the friction to set it moving. (Higher questions only ask about friction on objects that are already moving.)`; }
      } else {
        // towed up at constant speed: friction acts DOWN the slope, opposing the motion
        T = par + Ff; net = 0; a = 0;
        txt = `Moving up the slope, friction acts <b>down</b> the slope, the same way as mg sin θ. Steady speed means balanced forces, so the tension must be T = mg sin θ + friction = ${F(par, 3)} + ${Ff} = ${F(T, 3)} N.`;
      }
      phys = { th, m, Ff, W, par, nor, net, a, T };
      R.W.textContent = F(W, 3) + " N"; R.par.textContent = F(par, 3) + " N"; R.nor.textContent = F(nor, 3) + " N";
      R.net.textContent = (mode === "tow" ? "0 N (T = " + F(T, 3) + " N)" : F(net, 3) + " N");
      R.a.textContent = F(a, 3) + " m s⁻²";
      note.innerHTML = txt;
      sim.redraw();
    }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 300 : 330),
      draw(ctx, t, dt, C, S) {
        const { th, par, nor, Ff, a, T, W } = phys;
        if (th == null) return;
        const yG = S.h - 24; // top of the ground band
        const Wlen = Math.min(110, S.h * 0.36); // the longest force arrow, in px
        const sc = Wlen / Math.max(W, mode === "tow" ? T : 0, Ff, 1); // pixels per newton: every arrow fits
        // the longest slope that fits the box at this angle
        const Lx = Math.min(S.w - 70, (S.h - 70) / Math.tan(th)), slopeLen = Lx / Math.cos(th);
        const rise = Lx * Math.tan(th), cn = 18 * Math.cos(th);
        // rest position (fraction of the slope from the top) high enough for the weight arrow to
        // end above the ground; on shallow slopes raise the whole ramp on a bank instead
        const f = Math.max(0.15, Math.min(0.5, 1 - (W * sc + 12 - cn) / Math.max(rise, 1)));
        const lift = Math.max(0, Math.min(yG - rise - 50, W * sc + 12 - cn - (1 - f) * rise));
        const x0 = 30, y0 = yG - lift; // bottom-left of slope
        const xTop = x0 + Lx, yTop = y0 - rise;
        // ground and slope (grass-topped dirt blocks)
        ctx.fillStyle = "#7a5532"; ctx.beginPath(); ctx.moveTo(x0, yG); ctx.lineTo(x0, y0); ctx.lineTo(xTop, yTop); ctx.lineTo(xTop, yG); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#3f7426"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(xTop, yTop); ctx.stroke();
        pxRect(ctx, 0, yG, S.w, 24, "#5a4026");
        // angle marker, against a horizontal reference line
        ctx.strokeStyle = "#f4ecd8"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 70, y0); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = "#f4ecd8"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x0, y0, 34, -th, 0); ctx.stroke();
        // on shallow slopes the wedge is too thin for the label, so it goes just below the foot
        const shallow = th < 15 * Math.PI / 180;
        HP.label(ctx, "θ = " + Math.round(th * 180 / Math.PI) + "°", x0 + 40, shallow ? y0 + 12 : y0 - 10, { size: 12, haloCol: shallow && !lift ? "#5a4026" : "#7a5532", col: "#fff" });
        // block position along slope (distance from top), animated if accelerating
        const ux = -Math.cos(th), uy = Math.sin(th); // unit vector DOWN the slope (canvas coords)
        const nx = -Math.sin(th), ny = -Math.cos(th); // unit normal out of slope
        let d = slopeLen * f;
        if (mode === "slide") {
          // start higher up so there is room to slide; stop while the weight arrow is still on
          // the canvas and clear of the θ label
          d = slopeLen * Math.max(0.1, f - 0.25);
          const dMax = Math.max(d, Math.min(slopeLen - 40, (S.h - 6 - W * sc - yTop - ny * 18) / uy, (xTop + nx * 18 - x0 - 112) / Math.cos(th)));
          if (a > 0) d = Math.min(dMax, d + 0.5 * a * t * t * 12);
        }
        if (mode === "tow") {
          // keep the tension arrow below the top of the slope and friction above its foot
          const lo = T * sc + 42, hi = Math.max(lo, slopeLen - Ff * sc - 22);
          const c = Math.min(hi, Math.max(lo, d)), span = c - Math.max(lo, c - slopeLen * 0.24);
          d = span > 1 ? c - ((t * 18) % span) : c;
        }
        const cxB = xTop + ux * d + nx * 18, cyB = yTop + uy * d + ny * 18;
        ctx.save(); ctx.translate(cxB, cyB); ctx.rotate(-th);
        pxRect(ctx, -18, -18, 36, 36, "#a67c46"); pxRect(ctx, -18, -18, 36, 4, "#c8a06a"); pxRect(ctx, -18, 14, 36, 4, "#7a5532");
        for (let k = -12; k < 18; k += 10) pxRect(ctx, k, -10, 2, 24, "#8d6634");
        ctx.restore();
        const inSlope = { haloCol: "#f4ecd8" };
        // weight straight down; its label sits to the left of the tip
        HP.arrow(ctx, cxB, cyB, cxB, cyB + W * sc, C.red, 3);
        HP.label(ctx, "W = mg", cxB - 6, cyB + W * sc * 0.62, Object.assign({ size: 12, col: "#9a2a22", bold: true, align: "right" }, inSlope));
        // components: mg sin θ down the slope (label above its tip), mg cos θ into the slope (label right of its tip)
        const pX = cxB + ux * par * sc, pY = cyB + uy * par * sc;
        HP.arrow(ctx, cxB, cyB, pX, pY, C.gold, 2);
        HP.label(ctx, "mg sin θ", Math.max(4, pX - 4), pY - 14, { size: 12, col: "#6b4d00", align: pX - 4 < 60 ? "left" : "right", bold: true, haloCol: "#f4ecd8" });
        const cX = cxB - nx * nor * sc, cY = cyB - ny * nor * sc;
        HP.arrow(ctx, cxB, cyB, cX, cY, C.gold, 2);
        ctx.font = font(12, true);
        const cLx = Math.min(cX + 8, S.w - 6 - ctx.measureText("mg cos θ").width);
        HP.label(ctx, "mg cos θ", cLx, Math.min(cLx < cX + 8 ? cY + 16 : cY + 4, yG - 10), Object.assign({ size: 12, col: "#6b4d00", bold: true }, inSlope));
        // normal reaction
        HP.arrow(ctx, cxB, cyB, cxB + nx * nor * sc, cyB + ny * nor * sc, C.sea, 2.5);
        HP.label(ctx, "R", cxB + nx * nor * sc - 10, cyB + ny * nor * sc, { size: 12, col: C.sea, bold: true });
        // friction acts at the contact face, along the surface; its label sits just inside the slope
        const fr = mode === "slide" ? Math.min(Ff, par) : Ff;
        const fdir = mode === "slide" ? -1 : 1; // slide: friction up the slope; tow: down
        if (fr > 0) {
          const fx = cxB - nx * 18 + ux * 18 * fdir, fy = cyB - ny * 18 + uy * 18 * fdir; // leading corner
          const tx = fx + ux * fdir * fr * sc, ty = fy + uy * fdir * fr * sc;
          HP.arrow(ctx, fx, fy, tx, ty, C.violet, 2.5);
          ctx.font = font(12, true);
          HP.label(ctx, "friction", Math.max(fdir > 0 ? ctx.measureText("friction").width + 4 : 32, tx - nx * 16 + ux * fdir * 6), ty - ny * 16 + uy * fdir * 6, { size: 12, col: "#4a2f7a", bold: true, align: fdir > 0 ? "right" : "center", haloCol: "#f4ecd8" });
        }
        if (mode === "tow") {
          const rx = cxB - ux * (T * sc + 20), ry = cyB - uy * (T * sc + 20);
          ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cxB - ux * 18, cyB - uy * 18); ctx.lineTo(xTop, yTop - 18); ctx.stroke(); ctx.setLineDash([]);
          HP.arrow(ctx, cxB - ux * 18, cyB - uy * 18, rx, ry, C.grass, 3);
          HP.label(ctx, "T", rx - 4, ry - 12, { size: 12, col: C.grass, bold: true });
        }
      },
    });
    const replay = HP.el("button", { class: "btn small", type: "button" }, "▶ Release / tow");
    replay.addEventListener("click", () => { sim.reset(); sim.play(); setTimeout(() => sim.pause(), 4000); });
    box.insertBefore(HP.el("div", { class: "btn-row" }, replay), ctr);
    update();
  });

  /* =====================================================================
     4. Terminal velocity: a cadet parachutist, with the v–t graph
     ===================================================================== */
  mount("w-terminal", (box) => {
    const m = 80, W = m * g;
    const kClosed = 0.25, kOpen = 30; // air resistance = k v² (N)
    let v = 0, y = 0, chute = false, hist = [], tOpen = null, opening = 0;
    const cv = canvasIn(box);
    cv.setAttribute("aria-label", "A parachutist falls; arrows show weight and air resistance, and a velocity–time graph is drawn alongside.");
    const R = readouts(box, [["v", "velocity (down)"], ["air", "air resistance"], ["net", "unbalanced force (down)"], ["a", "acceleration"]]);
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" });
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 420 : 330),
      draw(ctx, t, dt, C, S) {
        // integrate in small steps
        let steps = Math.ceil(dt / 0.005);
        for (let i = 0; i < steps; i++) {
          const h = dt / steps;
          if (chute && opening < 1) opening = Math.min(1, opening + h / 2.5); // canopy takes ~2.5 s to fill
          const k = kClosed + (kOpen - kClosed) * opening;
          const air = k * v * v;
          const a = (W - air) / m;
          v += a * h; y += v * h;
        }
        if (dt > 0) { hist.push([t, v]); if (t > 40) { reset(); return; } }
        const k = kClosed + (kOpen - kClosed) * opening, air = k * v * v, net = W - air, a = net / m;
        // fixed-point readouts, with no "−0" at terminal velocity: anything that rounds to zero shows as 0
        const fx = (x, dp) => (Math.abs(x) < 0.5 * Math.pow(10, -dp) ? 0 : x).toFixed(dp).replace("-", "−");
        R.v.textContent = fx(v, 1) + " m s⁻¹"; R.air.textContent = fx(air, 0) + " N"; R.net.textContent = fx(net, 0) + " N"; R.a.textContent = fx(a, 2) + " m s⁻²";
        let txt;
        if (!chute) txt = v < 2 ? "Just after jumping: air resistance is tiny, so the unbalanced force is almost the whole weight (784 N) and a ≈ 9.8 m s⁻²."
          : Math.abs(net) > 30 ? "As speed increases, air resistance increases. The unbalanced force gets smaller, so the acceleration gets smaller: the v–t graph curves over."
            : "Air resistance now equals the weight. The forces are balanced, so (Newton's first law) the velocity stays constant: this is terminal velocity, about 56 m s⁻¹.";
        else txt = net < -30 ? "Canopy open: air resistance is suddenly far bigger than the weight. The unbalanced force is upwards, so the parachutist decelerates (velocity is still downwards)."
          : "As they slow down, air resistance falls until it balances the weight again: a new, much lower terminal velocity, about 5 m s⁻¹.";
        if (note.textContent !== txt) note.textContent = txt;
        // layout
        const narrow = S.w < 560;
        const scene = narrow ? { x: 0, y: 0, w: S.w, h: 170 } : { x: 0, y: 0, w: 220, h: S.h };
        const sky = ctx.createLinearGradient(0, 0, 0, scene.h); sky.addColorStop(0, "#5b8fc7"); sky.addColorStop(1, "#bcd8f0");
        ctx.fillStyle = sky; ctx.fillRect(scene.x, scene.y, scene.w, scene.h);
        // clouds scroll up as we fall (speed shows how fast)
        for (let i = 0; i < 5; i++) { const cy = ((i * 61 - y * 1.5) % (scene.h + 40) + scene.h + 40) % (scene.h + 40) - 20; pxRect(ctx, scene.x + (i * 47) % (scene.w - 50), cy, 44, 8, "rgba(255,255,255,.85)"); }
        const px0 = scene.x + scene.w / 2, py0 = scene.y + scene.h * 0.55;
        if (chute) {
          const cw = 26 + 34 * opening;
          ctx.fillStyle = "#c8102e"; ctx.beginPath(); ctx.ellipse(px0, py0 - 58, cw, 16 * (0.4 + 0.6 * opening), 0, Math.PI, 0); ctx.fill();
          pxRect(ctx, px0 - cw, py0 - 60, cw * 2, 4, "#fff");
          ctx.strokeStyle = "#333"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px0 - cw, py0 - 58); ctx.lineTo(px0, py0 - 26); ctx.lineTo(px0 + cw, py0 - 58); ctx.stroke();
        }
        drawCadet(ctx, px0, py0 + 6, 2);
        const sc = 60 / W;
        HP.arrow(ctx, px0 + 16, py0 - 10, px0 + 16, py0 - 10 + W * sc, "#b3261e", 3);
        HP.label(ctx, "W", px0 + 22, py0 - 10 + W * sc - 6, { size: 12, col: "#7a120c", bold: true, haloCol: "#e9f2fa" });
        HP.arrow(ctx, px0 - 16, py0 - 6, px0 - 16, py0 - 6 - Math.min(air, 3000) * sc, "#1c3b66", 3);
        HP.label(ctx, "air resistance", px0 - 22, py0 - 6 - Math.min(air, 3000) * sc + 6, { size: 11, col: "#12284a", align: "right", haloCol: "#e9f2fa" });
        // v–t graph
        const gb = narrow ? { x: 46, y: scene.h + 26, w: S.w - 60, h: S.h - scene.h - 56 } : { x: scene.w + 54, y: 20, w: S.w - scene.w - 70, h: S.h - 56 };
        const ax = HP.plot(ctx, gb, { x0: 0, x1: 40, y0: 0, y1: 60, xt: 5, yt: 10, xl: "t / s", yl: "v / m s⁻¹", C, fs: 11 });
        ctx.strokeStyle = C.red; ctx.lineWidth = 2.5; ctx.beginPath();
        hist.forEach(([tt, vv], i) => (i ? ctx.lineTo(ax.X(tt), ax.Y(vv)) : ctx.moveTo(ax.X(tt), ax.Y(vv)))); ctx.stroke();
        if (tOpen != null) { ctx.setLineDash([3, 3]); ctx.strokeStyle = C.muted; ctx.beginPath(); ctx.moveTo(ax.X(tOpen), gb.y); ctx.lineTo(ax.X(tOpen), gb.y + gb.h); ctx.stroke(); ctx.setLineDash([]); ctx.font = font(11); const left = ax.X(tOpen) + 12 + ctx.measureText("canopy opens").width > gb.x + gb.w; HP.label(ctx, "canopy opens", ax.X(tOpen) + (left ? -6 : 12), ax.Y(30), { size: 11, col: C.muted, align: left ? "right" : "left" }); }
      },
    });
    function reset() { v = 0; y = 0; chute = false; hist = []; tOpen = null; opening = 0; sim.t = 0; openBtn.disabled = false; sim.redraw(); }
    const pb = HP.playButton(sim, ["▶ Jump", "❚❚ Pause"]);
    const openBtn = HP.el("button", { class: "btn small", type: "button" }, "🪂 Open parachute");
    openBtn.addEventListener("click", () => { chute = true; tOpen = sim.t; openBtn.disabled = true; if (!sim.playing) { sim.play(); pb.sync(); } });
    const rs = HP.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    rs.addEventListener("click", () => { sim.pause(); pb.sync(); reset(); });
    box.append(HP.el("div", { class: "btn-row" }, pb, openBtn, rs), note);
    sim.redraw();
  });

  /* =====================================================================
     5. Minecart collisions and explosions
     ===================================================================== */
  mount("w-carts", (box) => {
    let type = "stick";
    HP.choice(box, "Interaction:", [["elastic", "elastic bounce"], ["bounce", "inelastic bounce"], ["stick", "stick together"], ["explode", "explosion (spring)"]], type, (v) => { type = v; ctlU.forEach((s) => (s.input.disabled = v === "explode")); recalc(); restart(); });
    const cv = canvasIn(box);
    cv.setAttribute("aria-label", "Two minecarts on a rail collide or push apart, with bar charts of momentum and kinetic energy before and after.");
    const ctr = HP.el("div", { class: "sim-controls" });
    box.append(ctr);
    const s1 = HP.slider(ctr, { label: "Mass of cart A", min: 100, max: 800, step: 50, value: 400, unit: "kg", oninput: () => { recalc(); restart(); } });
    const s2 = HP.slider(ctr, { label: "Mass of cart B", min: 100, max: 800, step: 50, value: 200, unit: "kg", oninput: () => { recalc(); restart(); } });
    const u1 = HP.slider(ctr, { label: "Velocity of A before", min: -6, max: 6, step: 0.5, value: 4, unit: "m s⁻¹", oninput: () => { recalc(); restart(); } });
    const u2 = HP.slider(ctr, { label: "Velocity of B before", min: -6, max: 6, step: 0.5, value: -2, unit: "m s⁻¹", oninput: () => { recalc(); restart(); } });
    const ctlU = [u1, u2];
    const R = readouts(box, [["pb", "total momentum before"], ["pa", "total momentum after"], ["kb", "total E<sub>k</sub> before"], ["ka", "total E<sub>k</sub> after"], ["va", "velocities after (A, B)"]]);
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" });
    box.append(note);
    let st = {};
    function recalc() {
      const m1 = s1.value, m2 = s2.value;
      let a = u1.value, b = u2.value, va, vb, closing = a - b;
      if (type === "explode") {
        // carts start together at rest; a spring releases 3600 J of energy
        a = 0; b = 0; const E = 3600;
        // m1 va + m2 vb = 0 ; ½m1va² + ½m2vb² = E
        va = -Math.sqrt(2 * E * m2 / (m1 * (m1 + m2))); vb = -m1 * va / m2;
      } else if (closing <= 0) { va = a; vb = b; }
      else {
        const e = type === "elastic" ? 1 : type === "bounce" ? 0.5 : 0;
        const P = m1 * a + m2 * b;
        va = (P - m2 * e * (a - b)) / (m1 + m2);
        vb = (P + m1 * e * (a - b)) / (m1 + m2);
      }
      st = { m1, m2, a, b, va, vb, collide: type === "explode" || closing > 0 };
      const pb = m1 * a + m2 * b, pa = m1 * va + m2 * vb;
      const kb = 0.5 * m1 * a * a + 0.5 * m2 * b * b, ka = 0.5 * m1 * va * va + 0.5 * m2 * vb * vb;
      st.pb = pb; st.pa = pa; st.kb = kb; st.ka = ka;
      const z = (x) => (Math.abs(x) < 1e-6 ? "0" : F(x, 3));
      R.pb.textContent = z(pb) + " kg m s⁻¹";
      R.pa.textContent = z(pa) + " kg m s⁻¹";
      R.kb.textContent = F(kb, 3) + " J"; R.ka.textContent = F(ka, 3) + " J";
      R.va.textContent = `${va.toFixed(2)}, ${vb.toFixed(2)} m s⁻¹`;
      let txt;
      if (!st.collide) txt = "These carts are not closing on each other, so they never meet. Give A a larger velocity than B (remember: right is positive).";
      else if (type === "elastic") txt = "Elastic: total momentum AND total kinetic energy are the same before and after.";
      else if (type === "bounce") txt = `Inelastic: the carts bounce apart, but ${F(kb - ka, 3)} J of kinetic energy has become heat and sound. Total momentum is still conserved: inelastic does not mean "stuck together".`;
      else if (type === "stick") txt = `Stuck together: they share one velocity, ${va.toFixed(2)} m s⁻¹. This is the most inelastic collision possible: ${F(kb - ka, 3)} J of kinetic energy is lost, but total momentum is unchanged.`;
      else txt = `Explosion: total momentum before is zero, so after it the two momenta are equal in size and opposite in direction (${F(Math.abs(m1 * va), 3)} kg m s⁻¹ each way). Kinetic energy has increased from 0 to 3600 J, released by the spring. The lighter cart moves faster.`;
      note.innerHTML = txt;
    }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 420 : 390),
      draw(ctx, t, dt, C, S) {
        const { m1, m2, a, b, va, vb, collide } = st;
        if (m1 == null) return;
        const railY = 96, scale = Math.min(18, S.w / 34); // px per metre
        const wA = 26 + m1 / 800 * 34, wB = 26 + m2 / 800 * 34;
        // time of meeting: put them so they meet at t = 2 s at the centre
        const tm = 2, mid = S.w / 2;
        let xA, xB;
        if (type === "explode") {
          xA = mid - wA / 2; xB = mid + wB / 2;
          if (t > 1) { xA += va * (t - 1) * scale; xB += vb * (t - 1) * scale; }
        } else if (collide) {
          if (t < tm) { xA = mid - wA / 2 + a * (t - tm) * scale; xB = mid + wB / 2 + b * (t - tm) * scale; }
          else { xA = mid - wA / 2 + va * (t - tm) * scale; xB = mid + wB / 2 + vb * (t - tm) * scale; }
        } else { xA = mid - 90 + a * t * scale; xB = mid + 90 + b * t * scale; }
        if (t > 5.5) S.t = 0;
        // rail
        pxRect(ctx, 0, railY + 22, S.w, 4, "#8a8a8a"); for (let k = 0; k < S.w; k += 18) pxRect(ctx, k, railY + 25, 10, 6, "#6b4a2a");
        const cart = (xc, w, col, lab, m) => {
          pxRect(ctx, xc - w / 2, railY - 6, w, 26, "#707070"); pxRect(ctx, xc - w / 2 + 3, railY - 3, w - 6, 16, col);
          pxRect(ctx, xc - w / 2 + 4, railY + 18, 8, 8, "#222"); pxRect(ctx, xc + w / 2 - 12, railY + 18, 8, 8, "#222");
          HP.label(ctx, lab, xc, railY + 5, { size: 13, bold: true, align: "center", col: "#fff", halo: false });
          HP.label(ctx, m + " kg", xc, railY - 16, { size: 11, align: "center", col: C.ink2 });
        };
        if (type === "stick" && collide && t >= tm) { cart(xA, wA, "#1c5fb3", "A", m1); cart(xA + wA / 2 + wB / 2, wB, "#b3261e", "B", m2); }
        else { cart(xA, wA, "#1c5fb3", "A", m1); cart(xB, wB, "#b3261e", "B", m2); }
        if (type === "explode" && t < 1) { ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k <= 8; k++) ctx.lineTo(mid - 6 + (k % 2) * 12, railY - 2 + k * 2); ctx.stroke(); }
        HP.label(ctx, "+ direction →", S.w - 8, 18, { size: 11, align: "right", col: C.muted });
        // two separate panels, each with its own scale: momentum (signed, kg m s⁻¹, A / B / total,
        // before and after) and, below it, total kinetic energy (J) as horizontal bars
        const narrow = S.w < 560, ph = narrow ? 150 : 120, pTop = 138;
        const panel = (y, h, title) => {
          ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(6.5, y + 0.5, S.w - 13, h);
          HP.label(ctx, title, 14, y + 12, { size: 12, bold: true, col: C.ink, halo: false });
        };
        const pH = ph + 60;
        panel(pTop, pH, narrow ? "Momentum / kg m s⁻¹" : "Momentum / kg m s⁻¹ (above the line = to the right)");
        const cols = [["before", m1 * a, m2 * b, st.kb], ["after", m1 * va, m2 * vb, st.ka]];
        const pMax = Math.max(1, ...cols.flatMap(([, pA, pB]) => [Math.abs(pA), Math.abs(pB), Math.abs(pA + pB)]));
        const half = (S.w - 20) / 2, rTop = pTop + 40, amp = (ph - 32) / 2, mid0 = rTop + 16 + amp;
        cols.forEach(([lab, pA, pB], i) => {
          const x0 = 10 + i * half;
          HP.label(ctx, lab, x0 + half / 2, pTop + 30, { size: 12, bold: true, align: "center", col: C.ink2, halo: false });
          const step = Math.min(56, (half - 16) / 3), bw = Math.min(30, step - 14), gx = x0 + half / 2 - 1.5 * step;
          ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, mid0); ctx.lineTo(gx + 3 * step, mid0); ctx.stroke();
          [[pA, "#1c5fb3", "A"], [pB, "#b3261e", "B"], [pA + pB, C.ink2, "total"]].forEach(([p, col, l], j) => {
            const hgt = p / pMax * amp, bx = gx + j * step + (step - bw) / 2;
            pxRect(ctx, bx, Math.min(mid0, mid0 - hgt), bw, Math.max(1, Math.abs(hgt)), col);
            HP.label(ctx, (Math.round(p) + "").replace("-", "−"), bx + bw / 2, hgt >= 0 ? mid0 - hgt - 8 : mid0 - hgt + 9, { size: 11, align: "center", col: C.ink });
            HP.label(ctx, l, bx + bw / 2, rTop + ph + 10, { size: 11, align: "center", col: C.ink2, halo: false });
          });
        });
        const eTop = pTop + pH + 8;
        panel(eTop, 64, "Total kinetic energy / J");
        const kMax = Math.max(st.kb, st.ka, 1), ex = 64, eMaxW = S.w - ex - 70;
        cols.forEach(([lab, , , k], i) => {
          const yy = eTop + 30 + i * 20;
          HP.label(ctx, lab, 14, yy, { size: 11, col: C.ink2, halo: false });
          const wk = k / kMax * eMaxW;
          pxRect(ctx, ex, yy - 6, Math.max(1, wk), 12, C.gold);
          HP.label(ctx, Math.round(k) + " J", ex + wk + 6, yy, { size: 11, col: C.ink });
        });
      },
      loop: true,
    });
    function restart() { sim.t = 0; sim.redraw(); }
    const pb = HP.playButton(sim);
    box.insertBefore(HP.el("div", { class: "btn-row" }, pb), ctr);
    recalc();
  });

  /* =====================================================================
     6. Impulse: shot striking a hard or a soft target
     ===================================================================== */
  mount("w-impulse", (box) => {
    const cv = canvasIn(box);
    cv.setAttribute("aria-label", "Force–time graph for a cannonball being stopped. The shaded area is the impulse, which equals the change in momentum.");
    const ctr = HP.el("div", { class: "sim-controls" });
    box.append(ctr);
    let rebound = false;
    const sT = HP.slider(ctr, { label: "Contact time", min: 5, max: 100, step: 5, value: 20, unit: "ms", oninput: () => upd() });
    HP.choice(box, "After the hit, the shot…", [["stop", "stops dead"], ["rebound", "bounces back at 8 m s⁻¹"]], "stop", (v) => { rebound = v === "rebound"; upd(); });
    const R = readouts(box, [["dp", "change in momentum mv − mu"], ["imp", "impulse Ft = area under graph"], ["Fav", "average force F = Δp / t"]]);
    const m = 14.5, u = 20;
    function upd() { sim.redraw(); }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 260 : 280),
      draw(ctx, t, dt, C, S) {
        const tc = sT.value / 1000, v = rebound ? -8 : 0;
        const dp = m * (v - u); // negative: force on the shot is backwards
        const Fav = Math.abs(dp) / tc, Fpk = Fav * Math.PI / 2; // half-sine pulse
        R.dp.textContent = `${m} × (${String(v).replace("-", "−")} − ${u}) = ${F(dp, 3)} kg m s⁻¹`;
        R.imp.textContent = F(dp, 3) + " N s (on the shot: backwards)";
        R.Fav.textContent = F(Fav, 3) + " N (size)";
        const gb = { x: 60, y: 22, w: S.w - 80, h: S.h - 58 };
        const yMax = 100000;
        const ax = HP.plot(ctx, gb, { x0: 0, x1: 0.1, y0: 0, y1: yMax, xt: 0.02, yt: 20000, C, fs: 11, ytf: (v) => v ? (v / 1000) + "k" : "0", tf: (v) => v.toFixed(2) });
        ctx.save(); ctx.beginPath(); ctx.rect(gb.x, gb.y - 4, gb.w, gb.h + 4); ctx.clip();
        ctx.beginPath(); ctx.moveTo(ax.X(0), ax.Y(0));
        for (let i = 0; i <= 200; i++) { const tt = tc * i / 200; ctx.lineTo(ax.X(tt), ax.Y(Fpk * Math.sin(Math.PI * tt / tc))); }
        ctx.lineTo(ax.X(tc), ax.Y(0)); ctx.closePath();
        ctx.fillStyle = "rgba(224,178,58,.45)"; ctx.fill(); ctx.strokeStyle = C.red; ctx.lineWidth = 2.5; ctx.stroke();
        // average-force rectangle (same area)
        ctx.setLineDash([5, 4]); ctx.strokeStyle = C.sea; ctx.lineWidth = 1.5; ctx.strokeRect(ax.X(0), ax.Y(Fav), ax.X(tc) - ax.X(0), ax.Y(0) - ax.Y(Fav)); ctx.setLineDash([]);
        ctx.restore();
        // axis titles drawn after the pulse (with a halo), the x title below the tick numbers so a long, low pulse can't cover it
        HP.label(ctx, "F / N", gb.x + 5, gb.y, { size: 11, bold: true, base: "top", col: C.ink });
        HP.label(ctx, "t / s", gb.x + gb.w, gb.y + gb.h + 27, { size: 11, bold: true, align: "right", col: C.ink, halo: false });
        // notes stacked top-right, clear of the axis titles and (at short contact times) of the pulse on the left
        const R0 = gb.x + gb.w, scen = tc <= 0.03 ? "oak hull: short contact, huge force" : tc >= 0.08 ? "sandbags: long contact, small force" : "";
        if (scen) HP.label(ctx, scen, R0, gb.y + 10, { size: 12, align: "right", bold: true });
        ctx.font = font(11);
        const box1 = "dashed box: average force × time (same area)";
        const noteL = ctx.measureText(box1).width > gb.w - 70 ? ["dashed box: average force × time", "(same area)"] : [box1];
        let ny = gb.y + 28;
        noteL.forEach((l) => { HP.label(ctx, l, R0, ny, { size: 11, align: "right", col: C.sea }); ny += 15; });
        if (Fpk > yMax) HP.label(ctx, `peak ≈ ${F(Fpk, 2)} N (off the top)`, R0, ny, { size: 11, align: "right", col: C.red });
      },
    });
    upd();
  });

  /* =====================================================================
     7. The bow chaser: projectile lab
     ===================================================================== */
  mount("w-cannon", (box) => {
    const cv = canvasIn(box);
    cv.setAttribute("aria-label", "A cannon fires a ball. Dots mark its position every 0.5 s; arrows show the constant horizontal and changing vertical velocity components. A second ball dropped at the same time falls level with it.");
    const ctr = HP.el("div", { class: "sim-controls" });
    box.append(ctr);
    const sU = HP.slider(ctr, { label: "Launch speed u", min: 5, max: 50, step: 1, value: 25, unit: "m s⁻¹", oninput: () => recalc() });
    const sA = HP.slider(ctr, { label: "Launch angle θ (above horizontal)", min: -20, max: 80, step: 1, value: 0, unit: "°", oninput: () => recalc() });
    const sH = HP.slider(ctr, { label: "Height of gun above sea", min: 0, max: 40, step: 1, value: 20, unit: "m", oninput: () => recalc() });
    let drop = true, vec = true;
    const opts = HP.el("div", { class: "btn-row" });
    const cb = (txt, val, fn) => { const i = HP.el("input", { type: "checkbox" }); i.checked = val; i.addEventListener("change", () => fn(i.checked)); return HP.el("label", null, i, " " + txt); };
    opts.append(cb("drop a second ball at the same instant", true, (v) => { drop = v; sim.redraw(); }), cb("show velocity components", true, (v) => { vec = v; sim.redraw(); }));
    box.append(opts);
    const R = readouts(box, [["uh", "horizontal u<sub>h</sub> = u cos θ"], ["uv", "vertical u<sub>v</sub> = u sin θ"], ["tf", "time of flight"], ["rng", "range (horizontal distance)"], ["hmax", "greatest height above sea"]]);
    let P = {};
    function recalc() {
      const u = sU.value, th = sA.value * Math.PI / 180, h = sH.value;
      const uh = u * Math.cos(th), uv = u * Math.sin(th);
      // h + uv t − ½ g t² = 0  →  t = (uv + √(uv² + 2gh)) / g
      const tf = (uv + Math.sqrt(uv * uv + 2 * g * h)) / g;
      const rng = uh * tf, hmax = h + (uv > 0 ? uv * uv / (2 * g) : 0);
      P = { u, th, h, uh, uv, tf, rng, hmax };
      R.uh.textContent = F(uh, 3) + " m s⁻¹"; R.uv.textContent = F(uv, 3) + " m s⁻¹";
      R.tf.textContent = F(tf, 3) + " s"; R.rng.textContent = F(rng, 3) + " m"; R.hmax.textContent = F(hmax, 3) + " m";
      sim.t = 0; sim.redraw();
    }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 300 : 340),
      draw(ctx, t, dt, C, S) {
        const { uh, uv, tf, rng, hmax, h } = P;
        if (tf == null) return;
        const tEnd = tf + 1.2;
        if (t > tEnd + 0.8) { S.t = 0; t = 0; }
        const tc = Math.min(t, tf);
        // world → screen: fit range and height
        const left = 70, right = 24, topM = 24, seaY = S.h - 34;
        const worldW = Math.max(rng * 1.08, 30), worldH = Math.max(hmax * 1.15, 25);
        const k = Math.min((S.w - left - right) / worldW, (seaY - topM) / worldH);
        const X = (x) => left + x * k, Y = (y) => seaY - y * k;
        // sky and sea
        ctx.fillStyle = "#cfe3f5"; ctx.fillRect(0, 0, S.w, seaY);
        ctx.fillStyle = "#2f6fb5"; ctx.fillRect(0, seaY, S.w, S.h - seaY);
        for (let i = 0; i < 20; i++) pxRect(ctx, (i * 53 + t * 10) % S.w, seaY + 6 + (i * 7) % 20, 10, 2, "#7fb2e6");
        // the ship's side / cliff from which the gun fires
        pxRect(ctx, 0, Y(h), left - 4, seaY - Y(h), "#3b2a1a");
        for (let yy = Y(h) + 6; yy < seaY - 4; yy += 14) pxRect(ctx, 6, yy, left - 16, 3, "#c99a2e");
        ctx.save(); ctx.translate(left - 8, Y(h) - 6); ctx.rotate(-P.th); pxRect(ctx, -10, -5, 26, 10, "#222"); ctx.restore();
        // gridlines every 10 m
        ctx.strokeStyle = "rgba(0,0,0,.08)"; ctx.lineWidth = 1;
        const gstep = worldW > 150 ? 20 : 10;
        for (let x = 0; x <= worldW; x += gstep) { ctx.beginPath(); ctx.moveTo(X(x), topM); ctx.lineTo(X(x), seaY); ctx.stroke(); }
        ctx.fillStyle = "#12284a"; ctx.font = font(11);
        ctx.textAlign = "center"; for (let x = 0; x <= worldW; x += gstep * 2) ctx.fillText(x + " m", X(x), seaY + 26);
        // full path (faint)
        ctx.strokeStyle = "rgba(18,40,74,.35)"; ctx.setLineDash([4, 4]); ctx.beginPath();
        for (let i = 0; i <= 120; i++) { const tt = tf * i / 120; const x = uh * tt, y = h + uv * tt - 0.5 * g * tt * tt; i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); }
        ctx.stroke(); ctx.setLineDash([]);
        // dots every 0.5 s up to now
        for (let tt = 0.5; tt <= tc + 1e-9; tt += 0.5) {
          const x = uh * tt, y = h + uv * tt - 0.5 * g * tt * tt;
          ctx.fillStyle = "#12284a"; ctx.beginPath(); ctx.arc(X(x), Y(y), 3, 0, 7); ctx.fill();
          if (drop) { const yd = h - 0.5 * g * tt * tt; if (yd > 0) { ctx.fillStyle = "rgba(179,38,30,.6)"; ctx.beginPath(); ctx.arc(X(0) + 8, Y(yd), 3, 0, 7); ctx.fill(); ctx.strokeStyle = "rgba(179,38,30,.25)"; ctx.beginPath(); ctx.moveTo(X(0) + 8, Y(yd)); ctx.lineTo(X(x), Y(y)); ctx.stroke(); } }
        }
        // the ball now
        const x = uh * tc, y = h + uv * tc - 0.5 * g * tc * tc, vv = uv - g * tc;
        if (t < tf) {
          ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(X(x), Y(y), 6, 0, 7); ctx.fill();
          if (drop) { const yd = h - 0.5 * g * tc * tc; if (yd > 0) { ctx.fillStyle = "#b3261e"; ctx.beginPath(); ctx.arc(X(0) + 8, Y(yd), 6, 0, 7); ctx.fill(); } }
          if (vec) {
            const vs = 2.2;
            HP.arrow(ctx, X(x), Y(y), X(x) + uh * vs, Y(y), "#1c5fb3", 2.5);
            HP.arrow(ctx, X(x), Y(y), X(x), Y(y) - vv * vs, "#b86a00", 2.5);
            HP.arrow(ctx, X(x), Y(y), X(x) + uh * vs, Y(y) - vv * vs, "#3f7426", 1.5, 6);
            // keep both labels inside the canvas when the ball is near the right-hand edge
            ctx.font = font(11);
            const lh = `vₕ = ${uh.toFixed(1)} m s⁻¹`, lv = `vᵥ = ${(Math.abs(vv) < 0.05 ? 0 : vv).toFixed(1).replace("-", "−")} m s⁻¹`;
            const inX = (x0, txt) => Math.max(4, Math.min(x0, S.w - 4 - ctx.measureText(txt).width));
            const vRight = X(x) + 8 + ctx.measureText(lv).width < S.w - 4; // else put vᵥ left of its arrow
            HP.label(ctx, lh, inX(X(x) + uh * vs + 4, lh), vRight ? Y(y) + 10 : Y(y) - 12, { size: 11, col: "#12284a", haloCol: "#cfe3f5" });
            HP.label(ctx, lv, vRight ? X(x) + 8 : X(x) - 8, Math.min(Y(y) - vv * vs * (vRight ? 1 : 0.5), seaY - 8), { size: 11, col: "#7a4500", haloCol: "#cfe3f5", align: vRight ? "left" : "right" });
          }
        } else {
          pxRect(ctx, X(rng) - 6, seaY - 14, 12, 14, "#e8f4ff"); pxRect(ctx, X(rng) - 2, seaY - 22, 4, 8, "#e8f4ff");
        }
        HP.label(ctx, `t = ${tc.toFixed(2)} s`, S.w - 10, 14, { size: 12, align: "right", bold: true, haloCol: "#cfe3f5", col: "#12284a" });
        HP.label(ctx, "dots every 0.5 s · air resistance ignored", S.w - 10, 30, { size: 11, align: "right", haloCol: "#cfe3f5", col: "#12284a" });
      },
      loop: true,
    });
    const pb = HP.playButton(sim, ["▶ Fire", "❚❚ Pause"]);
    const again = HP.el("button", { class: "btn small", type: "button" }, "↺ Fire again");
    again.addEventListener("click", () => { sim.t = 0; if (!sim.playing) { sim.play(); pb.sync(); } });
    box.insertBefore(HP.el("div", { class: "btn-row" }, pb, again), ctr);
    recalc();
  });

  /* =====================================================================
     8. Newton's cannon: a satellite is always falling
     ===================================================================== */
  mount("w-newton", (box) => {
    const cv = canvasIn(box, "dark");
    cv.setAttribute("aria-label", "Newton's thought experiment: a cannon on a very tall mountain fires shot horizontally at increasing speeds until the shot falls all the way round the planet.");
    const ctr = HP.el("div", { class: "sim-controls" });
    box.append(ctr);
    const sV = HP.slider(ctr, { label: "Launch speed (fraction of orbital speed)", min: 0.3, max: 1.5, step: 0.01, value: 0.8, fmt: (v) => v.toFixed(2) + " × v_orbit", oninput: () => { path = trace(); sim.t = 0; if (!sim.playing && !HP.reduced) sim.play(); sim.redraw(); } });
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" });
    box.append(note);
    const GM = 1, r0 = 1.18; // planet radius 1, mountain top at 1.18 (units scaled)
    function trace() {
      const vo = Math.sqrt(GM / r0) * sV.value;
      let x = 0, y = r0, vx = vo, vy = 0;
      const pts = [[x, y]];
      const h = 0.002;
      let crashed = false, offscreen = false, angle = 0;
      const escaped = sV.value >= Math.SQRT2; // energy test: v² ≥ 2GM/r
      for (let i = 0; i < 60000; i++) {
        const r = Math.hypot(x, y), a = GM / (r * r);
        vx += -a * x / r * h; vy += -a * y / r * h; x += vx * h; y += vy * h;
        if (i % 6 === 0) pts.push([x, y]);
        if (r < 1) { crashed = true; break; }
        if (r > 6) { offscreen = true; break; }
        angle += h * (x * vy - y * vx) / (r * r);
        if (Math.abs(angle) > 2 * Math.PI + 0.05) break;
      }
      const f = sV.value;
      note.textContent = crashed ? (f < 0.7 ? "Too slow: the shot falls and hits the ground quite close to the mountain." : "Faster: the shot still falls, but the curved ground drops away beneath it, so it lands much further round the planet.")
        : escaped ? "At or above about 1.41 × orbital speed (escape speed) the shot never comes back: it escapes the planet's gravity."
        : offscreen ? "Still a closed ellipse: the shot will come back, but its far point is way off the screen. Only at 1.41 × orbital speed (escape speed) would it never return."
          : Math.abs(f - 1) < 0.02 ? "Orbital speed: the shot falls towards the centre all the time, but the ground curves away exactly as fast. It is in free fall, round and round: a satellite."
            : "A closed orbit that isn't a circle: an ellipse. The shot is still in free fall the whole way round.";
      return pts;
    }
    let path = trace();
    const sim = HP.sim(cv, {
      height: (w) => Math.min(w, 420),
      draw(ctx, t, dt, C, S) {
        ctx.fillStyle = "#0d1424"; ctx.fillRect(0, 0, S.w, S.h);
        for (let i = 0; i < 60; i++) pxRect(ctx, (i * 97) % S.w, (i * 61) % S.h, 1.5, 1.5, "#cfd6e6");
        const R = Math.min(S.w, S.h) * 0.24, cx = S.w / 2, cy = S.h / 2 + 10;
        // blocky planet: draw as a grid of squares inside a circle
        const b = Math.max(6, R / 9);
        for (let gx = -R; gx < R; gx += b) for (let gy = -R; gy < R; gy += b) {
          const ccx = gx + b / 2, ccy = gy + b / 2;
          if (ccx * ccx + ccy * ccy < R * R) pxRect(ctx, cx + gx, cy + gy, b - 0.5, b - 0.5, (ccx * ccx + ccy * ccy > (R - b) * (R - b)) ? "#3f7426" : ((Math.abs(gx * 7 + gy * 3) % 5) < 2 ? "#2f6fb5" : "#4f7a3a"));
        }
        // mountain
        ctx.fillStyle = "#8a8a8a"; ctx.beginPath(); ctx.moveTo(cx - R * 0.16, cy - R * 0.97); ctx.lineTo(cx, cy - R * 1.18); ctx.lineTo(cx + R * 0.16, cy - R * 0.97); ctx.fill();
        pxRect(ctx, cx - 5, cy - R * 1.18 - 4, 10, 5, "#222");
        // reduced motion: show the whole path at once; otherwise grow it, and stop the loop once it is complete
        const n = HP.reduced && !S.playing ? path.length : Math.min(path.length, Math.floor(t * 60 * 6) + 2);
        if (n >= path.length && S.playing) S.pause();
        ctx.strokeStyle = "#ffd65a"; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < n; i++) { const [x, y] = path[i]; const X = cx + x * R, Y = cy - y * R; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
        ctx.stroke();
        const [lx, ly] = path[n - 1];
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + lx * R, cy - ly * R, 4, 0, 7); ctx.fill();
        // gravity arrow on shot, towards the centre
        const r = Math.hypot(lx, ly);
        if (r > 0) HP.arrow(ctx, cx + lx * R, cy - ly * R, cx + lx * R - lx / r * 26, cy - ly * R + ly / r * 26, "#ff6a5c", 2);
        HP.label(ctx, "red arrow: the pull of gravity (always towards the centre)", 10, 16, { size: 11, col: "#ffb3aa", halo: false });
      },
      loop: true,
    });
    const again = HP.el("button", { class: "btn small primary", type: "button" }, "↺ Fire again");
    again.addEventListener("click", () => { sim.t = 0; if (!sim.playing) sim.play(); });
    box.insertBefore(HP.el("div", { class: "btn-row" }, again), ctr);
  });

  /* =====================================================================
     9. The light clock: time dilation and length contraction
     ===================================================================== */
  mount("w-lightclock", (box) => {
    const cv = canvasIn(box, "dark");
    cv.setAttribute("aria-label", "Two light clocks. The one on board a fast craft ticks slower when watched from the ship, and the craft is shorter in the direction of motion.");
    const ctr = HP.el("div", { class: "sim-controls" });
    box.append(ctr);
    const sB = HP.slider(ctr, { label: "Speed of the craft, v", min: 0, max: 0.99, step: 0.01, value: 0.6, fmt: (v) => v.toFixed(2) + " c", oninput: () => upd() });
    const R = readouts(box, [["g", "factor 1 / √(1 − v²/c²)"], ["t", "1.00 s on board looks like"], ["l", "a 60 m craft looks"]]);
    function upd() {
      const b = sB.value, gam = 1 / Math.sqrt(1 - b * b);
      R.g.textContent = gam.toFixed(3); R.t.textContent = gam.toFixed(2) + " s from the ship"; R.l.textContent = (60 / gam).toFixed(1) + " m long";
      sim.t = 0; sim.redraw();
    }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 380 : 300),
      draw(ctx, t, dt, C, S) {
        const b = sB.value, gam = 1 / Math.sqrt(1 - b * b);
        ctx.fillStyle = "#0d1424"; ctx.fillRect(0, 0, S.w, S.h);
        const narrow = S.w < 560;
        const H = 90; // mirror separation in px
        const tick = 1.2; // seconds per tick for the clock at rest
        // panel A: the stationary clock aboard HMS Redstone (rest frame)
        const pA = narrow ? { x: 0, y: 0, w: S.w, h: S.h / 2 } : { x: 0, y: 0, w: S.w * 0.3, h: S.h };
        const pB = narrow ? { x: 0, y: S.h / 2, w: S.w, h: S.h / 2 } : { x: S.w * 0.3, y: 0, w: S.w * 0.7, h: S.h };
        ctx.strokeStyle = "#2a3550"; ctx.strokeRect(pA.x + 0.5, pA.y + 0.5, pA.w - 1, pA.h - 1); ctx.strokeRect(pB.x + 0.5, pB.y + 0.5, pB.w - 1, pB.h - 1);
        HP.label(ctx, "Clock on the ship (at rest)", pA.x + 8, pA.y + 14, { size: 11, col: "#cfd6e6", halo: false });
        HP.label(ctx, narrow ? `Same clock on a craft at ${b.toFixed(2)}c` : `Identical clock on a craft at ${b.toFixed(2)}c, seen from the ship`, pB.x + 8, pB.y + 14, { size: 11, col: "#cfd6e6", halo: false });
        const drawClock = (cx, top, phase, col) => {
          pxRect(ctx, cx - 22, top, 44, 5, "#cfd6e6"); pxRect(ctx, cx - 22, top + H, 44, 5, "#cfd6e6");
          return phase;
        };
        // stationary clock: photon goes up and down, period 2 × tick/2
        const cxA = pA.x + pA.w / 2, topA = pA.y + (pA.h - H) / 2 + 6;
        drawClock(cxA, topA);
        const phA = (t % tick) / tick; // 0..1 one full round trip
        const yA = phA < 0.5 ? topA + H - phA * 2 * H : topA + (phA - 0.5) * 2 * H;
        ctx.fillStyle = "#ffd65a"; ctx.beginPath(); ctx.arc(cxA, yA + 3, 5, 0, 7); ctx.fill();
        HP.label(ctx, `ticks: ${Math.floor(t / tick)}`, cxA, pA.y + pA.h - 14, { size: 12, align: "center", col: "#ffd65a", halo: false, bold: true });
        // moving clock: same light speed, longer diagonal path → period × γ
        const per = tick * gam;
        const topB = pB.y + (pB.h - H) / 2 + 6;
        const travel = pB.w - 120;
        const speedPx = b * (2 * H / tick); // px/s at the same scale as light (light = 2H per tick)
        const run = per * 3 * speedPx; // distance covered in 3 ticks
        const loopT = Math.max(per * 3, 1);
        const tt = t % loopT;
        const x0 = pB.x + 60 + Math.max(0, (travel - run) / 2);
        const cxB = x0 + speedPx * tt;
        // craft hull, contracted by γ
        const hullL = 120 / gam;
        pxRect(ctx, cxB - hullL / 2, topB + H + 10, hullL, 10, "#9fd0ff"); pxRect(ctx, cxB + hullL / 2, topB + H + 12, 6, 6, "#9fd0ff");
        drawClock(cxB, topB);
        // photon path drawn so far
        const ph = (tt % per) / per;
        ctx.strokeStyle = "rgba(255,214,90,.5)"; ctx.lineWidth = 1.5; ctx.beginPath();
        const nTicks = Math.floor(tt / per);
        for (let k = 0; k <= nTicks; k++) {
          const ts = k * per, xs = x0 + speedPx * ts;
          const tEnd2 = Math.min(tt, ts + per);
          const xm = x0 + speedPx * (ts + per / 2), xe = x0 + speedPx * tEnd2;
          ctx.moveTo(xs, topB + H + 3);
          if (tEnd2 - ts < per / 2) { const f = (tEnd2 - ts) / (per / 2); ctx.lineTo(xs + (xm - xs) * f, topB + H + 3 - f * H); }
          else { ctx.lineTo(xm, topB + 3); const f = (tEnd2 - ts - per / 2) / (per / 2); ctx.lineTo(xm + (xe - xm) * (f >= 0 ? 1 : 0), topB + 3 + f * H); }
        }
        ctx.stroke();
        const yB = ph < 0.5 ? topB + H - ph * 2 * H : topB + (ph - 0.5) * 2 * H;
        ctx.fillStyle = "#ffd65a"; ctx.beginPath(); ctx.arc(cxB, yB + 3, 5, 0, 7); ctx.fill();
        HP.label(ctx, `ticks: ${Math.floor(t / per)}`, cxB, pB.y + pB.h - 14, { size: 12, align: "center", col: "#ffd65a", halo: false, bold: true });
        if (b > 0.05) HP.label(ctx, narrow ? "longer path, same speed c → each tick takes longer" : "the light travels further each tick, at the same speed c, so each tick takes longer", pB.x + pB.w / 2, pB.y + 32, { size: 11, align: "center", col: "#cfd6e6", halo: false });
      },
      loop: true,
    });
    // a play / pause button (the clock never auto-plays under prefers-reduced-motion) and a reset
    const pb = HP.playButton(sim);
    const rs = HP.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    rs.addEventListener("click", () => { sim.t = 0; sim.redraw(); });
    box.insertBefore(HP.el("div", { class: "btn-row" }, pb, rs), ctr);
    upd();
  });

  /* =====================================================================
     10. The Doppler effect: a ship's bell on a moving boat
     ===================================================================== */
  mount("w-doppler", (box) => {
    const v = 340;
    const cv = canvasIn(box);
    cv.setAttribute("aria-label", "A moving source emits circular wavefronts that bunch up ahead of it and spread out behind it. Listeners in front and behind hear different frequencies.");
    const ctr = HP.el("div", { class: "sim-controls" });
    box.append(ctr);
    const sF = HP.slider(ctr, { label: "Frequency of the source f<sub>s</sub>", min: 200, max: 1000, step: 10, value: 500, unit: "Hz", oninput: () => upd() });
    const sV = HP.slider(ctr, { label: "Speed of the source v<sub>s</sub>", min: 0, max: 200, step: 5, value: 85, unit: "m s⁻¹", oninput: () => upd() });
    const R = readouts(box, [["fa", "heard by the listener AHEAD"], ["fb", "heard by the listener BEHIND"]]);
    let waves = [], lastEmit = 0;
    function upd() {
      const fs = sF.value, vs = sV.value;
      R.fa.textContent = `${fs} × ${v} / (${v} − ${vs}) = ${F(fs * v / (v - vs), 3)} Hz`;
      R.fb.textContent = `${fs} × ${v} / (${v} + ${vs}) = ${F(fs * v / (v + vs), 3)} Hz`;
    }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 240 : 260),
      draw(ctx, t, dt, C, S) {
        const vs = sV.value;
        const cVis = 90; // px per second for the wave on screen
        const sVis = cVis * vs / v;
        const period = 0.35 * 500 / sF.value; // visual emission period, scales with frequency
        const span = S.w - 160;
        const loop = span / Math.max(sVis, 20);
        const tl = vs > 0 ? t % (span / sVis) : t;
        const sx = vs > 0 ? 80 + sVis * tl : S.w / 2;
        if (vs > 0 && tl < dt * 1.5) { waves = []; lastEmit = t - period; }
        if (t - lastEmit >= period) { waves.push({ x: sx, t0: t }); lastEmit = t; }
        waves = waves.filter((w) => (t - w.t0) * cVis < S.w * 1.2);
        // sea
        ctx.fillStyle = "#d8e9f7"; ctx.fillRect(0, 0, S.w, S.h);
        ctx.strokeStyle = "#1c5fb3"; ctx.lineWidth = 1.5;
        waves.forEach((w) => { ctx.beginPath(); ctx.arc(w.x, S.h / 2, (t - w.t0) * cVis, 0, 7); ctx.stroke(); });
        // the boat with its bell
        pxRect(ctx, sx - 22, S.h / 2 + 4, 44, 10, "#3b2a1a"); pxRect(ctx, sx - 2, S.h / 2 - 22, 4, 26, "#3b2a1a");
        ctx.fillStyle = "#e0b23a"; ctx.beginPath(); ctx.moveTo(sx - 7, S.h / 2 - 8); ctx.lineTo(sx + 7, S.h / 2 - 8); ctx.lineTo(sx + 5, S.h / 2 - 20); ctx.lineTo(sx - 5, S.h / 2 - 20); ctx.fill();
        if (vs > 0) HP.arrow(ctx, sx + 26, S.h / 2 + 9, sx + 26 + 10 + vs / 4, S.h / 2 + 9, "#b3261e", 2);
        // listeners
        drawCadet(ctx, S.w - 24, S.h / 2 + 20, 2); drawCadet(ctx, 24, S.h / 2 + 20, 2);
        HP.label(ctx, "ahead", S.w - 24, S.h / 2 + 34, { size: 11, align: "center", haloCol: "#d8e9f7", col: "#12284a" });
        HP.label(ctx, "behind", 24, S.h / 2 + 34, { size: 11, align: "center", haloCol: "#d8e9f7", col: "#12284a" });
        HP.label(ctx, "wavefronts closer together ahead → shorter λ → higher f", S.w / 2, 14, { size: 11, align: "center", haloCol: "#d8e9f7", col: "#12284a" });
      },
      loop: true,
    });
    // optional sound: hear the pitch drop as the boat passes
    const listen = HP.el("button", { class: "btn small", type: "button" }, "🔊 Hear it pass (3 s)");
    listen.addEventListener("click", () => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext; const ac = new AC();
        const o = ac.createOscillator(), gn = ac.createGain();
        o.type = "triangle"; o.connect(gn); gn.connect(ac.destination);
        const fs = sF.value, vs = sV.value, now = ac.currentTime;
        o.frequency.setValueAtTime(fs * v / (v - vs), now);
        o.frequency.setValueAtTime(fs * v / (v - vs), now + 1.4);
        o.frequency.linearRampToValueAtTime(fs * v / (v + vs), now + 1.6);
        gn.gain.setValueAtTime(0.0001, now); gn.gain.exponentialRampToValueAtTime(0.15, now + 0.3); gn.gain.setValueAtTime(0.15, now + 1.5); gn.gain.exponentialRampToValueAtTime(0.0001, now + 3);
        o.start(now); o.stop(now + 3.05);
      } catch (e) { HP.toast("Sound is not available in this browser."); }
    });
    box.insertBefore(HP.el("div", { class: "btn-row" }, HP.playButton(sim), listen), ctr);
    upd();
  });

  /* =====================================================================
     11. Redshift: hydrogen lines from a receding galaxy
     ===================================================================== */
  mount("w-redshift", (box) => {
    const H0 = 2.3e-18, c = 3e8, LY = 9.46e15;
    const LINES = [656, 486, 434, 410];
    const cv = canvasIn(box);
    cv.setAttribute("aria-label", "Two spectra: hydrogen lines measured in the laboratory, and the same lines from a galaxy, shifted towards longer (redder) wavelengths.");
    const ctr = HP.el("div", { class: "sim-controls" });
    box.append(ctr);
    const sZ = HP.slider(ctr, { label: "Redshift z of the galaxy", min: 0, max: 0.2, step: 0.005, value: 0.05, fmt: (v) => v.toFixed(3), oninput: () => sim.redraw() });
    const R = readouts(box, [["l", "red H line: λ<sub>observed</sub>"], ["v", "recessional velocity v = zc"], ["d", "distance d = v / H<sub>0</sub>"]]);
    const sim = HP.sim(cv, {
      height: (w) => 196,
      draw(ctx, t, dt, C, S) {
        const z = sZ.value;
        const x0 = 14, x1 = S.w - 14, l0 = 380, l1 = 820;
        const X = (l) => x0 + (l - l0) / (l1 - l0) * (x1 - x0);
        const strip = (y, label, shift, absorb) => {
          for (let l = l0; l < l1; l += 1) { ctx.fillStyle = l > 750 ? "#2a0d0d" : HP.nmToRGB(l); ctx.fillRect(X(l), y, X(l + 1) - X(l) + 0.6, 40); }
          LINES.forEach((L) => { const lo = L * (1 + shift); if (lo < l1) pxRect(ctx, X(lo) - 1.5, y, 3, 40, "#000"); });
          HP.label(ctx, label, x0, y - 9, { size: 12, bold: true });
        };
        strip(24, "Hydrogen in the laboratory (rest wavelengths)", 0);
        strip(108, "", z);
        HP.label(ctx, `Hydrogen in the galaxy's light (z = ${z.toFixed(3)})`, x0, 160, { size: 12, bold: true });
        ctx.strokeStyle = C.ink2; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
        LINES.forEach((L) => { ctx.beginPath(); ctx.moveTo(X(L), 64); ctx.lineTo(X(L * (1 + z)), 108); ctx.stroke(); });
        ctx.setLineDash([]);
        ctx.fillStyle = C.ink2; ctx.font = font(11); ctx.textAlign = "center";
        for (let l = 400; l <= 800; l += 100) ctx.fillText(l + " nm", X(l), 186);
        HP.label(ctx, "infrared →", X(785), 128, { size: 11, align: "center", col: "#fff", halo: false });
        const lo = 656 * (1 + z), vv = z * c, d = vv / H0;
        R.l.textContent = `656 × (1 + ${z.toFixed(3)}) = ${lo.toFixed(0)} nm`;
        R.v.textContent = F(vv, 2) + " m s⁻¹";
        R.d.textContent = z > 0 ? `${F(d, 2)} m (≈ ${F(d / LY, 2)} light-years)` : "—";
      },
    });
  });

  /* =====================================================================
     12. The expanding Universe: every galaxy sees the others recede
     ===================================================================== */
  mount("w-hubble", (box) => {
    const cv = canvasIn(box, "dark");
    cv.setAttribute("aria-label", "A grid of galaxies expanding. From whichever galaxy you choose as home, every other galaxy moves away with a speed proportional to its distance; the graph of speed against distance is a straight line.");
    const N = 7;
    const gal = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) gal.push({ i: i + (Math.sin(i * 7 + j * 3) * 0.18), j: j + (Math.cos(i * 5 + j * 11) * 0.18) });
    let home = 24;
    const note = HP.el("p", { class: "sim-note" }, "Tap or click any galaxy to make it \"home\". The arrows show how fast each other galaxy is moving away from home. Every galaxy sees the same pattern: there is no centre.");
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 520 : 330),
      draw(ctx, t, dt, C, S) {
        ctx.fillStyle = "#0d1424"; ctx.fillRect(0, 0, S.w, S.h);
        const narrow = S.w < 560;
        const pane = narrow ? { x: 0, y: 0, w: S.w, h: S.w * 0.85 } : { x: 0, y: 0, w: S.h, h: S.h };
        const scale = 1 + 0.35 * ((t % 6) / 6); // the Universe stretches
        const hg = gal[home];
        const cx = pane.x + pane.w / 2, cy = pane.y + pane.h / 2;
        const sp = pane.w / (N + 1.2) / 1.35;
        const pos = (gg, s) => [cx + (gg.i - hg.i) * sp * s, cy + (gg.j - hg.j) * sp * s];
        const pts = [];
        gal.forEach((gg, k) => {
          const [x, y] = pos(gg, scale);
          const d = Math.hypot(gg.i - hg.i, gg.j - hg.j);
          pts.push([d, k]);
          if (x < -10 || y < -10 || x > pane.x + pane.w + 10 || y > pane.y + pane.h + 10) return;
          if (k !== home) HP.arrow(ctx, x, y, x + (x - cx) * 0.18, y + (y - cy) * 0.18, "rgba(255,120,100,.8)", 1.5, 5);
          const col = k === home ? "#ffd65a" : "#cfd6e6";
          pxRect(ctx, x - 3, y - 3, 6, 6, col); pxRect(ctx, x - 6, y - 1, 12, 2, col);
        });
        HP.label(ctx, "home", cx, cy - 12, { size: 11, align: "center", col: "#ffd65a", halo: false, bold: true });
        cv._pick = (mx, my) => {
          let best = home, bd = 1e9;
          gal.forEach((gg, k) => { const [x, y] = pos(gg, scale); const d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = k; } });
          home = best; sim.redraw();
        };
        // Hubble plot from home's viewpoint
        const gb = narrow ? { x: 50, y: pane.h + 28, w: S.w - 66, h: S.h - pane.h - 62 } : { x: pane.w + 56, y: 20, w: S.w - pane.w - 72, h: S.h - 56 };
        const Cc = Object.assign({}, C, { ink: "#cfd6e6", ink2: "#cfd6e6", line: "#2a3550" });
        const ax = HP.plot(ctx, gb, { x0: 0, x1: 9, y0: 0, y1: 9, xt: 3, yt: 3, xl: "distance", yl: "speed of recession", C: Cc, fs: 11, tf: () => "" });
        pts.forEach(([d, k]) => { if (k === home) return; ctx.fillStyle = "#ff7864"; ctx.beginPath(); ctx.arc(ax.X(d), ax.Y(d), 3, 0, 7); ctx.fill(); });
        ctx.strokeStyle = "#ffd65a"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(ax.X(0), ax.Y(0)); ctx.lineTo(ax.X(9), ax.Y(9)); ctx.stroke(); ctx.setLineDash([]);
        HP.label(ctx, "v = H₀d: a straight line through the origin", gb.x + 10, gb.y + 24, { size: 11, col: "#ffd65a", halo: false });
      },
      loop: true,
    });
    cv.style.cursor = "pointer";
    cv.addEventListener("click", (e) => {
      const r = cv.getBoundingClientRect();
      if (cv._pick) cv._pick((e.clientX - r.left) * sim.w / r.width, (e.clientY - r.top) * sim.h / r.height);
    });
    const next = HP.el("button", { class: "btn small", type: "button" }, "Pick another home galaxy");
    next.addEventListener("click", () => { home = (home * 7 + 11) % gal.length; sim.redraw(); });
    box.append(HP.el("div", { class: "btn-row" }, HP.playButton(sim), next), note);
  });

  /* =====================================================================
     13. Black-body radiation: hotter means shorter peak and more power
     ===================================================================== */
  mount("w-blackbody", (box) => {
    const h = 6.63e-34, c = 3e8, k = 1.38e-23;
    const B = (lnm, T) => { const l = lnm * 1e-9; return (2 * h * c * c) / Math.pow(l, 5) / (Math.exp(h * c / (l * k * T)) - 1); };
    const cv = canvasIn(box);
    cv.setAttribute("aria-label", "Graphs of radiation emitted against wavelength for a star at the chosen temperature and for the Sun. The hotter curve peaks at a shorter wavelength and is higher at every wavelength.");
    const ctr = HP.el("div", { class: "sim-controls" });
    box.append(ctr);
    const sT = HP.slider(ctr, { label: "Surface temperature of the star", min: 3000, max: 12000, step: 100, value: 4000, unit: "K", oninput: () => sim.redraw() });
    const R = readouts(box, [["pk", "peak wavelength"], ["col", "the star looks"], ["pw", "power per m² compared with the Sun"]]);
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 260 : 290),
      draw(ctx, t, dt, C, S) {
        const T = sT.value, Ts = 5800;
        const gb = { x: 48, y: 22, w: S.w - 64, h: S.h - 58 };
        const ymax = B(2.898e6 / Math.max(T, Ts), Math.max(T, Ts)) * 1.08;
        // visible band
        for (let l = 380; l < 750; l += 2) { ctx.fillStyle = HP.nmToRGB(l); ctx.globalAlpha = 0.25; ctx.fillRect(gb.x + (l / 2500) * gb.w, gb.y, (2 / 2500) * gb.w + 0.5, gb.h); }
        ctx.globalAlpha = 1;
        const ax = HP.plot(ctx, gb, { x0: 0, x1: 2500, y0: 0, y1: ymax, xt: 500, yt: ymax / 4, yl: "energy emitted per second per m², per nm", C, fs: 11, ytf: () => "" });
        // x-axis title below the tick numbers, where no curve can reach it
        HP.label(ctx, "wavelength / nm", gb.x + gb.w, gb.y + gb.h + 27, { size: 11, bold: true, align: "right", col: C.ink, halo: false });
        const curve = (TT, col, w, dash) => {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath();
          for (let l = 50; l <= 2500; l += 10) { const y = B(l, TT); l > 50 ? ctx.lineTo(ax.X(l), ax.Y(Math.min(y, ymax * 1.2))) : ctx.moveTo(ax.X(l), ax.Y(y)); }
          ctx.stroke(); ctx.setLineDash([]);
        };
        curve(Ts, C.muted, 2, [6, 4]);
        curve(T, C.red, 3);
        const lp = 2.898e6 / T;
        ctx.strokeStyle = C.red; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(ax.X(lp), ax.Y(B(lp, T))); ctx.lineTo(ax.X(lp), ax.Y(0)); ctx.stroke(); ctx.setLineDash([]);
        // peak label: above the peak, but never up among the y-axis title; if clamped, slide it right until it clears the curve
        const pkY = ax.Y(B(lp, T)), labY = Math.max(pkY - 8, gb.y + 24);
        let labX = ax.X(lp) + 6;
        if (labY > pkY - 8) { let l = lp; while (l < 2500 && ax.Y(B(l, T)) < labY + 8) l += 5; labX = ax.X(l) + 10; }
        HP.label(ctx, `peak ${lp.toFixed(0)} nm`, labX, labY, { size: 11, col: C.red, bold: true });
        HP.label(ctx, "dashed: the Sun (5800 K)", gb.x + gb.w, gb.y + 30, { size: 11, align: "right", col: C.muted });
        // a star swatch
        const col = T < 3700 ? "#ffb070" : T < 5200 ? "#ffd2a0" : T < 6500 ? "#fff4e8" : T < 9000 ? "#e6eeff" : "#b8ccff";
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(gb.x + gb.w - 26, gb.y + 62, 16, 0, 7); ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke();
        R.pk.textContent = lp.toFixed(0) + " nm";
        R.col.textContent = T < 3700 ? "orange-red" : T < 5200 ? "orange-yellow" : T < 6500 ? "yellow-white" : T < 9000 ? "white" : "blue-white";
        R.pw.textContent = "× " + F(Math.pow(T / Ts, 4), 2);
      },
    });
  });
})();
