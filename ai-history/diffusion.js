/* ============================================================
   Diffusion denoiser — watch noise resolve into an image,
   one reverse step at a time. Targets rasterized procedurally.
   Renders into #diffusion.
   ============================================================ */
(function () {
  "use strict";

  var N = 64;          // grid resolution
  var DISP = 360;      // display px

  function build() {
    var root = document.getElementById("diffusion");
    if (!root || !window.ALM) return;
    var clamp = window.ALM.clamp;

    // ---- target rasterization ----
    var off = document.createElement("canvas"); off.width = N; off.height = N;
    var octx = off.getContext("2d");

    var targets = {
      smiley: function(){
        octx.fillStyle="#101209"; octx.fillRect(0,0,N,N);
        octx.fillStyle="#e2a64a"; octx.beginPath(); octx.arc(N/2,N/2,N*0.40,0,Math.PI*2); octx.fill();
        octx.fillStyle="#101209";
        octx.beginPath(); octx.arc(N*0.38,N*0.42,N*0.06,0,Math.PI*2); octx.fill();
        octx.beginPath(); octx.arc(N*0.62,N*0.42,N*0.06,0,Math.PI*2); octx.fill();
        octx.lineWidth=N*0.05; octx.strokeStyle="#101209";
        octx.beginPath(); octx.arc(N/2,N*0.52,N*0.20,0.15*Math.PI,0.85*Math.PI); octx.stroke();
      },
      heart: function(){
        octx.fillStyle="#101209"; octx.fillRect(0,0,N,N);
        octx.fillStyle="#e2614a";
        octx.beginPath();
        var cx=N/2, cy=N*0.4, s=N*0.30;
        octx.moveTo(cx, cy+s*0.9);
        octx.bezierCurveTo(cx-s*1.4, cy-s*0.4, cx-s*0.5, cy-s*1.1, cx, cy-s*0.2);
        octx.bezierCurveTo(cx+s*0.5, cy-s*1.1, cx+s*1.4, cy-s*0.4, cx, cy+s*0.9);
        octx.fill();
      },
      spiral: function(){
        octx.fillStyle="#0a0b08"; octx.fillRect(0,0,N,N);
        for (var i=0;i<900;i++){
          var a = i*0.32, rr = i*0.035;
          var x = N/2 + Math.cos(a)*rr, y = N/2 + Math.sin(a)*rr;
          var hue = (a*30)%360;
          octx.fillStyle = "hsl("+hue+",70%,55%)";
          octx.fillRect(x, y, 2, 2);
        }
      },
      ai: function(){
        octx.fillStyle="#101209"; octx.fillRect(0,0,N,N);
        octx.fillStyle="#7ad96a"; octx.font="700 "+Math.round(N*0.5)+"px JetBrains Mono, monospace";
        octx.textAlign="center"; octx.textBaseline="middle";
        octx.fillText("AI", N/2, N*0.54);
      }
    };
    var cur = "smiley";
    var target = new Float32Array(N*N*3);
    function rasterize(){
      targets[cur]();
      var d = octx.getImageData(0,0,N,N).data;
      for (var i=0;i<N*N;i++){ target[i*3]=d[i*4]; target[i*3+1]=d[i*4+1]; target[i*3+2]=d[i*4+2]; }
    }

    // ---- diffusion state ----
    var T = 28, t = T;
    var running=false, raf=null;
    var seed = Math.random()*1000;

    function randn(){ // box-muller
      var u=Math.random(), v=Math.random();
      return Math.sqrt(-2*Math.log(u+1e-9))*Math.cos(2*Math.PI*v);
    }

    // ---- display canvas ----
    var canvas = document.createElement("canvas");
    canvas.style.border="1px solid var(--rule)"; canvas.style.imageRendering="auto";
    canvas.style.width = DISP+"px"; canvas.style.height = DISP+"px";
    var dpr = Math.min(window.devicePixelRatio||1,2);
    canvas.width = DISP*dpr; canvas.height = DISP*dpr;
    var ctx = canvas.getContext("2d");
    var buf = document.createElement("canvas"); buf.width=N; buf.height=N;
    var bctx = buf.getContext("2d");
    var imgData = bctx.createImageData(N,N);

    function alphaAt(step){ // signal fraction at step (0..1), 1 when t=0
      var x = (T-step)/T;
      return clamp(Math.pow(x, 1.6), 0, 1);
    }

    function renderStep(){
      var a = alphaAt(t);
      var sigma = (1-a)*120;
      var dd = imgData.data;
      for (var i=0;i<N*N;i++){
        for (var c=0;c<3;c++){
          var v = target[i*3+c]*a + randn()*sigma;
          dd[i*4+c] = clamp(v,0,255);
        }
        dd[i*4+3]=255;
      }
      bctx.putImageData(imgData,0,0);
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(buf, 0,0, canvas.width, canvas.height);
      updateBar();
    }

    function step(){ if (t>0){ t--; renderStep(); maybeSnap(); } else stop(); }
    function loop(){ step(); if (t<=0){ stop(); return; } raf=setTimeout(loop, 130); }
    function start(){ if (t<=0) reset(); running=true; runBtn.textContent="Pause"; runBtn.classList.add("go"); loop(); }
    function stop(){ running=false; if(raf) clearTimeout(raf); runBtn.textContent="Denoise ▸"; runBtn.classList.remove("go"); }
    function reset(){ stop(); t=T; snaps=[]; renderStep(); renderStrip(); }

    // ---- filmstrip ----
    var snaps=[];
    function maybeSnap(){
      if (t % Math.ceil(T/6) === 0 || t===0){
        var s=document.createElement("canvas"); s.width=N; s.height=N;
        s.getContext("2d").drawImage(buf,0,0);
        snaps.push({t:t, c:s}); renderStrip();
      }
    }
    var stripEl;
    function renderStrip(){
      stripEl.innerHTML="";
      snaps.slice(-7).forEach(function(sn){
        var w=document.createElement("div"); w.className="df-thumb";
        var cc=document.createElement("canvas"); cc.width=46; cc.height=46;
        cc.getContext("2d").drawImage(sn.c,0,0,46,46);
        w.appendChild(cc);
        var lab=document.createElement("span"); lab.textContent="t="+sn.t; w.appendChild(lab);
        stripEl.appendChild(w);
      });
    }

    // ---- bar ----
    var barEl, readEl;
    function updateBar(){
      var a=alphaAt(t);
      barEl.style.width = Math.round(a*100)+"%";
      readEl.innerHTML = 'step <b>'+(T-t)+'/'+T+'</b> · noise <b>'+Math.round((1-a)*100)+'%</b> · signal <b>'+Math.round(a*100)+'%</b>';
    }

    // ---- UI ----
    var wrapEl=document.createElement("div"); wrapEl.className="df-wrap";
    var left=document.createElement("div");
    left.appendChild(canvas);
    var barWrap=document.createElement("div"); barWrap.className="df-barwrap";
    barWrap.innerHTML='<div class="df-bar"><span></span></div>';
    left.appendChild(barWrap);
    barEl = barWrap.querySelector(".df-bar span");
    readEl=document.createElement("div"); readEl.className="df-read"; left.appendChild(readEl);

    var right=document.createElement("div"); right.className="df-side";
    right.innerHTML='<div class="df-h">target image</div>';
    var tSel=document.createElement("div"); tSel.className="df-targets";
    [["smiley","☺ smiley"],["heart","♥ heart"],["spiral","◎ spiral"],["ai","AI text"]].forEach(function(p){
      var b=document.createElement("button"); b.className="btn"+(p[0]===cur?" primary":""); b.textContent=p[1]; b.style.fontSize="11px";
      b.onclick=function(){ cur=p[0]; tSel.querySelectorAll(".btn").forEach(function(x){x.classList.remove("primary");}); b.classList.add("primary"); rasterize(); reset(); };
      tSel.appendChild(b);
    });
    right.appendChild(tSel);

    var rowA=document.createElement("div"); rowA.className="ctl-row"; rowA.style.marginTop="14px";
    var stepBtn=mkBtn("Step ▸", function(){ stop(); step(); });
    var runBtn=mkBtn("Denoise ▸", function(){ running?stop():start(); }); runBtn.classList.add("primary");
    var resetBtn=mkBtn("Re-noise ↺", function(){ seed=Math.random()*1000; reset(); });
    rowA.appendChild(stepBtn); rowA.appendChild(runBtn); rowA.appendChild(resetBtn);
    right.appendChild(rowA);

    var stepsLab=document.createElement("label"); stepsLab.className="ctl"; stepsLab.style.marginTop="12px"; stepsLab.innerHTML='reverse steps · <span class="val">28</span>';
    var stepsIn=document.createElement("input"); stepsIn.type="range"; stepsIn.min="8"; stepsIn.max="60"; stepsIn.step="2"; stepsIn.value="28";
    stepsIn.oninput=function(){ T=+stepsIn.value; stepsLab.querySelector(".val").textContent=T; reset(); };
    stepsLab.appendChild(stepsIn); right.appendChild(stepsLab);

    var stripH=document.createElement("div"); stripH.className="df-h"; stripH.style.marginTop="14px"; stripH.textContent="trajectory";
    right.appendChild(stripH);
    stripEl=document.createElement("div"); stripEl.className="df-strip"; right.appendChild(stripEl);

    wrapEl.appendChild(left); wrapEl.appendChild(right);
    root.appendChild(wrapEl);

    rasterize(); reset();

    function mkBtn(l,fn){ var b=document.createElement("button"); b.className="btn"; b.textContent=l; b.onclick=fn; return b; }
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
