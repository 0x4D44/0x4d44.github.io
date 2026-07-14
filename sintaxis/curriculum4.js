/* sintaxis curriculum — part 4/4: mood.subjunctive2, syntax.plumbing, runtime.production */

window.CURRICULUM.push({
  id: "subj2", name: "mood.subjunctive2", title: "Hypothetical branches",
  tagline: "The subjunctive beyond triggers: unknown antecedents, pending time-clauses, the imperfect subjunctive, and counterfactual si-branches.",
  deps: ["subj"],
  lessons: [

  { id: "subj2-1", title: "adjective clauses: known vs unknown antecedents", doc: `
A relative clause describes a noun (its *antecedent*). The mood inside tracks whether that noun is **a known, existing thing** (indicative) or **a spec that may match nothing** (subjunctive):

@ Busco al desarrollador que ~sabe~ Rust. | The specific dev — I know him, he exists. → indicative
@ Busco un desarrollador que ~sepa~ Rust. | Anyone matching the spec — may not exist. → subjunctive

It's the difference between a pointer to an instance and a query with a WHERE clause. English hides the distinction completely; Spanish types it into the verb.

@ Tengo un piso que tiene mucha luz. | I have a flat that has lots of light. — it exists, I live in it
@ Quiero un piso que tenga mucha luz. | I want a flat that has light. — a search predicate
@ ¿Hay alguien aquí que hable alemán? | Anyone here speak German? — existence unknown → subjunctive

## Negative antecedents: guaranteed empty set

If the main clause *denies* existence, the relative clause is always subjunctive — there's nothing to assert about:

@ No hay nada que podamos hacer. | There's nothing we can do.
@ No conozco a nadie que trabaje allí. | I don't know anyone who works there.

## The personal-a callback

Remember obj-2: non-specific people lose the personal a. Same specificity switch, both markers together:

@ Busco ~a la~ traductora que ~trabajó~ con nosotros. | specific: a + indicative
@ Busco Ø una traductora que ~trabaje~ los fines de semana. | spec: no a + subjunctive

## Superlative-ish idioms

@ Haré lo que pueda. | I'll do what I can (whatever that turns out to be).
@ Que yo sepa… | As far as I know…
@ Cueste lo que cueste. | Whatever it costs.
`,
  ex: [
    { t: "cz", q: "Necesitamos una librería que ___ (soportar) streaming.", a: "soporte", note: "A requirement spec, not a known library → subjunctive." },
    { t: "cz", q: "Uso una librería que ___ (soportar) streaming.", a: "soporta", note: "It exists — you use it → indicative. Same sentence shape, opposite epistemic state." },
    { t: "mc", q: "¿Hay algún restaurante que abra los lunes? — why abra?", o: ["Restaurants are formal", "Existence is in question — the antecedent may be the empty set", "abrir is irregular"], i: 1, why: "The question asks whether a matching thing exists at all → subjunctive in the relative clause." },
    { t: "tr", q: "There's nothing that works.", a: "no hay nada que funcione", traps: [{ re: "\\bque funciona\\b", c: "E0303", m: "negated antecedent forces the subjunctive", n: "no hay nada que + subjunctive: the set is empty by assertion, nothing to indicate about." }] },
    { t: "cz", q: "No conozco a nadie que ___ (entender) ese código.", a: "entienda", note: "nadie → empty set → entienda. Note the personal a survives on nadie." },
    { t: "tr", q: "I'm looking for a flat that has a terrace. (spec, not a known one)", a: "busco un piso que tenga terraza", alt: ["busco un piso que tenga una terraza"], note: "Query semantics: no personal a (not a person, and non-specific anyway), subjunctive tenga." },
    { t: "cz", q: "Haré lo que ___ (poder, yo).", a: "pueda", note: "lo que + subjunctive = whatever-it-turns-out-to-be: haré lo que pueda." },
    { t: "mc", q: "Que yo sepa, nadie lo ha probado — the sepa is:", o: ["A typo for sé", "The idiom “as far as I know” — a fossilised subjunctive of bounded knowledge", "A command"], i: 1, why: "que yo sepa hedges the claim to the limits of my knowledge — inherently unasserted territory, hence subjunctive. High-frequency idiom; use it in code reviews." }
  ]},

  { id: "subj2-2", title: "time and purpose clauses: pending vs logged", doc: `
Adverbial conjunctions split into three groups by mood behaviour.

## Group 1: cuando & friends — mood tracks realisation

Time conjunctions (~cuando, en cuanto~ (as soon as), ~hasta que, después de que, mientras~) take:

- **indicative** for habitual or past events — they happened, they're logged:
- **subjunctive** for future events — not yet realised, merely scheduled:

@ Cuando llego a casa, ceno. | When I get home, I eat. — habit → indicative
@ Cuando llegué, cené. | When I arrived, I ate. — logged → indicative
@ Cuando ~llegue~, cenaré. | When I arrive (later today), I'll eat. — pending → subjunctive
@ En cuanto ~termine~ la build, te aviso. | As soon as the build finishes, I'll ping you.
@ Hasta que no lo ~vea~, no lo creo. | Until I see it, I don't believe it.

This is the subjunctive's cleanest showing: same conjunction, and the mood alone encodes whether the event is on the log or still in the queue. English can't say the difference; Spanish can't avoid saying it.

## Group 2: purpose & proviso — always subjunctive

Conjunctions whose content is inherently unrealised (goals, conditions, concessions-in-advance):

~para que~ (so that) · ~antes de que~ (before) · ~sin que~ (without) · ~a menos que~ (unless) · ~con tal de que~ (provided that) · ~en caso de que~ (in case)

@ Te lo explico para que lo entiendas. | I'll explain so that you understand.
@ Haz el backup antes de que sea tarde. | Do the backup before it's too late.
@ Salió sin que nadie lo viera. | He left without anyone seeing him.

(~antes de que~ is *always* subjunctive even for past events — a genuine quirk: the before-event was unrealised *at that point*.)

## Group 3: aunque — the concession dial

~aunque~ + indicative concedes a fact; + subjunctive concedes a hypothesis:

@ Aunque llueve, vamos. | Even though it's raining (it is), we're going.
@ Aunque llueva, vamos. | Even if it rains (who knows), we're going.
`,
  ex: [
    { t: "cz", q: "Cuando ___ (terminar) el sprint, haremos la retro.", a: "termine", note: "Future-pending time clause → subjunctive: cuando termine." },
    { t: "cz", q: "Cuando ___ (terminar) el sprint, hicimos la retro.", a: "terminó", note: "Past, logged → indicative preterite. The pair with the previous item is the whole lesson." },
    { t: "tr", q: "As soon as I know something, I'll tell you (tú). (en cuanto, saber)", a: "en cuanto sepa algo te lo digo", alt: ["en cuanto sepa algo, te lo digo", "en cuanto sepa algo te lo diré", "en cuanto sepa algo, te lo diré", "en cuanto lo sepa te lo digo"], note: "Pending event → sepa; the promise can ride present (te lo digo) or future (diré)." },
    { t: "mc", q: "Aunque sea difícil, lo intentaremos vs aunque es difícil…:", o: ["Same", "sea = even if (hypothetical); es = even though (conceded fact)", "es is wrong"], i: 1, why: "aunque is a mood dial: indicative concedes reality, subjunctive concedes possibility." },
    { t: "cz", q: "Guarda el archivo antes de que se ___ (ir) la luz.", a: "vaya", note: "antes de que: always subjunctive — the after-event hasn't happened from the vantage of the before." },
    { t: "tr", q: "I'll wait until you (tú) arrive.", a: "espero hasta que llegues", alt: ["esperaré hasta que llegues", "te espero hasta que llegues"], traps: [{ re: "hasta que llegas", c: "E0303", m: "pending time-clause takes subjunctive", n: "Your arrival is still in the queue: hasta que llegues." }] },
    { t: "cz", q: "Documenta la función para que el equipo la ___ (poder) mantener.", a: "pueda", note: "para que = purpose, always subjunctive: pueda." },
    { t: "tr", q: "We can't merge without the tests passing. (sin que)", a: "no podemos hacer merge sin que pasen los tests", alt: ["no podemos mergear sin que pasen los tests", "no podemos hacer el merge sin que pasen los tests"], note: "sin que + subjunctive: pasen. Words to live by." }
  ]},

  { id: "subj2-3", title: "the imperfect subjunctive: one rule, no exceptions", doc: `
The past-tense subjunctive has the single most elegant derivation in Spanish morphology:

[[ 3rd-person-plural preterite − ron + ra endings ]]

**Every verb. No exceptions. All the preterite irregularity is inherited for free.**

| verb | 3pl preterite | stem | imperfect subjunctive |
| hablar | habla~ron~ | habla- | hablara, hablaras, hablara, habláramos, hablarais, hablaran |
| tener | tuvie~ron~ | tuvie- | tuviera, tuvieras… tuviéramos… |
| decir | dije~ron~ | dije- | dijera… dijéramos… |
| ir/ser | fue~ron~ | fue- | fuera… fuéramos… |
| dormir | durmie~ron~ | durmie- | durmiera… |
| haber | hubie~ron~ | hubie- | hubiera… |

(nosotros takes an accent on the vowel before -ramos: habláramos, fuéramos.)

There's a parallel ~-se~ series (hablase, tuviese…) — same meaning, more literary; recognise it, produce the -ra forms.

## When: past-shifted triggers

Every trigger from the last module, with the main clause in a past tense, shifts its subordinate into the imperfect subjunctive — ordinary sequence of tenses:

@ Quiero que vengas. → Quería que ~vinieras~. | I wanted you to come.
@ Dudo que sea verdad. → Dudaba que ~fuera~ verdad. | I doubted it was true.
@ Me pidió que lo ~revisara~. | She asked me to review it.
@ Buscaba un piso que ~tuviera~ luz. | I was looking for a flat with light.

## Two idiomatic must-knows

- [[como si + imperfect subjunctive]] — “as if”: ~Habla como si lo supiera todo.~ (He talks as if he knew everything.) Always imperfect subjunctive, never indicative.
- [[quisiera]] — the politest want in the language: ~Quisiera una mesa para dos.~ (I'd like a table for two.) The imperfect subjunctive of querer moonlighting as courtesy.
`,
  ex: [
    { t: "drill", verbs: ["hablar", "tener", "hacer", "ir", "decir", "poder", "saber"], tense: "subjImpf", n: 6 },
    { t: "cz", q: "El cliente quería que lo ___ (entregar, nosotros) ayer.", a: "entregáramos", note: "Past volition → imperfect subjunctive: entregaran → entregá- … entregáramos." },
    { t: "cz", q: "Me pidió que le ___ (mandar, yo) el informe.", a: "mandara", alt: ["mandase"], note: "pedir que in the past → mandara (or the -se twin mandase)." },
    { t: "mc", q: "Why is the imperfect subjunctive of decir dijera and not deciera?", o: ["It's irregular", "It's built on the 3pl preterite dijeron — all preterite irregularity is inherited", "Typo tradition"], i: 1, why: "dijeron − ron = dije- → dijera. The derivation has no exceptions; master the preterite and this tense is free." },
    { t: "tr", q: "He talks as if he knew everything.", a: "habla como si lo supiera todo", alt: ["habla como si supiera todo", "habla como si lo supiese todo"], note: "como si + imperfect subjunctive, always: supiera (from supieron)." },
    { t: "cz", q: "No creía que ___ (haber) tanta gente.", a: "hubiera", alt: ["hubiese"], note: "Past negated belief → hubiera (from hubieron)." },
    { t: "tr", q: "I'd like a coffee, please. (maximum politeness)", a: "quisiera un café por favor", alt: ["quisiera un café, por favor"], note: "quisiera — the imperfect subjunctive as a courtesy form. Waiters will assume you've had lessons." },
    { t: "cz", q: "Buscábamos a alguien que ___ (conocer) el sistema antiguo.", a: "conociera", alt: ["conociese"], note: "Unknown antecedent + past → conociera (conocieron − ron)." }
  ]},

  { id: "subj2-4", title: "si-clauses: real and counterfactual branches", doc: `
Conditionals are branch instructions, and Spanish has exactly two live patterns. Learn the two templates and refuse all others.

## Branch 1: open condition — might happen

[[si + present indicative → present / future / command]]

@ Si tengo tiempo, te llamo. | If I have time, I'll call you.
@ Si el test falla, revisa el mock. | If the test fails, check the mock.
@ Si llueve, no iremos. | If it rains, we won't go.

**si never takes the present subjunctive.** ~*si tenga~ does not exist — an open condition is evaluated against reality, so it stays indicative.

## Branch 2: counterfactual — contrary to fact / remote

[[si + imperfect subjunctive → conditional]]

@ Si ~tuviera~ tiempo, ~aprendería~ alemán. | If I had time (I don't), I'd learn German.
@ Si el código ~estuviera~ documentado, no ~pasaría~ esto. | If the code were documented, this wouldn't happen.
@ ¿Qué ~harías~ si te ~tocara~ la lotería? | What would you do if you won the lottery?

## The forbidden opcode

English speakers generate ~*si tendría~ by translating “if I would have”. **The conditional never follows si.** The si-side takes subjunctive, the payoff-side takes conditional. One side each, never swapped, never doubled:

@ ✗ si tendría tiempo | ✓ si tuviera tiempo
@ ✗ si tuviera tiempo, tuviera un perro | ✓ si tuviera tiempo, tendría un perro

## Past counterfactuals (recognition level)

Fully-missed branches use the pluperfect subjunctive → conditional perfect:

@ Si lo hubiera sabido, no habría venido. | If I'd known, I wouldn't have come.

Colloquial Spain often doubles the hubiera: ~si lo hubiera sabido, no hubiera venido~ — you'll hear it constantly; both are accepted.

! Quick self-check heuristic: if the English says *were/had* in the if-half and *would* in the payoff, you're in branch 2. If both halves are plain present/future, branch 1.
`,
  ex: [
    { t: "cz", q: "Si ___ (ver, tú) a Marta, dile que me llame.", a: "ves", note: "Open condition → present indicative: si ves. (Never present subjunctive after si.)" },
    { t: "cz", q: "Si ___ (poder, yo), trabajaría desde la playa.", a: "pudiera", alt: ["pudiese"], note: "Counterfactual branch: si + imperfect subjunctive → conditional payoff." },
    { t: "tr", q: "If I had more RAM, the model would run locally. (funcionar en local)", a: "si tuviera más ram el modelo funcionaría en local", alt: ["si tuviera más ram, el modelo funcionaría en local", "si tuviese más ram el modelo funcionaría en local", "si tuviera más memoria el modelo funcionaría en local"], traps: [{ re: "\\bsi tendría\\b", c: "E0901", m: "the conditional never follows si", n: "si + imperfect subjunctive (tuviera); the conditional lives in the payoff (funcionaría)." }] },
    { t: "mc", q: "Which is grammatical?", o: ["Si tendría tiempo, iría.", "Si tuviera tiempo, iría.", "Si tuviera tiempo, fuera."], i: 1, why: "si + tuviera (subjunctive), payoff iría (conditional). Option 1 puts conditional after si (forbidden); option 3 puts subjunctive in the payoff (also wrong)." },
    { t: "cz", q: "¿Qué ___ (hacer, tú) si un test ___ (fallar) solo en producción? (counterfactual musing)", a: "harías, fallara", alt: ["harías fallara", "harías, fallase"], note: "Payoff conditional (harías) + si-side imperfect subjunctive (fallara)." },
    { t: "tr", q: "If it rains tomorrow, we'll stay home. (open condition)", a: "si llueve mañana nos quedamos en casa", alt: ["si llueve mañana, nos quedamos en casa", "si llueve mañana nos quedaremos en casa", "si mañana llueve nos quedamos en casa"], note: "Open branch: si + present indicative (llueve), payoff present or future." },
    { t: "cz", q: "Si lo ___ (saber, yo, pluperfect subjunctive), te lo habría dicho. (two words)", a: "hubiera sabido", alt: ["hubiese sabido"], note: "The missed branch: si + hubiera sabido → habría dicho." },
    { t: "mc", q: "Si fuera tú, no lo haría means:", o: ["If I go with you, I won't do it", "If I were you, I wouldn't do it", "If it were yours, I wouldn't"], i: 1, why: "The counterfactual template with ser: si fuera tú (I'm not) → no lo haría. The stock advice-giving frame." }
  ]},

  { id: "subj2-5", title: "sequence of tenses: the full matrix", doc: `
The capstone: matching the subordinate tense to the main clause. The rule is mechanical and worth internalising as a lookup table:

## The matrix

| main clause | subordinate subjunctive | example |
| present / future / perfect / command | **present subjunctive** | Quiero que ~vengas~. |
| preterite / imperfect / conditional / pluperfect | **imperfect subjunctive** | Quería que ~vinieras~. |

@ Te pido que lo pruebes. | present → present subj
@ Te pedí que lo probaras. | preterite → imperfect subj
@ Sería mejor que esperaras. | conditional → imperfect subj
@ Dile que entre. | command → present subj
@ Me alegro de que hayas venido. | reaction to a completed event → perfect subjunctive (haya + participle)

That last row introduces the **perfect subjunctive** — ~haya hecho~ — for completed events under a present-tense trigger: ~espero que haya llegado bien~ (I hope she's arrived OK).

## Worked pipeline

“The boss wanted us to document (documentar) everything before we left.”

1. Main: wanted → past volition → ~quería que~
2. Sequence: past main → imperfect subjunctive → ~documentáramos~
3. before we left → antes de que + past → imperfect subjunctive → ~nos fuéramos~

@ El jefe quería que lo documentáramos todo antes de que nos fuéramos. | full assembly

## Module summary — the whole subjunctive, one paragraph

Unasserted clauses take the subjunctive: wanted, felt, judged, doubted (mood.subjunctive); sought-but-unknown, pending-in-time, purposed, or counterfactual (this module). Match tense by the matrix above. si-branches: open → indicative, counterfactual → imperfect subjunctive + conditional. Everything else is vocabulary.
`,
  ex: [
    { t: "cz", q: "Es importante que ___ (venir, tú). → Era importante que ___ (venir, tú).", a: "vengas, vinieras", alt: ["vengas vinieras", "vengas, vinieses"], note: "Present trigger → vengas; past trigger → vinieras. The matrix in one line." },
    { t: "cz", q: "Espero que el paquete ___ ___ (llegar, perfect subjunctive) bien. (two words)", a: "haya llegado", note: "Present hope about a completed event → haya + participle." },
    { t: "tr", q: "She asked me to wait until the tests finished. (pedir, esperar, terminar)", a: "me pidió que esperara hasta que terminaran los tests", alt: ["me pidió que esperara hasta que los tests terminaran", "me pidió que esperase hasta que terminasen los tests", "me pidió que esperara a que terminaran los tests"], note: "Past request → esperara; pending-from-then time clause → terminaran. Two imperfect subjunctives, two different licences." },
    { t: "mc", q: "Sería mejor que lo ___ mañana.", o: ["hagas", "hicieras", "harías"], i: 1, why: "Conditional main clause selects the imperfect subjunctive: sería mejor que lo hicieras." },
    { t: "cz", q: "No creo que ___ (ser) buena idea. → No creía que ___ (ser) buena idea.", a: "sea, fuera", alt: ["sea fuera", "sea, fuese"], note: "Belief-negation shifted to the past drags the clause with it: sea → fuera." },
    { t: "tr", q: "I wanted the report to be ready before the client arrived.", a: "quería que el informe estuviera listo antes de que llegara el cliente", alt: ["quería que el informe estuviera listo antes de que el cliente llegara", "quería que el informe estuviese listo antes de que llegase el cliente"], note: "Past volition (estuviera) + antes de que past (llegara). The worked-pipeline pattern." },
    { t: "cz", q: "Ojalá ___ (tener, yo) más tiempo — pero no lo tengo. (a wish about the present, contrary to fact)", a: "tuviera", alt: ["tuviese"], note: "ojalá + imperfect subjunctive = a wish known to be false now: ojalá tuviera. (ojalá + present subj = hope it may yet happen.)" },
    { t: "mc", q: "Final boss: Me sorprendió que nadie ___ probado el backup.", o: ["ha", "haya", "hubiera"], i: 2, why: "Past reaction (sorprendió) to an even-earlier non-event → pluperfect subjunctive: nadie hubiera probado. (haya probado would follow a present-tense trigger.)" }
  ]}
]});

window.CURRICULUM.push({
  id: "plumb", name: "syntax.plumbing", title: "Prepositions & glue",
  tagline: "por vs para settled for good, verb+preposition signatures, relative pronouns, discourse connectors, and comparison operators.",
  deps: ["impf"],
  lessons: [

  { id: "plumb-1", title: "por vs para: cause behind, goal ahead", doc: `
Both translate “for”; they point in opposite directions. **para is a vector toward a goal; por is the cause, medium or exchange behind and around the action.** Almost every use case falls out of that one image.

## para — forward along the arrow

- **purpose** (in order to): ~Estudio para aprender.~
- **destination**: ~Salgo para Madrid.~
- **recipient**: ~Este PR es para ti.~
- **deadline**: ~Lo necesito para el viernes.~
- **standard of comparison**: ~Para ser junior, escribe muy bien.~ (for a junior…)
- **employer**: ~Trabajo para una startup.~
- **opinion holder**: ~Para mí, es un error.~

## por — the space behind and around

- **cause/reason** (because of): ~Se canceló por la lluvia.~
- **exchange/price**: ~Lo compré por veinte euros.~
- **through/along**: ~Paseamos por el centro.~
- **duration** (often droppable): ~Estuve fuera (por) dos semanas.~
- **approximate time-of-day**: ~por la mañana / tarde / noche~
- **means/channel**: ~por correo, por teléfono, por internet~
- **rate/per**: ~cien peticiones por segundo~
- **agent of a passive**: ~escrito por Borges~
- **on behalf of / in place of**: ~Firma por mí.~

## The classic contrasts

@ Lo hice por ti. | I did it because of you / for your sake. — you're the cause
@ Lo hice para ti. | I made it for you (to give you). — you're the destination
@ Trabajo por dinero. | I work for (in exchange for) money.
@ Trabajo para el banco. | I work for the bank. — goal-institution
@ Voy por la A-7. | I'm going along the A-7. — route
@ Voy para la costa. | I'm heading toward the coast. — destination

## Fossilised idioms (memorise as tokens)

~por favor~ · ~por supuesto~ (of course) · ~por fin~ (finally) · ~por ejemplo~ · ~por eso~ (that's why) · ~por si acaso~ (just in case) · ~gracias por~ (+ the thing thanked for) · ~está por hacer~ (still to be done) · ~estar a punto de~ vs ~estar por~ — and on the para side: ~para siempre~ (forever), ~para nada~ (not at all), ~para variar~ (for a change, ironic).
`,
  ex: [
    { t: "cz", q: "Gracias ___ tu ayuda con el rebase.", a: "por", note: "Thanking names the cause: gracias por." },
    { t: "cz", q: "Este regalo es ___ mi madre.", a: "para", note: "Recipient — forward along the arrow: para." },
    { t: "tr", q: "I need it by Friday.", a: "lo necesito para el viernes", traps: [{ re: "\\bpor el viernes\\b", c: "E0501", m: "deadlines take para", n: "A deadline is a goal-point ahead: para el viernes." }] },
    { t: "cz", q: "El vuelo se retrasó ___ la niebla.", a: "por", note: "Cause behind the event: por la niebla." },
    { t: "mc", q: "Lo hice por ti vs lo hice para ti:", o: ["Identical", "por = because of you (cause); para = destined for you (recipient)", "para is more formal"], i: 1, why: "The direction test: cause behind → por; goal/recipient ahead → para." },
    { t: "cz", q: "Caminamos ___ el casco antiguo durante horas.", a: "por", note: "Movement through/around a space: por el casco antiguo." },
    { t: "tr", q: "For an intern, she writes very solid code. (un becario/una becaria)", a: "para ser becaria escribe un código muy sólido", alt: ["para ser becaria, escribe un código muy sólido", "para ser becaria escribe código muy sólido", "para ser una becaria escribe un código muy sólido"], note: "para + standard-of-comparison: for being an intern…" },
    { t: "cz", q: "Te cambio mi pantalla ___ tu teclado mecánico.", a: "por", note: "Exchange: one thing por another." },
    { t: "tr", q: "The API handles a thousand requests per second. (manejar/procesar)", a: "la api procesa mil peticiones por segundo", alt: ["la api maneja mil peticiones por segundo", "el api procesa mil peticiones por segundo", "la api procesa mil solicitudes por segundo"], note: "Rate = por: peticiones por segundo." }
  ]},

  { id: "plumb-2", title: "verb signatures: which preposition a verb binds", doc: `
Spanish verbs declare their prepositions like function signatures declare parameter types — and they routinely disagree with English. Learn verb+preposition as a single token; guessing from English is the #1 source of subtle errors at this level.

## The high-frequency mismatches

| Spanish signature | English says | trap |
| soñar ~con~ | dream *of/about* | not de |
| depender ~de~ | depend *on* | not en |
| casarse ~con~ | marry / get married *to* | not a |
| enamorarse ~de~ | fall in love *with* | not con |
| pensar ~en~ | think *about* | pensar de = have an opinion of |
| consistir ~en~ | consist *of* | not de |
| contar ~con~ | count *on* | not en |
| confiar ~en~ | trust *in* | not de |
| tardar ~en~ | take time *to* | ~tarda en compilar~ |
| dejar ~de~ | stop -ing | ~dejó de fumar~ |
| tratar ~de~ | try *to* | also intentar (no prep) |
| acordarse ~de~ | remember | recordar takes none |
| preocuparse ~por~ | worry *about* | |
| parecerse ~a~ | resemble | |
| asistir ~a~ | attend | asistir ≠ assist! |

## Zero-preposition traps (English adds one, Spanish doesn't)

~buscar~ (look *for*) · ~esperar~ (wait *for*) · ~pedir~ (ask *for*) · ~mirar~ (look *at*) · ~escuchar~ (listen *to*) · ~pagar~ (pay *for*, usually)

@ Busco mis llaves. | I'm looking for my keys. — no para, no por
@ Esperamos el tren. | We're waiting for the train.

## a + infinitive starters

Verbs of beginning and motion bind a before an infinitive: ~empezar a~, ~aprender a~, ~ayudar a~, ~ir a~, ~venir a~, ~volver a~ (+inf = to do again: ~volvió a fallar~ — it failed again).

@ Aprendí a programar en BASIC. | I learnt to program in BASIC.
@ El test volvió a fallar. | The test failed again.
`,
  ex: [
    { t: "cz", q: "Todo depende ___ los datos.", a: "de", note: "depender de — never en, however loudly English shouts on." },
    { t: "cz", q: "Anoche soñé ___ mi antiguo colegio.", a: "con", note: "soñar con = dream about." },
    { t: "tr", q: "I'm waiting for the bus.", a: "espero el autobús", alt: ["estoy esperando el autobús", "espero al autobús", "espero el autobus"], traps: [{ re: "\\bespero (por|para) el\\b", c: "E0702", m: "esperar takes no preposition", n: "The for is built into the verb: espero el autobús. (espero al autobús with personal-a flavour is also heard.)" }] },
    { t: "cz", q: "El build tarda ___ terminar unos diez minutos.", a: "en", note: "tardar en + infinitive: takes-time-to." },
    { t: "mc", q: "¿Qué piensas de la propuesta? vs ¿En qué piensas?:", o: ["Interchangeable", "de asks your opinion of it; en asks what's occupying your mind", "en is wrong"], i: 1, why: "pensar de = opinion; pensar en = have in mind. Different prepositions select different senses." },
    { t: "cz", q: "Puedes contar ___ nosotros para la migración.", a: "con", note: "contar con = count on / rely on." },
    { t: "tr", q: "It stopped working again. (dejar de, volver a)", a: "volvió a dejar de funcionar", alt: ["dejó de funcionar otra vez", "ha vuelto a dejar de funcionar", "dejó de funcionar de nuevo"], note: "Composition: volver a (again) + dejar de (stop) + infinitive. Spanish plumbing at its finest." },
    { t: "cz", q: "Mi hija se parece ___ su abuela.", a: "a", note: "parecerse a = resemble." },
    { t: "tr", q: "Don't worry about the deadline. (tú)", a: "no te preocupes por la fecha límite", alt: ["no te preocupes por el plazo", "no te preocupes por la deadline"], note: "preocuparse por + negative command (subjunctive, clitic detached): no te preocupes." }
  ]},

  { id: "plumb-3", title: "relative pronouns: que, quien, lo que, cuyo", doc: `
Relative clauses splice sentences together. Spanish has a small pronoun inventory with strict selection rules — and unlike English, **the relative pronoun can never be omitted**.

## que — the universal splice

Works for people and things, subject or object:

@ el test que falla | the test that fails
@ la ingeniera que conocí | the engineer (whom) I met — no dropping the que!

## preposition + article + que

After a preposition, que usually takes the article agreeing with the antecedent:

@ el proyecto en el que trabajo | the project I work on
@ la razón por la que dimití | the reason I resigned
@ las herramientas con las que trabajamos | the tools we work with

(Note English strands its prepositions — “the project I work *on*” — Spanish fronts them. There is no ~*el proyecto que trabajo en~.)

## quien(es) — people, after prepositions

@ la persona con quien hablé | the person I spoke with — or con la que
@ Quien mucho abarca, poco aprieta. | He who grasps much, holds little. — proverb-quien

## lo que — clause-sized reference

Refers to an idea or whole situation, not a noun:

@ Lo que dijiste ayer me ayudó. | What you said yesterday helped me.
@ Llegó tarde, lo que molestó a todos. | He arrived late, which annoyed everyone.
@ No entiendo lo que pasa. | I don't understand what's happening.

## cuyo/a/os/as — whose (agrees with the *possessed*)

@ el autor cuyas novelas leímos | the author whose novels we read — cuyas agrees with novelas, not autor

Formal-register but common in writing; in speech people paraphrase.

! The golden rule again: English deletes relative pronouns (“the book Ø I read”); Spanish never does: ~el libro **que** leí~. Omitting que is a parse error, full stop.
`,
  ex: [
    { t: "cz", q: "El módulo ___ escribí ayer ya está en producción.", a: "que", note: "Object relative — still obligatory: el módulo que escribí." },
    { t: "tr", q: "The company I work for is in Edinburgh. (trabajar para)", a: "la empresa para la que trabajo está en edimburgo", alt: ["la empresa para la cual trabajo está en edimburgo", "la empresa en la que trabajo está en edimburgo"], note: "Preposition fronted + article + que: para la que trabajo. No preposition-stranding in Spanish." },
    { t: "cz", q: "No me gusta ___ ___ estás insinuando. (two words — the thing you're insinuating)", a: "lo que", note: "Clause-sized antecedent → lo que." },
    { t: "mc", q: "el escritor cuy___ libros traduje — the ending is:", o: ["cuyo (agrees with escritor)", "cuyos (agrees with libros)", "cuyas"], i: 1, why: "cuyo agrees with the possessed thing (libros, m pl), not the possessor: cuyos libros." },
    { t: "tr", q: "What worries me is the latency. (preocupar)", a: "lo que me preocupa es la latencia", note: "Subject-position lo que: what-worries-me is…" },
    { t: "fix", q: "Es la persona que confío más.", bad: "que", a: "en la que", why: "confiar binds en, and the preposition must front the relative: la persona en la que (or en quien) más confío.", code: "E0702" },
    { t: "cz", q: "La razón ___ ___ ___ renuncié es complicada. (three words)", a: "por la que", note: "reason-relatives: la razón por la que…" },
    { t: "tr", q: "Everything (that) you see here is generated. (generado)", a: "todo lo que ves aquí está generado", alt: ["todo lo que ves aquí es generado", "todo lo que ves aqui esta generado"], note: "todo lo que — the everything-relative; and estar + participle for the resulting state." }
  ]},

  { id: "plumb-4", title: "discourse connectors: the control flow of argument", doc: `
Sentence-level Spanish is easy to parse; *paragraph-level* Spanish runs on connectors. This is what separates textbook answers from sounding like a colleague. Group them by control-flow role:

## Contrast (branching)

~pero~ (but) · ~sin embargo~ (however) · ~no obstante~ (nevertheless, formal) · ~aunque~ (although) · ~a pesar de (que)~ (despite) · ~en cambio~ (whereas/on the other hand) · ~mientras que~ (whereas)

@ El plan era bueno; sin embargo, nadie lo siguió. | The plan was good; however, nobody followed it.
@ Yo uso vim, mientras que ella usa emacs. | I use vim, whereas she uses emacs.

## Cause & consequence (data flow)

~porque~ (because) · ~como~ (since — clause-initial only!) · ~ya que / puesto que~ (given that) · ~por eso~ (that's why) · ~así que~ (so) · ~por lo tanto~ (therefore) · ~debido a~ (due to)

@ Como no había tests, nadie tocaba el código. | Since there were no tests, nobody touched the code.
@ No hay presupuesto, así que lo hacemos nosotros. | There's no budget, so we're doing it ourselves.

(~como~ = “since” must open the sentence; ~porque~ never can.)

## Sequencing & structure

~en primer lugar~ (firstly) · ~además~ (moreover) · ~por un lado… por otro~ (on one hand… on the other) · ~en cuanto a~ (as for) · ~en resumen~ (in summary) · ~al fin y al cabo~ (at the end of the day)

## Reformulation & hedging (the fluency multipliers)

~o sea~ (I mean/that is — Spain's most-used filler) · ~es decir~ (that is to say) · ~en realidad~ (actually) · ~de hecho~ (in fact) · ~por lo visto~ (apparently) · ~en principio~ (in principle/nominally) · ~bueno~ (well…) · ~pues~ (well/then) · ~vamos~ (I mean, come on) · ~en plan~ (like — youth register)

@ En principio el deploy es mañana; o sea, si pasa el QA. | Nominally the deploy is tomorrow; that is, if QA passes.
@ De hecho, ya está arreglado. | In fact, it's already fixed.
`,
  ex: [
    { t: "cz", q: "___ no tenía batería, no pude avisarte. (since — sentence-initial)", a: "como", note: "Clause-initial since = como. porque can't open the sentence in this role." },
    { t: "cz", q: "El código compila; ___ ___, los tests no pasan. (however — two words)", a: "sin embargo", note: "The workhorse contrast connector: sin embargo." },
    { t: "tr", q: "There was no documentation, so we read the source code.", a: "no había documentación así que leímos el código fuente", alt: ["no había documentación, así que leímos el código fuente", "como no había documentación leímos el código fuente", "como no había documentación, leímos el código fuente"], note: "Consequence: así que (or recast with como). había/leímos: state + event, as trained." },
    { t: "mc", q: "o sea is used for:", o: ["Formal conclusions", "Reformulating/clarifying what you just said — the everyday “I mean”", "Mathematics only"], i: 1, why: "o sea is Spain's universal rephraser: …el viernes, o sea, pasado mañana. Overuse is a national sport." },
    { t: "cz", q: "Me encanta el proyecto; el sueldo, ___ ___, es otro tema. (on the other hand — two words)", a: "en cambio", alt: ["sin embargo"], note: "Contrastive topic-switch: en cambio." },
    { t: "tr", q: "In fact, the bug was in our code, not in the library.", a: "de hecho el bug estaba en nuestro código no en la librería", alt: ["de hecho, el bug estaba en nuestro código, no en la librería", "de hecho el error estaba en nuestro código no en la librería"], note: "de hecho + imperfect for where-it-was (state)." },
    { t: "cz", q: "___ ___ ___ (as for — three words) la migración, hablamos el lunes.", a: "en cuanto a", note: "Topic-shift: en cuanto a la migración…" },
    { t: "tr", q: "Apparently the meeting is cancelled. (por lo visto)", a: "por lo visto la reunión está cancelada", alt: ["por lo visto, la reunión está cancelada", "por lo visto se ha cancelado la reunión", "por lo visto han cancelado la reunión"], note: "por lo visto = hearsay marker + estar + participle for the resulting state." }
  ]},

  { id: "plumb-5", title: "comparison operators: más que, tan como, and friends", doc: `
The comparison toolkit — small, regular, and with exactly four irregulars and one number-trap.

## Inequality: más/menos… que

@ Rust es más estricto que Python. | stricter than
@ Este método tiene menos efectos secundarios que aquel. | fewer side effects than
@ Trabaja más que nadie. | She works harder than anyone.

**Before a number, que becomes de**: ~más de cien usuarios~, ~menos de una hora~. (~más que cien~ is the classic tell of an English speaker.)

## Equality: tan… como / tanto… como

- adjectives/adverbs: [[tan + adj + como]]: ~tan rápido como~
- nouns: [[tanto/a/os/as + noun + como]] (agrees!): ~tanta memoria como~, ~tantos bugs como~
- verbs: [[verb + tanto como]]: ~no duermo tanto como antes~

@ El staging es tan lento como producción. | as slow as
@ No hay tantas mujeres como debería en esta industria. | as many as there should be

## The four irregular comparatives

| bueno → ~mejor~ | malo → ~peor~ |
| grande → ~mayor~ (older/greater) | pequeño → ~menor~ (younger/lesser) |

~más grande / más pequeño~ survive for physical size: ~mi hermano mayor~ (older) vs ~una caja más grande~ (bigger).

## Superlatives

[[el/la/los/las + más + adj (+ de)]]: ~el bug más raro de mi carrera~ — note **de** where English says *in*: ~el mejor restaurante de la ciudad~.

## The absolute superlative: -ísimo

Bolt ~-ísimo~ onto an adjective for very-very: ~lentísimo, carísimo, dificilísimo, muchísimo~. Orthographic patches apply: ~rico → riquísimo~, ~largo → larguísimo~, ~feliz → felicísimo~.

@ La demo salió bien — el cliente quedó contentísimo. | The demo went well — the client was thrilled.

## cada vez más — the trend operator

@ El build es cada vez más lento. | The build keeps getting slower. — the idiomatic “increasingly”
`,
  ex: [
    { t: "cz", q: "El nuevo servidor es más rápido ___ el viejo.", a: "que", note: "Plain inequality: más… que." },
    { t: "cz", q: "Había más ___ doscientas personas en la charla. (careful)", a: "de", note: "Before a number: más de. más que doscientas is the classic anglicism." },
    { t: "tr", q: "This laptop is as fast as mine.", a: "este portátil es tan rápido como el mío", alt: ["este portatil es tan rapido como el mio", "este ordenador es tan rápido como el mío"], note: "Equality with an adjective: tan… como." },
    { t: "cz", q: "No tengo ___ paciencia ___ tú. (as much… as — two blanks)", a: "tanta, como", alt: ["tanta como"], note: "Noun equality agrees: tanta paciencia como. tan paciencia is the trap." },
    { t: "mc", q: "“My older sister” is:", o: ["mi hermana más grande", "mi hermana mayor", "mi hermana más vieja"], i: 1, why: "Age uses the irregular mayor: mi hermana mayor. más grande = physically bigger; más vieja is unkind." },
    { t: "tr", q: "It's the best restaurant in the neighbourhood. (el barrio)", a: "es el mejor restaurante del barrio", traps: [{ re: "\\ben el barrio$", c: "E0501", m: "superlative + de, not en", n: "Superlative scope takes de: el mejor del barrio." }] },
    { t: "cz", q: "La película es larguísima — dura ___ ___ tres horas. (more than)", a: "más de", note: "Number → de. And note larguísima's gu patch." },
    { t: "tr", q: "The queries are getting slower and slower. (las consultas)", a: "las consultas son cada vez más lentas", alt: ["las consultas están cada vez más lentas", "las consultas se vuelven cada vez más lentas"], note: "The trend operator: cada vez más + agreeing adjective." }
  ]}
]});

window.CURRICULUM.push({
  id: "prod", name: "runtime.production", title: "Production deployment",
  tagline: "Ship it: talking shop in Spanish, full narrative assembly, holding opinions under fire, Spain-colloquial, and the graduation suite.",
  deps: ["fut", "gust", "subj2", "plumb"],
  lessons: [

  { id: "prod-1", title: "talking shop: the engineer's Spanish", doc: `
Time to load the domain vocabulary. Spanish tech speech is a pragmatic mix: core CS terms are translated, tooling verbs get borrowed and conjugated with a straight face.

## The translated core

| es | en | | es | en |
| el archivo/fichero | file | | la red | network |
| el código (fuente) | (source) code | | el servidor | server |
| el equipo | team; also computer | | la base de datos | database |
| el desarrollador | developer | | el rendimiento | performance |
| la programadora | programmer | | el entorno | environment |
| el lenguaje | language | | la herramienta | tool |
| la biblioteca/librería | library | | el hilo | thread |
| el ordenador | computer (Spain) | | la memoria | memory |
| el teclado | keyboard | | el fallo/error | failure/bug |
| la pantalla | screen | | la solicitud/petición | request |
| el usuario | user | | el rasgo/la característica | feature |
| la contraseña | password | | el ámbito/alcance | scope |

## The verbs

~programar~ · ~desarrollar~ · ~compilar~ · ~ejecutar~ (run) · ~depurar~ (debug) · ~desplegar~ (deploy) · ~probar (ue)~ (test) · ~guardar~ (save) · ~borrar~ (delete) · ~descargar~ (download) · ~subir~ (upload/push) · ~arreglar~ (fix) · ~fallar~ (fail) · ~funcionar~ (work) · ~reiniciar~ (restart) · ~actualizar~ (update)

## The borrowed layer (real-world Spain office)

Spoken office Spanish freely conjugates loans: ~mergear, deployar, comitear, pushear, testear, debuggear~. You'll also hear ~hacer + noun~: ~hacer deploy, hacer login, hacer un commit~. Use the translated verbs in writing; understand both.

@ ¿Has subido los cambios? | Have you pushed the changes?
@ El servicio se cayó otra vez. | The service went down again. — caerse for outages
@ Estamos migrando la base de datos. | We're migrating the database.
@ Funciona en mi máquina. | Works on my machine. — universal constant

## Describing your work

@ Soy ingeniero de software y trabajo en sistemas distribuidos. | classification → ser
@ Llevo diez años programando. | I've been programming for ten years. — llevar + duration + gerund, THE tenure idiom
@ Me dedico al procesamiento de datos. | I work in data processing. — dedicarse a
`,
  ex: [
    { t: "tr", q: "I've been working at this company for five years. (llevar + gerund)", a: "llevo cinco años trabajando en esta empresa", alt: ["llevo cinco años en esta empresa"], note: "llevar + duration + gerund — the tenure idiom English speakers never find on their own." },
    { t: "cz", q: "El servicio ___ ___ (caerse, perfecto) dos veces esta semana. (two words)", a: "se ha caído", note: "Outages use caerse; this week = open period → perfect (Spain)." },
    { t: "tr", q: "The bug is in the database, not in the code.", a: "el error está en la base de datos no en el código", alt: ["el error está en la base de datos, no en el código", "el bug está en la base de datos no en el código", "el fallo está en la base de datos no en el código"], note: "Location of a thing → estar." },
    { t: "cz", q: "¿Puedes ___ (ejecutar) los tests antes de subir los cambios?", a: "ejecutar", note: "ejecutar = run (code). subir = push. Both worth using in their translated forms." },
    { t: "mc", q: "Llevo tres años programando en Rust means:", o: ["I carried Rust for three years", "I've been programming in Rust for three years", "I'll program Rust for three years"], i: 1, why: "llevar + time + gerund = have-been-doing-for. The single most useful structure for introducing your experience." },
    { t: "tr", q: "What does your team do? (dedicarse)", a: "¿a qué se dedica tu equipo?", alt: ["a qué se dedica tu equipo", "¿a qué se dedica vuestro equipo?"], note: "dedicarse a — also THE question for what someone does for a living: ¿a qué te dedicas?" },
    { t: "cz", q: "Primero ___ ___ (compilar, impersonal se), luego ___ ___ (desplegar, impersonal se). (two words each)", a: "se compila, se despliega", alt: ["se compila se despliega"], note: "Technical process description runs on se: first it compiles, then it deploys. despliega: e→ie." },
    { t: "tr", q: "It works on my machine.", a: "funciona en mi máquina", alt: ["en mi máquina funciona", "funciona en mi maquina"], note: "The sacred incantation. funcionar = work (of things); trabajar is for people." }
  ]},

  { id: "prod-2", title: "narrative assembly: telling a whole story", doc: `
Full integration of the past-tense machinery: scene (imperfect) + events (preterite) + flashbacks (pluperfect) + dialogue (perfect where Spain uses it). Here's a complete worked anecdote — read it aloud, layer-tagging each verb:

@ El viernes pasado ~pasó~ algo increíble. | event — opener
@ ~Eran~ las cinco y media y ya ~estábamos~ pensando en el fin de semana. | scene
@ De repente ~saltaron~ todas las alarmas: producción no ~respondía~. | event + state
@ Resulta que alguien ~había desplegado~ una migración sin probarla. | flashback — pluperfect
@ ~Encontramos~ el commit, lo ~revertimos~ y en veinte minutos todo ~volvía~ a funcionar. | events + closing state
@ El lunes ~pusimos~ una regla nueva: nada de deploys en viernes. | event — punchline

## The storyteller's toolkit

- **Openers**: ~¿Sabes qué me pasó?~ (know what happened to me?) · ~Resulta que…~ (turns out…) · ~El otro día…~
- **Tension**: ~de repente~ · ~en ese momento~ · ~y entonces~ · ~total, que…~ (long story short)
- **Reactions as a listener**: ~¿En serio?~ · ~¡No me digas!~ · ~¡Qué fuerte!~ (no way!) · ~¿Y qué pasó?~ · ~Menos mal~ (thank goodness)
- **Landing it**: ~al final~ · ~moraleja:~ (moral of the story) · ~y ya está~ (and that's it)

## Reported speech: shift everything back

Reporting past speech shifts tenses down one notch — present→imperfect, preterite/perfect→pluperfect, future→conditional:

@ “Estoy en el tren” → Dijo que ~estaba~ en el tren. | present → imperfect
@ “Lo arreglé” → Dijo que lo ~había arreglado~. | preterite → pluperfect
@ “Llegaré tarde” → Dijo que ~llegaría~ tarde. | future → conditional

! Killer detail: questions report with ~si~ (whether) — ~Me preguntó si tenía tiempo~ — and question words keep their accents in reported form: ~Me preguntó dónde estaba~.
`,
  ex: [
    { t: "tr", q: "Turns out nobody had tested the migration.", a: "resulta que nadie había probado la migración", alt: ["resulta que nadie había testeado la migración", "resulta que nadie habia probado la migracion"], note: "resulta que + pluperfect flashback — the anecdote's hinge." },
    { t: "cz", q: "___ (ser) medianoche y todavía ___ (quedar) tres tests rotos cuando por fin ___ (encontrar, yo) el fallo.", a: "era, quedaban, encontré", alt: ["era quedaban encontré"], note: "Scene (era, quedaban) then the breakthrough event (encontré)." },
    { t: "tr", q: "She said she would arrive late.", a: "dijo que llegaría tarde", note: "Reported future → conditional: llegaría." },
    { t: "cz", q: "“He terminado el informe” → Dijo que ___ ___ el informe. (two words)", a: "había terminado", note: "Reported perfect shifts to pluperfect: había terminado." },
    { t: "tr", q: "He asked me if I had time.", a: "me preguntó si tenía tiempo", note: "Reported yes/no question: preguntar si + shifted tense (tengo → tenía)." },
    { t: "mc", q: "Your colleague finishes a horror story about prod. The natural reaction:", o: ["Es verdad.", "¡Qué fuerte! ¿Y qué pasó al final?", "Gracias por la información."], i: 1, why: "¡Qué fuerte! is the all-purpose Spain reaction to drama; ¿y qué pasó? keeps the story alive. Option 3 ends friendships." },
    { t: "tr", q: "Long story short, we rolled everything back and went home at three in the morning. (total que, revertir → revertimos)", a: "total que lo revertimos todo y nos fuimos a casa a las tres de la mañana", alt: ["total, que lo revertimos todo y nos fuimos a casa a las tres de la mañana", "total que revertimos todo y nos fuimos a casa a las tres de la madrugada"], note: "total, que… compresses the boring middle; two closing events in preterite." },
    { t: "cz", q: "Me preguntó ___ (where) ___ (estar) el archivo de configuración. (reported question)", a: "dónde, estaba", alt: ["dónde estaba"], note: "Question word keeps its accent in reported speech; tense shifts to imperfect: dónde estaba." }
  ]},

  { id: "prod-3", title: "holding opinions under fire", doc: `
The full opinion stack, assembled from modules you own: assertion mood-switching (subj-4), judgment triggers (subj-3), connectors (plumb-4) and politeness (fut-3). This is the lesson that turns grammar into meetings.

## Stating positions, with calibrated confidence

@ Estoy convencido de que es la opción correcta. | high confidence → indicative
@ Creo que deberíamos esperar. | standard → indicative
@ Diría que el problema es otro. | hedged — conditional softener
@ No sé si merece la pena. | genuinely unsure
@ No creo que escale. | declining to assert → subjunctive

## Agreeing and disagreeing like a native

| move | phrase |
| full agreement | ~Totalmente de acuerdo.~ / ~Sin duda.~ |
| partial | ~Sí, pero…~ / ~Hasta cierto punto.~ / ~Depende.~ |
| polite dissent | ~No lo veo (así).~ / ~Yo no lo haría así.~ |
| firm dissent | ~No estoy de acuerdo en absoluto.~ |
| conceding | ~Tienes razón.~ / ~Visto así, sí.~ (put that way, yes) |
| pivot | ~Ya, pero…~ (yeah, but…) — the Spanish debate workhorse |

~estar de acuerdo con~ — agree *with*; note the signature: never ~*acordar con~.

## The debate skeleton

@ Por un lado, el rendimiento mejora; por otro, la complejidad se dispara. | on one hand… on the other
@ Entiendo tu punto, pero no creo que sea tan sencillo. | concede then counter — with the subjunctive doing the dissent
@ Lo que quiero decir es que el coste no es el problema. | what I mean is…
@ Al fin y al cabo, es una decisión del equipo. | at the end of the day

## Softening machinery recap

Disagreement in Spanish leans on grammar, not volume: conditional (~yo diría, no lo haría~), subjunctive-after-no-creo, and diminutive hedges (~un poco arriesgado~, ~algo lento~). Blunt indicative dissent (~te equivocas~ — you're wrong) is for friends and emergencies.
`,
  ex: [
    { t: "tr", q: "I understand your point, but I don't think it's so simple.", a: "entiendo tu punto pero no creo que sea tan sencillo", alt: ["entiendo tu punto, pero no creo que sea tan sencillo", "entiendo tu punto pero no creo que sea tan simple"], note: "Concede-then-counter, with no creo que + sea carrying the dissent." },
    { t: "cz", q: "___ ___ (I would say) que el cuello de botella está en la red. (hedged opinion — two words)", a: "yo diría", alt: ["diría"], note: "Conditional softener: yo diría que + indicative (you're still asserting, just gently)." },
    { t: "mc", q: "A colleague proposes rewriting everything in a new framework. You half-agree. The natural move:", o: ["Totalmente de acuerdo.", "Ya, pero ¿quién lo va a mantener?", "Te equivocas."], i: 1, why: "Ya, pero… concedes and counters in four letters — the load-bearing phrase of every Spanish meeting." },
    { t: "tr", q: "On one hand it's faster; on the other, nobody knows the tool.", a: "por un lado es más rápido por otro nadie conoce la herramienta", alt: ["por un lado es más rápido; por otro, nadie conoce la herramienta", "por un lado, es más rápido; por otro, nadie conoce la herramienta", "por un lado es más rápido y por otro nadie conoce la herramienta"], note: "The balanced-argument frame + conocer for tool-acquaintance." },
    { t: "cz", q: "No estoy de acuerdo ___ esa decisión.", a: "con", note: "estar de acuerdo con — the signature. And remember there's no verb *acordar con for agreeing-with." },
    { t: "tr", q: "It depends. Up to a point, you're (tú) right.", a: "depende hasta cierto punto tienes razón", alt: ["depende. hasta cierto punto, tienes razón", "depende, hasta cierto punto tienes razón"], note: "depende + hasta cierto punto + tener razón (idiom: to be right — with tener)." },
    { t: "cz", q: "Lo que quiero ___ (decir) es que el problema no es técnico, ___ (but) político. (two blanks)", a: "decir, sino", alt: ["decir sino"], note: "lo que quiero decir es que… + SINO: after a negative, “but rather” is sino, not pero. A final plumbing gift." },
    { t: "mc", q: "Why does no creo que sea tan sencillo soften better than no es tan sencillo?", o: ["It's longer", "The subjunctive frames it as your suspended belief rather than a counter-assertion of fact", "sencillo is polite"], i: 1, why: "Mood as diplomacy: declining-to-assert attacks the idea without attacking the speaker's grip on reality." }
  ]},

  { id: "prod-4", title: "colloquial Spain: the street-level runtime", doc: `
Textbook Spanish compiles everywhere; this lesson is the Spain-specific runtime environment — what people in Madrid or Valencia actually say, at work and in the bar afterwards.

## The particle layer

| particle | function |
| ~vale~ | OK (the universal acknowledgement — you'll say it 50×/day) |
| ~venga~ | come on / OK let's go / (closing a call) right then |
| ~bueno~ | well… (turn-opener, mild disagreement) |
| ~pues~ | well/so (buys thinking time) |
| ~hombre / mujer~ | oh come on / well obviously (vocative filler) |
| ~anda~ | no way / come off it |
| ~a ver~ | let's see / look… (opens explanations) |
| ~es que…~ | the thing is… (THE excuse-opener) |
| ~¿no? / ¿verdad?~ | tag questions: right? |

@ A ver, es que el sprint ya está cerrado, ¿no? | Look, thing is, the sprint's already closed, right?
@ ¡Venga, va! Una caña y me voy. | Oh go on then! One beer and I'm off.

## People and things

~tío/tía~ (mate — universal) · ~chaval(a)~ (kid) · ~el curro~ (work/job: ~voy al curro~) · ~currar~ (to work) · ~el finde~ (weekend) · ~la peña~ (the gang/people) · ~la pasta~ (money) · ~el rollo~ (a drag/vibe: ~qué rollo~ — what a bore) · ~mogollón (de)~ (loads of) · ~flipar~ (to be amazed: ~flipé~ — I was gobsmacked) · ~molar~ (to be cool: ~mola mucho~ — gustar-pattern!) · ~liarse~ (to get complicated/tangled: ~me lié con las fechas~) · ~apañarse~ (to manage/get by)

@ El finde estuvo genial, tío — flipé con el concierto. | The weekend was great, mate — the gig blew my mind.
@ Se lió muchísimo el despliegue. | The deployment got properly tangled.

## Intensifiers & reactions

~qué va~ (no way/not at all) · ~para nada~ (not at all) · ~ni de broma~ (not a chance) · ~menudo/a + noun~ (what a…: ~menudo bug~) · ~vaya + noun~ (~vaya día~ — what a day) · ~qué fuerte~ (unbelievable!) · ~genial / guay / de lujo~ (great/cool/perfect) · ~fatal~ (terribly: ~me salió fatal~ — it went horribly)

## vosotros in the wild

Spain runs on vosotros: ~¿Qué hacéis?~ ~¿Os venís?~ (you lot coming?) ~¡Callaos!~ — using ustedes with friends in Spain sounds like HR is present. This course drilled vosotros throughout; here's where it pays off.

! Register guardrail: ~tío~, ~flipar~, ~es que~ are fine with any colleague under sixty; ~joder~ and stronger — extremely common but save them until you can calibrate. When in doubt, ~jolín / jope~ are the safe pressure-release valves.
`,
  ex: [
    { t: "mc", q: "Your colleague says ¿Nos tomamos una caña luego? The Spain-native yes:", o: ["Sí, estoy de acuerdo.", "¡Venga!", "Lo consideraré."], i: 1, why: "venga = go on then/let's do it. Option 1 is a committee; option 3 is a rejection letter." },
    { t: "cz", q: "No puedo ir — ___ ___ tengo mogollón de curro. (the excuse-opener, two words)", a: "es que", note: "es que fronts every excuse in Spain: es que tengo mogollón de curro = thing is, I've got loads of work." },
    { t: "tr", q: "What a day, mate — the deploy got completely tangled. (menudo, liarse)", a: "menudo día tío se lió por completo el deploy", alt: ["menudo día, tío — se lió por completo el deploy", "menudo día tío el deploy se lió por completo", "vaya día tío se lió por completo el deploy"], note: "menudo/vaya + noun for what-a; liarse for things going sideways." },
    { t: "mc", q: "mola mucho works like:", o: ["ser: yo molo mucho means I like it a lot", "gustar: me mola mucho = I really like it — inverted, agreement with the thing", "an adjective"], i: 1, why: "molar joins the gustar family: me mola tu setup, me molan estos teclados. The inverted-interface pattern keeps paying rent." },
    { t: "cz", q: "¿Qué ___ (hacer, vosotros) el finde? — Nada, currar.", a: "hacéis", alt: ["hicisteis"], note: "vosotros in its natural habitat + el finde + currar. (hicisteis if you read it as last weekend.)" },
    { t: "tr", q: "No way! Did they cancel the project? (flipar-register reaction + perfect)", a: "¡qué fuerte! ¿han cancelado el proyecto?", alt: ["qué fuerte han cancelado el proyecto", "¡no me digas! ¿han cancelado el proyecto?", "¡anda! ¿han cancelado el proyecto?"], note: "qué fuerte / no me digas / anda — pick your gasp; perfect tense for the fresh news." },
    { t: "cz", q: "— ¿Te ayudo? — No hace falta, ya me ___ (apañarse, yo).", a: "apaño", note: "apañarse = manage/get by: ya me apaño = I'll manage." },
    { t: "tr", q: "Right then, I'm off — see you (vosotros) on Monday!", a: "venga me voy nos vemos el lunes", alt: ["venga, me voy — ¡nos vemos el lunes!", "venga me voy hasta el lunes", "venga, me voy, nos vemos el lunes"], note: "venga as the call-closer + me voy (irse) + nos vemos — the standard Spanish goodbye stack." }
  ]},

  { id: "prod-5", title: "graduation: the final integration suite", doc: `
No new material. This is the end-to-end test of the whole curriculum — every module contributes at least one item, most items compose several. Read each prompt, identify which subsystems it exercises, then produce.

## What you now hold

- **types & state**: ser/estar, gender, agreement, hay
- **dispatch**: present in all its families; reflexives
- **references**: clitic case, order, placement, se-rewrites, personal a
- **the event system**: preterite vs imperfect — aspect on demand
- **async**: futures, conditionals, probability mode, perfects
- **inverted interfaces**: gustar family, accidents, impersonal se
- **moods**: commands; the subjunctive across triggers, antecedents, time, and counterfactuals; sequence of tenses
- **plumbing**: por/para, verb signatures, relatives, connectors, comparisons
- **production**: shop talk, narration, debate, Spain-colloquial

## Where to go from here

- Re-run failed suites; the build queue (nightly reviews) is now your main loop — keep it green.
- The conjugator (~conj~ tab) accepts any verb in the registry across nine tenses — drill your personal weak spots.
- Native input is the real curriculum now: Spanish tech podcasts, RAE's word-of-the-day, a codebase with Spanish comments, or a Spanish colleague who'll tolerate ~o sea~ overuse.

Suerte — y que el subjuntivo te acompañe.
`,
  ex: [
    { t: "tr", q: "When I arrived, the meeting had already started, so I sat down without anyone seeing me.", a: "cuando llegué la reunión ya había empezado así que me senté sin que nadie me viera", alt: ["cuando llegué, la reunión ya había empezado, así que me senté sin que nadie me viera", "cuando llegué la reunión ya había empezado así que me senté sin que nadie me viese"], note: "Preterite + pluperfect + connector + sin que + imperfect subjunctive + clitic. Five modules, one sentence." },
    { t: "tr", q: "I don't think there's anyone who understands this code better than she does.", a: "no creo que haya nadie que entienda este código mejor que ella", alt: ["no creo que haya nadie que entienda este codigo mejor que ella"], note: "Negated belief (haya) + empty-set antecedent (entienda) + comparison (mejor que). Double subjunctive chain." },
    { t: "tr", q: "If we had more time, I would ask you (tú) to document it before deploying it.", a: "si tuviéramos más tiempo te pediría que lo documentaras antes de desplegarlo", alt: ["si tuviéramos más tiempo, te pediría que lo documentaras antes de desplegarlo", "si tuviésemos más tiempo te pediría que lo documentases antes de desplegarlo"], note: "Counterfactual si (tuviéramos) → conditional (pediría) → sequence-of-tenses subjunctive (documentaras) + attached clitic (desplegarlo)." },
    { t: "cz", q: "Se ___ ___ (olvidarse, a mí, perfecto) las llaves otra vez — ¡y eso que ___ (poner, tú) un recordatorio para que no me pasara! (accidental se + concession)", a: "me han olvidado, pusiste", alt: ["me han olvidado pusiste"], note: "Accidental se in perfect (agreement with las llaves → han) + preterite + para que + past subjunctive already supplied." },
    { t: "tr", q: "She told me she would send it (m) to me as soon as the tests passed.", a: "me dijo que me lo mandaría en cuanto pasaran los tests", alt: ["me dijo que me lo mandaría en cuanto los tests pasaran", "me dijo que me lo enviaría en cuanto pasaran los tests", "me dijo que me lo mandaría en cuanto pasasen los tests"], note: "Reported speech (mandaría) + double clitic (me lo) + pending-time-from-the-past (pasaran)." },
    { t: "tr", q: "Mate, I love how this app teaches the subjunctive — I find it less hard every time. (molar or encantar; costar; cada vez menos)", a: "tío me encanta cómo enseña el subjuntivo esta app cada vez me cuesta menos", alt: ["tío, me encanta cómo enseña el subjuntivo esta app — cada vez me cuesta menos", "tío me mola cómo enseña el subjuntivo esta app cada vez me cuesta menos", "tía me encanta cómo enseña el subjuntivo esta app cada vez me cuesta menos"], note: "Inverted interfaces ×2 (encanta/mola, cuesta) + trend operator + tío. You are now dangerous." },
    { t: "mc", q: "Final question. ¿Qué es lo más importante que has aprendido? — the mood in the relative clause is:", o: ["Subjunctive — superlatives always take it", "Indicative — has aprendido: it's your real, existing learning being asserted", "Either, changing the claim"], i: 1, why: "Known, realised antecedent → indicative. The subjunctive marks unasserted clauses — and knowing exactly when NOT to use it is the true graduation. ¡Enhorabuena!" },
    { t: "tr", q: "At the end of the day, what matters is that it works. (importar, funcionar)", a: "al fin y al cabo lo que importa es que funcione", alt: ["al fin y al cabo, lo que importa es que funcione", "al fin y al cabo lo importante es que funcione"], note: "Connector + lo que relative + judgment-trigger subjunctive (que funcione). The engineer's credo, en español." }
  ]}
]});
