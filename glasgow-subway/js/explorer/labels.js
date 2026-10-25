// DOM labels projected over the canvas, with greedy overlap culling.
import * as THREE from 'three';
import { h } from './util.js';

export class Labels {
  constructor(container, camera) { this.el = container; this.camera = camera; this.items = []; this.v = new THREE.Vector3(); this.visible = true; this.tick = 0; }
  add({ id, kind, text, num, pos, onClick, onHover, priority = 1, aria }) {
    const el = kind === 'station'
      ? h('button.lab.st', { type: 'button', 'aria-label': aria || text, on: { click: () => onClick?.(id), pointerenter: () => onHover?.(id), pointerleave: () => onHover?.(null), focus: () => onHover?.(id), blur: () => onHover?.(null) } }, h('span.n', { text: num }), h('span.t', { text }))
      : h('div.lab.' + kind, { 'aria-hidden': 'true' }, h('span.t', { text }));
    el.classList.add('off'); this.el.append(el);
    const it = { id, kind, el, pos, priority, w: 0, h: 0, shown: false, boost: 0 }; this.items.push(it); return it;
  }
  clear(kind) { this.items = this.items.filter((it) => { if (!kind || it.kind === kind) { it.el.remove(); return false; } return true; }); }
  setVisible(on) { this.visible = on; this.el.style.display = on ? '' : 'none'; }
  update(w, h, selectedId, hoverId, camDist) {
    if (!this.visible) return;
    const rects = []; const cam = this.camera; const order = this.items.slice().sort((a, b) => this.score(b, selectedId, hoverId) - this.score(a, selectedId, hoverId));
    for (const it of order) {
      const p = typeof it.pos === 'function' ? it.pos() : it.pos; this.v.copy(p).project(cam);
      let show = this.v.z < 1 && this.v.z > -1 && Math.abs(this.v.x) < 1.04 && Math.abs(this.v.y) < 1.04;
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      if (!it.w) { it.w = it.el.offsetWidth || 90; it.h = it.el.offsetHeight || 24; }
      if (show) {
        const r = { x0: x - it.w / 2 - 3, x1: x + it.w / 2 + 3, y0: y - it.h - 3, y1: y + 3 };
        if (x - it.w / 2 < 114 && y - it.h < 50) show = false;
        const forced = it.id === selectedId || it.id === hoverId;
        if (!forced && rects.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0)) show = false;
        else rects.push(r);
      }
      if (show !== it.shown) { it.shown = show; it.el.classList.toggle('off', !show); }
      if (show) { it.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`; it.el.classList.toggle('sel', it.id === selectedId); it.el.classList.toggle('hov', it.id === hoverId); }
    }
  }
  score(it, sel, hov) { return (it.id === sel ? 100 : 0) + (it.id === hov ? 90 : 0) + it.priority; }
}
