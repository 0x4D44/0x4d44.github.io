// Small shared helpers for the simulator (pure, no THREE dependency).
export const KMH = 1 / 3.6;
export const G = 9.81;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const wrapL = (s, L) => { s %= L; return s < 0 ? s + L : s; };
export const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const fmtTime = (sec) => {
  const neg = sec < 0; sec = Math.abs(Math.round(sec));
  return (neg ? '-' : '') + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
};
export const fmtDist = (m) => (Math.abs(m) >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m');
