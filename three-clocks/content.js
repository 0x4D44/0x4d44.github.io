// ============================================================
// Three Clocks — the prose.
//
// Content only. app.js knows how to draw these block types and nothing
// about what they say; model.js computes every number that moves.
// Numbers that appear as literal text here are OBSERVATIONS, each with
// a source in window.TC.sources. Numbers that are forecasts are never
// written here — they are interpolated from the live model run at
// render time, so the page cannot fall out of step with its own model.
//
// Block vocabulary:
//   {h}      heading            {p}     paragraph (**bold**, *italic*)
//   {lede}   opening paragraph  {pull}  pull quote
//   {note}   aside box          {list}  bulleted list
//   {stats}  figure row         {tiles} titled cards
//   {table}  columns + rows     {fig}   a computed figure, drawn by app.js
//   {defs}   definition list    {axis}  the three-axis comparison strip
// ============================================================
(function (w) {
  "use strict";

  var TC = {};

  // ============================================================
  // Landing
  // ============================================================

  TC.home = {
    title: "Three Clocks",
    sub: "Artificial intelligence, the climate, and the peace. What is actually going to happen, how confident anyone can be, and why the answer to the second question changes the answer to the first.",
    blocks: [
      { lede: "Three problems are routinely described as the great challenges of the century. They are not three versions of one problem. They run on different clocks, they answer to different numbers of people, and — the part that gets missed — the shape of what can go wrong is different in each case. Confusing those shapes is the most common error in public argument about all three." },

      { p: "This document is an attempt to say what happens next, in numbers, with the uncertainty attached. It is built on a model that runs in your browser: every band on every chart here is drawn from several hundred simulated futures, generated live from assumptions you can see and change. Nothing is hand-drawn to look reassuring or alarming." },

      { h: "The three axes that actually matter" },
      { p: "Rank these problems by how frightening they sound and you learn nothing. Rank them along three structural axes and a great deal falls out immediately." },

      { axis: true },

      { p: "**Lag** is the delay between doing something and seeing the effect. Climate's lag is measured in decades: the carbon dioxide emitted while you read this sets a floor under the temperature for centuries, and the emissions cut made today shows up in the temperature record around the middle of the century. Peace has no lag at all — a decision taken in an afternoon can kill a hundred million people that week, and a treaty signed on a Tuesday reduces the hazard on Wednesday. AI sits between, and the interesting thing about it is that its lag is *institutional* rather than physical: the delay is not the technology arriving, it is everyone else catching up." },

      { p: "**Actor count** is how many parties have to agree for the problem to be addressed. Climate needs something close to everybody: roughly a hundred and ninety countries, every large firm, and a substantial fraction of individual consumption decisions. Nuclear war needs nine states to agree, and realistically two of them. Frontier AI needs perhaps a dozen laboratories and three governments. This is the axis on which the conventional ranking most badly inverts: the problem that sounds most tractable requires the most consent, and the one that sounds least tractable requires the least." },

      { p: "**Tail shape** is the geometry of the loss distribution, and it is the axis almost nobody thinks about explicitly. Climate damage is close to certain and roughly proportional — a bad outcome is a few times worse than a moderate one, and the moderate one is already happening. War is the opposite: in a typical year almost nothing happens by the standards of history, and the average is dominated by the years that are not typical. Battle deaths are one of the most heavy-tailed quantities ever measured on human society. And AI's distribution is not fat or thin — it is *unspecified*, which is a worse epistemic position than either, and one that our decision procedures handle badly." },

      { pull: "Climate is a certainty we are arguing about. War is a lottery we have stopped buying insurance against. AI is a question we do not yet know how to pose." },

      { h: "What this document concludes" },
      { p: "Set out in full further on, with the numbers, the reasoning and the ways it could be wrong. In brief:" },

      { list: [
        "**Warming lands between about 1.9 and 3.3 degrees by 2100**, with a central estimate near 2.5. The physics has stopped being the uncertain part. What remains uncertain is political and economic, and the range of plausible political outcomes has narrowed sharply — in both directions. 1.5 degrees is gone. So, for different reasons, is most of the four-and-five-degree tail that dominated the 2010s literature: the collapse in the cost of solar generation and storage has quietly removed the pathway that produced it. The model still carries those futures — it has to — but only in a world that abandons decarbonisation outright.",
        "**AI produces a long, uneven, contested transition rather than a discontinuity.** The capability curve and the impact curve are different pictures, separated by an institutional diffusion lag that history says is measured in decades and not years. The most likely 2040 is one in which the technology is astonishing, the effects are concentrated and severe in particular occupations and regions, and the aggregate statistics are still being argued about.",
        "**The single largest loss event of this century is more likely to be a war than a climate event or an AI event.** This is the least intuitive conclusion here and it does not come from pessimism about geopolitics. It falls out of the arithmetic of heavy tails applied to base rates that have not changed, at a moment when the instruments that held the hazard down have been dismantled.",
        "**None of the three ends the species**, on any assumption this document is willing to defend. They are, in varying degrees, capable of ending the current arrangement of it, which is a different claim and a sufficient one.",
      ] },

      { note: "**On the honesty of forecasts.** A probability without a resolution criterion is decoration. Every numbered claim in the estimate section states what would settle it and by when. The author has no published forecasting track record, which means this document should be read as a structured argument rather than as an authority — the structure is the part you are meant to attack." },
    ],
  };

  // ============================================================
  // Method
  // ============================================================

  TC.method = {
    title: "How to forecast something like this",
    sub: "The methods that work, the ones that only look like they work, and what this model is actually doing.",
    blocks: [
      { lede: "Long-range forecasting has a bad reputation, mostly deserved. It is worth being precise about which parts are hopeless, because they are not the parts people assume, and the distinction determines what a document like this can honestly claim." },

      { h: "What is known about who gets this right" },
      { p: "The most useful empirical result in the field comes from Philip Tetlock's tournaments, which ran for two decades and scored tens of thousands of dated, resolvable geopolitical forecasts against outcomes. Two findings survive replication. The first is that the average credentialed expert did little better than simple extrapolation algorithms, and that the best-known experts — the ones most in demand as commentators — did worst of all. It is worth resisting the popular shorthand here: the study is usually reported as finding that experts were no better than a dart-throwing chimpanzee, Tetlock has objected to that gloss, and he is right to. The finding is not that expertise is worthless; it is that expertise stops paying above a fairly low threshold, and that confident generalisation past that point costs more than it returns. The second is that a minority of forecasters, identifiable in advance and consistent across years, beat the base rate substantially. Tetlock has spent two decades objecting to the compression of the first finding into \u201cexperts know nothing\u201d, and he is right to: the distribution is bimodal rather than uniformly poor, and the useful question is not whether to trust experts but which ones." },

      { p: "What separates them is not intelligence or subject knowledge, both of which are roughly flat across the distribution. It is a cluster of habits: they think in explicit probabilities rather than in words like *likely*; they use finer granularity, distinguishing 63% from 70% rather than rounding to a third; they start from a reference class and adjust, rather than reasoning forward from the specifics of the case; they update often and in small increments; and they hold no single organising theory of how the world works. Tetlock's borrowed label for the last trait is Isaiah Berlin's — the successful forecaster is a fox rather than a hedgehog, and the hedgehogs are precisely the people who get invited on television." },

      { note: "**The awkward caveat.** Those tournaments ran on questions resolving in months to a couple of years. Nobody has demonstrated comparable skill at horizons of decades, for the obvious reason that nobody has lived long enough to be scored. Every claim in this document beyond about 2035 rests on structural reasoning, not on demonstrated forecasting ability — and structural reasoning is exactly what hedgehogs are good at and wrong about." },

      { h: "The outside view, and where it runs out" },
      { p: "The single highest-yield move in forecasting is to ask what usually happens to things of this kind, before asking what will happen to this thing. Most technologies take longer to diffuse than their advocates expect. Most wars are small. Most predicted collapses do not occur. Most political systems muddle. The base rate beats the narrative more often than the narrative beats the base rate, and the narrative is always more interesting, which is why it wins the argument and loses the bet." },

      { p: "The difficulty is that the outside view requires a reference class, and the interesting questions are precisely the ones where the reference class is disputed. Is a frontier AI system a member of the class *general-purpose technologies*, alongside electricity, the internal combustion engine and the computer — in which case the historical diffusion record is directly informative and the answer is *slower than you think, then all at once, over about forty years*? Or is it a member of the class *new intelligent species*, of which we have exactly one prior example and it did not go well for the other hominids? These reference classes give answers that differ by orders of magnitude, and choosing between them is the whole question, not a preliminary to it." },

      { p: "The honest response is not to pick one. It is to run both and let the resulting distribution be wide, which is what the model below does: the width of the AI cone is not vagueness, it is the disagreement, drawn to scale." },

      { h: "Three failure modes to watch for" },
      { tiles: [
        { h: "The narrative discount", p: "A detailed story is less likely than a vague one, always, because every added detail is another conjunction. Yet detailed stories feel more probable — this is the conjunction fallacy, and it is the reason that vivid scenario documents about specific futures are systematically overconfident. If a forecast reads like a novel, discount it in proportion to how good the novel is." },
        { h: "The trend that was a phase", p: "Extrapolation works until the mechanism producing the trend changes, and the mechanism is usually invisible in the trend. Moore's law held for fifty years and then quietly stopped being about transistor cost. Compute scaling has held for fifteen and is now bounded by electrical power rather than by money, which is a different regime with a different slope." },
        { h: "Motivated timelines", p: "Almost everyone with a quantified public position on AI timelines has a financial or reputational stake in the answer. This is not an accusation of dishonesty; it is a structural observation about which estimates get made and published. The correct adjustment is to weight the estimate by the estimator's exposure, in both directions — the sceptics with tenure have incentives too." },
      ] },

      { h: "What the model on this site actually does" },
      { p: "It is a Monte Carlo. Several hundred times, it draws a complete world — a climate sensitivity, a decarbonisation pathway, a rate of algorithmic progress, a diffusion lag, a tail index for war severity, a nuclear hazard rate — from stated prior distributions, then runs that world forward year by year to 2100 and records what happened. The bands you see are the percentiles of that ensemble. The median line is not a prediction of the median world; it is the middle of the distribution of outcomes, which is a subtly different and more defensible object." },

      { p: "Three properties are worth stating plainly, because they are what makes the exercise something other than a graph generator." },

      { list: [
        "**Every world is conditioned on the observed record.** The climate module does not draw a sensitivity and run with it: it draws a sensitivity, computes what warming that implies for 2025, and rejects the combination if explaining the thermometer would then require an implausible amount of non-CO2 forcing. Worlds that have already been falsified do not get to be in the cone. About a third of draws are rejected, and the surviving likely range for climate sensitivity narrows from 0.30–0.63 to 0.38–0.59 °C per trillion tonnes. Almost all of that cut falls on the *low* side, for a reason worth stating: a low-sensitivity world has to account for the 1.44 degrees already measured using something other than CO2, and there is not enough non-CO2 forcing available to do it. This is not the model rediscovering the IPCC's range — the prior is taken from the IPCC, so that would be circular. It is the observational record doing what observational records do, which is kill off the comfortable end of the distribution.",
        "**The tails are drawn from the distributions the data show, not the ones that are convenient.** War severity is heavy-tailed to a degree that makes the average annual death toll several times the typical one. Modelling it with a normal distribution, which is what an implicit mental model does, is not a simplification but a different and wrong answer.",
        "**The couplings are explicit and switchable.** Warming feeding conflict, AI feeding energy demand, AI feeding nuclear instability: each has a signed, sampled coefficient, and you can turn the whole set off to see how much of the answer they are carrying. In the default configuration, less than you would expect — which is itself a finding.",
      ] },

      { note: "**What it is not.** It is not a climate model: a climate model solves fluid dynamics on a rotating sphere, and this multiplies cumulative carbon by a constant. It is not an economic model. It has no predictive skill beyond the skill of the priors put into it, and where a prior is weak the cone is wide. Its value is that the assumptions are legible and arguable, which is more than can be said for the intuitions it is competing with." },
    ],
  };

  // ============================================================
  // The AI clock
  // ============================================================

  TC.ai = {
    title: "The AI clock",
    sub: "Capability is not impact. The gap between them is where the next twenty years actually happen.",
    blocks: [
      { lede: "Almost every argument about artificial intelligence conflates two curves that have historically been decades apart: what the technology can do, and what it has actually changed. Separating them dissolves a surprising amount of the disagreement — and sharpens what is left." },

      { h: "Where the capability curve is" },
      { p: "The measurable inputs are unambiguous and their rate is extraordinary. Training compute for frontier models grew by a factor of four to five per year from 2010 to 2024 — roughly six tenths of an order of magnitude annually, sustained for fourteen years. Algorithmic efficiency added its own contribution: the compute required to reach a fixed capability has fallen at something like a third of an order of magnitude a year on top of the hardware gains. Compounded, the frontier moved roughly five effective orders of magnitude between GPT-3 in 2020 and the 2026 systems: about three of raw training compute, from 3×10²³ floating-point operations to the 10²⁶–10²⁷ band, and about two more of algorithmic efficiency." },

      { p: "For output, the most informative single metric is METR\u2019s task-completion time horizon: the length of task \u2014 measured by how long a human baseliner with little prior context, a new hire or a freelancer rather than an embedded expert, takes to do it \u2014 that a model completes successfully half the time. It sidesteps benchmark saturation by measuring in units of human time rather than in questions answered. Three caveats belong with it and are usually dropped: the task suite is software engineering, machine learning and cybersecurity, all self-contained and well-specified, so it is an agent benchmark and not a measure of cognitive work in general; the 50% threshold is the headline, while the 80% horizon relevant to unsupervised deployment is roughly five times shorter; and METR states that measurements above sixteen hours are unreliable on the current suite, which is about where the series now is. It has doubled roughly every seven months since 2019, and by 2024–25 the doubling time had shortened to about four months. The frontier moved from seconds to about twelve hours in six years." },

      { stats: [
        { n: "4–5×", l: "annual growth in frontier training compute, 2010–2024" },
        { n: "~7 mo", l: "doubling time of the 50% task-completion horizon since 2019" },
        { n: "$725bn", l: "projected 2026 capital expenditure, four largest hyperscalers" },
        { n: "~485 TWh", l: "global data-centre electricity, 2025 \u2014 about 1.6% of world demand" },
      ] },

      { p: "That capital expenditure figure deserves a moment. It is up from about $410 billion in 2025 — a 77% increase — and the large majority of it is AI infrastructure rather than conventional cloud. On the IEA\u2019s accounting, the capital expenditure of the largest technology firms now exceeds global investment in oil and gas production. Treat the total as a range rather than a point: credible 2026 estimates run from about $630bn to $725bn depending on which companies are counted and how leases are treated. This is not a research programme. It is one of the largest capital reallocations in industrial history, and it has been undertaken on the strength of a bet about capability that has not yet been settled." },

      { h: "Why the curve must bend, and by how much" },
      { p: "Nothing grows at four times a year for long. The binding constraint has already changed character: until recently the limit on a training run was what an organisation was willing to spend, and now it is continuous gigawatt-scale electrical power, synchronous interconnect bandwidth, and the existence of sufficient high-quality training data. Above about ten to the twenty-seventh floating-point operations, you are no longer placing an order, you are commissioning a power station." },

      { p: "The forecast that follows is not a stall but a change of slope. Compute growth decelerating from four or five times a year toward something like the growth rate of a mature capital good — call it a factor of one and a half to two annually — while algorithmic efficiency continues at whatever rate research productivity supports. That still compounds to a great deal of capability. It simply does not compound to the same place on the same date, and timelines built on a straight line through the 2020–2024 points are extrapolating a phase rather than a law." },
      { note: "**That floor is this document\u2019s judgement, not Epoch\u2019s projection**, and the difference is worth flagging because the two get conflated. Epoch\u2019s own assessment of the constraints is that power and chip supply likely *permit* frontier training compute to keep scaling near historical rates through 2030. The slower long-run floor assumed here \u2014 one and a half to two times a year \u2014 is more pessimistic than that, and it is an assumption about what a mature capital good sustains rather than a finding about what is physically possible." },

      { p: "There is also a genuine possibility, held by a serious minority, that the paradigm has an asymptote: that transformer-family systems trained on prediction objectives approach a ceiling of capability that additional scale does not raise, and that the remaining gap to general competence requires an architectural idea nobody has had. The model on this site represents this as a per-year hazard of a regime break, after which capability approaches a plateau rather than continuing more slowly. A model that cannot represent the sceptical case is not a model of the disagreement." },

      { h: "The diffusion lag: the most underrated number in the field" },
      { p: "Here is the historical record, and it is unkind to short timelines. Electric motors were commercially available in the 1880s. Factory productivity did not respond until the 1920s, because capturing the benefit required rebuilding the factory around distributed power rather than dropping a motor where the steam engine's driveshaft had been — a generation of capital stock, management practice and tacit skill. Computers were visible in the productivity statistics only in the late 1990s, thirty years after they were visible in the offices, which is Robert Solow's famous observation and Erik Brynjolfsson's resolution of it." },

      { p: "The mechanism is always the same, and it is not stupidity. Realising the benefit of a general-purpose technology requires complementary investment — reorganised processes, retrained people, rewritten regulation, new liability arrangements, new tacit knowledge about what the thing is bad at. That investment happens on the timescale of capital cycles and career lengths, not release schedules. It is why the productivity effect of a general-purpose technology characteristically shows a J-curve: measured productivity *falls* first, as resources go into intangible investment that the national accounts do not capitalise, and rises later." },

      { pull: "The bottleneck on AI's effect is not going to be what the models can do. It is going to be how fast an insurance company can change its underwriting process, and how long it takes to work out who is liable when the model is wrong." },

      { p: "The current evidence is more equivocal than either camp admits. Adoption has been genuinely fast: **41% of the American workforce** were using generative AI for work by late 2025, and the survey work behind that figure is published under the title *The Rapid Adoption of Generative AI* \u2014 its headline comparison is 39.5% at two years against 20% for the internet at two years and 20% for the PC at three. Controlled trials show large productivity gains in writing, customer support, translation and software development, concentrated among initially weaker performers, compressing rather than widening skill differentials. And yet there is still no statistically detectable economy-wide displacement: aggregate employment and job openings in exposed occupations look ordinary." },
      { p: "The trial literature is not unanimous either, and the dissent comes from an awkward direction. METR \u2014 the same group whose capability metric this section leans on \u2014 ran a randomised trial in 2025 on experienced developers working in their own large open-source repositories, and found them **19% slower** with AI assistance while believing themselves about 20% faster. One study on one population does not overturn the others; the interesting part is the gap between the measured effect and the perceived one, which is precisely the mechanism by which a technology gets adopted quickly and reorganised around slowly. It is the best single piece of evidence for the argument this section is making, and it cuts against the productivity claim in the paragraph above it." },
      { p: "A page arguing that diffusion takes decades has to confront that it is citing a paper called *The Rapid Adoption of Generative AI* for its adoption figure. So: the paper is right, and it does not refute the thesis, because **access and reorganisation are different clocks and only the second one matters for output.**" },

      { p: "The electrification record is the clearest illustration. Factories did not take forty years to buy electric motors \u2014 they bought them quickly, and bolted them where the steam engine\u2019s driveshaft had been: one big motor turning the same overhead line-shaft, capturing almost none of the benefit. The forty years went on discovering that the point of electricity was a small motor in every machine and a floor laid out by workflow rather than by proximity to the shaft, and then on rebuilding the floors. **Adoption of the tool is fast; reorganisation around the tool is slow.** Forty-one per cent of workers using a chat window to do their existing job faster is the drop-in motor. The reorganisation has barely started." },
      { p: "That said, the analogy has a load-bearing weakness and it should be named. Electrification\u2019s lag was substantially about *physical capital replacement* \u2014 you had to rebuild the factory \u2014 and software delivered over already-installed general-purpose hardware has no equivalent constraint. Electricity and computing are also the two slowest general-purpose technologies on record; containerisation, the smartphone and the internet went faster. Choosing the slow pair is a reference-class choice, and the method section of this site says that choosing your reference class is where the argument usually gets decided." },
      { note: "**What the model actually assumes**, since the rhetoric and the code should not diverge: a median deployment lag of **nine years**, not forty, with a range running from about three and a half to thirty. That is a claim that the *organisational* lag is a decade even though the *access* lag is near zero \u2014 which is both more defensible than the forty-year framing and, as it happens, what the electrification evidence supports once you separate buying the motor from rebuilding the floor." },
      { p: "The thing that is not ordinary is narrower and sharper. Brynjolfsson and colleagues, tracking high-frequency payroll data, find employment for 22-to-25-year-olds in software development down about 20% from its late-2022 peak, and about 19% relative to less-exposed peers \u2014 a difference-in-differences quantity, not a fall in the level. The effect has not mean-reverted." },
      { p: "It would be a double standard to accept that uncritically. This page discounts the climate-and-conflict literature for exactly this kind of identification problem, so the same scepticism is owed here, and the authors themselves have supplied it: the Federal Reserve began raising rates in March 2022, months before ChatGPT, and the post-pandemic technology correction runs through the same window. Under the authors\u2019 own added controls, **the entry-level declines are not notable until 2024** \u2014 which means a good part of the headline decline dated from late 2022 is plausibly not AI at all. What survives is a real, concentrated, post-2024 effect at the entry level of the most exposed occupations, invisible in the aggregate. That is still the right mental picture of the next decade: severe local effects, contested aggregates, and a public argument in which both sides cite true statistics." },

      { h: "The risk taxonomy, in order of how much attention it gets relative to its expected harm" },
      { defs: [
        { t: "Displacement and distribution — under-attended", d: "Not mass unemployment; the historical record on that is clear and comforting. The problem is the transition's distribution: which cohort, which region, which rung of which ladder. An economy that eliminates the entry level of the professions while leaving the senior level intact has broken the mechanism by which people become senior, and that failure compounds over a career rather than clearing in a business cycle." },
        { t: "Epistemic and political — under-attended", d: "Cheap, targeted, individually persuasive content at unlimited volume, in an information ecology already selecting for engagement over accuracy. The 2025–26 finding that a frontier model could be moved by the classical persuasion levers — tested on a single model, with effects varying enormously by principle, commitment driving compliance to near-total while liking did nothing — cuts in an uncomfortable direction: the systems being deployed to filter manipulation are susceptible to it." },
        { t: "Misuse — appropriately attended, poorly measured", d: "Biological and cyber capability uplift for actors who previously lacked it. The honest position is that the uplift is real, hard to quantify, and that the published evaluations measure something narrower than the thing we care about. This is the category where a single event could dominate the century's AI-attributable harm." },
        { t: "Concentration — under-attended", d: "The capital requirements described above are a structural argument that frontier capability will sit with a handful of organisations, and that the states hosting them acquire leverage of a kind that has no modern precedent. This is a governance problem dressed as a technical one." },
        { t: "Misalignment and loss of control — over-attended relative to evidence, correctly attended relative to stakes", d: "The argument is not silly and the dismissals of it are usually worse than the argument. But it rests on a chain of premises — that capability generalises this way, that goals are stable under self-modification, that a decisive advantage is achievable — each of which is contested and none of which is measured. Assigning it a small probability and a very large consequence is the defensible position; assigning it either certainty or zero is not." },
      ] },

      { note: "**The category that has no name.** The most likely bad AI outcome is not a rogue system or a mass layoff. It is a slow, unglamorous accumulation of dependence on systems nobody fully understands, in institutions that have quietly lost the ability to operate without them, discovered only when one fails. There is no constituency for worrying about this and no dramatic scenario to attach to it, which is roughly why it will happen." },
    ],
  };

  // ============================================================
  // The climate clock
  // ============================================================

  TC.climate = {
    title: "The climate clock",
    sub: "The physics stopped being the uncertain part some time ago. Almost everything now turns on two numbers, and one of them is falling fast.",
    blocks: [
      { lede: "Climate is the most forecastable of the three, and it is forecastable for an unhappy reason: most of the relevant decisions have already been taken, and the consequences of decisions not yet taken are constrained by an unusually simple physical relationship." },

      { h: "The relationship that makes this tractable" },
      { p: "Peak warming is very nearly a linear function of *cumulative* carbon dioxide emissions. Not the rate, not the concentration, not the year: the running total since 1850. The proportionality constant is called the Transient Climate Response to cumulative Emissions, and the IPCC's assessment puts it at about 0.45 degrees per trillion tonnes of CO2, with a likely range of 0.27 to 0.63." },

      { p: "This is a remarkable simplification, and it is worth being precise about why it holds, because two different near-cancellations are involved and they are routinely conflated. The **linearity** of the relationship comes from the logarithmic decline in radiative forcing per additional tonne of CO2 being offset by a rising airborne fraction as the sinks saturate. The separate result that temperature stays roughly *flat* once emissions stop \u2014 the near-zero Zero Emissions Commitment \u2014 comes from continued ocean and land **carbon** uptake drawing CO2 down, which cools, being offset by declining ocean **heat** uptake, which warms. Both are coincidences of magnitude rather than deep principles, and neither is guaranteed to hold outside the range where it has been assessed." },
      { p: "The practical consequence is that the entire coupled system \u2014 ocean heat, carbon-cycle feedbacks, the lot \u2014 collapses for policy purposes into one multiplication. It also means the framing of climate as a *budget* is physically correct rather than a rhetorical device. There is a finite quantity of carbon compatible with any temperature, and it is spent once." },

      { stats: [
        { n: "1.44°C", l: "global mean anomaly in 2025, above 1850–1900 (WMO, eight datasets)" },
        { n: "38.1 Gt", l: "fossil CO2 emitted in 2025 — a record, up 1.1%" },
        { n: "170 Gt", l: "carbon budget remaining for 1.5°C — about four years at ~42 Gt total CO2, fossil plus land use" },
        { n: "~2,650 Gt", l: "cumulative anthropogenic CO2 since 1850" },
      ] },

      { p: "2024 was the first calendar year above 1.5 degrees, at 1.55. 2025 came in at 1.44, which is not a reprieve — it is the difference between an El Niño year and the year after one. The underlying trend is a little over 0.2 degrees a decade on a multi-decadal average, and the assessed *current* rate of human-induced warming is nearer 0.27 \u2014 the higher figure being the one that matters for how soon the next threshold arrives. Neither shows any sign of bending. The remaining budget for a 1.5-degree stabilisation is about four years of present emissions, and present emissions set a record last year." },

      { pull: "1.5 degrees is not a target that is slipping away. It is a target that has gone, and continuing to organise policy around it costs credibility that the next threshold will need." },

      { h: "The two numbers that decide the rest of the century" },
      { p: "Given the budget relationship, the entire remaining question reduces to: when do emissions peak, and how fast do they fall afterwards. Everything else — every conference, every pledge, every technology — matters only through its effect on those two numbers." },

      { p: "On the first, there is genuine good news that gets undersold. Global emissions are close to a plateau, and the reason is not policy but price. The global weighted-average installed cost of utility-scale solar has fallen 88% since 2010, to about $667 per kilowatt. Four-hour battery storage fell 27% in a single year to $78 per megawatt-hour, and 84% since 2016. In 2025 the world added 510 gigawatts of solar and 307 gigawatt-hours of batteries, both records. These are learning-curve dynamics \u2014 cost falls a fixed percentage per doubling of cumulative production \u2014 and learning curves, once established across a competitive manufacturing base, are among the more reliable things to extrapolate in technology forecasting." },
      { p: "Except that in 2025 they diverged, and a page that stakes an argument on learning curves has to say so. Batteries did what the curve predicts. Generation did not: BloombergNEF\u2019s benchmark levelised cost for fixed-axis solar **rose 6% to $39 per megawatt-hour**, onshore wind rose to $40, offshore wind rose 12% to $100. The stated causes are supply-chain constraints, poorer resource availability at the margin as the best sites fill up, and market reform in China. This is precisely the trigger listed on the watchlist for reopening the pessimistic branch." },
      { p: "One year is not a curve break, and there are good reasons to read this as a trade-and-supply shock rather than a change of slope: input costs are cyclical, the best-sites effect is a known and gradual drag, and the underlying module price did not reverse. But the honest position is that the two readings are not yet distinguishable, and the thing that would distinguish them is a second and third year of data. Anyone who told you in early 2026 which of the two it was, was guessing." },

      { p: "The consequence is important and widely missed, and it needs stating narrowly, because the wide version is wrong. **The coal-intensive emissions pathways that generated the four-and-five-degree headline scenarios have become much less likely, for reasons that have nothing to do with anyone\u2019s climate policy.** Those scenarios required coal to remain the cheap option into the twenty-second century. It is not the cheap option. RCP8.5 was always a poor no-policy baseline and is now an implausible one." },
      { p: "What does *not* follow is that high warming is off the table, and the slide from the first claim to the second is the commonest error in the optimistic literature \u2014 this page included, in an earlier draft. The high-warming tail no longer runs mainly through coal. It runs through three other routes, none of which cheap solar touches: the upper tail of climate sensitivity, which by the IPCC\u2019s own framing has roughly a one-in-six chance of exceeding the top of the likely range; carbon-cycle feedbacks not contained in that relationship, permafrost above all; and the weakening of the land and ocean sinks, which raises warming *at unchanged emissions* and which the 2023 land-sink anomaly showed to be volatile year to year." },
      { note: "**What the model on this site does not represent.** It has no sink-degradation term, no airborne-fraction term and no permafrost carbon module. Its only non-linearity is a single, one-shot tipping event capped at 0.8\u00b0C. So its upper percentile is a **floor** on high-warming risk rather than an estimate of it \u2014 the cone\u2019s top edge is where the risk starts, not where it stops. This is the most important limitation on the site and it belongs here rather than buried in a footnote: a reader comparing this cone with an IPCC assessment should know that the difference at the top end is a modelling choice, not a finding." },

      { p: "On the second number, the news is bad and structural. Peaking is comparatively easy: it requires only that new capacity be clean. Declining fast requires retiring capital that still works, and decarbonising the sectors where no cheap substitute exists — cement chemistry, which emits CO2 from the limestone itself regardless of the fuel; primary steel; aviation; shipping; and agriculture, which is a diffuse biological process across hundreds of millions of holdings. These are perhaps a quarter of emissions and they have no learning curve behind them. This is why every credible pathway has a residual floor, and why removal — engineered or enhanced-natural — is not optional in the arithmetic even though it is nowhere near the required scale." },
      { note: "**A place where the model flatters removal.** It subtracts a tonne removed from a tonne emitted and applies the same coefficient to the net. AR6 assesses the carbon-cycle response as asymmetric: a tonne removed buys back somewhat less than a tonne emitted cost, because the sinks respond to the change in direction. So the removal driver on the cone page is optimistic by construction, on top of removal arriving too late to affect the peak at all." },

      { h: "Where the projections actually sit" },
      { p: "The Climate Action Tracker's assessment of implemented policy — not pledges, not net-zero targets, but what governments are actually doing — has shown no measurable progress for four consecutive years, and currently sits at about 2.6 degrees by 2100 (it read 2.7 in each of the three prior updates, and the change is a rounding step, not movement). Including binding long-term targets gives about 2.2; assuming every net-zero pledge is met in full gives about 1.9. The four-year flatness is the finding. Progress in the five years after Paris was real; since then, the projection has not moved." },

      { fig: "climate-policy-ladder" },

      { h: "The part that is genuinely uncertain" },
      { p: "Three things, in descending order of how much they should worry you." },

      { list: [
        "**Damages, not temperature.** The mapping from degrees to human consequence is far less constrained than the mapping from carbon to degrees. Estimates of the economic cost of two degrees differ by a factor of ten between competing damage functions — the difference between Nordhaus's aggregate approach and the empirical growth-rate approach of Burke, Hsiang and Miguel is not a detail, it is the difference between a manageable expense and a permanent reduction in the growth rate. Anyone quoting a cost of climate change to two significant figures is quoting a modelling choice.",
        "**Tipping elements.** A set of subsystems with the potential for self-sustaining change: the Atlantic overturning circulation, the West Antarctic and Greenland ice sheets, permafrost carbon, Amazon dieback, warm-water coral. Assessed central thresholds for several of them fall between 1.5 and 3 degrees, which is to say inside the range we are heading for. The honest statement is that the thresholds are uncertain by a degree or more in either direction, that crossing one is mostly not reversible on any timescale that matters, and that warm-water coral is the element closest to the line, with roughly 84% of reef area bleached in the 2023\u201325 event.",
        "**Aerosols.** Coal burning and dirty shipping fuel put sulphate particles in the atmosphere that reflect sunlight and are cooling the planet by an amount that is large, poorly constrained, and disappearing as air quality improves. Cleaning up the air is unambiguously right and it warms the world faster. The 2020 marine fuel regulations may already be visible in the record; this is contested, and it is the kind of thing that makes a single warm year hard to interpret."
      ] },

      { note: "**The asymmetry worth internalising.** Warming is essentially irreversible on human timescales without removal at a scale that does not exist. Emissions are reversible tomorrow at a cost. That asymmetry — cheap to stop, impossible to undo — is the entire argument for acting earlier than a discounted cost-benefit calculation recommends, and it is an argument about the shape of the problem rather than about how bad the damages are." },
    ],
  };

  // ============================================================
  // The peace clock
  // ============================================================

  TC.peace = {
    title: "The peace clock",
    sub: "The least predictable of the three, the one with the fattest tail, and the only one where the instruments that were holding the risk down have recently been removed.",
    blocks: [
      { lede: "This is the section where the forecasting is hardest and the stakes in the tail are highest. It is also the section where the trend most people believe in turns out to be, at best, statistically unproven." },

      { h: "The long peace, and the argument about whether it exists" },
      { p: "The optimistic account, associated most prominently with Steven Pinker, is that violence has declined over centuries and that the decline is structural — commerce, the state's monopoly on force, democratic institutions, expanding circles of moral concern. Battle deaths per capita since 1945 are indeed far below the first half of the twentieth century, and interstate war between major powers has been absent for eight decades." },

      { p: "The statistical objection is more serious than it is usually given credit for, and it comes from Pasquale Cirillo and Nassim Taleb. Their argument is not that violence has increased. It is that **the data cannot support the claim that it has decreased**, because the distribution of war severity is so heavy-tailed that eighty years without a large war is entirely consistent with no change in the underlying process. Fitting the record of armed conflict over roughly two thousand years, they estimate a raw tail index near 0.5 \u2014 which taken at face value implies a distribution with no finite mean at all." },
      { p: "That last point is routinely misreported, including in an earlier draft of this page, and the correction runs *against* comfort rather than towards it. An infinite mean is an artefact of fitting an unbounded distribution to a quantity that is obviously bounded: no war can kill more people than exist. The dual-distribution method is the paper\u2019s actual contribution \u2014 it maps the unbounded fit onto a bounded support and thereby recovers a mean that is finite and computable. And that recovered mean is roughly **three times the observed sample average**. The finding is not \u2018the average is undefined\u2019. It is worse: the average is perfectly well defined, and the historical record you would naturally reason from understates it threefold." },

      { p: "If that is right, then the post-1945 period is not evidence of a new regime. It is a draw from the same lottery, of a length that the lottery produces regularly. The decline in the *average* that everyone is pointing at is an artefact of not having had the large event yet." },

      { note: "**This model uses a deliberately thinner tail than Cirillo and Taleb estimate** — an index near 0.82 rather than 0.5. The two are not the same parameter and should not be read as directly comparable: theirs describes only the extreme tail above a much higher threshold, while this one is fitted across the whole range above a thousand deaths, and running a single power law all the way down with their index would put far too much mass in the middle. The conservative choice matters: the fat-tail conclusion below survives it. In the default run, the mean annual death toll is several times the median. That gap *is* the finding, and it is what a mental model based on recent averages cannot represent." },

      { h: "What the present record actually says" },
      { p: "The data do not support complacency in any case. The Uppsala Conflict Data Programme recorded 65 state-involved conflicts in 2025 — the highest number since the series began in 1946. Thirteen passed the thousand-deaths threshold that defines a war, the most since 1992. Around 244,600 people died in organised violence, the highest figure since 1994 and up from about 187,000 the year before. Of that total, 153,600 were battle-related deaths in state-based conflict — the narrower category the model on this site tracks, and the one the 62% figure below is a share of, since the wider total also counts one-sided and non-state violence. Russia's war in Ukraine accounted for about 94,700 of those battle deaths, some 62% of the world's total in a single war. Deaths from one-sided violence against civilians rose roughly fivefold to 76,500 — driven above all by Sudan — the highest since 1994." },

      { stats: [
        { n: "65", l: "state-involved conflicts active in 2025 — a post-1946 record" },
        { n: "12,187", l: "nuclear warheads worldwide, January 2026 (SIPRI)" },
        { n: "~2,100", l: "warheads on high operational alert, ready within minutes" },
        { n: "0", l: "treaties now capping US and Russian strategic forces" },
      ] },

      { h: "The thing that changed on 5 February 2026" },
      { p: "New START expired with no successor and no negotiation under way. For the first time in more than fifty years of the arms-control process, there is no legally binding limit on the strategic nuclear forces of the United States and Russia (the formulation usually heard is \u201csince 1972\u201d; strictly, SALT I lapsed in 1977, SALT II never entered into force, and START I did not bind until 1994, so there was a seventeen-year gap in the middle), and no inspection regime through which either can verify what the other has. The Intermediate-Range Nuclear Forces Treaty went in 2019; Open Skies followed. The architecture built across fifty years of the Cold War and its aftermath has been dismantled inside seven, and the dismantling attracted a fraction of the attention given to any given month of AI discourse." },

      { p: "Simultaneously, the structure of the problem is changing from two-body to three-body. China's stockpile reached 620 warheads in January 2026, growing faster than any other, with hundreds of missiles loaded into three new silo fields and enough construction under way that it could field as many intercontinental missiles as either of the others around the turn of the decade. Bipolar deterrence has a stability theory behind it, worked out over forty years at considerable expense. Tripolar deterrence does not: the arithmetic of what constitutes a secure second strike when there are two potential adversaries has no agreed answer, and the honest position is that nobody knows whether it is stable." },

      { pull: "Two nuclear powers with a treaty and inspectors is a solved problem. Three nuclear powers with no treaty, no inspectors and automated early warning is a problem no one has solved, and we have just chosen to find out." },

      { h: "Where the hazard rate comes from" },
      { p: "Eighty-one years have passed without a nuclear weapon being used in conflict. That is genuine evidence and it bounds the annual hazard from above: zero events in eighty-one years puts a 95% upper bound near 3.7% a year. It does not bound it from below, and the historical record contains a disquieting number of occasions on which the outcome turned on an individual's judgement — Petrov in 1983, Arkhipov in 1962, the Norwegian rocket in 1995. Published estimates cluster between 0.1% and 1% a year with long tails in both directions: Rethink Priorities\u2019 review of the historical record, expert opinion and forecaster predictions arrives at roughly 1.1% a year for a nuclear war of any kind, and about 0.38% for a US\u2013Russia exchange specifically. It is worth noticing which way that cuts. This model\u2019s peacetime hazard is below both, and the century figure it produces is lower than what you get by compounding the published annual estimate naively across seventy-five years. The number on this site is not the alarming end of the literature. It is the cautious end." },

      { p: "The model treats this not as a constant of nature but as a function of conditions: how many states hold weapons, whether anyone is counting the other side's, whether a direct great-power war is being fought, and how much of the warning and decision chain has been handed to machines. Those multipliers, not the base rate, are where policy acts, and they are the reason the same model produces very different centuries depending on where the arms-control slider sits." },

      { h: "The great-power war base rate, which is the uncomfortable part" },
      { p: "Direct war between great powers since 1815, on a strict reading \u2014 both sides recognised great powers, regular forces in sustained combat: the Crimean War, the Austro-Prussian War, the Franco-Prussian War, the Russo-Japanese War, and the two world wars. Six in 210 years is about 2.9% a year. The count is contestable and the contest matters: Jack Levy\u2019s canonical coding finds rather more, depending on how the wars of Italian and German unification are treated, which pushes the rate up rather than down. Since 1945, with nuclear weapons in the picture, the count is one \u2014 American and Chinese forces fighting each other in Korea \u2014 or zero on a stricter reading, giving somewhere between 0% and 1.2% a year." },
      { p: "Here is what those rates do when compounded across the seventy-five years to 2100. The arithmetic is worth setting out in full rather than summarising, because the summary is where this argument usually goes wrong \u2014 including in an earlier draft of this page, which asserted that a great-power war was more likely than not *at anything like the historical base rate*, and was simply mistaken. It is not true across the range; it is true across part of it." },
      { table: {
        cols: ["Annual rate", "Where it comes from", "P(war by 2100)"],
        rows: [
          ["0.0%", "The strictest nuclear-era reading: it has not happened since 1945", "0%"],
          ["0.5%", "A cautious nuclear-era estimate", "31%"],
          ["0.7%", "This model\u2019s base rate, before any driver is applied", "41%"],
          ["**0.92%**", "**The crossover: the rate at which it becomes more likely than not**", "**50%**"],
          ["1.13%", "This model at its default drivers, after rivalry and arms control", "57%"],
          ["1.2%", "The top of the nuclear-era range", "60%"],
          ["2.9%", "The 1815\u20132025 rate, which the nuclear era is supposed to have superseded", "89%"],
        ],
      } },
      { p: "So the honest statement is narrower and more interesting than the one it replaces. **A direct great-power war before 2100 becomes more likely than not above roughly 0.92% a year** \u2014 which is inside the range the historical record supports, but only its upper half. This model crosses that line not because of its base rate, which does not, but because its default assumes a hardened rivalry, and that assumption is a slider you can move. Set rivalry to its floor and the century looks quite different." },
      { pull: "The claim is not that history guarantees a great-power war. It is that the range of defensible base rates straddles the point where one becomes more likely than not, and almost nobody arguing about this has done the multiplication." },

      { p: "The counter-argument is that nuclear weapons changed the process and the base rate no longer applies. That may be true. It is also exactly what a heavy-tailed process looks like from inside a quiet period, which is why the argument cannot be settled by pointing at the last eighty years." },
    ],
  };

  // ============================================================
  // Coupling
  // ============================================================

  TC.coupling = {
    title: "How the three clocks couple",
    sub: "The interactions are where most public argument goes wrong, in both directions.",
    blocks: [
      { lede: "It is tempting to treat these as three separate problems, and almost as tempting to treat them as one. Both are wrong. They couple, but weakly and asymmetrically, and being specific about the couplings kills a number of popular claims in each direction." },

      { h: "The matrix" },
      { p: "Each cell is the effect of the row on the column: the sign, the rough magnitude, and — the part usually omitted — how confident anyone should be about it." },

      { table: {
        cols: ["", "→ AI", "→ Climate", "→ Peace"],
        rows: [
          ["**AI**", "—",
           "**Ambiguous, small.** Data centres reached ~485 TWh in 2025, heading for ~950 by 2030: real, but about 3% of a ~32,000 TWh system. Materials discovery, grid optimisation and demand forecasting push the other way by an amount nobody can yet measure. *Confidence: low. Sign genuinely uncertain.*",
           "**Negative, moderate, rising.** Decision compression, automated early warning, cyber effects on nuclear command and control. Against that: better verification and remote sensing, which are the technical basis of any future treaty. *Confidence: low. Magnitude could be large.*"],
          ["**Climate**", "**Negligible.** A constraint on data-centre siting and power cost; not a driver of capability.", "—",
           "**Positive but small and heavily contested.** The Hsiang–Burke–Miguel meta-analysis found more intergroup conflict per unit of climate anomaly; Buhaug and others dispute the aggregation and the causal identification. *Confidence: low, and the prior here keeps real mass at zero.*"],
          ["**Peace**", "**Potentially decisive.** A great-power war reorganises frontier AI around state programmes and ends whatever international coordination exists.", "**Potentially decisive, in both directions.** War is carbon-intensive; economic collapse is not. The Soviet collapse remains the largest emissions reduction ever achieved, by methods nobody would recommend.", "—"],
        ],
      } },

      { h: "Four claims the matrix disposes of" },
      { tiles: [
        { h: "\"AI's energy use will wreck the climate\"", p: "It will not, on any current projection. Data centres reaching 3% of global electricity by 2030 is a real grid-planning problem, a real local water and land-use problem, and a genuine argument about who gets connection capacity first. It is not a first-order climate variable. The argument's force is political — it is about who gets to use scarce clean power — and it is weakened, not strengthened, by being overstated as a physical one." },
        { h: "\"AI will solve climate change\"", p: "It will not do that either. The bottleneck on decarbonisation is not knowledge. It is capital stock turnover, planning permission, grid interconnection queues, and the political economy of asking people to retire assets that still work. Better catalysts and better forecasting help at the margin and would be worth having. Neither of them pours concrete or wins a planning inquiry." },
        { h: "\"Climate change causes wars\"", p: "The literature says: sometimes, at the margin, through mechanisms that run via agricultural price shocks and displacement, with an effect size that is contested and an identification strategy that critics find unconvincing. It is not nothing. It is also nowhere near large enough to make climate the primary driver of this century's conflict, and treating it as such misallocates attention away from the things that actually start wars." },
        { h: "\"They're all facets of one crisis\"", p: "This is the most comfortable position and the least useful. The three have different lags, different actor counts, different tail shapes and — crucially — different remedies that do not substitute for one another. Collapsing them into a single narrative of civilisational overreach is emotionally coherent and operationally empty." },
      ] },

      { h: "The coupling that does matter" },
      { p: "One cell in that matrix deserves separating from the others: **AI's effect on nuclear stability**, which is the only coupling in the table with both a plausibly large magnitude and a mechanism that is already being built." },

      { p: "The mechanism is not an AI deciding to launch. It is compression of decision time. Deterrence stability depends on the attacked party having enough time to determine that an attack is real, and enough confidence in its second strike to wait. Every technology that shortens that interval — faster delivery, better counterforce targeting, automated detection with a high false-positive rate, cyber-attack on early warning — degrades stability, regardless of anyone's intentions. Machine learning in the sensor and fusion chain is being introduced precisely because it shortens that interval, which is the feature and the problem." },

      { p: "The countervailing case is real and gets less attention. Verification is a machine-learning problem: counting launchers in imagery, detecting tests, attributing signals, monitoring compliance. The historical obstacle to deep arms-control cuts has often been the difficulty of verifying them cheaply and intrusively enough to be trusted. If the instruments now exist to verify what could not be verified in 1991, that is an argument for a treaty rather than against one — and it is the most useful thing anyone reading this could push for." },
    ],
  };

  // ============================================================
  // Scenarios
  // ============================================================

  TC.scenarios = {
    title: "Five worlds",
    sub: "Named branches of the cone, with what each requires to be true and roughly how much of the distribution it occupies.",
    intro: "Scenarios are not forecasts. They are handles for regions of a distribution, and their value is that they make the *conditions* legible — what would have to be the case, and what you would see first. The percentages are the author's allocation across the branches, not model output; they are stated because a scenario set without weights lets the reader assume they are equal, and they are nowhere near equal.",
    items: [
      {
        key: "grind", name: "The Long Grind", weight: 42, tone: "mid",
        tag: "The modal world",
        summary: "Nothing resolves. Everything continues.",
        body: "Capability keeps improving without a discontinuity. Diffusion runs at the historical rate for a general-purpose technology, which is to say slowly and unevenly, and the aggregate productivity statistics stay ambiguous into the 2040s while particular occupations are gutted. Emissions decline more slowly than pledged and faster than feared; warming passes 2 degrees around mid-century and the argument moves from mitigation to adaptation and blame. Conflict continues at roughly its present elevated rate without a great-power war. Nobody is vindicated. Every institution muddles through in a slightly degraded condition.",
        needs: "No architectural breakthrough and no wall. Solar and storage learning curves continue. No nuclear use. No single AI incident large enough to force a regulatory step change.",
        tell: "The strongest evidence for this branch is that it is what almost always happens. The strongest evidence against it is that it requires three independent processes to all avoid their tails for seventy-five years.",
      },
      {
        key: "wall", name: "The Wall", weight: 17, tone: "cool",
        tag: "The sceptics were right",
        summary: "Scaling stops paying, and the 2020s look like a bubble.",
        body: "Returns to scale break in the late 2020s. The capability curve flattens well short of general competence; the enormous capital stock is repriced; a real recession follows the write-down. AI settles into the role of a useful, unglamorous productivity tool — the fate of most technologies that were going to change everything. Attention returns to climate and geopolitics, arguably too late for the first and about on time for the second. The interesting question in this world is not what happened to AI but what the misallocated capital was not spent on.",
        needs: "Transformer-family systems have a genuine asymptote. No successor paradigm within a decade or two. The gap between benchmark performance and economic value proves to be structural rather than a matter of scaffolding.",
        tell: "Watch for capability improvements that do not convert into deployment; a plateau in the METR time-horizon series sustained beyond two years; and hyperscaler capital expenditure guidance falling rather than merely growing more slowly.",
      },
      {
        key: "fast", name: "Fast Takeoff, Slow Institutions", weight: 14, tone: "warm",
        tag: "The uncomfortable middle",
        summary: "Capability arrives on the aggressive timeline. Nothing else does.",
        body: "The compute-centric forecasts are approximately right and broadly capable systems arrive in the 2030s. What follows is not the singularity and not utopia: it is a decade of institutions that cannot metabolise what they have been handed. Liability law, professional licensing, procurement, insurance, education and the electoral cycle all operate on timescales an order of magnitude slower than the deployment. The result is severe distributional damage, a legitimacy crisis in the professions, and policy made in a hurry after each incident. The technology is not the disaster; the mismatch in rates is.",
        needs: "No wall. Diffusion friction at the low end of the historical range, which requires either unusual regulatory permissiveness or unusual competitive pressure.",
        tell: "This is the branch most people mean by 'AI goes fast', and it is worth noticing that it contains no rogue system at all. The damage is entirely a rate mismatch.",
      },
      {
        key: "fracture", name: "The Fracture", weight: 19, tone: "hot",
        tag: "The tail that history keeps drawing",
        summary: "A great-power war, and everything else becomes downstream of it.",
        body: "The base rate asserts itself. A crisis over Taiwan, the Baltic, or something nobody has written a paper about escalates beyond the point where either side can stop cheaply. Whether it goes nuclear is the question the model spends most of its effort on and cannot answer. What is not in doubt is that every other trajectory on this site becomes a footnote to it: climate cooperation ends, frontier AI is nationalised into weapons programmes, and the world's forecasting attention turns out to have been pointed at the wrong clock for two decades.",
        needs: "Nothing unusual. This is the branch that requires the fewest assumptions — merely that the last eighty years were a quiet period in a heavy-tailed process rather than a permanent change of regime.",
        tell: "There is an apparent contradiction here worth confronting, because a careful reader will find it. The model puts a direct great-power war before 2100 at around 59%, and this branch is weighted at 19%. Both can be true: most great-power wars do not become the century's defining event. Korea was a direct war between American and Chinese forces and the world's other trajectories continued around it. This branch is the subset in which the war is large enough to reorganise everything else — which is roughly a third of the cases where one happens at all. Beyond that: it is the highest-weighted bad branch on this page, it rests on the strongest historical base rate of anything here, and it gets a fraction of the attention given to the others.",
      },
      {
        key: "turn", name: "The Turn", weight: 8, tone: "good",
        tag: "The good branch, and it is not fanciful",
        summary: "The learning curves win, and somebody rebuilds the treaties.",
        body: "Solar, storage and electrification compound faster than the central projections; emissions fall steeply through the 2030s and warming stabilises near 2 degrees. AI's diffusion is fast enough to raise productivity growth measurably and slow enough for policy to keep up, and the surplus is distributed well enough to hold political consent. A verification regime built on the sensing and analysis capabilities that did not exist in 1991 makes deep arms-control cuts credible, and a tripolar framework replaces the bilateral one. This requires no miracles and no new physics. It requires competence, sustained across several decades and several administrations, which is why it is the smallest slice here.",
        needs: "Learning curves at the optimistic end. Distributional policy that works. A nuclear-armed world that decides, without being forced by a catastrophe, to rebuild what it dismantled.",
        tell: "Note what this branch does not require: no breakthrough, no benevolent superintelligence, no global government. Everything in it is already technically available. That is either encouraging or damning, depending on your view of institutions.",
      },
    ],
  };

  // ============================================================
  // The estimate
  // ============================================================

  TC.estimate = {
    title: "The estimate",
    sub: "Dated, numbered, and resolvable. This is the part that can be scored.",
    blocks: [
      { lede: "Everything above is analysis. This is the forecast: what the author actually expects, at stated probabilities, with the criterion that would settle each one. Probabilities are subjective and reflect the model, the literature, and judgement about which of them to trust where they disagree." },
      { note: "**How to read these.** A claim at 85% should be wrong about one time in seven; if every 85% claim here came true, the set would be badly calibrated rather than impressive. The resolution criteria name a public data source in each case, so that the scoring does not depend on the author's later interpretation of what was meant." },
      { forecasts: true },
      { h: "The three calls this document would most like to be judged on" },
      { p: "**One: the aggregate AI effect stays contested for longer than either camp expects.** Through the 2030s, the debate about whether AI has transformed the economy will be conducted between people citing accurate but different statistics, exactly as the debate about computers was between 1975 and 1995. Concentrated, severe, occupation-specific damage will coexist with unremarkable aggregate employment. The people who predicted mass unemployment and the people who predicted nothing will both claim vindication, and both will be describing a real part of the same picture." },
      { p: "**Two: warming stabilises rather than runs away, and this will not feel like a victory.** The central expectation is roughly two and a half degrees — an outcome that is very bad, that involves losses which are permanent and unevenly distributed, and that is nonetheless a long way from the collapse scenarios of the 2010s and a long way from safety. There is no rhetorical register for this outcome, which is part of why it is hard to plan for. Being right about it will please nobody." },
      { p: "**Three: the largest single loss event of the century is more likely to be a war than anything else discussed here.** This follows from tail arithmetic rather than pessimism. Climate damages are large, certain and gradual; AI's catastrophic tail is real but unquantified and probably smaller than its advocates argue; conflict has a demonstrated capacity for tens of millions of deaths in a few years, a base rate that has not been shown to have changed, and — as of February 2026 — no treaty restraining its worst instrument. If one thing on this site turns out to matter, it is most likely to be that." },
      { h: "What would change these" },
      { list: [
        "**Two years of flat METR time horizons** would move substantial weight from the modal world to The Wall and push automation forecasts back by a decade.",
        "**A measured, replicated AI contribution to total factor productivity growth above half a point a year** would do the reverse, and would be the first hard evidence that the diffusion lag is shorter this time.",
        "**A verified US–Russia–China framework with inspections** would cut the nuclear hazard rate by more than any other single event, and would be the strongest possible evidence against the pessimistic reading of the peace section.",
        "**A single AI-enabled mass-casualty event** would restructure the entire regulatory landscape within a year, and would move probability mass in every direction at once — reducing diffusion, reducing capability investment, and raising the salience of exactly the risks that are currently under-attended.",
        "**Sustained emissions decline above 3% a year** for five consecutive years would bring the 2-degree outcome back into the central range and would be the first time the policy variable had moved as fast as the technology variable.",
      ] },
    ],
  };

  // ============================================================
  // The numbered forecasts
  // ------------------------------------------------------------
  // Each carries the probability, the year it resolves, and the public
  // series that settles it. `p` is the author's stated credence; where
  // the model disagrees materially with it, the divergence is noted in
  // `why`, because a forecaster who silently overrides their own model
  // should say so.
  // ============================================================

  TC.forecasts = [
    { domain: "climate", by: 2030, p: 92,
      claim: "The decadal-mean global temperature anomaly exceeds 1.5°C above 1850–1900.",
      res: "WMO consolidated assessment of the 2021–2030 decade.",
      why: "Already at 1.44°C in a non-El-Niño year with a trend above 0.2°C/decade. The residual 8% is definitional risk — a change of baseline or dataset — rather than physical." },
    { domain: "climate", by: 2030, p: 70,
      claim: "Global CO2 emissions have peaked: no year after 2030 exceeds the highest year to date.",
      res: "Global Carbon Budget annual release, judged in 2035 with five years of hindsight.",
      why: "Emissions are within a percent or two of a plateau and clean generation is now the cheapest new capacity almost everywhere. The risk is not policy reversal but demand growth in industrialising economies outrunning deployment." },
    { domain: "ai", by: 2030, p: 80,
      claim: "No AI system is generally agreed to match a competent professional adult across essentially all economically valuable cognitive work.",
      res: "Absence of consensus among three of: a major expert survey, the Metaculus AGI question resolving, and formal declarations by two or more frontier laboratories.",
      why: "Deliberately weak: 'generally agreed' is doing work, because the definitional argument will outlast the capability question. Set at 80% rather than higher because the compute-centric forecasts are not silly." },
    { domain: "ai", by: 2030, p: 65,
      claim: "No replicated, peer-reviewed estimate attributes more than +0.5 percentage points a year of TFP growth to AI in any G7 economy.",
      res: "Published productivity research; national statistical office growth accounting.",
      why: "The J-curve says the effect arrives late and the measurement arrives later still. This is the clearest test of the diffusion-lag thesis, and the one most likely to embarrass it." },
    { domain: "ai", by: 2030, p: 12,
      claim: "At least one AI-enabled incident causes 1,000+ deaths or $100bn+ in damage.",
      res: "Contemporaneous reporting plus an official inquiry attributing causation.",
      why: "**Stated above the model, which gives about 2%.** The model scales this hazard with a capability index calibrated to the automation transition, and that understates how reachable the *damage* limb of the threshold already is: a single large cyber incident against critical infrastructure clears $100bn without requiring any dramatic advance in capability. The deaths limb is the one the model is right about. Either way the number rises steeply afterwards, which is the point — this is a risk that is small now and will not stay small." },
    { domain: "peace", by: 2030, p: 96,
      claim: "No nuclear weapon is detonated in conflict.",
      res: "Self-resolving.",
      why: "Roughly 1% a year under present conditions, compounded over four years. The complement is not negligible and it is higher than it was in 2020." },
    { domain: "peace", by: 2030, p: 30,
      claim: "A verified strategic arms-control framework binds the United States and Russia.",
      res: "Treaty or executive agreement in force, with an inspection regime.",
      why: "Nothing is currently under negotiation. Historically these have appeared after crises rather than before them, which is an unpleasant way to be right." },
    { domain: "climate", by: 2040, p: 75,
      claim: "Decadal-mean warming is between 1.6°C and 2.0°C.",
      res: "WMO consolidated assessment of the 2031–2040 decade.",
      why: "The cumulative-emissions relationship is tight enough at this horizon that the range is dominated by TCRE uncertainty, not by policy. **Stated above the model, which gives about 66%.** The model carries the full AR6 sensitivity spread into a decade where the observational constraint is in practice tighter than that, so its tails at 2040 are wider than they deserve to be." },
    { domain: "ai", by: 2040, p: 60,
      claim: "Between 3% and 40% of employment-weighted work hours in advanced economies are performed without direct human involvement.",
      res: "A task-level accounting on the O*NET basis, of the kind now used in exposure studies.",
      why: "An almost uselessly wide band, stated that way deliberately. The model's own quartiles at 2040 are 3% and 31% around a median of 15%, and the distribution is close to bimodal: a lump of worlds near today's level, where scaling stalled or diffusion never got going, and a broad spread above. A tighter band would be a more impressive forecast and a false one. If you want the single number, it is about 15%." },
    { domain: "ai", by: 2040, p: 70,
      claim: "The aggregate unemployment rate in the G7 is within historical range, while at least three occupations have lost more than 40% of entry-level positions.",
      res: "National labour force surveys; occupational payroll series.",
      why: "The central call of this document about AI: severe concentrated damage, unremarkable aggregates, and an unresolvable public argument in which both sides cite true numbers." },
    { domain: "peace", by: 2040, p: 88,
      claim: "No nuclear weapon is detonated in conflict.",
      res: "Self-resolving.",
      why: "The model, at default drivers, is a little more pessimistic than this. The upward adjustment reflects genuine belief that deterrence carries information the base-rate calculation misses." },
    { domain: "peace", by: 2040, p: 82,
      claim: "No direct sustained combat between the regular armed forces of two great powers.",
      res: "UCDP conflict classification; contemporaneous reporting.",
      why: "About 1% a year across fourteen years. Note how much less confident this is than the equivalent nuclear claim, and that the two are not independent." },
    { domain: "climate", by: 2050, p: 70,
      claim: "Decadal-mean warming is between 1.8°C and 2.4°C, and annual emissions are below half their 2025 level.",
      res: "WMO; Global Carbon Budget.",
      why: "The conjunction is deliberate — this is the pair that determines whether the century ends near 2.5°C or near 3. **Stated a little above the model, which gives about 63%**, for the same reason as the 2040 claim." },
    { domain: "ai", by: 2050, p: 55,
      claim: "AI is generally regarded as having raised living standards substantially, and the distributional politics of that increase is a first-order political cleavage in most democracies.",
      res: "Necessarily a judgement call, resolved by a panel or by the obvious.",
      why: "The weakest-resolving claim here, included because it is the outcome that matters most and refuses to be operationalised. Stated at 55% to signal that it is close to a coin toss." },
    { domain: "peace", by: 2100, p: 62,
      claim: "No nuclear weapon is detonated in conflict this century.",
      res: "Self-resolving; unresolvable by the author.",
      why: "The complement — 38% — is the headline number of the peace section, adjusted upward from the model's default for the reason given at 2040. It is the claim on this page most sensitive to assumptions, and the cone page lets you see how much." },
    { domain: "peace", by: 2100, p: 55,
      claim: "The largest single loss-of-life event of the century is an armed conflict rather than a climate event, a pandemic, or an AI-attributed incident.",
      res: "Historical judgement in 2100. Ties to the largest event by direct plus attributable excess mortality.",
      why: "The contrarian call, and the one most worth arguing with. It follows from tail arithmetic: conflict has a demonstrated capacity for tens of millions of deaths over a few years, while climate's damage — larger in total — arrives as a diffuse increase in mortality rather than as an event. **The obvious weakness is the pandemic term.** This document examines three challenges and a pandemic is a fourth, with its own heavy tail, its own recent demonstration, and a biotechnology curve that AI is bending. It is named in the claim because leaving it out would rig the comparison, but it has not been modelled here, and a serious treatment of it could plausibly take this call below 50%." },
    { domain: "all", by: 2100, p: 97,
      claim: "Human population at the end of the century exceeds four billion.",
      res: "UN World Population Prospects.",
      why: "None of the three challenges examined here is an extinction risk on any assumption this document is willing to defend. They are threats to the current arrangement of the species, which is a sufficient thing to be worried about without inflating it." },
  ];

  // The three structural axes, for the strip on the landing page.
  TC.axes = {
    cols: ["Lag", "Actors needed", "Tail shape"],
    rows: [
      { k: "ai", name: "AI", vals: [
        { v: "Years — institutional", d: "The delay is not physics. It is liability law, procurement, retraining and capital cycles.", w: 45 },
        { v: "~12 labs, ~3 states", d: "The smallest set of decision-makers of the three, by a wide margin.", w: 20 },
        { v: "Unknown", d: "Not fat, not thin: unspecified. A worse epistemic position than either, and one our decision procedures handle badly.", w: 90 },
      ] },
      { k: "climate", name: "Climate", vals: [
        { v: "Decades to centuries", d: "Today's emissions set a floor under the temperature for centuries; today's cuts show up around mid-century.", w: 95 },
        { v: "~190 states, everyone", d: "Requires near-universal consent, which is why it is the hardest to coordinate despite being the best understood.", w: 95 },
        { v: "Near-certain, proportional", d: "The damage is happening, is roughly proportional to warming, and has a comparatively well-behaved distribution.", w: 25 },
      ] },
      { k: "peace", name: "Peace", vals: [
        { v: "Hours", d: "A decision taken in an afternoon; a treaty signed on Tuesday lowers the hazard on Wednesday.", w: 5 },
        { v: "9 states, really 2–3", d: "The fewest actors of the three. Also the fewest instruments now in force.", w: 12 },
        { v: "Extremely heavy", d: "Among the most heavy-tailed quantities ever measured on human society. The mean is dominated by events that have not happened yet.", w: 100 },
      ] },
    ],
  };

  // ============================================================
  // The cone
  // ============================================================

  TC.cone = {
    title: "The cone of possibilities",
    sub: "Several hundred futures, computed here, now, from assumptions you can move.",
    intro: "The shaded regions are the middle 50% and middle 90% of the sampled worlds; the solid line is the median. Drag a year to read the distribution at that point, and move the drivers to see which assumptions the answer is actually resting on. Some of them matter far less than they feel like they should, which is the most useful thing this page has to show you.",
    reading: [
      { h: "The band is the forecast, not the line", p: "The median line is the middle of a distribution of outcomes, not a prediction of the most likely world. No sampled world looks like the median line — real futures are lumpy, and the smooth central path is an average of paths none of which is smooth." },
      { h: "Width is information", p: "Where the cone is wide, the honest answer is that nobody knows. The AI cone is the widest here by a large margin, and that width is not a failure of the model: it is the disagreement in the field, drawn to scale." },
      { h: "Watch what the sliders do not do", p: "Move the decarbonisation driver from one end to the other and the 2100 temperature moves by about a degree and a half. Move it and watch 2035: almost nothing happens. That gap between the near-term insensitivity and the long-term sensitivity is the entire political problem of climate change, in one interaction." },
      { h: "Two things the drawing does to the data", p: "Both are cosmetic, and both are the kind of thing a chart should own up to. The percentile bands are smoothed along the time axis with a five-point mean, because each year's percentile is estimated from a few hundred samples and carries sampling error of its own — the raggedness that removes is noise in the estimator, not structure in the forecast. And the floor of the AI cone sits flat at today's deployment level rather than falling, because automation is modelled as a ratchet: the call centre replaced in 2029 is not restaffed in 2044 because scaling hit a wall. That flat fifth percentile is an assumption showing through, not a result." },
      { h: "The coupling switch", p: "Turn the cross-domain couplings off and watch what moves. End-of-century warming shifts by about three hundredths of a degree — the AI-energy argument, quantified, is a rounding error. The nuclear hazard shifts by around four points. But the median conflict death rate moves by about a fifth, which is not nothing: the warming-to-conflict channel is the one coupling here that does real work, and it is also the one whose underlying evidence is weakest. Three problems that interact, then, but not one problem — and the interaction that matters most is the one we can least defend." },
    ],
  };

  // ============================================================
  // Watchlist
  // ============================================================

  TC.watch = {
    title: "The watchlist",
    sub: "Leading indicators with today's readings and the thresholds that would force an update. Checking these beats reading the commentary.",
    intro: "A forecast that cannot be tracked between now and its resolution date is not much use. These are the series worth watching, chosen because they are published, hard to fake, and move before the thing they predict. Readings are the most recent available as of August 2026.",
    items: [
      { domain: "ai", name: "METR 50% task-completion horizon", now: "≈ 12 hours (frontier, 2026)", trend: "up", note: "Doubling every 4–7 months. The cleanest single capability series, because it measures in units of human time rather than benchmark questions.", trigger: "Flat for 24 months → the wall. Doubling under 3 months sustained → shift weight to fast branches." },
      { domain: "ai", name: "Hyperscaler capital expenditure guidance", now: "≈ $725bn planned for 2026", trend: "up", note: "The best available proxy for what people with money and private information actually believe. Guidance is more informative than the spend itself, because it is forward-looking and expensively wrong.", trigger: "A year-on-year fall → the capability bet has been abandoned by the people best placed to price it." },
      { domain: "ai", name: "Entry-level employment in exposed occupations", now: "22\u201325s in software \u221219% vs less-exposed peers", trend: "down", note: "The Brynjolfsson–Chandar canaries. Currently the only clear labour-market signal, and it is invisible in aggregate statistics.", trigger: "Spread to three more exposed occupations → displacement is general, not sectoral, and a decade early." },
      { domain: "ai", name: "Measured contribution to total factor productivity", now: "Not statistically detectable", trend: "flat", note: "The number that settles the argument. Its continued absence is currently consistent with both the J-curve and the sceptical case, which is why it settles nothing yet.", trigger: "Replicated attribution above +0.5pp/yr → the diffusion lag is shorter this time." },
      { domain: "climate", name: "Global CO2 emissions", now: "38.1 Gt fossil in 2025, a record", trend: "up", note: "The single most important climate number. Not concentration, not temperature: the annual flow, because cumulative emissions set peak warming.", trigger: "Three consecutive years of decline → the peak has happened. Decline above 3%/yr sustained → 2°C is back in range." },
      { domain: "climate", name: "Solar and storage costs", now: "Storage $78/MWh (\u221227%); solar LCOE $39/MWh (**+6%**)", trend: "flat", note: "The learning curves that closed the coal-forever pathway \u2014 not, as is often claimed, the high-warming tail. In 2025 they diverged for the first time in years: batteries kept falling, generation rose. Watch the cost per kilowatt-hour delivered, not the headline module price.", trigger: "A second and third year of rising generation cost \u2192 a curve break rather than a supply shock, and the pessimistic emissions branch reopens." },
      { domain: "climate", name: "Decadal-mean global temperature", now: "1.44°C in 2025; 1.55°C in 2024", trend: "up", note: "Single years are noise — El Niño moves the number by more than a decade of trend. The decadal mean is the signal.", trigger: "Decadal mean above 1.5°C → confirmed, and the 1.5 target is formally as well as practically gone." },
      { domain: "peace", name: "Strategic arms control", now: "No treaty in force since 5 Feb 2026", trend: "down", note: "The largest single change to the risk picture in thirty years, and the one that received the least attention.", trigger: "Any verified framework including China → the largest available reduction in century-scale nuclear hazard." },
      { domain: "peace", name: "Chinese warhead stockpile", now: "620 (SIPRI, Jan 2026), fastest-growing", trend: "up", note: "Drives the transition from a bipolar deterrence structure with a worked-out stability theory to a tripolar one without.", trigger: "Parity in deployed strategic warheads → the two-body stability results stop applying, and nobody has the three-body ones." },
      { domain: "peace", name: "State-based conflicts and battle deaths", now: "65 conflicts, ~244,600 deaths in organised violence (2025)", trend: "up", note: "UCDP's annual release. Both figures are at or near post-1946 records, which is not what a structural decline in violence looks like.", trigger: "Any direct combat between great-power forces → the branch weights on this site change materially and immediately." },
      { domain: "peace", name: "Automation in nuclear command and control", now: "No public accounting exists", trend: "flat", note: "The most consequential indicator here and the only one with no published series. Its absence is itself a finding: the coupling most likely to matter is the one nobody is measuring.", trigger: "Any state formally committing to human control of nuclear release → a cheap, verifiable, unusually high-value piece of policy." },
    ],
  };

  // ============================================================
  // Objections
  // ============================================================

  TC.objections = {
    title: "Objections",
    sub: "The strongest arguments against this document, stated as well as its author can manage, with what each would change.",
    intro: "A forecast that has not been attacked is not worth much. These are steelmanned rather than dismissed: in each case the objection has real force, and the response says what it would take to settle the question rather than claiming it is already settled.",
    items: [
      {
        h: "The AI section is anchored on the last five years of a trend that is about to break",
        arg: "Every quantitative claim about capability rests on compute scaling, algorithmic efficiency and a benchmark series, all measured over a period of unprecedented capital inflow. Extrapolating from a bubble's interior is the classic error. Worse, the entire 'diffusion lag' framing assumes AI is a general-purpose technology like electricity — an analogy that does real work in the argument and is asserted rather than defended.",
        resp: "Largely conceded. The model responds to the first half by making the deceleration structural rather than optional, and by carrying a per-year hazard of a regime break that produces a genuine plateau. It does not answer the second half. The general-purpose-technology analogy is load-bearing and it is an analogy. If AI is better modelled as a new class of agent rather than as a new class of tool, the diffusion lag is the wrong concept and the timelines here are too slow by a wide margin.",
      },
      {
        h: "Reporting a chance of nuclear use in the forties per cent is alarmism dressed as arithmetic",
        arg: "The figure comes from compounding a small annual hazard across seventy-five years, which is a mathematical operation, not a forecast. Eighty-one years of non-use is strong evidence that the process is not what the model says it is — that deterrence is a stable equilibrium rather than a lottery, and that the states holding these weapons behave far more carefully than a constant hazard rate implies.",
        resp: "The strongest objection on this page, and it may be right. Three things in reply. First, a comparison worth making before reaching for the word alarmism: this model\u2019s peacetime hazard sits below the published central estimates, and the century figure it produces is lower than what you get by compounding those estimates naively. Second, compounding a small hazard is exactly how one ought to reason about rare events over long horizons — the alternative, which is to note that it has not happened yet, is how people reason about rare events immediately before they happen. And the eighty-one-year record cannot distinguish a stable equilibrium from a quiet draw, which is the Cirillo–Taleb point applied to the nuclear case. That said, here is the assumption the figure is most sensitive to, stated plainly so it can be attacked: the model raises the hazard eightfold while a great-power war is being fought, which works out, at the default driver settings, at about a **one-in-eight chance that a sustained great-power war goes nuclear at some point**. That is at the low end of published strategic opinion — many people who have thought about this for a living would put it two or three times higher — and raising it is the fastest way to make everything on this site more alarming. The century figure should be read as *this is what these assumptions imply*, not as a claim to know.",
      },
      {
        h: "Climate is treated too optimistically",
        arg: "The document says the catastrophic branch has closed because solar is cheap. But the binding constraint was never generation cost — it is transmission, storage duration, industrial heat, land use, permitting, critical-mineral supply and the political economy of stranded assets. And the treatment of tipping elements is cursory: a model in which crossing a threshold adds a fraction of a degree fundamentally understates what an Atlantic circulation collapse or West Antarctic instability would mean.",
        resp: "The second half is conceded without reservation. The model's tipping module tracks only elements with a global-mean warming feedback, and it says so, but that is a narrow accounting of a broad danger — the consequence of an AMOC collapse is not well summarised by its effect on the global average temperature, and this document's framework handles it badly. On the first half: the claim is not that cheap solar solves decarbonisation, it is the narrower one that it removes the coal-forever pathway that generated the four-to-five-degree scenarios. Those are different claims and the narrower one is defensible.",
      },
      {
        h: "The scenario weights are numbers pulled from the air",
        arg: "Five percentages that sum to 100 across branches whose boundaries are defined by the author, with no method connecting them to anything. This is the part of the document that most resembles the forecasting it criticises.",
        resp: "Correct, and labelled as such: the weights are stated to be the author's allocation rather than model output. They are included because a scenario set without weights invites the reader to assume they are roughly equal, and the whole point is that they are not — the modal world holds more probability than the four alternatives combined. The right way to read them is as an invitation to substitute your own.",
      },
      {
        h: "Comparing these three at all is a category error",
        arg: "Climate is a physical process, war is a strategic interaction between reasoning adversaries, AI is a technology. They have no common unit. Ranking them by 'expected harm' requires a utility function nobody has, and 'where does a marginal unit of attention help most' smuggles in strong assumptions about whose attention and what they can do with it.",
        resp: "Partly conceded, and it is why the comparison here is made along the three structural axes rather than in a common currency of harm. Lag, actor count and tail shape are properties one can actually establish, and they generate the useful conclusions — that the tractability ranking inverts the intuitive one, that the tail-shape difference makes standard cost-benefit analysis systematically misrank them. Where this document does compare severity directly, in the claim about the century's largest loss event, it is comparing a single well-defined quantity: deaths from one event. That comparison is legitimate. Broader ones probably are not.",
      },
      {
        h: "Why these three, and not the other ones",
        arg: "The selection is doing enormous unexamined work. Pandemics have a demonstrated recent capacity for millions of deaths, a heavy tail of their own, and a biotechnology cost curve falling faster than solar. Antibiotic resistance kills more people annually than either war or heat. State collapse, famine and the slow degradation of institutional capacity do not appear at all. Choosing three challenges and then discovering structural facts about \"the century's great problems\" is choosing the conclusion.",
        resp: "Conceded, and it is the objection this document is least able to answer. The three were chosen because they are the three that public argument treats as the great challenges, so comparing them is useful even if the set is arbitrary — but that is a reason about discourse, not about the world. The pandemic omission is the one that bites hardest: it would compete directly for the century's-largest-loss-event claim, and it interacts with the AI section in a way nothing else here does, since biological capability uplift is the most concrete of the misuse channels. The honest position is that this is a document about three problems, not a ranking of all of them, and that the structural framework — lag, actor count, tail shape — is the transferable part. Apply it to a fourth problem and see what it says.",
      },
      {
        h: "Forecasting seventy-five years ahead is not a real activity",
        arg: "There is no demonstrated skill at this horizon, and there cannot be. The 1950 forecast of 2025 was wrong about nearly everything that mattered, and confidently. Dressing the same exercise in Monte Carlo bands makes it look rigorous without making it any more likely to be right.",
        resp: "Substantially conceded, and stated in the method section. The defence is modest: the value is not the number at 2100 but the structure — which variables dominate, which couplings are weak, which quantities would change the answer if measured. Those are robust to being wrong about the level. And the alternative to an explicit model is not the absence of a forecast; it is an implicit one, held with unexamined assumptions and no error bars. This document's central claim about itself is that it is better to be explicitly wrong than implicitly wrong, because only the first kind can be corrected.",
      },
    ],
  };

  // ============================================================
  // Sources
  // ============================================================

  TC.sources = {
    title: "Sources",
    sub: "Every observed figure on this site, and where it came from. Forecasts are computed by the model and are not listed here.",
    groups: [
      {
        h: "Artificial intelligence",
        items: [
          { t: "Epoch AI — Trends in Machine Learning", d: "Training compute of frontier models grew 4–5× per year 2010–2024; the post-2018 frontier trend is closer to 4×. Also the source for the projected deceleration to 3–4× through 2028, and for the power, capital and data constraints above 1e27 FLOP." },
          { t: "METR — Measuring AI Ability to Complete Long Tasks (2025, and subsequent updates)", d: "The 50%-success task-completion time horizon; doubling roughly every seven months 2019–2025, shortening to about four months over 2024–25." },
          { t: "Brynjolfsson, Chandar & Chen — Canaries in the Coal Mine? (Stanford Digital Economy Lab)", d: "High-frequency payroll evidence on entry-level employment in AI-exposed occupations; the ~20% decline for 22–25-year-old software developers since late 2022." },
          { t: "IEA — Energy and AI (World Energy Outlook special report)", d: "Data-centre electricity consumption of ~485 TWh in 2025 and a projection near 950 TWh by 2030, about 3% of global electricity." },
          { t: "METR \u2014 Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity (2025)", d: "The randomised trial finding experienced developers 19% slower with AI assistance while believing themselves faster. Cited because it cuts against this document\u2019s own productivity paragraph, and for the perception gap, which is the mechanism the diffusion argument turns on." },
          { t: "Brynjolfsson, Rock & Syverson — The Productivity J-Curve", d: "The theoretical and empirical basis for the diffusion-lag argument: why general-purpose technologies depress measured productivity before raising it, and why the intangible investment is invisible in the national accounts." },
          { t: "David — The Dynamo and the Computer (1990)", d: "The electrification analogy, and the original statement of why a general-purpose technology takes a generation to show up in the statistics." },
        ],
      },
      {
        h: "Climate",
        items: [
          { t: "IPCC AR6 Working Group I", d: "TCRE of 1.65°C per 1000 PgC (likely 1.0–2.3), i.e. 0.45 (0.27–0.63) per 1000 GtCO2; cumulative emissions of 2,390 ± 240 GtCO2 for 1850–2019; the near-zero Zero Emissions Commitment." },
          { t: "Global Carbon Project — Global Carbon Budget 2025", d: "Fossil CO2 emissions of 38.1 GtCO2 in 2025, a record and up 1.1%; the remaining 1.5°C budget of 170 GtCO2, about four years at current rates; 1.7°C and 2°C budgets at roughly 12 and 25 years." },
          { t: "WMO — consolidated global temperature assessment", d: "2025 at 1.44 ± 0.13°C above 1850–1900 across eight datasets; 2024 at about 1.55°C, the first calendar year above 1.5." },
          { t: "Climate Action Tracker — 2025 warming projections update", d: "About 2.6°C under implemented policies, 2.2°C including binding targets, 1.9°C under full net-zero achievement; and the finding that the current-policies figure has been unchanged for four years." },
          { t: "IRENA and BloombergNEF", d: "Utility-scale solar installed cost of $667/kW, down 88% since 2010; four-hour battery storage at $78/MWh, down 27% year-on-year and 84% since 2016; 510 GW of solar and 307 GWh of batteries added in 2025." },
          { t: "Armstrong McKay et al. (2022), Science — Exceeding 1.5°C could trigger multiple climate tipping points", d: "Assessed central thresholds and uncertainty ranges for the major tipping elements, several of which fall between 1.5 and 3°C." },
          { t: "Nordhaus (DICE) and Burke, Hsiang & Miguel (2015)", d: "The two families of damage function whose disagreement spans an order of magnitude — levels versus growth-rate effects." },
        ],
      },
      {
        h: "Conflict and nuclear weapons",
        items: [
          { t: "Uppsala Conflict Data Programme — Organized violence 1989–2025", d: "65 state-involved conflicts in 2025, the most since 1946; 13 wars, the most since 1992; ~244,600 deaths in organised violence; Russia–Ukraine at ~94,700, about 62% of battle deaths; one-sided violence up roughly fivefold to 76,500, driven above all by Sudan." },
          { t: "SIPRI Yearbook 2026, chapter 8 — World nuclear forces", d: "12,187 warheads across nine states in January 2026; 9,745 in military stockpiles; 4,012 deployed; 2,100–2,200 on high operational alert. China at 620 and growing fastest, with three new silo fields." },
          { t: "Cirillo & Taleb — On the statistical properties and tail risk of violent conflicts (Physica A, 2016)", d: "The raw tail-index estimate near 0.5 for war severity across roughly two millennia of conflict data, the dual-distribution method that maps it onto bounded support and recovers a finite mean about three times the sample average, and the argument that the post-1945 period cannot statistically establish a decline." },
          { t: "Pinker — The Better Angels of Our Nature (2011)", d: "The declining-violence thesis, stated in its strongest form, and the position the above is arguing against." },
          { t: "Rodriguez (Rethink Priorities) \u2014 How likely is a nuclear exchange between the US and Russia?", d: "The estimate used here as a sanity check on the hazard rate: roughly 1.1% a year for a nuclear war of any kind and about 0.38% for a US\u2013Russia exchange, assembled from the historical record, expert opinion and forecaster predictions \u2014 and published with explicit warnings about how much weight it will bear." },
          { t: "Arms Control Association and the Federation of American Scientists", d: "The New START expiry of 5 February 2026, the absence of a successor, and the sequence of withdrawals — INF in 2019, Open Skies thereafter." },
          { t: "Hsiang, Burke & Miguel (2013), Science — Quantifying the influence of climate on human conflict", d: "The meta-analytic estimate linking climate anomalies to intergroup conflict; and Buhaug et al.'s published critiques of its aggregation and identification, which are the reason the coefficient here is centred low." },
        ],
      },
      {
        h: "Forecasting method",
        items: [
          { t: "Tetlock — Expert Political Judgment (2005) and Superforecasting (2015)", d: "The tournament results, the fox–hedgehog finding, and the identified traits of accurate forecasters. Also the source of the standard that a probability without a resolution criterion is not a forecast." },
          { t: "Weitzman — On modeling and interpreting the economics of catastrophic climate change (2009)", d: "The 'dismal theorem': why expected-utility cost-benefit analysis behaves badly when the damage distribution is fat-tailed, and why this systematically misranks the three problems compared here." },
          { t: "Voros — A generic foresight process framework (2003)", d: "The possible / plausible / probable / preferable taxonomy from which the cone of possibilities is drawn." },
          { t: "Kahneman & Tversky", d: "The conjunction fallacy, and the reason a detailed scenario feels more probable than the vague superset that contains it." },
        ],
      },
    ],
  };

  w.TC = TC;
})(typeof window !== "undefined" ? window : globalThis);
