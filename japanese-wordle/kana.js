// ============================================================
// Kotoba — kana engine
//   window.KANA          char -> { r(omaji), c(onsonant row), v(owel col), type }
//   window.KEYBOARD      gojuon on-screen keyboard layout (rows of keys)
//   window.romajiToKana  incremental romaji -> kana converter
//   window.splitKana     word string -> array of kana cells
// The consonant (row) and vowel (column) tokens are the two axes of the
// gojuon table (五十音): that pairing is what powers the two-axis hint pips.
// ============================================================
(function () {
  "use strict";

  var V = ["a", "i", "u", "e", "o"];

  // [consonant-row token, romaji per column, kana per column]
  // Voiced rows (g/z/d/b/p) get their own row token so the pips read as
  // romaji families (か vs が = consonant differs), which is how a learner
  // says them; the vowel column stays exact.
  var ROWS = [
    ["",  ["a", "i", "u", "e", "o"],        ["あ", "い", "う", "え", "お"]],
    ["k", ["ka", "ki", "ku", "ke", "ko"],   ["か", "き", "く", "け", "こ"]],
    ["s", ["sa", "shi", "su", "se", "so"],  ["さ", "し", "す", "せ", "そ"]],
    ["t", ["ta", "chi", "tsu", "te", "to"], ["た", "ち", "つ", "て", "と"]],
    ["n", ["na", "ni", "nu", "ne", "no"],   ["な", "に", "ぬ", "ね", "の"]],
    ["h", ["ha", "hi", "fu", "he", "ho"],   ["は", "ひ", "ふ", "へ", "ほ"]],
    ["m", ["ma", "mi", "mu", "me", "mo"],   ["ま", "み", "む", "め", "も"]],
    ["y", ["ya", null, "yu", null, "yo"],   ["や", null, "ゆ", null, "よ"]],
    ["r", ["ra", "ri", "ru", "re", "ro"],   ["ら", "り", "る", "れ", "ろ"]],
    ["w", ["wa", null, null, null, "wo"],   ["わ", null, null, null, "を"]],
    ["g", ["ga", "gi", "gu", "ge", "go"],   ["が", "ぎ", "ぐ", "げ", "ご"]],
    ["z", ["za", "ji", "zu", "ze", "zo"],   ["ざ", "じ", "ず", "ぜ", "ぞ"]],
    ["d", ["da", "ji", "zu", "de", "do"],   ["だ", "ぢ", "づ", "で", "ど"]],
    ["b", ["ba", "bi", "bu", "be", "bo"],   ["ば", "び", "ぶ", "べ", "ぼ"]],
    ["p", ["pa", "pi", "pu", "pe", "po"],   ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"]]
  ];

  var KANA = {};
  ROWS.forEach(function (row) {
    var c = row[0], rom = row[1], chars = row[2];
    chars.forEach(function (ch, i) {
      if (!ch) return;
      KANA[ch] = { r: rom[i], c: c, v: V[i] };
    });
  });
  // Specials — no clean (consonant, vowel) pair, so pips don't apply.
  KANA["ん"] = { r: "n",  c: null, v: null, type: "n" };
  KANA["っ"] = { r: "",   c: null, v: null, type: "sokuon" };
  KANA["ー"] = { r: "-",  c: null, v: null, type: "long" };
  KANA["ゃ"] = { r: "ya", c: null, v: "a",  type: "small" };
  KANA["ゅ"] = { r: "yu", c: null, v: "u",  type: "small" };
  KANA["ょ"] = { r: "yo", c: null, v: "o",  type: "small" };

  // ---- On-screen gojuon keyboard -------------------------------------
  // Seion (base 五十音) laid out column-major so it reads like the wall
  // chart: each visual column is one consonant row, top = -a.
  var SEION_ROWS = ROWS.slice(0, 10);   // '' .. w
  var DAKUTEN_ROWS = ROWS.slice(10);    // g z d b p

  function grid(rows) {
    // returns array of 5 keyboard-rows (by vowel), each a list of kana|null
    return V.map(function (_, vi) {
      return rows.map(function (row) { return row[2][vi]; });
    });
  }

  var KEYBOARD = {
    seion: grid(SEION_ROWS),      // 5 rows (a..o) x 10 cols
    dakuten: grid(DAKUTEN_ROWS),  // 5 rows x 5 cols
    extra: ["ん", "っ"]
  };

  // ---- Romaji -> kana (incremental IME-lite) -------------------------
  // Build a longest-match token table from the gojuon plus the usual
  // alternate spellings and a compact set of yoon (きゃ …).
  var TOKENS = {};
  ROWS.forEach(function (row) {
    row[1].forEach(function (rom, i) {
      if (rom && row[2][i]) TOKENS[rom] = row[2][i];
    });
  });
  // alternate romanisations
  var ALT = {
    si: "し", ti: "ち", tu: "つ", hu: "ふ", fu: "ふ",
    zi: "じ", ji: "じ", zu: "ず",   // common: じ/ず (rare ぢ/づ are di/du)
    di: "ぢ", du: "づ", wo: "を", ja: "じゃ",
    ju: "じゅ", jo: "じょ", she: "しぇ", che: "ちぇ"
  };
  Object.keys(ALT).forEach(function (k) { TOKENS[k] = ALT[k]; });
  // yoon: i-column kana + small ya/yu/yo
  var YOON = {
    ky: "き", gy: "ぎ", sh: "し", jy: "じ", ch: "ち",
    ny: "に", hy: "ひ", by: "び", py: "ぴ", my: "み", ry: "り"
  };
  var SMALL = { a: "ゃ", u: "ゅ", o: "ょ" };
  Object.keys(YOON).forEach(function (pre) {
    Object.keys(SMALL).forEach(function (vw) {
      TOKENS[pre + vw] = YOON[pre] + SMALL[vw];
    });
  });
  // shi+small handled by sh*; ensure sha/shu/sho, cha/chu/cho, ja/ju/jo
  ["sha", "shu", "sho"].forEach(function (t, i) { TOKENS[t] = "し" + SMALL[["a", "u", "o"][i]]; });
  ["cha", "chu", "cho"].forEach(function (t, i) { TOKENS[t] = "ち" + SMALL[["a", "u", "o"][i]]; });

  var TOKEN_KEYS = Object.keys(TOKENS).sort(function (a, b) { return b.length - a.length; });
  var CONSONANTS = "kstnhmyrwgzdbpcfj";

  // Convert as much of a lowercase romaji buffer as possible.
  // Returns { kana: [chars...], rest: leftoverRomaji }.
  function romajiToKana(buf) {
    var out = [];
    var i = 0;
    while (i < buf.length) {
      var ch = buf[i];

      // small tsu: doubled consonant (kk, tt, ss …), not 'nn'
      if (ch !== "n" && CONSONANTS.indexOf(ch) >= 0 && buf[i + 1] === ch) {
        out.push("っ");
        i += 1;
        continue;
      }

      // syllabic n: ん whenever it is not the onset of a な-row / にゃ syllable.
      // (A trailing single 'n' flushes to ん elsewhere; 'nn' → ん + pending n,
      //  which is what lets こんにちわ etc. resolve correctly.)
      if (ch === "n") {
        var nxt = buf[i + 1];
        if (!nxt) break;                                          // 'n' pending at end
        if ("aiueoy".indexOf(nxt) < 0) { out.push("ん"); i += 1; continue; } // n + consonant
        // else nxt is a vowel or y: fall through so な/に/…/にゃ can match
      }

      // longest matching token
      var matched = null, mlen = 0;
      for (var t = 0; t < TOKEN_KEYS.length; t++) {
        var key = TOKEN_KEYS[t];
        if (buf.substr(i, key.length) === key) { matched = TOKENS[key]; mlen = key.length; break; }
      }
      if (matched) {
        for (var m = 0; m < matched.length; m++) out.push(matched[m]);
        i += mlen;
        continue;
      }
      break; // incomplete syllable — leave as pending
    }
    return { kana: out, rest: buf.slice(i) };
  }

  // Split a hiragana word string into an array of single-kana cells.
  function splitKana(word) {
    return Array.prototype.slice.call(word);
  }

  window.KANA = KANA;
  window.KEYBOARD = KEYBOARD;
  window.romajiToKana = romajiToKana;
  window.splitKana = splitKana;
})();
