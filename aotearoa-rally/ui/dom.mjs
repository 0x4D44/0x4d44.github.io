// Tiny DOM helpers + pace-note glyphs. No framework.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") { for (const [sk, sv] of Object.entries(v)) (sk.startsWith("--") ? el.style.setProperty(sk, sv) : (el.style[sk] = sv)); }
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const clear = (el) => {
  while (el.firstChild) el.removeChild(el.firstChild);
};

export function fmtTime(sec, short = false) {
  if (!Number.isFinite(sec)) return "--:--.---";
  const neg = sec < 0;
  sec = Math.abs(sec);
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const body = short && m === 0 ? s.toFixed(3) : `${m}:${s.toFixed(3).padStart(6, "0")}`;
  return neg ? `-${body}` : body;
}
export function fmtDelta(sec) {
  if (!Number.isFinite(sec)) return "";
  const a = Math.abs(sec);
  const body = a >= 60 ? `${Math.floor(a / 60)}:${(a % 60).toFixed(2).padStart(5, "0")}` : a.toFixed(2);
  return `${sec < 0 ? "-" : "+"}${body}`;
}
export const fmtMin = (m) => `${m.toFixed(m < 10 ? 1 : 0)} min`;
export const stars = (n, max = 5) => h("span", { class: "stars", "aria-label": `${n} of ${max}` }, "★".repeat(n), h("i", null, "★".repeat(max - n)));

// ---- pace-note glyphs ----------------------------------------------------------------------
const sevColour = (s) => (s <= 2 ? "#ff6a5a" : s <= 4 ? "#ffc81e" : "#7fe39a");

/** SVG markup (viewBox 0 0 100 100) for a Pacenote.icon key. */
export function glyphSvg(icon) {
  const wrap = (inner, col = "#eaf3ed") => `<svg class="glyph" viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  let m = /^([LR])([1-6])$/.exec(icon || "");
  if (m) {
    const dir = m[1] === "L" ? -1 : 1;
    const sev = +m[2];
    const turn = ((7 - sev) / 6) * 150 + 10; // degrees of bend
    const rad = (turn * Math.PI) / 180;
    const len = 34;
    // bend point at (50,52); outgoing heading rotated by turn about the bend
    const ex = 50 + dir * Math.sin(rad) * len;
    const ey = 52 - Math.cos(rad) * len;
    const ah = 0.9; // arrow head
    const ang = Math.atan2(ey - 52, ex - 50);
    const hx1 = ex - Math.cos(ang - ah) * 18, hy1 = ey - Math.sin(ang - ah) * 18;
    const hx2 = ex - Math.cos(ang + ah) * 18, hy2 = ey - Math.sin(ang + ah) * 18;
    return wrap(`<path d="M50 94 V52 L${ex.toFixed(1)} ${ey.toFixed(1)}"/><path d="M${hx1.toFixed(1)} ${hy1.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)} L${hx2.toFixed(1)} ${hy2.toFixed(1)}"/>`, sevColour(sev));
  }
  m = /^hairpin_([lr])$/.exec(icon || "");
  if (m) {
    const d = m[1] === "l" ? -1 : 1;
    const x0 = 50 - d * 16, x1 = 50 + d * 16;
    return wrap(`<path d="M${x0} 94 V44 Q${x0} 12 50 12 Q${x1} 12 ${x1} 44 V70"/><path d="M${x1 - 14} 58 L${x1} 74 L${x1 + 14} 58"/>`, "#ff6a5a");
  }
  switch (icon) {
    case "crest": return wrap(`<path d="M10 78 Q50 6 90 78"/><path d="M36 86 H64" stroke-width="6"/>`, "#8fd9ff");
    case "jump": return wrap(`<path d="M12 80 L46 80 L72 52"/><path d="M60 40 L76 50 L64 66"/><path d="M60 88 H90" stroke-width="6"/>`, "#ff9d4d");
    case "caution": return wrap(`<path d="M50 12 L92 86 H8 Z"/><path d="M50 40 V62"/><circle cx="50" cy="75" r="2" fill="#ffc81e"/>`, "#ffc81e");
    case "bridge": return wrap(`<path d="M6 66 Q50 8 94 66"/><path d="M6 80 H94"/><path d="M30 46 V80 M50 38 V80 M70 46 V80" stroke-width="5"/>`, "#cfdcd5");
    case "ford": return wrap(`<path d="M8 52 q10 -12 21 0 t21 0 t21 0 t21 0"/><path d="M8 74 q10 -12 21 0 t21 0 t21 0 t21 0"/>`, "#66b8ff");
    case "finish": return wrap(`<path d="M18 12 V92"/><path d="M18 14 H84 V54 H18" stroke-width="5"/><path d="M40 14 V54 M62 14 V54 M18 34 H84" stroke-width="5"/>`, "#eaf3ed");
    case "slippery": return wrap(`<path d="M30 92 q-22 -22 0 -40 t0 -40"/><path d="M68 92 q-22 -22 0 -40 t0 -40"/>`, "#66b8ff");
    case "start": return wrap(`<circle cx="50" cy="50" r="34"/><path d="M40 34 L68 50 L40 66 Z" fill="#7fe39a" stroke="#7fe39a"/>`, "#7fe39a");
    case "straight":
    default: return wrap(`<path d="M50 92 V16"/><path d="M30 36 L50 14 L70 36"/>`, "#7fe39a");
  }
}

/** Convert markup to a DOM node. */
export function svgNode(markup) {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstChild;
}

export function toast(text, kind = "", ms = 2200) {
  const host = document.getElementById("toasts");
  if (!host) return;
  const t = h("div", { class: "toast " + kind }, text);
  host.append(t);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => t.remove(), ms);
}
