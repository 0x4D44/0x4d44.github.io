/* Past-paper practice: Software design & development (methodologies, analysis, design, testing, evaluation). Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HCP_BANK = window.HCP_BANK || {});
  const R = String.raw;
  /* Pattern helpers: a run of up to n words (so a concept and its relation have to sit in one stretch of writing),
     optionally refusing to cross certain words. */
  const WD = (n) => `(?:\\w+\\W+){0,${n}}`;
  const WX = (n, stop) => `(?:(?!(?:${stop})\\b)\\w+\\W+){0,${n}}`;
  const NA = (n) => WX(n, "and|or");
  const WS = (n, stop) => `(?:(?!(?:${stop})\\b)\\w+[\\s/]+){0,${n}}`;
  const LOOP = R`\b(for\s+(each\s+|every\s+)?\w+\s+(in|from)\s+\w+|for\s*\(|for\s+\w+\s*(=|<-|:=|from)|while\s+\w+\s*(<|<=|!=|>|>=)|loop\w*\s+(through|over)\s+\w+|repeat\s+(for|until|\d+)|(loop|repeat)\w*\s+(each|every)\s+\w+)`;
  /* optional tail that swallows a trailing "without the colours" so the engine's negation look-ahead does not read it as a negated claim */
  const TAIL = R`(?:\W+(?:\w+\W+){0,5}?(?:(?:and|but)\W+)?(?:without|not|no|minus|excluding|rather than|instead of)\W+(?:\w+\W+){0,6}\w+)?`;
  const ITER = "iterative|waterfall|predictive", AGI = "agile|sprints?|scrum";

  /* ---- figure: structure diagram with data flow (sdd-03) ---- */
  const INK = "#1d1a14", PAPER = "#fffaf0", BLUE = "#12284a";
  const box = (x, y, w, h, l1, l2, pre) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="1.8"/>` +
    (pre ? `<line x1="${x + 7}" y1="${y}" x2="${x + 7}" y2="${y + h}" stroke="${INK}" stroke-width="1.4"/><line x1="${x + w - 7}" y1="${y}" x2="${x + w - 7}" y2="${y + h}" stroke="${INK}" stroke-width="1.4"/>` : "") +
    `<text x="${x + w / 2}" y="${y + (l2 ? h / 2 - 3 : h / 2 + 5)}" font-size="13" text-anchor="middle" fill="${INK}">${l1}</text>` +
    (l2 ? `<text x="${x + w / 2}" y="${y + h / 2 + 13}" font-size="13" text-anchor="middle" fill="${INK}">${l2}</text>` : "");
  const flow = (x, y, a, b) =>
    `<text x="${x}" y="${y}" font-size="12" fill="${BLUE}" font-family="monospace">${a}</text>` + (b ? `<text x="${x}" y="${y + 16}" font-size="12" fill="${BLUE}" font-family="monospace">${b}</text>` : "");
  const xs = [10, 148, 286, 424];
  const fig3 =
    `<svg viewBox="0 0 560 215" role="img" aria-label="Structure diagram of a weather report program. The top box has four double-sided child boxes: 1 Read readings with OUT days and temps, 2 Find hottest with IN temps and OUT hotPos, 3 Count frost days with IN temps and hotPos and OUT frostDays, and 4 Display results whose data flow is marked with a question mark."><rect width="560" height="215" fill="${PAPER}"/>` +
    box(190, 10, 180, 34, "Weather report") +
    `<line x1="280" y1="44" x2="280" y2="66" stroke="${INK}" stroke-width="1.6"/><line x1="73" y1="66" x2="487" y2="66" stroke="${INK}" stroke-width="1.6"/>` +
    xs.map((x) => `<line x1="${x + 63}" y1="66" x2="${x + 63}" y2="88" stroke="${INK}" stroke-width="1.6"/>`).join("") +
    box(xs[0], 88, 126, 46, "1 Read", "readings", true) + box(xs[1], 88, 126, 46, "2 Find", "hottest", true) +
    box(xs[2], 88, 126, 46, "3 Count", "frost days", true) + box(xs[3], 88, 126, 46, "4 Display", "results", true) +
    flow(xs[0] + 2, 156, "OUT: days(),", "     temps()") + flow(xs[1] + 2, 156, "IN: temps()", "OUT: hotPos") +
    flow(xs[2] + 2, 156, "IN: temps(),", "    hotPos") + flow(xs[2] + 2, 188, "OUT: frostDays") + flow(xs[3] + 2, 156, "IN: ?") +
    `</svg>`;

  /* ---- figure: wireframe (sdd-04) ---- */
  const inbox = (y, label, hint, tagTxt) =>
    `<text x="40" y="${y + 20}" font-size="14" fill="${INK}">${label}</text>` +
    `<rect x="190" y="${y}" width="190" height="28" fill="#fff" stroke="${INK}" stroke-width="1.5"/>` +
    (hint ? `<text x="198" y="${y + 19}" font-size="13" fill="#8a8473">${hint}</text>` : "") +
    `<text x="400" y="${y + 19}" font-size="12" fill="${BLUE}" font-weight="700">${tagTxt}</text>`;
  const fig4 =
    `<svg viewBox="0 0 560 290" role="img" aria-label="Wireframe of a ferry booking screen. A title at the top, then three labelled input boxes: Name, Date of travel containing the hint dd/mm/yyyy, and Vehicle with a drop-down list. Below them a Book button and a dashed output area labelled Fare."><rect width="560" height="290" fill="${PAPER}"/>` +
    `<rect x="14" y="10" width="532" height="270" fill="none" stroke="${INK}" stroke-width="2"/>` +
    `<text x="280" y="42" font-size="18" font-weight="700" text-anchor="middle" fill="${INK}">ISLAND FERRY BOOKING</text>` +
    inbox(62, "Name:", "", "INPUT") + inbox(104, "Date of travel:", "dd/mm/yyyy", "INPUT") + inbox(146, "Vehicle:", "Choose from list ▾", "INPUT") +
    `<rect x="190" y="192" width="90" height="30" rx="4" fill="#e8e1cf" stroke="${INK}" stroke-width="1.6"/><text x="235" y="212" font-size="14" text-anchor="middle" fill="${INK}">Book</text>` +
    `<rect x="40" y="236" width="340" height="30" fill="none" stroke="${INK}" stroke-width="1.5" stroke-dasharray="6 4"/><text x="50" y="256" font-size="14" fill="${INK}">Fare: £ _ _ . _ _</text>` +
    `<text x="400" y="256" font-size="12" fill="${BLUE}" font-weight="700">OUTPUT</text></svg>`;

  B.sdd = {
    intro:
      "<p>This tab covers the written side of <b>Software design and development</b>: methodologies, analysis, design notations, user-interface design, testing and debugging, and evaluation. In the real paper these topics are worth roughly 8 to 12 of the 80 marks, spread across Section 1, and they are mostly written answers, so they are where marks are most often dropped.</p>" +
      "<p>Slips the 2025 course report singles out: <b>generic evaluation answers</b> (\"it is efficient\") that never name the code; answering about <b>robustness</b> when the question asked about <b>fitness for purpose</b>; <b>unnecessary parameters</b> in a data flow; a <b>compare</b> answer that only describes one side; and not linking an answer to the context of the question. Reference language is used in the stems; answer in any language.</p>",
    questions: [
      /* ---------------------------------------------------------------- 01 */
      {
        id: "sdd-01",
        style: "Scenario question · describe, compare and explain",
        stem: "<p>A ferry company wants a new app for booking crossings between the mainland and its islands. The development team is choosing between <b>iterative</b> (waterfall) development and an <b>agile</b> methodology. The company expects to change what the app offers several times once islanders have tried early versions.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Match each term to its description. [3]",
            pairs: [
              ["Sprint", "A short development cycle that ends with a working piece of the product being shown to the client"],
              ["Predictive", "The whole project is planned in detail at the start, so changes made later are hard to absorb"],
              ["Adaptive", "The team expects what is wanted to change and re-plans quickly when it does"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 2,
            q: "Compare how testing is carried out in iterative development and in agile development. [2]",
            rows: 4,
            sample: "In iterative development testing is a separate phase that happens after the implementation is finished, whereas in agile development testing is done during every sprint, alongside the coding.",
            model: "<ul><li>Iterative: a separate testing phase after implementation. (1)</li><li>Agile: testing takes place during each sprint, with no separate testing phase. (1)</li></ul><p>Both sides must be about the same heading (testing), linked by a connective such as <i>whereas</i>.</p>",
            points: [
              { desc: "Iterative: testing is a separate phase after implementation", any: [
                R`(iterative|waterfall|predictive)[:,]?[\s/]+${WS(10, AGI)}test\w*[:,]?[\s/]+${WS(10, AGI)}(after|separate|at the end|end of|own (phase|stage)|once|last|final|until|left|later|finished|complete\w*|built)`,
                R`(iterative|waterfall|predictive)[:,]?[\s/]+${WS(10, AGI)}(after|separate|at the end|end of|own (phase|stage)|once|last|final|until|left|later|finished|complete\w*|built)[:,]?[\s/]+${WS(8, AGI)}test\w*`,
                R`(after|separate|at the end|end of|own (phase|stage)|once|last|final)[:,]?[\s/]+${WS(6, AGI + "|" + ITER + "|whereas|while|but|however|unlike|compared|and")}(in|for|with|using)\W+(an? |the )?(iterative|waterfall|predictive)`] },
              { desc: "Agile: testing happens during every sprint / throughout", any: [
                R`(agile|sprints?|scrum)[:,]?[\s/]+${WS(10, ITER + "|separate")}test\w*[:,]?[\s/]+${WS(8, ITER + "|separate")}(during|every|each|throughout|alongside|continu\w*|regularly|all the time|at the same time|in parallel)`,
                R`(agile|sprints?|scrum)[:,]?[\s/]+${WS(10, ITER + "|separate")}(during|every|each|throughout|alongside|continu\w*|regularly|all the time|at the same time|in parallel)[:,]?[\s/]+${WS(8, ITER + "|separate")}test\w*`,
                R`(each|every)\W+(sprints?|iterations?)[:,]?[\s/]+${WS(4, "and|or")}(is|are|gets?)\W+(\w+\W+)?tested`,
                R`test\w*[:,]?[\s/]+${WS(6, ITER + "|separate")}(during|in|every|each|throughout)[:,]?[\s/]+${WS(3, "and")}(sprints?|iterations?)`],
                not: [R`(iterative|waterfall|predictive)\W+${WX(4, "agile")}test\w*\W+${WX(4, "agile")}(during|every|each|throughout|in)\W+${WX(3, "and")}(sprints?|iterations?)`] },
            ],
          },
          {
            label: "(c)", type: "text", marks: 2,
            q: "Explain why agile development suits this company. [2]",
            rows: 4,
            sample: "Agile is adaptive, so the team can change the app quickly when the company asks for new requirements. The client sees a working version after each sprint and gives feedback, which is built into the next sprint.",
            model: "<ul><li>Agile is adaptive / copes with changing requirements: short sprints let features be added or altered quickly. (1)</li><li>The client is involved throughout: a working piece is shown after every sprint and the feedback shapes the next one. (1)</li></ul><p>The link to the company's changing needs is what earns the marks, not just \"agile is faster\".</p>",
            points: [
              { desc: "Adaptive: changes to requirements are absorbed quickly", any: [
                R`(adapt\w*|flexib\w*|cope\w*|respond\w*|react\w*|accommodat\w*|absorb\w*|incorporat\w*|handle\w*|deal\w* with|welcom\w*)\W+${NA(6)}(chang\w*|requirement\w*|new feature\w*|alter\w*|amend\w*|modif\w*)`,
                R`(team|agile|it|they|developers?|process)\W+${NA(2)}(adapt\w*|respond\w*|react\w*|cope\w*|adjust\w*)\W+${NA(3)}(quick\w*|fast|easily|rapid\w*|well|readily)`,
                R`(quick\w*|easily|rapid\w*|readily)\W+(adapt\w*|respond\w*|react\w*|adjust\w*|cope\w*)\b`,
                R`(allow\w*|lets?|permits?)\W+${NA(3)}(chang\w*|requirement\w*|new feature\w*|alter\w*|amend\w*|modif\w*)`,
                R`(chang\w*|requirement\w*)\W+${NA(6)}(can|could|will|may|are|is|be|to be)\W+${NA(3)}(made|added|altered|accommodated|handled|adapted|absorbed|dealt|incorporated|included|easy|easier|easily|quick\w*)`] },
              { desc: "Client involved throughout: sees working versions and gives feedback each sprint", any: [
                R`(client|customer|users?|islanders?|company|stakeholders?|passengers?|they|them)s?\W+${NA(12)}(feedback|try|trying|test\w*|see|sees|view\w*|review\w*|use|comment\w*|suggest\w*|involved|input|shown|show\w*)\W+${NA(10)}(each|every|after|throughout|regular\w*|constant\w*|frequent\w*|continual\w*|sprints?)`,
                R`(client|customer|users?|islanders?|stakeholders?|they)s?\W+${NA(4)}(regular\w*|frequent\w*|constant\w*|continual\w*|early)\W+${NA(4)}(feedback|try|test\w*|see|view\w*|review\w*|use|comment\w*|suggest\w*|involved|input|shown|show\w*)`,
                R`(client|customer|users?|islanders?|stakeholders?)s?\W+${NA(3)}(see|try|test|view|review|use|get|receive)\w*\W+${NA(3)}(prototypes?|versions?|working \w+|demos?|builds?|releases?|increments?)\W+${WX(10, "or|but|however|whereas|not")}(feedback|comments?|suggest\w*)`,
                R`(prototypes?|versions?|working \w+|demos?|builds?|releases?|increments?)\W+${NA(10)}(client|customer|users?|islanders?|stakeholders?)s?.?s?\W+${NA(3)}(feedback|comments?|suggest\w*)`,
                R`feedback\W+${NA(10)}(next|each|every|following|later|after|new|future|updated|improved)\W+(\w+\W+)?(sprints?|versions?|iterations?|releases?|prototypes?|builds?|cycles?)`,
                R`(each|every|after)\W+(\w+\W+)?(sprints?|iterations?|cycles?)\W+${NA(10)}(working|prototype|version|product|demo|release|increment|software|piece)\W+${NA(10)}(feedback|try|see|review|test|comment|suggest|shown|show|use)\w*`,
                R`(working|early)\W+(version|prototype|piece|product|software|build|release|increment|demo)s?\W+${NA(8)}(feedback|try|see|review|comment|suggest|shown|show)\w*`] },
            ],
          },
        ],
      },

      /* ---------------------------------------------------------------- 02 */
      {
        id: "sdd-02",
        style: "Scenario question · analysis",
        stem: "<p>A school librarian gives this brief: <i>\"List the pupils who are borrowing the most. I will say what counts as a lot. Tell me how many there are, too.\"</i> The file <code>loans.csv</code> holds one line for each of the 120 pupils: the pupil's name and their number of books.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Part of the analysis is shown on the left. Match each statement to the part of the analysis it belongs to. [4]",
            pairs: [
              ["To show the librarian which pupils have borrowed at least a chosen number of books", "Purpose"],
              ["A working program, its design, a test plan and an evaluation report, delivered by the end of term", "Scope"],
              ["Exactly 120 pupils are read, and the contents of the file are assumed to be correct", "Boundaries"],
              ["Display the name of every pupil whose number of books reaches the chosen number", "Functional requirement"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 3,
            q: "Identify the inputs, the processes and the outputs of the program the librarian needs. [3]",
            rows: 5,
            sample: "Inputs: the name and number of books of each pupil, read from the file, and the number chosen by the librarian typed at the keyboard. Process: compare the books of each pupil with the chosen number and count the pupils who reach it. Outputs: display the names of those pupils and display how many there are.",
            model: "<ul><li>Inputs: pupil names and books read from loans.csv, plus the librarian's chosen number from the keyboard. (1)</li><li>Processes: compare each pupil's books with the chosen number; count the pupils who qualify. (1)</li><li>Outputs: the names of the qualifying pupils and the count of them. (1)</li></ul><p>Check every input is listed: 2025 candidates often missed one.</p>",
            points: [
              { desc: "Inputs: file data (names, books) and the chosen number from the keyboard", all: [
                R`(loans?|data|csv|pupils?|names?|books?|text|input)\W+file\b|(open\w*|us\w+|load\w*|get|gets|take\w*|import\w*|input\w*)\W+${WX(4, "and|or")}(the |a )?(\w+\W+)?(file|loans|csv)|read\w*\W+${WX(3, "and|or")}(in |from |out of )?(the |a )?(\w+\W+)?(file|loans|csv)|from\W+(the |a )?(\w+\W+)?(file|loans|csv)|(file|loans|csv)\W+${WX(3, "and|or")}(is |are )?(read|input|loaded|opened)|names?\W+and\W+(the )?(number of )?books\W+(of|for|from|in)`,
                R`(at|on|using|from|via|through)\W+(the |a )?keyboard|(typed|types|typing|keyed|entered|enters?|inputs?|chosen|chooses|selected|selects|gives?|given|sets?)\W+${WX(4, "and|or")}(by|at|on|using|from|via|with|through)\W+(the )?(librarian|user|keyboard)|(librarian|user)\W+${NA(3)}(types?|enters?|chooses?|selects?|inputs?|gives?|keys?|sets?)\W+${NA(4)}(number|value|target|amount|figure|minimum|threshold|limit)|(number|value|target|amount|figure|minimum|threshold|limit)\W+${NA(4)}(the )?(librarian|user)\W+${NA(2)}(types?|enters?|chooses?|selects?|inputs?|gives?|sets?)\b`], win: 220 },
              { desc: "Processes: compare each pupil's books with the chosen number; count", all: [
                R`(compar\w*|check\w*|test\w*|see\w*|decid\w*|work\w* out|find\w*)\W+${NA(8)}(books?|loans?|pupils?|borrowed|read|counts?|totals?)\W+${WX(8, "and")}(with|to|against|reach\w*|at least|>=|meets?|exceeds?|enough|greater|more than|equal|above|over|higher|bigger|larger)\W+${NA(5)}(chosen|selected|entered|typed|input|given|number|target|librarian|limit|minimum|threshold|value|figure)|(books?|loans?)\W+${NA(6)}(>=|>|greater than|more than|at least|reach\w*|equal\w*|meets?)\W+${NA(5)}(chosen|selected|number|target|librarian|limit|minimum|threshold|value|figure)|(pupils?|those)\W+${NA(3)}(who|whose|with)\W+${NA(6)}(>=|>|greater|more than|at least|reach\w*|equal\w*|meets?|enough)`,
                R`\bcount\w*\W+${NA(6)}(pupils?|those|them|who|how many|matches|ones|number|it|each|qualif\w*)|add\w*\W+(1|one)\W+${NA(3)}(to\W+)?(the |a )?(\w+\W+)?(count|counter|total|number|tally)|(keep\w*|work\w* out|calculat\w*|find\w*)\W+${NA(3)}(a |the |running )?(count|total|tally)|total\w*\W+${NA(3)}(pupils?|those|them)|(incre\w+|add\w*)\W+${NA(3)}(a |the )?(count|counter|total|tally)`], win: 200 },
              { desc: "Outputs: names displayed and the number of pupils", all: [
                R`(display\w*|show\w*|print\w*|outputs?|report\w*|writ\w+)\W+${NA(4)}(the |all |each )?(\w+\W+)?(names?|pupils?)|list\w*\W+${NA(3)}(the )?names|(names?|pupils?)\W+${NA(4)}(is |are |will be |get |gets )?(displayed|shown|printed|output|listed|reported)|outputs?:\W+${NA(6)}(names?|pupils?)`,
                R`(display\w*|show\w*|print\w*|outputs?|report\w*|writ\w+)\W+${WD(6)}(how many|number of|count|total|tally)|(how many|number of pupils|the count|the total|the tally)\W+${NA(6)}(is |are |will be )?(displayed|shown|printed|output|reported)|how many\W+${NA(5)}(there are|pupils|qualif\w*|reach\w*)|outputs?:\W+${WD(10)}(how many|number of|count|total)`], win: 220 },
            ],
          },
        ],
      },

      /* ---------------------------------------------------------------- 03 */
      {
        id: "sdd-03",
        style: "Design question · structure diagram, data flow and refinement",
        stem: "<p>A weather station records the temperature for each of 7 days. This structure diagram is a design for a program that reports on the week. The arrays <code>days()</code> and <code>temps()</code> each hold 7 values. A frost day is a day with a temperature below 0.</p>",
        figure: fig3,
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1,
            q: "Which shape does a structure diagram use to show a selection (an IF)?",
            opts: ["A rectangle", "A rectangle with rounded ends", "A hexagon", "A rectangle with double sides"],
            a: 2,
            why: "The hexagon is the selection symbol. The rounded-end rectangle is a loop, the plain rectangle a process, and the double-sided rectangle a predefined (sub-program) step.",
          },
          {
            label: "(b)", type: "text", marks: 2,
            q: "Step 4 displays the name of the hottest day and the number of freezing days. State the data that flows <b>into</b> step 4 and explain why each item is needed. [2]",
            rows: 3,
            sample: "IN: days(), hotPos and frostDays. The days array gives the name and hotPos says which day is the hottest, and frostDays holds the number of frost days.",
            model: "<ul><li>days() and hotPos: the name is looked up in days() at position hotPos. (1)</li><li>frostDays: the count to be displayed. (1)</li></ul><p>temps() is not needed by this step, so including it earns no mark: only pass in what a step uses.</p>",
            points: [
              { desc: "days() and hotPos are passed in, with a reason (look up the name of the hottest day)", any: [
                R`days\b\W+${WX(4, "and|or")}(gives?|holds?|stores?|contains?|provides?|has|supplies|needed|used|for|to)\W+${WX(4, "and|or")}(the )?(name|names|day|hottest|which)\w*\W+${WD(14)}hot\s?pos`,
                R`hot\s?pos\W+${WX(4, "and|or")}(says?|tells?|gives?|shows?|is|identif\w*|holds?|stores?|points?|marks?|finds?|means?)\W+${WX(5, "and|or")}(which|where|the position|the index|hottest|position|index)\w*\W+${WD(14)}days\b`,
                R`(name|look\w*|find|get|use|index|pick\w*|select\w*)\W+${WX(6, "and|or")}days\W*(\(\))?\W+${WX(4, "and|or")}(at|with|using|by|from)\W+${WX(2, "and|or")}(position\W+)?(of\W+)?hot\s?pos`,
                R`days\W*(\(\))?\W+and\W+hot\s?pos\W+${WX(8, "frost")}(needed|used|required|to (find|display|show|get|look|work|identify|print|output)\w*|so|because|are passed)`,
                R`hot\s?pos\W*\W+and\W+days\W*(\(\))?\W+${WX(8, "frost")}(needed|used|required|to (find|display|show|get|look|work|identify|print|output)\w*|so|because|are passed)`],
                not: [R`\btemps\b`] },
              { desc: "frostDays is passed in, and nothing unnecessary", any: [
                R`frost\s?(days?|count)\W+${WX(5, "and|or")}(holds?|is|are|gives?|stores?|contains?|has|counts?|needed|used|shows?|tells?|for|so|because|to|to be|can be|will be|displayed|shown|output|reports?)\W+${WX(4, "and|or")}(the )?(number|count|total|how many|displayed|shown|output|printed|reported|needed)`,
                R`(number|count|total|how many)\W+${WX(5, "and|or")}(of\W+)?(frost|freezing|days)\W+${WX(4, "and|or")}(is |are )?(in |from |stored in |held in |given by |shown by |passed in )?frost\s?(days?|count)`,
                R`(display\w*|show\w*|print\w*|output\w*|report\w*)\W+${WX(4, "and|or")}(the )?(number|count|total|how many)\W+${WX(5, "and|or")}frost\s?(days?|count)`,
                R`frost\s?(days?|count)\W+${WX(3, "and|or")}(so|because|which)\W+${WX(5, "and|or")}(display\w*|show\w*|print\w*|output\w*|report\w*)`],
                not: [R`\btemps\b`] },
            ],
          },
          {
            label: "(c)", type: "text", marks: 2,
            q: "The data flow for step 3 contains a mistake. Identify it, and explain the problem it causes. [2]",
            rows: 4,
            negOK: true,
            sample: "hotPos should not be passed into step 3. Counting frost days only needs temps(), so hotPos is an unnecessary extra parameter that the step never uses.",
            model: "<ul><li>hotPos is passed IN to step 3. (1)</li><li>The step does not use it: counting frost days only needs temps(), so it is an unnecessary parameter that makes the code less efficient. (1)</li></ul>",
            points: [
              { desc: "Identifies hotPos as the wrong item", negOK: true, any: [
                R`hot\s?pos\W+${WD(5)}(shouldn.t|should not|does ?n.t|do not|don.t|not|never|isn.t|aren.t|unnecessar\w*|extra|surplus|redundant|wrong|mistake|error|unused|remov\w*|delet\w*|take\w* (it )?out)`,
                R`(remov\w*|delet\w*|take out|drop|get rid of|without|shouldn.t (have|be)|should not (have|be)|unnecessar\w*|extra|surplus|redundant|wrong|mistake|error)\W+${WD(4)}hot\s?pos`],
                not: [R`should be (passed|sent|given|input)|(hot\s?pos|it) (is|are|gets|was) (needed|used|required|necessary)|because (it|hot\s?pos) (is|gets) (used|needed)`, R`\bnot not\b`] },
              { desc: "Explains it is not used / unnecessary", negOK: true, any: [
                R`(hot\s?pos|it|this|parameter|value|data|item|variable|extra)\W+${WD(4)}(is|are|was|be|being)\W+${WD(2)}(unnecessar\w*|extra|surplus|redundant|not (used|needed|required|necessary)|never (used|needed)|pointless|useless|irrelevant|wasted|unused)`,
                R`(step 3|step three|counting|the step|the sub-?program|it|frost\w*)\W+${WD(3)}(never|does ?n.t|does not|do not|don.t|doesn.t|not|no)\W+(use|need|require)\w*\W+${WD(3)}(hot\s?pos|it|this|parameter|value|position)`,
                R`(unnecessar\w*|extra|surplus|redundant|pointless|unused)\W+(parameters?|data|items?|values?|variables?|arguments?|inputs?)`,
                R`(no need|no use|not needed|not necessary|not required|isn.t needed|isn.t used|not used)\W+${WD(3)}(for|to|by|in)\W+${WD(3)}(step 3|step three|counting|frost\w*|this step|hot\s?pos)`],
                not: [R`(hot\s?pos|it) (is|are|gets|was) (needed|used|required|necessary)|because (it|hot\s?pos) (is|gets) (used|needed)`, R`\bnot\W+(?:(an?|the|really|actually|at all)\W+){0,2}(unnecessar|extra|surplus|redundant|unused|pointless|useless|irrelevant|wasted)`] },
            ],
          },
          {
            label: "(d)", type: "code", marks: 4,
            q: "Using pseudocode or a programming language, write the refinement of step 3, which counts the frost days in <code>temps()</code> and passes the count out. [4]",
            rows: 7,
            sample: "SET frostDays TO 0\nFOR EACH temp FROM temps DO\n   IF temp < 0 THEN\n      SET frostDays TO frostDays + 1\n   END IF\nEND FOR\nRETURN frostDays",
            model: "<pre>SET frostDays TO 0\nFOR EACH temp FROM temps DO\n   IF temp &lt; 0 THEN\n      SET frostDays TO frostDays + 1\n   END IF\nEND FOR</pre><ul><li>Count initialised to 0. (1)</li><li>A fixed loop over every temperature. (1)</li><li>A selection testing the temperature is below 0. (1)</li><li>Adds 1 to the count when it is. (1)</li></ul>",
            points: [
              { desc: "Initialises the count to 0", any: [R`\w+\s*(=|:=|<-)\s*0(?![\d.])`, R`\bset\s+\w+\s+to\s+(0|zero)\b`, R`\binitiali[sz]\w*.{0,30}\b(0|zero)\b`] },
              { desc: "A loop over every temperature", any: [LOOP] },
              { desc: "Selection: temperature below 0", any: [
                R`\b(if|when|elif|case)\b.{0,50}(<\s*0(?![\d.])|less than (0|zero)\b|below (0|zero)\b|< ?zero|freezing)`,
                R`\b(if|when|elif)\b.{0,30}\b0\s*>\s*\w+`,
                R`(<\s*0(?![\d.])|less than (0|zero)\b|below (0|zero)\b)\s*(then|:|\{|\)\s*\{?)`] },
              { desc: "Adds 1 to the count", any: [R`(\w+)\s*(=|:=|<-|\bto)\s*\1\s*\+\s*1\b`, R`\w+\s*\+=\s*1\b`, R`\w+\s*\+\+|\+\+\s*\w+`, R`\b(add|plus|increment|increase)\w*\s+(1|one)\b`, R`\b(add|increment|increase)\w*\s+${WD(2)}(count|frostdays|frost|total|counter)\b`] },
            ],
          },
        ],
      },

      /* ---------------------------------------------------------------- 04 */
      {
        id: "sdd-04",
        style: "Design question · user interface",
        stem: "<p>The ferry company's designer drew the wireframe below for the first screen of the booking app.</p>",
        figure: fig4,
        parts: [
          {
            label: "(a)", type: "text", marks: 2,
            q: "Describe what a wireframe shows. [2]",
            rows: 4,
            sample: "A wireframe is a simple sketch of the layout of one screen, showing the position of each item. It shows where every input box and output area will appear, with labels saying which is which.",
            model: "<ul><li>A simple sketch / plan of the layout of one screen: where each item goes. (1)</li><li>It shows the inputs, outputs and buttons (what the user enters and where results appear), not colours or finished content. (1)</li></ul>",
            points: [
              { desc: "A sketch of the layout / position of items on a screen", any: [
                R`(sketch|layout|plan|picture|drawing|diagram|outline|design|blueprint|mock-?up|skeleton|template)\W+${NA(3)}(of|for|showing|shows|that shows|which shows)\W+${NA(3)}(screen|page|interface|app|display|window|user interface)`,
                R`(layout|arrangement|positions?|placement|where (things|items|everything|each|the)\w*)\W+${WD(3)}(of|on|for|in)\W+${WD(3)}(screen|page|interface|app|display)`,
                R`(what|how)\W+${WD(3)}(screen|page|interface|app|it)\W+${WD(3)}(look\w*|appear\w*|be laid out|be arranged)`] },
              { desc: "Shows the inputs and outputs (boxes, buttons, results)", any: [
                R`where\W+${WD(5)}(input\w*|output\w*|button\w*|boxes|fields?|prompts?|results?|items?|data|labels?|text|everything|things|elements?|components?)\W+${WD(5)}(go|goes|be|are|is|will|placed|positioned|appear|shown|displayed|located|put|sit|sits|can be)${TAIL}`,
                R`(position\w*|placement|layout|arrangement)\W+${NA(3)}(of|for)\W+${NA(3)}(input\w*|output\w*|buttons?|boxes|fields?|labels?|items?|elements?|text)${TAIL}`,
                R`(shows?|includes?|contains?|labels?|marks?|identif\w*|displays?|indicates?|lays? out|arranges?)\W+${NA(4)}(input\w*|output\w*|buttons?|boxes|fields?|prompts?)${TAIL}`] },
            ],
          },
          {
            label: "(b)", type: "text", marks: 2,
            q: "The design puts a label beside every input box, and a format hint, dd/mm/yyyy, inside the date box. Explain how each of these features helps the user. [2]",
            rows: 4,
            sample: "The labels tell the user what to put in each box, so nobody is unsure which information goes where. The format hint shows the date format wanted, so the user types it correctly and the program does not reject it.",
            model: "<ul><li>Labels: the user knows what information to put in each box. (1)</li><li>Format hint: shows the layout of the date expected, so fewer wrong or rejected entries. (1)</li></ul>",
            points: [
              { desc: "Labels tell the user what to put in each box", all: [R`label\w*`, R`(what|which|where)\W+${NA(4)}(box|field|input|enter|type|put|write|data|information|goes|go|to type)|(clear|obvious)\W+${NA(5)}(what|which|box|field|enter|type)`], win: 140,
                not: [R`(harder|confus\w*|difficult|clutter\w*|slower|worse)`, R`\bnot not\b|\b(do|does|did|can|will|would|could|is|are)(n.t| not)\W+(\w+\W+)?(tell|show|say|help|let|remind|indicate|prevent|stop|ensure|avoid|reduce|mean)\w*`] },
              { desc: "The hint shows the format needed, so fewer errors", any: [
                R`(so|means?|which|helps?|ensur\w+|avoid\w*|prevent\w*|stop\w*|reduc\w*|therefore)\W+${NA(8)}(correct\w*|right|wrong|error\w*|invalid|mistake\w*|reject\w*|valid|properly|accepted|enter\w*|type\w*|know\w*)\W+${NA(8)}(format|date|dd|hint|layout|way)`,
                R`(hint|format|example|dd/mm/yyyy|dd/mm)\W+${NA(8)}(means?|so|helps?|ensur\w+|stops?|prevent\w*|avoid\w*)\W+${NA(8)}(correct\w*|right|wrong|error\w*|invalid|mistake\w*|reject\w*|valid|properly|entered|typed)`,
                R`(hint|format|dd/mm/yyyy|dd/mm|example)\W+${NA(6)}(tells?|shows?|says?|lets?|reminds?|indicates?|gives?)\W+${NA(8)}(format|how|what|way|date|type|enter|layout)`,
                R`(correct\w*|right|wrong|error\w*|invalid|mistake\w*|reject\w*|valid|properly)\W+${NA(8)}(format|date|dd)\W+${NA(8)}(hint|format|dd/mm)`],
                not: [R`(harder|confus\w*|difficult|clutter\w*|slower|worse)`, R`\bnot not\b|\b(do|does|did|can|will|would|could|is|are)(n.t| not)\W+(\w+\W+)?(tell|show|say|help|let|remind|indicate|prevent|stop|ensure|avoid|reduce|mean)\w*`] },
            ],
          },
          {
            label: "(c)", type: "multi", marks: 3,
            q: "Which <b>three</b> of these should appear on a wireframe for this screen?",
            opts: [
              "The position of each input box",
              "The wording of each label and prompt",
              "Where the fare will be displayed",
              "The source code of the booking sub-program",
              "The IN and OUT data flow of each sub-program",
              "The test data to be used",
            ],
            a: [0, 1, 2],
            why: "A wireframe is a layout sketch: where the inputs and outputs go and what the prompts say. Source code, data flow and test data belong to the design and testing documents, not the screen design.",
          },
        ],
      },

      /* ---------------------------------------------------------------- 05 */
      {
        id: "sdd-05",
        style: "Short question · test data and test plans",
        stem: "<p>A gym's membership program asks for a member's age and accepts only whole-number ages from 16 to 70 inclusive. Any other input should be rejected with an error message. The programmer writes a test plan before running any tests.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Match each piece of test data to the kind of test data it is. [3]",
            pairs: [
              ["34", "Normal: valid data well inside the range, which should be accepted"],
              ["70", "Extreme: valid data on the edge of the range, which should be accepted"],
              ["71", "Exceptional: data that should be rejected"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 2,
            q: "The test plan gives an expected result for every test. Explain why this is needed. [2]",
            rows: 4,
            sample: "The tester compares the actual result the program produces with the expected one. This shows whether each test has passed or failed, so any error in the program can be spotted.",
            model: "<ul><li>So the actual output can be compared with what should have happened. (1)</li><li>So the tester can tell whether the test passed or failed and so identify errors. (1)</li></ul>",
            points: [
              { desc: "Compare the actual result with the expected result", any: [
                R`(actual|real|produced|output|result|outcome|program.?s|gets|given|displayed)\w*\W+${NA(6)}(with|to|against|versus|vs|matches?|same as|equals?|differs?|different from|should)\W+${NA(3)}(expected|predicted|supposed|correct|planned|should)`,
                R`(expected|predicted|planned)\W+${NA(6)}(with|to|against|and|versus|vs|matches?)\W+${NA(3)}(actual|real|produced|output|result|program)`,
                R`(check|see|know|find out|tell|make sure|ensure|decide|whether)\W+${NA(5)}(output|result|answer|program)\w*\W+${NA(4)}(is|are|matches?|same|what|equals?)\W+${NA(4)}(expected|should|supposed|predicted)`,
                R`(compar\w*|check\w*|match\w*)\W+${NA(6)}(with|to|against|versus|vs)\W+${NA(6)}(actual\w*|real|produced|gave|gives|given|outputs?|displayed|what the program)`,
                R`(compar\w*|check\w*|match\w*)\W+${NA(4)}(the )?(actual|real|produced|output|result|outcome|program.?s)\w*\W+${NA(3)}(against|with|to)\W+(it|that|them|this|what)\b`,
                R`(compar\w*|check\w*|match\w*)\W+${NA(6)}(with|to|against|versus|vs)\W+${NA(4)}(expected|predicted|planned|what (it|the \w+) (should|was supposed|ought))`] },
              { desc: "To tell whether the test passed or failed / find errors", negOK: true, any: [
                R`(tell|know|show\w*|identif\w*|spot\w*|find\w*|detect\w*|decid\w*|see|prove\w*|determin\w*|check\w*|reveal\w*|indicat\w*)\W+${NA(6)}(pass\w*|fail\w*|error\w*|fault\w*|wrong|incorrect|bugs?|mistakes?)`,
                R`(if|when|whether)\W+${NA(4)}(same|match\w*|differ\w*|different)\W+${NA(5)}(pass\w*|fail\w*|error\w*|fault\w*|wrong|work\w*)`,
                R`(mismatch\w*|difference|differ\w*|not match\w*)\W+${NA(4)}(shows?|means?|indicates?|tells?|reveals?|signals?)\W+${NA(3)}(an? )?(error|fault|fail\w*|wrong|bug)`,
                R`(test|tests|it|program)\W+${NA(1)}(passed|failed|pass|fail)\b`],
                not: [R`^(?![\s\S]*\b(without|missing|lacks?|lacking|unless)\b)[\s\S]*(?:\b(?:never|not|cannot|neither|nor|unable)|n't)\W+${WD(3)}(show|tell|let|help|identif|find|spot|detect|know|decid|prove|determin|see|reveal|indicat|pass|fail|mean)\w*`, R`\bnot not\b`] },
            ],
          },
          {
            label: "(c)", type: "text", marks: 2,
            q: "The tester includes the ages 16 and 70 in the plan. Explain why these two values are chosen. [2]",
            rows: 4,
            sample: "16 and 70 are the lowest and highest ages in the allowed range, so they test the boundaries. If the condition uses > instead of >= the program would wrongly reject a valid age such as 16.",
            model: "<ul><li>They are the boundaries of the valid range (lowest and highest allowed), so they are extreme data. (1)</li><li>They reveal a logic error in the comparison, e.g. &gt; used instead of &gt;=, so that a valid age is wrongly rejected. (1)</li></ul>",
            points: [
              { desc: "They are the boundaries / extremes of the range", negOK: true, any: [
                R`(boundar\w*|edges?|extremes?|limits?|ends?)\W+${NA(2)}(of|to|in|on)\W+${NA(2)}(range|valid|allowed|accepted|ages?|data|values?)`,
                R`(lowest|highest|smallest|largest|minimum|maximum|top|bottom|first|last|youngest|oldest|min|max)[\s-]+${WX(1, "as|the|a|an|of|to|in|on|and|or|so|is|are|they|it|if").replace(/\\W\+/g, "[\\s-]+")}(valid|allowed|accepted|possible|legal|ages?|range|values?|number|input)`,
                R`(on|at|right on|just inside|inside|exactly on)\W+(the )?(edges?|boundar\w*|limits?|extremes?)`,
                R`(are|is|called|count as|classed as|these are)\W+${NA(2)}(extremes?|boundar\w*)\W*(data|values?|ages?|cases?|tests?)?`],
                not: [R`(middle|typical|ordinary|centre|center|average|normal data)`, R`\bnot\W+(?:(the|a|really|just|only)\W+){0,2}(lowest|highest|smallest|largest|boundar|extreme|edge|limit|minimum|maximum)`, R`(?:\bnot|n't|\bnever|\bnor|\bneither)\W+${WD(3)}(the |a )?(lowest|highest|smallest|largest|boundar\w*|extreme\w*|edge\w*|limit\w*|minimum|maximum|ends?)`, R`\bnot not\b`] },
              { desc: "They reveal a wrong comparison (> instead of >=) that rejects a valid age", negOK: true, any: [
                R`(>=|<=|>|<|greater than|less than|operators?|off.by.one|comparison|conditions?)\W+(?:(is|are|was|were|has|have|been|be|being)\W+)(?:(a|an|the|really|clearly|just|simply)\W+){0,2}(wrong\w*|incorrect\w*|mistake\w*|error\w*|bug\w*|off.by.one)`,
                R`(>=|<=|>|<|greater than|less than|operators?|comparison|conditions?)\W+(?:(is|are|would|will|might|may|could|can)\W+)?(rejects?|refuses?|fails?|misses?|excludes?)\W+${NA(2)}(an? |the )?(valid|legal|allowed|correct|acceptable|good|16|70|age)`,
                R`(>=|<=|>|<)\W+(?:(?:or|and)\W+(?:>=|<=|>|<)\W+)?(?:\w+\W+){0,2}?(properly|correctly|right)\b`,
                R`(mistake|error|fault|bug|problem)\W+${WD(6)}(stop\w*|prevent\w*|block\w*|keep\w*)\W+${WD(5)}(accepted|allowed|entered|let in)`,
                R`(>=|<=|>|<)\W+${NA(3)}(written|used|coded|typed|put|entered)\W+${NA(1)}(as|instead of|rather than)\W+(>=|<=|>|<|greater|less)`,
                R`(check\w*|test\w*|ensur\w*|verif\w*|prov\w*|confirm\w*|show\w*)\W+${NA(3)}(comparison|operators?|conditions?|relational|>=|<=)\W+${NA(3)}(is|are|has been|have been|been|was)\W+${NA(1)}(right|correct\w*|proper\w*|accurate\w*|written|used|coded|wrong\w*)`,
                R`wrongly (reject|refus|turn)\w*`, R`reject\w*\s+(a |an |the )?(valid|correct|legal|allowed|acceptable|good)`,
                R`(valid|legal|correct|acceptable)[^.;!?]{0,25}(is|are|gets?|being|be|would be|will be) (wrongly )?(reject|refus)\w*`],
                not: [R`(not|never|n.t)\W+(\w+\W+)?(reject|refus|turn)`, R`(not|never|n't)\W+${WD(2)}(check|test|show|ensure|verif|prove|confirm|reveal|find|spot|detect)\w*`, R`\bnot not\b`] },
            ],
          },
        ],
      },

      /* ---------------------------------------------------------------- 06 */
      {
        id: "sdd-06",
        style: "Code question · dry run and debugging tools",
        stem: "<p>A teacher stores five test scores in an array <code>scores</code> (positions 0 to 4): 12, 7, 15, 20, 9. The program below is meant to find the position of the highest score, and to add up every <b>even</b> score.</p><pre>1  SET best TO 0\n2  SET extra TO 0\n3  FOR i FROM 1 TO 4 DO\n4     IF scores[i] &gt; scores[best] THEN\n5        SET best TO i\n6     END IF\n7     IF scores[i] MOD 2 = 0 THEN\n8        SET extra TO extra + scores[i]\n9     END IF\n10 END FOR</pre>",
        parts: [
          { label: "(a)", type: "num", marks: 1, q: "Dry run the program. What is the value of <code>best</code> when the loop ends?", a: 3, tol: 0, why: "i=1: 7 > 12 no. i=2: 15 > 12 yes, best=2. i=3: 20 > 15 yes, best=3. i=4: 9 > 20 no. So best = 3." },
          { label: "(b)", type: "num", marks: 1, q: "What is the value of <code>extra</code> when the loop ends?", a: 20, tol: 0, why: "The loop starts at position 1, so 12 is never looked at. Even scores seen: 20 only (7, 15 and 9 are odd). extra = 20." },
          { label: "(c)", type: "num", marks: 1, q: "How many times is line 5 executed?", a: 2, tol: 0, why: "Line 5 runs when a score beats the current highest: i=2 (15) and i=3 (20). So 2 times." },
          {
            label: "(d)", type: "text", marks: 2,
            q: "The teacher wanted every even score added, including <code>scores[0]</code>. Name the type of error and describe the change that fixes it. [2]",
            rows: 3,
            sample: "It is a logic error, because the program runs but gives the wrong total. The loop must start from 0 instead of 1 so that the first score is included.",
            model: "<ul><li>Logic error (the program runs but gives the wrong answer). (1)</li><li>Change the start of the loop (line 3) to FROM 0 so position 0 is included. (1)</li></ul>",
            points: [
              { desc: "Logic error", any: [R`logic(al)?\W+(error|mistake|fault|bug|problem)(?:\W+(?:because|as|since|where|which|so|and|but)\W+${WD(7)}(?:wrong\w*|incorrect\w*|inaccurate\w*))?`, R`(error|mistake|fault|bug|problem)\W+${NA(3)}(is|was|as)\W+(a |an )?logic`, R`(type|kind) of error\W+${NA(3)}logic`, R`^\W*logic\W*$`] },
              { desc: "Start the loop at 0 so the first score is included", any: [
                R`(start|begin|go|run|count)\w*\W+${WD(2)}(from|at|with|on)\W+${WD(1)}(0|zero|first|index 0|position 0|the beginning)\b(?:\W+(?:not|instead of|rather than)\W+(?:1|one)\b)?`,
                R`\bfrom\s+(0|zero)\b`, R`(change|alter|amend|edit)\w*\W+${WD(5)}(1 to 0|to (0|zero))\b`,
                R`\b(0|zero)\W+(not|instead of|rather than)\W+(1|one)\b`,
                R`(first|scores?\s*[\[(]0[\])]|position 0|index 0|element 0)\W+${NA(6)}(is|are|gets|can be|will be|would be)\W+${WD(2)}(included|checked|counted|added|processed|used|looked at|tested)`,
                R`(include|check|use|count|process|look at|read|test)(s|ed)?\b\W+${WD(4)}(scores?\s*[\[(]0[\])]|first (score|element|item|value|position)|position 0|index 0|element 0)`] },
            ],
          },
          {
            label: "(e)", type: "mcq", marks: 1,
            q: "Which debugging tool pauses the program every time the value of <code>extra</code> changes?",
            opts: ["A breakpoint", "A watchpoint", "A dry run", "A trace table"],
            a: 1,
            why: "A watchpoint is tied to a variable (or a condition on it). A breakpoint is tied to a line; a dry run and a trace table are done by hand or recorded, and do not pause the program.",
          },
        ],
      },

      /* ---------------------------------------------------------------- 07 */
      {
        id: "sdd-07",
        style: "Short question · error types and debugging techniques",
        stem: "<p>A trainee is writing a program that processes the points of the 8 cadets in a flight, read from a file. These problems turn up.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Match each problem to the type of error. [3]",
            pairs: [
              ["The keyword WHILE is typed as WHLIE", "Syntax error: the code breaks the grammar of the language, so it cannot be translated"],
              ["The program divides the total by the number of cadets, but the file is empty, so the program stops", "Execution error: the program stops while running because it is asked to do something impossible"],
              ["The program counts cadets with fewer than 50 points instead of more than 50 and finishes normally, showing the wrong count", "Logic error: the program runs to the end but gives the wrong result"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 2,
            q: "Describe what a breakpoint is and why a programmer would set one. [2]",
            rows: 4,
            sample: "A breakpoint is a marker set on a line of code, and the program pauses when it reaches that line. The programmer can then inspect the values of the variables at that point to see whether they are correct.",
            model: "<ul><li>A marker on a particular line; execution pauses just before that line runs. (1)</li><li>So the programmer can inspect/check the variables or state of the program at that point. (1)</li></ul>",
            points: [
              { desc: "A marker on a line where the program pauses", any: [
                R`(paus\w*|stop\w*|halt\w*|suspend\w*|freez\w*)\W+${WD(4)}(at|on|when|before|after|until|once|as soon as)\W+${WD(4)}(line|lines|statement|point|place|position|instruction|step|reach\w*|hits?|gets to|arrives)`,
                R`(line|statement|point|place|position|instruction)\W+${WD(4)}(where|at which|in which|and)\W+${WD(3)}(paus\w*|stop\w*|halt\w*|suspend\w*)`,
                R`(program|execution|it|code|running|run)\W+${WD(2)}(paus\w*|stop\w*|halt\w*|suspend\w*)\W+${WD(4)}(at|on|when|there|here|before)\b`,
                R`(marker|mark\w*|flag|set|place\w*|put|point)\W+${WD(3)}(on|at|in|beside|next to)\W+${WD(3)}(line|statement|code|instruction|point)\w*\W+${WD(8)}(paus\w*|stop\w*|halt\w*|suspend\w*)`],
                not: [R`crash\w*|error message`] },
              { desc: "Used to inspect variables / check the state at that point", any: [
                R`(inspect\w*|examin\w*|check\w*|see|view\w*|look\w*|read\w*|monitor\w*|watch\w*|find out|test\w*)\W+${NA(5)}(variables?|values?|state|data|contents)`,
                R`(find|locate|identif\w*|track down|spot|debug|fix|work out)\w*\W+${NA(5)}(errors?|bugs?|faults?|mistakes?|problems?|wrong)`,
                R`step\w*\W+(through|over|into|line by line)`] },
            ],
          },
          {
            label: "(c)", type: "text", marks: 2,
            q: "Explain how a trace table helps a programmer find a logic error. [2]",
            rows: 4,
            sample: "A trace table records the value of each variable after every step of a dry run, with a column for each variable. The programmer can then see where a value first goes wrong or differs from what was expected.",
            model: "<ul><li>It records the value of every variable at each step (a column per variable, a row per step). (1)</li><li>Comparing with the values expected shows the step where a value first becomes wrong, which locates the error. (1)</li></ul>",
            points: [
              { desc: "Records the value of each variable at each step", all: [
                R`(record\w*|show\w*|track\w*|list\w*|stor\w*|keep\w*|writ\w*|log\w*|note\w*|follow\w*|display\w*|hold\w*|has|contains?)\W+${NA(6)}(variables?|values?)`,
                R`(each|every|after|per|at)\W+${WD(2)}(step|line|statement|instruction|iteration|loop|change|time|row|stage|pass|variable)|\b(a|each|every|one)\W+(columns?|rows?)\W+(for|per|each|of)\b`], win: 100 },
              { desc: "Shows where a value first goes wrong", any: [
                R`(where|when|point at which|the (line|step|row|point))\W+${NA(6)}(goes|go|went|becomes|become|turns|starts|is|are|first)\W+${NA(3)}(wrong|incorrect|unexpected|different|not what|not as)`,
                R`(compar\w*|match\w*|check\w*)\W+${NA(4)}(with|to|against|what)\W+${NA(4)}(expected|should|correct|predicted)\W+${NA(10)}(differ\w*|wrong|where|first|error|spot|find|show|different)`,
                R`(differs?|different|wrong|incorrect|unexpected)\W+${NA(4)}(from|to|than)\W+${NA(3)}(expected|what (it|they|was|should))`] },
            ],
          },
        ],
      },

      /* ---------------------------------------------------------------- 08 */
      {
        id: "sdd-08",
        style: "Context question · evaluation criteria",
        stem: "<p>A football club's analyst wrote a program from this brief.</p><ul><li><b>R1</b> Read the names and points of the 10 teams from <code>table.csv</code>.</li><li><b>R2</b> Display the name of the team with the most points.</li><li><b>R3</b> Display how many teams have fewer than 10 points.</li></ul><table><thead><tr><th>Test</th><th>Requirement</th><th>Result</th></tr></thead><tbody><tr><td>1</td><td>R1</td><td>As expected: all 10 teams stored</td></tr><tr><td>2</td><td>R2</td><td>As expected: Hearts displayed</td></tr><tr><td>3</td><td>R3</td><td>Not as expected: displayed 5, not 4</td></tr></tbody></table><p>The code for R3 is:</p><pre>SET fewPoints TO 0\nFOR i FROM 0 TO 9 DO\n   IF points[i] &lt;= 10 THEN\n      SET fewPoints TO fewPoints + 1\n   END IF\nEND FOR</pre>",
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each evaluation criterion to the question it answers. [4]",
            pairs: [
              ["Fitness for purpose", "Does the program do everything the specification asks?"],
              ["Robustness", "Does the program cope with exceptional or unexpected input without crashing?"],
              ["Usability", "Is the interface easy and intuitive for the user?"],
              ["Maintainability", "Can another programmer easily read and change the code?"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 3,
            q: "Evaluate the program's fitness for purpose. Use the brief and the test results in your answer. [3]",
            rows: 6,
            sample: "The program is not fit for purpose because it does not satisfy every requirement. R1 and R2 are met, as tests 1 and 2 worked, but R3 is wrong, because test 3 counted too many teams (5 instead of 4).",
            model: "<ul><li>Judgement: it is <b>not</b> fit for purpose, because not every requirement is met. (1)</li><li>R1 and R2 are met, with evidence from tests 1 and 2. (1)</li><li>R3 is not met: test 3 gave 5 instead of 4 (a team on exactly 10 points is counted because of &lt;=). (1)</li></ul><p>Do not drift into robustness (crashes, bad input): the question is about the specification.</p>",
            points: [
              { desc: "Judges it is not fit for purpose (not every requirement is met)", negOK: true, any: [
                R`not (fully |completely |entirely |yet |quite )?(fit|meeting|met|meet)|(does ?n.t|does not|doesn.t|fails? to|failed to|never) (fully |completely |entirely )?(meet|satisf|fulfil|match)|only (partly|partially|two|2)|not (all|every)\W+${WD(2)}(requirements?|specification|brief|tests?|r\d)|isn.t (fully )?fit|(partly|partially|mostly|almost|nearly) (fit|met|meets|meet)|(does ?n.t|does not|doesn.t) (do|achieve|deliver|carry out|perform|cover) (everything|all|every)`],
                not: [R`\b(is|are|be|looks|seems|was) (fully |completely |entirely |totally |very |really )?fit for purpose(?! (if|once|after|until|when|provided))`, R`(?<!not )(?<!n.t )(?<!fully )(?<!completely )(?<!entirely )(?<!yet )(?<!all )(?<!to )(?<!must )(?<!should )(?<!needs )(meets?|satisf\w+|fulfil\w*)\W+(every|all)\W+(the )?(requirements?|specification|brief)`, R`\bnot not\b`] },
              { desc: "R1 and R2 are met, with evidence from tests 1 and 2", all: [R`(r1|requirements? 1|tests? 1)\W+${WD(6)}(r2|requirements? 2|tests? 2|2)`, R`(met|meet|work\w*|pass\w*|correct\w*|success\w*|satisf\w*|fulfil\w*)`], win: 60,
                not: [R`\b(is|are|be|looks|seems|was) (fully |completely |entirely |totally |very |really )?fit for purpose(?! (if|once|after|until|when|provided))`, R`(?<!not )(?<!n.t )(?<!fully )(?<!completely )(?<!entirely )(?<!yet )(?<!all )(?<!to )(?<!must )(?<!should )(?<!needs )(meets?|satisf\w+|fulfil\w*)\W+(every|all)\W+(the )?(requirements?|specification|brief)`, R`(r3|requirement 3|test 3|all (three|3))\W+${WX(3, "not|n.t|isn|aren|never|fail\\w*|but|and|although")}(all )?(met|works?|worked|passes|passed|correct|successful)\b`, R`(r1|r2|requirement 1|requirement 2|test 1|test 2|tests 1)\W+${WX(6, "r3|requirement 3|test 3|but|however|whereas")}(not|isn.t|aren.t|never)\W+(met|work\w*|pass\w*|correct|success\w*|satisf\w*|fulfil\w*)`, R`(?<!not )(?<!n.t )\b(every|all)\W+(of the )?(the )?(requirements?|tests?)\W+${WD(3)}(worked|passed|met|work|pass|correct|as expected|satisfied)`] },
              { desc: "R3 is not met: test 3 counted wrongly", any: [
                R`(r3|requirement 3|test 3|requirement three)\W+${NA(8)}(wrong\w*|incorrect\w*|inaccura\w*|fail\w*|not (met|working|correct|right|satisfied|achieved|fulfilled)|too many|one too|extra|error|fault|bug|isn.t (met|working|correct|right)|5 (instead|rather|not)|five (instead|rather|not))`,
                R`(5|five)\W+(instead|rather)\W+${WD(2)}(4|four)`,
                R`(r3|requirement 3|requirement three|test 3)\W+(?:(?:do|does|did|is|was|are|were)(?:n.t| not)|never)\b(?:\W+${WD(8)}(?:not|instead|rather)\W+\w+)?`,
                R`(counts?|counted|displays?|displayed|shows?|showed|outputs?|gives?|gave)\W+${WD(4)}(too many|one (too many|more|extra)|an extra)`,
                R`(<=|less than or equal|<= 10)\W+${WD(10)}(wrong|should|instead|error|too many|extra|counts?)`],
                not: [R`(r3|requirement 3|test 3)\W+${WX(2, "not|n.t|isn|aren|never|fail\\w*|but|and|although")}(is |was |were |are )?(met|works?|worked|passes|passed|correct|successful|fine)\b`, R`\bnot\W+(wrong|incorrect|a problem|faulty|an error)`] },
            ],
          },
          {
            label: "(c)", type: "mcq", marks: 1,
            q: "Which change to the code for R3 makes the program fit for purpose?",
            opts: ["Change <= to <", "Change <= to >=", "Change FROM 0 to FROM 1", "Change points to teams"],
            a: 0,
            why: "A team on exactly 10 points does not have fewer than 10 points, so it must not be counted: the test must be < 10. Test 3 shows 5 displayed instead of 4, the extra count being the team on 10.",
          },
        ],
      },

      /* ---------------------------------------------------------------- 09 */
      {
        id: "sdd-09",
        style: "Short question · readability and maintainability",
        stem: "<p>A swimming club stores the scores of 30 pupils in an array <code>a</code>. A pupil passes with more than 50. The code below counts the passes.</p><pre>SET t TO 0\nFOR i FROM 0 TO 29 DO\nIF a[i] &gt; 50 THEN\nSET t TO t + 1\nEND IF\nEND FOR\nSEND t TO DISPLAY</pre>",
        parts: [
          {
            label: "(a)", type: "text", marks: 3,
            q: "Describe three changes that would make the code easier to read. [3]",
            rows: 5,
            sample: "Use meaningful variable names such as passCount instead of t and scores instead of a. Add comments to explain what the loop does. Indent the lines inside the loop and the IF so the structure is clear.",
            model: "<p>Any three, each applied to this code:</p><ul><li>Meaningful variable names, e.g. passCount for t, scores for a. (1)</li><li>Internal commentary explaining what the loop and selection do. (1)</li><li>Indentation of the loop body and the IF body. (1)</li><li>White space (blank lines) between sections, or a named constant instead of 50. (1)</li></ul>",
            points: [
                            { desc: "Meaningful variable names", any: [
                R`(meaningful|descriptive|sensible|appropriate|clear|clearer|better|informative|proper|longer|full)\s+(\w+\s+)?(variable\s+)?(names?|identifiers?)`,
                R`renam\w+\W+${WD(4)}(variables?|identifiers?|t\b|a\b)`,
                R`(names?|identifiers?)\W+${WD(4)}(describ\w*|say|show|explain|mean|indicate|tell|reflect)`] },
              { desc: "Comments / internal commentary", any: [
                R`(comments?|commentary|annotat\w*)\W+${WD(8)}(explain\w*|describ\w*|say\w*|state\w*|what|why|purpose|document\w*|how)`,
                R`(explain\w*|describ\w*|document\w*)\W+${WD(6)}(comments?|commentary)`,
                R`(add|put|include|write|insert|adding|with|use)\w*\W+${WD(3)}(comments?|commentary)\b`] },
              { desc: "Indentation", any: [
                R`indent\w*\W+${WD(8)}(loop|if|selection|lines?|code|body|inside|structure|block)`,
                R`(loop|if|lines?|body|inside|structure|block)\W+${WD(4)}indent`,
                R`(use|add|put|apply|with|proper|correct|consistent|good)\W+${WD(1)}indent\w*`] },
              { desc: "White space or a named constant", any: [R`white\s?space`, R`blank lines?`, R`(add|use|put|leave|insert|include|with)\w*\W+${WD(2)}(spacing|gaps?|line breaks?)`, R`(named|use|declare|a|the|as a) constants?\b`] },
            ],
          },
          {
            label: "(b)", type: "text", marks: 2,
            q: "The code is put into a function that takes the array and the pass mark as parameters. Explain how this improves maintainability. [2]",
            rows: 4,
            negOK: true,
            sample: "The function can be reused for a different pass mark or another array, so the code is not copied. A change only has to be made in the function in one place, without changing the rest of the program.",
            model: "<ul><li>Reusable: the same code can be called with a different pass mark or array, so no duplicate copies. (1)</li><li>A change is needed in only one place / each sub-program can be changed or tested separately without affecting the rest. (1)</li></ul>",
            points: [
              { desc: "Reusable with different values: no duplicated code", negOK: true, any: [
                R`(with|for|using|call\w*|pass\w*)\W+${WD(3)}(different|another|any|other|new|various)\W+${WD(3)}(marks?|values?|arrays?|subjects?|tests?|classes|class|thresholds?|data|inputs?|parameters?|arguments?)`,
                R`(function|code|sub-?program|module|procedure|it|they)\W+${WD(4)}re-?us\w+`, R`\b(can|could|may|be|is|are|easily|become|makes? it)\W+(\w+\W+)?re-?us(ed|able|e)\b|\b(code|function|it|they|sub-?program)\W+(is|are|becomes?|be)\W+(\w+\W+)?re-?usable\b|\bmore re-?usable\b|re-?usable (code|function|sub-?program|module)`, R`(can|could|may|be|is|are|gets?)\W+${WD(2)}called\W+${WD(4)}(again|more than once|several times|twice|many times|repeatedly|over and over|with different)`,
                R`(no|avoid\w*|without|not)\W+${WD(3)}(duplicat\w*|repeat\w*|cop(y|ies|ied)|rewrit\w*|writ\w+ (it )?again)`,
                R`not (have|need) to (copy|rewrite|repeat|write)`],
                not: [R`(not|never|cannot|can.t|n.t|no)\W+${WD(2)}(reus\w*|re-us\w*)`, R`(faster|quicker|less memory|uses less|runs faster)`] },
              { desc: "A change is made in one place / sub-programs independent", negOK: true, any: [
                R`(change|edit|alter|updat|amend|fix|modif)\w*\W+${NA(6)}(one place|only (one|the)|single|just (one|the)|in the function|without (affecting|changing|breaking)|separately|independent\w*|not affect|rest of)`,
                R`(each|every|the) (sub-?program|module|function|part)s?\W+${WD(6)}(separately|independent\w*|on (its|their) own|alone)`,
                R`(only|just) (needs?|has|have) to be (changed|edited|updated|made|fixed)`, R`(fix|change|update)\w*\W+${WD(4)}(once|one time)\b`],
                not: [R`(faster|quicker|less memory|uses less|runs faster)`] },
            ],
          },
          {
            label: "(c)", type: "mcq", marks: 1,
            q: "The number 50 is replaced by a named constant, <code>PASS_MARK</code>. What is the main benefit for maintainability?",
            opts: ["The program runs faster", "If the pass mark changes, only the constant's declaration needs editing", "The program uses less memory", "The loop is no longer needed"],
            a: 1,
            why: "A named constant is declared once, so a new pass mark is a one-line edit instead of finding every 50. It does not change speed, memory or the need for a loop.",
          },
        ],
      },

      /* ---------------------------------------------------------------- 10 */
      {
        id: "sdd-10",
        style: "Context question · design, refinement and test data",
        stem: "<p>A charity shop stores the whole-pound price of each of its 25 donated items in an array <code>price()</code>, read from <code>stock.csv</code>. A step <code>find_cheapest</code> will find the <b>position</b> of the cheapest item. The manager says every price is a whole number of pounds from 1 to 40 inclusive.</p>",
        parts: [
          {
            label: "(a)", type: "code", marks: 2,
            q: "Show the data flow for two sub-programs: <code>find_cheapest</code> and <code>count_cheap</code>, which counts the items that cost less than 5. [2]",
            rows: 4,
            sample: "find_cheapest  IN: price()  OUT: cheapPos\ncount_cheap  IN: price()  OUT: count",
            model: "<ul><li>find_cheapest: IN price(); OUT cheapPos (the position). (1)</li><li>count_cheap: IN price(); OUT count. (1)</li></ul><p>No other parameters: neither step needs the item names, so passing them in would be an unnecessary parameter.</p>",
            points: [
              { desc: "find_cheapest: IN price(), OUT a position", any: [
                R`find.?cheapest\W+(in\w*\W+)?price\w*\W+(and\W+)?out\w*\W*(?!\w*(count|total|num))(cheap\w*|position|pos\b|\w*pos\b|index|min\w*|lowest\w*)`,
                R`find.?cheapest\W*\(\W*price\w*\W*\)\W*(->|=>|→|returns?|gives?|outputs?|out)\W*(?!\w*(count|total|num))(cheap\w*|position|pos\b|\w*pos\b|index|min\w*|lowest\w*)`,
                R`in\w*:?\W*price\w*\W+out\w*:?\W*(position|cheap\w*|pos\b|index)\W+(for|of|from|in)\W+find.?cheapest`], not: [R`\bitems?\s*\(`] },
              { desc: "count_cheap: IN price(), OUT a count", any: [
                R`count.?cheap\w*\W+(in\w*\W+)?price\w*\W+(and\W+)?out\w*\W*(\w*count\w*|\w*total\w*|number\w*|num\w*|how ?many)`,
                R`count.?cheap\w*\W*\(\W*price\w*\W*\)\W*(->|=>|→|returns?|gives?|outputs?|out)\W*(\w*count\w*|\w*total\w*|number\w*|num\w*|how ?many)`,
                R`in\w*:?\W*price\w*\W+out\w*:?\W*(\w*count\w*|\w*total\w*|number\w*|num\w*|how ?many)\W+(for|of|from|in)\W+count.?cheap`] },
            ],
          },
          {
            label: "(b)", type: "code", marks: 4,
            q: "Using a design technique, show the refinement of <code>find_cheapest</code>. [4]",
            rows: 8,
            sample: "1 SET cheapPos TO 0\n2 FOR i FROM 1 TO 24 DO\n3    IF price[i] < price[cheapPos] THEN\n4       SET cheapPos TO i\n5    END IF\n6 END FOR",
            model: "<pre>1 SET cheapPos TO 0\n2 FOR i FROM 1 TO 24 DO\n3    IF price[i] &lt; price[cheapPos] THEN\n4       SET cheapPos TO i\n5    END IF\n6 END FOR</pre><ul><li>Initialise the position to the first item (0), not a guessed price. (1)</li><li>A loop over the remaining items. (1)</li><li>A selection comparing this price with the cheapest so far, using &lt;. (1)</li><li>Update the position (not the price) to the current one. (1)</li></ul>",
            points: [
              { desc: "Starts with the first item as the cheapest", any: [R`(\w*(pos|min|cheap|best|low|index)\w*)\s*(=|:=|<-|\bto)\s*(0\b|1\b|price\s*[\[(]\s*[01]\s*[\])]|first)`, R`(first|1st)\W+${WD(5)}(cheap\w*|lowest|minimum|smallest)`, R`\w*(pos|min|cheap|best|low|index)\w*\W+(starts?|begins?|is set|is initiali[sz]ed|initiali[sz]ed)\w*\W+(at|to|as|with|from)\W+(0|1|zero|the first)\b`] },
              { desc: "A loop over the other items", any: [LOOP] },
              { desc: "Compares the price with the cheapest so far (<)", any: [R`\b(if|when|elif)\b\W*[\w\[\]().]+\s*<\s*[\w\[\]().]+`, R`\b(if|when|elif)\b.{0,40}(less than|lower than|cheaper than|smaller than)`] },
              { desc: "Updates the cheapest position to the current one", any: [R`(<|less than|lower than|cheaper|smaller)\W.{0,80}\w*(pos|min|cheap|best|low|index)\w*\s*(=|:=|<-|\bto\b)\s*(i\b|j\b|k\b|index\b|position\b|this\b|current\b|count\b)`] },
            ],
          },
          {
            label: "(c)", type: "text", marks: 2,
            q: "State one item of <b>extreme</b> test data and one item of <b>exceptional</b> test data for the manager's prices. [2]",
            rows: 3,
            sample: "Extreme test data: 1 or 40. Exceptional test data: 41, which should be rejected.",
            model: "<ul><li>Extreme: 1 or 40 (the boundaries of the valid range). (1)</li><li>Exceptional: any invalid price, e.g. 0, 41, -5, 12.5 or a word such as \"cheap\". (1)</li></ul>",
            points: [
              { desc: "Extreme: 1 or 40", any: [R`extreme[\s:,(-]+(?:[a-z]\w*[\s:,(]+){0,5}\b(1|40)\b`, R`\b(1|40)\b[\s,)]+(?:[a-z]\w*[\s,]+){0,4}(is|are|as|for) extreme`] },
              { desc: "Exceptional: an invalid price such as 0, 41, a negative, a decimal or text", any: [
                R`exceptional[\s:,(-]+(?:[a-z]\w*[\s:,(]+){0,5}(\b0\b|\b4[1-9]\b|\b[5-9]\d\b|\b\d{3,}\b|-\s?\d+|\d+\.\d+|letters?|text|words?|abc|negative|decimal|banana)`,
                R`(\b0\b|\b4[1-9]\b|\b[5-9]\d\b|\b\d{3,}\b|-\s?\d+|\d+\.\d+|letters?|text|words?|negative|decimal)[\s,)]+(?:[a-z]\w*[\s,]+){0,4}(is|are|as|for) exceptional`] },
            ],
          },
        ],
      },
    ],
  };

  /* A claim turned round ("is not", "does not") earns nothing, unless the model answer itself needs a negative.
     (The engine's own negation check switches itself off for a part whose model answer contains a word such as
     "wrong", so this guard stays.) */
  const TURNED = R`\b(is|are|can|will|does|do|has|have|would|should) not\b`;
  /* piles: five one-word items in a row ("agile, adaptive, team, change, app,") or "is" padding every other word is a word list, not an answer */
  const PILE = R`(?:[\w()]+[,;]\s+){5,}|(?:\b(?:is|are)\b\W+(?:\w+\W+){1,2}){4,}|(?:\b(?!(?:the|a|an|and|or|but|so|because|that|this|these|those|it|its|is|are|was|were|be|been|to|of|in|on|at|by|for|with|from|as|if|then|than|when|which|who|they|their|them|can|could|will|would|should|do|does|did|has|have|had|not|no|each|every|into|about|also|just|only|where|what|how|whether|you|we|i|there)\b)[\w()]+[ ]+){8,}`;
  B.sdd.questions.forEach((q) => q.parts.forEach((p) => {
    if (p.type === "text") p.points.forEach((pt) => { pt.not = (pt.not || []).concat(PILE); });
  }));
  B.sdd.questions.forEach((q) => q.parts.forEach((p) => {
    if (p.type !== "text" || /\bnot\b|n't/i.test(p.sample)) return;
    p.points.forEach((pt) => { if (!pt.negOK) pt.not = (pt.not || []).concat(TURNED); });
  }));
})();
