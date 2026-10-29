// Aircraft select (3D turntable), course select (track maps), race options and the loading screen. Owner: UI agent.
import * as THREE from 'three';
import { h, fmtTime, mod } from './dom.js';
import { icon, STAT_ICONS, MISC } from './icons.js';
import { btn, header, footer, seg } from './menus.js';
import { AIRCRAFT } from '../craft/roster.js';
import { COURSES, previewCourse } from '../world/courses/index.js';
import { buildAircraft, disposeAircraft } from '../craft/aircraft.js';
import { bestFor } from './save.js';

const STATS = [['speed', 'Top speed'], ['accel', 'Acceleration'], ['handling', 'Handling'], ['stability', 'Stability'], ['boost', 'Boost'], ['armor', 'Armour']];
export const TIPS = [
  'Bank to turn, pull to loop: your aircraft turns where its wings point.',
  'A barrel roll (Q / E, or double-tap A / D) dodges incoming missiles.',
  'Fly through the golden rings for a speed burst; the centre of a gate earns a perfect.',
  'Loops, rolls, near misses and shortcuts all charge your boost meter.',
  'Dive to gain speed, climb to trade it back. Never stall: nose down to recover.',
  'Hold BOOST in the last half second of the countdown for a rocket start.',
  'Hold B while using a missile or mine to fire it backwards.',
  'Shortcuts are risky and narrow, but they save seconds.',
  'Tuck in behind a rival to draft and slingshot past them.',
  'Last place gets the strongest items. Comebacks are always possible.',
  'The airbrake tightens turns when you are coming in too hot.',
];

// ------------------------------------------------------------------ turntable
class Turntable {
  constructor(game, canvas) {
    this.game = game; this.canvas = canvas; this.ok = true; this.angle = 0.6; this.model = null; this.key = ''; this.drag = null; this.raf = 0;
    try {
      this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
    } catch (e) { this.ok = false; return; }
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05; this.r.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x38406a, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0d8, 3.2); sun.position.set(5, 8, 6); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x29d3ff, 2.4); rim.position.set(-6, 3, -5); this.scene.add(rim);
    const warm = new THREE.DirectionalLight(0xff8a1f, 1.2); warm.position.set(0, -4, 4); this.scene.add(warm);
    this.pivot = new THREE.Group(); this.scene.add(this.pivot);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: 0x29d3ff, transparent: true, opacity: 0.16 }));
    disc.rotation.x = -Math.PI / 2; this.disc = disc; this.scene.add(disc);
    canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, a: this.angle }; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (this.drag) this.angle = this.drag.a + (e.clientX - this.drag.x) * 0.012; });
    const end = () => { this.drag = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }
  set(spec, livery) {
    if (!this.ok) return;
    const key = spec.id + ':' + livery; if (key === this.key) return; this.key = key;
    if (this.model) { this.pivot.remove(this.model); disposeAircraft?.(this.model); this.model = null; }
    let m; try { m = buildAircraft(spec, livery, this.game); } catch (e) { console.warn('[ui] turntable model failed', e); return; }
    const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    m.position.sub(c); this.pivot.add(m); this.model = m;
    this.rad = Math.max(sz.x, sz.z) * 0.62 + 0.5; this.pivot.position.set(0, 0, 0);
    this.disc.scale.setScalar(this.rad * 1.5); this.disc.position.y = -sz.y * 0.5 - 0.3;
    this.cam.position.set(0, this.rad * 0.42, this.rad * 2.9); this.cam.lookAt(0, -sz.y * 0.05, 0);
    this.pop = 0;
  }
  resize() {
    if (!this.ok) return;
    const w = this.canvas.clientWidth, h2 = this.canvas.clientHeight; if (!w || !h2) return;
    const pr = Math.min(devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(w * pr) || this.canvas.height !== Math.round(h2 * pr)) { this.r.setPixelRatio(pr); this.r.setSize(w, h2, false); this.cam.aspect = w / h2; this.cam.updateProjectionMatrix(); }
  }
  start() { if (!this.ok || this.raf) return; let last = performance.now(); const loop = (now) => { this.raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last) / 1000); last = now; this.frame(dt); }; this.raf = requestAnimationFrame(loop); }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  frame(dt) {
    this.resize();
    if (!this.drag && !this.reduce) this.angle += dt * 0.55;
    this.pop = Math.min(1, (this.pop ?? 1) + dt * 3.5); const e = 1 - Math.pow(1 - this.pop, 3);
    this.pivot.rotation.y = this.angle; this.pivot.rotation.x = 0.12; this.pivot.rotation.z = 0.05 * Math.sin(this.angle * 0.7); this.pivot.scale.setScalar(0.82 + 0.18 * e);
    this.r.render(this.scene, this.cam);
  }
}

export function aircraftScreen(ui) {
  const g = ui.game; let idx = 0, liv = 0, tt = null;
  const cv = h('canvas', { class: 'tt-cv', 'aria-hidden': 'true' });
  const name = h('h3', { class: 'ac-name' }), cls = h('div', { class: 'ac-cls skew' }), tag = h('p', { class: 'ac-tag' });
  const bars = STATS.map(([k, l]) => { const fill = h('i'), v = h('b'); return { k, fill, v, row: h('div', { class: 'stat' }, icon(STAT_ICONS[k]), h('span', { class: 'st-l' }, l), h('div', { class: 'st-bar' }, fill), v) }; });
  const sw = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Livery' });
  const stage = h('div', { class: 'stage', tabindex: '0', 'data-nav': 'first', role: 'group', 'aria-label': 'Aircraft turntable. Use left and right to change aircraft.' }, cv,
    h('button', { type: 'button', class: 'arrow l', 'data-nav': '', 'aria-label': 'Previous aircraft', onclick: () => step(-1) }, icon(MISC.arrow)),
    h('button', { type: 'button', class: 'arrow r', 'data-nav': '', 'aria-label': 'Next aircraft', onclick: () => step(1) }, icon(MISC.arrow)),
    h('div', { class: 'dots' }, AIRCRAFT.map((a, i) => h('i', { 'data-i': i }))));
  const info = h('aside', { class: 'panel info' }, cls, name, tag, h('div', { class: 'stats' }, bars.map((b) => b.row)), h('div', { class: 'liv-l' }, 'LIVERY ', h('b', { class: 'liv-n' })), sw);
  const go = btn('Continue', () => { ui.flow.craft = AIRCRAFT[idx].id; ui.flow.livery = liv; ui.after('aircraft'); }, { cls: 'primary', cue: 'ui:confirm' });
  const keys = h('p', { class: 'keyhint' });
  const padOn = () => !!navigator.getGamepads && [...navigator.getGamepads()].some((x) => x && x.connected);
  const el = h('div', { class: 'scr aircraft' }, header('CHOOSE YOUR AIRCRAFT'), h('div', { class: 'ac-body' }, h('div', { class: 'stage-col' }, stage, keys), info), footer(ui, [go]));
  const refresh = () => {
    const a = AIRCRAFT[idx]; name.textContent = a.name; cls.firstChild?.remove?.(); cls.replaceChildren(h('span', null, a.cls)); tag.textContent = a.tagline;
    for (const b of bars) { const v = a.stats[b.k] || 0; b.fill.style.transform = `scaleX(${v / 10})`; b.v.textContent = v; b.row.dataset.v = v; }
    sw.replaceChildren(...a.liveries.map((l, i) => { const s = h('button', { type: 'button', class: 'sw' + (i === liv ? ' on' : ''), 'data-nav': '', role: 'radio', 'aria-checked': i === liv ? 'true' : 'false', 'aria-label': l.name, title: l.name, style: `--a:${l.primary};--b:${l.secondary};--c:${l.accent}` }); s.addEventListener('click', () => { liv = i; refresh(); }); return s; }));
    el.querySelector('.liv-n').textContent = a.liveries[liv].name.toUpperCase();
    stage.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', i === idx));
    el.style.setProperty('--ac', a.liveries[liv].primary); el.style.setProperty('--ac2', a.liveries[liv].accent);
    keys.textContent = padOn() ? '◀ ▶ aircraft    ▲ ▼ livery    A select    B back' : '← → aircraft    ↑ ↓ livery    Enter select    Esc back';
    tt?.set(a, liv);
  };
  const stepLiv = (d) => { liv = mod(liv + d, AIRCRAFT[idx].liveries.length); refresh(); ui.cue('ui:click'); };
  const step = (d) => { idx = mod(idx + d, AIRCRAFT.length); liv = 0; refresh(); ui.cue('ui:click'); };
  return {
    el,
    enter() {
      const i = AIRCRAFT.findIndex((a) => a.id === (ui.flow.craft || ui.save.last.craft)); idx = i < 0 ? 0 : i; liv = ui.flow.livery ?? ui.save.last.livery ?? 0;
      if (!tt) { tt = new Turntable(g, cv); ui.turntable = tt; }
      tt.reduce = !!g.settings.reduceFlash; refresh(); tt.start();
    },
    leave() { tt?.stop(); },
    onNav(dir, cur) {
      if (cur !== stage) return false;
      if (dir === 'left' || dir === 'right') { step(dir === 'left' ? -1 : 1); return true; }
      stepLiv(dir === 'up' ? -1 : 1); return true;
    },
    onActivate(a) { if (a === stage) { go.click(); return true; } return false; },
    back: () => 'main',
  };
}

// ------------------------------------------------------------------ course select
export function drawTrack(cv, pv, opts = {}) {
  const W = cv.width, H = cv.height, x = cv.getContext('2d'); x.clearRect(0, 0, W, H);
  if (!pv || !pv.pts?.length) return;
  const b = pv.bounds, pad = 18 * (W / 300), w = Math.max(1, b.maxX - b.minX), d = Math.max(1, b.maxZ - b.minZ), k = Math.min((W - pad * 2) / w, (H - pad * 2) / d);
  const ox = (W - w * k) / 2, oz = (H - d * k) / 2;
  const P = (arr, close) => { x.beginPath(); for (let i = 0; i < arr.length; i += 2) { const px = ox + (arr[i] - b.minX) * k, pz = oz + (arr[i + 1] - b.minZ) * k; i ? x.lineTo(px, pz) : x.moveTo(px, pz); } if (close) x.closePath(); };
  x.lineJoin = x.lineCap = 'round'; const u = W / 300;
  x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 12 * u; P(pv.pts, true); x.stroke();
  x.shadowColor = opts.color || '#29d3ff'; x.shadowBlur = 14 * u; x.strokeStyle = opts.color || '#29d3ff'; x.lineWidth = 6 * u; P(pv.pts, true); x.stroke(); x.shadowBlur = 0;
  x.strokeStyle = '#fff'; x.lineWidth = 2 * u; P(pv.pts, true); x.stroke();
  x.setLineDash([8 * u, 6 * u]); x.strokeStyle = '#ff8a1f'; x.lineWidth = 4 * u;
  for (const br of pv.branches || []) { P(br.pts, false); x.stroke(); }
  x.setLineDash([]);
  x.fillStyle = '#ffd02e'; x.beginPath(); x.arc(ox + (pv.pts[0] - b.minX) * k, oz + (pv.pts[1] - b.minZ) * k, 6 * u, 0, 6.2832); x.fill();
}
const COLORS = { sunrise: '#ffb347', redrock: '#ff6a3d', neon: '#ff3d9a', frost: '#7fe3ff' };
function stars(n) { const s = h('span', { class: 'stars', role: 'img', 'aria-label': `Difficulty ${n} of 5` }); for (let i = 0; i < 5; i++) s.append(icon(i < n ? MISC.star : MISC.starEmpty)); return s; }

export function courseScreen(ui) {
  const grid = h('div', { class: 'cards' });
  const el = h('div', { class: 'scr course' }, header('CHOOSE A COURSE'), grid, footer(ui));
  const cards = COURSES.map((c) => {
    const cv = h('canvas', { width: 300, height: 190, class: 'map', 'aria-hidden': 'true' });
    const lap = h('b'), race = h('b');
    const card = h('button', { type: 'button', class: 'card', 'data-nav': '', 'data-c': c.id, style: `--cc:${COLORS[c.id] || '#29d3ff'}` },
      h('div', { class: 'card-map' }, cv), h('div', { class: 'card-b' }, h('h3', null, c.name), h('div', { class: 'meta' }, h('span', { class: 'chip' }, c.theme), h('span', { class: 'chip' }, c.timeOfDay), stars(c.difficulty)),
        h('p', null, c.blurb), h('div', { class: 'recs' }, h('span', null, icon(MISC.clock), 'Best lap ', lap), h('span', null, icon(MISC.flag), 'Best race ', race))));
    card.addEventListener('click', () => { ui.flow.course = c.id; ui.after('course'); });
    return { c, cv, lap, race, card, drawn: false };
  });
  grid.append(...cards.map((x) => x.card));
  let drawQ = 0;
  const drawNext = () => { // spread the preview builds over frames so the screen opens instantly
    const x = cards.find((q) => !q.drawn); if (!x) return; x.drawn = true;
    try { drawTrack(x.cv, previewCourse(x.c.id), { color: COLORS[x.c.id] }); } catch (e) { console.warn('[ui] previewCourse failed', e); }
    drawQ = setTimeout(drawNext, 30);
  };
  return {
    el,
    enter() {
      const craft = ui.flow.craft;
      for (const x of cards) {
        const b = ui.save.best[`${x.c.id}|${craft}`] || bestFor(ui.save, x.c.id);
        x.lap.textContent = fmtTime(b.lap); x.race.textContent = fmtTime(b.race);
        x.card.classList.toggle('sel', ui.flow.course === x.c.id);
      }
      clearTimeout(drawQ); drawQ = setTimeout(drawNext, 40);
      const sel = cards.find((x) => x.c.id === ui.flow.course)?.card; if (sel) sel.dataset.nav = 'first';
    },
    leave() { clearTimeout(drawQ); }, back: () => 'aircraft',
  };
}

// ------------------------------------------------------------------ race options
export function optionsScreen(ui) {
  const sum = h('div', { class: 'opt-sum skew' });
  const diff = seg(ui, 'Difficulty', [{ v: 'easy', t: 'Easy' }, { v: 'normal', t: 'Normal' }, { v: 'hard', t: 'Hard' }, { v: 'expert', t: 'Expert' }], () => ui.flow.difficulty, (v) => { ui.flow.difficulty = v; refresh(); }, 'opt-diff');
  const laps = seg(ui, 'Laps', [{ v: 1, t: '1' }, { v: 3, t: '3' }, { v: 5, t: '5' }], () => ui.flow.laps, (v) => { ui.flow.laps = v; refresh(); }, 'opt-laps');
  const desc = h('p', { class: 'opt-desc' });
  const D = { easy: 'Relaxed rivals and generous items. Great for learning the courses.', normal: 'Rivals race properly. Fair fights, close finishes.', hard: 'Sharper racing lines, smarter item use, tighter gaps.', expert: 'The full field at its best. Almost no mistakes.' };
  const go = btn('Start race', () => ui.launch(), { cls: 'primary big', cue: 'ui:confirm', ico: MISC.flag });
  const el = h('div', { class: 'scr options' }, header('RACE OPTIONS'), h('div', { class: 'panel opts' }, sum, diff, laps, desc), footer(ui, [go]));
  function refresh() { diff.sync(); laps.sync(); desc.textContent = D[ui.flow.difficulty]; }
  return {
    el, enter() {
      const f = ui.flow, a = AIRCRAFT.find((x) => x.id === f.craft), c = COURSES.find((x) => x.id === f.course);
      sum.replaceChildren(h('span', null, a?.name || ''), h('span', null, f.mode === 'gp' ? 'Grand Prix: 4 courses, 3 laps each' : (c?.name || '')));
      laps.style.display = f.mode === 'quick' ? '' : 'none'; refresh();
    },
    onNav(dir, cur) {   // Up from the footer lands on the last option row (on its selected value); Down from the last row lands on Start
      const rows = [diff, laps].filter((r) => r.style.display !== 'none'), last = rows[rows.length - 1];
      const inFooter = !el.querySelector('.opts').contains(cur);
      if (dir === 'up' && inFooter) { (last.querySelector('.opt.on') || last.querySelector('.opt')).focus({ preventScroll: true }); return true; }
      if (dir === 'down' && last.contains(cur)) { go.focus({ preventScroll: true }); return true; }
      return false;
    },
    back: () => (ui.flow.mode === 'gp' ? 'aircraft' : 'course'),
  };
}

// ------------------------------------------------------------------ loading
export function loadingScreen(ui) {
  const fill = h('i'), label = h('div', { class: 'ld-l' }, 'Preparing'), tip = h('p', { class: 'ld-tip' }), where = h('div', { class: 'ld-w skew' }), pct = h('b', { class: 'ld-p' }, '0%');
  const el = h('div', { class: 'scr loading', role: 'status', 'aria-live': 'polite' }, h('div', { class: 'ld-in' }, where, h('h2', { class: 'ld-h' }, 'LOADING'), h('div', { class: 'ld-bar' }, fill), h('div', { class: 'ld-row' }, label, pct), h('div', { class: 'ld-tipbox' }, h('small', null, 'PRO TIP'), tip)));
  let tipI = 0, timer = 0, off = null;
  const setTip = () => { tip.textContent = TIPS[tipI++ % TIPS.length]; tip.classList.remove('in'); void tip.offsetWidth; tip.classList.add('in'); };
  return {
    el,
    enter() {
      const f = ui.flow, c = COURSES.find((x) => x.id === f.course), a = AIRCRAFT.find((x) => x.id === f.craft);
      where.textContent = `${c?.name || ''}${a ? '  /  ' + a.name : ''}`;
      tipI = Math.floor(Math.random() * TIPS.length); setTip(); timer = setInterval(setTip, 3200);
      fill.style.transform = 'scaleX(.02)'; pct.textContent = '0%';
      off = ui.game.events.on('game:loadProgress', ({ progress, label: l }) => { fill.style.transform = `scaleX(${Math.max(0.02, progress)})`; pct.textContent = Math.round(progress * 100) + '%'; if (l) label.textContent = l; });
    },
    leave() { clearInterval(timer); off?.(); }, noBack: true,
  };
}
