// Race HUD: built once, updated only when values change (cached refs, transforms for motion). Owner: UI agent.
// Reads game.player / game.race and listens to the event catalogue. Nothing here is interactive (pointer-events: none),
// and nothing sits in the top-left 112x44 px (the Almanac pill).
import * as THREE from 'three';
import { h, fmtTime, ordinal, clamp } from './dom.js';
import { ITEM_ICONS, MISC } from './icons.js';
import { ITEMS } from '../race/balance.js';
import { Feed, feedText, feedHardMax, hitEntry, launchEntry, passEntry } from './hud-feed.js';
import { layoutPlates, lockLabelSide, lockLabelPush } from './hud-layout.js';
import { smokeTexture } from './hud-smoke.js';
import { rocketHint } from './rocket-hint.js';

const STUNT = { loop: 'LOOP', roll: 'ROLL', barrel: 'BARREL ROLL', inverted: 'INVERTED', nearmiss: 'NEAR MISS', shortcut: 'SHORTCUT!' };
export const popupText = (base, n, sum) => base + (n > 1 ? ' x' + n : '') + (sum ? ' +' + sum + '%' : '');
const BACKABLE = new Set(['missile', 'triple', 'mine', 'smoke']);
const SEGS = 20;
const POPUP_MAX = 2;          // stunt lines on screen at once (V-3): the rest of the screen belongs to the craft
const TALLY_SECS = 4;         // a stunt kind not seen for this long starts again at x1
const FLASH_MAX = 0.5;        // white screen flash cap (V-11): LAP, place and speed stay readable through a lightning hit
const PLATE_POOL = 6;         // nameplate elements; layoutPlates shows at most PLATE.max of them
const SMOKE_MAX = 0.7;        // smoke fog at its densest (P-15): under the 0.75 cap, so the track still shows through it
const SMOKE_CALM = 0.4;       // ... with "Reduce flashing & motion" on (the OS reduced-motion preference sets that setting: game.js onReducedMotion)
const CAM_NAMES = { chase: 'CHASE', far: 'FAR', low: 'LOW', nose: 'NOSE' };
const _v = new THREE.Vector3(), _c = new THREE.Vector3();
const CRAFT_PAD = 6;          // px of air round the player's craft that the lock reticle's name keeps clear (R2 P-18)
const CRAFT_EVERY = 90;       // ms between two measurements of the craft's screen rectangle (about 10k vertices); the chase camera holds the craft nearly still on the screen
const AUTO_FROM = 8;          // s with no key before the notice shows: race.js speedMulFor eases the keyboard-guided craft to a slower pace over smoothstep(8, 14, input.handsOffT) (R2 T7)

export class Hud {
  constructor(ui) {
    this.ui = ui; this.game = ui.game; this.c = {}; this.t10 = 0; this.t30 = 0; this.map = null; this.popups = [];
    this.feed = new Feed({ hardMax: feedHardMax(window.innerHeight) }); this.feedEls = new Map(); this.tally = new Map(); this.clock = 0;   // R2-V-11: four pinned lines at most on a short screen
    this.lockT = 0; this.warnT = 0; this.warnDist = 999; this.warnTti = null; this.warnRate = 0; this.warnEvade = false; this.warnEvadeT = 0; this.warnCue = false; this.warnMissile = null;
    this.lockTarget = null; this.lockProg = 0; this.lockedBy = null; this.lockedByT = 0; this.lockedByProg = 0;
    this.finishT = 0; this.camPending = false; this._zones = null; this._zonesT = 0; this._claim = 0; this._rm = null;
    this._lm = null; this._side = 'below'; this._cr = { l: 0, t: 0, r: 0, b: 0 }; this._csc = { x: 0, y: 0, z: 0 }; this._crModel = null; this._crT = -1e9; this._crOk = false;   // the reticle's size, the side its name sits on, the player's craft rectangle (R2 P-18)
    this.smokeT = 0; this.smokeDur = 0; this.smokeA = 0;   // P-15: seconds of fog left on the event's own clock, the blind time the event announced, and the fog's current strength (0..1)
    this.build(); this.listen();
  }

  build() {
    const g = this.game;
    const el = this.el = h('div', { class: 'hud', 'aria-hidden': 'false' });
    // underlay: the screen flashes and the nameplates paint first, so every panel after them draws over them (V-11, P-18); a flash class is dropped when its
    // animation ends, or the whole HUD replays it when it is shown again (V-17)
    // (the smoke fog, P-15, is the lowest of them: a damage or lightning flash inside smoke still reads on top of it; its opacity is set per frame, so it never carries `go`)
    this.smoke = h('div', { class: 'fx fx-smoke' });
    this.dmg = h('div', { class: 'fx fx-dmg' }); this.emp = h('div', { class: 'fx fx-emp' }); this.flash = h('div', { class: 'fx fx-flash' });
    for (const f of [this.dmg, this.emp, this.flash]) { const off = () => f.classList.remove('go'); f.addEventListener('animationend', off); f.addEventListener('animationcancel', off); }
    this.platesEl = h('div', { class: 'hud-plates' }); this.plates = [];
    for (let i = 0; i < PLATE_POOL; i++) { const p = h('div', { class: 'nameplate', style: 'display:none' }); this.plates.push({ el: p, id: -1, w: 0, h: 0, claim: 0, on: false }); this.platesEl.append(p); }
    el.append(this.smoke, this.dmg, this.emp, this.flash, this.platesEl);
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
    // the hands-off notice (R2 T7): the keyboard guide is flying a player who has pressed no key for AUTO_FROM s, and the race eases the craft to a slower pace until one is pressed; a calm plate above the speed box says so
    this.autoEl = h('div', { class: 'hud-auto' }, h('div', { class: 'auto-in' }, h('b', null, 'AUTO-CRUISE'), ' · ', h('span', null, 'press a key to take over')));   // (the dot stays on the first line; the sentence wraps as a block)
    el.append(this.autoEl);
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
    // centre: countdown (digit and rocket-start hint in one column), banners, popups (left column), camera note
    this.cd = h('div', { class: 'hud-cd', 'aria-live': 'assertive' }); this.cdHint = h('div', { class: 'hud-cdhint' });
    this.banner = h('div', { class: 'hud-banner', 'aria-live': 'assertive' });
    this.stack = h('div', { class: 'hud-popups', 'aria-live': 'polite' });
    this.wrong = h('div', { class: 'hud-wrong', style: 'display:none' }, 'WRONG WAY');
    this.respawn = h('div', { class: 'hud-respawn', style: 'display:none' }, 'RESPAWNING...');
    this.note = h('div', { class: 'hud-note', 'aria-live': 'polite' });
    this.note.addEventListener('animationend', () => this.note.classList.remove('on'));
    el.append(h('div', { class: 'hud-center' }, h('div', { class: 'hud-cdwrap' }, this.cd, this.cdHint), this.banner, this.stack, this.wrong, this.respawn, this.note));
    // alerts: missile warning (+ ROLL cue) and lock-on warning share one column at the top; the arrows are placed around the screen centre
    this.warnTxt = h('div', { class: 'warn-txt', html: MISC.warn + '<b>MISSILE!</b>' });
    this.rollEl = h('div', { class: 'warn-roll' }, 'ROLL!');
    this.lockTxt = h('div', { class: 'lockon-txt', html: MISC.warn + '<b></b>' });
    this.warnArrow = h('div', { class: 'warn-arrow' }); this.lockArrow = h('div', { class: 'lockon-arrow' });
    this.warn = h('div', { class: 'hud-warn', style: 'display:none' }, h('div', { class: 'warn-stack' }, this.warnTxt, this.lockTxt), this.rollEl, this.warnArrow, this.lockArrow);
    // lock reticle on the rival we are locking, with its name
    this.reticle = h('div', { class: 'hud-lock', 'data-side': 'below', style: 'display:none', html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" class="lk-bg"/><circle cx="50" cy="50" r="40" class="lk-fg" pathLength="100"/><path d="M50 4v14M50 82v14M4 50h14M82 50h14" class="lk-x"/></svg><span class="lk-name"></span>' });
    this.lockFg = this.reticle.querySelector('.lk-fg'); this.lockLbl = this.reticle.querySelector('.lk-name');
    el.append(this.warn, this.reticle);
    // finish panel
    this.finishBox = h('div', { class: 'hud-finish skew', style: 'display:none' });
    el.append(this.finishBox);
    this.ui.root.append(el);
    el.style.display = 'none';
  }

  show(on) { this.el.style.display = on ? '' : 'none'; if (!on) this.clearTransient(); }
  clearTransient() {
    this.stack.replaceChildren(); this.popups.length = 0; this.tally.clear(); this.cd.textContent = ''; this.cdHint.textContent = ''; this.banner.textContent = ''; this.banner.className = 'hud-banner';
    this.warn.style.display = 'none'; this.reticle.style.display = 'none'; this.warnT = 0; this.warnEvadeT = 0; this.warnCue = false; this.warnMissile = null; this.lockT = 0; this.lockedBy = null; this.lockedByT = 0; this.camPending = false;
    this.note.classList.remove('on'); this.autoEl.classList.remove('on'); this.feed.clear(); this.feedEls.clear(); this.tickEl.replaceChildren();
    for (const f of [this.dmg, this.emp, this.flash]) f.classList.remove('go');   // V-17: a shown-again HUD must not replay the last race's flashes
    this.smokeT = this.smokeDur = this.smokeA = 0; this.smoke.style.opacity = '0'; this.smoke.classList.remove('drift');   // ... nor the last race's fog (P-15)
    for (const p of this.plates) { p.el.style.display = 'none'; p.id = -1; p.on = false; }
    this.finishBox.style.display = 'none'; this.wrong.style.display = 'none'; this.respawn.style.display = 'none'; this.c = {}; this._zones = null;
  }

  // ------------------------------------------------------------------ events
  listen() {
    const g = this.game, ev = g.events, me = (r) => r && r === g.player;
    const reduce = () => g.settings.reduceFlash;
    ev.on('game:raceStart', ({ race }) => {
      this.buildMap(race?.course || g.course); this.c = {}; this.finishBox.style.display = 'none'; this.banner.textContent = ''; this.deltaT = 0;
      this.update(0, g); this.drawMap();   // V-31: the first thing drawn already shows this race's lap count, place, altitude and map, not the template values
    });
    ev.on('game:resize', ({ h } = {}) => { for (const p of this.plates) p.w = 0; this._zones = null; this.feed.o.hardMax = feedHardMax(h || window.innerHeight); });
    ev.on('race:countdown', ({ n }) => { this.pop(this.cd, String(n), 'cd-pop'); this.cdHint.textContent = n <= 2 ? rocketHint() : ''; });
    ev.on('race:go', () => { this.pop(this.cd, 'GO!', 'cd-go'); this.cdHint.textContent = ''; clearTimeout(this._cdT); this._cdT = setTimeout(() => { this.cd.textContent = ''; }, 1000); });
    ev.on('race:rocketStart', ({ racer, perfect }) => { if (me(racer)) this.stunt(perfect ? 'PERFECT START!' : 'GOOD START', perfect ? '#ffd02e' : '#29d3ff'); });
    ev.on('race:finalLap', ({ racer }) => { if (me(racer)) this.flashBanner('FINAL LAP!', 'final'); });
    ev.on('race:lap', ({ racer, lap, lapTime, best }) => { if (me(racer)) { this.c.lapFlash = 1; if (best) this.stunt('BEST LAP ' + fmtTime(lapTime), '#ffd02e'); } });
    ev.on('race:finish', ({ racer, place }) => { if (me(racer)) { this.flashBanner(`FINISH! ${ordinal(place)}`, 'finish', 4); this.finishT = 0; } else if (racer && g.player && place <= 3) this.say(`${racer.name} finished ${ordinal(place)}`); });
    ev.on('race:missed', ({ racer, what }) => { if (me(racer)) this.flashBanner(what === 'loop' ? 'MISSED THE LOOP' : `MISSED THE ${String(what || 'section').toUpperCase()}`, 'missed', 2.2); });   // E-08: the relock skipped a required section, no credit given
    ev.on('race:position', ({ racer, place, prev }) => { if (me(racer) && prev && place !== prev) { this.posDelta.textContent = place < prev ? '▲' : '▼'; this.posDelta.className = 'pos-d ' + (place < prev ? 'up' : 'down'); this.deltaT = 2.2; } });
    ev.on('race:overtake', (e) => { const f = passEntry(e, me); if (f) this.addFeed(f); });   // R2-V-11: the player's passes are one counted line (hud-feed.js)
    ev.on('race:wrongway', ({ racer, on }) => { if (me(racer)) this.wrong.style.display = on ? '' : 'none'; });
    ev.on('race:respawn', ({ racer }) => { if (me(racer)) { this.respawn.style.display = ''; clearTimeout(this._rsT); this._rsT = setTimeout(() => { this.respawn.style.display = 'none'; }, 1400); } });
    ev.on('gate:pass', ({ racer, perfect }) => { if (me(racer) && perfect) this.stunt('PERFECT GATE', '#29d3ff'); });
    ev.on('racer:stunt', ({ racer, kind, reward }) => { if (me(racer)) this.stunt(STUNT[kind] || String(kind).toUpperCase(), kind === 'shortcut' ? '#ff8a1f' : kind === 'nearmiss' ? '#ff3d9a' : '#ffd02e', Math.round(reward || 0)); });
    ev.on('shortcut:enter', ({ racer }) => { if (me(racer)) this.stunt('SHORTCUT!', '#ff8a1f'); });
    ev.on('pickup:orb', ({ racer, item }) => { if (me(racer)) { this.say(`You got ${ITEMS[item]?.name || item}`); this.itemBox.classList.remove('get'); void this.itemBox.offsetWidth; this.itemBox.classList.add('get'); } });
    ev.on('item:use', ({ racer, type }) => { if (me(racer)) this.say(`Used ${ITEMS[type]?.name || type}`); });
    // kill feed (P-12): hud-feed.js decides what is worth a line (no AI-vs-AI cannon or bump noise, one line per contact, repeats merge)
    ev.on('missile:launch', (e) => { const f = launchEntry(e, me); if (f) this.addFeed(f); if (e.target && me(e.target)) this.lockedByT = 0; });
    // the shield already reports itself through shield:block; the missile's own "evaded by shield" would be a second popup for the same hit (E-10)
    ev.on('missile:evaded', ({ target, by }) => { if (me(target) && by !== 'shield') this.stunt(by === 'barrel' ? 'EVADED!' : 'MISSILE EVADED', '#4dff9d'); });
    ev.on('missile:warn', ({ target, missile, dist, tti, evade, interval }) => {
      if (!me(target)) return;
      if (missile !== this.warnMissile) this.warnCue = false;   // R2-P-08: a new missile starts a new wait for the ROLL! cue
      this.warnT = 0.75; this.warnDist = dist; this.warnMissile = missile; this.warnTti = Number.isFinite(tti) ? tti : null; this.warnRate = Number.isFinite(interval) ? interval : 0;
      this.warnEvade = !!evade; this.warnEvadeT = evade ? 0.45 : 0;   // P-14: while a barrel roll would break the lock, say so; each ping renews the cue
      if (evade) this.warnCue = true;
    });
    ev.on('missile:lock', ({ owner, target, progress, targetName }) => {
      if (me(owner)) { this.lockT = 0.4; this.lockTarget = target; this.lockProg = progress; this.lockName = targetName || target?.name || ''; }
      else if (me(target) && owner) { this.lockedBy = owner; this.lockedByT = 0.6; this.lockedByProg = progress; }   // V-37: a rival is locking on to you
    });
    ev.on('missile:unlock', ({ owner, target }) => { if (me(target) && owner === this.lockedBy) this.lockedByT = 0; });
    ev.on('racer:hit', (e) => {
      if (me(e.racer)) { const s = e.severity ?? 0.5; this.fx(this.dmg, 0.35 + 0.5 * clamp(s, 0, 1)); g.cameraRig?.shake?.(0.3 + 0.5 * s); }
      const f = hitEntry(e, me); if (f) this.addFeed(f);
    });
    ev.on('racer:tumble', ({ racer }) => { if (me(racer)) this.stunt('SYSTEMS RECOVERING', '#ff5a36'); });
    ev.on('emp:fire', ({ owner, pos, radius }) => { const p = g.player; if (p && owner !== p && pos && p.flight.pos.distanceTo(pos) < (radius || 150)) this.fx(this.emp, 0.9); });
    // Storm: the flash and shake for the victim, and a popup for both sides (V-20: phones hide the feed, popups survive)
    ev.on('lightning:strike', ({ owner, target }) => {
      if (me(target)) { this.fx(this.flash, 0.9); g.cameraRig?.shake?.(0.7); this.stunt('HIT BY STORM', '#7aa8ff'); }
      else if (me(owner)) this.stunt(`STORM HIT ${target?.name || 'RIVAL'}`, '#7aa8ff');
    });
    ev.on('shield:block', ({ racer }) => { if (me(racer)) this.stunt('SHIELD BLOCKED', '#33d6ff'); });   // damage.js emits { racer, by, kind } (E-10: this read `victim`)
    // P-15: items.js stepClouds emits { racer, owner, duration } when a racer enters a smoke cloud while not blind. Only the local player's screen fogs (updateSmoke); a rival's blindness is theirs
    ev.on('smoke:blind', ({ racer, duration }) => { if (me(racer)) { this.smokeDur = duration > 0 ? duration : 1.2; this.smokeT = this.smokeDur; } });
    ev.on('input:camera', () => { this.camPending = true; });   // the rig cycles in its own listener (after this one): read the new mode next frame
    ev.on('input:lookback', () => this.showNote('REAR VIEW'));
    ev.on('game:pause', () => { this.el.classList.add('paused'); });
    ev.on('game:resume', () => { this.el.classList.remove('paused'); });
    this.reduce = reduce;
  }

  pop(el, text, cls) { el.textContent = text; el.classList.remove('cd-pop', 'cd-go'); void el.offsetWidth; el.classList.add(cls); this._zones = null; }
  flashBanner(text, cls, secs = 2.6) { this._zones = null; this.banner.textContent = text; this.banner.className = 'hud-banner on ' + cls; clearTimeout(this._bT); this._bT = setTimeout(() => { this.banner.className = 'hud-banner'; if (cls !== 'finish') this.banner.textContent = ''; }, secs * 1000); }
  /**
   * One popup line per KIND of stunt (V-3). Every kind keeps a running tally (count and bonus) for as long as the combo lasts, i.e. while any popup is still
   * on screen and the kind was seen in the last TALLY_SECS: a repeat merges into its line ("BARREL ROLL x3 +18%"), moves it back to the top and restarts its
   * timer, and a kind that the two-line cap pushed out comes back with its tally. So alternating PERFECT GATE / NEAR MISS / ROLL stays at two lines.
   */
  stunt(text, color, reward = 0) {
    this._zones = null;   // the popup column changed: the nameplates re-plan round it on the next frame
    if (!this.popups.length) this.tally.clear();
    const was = this.tally.get(text), live = was && this.clock - was.t <= TALLY_SECS;
    const t = { n: live ? was.n + 1 : 1, sum: (live ? was.sum : 0) + reward, t: this.clock };
    this.tally.set(text, t);
    const old = this.popups.find((p) => p.dataset.base === text && p.isConnected);
    if (old) {
      old.dataset.n = t.n; old.dataset.sum = t.sum; old.textContent = popupText(text, t.n, t.sum);
      this.popups.splice(this.popups.indexOf(old), 1); this.popups.push(old); this.stack.prepend(old);
      old.style.animation = 'none'; void old.offsetWidth; old.style.animation = '';   // restart the timer
      return;
    }
    const e = h('div', { class: 'popup', style: `--c:${color}`, 'data-base': text, 'data-n': t.n, 'data-sum': t.sum }, popupText(text, t.n, t.sum));
    this.stack.prepend(e); this.popups.push(e);
    while (this.popups.length > POPUP_MAX) this.popups.shift().remove();
    e.addEventListener('animationend', () => { e.remove(); const i = this.popups.indexOf(e); if (i >= 0) this.popups.splice(i, 1); }, { once: true });
  }
  /** A plain line about the player (passes, pickups, item use) for the feed. */
  say(text) { this.addFeed({ key: 'say:' + text, text, mine: true }); }
  addFeed(entry) { if (this.feed.add(entry)) this.syncFeed(); }
  /** Mirror feed.lines into the ticker list: one <li> per line, a bump when a repeat merges, fade in the last second. */
  syncFeed() {
    this._zones = null;
    const live = new Set();
    for (const l of this.feed.lines) {
      live.add(l.id);
      let li = this.feedEls.get(l.id);
      if (!li) { li = h('li', { class: l.mine ? 'mine' : '' }); this.feedEls.set(l.id, li); this.tickEl.append(li); li.dataset.n = 1; }
      const t = feedText(l);
      if (li.textContent !== t) { li.textContent = t; if (Number(li.dataset.n) !== l.n) { li.dataset.n = l.n; li.classList.remove('bump'); void li.offsetWidth; li.classList.add('bump'); } }
      li.classList.toggle('mine', l.mine);
    }
    for (const [id, li] of this.feedEls) if (!live.has(id)) { li.remove(); this.feedEls.delete(id); }
  }
  /** The camera note ("CAMERA: LOW", "REAR VIEW"): a pill that fades by itself (CSS animation), a visual tick next to the sound the audio agent plays. */
  showNote(text) { this.note.textContent = text; this.note.classList.remove('on'); void this.note.offsetWidth; this.note.classList.add('on'); }
  fx(el, a) {
    const s = this.game.settings.reduceFlash ? Math.min(a, 0.35) * 0.5 : a;
    el.style.setProperty('--a', Math.min(s, el === this.flash ? FLASH_MAX : 1).toFixed(2)); el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
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
    const c = this.c, fs = p.flight; this.clock += dt;
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
    if (this.feed.tick(dt)) this.syncFeed();
    for (const l of this.feed.lines) this.feedEls.get(l.id)?.classList.toggle('fade', l.ttl - l.age < 1);
    if (this.camPending) { this.camPending = false; const nm = game.state === 'race' ? CAM_NAMES[game.cameraRig?.mode] : null; if (nm) this.showNote('CAMERA: ' + nm); }   // the rig only cycles during a race (camera.js)
    this.updateAlerts(dt, p); this.updateSmoke(dt, p); this.updateAuto(game, p, race);
    this.lockT -= dt; this.updatePlates(game, p, race);
    // finish panel
    if (game.state === 'finish' || p.finished) { this.finishT += dt; if (this.finishT > 0.3 && Math.floor(this.finishT * 4) !== c.fin) { c.fin = Math.floor(this.finishT * 4); this.updateFinish(race, p); } }
    this.t30 += dt; if (this.t30 > 0.045) { this.t30 = 0; this.drawMap(); }
    this.el.classList.toggle('calm', !!game.settings.reduceFlash);
  }

  /**
   * P-15: the smoke fog over the 3D view, under every panel. Its strength is the time the player is still blind as a share of the blind time `smoke:blind` announced: items.js keeps
   * the racer's own `blind` timer at the full duration while it is inside the cloud and counts it down after it leaves, so the fog holds as long as the lock-on penalty does and
   * then clears linearly over `duration`; the event's own clock covers a payload whose racer carries no timer. It comes in fast (0.15 s), never above SMOKE_MAX, and with
   * Reduce flashing it comes in over 0.6 s to SMOKE_CALM. A haze that only rises and falls: nothing here pulses.
   */
  updateSmoke(dt, p) {
    if (this.smokeT > 0) this.smokeT -= dt;
    const calm = !!this.game.settings.reduceFlash, dur = this.smokeDur;
    const want = dur > 0 ? clamp(Math.max(this.smokeT, p.blind || 0) / dur, 0, 1) : 0;
    this.smokeA = want > this.smokeA ? Math.min(want, this.smokeA + dt / (calm ? 0.6 : 0.15)) : want;
    if (this.smokeA > 0 && this.smokeTex === undefined) {   // R2-V-17: the cloud texture is made the first time the fog is needed (a few ms, once), not at every load
      this.smokeTex = smokeTexture();
      if (this.smokeTex) this.smoke.style.setProperty('--smoke-tex', `url(${this.smokeTex})`);
    }
    this.set('smoke', Math.round(this.smokeA * (calm ? SMOKE_CALM : SMOKE_MAX) * 100), (v) => { this.smoke.style.opacity = (v / 100).toFixed(2); });
    // the puffs drift only where motion is welcome and the frame has time to spare: not with Reduce flashing & motion, not on the Low quality tier (a still cloud there)
    this.set('smokeDrift', this.smokeA > 0 && !calm && this.game.qualityId !== 'low', (v) => this.smoke.classList.toggle('drift', v));
  }

  /**
   * R2 T7: the hands-off notice. `game.input.handsOffT` (flight/input.js) is the seconds the keyboard guide has flown with no key pressed (it stays 0 for a pad, touch, Pro, a tumble: anything
   * that is not guided flight). From AUTO_FROM s of it race.js eases the craft to a slower pace until any key is pressed; the plate shows over the same span, in a running race only, and goes
   * the frame after a key resets the timer (CSS fades it over 0.25 s). No sound, no motion.
   */
  updateAuto(game, p, race) {
    const on = game.state === 'race' && race.state === 'racing' && !p.finished && (game.input?.handsOffT || 0) >= AUTO_FROM;
    this.set('auto', on, (v) => { this.autoEl.classList.toggle('on', v); this._zones = null; });
  }

  /** Alert column for this frame: missile warning (+ ROLL cue while a barrel roll would break it) and lock-on warning, each shown only while its timer runs. */
  updateAlerts(dt, p) {
    if (this.warnT > 0) this.warnT -= dt;
    if (this.warnEvadeT > 0) this.warnEvadeT -= dt;
    if (this.lockedByT > 0) this.lockedByT -= dt;
    const miss = this.warnT > 0, lock = this.lockedByT > 0 && !!this.lockedBy, roll = miss && this.warnEvade && this.warnEvadeT > 0 && !(p.flight.barrel.t > 0);
    this.set('alert', (miss ? 1 : 0) + (lock ? 2 : 0) + (roll ? 4 : 0), (v) => {
      this.warn.style.display = v ? '' : 'none';
      this.warnTxt.style.display = this.warnArrow.style.display = v & 1 ? '' : 'none';
      this.rollEl.style.display = v & 4 ? '' : 'none';
      this.lockTxt.style.display = v & 2 && !(v & 1) ? '' : 'none';   // one line at a time in the column: a missile in flight outranks a lock
      this.lockArrow.style.display = v & 2 ? '' : 'none';
      this._zones = null;
    });
    if (miss) this.updateWarn(p);
    if (lock) this.updateLockOn(p);
  }
  updateWarn(p) {
    const w = this.warn, d = this.warnDist, tti = this.warnTti;
    // P-14: intensity follows the time to impact when the missile reports one (distance otherwise): blink at the ping rate, bigger and redder text, "CLOSE" under 1.8 s
    const near = tti != null ? clamp(1 - tti / 4, 0, 1) : clamp(1 - d / 400, 0, 1), close = tti != null ? tti < 1.8 : d < 160;
    w.style.setProperty('--rate', clamp(this.warnRate || 0.9 - near * 0.65, 0.25, 0.9).toFixed(2) + 's');
    w.style.setProperty('--near', near.toFixed(2));
    w.classList.toggle('close', close);
    // R2-P-08: a roll only evades from the moment the ROLL! cue shows (about half a second before impact); "CLOSE" shows from tti 1.8 s, and a roll begun on it
    // fails every time (4 of 4 in the browser). So while the cue is still to come the line says to wait for it; once the cue has shown (or a roll is under way,
    // or no roll is possible: cooldown, tumble, EMP, stall), it is plain MISSILE CLOSE!. A warning that carries no time to impact has no cue to wait for.
    const wait = close && tti != null && !this.warnCue && !(this.warnEvadeT > 0) && this.canRoll(p);
    this.warnTxt.lastChild.textContent = close ? (wait ? 'MISSILE CLOSE: WAIT FOR ROLL!' : 'MISSILE CLOSE!') : 'MISSILE!';
    const m = this.warnMissile?.pos, cam = this.game.camera;
    if (m) {
      cam.updateMatrixWorld(); _v.copy(m).applyMatrix4(cam.matrixWorldInverse);
      const a = Math.atan2(_v.x, _v.y + 1e-3); this.warnArrow.style.display = ''; this.warnArrow.style.transform = `rotate(${a}rad) translateY(-26vmin)`;
    } else this.warnArrow.style.display = 'none';
  }
  /** Could the player start a barrel roll this instant? (items.js: no cooldown, not rolling, not tumbling, not stalled, not EMP'd.) */
  canRoll(p) { const it = this.game.race?.items; return it?.canRoll ? !!it.canRoll(p) : true; }
  /** V-37: a rival is locking on. The text names it; the arrow sits on a ring round the screen centre at its bearing from the player's heading (up = ahead, down = behind). */
  updateLockOn(p) {
    const o = this.lockedBy, fs = p.flight, locked = this.lockedByProg >= 1;
    this.lockTxt.lastChild.textContent = locked ? `LOCKED ON BY ${o.name}` : `${o.name} IS LOCKING ON`;
    this.lockTxt.classList.toggle('locked', locked); this.lockArrow.classList.toggle('locked', locked);
    _v.copy(o.render?.pos || o.flight.pos).sub(p.render?.pos || fs.pos);
    const a = Math.atan2(_v.dot(fs.right), _v.dot(fs.forward)), g = this.game, sc = this._scr || (this._scr = { x: 0, y: 0, z: 0 });
    let cx = g.width * 0.5, cy = g.height * 0.62;   // the ring is centred on the player's craft (the chase camera keeps it near this spot), clear of the alert column at the top
    _v.copy(p.render?.pos || fs.pos); if (this.project(_v, sc)) { cx = sc.x; cy = sc.y; }
    this.lockArrow.style.transform = `translate(${cx.toFixed(0)}px,${cy.toFixed(0)}px) rotate(${a.toFixed(3)}rad) translateY(${(-0.15 * Math.min(g.width, g.height)).toFixed(0)}px)`;
  }

  project(pos, out) { const g = this.game, cam = g.camera; _v.copy(pos); _v.project(cam); out.x = (_v.x * 0.5 + 0.5) * g.width; out.y = (-_v.y * 0.5 + 0.5) * g.height; out.z = _v.z; return _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1; }
  updatePlates(game, p, race) {
    game.camera.updateMatrixWorld();
    const scr = this._scr || (this._scr = { x: 0, y: 0, z: 0 }), pp = p.render?.pos || p.flight.pos;
    // lock reticle, named after its target (P-14); its box (ring + name) is one more obstacle for the plates below (P-18)
    let rz = null;
    if (this.lockT > 0 && this.lockTarget && this.project((this.lockTarget.render?.pos || this.lockTarget.flight.pos), scr)) {
      const locked = this.lockProg >= 1;
      if (this.reticle.style.display === 'none') { this._rm = null; this._side = 'below'; this._push = 0; this.reticle.dataset.side = 'below'; this.reticle.style.setProperty('--lp', '0px'); }   // each lock starts with its name under the ring
      this.reticle.style.display = ''; this.reticle.style.transform = `translate(${scr.x.toFixed(0)}px,${scr.y.toFixed(0)}px) translate(-50%,-50%)`;
      this.lockFg.style.strokeDashoffset = (100 - this.lockProg * 100).toFixed(1); this.reticle.classList.toggle('locked', locked);
      this.set('lockLbl', (locked ? 'LOCKED: ' : '') + this.lockName, (v) => { this.lockLbl.textContent = v; this._rm = null; });
      const zs = this.zones();   // first: a refresh of the zones clears the reticle's measured box, which is measured again just below
      if (!this._rm) this.measureReticle();
      if (this.placeLabel(scr.x, scr.y, p, zs)) this.measureReticle();   // the name moved to another side of the ring: the box the nameplates avoid moved with it
      const m = this._rm; rz = this._rz || (this._rz = { l: 0, t: 0, r: 0, b: 0 });
      rz.l = scr.x + m.l; rz.t = scr.y + m.t; rz.r = scr.x + m.r; rz.b = scr.y + m.b;
    } else if (this.reticle.style.display !== 'none') this.reticle.style.display = 'none';
    // nameplates (P-18): the nearest visible rivals, laid out clear of each other, the screen edges, every HUD panel and every touch button
    const near = this._near || (this._near = []); near.length = 0;
    const locked = this.lockT > 0 ? this.lockTarget : null;   // the lock reticle names its target: a second plate would sit under the ring
    for (const r of race.racers) { if (r === p || r === locked) continue; const rp = r.render?.pos || r.flight.pos, d = rp.distanceTo(pp); if (d < 420 && d > 12) near.push([d, r]); }
    near.sort((a, b) => a[0] - b[0]);
    const cands = this._cands || (this._cands = []); cands.length = 0;
    for (let i = 0; i < near.length && cands.length < this.plates.length; i++) {
      const [d, r] = near[i]; _v.copy(r.render?.pos || r.flight.pos); _v.y += 6;
      if (this.project(_v, scr)) cands.push({ id: r.id, r, d, x: scr.x, y: scr.y, w: 0, h: 0, pl: null });
    }
    const claim = ++this._claim;   // a rival keeps its plate while it stays a candidate (no text churn); a new one takes a free plate
    for (const c of cands) for (const q of this.plates) if (q.id === c.id) { q.claim = claim; c.pl = q; break; }
    for (const c of cands) if (!c.pl) for (const q of this.plates) if (q.claim !== claim) { q.claim = claim; q.id = c.id; q.w = 0; q.el.textContent = c.r.name; q.el.style.setProperty('--c', c.r.pilot?.color || '#fff'); c.pl = q; break; }
    for (const c of cands) { if (!c.pl.w) this.measure(c.pl); c.w = c.pl.w; c.h = c.pl.h; }
    const zl = this._zl || (this._zl = []); zl.length = 0; for (const z of this.zones()) zl.push(z); if (rz) zl.push(rz);
    const out = layoutPlates(cands, zl, game.width, game.height);
    for (const q of this.plates) q.on = false;
    for (const o of out) {
      const c = cands[o.i], q = c.pl; q.on = true;
      q.el.style.display = ''; q.el.style.opacity = clamp(1.25 - c.d / 340, 0.15, 1).toFixed(2);
      q.el.style.transform = `translate(${o.l.toFixed(0)}px,${o.t.toFixed(0)}px)`;
    }
    for (const q of this.plates) if (!q.on && q.el.style.display !== 'none') q.el.style.display = 'none';
  }
  measure(q) { q.el.style.display = ''; q.w = q.el.offsetWidth; q.h = q.el.offsetHeight; }
  /** Offsets of the reticle's box (the ring and the name under it) from the ring's centre. Reads layout, so it is cached: redone when the reticle appears, its name changes or the zones refresh. */
  measureReticle() {
    const a = this.reticle.getBoundingClientRect(), b = this.lockLbl.getBoundingClientRect(), cx = a.left + a.width / 2, cy = a.top + a.height / 2;
    this._rm = { l: Math.min(a.left, b.left) - cx, t: Math.min(a.top, b.top) - cy, r: Math.max(a.right, b.right) - cx, b: Math.max(a.bottom, b.bottom) - cy };
    this._lm = { w: b.width, h: b.height, r: a.width / 2 };   // the name's size and the ring box's half-size (the same for every side)
  }
  /**
   * R2 P-18: the player's craft on the screen: every vertex of its visible meshes projected through the camera, with CRAFT_PAD of air. (A box round the craft is no use: the wing
   * tips and tail are the near corners, which project far wider than the craft is, and the name then has no free side.) Measured every CRAFT_EVERY ms, not every frame.
   * null when a vertex is behind the camera (the nose view: no craft to keep clear) or the craft has no meshes (headless).
   */
  craftRect(p) {
    const m = p.model; if (!m) return null;
    const now = performance.now();
    if (this._crModel === m && now - this._crT < CRAFT_EVERY) return this._crOk ? this._cr : null;
    this._crModel = m; this._crT = now; this._crOk = false;
    this.game.camera.updateMatrixWorld(); m.updateWorldMatrix(true, true);
    const sc = this._csc, cr = this._cr; let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity, behind = false;
    m.traverse((o) => {
      const pos = o.isMesh && o.visible && o.geometry?.attributes.position; if (!pos || behind) return;
      for (let i = 0; i < pos.count; i++) {
        _c.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); this.project(_c, sc);
        if (sc.z >= 1) { behind = true; return; }
        if (sc.x < l) l = sc.x; if (sc.x > r) r = sc.x; if (sc.y < t) t = sc.y; if (sc.y > b) b = sc.y;
      }
    });
    if (behind || !(l < r)) return null;
    cr.l = l - CRAFT_PAD; cr.t = t - CRAFT_PAD; cr.r = r + CRAFT_PAD; cr.b = b + CRAFT_PAD; this._crOk = true;
    return cr;
  }
  /** Put the lock reticle's name on the side of the ring that keeps it off the player's craft (hud-layout.js lockLabelSide). True when the side changed. */
  placeLabel(x, y, p, zones) {
    const m = this._lm; if (!m) return false;
    const g = this.game, side = lockLabelSide({ x, y, r: m.r }, { w: m.w, h: m.h }, this.craftRect(p), zones, g.width, g.height, this._side);
    const push = lockLabelPush(side, { x, y, r: m.r }, { w: m.w, h: m.h }, this.craftRect(p));
    if (side === this._side && push === this._push) return false;
    this._side = side; this._push = push; this.reticle.dataset.side = side; this.reticle.style.setProperty('--lp', push + 'px'); return true;
  }
  /** Rectangles the nameplates must stay out of: the HUD panels, the alerts and the touch buttons. Re-measured at 5 Hz (it reads layout), not every frame. */
  zones() {
    const now = performance.now();
    if (this._zones && now - this._zonesT < 200) return this._zones;
    const out = this._zones || (this._zones = []); out.length = 0; this._zonesT = now; this._rm = null;   // a resize, a font or a settings change moves the reticle's box too
    const els = this._ze || (this._ze = ['.hud-lapbox', '.hud-pos', '.hud-ticker', '.hud-speed', '.hud-bc', '.hud-item', '.hud-shield', '.hud-map', '.hud-finish', '.hud-popups', '.hud-banner', '.hud-cd', '.hud-cdhint',
      '.warn-txt', '.warn-roll', '.lockon-txt', '.hud-note', '.hud-wrong'].map((s) => this.el.querySelector(s)));
    const add = (e) => { const r = e.getBoundingClientRect(); if (r.width > 1 && r.height > 1) out.push({ l: r.left, t: r.top, r: r.right, b: r.bottom }); };
    for (const e of els) if (e) add(e);
    if (this.autoEl.classList.contains('on')) add(this.autoEl);   // R2 T7: only while it shows (hidden, it still has a box)
    const touch = document.getElementById('sb-touch');
    if (touch && touch.style.display !== 'none') for (const b of touch.children) if (b.textContent.trim()) add(b);
    return out;
  }

  updateFinish(race, p) {
    const rows = race.standings().slice(0, 8).map((r, i) => h('li', { class: r === p ? 'me' : '' }, h('b', null, i + 1), h('span', null, r.name), h('em', null, r.finished ? fmtTime(r.finishTime) : '...')));
    this.finishBox.replaceChildren(h('div', { class: 'fin-t' }, 'LIVE STANDINGS'), h('ol', null, rows)); this.finishBox.style.display = '';
  }
}
