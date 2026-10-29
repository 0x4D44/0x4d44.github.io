// Menu navigation: keyboard (arrows / WASD / Enter / Esc / Tab), gamepad (D-pad, left stick, A, B, Start) and focus sounds. Owner: UI agent.
// Focusable things carry data-nav. Direction moves use spatial search on bounding boxes; a screen may consume left/right via onNav(dir).

const DIRS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };

export class Nav {
  constructor(ui) {
    this.ui = ui; this.pad = { prev: [], held: {}, t: 0 }; this.lastFocus = null;
    addEventListener('keydown', (e) => this.onKey(e), true);
    addEventListener('keyup', (e) => { if (e.code === 'Space' && ui.menuOpen() && document.activeElement?.tagName === 'BUTTON') e.preventDefault(); }, true);   // stop the native Space click firing twice
    document.addEventListener('focusin', (e) => { const t = e.target; if (t && t.dataset && 'nav' in t.dataset && t !== this.lastFocus) { this.lastFocus = t; ui.cue('ui:hover'); } });
    ui.root.addEventListener('click', (e) => { const t = e.target.closest?.('[data-nav]'); if (t && !t.disabled) ui.cue(t.classList.contains('primary') ? 'ui:confirm' : t.dataset.cue || 'ui:click'); }, true);
  }

  active() { return this.ui.activeRoot(); }
  items() {
    const root = this.active(); if (!root) return [];
    return [...root.querySelectorAll('[data-nav]')].filter((e) => !e.disabled && e.offsetParent !== null && e.getClientRects().length);
  }
  ensureFocus() {
    const items = this.items(); if (!items.length) return null;
    const a = document.activeElement;
    if (a && items.includes(a)) return a;
    const first = items.find((e) => e.dataset.nav === 'first') || items.find((e) => e.classList.contains('primary')) || items[0];
    first.focus({ preventScroll: true }); return first;
  }

  move(dir) {
    const items = this.items(); if (!items.length) return;
    const cur = document.activeElement && items.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { this.ensureFocus(); return; }
    if (this.ui.cur?.onNav?.(dir, cur)) return;
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = 1e9;
    for (const el of items) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect(), x = b.left + b.width / 2 - cx, y = b.top + b.height / 2 - cy;
      const p = dir === 'up' ? -y : dir === 'down' ? y : dir === 'left' ? -x : x;
      const s = dir === 'up' || dir === 'down' ? Math.abs(x) : Math.abs(y);
      if (p < 4) continue;
      const score = p + s * 2.2;
      if (score < bs) { bs = score; best = el; }
    }
    if (best) { best.focus({ preventScroll: true }); best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
    else this.ui.cue('ui:error');
  }

  onKey(e) {
    const ui = this.ui;
    if (!ui.menuOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Escape' || e.code === 'Backspace') { if (e.target?.tagName === 'INPUT' && e.target.type !== 'range') return; e.preventDefault(); e.stopImmediatePropagation(); ui.back(); return; }
    if (e.code === 'F5' || e.code === 'F12') return;
    const dir = DIRS[e.code];
    if (dir) {
      const t = document.activeElement;
      if (t && t.tagName === 'INPUT' && t.type === 'range' && (dir === 'left' || dir === 'right')) return;     // native slider step
      e.preventDefault(); this.move(dir); return;
    }
    if (e.code === 'Tab') { requestAnimationFrame(() => this.ensureFocus()); return; }
    if (e.code === 'Enter' || e.code === 'Space') {
      const a = document.activeElement;
      if (!a || !a.dataset || !('nav' in a.dataset)) { e.preventDefault(); const f = this.ensureFocus(); if (f && ui.cur?.anyKey) f.click(); }
      else if (a.tagName !== 'INPUT') { e.preventDefault(); if (!e.repeat) a.click(); }   // activate on keydown ourselves (native key-activation is inconsistent)
    }
  }

  /** Called every frame from UI.update. */
  poll(dt) {
    const ui = this.ui; if (!navigator.getGamepads) return;
    let gp = null; for (const g of navigator.getGamepads()) if (g && g.connected) { gp = g; break; }
    const P = this.pad; if (!gp) { P.prev.length = 0; return; }
    const b = (i) => !!gp.buttons[i]?.pressed, edge = (i) => b(i) && !P.prev[i];
    const open = ui.menuOpen(), paused = ui.game.paused && ui.game.state === 'race';
    if (open) {
      if (!document.activeElement || !this.items().includes(document.activeElement)) this.ensureFocus();
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const dir = b(12) || ay < -0.55 ? 'up' : b(13) || ay > 0.55 ? 'down' : b(14) || ax < -0.55 ? 'left' : b(15) || ax > 0.55 ? 'right' : null;
      P.t -= dt;
      if (dir && (P.t <= 0 || dir !== P.dir)) { this.move(dir); P.t = dir === P.dir ? 0.16 : 0.32; }
      if (!dir) P.t = 0;
      P.dir = dir;
      if (edge(0)) { const a = document.activeElement; if (a && a.dataset && 'nav' in a.dataset) a.click(); else if (ui.cur?.anyKey) ui.cur.anyKey(); }
      if (edge(1)) ui.back();
      if (edge(9) && ui.cur?.name === 'title') ui.cur.anyKey?.();
      if (edge(9) && paused) ui.game.setPaused(false);
    }
    for (let i = 0; i < gp.buttons.length; i++) P.prev[i] = b(i);
  }
}
