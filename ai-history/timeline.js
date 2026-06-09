/* ============================================================
   Master Timeline — interactive horizontal rail of AI history.
   Renders into #timeline. Era bands, decade ticks, event dots;
   click a dot for a detail card that links to the deep dive.
   ============================================================ */
(function () {
  "use strict";

  var ERAS = [
    { id: "origins",      from: 1936, to: 1956, label: "Origins",            color: "var(--cyan)",   page: "01-origins.html" },
    { id: "symbolic",     from: 1956, to: 1986, label: "Symbolic AI & Winters", color: "var(--red)", page: "02-symbolic.html" },
    { id: "connectionism",from: 1986, to: 2012, label: "Connectionism",      color: "var(--violet)", page: "03-connectionism.html" },
    { id: "games",        from: 2012, to: 2017, label: "Games & RL",         color: "var(--green)",  page: "04-alphago.html" },
    { id: "transformers", from: 2017, to: 2020, label: "Transformer Era",    color: "var(--amber)",  page: "05-transformers.html" },
    { id: "generative",   from: 2020, to: 2023, label: "Generative & Diffusion", color: "var(--amber-hi)", page: "06-generative.html" },
    { id: "frontier",     from: 2023, to: 2026, label: "Modern Frontier",    color: "var(--green)",  page: "07-frontier.html" }
  ];

  var EVENTS = [
    { y: 1936, era: "origins", t: "On Computable Numbers", b: "Alan Turing defines the universal machine — the theoretical computer that underlies everything that follows." },
    { y: 1943, era: "origins", t: "McCulloch–Pitts neuron", b: "A neuron modelled as a logic gate. The first mathematical model of a 'thinking' element." },
    { y: 1948, era: "origins", t: "Cybernetics / Information Theory", b: "Wiener's feedback systems and Shannon's bits give machines goals and a way to measure information." },
    { y: 1950, era: "origins", t: "Computing Machinery & Intelligence", b: "Turing proposes the Imitation Game — 'Can machines think?' becomes an engineering question." },
    { y: 1956, era: "origins", t: "Dartmouth Workshop", b: "McCarthy coins 'Artificial Intelligence'. The field is officially born." },

    { y: 1957, era: "symbolic", t: "The Perceptron", b: "Rosenblatt builds a learning machine. Wild optimism follows." },
    { y: 1966, era: "symbolic", t: "ELIZA", b: "Weizenbaum's chatbot fools people with pattern-matching — the first illusion of understanding." },
    { y: 1969, era: "symbolic", t: "Perceptrons (the book)", b: "Minsky & Papert show single-layer nets can't learn XOR. Funding for neural nets collapses." },
    { y: 1974, era: "symbolic", t: "First AI Winter", b: "The Lighthill report and unmet promises freeze funding." },
    { y: 1980, era: "symbolic", t: "Expert systems boom", b: "Rule-based systems like XCON make real money; AI goes commercial." },
    { y: 1986, era: "symbolic", t: "Backpropagation popularised", b: "Rumelhart, Hinton & Williams give multi-layer nets a way to learn. Connectionism revives." },

    { y: 1989, era: "connectionism", t: "Convolutional nets (LeNet)", b: "LeCun reads handwritten digits with a CNN — deep learning's first real product." },
    { y: 1997, era: "connectionism", t: "LSTM + Deep Blue", b: "Hochreiter & Schmidhuber solve long memory; IBM's Deep Blue beats Kasparov at chess." },
    { y: 2009, era: "connectionism", t: "ImageNet", b: "Fei-Fei Li builds the dataset that makes large-scale vision possible." },
    { y: 2012, era: "connectionism", t: "AlexNet", b: "A deep CNN on GPUs crushes ImageNet. The deep-learning era begins in earnest." },

    { y: 2013, era: "games", t: "word2vec + DQN", b: "Words become vectors; DeepMind's DQN learns Atari from pixels and reward alone." },
    { y: 2014, era: "games", t: "GANs + seq2seq + attention", b: "Generative adversarial nets; encoder–decoder translation; the attention mechanism appears." },
    { y: 2016, era: "games", t: "AlphaGo beats Lee Sedol", b: "Deep RL + tree search conquers Go — a decade ahead of predictions. Move 37." },
    { y: 2017, era: "games", t: "AlphaZero", b: "One algorithm masters Go, chess and shogi from self-play, no human games." },

    { y: 2017, era: "transformers", t: "Attention Is All You Need", b: "The Transformer drops recurrence for pure attention. The architecture of the modern era." },
    { y: 2018, era: "transformers", t: "BERT + GPT-1", b: "Pre-train then fine-tune. Language models start to generalise." },
    { y: 2019, era: "transformers", t: "GPT-2", b: "Coherent paragraphs from a 1.5B-parameter model. 'Too dangerous to release.'" },
    { y: 2020, era: "transformers", t: "GPT-3 + Scaling Laws", b: "175B parameters. Few-shot learning emerges. Bigger really is different." },

    { y: 2020, era: "generative", t: "DDPM — diffusion works", b: "Denoising diffusion models learn to turn noise into images." },
    { y: 2021, era: "generative", t: "CLIP + DALL·E", b: "Text and images share a space; type a prompt, get a picture." },
    { y: 2022, era: "generative", t: "Stable Diffusion + InstructGPT", b: "Open image generation for everyone; RLHF teaches models to follow instructions." },
    { y: 2022, era: "generative", t: "ChatGPT", b: "Nov 30. 100M users in two months — the fastest-adopted product in history." },

    { y: 2023, era: "frontier", t: "GPT-4 + the lab race", b: "Multimodal frontier models; Claude, Gemini, Llama, Mistral arrive." },
    { y: 2024, era: "frontier", t: "Agents, reasoning & video", b: "Tool-using agents, o1-style reasoning, Sora-class video, on-device models." },
    { y: 2025, era: "frontier", t: "The frontier widens", b: "Long-context, real-time multimodal, and AI woven into everyday software." }
  ];

  var YEAR0 = 1936, YEAR1 = 2026;
  var PXY = 26; // px per year
  var PAD = 40;

  function colorFor(eraId) {
    var e = ERAS.find(function (x) { return x.id === eraId; });
    return e ? e.color : "var(--amber)";
  }
  function pageFor(eraId) {
    var e = ERAS.find(function (x) { return x.id === eraId; });
    return e ? e.page : "#";
  }

  function build() {
    var root = document.getElementById("timeline");
    if (!root) return;

    var width = (YEAR1 - YEAR0) * PXY + PAD * 2;

    // legend
    var legend = document.createElement("div");
    legend.className = "tl-legend";
    ERAS.forEach(function (e) {
      var a = document.createElement("a");
      a.href = e.page;
      a.className = "tl-leg";
      a.innerHTML = '<span class="sw" style="background:' + e.color + '"></span>' +
        '<span class="lb">' + e.label + '</span>' +
        '<span class="rg">' + e.from + "–" + e.to + '</span>';
      legend.appendChild(a);
    });
    root.appendChild(legend);

    // scroll area
    var scroller = document.createElement("div");
    scroller.className = "tl-scroller";
    var rail = document.createElement("div");
    rail.className = "tl-rail";
    rail.style.width = width + "px";
    scroller.appendChild(rail);
    root.appendChild(scroller);

    // era bands
    ERAS.forEach(function (e) {
      var band = document.createElement("a");
      band.href = e.page;
      band.className = "tl-band";
      band.style.left = (PAD + (e.from - YEAR0) * PXY) + "px";
      band.style.width = ((e.to - e.from) * PXY) + "px";
      band.style.setProperty("--bc", e.color);
      band.innerHTML = '<span class="bl">' + e.label + '</span>';
      rail.appendChild(band);
    });

    // decade ticks
    for (var yr = 1940; yr <= 2020; yr += 10) {
      var tick = document.createElement("div");
      tick.className = "tl-tick";
      tick.style.left = (PAD + (yr - YEAR0) * PXY) + "px";
      tick.innerHTML = '<span>' + yr + '</span>';
      rail.appendChild(tick);
    }

    // events — alternate above/below to avoid overlap
    var lastX = {};
    EVENTS.forEach(function (ev, i) {
      var x = PAD + (ev.y - YEAR0) * PXY;
      var lane = i % 2 === 0 ? "up" : "down";
      var dot = document.createElement("button");
      dot.className = "tl-ev " + lane;
      dot.style.left = x + "px";
      dot.style.setProperty("--ec", colorFor(ev.era));
      dot.setAttribute("data-i", i);
      dot.innerHTML = '<span class="d"></span><span class="yl">' + ev.y + '</span>';
      dot.title = ev.t;
      rail.appendChild(dot);
    });

    // detail panel
    var panel = document.createElement("div");
    panel.className = "tl-detail";
    panel.innerHTML = '<div class="tl-d-empty">Select a milestone above — or jump straight into an era.</div>';
    root.appendChild(panel);

    function showEvent(i) {
      var ev = EVENTS[i];
      rail.querySelectorAll(".tl-ev").forEach(function (d) { d.classList.toggle("sel", +d.getAttribute("data-i") === i); });
      var c = colorFor(ev.era);
      var eraLabel = (ERAS.find(function (x) { return x.id === ev.era; }) || {}).label || "";
      panel.innerHTML =
        '<div class="tl-d-card" style="--dc:' + c + '">' +
          '<div class="tl-d-head"><span class="yy">' + ev.y + '</span>' +
            '<span class="ee">' + eraLabel + '</span></div>' +
          '<div class="tl-d-title">' + ev.t + '</div>' +
          '<p class="tl-d-blurb">' + ev.b + '</p>' +
          '<a class="tl-d-link" href="' + pageFor(ev.era) + '">Read the ' + eraLabel + ' deep-dive →</a>' +
        '</div>';
    }

    rail.addEventListener("click", function (e) {
      var btn = e.target.closest(".tl-ev");
      if (!btn) return;
      showEvent(+btn.getAttribute("data-i"));
    });

    // open first by default
    showEvent(0);
  }

  if (document.readyState !== "loading") build();
  else document.addEventListener("DOMContentLoaded", build);
})();
