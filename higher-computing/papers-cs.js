/* Past-paper practice: Computer systems. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HCP_BANK = window.HCP_BANK || {});
  const R = String.raw;
  /* "not/never/cannot ... <term>" within a few words: used in `not` guards on points whose wording is allowed to contain a negative */
  const NB = (t) => "\\b(?:not|never|no longer|cannot|can't|isn't|aren't|doesn't|don't|won't)\\s+(?:[a-z']+\\s+){0,3}(?:" + t + ")";

  /* ---- small SVG helpers ---- */
  const INK = "#1d1a14", ACC = "#1f5fa8", PAPER = "#fffaf0", FILL = "#e9f0fa";
  const svg = (w, h, label, body) =>
    `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><rect width="${w}" height="${h}" fill="${PAPER}"/>${body}</svg>`;
  const box = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill || "none"}" stroke="${INK}" stroke-width="1.8"/>`;
  const txt = (x, y, s, size, anchor, weight, font) =>
    `<text x="${x}" y="${y}" font-size="${size || 13}" text-anchor="${anchor || "middle"}"${weight ? ` font-weight="${weight}"` : ""} fill="${INK}"${font ? ` font-family="${font}"` : ""}>${s}</text>`;
  const line = (x1, y1, x2, y2, col, sw) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col || INK}" stroke-width="${sw || 2}"/>`;
  const tri = (pts) => `<polygon points="${pts}" fill="${ACC}"/>`;

  /* Q2 figure: the stored 24-bit number */
  const bitCells = (s, x0, y, cw, fill) =>
    s.split("").map((b, i) => box(x0 + i * cw, y, cw, 26, fill) + txt(x0 + i * cw + cw / 2, y + 18, b, 13, "middle", 600, "monospace")).join("");
  const fig2 = svg(580, 120,
    "A 24-bit floating-point number laid out in three fields. The sign bit is 0. The 15-bit mantissa is 110100000000000. The 8-bit exponent, stored in two's complement, is 00000101.",
    bitCells("0", 12, 42, 26, FILL) + bitCells("110100000000000", 48, 42, 18, "#fff") + bitCells("00000101", 330, 42, 22, FILL) +
    txt(25, 30, "sign", 12) + txt(183, 30, "mantissa (15 bits)", 12) + txt(418, 30, "exponent (8 bits, two's complement)", 12) +
    txt(25, 90, "1 bit", 12) + txt(183, 90, "digits after the binary point", 12) + txt(418, 90, "stored as two's complement", 12));

  /* Q6 figure: processor, memory and three buses */
  const fig6 = svg(560, 230,
    "Block diagram. A processor box on the left contains an instruction register, a decoder and an ALU. A main memory box on the right holds memory locations. Three buses join them. Bus P has an arrowhead only towards the memory. Bus Q has arrowheads at both ends. Bus R is drawn as several thin lines labelled read, write and clock.",
    box(20, 20, 180, 190, FILL) + txt(110, 42, "PROCESSOR", 14, "middle", 700) +
    box(40, 60, 140, 36, "#fff") + txt(110, 83, "Instruction register", 12) +
    box(40, 108, 140, 36, "#fff") + txt(110, 131, "Decoder", 12) +
    box(40, 156, 140, 36, "#fff") + txt(110, 179, "ALU", 12) +
    box(360, 20, 180, 190, FILL) + txt(450, 42, "MAIN MEMORY", 14, "middle", 700) +
    [0, 1, 2, 3, 4].map((i) => box(380, 58 + i * 30, 140, 24, "#fff") + txt(450, 75 + i * 30, "location " + i, 12)).join("") +
    line(200, 70, 350, 70, ACC, 3) + tri("360,70 348,64 348,76") + txt(280, 60, "Bus P", 13, "middle", 700) +
    line(210, 120, 350, 120, ACC, 3) + tri("200,120 212,114 212,126") + tri("360,120 348,114 348,126") + txt(280, 110, "Bus Q", 13, "middle", 700) +
    [150, 162, 174].map((y) => line(200, y, 360, y, ACC, 1.6)).join("") + txt(280, 146, "Bus R", 13, "middle", 700) +
    txt(280, 193, "read   write   clock", 12, "middle", 400));

  B.cs = {
    intro:
      "<p>Computer systems is worth about 10-14 of the 80 marks, all in Section 1, and it is not part of the assignment. These questions are original and in the style of recent papers; the bank is deliberately larger than one paper's share so that you can drill every topic: two's complement, floating point, character sets, graphics, the fetch-execute cycle and performance, environmental impact of intelligent systems, the Computer Misuse Act, tracking cookies and denial of service, and encryption with signatures and certificates.</p>" +
      "<p>The 2025 course report: candidates gave the benefit of a <b>digital certificate</b> when asked about a <b>digital signature</b>; recognised a <b>vector</b> image but did not use the technical terms (<b>objects, attributes, resolution independent</b>); and named a bus without saying what travels on it. Show your working on the number questions, and say <em>why</em> in every explain question.</p>",
    questions: [
      /* ------------------------------------------------------------ 01 */
      {
        id: "cs-01",
        style: "Calculation · two's complement and range",
        stem: "<p>A ferry's engine-room sensor stores each temperature reading, in whole degrees Celsius, as an 8-bit two's complement number. The place values are -128, 64, 32, 16, 8, 4, 2, 1.</p>",
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "What denary number is stored as 10110100? [1]",
            opts: ["-76", "76", "-52", "180", "-180"], a: 0,
            why: "The leftmost bit is worth -128: -128 + 32 + 16 + 4 = -76. Reading it as an unsigned number gives 180, which is not two's complement." },
          { label: "(b)", type: "num", marks: 2, tol: 0, q: "A reading of -38 degrees must be stored. Write the 8-bit two's complement binary number for -38. [2]",
            a: 11011010, bits: 8,
            why: "38 = 00100110. Invert: 11011001. Add 1: 11011010. Check: -128 + 64 + 16 + 8 + 2 = -38." },
          { label: "(c)", type: "num", marks: 1, tol: 0, unit: "bits", q: "A deep-sea probe must store -300. State the smallest number of bits that two's complement needs to store -300. [1]",
            a: 10,
            why: "9 bits reach only -256 to 255. 10 bits reach -512 to 511, which includes -300, so 10 bits." },
          { label: "(d)", type: "mcq", marks: 1, q: "State the range of whole numbers that can be stored in 12-bit two's complement. [1]",
            opts: ["-2048 to 2047", "-2047 to 2048", "-4096 to 4095", "0 to 4095", "-1024 to 1023"], a: 0,
            why: "-2^11 to 2^11 - 1 = -2048 to 2047. One more negative than positive, because zero takes one of the non-negative patterns." },
          { label: "(e)", type: "text", marks: 2, rows: 4,
            q: "Explain why 8-bit two's complement can store -128 but the largest positive number is only 127. [2]",
            points: [
              { desc: "Half of the 256 patterns (those starting with 1) are negative, giving 128 negative values", any: [R`(?:half|128|one hundred and twenty.eight)\b.{0,70}(?:negative|(?:start|begin)\w* with (?:a )?1|leftmost|sign)`, R`(?:negative|(?:start|begin)\w* with (?:a )?1|leftmost bit is (?:a )?1).{0,70}(?:half|128)`], not: [R`-127|(?:one )?more positive|largest positive (?:number |value )?(?:is |= ?)?128|positive\W+(?:\w+\W+){0,4}is 128\b`] },
              { desc: "Zero takes one of the patterns starting with 0, leaving only 127 for positive numbers", any: [R`(?:zero|00000000|\b0\b).{0,80}(?:positive|non.?negative|(?:start|begin)\w* with (?:a )?0|leftmost bit is (?:a )?0|127)`, R`(?:positive|127).{0,80}(?:zero|00000000)`, R`(?:zero|\b0\b)\W+(?:\w+\W+){0,4}(?:uses?|takes?|taken|occup\w+|one of)\W+(?:\w+\W+){0,5}(?:patterns?|values?|combinations?|positive|non.?negative)`] },
            ],
            sample: "Half of the 256 bit patterns, the ones that start with 1, are used for negative numbers, so 128 negative values can be stored. Zero takes one of the patterns that start with 0, so only 127 are left for positive numbers.",
            model: "<ul><li>Half the patterns (128 of 256) start with 1 and are negative, so -128 is the most negative (1)</li><li>Zero uses one of the 128 patterns that start with 0, so the positives stop at 127 (1)</li></ul>" },
        ],
      },
      /* ------------------------------------------------------------ 02 */
      {
        id: "cs-02",
        style: "Calculation and explanation · floating point",
        stem: "<p>A weather-station logger stores real numbers in 24 bits: 1 sign bit (0 means positive), a 15-bit mantissa and an 8-bit exponent in two's complement. The mantissa is normalised. The number stored in one memory location is shown.</p>",
        figure: fig2,
        parts: [
          { label: "(a)", type: "num", marks: 2, tol: 0, q: "Convert the stored number to denary. [2]",
            a: 26,
            why: "Mantissa 0.1101 (the trailing zeros do not matter). Exponent 00000101 = 5, so move the point 5 places right: 11010 = 16 + 8 + 2 = 26." },
          { label: "(b)", type: "num", marks: 1, tol: 0, q: "The logger records 52.5. In binary this is 110100.1. State the exponent, as a denary number, when 52.5 is stored in normalised form. [1]",
            a: 6,
            why: "Move the point to sit before the first 1: 0.1101001 x 2^6. The point moves 6 places left, so the exponent is 6." },
          { label: "(c)", type: "text", marks: 2, rows: 4,
            q: "The designers change the layout so that more of the 24 bits are used for the exponent and fewer for the mantissa. Explain the effect on the numbers that can be stored. [2]",
            points: [
              { desc: "More exponent bits: a greater range (larger and smaller numbers can be stored)", all: [R`exponent|(?:binary |decimal )?point\W+(?:\w+\W+){0,4}(?:mov\w+|shift\w+|float\w*)|(?:mov\w+|shift\w+)\W+(?:\w+\W+){0,3}point`, R`\brange\b|larger (?:and|or) smaller|bigger (?:and|or) smaller|very (?:large|big|small)|larger numbers|bigger numbers|smaller numbers|(?:larger|bigger|greater) (?:values|magnitudes)`], win: 120, not: [R`exponent(?:\s+[a-z]+){0,4}\s+(?:more|greater|higher|better|increases?|increased|improves?)\s+(?:\w+\s+)?(?:precis|accura)`, R`reduc\w+\s+(?:the\s+)?range|range\s+(?:is\s+|gets\s+|becomes\s+)?(?:reduced|smaller|lower|decreas\w+|shrinks?)`, R`(?:mantissa|significant)(?:\s+[a-z]+){0,5}\s+(?:larger|greater|bigger|wider|increases?)\s+(?:range|numbers)`] },
              { desc: "Fewer mantissa bits: fewer significant digits, so less precision", all: [R`mantissa|significant|digits|decimal places`, R`less (?:precis|accura)|lower (?:precision|accuracy)|(?:precision|accuracy)(?: \w+){0,2} (?:lower|reduced?|less|drops?|decreas\w+|falls?|worse|suffers?|goes down|is smaller|are smaller|is lost)|fewer (?:significant )?(?:digits|figures|decimal)|(?:reduc|lose|loses|lost|loss)\w*(?: \w+){0,3} (?:precision|accuracy)|less detail|(?:less|not as|fewer) (?:\w+ ){0,2}(?:precise|accurate)`], win: 120, not: [R`(?:exponent)(?:\s+[a-z]+){0,4}\s+(?:less|lower|fewer|decreas\w+)\s+(?:precis|accura)`, R`mantissa(?:\s+[a-z]+){0,5}\s+(?:larger|greater|bigger|wider)\s+range`, R`(?:precision|accuracy)\s+(?:and\s+\w+\s+)?(?:both\s+)?(?:increase|improve|rise)`] },
            ],
            sample: "More exponent bits means the point can move further, so there is a greater range of very large and very small numbers. Fewer mantissa bits means fewer significant digits are stored, so there is less precision.",
            model: "<ul><li>More bits for the exponent gives a greater range (1)</li><li>Fewer bits for the mantissa gives fewer significant digits, so less precision (1)</li></ul><p>Use the exact words range and precision.</p>" },
          { label: "(d)", type: "text", marks: 2, rows: 4,
            q: "The logger stores 0.1 as a floating-point number. Explain why the stored value is only approximate. [2]",
            points: [

              { desc: "0.1 is a recurring fraction in binary that never ends", negOK: true, any: [R`(?:recurr\w+|repeating|infinite|endless) (?:\w+ ){0,2}(?:fraction|number|binary|decimal|pattern|sequence|digits?|bits?)`, R`(?:it|0\.1|fraction|number|value|binary|digits) (?:\w+ ){0,2}(?:repeats?|recurs?|is recurring|is repeating)`, R`(?:never|doesn't|does not|can't|cannot|won't|will not) (?:end|ends|terminat\w+|stop|stops|finish\w*|reach\w*)`, R`(?:for ever|forever|on and on|without end|indefinitely|goes on)`, R`(?:cannot|can't|not|never) (?:be )?(?:written|stored|represented|shown|expressed) (?:exactly|precisely|accurately)`, R`(?:cannot|can't|not|never) (?:be )?(?:written|stored|represented|shown|expressed) (?:\w+ ){0,3}(?:binary|bits)`], not: [R`(?:not|never|isn't|doesn't) (?:\w+ ){0,2}(?:recurr\w+|repeat\w*|infinite|endless)`, R`\bfinite\b`] },
              { desc: "The mantissa has a limited number of bits, so the value is cut off or rounded", negOK: true, any: [R`(?<!un)(?<!in)(?:limited|fixed|finite) (?:number of )?(?:bits|digits|space|size|width|storage)`, R`(?:only|just) (?:has |have )?(?:a )?(?:\d+|few|limited|fixed|finite|set|certain) (?:number of )?(?:bits|digits)`, R`(?:only|just) (?:\w+ ){0,3}(?:\d+|few|limited|fixed|finite|set|certain) (?:bits|digits)`, R`(?:not|n't) (?:\w+ ){0,2}enough (?:\w+ )?(?:bits|digits|space|room)`, R`(?:not enough|too few|run out of|runs out of|cannot fit|can't fit|does not fit|doesn't fit|won't fit|cut off|truncat\w+|rounded|rounding|round it) (?:\w+ ){0,2}(?:bits|digits|space|mantissa|fit|off|value)`, R`(?:bits|digits|mantissa|space|memory|storage)\W+(?:\w+\W+){0,2}(?:run out|runs out|limited|fixed|cut off|rounded|truncated|finite)`, R`(?:room|space) for (?:only )?(?:\d+|a few|limited)`], not: [R`(?:unlimited|infinite|endless) (?:number of )?(?:bits|digits|space|room)|(?<!not )(?<!n't )(?:has|have|had) (?:plenty of|enough) (?:bits|digits|space|room)`, NB(R`cut off|rounded|truncat\w+|approximate`),  R`(?:more|extra|many) bits (?:would|can|could|will) (?:fix|solve|make it exact)(?! no)`] },
            ],
            sample: "In binary 0.1 is a recurring fraction, it repeats for ever. The mantissa only has a limited number of bits, so the digits are cut off and the stored value is approximate.",
            model: "<ul><li>0.1 repeats for ever in binary (1)</li><li>The mantissa has a fixed number of bits, so the repeating digits are cut off and the value is rounded (1)</li></ul>" },
        ],
      },
      /* ------------------------------------------------------------ 03 */
      {
        id: "cs-03",
        style: "Calculation and description · character sets",
        stem: "<p>A library stores the text of its book descriptions as characters. One description is 250 characters long. Extended ASCII uses 8 bits per character.</p>",
        parts: [
          { label: "(a)", type: "num", marks: 1, tol: 0, q: "State how many different characters can be represented using 8 bits. [1]", a: 256,
            why: "2^8 = 256 different codes." },
          { label: "(b)", type: "num", marks: 1, tol: 0, unit: "bytes", q: "The library changes to a 32-bit Unicode character set. Calculate the storage, in bytes, needed for the 250-character description. [1]", a: 1000,
            why: "32 bits = 4 bytes per character. 250 x 4 = 1000 bytes. (In extended ASCII it was 250 bytes.)" },
          { label: "(c)", type: "text", marks: 2, rows: 4,
            q: "Describe one advantage and one disadvantage of using Unicode instead of extended ASCII. [2]",
            points: [

              { desc: "Advantage: far more characters, so any writing system, symbols or emoji can be stored", group: "adv", any: [R`(?:more|many|wider|larger|greater|bigger|thousands of|over a million|a million) (?:\w+ )?(?:characters?|symbols?|languages?|alphabets?|scripts?|writing systems?)`, R`(?:characters?|symbols?|letters|text) (?:\w+ ){0,2}(?:from|of|in) (?:\w+ ){0,2}(?:languages?|alphabets?|scripts?|countries)`, R`(?:any|every|all|other|different|foreign|world) (?:\w+ )?(?:languages?|alphabets?|scripts?|writing systems?)`, R`(?:such as|like|and|or|including|store|stores|stored|represent\w*|support\w*|include\w*) (?:\w+ )?emoji`, R`65.?536 (?:different )?(?:characters|codes|symbols)`], not: [R`(?:fewer|less|smaller number of|not as many|limited) (?:\w+ ){0,2}(?:characters?|symbols?|languages?)`, R`unicode (?:\w+ ){0,3}(?:smaller|less|fewer)`, R`(?:uses?|takes?|needs?|requires?) (?:less|fewer|smaller) (?:storage|memory|bits|bytes|space)`] },
              { desc: "Disadvantage: each character needs more storage (2 or 4 times), so files are bigger and slower to send", group: "dis", any: [R`(?:more|extra|larger|bigger|greater|twice|double|two times|four times|2|4) (?:\w+ ){0,2}(?:\w+ )?(?:storage|memory|bits|bytes|space|file size|disk)`, R`(?:files?|text|data|documents?) (?:\w+ )?(?:bigger|larger|take (?:up )?more|take up more)`, R`(?:slower|longer) (?:\w+ ){0,3}(?:transmit|send|download|transfer)`, R`(?:bigger|larger) (?:files?|documents?)`], not: [R`(?:uses?|takes?|needs?|requires?) (?:less|fewer|smaller) (?:storage|memory|bits|bytes|space)`, R`(?:less|smaller|fewer) (?:storage|memory|bits|bytes|space|files?)`] },
            ],
            sample: "An advantage is that Unicode has many more characters, so text in any language or emoji can be stored. A disadvantage is that each character needs more bits, so files take up more storage.",
            model: "<ul><li>Advantage: many more characters, so every writing system, symbols and emoji (1)</li><li>Disadvantage: 2 or 4 times as many bits per character, so larger files / more transmission time (1)</li></ul><p>One of each: two advantages earn 1.</p>" },
        ],
      },
      /* ------------------------------------------------------------ 04 */
      {
        id: "cs-04",
        style: "Calculation and explanation · bit-mapped graphics",
        stem: "<p>A school photographs its sports day and stores each photograph as an uncompressed bit-mapped graphic. Photograph A is 800 pixels wide and 600 pixels high with 24-bit colour depth.</p>",
        parts: [
          { label: "(a)", type: "num", marks: 2, tol: 0, unit: "bytes", q: "Calculate the file size of photograph A in bytes. [2]", a: 1440000,
            why: "800 x 600 = 480 000 pixels. 24 bits = 3 bytes per pixel. 480 000 x 3 = 1 440 000 bytes." },
          { label: "(b)", type: "num", marks: 1, tol: 0, q: "Photograph B uses 12-bit colour depth. State the number of different colours it can contain. [1]", a: 4096,
            why: "2^12 = 4096 colours." },
          { label: "(c)", type: "text", marks: 2, rows: 4,
            q: "The school doubles the number of pixels both across and down in photograph A. Describe the effect on the image and on the file size. [2]",
            points: [

              { desc: "The file size increases (four times as many pixels)", any: [R`\b(?:four|4) times (?:as )?(?:\w+ ){0,2}(?:big|large|much|many|more)|quadruple|four.?fold`, R`(?:file|size|storage|memory)(?: \w+){0,3} (?:is |will be |becomes |gets |would be )?(?:bigger|larger|increas\w+|grow\w*|greater|higher)`, R`(?:bigger|larger|increased?|greater) (?:file|size|storage)`, R`take\w* up more`, R`more (?:storage|memory|space|bytes)`], not: [R`(?:file|size|storage|memory)(?: \w+){0,4} (?:smaller|decreas\w+|reduc\w+|shrinks?|halves|half|same|unchanged|stays)`, R`(?:smaller|decreas\w+|reduc\w+|shrunk|half|same|unchanged) (?:\w+ ){0,3}(?:file|size|storage|memory)`, R`(?:two|2|double|twice|2x) (?:times )?(?:as )?(?:big|large|much)(?! ?(?:in each|across|and down))`] },
              { desc: "The image has more detail / is sharper (higher resolution)", any: [R`(?:more|greater|better|higher|extra|finer|increased) (?:\w+ ){0,2}(?:detail|quality|sharp\w*|clear\w*|crisp\w*|resolution)`, R`(?:sharper|clearer|crisper|finer|less pixelated|more detailed|higher quality|better quality)`, R`(?:detail|quality|sharpness|image|resolution)\W+(?:\w+\W+){0,3}(?:improve\w*|better|increase\w*)`], not: [R`(?:less|lower|worse|poorer|reduced?|fewer|blurr\w+|pixelated)\s+(?:\w+\s+){0,1}(?:detail|quality|resolution|sharp\w*)`, R`(?:detail|quality|resolution|sharpness)\s+(?:\w+\s+){0,2}(?:decreas\w+|reduc\w+|drop\w*|lower|worse|suffers?)`] },
            ],
            sample: "The image has a higher resolution so it shows more detail and is sharper. There are four times as many pixels, so the file size is much larger.",
            model: "<ul><li>More pixels, so the file is bigger (four times) (1)</li><li>Higher resolution: more detail / sharper image (1)</li></ul>" },
        ],
      },
      /* ------------------------------------------------------------ 05 */
      {
        id: "cs-05",
        style: "Scenario question · vector and bit-mapped graphics",
        stem: "<p>A football league designs a crest. It will be printed on a small badge and also on a stadium banner several metres wide. The designer stores the crest as a vector graphic.</p>",
        parts: [
          { label: "(a)", type: "match", marks: 4, q: "Match each term to its meaning.",
            pairs: [
              ["Object", "A shape such as a circle, line or polygon in a vector graphic"],
              ["Attribute", "A property of an object, such as its fill colour or line width"],
              ["Pixel", "A single dot of colour in a bit-mapped graphic"],
              ["Colour depth", "The number of bits used to store the colour of each pixel"],
            ] },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain why a vector graphic is a suitable choice for a crest that will be used at very different sizes. [2]",
            points: [

              { desc: "The graphic is stored as objects with attributes (shapes), which are recalculated at the new size", negOK: true, all: [R`objects?|shapes?|attributes?|mathematic\w+|co-?ordinates?|calculat\w+|formulae|equations?`, R`recalculat\w+|redrawn|redraw\w*|re-?calculat\w+|recreat\w+|resiz\w+|scal\w+|enlarg\w+|bigger|larger|any size|new size|stretch\w*`], win: 140, not: [NB(R`objects?|shapes?|attributes?|mathematic\w+|co-?ordinates?`), R`(?:bit.?map\w*|pixels?|raster)(?:\s+(?!vector|but|whereas|while|unlike|and|or)[a-z']+){0,5}\s+(?:recalculat\w+|are objects|are shapes|made of (?:objects|shapes))`] },
              { desc: "It is resolution independent: it stays sharp and does not become pixelated when enlarged", negOK: true, any: [R`resolution.independent`, R`(?:stay|stays|remain|remains|keep|keeps|retain|retains)\w* (?:\w+ ){0,2}(?:sharp|crisp|clear|smooth|same quality|its quality|quality)`, R`(?:without|no|not) (?:\w+ ){0,2}(?:loss of quality|losing quality|lose quality|loss of detail|pixelat\w+|blur\w*|jagged|blocky|distort\w+)`, R`(?:does not|doesn't|won't|will not|never) (?:become |go |get |look )?(?:\w+ )?(?:pixelated|blurry|blocky|jagged)`, R`(?:don't|do not|doesn't|does not|won't|will not|never|can't|cannot)\w* (?:\w+ )?(?:lose|lost|loss|degrade|drop)\w* (?:\w+ )?(?:quality|sharpness|detail|clarity)`, R`quality (?:is |stays |remains )?(?:kept|the same|unchanged|retained)`], not: [R`(?:bit.?map\w*|pixels?|raster|photos?)(?:\s+(?!vector|but|whereas|while|unlike|and|or)[a-z']+){0,6}\s+(?:stay|stays|remain|remains|keeps?|retains?|are|is)\s+(?:\w+\s+)?(?:sharp|crisp|clear|smooth|resolution.independent|same quality|unchanged)`, R`(?:bit.?map\w*|pixels?|raster)(?:\s+(?!vector|but|whereas|while|unlike|and|or)[a-z']+){0,4}\s+(?:without|don't|do not|doesn't|does not|won't|will not|never|can't|cannot)\s+(?:\w+\s+)?(?:pixelat\w+|blur\w*|lose|lost|loss|blocky)`, R`vector\w*(?:\s+(?!bit.?map|but|whereas|while|unlike)[a-z']+){0,4}\s+(?:becomes?|go(?:es)?|gets?|looks?|are|is)\s+(?:\w+\s+)?(?:pixelated|blurry|blocky|jagged|poor|worse)`, R`(?:vector\w*|it|they|this|graphic)\s+(?:is|are)\s+not\s+resolution.independent`, R`(?:enlarg\w+|bigger|larger|zoom\w*)(?:\s+[a-z']+){0,4}\s+(?:becomes?|goes|gets|looks?)\s+(?:\w+\s+)?(?:pixelated|blurry|blocky|jagged)(?!.{0,40}(?:bit.?map|raster))`] },
            ],
            sample: "A vector graphic is stored as objects with attributes, so when the crest is made bigger the shapes are recalculated at the new size. It is resolution independent, so it stays sharp and keeps its quality however big it is made.",
            model: "<ul><li>Stored as objects with attributes, so the shapes are recalculated for the new size (1)</li><li>Resolution independent: stays sharp at any size, no pixelation (1)</li></ul><p>“It looks smoother” earns nothing: use the technical terms.</p>" },
          { label: "(c)", type: "text", marks: 2, rows: 4,
            q: "The league wants to recolour the star on the crest. Explain why this is easier to do in a vector graphic than in a bit-mapped graphic. [2]",
            points: [

              { desc: "In a vector graphic the star is a separate object that can be selected on its own", any: [R`(?:star|object|shape)\W+(?:\w+\W+){0,8}(?:select\w*|separate\w*|individual\w*|on its own|own|edit\w* (?:by itself|alone|separately))`, R`(?:select\w*|edit\w*|click\w*)\W+(?:\w+\W+){0,6}(?:object|shape|star|separately|individual\w*|one object)`], not: [R`(?:bit.?map\w*|pixels?)(?:\s+(?!vector|but|whereas|while|unlike|and|or)[a-z']+){0,4}\s+(?:are|is|has|have|can be|stays?)\s+(?:(?!no\b|not\b)\w+\s+)?(?:separate|individual|objects?|selected)`] },
              { desc: "Its fill colour attribute is changed without affecting the rest, whereas a bit-mapped graphic is just pixels (every pixel of the star must be recoloured)", negOK: true, any: [R`(?:attribute|fill|colour|color|property)\W+(?:\w+\W+){0,8}(?:change\w*|alter\w*|edit\w*|updat\w*|set)`, R`(?:change\w*|alter\w*|edit\w*|updat\w*)\W+(?:\w+\W+){0,8}(?:attribute|fill|colour|color|property)`, R`(?:bit.?map\w*|pixels?|image)\W+(?:\w+\W+){0,10}(?:every|each|all|many|individual|merge\w*|single|one set|no longer separate|cannot|can't)`], not: [R`vector\w*(?:\s+(?!bit.?map|but|whereas|while|unlike)[a-z']+){0,6}\s+(?:every|each|all) pixel`, R`(?:attribute|fill|colour|color)\s+(?:\w+\s+){0,2}(?:is|are)\s+not\s+(?:\w+\s+)?(?:changed|altered|edited|updated|set)`] },
            ],
            sample: "In a vector graphic the star is a separate object, so it can be selected on its own. Its fill attribute is changed to the new colour and nothing else is affected, whereas a bit-mapped graphic is only pixels and every pixel of the star would have to be recoloured.",
            model: "<ul><li>The star is an object that can be selected individually (1)</li><li>Change the fill colour attribute; the rest of the crest is unaffected. In a bit-mapped graphic overlapping shapes merge into one set of pixels (1)</li></ul>" },
        ],
      },
      /* ------------------------------------------------------------ 06 */
      {
        id: "cs-06",
        style: "Diagram question · buses and the fetch-execute cycle",
        stem: "<p>The diagram shows a processor connected to main memory by three buses, P, Q and R.</p>",
        figure: fig6,
        parts: [
          { label: "(a)", type: "match", marks: 3, q: "Match each bus to what it does.",
            pairs: [
              ["Bus P", "Address bus: carries the address of the memory location, in one direction only"],
              ["Bus Q", "Data bus: carries instructions and data, in both directions"],
              ["Bus R", "Control bus: carries separate signals such as read, write and clock"],
            ] },
          { label: "(b)", type: "text", marks: 4, rows: 7,
            q: "Describe the steps by which the processor fetches one instruction from main memory, ready to be decoded. Refer to the buses and the registers. [4]",
            points: [
              { desc: "The address of the memory location is placed on the address bus", any: [R`(?:address|location).{0,60}address bus`, R`address bus.{0,60}(?:address|location|memory location)`] },
              { desc: "The read line on the control bus is activated", any: [R`read (?:line|signal)`, R`control bus.{0,60}\bread\b`, R`\bread\b.{0,60}control bus`] },
              { desc: "The instruction is transferred along the data bus", any: [R`data bus.{0,70}(?:instruction|fetched|copied|transferred|sent|travels?|carried|returned|brought|contents|goes|go|comes?|moves?|flows?|passes|passed|loaded)`, R`(?:instruction|fetched|copied|transferred|sent|travels?|carried|returned|brought|contents|goes|go|comes?|moves?|flows?|passes|passed|loaded).{0,70}data bus`] },
              { desc: "It is stored in the instruction register (and then decoded)", any: [R`instruction register`, R`\bir\b`] },
            ],
            sample: "The processor puts the address of the memory location on the address bus. It then activates the read line on the control bus. The instruction is sent along the data bus from that memory location and is stored in the instruction register, ready to be decoded.",
            model: "<ul><li>Address of the required location set up on the address bus (1)</li><li>Read line activated on the control bus (1)</li><li>Instruction fetched from that location via the data bus (1)</li><li>Stored in the instruction register, then decoded and executed (1)</li></ul><p>Name the bus and the line: “the CPU gets it from memory” earns nothing.</p>" },
          { label: "(c)", type: "mcq", marks: 1, q: "Which of the following is held in the instruction register? [1]",
            opts: ["The instruction that has just been fetched, while it is decoded", "The address of the next free location in memory", "The result of the last calculation only", "A copy of every instruction in the program", "The clock speed of the processor"], a: 0,
            why: "The instruction register holds the single instruction just fetched while the decoder interprets it." },
        ],
      },
      /* ------------------------------------------------------------ 07 */
      {
        id: "cs-07",
        style: "Explanation · factors affecting performance",
        stem: "<p>A school is choosing laptops for its computing classes and compares the specifications of two processors.</p>",
        parts: [
          { label: "(a)", type: "text", marks: 2, rows: 4,
            q: "Laptop X has more cache memory than laptop Y. Explain why this improves performance. [2]",
            points: [
              { desc: "More instructions and data can be held in the (fast) cache", any: [R`(?:more|larger|bigger|extra) .{0,30}(?:instructions?|data|programs?).{0,50}(?:held|stored|kept|found|fit|in (?:the )?cache|available)`, R`(?:more|larger|bigger|extra) cache.{0,40}(?:holds?|stores?|keeps?|can hold|can store) .{0,20}(?:instructions?|data)`, R`(?:instructions?|data).{0,40}(?:in|from|held in|stored in|found in) (?:the )?cache`] },
              { desc: "More cache hits, so fewer slower accesses to main memory", any: [R`(?:fewer|less|reduc\w+|avoid\w*|saves?).{0,45}(?:access\w*|trips?|fetch\w*|reads?|go\w*|visits?|goes|time).{0,30}(?:main memory|ram|memory)`, R`(?:main memory|ram).{0,50}(?:slow\w*).{0,40}(?:fewer|less|avoid\w*|reduc\w+)`, R`(?:fewer|less|avoid\w*).{0,25}(?:slow\w*).{0,30}(?:main memory|ram|access\w*)`, R`(?:go\w*|access\w*|fetch\w*|use\w*|visit\w*|read\w*|need\w*) (?:\w+ ){0,6}(?:main memory|ram)\W+(?:\w+\W+){0,3}(?:less|fewer) (?:often|frequently|times)`] },
            ],
            sample: "A bigger cache means more instructions and data can be held in the fast cache memory. The processor then finds what it needs in cache more often, so there are fewer slower accesses to main memory.",
            model: "<ul><li>More instructions and data can be held in cache, so more cache hits (1)</li><li>Fewer slower accesses to main memory, so instructions/data reach the processor faster (1)</li></ul><p>“Cache makes it faster” earns nothing.</p>" },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Laptop X has a 64-line data bus; laptop Y has a 32-line data bus. Explain why the wider bus improves performance. [2]",
            points: [
              { desc: "More bits (data) are carried in each transfer / at the same time", all: [R`more|twice|double|extra|larger|greater|wider|bigger|64`, R`bits|data|bytes|instructions?|information`, R`at once|at the same time|each transfer|one transfer|per transfer|single transfer|in one go|in parallel|simultaneous\w*|every transfer|each cycle|one cycle|a time`], win: 110 },
              { desc: "So fewer transfers are needed, and instructions and data reach the processor faster", any: [R`(?:fewer|less|reduc\w+) .{0,30}transfers?`, R`transfers? .{0,30}(?:fewer|less)`, R`(?:fewer|less|quicker|faster|sooner|shorter) .{0,40}(?:to (?:fetch|move|transfer|load|send|get|read|copy)|fetch\w*|transfer\w*)`, R`(?:fetch\w*|transfer\w*|load\w*|move\w*) .{0,40}(?:faster|quicker|more quickly|more instructions)`] },
            ],
            sample: "A 64-line data bus carries twice as many bits at the same time in each transfer. So fewer transfers are needed to move the same amount of data and instructions are fetched faster.",
            model: "<ul><li>More bits carried at once in every transfer (1)</li><li>Fewer transfers needed to move the same data, so instructions/data arrive faster (1)</li></ul>" },
          { label: "(c)", type: "multi", marks: 2, q: "Select TWO changes that would increase the number of instructions a processor can complete each second. [2]",
            opts: ["Raising the clock speed", "Adding a second core", "Fitting a larger hard disk drive", "Using a monitor with a higher resolution", "Installing a louder speaker"], a: [0, 1],
            why: "A faster clock runs more fetch-execute cycles per second; a second core can fetch and execute instructions at the same time as the first. Disk size, monitor and speaker do not change how fast instructions are executed." },
        ],
      },
      /* ------------------------------------------------------------ 08 */
      {
        id: "cs-08",
        style: "Explanation and calculation · cores and clock speed",
        stem: "<p>A games-club PC has a quad-core processor with a clock speed of 3.2 GHz.</p>",
        parts: [
          { label: "(a)", type: "text", marks: 2, rows: 4,
            q: "A game runs on a quad-core processor. Explain why it does not run four times as fast as on a single-core processor with the same clock speed. [2]",
            points: [

              { desc: "Some tasks cannot be split up (divided between the cores), so not all cores can be used", negOK: true, any: [R`(?:cannot|can't|not|unable to|isn't|aren't|difficult to|hard to|impossible to|not all \w+ can be) (?:\w+ ){0,3}(?:split|divid\w+|shared|spread|run in parallel|processed at the same time|done at the same time|run at the same time|parallel\w*)`, R`(?:sequential|one after (?:the )?another|one at a time)`, R`(?:some|many|most) (?:\w+ ){0,2}(?:tasks?|instructions?|parts?|programs?|code) (?:\w+ ){0,3}(?:single|one) (?:core|processor|thread)`], not: [R`(?<!not )(?<!n't )(?:all|every|any) (?:\w+ ){0,3}(?:tasks?|instructions?|parts?) (?:can|could|will) (?:be )?(?:split|divided|shared|run (?:in|at))`] },
              { desc: "Some tasks must wait for the results of others, so cores sit idle", negOK: true, not: [R`\b(?:doesn't|do not|does not|never|no)\s+(?:\w+\s+){0,2}(?:wait\w*|depend\w*|idle)`], any: [R`(?:wait\w*|depend\w*|rel(?:y|ies)|need\w*).{0,40}(?:result|another|other (?:core|task|instruction|part)|previous|finish\w*|earlier|others?)`, R`(?:results?|earlier|previous|another|others?).{0,50}(?:wait\w*|idle|first)`, R`(?:cores?|processors?) (?:\w+ ){0,4}(?:idle|waiting|doing nothing|unused)`] },
              { desc: "Extra work to divide the tasks up and combine them, and the cores share resources such as memory and buses", any: [R`(?:share\w*|same|single) .{0,14}(?:memory|bus|cache|ram|resources?)`, R`(?:extra|additional|more) .{0,14}(?:work|time|overhead|co-?ordinat\w+|managing|organis\w+|communicat\w+)`, R`(?:divid\w+|split\w*|combin\w+|co-?ordinat\w+|manag\w+|organis\w+) .{0,30}(?:takes? (?:time|effort|work)|costs?|overhead|slow\w*)`, R`overheads?`] },
            ],
            sample: "Some tasks need the result of an earlier instruction first, so the cores sit idle waiting. The cores also share the same memory and buses, and extra work goes into dividing the tasks up.",
            model: "<ul><li>Some tasks cannot be divided between cores / must wait for results from others (1)</li><li>Overheads: the work has to be divided and combined, and the cores share memory and buses (1)</li></ul><p>It is not a perfect multiple of the number of cores.</p>" },
          { label: "(b)", type: "num", marks: 1, tol: 0, q: "Write the clock speed of 3.2 GHz as a whole number of clock pulses (cycles) each second. [1]", a: 3200000000,
            why: "1 GHz = 1 000 000 000 Hz, so 3.2 GHz = 3 200 000 000 pulses a second." },
          { label: "(c)", type: "mcq", marks: 1, q: "Why can the clock speeds of processors from two different manufacturers not always be compared directly? [1]",
            opts: ["Different designs may complete different amounts of work in each clock cycle", "Clock speed is measured in different units by each manufacturer", "Only one of the processors has a clock", "Clock speed does not affect how fast instructions run at all", "Hertz is used only for processors with several cores"], a: 0,
            why: "Clock speed counts pulses, but a design may do more (or less) in each pulse, and cache and cores differ too." },
        ],
      },
      /* ------------------------------------------------------------ 09 */
      {
        id: "cs-09",
        style: "Scenario question · environmental impact of intelligent systems",
        stem: "<p>A school installs a smart heating system. The council also manages traffic signals in the town, and the school caretaker drives a van fitted with a car management system.</p>",
        parts: [
          { label: "(a)", type: "text", marks: 2, rows: 4,
            q: "Describe two ways in which the smart heating system reduces the energy used by the school. [2]",
            points: [

              { desc: "Sensors detect which rooms are in use, so empty rooms are not heated", any: [R`(?:sensors?|detect\w*|motion|occupan\w+|activity|presence).{0,70}(?:empty|nobody|no.?one|nobody|not (?:in use|used|occupied|being used)|unoccupied|only (?:heat\w*|when)|off|switch\w* off|turn\w* off|people (?:are|is)|present|in (?:the )?room|in use|occupied)`, R`(?:empty|unused|unoccupied|nobody|no.?one)\W+(?:\w+\W+){0,6}(?:rooms?|areas?|classrooms?|heat\w*).{0,40}(?:not|off|aren't|isn't|switch\w*|turn\w*|no heat)`, R`(?:heat\w*|warm\w*) (?:only )?(?:the )?(?:rooms?|classrooms?|areas?) (?:that are|which are|being|currently|when)? ?(?:in use|occupied|used|people)`] },
              { desc: "Only heats to the right temperature / learns the pattern of use, or is switched off remotely by the app", any: [R`(?:learn\w*|schedule|timetable|timer|target|preferred|set|right|correct|required|needed|desired|chosen|ideal|exact) .{0,30}temperature`, R`temperature.{0,30}(?:needed|required|right|correct|target|set|preferred|chosen)`, R`(?:remote\w*|app).{0,60}(?:off|switch|turn|control|adjust)`, R`learn\w* .{0,40}(?:schedule|pattern|timetable|when|routine|habits)`, R`(?:thermostat|timer|programm\w+).{0,40}(?:heat\w*|off|only)`] },
            ],
            sample: "Sensors detect which rooms are in use, so empty rooms are left unheated and less energy is used. The system also learns when rooms are used and only heats them to the right temperature at the right times.",
            model: "<ul><li>Activity sensors: rooms are heated only when people are in them (1)</li><li>Learns patterns / only heats to the required temperature / remote switch-off by app, so less energy is wasted (1)</li></ul><p>Say how the saving happens, not just “it saves energy”.</p>" },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Describe two ways in which the van's car management system reduces its fuel consumption. [2]",
            points: [
              { desc: "Start-stop switches the engine off when the van is stationary and restarts it when the accelerator is pressed, so less fuel is burned idling", any: [R`(?:start.?stop|stationary|stopped|stops|idling|idle).{0,70}(?:engine|switch\w*|turn\w*|off|restart\w*)`, R`(?:engine|switch\w*|turn\w*).{0,40}(?:off|restart\w*).{0,60}(?:stationary|stopped|stops|idling|idle|traffic lights)`] },
              { desc: "Sensors let the engine control unit set the air/fuel ratio accurately, for more efficient combustion", all: [R`air|fuel ratio|ratio|mixture`, R`accurat\w+|precise\w*|exact\w*|correct|right|control\w*|adjust\w*|efficient\w*|optimal|best`], win: 110 },
            ],
            sample: "Start-stop switches the engine off when the van is stationary and restarts it when the accelerator is pressed, so no fuel is burned while idling. Sensors let the engine control unit control the air to fuel ratio accurately, so the fuel burns efficiently.",
            model: "<ul><li>Start-stop: engine off when stationary, restarts on the accelerator, so no idling (1)</li><li>Engine control unit uses sensors to control the air/fuel ratio accurately: more efficient combustion (1)</li></ul>" },
          { label: "(c)", type: "mcq", marks: 1, q: "How can intelligent traffic control reduce emissions? [1]",
            opts: ["Signal timings are adjusted to flow, so fewer vehicles stop and idle", "Drivers are told to buy larger engines", "All traffic lights are switched off at night", "Cameras make the fuel burn more slowly", "Sensors measure pollution but cannot change anything"], a: 0,
            why: "Cameras and sensors measure flow and software adjusts the timings: less stop-start driving and idling means less fuel burned and fewer emissions." },
          { label: "(d)", type: "text", marks: 2, rows: 4,
            q: "Explain one way in which intelligent systems such as these can themselves harm the environment. [2]",
            points: [

              { desc: "The sensors, processors and networks need raw materials and energy to make and run, and eventually become e-waste", negOK: true, any: [R`\be.?waste\b|electronic waste|landfill`, R`(?:need|needs|require|requires|use|uses|used|take|takes|consume|consumes|mine|mining|mined)\w* (?:\w+ ){0,3}(?:raw materials?|rare (?:earth )?metals?|energy|electricity|power|resources)`, R`(?:raw materials?|rare (?:earth )?metals?|energy|electricity|power) (?:\w+ ){0,3}(?:to|for|in) (?:make|made|build|built|manufactur\w+|produc\w+|run|running|power|mine)`, R`manufactur\w+ (?:\w+ ){0,4}(?:energy|materials?|metals?|pollut\w+|emissions?|resources?)`], not: [R`(?:no|not|never|doesn't|don't|without) (?:\w+ ){0,2}(?:e.?waste|electronic waste|raw materials?|manufactur\w+|energy|electricity)`] },
              { desc: "Consequence: pollution, emissions, depleted resources or waste that is hard to recycle", negOK: true, any: [R`(?:e.?waste|electronic waste|waste|landfill|dump\w*|thrown|dispos\w+|manufactur\w+|mining|mined|energy|electricity|power|devices?|metals?|materials?)\W+(?:\w+\W+){0,8}(?:pollut\w+|emissions?|co2|carbon|toxic\w*|deplet\w+|harm\w*|damag\w+|run out|use up|uses up|fossil)`, R`(?:pollut\w+|emissions?|co2|carbon|toxic\w*|harmful (?:chemicals|substances))\W+(?:\w+\W+){0,3}(?:from|caused by|due to|because of|when|leak\w*|into)`, R`(?:hard|difficult) to recycle|(?:cannot|can't|not) (?:be )?recycl\w+|finite resources|(?:uses?|use up|used up|deplet\w+) (?:\w+ ){0,2}(?:finite|rare|limited) (?:resources|materials|metals)`], not: [R`(?:no|not|never|doesn't|don't|without) (?:\w+ ){0,2}(?:pollut\w+|emissions?|toxic|harm\w*|damag\w+)`] },
            ],
            sample: "The sensors, processors and networks need raw materials and a lot of energy to make and to run. When they wear out they become e-waste, which can pollute the land where it is dumped.",
            model: "<ul><li>The devices need raw materials / energy to make and run, or become e-waste (1)</li><li>This causes pollution, extra emissions or uses up finite resources (1)</li></ul><p>A balanced answer links the saving to the cost.</p>" },
        ],
      },
      /* ------------------------------------------------------------ 10 */
      {
        id: "cs-10",
        style: "Scenario question · Computer Misuse Act 1990",
        stem: "<p>A sailing club's secretary asks for advice on the Computer Misuse Act 1990.</p>",
        parts: [
          { label: "(a)", type: "match", marks: 3, q: "Match each action to the offence under the Computer Misuse Act 1990.",
            pairs: [
              ["A cadet guesses a friend's password and reads the friend's messages, changing nothing", "Unauthorised access to computer material"],
              ["A former employee deletes the club's membership database on her last day", "Unauthorised modification of programs or data"],
              ["A hacker logs in to a shop's system to copy card numbers and sell them", "Unauthorised access with intent to commit a further offence"],
            ] },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Describe two implications of the Act for a business. [2]",
            points: [

              { desc: "A business can prosecute intruders, including staff who go beyond their access rights", all: [R`prosecut\w+|legal action|\bsue\b|\bsuing\b|(?:to|in) court|police|criminal\w*|offence|report\w* (?:them|it|the (?:hack\w*|intrusion|breach))`, R`hackers?|intruders?|staff|employees?|offenders?|people|criminals?|attackers?|culprits?|those who|anyone|crackers?|thieves`], win: 70, not: [R`business (?:is|are) not responsible`, R`(?:hackers?|intruders?|criminals?)(?:\s+[a-z']+){0,2}\s+(?:go|goes|gets?|are sent)\s+to\s+(?:prison|jail)(?!.{0,60}(?:business|company|organisation|can prosecute|prosecut))`] },
              { desc: "A business must put security measures in place (access levels, passwords, monitoring) and train staff, which costs money", any: [R`(?:security|access levels?|passwords?|monitoring|firewalls?|training|train staff|protect\w*).{0,80}(?:cost\w*|money|expens\w+|pay|need\w*|must|have to|required)`, R`(?:need\w*|must|have to|has to|required|install\w*|set up|put in place|invest\w*|spend\w*|pay\w*|budget\w*).{0,60}(?:security|access levels?|passwords?|monitoring|training|train)`] },
              { desc: "A breach could cost the business revenue, data and reputation", any: [R`(?:breach|attack|hack\w*|misuse|intrusion).{0,60}(?:lose|lost|loss|cost\w*|damag\w+|reputation|revenue|customers)`] },
            ],
            sample: "A business can prosecute hackers, including staff who go beyond their access rights, because the Act makes this a crime. It also needs to put security measures in place, such as access levels and passwords, and train its staff, which costs money.",
            model: "<ul><li>Can prosecute intruders and staff who exceed their access (1)</li><li>Must install security measures and train staff, which costs money (1)</li><li>A breach could lose revenue, data and reputation (1)</li></ul><p>Any 2.</p>" },
        ],
      },
      /* ------------------------------------------------------------ 11 */
      {
        id: "cs-11",
        style: "Scenario question · tracking cookies and denial of service",
        stem: "<p>An online ticket shop for a music festival uses third-party tracking cookies. On the day the tickets go on sale its web server stops responding to customers.</p>",
        parts: [
          { label: "(a)", type: "text", marks: 2, rows: 4,
            q: "Describe one risk to a customer of a tracking cookie. [2]",
            points: [

              { desc: "It records the sites the customer visits, across many websites, to build a profile", all: [R`(?:record\w*|track\w*|monitor\w*|collect\w*|log\w*|follow\w*|store\w*|builds?|build\w* up|profil\w+|watch\w*|spy\w*|keeps? (?:a )?track)`, R`(?:sites|websites|web pages|browsing|history|pages|visit\w*|habits|interests|profile|activity|searches)`], win: 70 },
              { desc: "Loss of privacy: the profile can be sold or shared and used to target adverts, or used for identity theft if leaked", any: [R`(?:loss of|lose|lack of|invasion of|breach\w* (?:of )?(?:your |their |the |a )?|invad\w+ (?:your |their |the |a )?)privacy`, R`privacy (?:is|risk|concern|issue|problem|breach|violat\w+|invaded|lost)`, R`(?:sold|sell\w*|shared?|passed|given|sent) (?:\w+ ){0,5}(?:third part\w+|advertisers|companies|others|other (?:firms|businesses|organisations)|marketers)`, R`(?:targeted|unwanted|personalised|annoying|intrusive|more) (?:\w+ )?(?:adverts?|ads|advertising|advertisements)`, R`(?:adverts?|ads)\b.{0,30}(?:target\w*|tailored|aimed|based on)`, R`identity theft|\bscams?\b|\bfraud\w*`, R`(?:leak\w*|stolen|hacked) (?:\w+ ){0,3}(?:data|information|profile|details)`] },
            ],
            sample: "A tracking cookie records the websites a customer visits and builds up a profile of their browsing habits. This is a loss of privacy, because the profile can be sold to other companies and used to target adverts at them.",
            model: "<ul><li>Records browsing across many websites to build up a profile (1)</li><li>Loss of privacy: profile sold/shared, targeted adverts, or identity theft if the data leaks (1)</li></ul>" },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "The outage is a denial of service attack. Explain the difference between the two types of fault, bandwidth consumption and resource starvation. [2]",
            points: [

              { desc: "Bandwidth consumption: the network connection is flooded so genuine requests cannot get through", negOK: true, all: [R`network|connection|bandwidth|\bline\b|traffic|\blink\b`, R`flood\w*|overwhelm\w*|fill\w*|\bfull\b|saturat\w+|clogged|swamp\w*|too much (?:traffic|data)|so much (?:traffic|data)|too many requests|used up|uses? up|using up|block\w*`], win: 70, not: [R`(?:resource )?starvation(?:\s+(?!bandwidth|consumption|whereas|while)[a-z']+){0,8}\s+(?:flood\w*|floods|bandwidth|network)`, R`bandwidth(?:\s+(?!starvation|resource|whereas|while)[a-z']+){0,8}\s+(?:memory|processor|cpu|processing)`, R`(?:network|bandwidth|connection|traffic|link)(?:\s+[a-z']+){0,4}\s+(?:is|are)\s+(?:not|never|unaffected)\s`] },
              { desc: "Resource starvation: the server's own resources (memory, processor time, connections) are used up", negOK: true, all: [R`memory|processor|cpu|processing|connection slots?|resources?|server|connections|ram`, R`used up|uses? up|using up|exhaust\w*|run out|runs out|taken up|overload\w*|filled|\bfull\b|tied up|busy|thousands of connections|opening|cannot respond|unable to respond|can't respond|too many`], win: 80, not: [R`(?:bandwidth)(?:\s+(?!starvation|resource|whereas|while)[a-z']+){0,8}\s+(?:memory|processor|cpu|processing|connection slots?)`, R`(?:network|bandwidth|connection|traffic|link)\s+(?:\w+\s+){0,4}(?:is|are)\s+(?:not|never)\s`] },
            ],
            sample: "With bandwidth consumption the network connection is flooded with so much traffic that genuine requests are blocked. With resource starvation the server's own memory, processor time or connection slots are used up.",
            model: "<ul><li>Bandwidth consumption: the connection is flooded with traffic so genuine requests cannot get through (1)</li><li>Resource starvation: the server's memory / processor time / connections are used up (1)</li></ul>" },
          { label: "(c)", type: "multi", marks: 2, q: "Select TWO costs to the festival of the denial of service attack. [2]",
            opts: ["Lost revenue while customers cannot buy tickets", "The labour cost of investigating and fixing the fault", "The customer database is permanently copied", "Staff passwords are guessed", "Cookies are stored on customers' devices"], a: [0, 1],
            why: "A DoS attack stops access: it costs lost sales while the service is down and the labour of finding and fixing the fault. Copying data and guessing passwords are different attacks." },
        ],
      },
      /* ------------------------------------------------------------ 12 */
      {
        id: "cs-12",
        style: "Scenario question · encryption, signatures and certificates",
        stem: "<p>A charity's volunteers email donation records to the treasurer, Kenny, who uses public key encryption. The charity's donation website uses HTTPS.</p>",
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "Amira wants to send Kenny a message that only he can read. Which key does she use to encrypt it? [1]",
            opts: ["Kenny's public key", "Kenny's private key", "Amira's public key", "Amira's private key", "The Certificate Authority's private key"], a: 0,
            why: "Encrypt with the receiver's public key; only the receiver's private key can decrypt." },
          { label: "(b)", type: "text", marks: 3, rows: 6,
            q: "Describe how Amira creates a digital signature for a message and how Kenny checks it. [3]",
            points: [

              { desc: "A hash (fingerprint) of the message is worked out", any: [R`(?:hash|digest|fingerprint|checksum)\w*(?:\s+\w+){0,4}\s+(?:of|from|for)\s+(?:the |a |their |his |her )?(?:message|document|email|file|data|text)`, R`(?:hash\w*|digest|fingerprint|checksum)\s+(?:the |a |their |his |her )?(?:message|document|email|file|data|text)`, R`(?:work\w*|mak\w+|made|creat\w+|calculat\w+|generat\w+|produc\w+|comput\w+)(?:\s+out)?\s+(?:a |the |its |their |an )?(?:\w+\s+)?(?:hash|digest|fingerprint|checksum)`], not: [R`hash\w*(?:\s+[a-z']+){0,6}\s+(?:with|using|by)\s+(?:kenny'?s?|the receiver'?s?|his)\s+public key`] },
              { desc: "The hash is encrypted with Amira's private key to make the signature", all: [R`\bhash\w*|fingerprint|digest|checksum|message|signature`, R`(?:encrypt\w*|sign\w*|lock\w*|scrambl\w*).{0,60}private key|private key.{0,60}(?:encrypt\w*|sign\w*|lock\w*|create\w*|make|made)`], win: 160, not: [R`(?:kenny|receiver|recipient|treasurer)'?s? private key|\bhis private key|(?:encrypt\w*|sign\w*|lock\w*)(?:\s+[a-z']+){0,8}\s+(?:kenny'?s?|receiver'?s?|recipient'?s?|his|the receiver'?s?) public key`, R`(?:kenny|the receiver|the recipient)\s+(?:\w+\s+){0,3}(?:encrypt\w*|sign\w*|creat\w+|mak\w+)\s+(?:\w+\s+){0,5}(?:hash|signature)`] },
              { desc: "Kenny decrypts it with Amira's public key and compares it with his own hash of the message", all: [R`public key`, R`compar\w+|match\w*|same|equal|identical`], win: 170, not: [R`(?:amira|sender)\s+(?:\w+\s+){0,3}(?:check\w*|decrypt\w*|verif\w+)\s+(?:\w+\s+){0,5}(?:kenny'?s?|the receiver'?s?|receiver'?s?)\s+(?:public|signature)`, R`(?:kenny'?s?|receiver'?s?|recipient'?s?|his) public key`] },
            ],
            sample: "A hash of the message is worked out. Amira encrypts the hash with her private key and that is the signature. Kenny decrypts the signature with Amira's public key and compares it with his own hash of the message to see if they match.",
            model: "<ul><li>A hash / fingerprint of the message is calculated (1)</li><li>The hash is encrypted with the sender's private key = the signature (1)</li><li>The receiver decrypts with the sender's public key and compares with their own hash of the message (1)</li></ul>" },
          { label: "(c)", type: "text", marks: 2, rows: 4,
            q: "State two things a valid digital signature tells Kenny about a message. [2]",
            points: [

              { desc: "It confirms who sent the message (the sender's identity)", not: [R`certificate authority|\bca\b`], any: [R`(?:proves?|shows?|confirms?|verif\w+|tells?|know\w*|checks?|ensures?|identif\w+|authenticat\w+|guarantee\w*|assur\w+)\s+(?:\w+\s+){0,6}(?:who|sender|amira|identity|origin)`, R`(?:came|comes|coming|sent|created|signed|written) (?:\w+ )?(?:from|by) (?:amira|the (?:real|genuine|right|correct|actual|claimed|person|sender)|her|who)`, R`(?:really|genuinely|actually) (?:came |comes |is |was )?from`, R`authenticity|(?:sender|message) (?:is|was) (?:authentic|genuine|really)|identity of the sender|sender'?s? identity|genuine sender|real sender|sender is who`] },
              { desc: "It confirms the message is unchanged since it was signed (not altered or tampered with on the way)", negOK: true, not: [R`certificate authority|\bca\b`, R`(?:message|it|data|document|email|content)\s+(?:has|was|had|is|might be|may be|could be)\s+(?:been\s+)?(?:altered|changed|tampered|modified|edited|encrypted|corrupted)`, R`(?:not|never|n't|cannot|can't)\s+(?:\w+\s+){0,2}(?:unalter\w*|unchanged|untamper\w*|intact|integrity)`], any: [R`(?:has not|hasn't|have not|haven't|was not|wasn't|were not|weren't|is not|isn't|never been|cannot have been|can't have been|could not have been|couldn't have been|not been|not) (?:\w+ ){0,1}(?:been |be )?(?:alter\w*|changed|tamper\w*|modif\w*|edit\w*|interfer\w*|chang\w+)`, R`unalter\w*|unchanged|untamper\w*|intact|integrity|exactly as (?:it was )?sent|same as (?:it was|when) sent|free (?:from|of) tamper\w*|(?:no|without) (?:\w+ ){0,2}(?:tamper\w*|alter\w*|chang\w*|interfer\w*)|(?:nobody|no.?one|nothing|no one) (?:has |had |could have |can have |could |can )?(?:\w+ )?(?:tamper\w*|alter\w*|chang\w+|interfer\w*|modif\w+|edit\w*)`] },
            ],
            sample: "A valid signature proves who sent the message, so Kenny knows that it really came from Amira. It also shows that the message is unchanged since she signed it and is exactly as it was sent.",
            model: "<ul><li>Who sent it (authentic sender) (1)</li><li>It is unchanged / has not been altered in transit (1)</li></ul><p>A signature is about the <em>sender and the message</em>. Proving that a public key belongs to a website is the job of a digital certificate.</p>" },
          { label: "(d)", type: "text", marks: 2, rows: 4,
            q: "The donation website shows a padlock. Describe the purpose of the website's digital certificate. [2]",
            points: [
              { desc: "It proves that the public key really belongs to the organisation / website", any: [R`public key (?:\w+ ){0,3}(?:belongs?|owned|is genuinely|is genuine|is the (?:charity|website|site|organisation)'?s?)`, R`belong\w* to (?:the )?(?:website|site|charity|organisation|owner|company)`, R`(?:proves?|shows?|confirms?|verif\w+|checks?|identif\w+).{0,60}(?:website|site|organisation|charity|owner).{0,40}(?:genuine|real|who|they say|claims?|is|authentic)`, R`(?:website|site|organisation|charity|owner)'?s? identity|identity (?:of )?(?:the )?(?:website|site|owner|organisation|charity)`] },
              { desc: "Issued and signed by a trusted Certificate Authority, and checked by the browser before the secure connection is made", any: [R`certificate authority|\bca\b|trusted (?:third part\w+|organisation|body|company)`, R`browser (?:\w+ ){0,3}(?:checks?|checked|verif\w+|trusts?|validates?)`, R`(?:checks?|checked|verified|validated|validates|trusts?) (?:by )?(?:\w+ ){0,2}browser`] },
            ],
            sample: "The certificate proves that the public key really belongs to the charity's website. It is issued and signed by a trusted Certificate Authority, and the browser checks it before it sets up the secure HTTPS connection.",
            model: "<ul><li>Binds the public key to the website's owner: shows the key really belongs to the organisation (1)</li><li>Signed by a trusted Certificate Authority; the browser checks it before using HTTPS (1)</li></ul>" },
        ],
      },
      /* ------------------------------------------------------------ 13 */
      {
        id: "cs-13",
        style: "Short answer · recall across computer systems",
        stem: "<p>Answer each of the following short questions.</p>",
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "What denary number is stored by the 8-bit two's complement pattern 11111111? [1]",
            opts: ["-1", "255", "-127", "-128", "0"], a: 0,
            why: "-128 + 64 + 32 + 16 + 8 + 4 + 2 + 1 = -1. It is not 255." },
          { label: "(b)", type: "mcq", marks: 1, q: "Which is an advantage of a bit-mapped graphic over a vector graphic? [1]",
            opts: ["Individual pixels can be edited", "It is resolution independent", "Each object can be selected on its own", "It always has a smaller file size", "It stays sharp when enlarged"], a: 0,
            why: "Only bit-mapped graphics let you edit individual pixels. The other options are features of vector graphics (or are false)." },
          { label: "(c)", type: "mcq", marks: 1, q: "In floating-point representation, which part sets the range of numbers that can be stored? [1]",
            opts: ["The number of bits in the exponent", "The number of bits in the mantissa", "The sign bit", "The clock speed", "The width of the data bus"], a: 0,
            why: "The exponent moves the point, so more exponent bits give a greater range. The mantissa sets precision." },
          { label: "(d)", type: "mcq", marks: 1, q: "How many different codes can a 16-bit Unicode character set contain? [1]",
            opts: ["65 536", "256", "32 768", "16", "1 048 576"], a: 0,
            why: "2^16 = 65 536." },
          { label: "(e)", type: "mcq", marks: 1, q: "Which bus carries the address of the memory location the processor wants to read? [1]",
            opts: ["Address bus", "Data bus", "Control bus", "Instruction bus", "Cache bus"], a: 0,
            why: "The processor sets up the address bus with the location. The data bus carries the contents, and the control bus carries signals such as read." },
          { label: "(f)", type: "mcq", marks: 1, q: "What gives assurance that a public key really belongs to the website it claims to come from? [1]",
            opts: ["A digital certificate", "A digital signature", "A tracking cookie", "A private key", "A bandwidth limit"], a: 0,
            why: "A certificate, issued by a Certificate Authority, binds a public key to an organisation. A signature shows who sent a message and that it is unaltered." },
        ],
      },
      /* ------------------------------------------------------------ 14 */
      {
        id: "cs-14",
        style: "Calculation and explanation · storing a real number",
        stem: "<p>A fuel-gauge sensor stores the number 13.75 (positive) using 1 sign bit, a 15-bit normalised mantissa and an 8-bit exponent in two's complement. In binary, 13.75 is 1101.11.</p>",
        parts: [
          { label: "(a)", type: "num", marks: 2, tol: 0, q: "Write the 15-bit mantissa that is stored. [2]", a: 110111000000000, bits: 15,
            why: "1101.11 becomes 0.110111 x 2^4. The mantissa digits after the point are 110111, padded with zeros on the right to 15 bits: 110111000000000." },
          { label: "(b)", type: "num", marks: 1, tol: 0, q: "Write the 8-bit exponent that is stored. [1]", a: 100, bits: 8,
            why: "The point moved 4 places left, so the exponent is +4 = 00000100 in 8-bit two's complement." },
          { label: "(c)", type: "text", marks: 2, rows: 4,
            q: "Floating-point numbers are normalised before they are stored. Explain why. [2]",
            points: [

              { desc: "The mantissa always starts 0.1, so no bits are wasted on leading zeros", negOK: true, any: [R`(?:leading|wasted?|waste|unused|unnecessary).{0,40}(?:zeros?|bits?)`, R`(?:zeros?|bits?).{0,30}(?:wasted|waste)`, R`(?:starts?|begins?).{0,20}(?:0\.1|with a 1|with 1)`, R`(?:no|not) .{0,10}(?:bits|space).{0,20}wasted`], not: [R`(?:wastes?|wasted|waste) (?:\w+ ){0,3}(?:more|extra) (?:bits|space)`, R`(?:so|which means|meaning) (?:that )?(?:more|extra|many) bits are (?:wasted|used up)`] },
              { desc: "So as many significant digits as possible are stored (the most precision), and each number has only one representation", any: [R`(?:most|more|maximum|maximise|greatest|best|as many|highest|improve\w*|better)\s+(?:\w+\s+){0,2}(?:precision|accura\w+|significant|digits)`, R`(?:precision|accuracy)\W+(?:\w+\W+){0,3}(?:maximi[sz]\w+|improv\w+|best|greatest|most|highest|increas\w+)`, R`(?:one|single|only one|unique) (?:way|representation|form|version)`], not: [R`(?:less|lower|reduces?|reduced|worse|loses?|lost)\s+(?:\w+\s+){0,2}(?:precision|accura\w+)`] },
            ],
            sample: "Normalising means the mantissa always starts 0.1, so no bits are wasted on leading zeros. That means as many significant digits as possible are stored, which gives the most precision.",
            model: "<ul><li>The point is moved to just before the first 1, so no bits are wasted on leading zeros (1)</li><li>The mantissa holds as many significant digits as possible: maximum precision. Also: each number has only one representation (1)</li></ul>" },
        ],
      },
    ],
  };

  /* The marker only looks for a negator just outside a matched phrase, so a negative buried *inside* one
     ("half ... are not used for negative numbers") would slip through. For every point that is not
     marked negOK, stop the loose gaps (`.{0,n}` and `(?:\w+\W+){0,n}`) running across a negator. */
  const NEGSTOP = "(?!\\bnot\\b|\\bnever\\b|\\bcannot\\b|\\bno\\b|\\w*n't\\b)";
  B.cs.questions.forEach((q) => q.parts.forEach((p) => (p.points || []).forEach((pt) => {
    pt.not = (pt.not || []).concat([R`\bnot true\b|opposite is true|this is wrong|\bis false\b`]);
    if (pt.negOK) return;
    const fix = (src) => src
      .replace(/\.\{0,(\d+)\}/g, (m, n) => "(?:" + NEGSTOP + ".){0," + n + "}")
      .replace(/\(\?:\\w\+\\W\+\)\{0,(\d+)\}/g, (m, n) => "(?:" + NEGSTOP + "\\w+\\W+){0," + n + "}");
    if (pt.all) pt.all = pt.all.map(fix);
    if (pt.any) pt.any = pt.any.map(fix);
  })));
})();
