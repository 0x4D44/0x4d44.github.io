// All DOM UI: docks/sheet, station list + detail, view controls, story, line facts, long-section, minimap, search, modals.
import * as THREE from 'three';
import { $, h, fmt, paras, clamp, store, yearOf } from './util.js';
import { LongSection } from './longsection.js';

const PANES = {
  stations: { label: 'Stations', icon: '◎' }, station: { label: 'Station', icon: 'ℹ' }, view: { label: 'View', icon: '◐' },
  profile: { label: 'Profile', icon: '∿' }, story: { label: 'Story', icon: '⌛' }, line: { label: 'Line', icon: '◯' },
};
const LAYERS = [['buildings', 'Buildings'], ['roads', 'Roads'], ['water', 'River & water'], ['parks', 'Parks'], ['tunnels', 'Tunnels & trains'], ['stations', 'Stations'], ['labels', 'Labels']];

export class UI {
  constructor(app) {
    this.app = app; this.sub = app.subway; this.panes = {}; this.layerState = {};
    this.mq = matchMedia('(max-width: 899px), (max-height: 520px)');
    this.buildTopbar(); this.buildPanes(); this.buildDocks(); this.buildXrayBar(); this.buildMinimap(); this.buildTip(); this.buildSimDialog();
    this.bindApp(); this.bindKeys();
    this.mq.addEventListener('change', () => this.layout()); this.layout(); this.setSheet('peek');
    this.renderStationList(); this.updateSelected(null);
  }
  toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), ms); }

  // ---------------------------------------------------------------- topbar
  buildTopbar() {
    const a = this.app, bar = $('#topbar .actions');
    const btn = (id, icon, text, title, fn, cls = '') => h('button.tbtn' + (cls ? '.' + cls : ''), { id, type: 'button', title, 'aria-label': title, on: { click: fn } }, h('span.ic', { 'aria-hidden': 'true', text: icon }), h('span.tx', { text }));
    bar.append(
      btn('btn-tour', '▶', 'Tour the loop', 'Start the guided tour of the loop', () => this.tour?.toggle()),
      btn('btn-drive', '⚓', 'Drive', 'Drive or ride a train (simulator)', () => $('#simdlg').showModal(), 'primary'),
      btn('btn-profile', '∿', 'Profile', 'Show the long-section chart', () => this.toggleProfile(), 'desk'),
      btn('btn-home', '⌂', 'Home', 'Return to the overview', () => { a.selectStation(null); a.hero(); }),
      btn('btn-share', '↗', 'Share', 'Copy a link to this view', () => this.share()),
    );
  }
  async share() {
    this.app.writeHash(); const url = location.href;
    try { await navigator.clipboard.writeText(url); this.toast('Link to this view copied'); } catch { this.toast('Copy the address bar to share this view'); }
  }

  // ---------------------------------------------------------------- panes
  buildPanes() {
    const mk = (id) => { const p = h('section.pane', { id: 'pane-' + id, role: 'tabpanel', 'aria-label': PANES[id].label, hidden: true }); this.panes[id] = p; return p; };
    for (const id of Object.keys(PANES)) mk(id);
    this.buildStationsPane(); this.buildViewPane(); this.buildStoryPane(); this.buildLinePane(); this.buildProfilePane();
    this.panes.station.append(h('div.empty', h('p.big', { text: 'Pick a station' }), h('p', { text: 'Choose a station from the list, or click one on the map, to read its story and see how deep it sits.' })));
  }
  buildStationsPane() {
    const p = this.panes.stations;
    this.search = h('input#search', { type: 'search', placeholder: 'Search stations, landmarks...', 'aria-label': 'Search stations', autocomplete: 'off', on: { input: () => this.renderStationList(), keydown: (e) => { if (e.key === 'Enter') { const f = this.filtered?.[0]; if (f) this.app.selectStation(f.id, { fly: true }); } } } });
    this.listEl = h('ol.stlist'); this.countEl = h('div.count');
    p.append(h('div.search', this.search, this.countEl), this.listEl);
  }
  filterStations() {
    const q = (this.search?.value || '').trim().toLowerCase(); const st = this.sub.stations; if (!q) return st;
    return st.filter((s) => [s.name, s.summary, ...(s.nearby || []), ...(s.interchange || []), ...(s.facts || []), s.architecture].join(' ').toLowerCase().includes(q));
  }
  renderStationList() {
    const list = this.filterStations(); this.filtered = list; const max = Math.max(...this.sub.stations.map((s) => s.depth || 0), 1);
    this.listEl.replaceChildren(...list.map((s) => h('li', h('button.sti', { type: 'button', 'data-id': s.id, 'aria-label': `${s.name}, ${fmt(s.depth)} metres below street`, on: { click: () => this.app.selectStation(s.id, { fly: true }), pointerenter: () => this.app.setHover(s.id), pointerleave: () => this.app.setHover(null), focus: () => this.app.setHover(s.id), blur: () => this.app.setHover(null) } },
      h('span.num', { text: s.order + 1 }), h('span.nm', h('b', { text: s.name }), h('i', { text: (s.interchange || []).filter((x) => x !== 'Subway').join(' / ') || (s.platform?.type ? s.platform.type + ' platform' : '') })),
      h('span.dp', { title: 'Depth to rail head below street' }, h('span.bar', h('span', { style: { width: ((s.depth || 0) / max) * 100 + '%' } })), h('em', { text: fmt(s.depth) + ' m' }))))));
    this.countEl.textContent = list.length === this.sub.stations.length ? `${list.length} stations` : `${list.length} of ${this.sub.stations.length}`;
    if (!list.length) this.listEl.append(h('li.none', { text: 'No station matches that search.' }));
    this.markSelectedInList();
  }
  markSelectedInList() { this.listEl.querySelectorAll('.sti').forEach((b) => { const on = b.dataset.id === this.app.state.selected; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'true' : 'false'); }); }

  // station detail
  renderStation(st) {
    const p = this.panes.station; const a = this.app;
    if (!st) { p.replaceChildren(h('div.empty', h('p.big', { text: 'Pick a station' }), h('p', { text: 'Choose a station from the list, or click one on the map, to read its story and see how deep it sits.' }))); return; }
    const max = Math.max(...this.sub.stations.map((s) => s.depth || 0), 1); const i = st.order; const n = this.sub.stations.length;
    const nb = (d) => this.sub.stations[(i + d + n) % n];
    const gauge = this.depthGauge(st, max);
    const chips = [h('span.chip', { text: (st.platform?.type ? st.platform.type[0].toUpperCase() + st.platform.type.slice(1) + ' platform' : 'Platform') }), st.opened ? h('span.chip', { text: 'Opened ' + yearOf(st.opened) }) : null, ...(st.interchange || []).filter((x) => x !== 'Subway').map((x) => h('span.chip.alt', { text: x }))];
    const facts = (st.facts || []).length ? h('div.sec', h('h4', { text: 'Worth knowing' }), h('ul.facts', ...st.facts.map((f) => h('li', { text: f })))) : null;
    const nearby = (st.nearby || []).length ? h('div.sec', h('h4', { text: 'Nearby' }), h('div.chips', ...st.nearby.map((x) => h('span.chip.soft', { text: x })))) : null;
    const dims = [];
    if (st.platform?.lengthM) dims.push(['Platform', `${fmt(st.platform.lengthM, 0)} m long` + (st.platform.widthM ? `, ${fmt(st.platform.widthM, 1)} m wide` : '')]);
    dims.push(['Rail head', `${fmt(st.railY)} m OD`], ['Street level', `${fmt(st.surfaceY)} m OD`]);
    if (st.entrances?.length) dims.push(['Entrances', String(st.entrances.length)]);
    if (st.rebuilt?.length) dims.push(['Rebuilt', st.rebuilt.map((r) => (typeof r === 'object' ? r.year || r.text || '' : r)).join(', ')]);
    const line = this.lineSel ||= h('select#simline', { 'aria-label': 'Circle for the simulator' }, h('option', { value: 'outer', text: 'Outer circle (clockwise)' }), h('option', { value: 'inner', text: 'Inner circle (anticlockwise)' }));
    p.replaceChildren(
      h('article.card',
        h('header.cardhead', h('span.bignum', { 'aria-hidden': 'true', text: st.order + 1 }), h('div', h('h2', { text: st.name }), h('p.sub', { text: `${fmt(st.depth)} m below street` })), gauge),
        h('div.chips', ...chips.filter(Boolean)),
        h('p.lead', { text: st.summary || '' }),
        h('div.actions',
          h('button.btn.primary', { type: 'button', on: { click: () => a.launchSim({ mode: 'drive', station: st.id, line: line.value }) } }, '⚓ Drive the train from here'),
          h('button.btn', { type: 'button', on: { click: () => a.launchSim({ mode: 'ride', station: st.id, line: line.value }) } }, 'Ride the train'),
          h('button.btn', { type: 'button', on: { click: () => a.launchSim({ mode: 'walk', station: st.id, line: line.value }) } }, 'Explore the station'),
          line,
        ),
        h('div.actions.row',
          h('button.btn.ghost', { type: 'button', on: { click: () => { a.setXrayAnimated(1); a.flyToStation(st.id, { xray: 1 }); } } }, 'Look underground'),
          h('button.btn.ghost', { type: 'button', on: { click: () => a.flyToStation(st.id, { xray: 0 }) } }, 'Street view'),
        ),
        h('div.sec', h('h4', { text: 'The station' }), ...paras(st.description)),
        facts,
        h('dl.dims', ...dims.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })])),
        st.architecture ? h('div.sec', h('h4', { text: 'Architecture' }), ...paras(st.architecture)) : null,
        nearby,
        h('nav.pn', { 'aria-label': 'Neighbouring stations' },
          h('button', { type: 'button', on: { click: () => a.selectStation(nb(-1).id) } }, '← ' + nb(-1).name),
          h('button', { type: 'button', on: { click: () => a.selectStation(nb(1).id) } }, nb(1).name + ' →'))));
  }
  depthGauge(st, max) {
    const W = 74, H = 128, top = 14, bot = 112, y = top + (bot - top) * ((st.depth || 0) / max); const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'gauge'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `Depth gauge: ${fmt(st.depth)} metres below street`);
    svg.innerHTML = `<rect x="0" y="${top}" width="${W}" height="${H - top}" fill="var(--earth)"/><rect x="0" y="0" width="${W}" height="${top}" fill="var(--sky)"/><line x1="0" x2="${W}" y1="${top}" y2="${top}" stroke="var(--ink)" stroke-width="1.5"/>`
      + `<line x1="12" x2="12" y1="${top}" y2="${y}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="3 3"/><path d="M8 ${y - 5} L12 ${y} L16 ${y - 5}" fill="none" stroke="var(--accent)" stroke-width="2"/>`
      + `<rect x="22" y="${y - 7}" width="46" height="14" rx="7" fill="var(--accent)"/><text x="45" y="${y + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#17140f">${fmt(st.depth)} m</text><text x="5" y="${top - 3}" font-size="8" fill="var(--ink)">street</text>`;
    return svg;
  }

  // view controls
  buildViewPane() {
    const a = this.app, p = this.panes.view;
    const range = (id, min, max, step, val, fn, label) => h('input', { id, type: 'range', min, max, step, value: val, 'aria-label': label, on: { input: (e) => fn(parseFloat(e.target.value)) } });
    this.xrayRange2 = range('xray2', 0, 100, 1, 0, (v) => { a.setXrayInstant(v / 100); }, 'X-ray amount');
    this.exagRange = range('exag', 1, 8, 0.5, 1, (v) => { this.exagOut.textContent = v + 'x'; clearTimeout(this._et); this._et = setTimeout(() => a.setExaggeration(v), 120); }, 'Vertical exaggeration of the underground');
    this.exagOut = h('output', { text: '1x' });
    const seg = (name, opts, cur, fn) => h('div.seg', { role: 'radiogroup', 'aria-label': name }, ...opts.map(([v, t]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === cur), 'data-v': v, text: t, on: { click: (e) => { fn(v); e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === String(v)))); } } })));
    this.segLight = seg('Time of day', [['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], 'day', (v) => a.setLight(v));
    this.segSpeed = seg('Service speed', [['0', 'Pause'], ['1', 'Real time'], ['10', '10x'], ['60', '60x']], '10', (v) => a.setTimescale(+v));
    this.segQual = seg('Quality', [['low', 'Low'], ['med', 'Medium'], ['high', 'High']], a.qname, (v) => a.setQuality(v));
    const layerBox = h('div.layers', ...LAYERS.map(([k, t]) => { this.layerState[k] = true; return h('label.chk', h('input', { type: 'checkbox', checked: true, 'data-l': k, on: { change: (e) => { this.layerState[k] = e.target.checked; a.setLayer(k, e.target.checked); } } }), h('span', { text: t })); }));
    p.append(
      h('div.sec', h('h4', { text: 'X-ray' }), h('label.rl', h('span', { text: 'Ground and buildings' }), this.xrayRange2), h('label.rl', h('span', { text: 'Underground exaggeration' }), this.exagRange, this.exagOut),
        h('p.hint', { text: 'True scale is 1x. Raising it pushes the tunnels deeper below the streets so the relief reads better.' })),
      h('div.sec', h('h4', { text: 'Layers' }), layerBox),
      h('div.sec', h('h4', { text: 'Time of day' }), this.segLight),
      h('div.sec', h('h4', { text: 'Train service' }), this.segSpeed, h('p.hint', { text: 'Little glowing trains run both circles to a stop-and-go timetable; a full circuit takes about 24 minutes in real time.' })),
      h('div.sec', h('h4', { text: 'Quality' }), this.segQual, h('p.hint', { text: 'Lower settings cut resolution and detail for phones. Anti-aliasing applies after a reload.' })),
      h('div.sec', h('h4', { text: 'Controls' }), h('dl.keys', ...[['Drag', 'orbit'], ['Right-drag / two fingers', 'pan'], ['Wheel / pinch', 'zoom'], ['W A S D', 'move'], ['Q E', 'turn'], ['R F', 'zoom'], ['Arrows', 'turn / tilt'], ['X', 'toggle x-ray'], ['T', 'tour'], ['/', 'search'], ['[ ]', 'previous / next station'], ['Esc', 'deselect']].flatMap(([k, v]) => [h('dt', h('kbd', { text: k })), h('dd', { text: v })]))),
    );
  }
  buildStoryPane() {
    const tl = this.sub.timeline || [];
    this.panes.story.append(h('div.sec', h('h4', { text: 'A history of the Clockwork Orange' }), h('ol.timeline', ...tl.map((e) => h('li', h('span.yr', { text: e.year }), h('div', h('b', { text: e.title }), h('p', { text: e.text })))))));
  }
  buildLinePane() {
    const m = this.sub.meta || {}, t = this.sub.tunnel || {}, rs = this.sub.rollingStock || {}, cur = rs.current || {}; const facts = this.app.data.facts;
    const stat = (k, v, u) => v == null || v === '' ? null : h('div.stat', h('b', { text: v }), u ? h('small', { text: u }) : null, h('span', { text: k }));
    const g = [stat('Length', m.length_km != null ? fmt(m.length_km, 2) : null, 'km'), stat('Stations', m.stations ?? this.sub.stations.length), stat('Gauge', m.gauge_mm, 'mm'), stat('Tunnel bore', m.tunnel_diameter_m ?? t.innerDiameterM, 'm'), stat('Opened', m.opened ? yearOf(m.opened) : null), stat('Operator', null)].filter(Boolean);
    const rsRows = Object.entries(cur).filter(([, v]) => v != null && typeof v !== 'object').map(([k, v]) => [k.replace(/_/g, ' '), String(v)]);
    const pretty = (s) => s.replace(/\bm\b/, 'length (m)').replace(/^./, (c) => c.toUpperCase());
    const hist = (rs.history || []).map((r) => h('li', h('b', { text: r.name || r.type || r.class || 'Rolling stock' }), h('span', { text: [r.years || r.period || r.introduced, r.notes || r.description || r.text].filter(Boolean).join(' - ') })));
    const dyk = (facts?.didYouKnow || facts?.did_you_know || facts?.facts || []).filter((x) => typeof x === 'string');
    this.dykEl = h('p.dyk', { text: dyk[0] || '' }); let di = 0;
    this.panes.line.append(
      h('div.sec', h('h4', { text: m.name || 'Glasgow Subway' }), m.operator ? h('p.sub', { text: 'Operated by ' + m.operator }) : null, h('div.stats', ...g)),
      dyk.length ? h('div.sec.dykbox', h('h4', { text: 'Did you know?' }), this.dykEl, h('button.btn.ghost', { type: 'button', on: { click: () => { di = (di + 1) % dyk.length; this.dykEl.textContent = dyk[di]; } } }, 'Another')) : null,
      t.lining || t.tubeSeparationM ? h('div.sec', h('h4', { text: 'The tunnels' }), h('p', { text: 'Two separate single-bore tubes run side by side: the Outer Circle clockwise and the Inner Circle anticlockwise.' }), h('dl.dims', ...(t.lining ? [h('dt', { text: 'Lining' }), h('dd', { text: t.lining })] : []), ...(t.tubeSeparationM ? [h('dt', { text: 'Tube spacing' }), h('dd', { text: '~' + t.tubeSeparationM + ' m' })] : []), ...(t.depot?.name ? [h('dt', { text: 'Depot' }), h('dd', { text: t.depot.name })] : []))) : null,
      rsRows.length ? h('div.sec', h('h4', { text: 'Rolling stock today' }), h('dl.dims', ...rsRows.flatMap(([k, v]) => [h('dt', { text: pretty(k) }), h('dd', { text: v })]))) : null,
      hist.length ? h('div.sec', h('h4', { text: 'Earlier trains' }), h('ul.facts', ...hist)) : null,
      m.sources?.length ? h('div.sec.src', h('h4', { text: 'Sources' }), h('ul', ...m.sources.map((s) => h('li', h('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.title || s.url }))))) : null,
      m.placeholder ? h('p.hint', { text: 'Showing a placeholder dataset - the research data is not available.' }) : null);
  }
  buildProfilePane() {
    const cv = h('canvas#lscanvas', { 'aria-label': 'Long section of both tunnels against the street surface along the loop. Hover to preview a position in 3D; click to fly there.', role: 'img' });
    this.panes.profile.append(h('div.profhead', h('b', { text: 'Long section' }), h('span', { text: 'Surface and both tunnels along the Outer Circle, with stations and the Clyde crossing. Hover to preview in 3D, click to fly there.' })), h('div.profwrap', cv));
    this.lsCanvas = cv;
  }
  initProfile() {
    const a = this.app;
    this.ls = new LongSection(this.lsCanvas, { subway: this.sub, ground: a.ground, tracks: a.ug.tracks, waterY: a.terrainMod.WATER_Y,
      onHover: (s) => a.showMarker(s), onClick: (s) => { const st = this.ls.stops.reduce((b, q) => (Math.abs(q.s - s) < Math.abs(b.s - s) ? q : b)); if (Math.abs(st.s - s) < 130) a.selectStation(st.id, { fly: true }); else a.flyToChainage(s); } });
  }
  toggleProfile(force) {
    const dr = $('#drawer'); const open = force ?? dr.hasAttribute('hidden'); if (this.mq.matches) { this.showPane('profile'); this.setSheet('half'); return; }
    dr.toggleAttribute('hidden', !open); $('#btn-profile').setAttribute('aria-pressed', String(open)); document.body.classList.toggle('drawer-open', open); this.ls?.resize();
  }

  // ---------------------------------------------------------------- docks
  buildDocks() {
    this.left = this.makeDock($('#dock-left'), ['stations', 'story', 'line']); this.right = this.makeDock($('#dock-right'), ['station', 'view']);
    this.sheet = this.makeDock($('#sheet'), ['stations', 'station', 'view', 'profile', 'story', 'line']);
    $('#drawer .dbody').append(this.panes.profile);
    $$$('#dock-left .collapse, #dock-right .collapse').forEach((b) => b.addEventListener('click', () => { const d = b.closest('.dock'); d.classList.toggle('collapsed'); b.setAttribute('aria-expanded', String(!d.classList.contains('collapsed'))); this.updateVars(); this.app.resize(); }));
    $('#sheet .grab').addEventListener('click', () => this.setSheet(this.sheetState === 'peek' ? 'half' : this.sheetState === 'half' ? 'full' : 'peek'));
    this.sheetState = 'peek'; this.setSheet('peek');
    this.sheetObs = new ResizeObserver(() => document.documentElement.style.setProperty('--sheet-h', $('#sheet').offsetHeight + 'px')); this.sheetObs.observe($('#sheet'));
    // pull-down gesture on the grabber
    let y0 = null; const g = $('#sheet .grab');
    g.addEventListener('pointerdown', (e) => { y0 = e.clientY; }); g.addEventListener('pointerup', (e) => { if (y0 != null && Math.abs(e.clientY - y0) > 30) { e.preventDefault(); this.setSheet(e.clientY < y0 ? (this.sheetState === 'peek' ? 'half' : 'full') : (this.sheetState === 'full' ? 'half' : 'peek')); g.dataset.dragged = '1'; } y0 = null; });
    g.addEventListener('click', (e) => { if (g.dataset.dragged) { delete g.dataset.dragged; e.stopImmediatePropagation(); } }, true);
  }
  makeDock(root, ids) {
    const tabs = $('.tabs', root), body = $('.dock-body', root); const dock = { root, ids, tabs, body, active: ids[0] };
    tabs.setAttribute('role', 'tablist');
    tabs.replaceChildren(...ids.map((id) => h('button.tab', { type: 'button', role: 'tab', id: `tab-${root.id}-${id}`, 'data-pane': id, 'aria-controls': 'pane-' + id, on: { click: () => this.showPane(id, dock) }, onkeydown: null }, h('span.ic', { 'aria-hidden': 'true', text: PANES[id].icon }), h('span.tl', { text: PANES[id].label }))));
    tabs.addEventListener('keydown', (e) => { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; const i = ids.indexOf(dock.active) + (e.key === 'ArrowRight' ? 1 : -1); const nid = ids[(i + ids.length) % ids.length]; this.showPane(nid, dock); $(`[data-pane="${nid}"]`, tabs).focus(); });
    return dock;
  }
  activeDocks() { return this.mq.matches ? [this.sheet] : [this.left, this.right]; }
  layout() {
    const m = this.mq.matches; document.body.classList.toggle('mobile', m);
    for (const d of [this.left, this.right, this.sheet]) d.body.replaceChildren();
    const docks = this.activeDocks();
    for (const d of docks) { for (const id of d.ids) d.body.append(this.panes[id]); if (!d.ids.includes(d.active)) d.active = d.ids[0]; }
    if (!m) $('#drawer .dbody').append(this.panes.profile);
    for (const d of docks) this.showPane(d.active, d);
    if (!m) { this.panes.profile.hidden = false; }
    this.updateVars(); this.app.resize?.(); this.ls?.resize();
  }
  showPane(id, dock) {
    dock ||= this.activeDocks().find((d) => d.ids.includes(id)); if (!dock) return;
    dock.active = id;
    for (const pid of dock.ids) { const on = pid === id; this.panes[pid].hidden = !on; const t = $(`[data-pane="${pid}"]`, dock.tabs); t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; }
    if (dock === this.sheet && this.sheetState === 'peek' && !this.app.state.tour) this.setSheet('half');
    if (id === 'profile') requestAnimationFrame(() => this.ls?.resize());
  }
  setSheet(s) { this.sheetState = s; $('#sheet').dataset.state = s; $('#sheet .grab').setAttribute('aria-expanded', String(s !== 'peek')); requestAnimationFrame(() => this.ls?.resize()); }
  updateVars() {
    const r = document.documentElement.style; const l = $('#dock-left'), rr = $('#dock-right'); const m = this.mq.matches;
    r.setProperty('--lw', m ? '0px' : (l.classList.contains('collapsed') ? 44 : l.offsetWidth) + 'px'); r.setProperty('--rw', m ? '0px' : (rr.classList.contains('collapsed') ? 44 : rr.offsetWidth) + 'px');
  }

  // ---------------------------------------------------------------- x-ray bar, gauge, tip
  buildXrayBar() {
    const a = this.app;
    this.xrayRange = $('#xrayrange'); this.xrayRange.addEventListener('input', () => a.setXrayInstant(this.xrayRange.value / 100));
    $('#xraytoggle').addEventListener('click', () => this.toggleXray());
    this.gaugeEl = $('#gauge');
  }
  toggleXray() { const a = this.app; a.setXrayAnimated(a.state.xray > 0.5 ? 0 : 1); }
  buildMinimap() {
    const a = this.app; this.mm = $('#minimap canvas'); this.mmCtx = this.mm.getContext('2d');
    const pts = [...a.ug.tracks.outer.x]; const xs = [...a.ug.tracks.outer.x, ...a.ug.tracks.inner.x], zs = [...a.ug.tracks.outer.z, ...a.ug.tracks.inner.z];
    this.mmB = { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cz: (Math.min(...zs) + Math.max(...zs)) / 2, r: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2 * 1.12 };
    this.mm.addEventListener('click', (e) => {
      const r = this.mm.getBoundingClientRect(); const S = r.width; const px = (e.clientX - r.left - S / 2) / (S / 2), py = (e.clientY - r.top - S / 2) / (S / 2);
      const az = a.rig.azimuth, c = Math.cos(az), s = Math.sin(az); const ux = px * c + py * s, uz = -px * s + py * c; // inverse rotate
      const x = this.mmB.cx + ux * this.mmB.r * 1.05, z = this.mmB.cz + uz * this.mmB.r * 1.05; const v = a.rig.getView(); v.target.set(x, a.ground(x, z), z); a.flyToView(v, 1.6);
    });
    $('#compass').addEventListener('click', (e) => { e.stopPropagation(); const v = a.rig.getView(); v.azim = 0; a.flyToView(v, 1.2); });
    this.mmN = 0;
  }
  drawMinimap() {
    if ((this.mmN++ % 3) || this.app.state.sim) return; const a = this.app, c = this.mmCtx, S = this.mm.clientWidth; if (!S) return; const dpr = Math.min(2, devicePixelRatio || 1);
    if (this.mm.width !== S * dpr) { this.mm.width = S * dpr; this.mm.height = S * dpr; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, S, S); const az = a.rig.azimuth, ca = Math.cos(az), sa = Math.sin(az); const sc = (S / 2) / (this.mmB.r * 1.05);
    const P = (x, z) => { const dx = x - this.mmB.cx, dz = z - this.mmB.cz; return [S / 2 + (dx * ca - dz * sa) * sc, S / 2 + (dx * sa + dz * ca) * sc]; };
    c.save(); c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 1, 0, 7); c.clip(); c.fillStyle = 'rgba(16,18,22,.78)'; c.fillRect(0, 0, S, S);
    for (const [key, col] of [['inner', '#34c6e8'], ['outer', '#ff7a1f']]) { const t = a.ug.tracks[key]; c.beginPath(); for (let i = 0; i < t.n; i += 2) { const [x, y] = P(t.x[i], t.z[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.strokeStyle = col; c.lineWidth = 1.6; c.globalAlpha = 0.9; c.stroke(); }
    c.globalAlpha = 1;
    for (const s of a.stations) { const [x, y] = P(s.x, s.z); const on = s.id === a.state.selected; c.fillStyle = on ? '#fff' : '#ffd2a8'; c.beginPath(); c.arc(x, y, on ? 3.6 : 2, 0, 7); c.fill(); }
    // view cone
    const [tx, ty] = P(a.rig.target.x, a.rig.target.z), [cx, cy] = P(a.env.camera.position.x, a.env.camera.position.z);
    c.fillStyle = 'rgba(255,255,255,.14)'; c.strokeStyle = 'rgba(255,255,255,.6)'; c.beginPath(); const fov = 0.55; const ang = Math.atan2(ty - cy, tx - cx); const len = Math.max(20, Math.hypot(tx - cx, ty - cy)) * 1.6;
    c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang - fov) * len, cy + Math.sin(ang - fov) * len); c.lineTo(cx + Math.cos(ang + fov) * len, cy + Math.sin(ang + fov) * len); c.closePath(); c.fill(); c.restore();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(S / 2, S / 2, S / 2 - 1, 0, 7); c.stroke();
    const cp = $('#compass'); cp.style.setProperty('--rot', (-az * 180 / Math.PI).toFixed(1) + 'deg');
    // let minimap clicks point to the camera focus
    c.fillStyle = '#ff7a1f'; c.beginPath(); c.arc(tx, ty, 2.5, 0, 7); c.fill();
  }
  buildTip() { this.tip = $('#tip'); }
  showTip(x, y, html) { const t = this.tip; t.replaceChildren(...html); t.hidden = false; const w = t.offsetWidth; t.style.transform = `translate(${clamp(x + 14, 4, this.app.w - w - 4)}px, ${Math.max(4, y - 44)}px)`; }
  hideTip() { this.tip.hidden = true; }

  // ---------------------------------------------------------------- sim dialog
  buildSimDialog() {
    const a = this.app; const dlg = $('#simdlg'); const mode = h('select#sd-mode', { 'aria-label': 'Mode' }, h('option', { value: 'drive', text: 'Drive the train (cab)' }), h('option', { value: 'ride', text: 'Ride as a passenger' }), h('option', { value: 'walk', text: 'Explore a station on foot' }));
    const st = h('select#sd-st', { 'aria-label': 'Station' }, ...this.sub.stations.map((s) => h('option', { value: s.id, text: `${s.order + 1}. ${s.name}` })));
    const line = h('select#sd-line', { 'aria-label': 'Circle' }, h('option', { value: 'outer', text: 'Outer circle (clockwise)' }), h('option', { value: 'inner', text: 'Inner circle (anticlockwise)' }));
    dlg.append(h('form', { method: 'dialog', on: { submit: (e) => { if (e.submitter?.value === 'go') { a.launchSim({ mode: mode.value, station: st.value, line: line.value }); } } } },
      h('h2', { text: 'Take the controls' }), h('p', { text: 'Climb into the cab of a Subway train, or sit back and ride the loop.' }),
      h('label', 'Mode', mode), h('label', 'Start at', st), h('label', 'Circle', line),
      h('div.dlgact', h('button.btn', { value: 'cancel', text: 'Cancel' }), h('button.btn.primary', { value: 'go', text: 'Start' }))));
    dlg.addEventListener('close', () => {});
    a.on('select', (id) => { if (id) st.value = id; });
    a.on('select', () => {}); dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  // ---------------------------------------------------------------- app bindings
  bindApp() {
    const a = this.app;
    a.on('select', (id, o) => this.updateSelected(id, o)); a.on('toast', (m) => this.toast(m));
    a.on('xray', (v) => this.onXray(v));
    a.on('light', (n) => this.segLight.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === n))));
    a.on('hover', (id) => { this.listEl.querySelectorAll('.sti.hv').forEach((b) => b.classList.remove('hv')); if (id) this.listEl.querySelector(`.sti[data-id="${id}"]`)?.classList.add('hv'); this.updateTip(); });
    a.on('tubehover', (hit) => { this.tubeHit = hit; this.updateTip(); this.ls?.setCursor(hit ? hit.outerS : null); if (hit) a.showMarker(hit.outerS); else if (!this.ls?.cursorS) a.showMarker(null); });
    a.on('frame', () => this.drawMinimap());
    a.on('sim', (on) => { if (!on) { this.updateSelected(a.state.selected, { quiet: true }); } });
    a.on('quality', (n) => this.segQual.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === n))));
    a.on('xrayhash', () => {});
  }
  onXray(v) {
    this.xrayRange.value = Math.round(v * 100); this.xrayRange2.value = Math.round(v * 100); $('#xraytoggle').setAttribute('aria-pressed', String(v > 0.5));
    this.xrayRange.style.setProperty('--p', Math.round(v * 100) + '%'); this.xrayRange2.style.setProperty('--p', Math.round(v * 100) + '%');
    document.body.classList.toggle('xray-on', v > 0.25); this.updateGauge();
  }
  updateSelected(id) {
    const st = id ? this.app.byId.get(id) : null; this.renderStation(st); this.markSelectedInList(); this.ls?.setSelected(id); this.updateGauge();
    if (st) { this.showPane('station', this.mq.matches ? this.sheet : this.right); if (this.mq.matches && !this.app.state.tour) this.setSheet('half'); this.listEl.querySelector(`.sti[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' }); $('#pane-station').scrollTop = 0; }
    const dlgSel = $('#sd-st'); if (dlgSel && id) dlgSel.value = id;
  }
  updateGauge() {
    const a = this.app, st = a.state.selected && a.byId.get(a.state.selected), g = this.gaugeEl;
    if (st && a.state.xray > 0.15) { g.hidden = false; g.replaceChildren(h('b', { text: st.name }), h('span', { text: ` rail head ${fmt(st.depth)} m below street` })); } else g.hidden = true;
  }
  updateTip() {
    const a = this.app, p = a.pointer; if (!p.in && !a.state.hovered) { this.hideTip(); return; }
    if (this.tubeHit && !a.state.hovered) { const t = this.tubeHit; this.showTip(t.px, t.py, [h('b', { text: t.key === 'outer' ? 'Outer circle' : 'Inner circle' }), h('span', { text: ` ${fmt(t.depth)} m below street` }), h('small', { text: ` ${fmt(t.outerS / 1000, 2)} km` })]); return; }
    const id = a.state.hovered; if (id && p.in) { const s = a.byId.get(id); this.showTip(p.x, p.y, [h('b', { text: s.name }), h('span', { text: ` ${fmt(s.depth)} m below street` })]); } else this.hideTip();
  }

  bindKeys() {
    addEventListener('keydown', (e) => {
      if (this.app.state.sim || e.ctrlKey || e.metaKey || e.altKey) return; const typing = e.target.closest?.('input,textarea,select'); const k = e.key;
      if (k === 'Escape') { if (typing) { e.target.blur(); return; } if ($('#simdlg').open) return; if (this.tour?.active) this.tour.stop(); else if (this.app.state.selected) this.app.selectStation(null); return; }
      if (typing) return;
      if (k === '/') { e.preventDefault(); this.showPane('stations', this.mq.matches ? this.sheet : this.left); this.search.focus(); }
      else if (k === 'x' || k === 'X') this.toggleXray();
      else if (k === 't' || k === 'T') this.tour?.toggle();
      else if (k === 'h' || k === 'H') this.app.hero();
      else if (k === '[' || k === ']') { const n = this.sub.stations.length, cur = this.app.state.selected ? this.app.byId.get(this.app.state.selected).order : (k === ']' ? -1 : 0); this.app.selectStation(this.sub.stations[(cur + (k === ']' ? 1 : -1) + n) % n].id); }
    });
  }
}
function $$$(sel) { return Array.from(document.querySelectorAll(sel)); }
