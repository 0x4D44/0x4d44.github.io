/* ============================================================
   Tiny live music generator — a Markov-ish melodic walk over a
   scale, played with Web Audio. A working "generative" demo.
   Renders into #music.
   ============================================================ */
(function () {
  "use strict";

  var SCALES = {
    major:      [0,2,4,5,7,9,11],
    minor:      [0,2,3,5,7,8,10],
    pentatonic: [0,3,5,7,10],
    lydian:     [0,2,4,6,7,9,11]
  };

  function build() {
    var root = document.getElementById("music");
    if (!root) return;

    var ac = null;
    var playing=false, timer=null;
    var scale="pentatonic", tempo=120, octave=4, drift=0.6;
    var degree=0; // index in scale degrees space
    var step=0;
    var notes=[];   // visual log of last notes

    var canvas=document.createElement("canvas");
    var W=620,H=130;
    var ctx=window.ALM ? window.ALM.fitCanvas(canvas,W,H) : canvas.getContext("2d");
    canvas.style.border="1px solid var(--rule)";

    function freq(semitoneFromA4){ return 440*Math.pow(2, semitoneFromA4/12); }

    function nextNote(){
      var sc = SCALES[scale];
      // random walk on scale degrees, biased to small steps
      var r = Math.random();
      var dstep;
      if (r < drift*0.5) dstep = (Math.random()<0.5?1:-1);
      else if (r < drift) dstep = (Math.random()<0.5?2:-2);
      else if (r < 0.92) dstep = 0;
      else dstep = (Math.random()<0.5?3:-3);
      degree += dstep;
      degree = Math.max(-3, Math.min(sc.length+4, degree));
      var octShift = Math.floor(degree / sc.length);
      var idx = ((degree % sc.length) + sc.length) % sc.length;
      var semi = sc[idx] + (octave-4)*12 + octShift*12 - 9; // A4=0 ref (C-based offset -9)
      return semi;
    }

    function playTone(semi, t, dur){
      if (!ac) return;
      var o=ac.createOscillator(), g=ac.createGain();
      o.type="triangle"; o.frequency.value=freq(semi);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.22, t+0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t+dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t+dur+0.05);
    }

    function tick(){
      var semi=nextNote();
      var dur=60/tempo* (Math.random()<0.25?2:1);
      if (ac) playTone(semi, ac.currentTime+0.01, dur*0.95);
      notes.push({ semi:semi, step:step++ });
      if (notes.length>40) notes.shift();
      draw();
      timer=setTimeout(tick, dur*1000);
    }

    function draw(){
      ctx.clearRect(0,0,W,H);
      // staff-ish gridlines
      ctx.strokeStyle="rgba(205,211,187,0.06)";
      for (var i=0;i<6;i++){ var y=20+i*18; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
      if (!notes.length){
        ctx.fillStyle="#76835f"; ctx.font="12px JetBrains Mono"; ctx.textAlign="center";
        ctx.fillText("press play — a melody composed live in your browser", W/2, H/2);
        return;
      }
      var minS=Infinity,maxS=-Infinity;
      notes.forEach(function(n){ if(n.semi<minS)minS=n.semi; if(n.semi>maxS)maxS=n.semi; });
      var range=Math.max(12, maxS-minS);
      var bw=W/40;
      notes.forEach(function(n,i){
        var x=i*bw;
        var yy=H-14 - ((n.semi-minS)/range)*(H-30);
        var last=i===notes.length-1;
        ctx.fillStyle=last? "#7ad96a":"#e2a64a";
        if(last){ ctx.shadowColor="rgba(122,217,106,0.8)"; ctx.shadowBlur=10; }
        ctx.fillRect(x, yy, bw-3, 7);
        ctx.shadowBlur=0;
      });
    }

    function start(){
      if (!ac){ try{ ac=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
      if (ac && ac.state==="suspended") ac.resume();
      playing=true; playBtn.textContent="◼ Stop"; playBtn.classList.add("go");
      tick();
    }
    function stop(){ playing=false; playBtn.textContent="▸ Play"; playBtn.classList.remove("go"); if(timer) clearTimeout(timer); }

    // UI
    var wrapEl=document.createElement("div"); wrapEl.className="mu-wrap";
    wrapEl.appendChild(canvas);
    var ctlA=document.createElement("div"); ctlA.className="ctl-row"; ctlA.style.marginTop="12px";
    var playBtn=document.createElement("button"); playBtn.className="btn primary"; playBtn.textContent="▸ Play";
    playBtn.onclick=function(){ playing?stop():start(); };
    var newBtn=document.createElement("button"); newBtn.className="btn"; newBtn.textContent="↻ New seed";
    newBtn.onclick=function(){ degree=Math.floor(Math.random()*5); notes=[]; draw(); };
    ctlA.appendChild(playBtn); ctlA.appendChild(newBtn);

    // scale select
    var scWrap=document.createElement("div"); scWrap.className="mu-scales";
    Object.keys(SCALES).forEach(function(k){
      var b=document.createElement("button"); b.className="btn"+(k===scale?" primary":""); b.textContent=k; b.style.fontSize="11px";
      b.onclick=function(){ scale=k; scWrap.querySelectorAll(".btn").forEach(function(x){x.classList.remove("primary");}); b.classList.add("primary"); };
      scWrap.appendChild(b);
    });
    ctlA.appendChild(scWrap);
    wrapEl.appendChild(ctlA);

    var ctlB=document.createElement("div"); ctlB.className="ctl-row"; ctlB.style.marginTop="12px";
    var tLab=document.createElement("label"); tLab.className="ctl"; tLab.innerHTML='tempo · <span class="val">120</span>';
    var tIn=document.createElement("input"); tIn.type="range"; tIn.min="60"; tIn.max="220"; tIn.step="5"; tIn.value="120";
    tIn.oninput=function(){ tempo=+tIn.value; tLab.querySelector(".val").textContent=tempo; }; tLab.appendChild(tIn);
    var dLab=document.createElement("label"); dLab.className="ctl"; dLab.innerHTML='melodic drift · <span class="val">0.60</span>';
    var dIn=document.createElement("input"); dIn.type="range"; dIn.min="0.1"; dIn.max="0.95"; dIn.step="0.05"; dIn.value="0.6";
    dIn.oninput=function(){ drift=+dIn.value; dLab.querySelector(".val").textContent=drift.toFixed(2); }; dLab.appendChild(dIn);
    ctlB.appendChild(tLab); ctlB.appendChild(dLab);
    wrapEl.appendChild(ctlB);

    root.appendChild(wrapEl);
    draw();
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
