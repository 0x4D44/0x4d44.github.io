/* ============================================================
   Perceptron trainer — Rosenblatt's 1957 learning machine.
   A single neuron with two inputs learns a linear boundary.
   Renders into #perceptron.
   ============================================================ */
(function () {
  "use strict";

  function build() {
    var root = document.getElementById("perceptron");
    if (!root || !window.ALM) return;
    var clamp = window.ALM.clamp;

    var W = 480, H = 360;
    var canvas = document.createElement("canvas");
    canvas.style.border = "1px solid var(--rule)";
    var ctx = window.ALM.fitCanvas(canvas, W, H);

    // ---- state ----
    var w = [0.4, -0.6], b = 0.1;   // weights + bias
    var lr = 0.05;
    var epoch = 0;
    var running = false, raf = null;
    var act = "step";               // step | sign | sigmoid
    var pts = [];

    function genData(spread) {
      pts = [];
      // a "true" separating line the data respects
      var tw = [0.8, 0.5], tb = -0.05;
      for (var i = 0; i < 40; i++) {
        var x = (Math.random() * 2 - 1) * 0.92;
        var y = (Math.random() * 2 - 1) * 0.92;
        var s = tw[0] * x + tw[1] * y + tb;
        // margin so it's separable; spread injects a little noise
        if (Math.abs(s) < 0.12) { i--; continue; }
        var label = s > 0 ? 1 : 0;
        if (Math.random() < spread) label = 1 - label; // noise
        pts.push({ x: x, y: y, l: label });
      }
    }

    function activate(z) {
      if (act === "sign" || act === "step") return z >= 0 ? 1 : 0;
      return 1 / (1 + Math.exp(-z * 4)) >= 0.5 ? 1 : 0;
    }
    function rawZ(p) { return w[0] * p.x + w[1] * p.y + b; }

    function accuracy() {
      var ok = 0;
      pts.forEach(function (p) { if (activate(rawZ(p)) === p.l) ok++; });
      return ok / pts.length;
    }

    // one pass of the perceptron rule
    function trainEpoch() {
      var changed = 0;
      pts.forEach(function (p) {
        var pred = activate(rawZ(p));
        var err = p.l - pred;
        if (err !== 0) {
          w[0] += lr * err * p.x;
          w[1] += lr * err * p.y;
          b    += lr * err;
          changed++;
        }
      });
      epoch++;
      return changed;
    }

    // ---- drawing ----
    function X(x) { return (x + 1) / 2 * W; }
    function Y(y) { return (1 - (y + 1) / 2) * H; }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // shaded half-planes by current boundary
      var img = ctx.createImageData(W, H);
      // cheap fill: sample a coarse grid for tint, then full points
      var step = 6;
      ctx.save();
      for (var sx = 0; sx < W; sx += step) {
        for (var sy = 0; sy < H; sy += step) {
          var dx = sx / W * 2 - 1;
          var dy = (1 - sy / H) * 2 - 1;
          var z = w[0] * dx + w[1] * dy + b;
          ctx.fillStyle = z >= 0 ? "rgba(95,198,212,0.08)" : "rgba(226,97,74,0.07)";
          ctx.fillRect(sx, sy, step, step);
        }
      }
      ctx.restore();

      // axes
      ctx.strokeStyle = "rgba(205,211,187,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(0), 0); ctx.lineTo(X(0), H);
      ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();

      // boundary line  w0*x + w1*y + b = 0  ->  y = -(w0*x + b)/w1
      ctx.strokeStyle = "#e2a64a";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(226,166,74,0.6)"; ctx.shadowBlur = 8;
      ctx.beginPath();
      if (Math.abs(w[1]) > 1e-4) {
        var yL = -(w[0] * -1 + b) / w[1];
        var yR = -(w[0] *  1 + b) / w[1];
        ctx.moveTo(X(-1), Y(yL)); ctx.lineTo(X(1), Y(yR));
      } else {
        var xV = -b / (w[0] || 1e-4);
        ctx.moveTo(X(xV), 0); ctx.lineTo(X(xV), H);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // points
      pts.forEach(function (p) {
        var ok = activate(rawZ(p)) === p.l;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), 5, 0, Math.PI * 2);
        ctx.fillStyle = p.l === 1 ? "#5fc6d4" : "#e2614a";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = ok ? "rgba(122,217,106,0.9)" : "rgba(238,242,221,0.95)";
        if (!ok) { ctx.setLineDash([2, 2]); } else { ctx.setLineDash([]); }
        ctx.stroke();
        ctx.setLineDash([]);
      });

      updateReadout();
    }

    // ---- UI ----
    var readout;
    function updateReadout() {
      readout.innerHTML =
        '<span>w₁ <b>' + w[0].toFixed(2) + '</b></span>' +
        '<span>w₂ <b>' + w[1].toFixed(2) + '</b></span>' +
        '<span>bias <b>' + b.toFixed(2) + '</b></span>' +
        '<span>epoch <b>' + epoch + '</b></span>' +
        '<span>acc <b class="' + (accuracy() > 0.95 ? 'good' : '') + '">' + Math.round(accuracy() * 100) + '%</b></span>';
    }

    function loop() {
      if (!running) return;
      var changed = trainEpoch();
      draw();
      if (changed === 0 || epoch > 400) { stop(); return; }
      raf = requestAnimationFrame(function () { setTimeout(loop, 90); });
    }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); btnTrain.textContent = "Auto-train"; btnTrain.classList.remove("go"); }
    function start() { running = true; btnTrain.textContent = "Pause"; btnTrain.classList.add("go"); loop(); }

    // layout
    var wrapEl = document.createElement("div");
    wrapEl.className = "pc-wrap";

    var left = document.createElement("div");
    left.appendChild(canvas);
    readout = document.createElement("div");
    readout.className = "pc-readout";
    left.appendChild(readout);

    var right = document.createElement("div");
    right.className = "pc-side";

    // neuron diagram (svg)
    right.innerHTML =
      '<div class="pc-neuron">' +
        '<svg viewBox="0 0 220 150" class="pc-svg">' +
          '<text x="6" y="34" class="t">x₁</text><text x="6" y="78" class="t">x₂</text><text x="6" y="118" class="t">1</text>' +
          '<line x1="26" y1="30" x2="120" y2="75"/><line x1="26" y1="74" x2="120" y2="75"/><line x1="26" y1="113" x2="120" y2="75"/>' +
          '<text x="58" y="44" class="w" id="pc-w1">w₁</text><text x="58" y="92" class="w" id="pc-w2">w₂</text><text x="60" y="118" class="w" id="pc-wb">b</text>' +
          '<circle cx="135" cy="75" r="17"/><text x="128" y="80" class="s">Σ</text>' +
          '<line x1="152" y1="75" x2="180" y2="75"/>' +
          '<rect x="180" y="62" width="30" height="26"/><path d="M184 84 L196 84 L196 68 L206 68" class="act"/>' +
        '</svg>' +
      '</div>';

    var ctlA = document.createElement("div");
    ctlA.className = "ctl-row";
    ctlA.style.marginTop = "12px";
    var btnStep = mkBtn("Step ×1", function () { stop(); trainEpoch(); draw(); });
    var btnTrain = mkBtn("Auto-train", function () { running ? stop() : start(); });
    btnTrain.classList.add("primary");
    var btnReset = mkBtn("Reset weights", function () { stop(); w = [Math.random() - 0.5, Math.random() - 0.5]; b = Math.random() * 0.4 - 0.2; epoch = 0; draw(); });
    ctlA.appendChild(btnStep); ctlA.appendChild(btnTrain); ctlA.appendChild(btnReset);

    var ctlB = document.createElement("div");
    ctlB.className = "ctl-row";
    ctlB.style.marginTop = "12px";
    // learning rate
    var lrLab = document.createElement("label");
    lrLab.className = "ctl";
    lrLab.innerHTML = 'learning rate · <span class="val">0.05</span>';
    var lrIn = document.createElement("input");
    lrIn.type = "range"; lrIn.min = "0.005"; lrIn.max = "0.5"; lrIn.step = "0.005"; lrIn.value = "0.05";
    lrIn.oninput = function () { lr = +lrIn.value; lrLab.querySelector(".val").textContent = lr.toFixed(3); };
    lrLab.appendChild(lrIn);
    // noise
    var nzLab = document.createElement("label");
    nzLab.className = "ctl";
    nzLab.innerHTML = 'data noise · <span class="val">0%</span>';
    var nzIn = document.createElement("input");
    nzIn.type = "range"; nzIn.min = "0"; nzIn.max = "0.3"; nzIn.step = "0.02"; nzIn.value = "0";
    var noise = 0;
    nzIn.oninput = function () { noise = +nzIn.value; nzLab.querySelector(".val").textContent = Math.round(noise * 100) + "%"; stop(); genData(noise); epoch = 0; draw(); };
    nzLab.appendChild(nzIn);
    ctlB.appendChild(lrLab); ctlB.appendChild(nzLab);

    right.appendChild(ctlA);
    right.appendChild(ctlB);

    var hint = document.createElement("p");
    hint.className = "pc-hint";
    hint.innerHTML = 'Click the plot to drop a point (toggles class). With clean, linearly-separable data the perceptron rule is guaranteed to converge — that was Rosenblatt\'s celebrated theorem. Add noise and watch it thrash forever: a hint of the trouble to come.';
    right.appendChild(hint);

    wrapEl.appendChild(left);
    wrapEl.appendChild(right);
    root.appendChild(wrapEl);

    // click to add point
    var addClass = 1;
    canvas.addEventListener("click", function (e) {
      var r = canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width * 2 - 1;
      var y = (1 - (e.clientY - r.top) / r.height) * 2 - 1;
      pts.push({ x: clamp(x, -1, 1), y: clamp(y, -1, 1), l: addClass });
      addClass = 1 - addClass;
      draw();
    });
    canvas.style.cursor = "crosshair";

    genData(0);
    draw();

    function mkBtn(label, fn) {
      var b = document.createElement("button");
      b.className = "btn"; b.textContent = label; b.onclick = fn;
      return b;
    }
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
