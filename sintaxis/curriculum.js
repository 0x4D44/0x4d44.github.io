/* sintaxis curriculum — part 1/4: modules core.calibration, verbs.present, objects.pointers
   Doc syntax: markdown-lite. ## h2 · ### h3 · "@ es | en" example row · "! " callout ·
   "!! " warning · "- " list · "| a | b |" tables · ``` fences · **b** *i* [[code]] ~hl~ */
window.CURRICULUM = [];

window.CURRICULUM.push({
  id: "core", name: "core.calibration", title: "System check",
  tagline: "The two verbs “to be”, gender as a type system, agreement propagation. The load-bearing walls Duolingo never explains.",
  deps: [],
  lessons: [

  { id: "core-1", title: "ser vs estar: two functions named “to be”", doc: `
English overloads one verb, *to be*, with two jobs. Spanish gives each job its own function, and the type checker is unforgiving. This is the single highest-leverage piece of Spanish grammar, so it goes first.

## The two signatures

- [[ser(x, class)]] — **classification**. Asserts what x *is*: its identity, category, origin, material, profession, possession. Think of it as declaring the type of x. Types don't change from moment to moment.
- [[estar(x, state)]] — **state report**. Reads x's *current state*: condition, mood, location, an action in progress. Think of it as reading a mutable field. States are expected to change.

@ Soy ingeniero. | I'm an engineer. — classification → ser
@ Estoy cansado. | I'm tired. — current state → estar
@ El hielo es frío. | Ice is cold. — property of the class “ice” → ser
@ La sopa está fría. | The soup is (has gone) cold. — state of this soup → estar

## What goes with ser

- **Identity & profession**: ~Es mi hermana. Es médica.~
- **Origin & nationality**: ~Soy de Escocia.~
- **Material & possession**: ~La mesa es de madera. El coche es de Ana.~
- **Time & dates**: ~Son las tres. Hoy es martes.~
- **Inherent characteristics**: ~Marta es alta.~ (describes what kind of person she is)

## What goes with estar

- **Location of things and people**: ~El servidor está en Dublín. Estoy en casa.~
- **Conditions & moods**: ~Está roto. Estamos contentos.~
- **Progressive (ongoing actions)**: ~Está compilando.~ — literally “it is in the state of compiling”
- **Results of change**: ~La puerta está abierta.~ (someone opened it — it's in the opened state)

! The classic mnemonics — DOCTOR for ser (Description, Occupation, Characteristic, Time, Origin, Relationship) and PLACE for estar (Position, Location, Action, Condition, Emotion) — are fine as a cache, but the underlying rule is simpler: **ser classifies, estar reports state.**

!! One famous exception: the location of an **event** uses ser, because you're defining the event, not placing an object: ~La reunión es en la sala 3.~ The *room* is somewhere (estar); the *meeting* is-defined-to-happen somewhere (ser).

## Why “permanent vs temporary” is a buggy heuristic

You may have been taught ser = permanent, estar = temporary. It leaks: ~está muerto~ (he's dead — rather permanent) is estar, because death is a *state* the system entered. ~Soy joven~ (I'm young — temporary!) is ser, because it classifies what I am now. Ask “class or state?”, not “forever or not?”.
`,
  ex: [
    { t: "mc", q: "La fiesta ___ en el piso de Carlos. (the party is at Carlos's flat)", o: ["está", "es", "hay"], i: 1, why: "An event's location takes ser — you are defining where the event happens, not placing an object. The flat itself, by contrast, está en Madrid." },
    { t: "cz", q: "El café ___ frío — ¿lo caliento? (the coffee's gone cold)", a: "está", note: "This particular coffee has entered the state “cold” — a state report, so estar. El café es frío would classify coffee as a cold drink." },
    { t: "cz", q: "Mi hermano ___ ingeniero de software.", a: "es", note: "Profession is classification → ser." },
    { t: "tr", q: "The server is in Dublin.", a: "el servidor está en dublín", alt: ["el servidor esta en dublin"], hint: "server = el servidor", traps: [{ re: "\\bes en\\b", c: "E0201", m: "location of a thing takes estar", n: "es en + place is only for events (la reunión es en…). A server is an object: está en Dublín." }] },
    { t: "tr", q: "I am tired but I am happy.", a: "estoy cansado pero estoy contento", alt: ["estoy cansada pero estoy contenta", "estoy cansado, pero estoy contento", "estoy cansada, pero estoy contenta", "estoy cansado pero contento", "estoy cansada pero contenta"], traps: [{ re: "\\bsoy cansad", c: "E0201", m: "moods and conditions take estar", n: "soy cansado would classify you as “a tiring person”. Tiredness is a state: estoy cansado." }] },
    { t: "mc", q: "Which sentence says “Marta is a boring person”?", o: ["Marta está aburrida.", "Marta es aburrida.", "Marta está aburriendo."], i: 1, why: "ser + adjective classifies: es aburrida = she is boring (a property). está aburrida = she is bored (a state). Same adjective, different verb, different meaning — a preview of lesson core-4." },
    { t: "fix", q: "Mis padres son en Valencia esta semana.", bad: "son", a: "están", why: "People's location is a state → estar: mis padres están en Valencia. ser + place is reserved for events.", code: "E0201" },
    { t: "cz", q: "Hoy ___ lunes y ___ las nueve de la mañana. (same verb, twice)", a: "es, son", alt: ["es son"], note: "Time and dates classify the moment → ser. Singular for the day (es lunes), plural for hours after one o'clock (son las nueve)." },
    { t: "tr", q: "The meeting is at nine.", a: "la reunión es a las nueve", alt: ["la reunion es a las nueve"], note: "Scheduled events take ser: la reunión es a las nueve / es en la sala 3." }
  ]},

  { id: "core-2", title: "gender: a static type system with legacy exceptions", doc: `
Every Spanish noun carries one of two type tags, ~m~ or ~f~, assigned at the word level — it has nothing to do with the referent. A table isn't feminine in any meaningful sense; the *word* [[mesa]] is. Treat gender as a static type: it never changes, and everything that touches the noun must match it.

## The main inference rules

| ending | usually | examples |
| -o | masculine | el código, el archivo, el proceso |
| -a | feminine | la casa, la prueba, la variable |
| -ción, -sión | feminine | la función, la conexión, la versión |
| -dad, -tad, -tud | feminine | la ciudad, la libertad, la actitud |
| -ma (Greek loans) | **masculine** | el problema, el sistema, el programa, el idioma, el tema, el clima |
| -e, consonant | unpredictable — learn with article | el nombre, la red, el mes, la vez |

## The famous legacy exceptions

Inherited from Latin and Greek, these violate the -o/-a heuristic and appear constantly:

@ el problema, el sistema, el programa | Greek -ma words are masculine
@ el día, el mapa, el planeta | masculine despite -a
@ la mano, la foto, la moto | feminine despite -o (foto/moto are clippings of fotografía/motocicleta)
@ la gente | feminine, and grammatically *singular*: la gente dice…

! **Always learn a noun with its article** — store [[la red]], not [[red]]. The article is the type annotation; without it you'll re-derive (and mis-derive) the type at every use site.

## el agua — an interface quirk, not an exception

Feminine nouns beginning with a *stressed* a- take [[el]] in the singular purely for pronunciation (la-agua elides badly): ~el agua~, ~el águila~, ~el alma~. The noun stays feminine — adjectives still agree feminine, and the plural restores las: ~el agua fría~, ~las aguas frías~.

## Articles

| | definite | indefinite |
| m sg | el | un |
| f sg | la | una |
| m pl | los | unos |
| f pl | las | unas |

Also: [[a + el → al]] and [[de + el → del]], mandatory contractions: ~voy al mercado~, ~la salida del túnel~.
`,
  ex: [
    { t: "mc", q: "Which article? ___ problema es la memoria, no la CPU.", o: ["La", "El", "Lo"], i: 1, why: "problema is a Greek -ma loan: masculine. el problema, el sistema, el programa, el idioma — the whole family." },
    { t: "cz", q: "___ mano derecha (the right hand)", a: "la", note: "mano is feminine despite -o: la mano derecha, las manos frías." },
    { t: "cz", q: "Vivo en ___ ciudad pequeña. (a small city)", a: "una", note: "-dad nouns are feminine: la ciudad, la verdad, la edad." },
    { t: "tr", q: "The system works but the program is slow.", a: "el sistema funciona pero el programa es lento", alt: ["el sistema funciona, pero el programa es lento"], traps: [{ re: "\\bla (sistema|programa)", c: "E0101", m: "Greek -ma nouns are masculine", n: "sistema and programa take el despite ending in -a." }] },
    { t: "mc", q: "el agua está fría — why el with a feminine adjective?", o: ["agua is masculine in the singular", "el avoids the la-a vowel clash; agua stays feminine", "it's a typo for la"], i: 1, why: "Feminine nouns starting with stressed a- take el in the singular for euphony only. The type is unchanged: el agua fría, las aguas frías." },
    { t: "cz", q: "Voy ___ mercado. (a + el)", a: "al", note: "a + el contracts to al, always. Likewise de + el → del." },
    { t: "fix", q: "La día empieza a las ocho.", bad: "La", a: "El", why: "día is masculine despite -a: el día, buenos días.", code: "E0101" },
    { t: "cz", q: "___ gente aquí ___ muy simpática. (article + ser, watch the number)", a: "la, es", alt: ["la es"], note: "gente is feminine and singular: la gente es simpática — even though it refers to many people." }
  ]},

  { id: "core-3", title: "agreement: one bit of state, propagated everywhere", doc: `
Once a noun's gender and number are fixed, Spanish propagates those two bits through the entire noun phrase — article, noun, every adjective — and number continues on to the verb. English marks plural once; Spanish marks it on everything it touches. Redundant? Yes, deliberately: it's error-correcting coding for a language often spoken in noisy rooms.

@ los coches rojos son caros | the red cars are expensive — plural marked 4 times

## Adjective endings

- **-o adjectives**: four forms. ~rojo, roja, rojos, rojas~
- **-e and most consonant adjectives**: two forms (number only). ~grande/grandes, azul/azules, fácil/fáciles~
- **-or, -ón, -ín and nationalities in a consonant**: add -a for feminine. ~trabajador/trabajadora~, ~español/española~, ~alemán/alemana~

## Plurals

- vowel → add -s: ~variable → variables~
- consonant → add -es: ~función → funciones~ (note the accent drops: the stress hasn't moved, so the mark is no longer needed)
- -z → -ces: ~vez → veces~, ~lápiz → lápices~

## Position

Default is **noun then adjective**: ~un lenguaje moderno~. A handful of common adjectives precede and some shorten (apocope): ~un **buen** libro~, ~un **mal** día~, ~el **primer** intento~, ~un **gran** proyecto~ (gran = great before any singular noun; grande = big after it).

## Mixed groups

Any masculine element makes the group masculine plural — masculine is the unmarked default type: ~tres ingenieras y un ingeniero → todos juntos~.

## lo + adjective

[[lo]] + a masculine-singular adjective builds an abstract noun — extremely common and very useful: ~lo importante~ (the important thing), ~lo difícil~ (the hard part), ~lo mejor~ (the best bit).

@ Lo difícil no es escribir código, es leerlo. | The hard part isn't writing code, it's reading it.
`,
  ex: [
    { t: "cz", q: "las funciones ___ (pure) — adjective puro", a: "puras", note: "función is feminine; plural + feminine propagates to the adjective: las funciones puras." },
    { t: "tr", q: "a good book and an interesting idea", a: "un buen libro y una idea interesante", alt: ["un libro bueno y una idea interesante"], note: "bueno apocopates to buen before a masculine singular noun. interesante has no separate feminine form — -e adjectives only mark number." },
    { t: "fix", q: "Los datos está corrupto.", bad: "está", a: "están", why: "datos is plural, so the verb must be plural too — and the adjective: los datos están corruptos. (Fixing the verb is the first step; the adjective corrupto also needs -s.)", code: "E0102" },
    { t: "cz", q: "una ingeniera ___ (hard-working)", a: "trabajadora", note: "-or adjectives add -a for the feminine: trabajador → trabajadora." },
    { t: "mc", q: "How do you pluralise la vez (the time/occasion)?", o: ["las vezes", "las veces", "los veces"], i: 1, why: "-z becomes -ces in the plural: vez → veces, lápiz → lápices. Gender stays feminine." },
    { t: "tr", q: "The important thing is the data.", a: "lo importante son los datos", alt: ["lo importante es la información", "lo importante son los datos"], note: "lo + adjective = abstract noun. And a plural predicate usually pulls the verb plural: lo importante son los datos.", hint: "datos is plural" },
    { t: "cz", q: "el ___ intento (the first attempt)", a: "primer", note: "primero apocopates before a masculine singular noun: el primer intento, but la primera vez." },
    { t: "mc", q: "Three women engineers and one man walk into a room. The group is…", o: ["ellas", "ellos", "elles"], i: 1, why: "Any masculine member makes the group grammatically masculine: ellos. Masculine is the unmarked/default gender in the standard language." }
  ]},

  { id: "core-4", title: "ser/estar with adjectives: same word, different meaning", doc: `
Many adjectives compile with both ser and estar — and the choice *changes the meaning*, sometimes drastically. This is the payoff of core-1: once you read ser as “classifies” and estar as “state”, every pair below becomes predictable rather than memorised.

| adjective | with ser (classifies) | with estar (state) |
| aburrido | boring | bored |
| listo | clever | ready |
| rico | rich | delicious (food right now) |
| malo | bad (person/quality) | ill |
| bueno | good (person/quality) | tasty; recovered |
| verde | green (colour) | unripe |
| seguro | safe (thing) | certain/sure (person) |
| atento | attentive by nature | paying attention now |
| orgulloso | proud (character flaw) | proud of something |
| despierto | sharp-witted | awake |

@ Este libro es aburrido. | This book is boring. — property of the book
@ Estoy aburrido. | I'm bored. — my current state
@ ¿Estás listo? | Are you ready? — state: ready to go
@ Qué listo eres. | How clever you are. — classification

## estar + participle: the state after an event

A participle with estar reports the **result state** of a completed action — a pattern you'll use constantly:

@ La ventana está rota. | The window is broken. (someone broke it; this is the resulting state)
@ El bug está arreglado. | The bug is fixed.
@ La build está terminada. | The build is finished.

! Compare with the passive event itself: ~la ventana **fue** rota por el viento~ (it *was broken* — the event) vs ~la ventana **está** rota~ (it *is broken* — the state now). Event → ser; resulting state → estar.

## estar de + noun: temporary role

~Está de camarero este verano~ — he's working as a waiter this summer (but that's not what he *is*). Compare ~es camarero~: that's his profession.
`,
  ex: [
    { t: "mc", q: "Your tapas arrive and they're superb. You say:", o: ["¡Están riquísimas!", "¡Son riquísimas!", "¡Son ricas!"], i: 0, why: "Food tasting great right now is a state: están ricas/riquísimas. son ricas would classify — “they are rich (wealthy)” or a general property." },
    { t: "cz", q: "El deploy ___ terminado. (the deploy is finished — result state)", a: "está", note: "estar + participle reports the state resulting from a completed action." },
    { t: "tr", q: "Are you ready? The taxi is here.", a: "¿estás listo? el taxi está aquí", alt: ["estás listo el taxi está aquí", "¿estás lista? el taxi está aquí", "estas listo el taxi esta aqui"], traps: [{ re: "\\beres list", c: "E0201", m: "listo with ser means clever, not ready", n: "¿eres listo? asks if they're smart. Ready-to-go is a state: ¿estás listo?" }] },
    { t: "mc", q: "Estas manzanas están verdes means:", o: ["These apples are green-coloured", "These apples are unripe", "These apples are envious"], i: 1, why: "estar + verde = unripe (a state on the way to ripe). The colour as a property would be son verdes." },
    { t: "fix", q: "Mi abuelo es malo hoy, tiene fiebre.", bad: "es", a: "está", why: "Illness is a state: está malo = he's unwell. es malo classifies him as a bad person — quite the accusation to level at your grandfather.", code: "E0201" },
    { t: "cz", q: "No ___ seguro de que funcione. (I'm not sure it works)", a: "estoy", note: "A person being sure/certain is estar seguro. es seguro = it is safe/certain as a property of a thing." },
    { t: "tr", q: "The window is broken.", a: "la ventana está rota", alt: ["la ventana esta rota"], note: "Result state → estar + participle, agreeing feminine: rota." },
    { t: "mc", q: "Está de camarero este verano tells you:", o: ["He is a waiter by profession", "He's temporarily working as a waiter", "He's at the waiter's place"], i: 1, why: "estar de + occupation = a temporary role. His actual profession would be es camarero." }
  ]},

  { id: "core-5", title: "hay vs está: existence vs location", doc: `
Two different queries that English sometimes merges into “there is / it is”:

- [[hay]] — **existence check**: asserts that something exists (in scope). Invariable: one form for singular and plural. It's the impersonal form of [[haber]].
- [[está / están]] — **location lookup** of something already known/definite.

@ Hay un banco en la plaza. | There's a bank in the square. — asserting existence
@ El banco está en la plaza. | The bank is in the square. — locating a known thing

## The article rule of thumb

~hay~ pairs with **indefinites** (un, una, dos, muchos, algún, ningún — or no article); ~estar~ pairs with **definites** (el, la, mi, este). You cannot say ~*hay el banco~ — if it's definite enough to take *el*, you already believe it exists, so you're locating it: ~el banco está…~

@ ¿Hay wifi? | Is there wifi? (does it exist here?)
@ ¿Dónde está el router? | Where is the router? (locate the known thing)
@ No hay entradas. | There are no tickets (left).
@ Hay tres bugs en este archivo. | There are three bugs in this file.

! [[hay]] never agrees: ~hay un bug~, ~hay tres bugs~ — same form. Beginners write *hayn* or use *están* for existence; both are type errors.

## Other tenses of the existential

The impersonal haber conjugates for tense, always in the third-person singular: ~había~ (there was/were — description), ~hubo~ (there was — event), ~habrá~ (there will be), ~va a haber~ (there's going to be).

@ Había mucha gente en la demo. | There were a lot of people at the demo.
@ Hubo un apagón anoche. | There was a power cut last night.

## Quick round-up of module core

You now hold the three invariants everything else builds on: **ser classifies / estar reports state**, **gender is a static type learned with the article**, **agreement propagates through the phrase**. The test suite below mixes all three.
`,
  ex: [
    { t: "cz", q: "¿___ una farmacia por aquí? (is there a chemist around here?)", a: "hay", note: "Existence of an indefinite thing → hay." },
    { t: "cz", q: "¿Dónde ___ la estación? (where is the station?)", a: "está", note: "Locating a definite, known thing → estar." },
    { t: "tr", q: "There are two problems in this file.", a: "hay dos problemas en este archivo", alt: ["hay dos problemas en este fichero"], traps: [{ re: "\\bestán dos\\b|\\bson dos problemas en", c: "E0201", m: "existence takes hay, not estar/ser", n: "Asserting that things exist → hay, invariable: hay dos problemas." }, { re: "\\bdos problemas están\\b", c: "E0201", m: "existence takes hay", n: "hay dos problemas — you're asserting existence, not locating known problems." }] },
    { t: "mc", q: "Which is correct?", o: ["Hay el supermercado en la esquina.", "El supermercado está en la esquina.", "El supermercado hay en la esquina."], i: 1, why: "Definite article ⇒ you're locating a known thing ⇒ estar. hay never takes el/la." },
    { t: "cz", q: "___ mucha gente en la fiesta anoche. (there were — completed event framing, imperfect description)", a: "había", alt: ["hubo"], note: "había describes the scene; hubo reports it as a bounded event. Both are third-person singular even with plural things — the existential never agrees." },
    { t: "fix", q: "En mi equipo hayn tres desarrolladores.", bad: "hayn", a: "hay", why: "hay is invariable — it never takes a plural ending: hay tres desarrolladores.", code: "E0102" },
    { t: "tr", q: "There's no coffee. The coffee machine is broken.", a: "no hay café la cafetera está rota", alt: ["no hay café. la cafetera está rota", "no hay cafe la cafetera esta rota"], note: "Existence (negated) → no hay; result state of the machine → está rota, feminine agreement." },
    { t: "mc", q: "Integration check — pick the fully correct sentence:", o: ["La problema está que no hay memoria.", "El problema es que no hay memoria.", "El problema está que no hay memoria."], i: 1, why: "el problema (Greek -ma, masculine) + ser for defining what the problem IS (classification): el problema es que… — and existence of memory → hay." }
  ]}
]});

window.CURRICULUM.push({
  id: "pres", name: "verbs.present", title: "Dispatch tables",
  tagline: "The present tense as a function of (stem, person): regular dispatch, stem-change rewrites, irregular first persons, and methods on self.",
  deps: ["core"],
  lessons: [

  { id: "pres-1", title: "conjugation is a pure function", doc: `
A Spanish verb is [[stem + ending]]. The infinitive tells you the class (~-ar~, ~-er~, ~-ir~); the ending encodes **person and number**, which is why subject pronouns are usually dropped — the information is already in the suffix. ~hablo~ can only mean *I* speak. Saying ~yo hablo~ is like writing [[this.this.x]]: legal, but emphatic.

## The dispatch tables

| person | -ar (hablar) | -er (comer) | -ir (vivir) |
| yo | habl~o~ | com~o~ | viv~o~ |
| tú | habl~as~ | com~es~ | viv~es~ |
| él/ella/Ud. | habl~a~ | com~e~ | viv~e~ |
| nosotros | habl~amos~ | com~emos~ | viv~imos~ |
| vosotros | habl~áis~ | com~éis~ | viv~ís~ |
| ellos/Uds. | habl~an~ | com~en~ | viv~en~ |

Note the compression: -er and -ir differ **only** in nosotros/vosotros. Learn -er, patch two cells, and you have -ir for free.

! **vosotros** is the informal plural “you”, universal in Spain and absent from Duolingo's Latin-American course. You'll hear it in every Spanish office and bar: ~¿venís?~ (are you lot coming?). This course includes it throughout; usted/ustedes (formal) take third-person forms.

## Present covers more than English present

Spanish present does the work of three English forms — ~hablo~ = I speak / I am speaking / I do speak — plus near-future with a time expression:

@ Trabajo en Edimburgo. | I work in Edinburgh.
@ ¿Qué haces? — Escribo tests. | What are you doing? — I'm writing tests.
@ Mañana llego a las diez. | Tomorrow I arrive at ten. — present + time marker ≈ scheduled future

## Negation and questions

Negation is a prefix: [[no]] immediately before the verb: ~no funciona~. Questions are intonation plus optional inversion — no auxiliary *do*: ~¿Hablas catalán?~
`,
  ex: [
    { t: "drill", verbs: ["hablar", "trabajar", "comer", "vivir", "escribir", "aprender"], tense: "pres", n: 5 },
    { t: "tr", q: "I live in Scotland and I work from home. (from home = desde casa)", a: "vivo en escocia y trabajo desde casa", alt: ["vivo en escocia y trabajo desde mi casa"], note: "Both verbs carry the yo ending -o; no pronoun needed." },
    { t: "cz", q: "¿___ (beber, vosotros) cerveza o vino?", a: "bebéis", note: "vosotros -er ending: -éis. In Latin America this would be ¿ustedes beben?" },
    { t: "mc", q: "Why is yo usually omitted in yo hablo?", o: ["It's lazy speech", "The -o ending already encodes first person singular", "It's only omitted in questions"], i: 1, why: "The ending is the subject marker. Pronouns appear for contrast or emphasis: yo trabajo, él no." },
    { t: "tr", q: "She doesn't eat meat.", a: "no come carne", alt: ["ella no come carne"], traps: [{ re: "\\bno hace comer|doesn'?t", c: "E0302", m: "no auxiliary do in Spanish", n: "Negation is just no + verb: no come carne." }] },
    { t: "cz", q: "Mis compañeros ___ (vivir) en Glasgow.", a: "viven", note: "Third person plural -ir: viven." },
    { t: "tr", q: "Are you (tú) learning Spanish?", a: "¿aprendes español?", alt: ["aprendes español", "¿estás aprendiendo español?", "estás aprendiendo español"], note: "Simple present covers the English progressive: aprendes = you are learning. The explicit progressive estás aprendiendo also works." }
  ]},

  { id: "pres-2", title: "stem changes: a stress-triggered rewrite rule", doc: `
A large family of verbs rewrites its stem vowel **when that vowel is stressed**. In nosotros/vosotros the stress falls on the *ending*, so the stem survives untouched. Shade the changed cells in the table and you get a boot shape — hence “boot verbs”.

## The three rewrites

| rule | example | boot forms | flat forms |
| e → ie | pensar | p~ie~nso, p~ie~nsas, p~ie~nsa, p~ie~nsan | pensamos, pensáis |
| o → ue | volver | v~ue~lvo, v~ue~lves, v~ue~lve, v~ue~lven | volvemos, volvéis |
| e → i (-ir only) | pedir | p~i~do, p~i~des, p~i~de, p~i~den | pedimos, pedís |

Plus one loner: [[jugar]] is the only u → ue verb: ~juego, jugamos~.

## This is phonology, not morphology

The rewrite isn't random: stressed Latin short e and o diphthongised in the evolution to Spanish. The same rule produced noun pairs you already know: ~puerta~ (stressed) vs ~portal~ (unstressed), ~fuego~ vs ~fogata~. Once you see it as “stressed vowel breaks”, the boot stops being a memorised shape and becomes a consequence.

## Common members worth caching

- **e→ie**: pensar (think), empezar (start), entender (understand), perder (lose), querer (want), preferir (prefer), sentir (feel), cerrar (close), despertar(se) (wake)
- **o→ue**: poder (can), volver (return), dormir (sleep), encontrar (find), contar (count/tell), recordar (remember), costar (cost), mostrar (show), soñar (dream)
- **e→i**: pedir (ask for), servir (serve), repetir (repeat), seguir (follow), elegir (choose), vestir(se) (dress)

@ ¿A qué hora empieza la reunión? | What time does the meeting start?
@ No encuentro el archivo. | I can't find the file.
@ ¿Cuánto cuesta? | How much does it cost?
@ Pido otra ronda. | I'll order another round.

! The infinitive doesn't show you whether a verb stem-changes — [[comer]] doesn't, [[volver]] does. Dictionaries mark it (volver (ue)); so does the conjugator in this app.
`,
  ex: [
    { t: "drill", verbs: ["pensar", "volver", "pedir", "empezar", "encontrar", "dormir", "jugar", "entender"], tense: "pres", n: 6 },
    { t: "cz", q: "¿A qué hora ___ (empezar) el partido?", a: "empieza", note: "Third person singular is inside the boot: e → ie." },
    { t: "cz", q: "Nosotros ___ (poder) ayudar.", a: "podemos", note: "nosotros is outside the boot — the stem keeps its o: podemos, not *puedemos." },
    { t: "fix", q: "¿Cuánto cuestan las entradas? — Cuestan veinte euros pero yo no puedemo pagar.", bad: "puedemo", a: "puedo", why: "yo is inside the boot: o → ue, ending -o → puedo. puedemo mixes the changed stem with a mangled ending.", code: "E0302" },
    { t: "tr", q: "I always order the menu of the day. (menú del día)", a: "siempre pido el menú del día", alt: ["pido siempre el menú del día", "siempre pido el menu del dia"], note: "pedir e→i in the boot: pido." },
    { t: "mc", q: "Why do pensamos and pensáis keep the e?", o: ["They're exceptions", "The stress falls on the ending, so the stem vowel never diphthongises", "Only singular forms change"], i: 1, why: "The rewrite fires on the stressed stem vowel. In nosotros/vosotros the ending carries the stress, so the stem is untouched — that's the boot." },
    { t: "cz", q: "Ellos ___ (jugar) al fútbol los domingos.", a: "juegan", note: "jugar is the lone u→ue verb: juego, juegas, juega, jugamos, jugáis, juegan. Note jugar a + sport." },
    { t: "tr", q: "Do you (vosotros) want coffee?", a: "¿queréis café?", alt: ["queréis café", "quereis cafe"], note: "querer e→ie, but vosotros is outside the boot: queréis." }
  ]},

  { id: "pres-3", title: "irregular first persons: the -go and -zco families", doc: `
Many verbs are regular everywhere in the present **except yo**. These aren't random: they cluster into families, and — critically — the irregular yo stem is the seed the entire present subjunctive will later grow from (module mood.subjunctive). Cache it well now and you get the subjunctive nearly free.

## The -go family

| verb | yo | rest regular-ish |
| tener | ~tengo~ | tienes, tiene… (also e→ie) |
| hacer | ~hago~ | haces, hace… |
| poner | ~pongo~ | pones… |
| salir | ~salgo~ | sales… |
| venir | ~vengo~ | vienes… (also e→ie) |
| decir | ~digo~ | dices… (also e→i) |
| traer | ~traigo~ | traes… |
| oír | ~oigo~ | oyes, oye, oímos, oís, oyen |
| caer | ~caigo~ | caes… |

## The -zco family

Verbs in vowel + [[-cer/-cir]] take ~-zco~: conocer → ~conozco~, parecer → ~parezco~, ofrecer → ~ofrezco~, conducir → ~conduzco~, traducir → ~traduzco~.

## Other loners

~sé~ (saber), ~veo~ (ver), ~doy~ (dar), ~quepo~ (caber), ~escojo/elijo~ (orthographic: g→j before o), ~sigo~ (seguir).

## Fully irregular: the big four

| | ser | estar | ir | haber |
| yo | soy | estoy | voy | he |
| tú | eres | estás | vas | has |
| él | es | está | va | ha |
| nos. | somos | estamos | vamos | hemos |
| vos. | sois | estáis | vais | habéis |
| ellos | son | están | van | han |

@ Salgo del trabajo a las seis. | I leave work at six.
@ Te digo la verdad. | I'm telling you the truth.
@ No conozco Sevilla todavía. | I don't know Seville yet.
@ Hago deporte los martes. | I do sport on Tuesdays.

! [[tener]] idioms replace English *to be*: ~tengo hambre/sed/sueño/frío/calor/razón/suerte~ (I'm hungry/thirsty/sleepy/cold/hot/right/lucky), ~tengo 41 años~ (I'm 41), ~tengo que + inf~ (I have to). Don't translate *I am hungry* with estar.
`,
  ex: [
    { t: "drill", verbs: ["tener", "hacer", "poner", "salir", "venir", "decir", "conocer", "traer"], tense: "pres", persons: [0, 1, 2, 5], n: 6 },
    { t: "tr", q: "I leave home at eight and I come back at six. (volver)", a: "salgo de casa a las ocho y vuelvo a las seis", alt: ["salgo de mi casa a las ocho y vuelvo a las seis"], note: "salgo (-go family) + vuelvo (o→ue boot)." },
    { t: "cz", q: "No ___ (conocer, yo) a tu hermano.", a: "conozco", note: "-zco family. (The a is the personal a — module objects.pointers.)" },
    { t: "tr", q: "I'm hungry and I'm cold.", a: "tengo hambre y tengo frío", alt: ["tengo hambre y frío", "tengo hambre y tengo frio"], traps: [{ re: "\\b(soy|estoy) (hambre|hambriento|frío|frio)", c: "E0302", m: "hunger/cold use tener idioms", n: "Spanish has hunger and cold rather than being them: tengo hambre, tengo frío." }] },
    { t: "cz", q: "___ (saber, yo) la respuesta pero no ___ (decir, yo) nada.", a: "sé, digo", alt: ["sé digo", "se digo"], note: "sé carries an accent to distinguish it from the pronoun se. digo is the -go family." },
    { t: "mc", q: "Why are the irregular yo forms worth over-learning?", o: ["They're the most common words", "The present subjunctive is built on the yo stem: tengo → tenga, conozco → conozca", "They're on every exam"], i: 1, why: "diga, haga, ponga, salga, venga, conozca… the subjunctive inherits the yo stem wholesale. Cache it once, use it twice." },
    { t: "cz", q: "¿ ___ (oír, tú) ese ruido?", a: "oyes", note: "oír: oigo, oyes, oye, oímos, oís, oyen — y glides in where two vowels would collide." },
    { t: "tr", q: "I have to work this weekend.", a: "tengo que trabajar este fin de semana", alt: ["tengo que trabajar este finde"], note: "tener que + infinitive = to have to. fin de semana = weekend (el finde, colloquially)." }
  ]},

  { id: "pres-4", title: "reflexives: methods that take self", doc: `
A reflexive verb passes the subject to itself — [[levantarse]] is *to raise oneself*, i.e. to get up. The dictionary form carries [[-se]]; conjugating means (1) conjugate the verb normally, (2) bind the matching self-pronoun **before** it.

| person | pronoun | levantarse |
| yo | me | me levanto |
| tú | te | te levantas |
| él/Ud. | se | se levanta |
| nosotros | nos | nos levantamos |
| vosotros | os | os levantáis |
| ellos/Uds. | se | se levantan |

## The daily-routine cluster

~despertarse (ie)~ wake up · ~levantarse~ get up · ~ducharse~ shower · ~vestirse (i)~ get dressed · ~sentarse (ie)~ sit down · ~acostarse (ue)~ go to bed · ~dormirse (ue)~ fall asleep — note ~dormir~ = to sleep, ~dormir**se**~ = to *fall* asleep: the -se often adds a change-of-state flavour.

@ Me despierto a las siete pero no me levanto hasta las ocho. | I wake at seven but don't get up till eight.
@ ¿A qué hora te acuestas? | What time do you go to bed?

## Reflexive as “each other”

Plural reflexives also read reciprocally: ~nos escribimos~ (we write to each other), ~se conocen~ (they know each other).

## Meaning-shifting -se

Some verbs change meaning with -se — treat them as separate API entries:

| plain | with -se |
| ir — to go | irse — to leave/go away |
| quedar — to arrange to meet / be located | quedarse — to stay |
| llamar — to call | llamarse — to be named |
| poner — to put | ponerse — to put on; to become |
| quitar — to remove | quitarse — to take off |

@ Me voy. | I'm off / I'm leaving.
@ ¿Cómo te llamas? | What's your name? — literally “how do you call yourself?”

! With body parts and clothing, the reflexive replaces the possessive: ~me lavo **las** manos~, never ~*mis manos~. The pronoun already says whose they are.
`,
  ex: [
    { t: "cz", q: "___ ___ (levantarse, yo) a las siete. (two words)", a: "me levanto", note: "Pronoun first, then the conjugated verb." },
    { t: "tr", q: "What time do you (tú) go to bed?", a: "¿a qué hora te acuestas?", alt: ["a qué hora te acuestas", "a que hora te acuestas"], note: "acostarse is o→ue: te acuestas." },
    { t: "cz", q: "Mi mujer y yo ___ ___ (ducharse) por la mañana. (two words)", a: "nos duchamos", note: "nosotros → nos." },
    { t: "fix", q: "Lavo mis manos antes de comer.", bad: "mis", a: "las", why: "Body parts take the definite article with a reflexive verb: me lavo las manos. (Full fix: me lavo las manos — the reflexive me is also needed; the possessive is the bug to spot.)", code: "E0401" },
    { t: "mc", q: "Me voy vs voy — what's the difference?", o: ["None, style only", "me voy = I'm leaving (departure); voy = I'm going (somewhere)", "me voy is more formal"], i: 1, why: "irse foregrounds departure: ¡me voy! = I'm off. ir needs a destination: voy al cine." },
    { t: "tr", q: "They know each other from work. (del trabajo)", a: "se conocen del trabajo", alt: ["se conocen del curro"], note: "Plural reflexive read reciprocally: they know each other." },
    { t: "cz", q: "¿Cómo ___ ___ (llamarse) tu perro? (two words)", a: "se llama", note: "llamarse = to be called: ¿cómo se llama? — the everyday way to ask a name." },
    { t: "tr", q: "I fall asleep on the sofa every night.", a: "me duermo en el sofá todas las noches", alt: ["me duermo en el sofa todas las noches", "cada noche me duermo en el sofá"], note: "dormirse = fall asleep (change of state), o→ue: me duermo." }
  ]},

  { id: "pres-5", title: "saber/conocer, pedir/preguntar — one English word, two APIs", doc: `
English *know* and *ask* are each overloaded across two distinct Spanish verbs. The split is clean once you see the signatures.

## know: saber vs conocer

- [[saber]] — **facts, information, how-to**. Takes a clause or an infinitive: ~sé que…~, ~sé dónde…~, ~sé programar~ (I know how to program).
- [[conocer]] — **acquaintance**: people, places, works. Takes a noun (with personal *a* for people): ~conozco a Marta~, ~conozco Sevilla~.

@ ¿Sabes si viene? | Do you know if she's coming? — fact
@ ¿Conoces a mi jefa? | Do you know my boss? — acquaintance
@ Sé conducir, pero no conozco la ciudad. | I can drive, but I don't know the city.

! [[saber + infinitive]] = *can* in the sense of a learned skill: ~sé nadar~ (I can swim — I know how). [[poder]] is circumstantial ability/permission: ~hoy no puedo nadar~ (pool's shut, arm's broken…).

## ask: preguntar vs pedir

- [[preguntar]] — request **information**: ask a question. ~pregunta cuánto cuesta~.
- [[pedir]] — request **a thing or action**: order, ask for. ~pido la cuenta~, ~te pido un favor~.

@ Pregúntale dónde está. | Ask him where it is. — information
@ Pídele las llaves. | Ask him for the keys. — object

## Module round-up: the present, complete

You can now dispatch any present-tense verb: regular tables, boot rewrites, -go/-zco first persons, reflexive binding, and the big four irregulars. The suite below is an integration test across the whole module — expect mixed families.
`,
  ex: [
    { t: "cz", q: "No ___ (saber/conocer, yo) a nadie en esta ciudad, pero ___ (saber/conocer, yo) dónde está todo.", a: "conozco, sé", alt: ["conozco sé", "conozco se"], note: "People → conocer; facts (where things are) → saber." },
    { t: "tr", q: "I can swim but today I can't. (skill, then circumstance)", a: "sé nadar pero hoy no puedo", alt: ["sé nadar, pero hoy no puedo", "se nadar pero hoy no puedo"], note: "Learned skill → saber + inf; circumstantial ability → poder." },
    { t: "mc", q: "You want the bill in a restaurant. Which verb?", o: ["pregunto la cuenta", "pido la cuenta", "pregunto por la cuenta"], i: 1, why: "Requesting a thing → pedir: pido la cuenta. preguntar asks for information." },
    { t: "cz", q: "¿ ___ (conocer, tú) Barcelona? — No, pero ___ (querer, yo) ir.", a: "conoces, quiero", alt: ["conoces quiero"], note: "Places → conocer. querer is e→ie: quiero." },
    { t: "drill", verbs: ["saber", "conocer", "pedir", "seguir", "ser", "estar", "ir", "tener"], tense: "pres", n: 6 },
    { t: "tr", q: "Ask him (tú, use preguntar) if he knows my name.", a: "pregúntale si sabe mi nombre", alt: ["preguntale si sabe mi nombre", "pregúntale si sabe cómo me llamo"], note: "Information → preguntar; a known fact (my name) → saber. The -le attaches to the command — commands come in module mood.imperative." },
    { t: "fix", q: "Sabo la respuesta pero no conozco a la profesora.", bad: "Sabo", a: "Sé", why: "saber has the irregular yo sé. The second half is correct: person → conocer + personal a.", code: "E0302" },
    { t: "mc", q: "Module integration: pick the correct sentence.", o: ["Conozco que el sistema es lento.", "Sé que el sistema es lento.", "Sé el sistema es lento."], i: 1, why: "A fact-clause takes saber + que. conocer takes nouns, not clauses; and que cannot be dropped, unlike English “I know the system is slow”." }
  ]}
]});

window.CURRICULUM.push({
  id: "obj", name: "objects.pointers", title: "Pointers & references",
  tagline: "Object pronouns are references to nouns: direct vs indirect case, the personal-a marker, the se-rewrite, and strict placement rules.",
  deps: ["pres"],
  lessons: [

  { id: "obj-1", title: "direct object pronouns: references to the noun", doc: `
Once a noun is in scope, Spanish replaces it with a typed reference rather than repeating it. The **direct object** is whatever the verb acts on directly: what you see, buy, break, compile.

| person | pronoun |
| me | me |
| you (tú) | te |
| him / it (m) / you-Ud. (m) | ~lo~ |
| her / it (f) / you-Ud. (f) | ~la~ |
| us | nos |
| you lot (vosotros) | os |
| them (m) / you-Uds. | ~los~ |
| them (f) | ~las~ |

The pronoun **matches the gender and number of the noun it points to** — it's a typed pointer:

@ ¿Tienes el informe? — Sí, lo tengo. | Got the report? — Yes, I have it. (el informe → lo)
@ ¿Ves la diferencia? — No, no la veo. | See the difference? — No, I don't see it.
@ ¿Compraste las entradas? — Las compré ayer. | Did you buy the tickets? — Bought them yesterday.

## Placement (preview)

The pronoun goes **immediately before the conjugated verb** — even in negation, where [[no]] comes first: ~no lo veo~. (Infinitives and gerunds allow attachment; the full placement spec is lesson obj-5.)

## English speakers' segfault

English drops object pronouns freely (“Did you buy the tickets?” — “Bought them yesterday” or just “Yes, bought yesterday”). Spanish **requires** the reference: ~¿Lo tienes?~ — ~Sí, lo tengo~, never ~*Sí, tengo~. An answered verb without its object pointer reads as a dangling reference.

! In much of Spain you'll hear ~le~ instead of ~lo~ for a male *person* (~le vi ayer~ — “leísmo”). The RAE tolerates that one case; this course teaches the standard lo/la system, which is always correct.
`,
  ex: [
    { t: "cz", q: "¿Tienes las llaves? — Sí, ___ tengo.", a: "las", note: "las llaves is feminine plural → the reference is las." },
    { t: "cz", q: "¿Has visto el error en los logs? — No, no ___ veo.", a: "lo", note: "el error → lo. Negation wraps outside: no lo veo." },
    { t: "tr", q: "I know her from university. (use conocer + de la universidad)", a: "la conozco de la universidad", alt: ["la conozco de la uni"], traps: [{ re: "\\bconozco (a )?ella\\b", c: "E0402", m: "use the clitic pronoun, not the stressed pronoun", n: "“her” as a direct object is the clitic la before the verb: la conozco. a ella can be *added* for emphasis, but never replaces la." }] },
    { t: "mc", q: "¿Compraste el libro? Which reply is grammatical?", o: ["Sí, compré.", "Sí, lo compré.", "Sí, compré lo."], i: 1, why: "The object reference is obligatory and proclitic: lo compré. Bare compré dangles; compré lo puts the clitic in an illegal slot.", },
    { t: "fix", q: "¿Dónde están mis gafas? No los encuentro.", bad: "los", a: "las", why: "gafas is feminine plural, so the pointer must be las: no las encuentro. A pointer of the wrong type.", code: "E0101" },
    { t: "tr", q: "The tests? I run them every night. (ejecutar)", a: "los ejecuto todas las noches", alt: ["¿los tests? los ejecuto todas las noches", "los ejecuto cada noche"], note: "los tests → los, placed before ejecuto." },
    { t: "cz", q: "Nos invitan a la demo. ¿___ acompañas? (will you come with us?)", a: "nos", note: "us → nos: ¿nos acompañas?" }
  ]},

  { id: "obj-2", title: "the personal a: a case marker for human objects", doc: `
When a **direct object is a specific person**, Spanish inserts the particle [[a]] before it. English has no equivalent — it's pure case marking, like a runtime tag saying “this argument is human”.

@ Veo el tren. | I see the train. — thing, no marker
@ Veo ~a~ María. | I see María. — person, marked
@ Busco ~a~ mi compañero. | I'm looking for my colleague.
@ ¿Conoces ~a~ la nueva jefa? | Do you know the new boss?

## Why it exists

Spanish word order is flexible; subject and object can swap positions. The ~a~ disambiguates who does what to whom: in ~llama María a Juan~, the marker tells you Juan is the callee even though he's last. It's a disambiguating type tag in a language without positional argument binding.

## The rules

- **Specific, identified people** (and named pets — family members in the runtime): marker **on**. ~Quiero a mi perro.~
- **Things**: marker **off**. ~Veo el coche~, never ~*veo al coche~.
- **Non-specific/hypothetical people**: marker off — ~busco un desarrollador que sepa Rust~ (any developer, not one in particular; note this pattern returns with the subjunctive).
- After [[tener]] in the plain sense of having: usually off — ~tengo dos hermanos~.
- [[alguien / nadie / quien]] as objects: always marked — ~no veo a nadie~.

@ Busco a la desarrolladora que entrevistamos. | Looking for the (specific) developer we interviewed. — marked
@ Busco un desarrollador con experiencia. | Looking for a (any) developer with experience. — unmarked

! Remember [[a + el → al]]: ~veo al profesor~. And don't confuse this a with the preposition of motion (~voy a Madrid~) — same byte, different opcode.
`,
  ex: [
    { t: "cz", q: "Veo ___ tu hermana en la cafetería. (one word, or “–” if none needed)", a: "a", note: "Specific person as direct object → personal a: veo a tu hermana." },
    { t: "mc", q: "Which is correct?", o: ["Veo al coche.", "Veo el coche.", "Veo a el coche."], i: 1, why: "Things never take the personal a. (And a + el would contract to al anyway.)" },
    { t: "tr", q: "I'm looking for my dog. (named family member!)", a: "busco a mi perro", alt: ["estoy buscando a mi perro"], traps: [{ re: "\\bbusco mi perro\\b", c: "E0601", m: "beloved pets take the personal a", n: "A specific, personified animal gets the marker: busco a mi perro." }, { re: "\\bbusco para\\b", c: "E0702", m: "buscar takes no preposition for its object", n: "buscar = to look FOR — the for is built in: busco X (or a X for persons)." }] },
    { t: "cz", q: "No conozco ___ nadie aquí.", a: "a", note: "nadie as an object is always marked: no conozco a nadie." },
    { t: "fix", q: "Llamo el médico mañana.", bad: "el", a: "al", why: "The doctor is a specific person: llamo al médico (a + el → al).", code: "E0601" },
    { t: "mc", q: "Busco un traductor que hable japonés — why no a?", o: ["Translators don't get the marker", "The person is hypothetical/non-specific, so the marker is off", "It's a mistake"], i: 1, why: "Non-specific persons are unmarked. Compare: busco al traductor que me recomendaste — that one exists and is identified, so marked." },
    { t: "tr", q: "She's calling her sister.", a: "llama a su hermana", alt: ["ella llama a su hermana", "está llamando a su hermana"], note: "Specific person → a su hermana." },
    { t: "cz", q: "Tengo ___ dos hermanas. (one word, or “–” if none needed)", a: "–", alt: ["-", "nada", ""], note: "Plain possession with tener skips the marker: tengo dos hermanas." }
  ]},

  { id: "obj-3", title: "indirect objects: the destination register", doc: `
The **indirect object** is the *to/for whom* of the verb — the recipient. Its pronouns differ from direct ones only in the third person, but that difference is where all the bugs live.

| person | direct | indirect |
| me | me | me |
| te | te | te |
| 3rd sg | lo / la | ~le~ |
| nos | nos | nos |
| os | os | os |
| 3rd pl | los / las | ~les~ |

@ Le doy el libro. | I give him/her the book. — recipient → le
@ Les mando el enlace. | I'm sending them the link.
@ Te traigo un café. | I'll bring you a coffee.

Note ~le~ is unisex: him or her. If it matters, clarify with [[a + person]]: ~le doy el libro **a ella**~.

## Redundant le — mandatory duplication

Here's a genuine oddity: when the recipient is named explicitly, the pronoun **still appears**. Spanish duplicates the indirect object almost always:

@ ~Le~ di las llaves ~a Marta~. | I gave Marta the keys. — le AND a Marta, both present
@ ¿~Les~ has escrito ~a tus padres~? | Have you written to your parents?

This isn't sloppiness — it's agreement. Think of le/les as a register the verb must load whenever a recipient exists, with the a-phrase as an optional debug label.

## Which case? The DI test

If the verb transfers something *to* someone, the someone is indirect (~le~), the something direct (~lo~). Verbs of giving, telling, sending, showing, asking: [[dar, decir, mandar, enviar, mostrar, pedir, contar, escribir, comprar (for), traer]] all take a recipient in le.

@ La vi ayer. | I saw her yesterday. — she's what was seen: direct → la
@ Le dije la verdad. | I told her the truth. — she's the receiver of the telling: indirect → le
`,
  ex: [
    { t: "cz", q: "___ escribo un correo a mi jefe. (to my boss)", a: "le", note: "Recipient → le, duplicated even though a mi jefe is explicit." },
    { t: "cz", q: "¿Qué ___ regalas a tus padres? (them)", a: "les", note: "Plural recipient → les." },
    { t: "tr", q: "I'm bringing you (tú) a coffee.", a: "te traigo un café", alt: ["te traigo un cafe"], note: "te covers both cases; traigo is the -go family." },
    { t: "mc", q: "“I saw her yesterday” — which pronoun?", o: ["Le vi ayer.", "La vi ayer.", "Se vi ayer."], i: 1, why: "She is the thing seen — direct object → la. le would make her a recipient. (You'll hear le vi in Madrid — leísmo — but la is the standard.)" },
    { t: "fix", q: "Lo dije la verdad a mi hermano.", bad: "Lo", a: "Le", why: "The brother receives the telling → indirect → le dije la verdad (a mi hermano). la verdad is the direct object.", code: "E0402" },
    { t: "tr", q: "I gave Marta the keys. (include the duplicate pronoun)", a: "le di las llaves a marta", alt: ["le di a marta las llaves"], traps: [{ re: "^di las llaves a marta$", c: "E0402", m: "the recipient pronoun is duplicated", n: "With an explicit recipient the le still appears: le di las llaves a Marta." }] },
    { t: "mc", q: "Why does le appear in le di las llaves a Marta when a Marta is already there?", o: ["Emphasis", "Clitic doubling: the indirect object register is loaded whether or not the full phrase appears", "It's optional and formal"], i: 1, why: "Indirect-object duplication is essentially mandatory in modern Spanish — treat le/les as verb agreement with the recipient." },
    { t: "cz", q: "¿ ___ pido un favor? (can I ask you-tú a favor?)", a: "te", note: "The person you ask is the recipient: te pido un favor." }
  ]},

  { id: "obj-4", title: "two pointers: se lo and the l-l rewrite", doc: `
Both pointers can ride the same verb. Two hard rules govern the pair:

**Rule 1 — order is fixed: indirect before direct.** ~me lo~, ~te la~, ~nos los~ — never the reverse.

@ ¿El informe? Te lo mando ahora. | The report? I'll send it to you now.
@ ¿Las fotos? Me las enseñó ayer. | The photos? She showed me them yesterday.

**Rule 2 — the l-l rewrite.** When both pronouns are third person, ~le/les + lo/la/los/las~ would produce two l-clitics in a row. Spanish forbids the sequence and rewrites the first to [[se]]:

@ le + lo → ~se lo~ | Se lo di. — I gave it to him.
@ les + la → ~se la~ | Se la expliqué. — I explained it to them.

! This ~se~ is a phonological escape hatch, unrelated to reflexive se. ~*Le lo di~ is as illegal as an unescaped quote in a string literal. And note ~se~ carries no number: whether the recipients are one or many, it's se — ~se lo dije (a ellos)~.

## Disambiguating se

Since se could point at him/her/you-formal/them, add an a-phrase when context doesn't resolve it: ~se lo di **a ella**~.

## Parsing practice

~¿Me lo puedes explicar?~ — me (to me) + lo (it) + puedes (you can) + explicar: “Can you explain it to me?”. Read clitic clusters left to right: recipient, then thing.

@ Te lo juro. | I swear (it) to you.
@ ¿Me la prestas? | Will you lend me it (f)?
@ Se lo digo mañana. | I'll tell him (it) tomorrow.
`,
  ex: [
    { t: "cz", q: "¿Me prestas tu cargador? — Sí, ___ ___ presto. (two words)", a: "te lo", note: "Recipient first (te), thing second (lo, el cargador)." },
    { t: "cz", q: "¿Le diste el código a Ana? — Sí, ___ ___ di ayer. (two words)", a: "se lo", note: "le + lo → se lo: the l-l rewrite." },
    { t: "mc", q: "Why is le lo di illegal?", o: ["le must follow lo", "Spanish forbids two l-clitics in sequence; le rewrites to se", "lo is redundant"], i: 1, why: "The l-l sequence is phonologically banned: le/les → se before lo/la/los/las. Se lo di." },
    { t: "tr", q: "The photos? I'll send them to you (tú) tomorrow.", a: "te las mando mañana", alt: ["¿las fotos? te las mando mañana", "te las envío mañana", "te las mandaré mañana"], note: "las fotos → las; recipient te comes first: te las mando." },
    { t: "fix", q: "¿La contraseña? Lo se di a Miguel.", bad: "Lo se", a: "Se la", why: "Order is indirect-then-direct, and the pointer must match its noun: la contraseña → la. le → se before it: se la di.", code: "E0401" },
    { t: "cz", q: "No entiendo esta función. ¿ ___ ___ explicas? (explain it to me — two words)", a: "me la", note: "la función → la; recipient me first: ¿me la explicas?" },
    { t: "tr", q: "I already told them (it). (use ya + decir, preterite “dije”)", a: "ya se lo dije", alt: ["se lo dije ya"], note: "les + lo → se lo. se stays singular-looking even for a plural recipient." },
    { t: "mc", q: "se la expliqué — who/what is la?", o: ["the recipient", "the thing explained (feminine)", "reflexive"], i: 1, why: "Clusters read recipient-then-thing: se = to him/her/them, la = the feminine thing explained." }
  ]},

  { id: "obj-5", title: "clitic placement: the attachment spec", doc: `
Clitic pronouns (me, te, lo, la, le, nos, os, los, las, les, se) can't float free — they bind to a verb in exactly one of two ways:

## Position A: before a conjugated verb (proclitic)

@ Lo veo. | I see it.
@ No lo veo. | Negation goes outside: no + clitic + verb.
@ Se lo he dicho. | Perfect tenses: before haber, never attached to the participle.

## Position B: attached to the end (enclitic) — three hosts only

1. **Infinitive**: ~verlo~, ~decírselo~
2. **Gerund**: ~viéndolo~, ~explicándomelo~
3. **Affirmative command**: ~dímelo~ (module mood.imperative)

## The choice point: verb + infinitive/gerund chains

With [[querer/poder/ir a/estar + gerund]] chains, both positions are legal and **equivalent** — clitic before the conjugated verb, or attached to the infinitive/gerund:

@ Lo quiero ver. = Quiero verlo. | I want to see it.
@ Te lo voy a mandar. = Voy a mandártelo. | I'm going to send it to you.
@ La estoy leyendo. = Estoy leyéndola. | I'm reading it.

What you can **not** do is drop it mid-chain: ~*quiero lo ver~ is a parse error.

## Accents preserve stress

Attaching clitics adds syllables but must not move the stress, so an accent mark appears where needed: ~explica~ → ~explíca**melo**~, ~diciendo~ → ~diciéndo**selo**~, ~mandar~ → ~mandár**telo**~. The stress stays on the same vowel; the mark just pins it.

! Placement bugs are the most common intermediate error in Spanish. When in doubt: **before the conjugated verb** is always safe (except affirmative commands, where attachment is mandatory).
`,
  ex: [
    { t: "mc", q: "Which are valid? “I want to buy it (el libro)”", o: ["Quiero lo comprar", "Lo quiero comprar / Quiero comprarlo (both)", "Only quiero comprarlo"], i: 1, why: "Clitic climbs before the conjugated verb or attaches to the infinitive — both standard. Mid-chain (quiero lo comprar) is a parse error." },
    { t: "cz", q: "Estoy leyendo el informe → Estoy ___ . (attach the pointer)", a: "leyéndolo", note: "Gerund + lo, with an accent to pin the original stress: leyéndolo." },
    { t: "fix", q: "No sé la respuesta, pero quiero la saber.", bad: "la saber", a: "saberla", why: "In a verb chain the clitic either climbs (la quiero saber) or attaches (quiero saberla) — never sits between.", code: "E0401" },
    { t: "tr", q: "I can't explain it (m) to you (tú) now. (two valid shapes — give either)", a: "no te lo puedo explicar ahora", alt: ["no puedo explicártelo ahora", "no puedo explicartelo ahora"], note: "Climb: no te lo puedo explicar. Attach: no puedo explicártelo (accent pins the stress)." },
    { t: "cz", q: "¿El bug? Están ___ ahora mismo. (fixing it — arreglar, attach)", a: "arreglándolo", alt: ["arreglandolo"], note: "estar + gerund with attachment: están arreglándolo = lo están arreglando." },
    { t: "mc", q: "Where does the clitic go in a perfect tense — he visto el error?", o: ["He vístolo", "Lo he visto", "He lo visto"], i: 1, why: "haber + participle is one unit; the clitic goes before haber: lo he visto. Nothing ever attaches to a participle." },
    { t: "tr", q: "I'm going to send it (f, la foto) to my mother.", a: "voy a mandársela a mi madre", alt: ["se la voy a mandar a mi madre", "voy a enviársela a mi madre", "se la voy a enviar a mi madre"], note: "les/le → se before la: mandársela, or climbed: se la voy a mandar." },
    { t: "cz", q: "explica + me + lo → ___ (affirmative command, one word)", a: "explícamelo", alt: ["explicamelo"], note: "Affirmative commands force attachment, accent pins the stress: explícamelo." }
  ]}
]});
