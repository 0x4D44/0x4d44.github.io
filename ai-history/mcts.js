/* ============================================================
   MCTS — Monte-Carlo Tree Search on tic-tac-toe.
   Watch the search tree grow; the engine behind AlphaGo.
   Renders into #mcts.
   ============================================================ */
(function () {
  "use strict";

  // ---- tic-tac-toe ----
  var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  function winner(s){
    for (var i=0;i<LINES.length;i++){ var L=LINES[i]; if(s[L[0]]&&s[L[0]]===s[L[1]]&&s[L[1]]===s[L[2]]) return s[L[0]]; }
    return s.indexOf(0)<0 ? 0 : null; // 0 draw, null ongoing
  }
  function legal(s){ var m=[]; for(var i=0;i<9;i++) if(!s[i]) m.push(i); return m; }
  function clone(s){ return s.slice(); }

  function build() {
    var root = document.getElementById("mcts");
    if (!root || !window.ALM) return;

    // ---- MCTS state ----
    var board = [0,0,0,0,0,0,0,0,0];
    var human = 1, ai = 2;
    var tree = null;
    var lastPath = null;
    var phase = "";
    var useValue = false;
    var C = 1.4;

    function mkNode(state, toMove, move, parent){
      return { state: state, toMove: toMove, move: move, parent: parent, children: [], untried: legal(state), N: 0, W: 0 };
    }
    function newTree(){ tree = mkNode(clone(board), playerToMove(board), null, null); lastPath = null; phase = ""; }
    function playerToMove(s){ var x=0,o=0; for(var i=0;i<9;i++){ if(s[i]===1)x++; else if(s[i]===2)o++; } return x<=o?1:2; }

    function ucbChild(node){
      var best=null, bv=-1e9, ln=Math.log(node.N+1);
      node.children.forEach(function(c){
        var q = c.N? c.W/c.N : 0;
        var u = q + C*Math.sqrt(ln/(c.N+1e-9));
        if(u>bv){ bv=u; best=c; }
      });
      return best;
    }

    function rollout(state, toMove){
      var s = clone(state), p = toMove, w = winner(s);
      while(w===null){
        var moves = legal(s);
        var m;
        if (useValue) {
          // "value/policy" heuristic: win if possible, else block, else center/corner bias
          m = heuristicMove(s, p, moves);
        } else {
          m = moves[(Math.random()*moves.length)|0];
        }
        s[m]=p; p = p===1?2:1; w = winner(s);
      }
      return w;
    }
    function heuristicMove(s,p,moves){
      var opp = p===1?2:1;
      for(var i=0;i<moves.length;i++){ var t=clone(s); t[moves[i]]=p; if(winner(t)===p) return moves[i]; }
      for(var j=0;j<moves.length;j++){ var t2=clone(s); t2[moves[j]]=opp; if(winner(t2)===opp) return moves[j]; }
      if(moves.indexOf(4)>=0) return 4;
      var corners=[0,2,6,8].filter(function(c){return moves.indexOf(c)>=0;});
      if(corners.length) return corners[(Math.random()*corners.length)|0];
      return moves[(Math.random()*moves.length)|0];
    }

    function simulate(){
      var node = tree, path = [node];
      // selection
      phase = "selection";
      while(node.untried.length===0 && node.children.length>0 && winner(node.state)===null){
        node = ucbChild(node); path.push(node);
      }
      // expansion
      if(winner(node.state)===null && node.untried.length>0){
        phase = "expansion";
        var idx = (Math.random()*node.untried.length)|0;
        var m = node.untried.splice(idx,1)[0];
        var ns = clone(node.state); ns[m]=node.toMove;
        var child = mkNode(ns, node.toMove===1?2:1, m, node);
        node.children.push(child);
        node = child; path.push(node);
      }
      // simulation
      var w = winner(node.state);
      if(w===null) w = rollout(node.state, node.toMove);
      // backprop
      for(var i=0;i<path.length;i++){
        var n = path[i];
        n.N++;
        if(i>0){
          var mover = path[i-1].toMove; // who moved INTO n
          n.W += (w===mover?1:(w===0?0.5:0));
        }
      }
      lastPath = path;
      return w;
    }

    function runSims(k){
      for(var i=0;i<k;i++) simulate();
      draw(); drawBoard(); updateStats();
    }

    function aiMove(){
      if(winner(board)!==null) return;
      newTree();
      runSims(+simSlider.value);
      // pick most-visited root child
      var best=null,bn=-1;
      tree.children.forEach(function(c){ if(c.N>bn){bn=c.N; best=c;} });
      if(best){ board = clone(best.state); }
      afterMove();
    }

    function humanMove(cell){
      if(board[cell]||winner(board)!==null) return;
      if(playerToMove(board)!==human) return;
      board[cell]=human;
      drawBoard();
      if(winner(board)===null){ setTimeout(aiMove, 220); }
      else { newTree(); draw(); updateStats(); }
    }

    function afterMove(){ newTree(); draw(); drawBoard(); updateStats(); }

    // ================= rendering =================
    var TW=620, TH=300;
    var tcanvas = document.createElement("canvas");
    var tctx = window.ALM.fitCanvas(tcanvas, TW, TH);

    function buildRender(node, depth, maxD, cap){
      var r = { ref:node, x:0, kids:[] };
      if(depth<maxD){
        var cs = node.children.filter(function(c){return c.N>0;}).sort(function(a,b){return b.N-a.N;}).slice(0,cap);
        cs.forEach(function(c){ r.kids.push(buildRender(c, depth+1, maxD, cap)); });
      }
      return r;
    }
    function layout(r, leafX){
      if(r.kids.length===0){ r.x = leafX.v++; return; }
      r.kids.forEach(function(k){ layout(k, leafX); });
      r.x = (r.kids[0].x + r.kids[r.kids.length-1].x)/2;
    }
    function countLeaves(r){ if(!r.kids.length) return 1; var n=0; r.kids.forEach(function(k){n+=countLeaves(k);}); return n; }

    function qColor(c){
      if(!c.N) return "rgba(118,131,95,0.5)";
      var q = c.W/c.N; // win rate for the mover into c
      // green good -> red bad
      var rr = Math.round(226 - q*120), gg = Math.round(97 + q*120), bb = 74;
      return "rgb("+rr+","+gg+","+bb+")";
    }

    function draw(){
      tctx.clearRect(0,0,TW,TH);
      if(!tree || tree.N===0){
        tctx.fillStyle="#76835f"; tctx.font="13px JetBrains Mono, monospace"; tctx.textAlign="center";
        tctx.fillText("run simulations to grow the search tree", TW/2, TH/2);
        return;
      }
      var R = buildRender(tree, 0, 3, 5);
      var leaves = Math.max(countLeaves(R),1);
      var leafX = {v:0};
      layout(R, leafX);
      var cols = Math.max(leaves,1);
      var padX = 30, padY = 30;
      var stepX = cols>1 ? (TW-padX*2)/(cols-1) : 0;
      var rowY = (TH-padY*2)/3;
      function px(x){ return padX + (cols>1? x*stepX : (TW-padX*2)/2); }
      function py(d){ return padY + d*rowY; }

      // edges
      (function edges(r,d){
        r.kids.forEach(function(k){
          var c=k.ref;
          var lw = 1 + Math.min(6, Math.sqrt(c.N));
          tctx.strokeStyle = "rgba(226,166,74,"+Math.min(0.85,0.2+c.N/(tree.N||1)).toFixed(2)+")";
          tctx.lineWidth = lw;
          tctx.beginPath(); tctx.moveTo(px(r.x),py(d)); tctx.lineTo(px(k.x),py(d+1)); tctx.stroke();
          edges(k,d+1);
        });
      })(R,0);

      // highlight last selected path
      if(lastPath && lastPath.length>1){
        // map refs to render positions
        var pos = {};
        (function map(r,d){ pos[refId(r.ref)]={x:px(r.x),y:py(d)}; r.kids.forEach(function(k){map(k,d+1);}); })(R,0);
        tctx.strokeStyle="rgba(95,198,212,0.9)"; tctx.lineWidth=2; tctx.setLineDash([4,3]);
        tctx.beginPath();
        var started=false;
        for(var i=0;i<lastPath.length;i++){ var p=pos[refId(lastPath[i])]; if(!p){started=false;continue;} if(!started){tctx.moveTo(p.x,p.y);started=true;} else tctx.lineTo(p.x,p.y); }
        tctx.stroke(); tctx.setLineDash([]);
      }

      // nodes
      (function nodes(r,d){
        var c=r.ref;
        var x=px(r.x), y=py(d);
        var rad = d===0?13: 6+Math.min(12,Math.sqrt(c.N));
        tctx.beginPath(); tctx.arc(x,y,rad,0,Math.PI*2);
        tctx.fillStyle = d===0? "#14160d" : qColor(c);
        tctx.fill();
        tctx.lineWidth=2; tctx.strokeStyle = d===0? "#e2a64a" : "rgba(10,11,8,0.8)"; tctx.stroke();
        // label
        if(d===0){ tctx.fillStyle="#e2a64a"; tctx.font="11px JetBrains Mono"; tctx.textAlign="center"; tctx.fillText("root", x, y+4); }
        else if(rad>9){ tctx.fillStyle="#0a0b08"; tctx.font="700 10px JetBrains Mono"; tctx.textAlign="center"; tctx.fillText(c.N, x, y+3); }
        r.kids.forEach(function(k){ nodes(k,d+1); });
      })(R,0);
    }
    var _id=0, _ids=new WeakMap();
    function refId(n){ if(!_ids.has(n)) _ids.set(n,++_id); return _ids.get(n); }

    // ---- board ----
    var BW=216;
    var bcanvas = document.createElement("canvas");
    bcanvas.style.border="1px solid var(--rule)";
    var bctx = window.ALM.fitCanvas(bcanvas, BW, BW);
    function drawBoard(){
      bctx.clearRect(0,0,BW,BW);
      var cell=BW/3;
      bctx.strokeStyle="rgba(205,211,187,0.25)"; bctx.lineWidth=1;
      for(var i=1;i<3;i++){ bctx.beginPath(); bctx.moveTo(i*cell,8); bctx.lineTo(i*cell,BW-8); bctx.moveTo(8,i*cell); bctx.lineTo(BW-8,i*cell); bctx.stroke(); }
      // AI move-quality hints from root children
      if(tree && tree.N>0 && playerToMove(board)===human){ /* show nothing for human turn */ }
      for(var c=0;c<9;c++){
        var cx=(c%3)*cell+cell/2, cy=((c/3)|0)*cell+cell/2;
        if(board[c]===1){ // X cyan
          bctx.strokeStyle="#5fc6d4"; bctx.lineWidth=3;
          bctx.beginPath(); bctx.moveTo(cx-18,cy-18); bctx.lineTo(cx+18,cy+18); bctx.moveTo(cx+18,cy-18); bctx.lineTo(cx-18,cy+18); bctx.stroke();
        } else if(board[c]===2){ // O amber
          bctx.strokeStyle="#e2a64a"; bctx.lineWidth=3;
          bctx.beginPath(); bctx.arc(cx,cy,18,0,Math.PI*2); bctx.stroke();
        }
      }
      var w=winner(board);
      if(w!==null){
        bctx.fillStyle="rgba(10,11,8,0.7)"; bctx.fillRect(0,0,BW,BW);
        bctx.fillStyle = w===0? "#cdd3bb" : (w===human? "#5fc6d4":"#e2a64a");
        bctx.font="700 22px JetBrains Mono"; bctx.textAlign="center";
        bctx.fillText(w===0?"draw":(w===human?"you win":"AI wins"), BW/2, BW/2+8);
      }
    }
    bcanvas.addEventListener("click", function(e){
      var r=bcanvas.getBoundingClientRect();
      var cx=Math.floor((e.clientX-r.left)/r.width*3), cy=Math.floor((e.clientY-r.top)/r.height*3);
      humanMove(cy*3+cx);
    });
    bcanvas.style.cursor="pointer";

    // ---- stats panel ----
    var statsEl;
    function updateStats(){
      if(!tree || tree.N===0){ statsEl.innerHTML='<div class="ms-empty">no simulations yet</div>'; return; }
      var kids = tree.children.slice().sort(function(a,b){return b.N-a.N;});
      var html = '<div class="ms-h">root move stats · '+tree.N+' sims · '+phase+'</div>';
      kids.forEach(function(c,i){
        var q=c.N?c.W/c.N:0;
        html += '<div class="ms-row'+(i===0?' top':'')+'">'+
          '<span class="ms-cell">cell '+c.move+'</span>'+
          '<span class="ms-bar"><span style="width:'+Math.round(c.N/tree.N*100)+'%"></span></span>'+
          '<span class="ms-n">'+c.N+'</span>'+
          '<span class="ms-q">'+Math.round(q*100)+'%</span></div>';
      });
      statsEl.innerHTML = html;
    }

    // ================= layout =================
    var wrapEl=document.createElement("div"); wrapEl.className="mc-wrap";
    var topRow=document.createElement("div"); topRow.className="mc-top";
    var bWrap=document.createElement("div"); bWrap.className="mc-board";
    bWrap.innerHTML='<div class="mc-lab">you are <b style="color:#5fc6d4">✕</b> · AI is <b style="color:#e2a64a">◯</b></div>';
    bWrap.appendChild(bcanvas);
    var ctlBox=document.createElement("div"); ctlBox.className="mc-ctls";

    var simSlider=document.createElement("input");
    simSlider.type="range"; simSlider.min="20"; simSlider.max="800"; simSlider.step="20"; simSlider.value="200";
    var simLab=document.createElement("label"); simLab.className="ctl";
    simLab.innerHTML='sims per move · <span class="val">200</span>';
    simSlider.oninput=function(){ simLab.querySelector(".val").textContent=simSlider.value; };
    simLab.appendChild(simSlider);

    var rowA=document.createElement("div"); rowA.className="ctl-row";
    rowA.appendChild(mkBtn("Run 1 sim", function(){ if(winner(board)!==null) return; if(!tree||tree.N===0) newTree(); simulate(); draw(); updateStats(); }));
    rowA.appendChild(mkBtn("Run 50", function(){ if(winner(board)!==null) return; if(!tree||tree.N===0) newTree(); runSims(50); }));
    var thinkBtn = mkBtn("AI: think + move", aiMove); thinkBtn.classList.add("primary");
    rowA.appendChild(thinkBtn);

    var rowB=document.createElement("div"); rowB.className="ctl-row"; rowB.style.marginTop="10px";
    rowB.appendChild(mkBtn("New game", function(){ board=[0,0,0,0,0,0,0,0,0]; newTree(); draw(); drawBoard(); updateStats(); }));
    var valLab=document.createElement("label"); valLab.className="ctl mc-toggle";
    var valChk=document.createElement("input"); valChk.type="checkbox";
    valChk.onchange=function(){ useValue=valChk.checked; };
    valLab.appendChild(valChk); valLab.appendChild(document.createTextNode(" rollout: value heuristic"));
    rowB.appendChild(valLab);

    ctlBox.appendChild(simLab); ctlBox.appendChild(rowA); ctlBox.appendChild(rowB);
    statsEl=document.createElement("div"); statsEl.className="mc-stats";
    ctlBox.appendChild(statsEl);

    topRow.appendChild(bWrap); topRow.appendChild(ctlBox);

    var treeBox=document.createElement("div"); treeBox.className="mc-treebox";
    treeBox.innerHTML='<div class="mc-phaserow"><span data-ph="selection">1·SELECT</span><span data-ph="expansion">2·EXPAND</span><span data-ph="sim">3·SIMULATE</span><span data-ph="back">4·BACKPROP</span></div>';
    treeBox.appendChild(tcanvas);

    wrapEl.appendChild(topRow); wrapEl.appendChild(treeBox);
    root.appendChild(wrapEl);

    newTree(); draw(); drawBoard(); updateStats();

    function mkBtn(l,fn){ var b=document.createElement("button"); b.className="btn"; b.textContent=l; b.onclick=fn; return b; }
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
