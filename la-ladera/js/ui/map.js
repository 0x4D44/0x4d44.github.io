// Stylised plan of the barrio (owner: A1): hillshade + contours, plazas, streets by surface (stairs as treads), buildings by kind,
// landmarks, area names, discovery pins and the player arrow. Canvas 2D; wheel / pinch / buttons zoom, drag pans. North (the hilltop) is up.
// Labels are placed by priority and never overlap each other, a marker, a pin or the arrow: landmarks first (the important kinds before streets and shops, each
// trying above, below, then beside its marker), then area names, then the pins' names, then the lots' names. What does not fit stays hidden and appears as you zoom in.
// A label also stays inside the 200 m frame of the plan (the line that is the map's edge), and the legend never lies on the plan: on a wide canvas it is a column in the
// empty margin beside the plan (SIDE_MARGIN), otherwise it has a strip below the plan that fit() leaves free (view.band).
import { h } from './panels.js';
import { isFind } from '../core/registries.js';

const LOT = { house: '#cf9a6a', rowhouse: '#c9a074', apartments: '#b39580', shophouse: '#e6a94f', courtyard: '#c29a6a', tenement: '#a78a76', unfinished: '#9a9086', cornerstore: '#eab356', chapel: '#f1e9d6', school: '#82aedb', clinic: '#93d3b8', workshop: '#8f949d', kiosk: '#e58f50', hall: '#bd93d4' };
const ROAD = { asphalt: '#5b534b', concrete: '#8e8272', cobble: '#8c7657', dirt: '#97734c', stairs: '#8e8272' };
const BED = '#2a1f17';
/** How wide the empty margin beside the square plan must be (px, each side) for the legend to stand there as a column (css `.mapwrap.lgside`: about 120 px wide, 8 px in from the edge). */
export const SIDE_MARGIN = 150;
/**
 * Where the labels of one frame go. `taken` holds the rectangles already used (markers, pins, the arrow, the compass, labels already drawn): place() gives a label the first
 * free spot, so the label placed first is the one that stays when two compete. `drawn` is what was actually placed ({ text, x, y, w, h }), for the tests.
 */
export class LabelBook {
  // bounds { w, h }: a label may not leave the canvas (2 px margin); with { x0, y0, x1, y1 } too, it may not leave that part of it either (the plan's frame: R2c-015, a label ran over the map's edge)
  constructor(bounds = null) { this.taken = []; this.drawn = []; this.bounds = bounds; }
  keep(x, y, hw, hh = hw) { this.taken.push([x - hw, y - hh, 2 * hw, 2 * hh]); }
  free(r) {
    const b = this.bounds;
    if (b && (r[0] < (b.x0 ?? 0) + 2 || r[1] < (b.y0 ?? 0) + 2 || r[0] + r[2] > (b.x1 ?? b.w) - 2 || r[1] + r[3] > (b.y1 ?? b.h) - 2)) return false;
    return !this.taken.some((q) => r[0] < q[0] + q[2] && r[0] + r[2] > q[0] && r[1] < q[1] + q[3] && r[1] + r[3] > q[1]);
  }
  /** The first free spot for a label w x hgt centred on (x, y) or on one of alts(w) -> [[dx, dy], ...]: [cx, cy], or null when none is free (force: the home spot whatever is there). */
  place(x, y, w, hgt, alts = null, force = false, text = '') {
    for (const [dx, dy] of [[0, 0], ...(alts ? alts(w) : [])]) {
      const cx = x + dx, cy = y + dy, r = [cx - w / 2, cy - hgt / 2, w, hgt];
      if (force || this.free(r)) { this.taken.push(r); this.drawn.push({ text, x: cx, y: cy, w, h: hgt }); return [cx, cy]; }
    }
    return null;
  }
}
/** Where a landmark's name may go when the home spot (14 px above the marker) is taken: below, beside, then the four diagonals (offsets from the home spot, for a label w wide). */
export const LM_SPOTS = (w) => [[0, 28], [w / 2 + 11, 14], [-(w / 2 + 11), 14], [w / 2 + 7, 2], [-(w / 2 + 7), 2], [w / 2 + 7, 26], [-(w / 2 + 7), 26]];
export const LM_PRI = { viewpoint: 1, chapel: 1, school: 1, clinic: 1, hall: 1, court: 1, shrine: 2, plaza: 2, stairs: 3, street: 3, shop: 3, busstop: 4 };      // landmark kinds: the lower, the sooner it gets its place
/** The landmarks in the order they get their labels: by the priority of their kind (an unlisted kind counts 3), the plan's own order within a priority. */
export const byPriority = (landmarks) => [...(landmarks ?? [])].map((lm, i) => ({ lm, i })).sort((a, b) => (LM_PRI[a.lm.kind] ?? 3) - (LM_PRI[b.lm.kind] ?? 3) || a.i - b.i).map((e) => e.lm);

function lotPoly(ctx, lot) {
  const fp = ctx.buildings.get(lot.id)?.footprint;
  if (fp?.length) return fp;
  const c = Math.cos(lot.rotY ?? 0), s = Math.sin(lot.rotY ?? 0), hw = (lot.w ?? 6) / 2, hd = (lot.d ?? 8) / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, z]) => [lot.x + x * c + z * s, lot.z - x * s + z * c]);
}
const centroid = (poly) => { let x = 0, z = 0; for (const p of poly) { x += p[0]; z += p[1]; } return [x / poly.length, z / poly.length]; };

/** Terrain relief rendered once: shaded relief + 5 m contour lines, 0.5 m per pixel. */
function makeRelief(plan) {
  const N = 400, cell = 200 / N, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N), H = new Float32Array((N + 2) * (N + 2));
  for (let j = 0; j < N + 2; j++) for (let i = 0; i < N + 2; i++) H[j * (N + 2) + i] = plan.heightAt(-100 + (i - 1 + 0.5) * cell, -100 + (j - 1 + 0.5) * cell);
  let lo = Infinity, hi = -Infinity; for (const v of H) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const L = [-0.55, 0.62, 0.55], ln = Math.hypot(...L); L[0] /= ln; L[1] /= ln; L[2] /= ln;      // light from the north-west, fairly low
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = (j + 1) * (N + 2) + i + 1, dx = (H[a + 1] - H[a - 1]) / (2 * cell), dz = (H[a + N + 2] - H[a - N - 2]) / (2 * cell);
    const nl = Math.hypot(dx, 1, dz), sh = Math.max(0, (-dx * L[0] + 1 * L[1] - dz * L[2]) / nl);
    const t = (H[a] - lo) / (hi - lo || 1), k = 0.55 + 0.75 * sh;
    let r = (38 + 30 * t) * k, gg = (30 + 24 * t) * k, b = (22 + 14 * t) * k;
    if (Math.floor(H[a] / 5) !== Math.floor(H[a + 1] / 5) || Math.floor(H[a] / 5) !== Math.floor(H[a + N + 2] / 5)) { r *= 1.55; gg *= 1.5; b *= 1.4; }   // contour
    const o = (j * N + i) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

export function mapPanel(ctx) {
  let relief = null, raf = 0, off = null;
  return {
    title: 'Mapa del barrio',
    render(body) {
      this.close?.();
      const plan = ctx.plan;
      if (!plan) { body.replaceChildren(h('p', {}, 'El mapa todavía no está listo.')); return; }
      relief ??= makeRelief(plan);
      const cv = h('canvas', { 'aria-label': 'Mapa del barrio, el norte arriba', tabindex: 0 }), g = cv.getContext('2d');
      const wrap = h('div', { class: 'mapwrap' }, cv);
      const view = { cx: 0, cz: 0, s: 3, W: 1, Hh: 1, band: 0 };
      // The whole barrio is fitted into what the legend leaves free along the bottom edge (view.band: its height and its margin), so at the first look the legend never sits on the plan (R2c-015:
      // its strip hid the south end of the map and the labels there ran into it). Zoomed in, the legend is an overlay like the buttons, and the labels keep clear of it.
      const room = () => Math.max(view.Hh - view.band, view.Hh * 0.6);
      const fit = () => { view.s = Math.min(view.W, room()) / 208; view.cx = 0; view.cz = (view.Hh - room()) / (2 * view.s); };      // the plan is centred in the room above the legend
      const sx = (x) => (x - view.cx) * view.s + view.W / 2, sz = (z) => (z - view.cz) * view.s + view.Hh / 2;
      const zoomAt = (px, py, k) => {
        const wx = (px - view.W / 2) / view.s + view.cx, wz = (py - view.Hh / 2) / view.s + view.cz;
        view.s = Math.min(24, Math.max(Math.min(view.W, room()) / 260, view.s * k));
        view.cx = wx - (px - view.W / 2) / view.s; view.cz = wz - (py - view.Hh / 2) / view.s;
        draw();
      };
      const poly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sz(p[1])) : g.moveTo(sx(p[0]), sz(p[1])))); g.closePath(); };
      let book = new LabelBook();                                   // this frame's taken rectangles: a later label that would overlap one (or leave the canvas) is not drawn
      const keep = (x, y, hw, hh = hw) => book.keep(x, y, hw, hh);   // a marker that labels must stay clear of
      /** Draw `txt` centred on (x, y), or at the first of the alternative spots alts(w) -> [[dx, dy], ...] where it overlaps nothing; false when it fits nowhere (and is not drawn). */
      const label = (txt, x, y, size, col = '#f6ead7', weight = 600, force = false, alts = null) => {
        g.font = `${weight} ${size}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const at = book.place(x, y, g.measureText(txt).width + 4, size + 2, alts, force, txt);
        if (!at) return false;
        g.lineWidth = 3; g.strokeStyle = 'rgba(20,14,10,.85)'; g.strokeText(txt, at[0], at[1]); g.fillStyle = col; g.fillText(txt, at[0], at[1]);
        return true;
      };

      function draw() {
        const dpr = Math.min(2, window.devicePixelRatio || 1), w = wrap.clientWidth, hgt = wrap.clientHeight;
        if (!w || !hgt) return;
        // Where the legend goes (R2c-015: on a wide canvas its strip lay across the south end of the plan): in the empty margin beside the square plan as a column when the margin is wide
        // enough for one, else (tall or squarish canvases) along the bottom, and then fit() leaves it that strip (view.band: its height and 8 px above and below it).
        const side = (w - Math.min(w, hgt)) / 2 >= SIDE_MARGIN; wrap.classList.toggle('lgside', side);
        const lg = wrap.querySelector('.maplegend'); view.band = side || !lg ? 0 : lg.offsetHeight + 16;
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hgt * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); const first = view.W === 1; view.W = w; view.Hh = hgt; if (first) fit(); }
        view.W = w; view.Hh = hgt;
        // labels stay inside the plan's frame (3 px clear of its line) and the canvas: one that straddled the south edge was drawn over the line (R2c-015)
        const fx = sx(-100), fy = sz(-100), fw = 200 * view.s;
        g.setTransform(dpr, 0, 0, dpr, 0, 0); book = new LabelBook({ w, h: hgt, x0: Math.max(0, fx + 3), y0: Math.max(0, fy + 3), x1: Math.min(w, fx + fw - 3), y1: Math.min(hgt, fy + fw - 3) });
        keep(w - 24, 28, 12, 16); book.taken.push([10, 9, view.s * 25 + 8, 34]);                     // the compass and the scale bar (drawn last, always)
        const wr = wrap.getBoundingClientRect();
        for (const el of wrap.querySelectorAll('.mapctl, .maplegend')) { const r = el.getBoundingClientRect(); book.taken.push([r.left - wr.left - 3, r.top - wr.top - 3, r.width + 6, r.height + 6]); }   // the buttons and the legend sit on the canvas
        g.fillStyle = BED; g.fillRect(0, 0, w, hgt);
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(relief, fx, fy, fw, fw);
        g.strokeStyle = 'rgba(246,234,215,.35)'; g.lineWidth = 1; g.strokeRect(fx, fy, fw, fw);

        for (const pl of plan.plazas ?? []) { poly(pl.poly); g.fillStyle = pl.kind === 'mirador' ? '#7d6a49' : '#8c7a5c'; g.fill(); g.strokeStyle = '#2a1f17'; g.lineWidth = 1; g.stroke(); }
        const roads = [...(plan.streets ?? [])].sort((a, b) => (a.kind === 'stair') - (b.kind === 'stair'));
        g.lineJoin = 'round'; g.lineCap = 'butt';
        for (const pass of [0, 1]) for (const st of roads) {
          if (!st.pts?.length) continue;
          const wpx = Math.max(2, st.width * view.s);
          g.beginPath(); st.pts.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sz(p[1])) : g.moveTo(sx(p[0]), sz(p[1]))));
          if (pass === 0) { g.strokeStyle = '#1d150f'; g.lineWidth = wpx + 2; g.setLineDash([]); g.stroke(); }
          else {
            g.strokeStyle = ROAD[st.surface] ?? ROAD.concrete; g.lineWidth = wpx; g.setLineDash([]); g.stroke();
            if (st.kind === 'stair' || st.surface === 'stairs') { g.strokeStyle = '#e9dcc0'; g.lineWidth = wpx; g.setLineDash([Math.max(1, view.s * 0.3), Math.max(2, view.s * 0.6)]); g.stroke(); g.setLineDash([]); }
            else if (st.kind === 'road') { g.strokeStyle = 'rgba(255,225,150,.55)'; g.lineWidth = 1; g.setLineDash([6, 6]); g.stroke(); g.setLineDash([]); }
          }
        }
        for (const lot of plan.lots ?? []) {
          const p = lotPoly(ctx, lot); poly(p);
          g.fillStyle = LOT[lot.kind] ?? '#b99a80'; g.fill(); g.strokeStyle = 'rgba(20,14,10,.9)'; g.lineWidth = 1.2; g.stroke();
        }
        // markers first (so no label sits on one), then the labels by priority: landmarks, areas, the pins' names, the lots' names
        const lms = byPriority(plan.landmarks).map((lm) => ({ lm, x: sx(lm.x), y: sz(lm.z) }));
        for (const { x, y } of lms) {
          g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.closePath();
          g.fillStyle = '#e9a23b'; g.fill(); g.strokeStyle = '#1b1410'; g.lineWidth = 1.5; g.stroke();
          keep(x, y, 7);
        }
        const found = ctx.discover.found, pins = [];
        for (const d of ctx.discover.items.values()) {
          if (!found.has(d.id) || isFind(d)) continue;                            // the things found in drawers are not places on the map
          const x = sx(d.x), y = sz(d.z);
          g.beginPath(); g.arc(x, y, 5, 0, 7); g.fillStyle = '#ffd27a'; g.fill(); g.strokeStyle = '#7a4a10'; g.lineWidth = 1.5; g.stroke();
          keep(x, y, 6); pins.push({ d, x, y });
        }
        const p = ctx.player;
        if (p) keep(sx(p.s.x), sz(p.s.z), 12);
        for (const { lm, x, y } of lms) label(lm.name, x, y - 14, 11, '#f6ead7', 600, false, LM_SPOTS);                                   // above its marker, else below, beside it, or diagonal
        if (view.s < 6) for (const ar of plan.areas ?? []) { if (!ar.poly?.length) continue; const [cx, cz] = centroid(ar.poly); label(String(ar.name).toUpperCase(), sx(cx), sz(cz), 10, 'rgba(246,234,215,.55)', 700); }
        if (view.s > 4) for (const { d, x, y } of pins) label(d.name, x, y + 13, 10, '#ffe7b0', 500);
        if (view.s > 5) for (const lot of plan.lots ?? []) { const [cx, cz] = centroid(lotPoly(ctx, lot)); label(String(lot.name ?? '').slice(0, 24), sx(cx), sz(cz), Math.min(13, 8 + view.s * 0.35), '#fff7e6', 500); }
        if (p) {
          const x = sx(p.s.x), y = sz(p.s.z), fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), px = -fz, pz = fx;
          g.beginPath(); g.arc(x, y, 11, 0, 7); g.fillStyle = 'rgba(233,162,59,.28)'; g.fill();
          g.beginPath(); g.moveTo(x + fx * 11, y + fz * 11); g.lineTo(x - fx * 6 + px * 6, y - fz * 6 + pz * 6); g.lineTo(x - fx * 3, y - fz * 3); g.lineTo(x - fx * 6 - px * 6, y - fz * 6 - pz * 6); g.closePath();
          g.fillStyle = '#fff3d6'; g.fill(); g.strokeStyle = '#1b1410'; g.lineWidth = 1.6; g.stroke();
        }
        // compass + scale bar
        label('N', w - 24, 22, 13, '#e9a23b', 800, true);                                          // its spot was reserved above
        g.beginPath(); g.moveTo(w - 24, 34); g.lineTo(w - 24, 42); g.strokeStyle = '#e9a23b'; g.lineWidth = 2; g.stroke();
        const bar = view.s * 25; g.fillStyle = '#f6ead7'; g.fillRect(12, 14, bar, 3); g.fillRect(12, 11, 1.5, 9); g.fillRect(12 + bar - 1.5, 11, 1.5, 9);
        g.font = '600 11px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = '#f6ead7'; g.fillText('25 m', 12, 22);
        cv.__labels = book.drawn; cv.__taken = book.taken; cv.__view = { s: view.s, W: view.W, H: view.Hh, frame: [fx, fy, fw, fw], band: view.band };      // what this frame placed (tests/ui-flow.test.mjs reads it)
      }

      // input: drag to pan, wheel / pinch / buttons to zoom
      const ptrs = new Map(); let last = null;
      cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.offsetX, e.offsetY]); last = null; });
      cv.addEventListener('pointermove', (e) => {
        if (!ptrs.has(e.pointerId)) return;
        const prev = ptrs.get(e.pointerId), cur = [e.offsetX, e.offsetY]; ptrs.set(e.pointerId, cur);
        if (ptrs.size === 1) { view.cx -= (cur[0] - prev[0]) / view.s; view.cz -= (cur[1] - prev[1]) / view.s; draw(); }
        else if (ptrs.size === 2) {
          const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (last) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / last);
          last = d;
        }
      });
      const up = (e) => { ptrs.delete(e.pointerId); last = null; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0016)); }, { passive: false });
      const center = () => { if (ctx.player) { view.cx = ctx.player.s.x; view.cz = ctx.player.s.z; if (view.s < 4) view.s = 5; draw(); } };
      wrap.append(
        h('div', { class: 'mapctl' }, h('button', { type: 'button', 'aria-label': 'Acercar', onclick: () => zoomAt(view.W / 2, view.Hh / 2, 1.5) }, '+'), h('button', { type: 'button', 'aria-label': 'Alejar', onclick: () => zoomAt(view.W / 2, view.Hh / 2, 1 / 1.5) }, '−'),
          h('button', { type: 'button', 'aria-label': 'Centrar en mí', onclick: center }, '⌖'), h('button', { type: 'button', 'aria-label': 'Ver todo', onclick: () => { fit(); draw(); } }, '▢')),
        h('div', { class: 'maplegend' },
          [['#5b534b', 'Calle'], ['#e9dcc0', 'Escalera'], ['#8c7a5c', 'Plaza'], ['#cf9a6a', 'Edificio'], ['#e9a23b', 'Lugar'], ['#ffd27a', 'Descubierto']].map(([c, t]) => h('span', {}, (() => { const i = h('i'); i.style.background = c; return i; })(), t))),
      );
      body.replaceChildren(wrap);
      const ro = new ResizeObserver(() => draw()); ro.observe(wrap);
      raf = requestAnimationFrame(() => draw());                    // opens on the whole barrio with the arrow on it; the target button zooms to you
      off = () => { ro.disconnect(); cancelAnimationFrame(raf); };
      this.close = off;
    },
  };
}
