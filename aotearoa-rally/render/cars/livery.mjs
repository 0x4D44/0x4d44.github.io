// Livery atlas (2048x1024 canvas): left side | right side / top | front+rear. Planar UV projection (pure) +
// canvas painting (browser). Sponsors are fictional.
export const ATLAS_W = 2048, ATLAS_H = 1024;
const TILE = 1024, TILE_H = 512, MARGIN = 0.06, TOPY = 1.55;

function ppmOf(d) { return TILE / (d.L + 2 * MARGIN); }

/** Planar UV for a point with normal n, chosen by dominant axis. Returns [u, v] (flipY = false). */
export function liveryUV(d, x, y, z, nx, ny, nz) {
  const ppm = ppmOf(d), zMin = d.zF - MARGIN, zMax = d.zR + MARGIN;
  const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
  let px, py;
  if (ax >= ay && ax >= az) {
    py = (TOPY - y) * ppm;
    px = nx < 0 ? (z - zMin) * ppm : TILE + (zMax - z) * ppm;
  } else if (ay >= az) {
    if (ny < 0) return [0.003, 0.003];
    px = (z - zMin) * ppm; py = TILE_H + (x + d.hw + 0.2) * ppm;
  } else {
    py = TILE_H + (TOPY - y) * ppm;
    px = nz < 0 ? TILE + (d.hw + 0.1 - x) * ppm : TILE + 512 + (x + d.hw + 0.1) * ppm;
  }
  return [Math.min(0.999, Math.max(0.001, px / ATLAS_W)), Math.min(0.999, Math.max(0.001, py / ATLAS_H))];
}

const hex = (n) => "#" + (n >>> 0).toString(16).padStart(6, "0").slice(-6);
const lum = (n) => (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
const SPONSORS2 = ["RIMU OIL", "KOWHAI TYRES", "NGAIO MUTUAL", "MANUKA PARTS", "TAWA FREIGHT"];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Paint the livery atlas into `canvas` (2048x1024). */
export function drawLivery(canvas, d, spec, livery, number) {
  const ctx = canvas.getContext("2d");
  canvas.width = ATLAS_W; canvas.height = ATLAS_H;
  const body = hex(livery.body), accent = hex(livery.accent);
  const ink = lum(livery.body) > 0.55 ? "#101216" : "#f4f4f2";
  const ppm = ppmOf(d);
  const txt = (s, x, y, px, col, align = "left", skew = -0.12) => {
    ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, skew, 1, 0, 0);
    ctx.font = `900 ${px}px "Arial Black", Impact, "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = "alphabetic"; ctx.fillStyle = col; ctx.fillText(s, 0, 0); ctx.restore();
  };
  ctx.fillStyle = body; ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  // subtle vertical gradient: slightly darker lower body so the paint reads as curved
  for (const x0 of [0, TILE]) {
    const g = ctx.createLinearGradient(0, 0, 0, TILE_H);
    g.addColorStop(0, "rgba(255,255,255,0.05)"); g.addColorStop(0.55, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = g; ctx.fillRect(x0, 0, TILE, TILE_H);
  }
  const doorT = (d.cabin.t0 + d.cabin.rs) / 2 + (d.S.doors === 4 ? 0 : 0.03);
  const doorXd = d.zAt(doorT) - d.zF; // metres from the front
  const style = spec.id;

  // ---- side tiles
  for (const facing of [1, -1]) {
    const x0 = facing > 0 ? 0 : TILE;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, 0, TILE, TILE_H); ctx.clip();
    ctx.translate(x0 + MARGIN * ppm, 0);
    const X = (xd) => (facing > 0 ? xd : d.L - xd) * ppm;
    const Y = (y) => (TOPY - y) * ppm;
    const len = d.L;
    ctx.fillStyle = accent;
    if (style === "huia") {
      // sill band with a thin pin-stripe, rising kink at the rear quarter
      ctx.beginPath(); ctx.moveTo(X(0), Y(0.18)); ctx.lineTo(X(len), Y(0.18)); ctx.lineTo(X(len), Y(0.36)); ctx.lineTo(X(len * 0.7), Y(0.36)); ctx.lineTo(X(len * 0.55), Y(0.52)); ctx.lineTo(X(0), Y(0.52)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = ink; ctx.globalAlpha = 0.85; ctx.fillRect(Math.min(X(0), X(len)), Y(0.58), Math.abs(X(len) - X(0)), 0.012 * ppm); ctx.globalAlpha = 1;
    } else if (style === "kea") {
      ctx.beginPath(); ctx.moveTo(X(len), Y(0.2)); ctx.lineTo(X(len * 0.35), Y(0.2)); ctx.lineTo(X(len * 0.6), Y(0.98)); ctx.lineTo(X(len), Y(0.98)); ctx.closePath(); ctx.fill();
      ctx.fillStyle = ink; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(X(len), Y(0.2)); ctx.lineTo(X(len * 0.31), Y(0.2)); ctx.lineTo(X(len * 0.33), Y(0.26)); ctx.lineTo(X(len), Y(0.26)); ctx.fill(); ctx.globalAlpha = 1;
    } else if (style === "takahe") {
      // koru spiral on the rear quarter + lower stripe
      ctx.fillRect(Math.min(X(0), X(len)), Y(0.34), Math.abs(X(len) - X(0)), 0.08 * ppm);
      ctx.strokeStyle = accent; ctx.lineWidth = 0.05 * ppm; ctx.lineCap = "round";
      const cx = X(len * 0.78), cy = Y(0.78);
      ctx.beginPath();
      for (let a = 0; a < 11; a += 0.1) { const r = (0.03 + 0.032 * a) * ppm * 1.2; const px = cx + Math.cos(a * facing) * r, py = cy + Math.sin(a) * r; a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx, cy, 0.035 * ppm, 0, 7); ctx.fill();
    } else {
      // piwakawaka: fantail sweep along the flank
      for (let i = 0; i < 6; i++) {
        ctx.globalAlpha = 1 - i * 0.12;
        ctx.beginPath(); ctx.moveTo(X(len * 0.02), Y(0.3 + i * 0.07)); ctx.quadraticCurveTo(X(len * 0.5), Y(0.62 + i * 0.08), X(len), Y(0.4 + i * 0.12)); ctx.lineTo(X(len), Y(0.4 + i * 0.12 + 0.05)); ctx.quadraticCurveTo(X(len * 0.5), Y(0.62 + i * 0.08 + 0.06), X(len * 0.02), Y(0.3 + i * 0.07 + 0.045)); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // door number plate
    const px = X(doorXd), py = Y(0.84);
    ctx.fillStyle = "#f2f2ee"; rr(ctx, px - 0.2 * ppm, py - 0.17 * ppm, 0.4 * ppm, 0.34 * ppm, 0.04 * ppm); ctx.fill();
    ctx.lineWidth = 0.014 * ppm; ctx.strokeStyle = accent; ctx.stroke();
    txt(String(number), px + 0.0, py + 0.1 * ppm, 0.3 * ppm, "#111", "center", 0);
    // sponsor on the rear quarter + second sponsor lower on the front door sill
    const sponsor = (livery.sponsor || "").toUpperCase();
    txt(sponsor, X(len * 0.74), Y(0.66), 0.095 * ppm, ink, "center");
    txt(SPONSORS2[(number | 0) % SPONSORS2.length], X(len * 0.2), Y(0.24), 0.07 * ppm, ink, "center");
    txt("AOTEAROA RALLY", X(len * 0.5), Y(0.12), 0.05 * ppm, ink, "center", 0);
    ctx.restore();
  }

  // ---- top tile: roof, bonnet, boot
  ctx.save();
  ctx.beginPath(); ctx.rect(0, TILE_H, TILE, TILE_H); ctx.clip();
  const TX = (z) => (z - (d.zF - MARGIN)) * ppm;
  const TV = (x) => TILE_H + (x + d.hw + 0.2) * ppm;
  ctx.fillStyle = accent;
  const cx0 = TV(-0.18), cw = 0.36 * ppm;
  if (style === "huia") { ctx.fillRect(TX(d.zF), cx0, (d.zR - d.zF) * ppm, 0.14 * ppm); ctx.fillRect(TX(d.zF), TV(0.04), (d.zR - d.zF) * ppm, 0.14 * ppm); }
  else if (style === "kea") { ctx.fillRect(TX(d.zF), cx0 - 0.1 * ppm, (d.zR - d.zF) * ppm, cw * 1.4); ctx.fillStyle = ink; ctx.fillRect(TX(d.zF), TV(-0.02), (d.zR - d.zF) * ppm, 0.04 * ppm); }
  else if (style === "takahe") { ctx.fillRect(TX(d.zF), cx0, (d.zR - d.zF) * ppm, cw); ctx.fillStyle = body; ctx.fillRect(TX(d.zF), TV(-0.025), (d.zR - d.zF) * ppm, 0.05 * ppm); }
  else { ctx.beginPath(); ctx.moveTo(TX(d.zF), TV(-0.3)); ctx.lineTo(TX(d.zR), TV(-0.12)); ctx.lineTo(TX(d.zR), TV(0.12)); ctx.lineTo(TX(d.zF), TV(0.3)); ctx.closePath(); ctx.fill(); }
  // bonnet number plate and sponsor, roof number
  const bz = (d.zAt(d.S.bonnetT[0]) + d.zAt(d.S.bonnetT[1])) / 2;
  ctx.fillStyle = "#f2f2ee"; rr(ctx, TX(bz) - 0.22 * ppm, TV(0) - 0.17 * ppm, 0.44 * ppm, 0.34 * ppm, 0.04 * ppm); ctx.fill();
  txt(String(number), TX(bz) + 0, TV(0) + 0.1 * ppm, 0.3 * ppm, "#111", "center", 0);
  const rz = d.zAt((d.cabin.rs + d.cabin.re) / 2);
  ctx.save(); ctx.translate(TX(rz), TV(0)); ctx.fillStyle = ink; ctx.font = `900 ${0.34 * ppm}px "Arial Black", Impact, Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(number), 0, 0); ctx.restore();
  txt((livery.sponsor || "").toUpperCase(), TX(d.zAt(d.S.bonnetT[0] + 0.05)), TV(0.43), 0.08 * ppm, ink, "left", 0);
  txt(SPONSORS2[((number | 0) + 1) % SPONSORS2.length], TX(d.zAt(0.9)), TV(-0.38), 0.08 * ppm, ink, "center", 0);
  ctx.restore();

  // ---- end tile: front | rear
  ctx.save();
  ctx.beginPath(); ctx.rect(TILE, TILE_H, TILE, TILE_H); ctx.clip();
  const EY = (y) => TILE_H + (TOPY - y) * ppm;
  ctx.fillStyle = accent;
  for (const x0 of [TILE, TILE + 512]) {
    const ex = (x) => x0 + (x + d.hw + 0.1) * ppm;
    ctx.fillRect(ex(-d.hw), EY(0.5), d.W * ppm, 0.09 * ppm);
    ctx.fillStyle = "#f2f2ee"; rr(ctx, ex(0) - 0.25 * ppm, EY(0.45) + 0.0, 0.5 * ppm, 0.12 * ppm, 0.02 * ppm); ctx.fill(); ctx.fillStyle = accent;
  }
  txt(String(number), TILE + (0.1) * ppm + 0.0, EY(0.72), 0.2 * ppm, ink, "left", 0);
  txt((livery.sponsor || "").toUpperCase(), TILE + 512 + 0.1 * ppm, EY(0.62), 0.08 * ppm, ink, "left", 0);
  ctx.restore();

  // fade the lowest part of each side towards darker rocker panels
  return canvas;
}
