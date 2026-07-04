// ============================================================
// Kotoba — answer pool
//   window.WORDS : array of word objects
//     k     hiragana (the puzzle answer; 3–6 kana cells)   REQUIRED
//     r     romaji                                          REQUIRED
//     m     English gloss                                   REQUIRED
//     kanji standard kanji form (omit if usually kana)      optional
//     lvl   "N5" | "N4"  (JLPT level)                       REQUIRED
//     cat   theme category (greeting, food, people, …)      REQUIRED
//     pos   noun | verb | i-adj | na-adj | adverb | expr    REQUIRED
//     ex    a short example sentence in kana                optional
//     exEn  its English translation                         optional
// The board length adapts to the answer's kana-cell count. Edit freely;
// keep every `k` valid hiragana. Verbs are given in polite -ます form.
// ============================================================
window.WORDS = [
  // ───────────────────────── N5 · greetings & expressions ─────────────────────────
  { k: "ありがとう", r: "arigatou", m: "thank you", lvl: "N5", cat: "greeting", pos: "expr" },
  { k: "さようなら", r: "sayounara", m: "goodbye", lvl: "N5", cat: "greeting", pos: "expr" },
  { k: "こんにちは", r: "konnichiwa", m: "hello / good afternoon", lvl: "N5", cat: "greeting", pos: "expr" },
  { k: "こんばんは", r: "konbanwa", m: "good evening", lvl: "N5", cat: "greeting", pos: "expr" },
  { k: "おはよう", r: "ohayou", m: "good morning", lvl: "N5", cat: "greeting", pos: "expr" },
  { k: "すみません", r: "sumimasen", m: "excuse me / sorry", lvl: "N5", cat: "greeting", pos: "expr" },
  { k: "ください", r: "kudasai", m: "please give me", lvl: "N5", cat: "expr", pos: "expr" },

  // ───────────────────────── N5 · food & drink ─────────────────────────
  { k: "たべもの", r: "tabemono", m: "food", kanji: "食べ物", lvl: "N5", cat: "food", pos: "noun", ex: "にほんの たべものが すきです。", exEn: "I like Japanese food." },
  { k: "のみもの", r: "nomimono", m: "drink", kanji: "飲み物", lvl: "N5", cat: "food", pos: "noun", ex: "つめたい のみものを ください。", exEn: "A cold drink, please." },
  { k: "くだもの", r: "kudamono", m: "fruit", kanji: "果物", lvl: "N5", cat: "food", pos: "noun", ex: "くだものは あまいです。", exEn: "Fruit is sweet." },
  { k: "やさい", r: "yasai", m: "vegetable", kanji: "野菜", lvl: "N5", cat: "food", pos: "noun", ex: "やさいを たべます。", exEn: "I eat vegetables." },
  { k: "さかな", r: "sakana", m: "fish", kanji: "魚", lvl: "N5", cat: "food", pos: "noun", ex: "さかなを たべますか。", exEn: "Do you eat fish?" },
  { k: "たまご", r: "tamago", m: "egg", kanji: "卵", lvl: "N5", cat: "food", pos: "noun" },
  { k: "みかん", r: "mikan", m: "mandarin orange", lvl: "N5", cat: "food", pos: "noun" },
  { k: "たまねぎ", r: "tamanegi", m: "onion", kanji: "玉ねぎ", lvl: "N5", cat: "food", pos: "noun" },

  // ───────────────────────── N5 · people & body ─────────────────────────
  { k: "かぞく", r: "kazoku", m: "family", kanji: "家族", lvl: "N5", cat: "people", pos: "noun", ex: "かぞくは よにんです。", exEn: "My family is four people." },
  { k: "こども", r: "kodomo", m: "child", kanji: "子供", lvl: "N5", cat: "people", pos: "noun" },
  { k: "ともだち", r: "tomodachi", m: "friend", kanji: "友達", lvl: "N5", cat: "people", pos: "noun", ex: "ともだちに あいます。", exEn: "I'll meet a friend." },
  { k: "せんせい", r: "sensei", m: "teacher", kanji: "先生", lvl: "N5", cat: "people", pos: "noun", ex: "せんせいは やさしいです。", exEn: "The teacher is kind." },
  { k: "あたま", r: "atama", m: "head", kanji: "頭", lvl: "N5", cat: "body", pos: "noun" },

  // ───────────────────────── N5 · things & home ─────────────────────────
  { k: "おかね", r: "okane", m: "money", kanji: "お金", lvl: "N5", cat: "shopping", pos: "noun", ex: "おかねが ありません。", exEn: "I have no money." },
  { k: "さいふ", r: "saifu", m: "wallet", kanji: "財布", lvl: "N5", cat: "shopping", pos: "noun" },
  { k: "てがみ", r: "tegami", m: "letter", kanji: "手紙", lvl: "N5", cat: "home", pos: "noun", ex: "ともだちに てがみを かきます。", exEn: "I write a letter to a friend." },
  { k: "なまえ", r: "namae", m: "name", kanji: "名前", lvl: "N5", cat: "home", pos: "noun", ex: "おなまえは なんですか。", exEn: "What is your name?" },
  { k: "とけい", r: "tokei", m: "clock, watch", kanji: "時計", lvl: "N5", cat: "home", pos: "noun" },
  { k: "つくえ", r: "tsukue", m: "desk", kanji: "机", lvl: "N5", cat: "home", pos: "noun" },
  { k: "めがね", r: "megane", m: "glasses", kanji: "眼鏡", lvl: "N5", cat: "home", pos: "noun" },
  { k: "かばん", r: "kaban", m: "bag", lvl: "N5", cat: "home", pos: "noun" },
  { k: "ぼうし", r: "boushi", m: "hat", kanji: "帽子", lvl: "N5", cat: "home", pos: "noun" },
  { k: "くつした", r: "kutsushita", m: "socks", kanji: "靴下", lvl: "N5", cat: "home", pos: "noun" },
  { k: "しんぶん", r: "shinbun", m: "newspaper", kanji: "新聞", lvl: "N5", cat: "home", pos: "noun" },
  { k: "ざっし", r: "zasshi", m: "magazine", kanji: "雑誌", lvl: "N5", cat: "home", pos: "noun" },
  { k: "でんわ", r: "denwa", m: "telephone", kanji: "電話", lvl: "N5", cat: "home", pos: "noun", ex: "でんわを かけます。", exEn: "I make a phone call." },
  { k: "れいぞうこ", r: "reizouko", m: "refrigerator", kanji: "冷蔵庫", lvl: "N5", cat: "home", pos: "noun" },
  { k: "ことば", r: "kotoba", m: "word, language", kanji: "言葉", lvl: "N5", cat: "home", pos: "noun" },

  // ───────────────────────── N5 · places & transport ─────────────────────────
  { k: "がっこう", r: "gakkou", m: "school", kanji: "学校", lvl: "N5", cat: "place", pos: "noun", ex: "まいにち がっこうへ いきます。", exEn: "I go to school every day." },
  { k: "だいがく", r: "daigaku", m: "university", kanji: "大学", lvl: "N5", cat: "place", pos: "noun", ex: "だいがくで べんきょうします。", exEn: "I study at university." },
  { k: "かいしゃ", r: "kaisha", m: "company", kanji: "会社", lvl: "N5", cat: "place", pos: "noun" },
  { k: "ぎんこう", r: "ginkou", m: "bank", kanji: "銀行", lvl: "N5", cat: "place", pos: "noun" },
  { k: "くうこう", r: "kuukou", m: "airport", kanji: "空港", lvl: "N5", cat: "place", pos: "noun" },
  { k: "えいがかん", r: "eigakan", m: "cinema", kanji: "映画館", lvl: "N5", cat: "place", pos: "noun" },
  { k: "たてもの", r: "tatemono", m: "building", kanji: "建物", lvl: "N5", cat: "place", pos: "noun" },
  { k: "でんしゃ", r: "densha", m: "train", kanji: "電車", lvl: "N5", cat: "transport", pos: "noun", ex: "でんしゃで いきます。", exEn: "I go by train." },
  { k: "くるま", r: "kuruma", m: "car", kanji: "車", lvl: "N5", cat: "transport", pos: "noun" },
  { k: "ひこうき", r: "hikouki", m: "airplane", kanji: "飛行機", lvl: "N5", cat: "transport", pos: "noun" },

  // ───────────────────────── N5 · time & nature ─────────────────────────
  { k: "あした", r: "ashita", m: "tomorrow", kanji: "明日", lvl: "N5", cat: "time", pos: "noun" },
  { k: "まいにち", r: "mainichi", m: "every day", kanji: "毎日", lvl: "N5", cat: "time", pos: "adverb" },
  { k: "げつよう", r: "getsuyou", m: "Monday", kanji: "月曜", lvl: "N5", cat: "time", pos: "noun" },
  { k: "にちよう", r: "nichiyou", m: "Sunday", kanji: "日曜", lvl: "N5", cat: "time", pos: "noun" },
  { k: "てんき", r: "tenki", m: "weather", kanji: "天気", lvl: "N5", cat: "nature", pos: "noun", ex: "きょうは いい てんきです。", exEn: "The weather is nice today." },

  // ───────────────────────── N5 · study words ─────────────────────────
  { k: "にほんご", r: "nihongo", m: "Japanese language", kanji: "日本語", lvl: "N5", cat: "school", pos: "noun", ex: "にほんごを はなします。", exEn: "I speak Japanese." },
  { k: "えいご", r: "eigo", m: "English language", kanji: "英語", lvl: "N5", cat: "school", pos: "noun" },
  { k: "えいが", r: "eiga", m: "movie", kanji: "映画", lvl: "N5", cat: "school", pos: "noun", ex: "えいがを みます。", exEn: "I watch a movie." },

  // ───────────────────────── N5 · verbs (polite form) ─────────────────────────
  { k: "たべます", r: "tabemasu", m: "to eat", kanji: "食べます", lvl: "N5", cat: "verb", pos: "verb", ex: "パンを たべます。", exEn: "I eat bread." },
  { k: "のみます", r: "nomimasu", m: "to drink", kanji: "飲みます", lvl: "N5", cat: "verb", pos: "verb", ex: "みずを のみます。", exEn: "I drink water." },
  { k: "いきます", r: "ikimasu", m: "to go", kanji: "行きます", lvl: "N5", cat: "verb", pos: "verb" },
  { k: "みじかい", r: "mijikai", m: "short", kanji: "短い", lvl: "N5", cat: "adjective", pos: "i-adj" },

  // ───────────────────────── N5 · adjectives ─────────────────────────
  { k: "おいしい", r: "oishii", m: "delicious", lvl: "N5", cat: "adjective", pos: "i-adj", ex: "この ケーキは おいしいです。", exEn: "This cake is delicious." },
  { k: "おおきい", r: "ookii", m: "big", kanji: "大きい", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "ちいさい", r: "chiisai", m: "small", kanji: "小さい", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "たかい", r: "takai", m: "tall, expensive", kanji: "高い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "やすい", r: "yasui", m: "cheap", kanji: "安い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "あたらしい", r: "atarashii", m: "new", kanji: "新しい", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "ふるい", r: "furui", m: "old (thing)", kanji: "古い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "たのしい", r: "tanoshii", m: "fun, enjoyable", kanji: "楽しい", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "やさしい", r: "yasashii", m: "kind, easy", kanji: "優しい", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "むずかしい", r: "muzukashii", m: "difficult", kanji: "難しい", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "つめたい", r: "tsumetai", m: "cold (to touch)", kanji: "冷たい", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "あたたかい", r: "atatakai", m: "warm", kanji: "暖かい", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "さむい", r: "samui", m: "cold (weather)", kanji: "寒い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "あつい", r: "atsui", m: "hot", kanji: "暑い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "はやい", r: "hayai", m: "fast, early", kanji: "早い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "おおい", r: "ooi", m: "many, a lot", kanji: "多い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "わるい", r: "warui", m: "bad", kanji: "悪い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "あおい", r: "aoi", m: "blue", kanji: "青い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "あかい", r: "akai", m: "red", kanji: "赤い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "しろい", r: "shiroi", m: "white", kanji: "白い", lvl: "N5", cat: "adjective", pos: "i-adj" },
  { k: "きれい", r: "kirei", m: "pretty, clean", lvl: "N5", cat: "adjective", pos: "na-adj" },
  { k: "げんき", r: "genki", m: "healthy, lively", kanji: "元気", lvl: "N5", cat: "adjective", pos: "na-adj", ex: "おげんきですか。", exEn: "How are you?" },
  { k: "たいへん", r: "taihen", m: "tough, awful", kanji: "大変", lvl: "N5", cat: "adjective", pos: "na-adj" },

  // ───────────────────────── N4 · nouns ─────────────────────────
  { k: "びょういん", r: "byouin", m: "hospital", kanji: "病院", lvl: "N4", cat: "place", pos: "noun" },
  { k: "としょかん", r: "toshokan", m: "library", kanji: "図書館", lvl: "N4", cat: "place", pos: "noun" },
  { k: "きょう", r: "kyou", m: "today", kanji: "今日", lvl: "N4", cat: "time", pos: "noun" },
  { k: "きのう", r: "kinou", m: "yesterday", kanji: "昨日", lvl: "N4", cat: "time", pos: "noun" },
  { k: "じかん", r: "jikan", m: "time, hour", kanji: "時間", lvl: "N4", cat: "time", pos: "noun", ex: "じかんが ありません。", exEn: "I don't have time." },
  { k: "しごと", r: "shigoto", m: "work, job", kanji: "仕事", lvl: "N4", cat: "work", pos: "noun", ex: "しごとは いそがしいです。", exEn: "Work is busy." },
  { k: "でんき", r: "denki", m: "electricity, light", kanji: "電気", lvl: "N4", cat: "home", pos: "noun" },
  { k: "くすり", r: "kusuri", m: "medicine", kanji: "薬", lvl: "N4", cat: "home", pos: "noun" },
  { k: "せかい", r: "sekai", m: "world", kanji: "世界", lvl: "N4", cat: "nature", pos: "noun" },
  { k: "こたえ", r: "kotae", m: "answer", kanji: "答え", lvl: "N4", cat: "school", pos: "noun" },
  { k: "しつもん", r: "shitsumon", m: "question", kanji: "質問", lvl: "N4", cat: "school", pos: "noun" },
  { k: "しゅくだい", r: "shukudai", m: "homework", kanji: "宿題", lvl: "N4", cat: "school", pos: "noun", ex: "しゅくだいを します。", exEn: "I do my homework." },
  { k: "れんしゅう", r: "renshuu", m: "practice", kanji: "練習", lvl: "N4", cat: "school", pos: "noun" },
  { k: "べんきょう", r: "benkyou", m: "study", kanji: "勉強", lvl: "N4", cat: "school", pos: "noun" },
  { k: "りょこう", r: "ryokou", m: "travel, trip", kanji: "旅行", lvl: "N4", cat: "activity", pos: "noun", ex: "にほんへ りょこうします。", exEn: "I'll travel to Japan." },
  { k: "けっこん", r: "kekkon", m: "marriage", kanji: "結婚", lvl: "N4", cat: "activity", pos: "noun" },
  { k: "びょうき", r: "byouki", m: "illness", kanji: "病気", lvl: "N4", cat: "body", pos: "noun" },
  { k: "しんぱい", r: "shinpai", m: "worry", kanji: "心配", lvl: "N4", cat: "feeling", pos: "na-adj" },

  // ───────────────────────── N4 · na-adjectives ─────────────────────────
  { k: "しずか", r: "shizuka", m: "quiet", kanji: "静か", lvl: "N4", cat: "adjective", pos: "na-adj", ex: "この まちは しずかです。", exEn: "This town is quiet." },
  { k: "べんり", r: "benri", m: "convenient", kanji: "便利", lvl: "N4", cat: "adjective", pos: "na-adj" },
  { k: "ふべん", r: "fuben", m: "inconvenient", kanji: "不便", lvl: "N4", cat: "adjective", pos: "na-adj" },
  { k: "ゆうめい", r: "yuumei", m: "famous", kanji: "有名", lvl: "N4", cat: "adjective", pos: "na-adj" },
  { k: "しんせつ", r: "shinsetsu", m: "kind", kanji: "親切", lvl: "N4", cat: "adjective", pos: "na-adj" },
  { k: "じょうず", r: "jouzu", m: "skillful, good at", kanji: "上手", lvl: "N4", cat: "adjective", pos: "na-adj" },
  { k: "あんぜん", r: "anzen", m: "safe", kanji: "安全", lvl: "N4", cat: "adjective", pos: "na-adj" },

  // ───────────────────────── N4 · i-adjectives ─────────────────────────
  { k: "おもしろい", r: "omoshiroi", m: "interesting, funny", kanji: "面白い", lvl: "N4", cat: "adjective", pos: "i-adj", ex: "この ほんは おもしろいです。", exEn: "This book is interesting." },
  { k: "うつくしい", r: "utsukushii", m: "beautiful", kanji: "美しい", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "かなしい", r: "kanashii", m: "sad", kanji: "悲しい", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "うれしい", r: "ureshii", m: "happy, glad", kanji: "嬉しい", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "さびしい", r: "sabishii", m: "lonely", kanji: "寂しい", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "あぶない", r: "abunai", m: "dangerous", kanji: "危ない", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "あかるい", r: "akarui", m: "bright", kanji: "明るい", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "くらい", r: "kurai", m: "dark", kanji: "暗い", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "おもい", r: "omoi", m: "heavy", kanji: "重い", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "かるい", r: "karui", m: "light (weight)", kanji: "軽い", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "ちかい", r: "chikai", m: "near, close", kanji: "近い", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "とおい", r: "tooi", m: "far", kanji: "遠い", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "おそい", r: "osoi", m: "slow, late", kanji: "遅い", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "ひろい", r: "hiroi", m: "spacious, wide", kanji: "広い", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "せまい", r: "semai", m: "narrow, cramped", kanji: "狭い", lvl: "N4", cat: "adjective", pos: "i-adj" },
  { k: "ながい", r: "nagai", m: "long", kanji: "長い", lvl: "N4", cat: "adjective", pos: "i-adj" },

  // ───────────────────────── N4 · verbs (polite form) ─────────────────────────
  { k: "わかります", r: "wakarimasu", m: "to understand", kanji: "分かります", lvl: "N4", cat: "verb", pos: "verb" },
  { k: "あるきます", r: "arukimasu", m: "to walk", kanji: "歩きます", lvl: "N4", cat: "verb", pos: "verb" },
  { k: "はなします", r: "hanashimasu", m: "to speak", kanji: "話します", lvl: "N4", cat: "verb", pos: "verb" },
  { k: "ききます", r: "kikimasu", m: "to listen, ask", kanji: "聞きます", lvl: "N4", cat: "verb", pos: "verb" },
  { k: "かいます", r: "kaimasu", m: "to buy", kanji: "買います", lvl: "N4", cat: "verb", pos: "verb", ex: "パンを かいます。", exEn: "I buy bread." },
  { k: "あいます", r: "aimasu", m: "to meet", kanji: "会います", lvl: "N4", cat: "verb", pos: "verb" },
  { k: "かえります", r: "kaerimasu", m: "to return home", kanji: "帰ります", lvl: "N4", cat: "verb", pos: "verb", ex: "うちへ かえります。", exEn: "I return home." },
  { k: "およぎます", r: "oyogimasu", m: "to swim", kanji: "泳ぎます", lvl: "N4", cat: "verb", pos: "verb" },
  { k: "はしります", r: "hashirimasu", m: "to run", kanji: "走ります", lvl: "N4", cat: "verb", pos: "verb" }
].filter(function (w) { return w.k && w.r && w.m; });
