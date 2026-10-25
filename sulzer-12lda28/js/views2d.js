// 2D canvas views: single-cylinder cutaway, valve-timing wheel, firing timeline, charts.
import { GEOM, TIMING, VARIANTS, LOCO, IDLE_RPM, engineBhp, torqueNm, bmepBar, teAtFullPower } from "./data.js";
import {
  cycleAngle, strokeOf, STROKE_NAME, exhaustLift, intakeLift, injecting, pistonDown, fireAngle,
  cylinderPressureBar, FIRING, BANK_OFFSET,
} from "./sim.js";

export const COL = {
  power: "#ff6b3d", exhaust: "#9aa0a6", intake: "#4aa8ff", compression: "#f2c14e",
  ink: "#e6edf3", dim: "#8b98a5", line: "#2b3542", bg: "#0f141b", panel: "#151b24", accent: "#e8b84a",
  good: "#46c28a",
};
const STROKE_COL = [COL.power, COL.exhaust, COL.intake, COL.compression];

export function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w, h };
}
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
function txt(ctx, s, x, y, o = {}) { ctx.fillStyle = o.c || COL.ink; ctx.font = o.f || "12px system-ui, sans-serif"; ctx.textAlign = o.a || "left"; ctx.textBaseline = o.b || "alphabetic"; ctx.fillText(s, x, y); }

// ---- single cylinder cutaway + p-theta ---------------------------------------
export function drawCylinder(canvas, eng, sel) {
  const { ctx, w, h } = fit(canvas); ctx.clearRect(0, 0, w, h);
  const b = sel.bank, c = sel.cyl, th = eng.theta, alpha = cycleAngle(th, b, c), s = strokeOf(alpha);
  const split = Math.min(w * 0.46, 380);
  // layout for cylinder (left)
  const cx = split * 0.5, topY = 44, scale = Math.min((h - 70) / 62, split / 40);
  const stroke = GEOM.stroke, r = stroke / 2, l = GEOM.rod, bore = GEOM.bore;
  const mm = (v) => v * scale / 10; // 10 mm per unit step for display
  const k = scale / 12; // px per 12 mm... use direct: 1mm = scale/ (something)
  const px = (v) => v * (h - 90) / 1080; // 1080 mm vertical extent shown
  const crankY = topY + px(stroke + l + 330) + 6; // y of crank axis
  const phi = ((th - fireAngle(b, c)) * Math.PI) / 180;
  const down = pistonDown(th - fireAngle(b, c));
  const pinY = crankY - px(r + l - down);
  const crownY = pinY - px(200 * 1.0);
  const headY = crankY - px(r + l + 200 + 30);
  const bw = px(bore) * 1.0;
  // liner and block
  ctx.fillStyle = "#1b2430"; ctx.fillRect(cx - bw / 2 - 16, headY, 16, crankY - headY - px(r + 40));
  ctx.fillRect(cx + bw / 2, headY, 16, crankY - headY - px(r + 40));
  ctx.fillStyle = "#223244"; ctx.fillRect(cx - bw / 2 - 16, headY, 4, crankY - headY - px(r + 40)); ctx.fillRect(cx + bw / 2 + 12, headY, 4, crankY - headY - px(r + 40));
  // gas
  const run = eng.running || eng.rpm > 20;
  const lerp = (a, b2, t) => a + (b2 - a) * t;
  let gcol = "rgba(74,168,255,0.35)";
  if (!run) gcol = "rgba(90,130,180,0.25)";
  else if (s === 2) gcol = "rgba(74,168,255,0.42)";
  else if (s === 3) { const t = (alpha - 540) / 180; gcol = `rgba(${Math.round(lerp(120, 255, t))},${Math.round(lerp(190, 190, t))},${Math.round(lerp(255, 80, t))},${lerp(0.4, 0.7, t)})`; }
  else if (s === 0) { const t = Math.max(0, 1 - alpha / 180); gcol = `rgba(255,${Math.round(90 + 130 * t * t)},${Math.round(30 + 60 * t)},${0.3 + 0.65 * t * (0.3 + 0.7 * eng.load)})`; }
  else gcol = `rgba(160,150,140,${0.5 - 0.25 * (alpha - 180) / 180})`;
  ctx.fillStyle = gcol; ctx.fillRect(cx - bw / 2, headY, bw, Math.max(2, crownY - headY));
  // head
  ctx.fillStyle = "#5c6d7a"; ctx.fillRect(cx - bw / 2 - 16, headY - 46, bw + 32, 46);
  // valves
  const lIn = intakeLift(alpha), lEx = exhaustLift(alpha), vx = bw * 0.28, lift = px(55);
  const valve = (x, lf, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, headY - 60 + lf * lift); ctx.lineTo(x, headY + lf * lift); ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(x - px(55), headY - 2 + lf * lift, px(110), 5);
  };
  valve(cx - vx, lIn, COL.intake); valve(cx + vx, lEx, "#e08a3c");
  // ports and flow
  ctx.fillStyle = "rgba(74,168,255," + (lIn > 0.02 ? 0.5 : 0.12) + ")"; ctx.fillRect(cx - vx - 12, headY - 46, 24, 16);
  ctx.fillStyle = "rgba(224,138,60," + (lEx > 0.02 ? 0.55 : 0.12) + ")"; ctx.fillRect(cx + vx - 12, headY - 46, 24, 16);
  if (lIn > 0.05) arrow(ctx, cx - vx, headY - 70, cx - vx, headY + 6, COL.intake);
  if (lEx > 0.05) arrow(ctx, cx + vx, headY + 6, cx + vx, headY - 70, "#e08a3c");
  // injector + spray
  ctx.fillStyle = "#e2c15a"; ctx.fillRect(cx - 3, headY - 52, 6, 52);
  if (eng.running && injecting(alpha)) { ctx.fillStyle = "rgba(255,226,140,0.85)"; ctx.beginPath(); ctx.moveTo(cx - 3, headY); ctx.lineTo(cx + 3, headY); ctx.lineTo(cx + bw * 0.28, headY + px(190)); ctx.lineTo(cx - bw * 0.28, headY + px(190)); ctx.fill(); }
  // piston
  ctx.fillStyle = "#cfd5da"; ctx.fillRect(cx - bw / 2 + 2, crownY, bw - 4, px(200 + 160));
  ctx.fillStyle = "#20242a"; for (let i = 0; i < 3; i++) ctx.fillRect(cx - bw / 2 + 2, crownY + 8 + i * 9, bw - 4, 3);
  ctx.beginPath(); ctx.arc(cx, pinY, px(55), 0, 6.3); ctx.fillStyle = "#555d65"; ctx.fill();
  // crank circle and rod
  const cpx = cx + px(r) * Math.sin(phi), cpy = crankY - px(r) * Math.cos(phi);
  ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, crankY, px(r), 0, 6.3); ctx.stroke();
  ctx.strokeStyle = "#a6b0b8"; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(cx, pinY); ctx.lineTo(cpx, cpy); ctx.stroke();
  ctx.strokeStyle = "#8c9198"; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(cx, crankY); ctx.lineTo(cpx, cpy); ctx.stroke();
  ctx.fillStyle = "#d9b24a"; ctx.beginPath(); ctx.arc(cpx, cpy, 8, 0, 6.3); ctx.fill();
  ctx.fillStyle = "#c0c6cc"; ctx.beginPath(); ctx.arc(cx, crankY, 11, 0, 6.3); ctx.fill();
  // title
  txt(ctx, w < 520 ? `${b ? "B" : "A"}${c}` : `Bank ${b ? "B" : "A"} · cylinder ${c}`, 12, 20, { f: "600 13px system-ui" });
  txt(ctx, `${STROKE_NAME[s]} stroke`, 12, 38, { c: STROKE_COL[s], f: "700 15px system-ui" });
  txt(ctx, `${alpha.toFixed(0)}° / 720°`, split - 8, w < 520 ? 56 : 20, { a: "right", f: "13px ui-monospace, monospace", c: COL.dim });
  // right-hand: p-theta chart
  const px0 = split + 24, pw = w - px0 - 14, ph = h - 70, py0 = 28;
  ctx.fillStyle = COL.panel; rr(ctx, px0 - 10, py0 - 18, pw + 18, ph + 56, 8); ctx.fill();
  txt(ctx, w < 520 ? "Pressure vs cycle (ESTIMATED)" : "Cylinder pressure over the 720° cycle (ESTIMATED shape and values)", px0, py0 - 4, { c: COL.dim, f: "11px system-ui" });
  const load = eng.running ? eng.load : 0.0, boost = Math.max(1.0, eng.boost || 1);
  const pmax = 130;
  const X = (a) => px0 + (a / 720) * pw, Y = (p) => py0 + ph - (p / pmax) * ph;
  ctx.strokeStyle = COL.line; ctx.lineWidth = 1;
  for (let p = 0; p <= 100; p += 25) { ctx.beginPath(); ctx.moveTo(px0, Y(p)); ctx.lineTo(px0 + pw, Y(p)); ctx.stroke(); txt(ctx, p + "", px0 - 3, Y(p) + 3, { a: "right", c: COL.dim, f: "10px system-ui" }); }
  [0, 180, 360, 540, 720].forEach((a) => { ctx.beginPath(); ctx.moveTo(X(a), py0); ctx.lineTo(X(a), py0 + ph); ctx.stroke(); txt(ctx, a + "°", X(a), py0 + ph + 14, { a: "middle" === "x" ? "center" : "center", c: COL.dim, f: "10px system-ui" }); });
  [[0, "Power"], [180, "Exhaust"], [360, "Intake"], [540, w < 520 ? "Compr." : "Compression"]].forEach(([a, n], i) => { ctx.fillStyle = STROKE_COL[i] + "22"; ctx.fillRect(X(a), py0, pw / 4, ph); txt(ctx, n, X(a) + pw / 8, py0 + ph + 30, { a: "center", c: STROKE_COL[i], f: "11px system-ui" }); });
  ctx.strokeStyle = COL.accent; ctx.lineWidth = 2; ctx.beginPath();
  for (let a = 0; a <= 720; a += 2) { const p = cylinderPressureBar(a % 720, Math.max(0.05, load), boost * 1.0 + (eng.running ? 0 : 0)); a ? ctx.lineTo(X(a), Y(Math.min(pmax, p))) : ctx.moveTo(X(a), Y(Math.min(pmax, p))); }
  ctx.stroke();
  const pn = cylinderPressureBar(alpha, Math.max(0.05, load), boost);
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(alpha), Y(Math.min(pmax, pn)), 5, 0, 6.3); ctx.fill();
  txt(ctx, pn.toFixed(0) + " bar", X(alpha) + (alpha > 600 ? -8 : 8), Y(Math.min(pmax, pn)) - 8, { a: alpha > 600 ? "right" : "left", f: "12px ui-monospace, monospace" });
  // valve lift traces
  ctx.lineWidth = 1.5;
  for (const [fn, col] of [[intakeLift, COL.intake], [exhaustLift, "#e08a3c"]]) {
    ctx.strokeStyle = col; ctx.beginPath(); for (let a = 0; a <= 720; a += 3) { const y = py0 + ph - fn(a) * 30; a ? ctx.lineTo(X(a), y) : ctx.moveTo(X(a), y); } ctx.stroke();
  }
  txt(ctx, "inlet lift", X(TIMING.inOpen + 150), py0 + ph - 34, { c: COL.intake, f: "10px system-ui", a: "center" });
  txt(ctx, "exhaust lift", X(TIMING.exhOpen + 140), py0 + ph - 46, { c: "#e08a3c", f: "10px system-ui", a: "center" });
}
function arrow(ctx, x1, y1, x2, y2, col) {
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1); ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 8 * Math.cos(a - 0.5), y2 - 8 * Math.sin(a - 0.5)); ctx.lineTo(x2 - 8 * Math.cos(a + 0.5), y2 - 8 * Math.sin(a + 0.5)); ctx.fill();
}

// ---- valve timing wheel --------------------------------------------------------
export function drawWheel(canvas, eng, sel) {
  const { ctx, w, h } = fit(canvas); ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 38;
  const A = (deg) => ((deg - 90) * Math.PI) / 180; // 0 deg at top, clockwise
  const arc = (r0, r1, a0, a1, col) => { ctx.beginPath(); ctx.arc(cx, cy, r1, A(a0), A(a1), false); ctx.arc(cx, cy, r0, A(a1), A(a0), true); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
  // map 720 cycle degrees onto the circle (1 revolution = 720 deg of crank = 2 turns -> show 720 as full circle)
  const f = (a) => a / 2; // circle degrees
  // stroke ring
  [[0, 180], [180, 360], [360, 540], [540, 720]].forEach(([a0, a1], i) => arc(R - 20, R, f(a0), f(a1), STROKE_COL[i] + "88"));
  txt(ctx, "POWER", cx + R * 0.55, cy - R * 0.62, { c: COL.power, f: "700 11px system-ui", a: "center" });
  txt(ctx, "EXHAUST", cx + R * 0.55, cy + R * 0.78, { c: COL.exhaust, f: "700 11px system-ui", a: "center" });
  txt(ctx, "INTAKE", cx - R * 0.58, cy + R * 0.78, { c: COL.intake, f: "700 11px system-ui", a: "center" });
  txt(ctx, "COMPRESSION", cx - R * 0.6, cy - R * 0.62, { c: COL.compression, f: "700 11px system-ui", a: "center" });
  // valve rings
  arc(R - 44, R - 26, f(TIMING.exhOpen), f(TIMING.exhClose), "#e08a3c");
  arc(R - 66, R - 48, f(TIMING.inOpen), f(TIMING.inClose), COL.intake);
  arc(R - 88, R - 70, f(TIMING.injStart), f(TIMING.injStart + TIMING.injDur), "#ffe08a");
  const ticks = [[0, "TDC"], [90, "90"], [180, "BDC"], [270, "270"]];
  ctx.strokeStyle = COL.line; for (let a = 0; a < 720; a += 30) { ctx.beginPath(); ctx.moveTo(cx + (R + 2) * Math.cos(A(f(a))), cy + (R + 2) * Math.sin(A(f(a)))); ctx.lineTo(cx + (R + 8) * Math.cos(A(f(a))), cy + (R + 8) * Math.sin(A(f(a)))); ctx.stroke(); }
  [0, 180, 360, 540].forEach((a) => txt(ctx, a + "°", cx + (R + 22) * Math.cos(A(f(a))), cy + (R + 22) * Math.sin(A(f(a))) + 4, { a: "center", c: COL.dim, f: "11px system-ui" }));
  txt(ctx, "exhaust valve open", cx, cy - 30, { a: "center", c: "#e08a3c", f: "11px system-ui" });
  txt(ctx, `${TIMING.exhOpen}° to ${TIMING.exhClose}°`, cx, cy - 16, { a: "center", c: COL.dim, f: "10px system-ui" });
  txt(ctx, "inlet valve open", cx, cy + 20, { a: "center", c: COL.intake, f: "11px system-ui" });
  txt(ctx, `${TIMING.inOpen}° to ${TIMING.inClose}°`, cx, cy + 34, { a: "center", c: COL.dim, f: "10px system-ui" });
  txt(ctx, "injection (inner)", cx, cy + 54, { a: "center", c: "#ffe08a", f: "11px system-ui" });
  const alpha = cycleAngle(eng.theta, sel.bank, sel.cyl);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.cos(A(f(alpha))), cy + R * Math.sin(A(f(alpha)))); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 6.3); ctx.fill();
  txt(ctx, "ESTIMATED valve timing", cx, h - 2, { a: "center", c: COL.accent, f: "10px system-ui" });
}

// ---- 12-cylinder firing timeline ------------------------------------------------
export function drawTimeline(canvas, eng) {
  const { ctx, w, h } = fit(canvas); ctx.clearRect(0, 0, w, h);
  const left = 58, top = 24, right = 12, bot = 26, rows = 12;
  const rh = (h - top - bot) / rows, pw = w - left - right;
  const th720 = ((eng.theta % 720) + 720) % 720;
  const order = []; for (let i = 0; i < 6; i++) for (let b = 0; b < 2; b++) order.push([b, FIRING[i]]);
  order.sort((a, b) => fireAngle(a[0], a[1]) - fireAngle(b[0], b[1]));
  // rows sorted by firing sequence so the staircase of power strokes is visible
  order.forEach(([b, c], r) => {
    const y = top + r * rh;
    const fa = fireAngle(b, c);
    // draw four strokes starting at engine datum 0 (theta) - cylinder alpha = theta - fa
    for (let s = 0; s < 4; s++) {
      const a0 = (fa + s * 180) % 720, a1 = a0 + 180;
      ctx.fillStyle = STROKE_COL[s] + (s === 0 ? "dd" : "66");
      const x0 = left + (a0 / 720) * pw, x1 = left + (Math.min(a1, 720) / 720) * pw;
      ctx.fillRect(x0, y + 2, x1 - x0, rh - 4);
      if (a1 > 720) ctx.fillRect(left, y + 2, ((a1 - 720) / 720) * pw, rh - 4);
    }
    txt(ctx, `${b ? "B" : "A"}${c}`, left - 8, y + rh * 0.68, { a: "right", f: "600 11px ui-monospace, monospace", c: b ? "#7ec8ff" : "#ffb98a" });
    txt(ctx, `${(r + 1)}`, 8, y + rh * 0.68, { c: COL.dim, f: "10px system-ui" });
  });
  ctx.strokeStyle = COL.line; for (let a = 0; a <= 720; a += 60) { const x = left + (a / 720) * pw; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + rows * rh); ctx.stroke(); if (w >= 520 || a % 120 === 0) txt(ctx, a + "°", x, top + rows * rh + 14, { a: "center", c: COL.dim, f: "10px system-ui" }); }
    txt(ctx, w < 520 ? "720° cycle; even 60° spacing assumed" : "one cycle = 720° of crank rotation (two revolutions); on average one cylinder fires every 60° (even spacing assumed)", left, 14, { c: COL.dim, f: "11px system-ui" });
  const x = left + (th720 / 720) * pw; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, top - 4); ctx.lineTo(x, top + rows * rh + 2); ctx.stroke();
}

// ---- charts -------------------------------------------------------------------------
function axes(ctx, x0, y0, pw, ph, xmin, xmax, ymin, ymax, xt, yt, xl, yl) {
  ctx.strokeStyle = COL.line; ctx.lineWidth = 1; ctx.font = "10px system-ui";
  for (const v of yt) { const y = y0 + ph - ((v - ymin) / (ymax - ymin)) * ph; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + pw, y); ctx.stroke(); txt(ctx, v.toLocaleString(), x0 - 5, y + 3, { a: "right", c: COL.dim, f: "10px system-ui" }); }
  for (const v of xt) { const x = x0 + ((v - xmin) / (xmax - xmin)) * pw; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + ph); ctx.stroke(); txt(ctx, v + "", x, y0 + ph + 14, { a: "center", c: COL.dim, f: "10px system-ui" }); }
  txt(ctx, xl, x0 + pw / 2, y0 + ph + 30, { a: "center", c: COL.dim, f: "11px system-ui" });
  ctx.save(); ctx.translate(x0 - 44, y0 + ph / 2); ctx.rotate(-Math.PI / 2); txt(ctx, yl, 0, 0, { a: "center", c: COL.dim, f: "11px system-ui" }); ctx.restore();
}

export function drawPowerChart(canvas, eng, variant) {
  const { ctx, w, h } = fit(canvas); ctx.clearRect(0, 0, w, h);
  const x0 = 62, y0 = 14, pw = w - x0 - 62, ph = h - 56;
  const xmin = 300, xmax = 820, ymax = 3000;
  axes(ctx, x0, y0, pw, ph, xmin, xmax, 0, ymax, [350, 450, 550, 650, 750], [0, 500, 1000, 1500, 2000, 2500, 3000], "engine speed (rpm)", "brake horsepower");
  const X = (r) => x0 + ((r - xmin) / (xmax - xmin)) * pw, Y = (p) => y0 + ph - (p / ymax) * ph;
  const cols = { A: "#8b98a5", B: "#4aa8ff", C: "#ff6b3d", Cd: "#e8b84a" };
  for (const id of ["A", "B", "C", "Cd"]) {
    const v = VARIANTS[id]; ctx.strokeStyle = cols[id]; ctx.lineWidth = id === variant ? 3.2 : 1.4; ctx.globalAlpha = id === variant ? 1 : 0.6;
    ctx.beginPath(); for (let r = IDLE_RPM; r <= v.rpm; r += 5) { const y = Y(engineBhp(r, id)); r === IDLE_RPM ? ctx.moveTo(X(r), y) : ctx.lineTo(X(r), y); } ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = cols[id]; ctx.beginPath(); ctx.arc(X(v.rpm), Y(v.bhp), 4, 0, 6.3); ctx.fill();
    txt(ctx, v.name.replace("12LDA28-", "") + ` ${v.bhp}`, X(v.rpm) + 7, Y(v.bhp) + 4 + ({ A: 13, B: 2, C: -6, Cd: 1 }[id] || 0), { c: cols[id], f: "11px system-ui" });
  }
  // torque (right axis), for selected variant
  const tmax = 40000; const T = (t) => y0 + ph - (t / tmax) * ph;
  ctx.setLineDash([5, 4]); ctx.strokeStyle = "#46c28a"; ctx.lineWidth = 2; ctx.beginPath();
  for (let r = IDLE_RPM; r <= VARIANTS[variant].rpm; r += 5) { const t = torqueNm(r, engineBhp(r, variant)); r === IDLE_RPM ? ctx.moveTo(X(r), T(t)) : ctx.lineTo(X(r), T(t)); } ctx.stroke(); ctx.setLineDash([]);
  [0, 10, 20, 30, 40].forEach((k) => txt(ctx, k + " kNm", x0 + pw + 6, T(k * 1000) + 3, { c: "#46c28a", f: "10px system-ui" }));
  // live marker
  if (eng.rpm > 5) {
    const bhp = eng.running ? eng.bhp : 0, x = X(Math.min(xmax, Math.max(xmin, eng.rpm)));
    ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + ph); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, Y(bhp), 5, 0, 6.3); ctx.fill();
    txt(ctx, `${Math.round(eng.rpm)} rpm · ${Math.round(bhp)} bhp`, x0 + 8, y0 + 30, { f: "12px ui-monospace, monospace" });
  }
  txt(ctx, "ESTIMATED shape between idle and rated: P ∝ n^1.6", x0 + 8, y0 + 12, { c: COL.accent, f: "10px system-ui" });
}

export function drawTeChart(canvas, loco) {
  const { ctx, w, h } = fit(canvas); ctx.clearRect(0, 0, w, h);
  const x0 = 62, y0 = 14, pw = w - x0 - 22, ph = h - 56;
  const xmax = 100, ymax = 70000;
  axes(ctx, x0, y0, pw, ph, 0, xmax, 0, ymax, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], [0, 10000, 20000, 30000, 40000, 50000, 60000], "speed (mph)", "tractive effort (lbf)");
  const X = (v) => x0 + (v / xmax) * pw, Y = (t) => y0 + ph - (t / ymax) * ph;
  const rail = LOCO.railFraction * 2580;
  ctx.strokeStyle = "#ff6b3d"; ctx.lineWidth = 3; ctx.beginPath();
  for (let v = 0; v <= 95; v += 1) { const t = teAtFullPower(v, rail); v ? ctx.lineTo(X(v), Y(t)) : ctx.moveTo(X(v), Y(t)); } ctx.stroke();
  // scaled by controller
  if (loco.frac < 0.99) {
    ctx.strokeStyle = "#e8b84a"; ctx.lineWidth = 2; ctx.beginPath();
    for (let v = 0; v <= 95; v += 1) { const t = Math.min(LOCO.maxTeLbf, teAtFullPower(v, rail * loco.frac)); v ? ctx.lineTo(X(v), Y(t)) : ctx.moveTo(X(v), Y(t)); } ctx.stroke();
  }
  // drawbar resistance (Davis-type estimate)
  ctx.strokeStyle = "#8b98a5"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let v = 0; v <= 95; v += 1) { const r = resistanceLbf(v, loco.trainT); v ? ctx.lineTo(X(v), Y(r)) : ctx.moveTo(X(v), Y(r)); } ctx.stroke(); ctx.setLineDash([]);
  // sourced points
  ctx.fillStyle = COL.good; [[0, 62000], [10.5, 62000], [26, 30000]].forEach(([v, t]) => { ctx.beginPath(); ctx.arc(X(v), Y(t), 5, 0, 6.3); ctx.fill(); });
  txt(ctx, w < 520 ? "62,000 lbf to 10.5 mph" : "62,000 lbf to 10.5 mph (manual); model plateau runs to ~12 mph", X(11) + 6, Y(62000) - 6, { c: COL.good, f: "11px system-ui" });
  txt(ctx, w < 520 ? "30,000 lbf at 26 mph" : "30,000 lbf continuous at 26 mph", X(26) + 8, Y(30000) - 8, { c: COL.good, f: "11px system-ui" });
  txt(ctx, w < 520 ? "resistance (E)" : "train resistance (ESTIMATE)", X(96), Y(resistanceLbf(70, loco.trainT)) + 20, { c: COL.dim, a: "right", f: "11px system-ui" });
  txt(ctx, w < 520 ? "● BR manual (sourced); rail ≈ 78.5% (E)" : "● BR manual B.R.33003/262 (sourced)   — rail power ≈ 78.5% of engine (ESTIMATE)", x0 + pw, y0 + 12, { c: COL.dim, a: "right", f: "10px system-ui" });
  // live
  const x = X(Math.min(98, loco.mph)); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, Y(Math.min(ymax, loco.te)), 6, 0, 6.3); ctx.fill();
  txt(ctx, `${loco.mph.toFixed(0)} mph · ${Math.round(loco.te).toLocaleString()} lbf`, x0 + pw, y0 + ph * 0.45, { a: "right", f: "12px ui-monospace, monospace" });
}
export function resistanceLbf(mph, trainT = 400) {
  const w = LOCO.weightT + trainT; // tonnes
  // Davis-style: A + B v + C v^2 (lbf per ton), rough BR coaching figures
  const per = 4 + 0.05 * mph + 0.0011 * mph * mph; return per * w * 1.1;
}

export function drawChain(canvas) {
  const { ctx, w, h } = fit(canvas); ctx.clearRect(0, 0, w, h);
  const st = [
    ["Fuel burned", 100, "#c9a227", "heat in fuel = 100%"],
    ["Engine shaft", 40, "#ff6b3d", "~40% brake thermal efficiency (E)"],
    ["Main generator input", 37.2, "#e8b84a", "after ~95 bhp auxiliaries (E)"],
    ["Generator output", 35.0, "#46c28a", "~94% (E)"],
    ["Traction-motor shafts", 31.9, "#4aa8ff", "~91% (E)"],
    ["Rail (drawbar)", 31.4, "#9aa6ff", "~98% gears; ~2,025 hp (E)"],
  ];
  const x0 = 150, pw = w - x0 - 16, rh = (h - 12) / st.length;
  st.forEach(([n, v, c, note], i) => {
    const y = 6 + i * rh;
    txt(ctx, n, x0 - 8, y + rh * 0.55, { a: "right", f: "12px system-ui", c: COL.ink });
    ctx.fillStyle = c + "cc"; rr(ctx, x0, y + 4, (v / 100) * pw, rh - 10, 5); ctx.fill();
    txt(ctx, `${v.toFixed(v < 10 || v % 1 ? 1 : 0)}%${w < 520 ? "" : "  " + note}`, x0 + 8, y + rh * 0.58, { f: "11px system-ui", c: "#0b0f14" });
  });
}
