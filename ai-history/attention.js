/* ============================================================
   Attention visualizer — type a sentence, watch tokens attend.
   Heuristic multi-head attention (no real weights, but it
   reproduces the interpretable patterns real heads learn).
   Renders into #attention.
   ============================================================ */
(function () {
  "use strict";

  var DET = "the a an this that these those his her its their my your our".split(" ");
  var PRON = "it he she they them him her i we you who which".split(" ");
  var PREP = "on in at of to for with from by because after before over under near".split(" ");
  var VERB = "sat was is are were be been ran saw ate slept chased caught held made saw went tired sleeping running".split(" ");

  function cat(t){
    t = t.toLowerCase();
    if (DET.indexOf(t)>=0) return "det";
    if (PRON.indexOf(t)>=0) return "pron";
    if (PREP.indexOf(t)>=0) return "prep";
    if (VERB.indexOf(t)>=0) return "verb";
    return "content";
  }
  function isContent(t){ return cat(t)==="content"; }

  var HEADS = [
    { id:"local",  name:"Head 1 · previous-token", col:"#5fc6d4" },
    { id:"coref",  name:"Head 2 · coreference",    col:"#7ad96a" },
    { id:"syntax", name:"Head 3 · syntax / phrase", col:"#e2a64a" },
    { id:"content",name:"Head 4 · content match",  col:"#a98fe0" }
  ];

  function build() {
    var root = document.getElementById("attention");
    if (!root || !window.ALM) return;

    var tokens = [];
    var head = "coref";
    var query = -1;     // selected query token
    var attn = [];      // attn[i][j]
    var sharp = 1.4;

    function tokenize(s){
      var raw = s.trim().split(/\s+/).filter(Boolean);
      return raw.map(function(w){ return w.replace(/[.,!?;:]+$/,""); }).filter(Boolean).slice(0, 14);
    }

    function softmax(arr, T){
      var m = Math.max.apply(null, arr);
      var ex = arr.map(function(v){ return Math.exp((v-m)*T); });
      var s = ex.reduce(function(a,b){return a+b;},0) || 1;
      return ex.map(function(v){ return v/s; });
    }

    function compute(){
      var n = tokens.length;
      attn = [];
      for (var i=0;i<n;i++){
        var row = [];
        for (var j=0;j<n;j++){
          row.push(score(i,j,n));
        }
        attn.push(softmax(row, sharp));
      }
    }

    function score(i,j,n){
      var ti = tokens[i], tj = tokens[j];
      var ci = cat(ti), cj = cat(tj);
      var dist = i-j;
      var ad = Math.abs(dist);
      switch(head){
        case "local":
          // attend to immediately previous tokens
          if (j>i) return -4;
          if (j===i) return -1.5;
          return 3 - (i-j)*1.3;
        case "coref":
          // pronouns -> earlier nouns (content); else mild local
          if (ci==="pron"){
            if (j<i && cj==="content") return 3.2 - (i-j)*0.25;
            return -2 - ad*0.1;
          }
          if (cj==="content" && j<=i) return 1.2 - ad*0.3;
          return -1 - ad*0.2;
        case "syntax":
          // determiners/adjectives -> nearest content to the right; prepositions -> content to right; verbs -> subject (content to left)
          if (ci==="det"){ if (j>i && cj==="content") return 3 - (j-i)*0.7; return -2; }
          if (ci==="prep"){ if (j>i && cj==="content") return 2.6 - (j-i)*0.6; if (j<i && cj==="content") return 1 - (i-j)*0.4; return -1.5; }
          if (ci==="verb"){ if (j<i && cj==="content") return 2.4 - (i-j)*0.3; return -1; }
          return 1.5 - ad*0.5;
        case "content":
          var s = 0;
          if (ti.toLowerCase()===tj.toLowerCase() && i!==j) s += 3;       // same word
          if (ci===cj) s += 1.2;                                          // same category
          if (ci==="content" && cj==="content") s += 0.8;
          s -= ad*0.12;
          if (i===j) s += 0.5;
          return s;
      }
      return 0;
    }

    // ---- layout / canvas ----
    var W = 660, H = 230;
    var canvas = document.createElement("canvas");
    canvas.style.border = "1px solid var(--rule)";
    var ctx = window.ALM.fitCanvas(canvas, W, H);
    var pos = []; // token x positions

    function measure(){
      ctx.font = "14px JetBrains Mono, monospace";
      var gap = 14, x = 18;
      pos = [];
      for (var i=0;i<tokens.length;i++){
        var w = ctx.measureText(tokens[i]).width + 18;
        pos.push({ x:x, w:w, cx:x+w/2 });
        x += w + gap;
      }
      // scale down if overflow
      var total = x;
      if (total > W-12){
        var sc = (W-24)/total;
        var nx = 12;
        for (var k=0;k<pos.length;k++){ pos[k].w*=sc; pos[k].x=nx; pos[k].cx=nx+pos[k].w/2; nx += pos[k].w + gap*sc; }
      }
    }

    function draw(){
      ctx.clearRect(0,0,W,H);
      var yTok = H-46, tokH = 30;
      var hc = (HEADS.find(function(h){return h.id===head;})||{}).col || "#e2a64a";

      // arcs for the selected query (or all-faded if none)
      if (query>=0){
        var row = attn[query];
        for (var j=0;j<tokens.length;j++){
          var wgt = row[j];
          if (wgt < 0.04) continue;
          var x1 = pos[query].cx, x2 = pos[j].cx;
          var peak = yTok - 18 - Math.min(150, Math.abs(x1-x2)*0.5 + 22);
          ctx.strokeStyle = hexA(hc, 0.15 + wgt*0.85);
          ctx.lineWidth = 1 + wgt*7;
          ctx.beginPath();
          ctx.moveTo(x1, yTok-4);
          ctx.quadraticCurveTo((x1+x2)/2, peak, x2, yTok-4);
          ctx.stroke();
        }
      }

      // tokens
      ctx.font = "14px JetBrains Mono, monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (var i=0;i<tokens.length;i++){
        var p = pos[i];
        var recv = query>=0 ? attn[query][i] : 0;
        // bg tint by received attention
        ctx.fillStyle = query>=0 ? hexA(hc, recv*0.85) : "rgba(20,22,13,0.8)";
        ctx.fillRect(p.x, yTok-tokH/2, p.w, tokH);
        ctx.strokeStyle = (i===query) ? "#eef2dd" : "rgba(205,211,187,0.25)";
        ctx.lineWidth = (i===query)?2:1;
        ctx.strokeRect(p.x, yTok-tokH/2, p.w, tokH);
        ctx.fillStyle = (query>=0 && recv>0.4) ? "#0a0b08" : "#cdd3bb";
        ctx.fillText(tokens[i], p.cx, yTok);
        // weight number
        if (query>=0 && recv>0.04){
          ctx.fillStyle = hexA(hc, 0.5+recv*0.5); ctx.font="9px JetBrains Mono";
          ctx.fillText(Math.round(recv*100)+"", p.cx, yTok+tokH/2+9);
          ctx.font = "14px JetBrains Mono, monospace";
        }
      }

      // caption
      ctx.textAlign="left"; ctx.fillStyle="#76835f"; ctx.font="11px JetBrains Mono";
      ctx.fillText(query>=0? ('query: "'+tokens[query]+'"  →  attends to highlighted tokens') : 'click a token to make it the query', 16, 20);
    }

    function hexA(hex, a){
      var r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
      return "rgba("+r+","+g+","+b+","+window.ALM.clamp(a,0,1).toFixed(3)+")";
    }

    canvas.addEventListener("click", function(e){
      var r = canvas.getBoundingClientRect();
      var mx = (e.clientX-r.left)/r.width*W;
      var my = (e.clientY-r.top)/r.height*H;
      if (my < H-46-22 || my > H-46+22) { return; }
      for (var i=0;i<pos.length;i++){ if (mx>=pos[i].x && mx<=pos[i].x+pos[i].w){ query = (query===i?-1:i); draw(); return; } }
    });
    canvas.style.cursor="pointer";

    // ---- UI ----
    var wrapEl = document.createElement("div"); wrapEl.className="at-wrap";

    var inputRow = document.createElement("div"); inputRow.className="at-inputrow";
    var input = document.createElement("input"); input.type="text"; input.value="the cat sat on the mat because it was tired"; input.className="at-input";
    var goBtn = document.createElement("button"); goBtn.className="btn primary"; goBtn.textContent="Tokenize";
    function reload(){ tokens = tokenize(input.value); query = -1; measure(); compute(); draw(); }
    goBtn.onclick = reload;
    input.addEventListener("keydown", function(e){ if(e.key==="Enter") reload(); });
    inputRow.appendChild(input); inputRow.appendChild(goBtn);

    var presetRow = document.createElement("div"); presetRow.className="at-presets";
    ["the cat sat on the mat because it was tired",
     "she gave the book to her brother",
     "the trophy did not fit in the suitcase because it was too big"].forEach(function(s){
      var b=document.createElement("button"); b.className="btn"; b.style.fontSize="11px"; b.style.padding="5px 9px";
      b.textContent = s.length>26? s.slice(0,26)+"…" : s;
      b.title = s;
      b.onclick=function(){ input.value=s; reload(); };
      presetRow.appendChild(b);
    });

    var headRow = document.createElement("div"); headRow.className="at-heads";
    HEADS.forEach(function(h){
      var b=document.createElement("button"); b.className="btn"+(h.id===head?" primary":"");
      b.textContent=h.name; b.style.fontSize="11px";
      b.onclick=function(){ head=h.id; headRow.querySelectorAll(".btn").forEach(function(x){x.classList.remove("primary");}); b.classList.add("primary"); compute(); draw(); };
      headRow.appendChild(b);
    });

    wrapEl.appendChild(inputRow);
    wrapEl.appendChild(presetRow);
    wrapEl.appendChild(canvas);
    wrapEl.appendChild(headRow);
    root.appendChild(wrapEl);

    reload();
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
