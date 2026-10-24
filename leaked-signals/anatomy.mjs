// Anatomy diagram: celestial sphere (equatorial frame) with a mast's horizon fan.
import { D2R } from "./core.mjs";

function rotate(p, yaw, pitch) {
  // world: x toward RA0, y toward RA90, z north pole. View: yaw about z, then pitch about x.
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = cy * p[0] - sy * p[1], y1 = sy * p[0] + cy * p[1], z1 = p[2];
  return [x1, cp * y1 - sp * z1, sp * y1 + cp * z1]; // x right, y depth (toward viewer negative), z up
}
const sph = (ra, dec, r = 1) => [r * Math.cos(dec) * Math.cos(ra), r * Math.cos(dec) * Math.sin(ra), r * Math.sin(dec)];

export function drawAnatomy(cv, a, col) {
  const c = cv.getContext("2d"), K = 2, W = cv.width, H = cv.height, R = Math.min(W, H) * 0.4, cx = W / 2, cy = H / 2;
  c.clearRect(0, 0, W, H);
  const P = p => { const q = rotate(p, a.yaw, a.pitch); return [cx + q[0] * R, cy - q[2] * R, q[1]]; };
  const poly = (pts, color, width, dash = []) => {
    c.strokeStyle = color; c.lineWidth = width * K; c.setLineDash(dash);
    let pen = false, last = null;
    c.beginPath();
    for (const p of pts) { const q = P(p); if (!pen) { c.moveTo(q[0], q[1]); pen = true; } else c.lineTo(q[0], q[1]); last = q; }
    c.stroke(); c.setLineDash([]);
  };
  const circ = (axis, ang, color, w, dash) => { // small circle around axis (unit) at angular radius ang
    const u = Math.abs(axis[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    let e1 = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]];
    const l = Math.hypot(...e1); e1 = e1.map(x => x / l);
    const e2 = [axis[1] * e1[2] - axis[2] * e1[1], axis[2] * e1[0] - axis[0] * e1[2], axis[0] * e1[1] - axis[1] * e1[0]];
    const pts = [];
    for (let i = 0; i <= 120; i++) { const t = i / 120 * 2 * Math.PI; pts.push([0, 1, 2].map(k => axis[k] * Math.cos(ang) + Math.sin(ang) * (e1[k] * Math.cos(t) + e2[k] * Math.sin(t)))); }
    poly(pts, color, w, dash);
  };
  // sphere outline
  c.strokeStyle = col.line; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
  // equator
  circ([0, 0, 1], Math.PI / 2, col.line, 1.2);
  // axis
  poly([[0, 0, -1.15], [0, 0, 1.15]], col.dim, 1, [2, 4]);
  c.fillStyle = col.dim; c.font = "bold 22px ui-monospace,monospace";
  const np = P([0, 0, 1.15]); c.fillText("N pole", np[0] + 5, np[1]);
  const lat = a.lat * D2R, ra = a.hour * 15 * D2R;
  const zen = sph(ra, lat);
  // declination limit circles
  const lim = Math.PI / 2 - Math.abs(lat);
  circ([0, 0, 1], Math.PI / 2 - lim, col.ink, 1, [3, 3]); circ([0, 0, 1], Math.PI / 2 + lim, col.ink, 1, [3, 3]);
  // zenith cone path (small circle of dec = lat)
  circ([0, 0, 1], Math.PI / 2 - lat, col.cyan, 1.4, [1, 4]);
  // a whole day of fans
  if (a.day) for (let h = 0; h < 24; h += 1) { if (Math.abs(h - a.hour) < 0.01) continue; circ(sph(h * 15 * D2R, lat), Math.PI / 2, col.line, 1); }
  // current fan: horizon great circle, with beam thickness
  circ(zen, Math.PI / 2, col.amber, 3);
  if (a.soft > 0) { circ(zen, Math.PI / 2 + a.soft * D2R, col.amber, 1, [4, 3]); circ(zen, Math.PI / 2 - 0.5 * D2R, col.amber, 1, [4, 3]); }
  // zenith point and the mast
  const z = P(zen);
  c.fillStyle = col.cyan; c.beginPath(); c.arc(z[0], z[1], 9, 0, 7); c.fill(); c.fillStyle = col.ink; c.fillText("mast zenith", z[0] + 8, z[1] - 6);
  const lo = Math.max(-90, -(90 - Math.abs(a.lat))).toFixed(0), hi = Math.min(90, 90 - Math.abs(a.lat)).toFixed(0);
  return `At latitude <b>${a.lat}°</b> the fan can only ever point at declinations between <b>${lo}°</b> and <b>+${hi}°</b> (plus a degree or two of beam). `
    + `Right now the mast's zenith is at RA ${a.hour.toFixed(1)}h, Dec ${a.lat}°, so the fan is the amber circle. Over 24 sidereal hours it sweeps the whole band between the white dotted circles.`;
}
