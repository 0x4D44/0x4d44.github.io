/* ============================================================
   Gradient descent — a ball rolling down a loss surface.
   The mechanism behind backpropagation and all of learning.
   Renders into #gradient.
   ============================================================ */
(function () {
  "use strict";

  function build() {
    var root = document.getElementById("gradient");
    if (!root || !window.ALM) return;
    var clamp = window.ALM.clamp;

    var W = 460, H = 360;
    var DOM = 2.6; // domain half-width in x; y scaled to aspect
    var canvas = document.createElement("canvas");
    canvas.style.border = "1px solid var(--rule)";
    var ctx = window.ALM.fitCanvas(canvas, W, H);

    // ---- surfaces: return {f, gx, gy} ----
    function gauss(x, y, cx, cy, s) { return Math.exp(-((x - cx) * (x - cx) + (y - cy) * (y - cy)) / s); }
    var surfaces = {
      bowl: {
        name: "Convex bowl",
        f: function (x, y) { return 0.5 * (x * x + y * y); },
        g: function (x, y) { return [x, y]; },
        note: "One global minimum. Gradient descent always finds it — eventually."
      },
      twin: {
        name: "Twin valleys",
        f: function (x, y) {
          return 0.12 * (x * x + y * y) - 1.4 * gauss(x, y, -1.2, -0.7, 0.9) - 1.0 * gauss(x, y, 1.3, 0.8, 0.8);
        },
        g: function (x, y) {
          var g1 = gauss(x, y, -1.2, -0.7, 0.9), g2 = gauss(x, y, 1.3, 0.8, 0.8);
          var gx = 0.24 * x - 1.4 * g1 * (-2 * (x + 1.2) / 0.9) - 1.0 * g2 * (-2 * (x - 1.3) / 0.8);
          var gy = 0.24 * y - 1.4 * g1 * (-2 * (y + 0.7) / 0.9) - 1.0 * g2 * (-2 * (y - 0.8) / 0.8);
          return [gx, gy];
        },
        note: "Two minima of different depth. Where you start decides where you land — local minima."
      },
      ravine: {
        name: "Ravine (ill-conditioned)",
        f: function (x, y) { return (0.5 * x * x + 8 * (y - 0.3 * x * x) * (y - 0.3 * x * x)) * 0.4; },
        g: function (x, y) {
          var t = (y - 0.3 * x * x);
          var gx = (x + 8 * 2 * t * (-0.6 * x)) * 0.4;
          var gy = (8 * 2 * t) * 0.4;
          return [gx, gy];
        },
        note: "A long curved valley. Too-large steps bounce off the walls; momentum smooths the ride."
      },
      saddle: {
        name: "Saddle",
        f: function (x, y) { return 0.4 * (x * x - y * y); },
        g: function (x, y) { return [0.8 * x, -0.8 * y]; },
        note: "Up one way, down the other. High-dimensional loss surfaces are full of these."
      }
    };
    var cur = "twin";

    // ---- state ----
    var pos = [-1.8, 1.6];
    var vel = [0, 0];
    var lr = 0.08, momentum = 0.0;
    var trail = [];
    var steps = 0, running = false, raf = null;

    // ---- coordinate transforms ----
    function X(x) { return (x / DOM + 1) / 2 * W; }
    function Y(y) { var dy = DOM * H / W; return (1 - (y / dy + 1) / 2) * H; }
    function invX(px) { return (px / W * 2 - 1) * DOM; }
    function invY(py) { var dy = DOM * H / W; return ((1 - py / H) * 2 - 1) * dy; }

    // ---- precompute loss range for coloring ----
    var lossField = null;
    function buildField() {
      var s = surfaces[cur];
      var cell = 4, cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
      var lo = Infinity, hi = -Infinity, vals = [];
      for (var j = 0; j < rows; j++) {
        for (var i = 0; i < cols; i++) {
          var v = s.f(invX(i * cell + cell / 2), invY(j * cell + cell / 2));
          vals.push(v); if (v < lo) lo = v; if (v > hi) hi = v;
        }
      }
      lossField = { cell: cell, cols: cols, rows: rows, vals: vals, lo: lo, hi: hi };
    }

    function tint(t) {
      // t in [0,1]: low loss -> deep green-black, high -> amber/red
      t = clamp(t, 0, 1);
      if (t < 0.5) {
        var u = t / 0.5; // green-black -> amber
        return "rgb(" + Math.round(10 + u * 90) + "," + Math.round(40 + u * 90) + "," + Math.round(20 + u * 10) + ")";
      } else {
        var v = (t - 0.5) / 0.5; // amber -> red
        return "rgb(" + Math.round(100 + v * 126) + "," + Math.round(130 - v * 90) + "," + Math.round(30 - v * 10) + ")";
      }
    }

    function draw() {
      var s = surfaces[cur];
      var f = lossField;
      // heatmap
      for (var j = 0; j < f.rows; j++) {
        for (var i = 0; i < f.cols; i++) {
          var v = f.vals[j * f.cols + i];
          var t = (v - f.lo) / (f.hi - f.lo + 1e-9);
          // gamma to spread low region
          ctx.fillStyle = tint(Math.pow(t, 0.7));
          ctx.fillRect(i * f.cell, j * f.cell, f.cell + 1, f.cell + 1);
        }
      }
      // contour lines (iso-loss)
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
      var levels = 9;
      for (var L = 1; L < levels; L++) {
        var target = f.lo + (f.hi - f.lo) * Math.pow(L / levels, 1.6);
        // marching-ish: draw cells crossing target
        for (var jj = 0; jj < f.rows - 1; jj++) {
          for (var ii = 0; ii < f.cols - 1; ii++) {
            var a = f.vals[jj * f.cols + ii], b = f.vals[jj * f.cols + ii + 1];
            if ((a - target) * (b - target) < 0) {
              ctx.fillStyle = "rgba(205,211,187,0.18)";
              ctx.fillRect(ii * f.cell, jj * f.cell, 1, f.cell);
            }
          }
        }
      }

      // trail
      ctx.strokeStyle = "rgba(95,198,212,0.9)"; ctx.lineWidth = 2;
      ctx.beginPath();
      trail.forEach(function (p, i) { if (i === 0) ctx.moveTo(X(p[0]), Y(p[1])); else ctx.lineTo(X(p[0]), Y(p[1])); });
      ctx.stroke();

      // ball
      var bx = X(pos[0]), by = Y(pos[1]);
      ctx.beginPath(); ctx.arc(bx, by, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#7ad96a"; ctx.shadowColor = "rgba(122,217,106,0.8)"; ctx.shadowBlur = 12;
      ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = 2; ctx.strokeStyle = "#eef2dd"; ctx.stroke();

      // gradient arrow
      var grad = s.g(pos[0], pos[1]);
      var gmag = Math.hypot(grad[0], grad[1]) + 1e-6;
      var ax = -grad[0] / gmag * 26, ay = grad[1] / gmag * 26; // screen y flips
      ctx.strokeStyle = "#eef2dd"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + ax, by + ay); ctx.stroke();
      // arrowhead
      var ang = Math.atan2(ay, ax);
      ctx.beginPath(); ctx.moveTo(bx + ax, by + ay);
      ctx.lineTo(bx + ax - 6 * Math.cos(ang - 0.4), by + ay - 6 * Math.sin(ang - 0.4));
      ctx.moveTo(bx + ax, by + ay);
      ctx.lineTo(bx + ax - 6 * Math.cos(ang + 0.4), by + ay - 6 * Math.sin(ang + 0.4));
      ctx.stroke();

      updateReadout();
    }

    function step() {
      var s = surfaces[cur];
      var g = s.g(pos[0], pos[1]);
      vel[0] = momentum * vel[0] - lr * g[0];
      vel[1] = momentum * vel[1] - lr * g[1];
      pos[0] = clamp(pos[0] + vel[0], -DOM, DOM);
      pos[1] = clamp(pos[1] + vel[1], -DOM * H / W, DOM * H / W);
      trail.push([pos[0], pos[1]]);
      if (trail.length > 400) trail.shift();
      steps++;
    }

    function loop() {
      step(); draw();
      var s = surfaces[cur];
      var g = s.g(pos[0], pos[1]);
      var settled = Math.hypot(g[0], g[1]) < 0.01 && Math.hypot(vel[0], vel[1]) < 0.005;
      if (settled || steps > 1200) { stop(); return; }
      raf = requestAnimationFrame(function () { setTimeout(loop, 28); });
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); btnRun.textContent = "Run"; btnRun.classList.remove("go"); }
    function start() { running = true; btnRun.textContent = "Pause"; btnRun.classList.add("go"); loop(); }
    function reset(np) { stop(); pos = np || [ (Math.random() * 2 - 1) * 2, (Math.random() * 2 - 1) * 1.6 ]; vel = [0, 0]; trail = [[pos[0], pos[1]]]; steps = 0; draw(); }

    // ---- UI ----
    var readout;
    function updateReadout() {
      var s = surfaces[cur];
      readout.innerHTML =
        '<span>step <b>' + steps + '</b></span>' +
        '<span>loss <b>' + s.f(pos[0], pos[1]).toFixed(3) + '</b></span>' +
        '<span>pos <b>(' + pos[0].toFixed(2) + ', ' + pos[1].toFixed(2) + ')</b></span>';
    }

    var wrapEl = document.createElement("div"); wrapEl.className = "gd-wrap";
    var left = document.createElement("div");
    left.appendChild(canvas);
    readout = document.createElement("div"); readout.className = "gd-readout";
    left.appendChild(readout);

    var right = document.createElement("div"); right.className = "gd-side";

    // surface selector
    var selWrap = document.createElement("div"); selWrap.className = "gd-surf";
    Object.keys(surfaces).forEach(function (k) {
      var b = document.createElement("button");
      b.className = "btn" + (k === cur ? " primary" : "");
      b.textContent = surfaces[k].name;
      b.onclick = function () {
        cur = k; buildField();
        selWrap.querySelectorAll(".btn").forEach(function (x) { x.classList.remove("primary"); });
        b.classList.add("primary");
        noteEl.textContent = surfaces[k].note;
        reset([-1.8, 1.6]);
      };
      selWrap.appendChild(b);
    });
    right.appendChild(selWrap);

    var ctlA = document.createElement("div"); ctlA.className = "ctl-row"; ctlA.style.marginTop = "12px";
    var btnStep = mkBtn("Step", function () { stop(); step(); draw(); });
    var btnRun = mkBtn("Run", function () { running ? stop() : start(); }); btnRun.classList.add("primary");
    var btnDrop = mkBtn("Drop ball (random)", function () { reset(); });
    ctlA.appendChild(btnStep); ctlA.appendChild(btnRun); ctlA.appendChild(btnDrop);
    right.appendChild(ctlA);

    var ctlB = document.createElement("div"); ctlB.className = "ctl-row"; ctlB.style.marginTop = "12px";
    var lrLab = document.createElement("label"); lrLab.className = "ctl";
    lrLab.innerHTML = 'learning rate · <span class="val">0.08</span>';
    var lrIn = document.createElement("input"); lrIn.type = "range"; lrIn.min = "0.005"; lrIn.max = "0.6"; lrIn.step = "0.005"; lrIn.value = "0.08";
    lrIn.oninput = function () { lr = +lrIn.value; lrLab.querySelector(".val").textContent = lr.toFixed(3); };
    lrLab.appendChild(lrIn);
    var moLab = document.createElement("label"); moLab.className = "ctl";
    moLab.innerHTML = 'momentum · <span class="val">0.0</span>';
    var moIn = document.createElement("input"); moIn.type = "range"; moIn.min = "0"; moIn.max = "0.95"; moIn.step = "0.05"; moIn.value = "0";
    moIn.oninput = function () { momentum = +moIn.value; moLab.querySelector(".val").textContent = momentum.toFixed(2); };
    moLab.appendChild(moIn);
    ctlB.appendChild(lrLab); ctlB.appendChild(moLab);
    right.appendChild(ctlB);

    var noteEl = document.createElement("p"); noteEl.className = "gd-note"; noteEl.textContent = surfaces[cur].note;
    right.appendChild(noteEl);

    var hint = document.createElement("p"); hint.className = "gd-note dim";
    hint.innerHTML = 'Click anywhere on the surface to place the ball there. The white arrow is the <em>negative gradient</em> — the steepest-downhill direction the ball follows at each step.';
    right.appendChild(hint);

    wrapEl.appendChild(left); wrapEl.appendChild(right);
    root.appendChild(wrapEl);

    canvas.addEventListener("click", function (e) {
      var r = canvas.getBoundingClientRect();
      reset([invX((e.clientX - r.left) / r.width * W), invY((e.clientY - r.top) / r.height * H)]);
    });
    canvas.style.cursor = "crosshair";

    buildField();
    reset([-1.8, 1.6]);

    function mkBtn(label, fn) { var b = document.createElement("button"); b.className = "btn"; b.textContent = label; b.onclick = fn; return b; }
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
