// ============================================================
// The Triangle Engine — app.js
// ------------------------------------------------------------
// Wires the instruments to the renderer in gfx.js and the narrative in
// history.js. Nothing here does any graphics maths of its own: if a
// picture on this page shows a triangle being drawn, gfx.js drew it.
//
// House rules kept throughout: DOM is built with createElement and
// textContent (never innerHTML), every canvas is redrawn from state
// rather than mutated, and only the visible panel does any work.
// ============================================================
(function () {
  "use strict";

  var G = window.TRI_GFX;
  var H = window.TRI_HISTORY;
  if (!G || !H) return;

  var reduceMotion = false;
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { /* older browsers just get the animation */ }

  // ----------------------------------------------------------
  // Small DOM helpers
  // ----------------------------------------------------------
  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function fmt(value, places) {
    var p = places === undefined ? 2 : places;
    if (!isFinite(value)) return "∞";
    var out = value.toFixed(p);
    if (out === "-" + (0).toFixed(p)) out = (0).toFixed(p);
    return out;
  }

  function group(n) { return Math.round(n).toLocaleString("en-GB"); }

  function stat(list, key, value, warn) {
    var wrap = el("div");
    wrap.appendChild(el("dt", null, key));
    var dd = el("dd", warn ? "is-warn" : null, value);
    wrap.appendChild(dd);
    list.appendChild(wrap);
  }

  // Sets up a canvas so that drawing happens in stable logical units
  // whatever the device pixel ratio or the CSS width. Returns a context
  // already scaled, or null if the canvas is not laid out yet.
  function prepare(canvas, logicalW, logicalH) {
    if (!canvas) return null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW = canvas.clientWidth || logicalW;
    var backing = Math.max(1, Math.round(cssW * dpr));
    var height = Math.max(1, Math.round(backing * (logicalH / logicalW)));
    if (canvas.width !== backing || canvas.height !== height) {
      canvas.width = backing;
      canvas.height = height;
    }
    var ctx = canvas.getContext("2d");
    var s = backing / logicalW;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);
    return ctx;
  }

  // Maps a pointer event to the canvas's logical coordinate space.
  function pointerAt(event, canvas, logicalW, logicalH) {
    var rect = canvas.getBoundingClientRect();
    var source = event.touches && event.touches.length ? event.touches[0] : event;
    return {
      x: ((source.clientX - rect.left) / rect.width) * logicalW,
      y: ((source.clientY - rect.top) / rect.height) * logicalH,
    };
  }

  // A drag handler that works with mouse, pen and touch alike.
  function onDrag(canvas, logicalW, logicalH, handlers) {
    var active = false;
    function down(event) {
      var p = pointerAt(event, canvas, logicalW, logicalH);
      if (handlers.start && handlers.start(p) === false) return;
      active = true;
      event.preventDefault();
    }
    function move(event) {
      if (!active) return;
      event.preventDefault();
      handlers.move(pointerAt(event, canvas, logicalW, logicalH));
    }
    function up() {
      if (!active) return;
      active = false;
      if (handlers.end) handlers.end();
    }
    canvas.addEventListener("mousedown", down);
    canvas.addEventListener("touchstart", down, { passive: false });
    window.addEventListener("mousemove", move);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
  }

  // A software framebuffer that draws itself into a canvas as chunky,
  // unfiltered pixels — the honest way to show what a rasterizer did.
  function Framebuffer(width, height) {
    this.width = width;
    this.height = height;
    this.colour = new Uint8ClampedArray(width * height * 4);
    this.depth = new Float32Array(width * height);
    this.scratch = document.createElement("canvas");
    this.scratch.width = width;
    this.scratch.height = height;
    this.reset();
  }

  Framebuffer.prototype.reset = function (r, g, b) {
    var data = this.colour;
    var red = r === undefined ? 8 : r;
    var green = g === undefined ? 12 : g;
    var blue = b === undefined ? 20 : b;
    for (var i = 0; i < data.length; i += 4) {
      data[i] = red; data[i + 1] = green; data[i + 2] = blue; data[i + 3] = 255;
    }
    this.depth.fill(Infinity);
  };

  Framebuffer.prototype.set = function (x, y, rgb) {
    var i = (y * this.width + x) * 4;
    this.colour[i] = rgb[0] * 255;
    this.colour[i + 1] = rgb[1] * 255;
    this.colour[i + 2] = rgb[2] * 255;
    this.colour[i + 3] = 255;
  };

  Framebuffer.prototype.blit = function (ctx, x, y, w, h) {
    var image = this.scratch.getContext("2d").createImageData(this.width, this.height);
    image.data.set(this.colour);
    this.scratch.getContext("2d").putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.scratch, x, y, w, h);
    ctx.imageSmoothingEnabled = true;
  };

  // ----------------------------------------------------------
  // Panels: only the visible one draws, and it redraws on resize.
  // ----------------------------------------------------------
  var panels = {};
  var activePanel = "lineage";

  function registerPanel(name, draw) { panels[name] = draw; }

  function drawActive() {
    var fn = panels[activePanel];
    if (fn) fn();
  }

  var TAB_ORDER = ["lineage", "pipeline", "transform", "raster", "depth", "texture",
    "shading", "parallel", "rays", "coda", "ledger", "sources"];
  var TAB_LABELS = {
    lineage: "01 · Lineage", pipeline: "02 · The pipeline", transform: "03 · Transform",
    raster: "04 · Rasterize", depth: "05 · Depth", texture: "06 · Texture",
    shading: "07 · Light", parallel: "08 · Parallel", rays: "09 · Rays",
    coda: "10 · Today", ledger: "11 · The ledger", sources: "12 · Sources",
  };

  function selectTab(name, focusTab, options) {
    if (!document.getElementById("panel-" + name)) return;
    var opts = options || {};
    var changed = activePanel !== name;
    activePanel = name;
    var tabs = document.querySelectorAll('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var isMatch = tabs[i].getAttribute("data-tab") === name;
      tabs[i].setAttribute("aria-selected", isMatch ? "true" : "false");
      tabs[i].tabIndex = isMatch ? 0 : -1;
      if (isMatch && focusTab) tabs[i].focus();
    }
    var sections = document.querySelectorAll("[data-panel]");
    for (var j = 0; j < sections.length; j++) {
      var match = sections[j].getAttribute("data-panel") === name;
      sections[j].hidden = !match;
      sections[j].classList.toggle("is-active", match);
    }
    drawActive();

    // A section you cannot link to is a section nobody can send anyone.
    if (!opts.silent) {
      try {
        window.history.replaceState(null, "", "#" + name);
      } catch (error) { /* some embedders refuse this */ }
    }
    if (opts.scroll && changed) {
      var nav = document.querySelector(".instrument-nav");
      if (nav) nav.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
    // Move focus into the panel that just appeared, or a keyboard reader is
    // left on a tab while the content changes underneath them.
    if (opts.focusPanel && changed) {
      var panel = document.getElementById("panel-" + name);
      if (panel) { panel.tabIndex = -1; panel.focus({ preventScroll: true }); }
    }
  }

  // Every panel gets a way out of itself, so a linear reader never has to
  // scroll back up to the rail.
  function addPanelNav() {
    TAB_ORDER.forEach(function (name, index) {
      var panel = document.getElementById("panel-" + name);
      var next = TAB_ORDER[index + 1];
      if (!panel || !next) return;
      var wrap = el("div", "panel-next");
      var button = el("button", null, "Next — " + TAB_LABELS[next] + "  →");
      button.type = "button";
      button.addEventListener("click", function () {
        selectTab(next, false, { scroll: true, focusPanel: true });
      });
      wrap.appendChild(button);
      panel.appendChild(wrap);
    });
  }

  function initTabs() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () {
        selectTab(tab.getAttribute("data-tab"), false, { scroll: true, focusPanel: true });
      });
      tab.addEventListener("keydown", function (event) {
        var delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (event.key === "Home") { event.preventDefault(); selectTab(tabs[0].getAttribute("data-tab"), true); return; }
        if (event.key === "End") { event.preventDefault(); selectTab(tabs[tabs.length - 1].getAttribute("data-tab"), true); return; }
        if (!delta) return;
        event.preventDefault();
        var next = (index + delta + tabs.length) % tabs.length;
        selectTab(tabs[next].getAttribute("data-tab"), true);
      });
    });
    var jumps = document.querySelectorAll("[data-open-tab]");
    for (var i = 0; i < jumps.length; i++) {
      (function (button) {
        button.addEventListener("click", function () {
          selectTab(button.getAttribute("data-open-tab"), false, { scroll: true, focusPanel: true });
        });
      })(jumps[i]);
    }
  }

  // ==========================================================
  // HERO — a cube, actually rasterized, every frame
  // ==========================================================
  function initHero() {
    var canvas = $("hero-canvas");
    var stats = $("hero-stats");
    if (!canvas) return;
    var W = 640, H = 520;
    var CELLS_X = 84;
    var CELLS_Y = Math.round(CELLS_X * (H / W));
    var cube = G.unitCube();
    var buffer = new Float32Array(CELLS_X * CELLS_Y);
    var shade = new Float32Array(CELLS_X * CELLS_Y);
    var angle = reduceMotion ? 0.7 : 0;
    var counters = { tested: 0, covered: 0, rejected: 0 };
    var lastStat = 0;

    function render(time) {
      var ctx = prepare(canvas, W, H);
      if (!ctx) return;
      if (!reduceMotion) angle = time / 4200;

      buffer.fill(Infinity);
      shade.fill(-1);
      counters.tested = 0; counters.covered = 0; counters.rejected = 0;

      var model = G.multiply(G.rotationY(angle), G.rotationX(angle * 0.62));
      var rejected = new Uint8Array(CELLS_X * CELLS_Y);
      var tested = new Uint8Array(CELLS_X * CELLS_Y);
      var view = G.lookAt([0, 0, 4.4], [0, 0, 0], [0, 1, 0]);
      var proj = G.perspective(Math.PI / 3.4, CELLS_X / CELLS_Y, 0.5, 20);
      var mvp = G.multiplyAll([proj, view, model]);
      var light = G.normalize([0.55, 0.72, 0.5]);

      var screen = cube.positions.map(function (p) {
        var clip = G.apply(mvp, p);
        var ndc = G.perspectiveDivide(clip);
        var s = G.viewport(ndc, CELLS_X, CELLS_Y);
        return { x: s[0], y: s[1], z: s[2], w: clip[3] };
      });

      function markBox(a, b, c, target) {
        var minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
        var maxX = Math.min(CELLS_X - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
        var minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
        var maxY = Math.min(CELLS_Y - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
        for (var y = minY; y <= maxY; y++) {
          for (var x = minX; x <= maxX; x++) target[y * CELLS_X + x] = 1;
        }
      }

      function boxSamples(a, b, c) {
        var minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
        var maxX = Math.min(CELLS_X - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
        var minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
        var maxY = Math.min(CELLS_Y - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
        if (maxX < minX || maxY < minY) return 0;
        return (maxX - minX + 1) * (maxY - minY + 1);
      }

      cube.faces.forEach(function (face) {
        var worldNormal = G.faceNormal(
          G.applyDirection(model, cube.positions[face[0]]),
          G.applyDirection(model, cube.positions[face[1]]),
          G.applyDirection(model, cube.positions[face[2]])
        );
        var lit = 0.16 + 0.84 * Math.max(0, G.dot(worldNormal, light));
        // Two triangles per face, exactly as the hardware would want them.
        [[0, 1, 2], [0, 2, 3]].forEach(function (tri) {
          var a = screen[face[tri[0]]], b = screen[face[tri[1]]], c = screen[face[tri[2]]];
          counters.tested += boxSamples(a, b, c);
          markBox(a, b, c, tested);
          // Culling is deliberately OFF here: the far side of the cube is
          // rasterized too, and loses the depth test, so the counter below
          // shows the depth buffer actually earning its keep.
          G.rasterTriangle(a, b, c, { width: CELLS_X, height: CELLS_Y }, function (x, y, bary) {
            counters.covered++;
            var z = G.interpolateDepth(bary, a.z, b.z, c.z);
            var i = y * CELLS_X + x;
            if (z < buffer[i]) {
              if (buffer[i] !== Infinity) { counters.rejected++; rejected[i] = 1; }
              buffer[i] = z;
              shade[i] = lit;
            } else {
              counters.rejected++;
              rejected[i] = 1;
            }
          });
        });
      });

      ctx.clearRect(0, 0, W, H);
      var cw = W / CELLS_X, ch = H / CELLS_Y;
      for (var y = 0; y < CELLS_Y; y++) {
        for (var x = 0; x < CELLS_X; x++) {
          var i = y * CELLS_X + x;
          // The three colours are literally the three the legend names:
          // slate = asked and not covered, green = kept, magenta = covered
          // and then thrown away by the depth test.
          if (shade[i] >= 0) {
            var t = shade[i];
            ctx.fillStyle = "rgb(" + Math.round(18 + t * 62) + "," +
              Math.round(26 + t * 200) + "," + Math.round(38 + t * 112) + ")";
          } else if (rejected[i]) {
            ctx.fillStyle = "rgba(255, 119, 200, 0.36)";
          } else if (tested[i]) {
            ctx.fillStyle = "rgba(75, 100, 120, 0.26)";
          } else {
            continue;
          }
          ctx.fillRect(x * cw, y * ch, cw - 0.55, ch - 0.55);
        }
      }

      // The wireframe on top, so you can see the triangles the pixels came from.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      cube.edges.forEach(function (e) {
        var a = screen[e[0]], b = screen[e[1]];
        ctx.moveTo(a.x * cw, a.y * ch);
        ctx.lineTo(b.x * cw, b.y * ch);
      });
      ctx.stroke();

      if (stats && time - lastStat > 260) {
        lastStat = time;
        stats.textContent =
          group(counters.tested) + " samples tested · " +
          group(counters.covered) + " covered · " +
          group(counters.rejected) + " lost the depth test";
      }

    }

    function frame(time) {
      render(time);
      window.requestAnimationFrame(frame);
    }

    // Always paint one frame straight away: the canvas must never be
    // blank, whether or not an animation loop follows it.
    render(0);
    if (reduceMotion) {
      window.addEventListener("resize", function () { render(0); });
    } else {
      window.requestAnimationFrame(frame);
    }
  }

  // ==========================================================
  // 01 — LINEAGE
  // ==========================================================
  function initLineage() {
    var track = $("timeline-track");
    if (!track) return;
    var index = 0;

    H.eras.forEach(function (era, i) {
      var button = el("button", null, era.short);
      button.type = "button";
      button.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      button.title = era.year + " — " + era.name;
      button.addEventListener("click", function () { show(i); });
      track.appendChild(button);
    });

    var stageRows = {};
    H.stageKeys.forEach(function (key) {
      var row = el("div", "stage-row");
      row.appendChild(el("div", "stage-row-label", key.label));
      var bar = el("div", "stage-row-bar");
      var label = el("span");
      bar.appendChild(label);
      row.appendChild(bar);
      $("stage-rows").appendChild(row);
      stageRows[key.id] = { bar: bar, label: label };
    });

    function show(i) {
      index = Math.max(0, Math.min(H.eras.length - 1, i));
      var era = H.eras[index];

      var buttons = track.querySelectorAll("button");
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].setAttribute("aria-pressed", b === index ? "true" : "false");
      }

      $("timeline-selection").textContent = era.short + " · " + era.name;
      $("timeline-headline").textContent = era.headline;
      $("era-maker").textContent = era.maker;
      $("era-name").textContent = era.name;
      $("era-machine").textContent = era.machine;
      $("era-year").textContent = era.short;
      $("era-summary").textContent = era.summary;
      $("era-primitive").textContent = era.primitive;
      $("era-api").textContent = era.api;

      var detail = $("era-detail");
      clear(detail);
      era.detail.forEach(function (line) { detail.appendChild(el("li", null, line)); });

      var numbers = $("era-numbers");
      clear(numbers);
      era.numbers.forEach(function (n) {
        var wrap = el("div");
        wrap.appendChild(el("dt", null, n.k));
        wrap.appendChild(el("dd", null, n.v));
        numbers.appendChild(wrap);
      });

      H.stageKeys.forEach(function (key) {
        var state = era.stages[key.id] || "none";
        var row = stageRows[key.id];
        row.bar.className = "stage-row-bar state-" + state;
        row.label.textContent = H.stageStates[state].short;
        row.bar.title = key.label + ": " + H.stageStates[state].label;
      });

      $("timeline-prev").disabled = index === 0;
      $("timeline-next").disabled = index === H.eras.length - 1;
    }

    $("timeline-prev").addEventListener("click", function () { show(index - 1); });
    $("timeline-next").addEventListener("click", function () { show(index + 1); });
    show(0);
    registerPanel("lineage", function () { /* pure DOM: nothing to redraw */ });
  }

  // ==========================================================
  // 10 — TODAY: the thesis from section 01, drawn three times
  // ==========================================================
  function initCoda() {
    var grid = $("coda-grid");
    if (!grid) return;
    // Three moments chosen because each is the first at which the whole
    // pipeline sat in one place: all software, all wired, all programmable.
    var columns = ["utah", "opengl", "raytracing"].map(function (id) {
      return H.eras.find(function (era) { return era.id === id; });
    });

    grid.appendChild(el("div", "coda-head", ""));
    columns.forEach(function (era) {
      var head = el("div", "coda-head", era.short);
      head.appendChild(el("span", null, era.name));
      grid.appendChild(head);
    });

    H.stageKeys.forEach(function (key) {
      grid.appendChild(el("div", "stage-row-label", key.label));
      columns.forEach(function (era) {
        var state = era.stages[key.id] || "none";
        var bar = el("div", "stage-row-bar state-" + state);
        bar.appendChild(el("span", null, H.stageStates[state].short));
        bar.title = key.label + " in " + era.short + ": " + H.stageStates[state].label;
        grid.appendChild(bar);
      });
    });
    registerPanel("coda", function () { /* pure DOM */ });
  }

  // ==========================================================
  // 11 — THE LEDGER: version numbers against the silicon
  // ==========================================================
  function initLedger() {
    var body = $("ledger-body");
    var filters = $("ledger-filters");
    if (!body || !filters) return;
    var L = H.ledger;
    var active = {};
    L.families.forEach(function (family) { active[family.id] = true; });

    L.families.forEach(function (family) {
      var button = el("button", null, family.label);
      button.type = "button";
      button.setAttribute("aria-pressed", "true");
      button.setAttribute("data-lane", family.lane);
      button.addEventListener("click", function () {
        active[family.id] = !active[family.id];
        button.setAttribute("aria-pressed", active[family.id] ? "true" : "false");
        render();
      });
      filters.appendChild(button);
    });

    function entryNode(entry) {
      var wrap = el("div", "ledger-entry family-" + entry.family);
      var head = el("p", "ledger-entry-name", entry.name);
      if (entry.when) head.appendChild(el("span", "ledger-when", " · " + entry.when));
      wrap.appendChild(head);
      wrap.appendChild(el("p", "ledger-who", entry.who));
      wrap.appendChild(el("p", "ledger-what", entry.what));
      if (entry.explains && TAB_LABELS[entry.explains]) {
        var link = el("button", "inline-link ledger-link", "Explained in " + TAB_LABELS[entry.explains]);
        link.type = "button";
        link.addEventListener("click", function () {
          selectTab(entry.explains, false, { scroll: true, focusPanel: true });
        });
        wrap.appendChild(link);
      }
      return wrap;
    }

    function render() {
      clear(body);
      var apis = L.apis.filter(function (e) { return active[e.family]; });
      var hardware = L.hardware.filter(function (e) { return active[e.family]; });
      var years = [];
      apis.concat(hardware).forEach(function (e) {
        if (years.indexOf(e.year) < 0) years.push(e.year);
      });
      years.sort(function (a, b) { return a - b; });

      years.forEach(function (year) {
        var row = el("div", "ledger-row");
        row.appendChild(el("div", "ledger-year", String(year)));
        [apis, hardware].forEach(function (list, index) {
          var lane = el("div", "ledger-lane");
          // The column headings are hidden on a narrow screen, where the
          // two lanes stack; each lane labels itself there instead.
          lane.setAttribute("data-lane", index === 0 ? "Specifications" : "Hardware");
          var found = list.filter(function (e) { return e.year === year; });
          if (!found.length) {
            lane.appendChild(el("span", "ledger-empty", "—"));
          } else {
            found.forEach(function (entry) { lane.appendChild(entryNode(entry)); });
          }
          row.appendChild(lane);
        });
        body.appendChild(row);
      });

      var list = $("ledger-stats");
      clear(list);
      stat(list, "Years covered", years.length ? years[0] + "–" + years[years.length - 1] : "—");
      stat(list, "Specifications", group(apis.length));
      stat(list, "Machines", group(hardware.length));
      var linked = apis.concat(hardware).filter(function (e) { return e.explains; }).length;
      stat(list, "Linked to a section", group(linked));
    }

    render();
    registerPanel("ledger", function () { /* pure DOM */ });
  }

  // ==========================================================
  // 12 — SOURCES
  // ==========================================================
  function initSources() {
    var list = $("source-list");
    if (!list) return;
    H.sources.forEach(function (source) {
      var li = el("li");
      li.appendChild(el("span", "source-claim", source.claim));
      li.appendChild(el("span", "source-cite", source.cite));
      list.appendChild(li);
    });
  }

  // ==========================================================
  // 02 — THE PIPELINE, one triangle at a time
  // ==========================================================
  var PIPE_W = 760, PIPE_H = 440;

  function pipelineModel() {
    // One deliberately asymmetric triangle, so no stage looks accidental.
    var object = [
      { p: [-0.90, -0.62, 0.22], colour: [1.0, 0.34, 0.72] },
      { p: [0.96, -0.44, -0.42], colour: [0.31, 0.88, 0.55] },
      { p: [0.08, 0.94, 0.16], colour: [0.34, 0.83, 0.93] },
    ];
    var model = G.multiply(G.translation(0.15, 0, -0.3), G.rotationY(0.48));
    var view = G.lookAt([0, 0.55, 3.1], [0, 0, 0], [0, 1, 0]);
    var near = 0.6, far = 40;
    var projection = G.perspective((52 * Math.PI) / 180, PIPE_W / PIPE_H, near, far);

    return object.map(function (v) {
      var world = G.apply(model, v.p);
      var eye = G.apply(view, world);
      var clip = G.apply(projection, eye);
      var ndc = G.perspectiveDivide(clip);
      var screen = G.viewport(ndc, PIPE_W, PIPE_H);
      return {
        colour: v.colour,
        object: v.p.concat([1]),
        world: world,
        eye: eye,
        clip: clip,
        ndc: [ndc[0], ndc[1], ndc[2], 1 / clip[3]],
        screen: [screen[0], screen[1], screen[2], 1 / clip[3]],
      };
    });
  }

  function initPipeline() {
    var rail = $("pipeline-rail");
    var canvas = $("pipeline-canvas");
    if (!rail || !canvas) return;
    var vertices = pipelineModel();
    var stage = 0;
    var playing = false;
    var timer = null;

    H.pipeline.forEach(function (item, i) {
      var button = el("button");
      button.type = "button";
      button.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      button.appendChild(el("b", null, String(i + 1).padStart(2, "0")));
      button.appendChild(el("i", null, item.name));
      button.addEventListener("click", function () { setStage(i); });
      rail.appendChild(button);
    });

    // Which coordinate set the table shows, and what to call the columns.
    var TABLE = {
      input: { key: "object", heads: ["x", "y", "z", "w"], note: "Object space: whatever units the model was authored in. The w is 1 because a position, unlike a direction, is affected by translation." },
      vertex: { key: "clip", heads: ["x", "y", "z", "w"], note: "Clip space, after one 4x4 multiply. Nothing has been divided yet — but w now holds the viewer-space distance, which is the entire point of the projection matrix." },
      clip: { key: "clip", heads: ["x", "y", "z", "w"], note: "A vertex is inside the frustum when -w ≤ x, y, z ≤ w. Compare each column against the w column: that is the whole test, six comparisons per vertex." },
      divide: { key: "ndc", heads: ["x/w", "y/w", "z/w", "1/w"], note: "Normalised device coordinates. Everything now lies in the -1..1 cube — and 1/w has been kept, because the fragment stage will need it to interpolate correctly." },
      viewport: { key: "screen", heads: ["px", "py", "depth", "1/w"], note: "Pixels, with y counting downward. These are then snapped to a 1/16 sub-pixel grid before any coverage question is asked." },
      setup: { key: "screen", heads: ["px", "py", "depth", "1/w"], note: "Setup consumes exactly these numbers and produces three edge functions and a set of interpolation gradients. The signed area — and therefore the facing — falls out of the same arithmetic." },
      raster: { key: "screen", heads: ["px", "py", "depth", "1/w"], note: "The vertices are finished with. From here everything is fragments: interpolated samples that no longer know which corner they came from." },
      fragment: { key: "screen", heads: ["px", "py", "depth", "1/w"], note: "Each fragment's attributes are rebuilt from the three corners weighted by barycentric coordinates — after dividing each corner's value by its own w, and multiplying back by the interpolated 1/w." },
      depth: { key: "screen", heads: ["px", "py", "depth", "1/w"], note: "The depth column is the value tested. It is NDC z, which is linear in screen space — unlike everything else, which is why depth can be interpolated the cheap way." },
      blend: { key: "screen", heads: ["px", "py", "depth", "1/w"], note: "Written to the framebuffer, in the order the application submitted its primitives, because alpha compositing does not commute." },
    };

    function setStage(i) {
      stage = Math.max(0, Math.min(H.pipeline.length - 1, i));
      var item = H.pipeline[stage];
      var buttons = rail.querySelectorAll("button");
      for (var b = 0; b < buttons.length; b++) {
        buttons[b].setAttribute("aria-pressed", b === stage ? "true" : "false");
        buttons[b].classList.toggle("is-done", b < stage);
      }
      $("pipe-space").textContent = item.space;
      $("pipe-name").textContent = item.name;
      $("pipe-one").textContent = item.one;
      $("pipe-body").textContent = item.body;
      $("pipe-hardware").textContent = item.hardware;
      $("pipe-prev").disabled = stage === 0;
      $("pipe-next").disabled = stage === H.pipeline.length - 1;

      var table = TABLE[item.id];
      for (var h = 0; h < 4; h++) $("vt-h" + h).textContent = table.heads[h];
      $("vertex-table-note").textContent = table.note;
      var body = $("vertex-table-body");
      clear(body);
      vertices.forEach(function (v, index) {
        var values = v[table.key];
        var tr = el("tr");
        tr.appendChild(el("td", null, "v" + index));
        for (var c = 0; c < 4; c++) {
          tr.appendChild(el("td", null, fmt(values[c], 3)));
        }
        tr.appendChild(el("td", "note-cell", index === 0 ? item.space : ""));
        body.appendChild(tr);
      });

      drawPipeline();
    }

    function drawPipeline() {
      var ctx = prepare(canvas, PIPE_W, PIPE_H);
      if (!ctx) return;
      var id = H.pipeline[stage].id;
      var caption = $("pipeline-caption");
      ctx.fillStyle = "#060a12";
      ctx.fillRect(0, 0, PIPE_W, PIPE_H);

      if (id === "input" || id === "vertex") {
        drawObjectStage(ctx, id === "vertex");
        caption.textContent = id === "input"
          ? "Three corners, in the model's own coordinates. Indexed, so a shared corner is stored — and transformed — once."
          : "The same three corners after one 4x4 multiply. Every vertex takes the identical path, which is why this stage vectorises perfectly.";
      } else if (id === "clip") {
        drawClipStage(ctx);
        caption.textContent = "Clip space, drawn as x against w. The frustum's side planes are the diagonals x = ±w; the near plane is the vertical w = near. Anything left of it has negative w, and dividing by that flips the point through the origin.";
      } else if (id === "divide") {
        drawDivideStage(ctx);
        caption.textContent = "The divide, drawn as it happens: each corner slides along its own ray to the plane w = 1. The wedge becomes a square, and that squashing is perspective.";
      } else if (id === "viewport") {
        drawViewportStage(ctx);
        caption.textContent = "The -1..1 square is scaled onto the pixel rectangle and y is flipped, because screens count rows downward.";
      } else if (id === "setup") {
        drawSetupStage(ctx);
        caption.textContent = "Three directed edges, each with an inside. The signed area is the same arithmetic, and its sign is the facing.";
      } else {
        drawRasterStage(ctx, id);
        caption.textContent = {
          raster: "Every sample in the bounding box is tested against all three edges. Green passed all three.",
          fragment: "Each surviving fragment's colour, interpolated from the corners — dividing through by w on the way.",
          depth: "The same fragments, with a second triangle behind them. Brightness is the depth kept in the buffer.",
          blend: "The finished pixels, composited into the framebuffer.",
        }[id];
      }
    }

    // --- the individual stage pictures ---
    function axisFrame(ctx, x, y, w, h, labelX, labelY) {
      ctx.strokeStyle = "rgba(150, 190, 205, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "#6a7f8c";
      ctx.font = "500 12px ui-monospace, monospace";
      ctx.fillText(labelX, x + w - 26, y + h + 16);
      ctx.save();
      ctx.translate(x - 10, y + 14);
      ctx.fillText(labelY, 0, 0);
      ctx.restore();
    }

    function drawTriangleOutline(ctx, points, fill, stroke) {
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      ctx.lineTo(points[1][0], points[1][1]);
      ctx.lineTo(points[2][0], points[2][1]);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.6; ctx.stroke(); }
    }

    function drawCorners(ctx, points, labels) {
      points.forEach(function (p, i) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(" + vertices[i].colour.map(function (c) { return Math.round(c * 255); }).join(",") + ")";
        ctx.fill();
        if (labels) {
          ctx.fillStyle = "#e9f1f4";
          ctx.font = "600 12px ui-monospace, monospace";
          ctx.fillText(labels[i], p[0] + 10, p[1] - 8);
        }
      });
    }

    function drawObjectStage(ctx, transformed) {
      var cx = PIPE_W / 2, cy = PIPE_H / 2, s = 120;
      // A simple axonometric view so all three axes are visible at once.
      function project(p) {
        return [cx + (p[0] - p[2] * 0.5) * s, cy - (p[1] - p[2] * 0.32) * s];
      }
      ctx.strokeStyle = "rgba(150, 190, 205, 0.16)";
      ctx.lineWidth = 1;
      for (var g = -2; g <= 2; g++) {
        ctx.beginPath();
        var a = project([g, -1.4, -2]), b = project([g, -1.4, 2]);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        var c = project([-2, -1.4, g]), d = project([2, -1.4, g]);
        ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
        ctx.stroke();
      }
      var axes = [
        { v: [1.6, 0, 0], label: "+x", colour: "#ff6f7d" },
        { v: [0, 1.6, 0], label: "+y", colour: "#4fe08b" },
        { v: [0, 0, 1.6], label: "+z", colour: "#57d3ee" },
      ];
      axes.forEach(function (axis) {
        var o = project([0, 0, 0]), t = project(axis.v);
        ctx.strokeStyle = axis.colour;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(t[0], t[1]); ctx.stroke();
        ctx.fillStyle = axis.colour;
        ctx.font = "600 12px ui-monospace, monospace";
        ctx.fillText(axis.label, t[0] + 6, t[1]);
      });
      var key = transformed ? "world" : "object";
      var points = vertices.map(function (v) { return project(v[key]); });
      drawTriangleOutline(ctx, points, "rgba(79, 224, 139, 0.14)", "rgba(79, 224, 139, 0.7)");
      drawCorners(ctx, points, ["v0", "v1", "v2"]);
      ctx.fillStyle = "#6a7f8c";
      ctx.font = "500 12px ui-monospace, monospace";
      ctx.fillText(transformed ? "after the model matrix (world space)" : "the model's own axes (object space)", 24, 30);
    }

    function drawClipStage(ctx) {
      // Clip space plotted as x (vertical) against w (horizontal): the
      // frustum's side planes become the lines x = ±w, so "inside" is
      // literally the wedge between two diagonals.
      var ox = 90, oy = PIPE_H / 2, sx = 66, sy = 52;
      var maxW = 5;
      ctx.strokeStyle = "rgba(150, 190, 205, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ox, 30); ctx.lineTo(ox, PIPE_H - 40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, oy); ctx.lineTo(PIPE_W - 30, oy); ctx.stroke();
      ctx.fillStyle = "#6a7f8c";
      ctx.font = "500 12px ui-monospace, monospace";
      ctx.fillText("w →", PIPE_W - 60, oy + 18);
      ctx.fillText("x ↑", ox + 8, 42);

      // The wedge between x = w and x = -w.
      ctx.fillStyle = "rgba(87, 211, 238, 0.09)";
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + maxW * sx, oy - maxW * sy);
      ctx.lineTo(ox + maxW * sx, oy + maxW * sy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(87, 211, 238, 0.55)";
      ctx.beginPath();
      ctx.moveTo(ox, oy); ctx.lineTo(ox + maxW * sx, oy - maxW * sy);
      ctx.moveTo(ox, oy); ctx.lineTo(ox + maxW * sx, oy + maxW * sy);
      ctx.stroke();
      ctx.fillStyle = "#57d3ee";
      ctx.fillText("x = w", ox + maxW * sx - 60, oy - maxW * sy + 22);
      ctx.fillText("x = -w", ox + maxW * sx - 62, oy + maxW * sy - 12);

      // The near plane.
      var near = 0.6;
      ctx.strokeStyle = "rgba(255, 119, 200, 0.8)";
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(ox + near * sx, 40); ctx.lineTo(ox + near * sx, PIPE_H - 50);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#ff77c8";
      ctx.fillText("near: w = " + near, ox + near * sx + 8, 56);
      ctx.fillStyle = "rgba(255, 111, 125, 0.75)";
      ctx.fillText("w < 0 — behind the eye", 34, PIPE_H - 20);

      var points = vertices.map(function (v) {
        return [ox + v.clip[3] * sx, oy - v.clip[0] * sy];
      });
      drawTriangleOutline(ctx, points, "rgba(79, 224, 139, 0.12)", "rgba(79, 224, 139, 0.8)");
      drawCorners(ctx, points, ["v0", "v1", "v2"]);
    }

    function drawDivideStage(ctx) {
      var ox = 90, oy = PIPE_H / 2, sx = 66, sy = 52;
      ctx.strokeStyle = "rgba(150, 190, 205, 0.3)";
      ctx.beginPath(); ctx.moveTo(ox, 30); ctx.lineTo(ox, PIPE_H - 40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, oy); ctx.lineTo(PIPE_W - 30, oy); ctx.stroke();

      // The plane w = 1, where everything lands.
      ctx.strokeStyle = "rgba(255, 192, 97, 0.8)";
      ctx.beginPath();
      ctx.moveTo(ox + sx, 40); ctx.lineTo(ox + sx, PIPE_H - 50);
      ctx.stroke();
      ctx.fillStyle = "#ffc061";
      ctx.font = "500 12px ui-monospace, monospace";
      ctx.fillText("w = 1", ox + sx + 8, 54);

      vertices.forEach(function (v, i) {
        var from = [ox + v.clip[3] * sx, oy - v.clip[0] * sy];
        var to = [ox + sx, oy - v.ndc[0] * sy];
        ctx.strokeStyle = "rgba(150, 190, 205, 0.35)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(ox, oy); ctx.lineTo(from[0], from[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255, 119, 200, 0.85)";
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke();
        ctx.fillStyle = "#98adb8";
        ctx.font = "500 11px ui-monospace, monospace";
        ctx.fillText("÷ " + fmt(v.clip[3], 2), (from[0] + to[0]) / 2 - 14, (from[1] + to[1]) / 2 - 8);
        ctx.beginPath();
        ctx.arc(from[0], from[1], 5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(150, 190, 205, 0.5)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(to[0], to[1], 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgb(" + vertices[i].colour.map(function (c) { return Math.round(c * 255); }).join(",") + ")";
        ctx.fill();
      });
      ctx.fillStyle = "#6a7f8c";
      ctx.font = "500 12px ui-monospace, monospace";
      ctx.fillText("the further the corner, the bigger the divisor — so the further it moves in", 24, PIPE_H - 20);
    }

    function drawViewportStage(ctx) {
      var boxW = 260, boxH = 200;
      var lx = 60, ly = (PIPE_H - boxH) / 2;
      var rx = PIPE_W - 60 - boxW * 1.3, ry = (PIPE_H - boxH * 1.05) / 2;

      ctx.strokeStyle = "rgba(150, 190, 205, 0.35)";
      ctx.strokeRect(lx, ly, boxW, boxH);
      ctx.fillStyle = "#6a7f8c";
      ctx.font = "500 12px ui-monospace, monospace";
      ctx.fillText("NDC  -1 … +1,  y up", lx, ly - 12);
      ctx.fillText("screen  0 … " + PIPE_W + ",  y down", rx, ry - 12);
      ctx.strokeRect(rx, ry, boxW * 1.3, boxH * 1.05);

      var left = vertices.map(function (v) {
        return [lx + (v.ndc[0] * 0.5 + 0.5) * boxW, ly + (1 - (v.ndc[1] * 0.5 + 0.5)) * boxH];
      });
      var right = vertices.map(function (v) {
        return [rx + (v.screen[0] / PIPE_W) * boxW * 1.3, ry + (v.screen[1] / PIPE_H) * boxH * 1.05];
      });
      drawTriangleOutline(ctx, left, "rgba(87, 211, 238, 0.12)", "rgba(87, 211, 238, 0.7)");
      drawTriangleOutline(ctx, right, "rgba(79, 224, 139, 0.14)", "rgba(79, 224, 139, 0.8)");
      drawCorners(ctx, left);
      drawCorners(ctx, right);
      for (var i = 0; i < 3; i++) {
        ctx.strokeStyle = "rgba(255, 192, 97, 0.35)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(left[i][0], left[i][1]);
        ctx.lineTo(right[i][0], right[i][1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    function drawSetupStage(ctx) {
      var points = vertices.map(function (v) { return [v.screen[0], v.screen[1]]; });
      drawTriangleOutline(ctx, points, "rgba(79, 224, 139, 0.08)", "rgba(79, 224, 139, 0.5)");
      var names = ["E0 : v1 → v2", "E1 : v2 → v0", "E2 : v0 → v1"];
      var pairs = [[1, 2], [2, 0], [0, 1]];
      var colours = ["#ff77c8", "#57d3ee", "#ffc061"];
      pairs.forEach(function (pair, i) {
        var a = points[pair[0]], b = points[pair[1]];
        ctx.strokeStyle = colours[i];
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        // An arrow head, so the direction of the edge is visible.
        var dx = b[0] - a[0], dy = b[1] - a[1];
        var len = Math.hypot(dx, dy) || 1;
        var mx = a[0] + dx * 0.55, my = a[1] + dy * 0.55;
        var ux = dx / len, uy = dy / len;
        ctx.beginPath();
        ctx.moveTo(mx + ux * 9, my + uy * 9);
        ctx.lineTo(mx - uy * 6 - ux * 3, my + ux * 6 - uy * 3);
        ctx.lineTo(mx + uy * 6 - ux * 3, my - ux * 6 - uy * 3);
        ctx.closePath();
        ctx.fillStyle = colours[i];
        ctx.fill();
        // The inward normal, which is the direction the edge function grows.
        ctx.strokeStyle = colours[i] + "";
        ctx.globalAlpha = 0.45;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + uy * 34, my - ux * 34);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = colours[i];
        ctx.font = "600 12px ui-monospace, monospace";
        ctx.fillText(names[i], mx + uy * 40 - 34, my - ux * 40);
      });
      drawCorners(ctx, points, ["v0", "v1", "v2"]);

      var area = G.edge(points[0][0], points[0][1], points[1][0], points[1][1], points[2][0], points[2][1]);
      ctx.fillStyle = "#e9f1f4";
      ctx.font = "600 13px ui-monospace, monospace";
      ctx.fillText("signed area × 2 = " + group(area) + "  →  " + (area > 0 ? "front facing" : "back facing"), 24, PIPE_H - 24);
    }

    function drawRasterStage(ctx, id) {
      var CX = 76, CY = Math.round(76 * (PIPE_H / PIPE_W));
      var cw = PIPE_W / CX, ch = PIPE_H / CY;
      var screen = vertices.map(function (v) {
        return { x: (v.screen[0] / PIPE_W) * CX, y: (v.screen[1] / PIPE_H) * CY, z: v.screen[2], invW: v.screen[3] };
      });

      // The occluder used by the depth and blend stages: a flat triangle
      // in front of the left-hand corner, so the test has something to do.
      var occluder = [
        { x: CX * 0.06, y: CY * 0.12, z: -0.2 },
        { x: CX * 0.62, y: CY * 0.30, z: -0.2 },
        { x: CX * 0.10, y: CY * 0.92, z: -0.2 },
      ];
      var showOccluder = id === "depth" || id === "blend";

      var depth = new Float32Array(CX * CY).fill(Infinity);
      var colour = new Array(CX * CY).fill(null);

      function paint(tri, shadeFn) {
        G.rasterTriangle(tri[0], tri[1], tri[2], { width: CX, height: CY }, function (x, y, bary) {
          var i = y * CX + x;
          var z = G.interpolateDepth(bary, tri[0].z, tri[1].z, tri[2].z);
          if (z >= depth[i]) return;
          depth[i] = z;
          colour[i] = shadeFn(bary, z);
        });
      }

      if (showOccluder) {
        paint(occluder, function () { return [0.16, 0.20, 0.32]; });
      }
      paint(screen, function (bary, z) {
        if (id === "raster") return [0.31, 0.88, 0.55];
        var out = [0, 0, 0];
        for (var c = 0; c < 3; c++) {
          out[c] = G.interpolatePerspective(
            bary,
            vertices[0].colour[c], vertices[1].colour[c], vertices[2].colour[c],
            screen[0].invW, screen[1].invW, screen[2].invW
          );
        }
        if (id === "depth") {
          var g = G.clamp(1 - (z * 0.5 + 0.5), 0, 1);
          return [g, g, g];
        }
        return out;
      });

      // The pixels that were tested but rejected, so the work is visible.
      if (id === "raster") {
        ctx.fillStyle = "rgba(75, 100, 120, 0.4)";
        var minX = Math.max(0, Math.floor(Math.min(screen[0].x, screen[1].x, screen[2].x)));
        var maxX = Math.min(CX - 1, Math.ceil(Math.max(screen[0].x, screen[1].x, screen[2].x)));
        var minY = Math.max(0, Math.floor(Math.min(screen[0].y, screen[1].y, screen[2].y)));
        var maxY = Math.min(CY - 1, Math.ceil(Math.max(screen[0].y, screen[1].y, screen[2].y)));
        for (var by = minY; by <= maxY; by++) {
          for (var bx = minX; bx <= maxX; bx++) {
            if (colour[by * CX + bx]) continue;
            ctx.fillRect(bx * cw + 1, by * ch + 1, cw - 2, ch - 2);
          }
        }
      }

      for (var y = 0; y < CY; y++) {
        for (var x = 0; x < CX; x++) {
          var c = colour[y * CX + x];
          if (!c) continue;
          ctx.fillStyle = "rgb(" +
            Math.round(G.clamp(c[0], 0, 1) * 255) + "," +
            Math.round(G.clamp(c[1], 0, 1) * 255) + "," +
            Math.round(G.clamp(c[2], 0, 1) * 255) + ")";
          ctx.fillRect(x * cw, y * ch, cw - 0.4, ch - 0.4);
        }
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(screen[0].x * cw, screen[0].y * ch);
      ctx.lineTo(screen[1].x * cw, screen[1].y * ch);
      ctx.lineTo(screen[2].x * cw, screen[2].y * ch);
      ctx.closePath();
      ctx.stroke();
    }

    function stop() {
      playing = false;
      if (timer) { window.clearInterval(timer); timer = null; }
      $("pipe-play").textContent = "Play";
    }

    $("pipe-prev").addEventListener("click", function () { stop(); setStage(stage - 1); });
    $("pipe-next").addEventListener("click", function () { stop(); setStage(stage + 1); });
    $("pipe-play").addEventListener("click", function () {
      if (playing) { stop(); return; }
      playing = true;
      $("pipe-play").textContent = "Pause";
      timer = window.setInterval(function () {
        if (stage >= H.pipeline.length - 1) { stop(); return; }
        setStage(stage + 1);
      }, 6200);
    });

    setStage(0);
    registerPanel("pipeline", drawPipeline);
  }

  // ==========================================================
  // 03 — TRANSFORM: the matrix, and the divide
  // ==========================================================
  var TF_W = 640, TF_H = 520;
  var TF_NEAR = 0.5, TF_FAR = 40;

  function initTransform() {
    var canvas = $("transform-canvas");
    if (!canvas) return;
    var cube = G.unitCube();
    var state = { fov: 60, distance: 5, yaw: 35, pitch: -20, projection: "perspective", corner: 6, dolly: false, matrix: "projection" };
    // The on-screen size the dolly zoom holds constant: half the frame
    // height at the subject's distance, captured when the box is ticked.
    var dollySize = null;
    var RES_X = 170;
    var RES_Y = Math.round(RES_X * (TF_H / TF_W));
    var fb = new Framebuffer(RES_X, RES_Y);

    var cornerSelect = $("tf-corner");
    cube.positions.forEach(function (p, i) {
      var option = el("option", null, "v" + i + "  (" + p.join(", ") + ")");
      option.value = String(i);
      if (i === state.corner) option.selected = true;
      cornerSelect.appendChild(option);
    });

    var matrixCells = [];
    var display = $("matrix-display");
    for (var i = 0; i < 16; i++) {
      var cell = el("div", "matrix-cell", "0");
      display.appendChild(cell);
      matrixCells.push(cell);
    }

    function matrices() {
      var model = G.multiply(G.rotationY((state.yaw * Math.PI) / 180), G.rotationX((state.pitch * Math.PI) / 180));
      var view = G.lookAt([0, 0, state.distance], [0, 0, 0], [0, 1, 0]);
      var projection = state.projection === "perspective"
        ? G.perspective((state.fov * Math.PI) / 180, TF_W / TF_H, TF_NEAR, TF_FAR)
        : (function () {
            // Match the orthographic box to what the perspective camera
            // sees at the cube's distance, so switching is a fair comparison.
            var halfHeight = Math.tan((state.fov * Math.PI) / 360) * state.distance;
            var halfWidth = halfHeight * (TF_W / TF_H);
            return G.orthographic(-halfWidth, halfWidth, -halfHeight, halfHeight, TF_NEAR, TF_FAR);
          })();
      return { model: model, view: view, projection: projection, mvp: G.multiplyAll([projection, view, model]) };
    }

    function draw() {
      var ctx = prepare(canvas, TF_W, TF_H);
      if (!ctx) return;
      var m = matrices();
      var light = G.normalize([0.5, 0.7, 0.62]);

      fb.reset(6, 10, 18);
      var clipped = [];

      function boxSamples(a, b, c) {
        var minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
        var maxX = Math.min(CELLS_X - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
        var minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
        var maxY = Math.min(CELLS_Y - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
        if (maxX < minX || maxY < minY) return 0;
        return (maxX - minX + 1) * (maxY - minY + 1);
      }

      cube.faces.forEach(function (face, faceIndex) {
        var worldPoints = face.map(function (index) { return G.applyDirection(m.model, cube.positions[index]); });
        var normal = G.faceNormal(worldPoints[0], worldPoints[1], worldPoints[2]);
        var lit = 0.24 + 0.76 * Math.max(0, G.dot(normal, light));
        // One hue per axis, so opposite faces match and the three faces
        // you can see at any moment are always three different colours.
        var tint = [
          [0.30, 0.88, 0.55], [0.30, 0.88, 0.55],
          [1.00, 0.74, 0.36], [1.00, 0.74, 0.36],
          [0.72, 0.62, 1.00], [0.72, 0.62, 1.00],
        ][faceIndex];

        var polygon = face.map(function (index) {
          return { clip: G.apply(m.mvp, cube.positions[index]), attrs: [] };
        });
        var visible = G.clipNear(polygon);
        if (visible.length < 3) return;
        if (visible.length !== polygon.length) clipped.push(faceIndex);

        G.fanTriangles(visible).forEach(function (tri) {
          var screen = tri.map(function (v) {
            var ndc = G.perspectiveDivide(v.clip);
            var s = G.viewport(ndc, RES_X, RES_Y);
            return { x: s[0], y: s[1], z: s[2] };
          });
          G.rasterTriangle(screen[0], screen[1], screen[2], {
            width: RES_X, height: RES_Y, cull: "back",
          }, function (x, y, bary) {
            var z = G.interpolateDepth(bary, screen[0].z, screen[1].z, screen[2].z);
            var i = y * RES_X + x;
            if (z >= fb.depth[i]) return;
            fb.depth[i] = z;
            fb.set(x, y, [tint[0] * lit, tint[1] * lit, tint[2] * lit]);
          });
        });
      });

      fb.blit(ctx, 0, 0, TF_W, TF_H);

      // The wireframe, drawn as vectors on top — but only for edges that
      // are entirely in front of the near plane, because an edge crossing
      // it has no meaningful screen position until it is clipped.
      var projected = cube.positions.map(function (p) {
        var clip = G.apply(m.mvp, p);
        var ndc = G.perspectiveDivide(clip);
        var s = G.viewport(ndc, TF_W, TF_H);
        return { x: s[0], y: s[1], w: clip[3], behind: clip[3] < TF_NEAR };
      });
      ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      cube.edges.forEach(function (e) {
        var a = projected[e[0]], b = projected[e[1]];
        if (a.behind || b.behind) return;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      });
      ctx.stroke();

      // The traced corner.
      var traced = projected[state.corner];
      if (!traced.behind) {
        ctx.beginPath();
        ctx.arc(traced.x, traced.y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffc061";
        ctx.lineWidth = 2.4;
        ctx.stroke();
        ctx.fillStyle = "rgba(255, 192, 97, 0.28)";
        ctx.fill();
        ctx.fillStyle = "#ffc061";
        ctx.font = "600 13px ui-monospace, monospace";
        ctx.fillText("v" + state.corner, traced.x + 13, traced.y - 10);
      }

      if (clipped.length) {
        ctx.fillStyle = "#ff77c8";
        ctx.font = "600 13px ui-monospace, monospace";
        ctx.fillText("near-plane clipping active — " + clipped.length + " face(s) cut", 20, TF_H - 22);
      }

      drawFrustumSlice();
      updateMatrix(m);
      updateJourney(m);
    }

    // A top-down slice of the camera and its frustum, in its own panel at a
    // size where near, far and field of view stop being three numbers in a
    // function call.
    function drawFrustumSlice() {
      var canvasEl = $("frustum-canvas");
      var W = 880, HH = 300;
      var ctx = prepare(canvasEl, W, HH);
      if (!ctx) return;
      ctx.fillStyle = "#060a12";
      ctx.fillRect(0, 0, W, HH);

      var eyeX = 90, eyeY = HH / 2;
      var span = Math.max(state.distance + 3.4, 8);
      var scale = (W - 150) / span;
      var halfAngle = (state.fov * Math.PI) / 360;

      if (state.projection === "perspective") {
        var spread = Math.tan(halfAngle) * span * scale;
        ctx.fillStyle = "rgba(87, 211, 238, 0.10)";
        ctx.beginPath();
        ctx.moveTo(eyeX, eyeY);
        ctx.lineTo(eyeX + span * scale, eyeY - spread);
        ctx.lineTo(eyeX + span * scale, eyeY + spread);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(87, 211, 238, 0.6)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = "#57d3ee";
        ctx.font = "600 12px ui-monospace, monospace";
        ctx.fillText(Math.round(state.fov) + "° field of view", eyeX + 24, eyeY - 16);
      } else {
        var halfHeight = Math.tan(halfAngle) * state.distance * scale;
        ctx.fillStyle = "rgba(87, 211, 238, 0.10)";
        ctx.fillRect(eyeX, eyeY - halfHeight, span * scale, halfHeight * 2);
        ctx.strokeStyle = "rgba(87, 211, 238, 0.6)";
        ctx.lineWidth = 1.4;
        ctx.strokeRect(eyeX, eyeY - halfHeight, span * scale, halfHeight * 2);
        ctx.fillStyle = "#57d3ee";
        ctx.font = "600 12px ui-monospace, monospace";
        ctx.fillText("orthographic — the sides stay parallel", eyeX + 24, eyeY - halfHeight - 12);
      }

      // The optical axis.
      ctx.strokeStyle = "rgba(150, 190, 205, 0.3)";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(eyeX, eyeY);
      ctx.lineTo(W - 30, eyeY);
      ctx.stroke();
      ctx.setLineDash([]);

      // The near plane, where w passes through the value the clipper cares about.
      ctx.strokeStyle = "#ff77c8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(eyeX + TF_NEAR * scale, eyeY - 52);
      ctx.lineTo(eyeX + TF_NEAR * scale, eyeY + 52);
      ctx.stroke();
      ctx.fillStyle = "#ff77c8";
      ctx.font = "600 12px ui-monospace, monospace";
      ctx.fillText("near = " + TF_NEAR, eyeX + TF_NEAR * scale + 8, eyeY - 58);

      // The cube, as the circle that encloses it.
      var cubeX = eyeX + state.distance * scale;
      var radius = Math.sqrt(3) * scale;
      var clipping = state.distance - Math.sqrt(3) < TF_NEAR;
      ctx.strokeStyle = clipping ? "#ff6f7d" : "rgba(79, 224, 139, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cubeX, eyeY, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = clipping ? "rgba(255, 111, 125, 0.10)" : "rgba(79, 224, 139, 0.08)";
      ctx.fill();
      ctx.fillStyle = clipping ? "#ff6f7d" : "#4fe08b";
      ctx.font = "600 12px ui-monospace, monospace";
      ctx.fillText(clipping ? "the cube crosses the near plane — clipping" : "the cube",
        cubeX - 26, eyeY + radius + 20);

      // The eye, and the distance to it.
      ctx.fillStyle = "#e9f1f4";
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#98adb8";
      ctx.font = "500 12px ui-monospace, monospace";
      ctx.fillText("eye", eyeX - 12, eyeY + 26);
      ctx.strokeStyle = "rgba(255, 192, 97, 0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(eyeX, eyeY + 62);
      ctx.lineTo(cubeX, eyeY + 62);
      ctx.stroke();
      ctx.fillStyle = "#ffc061";
      ctx.fillText("distance " + fmt(state.distance, 1), (eyeX + cubeX) / 2 - 42, eyeY + 78);

      ctx.fillStyle = "#6a7f8c";
      ctx.font = "500 11px ui-monospace, monospace";
      ctx.fillText("top-down slice — the camera is looking to the right", 16, HH - 14);
      canvasEl.setAttribute("aria-label",
        "Top-down slice: the eye on the left, a " + Math.round(state.fov) +
        " degree frustum opening to the right, the near plane at " + TF_NEAR +
        ", and the cube " + fmt(state.distance, 1) + " units away" +
        (clipping ? ", crossing the near plane so the clipper is cutting it." : "."));
    }

    function updateMatrix(m) {
      var matrix = m[state.matrix];
      var note = {
        model: "Where the object sits in the world: a rotation here, and nothing else. The bottom row is 0 0 0 1 — this matrix cannot change w.",
        view: "Where the camera is, expressed as the inverse: rather than moving the camera to the eye, move the whole world so the eye is at the origin looking down -z.",
        projection: "The bottom row is the entire trick. That -1 in the third column copies -z into w, so the divide that follows scales everything by its distance. In the orthographic matrix that row is 0 0 0 1, w stays 1, and nothing gets smaller with distance.",
        mvp: "All three, pre-multiplied. This is what a vertex shader actually uses: one matrix, one multiply, per corner.",
      }[state.matrix];
      $("matrix-note").textContent = note;

      for (var row = 0; row < 4; row++) {
        for (var col = 0; col < 4; col++) {
          var value = matrix[col * 4 + row];
          var cell = matrixCells[row * 4 + col];
          cell.textContent = fmt(value, Math.abs(value) >= 100 ? 1 : 2);
          var isIdentity = (row === col ? value === 1 : value === 0);
          cell.className = "matrix-cell" +
            (row === 3 && !(col === 3 && value === 1) && value !== 0 ? " is-w" : "") +
            (value === 0 ? " is-zero" : isIdentity ? "" : " is-live");
        }
      }
    }

    function updateJourney(m) {
      var p = cube.positions[state.corner];
      var world = G.apply(m.model, p);
      var eye = G.apply(m.view, world);
      var clip = G.apply(m.projection, eye);
      var ndc = G.perspectiveDivide(clip);
      var screen = G.viewport(ndc, TF_W, TF_H);
      var rows = [
        { space: "Object", v: p.concat([1]), current: false },
        { space: "World", v: world, current: false },
        { space: "View (eye)", v: eye, current: false },
        { space: "Clip", v: clip, current: true },
        { space: "NDC — ÷ w", v: [ndc[0], ndc[1], ndc[2], 1], current: true },
        { space: "Screen (px)", v: [screen[0], screen[1], screen[2], 1], current: false },
      ];
      var body = $("journey-body");
      clear(body);
      rows.forEach(function (row) {
        var tr = el("tr", row.current ? "is-current" : null);
        tr.appendChild(el("td", null, row.space));
        for (var c = 0; c < 4; c++) {
          tr.appendChild(el("td", c === 3 ? "w-cell" : null, fmt(row.v[c], 3)));
        }
        body.appendChild(tr);
      });
      $("transform-caption").textContent = state.projection === "perspective"
        ? "Drag to spin the cube. w on the traced corner is " + fmt(clip[3], 2) + " — its distance from the eye, and its divisor."
        : "Orthographic: w stays at 1, so nothing is divided and distance has no effect on size. Parallel lines stay parallel.";
    }

    function bindRange(id, key, format, dollyRole) {
      var input = $(id);
      var output = $(id + "-out");
      function apply() {
        state[key] = parseFloat(input.value);
        if (output) output.textContent = format(state[key]);
        if (dollyRole) applyDolly(dollyRole);
        draw();
      }
      input.addEventListener("input", apply);
      apply();
    }

    // Holding the subject's on-screen size means keeping
    // distance * tan(fov / 2) constant. Move either slider and the other
    // follows; the cube stays the same size and changes shape completely.
    function applyDolly(changed) {
      if (!state.dolly || dollySize === null) return;
      if (changed === "fov") {
        var distance = G.clamp(dollySize / Math.tan((state.fov * Math.PI) / 360), 1.6, 14);
        state.distance = distance;
        $("tf-distance").value = String(distance);
        $("tf-distance-out").textContent = fmt(distance, 1);
      } else {
        var half = Math.atan(dollySize / state.distance);
        var fov = G.clamp((half * 360) / Math.PI, 20, 110);
        state.fov = fov;
        $("tf-fov").value = String(fov);
        $("tf-fov-out").textContent = Math.round(fov) + "°";
      }
    }

    bindRange("tf-fov", "fov", function (v) { return Math.round(v) + "°"; }, "fov");
    bindRange("tf-distance", "distance", function (v) { return fmt(v, 1); }, "distance");
    bindRange("tf-yaw", "yaw", function (v) { return Math.round(v) + "°"; });
    bindRange("tf-pitch", "pitch", function (v) { return Math.round(v) + "°"; });

    $("tf-projection").addEventListener("change", function (e) {
      state.projection = e.target.value;
      var fovRow = $("tf-fov").closest(".control-row");
      if (fovRow) fovRow.querySelector("label").firstChild.textContent =
        state.projection === "perspective" ? "Field of view " : "Visible height ";
      draw();
    });
    $("tf-corner").addEventListener("change", function (e) { state.corner = parseInt(e.target.value, 10); draw(); });
    $("tf-matrix").addEventListener("change", function (e) { state.matrix = e.target.value; draw(); });
    $("tf-dolly").addEventListener("change", function (e) {
      state.dolly = e.target.checked;
      dollySize = state.dolly ? state.distance * Math.tan((state.fov * Math.PI) / 360) : null;
      draw();
    });

    // Keyboard equivalent for the drag: the cube must be spinnable without
    // a pointer, and the sliders alone do not make the canvas focusable.
    canvas.addEventListener("keydown", function (event) {
      var step = event.shiftKey ? 1 : 6;
      var yaw = 0, pitch = 0;
      if (event.key === "ArrowLeft") yaw = -step;
      else if (event.key === "ArrowRight") yaw = step;
      else if (event.key === "ArrowUp") pitch = step;
      else if (event.key === "ArrowDown") pitch = -step;
      else return;
      event.preventDefault();
      state.yaw = (state.yaw + yaw + 360) % 360;
      state.pitch = G.clamp(state.pitch + pitch, -80, 80);
      $("tf-yaw").value = String(state.yaw);
      $("tf-yaw-out").textContent = Math.round(state.yaw) + "°";
      $("tf-pitch").value = String(state.pitch);
      $("tf-pitch-out").textContent = Math.round(state.pitch) + "°";
      draw();
    });

    var dragStart = null;
    onDrag(canvas, TF_W, TF_H, {
      start: function (p) { dragStart = { p: p, yaw: state.yaw, pitch: state.pitch }; },
      move: function (p) {
        if (!dragStart) return;
        state.yaw = dragStart.yaw + (p.x - dragStart.p.x) * 0.4;
        while (state.yaw < 0) state.yaw += 360;
        state.yaw = state.yaw % 360;
        state.pitch = G.clamp(dragStart.pitch + (p.y - dragStart.p.y) * -0.3, -80, 80);
        $("tf-yaw").value = String(state.yaw);
        $("tf-yaw-out").textContent = Math.round(state.yaw) + "°";
        $("tf-pitch").value = String(state.pitch);
        $("tf-pitch-out").textContent = Math.round(state.pitch) + "°";
        draw();
      },
      end: function () { dragStart = null; },
    });

    registerPanel("transform", draw);
    draw();
  }

  // ==========================================================
  // 04 — RASTERIZE: three edge functions, asked of every pixel
  // ==========================================================
  var RS_W = 720, RS_H = 520;

  function initRaster() {
    var canvas = $("raster-canvas");
    if (!canvas) return;
    var state = {
      mode: "coverage", res: 24, fillRule: true, cull: false, selected: 0,
      // In grid units, so the triangle keeps its shape when the resolution changes.
      verts: [{ x: 0.16, y: 0.18 }, { x: 0.86, y: 0.36 }, { x: 0.33, y: 0.88 }],
      fourth: { x: 0.10, y: 0.80 },
    };

    var picker = $("rs-picker");
    ["v0", "v1", "v2"].forEach(function (name, i) {
      var button = el("button", null, name);
      button.type = "button";
      button.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      button.addEventListener("click", function () {
        state.selected = i;
        updatePicker();
        canvas.focus();
        draw();
      });
      picker.appendChild(button);
    });

    function updatePicker() {
      var buttons = picker.querySelectorAll("button");
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute("aria-pressed", i === state.selected ? "true" : "false");
      }
    }

    function grid() {
      var gx = state.res;
      var gy = Math.max(4, Math.round(gx * (RS_H / RS_W)));
      return { gx: gx, gy: gy, cw: RS_W / gx, ch: RS_H / gy };
    }

    function screenVerts(g) {
      return state.verts.map(function (v) { return { x: v.x * g.gx, y: v.y * g.gy }; });
    }

    function draw() {
      var ctx = prepare(canvas, RS_W, RS_H);
      if (!ctx) return;
      var g = grid();
      var verts = screenVerts(g);
      ctx.fillStyle = "#060a12";
      ctx.fillRect(0, 0, RS_W, RS_H);

      var stats = { tested: 0, covered: 0, doubled: 0 };
      var counts = new Int32Array(g.gx * g.gy);

      var bounds = boundingBox(verts, g);
      stats.tested = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);

      if (state.mode === "edges") drawEdgeField(ctx, g, verts);

      var opts = {
        width: g.gx, height: g.gy,
        fillRule: state.fillRule,
        cull: state.cull ? "back" : "none",
        samples: state.mode === "msaa" ? G.MSAA4 : undefined,
      };

      var result = G.rasterTriangle(verts[0], verts[1], verts[2], opts, function (x, y, bary, info) {
        counts[y * g.gx + x]++;
        stats.covered++;
        paintCell(ctx, g, x, y, bary, info, "#4fe08b");
      });

      if (state.mode === "shared") {
        var fourth = { x: state.fourth.x * g.gx, y: state.fourth.y * g.gy };
        G.rasterTriangle(verts[0], verts[2], fourth, opts, function (x, y, bary, info) {
          var i = y * g.gx + x;
          counts[i]++;
          if (counts[i] > 1) {
            stats.doubled++;
            paintCell(ctx, g, x, y, bary, info, "#ff6f7d");
          } else {
            stats.covered++;
            paintCell(ctx, g, x, y, bary, info, "#a99bff");
          }
        });
        drawOutline(ctx, [verts[0], verts[2], fourth], g, "rgba(169, 155, 255, 0.75)");
      }

      drawGrid(ctx, g);
      drawOutline(ctx, verts, g, result.culled ? "rgba(255, 111, 125, 0.8)" : "rgba(255, 255, 255, 0.55)");
      drawHandles(ctx, verts, g);
      updateStats(stats, result, g);
    }

    // The rasterizer snaps to the sub-pixel grid BEFORE taking its bounding
    // box, so the box must be computed the same way or the hit rate is
    // measured against work that was never done.
    function boundingBox(verts, g) {
      var snap = function (v) { return Math.round(v * G.SUB) / G.SUB; };
      var xs = verts.map(function (v) { return snap(v.x); });
      var ys = verts.map(function (v) { return snap(v.y); });
      return {
        minX: Math.max(0, Math.floor(Math.min.apply(null, xs))),
        maxX: Math.min(g.gx - 1, Math.ceil(Math.max.apply(null, xs))),
        minY: Math.max(0, Math.floor(Math.min.apply(null, ys))),
        maxY: Math.min(g.gy - 1, Math.ceil(Math.max.apply(null, ys))),
      };
    }

    function paintCell(ctx, g, x, y, bary, info, base) {
      var px = x * g.cw, py = y * g.ch;
      if (state.mode === "bary") {
        var r = G.clamp(bary[0], 0, 1), gg = G.clamp(bary[1], 0, 1), b = G.clamp(bary[2], 0, 1);
        ctx.fillStyle = "rgb(" + Math.round(40 + r * 215) + "," + Math.round(40 + gg * 215) + "," + Math.round(60 + b * 195) + ")";
        ctx.fillRect(px, py, g.cw - 0.6, g.ch - 0.6);
        if (g.cw > 40) {
          ctx.fillStyle = "rgba(6, 10, 18, 0.85)";
          ctx.font = "600 9px ui-monospace, monospace";
          ctx.fillText(fmt(bary[0], 2), px + 3, py + 12);
          ctx.fillText(fmt(bary[1], 2), px + 3, py + 22);
          ctx.fillText(fmt(bary[2], 2), px + 3, py + 32);
        }
        return;
      }
      if (state.mode === "msaa") {
        ctx.fillStyle = "rgba(79, 224, 139, " + (0.16 + info.coverage * 0.66) + ")";
        ctx.fillRect(px, py, g.cw - 0.6, g.ch - 0.6);
        for (var s = 0; s < G.MSAA4.length; s++) {
          var covered = (info.mask & (1 << s)) !== 0;
          ctx.beginPath();
          ctx.arc(px + G.MSAA4[s][0] * g.cw, py + G.MSAA4[s][1] * g.ch, Math.max(1.2, g.cw * 0.055), 0, Math.PI * 2);
          ctx.fillStyle = covered ? "#e9f1f4" : "rgba(120, 150, 170, 0.5)";
          ctx.fill();
        }
        return;
      }
      ctx.fillStyle = base === "#4fe08b" ? "rgba(79, 224, 139, 0.72)"
        : base === "#ff6f7d" ? "rgba(255, 111, 125, 0.85)"
        : "rgba(169, 155, 255, 0.62)";
      ctx.fillRect(px, py, g.cw - 0.6, g.ch - 0.6);
    }

    // The three half-planes, drawn as fields, so "positive on the inside"
    // stops being a phrase and becomes a picture.
    function drawEdgeField(ctx, g, verts) {
      var pairs = [[1, 2], [2, 0], [0, 1]];
      var bounds = boundingBox(verts, g);
      for (var y = bounds.minY; y <= bounds.maxY; y++) {
        for (var x = bounds.minX; x <= bounds.maxX; x++) {
          var passes = 0;
          for (var e = 0; e < 3; e++) {
            var a = verts[pairs[e][0]], b = verts[pairs[e][1]];
            var value = G.edge(a.x, a.y, b.x, b.y, x + 0.5, y + 0.5);
            if (value > 0) passes++;
          }
          if (passes === 3) continue;
          ctx.fillStyle = ["rgba(255, 111, 125, 0.10)", "rgba(255, 111, 125, 0.20)", "rgba(255, 192, 97, 0.30)"][passes];
          ctx.fillRect(x * g.cw, y * g.ch, g.cw - 0.6, g.ch - 0.6);
          if (g.cw > 34) {
            ctx.fillStyle = "rgba(233, 241, 244, 0.5)";
            ctx.font = "600 10px ui-monospace, monospace";
            ctx.fillText(passes + "/3", x * g.cw + 4, y * g.ch + 14);
          }
        }
      }
      // The edge lines themselves, extended across the whole canvas.
      var colours = ["#ff77c8", "#57d3ee", "#ffc061"];
      pairs.forEach(function (pair, i) {
        var a = verts[pair[0]], b = verts[pair[1]];
        var dx = b.x - a.x, dy = b.y - a.y;
        var len = Math.hypot(dx, dy) || 1;
        var far = 200;
        ctx.strokeStyle = colours[i];
        ctx.globalAlpha = 0.4;
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo((a.x - (dx / len) * far) * g.cw, (a.y - (dy / len) * far) * g.ch);
        ctx.lineTo((b.x + (dx / len) * far) * g.cw, (b.y + (dy / len) * far) * g.ch);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      });
    }

    function drawGrid(ctx, g) {
      ctx.strokeStyle = "rgba(150, 190, 205, 0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = 0; x <= g.gx; x++) { ctx.moveTo(x * g.cw, 0); ctx.lineTo(x * g.cw, RS_H); }
      for (var y = 0; y <= g.gy; y++) { ctx.moveTo(0, y * g.ch); ctx.lineTo(RS_W, y * g.ch); }
      ctx.stroke();
      if (g.cw > 18 && state.mode !== "msaa") {
        ctx.fillStyle = "rgba(150, 190, 205, 0.35)";
        for (var cy = 0; cy < g.gy; cy++) {
          for (var cx = 0; cx < g.gx; cx++) {
            ctx.fillRect(cx * g.cw + g.cw / 2 - 0.75, cy * g.ch + g.ch / 2 - 0.75, 1.5, 1.5);
          }
        }
      }
    }

    function drawOutline(ctx, verts, g, colour) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(verts[0].x * g.cw, verts[0].y * g.ch);
      ctx.lineTo(verts[1].x * g.cw, verts[1].y * g.ch);
      ctx.lineTo(verts[2].x * g.cw, verts[2].y * g.ch);
      ctx.closePath();
      ctx.stroke();
    }

    function drawHandles(ctx, verts, g) {
      verts.forEach(function (v, i) {
        var x = v.x * g.cw, y = v.y * g.ch;
        ctx.beginPath();
        ctx.arc(x, y, i === state.selected ? 11 : 8, 0, Math.PI * 2);
        ctx.fillStyle = i === state.selected ? "rgba(255, 192, 97, 0.35)" : "rgba(6, 10, 18, 0.75)";
        ctx.fill();
        ctx.strokeStyle = i === state.selected ? "#ffc061" : "#e9f1f4";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#e9f1f4";
        ctx.font = "600 12px ui-monospace, monospace";
        ctx.fillText("v" + i, x + 13, y - 11);
      });
    }

    function updateStats(stats, result, g) {
      var list = $("raster-stats");
      clear(list);
      stat(list, "Samples in box", group(stats.tested));
      stat(list, "Covered", group(stats.covered));
      stat(list, "Hit rate", stats.tested ? Math.round((stats.covered / stats.tested) * 100) + "%" : "—");
      // rasterTriangle works in 1/16-pixel fixed point, so its raw area is
      // scaled by 16 x 16. Divide it out and the number becomes checkable:
      // twice the area should be about twice the covered-cell count.
      stat(list, "Signed area × 2", fmt(result.area2 / (G.SUB * G.SUB), 1) + " px²");
      stat(list, "Facing", result.area2 > 0 ? "front" : "back", result.culled);
      if (state.mode === "shared") {
        stat(list, "Double-covered", group(stats.doubled), stats.doubled > 0);
      }

      var explain = {
        coverage: "The green cells are the ones where all three edge functions came out positive. Everything inside the bounding box was asked; the hit rate is how much of that work was wasted — and it is why hardware tests whole tiles at once before descending to single pixels.",
        edges: "Each edge's dashed line is the boundary of its half-plane. A cell's label counts how many of the three tests it passed: only 3 out of 3 is inside. Notice that the three lines carve the whole plane into seven regions, and exactly one of them is the triangle.",
        bary: "The three weights are the areas of the three sub-triangles you get by joining the pixel to the corners, divided by the whole area. They always sum to 1, and they are how every attribute — colour, texture coordinates, normals — gets from the corners to the pixel.",
        msaa: "Coverage is now measured at four sub-positions per pixel, on a rotated grid so that near-horizontal and near-vertical edges both get intermediate values. The shader still runs once per pixel; only the coverage is finer, which is what makes multisampling so much cheaper than supersampling.",
        shared: "Two triangles meeting along v0-v2. Red would mean a pixel covered by both — which would blend twice and show as a seam through anything transparent. Turn the top-left rule off and drag a corner until the shared edge passes through pixel centres.",
      }[state.mode];
      $("raster-explain").textContent = explain;

      $("rs-res-out").textContent = g.gx + " × " + g.gy;
      canvas.setAttribute("aria-label",
        "A " + g.gx + " by " + g.gy + " pixel grid with a triangle across it. " +
        group(stats.covered) + " of " + group(stats.tested) + " sampled pixels are covered" +
        (result.culled ? ", but the triangle is back-facing and has been culled." : "."));
      $("raster-caption").textContent = result.culled
        ? "This triangle is wound the other way, so backface culling has discarded it — no pixels tested at all."
        : "Drag a corner. Or select one below and nudge it with the arrow keys.";
    }

    // --- interaction ---
    function nearestVertex(p, g) {
      var best = -1, bestDistance = Infinity;
      state.verts.forEach(function (v, i) {
        var d = Math.hypot(v.x * g.cw - p.x, v.y * g.ch - p.y);
        if (d < bestDistance) { bestDistance = d; best = i; }
      });
      return bestDistance < 48 ? best : -1;
    }

    onDrag(canvas, RS_W, RS_H, {
      start: function (p) {
        var g = grid();
        var index = nearestVertex(p, g);
        if (index < 0) return false;
        state.selected = index;
        updatePicker();
        return true;
      },
      move: function (p) {
        var g = grid();
        state.verts[state.selected] = {
          x: G.clamp(p.x / g.cw, 0.02, g.gx - 0.02) / g.gx,
          y: G.clamp(p.y / g.ch, 0.02, g.gy - 0.02) / g.gy,
        };
        draw();
      },
    });

    canvas.addEventListener("keydown", function (event) {
      var step = event.shiftKey ? 0.004 : 0.02;
      var dx = 0, dy = 0;
      if (event.key === "ArrowLeft") dx = -step;
      else if (event.key === "ArrowRight") dx = step;
      else if (event.key === "ArrowUp") dy = -step;
      else if (event.key === "ArrowDown") dy = step;
      else if (event.key === "Tab") return;
      else return;
      event.preventDefault();
      var v = state.verts[state.selected];
      state.verts[state.selected] = { x: G.clamp(v.x + dx, 0, 1), y: G.clamp(v.y + dy, 0, 1) };
      draw();
    });

    var nudge = $("rs-nudge");
    if (nudge) {
      var DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      Array.prototype.forEach.call(nudge.querySelectorAll("button"), function (button) {
        button.addEventListener("click", function () {
          var d = DIRECTIONS[button.getAttribute("data-nudge")];
          var v = state.verts[state.selected];
          state.verts[state.selected] = {
            x: G.clamp(v.x + d[0] * 0.02, 0, 1),
            y: G.clamp(v.y + d[1] * 0.02, 0, 1),
          };
          draw();
        });
      });
    }

    $("rs-mode").addEventListener("change", function (e) {
      state.mode = e.target.value;
      // The top-left rule only does anything when the shared edge passes
      // through pixel centres. Asking the reader to hunt for that condition
      // is asking them to conclude the control does nothing, so snap the
      // shared edge onto centres the moment the mode is selected.
      if (state.mode === "shared") {
        var g = grid();
        var snapCentre = function (v) {
          return {
            x: (Math.round(v.x * g.gx - 0.5) + 0.5) / g.gx,
            y: (Math.round(v.y * g.gy - 0.5) + 0.5) / g.gy,
          };
        };
        state.verts[0] = snapCentre(state.verts[0]);
        state.verts[2] = snapCentre(state.verts[2]);
      }
      draw();
    });
    $("rs-res").addEventListener("input", function (e) { state.res = parseInt(e.target.value, 10); draw(); });
    $("rs-fillrule").addEventListener("change", function (e) { state.fillRule = e.target.checked; draw(); });
    $("rs-cull").addEventListener("change", function (e) { state.cull = e.target.checked; draw(); });

    registerPanel("raster", draw);
    draw();
  }

  // ==========================================================
  // 05 — DEPTH: painter's algorithm, the z-buffer, and precision
  // ==========================================================
  var DP_W = 520, DP_H = 420;

  function initDepth() {
    var canvas = $("depth-canvas");
    var painterCanvas = $("depth-painter-canvas");
    var bufferCanvas = $("depth-buffer-canvas");
    if (!canvas || !painterCanvas || !bufferCanvas) return;
    var state = { scene: "intersect", near: 0.1, bits: "24", showBuffer: false };
    var FAR = 200;
    var RES_X = 150;
    var RES_Y = Math.round(RES_X * (DP_H / DP_W));
    var painterBuffer = new Framebuffer(RES_X, RES_Y);
    var zBuffer = new Framebuffer(RES_X, RES_Y);
    var depthView = new Framebuffer(RES_X, RES_Y);

    // Each scene is a list of quads in world space with a colour.
    function scene() {
      if (state.scene === "intersect") {
        // Two panels tilted about different axes, so the line where they
        // cross runs diagonally through both. Any per-object sort has to
        // put one wholly in front of the other, and both answers are wrong.
        return [
          { colour: [0.30, 0.85, 0.55], quad: [[-1.6, -1.2, -4.2], [1.6, -1.2, -5.6], [1.6, 1.2, -5.6], [-1.6, 1.2, -4.2]] },
          { colour: [0.95, 0.45, 0.75], quad: [[-1.4, -1.4, -5.4], [1.4, -1.4, -5.4], [1.4, 1.4, -4.2], [-1.4, 1.4, -4.2]] },
        ];
      }
      if (state.scene === "cycle") {
        // Three bars laid on the edges of a triangle. Each bar comes
        // forward towards its far end, so at every corner the bar that
        // ends there is in front of the bar that starts there:
        // A is in front of B, B of C, and C of A. No order can paint it.
        var corners = [0, 1, 2].map(function (i) {
          var angle = (Math.PI / 2) + (i * 2 * Math.PI) / 3;
          return [Math.cos(angle) * 1.25, Math.sin(angle) * 1.25];
        });
        var colours = [[0.32, 0.86, 0.56], [0.36, 0.78, 0.98], [1.0, 0.72, 0.36]];
        return [0, 1, 2].map(function (i) {
          var a = corners[i], b = corners[(i + 1) % 3];
          var dx = b[0] - a[0], dy = b[1] - a[1];
          var len = Math.hypot(dx, dy) || 1;
          var ux = dx / len, uy = dy / len;
          var half = 0.26, over = 0.26;
          var ax = a[0] - ux * over, ay = a[1] - uy * over;
          var bx = b[0] + ux * over, by = b[1] + uy * over;
          var zA = -5.3, zB = -4.4;
          return {
            colour: colours[i],
            quad: [
              [ax - uy * half, ay + ux * half, zA],
              [bx - uy * half, by + ux * half, zB],
              [bx + uy * half, by - ux * half, zB],
              [ax + uy * half, ay - ux * half, zA],
            ],
          };
        });
      }
      // A sign standing 2 cm off a wall 30 m away. Whether the buffer can
      // tell them apart is entirely a question of format and near plane.
      return [
        { colour: [0.26, 0.34, 0.48], quad: [[-9, -6, -30], [9, -6, -30], [9, 6, -30], [-9, 6, -30]] },
        { colour: [1.0, 0.62, 0.32], quad: [[-3.2, -2.2, -29.98], [3.2, -2.2, -29.98], [3.2, 2.2, -29.98], [-3.2, 2.2, -29.98]] },
      ];
    }

    // Quantise a depth value the way the chosen buffer format would.
    function quantise(ndcZ) {
      if (state.bits === "rev") {
        // Reversed range in a 32-bit float: near maps to 1, far to 0, and
        // float's own exponent spacing then lines up with the projection's.
        return Math.fround(1 - (ndcZ * 0.5 + 0.5));
      }
      var codes = state.bits === "16" ? 65535 : 16777215;
      return Math.round(G.clamp(ndcZ * 0.5 + 0.5, 0, 1) * codes);
    }

    // Reversed depth counts the other way, so "nearer" is "greater".
    function nearer(a, b) { return state.bits === "rev" ? a > b : a < b; }
    var EMPTY = function () { return state.bits === "rev" ? -Infinity : Infinity; };

    function centroidDepth(quad) {
      var sum = 0;
      for (var i = 0; i < quad.length; i++) sum += quad[i][2];
      return sum / quad.length;
    }

    // One render of the scene under one hidden-surface algorithm.
    function render(algorithm, target) {
      var view = G.lookAt([0, 0, 0], [0, 0, -1], [0, 1, 0]);
      var proj = G.perspective(Math.PI / 3.9, DP_W / DP_H, state.near, FAR);
      var mvp = G.multiply(proj, view);

      target.reset(6, 10, 18);
      var stored = new Float64Array(RES_X * RES_Y).fill(EMPTY());
      var raw = new Float64Array(RES_X * RES_Y).fill(Infinity);
      var counters = { fragments: 0, rejected: 0, ties: 0 };

      var quads = scene();
      var order = quads.map(function (q, i) { return i; });
      if (algorithm === "painter") {
        // Sort by the centre of each quad, which is the best a per-object
        // sort can do — and is exactly what fails.
        order.sort(function (a, b) {
          return centroidDepth(quads[b].quad) - centroidDepth(quads[a].quad);
        });
      }

      order.forEach(function (index) {
        var q = quads[index];
        var screen = q.quad.map(function (p) {
          var clip = G.apply(mvp, p);
          var ndc = G.perspectiveDivide(clip);
          var s = G.viewport(ndc, RES_X, RES_Y);
          return { x: s[0], y: s[1], z: s[2] };
        });
        [[0, 1, 2], [0, 2, 3]].forEach(function (tri) {
          var a = screen[tri[0]], b = screen[tri[1]], c = screen[tri[2]];
          G.rasterTriangle(a, b, c, { width: RES_X, height: RES_Y }, function (x, y, bary) {
            var z = G.interpolateDepth(bary, a.z, b.z, c.z);
            var code = quantise(z);
            var i = y * RES_X + x;
            counters.fragments++;
            if (algorithm === "zbuffer") {
              if (stored[i] !== EMPTY()) {
                if (code === stored[i]) counters.ties++;
                if (!nearer(code, stored[i])) { counters.rejected++; return; }
              }
              stored[i] = code;
            }
            raw[i] = z;
            var shade = 0.5 + 0.5 * (1 - G.clamp((z * 0.5 + 0.5 - 0.5) * 2, 0, 1));
            target.set(x, y, [q.colour[0] * shade, q.colour[1] * shade, q.colour[2] * shade]);
          });
        });
      });
      return { counters: counters, raw: raw };
    }

    function draw() {
      var ctx = prepare(canvas, DP_W, DP_H);
      var pctx = prepare(painterCanvas, DP_W, DP_H);
      if (!ctx || !pctx) return;

      render("painter", painterBuffer);
      var z = render("zbuffer", zBuffer);

      painterBuffer.blit(pctx, 0, 0, DP_W, DP_H);
      zBuffer.blit(ctx, 0, 0, DP_W, DP_H);

      var card = $("depth-buffer-card");
      if (card) card.classList.toggle("is-hidden", !state.showBuffer);
      var range = { lo: Infinity, hi: -Infinity };
      if (state.showBuffer) range = drawDepthBuffer(z.raw);

      updateDepthStats(z.counters, range);
      drawPrecision();
      updateDepthLabels(z.counters, range);
    }

    // The stored values all crowd against 1.0 — that IS the nonlinearity,
    // and shown literally the buffer is a white rectangle. Stretch the
    // occupied range for legibility and report the real numbers as text.
    function drawDepthBuffer(raw) {
      var bctx = prepare(bufferCanvas, DP_W, DP_H);
      if (!bctx) return { lo: Infinity, hi: -Infinity };
      var lo = Infinity, hi = -Infinity;
      for (var m = 0; m < raw.length; m++) {
        if (raw[m] === Infinity) continue;
        var d = raw[m] * 0.5 + 0.5;
        if (d < lo) lo = d;
        if (d > hi) hi = d;
      }
      var span = hi - lo;
      for (var i = 0; i < raw.length; i++) {
        var g = 0;
        if (raw[i] !== Infinity) {
          var normalised = raw[i] * 0.5 + 0.5;
          // Nearer is brighter, which is the convention people expect.
          g = span > 1e-9 ? G.clamp(1 - (normalised - lo) / span, 0, 1) * 0.92 + 0.08 : 0.6;
        }
        depthView.colour[i * 4] = g * 255;
        depthView.colour[i * 4 + 1] = g * 255;
        depthView.colour[i * 4 + 2] = g * 255;
        depthView.colour[i * 4 + 3] = 255;
      }
      depthView.blit(bctx, 0, 0, DP_W, DP_H);
      return { lo: lo, hi: hi, span: span };
    }

    function updateDepthLabels(counters, range) {
      var text = $("depth-buffer-range");
      if (text) {
        text.textContent = range.lo === Infinity
          ? "Nothing has been written to the buffer."
          : "Holds " + range.lo.toFixed(6) + " … " + range.hi.toFixed(6) +
            " — the top " + (range.span * 100).toFixed(4) + "% of the range, stretched ×" +
            group(range.span > 0 ? 1 / range.span : 1) + " here to be visible at all.";
      }
      var format = state.bits === "rev" ? "32-bit float, reversed" : state.bits + "-bit fixed";
      var sceneName = { intersect: "two intersecting panels", cycle: "three panels in a cycle", decal: "a sign 2 cm in front of a distant wall" }[state.scene];
      canvas.setAttribute("aria-label",
        "Z-buffered render of " + sceneName + " at " + format + ", near plane " + fmt(state.near, 2) +
        ". " + group(counters.rejected) + " fragments were rejected by the depth test" +
        (counters.ties ? " and " + group(counters.ties) + " tied exactly with what was already there." : "."));
      painterCanvas.setAttribute("aria-label",
        "The same " + sceneName + ", drawn by sorting the panels on their centres and painting back to front.");
      bufferCanvas.setAttribute("aria-label",
        range.lo === Infinity ? "An empty depth buffer."
          : "The depth buffer, stretched for visibility. It holds values from " +
            range.lo.toFixed(4) + " to " + range.hi.toFixed(4) + ".");
    }

    function updateDepthStats(counters, range) {
      var list = $("depth-stats");
      clear(list);
      var wallDistance = state.scene === "decal" ? 30 : 4.8;
      var resolution = state.bits === "rev"
        ? null
        : G.depthResolution(wallDistance, state.near, FAR, state.bits === "16" ? 16 : 24);
      stat(list, "Fragments", group(counters.fragments));
      stat(list, "Depth-rejected", group(counters.rejected));
      stat(list, "Exact ties", group(counters.ties), counters.ties > 0);
      if (resolution === null) {
        // Not uniform — proportional to distance, which is a different and
        // much better thing than proportional to distance squared.
        resolution = Math.pow(2, -23) * wallDistance * Math.max(1e-6, 1 - wallDistance / FAR);
      }
      stat(list, "Resolvable at " + wallDistance + " m",
        (resolution >= 0.01 ? fmt(resolution, 3) + " m" : resolution >= 1e-5 ? (resolution * 1000).toFixed(2) + " mm" : (resolution * 1e6).toFixed(1) + " µm"),
        state.bits !== "rev" && state.scene === "decal" && resolution > 0.02);

      var explain = {
        intersect: "The two panels pass through each other, so no single order is right for the whole surface. On the left one panel wins everywhere and the line where they actually cross is never drawn. On the right each pixel settled it for itself, and the diagonal seam is real geometry.",
        cycle: "Three bars, each in front of the next and behind the one after. There is no ordering of three objects that paints this correctly — the relation is a cycle, and a sort needs an ordering. Splitting the bars until no pair overlaps would work, which is exactly what a BSP tree does and why Doom built one at compile time.",
        decal: "Here the sort is right by construction, so the left-hand image is correct and the interesting failure is on the right. The sign stands 2 cm in front of a wall 30 m away; at 16 bits with the near plane at a tenth of a metre one depth code covers about 14 cm, so both surfaces quantise to the same number, the sign loses the test everywhere, and it vanishes. Nothing is wrong with the geometry — the buffer cannot count that finely. Drag the near plane outwards, or switch to 24-bit, and it comes back. In a moving scene the tie breaks differently frame to frame, and that flicker is what people mean by z-fighting.",
      }[state.scene];
      $("depth-explain").textContent = explain;
    }

    // The precision curve: how far apart two surfaces must be, at a given
    // distance, before the buffer can tell them apart.
    function drawPrecision() {
      var canvasEl = $("precision-canvas");
      var W = 900, H = 280;
      var ctx = prepare(canvasEl, W, H);
      if (!ctx) return;
      var padL = 74, padR = 24, padT = 22, padB = 46;
      var plotW = W - padL - padR, plotH = H - padT - padB;

      ctx.fillStyle = "#060a12";
      ctx.fillRect(0, 0, W, H);

      var minZ = Math.max(state.near, 0.05), maxZ = 120;
      var minY = 1e-6, maxY = 10;
      function px(z) { return padL + (Math.log10(z / minZ) / Math.log10(maxZ / minZ)) * plotW; }
      function py(v) {
        var t = (Math.log10(G.clamp(v, minY, maxY)) - Math.log10(minY)) / (Math.log10(maxY) - Math.log10(minY));
        return padT + (1 - t) * plotH;
      }

      ctx.strokeStyle = "rgba(150, 190, 205, 0.14)";
      ctx.lineWidth = 1;
      ctx.font = "500 11px ui-monospace, monospace";
      [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1, 10].forEach(function (v) {
        var y = py(v);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = "#98adb8";
        ctx.fillText(v >= 1 ? v + " m" : v >= 0.001 ? (v * 1000) + " mm" : (v * 1e6) + " µm", 6, y + 4);
      });
      [0.1, 1, 10, 100].forEach(function (z) {
        if (z < minZ) return;
        var x = px(z);
        ctx.strokeStyle = "rgba(150, 190, 205, 0.14)";
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
        ctx.fillStyle = "#98adb8";
        ctx.fillText(z + " m", x - 10, H - padB + 18);
      });

      var series = [
        { bits: 16, colour: "#ff6f7d", label: "16-bit fixed" },
        { bits: 24, colour: "#57d3ee", label: "24-bit fixed" },
        { bits: 32, colour: "#4fe08b", label: "32-bit float, reversed" },
      ];
      var selected = state.bits === "rev" ? 32 : parseInt(state.bits, 10);
      series.forEach(function (sr) {
        ctx.strokeStyle = sr.colour;
        ctx.lineWidth = sr.bits === selected ? 2.6 : 1.3;
        ctx.globalAlpha = sr.bits === selected ? 1 : 0.5;
        ctx.beginPath();
        for (var i = 0; i <= 220; i++) {
          var z = minZ * Math.pow(maxZ / minZ, i / 220);
          var value = sr.bits === 32
            // Reversed float depth stores n(f - z) / ((f - n)z), whose
            // float ulp works out at 2^-23 * z * (1 - z/f). Dropping the
            // second factor overstates the error near the far plane,
            // which is precisely where reversed-Z is at its best.
            ? Math.pow(2, -23) * z * Math.max(1e-6, 1 - z / FAR)
            : G.depthResolution(z, state.near, FAR, sr.bits);
          var x = px(z), y = py(value);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      var legendX = padL + 14, legendY = padT + 16;
      series.forEach(function (sr, i) {
        ctx.fillStyle = sr.colour;
        ctx.fillRect(legendX, legendY + i * 17 - 8, 12, 3);
        ctx.fillStyle = "#98adb8";
        ctx.font = "500 11px ui-monospace, monospace";
        ctx.fillText(sr.label, legendX + 20, legendY + i * 17 - 2);
      });
      ctx.fillStyle = "#98adb8";
      ctx.fillText("distance from the eye  (log)", W - padR - 190, H - 10);
      ctx.save();
      ctx.translate(16, padT + plotH / 2 + 74);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("smallest separation the buffer can resolve  (log)", 0, 0);
      ctx.restore();
      ctx.fillStyle = "#ffc061";
      ctx.fillText("near plane = " + fmt(state.near, 2) + " m", padL + 14, H - padB - 12);
      canvasEl.setAttribute("aria-label",
        "Depth precision against distance, near plane " + fmt(state.near, 2) +
        " metres. Fixed-point precision degrades with the square of distance; reversed float depth stays roughly constant.");
    }

    $("dp-scene").addEventListener("change", function (e) { state.scene = e.target.value; draw(); });
    $("dp-bits").addEventListener("change", function (e) { state.bits = e.target.value; draw(); });
    $("dp-showbuffer").addEventListener("change", function (e) { state.showBuffer = e.target.checked; draw(); });
    $("dp-near").addEventListener("input", function (e) {
      state.near = parseFloat(e.target.value);
      $("dp-near-out").textContent = fmt(state.near, 2);
      draw();
    });

    registerPanel("depth", draw);
    draw();
  }

  // ==========================================================
  // 06 — TEXTURE: the swimming floor, and the shimmering one
  // ==========================================================
  var TX_W = 512, TX_H = 320;

  function initTexture() {
    var canvas = $("texture-canvas");
    if (!canvas) return;
    var state = { perspective: true, filter: "bilinear", mip: "tri", height: 1, pitch: 10, splits: 1, creep: false };
    var MAX_ANISO = 8;
    var creepPhase = 0;
    var creepTimer = null;
    var RES_X = 256;
    var RES_Y = Math.round(RES_X * (TX_H / TX_W));
    var fb = new Framebuffer(RES_X, RES_Y);

    // A checkerboard with a bright rule down every seam: the seams are
    // the high frequency that aliases, so they make the point loudly.
    var TEX_SIZE = 128;
    var base = G.checkerTexture(TEX_SIZE, [0.82, 0.80, 0.74], [0.09, 0.13, 0.22], 8);
    (function addSeams() {
      var cell = TEX_SIZE / 8;
      for (var y = 0; y < TEX_SIZE; y++) {
        for (var x = 0; x < TEX_SIZE; x++) {
          if (x % cell === 0 || y % cell === 0) {
            var i = (y * TEX_SIZE + x) * 3;
            base.data[i] = 0.95; base.data[i + 1] = 0.42; base.data[i + 2] = 0.30;
          }
        }
      }
    })();
    var levels = G.buildMipChain(base);
    var LOD_COLOURS = [
      [0.30, 0.88, 0.55], [0.34, 0.80, 0.95], [0.66, 0.60, 1.0], [1.0, 0.72, 0.36],
      [1.0, 0.46, 0.78], [0.95, 0.30, 0.34], [0.55, 0.95, 0.85], [0.7, 0.7, 0.7],
    ];

    buildMipStrip();

    function buildMipStrip() {
      var strip = $("mip-levels");
      if (!strip) return;
      clear(strip);
      levels.forEach(function (level, index) {
        if (level.size < 4) return;
        var wrap = el("div", "mip-level");
        var c = document.createElement("canvas");
        c.width = level.size;
        c.height = level.size;
        var size = Math.max(24, 128 / Math.pow(1.55, index));
        c.style.width = Math.round(size) + "px";
        c.style.height = Math.round(size) + "px";
        var cctx = c.getContext("2d");
        var image = cctx.createImageData(level.size, level.size);
        for (var i = 0; i < level.size * level.size; i++) {
          image.data[i * 4] = G.linearToSrgb(level.data[i * 3]) * 255;
          image.data[i * 4 + 1] = G.linearToSrgb(level.data[i * 3 + 1]) * 255;
          image.data[i * 4 + 2] = G.linearToSrgb(level.data[i * 3 + 2]) * 255;
          image.data[i * 4 + 3] = 255;
        }
        cctx.putImageData(image, 0, 0);
        wrap.appendChild(c);
        wrap.appendChild(el("span", null, "L" + index + " · " + level.size + "²"));
        strip.appendChild(wrap);
      });
    }

    function floorQuads() {
      // The floor, optionally chopped into a grid of smaller quads. More
      // pieces means each piece spans less depth — which is precisely how
      // affine texturing was made bearable before hardware could divide.
      var n = state.splits;
      var out = [];
      var nearZ = -1.2, farZ = -34;
      var halfX = 16;
      for (var i = 0; i < n; i++) {
        for (var j = 0; j < n; j++) {
          // Space the depth splits geometrically: near slices need to be
          // short, far ones can be long, which is where the error is.
          var t0 = i / n, t1 = (i + 1) / n;
          var z0 = nearZ * Math.pow(farZ / nearZ, t0);
          var z1 = nearZ * Math.pow(farZ / nearZ, t1);
          var x0 = -halfX + (2 * halfX * j) / n;
          var x1 = -halfX + (2 * halfX * (j + 1)) / n;
          out.push([
            { p: [x0, 0, z0], uv: [x0 / 4, z0 / 4] },
            { p: [x1, 0, z0], uv: [x1 / 4, z0 / 4] },
            { p: [x1, 0, z1], uv: [x1 / 4, z1 / 4] },
            { p: [x0, 0, z1], uv: [x0 / 4, z1 / 4] },
          ]);
        }
      }
      return out;
    }

    function draw() {
      var ctx = prepare(canvas, TX_W, TX_H);
      if (!ctx) return;

      var pitch = (state.pitch * Math.PI) / 180;
      // Affine interpolation belongs to hardware that had no mip chain and
      // no bilinear filter either. Forcing them off is both historically
      // right and the only way the warp is visible rather than blurred away.
      var affine = !state.perspective;
      var mipMode = affine ? "off" : state.mip;
      var filterMode = affine ? "nearest" : state.filter;
      var eye = [0, state.height + creepPhase * 0.004, creepPhase * 0.02];
      var target = [eye[0], eye[1] - Math.sin(pitch) * 4, eye[2] - 4];
      var view = G.lookAt(eye, target, [0, 1, 0]);
      var proj = G.perspective(Math.PI / 2.6, RES_X / RES_Y, 0.1, 200);
      var mvp = G.multiply(proj, view);

      // A sky gradient, so the half of the frame above the horizon is not
      // an empty rectangle. Written straight into the framebuffer, since
      // the floor is composited over it.
      fb.reset(10, 14, 26);
      for (var sy = 0; sy < RES_Y; sy++) {
        var t = sy / RES_Y;
        var r = 8 + t * 26, g = 12 + t * 32, b = 24 + t * 44;
        for (var sx = 0; sx < RES_X; sx++) {
          var si = (sy * RES_X + sx) * 4;
          fb.colour[si] = r; fb.colour[si + 1] = g; fb.colour[si + 2] = b;
        }
      }
      var centreLod = null;
      var probeY = Math.round(RES_Y * 0.62);
      var maxLod = 0;
      var taps = 0;

      floorQuads().forEach(function (quad) {
        var verts = quad.map(function (v) {
          var clip = G.apply(mvp, v.p);
          return { clip: clip, attrs: [v.uv[0], v.uv[1]] };
        });
        var visible = G.clipNear(verts);
        if (visible.length < 3) return;

        G.fanTriangles(visible).forEach(function (tri) {
          var s = tri.map(function (v) {
            var ndc = G.perspectiveDivide(v.clip);
            var p = G.viewport(ndc, RES_X, RES_Y);
            return { x: p[0], y: p[1], z: p[2], invW: 1 / v.clip[3], u: v.attrs[0], v: v.attrs[1] };
          });

          var area2 = G.edge(s[0].x, s[0].y, s[1].x, s[1].y, s[2].x, s[2].y);
          if (area2 === 0) return;
          var invArea = 1 / area2;

          // Barycentric coordinates at an arbitrary sample, so the shader
          // can difference its neighbours to find how fast the texture is
          // moving. Real hardware computes one difference per 2x2 quad and
          // shares it across all four lanes; this takes a forward
          // difference per pixel, which is strictly more accurate — so the
          // level-of-detail bands drawn here are a little smoother than a
          // GPU's would be.
          function baryAt(px, py) {
            return [
              G.edge(s[1].x, s[1].y, s[2].x, s[2].y, px, py) * invArea,
              G.edge(s[2].x, s[2].y, s[0].x, s[0].y, px, py) * invArea,
              G.edge(s[0].x, s[0].y, s[1].x, s[1].y, px, py) * invArea,
            ];
          }

          function uvAt(px, py) {
            var b = baryAt(px, py);
            if (state.perspective) {
              return [
                G.interpolatePerspective(b, s[0].u, s[1].u, s[2].u, s[0].invW, s[1].invW, s[2].invW),
                G.interpolatePerspective(b, s[0].v, s[1].v, s[2].v, s[0].invW, s[1].invW, s[2].invW),
              ];
            }
            return [
              G.interpolateAffine(b, s[0].u, s[1].u, s[2].u),
              G.interpolateAffine(b, s[0].v, s[1].v, s[2].v),
            ];
          }

          G.rasterTriangle(s[0], s[1], s[2], { width: RES_X, height: RES_Y }, function (x, y, bary) {
            var z = G.interpolateDepth(bary, s[0].z, s[1].z, s[2].z);
            var i = y * RES_X + x;
            if (z >= fb.depth[i]) return;
            fb.depth[i] = z;

            var here = uvAt(x + 0.5, y + 0.5);
            var right = uvAt(x + 1.5, y + 0.5);
            var down = uvAt(x + 0.5, y + 1.5);
            var dudx = right[0] - here[0], dvdx = right[1] - here[1];
            var dudy = down[0] - here[0], dvdy = down[1] - here[1];

            var lod = G.computeLod(dudx, dvdx, dudy, dvdy, TEX_SIZE);
            var aniso = G.computeAnisotropy(dudx, dvdx, dudy, dvdy, TEX_SIZE);
            if (lod > maxLod) maxLod = lod;
            // Report from whichever covered pixel lands nearest the probe
            // point: at a steep pitch the exact centre pixel may be sky.
            var dxProbe = x - (RES_X >> 1);
            var dyProbe = y - probeY;
            var distance = dxProbe * dxProbe + dyProbe * dyProbe;
            if (!centreLod || distance < centreLod.distance) {
              centreLod = { lod: lod, aniso: aniso, distance: distance };
            }

            var colour;
            if (mipMode === "lod") {
              var level = Math.max(0, Math.min(LOD_COLOURS.length - 1, Math.round(lod)));
              colour = LOD_COLOURS[level];
            } else if (mipMode === "off") {
              colour = filterMode === "nearest"
                ? G.sampleNearest(levels[0], here[0], here[1])
                : G.sampleBilinear(levels[0], here[0], here[1]);
              taps += 4;
            } else if (mipMode === "aniso") {
              // Sample along the long axis, but choose the level from the
              // SHORT one — so a grazing floor stays sharp lengthwise.
              // The spec is N = min(ceil(major/minor), maxAniso) and
              // lambda = log2(major / N). Choosing log2(minor) instead
              // would be right only if N were the full ratio — with N
              // clamped to 8 it samples the long axis below its Nyquist
              // rate and aliases in exactly the band it claims to fix.
              var count = Math.min(MAX_ANISO, Math.max(1, Math.ceil(aniso.ratio)));
              var minorLod = Math.log2(Math.max(1e-6, aniso.major / count));
              // Step along whichever screen axis is the major one.
              var majorIsX = Math.hypot(dudx, dvdx) >= Math.hypot(dudy, dvdy);
              var stepU = (majorIsX ? dudx : dudy) / count;
              var stepV = (majorIsX ? dvdx : dvdy) / count;
              var acc = [0, 0, 0];
              for (var t = 0; t < count; t++) {
                var offset = t - (count - 1) / 2;
                var sample = G.sampleTrilinear(levels, here[0] + stepU * offset, here[1] + stepV * offset, minorLod);
                acc[0] += sample[0]; acc[1] += sample[1]; acc[2] += sample[2];
              }
              colour = [acc[0] / count, acc[1] / count, acc[2] / count];
              taps += count * 8;
            } else {
              colour = G.sampleTrilinear(levels, here[0], here[1], lod);
              taps += 8;
            }

            // A little distance fog, so the far plane does not just stop.
            var fog = G.clamp((z * 0.5 + 0.5 - 0.55) / 0.45, 0, 1);
            var out = G.mix(colour, [0.04, 0.06, 0.11], fog * 0.85);
            fb.set(x, y, [G.linearToSrgb(out[0]), G.linearToSrgb(out[1]), G.linearToSrgb(out[2])]);
          });
        });
      });

      fb.blit(ctx, 0, 0, TX_W, TX_H);

      // A horizon line, so the geometry is legible.
      ctx.strokeStyle = "rgba(150, 190, 205, 0.16)";
      ctx.lineWidth = 1;

      updateTextureStats(centreLod, maxLod, taps, mipMode);
    }

    function updateTextureStats(centre, maxLod, taps, mipMode) {
      var list = $("texture-stats");
      clear(list);
      stat(list, "LOD at centre", centre ? fmt(centre.lod, 2) : "—");
      stat(list, "Level used", centre ? "L" + G.clamp(Math.floor(centre.lod), 0, levels.length - 1) : "—");
      stat(list, "Aspect at centre", centre ? fmt(centre.aniso.ratio, 1) + ":1" : "—");
      stat(list, "Deepest LOD", fmt(maxLod, 1));
      // Texels, not taps: bilinear reads 4, trilinear 8, and each
      // anisotropic sample is itself a trilinear one.
      stat(list, "Texels read", group(taps));

      var explain;
      if (!state.perspective) {
        explain = "Filtering is off here, as it was on the hardware that did this: affine interpolation: texture coordinates stepped straight across the screen, as though the floor were flat-on. It is not, so the texture slides and folds along each triangle's diagonal — the unmistakable look of the first console generation. Now raise the sub-division slider: each smaller piece spans less depth, so each is less wrong. That is exactly the bargain the PlayStation's artists made, and the one Quake automated by dividing every sixteenth pixel.";
      } else if (mipMode === "off") {
        explain = "Perspective is correct now, but the distance is a mess. Out there one pixel covers dozens of texels, and sampling just one of them means the picture changes violently for a sub-pixel movement of the camera. That is aliasing: detail finer than the sampling rate, folded back as noise.";
      } else if (mipMode === "lod") {
        explain = "Each colour is a mip level: green is the full-resolution texture, then blue, violet, amber and so on as the floor recedes. The bands are where the hardware crosses from one level to the next — and trilinear filtering blends across the boundary so you never see the seam.";
      } else if (mipMode === "aniso") {
        explain = "Anisotropic filtering takes several samples along the direction the pixel is stretched, but picks the level from the direction it is not. The floor keeps its detail into the distance instead of being blurred to the worst of its two axes — at the cost of the tap count shown above.";
      } else {
        explain = "Trilinear mipmapping: pick the level where one texel is about one pixel, sample it, sample the next level down, and blend. The distance is stable now — and noticeably blurry, because a grazing floor is squashed in one direction and not the other, and one level has to serve both.";
      }
      $("texture-explain").textContent = explain;
      $("texture-caption").textContent = "Rendered at " + RES_X + "×" + RES_Y + " on purpose, so you can see the texels. " +
        "The orange rules are painted into the texture along every seam: they are the high frequency, and the first thing to fall apart.";
      canvas.setAttribute("aria-label",
        "A checkered floor in perspective, " + (state.perspective ? "with perspective-correct interpolation" : "with affine interpolation, so the texture warps") +
        ", " + ({ off: "no minification filter", tri: "trilinear mipmapping", aniso: "8-tap anisotropic filtering", lod: "the chosen mip level shown as colour" }[mipMode]) +
        ", eye height " + fmt(state.height, 2) + ".");
    }

    $("tx-perspective").addEventListener("change", function (e) { state.perspective = e.target.checked; draw(); });
    $("tx-filter").addEventListener("change", function (e) { state.filter = e.target.value; draw(); });
    $("tx-mip").addEventListener("change", function (e) { state.mip = e.target.value; draw(); });
    $("tx-height").addEventListener("input", function (e) {
      state.height = parseFloat(e.target.value);
      $("tx-height-out").textContent = fmt(state.height, 2);
      draw();
    });
    $("tx-pitch").addEventListener("input", function (e) {
      state.pitch = parseFloat(e.target.value);
      $("tx-pitch-out").textContent = Math.round(state.pitch) + "°";
      draw();
    });
    // Aliasing is a motion artefact: a still frame cannot show it.
    function setCreep(on) {
      state.creep = on;
      if (creepTimer) { window.clearInterval(creepTimer); creepTimer = null; }
      if (!on || reduceMotion) return;
      creepTimer = window.setInterval(function () {
        if (activePanel !== "texture") return;
        creepPhase += 1;
        draw();
      }, 110);
    }
    $("tx-creep").addEventListener("change", function (e) { setCreep(e.target.checked); });
    if (reduceMotion) {
      var creepNote = $("tx-creep-note");
      var creepBox = $("tx-creep");
      if (creepBox) creepBox.disabled = true;
      if (creepNote) {
        creepNote.textContent = "Your system asks for reduced motion, so this one stays off. " +
          "Nudge the eye-height slider by hand instead: the distance should change far more than the camera did.";
      }
    }

    $("tx-splits").addEventListener("input", function (e) {
      state.splits = parseInt(e.target.value, 10);
      $("tx-splits-out").textContent = state.splits + " × " + state.splits;
      draw();
    });

    registerPanel("texture", draw);
  }

  // ==========================================================
  // 07 — LIGHT: four shading models, one sphere
  // ==========================================================
  var SH_W = 460, SH_H = 460;

  function initShading() {
    var canvas = $("shading-canvas");
    if (!canvas) return;
    var state = { model: "pbr", tess: 12, shininess: 32, rough: 0.35, metal: 0, light: -35, gamma: true };
    var RES = 240;
    var fb = new Framebuffer(RES, RES);
    var EYE = [0, 0, 3.4];
    var ALBEDO = [0.86, 0.34, 0.30];

    function lightDirection() {
      var a = (state.light * Math.PI) / 180;
      return G.normalize([Math.sin(a), 0.42, Math.cos(a)]);
    }

    function shade(normal, position) {
      var lightDir = lightDirection();
      var viewDir = G.normalize(G.sub(EYE, position));
      var ambient = [0.035, 0.045, 0.07];
      if (state.model === "pbr") {
        var direct = G.shadePbr(normal, viewDir, lightDir, ALBEDO, state.metal, state.rough, [2.5, 2.42, 2.3]);
        // A crude ambient term so the dark side is not a hole. Real
        // engines integrate an environment map here; this is a stand-in.
        var fill = G.mix(ambient, G.scale(ALBEDO, 0.05), 1 - state.metal);
        return [direct[0] + fill[0], direct[1] + fill[1], direct[2] + fill[2]];
      }
      var diffuse = G.lambert(normal, lightDir);
      var spec = state.model === "phong"
        ? G.phongSpecular(normal, lightDir, viewDir, state.shininess)
        : state.model === "flat" || state.model === "gouraud" || state.model === "blinn"
          ? G.blinnSpecular(normal, lightDir, viewDir, state.shininess)
          : 0;
      if (diffuse <= 0) spec = 0;
      var out = [0, 0, 0];
      for (var i = 0; i < 3; i++) {
        out[i] = ambient[i] + ALBEDO[i] * diffuse * 0.92 + spec * 0.85;
      }
      return out;
    }

    function write(x, y, colour) {
      var mapped = [
        G.reinhard(Math.max(0, colour[0])),
        G.reinhard(Math.max(0, colour[1])),
        G.reinhard(Math.max(0, colour[2])),
      ];
      if (state.gamma) {
        mapped = [G.linearToSrgb(mapped[0]), G.linearToSrgb(mapped[1]), G.linearToSrgb(mapped[2])];
      }
      fb.set(x, y, mapped);
    }

    function draw() {
      var ctx = prepare(canvas, SH_W, SH_H);
      if (!ctx) return;
      var stacks = state.tess;
      var slices = state.tess * 2;
      var mesh = G.uvSphere(stacks, slices);
      var view = G.lookAt(EYE, [0, 0, 0], [0, 1, 0]);
      var proj = G.perspective(Math.PI / 4.2, 1, 0.5, 20);
      var mvp = G.multiply(proj, view);

      fb.reset(6, 9, 16);

      var projected = mesh.positions.map(function (p) {
        var clip = G.apply(mvp, p);
        var ndc = G.perspectiveDivide(clip);
        var s = G.viewport(ndc, RES, RES);
        return { x: s[0], y: s[1], z: s[2], invW: 1 / clip[3] };
      });

      if (state.model === "wire") {
        fb.blit(ctx, 0, 0, SH_W, SH_H);
        var scale = SH_W / RES;
        ctx.strokeStyle = "rgba(79, 224, 139, 0.55)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        mesh.triangles.forEach(function (tri) {
          // Only the triangles facing us, so the far side does not
          // clutter the near one — the same test the rasterizer uses.
          var a = projected[tri[0]], b = projected[tri[1]], c = projected[tri[2]];
          if (G.edge(a.x, a.y, b.x, b.y, c.x, c.y) <= 0) return;
          ctx.moveTo(a.x * scale, a.y * scale);
          ctx.lineTo(b.x * scale, b.y * scale);
          ctx.lineTo(c.x * scale, c.y * scale);
          ctx.closePath();
        });
        ctx.stroke();
        updateShadingUi(mesh);
        return;
      }

      // Gouraud lights the corners once; everything else lights pixels.
      var vertexColours = null;
      if (state.model === "gouraud") {
        vertexColours = mesh.positions.map(function (p, i) { return shade(mesh.normals[i], p); });
      }

      mesh.triangles.forEach(function (tri) {
        var a = projected[tri[0]], b = projected[tri[1]], c = projected[tri[2]];
        var pa = mesh.positions[tri[0]], pb = mesh.positions[tri[1]], pc = mesh.positions[tri[2]];
        var flatNormal = G.faceNormal(pa, pb, pc);
        var flatColour = state.model === "flat"
          ? shade(flatNormal, G.scale(G.add(G.add(pa, pb), pc), 1 / 3))
          : null;

        G.rasterTriangle(a, b, c, { width: RES, height: RES, cull: "back" }, function (x, y, bary) {
          var z = G.interpolateDepth(bary, a.z, b.z, c.z);
          var i = y * RES + x;
          if (z >= fb.depth[i]) return;
          fb.depth[i] = z;

          if (flatColour) { write(x, y, flatColour); return; }

          if (vertexColours) {
            var ca = vertexColours[tri[0]], cb = vertexColours[tri[1]], cc = vertexColours[tri[2]];
            write(x, y, [
              G.interpolatePerspective(bary, ca[0], cb[0], cc[0], a.invW, b.invW, c.invW),
              G.interpolatePerspective(bary, ca[1], cb[1], cc[1], a.invW, b.invW, c.invW),
              G.interpolatePerspective(bary, ca[2], cb[2], cc[2], a.invW, b.invW, c.invW),
            ]);
            return;
          }

          // Interpolate the normal, then RE-NORMALISE it: the average of
          // two unit vectors is not a unit vector, and skipping this is
          // the classic source of a dull band across a highlight.
          var na = mesh.normals[tri[0]], nb = mesh.normals[tri[1]], nc = mesh.normals[tri[2]];
          var normal = G.normalize([
            G.interpolatePerspective(bary, na[0], nb[0], nc[0], a.invW, b.invW, c.invW),
            G.interpolatePerspective(bary, na[1], nb[1], nc[1], a.invW, b.invW, c.invW),
            G.interpolatePerspective(bary, na[2], nb[2], nc[2], a.invW, b.invW, c.invW),
          ]);
          var position = [
            G.interpolatePerspective(bary, pa[0], pb[0], pc[0], a.invW, b.invW, c.invW),
            G.interpolatePerspective(bary, pa[1], pb[1], pc[1], a.invW, b.invW, c.invW),
            G.interpolatePerspective(bary, pa[2], pb[2], pc[2], a.invW, b.invW, c.invW),
          ];
          write(x, y, shade(normal, position));
        });
      });

      fb.blit(ctx, 0, 0, SH_W, SH_H);
      updateShadingUi(mesh);
    }

    function updateShadingUi(mesh) {
      var classicRows = document.querySelectorAll('[data-for="classic"]');
      var pbrRows = document.querySelectorAll('[data-for="pbr"]');
      var isPbr = state.model === "pbr";
      var isWire = state.model === "wire";
      for (var i = 0; i < classicRows.length; i++) {
        classicRows[i].classList.toggle("is-hidden", isPbr || isWire || state.model === "gouraud" ? isPbr || isWire : false);
      }
      for (var j = 0; j < pbrRows.length; j++) pbrRows[j].classList.toggle("is-hidden", !isPbr);

      $("sh-tess-out").textContent = group(mesh.triangles.length);
      var explain = {
        wire: "The geometry underneath everything else: a latitude-longitude sphere. Only the front-facing triangles are drawn — the same signed-area test the rasterizer uses to cull the back half.",
        flat: "One normal per triangle, so one colour per triangle. Every facet is visible, and no amount of extra tessellation hides them completely — the eye is very good at finding the edges between constant regions.",
        gouraud: "Lighting is computed at the corners and the RESULT is interpolated. Cheap, because the expensive part runs once per vertex, and it was the only affordable option for two decades. Its failure is specific: a highlight smaller than a triangle simply cannot appear, because there is nowhere to compute it. Drop the triangle count and watch the specular break into facets or vanish.",
        phong: "The normal is interpolated and the lighting runs per pixel, so the highlight is where the surface says it should be. Phong's own specular term uses the reflected light vector against the view vector.",
        blinn: "Blinn's 1977 revision: use the vector halfway between light and view instead of reflecting. It is cheaper, and it does not collapse at grazing angles the way Phong's does — which is why it, not Phong, is what almost everything shipped.",
        pbr: "A microfacet model: the surface is a field of tiny mirrors whose distribution is described by roughness. Fresnel makes every material go reflective at grazing angles; the geometry term accounts for microfacets shadowing each other; and energy is conserved, so making something rough spreads the same light rather than losing it. Metalness is not a slider on reality — a material is metal or it is not — but as a blend it lets one shader cover both.",
      }[state.model];
      $("shading-explain").textContent = explain;
      canvas.setAttribute("aria-label",
        "A sphere of " + group(mesh.triangles.length) + " triangles rendered with " +
        $("sh-model").options[$("sh-model").selectedIndex].text.split(" — ")[0] +
        " shading, light at " + Math.round(state.light) + " degrees" +
        (state.gamma ? "." : ", with the sRGB conversion switched off so the midtones are wrong."));
    }

    function bind(id, key, format) {
      var input = $(id), output = $(id + "-out");
      input.addEventListener("input", function () {
        state[key] = parseFloat(input.value);
        if (output && format) output.textContent = format(state[key]);
        draw();
      });
      if (output && format) output.textContent = format(state[key]);
    }

    bind("sh-tess", "tess", null);
    bind("sh-shininess", "shininess", function (v) { return String(Math.round(v)); });
    bind("sh-rough", "rough", function (v) { return fmt(v, 2); });
    bind("sh-metal", "metal", function (v) { return fmt(v, 2); });
    bind("sh-light", "light", function (v) { return Math.round(v) + "°"; });
    var previousModel = "gouraud";
    var swapButton = $("sh-swap");
    function setModel(value) {
      if (value === state.model) return;
      previousModel = state.model;
      state.model = value;
      $("sh-model").value = value;
      if (swapButton) swapButton.title = "Flip back to " + previousModel;
      draw();
    }
    $("sh-model").addEventListener("change", function (e) { setModel(e.target.value); });
    if (swapButton) {
      swapButton.addEventListener("click", function () { setModel(previousModel); });
    }

    // Keyboard equivalent for dragging the light.
    canvas.addEventListener("keydown", function (event) {
      var step = event.shiftKey ? 2 : 10;
      if (event.key === "ArrowLeft") state.light -= step;
      else if (event.key === "ArrowRight") state.light += step;
      else if (event.key === "ArrowUp") state.light = G.clamp(state.light + step, -180, 180);
      else if (event.key === "ArrowDown") state.light = G.clamp(state.light - step, -180, 180);
      else return;
      event.preventDefault();
      if (state.light < -180) state.light += 360;
      if (state.light > 180) state.light -= 360;
      $("sh-light").value = String(state.light);
      $("sh-light-out").textContent = Math.round(state.light) + "°";
      draw();
    });
    $("sh-gamma").addEventListener("change", function (e) { state.gamma = e.target.checked; draw(); });

    onDrag(canvas, SH_W, SH_H, {
      start: function () { return true; },
      move: function (p) {
        var angle = Math.atan2(p.x - SH_W / 2, -(p.y - SH_H / 2));
        state.light = G.clamp((angle * 180) / Math.PI, -180, 180);
        $("sh-light").value = String(state.light);
        $("sh-light-out").textContent = Math.round(state.light) + "°";
        draw();
      },
    });

    registerPanel("shading", draw);
  }

  // ==========================================================
  // 08 — PARALLEL: one warp, and the cost of disagreeing
  // ==========================================================
  var LANES = 32;

  function initParallel() {
    var canvas = $("warp-canvas");
    if (!canvas) return;
    var W = 640, HH = 360;
    var state = { coherence: 50, quads: true, pc: 3, running: false, timer: null };

    var PROGRAM = [
      { text: "vec4 c = texture(albedo, uv);", mask: "all" },
      { text: "float f = fresnel(normal, view);", mask: "all" },
      { text: "if (f > threshold) {", mask: "all" },
      { text: "    c = sampleReflection(r);", mask: "if" },
      { text: "    c *= 1.6;", mask: "if" },
      { text: "} else {", mask: "all" },
      { text: "    c = mix(c, fog, depth);", mask: "else" },
      { text: "}", mask: "all" },
      { text: "outColour = c * lighting;", mask: "all" },
    ];

    var listing = $("pl-listing");
    var lineNodes = PROGRAM.map(function (line, i) {
      var node = el("div", "pl-line");
      node.appendChild(el("b", null, String(i).padStart(2, "0")));
      node.appendChild(el("span", null, line.text));
      listing.appendChild(node);
      return node;
    });

    // The lane grid is 8 wide and 4 tall, so a 2x2 quad of neighbouring
    // pixels is two columns by two rows — not four lanes in a row.
    var COLS = 8;
    function quadOf(lane) {
      var col = lane % COLS, row = Math.floor(lane / COLS);
      return Math.floor(row / 2) * (COLS / 2) + Math.floor(col / 2);
    }
    var QUADS = LANES / 4;

    // Which lanes take the branch. Coherence 100% means all of them agree;
    // 0% means an even split, which is the worst case for a warp.
    function predicate() {
      var takers = Math.round((LANES / 2) * (1 + state.coherence / 100));
      var flags = new Array(LANES).fill(false);
      if (state.quads) {
        // Neighbouring pixels usually agree, because whatever the shader
        // branched on varies smoothly across a surface. That is why real
        // shader branches cost far less than the worst case suggests.
        var takenQuads = Math.round((takers / LANES) * QUADS);
        for (var i = 0; i < LANES; i++) flags[i] = quadOf(i) < takenQuads;
      } else {
        // Scattered: a stride that spreads the taken lanes across the warp.
        for (var j = 0; j < LANES; j++) flags[(j * 7) % LANES] = j < takers;
      }
      return flags;
    }

    function maskFor(index, flags) {
      var line = PROGRAM[index];
      if (line.mask === "all") return flags.map(function () { return true; });
      if (line.mask === "if") return flags.slice();
      return flags.map(function (f) { return !f; });
    }

    function draw() {
      var ctx = prepare(canvas, W, HH);
      if (!ctx) return;
      ctx.fillStyle = "#060a12";
      ctx.fillRect(0, 0, W, HH);

      var flags = predicate();
      var mask = maskFor(state.pc, flags);
      var cols = 8, rows = 4;
      var padX = 40, padY = 76;
      var cellW = (W - padX * 2) / cols;
      var cellH = (HH - padY - 40) / rows;

      ctx.fillStyle = "#98adb8";
      ctx.font = "600 13px ui-monospace, monospace";
      ctx.fillText("warp — 32 lanes, one program counter", padX, 34);
      ctx.fillStyle = "#57d3ee";
      ctx.fillText("PC " + String(state.pc).padStart(2, "0") + "  ·  " + PROGRAM[state.pc].text.trim(), padX, 56);

      for (var i = 0; i < LANES; i++) {
        var col = i % cols, row = Math.floor(i / cols);
        var x = padX + col * cellW, y = padY + row * cellH;
        var active = mask[i];
        ctx.fillStyle = active ? "rgba(79, 224, 139, 0.85)" : "rgba(40, 52, 68, 0.9)";
        ctx.fillRect(x + 3, y + 3, cellW - 8, cellH - 8);
        if (!active) {
          // Masked lanes still occupy the machine — they just throw the
          // result away. That is the whole cost of divergence.
          ctx.strokeStyle = "rgba(255, 111, 125, 0.55)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 6, y + 6);
          ctx.lineTo(x + cellW - 11, y + cellH - 11);
          ctx.moveTo(x + cellW - 11, y + 6);
          ctx.lineTo(x + 6, y + cellH - 11);
          ctx.stroke();
        }
        ctx.fillStyle = active ? "#05242f" : "#5b6c7d";
        ctx.font = "600 11px ui-monospace, monospace";
        ctx.fillText(String(i), x + 9, y + 19);
      }

      if (state.quads) {
        ctx.strokeStyle = "rgba(255, 192, 97, 0.4)";
        ctx.lineWidth = 1.2;
        for (var q = 0; q < QUADS; q++) {
          var qx = padX + (q % (cols / 2)) * cellW * 2;
          var qy = padY + Math.floor(q / (cols / 2)) * cellH * 2;
          ctx.strokeRect(qx + 1, qy + 1, cellW * 2 - 2, cellH * 2 - 2);
        }
      }

      var activeCount = mask.filter(Boolean).length;
      ctx.fillStyle = activeCount === LANES ? "#4fe08b" : "#ff6f7d";
      ctx.font = "600 12px ui-monospace, monospace";
      ctx.fillText(activeCount + " / 32 lanes doing useful work at this instruction", padX, HH - 16);

      lineNodes.forEach(function (node, i) {
        node.classList.toggle("is-current", i === state.pc);
        var lineMask = maskFor(i, flags);
        node.classList.toggle("is-masked", lineMask.filter(Boolean).length === 0);
      });

      updateStats(flags);
      $("warp-caption").textContent = activeCount === LANES
        ? "Every lane is executing. This instruction costs one slot and does 32 lanes of work."
        : "The warp has diverged. Both sides of the branch still execute; the lanes on the wrong side are masked off and their results discarded.";
    }

    function updateStats(flags) {
      var takers = flags.filter(Boolean).length;
      var diverged = takers > 0 && takers < LANES;
      // Every instruction costs one issue slot whether or not lanes are
      // masked, so a divergent warp pays for both sides of the branch.
      var slots = 0, useful = 0;
      for (var i = 0; i < PROGRAM.length; i++) {
        var mask = maskFor(i, flags);
        var active = mask.filter(Boolean).length;
        if (PROGRAM[i].text.trim() === "}" || PROGRAM[i].text.trim() === "} else {") continue;
        if (active === 0) continue;
        slots++;
        useful += active;
      }
      var best = 0;
      for (var j = 0; j < PROGRAM.length; j++) {
        var t = PROGRAM[j].text.trim();
        if (t === "}" || t === "} else {") continue;
        if (PROGRAM[j].mask === "else") continue;
        best++;
      }
      // Quads whose four lanes disagree. Divergence within a quad is the
      // expensive kind: it is what invalidates the texture derivatives the
      // fragment stage takes by differencing neighbours.
      var splitQuads = 0;
      for (var q = 0; q < QUADS; q++) {
        var first = null, mixed = false;
        for (var lane = 0; lane < LANES; lane++) {
          if (quadOf(lane) !== q) continue;
          if (first === null) first = flags[lane];
          else if (flags[lane] !== first) mixed = true;
        }
        if (mixed) splitQuads++;
      }

      var list = $("parallel-stats");
      clear(list);
      stat(list, "Lanes taking branch", takers + " / 32");
      stat(list, "Issue slots used", String(slots), diverged);
      stat(list, "If the warp agreed", String(best));
      stat(list, "Split quads", splitQuads + " / " + QUADS, splitQuads > 0);
      stat(list, "Lane efficiency", Math.round((useful / (slots * LANES)) * 100) + "%", useful / (slots * LANES) < 0.8);
    }

    function step() {
      state.pc = (state.pc + 1) % PROGRAM.length;
      draw();
    }

    function stop() {
      state.running = false;
      if (state.timer) { window.clearInterval(state.timer); state.timer = null; }
      $("pl-run").textContent = "Run";
    }

    $("pl-step").addEventListener("click", function () { stop(); step(); });
    $("pl-reset").addEventListener("click", function () { stop(); state.pc = 0; draw(); });
    $("pl-run").addEventListener("click", function () {
      if (state.running) { stop(); return; }
      state.running = true;
      $("pl-run").textContent = "Pause";
      state.timer = window.setInterval(step, 900);
    });
    $("pl-coherence").addEventListener("input", function (e) {
      state.coherence = parseFloat(e.target.value);
      $("pl-coherence-out").textContent = Math.round(state.coherence) + "%";
      draw();
    });
    $("pl-quads").addEventListener("change", function (e) { state.quads = e.target.checked; draw(); });

    initLatency();
    registerPanel("parallel", function () { draw(); drawLatency(); });
    draw();
  }

  // --- latency hiding, as a Gantt chart ---
  var latencyState = { warps: 6, latency: 14 };

  function initLatency() {
    $("lt-occupancy").addEventListener("input", function (e) {
      latencyState.warps = parseInt(e.target.value, 10);
      $("lt-occupancy-out").textContent = String(latencyState.warps);
      drawLatency();
    });
    $("lt-latency").addEventListener("input", function (e) {
      latencyState.latency = parseInt(e.target.value, 10);
      $("lt-latency-out").textContent = latencyState.latency + " cycles";
      drawLatency();
    });
    drawLatency();
  }

  // A round-robin scheduler over N warps: each computes for a short burst,
  // then issues a memory request and sleeps for the latency. If every warp
  // is asleep, the arithmetic units idle — which is the thing occupancy buys.
  function simulateLatency(warpCount, latency, cycles) {
    var BURST = 4;
    var warps = [];
    for (var i = 0; i < warpCount; i++) {
      warps.push({ readyAt: 0, remaining: BURST, timeline: new Uint8Array(cycles) });
    }
    // A true round robin: the pointer advances only when a warp actually
    // issues. Rotating it every cycle instead makes the warps resonate into
    // synchronised sleep, and occupancy then FALLS as you add warps.
    var next = 0;
    var idle = 0;
    for (var t = 0; t < cycles; t++) {
      var issued = -1;
      for (var probe = 0; probe < warpCount; probe++) {
        var candidate = (next + probe) % warpCount;
        if (warps[candidate].readyAt <= t) { issued = candidate; break; }
      }
      if (issued < 0) { idle++; continue; }
      var warp = warps[issued];
      warp.timeline[t] = 1;
      warp.remaining--;
      if (warp.remaining <= 0) {
        warp.remaining = BURST;
        warp.readyAt = t + 1 + latency;
      }
      next = (issued + 1) % warpCount;
    }
    return { warps: warps, idle: idle, cycles: cycles, utilisation: (cycles - idle) / cycles };
  }

  // How many resident warps this model needs before the arithmetic units
  // stop idling. Derived by running the simulation rather than asserted
  // from a formula, so the number and the picture can never disagree.
  function warpsToSaturate(latency) {
    for (var n = 1; n <= 10; n++) {
      if (simulateLatency(n, latency, 240).utilisation > 0.995) return n;
    }
    return null;
  }

  function drawLatency() {
    var canvas = $("latency-canvas");
    if (!canvas) return;
    var W = 900, HH = 300;
    var ctx = prepare(canvas, W, HH);
    if (!ctx) return;
    ctx.fillStyle = "#060a12";
    ctx.fillRect(0, 0, W, HH);

    var CYCLES = 120;
    var sim = simulateLatency(latencyState.warps, latencyState.latency, CYCLES);
    var needed = warpsToSaturate(latencyState.latency);
    var padL = 78, padT = 34, padB = 58;
    var rowH = Math.min(22, (HH - padT - padB) / latencyState.warps);
    var cellW = (W - padL - 24) / CYCLES;

    ctx.font = "500 11px ui-monospace, monospace";
    sim.warps.forEach(function (warp, i) {
      var y = padT + i * rowH;
      ctx.fillStyle = "#6a7f8c";
      ctx.fillText("warp " + i, 14, y + rowH * 0.68);
      for (var t = 0; t < CYCLES; t++) {
        ctx.fillStyle = warp.timeline[t] ? "#4fe08b" : "rgba(60, 78, 96, 0.42)";
        ctx.fillRect(padL + t * cellW, y + 2, Math.max(1, cellW - 0.6), rowH - 5);
      }
    });

    // The arithmetic units' own row: were they doing anything this cycle?
    var aluY = padT + latencyState.warps * rowH + 12;
    ctx.fillStyle = "#98adb8";
    ctx.fillText("ALUs", 14, aluY + 13);
    var busy = new Uint8Array(CYCLES);
    sim.warps.forEach(function (warp) {
      for (var t = 0; t < CYCLES; t++) if (warp.timeline[t]) busy[t] = 1;
    });
    for (var t2 = 0; t2 < CYCLES; t2++) {
      ctx.fillStyle = busy[t2] ? "#57d3ee" : "#ff6f7d";
      ctx.fillRect(padL + t2 * cellW, aluY, Math.max(1, cellW - 0.6), 16);
    }

    ctx.fillStyle = "#6a7f8c";
    ctx.fillText("cycles →", W - 90, HH - 16);
    ctx.fillStyle = "#4fe08b";
    ctx.fillRect(padL, HH - 30, 11, 3);
    ctx.fillStyle = "#98adb8";
    ctx.fillText("issuing", padL + 18, HH - 25);
    ctx.fillStyle = "rgba(60, 78, 96, 0.9)";
    ctx.fillRect(padL + 84, HH - 30, 11, 3);
    ctx.fillStyle = "#98adb8";
    ctx.fillText("waiting on memory", padL + 102, HH - 25);

    var list = $("latency-stats");
    clear(list);
    stat(list, "ALU utilisation", Math.round(sim.utilisation * 100) + "%", sim.utilisation < 0.9);
    stat(list, "Idle cycles", group(sim.idle), sim.idle > 0);
    var note = $("latency-note");
    if (note) {
      note.textContent = sim.utilisation > 0.99
        ? "Saturated. Every cycle issues, and the memory latency has vanished behind other warps — the fetch still takes " +
          latencyState.latency + " cycles, but nothing waits for it. From here the shader's REGISTER count is what limits you, because that is what caps how many warps fit at once."
        : "The arithmetic units are idle " + Math.round((1 - sim.utilisation) * 100) + "% of the time. With a " +
          latencyState.latency + "-cycle fetch and four instructions between fetches, this model needs " +
          (needed === null ? "more than ten" : needed) + " resident warps before it stops idling; there are " +
          latencyState.warps + ".";
    }
    stat(list, "Warps to saturate", needed === null ? "> 10" : String(needed),
      needed === null || latencyState.warps < needed);
  }

  // ==========================================================
  // 09 — RAYS: casting, acceleration, and the noise that follows
  // ==========================================================
  var RY_W = 620, RY_H = 460;

  function initRays() {
    var canvas = $("rays-canvas");
    if (!canvas) return;
    var state = { rays: 28, bounces: 1, objects: 120, accel: "bvh", showBvh: false,
      moving: "eye", eye: { x: 62, y: 244 }, light: { x: 520, y: 92 } };

    // The scene is generated, not hand-placed, so the object count can be
    // swept. Objects are clustered rather than sprayed evenly: a hierarchy
    // is only as good as the boxes it can draw, and boxes over clustered
    // geometry are tight where boxes over a uniform spray all overlap.
    var CIRCLES = [];
    var BVH = null;
    var WALLS = [
      [[20, 20], [RY_W - 20, 20]], [[RY_W - 20, 20], [RY_W - 20, RY_H - 20]],
      [[RY_W - 20, RY_H - 20], [20, RY_H - 20]], [[20, RY_H - 20], [20, 20]],
    ];

    function makeScene(count) {
      var seed = 0x2f6e2b1 >>> 0;
      function random() {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        return (seed >>> 0) / 4294967296;
      }
      var clusters = Math.max(3, Math.round(Math.sqrt(count)));
      var centres = [];
      for (var c = 0; c < clusters; c++) {
        // Keep the left of the frame clear: the eye starts there, and a
        // fan of rays that dies in the first twenty pixels shows nothing.
        centres.push([210 + random() * (RY_W - 280), 70 + random() * (RY_H - 140)]);
      }
      var baseRadius = G.clamp(26 * Math.sqrt(14 / count), 3, 30);
      var spread = 44 + 560 / Math.sqrt(count);
      CIRCLES = [];
      for (var i = 0; i < count; i++) {
        var centre = centres[i % clusters];
        var angle = random() * Math.PI * 2;
        var distance = Math.sqrt(random()) * spread;
        var x = G.clamp(centre[0] + Math.cos(angle) * distance, 40, RY_W - 40);
        var y = G.clamp(centre[1] + Math.sin(angle) * distance, 40, RY_H - 40);
        if (x < 165) continue;                       // the corridor by the eye
        CIRCLES.push({ x: x, y: y, r: baseRadius * (0.5 + random() * 0.75) });
      }
      BVH = buildBvh();
    }

    // Median split along the wider axis, recursing until a leaf holds a
    // handful of objects. Production builders pick the split by a
    // surface-area heuristic instead; the shape, and the payoff, is this.
    function buildBvh() {
      function bounds(indices) {
        var box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        indices.forEach(function (i) {
          var c = CIRCLES[i];
          box.minX = Math.min(box.minX, c.x - c.r); box.maxX = Math.max(box.maxX, c.x + c.r);
          box.minY = Math.min(box.minY, c.y - c.r); box.maxY = Math.max(box.maxY, c.y + c.r);
        });
        return box;
      }
      function node(indices, depth) {
        var box = bounds(indices);
        box.depth = depth;
        if (indices.length <= 3 || depth >= 14) { box.items = indices; return box; }
        var axis = (box.maxX - box.minX) >= (box.maxY - box.minY) ? "x" : "y";
        var sorted = indices.slice().sort(function (a, b) { return CIRCLES[a][axis] - CIRCLES[b][axis]; });
        var mid = sorted.length >> 1;
        box.left = node(sorted.slice(0, mid), depth + 1);
        box.right = node(sorted.slice(mid), depth + 1);
        return box;
      }
      return node(CIRCLES.map(function (c, i) { return i; }), 0);
    }

    function bvhDepth(node) {
      if (!node || node.items) return 1;
      return 1 + Math.max(bvhDepth(node.left), bvhDepth(node.right));
    }

    function rayBox(ox, oy, dx, dy, box) {
      // The slab test: clip the ray against each axis's pair of planes and
      // see whether the surviving interval is non-empty.
      var invX = 1 / (dx || 1e-9), invY = 1 / (dy || 1e-9);
      var t1 = (box.minX - ox) * invX, t2 = (box.maxX - ox) * invX;
      var t3 = (box.minY - oy) * invY, t4 = (box.maxY - oy) * invY;
      var tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
      var tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));
      if (tmax < Math.max(tmin, 0)) return -1;
      return Math.max(tmin, 0);
    }

    function rayCircle(ox, oy, dx, dy, c) {
      var fx = ox - c.x, fy = oy - c.y;
      var b = 2 * (fx * dx + fy * dy);
      var cc = fx * fx + fy * fy - c.r * c.r;
      var disc = b * b - 4 * cc;
      if (disc < 0) return null;
      var root = Math.sqrt(disc);
      var t = (-b - root) / 2;
      if (t < 1e-4) t = (-b + root) / 2;
      if (t < 1e-4) return null;
      var px = ox + dx * t, py = oy + dy * t;
      return { t: t, x: px, y: py, nx: (px - c.x) / c.r, ny: (py - c.y) / c.r };
    }

    function raySegment(ox, oy, dx, dy, seg) {
      var ax = seg[0][0], ay = seg[0][1];
      var ex = seg[1][0] - ax, ey = seg[1][1] - ay;
      var denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < 1e-9) return null;
      var t = ((ax - ox) * ey - (ay - oy) * ex) / denominator;
      var u = ((ax - ox) * dy - (ay - oy) * dx) / denominator;
      if (t < 1e-4 || u < 0 || u > 1) return null;
      var length = Math.hypot(ex, ey) || 1;
      var nx = ey / length, ny = -ex / length;
      if (nx * dx + ny * dy > 0) { nx = -nx; ny = -ny; }
      return { t: t, x: ox + dx * t, y: oy + dy * t, nx: nx, ny: ny };
    }

    function trace(ox, oy, dx, dy, counters, boxesHit) {
      var best = null;
      function consider(hit) { if (hit && (!best || hit.t < best.t)) best = hit; }

      WALLS.forEach(function (seg) {
        counters.tests++;
        consider(raySegment(ox, oy, dx, dy, seg));
      });

      if (state.accel === "bvh") {
        counters.boxTests++;
        var rootEntry = rayBox(ox, oy, dx, dy, BVH);
        if (rootEntry < 0) return best;
        // Descend into the nearer child first, and abandon any subtree
        // whose box starts further away than the closest hit found so far.
        // Without that ordering a hierarchy barely pays for itself; with
        // it, most of the tree is never visited at all.
        (function descend(node, entry) {
          if (best && entry > best.t) return;
          if (boxesHit) boxesHit.add(node);
          if (node.items) {
            node.items.forEach(function (i) {
              counters.tests++;
              consider(rayCircle(ox, oy, dx, dy, CIRCLES[i]));
            });
            return;
          }
          counters.boxTests += 2;
          var leftEntry = rayBox(ox, oy, dx, dy, node.left);
          var rightEntry = rayBox(ox, oy, dx, dy, node.right);
          var first = node.left, firstEntry = leftEntry;
          var second = node.right, secondEntry = rightEntry;
          if (rightEntry >= 0 && (leftEntry < 0 || rightEntry < leftEntry)) {
            first = node.right; firstEntry = rightEntry;
            second = node.left; secondEntry = leftEntry;
          }
          if (firstEntry >= 0) descend(first, firstEntry);
          if (secondEntry >= 0) descend(second, secondEntry);
        })(BVH, rootEntry);
      } else {
        CIRCLES.forEach(function (c) {
          counters.tests++;
          consider(rayCircle(ox, oy, dx, dy, c));
        });
      }
      return best;
    }

    function draw() {
      var ctx = prepare(canvas, RY_W, RY_H);
      if (!ctx) return;
      ctx.fillStyle = "#060a12";
      ctx.fillRect(0, 0, RY_W, RY_H);

      var counters = { tests: 0, boxTests: 0, segments: 0, shadow: 0 };
      var boxesHit = new Set();

      ctx.strokeStyle = "rgba(150, 190, 205, 0.3)";
      ctx.lineWidth = 1.4;
      WALLS.forEach(function (seg) {
        ctx.beginPath();
        ctx.moveTo(seg[0][0], seg[0][1]);
        ctx.lineTo(seg[1][0], seg[1][1]);
        ctx.stroke();
      });

      CIRCLES.forEach(function (c) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(30, 44, 62, 0.9)";
        ctx.fill();
        ctx.strokeStyle = "rgba(150, 190, 205, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // Primary rays in a fan towards the middle of the scene.
      var centreAngle = Math.atan2(RY_H / 2 - state.eye.y, RY_W * 0.6 - state.eye.x);
      var spread = 1.15;
      var paths = [];
      for (var i = 0; i < state.rays; i++) {
        var t = state.rays === 1 ? 0.5 : i / (state.rays - 1);
        var angle = centreAngle + (t - 0.5) * spread;
        var ox = state.eye.x, oy = state.eye.y;
        var dx = Math.cos(angle), dy = Math.sin(angle);
        var path = [];
        for (var bounce = 0; bounce <= state.bounces; bounce++) {
          counters.segments++;
          var hit = trace(ox, oy, dx, dy, counters, state.showBvh ? boxesHit : null);
          if (!hit) { path.push({ x: ox + dx * 900, y: oy + dy * 900, end: true }); break; }
          path.push(hit);
          // Shadow ray towards the light, which is where rasterization
          // has nothing comparable to offer.
          var lx = state.light.x - hit.x, ly = state.light.y - hit.y;
          var lightDistance = Math.hypot(lx, ly) || 1;
          var shadow = trace(hit.x + hit.nx * 0.4, hit.y + hit.ny * 0.4, lx / lightDistance, ly / lightDistance, counters, null);
          counters.shadow++;
          hit.lit = !shadow || shadow.t > lightDistance;
          if (bounce === state.bounces) break;
          var dot = dx * hit.nx + dy * hit.ny;
          dx = dx - 2 * dot * hit.nx;
          dy = dy - 2 * dot * hit.ny;
          ox = hit.x; oy = hit.y;
        }
        paths.push(path);
      }

      if (state.showBvh) {
        (function drawBox(node, depth) {
          var tested = boxesHit.has(node);
          ctx.strokeStyle = tested
            ? "rgba(255, 192, 97, " + (0.75 - depth * 0.12) + ")"
            : "rgba(90, 110, 130, 0.3)";
          ctx.setLineDash(tested ? [] : [4, 4]);
          ctx.lineWidth = tested ? 1.3 : 1;
          var inset = depth * 1.5;
          ctx.strokeRect(node.minX - inset, node.minY - inset,
            node.maxX - node.minX + inset * 2, node.maxY - node.minY + inset * 2);
          ctx.setLineDash([]);
          if (node.left && depth < 3) { drawBox(node.left, depth + 1); drawBox(node.right, depth + 1); }
        })(BVH, 0);
      }

      paths.forEach(function (path) {
        var x = state.eye.x, y = state.eye.y;
        path.forEach(function (point, depth) {
          ctx.strokeStyle = depth === 0 ? "rgba(87, 211, 238, 0.66)" : "rgba(169, 155, 255, " + (0.3 / depth) + ")";
          ctx.lineWidth = depth === 0 ? 1.1 : 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
          if (!point.end) {
            if (point.lit && depth === 0) {
              ctx.strokeStyle = "rgba(255, 192, 97, 0.22)";
              ctx.setLineDash([2, 4]);
              ctx.beginPath();
              ctx.moveTo(point.x, point.y);
              ctx.lineTo(state.light.x, state.light.y);
              ctx.stroke();
              ctx.setLineDash([]);
            }
            if (depth === 0) {
              ctx.beginPath();
              ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
              ctx.fillStyle = point.lit ? "#ffc061" : "#3c4c59";
              ctx.fill();
            }
          }
          x = point.x; y = point.y;
        });
      });

      // The eye and the light.
      ctx.beginPath();
      ctx.arc(state.eye.x, state.eye.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#57d3ee";
      ctx.fill();
      ctx.fillStyle = "#060a12";
      ctx.font = "700 10px ui-monospace, monospace";
      ctx.fillText("EYE", state.eye.x - 11, state.eye.y + 3);

      ctx.beginPath();
      ctx.arc(state.light.x, state.light.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "#ffc061";
      ctx.fill();
      ctx.fillStyle = "#060a12";
      ctx.fillText("SUN", state.light.x - 11, state.light.y + 3);

      var list = $("rays-stats");
      clear(list);
      var segments = counters.segments + counters.shadow;
      // What the same rays would have cost testing every object in turn.
      var naive = segments * (CIRCLES.length + WALLS.length);
      var actual = counters.tests + counters.boxTests;
      clear(list);
      stat(list, "Ray segments", group(segments));
      stat(list, "Object tests", group(counters.tests));
      stat(list, "Box tests", group(counters.boxTests));
      stat(list, "Without a hierarchy", group(naive));
      stat(list, "Tree depth", String(bvhDepth(BVH)));
      stat(list, "Speed-up", actual ? fmt(naive / actual, 2) + "×" : "—", actual >= naive);

      canvas.setAttribute("aria-label",
        "A top-down scene of " + state.objects + " objects with " + state.rays + " rays fanning out from the eye" +
        (state.bounces ? " and bouncing " + state.bounces + " time(s)" : "") + ". " +
        (state.accel === "bvh"
          ? "With a bounding-volume hierarchy the rays needed " + group(counters.tests) + " object tests instead of " + group(naive) + "."
          : "With no acceleration structure every ray was tested against every object: " + group(counters.tests) + " tests."));
      $("rays-explain").textContent = state.accel === "bvh"
        ? "A ray tests the root box, descends into the nearer child first, and abandons any subtree that starts further away than the closest hit it already has. Now drag the object count. At a dozen objects the hierarchy barely pays for itself — the box tests cost about what they save, and this is a real result, not a flaw in the diagram. Push it past fifty and the two curves separate for good. Watch the object-test count as you drag: it barely moves. Six objects or two hundred, each ray still tests about the same handful \u2014 the tree has made the cost of finding the nearest surface nearly independent of how much scenery there is. That property is the whole reason ray tracing is possible, and Turing put exactly this traversal — and the ray-triangle test at the bottom of it — into fixed-function silicon in 2018."
        : "Every ray is tested against every object in the scene, so the cost is the ray count times the object count and nothing can be skipped. Drag the object slider and watch the test count climb in a straight line, then switch the hierarchy back on and drag it again.";
    }

    var picker = $("ry-picker");
    if (picker) {
      [["eye", "the eye"], ["light", "the sun"]].forEach(function (entry, index) {
        var button = el("button", null, entry[1]);
        button.type = "button";
        button.setAttribute("aria-pressed", index === 0 ? "true" : "false");
        button.addEventListener("click", function () {
          state.moving = entry[0];
          Array.prototype.forEach.call(picker.querySelectorAll("button"), function (other, i) {
            other.setAttribute("aria-pressed", i === index ? "true" : "false");
          });
          canvas.focus();
          draw();
        });
        picker.appendChild(button);
      });
    }

    canvas.addEventListener("keydown", function (event) {
      var step = event.shiftKey ? 3 : 14;
      var dx = 0, dy = 0;
      if (event.key === "ArrowLeft") dx = -step;
      else if (event.key === "ArrowRight") dx = step;
      else if (event.key === "ArrowUp") dy = -step;
      else if (event.key === "ArrowDown") dy = step;
      else return;
      event.preventDefault();
      var target = state.moving === "eye" ? state.eye : state.light;
      target.x = G.clamp(target.x + dx, 26, RY_W - 26);
      target.y = G.clamp(target.y + dy, 26, RY_H - 26);
      draw();
    });

    var dragging = null;
    onDrag(canvas, RY_W, RY_H, {
      start: function (p) {
        var toEye = Math.hypot(p.x - state.eye.x, p.y - state.eye.y);
        var toLight = Math.hypot(p.x - state.light.x, p.y - state.light.y);
        if (toEye < 40 && toEye <= toLight) dragging = "eye";
        else if (toLight < 40) dragging = "light";
        else return false;
        return true;
      },
      move: function (p) {
        var target = dragging === "eye" ? state.eye : state.light;
        target.x = G.clamp(p.x, 26, RY_W - 26);
        target.y = G.clamp(p.y, 26, RY_H - 26);
        draw();
      },
      end: function () { dragging = null; },
    });

    $("ry-rays").addEventListener("input", function (e) {
      state.rays = parseInt(e.target.value, 10);
      $("ry-rays-out").textContent = String(state.rays);
      draw();
    });
    $("ry-bounces").addEventListener("input", function (e) {
      state.bounces = parseInt(e.target.value, 10);
      $("ry-bounces-out").textContent = String(state.bounces);
      draw();
    });
    $("ry-objects").addEventListener("input", function (e) {
      state.objects = parseInt(e.target.value, 10);
      $("ry-objects-out").textContent = String(state.objects);
      makeScene(state.objects);
      draw();
    });
    $("ry-accel").addEventListener("change", function (e) { state.accel = e.target.value; draw(); });
    $("ry-showbvh").addEventListener("change", function (e) { state.showBvh = e.target.checked; draw(); });

    makeScene(state.objects);
    initNoise();
    registerPanel("rays", function () { draw(); drawNoise(); });
    draw();
  }

  // --- Monte Carlo soft shadows, and the square-root law ---
  var noiseState = { samples: 4, size: 0.3 };

  function initNoise() {
    $("nz-samples").addEventListener("input", function (e) {
      noiseState.samples = parseInt(e.target.value, 10);
      $("nz-samples-out").textContent = String(noiseState.samples);
      drawNoise();
    });
    $("nz-size").addEventListener("input", function (e) {
      noiseState.size = parseFloat(e.target.value);
      $("nz-size-out").textContent = fmt(noiseState.size, 2);
      drawNoise();
    });
    drawNoise();
  }

  function drawNoise() {
    var canvas = $("noise-canvas");
    if (!canvas) return;
    var W = 440, HH = 360;
    var ctx = prepare(canvas, W, HH);
    if (!ctx) return;
    var RES_X = 132, RES_Y = Math.round(RES_X * (HH / W));

    var occluder = { x: 0.5, y: 0.36, r: 0.085 };
    var lightY = 0.08, lightX = 0.5;
    var samples = noiseState.samples;
    var half = noiseState.size / 2;

    var image = ctx.createImageData(RES_X, RES_Y);
    var totalVariance = 0, counted = 0, litPixels = 0;

    for (var py = 0; py < RES_Y; py++) {
      for (var px = 0; px < RES_X; px++) {
        var wx = (px + 0.5) / RES_X;
        var wy = (py + 0.5) / RES_Y;
        var value;
        if (wy < lightY + 0.02) {
          value = 1.15;
        } else {
          // A deterministic per-pixel stream, so the picture is stable
          // between redraws — the same trick a renderer uses to keep a
          // still frame from crawling.
          var seed = (px * 73856093) ^ (py * 19349663) ^ 0x9e3779b9;
          var visible = 0;
          for (var s = 0; s < samples; s++) {
            seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
            var r = ((seed >>> 0) / 4294967296);
            var sx = lightX - half + r * noiseState.size;
            // Does the segment from (sx, lightY) to (wx, wy) miss the circle?
            var dx = wx - sx, dy = wy - lightY;
            var fx = sx - occluder.x, fy = lightY - occluder.y;
            var a = dx * dx + dy * dy;
            var b = 2 * (fx * dx + fy * dy);
            var c = fx * fx + fy * fy - occluder.r * occluder.r;
            var disc = b * b - 4 * a * c;
            var blocked = false;
            if (disc >= 0) {
              var root = Math.sqrt(disc);
              var t1 = (-b - root) / (2 * a);
              var t2 = (-b + root) / (2 * a);
              if ((t1 > 0 && t1 < 1) || (t2 > 0 && t2 < 1)) blocked = true;
            }
            if (!blocked) visible++;
          }
          var p = visible / samples;
          // The sample variance of a proportion is biased low by (1 - 1/N);
          // Bessel's correction removes it. At N = 1 there is no estimate to
          // be had at all — p is 0 or 1 and p(1-p) is 0 — so fall back to
          // the a-priori worst case rather than reporting no noise.
          if (samples > 1) {
            totalVariance += (p * (1 - p) * samples) / ((samples - 1) * samples);
          } else {
            totalVariance += 0.25;
          }
          counted++;
          litPixels++;
          var distance = Math.hypot(wx - lightX, wy - lightY);
          value = p * (0.10 / (0.06 + distance * distance));
        }
        var v = G.linearToSrgb(G.clamp(value, 0, 1));
        var i = (py * RES_X + px) * 4;
        image.data[i] = v * 255 * 1.0;
        image.data[i + 1] = v * 255 * 0.97;
        image.data[i + 2] = v * 255 * 0.88;
        image.data[i + 3] = 255;
      }
    }

    var scratch = document.createElement("canvas");
    scratch.width = RES_X; scratch.height = RES_Y;
    scratch.getContext("2d").putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, 0, 0, W, HH);
    ctx.imageSmoothingEnabled = true;

    // The occluder, drawn over the estimate.
    ctx.beginPath();
    ctx.arc(occluder.x * W, occluder.y * HH, occluder.r * W, 0, Math.PI * 2);
    ctx.fillStyle = "#0b1220";
    ctx.fill();
    ctx.strokeStyle = "rgba(150, 190, 205, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = "#ffc061";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo((lightX - half) * W, lightY * HH);
    ctx.lineTo((lightX + half) * W, lightY * HH);
    ctx.stroke();

    var rms = counted ? Math.sqrt(totalVariance / counted) : 0;
    var list = $("noise-stats");
    clear(list);
    stat(list, "Samples / pixel", String(noiseState.samples));
    stat(list, "Estimated noise", fmt(rms * 100, 2) + "%", rms > 0.08);
    // Four times the samples for half the noise: the exchange rate that
    // makes real-time path tracing impossible without a denoiser.
    stat(list, "For half this noise", group(noiseState.samples * 4) + " / px");
    stat(list, "Shadow rays cast", group(litPixels * noiseState.samples));
    $("noise-caption").textContent = noiseState.samples >= 64
      ? "Converged, and expensive: " + group(litPixels * noiseState.samples) + " shadow rays for one small picture."
      : "A real Monte Carlo estimate. The grain is not a rendering error — it is the variance of an average taken from " + noiseState.samples + " random sample(s).";
  }

  // ==========================================================
  // Self-test
  // ------------------------------------------------------------
  // Run with ?selftest=1. Visits every instrument, redraws it, and
  // checks that it actually put ink on its canvas and filled its lists.
  // The result lands in <html data-selftest>, which the browser test
  // reads. It is cheap enough to leave in the shipped file.
  // ==========================================================
  function canvasHasInk(id) {
    var canvas = $(id);
    if (!canvas || !canvas.width) return false;
    var data;
    try {
      data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    } catch (error) {
      return false;
    }
    var seen = {};
    var count = 0;
    for (var i = 0; i < data.length; i += 4 * 29) {
      var key = data[i] + "," + data[i + 1] + "," + data[i + 2];
      if (!seen[key]) { seen[key] = true; count++; }
      if (count > 4) return true;
    }
    return false;
  }

  function selfTest() {
    var failures = [];
    function check(name, condition) { if (!condition) failures.push(name); }

    check("timeline stops", document.querySelectorAll("#timeline-track button").length === H.eras.length);
    check("stage rows", document.querySelectorAll(".stage-row").length === H.stageKeys.length);
    check("pipeline rail", document.querySelectorAll("#pipeline-rail button").length === H.pipeline.length);
    check("shader listing", document.querySelectorAll(".pl-line").length >= 8);
    check("mip pyramid", document.querySelectorAll(".mip-level").length >= 4);
    check("sources", document.querySelectorAll("#source-list li").length === H.sources.length);
    check("corner options", document.querySelectorAll("#tf-corner option").length === 8);
    check("coda grid", document.querySelectorAll("#coda-grid .stage-row-bar").length === H.stageKeys.length * 3);
    check("panel nav", document.querySelectorAll(".panel-next button").length === 11);
    check("experiment prompts", document.querySelectorAll(".section-tries").length === 10);
    check("ledger rows", document.querySelectorAll("#ledger-body .ledger-row").length > 25);
    check("ledger entries",
      document.querySelectorAll("#ledger-body .ledger-entry").length === H.ledger.apis.length + H.ledger.hardware.length);
    check("hero draws", canvasHasInk("hero-canvas"));

    var byTab = {
      pipeline: ["pipeline-canvas"],
      transform: ["transform-canvas"],
      raster: ["raster-canvas"],
      depth: ["depth-canvas", "depth-painter-canvas", "precision-canvas"],
      texture: ["texture-canvas"],
      shading: ["shading-canvas"],
      parallel: ["warp-canvas", "latency-canvas"],
      rays: ["rays-canvas", "noise-canvas"],
    };
    Object.keys(byTab).forEach(function (tab) {
      selectTab(tab);
      byTab[tab].forEach(function (id) {
        check(tab + " → " + id + " draws", canvasHasInk(id));
      });
    });

    selectTab("transform");
    check("transform traces a corner", document.querySelectorAll("#journey-body tr").length === 6);
    check("transform shows a matrix", document.querySelectorAll(".matrix-cell").length === 16);
    selectTab("pipeline");
    check("pipeline lists the vertices", document.querySelectorAll("#vertex-table-body tr").length === 3);
    selectTab("shading");
    check("shading explains itself", ($("shading-explain").textContent || "").length > 40);
    ["raster-stats", "depth-stats", "texture-stats", "parallel-stats", "rays-stats", "noise-stats", "latency-stats"]
      .forEach(function (id) {
        check(id + " populated", document.querySelectorAll("#" + id + " dd").length > 0);
      });

    // Every instrument must survive its own extremes, not just its defaults.
    var sweeps = [
      { tab: "raster", id: "rs-res" }, { tab: "raster", id: "rs-mode" },
      { tab: "depth", id: "dp-near" }, { tab: "depth", id: "dp-bits" }, { tab: "depth", id: "dp-scene" },
      { tab: "texture", id: "tx-perspective" }, { tab: "transform", id: "tf-dolly" },
      { tab: "texture", id: "tx-splits" }, { tab: "texture", id: "tx-mip" },
      { tab: "shading", id: "sh-tess" }, { tab: "shading", id: "sh-model" },
      { tab: "transform", id: "tf-distance" }, { tab: "transform", id: "tf-projection" },
      { tab: "parallel", id: "pl-coherence" }, { tab: "rays", id: "ry-bounces" },
    ];
    sweeps.forEach(function (sweep) {
      selectTab(sweep.tab);
      var control = $(sweep.id);
      if (!control) { failures.push("missing control " + sweep.id); return; }
      if (control.type === "checkbox") {
        try {
          control.checked = !control.checked;
          control.dispatchEvent(new Event("change", { bubbles: true }));
          control.checked = !control.checked;
          control.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (error) { failures.push(sweep.id + " threw: " + error.message); }
        return;
      }
      var original = control.value;
      var values = control.tagName === "SELECT"
        ? Array.prototype.map.call(control.options, function (o) { return o.value; })
        : [control.min, control.max];
      try {
        values.forEach(function (value) {
          control.value = value;
          control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
        });
      } catch (error) {
        failures.push(sweep.id + " threw: " + error.message);
      }
      control.value = original;
      control.dispatchEvent(new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    });

    selectTab("ledger");
    check("ledger cross-links", document.querySelectorAll(".ledger-link").length >= 15);
    selectTab("coda");
    check("coda renders", document.querySelectorAll("#coda-grid .coda-head").length === 4);
    selectTab("lineage");
    document.documentElement.dataset.selftest = failures.length ? "fail: " + failures.join("; ") : "pass";
  }

  // ==========================================================
  // Boot
  // ==========================================================
  function boot() {
    initTabs();
    initHero();
    initLineage();
    initPipeline();
    initTransform();
    initRaster();
    initDepth();
    initTexture();
    initShading();
    initParallel();
    initRays();
    initCoda();
    initLedger();
    initSources();

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(drawActive, 140);
    });

    addPanelNav();

    // Arriving at #depth should open the depth section, and the browser's
    // back button should move between sections rather than off the page.
    var initial = (window.location.hash || "").replace(/^#/, "");
    selectTab(TAB_ORDER.indexOf(initial) >= 0 ? initial : "lineage", false, { silent: !initial });
    window.addEventListener("hashchange", function () {
      var name = (window.location.hash || "").replace(/^#/, "");
      if (TAB_ORDER.indexOf(name) >= 0 && name !== activePanel) selectTab(name, false, { silent: true });
    });
    document.documentElement.dataset.appReady = "true";

    if (/[?&]selftest=1\b/.test(window.location.search)) {
      try {
        selfTest();
      } catch (error) {
        document.documentElement.dataset.selftest = "fail: threw " + error.message;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
