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

  var ARTICLES = (window.NEWS_ARTICLES || []).slice();
  var ADS = window.NEWS_ADS || [];

  // Fixed category order for the nav / sections.
  var CATEGORY_ORDER = [
    "World", "Aviation", "Maritime", "Engineering",
    "Science", "Technology", "Business", "Health", "Sport", "Weather"
  ];

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
    Weather:     { c1: "#3a5a8a", c2: "#243a5c", icon: "cloud" }
  };
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
    cloud: '<path d="M150 168 a34 34 0 0 1 4 -67 a44 44 0 0 1 84 8 a30 30 0 0 1 -4 59 Z"/><g stroke-width="7"><line x1="160" y1="184" x2="150" y2="204"/><line x1="200" y1="184" x2="190" y2="204"/><line x1="240" y1="184" x2="230" y2="204"/></g>'
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

  // -------- SVG "photo" placeholder --------
  function illustration(article) {
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
  function catUrl(c) { return "search.html?cat=" + encodeURIComponent(c); }
  function qs(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }

  // -------- shared chrome --------
  function headerHtml(activeCat) {
    var now = new Date();
    var dayStr = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][now.getDay()] +
      ", " + fmtDate(now.toISOString());
    var nav = CATEGORY_ORDER.map(function (c) {
      return '<a href="' + catUrl(c) + '"' + (c === activeCat ? ' class="active"' : '') + '>' + esc(c) + '</a>';
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
      '<nav class="catnav"><div class="wrap">' +
        '<a href="index.html"' + (activeCat ? '' : ' class="active"') + '>Home</a>' + nav +
      '</div></nav>';
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
    var head = ad.blink ? '<span class="blink">' + esc(ad.headline) + '</span>' : esc(ad.headline);
    var bob = ad.bob ? '<span class="bob">' + esc(ad.emoji || "") + '</span> ' : (ad.emoji ? esc(ad.emoji) + " " : "");
    return '' +
      '<a class="' + cls.join(" ") + '" href="' + esc(href) + '"' + target + ' style="background:' + esc(bg) + ';color:' + esc(fg) + '">' +
        '<span class="ad-label">Ad</span>' + shine +
        '<span class="ad-inner">' +
          '<span style="flex:1">' +
            '<h5>' + bob + head + '</h5>' +
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

    // Hero + lead row (top story)
    out.push(heroHtml(seq[0], mins(0)));
    out.push('<div class="lead-row">' + cardHtml(seq[1], mins(1)) + cardHtml(seq[2], mins(2)) + '</div>');

    // "More top stories" list
    out.push('<h3 class="section-title">More top stories</h3>');
    out.push('<ul class="storylist">');
    for (var i = 3; i < 9; i++) out.push(listItemHtml(seq[i], mins(i)));
    out.push('</ul>');

    // A category feature block (rotates which category leads)
    var featCat = CATEGORY_ORDER[seed % CATEGORY_ORDER.length];
    var featItems = seq.filter(function (a) { return a.category === featCat; }).slice(0, 4);
    if (featItems.length >= 3) {
      out.push('<div class="band"><h3 class="section-title">' + esc(featCat) +
        '<a class="more" href="' + catUrl(featCat) + '">More ' + esc(featCat) + ' &rsaquo;</a></h3>');
      out.push('<div class="cardgrid">');
      featItems.slice(0, 3).forEach(function (a, k) { out.push(cardHtml(a, mins(10 + k))); });
      out.push('</div></div>');
    }

    // In-feed leaderboard ad
    out.push('<div class="band">' + adHtml(pickAds("leader", 1, "mid")[0], "leader") + '</div>');

    // Second feature block (a different category)
    var featCat2 = CATEGORY_ORDER[(seed + 4) % CATEGORY_ORDER.length];
    if (featCat2 === featCat) featCat2 = CATEGORY_ORDER[(seed + 5) % CATEGORY_ORDER.length];
    var feat2 = seq.filter(function (a) { return a.category === featCat2; }).slice(0, 3);
    if (feat2.length >= 3) {
      out.push('<div class="band"><h3 class="section-title">' + esc(featCat2) +
        '<a class="more" href="' + catUrl(featCat2) + '">More ' + esc(featCat2) + ' &rsaquo;</a></h3>');
      out.push('<div class="cardgrid">');
      feat2.forEach(function (a, k) { out.push(cardHtml(a, mins(14 + k))); });
      out.push('</div></div>');
    }

    // "Around The Flange" — a longer list
    out.push('<div class="band"><h3 class="section-title">Around The Flange</h3><ul class="storylist">');
    for (var j = 9; j < 17 && j < seq.length; j++) out.push(listItemHtml(seq[j], mins(j)));
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

    var bodyParas = (a.body || []).map(function (p, i) {
      var html = '<p' + (i === 0 ? ' class="lead"' : '') + '>' + esc(p) + '</p>';
      // drop the pull-quote roughly a third of the way in
      if (a.pullQuote && i === Math.min(1, (a.body.length - 1))) {
        html += '<blockquote class="pullquote">&ldquo;' + esc(a.pullQuote) + '&rdquo;</blockquote>';
      }
      return html;
    }).join("");

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

    var out = [];
    out.push(headerHtml(a.category));
    out.push('<div class="wrap">');
    out.push('<div style="padding-top:18px">' + adHtml(pickAds("leader", 1, a.id)[0], "leader") + '</div>');
    out.push('<div class="article"><div class="body">');
    out.push('<div class="kicker-cat"><a href="' + catUrl(a.category) + '">' + esc(a.category) + '</a></div>');
    out.push('<h1>' + esc(a.headline) + '</h1>');
    out.push('<p class="standfirst">' + esc(a.standfirst) + '</p>');
    out.push('<div class="byline-row"><span class="who">' + esc(a.byline || "By Staff Reporter") + '</span>' +
      '<span>' + esc(a.location || "") + (a.location ? ' &middot; ' : '') + esc(fmtDate(a.published)) + '</span>' +
      '<span class="share"><span title="Share">f</span><span title="Share">X</span><span title="Share">in</span><span title="Email">&#9993;</span></span></div>');
    out.push('<figure><span class="thumb">' + illustration(a) + '<span class="cat-flag">' + esc(a.category) + '</span></span>' +
      '<figcaption>' + esc(a.location ? a.location.charAt(0) + a.location.slice(1).toLowerCase() + ', earlier. ' : '') +
      'Artist&#39;s impression; file photo; entirely made up.</figcaption></figure>');
    out.push(bodyParas);
    out.push('<div class="tags">' + tags + '</div>');
    out.push('<div class="disclaimer"><strong>Satire notice:</strong> The Daily Flange is fiction. ' +
      'This story never happened, the people quoted do not exist, and the sprockets remain, as ever, unflanged.</div>');
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
      results = ARTICLES.filter(function (a) { return a.category.toLowerCase() === cat.toLowerCase(); });
      results = results.slice().sort(function (a, b) { return (b.published || "").localeCompare(a.published || ""); });
      heading = cat;
      sub = results.length + " " + (results.length === 1 ? "story" : "stories") + " in " + cat;
      document.title = cat + " — The Daily Flange";
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
      if (!q) return esc(text);
      var out = esc(text);
      q.split(/\s+/).filter(Boolean).forEach(function (t) {
        var re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
        out = out.replace(re, "<mark>$1</mark>");
      });
      return out;
    }

    var out = [];
    out.push(headerHtml(cat || null));
    out.push('<div class="wrap">');
    out.push('<div class="searchhead"><h1>' + esc(heading) + '</h1>' +
      '<div class="count">' + esc(sub) + '</div>' +
      '<form action="search.html" method="get" role="search">' +
        '<input type="text" name="q" value="' + esc(q) + '" placeholder="Search the news&hellip;" autofocus>' +
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
      'invented for comic effect. Nothing here is true, and none of it is advice. Any resemblance to real ' +
      'events, persons, or correctly-flanged sprockets is entirely coincidental.</div>');
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

  // expose
  window.NEWS = {
    renderHome: renderHome,
    renderArticle: renderArticle,
    renderSearch: renderSearch,
    renderAbout: renderAbout,
    articleUrl: articleUrl,
    count: function () { return ARTICLES.length; }
  };
})();
