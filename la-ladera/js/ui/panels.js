// Settings, help and journal panels (owner: A1). Each panel is a function (ctx) -> { title, render(body), close?() }.
import { listVoices, testVoice, applyTts } from './tts.js';
import { isFind } from '../core/registries.js';
import { findCollection, shelfProgress, KINDS } from './collections.js';

export const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) e.append(c?.nodeType ? c : document.createTextNode(c ?? ''));
  return e;
};
/** Is (x, z) inside the polygon pts = [[x, z], ...]? (the place label in ui/flow.js and the journal's areas) */
export function inPoly(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
const fmtHour = (x) => { const m = Math.round(((x % 24) + 24) % 24 * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const row = (label, hint, control) => h('div', { class: 'row' }, h('label', {}, label, hint ? h('small', {}, hint) : null), control);
/** A name in both languages: the Spanish, the English small beside it (L); the same pair as one string for an aria-label or a hint (both). */
const L = (es, en) => [es, ' ', h('small', { class: 'en' }, en)];
const both = (es, en) => `${es} · ${en}`;

// ---- settings ----------------------------------------------------------------------------------------------------------------
export function settingsPanel(ctx) {
  const st = ctx.settings;
  // every control carries its name in Spanish and English (es, en), and its hint as one 'es · en' string
  const slider = (key, es, en, min, max, step, fmt, hint) => {
    const input = h('input', { type: 'range', min, max, step, 'aria-label': both(es, en) }), val = h('span', { class: 'val' }, fmt(st.v[key]));
    input.value = st.v[key];
    input.addEventListener('input', () => { st.set(key, +input.value); val.textContent = fmt(st.v[key]); });
    return row(L(es, en), hint, h('div', { class: 'inline' }, input, val));
  };
  const check = (key, es, en, hint) => {
    const input = h('input', { type: 'checkbox', 'aria-label': both(es, en) }); input.checked = !!st.v[key];
    input.addEventListener('change', () => st.set(key, input.checked));
    return row(L(es, en), hint, input);
  };
  const select = (key, es, en, options, hint) => {
    const sel = h('select', { 'aria-label': both(es, en) }, options.map(([v, t]) => h('option', { value: v }, t)));
    sel.value = st.v[key];
    sel.addEventListener('change', () => st.set(key, sel.value));
    return row(L(es, en), hint, sel);
  };
  return {
    title: 'Ajustes',
    render(body) {
      this.close?.();
      const voices = listVoices(ctx), voiceSel = h('select', { 'aria-label': both('Voz de los vecinos', "Neighbours' voice") }, [h('option', { value: '' }, 'Automática (la mejor voz en español) · Automatic (best Spanish voice)'),
        ...voices.map((v) => h('option', { value: v.uri }, `${v.name} · ${v.lang}${v.local ? '' : ' · en línea · online'}`))]);
      voiceSel.value = voices.some((v) => v.uri === st.v.voiceURI) ? st.v.voiceURI : '';
      voiceSel.addEventListener('change', () => { st.set('voiceURI', voiceSel.value); applyTts(ctx); });
      const status = h('p', { class: 'note' });
      const say = () => {
        const r = testVoice(ctx);
        status.textContent = r === 'ok' ? '' : r === 'unsupported' ? both('Este navegador no tiene voz: verás los subtítulos.', 'This browser has no voice: you will see subtitles.')
          : r === 'blocked' ? both('El navegador bloqueó la voz.', 'The browser blocked the voice.') : both('No hay voces en español instaladas: verás los subtítulos.', 'No Spanish voices are installed: you will see subtitles.');
      };
      const qualityNow = h('span', { class: 'val' }, '');
      const upd = () => { const q = ({ low: ['baja', 'low'], medium: ['media', 'medium'], high: ['alta', 'high'] })[ctx.quality]; qualityNow.textContent = ctx.qualityMode === 'auto' && q ? `ahora: ${q[0]} · now: ${q[1]}` : ''; };
      upd(); const off = ctx.events.on('quality:change', upd); this.close = () => off();
      const hour = h('input', { type: 'range', min: 0, max: 24, step: 0.25, 'aria-label': both('Hora del día', 'Time of day') }), hval = h('span', { class: 'val' }, fmtHour(ctx.hour));
      hour.value = ctx.hour;
      hour.addEventListener('input', () => { ctx.setHour(+hour.value); hval.textContent = fmtHour(ctx.hour); });
      const hoff = ctx.events.on('time:change', () => { if (document.activeElement !== hour) { hour.value = ctx.hour; hval.textContent = fmtHour(ctx.hour); } });
      const prevClose = this.close; this.close = () => { prevClose(); hoff(); };
      body.replaceChildren(
        h('h3', {}, 'Imagen · Graphics'),
        row(L('Calidad gráfica', 'Graphics quality'), both('La automática baja el detalle si los fotogramas caen.', 'Auto lowers the detail if the frame rate drops.'), h('div', { class: 'inline' }, (() => {
          const sel = h('select', { 'aria-label': both('Calidad gráfica', 'Graphics quality') }, [['auto', 'Automática · Auto'], ['low', 'Baja · Low'], ['medium', 'Media · Medium'], ['high', 'Alta · High']].map(([v, t]) => h('option', { value: v }, t)));
          sel.value = st.v.quality; sel.addEventListener('change', () => { st.set('quality', sel.value); upd(); }); return sel;
        })(), qualityNow)),
        slider('fov', 'Campo de visión', 'Field of view', 55, 100, 1, (v) => `${Math.round(v)}°`),
        row(L('Hora del día', 'Time of day'), both('Mueve el sol: del amanecer a la noche.', 'Moves the sun, from dawn to night.'), h('div', { class: 'inline' }, hour, hval)),
        check('timeFlow', 'Que pase el tiempo', 'Let time pass', both('El día avanza solo (un día dura unos 48 minutos).', 'The day moves on by itself (a day lasts about 48 minutes).')),
        check('crosshair', 'Mostrar la mira', 'Show the crosshair'),
        h('h3', {}, 'Control · Controls'),
        slider('sens', 'Sensibilidad del ratón', 'Mouse sensitivity', 0.2, 3, 0.05, (v) => `${v.toFixed(2)}×`),
        check('invertY', 'Invertir el eje vertical', 'Invert the vertical axis'),
        check('headBob', 'Balanceo de la cámara al caminar', 'Camera bob while walking'),
        h('h3', {}, 'Sonido y voz · Sound and voice'),
        slider('volume', 'Volumen general', 'Master volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
        check('ttsOn', 'Los vecinos hablan en voz alta', 'Neighbours speak aloud', both('Si lo desactivas solo verás los subtítulos.', 'Turn it off to read the subtitles only.')),
        row(L('Voz de los vecinos', "Neighbours' voice"), both('Solo se listan voces en español.', 'Only Spanish voices are listed.'), voiceSel),
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: say }, 'Probar voz · Test voice'), status),
        h('h3', {}, 'Subtítulos · Subtitles'),
        check('subs', 'Mostrar subtítulos', 'Show subtitles'),
        select('subLang', 'Idioma de los subtítulos', 'Subtitle language', [['both', 'Español e inglés · Spanish and English'], ['es', 'Solo español · Spanish only'], ['en', 'Solo inglés · English only']]),
        h('h3', {}, 'Conversación · Conversation'),
        select('address', 'Cómo te llaman', 'How people address you', [['m', 'Vecino, mijo, señor'], ['f', 'Vecina, mija, señora']], both('Así te hablan los vecinos.', 'What the neighbours call you.')),
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn quiet', onclick: () => { st.reset(); applyTts(ctx); this.render(body); } }, 'Restablecer ajustes · Reset settings')),
      );
    },
  };
}

// ---- help --------------------------------------------------------------------------------------------------------------------
const TIPS = [
  ['Todas las puertas se abren. Entra a las tiendas, a las casas y sube a las terrazas.', 'Every door opens: step into the shops and the houses, and climb to the rooftops.'],
  ['Los armarios, cajones, alacenas y neveras se abren con E: dentro hay diarios, cartas y hallazgos.', 'Wardrobes, drawers, cupboards and fridges open with E; diaries, letters and finds are inside.'],
  ['Saluda a los vecinos con la tecla E: tienen rutinas y cuentan cosas del barrio. Con Q (o Esc) sales de la conversación.', 'Greet the neighbours with E: they keep routines and tell stories of the barrio. Q (or Esc) leaves the conversation.'],
  ['Las escaleras y los pasajes llevan a patios escondidos, murales y miradores. Todo lo que encuentres se anota en el diario.', 'Stairs and passages lead to hidden courtyards, murals and viewpoints. Whatever you find is written in the journal.'],
  ['Cambia la hora en Ajustes para ver el barrio de mañana, de tarde o con las ventanas encendidas.', 'Change the time in Settings to see the barrio at dawn, in the afternoon or with the windows lit.'],
  ['Si te atascas, abre el menú con Esc y elige «Volver al punto de partida».', 'If you get stuck, open the menu with Esc and pick “Volver al punto de partida” (back to the start).'],
];
export function helpPanel() {
  const K = (...k) => h('span', {}, k.map((x) => h('kbd', {}, x)));
  const rows = [
    ['Caminar', K('W', 'A', 'S', 'D'), 'Walk'], ['Mirar', 'Ratón', 'Look'], ['Correr', K('Shift'), 'Run'], ['Agacharse', K('C'), 'Crouch'], ['Saltar', K('Espacio'), 'Jump'],
    ['Abrir, hablar, usar', K('E'), 'Open, talk, use (or click)'], ['Elegir respuesta', K('1', '2', '3', '4'), 'Pick a reply'], ['Salir de una conversación', K('Q'), 'Leave a conversation (Esc too)'],
    ['Mapa', K('M'), 'Map'], ['Diario', K('J'), 'Journal'], ['Ayuda', K('H'), 'Help'], ['Pausa y menú', K('Esc'), 'Pause and menu'],
  ];
  return {
    title: 'Ayuda',
    render(body) {
      body.replaceChildren(
        h('h3', {}, 'Controles · Controls'),
        h('div', { class: 'helpgrid' }, rows.map(([es, keys, en]) => h('div', {}, h('span', {}, es, ' ', h('small', {}, en)), keys))),
        h('h3', {}, 'Consejos · Tips'),
        h('ul', { class: 'tips' }, TIPS.map(([es, en]) => h('li', {}, es, ' ', h('small', {}, en)))),
      );
    },
  };
}

// ---- journal -----------------------------------------------------------------------------------------------------------------
// Two tabs: the discoveries of the barrio, and 'Papeles y hallazgos' (what the player read in drawers and found in them; ctx.collection from interiors/containers.js).
const meter = (n, total) => { const i = h('i'); i.style.width = `${total ? Math.min(100, (100 * n) / total) : 0}%`; return h('div', { class: 'jbar' }, i); };
const pair = (x) => (Array.isArray(x) ? { es: x[0], en: x[1] } : x && typeof x === 'object' ? x : { es: x, en: null });

/** The word a discovery's kind goes by in the journal (the tag on a found card, and the key into NOUN). */
export const KIND = { mural: 'mural', shrine: 'altar', view: 'vista', story: 'historia', vista: 'vista', mirador: 'vista', hidden: 'escondido', object: 'objeto', room: 'cuarto', person: 'gente', sound: 'sonido', nature: 'naturaleza' };
/** What is still to be found says how many and of what kind, never which: KIND word -> [singular, plural, English singular, English plural]. */
export const NOUN = { mural: ['mural', 'murales', 'mural', 'murals'], altar: ['altar', 'altares', 'shrine', 'shrines'], vista: ['vista', 'vistas', 'view', 'views'], historia: ['historia', 'historias', 'story', 'stories'],
  escondido: ['rincón escondido', 'rincones escondidos', 'hidden corner', 'hidden corners'], objeto: ['objeto', 'objetos', 'object', 'objects'], cuarto: ['cuarto', 'cuartos', 'room', 'rooms'],
  gente: ['persona', 'personas', 'person', 'people'], sonido: ['sonido', 'sonidos', 'sound', 'sounds'], naturaleza: ['rincón de naturaleza', 'rincones de naturaleza', 'nature spot', 'nature spots'] };
export const ELSEWHERE = { id: 'barrio', name: 'Todo el barrio', en: 'The whole barrio' };

/** The area (areas = plan.areas) a discovery sits in: the polygon that holds it, else the nearest one by its centre, else ELSEWHERE. */
export function areaOf(areas, d) {
  const list = (areas ?? []).filter((a) => a.poly?.length >= 3);
  for (const a of list) if (inPoly(a.poly, d.x, d.z)) return a;
  let best = null, bd = Infinity;
  for (const a of list) { const cx = a.poly.reduce((s, p) => s + p[0], 0) / a.poly.length, cz = a.poly.reduce((s, p) => s + p[1], 0) / a.poly.length, q = (cx - d.x) ** 2 + (cz - d.z) ** 2; if (q < bd) { bd = q; best = a; } }
  return best ?? ELSEWHERE;
}
/**
 * What is still to find, one group per area (in the plan's order, areas with nothing left are left out): { area, left, all, kinds: [[KIND word, n], ...] biggest first }.
 * `all - left` is what the area already gave. `found` is a Set of ids.
 */
export function pendingGroups(items, found, areas) {
  const by = new Map(), order = (areas ?? []).map((a) => a.id);
  for (const d of items) {
    const a = areaOf(areas, d), g = by.get(a.id) ?? by.set(a.id, { area: a, left: 0, all: 0, kinds: new Map() }).get(a.id);
    g.all++;
    if (!found.has(d.id)) { g.left++; const k = KIND[d.kind] ?? d.kind ?? 'objeto'; g.kinds.set(k, (g.kinds.get(k) ?? 0) + 1); }
  }
  return [...by.values()].filter((g) => g.left > 0).sort((a, b) => order.indexOf(a.area.id) - order.indexOf(b.area.id))
    .map((g) => ({ ...g, kinds: [...g.kinds].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))) }));
}
/** '12 historias · 4 objetos · 1 mural' (or in English): the one hint of an area. */
export const hintOf = (g, en) => g.kinds.map(([k, n]) => { const w = NOUN[k] ?? [k, k + 's', k, k + 's']; return `${n} ${n === 1 ? w[en ? 2 : 0] : w[en ? 3 : 1]}`; }).join(' · ');

export function journalPanel(ctx) {
  let tab = 'discover';                                           // kept between visits: closing a paper returns to the tab it was opened from

  /** Still to find, one row per area: the count left, the area's own progress and one hint line with the kinds (no names). */
  const pending = (items) => h('ul', { class: 'jareas' }, pendingGroups(items, ctx.discover.found, ctx.plan?.areas).map((g) => h('li', { class: 'jarea', 'data-area': g.area.id },
    h('div', { class: 'jarea-head' }, h('b', {}, g.area.name, g.area.en ? h('small', {}, g.area.en) : null), h('span', { class: 'left' }, `${g.left} por descubrir`, h('small', {}, 'to find'))),
    meter(g.all - g.left, g.all),
    h('p', { class: 'hint' }, 'Por aquí: ', hintOf(g, false), h('small', {}, 'Around here: ', hintOf(g, true))))));

  const discoveries = () => {
    const items = [...ctx.discover.items.values()].filter((d) => !isFind(d)), found = items.filter((d) => ctx.discover.found.has(d.id));
    const order = ctx.discover.order ?? [];
    found.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const rest = items.filter((d) => !ctx.discover.found.has(d.id));
    const tag = (d) => h('em', { class: 'kind' }, KIND[d.kind] ?? d.kind ?? '');
    const settled = ctx.discover.settled;                       // a lazy boot that is still furnishing has made only the world's discoveries: the total is '…' and the bar waits (review R2b-002)
    return h('div', { class: 'jpane', role: 'tabpanel' },
      h('div', { class: 'jhead' }, h('strong', {}, `${found.length} de ${settled ? items.length : ctx.discover.totalLabel} descubrimientos`), h('small', {}, 'Camina, mira, abre puertas: lo que encuentres se anota aquí.')),
      meter(found.length, settled ? items.length : 0),
      settled ? null : h('p', { class: 'note' }, 'Las casas siguen llegando: el total se completa en unos segundos. · The houses are still coming in; the total fills in shortly.'),
      found.length ? h('div', { class: 'jgrid' }, found.map((d) => h('div', { class: 'jitem' }, tag(d), h('b', {}, d.name), d.en ? h('span', {}, d.en) : null))) : null,
      rest.length ? h('h3', {}, 'Por descubrir · Still to find') : null,
      rest.length ? pending(items) : items.length ? h('p', { class: 'note' }, 'Lo has descubierto todo. · You have found everything.') : null,
    );
  };

  const counts = () => {
    const col = ctx.collection, c = col?.counts?.() ?? null, shelves = shelfProgress(c), all = shelves.reduce((a, s) => a + s.total, 0);
    return { col, shelves, papers: c?.papers ?? col?.papers?.size ?? 0, finds: c?.finds ?? col?.finds?.size ?? 0, papersTotal: c?.total?.papers || 0, findsTotal: c?.total?.finds || all };
  };

  const papersTab = () => {
    const { col, shelves, papers, finds, papersTotal, findsTotal } = counts();
    const paperCard = (doc) => {
      const t = pair(doc.title), kind = KINDS[doc.kind] ?? KINDS.note, en = doc.en ?? t.en;
      return h('button', { type: 'button', class: 'jitem paper', 'data-id': doc.id, onclick: () => ctx.reader?.open(doc, { back: 'journal' }) },
        h('em', { class: 'kind' }, kind[0]), h('b', {}, t.es ?? doc.id), en && en !== t.es ? h('span', {}, en) : null, doc.who ? h('small', { class: 'who' }, doc.who) : null);
    };
    const findCard = (f) => {
      const nm = f.name && typeof f.name === 'object' ? f.name : { es: f.name ?? f.es, en: f.en }, r = pair(f.react), sh = findCollection(f.collection);
      return h('div', { class: 'jitem find', 'data-id': f.id }, h('em', { class: 'kind' }, sh.es), h('b', {}, nm.es ?? f.id), nm.en && nm.en !== nm.es ? h('span', {}, nm.en) : null,
        r.es ? h('p', { class: 'react' }, r.es, r.en ? h('small', {}, ' ', r.en) : null) : null);
    };
    return h('div', { class: 'jpane', role: 'tabpanel' },
      h('div', { class: 'jhead' }, h('strong', {}, `Papeles ${papers} de ${papersTotal || '?'}`), h('strong', {}, `Hallazgos ${finds} de ${findsTotal || '?'}`),
        h('small', {}, 'Abre cajones y armarios con E: lo que leas y encuentres se guarda aquí.')),
      h('div', { class: 'jshelves' }, shelves.map((s) => h('div', { class: 'jshelf' + (s.n ? ' has' : ''), 'data-shelf': s.id }, h('b', {}, s.es), h('small', {}, s.en), h('span', {}, `${s.n} de ${s.total}`), meter(s.n, s.total)))),
      h('h3', {}, 'Papeles leídos · Papers read'),
      papers ? h('div', { class: 'jgrid' }, [...col.papers.values()].map(paperCard))
        : h('p', { class: 'note' }, 'Todavía no has leído nada. Los diarios, cartas y notas están en cajones, mesitas y armarios. · Nothing read yet: diaries, letters and notes sit in drawers and wardrobes.'),
      h('h3', {}, 'Hallazgos · Finds'),
      finds ? h('div', { class: 'jgrid' }, [...col.finds.values()].map(findCard))
        : h('p', { class: 'note' }, 'Todavía no has encontrado nada especial. Hay monedas de oro, relojes, joyas y rarezas escondidas. · Gold coins, watches, jewels and curiosities are hidden away.'),
    );
  };

  return {
    title: 'Diario del barrio',
    render(body, o = {}) {
      const c = counts();
      const tabs = [['discover', 'Descubrimientos', 'Discoveries', `${ctx.discover.count} de ${ctx.discover.totalLabel}`], ['papers', 'Papeles y hallazgos', 'Papers and finds', `${c.papers} · ${c.finds}`]];
      const bar = h('div', { class: 'jtabs', role: 'tablist' }, tabs.map(([id, es, en, n]) => h('button', {
        type: 'button', role: 'tab', class: 'jtab' + (tab === id ? ' on' : ''), 'aria-selected': tab === id ? 'true' : 'false', 'data-tab': id,
        onclick: () => { tab = id; this.render(body, { focusTab: true }); },
      }, es, ' ', h('small', {}, en), h('i', {}, n))));
      body.replaceChildren(bar, tab === 'papers' ? papersTab() : discoveries());
      if (o.focusTab) body.querySelector('.jtab.on')?.focus({ preventScroll: true });
    },
  };
}
