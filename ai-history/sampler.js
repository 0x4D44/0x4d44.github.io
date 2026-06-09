/* ============================================================
   Next-token sampler — a tiny trigram language model.
   Shows the probability distribution, temperature & top-k.
   Renders into #sampler.
   ============================================================ */
(function () {
  "use strict";

  // A small themed corpus. Repetition gives the model interesting choices.
  var CORPUS = (
    "the machine learns to predict the next token from the tokens before it . " +
    "the model reads the text and the model writes the text . " +
    "a neural network learns patterns from data and a neural network predicts patterns in data . " +
    "the cat sat on the mat and the cat was tired . " +
    "the cat chased the mouse and the mouse ran away . " +
    "intelligence is the ability to predict the world and to act in the world . " +
    "the transformer reads every token and attends to every other token . " +
    "language is a sequence of tokens and meaning is a pattern of tokens . " +
    "a model that predicts the next word can write a sentence one word at a time . " +
    "the future is hard to predict but the past is easy to remember . " +
    "the network was trained on the text and the network learned the text . " +
    "to predict is to compress and to compress is to understand . " +
    "the cat sat on the mat and the dog sat on the floor . " +
    "data and compute and clever algorithms made the model learn . "
  ).toLowerCase().split(/\s+/).filter(Boolean);

  function build() {
    var root = document.getElementById("sampler");
    if (!root || !window.ALM) return;

    // trigram + bigram models
    var tri = {}, bi = {};
    for (var i=0;i<CORPUS.length-1;i++){
      var w1 = CORPUS[i], w2 = CORPUS[i+1];
      (bi[w1] = bi[w1] || {})[w2] = (bi[w1][w2]||0)+1;
      if (i<CORPUS.length-2){
        var key = w1+" "+w2, w3 = CORPUS[i+2];
        (tri[key] = tri[key] || {})[w3] = (tri[key][w3]||0)+1;
      }
    }

    var seq = ["the","model"];
    var temp = 0.8, topk = 5, greedy = false;
    var running = false, raf=null;

    function dist(){
      var key = seq.slice(-2).join(" ");
      var counts = tri[key] || bi[seq[seq.length-1]] || {};
      var entries = Object.keys(counts).map(function(w){ return [w, counts[w]]; });
      if (!entries.length) entries = [[".",1]];
      // base probs
      var total = entries.reduce(function(a,e){return a+e[1];},0);
      entries.forEach(function(e){ e.push(e[1]/total); }); // e[2] base prob
      // temperature on logits: p^(1/T)
      var T = Math.max(0.05, temp);
      var adj = entries.map(function(e){ return [e[0], Math.pow(e[2], 1/T)]; });
      // sort desc, apply top-k
      adj.sort(function(a,b){ return b[1]-a[1]; });
      var kept = adj.slice(0, greedy?1:topk);
      var ks = kept.reduce(function(a,e){return a+e[1];},0) || 1;
      kept.forEach(function(e){ e.push(e[1]/ks); }); // e[2] final prob
      return { all: adj, kept: kept, base: entries };
    }

    function sampleNext(){
      var d = dist();
      var pick;
      if (greedy){ pick = d.kept[0][0]; }
      else {
        var r = Math.random(), acc=0; pick = d.kept[d.kept.length-1][0];
        for (var i=0;i<d.kept.length;i++){ acc += d.kept[i][2]; if (r<=acc){ pick=d.kept[i][0]; break; } }
      }
      seq.push(pick);
      if (seq.length>60) seq = seq.slice(-60);
      render();
      return pick;
    }

    function render(){
      // output text
      var out = seq.map(function(w,i){
        var last = i===seq.length-1;
        return '<span class="'+(last?'tk-new':'tk')+'">'+w+'</span>';
      }).join(" ");
      outEl.innerHTML = out;

      // distribution bars
      var d = dist();
      var keptSet = {}; d.kept.forEach(function(e){ keptSet[e[0]]=true; });
      var show = d.all.slice(0, Math.max(8, topk+2));
      var maxAdj = show[0] ? show[0][1] : 1;
      var html = '<div class="sm-h">P( next token | "'+seq.slice(-2).join(" ")+'" )</div>';
      show.forEach(function(e){
        var inK = keptSet[e[0]];
        var finalP = inK ? (d.kept.find(function(k){return k[0]===e[0];})[2]) : 0;
        var barW = Math.round(e[1]/maxAdj*100);
        html += '<div class="sm-row'+(inK?'':' cut')+'">'+
          '<span class="sm-w">'+e[0]+'</span>'+
          '<span class="sm-bar"><span style="width:'+barW+'%"></span></span>'+
          '<span class="sm-p">'+(inK?Math.round(finalP*100)+'%':'cut')+'</span></div>';
      });
      distEl.innerHTML = html;
    }

    // ---- UI ----
    var wrapEl = document.createElement("div"); wrapEl.className="sm-wrap";
    var left = document.createElement("div"); left.className="sm-left";
    var outEl = document.createElement("div"); outEl.className="sm-out";
    left.appendChild(outEl);

    var rowA = document.createElement("div"); rowA.className="ctl-row"; rowA.style.marginTop="12px";
    var bNext = mkBtn("Sample next ▸", function(){ stop(); sampleNext(); });
    var bAuto = mkBtn("Auto-write", function(){ running?stop():start(); }); bAuto.classList.add("primary");
    var bReset = mkBtn("Reset", function(){ stop(); seq=["the","model"]; render(); });
    rowA.appendChild(bNext); rowA.appendChild(bAuto); rowA.appendChild(bReset);
    left.appendChild(rowA);

    var right = document.createElement("div"); right.className="sm-right";
    var distEl = document.createElement("div"); distEl.className="sm-dist";
    right.appendChild(distEl);

    var ctlB = document.createElement("div"); ctlB.className="ctl-row"; ctlB.style.marginTop="14px";
    var tLab=document.createElement("label"); tLab.className="ctl"; tLab.innerHTML='temperature · <span class="val">0.80</span>';
    var tIn=document.createElement("input"); tIn.type="range"; tIn.min="0.1"; tIn.max="1.8"; tIn.step="0.05"; tIn.value="0.8";
    tIn.oninput=function(){ temp=+tIn.value; tLab.querySelector(".val").textContent=temp.toFixed(2); render(); };
    tLab.appendChild(tIn);
    var kLab=document.createElement("label"); kLab.className="ctl"; kLab.innerHTML='top-k · <span class="val">5</span>';
    var kIn=document.createElement("input"); kIn.type="range"; kIn.min="1"; kIn.max="10"; kIn.step="1"; kIn.value="5";
    kIn.oninput=function(){ topk=+kIn.value; kLab.querySelector(".val").textContent=topk; render(); };
    kLab.appendChild(kIn);
    ctlB.appendChild(tLab); ctlB.appendChild(kLab);
    right.appendChild(ctlB);

    var gLab=document.createElement("label"); gLab.className="ctl mc-toggle"; gLab.style.marginTop="10px";
    var gChk=document.createElement("input"); gChk.type="checkbox";
    gChk.onchange=function(){ greedy=gChk.checked; render(); };
    gLab.appendChild(gChk); gLab.appendChild(document.createTextNode(" greedy (always pick the top token)"));
    right.appendChild(gLab);

    wrapEl.appendChild(left); wrapEl.appendChild(right);
    root.appendChild(wrapEl);

    function start(){ running=true; bAuto.textContent="Pause"; bAuto.classList.add("go"); (function l(){ sampleNext(); raf=setTimeout(l, 320); })(); }
    function stop(){ running=false; bAuto.textContent="Auto-write"; bAuto.classList.remove("go"); if(raf) clearTimeout(raf); }

    render();
    function mkBtn(l,fn){ var b=document.createElement("button"); b.className="btn"; b.textContent=l; b.onclick=fn; return b; }
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
