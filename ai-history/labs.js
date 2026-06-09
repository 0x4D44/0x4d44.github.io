/* ============================================================
   Flagship model timeline — the frontier labs and their
   headline releases, 2018 → 2026. Filter labs, click a release.
   Renders into #labs-app (the #labs id is the section scroll anchor).
   ============================================================ */
(function () {
  "use strict";

  var LABS = [
    { id:"openai",   name:"OpenAI",          col:"#7ad96a" },
    { id:"deepmind", name:"Google DeepMind", col:"#5fc6d4" },
    { id:"anthropic",name:"Anthropic",       col:"#e2a64a" },
    { id:"meta",     name:"Meta AI",         col:"#a98fe0" },
    { id:"mistral",  name:"Mistral",         col:"#e2614a" },
    { id:"xai",      name:"xAI",             col:"#cdd3bb" },
    { id:"deepseek", name:"DeepSeek",        col:"#f6c573" }
  ];

  // Headline releases (year as decimal for month placement).
  var REL = [
    { lab:"openai", y:2018.6, n:"GPT-1", d:"The first generative pre-trained transformer." },
    { lab:"openai", y:2019.2, n:"GPT-2", d:"1.5B params; coherent long-form text." },
    { lab:"openai", y:2020.5, n:"GPT-3", d:"175B params; in-context few-shot learning." },
    { lab:"openai", y:2021.0, n:"DALL·E / CLIP", d:"Text-to-image and a shared text–image space." },
    { lab:"openai", y:2022.9, n:"ChatGPT", d:"RLHF chat preview; 100M users in two months." },
    { lab:"openai", y:2023.2, n:"GPT-4", d:"Multimodal, far stronger reasoning." },
    { lab:"openai", y:2024.4, n:"GPT-4o", d:"Real-time voice, vision and text, one model." },
    { lab:"openai", y:2024.7, n:"o1", d:"Trained to 'think' before answering (reasoning)." },
    { lab:"openai", y:2025.7, n:"GPT-5", d:"Unified frontier model." },

    { lab:"deepmind", y:2016.2, n:"AlphaGo", d:"Beat Lee Sedol at Go." },
    { lab:"deepmind", y:2020.9, n:"AlphaFold 2", d:"Solved protein structure prediction." },
    { lab:"deepmind", y:2023.9, n:"Gemini 1", d:"Natively multimodal frontier family." },
    { lab:"deepmind", y:2024.9, n:"Gemini 1.5", d:"Million-token context windows." },
    { lab:"deepmind", y:2025.2, n:"Gemini 2", d:"Agentic, faster, cheaper." },

    { lab:"anthropic", y:2023.2, n:"Claude 1", d:"Helpful, harmless assistant; Constitutional AI." },
    { lab:"anthropic", y:2024.5, n:"Claude 3", d:"Opus/Sonnet/Haiku tiers." },
    { lab:"anthropic", y:2024.8, n:"Claude 3.5 Sonnet", d:"Strong coding; computer use." },
    { lab:"anthropic", y:2025.4, n:"Claude 4", d:"Extended reasoning + agentic coding." },

    { lab:"meta", y:2023.1, n:"LLaMA", d:"Leaked weights spark the open-model wave." },
    { lab:"meta", y:2023.6, n:"Llama 2", d:"Openly licensed for commercial use." },
    { lab:"meta", y:2024.3, n:"Llama 3", d:"Closes much of the gap to closed models." },
    { lab:"meta", y:2025.3, n:"Llama 4", d:"Mixture-of-experts, long context." },

    { lab:"mistral", y:2023.7, n:"Mistral 7B", d:"Tiny model, outsized performance." },
    { lab:"mistral", y:2023.9, n:"Mixtral", d:"Open mixture-of-experts." },
    { lab:"mistral", y:2024.6, n:"Mistral Large 2", d:"Frontier-tier European model." },

    { lab:"xai", y:2023.9, n:"Grok-1", d:"Launched within months of founding." },
    { lab:"xai", y:2024.8, n:"Grok-2", d:"Image generation + stronger reasoning." },
    { lab:"xai", y:2025.1, n:"Grok-3", d:"Trained on a very large GPU cluster." },

    { lab:"deepseek", y:2024.5, n:"DeepSeek-V2", d:"Efficient open MoE from China." },
    { lab:"deepseek", y:2025.0, n:"DeepSeek-R1", d:"Open reasoning model; shook the market." }
  ];

  var Y0 = 2018, Y1 = 2026, PXY = 130, PAD = 150;

  function build() {
    var root = document.getElementById("labs-app");
    if (!root) return;

    var active = {}; LABS.forEach(function(l){ active[l.id]=true; });

    // filter chips
    var chips = document.createElement("div"); chips.className="lb-chips";
    LABS.forEach(function(l){
      var b=document.createElement("button"); b.className="lb-chip on"; b.style.setProperty("--lc",l.col);
      b.innerHTML='<span class="sw"></span>'+l.name;
      b.onclick=function(){ active[l.id]=!active[l.id]; b.classList.toggle("on",active[l.id]); render(); };
      chips.appendChild(b);
    });
    root.appendChild(chips);

    var scroller=document.createElement("div"); scroller.className="lb-scroller";
    var rail=document.createElement("div"); rail.className="lb-rail";
    scroller.appendChild(rail); root.appendChild(scroller);

    var detail=document.createElement("div"); detail.className="lb-detail";
    detail.innerHTML='<div class="lb-d-empty">Click any model to read what it was.</div>';
    root.appendChild(detail);

    function render(){
      rail.innerHTML="";
      var labsOn = LABS.filter(function(l){ return active[l.id]; });
      var width = (Y1-Y0)*PXY + PAD + 40;
      var rowH = 46;
      rail.style.width = width+"px";
      rail.style.height = (labsOn.length*rowH + 40)+"px";

      // year gridlines
      for (var yr=Y0; yr<=Y1; yr++){
        var x = PAD + (yr-Y0)*PXY;
        var t=document.createElement("div"); t.className="lb-tick"; t.style.left=x+"px"; t.style.height=(labsOn.length*rowH)+"px";
        t.innerHTML='<span>'+yr+'</span>'; rail.appendChild(t);
      }

      labsOn.forEach(function(l, ri){
        var y = ri*rowH + 16;
        var lab=document.createElement("div"); lab.className="lb-row-lab"; lab.style.top=y+"px"; lab.style.setProperty("--lc",l.col);
        lab.textContent=l.name; rail.appendChild(lab);
        var line=document.createElement("div"); line.className="lb-row-line"; line.style.top=(y+10)+"px"; line.style.left=PAD+"px"; line.style.width=((Y1-Y0)*PXY)+"px";
        rail.appendChild(line);

        REL.filter(function(r){return r.lab===l.id;}).forEach(function(r){
          var x = PAD + (r.y-Y0)*PXY;
          var dot=document.createElement("button"); dot.className="lb-dot"; dot.style.left=x+"px"; dot.style.top=(y+10)+"px"; dot.style.setProperty("--lc",l.col);
          dot.innerHTML='<span class="d"></span><span class="nm">'+r.n+'</span>';
          dot.onclick=function(){ showRel(l, r); rail.querySelectorAll(".lb-dot").forEach(function(d){d.classList.remove("sel");}); dot.classList.add("sel"); };
          rail.appendChild(dot);
        });
      });
    }

    function showRel(l, r){
      var mo = Math.round((r.y%1)*12); var months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      detail.innerHTML='<div class="lb-d-card" style="--lc:'+l.col+'">'+
        '<div class="lb-d-head"><span class="lab">'+l.name+'</span><span class="when">'+(months[Math.min(11,mo)]||"")+' '+Math.floor(r.y)+'</span></div>'+
        '<div class="lb-d-title">'+r.n+'</div><p>'+r.d+'</p></div>';
    }

    render();
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
