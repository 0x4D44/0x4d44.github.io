// Tiny DOM helpers for the UI (no framework). Owner: UI agent.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--.---';
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
export function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
export const mod = (n, m) => ((n % m) + m) % m;

// ---------------------------------------------------------------- tiny Markdown subset (credits screen)
// Blocks: # headings, paragraphs (hard-wrapped lines are joined), - lists, indented code, --- rules, "Title" + "=====" (setext) headings.
// Inline: **bold**, `code`, [text](http...), bare http(s) links. Everything is built with text nodes (never innerHTML), links are http(s) only.
/** Markdown text -> [{ t: 'h', level, text } | { t: 'p', text } | { t: 'ul', items } | { t: 'pre', text } | { t: 'hr' }]. Pure. */
export function parseMd(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n'), out = [];
  let para = [], list = null, code = null;
  const flushPara = () => { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } };
  const flushList = () => { if (list) { out.push({ t: 'ul', items: list.map((l) => l.join(' ')) }); list = null; } };
  const flushCode = () => { if (code) { while (code.length && !code[code.length - 1].trim()) code.pop(); if (code.length) out.push({ t: 'pre', text: code.join('\n') }); code = null; } };
  const flush = () => { flushPara(); flushList(); flushCode(); };
  const heading = (level, text) => { const prev = out[out.length - 1]; if (!(prev && prev.t === 'h' && prev.text === text)) out.push({ t: 'h', level, text }); };   // "## name" followed by "name / =====" is one heading
  const isItem = (s) => /^\s*[-*+]\s+\S/.test(s);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], line = raw.trim();
    if (code) { if (!line || /^( {4}|\t)/.test(raw)) { code.push(raw.replace(/^( {4}|\t)/, '')); continue; } flushCode(); }
    if (!line) {
      flushPara();
      let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
      if (list && !(j < lines.length && isItem(lines[j]))) flushList();   // a blank line inside a list keeps it open while more items follow
      continue;
    }
    let m;
    if (/^([-*_])\1{2,}$/.test(line.replace(/\s+/g, ''))) { flush(); out.push({ t: 'hr' }); continue; }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line))) { flush(); heading(m[1].length, m[2]); continue; }
    if (/^={3,}$/.test(line) && para.length === 1) { heading(1, para[0]); para = []; continue; }
    if (isItem(raw)) { flushPara(); (list ||= []).push([raw.replace(/^\s*[-*+]\s+/, '').trim()]); continue; }
    if (list && /^\s/.test(raw)) { list[list.length - 1].push(line); continue; }   // indented continuation of the last list item
    if (!para.length && !list && /^( {4}|\t)/.test(raw)) { code = [raw.replace(/^( {4}|\t)/, '')]; continue; }   // an indented block (not a lazy paragraph continuation)
    flushList(); para.push(line);
  }
  flush();
  return out;
}
/** One line of text -> [{ t: 'text' | 'b' | 'code' | 'a', s, href? }]. Pure. */
export function parseInline(text) {
  const out = [], re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"'`]+)/g;
  let last = 0, m;
  const push = (t, s, href) => { if (s) out.push(href ? { t, s, href } : { t, s }); };
  while ((m = re.exec(text))) {
    push('text', text.slice(last, m.index));
    if (m[1] != null) push('code', m[1]);
    else if (m[2] != null) push('b', m[2]);
    else if (m[3] != null) push('a', m[3], m[4]);
    else { const url = m[5].replace(/[.,;:!?)\]]+$/, ''); push('a', url, url); push('text', m[5].slice(url.length)); }   // trailing punctuation belongs to the sentence
    last = m.index + m[0].length;
  }
  push('text', text.slice(last));
  return out;
}
const inlineNodes = (text) => parseInline(text).map((k) => (k.t === 'text' ? k.s : k.t === 'b' ? h('b', null, k.s) : k.t === 'code' ? h('code', null, k.s) : h('a', { href: k.href, target: '_blank', rel: 'noopener noreferrer' }, k.s)));
/** Markdown text -> DOM nodes. A level-1 heading becomes <h{top}> (default h3), level 2 the next size down, and so on up to h5. */
export function mdNodes(src, top = 3) {
  return parseMd(src).map((b) => (b.t === 'h' ? h('h' + Math.min(5, top + b.level - 1), null, inlineNodes(b.text)) : b.t === 'p' ? h('p', null, inlineNodes(b.text)) : b.t === 'ul' ? h('ul', null, b.items.map((x) => h('li', null, inlineNodes(x))))
    : b.t === 'pre' ? h('pre', null, b.text) : h('hr')));
}
