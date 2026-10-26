// Small shared helpers for the explorer.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/** Tiny hyperscript: h('div.cls#id', {attr}, ...children). Text children are inserted as text nodes (safe). */
export function h(spec, attrs, ...kids) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, n) => { if (t === '.') el.classList.add(n); else el.id = n; });
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}
export const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');
export const paras = (text) => String(text || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => h('p', { text: t }));
export function store(key, val) {
  try { if (val === undefined) return JSON.parse(localStorage.getItem('gsx.' + key)); localStorage.setItem('gsx.' + key, JSON.stringify(val)); } catch { /* storage unavailable */ }
  return null;
}
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function yearOf(s) { const m = /\d{4}/.exec(String(s || '')); return m ? m[0] : ''; }
