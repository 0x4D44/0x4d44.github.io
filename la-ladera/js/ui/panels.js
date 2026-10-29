// Settings, help and journal panels (owner: A1). Each panel is a function (ctx) -> { title, render(body), close?() }.
import { listVoices, testVoice, applyTts } from './tts.js';

export const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) e.append(c?.nodeType ? c : document.createTextNode(c ?? ''));
  return e;
};
const fmtHour = (x) => { const m = Math.round(((x % 24) + 24) % 24 * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const row = (label, hint, control) => h('div', { class: 'row' }, h('label', {}, label, hint ? h('small', {}, hint) : null), control);

// ---- settings ----------------------------------------------------------------------------------------------------------------
export function settingsPanel(ctx) {
  const st = ctx.settings;
  const slider = (key, label, min, max, step, fmt, hint) => {
    const input = h('input', { type: 'range', min, max, step, 'aria-label': label }), val = h('span', { class: 'val' }, fmt(st.v[key]));
    input.value = st.v[key];
    input.addEventListener('input', () => { st.set(key, +input.value); val.textContent = fmt(st.v[key]); });
    return row(label, hint, h('div', { class: 'inline' }, input, val));
  };
  const check = (key, label, hint) => {
    const input = h('input', { type: 'checkbox', 'aria-label': label }); input.checked = !!st.v[key];
    input.addEventListener('change', () => st.set(key, input.checked));
    return row(label, hint, input);
  };
  const select = (key, label, options, hint) => {
    const sel = h('select', { 'aria-label': label }, options.map(([v, t]) => h('option', { value: v }, t)));
    sel.value = st.v[key];
    sel.addEventListener('change', () => st.set(key, sel.value));
    return row(label, hint, sel);
  };
  return {
    title: 'Ajustes',
    render(body) {
      this.close?.();
      const voices = listVoices(ctx), voiceSel = h('select', { 'aria-label': 'Voz' }, [h('option', { value: '' }, 'Automática (la mejor voz en español)'),
        ...voices.map((v) => h('option', { value: v.uri }, `${v.name} · ${v.lang}${v.local ? '' : ' · en línea'}`))]);
      voiceSel.value = voices.some((v) => v.uri === st.v.voiceURI) ? st.v.voiceURI : '';
      voiceSel.addEventListener('change', () => { st.set('voiceURI', voiceSel.value); applyTts(ctx); });
      const status = h('p', { class: 'note' });
      const say = () => {
        const r = testVoice(ctx);
        status.textContent = r === 'ok' ? '' : r === 'unsupported' ? 'Este navegador no tiene voz: verás los subtítulos.' : r === 'blocked' ? 'El navegador bloqueó la voz.' : 'No hay voces en español instaladas: verás los subtítulos.';
      };
      const qualityNow = h('span', { class: 'val' }, '');
      const upd = () => { qualityNow.textContent = ctx.qualityMode === 'auto' ? `ahora: ${({ low: 'baja', medium: 'media', high: 'alta' })[ctx.quality]}` : ''; };
      upd(); const off = ctx.events.on('quality:change', upd); this.close = () => off();
      const hour = h('input', { type: 'range', min: 0, max: 24, step: 0.25, 'aria-label': 'Hora del día' }), hval = h('span', { class: 'val' }, fmtHour(ctx.hour));
      hour.value = ctx.hour;
      hour.addEventListener('input', () => { ctx.setHour(+hour.value); hval.textContent = fmtHour(ctx.hour); });
      const hoff = ctx.events.on('time:change', () => { if (document.activeElement !== hour) { hour.value = ctx.hour; hval.textContent = fmtHour(ctx.hour); } });
      const prevClose = this.close; this.close = () => { prevClose(); hoff(); };
      body.replaceChildren(
        h('h3', {}, 'Imagen · Graphics'),
        row('Calidad gráfica', 'La automática baja el detalle si los fotogramas caen.', h('div', { class: 'inline' }, (() => {
          const sel = h('select', { 'aria-label': 'Calidad gráfica' }, [['auto', 'Automática'], ['low', 'Baja'], ['medium', 'Media'], ['high', 'Alta']].map(([v, t]) => h('option', { value: v }, t)));
          sel.value = st.v.quality; sel.addEventListener('change', () => { st.set('quality', sel.value); upd(); }); return sel;
        })(), qualityNow)),
        slider('fov', 'Campo de visión', 55, 100, 1, (v) => `${Math.round(v)}°`),
        row('Hora del día', 'Mueve el sol: del amanecer a la noche.', h('div', { class: 'inline' }, hour, hval)),
        check('timeFlow', 'Que pase el tiempo', 'El día avanza solo (un día dura unos 48 minutos).'),
        check('crosshair', 'Mostrar la mira'),
        h('h3', {}, 'Control · Controls'),
        slider('sens', 'Sensibilidad del ratón', 0.2, 3, 0.05, (v) => `${v.toFixed(2)}×`),
        check('invertY', 'Invertir el eje vertical'),
        check('headBob', 'Balanceo de la cámara al caminar'),
        h('h3', {}, 'Sonido y voz · Sound and voice'),
        slider('volume', 'Volumen general', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
        check('ttsOn', 'Los vecinos hablan en voz alta', 'Si lo desactivas solo verás los subtítulos.'),
        row('Voz de los vecinos', 'Solo se listan voces en español.', voiceSel),
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: say }, 'Probar voz'), status),
        h('h3', {}, 'Subtítulos · Subtitles'),
        check('subs', 'Mostrar subtítulos'),
        select('subLang', 'Idioma de los subtítulos', [['both', 'Español e inglés'], ['es', 'Solo español'], ['en', 'Solo inglés']]),
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn quiet', onclick: () => { st.reset(); applyTts(ctx); this.render(body); } }, 'Restablecer ajustes')),
      );
    },
  };
}

// ---- help --------------------------------------------------------------------------------------------------------------------
export function helpPanel() {
  const K = (...k) => h('span', {}, k.map((x) => h('kbd', {}, x)));
  const rows = [
    ['Caminar', K('W', 'A', 'S', 'D'), 'Walk'], ['Mirar', 'Ratón', 'Look'], ['Correr', K('Shift'), 'Run'], ['Agacharse', K('C'), 'Crouch'], ['Saltar', K('Espacio'), 'Jump'],
    ['Abrir, hablar, usar', K('E'), 'Open, talk, use (or click)'], ['Elegir respuesta', K('1', '2', '3', '4'), 'Pick a reply'], ['Mapa', K('M'), 'Map'], ['Diario', K('J'), 'Journal'],
    ['Ayuda', K('H'), 'Help'], ['Pausa y menú', K('Esc'), 'Pause and menu'],
  ];
  return {
    title: 'Ayuda',
    render(body) {
      body.replaceChildren(
        h('h3', {}, 'Controles · Controls'),
        h('div', { class: 'helpgrid' }, rows.map(([es, keys, en]) => h('div', {}, h('span', {}, es, ' ', h('small', {}, en)), keys))),
        h('h3', {}, 'Consejos · Tips'),
        h('ul', { class: 'tips' },
          h('li', {}, 'Todas las puertas se abren. Entra a las tiendas, a las casas y sube a las terrazas.'),
          h('li', {}, 'Saluda a los vecinos con la tecla E: tienen rutinas y cuentan cosas del barrio.'),
          h('li', {}, 'Las escaleras y los pasajes llevan a patios escondidos, murales y miradores. Todo lo que encuentres se anota en el diario.'),
          h('li', {}, 'Cambia la hora en Ajustes para ver el barrio de mañana, de tarde o con las ventanas encendidas.'),
          h('li', {}, 'Si te atascas, abre el menú con Esc y elige «Volver al punto de partida».')),
      );
    },
  };
}

// ---- journal -----------------------------------------------------------------------------------------------------------------
export function journalPanel(ctx) {
  const KIND = { mural: 'mural', shrine: 'altar', view: 'vista', story: 'historia', vista: 'vista', mirador: 'vista', hidden: 'escondido', object: 'objeto', room: 'cuarto', person: 'gente', sound: 'sonido', nature: 'naturaleza' };
  return {
    title: 'Diario del barrio',
    render(body) {
      const items = [...ctx.discover.items.values()], found = items.filter((d) => ctx.discover.found.has(d.id));
      const order = ctx.discover.order ?? [];
      found.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      const rest = items.filter((d) => !ctx.discover.found.has(d.id)).sort((a, b) => String(a.kind).localeCompare(String(b.kind)));
      const tag = (d) => h('em', { class: 'kind' }, KIND[d.kind] ?? d.kind ?? '');
      body.replaceChildren(
        h('div', { class: 'jhead' }, h('strong', {}, `${found.length} de ${items.length} descubrimientos`), h('small', {}, 'Camina, mira, abre puertas: lo que encuentres se anota aquí.')),
        h('div', { class: 'jbar' }, (() => { const i = h('i'); i.style.width = `${items.length ? (100 * found.length) / items.length : 0}%`; return i; })()),
        h('div', { class: 'jgrid' },
          found.map((d) => h('div', { class: 'jitem' }, tag(d), h('b', {}, d.name), d.en ? h('span', {}, d.en) : null)),
          rest.map((d) => h('div', { class: 'jitem locked' }, tag(d), h('b', {}, '???'), h('span', {}, 'Todavía por descubrir')))),
      );
    },
  };
}
