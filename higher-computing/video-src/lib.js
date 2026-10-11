/* Shared drawing kit for the explainer videos. Everything is a pure function of
   time so any frame can be rendered independently (and re-rendered identically). */
"use strict";
const W = 1280, H = 720;
const COL = {
  navy: "#12284a", navy2: "#1c3b66", paper: "#f4ecd8", paper2: "#e7dcbf", ink: "#1d1a14", ink2: "#4a4234",
  red: "#b3261e", glow: "#ff4b3a", grass: "#4f8a2e", dirt: "#7a5532", gold: "#e0b23a", sea: "#1d6a80",
  sky: "#5b8fc7", grey: "#6b6b6b", white: "#ffffff", purple: "#7b5bb5", blue: "#2f6fb5",
};
const PANEL = { x: 40, y: 96, w: 1200, h: 436 };
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const prog = (t, at, dur = 0.6) => clamp((t - at) / dur);
const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const lerp = (a, b, p) => a + (b - a) * p;

function txt(c, s, x, y, o = {}) {
  c.save();
  c.font = `${o.weight || 400} ${o.size || 28}px ${o.font || "'Atkinson Hyperlegible'"}`;
  c.fillStyle = o.color || COL.ink;
  c.textAlign = o.align || "left";
  c.textBaseline = o.base || "alphabetic";
  c.globalAlpha = o.alpha == null ? 1 : o.alpha;
  if (o.shadow) { c.shadowColor = "rgba(0,0,0,.45)"; c.shadowOffsetX = 3; c.shadowOffsetY = 3; }
  c.fillText(s, x, y);
  c.restore();
}
// Pixelify's "5" reads as "S", so its digits come from JetBrains Mono (same trick as the site's "HC Digits").
// Below ~40px Pixelify's capital "C" reads as "O", so small labels use Atkinson Hyperlegible bold.
const px = (c, s, x, y, o = {}) => txt(c, s, x, y, (o.size || 28) < 40
  ? { weight: 700, ...o, font: "'Atkinson Hyperlegible'" }
  : { font: "'HC Digits', 'Pixelify Sans'", weight: 700, ...o });
const mono = (c, s, x, y, o = {}) => txt(c, s, x, y, { font: "'JetBrains Mono'", ...o });

function rect(c, x, y, w, h, fill, stroke, lw = 3, alpha = 1) {
  c.save(); c.globalAlpha = alpha;
  if (fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); }
  c.restore();
}
// a Minecraft-style bevelled block
function block(c, x, y, w, h, fill, alpha = 1) {
  c.save(); c.globalAlpha = alpha;
  c.fillStyle = fill; c.fillRect(x, y, w, h);
  c.fillStyle = "rgba(255,255,255,.28)"; c.fillRect(x, y, w, 4); c.fillRect(x, y, 4, h);
  c.fillStyle = "rgba(0,0,0,.32)"; c.fillRect(x, y + h - 5, w, 5); c.fillRect(x + w - 5, y, 5, h);
  c.strokeStyle = "rgba(0,0,0,.6)"; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  c.restore();
}
function arrow(c, x1, y1, x2, y2, col = COL.ink, w = 4, head = 14) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2 - Math.cos(a) * head * 0.8, y2 - Math.sin(a) * head * 0.8); c.stroke();
  c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - head * Math.cos(a - 0.45), y2 - head * Math.sin(a - 0.45)); c.lineTo(x2 - head * Math.cos(a + 0.45), y2 - head * Math.sin(a + 0.45)); c.closePath(); c.fill();
  c.restore();
}
function tick(c, x, y, s = 1, col = COL.grass) { c.save(); c.strokeStyle = col; c.lineWidth = 8 * s; c.lineCap = "square"; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 14 * s, y + 14 * s); c.lineTo(x + 40 * s, y - 18 * s); c.stroke(); c.restore(); }
function cross(c, x, y, s = 1, col = COL.red) { c.save(); c.strokeStyle = col; c.lineWidth = 8 * s; c.beginPath(); c.moveTo(x - 16 * s, y - 16 * s); c.lineTo(x + 16 * s, y + 16 * s); c.moveTo(x + 16 * s, y - 16 * s); c.lineTo(x - 16 * s, y + 16 * s); c.stroke(); c.restore(); }

// pixel sprite from a string map; legend maps chars to colours ('.' = transparent)
function sprite(c, rows, legend, x, y, k) {
  rows.forEach((r, j) => [...r].forEach((ch, i) => { const col = legend[ch]; if (col) { c.fillStyle = col; c.fillRect(x + i * k, y + j * k, k, k); } }));
}
const ALBA = [
  "....bbbbbbbb....",
  "...bbbbbbbbbb...",
  "..bbbbbbbbybbb..",
  "..hhhhhhhhhhhh..",
  "..hssssssssssh..",
  "..hsseessseesh..",
  "..hsssssssssshh.",
  "..hsssssnsssshh.",
  "..hsssMMMMsssh..",
  "...sssssssssshh.",
  "....ssssssss.hh.",
  "..UUUUwwwwUUUU..",
  ".UUUUUwddwUUUUU.",
  ".UUyUUwddwUUyUU.",
  ".UUUUUUddUUUUUU.",
  ".UUUUUUUUUUUUUU.",
];
const HAMISH = [
  ".....kkkkkk.....",
  "..kkkkkkkkkkkk..",
  ".kkkkkkgkkkkkkk.",
  "...GGGGGGGGGG...",
  "...wsssssssssw..",
  "..wsseessseessw.",
  "..wssssssssssw..",
  "..wsssssnssssw..",
  "..wwssMMMMsswww.",
  "...wwwwwwwwwww..",
  "....wwwwwwww....",
  "..NNNNwwwwNNNN..",
  ".GGGNNwddwNNGGG.",
  ".NNNNNwddwNNNNN.",
  ".NNNNNNddNNNNNN.",
  ".NNNNNyNNyNNNNN.",
];
const FOX = [
  "..o..........o..",
  ".ooo........ooo.",
  ".ooooooooooooo..",
  ".oooeooooooeooo.",
  "..ooooooooooooo.",
  "...owwwwwwwwo...",
  "....wwwkkwww....",
  ".....wwwwww.....",
  "....bbbbbbbb....",
  "...bbbbbbbbbb...",
  "...bbrbbbbrbb...",
  "...bbbbbbbbbb...",
];
function portrait(c, who, x, y, speaking, t, label) {
  const k = 6, map = who === "A" ? ALBA : HAMISH;
  const mouthOpen = speaking && Math.floor(t * 9) % 2 === 0;
  const legend = { b: "#1f3f6e", y: "#e0b23a", h: "#6b3e1f", s: "#f1c9a5", e: "#1d1a14", n: "#d9a982", M: mouthOpen ? "#7a2018" : "#c98a73", U: "#5b7fb0", w: who === "A" ? "#dfe7f0" : "#f2f2f2", d: "#1d1a14", k: "#141414", g: "#e0b23a", G: "#e0b23a", N: "#1a2747" };
  c.save();
  c.globalAlpha = speaking ? 1 : 0.55;
  block(c, x - 8, y - 8, 16 * k + 16, 16 * k + 16, speaking ? "#2b5a8f" : "#3a3f4c");
  sprite(c, map, legend, x, y, k);
  c.restore();
  const tagW = 236, tx = who === "A" ? x + 16 * k + 18 : x - tagW - 18;
  rect(c, tx, y + 34, tagW, 30, speaking ? COL.gold : "#555");
  px(c, label, tx + 10, y + 56, { size: 17, color: speaking ? COL.ink : "#ddd", weight: 700 });
}

// the frame every scene sits in
function stage(c, cues, t, sceneLabel) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0e1f3a"); g.addColorStop(1, "#1c3b66");
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // starfield of pixel "sky blocks"
  for (let i = 0; i < 40; i++) { const sx = (i * 197) % W, sy = (i * 83) % 80; c.fillStyle = `rgba(255,255,255,${0.08 + (i % 5) * 0.03})`; c.fillRect(sx, sy, 3, 3); }
  // title bar
  px(c, "BLOCKS, WINGS & BROADSIDES", 40, 46, { size: 22, color: COL.gold });
  px(c, cues.title.toUpperCase(), 40, 76, { size: 18, color: "#cfd6e6", weight: 400 });
  if (sceneLabel) px(c, sceneLabel, W - 40, 62, { size: 22, color: "#fff", align: "right" });
  // parchment panel with block border
  block(c, PANEL.x - 10, PANEL.y - 10, PANEL.w + 20, PANEL.h + 20, COL.dirt);
  rect(c, PANEL.x, PANEL.y, PANEL.w, PANEL.h, COL.paper);
  // grass strip
  c.fillStyle = COL.grass; c.fillRect(0, H - 22, W, 22);
  c.fillStyle = COL.dirt; c.fillRect(0, H - 10, W, 10);
  for (let i = 0; i < W; i += 32) { c.fillStyle = "rgba(0,0,0,.15)"; c.fillRect(i, H - 22, 16, 4); }
}
function speaker(cues, t) {
  const l = cues.lines.find((x) => t >= x.start && t < x.end);
  return l ? l.voice : null;
}
function cast(c, cues, t) {
  const sp = speaker(cues, t);
  const usesH = cues.lines.some((l) => l.voice === "H");
  portrait(c, "A", 48, 572, sp === "A", t, "Flt Lt Alba Murray");
  if (usesH) portrait(c, "H", W - 48 - 96, 572, sp === "H", t, "Capt. Hamish Blackwood");
}
// a redstone lamp with a place value label
function lamp(c, x, y, on, label, o = {}) {
  const s = o.size || 92;
  block(c, x, y, s, s, "#4a3a2a");
  c.save();
  if (on) { c.shadowColor = "rgba(255,80,50,.9)"; c.shadowBlur = 28; }
  c.fillStyle = on ? COL.glow : "#5a2a20"; c.fillRect(x + 18, y + 18, s - 36, s - 36);
  c.restore();
  if (on) { c.fillStyle = "#ffd0c8"; c.fillRect(x + 26, y + 26, 12, 12); }
  mono(c, on ? "1" : "0", x + s / 2, y + s / 2 + 12, { size: 30, color: on ? "#fff" : "#c9a59a", align: "center", weight: 700 });
  if (label != null) px(c, String(label), x + s / 2, y - 14, { size: o.labelSize || 26, color: o.labelColor || COL.ink, align: "center" });
}
function fadeIn(c, t, dur = 0.35) {
  if (t < dur) { c.fillStyle = `rgba(0,0,0,${1 - t / dur})`; c.fillRect(0, 0, W, H); }
}
function badge(c, x, y, w, text, col, alpha = 1) {
  c.save(); c.globalAlpha = alpha;
  block(c, x, y, w, 64, col);
  px(c, text, x + w / 2, y + 42, { size: 24, color: "#fff", align: "center", shadow: true });
  c.restore();
}
