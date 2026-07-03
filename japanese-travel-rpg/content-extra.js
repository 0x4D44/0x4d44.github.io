// Authored, chapter-specific content for the main-route chapters.
// Overlaid onto the generated content.js at load. Keys: j=japanese, r=romaji, e=english, pol=politeness, seg=tile chunks.
export const EXTRA = {
  "uk-home": {
    phrases: [
      { j:"こんにちは。", r:"konnichiwa", e:"Hello / good afternoon" },
      { j:"はじめまして。", r:"hajimemashite", e:"Nice to meet you" },
      { j:"イギリスから来ました。", r:"igirisu kara kimashita", e:"I came from the UK" },
      { j:"日本語が少しわかります。", r:"nihongo ga sukoshi wakarimasu", e:"I understand a little Japanese", seg:["日本語","が","少し","わかります"] },
      { j:"もう一度お願いします。", r:"mou ichido onegai shimasu", e:"Once more, please" }
    ],
    grammar: [
      { title:"です / ます — the polite default", body:"End sentences with です (nouns/adjectives) or a ～ます verb to stay safely polite in any situation.", pattern:"名詞 + です / 動詞 + ます" },
      { title:"お願いします — softening a request", body:"Add お願いします (\"please\") after a noun to make a polite request without a full sentence.", pattern:"〜をお願いします" }
    ],
    culture: [
      { title:"A small bow goes far", body:"A slight nod with your greeting reads as warm and respectful, even before you speak." },
      { title:"Safe beats perfect", body:"Travellers aren't expected to be fluent — one short, polite phrase is always welcome." }
    ]
  },
  "airport-flight": {
    phrases: [
      { j:"搭乗口はどこですか。", r:"toujouguchi wa doko desu ka", e:"Where is the boarding gate?" },
      { j:"これを預けたいです。", r:"kore o azuketai desu", e:"I'd like to check this bag in" },
      { j:"通路側の席をお願いします。", r:"tsuurogawa no seki o onegai shimasu", e:"An aisle seat, please" },
      { j:"乗り継ぎはどこですか。", r:"noritsugi wa doko desu ka", e:"Where is the connecting flight?", seg:["乗り継ぎ","は","どこ","ですか"] },
      { j:"パスポートです。", r:"pasupooto desu", e:"Here is my passport" }
    ],
    grammar: [
      { title:"〜はどこですか — asking where", body:"Name the thing, then はどこですか to ask where it is: gates, toilets, exits, anything.", pattern:"〜はどこですか" },
      { title:"〜たいです — what you'd like", body:"Attach ～たいです to a verb stem to say what you would like to do, politely.", pattern:"動詞 + たいです" }
    ],
    culture: [
      { title:"Queue and keep it quiet", body:"Airports and trains run on orderly lines and low voices — follow the floor markings." },
      { title:"Documents ready", body:"Keep passport and boarding pass out; staff appreciate a smooth, prepared exchange." }
    ]
  },
  "arrival-japan": {
    phrases: [
      { j:"観光で来ました。", r:"kankou de kimashita", e:"I'm here for sightseeing" },
      { j:"荷物はどこで受け取りますか。", r:"nimotsu wa doko de uketorimasu ka", e:"Where do I collect my luggage?" },
      { j:"両替はできますか。", r:"ryougae wa dekimasu ka", e:"Can I exchange money here?" },
      { j:"ICカードを買いたいです。", r:"IC kaado o kaitai desu", e:"I'd like to buy an IC card", seg:["IC","カード","を","買いたいです"] },
      { j:"駅までどう行きますか。", r:"eki made dou ikimasu ka", e:"How do I get to the station?" }
    ],
    grammar: [
      { title:"〜できますか — is it possible?", body:"Use ～できますか to ask politely whether something is possible or allowed.", pattern:"〜できますか" },
      { title:"〜まで — as far as / up to", body:"Mark a destination with まで: 駅まで means \"to the station\".", pattern:"場所 + まで" }
    ],
    culture: [
      { title:"IC cards open everything", body:"A Suica or Pasmo card taps you through trains, buses and most conbini — grab one first." },
      { title:"Cash still matters", body:"Many small shops and shrines are cash-only; carry some yen even in the cities." }
    ]
  },
  "tokyo-transport-hotel": {
    phrases: [
      { j:"予約しています。", r:"yoyaku shite imasu", e:"I have a reservation" },
      { j:"チェックインをお願いします。", r:"chekku-in o onegai shimasu", e:"Check-in, please" },
      { j:"何時から朝食ですか。", r:"nanji kara choushoku desu ka", e:"What time does breakfast start?" },
      { j:"荷物を預かってもらえますか。", r:"nimotsu o azukatte moraemasu ka", e:"Could you hold my luggage?", seg:["荷物","を","預かって","もらえますか"] },
      { j:"この電車は新宿に行きますか。", r:"kono densha wa shinjuku ni ikimasu ka", e:"Does this train go to Shinjuku?" }
    ],
    grammar: [
      { title:"〜てもらえますか — a polite favour", body:"Ask someone to do something for you with ～てもらえますか (\"could you…?\"). Very useful.", pattern:"動詞て + もらえますか" },
      { title:"何時から — from what time", body:"から means \"from\"; 何時から asks the starting time of something.", pattern:"何時から〜ですか" }
    ],
    culture: [
      { title:"Shoes at the door", body:"Some ryokan-style hotels ask you to remove shoes at the entrance — look for a step up and a rack." },
      { title:"Trains are precise", body:"Departures are exact to the minute; platform number and destination are on every sign." }
    ]
  },
  "tokyo-food-conbini": {
    phrases: [
      { j:"これをお願いします。", r:"kore o onegai shimasu", e:"This one, please" },
      { j:"おすすめは何ですか。", r:"osusume wa nan desu ka", e:"What do you recommend?" },
      { j:"ナッツのアレルギーがあります。", r:"nattsu no arerugii ga arimasu", e:"I have a nut allergy" },
      { j:"肉は食べられません。", r:"niku wa taberaremasen", e:"I can't eat meat", seg:["肉","は","食べられません"] },
      { j:"カードで払えますか。", r:"kaado de haraemasu ka", e:"Can I pay by card?" }
    ],
    grammar: [
      { title:"〜は何ですか — what is…?", body:"Ask \"what is X?\" by naming the topic, then は何ですか.", pattern:"〜は何ですか" },
      { title:"〜られません — I can't", body:"The potential negative ～られません says you're unable to do something (e.g. eat it).", pattern:"動詞 + られません" }
    ],
    culture: [
      { title:"Conbini are lifesavers", body:"Convenience stores have fresh meals, ATMs and clean toilets — staff will heat food if you ask." },
      { title:"Carry an allergy card", body:"A written allergy card is safer than spoken terms in a busy shop." }
    ]
  },
  "tokyo-shopping-attractions": {
    phrases: [
      { j:"いくらですか。", r:"ikura desu ka", e:"How much is it?" },
      { j:"試着してもいいですか。", r:"shichaku shite mo ii desu ka", e:"May I try it on?" },
      { j:"もっと大きいのはありますか。", r:"motto ookii no wa arimasu ka", e:"Do you have a bigger one?" },
      { j:"写真を撮ってもいいですか。", r:"shashin o totte mo ii desu ka", e:"May I take a photo?", seg:["写真","を","撮っても","いいですか"] },
      { j:"袋はいりません。", r:"fukuro wa irimasen", e:"I don't need a bag" }
    ],
    grammar: [
      { title:"〜てもいいですか — may I…?", body:"Ask permission with ～てもいいですか (\"is it ok if I…?\"). Essential for photos and trying things.", pattern:"動詞て + もいいですか" },
      { title:"〜はありますか — do you have…?", body:"Ask whether something is available with 〜はありますか.", pattern:"〜はありますか" }
    ],
    culture: [
      { title:"Use the money tray", body:"Place cash on the small tray by the till rather than into hands; change comes back the same way." },
      { title:"Ask before photos", body:"A quick 写真をとってもいいですか is polite — some places forbid photography." }
    ]
  },
  "kyoto-temples-etiquette": {
    phrases: [
      { j:"中に入ってもいいですか。", r:"naka ni haitte mo ii desu ka", e:"May I go inside?" },
      { j:"靴を脱ぎますか。", r:"kutsu o nugimasu ka", e:"Do I take off my shoes?" },
      { j:"ここで写真は大丈夫ですか。", r:"koko de shashin wa daijoubu desu ka", e:"Are photos ok here?" },
      { j:"御朱印をいただけますか。", r:"goshuin o itadakemasu ka", e:"May I have a goshuin stamp?", seg:["御朱印","を","いただけますか"] },
      { j:"静かにします。", r:"shizuka ni shimasu", e:"I'll be quiet" }
    ],
    grammar: [
      { title:"いただけますか — a humble request", body:"いただけますか is a very polite \"may I have…?\", ideal at temples and formal places.", pattern:"〜をいただけますか" },
      { title:"大丈夫ですか — is it ok?", body:"大丈夫 covers \"ok / fine / allowed\" — a soft way to check before you act.", pattern:"〜は大丈夫ですか" }
    ],
    culture: [
      { title:"Purify at the fountain", body:"At the temizuya, rinse left hand, right hand, then mouth before approaching the shrine." },
      { title:"Quiet and still", body:"Keep voices low, don't block paths for photos, and obey 撮影禁止 (no-photo) notices." }
    ]
  },
  "osaka-food-shopping": {
    phrases: [
      { j:"すみません、注文いいですか。", r:"sumimasen, chuumon ii desu ka", e:"Excuse me, may I order?" },
      { j:"これとこれをお願いします。", r:"kore to kore o onegai shimasu", e:"This and this, please" },
      { j:"とても美味しいです。", r:"totemo oishii desu", e:"It's very delicious" },
      { j:"お会計をお願いします。", r:"okaikei o onegai shimasu", e:"The bill, please", seg:["お会計","を","お願いします"] },
      { j:"ごちそうさまでした。", r:"gochisousama deshita", e:"Thank you for the meal" }
    ],
    grammar: [
      { title:"〜と〜 — listing \"and\"", body:"Join nouns with と to list them: これとこれ means \"this and this\".", pattern:"名詞 + と + 名詞" },
      { title:"Casual you'll hear", body:"Osaka staff may say おおきに (thanks) or なんぼ (how much) — you can still reply in safe polite Japanese.", pattern:"おおきに = ありがとう" }
    ],
    culture: [
      { title:"Say gochisousama", body:"ごちそうさまでした after eating is a warm thank-you for the meal — always appreciated." },
      { title:"Friendly and direct", body:"Osaka is famously chatty and warm; a smile plus a polite phrase goes a long way." }
    ]
  },
  "return-journey": {
    phrases: [
      { j:"チェックアウトをお願いします。", r:"chekku-auto o onegai shimasu", e:"Check-out, please" },
      { j:"忘れ物をしました。", r:"wasuremono o shimashita", e:"I've left something behind" },
      { j:"空港までのバスはどこですか。", r:"kuukou made no basu wa doko desu ka", e:"Where's the bus to the airport?" },
      { j:"お世話になりました。", r:"osewa ni narimashita", e:"Thank you for everything", seg:["お世話","に","なりました"] },
      { j:"楽しかったです。", r:"tanoshikatta desu", e:"It was fun / I enjoyed it" }
    ],
    grammar: [
      { title:"〜ました — polite past", body:"The ～ました ending puts a verb in the polite past: しました means \"I did\".", pattern:"動詞 + ました" },
      { title:"〜かったです — it was (adj)", body:"For い-adjectives, the polite past is ～かったです: 楽しかったです = \"it was fun\".", pattern:"い形容詞 + かったです" }
    ],
    culture: [
      { title:"A gracious goodbye", body:"お世話になりました thanks people for their care during your stay — perfect at check-out." },
      { title:"Lost & found works", body:"Japan's lost-property system is excellent; report a 忘れ物 at the station or hotel desk." }
    ]
  },
  "nara-side": {
    phrases: [
      { j:"奈良公園はどう行きますか。", r:"nara kouen wa dou ikimasu ka", e:"How do I get to Nara Park?" },
      { j:"鹿にえさをあげてもいいですか。", r:"shika ni esa o agete mo ii desu ka", e:"May I feed the deer?" },
      { j:"噛むので気をつけます。", r:"kamu node ki o tsukemasu", e:"I'll be careful as they bite" },
      { j:"最終バスは何時ですか。", r:"saishuu basu wa nanji desu ka", e:"What time is the last bus?", seg:["最終","バス","は","何時","ですか"] },
      { j:"日帰りで戻ります。", r:"higaeri de modorimasu", e:"I'll return the same day" }
    ],
    grammar: [
      { title:"〜ので — giving a reason", body:"ので links a reason to what follows, softly: 噛むので = \"because they bite…\".", pattern:"理由 + ので + 〜" },
      { title:"最終・始発 — last & first", body:"最終 marks the last service and 始発 the first — vital when planning a day trip back.", pattern:"最終バス / 始発電車" }
    ],
    culture: [
      { title:"The deer bow", body:"Nara's deer are wild and protected; some bow for crackers, but they nip — keep food hidden until you offer it." },
      { title:"Plan the last train", body:"Rural returns hinge on the last bus or train; check 最終 times before you set out." }
    ]
  },
  "hakone-fuji-side": {
    phrases: [
      { j:"今日、富士山は見えますか。", r:"kyou, fujisan wa miemasu ka", e:"Can we see Mt Fuji today?" },
      { j:"ロープウェイは動いていますか。", r:"roopuwei wa ugoite imasu ka", e:"Is the ropeway running?" },
      { j:"この切符は使えますか。", r:"kono kippu wa tsukaemasu ka", e:"Can I use this ticket?" },
      { j:"天気が悪いので運休ですか。", r:"tenki ga warui node unkyuu desu ka", e:"Is it suspended due to bad weather?", seg:["天気","が","悪いので","運休","ですか"] },
      { j:"代わりのバスはありますか。", r:"kawari no basu wa arimasu ka", e:"Is there a replacement bus?" }
    ],
    grammar: [
      { title:"〜ています — an ongoing state", body:"～ています describes a current state or action in progress: 動いています = \"is running\".", pattern:"動詞て + います" },
      { title:"見えます / 聞こえます", body:"These mean \"is visible / is audible\" — things you can see or hear, not deliberate actions.", pattern:"〜が見えます" }
    ],
    culture: [
      { title:"Fuji is shy", body:"The mountain is often hidden by cloud; mornings in autumn and winter give the clearest views." },
      { title:"Mountain weather turns fast", body:"Ropeways and buses pause for wind and storms (運休). Keep a flexible plan and ticket." }
    ]
  },
  "ryokan-onsen-side": {
    phrases: [
      { j:"チェックインは何時からですか。", r:"chekku-in wa nanji kara desu ka", e:"From what time is check-in?" },
      { j:"夕食は何時ですか。", r:"yuushoku wa nanji desu ka", e:"What time is dinner?" },
      { j:"お風呂は何時まで入れますか。", r:"ofuro wa nanji made hairemasu ka", e:"Until what time can I use the bath?" },
      { j:"スリッパはここで脱ぎますか。", r:"surippa wa koko de nugimasu ka", e:"Do I take off the slippers here?", seg:["スリッパ","は","ここで","脱ぎますか"] },
      { j:"温泉に入る前に体を洗います。", r:"onsen ni hairu mae ni karada o araimasu", e:"I'll wash before entering the onsen" }
    ],
    grammar: [
      { title:"〜前に — before doing", body:"A dictionary-form verb + 前に means \"before doing…\": 入る前に = \"before entering\".", pattern:"動詞(辞書形) + 前に" },
      { title:"〜まで入れますか — until when?", body:"まで marks a time limit; 〜まで入れますか asks until when something is usable.", pattern:"〜まで + 可能形ますか" }
    ],
    culture: [
      { title:"Wash first, soak second", body:"Rinse and wash fully at the shower stations before entering the shared bath; no soap in the water." },
      { title:"Shoes, slippers, tatami", body:"Outdoor shoes off at the entrance, slippers off before tatami — never step on tatami in slippers." }
    ]
  },
  "hiroshima-miyajima-side": {
    phrases: [
      { j:"平和記念公園はどちらですか。", r:"heiwa kinen kouen wa dochira desu ka", e:"Which way is the Peace Memorial Park?" },
      { j:"宮島行きのフェリーはどこですか。", r:"miyajima yuki no ferii wa doko desu ka", e:"Where is the ferry to Miyajima?" },
      { j:"静かに見学します。", r:"shizuka ni kengaku shimasu", e:"I'll view it quietly" },
      { j:"写真を撮ってもよろしいですか。", r:"shashin o totte mo yoroshii desu ka", e:"May I take a photo?", seg:["写真","を","撮っても","よろしいですか"] },
      { j:"次の便は何時ですか。", r:"tsugi no bin wa nanji desu ka", e:"What time is the next departure?" }
    ],
    grammar: [
      { title:"よろしいですか — extra-polite may I", body:"よろしいですか is a more formal いいですか, suited to solemn or respectful places.", pattern:"〜てもよろしいですか" },
      { title:"〜行き — bound for", body:"Attach 行き to a place to mean \"bound for\": 宮島行き = \"for Miyajima\".", pattern:"地名 + 行き" }
    ],
    culture: [
      { title:"A place for reflection", body:"The Peace Park is a memorial; move quietly and be thoughtful about photos and poses." },
      { title:"Tide shapes the torii", body:"Miyajima's floating torii looks very different at high and low tide — check the tide times." }
    ]
  },
  "rural-transport-side": {
    phrases: [
      { j:"すみません、道を教えてください。", r:"sumimasen, michi o oshiete kudasai", e:"Excuse me, please tell me the way" },
      { j:"このバスは駅に行きますか。", r:"kono basu wa eki ni ikimasu ka", e:"Does this bus go to the station?" },
      { j:"時刻表を見せてもらえますか。", r:"jikokuhyou o misete moraemasu ka", e:"Could you show me the timetable?" },
      { j:"次のバスまで待ちます。", r:"tsugi no basu made machimasu", e:"I'll wait until the next bus", seg:["次の","バス","まで","待ちます"] },
      { j:"英語のメニューはありますか。", r:"eigo no menyuu wa arimasu ka", e:"Is there an English menu?" }
    ],
    grammar: [
      { title:"〜てください — please do", body:"～てください is a direct but polite \"please do…\": 教えてください = \"please tell me\".", pattern:"動詞て + ください" },
      { title:"〜てもらえますか — a small favour", body:"Use it to ask a local for help: 見せてもらえますか = \"could you show me?\".", pattern:"動詞て + もらえますか" }
    ],
    culture: [
      { title:"Locals will help", body:"Where English is scarce, a polite すみません and a pointed-at map go a long way — people are generous with directions." },
      { title:"Timetables are king", body:"Rural buses may run only a few times a day; photograph the 時刻表 so you don't miss the last one." }
    ]
  },
  "fukushima-resilience": {
    phrases: [
      { j:"指示に従います。", r:"shiji ni shitagaimasu", e:"I'll follow the instructions" },
      { j:"どこに避難すればいいですか。", r:"doko ni hinan sureba ii desu ka", e:"Where should I evacuate to?" },
      { j:"この道は通れますか。", r:"kono michi wa toremasu ka", e:"Can I pass along this road?" },
      { j:"案内所はどこですか。", r:"annaijo wa doko desu ka", e:"Where is the information office?", seg:["案内所","は","どこ","ですか"] },
      { j:"助かりました。ありがとうございます。", r:"tasukarimashita. arigatou gozaimasu", e:"That helped — thank you" }
    ],
    grammar: [
      { title:"〜ばいいですか — what should I…?", body:"The conditional ～ばいいですか asks for guidance: 避難すればいいですか = \"where should I evacuate?\".", pattern:"動詞(条件形) + ばいいですか" },
      { title:"〜に従います — I will follow", body:"に従います means \"follow / comply with\" — used for instructions and signs.", pattern:"〜に従います" }
    ],
    culture: [
      { title:"Notices keep you safe", body:"Watch for 通行止め (road closed), 避難 (evacuation) and 立入禁止 (no entry), and follow staff calmly." },
      { title:"Ask at the 案内所", body:"Information offices exist even in recovering areas; staff can guide you to safe routes and transport." }
    ]
  },
  "tohoku-hokkaido-extension": {
    phrases: [
      { j:"雪で電車は遅れていますか。", r:"yuki de densha wa okurete imasu ka", e:"Are the trains delayed because of snow?" },
      { j:"次の駅まで何分ですか。", r:"tsugi no eki made nanpun desu ka", e:"How many minutes to the next station?" },
      { j:"暖かい飲み物はありますか。", r:"atatakai nomimono wa arimasu ka", e:"Do you have a warm drink?" },
      { j:"この電車は各駅停車ですか。", r:"kono densha wa kakueki teisha desu ka", e:"Is this train an all-stops local?", seg:["この","電車","は","各駅停車","ですか"] },
      { j:"気をつけて行きます。", r:"ki o tsukete ikimasu", e:"I'll go carefully" }
    ],
    grammar: [
      { title:"〜で — cause or means", body:"で can mark a cause (雪で = \"due to snow\") or a means (バスで = \"by bus\").", pattern:"名詞 + で" },
      { title:"各駅停車 / 快速 / 特急", body:"Trains range from all-stops (各駅停車) to rapid (快速) and limited express (特急) — check before boarding.", pattern:"各駅停車 / 特急" }
    ],
    culture: [
      { title:"Winter runs on margins", body:"Snow delays trains and buses; build in buffer time and watch for 遅れ (delay) notices." },
      { title:"Warm up at the conbini", body:"Northern conbini stock hot drinks and oden — a reliable warm stop between connections." }
    ]
  }
};
