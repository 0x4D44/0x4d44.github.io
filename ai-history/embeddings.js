/* ============================================================
   Word embeddings — meaning as geometry. Vector arithmetic
   (king − man + woman ≈ queen) in a hand-laid-out 2-D space.
   Renders into #embeddings.
   ============================================================ */
(function () {
  "use strict";

  // Curated 2-D embedding. Families share parallel "relation" vectors,
  // so A − B + C lands exactly on the analogous word.
  var WORDS = {
    // gender family: male row y=3, female row y=6
    boy:[2,3], girl:[2,6], man:[4,3], woman:[4,6], prince:[6,3], princess:[6,6],
    king:[8,3], queen:[8,6], uncle:[10,3], aunt:[10,6], actor:[12,3], actress:[12,6],
    // country / capital: country y=10, capital y=13
    france:[2,10], italy:[5,10], japan:[8,10], germany:[11,10], spain:[14,10],
    paris:[2,13], rome:[5,13], tokyo:[8,13], berlin:[11,13], madrid:[14,13],
    // verb tense: present y=16, past y=18
    walk:[3,16], play:[6,16], jump:[9,16], work:[12,16],
    walked:[3,18], played:[6,18], jumped:[9,18], worked:[12,18]
  };
  var FAM = { gender:["boy","girl","man","woman","prince","princess","king","queen","uncle","aunt","actor","actress"],
              geo:["france","italy","japan","germany","spain","paris","rome","tokyo","berlin","madrid"],
              tense:["walk","play","jump","work","walked","played","jumped","worked"] };
  function famOf(w){ for(var k in FAM){ if(FAM[k].indexOf(w)>=0) return k; } return "gender"; }
  var FAMC = { gender:"#5fc6d4", geo:"#e2a64a", tense:"#a98fe0" };

  var PRESETS = [
    ["king","man","woman"], ["paris","france","italy"], ["queen","woman","man"],
    ["tokyo","japan","germany"], ["walked","walk","play"], ["actress","woman","man"]
  ];

  function build() {
    var root = document.getElementById("embeddings");
    if (!root || !window.ALM) return;

    var W = 480, H = 380, PAD = 30;
    var canvas = document.createElement("canvas");
    canvas.style.border = "1px solid var(--rule)";
    var ctx = window.ALM.fitCanvas(canvas, W, H);

    var XMAX = 16, YMAX = 19.5;
    function X(x){ return PAD + x / XMAX * (W - PAD*2); }
    function Y(y){ return H - PAD - y / YMAX * (H - PAD*2); }

    var A = "king", B = "man", C = "woman";
    var result = null;

    function analogy() {
      var a = WORDS[A], b = WORDS[B], c = WORDS[C];
      var tx = a[0] - b[0] + c[0], ty = a[1] - b[1] + c[1];
      var best = null, bd = 1e9;
      for (var w in WORDS) {
        if (w === A || w === B || w === C) continue;
        var dx = WORDS[w][0] - tx, dy = WORDS[w][1] - ty, d = dx*dx + dy*dy;
        if (d < bd) { bd = d; best = w; }
      }
      result = { word: best, tx: tx, ty: ty, dist: Math.sqrt(bd) };
    }

    function draw() {
      ctx.clearRect(0,0,W,H);
      // faint grid
      ctx.strokeStyle = "rgba(205,211,187,0.05)"; ctx.lineWidth = 1;
      for (var gx=0; gx<=XMAX; gx+=2){ ctx.beginPath(); ctx.moveTo(X(gx),Y(0)); ctx.lineTo(X(gx),Y(YMAX)); ctx.stroke(); }
      for (var gy=0; gy<=YMAX; gy+=2){ ctx.beginPath(); ctx.moveTo(X(0),Y(gy)); ctx.lineTo(X(XMAX),Y(gy)); ctx.stroke(); }

      // result vectors: B->A and C->result (parallel)
      if (result) {
        var a=WORDS[A], b=WORDS[B], c=WORDS[C];
        drawArrow(X(b[0]),Y(b[1]),X(a[0]),Y(a[1]),"rgba(122,217,106,0.5)");
        drawArrow(X(c[0]),Y(c[1]),X(result.tx),Y(result.ty),"rgba(122,217,106,0.9)");
      }

      // words
      ctx.font = "12px JetBrains Mono, monospace";
      for (var w in WORDS) {
        var p = WORDS[w], px = X(p[0]), py = Y(p[1]);
        var active = (w===A||w===B||w===C);
        var isRes = result && w===result.word;
        ctx.beginPath(); ctx.arc(px,py, isRes?6:3.5, 0, Math.PI*2);
        ctx.fillStyle = isRes ? "#7ad96a" : FAMC[famOf(w)];
        if (isRes){ ctx.shadowColor="rgba(122,217,106,0.9)"; ctx.shadowBlur=12; }
        ctx.fill(); ctx.shadowBlur=0;
        ctx.fillStyle = active ? "#eef2dd" : (isRes ? "#7ad96a" : "rgba(205,211,187,0.6)");
        if (active || isRes) ctx.font = "700 12px JetBrains Mono, monospace"; else ctx.font = "12px JetBrains Mono, monospace";
        ctx.textAlign = "left";
        ctx.fillText(w, px + 7, py + 4);
      }

      // target marker
      if (result) {
        ctx.strokeStyle = "rgba(238,242,221,0.8)"; ctx.lineWidth = 1.5;
        var rx=X(result.tx), ry=Y(result.ty);
        ctx.beginPath(); ctx.moveTo(rx-6,ry); ctx.lineTo(rx+6,ry); ctx.moveTo(rx,ry-6); ctx.lineTo(rx,ry+6); ctx.stroke();
      }
      updateReadout();
    }

    function drawArrow(x1,y1,x2,y2,col){
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      var ang = Math.atan2(y2-y1, x2-x1);
      ctx.beginPath(); ctx.moveTo(x2,y2);
      ctx.lineTo(x2-9*Math.cos(ang-0.4), y2-9*Math.sin(ang-0.4));
      ctx.moveTo(x2,y2);
      ctx.lineTo(x2-9*Math.cos(ang+0.4), y2-9*Math.sin(ang+0.4));
      ctx.stroke();
    }

    // ---- UI ----
    var eqEl, readout;
    function updateReadout() {
      eqEl.innerHTML = '<b class="a">'+A+'</b> − <b class="b">'+B+'</b> + <b class="c">'+C+'</b> ≈ ' +
        '<b class="r">'+(result?result.word:"?")+'</b>';
      readout.innerHTML = result ?
        ('nearest vector · distance <b>'+result.dist.toFixed(2)+'</b>' + (result.dist<0.01?' · <span class="exact">exact match</span>':'')) : '';
    }

    var wrapEl = document.createElement("div"); wrapEl.className="emb-wrap";
    var left = document.createElement("div");
    left.appendChild(canvas);
    eqEl = document.createElement("div"); eqEl.className="emb-eq"; left.appendChild(eqEl);
    readout = document.createElement("div"); readout.className="emb-read"; left.appendChild(readout);

    var right = document.createElement("div"); right.className="emb-side";
    right.innerHTML = '<div class="emb-h">Analogy:  A − B + C ≈ ?</div>';

    function mkSel(letter, getv, setv){
      var lab = document.createElement("label"); lab.className="emb-sel";
      lab.innerHTML = '<span class="sl '+letter.toLowerCase()+'">'+letter+'</span>';
      var sel = document.createElement("select");
      Object.keys(WORDS).forEach(function(w){
        var o=document.createElement("option"); o.value=w; o.textContent=w; if(w===getv()) o.selected=true; sel.appendChild(o);
      });
      sel.onchange = function(){ setv(sel.value); analogy(); draw(); };
      lab.appendChild(sel);
      return lab;
    }
    var selRow = document.createElement("div"); selRow.className="emb-selrow";
    selRow.appendChild(mkSel("A", function(){return A;}, function(v){A=v;}));
    selRow.appendChild(mkSel("B", function(){return B;}, function(v){B=v;}));
    selRow.appendChild(mkSel("C", function(){return C;}, function(v){C=v;}));
    right.appendChild(selRow);

    var presetH = document.createElement("div"); presetH.className="emb-h"; presetH.style.marginTop="14px"; presetH.textContent="Try these:";
    right.appendChild(presetH);
    var pr = document.createElement("div"); pr.className="emb-presets";
    PRESETS.forEach(function(p){
      var b=document.createElement("button"); b.className="btn"; b.style.fontSize="11px"; b.style.padding="5px 9px";
      b.textContent = p[0]+"−"+p[1]+"+"+p[2];
      b.onclick = function(){ A=p[0]; B=p[1]; C=p[2]; rebuildSelects(); analogy(); draw(); };
      pr.appendChild(b);
    });
    right.appendChild(pr);

    var note = document.createElement("p"); note.className="emb-note";
    note.innerHTML = 'Each colour is a family — <span style="color:#5fc6d4">gender</span>, <span style="color:#e2a64a">country/capital</span>, <span style="color:#a98fe0">verb tense</span>. The relationship between two words is a <em>direction</em>, and the same direction repeats across the family. That parallel structure is what makes the arithmetic work.';
    right.appendChild(note);

    function rebuildSelects(){
      selRow.querySelectorAll("select").forEach(function(sel,i){
        sel.value = [A,B,C][i];
      });
    }

    wrapEl.appendChild(left); wrapEl.appendChild(right);
    root.appendChild(wrapEl);

    analogy(); draw();
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
