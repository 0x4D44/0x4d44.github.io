// Glasgow Subway explorer entry point.
import { loadAll } from './explorer/data.js';
import { App, detectQuality } from './explorer/app.js';
import { UI } from './explorer/ui.js';
import { Tour } from './explorer/tour.js';

const base = new URL('../', import.meta.url);
const $ = (s) => document.querySelector(s);
const bar = $('#loadbar i'), msg = $('#loadmsg');
const progress = (p, m) => { bar.style.width = Math.round(p * 100) + '%'; if (m) msg.textContent = m; };

function webglOk() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

let resolveReady, rejectReady;
const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
window.__explorer = { ready, state: null };
ready.catch(() => {});

async function boot() {
  if (!webglOk()) { $('#loading').hidden = true; $('#nogl').hidden = false; throw new Error('WebGL unavailable'); }
  progress(0.02, 'Starting up');
  const data = await loadAll(base, progress);
  const app = new App({ canvas: $('#gl'), labelsEl: $('#labels'), base, data, qualityName: detectQuality() });
  await app.init(progress);
  const ui = new UI(app); ui.initProfile(); ui.tour = new Tour(app, ui);
  app.ui = ui;
  const hash = app.readHash();
  if (Object.keys(hash).length) app.applyHash();
  else { app.setXrayInstant(0); }
  app.emit('xray', app.state.xray);
  progress(0.9, 'Loading the first streets');
  await app.city.whenLoaded(Math.min(6, app.city.total || 1), 25000);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  progress(1, 'Ready'); $('#loading').classList.add('done'); setTimeout(() => ($('#loading').hidden = true), 700);
  app.state.ready = true; document.body.classList.add('ready');
  if (data.notes.length) console.info('[explorer] fallbacks:', data.notes.join('; '));
  Object.assign(window.__explorer, {
    app, ui, state: app.state, notes: data.notes,
    flyToStation: (id, opts) => app.flyToStation(id, opts), selectStation: (id, o) => app.selectStation(id, o),
    setXray: (v) => app.setXrayInstant(v), setLight: (n, i) => app.setLight(n, i), setExaggeration: (k) => app.setExaggeration(k),
    setQuality: (q) => app.setQuality(q), hero: () => app.hero(), city: app.city, ug: app.ug, rig: app.rig,
    whenCityLoaded: (n) => app.city.whenLoaded(n), startTour: () => ui.tour.start(), stopTour: () => ui.tour.stop(),
    toggleProfile: (f) => ui.toggleProfile(f), setView: (v) => app.rig.setView(v),
  });
  resolveReady(window.__explorer);
}
boot().catch((e) => { if (!$('#nogl').hidden) { console.info('[explorer] ' + e.message); return; } console.error(e); $('#loadmsg').textContent = 'Sorry - the explorer failed to start: ' + e.message; $('#loading').classList.add('failed'); rejectReady(e); });
