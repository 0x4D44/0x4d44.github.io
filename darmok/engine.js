/* ============================================================
   DARMOK engine — language utilities, SRS, audio, storage.
   No dependencies. Everything hangs off window.DK.
   ============================================================ */
(function () {
  "use strict";
  const DK = (window.DK = {});

  /* ----------------------------------------------------------
     Curriculum registry. weeksXX-XX.js files call DK.week(...)
     ---------------------------------------------------------- */
  DK.CURRICULUM = [];
  DK.week = function (w) {
    DK.CURRICULUM.push(w);
    DK.CURRICULUM.sort((a, b) => a.n - b.n);
  };

  /* ----------------------------------------------------------
     Romaji -> kana converter (a tiny IME)
     ---------------------------------------------------------- */
  const R2H = {
    kya:"きゃ",kyu:"きゅ",kyo:"きょ",gya:"ぎゃ",gyu:"ぎゅ",gyo:"ぎょ",
    sha:"しゃ",shu:"しゅ",sho:"しょ",sya:"しゃ",syu:"しゅ",syo:"しょ",
    ja:"じゃ",ju:"じゅ",jo:"じょ",jya:"じゃ",jyu:"じゅ",jyo:"じょ",
    zya:"じゃ",zyu:"じゅ",zyo:"じょ",
    cha:"ちゃ",chu:"ちゅ",cho:"ちょ",tya:"ちゃ",tyu:"ちゅ",tyo:"ちょ",
    nya:"にゃ",nyu:"にゅ",nyo:"にょ",
    hya:"ひゃ",hyu:"ひゅ",hyo:"ひょ",bya:"びゃ",byu:"びゅ",byo:"びょ",
    pya:"ぴゃ",pyu:"ぴゅ",pyo:"ぴょ",
    mya:"みゃ",myu:"みゅ",myo:"みょ",rya:"りゃ",ryu:"りゅ",ryo:"りょ",
    dya:"ぢゃ",dyu:"ぢゅ",dyo:"ぢょ",
    fa:"ふぁ",fi:"ふぃ",fe:"ふぇ",fo:"ふぉ",
    va:"ゔぁ",vi:"ゔぃ",vu:"ゔ",ve:"ゔぇ",vo:"ゔぉ",
    wi:"うぃ",we:"うぇ",
    tsa:"つぁ",tse:"つぇ",tso:"つぉ",
    she:"しぇ",che:"ちぇ",je:"じぇ",
    ti:"てぃ",di:"でぃ",du:"どぅ",tu:"つ",
    ka:"か",ki:"き",ku:"く",ke:"け",ko:"こ",
    ga:"が",gi:"ぎ",gu:"ぐ",ge:"げ",go:"ご",
    sa:"さ",si:"し",shi:"し",su:"す",se:"せ",so:"そ",
    za:"ざ",zi:"じ",ji:"じ",zu:"ず",ze:"ぜ",zo:"ぞ",
    ta:"た",chi:"ち",tsu:"つ",te:"て",to:"と",
    da:"だ",dzu:"づ",de:"で",do:"ど",
    na:"な",ni:"に",nu:"ぬ",ne:"ね",no:"の",
    ha:"は",hi:"ひ",fu:"ふ",hu:"ふ",he:"へ",ho:"ほ",
    ba:"ば",bi:"び",bu:"ぶ",be:"べ",bo:"ぼ",
    pa:"ぱ",pi:"ぴ",pu:"ぷ",pe:"ぺ",po:"ぽ",
    ma:"ま",mi:"み",mu:"む",me:"め",mo:"も",
    ya:"や",yu:"ゆ",yo:"よ",
    ra:"ら",ri:"り",ru:"る",re:"れ",ro:"ろ",
    wa:"わ",wo:"を",
    a:"あ",i:"い",u:"う",e:"え",o:"お",
  };
  const CONSONANTS = "kgsztdnhbpmyrwcfvj";

  // Convert one romaji string to hiragana. Leaves anything it can't
  // convert (trailing lone consonants while typing) as-is.
  DK.romajiToHiragana = function (src, final) {
    let s = src.toLowerCase();
    let out = "";
    let i = 0;
    while (i < s.length) {
      const rest = s.slice(i);
      // long-vowel dash
      if (rest[0] === "-" || rest[0] === "ー") { out += "ー"; i++; continue; }
      // n handling: n' -> ん ; nn -> ん ; n + (consonant except y) -> ん
      if (rest[0] === "n") {
        if (rest[1] === "'") { out += "ん"; i += 2; continue; }
        if (rest[1] === "n" && !"aiueoy".includes(rest[2] || "")) { out += "ん"; i += 2; continue; }
        if (rest.length === 1) { out += final ? "ん" : "n"; i++; continue; } // trailing n: keep while typing, close when final
        if (!"aiueoy'".includes(rest[1])) { out += "ん"; i++; continue; }
      }
      // sokuon: doubled consonant (kk, tt, pp, ss, tch...)
      if (rest.length >= 2 && rest[0] === rest[1] && CONSONANTS.includes(rest[0]) && rest[0] !== "n") {
        out += "っ"; i++; continue;
      }
      if (rest.slice(0, 3) === "tch") { out += "っ"; i++; continue; }
      // longest-match lookup (4..1)
      let matched = false;
      for (let len = 4; len >= 1; len--) {
        const chunk = rest.slice(0, len);
        if (R2H[chunk]) { out += R2H[chunk]; i += len; matched = true; break; }
      }
      if (!matched) { out += rest[0]; i++; }
    }
    return out;
  };

  // Live-IME version: keeps a trailing partial consonant visible as romaji
  DK.imeConvert = function (src) {
    return DK.romajiToHiragana(src);
  };

  DK.kataToHira = function (s) {
    return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  };
  DK.hiraToKata = function (s) {
    return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  };

  // Vowel each hiragana mora carries, so a long-vowel mark (ー) can be folded to
  // the same canonical form the rōmaji IME produces (doubled vowel kana). Small
  // kana ゃゅょ take the vowel of their glide.
  const KANA_VOWEL = {};
  (function () {
    const rows = {
      a: "あかさたなはまやらわがざだばぱゃ",
      i: "いきしちにひみりぎじぢびぴ",
      u: "うくすつぬふむゆるぐずづぶぷゅゔっ",
      e: "えけせてねへめれげぜでべぺ",
      o: "おこそとのほもよろをごぞどぼぽょ",
    };
    for (const [vw, chars] of Object.entries(rows))
      for (const ch of chars) KANA_VOWEL[ch] = vw;
  })();
  const VOWEL_KANA = { a: "あ", i: "い", u: "う", e: "え", o: "お" };

  // Canonicalise long vowels: expand every ー (and stray "-") to the vowel kana of
  // the preceding mora, so こーひー and rōmaji "koohii" (→こおひい) meet. Folding
  // (not deleting) also keeps distinct taught words apart — かれー→かれえ ≠ かれ.
  function foldLongVowels(str) {
    let out = "";
    for (const ch of str) {
      if (ch === "ー" || ch === "-") {
        const vw = KANA_VOWEL[out[out.length - 1]];
        out += vw ? VOWEL_KANA[vw] : ""; // drop a dangling mark with no vowel to lengthen
      } else out += ch;
    }
    return out;
  }

  // Normalize an answer for comparison: NFKC, lowercase, strip spaces
  // and punctuation, katakana->hiragana, romaji->hiragana.
  DK.normalizeAnswer = function (s) {
    let t = (s || "").normalize("NFKC").toLowerCase().trim();
    // Keep the apostrophe (syllabic-n disambiguator: ten'in) and the long-vowel
    // ー through rōmaji conversion; both are handled canonically below. Deleting
    // them here is what made the grader reject the romaji it prints on the card.
    t = t.replace(/[\s、。．，,.!?！？「」『』・〜~"“”]/g, "");
    t = DK.kataToHira(t);
    if (/[a-z'’ー-]/.test(t)) t = DK.romajiToHiragana(t, true);
    t = t.replace(/['’]/g, ""); // drop any apostrophe the IME didn't consume
    t = t.replace(/づ/g, "ず").replace(/ぢ/g, "じ"); // yotsugana fold (Hepburn zu/ji)
    t = foldLongVowels(t); // canonical long vowels (not deleted)
    return t;
  };

  // Lenient fold for particle spellings: romaji typists write "wa/e/o" for
  // the particles は・へ・を, which convert to わ・え・お. Fold both sides.
  function particleFold(s) {
    return s.replace(/は/g, "わ").replace(/へ/g, "え").replace(/を/g, "お");
  }

  DK.answersMatch = function (userInput, acceptedList) {
    const u = DK.normalizeAnswer(userInput);
    if (!u) return false;
    if (acceptedList.some((a) => DK.normalizeAnswer(a) === u)) return true;
    const uf = particleFold(u);
    return acceptedList.some((a) => particleFold(DK.normalizeAnswer(a)) === uf);
  };

  /* ----------------------------------------------------------
     Furigana: "漢字[かんじ]" -> <ruby>漢字<rt>かんじ</rt></ruby>
     ---------------------------------------------------------- */
  const KANJI_RUN = /([々一-鿿㐀-䶿々〆ヶ〇]+)\[([^\]]+)\]/g;

  DK.esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  DK.ruby = function (s) {
    return DK.esc(s).replace(KANJI_RUN, "<ruby>$1<rt>$2</rt></ruby>");
  };

  // Like DK.ruby, but every kanji that has a breakdown in DK.KANJI becomes a
  // tappable span (opens its breakdown). Kanji here always sit inside a furigana
  // run, so we only need to tapify the base of each run.
  const ONE_KANJI = /[㐀-䶿一-鿿々〆〇ヶ]/g;
  function tapifyKanji(base) {
    return base.replace(ONE_KANJI, function (ch) {
      return (window.DK && DK.KANJI && DK.KANJI[ch])
        ? '<span class="kj" data-kanji="' + ch + '">' + ch + "</span>"
        : ch;
    });
  }
  DK.rubyK = function (s) {
    return DK.esc(s).replace(KANJI_RUN, function (_m, base, read) {
      return "<ruby>" + tapifyKanji(base) + "<rt>" + read + "</rt></ruby>";
    });
  };

  // Strip [readings] for TTS / plain display
  DK.plain = function (s) {
    return String(s).replace(KANJI_RUN, "$1");
  };
  // Reading-only form (kanji replaced by furigana) for answer checking
  DK.readingForm = function (s) {
    return String(s).replace(KANJI_RUN, "$2");
  };

  // Inline briefing markup: **bold**, {{Japanese}} tinted spans + ruby.
  DK.md = function (s) {
    let t = DK.esc(s);
    t = t.replace(KANJI_RUN, "<ruby>$1<rt>$2</rt></ruby>");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    t = t.replace(/\*([^*]+)\*/g, "<i>$1</i>");
    t = t.replace(/\{\{([^}]+)\}\}/g, '<span class="j">$1</span>');
    return t;
  };

  /* ----------------------------------------------------------
     Storage
     ---------------------------------------------------------- */
  const KEY = "darmok.progress.v1";
  DK.defaultProgress = function () {
    return {
      name: "",
      xp: 0,
      done: {},        // lessonId -> {best, times, last}
      srs: {},         // vocabKey -> {s, due, seen, lapses}
      medals: [],
      reviews: 0,      // total SRS answers
      settings: { sound: true, speech: true, rate: 0.9, romaji: true, furigana: true, booted: false, onboarded: false },
    };
  };
  DK.load = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DK.defaultProgress();
      const p = JSON.parse(raw);
      return Object.assign(DK.defaultProgress(), p, {
        settings: Object.assign(DK.defaultProgress().settings, p.settings || {}),
      });
    } catch (e) {
      return DK.defaultProgress();
    }
  };
  DK.save = function (p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
  };
  DK.reset = function () { try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ } };

  /* ----------------------------------------------------------
     Ranks & XP
     ---------------------------------------------------------- */
  DK.RANKS = [
    { xp: 0,    name: "Cadet",                pips: 0, half: false },
    { xp: 80,   name: "Ensign",               pips: 1, half: false },
    { xp: 260,  name: "Lieutenant J.G.",      pips: 1, half: true  },
    { xp: 560,  name: "Lieutenant",           pips: 2, half: false },
    { xp: 950,  name: "Lt. Commander",        pips: 2, half: true  },
    { xp: 1450, name: "Commander",            pips: 3, half: false },
    { xp: 2100, name: "Captain",              pips: 4, half: false },
  ];
  DK.rankFor = function (xp) {
    let r = DK.RANKS[0];
    for (const k of DK.RANKS) if (xp >= k.xp) r = k;
    return r;
  };
  DK.nextRank = function (xp) {
    for (const k of DK.RANKS) if (xp < k.xp) return k;
    return null;
  };

  /* ----------------------------------------------------------
     SRS — simple stage ladder (minutes)
     ---------------------------------------------------------- */
  const STAGES = [0, 4 * 60, 24 * 60, 3 * 1440, 7 * 1440, 14 * 1440, 30 * 1440, 90 * 1440];
  DK.srsAnswer = function (item, correct) {
    const now = Date.now();
    item.seen = (item.seen || 0) + 1;
    if (correct) {
      item.s = Math.min((item.s || 0) + 1, STAGES.length - 1);
    } else {
      item.lapses = (item.lapses || 0) + 1;
      item.s = Math.max((item.s || 0) - 2, 0);
    }
    const jitter = 0.9 + Math.random() * 0.2;
    item.due = now + STAGES[item.s] * 60000 * jitter;
    return item;
  };
  DK.srsAdd = function (progress, key) {
    if (!progress.srs[key]) {
      progress.srs[key] = { s: 0, due: Date.now(), seen: 0, lapses: 0 };
    }
  };
  DK.srsDue = function (progress) {
    const now = Date.now();
    // Only surface keys that still resolve to a vocab entry. vocabKey embeds the
    // (mutable) English gloss, so editing a gloss orphans that word's stored SRS key;
    // an orphaned key can never be drilled (buildDrill/vocabByKey drop it), so counting
    // it inflates the "Drills Due" badge and can leave BEGIN DRILL inert. Filtering here
    // fixes the badge, the tile, and drill sampling at once.
    return Object.keys(progress.srs).filter((k) => progress.srs[k].due <= now && DK.vocabByKey(k));
  };

  /* ----------------------------------------------------------
     Vocab pool + auto-generated exercises
     ---------------------------------------------------------- */
  // vocab entry: [jp(with furigana), kana, romaji, en, type]
  DK.vocabKey = function (v) { return DK.plain(v[0]) + "|" + v[3]; };

  DK.allVocab = function () {
    if (DK._pool) return DK._pool;
    const pool = [];
    for (const w of DK.CURRICULUM) {
      for (const l of w.lessons) {
        for (const v of l.vocab || []) pool.push({ v, week: w.n, lesson: l.id });
      }
    }
    DK._pool = pool;
    return pool;
  };
  DK.vocabByKey = function (key) {
    if (!DK._byKey) {
      DK._byKey = {};
      for (const e of DK.allVocab()) DK._byKey[DK.vocabKey(e.v)] = e;
    }
    return DK._byKey[key];
  };

  DK.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  DK.sample = function (arr, n) { return DK.shuffle(arr).slice(0, n); };

  // Pick n distractor *entries* (whole vocab tuples), unique by the given field,
  // same word-type where possible. Returning the entries — not just the field
  // string — lets the exercise explain what a wrong option actually was.
  function distractorEntries(v, field, n) {
    const pool = DK.allVocab().map((e) => e.v).filter((x) => x !== v && x[field] !== v[field]);
    const sameType = pool.filter((x) => x[4] === v[4]);
    const chosen = [];
    const seen = new Set([v[field]]);
    for (const x of DK.shuffle(sameType.length >= n ? sameType : pool)) {
      if (!seen.has(x[field])) { chosen.push(x); seen.add(x[field]); }
      if (chosen.length === n) break;
    }
    return chosen;
  }
  function distractors(v, field, n) { return distractorEntries(v, field, n).map((x) => x[field]); }

  // A vocab entry rendered as furigana markup ("猫[ねこ]"); DK.md/DK.ruby turn it
  // into ruby. Used to name a wrong option by its Japanese form + reading.
  function jpForm(x) { return x[0]; }

  // Reverse index: normalized reading/word -> the vocab entry it belongs to.
  // Lets a typed answer that is *a different real word* be named back to the
  // learner ("you wrote 猫 — that means cat"), not just marked wrong.
  DK.vocabByReading = function () {
    if (DK._byReading) return DK._byReading;
    const m = {};
    for (const e of DK.allVocab()) {
      const v = e.v;
      for (const form of [DK.plain(v[0]), v[1]]) {
        const k = DK.normalizeAnswer(form || "");
        if (k && !m[k]) m[k] = v;
      }
    }
    DK._byReading = m;
    return m;
  };
  DK.identifyAnswer = function (text) {
    const k = DK.normalizeAnswer(text || "");
    return k ? DK.vocabByReading()[k] || null : null;
  };

  // Build one auto exercise for a vocab entry. kind: meaning|reverse|listen|typeback
  DK.genExercise = function (v, kind) {
    const key = DK.vocabKey(v);
    if (kind === "meaning") {
      const wrongE = distractorEntries(v, 3, 3);
      const choices = DK.shuffle([v[3]].concat(wrongE.map((x) => x[3])));
      // Each wrong option is a real word's meaning — name that word back.
      const wrongGloss = {};
      wrongE.forEach((x) => { wrongGloss[x[3]] = "“" + x[3] + "” is " + jpForm(x) + " — a different word."; });
      return {
        t: "mc", gen: key,
        kind: "DATABASE QUERY",
        q: "What does this mean?",
        jp: v[0],
        choices, a: choices.indexOf(v[3]), wrongGloss,
        why: DK.plain(v[0]) + (v[1] && v[1] !== DK.plain(v[0]) ? " (" + v[1] + ")" : "") + " — " + v[3] + ".",
        speak: v[1] || DK.plain(v[0]),
      };
    }
    if (kind === "reverse") {
      const wrongE = distractorEntries(v, 0, 3);
      const choices = DK.shuffle([DK.plain(v[0])].concat(wrongE.map((x) => DK.plain(x[0]))));
      // Each wrong option is a Japanese word — say what it actually means.
      const wrongGloss = {};
      wrongE.forEach((x) => { wrongGloss[DK.plain(x[0])] = jpForm(x) + " means “" + x[3] + "”, not “" + v[3] + "”."; });
      return {
        t: "mc", gen: key,
        kind: "TRANSLATION MATRIX",
        q: "Which is “" + v[3] + "”?",
        choices, a: choices.indexOf(DK.plain(v[0])), wrongGloss,
        choicesJp: true,
        why: DK.plain(v[0]) + (v[1] && v[1] !== DK.plain(v[0]) ? " (" + v[1] + ")" : "") + " = " + v[3] + ".",
      };
    }
    if (kind === "listen") {
      const wrongE = distractorEntries(v, 3, 3);
      const choices = DK.shuffle([v[3]].concat(wrongE.map((x) => x[3])));
      const wrongGloss = {};
      wrongE.forEach((x) => { wrongGloss[x[3]] = "“" + x[3] + "” is " + jpForm(x) + " — a different word."; });
      return {
        t: "listen", gen: key,
        kind: "AUDIO INTERCEPT",
        q: "Listen. What was said?",
        speak: v[1] || DK.plain(v[0]),
        reveal: v[0],
        choices, a: choices.indexOf(v[3]), wrongGloss,
        why: DK.plain(v[0]) + " (" + (v[1] || "") + ") — " + v[3] + ".",
      };
    }
    // typeback: EN -> type the Japanese (kana accepted)
    return {
      t: "type", gen: key,
      kind: "TRANSLATION MATRIX",
      q: "Type the Japanese for: “" + v[3] + "”",
      accept: [DK.plain(v[0]), v[1]].filter(Boolean),
      show: v[0],
      why: DK.plain(v[0]) + (v[1] && v[1] !== DK.plain(v[0]) ? "（" + v[1] + "）" : "") + " — " + v[3] + ".",
    };
  };

  // Exercises for a lesson session: authored first, then vocab drills.
  DK.buildSession = function (week, lesson) {
    // Per-session COPIES of the authored exercises: app.js writes transient play-state
    // (_bank/_placed/_hidden/_hints/_assisted/_matchMistakes/_typed) directly onto the
    // exercise object, and .slice() would copy only the array, leaving the elements the
    // live DK.CURRICULUM objects — so that state would leak into the next replay.
    const authored = (lesson.exercises || []).map((e) => Object.assign({}, e));
    const vocab = lesson.vocab || [];
    const auto = [];
    if (lesson.review) {
      // review day: drill the whole week's vocab
      const weekVocab = [];
      for (const l of week.lessons) if (!l.review) for (const v of l.vocab || []) weekVocab.push(v);
      const picks = DK.sample(weekVocab, Math.min(10, weekVocab.length));
      const kinds = ["meaning", "reverse", "listen", "typeback"];
      picks.forEach((v, i) => auto.push(DK.genExercise(v, kinds[i % kinds.length])));
    } else {
      const picks = DK.sample(vocab, Math.min(5, vocab.length));
      // First exposure is recognition-only. A word just met once in the vocab list
      // should be *recognised* (meaning / reverse / listen), not *produced* from
      // memory — typeback (recall/production) is deferred to Review shifts and the
      // SRS drill, where the word has already been seen with spacing.
      const kinds = DK.shuffle(["meaning", "reverse", "listen", "meaning", "reverse"]);
      picks.forEach((v, i) => auto.push(DK.genExercise(v, kinds[i % kinds.length])));
    }
    return authored.concat(DK.shuffle(auto));
  };

  // A drill session from due SRS keys
  DK.buildDrill = function (progress, max) {
    const due = DK.shuffle(DK.srsDue(progress)).slice(0, max || 15);
    const kinds = ["meaning", "reverse", "listen", "typeback"];
    const out = [];
    due.forEach((key, i) => {
      const e = DK.vocabByKey(key);
      if (e) out.push(DK.genExercise(e.v, kinds[i % kinds.length]));
    });
    return out;
  };

  /* ----------------------------------------------------------
     Speech (Web Speech API)
     ---------------------------------------------------------- */
  let jaVoice = null, voicesReady = false;
  function pickVoice() {
    const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    const ja = vs.filter((v) => v.lang && v.lang.toLowerCase().startsWith("ja"));
    jaVoice =
      ja.find((v) => /google/i.test(v.name)) ||
      ja.find((v) => /kyoko|o-?ren|hattori/i.test(v.name)) ||
      ja[0] || null;
    voicesReady = true;
  }
  if (window.speechSynthesis) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }
  DK.canSpeak = function () {
    if (!window.speechSynthesis) return false;
    if (!voicesReady) pickVoice();
    return !!jaVoice;
  };
  DK.speak = function (text, opts) {
    if (!window.speechSynthesis) return false;
    if (!voicesReady) pickVoice();
    const t = DK.plain(text).replace(/[（(].*?[)）]/g, "");
    try { speechSynthesis.cancel(); } catch (e) {}
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "ja-JP";
    if (jaVoice) u.voice = jaVoice;
    u.rate = (opts && opts.rate) || 0.9;
    if (opts && opts.onend) u.onend = opts.onend;
    speechSynthesis.speak(u);
    return true;
  };

  /* ----------------------------------------------------------
     LCARS chirps (WebAudio)
     ---------------------------------------------------------- */
  let actx = null;
  function ctx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq0, freq1, dur, type, gainV, when) {
    const c = ctx();
    if (!c) return;
    const t0 = c.currentTime + (when || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq0, t0);
    if (freq1) o.frequency.exponentialRampToValueAtTime(freq1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainV || 0.12, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  DK.beep = function (name, enabled) {
    if (!enabled) return;
    try {
      if (name === "tap")      { tone(880, 1320, 0.07, "sine", 0.07); }
      else if (name === "nav") { tone(660, 990, 0.06, "sine", 0.06); tone(990, 1480, 0.06, "sine", 0.06, 0.06); }
      else if (name === "ok")  { tone(740, 1180, 0.09, "sine", 0.09); tone(1180, 1760, 0.12, "sine", 0.09, 0.09); }
      else if (name === "no")  { tone(220, 150, 0.22, "square", 0.045); }
      else if (name === "done"){ tone(587, 880, 0.1, "sine", 0.09); tone(880, 1175, 0.1, "sine", 0.09, 0.1); tone(1175, 1760, 0.2, "sine", 0.09, 0.2); }
      else if (name === "medal"){ tone(523, 523, 0.09, "triangle", 0.1); tone(659, 659, 0.09, "triangle", 0.1, 0.09); tone(784, 784, 0.09, "triangle", 0.1, 0.18); tone(1047, 1047, 0.22, "triangle", 0.1, 0.27); }
    } catch (e) {}
  };

  /* ----------------------------------------------------------
     Stardate — present day mapped 376 years forward (Picard era)
     ---------------------------------------------------------- */
  DK.stardate = function (d) {
    d = d || new Date();
    const fy = d.getFullYear() + 376;
    const start = new Date(d.getFullYear(), 0, 1).getTime();
    const end = new Date(d.getFullYear() + 1, 0, 1).getTime();
    const frac = (d.getTime() - start) / (end - start);
    const sd = (fy - 2323) * 1000 + frac * 1000;
    return sd.toFixed(1);
  };

  /* ----------------------------------------------------------
     Kana reference tables
     ---------------------------------------------------------- */
  DK.KANA_ROWS = [
    ["あ","い","う","え","お"],["か","き","く","け","こ"],["さ","し","す","せ","そ"],
    ["た","ち","つ","て","と"],["な","に","ぬ","ね","の"],["は","ひ","ふ","へ","ほ"],
    ["ま","み","む","め","も"],["や","","ゆ","","よ"],["ら","り","る","れ","ろ"],
    ["わ","","","","を"],["ん","","","",""],
    ["が","ぎ","ぐ","げ","ご"],["ざ","じ","ず","ぜ","ぞ"],["だ","ぢ","づ","で","ど"],
    ["ば","び","ぶ","べ","ぼ"],["ぱ","ぴ","ぷ","ぺ","ぽ"],
  ];
  DK.KANA_ROMAJI = [
    ["a","i","u","e","o"],["ka","ki","ku","ke","ko"],["sa","shi","su","se","so"],
    ["ta","chi","tsu","te","to"],["na","ni","nu","ne","no"],["ha","hi","fu","he","ho"],
    ["ma","mi","mu","me","mo"],["ya","","yu","","yo"],["ra","ri","ru","re","ro"],
    ["wa","","","","(w)o"],["n","","","",""],
    ["ga","gi","gu","ge","go"],["za","ji","zu","ze","zo"],["da","ji","zu","de","do"],
    ["ba","bi","bu","be","bo"],["pa","pi","pu","pe","po"],
  ];
})();
