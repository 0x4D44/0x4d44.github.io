// Title, main menu, settings, controls, credits and pause screens. Owner: UI agent.
import { h, esc, mdNodes } from './dom.js';
import { icon, MISC } from './icons.js';
import { gpLabel } from './save.js';

/** Parallelogram button. opts: { cls, ico, sub, cue } */
export function btn(label, onClick, opts = {}) {
  const b = h('button', { type: 'button', class: 'btn ' + (opts.cls || ''), 'data-nav': opts.first ? 'first' : '', 'data-cue': opts.cue || '', 'aria-label': opts.aria }, h('span', { class: 'btn-in' }, opts.ico ? icon(opts.ico) : null, h('span', { class: 'btn-t' }, label), opts.sub ? h('small', null, opts.sub) : null));
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
export function header(title, sub) { return h('header', { class: 'hdr' }, h('h2', { class: 'skew' }, h('span', null, title)), sub ? h('p', null, sub) : null); }
export function footer(ui, extra = [], backLabel = 'Back') { return h('footer', { class: 'ftr' }, btn(backLabel, () => ui.back(), { cls: 'ghost back', cue: 'ui:back' }), h('div', { class: 'ftr-r' }, extra)); }

export function titleScreen(ui) {
  const logo = h('div', { class: 'logo' }, h('div', { class: 'logo-top' }, 'AIR RACING GRAND PRIX'),
    h('h1', { 'aria-label': 'Skyblitz' }, h('span', { class: 'l1' }, 'SKY'), h('span', { class: 'l2' }, 'BLITZ')),
    h('div', { class: 'logo-swoosh', html: '<svg viewBox="0 0 300 40"><defs><linearGradient id="sw" x1="0" x2="1"><stop offset="0" stop-color="#ff3d9a" stop-opacity="0"/><stop offset=".5" stop-color="#ffd02e"/><stop offset="1" stop-color="#29d3ff"/></linearGradient></defs><path d="M0 28C70 30 190 22 300 4 220 24 110 38 0 28z" fill="url(#sw)"/></svg>' }));
  const hit = h('button', { type: 'button', class: 'title-hit', 'data-nav': 'first', 'aria-label': 'Press Enter or tap to start' }, h('span', { class: 'press' }, 'PRESS ENTER / TAP'));
  hit.addEventListener('click', () => ui.goto('main'));
  const el = h('div', { class: 'scr title' }, logo, hit, h('div', { class: 'tag' }, '8 racers. 4 courses. Loops, barrel rolls, missiles and shortcuts.'));
  return { el, anyKey: () => ui.goto('main'), noBack: true };
}

export function mainScreen(ui) {
  const g = ui.game, items = [];
  const gpSave = ui.save.gp;
  const list = h('nav', { class: 'menu', 'aria-label': 'Main menu' });
  const add = (label, fn, o) => { const b = btn(label, fn, o); list.append(b); return b; };
  add('Quick Race', () => ui.startFlow('quick'), { cls: 'primary big', first: true, sub: 'Pick a plane and a course' });
  const resume = add('Resume GP', () => ui.resumeGP(), { cls: 'big', sub: 'Continue your championship' });
  add('Grand Prix', () => ui.startFlow('gp'), { cls: 'big', sub: '4 races, one champion' });
  add('Time Trial', () => ui.startFlow('trial'), { cls: 'big', sub: 'Solo against the clock' });
  add('Settings', () => ui.goto('settings', { back: 'main' }), { ico: MISC.gear });
  add('Controls', () => ui.goto('controls', { back: 'main' }), { ico: MISC.pad });
  add('Credits', () => ui.goto('credits', { back: 'main' }), { ico: MISC.heart });
  const el = h('div', { class: 'scr main' }, h('div', { class: 'main-logo skew' }, h('b', null, 'SKY'), h('b', null, 'BLITZ')), list, h('div', { class: 'main-foot' }, 'A Mario-Kart-meets-Star-Fox air race, built for the Almanac.'));
  return {
    el, enter() {
      const label = gpLabel(ui.save.gp);   // "Race 2 of 4 - 2nd, 25 pts" (totals is an object keyed by pilot name)
      resume.style.display = ui.save.gp ? '' : 'none'; resume.querySelector('small').textContent = label;
      resume.setAttribute('aria-label', label ? `Resume Grand Prix, ${label}` : 'Resume Grand Prix');
    }, back: () => 'title',
  };
}

// ---------------------------------------------------------------- settings
export function seg(ui, label, options, get, set, id) {
  const row = h('div', { class: 'row', role: 'radiogroup', 'aria-label': label }, h('label', { class: 'row-l' }, label));
  const wrap = h('div', { class: 'seg' }); const bs = [];
  for (const o of options) {
    const b = h('button', { type: 'button', role: 'radio', class: 'opt', 'data-nav': '', 'data-id': id || '', 'aria-checked': 'false' }, o.t);
    b.addEventListener('click', () => { set(o.v); sync(); });
    bs.push([b, o]); wrap.append(b);
  }
  const sync = () => { for (const [b, o] of bs) { const on = o.v === get(); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('on', on); } };
  sync(); row.append(wrap); row.sync = sync; return row;
}
export function slider(ui, label, key, min, max, step, fmt) {
  const out = h('output', { class: 'row-v' });
  const inp = h('input', { type: 'range', min, max, step, 'data-nav': '', 'aria-label': label });
  const sync = () => { inp.value = ui.game.settings[key]; out.textContent = fmt(Number(inp.value)); inp.style.setProperty('--p', ((inp.value - min) / (max - min) * 100) + '%'); };
  inp.addEventListener('input', () => { ui.setSetting(key, Number(inp.value)); out.textContent = fmt(Number(inp.value)); inp.style.setProperty('--p', ((inp.value - min) / (max - min) * 100) + '%'); });
  inp.addEventListener('change', () => ui.cue('ui:click'));
  const row = h('div', { class: 'row' }, h('label', { class: 'row-l' }, label), h('div', { class: 'row-s' }, inp, out)); row.sync = sync; sync(); return row;
}
export function toggle(ui, label, key, hint) {
  const b = h('button', { type: 'button', role: 'switch', class: 'toggle', 'data-nav': '', 'aria-checked': 'false', 'aria-label': label }, h('i'), h('span', null, 'OFF'));
  const sync = () => { const on = !!ui.game.settings[key]; b.setAttribute('aria-checked', on); b.classList.toggle('on', on); b.lastChild.textContent = on ? 'ON' : 'OFF'; };
  b.addEventListener('click', () => { ui.setSetting(key, !ui.game.settings[key]); sync(); });
  const row = h('div', { class: 'row' }, h('label', { class: 'row-l' }, label, hint ? h('small', null, hint) : null), b); row.sync = sync; sync(); return row;
}

export function settingsScreen(ui) {
  const g = ui.game, S = () => g.settings;
  const rows = [
    seg(ui, 'Graphics quality', [{ v: 'auto', t: 'Auto' }, { v: 'low', t: 'Low' }, { v: 'med', t: 'Med' }, { v: 'high', t: 'High' }, { v: 'ultra', t: 'Ultra' }], () => S().quality, (v) => ui.setSetting('quality', v), 'quality'),
    slider(ui, 'Master volume', 'masterVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'),
    slider(ui, 'Music volume', 'musicVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'),
    slider(ui, 'Effects volume', 'sfxVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%'),
    seg(ui, 'Pitch controls', [{ v: 'flight', t: 'Flight (push = nose down)' }, { v: 'arcade', t: 'Arcade (push = nose up)' }], () => S().pitchMode, (v) => ui.setSetting('pitchMode', v), 'pitch'),
    seg(ui, 'Flight assist', [{ v: 'standard', t: 'Standard (auto-level)' }, { v: 'pro', t: 'Pro (hands-on)' }], () => S().assist, (v) => ui.setSetting('assist', v), 'assist'),
    slider(ui, 'Camera shake', 'shake', 0, 1, 0.05, (v) => (v === 0 ? 'Off' : Math.round(v * 100) + '%')),
    seg(ui, 'Default difficulty', [{ v: 'easy', t: 'Easy' }, { v: 'normal', t: 'Normal' }, { v: 'hard', t: 'Hard' }, { v: 'expert', t: 'Expert' }], () => S().difficulty, (v) => ui.setSetting('difficulty', v), 'diff'),
    toggle(ui, 'Double-tap bank key = barrel roll', 'doubleTapRoll', 'Off by default: Q / E always roll. Double-tapping A / D can fire by accident while steering'),
    toggle(ui, 'Show FPS counter', 'showFps'),
    toggle(ui, 'Reduce flashing & motion', 'reduceFlash', 'Softer screen effects and fewer flashes'),
    toggle(ui, 'Controller vibration', 'rumble', 'Gamepad rumble on hits, tumbles and boosts'),
  ];
  const el = h('div', { class: 'scr settings' }, header('SETTINGS', 'Saved automatically'), h('div', { class: 'panel scroll rows' }, rows), footer(ui, [btn('Reset to defaults', () => ui.resetSettings(), { cls: 'ghost', cue: 'ui:click' })]));
  return { el, enter() { rows.forEach((r) => r.sync?.()); }, back: (p) => p?.back || 'main' };
}

export function controlsScreen(ui) {
  const body = h('div', { class: 'panel scroll ctrls' });
  const el = h('div', { class: 'scr controls' }, header('CONTROLS', 'Flight convention: push forward to dive, pull back to climb'), body, footer(ui));
  return {
    el, enter() {
      body.replaceChildren();
      for (const grp of ui.game.input.bindingsText()) {
        body.append(h('section', { class: 'cgrp' }, h('h3', null, grp.group), h('dl', null, grp.rows.map(([k, a]) => [h('dt', null, (/ or /.test(k) ? [k] : k.split(/ \/ |, /)).map((x) => h('kbd', null, x))), h('dd', null, a)]))));
      }
      body.append(h('p', { class: 'tip' }, 'Tip: bank to turn, pull to loop. A barrel roll (Q/E) dodges missiles. Boost and stunts fill the meter.'));
    }, back: (p) => p?.back || 'main',
  };
}

// The soundtrack statement is written here (the front matter of assets/music/CREDITS.md talks about repo paths); the per-sample licence notices below it are
// rendered from that file, everything after its first "---" rule, so the attributions that travel with the audio are shown word for word.
const SOUNDTRACK = 'Every track is an original composition written for SKYBLITZ, rendered offline with **ferrosintesis** (https://github.com/0x4D44/ferrosintesis, MIT OR Apache-2.0). '
  + 'The audio is derivative of the synthesiser\'s embedded sample sets: the samples were trimmed, pitch-shifted, layered with physical models, mixed, EQ-ed, compressed and encoded to Ogg Opus. No endorsement by the original authors is implied.';
/** The licence-notice part of CREDITS.md: everything after the first "---" line (the whole text when there is none), without a closing rule. */
export const licenceBody = (md) => { const s = String(md ?? ''), i = s.search(/^---\s*$/m); return (i >= 0 ? s.slice(i).replace(/^---\s*$/m, '') : s).trim().replace(/(?:^|\n)\s*-{3,}$/, '').trim(); };

export function creditsScreen(ui) {
  const more = h('section', { class: 'md', hidden: true });
  const panel = h('div', { class: 'panel scroll' },
    h('p', null, h('b', null, 'SKYBLITZ'), ' is a single-file-set browser game made for the Almanac.'),
    h('ul', null,
      h('li', null, 'Engine: ', h('b', null, 'Three.js'), ' (MIT licence), rendered with WebGL2.'),
      h('li', null, 'Music: original compositions rendered with the ', h('b', null, 'ferrosintesis'), ' MIDI synthesiser and its sample set.'),
      h('li', null, 'Sound effects: generated live with WebAudio.'),
      h('li', null, 'Textures: created with an AI image model, then tuned in the engine.'),
      h('li', null, 'Aircraft, courses, pilots and brands are fictional.'),
      h('li', null, 'Part of the ', h('b', null, '0x4D44 Almanac'), '.')),
    h('section', { class: 'md' }, h('h3', null, 'Soundtrack'), mdNodes(SOUNDTRACK)), more);
  const el = h('div', { class: 'scr credits' }, header('CREDITS'), panel, footer(ui));
  let loaded = false;
  return {
    el, enter() {
      panel.scrollTop = 0;   // the screen is kept between visits: open at the top, not where the last visit left off
      if (loaded) return;
      fetch('assets/music/CREDITS.md').then((r) => (r.ok ? r.text() : '')).then((t) => {
        if (!t || /^<!doctype/i.test(t.trim())) return;
        loaded = true; more.replaceChildren(h('h3', null, 'Sample licences'), ...mdNodes(licenceBody(t), 3)); more.hidden = false;
      }).catch(() => {});
    },
    onNav(dir) {   // Up / Down scroll the long licence text (nothing else on this screen is vertical); at either end they fall through to the normal move
      if (dir !== 'up' && dir !== 'down') return false;
      const room = dir === 'down' ? panel.scrollHeight - panel.clientHeight - panel.scrollTop : panel.scrollTop;
      if (room < 2) return false;
      panel.scrollBy({ top: (dir === 'down' ? 1 : -1) * panel.clientHeight * 0.8, behavior: ui.game.settings.reduceFlash ? 'auto' : 'smooth' }); return true;
    },
    back: (p) => p?.back || 'main',
  };
}

export function pauseScreen(ui) {
  const g = ui.game;
  const list = h('nav', { class: 'menu', 'aria-label': 'Pause menu' },
    btn('Resume', () => g.setPaused(false), { cls: 'primary big', first: true }),
    btn('Restart race', () => ui.restart(), { cls: 'big' }),
    btn('Settings', () => ui.goto('settings', { back: 'pause' }), { ico: MISC.gear }),
    btn('Controls', () => ui.goto('controls', { back: 'pause' }), { ico: MISC.pad }),
    btn('Quit to menu', () => ui.quit(true), { cls: 'danger', cue: 'ui:back' }));
  const el = h('div', { class: 'scr pause' }, h('div', { class: 'pause-panel panel' }, h('h2', { class: 'skew' }, h('span', null, 'PAUSED')), list));
  return { el, back: () => { g.setPaused(false); return null; }, transparent: true };
}
