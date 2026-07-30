/* sintaxis curriculum — part 3/4: api.gustar, mood.imperative, mood.subjunctive */

window.CURRICULUM.push({
  id: "gust", name: "api.gustar", title: "Inverted interfaces",
  tagline: "gustar and friends call you back: inverted argument order, the whole verb family, no-fault se, and impersonal/passive se.",
  deps: ["obj"],
  lessons: [

  { id: "gust-1", title: "gustar: the callback pattern", doc: `
[[gustar]] does not mean *to like*. It means **to please**, and that inversion drives everything: the thing you like is the grammatical **subject**, and you are an **indirect object** receiving the pleasing.

@ Me gusta el café. | Coffee pleases me. → I like coffee.
@ Me gustan los trenes. | Trains please me. → I like trains.

## The two rules

1. **The verb agrees with the thing liked**, not the liker. One thing → ~gusta~; several → ~gustan~; an infinitive (or clause) → singular ~gusta~.
2. **The liker is an indirect-object clitic**: me, te, le, nos, os, les. Always present.

| liker | one thing | many things | doing something |
| yo | me gusta el mar | me gustan los mapas | me gusta nadar |
| tú | te gusta | te gustan | te gusta viajar |
| él/ella | le gusta | le gustan | le gusta leer |
| nosotros | nos gusta | nos gustan | nos gusta cocinar |
| vosotros | os gusta | os gustan | os gusta salir |
| ellos | les gusta | les gustan | les gusta jugar |

## The emphasis/disambiguation prefix: a mí, a ti, a él…

Since ~le~ is ambiguous, or for contrast, prepend [[a + person]] — the clitic still appears (same duplication rule as obj-3):

@ A Marta le gusta el jazz. | Marta likes jazz. — a Marta AND le
@ A mí me gusta, pero a él no le gusta. | I like it, but he doesn't.

## Negation and questions

@ No me gusta nada esta API. | I don't like this API at all.
@ ¿Te gusta el vino? — Sí, me encanta. | Do you like wine? — I love it.

!! The one answer the compiler will always reject: ~*yo gusto café~. You are not the subject. If you catch yourself conjugating gustar in first person to say you like something, roll back and re-invert. (First-person gustar exists but means *I am pleasing*: ~¿gusto?~ — not what you meant.)
`,
  ex: [
    { t: "cz", q: "Me ___ (gustar) los lenguajes con tipos estáticos.", a: "gustan", note: "Plural subject (los lenguajes) → gustan. The verb agrees with the thing, not with me." },
    { t: "tr", q: "I like this song a lot.", a: "me gusta mucho esta canción", alt: ["esta canción me gusta mucho", "me gusta mucho esta cancion"], traps: [{ re: "\\byo gusto\\b|\\bgusto esta\\b", c: "E0701", m: "gustar inverts: the song is the subject", n: "me gusta esta canción — the song pleases me. yo gusto would mean I am pleasing." }] },
    { t: "cz", q: "A mi hermana ___ ___ (gustar) viajar sola. (clitic + verb)", a: "le gusta", note: "An infinitive counts as singular: le gusta viajar. The a-phrase doesn't replace le." },
    { t: "mc", q: "“We like the new offices” — pick the correct form:", o: ["Nos gustamos las oficinas nuevas", "Nos gustan las oficinas nuevas", "Gustamos las oficinas nuevas"], i: 1, why: "The offices are the subject (plural → gustan); we are the receivers (nos). nos gustamos would mean “we like each other/ourselves”." },
    { t: "tr", q: "She doesn't like flying. (volar)", a: "no le gusta volar", alt: ["a ella no le gusta volar"], note: "Infinitive subject → singular gusta; no before the clitic." },
    { t: "fix", q: "¿A ti gusta el flamenco?", bad: "gusta", a: "te gusta", why: "The a-phrase (a ti) never replaces the clitic — both appear: ¿A ti te gusta el flamenco? The le/te is agreement, not an option.", code: "E0701" },
    { t: "tr", q: "I like it (the plan, m), but they don't like it.", a: "a mí me gusta pero a ellos no les gusta", alt: ["a mí me gusta, pero a ellos no les gusta", "me gusta pero a ellos no les gusta", "a mi me gusta pero a ellos no les gusta"], note: "Contrast via a-phrases: a mí… a ellos, each with its clitic still in place." }
  ]},

  { id: "gust-2", title: "the gustar family: one pattern, twenty verbs", doc: `
The inverted interface isn't a gustar quirk — it's a whole class of verbs. Learn the pattern once, and each new member costs one vocabulary slot:

| verb | meaning | example |
| encantar | to delight (love) | Me encanta este sitio. |
| interesar | to interest | ¿Te interesa el puesto? |
| importar | to matter | No me importa el dinero. |
| molestar | to bother | Me molesta el ruido. |
| doler (ue) | to hurt | Me duele la cabeza. |
| faltar | to be lacking | Nos falta un ingrediente. |
| quedar | to remain to | Me quedan dos días de vacaciones. |
| sobrar | to be surplus | Sobra comida. |
| apetecer | to appeal (fancy) | ¿Te apetece un café? |
| parecer | to seem | Me parece una buena idea. |
| tocar | to be one's turn | Te toca. |
| dar miedo/igual | to scare / be all the same | Me da igual. |
| hacer falta | to be needed | No hace falta. |
| costar (ue) | to be an effort | Me cuesta madrugar. |

Some high-value idioms from that table:

@ ¿Te apetece una caña? | Fancy a beer? — THE Spain social verb
@ Me da igual. | I don't mind either way.
@ ¿Qué te parece? | What do you think (of it)?
@ Me cuesta entender los subjuntivos. | I find the subjunctive hard.
@ Te toca revisar el código. | It's your turn to review the code.

## doler: body parts, definite article

Like the reflexive-with-body-parts rule, ~doler~ takes the definite article, and agreement follows the part:

@ Me duele la cabeza. | My head hurts.
@ ¿Te duelen los pies? | Do your feet hurt?

! ~encantar~ is already superlative — never ~*me encanta mucho~. Intensity is built in: me gusta < me gusta mucho < me encanta.
`,
  ex: [
    { t: "cz", q: "___ ___ (encantar, a mí) los mapas antiguos. (clitic + verb)", a: "me encantan", note: "Plural subject → encantan." },
    { t: "tr", q: "My head hurts and my eyes hurt too.", a: "me duele la cabeza y también me duelen los ojos", alt: ["me duele la cabeza y me duelen los ojos también", "me duele la cabeza y también me duelen los ojos"], note: "duele/duelen agrees with the body part; definite articles, not possessives." },
    { t: "cz", q: "¿Te ___ (apetecer) salir a cenar?", a: "apetece", note: "Infinitive subject → singular: ¿te apetece salir? — the standard Spain invitation." },
    { t: "mc", q: "Me quedan dos días de vacaciones means:", o: ["I'm staying two days on holiday", "I have two days of holiday left", "I missed two holiday days"], i: 1, why: "quedar in the inverted pattern = remain-to: two days remain to me. (quedarse = stay; quedar con = arrange to meet — three APIs, one verb.)" },
    { t: "fix", q: "Me encanta mucho tu casa.", bad: "mucho", a: "–", why: "encantar is already maximal — me encanta tu casa. Grading intensity onto it is like writing very unique.", code: "E0001" },
    { t: "tr", q: "It's your (tú) turn to wash up. (fregar los platos)", a: "te toca fregar los platos", alt: ["te toca lavar los platos"], note: "tocar inverted = be someone's turn: te toca + infinitive." },
    { t: "cz", q: "¿Qué os ___ (parecer) la propuesta? (what do you lot think of it?)", a: "parece", note: "parecer inverted: the proposal seems-to you: ¿qué os parece?" },
    { t: "tr", q: "We're missing two chairs. (faltar)", a: "nos faltan dos sillas", alt: ["faltan dos sillas"], note: "faltar: the missing things are the subject → faltan; we're the affected party → nos." }
  ]},

  { id: "gust-3", title: "no-fault se: exception handling for accidents", doc: `
Spanish has a dedicated construction for accidents that diffuses responsibility — the **se accidental**. Instead of *I dropped the glass* (agentive, confessional), Spanish says *the glass dropped itself on me*:

@ Se me cayó el vaso. | The glass fell (on me) — I dropped it, no fault implied.
@ Se me olvidaron las llaves. | The keys forgot themselves on me — I forgot the keys.
@ Se nos acabó el café. | We've run out of coffee.
@ Se le rompió el portátil. | His laptop broke (on him).

## The pattern, disassembled

[[se + [me/te/le/nos/os/les] + verb + subject]]

- ~se~ — marks the event as spontaneous/agentless
- the indirect clitic — flags the *affected party* (whose problem it now is)
- the verb **agrees with the thing**, exactly like gustar: ~se me cayó el vaso~ / ~se me cayeron los vasos~

## The core accident verbs

~caerse~ (drop) · ~olvidarse~ (forget) · ~perderse~ (lose) · ~romperse~ (break) · ~acabarse / terminarse~ (run out) · ~quedarse~ (leave behind: ~se me quedó el móvil en casa~) · ~ocurrirse~ (occur to — for ideas!)

@ Se me perdió el pasaporte. | I lost my passport (it got lost on me).
@ ¿Se te ocurre algo mejor? | Can you think of anything better? — ideas arrive via accidental se
@ Se me ha olvidado tu nombre. | I've forgotten your name. — works in any tense

## Why bother? Register and honesty

You *can* say ~olvidé las llaves~ or ~rompí el vaso~ — grammatical, and it reads as owning the act. The se version is what people actually say for genuine accidents. Spanish grammar encodes the difference between *I broke it* (agent) and *it broke on my watch* (custodian) — a distinction English needs tone for.

! Word order: the thing usually follows the verb (~se me cayó el vaso~), and the a-phrase can clarify le/les: ~a Juan se le olvidó la reunión~.
`,
  ex: [
    { t: "cz", q: "___ ___ ___ (olvidarse, a mí) la contraseña. (three words)", a: "se me olvidó", alt: ["se me ha olvidado"], note: "se + affected me + verb agreeing with la contraseña (singular)." },
    { t: "cz", q: "Se nos ___ (acabar) las ideas.", a: "acabaron", alt: ["han acabado", "acabaron"], note: "las ideas is plural → acabaron. The affected party (nos) doesn't control agreement." },
    { t: "tr", q: "I dropped the keys. (accident, not confession)", a: "se me cayeron las llaves", alt: ["se me han caído las llaves"], traps: [{ re: "^caí las llaves|^dejé caer", c: "E0302", m: "accidents use the se-construction", n: "The idiomatic frame is se me cayeron las llaves — the keys fell on me. caí = I fell." }] },
    { t: "mc", q: "Se le rompió el móvil a Marta — who broke what?", o: ["Marta deliberately broke the phone", "Marta's phone broke (accident, she's the affected party)", "The phone broke Marta"], i: 1, why: "se = spontaneous event; le…a Marta = affected party; el móvil = subject. Accident semantics, no blame." },
    { t: "tr", q: "We've run out of milk.", a: "se nos acabó la leche", alt: ["se nos ha acabado la leche", "se nos terminó la leche", "se nos ha terminado la leche"], note: "acabarse + affected nos; la leche singular → acabó." },
    { t: "cz", q: "¿No ___ ___ ___ (ocurrirse, a ti) nada? (three words — can't you think of anything?)", a: "se te ocurre", note: "Ideas occur-themselves to you: ¿no se te ocurre nada?" },
    { t: "tr", q: "He left his laptop at home. (quedarse — accidental)", a: "se le quedó el portátil en casa", alt: ["se le ha quedado el portátil en casa"], note: "quedarse accidental: the laptop stayed-itself on him at home. Affected party → le." }
  ]},

  { id: "gust-4", title: "impersonal & passive se: subjectless code", doc: `
Two more se constructions complete the family — both remove the agent entirely. Spanish strongly prefers them where English uses the passive voice or “you/one/they”.

## Passive se: the thing does itself

[[se + 3rd-person verb]], agreeing with the thing — for processes, notices, instructions:

@ Se venden pisos. | Flats for sale. — flats sell themselves
@ Aquí se habla inglés. | English spoken here.
@ El vino se sirve frío. | The wine is served cold.
@ Los tests se ejecutan en cada push. | The tests run on every push.

Agreement rule as ever: ~se vende un piso~ / ~se venden dos pisos~.

## Impersonal se: “one does”

With intransitive verbs or generalisations, invariable singular — the Spanish “you/one”:

@ ¿Cómo se dice “deadlock” en español? | How do you say “deadlock” in Spanish?
@ Se trabaja bien aquí. | It's a good place to work — one works well here.
@ No se puede fumar. | No smoking — one cannot smoke.
@ ¿Por dónde se va al centro? | How does one get to the centre?

~¿Cómo se dice…?~ and ~¿cómo se escribe…?~ are your two most useful learner sentences — they let Spanish bootstrap more Spanish.

## Why English speakers underuse this

English defaults to passive voice (“mistakes were made”) or generic *you*. Spanish reaches for se first. Documentation, signs, recipes and technical writing are wall-to-wall se:

@ Se recomienda hacer una copia de seguridad. | Making a backup is recommended.
@ Primero se compila, luego se despliega. | First you compile, then you deploy.

! Don't confuse the cast: reflexive se (~se ducha~ — washes himself), reciprocal se (~se conocen~ — each other), the l-l rewrite se (~se lo di~), accidental se (~se me cayó~), passive/impersonal se (~se venden~). Same byte, five opcodes — context is the decoder. There's a man page (man se) summarising all five.
`,
  ex: [
    { t: "cz", q: "¿Cómo ___ ___ (decir) “branch” en español? (two words)", a: "se dice", note: "The impersonal question: ¿cómo se dice…? Answer: rama." },
    { t: "cz", q: "___ ___ (vender) dos plazas de garaje. (two words, watch agreement)", a: "se venden", note: "Passive se agrees with the things sold: se venden dos plazas." },
    { t: "tr", q: "You can't park here. (impersonal)", a: "no se puede aparcar aquí", alt: ["aquí no se puede aparcar", "no se puede aparcar aqui"], note: "Impersonal prohibition: no se puede + infinitive." },
    { t: "mc", q: "Spanish signs say Se alquila piso rather than Piso es alquilado because:", o: ["The passive with ser is ungrammatical", "Spanish strongly prefers passive se for processes/notices; ser-passive reads as stiff prose", "alquilar is irregular"], i: 1, why: "Both exist, but the se-passive is the idiomatic default. The ser-passive lives mainly in journalism and formal writing." },
    { t: "tr", q: "First the data is validated, then it's saved. (validar, guardar)", a: "primero se validan los datos y luego se guardan", alt: ["primero se validan los datos, luego se guardan", "primero se valida los datos y luego se guarda", "primero se validan los datos luego se guardan"], note: "los datos is plural → se validan, se guardan. Textbook technical se. (se valida los datos is heard but non-standard.)" },
    { t: "cz", q: "En esta empresa ___ ___ (trabajar) demasiado. (two words — impersonal)", a: "se trabaja", note: "Intransitive generalisation → invariable singular: se trabaja demasiado." },
    { t: "mc", q: "se conocen — pick the FALSE reading:", o: ["They know each other", "People know each other (generic)", "He knows himself deeply"], i: 2, why: "se conocen is plural — reciprocal or impersonal-ish; “he knows himself” would be se conoce. Same clitic, resolved by number and context." },
    { t: "tr", q: "How do you get to the station? (impersonal ir)", a: "¿cómo se va a la estación?", alt: ["como se va a la estacion", "¿por dónde se va a la estación?"], note: "Impersonal se + ir: how does one get to…" }
  ]},

  { id: "gust-5", title: "integration: opinions, aches and accidents", doc: `
Module integration — the whole inverted-interface toolkit in realistic contexts. First, the mini-phrasebook this module unlocked:

@ Me encanta. / Me da igual. / No me importa. | Love it. / Either way. / Don't care.
@ ¿Qué te parece? — Me parece bien. | What do you think? — Fine by me.
@ ¿Te apetece…? — Vale, ¡venga! | Fancy…? — OK, go on then!
@ Me cuesta… | I find it hard to…
@ Se me ha olvidado. / Se me ha ido el santo al cielo. | I forgot. / It slipped my mind completely.
@ ¿Cómo se dice…? | How do you say…?

## Reading agreement under pressure

The unifying skill for this module is tracking **what the grammatical subject really is** while your instincts scream that *you* are the subject:

- ~me gustan~ → things (pl) please me
- ~me duelen los pies~ → the feet (pl) hurt at me
- ~se me cayeron~ → the things (pl) fell on me
- ~se venden pisos~ → flats (pl) sell themselves

Four constructions, one rule: **find the thing, agree with the thing.**

! From here the curriculum turns to the imperative and then the subjunctive — the mood modules. The clitic mechanics you've drilled here (placement, se-rewrites, agreement) are load-bearing for both.
`,
  ex: [
    { t: "tr", q: "I love Spanish tortilla, but I find the subjunctive hard.", a: "me encanta la tortilla española pero me cuesta el subjuntivo", alt: ["me encanta la tortilla española, pero me cuesta el subjuntivo", "me encanta la tortilla pero me cuesta el subjuntivo"], note: "encantar + costar, both inverted, both agreeing with their things." },
    { t: "cz", q: "A mis padres no ___ ___ (importar) el ruido, pero a mí ___ ___ (molestar) mucho. (clitic + verb, twice)", a: "les importa, me molesta", alt: ["les importa me molesta"], note: "Two inverted verbs, two affected parties, singular thing (el ruido) both times." },
    { t: "tr", q: "My feet hurt — we walked for five hours.", a: "me duelen los pies caminamos cinco horas", alt: ["me duelen los pies, caminamos cinco horas", "me duelen los pies porque caminamos cinco horas", "me duelen los pies anduvimos cinco horas"], note: "duelen (plural feet) + preterite for the bounded walk." },
    { t: "cz", q: "___ ___ ___ (perderse, a nosotros) los billetes. (three words — we lost the tickets, accidental)", a: "se nos perdieron", note: "Accidental se: se + nos + verb agreeing with los billetes (plural)." },
    { t: "mc", q: "¿Te apetece una caña? — the natural yes is:", o: ["Sí, me apetezco", "¡Vale, venga!", "Sí, yo apetezco una"], i: 1, why: "apetecer stays inverted (me apetece), but the idiomatic answer is just vale/venga. Never conjugate yourself as its subject." },
    { t: "tr", q: "It seems like a good idea to me, but we're missing time. (faltar)", a: "me parece una buena idea pero nos falta tiempo", alt: ["me parece una buena idea, pero nos falta tiempo", "me parece buena idea pero nos falta tiempo"], note: "parecer + faltar, both inverted: the idea seems, the time is-lacking." },
    { t: "cz", q: "¿Cómo ___ ___ (escribir) tu apellido? (two words)", a: "se escribe", note: "Impersonal se: how is your surname spelled/written?" },
    { t: "tr", q: "I've forgotten the password again. (accidental se, perfect)", a: "se me ha olvidado la contraseña otra vez", alt: ["se me ha olvidado otra vez la contraseña", "otra vez se me ha olvidado la contraseña"], note: "Accidental se in the perfect: se me ha olvidado. Agreement with la contraseña (singular)." }
  ]}
]});

window.CURRICULUM.push({
  id: "impv", name: "mood.imperative", title: "Imperative mode",
  tagline: "Direct commands: the tú forms and their eight irregulars, the subjunctive-powered formal and negative forms, and clitic attachment with accent rules.",
  deps: ["obj", "pret"],
  lessons: [

  { id: "impv-1", title: "affirmative tú commands + the famous eight", doc: `
Commands (the **imperative**) are Spanish's only genuinely word-order-changing mood, and the gateway drug to the subjunctive. Start with the informal singular.

## The rule: steal the él form

The affirmative tú command **is the third-person singular present**:

@ hablar → ¡Habla más despacio! | Speak more slowly!
@ comer → ¡Come algo! | Eat something!
@ pedir → ¡Pide ayuda! | Ask for help! — stem changes carry over: pide

## The famous eight (monosyllabic irregulars)

| verb | command | | verb | command |
| decir | ~di~ | | salir | ~sal~ |
| hacer | ~haz~ | | ser | ~sé~ |
| ir | ~ve~ | | tener | ~ten~ |
| poner | ~pon~ | | venir | ~ven~ |

Mnemonic: they're the -go family plus ser/ir, squashed to one syllable. ~sé~ (be!) carries the same accent as sé (I know); ~ve~ (go!) collides with ve (he sees) — context sorts it.

@ ¡Dime! | Tell me! — di + me
@ Haz un commit antes de salir. | Make a commit before you leave.
@ ¡Ven aquí! | Come here!
@ Ten paciencia. | Be patient. (have patience)

## vosotros: the easiest form in Spanish

Replace the infinitive's final -r with **-d**: ~hablad, comed, venid, decid~. No exceptions at all.

@ ¡Venid a ver esto! | (You lot) come and see this!
@ Abrid los portátiles. | Open your laptops.

(Colloquial Spain often just uses the infinitive — ~¡venir!~ — you'll hear it, but write the -d form.)

! Clitics attach to affirmative commands (¡dímelo!) — that's lesson impv-4. For now, bare commands.
`,
  ex: [
    { t: "cz", q: "¡ ___ (hablar, tú) con el equipo antes de decidir!", a: "habla", note: "tú command = él form: habla." },
    { t: "cz", q: "¡ ___ (venir, tú) un momento!", a: "ven", note: "One of the famous eight: ven." },
    { t: "drill", verbs: ["hablar", "comer", "escribir", "pedir", "volver", "empezar"], tense: "pres", persons: [2], n: 4 },
    { t: "tr", q: "Make a backup and restart the server. (tú: hacer una copia de seguridad, reiniciar)", a: "haz una copia de seguridad y reinicia el servidor", alt: ["haz un backup y reinicia el servidor"], note: "haz (famous eight) + reinicia (regular tú command)." },
    { t: "mc", q: "Why does ¡pide ayuda! keep the stem change?", o: ["It's an exception", "The tú command is the él present form, so whatever happens there carries over: pide", "Commands always change stems"], i: 1, why: "The command isn't a new form — it's a reuse. e→i in él (pide) → e→i in the command." },
    { t: "cz", q: "¡ ___ (tener, tú) cuidado con esa rama! (careful — and yes, rama = branch)", a: "ten", note: "ten cuidado = be careful. Famous eight." },
    { t: "tr", q: "(You lot) Bring your laptops tomorrow. (traer, vosotros)", a: "traed los portátiles mañana", alt: ["traed vuestros portátiles mañana", "traed los portatiles mañana"], note: "vosotros command: infinitive -r → -d, zero exceptions: traed." },
    { t: "cz", q: "¡ ___ (ser, tú) razonable!", a: "sé", note: "sé — same written accent as “I know”; the eight includes ser." }
  ]},

  { id: "impv-2", title: "usted, ustedes, nosotros: commands from the subjunctive", doc: `
Every other command form — formal, plural-formal, and “let's” — is borrowed wholesale from the **present subjunctive**. This lesson is therefore your first hands-on subjunctive drill, two modules early. The recipe:

1. Take the **yo** present: ~tengo, hago, pido, conozco~
2. Drop the -o: ~teng-, hag-, pid-, conozc-~
3. Add **opposite-class** endings: -ar verbs take -e endings; -er/-ir verbs take -a endings.

| infinitive | yo | usted | ustedes | nosotros |
| hablar | hablo | habl~e~ | habl~en~ | habl~emos~ |
| comer | como | com~a~ | com~an~ | com~amos~ |
| hacer | hago | hag~a~ | hag~an~ | hag~amos~ |
| pedir | pido | pid~a~ | pid~an~ | pid~amos~ |
| traer | traigo | traig~a~ | traig~an~ | traig~amos~ |

This is why the irregular yo forms of pres-3 were worth over-learning: they're the seed of every one of these.

@ Pase, por favor. | Come in, please. (usted)
@ Esperen aquí. | Wait here. (ustedes)
@ Hagamos una prueba. | Let's run a test.

## The orthographic patches apply

Same spelling rules as the preterite-yo: ~busque~ (usted, from buscar), ~llegue~, ~empiece~ — c→qu, g→gu, z→c before e.

@ Saque una copia, por favor. | Make a copy, please.

## The five rebels

Verbs whose yo doesn't end in -o have irregular subjunctives — preview: ~sea~ (ser), ~vaya~ (ir), ~esté~ (estar), ~dé~ (dar), ~sepa~ (saber). Plus ~haya~ (haber).

@ Vaya con cuidado. | Go carefully. (usted)
@ No sea impaciente. | Don't be impatient. (usted)

## nosotros = let's

~hagamos~ (let's do), ~veamos~ (let's see), ~empecemos~ (let's start). One exception: *let's go* is ~¡vamos!~, not vayamos.
`,
  ex: [
    { t: "cz", q: "___ (pasar, usted), la doctora le espera.", a: "pase", note: "-ar verb → -e ending for usted: pase." },
    { t: "cz", q: "___ (hacer, ustedes) los ejercicios antes del viernes.", a: "hagan", note: "hago → hag- → hagan. The yo form is the seed." },
    { t: "tr", q: "Let's start with the tests. (empezar)", a: "empecemos con los tests", alt: ["empecemos por los tests", "empecemos con las pruebas"], note: "nosotros command = subjunctive: empecemos (z→c patch before e)." },
    { t: "mc", q: "The usted command of conducir is:", o: ["conduzca", "conduce", "conducí"], i: 0, why: "yo conduzco → conduzc- + a → conduzca. The él-form trick is tú-only; usted always routes through the subjunctive." },
    { t: "cz", q: "___ (ir, usted) al mostrador tres.", a: "vaya", note: "One of the rebels: ir → vaya." },
    { t: "tr", q: "Wait (ustedes) one moment, please.", a: "esperen un momento por favor", alt: ["esperen un momento, por favor"], note: "-ar → -en for ustedes: esperen." },
    { t: "cz", q: "___ (ver, nosotros) el diff antes de aprobar. (let's see)", a: "veamos", note: "veo → ve- → veamos. Let's-commands are the nosotros subjunctive." },
    { t: "fix", q: "Busce el error en los logs, por favor.", bad: "Busce", a: "Busque", why: "-car patches c → qu before e: busque. Same orthography as the preterite busqué.", code: "E0302" }
  ]},

  { id: "impv-3", title: "negative commands: all subjunctive, all the time", doc: `
Negative commands are brutally consistent: **every person uses the present subjunctive**, including tú and vosotros. The él-form trick and the -d form are affirmative-only.

| person | affirmative | negative |
| tú | habla | no ~hables~ |
| usted | hable | no hable |
| nosotros | hablemos | no hablemos |
| vosotros | hablad | no ~habléis~ |
| ustedes | hablen | no hablen |

So tú flips ending class when negated: ~come → no comas~, ~pide → no pidas~, ~haz → no hagas~.

@ No toques ese cable. | Don't touch that cable.
@ No hagáis deploy en viernes. | (You lot) don't deploy on a Friday.
@ No sea tan modesto. | Don't be so modest. (usted)
@ No vayas todavía. | Don't go yet.

## The asymmetry, explained once

Affirmative commands are direct speech acts — old imperative forms survive there. Negative commands historically ran through “(I want) that you not…” — a subjunctive frame with the trigger elided. ~No hables~ is the visible half of ~(quiero que) no hables~. This is exactly the machinery the subjunctive module generalises; commands are its training wheels.

## The famous eight, negated — regular!

The monosyllabic irregulars vanish under negation; the subjunctive stems take over:

| di → no digas | haz → no hagas | ve → no vayas | pon → no pongas |
| sal → no salgas | sé → no seas | ten → no tengas | ven → no vengas |

@ No me digas. | You don't say! / No way! — fossilised as an interjection
@ No te pongas nervioso. | Don't get nervous.
`,
  ex: [
    { t: "cz", q: "No ___ (tocar, tú) nada en producción.", a: "toques", note: "Negative tú = subjunctive, with the -car patch: no toques." },
    { t: "cz", q: "No ___ (hacer, vosotros) caso a los logs viejos.", a: "hagáis", note: "Negative vosotros = subjunctive: no hagáis. (hacer caso = pay attention to.)" },
    { t: "tr", q: "Don't go (tú) yet — the meeting hasn't finished.", a: "no vayas todavía la reunión no ha terminado", alt: ["no vayas todavía, la reunión no ha terminado", "no te vayas todavía la reunión no ha terminado", "no te vayas todavía, la reunión no ha terminado"], note: "Negative of ve is no vayas (or no te vayas for “don't leave”). Subjunctive stem vay-." },
    { t: "mc", q: "The negative tú command of ser is:", o: ["no sés", "no seas", "no eres"], i: 1, why: "All negatives route through the subjunctive: ser → sea → no seas." },
    { t: "drill", verbs: ["hablar", "comer", "hacer", "ir", "poner", "decir"], tense: "subj", persons: [1], n: 5 },
    { t: "cz", q: "No ___ (perder, tú) tiempo con ese refactor.", a: "pierdas", note: "Stem change survives in the subjunctive boot: no pierdas." },
    { t: "tr", q: "Don't tell (tú) me the ending! (el final)", a: "no me cuentes el final", alt: ["no me digas el final"], note: "Negative command with a clitic: the pronoun goes BEFORE the verb (no me cuentes) — full placement rules next lesson." },
    { t: "fix", q: "¡No habla tan rápido, por favor!", bad: "habla", a: "hables", why: "habla is the affirmative command. Negation flips to the subjunctive: no hables tan rápido.", code: "E0801" }
  ]},

  { id: "impv-4", title: "clitics on commands: attachment and the accent rule", doc: `
Commands complete the clitic-placement spec from obj-5:

- **Affirmative → attach** (enclitic, mandatory): ~dime~, ~cómpralo~, ~levántate~
- **Negative → detach** (proclitic, mandatory): ~no me digas~, ~no lo compres~, ~no te levantes~

@ Dímelo. / No me lo digas. | Tell me (it). / Don't tell me (it).
@ Mándaselo. / No se lo mandes. | Send it to him. / Don't send it to him.
@ Siéntate. / No te sientes. | Sit down. / Don't sit down.

Order within the cluster is unchanged: indirect before direct, se-rewrite as usual.

## The accent rule (this is pure mechanics)

Attaching syllables must not move the spoken stress. Spanish stress defaults to the second-to-last syllable; when clitics push the stressed syllable deeper, a written accent pins it:

- ~di~ + me → ~dime~ (stress still fine, no mark)
- ~di~ + me + lo → ~dí**me**lo~ → written ~dímelo~ (stress now 3rd-from-last → mark)
- ~compra~ + lo → ~cómpralo~ · ~manda~ + se + lo → ~mándaselo~

Rule of thumb: **one clitic on a multi-syllable command usually needs the accent; two clitics always do.**

## Two special nosotros/vosotros clips

- nosotros + nos drops the -s: ~sentemos + nos → sentémonos~ (let's sit)
- vosotros + os drops the -d: ~sentad + os → sentaos~ (sit down, you lot)

@ ¡Vámonos! | Let's go! — vamos + nos, s dropped

## Politeness engineering

Bare imperatives are fine among peers in Spain (~pásame la sal~ is normal at any table), but you can always soften: ~por favor~, the conditional (~¿podrías…?~ — fut-3), or ~¿me pasas la sal?~ (present-as-request). Spanish softens with grammar, not with volume.
`,
  ex: [
    { t: "cz", q: "¿El informe? ___ (mandar + me + lo, tú) esta tarde. (one word)", a: "mándamelo", alt: ["mandamelo"], note: "Affirmative → attach both clitics, accent pins the stress: mándamelo." },
    { t: "cz", q: "No ___ ___ ___ (decir + se + lo, tú) a nadie. (three words)", a: "se lo digas", note: "Negative → detach: no se lo digas." },
    { t: "tr", q: "Sit down (tú) and tell me everything.", a: "siéntate y cuéntamelo todo", alt: ["siéntate y dímelo todo", "sientate y cuentamelo todo", "siéntate y cuéntame todo"], note: "Two affirmatives, both with attached clitics and accents: siéntate, cuéntamelo." },
    { t: "mc", q: "Turn dímelo negative:", o: ["no dímelo", "no me lo digas", "no digas me lo"], i: 1, why: "Negation detaches the clitics and fronts them: no me lo digas — subjunctive verb, pronouns before." },
    { t: "cz", q: "¡ ___ ! (let's go — the idiom)", a: "vámonos", alt: ["vamonos"], note: "vamos + nos → vámonos (the -s drops before nos)." },
    { t: "fix", q: "¡Levantaos y sentados delante!", bad: "sentados", a: "sentaos", why: "vosotros + os drops the -d: sentad + os → sentaos. (levantaos is already correct: levantad + os.) sentados is the participle “seated”.", code: "E0801" },
    { t: "tr", q: "Buy it (f, la entrada) now — don't wait.", a: "cómprala ya no esperes", alt: ["cómprala ya, no esperes", "cómprala ahora no esperes", "comprala ya no esperes", "cómprala ahora, no esperes"], note: "Affirmative attach (cómprala) + negative subjunctive (no esperes)." },
    { t: "cz", q: "¿Estas fotos? ___ (enviar + se + las, tú) a tu madre. (one word)", a: "envíaselas", alt: ["enviaselas", "mándaselas", "mandaselas"], note: "Attach se + las: envíaselas — accent keeps the stress on ví." }
  ]},

  { id: "impv-5", title: "commands in the wild: requests, signs and recipes", doc: `
Integration lesson: real-world command Spanish, plus the softening spectrum from drill-sergeant to diplomat.

## The softening spectrum

| register | form | example |
| direct | imperative | Pásame la sal. |
| neutral | present-as-question | ¿Me pasas la sal? |
| soft | poder present | ¿Puedes pasarme la sal? |
| polite | conditional | ¿Podrías pasarme la sal? |
| formal | conditional + importar | ¿Te importaría pasarme la sal? |

All five are everyday Spanish; pick by relationship, not by fear. Overshooting politeness with close colleagues reads as sarcasm — exactly like English “would you be so kind as to merge my PR”.

## que + subjunctive: third-party commands

Command someone not present by prefixing [[que]] — “let him/may she…”:

@ Que pase el siguiente. | Next, please. (let the next one come in)
@ Que lo revise Marta. | Have Marta review it.
@ ¡Que aproveche! | Enjoy your meal! (may it benefit you)
@ ¡Que te mejores! | Get well soon!

## Signs and instructions

Public Spanish commands with infinitives and se-constructions as much as imperatives:

@ No fumar. / No tocar. | No smoking. / Don't touch. — bare infinitive on signs
@ Empujar. / Tirar. | Push. / Pull. — on every door in Spain
@ Añadir la cebolla y remover. | Add the onion and stir. — recipe infinitives

## Giving directions

@ Sigue todo recto y gira a la derecha en el semáforo. | Go straight on and turn right at the lights.
@ Coja la segunda salida. | Take the second exit. (usted — and yes, coger is a perfectly polite verb in Spain)
`,
  ex: [
    { t: "tr", q: "Go straight on (tú) and take the first street on the left.", a: "sigue todo recto y coge la primera calle a la izquierda", alt: ["sigue recto y coge la primera calle a la izquierda", "sigue todo recto y toma la primera calle a la izquierda"], note: "sigue (e→i carries into the command) + coge/toma." },
    { t: "cz", q: "¡Que ___ (aprovechar)! (bon appétit)", a: "aproveche", note: "The fossilised third-party command: ¡que aproveche!" },
    { t: "mc", q: "A colleague you know well is blocking your PR. The right register is:", o: ["Apruébamelo ya.", "¿Me revisas el PR cuando puedas?", "¿Le importaría a usted considerar la aprobación?"], i: 1, why: "Peer + mild request → present-as-question: ¿me revisas…? The imperative is pushy here; the usted construction is sarcastic." },
    { t: "cz", q: "Que lo ___ (decidir) el equipo — yo no me meto.", a: "decida", note: "que + subjunctive delegates the command: let the team decide it." },
    { t: "tr", q: "Get well soon! (tú)", a: "¡que te mejores!", alt: ["que te mejores"], note: "que + reflexive subjunctive: the standard well-wishing formula." },
    { t: "mc", q: "Doors in Spain say Empujar / Tirar because:", o: ["They're typos for commands", "Signs use the bare infinitive as an impersonal imperative", "They're nouns"], i: 1, why: "Public notices command with infinitives: no fumar, no tocar, empujar. Aimed at everyone, so no person is conjugated." },
    { t: "tr", q: "Add the garlic, stir, and don't let it burn. (recipe infinitives; dejar que se queme)", a: "añadir el ajo remover y no dejar que se queme", alt: ["añadir el ajo, remover y no dejar que se queme", "añade el ajo remueve y no dejes que se queme", "añade el ajo, remueve y no dejes que se queme"], note: "Recipe register: infinitives throughout (or consistent tú commands — both accepted here)." },
    { t: "cz", q: "___ (venir, usted) conmigo, por favor. ___ (no preocuparse, usted) por la maleta. (two commands)", a: "venga, no se preocupe", alt: ["venga no se preocupe"], note: "usted affirmative (venga) + usted negative with detached clitic (no se preocupe)." }
  ]}
]});

window.CURRICULUM.push({
  id: "subj", name: "mood.subjunctive", title: "Unevaluated expressions",
  tagline: "The subjunctive is lazy evaluation: clauses that are wished, doubted, felt or judged — not asserted. Formation, then the trigger families one by one.",
  deps: ["impv"],
  lessons: [

  { id: "subj-1", title: "what the subjunctive actually is", doc: `
Every Spanish learner's boss fight — and it's badly taught everywhere, so let's do it properly. The **subjunctive is not a tense**; it's a **mood**: a marker on the verb saying *this clause is not being asserted as fact*.

## The evaluation model

Think of indicative clauses as **evaluated expressions** — claims about the world, executed against reality:

@ Sé que el test pasa. | I know the test passes. — asserted, evaluated → indicative

And subjunctive clauses as **quoted, unevaluated expressions** — the clause names an idea (a wish, doubt, possibility, judgment) without executing it:

@ Quiero que el test pase. | I want the test to pass. — a desired state, not a fact → subjunctive
@ Dudo que el test pase. | I doubt the test passes. — explicitly not asserted
@ Me alegro de que el test pase. | I'm glad the test passes. — the fact is presupposed; what's *expressed* is my reaction, so the clause still isn't independently asserted

English used to make the same distinction (“I insist that he *be* on time”, “if I *were* you”) — the machinery survives only in fossils. Spanish runs it everywhere, live.

## Where it lives

The subjunctive almost always sits in a **subordinate clause introduced by que**, licensed by a trigger in the main clause:

[[ trigger + que + subjunctive ]]

The trigger families — wanting, emotion, doubt, judgment, purpose, unrealised time — each get a lesson. If there's no trigger and no que, you almost certainly want the indicative.

## Formation: you already know it

The commands module built every form: yo-stem + opposite endings, orthographic patches, and the six rebels (~sea, esté, vaya, dé, sepa, haya~). Full paradigm:

| person | hablar | comer | tener | ir |
| yo | hable | coma | tenga | vaya |
| tú | hables | comas | tengas | vayas |
| él/Ud. | hable | coma | tenga | vaya |
| nosotros | hablemos | comamos | tengamos | vayamos |
| vosotros | habléis | comáis | tengáis | vayáis |
| ellos/Uds. | hablen | coman | tengan | vayan |

-ir stem-changers raise the vowel in nosotros/vosotros: ~sintamos, durmamos, pidamos~.

! One prerequisite before the trigger lessons: **same subject → infinitive, no que-clause.** ~Quiero dormir~ (I want to sleep — one subject) vs ~quiero que duermas~ (I want YOU to sleep — two subjects, subjunctive). The subjunctive only fires when the subordinate clause has its own subject.
`,
  ex: [
    { t: "drill", verbs: ["hablar", "comer", "tener", "hacer", "ir", "ser", "pedir", "dormir"], tense: "subj", n: 7 },
    { t: "mc", q: "The subjunctive marks a clause as:", o: ["Past and formal", "Not asserted as fact — wished, doubted, felt, judged", "Spoken Spanish only"], i: 1, why: "Mood, not tense: the clause is mentioned/quoted rather than asserted. Everything else in this module is applications of that one idea." },
    { t: "cz", q: "Quiero que ___ (venir, tú) a la demo.", a: "vengas", note: "Wanting someone else's action: quiero que + subjunctive. vengo → veng- → vengas." },
    { t: "mc", q: "“I want to go home” is:", o: ["Quiero que vaya a casa", "Quiero ir a casa", "Quiero que voy a casa"], i: 1, why: "Same subject (I want, I go) → infinitive, no clause: quiero ir. The que-clause version means I want someone ELSE to go." },
    { t: "cz", q: "Es posible que el vuelo ___ (salir) tarde.", a: "salga", note: "Possibility = not asserted: es posible que + salga (yo-stem salg-)." },
    { t: "cz", q: "Dudo que lo ___ (saber, ellos).", a: "sepan", note: "Doubt suspends assertion: dudo que + sepan (rebel stem sep-)." },
    { t: "mc", q: "Why is it me alegro de que estés aquí and not estás?", o: ["alegrarse is irregular", "The clause serves my reaction, not an assertion — emotion triggers subjunctive even about true things", "It's optional"], i: 1, why: "Even presupposed-true clauses go subjunctive under emotion: the sentence's job is the feeling, not the claim." },
    { t: "cz", q: "No hay duda de que el código ___ (funcionar). (careful!)", a: "funciona", note: "no hay duda = certainty asserted → INDICATIVE. Negating the doubt un-suspends the clause. The mood tracks assertion, not the word duda." }
  ]},

  { id: "subj-2", title: "wishes and wants: querer que and friends", doc: `
The first trigger family: **volition** — one subject wanting, asking, suggesting, permitting or forbidding another subject's action. The wanted action is by definition unrealised → subjunctive.

## The family

~querer que~ · ~esperar que~ (hope) · ~necesitar que~ · ~pedir que~ · ~preferir que~ · ~sugerir que~ · ~recomendar que~ · ~insistir en que~ · ~permitir que~ · ~prohibir que~ · ~dejar que~ (let) · ~hacer que~ (make/cause)

@ Espero que tengas razón. | I hope you're right.
@ Te pido que lo pruebes antes. | I'm asking you to test it first.
@ El jefe prefiere que trabajemos en ramas. | The boss prefers us to work on branches.
@ Haz que funcione. | Make it work.

Note the English patterns that all collapse into que + subjunctive: *I want you **to test*** , *she suggests **testing***, *make it **work*** — Spanish has one uniform shape where English has three.

## ojalá: the pure wish operator

[[ojalá]] (from Arabic *in shā' Allāh*) takes a bare subjunctive, no que needed:

@ Ojalá llueva café. | May it rain coffee. (hope for the future)
@ Ojalá funcione. | Here's hoping it works.
@ ¡Ojalá! | If only! / Here's hoping! — standalone interjection

## que-wishes

The third-party commands from impv-5 (~que pase, que te mejores~) are this same construction with the trigger elided — “(deseo) que…”. The imperative module was secretly teaching you volition subjunctives all along.

## decir: two APIs, two moods

~decir que~ + indicative reports information; + subjunctive transmits a command:

@ Dice que el deploy está listo. | She says the deploy is ready. — information → indicative
@ Dice que hagas el deploy. | She says (tells you) to do the deploy. — instruction → subjunctive

The mood is the only difference between relaying a fact and relaying an order.
`,
  ex: [
    { t: "cz", q: "Espero que no ___ (haber) conflictos en el merge.", a: "haya", note: "esperar que + subjunctive: haya (rebel)." },
    { t: "tr", q: "I want you (tú) to read this before the meeting.", a: "quiero que leas esto antes de la reunión", alt: ["quiero que leas esto antes de la reunion"], traps: [{ re: "\\bque lees\\b", c: "E0303", m: "volition triggers the subjunctive", n: "quiero que + unrealised action → leas, not lees." }] },
    { t: "cz", q: "Ojalá ___ (poder, nosotros) verlo en directo.", a: "podamos", note: "ojalá + bare subjunctive: podamos." },
    { t: "mc", q: "Dice que vengas means:", o: ["He says that you come (fact)", "He's telling you to come (order)", "He asks whether you're coming"], i: 1, why: "decir + subjunctive relays an instruction. Compare dice que vienes = he says (the fact) that you're coming." },
    { t: "cz", q: "Te recomiendo que ___ (usar) tipos estrictos.", a: "uses", note: "recomendar que + subjunctive: uses." },
    { t: "tr", q: "She prefers that we deploy on Mondays.", a: "prefiere que hagamos el deploy los lunes", alt: ["prefiere que despleguemos los lunes", "ella prefiere que hagamos el deploy los lunes"], note: "preferir que + nosotros subjunctive: hagamos/despleguemos." },
    { t: "cz", q: "Mis padres no dejan que mi hermano ___ (jugar) entre semana.", a: "juegue", note: "dejar que (let) is volition: juegue — with the -gar patch (g→gu)." },
    { t: "tr", q: "I hope the tests pass. (esperar)", a: "espero que pasen los tests", alt: ["espero que los tests pasen", "espero que pasen las pruebas"], note: "Hoping = unasserted future: pasen. The engineer's daily prayer." }
  ]},

  { id: "subj-3", title: "emotion and judgment: reacting, not asserting", doc: `
Second family: **emotional reactions and value judgments**. Even when the embedded fact is true, the sentence's payload is your *reaction* — the clause itself goes unasserted → subjunctive.

## Emotion triggers

~me alegro de que~ (glad) · ~siento que~ (sorry) · ~me molesta que~ · ~me sorprende que~ · ~me encanta que~ · ~tengo miedo de que~ · ~me da pena que~ · ~qué raro que~ (how odd that)

@ Me alegro de que estés mejor. | I'm glad you're better.
@ Siento que no puedas venir. | I'm sorry you can't come.
@ Me sorprende que el bug siga abierto. | I'm surprised the bug is still open.

Notice the gustar-family verbs reappearing with clause-sized subjects — the machinery composes.

## Impersonal judgments: es + adjective + que

Any valuation of the clause pushes it into the subjunctive:

~es importante que~ · ~es necesario que~ · ~es mejor que~ · ~es raro que~ · ~es lógico que~ · ~es una pena que~ (it's a shame) · ~no es justo que~

@ Es importante que los tests sean deterministas. | It's important that tests be deterministic.
@ Es una pena que no haya tiempo. | It's a shame there's no time.
@ Es mejor que lo revises tú. | It's better if you review it.

## The crucial contrast: truth-assertors stay indicative

Expressions asserting truth or certainty take the **indicative** — they evaluate the clause:

| indicative (asserts) | subjunctive (values/reacts) |
| es verdad que | es una pena que |
| es cierto que | es raro que |
| es evidente que | es lógico que |
| está claro que | es importante que |

@ Es evidente que el código funciona. | assertion → indicative
@ Es raro que el código funcione. | reaction → subjunctive

The pair to burn in: [[es verdad que es así]] vs [[es raro que sea así]]. Same syntax, different epistemic move, different mood.

! Same-subject shortcut applies here too: ~me alegro de estar aquí~ (glad *I'm* here — infinitive), ~me alegro de que estés aquí~ (glad *you're* here — subjunctive).
`,
  ex: [
    { t: "cz", q: "Me alegro de que te ___ (gustar) el proyecto.", a: "guste", note: "Emotion trigger + gustar's inversion: de que te guste." },
    { t: "cz", q: "Es una pena que no ___ (tener, nosotros) más tiempo.", a: "tengamos", note: "Judgment (una pena) → subjunctive: tengamos." },
    { t: "mc", q: "Pick the correct pair:", o: ["Es verdad que sea tarde / Es raro que es tarde", "Es verdad que es tarde / Es raro que sea tarde", "Both subjunctive"], i: 1, why: "es verdad asserts → indicative es; es raro reacts → subjunctive sea. The mood tracks the epistemic move." },
    { t: "tr", q: "I'm surprised (that) the build is so slow.", a: "me sorprende que la build sea tan lenta", alt: ["me sorprende que el build sea tan lento", "me sorprende que la compilación sea tan lenta"], note: "Surprise = reaction → sea. (Yes, the build is genuinely slow — doesn't matter, the clause serves the emotion.)" },
    { t: "cz", q: "Está claro que el problema ___ (estar) en la red. (careful!)", a: "está", note: "está claro asserts certainty → indicative. Don't subjunctive on autopilot — check what the main clause does." },
    { t: "cz", q: "Es mejor que lo ___ (hacer, tú) hoy.", a: "hagas", note: "es mejor que = judgment → hagas." },
    { t: "tr", q: "It bothers me that the office is always cold.", a: "me molesta que la oficina esté siempre fría", alt: ["me molesta que la oficina siempre esté fría", "me molesta que siempre haga frío en la oficina"], note: "molestar (inverted) + emotion trigger → esté." },
    { t: "mc", q: "Why infinitive in siento no poder ayudarte?", o: ["sentir rejects clauses", "Same subject both sides (I'm sorry, I can't) → infinitive; the subjunctive needs a second subject", "It's colloquial"], i: 1, why: "Mood machinery only engages across a subject boundary: siento que no puedas (you) vs siento no poder (I)." }
  ]},

  { id: "subj-4", title: "doubt, denial and belief: the polarity switch", doc: `
Third family — and the most logical of all: mood tracks **belief polarity**. Verbs of thinking assert when positive, suspend when negated:

| asserts → indicative | suspends → subjunctive |
| creo que viene | no creo que ~venga~ |
| pienso que es tarde | no pienso que ~sea~ tarde |
| estoy seguro de que funciona | no estoy seguro de que ~funcione~ |
| es verdad que lo dijo | no es verdad que lo ~dijera~ |

@ Creo que tienes razón. | I think you're right. — I'm putting it forward
@ No creo que tengas razón. | I don't think you're right. — I decline to assert it

## Doubt and denial are born-negative

~dudar que~ and ~negar que~ suspend from the start:

@ Dudo que llegue a tiempo. | I doubt it'll arrive on time.
@ Niegan que haya un problema. | They deny there's a problem.

And symmetric: ~no dudo que~ / ~no niego que~ flip back to the indicative (certainty restored): ~no dudo que es verdad~.

## quizás, tal vez, probablemente: the confidence dial

Maybe-adverbs allow **both moods**, and the choice broadcasts your confidence level:

@ Quizás viene mañana. | Maybe he's coming tomorrow. — I rather expect it
@ Quizás venga mañana. | Maybe he might come tomorrow. — genuinely unsure

~a lo mejor~ (the most colloquial “maybe” in Spain) idiosyncratically takes only the indicative: ~a lo mejor voy~.

## Questions with creer

~¿Crees que…?~ usually keeps the indicative (you're asking about their belief, not suspending yours): ~¿Crees que va a llover?~

! The exam-classic mistake is mechanical: seeing creo and writing indicative, seeing no and writing subjunctive, without parsing. The polarity lives on the *belief verb*: ~creo que no viene~ is indicative (asserting a negative), ~no creo que venga~ is subjunctive (declining to assert). Position of no is everything.
`,
  ex: [
    { t: "cz", q: "No creo que ___ (ser) un problema de hardware.", a: "sea", note: "Negated belief suspends: no creo que sea." },
    { t: "cz", q: "Creo que ___ (ser) un problema de configuración.", a: "es", note: "Positive belief asserts: creo que es. Mood flips with the polarity of creer." },
    { t: "mc", q: "creo que no viene vs no creo que venga:", o: ["Identical", "First asserts he isn't coming; second declines to assert he is — indicative vs subjunctive", "Second is wrong"], i: 1, why: "Where the no sits decides what's asserted. creo que no viene = confident negative (indicative). no creo que venga = suspended (subjunctive)." },
    { t: "cz", q: "Dudo que el parche ___ (arreglar) el problema de fondo.", a: "arregle", note: "dudar que suspends by nature: arregle." },
    { t: "tr", q: "I'm not sure the data is correct.", a: "no estoy seguro de que los datos sean correctos", alt: ["no estoy segura de que los datos sean correctos", "no estoy seguro de que los datos estén bien"], note: "no estoy seguro de que + subjunctive: sean. (datos = masculine plural.)" },
    { t: "cz", q: "Quizás ___ (tener, tú) razón — no lo había pensado así. (lean unsure)", a: "tengas", note: "quizás + subjunctive signals genuine uncertainty. tienes would read as “actually, you're probably right”." },
    { t: "mc", q: "Which takes ONLY the indicative?", o: ["quizás", "tal vez", "a lo mejor"], i: 2, why: "a lo mejor — the most colloquial maybe — idiosyncratically refuses the subjunctive: a lo mejor voy. quizás/tal vez take both, dialling confidence." },
    { t: "tr", q: "They deny that the service went down. (caerse)", a: "niegan que el servicio se cayera", alt: ["niegan que se cayera el servicio", "niegan que el servicio se haya caído", "niegan que se haya caído el servicio"], note: "negar que + subjunctive; the past event takes imperfect subjunctive (cayera) or perfect subjunctive (haya caído) — both correct, formally introduced in mood.subjunctive2." }
  ]},

  { id: "subj-5", title: "module integration: the trigger table, drilled", doc: `
Consolidation. The complete decision procedure for a que-clause:

1. **Same subject both sides?** → infinitive, done. (~quiero dormir~)
2. **Main clause asserts** (know, see, say-as-fact, es verdad/evidente/claro, positive creer)? → **indicative**.
3. **Main clause wants, feels, judges, doubts or denies** the clause? → **subjunctive**.
4. **Maybe-adverbs**: pick the mood matching your confidence (a lo mejor → indicative always).

## The trigger table (cache this page — it's also man subjuntivo)

| family | examples | mood |
| volition | quiero/espero/pido/sugiero que, ojalá | subj |
| emotion | me alegro de que, siento que, me molesta que | subj |
| judgment | es importante/mejor/raro/una pena que | subj |
| doubt/denial | dudo que, niego que, no creo que | subj |
| assertion | sé que, es verdad que, está claro que, creo que | ind |
| reporting | dice que + fact | ind |
| instruction | dice que + order | subj |

## Hybrid sentences

Real Spanish mixes moods mid-sentence, one clause at a time:

@ Sé que el código funciona, pero me sorprende que no tenga tests. | I know it works (ind), but I'm surprised it has no tests (subj).
@ Creo que es tarde y es mejor que lo dejemos. | I think it's late (ind) and we'd better leave it (subj).

Each que-clause gets its own evaluation. There is no sentence-level subjunctive switch — it's per-expression, like laziness annotations.

! Two more subjunctive arenas remain — clauses about unknown antecedents (~busco un piso que tenga luz~) and time/purpose clauses (~cuando llegue~) — plus the past subjunctive. That's the next module. Everything there reuses this module's core: unasserted → subjunctive.
`,
  ex: [
    { t: "cz", q: "Sé que ___ (estar, tú) ocupado, pero necesito que me ___ (ayudar, tú).", a: "estás, ayudes", alt: ["estás ayudes", "estas ayudes"], note: "Assertion (sé que estás) + volition (necesito que ayudes) in one sentence — each clause evaluated separately." },
    { t: "mc", q: "Es evidente que el error ___ en el parser. / Es raro que el error ___ en el parser.", o: ["está / esté", "esté / está", "está / está"], i: 0, why: "es evidente asserts → está; es raro judges → esté. The pair from subj-3, live." },
    { t: "tr", q: "I hope you (tú) can come, but I understand that you're busy.", a: "espero que puedas venir pero entiendo que estás ocupado", alt: ["espero que puedas venir, pero entiendo que estás ocupado", "espero que puedas venir pero entiendo que estás ocupada", "espero que puedas venir, pero entiendo que estás ocupada"], note: "Hope → puedas (subj); entender-as-assertion → estás (ind)." },
    { t: "cz", q: "El cliente quiere que la app ___ (funcionar) sin conexión, pero dudo que ___ (ser) posible este trimestre.", a: "funcione, sea", alt: ["funcione sea"], note: "Volition + doubt: two subjunctives, different triggers." },
    { t: "tr", q: "It's better that we talk tomorrow — I don't think anyone is listening today. (escuchar)", a: "es mejor que hablemos mañana no creo que nadie escuche hoy", alt: ["es mejor que hablemos mañana, no creo que nadie escuche hoy", "es mejor que hablemos mañana. no creo que nadie escuche hoy", "es mejor que hablemos mañana no creo que nadie nos escuche hoy"], note: "Judgment (hablemos) + negated belief (escuche)." },
    { t: "cz", q: "Dice el manual que ___ (reiniciar, tú) el router y que ___ (esperar, tú) un minuto. (relayed instructions)", a: "reinicies, esperes", alt: ["reinicies esperes"], note: "decir que + orders → subjunctive twice: reinicies, esperes." },
    { t: "mc", q: "Final check — which sentence is WRONG?", o: ["Creo que viene.", "No creo que viene.", "Creo que no viene."], i: 1, why: "Negated creer must suspend: no creo que VENGA. The other two assert (positively or negatively) and correctly use the indicative." },
    { t: "tr", q: "I'm glad the team likes the new process. (alegrarse, gustar)", a: "me alegro de que al equipo le guste el nuevo proceso", alt: ["me alegro de que le guste al equipo el nuevo proceso", "me alegro de que al equipo le guste el proceso nuevo"], note: "Boss-level composition: emotion trigger (subjunctive) wrapping a gustar inversion (le guste) with clitic doubling (al equipo… le)." }
  ]}
]});
