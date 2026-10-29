// SKYBLITZ front end: router, flow (Quick Race / Grand Prix / Time Trial), settings plumbing, HUD host. Owner: UI agent.
// Contract (unchanged): constructor(game); init(); show(screen); hide(screen); update(dt, game). Additions: goto(name, params), back(),
// startFlow(mode), launch(), restart(), quit(toMain), setSetting(k, v), cue(name).
// Screen names: title main settings controls credits aircraft course options loading hint pause results podium   (HUD is separate: ui.hud).
import { h, ordinal } from './dom.js';
import { loadSave, writeSave, recordResult } from './save.js';
import { Nav } from './nav.js';
import { Hud } from './hud.js';
import { titleScreen, mainScreen, settingsScreen, controlsScreen, creditsScreen, pauseScreen, btn } from './menus.js';
import { aircraftScreen, courseScreen, optionsScreen, loadingScreen } from './select.js';
import { resultsScreen, podiumScreen } from './results.js';
import { DEFAULT_SETTINGS } from '../config.js';
import { COURSES } from '../world/courses/index.js';

const GP_ORDER = ['sunrise', 'redrock', 'neon', 'frost'];

export class UI {
  constructor(game) {
    this.game = game; this.root = document.getElementById('ui');
    this.screens = {}; this.cur = null; this.params = null; this.flow = { mode: 'quick' }; this.save = loadSave();
    this.gp = null; this.pending = null; this.lastResults = null; this.afterTitle = null; this.hintOpen = false;
  }

  init() {
    const g = this.game;
    this.root.classList.add('sb-ui');
    this.layer = h('div', { class: 'layer' }); this.root.append(this.layer);
    const defs = { title: titleScreen, main: mainScreen, settings: settingsScreen, controls: controlsScreen, credits: creditsScreen, aircraft: aircraftScreen, course: courseScreen, options: optionsScreen, loading: loadingScreen, pause: pauseScreen, results: resultsScreen, podium: podiumScreen };
    for (const k in defs) { const s = defs[k](this); s.name = k; s.el.hidden = true; s.el.dataset.screen = k; s.el.setAttribute('role', 'region'); s.el.setAttribute('aria-label', k); this.layer.append(s.el); this.screens[k] = s; }
    this.screens.hint = this.makeHint(); this.screens.hint.name = 'hint'; this.screens.hint.el.hidden = true; this.layer.append(this.screens.hint.el);
    this.nav = new Nav(this); this.hud = new Hud(this);
    this.toastEl = h('div', { class: 'toast', role: 'alert', hidden: true }); this.root.append(this.toastEl);
    this.fpsEl = h('div', { class: 'fps', hidden: true }); this.root.append(this.fpsEl);
    this.applySettingsClasses();
    const ev = g.events;
    ev.on('game:state', ({ to }) => this.onState(to));
    ev.on('game:pause', () => { if (g.state === 'race' && !this.hintOpen) this.goto('pause'); });
    ev.on('game:resume', () => { if (this.hintOpen) return; if (this.cur && this.cur.name !== 'loading') this.hideAll(); });
    ev.on('game:raceStart', () => this.onRaceStart());
    ev.on('game:error', ({ error }) => { this.toast('Something went wrong: ' + (error?.message || 'unknown error')); if (this.cur?.name === 'loading') this.goto('main'); });
    ev.on('settings:change', ({ key }) => { if (key === 'reduceFlash' || key === 'showFps') this.applySettingsClasses(); });
    addEventListener('keydown', (e) => { if (this.cur?.name === 'title' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && e.code !== 'Escape' && !/^(Shift|Control|Alt|Meta|F\d+|Tab)/.test(e.code)) { e.preventDefault(); this.goto('main'); } }, true);
  }

  cue(name) { this.game.events.emit(name, {}); }
  toast(msg, ms = 3500) { this.toastEl.textContent = msg; this.toastEl.hidden = false; clearTimeout(this._tT); this._tT = setTimeout(() => { this.toastEl.hidden = true; }, ms); this.cue('ui:error'); }

  // ------------------------------------------------------------------ router
  activeRoot() { return this.cur && !this.cur.el.hidden ? this.cur.el : null; }
  menuOpen() { return !!this.activeRoot(); }
  show(screen) {
    if (screen === 'title') { if (this.afterTitle) { const n = this.afterTitle; this.afterTitle = null; this.goto(n); } else if (!this.cur || this.cur.name === 'loading') this.goto('title'); }
    else this.goto(screen);
  }
  hide(screen) { if (!screen || this.cur?.name === screen) this.hideAll(); }
  hideAll() { if (this.cur) { this.cur.leave?.(); this.cur.el.hidden = true; this.cur = null; } this.syncInput(); }
  goto(name, params = null) {
    const s = this.screens[name]; if (!s) { console.warn('[ui] unknown screen', name); return; }
    if (this.cur === s) { this.params = params; s.enter?.(params); return; }
    if (this.cur) { this.cur.leave?.(); this.cur.el.hidden = true; }
    this.cur = s; this.params = params; s.el.hidden = false;
    s.el.classList.remove('on'); void s.el.offsetWidth; s.el.classList.add('on');
    s.enter?.(params);
    this.root.dataset.screen = name;
    this.syncInput();
    requestAnimationFrame(() => { if (this.cur === s && name !== 'loading') this.nav.ensureFocus(); });
  }
  back() {
    const s = this.cur; if (!s) return;
    if (!s.back) return;
    this.cue('ui:back');
    const n = s.back(this.params);
    if (typeof n === 'string') this.goto(n);
  }
  syncInput() {
    const g = this.game, open = this.menuOpen();
    g.input?.enable?.(!open);
    document.body.classList.toggle('menu-open', open);
  }

  onState(to) {
    const g = this.game;
    this.hud.show(to === 'race' || to === 'finish');
    if (to === 'race' || to === 'demo') { this.hideAll(); this.hintOpen = false; }
    else if (to === 'loading') { if (this.cur?.name !== 'loading') this.goto('loading'); }
    else if (to === 'results') { this.buildResults(); this.goto('results'); }
    else if (to === 'title' && !this.cur) { /* title screen arrives via show('title') */ }
    if (to === 'finish') this.syncInput();
  }

  // ------------------------------------------------------------------ settings
  setSetting(key, value) {
    const g = this.game;
    if (key === 'quality') g.setQuality(value);
    else { g.settings[key] = value; g.events.emit('settings:change', { key, value }); }
    g.saveSettings();
  }
  resetSettings() {
    for (const k of ['masterVolume', 'musicVolume', 'sfxVolume', 'pitchMode', 'assist', 'shake', 'showFps', 'doubleTapRoll', 'reduceFlash', 'difficulty']) this.setSetting(k, DEFAULT_SETTINGS[k]);
    this.setSetting('quality', DEFAULT_SETTINGS.quality);
    this.screens.settings.enter?.(); this.cue('ui:click');
  }
  applySettingsClasses() {
    const s = this.game.settings; this.root.classList.toggle('calm', !!s.reduceFlash); this.fpsEl.hidden = !s.showFps;
  }

  // ------------------------------------------------------------------ flow
  startFlow(mode) {
    const l = this.save.last, s = this.game.settings;
    this.flow = { mode, craft: l.craft || s.lastCraft, livery: l.livery || 0, course: l.course, difficulty: s.difficulty || l.difficulty || 'normal', laps: l.laps || 3, fromMenu: true };
    if (mode === 'gp') { this.gp = null; this.pending = null; }
    this.goto('aircraft');
  }
  after(screen) {
    const f = this.flow;
    if (screen === 'aircraft') this.goto(f.mode === 'gp' ? 'options' : 'course');
    else if (screen === 'course') { if (f.mode === 'trial') this.launch(); else this.goto('options'); }
  }
  makeCfg(courseId) {
    const f = this.flow;
    return { courseId, craftId: f.craft, livery: f.livery || 0, difficulty: f.difficulty, laps: f.mode === 'quick' ? f.laps : 3, bots: f.mode === 'trial' ? 0 : 7, mode: f.mode };
  }
  launch() {
    const f = this.flow, s = this.save;
    s.last = { craft: f.craft, livery: f.livery || 0, course: f.course, difficulty: f.difficulty, laps: f.laps }; writeSave(s);
    this.game.settings.lastCraft = f.craft; this.game.settings.lastCourse = f.course || this.game.settings.lastCourse; this.game.saveSettings();
    if (f.mode === 'gp') { this.gp = { race: 0, totals: {} }; this.pending = null; f.course = GP_ORDER[0]; }
    this.runRace(this.makeCfg(f.course));
  }
  async runRace(cfg) {
    this.flow.cfg = cfg; this.flow.course = cfg.courseId; this.flow.fromMenu = true; this.hud.show(false);
    this.goto('loading');
    let race = null;
    try { race = await this.game.startRace(cfg); } catch (e) { console.error(e); }
    if (!race) { this.toast('Could not start the race.'); this.goto('main'); }
  }
  restart() {
    const g = this.game; this.pending = null;
    if (g.paused) g.setPaused(false);
    this.hideAll();
    if (this.flow.cfg) this.runRace({ ...this.flow.cfg, seed: undefined });
  }
  quit(toMain) {
    const g = this.game; this.afterTitle = toMain ? 'main' : null; this.pending = null; this.hintOpen = false;
    if (g.paused) g.setPaused(false);
    this.hud.show(false); this.goto('loading'); this.screens.loading.el.querySelector('.ld-h').textContent = 'RETURNING TO THE HANGAR';
    g.quit();
  }
  makeHint() {
    const g = this.game;
    const list = h('ul', { class: 'hint-list' });
    const go = btn('Got it - let\'s race', () => this.dismissHint(), { cls: 'primary big', first: true, cue: 'ui:confirm' });
    const el = h('div', { class: 'scr hint' }, h('div', { class: 'panel hint-panel' }, h('h2', { class: 'skew' }, h('span', null, 'BEFORE YOU FLY')), list, go));
    return { el, transparent: true, back: () => { this.dismissHint(); return null; },
      enter() { list.replaceChildren(...g.input.bindingsText()[g.input.touchActive ? 2 : 0].rows.slice(0, g.input.touchActive ? 4 : 7).map(([k, a]) => h('li', null, h('b', null, k), h('span', null, a)))); } };
  }
  dismissHint() { this.hintOpen = false; this.save.hintsSeen = true; writeSave(this.save); this.hideAll(); this.game.setPaused(false); }
  onRaceStart() {
    const g = this.game, f = this.flow;
    if (!f.fromMenu || g.race?.demo || this.save.hintsSeen || g.race?.autopilot) return;
    f.fromMenu = false; this.hintOpen = true; g.setPaused(true); this.goto('hint');
  }

  // ------------------------------------------------------------------ results / Grand Prix
  buildResults() {
    const g = this.game, race = g.race, f = this.flow; if (!race) return;
    const res = race.results().standings, me = res.find((x) => x.racer === g.player);
    const rows = res.map((x) => ({ place: x.place, name: x.racer.name, color: x.racer.pilot?.color || (x.racer === g.player ? '#ffd02e' : '#fff'), craft: x.racer.spec?.name || '', time: x.time, best: x.bestLap, points: x.points, me: x.racer === g.player }));
    let rec = null;
    if (me && !race.autopilot && f.mode !== 'demo') rec = recordResult(this.save, race.course?.id || f.course, g.player.spec?.id || f.craft, { lap: me.bestLap, race: me.time });
    const gpIndex = this.gp?.race ?? 0;
    this.lastResults = { rows, rec, stats: g.player?.stats, courseId: race.course?.id || f.course, laps: race.laps, difficulty: f.difficulty, gpIndex };
    if (f.mode === 'gp') { this.pending = {}; for (const x of res) this.pending[x.racer.name] = { pts: x.points, win: x.place === 1 ? 1 : 0, color: x.racer.pilot?.color || '#ffd02e', isPlayer: x.racer === g.player }; }
  }
  gpStandings() {
    const map = {}, add = (n, o) => { const t = (map[n] ||= { name: n, points: 0, wins: 0, color: o.color, isPlayer: o.isPlayer }); t.points += o.pts ?? o.points ?? 0; t.wins += o.win ?? o.wins ?? 0; };
    for (const n in this.gp?.totals || {}) add(n, this.gp.totals[n]);
    for (const n in this.pending || {}) add(n, this.pending[n]);
    return Object.values(map).sort((a, b) => b.points - a.points || b.wins - a.wins);
  }
  nextGP() {
    const gp = this.gp || (this.gp = { race: 0, totals: {} });
    for (const n in this.pending || {}) { const o = this.pending[n], t = (gp.totals[n] ||= { points: 0, wins: 0, color: o.color, isPlayer: o.isPlayer }); t.points += o.pts; t.wins += o.win; }
    this.pending = null; gp.race++;
    if (gp.race > 3) { this.save.gp = null; writeSave(this.save); this.goto('podium'); return; }
    this.save.gp = { race: gp.race, craft: this.flow.craft, livery: this.flow.livery, difficulty: this.flow.difficulty, totals: gp.totals }; writeSave(this.save);
    this.flow.course = GP_ORDER[gp.race]; this.runRace(this.makeCfg(GP_ORDER[gp.race]));
  }
  resumeGP() {
    const s = this.save.gp; if (!s) return;
    this.gp = { race: s.race, totals: s.totals || {} }; this.pending = null;
    this.flow = { mode: 'gp', craft: s.craft, livery: s.livery, difficulty: s.difficulty, laps: 3, course: GP_ORDER[s.race], fromMenu: true };
    this.runRace(this.makeCfg(GP_ORDER[s.race]));
  }
  clearGP() { this.gp = null; this.pending = null; this.save.gp = null; writeSave(this.save); }

  // ------------------------------------------------------------------ per frame
  update(dt, game) {
    this.nav.poll(dt);
    const tch = !!game.input?.touchActive; if (tch !== this._tch) { this._tch = tch; this.root.classList.toggle('touch', tch); }
    if (this.hud.el.style.display !== 'none') this.hud.update(dt, game);
    if (!this.fpsEl.hidden) { this._f = (this._f || 0) + dt; if (this._f > 0.5) { this._f = 0; this.fpsEl.textContent = Math.round(game.perf.fps) + ' fps  ' + game.perf.frameMs.toFixed(1) + ' ms'; } }
  }
}
