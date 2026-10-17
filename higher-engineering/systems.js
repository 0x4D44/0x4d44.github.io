/* Systems, energy & impacts: the widgets. Every number a widget shows comes from the same rules the text teaches. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const N = HE.n;
  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const canvasIn = (box, label) => { const c = HE.el("canvas", { class: "sim", role: "img", "aria-label": label }); box.append(c); return c; };
  const controls = (box) => { const d = HE.el("div", { class: "sim-controls" }); box.append(d); return d; };
  /* "{context}" in a sentence becomes a highlighted span */
  const ctx = (s) => HE.esc(s).replace(/\{([^}]+)\}/g, '<span class="sy-ctx">$1</span>');

  /* =====================================================================
     1. Role-answer builder
     ===================================================================== */
  const ROLES = {
    tidal: { name: "Tidal turbine array", disc: {
      Mechanical: [
        ["Designs the {rotor blades and the drive train} of each turbine", "by calculating the force and torque that the moving water puts on the blades, so that the shaft and bearings are strong enough to survive years in the sea"],
        ["Designs the {mounting and yaw system} that holds each turbine facing the tide", "by working out the thrust from the tidal flow, so that the fixings and moving parts do not fail"]],
      Electrical: [
        ["Designs the {generator, converter and cabling} for the array", "by calculating current from the rated power, so that cables and electronics are sized to carry it without overheating"],
        ["Designs the {sensing and protection circuits}", "using speed and temperature sensors and a circuit that shuts a turbine down if limits are exceeded, so that one fault does not destroy the generator in a remote place"]],
      Civil: [
        ["Designs the {sea-bed foundations and support structures}", "by calculating the loads from the tidal flow and the weight of the turbine, so that they stay stable in the strongest tide"],
        ["Surveys the {sea bed and the channel}", "so that foundations are placed on ground strong enough to carry the loads, and cable routes avoid hazards"]],
      Environmental: [
        ["Assesses the effect of the array on {fish, seals and birds}", "by surveying wildlife before installation and predicting the effect of the rotating blades, so that the layout can be changed to reduce harm"],
        ["Plans how the {site will be monitored}", "by measuring noise and sediment movement during operation, so that harm is detected early and corrected"]],
    } },
    bridge: { name: "New road bridge", disc: {
      Civil: [
        ["Designs the {deck, piers and foundations}", "by calculating the loads from traffic, wind and the bridge's own weight, so that every part can carry its share with a safety margin"],
        ["Supervises {construction on site}", "by checking that the work matches the drawings and that materials meet the specification, so that the finished bridge is safe"]],
      Materials: [
        ["Selects the {steel and concrete grades}", "by comparing strength, corrosion resistance and cost, so that the structure lasts in a damp, salty climate"],
        ["Specifies {protective coatings}", "to stop corrosion, which reduces maintenance and extends the life of the bridge"]],
      Electrical: [
        ["Designs the {lighting and power supply}", "by selecting cable sizes and circuits for the power needed, so that they work safely in wet and windy conditions"],
        ["Designs {sensors that monitor the structure}", "such as strain and vibration sensors sending signals to a control room, so that problems are found before they become dangerous"]],
      Environmental: [
        ["Assesses the effect on {river or estuary habitat}", "by surveying the wildlife and water quality, so that the construction methods and timing can be chosen to cause least harm"],
        ["Plans how {construction pollution is limited}", "by controlling dust, spills and noise on site, so that the neighbouring community and water are protected"]],
    } },
    ferry: { name: "Electric ferry", disc: {
      Mechanical: [
        ["Designs the {propeller shaft and drive}", "calculating the torque and power needed to hold the service speed, so that the motor and gearing are correctly sized"],
        ["Calculates the {energy used per crossing}", "using the work done against water resistance over the route, so that the battery has enough capacity"]],
      Electrical: [
        ["Designs the {battery pack and pier charging system}", "by working out the energy per crossing and the charging current, so that cables and protection are rated safely"],
        ["Designs the {motor control electronics}", "so that speed can be varied smoothly and the motor is protected from overload"]],
      Software: [
        ["Writes the {battery management program}", "that monitors cell temperature and charge, so that it can limit the current or shut down safely"],
        ["Programs the {propulsion controller}", "to read the throttle and speed sensors and drive the motor, so that the ferry responds smoothly and safely to the captain"]],
      Environmental: [
        ["Compares the {emissions of the electric ferry with a diesel one}", "over the whole life including making the batteries and generating the charging electricity, so that the real benefit is known"],
        ["Assesses the {noise and wash} on the harbour and shore", "so that the route and speed can be chosen to limit the effect on wildlife and residents"]],
    } },
    robot: { name: "Warehouse robot system", disc: {
      Software: [
        ["Writes the {route-planning program}", "that reads sensor data and chooses a path, so that the robots avoid each other and deliver orders quickly"],
        ["Writes the {safety routines}", "that stop a robot immediately when a person enters its zone, so that people are protected"]],
      Mechanical: [
        ["Designs the {drive wheels and lifting mechanism}", "calculating the torque needed to move a full load, so that the motors are not overloaded"],
        ["Selects the {gearing and bearings}", "by calculating the speeds and forces involved, so that the robot is efficient and lasts through constant use"]],
      Electrical: [
        ["Designs the {sensor and motor-driver circuits}", "so that the robot detects obstacles and drives its motors with the right current"],
        ["Specifies the {battery and charging stations}", "by working out the energy used per shift, so that the robots can keep running without long breaks"]],
      Civil: [
        ["Checks the {warehouse floor loading}", "by calculating the weight of robots and loaded racks, so that the floor will not be overstressed"],
        ["Designs the {racking and layout}", "so that the structure supports the stored goods safely and leaves clear lanes for the robots"]],
    } },
  };
  mount("w-role", (box) => {
    let proj = "tidal", disc = "Mechanical";
    const out = HE.el("div", { class: "sy-ans", "aria-live": "polite" });
    const pBox = HE.el("div");
    const dBox = HE.el("div");
    function drawDisc() {
      dBox.innerHTML = "";
      const names = Object.keys(ROLES[proj].disc);
      if (!names.includes(disc)) disc = names[0];
      HE.choice(dBox, "Discipline", names.map((n) => [n, n]), disc, (v) => { disc = v; show(); });
    }
    HE.choice(pBox, "Project", Object.entries(ROLES).map(([k, v]) => [k, v.name]), proj, (v) => { proj = v; drawDisc(); show(); });
    box.append(pBox, dBox, out);
    function show() {
      if (!ROLES[proj].disc[disc]) { disc = Object.keys(ROLES[proj].disc)[0]; drawDisc(); }
      const rs = ROLES[proj].disc[disc];
      const lis = rs.map(([r, h], i) => `<li><strong>Role ${i + 1}.</strong> <span class="sy-tag sy-r">${ctx(r)}</span> <span class="sy-tag sy-h">${ctx(h)}.</span></li>`).join("");
      out.innerHTML = `<p style="margin:0"><strong>${disc} engineer, ${ROLES[proj].name}: where does each role sit in the project?</strong></p><ol>${lis}</ol>` +
        `<p class="sy-weak"><strong>The weak version:</strong> "The ${disc.toLowerCase()} engineer designs the ${ROLES[proj].name.toLowerCase()}." This names a job title but says no specific task, no method and no reason, and it is the same sentence however many roles are asked for. The strong version above names two different tasks, and gives each a method or a reason tied to the project (highlighted in gold).</p>`;
    }
    drawDisc(); show();
  });

  /* =====================================================================
     2. Assemble the control diagram
     ===================================================================== */
  const SLOTS = [
    ["in", "Input (desired value)", "The input is what we want the output to be."],
    ["cmp", "Comparator (error detector)", "The comparator subtracts the measured output from the desired value to give the error."],
    ["ctl", "Controller", "The controller decides what to do about the error."],
    ["act", "Actuator", "The actuator turns the controller's decision into physical action."],
    ["pro", "Process", "The process is the thing being controlled, and it is where disturbances arrive."],
    ["out", "Output", "The output is what actually results; it is measured by the sensor."],
    ["sen", "Sensor (feedback)", "The sensor sits in the feedback path: it measures the output and sends it back to the comparator."],
  ];
  const SYSTEMS = {
    bilge: { name: "Automatic bilge pump", dist: "A leak or a wave over the rail", blocks: {
      in: "Maximum safe water level (set point)", cmp: "Compares measured level with the set level", ctl: "Pump switching circuit", act: "Pump motor",
      pro: "Water in the bilge", out: "Actual water level", sen: "Float or level sensor" }, decoys: ["Anchor capstan", "Ship's compass"] },
    steer: { name: "Autopilot steering", dist: "A gust or a wave on the bow", blocks: {
      in: "Desired heading (ordered by the captain)", cmp: "Error detector: desired minus actual heading", ctl: "Autopilot (sets the rudder demand)", act: "Hydraulic rudder motor",
      pro: "Ship and rudder", out: "Actual heading", sen: "Compass (heading sensor)" }, decoys: ["Bilge float switch", "Gun-port piston"] },
  };
  mount("w-blocks", (box) => {
    let sysKey = "bilge", sel = null, placed = {}, checked = false;
    const sysBox = HE.el("div");
    const bank = HE.el("div", { class: "sy-bank", role: "group", "aria-label": "Block bank" });
    const loop = HE.el("div", { class: "sy-loop", role: "group", "aria-label": "Forward path: input, comparator, controller, actuator, process, output" });
    const fb = HE.el("div", { class: "sy-fb", role: "group", "aria-label": "Feedback path" });
    const msg = HE.el("p", { class: "sim-note", "aria-live": "polite" });
    const btns = HE.el("div", { class: "btn-row" });
    const check = HE.el("button", { class: "btn small primary", type: "button" }, "Check");
    const reveal = HE.el("button", { class: "btn small", type: "button" }, "Show the answer");
    const reset = HE.el("button", { class: "btn small", type: "button" }, "↺ Clear");
    btns.append(check, reveal, reset);
    box.append(sysBox, bank, loop, fb, btns, msg);
    HE.choice(sysBox, "System", Object.entries(SYSTEMS).map(([k, v]) => [k, v.name]), sysKey, (v) => { sysKey = v; clear(); });
    const order = {};
    function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = (i * 7 + 3) % (i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; }
    function allBlocks() {
      const S = SYSTEMS[sysKey];
      const list = SLOTS.map(([k]) => ({ id: k, text: S.blocks[k] })).concat(S.decoys.map((t, i) => ({ id: "x" + i, text: t })));
      if (!order[sysKey]) order[sysKey] = shuffle(list.map((b) => b.id));
      return order[sysKey].map((id) => list.find((b) => b.id === id));
    }
    function clear() { sel = null; placed = {}; checked = false; msg.textContent = "Pick a block from the bank, then pick the slot it belongs in."; draw(); }
    function draw() {
      const S = SYSTEMS[sysKey], blocks = allBlocks();
      const used = new Set(Object.values(placed));
      bank.innerHTML = "";
      blocks.filter((b) => !used.has(b.id)).forEach((b) => {
        const el = HE.el("button", { class: "sy-block", type: "button", "aria-pressed": sel === b.id ? "true" : "false" }, b.text);
        el.addEventListener("click", () => { sel = sel === b.id ? null : b.id; draw(); });
        bank.append(el);
      });
      if (!bank.children.length) bank.append(HE.el("span", { class: "hint", style: "margin:0" }, "All blocks placed."));
      const mkSlot = ([k, label]) => {
        const id = placed[k];
        const b = id ? blocks.find((x) => x.id === id) : null;
        const cls = "sy-slot" + (b ? " filled" : "") + (checked && b ? (id === k ? " right" : " wrong") : "");
        const s = HE.el("button", { class: cls, type: "button", "aria-label": `${label} slot: ${b ? b.text + (checked ? (id === k ? ", correct" : ", not correct") : "") : "empty"}` },
          HE.el("small", null, label), b ? b.text : "(empty)");
        s.addEventListener("click", () => {
          if (b && !sel) { delete placed[k]; checked = false; draw(); return; }
          if (sel) { placed[k] = sel; sel = null; checked = false; draw(); }
        });
        return s;
      };
      loop.innerHTML = "";
      SLOTS.filter(([k]) => k !== "sen").forEach((sl, i, arr) => { loop.append(mkSlot(sl)); if (i < arr.length - 1) loop.append(HE.el("span", { class: "sy-arr", "aria-hidden": "true" })); });
      fb.innerHTML = "";
      fb.append(mkSlot(SLOTS[6]), HE.el("p", { class: "sy-fbnote" }, `Feedback path: the output goes through the sensor back to the comparator, where it is subtracted (the minus sign). Disturbance acting on the process: ${S.dist.toLowerCase()}.`));
    }
    check.addEventListener("click", () => {
      const filled = SLOTS.filter(([k]) => placed[k]).length;
      if (filled < SLOTS.length) { msg.textContent = `Fill all ${SLOTS.length} slots first (${filled} filled).`; return; }
      checked = true;
      const wrong = SLOTS.filter(([k]) => placed[k] !== k);
      draw();
      if (!wrong.length) msg.innerHTML = "<span class='ok'>All seven blocks are in the right place.</span> Follow the loop: the sensor measures the output, the comparator subtracts it from the desired value, and the controller acts on the error.";
      else msg.innerHTML = `<span class='bad'>${7 - wrong.length} of 7 correct.</span> Look at the red slots. ` + wrong.slice(0, 2).map(([k, l, why]) => `<b>${l}:</b> ${why}`).join(" ");
    });
    reveal.addEventListener("click", () => { placed = {}; SLOTS.forEach(([k]) => (placed[k] = k)); sel = null; checked = true; draw(); msg.textContent = "This is the complete loop. The two spare blocks do not belong to this system."; });
    reset.addEventListener("click", clear);
    clear();
  });

  /* =====================================================================
     3. The great wheel: open loop, two-state and proportional, side by side
        Ship heading psi (deg), yaw rate r (deg/s):  T dr/dt = Kr*rudder + d - r,  dpsi/dt = r
        Kr = 0.3 deg/s per deg of rudder, T = 5 s.  A steady gust d turns the ship at d deg/s if nothing opposes it.
        Steady proportional offset = (d / Kr) / Kp, exactly the "output needed / gain" of the text.
     ===================================================================== */
  const HELM = { Kr: 0.3, T: 5, band: 1, lim: 35, scale: 4, win: 60, step: 0.01 };
  function helmModel() {
    const P = { Kp: 1, d: 0.6, rud: 10 };
    const m = { P, t: 0, gust: false, auto: true, modes: null, hist: [], lastSample: 0 };
    m.reset = () => {
      m.t = 0; m.gust = false; m.auto = true; m.hist = []; m.lastSample = -1;
      m.modes = ["open", "two", "prop"].map((k) => ({ k, psi: 0, r: 0, del: 0, sw: 1 }));
      m.sample();
    };
    m.sample = () => { m.hist.push({ t: m.t, g: m.gust, y: m.modes.map((s) => s.psi), del: m.modes.map((s) => s.del) }); m.lastSample = m.t; };
    m.advance = (secs) => {
      const n = Math.max(1, Math.round(secs / HELM.step));
      for (let i = 0; i < n; i++) {
        if (m.auto && m.t >= 8) { m.gust = true; m.auto = false; }
        const d = m.gust ? P.d : 0;
        for (const s of m.modes) {
          const e = -s.psi; // desired heading is 0
          if (s.k === "open") s.del = 0;
          else if (s.k === "two") { if (e > HELM.band) s.sw = 1; else if (e < -HELM.band) s.sw = -1; s.del = s.sw * P.rud; }
          else s.del = Math.max(-HELM.lim, Math.min(HELM.lim, P.Kp * e));
          s.r += HELM.step * (HELM.Kr * s.del - s.r + d) / HELM.T;
          s.psi += HELM.step * s.r;
        }
        m.t += HELM.step;
        if (m.t - m.lastSample >= 0.1 - 1e-9) m.sample();
      }
      const cut = m.t - HELM.win - 10;
      while (m.hist.length && m.hist[0].t < cut) m.hist.shift();
    };
    m.reset();
    return m;
  }
  mount("w-helm", (box) => {
    const M = helmModel();
    const COL = (C) => [C.red, HE.css("--amber") || "#b86a00", C.sea];
    const NAMES = ["Open loop", "Two-state", "Proportional"];
    const canvas = canvasIn(box, "Three compass dials and a graph of heading ψ in degrees against time for open-loop, two-state and proportional control after a gust of wind.");
    const ctl = controls(box);
    let sim;
    HE.slider(ctl, { label: "Proportional gain K<sub>p</sub> (° rudder per ° error)", min: 0.2, max: 4, step: 0.1, value: M.P.Kp, fmt: (v) => N(v, 1), oninput: (v) => { M.P.Kp = v; note(); } });
    HE.slider(ctl, { label: "Gust strength (° s⁻¹ of turning)", min: 0.2, max: 1.5, step: 0.1, value: M.P.d, fmt: (v) => N(v, 1), oninput: (v) => { M.P.d = v; note(); } });
    HE.slider(ctl, { label: "Two-state rudder angle", min: 2, max: 25, step: 1, value: M.P.rud, unit: "°", oninput: (v) => { M.P.rud = v; } });
    const row = HE.el("div", { class: "btn-row" });
    const gustBtn = HE.el("button", { class: "btn small", type: "button", "aria-pressed": "false" }, "Gust: off");
    const skip = HE.el("button", { class: "btn small", type: "button" }, "Skip on 10 s");
    const rst = HE.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    row.append(gustBtn, skip, rst);
    box.append(row);
    const ro = HE.el("div", { class: "readouts" });
    const cells = NAMES.map((n) => { const b = HE.quiet(HE.el("b")); ro.append(HE.el("div", null, HE.el("span", null, n), b)); return b; });
    const noteEl = HE.el("p", { class: "sim-note", "aria-live": "polite" });
    box.append(ro, noteEl);
    function note() {
      const need = M.P.d / HELM.Kr, off = need / M.P.Kp;
      noteEl.innerHTML = `Holding a heading against this gust needs <b>${N(need, 1)}°</b> of rudder. Open loop never supplies it, so the heading runs away at about ${N(M.P.d, 1)}° per second. Proportional control supplies it once there is an error of <b>${N(off, 2)}°</b> (needed rudder ÷ gain): the steady-state offset. Raise the gain: the offset shrinks, but the heading starts to overshoot and ring.`;
    }
    function stat() {
      const h = M.hist, last = h[h.length - 1], from = M.t - 15;
      const recent = h.filter((p) => p.t >= from);
      cells.forEach((c, i) => {
        const ys = recent.map((p) => p.y[i]);
        const lo = Math.min(...ys), hi = Math.max(...ys);
        c.innerHTML = `${HE.n(last.y[i], 1)}°<small style="display:block;font-weight:400">last 15 s: ${HE.n(lo, 0)} to ${HE.n(hi, 0)}°</small>`;
      });
      gustBtn.textContent = "Gust: " + (M.gust ? "on" : "off");
      gustBtn.setAttribute("aria-pressed", M.gust ? "true" : "false");
    }
    sim = HE.sim(canvas, {
      height: (w) => (w < 480 ? 410 : 390),
      draw(ctx, t, dt, C, S) {
        if (sim && sim.playing) M.advance(dt * HELM.scale);
        const colors = COL(C);
        ctx.fillStyle = C.card; ctx.fillRect(0, 0, S.w, S.h);
        // dials
        const cw = S.w / 3, R = Math.max(28, Math.min(46, cw / 2 - 12)), cy = 14 + R;
        for (let i = 0; i < 3; i++) {
          const cx = cw * (i + 0.5), s = M.modes[i];
          ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = C.line; ctx.fillStyle = C.paper;
          ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill(); ctx.stroke();
          ctx.setLineDash([4, 3]); ctx.strokeStyle = C.ink2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - R); ctx.stroke(); ctx.setLineDash([]);
          const a = s.psi * Math.PI / 180;
          // the ship: a pointed hull rotated by the heading
          ctx.translate(cx, cy); ctx.rotate(a);
          ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.moveTo(0, -R * 0.82); ctx.lineTo(R * 0.2, R * 0.55); ctx.lineTo(-R * 0.2, R * 0.55); ctx.closePath(); ctx.fill();
          ctx.save(); ctx.translate(0, R * 0.55); ctx.rotate(-s.del * Math.PI / 180); ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, R * 0.3); ctx.stroke(); ctx.restore();
          ctx.restore();
          HE.label(ctx, NAMES[i], cx, cy + R + 14, { align: "center", bold: true, size: 12, col: colors[i] });
        }
        // plot
        const top = cy + R + 34, box2 = { x: 46, y: top, w: S.w - 46 - 12, h: S.h - top - 34 };
        const t0 = Math.max(0, M.t - HELM.win), t1 = t0 + HELM.win;
        const Pl = HE.plot(ctx, box2, { x0: t0, x1: t1, y0: -10, y1: 20, xt: 10, yt: 10, xl: "time (s)", yl: "heading ψ (°)", C, tf: (v) => String(Math.round(v)).replace("-", "−") });
        // gust shading
        HE.clip(ctx, box2, () => {
          ctx.fillStyle = C.line; ctx.globalAlpha = 0.35;
          let start = null;
          M.hist.forEach((p, k) => {
            if (p.g && start === null) start = p.t;
            if ((!p.g || k === M.hist.length - 1) && start !== null) { ctx.fillRect(Pl.X(start), box2.y, Pl.X(p.t) - Pl.X(start), box2.h); start = null; }
          });
          ctx.globalAlpha = 1;
          ctx.strokeStyle = C.ink2; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(box2.x, Pl.Y(0)); ctx.lineTo(box2.x + box2.w, Pl.Y(0)); ctx.stroke(); ctx.setLineDash([]);
          for (let i = 0; i < 3; i++) {
            ctx.strokeStyle = colors[i]; ctx.lineWidth = 2.4; ctx.lineJoin = "round";
            ctx.beginPath();
            let first = true;
            M.hist.forEach((p) => { if (p.t < t0 - 1) return; const x = Pl.X(p.t), y = Pl.Y(Math.max(-12, Math.min(22, p.y[i]))); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); });
            ctx.stroke();
          }
        });
        HE.label(ctx, "desired heading (0°)", box2.x + 6, Pl.Y(0) + 11, { size: 11, col: C.ink2 });
        if (M.gust) HE.label(ctx, "gust", box2.x + box2.w - 6, box2.y + 12, { align: "right", size: 12, bold: true, col: C.ink2 });
        stat();
      },
    });
    const play = HE.playButton(sim);
    row.prepend(play);
    if (HE.reduced) { M.advance(60); sim.redraw(); }
    gustBtn.addEventListener("click", () => { M.gust = !M.gust; M.auto = false; M.sample(); sim.redraw(); note(); });
    skip.addEventListener("click", () => { M.advance(10); sim.redraw(); });
    rst.addEventListener("click", () => { M.reset(); sim.redraw(); if (HE.reduced) { M.advance(60); sim.redraw(); } });
    note();
    // keep the canvas label current for screen readers whenever the scene is re-stated
    setInterval(() => {
      const h = M.hist[M.hist.length - 1];
      canvas.setAttribute("aria-label", `Heading error after ${N(M.t, 0)} seconds: open loop ${N(h.y[0], 1)} degrees, two-state ${N(h.y[1], 1)} degrees, proportional ${N(h.y[2], 1)} degrees. Gust ${M.gust ? "on" : "off"}.`);
    }, 2000);
  });

  /* =====================================================================
     4a. Sankey energy-flow gauge (capstan motor)
     ===================================================================== */
  mount("w-sankey", (box) => {
    const P = { pin: 10, heat: 18, fric: 14, snd: 3 };
    const cv = canvasIn(box, "Sankey diagram of power flowing through the capstan motor: one input band splitting into a useful output band and three loss bands.");
    const ctl = controls(box);
    let sim;
    const redraw = () => { if (sim) sim.redraw(); table(); };
    HE.slider(ctl, { label: "Input power", min: 2, max: 20, step: 0.5, value: P.pin, unit: "kW", fmt: (v) => N(v, 1), oninput: (v) => { P.pin = v; redraw(); } });
    HE.slider(ctl, { label: "Lost as heat in the motor", min: 0, max: 40, step: 1, value: P.heat, unit: "%", oninput: (v) => { P.heat = v; redraw(); } });
    HE.slider(ctl, { label: "Lost to friction in gears and bearings", min: 0, max: 40, step: 1, value: P.fric, unit: "%", oninput: (v) => { P.fric = v; redraw(); } });
    HE.slider(ctl, { label: "Lost as sound and vibration", min: 0, max: 20, step: 1, value: P.snd, unit: "%", oninput: (v) => { P.snd = v; redraw(); } });
    const row = HE.el("div", { class: "btn-row" });
    box.append(row);
    const eff = HE.quiet(HE.el("b", { class: "readout" }));
    const warn = HE.el("p", { class: "sim-note", "aria-live": "polite" });
    const tw = HE.el("div", { class: "table-wrap" });
    box.append(HE.el("p", { class: "readout", "aria-live": "polite" }, "Efficiency η = P", HE.el("sub", null, "out"), " ÷ P", HE.el("sub", null, "in"), " = ", eff), warn, tw);
    function paths() {
      let l = [P.heat, P.fric, P.snd], s = l[0] + l[1] + l[2], capped = false;
      if (s > 95) { l = l.map((x) => x * 95 / s); capped = true; }
      const loss = l.map((x) => x / 100 * P.pin);
      const useful = P.pin - loss.reduce((a, b) => a + b, 0);
      return { loss, useful, capped, pct: l };
    }
    function table() {
      const p = paths();
      const rows = [["Useful output", p.useful, "Useful"], ["Motor heat", p.loss[0], "Wasted"], ["Friction", p.loss[1], "Wasted"], ["Sound", p.loss[2], "Wasted"]];
      tw.innerHTML = `<table><caption>Energy audit of the capstan motor (energy per minute = power × 60 s).</caption><thead><tr><th>Path</th><th class="num">Power (kW)</th><th class="num">% of input</th><th class="num">kJ in 60 s</th></tr></thead><tbody>` +
        `<tr><th scope="row">Electrical input</th><td class="num">${N(P.pin, 2)}</td><td class="num">100</td><td class="num">${N(P.pin * 60, 0)}</td></tr>` +
        rows.map(([n, v, r]) => `<tr><th scope="row">${n}</th><td class="num">${N(v, 2)}</td><td class="num">${N(v / P.pin * 100, 1)}</td><td class="num">${N(v * 60, 0)}</td></tr>`).join("") +
        `<tr><th scope="row">Useful + wasted</th><td class="num">${N(p.useful + p.loss.reduce((a, b) => a + b, 0), 2)}</td><td class="num">100</td><td class="num">${N(P.pin * 60, 0)}</td></tr></tbody></table>`;
      eff.textContent = `${N(p.useful / P.pin, 3)} (${N(p.useful / P.pin * 100, 1)} %)`;
      warn.textContent = p.capped ? "The three losses together cannot exceed 95 % of the input, so they have been scaled down to fit." : "";
      cv.setAttribute("aria-label", `Sankey diagram: ${N(P.pin, 1)} kilowatts in; ${N(p.useful, 2)} useful; losses ${N(p.loss[0], 2)} heat, ${N(p.loss[1], 2)} friction, ${N(p.loss[2], 2)} sound. Efficiency ${N(p.useful / P.pin * 100, 1)} percent.`);
    }
    const bez = (a, b, s) => { // cubic with horizontal tangents between (a.x,a.y) and (b.x,b.y)
      const mx = (a.x + b.x) / 2, u = 1 - s;
      return { x: u * u * u * a.x + 3 * u * u * s * mx + 3 * u * s * s * mx + s * s * s * b.x, y: u * u * u * a.y + 3 * u * u * s * a.y + 3 * u * s * s * b.y + s * s * s * b.y };
    };
    sim = HE.sim(cv, {
      loop: true,
      height: () => 270,
      draw(ctx, t, dt, C, S) {
        ctx.fillStyle = C.card; ctx.fillRect(0, 0, S.w, S.h);
        const p = paths();
        const scaleH = 150 / 20; // px per kW
        const H = P.pin * scaleH;
        const x0 = 14, xa = Math.min(110, S.w * 0.3), xb = S.w - Math.min(150, S.w * 0.38);
        const yTop = 40 + (150 - H) / 2;
        const bands = [
          { v: p.useful, col: C.grass, name: "Useful" },
          { v: p.loss[0], col: C.red, name: "Heat" },
          { v: p.loss[1], col: C.lode, name: "Friction" },
          { v: p.loss[2], col: C.violet, name: "Sound" },
        ];
        let ya = yTop, yb = 24;
        const gap = 12;
        bands.forEach((b, i) => {
          b.th = Math.max(b.v * scaleH, b.v > 0 ? 1.5 : 0);
          b.a = { x: xa, y: ya }; b.b = { x: xb, y: yb };
          ya += b.v * scaleH; yb += b.th + gap + (i === 0 ? 16 : 0);
        });
        // input block
        ctx.fillStyle = C.ink2; ctx.globalAlpha = 0.85; ctx.fillRect(x0, yTop, 14, H); ctx.globalAlpha = 1;
        // bands (filled shapes between bezier edges)
        bands.forEach((b) => {
          if (b.v <= 0) return;
          ctx.fillStyle = b.col; ctx.globalAlpha = 0.5;
          ctx.beginPath(); ctx.moveTo(x0 + 14, b.a.y);
          ctx.lineTo(b.a.x, b.a.y);
          const mx = (b.a.x + b.b.x) / 2;
          ctx.bezierCurveTo(mx, b.a.y, mx, b.b.y, b.b.x, b.b.y);
          ctx.lineTo(b.b.x, b.b.y + b.th);
          ctx.bezierCurveTo(mx, b.b.y + b.th, mx, b.a.y + b.v * scaleH, b.a.x, b.a.y + b.v * scaleH);
          ctx.lineTo(x0 + 14, b.a.y + b.v * scaleH);
          ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        });
        // particles: blocks of energy, count in proportion to power
        bands.forEach((b) => {
          if (b.v <= 0) return;
          const n = Math.max(1, Math.round(b.v / 20 * 30));
          const cyA = b.a.y + (b.v * scaleH) / 2, cyB = b.b.y + b.th / 2;
          for (let i = 0; i < n; i++) {
            const u = ((i / n) + t * 0.18) % 1;
            let x, y;
            const f = 0.25;
            if (u < f) { x = x0 + 14 + (xa - x0 - 14) * (u / f); y = cyA; }
            else { const q = bez({ x: xa, y: cyA }, { x: xb, y: cyB }, (u - f) / (1 - f)); x = q.x; y = q.y; }
            ctx.fillStyle = b.col; ctx.fillRect(x - 3, y - 3, 6, 6);
            ctx.strokeStyle = C.ink; ctx.lineWidth = 0.8; ctx.strokeRect(x - 3, y - 3, 6, 6);
          }
        });
        HE.label(ctx, "Input", x0, yTop - 10, { bold: true, size: 12 });
        HE.label(ctx, `${N(P.pin, 1)} kW`, x0, yTop + H + 12, { size: 12 });
        bands.forEach((b) => {
          if (b.v <= 0 && b.name !== "Useful") return;
          HE.label(ctx, `${b.name}: ${N(b.v, 2)} kW`, xb + 8, b.b.y + b.th / 2, { size: 12, bold: b.name === "Useful", col: C.ink });
        });
        HE.label(ctx, `η = ${N(p.useful / P.pin * 100, 1)} %`, S.w - 8, S.h - 14, { align: "right", bold: true, size: 15, col: C.ink });
      },
    });
    const play = HE.playButton(sim, ["▶ Flow", "❚❚ Pause flow"]);
    row.append(play);
    table();
  });

  /* =====================================================================
     4b. The armourer's bench: size of a joule
     ===================================================================== */
  function sciTex(x, sf) {
    if (!isFinite(x)) return "-";
    if (x === 0) return "0";
    const ax = Math.abs(x);
    if (ax >= 1e5 || ax < 1e-3) {
      let e = Math.floor(Math.log10(ax)), ms = (x / Math.pow(10, e)).toFixed(sf - 1);
      if (parseFloat(ms) >= 10) { e++; ms = (x / Math.pow(10, e)).toFixed(sf - 1); }
      return `${ms}\\times 10^{${e}}`;
    }
    return HE.fmt(x, sf).replace("−", "-");
  }
  const BENCH = {
    ek: { name: "Kinetic", tex: (v) => `E_k = \\tfrac12 mv^2 = \\tfrac12 \\times ${N(v.m, 0)} \\times ${N(v.v, 1)}^2`, f: (v) => 0.5 * v.m * v.v * v.v,
      s: [["m", "Mass of the launch (kg)", 1, 2000, 1, 1800], ["v", "Speed (m s⁻¹)", 0, 20, 0.5, 6]] },
    ep: { name: "Potential", tex: (v) => `E_p = mgh = ${N(v.m, 0)} \\times 9.8 \\times ${N(v.h, 1)}`, f: (v) => v.m * 9.8 * v.h,
      s: [["m", "Mass of the anchor (kg)", 1, 2000, 1, 1400], ["h", "Height raised (m)", 0, 30, 0.5, 6]] },
    eh: { name: "Heat", tex: (v) => `E_h = cm\\Delta T = 4180 \\times ${N(v.m, 1)} \\times ${N(v.dT, 0)}`, f: (v) => 4180 * v.m * v.dT,
      s: [["m", "Mass of water (kg)", 0.1, 5, 0.1, 2], ["dT", "Temperature rise (K)", 1, 100, 1, 50]] },
    ee: { name: "Electrical", tex: (v) => `E_e = VIt = ${N(v.V, 0)} \\times ${N(v.I, 1)} \\times ${N(v.t, 0)}`, f: (v) => v.V * v.I * v.t,
      s: [["V", "Voltage (V)", 1, 50, 1, 24], ["I", "Current (A)", 0.1, 10, 0.1, 3.5], ["t", "Time (s)", 1, 3600, 1, 600]] },
    ew: { name: "Work done", tex: (v) => `E_w = Fd = ${N(v.F, 0)} \\times ${N(v.d, 1)}`, f: (v) => v.F * v.d,
      s: [["F", "Force (N)", 10, 20000, 10, 5600], ["d", "Distance moved (m)", 0.1, 20, 0.1, 3]] },
  };
  const REFS = [["Lifting a 1 kg block by 1 m", 9.8], ["A 24 V, 1 A lamp lit for 1 min", 1440], ["Warming 1 kg of water by 1 K", 4180], ["A 1800 kg launch stopping from 6 m s⁻¹", 32400], ["Heating 1 kg of water from 20 °C to 100 °C", 334400]];
  mount("w-bench", (box) => {
    let key = "ek"; const vals = {};
    const pick = HE.el("div"), ctl = controls(box);
    const sub = HE.el("div", { class: "tex-out", "aria-live": "polite" });
    const scale = HE.el("div", { class: "sy-scale", role: "group", "aria-label": "Comparison of this energy with everyday references, on a logarithmic scale" });
    box.append(sub, scale);
    box.insertBefore(pick, ctl);
    function build() {
      ctl.innerHTML = "";
      BENCH[key].s.forEach(([k, label, min, max, step, dflt]) => {
        if (vals[key + k] == null) vals[key + k] = dflt;
        HE.slider(ctl, { label, min, max, step, value: vals[key + k], fmt: (x) => N(x, step < 1 ? 1 : 0), oninput: (x) => { vals[key + k] = x; show(); } });
      });
      show();
    }
    function show() {
      const B = BENCH[key], v = {};
      B.s.forEach(([k]) => (v[k] = vals[key + k]));
      const E = B.f(v);
      sub.innerHTML = HE.tex(B.tex(v) + ` = ${sciTex(E, 3)}\\ \\text{J}`, true);
      const all = REFS.map(([n, e]) => ({ n, e })).concat([{ n: "Your answer", e: Math.max(E, 0), me: true }]).sort((a, b) => a.e - b.e);
      scale.innerHTML = all.map((r) => `<div class="sy-scale-row${r.me ? " me" : ""}"><span>${HE.esc(r.n)}</span><span class="sy-barwrap"><span class="bar" style="width:${Math.max(2, Math.log10(Math.max(r.e, 1)) / 6 * 80)}%"></span><span class="val">${HE.fmt(r.e, 3)} J</span></span></div>`).join("");
    }
    HE.choice(pick, "Formula", Object.entries(BENCH).map(([k, v]) => [k, v.name]), key, (v) => { key = v; build(); });
    build();
  });

  /* =====================================================================
     4c. The swinging lantern: Ep, Ek and heat
     ===================================================================== */
  mount("w-pend", (box) => {
    const g = 9.8, L = 2.0, m = 1.0;
    const P = { a0: 50, c: 0.1 };
    let th = P.a0 * Math.PI / 180, om = 0, E0 = 0, time = 0;
    function release() { th = P.a0 * Math.PI / 180; om = 0; time = 0; E0 = m * g * L * (1 - Math.cos(th)); }
    release();
    const cv = canvasIn(box, "A swinging lantern with energy bars for potential, kinetic and heat energy.");
    const ctl = controls(box);
    let sim;
    HE.slider(ctl, { label: "Release angle", min: 5, max: 80, step: 1, value: P.a0, unit: "°", oninput: (v) => { P.a0 = v; release(); sim && sim.redraw(); } });
    HE.slider(ctl, { label: "Friction (damping)", min: 0, max: 0.5, step: 0.01, value: P.c, fmt: (v) => N(v, 2), oninput: (v) => { P.c = v; } });
    const row = HE.el("div", { class: "btn-row" });
    const rel = HE.el("button", { class: "btn small", type: "button" }, "↺ Release again");
    const stepB = HE.el("button", { class: "btn small", type: "button" }, "Step 0.1 s");
    row.append(rel, stepB);
    const ro = HE.el("div", { class: "readouts" });
    const cells = ["Potential Ep (J)", "Kinetic Ek (J)", "Heat (J)", "Total (J)"].map((n) => { const b = HE.quiet(HE.el("b")); ro.append(HE.el("div", null, HE.el("span", null, n), b)); return b; });
    box.append(row, ro);
    function advance(secs) {
      const h = 0.002, n = Math.round(secs / h);
      for (let i = 0; i < n; i++) { om += h * (-(g / L) * Math.sin(th) - P.c * om); th += h * om; }
      time += secs;
    }
    const energies = () => {
      const Ep = m * g * L * (1 - Math.cos(th)), Ek = 0.5 * m * (L * om) * (L * om);
      return { Ep, Ek, Q: (E0 - Ep - Ek) < 0.05 ? 0 : E0 - Ep - Ek };
    };
    sim = HE.sim(cv, {
      loop: true,
      height: (w) => (w < 480 ? 280 : 300),
      draw(ctx, t, dt, C, S) {
        if (sim && sim.playing) advance(Math.min(dt, 0.05) * 1.5);
        const e = energies();
        ctx.fillStyle = C.card; ctx.fillRect(0, 0, S.w, S.h);
        const pw = S.w * 0.52, px = pw / 2, py = 26, scale = Math.min(pw * 0.42, (S.h - 70) / (L * 1.1)) / L * 1; // px per metre
        // beam and release ghost
        ctx.strokeStyle = C.dirt; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(px - 36, py); ctx.lineTo(px + 36, py); ctx.stroke();
        const bx = (a) => px + L * scale * Math.sin(a), by = (a) => py + L * scale * Math.cos(a);
        const a0 = P.a0 * Math.PI / 180;
        ctx.setLineDash([4, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx(a0), by(a0)); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(bx(a0), by(a0), 9, 0, 7); ctx.stroke();
        // release height line
        ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(8, by(a0)); ctx.lineTo(pw - 8, by(a0)); ctx.stroke();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx(th), by(th)); ctx.stroke();
        ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.fillRect(bx(th) - 9, by(th) - 9, 18, 18); ctx.strokeRect(bx(th) - 9, by(th) - 9, 18, 18);
        HE.label(ctx, "release height", 10, by(a0) - 8, { size: 11, col: C.ink2 });
        // bars
        const bx0 = pw + 18, bw = Math.max(26, (S.w - bx0 - 16) / 3 - 8), bh = S.h - 70, bottom = S.h - 40;
        const sc = bh / Math.max(E0, 1e-6);
        const bars = [["Ep", e.Ep, C.sea], ["Ek", e.Ek, C.red], ["Heat", e.Q, HE.css("--amber") || "#b86a00"]];
        bars.forEach(([n, v, col], i) => {
          const x = bx0 + i * (bw + 8), h = Math.max(0, Math.min(bh, v * sc));
          ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fillRect(x, bottom - h, bw, h); ctx.globalAlpha = 1;
          ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(x, bottom - bh, bw, bh);
          HE.label(ctx, n, x + bw / 2, bottom + 14, { align: "center", bold: true, size: 12 });
        });
        ctx.setLineDash([5, 3]); ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(bx0 - 4, bottom - bh); ctx.lineTo(S.w - 8, bottom - bh); ctx.stroke(); ctx.setLineDash([]);
        HE.label(ctx, "total energy", S.w - 10, bottom - bh - 9, { align: "right", size: 11, col: C.ink2 });
        cells[0].textContent = N(e.Ep, 2); cells[1].textContent = N(e.Ek, 2); cells[2].textContent = N(e.Q, 2); cells[3].textContent = N(e.Ep + e.Ek + e.Q, 2);
      },
    });
    const play = HE.playButton(sim);
    row.prepend(play);
    rel.addEventListener("click", () => { release(); sim.redraw(); });
    stepB.addEventListener("click", () => { advance(0.1); sim.redraw(); });
    setInterval(() => { const e = energies(); cv.setAttribute("aria-label", `Lantern swinging. Potential ${N(e.Ep, 1)} joules, kinetic ${N(e.Ek, 1)} joules, heat ${N(e.Q, 1)} joules, total ${N(E0, 1)} joules.`); }, 2000);
  });

  /* =====================================================================
     5a. Unit and prefix drill
     ===================================================================== */
  const plain = (x) => {
    if (!isFinite(x)) return "?";
    const s = Number(x.toPrecision(10));
    return s.toLocaleString("en-GB", { maximumFractionDigits: 15, useGrouping: false });
  };
  const PRE = [["p", -12, "pico"], ["n", -9, "nano"], ["µ", -6, "micro"], ["m", -3, "milli"], ["k", 3, "kilo"], ["M", 6, "mega"], ["G", 9, "giga"]];
  const NUMS = [4.7, 22, 330, 0.56, 1.5, 12, 250, 47, 3.3, 100, 680, 2.2];
  const UN = ["Ω", "A", "V", "W", "J", "N", "m", "s"];
  const choose = (a, r) => a[Math.floor(r() * a.length)];
  function makeQ(r) {
    const type = choose(["prefix", "prefix", "back", "area", "rpm", "time", "stress"], r);
    if (type === "prefix") {
      const [sym, e, name] = choose(PRE, r), v = choose(NUMS, r), u = choose(UN, r);
      return { q: `Convert ${plain(v)} ${sym}${u} into ${u}.`, ans: v * Math.pow(10, e), unit: u, how: `${name} (${sym}) means × 10${HE.sup(e)}. So ${plain(v)} × 10${HE.sup(e)} = ${plain(v * Math.pow(10, e))} ${u}.` };
    }
    if (type === "back") {
      const [sym, e, name] = choose(PRE.filter((p) => p[1] <= 6 && p[1] >= -6), r), v = choose([0.0047, 0.25, 3300, 0.015, 120, 45000, 2.5], r), u = choose(UN, r);
      return { q: `Convert ${plain(v)} ${u} into ${sym}${u}.`, ans: v / Math.pow(10, e), unit: sym + u, how: `A ${name} unit is 10${HE.sup(e)} of the base unit, so divide by 10${HE.sup(e)}: ${plain(v)} ÷ 10${HE.sup(e)} = ${plain(v / Math.pow(10, e))} ${sym}${u}.` };
    }
    if (type === "area") {
      const v = choose([50, 250, 1200, 80, 314, 2000], r);
      return { q: `Convert ${plain(v)} mm² into m².`, ans: v * 1e-6, unit: "m²", how: `1 mm = 10⁻³ m, so 1 mm² = (10⁻³)² m² = 10⁻⁶ m². ${plain(v)} × 10⁻⁶ = ${plain(v * 1e-6)} m². (The conversion for area is the square of the length factor.)` };
    }
    if (type === "rpm") {
      const v = choose([450, 1200, 90, 3000, 47, 600], r);
      return { q: `A shaft turns at ${plain(v)} rev/min. Give its speed in rev/s.`, ans: v / 60, unit: "rev/s", how: `There are 60 seconds in a minute, so divide by 60: ${plain(v)} ÷ 60 = ${plain(v / 60)} rev/s.` };
    }
    if (type === "time") {
      const v = choose([5, 12, 45, 90, 2.5], r);
      return { q: `Give ${plain(v)} minutes in seconds.`, ans: v * 60, unit: "s", how: `Multiply by 60: ${plain(v)} × 60 = ${plain(v * 60)} s.` };
    }
    const v = choose([220, 430, 55, 300], r);
    return { q: `Convert a stress of ${plain(v)} N mm⁻² (that is ${plain(v)} MPa) into N m⁻² (pascals).`, ans: v * 1e6, unit: "N m⁻²", how: `1 m = 1000 mm, so 1 m² = 10⁶ mm². A force spread over one square metre is spread over a million square millimetres, so N m⁻² is 10⁶ times larger than N mm⁻²: ${plain(v)} × 10⁶ = ${plain(v * 1e6)} N m⁻².` };
  }
  mount("w-units", (box) => {
    let seed = 7, Q = null, streak = 0, best = 0, tried = 0, right = 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const qEl = HE.el("p", { class: "sy-drill-q", "aria-live": "polite" });
    const inp = HE.el("input", { type: "text", inputmode: "decimal", class: "math-in", style: "width:11em", "aria-label": "Your answer, as an ordinary number", autocomplete: "off" });
    const unitEl = HE.el("span", { class: "readout" });
    const check = HE.el("button", { class: "btn small primary", type: "button" }, "Check");
    const next = HE.el("button", { class: "btn small", type: "button" }, "New question");
    const show = HE.el("button", { class: "btn small", type: "button" }, "Show how");
    const fb = HE.el("div", { class: "q-feedback", "aria-live": "polite" });
    const sc = HE.el("p", { class: "hint" });
    box.append(qEl, HE.el("div", { class: "btn-row" }, HE.el("label", null, "Answer ", inp), unitEl), HE.el("div", { class: "btn-row" }, check, show, next), fb, sc);
    let done = false;
    function upd() { sc.textContent = `Streak: ${streak} (best ${best}). Correct: ${right} of ${tried} tried.`; }
    function newQ() { Q = makeQ(rnd); qEl.textContent = Q.q; unitEl.textContent = Q.unit; inp.value = ""; fb.innerHTML = ""; done = false; upd(); }
    function doCheck() {
      if (done) return;
      const raw = inp.value.trim().replace(/\s+/g, "").replace(/×10\^?/, "e").replace("−", "-");
      const x = Number(raw);
      if (raw === "" || !isFinite(x)) { fb.innerHTML = "<span class='bad'>Type a number first</span>, for example 0.0047 or 4.7e-3."; return; }
      tried++; done = true;
      const ok = Math.abs(x - Q.ans) <= Math.abs(Q.ans) * 0.005;
      if (ok) { right++; streak++; best = Math.max(best, streak); fb.innerHTML = `<span class='ok'>Correct.</span> ${Q.how}`; }
      else { streak = 0; fb.innerHTML = `<span class='bad'>Not quite.</span> The answer is ${plain(Q.ans)} ${HE.esc(Q.unit)}. ${Q.how}`; }
      upd();
    }
    check.addEventListener("click", doCheck);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); done ? newQ() : doCheck(); } });
    next.addEventListener("click", () => { newQ(); inp.focus(); });
    show.addEventListener("click", () => { if (!done) { tried++; streak = 0; done = true; } fb.innerHTML = `The answer is ${plain(Q.ans)} ${HE.esc(Q.unit)}. ${Q.how}`; upd(); });
    newQ();
  });

  /* =====================================================================
     5b. The honest purser: rounding too early
     ===================================================================== */
  const PROBS = {
    winch: { name: "Winch drum", intro: "Drum diameter 0.35 m, 47 rev/min, rope force 5600 N, efficiency 0.82, running for 5.0 minutes. Find the electrical energy taken in.",
      steps: [
        ["Drum speed n (rev/s)", "n = 47 ÷ 60", () => 47 / 60],
        ["Rope speed v (m/s)", "v = πdn", (p, pi) => pi * 0.35 * p[0]],
        ["Output power (W)", "P = Fv", (p) => 5600 * p[1]],
        ["Input power (W)", "P_in = P_out ÷ η", (p) => p[2] / 0.82],
        ["Energy in 300 s (J)", "E = Pt", (p) => p[3] * 300]] },
    brake: { name: "Braking heat", intro: "A launch of mass 1800 kg covers 130 m in 37 s at steady speed, then brakes to rest. 60 % of its kinetic energy heats 5.0 kg of water in a brake cooler. Find the temperature rise.",
      steps: [
        ["Speed v (m/s)", "v = 130 ÷ 37", () => 130 / 37],
        ["Kinetic energy (J)", "E_k = ½mv²", (p) => 0.5 * 1800 * p[0] * p[0]],
        ["Heat to the water (J)", "E_h = 0.60 × E_k", (p) => 0.6 * p[1]],
        ["Temperature rise ΔT (K)", "ΔT = E_h ÷ cm", (p) => p[2] / (4180 * 5)]] },
    prop: { name: "Propeller tip", intro: "A propeller of diameter 2.40 m turns at 130 rev/min. A 0.80 kg parcel of water is thrown off at the tip speed. Find its kinetic energy.",
      steps: [
        ["Rotation n (rev/s)", "n = 130 ÷ 60", () => 130 / 60],
        ["Tip speed v (m/s)", "v = πdn", (p, pi) => pi * 2.4 * p[0]],
        ["Kinetic energy (J)", "E_k = ½mv²", (p) => 0.5 * 0.8 * p[1] * p[1]]] },
  };
  const roundSF = (x, sf) => (x === 0 || !isFinite(x) ? x : Number(x.toPrecision(sf)));
  mount("w-round", (box) => {
    let key = "winch", sf = 2, pi314 = true;
    const pBox = HE.el("div"), intro = HE.el("p", { class: "sim-note" });
    const ctl = controls(box);
    HE.slider(ctl, { label: "Significant figures kept at each step", min: 2, max: 6, step: 1, value: sf, oninput: (v) => { sf = v; show(); } });
    const cbWrap = HE.el("label", { class: "hint", style: "display:flex;align-items:center;gap:8px;margin:0" });
    const cb = HE.el("input", { type: "checkbox", checked: true });
    cb.addEventListener("change", () => { pi314 = cb.checked; show(); });
    cbWrap.append(cb, "Use π = 3.14 in the rounded column (unticked: the calculator π key)");
    const tw = HE.el("div", { class: "table-wrap" });
    const verdict = HE.el("div", { class: "q-feedback", "aria-live": "polite" });
    box.insertBefore(pBox, ctl); box.insertBefore(intro, ctl);
    box.append(cbWrap, tw, verdict);
    HE.choice(pBox, "Problem", Object.entries(PROBS).map(([k, v]) => [k, v.name]), key, (v) => { key = v; show(); });
    function show() {
      const Pb = PROBS[key]; intro.textContent = Pb.intro;
      const ex = [], rd = [];
      const last = Pb.steps.length - 1;
      Pb.steps.forEach((s, i) => { ex.push(s[2](ex, Math.PI)); const v = s[2](rd, pi314 ? 3.14 : Math.PI); rd.push(i < last ? roundSF(v, sf) : v); });
      const rows = Pb.steps.map((s, i) => `<tr><th scope="row">${HE.esc(s[0])}<br><span class="hint" style="margin:0">${HE.esc(s[1])}</span></th><td class="num">${HE.fmt(ex[i], 7)}</td><td class="num">${HE.fmt(rd[i], i < last ? sf : 7)}</td></tr>`).join("");
      tw.innerHTML = `<table class="sy-roundtab"><caption>Left: every calculator digit kept. Right: each value rounded to ${sf} significant figure${sf > 1 ? "s" : ""} before it is used again${pi314 ? ", with π = 3.14" : ""}.</caption><thead><tr><th>Step</th><th class="num">Exact</th><th class="num">Rounded steps</th></tr></thead><tbody>${rows}</tbody></table>`;
      const L = ex.length - 1, a = ex[L], b = rd[L], err = Math.abs(b - a) / Math.abs(a) * 100;
      const a3 = HE.fmt(a, 3), b3 = HE.fmt(b, 3), same = a3 === b3;
      verdict.innerHTML = `Final answer to 3 s.f.: <b>${a3}</b> (full precision) against <b>${b3}</b> (rounded steps). Difference: ${N(err, 2)} %. ` +
        (same ? "<span class='same'>Same to 3 s.f. this time</span>, but only by luck: try fewer figures or switch problem." : "<span class='diff'>Different. That could cost the accuracy mark.</span> Each early rounding added a small error and the later steps carried it along.");
    }
    show();
  });

  /* =====================================================================
     6a. Weigh the impacts
     ===================================================================== */
  const TECH = {
    wind: { name: "Offshore wind farm", s: [
      ["The nearby port wins a contract to build and service the turbines, bringing investment and work.", ["Economic", "Social"], "+", "Money flowing into a local economy is an economic effect (the jobs themselves also have a social side)."],
      ["Electricity is generated without burning fuel, so carbon dioxide emissions from the grid fall.", ["Environmental"], "+", "Reduced emissions are an environmental benefit."],
      ["Driving foundations into the sea bed and laying cables disturbs habitats, and piling noise can harm marine mammals.", ["Environmental"], "-", "Harm to wildlife and habitats is a negative environmental effect, even for a renewable project."],
      ["Some residents feel that the turbines spoil the view of the coast.", ["Social"], "-", "Effects on people's enjoyment of their surroundings are social."],
      ["The cost of building and connecting the farm is very high, and is paid back only over many years.", ["Economic"], "-", "A large up-front cost is a negative economic effect."]] },
    ev: { name: "Electric and autonomous vehicles", s: [
      ["No exhaust gases are released where the car is driven, so local air pollution falls.", ["Environmental"], "+", "Cleaner air where the vehicle runs is an environmental benefit (it also benefits health)."],
      ["Battery materials need mined metals and a lot of energy to make, and need specialist recycling.", ["Environmental"], "-", "Resource use and waste are negative environmental effects."],
      ["Taxi and lorry-driving jobs may disappear as vehicles drive themselves.", ["Social", "Economic"], "-", "Job losses affect people (social) and incomes (economic); either type is accepted."],
      ["Autonomous control can react faster than a tired driver, which could reduce crashes and injuries.", ["Social"], "+", "Fewer injuries and deaths is a social benefit."],
      ["Electricity usually costs less than fuel per mile, so owners save money on running costs.", ["Economic"], "+", "Lower running costs are an economic benefit."]] },
    auto: { name: "Robots and automation", s: [
      ["Robots take over heavy, repetitive and dangerous tasks, reducing injuries to workers.", ["Social"], "+", "Worker health and safety is a social benefit."],
      ["The factory needs fewer people on the production line, so some workers lose their jobs.", ["Social", "Economic"], "-", "Job loss affects people (social) and household incomes (economic); either type is accepted."],
      ["Machines make products of consistent quality and waste less material, cutting the cost per item.", ["Economic"], "+", "Lower cost per item is an economic benefit."],
      ["Robots use electricity continuously, so the factory's energy demand may rise.", ["Environmental"], "-", "Higher energy use is a negative environmental effect, unless the electricity is renewable."],
      ["New skilled jobs appear in programming, maintaining and designing the robots.", ["Social", "Economic"], "+", "New skilled employment is both a social and an economic benefit."]] },
    print: { name: "3D printing", s: [
      ["Parts are built layer by layer, so far less material is cut away and wasted than when machining from a block.", ["Environmental"], "+", "Less waste is an environmental benefit."],
      ["Spare parts can be printed locally on demand, cutting shipping and stock-holding costs.", ["Economic", "Environmental"], "+", "Lower cost is economic; fewer transport miles is environmental. Either is accepted."],
      ["Many printing plastics are difficult to recycle, so failed prints and used parts may become waste.", ["Environmental"], "-", "Waste at the end of life is a negative environmental effect."],
      ["Printing large quantities is slow, so for mass production it can cost more per item than moulding.", ["Economic"], "-", "Higher cost per item is a negative economic effect."],
      ["A community workshop can print low-cost prosthetic hands, improving quality of life for users.", ["Social"], "+", "Improving people's lives is a social benefit."]] },
  };
  mount("w-weigh", (box) => {
    let key = "wind";
    const pBox = HE.el("div"), list = HE.el("div"), sum = HE.el("p", { class: "sim-note", "aria-live": "polite" });
    const check = HE.el("button", { class: "btn small primary", type: "button" }, "Check");
    const rst = HE.el("button", { class: "btn small", type: "button" }, "↺ Clear");
    box.append(pBox, list, HE.el("div", { class: "btn-row" }, check, rst), sum);
    HE.choice(pBox, "Technology", Object.entries(TECH).map(([k, v]) => [k, v.name]), key, (v) => { key = v; build(); });
    let cards = [];
    function sel(label, opts) {
      const s = HE.el("select", { "aria-label": label }, HE.el("option", { value: "" }, "choose…"), ...opts.map((o) => HE.el("option", { value: o[0] }, o[1])));
      return HE.el("label", null, label, s);
    }
    function build() {
      list.innerHTML = ""; cards = []; sum.textContent = "";
      TECH[key].s.forEach(([text, types, eff, why], i) => {
        const t = sel("Type of impact", [["Social", "Social"], ["Economic", "Economic"], ["Environmental", "Environmental"]]);
        const e = sel("Effect", [["+", "Positive"], ["-", "Negative"]]);
        const fb = HE.el("div", { class: "why", "aria-live": "polite" });
        const card = HE.el("div", { class: "sy-stmt" }, HE.el("div", null, `${i + 1}. ${text}`), HE.el("div", { class: "sy-stmt-row" }, t, e), fb);
        list.append(card); cards.push({ card, t: t.querySelector("select"), e: e.querySelector("select"), fb, types, eff, why });
      });
    }
    check.addEventListener("click", () => {
      let ok = 0, unanswered = 0;
      cards.forEach((c) => {
        if (!c.t.value || !c.e.value) { unanswered++; return; }
        const good = c.types.includes(c.t.value) && c.e.value === c.eff;
        if (good) ok++;
        c.card.classList.toggle("right", good); c.card.classList.toggle("wrong", !good);
        c.fb.innerHTML = (good ? "<span class='ok'>✔ Right.</span> " : `<span class='bad'>✘ Not quite: ${c.types.join(" or ").toLowerCase()}, ${c.eff === "+" ? "positive" : "negative"}.</span> `) + HE.esc(c.why);
      });
      sum.textContent = unanswered ? `${unanswered} statement${unanswered > 1 ? "s" : ""} still to classify. ${ok} right so far.` : `${ok} of ${cards.length} right. A full-mark answer would cover at least one positive and one negative, and name the type of each.`;
    });
    rst.addEventListener("click", build);
    build();
  });

  /* =====================================================================
     6b. Model-answer builder: point, explanation, consequence
     ===================================================================== */
  const PEC = {
    wind: { name: "Offshore wind and tidal power",
      "+": ["Environmental (positive)", "Offshore wind and tidal turbines generate electricity without burning fuel.", "The electricity they supply to the grid replaces electricity that would have come from gas-fired power stations, which release carbon dioxide.", "This lowers the carbon emissions of the national grid and helps to slow climate change.", "Name the type of impact first, then link it to something that really happens."],
      "-": ["Environmental (negative)", "Building offshore turbines harms the sea bed and marine life.", "Driving foundations into the sea bed and laying cables disturbs habitats, and the underwater noise of construction can harm marine mammals and fish.", "Wildlife may leave the area, so construction must be timed and monitored carefully, which adds cost and delay.", "Say what is harmed and how, not just 'it is bad for animals'."] },
    ev: { name: "Electric and autonomous vehicles",
      "+": ["Social (positive)", "Electric vehicles improve the quality of life in towns and cities.", "They produce no exhaust gases and run much more quietly than petrol or diesel engines, so air pollution and noise fall where people live.", "Residents breathe cleaner air and suffer fewer breathing problems, and streets become more pleasant.", "A positive social effect needs a group of people who benefit."],
      "-": ["Environmental (negative)", "Electric vehicles have an environmental cost in the making of their batteries.", "Batteries need metals that must be mined and processed using a great deal of energy, and they are difficult to recycle at the end of their life.", "Part of the benefit of zero exhaust emissions is therefore cancelled by the impact on land, resources and waste, unless the batteries are recycled.", "Life-cycle thinking: the harm often happens before and after the use phase."] },
    h2: { name: "Hydrogen as a fuel",
      "+": ["Environmental (positive)", "Hydrogen used in a fuel cell produces no carbon dioxide where it is used.", "The fuel cell combines hydrogen with oxygen to produce electricity and water, so there are no exhaust pollutants at the point of use.", "If the hydrogen is made using renewable electricity, transport or industry using it can cut carbon emissions and improve local air quality.", "Include the condition: the benefit depends on how the hydrogen was made."],
      "-": ["Economic (negative)", "Hydrogen is expensive to produce, store and distribute.", "Making it from water takes a large amount of electricity, and storing it needs high-pressure tanks and special equipment because the gas is so light.", "The high costs may be passed on to customers, and a whole new network of filling stations would need heavy investment before the fuel is widely available.", "Link the cost to a reason, then say who pays."] },
    robot: { name: "Robotics and automation",
      "+": ["Social (positive)", "Robots make workplaces safer.", "They take over heavy, repetitive and dangerous tasks, such as lifting and welding, which are a common cause of injuries.", "Fewer workers are hurt, and people can move to safer, more skilled jobs such as programming and maintenance.", "Give an example task so that 'safer' is not an empty word."],
      "-": ["Social and economic (negative)", "Automation can reduce the number of jobs.", "Machines can do routine assembly or packing work without wages or breaks, so employers may need fewer production-line workers.", "Some workers lose their income and must retrain, and communities that depend on one factory may be badly hit.", "State who is affected, and how."] },
    print: { name: "3D printing (additive manufacturing)",
      "+": ["Economic (positive)", "3D printing reduces the cost of making small numbers of parts.", "Parts are built directly from a digital file, layer by layer, so no expensive tooling or moulds are needed, and spare parts can be printed on demand near where they are needed.", "Small companies can make prototypes quickly and cheaply, and fewer parts need to be stored or shipped, cutting costs and waste.", "Compare with the traditional method to make the benefit clear."],
      "-": ["Environmental (negative)", "3D printing can create plastic waste.", "Many printing materials are plastics that are difficult to recycle, and failed prints or support structures are often thrown away.", "More waste goes to landfill or is burned, unless the printing material is chosen to be recyclable and prints are planned to avoid failures.", "Say what happens to the material at the end of its life."] },
    batt: { name: "Battery storage",
      "+": ["Environmental and economic (positive)", "Battery storage lets more renewable electricity be used.", "Wind and solar farms sometimes generate more than the grid needs. Batteries store the surplus and release it when demand is high or the wind is calm.", "Less renewable energy is wasted and less fossil-fuelled back-up is needed, which cuts emissions and can lower costs for the network.", "A strong answer says why storage is needed (variable supply) before saying what it achieves."],
      "-": ["Environmental (negative)", "Battery storage needs materials that are mined and later become waste.", "Large batteries need metals such as lithium and cobalt, whose mining uses energy and can damage land and water, and the batteries wear out and have to be disposed of or recycled.", "Without effective recycling, the environmental benefit of storing renewable energy is reduced by resource use and waste.", "Mention the whole life cycle, not just the use phase."] },
  };
  mount("w-answer", (box) => {
    let key = "wind", eff = "+";
    const tBox = HE.el("div"), eBox = HE.el("div");
    const out = HE.el("div", { class: "sy-ans sy-pec", "aria-live": "polite" });
    box.append(tBox, eBox, out);
    function show() {
      const d = PEC[key][eff];
      out.innerHTML = `<p style="margin:0"><strong>${HE.esc(PEC[key].name)}: ${HE.esc(d[0])}</strong></p>` +
        `<p><span class="sy-p"><b>Point.</b> ${HE.esc(d[1])}</span> <span class="sy-e"><b>Explanation.</b> ${HE.esc(d[2])}</span> <span class="sy-q"><b>Consequence.</b> ${HE.esc(d[3])}</span></p>` +
        `<p class="sy-weak"><strong>Tip:</strong> ${HE.esc(d[4])} For a "discuss" question, write one positive and one negative of this kind and finish with a judgement.</p>`;
    }
    HE.choice(tBox, "Technology", Object.entries(PEC).map(([k, v]) => [k, v.name]), key, (v) => { key = v; show(); });
    HE.choice(eBox, "Impact", [["+", "Positive"], ["-", "Negative"]], eff, (v) => { eff = v; show(); });
    show();
  });
})();
