// Long-section chart: ground vs both tunnels along the outer-circle chainage.
import { clamp } from './util.js';

export class LongSection {
  constructor(canvas, { subway, ground, tracks, waterY, onHover, onClick }) {
    Object.assign(this, { canvas, subway, ground, tracks, waterY: waterY ?? 3, onHover, onClick });
    this.ctx = canvas.getContext('2d'); this.cursorS = null; this.selected = null; this.exag = 1;
    const o = tracks.outer, inn = tracks.inner; const N = Math.min(900, Math.max(200, Math.round(o.length / 12)));
    this.N = N; this.s = new Float32Array(N + 1); this.gy = new Float32Array(N + 1); this.oy = new Float32Array(N + 1); this.iy = new Float32Array(N + 1);
    const tmp = {};
    for (let i = 0; i <= N; i++) {
      const s = (i / N) * o.length; this.s[i] = s; o.at(s, tmp); this.gy[i] = ground(tmp.x, tmp.z); this.oy[i] = tmp.y;
      const n = inn.nearest(tmp.x, tmp.z); this.iy[i] = inn.y[n.i];
    }
    let lo = 1e9, hi = -1e9; for (let i = 0; i <= N; i++) { lo = Math.min(lo, this.oy[i], this.iy[i]); hi = Math.max(hi, this.gy[i]); }
    this.yMin = Math.floor((lo - 6) / 5) * 5; this.yMax = Math.ceil((hi + 6) / 5) * 5;
    this.stops = (o.def.stops || []).map((st) => ({ id: st.station, s: st.s - o.offset, name: subway.stations.find((q) => q.id === st.station)?.name || st.station }));
    this.cross = (subway.tunnel?.riverCrossings || []).map((c) => ({ ...c, s0: c.s0 - o.offset, s1: c.s1 - o.offset }));
    const mv = (e) => { const r = canvas.getBoundingClientRect(); const x = (e.clientX ?? e.touches?.[0]?.clientX) - r.left; return this.xToS(x); };
    canvas.addEventListener('pointermove', (e) => { this.cursorS = mv(e); this.draw(); this.onHover?.(this.cursorS, this.info(this.cursorS)); });
    canvas.addEventListener('pointerleave', () => { this.cursorS = null; this.draw(); this.onHover?.(null); });
    canvas.addEventListener('click', (e) => { const s = mv(e); this.onClick?.(s, this.info(s)); });
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
  }
  setCursor(s) { this.cursorS = s; this.draw(); }
  setSelected(id) { this.selected = id; this.draw(); }
  get L() { return this.tracks.outer.length; }
  xToS(x) { const m = this.m; return clamp((x - m.l) / (this.w - m.l - m.r), 0, 1) * this.L; }
  sToX(s) { const m = this.m; return m.l + (s / this.L) * (this.w - m.l - m.r); }
  yToPx(y) { const m = this.m; return m.t + (1 - (y - this.yMin) / (this.yMax - this.yMin)) * (this.h - m.t - m.b); }
  at(s, arr) { const f = (s / this.L) * this.N, i = clamp(Math.floor(f), 0, this.N - 1), t = f - i; return arr[i] + (arr[i + 1] - arr[i]) * t; }
  info(s) { const g = this.at(s, this.gy), o = this.at(s, this.oy), i = this.at(s, this.iy); return { s, ground: g, outerY: o, innerY: i, outerDepth: g - o, innerDepth: g - i }; }
  resize() {
    const p = this.canvas.parentElement; const w = Math.max(200, p.clientWidth), h = Math.max(120, p.clientHeight); const dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = w * dpr; this.canvas.height = h * dpr; this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.w = w; this.h = h; this.m = { l: 42, r: 12, t: 24, b: 64 }; this.draw();
  }
  draw() {
    const c = this.ctx, { w, h, m } = this; if (!w) return; const css = getComputedStyle(document.documentElement);
    const v = (n, d) => css.getPropertyValue(n).trim() || d; const ink = v('--ink', '#ece7df'), dim = v('--dim', '#9b958b'), acc = v('--accent', '#ff7a1f'), line = v('--line', '#3a3d44');
    c.clearRect(0, 0, w, h); c.font = '11px system-ui, sans-serif';
    const px = (s) => this.sToX(s), py = (y) => this.yToPx(y);
    // grid
    c.lineWidth = 1; c.strokeStyle = line; c.fillStyle = dim; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let y = Math.ceil(this.yMin / 10) * 10; y <= this.yMax; y += 10) { c.globalAlpha = y === 0 ? 0.9 : 0.4; c.beginPath(); c.moveTo(m.l, py(y) + 0.5); c.lineTo(w - m.r, py(y) + 0.5); c.stroke(); c.globalAlpha = 1; c.fillText(y + ' m', m.l - 6, py(y)); }
    // river crossings
    for (const r of this.cross) { const x0 = px(Math.max(0, r.s0)), x1 = px(Math.min(this.L, r.s1)); c.fillStyle = 'rgba(80,170,220,.22)'; c.fillRect(x0, m.t, Math.max(2, x1 - x0), h - m.t - m.b); c.fillStyle = 'rgba(150,215,245,.9)'; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText('Clyde', (x0 + x1) / 2, m.t + 1); }
    // water level
    c.setLineDash([4, 4]); c.strokeStyle = 'rgba(90,170,220,.7)'; c.beginPath(); c.moveTo(m.l, py(this.waterY)); c.lineTo(w - m.r, py(this.waterY)); c.stroke(); c.setLineDash([]);
    // ground fill
    c.beginPath(); c.moveTo(px(0), py(this.yMin));
    for (let i = 0; i <= this.N; i++) c.lineTo(px(this.s[i]), py(this.gy[i]));
    c.lineTo(px(this.L), py(this.yMin)); c.closePath(); const gr = c.createLinearGradient(0, m.t, 0, h - m.b); gr.addColorStop(0, 'rgba(150,130,100,.55)'); gr.addColorStop(1, 'rgba(60,55,60,.35)'); c.fillStyle = gr; c.fill();
    c.beginPath(); for (let i = 0; i <= this.N; i++) { const x = px(this.s[i]), y = py(this.gy[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.strokeStyle = '#d8c9a8'; c.lineWidth = 1.6; c.stroke();
    // tunnels
    const trace = (arr, col, wd) => { c.beginPath(); for (let i = 0; i <= this.N; i++) { const x = px(this.s[i]), y = py(arr[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.strokeStyle = col; c.lineWidth = wd; c.stroke(); };
    trace(this.iy, '#34c6e8', 2.4); trace(this.oy, acc, 2.4);
    // stations
    c.textBaseline = 'middle'; c.textAlign = 'left';
    for (const st of this.stops) {
      const x = px(st.s), y = py(this.at(st.s, this.oy)), sel = st.id === this.selected;
      c.strokeStyle = sel ? '#fff' : 'rgba(255,255,255,.28)'; c.lineWidth = sel ? 1.5 : 1; c.beginPath(); c.moveTo(x + 0.5, py(this.at(st.s, this.gy))); c.lineTo(x + 0.5, h - m.b + 6); c.stroke();
      c.fillStyle = sel ? '#fff' : acc; c.beginPath(); c.arc(x, y, sel ? 5 : 3.5, 0, 7); c.fill(); c.strokeStyle = '#15171b'; c.lineWidth = 1; c.stroke();
      c.save(); c.translate(x + 3, h - m.b + 10); c.rotate(Math.PI / 4); c.fillStyle = sel ? '#fff' : ink; c.font = (sel ? '600 ' : '') + '11px system-ui, sans-serif'; c.fillText(st.name, 0, 0); c.restore();
    }
    // x axis
    c.fillStyle = dim; c.textAlign = 'center'; c.textBaseline = 'top'; c.font = '11px system-ui, sans-serif';
    for (let km = 0; km * 1000 <= this.L; km++) { const x = px(km * 1000); c.fillText(km + ' km', x, 4); c.fillStyle = line; c.fillRect(x, m.t - 6, 1, 5); c.fillStyle = dim; }
    // cursor
    if (this.cursorS != null) {
      const x = px(this.cursorS), i = this.info(this.cursorS); c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 0.5, m.t); c.lineTo(x + 0.5, h - m.b); c.stroke();
      for (const [y, col] of [[i.outerY, acc], [i.innerY, '#34c6e8']]) { c.fillStyle = col; c.beginPath(); c.arc(x, py(y), 4, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.stroke(); }
      const txt = `${(this.cursorS / 1000).toFixed(2)} km  surface ${i.ground.toFixed(0)} m OD  |  outer ${i.outerDepth.toFixed(1)} m down, inner ${i.innerDepth.toFixed(1)} m down`;
      c.font = '12px system-ui, sans-serif'; const tw = c.measureText(txt).width + 16; const bx = clamp(x - tw / 2, m.l, w - m.r - tw);
      c.fillStyle = 'rgba(15,17,21,.92)'; c.fillRect(bx, m.t + 14, tw, 22); c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, bx + 8, m.t + 25);
    }
  }
}
