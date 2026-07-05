// ============================================================
// 0x4D44 — interactive listing
// Vanilla JS. No framework. Handles filter/sort/layout state and
// renders the listing into #listing. State persists to localStorage.
// ============================================================

(function () {
  'use strict';

  const STATE_KEY = '0x4d44.listing.v1';
  const defaults = { filter: 'all', sort: 'recent', layout: 'table' };

  function loadState() {
    try { return Object.assign({}, defaults, JSON.parse(localStorage.getItem(STATE_KEY) || '{}')); }
    catch (_) { return Object.assign({}, defaults); }
  }
  function saveState(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (_) {} }

  const state = loadState();

  const CATALOGUE_INSERTS = [
    {
      slug: 'cruise-propulsion',
      title: 'The Electric Wake',
      tagline: 'A deep interactive cutaway of diesel-electric cruise propulsion: medium-speed gensets, 11 kV switchboards, transformers, VFDs, pod motors and the 20 MW Azipods that turn thrust into steering. Trace megawatts from fuel rack to propeller, calculate currents, compare engine plants and watch the load-sharing system breathe. Vanilla JS on SVG and canvas — no dependencies, no build step.',
      url: 'https://0x4d44.github.io/cruise-propulsion/',
      illustration: 'ill-ship',
      date: '2026-07-05T12:00:00',
      year: 2026,
      readingMin: 32,
      words: 7600,
      tags: ['software', 'engineering', 'maritime'],
      real: true,
    },
  ];

  const catalog = window.ESSAYS || (window.ESSAYS = []);
  for (const item of CATALOGUE_INSERTS) {
    const i = catalog.findIndex(e => e.slug === item.slug);
    if (i === -1) catalog.unshift(item);
    else catalog[i] = Object.assign({}, catalog[i], item);
  }

  const essays = catalog;
  const tagsOf = e => e.tags || (e.tag ? [e.tag] : []);
  const hasNumber = v => Number.isFinite(v);
  const readingText = e => hasNumber(e.readingMin) ? `${e.readingMin}m` : '';
  const wordsText = (e, suffix) => hasNumber(e.words) ? `${(e.words / 1000).toFixed(1)}k${suffix}` : '';
  const sizeMobileParts = e => [readingText(e), wordsText(e, ' w')].filter(Boolean);
  const sizeText = e => [readingText(e), wordsText(e, '')].filter(Boolean).join(' · ');

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, v);
    }
    if (children) for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function svgUse(symbolId) {
    const ns = 'http://www.w3.org/2000/svg';
    const xlink = 'http://www.w3.org/1999/xlink';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(ns, 'use');
    use.setAttributeNS(xlink, 'xlink:href', '#' + symbolId);
    use.setAttribute('href', '#' + symbolId);
    svg.appendChild(use);
    return svg;
  }

  function buildStatusbar() {
    const stats = window.siteStats();
    document.getElementById('stat-tot').textContent = `tot=${stats.total}  words=${stats.words.toLocaleString()}  subjects=${stats.subjects}`;
    document.getElementById('stat-last').textContent = stats.last ? `last=${window.fmtDate(stats.last.date)}` : '';
    document.getElementById('build-date').textContent = window.fmtDate(new Date().toISOString().slice(0, 10));
  }

  function tagCount(tag) {
    if (tag === 'all') return essays.length;
    return essays.reduce((n, e) => n + (tagsOf(e).includes(tag) ? 1 : 0), 0);
  }

  function makeButton(value, label, key, count) {
    const b = el('button', {
      type: 'button',
      'data-value': value,
      'aria-pressed': state[key] === value ? 'true' : 'false',
      onclick: () => { state[key] = value; saveState(state); render(); },
    });
    b.appendChild(document.createTextNode(label));
    if (count != null) b.appendChild(el('span', { class: 'cnt' }, String(count)));
    return b;
  }

  function buildControlRow(rowId, options, key) {
    const row = document.getElementById(rowId);
    row.innerHTML = '';
    options.forEach(o => row.appendChild(makeButton(o[0], o[1], key)));
  }

  function buildFilter() {
    const container = document.getElementById('filter-row');
    container.innerHTML = '';
    const groups = window.TAG_GROUPS || [{ label: '', tags: (window.TAGS || ['all']).filter(t => t !== 'all') }];
    groups.forEach((group, gi) => {
      const chips = el('div', { class: 'btn-row' });
      const tags = gi === 0 ? ['all', ...group.tags] : group.tags;
      tags.forEach(t => chips.appendChild(makeButton(t, '--' + t, 'filter', tagCount(t))));
      container.appendChild(el('div', { class: 'filter-group' }, [
        el('div', { class: 'filter-group-label' }, group.label || ''),
        chips,
      ]));
    });
  }

  function buildControls() {
    buildFilter();
    buildControlRow('sort-row', [['recent', 'date↓'], ['oldest', 'date↑'], ['length', 'len↓'], ['year', 'yr↑']], 'sort');
    buildControlRow('layout-row', [['table', '--table'], ['grid', '--grid']], 'layout');
  }

  function sortedFiltered() {
    let list = essays.slice();
    if (state.filter !== 'all') list = list.filter(e => tagsOf(e).includes(state.filter));
    if (state.sort === 'recent') list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (state.sort === 'oldest') list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (state.sort === 'length') list.sort((a, b) => (b.words || 0) - (a.words || 0));
    if (state.sort === 'year') list.sort((a, b) => (a.year || 0) - (b.year || 0));
    return list;
  }

  function rowEl(essay, idx) {
    const wrapper = el('a', { class: 'row', href: essay.url || '#', target: essay.url ? '_blank' : null, rel: essay.url ? 'noopener' : null });
    const titleBlock = el('div', { class: 'row-title-block' }, [
      el('div', { class: 'row-title' }, essay.title),
      el('div', { class: 'row-tagline' }, essay.tagline),
      el('div', { class: 'row-meta-mobile' }, [
        ...sizeMobileParts(essay).map(text => el('span', null, text)),
        el('span', null, tagsOf(essay).join(' · ')),
        el('span', null, String(essay.year)),
        el('span', { class: essay.real ? 'pub' : 'drf' }, essay.real ? '[PUB]' : '[DRAFT]'),
      ]),
    ]);
    wrapper.appendChild(el('span', { class: 'row-num' }, String(idx + 1).padStart(3, '0')));
    wrapper.appendChild(el('div', { class: 'row-fig' }, [svgUse(essay.illustration || 'ill-diesel')]));
    wrapper.appendChild(titleBlock);
    wrapper.appendChild(el('span', { class: 'row-tag' }, tagsOf(essay).join(' · ')));
    wrapper.appendChild(el('span', { class: 'row-size' }, sizeText(essay)));
    wrapper.appendChild(el('span', { class: 'row-year' }, String(essay.year)));
    wrapper.appendChild(el('span', { class: 'row-state ' + (essay.real ? 'published' : 'draft') }, essay.real ? '[PUB]' : '[DRAFT]'));
    return wrapper;
  }

  function cardEl(essay, idx) {
    const wrapper = el('a', { class: 'card', href: essay.url || '#', target: essay.url ? '_blank' : null, rel: essay.url ? 'noopener' : null });
    wrapper.appendChild(el('div', { class: 'card-head' }, [
      el('span', null, String(idx + 1).padStart(3, '0')),
      el('span', null, tagsOf(essay).map(t => t.toUpperCase()).join(' · ')),
    ]));
    wrapper.appendChild(el('div', { class: 'card-fig' }, [svgUse(essay.illustration || 'ill-diesel')]));
    wrapper.appendChild(el('div', { class: 'card-title' }, essay.title));
    wrapper.appendChild(el('div', { class: 'card-tagline' }, essay.tagline));
    wrapper.appendChild(el('div', { class: 'card-foot' }, [
      el('span', null, sizeText(essay)),
      el('span', { class: essay.real ? 'published' : 'draft' }, essay.real ? '[PUB]' : '[DRAFT]'),
    ]));
    return wrapper;
  }

  function refreshPressed() {
    [['filter-row', 'filter'], ['sort-row', 'sort'], ['layout-row', 'layout']].forEach(pair => {
      document.querySelectorAll(`#${pair[0]} button`).forEach(b => {
        b.setAttribute('aria-pressed', b.getAttribute('data-value') === state[pair[1]] ? 'true' : 'false');
      });
    });
  }

  function render() {
    refreshPressed();
    const listing = document.getElementById('listing');
    listing.innerHTML = '';
    const list = sortedFiltered();
    if (!list.length) {
      listing.appendChild(el('div', { class: 'empty', style: 'padding:40px 6px;color:var(--dim);font-size:12px;letter-spacing:1.5px;' }, `// no documents match --${state.filter}`));
      return;
    }
    if (state.layout === 'table') {
      listing.appendChild(el('div', { class: 'table-head' }, [
        el('span', null, '№'), el('span', null, 'FIG'), el('span', null, 'TITLE'), el('span', null, 'SUBJECT'), el('span', null, 'SIZE'), el('span', null, 'YEAR'), el('span', null, 'STATE'),
      ]));
      list.forEach((e, i) => listing.appendChild(rowEl(e, i)));
    } else {
      const grid = el('div', { class: 'grid' });
      list.forEach((e, i) => grid.appendChild(cardEl(e, i)));
      listing.appendChild(grid);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildStatusbar();
    buildControls();
    render();
  });
})();
