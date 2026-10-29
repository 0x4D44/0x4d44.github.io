// In-game HUD (owner: A1): crosshair, interaction prompt, bilingual subtitles, toasts, location line.
// ctx.ui.prompt(text|null)          "E  <text>" under the crosshair
// ctx.ui.subtitle({who, es, en, ms}) | null      honours settings.subs / settings.subLang; `ms` = auto-hide delay
// ctx.ui.toast(text | {tag,title,sub}, ms=3200)
// ctx.ui.place(name|null, en?)      bottom-left location label (ui/flow.js updates it from plan.areas / landmarks / the building you are in)
const el = (tag, id, cls) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createHud(ctx) {
  let root = document.getElementById('hud');
  if (!root) { root = el('div', 'hud'); document.body.appendChild(root); }
  root.setAttribute('aria-live', 'polite');
  const mk = (id, cls) => { let e = document.getElementById(id); if (!e) { e = el('div', id, cls); root.appendChild(e); } return e; };
  const cross = mk('crosshair'), prompt = mk('prompt'), sub = mk('subtitle'), toast = mk('toast'), place = mk('place');
  const S = () => ctx.settings?.v ?? {};
  let promptText = '', subCur = null, toastT = 0, subT = 0, placeKey = '';

  const api = {
    prompt(txt) {
      txt = txt || '';
      if (txt === promptText) return;
      promptText = txt;
      prompt.innerHTML = txt ? `<kbd>E</kbd><span>${esc(txt)}</span>` : '';
      prompt.classList.toggle('on', !!txt);
      cross.classList.toggle('hot', !!txt);
    },
    subtitle(o) {
      clearTimeout(subT); subCur = o || null;
      if (!o) { sub.classList.remove('on'); sub.innerHTML = ''; return; }
      if (S().subs === false) { sub.classList.remove('on'); return; }
      const lang = S().subLang ?? 'both';
      const showEs = lang !== 'en' || !o.en, showEn = (lang !== 'es' && !!o.en);
      sub.innerHTML = `${o.who ? `<b>${esc(o.who)}</b>` : ''}${showEs ? `<span class="es">${esc(o.es)}</span>` : ''}${showEn ? `<span class="en">${esc(o.en)}</span>` : ''}`;
      sub.classList.add('on');
      if (o.ms) subT = setTimeout(() => { if (subCur === o) api.subtitle(null); }, o.ms);
    },
    toast(txt, ms = 3200) {
      if (txt && typeof txt === 'object') {                         // rich toast (a discovery): small tag, Spanish title, English line
        toast.innerHTML = `${txt.tag ? `<em>${esc(txt.tag)}</em>` : ''}<b>${esc(txt.title)}</b>${txt.sub ? `<span>${esc(txt.sub)}</span>` : ''}`;
        toast.classList.add('rich');
      } else { toast.textContent = txt ?? ''; toast.classList.remove('rich'); }
      toast.classList.add('on');
      clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('on'), ms);
    },
    place(name, en) {
      const key = name ? `${name}|${en ?? ''}` : '';
      if (key === placeKey) return;
      placeKey = key; place.classList.remove('on');
      if (!name) { place.textContent = ''; return; }
      place.innerHTML = `${esc(name)}${en ? `<small>${esc(en)}</small>` : ''}`; void place.offsetWidth; place.classList.add('on');   // the CSS animation shows it for a few seconds
    },
    /** Hide / show the whole HUD (title screen, menus, cinematic shots). */
    show(on) { root.classList.toggle('off', !on); },
    refreshSubtitle() { if (subCur) api.subtitle(subCur); },
  };
  ctx.settings?.on((k) => { if (k === 'subs' || k === 'subLang') api.refreshSubtitle(); if (k === 'crosshair') cross.classList.toggle('off', !S().crosshair); });
  cross.classList.toggle('off', S().crosshair === false);
  return api;
}
