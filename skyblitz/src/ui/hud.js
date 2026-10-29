// Race HUD: built once, updated only when values change (cached refs, transforms for motion). Owner: UI agent.
// Reads game.player / game.race and listens to the event catalogue. Nothing here is interactive (pointer-events: none),
// and nothing sits in the top-left 112x44 px (the Almanac pill).
import * as THREE from 'three';
import { h, fmtTime, ordinal, clamp } from './dom.js';
import { ITEM_ICONS, MISC } from './icons.js';
import { ITEMS } from '../race/balance.js';

const STUNT = { loop: 'LOOP', roll: 'ROLL', barrel: 'BARREL ROLL', inverted: 'INVERTED', nearmiss: 'NEAR MISS', shortcut: 'SHORTCUT!' };
export const popupText = (base, n, sum) => base + (n > 1 ? ' x' + n : '') + (sum ? ' +' + sum + '%' : '');
const BACKABLE = new Set(['missile', 'triple', 'mine', 'smoke']);
const SEGS = 20;
const _v = new THREE.Vector3();

export class Hud {
  constructor(ui) {
    this.ui = ui; this.game = ui.game; this.c = {}; this.t10 = 0; this.t30 = 0; this.map = null; this.popups = []; this.ticker = [];
    this.lockT = 0; this.warnT = 0; this.warnDist = 999; this.lockTarget = null; this.lockProg = 0; this.finishT = 0;
    this.build(); this.listen();
  }

  build() {
    const g = this.game;
    const el = this.el = h('div', { class: 'hud', 'aria-hidden': 'false' });
    // top: lap + timers (left of centre on phones) / position (right)
    this.lapEl = h('div', { class: 'hud-lap' }, h('b', null, 'LAP 1/3'));
    this.timeEl = h('div', { class: 'hud-time' }, '0:00.000');
    this.bestEl = h('div', { class: 'hud-best' }, 'BEST --:--.---');
    this.lastEl = h('div', { class: 'hud-last' });
    el.append(h('div', { class: 'hud-top' }, h('div', { class: 'hud-lapbox skew' }, this.lapEl, this.timeEl, h('div', { class: 'hud-sub' }, this.lastEl, this.bestEl))));
    this.posNum = h('span', { class: 'pos-n' }, '1'); this.posSuf = h('span', { class: 'pos-s' }, 'st'); this.posOf = h('span', { class: 'pos-of' }, '/8');
    this.posDelta = h('span', { class: 'pos-d' });
    this.posBox = h('div', { class: 'hud-pos skew' }, h('div', { class: 'pos-row' }, this.posNum, this.posSuf, this.posOf), this.posDelta);
    this.tickEl = h('ul', { class: 'hud-ticker', 'aria-live': 'polite' });
    el.append(h('div', { class: 'hud-right' }, this.posBox, this.tickEl));
    // bottom-left: speed / altitude
    this.spd = h('b', null, '0'); this.alt = h('i', null, '0');
    el.append(h('div', { class: 'hud-speed skew' }, h('div', { class: 'spd' }, this.spd, h('small', null, 'km/h')), h('div', { class: 'alt' }, 'ALT ', this.alt, ' m')));
    // bottom-centre: boost + item
    this.segs = []; const bar = h('div', { class: 'boost-bar' });
    for (let i = 0; i < SEGS; i++) { const s = h('i'); this.segs.push(s); bar.append(s); }
    this.boostWrap = h('div', { class: 'hud-boost' }, h('div', { class: 'boost-lbl' }, 'BOOST'), bar);
    this.heat = h('div', { class: 'heat' }, h('i'));
    this.heatWrap = h('div', { class: 'hud-heat' }, h('span', null, 'CANNON'), this.heat);
    this.shieldEl = h('div', { class: 'hud-shield', style: 'display:none', html: ITEM_ICONS.shield + '<b></b>' });
    this.itemIcon = h('div', { class: 'item-ico' }); this.itemCount = h('b', { class: 'item-n' }); this.itemHint = h('small', { class: 'item-hint' });
    this.itemBox = h('div', { class: 'hud-item skew' }, this.itemIcon, this.itemCount, this.itemHint);
    el.append(h('div', { class: 'hud-bottom' }, h('div', { class: 'hud-bc' }, this.boostWrap, this.heatWrap), this.itemBox, this.shieldEl));
    // minimap
    this.mapCv = h('canvas', { class: 'hud-map', width: 220, height: 220, 'aria-label': 'Minimap' });
    this.mapCtx = this.mapCv.getContext('2d');
    el.append(this.mapCv);
    // centre: banners, countdown, popups, warnings
    this.cd = h('div', { class: 'hud-cd', 'aria-live': 'assertive' }); this.cdHint = h('div', { class: 'hud-cdhint' });
    this.banner = h('div', { class: 'hud-banner', 'aria-live': 'assertive' });
    this.stack = h('div', { class: 'hud-popups', 'aria-live': 'polite' });
    this.wrong = h('div', { class: 'hud-wrong', style: 'display:none' }, 'WRONG WAY');
    this.respawn = h('div', { class: 'hud-respawn', style: 'display:none' }, 'RESPAWNING...');
    el.append(h('div', { class: 'hud-center' }, this.cd, this.cdHint, this.banner, this.stack, this.wrong, this.respawn));
    // missile warning + lock reticle + nameplates
    this.warn = h('div', { class: 'hud-warn', style: 'display:none' }, h('div', { class: 'warn-txt', html: MISC.warn + '<b>MISSILE!</b>' }), h('div', { class: 'warn-arrow' }));
    this.warnArrow = this.warn.querySelector('.warn-arrow');
    this.warnTxt = this.warn.querySelector('.warn-txt');
    this.reticle = h('div', { class: 'hud-lock', style: 'display:none', html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" class="lk-bg"/><circle cx="50" cy="50" r="40" class="lk-fg" pathLength="100"/><path d="M50 4v14M50 82v14M4 50h14M82 50h14" class="lk-x"/></svg>' });
    this.lockFg = this.reticle.querySelector('.lk-fg');
    el.append(this.warn, this.reticle);
    this.plates = []; for (let i = 0; i < 4; i++) { const p = h('div', { class: 'nameplate', style: 'display:none' }); this.plates.push({ el: p, id: -1 }); el.append(p); }
    // screen overlays
    this.dmg = h('div', { class: 'fx fx-dmg' }); this.emp = h('div', { class: 'fx fx-emp' }); this.flash = h('div', { class: 'fx fx-flash' });
    el.append(this.dmg, this.emp, this.flash);
    // finish panel
    this.finishBox = h('div', { class: 'hud-finish skew', style: 'display:none' });
    el.append(this.finishBox);
    this.ui.root.append(el);
    el.style.display = 'none';
  }

  show(on) { this.el.style.display = on ? '' : 'none'; if (!on) this.clearTransient(); }
  clearTransient() { this.stack.replaceChildren(); this.popups.length = 0; this.cd.textContent = ''; this.cdHint.textContent = ''; this.banner.textContent = ''; this.warn.style.display = 'none'; this.reticle.style.display = 'none'; this.ticker.length = 0; this.tickEl.replaceChildren(); this.finishBox.style.display = 'none'; this.wrong.style.display = 'none'; this.respawn.style.display = 'none'; this.c = {}; }

  // ------------------------------------------------------------------ events
  listen() {
    const g = this.game, ev = g.events, me = (r) => r && r === g.player;
    const reduce = () => g.settings.reduceFlash;
    ev.on('game:raceStart', ({ race }) => { this.buildMap(race?.course || g.course); this.c = {}; this.finishBox.style.display = 'none'; this.banner.textContent = ''; this.deltaT = 0; });
    ev.on('race:countdown', ({ n }) => { this.pop(this.cd, String(n), 'cd-pop'); this.cdHint.textContent = n <= 2 ? 'HOLD BOOST FOR A ROCKET START' : ''; });
    ev.on('race:go', () => { this.pop(this.cd, 'GO!', 'cd-go'); this.cdHint.textContent = ''; clearTimeout(this._cdT); this._cdT = setTimeout(() => { this.cd.textContent = ''; }, 1000); });
    ev.on('race:rocketStart', ({ racer, perfect }) => { if (me(racer)) this.stunt(perfect ? 'PERFECT START!' : 'GOOD START', perfect ? '#ffd02e' : '#29d3ff'); });
    ev.on('race:finalLap', ({ racer }) => { if (me(racer)) this.flashBanner('FINAL LAP!', 'final'); });
    ev.on('race:lap', ({ racer, lap, lapTime, best }) => { if (me(racer)) { this.c.lapFlash = 1; if (best) this.stunt('BEST LAP ' + fmtTime(lapTime), '#ffd02e'); } });
    ev.on('race:finish', ({ racer, place }) => { if (me(racer)) { this.flashBanner(`FINISH! ${ordinal(place)}`, 'finish', 4); this.finishT = 0; } else if (racer && g.player && place <= 3) this.tick(`${racer.name} finished ${ordinal(place)}`); });
    ev.on('race:position', ({ racer, place, prev }) => { if (me(racer) && prev && place !== prev) { this.posDelta.textContent = place < prev ? '▲' : '▼'; this.posDelta.className = 'pos-d ' + (place < prev ? 'up' : 'down'); this.deltaT = 2.2; } });
    ev.on('race:overtake', ({ racer, passed }) => { if (me(racer)) this.tick(`You passed ${passed?.name}`); else if (me(passed)) this.tick(`${racer?.name} passed you`); });
    ev.on('race:wrongway', ({ racer, on }) => { if (me(racer)) this.wrong.style.display = on ? '' : 'none'; });
    ev.on('race:respawn', ({ racer }) => { if (me(racer)) { this.respawn.style.display = ''; clearTimeout(this._rsT); this._rsT = setTimeout(() => { this.respawn.style.display = 'none'; }, 1400); } });
    ev.on('gate:pass', ({ racer, perfect }) => { if (me(racer) && perfect) this.stunt('PERFECT GATE', '#29d3ff'); });
    ev.on('racer:stunt', ({ racer, kind, reward }) => { if (me(racer)) this.stunt(STUNT[kind] || String(kind).toUpperCase(), kind === 'shortcut' ? '#ff8a1f' : kind === 'nearmiss' ? '#ff3d9a' : '#ffd02e', Math.round(reward || 0)); });
    ev.on('shortcut:enter', ({ racer }) => { if (me(racer)) this.stunt('SHORTCUT!', '#ff8a1f'); });
    ev.on('pickup:orb', ({ racer, item }) => { if (me(racer)) { this.tick(`You got ${ITEMS[item]?.name || item}`); this.itemBox.classList.remove('get'); void this.itemBox.offsetWidth; this.itemBox.classList.add('get'); } });
    ev.on('item:use', ({ racer, type }) => { if (me(racer)) this.tick(`Used ${ITEMS[type]?.name || type}`); });
    ev.on('missile:launch', ({ owner, target }) => { if (owner && target && (me(owner) || me(target))) this.tick(`${owner.name} fired at ${target.name}`); });
    ev.on('missile:evaded', ({ target, by }) => { if (me(target)) this.stunt(by === 'barrel' ? 'EVADED!' : by === 'shield' ? 'BLOCKED!' : 'MISSILE EVADED', '#4dff9d'); });
    ev.on('missile:warn', ({ target, missile, dist }) => { if (me(target)) { this.warnT = 0.75; this.warnDist = dist; this.warnMissile = missile; } });
    ev.on('missile:lock', ({ owner, target, progress }) => { if (me(owner)) { this.lockT = 0.4; this.lockTarget = target; this.lockProg = progress; } });
    ev.on('racer:hit', ({ racer, by, kind, severity = 0.5 }) => {
      if (me(racer)) { this.fx(this.dmg, 0.35 + 0.5 * clamp(severity, 0, 1)); g.cameraRig?.shake?.(0.3 + 0.5 * severity); this.tick(`${by?.name ? by.name + ' hit you' : 'You crashed'}${kind && !by ? ' (' + kind + ')' : ''}`); }
      else if (by && me(by)) this.tick(`You hit ${racer?.name}`);
      else if (by && racer) this.tick(`${by.name} hit ${racer.name}`);
    });
    ev.on('racer:tumble', ({ racer }) => { if (me(racer)) this.stunt('SYSTEMS RECOVERING', '#ff5a36'); });
    ev.on('emp:fire', ({ owner, pos, radius }) => { const p = g.player; if (p && owner !== p && pos && p.flight.pos.distanceTo(pos) < (radius || 150)) this.fx(this.emp, 0.9); });
    ev.on('lightning:strike', ({ target }) => { if (me(target)) { this.fx(this.flash, 0.9); g.cameraRig?.shake?.(0.7); } });
    ev.on('shield:block', ({ victim }) => { if (me(victim)) this.stunt('SHIELD BLOCKED', '#33d6ff'); });
    ev.on('game:pause', () => { this.el.classList.add('paused'); });
    ev.on('game:resume', () => { this.el.classList.remove('paused'); });
    this.reduce = reduce;
  }

  pop(el, text, cls) { el.textContent = text; el.classList.remove('cd-pop', 'cd-go'); void el.offsetWidth; el.classList.add(cls); }
  flashBanner(text, cls, secs = 2.6) { this.banner.textContent = text; this.banner.className = 'hud-banner on ' + cls; clearTimeout(this._bT); this._bT = setTimeout(() => { this.banner.className = 'hud-banner'; if (cls !== 'finish') this.banner.textContent = ''; }, secs * 1000); }
  /** One popup line per kind: consecutive identical stunts merge into "BARREL ROLL x3 +18%" and refresh their timer. Max 4 lines. */
  stunt(text, color, reward = 0) {
    const last = this.popups[this.popups.length - 1];
    if (last && last.dataset.base === text && last.isConnected) {
      const n = Number(last.dataset.n) + 1, sum = Number(last.dataset.sum) + reward;
      last.dataset.n = n; last.dataset.sum = sum; last.textContent = popupText(text, n, sum);
      last.style.animation = 'none'; void last.offsetWidth; last.style.animation = '';   // restart the timer
      return;
    }
    const e = h('div', { class: 'popup', style: `--c:${color}`, 'data-base': text, 'data-n': 1, 'data-sum': reward }, popupText(text, 1, reward));
    this.stack.prepend(e); this.popups.push(e);
    while (this.popups.length > 4) this.popups.shift().remove();
    e.addEventListener('animationend', () => { e.remove(); const i = this.popups.indexOf(e); if (i >= 0) this.popups.splice(i, 1); }, { once: true });
  }
  tick(text) {
    const li = h('li', null, text); this.tickEl.append(li); this.ticker.push({ el: li, t: 5 });
    while (this.ticker.length > 4) this.ticker.shift().el.remove();
  }
  fx(el, a) {
    const s = this.game.settings.reduceFlash ? Math.min(a, 0.35) * 0.5 : a;
    el.style.setProperty('--a', s.toFixed(2)); el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  }

  // ------------------------------------------------------------------ minimap
  buildMap(course) {
    const mm = course?.minimap || null; this.map = null;
    if (!mm || !mm.pts?.length) return;
    const W = 220, pad = 18, b = mm.bounds, w = Math.max(1, b.maxX - b.minX), d = Math.max(1, b.maxZ - b.minZ), k = (W - pad * 2) / Math.max(w, d);
    const ox = (W - w * k) / 2, oz = (W - d * k) / 2;
    const m = { k, minX: b.minX, minZ: b.minZ, ox, oz, bg: document.createElement('canvas') };
    m.bg.width = m.bg.height = W;
    const x = m.bg.getContext('2d'), P = (arr, close) => { x.beginPath(); for (let i = 0; i < arr.length; i += 2) { const px = ox + (arr[i] - b.minX) * k, pz = oz + (arr[i + 1] - b.minZ) * k; i ? x.lineTo(px, pz) : x.moveTo(px, pz); } if (close) x.closePath(); };
    x.lineJoin = x.lineCap = 'round';
    x.strokeStyle = 'rgba(8,16,40,.85)'; x.lineWidth = 11; P(mm.pts, true); x.stroke();
    x.strokeStyle = '#7fb5ff'; x.lineWidth = 6; P(mm.pts, true); x.stroke();
    x.strokeStyle = '#eaf3ff'; x.lineWidth = 2; P(mm.pts, true); x.stroke();
    x.setLineDash([7, 6]);
    for (const br of mm.branches || []) { x.strokeStyle = 'rgba(8,16,40,.85)'; x.lineWidth = 8; P(br.pts, false); x.stroke(); x.strokeStyle = '#ff8a1f'; x.lineWidth = 4; P(br.pts, false); x.stroke(); }
    x.setLineDash([]);
    // start line
    const sx = ox + (mm.pts[0] - b.minX) * k, sz = oz + (mm.pts[1] - b.minZ) * k; x.fillStyle = '#fff'; x.fillRect(sx - 6, sz - 2, 12, 4);
    this.map = m;
  }
  drawMap() {
    const m = this.map, cx = this.mapCtx, race = this.game.race; if (!m || !race) return;
    cx.clearRect(0, 0, 220, 220); cx.drawImage(m.bg, 0, 0);
    const pl = this.game.player;
    for (const r of race.racers) {
      if (r === pl) continue;
      const p = r.flight.pos; cx.fillStyle = r.pilot?.color || '#ffb020'; cx.strokeStyle = 'rgba(0,0,0,.7)'; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(m.ox + (p.x - m.minX) * m.k, m.oz + (p.z - m.minZ) * m.k, 5.5, 0, 6.2832); cx.stroke(); cx.fill();
    }
    if (pl) {
      const p = pl.flight.pos, x = m.ox + (p.x - m.minX) * m.k, z = m.oz + (p.z - m.minZ) * m.k, f = pl.flight.forward, a = Math.atan2(f.x, -f.z);
      cx.save(); cx.translate(x, z); cx.rotate(a); cx.fillStyle = '#fff'; cx.strokeStyle = '#ff8a1f'; cx.lineWidth = 3;
      cx.beginPath(); cx.moveTo(0, -11); cx.lineTo(8, 8); cx.lineTo(0, 4); cx.lineTo(-8, 8); cx.closePath(); cx.stroke(); cx.fill(); cx.restore();
    }
  }

  // ------------------------------------------------------------------ per-frame
  set(key, value, fn) { if (this.c[key] !== value) { this.c[key] = value; fn(value); } }

  update(dt, game) {
    const p = game.player, race = game.race;
    if (!p || !race) return;
    const c = this.c, fs = p.flight;
    this.set('spd', Math.round(fs.speed * 3.6), (v) => { this.spd.textContent = v; });
    this.set('alt', Math.round(fs.pos.y), (v) => { this.alt.textContent = v; });
    const boost = fs.boost.active; this.set('boostOn', boost, (v) => this.boostWrap.classList.toggle('on', v));
    const lit = Math.round(fs.boost.meter / 100 * SEGS); this.set('segs', lit, (n) => { for (let i = 0; i < SEGS; i++) this.segs[i].classList.toggle('lit', i < n); this.boostWrap.classList.toggle('full', n >= SEGS); });
    this.set('lap', Math.min(p.lap, race.laps) + '/' + race.laps, (v) => { this.lapEl.firstChild.textContent = 'LAP ' + v; });
    const place = p.place || 1, n = race.racers.length;
    this.set('place', place + '/' + n, () => { this.posNum.textContent = place; this.posSuf.textContent = ordinal(place).replace(/\d+/, ''); this.posOf.textContent = '/' + n; this.posBox.dataset.p = place <= 3 ? place : 0; });
    const it = p.item; const itKey = it ? it.type + ':' + it.count : '';
    this.set('item', itKey, () => {
      this.itemBox.classList.toggle('has', !!it);
      if (it) { const d = ITEMS[it.type]; this.itemIcon.innerHTML = ITEM_ICONS[it.type] || ''; this.itemIcon.style.color = d?.color || '#fff'; this.itemCount.textContent = it.count > 1 ? '×' + it.count : ''; this.itemHint.textContent = BACKABLE.has(it.type) ? 'HOLD B: BACKWARDS' : ''; this.itemBox.title = d?.name || ''; }
      else { this.itemIcon.innerHTML = '<span class="empty">ITEM</span>'; this.itemCount.textContent = ''; this.itemHint.textContent = ''; }
    });
    this.set('heat', Math.round((p.heat || 0) * 50), (v) => { this.heat.firstChild.style.transform = `scaleX(${v / 50})`; this.heatWrap.classList.toggle('hot', v > 40); this.heatWrap.classList.toggle('show', v > 2); });
    const sh = p.shield > 0 ? Math.ceil(p.shield) : 0; this.set('shield', sh, (v) => { this.shieldEl.style.display = v ? '' : 'none'; this.shieldEl.lastChild.textContent = v + 's'; });
    // timers at ~15 Hz
    this.t10 += dt;
    if (this.t10 > 0.066 || dt === 0) {
      this.t10 = 0;
      const racing = race.state === 'racing' || race.state === 'finishing';
      const lapT = racing && !p.finished ? Math.max(0, race.clock - p.lapStart) : (p.lapTimes.length ? p.lapTimes[p.lapTimes.length - 1] : 0);
      this.set('time', fmtTime(lapT), (v) => { this.timeEl.textContent = v; });
      const last = p.lapTimes.length ? p.lapTimes[p.lapTimes.length - 1] : null;
      this.set('last', last == null ? '' : fmtTime(last), (v) => { this.lastEl.textContent = v ? 'LAST ' + v : ''; });
      const best = p.bestLap;
      this.set('best', best == null ? '' : fmtTime(best), (v) => { this.bestEl.textContent = v ? 'BEST ' + v : ''; });
    }
    // transient timers
    if (this.deltaT > 0) { this.deltaT -= dt; if (this.deltaT <= 0) { this.posDelta.textContent = ''; } }
    for (let i = this.ticker.length - 1; i >= 0; i--) { const t = this.ticker[i]; t.t -= dt; if (t.t < 1) t.el.classList.add('fade'); if (t.t <= 0) { t.el.remove(); this.ticker.splice(i, 1); } }
    if (this.warnT > 0) { this.warnT -= dt; if (this.warnT <= 0) this.warn.style.display = 'none'; else this.updateWarn(); }
    this.lockT -= dt; this.updatePlates(game, p, race);
    // finish panel
    if (game.state === 'finish' || p.finished) { this.finishT += dt; if (this.finishT > 0.3 && Math.floor(this.finishT * 4) !== c.fin) { c.fin = Math.floor(this.finishT * 4); this.updateFinish(race, p); } }
    this.t30 += dt; if (this.t30 > 0.045) { this.t30 = 0; this.drawMap(); }
    this.el.classList.toggle('calm', !!game.settings.reduceFlash);
  }

  updateWarn() {
    const w = this.warn, d = this.warnDist, near = clamp(1 - d / 400, 0, 1);
    if (w.style.display === 'none') w.style.display = '';
    w.style.setProperty('--rate', (0.9 - near * 0.65).toFixed(2) + 's');
    w.classList.toggle('close', d < 160);
    this.warnTxt.lastChild.textContent = d < 160 ? 'MISSILE CLOSE!' : 'MISSILE!';
    const m = this.warnMissile?.pos, cam = this.game.camera;
    if (m) {
      cam.updateMatrixWorld(); _v.copy(m).applyMatrix4(cam.matrixWorldInverse);
      const a = Math.atan2(_v.x, _v.y + 1e-3); this.warnArrow.style.display = ''; this.warnArrow.style.transform = `rotate(${a}rad) translateY(-26vmin)`;
    } else this.warnArrow.style.display = 'none';
  }

  project(pos, out) { const g = this.game, cam = g.camera; _v.copy(pos); _v.project(cam); out.x = (_v.x * 0.5 + 0.5) * g.width; out.y = (-_v.y * 0.5 + 0.5) * g.height; out.z = _v.z; return _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1; }
  updatePlates(game, p, race) {
    game.camera.updateMatrixWorld();
    const scr = this._scr || (this._scr = { x: 0, y: 0, z: 0 }), pp = p.render?.pos || p.flight.pos;
    // lock reticle
    if (this.lockT > 0 && this.lockTarget && this.project((this.lockTarget.render?.pos || this.lockTarget.flight.pos), scr)) {
      this.reticle.style.display = ''; this.reticle.style.transform = `translate(${scr.x.toFixed(0)}px,${scr.y.toFixed(0)}px) translate(-50%,-50%)`;
      this.lockFg.style.strokeDashoffset = (100 - this.lockProg * 100).toFixed(1); this.reticle.classList.toggle('locked', this.lockProg >= 1);
    } else if (this.reticle.style.display !== 'none') this.reticle.style.display = 'none';
    // nameplates: nearest visible AI within range
    const near = this._near || (this._near = []); near.length = 0;
    for (const r of race.racers) { if (r === p) continue; const rp = r.render?.pos || r.flight.pos, d = rp.distanceTo(pp); if (d < 420 && d > 12) near.push([d, r]); }
    near.sort((a, b) => a[0] - b[0]);
    let k = 0;
    for (let i = 0; i < near.length && k < this.plates.length; i++) {
      const [d, r] = near[i]; _v.copy(r.render?.pos || r.flight.pos); _v.y += 6;
      if (!this.project(_v, scr)) continue;
      const pl = this.plates[k++]; if (pl.id !== r.id) { pl.id = r.id; pl.el.textContent = r.name; pl.el.style.setProperty('--c', r.pilot?.color || '#fff'); }
      pl.el.style.display = ''; pl.el.style.opacity = clamp(1.25 - d / 340, 0.15, 1).toFixed(2);
      pl.el.style.transform = `translate(${scr.x.toFixed(0)}px,${scr.y.toFixed(0)}px) translate(-50%,-100%)`;
    }
    for (; k < this.plates.length; k++) if (this.plates[k].el.style.display !== 'none') this.plates[k].el.style.display = 'none';
  }

  updateFinish(race, p) {
    const rows = race.standings().slice(0, 8).map((r, i) => h('li', { class: r === p ? 'me' : '' }, h('b', null, i + 1), h('span', null, r.name), h('em', null, r.finished ? fmtTime(r.finishTime) : '...')));
    this.finishBox.replaceChildren(h('div', { class: 'fin-t' }, 'LIVE STANDINGS'), h('ol', null, rows)); this.finishBox.style.display = '';
  }
}
