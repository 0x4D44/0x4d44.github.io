// Highland Fling - canvas-painted roadside adverts (parody brands only). Each ad: colours, headline, strapline, small print, little cartoon.
import { TAU } from "./highland-geo.js";

const circ = (g, x, y, r, f) => { g.beginPath(); g.arc(x, y, r, 0, TAU); if (f) { g.fillStyle = f; g.fill(); } };
const ell = (g, x, y, rx, ry, f, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); if (f) { g.fillStyle = f; g.fill(); } };
const rr = (g, x, y, w, h, r, f) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); if (f) { g.fillStyle = f; g.fill(); } };
const poly = (g, pts, f) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); if (f) { g.fillStyle = f; g.fill(); } };

// each art fn draws inside the unit box [0,0]-[1,1] scaled by s around origin (g already translated/scaled)
const ART = {
  haggis(g) { ell(g, 0.5, 0.62, 0.42, 0.28, "#6b4426"); for (let i = 0; i < 18; i++) circ(g, 0.2 + (i * 0.37 % 0.6), 0.5 + (i * 0.23 % 0.25), 0.03, "#8a5c36"); ell(g, 0.5, 0.58, 0.44, 0.06, "rgba(0,0,0,0.0)"); g.strokeStyle = "#e8d070"; g.lineWidth = 0.035; g.beginPath(); g.moveTo(0.1, 0.62); g.quadraticCurveTo(0.5, 0.95, 0.9, 0.62); g.stroke(); circ(g, 0.3, 0.55, 0.035, "#fff"); circ(g, 0.3, 0.55, 0.015, "#111"); g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 0.02; for (const x of [0.4, 0.55, 0.7]) { g.beginPath(); g.moveTo(x, 0.3); g.bezierCurveTo(x - 0.06, 0.22, x + 0.06, 0.15, x, 0.05); g.stroke(); } },
  midge(g) { for (let i = 0; i < 40; i++) { const a = i * 2.4, r = 0.08 + (i * 0.37 % 0.38), x = 0.5 + Math.cos(a) * r, y = 0.5 + Math.sin(a) * r * 0.9; ell(g, x, y, 0.014, 0.01, "#111"); ell(g, x - 0.012, y - 0.014, 0.015, 0.006, "rgba(30,30,30,0.5)", 0.6); ell(g, x + 0.012, y - 0.014, 0.015, 0.006, "rgba(30,30,30,0.5)", -0.6); } circ(g, 0.5, 0.5, 0.11, "#2a2a2a"); ell(g, 0.35, 0.4, 0.14, 0.05, "rgba(200,220,255,0.7)", -0.5); ell(g, 0.65, 0.4, 0.14, 0.05, "rgba(200,220,255,0.7)", 0.5); circ(g, 0.46, 0.48, 0.03, "#ff3030"); circ(g, 0.54, 0.48, 0.03, "#ff3030"); },
  girder(g) { rr(g, 0.36, 0.18, 0.28, 0.76, 0.06, "#e8741a"); rr(g, 0.42, 0.04, 0.16, 0.16, 0.03, "#8a4a14"); rr(g, 0.38, 0.4, 0.24, 0.32, 0.02, "#f4e8d0"); g.strokeStyle = "#a84a10"; g.lineWidth = 0.025; g.strokeRect(0.4, 0.43, 0.2, 0.26); g.beginPath(); g.moveTo(0.4, 0.43); g.lineTo(0.6, 0.69); g.moveTo(0.6, 0.43); g.lineTo(0.4, 0.69); g.stroke(); g.fillStyle = "#555"; g.fillRect(0.08, 0.84, 0.84, 0.05); g.fillRect(0.14, 0.78, 0.72, 0.03); for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0.14 + i * 0.12, 0.89); g.lineTo(0.2 + i * 0.12, 0.78); g.stroke(); } },
  fry(g) { ell(g, 0.5, 0.78, 0.4, 0.12, "#555"); rr(g, 0.15, 0.55, 0.7, 0.22, 0.05, "#c0c0c8"); ell(g, 0.5, 0.55, 0.35, 0.05, "#e8a020"); for (let i = 0; i < 9; i++) rr(g, 0.2 + i * 0.07, 0.18 + (i % 3) * 0.04, 0.045, 0.34, 0.015, i % 2 ? "#f2c24a" : "#e8a82a"); ell(g, 0.5, 0.3, 0.2, 0.1, "#58b040"); ell(g, 0.45, 0.26, 0.12, 0.07, "#7ad060"); g.strokeStyle = "#444"; g.lineWidth = 0.025; g.beginPath(); g.moveTo(0.85, 0.6); g.lineTo(1.0, 0.4); g.stroke(); },
  nessie(g) { rr(g, 0, 0.72, 1, 0.28, 0.02, "#2e6a8c"); g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 0.02; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0.05 + i * 0.25, 0.8 + (i % 2) * 0.08); g.quadraticCurveTo(0.15 + i * 0.25, 0.76, 0.25 + i * 0.25, 0.8 + (i % 2) * 0.08); g.stroke(); } g.fillStyle = "#4a6a4f"; g.beginPath(); g.ellipse(0.28, 0.74, 0.14, 0.11, 0, Math.PI, 0); g.fill(); g.beginPath(); g.ellipse(0.55, 0.74, 0.12, 0.09, 0, Math.PI, 0); g.fill(); g.lineWidth = 0.09; g.strokeStyle = "#4a6a4f"; g.lineCap = "round"; g.beginPath(); g.moveTo(0.78, 0.74); g.bezierCurveTo(0.8, 0.5, 0.74, 0.35, 0.82, 0.2); g.stroke(); ell(g, 0.85, 0.18, 0.07, 0.05, "#4a6a4f"); circ(g, 0.87, 0.16, 0.012, "#fff"); g.lineWidth = 0.02; g.strokeStyle = "#ffe0a0"; g.setLineDash([0.03, 0.03]); g.strokeRect(0.02, 0.02, 0.2, 0.14); g.setLineDash([]); },
  rain(g) { for (const [x, y, r] of [[0.3, 0.3, 0.2], [0.5, 0.25, 0.25], [0.72, 0.32, 0.2], [0.5, 0.38, 0.22]]) circ(g, x, y, r, "#8a96a2"); g.strokeStyle = "#5aa0d8"; g.lineWidth = 0.025; g.lineCap = "round"; for (let i = 0; i < 12; i++) { const x = 0.15 + i * 0.065, y = 0.58 + (i % 3) * 0.12; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 0.03, y + 0.1); g.stroke(); } rr(g, 0.42, 0.62, 0.16, 0.05, 0.02, "#c8102e"); },
  tyre(g) { circ(g, 0.5, 0.5, 0.45, "#1e1e22"); const t = 0.3; g.save(); g.beginPath(); g.arc(0.5, 0.5, 0.36, 0, TAU); g.clip(); const cols = ["#9b1c24", "#0c5a32", "#e8e0b0", "#173a72"]; for (let i = -8; i < 8; i++) { g.fillStyle = cols[(i + 8) % 4]; g.globalAlpha = 0.9; g.fillRect(0.5 + i * 0.055, 0, 0.03, 1); g.fillRect(0, 0.5 + i * 0.055, 1, 0.03); } g.restore(); circ(g, 0.5, 0.5, 0.14, "#1e1e22"); circ(g, 0.5, 0.5, 0.07, "#aaa"); ell(g, 0.78, 0.8, 0.14, 0.1, "#f6f2e6"); circ(g, 0.9, 0.76, 0.05, "#222"); },
  wind(g) { poly(g, [[0.15, 0.9], [0.2, 0.45], [0.3, 0.45], [0.3, 0.3], [0.38, 0.3], [0.38, 0.2], [0.46, 0.2], [0.46, 0.3], [0.54, 0.3], [0.54, 0.45], [0.65, 0.45], [0.7, 0.9]], "#6a645c"); g.strokeStyle = "#fff"; g.lineWidth = 0.03; g.lineCap = "round"; for (const [y, l] of [[0.25, 0.5], [0.45, 0.6], [0.65, 0.45]]) { g.beginPath(); g.moveTo(0.1, y); g.bezierCurveTo(0.3 + l * 0.3, y - 0.1, 0.5 + l * 0.3, y + 0.1, 0.5 + l * 0.5, y - 0.02); g.stroke(); } ell(g, 0.8, 0.12, 0.13, 0.04, "#222"); rr(g, 0.74, 0.04, 0.12, 0.08, 0.02, "#222"); },
  whisky(g) { rr(g, 0.1, 0.25, 0.22, 0.7, 0.04, "#c27a24"); rr(g, 0.15, 0.08, 0.12, 0.2, 0.02, "#a2661a"); rr(g, 0.13, 0.5, 0.16, 0.2, 0.01, "#f3e8c8"); g.beginPath(); g.moveTo(0.46, 0.4); g.lineTo(0.88, 0.4); g.lineTo(0.82, 0.92); g.lineTo(0.52, 0.92); g.closePath(); g.fillStyle = "rgba(220,230,240,0.6)"; g.fill(); poly(g, [[0.48, 0.58], [0.86, 0.58], [0.82, 0.9], [0.52, 0.9]], "#d68a24"); ell(g, 0.52, 0.22, 0.12, 0.05, "#fff"); ell(g, 0.7, 0.25, 0.1, 0.04, "#f6e8c8"); circ(g, 0.82, 0.18, 0.08, "#f4c040"); },
  cheer(g) { circ(g, 0.5, 0.58, 0.36, "#ffd23c"); circ(g, 0.38, 0.5, 0.045, "#222"); circ(g, 0.62, 0.5, 0.045, "#222"); g.strokeStyle = "#222"; g.lineWidth = 0.035; g.lineCap = "round"; g.beginPath(); g.arc(0.5, 0.58, 0.2, 0.2, Math.PI - 0.2); g.stroke(); circ(g, 0.3, 0.2, 0.12, "#8a96a2"); circ(g, 0.45, 0.14, 0.14, "#8a96a2"); circ(g, 0.6, 0.2, 0.12, "#8a96a2"); g.strokeStyle = "#5aa0d8"; g.lineWidth = 0.02; for (const x of [0.32, 0.46, 0.6]) { g.beginPath(); g.moveTo(x, 0.34); g.lineTo(x - 0.02, 0.42); g.stroke(); } },
  shortbread(g) { for (let i = 0; i < 3; i++) { g.save(); g.translate(0.5, 0.52); g.rotate(-0.5 + i * 0.5); rr(g, -0.1, -0.42, 0.2, 0.84, 0.03, "#e8c46a"); g.fillStyle = "#c89a3c"; for (let k = 0; k < 8; k++) g.fillRect(-0.07, -0.36 + k * 0.1, 0.14, 0.012); g.restore(); } poly(g, [[0.1, 0.9], [0.9, 0.9], [0.9, 0.96], [0.1, 0.96]], "#0f2a52"); },
  pipes(g) { ell(g, 0.5, 0.62, 0.28, 0.2, "#2a6a3a"); g.strokeStyle = "#c8102e"; g.lineWidth = 0.025; g.beginPath(); g.ellipse(0.5, 0.62, 0.22, 0.14, 0.2, 0, TAU); g.stroke(); g.fillStyle = "#222"; for (const [x, h] of [[0.35, 0.55], [0.5, 0.7], [0.65, 0.5]]) { g.fillRect(x - 0.018, 0.5 - h * 0.6, 0.036, h * 0.6); g.fillStyle = "#c8a030"; g.fillRect(x - 0.025, 0.5 - h * 0.6, 0.05, 0.03); g.fillStyle = "#222"; } g.save(); g.translate(0.5, 0.78); g.rotate(0.25); g.fillRect(-0.02, 0, 0.04, 0.2); g.restore(); g.fillStyle = "#222"; g.font = "bold 0.14px sans-serif"; },
  coo(g) { circ(g, 0.5, 0.58, 0.3, "#c4631f"); ell(g, 0.5, 0.45, 0.3, 0.2, "#8a3e12"); g.strokeStyle = "#f2e8c8"; g.lineWidth = 0.06; g.lineCap = "round"; g.beginPath(); g.moveTo(0.22, 0.46); g.bezierCurveTo(0.02, 0.4, 0.04, 0.2, 0.14, 0.12); g.moveTo(0.78, 0.46); g.bezierCurveTo(0.98, 0.4, 0.96, 0.2, 0.86, 0.12); g.stroke(); ell(g, 0.5, 0.78, 0.13, 0.1, "#e8c8a0"); circ(g, 0.45, 0.78, 0.015, "#222"); circ(g, 0.55, 0.78, 0.015, "#222"); circ(g, 0.38, 0.55, 0.025, "#111"); circ(g, 0.62, 0.55, 0.025, "#111"); poly(g, [[0.5, 0.0], [0.6, 0.2], [0.4, 0.2]], "rgba(0,0,0,0)"); },
  kilt(g) { poly(g, [[0.2, 0.2], [0.8, 0.2], [0.92, 0.9], [0.08, 0.9]], "#9b1c24"); g.strokeStyle = "#0c5a32"; g.lineWidth = 0.035; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0.2 + i * 0.12, 0.2); g.lineTo(0.12 + i * 0.152, 0.9); g.stroke(); } g.strokeStyle = "#0f2a52"; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0.12, 0.35 + i * 0.15); g.lineTo(0.88, 0.35 + i * 0.15); g.stroke(); } rr(g, 0.2, 0.14, 0.6, 0.07, 0.02, "#2a1a10"); ell(g, 0.5, 0.36, 0.07, 0.08, "#f2f0e6"); g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 0.02; g.beginPath(); g.moveTo(0.02, 0.5); g.bezierCurveTo(0.1, 0.4, 0.14, 0.6, 0.06, 0.7); g.stroke(); },
  porridge(g) { g.beginPath(); g.ellipse(0.5, 0.55, 0.4, 0.14, 0, 0, TAU); g.fillStyle = "#e8d8b8"; g.fill(); g.beginPath(); g.moveTo(0.1, 0.55); g.quadraticCurveTo(0.5, 1.15, 0.9, 0.55); g.fillStyle = "#2a6a8a"; g.fill(); ell(g, 0.5, 0.55, 0.34, 0.09, "#cdb88a"); circ(g, 0.38, 0.52, 0.02, "#f4f0e0"); circ(g, 0.6, 0.57, 0.02, "#f4f0e0"); g.strokeStyle = "#a07040"; g.lineWidth = 0.04; g.lineCap = "round"; g.beginPath(); g.moveTo(0.62, 0.5); g.lineTo(0.88, 0.1); g.stroke(); circ(g, 0.9, 0.08, 0.05, "#a07040"); rr(g, 0.7, 0.18, 0.12, 0.08, 0.02, "#fff"); },
  glasses(g) { g.lineWidth = 0.045; g.strokeStyle = "#222"; circ(g, 0.3, 0.5, 0.2); g.stroke(); circ(g, 0.7, 0.5, 0.2); g.stroke(); g.beginPath(); g.moveTo(0.5, 0.45); g.quadraticCurveTo(0.5, 0.4, 0.5, 0.45); g.stroke(); ell(g, 0.3, 0.5, 0.17, 0.17, "rgba(180,220,255,0.5)"); ell(g, 0.7, 0.5, 0.17, 0.17, "rgba(180,220,255,0.5)"); g.fillStyle = "#4a6a4f"; g.beginPath(); g.ellipse(0.7, 0.62, 0.1, 0.08, 0, Math.PI, 0); g.fill(); g.beginPath(); g.moveTo(0.1, 0.45); g.lineTo(0.0, 0.35); g.moveTo(0.9, 0.45); g.lineTo(1.0, 0.35); g.stroke(); ell(g, 0.3, 0.5, 0.05, 0.07, "#4a2a10"); },
  safari(g) { ell(g, 0.5, 0.62, 0.3, 0.2, "#6b4426"); ell(g, 0.78, 0.55, 0.12, 0.1, "#6b4426"); circ(g, 0.82, 0.52, 0.02, "#fff"); g.strokeStyle = "#3a2410"; g.lineWidth = 0.04; g.lineCap = "round"; for (const x of [0.32, 0.45]) { g.beginPath(); g.moveTo(x, 0.78); g.lineTo(x, 0.95); g.stroke(); } for (const x of [0.58, 0.7]) { g.beginPath(); g.moveTo(x, 0.78); g.lineTo(x, 0.86); g.stroke(); } poly(g, [[0.05, 0.2], [0.35, 0.2], [0.5, 0.05], [0.2, 0.05]], "#e8d8a0"); rr(g, 0.05, 0.2, 0.3, 0.1, 0.02, "#b89a50"); },
  net(g) { g.strokeStyle = "#173a72"; g.lineWidth = 0.04; g.lineCap = "round"; for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(0.5, 0.82, i * 0.17, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); } circ(g, 0.5, 0.82, 0.05, "#173a72"); ell(g, 0.12, 0.88, 0.1, 0.04, "#cfe8f4"); ell(g, 0.88, 0.9, 0.1, 0.03, "#cfe8f4"); },
  seasons(g) { const q = (x, y, c) => { g.save(); g.beginPath(); g.rect(x, y, 0.5, 0.5); g.clip(); g.fillStyle = c; g.fillRect(x, y, 0.5, 0.5); g.restore(); }; q(0, 0, "#9ad4f0"); q(0.5, 0, "#e8e0c0"); q(0, 0.5, "#8a96a2"); q(0.5, 0.5, "#c8d8e8"); circ(g, 0.25, 0.25, 0.1, "#ffd23c"); g.strokeStyle = "#5aa0d8"; g.lineWidth = 0.02; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(0.1 + i * 0.1, 0.62); g.lineTo(0.07 + i * 0.1, 0.72); g.stroke(); } for (let i = 0; i < 6; i++) circ(g, 0.58 + (i * 0.37 % 0.36), 0.58 + (i * 0.23 % 0.32), 0.022, "#fff"); g.strokeStyle = "#e8741a"; g.lineWidth = 0.04; g.beginPath(); g.moveTo(0.62, 0.45); g.quadraticCurveTo(0.8, 0.15, 0.95, 0.4); g.stroke(); g.strokeStyle = "#c8102e"; g.beginPath(); g.moveTo(0.67, 0.45); g.quadraticCurveTo(0.8, 0.22, 0.9, 0.43); g.stroke(); },
};

export const ADS = [
  { id: "haggis", art: "haggis", bg: ["#2c5a34", "#173a20"], hc: "#ffe08a", sc: "#ffffff", head: ["HAGGIS"], sub: "Britain's finest lump of Mystery.", sub2: "Now with 30% fewer sheep's lungs*", foot: "*Still contains 70% sheep's lungs. Serving suggestion. Do not ask the sheep." },
  { id: "midges", art: "midge", bg: ["#4a2a5a", "#1f1030"], hc: "#ff6a6a", sc: "#f4e8ff", head: ["MIDGES"], sub: "Come for the scenery, stay for the bites.", sub2: "(They will.)", foot: "Scottish Midge Board. Bites on 100% of visitors. Repellent: ineffective, and also delicious to them." },
  { id: "girder", art: "girder", bg: ["#e8741a", "#b3480c"], hc: "#fff4d0", sc: "#2a1408", head: ["GIRDER JUICE"], sub: "Made from girders.", sub2: "Scotland's other national drink.", foot: "Contains iron, rust and a hint of bridge. Drink with a tetanus booster. Not an actual girder." },
  { id: "fry", art: "fry", bg: ["#f2c24a", "#d68a14"], hc: "#7a1010", sc: "#2a1a08", head: ["DEEP-FRIED", "EVERYTHING"], sub: "Even the Salad.", foot: "Pizza. Pies. Pie-pizza. Deep-fried water*. *Not actually possible. We tried. Twice." },
  { id: "nessie", art: "nessie", bg: ["#1a4a66", "#0b2236"], hc: "#9ff0c0", sc: "#e8f6ff", head: ["NESSIE TOURS"], sub: "Definitely Not A Log.", foot: "Tours daily*. *Nessie not guaranteed. Logs guaranteed. Wellies provided; optimism not." },
  { id: "rain", art: "rain", bg: ["#7c8a98", "#4f5c68"], hc: "#ffffff", sc: "#16222e", head: ["IT'S NOT RAINING"], sub: "It's Atmospheric.", foot: "Highland Weather Bureau: 340 days of atmosphere a year. Umbrellas sold separately. Needed. Always." },
  { id: "tyres", art: "tyre", bg: ["#9b1c24", "#4a0c12"], hc: "#fff4d0", sc: "#f4e8c8", head: ["TARTAN TYRES"], sub: "Grip Like A Wet Sheep.", foot: "As approved by actual sheep. May contain traces of plaid. Not valid in puddles (all of them)." },
  { id: "wind", art: "wind", bg: ["#d8dee4", "#98a6b4"], hc: "#16365f", sc: "#16222e", head: ["VISIT EDINBURGH"], sub: "Home of the Wind.", foot: "Hold on to your hat. And your children. And, frankly, the pavement." },
  { id: "whisky", art: "whisky", bg: ["#3a2412", "#160c04"], hc: "#f4c040", sc: "#f4e0b8", head: ["AULD SMOKY"], sub: "Whisky: Breakfast of Champions.", foot: "Please drink responsibly. Please do not drive. This is, in fairness, a kart." },
  { id: "cheer", art: "cheer", bg: ["#ffd23c", "#f0a818"], hc: "#16365f", sc: "#2a1a08", head: ["CHEER UP!"], sub: "It Could Be Worse - It Could Be Raining.", sub2: "(It is.)", foot: "Official Highland Cheerfulness Programme. Cheerfulness not included. Results may vary, to gloom." },
  { id: "shortbread", art: "shortbread", bg: ["#16365f", "#0a1c38"], hc: "#f4d890", sc: "#ffffff", head: ["McCRUMBLE'S"], sub: "100% Butter. 0% Remorse.", foot: "Shortbread: a biscuit that is mostly butter, sugar and apology. Serves one. Allegedly four." },
  { id: "pipes", art: "pipes", bg: ["#2a6a3a", "#123a1e"], hc: "#ffffff", sc: "#ffe08a", head: ["PIPE DOWN?"], sub: "Never.", sub2: "Bagpipes: the sound of someone else's neighbours.", foot: "Wee Hamish's Piping Lessons. Windows sold separately. Neighbours have left the area." },
  { id: "coos", art: "coo", bg: ["#ffd23c", "#e8a010"], hc: "#111111", sc: "#111111", head: ["CAUTION: COOS"], sub: "Highland cattle have right of way.", sub2: "They know.", foot: "Do not honk. Do not make eye contact. They have seen things. The fringe is not for petting." },
  { id: "kilts", art: "kilt", bg: ["#0c5a32", "#06301a"], hc: "#fff4d0", sc: "#ffffff", head: ["KILT HIRE"], sub: "Free breeze included.", foot: "Regimental, ceremonial or casual. Ask about our 'what's worn underneath' guarantee. (No.)" },
  { id: "porridge", art: "porridge", bg: ["#e8dcc0", "#c8b88a"], hc: "#16365f", sc: "#3a2a14", head: ["PORRIDGE"], sub: "Salt. Never sugar.", sub2: "We will know.", foot: "Spurtle sold separately. Stir clockwise only. Do not ask what happens the other way." },
  { id: "opticians", art: "glasses", bg: ["#2e4a5c", "#122630"], hc: "#9ff0c0", sc: "#e8f6ff", head: ["NESSIE OPTICIANS"], sub: "See Better. Or at least see something.", foot: "Free eye test with every sighting. It was not a log. Probably." },
  { id: "safari", art: "safari", bg: ["#8a6a3a", "#4a361a"], hc: "#fff0c0", sc: "#fff8e8", head: ["WILD HAGGIS", "SAFARI"], sub: "Short legs on one side. Fast downhill.", foot: "Guides carry a warm pie as bait. Haggis not endangered. Customers occasionally." },
  { id: "broadband", art: "net", bg: ["#173a72", "#0b1c3a"], hc: "#ffd23c", sc: "#e8f0ff", head: ["GLEN-NET"], sub: "Broadband fast as a glacier.", sub2: "Sometimes.", foot: "Speeds up to 2 Mbps*. *Downhill. With a tailwind. In Ayr. Router may be a sheep." },
  { id: "seasons", art: "seasons", bg: ["#5aa0d8", "#2a5a88"], hc: "#ffffff", sc: "#ffffff", head: ["FOUR SEASONS", "IN ONE DAY"], sub: "Pack Everything.", foot: "Sun: 4 minutes. Hail: 5 minutes. Rainbow: no refunds. Midges: always." },
];

function fit(g, text, maxW, size, weight, family) {
  let s = size;
  for (; s > 8; s -= 2) { g.font = `${weight} ${s}px ${family}`; if (g.measureText(text).width <= maxW) break; }
  return s;
}
function wrap(g, text, maxW) {
  const words = text.split(" "), lines = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}

/** Paint one advert onto a fresh canvas of size W x H. */
export function paintAd(ad, W = 768, H = 384, flip = false) {
  const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, ad.bg[0]); gr.addColorStop(1, ad.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // subtle pattern: diagonal stripes
  g.globalAlpha = 0.06; g.fillStyle = "#fff"; for (let x = -H; x < W; x += 34) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 14, H); g.lineTo(x + 14 + H, 0); g.lineTo(x + H, 0); g.fill(); } g.globalAlpha = 1;
  // frame
  const m = H * 0.03; g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = H * 0.012; g.strokeRect(m, m, W - 2 * m, H - 2 * m);
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = H * 0.008; g.strokeRect(m * 1.8, m * 1.8, W - 3.6 * m, H - 3.6 * m);
  // art box (left or right), square
  const wide = W / H > 2.6, artS = H * (wide ? 0.78 : 0.62), artX = flip ? W - artS - H * 0.07 : H * 0.07, artY = H * 0.1;
  g.save(); g.translate(artX, artY); g.scale(artS, artS); g.lineWidth = 1; ART[ad.art](g); g.restore();
  const tx0 = flip ? H * 0.06 : artX + artS + H * 0.05, tx1 = flip ? artX - H * 0.05 : W - H * 0.06, tw = tx1 - tx0, cx = (tx0 + tx1) / 2;
  g.textAlign = "center"; g.textBaseline = "middle";
  const fam = "Arial Black, Impact, Arial, sans-serif";
  // headline (1-2 lines)
  const nl = ad.head.length, hMax = H * (nl > 1 ? 0.2 : 0.3);
  let y = H * (ad.sub2 ? 0.2 : 0.24);
  if (nl > 1) y -= H * 0.02;
  ad.head.forEach((line, i) => {
    const s = fit(g, line, tw, hMax * 1.3, "900", fam); g.font = `900 ${s}px ${fam}`;
    g.fillStyle = "rgba(0,0,0,0.45)"; g.fillText(line, cx + s * 0.04, y + s * 0.05); g.fillStyle = ad.hc; g.fillText(line, cx, y); y += s * 0.98;
  });
  // strapline(s)
  g.fillStyle = ad.sc;
  const subS = H * (wide ? 0.15 : 0.108); g.font = `bold ${subS}px Arial, sans-serif`;
  y += subS * 0.45;
  for (const l of wrap(g, ad.sub, tw)) { g.fillText(l, cx, y); y += subS * 1.08; }
  if (ad.sub2) { g.font = `bold italic ${subS * (ad.sub2.length > 20 ? 0.8 : 1.0)}px Arial, sans-serif`; const ls = wrap(g, ad.sub2, tw); y += subS * 0.12; for (const l of ls) { g.fillText(l, cx, y); y += subS * 1.0; } }
  // small print
  g.globalAlpha = 0.9; g.font = `${H * (wide ? 0.06 : 0.04)}px Arial, sans-serif`; g.fillStyle = ad.sc;
  const fl = wrap(g, ad.foot, W - 2 * H * 0.09), fy = H - H * 0.05 - (fl.length - 1) * H * (wide ? 0.07 : 0.047);
  g.textAlign = "center"; fl.forEach((l, i) => g.fillText(l, W / 2, fy + i * H * (wide ? 0.07 : 0.047))); g.globalAlpha = 1;
  return c;
}
