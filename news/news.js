/* ============================================================
   The Daily Flange — shared engine
   Vanilla JS, no build step. Reads window.NEWS_ARTICLES
   (articles.js) and window.NEWS_ADS (ads.js) and renders the
   homepage, article pages and search — all client-side.

   Homepage selection is seeded on the current hour, so the front
   page reshuffles through the day like a real news site (with an
   inevitably finite corpus, stories recur).
   ============================================================ */
(function () {
  "use strict";

  // Drop shape-invalid articles once, at the trust boundary: the About page invites
  // contributors to append an object to articles.js "with no editorial oversight", and the
  // search scorer / sort key dereference a.category/headline/standfirst directly, so one
  // fat-fingered append (missing or non-string field) would throw and blank whole pages.
  // Skipping the bad entry keeps every other story rendering.
  var ARTICLES = (window.NEWS_ARTICLES || []).filter(function (a) {
    return a && typeof a.id === "string" && typeof a.category === "string" &&
      typeof a.headline === "string" && typeof a.standfirst === "string";
  });
  var ADS = window.NEWS_ADS || [];

  // Two-level section taxonomy. Each article still carries a single leaf
  // `category` (see CAT below) — GROUPS is a presentation layer over those
  // leaves. A group with no children is itself a leaf (a plain top-level link);
  // a group with children is a dropdown, and browsing it
  // (search.html?cat=<group>) shows every story across its children.
  // `selfLeaf: true` marks a group whose own name is ALSO a genuine leaf
  // category (World has plain World stories AND an Aberdeen subcategory) —
  // "All World" then covers both, while "Aberdeen" filters to just its own.
  var GROUPS = [
    { name: "World",          selfLeaf: true, children: ["Aberdeen"] },
    { name: "Transport",      children: ["Aviation", "Maritime", "Engineering", "Buses"] },
    { name: "Science & Tech", children: ["Science", "Technology", "Health"] },
    { name: "Business",       selfLeaf: true, children: ["Middle Management"] },
    { name: "Sport",          children: ["Football", "Cricket", "Olympics", "Tennis", "Athletics", "Other Sports", "Motorsport"] },
    { name: "Life",           children: ["Lifestyle", "Weather", "Horoscopes", "Obituaries"] },
    { name: "Flanging",       children: [] },
    { name: "Opinion",        children: ["Voices", "Letters"] }
  ];

  // Flat leaf order, derived from the groups. Used by the footer, the section
  // feature rotation and anywhere that iterates the real (leaf) sections.
  var CATEGORY_ORDER = [];
  GROUPS.forEach(function (g) {
    if (g.children.length) {
      if (g.selfLeaf) CATEGORY_ORDER.push(g.name);
      CATEGORY_ORDER = CATEGORY_ORDER.concat(g.children);
    } else {
      CATEGORY_ORDER.push(g.name);
    }
  });

  // Find a named parent desk. Returns the group or null.
  function groupByName(name) {
    var lc = String(name).toLowerCase();
    for (var i = 0; i < GROUPS.length; i++) {
      if (GROUPS[i].children.length && GROUPS[i].name.toLowerCase() === lc) return GROUPS[i];
    }
    return null;
  }

  // -------- category art metadata (colour + icon path) --------
  var CAT = {
    World:       { c1: "#1f4e79", c2: "#123a5c", icon: "globe" },
    Aviation:    { c1: "#0a6ea6", c2: "#064a6f", icon: "plane" },
    Maritime:    { c1: "#0e6b6b", c2: "#084848", icon: "ship" },
    Engineering: { c1: "#8a5a12", c2: "#5c3a08", icon: "gear" },
    Science:     { c1: "#5b2a86", c2: "#3d1c5c", icon: "atom" },
    Technology:  { c1: "#245", c2: "#123", icon: "chip" },
    Business:    { c1: "#12603a", c2: "#0b3f26", icon: "chart" },
    Health:      { c1: "#a12b46", c2: "#6f1c30", icon: "health" },
    Sport:       { c1: "#155e2b", c2: "#0d3d1c", icon: "trophy" },
    Buses:       { c1: "#8a5a12", c2: "#5c3a08", icon: "gear" },
    Weather:     { c1: "#3a5a8a", c2: "#243a5c", icon: "cloud" },
    Lifestyle:   { c1: "#b0357e", c2: "#761f54", icon: "sparkle" },
    Obituaries:  { c1: "#434a54", c2: "#23272e", icon: "candle" },
    Voices:      { c1: "#6b4a1f", c2: "#402a10", icon: "quill" },
    Letters:     { c1: "#7a3b2e", c2: "#4f241b", icon: "envelope" },
    Horoscopes:  { c1: "#3b2f6b", c2: "#241c45", icon: "star" },
    Flanging:    { c1: "#7a3b2e", c2: "#4f241b", icon: "gear" },
    Aberdeen:    { c1: "#556270", c2: "#33404a", icon: "granite" }
  };
  ["Football", "Cricket", "Olympics", "Tennis", "Athletics", "Other Sports", "Motorsport"].forEach(function (category) {
    CAT[category] = CAT.Sport;
  });
  CAT["Middle Management"] = CAT.Business;
  function catMeta(cat) { return CAT[cat] || { c1: "#555", c2: "#333", icon: "gear" }; }

  var ICONS = {
    plane: '<path d="M60 90 L150 76 L200 40 L214 46 L180 84 L250 84 L280 60 L292 66 L272 96 L292 126 L280 132 L250 108 L180 108 L214 146 L200 152 L150 116 Z"/>',
    ship: '<path d="M70 150 L330 150 L300 210 L100 210 Z"/><rect x="150" y="96" width="100" height="54"/><rect x="188" y="60" width="24" height="36"/><path d="M60 150 L340 150" stroke-width="8" fill="none"/>',
    gear: '<g fill="#fff">'
        + '<rect x="191" y="62" width="18" height="30" rx="3"/>'
        + '<rect x="191" y="62" width="18" height="30" rx="3" transform="rotate(45 200 128)"/>'
        + '<rect x="191" y="62" width="18" height="30" rx="3" transform="rotate(90 200 128)"/>'
        + '<rect x="191" y="62" width="18" height="30" rx="3" transform="rotate(135 200 128)"/>'
        + '<rect x="191" y="62" width="18" height="30" rx="3" transform="rotate(180 200 128)"/>'
        + '<rect x="191" y="62" width="18" height="30" rx="3" transform="rotate(225 200 128)"/>'
        + '<rect x="191" y="62" width="18" height="30" rx="3" transform="rotate(270 200 128)"/>'
        + '<rect x="191" y="62" width="18" height="30" rx="3" transform="rotate(315 200 128)"/>'
        + '<circle cx="200" cy="128" r="48"/></g>'
        + '<circle cx="200" cy="128" r="22" fill="#000" fill-opacity=".32"/>',
    atom: '<circle cx="200" cy="128" r="14"/><g fill="none" stroke-width="7"><ellipse cx="200" cy="128" rx="86" ry="34"/><ellipse cx="200" cy="128" rx="86" ry="34" transform="rotate(60 200 128)"/><ellipse cx="200" cy="128" rx="86" ry="34" transform="rotate(120 200 128)"/></g>',
    chip: '<rect x="150" y="78" width="100" height="100" rx="8"/><g stroke-width="8">'
        + '<line x1="150" y1="98" x2="122" y2="98"/><line x1="150" y1="128" x2="122" y2="128"/><line x1="150" y1="158" x2="122" y2="158"/>'
        + '<line x1="250" y1="98" x2="278" y2="98"/><line x1="250" y1="128" x2="278" y2="128"/><line x1="250" y1="158" x2="278" y2="158"/>'
        + '<line x1="178" y1="78" x2="178" y2="52"/><line x1="222" y1="78" x2="222" y2="52"/>'
        + '<line x1="178" y1="178" x2="178" y2="204"/><line x1="222" y1="178" x2="222" y2="204"/></g><rect x="176" y="104" width="48" height="48" fill="#000" opacity=".28"/>',
    chart: '<g stroke-width="0"><rect x="120" y="150" width="34" height="56"/><rect x="170" y="112" width="34" height="94"/><rect x="220" y="132" width="34" height="74"/><rect x="270" y="86" width="34" height="120"/></g><path d="M110 96 L170 130 L220 108 L300 60" fill="none" stroke-width="7"/>',
    health: '<path d="M180 70 h40 v40 h40 v40 h-40 v40 h-40 v-40 h-40 v-40 h40 Z"/>',
    globe: '<circle cx="200" cy="128" r="80" fill="none" stroke-width="7"/><g fill="none" stroke-width="6"><ellipse cx="200" cy="128" rx="34" ry="80"/><line x1="120" y1="128" x2="280" y2="128"/><line x1="132" y1="90" x2="268" y2="90"/><line x1="132" y1="166" x2="268" y2="166"/></g>',
    trophy: '<path d="M164 70 h72 v34 a36 36 0 0 1 -72 0 Z"/><path d="M164 78 h-22 a22 22 0 0 0 22 22" fill="none" stroke-width="8"/><path d="M236 78 h22 a22 22 0 0 1 -22 22" fill="none" stroke-width="8"/><rect x="190" y="132" width="20" height="26"/><rect x="168" y="158" width="64" height="16"/>',
    cloud: '<path d="M150 168 a34 34 0 0 1 4 -67 a44 44 0 0 1 84 8 a30 30 0 0 1 -4 59 Z"/><g stroke-width="7"><line x1="160" y1="184" x2="150" y2="204"/><line x1="200" y1="184" x2="190" y2="204"/><line x1="240" y1="184" x2="230" y2="204"/></g>',
    sparkle: '<path d="M200 66 L216 112 L262 128 L216 144 L200 190 L184 144 L138 128 L184 112 Z"/><path d="M282 82 L289 102 L309 109 L289 116 L282 136 L275 116 L255 109 L275 102 Z"/><circle cx="128" cy="170" r="7"/>',
    candle: '<rect x="185" y="118" width="30" height="74" rx="3"/><path d="M200 74 C186 94 194 114 200 114 C206 114 214 94 200 74 Z"/><rect x="175" y="190" width="50" height="10" rx="3"/>',
    quill: '<path d="M150 198 C172 138 224 96 300 74 C286 150 224 188 176 192 Z"/><rect x="120" y="196" width="46" height="9" rx="4" transform="rotate(-42 143 200)"/>',
    envelope: '<rect x="118" y="88" width="164" height="104" rx="6" fill="none" stroke-width="9"/><path d="M124 96 L200 150 L276 96" fill="none" stroke-width="9"/>',
    star: '<path d="M200 64 L219 122 L280 122 L231 158 L250 216 L200 180 L150 216 L169 158 L120 122 L181 122 Z"/>',
    granite: '<polygon points="200,58 258,92 258,158 200,192 142,158 142,92"/>'
        + '<g stroke="#000" stroke-opacity=".22" stroke-width="5" fill="none">'
        + '<line x1="200" y1="58" x2="200" y2="192"/><line x1="142" y1="92" x2="258" y2="158"/><line x1="258" y1="92" x2="142" y2="158"/></g>'
  };

  // -------- deterministic hashing / PRNG --------
  function hash(str) {
    var h = 2166136261 >>> 0;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffleSeeded(arr, seed) {
    var a = arr.slice(), rnd = mulberry32(seed >>> 0);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // -------- article art --------
  function illustration(article) {
    if (article.image) {
      return '<img src="' + esc(article.image) + '" alt="' + esc(article.imageAlt || (article.category + ' illustration')) + '">';
    }
    var m = catMeta(article.category);
    var h = hash(article.id);
    var hue = h % 40 - 20;                 // small per-article hue shift
    var icon = ICONS[m.icon] || ICONS.gear;
    // subtle diagonal texture lines seeded by id
    var lines = "";
    var rnd = mulberry32(h);
    for (var i = 0; i < 5; i++) {
      var y = 20 + Math.floor(rnd() * 220);
      lines += '<line x1="0" y1="' + y + '" x2="400" y2="' + (y - 40) + '" stroke="#ffffff" stroke-opacity="0.05" stroke-width="14"/>';
    }
    return '' +
      '<svg viewBox="0 0 400 256" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(article.category) + ' illustration" preserveAspectRatio="xMidYMid slice">' +
        '<defs><linearGradient id="g' + h + '" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="' + m.c1 + '"/><stop offset="1" stop-color="' + m.c2 + '"/>' +
        '</linearGradient></defs>' +
        '<rect width="400" height="256" fill="url(#g' + h + ')"/>' +
        lines +
        '<g transform="translate(0,4) rotate(' + hue + ' 200 128)" fill="#ffffff" fill-opacity="0.9" stroke="#ffffff" stroke-opacity="0.9">' + icon + '</g>' +
        '<text x="16" y="240" font-family="Georgia, serif" font-size="15" fill="#ffffff" fill-opacity="0.35" font-style="italic">The Daily Flange</text>' +
      '</svg>';
  }

  function inlineIllustrationHtml(article, paragraphIndex) {
    var items = (article.images || []).filter(function (image) {
      return image.afterParagraph === paragraphIndex;
    });
    return items.map(function (item) {
      return '<figure class="inline-illustration"><img src="' + esc(item.src) + '" alt="' +
        esc(item.alt || "Article illustration") + '">' +
        (item.caption ? '<figcaption>' + esc(item.caption) + '</figcaption>' : '') +
        '</figure>';
    }).join("");
  }

  // -------- dates --------
  var MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function fmtDate(iso) {
    var s = String(iso || "");
    var y = +s.slice(0, 4), mo = +s.slice(5, 7), d = +s.slice(8, 10);
    if (!y || !mo || !d) return "";
    return String(d).padStart(2, "0") + " " + MON[mo - 1] + " " + y;
  }
  // "relative-ish" freshness stamp that leans on the live clock, so the
  // homepage feels current. We map the seeded shuffle position to a plausible
  // "x hours/minutes ago" without needing per-article real times.
  function agoStamp(minutesAgo) {
    if (minutesAgo < 1) return "Just now";
    if (minutesAgo < 60) return minutesAgo + " min ago";
    var h = Math.floor(minutesAgo / 60);
    if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    var d = Math.floor(h / 24);
    return d + (d === 1 ? " day ago" : " days ago");
  }

  // -------- rotation --------
  // Seed changes every hour → the homepage reshuffles through the day.
  function hourSeed() {
    var now = new Date();
    return Math.floor(now.getTime() / 3600000);
  }
  function rotated() {
    return shuffleSeeded(ARTICLES, hourSeed());
  }

  // -------- URL helpers --------
  function articleUrl(a) { return "article.html?id=" + encodeURIComponent(a.id); }
  function seriesNav(a) {
    if (!a || !a.series) return "";
    var series = ARTICLES.filter(function (x) { return x.series === a.series; })
      .sort(function (x, y) { return x.seriesPart - y.seriesPart; });
    var pos = series.indexOf(a);
    var previous = pos > 0 ? '<a href="' + articleUrl(series[pos - 1]) + '">&larr; Part ' + String(series[pos - 1].seriesPart).padStart(2, "0") + '</a>' : '<span>&larr; First part</span>';
    var next = pos >= 0 && pos < series.length - 1 ? '<a href="' + articleUrl(series[pos + 1]) + '">Part ' + String(series[pos + 1].seriesPart).padStart(2, "0") + ' &rarr;</a>' : '<span>Final part &rarr;</span>';
    return '<div class="series-nav"><div><strong>' + esc(a.series) + '</strong><span>Book ' + esc(a.seriesBook || "") + ' &middot; Part ' + String(a.seriesPart).padStart(2, "0") + ' of ' + series.length + '</span></div><div>' + previous + next + '</div></div>';
  }
  function catUrl(c) { return "search.html?cat=" + encodeURIComponent(c); }
  function qs(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(location.search);
    if (!m) return "";
    // A stray '%' or truncated escape (?id=%, ?q=100%) makes decodeURIComponent throw
    // URIError; uncaught it aborts the mount and blanks the page. Degrade to "" instead.
    try { return decodeURIComponent(m[1].replace(/\+/g, " ")); } catch (e) { return ""; }
  }

  // -------- shared chrome --------
  function headerHtml(activeCat) {
    var now = new Date();
    // Weekday and printed date must come from ONE clock. getDay() is local, so build the
    // date from local Y/M/D too — mixing in fmtDate(now.toISOString()) (UTC) made the
    // masthead show a weekday that disagreed with its date for the sub-UTC hour each night.
    var localDate = now.getFullYear() + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    var dayStr = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][now.getDay()] +
      ", " + fmtDate(localDate);
    var nav = GROUPS.map(function (g) {
      // Leaf group → plain top-level link.
      if (!g.children.length) {
        return '<a href="' + catUrl(g.name) + '"' + (g.name === activeCat ? ' class="active"' : '') +
          '>' + esc(g.name) + '</a>';
      }
      // Parent group → dropdown. Active if the group page or any child is active.
      var groupActive = (g.name === activeCat) || g.children.indexOf(activeCat) !== -1;
      var kids = '<a href="' + catUrl(g.name) + '" role="menuitem">All ' + esc(g.name) + '</a>' +
        g.children.map(function (c) {
          return '<a href="' + catUrl(c) + '"' + (c === activeCat ? ' class="active"' : '') +
            ' role="menuitem">' + esc(c) + '</a>';
        }).join("");
      return '<div class="catnav-group">' +
        '<button type="button" class="catnav-drop-btn' + (groupActive ? ' active' : '') +
          '" aria-haspopup="true" aria-expanded="false">' +
          esc(g.name) + ' <span class="chev" aria-hidden="true">&#9662;</span></button>' +
        '<div class="catnav-drop-menu" role="menu">' + kids + '</div>' +
      '</div>';
    }).join("");
    // a silly rotating "weather" pill
    var weathers = ["Fog (has passport)", "Mild disappointment", "Aggressive air", "43% Tuesday", "Scattered smugness", "Light flanging"];
    var wx = weathers[hourSeed() % weathers.length];
    return '' +
      '<div class="utility"><div class="wrap">' +
        '<div class="u-left"><span class="edition">UK Edition</span><span class="hide-sm">' + esc(dayStr) + '</span></div>' +
        '<div class="u-right"><span class="weather-pill hide-sm">&#9729; ' + esc(wx) + '</span>' +
          '<a href="about.html" class="hide-sm">About</a><a href="../">The Almanac</a></div>' +
      '</div></div>' +
      '<header class="masthead"><div class="wrap">' +
        '<a class="brand" href="index.html">' +
          '<span class="mark">DF</span>' +
          '<span class="titles"><h1>The Daily Flange</h1><div class="tag">All the news that&#39;s unfit to be true</div></span>' +
        '</a>' +
        '<span class="spacer"></span>' +
        '<div class="search-box"><form action="search.html" method="get" role="search">' +
          '<input type="text" name="q" placeholder="Search the news&hellip;" aria-label="Search articles">' +
          '<button type="submit">Search</button>' +
        '</form></div>' +
      '</div></header>' +
      '<nav class="catnav" aria-label="Sections"><div class="wrap">' +
        '<a href="index.html"' + (activeCat ? '' : ' class="active"') + '>Home</a>' + nav + '<a href="puzzles.html"' + (activeCat === 'Puzzles' ? ' class="active"' : '') + '>Puzzles</a>' +
        '<div class="catnav-more" hidden>' +
          '<button type="button" class="catnav-more-btn" aria-haspopup="true" aria-expanded="false" aria-controls="catnav-more-menu" aria-label="Open more sections">' +
            '<span class="catnav-more-label">More</span> <span class="chev" aria-hidden="true">&#9662;</span></button>' +
          '<div id="catnav-more-menu" class="catnav-more-menu" role="menu"></div>' +
        '</div>' +
      '</div></nav>';
  }

  // -------- responsive section navigation --------
  // Real newspaper sites (BBC, Guardian, NYT) don't scroll their section bar on
  // desktop; they show as many sections as the width allows and tuck the rest
  // behind a "More" menu. This measures the bar and does exactly that, re-running
  // on resize. With JS off, the bar degrades to the horizontal-scroll fallback.
  var catnavState = { onResize: null, onDocClick: null, onKey: null, onScroll: null, ro: null };

  function isMobileNav() {
    return window.matchMedia
      ? window.matchMedia("(max-width: 760px)").matches
      : window.innerWidth <= 760;
  }

  function enhanceCatnav() {
    var wrap = document.querySelector(".catnav .wrap");
    if (!wrap) return;
    wrap.parentNode.classList.add("enhanced");   // swap scroll fallback for fitted mode
    var more = wrap.querySelector(".catnav-more");
    var moreBtn = more.querySelector(".catnav-more-btn");
    var moreLabel = moreBtn.querySelector(".catnav-more-label");
    var moreMenu = more.querySelector(".catnav-more-menu");

    // Direct children of the bar, minus the "More" container: plain links plus
    // group dropdowns — each an atomic, measurable item.
    function barItems() {
      return [].slice.call(wrap.children).filter(function (el) { return el !== more; });
    }
    function sizeMobileMenu() {
      if (!isMobileNav()) {
        moreMenu.style.removeProperty("--mobile-menu-max-height");
        return;
      }
      var navBottom = wrap.parentNode.getBoundingClientRect().bottom;
      var available = Math.max(160, window.innerHeight - navBottom);
      moreMenu.style.setProperty("--mobile-menu-max-height", Math.floor(available) + "px");
    }
    // Every toggleable menu on the bar (group dropdowns + the overflow menu).
    function menus() {
      return [].slice.call(wrap.querySelectorAll(".catnav-drop-menu, .catnav-more-menu"));
    }
    function closeAll(except) {
      menus().forEach(function (m) {
        if (m === except) return;
        m.classList.remove("open");
        if (m.previousElementSibling) m.previousElementSibling.setAttribute("aria-expanded", "false");
      });
    }

    function layout() {
      closeAll();
      // Pull everything back onto the bar so we measure from a clean slate.
      while (moreMenu.firstChild) wrap.insertBefore(moreMenu.firstChild, more);
      more.hidden = true;

      var items = barItems();
      var mobile = isMobileNav();
      moreLabel.textContent = mobile ? "Menu" : "More";
      moreBtn.setAttribute("aria-label", mobile ? "Open sections menu" : "Open more sections");
      if (mobile) {
        // Mobile uses the established drawer/sheet pattern: keep one stable
        // entry point and make the complete section list vertically scrollable.
        more.hidden = false;
        for (i = 1; i < items.length; i++) moreMenu.appendChild(items[i]);
        sizeMobileMenu();
        syncMore();
        return;
      }
      sizeMobileMenu();

      var cs = getComputedStyle(wrap);
      var avail = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var total = 0, i;
      for (i = 0; i < items.length; i++) total += items[i].offsetWidth;
      if (total <= avail + 1) { syncMore(); return; }   // it all fits, no More needed

      // Overflow: reveal the button and reserve room for it.
      more.hidden = false;
      var budget = avail - more.offsetWidth;
      var used = 0, cut = items.length;
      for (i = 0; i < items.length; i++) {
        used += items[i].offsetWidth;
        if (used > budget) { cut = i; break; }
      }
      if (cut < 1) cut = 1;                                 // always keep "Home"
      for (i = cut; i < items.length; i++) moreMenu.appendChild(items[i]);
      syncMore();
    }

    // Light up "More" if it now hides the active section — either a plain active
    // link or a group whose button is active (its child/landing is current).
    function syncMore() {
      moreBtn.classList.toggle("active", !!moreMenu.querySelector("a.active, .catnav-drop-btn.active"));
    }

    // One delegated handler drives every dropdown. Toggles apply to bar-level
    // buttons (group dropdowns and "More"); a group flattened inside the "More"
    // menu is a static header, so its button is ignored here (CSS keeps it open).
    wrap.addEventListener("click", function (e) {
      var toggle = e.target.closest && e.target.closest(".catnav-drop-btn, .catnav-more-btn");
      if (toggle && !toggle.closest(".catnav-more-menu")) {
        e.preventDefault();
        e.stopPropagation();
        var m = toggle.nextElementSibling;
        var open = !m.classList.contains("open");
        closeAll(open ? m : null);
        m.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
      }
      // clicks on menu links fall through and navigate normally
    });

    // Reset any handlers/observer from a previous render before wiring new ones.
    if (catnavState.onResize) window.removeEventListener("resize", catnavState.onResize);
    if (catnavState.onDocClick) document.removeEventListener("click", catnavState.onDocClick);
    if (catnavState.onKey) document.removeEventListener("keydown", catnavState.onKey);
    if (catnavState.onScroll) window.removeEventListener("scroll", catnavState.onScroll);
    if (catnavState.ro) catnavState.ro.disconnect();

    var raf = 0;
    catnavState.onResize = function () {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(layout);
    };
    catnavState.onDocClick = function () { closeAll(); };
    catnavState.onKey = function (e) { if (e.key === "Escape") closeAll(); };
    catnavState.onScroll = function () { if (isMobileNav()) sizeMobileMenu(); };
    window.addEventListener("resize", catnavState.onResize);
    document.addEventListener("click", catnavState.onDocClick);
    document.addEventListener("keydown", catnavState.onKey);
    window.addEventListener("scroll", catnavState.onScroll, { passive: true });
    if (typeof ResizeObserver === "function") {
      catnavState.ro = new ResizeObserver(catnavState.onResize);
      catnavState.ro.observe(wrap);
    }

    layout();
    // Re-measure once web fonts settle (their widths shift the fit).
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  }

  function tickerHtml() {
    var picks = rotated().slice(0, 8);
    var items = picks.map(function (a) {
      return '<a href="' + articleUrl(a) + '">' + esc(a.headline) + '</a><span class="sep">&#9670;</span>';
    }).join(" ");
    return '' +
      '<div class="ticker"><div class="label">&#9679; Breaking</div>' +
      '<div class="track-wrap"><div class="track">' + items + items + '</div></div></div>';
  }

  function footerHtml() {
    var cols = [
      ["Sections", CATEGORY_ORDER.slice(0, 6).map(function (c) { return ['<a href="' + catUrl(c) + '">' + esc(c) + '</a>']; })],
      ["More", CATEGORY_ORDER.slice(6).map(function (c) { return ['<a href="' + catUrl(c) + '">' + esc(c) + '</a>']; })],
      ["The Flange", [
        '<a href="about.html">About us</a>',
        '<a href="index.html">Front page</a>',
        '<a href="search.html">Search</a>',
        '<a href="../">The Almanac</a>'
      ]],
      ["Legal-ish", [
        '<a href="about.html">Corrections (all of them)</a>',
        '<a href="about.html">Editorial guidelines</a>',
        '<a href="about.html">Complaints hotline</a>'
      ]]
    ];
    var colsHtml = cols.map(function (col) {
      var items = [].concat.apply([], col[1]).map(function (x) { return '<li>' + x + '</li>'; }).join("");
      return '<div><h6>' + esc(col[0]) + '</h6><ul>' + items + '</ul></div>';
    }).join("");
    return '' +
      '<footer class="site-footer"><div class="wrap">' +
        '<div class="brandline">The Daily Flange</div>' +
        '<div class="cols">' + colsHtml + '</div>' +
        '<div class="legal">' +
          '<p>The Daily Flange is a work of satire. Every article, byline, quotation, statistic, ' +
          'expert, institution and advertisement on this site is entirely fictional and invented for ' +
          'comic effect. Any resemblance to real events, persons or working sprockets is coincidental. ' +
          'Nothing here is true, and none of it is advice.</p>' +
          '<p>Part of the <a href="../">0x4D44 Almanac</a>. No sprockets were harmed. Remember to flange regularly.</p>' +
        '</div>' +
      '</div></footer>';
  }

  // -------- ad rendering --------
  function pickAds(slot, n, seedExtra) {
    var pool = ADS.filter(function (a) { return !a.slots || a.slots.indexOf(slot) !== -1; });
    if (!pool.length) pool = ADS;
    var seq = shuffleSeeded(pool, hourSeed() + hash(slot + (seedExtra || "")));
    return seq.slice(0, n);
  }
  function adHtml(ad, kind) {
    // kind: "leader" | "mpu"
    if (!ad) return ""; // no ad to show (e.g. empty/failed ads.js) — render nothing, don't throw
    var fx = ad.fx || [];
    var cls = ["ad", kind === "leader" ? "ad-leader" : "ad-mpu"];
    fx.forEach(function (f) {
      if (f === "flicker") cls.push("ad-flicker");
      if (f === "jitter") cls.push("ad-jitter");
      if (f === "rainbow") cls.push("ad-rainbow");
      if (f === "slide") cls.push("ad-slide");
    });
    var bg = ad.bg || "linear-gradient(90deg,#ff5f6d,#ffc371)";
    var fg = ad.fg || "#111";
    var href = ad.href || "#";
    var target = /^https?:|^\.\.\//.test(href) ? ' rel="nofollow"' : "";
    var shine = fx.indexOf("slide") !== -1 ? '<span class="shine"></span>' : "";
    var art = ad.image
      ? '<img class="ad-art" src="' + esc(ad.image) + '" alt="" aria-hidden="true">'
      : "";
    var head = ad.blink ? '<span class="blink">' + esc(ad.headline) + '</span>' : esc(ad.headline);
    var iconSvg = ad.icon && window.AD_ICONS && window.AD_ICONS[ad.icon];
    var badge = iconSvg
      ? '<span class="ad-icon' + (ad.bob ? ' bob' : '') + '"><svg viewBox="0 0 64 64" aria-hidden="true">' + iconSvg + '</svg></span>'
      : (ad.bob ? '<span class="bob">' + esc(ad.emoji || "") + '</span> ' : (ad.emoji ? esc(ad.emoji) + " " : ""));
    var headBadge = iconSvg ? "" : badge;
    return '' +
      '<a class="' + cls.join(" ") + '" href="' + esc(href) + '"' + target + ' style="background:' + esc(bg) + ';color:' + esc(fg) + '">' +
        '<span class="ad-label">Ad</span>' + shine +
        '<span class="ad-inner">' +
          art +
          (iconSvg ? badge : "") +
          '<span style="flex:1">' +
            '<h5>' + headBadge + head + '</h5>' +
            '<p>' + esc(ad.body) + '</p>' +
          '</span>' +
          '<span class="cta">' + esc(ad.cta || "Learn more") + '</span>' +
        '</span>' +
      '</a>';
  }

  // -------- card renderers --------
  function heroHtml(a, minutesAgo) {
    return '' +
      '<article class="hero">' +
        '<a class="thumb" href="' + articleUrl(a) + '">' + illustration(a) +
          '<span class="cat-flag">' + esc(a.category) + '</span></a>' +
        '<h2><a href="' + articleUrl(a) + '">' + esc(a.headline) + '</a></h2>' +
        '<p class="standfirst">' + esc(a.standfirst) + '</p>' +
        '<div class="meta">' + esc(agoStamp(minutesAgo)) + ' &middot; ' + esc(a.byline || "") + '</div>' +
      '</article>';
  }
  function cardHtml(a, minutesAgo) {
    return '' +
      '<article class="card">' +
        '<a class="thumb" href="' + articleUrl(a) + '">' + illustration(a) +
          '<span class="cat-flag">' + esc(a.category) + '</span></a>' +
        '<div class="kicker">' + esc(a.category) + '</div>' +
        '<h3><a href="' + articleUrl(a) + '">' + esc(a.headline) + '</a></h3>' +
        '<p class="standfirst">' + esc(a.standfirst) + '</p>' +
        '<div class="meta">' + esc(agoStamp(minutesAgo)) + '</div>' +
      '</article>';
  }
  function listItemHtml(a, minutesAgo) {
    return '' +
      '<li>' +
        '<a class="thumb" href="' + articleUrl(a) + '">' + illustration(a) + '</a>' +
        '<div><h4><a href="' + articleUrl(a) + '">' + esc(a.headline) + '</a></h4>' +
          '<div class="meta">' + esc(a.category) + ' &middot; ' + esc(agoStamp(minutesAgo)) + '</div>' +
          '<p class="standfirst">' + esc(a.standfirst) + '</p></div>' +
      '</li>';
  }

  // ============================================================
  //  PAGE: HOMEPAGE
  // ============================================================
  function renderHome(mountId) {
    var mount = document.getElementById(mountId);
    if (!mount) return;
    document.title = "The Daily Flange — All the news that's unfit to be true";

    var seq = rotated();
    // If the article data failed to load (coerced to []), degrade to a friendly notice
    // rather than throwing on the unguarded seq[0..8] / pickAds()[0] head reads below and
    // leaving #app blank — every almanac doc shares this origin, so be robust.
    if (!seq.length) {
      mount.innerHTML = headerHtml(null) +
        '<div class="wrap"><div class="layout"><main><div class="band">' +
        '<h3 class="section-title">Nothing to show</h3>' +
        '<p style="padding:0 16px 20px">The newsroom is briefly empty — please refresh in a moment.</p>' +
        '</div></main></div></div>' + footerHtml();
      startClock();
      return;
    }
    var seed = hourSeed();
    // assign each rotated story a plausible freshness (fresher near the top)
    var rnd = mulberry32(seed ^ 0x9e3779b9);
    function mins(idx) { return Math.floor(idx * (6 + rnd() * 22) + rnd() * 9); }

    var out = [];
    out.push(headerHtml(null));
    out.push(tickerHtml());
    out.push('<div class="wrap">');

    // Leaderboard ad
    out.push('<div style="padding-top:22px">' + adHtml(pickAds("leader", 1, "top")[0], "leader") + '</div>');

    out.push('<div class="layout"><main>');

    // Track every story already placed on the page so the category feature bands and the
    // "Around The Flange" list don't reprint one that's already in the top block.
    var used = {};
    function markUsed(a) { if (a) used[a.id] = true; }

    // Hero + lead row (top story)
    out.push(heroHtml(seq[0], mins(0)));
    markUsed(seq[0]);
    out.push('<div class="lead-row">' + cardHtml(seq[1], mins(1)) + cardHtml(seq[2], mins(2)) + '</div>');
    markUsed(seq[1]); markUsed(seq[2]);

    // "More top stories" list
    out.push('<h3 class="section-title">More top stories</h3>');
    out.push('<ul class="storylist">');
    for (var i = 3; i < 9; i++) { out.push(listItemHtml(seq[i], mins(i))); markUsed(seq[i]); }
    out.push('</ul>');

    // A category feature block (rotates which category leads)
    var featCat = CATEGORY_ORDER[seed % CATEGORY_ORDER.length];
    var featItems = seq.filter(function (a) { return a.category === featCat && !used[a.id]; }).slice(0, 4);
    if (featItems.length >= 3) {
      out.push('<div class="band"><h3 class="section-title">' + esc(featCat) +
        '<a class="more" href="' + catUrl(featCat) + '">More ' + esc(featCat) + ' &rsaquo;</a></h3>');
      out.push('<div class="cardgrid">');
      featItems.slice(0, 3).forEach(function (a, k) { out.push(cardHtml(a, mins(10 + k))); markUsed(a); });
      out.push('</div></div>');
    }

    // In-feed leaderboard ad
    out.push('<div class="band">' + adHtml(pickAds("leader", 1, "mid")[0], "leader") + '</div>');

    // Second feature block (a different category)
    var featCat2 = CATEGORY_ORDER[(seed + 4) % CATEGORY_ORDER.length];
    if (featCat2 === featCat) featCat2 = CATEGORY_ORDER[(seed + 5) % CATEGORY_ORDER.length];
    var feat2 = seq.filter(function (a) { return a.category === featCat2 && !used[a.id]; }).slice(0, 3);
    if (feat2.length >= 3) {
      out.push('<div class="band"><h3 class="section-title">' + esc(featCat2) +
        '<a class="more" href="' + catUrl(featCat2) + '">More ' + esc(featCat2) + ' &rsaquo;</a></h3>');
      out.push('<div class="cardgrid">');
      feat2.forEach(function (a, k) { out.push(cardHtml(a, mins(14 + k))); markUsed(a); });
      out.push('</div></div>');
    }

    // "Around The Flange" — a longer list, skipping anything already placed above.
    out.push('<div class="band"><h3 class="section-title">Around The Flange</h3><ul class="storylist">');
    for (var j = 9, arCount = 0; j < seq.length && arCount < 8; j++) {
      if (used[seq[j].id]) continue;
      out.push(listItemHtml(seq[j], mins(j))); markUsed(seq[j]); arCount++;
    }
    out.push('</ul></div>');

    out.push('</main>');

    // Sidebar
    out.push('<aside class="sidebar">');
    // MPU ad
    out.push(adHtml(pickAds("mpu", 1, "side1")[0], "mpu"));
    // Most read (seeded differently so it differs from the main column)
    var mostRead = shuffleSeeded(ARTICLES, seed + 777).slice(0, 8);
    out.push('<div><h3 class="section-title">Most read</h3><ol class="mostread">');
    mostRead.forEach(function (a) {
      out.push('<li><div><h4><a href="' + articleUrl(a) + '">' + esc(a.headline) + '</a></h4>' +
        '<div class="meta">' + esc(a.category) + '</div></div></li>');
    });
    out.push('</ol></div>');
    // Sticky MPU ad
    out.push('<div class="ad-sticky">' + adHtml(pickAds("mpu", 1, "side2")[0], "mpu") + '</div>');
    out.push('</aside>');

    out.push('</div>'); // .layout
    out.push('</div>'); // .wrap
    out.push(footerHtml());

    mount.innerHTML = out.join("");
    startClock();
  }

  // ============================================================
  //  PAGE: ARTICLE
  // ============================================================
  function renderArticle(mountId) {
    var mount = document.getElementById(mountId);
    if (!mount) return;
    var id = qs("id");
    var a = ARTICLES.filter(function (x) { return x.id === id; })[0];

    if (!a) {
      document.title = "Story not found — The Daily Flange";
      mount.innerHTML = headerHtml(null) +
        '<div class="wrap"><div class="article"><div class="body">' +
        '<h1>Story not found</h1><p class="standfirst">This story has either been retracted, ' +
        'flanged out of existence, or was never true to begin with (none of it is).</p>' +
        '<p><a href="index.html">&laquo; Back to the front page</a></p></div></div></div>' +
        footerHtml();
      return;
    }

    document.title = a.headline + " — The Daily Flange";
    var seed = hash(a.id);

    // A paragraph carrying newlines is verse: keep its line breaks, render each
    // body item as one stanza, and skip the lead/drop-cap treatment. (Data uses
    // real "\n" for verse lines — never " / " separators, which render as slashes.)
    var isVerse = (a.body || []).some(function (p) { return p.indexOf("\n") !== -1; });
    var bodyParas = (a.body || []).map(function (p, i) {
      var content = esc(p).replace(/\n/g, "<br>");
      var cls = isVerse ? ' class="verse"' : (i === 0 ? ' class="lead"' : '');
      var html = '<p' + cls + '>' + content + '</p>';
      // For prose, drop the pull-quote in roughly a third of the way; for verse,
      // never mid-poem (it would break the stanzas) — it goes after the piece.
      if (!isVerse && a.pullQuote && i === Math.min(1, (a.body.length - 1))) {
        html += '<blockquote class="pullquote">&ldquo;' + esc(a.pullQuote) + '&rdquo;</blockquote>';
      }
      html += inlineIllustrationHtml(a, i);
      return html;
    }).join("");
    if (isVerse && a.pullQuote) {
      bodyParas += '<blockquote class="pullquote">&ldquo;' + esc(a.pullQuote) + '&rdquo;</blockquote>';
    }

    var tags = (a.tags || []).map(function (t) {
      return '<a href="search.html?q=' + encodeURIComponent(t) + '">#' + esc(t) + '</a>';
    }).join("");

    // related: same category first, then rotated fill
    var related = ARTICLES.filter(function (x) { return x.category === a.category && x.id !== a.id; });
    related = shuffleSeeded(related, seed).slice(0, 4);
    if (related.length < 4) {
      var extra = shuffleSeeded(ARTICLES.filter(function (x) { return x.id !== a.id && related.indexOf(x) === -1; }), seed + 3);
      related = related.concat(extra.slice(0, 4 - related.length));
    }
    var relatedHtml = related.map(function (x) { return cardHtml(x, 0).replace(/<div class="meta">[^<]*<\/div>/, '<div class="meta">' + esc(x.category) + '</div>'); }).join("");
    var heroCaption = a.imageCaption || (
      (a.location ? a.location.charAt(0) + a.location.slice(1).toLowerCase() + ', earlier. ' : '') +
      "Artist's impression; file photo; entirely made up."
    );
    var noticeHtml = a.notice
      ? '<strong>' + esc(a.noticeLabel || "Opinion note") + ':</strong> ' + esc(a.notice)
      : '<strong>Satire notice:</strong> The Daily Flange is fiction. ' +
        'This story never happened, the people quoted do not exist, and the sprockets remain, as ever, unflanged.';

    var out = [];
    out.push(headerHtml(a.category));
    out.push('<div class="wrap">');
    out.push('<div style="padding-top:18px">' + adHtml(pickAds("leader", 1, a.id)[0], "leader") + '</div>');
    out.push('<div class="article cat-' + String(a.category).toLowerCase() + '"><div class="body">');
    out.push(seriesNav(a));
    out.push('<div class="kicker-cat"><a href="' + catUrl(a.category) + '">' + esc(a.category) + '</a></div>');
    out.push('<h1>' + esc(a.headline) + '</h1>');
    out.push('<p class="standfirst">' + esc(a.standfirst) + '</p>');
    out.push('<div class="byline-row"><span class="who">' + esc(a.byline || "By Staff Reporter") + '</span>' +
      '<span>' + esc(a.location || "") + (a.location ? ' &middot; ' : '') + esc(fmtDate(a.published)) + '</span>' +
      '<span class="share"><span title="Share">f</span><span title="Share">X</span><span title="Share">in</span><span title="Email">&#9993;</span></span></div>');
    out.push('<figure><span class="thumb">' + illustration(a) + '<span class="cat-flag">' + esc(a.category) + '</span></span>' +
      '<figcaption>' + esc(heroCaption) + '</figcaption></figure>');
    out.push(bodyParas);
    out.push('<div class="tags">' + tags + '</div>');
    out.push('<div class="disclaimer">' + noticeHtml + '</div>');
    out.push('</div>'); // .body

    // sidebar
    out.push('<aside class="sidebar">');
    out.push(adHtml(pickAds("mpu", 1, a.id + "s1")[0], "mpu"));
    out.push('<div><h3 class="section-title">Most read</h3><ol class="mostread">');
    shuffleSeeded(ARTICLES, hourSeed() + 42).slice(0, 6).forEach(function (x) {
      out.push('<li><div><h4><a href="' + articleUrl(x) + '">' + esc(x.headline) + '</a></h4>' +
        '<div class="meta">' + esc(x.category) + '</div></div></li>');
    });
    out.push('</ol></div>');
    out.push('<div class="ad-sticky">' + adHtml(pickAds("mpu", 1, a.id + "s2")[0], "mpu") + '</div>');
    out.push('</aside>');

    out.push('</div>'); // .article

    // related grid
    out.push('<div class="related"><h3 class="section-title">Related stories</h3><div class="cardgrid">' + relatedHtml + '</div></div>');
    out.push('<div style="margin:26px 0 10px">' + adHtml(pickAds("leader", 1, a.id + "b")[0], "leader") + '</div>');

    out.push('</div>'); // .wrap
    out.push(footerHtml());

    mount.innerHTML = out.join("");
    startClock();
  }

  // ============================================================
  //  PAGE: SEARCH  (also used for category browse via ?cat=)
  // ============================================================
  function renderSearch(mountId) {
    var mount = document.getElementById(mountId);
    if (!mount) return;
    var q = qs("q").trim();
    var cat = qs("cat").trim();

    var results, heading, sub;
    if (cat) {
      var grp = groupByName(cat);
      if (grp) {
        var leaves = grp.selfLeaf ? [grp.name].concat(grp.children) : grp.children;
        results = ARTICLES.filter(function (a) { return leaves.indexOf(a.category) !== -1; });
        heading = grp.name;
        sub = results.length + " " + (results.length === 1 ? "story" : "stories") +
          " across " + leaves.join(", ");
        document.title = grp.name + " — The Daily Flange";
      } else {
        results = ARTICLES.filter(function (a) { return a.category.toLowerCase() === cat.toLowerCase(); });
        heading = cat;
        sub = results.length + " " + (results.length === 1 ? "story" : "stories") + " in " + cat;
        document.title = cat + " — The Daily Flange";
      }
      results = results.slice().sort(function (a, b) { return (b.published || "").localeCompare(a.published || ""); });
    } else {
      var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      results = ARTICLES.map(function (a) {
        var hay = (a.headline + " " + a.standfirst + " " + a.category + " " +
          (a.tags || []).join(" ") + " " + (a.body || []).join(" ") + " " + (a.byline || "")).toLowerCase();
        var score = 0;
        terms.forEach(function (t) {
          if (a.headline.toLowerCase().indexOf(t) !== -1) score += 5;
          if (a.standfirst.toLowerCase().indexOf(t) !== -1) score += 3;
          if ((a.tags || []).join(" ").toLowerCase().indexOf(t) !== -1) score += 3;
          if (hay.indexOf(t) !== -1) score += 1;
        });
        return { a: a, score: score };
      }).filter(function (r) { return terms.length === 0 ? false : r.score > 0; })
        .sort(function (x, y) { return y.score - x.score; })
        .map(function (r) { return r.a; });
      heading = q ? 'Search: “' + q + '”' : "Search The Daily Flange";
      sub = q ? (results.length + " " + (results.length === 1 ? "result" : "results")) : "Type a word or two above — try “sprocket”, “submarine” or “bathroom”.";
      document.title = (q ? 'Search: ' + q : "Search") + " — The Daily Flange";
    }

    function highlight(text) {
      var s = String(text == null ? "" : text);
      var terms = q ? q.split(/\s+/).filter(Boolean) : [];
      if (!terms.length) return esc(s);
      // Match on the RAW text and escape each span separately — escaping first and then
      // replacing over the result corrupted the entities esc() produced (q="amp" hit the
      // &amp; entity) and nested marks (q="a mar" reran over an inserted <mark>).
      var re = new RegExp("(" + terms.map(function (t) {
        return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }).join("|") + ")", "ig");
      var out = "", last = 0, m;
      while ((m = re.exec(s)) !== null) {
        out += esc(s.slice(last, m.index)) + "<mark>" + esc(m[0]) + "</mark>";
        last = m.index + m[0].length;
        if (m.index === re.lastIndex) re.lastIndex++; // guard against a zero-length match loop
      }
      return out + esc(s.slice(last));
    }

    var out = [];
    out.push(headerHtml(cat || null));
    out.push('<div class="wrap">');
    out.push('<div class="searchhead"><h1>' + esc(heading) + '</h1>' +
      '<div class="count">' + esc(sub) + '</div>' +
      '<form action="search.html" method="get" role="search">' +
        // Autofocus only on a real search page — not when browsing a section
        // (?cat=…), where auto-focus would pop the mobile keyboard unbidden.
        '<input type="text" name="q" value="' + esc(q) + '" placeholder="Search the news&hellip;"' +
          (cat ? '' : ' autofocus') + '>' +
        '<button type="submit">Search</button>' +
      '</form></div>');

    if (!results.length) {
      out.push('<div class="noresults">' + (q ? 'No stories match “' + esc(q) + '”. Perhaps it hasn&#39;t been invented yet. Try “flange”.' : '') + '</div>');
    } else {
      out.push('<ul class="results">');
      results.forEach(function (a) {
        out.push('<li><a class="thumb" href="' + articleUrl(a) + '">' + illustration(a) + '</a>' +
          '<div><div class="card kicker" style="color:var(--flange-red);font-weight:700;font-size:11px;text-transform:uppercase">' + esc(a.category) + '</div>' +
          '<h3><a href="' + articleUrl(a) + '">' + highlight(a.headline) + '</a></h3>' +
          '<p class="standfirst">' + highlight(a.standfirst) + '</p>' +
          '<div class="meta">' + esc(a.byline || "") + ' &middot; ' + esc(fmtDate(a.published)) + '</div></div></li>');
      });
      out.push('</ul>');
    }

    // an ad at the foot of results
    out.push('<div style="margin:10px 0 40px">' + adHtml(pickAds("leader", 1, "search")[0], "leader") + '</div>');
    out.push('</div>'); // wrap
    out.push(footerHtml());
    mount.innerHTML = out.join("");
    startClock();
  }

  // ============================================================
  //  PAGE: ABOUT
  // ============================================================
  function renderAbout(mountId) {
    var mount = document.getElementById(mountId);
    if (!mount) return;
    document.title = "About — The Daily Flange";
    var cats = {};
    ARTICLES.forEach(function (a) { cats[a.category] = (cats[a.category] || 0) + 1; });
    var catList = CATEGORY_ORDER.filter(function (c) { return cats[c]; }).map(function (c) {
      return '<li><a href="' + catUrl(c) + '">' + esc(c) + '</a> — ' + cats[c] + ' stories</li>';
    }).join("");

    var out = [];
    out.push(headerHtml(null));
    out.push('<div class="wrap"><div class="article"><div class="body">');
    out.push('<div class="kicker-cat">About</div>');
    out.push('<h1>About The Daily Flange</h1>');
    out.push('<p class="standfirst">Britain&#39;s most trusted source of entirely fabricated news, ' +
      'published continuously since a date we have not verified.</p>');
    out.push('<div class="disclaimer" style="margin:0 0 22px"><strong>This entire website is satire.</strong> ' +
      'Every article, byline, quotation, statistic, expert, institution and advertisement is fictional and ' +
      'invented for comic effect. Nothing here is true, and none of it is advice &mdash; with one confessed ' +
      'exception. A run of stories tagged <em>based-on-truth</em> retells things humans genuinely, ' +
      'bewilderingly did; the underlying events are real, but the breathless prose, the named correspondents ' +
      'and every quoted expert remain entirely invented. Everywhere else, any resemblance to real events, ' +
      'persons, or correctly-flanged sprockets is entirely coincidental.</div>');
    out.push('<p>The Daily Flange currently carries <strong>' + ARTICLES.length + ' stories</strong> across ' +
      Object.keys(cats).length + ' sections. Our front page is reassembled every hour from the live clock, so ' +
      'the news genuinely changes through the day — though, our corpus being finite, you will in time meet a ' +
      'story twice. This is a feature of all newspapers and most lives.</p>');
    out.push('<p>Everything is served as plain static files: no framework, no build step, no server. To add a ' +
      'story, a contributor appends one object to <code>articles.js</code> and it appears on the homepage, in its ' +
      'section, and in search automatically. There is no editorial oversight because there is no editor. There ' +
      'is only the flange.</p>');
    out.push('<h3 class="section-title" style="margin-top:26px">Our sections</h3><ul>' + catList + '</ul>');
    out.push('<h3 class="section-title" style="margin-top:26px">Corrections</h3>' +
      '<p>All of it. The whole thing. Every word. We regret each error equally and none of them at all.</p>');
    out.push('<p style="margin-top:26px"><a href="index.html">&laquo; Return to the front page</a> &middot; ' +
      '<a href="../">Back to the 0x4D44 Almanac</a></p>');
    out.push('</div>');
    out.push('<aside class="sidebar">' + adHtml(pickAds("mpu", 1, "about1")[0], "mpu") +
      '<div class="ad-sticky">' + adHtml(pickAds("mpu", 1, "about2")[0], "mpu") + '</div></aside>');
    out.push('</div></div>');
    out.push(footerHtml());
    mount.innerHTML = out.join("");
  }

  // -------- live clock in the utility bar (keeps it feeling live) --------
  function startClock() { /* reserved: date already rendered; hook kept for future live updates */ }

  // Run the render, then fit the section bar to the viewport.
  function withChrome(fn) {
    return function (mountId) { fn(mountId); enhanceCatnav(); };
  }

  // expose
  window.NEWS = {
    renderHome: withChrome(renderHome),
    renderArticle: withChrome(renderArticle),
    renderSearch: withChrome(renderSearch),
    renderAbout: withChrome(renderAbout),
    articleUrl: articleUrl,
    header: headerHtml,
    footer: footerHtml,
    enhanceCatnav: enhanceCatnav,
    count: function () { return ARTICLES.length; }
  };
})();
