/* ============================================================
   BARCELONA · app.js — bilingual rendering engine + interactivity
   Reads window.CONTENT (from content.js, generated) and the
   author-owned UI strings / itinerary below. Rebuilds the page
   on language toggle. Leaflet map, character modals, phrasebook
   speech, and a Portal-style "test completion" HUD.
   ============================================================ */
(function () {
  "use strict";

  var LS_LANG = "bcn.lang.v1";
  var LS_DONE = "bcn.tests.v1";
  var L = localStorage.getItem(LS_LANG) === "es" ? "es" : "en";

  // which character guides which venue
  var GUIDE = { sagrada: "sagrada", aquarium: "sirena", cruise: "capita" };
  var CCLASS = { glados: "c-glados", sagrada: "c-sagrada", sirena: "c-sirena", capita: "c-capita" };

  // -------- author-owned bilingual strings --------
  var UI = {
    nav_guides:  { en: "Guides",     es: "Guías" },
    nav_map:     { en: "Map",        es: "Mapa" },
    nav_places:  { en: "Places",     es: "Lugares" },
    nav_phrases: { en: "Phrases",    es: "Frases" },
    nav_plan:    { en: "2-Day Plan", es: "Plan 2 días" },
    tag:         { en: "A 2-day field test of Barcelona", es: "Una prueba de campo de 2 días en Barcelona" },
    heroLead: {
      en: "Two days. Three landmarks. Four sardonic guides who are definitely not judging you. A bilingual, interactive field manual to Gaudí's basilica, the aquarium under the sea, and the great cruise port — narrated by an AI who runs Barcelona like a test chamber.",
      es: "Dos días. Tres lugares. Cuatro guías sarcásticos que desde luego no te están juzgando. Un manual de campo bilingüe e interactivo a la basílica de Gaudí, el acuario bajo el mar y el gran puerto de cruceros — narrado por una IA que dirige Barcelona como una cámara de pruebas."
    },
    cta_start:   { en: "Begin the test", es: "Empezar la prueba" },
    cta_map:     { en: "Open the map", es: "Abrir el mapa" },
    stat_days:   { en: "Days", es: "Días" },
    stat_sites:  { en: "Landmarks", es: "Lugares" },
    stat_guides: { en: "Guides", es: "Guías" },
    stat_langs:  { en: "Languages", es: "Idiomas" },
    guides_k:    { en: "Your test administrators", es: "Tus administradoras de prueba" },
    guides_h:    { en: "Meet the guides", es: "Conoce a las guías" },
    guides_p:    { en: "Four cartoon avatars — half Catalan legend, half Aperture Science AI. Tap any of them to read their backstory and hear their advice.", es: "Cuatro avatares de dibujos — mitad leyenda catalana, mitad IA de Aperture Science. Toca cualquiera para leer su historia y escuchar sus consejos." },
    map_k:       { en: "Coordinates confirmed", es: "Coordenadas confirmadas" },
    map_h:       { en: "The map", es: "El mapa" },
    map_p:       { en: "Three points of interest across the city. Tap a pin, or a card, to fly there. Everything is within a short Metro hop.", es: "Tres puntos de interés por la ciudad. Toca un marcador, o una tarjeta, para volar allí. Todo está a un corto salto de Metro." },
    places_k:    { en: "The chambers", es: "Las cámaras" },
    places_h:    { en: "The three landmarks", es: "Los tres lugares" },
    places_p:    { en: "Everything you need for each stop — the story, the numbers, the practical tips, and one motivational message from the management.", es: "Todo lo que necesitas para cada parada — la historia, los números, los consejos prácticos y un mensaje motivador de la dirección." },
    tab_about:   { en: "The story", es: "La historia" },
    tab_facts:   { en: "Did you know", es: "¿Sabías que?" },
    tab_tips:    { en: "Visitor tips", es: "Consejos" },
    ph_k:        { en: "Verbal test protocols", es: "Protocolos de prueba verbal" },
    ph_h:        { en: "The phrasebook", es: "El cuadernillo de frases" },
    ph_p:        { en: "Say it in Spanish — with a bonus Catalan line, because this is Catalonia. Tap the speaker to hear it; tap the card for a note from the management.", es: "Dilo en español — con una línea extra en catalán, porque esto es Cataluña. Toca el altavoz para oírlo; toca la tarjeta para una nota de la dirección." },
    plan_k:      { en: "Recommended test sequence", es: "Secuencia de prueba recomendada" },
    plan_h:      { en: "Your two days", es: "Tus dos días" },
    plan_p:      { en: "A sane, unhurried route through all three landmarks, with your guides handing you off from one to the next.", es: "Una ruta sensata y sin prisas por los tres lugares, con tus guías pasándote de una a la siguiente." },
    getting:     { en: "Getting there", es: "Cómo llegar" },
    guidedby:    { en: "Guided by", es: "Guiada por" },
    tapspeak:    { en: "tap a phrase for advice", es: "toca una frase para un consejo" },
    hud:         { en: "Chambers cleared", es: "Cámaras completadas" },
    ach:         { en: "Test complete", es: "Prueba completada" },
    ach_all:     { en: "All chambers cleared. The management is reluctantly impressed.", es: "Todas las cámaras completadas. La dirección está reticentemente impresionada." },
    footsig: {
      en: "Assembled by GaudíOS and staff for a two-day human trial in Barcelona. No cake was promised, and none will be provided. Bon voyage — and mind the gap between what the map says and what your feet feel.",
      es: "Preparado por GaudíOS y su equipo para un ensayo humano de dos días en Barcelona. No se prometió ningún pastel, y no se proporcionará ninguno. Buen viaje — y cuidado con la diferencia entre lo que dice el mapa y lo que sienten tus pies."
    },
    back:        { en: "← Back to the almanac", es: "← Volver al almanaque" }
  };

  // -------- 2-day itinerary (author-owned) --------
  var PLAN = [
    { day: { en: "Day One", es: "Día Uno" }, sub: { en: "Chamber 01 · Stone & Light", es: "Cámara 01 · Piedra y Luz" }, items: [
      { time: "09:00", who: "sagrada", h: { en: "Sagrada Família, first entry", es: "Sagrada Família, primera entrada" }, p: { en: "Book the earliest online slot. Morning sun fires the eastern (Nativity) stained glass in blues and greens. Add a tower ticket for the lift up.", es: "Reserva la franja más temprana online. El sol de la mañana enciende las vidrieras del este (Natividad) en azules y verdes. Añade entrada a las torres para subir en ascensor." } },
      { time: "12:00", who: "sagrada", h: { en: "Lunch in the Eixample", es: "Comida en el Eixample" }, p: { en: "Menú del día in the grid streets around the basilica — three courses, a drink, calm before the crowds swell.", es: "Menú del día en las calles del ensanche junto a la basílica — tres platos, bebida, calma antes de que crezca la multitud." } },
      { time: "14:30", who: "glados", h: { en: "Down to Port Vell", es: "Bajar a Port Vell" }, p: { en: "Metro L2 to the waterfront. Stroll the old harbour, the marina and the Rambla de Mar footbridge as the light turns gold.", es: "Metro L2 hasta el puerto. Pasea por el puerto viejo, la marina y la pasarela Rambla de Mar mientras la luz se vuelve dorada." } },
      { time: "18:00", who: "capita", h: { en: "Barceloneta & the Columbus column", es: "Barceloneta y la columna de Colón" }, p: { en: "Seafood and a beach walk. Look up at Columbus pointing out to sea — not, in fact, toward the Americas.", es: "Marisco y un paseo por la playa. Mira a Colón señalando al mar — que no apunta, de hecho, hacia América." } }
    ]},
    { day: { en: "Day Two", es: "Día Dos" }, sub: { en: "Chamber 02 · Water & Departure", es: "Cámara 02 · Agua y Partida" }, items: [
      { time: "10:00", who: "sirena", h: { en: "L'Aquàrium, at opening", es: "L'Aquàrium, a la apertura" }, p: { en: "Be first through the doors and you'll have the 80-metre shark tunnel almost to yourself. Allow 90 minutes.", es: "Sé el primero en entrar y tendrás el túnel de tiburones de 80 metros casi para ti. Reserva 90 minutos." } },
      { time: "12:00", who: "sirena", h: { en: "Maremàgnum & the cable car", es: "Maremàgnum y el teleférico" }, p: { en: "Lunch over the water, then ride the Transbordador aeri del port up to Montjuïc for the whole coastline at once.", es: "Come sobre el agua, luego sube en el Transbordador aeri del port a Montjuïc para ver toda la costa de una vez." } },
      { time: "15:00", who: "glados", h: { en: "Gothic Quarter & La Rambla", es: "Barri Gòtic y La Rambla" }, p: { en: "Lose yourself in the medieval lanes, the cathedral cloister geese, and the mosaic underfoot at the heart of La Rambla.", es: "Piérdete en las callejuelas medievales, las ocas del claustro de la catedral y el mosaico bajo tus pies en el centro de La Rambla." } },
      { time: "17:30", who: "capita", h: { en: "The cruise terminal", es: "La terminal de cruceros" }, p: { en: "Sailing on? Head to Moll Adossat via the Portbus shuttle from the Columbus column. Arrive early; the port is bigger than it looks.", es: "¿Zarpas? Ve al Moll Adossat con la lanzadera Portbus desde la columna de Colón. Llega pronto; el puerto es más grande de lo que parece." } }
    ]}
  ];

  // -------- helpers --------
  function t(o) { return o ? (o[L] != null ? o[L] : o.en) : ""; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function el(html) { var d = document.createElement("div"); d.innerHTML = html.trim(); return d.firstElementChild; }
  function $(s, r) { return (r || document).querySelector(s); }
  function charById(id) { return (window.CONTENT.characters || []).find(function (c) { return c.id === id; }) || {}; }

  var ART = window.ART, C = null;

  // ==================== render ====================
  function render() {
    C = window.CONTENT;
    document.documentElement.lang = L;
    renderChrome();
    renderHero();
    renderGuides();
    renderMapList();
    renderVenues();
    renderPhrasebook();
    renderPlan();
    renderFooter();
    initObservers();
  }

  function renderChrome() {
    $("#nav").innerHTML =
      [["guides", UI.nav_guides], ["map", UI.nav_map], ["places", UI.nav_places], ["phrases", UI.nav_phrases], ["plan", UI.nav_plan]]
        .map(function (p) { return '<a href="#' + p[0] + '">' + esc(t(p[1])) + "</a>"; }).join("");
    $("#brandEye").innerHTML = ART.apertureEye();
    // language buttons
    $("#langEN").classList.toggle("on", L === "en");
    $("#langES").classList.toggle("on", L === "es");
  }

  function renderHero() {
    var host = charById("glados");
    var line = host.lines && host.lines.length ? t(host.lines[Math.floor((Date.now ? 0 : 0)) % host.lines.length]) : "";
    // pick a stable-ish opening line (first)
    var quote = host.lines && host.lines[0] ? t(host.lines[0]) : (L === "es" ? "Bienvenido a la prueba." : "Welcome to the test.");
    $("#hero").innerHTML =
      '<div class="tiles"></div>' +
      '<div class="wrap hero-grid">' +
        '<div class="reveal-up in">' +
          '<span class="eyebrow-line">' + esc(t(UI.tag)) + "</span>" +
          "<h1>Barcelona<span class=\"accent\">Aperture · Modernisme</span></h1>" +
          '<p class="hero-lead">' + esc(t(UI.heroLead)) + "</p>" +
          '<div class="hero-cta">' +
            '<a class="btn primary" href="#places">' + esc(t(UI.cta_start)) + "</a>" +
            '<a class="btn ghost" href="#map">' + esc(t(UI.cta_map)) + "</a>" +
          "</div>" +
          '<div class="hero-stats">' +
            stat("2", UI.stat_days) + stat("3", UI.stat_sites) + stat("4", UI.stat_guides) + stat("2", UI.stat_langs) +
          "</div>" +
        "</div>" +
        '<div class="hero-host c-glados">' +
          '<div class="host-ring"><div class="host-inner">' + ART.avatars.glados + "</div></div>" +
          '<div class="host-quote">' + esc(quote) + "</div>" +
        "</div>" +
      "</div>";
  }
  function stat(v, lbl) { return '<div class="s"><b>' + v + "</b><span>" + esc(t(lbl)) + "</span></div>"; }

  function renderGuides() {
    var head =
      '<div class="section-head reveal-up"><span class="kicker">' + esc(t(UI.guides_k)) + "</span>" +
      "<h2>" + esc(t(UI.guides_h)) + "</h2><p>" + esc(t(UI.guides_p)) + "</p></div>";
    var cards = (C.characters || []).map(function (ch) {
      return '<article class="char-card reveal-up ' + CCLASS[ch.id] + '" data-char="' + ch.id + '">' +
        '<div class="cc-top">' + (ART.avatars[ch.id] || "") + "</div>" +
        '<div class="cc-body">' +
          '<div class="cc-role">' + esc(t(ch.role)) + "</div>" +
          '<h3 class="cc-name">' + esc(ch.name) + "</h3>" +
          '<p class="cc-arch">' + esc(ch.archetype) + "</p>" +
          '<div class="cc-more">' + (L === "es" ? "Ver historia" : "Read backstory") + "</div>" +
        "</div></article>";
    }).join("");
    $("#guides").innerHTML = '<div class="wrap">' + head + '<div class="char-grid">' + cards + "</div></div>";
    Array.prototype.forEach.call(document.querySelectorAll(".char-card"), function (c) {
      c.addEventListener("click", function () { openChar(c.getAttribute("data-char")); });
    });
  }

  function renderMapList() {
    var head =
      '<div class="section-head reveal-up"><span class="kicker">' + esc(t(UI.map_k)) + "</span>" +
      "<h2>" + esc(t(UI.map_h)) + "</h2><p>" + esc(t(UI.map_p)) + "</p></div>";
    var list = (C.venues || []).map(function (v) {
      var gid = GUIDE[v.slug];
      return '<button class="map-item ' + CCLASS[gid] + '" data-slug="' + v.slug + '">' +
        '<span class="pin">' + (ART.icons[iconFor(v.slug)] || "") + "</span>" +
        "<span><span class=\"mi-t\">" + esc(t(v.name)) + "</span><br><span class=\"mi-s\">" + esc(t(v.kicker)) + "</span></span>" +
        "</button>";
    }).join("");
    $("#map-sec").innerHTML =
      '<div class="wrap">' + head +
      '<div class="map-shell"><div id="map"></div><div class="map-list">' + list + "</div></div></div>";
    Array.prototype.forEach.call(document.querySelectorAll(".map-item"), function (b) {
      b.addEventListener("click", function () { focusVenue(b.getAttribute("data-slug")); });
    });
    initMap();
  }
  function iconFor(slug) { return slug === "sagrada" ? "spire" : slug === "aquarium" ? "fish" : "ship"; }

  function renderVenues() {
    var head =
      '<div class="section-head reveal-up"><span class="kicker">' + esc(t(UI.places_k)) + "</span>" +
      "<h2>" + esc(t(UI.places_h)) + "</h2><p>" + esc(t(UI.places_p)) + "</p></div>";
    var blocks = (C.venues || []).map(function (v, i) {
      var gid = GUIDE[v.slug], guide = charById(gid);
      var artSide =
        '<div class="venue-art">' + (ART.scenes[v.slug] || "") +
          '<div class="guide-badge">' + (ART.avatars[gid] || "") +
          "<span>" + esc(t(UI.guidedby)) + " <b>" + esc(guide.name || "") + "</b></span></div></div>";
      var chips = (v.stats || []).map(function (s) {
        return '<div class="chip"><b>' + esc(s.value) + "</b><span>" + esc(t(s.label)) + "</span></div>";
      }).join("");
      var about = '<div class="vpane on" data-pane="about">' +
        (v.intro || []).map(function (p) { return "<p>" + esc(t(p)) + "</p>"; }).join("") + "</div>";
      var facts = '<div class="vpane" data-pane="facts"><ul class="vlist">' +
        (v.facts || []).map(function (f, j) { return '<li><span class="n">' + (j + 1) + '.</span><span>' + esc(t(f)) + "</span></li>"; }).join("") + "</ul></div>";
      var tips = '<div class="vpane" data-pane="tips"><ul class="vlist">' +
        (v.tips || []).map(function (f) { return '<li><span class="n">▸</span><span>' + esc(t(f)) + "</span></li>"; }).join("") + "</ul></div>";
      var console_ = '<div class="console" data-loc="' + esc((v.slug || "").toUpperCase()) + '">' +
        (v.glados || []).map(function (g) { return "<p>" + esc(t(g)) + "</p>"; }).join("") +
        '<p style="color:#ffb85c">' + speakLine(t(v.name)) + '<span class="cursor"></span></p></div>';
      var info =
        '<div class="venue-lead reveal-up">' +
          '<span class="kicker">' + esc(t(v.kicker)) + "</span>" +
          "<h2>" + esc(t(v.name)) + "</h2>" +
          '<div class="stat-chips">' + chips + "</div>" +
          '<div class="venue-meta">' + ART.icons.metro + "<span>" + esc(t(UI.getting)) + ": " + esc(t(v.metro)) + "</span></div>" +
          '<div class="vtabs">' +
            '<button class="vtab on" data-tab="about">' + esc(t(UI.tab_about)) + "</button>" +
            '<button class="vtab" data-tab="facts">' + esc(t(UI.tab_facts)) + "</button>" +
            '<button class="vtab" data-tab="tips">' + esc(t(UI.tab_tips)) + "</button>" +
          "</div>" + about + facts + tips +
          '<div style="margin-top:18px">' + console_ + "</div>" +
        "</div>";
      var order = i % 2 === 0;
      return '<div class="venue ' + CCLASS[gid] + '" id="v-' + v.slug + '" data-slug="' + v.slug + '"><div class="wrap"><div class="venue-grid">' +
        (order ? artSide + info : info + artSide) + "</div></div></div>";
    }).join("");
    $("#places").innerHTML = '<div class="wrap">' + head + "</div>" + blocks;
    // tab wiring
    Array.prototype.forEach.call(document.querySelectorAll(".venue"), function (vn) {
      var tabs = vn.querySelectorAll(".vtab"), panes = vn.querySelectorAll(".vpane");
      Array.prototype.forEach.call(tabs, function (tb) {
        tb.addEventListener("click", function () {
          Array.prototype.forEach.call(tabs, function (x) { x.classList.remove("on"); });
          Array.prototype.forEach.call(panes, function (x) { x.classList.remove("on"); });
          tb.classList.add("on");
          var pane = vn.querySelector('.vpane[data-pane="' + tb.getAttribute("data-tab") + '"]');
          if (pane) pane.classList.add("on");
        });
      });
    });
    wireSpeak();
    observeVenues();
  }
  function speakLine(text) {
    return '<button class="speak-btn" data-speak="' + esc(text) + '" title="listen">▷ ' + esc(text) + "</button>";
  }

  function renderPhrasebook() {
    var cats = C.phrasebook || [];
    var head =
      '<div class="section-head reveal-up"><span class="kicker">' + esc(t(UI.ph_k)) + "</span>" +
      "<h2>" + esc(t(UI.ph_h)) + "</h2><p>" + esc(t(UI.ph_p)) + "</p></div>";
    var tabs = cats.map(function (c, i) {
      return '<button class="pb-cat' + (i === 0 ? " on" : "") + '" data-cat="' + i + '">' + esc(t(c.title)) + "</button>";
    }).join("");
    $("#phrases").innerHTML =
      '<div class="wrap">' + head +
      '<div class="pb-cats">' + tabs + "</div>" +
      '<div class="pb-grid" id="pbGrid"></div></div>';
    function showCat(idx) {
      var c = cats[idx]; if (!c) return;
      $("#pbGrid").innerHTML = (c.phrases || []).map(function (p) {
        var say = L === "es" ? p.es : p.es; // always speak the Spanish
        return '<div class="phrase">' +
          '<div class="en">' + esc(L === "es" ? p.en : p.en) + "</div>" +
          '<div class="es-row"><span class="es">' + esc(p.es) + "</span>" +
            '<button class="speak-btn" data-speak="' + esc(p.es) + '" title="listen">▷</button></div>' +
          '<div class="pron">' + esc(p.pron || "") + "</div>" +
          (p.ca ? '<div class="ca"><b>CA</b> ' + esc(p.ca) + "</div>" : "") +
          '<div class="sass">' + esc(p.sass || "") + "</div>" +
        "</div>";
      }).join("");
      wireSpeak();
      Array.prototype.forEach.call(document.querySelectorAll("#pbGrid .phrase"), function (card) {
        card.addEventListener("click", function (e) {
          if (e.target.closest(".speak-btn")) return;
          card.classList.toggle("reveal");
        });
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll(".pb-cat"), function (b) {
      b.addEventListener("click", function () {
        Array.prototype.forEach.call(document.querySelectorAll(".pb-cat"), function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        showCat(+b.getAttribute("data-cat"));
      });
    });
    showCat(0);
  }

  function renderPlan() {
    var head =
      '<div class="section-head reveal-up"><span class="kicker">' + esc(t(UI.plan_k)) + "</span>" +
      "<h2>" + esc(t(UI.plan_h)) + "</h2><p>" + esc(t(UI.plan_p)) + "</p></div>";
    var days = PLAN.map(function (d) {
      var items = d.items.map(function (it) {
        var guide = charById(it.who);
        return '<div class="tl-item ' + CCLASS[it.who] + '">' +
          '<div class="tl-time">' + it.time + "</div>" +
          "<div><div class=\"who\">" + esc(guide.name || "") + "</div>" +
          "<h4>" + esc(t(it.h)) + "</h4><p>" + esc(t(it.p)) + "</p></div></div>";
      }).join("");
      return '<div class="day-head"><span class="d">' + esc(t(d.day)) + '</span><span class="dl">' + esc(t(d.sub)) + "</span></div>" + items;
    }).join("");
    $("#plan").innerHTML = '<div class="wrap">' + head + '<div class="timeline reveal-up">' + days + "</div></div>";
  }

  function renderFooter() {
    $("#foot").innerHTML =
      '<div class="wrap"><div style="width:56px;margin:0 auto 18px">' + ART.apertureEye("#ff9d2f") + "</div>" +
      '<p class="sig">' + esc(t(UI.footsig)) + "</p>" +
      '<a class="back" href="https://0x4d44.github.io/">' + esc(t(UI.back)) + "</a>" +
      '<div class="mosaic-rule"></div></div>';
  }

  // ==================== character modal ====================
  function openChar(id) {
    var ch = charById(id); if (!ch.id) return;
    var back = $("#modalBack");
    back.className = "modal-back open";
    back.innerHTML =
      '<div class="modal ' + CCLASS[id] + '" role="dialog" aria-modal="true">' +
        '<button class="icon-btn m-close" aria-label="close">✕</button>' +
        '<div class="m-head">' + (ART.avatars[id] || "") +
          "<div><div class=\"cc-role\">" + esc(t(ch.role)) + "</div><h3>" + esc(ch.name) + "</h3>" +
          '<p class="cc-arch" style="color:var(--ink-dim);margin:6px 0 0">' + esc(ch.archetype) + "</p></div></div>" +
        '<div class="m-body">' +
          "<h4>" + (L === "es" ? "Historia" : "Backstory") + "</h4>" +
          (ch.backstory || []).map(function (p) { return "<p>" + esc(t(p)) + "</p>"; }).join("") +
          "<h4>" + (L === "es" ? "Cómo habla" : "Voice") + "</h4><p>" + esc(t(ch.voice)) + "</p>" +
          "<h4>" + (L === "es" ? "Frases célebres" : "Signature lines") + "</h4>" +
          '<ul class="lines">' + (ch.lines || []).map(function (l) {
            return "<li>" + esc(t(l)) + ' <button class="speak-btn" data-speak="' + esc(t(l)) + '" title="listen">▷</button></li>';
          }).join("") + "</ul>" +
        "</div></div>";
    $(".m-close", back).addEventListener("click", closeChar);
    back.addEventListener("click", function (e) { if (e.target === back) closeChar(); });
    wireSpeak();
  }
  function closeChar() { var b = $("#modalBack"); b.className = "modal-back"; b.innerHTML = ""; }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeChar(); });

  // ==================== speech ====================
  var voice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    var vs = speechSynthesis.getVoices();
    voice = vs.find(function (v) { return /es[-_]ES/i.test(v.lang); }) ||
            vs.find(function (v) { return /^es/i.test(v.lang); }) || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text) {
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "es-ES"; if (voice) u.voice = voice; u.rate = 0.95;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function wireSpeak() {
    Array.prototype.forEach.call(document.querySelectorAll(".speak-btn"), function (b) {
      if (b._wired) return; b._wired = true;
      b.addEventListener("click", function (e) { e.stopPropagation(); say(b.getAttribute("data-speak")); });
    });
  }

  // ==================== map ====================
  var map = null, markers = {};
  function initMap() {
    // Leaflet's global is `L`, which clashes with our local language var `L`;
    // always reach it via window.L.
    var LF = window.L;
    if (!LF) {
      // graceful fallback if the CDN is unreachable: the map list beside it
      // still works, so just explain the empty box rather than leave it blank.
      var box = $("#map");
      if (box) box.innerHTML = '<div style="height:100%;display:grid;place-items:center;text-align:center;padding:24px;' +
        'font-family:var(--font-mono);color:var(--ink-faint);font-size:.82rem;line-height:1.6">' +
        (L === "es" ? "El mapa interactivo no ha podido cargar.<br>Usa la lista de la derecha para ver los tres lugares." :
                      "The interactive map could not load.<br>Use the list on the right for the three landmarks.") + "</div>";
      return;
    }
    if (map) { map.remove(); map = null; markers = {}; }
    var vs = C.venues || [];
    map = LF.map("map", { scrollWheelZoom: false, zoomControl: true }).setView([41.383, 2.178], 13);
    LF.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "© OpenStreetMap"
    }).addTo(map);
    var colors = { sagrada: "#4bb3e6", aquarium: "#2fb8a8", cruise: "#3f6fb0" };
    var bounds = [];
    vs.forEach(function (v) {
      var icon = LF.divIcon({
        className: "", iconSize: [44, 44], iconAnchor: [22, 40], popupAnchor: [0, -38],
        html: '<div class="mk" style="background:' + colors[v.slug] + '"><span>' + (ART.icons[iconFor(v.slug)] || "") + "</span></div>"
      });
      var m = LF.marker([v.lat, v.lng], { icon: icon }).addTo(map);
      var g = charById(GUIDE[v.slug]);
      m.bindPopup("<b>" + esc(t(v.name)) + "</b><br><span style='font-family:var(--font-mono);font-size:.72rem;color:var(--ink-dim)'>" +
        esc(t(v.kicker)) + "</span><br><span style='font-size:.8rem'>" + esc(t(UI.guidedby)) + ": " + esc(g.name || "") + "</span>");
      m.on("click", function () { markTest(v.slug); highlightList(v.slug); });
      markers[v.slug] = m;
      bounds.push([v.lat, v.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [50, 50] });
  }
  function focusVenue(slug) {
    if (map && markers[slug]) { map.flyTo(markers[slug].getLatLng(), 15, { duration: 0.8 }); markers[slug].openPopup(); }
    highlightList(slug); markTest(slug);
  }
  function highlightList(slug) {
    Array.prototype.forEach.call(document.querySelectorAll(".map-item"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-slug") === slug);
    });
  }

  // ==================== test-completion HUD ====================
  var done = {};
  try { done = JSON.parse(localStorage.getItem(LS_DONE) || "{}"); } catch (e) { done = {}; }
  function markTest(slug) {
    if (done[slug]) return;
    done[slug] = 1;
    localStorage.setItem(LS_DONE, JSON.stringify(done));
    updateHud();
    var v = (C.venues || []).find(function (x) { return x.slug === slug; });
    toast(t(UI.ach), t(v ? v.name : { en: "", es: "" }));
    if (Object.keys(done).length >= (C.venues || []).length) {
      setTimeout(function () { toast("★ " + t(UI.ach), t(UI.ach_all)); }, 900);
    }
  }
  function updateHud() {
    var total = (C.venues || []).length || 3;
    var n = Object.keys(done).filter(function (k) { return done[k]; }).length;
    var hud = $("#hud");
    hud.innerHTML =
      '<span class="eye" style="width:22px;height:22px">' + ART.apertureEye() + "</span>" +
      '<span class="lbl">' + esc(t(UI.hud)) + "</span>" +
      '<span class="bar"><i style="width:' + Math.round(n / total * 100) + '%"></i></span>' +
      "<b>" + n + "/" + total + "</b>";
  }
  function toast(title, body) {
    var w = $("#toasts");
    var el_ = el('<div class="toast"><div class="t">' + esc(title) + '</div><div>' + esc(body) + "</div></div>");
    w.appendChild(el_);
    setTimeout(function () { el_.style.transition = "opacity .5s, transform .5s"; el_.style.opacity = "0"; el_.style.transform = "translateY(10px)"; }, 3200);
    setTimeout(function () { if (el_.parentNode) el_.parentNode.removeChild(el_); }, 3800);
  }

  // ==================== observers ====================
  var io = null, vio = null;
  function initObservers() {
    if (io) io.disconnect();
    io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    Array.prototype.forEach.call(document.querySelectorAll(".reveal-up"), function (n) { io.observe(n); });
  }
  function observeVenues() {
    if (vio) vio.disconnect();
    vio = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.5) { markTest(e.target.getAttribute("data-slug")); } });
    }, { threshold: [0.5] });
    Array.prototype.forEach.call(document.querySelectorAll(".venue"), function (v) { vio.observe(v); });
  }

  // ==================== language ====================
  function setLang(next) {
    if (next === L) return;
    L = next; localStorage.setItem(LS_LANG, L);
    render();
    updateHud();
  }

  // ==================== boot ====================
  function boot() {
    if (!window.CONTENT) { console.error("CONTENT missing"); return; }
    render();
    updateHud();
    $("#langEN").addEventListener("click", function () { setLang("en"); });
    $("#langES").addEventListener("click", function () { setLang("es"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
