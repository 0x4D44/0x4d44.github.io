// Game flow (owner: A1). One place decides the mode, `ctx.running`, pointer lock, overlays and hotkeys:
//
//   loading -> title -> play <-> paused          panel (map / journal / help / settings) opens over play, pause or the title
//
//   ctx.mode  'loading' | 'title' | 'play' | 'paused' | 'panel'        ctx.flow  { mode, current, begin, pause, resume, openPanel(name, { back? }), closePanel, togglePanel, ready, respawn }
//   events:   'mode' { mode }
// Keys: M map  J journal  H help  Esc pause (in the game) / close (in a panel: back to where it was opened from).  While the pointer is locked the browser swallows Esc and reports the lock loss
// (pointerlockchange), which is what pauses the game; panels and the pause menu need no lock. A conversation lets go of the pointer on purpose when it opens
// (a held pointer would eat the Esc that should leave the talk) and asks for it back when it ends.
// A panel is { title, render(body), close?(), key?(e) -> handled, modal?, focus? }: `key` sees the keys while it is open, `modal` makes M / J / H do nothing meanwhile.
// Closing any panel (its key, its X, a click outside, Esc) returns to where it was opened from: the game, the pause menu or the title card. `openPanel(name, { back })` makes closing it return to the
// panel `back` (the journal opens a paper in the reader and gets the journal back).
import { settingsPanel, helpPanel, journalPanel, inPoly } from './panels.js';
import { mapPanel } from './map.js';
import { createReader } from './reader.js';
import { isFind } from '../core/registries.js';
import { findCollection } from './collections.js';
import { applyTts } from './tts.js';
import { installTouch } from './touch.js';

const $ = (id) => document.getElementById(id);
const show = (el, on) => el?.classList.toggle('hidden', !on);
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const typing = (t) => !!t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
const KEYS = { KeyM: 'map', KeyJ: 'journal', KeyH: 'help' };

export const TOUCH_HINT = 'Palanca a la izquierda: caminar · Arrastra a la derecha: mirar · Botón E: abrir y hablar';

export function createFlow(ctx) {
  const el = { title: $('title'), start: $('start'), pause: $('pause'), resume: $('resume'), respawn: $('respawn'), panel: $('panel'), ptitle: $('paneltitle'), pbody: $('panelbody'), pclose: $('panelclose'), menu: $('menubtn'), gl: $('gl') };
  const reader = createReader(ctx);
  const panels = { settings: settingsPanel(ctx), help: helpPanel(ctx), journal: journalPanel(ctx), map: mapPanel(ctx), reader: reader.panel };
  const coarse = !!ctx.opts?.touch || !!window.matchMedia?.('(pointer: coarse)').matches;           // ?touch: the phone layout on a desktop (tests, screenshots)
  const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const flow = { mode: 'loading', coarse };
  let panel = null;                                              // { name, def, prev, opener, back } while a panel is open
  Object.defineProperty(flow, 'current', { get: () => panel?.name ?? null, enumerable: true });
  ctx.mode = 'loading'; ctx.flow = flow; ctx.discover.order = []; ctx.reader = reader.api;
  if (coarse) document.body.classList.add('touch');

  // ---- mode -------------------------------------------------------------------------------------------------------------------
  const setMode = (m) => {
    flow.mode = ctx.mode = m;
    document.body.dataset.mode = m;
    ctx.running = m === 'play';
    const under = panel?.prev;                                   // what a panel was opened over stays visible behind it
    show(el.title, m === 'loading' || m === 'title' || (m === 'panel' && under === 'title'));
    show(el.pause, m === 'paused' || (m === 'panel' && under === 'paused'));
    el.title.classList.toggle('under', m === 'panel'); el.pause.classList.toggle('under', m === 'panel');   // the sheet replaces the card, the backdrop stays
    show(el.panel, m === 'panel');
    show(el.menu, m === 'play' && coarse);
    ctx.hud?.show(m === 'play');
    if (m !== 'play' && document.pointerLockElement) document.exitPointerLock?.();
    ctx.events.emit('mode', { mode: m });
  };
  const focusIn = (root, pref) => { try { ((pref && root.querySelector(pref)) || root.querySelector(FOCUSABLE))?.focus({ preventScroll: true }); } catch { /* detached */ } };
  const toPlay = () => {                                         // common tail of begin / resume
    document.activeElement?.blur?.();
    if (!coarse && !ctx.opts.autostart) ctx.player?.lockPointer();
    ctx.audio?.unlock?.();
  };

  const fadeIn = (secs = 1.1) => {
    const post = ctx.post; if (!post) return;
    if (ctx.opts.manual || reduced) { post.fade = 0; return; }
    const t0 = performance.now(); post.fade = 1;
    const tick = (t) => { const k = Math.min(1, (t - t0) / (secs * 1000)); post.fade = (1 - k) * (1 - k); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };

  flow.begin = () => {
    if (flow.mode !== 'title') return;
    setMode('play'); toPlay(); fadeIn();
    ctx.ui.toast(coarse ? TOUCH_HINT : 'W A S D para caminar · E para abrir y hablar · Esc para pausar', 5200);
  };
  flow.pause = () => {
    if (flow.mode !== 'play') return;
    setMode('paused'); ctx.ui.prompt(''); focusIn(el.pause, '#resume');
  };
  // Esc is not a user gesture, so the browser may refuse the re-lock: then show the menu again instead of leaving a cursor-less limbo
  // (not behind a conversation that opened meanwhile: it holds no pointer on purpose)
  const talking = () => !!ctx.player?.locks?.has('dialogue');
  const guardRelock = () => {
    if (coarse || ctx.opts.autostart) return;
    setTimeout(() => {
      const p = ctx.player;
      if (flow.mode === 'play' && p && !p.pointerLocked && !p.dragOnly && !talking()) { flow.pause(); ctx.ui.toast('Haz clic en «Continuar» para volver a mirar', 3600); }
    }, 600);
  };
  flow.resume = (o = {}) => {
    if (flow.mode !== 'paused') return;
    setMode('play'); toPlay();
    if (o.viaKey) guardRelock();
  };
  flow.respawn = () => {
    const sp = ctx.plan?.spawn ?? { x: 0, z: 0 };
    ctx.player?.teleport(sp.x, sp.z, { yaw: sp.yaw ?? sp.ry ?? 0, pitch: 0 });
    if (flow.mode === 'paused') flow.resume(); else if (panel) { flow.closePanel(); flow.resume(); }
  };

  // ---- panels -----------------------------------------------------------------------------------------------------------------
  flow.openPanel = (name, o = {}) => {
    const def = panels[name]; if (!def || flow.mode === 'loading') return;
    if (panel && panel.def !== def) { try { panel.def.close?.(); } catch { /* ignore */ } }
    panel = { name, def, prev: o.prev ?? (panel ? panel.prev : flow.mode), opener: o.opener ?? panel?.opener ?? document.activeElement, back: o.back && o.back !== name && panels[o.back] ? o.back : null };
    el.panel.dataset.panel = name;
    el.ptitle.textContent = def.title;
    try { def.render(el.pbody); } catch (e) {
      console.error('[panel ' + name + ']', e); ctx.errors.push({ stage: 'panel:' + name, message: String(e?.message ?? e), stack: e?.stack });
      el.pbody.textContent = 'No se pudo mostrar este panel.';
    }
    setMode('panel'); el.pbody.scrollTop = 0;
    try { (def.focus && el.pbody.querySelector(def.focus) || el.pclose).focus({ preventScroll: true }); } catch { /* detached */ }
  };
  flow.closePanel = (o = {}) => {
    if (!panel) return;
    const { def, prev, opener, back } = panel; panel = null;
    try { def.close?.(); } catch { /* ignore */ }
    el.pbody.replaceChildren();
    if (back) { flow.openPanel(back, { prev, opener }); return; }                                      // the paper goes back to the list it was opened from
    // Closing returns to where the panel was opened from: the game (by Esc too, R2c-016: Esc used to send every panel but the reader to the pause menu; Esc is no user gesture,
    // so guardRelock turns a refused re-lock into the pause card), the pause menu or the title card.
    if (prev === 'play') { setMode('play'); toPlay(); if (o.viaEsc) guardRelock(); }
    else {
      setMode(prev);
      if (prev === 'paused') focusIn(el.pause, '#resume'); else if (prev === 'title') { if (opener?.isConnected) opener.focus?.({ preventScroll: true }); else focusIn(el.title, '#start'); }
    }
  };
  flow.togglePanel = (name) => (panel?.name === name ? flow.closePanel() : flow.openPanel(name));

  // ---- DOM wiring -------------------------------------------------------------------------------------------------------------
  el.start.addEventListener('click', flow.begin);
  el.resume.addEventListener('click', () => flow.resume());
  el.respawn.addEventListener('click', flow.respawn);
  el.pclose.addEventListener('click', () => flow.closePanel());
  el.menu.addEventListener('click', flow.pause);
  for (const b of document.querySelectorAll('[data-open]')) b.addEventListener('click', () => flow.openPanel(b.dataset.open));
  el.panel.addEventListener('pointerdown', (e) => { if (e.target === el.panel) flow.closePanel(); });                 // click outside the sheet closes it

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const m = flow.mode;
    if (e.code === 'Escape') {
      if (e.target?.tagName === 'SELECT') return;                                                                       // Esc closes a dropdown first
      if (m === 'panel') { flow.closePanel({ viaEsc: true }); e.preventDefault(); }
      else if (m === 'play') { if (!talking()) flow.pause(); }                                                          // in a conversation Esc only leaves the talk (people/ui.js)
      else if (m === 'paused') flow.resume({ viaKey: true });
      return;
    }
    if (e.code === 'Tab' && m === 'panel') { trapTab(e); return; }
    if (m === 'panel' && panel?.def.key && !typing(e.target) && panel.def.key(e)) { e.preventDefault(); return; }      // the open panel's own keys (the reader turns pages)
    if (typing(e.target) || m === 'loading') return;
    const name = KEYS[e.code]; if (!name) return;
    if (m === 'panel' && panel?.def.modal) return;                                                                       // a paper being read is not swapped for the map by a stray key
    if (m === 'title' && name !== 'help') return;
    if (m === 'play' && ctx.player?.locked) return;                                                                      // a dialogue owns the keyboard
    flow.togglePanel(name); e.preventDefault();
  }, true);
  const trapTab = (e) => {                                                                                              // keep Tab inside the open sheet
    const items = [...el.panel.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1], a = document.activeElement;
    if (!el.panel.contains(a)) { first.focus(); e.preventDefault(); } else if (e.shiftKey && a === first) { last.focus(); e.preventDefault(); } else if (!e.shiftKey && a === last) { first.focus(); e.preventDefault(); }
  };
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) { if (talking()) document.exitPointerLock?.(); return; }                        // a lock that lands during a talk (a late request) is let go again
    if (flow.mode === 'play' && !talking()) flow.pause();                                                            // the browser took Esc as 'drop the lock': that is the pause menu
  });
  // A conversation lets go of the pointer when it opens, so Esc, Q and 1-4 reach the page as keys (a held pointer makes a real browser eat Esc and send only the lost lock,
  // which used to pause the game on top of the talk) and the choices can be clicked. When it ends the pointer is asked for again: a release by script may be undone by script,
  // and a browser that still says no gets the usual click-to-resume. (Player.lock / unlock emit these two events; the dialogue takes the 'dialogue' hold.)
  ctx.events.on('player:lock', ({ reason }) => { if (reason === 'dialogue' && document.pointerLockElement) document.exitPointerLock?.(); });
  ctx.events.on('player:unlock', ({ reason }) => {
    if (reason !== 'dialogue' || flow.mode !== 'play' || ctx.player?.pointerLocked) return;
    toPlay(); guardRelock();
  });

  // ---- settings -> systems ----------------------------------------------------------------------------------------------------
  ctx.settings.on((k, v) => {
    if (k === 'volume') { ctx.audio?.setVolume?.(v); applyTts(ctx); } else if (k === 'voiceURI' || k === 'ttsOn') applyTts(ctx);
  });

  // ---- discoveries ------------------------------------------------------------------------------------------------------------
  const jbtn = document.querySelector('#pause [data-open="journal"]');
  const countEl = jbtn ? Object.assign(document.createElement('small'), { className: 'count' }) : null;
  if (jbtn) jbtn.insertBefore(countEl, jbtn.querySelector('kbd'));
  const refreshCount = () => { if (countEl) countEl.textContent = `${ctx.discover.count}/${ctx.discover.total}`; };
  ctx.events.on('discover', (d) => {
    if (!ctx.discover.order.includes(d.id)) ctx.discover.order.push(d.id);
    refreshCount();
    if (isFind(d)) { findToast(d); return; }
    ctx.ui.toast({ tag: `Descubrimiento ${ctx.discover.count} de ${ctx.discover.total}`, title: d.name, sub: d.en }, 5600);
    ctx.audio?.chime?.();
  });
  // A special find (a gold coin in a sock drawer): 'Hallazgo - <collection> n de m', its name in the subtitle language(s), and a coin ting (bigger for the rare ones).
  const findToast = (d) => {
    const col = findCollection(d.collection), c = ctx.collection?.counts?.(), lang = ctx.settings?.v?.subLang ?? 'both';
    const n = c?.byCollection?.[col.es] ?? c?.byCollection?.[col.id], m = col.total;
    const tag = `Hallazgo · ${col.es}${n != null && m ? ` ${n} de ${m}` : ''}`, en = d.en && d.en !== d.name ? d.en : null;
    ctx.ui.toast(lang === 'en' && en ? { tag, title: en } : { tag, title: d.name, sub: lang === 'es' ? null : en }, 6200);
    ctx.audio?.find?.({ collection: col.id, rarity: d.rarity ?? 1 });
  };

  // ---- where am I (bottom-left label) -----------------------------------------------------------------------------------------
  const startPlaces = () => {
    const plan = ctx.plan; if (!plan) return;
    const areas = (plan.areas ?? []).filter((a) => a.poly?.length >= 3), lms = plan.landmarks ?? [];
    let acc = 1;
    ctx.addSystem('place', (dt) => {
      acc += dt; if (acc < 0.35) return; acc = 0;
      const p = ctx.player; if (!p) return;
      const x = p.s.x, z = p.s.z;
      let name = null, en = null;
      if (p.building && p.indoors) { const lot = ctx.buildings.get(p.building)?.lot; if (lot?.name) { name = lot.name; en = lot.en ?? null; } }
      if (!name) { let best = 14 * 14; for (const l of lms) { const d = (l.x - x) ** 2 + (l.z - z) ** 2; if (d < best) { best = d; name = l.name; en = l.en ?? null; } } }
      if (!name) for (const a of areas) if (inPoly(a.poly, x, z)) { name = a.name; en = a.en ?? null; break; }
      ctx.ui.place(name, en);
    }, 8);
  };

  // ---- idle camera drift behind the title card --------------------------------------------------------------------------------
  const drift = () => {
    if (flow.mode !== 'title' && !(flow.mode === 'panel' && panel?.prev === 'title')) return;
    const p = ctx.player, c = ctx.camera; if (!p || !c || ctx.opts.manual || reduced) return;
    const t = performance.now() / 1000;
    c.rotation.set(p.pitch + 0.012 * Math.sin(t * 0.21), p.yaw + 0.16 * Math.sin(t * 0.11), 0);
    requestAnimationFrame(drift);
  };

  // ---- boot finished ----------------------------------------------------------------------------------------------------------
  flow.ready = () => {
    applyTts(ctx); refreshCount(); startPlaces();
    if (coarse) installTouch(ctx);
    if (ctx.opts.autostart) { setMode('play'); document.activeElement?.blur?.(); return; }
    setMode('title');
    el.title.classList.add('ready');
    el.start.disabled = false; el.start.textContent = 'Entrar al barrio';
    focusIn(el.title, '#start');
    requestAnimationFrame(drift);
  };

  setMode('loading');
  return flow;
}
