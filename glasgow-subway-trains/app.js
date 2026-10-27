/* Glasgow Subway: Trains & Power. Vanilla JS, no dependencies. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function f1(x) { return (Math.round(x * 10) / 10).toLocaleString('en-GB'); }
  function f0(x) { return Math.round(x).toLocaleString('en-GB'); }
  function f2(x) { return (Math.round(x * 100) / 100).toLocaleString('en-GB'); }
  var GEO = window.GEO, GENS = window.GENS, ROWS = window.ROWS, SIM = window.SIM;

  /* ------------------------------------------------------------------ silhouettes */
  var GD = {
    cable:    { w: 2.34,  h: 2.66, R: 0.95, yb: 0.40, cars: [12.3, 11.5], body: ['#6e2b3a', '#e6d9b8'], glass: '#2b2420', roof: '#b9ab88' },
    electric: { w: 2.34,  h: 2.66, R: 0.95, yb: 0.40, cars: [12.3, 11.5], body: ['#a8321f', '#eadfc8'], glass: '#2b2420', roof: '#bdb298' },
    mc:       { w: 2.34,  h: 2.65, R: 0.85, yb: 0.40, cars: [12.58, 12.58, 12.58], body: ['#ff7a1f', '#ff7a1f'], glass: '#16181c', roof: '#d9610f' },
    stadler:  { w: 2.309, h: 2.642, R: 1.0, yb: 0.40, cars: [9.9, 9.9, 9.9, 9.9], body: ['#f2f1ec', '#f2f1ec'], glass: '#0f1113', roof: '#d2d1cb' }
  };
  var BORE = 3.35, CROWN = 2.9; // m; rail top to crown 2.9 m (Explorer data)
  var CY = CROWN - BORE / 2;     // tunnel centre height above rail top

  function outline(g) {
    var hw = g.w / 2, top = g.h, R = g.R, pts = [], i, a;
    pts.push([-hw, g.yb]);
    pts.push([-hw, top - R]);
    for (i = 1; i <= 12; i++) { a = Math.PI - (i / 12) * Math.PI / 2; pts.push([-hw + R + R * Math.cos(a), top - R + R * Math.sin(a)]); }
    for (i = 1; i <= 12; i++) { a = Math.PI / 2 - (i / 12) * Math.PI / 2; pts.push([hw - R + R * Math.cos(a), top - R + R * Math.sin(a)]); }
    pts.push([hw, g.yb]);
    return pts;
  }
  function clearance(g) {
    var best = { gap: 9, p: null };
    outline(g).forEach(function (p) {
      var d = Math.hypot(p[0], p[1] - CY), gap = BORE / 2 - d;
      if (gap < best.gap) best = { gap: gap, p: p, d: d };
    });
    return best;
  }

  function drawSection(svg, gid, cx, cy, S, opts) {
    var g = GD[gid], rail = cy + (BORE / 2 - 0.45) * S; // y of rail top in px
    function X(m) { return cx + m * S; }
    function Y(m) { return rail - m * S; } // m above rail top
    var gr = svgEl('g', null, svg);
    svgEl('circle', { cx: cx, cy: cy, r: BORE / 2 * S, fill: 'var(--tunnel-fill)', stroke: 'var(--tunnel)', 'stroke-width': 5 }, gr);
    // invert / track bed
    svgEl('rect', { x: X(-0.95), y: rail + 0.04 * S, width: 1.9 * S, height: 0.1 * S, fill: 'var(--tunnel)', opacity: .8 }, gr);
    [-0.61, 0.61].forEach(function (rx) { svgEl('rect', { x: X(rx) - 0.035 * S, y: rail, width: 0.07 * S, height: 0.14 * S, fill: 'var(--rail)' }, gr); });
    if (gid === 'cable') svgEl('circle', { cx: X(0), cy: rail - 0.0, r: 0.04 * S, fill: 'var(--c-cable)' }, gr);
    // wheels/bogie (narrow, below the skirt)
    svgEl('rect', { x: X(-0.75), y: Y(0.46), width: 1.5 * S, height: 0.3 * S, rx: 3, fill: '#2a2d33' }, gr);
    // body
    var pts = outline(g).map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ');
    var cid = 'clip' + gid + cx;
    var defs = svgEl('defs', null, gr), cp = svgEl('clipPath', { id: cid }, defs);
    svgEl('polygon', { points: pts }, cp);
    svgEl('polygon', { points: pts, fill: g.body[0], stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1.5 }, gr);
    var b = svgEl('g', { 'clip-path': 'url(#' + cid + ')' }, gr);
    if (gid === 'cable' || gid === 'electric') {
      svgEl('rect', { x: X(-1.3), y: Y(1.45), width: 2.6 * S, height: 2 * S, fill: g.body[1] }, b);
      svgEl('rect', { x: X(-1.3), y: Y(2.7), width: 2.6 * S, height: 0.25 * S, fill: g.roof }, b);
    }
    if (gid === 'mc') {
      svgEl('rect', { x: X(-1.3), y: Y(2.7), width: 2.6 * S, height: 0.3 * S, fill: g.roof, opacity: .6 }, b);
    }
    if (gid === 'stadler') {
      svgEl('rect', { x: X(-1.3), y: Y(2.7), width: 2.6 * S, height: 0.22 * S, fill: g.roof }, b);
      svgEl('rect', { x: X(-1.3), y: Y(0.62), width: 2.6 * S, height: 0.22 * S, fill: '#2a2d33' }, b);
    }
    // windscreen
    if (gid === 'stadler') {
      svgEl('rect', { x: X(-0.95), y: Y(2.05), width: 1.9 * S, height: 1.3 * S, rx: 0.22 * S, fill: g.glass }, gr);
      svgEl('rect', { x: X(-0.84), y: Y(1.9), width: 0.045 * S, height: 0.9 * S, rx: 2, fill: '#fff6dd' }, gr);
      svgEl('rect', { x: X(0.795), y: Y(1.9), width: 0.045 * S, height: 0.9 * S, rx: 2, fill: '#fff6dd' }, gr);
      svgEl('circle', { cx: X(0), cy: Y(0.95), r: 0.12 * S, fill: 'none', stroke: '#ff7a1f', 'stroke-width': 3 }, gr);
    } else if (gid === 'mc') {
      svgEl('rect', { x: X(-0.85), y: Y(2.1), width: 1.7 * S, height: 0.95 * S, rx: 0.12 * S, fill: g.glass }, gr);
      svgEl('circle', { cx: X(-0.8), cy: Y(0.95), r: 0.1 * S, fill: '#fff6dd' }, gr);
      svgEl('circle', { cx: X(0.8), cy: Y(0.95), r: 0.1 * S, fill: '#fff6dd' }, gr);
    } else {
      svgEl('rect', { x: X(-0.9), y: Y(2.15), width: 0.72 * S, height: 0.7 * S, rx: 3, fill: g.glass }, gr);
      svgEl('rect', { x: X(0.18), y: Y(2.15), width: 0.72 * S, height: 0.7 * S, rx: 3, fill: g.glass }, gr);
      svgEl('circle', { cx: X(0), cy: Y(1.0), r: 0.1 * S, fill: '#ffe9a8' }, gr);
    }
    // clearance marker
    var c = clearance(g);
    if (opts && opts.dim) {
      var ang = Math.atan2(c.p[1] - CY, c.p[0]), r2 = BORE / 2;
      var ex = c.p[0] + (r2 - c.d) * Math.cos(ang), ey = c.p[1] + (r2 - c.d) * Math.sin(ang);
      svgEl('line', { x1: X(c.p[0]), y1: Y(c.p[1]), x2: X(ex), y2: Y(ey), stroke: 'var(--bad)', 'stroke-width': 3, 'stroke-linecap': 'round' }, gr);
    }
    return { gap: c.gap, g: gr };
  }

  /* hero */
  (function () {
    var svg = $('#heroArt'); if (!svg) return;
    var S = 100, cx = 210, cy = 214;
    drawSection(svg, 'stadler', cx, cy, S, { dim: true });
    var c = clearance(GD.stadler);
    svgEl('text', { x: cx, y: 410, 'text-anchor': 'middle', fill: 'var(--dim)', 'font-size': 13 }, svg).textContent = 'Bore 3.35 m. Smallest clearance to the lining: ' + f2(c.gap) + ' m (calculated)';
    svgEl('text', { x: cx, y: 24, 'text-anchor': 'middle', fill: 'var(--dim)', 'font-size': 12 }, svg).textContent = 'Stadler METRO, 2.309 x 2.642 m';
  })();

  /* comparator */
  var cmpNarrow = null;
  var selA = $('#cmpA'), selB = $('#cmpB'), cmpSvg = $('#cmpSvg');
  GENS.forEach(function (g, i) {
    [selA, selB].forEach(function (s) { var o = h('option', { value: g.id }); o.textContent = g.name + ' (' + g.years + ')'; s.appendChild(o); });
  });
  selA.value = 'mc'; selB.value = 'stadler';

  function drawSide(svg, gid, y0, S, x0, fs) {
    fs = fs || 12;
    var g = GD[gid], gen = GENS.filter(function (q) { return q.id === gid; })[0];
    var ground = y0 + 3.0 * S, x = x0, total = g.cars.reduce(function (a, b) { return a + b; }, 0);
    var grp = svgEl('g', null, svg);
    svgEl('line', { x1: x0 - 10, y1: ground, x2: x0 + 40 * S, y2: ground, stroke: 'var(--rail)', 'stroke-width': 2 }, grp);
    var gen4 = gid === 'stadler';
    g.cars.forEach(function (len, ci) {
      var gap = gen4 ? 0.12 : 0.3, w = len - gap, top = ground - (0.15 + g.h) * S, r = 0.4 * S;
      var fill = gid === 'mc' ? '#ff7a1f' : gid === 'stadler' ? '#f2f1ec' : g.body[0];
      svgEl('rect', { x: x, y: top, width: w * S, height: (g.h - 0.2) * S, rx: r > 12 ? 12 : r, fill: fill, stroke: 'rgba(0,0,0,.4)' }, grp);
      if (gid === 'cable' || gid === 'electric') svgEl('rect', { x: x + 1, y: top + 1, width: w * S - 2, height: (g.h - 0.2) * 0.45 * S, rx: 6, fill: g.body[1] }, grp);
      // windows
      var nWin = Math.max(2, Math.round(len / 2.3));
      for (var k = 0; k < nWin; k++) {
        var wx = x + (0.5 + k * (w - 1) / nWin) * S + 0.1 * S;
        svgEl('rect', { x: wx, y: top + 0.35 * S, width: (w - 1) / nWin * S * 0.62, height: 0.6 * S, rx: 3, fill: g.glass, opacity: .9 }, grp);
      }
      if (gen4) { // doors: 1+2+2+1
        var doors = ci === 0 || ci === 3 ? 1 : 2;
        for (var d = 0; d < doors; d++) {
          var dx = x + (doors === 1 ? (ci === 0 ? 0.9 : w - 2.1) : (w * (d + 1) / 3 - 0.55)) * S;
          svgEl('rect', { x: dx, y: top + 0.18 * S, width: 1.05 * S, height: 1.6 * S, rx: 5, fill: '#ff7a1f', opacity: .95 }, grp);
        }
      }
      // wheels
      var bx = ci === 0 ? [1.8, len - 2.0] : [2.0, len - 2.0];
      if (gen4) bx = ci === 0 ? [1.6, len - 1.6] : ci === 3 ? [1.6, len - 1.6] : [len / 2];
      bx.forEach(function (b) {
        [-0.55, 0.55].forEach(function (o) { svgEl('circle', { cx: x + (b + o) * S, cy: ground - 0.27 * S, r: 0.27 * S, fill: '#2a2d33', stroke: '#777', 'stroke-width': 1 }, grp); });
      });
      x += len * S;
    });
    // dimension
    var yd = ground + 14;
    svgEl('line', { x1: x0, y1: yd, x2: x0 + total * S, y2: yd, stroke: 'var(--dim)' }, grp);
    svgEl('line', { x1: x0, y1: yd - 4, x2: x0, y2: yd + 4, stroke: 'var(--dim)' }, grp);
    svgEl('line', { x1: x0 + total * S, y1: yd - 4, x2: x0 + total * S, y2: yd + 4, stroke: 'var(--dim)' }, grp);
    var t = svgEl('text', { x: x0 + total * S / 2, y: yd + 16, 'text-anchor': 'middle', fill: 'var(--dim)', 'font-size': fs }, grp);
    t.textContent = gen.name + ' - about ' + f1(total) + ' m, ' + g.cars.length + ' cars';
  }

  function renderCompare() {
    var a = selA.value, b = selB.value, view = ($('input[name=cmpView]:checked') || {}).value || 'section';
    var ga = GENS.filter(function (g) { return g.id === a; })[0], gb = GENS.filter(function (g) { return g.id === b; })[0];
    cmpSvg.innerHTML = '';
    var cap;
    var narrow = $('.cmp-stage').clientWidth < 560; cmpNarrow = narrow;
    if (view === 'section') {
      var S = 100, r1, r2;
      function lab(cx, cyL, gen, r) {
        var t = svgEl('text', { x: cx, y: cyL, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 15, 'font-weight': 700, 'font-family': 'var(--serif)' }, cmpSvg);
        t.textContent = gen.name;
        var t2 = svgEl('text', { x: cx, y: cyL + 18, 'text-anchor': 'middle', fill: 'var(--dim)', 'font-size': 12 }, cmpSvg);
        t2.textContent = gen.years + ' - closest approach to lining ' + f2(r.gap) + ' m';
      }
      if (narrow) {
        cmpSvg.setAttribute('viewBox', '0 0 380 860');
        r1 = drawSection(cmpSvg, a, 190, 190, S, { dim: true }); lab(190, 392, ga, r1);
        r2 = drawSection(cmpSvg, b, 190, 625, S, { dim: true }); lab(190, 827, gb, r2);
      } else {
        cmpSvg.setAttribute('viewBox', '0 0 760 430');
        r1 = drawSection(cmpSvg, a, 190, 205, S, { dim: true }); r2 = drawSection(cmpSvg, b, 570, 205, S, { dim: true });
        lab(190, 400, ga, r1); lab(570, 400, gb, r2);
        svgEl('text', { x: 380, y: 22, 'text-anchor': 'middle', fill: 'var(--dim)', 'font-size': 12 }, cmpSvg).textContent = 'Both drawn at 100 px per metre inside a 3.35 m bore. Heights of the 1896/1935 cars are estimates.';
      }
      cap = 'End-on view of ' + ga.name + ' (' + f2(GD[a].w) + ' m wide) and ' + gb.name + ' (' + f2(GD[b].w) + ' m wide), each inside the 3.35 m tunnel at the same scale. The red tick marks the closest approach to the lining, calculated from the simplified outline. The 1896 and 1935 car heights are estimates.';
    } else {
      if (narrow) {
        cmpSvg.setAttribute('viewBox', '0 0 440 210');
        drawSide(cmpSvg, a, 6, 10, 20, 11); drawSide(cmpSvg, b, 108, 10, 20, 11);
      } else {
        cmpSvg.setAttribute('viewBox', '0 0 820 330');
        drawSide(cmpSvg, a, 12, 19, 30, 12); drawSide(cmpSvg, b, 172, 19, 30, 12);
      }
      cap = 'Side elevation of ' + ga.name + ' above and ' + gb.name + ' below at the same scale. Car splits, window and door positions are schematic; train lengths of the 1896 and 1935 sets are estimates.';
    }
    $('#cmpDesc').textContent = cap;
    // bars
    var host = $('#cmpBars'); host.innerHTML = '';
    var ia = GENS.indexOf(ga), ib = GENS.indexOf(gb);
    ROWS.forEach(function (r) {
      if (!r.num) return;
      var va = r.num[ia], vb = r.num[ib];
      if (va == null && vb == null) return;
      var mx = Math.max(va || 0, vb || 0);
      var row = h('div', { 'class': 'bar-row' });
      row.appendChild(h('div', { 'class': 'lab' }, r.numLabel));
      var pair = h('div', { 'class': 'bar-pair' });
      [[va, ga, r.c[ia]], [vb, gb, r.c[ib]]].forEach(function (q) {
        var line = h('div', { 'class': 'bar-line' });
        if (q[0] == null) line.innerHTML = '<span class="nkv">n/k</span><span class="vh">' + q[1].name + ' not known</span>';
        else line.innerHTML = '<i style="width:' + Math.max(1, q[0] / mx * 60) + '%;background:' + q[1].color + '"></i><span>' + f2(q[0]) + ' <small class="vh">' + q[1].name + '</small></span><i class="cf ' + q[2] + '" title="confidence ' + q[2] + '" style="width:10px;height:10px;flex:none"></i>';
        pair.appendChild(line);
      });
      row.appendChild(pair); host.appendChild(row);
    });
  }
  [selA, selB].forEach(function (s) { s.addEventListener('change', renderCompare); });
  document.querySelectorAll('input[name=cmpView]').forEach(function (r) { r.addEventListener('change', renderCompare); });
  renderCompare();
  var rzT; window.addEventListener('resize', function () { clearTimeout(rzT); rzT = setTimeout(function () { var n = $('.cmp-stage').clientWidth < 560; if (n !== cmpNarrow) renderCompare(); }, 150); });

  /* ------------------------------------------------------------------ table, glossary, sources */
  (function () {
    var t = $('#genTable'), html = '<thead><tr><th scope="col">&nbsp;</th>';
    GENS.forEach(function (g) { html += '<th scope="col" style="border-top:4px solid ' + g.color + '">' + g.name + '<small>' + g.years + '</small></th>'; });
    html += '</tr></thead><tbody>';
    ROWS.forEach(function (r) {
      html += '<tr><th scope="row">' + r.l + (r.u ? ' <small>(' + r.u + ')</small>' : '') + '</th>';
      r.v.forEach(function (v, i) { html += '<td>' + v + '<i class="cf ' + r.c[i] + '" title="confidence ' + r.c[i] + '"></i></td>'; });
      html += '</tr>';
    });
    t.innerHTML = html + '</tbody>';
    var gl = $('#gloss'); window.GLOSS.forEach(function (q) { gl.appendChild(h('div', null, '<dt>' + q[0] + '</dt><dd>' + q[1] + '</dd>')); });
    var sl = $('#srcList');
    window.SRC.forEach(function (s) {
      sl.appendChild(h('li', { id: 'src-' + s.id }, '<a href="' + s.u + '" rel="noopener">' + s.t + '</a> <i class="cf ' + s.r + '" title="reliability ' + s.r + '"></i><small>' + s.n + '</small>'));
    });
    document.querySelectorAll('dl > dt, .gloss dt').forEach(function () {});
  })();

  /* ------------------------------------------------------------------ rail figure */
  (function () {
    var s = $('#railFig'); if (!s) return;
    function T(x, y, t, o) { var e = svgEl('text', Object.assign({ x: x, y: y, fill: 'var(--dim)', 'font-size': 12 }, o || {}), s); e.textContent = t; return e; }
    function L(x1, y1, x2, y2, col, dash, w) { svgEl('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: col || 'var(--dim)', 'stroke-width': w || 1, 'stroke-dasharray': dash || null }, s); }
    svgEl('circle', { cx: 260, cy: 170, r: 150, fill: 'var(--tunnel-fill)', stroke: 'var(--tunnel)', 'stroke-width': 5 }, s);
    svgEl('rect', { x: 160, y: 264, width: 200, height: 10, fill: 'var(--tunnel)', opacity: .8 }, s);
    [205, 315].forEach(function (x) {
      svgEl('rect', { x: x - 6, y: 250, width: 12, height: 14, fill: 'var(--rail)' }, s);
      svgEl('circle', { cx: x, cy: 226, r: 24, fill: '#2a2d33', stroke: '#888', 'stroke-width': 2 }, s);
    });
    L(205, 226, 315, 226, '#888', null, 4);
    svgEl('rect', { x: 182, y: 192, width: 156, height: 10, rx: 4, fill: '#3a3f47', stroke: '#888' }, s);
    svgEl('rect', { x: 160, y: 66, width: 200, height: 116, rx: 26, fill: 'var(--train)', stroke: 'var(--tunnel)', 'stroke-width': 2 }, s);
    svgEl('rect', { x: 188, y: 98, width: 144, height: 44, rx: 8, fill: 'var(--bg2)', stroke: 'var(--line)' }, s);
    T(260, 117, 'traction', { 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 12 });
    T(260, 133, 'equipment', { 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 12 });
    // live rail + shoe
    svgEl('rect', { x: 366, y: 256, width: 12, height: 10, fill: '#555' }, s);
    svgEl('rect', { x: 362, y: 244, width: 20, height: 12, rx: 2, fill: 'var(--accent)' }, s);
    svgEl('path', { d: 'M338 197 L372 197 L372 238', fill: 'none', stroke: '#999', 'stroke-width': 5 }, s);
    svgEl('rect', { x: 363, y: 234, width: 18, height: 8, rx: 2, fill: '#c4c0b6' }, s);
    // current path: live rail -> shoe -> equipment -> wheels -> rails
    svgEl('path', { d: 'M372 244 L372 197 L350 197 L350 120 L332 120', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3, 'stroke-dasharray': '7 6', 'class': 'flow' }, s);
    svgEl('path', { d: 'M205 142 L205 202 M205 250 L205 266 L315 266 L315 250', fill: 'none', stroke: 'var(--accent2)', 'stroke-width': 3, 'stroke-dasharray': '7 6', 'class': 'flow' }, s);
    // labels (outside the bore)
    T(8, 28, 'Tunnel lining, 3.35 m bore');
    T(8, 46, '(drawn schematically)');
    T(404, 232, 'Collector shoe');
    L(384, 238, 400, 232);
    T(404, 262, 'Live rail +600 V', { fill: 'var(--accent)', 'font-weight': 700 });
    T(404, 278, 'on insulators');
    L(384, 252, 400, 258, 'var(--accent)');
    T(8, 250, 'Running rails', { fill: 'var(--accent2)', 'font-weight': 700 });
    T(8, 266, '4 ft gauge, return (-)', { fill: 'var(--accent2)' });
    L(100, 256, 196, 258, 'var(--accent2)');
    T(8, 150, 'Wheelsets, 540 mm', {});
    T(8, 166, 'driven through 10.06:1 gears', {});
    L(60, 174, 184, 224);
    var st = svgEl('style', null, s); st.textContent = '.flow{animation:dash 1.2s linear infinite}@keyframes dash{to{stroke-dashoffset:-26}}';
  })();

  /* ------------------------------------------------------------------ power-flow diagram */
  (function () {
    var s = $('#flowFig'); if (!s) return;
    function box(x, y, w, hh, title, sub, o) {
      o = o || {};
      svgEl('rect', { x: x, y: y, width: w, height: hh, rx: 10, fill: o.fill || 'var(--panel)', stroke: o.stroke || 'var(--line)', 'stroke-width': o.sw || 1.5, 'stroke-dasharray': o.dash || null }, s);
      var t = svgEl('text', { x: x + w / 2, y: y + 22, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 13, 'font-weight': 700 }, s); t.textContent = title;
      (sub || []).forEach(function (l, i) { var u = svgEl('text', { x: x + w / 2, y: y + 40 + i * 15, 'text-anchor': 'middle', fill: 'var(--dim)', 'font-size': 11.5 }, s); u.textContent = l; });
    }
    function arrow(d, o) {
      o = o || {};
      svgEl('path', { d: d, fill: 'none', stroke: o.col || 'var(--accent)', 'stroke-width': o.w || 2.6, 'stroke-dasharray': o.dash || null, 'marker-end': 'url(#ah' + (o.m || '') + ')' }, s);
    }
    function txt(x, y, t, col, anchor, size) { var e = svgEl('text', { x: x, y: y, 'text-anchor': anchor || 'start', fill: col || 'var(--dim)', 'font-size': size || 12 }, s); e.textContent = t; }
    var defs = svgEl('defs', null, s);
    [['', 'var(--accent)'], ['b', 'var(--accent2)'], ['g', 'var(--ok)']].forEach(function (q) {
      var m = svgEl('marker', { id: 'ah' + q[0], viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      svgEl('path', { d: 'M0 0 L10 5 L0 10 z', fill: q[1] }, m);
    });
    txt(14, 30, 'Dashed border: inferred from a secondary source', 'var(--dim)');
    txt(14, 48, 'Orange: motoring current. Blue: return. Green: regeneration.', 'var(--dim)');
    box(14, 150, 120, 78, 'Utility grid', ['connection point and', 'operator not stated']);
    box(168, 150, 130, 78, 'HV supply', ['11 kV or 6.6 kV', '(tender notice) - L'], { dash: '5 4' });
    box(334, 72, 250, 262, 'Traction substation x 5', [], { stroke: 'var(--accent)', sw: 2 });
    [['HV switchgear', 'protection'], ['Transformer', 'step down'], ['Rectifier', 'AC to 600 V DC'], ['DC breakers', 'section feeders']].forEach(function (q, i) {
      box(350, 100 + i * 50, 218, 42, q[0] + '  -  ' + q[1], [], { fill: 'var(--bg2)' });
    });
    txt(459, 322, 'MW ratings not published', 'var(--dim)', 'middle', 11);
    box(618, 100, 118, 56, 'Third rail', ['+600 V DC']);
    box(618, 218, 118, 56, 'Running rails', ['return (-)']);
    box(770, 40, 216, 280, 'Stadler train', [], { stroke: 'var(--accent2)', sw: 2 });
    [['Shoe + line contactor', 'filter, surge protection'], ['IGBT inverters (ABB)', 'water-cooled, redundant'], ['8 AC motors, 68 kW', 'two-stage gearbox 10.06:1'], ['Auxiliary supply', 'HVAC, lights, doors (est. 25 kW)']].forEach(function (q, i) {
      box(782, 72 + i * 60, 192, 52, q[0], [q[1]], { fill: 'var(--bg2)' });
    });
    arrow('M134 189 L166 189');
    arrow('M298 189 L332 189');
    arrow('M584 128 L616 128');
    arrow('M736 120 L780 96');
    arrow('M770 246 L738 246', { col: 'var(--accent2)', m: 'b' });
    arrow('M616 246 L586 246', { col: 'var(--accent2)', m: 'b' });
    txt(677, 292, 'negative feeder', 'var(--accent2)', 'middle', 11.5);
    txt(677, 306, 'cables', 'var(--accent2)', 'middle', 11.5);
    box(618, 360, 118, 56, 'Other trains', ['accelerating nearby'], { stroke: 'var(--ok)' });
    box(770, 360, 216, 56, 'Brake resistor / friction brake', ['surplus, if nobody can absorb'], { stroke: 'var(--ok)', dash: '5 4' });
    arrow('M830 320 L830 340 L677 340 L677 358', { col: 'var(--ok)', dash: '6 5', m: 'g' });
    arrow('M926 320 L926 358', { col: 'var(--ok)', dash: '6 5', m: 'g' });
    txt(14, 372, 'Regeneration: while braking the motors generate and push current', 'var(--ok)');
    txt(14, 390, 'back into the third rail. Only a train accelerating nearby can use it;', 'var(--dim)');
    txt(14, 408, 'a diode rectifier substation cannot send it back to the grid.', 'var(--dim)');
  })();

  /* ------------------------------------------------------------------ substation loop map */
  var subS = {};
  (function () {
    var svg = $('#loopSvg'); if (!svg) return;
    var W = 760, H = 590, pad = 34, minX = -2700, maxX = 1160, minZ = -1760, maxZ = 1230;
    var sc = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxZ - minZ));
    var offX = (W - (maxX - minX) * sc) / 2, offY = (H - (maxZ - minZ) * sc) / 2;
    function px(x) { return offX + (x - minX) * sc; }
    function pz(z) { return offY + (z - minZ) * sc; }
    var L = GEO.len, st = {};
    GEO.stations.forEach(function (s) { st[s.id] = s; });
    subS = { bridge: st['bridge-street'].sOuter, cornwall: st['kinning-park'].sOuter, broomloan: GEO.depot.sOuter, byres: st['hillhead'].sOuter, dundasvale: st['cowcaddens'].sOuter };
    var down = {};
    function distTo(s) {
      var best = 1e9;
      window.SUBS.forEach(function (b) { if (down[b.id]) return; var d = Math.abs(s - subS[b.id]); d = Math.min(d, L - d); if (d < best) best = d; });
      return best;
    }
    var inner = svgEl('polyline', { points: GEO.inner.map(function (p) { return px(p[0]).toFixed(1) + ',' + pz(p[1]).toFixed(1); }).join(' '), fill: 'none', stroke: 'var(--tunnel)', 'stroke-width': 2, 'stroke-dasharray': '5 4', opacity: .7 }, svg);
    var segG = svgEl('g', null, svg), segs = [];
    var n = GEO.outer.length;
    for (var i = 0; i < n; i++) {
      var a = GEO.outer[i], b = GEO.outer[(i + 1) % n];
      var l = svgEl('line', { x1: px(a[0]), y1: pz(a[1]), x2: px(b[0]), y2: pz(b[1]), 'stroke-width': 4.5, 'stroke-linecap': 'round' }, segG);
      segs.push([l, i * 20 + 10]);
    }
    // river labels
    GEO.rivers.forEach(function (r) {
      svgEl('circle', { cx: px(r.x), cy: pz(r.z), r: 7, fill: 'none', stroke: 'var(--accent2)', 'stroke-width': 1.5 }, svg);
    });
    var lab = {
      'buchanan-street': [-10, 4, 'end'], 'st-enoch': [10, 4, 'start'], 'bridge-street': [10, 4, 'start'], 'west-street': [0, 18, 'middle'], 'shields-road': [0, 18, 'middle'],
      'kinning-park': [0, 18, 'middle'], 'cessnock': [-4, 20, 'middle'], 'ibrox': [-10, 4, 'end'], 'govan': [-10, 4, 'end'], 'partick': [-10, 4, 'end'],
      'kelvinhall': [0, -12, 'middle'], 'hillhead': [0, -12, 'middle'], 'kelvinbridge': [0, -12, 'middle'], 'st-georges-cross': [0, -12, 'middle'], 'cowcaddens': [8, -8, 'start']
    };
    GEO.stations.forEach(function (s) {
      svgEl('circle', { cx: px(s.x), cy: pz(s.z), r: 4, fill: 'var(--bg)', stroke: 'var(--ink)', 'stroke-width': 1.8 }, svg);
      var o = lab[s.id] || [8, 4, 'start'];
      var t = svgEl('text', { x: px(s.x) + o[0], y: pz(s.z) + o[1], 'text-anchor': o[2], fill: 'var(--ink)', 'font-size': 14 }, svg); t.textContent = s.name;
    });
    // centre label
    var cc = svgEl('text', { x: px(-800), y: pz(-50), 'text-anchor': 'middle', fill: 'var(--dim)', 'font-size': 12 }, svg);
    cc.textContent = 'Outer circle (coloured), inner circle (dashed). North is up.';
    var cx0 = (minX + maxX) / 2 + 0, cz0 = (minZ + maxZ) / 2;
    var subG = {};
    window.SUBS.forEach(function (b) {
      var x, z;
      if (b.near === 'depot') { x = GEO.depot.x; z = GEO.depot.z; }
      else { var s = st[b.near]; var dx = -s.x + (-700), dz = -s.z + (-100); var m = Math.hypot(dx, dz); x = s.x + dx / m * 150; z = s.z + dz / m * 150; }
      var g = svgEl('g', { transform: 'translate(' + px(x) + ',' + pz(z) + ')', 'data-id': b.id }, svg);
      svgEl('rect', { x: -8, y: -8, width: 16, height: 16, rx: 3, fill: 'var(--accent)', stroke: 'var(--bg)', 'stroke-width': 2 }, g);
      svgEl('path', { d: 'M1.5 -6 L-3.5 1 L-0.3 1 L-1.5 6 L3.5 -1 L0.3 -1 Z', fill: 'var(--accent-ink,#1a1209)' }, g);
      subG[b.id] = g;
    });
    var btns = $('#subBtns');
    function scol(d) { var t = Math.min(1, d / 4200); var hue = 140 - 140 * t; return 'hsl(' + hue + ',70%,52%)'; }
    function update() {
      segs.forEach(function (q) { q[0].setAttribute('stroke', scol(distTo(q[1]))); });
      window.SUBS.forEach(function (b) {
        subG[b.id].querySelector('rect').setAttribute('fill', down[b.id] ? 'var(--bad)' : 'var(--accent)');
        var bt = btns.querySelector('[data-id=' + b.id + ']'); bt.setAttribute('aria-pressed', down[b.id] ? 'true' : 'false');
      });
      var live = window.SUBS.filter(function (b) { return !down[b.id]; }).sort(function (a, b) { return subS[a.id] - subS[b.id]; });
      var best = { gap: 0 };
      live.forEach(function (b, i) {
        var nx = live[(i + 1) % live.length], gap = subS[nx.id] - subS[b.id]; if (gap <= 0) gap += L;
        if (live.length === 1) gap = L;
        if (gap > best.gap) best = { gap: gap, a: b, b: nx };
      });
      var downNames = window.SUBS.filter(function (b) { return down[b.id]; }).map(function (b) { return b.name; });
      var I = 1e6 / 600, r = 0.035, dv = I * r * (best.gap / 1000) / 4;
      $('#subOut').innerHTML = (downNames.length ? 'Out of service: <b>' + downNames.join(', ') + '</b>.<br>' : 'All five substations in service.<br>') +
        'Longest stretch between live substations: <b>' + f1(best.gap / 1000) + ' km</b> (' + best.a.name + ' to ' + best.b.name + ').<br>' +
        'Illustrative mid-gap drop for a 1 MW train: <b>' + f0(dv) + ' V</b> (' + f1(dv / 6) + '% of 600 V).' +
        (downNames.length > 2 ? '<br><em>Three or more out: the circle is badly starved.</em>' : '') +
        '<br><small>Substation spacing and the gap figure rely on estimated positions.</small>';
    }
    window.SUBS.forEach(function (b) {
      var bt = h('button', { 'class': 'subBtn', type: 'button', 'data-id': b.id, 'aria-pressed': 'false' }, '<span>' + b.name + '<br><small>' + b.note + ' <i class="cf ' + b.conf + '"></i></small></span><span aria-hidden="true">&#9889;</span>');
      bt.addEventListener('click', function () { down[b.id] = !down[b.id]; update(); });
      btns.appendChild(bt);
      subG[b.id].style.cursor = 'pointer';
      subG[b.id].addEventListener('click', function () { down[b.id] = !down[b.id]; update(); });
    });
    var rb = h('button', { 'class': 'small', type: 'button' }, 'Restore all');
    rb.addEventListener('click', function () { down = {}; update(); });
    btns.appendChild(rb);
    update();
  })();

  /* ------------------------------------------------------------------ charts */
  var tip = $('#tip');
  function nearestIdx(xs, x) {
    var lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    return lo;
  }
  function valueAt(xs, ys, x) {
    var i = nearestIdx(xs, x), x0 = xs[i], x1 = xs[Math.min(i + 1, xs.length - 1)];
    if (x1 === x0) return ys[i];
    var t = Math.max(0, Math.min(1, (x - x0) / (x1 - x0)));
    return ys[i] + (ys[Math.min(i + 1, ys.length - 1)] - ys[i]) * t;
  }
  function niceTicks(a, b, n) {
    var span = b - a, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
    if (err >= 5) step *= 5; else if (err >= 2) step *= 2;
    var out = [], v = Math.ceil(a / step) * step;
    for (; v <= b + 1e-9; v += step) out.push(Math.round(v / step) * step);
    return out;
  }

  function Chart(host, label) {
    this.host = host; this.cfg = null; this.cur = null; this.label = label;
    host.setAttribute('tabindex', '0'); host.setAttribute('role', 'group');
    host.setAttribute('aria-label', label + '. Interactive chart: use left and right arrow keys, Home and End to read values; hold Shift for larger steps.');
    this.svg = svgEl('svg', { 'aria-hidden': 'true' }); host.appendChild(this.svg);
    this.readout = h('div', { 'class': 'readout', 'aria-hidden': 'true' }); host.appendChild(this.readout);
    this.live = h('div', { 'class': 'vh', 'aria-live': 'polite' }); host.appendChild(this.live);
    var self = this;
    host.addEventListener('pointermove', function (e) { self.pointer(e); });
    host.addEventListener('pointerleave', function () { tip.hidden = true; });
    host.addEventListener('keydown', function (e) { self.key(e); });
    if (window.ResizeObserver) new ResizeObserver(function () { if (self.cfg && Math.abs(self.w - (host.clientWidth - 8)) > 2) self.render(); }).observe(host);
  }
  Chart.prototype.set = function (cfg) {
    var keep = this.cur != null && this.cfg && this.cfg.x[0] === cfg.x[0] && this.cfg.x[1] === cfg.x[1];
    this.cfg = cfg; if (!keep) this.cur = null; this.render();
  };
  Chart.prototype.render = function () {
    var c = this.cfg, svg = this.svg, w = Math.max(280, this.host.clientWidth - 8); this.w = w;
    var L = 48, R = 14, T = 8, gap = 18, B = 34, narrow = w < 520;
    var totalH = c.panels.reduce(function (a, p) { return a + p.h; }, 0) + gap * (c.panels.length - 1) + T + B;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + totalH); svg.setAttribute('width', w); svg.setAttribute('height', totalH);
    svg.innerHTML = '';
    var self = this, y0 = T; this.layout = [];
    var xa = c.x[0], xb = c.x[1];
    function X(v) { return L + (v - xa) / (xb - xa) * (w - L - R); }
    this.X = X; this.L = L; this.R = R; this.T = T; this.totalH = totalH;
    c.panels.forEach(function (p, pi) {
      var ya = p.y[0], yb = p.y[1];
      function Y(v) { return y0 + p.h - (v - ya) / (yb - ya) * p.h; }
      self.layout.push({ y0: y0, Y: Y, p: p });
      var g = svgEl('g', { 'class': 'ax' }, svg);
      niceTicks(ya, yb, Math.max(2, Math.round(p.h / 38))).forEach(function (t) {
        svgEl('line', { x1: L, x2: w - R, y1: Y(t), y2: Y(t), 'class': 'gridline', 'stroke-width': t === 0 ? 1.6 : 1 }, g);
        svgEl('text', { x: L - 6, y: Y(t) + 4, 'text-anchor': 'end' }, g).textContent = p.yFmt ? p.yFmt(t) : t;
      });
      svgEl('text', { x: 4, y: y0 + 11, 'font-size': 11, 'font-weight': 700, fill: 'var(--ink)', style: 'fill:var(--ink)' }, g).textContent = '';
      var tl = svgEl('text', { x: L + 6, y: y0 + 13, style: 'fill:var(--ink);font-weight:700;paint-order:stroke;stroke:var(--panel);stroke-width:4px;stroke-linejoin:round' }, g); tl.textContent = p.title;
      (p.bands || []).forEach(function (b) {
        svgEl('rect', { x: X(b.x0), y: y0, width: Math.max(1, X(b.x1) - X(b.x0)), height: p.h, fill: 'var(--accent2)', opacity: .16 }, svg);
        if (pi === 0 && b.label && !narrow) { var t = svgEl('text', { x: X((b.x0 + b.x1) / 2), y: y0 + p.h - 4, 'text-anchor': 'middle', 'font-size': 10, style: 'fill:var(--accent2)' }, svg); t.textContent = b.label; }
      });
      (c.marks || []).forEach(function (m) {
        svgEl('line', { x1: X(m.x), x2: X(m.x), y1: y0, y2: y0 + p.h, stroke: 'var(--grid)', 'stroke-dasharray': '2 3' }, svg);
        if (pi === 0 && !narrow) { var t = svgEl('text', { x: X(m.x), y: y0 - 0, 'text-anchor': 'middle', 'font-size': 9, style: 'fill:var(--dim)' }, svg); t.textContent = m.lab; }
      });
      p.series.forEach(function (s) {
        var d = '', n = s.xs.length, step = Math.max(1, Math.floor(n / (w * 1.2)));
        for (var i = 0; i < n; i += step) {
          var xv = s.xs[i], yv = s.ys[i];
          d += (i === 0 ? 'M' : (s.step ? 'H' + X(xv).toFixed(1) + 'V' : 'L')) + (s.step ? '' : X(xv).toFixed(1) + ' ') + (s.step ? Y(yv).toFixed(1) : Y(yv).toFixed(1));
          if (i === 0 && s.step) d = 'M' + X(xv).toFixed(1) + ' ' + Y(yv).toFixed(1);
        }
        if (s.fill !== undefined) {
          var base = Y(Math.max(ya, Math.min(yb, s.fill)));
          svgEl('path', { d: d + 'L' + X(s.xs[n - 1]).toFixed(1) + ' ' + base + 'L' + X(s.xs[0]).toFixed(1) + ' ' + base + 'Z', style: 'fill:' + s.col, opacity: .18 }, svg);
        }
        svgEl('path', { d: d, fill: 'none', style: 'stroke:' + s.col, 'stroke-width': s.w || 2, 'stroke-dasharray': s.dash || null, 'stroke-linejoin': 'round' }, svg);
      });
      y0 += p.h + gap;
    });
    // x axis
    var ax = svgEl('g', { 'class': 'ax' }, svg), by = totalH - B + 4;
    niceTicks(xa, xb, Math.max(3, Math.round((w - L - R) / 80))).forEach(function (t) {
      svgEl('line', { x1: X(t), x2: X(t), y1: by - 4, y2: by, stroke: 'var(--dim)' }, ax);
      svgEl('text', { x: X(t), y: by + 12, 'text-anchor': 'middle' }, ax).textContent = c.xFmt ? c.xFmt(t) : t;
    });
    svgEl('text', { x: (L + w - R) / 2, y: totalH - 3, 'text-anchor': 'middle', style: 'fill:var(--dim);font-size:11.5px' }, svg).textContent = c.xLabel;
    this.cursor = svgEl('g', { visibility: 'hidden' }, svg);
    svgEl('line', { x1: 0, x2: 0, y1: T, y2: totalH - B, stroke: 'var(--ink)', 'stroke-width': 1.2, opacity: .8 }, this.cursor);
    this.dots = this.layout.map(function (l) { return l.p.series.map(function (s) { return svgEl('circle', { r: 4, style: 'fill:' + s.col, stroke: 'var(--bg)', 'stroke-width': 1.5 }, self.cursor); }); });
    if (this.cur != null) this.moveTo(this.cur, false); else this.readout.innerHTML = '<span style="color:var(--dim)">Hover, touch or use the arrow keys to read values.</span>';
  };
  Chart.prototype.pointer = function (e) {
    var r = this.svg.getBoundingClientRect(), px = e.clientX - r.left, c = this.cfg;
    var x = c.x[0] + (px - this.L) / (this.w - this.L - this.R) * (c.x[1] - c.x[0]);
    if (px < this.L - 4 || px > this.w - this.R + 4) { tip.hidden = true; return; }
    this.moveTo(Math.max(c.x[0], Math.min(c.x[1], x)), true, e);
  };
  Chart.prototype.key = function (e) {
    var c = this.cfg, span = c.x[1] - c.x[0], k = e.key, cur = this.cur == null ? c.x[0] : this.cur, step = span / (e.shiftKey ? 20 : 150);
    if (k === 'ArrowRight') cur += step; else if (k === 'ArrowLeft') cur -= step; else if (k === 'Home') cur = c.x[0]; else if (k === 'End') cur = c.x[1]; else return;
    e.preventDefault(); cur = Math.max(c.x[0], Math.min(c.x[1], cur));
    this.moveTo(cur, false); this.live.textContent = this.readout.textContent;
  };
  Chart.prototype.moveTo = function (x, showTip, ev) {
    var c = this.cfg, self = this; this.cur = x;
    var px = this.X(x); this.cursor.setAttribute('visibility', 'visible');
    this.cursor.firstChild.setAttribute('x1', px); this.cursor.firstChild.setAttribute('x2', px);
    var lines = [], html = '';
    this.layout.forEach(function (l, pi) {
      l.p.series.forEach(function (s, si) {
        var v = valueAt(s.xs, s.ys, x), d = self.dots[pi][si];
        d.setAttribute('cx', px); d.setAttribute('cy', l.Y(Math.max(l.p.y[0], Math.min(l.p.y[1], v))));
        if (s.noRead) { d.setAttribute('visibility', 'hidden'); return; } d.removeAttribute('visibility');
        var txt = (l.p.fmt ? l.p.fmt(v) : f1(v)) + ' ' + (l.p.unit || '');
        html += '<span><i style="background:' + s.col + '"></i>' + s.n + ' <b>' + txt + '</b></span>'; lines.push(s.n + ' ' + txt);
      });
    });
    var head = c.xRead ? c.xRead(x) : (c.xFmt ? c.xFmt(x) : f1(x)) + ' ' + (c.xUnit || '');
    html = '<span><b>' + head + '</b></span>' + html;
    this.readout.innerHTML = html;
    if (showTip && ev) {
      tip.hidden = false; tip.innerHTML = '<b>' + head + '</b><br>' + lines.join('<br>');
      var tx = ev.clientX + 14, ty = ev.clientY + 14, tw = tip.offsetWidth;
      if (tx + tw > window.innerWidth - 6) tx = ev.clientX - tw - 14;
      tip.style.left = Math.max(4, tx) + 'px'; tip.style.top = Math.max(4, ty) + 'px';
    } else tip.hidden = true;
  };

  /* ------------------------------------------------------------------ simulation UI */
  var D = SIM.DEFAULTS;
  var params = { tare: D.tare, pax: D.pax, recv: D.recv, aux: D.aux, decel: D.decel };
  var ctlDefs = [
    { k: 'pax', l: 'Passengers on board', min: 0, max: 310, step: 5, fmt: function (v) { return f0(v) + ' (' + f0(v / 310 * 100) + '% of 310)'; }, note: 'Datasheet capacity about 310 at 6 persons per m2.' },
    { k: 'recv', l: 'Regeneration receptivity', min: 0, max: 1, step: .05, fmt: function (v) { return f0(v * 100) + '%'; }, note: 'Share of braking energy another train can absorb. ASSUMPTION.' },
    { k: 'aux', l: 'Auxiliary load', min: 0, max: 60, step: 1, fmt: function (v) { return f0(v) + ' kW'; }, note: 'HVAC, lighting, compressor, control. ESTIMATE.' },
    { k: 'decel', l: 'Service braking', min: 0.6, max: 1.3, step: .05, fmt: function (v) { return f2(v) + ' m/s2'; }, note: 'Not published. ESTIMATE.' },
    { k: 'tare', l: 'Empty mass', min: 55, max: 80, step: 1, fmt: function (v) { return f0(v) + ' t'; }, note: 'Derived from the 7.5 t axle load; see checks. LOW.' }
  ];
  var outs = {};
  (function () {
    var host = $('#simCtl');
    ctlDefs.forEach(function (c) {
      var lab = h('label', null, '<span>' + c.l + '<output></output></span><input type="range" min="' + c.min + '" max="' + c.max + '" step="' + c.step + '" value="' + params[c.k] + '"><small>' + c.note + '</small>');
      var inp = lab.querySelector('input'), out = lab.querySelector('output');
      out.textContent = c.fmt(params[c.k]); outs[c.k] = [inp, out, c];
      inp.addEventListener('input', function () { params[c.k] = parseFloat(inp.value); out.textContent = c.fmt(params[c.k]); schedule(); });
      host.appendChild(lab);
    });
    var rst = h('button', { 'class': 'small reset', type: 'button' }, 'Reset to defaults');
    rst.addEventListener('click', function () {
      params = { tare: D.tare, pax: D.pax, recv: D.recv, aux: D.aux, decel: D.decel };
      for (var k in outs) { outs[k][0].value = params[k]; outs[k][1].textContent = outs[k][2].fmt(params[k]); }
      schedule();
    });
    host.appendChild(rst);
  })();

  var chLoop = new Chart($('#chLoop'), 'Long section, modelled speed and power for one lap of the outer circle');
  var chTE = new Chart($('#chTE'), 'Tractive effort and acceleration against speed');
  var chStop = new Chart($('#chStop'), 'Speed-time diagram for one interstation run');
  var net = { trains: 10, hours: 17.2, days: 363, price: 20 };
  var result = null, scheduled = false;

  var stopSel = $('#stopSel');
  GEO.stations.forEach(function (s, i) {
    var o = h('option', { value: i }); o.textContent = s.name + ' to ' + GEO.stations[(i + 1) % GEO.stations.length].name; stopSel.appendChild(o);
  });
  stopSel.value = '1';
  stopSel.addEventListener('change', function () { drawStop(); });

  function schedule() { if (scheduled) return; scheduled = true; requestAnimationFrame(function () { scheduled = false; recompute(); }); }

  function recompute() {
    result = SIM.lap(GEO, params);
    var r = result;
    // KPIs
    var peak = Math.max.apply(null, r.trace.P), vmax = Math.max.apply(null, r.trace.v);
    var kp = $('#kpis');
    var pkm = r.netKWh / r.km, wtkm = r.netKWh * 1000 / (r.mass * r.km);
    var pax = Math.max(params.pax, 1);
    kp.innerHTML = [
      [f1(r.lapTime / 60) + ' min', 'Modelled lap time (published: about 24 min)'],
      [f1(r.netKWh) + ' kWh', 'Net energy per lap from the rail'],
      [f2(pkm) + ' kWh/km', 'Per train-km (' + f2(pkm / 4) + ' per car-km)'],
      [f0(wtkm) + ' Wh/t-km', 'At ' + f0(r.mass) + ' t'],
      [f1(r.netKWh / (pax * r.km) * 1000) + ' Wh', 'Per passenger-km at this load'],
      [f0(peak) + ' kW', 'Peak electrical draw']
    ].map(function (q) { return '<div class="kpi"><b>' + q[0] + '</b><span>' + q[1] + '</span></div>'; }).join('');
    // stack and network
    var gross = r.tractionKWh + r.auxKWh, recov = r.regenUsedKWh, lost = r.regenOfferedKWh - r.regenUsedKWh;
    var nb = $('#netbox');
    var keep = nb.querySelector('input') ? { t: net.trains, h: net.hours, d: net.days, p: net.price } : null;
    nb.innerHTML =
      '<div class="netcard"><h4>Where one lap&rsquo;s energy goes</h4><div class="stack" role="img" aria-label="Traction ' + f1(r.tractionKWh) + ' kWh, auxiliaries ' + f1(r.auxKWh) + ' kWh, regenerated and reused ' + f1(recov) + ' kWh">' +
      '<i style="width:' + (r.tractionKWh / gross * 100) + '%;background:var(--accent)"></i><i style="width:' + (r.auxKWh / gross * 100) + '%;background:var(--accent2)"></i></div>' +
      '<div class="keys"><span><b style="background:var(--accent)"></b>Traction draw ' + f1(r.tractionKWh) + ' kWh</span><span><b style="background:var(--accent2)"></b>Auxiliaries ' + f1(r.auxKWh) + ' kWh</span></div>' +
      '<p style="margin-top:10px">Braking offers back <b>' + f1(r.regenOfferedKWh) + ' kWh</b>; at this receptivity <b>' + f1(recov) + ' kWh</b> is reused and <b>' + f1(lost) + ' kWh</b> is burned in resistors or friction brakes. Net: <b>' + f1(r.netKWh) + ' kWh</b>. Nearly all of it ends as heat in the tunnel and stations.</p>' +
      '<p class="hint">Model, low confidence. Light-rail style figures of 1-2 kWh per car-km are normal for a metro; this lands close to the low end because of the short, light cars.</p></div>' +
      '<div class="netcard" id="netcard"><h4>Whole network (traction only, estimate)</h4>' +
      '<label>Average trains in service <input type="number" id="nT" min="1" max="17" step="1" value="' + net.trains + '"></label>' +
      '<label>Service hours per day <input type="number" id="nH" min="1" max="24" step="0.1" value="' + net.hours + '"></label>' +
      '<label>Operating days per year <input type="number" id="nD" min="200" max="365" step="1" value="' + net.days + '"></label>' +
      '<label>Illustrative tariff (p/kWh) <input type="number" id="nP" min="5" max="60" step="1" value="' + net.price + '"></label>' +
      '<div id="netOut"></div></div>';
    ['nT:trains', 'nH:hours', 'nD:days', 'nP:price'].forEach(function (q) {
      var a = q.split(':'); $('#' + a[0]).addEventListener('input', function (e) { net[a[1]] = parseFloat(e.target.value) || 0; netCalc(); });
    });
    netCalc();
    drawLoop(); drawTE(); drawStop();
  }
  function netCalc() {
    var r = result; if (!r) return;
    var lapsDay = net.trains * net.hours * 3600 / r.lapTime, kwhYear = lapsDay * net.days * r.netKWh, gwh = kwhYear / 1e6;
    var cost = kwhYear * net.price / 100 / 1e6, heat = net.trains * r.netKWh / (r.lapTime / 3600) / 1000;
    $('#netOut').innerHTML = '<p style="margin:10px 0 0">About <b class="big">' + f1(gwh) + ' GWh</b> a year,<br>roughly <b>GBP ' + f2(cost) + ' m</b> at the tariff above.</p>' +
      '<p class="hint">' + f0(lapsDay) + ' train-laps a day. Average heat released by traction in the tunnels while running: about ' + f2(heat) + ' MW (' + f0(heat * 1000 / 21) + ' kW per km of tube). Stations, escalators, pumps, ventilation and the depot are not included. No operator figure was found to check this against.</p>';
  }

  function drawLoop() {
    var r = result, tr = r.trace, xs = tr.s.map(function (s) { return s / 1000; });
    var bands = GEO.rivers.map(function (q) { return { x0: q.s0 / 1000, x1: q.s1 / 1000, label: q.id === 'kelvin' ? 'Kelvin' : 'Clyde' }; });
    var marks = GEO.stations.map(function (s, i) { return { x: s.sOuterC / 1000, lab: String(i + 1) }; });
    var px = [], py = [], i, st = GEO.profStep;
    for (i = 0; i < GEO.prof.length; i++) { px.push(i * st / 1000); py.push(GEO.prof[i]); }
    chLoop.set({
      x: [0, GEO.len / 1000 + 0.02], xFmt: function (v) { return f1(v); }, xLabel: 'Distance along the outer circle (km); 1-15 = stations',
      xRead: function (x) {
        var best = null, bd = 1e9; GEO.stations.forEach(function (s, i) { var d = Math.abs(s.sOuterC / 1000 - x); if (d < bd) { bd = d; best = (i + 1) + ' ' + s.name; } });
        return f2(x) + ' km' + (bd < 0.15 ? ' - ' + best : '');
      },
      marks: marks,
      panels: [
        { title: 'Rail level (m above OD, modelled)', h: 110, y: [-10, 22], unit: 'm', fmt: function (v) { return f1(v); }, bands: bands,
          series: [{ n: 'rail', col: 'var(--accent2)', xs: px, ys: py, fill: -10 }] },
        { title: 'Speed (km/h)', h: 110, y: [0, 62], unit: 'km/h', fmt: f0,
          series: [{ n: 'limit', col: 'var(--dim)', xs: xs, ys: tr.lim, dash: '4 3', w: 1.3, step: false }, { n: 'speed', col: 'var(--accent)', xs: xs, ys: tr.v, fill: 0, w: 2 }] },
        { title: 'Power at the shoe (kW; negative = regenerating)', h: 120, y: [-1400, 1100], unit: 'kW', fmt: f0, yFmt: function (v) { return f0(v); },
          series: [{ n: 'power', col: 'var(--ok)', xs: xs, ys: tr.P, fill: 0, w: 1.6 }] }
      ]
    });
  }

  function drawTE() {
    var p = Object.assign({}, D, params), m = SIM.mass(p), me = m * p.rot;
    var vs = [], te = [], r0 = [], r5 = [], a0 = [], a5 = [], i;
    for (i = 0; i <= 62; i += 0.5) {
      var v = i / 3.6, F = SIM.teCurve(p, Math.max(v, 0.1)), R = SIM.resist(p, v);
      vs.push(i); te.push(F / 1000); r0.push(R / 1000); r5.push((R + m * 9.81 * 0.05) / 1000);
      a0.push(Math.min(p.aCap, (F - R) / me)); a5.push(Math.max(-1, Math.min(p.aCap, (F - R - m * 9.81 * 0.05) / me)));
    }
    chTE.set({
      x: [0, 62], xFmt: f0, xLabel: 'Speed (km/h)', xUnit: 'km/h', marks: [{ x: 23, lab: 'base 23' }, { x: 58, lab: 'max 58' }],
      panels: [
        { title: 'Force (kN)', h: 130, y: [0, 140], unit: 'kN', fmt: f1,
          series: [{ n: 'tractive effort', col: 'var(--accent)', xs: vs, ys: te, w: 2.6 }, { n: 'resistance, level', col: 'var(--dim)', xs: vs, ys: r0, w: 1.6 }, { n: 'resistance + 5% grade', col: 'var(--bad)', xs: vs, ys: r5, dash: '5 4', w: 1.8 }] },
        { title: 'Acceleration (m/s2), capped at 1.3', h: 110, y: [-0.2, 1.4], unit: 'm/s2', fmt: f2,
          series: [{ n: 'level track', col: 'var(--accent2)', xs: vs, ys: a0, w: 2.2 }, { n: 'climbing 5%', col: 'var(--warn)', xs: vs, ys: a5, w: 2.2 }] }
      ]
    });
  }

  function drawStop() {
    var r = result, i = parseInt(stopSel.value, 10), run = r.runs[i];
    var ts = run.t, p = Object.assign({}, D, params);
    var maxV = Math.max.apply(null, run.v), len = run.s[run.n] - run.s[0];
    var E = (run.Eplus + run.Eneg * p.recv) / 3.6e6;
    chStop.set({
      x: [0, run.time], xFmt: f0, xLabel: 'Time since leaving the platform (s)', xUnit: 's',
      panels: [
        { title: 'Speed (km/h)', h: 120, y: [0, 62], unit: 'km/h', fmt: f1,
          series: [{ n: 'limit', col: 'var(--dim)', xs: ts, ys: run.lim, dash: '4 3', w: 1.3 }, { n: 'speed', col: 'var(--accent)', xs: ts, ys: run.v, fill: 0, w: 2.4 }] },
        { title: 'Power at the shoe (kW)', h: 100, y: [-1300, 1100], unit: 'kW', fmt: f0,
          series: [{ n: 'power', col: 'var(--ok)', xs: ts, ys: run.P, fill: 0, w: 1.8 }] },
        { title: 'Gradient (%)', h: 70, y: [-6, 6], unit: '%', fmt: f1,
          series: [{ n: 'gradient', col: 'var(--accent2)', xs: ts, ys: run.grade, fill: 0, w: 1.6 }] }
      ]
    });
    $('#stopCap').textContent = 'Modelled: ' + f0(len) + ' m in ' + f0(run.time) + ' s (average ' + f1(len / run.time * 3.6) + ' km/h, top ' + f0(maxV) + ' km/h), net ' + f2(E) + ' kWh from the rail at this receptivity. Add the 25 s dwell for the timetable. The dotted line is the assumed speed limit; it drops to 35 and 25 km/h near platforms, which is why the train brakes early.';
  }

  recompute();

  /* ------------------------------------------------------------------ timeline */
  (function () {
    var tl = $('#tl'), sc = $('#tlScroll'), det = $('#tlDetail'), X0 = 40, PX = 15.5, AX = 200;
    function X(y) { return X0 + (y - 1890) * PX; }
    [[1896, 1935, 'var(--c-cable)', 'Cable'], [1935, 1977, 'var(--c-electric)', '1935 electric'], [1980, 2024, 'var(--c-mc)', 'Metro-Cammell'], [2023, 2030, 'var(--c-stadler)', 'Stadler']].forEach(function (b, i) {
      var d = h('div', { 'class': 'band' }); d.style.left = X(b[0]) + 'px'; d.style.width = (X(b[1]) - X(b[0])) + 'px'; d.style.background = b[2]; d.style.top = (AX - 6 + (i === 3 ? 8 : 0)) + 'px'; d.style.height = i === 3 ? '8px' : '12px';
      d.innerHTML = '<span style="' + (i === 3 ? 'top:12px' : '') + '">' + b[3] + '</span>'; tl.appendChild(d);
    });
    window.TIMELINE.forEach(function (ev, i) {
      var slot = i % 4, above = slot % 2 === 0, far = slot >= 2, x = X(ev.y);
      var stemH = far ? 105 : 30;
      var btn = h('button', { 'class': 'ev', type: 'button', 'data-k': ev.k, 'aria-pressed': 'false', 'aria-label': ev.y + ': ' + ev.t });
      var txt = ev.t;
      btn.innerHTML = above ? '<span class="y">' + ev.y + '</span><span class="t">' + txt + '</span><span class="dot"></span>' : '<span class="dot"></span><span class="y">' + ev.y + '</span><span class="t">' + txt + '</span>';
      btn.style.left = x + 'px';
      var stem = h('div', { 'class': 'stem' }); stem.style.left = x + 'px';
      if (above) { btn.style.bottom = (400 - AX + 6 + stemH) + 'px'; stem.style.top = (AX - stemH - 6) + 'px'; stem.style.height = (stemH + 6) + 'px'; }
      else { btn.style.top = (AX + 6 + stemH) + 'px'; stem.style.top = (AX) + 'px'; stem.style.height = (stemH + 6) + 'px'; }
      btn.addEventListener('click', function () {
        tl.querySelectorAll('.ev').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true'); det.innerHTML = '<b>' + ev.y + '</b> ' + ev.t;
      });
      tl.appendChild(stem); tl.appendChild(btn);
    });
    tl.style.height = '400px';
    det.innerHTML = '<span style="color:var(--dim)">Select an event.</span>';
    sc.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') sc.scrollLeft += 120; else if (e.key === 'ArrowLeft') sc.scrollLeft -= 120; });
    // centre on 1935 initially
    sc.scrollLeft = Math.max(0, X(1960) - sc.clientWidth / 2);
  })();
})();
