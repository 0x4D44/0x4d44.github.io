/* Down the Wire — UI. Pure logic lives in engine.js (window.WireEngine). */
(function () {
  'use strict';
  const E = window.WireEngine;
  const NS = 'http://www.w3.org/2000/svg';
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const STYLE_KEYS = { fill: 1, stroke: 1, color: 1 };

  function S(tag, attrs, parent, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) { if (STYLE_KEYS[k]) e.style[k] = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function H(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'style') e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach((c) => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, RM ? 1 : ms));
  function tween(dur, fn) {
    return new Promise((res) => {
      if (RM) { fn(1); return res(); }
      const t0 = performance.now();
      (function f(t) { const k = Math.min(1, (t - t0) / dur); fn(k); k < 1 ? requestAnimationFrame(f) : res(); })(t0);
    });
  }
  const ease = (k) => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

  function lab(id, title, build) {
    const root = document.getElementById(id);
    if (!root) return;
    root.classList.add('lab');
    root.append(H('header', null, H('i'), title));
    const body = H('div', { class: 'body' });
    root.append(body);
    build(body, root);
  }
  function svgIn(parent, vb, label) {
    const box = H('div', { class: 'svgbox' });
    const svg = S('svg', { viewBox: '0 0 ' + vb[0] + ' ' + vb[1], role: 'img', 'aria-label': label }, box);
    parent.append(box);
    return svg;
  }
  // A packet that glides along a polyline of points. Returns promise; element removed after unless keep.
  function fly(svg, pts, o) {
    o = o || {};
    const color = o.color || 'var(--cyan)', label = o.label || '';
    const g = S('g', { class: 'pk', color }, svg);
    const w = Math.max(18, label.length * 6.4 + 12);
    S('rect', { x: -w / 2, y: -9, width: w, height: 18, rx: 5, fill: color, stroke: 'none' }, g);
    if (label) S('text', { x: 0, y: 4, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#04121a' }, g, label);
    const seg = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    const put = (d) => {
      let i = 0; while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const k = seg[i] ? Math.min(1, d / seg[i]) : 1;
      g.setAttribute('transform', 'translate(' + (pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k) + ',' + (pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k) + ')');
    };
    put(0);
    return tween(o.dur || Math.max(350, total * 2.2), (k) => put(ease(k) * total)).then(() => { if (!o.keep) g.remove(); return g; });
  }
  function node(svg, x, y, w, h, label, sub, color) {
    const g = S('g', null, svg);
    const r = S('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 9, fill: 'var(--panel)', stroke: color || 'var(--line)', 'stroke-width': 1.6 }, g);
    S('text', { x, y: sub ? y - 2 : y + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: 'var(--ink)' }, g, label);
    if (sub) S('text', { x, y: y + 13, 'text-anchor': 'middle', 'font-size': 9.5, fill: 'var(--dim)' }, g, sub);
    return { g, r, x, y };
  }
  function flash(rect, color) { const o = rect.style.stroke; rect.style.stroke = color; rect.style.strokeWidth = 3.5; setTimeout(() => { rect.style.stroke = o; rect.style.strokeWidth = 1.6; }, RM ? 1 : 700); }
  const line = (svg, a, b, o) => S('line', Object.assign({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'var(--line)', 'stroke-width': 2.5 }, o || {}), svg);
  const hex2 = (n) => n.toString(16).padStart(2, '0');
  const sel = (opts, val, onchange) => {
    const s = H('select', { onchange: (e) => onchange(e.target.value) }, opts.map((o) => H('option', { value: o[0], text: o[1] })));
    s.value = val; return s;
  };

  /* ---------- nav, theme, progress ---------- */
  function initChrome() {
    const nav = $('.bar nav');
    const links = $$('a', nav);
    const secs = links.map((a) => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) { links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); const on = $('a.on', nav); if (on) nav.scrollTo({ left: on.offsetLeft - 20, behavior: RM ? 'auto' : 'smooth' }); } });
      }, { rootMargin: '-30% 0px -60% 0px' });
      secs.forEach((s) => io.observe(s));
    }
    const prog = $('.progress');
    const upd = () => { const h = document.documentElement; prog.style.width = (100 * h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) + '%'; };
    addEventListener('scroll', upd, { passive: true }); upd();
    const tb = $('.theme');
    const set = (t) => { document.documentElement.setAttribute('data-theme', t); tb.textContent = t === 'light' ? '☾ dark' : '☀ light'; try { localStorage.setItem('wire.theme', t); } catch (e) {} drawHero(); };
    let t0 = null; try { t0 = localStorage.getItem('wire.theme'); } catch (e) {}
    const sysLight = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches;
    tb.textContent = (t0 || (sysLight ? 'light' : 'dark')) === 'light' ? '☾ dark' : '☀ light';
    if (t0) document.documentElement.setAttribute('data-theme', t0);
    tb.addEventListener('click', () => set((document.documentElement.getAttribute('data-theme') || (sysLight ? 'light' : 'dark')) === 'light' ? 'dark' : 'light'));
  }

  /* ---------- hero: pulses racing along PCB traces ---------- */
  let hero = null;
  function drawHero() { if (hero) hero.layout(); }
  function initHero() {
    const cv = $('.hero canvas'); if (!cv) return;
    const ctx = cv.getContext('2d'); let W = 0, Hh = 0, traces = [], pulses = [], raf = 0, vis = true, cols = {};
    const rnd = (a, b) => a + Math.random() * (b - a);
    function layout() {
      const cs = getComputedStyle(document.documentElement);
      cols = { line: cs.getPropertyValue('--line').trim(), c: cs.getPropertyValue('--cyan').trim(), m: cs.getPropertyValue('--mag').trim(), a: cs.getPropertyValue('--amber').trim(), l: cs.getPropertyValue('--lime').trim() };
      const dpr = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect();
      W = r.width; Hh = r.height; cv.width = W * dpr; cv.height = Hh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cell = 36; traces = [];
      const n = Math.round(W / 38);
      for (let i = 0; i < n; i++) {
        let x = Math.round(rnd(0, W) / cell) * cell, y = Math.round(rnd(0, Hh) / cell) * cell;
        const pts = [[x, y]]; let horiz = Math.random() < .5;
        const segs = 3 + Math.floor(Math.random() * 4);
        for (let s = 0; s < segs; s++) { const d = (Math.random() < .5 ? -1 : 1) * cell * (1 + Math.floor(Math.random() * 6)); if (horiz) x += d; else y += d; pts.push([x, y]); horiz = !horiz; }
        let len = 0; const ls = []; for (let k = 1; k < pts.length; k++) { const l = Math.abs(pts[k][0] - pts[k - 1][0]) + Math.abs(pts[k][1] - pts[k - 1][1]); ls.push(l); len += l; }
        traces.push({ pts, ls, len });
      }
      pulses = traces.map((t, i) => ({ t, d: Math.random() * t.len, v: rnd(70, 170), c: [cols.c, cols.m, cols.a, cols.l][i % 4] }));
      frame(0, true);
    }
    function at(t, d) { let i = 0; while (i < t.ls.length - 1 && d > t.ls[i]) { d -= t.ls[i]; i++; } const k = d / t.ls[i]; return [t.pts[i][0] + (t.pts[i + 1][0] - t.pts[i][0]) * k, t.pts[i][1] + (t.pts[i + 1][1] - t.pts[i][1]) * k]; }
    let last = 0;
    function frame(ts, still) {
      const dt = still ? 0 : Math.min(.05, (ts - last) / 1000); last = ts;
      ctx.clearRect(0, 0, W, Hh);
      ctx.lineWidth = 1.4; ctx.strokeStyle = cols.line; ctx.globalAlpha = .75;
      traces.forEach((t) => { ctx.beginPath(); t.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); });
      ctx.globalAlpha = 1;
      traces.forEach((t) => { ctx.fillStyle = cols.line; [t.pts[0], t.pts[t.pts.length - 1]].forEach((p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 7); ctx.fill(); }); });
      pulses.forEach((p) => {
        p.d += p.v * dt; if (p.d > p.t.len + 60) p.d = -rnd(0, 200);
        for (let k = 0; k < 14; k++) { const dd = p.d - k * 4; if (dd < 0 || dd > p.t.len) continue; const q = at(p.t, dd); ctx.globalAlpha = (1 - k / 14) * .9; ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = k ? 0 : 14; ctx.beginPath(); ctx.arc(q[0], q[1], 2.6 - k * .12, 0, 7); ctx.fill(); }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      });
      if (!still && vis && !RM) raf = requestAnimationFrame(frame);
    }
    hero = { layout };
    layout();
    if ('IntersectionObserver' in window) new IntersectionObserver((e) => { vis = e[0].isIntersecting; cancelAnimationFrame(raf); if (vis && !RM) raf = requestAnimationFrame(frame); }).observe(cv);
    else if (!RM) raf = requestAnimationFrame(frame);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 150); });
  }
  window.__wire = { S, H, $, $$, E, sleep, tween, fly, node, flash, line, hex2, sel, lab, svgIn, RM, ease };
  document.addEventListener('DOMContentLoaded', () => { initChrome(); initHero(); (window.__wireWidgets || []).forEach((f) => { try { f(); } catch (e) { console.error(e); } }); });
})();
