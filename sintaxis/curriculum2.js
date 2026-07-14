/* sintaxis curriculum — part 2/4: verbs.preterite, verbs.imperfect, verbs.async */

window.CURRICULUM.push({
  id: "pret", name: "verbs.preterite", title: "Event log",
  tagline: "The preterite records completed events: regular endings, orthographic patches, the strong-stem irregulars, and verbs whose meaning shifts in the past.",
  deps: ["pres"],
  lessons: [

  { id: "pret-1", title: "the preterite: committed transactions", doc: `
Spanish has two simple past tenses. This module covers the **preterite** (pretérito indefinido): the tense of *completed, bounded events* — things that happened, finished, and got committed to the log.

@ Ayer terminé el proyecto. | Yesterday I finished the project.
@ Anoche cenamos fuera. | Last night we ate out.
@ El deploy falló a las tres. | The deploy failed at three.

## Regular endings

| person | -ar (hablar) | -er/-ir (comer, vivir) |
| yo | habl~é~ | com~í~ |
| tú | habl~aste~ | com~iste~ |
| él/Ud. | habl~ó~ | com~ió~ |
| nosotros | habl~amos~ | com~imos~ |
| vosotros | habl~asteis~ | com~isteis~ |
| ellos/Uds. | habl~aron~ | com~ieron~ |

Three things to notice:

- **-er and -ir share one table** in the preterite. Less to learn.
- **The accents are load-bearing**: ~hablo~ (I speak) vs ~habló~ (he spoke) — one diacritic flips both person and tense. ~hable~ without the accent is a different form again (subjunctive). Type your accents.
- **-ar nosotros collides with the present**: ~hablamos~ = we speak *and* we spoke. Context (usually a time marker) disambiguates.

## Time markers that pin the preterite

~ayer~ · ~anoche~ · ~la semana pasada~ · ~el año pasado~ · ~en 2019~ · ~hace dos días~ (two days ago) · ~de repente~ (suddenly) · ~una vez~ — anything that draws a boundary around the event.

@ Hace dos años empecé a aprender español. | Two years ago I started learning Spanish.
@ La reunión duró tres horas. | The meeting lasted three hours. — bounded duration → preterite

! A duration with an endpoint is still an event: ~viví cinco años en Londres~ (I lived in London for five years — done, logged). The imperfect module will contrast this properly.
`,
  ex: [
    { t: "drill", verbs: ["hablar", "trabajar", "comer", "vivir", "escribir", "salir", "comprar", "vender"], tense: "pret", n: 6 },
    { t: "cz", q: "Anoche ___ (cenar, nosotros) en un restaurante peruano.", a: "cenamos", note: "-ar nosotros: same form as the present; anoche pins it to the past." },
    { t: "tr", q: "Yesterday I worked ten hours.", a: "ayer trabajé diez horas", alt: ["trabajé diez horas ayer", "ayer trabaje diez horas"], traps: [{ re: "\\btrabajaba\\b", c: "E0301", m: "a bounded, counted event takes the preterite", n: "Ten hours, yesterday, done: trabajé. trabajaba would paint background state." }] },
    { t: "mc", q: "hablo vs habló — the difference is:", o: ["Stylistic", "I speak (present) vs he/she spoke (preterite) — the accent flips person and tense", "Both are past"], i: 1, why: "One diacritic, two grammatical bits. This is why the grader flags missing accents: habló ≠ hablo." },
    { t: "cz", q: "¿A qué hora ___ (salir, tú) del trabajo ayer?", a: "saliste", note: "salir is regular in the preterite: saliste. (Its -go irregularity is present-only.)" },
    { t: "tr", q: "She wrote the report and sent it. (mandar)", a: "escribió el informe y lo mandó", alt: ["escribió el informe y lo envió", "escribio el informe y lo mando"], note: "Two committed events; the second reuses the pointer lo." },
    { t: "cz", q: "Mis padres ___ (vivir) veinte años en Aberdeen.", a: "vivieron", note: "A closed span (twenty years, over) is an event: vivieron." }
  ]},

  { id: "pret-2", title: "orthographic patches: -car, -gar, -zar and the -yó rule", doc: `
Some “irregular” preterites aren't irregular at all — they're **spelling patches** keeping pronunciation constant when the ending changes the following vowel. The sound is regular; only the bytes change.

## The yo patches: -car, -gar, -zar

The yo ending ~-é~ starts with e, and Spanish spelling changes c/g/z before e:

| infinitive | patch | yo form | why |
| buscar | c → qu | bus~qué~ | “busce” would soften the c |
| llegar | g → gu | lle~gué~ | “llegé” would soften the g |
| empezar | z → c | empe~cé~ | z doesn't precede e in native spelling |

Only the **yo** form is affected — ~buscaste, buscó…~ are untouched. Members you'll meet constantly: sacar, tocar, explicar, practicar; pagar, jugar, apagar, entregar; almorzar, cruzar, organizar, comenzar.

@ Llegué tarde y pagué el taxi. | I arrived late and paid for the taxi.
@ Empecé el curso en enero. | I started the course in January.

## The vowel-collision patch: -yó / -yeron

When an -er/-ir stem ends in a vowel, the endings ~-ió/-ieron~ would put three vowels in a row. The i hardens to y, and the remaining i-endings take accents:

| verb | forms |
| leer | leí, leíste, ~leyó~, leímos, leísteis, ~leyeron~ |
| oír | oí, oíste, ~oyó~, oímos, oísteis, ~oyeron~ |
| creer | creí… ~creyó, creyeron~ |
| construir | construí… ~construyó, construyeron~ (no accent on -uiste/-uimos) |

## The -ir stem-changer patch: third persons only

-ir boot verbs raise their vowel (e→i, o→u) in exactly the **third persons** of the preterite:

@ pedir → pidió, pidieron | (pedí, pediste, pedimos regular)
@ dormir → durmió, durmieron | (dormí, dormiste… regular)
@ preferir → prefirió, prefirieron | seguir → siguió, siguieron

! -ar and -er boot verbs do **not** stem-change in the preterite: ~pensé, pensó~; ~volví, volvió~. The boot is a present-tense phenomenon; only -ir verbs leak it into the preterite, and only in the third persons.
`,
  ex: [
    { t: "drill", verbs: ["buscar", "llegar", "empezar", "pagar", "sacar", "almorzar"], tense: "pret", persons: [0], n: 4 },
    { t: "cz", q: "Ayer ___ (leer, él) tu mensaje pero no contestó.", a: "leyó", note: "Vowel-final stem + -ió → -yó: leyó." },
    { t: "cz", q: "___ (empezar, yo) a estudiar a las siete.", a: "empecé", note: "z → c before é: empecé. Only the yo form patches." },
    { t: "mc", q: "Why busqué and not buscé?", o: ["buscar is irregular", "Spelling patch: c would soften before e, so it's rewritten qu to keep the /k/ sound", "Both are accepted"], i: 1, why: "Pure orthography. The pronunciation is the regular one; the spelling adjusts to preserve it. Same story for llegué and empecé." },
    { t: "cz", q: "Los niños ___ (dormir) diez horas.", a: "durmieron", note: "-ir stem-changer: o → u in the third persons of the preterite." },
    { t: "tr", q: "She asked for the bill and paid.", a: "pidió la cuenta y pagó", alt: ["ella pidió la cuenta y pagó", "pidio la cuenta y pago"], note: "pedir e→i in third person: pidió; pagar is regular here (the gu patch is yo-only: pagué)." },
    { t: "fix", q: "Ayer llegé al trabajo a las ocho.", bad: "llegé", a: "llegué", why: "-gar verbs patch g → gu before é: llegué. Without the u the g would soften to a j sound.", code: "E0302" },
    { t: "cz", q: "¿ ___ (oír, tú) las noticias ayer?", a: "oíste", note: "oír keeps regular endings with accents: oíste. Third persons take y: oyó, oyeron." }
  ]},

  { id: "pret-3", title: "strong preterites: the irregular stem + unstressed endings", doc: `
A closed set of very common verbs uses a completely different mechanism in the preterite: an **irregular stem** plus a special set of endings — and those endings are *unstressed*, so **no accents anywhere**.

## The endings (same for all strong preterites)

[[-e, -iste, -o, -imos, -isteis, -ieron]]

Note ~-e~ and ~-o~ without accents: ~tuve~ (not *tuvé), ~tuvo~ (not *tuvó). If you write an accent on a strong preterite, the compiler in your head should beep.

## The stem table — worth cold-caching

| verb | stem | yo | él |
| tener | tuv- | tuve | tuvo |
| estar | estuv- | estuve | estuvo |
| andar | anduv- | anduve | anduvo |
| poder | pud- | pude | pudo |
| poner | pus- | puse | puso |
| saber | sup- | supe | supo |
| caber | cup- | cupe | cupo |
| hacer | hic- | hice | ~hizo~ (c→z patch) |
| querer | quis- | quise | quiso |
| venir | vin- | vine | vino |
| haber | hub- | hube | hubo |

## The j-stems: 3rd plural drops the i

Stems ending in j take ~-eron~, not -ieron:

| decir | dij- | dije, dijiste, dijo… ~dijeron~ |
| traer | traj- | traje… ~trajeron~ |
| conducir, traducir, producir | -duj- | conduje… ~condujeron~ |

## The really irregular three

| ser & ir (identical!) | fui, fuiste, fue, fuimos, fuisteis, fueron |
| dar | di, diste, dio, dimos, disteis, dieron |
| ver | vi, viste, vio, vimos, visteis, vieron |

~ser~ and ~ir~ share one preterite — context disambiguates: ~fui ingeniero~ (I was…) vs ~fui a Madrid~ (I went…). ~dar/ver~ are so short they take the -er endings with no accents: ~dio, vio~.

@ Estuve en Valencia la semana pasada. | I was in Valencia last week.
@ No pude conectarme — hubo un problema con la VPN. | I couldn't connect — there was a problem with the VPN.
@ ¿Qué dijiste? | What did you say?
`,
  ex: [
    { t: "drill", verbs: ["tener", "estar", "poder", "poner", "hacer", "querer", "venir", "decir", "traer"], tense: "pret", n: 7 },
    { t: "cz", q: "Ayer no ___ (poder, yo) terminar — ___ (haber) un corte de luz.", a: "pude, hubo", alt: ["pude hubo"], note: "Strong stems pud- and hub-, no accents. hubo = existential preterite: there was." },
    { t: "fix", q: "Ayer estuvé en casa de mis padres.", bad: "estuvé", a: "estuve", why: "Strong preterites take unstressed endings — never an accent: estuve, estuvo.", code: "E0302" },
    { t: "mc", q: "fuimos al cine vs fuimos amigos — how can fuimos mean both went and were?", o: ["It can't", "ser and ir share the same preterite; context selects the verb", "It's a regional thing"], i: 1, why: "One of Spanish's genuine namespace collisions: ser and ir have identical preterites. fui a Madrid (ir) / fui feliz allí (ser)." },
    { t: "tr", q: "What did you (tú) say? I didn't hear you.", a: "¿qué dijiste? no te oí", alt: ["que dijiste no te oi", "¿qué has dicho? no te he oído"], note: "dij- j-stem; oír regular with accent: oí. te = you as direct object." },
    { t: "cz", q: "Mis amigos ___ (traer) vino y ___ (hacer, nosotros) una paella.", a: "trajeron, hicimos", alt: ["trajeron hicimos"], note: "j-stem: trajeron (no i). hicimos from hic-." },
    { t: "tr", q: "They gave me the keys and I went home.", a: "me dieron las llaves y fui a casa", alt: ["me dieron las llaves y me fui a casa"], note: "dar: dieron (no accent); ir: fui. me fui adds the leaving nuance — both accepted." },
    { t: "cz", q: "¿Quién ___ (poner) esto en producción un viernes?", a: "puso", note: "pus- + o, unaccented: puso. A question for the ages." }
  ]},

  { id: "pret-4", title: "preterite integration: narration in events", doc: `
Time to run event-log narration end to end. A story told purely in the preterite is a sequence of commits — each verb advances the timeline one step:

@ Me levanté, desayuné, cogí el tren y llegué a la oficina a las nueve. | I got up, had breakfast, caught the train and reached the office at nine.

## Sequencing vocabulary

~primero~ (first) · ~luego / después~ (then / afterwards) · ~más tarde~ (later) · ~al final~ (in the end) · ~de repente~ (suddenly) · ~en seguida~ (right away) · ~entonces~ (then/so)

@ Primero reproduje el bug, luego escribí un test y al final arreglé el código. | First I reproduced the bug, then wrote a test, and finally fixed the code.

## Reflexives and pointers ride along

Everything from earlier modules composes with the preterite unchanged: clitics still climb (~me duché~, ~se lo dije~, ~la encontré~).

@ Se lo expliqué dos veces. | I explained it to him twice.
@ ¿Te acostaste tarde? | Did you go to bed late?

## hace + time: the “ago” operator

[[hace + duration + que + preterite]] (or preterite + hace + duration) = ago:

@ Hace tres años que visité Sevilla. = Visité Sevilla hace tres años. | I visited Seville three years ago.

## Durations with boundaries

[[durante]] + span, or a bare span, with preterite = a completed stretch:

@ Trabajé allí durante cinco años. | I worked there for five years (and then stopped).
@ Estuvimos dos horas esperando. | We spent two hours waiting.
`,
  ex: [
    { t: "tr", q: "First I had breakfast, then I caught the train. (coger)", a: "primero desayuné y luego cogí el tren", alt: ["primero desayuné, luego cogí el tren", "primero desayune y luego cogi el tren"], note: "Pure event sequence → preterite throughout." },
    { t: "cz", q: "___ (ducharse, yo) y ___ (vestirse, yo) en diez minutos. (two verbs with pronouns)", a: "me duché, me vestí", alt: ["me duché me vestí", "me duche me vesti"], note: "Reflexive clitics unchanged in the preterite; vestirse's e→i patch is third-person only, so me vestí is regular." },
    { t: "tr", q: "I explained it (m) to her twice, but she didn't understand anything.", a: "se lo expliqué dos veces pero no entendió nada", alt: ["se lo expliqué dos veces, pero no entendió nada", "se lo explique dos veces pero no entendio nada"], traps: [{ re: "\\ble lo\\b", c: "E0401", m: "l-l sequence must rewrite to se lo", n: "le + lo → se lo, in every tense." }] },
    { t: "cz", q: "Vi esa película ___ dos años. (two years ago)", a: "hace", note: "hace + duration = ago: hace dos años." },
    { t: "tr", q: "We were in the office for twelve hours. (estar)", a: "estuvimos doce horas en la oficina", alt: ["estuvimos en la oficina doce horas", "estuvimos en la oficina durante doce horas", "estuvimos durante doce horas en la oficina"], note: "A bounded stretch is an event: estuvimos (strong stem, no accent)." },
    { t: "cz", q: "De repente el sistema ___ (caer + se) y ___ (perder, nosotros) los datos.", a: "se cayó, perdimos", alt: ["se cayó perdimos", "se cayo perdimos"], note: "caerse in the third person: se cayó (vowel-collision y). de repente is a classic preterite trigger." },
    { t: "tr", q: "Last night I read your email and answered right away. (contestar, en seguida)", a: "anoche leí tu correo y contesté en seguida", alt: ["anoche leí tu email y contesté en seguida", "anoche lei tu correo y conteste en seguida", "anoche leí tu correo y contesté enseguida"], note: "leí with accent; two committed events in sequence." }
  ]},

  { id: "pret-5", title: "verbs that change meaning in the preterite", doc: `
A few state verbs, when forced into the preterite's “bounded event” box, shift their translation. Nothing mystical: the preterite marks the **entry point into the state**, and English happens to use a different verb for that moment.

| verb | imperfect (state) | preterite (state-entry event) |
| saber | sabía — I knew | ~supe~ — I found out |
| conocer | conocía — I knew (person) | ~conocí~ — I met (first time) |
| poder | podía — I was able (context) | ~pude~ — I managed to |
| no poder | no podía — I couldn't (ongoing) | ~no pude~ — I tried and failed |
| querer | quería — I wanted | ~quise~ — I tried to |
| no querer | no quería — I didn't want | ~no quise~ — I refused |
| tener | tenía — I had | ~tuve~ — I got/received |
| tener que | tenía que — I was supposed to | ~tuve que~ — I had to (and did) |

@ Supe la verdad ayer. | I found out the truth yesterday. — the moment knowledge began
@ Conocí a mi mujer en Berlín. | I met my wife in Berlin.
@ No quiso firmar. | He refused to sign. — a completed act of not-wanting
@ Tuve que reiniciar el servidor. | I had to restart the server (and did).

## Think of it as entering the state

~sabía~ is the state “knowing” sampled mid-flight; ~supe~ is the log entry for the transition into it. Once you read the preterite as *event*, these translations stop being special cases.

@ Quise abrir el archivo, pero no pude. | I tried to open the file, but couldn't (failed).

! This lesson leans on intuition the next module makes rigorous. If some of these feel like they need the “other past tense”, good — that instinct is exactly what verbs.imperfect trains.
`,
  ex: [
    { t: "mc", q: "Ayer supe que el proyecto se cancela means:", o: ["Yesterday I knew the project is cancelled", "Yesterday I found out the project is being cancelled", "Yesterday I doubted it"], i: 1, why: "Preterite saber = the moment knowledge began: I found out." },
    { t: "cz", q: "___ (conocer, yo) a mi mejor amigo en la universidad.", a: "conocí", note: "First meeting = state-entry event: conocí = I met." },
    { t: "tr", q: "He refused to pay.", a: "no quiso pagar", alt: ["se negó a pagar"], traps: [{ re: "\\bno quería pagar\\b", c: "E0301", m: "refusal-as-event takes the preterite", n: "no quería = didn't feel like (state); no quiso = refused (a completed act)." }] },
    { t: "cz", q: "___ (querer, yo) llamarte, pero no ___ (poder, yo).", a: "quise, pude", alt: ["quise pude"], note: "quise = I tried to; no pude = I failed to. Both events." },
    { t: "mc", q: "tuve que reiniciar vs tenía que reiniciar:", o: ["Same meaning", "tuve que = I had to and did; tenía que = I was supposed to (did I? unsaid)", "tenía que is more polite"], i: 1, why: "Preterite closes the event — the restart happened. Imperfect leaves the obligation hanging as background state." },
    { t: "tr", q: "I met your sister at the party and found out you (tú) live here.", a: "conocí a tu hermana en la fiesta y supe que vives aquí", alt: ["en la fiesta conocí a tu hermana y supe que vives aquí", "conoci a tu hermana en la fiesta y supe que vives aqui"], note: "Two state-entry events: conocí (met), supe (found out). Personal a on tu hermana." },
    { t: "cz", q: "Por fin ___ (poder, ellos) reproducir el bug.", a: "pudieron", note: "por fin (finally) marks the breakthrough event: pudieron = they managed to." }
  ]}
]});

window.CURRICULUM.push({
  id: "impf", name: "verbs.imperfect", title: "Background processes",
  tagline: "The imperfect paints state and habit; the preterite logs events. Aspect — the distinction English hides — made explicit and drilled hard.",
  deps: ["pret"],
  lessons: [

  { id: "impf-1", title: "the imperfect: state sampled mid-flight", doc: `
The **imperfecto** is the other past tense: unbounded, in-progress, habitual. Where the preterite commits events, the imperfect describes what the world *was like* — no start, no end in view.

@ Cuando era niño, vivíamos cerca del mar. | When I was a child, we lived near the sea.
@ Llovía y hacía frío. | It was raining and cold.
@ Antes trabajaba en una startup. | I used to work at a startup.

## Formation — the easiest table in Spanish

| person | -ar (hablar) | -er/-ir (comer, vivir) |
| yo | habl~aba~ | com~ía~ |
| tú | habl~abas~ | com~ías~ |
| él/Ud. | habl~aba~ | com~ía~ |
| nosotros | habl~ábamos~ | com~íamos~ |
| vosotros | habl~abais~ | com~íais~ |
| ellos/Uds. | habl~aban~ | com~ían~ |

**No stem changes, no -go verbs, nothing**: ~pensaba, podía, tenía, hacía, decía~ — all regular. Exactly **three** verbs are irregular:

| ser | era, eras, era, éramos, erais, eran |
| ir | iba, ibas, iba, íbamos, ibais, iban |
| ver | veía, veías, veía, veíamos, veíais, veían |

! yo and él share a form (~hablaba~, ~podía~) — add the pronoun when ambiguous: ~yo podía~.

## The three English translations

~trabajaba~ maps to three English renderings, chosen by context:

- **used to work** — habit: ~antes trabajaba los sábados~
- **was working** — in progress: ~trabajaba cuando llamaste~
- **worked** — plain description: ~de niño trabajaba en la granja~

That last one is the trap: English *worked* can be either tense, so you can't translate word-by-word — you must decide *aspect* first. That decision is the whole next lesson.
`,
  ex: [
    { t: "drill", verbs: ["hablar", "vivir", "tener", "hacer", "poder", "querer"], tense: "impf", n: 5 },
    { t: "drill", verbs: ["ser", "ir", "ver"], tense: "impf", n: 4 },
    { t: "cz", q: "Cuando ___ (ser, yo) estudiante, no ___ (tener, yo) dinero.", a: "era, tenía", alt: ["era tenía", "era tenia"], note: "Both are background description: era (irregular), tenía (regular — no stem tricks in the imperfect)." },
    { t: "tr", q: "We used to live in Glasgow.", a: "vivíamos en glasgow", alt: ["antes vivíamos en glasgow", "viviamos en glasgow"], note: "Habit/state in the past → imperfect: vivíamos." },
    { t: "mc", q: "How many irregular verbs does the imperfect have?", o: ["About twenty", "Three: ser, ir, ver", "None"], i: 1, why: "era / iba / veía. Everything else — tener, hacer, poder, decir — is perfectly regular: tenía, hacía, podía, decía." },
    { t: "cz", q: "Mi abuelo siempre ___ (ir) andando al trabajo.", a: "iba", note: "siempre + habit → imperfect; ir is one of the three irregulars: iba." },
    { t: "tr", q: "It was raining and the office was empty.", a: "llovía y la oficina estaba vacía", alt: ["llovia y la oficina estaba vacia", "estaba lloviendo y la oficina estaba vacía"], note: "Scene-setting: weather and states in the imperfect. llover o→ue applies only in the present (llueve) — imperfect is regular: llovía." }
  ]},

  { id: "impf-2", title: "aspect: events vs state — the core distinction", doc: `
Here is the model that makes every preterite/imperfect choice computable. A past narrative has two layers:

- **The event log** — things that *happened*, advancing the story pointer. Bounded. → **preterite**
- **The background state** — what the world was like while events happened. Unbounded, sampled mid-flight. → **imperfect**

@ ~Llovía~ cuando ~salí~ de casa. | It was raining (state) when I left (event).
@ Mientras ~compilaba~ el proyecto, ~se fue~ la luz. | While the project was compiling (state), the power went (event).
@ ~Era~ tarde, ~estaba~ cansado, así que ~me fui~. | It was late, I was tired (scene), so I left (event).

The question to ask is never “how long did it last?” — it's **“am I logging an occurrence, or describing the state of the system?”**

## The interrupt pattern

The classic combined sentence: imperfect paints the ongoing process, preterite fires the interrupt:

@ Dormía cuando sonó el teléfono. | I was sleeping when the phone rang.
@ Veía la tele cuando llegaste. | I was watching TV when you arrived.

## Marker heuristics (useful, not infallible)

| leans preterite | leans imperfect |
| ayer, anoche, de repente | siempre, a menudo, cada día |
| una vez, dos veces | todos los veranos, de niño |
| en 2019, el martes, a las tres | mientras, normalmente, antes |
| hasta que, en ese momento | de pequeño, en aquella época |

## Same fact, both tenses, different claims

Both of these compile — they just assert different things:

@ Ayer estuve enfermo. | Yesterday I was ill — the whole bounded day, now over. (event framing)
@ Estaba enfermo, por eso no fui. | I was ill (state), that's why I didn't go (event).

! When both parse, prefer the meaning you intend, not a “correct answer”. The exercises below always give enough context to force one reading.
`,
  ex: [
    { t: "cz", q: "___ (leer, yo) tranquilamente cuando ___ (sonar) la alarma.", a: "leía, sonó", alt: ["leía sonó", "leia sono"], note: "Ongoing process (leía) interrupted by an event (sonó). The interrupt pattern." },
    { t: "mc", q: "De niño jugaba al ajedrez — why imperfect?", o: ["Chess games are long", "Habitual/repeated activity as background: used to play", "jugar is irregular"], i: 1, why: "de niño frames a habit — background state, no boundaries → imperfect." },
    { t: "tr", q: "While I was working, the tests failed. (mientras)", a: "mientras trabajaba fallaron los tests", alt: ["mientras trabajaba, fallaron los tests", "mientras trabajaba los tests fallaron", "mientras trabajaba, los tests fallaron", "mientras yo trabajaba fallaron los tests"], note: "mientras + background (trabajaba); the failure is the logged event (fallaron)." },
    { t: "cz", q: "Anoche ___ (ver, yo) una película y luego ___ (acostarse, yo).", a: "vi, me acosté", alt: ["vi me acosté", "vi me acoste"], note: "Two sequenced events, both committed: vi, me acosté. anoche + luego = event log." },
    { t: "fix", q: "Cuando llegué a casa, mi mujer cocinó.", bad: "cocinó", a: "cocinaba", why: "Almost certainly you mean she WAS cooking when you arrived — ongoing background → cocinaba. cocinó would mean she started cooking upon your arrival (a following event).", code: "E0301" },
    { t: "mc", q: "Ayer estuve enfermo vs estaba enfermo cuando llamaste:", o: ["First is wrong", "First frames the whole bounded day as an event; second samples the state at call time", "They're identical"], i: 1, why: "Both are correct Spanish making different claims. Aspect is a choice you make, not a fact about the world." },
    { t: "tr", q: "It was late and there was nobody in the office.", a: "era tarde y no había nadie en la oficina", alt: ["era tarde y no habia nadie en la oficina"], note: "Pure scene description → both imperfect: era, había." },
    { t: "cz", q: "Siempre ___ (comer, nosotros) a las dos, pero ese día ___ (comer, nosotros) a las cuatro.", a: "comíamos, comimos", alt: ["comíamos comimos", "comiamos comimos"], note: "siempre = habit → imperfect; ese día = the specific occasion → preterite. The same verb, both aspects, one sentence." }
  ]},

  { id: "impf-3", title: "the scene-setting toolkit: time, age, weather, description", doc: `
Certain categories of past information are *almost always* background — they describe the state of the world rather than log occurrences. These default to the imperfect:

## Clock time and dates in the past

@ Eran las once cuando terminamos. | It was eleven when we finished.
@ Era lunes por la mañana. | It was Monday morning.

## Age

@ Cuando tenía veinte años, quería ser físico. | When I was twenty, I wanted to be a physicist.

## Weather and ambience

@ Hacía calor y no funcionaba el aire. | It was hot and the air-con wasn't working.
@ Había mucha gente en la calle. | There were lots of people in the street.

## Physical & emotional description

@ Mi abuela era alta y tenía el pelo blanco. | My grandmother was tall and had white hair.
@ Estaba nervioso antes de la entrevista. | I was nervous before the interview.

## Two verbs at once: the past progressive

For extra in-progress emphasis, the imperfect of estar + gerund:

@ Estaba escribiendo el informe cuando se fue la red. | I was (right in the middle of) writing the report when the network went down.

Plain ~escribía~ says the same thing with less zoom; ~estaba escribiendo~ is the high-magnification version. Both are imperfect machinery.

## acabar de & estar a punto de — in the past

@ Acababa de llegar cuando empezó la reunión. | I had just arrived when the meeting started.
@ Estaba a punto de salir cuando sonó el teléfono. | I was about to leave when the phone rang.

Both idioms live in the imperfect because they describe the state you were in (just-arrived-ness, about-to-leave-ness) when the event fired.

! ~hubo~ vs ~había~: the existential follows the same aspect logic. ~Había un problema~ describes the situation; ~hubo un apagón~ logs the incident.
`,
  ex: [
    { t: "cz", q: "___ (ser) las tres de la mañana cuando por fin ___ (funcionar) el deploy.", a: "eran, funcionó", alt: ["eran funcionó", "eran funciono"], note: "Clock time in the past → eran (imperfect, plural after one o'clock); the breakthrough → event." },
    { t: "tr", q: "When I was ten, we lived in the north.", a: "cuando tenía diez años vivíamos en el norte", alt: ["cuando tenía diez años, vivíamos en el norte", "cuando tenia diez años viviamos en el norte"], note: "Age (tenía) and residence-as-state (vivíamos): background, both imperfect." },
    { t: "cz", q: "___ (hacer) un frío horrible y ___ (haber) hielo en la carretera.", a: "hacía, había", alt: ["hacía había", "hacia habia"], note: "Weather + existential description: both imperfect." },
    { t: "tr", q: "I was about to leave when the boss called me.", a: "estaba a punto de salir cuando me llamó el jefe", alt: ["estaba a punto de salir cuando el jefe me llamó", "estaba a punto de irme cuando me llamó el jefe"], note: "estar a punto de in imperfect (state) + interrupt in preterite." },
    { t: "mc", q: "escribía vs estaba escribiendo:", o: ["Different tenses", "Same aspect; estar + gerund just zooms in on the in-progress-ness", "Only the second is past"], i: 1, why: "Both are imperfective. The progressive is optional emphasis, unlike English where “was writing” is obligatory." },
    { t: "cz", q: "___ (acabar, yo) de sentarme cuando ___ (empezar) los fuegos artificiales.", a: "acababa, empezaron", alt: ["acababa empezaron"], note: "acababa de + infinitive = had just — imperfect state; the fireworks are the event." },
    { t: "tr", q: "The flat was small but it had a lot of light.", a: "el piso era pequeño pero tenía mucha luz", alt: ["el piso era pequeño, pero tenía mucha luz", "el apartamento era pequeño pero tenía mucha luz"], note: "Pure description: era + tenía. Note piso = flat in Spain." }
  ]},

  { id: "impf-4", title: "narration: weaving the two layers", doc: `
Real storytelling interleaves the layers constantly. The skeleton of any anecdote:

1. **Scene** (imperfect): when it was, where you were, how things felt.
2. **Events** (preterite): what happened, in order.
3. **State injected mid-story** (imperfect): why, how, background at each step.

Study the layers here:

@ ~Era~ viernes por la tarde y ~estábamos~ todos cansados. | scene
@ De repente ~saltó~ la alarma del CI. | event
@ El test que ~fallaba~ ~era~ uno que nunca ~fallaba~. | state (that's why it was weird)
@ ~Miré~ el diff, ~encontré~ el error y lo ~arreglé~ en cinco minutos. | events
@ ~Eran~ las ocho cuando por fin ~salimos~. | state + closing event

## cuando: the aspect hinge

[[cuando]] joins the layers and the tenses tell you the geometry:

- imperfect + preterite → interrupt: ~Dormía cuando llamaste.~
- preterite + preterite → sequence: ~Cuando llegué, empezamos.~ (I arrived, then we started)
- imperfect + imperfect → parallel states: ~Cuando era joven, leía mucho.~

## porque explains with state

Reasons are usually background: ~No fui **porque estaba** enfermo~ (event + state-reason). ~porque estuve~ would frame the illness itself as a closed event — possible, but a different claim.

! Weakness to watch: English narrative past (“I looked, the test was failing, it was one that never failed”) hides the aspect switches. When translating, tag each verb E(vent) or S(tate) *before* conjugating. The fix exercises below are built to catch exactly this.
`,
  ex: [
    { t: "cz", q: "Cuando ___ (llegar, yo) a la estación, el tren ya no ___ (estar).", a: "llegué, estaba", alt: ["llegué estaba", "llegue estaba"], note: "Arrival = event; the train's absence = the state I found. Layer switch mid-sentence." },
    { t: "tr", q: "I didn't go to the party because I was ill.", a: "no fui a la fiesta porque estaba enfermo", alt: ["no fui a la fiesta porque estaba enferma", "no fui a la fiesta porque estaba malo"], note: "Event (no fui) + state-reason (estaba enfermo)." },
    { t: "fix", q: "Anoche vi una película que fue muy larga.", bad: "fue", a: "era", why: "The film's length is a property of the film — background description while the event (vi) happened: una película que era muy larga. fue would log the film as a completed happening.", code: "E0301" },
    { t: "cz", q: "Mientras mi compañero ___ (revisar) el código, yo ___ (escribir) los tests. (parallel work all afternoon)", a: "revisaba, escribía", alt: ["revisaba escribía", "revisaba escribia"], note: "Two parallel ongoing activities — both imperfect, joined by mientras." },
    { t: "tr", q: "It was Sunday, I was reading, and suddenly the lights went out. (irse la luz)", a: "era domingo estaba leyendo y de repente se fue la luz", alt: ["era domingo, estaba leyendo y de repente se fue la luz", "era domingo, leía y de repente se fue la luz", "era domingo leía y de repente se fue la luz"], note: "Scene (era, estaba leyendo/leía) + interrupt (se fue). de repente is your preterite klaxon." },
    { t: "mc", q: "Cuando llegué, empezamos means:", o: ["When I was arriving, we were starting", "I arrived and then we started (sequence)", "We started before I arrived"], i: 1, why: "preterite + preterite across cuando = one event after another. The imperfect version (cuando llegaba…) would overlap them." },
    { t: "tr", q: "Nobody knew why the server was slow.", a: "nadie sabía por qué el servidor iba lento", alt: ["nadie sabía por qué el servidor era lento", "nadie sabía por qué el servidor estaba lento", "nadie sabia por que el servidor iba lento"], note: "Ongoing states throughout: sabía (knowing), iba/estaba lento (being slow). No events logged here." },
    { t: "cz", q: "Todos los veranos ___ (ir, nosotros) a la playa, pero ese año ___ (quedarse, nosotros) en casa.", a: "íbamos, nos quedamos", alt: ["íbamos nos quedamos", "ibamos nos quedamos"], note: "Habit (íbamos) vs the one deviating occasion (nos quedamos) — the classic pairing." }
  ]},

  { id: "impf-5", title: "aspect final boss: mixed translation suite", doc: `
No new grammar — this lesson is a pure integration test of the module. The method, one more time:

1. Read the English sentence.
2. Tag each verb: **E**vent (bounded, advances the story) or **S**tate (background, habit, description).
3. E → preterite, S → imperfect. *Then* conjugate.

Worked example: “I was walking (S) to the station when I saw (E) an old friend. He looked (S) tired. We talked (E) for an hour.”

@ Caminaba a la estación cuando vi a un viejo amigo. Parecía cansado. Hablamos una hora. | S-E-S-E: caminaba, vi, parecía, hablamos.

Note that last one: *“we talked for an hour”* is bounded (an hour, then it ended) → preterite despite being long. **Duration doesn't matter; boundedness does.**

## Traps this suite sets for you

- Long-but-bounded spans (→ preterite): ~vivió allí veinte años~
- English “would” meaning *used to* (→ imperfect): ~every summer we would rent a house~ = ~alquilábamos~
- English simple past hiding states: ~the coffee was cold~ = ~estaba~ (found state)
- Meaning-shift verbs from pret-5: ~knew~ = sabía, ~found out~ = supe

! Score honestly: this suite is deliberately the hardest so far. Every item you miss becomes a scheduled review — that's the point of the build queue.
`,
  ex: [
    { t: "tr", q: "We talked for two hours.", a: "hablamos dos horas", alt: ["hablamos durante dos horas", "estuvimos hablando dos horas"], traps: [{ re: "\\bhablábamos\\b", c: "E0301", m: "bounded duration = event", n: "Two hours, then it ended. Duration doesn't select the imperfect — unboundedness does. hablamos." }] },
    { t: "tr", q: "Every summer we would rent a house by the sea. (alquilar)", a: "todos los veranos alquilábamos una casa junto al mar", alt: ["cada verano alquilábamos una casa junto al mar", "todos los veranos alquilábamos una casa al lado del mar", "todos los veranos alquilabamos una casa junto al mar"], traps: [{ re: "alquilaríamos", c: "E0301", m: "English habitual would = imperfect, not conditional", n: "“would rent” here means “used to rent”: alquilábamos." }] },
    { t: "cz", q: "La casa donde ___ (vivir, ellos) ___ (ser) enorme.", a: "vivían, era", alt: ["vivían era", "vivian era"], note: "Both background: where they lived + what it was like." },
    { t: "tr", q: "I knew the answer because I had seen the code. (use pluperfect había visto)", a: "sabía la respuesta porque había visto el código", alt: ["sabia la respuesta porque habia visto el codigo", "me sabía la respuesta porque había visto el código"], note: "knew = ongoing knowledge → sabía. The pluperfect (había visto) is previewed here; it's formalised in verbs.async." },
    { t: "cz", q: "Ayer ___ (conocer, yo) al nuevo jefe. Me ___ (parecer) muy majo.", a: "conocí, pareció", alt: ["conocí pareció", "conoci parecio"], note: "conocí = met (state-entry event). pareció frames the impression as a completed take from that meeting; parecía (accepted in speech) would paint it as background — the bounded reading fits ayer better." },
    { t: "tr", q: "The demo was going well until the wifi died. (ir bien, morir)", a: "la demo iba bien hasta que murió el wifi", alt: ["la demo iba bien hasta que se murió el wifi", "la demo iba bien hasta que el wifi murió"], note: "Ongoing state (iba bien) terminated by an event (murió) — hasta que is the boundary marker." },
    { t: "tr", q: "She lived in Japan for ten years and then moved to Spain. (mudarse)", a: "vivió diez años en japón y luego se mudó a españa", alt: ["vivió en japón diez años y luego se mudó a españa", "vivio diez años en japon y luego se mudo a españa"], traps: [{ re: "\\bvivía diez años\\b", c: "E0301", m: "a closed span is an event", n: "Ten years with an endpoint and a next chapter: vivió. vivía would leave the span open." }] },
    { t: "cz", q: "No ___ (saber, yo) que ___ (ser, tú) escocés. (I didn't know you were Scottish)", a: "sabía, eras", alt: ["sabía eras", "sabia eras"], note: "Both states: my not-knowing and your being Scottish. No events logged anywhere — double imperfect." }
  ]}
]});

window.CURRICULUM.push({
  id: "fut", name: "verbs.async", title: "Scheduled jobs",
  tagline: "Futures and promises: ir a + infinitive, the future and conditional tenses, epistemic speculation, and the perfect tenses with haber.",
  deps: ["pret"],
  lessons: [

  { id: "fut-1", title: "ir a + infinitive: the everyday future", doc: `
Spoken Spanish schedules most future work with [[ir a + infinitive]] — exactly like English *going to*:

@ Voy a escribir los tests mañana. | I'm going to write the tests tomorrow.
@ ¿Qué vas a hacer este finde? | What are you doing this weekend?
@ Van a lanzar la versión nueva el lunes. | They're launching the new version on Monday.

Conjugate ~ir~, add ~a~, append the infinitive. Clitics climb or attach as usual: ~lo voy a leer~ = ~voy a leerlo~.

## The bare present as near-future

For scheduled/decided things, plain present + time marker is completely natural (more so than in English):

@ Mañana trabajo desde casa. | Tomorrow I'm working from home.
@ El tren sale a las ocho. | The train leaves at eight.
@ ¿Nos vemos el jueves? | Shall we meet Thursday?

## Useful scheduling vocabulary

~mañana~ · ~pasado mañana~ (day after tomorrow) · ~la semana que viene / la próxima semana~ · ~el mes que viene~ · ~dentro de dos días~ (in two days' time) · ~luego~ (later) · ~ahora mismo~ (right now)

! ~dentro de~ for “in + duration” pointing forward: ~dentro de una hora~ = an hour from now. English speakers reach for ~en una hora~, which Spanish also allows, but dentro de is unambiguous.

## quedar: the meeting-arrangement verb

Spain arranges meetups with [[quedar]]: ~¿Quedamos a las nueve?~ (shall we meet at nine?), ~he quedado con Ana~ (I've arranged to meet Ana). Absurdly common; no clean English equivalent.
`,
  ex: [
    { t: "cz", q: "___ ___ ___ (ir a, yo + empezar) el nuevo proyecto el lunes. (three words)", a: "voy a empezar", note: "Conjugated ir + a + infinitive." },
    { t: "tr", q: "What are you (tú) going to do tomorrow?", a: "¿qué vas a hacer mañana?", alt: ["que vas a hacer mañana", "qué vas a hacer mañana"], note: "The everyday future: vas a hacer." },
    { t: "tr", q: "I'm going to send it (m) to you (tú) in an hour.", a: "te lo voy a mandar dentro de una hora", alt: ["voy a mandártelo dentro de una hora", "te lo voy a mandar en una hora", "voy a mandartelo en una hora", "te lo voy a enviar dentro de una hora"], note: "Clitics climb (te lo voy a mandar) or attach (voy a mandártelo); dentro de = in (forward-pointing)." },
    { t: "cz", q: "El vuelo ___ (salir) a las seis de la mañana. (scheduled — bare present)", a: "sale", note: "Timetabled events take plain present: el vuelo sale a las seis." },
    { t: "mc", q: "¿Quedamos el jueves? means:", o: ["Are we staying Thursday?", "Shall we meet up on Thursday?", "Is Thursday left?"], i: 1, why: "quedar = arrange to meet, the standard Spain way to make plans. quedarse = to stay; me queda = I have left — three different APIs on one verb." },
    { t: "tr", q: "They're going to release the new version next week.", a: "van a lanzar la nueva versión la semana que viene", alt: ["van a lanzar la versión nueva la semana que viene", "van a lanzar la nueva versión la próxima semana", "van a publicar la nueva versión la semana que viene"], note: "la semana que viene — the everyday “next week”." },
    { t: "cz", q: "Ahora no puedo — te llamo ___ . (later)", a: "luego", alt: ["después", "mas tarde", "más tarde"], note: "te llamo luego: bare present standing in for the future, totally idiomatic." }
  ]},

  { id: "fut-2", title: "the future tense: infinitive + endings, twelve odd stems", doc: `
The morphological future bolts endings straight onto the **infinitive** — one set for all three classes, all accented:

| person | ending | hablar |
| yo | -é | hablar~é~ |
| tú | -ás | hablar~ás~ |
| él/Ud. | -á | hablar~á~ |
| nosotros | -emos | hablar~emos~ |
| vosotros | -éis | hablar~éis~ |
| ellos/Uds. | -án | hablar~án~ |

(Historically hablar + he, hablar + has — the future is literally “I have to speak” fused into one word.)

## The twelve irregular stems

A dozen verbs compress the infinitive. Same endings, squashed stem — and these stems are shared with the conditional, so you learn them once:

| verb | stem | yo |
| tener | tendr- | tendré |
| poner | pondr- | pondré |
| venir | vendr- | vendré |
| salir | saldr- | saldré |
| valer | valdr- | valdré |
| poder | podr- | podré |
| saber | sabr- | sabré |
| querer | querr- | querré |
| caber | cabr- | cabré |
| haber | habr- | habré |
| hacer | har- | haré |
| decir | dir- | diré |

@ Te diré algo mañana. | I'll tell you something tomorrow.
@ ¿Podrás venir? | Will you be able to come?
@ Habrá tiempo después. | There'll be time afterwards.

## Register: when to use which future

~ir a~ = plans and intentions (spoken default). Morphological future = predictions, promises, resolutions, formal prose:

@ Mañana lloverá en el norte. | Tomorrow it will rain in the north. — forecast
@ No volverá a pasar. | It won't happen again. — promise
@ Voy a arreglarlo esta tarde. | I'm going to fix it this afternoon. — plan

Mixing them up is never wrong, just slightly off-register — like saying “shall” at a stand-up.
`,
  ex: [
    { t: "drill", verbs: ["hablar", "ser", "ir", "tener", "hacer", "poder", "decir", "salir", "venir"], tense: "fut", n: 6 },
    { t: "cz", q: "Mañana ___ (saber, nosotros) los resultados.", a: "sabremos", note: "sabr- + -emos. The strong preterite was sup-; the future stem is sabr-. Different stems, keep them apart." },
    { t: "tr", q: "I'll tell you (tú) the truth.", a: "te diré la verdad", alt: ["te dire la verdad"], note: "dir- + é. Promise → morphological future fits perfectly." },
    { t: "fix", q: "El año que viene tenería más tiempo.", bad: "tenería", a: "tendré", why: "Two bugs in one token: the irregular stem is tendr-, and next year needs the future (tendré), not the conditional. tener never yields *tenería in any tense.", code: "E0302" },
    { t: "cz", q: "¿A qué hora ___ (venir, vosotros) el sábado?", a: "vendréis", note: "vendr- + -éis." },
    { t: "mc", q: "Which is the natural way to state a plan you just made — “I'm going to have a coffee”?", o: ["Tomaré un café", "Voy a tomar un café", "Tomo un café"], i: 1, why: "Intentions/plans default to ir a in speech: voy a tomar un café. tomaré leans formal/promissory; tomo works for immediate offers." },
    { t: "cz", q: "___ (haber) una nueva versión el mes que viene. (there will be)", a: "habrá", note: "The existential future: habrá, always third-person singular." },
    { t: "tr", q: "We'll do it next week — it won't be difficult.", a: "lo haremos la semana que viene no será difícil", alt: ["lo haremos la semana que viene, no será difícil", "lo haremos la próxima semana no será difícil", "lo haremos la semana que viene y no será difícil"], note: "har- + -emos; ser regular in the future: será." }
  ]},

  { id: "fut-3", title: "the conditional: what would run", doc: `
The **conditional** is the future's twin: same twelve irregular stems, endings ~-ía, -ías, -ía, -íamos, -íais, -ían~ bolted onto the infinitive:

@ hablar → hablaría | I would speak
@ hacer → haría | I would do
@ poder → podría | I could / would be able
@ tener → tendría | I would have

## Job 1: hypotheticals

What would happen under other conditions:

@ Yo no usaría esa librería. | I wouldn't use that library.
@ Sería más rápido en Rust. | It would be faster in Rust.
@ Con más RAM, el problema desaparecería. | With more RAM, the problem would disappear.

(The full machine — si + subjunctive → conditional — arrives in mood.subjunctive2. For now, standalone hypotheticals.)

## Job 2: politeness — the professional register

The conditional softens requests the way “could you / would you” does. This is the single most useful register tool for the workplace:

@ ¿Podrías revisar mi PR? | Could you review my PR?
@ Me gustaría comentar una cosa. | I'd like to raise something.
@ ¿Te importaría esperar un momento? | Would you mind waiting a moment?
@ Deberías descansar. | You should rest. (deber in conditional = advice)

## Job 3: future-in-the-past

Reporting what was future from a past vantage point:

@ Dijo que llegaría a las diez. | She said she'd arrive at ten.
@ Sabía que el test fallaría. | I knew the test would fail.

!! Reminder from the error catalog: English *would* is three-ways ambiguous. Habitual past “we would rent a house every summer” is the **imperfect** (~alquilábamos~), not the conditional. Refusal “the car wouldn't start” is ~no quería arrancar / no arrancó~. Only genuine hypothesis/politeness/future-in-the-past take -ría.
`,
  ex: [
    { t: "drill", verbs: ["hablar", "hacer", "poder", "tener", "ser", "decir", "querer"], tense: "cond", n: 5 },
    { t: "tr", q: "Could you (tú) help me with this bug?", a: "¿podrías ayudarme con este bug?", alt: ["podrías ayudarme con este bug", "¿me podrías ayudar con este bug?", "me podrías ayudar con este bug", "¿podrías ayudarme con este error?"], note: "podr- + ías; clitic attached (ayudarme) or climbed (me podrías ayudar)." },
    { t: "cz", q: "Yo en tu lugar no ___ (aceptar) esa oferta.", a: "aceptaría", note: "yo en tu lugar (if I were you) + conditional: the hypothetical register." },
    { t: "tr", q: "She said she would send it (m) today.", a: "dijo que lo mandaría hoy", alt: ["dijo que lo enviaría hoy"], note: "Future-in-the-past: dijo que + conditional." },
    { t: "mc", q: "“When I was small, we would go to the beach every Sunday.” The verb is:", o: ["iríamos", "íbamos", "fuimos"], i: 1, why: "Habitual would = used to = imperfect: íbamos. The conditional iríamos would make it a hypothesis. This is the #1 would-bug in English speakers' Spanish." },
    { t: "cz", q: "___ (deber, tú) actualizar las dependencias. (friendly advice)", a: "deberías", note: "deber in conditional = should (advice): deberías." },
    { t: "tr", q: "I would like to speak with the manager. (polite)", a: "me gustaría hablar con el encargado", alt: ["me gustaría hablar con el gerente", "me gustaria hablar con el encargado", "quisiera hablar con el encargado"], note: "me gustaría + infinitive — the polite wanting formula. (gustar mechanics are the next module.)" },
    { t: "cz", q: "Sabía que el cliente ___ (pedir) más cambios.", a: "pediría", note: "Knew-that + future-from-then: pediría. (pedir is regular in the conditional — stem changes never touch fut/cond.)" }
  ]},

  { id: "fut-4", title: "epistemic future & conditional: probability mode", doc: `
Here's a genuinely elegant corner of Spanish that Duolingo never explains: the future and conditional double as **probability operators**. Used about the present, the future tense stops meaning “later” and starts meaning “probably now”.

## Future = speculation about now

@ ¿Dónde está Ana? — Estará en una reunión. | Where's Ana? — She'll be in a meeting (I reckon).
@ Serán las cinco, más o menos. | It must be about five.
@ Tendrá cuarenta años. | He must be about forty.
@ ¿Quién llama a estas horas? — Será el mensajero. | Who's calling at this hour? — Probably the courier.

Think of it as a confidence annotation: ~está en una reunión~ asserts; ~estará en una reunión~ marks the claim as inferred, ~probably~ built into the morphology. English needs an adverb or “must be”; Spanish just shifts tense.

## Conditional = speculation about the past

Slide the whole mechanism one step back: the conditional speculates about *past* states:

@ ¿Qué hora era cuando llegó? — Serían las once. | It must have been around eleven.
@ Estaría cansado. | He was probably tired.
@ Tendría unos treinta años entonces. | She must have been about thirty then.

## The interrogative flavour: wondering aloud

@ ¿Dónde estará mi cargador? | Where can my charger be? / I wonder where my charger is.
@ ¿Por qué tardará tanto la build? | Why is the build taking so long, I wonder?

! Disambiguation is contextual: ~llegará mañana~ (future — mañana pins it) vs ~ya llegará~ / ~estará al caer~ (probability — “he'll be along / must be about to arrive”). A present-time marker (~ahora~, ~ya~, ~a estas horas~) flips the future into probability mode.
`,
  ex: [
    { t: "mc", q: "¿Dónde está Miguel? — Estará comiendo. The reply means:", o: ["He will eat later", "He's probably eating (right now)", "He was eating"], i: 1, why: "Future about a present question = inference: he must be / he's probably eating. Probability mode." },
    { t: "cz", q: "No sé qué hora es… ___ (ser) las tres. (must be about three)", a: "serán", note: "Speculating about now → future: serán las tres." },
    { t: "tr", q: "Whose is this laptop? It must be Carmen's. (ser de)", a: "¿de quién es este portátil? será de carmen", alt: ["de quién es este portátil será de carmen", "¿de quién es este portátil? sera de carmen"], note: "será de Carmen = it's probably Carmen's — inferred ownership." },
    { t: "cz", q: "Cuando lo conocí, ___ (tener, él) unos cincuenta años. (must have been about fifty)", a: "tendría", note: "Speculation about the past → conditional: tendría unos cincuenta." },
    { t: "mc", q: "How does Spanish say “I wonder where my keys are” with no extra words?", o: ["¿Dónde están mis llaves?", "¿Dónde estarán mis llaves?", "¿Dónde estaban mis llaves?"], i: 1, why: "The future in a question about now = wondering: ¿dónde estarán? — morphology doing the work of “I wonder”." },
    { t: "tr", q: "Why is the test failing? It'll be the cache again. (fallar, la caché)", a: "¿por qué falla el test? será la caché otra vez", alt: ["por qué falla el test será la caché otra vez", "¿por qué está fallando el test? será la caché otra vez", "¿por qué falla el test? será el caché otra vez"], note: "será X = it's probably X — the debugging-hypothesis tense." },
    { t: "cz", q: "Anoche no contestó al teléfono. ___ (estar) durmiendo.", a: "estaría", note: "Past-time speculation → conditional: estaría durmiendo = was probably asleep." }
  ]},

  { id: "fut-5", title: "the perfect tenses: haber + participle", doc: `
The perfect tenses are Spanish's async/await: [[haber]] (the auxiliary — never “tener”!) plus an invariable **participle**.

## The participle

-ar → ~-ado~ (hablado); -er/-ir → ~-ido~ (comido, vivido). Vowel-stems accent the i: ~leído, oído, caído, traído~. And a dozen common irregulars:

| hecho (hacer) | dicho (decir) | escrito (escribir) | visto (ver) |
| puesto (poner) | vuelto (volver) | roto (romper) | abierto (abrir) |
| muerto (morir) | cubierto (cubrir) | resuelto (resolver) | devuelto (devolver) |

## Pretérito perfecto: he hablado

[[he, has, ha, hemos, habéis, han]] + participle = *have done*. In **Spain**, this is also the default for anything in today's open time-frame — where Latin America (and Duolingo) would use the preterite:

@ He terminado el informe. | I've finished the report.
@ Esta mañana he ido al gimnasio. | This morning I went to the gym. — Spain: today = perfect
@ ¿Has visto mi mensaje? | Have you seen my message?
@ Todavía no han llegado. | They haven't arrived yet.

Markers that pull the perfect: ~hoy, esta mañana, esta semana, este año, ya, todavía no, alguna vez, nunca~ (within an open period).

@ ¿Alguna vez has estado en Bilbao? | Have you ever been to Bilbao?

## Pluscuamperfecto: había hablado

[[había, habías…]] + participle = *had done* — an event before another past event. Essential for narration:

@ Cuando llegué, ya se habían ido. | When I arrived, they had already left.
@ No funcionaba porque nadie había ejecutado las migraciones. | It wasn't working because nobody had run the migrations.

## Two rules that never bend

- The participle is **invariable** in perfect tenses: ~ella ha escrito~, never *escrita. (It only agrees when used as an adjective: ~la carta está escrita~.)
- **Nothing splits haber + participle**; clitics go before haber: ~lo he visto~, ~no me ha dicho nada~.
`,
  ex: [
    { t: "cz", q: "¿ ___ (ver, tú, perfecto) la nueva serie? (two words)", a: "has visto", note: "has + irregular participle visto." },
    { t: "tr", q: "I've already sent you (tú) the link.", a: "ya te he mandado el enlace", alt: ["ya te he enviado el enlace", "te he mandado ya el enlace"], note: "Clitic before haber: te he mandado. ya pairs naturally with the perfect." },
    { t: "cz", q: "Esta mañana ___ ___ (ir, yo, perfecto) al médico. (two words — Spain register)", a: "he ido", note: "Today's time-frame → perfect in Spain: esta mañana he ido. (LatAm: fui — also correct there.)" },
    { t: "fix", q: "Ella ha escrita tres novelas.", bad: "escrita", a: "escrito", why: "In perfect tenses the participle never agrees: ha escrito, whoever the subject is. It only inflects as an adjective (la novela está escrita).", code: "E0302" },
    { t: "cz", q: "Cuando reinicié el servidor, los usuarios ya ___ ___ (perder, pluscuamperfecto) la sesión. (two words)", a: "habían perdido", note: "Past-before-past → pluperfect: ya habían perdido." },
    { t: "mc", q: "Where does the pronoun go in “I haven't seen it”?", o: ["No he vístolo", "No lo he visto", "No he lo visto"], i: 1, why: "haber + participle is an unsplittable unit; clitics stack before haber: no lo he visto." },
    { t: "tr", q: "Have you (tú) ever been to Seville? (estar)", a: "¿alguna vez has estado en sevilla?", alt: ["¿has estado alguna vez en sevilla?", "has estado alguna vez en sevilla", "alguna vez has estado en sevilla"], note: "alguna vez + perfect — the “ever” question shape." },
    { t: "tr", q: "The build failed because someone had broken the tests.", a: "la build falló porque alguien había roto los tests", alt: ["el build falló porque alguien había roto los tests", "la build fallo porque alguien habia roto los tests"], note: "Event (falló) caused by an earlier event (había roto — irregular participle of romper)." }
  ]}
]});
