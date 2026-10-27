/* Past-paper practice: Drawing standards, protocols and conventions. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HGP_BANK = window.HGP_BANK || {});

  /* ---- small SVG helpers (palette: ink, magenta, paper, grey) ---- */
  const INK = "#1d1a14", MAG = "#d4147a", PAPER = "#fffaf0", GREY = "#cbbd9b";
  const svg = (w, h, label, body) =>
    `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}"><rect width="${w}" height="${h}" fill="${PAPER}"/>${body}</svg>`;
  const ln = (x1, y1, x2, y2, sw, dash, col) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col || INK}" stroke-width="${sw || 1.2}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const rect = (x, y, w, h, sw, fill) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill || "none"}" stroke="${INK}" stroke-width="${sw || 2.2}"/>`;
  const circ = (x, y, r, sw, fill) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill || "none"}" stroke="${INK}" stroke-width="${sw || 2}"/>`;
  const txt = (x, y, s, size, anchor, weight) =>
    `<text x="${x}" y="${y}" font-size="${size || 13}" text-anchor="${anchor || "middle"}"${weight ? ` font-weight="${weight}"` : ""} fill="${INK}">${s}</text>`;
  const tag = (x, y, t) =>
    `<circle cx="${x}" cy="${y}" r="11" fill="${PAPER}" stroke="${MAG}" stroke-width="1.8"/>` +
    `<text x="${x}" y="${y + 4.5}" font-size="13" font-weight="700" text-anchor="middle" fill="${INK}">${t}</text>`;
  const lead = (x1, y1, x2, y2) => ln(x1, y1, x2, y2, 1.3, null, MAG);
  const ar = (x, y, d) => {
    const L = 8, W = 2.6;
    const m = { r: [-L, -W, -L, W], l: [L, -W, L, W], d: [-W, -L, W, -L], u: [-W, L, W, L] }[d];
    return `<path d="M${x} ${y}L${x + m[0]} ${y + m[1]}L${x + m[2]} ${y + m[3]}Z" fill="${INK}"/>`;
  };
  const HID = "6 4", CEN = "16 3 3 3";

  /* ---- marker helpers: clause-bounded (tempered) regex source strings, built with String.raw ---- */
  const R = String.raw;
  const C = (stop, n) => R`(?:(?!${stop})[^.;]){0,${n}}`;   /* up to n characters of one clause that never run into `stop` */
  const NOT_BEFORE = R`(?<!not )(?<!n't )(?<!never )(?<!no )(?<!without )(?<!dont )(?<!doesnt )(?<!cant )(?<!wont )(?<!cannot )(?<!nothing )`;

  /* chain v parallel dimensioning (std-04c): roles are direction-aware.
     chain = each size starts where the last finished, errors accumulate; parallel = all from one datum, none accumulate. */
  const CH = R`chain\w*`, PA = R`parallel\w*`;
  const STOP_POS = R`chain|parallel|whereas|while|but\b|unlike|however|rather|instead|compared|\bthan\b`;
  const STOP_NEG = STOP_POS + R`|\bnot\b|n't|\bdont\b|\bdoesnt\b|\bcant\b|\bwont\b|\bcannot\b|never|\bno\b|without|avoid|prevent|stop|reduc|eliminat|independent`;
  const ACC = R`(?:accumulat\w*|add(?:s|ed|ing)? (?:up|together|on)|build\w* up|cumulat\w*|stack\w*|compound\w*|pass\w* on|carr(?:y|ied|ies) (?:on|over|forward)|(?:get|gets|grow|grows|become|becomes|increase|increases)(?: \w+){0,2} (?:bigger|larger|greater|worse)|total\w* up)`;
  const DAT = R`(?:datum|base ?line|origin\b|zero (?:point|line|edge)|(?:same|common|single|shared|fixed)(?: \w+){0,2} (?:edge|end|face|surface|reference|origin|side|start\w*|point|place|position|line)|one(?: \w+){0,2} (?:edge|face|surface|reference|datum|origin|end|side|starting)|from (?:the |one |a )?(?:left|right|first|fixed|zero|reference|common|same|start|starting)\w*(?: \w+){0,2} (?:end|edge|side|face|surface|point|line|hole|corner|feature)|all (?:the |of the )?(?:dimensions|sizes|measurements|holes|distances)(?: \w+){0,4} (?:from|start\w*|begin\w*|measured|taken)(?: \w+){0,3} (?:the )?(?:same|one|a single|a common))`;
  const DAT_C = R`(?:datum|base ?line|origin\b|(?:same|common|single|shared|fixed)(?: \w+){0,2} (?:edge|end|face|surface|reference|origin|side)|one(?: \w+){0,2} (?:datum|reference|origin)|all (?:the |of the )?(?:dimensions|sizes|measurements|holes|distances)(?: \w+){0,4} (?:from|start\w*|begin\w*|measured|taken)(?: \w+){0,3} (?:the )?(?:same|one|a single|a common))`;
  const IND = R`(?:independent\w*|stand\w* (?:alone|on (?:its|their) own)|(?:on|by) (?:its|their) own|separate\w*|(?:do|does)(?:n't|nt| not) (?:affect|add|accumulat\w*|build|carry|pass|influence|depend|stack|compound)|(?:won't|wont|can't|cant) (?:affect|add|accumulat\w*|build|carry|pass|influence|stack|compound)|(?:not|never) (?:affect\w*|cumulative|accumulat\w*|add\w*|build\w*|carr\w*|pass\w*)|no (?:build.?up|accumulat\w*|cumulative|error accumulation|knock.?on)|(?:errors?|tolerances?|mistakes?) (?:stay|stays|remain|remains)(?: \w+){0,2}|cannot (?:accumulate|add up|build up))`;
  const STD04_VETO = [
    /* parallel said to run end to end / accumulate (roles swapped) */
    R`parallel\w*${C(STOP_NEG, 90)}(?:${NOT_BEFORE}${ACC}|end.to.end|hole to hole|feature to feature|one after (?:the )?other|(?:from|starts?|begins?|where|after|following|using) (?:the )?(?:previous|preceding|last|prior|one before)|(?:to|from one \w+ to) (?:the )?next)`,
    R`${NOT_BEFORE}(?:accumulat\w*|add(?:s|ed)? up|build\w* up|cumulat\w*)${C(STOP_NEG + R`|,|\band\b`, 50)}parallel`,
    /* chain said to run from a datum (roles swapped) */
    R`chain\w*${C(STOP_NEG, 80)}${DAT_C}`,
    R`${DAT_C}${C(STOP_NEG + R`|,|\band\b`, 40)}chain`,
    /* chain said to be independent / not to accumulate */
    R`chain\w*${C(R`whereas|while|but\b|unlike|parallel|however|rather|instead|\bnot\b|n't|never|\bno\b`, 70)}(?:independent\w*|stand\w* alone|(?:no|not|never|n't|without)(?: \w+){0,2} (?:accumulat\w*|add\w* up|build\w* up|cumulat\w*|stack\w*))`,
    /* parallel said NOT to use a datum / NOT to be independent */
    R`parallel\w*${C(STOP_POS, 40)}(?:\bnot\b|n't|never|\bno\b)${C(STOP_POS, 30)}(?:datum|same|common|single|base ?line|reference)`,
    R`parallel\w*${C(STOP_POS, 40)}(?:\bnot\b|n't|never|\bno\b)(?: \w+){0,2} independent`,
  ];

  /* functional v non-functional tolerances (std-05c): a stricter tolerance belongs to the functional size */
  const TIGHTW = R`(?:tight\w*|small\w*|strict(?!er)\w*|narrow\w*|precis\w*|accura\w*|exact\w*|close\w*)`;
  const FN_BEFORE = R`(?<!non[- ]?)(?<!not )(?<!n't )(?<!un)`;
  const FN_STOP = R`non|not functional|whereas|while|but\b|unlike|however|rather|instead|compared|\bthan\b|\bothers?\b|\brest\b|remaining|unimportant|minor|\bnot\b|n't|never|\bno\b|\band (?:those|sizes that|ones that|dimensions that)`;
  const LOOSEN = R`(?:larger|bigger|wider|looser|greater|more|big|large|rough\w*|sloppy|sloppier|relaxed|generous|less (?:precise|accurate|exact|strict|tight)) (?:tolerances?|limits?|margins?|variation|allowance|leeway|range)`;
  const STD05_VETO = [
    /* "non-functional ... tight" (swapped) */
    R`non.?functional${C(R`functional|whereas|while|but\b|unlike|however|rather|instead|compared|\bthan\b|\bnot\b|n't|never|\bno\b|\bless\b|rough\w*|loose\w*|relax\w*|larger|bigger|wider|greater|\bmore\b|sloppy|cheap\w*|\bother\b`, 90)}${TIGHTW}`,
    R`${TIGHTW}(?: \w+){0,4} (?:tolerances?|limits?|control)(?: \w+){0,3} (?:for|on|to|in) (?:the |all )?(?:non.?functional|unimportant|less important)`,
    /* "functional ... loose" (swapped) */
    R`${FN_BEFORE}functional${C(FN_STOP, 70)}(?:${LOOSEN}|can (?:be |have )(?:\w+ ){0,2}(?:loose|looser|rough|rougher|sloppy|sloppier|relaxed|wider|larger|bigger)\b|matter\w* less|(?:do|does)(?:n't| not) matter|(?:don't|doesn't|do not|does not) need to be (?:as )?(?:exact|precise|accurate|tight))`,
    R`${LOOSEN}(?: \w+){0,3} (?:is |are )?(?:needed |required |given |allowed )?(?:for|on|in) (?:the )?(?:functional|important|critical)`,
  ];


  /* ---- manual v CAD comparison (std-11a): a point needs an attribute of EACH method in the same stretch, either order ---- */
  const MAN = R`(?:manual\w*|by hand|hand[ -]?drawn|hand[ -]?draw\w*|hand drawings?|\bhand\b|pencil|paper|drawing boards?|sketch\w*|traditional\w*)`;
  const CADW = R`(?:\bcad\b|computer\w*|electronic\w*|software|digital\w*|autocad|solidworks)`;
  const STOP_M = R`\bbut\b|whereas|while|\bcad\b|computer|software|electronic|digital|\bthan\b|unlike|compared`;
  const STOP_C = R`\bbut\b|whereas|while|manual|by hand|\bhand\b|paper|pencil|sketch|drawing board|\bthan\b|unlike|compared`;
  const sideM = (a) => R`(?:${MAN}${C(STOP_M, 90)}${a}|${a}${C(STOP_M, 30)}${MAN})`;
  const sideC = (a) => R`(?:${CADW}${C(STOP_C, 90)}${a}|${a}${C(STOP_C, 30)}${CADW})`;
  const CMP = (am, ac) => [
    R`${sideM(am)}.{0,130}${sideC(ac)}`, R`${sideC(ac)}.{0,130}${sideM(am)}`,
    R`${sideM(am)}${C(R`\bbut\b|whereas|while`, 40)}\bthan\b${C(R`\bbut\b|whereas|while`, 25)}${CADW}`,
    R`${sideC(ac)}${C(R`\bbut\b|whereas|while`, 40)}\b(?:than|compared (?:to|with)|over|rather than|instead of|unlike)\b${C(R`\bbut\b|whereas|while`, 25)}${MAN}`,
  ];
  const LISTY = R`(?:\b(?:the|is|a|and) \w+ ){4}`;
  const NEGG = (words) => R`(?:\bnot\b|\bnever\b|\bcannot\b|n't\b)(?!\s+(?:\w+\s+)?(?:need|needs|have|has|want|got|bother|must)\b)[^.;,]{0,22}\b(?:${words})`;
  const MAN_CHG = R`(?:redraw\w*|re-?draw\w*|redo\w*|redon\w*|start\w* (?:again|over)|rub\w* out|erase\w*|draw\w* (?:it |them |the \w+ |a \w+ )?again|(?:drawn|done|do|draw) (?:it |them |the \w+ |a \w+ |all \w+ )?(?:again|from scratch|over)|from scratch|(?:time.consuming|harder|difficult|slow\w*|fiddly) (?:to )?(?:change|alter|amend|edit|revise|update)|(?:change|alter|amend|edit|revise|update)\w* (?:\w+ ){0,3}(?:harder|difficult|slow\w*|time.consuming))`;
  const CAD_CHG = R`(?:edit\w*|chang\w*|updat\w*|automatic\w*|linked|once|quick\w*|easier|easily|alter\w*|amend\w*|modif\w*|adjust\w*|tweak\w*|simple|simpler|revis\w*|undo|fast\w*)`;
  const MAN_SPD = R`(?:quick\w*|fast\w*|seconds|no (?:software|power|computer|electricity|training)|without (?:a |any )?(?:software|power|computer|electricity)|simple|simpler|straight ?away|immediate\w*|(?:need|needs|only need|only needs|just need|just needs) (?:a )?(?:pen|pencil|paper))`;
  const CAD_SPD = R`(?:slow\w*|longer|training|learn\w*|set ?up|open\w*|power|electricity|complex\w*|time to|takes? (?:a )?(?:while|time|longer)|(?:needs?|requires?|relies on|depends on) (?:a |an )?(?:computer|power|electricity|software|training))`;
  const MAN_ACC = R`(?:skill\w*|steady|neat\w*|inaccura\w*|errors?|depend\w*|variable|vary|varies|varying|uneven|mistakes?|less (?:accurate|precise|consistent|exact)|human error|wobbl\w*|smudg\w*|slip\w*)`;
  const CAD_ACC = R`(?:(?<!in)(?<!un)accura\w*|precis\w*|exact\w*|consistent\w*|standards?|repeat\w*|same every|perfect\w*|uniform\w*|neater|to scale)`;
  const MAN_SHR = R`(?:scan\w*|photocop\w*|copies|copied|posted|post\b|physical\w*|carried|couriered|paper cop\w*|hard cop\w*|printed|printing|sent by post|by post)`;
  const CAD_SHR = R`(?:e-?mail\w*|share\w*|cloud|cop(?:y|ied|ies)|stor\w*|send\w*|sent|machines?|cnc|manufactur\w*|online|internet|electronic\w*|instant\w*|digital\w*|upload\w*|transfer\w*)`;
  const MAN_CST = R`(?:cheap\w*|inexpensive|low cost|affordable|no (?:software|training)|portable|less expensive|costs? (?:less|little)|(?:needs?|requires?)(?: only| just)? (?:a )?(?:pen|pencil|paper|drawing board))`;
  const CAD_CST = R`(?:expensive|costly|costs?|money|training|licen[cs]e\w*|hardware|subscription\w*|pricey)`;
  const MAN_REA = R`(?:flat|2d|two.?dimensional|slow\w*|time.consuming|takes? (?:a )?(?:long|time|ages)|harder|difficult|skill|(?:can't|cannot|can not|unable to) (?:show|render|do|make)|not (?:3d|realistic))`;
  const CAD_REA = R`(?:render\w*|realistic|3d|three.?dimensional|materials?|lighting|shad\w*)`;
  const std11 = (desc, am, ac, g2) => ({ desc, negOK: true, not: [LISTY, NEGG(g2)], any: CMP(am, ac) });

  /* ---- Q1: line types on a plate ---- */
  const fig1 = svg(380, 250,
    "Plan above elevation of a rectangular plate with a central hole. Line A is a dashed line in the elevation at the left edge of the hole. Line B is a long dash and dot line through the centre of the hole in the plan. Line C is a continuous thin line joining the right-hand corners of the two views.",
    rect(90, 20, 200, 110) + circ(190, 75, 24, 2) +
    ln(150, 75, 230, 75, 1.2, CEN) + ln(190, 35, 190, 115, 1.2, CEN) + ln(230, 75, 304, 75, 1.2, CEN) +
    rect(90, 160, 200, 36) + ln(166, 160, 166, 196, 1.5, HID) + ln(214, 160, 214, 196, 1.5, HID) +
    ln(290, 130, 290, 160, 1.2) + ln(90, 130, 90, 160, 1.2) +
    txt(6, 78, "Plan", 12, "start") + txt(6, 182, "Elevation", 12, "start") +
    lead(166, 210, 166, 198) + tag(166, 222, "A") +
    tag(332, 75, "B") + lead(321, 75, 305, 75) +
    tag(332, 145, "C") + lead(321, 145, 291, 145));

  /* ---- Q2: sectioned assembly ---- */
  const fig2 = svg(420, 240,
    "Section A-A through a housing, a cover and a shaft. P is the housing, hatched with thin lines at 45 degrees leaning one way in its upper and lower areas. Q is the cover, hatched in the opposite direction. R is the shaft passing through both along the axis, drawn in outline with no hatching.",
    `<defs><pattern id="std2a" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="${INK}" stroke-width="1"/></pattern>` +
    `<pattern id="std2b" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="7" stroke="${INK}" stroke-width="1"/></pattern></defs>` +
    `<rect x="100" y="60" width="220" height="40" fill="url(#std2a)" stroke="${INK}" stroke-width="2.2"/>` +
    `<rect x="100" y="140" width="220" height="40" fill="url(#std2a)" stroke="${INK}" stroke-width="2.2"/>` +
    `<rect x="320" y="60" width="26" height="40" fill="url(#std2b)" stroke="${INK}" stroke-width="2.2"/>` +
    `<rect x="320" y="140" width="26" height="40" fill="url(#std2b)" stroke="${INK}" stroke-width="2.2"/>` +
    `<rect x="60" y="100" width="310" height="40" fill="${PAPER}" stroke="${INK}" stroke-width="2.2"/>` +
    ln(46, 120, 384, 120, 1.2, CEN) +
    txt(210, 214, "SECTION A–A", 14, "middle", 700) +
    tag(200, 30, "P") + lead(200, 41, 200, 76) +
    tag(333, 30, "Q") + lead(333, 41, 333, 76) +
    tag(80, 176, "R") + lead(84, 165, 92, 130));

  /* ---- Q3: dimensioning mistakes ---- */
  const fig3 = svg(420, 290,
    "Plan above elevation of a plate with a hole. Mistake A: the extension lines for the overall width of 220 start exactly on the outline of the plan with no gap. Mistake B: the hole size is dimensioned from two dashed hidden-detail lines in the elevation. Mistake C: the overall width of 220 is dimensioned a second time below the elevation.",
    rect(70, 70, 220, 80) + circ(180, 110, 20, 2) + ln(150, 110, 210, 110, 1.2, CEN) + ln(180, 80, 180, 140, 1.2, CEN) +
    ln(70, 70, 70, 36) + ln(290, 70, 290, 36) + ln(70, 42, 290, 42, 1.2) + ar(70, 42, "l") + ar(290, 42, "r") + txt(180, 36, "220", 13) +
    lead(329, 56, 292, 56) + tag(340, 56, "A") +
    rect(70, 185, 220, 40) + ln(160, 185, 160, 225, 1.5, HID) + ln(200, 185, 200, 225, 1.5, HID) +
    ln(160, 229, 160, 250) + ln(200, 229, 200, 250) + ln(160, 244, 200, 244, 1.2) + ar(160, 244, "l") + ar(200, 244, "r") + txt(180, 240, "Ø40", 12) +
    lead(131, 244, 158, 244) + tag(120, 244, "B") +
    ln(70, 229, 70, 270) + ln(290, 229, 290, 270) + ln(70, 264, 290, 264, 1.2) + ar(70, 264, "l") + ar(290, 264, "r") + txt(180, 260, "220", 13) +
    lead(329, 264, 292, 264) + tag(340, 264, "C"));

  /* ---- Q4: chain dimensions along a bar ---- */
  const fig4 = svg(420, 160,
    "A flat bar with three holes. Chain dimensions run end to end along the bottom: 30 plus or minus 0.2 from the left end to the first hole, 45 plus or minus 0.2 from the first hole to the second hole, and 20 plus or minus 0.2 from the second hole to the third hole.",
    rect(40, 50, 330, 50) + circ(130, 75, 9, 2) + circ(265, 75, 9, 2) + circ(325, 75, 9, 2) +
    ln(130, 40, 130, 134, 1.1, CEN) + ln(265, 40, 265, 134, 1.1, CEN) + ln(325, 40, 325, 134, 1.1, CEN) + ln(40, 104, 40, 134, 1.2) +
    ln(40, 126, 325, 126, 1.2) + ar(40, 126, "r") + ar(130, 126, "l") + ar(130, 126, "r") + ar(265, 126, "l") + ar(265, 126, "r") + ar(325, 126, "l") +
    txt(85, 120, "30 ± 0.2", 12) + txt(198, 120, "45 ± 0.2", 12) + txt(296, 120, "20 ± 0.2", 12) +
    txt(40, 148, "Dimensions in mm", 11, "start"));

  /* ---- Q5: three tolerance notations ---- */
  const fig5 = svg(420, 130,
    "Three tolerances. X shows 60.30 written above 59.90. Y shows 25 followed by plus 0.15 above minus 0.25. Z shows diameter 16 followed by plus or minus 0.05.",
    tag(30, 30, "X") + txt(100, 54, "60.30", 18) + ln(70, 62, 130, 62, 1.2) + txt(100, 84, "59.90", 18) +
    tag(160, 30, "Y") + txt(215, 70, "25", 18) + txt(252, 58, "+0.15", 13, "start") + txt(252, 78, "−0.25", 13, "start") +
    tag(330, 30, "Z") + txt(372, 70, "Ø16 ± 0.05", 18));

  /* ---- Q6: third-angle layout ---- */
  const fig6 = svg(340, 190,
    "A notched block in third-angle layout. View X is drawn above view Y. View Z is drawn to the right of view Y. Y shows the front of the block with a rectangular notch cut from the top right. X shows the top with a vertical line where the notch begins. Z shows a rectangle with a horizontal line halfway down. Thin projection lines join the views.",
    `<g transform="translate(0,-82)">` + `<polygon points="60,170 140,170 140,200 180,200 180,230 60,230" fill="none" stroke="${INK}" stroke-width="2.2"/>` +
    rect(60, 100, 120, 50) + ln(140, 100, 140, 150, 2.2) +
    rect(200, 170, 50, 60) + ln(200, 200, 250, 200, 2.2) +
    ln(60, 150, 60, 170, 1) + ln(140, 150, 140, 170, 1) + ln(180, 150, 180, 170, 1) +
    ln(180, 170, 200, 170, 1) + ln(180, 200, 200, 200, 1) + ln(180, 230, 200, 230, 1) +
    tag(28, 125, "X") + tag(28, 200, "Y") + tag(280, 200, "Z") + `</g>`);

  /* ---- Q7: projection symbols ---- */
  const cone = (ox, oy, flip) => {
    // truncated cone: small end faces left; elevation is a trapezoid; end view is two concentric circles
    const el = `<polygon points="${ox + 0},${oy + 10} ${ox + 56},${oy - 4} ${ox + 56},${oy + 54} ${ox + 0},${oy + 40}" fill="none" stroke="${INK}" stroke-width="2"/>`;
    const cx = flip ? ox + 56 + 26 : ox - 26, cy = oy + 25;
    const ev = circ(cx, cy, 15, 2) + circ(cx, cy, 8, 2);
    return el + ev + ln(ox - 8, cy, ox + 64, cy, 0.9, CEN);
  };
  const fig7 = svg(420, 150,
    "Three projection symbols, each in a box. Symbol A shows a truncated cone elevation on the left with two concentric circles on its right. Symbol B shows two concentric circles on the left with the truncated cone elevation on its right. Symbol C shows only two concentric circles.",
    rect(10, 10, 126, 100, 1.5) + cone(30, 35, true) + tag(73, 130, "A") +
    rect(147, 10, 126, 100, 1.5) + `<g>${(function () {
      const ox = 205, oy = 35, cy = oy + 25;
      return `<polygon points="${ox},${oy + 10} ${ox + 56},${oy - 4} ${ox + 56},${oy + 54} ${ox},${oy + 40}" fill="none" stroke="${INK}" stroke-width="2"/>` +
        circ(ox - 26, cy, 15, 2) + circ(ox - 26, cy, 8, 2) + ln(ox - 44, cy, ox + 64, cy, 0.9, CEN);
    })()}</g>` + tag(210, 130, "B") +
    rect(284, 10, 126, 100, 1.5) + circ(347, 60, 26, 2) + circ(347, 60, 13, 2) + ln(311, 60, 383, 60, 0.9, CEN) + ln(347, 24, 347, 96, 0.9, CEN) + tag(347, 130, "C"));

  /* ---- Q8: floor plan with BSI symbols ---- */
  const fig8 = svg(420, 270,
    "A floor plan of a small bathroom drawn with symbols. A is a rectangle inside a rectangle with a small circle for the waste, along the top wall. B is a small square inside a square with a waste circle. C is a tall narrow rectangle with a line across near the top. D is a gap in the bottom wall holding a straight line and a quarter circle arc. E is a half circle with a short stem on the left wall.",
    `<rect x="40" y="44" width="340" height="190" fill="none" stroke="${INK}" stroke-width="4"/>` +
    `<rect x="150" y="232" width="52" height="5" fill="${PAPER}"/>` +
    rect(200, 50, 170, 56, 1.8) + rect(205, 55, 160, 46, 1.8) + circ(354, 78, 3, 1.6) +
    rect(70, 50, 40, 36, 1.8) + rect(76, 56, 28, 24, 1.8) + circ(90, 62, 2.5, 1.6) +
    rect(330, 170, 24, 54, 1.8) + ln(330, 182, 354, 182, 1.8) +
    ln(152, 233, 152, 188, 2) + `<path d="M152 188 A45 45 0 0 1 197 233" fill="none" stroke="${INK}" stroke-width="1.4"/>` +
    ln(44, 150, 52, 150, 1.8) + `<path d="M61 141 A9 9 0 0 0 61 159" fill="none" stroke="${INK}" stroke-width="1.8"/>` +
    tag(285, 22, "A") + lead(285, 33, 285, 70) +
    tag(90, 22, "B") + lead(90, 33, 90, 56) +
    tag(386, 190, "C") + lead(375, 190, 356, 190) +
    tag(176, 258, "D") + lead(176, 247, 176, 226) +
    tag(20, 150, "E") + lead(31, 150, 46, 150));

  /* ---- Q9: windows in elevation ---- */
  const win = (x, kind) => {
    const k = `fill="none" stroke="${INK}" stroke-width="1.4"`;
    let b = `<rect x="16" y="16" width="28" height="28" ${k}/>`;
    if (kind === "F") b += `<text x="30" y="35.5" text-anchor="middle" font-size="14" fill="${INK}" stroke="none">F</text>`;
    if (kind === "top") b += `<polyline points="16,44 30,16 44,44" ${k}/>`;
    if (kind === "piv") b += `<polygon points="30,16 44,30 30,44 16,30" ${k}/><line x1="8" y1="30" x2="52" y2="30" ${k}/>`;
    if (kind === "slide") b = `<rect x="15" y="14" width="30" height="32" ${k}/><line x1="30" y1="14" x2="30" y2="46" ${k}/>` +
      `<line x1="18" y1="30" x2="28" y2="30" ${k}/><polyline points="24,26.5 28,30 24,33.5" ${k}/>` +
      `<line x1="42" y1="30" x2="32" y2="30" ${k}/><polyline points="36,26.5 32,30 36,33.5" ${k}/>`;
    return `<g transform="translate(${x},14) scale(1.5)">${b}</g>`;
  };
  const fig9 = svg(420, 150,
    "Four window symbols in elevation, each in a square. A is a square marked F. B is a square with two lines that meet at the middle of the top edge. C is a square containing a diamond with a horizontal line running through and past both sides. D is a divided square with two arrows pointing towards the centre division.",
    win(10, "F") + win(115, "top") + win(220, "piv") + win(325, "slide") +
    tag(55, 126, "A") + tag(160, 126, "B") + tag(265, 126, "C") + tag(370, 126, "D"));

  /* ---- Q10: title block ---- */
  const fig10 = svg(420, 160,
    "A title block with five boxes. The top row holds the drawing title, Trunnion plate, and the project title, Gun carriage. The bottom row holds box A, scale 1 to 5, box B, a date, and box C, the note all dimensions in millimetres.",
    rect(20, 20, 380, 100, 2) + ln(20, 70, 400, 70, 1.4) + ln(110, 70, 110, 120, 1.4) + ln(250, 70, 250, 120, 1.4) + ln(210, 20, 210, 70, 1.4) +
    txt(28, 38, "DRAWING TITLE", 11, "start") + txt(28, 60, "Trunnion plate", 15, "start", 700) +
    txt(218, 38, "PROJECT", 11, "start") + txt(218, 60, "Gun carriage", 15, "start", 700) +
    txt(28, 88, "SCALE", 11, "start") + txt(28, 108, "1:5", 15, "start", 700) +
    txt(118, 88, "DATE", 11, "start") + txt(118, 108, "14/03/2026", 15, "start", 700) +
    txt(258, 88, "UNITS", 11, "start") + txt(258, 108, "All sizes in mm", 14, "start", 700) +
    tag(65, 142, "A") + tag(180, 142, "B") + tag(325, 142, "C"));

  B.std = {
    intro: "Drawing standards, protocols and conventions: line types, dimensioning and tolerances, third-angle projection and its symbol, hatching and types of section, scales, title blocks, parts lists, manual versus CAD and the BSI symbols. The 2025 course report called the questions on identifying and applying standard symbols “very poorly attempted”, so about a third of the marks here are symbol and convention recall. Twelve questions, 50 marks; the written answers are marked against points like the real marking instructions.",
    questions: [
      /* ------------------------------------------------------------ 01 */
      {
        id: "std-01",
        style: "Scenario question · identify and explain",
        stem: "<p>A draughtsperson at a shipyard has drawn the plan and elevation of a mounting plate with a drilled hole. Three of the lines are labelled A, B and C.</p>",
        figure: fig1,
        parts: [
          { label: "(a)", type: "match", q: "Match each labelled line to its name.", marks: 3,
            pairs: [["Line A", "Hidden detail (dashed thin line)"], ["Line B", "Centre line (long dash, dot, thin chain line)"], ["Line C", "Projection line (continuous thin line)"]] },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Everyone who draws for the shipyard uses these same line types. Explain two reasons why drawings follow an agreed drawing standard. [2]",
            points: [
              {"desc":"Everyone trained in the standard reads each line the same way (cause), so the drawing is not misread (effect)","win":140,"negOK":true,"all":["(?:(?:same|agreed|shared|common|universal\\w*|consistent\\w*|standard\\w*|international\\w*|identical|uniform) (?:\\w+ ){0,2}(?:way|meanings?|rules?|symbols?|conventions?|lines?|style|format|understanding|language)|(?:everyone|everybody|anyone|anybody|all (?:draughts\\w*|designers|engineers|workers|people|makers|readers))(?: \\w+){0,4} (?:understand|read|interpret|know|follow|see|get|recogni[sz]e)|(?:understood|read|recogni[sz]ed|followed|interpreted) by (?:everyone|anyone|all|everybody)|(?:read|interpret|understand)\\w* (?:it |them |the drawings? )?(?:in )?(?:the same|exactly|correctly|identically|properly))","(?:misread\\w*|misinterpret\\w*|misunderst\\w*|mistakes?|errors?\\b|confus\\w*|wrong|exactly|correctly|ambigu\\w*|one (?:possible )?(?:reading|meaning)|clear\\w*|unclear|understand\\w*|easier|easy|properly|accurate\\w*|first time)"],"not":["(?:\\bnot\\b|\\bnever\\b|\\bcannot\\b|n't\\b)[^.;,]{0,30}\\b(?:avoid\\w*|prevent\\w*|understand\\w*|clear\\w*|correct\\w*|properly|same|identical|exactly|consistent\\w*|read|interpret\\w*|follow\\w*|agreed|universal\\w*)","(?:\\b(?:is|are|was|were|has been|have been) (?:not|never)|(?:isn|aren|wasn|weren)'t)(?: \\w+){0,3} (?:(?:the )?(?:same|clear|understood|consistent|universal|agreed|read|identical)\\w*)"]},
              {"desc":"Avoids mistakes or misreading when the part is made","win":90,"negOK":true,"any":["(?:avoid\\w*|prevent\\w*|stop\\w*|reduc\\w*|fewer|minimi[sz]\\w*|eliminat\\w*|limit\\w*|no|without|cuts? down on) (?:\\w+ ){0,3}(?:mistakes?|errors?|misunderstand\\w*|misread\\w*|misinterpret\\w*|confusion|mix.?ups?|wrong parts?)","(?:mistakes?|errors?|misunderstandings?|confusion|misreading|mix.?ups?)(?: \\w+){0,3} (?:avoided|prevented|reduced|minimi[sz]ed|eliminated|stopped)"],"not":["(?:\\bnot\\b|\\bnever\\b|\\bcannot\\b|n't\\b)[^.;,]{0,30}\\b(?:avoid\\w*|prevent\\w*|reduc\\w*|minimi[sz]\\w*|eliminat\\w*|stop\\w*|fewer)"]},
              {"desc":"The drawing can be passed to another firm, country or worker (cause) who can make from it without asking the designer (effect)","win":120,"negOK":true,"all":["(?:(?:different|other|another|any|foreign|overseas|abroad) (?:\\w+ )?(?:firms?|compan\\w*|countr\\w*|manufactur\\w*|builders?|draughts\\w*|workshops?|sites?|offices?|people|users?|workers?|makers?|engineers?)|(?:across|between|around|in|all over) (?:the )?(?:world|countries|companies|firms)|international\\w*|worldwide|globally|overseas|abroad|elsewhere|somewhere else|(?:another|different|other|distant) (?:place|location|site)s?)","(?:read|use|understand|follow|work from|interpret|make|build|manufactur\\w*|produc\\w*|share|send|sent|pass\\w*)\\w*(?: \\w+){0,6} (?:it|them|the (?:drawing|part|plate)|without|from|exactly|correctly)|without (?:asking|needing|contacting|explanation|having|any)"],"not":["(?:\\bnot\\b|\\bnever\\b|\\bcannot\\b|n't\\b)(?: \\w+){0,3} (?:read|use|understand|follow|work from|interpret|make|build|manufactur\\w*|produc\\w*|share|send|sent|pass\\w*)\\b"]},
              {"desc":"Fewer notes or explanations are needed (cause), saving time and cost (effect)","win":90,"negOK":true,"any":["(?:save\\w*|reduc\\w*|cut\\w*|lower\\w*) (?:\\w+ ){0,3}(?:time|costs?|money|effort)","(?:quicker|faster|easier) to (?:draw|read|understand|produce|follow)","(?:time|money|costs?) (?:is |are )?(?:saved|reduced)","(?:fewer|less|no need for|without) (?:\\w+ ){0,3}(?:notes|explanations?|labels?|extra writing|text)"],"not":["(?:\\bnot\\b|\\bnever\\b|\\bcannot\\b|n't\\b)[^.;,]{0,30}\\b(?:sav\\w*|reduc\\w*|cut|lower\\w*|quick\\w*|fast\\w*|easier|cheap\\w*)"]},
              {"desc":"Drawings and parts from different makers are interchangeable or use a common language","win":90,"negOK":true,"any":["interchangeab\\w*","(?:universal|international|common) language"],"not":["(?:\\bnot\\b|\\bnever\\b|\\bcannot\\b|n't\\b)[^.;,]{0,30}\\b(?:interchangeab\\w*|universal|international|common|fit|match)"]},
            ],
            sample: "Everyone trained in the standard reads each line type in the same way, so a hidden edge or a centre line cannot be misread and mistakes in making are avoided. A drawing can also be sent to another country, where the makers can build from it without asking the designer.",
            model: "<ul><li>Agreed meaning: a trained reader interprets each line the same way, so the drawing is not misread and the part is made as intended (1)</li><li>Sharing: any firm or country can read and make from it without further explanation from the designer (1)</li><li>Also acceptable: fewer written notes are needed, saving time and cost (1)</li></ul><p>Give a cause and its effect; “it is the rules” earns nothing.</p>" },
        ],
      },
      /* ------------------------------------------------------------ 02 */
      {
        id: "std-02",
        style: "Scenario question · select and describe",
        stem: "<p>The sectional view below shows a housing, a cover plate and a shaft. The cutting plane passes lengthways through the axis of the shaft.</p>",
        figure: fig2,
        parts: [
          { label: "(a)", type: "multi", marks: 2, q: "Choose TWO items that are not hatched when the cutting plane passes lengthways through them.",
            opts: ["A solid cast housing wall", "A shaft", "A cover plate", "A sleeve (bush) lining a bore", "A bolt"], a: [1, 4],
            why: "Shafts, spindles, bolts, nuts, screws, pins, washers, keys and thin ribs or webs are drawn in outline, unhatched, when cut lengthways. Housing walls, cover plates and bushes are solid parts and are hatched." },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Describe two ways in which the hatching on housing P and cover Q follows the drawing conventions. [2]",
            points: [
              {"desc":"Thin lines at 45°, evenly spaced","win":60,"any":["(thin|fine)\\w* (\\w+ ){0,7}(\\b45\\b|forty.?five)","(?<=(?:hatch\\w*|lines?|sloped?|slope|slant\\w*|angled?|drawn|diagonal\\w*)(?:\\W+\\w+){0,5}\\W+)(?:\\b45\\b|forty.?five)\\W*(?:degrees?|deg|°|angle)","(thin|fine)\\w*(\\W+\\w+){0,6}\\W+(even\\w*|equal\\w*|regular\\w*) (spaced|spacing|apart)","(even\\w*|equal\\w*|regular\\w*) (spaced|spacing|apart)(\\W+\\w+){0,6}\\W+(thin|fine)\\w*","(thin|fine)\\w*(\\W+\\w+){0,6}\\W+same distance apart","(\\b45\\b|forty.?five)(\\W+\\w+){0,5}\\W+(thin|fine|even\\w*|equal\\w*|regular\\w*|spaced|spacing|same distance)","(even\\w*|equal\\w*|regular\\w*) (spaced|apart)(\\W+\\w+){0,4}\\W+(\\b45\\b|forty.?five)","(\\b45\\b|forty.?five)(\\W+\\w+){0,3}\\W+(angle|slope|diagonal)(\\W+\\w+){0,6}\\W+(even\\w*|equal\\w*|regular\\w*|same distance|spaced)"]},
              {"desc":"Both areas of the housing (one part) are hatched the same way (same direction and spacing)","win":90,"not":["(?:housing|part p|\\bp\\b)(?: [\\w']+){0,2} (?:and|with|as|to) (?:the )?(?:cover|part q|\\bq\\b|other part)(?:(?!opposite|different|reverse|whereas|while|but)[^.;]){0,60}\\b(?:same (?:direction|angle|way|spacing|slope|pattern)|identical|alike)","(?:cover|part q|\\bq\\b)(?: [\\w']+){0,2} (?:and|with|as|to) (?:the )?(?:housing|part p|\\bp\\b|other part)(?:(?!opposite|different|reverse|whereas|while|but)[^.;]){0,60}\\b(?:same (?:direction|angle|way|spacing|slope|pattern)|identical|alike)","(?:cover|housing)(?:(?!not\\b|n't|opposite|different|reverse|never|\\bno\\b)[^.;]){0,40}same (?:direction|angle|way|slope)(?: [\\w']+){0,2} (?:as|to) (?:the )?(?:housing|cover|other part)"],"all":["(housing|both (areas|sides|halves)|upper and lower|top and bottom|one (part|component)|same part|each part|all (the )?areas)","((same|identical|matching|consistent|similar|parallel)\\w* (\\w+ ){0,1}(direction|angle|way|spacing|hatch\\w*|lines|pattern|slope)|hatched (\\w+ ){0,2}(the same|identically|alike)|(slope|run|go|point|lean)s? (\\w+ ){0,2}(the )?same (way|direction))"]},
              {"desc":"The cover is hatched in the opposite direction (or different spacing) so the two parts are clearly distinguished","win":90,"all":["(cover|other part|second part|adjacent|neighbouring|next to|separate|different parts?|two (\\w+ )?parts?|both parts|each other|part q|touching|adjoining|abutting|meeting)","((opposite|different|reverse|other|contrary|alternate)\\w* (\\w+ ){0,1}(direction|angle|way|spacing|slope|pattern)|(hatch\\w*|lines|drawn|done|slop\\w*|go|run|goes|runs) (\\w+ ){0,3}(opposite|differently|in reverse|the other way)|opposite (to|of)|(reverse|reversed|flipped|mirrored) (direction|angle))"]},
            ],
            sample: "The hatching is done with thin lines at 45 degrees, evenly spaced. The cover is hatched in the opposite direction to the housing so you can tell the two parts apart, and the upper and lower areas of the housing are hatched the same way.",
            model: "<ul><li>Thin lines at 45°, evenly spaced (1)</li><li>Both areas of one part (the housing) hatched the same direction and spacing (1)</li><li>Adjacent part (cover) hatched in the opposite direction or at a different spacing, so the boundary is obvious (1)</li></ul><p>Any 2.</p>" },
        ],
      },
      /* ------------------------------------------------------------ 03 */
      {
        id: "std-03",
        style: "Scenario question · identify errors and interpret",
        stem: "<p>A trainee has dimensioned the plate below. Three mistakes, marked A, B and C, break the drawing standard.</p>",
        figure: fig3,
        parts: [
          { label: "(a)", type: "text", marks: 3, rows: 6,
            q: "For each of the mistakes A, B and C, state what is wrong. [3]",
            points: [
              {"desc":"A: the extension lines start on the outline instead of leaving a small gap","negOK":true,"any":["(?:extension|projection|dimension|these|the) lines? (?:\\w+ ){0,4}(?:touch\\w*|start\\w* (?:on|at|from)|begin\\w*|meet\\w*|hit|against|directly|close)","touch\\w* (?:\\w+ ){0,3}(?:the )?(?:outline|object|plate|edge|shape|part)","(?:join\\w*|connect\\w*|attach\\w*|right up to|all the way to|run up to|go up to) (?:\\w+ ){0,2}(?:the )?(?:outline|object|plate|edge|shape|part)","\\b(?:no|without a|missing|lack of a?) (?:small |visible )?(?:gap|space)","\\bgap (?:\\w+ ){0,2}(?:between|from|to|before|missing|needed|required)","(?:leave|left|leaving|need|needs|should have|must have|add) (?:a )?(?:small |short )?(?:gap|space)"],"not":["(?:gap|space)(?: \\w+){0,3} (?:is |are )?(?:wrong|incorrect|a mistake|the mistake|the problem|an error)","(?:leave|leaves|left|leaving|has|have|with|there is|there's) (?:a )?(?:small |short |visible |large |big )?(?:gap|space)(?: \\w+){0,4} (?:wrong|incorrect|mistake|error|problem)","(?:is|are|was) (?:not|never) (?:\\w+ ){0,3}(?:touch\\w*|start\\w*|join\\w*|connect\\w*|close)","(?:\\bis|\\bare|there's|there is) (?:a|some) (?:small |visible |short )?gap(?: \\w+){0,3}(?: between| from| to)"]},
              {"desc":"B: the hole is dimensioned to hidden detail (dashed lines) instead of the view where it is seen as an outline","negOK":true,"any":["(?:dimension\\w*|measur\\w*|sized?|sizing|taken|used|given|put|placed|extension lines?)(?: \\w+){0,4} (?:from|to|off|on|using|with|at|against)? ?(?:the |its |two )?(?:hidden|dashed|broken|dotted)","(?:hidden|dashed|broken|dotted) (?:\\w+ ){0,2}(?:lines?|detail|edges?|features?|parts?) (?:\\w+ ){0,2}(?:is |are |being |has been |were |was )?(?:dimension\\w*|measur\\w*|used|sized)","(?:hidden|dashed) (?:\\w+ ){0,2}(?:dimension\\w*|measur\\w*)","(?:dimension\\w*|size|sizing) (?:the )?(?:hole|diameter|circle)(?: \\w+){0,4} (?:hidden|dashed|broken|dotted)"],"not":["(?:\\b(?:is|are|was|were|has been|have been) (?:not|never)|(?:isn|aren|wasn|weren)'t)(?: \\w+){0,3} (?:dimension\\w*|measur\\w*|sized?|taken|used|hidden|dashed)","(?:should|must|ought to|needs? to|has to|have to|supposed to|better to)(?: (?!not\\b|never\\b)\\w+){0,4} (?:dimension\\w*|measur\\w*|sized?|given|taken)(?: \\w+){0,4} (?:to|from|on|using|with|at) (?:the |its |two )?(?:hidden|dashed|broken|dotted)"]},
              {"desc":"C: the overall width 220 is dimensioned twice (a size must be dimensioned once)","negOK":true,"any":["(?:dimension\\w*|measure\\w*|shown|given|stated|labelled|included|written|put|marked) (?:\\w+ ){0,1}(?:twice|two times|more than once|again|2 times)","(?:repeated|duplicate\\w*|redundant|repeats?) (?:\\w+ ){0,2}(?:dimension\\w*|size|width|220|measure\\w*)","(?:size|width|220|dimensions?) (?:\\w+ ){0,2}(?:is |are |has been |was )?(?:repeated|duplicated|redundant|unnecessary)","already (?:been )?(?:given|shown|dimensioned|stated)","(?:width|220|same size|same dimension)(?: \\w+){0,4} (?:twice|two times|again|2 times|two places)","(?:dimension\\w*|given|shown|stated|put|included|labelled|marked|written)(?: \\w+){0,3} (?:a |the )?(?:second|2nd|another|extra|additional) (?:time|occasion|one)"],"not":["(?:\\b(?:is|are|was|were|has been|have been) (?:not|never)|(?:isn|aren|wasn|weren)'t)(?: \\w+){0,3} (?:(?:\\w+ )?(?:dimension\\w*|repeated|duplicated|redundant|given|shown|twice))","(?:should|must|needs? to|has to|ought to|supposed to|better|ok|okay|fine|correct|allowed|acceptable)(?: (?!not\\b|never\\b)\\w+){0,4} (?:dimension\\w*|given|shown|stated|included|written|put|repeated)(?: \\w+){0,3} (?:twice|two times|more than once|again|2 times)"]},
            ],
            sample: "A: the extension lines touch the outline, there should be a small gap. B: the hole is dimensioned to the dashed hidden lines, but it should be dimensioned where it shows as a circle. C: the 220 width is dimensioned twice, which is repeated and unnecessary.",
            model: "<ul><li>A: extension lines touch the outline; leave a small gap (1)</li><li>B: dimensioning to hidden detail; dimension the hole where it is seen as an outline (the circle in the plan) (1)</li><li>C: the same size given twice; each feature is dimensioned once only (1)</li></ul>" },
          { label: "(b)", type: "mcq", marks: 1, q: "A nut is dimensioned 60AF. What does 60AF mean?",
            opts: ["60 mm across the corners", "A 60° angle between two flats", "60 mm between two parallel flat faces", "60 mm along the thread"], a: 2,
            why: "AF is across flats: the distance between two parallel flat faces of the hexagon, which is the spanner size. AC is across corners and is always larger." },
        ],
      },
      /* ------------------------------------------------------------ 04 */
      {
        id: "std-04",
        style: "Calculation and comparison · calculate and compare",
        stem: "<p>A bar carries three holes. The holes are located by chain dimensions taken from the left end, as shown. All sizes are in millimetres.</p>",
        figure: fig4,
        parts: [
          { label: "(a)", type: "num", marks: 1, unit: "mm", a: 95.6, tol: 0.001, q: "Calculate the largest possible distance from the left end of the bar to the centre of the third hole.",
            why: "In a chain each hole is positioned from the one before, so every limit can be at its upper end together: 30.2 + 45.2 + 20.2 = 95.6 mm." },
          { label: "(b)", type: "num", marks: 1, unit: "mm", a: 94.4, tol: 0.001, q: "Calculate the smallest possible distance from the left end of the bar to the centre of the third hole.",
            why: "Lower limits together: 29.8 + 44.8 + 19.8 = 94.4 mm. The third hole can vary by ±0.6, three times the tolerance on any one dimension." },
          { label: "(c)", type: "text", marks: 2, rows: 4,
            q: "Compare chain dimensioning with parallel dimensioning. [2]",
            points: [
              { desc: "Chain: each size runs from one feature to the next, so errors add up (accumulate)", group: "chain", win: 90, negOK: true, not: STD04_VETO,
                any: [R`${CH}${C(STOP_POS, 110)}${NOT_BEFORE}${ACC}`, R`${NOT_BEFORE}${ACC}${C(STOP_POS + R`|,`, 60)}${CH}`] },
              { desc: "Chain: each size runs end to end, from the previous feature to the next", group: "chain", win: 90, negOK: true, not: STD04_VETO,
                any: [R`${CH}${C(STOP_POS, 90)}(?:next|previous|preceding|prior|end.to.end|one after|feature to feature|hole to hole|one to (?:the )?(?:next|another)|(?:last|one before)\b|link\w*|follow\w* on|where the (?:last|previous)|each other|a string|in a row|in sequence|in series)`,
                      R`(?:end.to.end|hole to hole|feature to feature|one after (?:the )?other)${C(STOP_POS + R`|,`, 40)}${CH}`] },
              { desc: "Parallel: every size is taken from the same datum (one reference edge)", group: "par", win: 90, negOK: true, not: STD04_VETO,
                any: [R`${PA}${C(STOP_POS, 110)}${DAT}`, R`${DAT}${C(STOP_POS + R`|,|\band\b`, 60)}${PA}`] },
              { desc: "Parallel: each size is independent, so the error in one does not affect the others", group: "par", win: 90, negOK: true, not: STD04_VETO,
                any: [R`${PA}${C(STOP_POS, 120)}${IND}`, R`${IND}${C(STOP_POS + R`|,`, 50)}${PA}`] },
              { desc: "Both use dimensions to locate several features along one direction", win: 60, negOK: true, not: STD04_VETO,
                all: [R`\bboth\b (?:\w+ ){0,6}(?:locate|position|show|give|use|measure|dimension)`] },
            ],
            sample: "In chain dimensioning each size goes from one feature to the next, so the errors add up along the chain. In parallel dimensioning every size is measured from the same datum edge, so each size is independent of the others.",
            model: "<ul><li>Chain: each dimension runs from the previous feature, so tolerance errors accumulate (1)</li><li>Parallel: all dimensions are measured from one datum, so each is independent and errors do not accumulate (1)</li><li>Also acceptable: both locate features along one direction; chain shows the distance between neighbouring features clearly (1)</li></ul><p>Name both sides: a statement about only one method is not a comparison.</p>" },
        ],
      },
      /* ------------------------------------------------------------ 05 */
      {
        id: "std-05",
        style: "Scenario question · identify, calculate and explain",
        stem: "<p>Three tolerances from a production drawing of a gun-carriage component are shown, marked X, Y and Z. Size Z is the diameter of a spindle that has to turn freely in a bearing, and it is marked F (functional).</p>",
        figure: fig5,
        parts: [
          { label: "(a)", type: "match", q: "Match each tolerance to the method used to write it.", marks: 3,
            pairs: [["X", "Common tolerance"], ["Y", "Asymmetrical tolerance"], ["Z", "Symmetrical tolerance"]] },
          { label: "(b)", type: "num", marks: 1, unit: "mm", a: 24.75, tol: 0.001, q: "State the minimum size permitted by tolerance Y.",
            why: "The lower deviation is −0.25, so the minimum is 25 − 0.25 = 24.75 mm. (The maximum is 25 + 0.15 = 25.15.) Do not use the upper deviation." },
          { label: "(c)", type: "text", marks: 2, rows: 4,
            q: "Explain why a functional dimension is usually given a stricter tolerance than a non-functional dimension. [2]",
            points: [
              { desc: "A functional size decides whether the parts fit and work, so it must be controlled closely (small tolerance)", win: 85, negOK: true, not: STD05_VETO,
                all: [R`\b(?:fit|fits|fitting|work|works|working|operate|operates|assemble\w*|mate|mates|perform\w*|function|functions|move|moves|slide|slides|rotate|rotates|turn|turns|together|mesh|interlock|jam|jams|seize|seizes|rattle|match)\b`,
                      R`(?<!n't )(?<!not )(?<!no )(?<!less )(?<!never )(?:${TIGHTW} (?:\w+ ){0,1}(?:tolerances?|limits?|margins?|variation|control|measure\w*)|(?:tolerances?|limits?|margins?|variation)s? (?:\w+ ){0,3}(?:tight|small|narrow|strict|close|precis|accura|exact|minimal|kept low)|(?:made|machined|manufactured|produced|controlled|kept|cut) (?:\w+ ){0,2}(?:precisely|accurately|exactly|closely|tightly)|(?:must|have to|has to|need to|needs to|should|got to) be (?:\w+ ){0,1}(?:precise|accurate|exact)|kept (?:very )?(?:accurate|precise|exact)|(?:only )?(?:a )?(?:small|little|tiny|slight|minimal) (?:amount of )?(?:variation|error|difference|deviation|play))`] },
              { desc: "A non-functional size does not affect how the part works, so a larger (rougher) tolerance is acceptable", win: 60, negOK: true, not: STD05_VETO,
                all: [R`(?:non.?functional|not functional|(?:isn't|aren't|not|less|un)(?: \w+){0,2} (?:essential|important|critical|vital|crucial)|(?:other|remaining|minor|rest of the) (?:sizes?|dimensions?|ones|features?)|(?:don't|doesn't|do not|does not) (?:matter|affect|change|alter|impact)|makes? no difference|no effect|unimportant)`,
                      R`(?:${LOOSEN}|(?:tolerances?|limits?) (?:\w+ ){0,2}(?:larger|bigger|wider|looser|greater|relaxed|rougher)|can (?:be |have |vary )(?:\w+ ){0,2}(?:looser|rougher|sloppier|wider|larger|bigger|less (?:precise|accurate|exact|strict|tight)|loose|rough|sloppy|relaxed)|less (?:precise|accurate|exact|strict|tight)|(?:more|greater|bigger|wider) (?:variation|leeway|room)|(?:not as|need not be as) (?:precise|accurate|exact|tight|strict)|(?:don't|doesn't|do not|does not) need to be (?:as )?(?:exact|precise|accurate|tight|strict)|(?:a bit|slightly|a little) (?:out|off|loose|rough|sloppy|inaccurate|less)|rough\w*|looser|sloppy)`] },
              { desc: "Tight tolerances cost more (more careful machining, inspection, rejects), so they are used only where needed", win: 90, negOK: true, not: STD05_VETO,
                any: [R`${TIGHTW} (?:\w+ ){0,1}(?:tolerances?|limits|machining|manufactur\w*|work|parts?|fits?)${C(R`n't|\bnot\b|\bno\b|never|without|cheap`, 55)}(?:cost\w*|expensive|slow\w*|more time|reject\w*|scrap|inspect\w*|waste\w*)`,
                      R`(?:cost\w*|expensive|take longer|more time|slower|more rejects|more money)${C(R`n't|\bnot\b|\bno\b|never|without|cheap`, 50)}${TIGHTW} (?:\w+ ){0,1}(?:tolerances?|limits|machining|work|parts?)`,
                      R`(?:looser|larger|bigger|wider|rougher|less (?:precise|accurate|exact|strict|tight)|relaxed|rough\w*)${C(R`n't|\bnot\b|\bno\b|never|without`, 45)}(?:cheaper|quicker|faster|saves? (?:time|money)|saving|less expensive|cost\w* less|lower cost|reduce\w* cost|inexpensive)`] },
            ],
            sample: "A functional size decides whether the parts fit together and work, so it has to be kept within a tight tolerance. A non-functional size has little effect on how the part works, so it can have a looser tolerance, which is cheaper and quicker to make.",
            model: "<ul><li>Functional sizes decide whether parts fit and work, so they need a small tolerance (1)</li><li>Non-functional sizes are not essential to the function, so a larger tolerance is acceptable and the part is cheaper to make (1)</li><li>Also acceptable: tight tolerances cost more in machining, inspection and rejects, so they are used only where needed (1)</li></ul>" },
        ],
      },
      /* ------------------------------------------------------------ 06 */
      {
        id: "std-06",
        style: "Scenario question · name and state",
        stem: "<p>A notched block is drawn in third-angle projection. Three views are labelled X, Y and Z. Z has been viewed from the right-hand end of the block.</p>",
        figure: fig6,
        parts: [
          { label: "(a)", type: "match", q: "Match each view to its course name.", marks: 3,
            pairs: [["X", "Plan"], ["Y", "Elevation"], ["Z", "End elevation"]] },
          { label: "(b)", type: "text", marks: 1, minWords: 3, rows: 2,
            q: "A further end elevation, viewed from the left-hand end of the block, is needed. State where it is drawn on the sheet. [1]",
            points: [
              { desc: "To the left of the elevation (on the side it is viewed from)", any: ["(to|on|at) the left", "left (of|side of|hand side of|beside|next to) .{0,25}(elevation|view|y)", "opposite side"] },
            ],
            sample: "It goes on the left of the elevation, on the side it was viewed from.",
            model: "<ul><li>On the left-hand side of the elevation: in third angle an end elevation is drawn on the side it is viewed from (1)</li></ul>" },
        ],
      },
      /* ------------------------------------------------------------ 07 */
      {
        id: "std-07",
        style: "Scenario question · identify and explain",
        stem: "<p>Every drawing sheet in the shipyard carries the projection symbol for the system the course uses. Three symbols, A, B and C, are shown.</p>",
        figure: fig7,
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "Which symbol is the third-angle projection symbol?",
            opts: ["Symbol A", "Symbol B", "Symbol C", "None of them"], a: 1,
            why: "The third-angle symbol is a truncated cone: its elevation, with the view from its small end drawn on the left (two concentric circles). Symbol A has the circles on the right, which is the first-angle arrangement; symbol C shows only the end view." },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain why the projection symbol is put on a production drawing. [2]",
            points: [
              { desc: "It tells the reader which projection system (third angle or first angle) the views use", win: 80, negOK: true,
                any: [R`(?:tell|show|state|indicat|identif|say|know|let|explain|confirm|specif|make)\w*(?: \w+){0,8} (?:which|what|if|whether)(?: \w+){0,5} (?:system|angle|projection|method|layout|type|orthographic)`,
                      R`(?:whether|if|which)(?: \w+){0,5} (?:first|third|1st|3rd)[ -]angle`,
                      R`(?:first|third|1st|3rd)[ -]angle(?: \w+){0,6} (?:or|not|rather than)`,
                      R`(?:identif|show|state|tell|indicat|say|specif|define|confirm|mean)\w*(?: \w+){0,5} (?:projection|orthographic|angle)(?: \w+){0,2} (?:method|system|type|used|layout|standard|in use)`,
                      R`(?:shows|states|means|tells \w+|says|says it) (?:\w+ ){0,3}(?:is|are|in|uses?) (?:\w+ ){0,2}(?:third|3rd|first|1st)[ -]angle`,
                      R`(?:drawn|done|used|laid out|produced) (?:in|using) (?:\w+ )?(?:first|third|1st|3rd)`,
                      R`(?:type|kind|method|system) of (?:orthographic )?(?:projection|angle)`],
                not: [R`(?:\b(?:is|are|was|were|has been|have been) (?:not|never)|(?:isn|aren|wasn|weren)'t)(?: \w+){0,3} (?:(?:\w+ )?(?:first|third|1st|3rd))`, R`(?:\bnot\b|\bnever\b|\bcannot\b|n't\b)[^.;,]{0,12}\b(?:tell|show|state|indicat|identif|say)`] },
              { desc: "So the views are read in the right places (otherwise the plan and end elevation would be misread, mixed up or muddled)", win: 80, negOK: true,
                any: [R`(?:mis-?read|mis-?interpret|misunderst|mis-?understood|mixed? up|mix-?ups?|muddl|jumbl|confus|swapp?|got wrong|wrong way)\w*(?: \w+){0,4} (?:views?|plan|elevations?|drawing|projection|it|them|part|sides?)`,
                      R`(?:views?|plan|elevations?|drawing|it|them|sides?|part)(?: [\w']+){0,4} (?:mis-?read|mis-?interpret\w*|mis-?understood|misunderstood|mixed up|muddled|confused|swapped|wrongly|incorrectly)`,
                      R`(?:read|interpret|understand|set out|arrange|laid out|place|put|draw)\w*(?: \w+){0,5} (?:right|correct|proper|same|wrong|incorrect)\w* (?:way|place|position|order|manner|round|around)`,
                      R`(?:how|where)(?: \w+){0,3} (?:views?|plan|elevations?)(?: \w+){0,3} (?:arranged|laid|placed|positioned|set out|drawn|organi[sz]ed|go|goes|are|is|should)`,
                      R`(?:made|built|manufactured|produced|machined)\w*(?: \w+){0,3} (?:wrong\w*|incorrect\w*|differently|mirror\w*|back ?to ?front)`,
                      R`(?:arrange|lay|set|place|put|draw)\w*(?: \w+){0,3} (?:views?|plan|elevations?)(?: \w+){0,2} (?:differently|in different)`,
                      R`(?:avoid|prevent|stop)\w* (?:any |the )?(?:confusion|misunderstanding|misreading|mix.?ups?)`,
                      R`${NOT_BEFORE}(?<!not be )how to (?:read|interpret|understand|use|follow)\w* (?:the |these |those |each |all |every )?(?:views?|drawing|plan|elevations?|sheet)`,
                      R`${NOT_BEFORE}(?<!not be )(?:read|interpret|understand|follow|look at)\w*(?: \w+){0,3} (?:views?|drawing|plan|elevations?)(?: \w+){0,3} (?:correct\w*|properly|right\w*|accurate\w*|as intended|as they should|as meant)`,
                      R`(?:views?|drawing|plan|elevations?) (?:are |is |can be |will be |to be |get |gets )(?:\w+ ){0,2}${NOT_BEFORE}(?:understood|read|interpreted|followed)(?: \w+){0,2} (?:correct\w*|properly|right\w*|accurate\w*)`] },
            ],
            sample: "The symbol tells the reader whether the drawing is in first angle or third angle. Without it the views could be read the wrong way round, so the plan or end elevation might be misread and the part made wrongly.",
            model: "<ul><li>The symbol states which projection system the drawing uses (third angle, not first angle) (1)</li><li>so the reader knows where each view should be and does not misread the views, which would cause errors in manufacture (1)</li></ul>" },
        ],
      },
      /* ------------------------------------------------------------ 08 */
      {
        id: "std-08",
        style: "Scenario question · identify standard symbols",
        stem: "<p>The floor plan of a new shore-office washroom is drawn with BSI symbols. Five symbols are labelled A to E.</p>",
        figure: fig8,
        parts: [
          { label: "(a)", type: "match", q: "Match each labelled symbol to its name.", marks: 5,
            pairs: [["A", "Bath"], ["B", "Wash basin"], ["C", "WC"], ["D", "Door"], ["E", "Socket"]] },
        ],
      },
      /* ------------------------------------------------------------ 09 */
      {
        id: "std-09",
        style: "Scenario question · identify and explain",
        stem: "<p>The elevation of the washroom wall shows four window symbols, A to D.</p>",
        figure: fig9,
        parts: [
          { label: "(a)", type: "mcq", marks: 1, q: "Which statement describes the window shown by symbol D?",
            opts: ["It is hinged at the top", "It pivots about a horizontal axis", "It slides horizontally", "It is fixed and does not open"], a: 2,
            why: "The arrows point towards the centre division: the two panes slide horizontally. Symbol B is hinged at the top, C pivots about a horizontal axis, and the F in A marks a fixed window." },
          { label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Window B swings open from one edge. Explain how its symbol shows which edge it swings from. [2]",
            points: [
              {"desc":"The two lines meet in a point (converge)","win":80,"any":["(?:lines?|diagonals?|strokes?|sides)(?: \\w+){0,3} (?:meets?|join\\w*|converg\\w*|come together|come to|touch\\w*|cross\\w*)","(?:meet|join|converge)\\w*(?: \\w+){0,1} (?:a |the |at a )?(?:point|apex)","(?:triangle(?:'s)?|vee|v[ -]shape(?:d)?|symbol)(?:,? [\\w']+){0,5},? (?:point\\w*|apex|tip|vertex)","(?:point|apex|tip|corner)(?: \\w+){0,3} (?:of the (?:triangle|symbol|lines?)|where the lines)"]},
              {"desc":"at the top edge (middle of the top), which is the hinged side","win":80,"any":["(?:hinge\\w*|pivot\\w*|swing\\w*|attached|opens? from)(?: \\w+){0,7} (?:top|upper)","top.?(?:hung|hinged)","hung (?:from|at) the top","(?:top|upper)(?: \\w+){0,3} (?:is |are )?(?:the )?(?:hinge|hinged|pivot|where (?:it|the window) (?:swings|is attached|opens))","(?:point|apex|tip|meet\\w*|converg\\w*)(?: \\w+){0,6} (?:top|upper)","(?:top|upper)(?: \\w+){0,4} (?:point|apex|tip)","(?:top|upper)(?: \\w+){0,6} (?:hinge\\w*|pivot\\w*)"],"not":["(?:\\b(?:is|are|was|were|has been|have been) (?:not|never)|(?:isn|aren|wasn|weren)'t)(?: \\w+){0,3} (?:(?:the )?(?:hinge\\w*|pivot\\w*|attached))"]},
            ],
            sample: "The two lines of the symbol meet at a point in the middle of the top edge, so the top is the hinged side, like the fold of a book.",
            model: "<ul><li>The two lines of the symbol meet at a point (1)</li><li>at the middle of the side that is hinged: here the top (1)</li></ul><p>The lines always meet at the hinge, so a side-hung window meets at the side and a bottom-hung one at the bottom.</p>" },
        ],
      },
      /* ------------------------------------------------------------ 10 */
      {
        id: "std-10",
        style: "Scenario question · identify and calculate",
        stem: "<p>The title block below is from a production drawing of a trunnion plate. Boxes A, B and C are labelled.</p>",
        figure: fig10,
        parts: [
          { label: "(a)", type: "match", q: "Match each box to the information it gives.", marks: 3,
            pairs: [["A", "How the size of the drawing compares with the real object"], ["B", "When the drawing was made"], ["C", "The unit of the sizes, so that mm need not be written after each one"]] },
          { label: "(b)", type: "num", marks: 1, unit: "mm", a: 425, tol: 0, q: "A bracket measures 85 mm on the drawing, which is drawn at the scale in box A. Calculate the real length of the bracket.",
            why: "The scale is 1:5, so real size = drawn size × 5 = 85 × 5 = 425 mm. Dimensions always state the real size, whatever the scale." },
        ],
      },
      /* ------------------------------------------------------------ 11 */
      {
        id: "std-11",
        style: "Scenario question · compare",
        stem: "<p>The shipyard design office is deciding whether its draughtspeople should produce the plans for a new gun-carriage by manual drawing or on a CAD system. The drawings will be revised several times after client meetings and some copies will go to a workshop abroad.</p>",
        parts: [
          { label: "(a)", type: "text", marks: 4, rows: 8,
            q: "Compare manual drawing with CAD for producing these plans. Make a point about each method. [4]",
            points: [
              std11("Changes: a manual drawing has to be redrawn or rubbed out, whereas a CAD model is edited once and the linked views update", MAN_CHG, CAD_CHG, R`redraw\w*|re.?draw\w*|rub\w*|erase\w*|edit\w*|updat\w*|chang\w*|automatic\w*|linked`),
              std11("Speed of ideas: a manual sketch is quick with no software or power, whereas CAD takes longer to set up or learn", MAN_SPD, CAD_SPD, R`quick\w*|fast\w*|simple|simpler|straight ?away|slow\w*|longer|learn\w*|set ?up`),
              std11("Accuracy: CAD gives accurate, consistent standard lines every time, whereas manual accuracy depends on the skill of the person", MAN_ACC, CAD_ACC, R`accura\w*|precis\w*|exact\w*|consistent\w*|standards?|repeat\w*`),
              std11("Sharing: a CAD file can be emailed, stored or sent to a machine, whereas a manual drawing has to be scanned or photocopied", MAN_SHR, CAD_SHR, R`email\w*|e-mail\w*|share\w*|cloud|cop(?:y|ied|ies)|stor\w*|send\w*|sent|machines?|cnc|manufactur\w*|online|internet|scan\w*|photocop\w*|posted|post`),
              std11("Cost: CAD needs expensive software, hardware and training, whereas manual drawing needs only cheap equipment", MAN_CST, CAD_CST, R`cheap\w*|inexpensive|affordable|expensive|cost\w*|money|training|licen[cs]e\w*|hardware`),
              std11("Realism: CAD can render a 3D model with materials and lighting, whereas a manual drawing is flat or slow to render by hand", MAN_REA, CAD_REA, R`render\w*|realistic|3d|three.?dimensional|materials?|lighting|shad\w*|flat|slow\w*`),
            ],
            sample: "With manual drawing a change means the sheet has to be redrawn by hand, whereas with CAD the model is edited once and the linked views update automatically. A manual sketch is quick and needs no software or power, but CAD takes longer to set up and learn. CAD gives accurate lines that follow the standard every time, while the accuracy of a manual drawing depends on the skill of the person. A CAD file can be emailed to the workshop abroad, but a paper drawing has to be scanned or photocopied.",
            model: "<ul><li>Changes: manual drawings must be redrawn, whereas a CAD model is edited once and the linked views update (1)</li><li>Idea speed: a manual sketch is quick and needs no software or power, whereas CAD takes time to set up and learn (1)</li><li>Accuracy: CAD lines are accurate and meet the standard every time, whereas manual accuracy depends on the person&rsquo;s skill (1)</li><li>Sharing: a CAD file can be emailed, stored or sent to a machine, whereas manual copies must be scanned or photocopied (1)</li><li>Also acceptable: cost (CAD software, hardware and training cost money, manual equipment is cheap); realism (CAD renders 3D models with materials and lighting) (1)</li></ul><p>Any 4. Each mark needs <em>both</em> methods, linked by &ldquo;whereas&rdquo;, &ldquo;but&rdquo; or &ldquo;while&rdquo;: a point about only one method is not a comparison.</p>" },
        ],
      },
      /* ------------------------------------------------------------ 12 */
      {
        id: "std-12",
        style: "Short question · identify and state",
        stem: "<p>The sheave assembly for the deck crew is drawn with several sectional views, and a parts list numbers every component.</p>",
        parts: [
          { label: "(a)", type: "match", q: "Match each type of section to its description.", marks: 3,
            pairs: [["Part section", "Only a local area is cut away, with an irregular freehand thin break line round it"], ["Revolved section", "The cross-section of an arm or rib is turned through 90° and drawn on the view itself"], ["Stepped section", "The cutting plane changes direction in steps, but the section is drawn as one flat plane"]] },
          { label: "(b)", type: "mcq", marks: 1, q: "The assembly contains two identical washers. How are they shown in the parts list?",
            opts: ["Each washer is given its own item number", "Both washers share one item number, with a quantity of 2", "Washers are left out because they are standard parts", "Only one washer is numbered and the other is hatched"], a: 1,
            why: "Identical parts carry one item number and a quantity. The storekeeper orders from the parts list, so two numbers would suggest two different parts." },
        ],
      },
    ],
  };
})();
