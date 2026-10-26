// Guided tour of the loop: scripted camera moves with captions.
import * as THREE from 'three';
import { $, h } from './util.js';

export class Tour {
  constructor(app, ui) { this.app = app; this.ui = ui; this.active = false; this.i = 0; this.token = 0; this.paused = false; this.el = $('#caption'); this.steps = this.build(); }
  build() {
    const a = this.app, st = a.stations, sub = a.subway; const steps = [];
    const km = sub.meta?.length_km ? sub.meta.length_km.toFixed(1) + ' km' : 'a few kilometres';
    steps.push({ title: 'A circle under Glasgow', text: `Opened in 1896, the Subway is the third-oldest underground railway in the world: ${st.length} stations on a ${km} loop. From above, you would never know it was there.`, run: async () => { a.setXrayAnimated(0); await a.hero(3); }, dwell: 5 });
    steps.push({ title: 'Peel back the city', text: 'Fade the streets away and two separate tunnels appear - the Outer Circle running clockwise, the Inner Circle anticlockwise. Little glowing trains run both loops.', run: async () => { a.setXrayAnimated(1); const v = a.makeHero(); v.polar = 0.85; await a.flyToView(v, 3); }, dwell: 6 });
    st.forEach((s, i) => steps.push({ title: `${i + 1}. ${s.name}`, text: `${s.summary || ''} ${s.depth != null ? `The rail head lies ${s.depth.toFixed(1)} m below street level.` : ''}`.trim(), station: s.id, run: async () => { a.selectStation(s.id, { fly: false }); await a.flyToStation(s.id, { xray: 1, dist: 190, angle: 0.7, dur: 3 }); }, dwell: 6 }));
    if (a.ug.crossings.length) steps.push({ title: 'Under the Clyde', text: 'Between the south bank and the north the tunnels dive beneath the river, passing below the bed of the Clyde.', run: async () => { a.selectStation(null); const c = a.ug.crossings[0]; await a.flyToView({ target: c.pos.clone(), dist: 420, polar: 1.15, azim: 0.6 }, 3.2); }, dwell: 6 });
    steps.push({ title: 'Back above ground', text: 'That is the loop. Pick any station to read more, or climb into the cab and drive it yourself.', run: async () => { a.selectStation(null); a.setXrayAnimated(0.35); await a.hero(3.5); }, dwell: 5 });
    return steps;
  }
  toggle() { this.active ? this.stop() : this.start(); }
  start() {
    if (this.active) return; this.active = true; this.app.state.tour = true; document.body.classList.add('touring'); this.i = 0; this.paused = false; this.render(); this.go(0); $('#btn-tour')?.setAttribute('aria-pressed', 'true');
    this.onUser = () => { /* manual camera input skips to waiting */ this.userMoved = true; }; this.app.on('userinput', this.onUser);
  }
  stop() {
    if (!this.active) return; this.active = false; this.token++; this.app.state.tour = false; document.body.classList.remove('touring'); this.el.hidden = true; $('#btn-tour')?.setAttribute('aria-pressed', 'false'); this.app.rig.cancelFlight();
  }
  async go(i) {
    const my = ++this.token; this.i = Math.max(0, Math.min(this.steps.length - 1, i)); const s = this.steps[this.i]; this.render();
    const ok = await s.run(); if (my !== this.token || !this.active) return;
    const t0 = performance.now(); const dwellMs = s.dwell * 1000;
    while (my === this.token && this.active) {
      await new Promise((r) => setTimeout(r, 200));
      if (this.paused) { continue; }
      if (performance.now() - t0 >= dwellMs) break;
    }
    if (my !== this.token || !this.active) return;
    if (this.i >= this.steps.length - 1) { this.stop(); return; } this.go(this.i + 1);
  }
  render() {
    const s = this.steps[this.i], n = this.steps.length; const el = this.el; el.hidden = false;
    el.replaceChildren(
      h('div.cap-top', h('span.cap-step', { text: `Tour ${this.i + 1} / ${n}` }), h('div.cap-bar', h('i', { style: { width: ((this.i + 1) / n) * 100 + '%' } }))),
      h('h3', { text: s.title }), h('p', { text: s.text }),
      h('div.cap-btns',
        h('button', { type: 'button', 'aria-label': 'Previous', text: '←', on: { click: () => this.go(this.i - 1) } }),
        h('button', { type: 'button', 'aria-label': this.paused ? 'Resume tour' : 'Pause tour', text: this.paused ? '▶' : '❚❚', on: { click: () => { this.paused = !this.paused; this.render(); } } }),
        h('button', { type: 'button', 'aria-label': 'Next', text: '→', on: { click: () => this.go(this.i + 1) } }),
        h('button.stop', { type: 'button', text: 'End tour', on: { click: () => this.stop() } })));
  }
}
