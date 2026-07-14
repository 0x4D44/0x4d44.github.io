/* sintaxis engine — Spanish conjugator + answer grader + diagnostics.
   No dependencies; exposes window.CONJ, window.CHECK, window.ERRORS. */
(function () {
"use strict";

/* ───────────────────────── conjugator ───────────────────────── */

var PERSONS = ["yo", "tú", "él/ella/Ud.", "nosotros/as", "vosotros/as", "ellos/Uds."];

var TENSES = {
  pres:     { name: "presente",                en: "present indicative" },
  pret:     { name: "pretérito indefinido",    en: "preterite" },
  impf:     { name: "imperfecto",              en: "imperfect" },
  fut:      { name: "futuro simple",           en: "future" },
  cond:     { name: "condicional",             en: "conditional" },
  subj:     { name: "presente de subjuntivo",  en: "present subjunctive" },
  subjImpf: { name: "imperfecto de subjuntivo", en: "imperfect subjunctive (-ra)" },
  perf:     { name: "pretérito perfecto",      en: "present perfect" },
  plup:     { name: "pluscuamperfecto",        en: "past perfect" }
};

var END = {
  pres: { ar: ["o","as","a","amos","áis","an"], er: ["o","es","e","emos","éis","en"], ir: ["o","es","e","imos","ís","en"] },
  pret: { ar: ["é","aste","ó","amos","asteis","aron"], er: ["í","iste","ió","imos","isteis","ieron"] },
  impf: { ar: ["aba","abas","aba","ábamos","abais","aban"], er: ["ía","ías","ía","íamos","íais","ían"] },
  fut:  ["é","ás","á","emos","éis","án"],
  cond: ["ía","ías","ía","íamos","íais","ían"],
  subj: { ar: ["e","es","e","emos","éis","en"], er: ["a","as","a","amos","áis","an"] },
  strong: ["e","iste","o","imos","isteis","ieron"]
};

/* Registry. Absent fields ⇒ regular. Fields:
   g gloss · sc stem change ("e>ie","o>ue","e>i","u>ue") · acc "í"/"ú" (enviar/continuar)
   yo irregular first person · pretStem strong preterite stem (j: ends in j)
   futStem · tuImp · part · ger · full overrides pres/pret/impf/subj (arrays of 6) · note */
var R = {
  hablar:{g:"to speak"}, trabajar:{g:"to work"}, estudiar:{g:"to study"}, comprar:{g:"to buy"},
  llevar:{g:"to carry/wear"}, esperar:{g:"to wait/hope"}, ayudar:{g:"to help"}, usar:{g:"to use"},
  programar:{g:"to program"}, terminar:{g:"to finish"}, necesitar:{g:"to need"}, viajar:{g:"to travel"},
  cambiar:{g:"to change"}, olvidar:{g:"to forget"}, dejar:{g:"to leave/let"}, preguntar:{g:"to ask (a question)"},
  comer:{g:"to eat"}, beber:{g:"to drink"}, aprender:{g:"to learn"}, correr:{g:"to run"},
  vender:{g:"to sell"}, deber:{g:"must/to owe"}, romper:{g:"to break", part:"roto"},
  vivir:{g:"to live"}, escribir:{g:"to write", part:"escrito"}, abrir:{g:"to open", part:"abierto"},
  recibir:{g:"to receive"}, decidir:{g:"to decide"}, subir:{g:"to go up"}, compartir:{g:"to share"},
  existir:{g:"to exist"}, cubrir:{g:"to cover", part:"cubierto"}, descubrir:{g:"to discover", part:"descubierto"},

  pensar:{g:"to think", sc:"e>ie"}, cerrar:{g:"to close", sc:"e>ie"}, empezar:{g:"to begin", sc:"e>ie"},
  comenzar:{g:"to begin", sc:"e>ie"}, despertar:{g:"to wake", sc:"e>ie"}, recomendar:{g:"to recommend", sc:"e>ie"},
  entender:{g:"to understand", sc:"e>ie"}, perder:{g:"to lose", sc:"e>ie"}, encender:{g:"to switch on", sc:"e>ie"},
  volver:{g:"to return", sc:"o>ue", part:"vuelto"}, devolver:{g:"to give back", sc:"o>ue", part:"devuelto"},
  resolver:{g:"to solve", sc:"o>ue", part:"resuelto"}, encontrar:{g:"to find", sc:"o>ue"},
  contar:{g:"to count/tell", sc:"o>ue"}, costar:{g:"to cost", sc:"o>ue"}, recordar:{g:"to remember", sc:"o>ue"},
  mostrar:{g:"to show", sc:"o>ue"}, soñar:{g:"to dream", sc:"o>ue"}, almorzar:{g:"to have lunch", sc:"o>ue"},
  acostarse:{g:"to go to bed", sc:"o>ue"}, llover:{g:"to rain", sc:"o>ue"}, jugar:{g:"to play", sc:"u>ue"},
  dormir:{g:"to sleep", sc:"o>ue", ger:"durmiendo"}, morir:{g:"to die", sc:"o>ue", part:"muerto", ger:"muriendo"},
  sentir:{g:"to feel", sc:"e>ie", ger:"sintiendo"}, preferir:{g:"to prefer", sc:"e>ie", ger:"prefiriendo"},
  mentir:{g:"to lie", sc:"e>ie", ger:"mintiendo"}, divertirse:{g:"to have fun", sc:"e>ie", ger:"divirtiéndose"},
  pedir:{g:"to ask for", sc:"e>i", ger:"pidiendo"}, servir:{g:"to serve", sc:"e>i", ger:"sirviendo"},
  repetir:{g:"to repeat", sc:"e>i", ger:"repitiendo"}, vestirse:{g:"to get dressed", sc:"e>i", ger:"vistiéndose"},
  seguir:{g:"to follow/continue", sc:"e>i", yo:"sigo", ger:"siguiendo"},
  elegir:{g:"to choose", sc:"e>i", yo:"elijo", ger:"eligiendo"},
  escoger:{g:"to choose", yo:"escojo"},

  buscar:{g:"to look for"}, sacar:{g:"to take out"}, tocar:{g:"to touch/play"}, explicar:{g:"to explain"},
  llegar:{g:"to arrive"}, pagar:{g:"to pay"}, apagar:{g:"to switch off"}, entregar:{g:"to hand in"},
  cruzar:{g:"to cross"}, organizar:{g:"to organise"},
  leer:{g:"to read", ger:"leyendo", part:"leído"}, creer:{g:"to believe", ger:"creyendo", part:"creído"},
  caer:{g:"to fall", yo:"caigo", ger:"cayendo", part:"caído"},
  construir:{g:"to build"}, destruir:{g:"to destroy"}, huir:{g:"to flee"}, incluir:{g:"to include"},
  enviar:{g:"to send", acc:"í"}, confiar:{g:"to trust", acc:"í"}, continuar:{g:"to continue", acc:"ú"},

  conocer:{g:"to know (people/places)"}, parecer:{g:"to seem"}, ofrecer:{g:"to offer"}, nacer:{g:"to be born"},
  conducir:{g:"to drive", pretStem:"conduj"}, traducir:{g:"to translate", pretStem:"traduj"},
  producir:{g:"to produce", pretStem:"produj"},

  ser:{g:"to be (identity)", pres:["soy","eres","es","somos","sois","son"],
       pret:["fui","fuiste","fue","fuimos","fuisteis","fueron"],
       impf:["era","eras","era","éramos","erais","eran"],
       subj:["sea","seas","sea","seamos","seáis","sean"], tuImp:"sé",
       note:"fully irregular; shares its preterite with ir"},
  estar:{g:"to be (state/location)", pres:["estoy","estás","está","estamos","estáis","están"],
       pretStem:"estuv", subj:["esté","estés","esté","estemos","estéis","estén"],
       note:"present carries stress-marking accents; strong preterite estuv-"},
  ir:{g:"to go", pres:["voy","vas","va","vamos","vais","van"],
       pret:["fui","fuiste","fue","fuimos","fuisteis","fueron"],
       impf:["iba","ibas","iba","íbamos","ibais","iban"],
       subj:["vaya","vayas","vaya","vayamos","vayáis","vayan"], tuImp:"ve", ger:"yendo",
       note:"fully irregular; shares its preterite with ser"},
  haber:{g:"to have (auxiliary)", pres:["he","has","ha","hemos","habéis","han"],
       pretStem:"hub", futStem:"habr", subj:["haya","hayas","haya","hayamos","hayáis","hayan"],
       note:"auxiliary for perfect tenses; hay = impersonal 'there is'"},
  tener:{g:"to have", sc:"e>ie", yo:"tengo", pretStem:"tuv", futStem:"tendr", tuImp:"ten"},
  hacer:{g:"to do/make", yo:"hago", pretStem:"hic", futStem:"har", tuImp:"haz", part:"hecho"},
  poder:{g:"to be able", sc:"o>ue", pretStem:"pud", futStem:"podr", ger:"pudiendo"},
  poner:{g:"to put", yo:"pongo", pretStem:"pus", futStem:"pondr", tuImp:"pon", part:"puesto"},
  decir:{g:"to say", sc:"e>i", yo:"digo", pretStem:"dij", futStem:"dir", tuImp:"di", part:"dicho", ger:"diciendo"},
  venir:{g:"to come", sc:"e>ie", yo:"vengo", pretStem:"vin", futStem:"vendr", tuImp:"ven", ger:"viniendo"},
  querer:{g:"to want/love", sc:"e>ie", pretStem:"quis", futStem:"querr"},
  saber:{g:"to know (facts/how)", yo:"sé", pretStem:"sup", futStem:"sabr",
       subj:["sepa","sepas","sepa","sepamos","sepáis","sepan"]},
  dar:{g:"to give", pres:["doy","das","da","damos","dais","dan"],
       pret:["di","diste","dio","dimos","disteis","dieron"],
       subj:["dé","des","dé","demos","deis","den"],
       note:"takes -er/-ir preterite endings, unaccented (one syllable)"},
  ver:{g:"to see", yo:"veo", pret:["vi","viste","vio","vimos","visteis","vieron"],
       impf:["veía","veías","veía","veíamos","veíais","veían"], part:"visto",
       note:"imperfect keeps the e of the old stem ve-: veía"},
  salir:{g:"to go out", yo:"salgo", futStem:"saldr", tuImp:"sal"},
  traer:{g:"to bring", yo:"traigo", pretStem:"traj", ger:"trayendo", part:"traído"},
  oír:{g:"to hear", pres:["oigo","oyes","oye","oímos","oís","oyen"], futStem:"oir", ger:"oyendo", part:"oído"},
  andar:{g:"to walk", pretStem:"anduv"},
  caber:{g:"to fit", yo:"quepo", pretStem:"cup", futStem:"cabr"},
  valer:{g:"to be worth", yo:"valgo", futStem:"valdr"},
  reír:{g:"to laugh", pres:["río","ríes","ríe","reímos","reís","ríen"],
       pret:["reí","reíste","rio","reímos","reísteis","rieron"],
       subj:["ría","rías","ría","riamos","riais","rían"], futStem:"reir", ger:"riendo", part:"reído"}
};

function stripReflex(v) { return /(?:arse|erse|irse)$/.test(v) ? v.slice(0, -2) : v; }
function deacc(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}
function verbClass(inf) { return deacc(inf).slice(-2); }        // "ar" | "er" | "ir"
function stemOf(inf) { return inf.slice(0, -2); }
function isVowel(ch) { return "aeiouáéíóú".indexOf(ch) >= 0; }
function accentLast(s) {
  var map = { a: "á", e: "é", i: "í", o: "ó", u: "ú" };
  for (var i = s.length - 1; i >= 0; i--) if (map[s[i]]) return s.slice(0, i) + map[s[i]] + s.slice(i + 1);
  return s;
}

/* Apply the stem change to the last matching vowel of the stem. */
function applySC(stem, sc) {
  var from = sc.split(">")[0], to = sc.split(">")[1];
  var i = stem.lastIndexOf(from);
  if (i < 0) return stem;
  return stem.slice(0, i) + to + stem.slice(i + from.length);
}
/* Raised stem for -ir stem-changers (pretérito 3rd, gerund, subj nos/vos): e→i, o→u. */
function raisedStem(stem, sc) {
  var from = sc.split(">")[0], to = from === "o" ? "u" : "i";
  var i = stem.lastIndexOf(from);
  if (i < 0) return stem;
  return stem.slice(0, i) + to + stem.slice(i + from.length);
}
/* Orthographic fixes at the stem/ending boundary. */
function ortho(inf, stem, ending) {
  var first = deacc(ending[0] || "");
  if (/car$/.test(inf) && first === "e") return stem.slice(0, -1) + "qu" + ending;
  if (/gar$/.test(inf) && first === "e") return stem.slice(0, -1) + "gu" + ending;
  if (/guar$/.test(inf) && first === "e") return stem.slice(0, -2) + "gü" + ending;
  if (/zar$/.test(inf) && first === "e") return stem.slice(0, -1) + "c" + ending;
  if (/(ger|gir)$/.test(inf) && (first === "a" || first === "o") && stem.slice(-1) === "g")
    return stem.slice(0, -1) + "j" + ending;
  if (/guir$/.test(inf) && (first === "a" || first === "o") && stem.slice(-2) === "gu")
    return stem.slice(0, -1) + ending;               // sigu+a → siga
  return stem + ending;
}
function isUir(inf) { return /uir$/.test(inf) && !/guir$/.test(inf); }
function isZco(inf) { // vowel + cer/cir → -zco
  return /[aeiou]c(er|ir)$/.test(inf);
}

function entry(verb) {
  var v = stripReflex(verb);
  return R[v] || {};
}

function conj(verb, tense) {
  var inf = stripReflex(verb);
  var e = R[inf] || {};
  var cls = verbClass(inf);
  var stem = stemOf(inf);
  var i, out = [];

  if (tense === "perf" || tense === "plup") {
    var aux = tense === "perf" ? conj("haber", "pres") : conj("haber", "impf");
    var p = participle(verb);
    return aux.map(function (a) { return a + " " + p; });
  }

  if (tense === "pres") {
    if (e.pres) return e.pres.slice();
    var ends = END.pres[cls];
    for (i = 0; i < 6; i++) {
      var st = stem, boot = (i !== 3 && i !== 4);
      if (e.sc && boot) st = applySC(stem, e.sc);
      if (e.acc && boot) st = st.replace(/([iu])(?=[^iu]*$)/, e.acc === "í" ? "í" : "ú");
      if (isUir(inf) && boot) st = st + "y";
      var form = ortho(inf, st, ends[i]);
      if (i === 0) {
        if (e.yo) form = e.yo;
        else if (isZco(inf)) form = stem.slice(0, -1) + "zco";
        else if (isUir(inf)) form = stem + "yo";
      }
      out.push(form);
    }
    return out;
  }

  if (tense === "pret") {
    if (e.pret) return e.pret.slice();
    if (e.pretStem) {
      var j = /j$/.test(e.pretStem);
      out = END.strong.map(function (en, k) {
        if (j && k === 5) return e.pretStem + "eron";
        return e.pretStem + en;
      });
      if (e.pretStem === "hic") out[2] = "hizo";
      return out;
    }
    var pe = cls === "ar" ? END.pret.ar : END.pret.er;
    var yEnd = cls !== "ar" && isVowel(stem.slice(-1)) && !/[gq]u$/.test(stem); // leer, caer, oír, -uir
    var strongV = yEnd && /[aeo]$/.test(deacc(stem.slice(-1))); // leí́ste-type accents
    for (i = 0; i < 6; i++) {
      var st2 = stem, en2 = pe[i];
      if (cls === "ir" && e.sc && (i === 2 || i === 5)) st2 = raisedStem(stem, e.sc);
      if (yEnd) {
        if (i === 2) en2 = "yó";
        else if (i === 5) en2 = "yeron";
        else if (strongV) en2 = { 0: "í", 1: "íste", 3: "ímos", 4: "ísteis" }[i];
      }
      out.push(i === 0 ? ortho(inf, st2, en2) : st2 + en2);
    }
    return out;
  }

  if (tense === "impf") {
    if (e.impf) return e.impf.slice();
    var ie = cls === "ar" ? END.impf.ar : END.impf.er;
    return ie.map(function (en) { return stem + en; });
  }

  if (tense === "fut" || tense === "cond") {
    var fstem = e.futStem || inf;
    var fe = tense === "fut" ? END.fut : END.cond;
    return fe.map(function (en) { return fstem + en; });
  }

  if (tense === "subj") {
    if (e.subj) return e.subj.slice();
    var yo = conj(inf, "pres")[0];                       // derive from first person
    var base = /o$/.test(yo) ? yo.slice(0, -1) : stemOf(inf);
    var se = cls === "ar" ? END.subj.ar : END.subj.er;
    for (i = 0; i < 6; i++) {
      var st3 = base;
      if (i === 3 || i === 4) {                          // outside the boot
        if (e.yo) st3 = /o$/.test(e.yo) ? e.yo.slice(0, -1) : base;  // tengamos, digamos, sigamos
        else if (isUir(inf)) st3 = stem + "y";                       // construyamos
        else if (e.sc) st3 = (cls === "ir") ? raisedStem(stem, e.sc) : stem; // sintamos vs pensemos
        else if (e.acc) st3 = stem;                                  // enviemos
        else st3 = base;                                             // conozcamos, escojamos, veamos
      }
      out.push(ortho(inf, st3, se[i]));
    }
    return out;
  }

  if (tense === "subjImpf") {
    var p3 = conj(verb, "pret")[5];                      // universal rule: 3pl pret − ron
    var b = p3.slice(0, -3);
    return [b + "ra", b + "ras", b + "ra", accentLast(b) + "ramos", b + "rais", b + "ran"];
  }

  throw new Error("unknown tense: " + tense);
}

function gerund(verb) {
  var inf = stripReflex(verb);
  var e = R[inf] || {};
  if (e.ger) return e.ger;
  var cls = verbClass(inf), stem = stemOf(inf);
  if (cls === "ar") return stem + "ando";
  if (isVowel(stem.slice(-1))) return stem + "yendo";
  if (cls === "ir" && e.sc) return raisedStem(stem, e.sc) + "iendo";
  return stem + "iendo";
}
function participle(verb) {
  var inf = stripReflex(verb);
  var e = R[inf] || {};
  if (e.part) return e.part;
  var cls = verbClass(inf), stem = stemOf(inf);
  if (cls === "ar") return stem + "ado";
  if (isVowel(stem.slice(-1)) && !isUir(inf)) return stem + "ído";  // leído, caído, oído
  return stem + "ido";
}

/* Imperative: [tú, usted, nosotros, vosotros, ustedes] */
function imperative(verb, negative) {
  var inf = stripReflex(verb);
  var e = R[inf] || {};
  var s = conj(inf, "subj");
  if (negative) return [s[1], s[2], s[3], s[4], s[5]].map(function (f) { return "no " + f; });
  var tu = e.tuImp || conj(inf, "pres")[2];
  var nos = inf === "ir" ? "vamos" : s[3];
  return [tu, s[2], nos, inf.slice(0, -1) + "d", s[5]];
}

/* Notes for the REPL about what is irregular where. */
function verbNotes(verb) {
  var inf = stripReflex(verb);
  var e = R[inf] || {};
  var n = [];
  if (e.note) n.push(e.note);
  if (e.sc) n.push("stem change " + e.sc + " in the stressed forms (the “boot”: all persons except nosotros/vosotros)" + (verbClass(inf) === "ir" ? "; -ir verb, so the raised vowel also appears in the 3rd-person preterite, the gerund and subjunctive nosotros/vosotros" : ""));
  if (e.yo) n.push("irregular first person: " + e.yo + " (the subjunctive inherits this stem)");
  if (!e.yo && isZco(inf)) n.push("vowel + -cer/-cir → first person -zco; the subjunctive inherits it");
  if (e.pretStem) n.push("strong preterite stem " + e.pretStem + "-: unstressed endings, no accents (-e, -iste, -o…)" + (/j$/.test(e.pretStem) ? "; j-stem, so 3pl is -eron not -ieron" : ""));
  if (e.futStem) n.push("irregular future/conditional stem " + e.futStem + "-");
  if (e.part) n.push("irregular participle: " + e.part);
  if (/car$/.test(inf)) n.push("-car: c→qu before e (preterite yo, all of the subjunctive)");
  if (/gar$/.test(inf)) n.push("-gar: g→gu before e (preterite yo, all of the subjunctive)");
  if (/zar$/.test(inf)) n.push("-zar: z→c before e (preterite yo, all of the subjunctive)");
  if (isUir(inf)) n.push("-uir: y inserted before o/e/a (construyo, construya); preterite 3rd persons -yó/-yeron");
  if (!n.length) n.push("fully regular");
  return n;
}

function knownVerbs() { return Object.keys(R).sort(); }

window.CONJ = {
  conj: conj, gerund: gerund, participle: participle, imperative: imperative,
  notes: verbNotes, entry: entry, list: knownVerbs,
  PERSONS: PERSONS, TENSES: TENSES, stripReflex: stripReflex, accentLast: accentLast
};

/* ───────────────────────── error catalog ───────────────────────── */

var ERRORS = window.ERRORS = {
  W0001: { w: 1, t: "missing or wrong diacritics", x: "The answer is right except for accents (´), the diaeresis (ü) or ñ. Spanish accents are load-bearing: they mark stress (hablo ‘I speak’ vs habló ‘he spoke’ — a one-bit flag that flips the subject and the tense) and disambiguate homophones (si ‘if’ vs sí ‘yes’, el ‘the’ vs él ‘he’). The grader accepts the build with a warning; production Spanish will not. Tip: in this app type a` for á, n~ for ñ." },
  E0001: { t: "expression does not match expected output", x: "Your answer didn’t match any accepted form and no specific bug pattern was recognised. Compare against the expected output token by token — the caret marks the first point of divergence. Often the structure is fine and one lexical choice is off; check the note attached to the exercise." },
  E0101: { t: "gender mismatch", x: "An article or adjective disagrees with its noun’s gender. Gender is a static type: it belongs to the noun, not the thing. Most -o nouns are masculine and -a feminine, but the type system has famous exceptions: Greek-derived -ma words are masculine (el problema, el sistema, el programa, el idioma), and mano, foto, moto are feminine. día is masculine. Fix the modifier, not the noun." },
  E0102: { t: "number agreement failure", x: "Singular/plural must propagate through the whole noun phrase and to the verb. Spanish agreement is not optional: los coches rojos son caros carries the plural marker four times. If the subject is plural, the verb must be too — including gustar-type verbs, where the grammatical subject is the thing liked: me gustan los trenes." },
  E0201: { t: "ser/estar confusion", x: "Spanish has two ‘to be’ functions with different signatures. ser classifies: it asserts what something is (identity, profession, origin, material, time, possession, where an *event* takes place). estar reports state: how something is right now (condition, emotion, location of things/people, ongoing actions with the gerund). Many adjectives compile with both but change meaning: es aburrido ‘he’s boring’ / está aburrido ‘he’s bored’; es listo ‘clever’ / está listo ‘ready’." },
  E0301: { t: "aspect error: preterite vs imperfect", x: "Both are past tenses; they differ in aspect, not time. The preterite is an event: completed, bounded, advancing the story (ayer compilé el proyecto). The imperfect is background state: descriptions, habits, ongoing processes with no endpoint in view (cuando era niño, jugaba…). Ask: is this a log entry (preterite) or the state of the system while events happened (imperfect)? Time-bounded markers — ayer, anoche, en 2019, de repente — pin the preterite; habitual markers — siempre, todos los días, mientras — pin the imperfect." },
  E0302: { t: "wrong conjugation (person/number/form)", x: "The verb form doesn’t match its subject, or the stem/ending is malformed. Spanish encodes the subject in the ending — that’s why pronouns are usually dropped. Re-derive: find the stem, check for a stem change in the boot, check for an irregular first person, then attach the person ending. The conjugator page will show you the full derivation for any verb." },
  E0303: { t: "indicative used where the subjunctive is required", x: "The clause you wrote is inside a context that doesn’t assert it — a wish, doubt, emotion, purpose, or a not-yet-real event — so it must be evaluated in subjunctive mood. Pattern: [trigger expression] + que + [subjunctive]. quiero que vienes is a type error; the wanted event is unrealised: quiero que vengas. See man subjuntivo for the trigger table." },
  E0304: { t: "subjunctive used where the indicative is required", x: "The main clause asserts a fact, so the que-clause takes the indicative. creo que and es verdad que report belief/truth and take indicative; only their negations (no creo que, no es verdad que) push into subjunctive. Similarly cuando + a habitual/past event is indicative — only future-pending cuando takes subjunctive." },
  E0401: { t: "clitic pronoun order/placement error", x: "Object pronouns are proclitic on conjugated verbs (before: lo veo) and enclitic on infinitives, gerunds and affirmative commands (attached: verlo, viéndolo, ¡velo!). With two pronouns the order is fixed: indirect before direct (se lo doy, never *lo se doy). And le/les rewrites to se before lo/la/los/las — Spanish forbids two l-clitics in a row." },
  E0402: { t: "wrong object pronoun case", x: "lo/la/los/las are direct objects; le/les are indirect (to/for someone). If the verb hands something *to* a person, that person is le: le di el libro. If the person is what is seen/known/called, it’s lo/la: la vi ayer. gustar-type verbs always take le/les — the person is a receiver, not a subject." },
  E0501: { t: "por/para swap", x: "Both can translate ‘for’, but they point in opposite directions. para is a vector toward a goal: purpose, destination, deadline, recipient (un regalo para ti). por is the space you pass through or the cause behind you: through, along, in exchange for, because of, duration, per (gracias por tu ayuda, por la mañana). Ask: goal ahead (para) or cause/medium behind-around (por)?" },
  E0601: { t: "missing personal a", x: "When a direct object is a specific person (or a beloved pet), Spanish marks it with a: veo a María, busco a mi amigo. It is a case marker with no English equivalent — omitting it is a syntax error, adding it to things is one too (veo el coche, no a)." },
  E0701: { t: "gustar called with inverted arguments", x: "gustar means ‘to please’, not ‘to like’. The thing liked is the grammatical subject and the person is an indirect object: me gusta el café = ‘coffee pleases me’. So *yo gusto café* is calling the API backwards. The verb agrees with the thing: me gusta el libro / me gustan los libros. The whole family works this way: encantar, molestar, importar, doler, faltar…" },
  E0702: { t: "wrong preposition (verb valence)", x: "Spanish verbs bind specific prepositions that don’t match English: soñar con (dream *of*), depender de, casarse con, enamorarse de, pensar en, consistir en. These are part of the verb’s signature — learn verb+preposition as one unit." },
  E0801: { t: "wrong mood/form in a command", x: "Affirmative tú commands use the 3rd-person present (habla, come) plus eight irregulars (di, haz, ve, pon, sal, sé, ten, ven). Everything else — usted, ustedes, nosotros and *all negatives* — comes from the present subjunctive: no hables, no me lo digas. Pronouns attach to affirmatives (dímelo) but precede negatives (no me lo digas)." },
  E0901: { t: "wrong tense for a hypothetical", x: "Counterfactual conditions use the pattern si + imperfect subjunctive → conditional: si tuviera tiempo, viajaría. Using present indicative in both halves (si tengo…, viajo) states a real condition, not a hypothesis; using the conditional after si (*si tendría) is invalid Spanish, however natural it feels from English." }
};

/* ───────────────────────── grader ───────────────────────── */

function norm(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?¡¿;,]+$/g, "")
    .replace(/^[.!?¡¿;,]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

var GLOBAL_TRAPS = [
  { re: "\\b(yo )?gusto\\b", c: "E0701", m: "gustar takes the liker as an indirect object" },
  { re: "\\bla (problema|sistema|programa|idioma|mapa|día|tema|clima)\\b", c: "E0101", m: "this noun is masculine despite ending in -a" },
  { re: "\\bel (mano|foto|moto|gente)\\b", c: "E0101", m: "this noun is feminine despite its ending" },
  { re: "\\bsi \\w*ría\\b", c: "E0901", m: "the conditional never follows si — use the imperfect subjunctive" }
];

/* grade(input, ex) → {status: "pass"|"warn"|"fail", code, msg, note, expected, caretPos} */
function grade(input, ex) {
  var answers = [norm(ex.a)];
  (ex.alt || []).forEach(function (alt) {
    var na = norm(alt);
    // an alt that only differs from an accepted answer by diacritics is not a
    // separate answer — let it fall through to the W0001 warning path instead
    var dup = answers.some(function (a) { return deacc(a) === deacc(na) && a !== na; });
    if (!dup && answers.indexOf(na) < 0) answers.push(na);
  });
  var n = norm(input);
  if (!n && answers.indexOf("") < 0) return { status: "fail", code: "E0001", msg: "empty expression", expected: ex.a };
  if (answers.indexOf(n) >= 0) return { status: "pass", expected: ex.a };
  var dn = deacc(n);
  for (var i = 0; i < answers.length; i++) {
    if (deacc(answers[i]) === dn)
      return { status: "warn", code: "W0001", msg: ERRORS.W0001.t, expected: answers[i], got: n };
  }
  var traps = (ex.traps || []).concat(GLOBAL_TRAPS);
  for (i = 0; i < traps.length; i++) {
    var t = traps[i];
    try {
      if (new RegExp(t.re, "i").test(n) || new RegExp(t.re, "i").test(dn)) {
        return { status: "fail", code: t.c, msg: t.m || ERRORS[t.c].t, note: t.n, expected: ex.a, got: n };
      }
    } catch (err) { /* bad regex in content — ignore */ }
  }
  return { status: "fail", code: "E0001", msg: ERRORS.E0001.t, expected: ex.a, got: n };
}

/* First-divergence caret data: returns {pre, word, col} against expected. */
function diffPoint(got, expected) {
  var gw = norm(got).split(" "), ew = norm(expected).split(" ");
  var col = 0;
  for (var i = 0; i < Math.max(gw.length, ew.length); i++) {
    var g = gw[i] || "", e = ew[i] || "";
    if (deacc(g) !== deacc(e)) return { idx: i, col: col, got: g, exp: e };
    col += g.length + 1;
  }
  return null;
}

window.CHECK = { grade: grade, norm: norm, deacc: deacc, diffPoint: diffPoint, GLOBAL_TRAPS: GLOBAL_TRAPS };

/* ───────────────────────── drill generation ───────────────────────── */

/* spec: {t:"drill", verbs:[...], tense:"pret", persons?:[...], n?:5}
   → n exercise objects {t:"cz", drill:true, verb, tense, person, q, a} */
function expandDrill(spec, rng) {
  rng = rng || Math.random;
  var persons = spec.persons || [0, 1, 2, 3, 4, 5];
  var n = spec.n || 5, out = [], used = {};
  var tries = 0;
  while (out.length < n && tries++ < 200) {
    var verb = spec.verbs[Math.floor(rng() * spec.verbs.length)];
    var p = persons[Math.floor(rng() * persons.length)];
    var key = verb + ":" + p;
    if (used[key]) continue;
    used[key] = 1;
    out.push(makeDrillItem(verb, spec.tense, p));
  }
  return out;
}
function makeDrillItem(verb, tense, person) {
  var e = entry(verb);
  var forms = conj(verb, tense);
  return {
    t: "cz", drill: true, verb: verb, tense: tense, person: person,
    q: "conjugate  " + verb + (e.g ? "  ·  “" + e.g + "”" : ""),
    qmeta: PERSONS[person] + " · " + TENSES[tense].name,
    a: forms[person],
    srsKey: "d/" + verb + "/" + tense
  };
}
window.DRILL = { expand: expandDrill, item: makeDrillItem };

})();
