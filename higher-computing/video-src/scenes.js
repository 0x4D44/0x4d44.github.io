/* Scene choreography for the six explainers.
   Each scene is fn(c, s) where s = { t: seconds since scene start, L: [line start
   times relative to the scene], dur: scene length, T: global time }. */
"use strict";
const P = PANEL, CX = P.x + P.w / 2;

/* ---------------------------------------------------------------- twos-complement */
const PV8 = [128, 64, 32, 16, 8, 4, 2, 1];
function lampRow(c, bits, labels, x0, y, o = {}) {
  const s = o.size || 92, gap = o.gap || 22;
  bits.forEach((b, i) => lamp(c, x0 + i * (s + gap), y, !!b, labels ? labels[i] : null, { size: s, labelColor: o.labelColors ? o.labelColors[i] : COL.ink }));
  return x0 + 8 * (s + gap) - gap;
}
const ROWX = CX - (8 * 92 + 7 * 22) / 2;
const SC_TWOS = {
  title(c, s) {
    px(c, "THE MINUS-128 LAMP", CX, P.y + 150, { size: 64, align: "center", color: COL.navy });
    txt(c, "How two's complement stores negative numbers", CX, P.y + 200, { size: 30, align: "center", color: COL.ink2 });
    const bits = PV8.map((_, i) => (Math.sin(s.t * 3 + i * 1.7) > 0.2 ? 1 : 0));
    lampRow(c, bits, null, ROWX, P.y + 250);
  },
  positive(c, s) {
    px(c, "National 5: every place value is positive", CX, P.y + 50, { size: 30, align: "center", color: COL.navy });
    const order = [2, 4, 5, 7];
    const lit = PV8.map((_, i) => (order.indexOf(i) >= 0 && s.t > s.L[1] + 0.5 + order.indexOf(i) * 0.7 ? 1 : 0));
    lampRow(c, lit, PV8.map((v, i) => (s.t > i * 0.25 ? v : "")), ROWX, P.y + 130);
    const terms = order.filter((i, k) => s.t > s.L[1] + 0.5 + k * 0.7).map((i) => PV8[i]);
    if (terms.length) mono(c, terms.join(" + ") + (terms.length === 4 ? " = 45" : ""), CX, P.y + 330, { size: 44, align: "center", weight: 700 });
    if (terms.length === 4) mono(c, "00101101", CX, P.y + 390, { size: 32, align: "center", color: COL.ink2 });
  },
  negative(c, s) {
    const flip = prog(s.t, s.L[1] + 2.2, 0.8);
    const labels = PV8.map((v, i) => (i === 0 ? (flip > 0.5 ? "−128" : "128") : v));
    const cols = PV8.map((v, i) => (i === 0 && flip > 0.5 ? COL.red : COL.ink));
    lampRow(c, [0, 0, 0, 0, 0, 0, 0, 0], labels, ROWX, P.y + 120, { labelColors: cols });
    if (flip > 0 && flip < 1) { c.save(); c.strokeStyle = COL.red; c.lineWidth = 6; c.beginPath(); c.arc(ROWX + 46, P.y + 160, 70 + 20 * Math.sin(flip * Math.PI), 0, Math.PI * 2); c.stroke(); c.restore(); }
    if (flip >= 1) {
      px(c, "The leftmost lamp is worth −128", CX, P.y + 320, { size: 40, align: "center", color: COL.red });
      txt(c, "Every other lamp keeps its positive value.", CX, P.y + 370, { size: 28, align: "center", color: COL.ink2 });
    }
    if (s.t < s.L[1]) px(c, "?", ROWX + 46, P.y + 70, { size: 60, align: "center", color: COL.red });
  },
  readneg(c, s) {
    const bits = [1, 1, 0, 1, 0, 0, 1, 1];
    const show = bits.map((b, i) => (b && s.t > 0.4 + i * 0.55 ? 1 : 0));
    const labs = PV8.map((v, i) => (i === 0 ? "−128" : v));
    lampRow(c, show, labs, ROWX, P.y + 90, { labelColors: PV8.map((v, i) => (i ? COL.ink : COL.red)) });
    const terms = [];
    bits.forEach((b, i) => { if (b && s.t > 0.4 + i * 0.55) terms.push(i === 0 ? "−128" : "+ " + PV8[i]); });
    mono(c, terms.join(" "), CX, P.y + 290, { size: 44, align: "center", weight: 700 });
    if (s.t > s.L[1]) {
      mono(c, "= −45", CX, P.y + 360, { size: 60, align: "center", weight: 700, color: COL.red });
      txt(c, "leftmost lamp lit → negative number", CX, P.y + 410, { size: 26, align: "center", color: COL.ink2 });
    }
  },
  flip(c, s) {
    px(c, "Flip and add one:  −45", CX, P.y + 50, { size: 34, align: "center", color: COL.navy });
    const rows = [
      ["+45", "00101101", s.L[1]],
      ["flip", "11010010", s.L[2]],
      ["+ 1", "11010011", s.L[3]],
    ];
    rows.forEach(([lab, bits, at], r) => {
      if (s.t < at) return;
      const y = P.y + 90 + r * 108;
      px(c, lab, P.x + 160, y + 58, { size: 34, align: "right", color: r === 1 ? COL.purple : r === 2 ? COL.red : COL.ink });
      [...bits].forEach((b, i) => {
        const sc = r === 1 ? Math.abs(Math.cos(Math.PI * clamp((s.t - at - i * 0.08) / 0.5))) : 1;
        const shown = r === 1 && s.t - at - i * 0.08 < 0.25 ? "00101101"[i] : b;
        const x = P.x + 200 + i * 84;
        c.save(); c.translate(x + 36, y + 40); c.scale(1, Math.max(0.05, sc)); c.translate(-(x + 36), -(y + 40));
        block(c, x, y, 72, 80, shown === "1" ? COL.red : "#5a5a5a");
        mono(c, shown, x + 36, y + 54, { size: 40, align: "center", color: "#fff", weight: 700 });
        c.restore();
      });
    });
    if (s.t > s.L[3] + 3) {
      mono(c, "−128 + 64 + 16 + 2 + 1 = −45", P.x + 920, P.y + 300, { size: 26, align: "center", weight: 700, color: COL.grass });
      tick(c, P.x + 900, P.y + 360, 1.6);
    }
  },
  range(c, s) {
    const y0 = P.y + 200, x0 = P.x + 120, x1 = P.x + P.w - 120;
    c.save(); c.strokeStyle = COL.ink; c.lineWidth = 5; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y0); c.stroke(); c.restore();
    const xv = (v) => lerp(x0, x1, (v + 128) / 255);
    [-128, -64, 0, 64, 127].forEach((v) => { c.fillStyle = COL.ink; c.fillRect(xv(v) - 2, y0 - 14, 4, 28); mono(c, String(v).replace("-", "−"), xv(v), y0 + 50, { size: 26, align: "center" }); });
    if (s.t > s.L[1] + 0.5) { block(c, xv(-128) - 10, y0 - 120, 20, 90, COL.red); mono(c, "10000000", xv(-128) + 90, y0 - 80, { size: 30, weight: 700, color: COL.red }); }
    if (s.t > s.L[1] + 3.5) { block(c, xv(127) - 10, y0 - 120, 20, 90, COL.grass); mono(c, "01111111", xv(127) - 200, y0 - 80, { size: 30, weight: 700, color: COL.grass }); }
    if (s.t > s.L[2]) {
      mono(c, "n bits:  −2^(n−1)  to  2^(n−1) − 1", CX, P.y + 340, { size: 36, weight: 700, align: "center", color: COL.navy });
      mono(c, "4 bits: −8 to 7    8 bits: −128 to 127    16 bits: −32 768 to 32 767", CX, P.y + 400, { size: 22, align: "center", color: COL.ink2 });
    }
  },
  outro(c, s) {
    badge(c, CX - 520, P.y + 120, 320, "LEFTMOST = −128", COL.red, prog(s.t, 0.2));
    badge(c, CX - 160, P.y + 120, 320, "FLIP, ADD ONE", COL.purple, prog(s.t, 1.6));
    badge(c, CX + 200, P.y + 120, 320, "ALWAYS CHECK", COL.grass, prog(s.t, 3.0));
    lampRow(c, [1, 1, 0, 1, 0, 0, 1, 1].map((b, i) => (s.t > 4 + i * 0.1 ? b : 0)), null, ROWX, P.y + 260);
  },
};

/* ---------------------------------------------------------------- floating-point */
function digitsWithPoint(c, digits, pointPos, x, y, o = {}) {
  // digits: the digit string; pointPos: how many digits sit left of the point.
  // Leading zeros left of the point fade out, and a lone "0" is shown when the point leads.
  const w = o.w || 46, size = o.size || 56;
  let ds = digits, pos = pointPos;
  if (pos <= 0) { ds = "0" + ds; pos = 1; }
  const firstSig = ds.search(/[1-9]/);
  const total = ds.length * w + 30, left = x - total / 2;
  [...ds].forEach((d, i) => {
    const off = i >= pos ? 30 : 0;
    const fade = i < pos - 1 && i < firstSig && d === "0";
    mono(c, d, left + i * w + off + w / 2, y, { size, align: "center", weight: 700, alpha: fade ? 0 : 1, color: o.lead >= 0 && i === firstSig ? COL.red : COL.ink });
  });
  c.fillStyle = COL.red; c.fillRect(left + pos * w + 8, y - 10, 14, 14);
}
const SC_FP = {
  title(c, s) {
    px(c, "THE HOPPING POINT", CX, P.y + 140, { size: 64, align: "center", color: COL.navy });
    txt(c, "Floating-point representation", CX, P.y + 190, { size: 30, align: "center", color: COL.ink2 });
    mono(c, "56.1875°", CX, P.y + 300, { size: 72, align: "center", weight: 700, color: COL.sea });
    // compass rose
    c.save(); c.translate(CX + 330, P.y + 280); c.rotate(Math.sin(s.t) * 0.2);
    c.fillStyle = COL.red; c.beginPath(); c.moveTo(0, -60); c.lineTo(14, 0); c.lineTo(-14, 0); c.fill();
    c.fillStyle = COL.ink; c.beginPath(); c.moveTo(0, 60); c.lineTo(14, 0); c.lineTo(-14, 0); c.fill(); c.restore();
  },
  denary(c, s) {
    const digits = "340068", start = 5, hops = 5;
    const h = Math.floor(clamp((s.t - s.L[1]) / 0.6, 0, hops));
    const pos = start - h;
    digitsWithPoint(c, digits, pos, CX, P.y + 170, { lead: -1 });
    px(c, `hops so far: ${h}`, CX, P.y + 250, { size: 32, align: "center", color: COL.red });
    if (h === hops && s.t > s.L[1] + 3.5) mono(c, "= 0.340068 × 10⁵", CX, P.y + 350, { size: 52, align: "center", weight: 700, color: COL.navy });
    txt(c, "(34 006.8)", CX, P.y + 80, { size: 28, align: "center", color: COL.ink2 });
  },
  binary(c, s) {
    const digits = "1000010101", start = 7;
    const h = Math.floor(clamp((s.t - s.L[1] - 0.3) / 0.45, 0, 7));
    digitsWithPoint(c, digits, start - h, CX, P.y + 170, { lead: 0, w: 52 });
    txt(c, "66.625 in binary", CX, P.y + 80, { size: 28, align: "center", color: COL.ink2 });
    px(c, `hops so far: ${h}`, CX, P.y + 250, { size: 32, align: "center", color: COL.red });
    if (h === 7) mono(c, "= 0.1000010101 × 2⁷", CX, P.y + 350, { size: 52, align: "center", weight: 700, color: COL.navy });
  },
  fields(c, s) {
    mono(c, "0.1000010101 × 2⁷", CX, P.y + 70, { size: 40, align: "center", weight: 700, color: COL.ink2 });
    const y = P.y + 150;
    if (s.t > s.L[0]) { block(c, P.x + 60, y, 90, 100, COL.red); mono(c, "0", P.x + 105, y + 66, { size: 44, align: "center", color: "#fff", weight: 700 }); px(c, "sign", P.x + 105, y + 140, { size: 26, align: "center" }); }
    if (s.t > s.L[1]) {
      const m = "100001010100000", n = Math.floor(clamp((s.t - s.L[1] - 0.5) / 0.12, 0, 15));
      block(c, P.x + 170, y, 640, 100, COL.sea);
      mono(c, m.slice(0, n), P.x + 190, y + 64, { size: 38, color: "#fff", weight: 700 });
      px(c, "mantissa · 15 bits", P.x + 490, y + 140, { size: 26, align: "center" });
      if (n === 15) txt(c, "the digits after the point, padded with zeros", P.x + 490, y + 180, { size: 22, align: "center", color: COL.ink2 });
    }
    if (s.t > s.L[2]) { block(c, P.x + 830, y, 310, 100, COL.grass); mono(c, "00000111", P.x + 985, y + 64, { size: 38, align: "center", color: "#fff", weight: 700 }); px(c, "exponent = 7", P.x + 985, y + 140, { size: 26, align: "center" }); txt(c, "8-bit two's complement", P.x + 985, y + 180, { size: 22, align: "center", color: COL.ink2 }); }
  },
  small(c, s) {
    const digits = "00010101", start = 1;
    const h = Math.floor(clamp((s.t - s.L[1] - 3.2) / 0.6, 0, 2));
    digitsWithPoint(c, digits, start + h, CX, P.y + 150, { lead: 3, w: 52 });
    px(c, `hops right: ${h}`, CX, P.y + 230, { size: 32, align: "center", color: COL.red });
    if (h === 2) {
      mono(c, "= 0.10101 × 2⁻²", CX, P.y + 310, { size: 48, align: "center", weight: 700, color: COL.navy });
      if (s.t > s.L[1] + 6.5) { block(c, CX - 160, P.y + 340, 320, 70, COL.grass); mono(c, "11111110", CX, P.y + 388, { size: 36, align: "center", color: "#fff", weight: 700 }); px(c, "exponent −2", CX + 260, P.y + 386, { size: 26 }); }
    }
  },
  tradeoff(c, s) {
    let e = 8;
    if (s.t > s.L[0] + 1) e = lerp(8, 4, ease(prog(s.t, s.L[0] + 1, 2)));
    if (s.t > s.L[1]) e = lerp(4, 13, ease(prog(s.t, s.L[1] + 0.5, 2.5)));
    const m = 23 - e, x0 = P.x + 60, w = P.w - 120, y = P.y + 120, u = w / 24;
    block(c, x0, y, u, 90, COL.red);
    block(c, x0 + u, y, u * m, 90, COL.sea);
    block(c, x0 + u * (1 + m), y, u * e, 90, COL.grass);
    px(c, `mantissa ${Math.round(m)} bits`, x0 + u * (1 + m / 2), y + 56, { size: 26, align: "center", color: "#fff" });
    px(c, `exp ${Math.round(e)}`, x0 + u * (1 + m + e / 2), y + 56, { size: 24, align: "center", color: "#fff" });
    const digits = (m * Math.log10(2)).toFixed(1), rng = (2 ** (e - 1) - 1) * Math.log10(2);
    txt(c, `precision ≈ ${digits} significant digits`, P.x + 300, y + 170, { size: 30, align: "center", weight: 700, color: COL.sea });
    txt(c, `largest ≈ 10${String(Math.round(rng)).split("").map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[d]).join("")}`, P.x + 900, y + 170, { size: 30, align: "center", weight: 700, color: COL.grass });
    if (s.t > s.L[0] + 2.5 && s.t < s.L[1]) px(c, "MORE PRECISION, LESS RANGE", CX, y + 270, { size: 36, align: "center", color: COL.sea });
    if (s.t > s.L[1] + 3) px(c, "MORE RANGE, LESS PRECISION", CX, y + 270, { size: 36, align: "center", color: COL.grass });
  },
  outro(c, s) {
    badge(c, CX - 470, P.y + 140, 420, "MANTISSA → PRECISION", COL.sea, prog(s.t, 0.2));
    badge(c, CX + 50, P.y + 140, 420, "EXPONENT → RANGE", COL.grass, prog(s.t, 1.8));
    txt(c, "Use those exact words in the exam.", CX, P.y + 300, { size: 32, align: "center", alpha: prog(s.t, 3.5) });
  },
};

/* ---------------------------------------------------------------- fetch-execute */
const FX = { cpu: { x: P.x + 40, y: P.y + 30, w: 360, h: 380 }, mem: { x: P.x + 800, y: P.y + 30, w: 360, h: 380 } };
const BUS = { addr: P.y + 110, data: P.y + 220, ctl: P.y + 330 };
function fxBase(c, s, st) {
  const { cpu, mem } = FX;
  block(c, cpu.x, cpu.y, cpu.w, cpu.h, "#33465f");
  px(c, "PROCESSOR", cpu.x + cpu.w / 2, cpu.y + 40, { size: 26, align: "center", color: "#fff" });
  const reg = (lab, val, y, hl) => { rect(c, cpu.x + 20, y, cpu.w - 40, 62, hl ? "#f6e3a0" : COL.paper); txt(c, lab, cpu.x + 32, y + 22, { size: 16, color: COL.ink2 }); mono(c, val, cpu.x + 32, y + 52, { size: 26, weight: 700 }); };
  reg("PROGRAM COUNTER", st.pc, cpu.y + 60);
  reg("INSTRUCTION REGISTER", st.ir, cpu.y + 136, st.irHl);
  reg("CONTROL UNIT / DECODER", st.cu || "", cpu.y + 212, st.cuHl);
  reg("ACCUMULATOR", st.acc, cpu.y + 288, st.accHl);
  block(c, mem.x, mem.y, mem.w, mem.h, "#6b4a2a");
  px(c, "MAIN MEMORY", mem.x + mem.w / 2, mem.y + 40, { size: 26, align: "center", color: "#fff" });
  [["04", "LOAD 9"], ["05", "ADD 10"], ["06", "STORE 11"], ["07", "HALT"], ["08", "—"], ["09", "12"], ["10", "7"], ["11", "0"]].forEach(([a, v], i) => {
    const y = mem.y + 62 + i * 39;
    rect(c, mem.x + 20, y, mem.w - 40, 34, st.memHl === a ? "#bcd3f0" : COL.paper);
    mono(c, a, mem.x + 34, y + 25, { size: 22, color: COL.ink2 }); mono(c, v, mem.x + 100, y + 25, { size: 24, weight: 700 });
  });
  const bus = (y, col, lab, w, glow) => {
    c.save(); if (glow) { c.shadowColor = COL.gold; c.shadowBlur = 24; }
    c.fillStyle = glow ? COL.gold : col; c.fillRect(cpu.x + cpu.w, y - w / 2, mem.x - cpu.x - cpu.w, w); c.restore();
    px(c, lab, CX, y - 34, { size: 22, align: "center", color: COL.ink });
  };
  if (st.buses > 0) bus(BUS.addr, COL.blue, "ADDRESS BUS →", 14);
  if (st.buses > 1) bus(BUS.data, COL.grass, "← DATA BUS →", 22);
  if (st.buses > 2) bus(BUS.ctl, COL.purple, st.read ? "CONTROL BUS · READ LINE ON" : "CONTROL BUS", 10, st.read);
}
function token(c, x, y, label, col) { block(c, x - 70, y - 26, 140, 52, col); mono(c, label, x, y + 10, { size: 26, align: "center", color: "#fff", weight: 700 }); }
const travel = (s, at, x1, x2, dur = 1.6) => lerp(x1, x2, ease(prog(s.t, at, dur)));
const SC_FX = {
  title(c, s) {
    px(c, "BEAT TO QUARTERS", CX, P.y + 120, { size: 64, align: "center", color: COL.navy });
    txt(c, "The fetch-execute cycle", CX, P.y + 170, { size: 30, align: "center", color: COL.ink2 });
    for (let i = 0; i < 6; i++) {
      const x = P.x + 160 + i * 160, y = P.y + 290, recoil = Math.max(0, Math.sin(s.t * 4 - i * 0.6)) * 10;
      block(c, x - recoil, y, 110, 34, "#3a3a3a"); block(c, x + 10 - recoil, y + 34, 80, 26, COL.dirt);
    }
    const beat = Math.floor(s.t * 3) % 2;
    block(c, CX - 40, P.y + 360 - beat * 6, 80, 50, COL.red); rect(c, CX - 40, P.y + 360 - beat * 6, 80, 8, COL.gold);
  },
  parts(c, s) { fxBase(c, s, { pc: "04", ir: "—", acc: "0", buses: Math.floor(clamp((s.t - 3) / 1.2, 0, 3)) }); },
  step1(c, s) {
    fxBase(c, s, { pc: "04", ir: "—", acc: "0", buses: 3, memHl: s.t > 2.6 ? "04" : null });
    token(c, travel(s, 0.6, FX.cpu.x + FX.cpu.w + 70, FX.mem.x - 70), BUS.addr, "04", COL.blue);
    if (s.t > s.L[1]) px(c, "“LOCKER 04!”", CX, P.y + 420, { size: 30, align: "center", color: COL.red });
  },
  step2(c, s) {
    fxBase(c, s, { pc: "04", ir: "—", acc: "0", buses: 3, memHl: "04", read: s.t > 1 });
    if (s.t > 1) token(c, travel(s, 1, FX.cpu.x + FX.cpu.w + 70, FX.mem.x - 70), BUS.ctl, "READ", COL.purple);
  },
  step3(c, s) {
    const arrived = s.t > 3;
    fxBase(c, s, { pc: arrived ? "05" : "04", ir: arrived ? "LOAD 9" : "—", acc: "0", buses: 3, memHl: "04", irHl: arrived });
    const x = travel(s, 0.8, FX.mem.x - 70, FX.cpu.x + FX.cpu.w + 70, 2.2);
    if (!arrived) token(c, x, BUS.data, "LOAD 9", COL.grass);
    // the powder monkey runs along beside the cartridge
    if (!arrived) { const k = 4, bob = Math.floor(s.t * 8) % 2; sprite(c, ["..hh..", ".hsss.", "..ss..", ".wwww.", "w.ww.w", ".w..w.", bob ? "w....w" : ".w..w."], { h: "#6b3e1f", s: "#f1c9a5", w: "#e8e8e8" }, x - 12, BUS.data + 30, k); }
  },
  step4(c, s) {
    const exec = s.t > 2.4;
    fxBase(c, s, { pc: "05", ir: "LOAD 9", acc: exec ? "12" : "0", buses: 3, cu: s.t > 0.8 ? "decode: LOAD" : "", cuHl: s.t > 0.8, accHl: exec });
    if (s.t > s.L[1] && s.t < s.L[1] + 1.2) {
      c.save(); c.globalAlpha = 1 - prog(s.t, s.L[1], 1.2); c.fillStyle = "#ffb21e"; c.beginPath(); c.arc(CX, P.y + 385, 25 + 35 * prog(s.t, s.L[1], 1.2), 0, Math.PI * 2); c.fill(); c.restore();
      px(c, "FIRE!", CX, P.y + 402, { size: 48, align: "center", color: COL.red });
    }
  },
  perf(c, s) {
    const card = (i, title, sub, at, draw) => {
      const x = P.x + 40 + i * 290, y = P.y + 40, a = prog(s.t, at);
      if (a <= 0) return;
      c.save(); c.globalAlpha = a; block(c, x, y, 270, 350, COL.paper2);
      px(c, title, x + 135, y + 46, { size: 26, align: "center", color: COL.navy });
      txt(c, sub, x + 135, y + 320, { size: 20, align: "center", color: COL.ink2 });
      draw(x, y); c.restore();
    };
    card(0, "MORE CORES", "more crews firing at once", s.L[0] + 0.5, (x, y) => { for (let i = 0; i < 4; i++) { block(c, x + 40, y + 80 + i * 52, 150, 30, "#3a3a3a"); if (Math.floor(s.t * 2 + i) % 3 === 0) { c.fillStyle = "#ffb21e"; c.fillRect(x + 192, y + 82 + i * 52, 26, 26); } } });
    card(1, "WIDER BUS", "more bits per trip", s.L[1] + 0.3, (x, y) => { for (let i = 0; i < 6; i++) { c.fillStyle = COL.grass; c.fillRect(x + 30, y + 90 + i * 30, 210, 12); c.fillStyle = "#fff"; c.fillRect(x + 30 + ((s.t * 120 + i * 40) % 200), y + 87 + i * 30, 14, 18); } });
    card(2, "MORE CACHE", "fewer slow trips below", s.L[1] + 4, (x, y) => { block(c, x + 60, y + 90, 150, 170, COL.dirt); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) block(c, x + 72 + j * 46, y + 104 + i * 38, 38, 30, "#c99a2e"); });
    card(3, "FASTER CLOCK", "more cycles per second", s.L[2] + 0.3, (x, y) => { const b = Math.floor(s.t * 6) % 2; block(c, x + 75, y + 120 - b * 10, 120, 90, COL.red); rect(c, x + 75, y + 120 - b * 10, 120, 12, COL.gold); px(c, "3.5 GHz", x + 135, y + 270, { size: 28, align: "center" }); });
  },
  outro(c, s) {
    const steps = ["ADDRESS BUS", "READ LINE", "DATA BUS", "DECODE & EXECUTE"];
    const k = Math.floor(s.t * 1.2) % 4;
    steps.forEach((st, i) => {
      const x = P.x + 30 + i * 295;
      block(c, x, P.y + 160, 270, 90, i === k ? COL.gold : COL.navy2);
      px(c, st, x + 135, P.y + 215, { size: 24, align: "center", color: i === k ? COL.ink : "#fff" });
      if (i < 3) arrow(c, x + 272, P.y + 205, x + 293, P.y + 205, COL.ink, 4, 12);
    });
    px(c, "↻ and repeat, billions of times a second", CX, P.y + 330, { size: 28, align: "center", color: COL.ink2 });
  },
};

/* ---------------------------------------------------------------- encryption */
function keyIcon(c, x, y, col, lab, sc = 1) {
  c.save(); c.translate(x, y); c.scale(sc, sc);
  c.strokeStyle = col; c.lineWidth = 9; c.beginPath(); c.arc(0, 0, 18, 0, Math.PI * 2); c.stroke();
  c.fillStyle = col; c.fillRect(18, -5, 62, 10); c.fillRect(60, 5, 9, 16); c.fillRect(74, 5, 7, 12);
  c.restore();
  if (lab) px(c, lab, x + 30 * sc, y + 52 * sc, { size: 20 * sc, align: "center", color: col });
}
function scroll(c, x, y, text, o = {}) {
  block(c, x, y, o.w || 280, 70, o.locked ? "#a59a80" : "#f3e7c8");
  mono(c, text, x + (o.w || 280) / 2, y + 44, { size: 22, align: "center", weight: 700, color: o.locked ? "#3d3528" : COL.ink });
  if (o.seal) { c.save(); c.fillStyle = o.seal; c.beginPath(); c.arc(x + (o.w || 280) - 6, y + 64, 22 * (o.sealScale || 1), 0, Math.PI * 2); c.fill(); c.restore(); }
  if (o.locked) { block(c, x - 30, y + 18, 40, 36, COL.gold); }
}
const person = (c, who, x, y, lab) => {
  const map = who === "A" ? ALBA : who === "F" ? FOX : HAMISH;
  const legend = who === "F" ? { o: "#d9772b", e: "#1d1a14", w: "#f4f4f4", k: "#1d1a14", b: "#2d2d5a", r: "#c8102e" } : { b: "#1f3f6e", y: "#e0b23a", h: "#6b3e1f", s: "#f1c9a5", e: "#1d1a14", n: "#d9a982", M: "#c98a73", U: "#5b7fb0", w: who === "A" ? "#dfe7f0" : "#f2f2f2", d: "#1d1a14", k: "#141414", g: "#e0b23a", G: "#e0b23a", N: "#1a2747" };
  sprite(c, map, legend, x, y, 6);
  txt(c, lab, x + 48, y + 120, { size: 20, align: "center", weight: 700 });
};
const SC_ENC = {
  title(c, s) {
    px(c, "SEALS AND COMMISSIONS", CX, P.y + 120, { size: 60, align: "center", color: COL.navy });
    txt(c, "Public and private keys, digital signatures and certificates", CX, P.y + 170, { size: 28, align: "center", color: COL.ink2 });
    scroll(c, CX - 140, P.y + 250, "SEALED ORDERS", { seal: COL.red });
    c.fillStyle = COL.sea; c.fillRect(P.x, P.y + 380, P.w, 56);
    for (let i = 0; i < 20; i++) { c.fillStyle = "#7fb2e6"; c.fillRect(P.x + ((i * 97 + s.t * 40) % P.w), P.y + 395 + (i % 3) * 12, 30, 4); }
  },
  pair(c, s) {
    keyIcon(c, P.x + 260, P.y + 140, COL.blue, "PUBLIC: share it", 1.4);
    keyIcon(c, P.x + 260, P.y + 300, COL.red, "PRIVATE: keep it", 1.4);
    if (s.t > s.L[1]) {
      const a = prog(s.t, s.L[1], 1);
      block(c, P.x + 650, P.y + 150, 200, 160, COL.dirt);
      block(c, P.x + 715, P.y + 110 + (s.t > s.L[1] + 2.5 ? -30 : 0), 70, 60, COL.gold);
      txt(c, s.t < s.L[1] + 2.5 ? "locked with PUBLIC" : "opened with PRIVATE", P.x + 750, P.y + 360, { size: 26, align: "center", weight: 700, color: s.t < s.L[1] + 2.5 ? COL.blue : COL.red, alpha: a });
    }
  },
  secret(c, s) {
    person(c, "A", P.x + 60, P.y + 40, "Alba");
    person(c, "H", P.x + P.w - 160, P.y + 40, "Captain");
    keyIcon(c, P.x + P.w - 260, P.y + 220, COL.red, "his private", 0.8);
    const locked = s.t > 2.2;
    const x = s.t < s.L[1] ? P.x + 240 : lerp(P.x + 240, P.x + 820, ease(prog(s.t, s.L[1] + 4, 3)));
    if (s.t < 2.2) keyIcon(c, P.x + 300, P.y + 230, COL.blue, "Captain's public", 0.8);
    scroll(c, x, P.y + 300, locked && (s.t < s.L[1] + 7.5) ? "x9#Qm!2@Lr*wZ" : "Sail at dawn", { locked: locked && s.t < s.L[1] + 7.5 });
    if (s.t > s.L[1]) {
      person(c, "F", CX - 48, P.y + 30, "Spy");
      if (s.t > s.L[1] + 1.5 && s.t < s.L[1] + 4.5) { keyIcon(c, CX + 60, P.y + 160, COL.blue, "", 0.6); cross(c, CX + 120, P.y + 170, 1.2); txt(c, "public key can't unlock", CX + 40, P.y + 230, { size: 22, align: "center", color: COL.red, weight: 700 }); }
    }
    if (s.t > s.L[1] + 7.5) { tick(c, P.x + 1100, P.y + 340, 1.2); txt(c, "unlocked with the private key", P.x + 900, P.y + 410, { size: 24, align: "center", weight: 700, color: COL.grass }); }
  },
  signature(c, s) {
    person(c, "A", P.x + 60, P.y + 40, "Alba");
    person(c, "H", P.x + P.w - 160, P.y + 40, "Captain");
    const altered = s.t > s.L[2] + 1.5;
    const sealT = prog(s.t, s.L[1] + 3, 0.5);
    if (s.t > s.L[1]) keyIcon(c, P.x + 260, P.y + 220, COL.red, "Alba's private", 0.8);
    scroll(c, CX - 160, P.y + 280, altered ? "Sail at dusk" : "Sail at dawn", { w: 320, seal: sealT > 0 ? COL.red : null, sealScale: 1 + (1 - sealT) * 1.5 });
    if (s.t > s.L[1] + 6) {
      keyIcon(c, P.x + P.w - 300, P.y + 220, COL.blue, "Alba's public", 0.8);
      if (!altered) { tick(c, CX + 200, P.y + 300, 1.2); txt(c, "seal matches: genuine and unaltered", CX, P.y + 410, { size: 26, align: "center", weight: 700, color: COL.grass }); }
    }
    if (altered) { cross(c, CX + 220, P.y + 310, 1.3); txt(c, "message altered: seal doesn't match", CX, P.y + 410, { size: 26, align: "center", weight: 700, color: COL.red }); }
  },
  certificate(c, s) {
    const a = prog(s.t, 0.5);
    c.save(); c.globalAlpha = a;
    block(c, CX - 330, P.y + 40, 660, 300, "#f6ecd2");
    px(c, "DIGITAL CERTIFICATE", CX, P.y + 90, { size: 30, align: "center", color: COL.navy });
    [["Name", "redstone.example"], ["Public key", "3f:a2:9c:…"], ["Expires", "2027-03-01"], ["Signed by", "a trusted authority (CA)"]].forEach(([k, v], i) => {
      txt(c, k + ":", CX - 290, P.y + 140 + i * 44, { size: 24, weight: 700 }); mono(c, v, CX - 120, P.y + 140 + i * 44, { size: 22 });
    });
    c.fillStyle = COL.gold; c.beginPath(); c.arc(CX + 270, P.y + 290, 36, 0, Math.PI * 2); c.fill();
    c.restore();
    if (s.t > s.L[1] + 4) {
      block(c, CX - 110, P.y + 360, 220, 60, COL.grass);
      px(c, "🔒 HTTPS ✔", CX, P.y + 400, { size: 26, align: "center", color: "#fff" });
    }
  },
  outro(c, s) {
    badge(c, CX - 560, P.y + 120, 360, "ENCRYPT: THEIR PUBLIC", COL.blue, prog(s.t, 0.3));
    badge(c, CX - 180, P.y + 120, 360, "SIGN: YOUR PRIVATE", COL.red, prog(s.t, 2.2));
    badge(c, CX + 200, P.y + 120, 360, "TRUST: CERTIFICATE", COL.gold, prog(s.t, 4.2));
  },
};

/* ---------------------------------------------------------------- sql-group-by */
const CAD = [["C101", "Ross", 1805], ["C102", "Ailsa", 1805], ["C103", "Callum", 2212], ["C104", "Mhairi", 1805], ["C105", "Euan", 2212], ["C106", "Isla", 2471], ["C107", "Kenzie", 2212], ["C108", "Freya", 2471], ["C109", "Hamish", 1805], ["C110", "Zara", 2471], ["C111", "Lewis", 3110], ["C112", "Niamh", 3110]];
const SQC = { 1805: "#3e6fa8", 2212: "#4f8a2e", 2471: "#b8761c", 3110: "#7b5bb5" };
function sqlRows(c, s, phase) {
  // phase 0: list; 1: grouped; 2: collapsed; 3: ordered
  const x = P.x + 60, rowH = 26, w = 420;
  const groups = [1805, 2212, 2471, 3110];
  const counts = { 1805: 4, 2212: 3, 2471: 3, 3110: 2 };
  const orderG = phase >= 3 ? [1805, 2212, 2471, 3110].sort((a, b) => counts[a] - counts[b] || a - b) : groups;
  const pg = ease(clamp(phase - Math.floor(phase)));
  const base = Math.floor(phase);
  px(c, base >= 2 ? (base >= 3 ? "squadronNo · Cadets" : "squadronNo · COUNT(*)") : "cadetID · firstname · squadronNo", x, P.y + 40, { size: 22, color: COL.navy });
  if (base < 2) {
    CAD.forEach((r, i) => {
      const gi = groups.indexOf(r[2]);
      const within = CAD.filter((q, j) => q[2] === r[2] && j < i).length;
      const yList = P.y + 56 + i * rowH;
      const yGroup = P.y + 56 + (CAD.filter((q) => groups.indexOf(q[2]) < gi).length + within) * rowH + gi * 10;
      const y = base === 0 ? lerp(yList, yGroup, phase >= 1 ? 1 : pg * (phase > 0 ? 1 : 0)) : yGroup;
      rect(c, x, y, w, rowH - 4, base >= 1 || phase > 0 ? SQC[r[2]] : COL.paper2);
      mono(c, `${r[0]}   ${r[1].padEnd(7)}  ${r[2]}`, x + 12, y + 18, { size: 18, color: base >= 1 || phase > 0 ? "#fff" : COL.ink, weight: 700 });
    });
  } else {
    orderG.forEach((g, k) => {
      const y = P.y + 60 + k * 64;
      block(c, x, y, w, 54, SQC[g]);
      mono(c, `${g}`, x + 20, y + 36, { size: 26, color: "#fff", weight: 700 });
      mono(c, `${counts[g]}`, x + w - 40, y + 36, { size: 30, color: "#fff", weight: 700, align: "right" });
    });
  }
}
function sqlText(c, lines, hlLine) {
  const x = P.x + 560, y = P.y + 60;
  block(c, x, y - 30, 600, 40 + lines.length * 44, "#20232b");
  lines.forEach((l, i) => mono(c, l, x + 24, y + 16 + i * 44, { size: 26, color: i === hlLine ? COL.gold : "#f1efe8", weight: 700 }));
}
const SC_SQL = {
  title(c, s) {
    px(c, "MUSTER BY SQUADRON", CX, P.y + 120, { size: 64, align: "center", color: COL.navy });
    txt(c, "Aggregate functions and GROUP BY", CX, P.y + 170, { size: 30, align: "center", color: COL.ink2 });
    for (let i = 0; i < 12; i++) { const k = 5, bob = Math.floor(s.t * 3 + i) % 2; sprite(c, ["..hh..", ".hsss.", "..ss..", ".UUUU.", "U.UU.U", ".U..U.", bob ? "U....U" : ".U..U."], { h: "#6b3e1f", s: "#f1c9a5", U: SQC[CAD[i][2]] }, P.x + 150 + i * 80, P.y + 280, k); }
  },
  table(c, s) {
    sqlRows(c, s, 0);
    sqlText(c, ["SELECT COUNT(*)", "FROM Cadet;"], -1);
    if (s.t > 4) { block(c, P.x + 760, P.y + 220, 200, 70, COL.red); px(c, "= 12", P.x + 860, P.y + 268, { size: 36, align: "center", color: "#fff" }); }
  },
  group(c, s) {
    sqlRows(c, s, clamp((s.t - 1.5) / 2, 0, 1) * 0.999 + (s.t > 3.5 ? 0.001 : 0));
    sqlText(c, ["SELECT squadronNo, COUNT(*)", "FROM Cadet", "GROUP BY squadronNo;"], 2);
  },
  collapse(c, s) {
    sqlRows(c, s, s.t > 1.5 ? 2 : 1);
    sqlText(c, ["SELECT squadronNo, COUNT(*)", "FROM Cadet", "GROUP BY squadronNo;"], 0);
  },
  order(c, s) {
    sqlRows(c, s, s.t > s.L[0] + 3 ? 3 : 2);
    sqlText(c, ["SELECT squadronNo,", "  COUNT(*) AS [Cadets]", "FROM Cadet", "GROUP BY squadronNo", "ORDER BY COUNT(*) ASC;"], s.t > s.L[1] ? 3 : 1);
    if (s.t > s.L[1]) { arrow(c, P.x + 1140, P.y + 236, P.x + 1140, P.y + 278, COL.gold, 5, 14); }
  },
  traps(c, s) {
    const card = (y, bad, good, at) => {
      if (s.t < at) return;
      block(c, P.x + 60, y, P.w - 120, 160, COL.paper2);
      mono(c, bad, P.x + 130, y + 56, { size: 24, weight: 700, color: COL.red });
      cross(c, P.x + 100, y + 48, 0.9);
      if (s.t > at + 3) { mono(c, good, P.x + 130, y + 118, { size: 24, weight: 700, color: COL.grass }); tick(c, P.x + 80, y + 116, 0.7); }
    };
    card(P.y + 30, "SELECT firstname FROM Cadet WHERE squadronNo = MAX(squadronNo);", "save MAX in query 1 → use it in query 2", s.L[1]);
    card(P.y + 220, "SELECT firstname, COUNT(*) FROM Cadet;", "aggregate with a plain field only with GROUP BY", s.L[2]);
  },
  outro(c, s) {
    badge(c, CX - 520, P.y + 140, 300, "1 · GROUP", "#3e6fa8", prog(s.t, 0.2));
    badge(c, CX - 150, P.y + 140, 300, "2 · AGGREGATE", COL.grass, prog(s.t, 1));
    badge(c, CX + 220, P.y + 140, 300, "3 · ORDER", "#b8761c", prog(s.t, 1.8));
  },
};

/* ---------------------------------------------------------------- css-float */
function imgBox(c, x, y, w, h, label, col = "#9fc6e8") { rect(c, x, y, w, h, col, "#5a4632", 4); c.save(); c.strokeStyle = "rgba(0,0,0,.25)"; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y + h); c.moveTo(x + w, y); c.lineTo(x, y + h); c.stroke(); c.restore(); if (label) px(c, label, x + w / 2, y + h / 2 + 8, { size: 20, align: "center", color: COL.ink }); }
function textLines(c, x, y, w, n, col = "#9a8f78") { for (let i = 0; i < n; i++) { c.fillStyle = col; c.fillRect(x, y + i * 26, i === n - 1 ? w * 0.6 : w, 12); } }
const SC_CSS = {
  title(c, s) {
    px(c, "THE RUNAWAY FOOTER", CX, P.y + 110, { size: 64, align: "center", color: COL.navy });
    txt(c, "float, clear and the box model", CX, P.y + 160, { size: 30, align: "center", color: COL.ink2 });
    // wireframe vs broken page
    rect(c, P.x + 180, P.y + 190, 340, 190, null, COL.ink, 3); imgBox(c, P.x + 200, P.y + 210, 120, 90); textLines(c, P.x + 340, P.y + 220, 160, 3); rect(c, P.x + 190, P.y + 330, 320, 40, COL.navy2); px(c, "WIREFRAME", P.x + 350, P.y + 412, { size: 22, align: "center" });
    const up = Math.sin(s.t * 2) * 6;
    rect(c, P.x + 680, P.y + 190, 340, 190, null, COL.ink, 3); imgBox(c, P.x + 700, P.y + 210, 120, 140); rect(c, P.x + 830, P.y + 260 + up, 180, 40, COL.navy2); px(c, "BROWSER  ✘", P.x + 850, P.y + 412, { size: 22, align: "center", color: COL.red });
  },
  box(c, s) {
    if (s.t < s.L[1]) {
      const x = CX - 300, y = P.y + 40;
      rect(c, x, y, 600, 360, "rgba(224,178,58,.35)"); px(c, "margin", x + 20, y + 34, { size: 24, color: "#8a6a12" });
      rect(c, x + 60, y + 60, 480, 240, "#5a4632"); px(c, "border", x + 76, y + 92, { size: 22, color: "#fff" });
      rect(c, x + 72, y + 72, 456, 216, "#bcd8c0"); px(c, "padding", x + 92, y + 104, { size: 22, color: COL.grass });
      rect(c, x + 150, y + 130, 300, 100, "#9fc6e8"); px(c, "content (width × height)", x + 300, y + 188, { size: 22, align: "center" });
    } else {
      const y = P.y + 120;
      [CX - 320, CX + 20].forEach((x, i) => { rect(c, x - 30, y - 30, 360, 220, "rgba(224,178,58,.35)"); rect(c, x, y, 300, 160, "#9fc6e8", "#5a4632", 4); px(c, `box ${i + 1}`, x + 150, y + 88, { size: 26, align: "center" }); });
      arrow(c, CX - 50, y + 230, CX - 2, y + 230, COL.red, 4, 10); arrow(c, CX + 50, y + 230, CX + 2, y + 230, COL.red, 4, 10);
      px(c, "10px + 10px = 20px gap", CX, y + 280, { size: 30, align: "center", color: COL.red });
    }
  },
  fit(c, s) {
    const margin = s.t > s.L[1] + 1 ? Math.round(lerp(5, 10, ease(prog(s.t, s.L[1] + 1, 2)))) : 5;
    const scale = 1.25, sx = CX - 400 * scale / 1.25 - 0, x0 = P.x + 100, y0 = P.y + 70;
    rect(c, x0, y0, 800 * scale, 330, "rgba(28,59,102,.08)", COL.navy2, 3);
    px(c, "section {width:800px}", x0, y0 - 12, { size: 20, color: COL.navy });
    let cx = 0, cy = 0;
    for (let i = 0; i < 4; i++) {
      const full = 186 + 4 + 2 * margin;
      if (cx + full > 800) { cx = 0; cy += 150; }
      imgBox(c, x0 + (cx + margin) * scale, y0 + 10 + cy + margin, 190 * scale * 0.98, 120, `img ${i + 1}`);
      cx += full;
    }
    const each = 186 + 4 + 2 * margin;
    mono(c, `186 + 2×2 + 2×${margin} = ${each}px  ×4 = ${each * 4}px`, CX, P.y + 400, { size: 26, align: "center", weight: 700, color: each * 4 > 800 ? COL.red : COL.grass });
    void sx;
  },
  float(c, s) {
    const x0 = P.x + 200, y0 = P.y + 50, w = 800;
    rect(c, x0, y0, w, 360, null, COL.ink, 3);
    const f = ease(prog(s.t, 1.2, 1.2));
    imgBox(c, x0 + 20, y0 + 20 + (1 - f) * 0, 220, 160, "float:left");
    const tx = lerp(x0 + 20, x0 + 260, f), ty = lerp(y0 + 200, y0 + 30, f), tw = lerp(760, 520, f);
    textLines(c, tx, ty, tw, 5);
    textLines(c, x0 + 20, ty + 140 + (1 - f) * 0, 760, 4);
  },
  runaway(c, s) {
    const x0 = P.x + 200, y0 = P.y + 40, w = 800;
    rect(c, x0, y0, w, 380, null, COL.ink, 3);
    imgBox(c, x0 + 20, y0 + 20, 200, 240, "A");
    imgBox(c, x0 + 580, y0 + 20, 200, 280, "B");
    textLines(c, x0 + 240, y0 + 30, 320, 3);
    const cleared = s.t > s.L[1] + 3.5;
    const fy = cleared ? lerp(y0 + 110, y0 + 312, ease(prog(s.t, s.L[1] + 3.5, 1))) : y0 + 110;
    rect(c, x0 + (cleared ? 20 : 240), fy, cleared ? 760 : 320, 50, COL.navy2);
    px(c, "footer", x0 + (cleared ? 400 : 400), fy + 34, { size: 22, align: "center", color: "#fff" });
    if (!cleared && s.t > 1) { cross(c, x0 + 525, fy + 25, 0.8, COL.gold); }
    if (cleared) { mono(c, "footer {clear:both}", x0 + 400, y0 + 200, { size: 26, align: "center", weight: 700, color: COL.grass }); }
  },
  outro(c, s) {
    badge(c, CX - 580, P.y + 140, 360, "COUNT BOTH SIDES", COL.gold, prog(s.t, 0.2));
    badge(c, CX - 180, P.y + 140, 360, "FLOAT TO LINE UP", COL.sea, prog(s.t, 1.6));
    badge(c, CX + 220, P.y + 140, 360, "CLEAR:BOTH BELOW", COL.grass, prog(s.t, 3.0));
  },
};

const SCENES = { "twos-complement": SC_TWOS, "floating-point": SC_FP, "fetch-execute": SC_FX, encryption: SC_ENC, "sql-group-by": SC_SQL, "css-float": SC_CSS };
const LABELS = {
  "fetch-execute": { step1: "STEP 1", step2: "STEP 2", step3: "STEP 3", step4: "STEP 4", perf: "PERFORMANCE" },
  "twos-complement": { flip: "FLIP AND ADD ONE", range: "RANGE" },
  "floating-point": { fields: "SIGN · MANTISSA · EXPONENT", tradeoff: "RANGE VS PRECISION" },
  encryption: { secret: "CONFIDENTIALITY", signature: "DIGITAL SIGNATURE", certificate: "DIGITAL CERTIFICATE" },
  "sql-group-by": { group: "GROUP BY", collapse: "AGGREGATE", order: "ORDER BY", traps: "TRAPS" },
  "css-float": { box: "BOX MODEL", fit: "800 PIXELS", float: "FLOAT", runaway: "CLEAR" },
};

function renderFrame(c, cues, T) {
  const scenes = cues.scenes;
  let si = scenes.findIndex((x) => T >= x.start && T < x.end);
  if (si < 0) si = T < scenes[0].start ? 0 : scenes.length - 1;
  const sc = scenes[si];
  const L = cues.lines.filter((l) => l.si === si).map((l) => l.start - sc.start);
  stage(c, cues, T, (LABELS[cues.id] || {})[sc.id]);
  c.save(); c.beginPath(); c.rect(P.x, P.y, P.w, P.h); c.clip();
  SCENES[cues.id][sc.id](c, { t: Math.max(0, T - sc.start), L, dur: sc.end - sc.start, T });
  c.restore();
  cast(c, cues, T);
  fadeIn(c, T - sc.start);
  if (T > cues.duration - 1.2) { c.fillStyle = `rgba(0,0,0,${clamp((T - (cues.duration - 1.2)) / 1.2)})`; c.fillRect(0, 0, W, H); }
}
