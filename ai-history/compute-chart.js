/* Enabling-tech: training compute over time (log scale).
   Interactive — hover/click points for the model behind each jump.
   Renders into #compute-chart. */
(function () {
  "use strict";

  // Approximate training compute in FLOPs (order-of-magnitude, illustrative).
  var PTS = [
    { y: 1957, f: 1e5,  n: "Perceptron",  note: "Rosenblatt's Mark I — analog hardware." },
    { y: 1989, f: 1e9,  n: "LeNet",       note: "CNN for digit recognition." },
    { y: 1997, f: 5e10, n: "Deep Blue",   note: "Custom chess chips — search, not learning." },
    { y: 2012, f: 1e18, n: "AlexNet",     note: "Two GPUs, 6 days. The GPU era begins." },
    { y: 2016, f: 1e21, n: "AlphaGo",     note: "Policy + value nets + tree search." },
    { y: 2018, f: 1e21, n: "GPT-1/BERT",  note: "Transformers go large." },
    { y: 2020, f: 3e23, n: "GPT-3",       note: "175B params. ~$5M+ of compute." },
    { y: 2023, f: 2e25, n: "GPT-4-class", note: "Estimated; multimodal frontier models." },
    { y: 2025, f: 1e26, n: "Frontier",    note: "Tens of thousands of accelerators, months of training." }
  ];

  function build() {
    var root = document.getElementById("compute-chart");
    if (!root || !window.ALM) return;

    var W = Math.min(root.clientWidth || 640, 760);
    var H = 300;
    var canvas = document.createElement("canvas");
    root.appendChild(canvas);
    var ctx = window.ALM.fitCanvas(canvas, W, H);

    var info = document.createElement("div");
    info.className = "cc-info";
    info.innerHTML = '<b>AlexNet · 2012</b> — Two GPUs, 6 days. The GPU era begins.';
    root.appendChild(info);

    var mL = 54, mR = 16, mT = 18, mB = 34;
    var x0 = mL, x1 = W - mR, yb = H - mB, yt = mT;
    var minY = 1955, maxY = 2026;
    var minE = 4, maxE = 27; // log10 FLOPs range

    function px(y) { return x0 + (y - minY) / (maxY - minY) * (x1 - x0); }
    function py(f) { var e = Math.log10(f); return yb - (e - minE) / (maxE - minE) * (yb - yt); }

    var hover = -1;

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // grid: log decades
      ctx.font = "10px JetBrains Mono, monospace";
      for (var e = minE; e <= maxE; e += 2) {
        var y = py(Math.pow(10, e));
        ctx.strokeStyle = "rgba(205,211,187,0.08)";
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.fillStyle = "#76835f";
        ctx.textAlign = "right";
        ctx.fillText("1e" + e, x0 - 8, y + 3);
      }
      // year axis
      ctx.textAlign = "center";
      for (var yr = 1960; yr <= 2020; yr += 20) {
        var xx = px(yr);
        ctx.strokeStyle = "rgba(205,211,187,0.06)";
        ctx.beginPath(); ctx.moveTo(xx, yt); ctx.lineTo(xx, yb); ctx.stroke();
        ctx.fillStyle = "#76835f";
        ctx.fillText(yr, xx, yb + 18);
      }
      ctx.fillStyle = "#76835f";
      ctx.textAlign = "left";
      ctx.fillText("training compute (FLOPs, log scale)", x0 - 44, yt - 6);

      // line
      ctx.strokeStyle = "#e2a64a";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(226,166,74,0.6)"; ctx.shadowBlur = 8;
      ctx.beginPath();
      PTS.forEach(function (p, i) {
        var X = px(p.y), Y = py(p.f);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      // points
      PTS.forEach(function (p, i) {
        var X = px(p.y), Y = py(p.f);
        ctx.fillStyle = i === hover ? "#7ad96a" : "#0a0b08";
        ctx.strokeStyle = i === hover ? "#7ad96a" : "#e2a64a";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X, Y, i === hover ? 6 : 4, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        if (i === hover || i === PTS.length - 1 || i === 0) {
          ctx.fillStyle = "#cdd3bb";
          ctx.textAlign = X > W - 90 ? "right" : "left";
          ctx.fillText(p.n, X + (X > W - 90 ? -8 : 8), Y - 8);
        }
      });
    }

    function nearest(mx, my) {
      var best = -1, bd = 1e9;
      PTS.forEach(function (p, i) {
        var dx = px(p.y) - mx, dy = py(p.f) - my;
        var d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      });
      return bd < 900 ? best : -1;
    }

    canvas.addEventListener("mousemove", function (e) {
      var r = canvas.getBoundingClientRect();
      var i = nearest(e.clientX - r.left, e.clientY - r.top);
      if (i !== hover) {
        hover = i; draw();
        if (i >= 0) info.innerHTML = "<b>" + PTS[i].n + " · " + PTS[i].y + "</b> — " + PTS[i].note;
      }
    });
    canvas.style.cursor = "crosshair";

    draw();
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
