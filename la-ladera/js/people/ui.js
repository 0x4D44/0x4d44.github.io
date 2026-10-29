// Conversation panel (DOM only). The NPC's spoken line is shown by the engine's subtitle (ctx.ui.subtitle); this panel holds the speaker
// header and up to four numbered answers. Keys: 1-4 choose, E / Space skip the voice, Q / Backspace / Escape leave.
// The stylesheet (css/people.css) is attached from here so the engine's index.html need not know about it.
const CSS_ID = 'people-css';

export class DialogueUI {
  constructor() { this.el = null; this.isOpen = false; this.choices = []; this.cb = null; this._key = this._key.bind(this); this.keysOn = false; }

  /** Attach the stylesheet early so the first panel does not flash unstyled. */
  preload() {
    if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
    const l = document.createElement('link'); l.id = CSS_ID; l.rel = 'stylesheet';
    l.href = new URL('../../css/people.css', import.meta.url).href; document.head.appendChild(l);
  }

  _mount() {
    if (this.el) return this.el;
    this.preload();
    const el = document.createElement('div'); el.id = 'dlg'; el.className = 'dlg'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-live', 'polite');
    const head = document.createElement('div'); head.className = 'dlg-head';
    this.nameEl = document.createElement('b'); this.nameEl.className = 'dlg-name';
    this.roleEl = document.createElement('span'); this.roleEl.className = 'dlg-role';
    head.append(this.nameEl, this.roleEl);
    this.list = document.createElement('ol'); this.list.className = 'dlg-choices';
    const foot = document.createElement('div'); foot.className = 'dlg-foot';
    foot.innerHTML = '<kbd>1</kbd>–<kbd>4</kbd> elegir · <kbd>E</kbd> saltar voz · <kbd>Q</kbd> salir';
    el.append(head, this.list, foot);
    (document.getElementById('hud') ?? document.body).appendChild(el);
    this.el = el; return el;
  }

  /** Open for a speaker. cb = { onPick(id), onSkip(), onLeave() }. */
  show(speaker, cb) {
    const el = this._mount(); this.cb = cb; this.isOpen = true;
    this.nameEl.textContent = speaker.name ?? ''; this.roleEl.textContent = speaker.role ?? '';
    el.hidden = false; this.setChoices([]);
    if (!this.keysOn) { window.addEventListener('keydown', this._key, true); this.keysOn = true; }
  }

  setChoices(list) {
    this.choices = (list ?? []).slice(0, 4);
    if (!this.list) return;
    this.list.replaceChildren();
    this.choices.forEach((c, i) => {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.dataset.id = c.id;
      const k = document.createElement('kbd'); k.textContent = String(i + 1);
      const es = document.createElement('span'); es.className = 'es'; es.textContent = c.es;
      const en = document.createElement('span'); en.className = 'en'; en.textContent = c.en ?? '';
      b.append(k, es, en);
      b.addEventListener('click', (e) => { e.preventDefault(); this.cb?.onPick(c.id); b.blur(); });
      li.appendChild(b); this.list.appendChild(li);
    });
  }

  hide() {
    this.isOpen = false; this.cb = null;
    if (this.el) this.el.hidden = true;
    if (this.keysOn) { window.removeEventListener('keydown', this._key, true); this.keysOn = false; }
  }

  _key(e) {
    if (!this.isOpen || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (m) { const c = this.choices[+m[1] - 1]; if (c) { e.preventDefault(); this.cb?.onPick(c.id); } return; }
    if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); this.cb?.onSkip(); }
    else if (e.code === 'KeyQ' || e.code === 'Backspace' || e.code === 'Escape') { e.preventDefault(); this.cb?.onLeave(); }
  }
}
