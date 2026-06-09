/* ============================================================
   Quiz — 12 questions across the whole almanac.
   Renders into #quiz.
   ============================================================ */
(function () {
  "use strict";

  var Q = [
    { q:"Whose 1936 paper proved a single 'universal machine' could simulate any other computing machine?",
      o:["Claude Shannon","Alan Turing","John von Neumann","Norbert Wiener"], a:1,
      e:"Turing's <em>On Computable Numbers</em> introduced the universal machine — the conceptual basis of every computer." , c:"01 · Origins"},
    { q:"In the 1943 McCulloch–Pitts model, an artificial neuron behaves like…",
      o:["A random number generator","A threshold logic gate","A memory cell","A clock"], a:1,
      e:"It sums weighted inputs and fires if the sum crosses a threshold — letting you build logic gates from neurons.", c:"01 · Origins"},
    { q:"Which problem did Minsky &amp; Papert use to show a single-layer perceptron's hard limit?",
      o:["AND","OR","XOR","NOT"], a:2,
      e:"XOR isn't linearly separable — no single straight line splits the classes — so one layer can't learn it.", c:"02 · Symbolic AI"},
    { q:"What algorithm, popularised in 1986, finally let multi-layer networks learn?",
      o:["Backpropagation","Monte-Carlo search","Q-learning","Dynamic programming"], a:0,
      e:"Backprop applies the chain rule to push error gradients backward through layers — gradient descent on weights.", c:"02 · Symbolic AI"},
    { q:"Which 2012 model ignited the deep-learning era by crushing the ImageNet challenge?",
      o:["LeNet","AlexNet","ResNet","BERT"], a:1,
      e:"AlexNet — a deep CNN trained on GPUs — cut error from ~26% to ~15% and changed the whole field.", c:"03 · Connectionism"},
    { q:"In word2vec's famous example, <code>king − man + woman</code> ≈ …",
      o:["prince","queen","royal","crown"], a:1,
      e:"Relationships are directions in the vector space, so the gender vector maps king→queen.", c:"03 · Connectionism"},
    { q:"What search algorithm sits at the core of AlphaGo?",
      o:["Alpha-beta pruning","Monte-Carlo Tree Search","Breadth-first search","Gradient descent"], a:1,
      e:"MCTS repeatedly selects, expands, simulates and back-propagates — guided by AlphaGo's policy and value networks.", c:"04 · AlphaGo"},
    { q:"How did AlphaGo Zero (2017) reach superhuman strength?",
      o:["Studying human games","Pure self-play from random moves","Brute-force search only","Copying AlphaGo"], a:1,
      e:"It started from the rules alone and learned entirely by playing itself — no human games.", c:"04 · AlphaGo"},
    { q:"The 2017 Transformer replaced recurrence with which core mechanism?",
      o:["Convolution","Self-attention","Pooling","Recursion"], a:1,
      e:"Self-attention lets every token directly weigh every other token, in parallel.", c:"05 · Transformers"},
    { q:"Roughly how many parameters did GPT-3 (2020) have?",
      o:["175 million","1.5 billion","175 billion","17 trillion"], a:2,
      e:"175 billion — about 100× GPT-2, where in-context few-shot learning emerged.", c:"05 · Transformers"},
    { q:"Which technique turned a raw next-token predictor into a helpful assistant like ChatGPT?",
      o:["RLHF","Dropout","Batch norm","Diffusion"], a:0,
      e:"Reinforcement Learning from Human Feedback aligns the model to ranked human preferences.", c:"06 · Generative AI"},
    { q:"How does a diffusion model generate an image?",
      o:["By drawing shapes directly","By reversing a noising process step by step","By searching a database","By averaging photos"], a:1,
      e:"It starts from pure noise and repeatedly removes a little, condensing structure into an image.", c:"06 · Generative AI"}
  ];

  function build() {
    var root = document.getElementById("quiz");
    if (!root) return;

    var i=0, score=0, answered=false;

    var card=document.createElement("div"); card.className="qz-card";
    root.appendChild(card);

    function render(){
      answered=false;
      var item=Q[i];
      var html='';
      html+='<div class="qz-top"><span class="qz-prog">Question '+(i+1)+' / '+Q.length+'</span><span class="qz-score">score '+score+'</span></div>';
      html+='<div class="qz-bar"><span style="width:'+((i)/Q.length*100)+'%"></span></div>';
      html+='<div class="qz-chap">'+item.c+'</div>';
      html+='<div class="qz-q">'+item.q+'</div>';
      html+='<div class="qz-opts">';
      item.o.forEach(function(o,k){ html+='<button class="qz-opt" data-k="'+k+'">'+o+'</button>'; });
      html+='</div>';
      html+='<div class="qz-why" style="display:none"></div>';
      html+='<div class="qz-foot" style="display:none"><button class="btn primary qz-next">'+(i<Q.length-1?'Next ▸':'See results ▸')+'</button></div>';
      card.innerHTML=html;

      card.querySelectorAll(".qz-opt").forEach(function(b){
        b.onclick=function(){ if(answered) return; choose(+b.getAttribute("data-k")); };
      });
      var nx=card.querySelector(".qz-next"); if(nx) nx.onclick=function(){ i++; if(i>=Q.length) results(); else render(); };
    }

    function choose(k){
      answered=true;
      var item=Q[i];
      var opts=card.querySelectorAll(".qz-opt");
      opts.forEach(function(b,idx){
        b.disabled=true;
        if(idx===item.a) b.classList.add("right");
        if(idx===k && k!==item.a) b.classList.add("wrong");
      });
      if(k===item.a) score++;
      var why=card.querySelector(".qz-why");
      why.style.display="block";
      why.innerHTML='<b>'+(k===item.a?'<span class="ok">Correct.</span>':'<span class="no">Not quite.</span>')+'</b> '+item.e;
      card.querySelector(".qz-foot").style.display="flex";
      card.querySelector(".qz-bar span").style.width=((i+1)/Q.length*100)+"%";
      card.querySelector(".qz-score").textContent="score "+score;
    }

    function results(){
      var pct=Math.round(score/Q.length*100);
      var tier = pct>=90?["Pioneer","You could have been in the room at Dartmouth."]:
                 pct>=70?["Researcher","Strong grasp of the whole arc."]:
                 pct>=50?["Practitioner","A solid working knowledge — revisit a chapter or two."]:
                 ["Curious newcomer","Plenty to explore — the eras await."];
      card.innerHTML='<div class="qz-result">'+
        '<div class="qz-r-score">'+score+'<span>/'+Q.length+'</span></div>'+
        '<div class="qz-r-tier">'+tier[0]+'</div>'+
        '<p class="qz-r-msg">'+tier[1]+'</p>'+
        '<div class="ctl-row" style="justify-content:center; gap:10px;">'+
          '<button class="btn qz-again">↻ Try again</button>'+
          '<a class="btn primary" href="index.html">◂ Back to the almanac</a>'+
        '</div></div>';
      card.querySelector(".qz-again").onclick=function(){ i=0; score=0; render(); };
    }

    render();
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
