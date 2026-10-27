/* Past-paper practice: DTP features, design elements and principles. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HGP_BANK = window.HGP_BANK || {});

  /* shared "effect on the viewer" pattern for explain-type marking points */
  const EFF = "stand(s|ing)? out|stood out|noticed|noticeable|notice\\w*|prominent|obvious|eye.?catching|jump(s|ed|ing)? out|pop(s|ped)? out|(catch|grab|attract|draw|drew|caught|pull|pulls|pulled|direct|lead|guide)\\w*\\W+(\\w+\\W+){0,2}(eye|attention|gaze)|(eye|attention|gaze)\\W+(\\w+\\W+){0,3}(drawn|goes|go|pulled|attracted|caught|led|straight)|drawn (to|first)|focal|(seen|read|noticed|spotted) first|first thing|(first|immediately)\\W+(\\w+\\W+){0,2}(see|notice|read|spot)|easy to (see|spot|find|notice)|clearly visible";
  /* a linking word: real explanations say "so", "which", "because"; a list of terms does not */
  const CONN = "\\b(so|because|which|means|meaning|therefore|this|it|they|makes?|allows?|lets?|gives?)\\b";

  /* "after" helper: a lookbehind pattern whose match starts at the claim itself (after its subject), so a negator just before
     the claim ("the title is NOT spread across...") is seen by the marker's negation veto. */
  const AF = (x, n, y) => "(?<=(?:" + x + ")\\W+(?:\\w+\\W+){0," + n + "})(?:" + y + ")";
  const AFC = (ctx, y) => "(?<=" + ctx + ")(?:" + y + ")";
  const FULLCTX = "(?<!left[ -])(?:full(?:y)?[ -]justif\\w*|justified|justify)(?:(?!left)[^.;]){0,70}";
  const LEFTCTX = "\\bleft(?:[ -]?(?:justif\\w*|align\\w*|hand))?(?:(?!full|justif)[^.;]){0,80}";
  const SPACED = "(spac|interval|gap|equally|\\bevenly\\b|regularly|\\bequal\\b|same distance|apart)";
  const Y1 = "yellow\\W+(\\w+\\W+){0,1}(panel|box|band|background|block|strip|patch|area|shape|rectangle|banner|bar|label|highlight\\w*|oblong)|(panel|box|band|background|block|strip|patch|rectangle|banner|bar|highlight\\w*)\\W+(\\w+\\W+){0,2}yellow|highlight\\w*\\W+(\\w+\\W+){0,4}yellow";

  /* ---- small figure helpers (palette: ink, aubergine, magenta, yellow, cyan, paper, grey) ---- */
  const INK = "#1d1a14", AUB = "#2a1740", MAG = "#d4147a", YEL = "#f7d117", CYA = "#00a3d9", PAP = "#fffaf0", GRY = "#cbbd9b";
  const lab = (x, y, t) =>
    `<g><circle cx="${x}" cy="${y}" r="9.5" fill="${PAP}" stroke="${INK}" stroke-width="1.5"/><text x="${x}" y="${y + 4.5}" font-size="13" font-weight="700" fill="${INK}" text-anchor="middle">${t}</text></g>`;
  const lines = (x, y, widths, gap, fill) =>
    widths.map((w, i) => `<rect x="${x}" y="${y + i * (gap || 10)}" width="${w}" height="4" fill="${fill || GRY}"/>`).join("");
  const rect = (x, y, w, h, fill, extra) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra || ""}/>`;

  /* Figure 1: magazine spread, features A-F */
  const figSpread =
    `<svg viewBox="0 0 420 252" role="img" aria-label="A two-page magazine spread with six lettered features. A is a short line of text, Sailing News, repeated at the top of the left page. B is a large enlarged letter T opening the first paragraph. F is the narrow gap between the two text columns on the left page. E is the page number 12 in the bottom outer corner. D is a line of small italic text directly under the photograph on the right page. C is a short enlarged quotation between two magenta lines.">` +
    rect(10, 14, 195, 222, PAP, `stroke="${INK}" stroke-width="1.5"`) + rect(215, 14, 195, 222, PAP, `stroke="${INK}" stroke-width="1.5"`) +
    `<text x="22" y="34" font-size="11" font-weight="700" fill="#52308a" letter-spacing="1">SAILING NEWS</text>` + lab(130, 30, "A") +
    `<text x="22" y="62" font-size="24" font-weight="700" fill="${INK}">Race day</text>` +
    `<text x="22" y="118" font-size="34" font-weight="700" fill="${MAG}">T</text>` + lab(32, 80, "B") +
    lines(48, 98, [50, 50, 50], 10) + lines(22, 130, [76, 76, 76, 76, 76, 76, 76, 40], 10) +
    lines(114, 98, [76, 76, 76, 76, 76, 76, 76, 76, 76, 76, 40], 10) +
    `<path d="M105 186 V204" stroke="${INK}" stroke-width="1.2"/>` + lab(105, 214, "F") +
    `<text x="22" y="230" font-size="12" font-weight="700" fill="${INK}">12</text>` + lab(52, 226, "E") +
    rect(227, 40, 171, 72, "#cfe3ee") + rect(227, 90, 171, 22, "#4f7f98") +
    `<path d="M280 90 L340 90 L332 100 L288 100 Z" fill="#3b2a1a"/><path d="M310 90 V56" stroke="#3b2a1a" stroke-width="2"/><path d="M310 58 L330 86 L310 86 Z" fill="#fffaf0" stroke="#3b2a1a" stroke-width=".8"/>` +
    `<text x="227" y="128" font-size="11" font-style="italic" fill="${INK}">Reefed down off the pier</text>` + lab(386, 124, "D") +
    `<path d="M227 146 H398 M227 192 H398" stroke="${MAG}" stroke-width="2"/>` +
    `<text x="318" y="174" font-size="13" font-style="italic" fill="${INK}" text-anchor="middle">&#8220;Every flag speaks.&#8221;</text>` + lab(240, 169, "C") +
    lines(227, 202, [171, 171, 100], 10) +
    `<text x="398" y="230" font-size="12" font-weight="700" fill="${INK}" text-anchor="end">13</text>` +
    `</svg>`;

  /* Figure 2: open-evening poster */
  const pennants = [0, 1, 2, 3, 4, 5].map((i) => `<polygon points="${28 + i * 44},94 ${58 + i * 44},94 ${43 + i * 44},118" fill="${MAG}"/>`).join("");
  const badges = [[70, "FLY"], [150, "BUILD"], [230, "LEAD"]].map(([x, t]) => `<circle cx="${x}" cy="262" r="21" fill="${AUB}"/><text x="${x}" y="266" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">${t}</text>`).join("");
  const figPoster =
    `<svg viewBox="0 0 300 400" role="img" aria-label="A recruitment poster for an open evening. A dark aubergine band across the top carries the title OPEN EVENING in large white capitals. Below it a row of six identical magenta pennants is spaced equally. A wide photograph of an aircraft fills the width. Under it are three equal dark circles labelled FLY, BUILD and LEAD. A bright yellow panel carries the date and time in bold dark capitals. A small logo and two lines of text are at the foot.">` +
    rect(0, 0, 300, 400, PAP, `stroke="${INK}" stroke-width="1.5"`) + rect(0, 0, 300, 84, AUB) +
    `<text x="150" y="52" font-size="30" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="1">OPEN EVENING</text>` +
    `<text x="150" y="74" font-size="13" font-weight="700" fill="#ff6fb1" text-anchor="middle">1805 (BLOCKHAVEN) SQUADRON</text>` + pennants +
    rect(20, 128, 260, 104, "#cfe3ee") + rect(20, 200, 260, 32, "#4f7f98") +
    `<path d="M70 182 L210 172 L236 178 L210 186 Z" fill="${AUB}"/><polygon points="132,178 160,148 174,150 160,180" fill="#52308a"/><polygon points="206,174 218,156 226,157 224,175" fill="#52308a"/>` +
    badges + rect(20, 296, 260, 44, YEL) +
    `<text x="150" y="325" font-size="17" font-weight="700" fill="${AUB}" text-anchor="middle">FRI 14 MARCH &#183; 7 PM</text>` +
    lines(20, 352, [170, 130], 12) + `<circle cx="250" cy="364" r="15" fill="${MAG}"/>` +
    `</svg>`;

  /* Figure 3: A4 leaflet page on a three-column grid (scale 1.2 px per mm) */
  const figGrid =
    `<svg viewBox="0 0 292 400" role="img" aria-label="An A4 leaflet page drawn with its grid shown in pale blue. There are margins around the edge and three narrow columns separated by two gutters. The title spans all three columns. A photograph spans the first two columns. A pull quote between two magenta lines sits in the third column. Body text runs in short lines in each of the three columns. M marks the margin on the left of the page and G marks the first gutter, between column one and column two.">` +
    rect(20, 20, 252, 356, PAP, `stroke="${INK}" stroke-width="1.5"`) +
    [44, 116, 188].map((x) => rect(x, 36, 60, 324, CYA, `opacity=".13"`)).join("") +
    [44, 104, 116, 176, 188, 248].map((x) => `<path d="M${x} 28 V368" stroke="${CYA}" stroke-width=".8" stroke-dasharray="4 3"/>`).join("") +
    rect(44, 46, 204, 36, AUB) + `<text x="146" y="71" font-size="20" font-weight="700" fill="#fff" text-anchor="middle">SUMMER FAIR</text>` +
    rect(44, 96, 132, 96, "#cfe3ee") + rect(44, 160, 132, 32, "#4f7f98") + `<path d="M70 160 L150 160 L142 170 L78 170 Z" fill="#3b2a1a"/><path d="M110 160 V120" stroke="#3b2a1a" stroke-width="2"/>` +
    `<path d="M188 100 H248 M188 188 H248" stroke="${MAG}" stroke-width="2"/><g font-size="12" font-style="italic" fill="${INK}" text-anchor="middle"><text x="218" y="132">&#8220;Sail,</text><text x="218" y="148">build,</text><text x="218" y="164">signal.&#8221;</text></g>` +
    [44, 116, 188].map((x) => lines(x, 206, [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 40], 11.5)).join("") +
    `<path d="M32 200 H44" stroke="${INK}" stroke-width="1.2"/>` + lab(30, 224, "M") +
    `<path d="M110 360 V374" stroke="${INK}" stroke-width="1.2"/>` + lab(110, 386, "G") +
    `</svg>`;

  /* Figure 4: printer's proof sheet */
  const figProof =
    `<svg viewBox="0 0 300 300" role="img" aria-label="A printer's proof sheet. A navy poster with the word REGATTA in white fills the middle. A thin dashed white line marks the final trimmed edge, and the navy colour runs a little way beyond it to the edge of the navy area. Short thin black lines at the four corners of the sheet, outside the navy, are labelled A. Small circles with cross-hairs at the middle of the top edge and the middle of the left edge are labelled B. The narrow navy strip between the dashed line and the outer edge of the navy is labelled C.">` +
    rect(4, 4, 292, 292, "#ffffff", `stroke="${GRY}" stroke-width="1"`) + rect(42, 42, 216, 216, AUB) +
    `<text x="150" y="160" font-size="26" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing="2">REGATTA</text>` +
    rect(60, 60, 180, 180, "none", `stroke="#fff" stroke-width="1.5" stroke-dasharray="6 4"`) +
    `<g stroke="${INK}" stroke-width="1.2" fill="none"><path d="M60 14 V34 M240 14 V34 M60 266 V286 M240 266 V286 M14 60 H34 M14 240 H34 M266 60 H286 M266 240 H286"/>` +
    `<circle cx="150" cy="24" r="8"/><path d="M150 13 V35 M139 24 H161"/><circle cx="24" cy="150" r="8"/><path d="M24 139 V161 M13 150 H35"/></g>` +
    lab(88, 24, "A") + lab(186, 24, "B") + `<path d="M178 24 H160" stroke="${INK}" stroke-width="1"/>` +
    lab(274, 150, "C") + `<path d="M265 150 H252" stroke="${INK}" stroke-width="1.2"/><path d="M252 150 L257 146 M252 150 L257 154" stroke="${INK}" stroke-width="1.2"/>` +
    `</svg>`;

  /* Figure 5: web banner */
  const figBanner =
    `<svg viewBox="0 0 420 86" role="img" aria-label="A wide web banner, 728 by 90 pixels. On a dark aubergine background are a round yellow squadron logo at the left labelled A, the words PLAY BLOCKHAVEN in large yellow capitals with a line of small white text under them, and a magenta rounded button at the right reading JOIN NOW labelled B.">` +
    rect(10, 22, 400, 58, AUB, `rx="3"`) + `<circle cx="44" cy="51" r="19" fill="${YEL}"/><path d="M34 62 L44 38 L54 62 Z" fill="${AUB}"/>` + lab(44, 11, "A") +
    `<text x="76" y="47" font-size="19" font-weight="700" fill="${YEL}">PLAY BLOCKHAVEN</text><text x="76" y="67" font-size="11" fill="#fff">Season 4 starts on Friday</text>` +
    `<rect x="316" y="37" width="86" height="28" rx="7" fill="${MAG}"/><text x="359" y="56" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">JOIN NOW</text>` + lab(359, 11, "B") +
    `</svg>`;

  /* Figure 6: dinner invitation */
  const figInvite =
    `<svg viewBox="0 0 300 336" role="img" aria-label="A dinner invitation card. The title Regatta Dinner is large, italic and centred at the top. Below it, labelled B, is a paragraph of four lines whose left edges line up and whose right edges are uneven. Labelled C is a list of three items in which the first line of each item starts at the left and the later line is indented to the right. At the foot, labelled D, is a dark aubergine strip carrying the words RSVP BY 1 MAY in white.">` +
    rect(10, 10, 280, 316, PAP, `stroke="${INK}" stroke-width="1.5"`) +
    `<text x="150" y="62" font-size="29" font-weight="700" font-style="italic" fill="${MAG}" text-anchor="middle">Regatta Dinner</text>` +
    lines(30, 92, [226, 198, 232, 164], 12) + lab(274, 106, "B") +
    [0, 1, 2].map((i) => rect(30, 170 + i * 28, 206, 4, GRY) + rect(48, 179 + i * 28, 120, 4, GRY)).join("") +
    lab(274, 198, "C") + rect(40, 268, 220, 36, AUB) +
    `<text x="150" y="292" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">RSVP BY 1 MAY</text>` + lab(276, 286, "D") +
    `</svg>`;
  
  /* Figure 7: one page of the regatta programme */
  const figPage =
    `<svg viewBox="0 0 300 336" role="img" aria-label="Page 3 of a regatta programme with five lettered features. A is the line REGATTA PROGRAMME across the top of the page. B is the page number 3 at the bottom outer corner. C is a photograph of boats on the water. E is a line of small italic text under the photograph. D is a short enlarged quotation in a box with a magenta line above and below it. Body text fills the rest of the page.">` +
    rect(10, 10, 280, 316, PAP, `stroke="${INK}" stroke-width="1.5"`) +
    `<text x="28" y="36" font-size="12" font-weight="700" fill="#52308a" letter-spacing="1">REGATTA PROGRAMME</text>` + lab(262, 32, "A") + `<path d="M28 44 H272" stroke="${GRY}" stroke-width="1"/>` +
    rect(28, 56, 244, 96, "#cfe3ee") + rect(28, 120, 244, 32, "#4f7f98") + `<path d="M90 122 L170 122 L160 134 L100 134 Z" fill="#3b2a1a"/><path d="M130 122 V82" stroke="#3b2a1a" stroke-width="2"/><path d="M130 84 L156 118 L130 118 Z" fill="#fffaf0" stroke="#3b2a1a" stroke-width=".8"/>` + lab(252, 72, "C") +
    `<text x="28" y="168" font-size="11" font-style="italic" fill="${INK}">The fleet leaves the dock at dawn</text>` + lab(252, 164, "E") +
    lines(28, 184, [118, 118, 118, 118, 118, 118, 118, 70], 11) +
    `<path d="M164 188 H272 M164 262 H272" stroke="${MAG}" stroke-width="2"/><g font-size="13" font-style="italic" fill="${INK}" text-anchor="middle"><text x="218" y="214">&#8220;The tide waits</text><text x="218" y="232">for nobody.&#8221;</text></g>` + lab(262, 280, "D") +
    `<text x="272" y="314" font-size="13" font-weight="700" fill="${INK}" text-anchor="end">3</text>` + lab(246, 309, "B") +
    `</svg>`;

  /* Figure 8: leaflet cover colours */
  const figColour =
    `<svg viewBox="0 0 300 330" role="img" aria-label="The cover of a summer fair leaflet in three horizontal bands of warm colour: yellow at the top carrying the title SUMMER FAIR in dark capitals, orange in the middle carrying Saturday 21 June, and red-orange at the foot carrying Blockhaven Dock in white. A cyan-blue circle on the right edge of the middle band carries the words TICKETS 5 pounds in dark text.">` +
    rect(0, 0, 300, 110, YEL) + rect(0, 110, 300, 110, "#f28a1e") + rect(0, 220, 300, 110, "#e8542a") +
    `<text x="150" y="68" font-size="30" font-weight="700" fill="${AUB}" text-anchor="middle">SUMMER FAIR</text>` +
    `<text x="22" y="170" font-size="17" font-weight="700" fill="${AUB}">Saturday 21 June</text>` +
    `<text x="22" y="282" font-size="17" font-weight="700" fill="#fff">Blockhaven Dock</text>` +
    `<circle cx="232" cy="165" r="44" fill="${CYA}"/><text x="232" y="160" font-size="12" font-weight="700" fill="${INK}" text-anchor="middle">TICKETS</text><text x="232" y="180" font-size="18" font-weight="700" fill="${INK}" text-anchor="middle">&#163;5</text>` +
    `</svg>`;

  /* Figure 9: magazine cover */
  const coverLines = [[150, 128], [162, 124], [174, 118], [186, 114], [198, 112], [210, 110], [222, 109], [234, 109], [246, 109]].map(([y, e]) => rect(20, y, e - 20, 4, "#fffaf0", `opacity=".9"`)).join("");
  const figCover =
    `<svg viewBox="0 0 300 400" role="img" aria-label="A magazine cover with a light blue background. The masthead SAIL is in huge dark capitals across the top. A cut-out figure of a pilot in dark clothing, labelled A, stands right of centre; the head overlaps the end of the masthead and there is no photo background around the figure. To the left, labelled B, short lines of white text get shorter as they follow the curve of the figure's shoulder. Near the bottom, labelled C, a pale see-through panel carries the words WIN A FLIGHT. Labelled D, a magenta circle reading NEW has a dark soft shadow offset behind it.">` +
    rect(0, 0, 300, 400, "#9fd6ea", `stroke="${INK}" stroke-width="1.5"`) +
    `<text x="18" y="84" font-size="72" font-weight="700" fill="${AUB}" letter-spacing="4">SAIL</text>` +
    `<circle cx="196" cy="100" r="27" fill="#52308a" stroke="#fffaf0" stroke-width="2"/><path d="M128 280 Q128 140 196 128 Q262 140 262 280 Z" fill="#52308a" stroke="#fffaf0" stroke-width="2"/>` +
    lab(280, 150, "A") + coverLines + lab(52, 130, "B") +
    rect(20, 296, 260, 64, "#fffaf0", `opacity=".6"`) + `<text x="150" y="336" font-size="22" font-weight="700" fill="${AUB}" text-anchor="middle">WIN A FLIGHT</text>` + lab(36, 328, "C") +
    `<circle cx="252" cy="262" r="26" fill="${INK}" opacity=".35"/><circle cx="247" cy="257" r="26" fill="${MAG}"/><text x="247" y="262" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">NEW</text>` + lab(284, 236, "D") +
    `</svg>`;

  /* Figure 10: raster against vector, both enlarged */
  let px = "";
  for (let gx = 0; gx < 10; gx++) for (let gy = 0; gy < 10; gy++) {
    const dx = gx - 4.5, dy = gy - 4.5;
    if (dx * dx + dy * dy <= 20) px += `<rect x="${20 + gx * 14}" y="${14 + gy * 14}" width="14" height="14" fill="${MAG}"/>`;
  }
  const figFiles =
    `<svg viewBox="0 0 360 200" role="img" aria-label="Two enlarged copies of a round magenta logo. Image A, on the left, has stepped, square-edged jagged outlines made of visible squares. Image B, on the right, is a perfectly smooth circle with a clean curved edge.">` +
    rect(10, 6, 160, 160, PAP, `stroke="${INK}" stroke-width="1.2"`) + px + rect(190, 6, 160, 160, PAP, `stroke="${INK}" stroke-width="1.2"`) +
    `<circle cx="270" cy="86" r="63" fill="${MAG}"/>` + lab(90, 184, "A") + lab(270, 184, "B") +
    `</svg>`;

  /* Figure 11: poster with numbered hotspots */
  const planks = [0, 1, 2, 3, 4, 5].map((i) => `<path d="M200 ${112 + i * 14} H310" stroke="#8a6a3a" stroke-width="1.2"/>`).join("");
  const figHot =
    `<svg viewBox="0 0 320 370" role="img" aria-label="A summer fair poster with four numbered hotspots. Hotspot 1 is a pale pink panel behind the dark red title. Hotspot 2 is a thick wavy magenta line under the title panel. Hotspot 3 is a panel on the right filled with a pattern of wooden planks. Hotspot 4 is a yellow circle containing the word FREE. A large dark photograph fills the left side and two smaller panels sit on the right, one of planks and one pale with text.">` +
    rect(4, 4, 312, 362, PAP, `stroke="${INK}" stroke-width="1.5"`) + rect(14, 14, 292, 62, "#f6c6dc") +
    `<text x="160" y="56" font-size="30" font-weight="700" fill="#8a0f4c" text-anchor="middle">SUMMER FAIR</text>` + lab(290, 30, "1") +
    `<path d="M14 86 Q40 76 66 86 T118 86 T170 86 T222 86 T274 86 T306 86" fill="none" stroke="${MAG}" stroke-width="3.5"/>` + lab(292, 84, "2") +
    rect(14, 100, 176, 196, AUB) + `<path d="M14 250 Q60 232 100 250 T190 250 V296 H14 Z" fill="#52308a"/><path d="M80 250 L120 250 L112 262 L88 262 Z" fill="#fffaf0"/><path d="M100 250 V190" stroke="#fffaf0" stroke-width="2.5"/><path d="M102 192 L130 244 L102 244 Z" fill="#fffaf0"/>` +
    `<circle cx="150" cy="134" r="24" fill="${YEL}"/><text x="150" y="139" font-size="13" font-weight="700" fill="${INK}" text-anchor="middle">FREE</text>` + lab(172, 112, "4") +
    rect(200, 100, 106, 92, "#c9a26a") + planks + lab(290, 116, "3") +
    rect(200, 204, 106, 92, "#fff3b0") + lines(210, 218, [86, 86, 86, 60], 12, "#a39883") +
    `<text x="160" y="330" font-size="13" font-weight="700" fill="${AUB}" text-anchor="middle">Saturday 21 June &#183; Blockhaven Dock</text>` +
    `</svg>`;

  /* Figure 12: two drafts of a leaflet page */
  const figDrafts =
    `<svg viewBox="0 0 440 250" role="img" aria-label="Two drafts of the same leaflet page side by side. In Draft A the heading, photograph, caption, price circle and Book now button are scattered at different positions with no common edge and the caption is far below the photograph. In Draft B the heading, photograph, caption and body text all start on one left edge, the caption sits directly beneath the photograph, the price and button are grouped together, and there is a wide empty column on the right, labelled E.">` +
    `<text x="110" y="14" font-size="13" font-weight="700" fill="${INK}" text-anchor="middle">Draft A</text><text x="330" y="14" font-size="13" font-weight="700" fill="${INK}" text-anchor="middle">Draft B</text>` +
    rect(10, 22, 200, 222, PAP, `stroke="${INK}" stroke-width="1.5"`) + rect(230, 22, 200, 222, PAP, `stroke="${INK}" stroke-width="1.5"`) +
    rect(36, 36, 90, 10, AUB) + rect(84, 62, 82, 52, "#cfe3ee") + `<circle cx="176" cy="148" r="17" fill="${MAG}"/>` + rect(20, 122, 54, 18, YEL) + lines(30, 208, [80], 10) + lines(100, 150, [70, 70, 70, 40], 10) +
    rect(242, 36, 70, 10, AUB) + lab(338, 41, "A") + rect(242, 56, 80, 56, "#cfe3ee") + lab(338, 84, "B") + lines(242, 118, [60], 10, "#8a7f66") + lab(338, 122, "C") +
    lines(242, 140, [80, 80, 80, 80, 50], 11) + `<circle cx="256" cy="214" r="14" fill="${MAG}"/>` + rect(278, 205, 46, 18, YEL) + lab(338, 214, "D") +
    rect(356, 36, 64, 196, "none", `stroke="${GRY}" stroke-width="1.5" stroke-dasharray="5 4"`) + lab(388, 134, "E") +
    `</svg>`;

  /* ---- the questions ---- */
  B.dtp = {
    intro:
      "Twelve scenario questions on <b>DTP features, design elements and principles</b> (67 marks, in the 20 to 30 mark area of the paper): magazine pages, posters, leaflets, a cover, a programme and a web banner. About half the marks are written answers (identify, describe, explain, compare), the rest are matching, multiple-choice and short calculations. Most questions have a layout to read, so name it, place it and say what it does.",
    questions: [
      {
        id: "dtp-01",
        style: "Layout with lettered features · identify",
        stem: "<p>The squadron's magazine, <i>Sailing News</i>, is laid out as a two-page spread. Features A to F are labelled on the figure.</p>",
        figure: figSpread,
        parts: [
          { type: "match", label: "(a)", marks: 5, q: "Identify the DTP features labelled A to E by matching each letter to its name.", pairs: [["A", "Running headline"], ["B", "Drop cap"], ["C", "Pull quote"], ["D", "Caption"], ["E", "Folio"]] },
          { type: "mcq", label: "(b)", marks: 1, q: "What is the name of the space labelled F, between the two columns of text?", opts: ["Margin", "Bleed", "Gutter", "Column rule"], a: 2, why: "The gap between two columns is the gutter. The margin is the space between the page edge and the content; a column rule would be a printed line standing in the gap." },
        ],
      },
      {
        id: "dtp-02",
        style: "Scenario question · explain and describe",
        stem: "<p>Flight Lieutenant Murray has designed a recruitment poster for the squadron's open evening. The date and time must be seen by anyone walking along a busy school corridor.</p>",
        figure: figPoster,
        parts: [
          {
            type: "text", label: "(a)", marks: 2, rows: 4,
            q: "Explain how emphasis has been created on the date and time.",
            points: [
              { desc: "Yellow (accent) panel or background behind the date, so it stands out / is noticed first", group: "p1", win: 60, all: [Y1, EFF] },
              { desc: "Date and time in bold or large capitals, so it stands out / is read first", group: "p2", win: 70, all: ["\\b(bold|large|big|bigger|larger|huge|capitals?|upper ?case|block letters)\\b", "\\b(date|time|text|writing|lettering|letters|words|numbers|font|print)\\b", EFF] },
              { desc: "Dark text on a light panel contrasts strongly, so it is clear / stands out", group: "p3", win: 90, all: ["(dark|navy|aubergine|purple|black)\\W+(\\w+\\W+){0,4}(on|against)\\W+(\\w+\\W+){0,2}(yellow|light|bright)|(yellow|light|bright)\\W+(\\w+\\W+){0,3}(behind|under|beneath|with)\\W+(\\w+\\W+){0,2}(dark|navy|aubergine|purple|black)", "contrast\\w*|stand\\w* out against|easy to read|readable|legible"] },
              { desc: "Only large yellow area / different from everything else, so the eye is drawn to it", group: "p4", win: 70, all: ["(only|single|sole|unlike|nothing else|no other)\\W+(\\w+\\W+){0,4}(yellow|that colour|same colour|colour)|(different|unlike|differs)\\W+(\\w+\\W+){0,3}(rest|everything|other)", EFF] },
            ],
            sample: "The date and time are in bold navy capitals on a bright yellow panel, which makes them stand out. The yellow is the only large block of that colour on the poster, so the viewer's eye is drawn to it and they notice when the open evening is.",
            model: "<ul><li>A feature (cause) linked to its effect on the viewer, 1 mark each, any 2: yellow accent panel behind the date so it stands out or pulls the eye (1); the date and time are in bold or larger capitals so they are read first (1); dark text on a bright yellow panel gives strong contrast so it is clear from a distance (1); it is the only large yellow area so the eye is drawn to it (1).</li></ul><p>Not enough: &ldquo;it draws attention&rdquo; (effect only); &ldquo;the date is yellow&rdquo; (feature only); &ldquo;emphasis is created by colour&rdquo; (the principle is not its own effect).</p>",
          },
          {
            type: "text", label: "(b)", marks: 2, rows: 4,
            q: "Describe how rhythm has been created in the poster.",
            points: [
              { desc: "A row of identical pennants repeated at equal spacing across the top", win: 70, all: ["(identical|same|matching|repeated|repeating|row of|series of|line of|six|many|several|lots of)\\W+(\\w+\\W+){0,3}(pennants?|flags?|triangles?|bunting)|(pennants?|flags?|triangles?|bunting)\\W+(\\w+\\W+){0,8}(repeated|repeat|identical|same|in a row|in a line|across|equal|evenly|regular)|" + AF("pennants?|flags?|triangles?|bunting", 8, "repeated|identical|same size|equally spaced|evenly spaced|regularly spaced"), SPACED] },
              { desc: "Three circles/badges (FLY, BUILD, LEAD) the same size and equally spaced", win: 70, all: ["(identical|same|matching|repeated|equal|three|3|row of|round)\\W+(\\w+\\W+){0,2}(circles?|circular|badges?|roundels?|buttons?|discs?)|(circles?|badges?|roundels?|buttons?|discs?)\\W+(\\w+\\W+){0,6}(same size|equal size|identical|repeated|the same|equal|evenly|regularly)|" + AF("circles?|badges?|roundels?|buttons?|discs?", 8, "same size|equal size|identical|repeated|the same|equally|evenly|regularly"), SPACED] },
              { desc: "Matching labels or headings in the same style repeated at regular intervals", win: 40, all: ["(fly|build|lead|labels?|headings?)", "(same|match|identical|repeat)\\w*\\W+(\\w+\\W+){0,2}(font|style|colour|size|white|interval)"] },
            ],
            sample: "A row of six identical magenta pennants is repeated at equal spacing along the top of the poster. Three circular badges are the same size and are evenly spaced across the middle, labelled FLY, BUILD and LEAD.",
            model: "<ul><li>The pennants are repeated at equal spacing in a row below the title (1).</li><li>The three badges are the same size, repeated at equal intervals across the page (1).</li></ul><p>Also acceptable: the matching white labels inside the badges. A bare &ldquo;repetition&rdquo; or &ldquo;there is a pattern&rdquo; is a list word, not a description: say what is repeated and where.</p>",
          },
          {
            type: "text", label: "(b)", marks: 2, rows: 4,
            q: "Describe how rhythm has been created in the poster.",
            points: [
              { desc: "A row of identical pennants repeated at equal spacing across the top", win: 70, all: ["(identical|same|matching|repeated|repeating|row of|series of|line of)\\W+(\\w+\\W+){0,2}(pennants?|flags?|triangles?)|(pennants?|flags?|triangles?)\\W+(\\w+\\W+){0,3}(repeated|identical|same|in a row)", "(spac|interval|gap|equally|evenly|regularly)"] },
              { desc: "Three circles/badges (FLY, BUILD, LEAD) the same size and equally spaced", win: 70, all: ["(identical|same|matching|repeated|equal|three|row of)\\W+(\\w+\\W+){0,2}(circles?|circular|badges?|roundels?|buttons?)|(circles?|badges?|roundels?|buttons?)\\W+(\\w+\\W+){0,4}(same size|equal size|identical|repeated|the same)", "(spac|interval|gap|equally|evenly|regularly)"] },
              { desc: "Matching labels or headings in the same style repeated at regular intervals", win: 40, all: ["(fly|build|lead|labels?|headings?)", "(same|match|identical|repeat)\\w*\\W+(\\w+\\W+){0,2}(font|style|colour|size|white|interval)"] },
            ],
            sample: "A row of six identical magenta pennants is repeated at equal spacing along the top of the poster. Three circular badges are the same size and evenly spaced across the middle, labelled FLY, BUILD and LEAD.",
            model: "<ul><li>The pennants are repeated at equal spacing in a row below the title (1).</li><li>The three badges are the same size, repeated at equal intervals across the page (1).</li></ul><p>Also acceptable: the matching white labels inside the badges. A bare &ldquo;repetition&rdquo; or &ldquo;there is a pattern&rdquo; is a list word, not a description: say what is repeated and where.</p>",
          },
          { type: "mcq", label: "(c)", marks: 1, q: "The aircraft photograph is far larger than any other item, so the eye starts there. Which design principle is this?", opts: ["Proximity", "Dominance", "Rhythm", "White space"], a: 1, why: "One item clearly more important than the rest, usually the largest, is dominance: it gives the eye an obvious starting point." },
        ],
      },
      {
        id: "dtp-03",
        style: "Grid question · calculate, describe and identify",
        stem: "<p>The squadron is producing an A4 leaflet for its summer fair. The designer has built the page on a grid, which is shown in pale blue on the figure. M and G are labelled.</p>",
        figure: figGrid,
        parts: [
          { type: "num", label: "(a)", marks: 1, unit: "mm", a: 50, tol: 0, q: "The A4 page is 210 mm wide. The left and right margins are each 20 mm, the two gutters are each 10 mm, and the three columns are equal. Calculate the width of one column, in mm.", why: "Space for columns = 210 &minus; (2 &times; 20) &minus; (2 &times; 10) = 150 mm. 150 &divide; 3 = 50 mm." },
          {
            type: "text", label: "(b)", marks: 3, rows: 5,
            q: "Describe the grid structure of the leaflet page.",
            points: [
              { desc: "The page has three (equal) columns", any: ["\\b(three|3)[ -](equal[ -]|narrow[ -]|even[ -])?columns?", "columns? (is |are |of )?(three|3)\\b", AF("grid|page|layout|leaflet", 6, "(three|3)[ -](equal[ -]|narrow[ -]|even[ -])?columns?")] },
              { desc: "The title spans all three columns", any: ["(title|heading|headline|banner)\\W+(\\w+\\W+){0,4}(spans?|across|stretch\\w*|covers?|runs?|goes|extends?)\\W+(\\w+\\W+){0,3}(all|three|3|whole|full)", "(spans?|across)\\W+(\\w+\\W+){0,2}(all|three|3|whole|full)( three)?( columns?| width)?\\W+(\\w+\\W+){0,3}(title|heading|headline|banner)", "(title|heading|headline|banner)\\W+(\\w+\\W+){0,4}(full|whole) (width|page)", AF("title|heading|headline|banner", 6, "(spans?|spread|spreads|stretch\\w*|covers?|runs?|goes|extends?)\\W+(\\w+\\W+){0,3}(all|three|3|whole|full)|across (all|the|three|3|whole|full)")] },
              { desc: "The photograph spans two columns (the first two)", any: ["(image|photo\\w*|picture)\\W+(\\w+\\W+){0,4}(spans?|across|covers?|takes? up|fills?|occupies|is|over|in|wide)\\W+(\\w+\\W+){0,3}(two|2)\\b( columns?| wide)", "(two|2) columns?\\W+(\\w+\\W+){0,4}(image|photo\\w*|picture)", "(image|photo\\w*|picture)\\W+(\\w+\\W+){0,4}(spans?|covers?|across|takes? up|fills?|occupies)\\W+(\\w+\\W+){0,4}(one and two|1 and 2|first two|left two)", AF("image|photo\\w*|picture", 5, "(two|2)\\b( columns?| wide|[ -]column)|(one and two|1 and 2|first two|left two)")] },
              { desc: "The pull quote is in the third column / text is in single columns", any: ["(pull ?quote|quote)\\W+(\\w+\\W+){0,4}(third|3rd|last|right|final|single|one)( hand)?\\W+(\\w+\\W+){0,1}column", "(third|3rd|last|right|final)( hand)? column\\W+(\\w+\\W+){0,4}(pull ?quote|quote)", "(body )?(text|writing)\\W+(\\w+\\W+){0,4}(each|one|single|separate|its own|three)\\W+(\\w+\\W+){0,1}columns?", AF("pull ?quote|quote", 5, "(third|3rd|last|final|right)\\b|column (three|3)")] },
              { desc: "Items line up with the column edges / equal gutters between columns", win: 50, all: ["(align|line[sd]? up|lined up|edges? (sit|are|line|match)|snap)", "(column|grid|gutter)"] },
              { desc: "Gutters separate the columns", any: ["gutters?\\W+(\\w+\\W+){0,6}(between|separat\\w*|divid\\w*)\\W+(\\w+\\W+){0,3}columns?", AF("gutters?", 6, "(between|separat\\w*|divid\\w*)\\W+(\\w+\\W+){0,3}columns?")] },
            ],
            sample: "The page is built on a three-column grid, and the gutters are the gaps between the columns. The title is spread across all three columns and the photograph is two columns wide. The pull quote is in the third column and the edges of the items are lined up with the column edges.",
            model: "<ul><li>Number of columns: three equal columns, with gutters between and margins round the edge (1).</li><li>The title spans all three columns (1).</li><li>The photograph spans two columns while the pull quote sits in the third (1).</li><li>The body text runs in a single column each; every edge lines up on a column edge (1).</li></ul><p>Any 3. Grid structure is a demanding topic: name the columns, what spans them, and what lines up. &ldquo;It uses a grid&rdquo; earns nothing.</p>",
          },
          { type: "mcq", label: "(c)", marks: 1, q: "What is the name of the feature labelled G?", opts: ["Gutter", "Margin", "Bleed", "Column rule"], a: 0, why: "G is the gap between column one and column two: the gutter. M, at the page edge, is the margin." },
          {
            type: "text", label: "(d)", marks: 1, rows: 2,
            q: "State one reason for keeping text inside the margin (M).",
            points: [
              { desc: "Text could be cut off when the page is trimmed", any: ["(cut|trimm?).{0,25}(off|edge|away)", "(text|words|content).{0,50}(cut|trimm|clipped|lost)", "(close|near|too near).{0,20}edge"] },
              { desc: "Margins frame the content with white space", any: ["frames?.{0,40}(content|text|page)", "white ?space.{0,40}(round|around|frame)"] },
            ],
            sample: "So the text doesn't get cut off when the sheet gets trimmed.",
            model: "<ul><li>Keeps text away from the trimmed edge, where it could be cut off (1).</li></ul><p>Also acceptable: the margin frames the content with white space.</p>",
          },
        ],
      },
      {
        id: "dtp-04",
        style: "Pre-press question · identify and explain",
        stem: "<p>Master Shipwright Fraser sends the client a proof of the regatta poster before the print run. The poster has a solid background colour, shown here in navy. Marks A, B and C are labelled on the figure.</p>",
        figure: figProof,
        parts: [
          { type: "match", label: "(a)", marks: 3, q: "Identify the features A, B and C.", pairs: [["A (thin lines at the corners of the sheet)", "Crop marks"], ["B (circles with cross-hairs)", "Registration marks"], ["C (colour beyond the dashed line)", "Bleed"]] },
          {
            type: "text", label: "(b)", marks: 2, rows: 4,
            q: "The printer asks for the background to be printed out to the edge of area C. Explain why.",
            points: [
              { desc: "Cutting/trimming is never perfectly accurate (the cut may be slightly out)", any: ["(cut|cutting|trim|trimming|trimmed|guillotine|blade|cutter|machine)\\w*\\W+(\\w+\\W+){0,6}(never|not|isn't|aren't|can't|cannot|doesn't|won't|may not|might not|unlikely|hard to|difficult to)\\W+(\\w+\\W+){0,3}(accura|exact|perfect|precis|straight|line up|on the line|right on|spot on)", "(never|not|can't|cannot|hard to|difficult to|impossible to)\\W+(\\w+\\W+){0,3}(accura|exact|perfect|precis)\\w*\\W+(\\w+\\W+){0,4}(cut|trim|guillotine)", "(cut|trim|guillotine|blade|cutter|machine|paper)\\w*\\W+(\\w+\\W+){0,6}(inaccura|imprecis|drift|slip|shift|move[sd]?|wander|slightly (out|off|wrong)|a (little|bit|hair|fraction) (out|off|wrong|over|either)|out of place|off the line|miss|wrong place|error|mistake)", "(error|mistake|margin of error|tolerance)\\W+(\\w+\\W+){0,4}(cut|trim|guillotine)", "(slightly|a little|a bit|fraction)\\W+(\\w+\\W+){0,2}(out|off|over|past|inside|short)\\W+(\\w+\\W+){0,4}(line|cut|trim|edge)", "(cut|trim)\\w*\\W+(\\w+\\W+){0,3}(a little|slightly|a bit|a millimetre|1 ?mm)\\W+(\\w+\\W+){0,3}(out|off|wrong|either side)", AF("cut|cutting|trim\\w*|guillotine|blade|cutter|machine|paper", 6, "a (little|bit|hair|fraction) (out|off|wrong|over|either)|slightly (out|off|wrong)|inaccura\\w*|imprecis\\w*|slip\\w*|drift\\w*|wander\\w*")] },
              { desc: "So no thin white (unprinted) edge shows", group: "g2", negOK: true, any: ["(white|unprinted|blank|bare|uncoloured|paper)\\W+(\\w+\\W+){0,1}(edge|border|gap|sliver|strip|line|stripe|band|margin|bit|patch)", "(edge|border|sliver|gap|strip|line|band)\\W+(\\w+\\W+){0,2}(of |in )?(white|unprinted|blank|bare|paper)", "(no|without|avoids?|prevents?|stops?)\\W+(\\w+\\W+){0,2}(unprinted|blank|bare|uncoloured|white)", "(colour|ink|print)\\W+(\\w+\\W+){0,3}(not|doesn't|didn't|wouldn't|would not|won't)\\W+(\\w+\\W+){0,2}(reach|go|extend|stop|cover)"] },
              { desc: "The cut still lands on printed colour", group: "g2", negOK: true, any: ["(cut|trim|guillotine)\\w*\\W+(\\w+\\W+){0,4}(still )?(lands?|falls?|cuts?)\\W+(\\w+\\W+){0,3}(colour|navy|ink|print)"] },
            ],
            sample: "A guillotine can be a little out, so the cut may land a little either side of the trim line. With the navy carried on past the line, the cut still lands on printed colour so there is no thin white edge on the finished poster.",
            model: "<ul><li>Trimming is never perfectly accurate, so the cut may land a little either side of the trim line (1).</li><li>With the colour carried past the line (bleed, commonly 3 mm) no unprinted white edge is left (1).</li></ul><p>Do not award for &ldquo;so it looks good&rdquo; or &ldquo;to line up the colours&rdquo; (that is the purpose of registration marks).</p>",
          },
        ],
      },
      {
        id: "dtp-05",
        style: "Print versus screen · identify and explain",
        stem: "<p>The squadron needs a web banner for its Minecraft server page. The same artwork will later appear on a printed leaflet. The banner is shown with its logo (A) and button (B).</p>",
        figure: figBanner,
        parts: [
          { type: "mcq", label: "(a)", marks: 1, q: "Which colour model should the banner be set up in, because it will only be seen on screens?", opts: ["CMYK", "Pantone", "RGB", "Greyscale"], a: 2, why: "Screens add red, green and blue light, so on-screen work is set up in RGB. CMYK is for print." },
          { type: "multi", label: "(b)", marks: 2, q: "The logo (A) must be supplied with a transparent background and be a small file for the website. Choose <b>two</b> suitable file types.", opts: ["jpg", "png", "bmp", "svg", "dxf"], a: [1, 3], why: "PNG (raster, lossless, supports transparency) and SVG (vector, small, supports transparency) both suit a web logo. JPG has no transparency; BMP files are very large; DXF is a CAD exchange format." },
          {
            type: "text", label: "(c)", marks: 2, rows: 4,
            q: "Explain why the leaflet version of the artwork should be set up in CMYK.",
            points: [
              { desc: "Printing presses use cyan, magenta, yellow and black inks only", win: 70, all: ["(print|press|inks?)", "(four|4)( |-)(colour|ink)|(cyan|magenta|yellow|black|key)\\W+(\\w+\\W+){0,2}(cyan|magenta|yellow|black|key)\\W+(\\w+\\W+){0,2}(cyan|magenta|yellow|black|key)"] },
              { desc: "Some bright RGB colours cannot be printed and come out duller, so CMYK shows the true result", win: 70, all: ["(bright|vivid|rgb|screen|neon|saturated|monitor)", "(cannot|can't|can not|not be|unable to|won't|impossible to|aren't|isn't)\\W+(\\w+\\W+){0,2}(print|reproduc|made|mixed|match)|(duller|dull|muted|flat|flatter|paler|less vivid|less bright)\\W+(\\w+\\W+){0,3}(print|paper|result|ink)|(print|paper|printed)\\W+(\\w+\\W+){0,3}(duller|dull|muted|flat|flatter|paler|less vivid|less bright)|(outside|out of|beyond|smaller)\\W+(\\w+\\W+){0,2}(gamut|range)|(look|looks|appear|appears|come|comes|print|prints|turn|turns|end|ends)\\W+(\\w+\\W+){0,3}(different|duller|dull|muted|washed out|flat|darker|wrong)|colours? (change|shift|differ)\\w*|" + AF("print\\w*|paper|press|ink\\w*|cmyk", 8, "different|duller|dull|muted|washed out|true|real(ly)?|accurate|actual|preview")] },
            ],
            sample: "Printing presses are limited to the four inks cyan, magenta, yellow and black, so every colour is made from those. Some bright screen colours are outside the range of those inks and would come out duller, so working in CMYK shows what the printed result will really look like.",
            model: "<ul><li>The press prints with cyan, magenta, yellow and black (key) inks, so every colour must be made from them (1).</li><li>Some bright RGB colours are outside this smaller gamut and would print duller than on screen; working in CMYK from the start gives a true preview (1).</li></ul>",
          },
        ],
      },
      {
        id: "dtp-06",
        style: "Typography question · identify and explain",
        stem: "<p>Cadet Sergeant Rahman is designing an invitation to the squadron's annual regatta dinner. The title is in a script font and the details are in a serif font. Features B, C and D are labelled.</p>",
        figure: figInvite,
        parts: [
          { type: "mcq", label: "(a)", marks: 1, q: "How is the paragraph labelled B justified?", opts: ["Centred", "Fully justified", "Right", "Left"], a: 3, why: "The left edges line up and the right edges are uneven (ragged), which is left justification. Fully justified text would have both edges straight." },
          { type: "mcq", label: "(b)", marks: 1, q: "In the list labelled C, the first line of each item starts at the left and the later line is moved in. What is this called?", opts: ["Indent", "Hanging indent", "Drop cap", "Text wrap"], a: 1, why: "A hanging indent has the first line out at the left and the following lines indented. An ordinary indent moves the first line in." },
          {
            type: "text", label: "(c)", marks: 2, rows: 4,
            q: "Explain why these font choices suit the invitation.",
            points: [
              { desc: "The script title looks like elegant handwriting, so it feels formal or celebratory", any: ["(script|handwrit\\w*|curly|cursive|calligraph\\w*|flowing|joined.?up|decorative|swirly|fancy)\\W+(\\w+\\W+){0,6}(elegant|handwriting|handwritten|formal|celebrat\\w*|decorative|personal|flowing|calligraph\\w*|special|occasion|fancy|sophisticated|classy|party|stylish|festive|wedding|dressy)", "(elegant|handwriting|handwritten|formal|celebrat\\w*|decorative|flowing|calligraph\\w*|fancy|sophisticated|classy|stylish)\\W+(\\w+\\W+){0,3}(script|title|heading|lettering)", AF("script|handwrit\\w*|curly|cursive|calligraph\\w*|flowing|joined.?up|decorative|swirly|fancy", 6, "elegant|handwriting|handwritten|formal|celebrat\\w*|decorative|personal|calligraph\\w*|special|occasion|fancy|sophisticated|classy|party|stylish|festive|wedding|dressy")] },
              { desc: "The serif details are traditional / easy to read, so guests can read the information", not: ["\\bsans"], any: ["(serif|body (text|copy)|details|information|small text|main text)\\W+(\\w+\\W+){0,5}(easy to read|easily read|readable|clear|clearly|traditional|legible|neat|formal)", "(easy to read|easily read|readable|clear|clearly|traditional|legible)\\W+(\\w+\\W+){0,3}(serif|body text)", AF("serif|body (text|copy)|details|information|small text|main text", 5, "easy to read|easily read|readable|clear|clearly|traditional|legible|neat|formal")] },
              { desc: "The two fonts contrast, so the title and details are easy to tell apart", win: 90, all: ["(two|both|the|different|contrasting)\\W+(\\w+\\W+){0,2}(fonts?|typefaces?|styles?)\\W+(\\w+\\W+){0,4}(contrast\\w*|differ\\w*|different|distinct|opposite)|(contrast\\w*|distinct)\\W+(\\w+\\W+){0,2}(fonts?|typefaces?|styles?)|(title|script)\\W+(\\w+\\W+){0,6}(contrast\\w*|differ\\w*|different|distinct)\\W+(\\w+\\W+){0,4}(serif|details|body|text)", "(tell|told) (them |the two |these )?apart|distinguish\\w*|separate\\w*|stand\\w* out|clear which|hierarch\\w*|easy to (see|tell|spot)|different (levels|roles|jobs|purposes)|(title|heading) (is|and)"] },
            ],
            sample: "The script title is like elegant handwriting, so the invitation feels formal and special. The serif font is traditional and easy to read, so guests can find the time and place clearly.",
            model: "<ul><li>Script resembles elegant handwriting, so the title feels formal and celebratory (1).</li><li>Serif is traditional and easy to read, so the details are clear (1).</li><li>The two fonts contrast, so the title and details are easily told apart (1).</li></ul><p>Any 2. Each mark needs the font feature and its effect in the context of a dinner invitation; &ldquo;the fonts are different colours&rdquo; says nothing about the typefaces.</p>",
          },
          {
            type: "text", label: "(d)", marks: 2, rows: 4,
            q: "The RSVP line (D) is set in reverse text. Explain why reverse text suits this line.",
            points: [
              { desc: "Light text on a dark background gives strong contrast, so it stands out / catches attention", win: 70, all: ["(white|light|pale|bright)\\W+(\\w+\\W+){0,3}(on|against)\\W+(\\w+\\W+){0,2}(dark|navy|aubergine|purple|black)|(dark|navy|aubergine|purple|black)\\W+(\\w+\\W+){0,3}(behind|beneath|under|with|and)\\W+(\\w+\\W+){0,2}(white|light|pale)", "(contrast|stand|attention|notice|eye|catch|grab|clear|visible|pops?)"] },
              { desc: "It suits short text, because long passages of reverse text are tiring to read", group: "g2", win: 90, any: ["\\b(short|few words|brief|a few|one line|little text|small amounts?)\\b\\W+(\\w+\\W+){0,12}(tiring|tire\\w*|strain\\w*|hard\\w* to read|difficult to read|uncomfortable|exhausting|(not|n't) (tiring|hard|difficult|a strain))", "(best|only|better|suits?|ideal|works?|good|fine)\\W+(\\w+\\W+){0,3}(for|with|on)\\W+(\\w+\\W+){0,2}(short|few words|brief|small amounts?)"] },
              { desc: "Long passages of reverse text are tiring or hard to read", group: "g2", win: 80, not: ["(not|n't|never)\\W+(\\w+\\W+){0,2}(hard|difficult|tiring|tire|strain)", "easier"], all: ["(long|lots of|large amounts?|big blocks?|paragraphs?|passages?|body text|a lot)\\W+(\\w+\\W+){0,6}(tiring|tire|tired|hard|difficult|strain|exhausting|harder|tricky|uncomfortable)\\w*"] },
            ],
            sample: "White text on the dark strip has strong contrast, so the RSVP line is eye-catching and guests notice it. Reverse text is best for short pieces of text, because long passages of it are tiring to read, and this line is only a few words.",
            model: "<ul><li>Light text on a dark background contrasts strongly, so the line stands out and is noticed (1).</li><li>It works for short text; long passages in reverse are tiring to read, and the RSVP line is only a few words (1).</li></ul>",
          },
          {
            type: "text", label: "(e)", marks: 2, rows: 4,
            q: "Compare left justification with full justification for the paragraph of event details.",
            points: [
              { desc: "Full justification gives straight edges on both sides, so the block looks neat and formal", group: "full", any: [AFC(FULLCTX, "straight|neat|tidy|clean|formal|smart|professional|block|both (sides|edges|margins)|even edges|flush|square")] },
              { desc: "Full justification can leave uneven gaps between words (rivers of white space)", group: "full", any: [AFC(FULLCTX, "(uneven|large|big|wide|irregular|varying|stretched|odd|awkward)\\W+(\\w+\\W+){0,2}(spac\\w*|gaps?)|rivers?|gaps? (between|in) (the )?words|stretch\\w* (the )?(words|spaces|spacing)|(spaces|gaps|spacing) (can be|may be|get|gets|become|becomes) (uneven|large|big|wide|stretched)")] },
              { desc: "Left justification keeps the spacing between words even / is easier to read", group: "left", any: [AFC(LEFTCTX, "(even|equal|regular|consistent|same|natural|normal|uniform)\\W+(\\w+\\W+){0,2}(spac\\w*|gaps?)|(spac\\w*|gaps?)\\W+(\\w+\\W+){0,3}(even|equal|regular|consistent|the same|uniform)|easier to read|easy to read|readab\\w*|more natural")] },
              { desc: "Left justification leaves a ragged right edge, so it looks less formal / more informal", group: "left", any: [AFC(LEFTCTX, "ragged|jagged|uneven\\W+(\\w+\\W+){0,2}(right|edge)|right\\W+(\\w+\\W+){0,3}(ragged|uneven|jagged)|less formal|informal|casual")] },
            ],
            sample: "Fully justified text has straight edges on both sides, so the block looks neat and formal, but it can leave uneven gaps between words. Left justified text keeps the spacing between words even and is easier to read, although the right edge is ragged.",
            model: "<ul><li>Full justification: both edges are straight, so the block looks neat and formal; but the software stretches the word spaces, which can leave uneven gaps or rivers of white space (1).</li><li>Left justification: the spacing between words stays even and the text is easy to read; the right edge is ragged, so it looks less formal (1).</li></ul><p>A comparison needs a point about each type, given to the right type. Describing only one of them earns one mark at most.</p>",
          },
        ],
      },
      {
        id: "dtp-07",
        style: "Multi-page document · master pages and layers",
        stem: "<p>The 24-page regatta programme is being produced in DTP software. Page 3 is shown, with features A to E labelled.</p>",
        figure: figPage,
        parts: [
          { type: "multi", label: "(a)", marks: 2, q: "Choose <b>two</b> of the labelled features that should be placed on the master page.", opts: ["A, the running headline", "B, the page number", "C, the photograph of the boats", "D, the pull quote", "E, the caption under the photograph"], a: [0, 1], why: "Items that repeat in the same position on every page (running headline, folio, footer, logo, guides) belong on the master page. The photograph, pull quote and caption are specific to page 3." },
          {
            type: "text", label: "(b)", marks: 1, rows: 2,
            q: "State one purpose of using layers in a DTP document.",
            points: [
              { desc: "Lock or hide items (e.g. the background) so they cannot be moved or are out of the way while editing", any: ["(lock|hide|hidden).{0,60}(layer|background|image|text|edit|move|items?)", "(layer|background).{0,50}(lock|hide|hidden)"] },
              { desc: "Bring items in front of or send them behind others", any: ["(bring|send|move).{0,30}(front|back|forward|behind)", "(in front of|behind).{0,30}(others|items|layers?|text|image)"] },
              { desc: "Keeps different types of item separate", any: ["separat(e|es|ed|ing).{0,40}(items|images|text|background|content|types)"] },
            ],
            sample: "Layers can be used to lock or hide the background so it stays out of the way while the text is edited.",
            model: "<ul><li>Layers separate items so that, for example, the background can be locked or hidden while text is edited (1).</li></ul><p>Also acceptable: items can be brought in front of or sent behind others.</p>",
          },
          {
            type: "text", label: "(c)", marks: 2, rows: 4,
            q: "Explain two benefits of using a master page for the 24-page programme.",
            points: [
              { desc: "Items are set up once and appear on every page, which saves time", win: 90, all: ["(once|one time|single time|automatic\\w*)\\W+(\\w+\\W+){0,6}(every|each|all)\\W+(\\w+\\W+){0,2}pages?|(every|each|all)\\W+(\\w+\\W+){0,2}pages?\\W+(\\w+\\W+){0,4}(automatic\\w*|once|straight away)|appears? (on|in) (every|each|all)", "(so|which|this|that|it|meaning|means|and)\\W+(\\w+\\W+){0,1}(saves?|saving|quicker|faster|less time|less work|less effort)|(makes?|make) (\\w+ ){0,2}(quick|fast|easy|easier)|(no need|don't need|doesn't need|without having|not have) to (re-?(type|do|create|place)|copy|do it|add)|(instead of|rather than)\\W+(\\w+\\W+){0,6}(each|every|individual\\w*|one by one|manually)"] },
              { desc: "Items are in exactly the same position on every page, so the programme is consistent", win: 90, all: ["(in|at|on|to) (\\w+ ){0,2}(same|identical|exact)( \\w+){0,2} (position|place|spot|location)|(look|layout|design|appearance)\\W+(\\w+\\W+){0,2}(same|identical|consistent|uniform)\\w*", "(so|which|making|makes|means|giving|gives|this|looks?|appears?)\\W+(\\w+\\W+){0,3}(consistent|consistency|uniform\\w*|unified|professional|neat|tidy|identical|the same|alike)"] },
              { desc: "Changing the master updates every page at once", win: 60, all: ["(change|edit|alter|update|amend|correct|fix)", "master", "(all|every|each)\\W+(\\w+\\W+){0,3}pages?|automatic", CONN] },
            ],
            sample: "The header, footer and page numbers only have to be set up once on the master page and then appear on every page automatically, which saves time. They are in exactly the same position on every page, so the programme looks consistent.",
            model: "<ul><li>Repeating items are placed once and appear on every page automatically, saving time (1).</li><li>They sit in the identical position on each page, giving consistency/unity (1).</li><li>Editing the master updates every page at once (1).</li></ul><p>Any 2, each as a feature linked to its effect.</p>",
          },
        ],
      },
      {
        id: "dtp-08",
        style: "Colour theory · identify, explain and match",
        stem: "<p>The cover of the summer fair leaflet uses yellow, orange and red-orange for its three bands, with a cyan-blue circle carrying the ticket price.</p>",
        figure: figColour,
        parts: [
          { type: "mcq", label: "(a)", marks: 1, q: "Yellow, orange and red-orange sit next to each other on the colour wheel. What type of colour scheme do the bands form?", opts: ["Complementary", "Monochrome", "Analogous (harmony)", "Contrasting accent"], a: 2, why: "Neighbouring colours on the wheel are analogous. They share a common colour and look unified (harmony). Complementary colours sit opposite each other." },
          {
            type: "text", label: "(b)", marks: 2, rows: 5,
            q: "Explain two ways in which colour has been used effectively on the leaflet cover.",
            points: [
              { desc: "The neighbouring warm colours give harmony, so the cover looks unified", win: 60, all: ["(next to each other|neighbou?r|beside|adjacent|analogous|similar colours|same part of the colour wheel|close together|warm colours)", "(harmon|unif|belong|pleasing|cohesive|consistent|go well|go together|match|blend)"] },
              { desc: "The blue circle is an accent/contrasting colour against the warm bands, so the price stands out", win: 60, all: ["(blue|cyan|ticket|price|circle)\\W+(\\w+\\W+){0,4}(accent|contrast\\w*|complement\\w*|opposite|only cool|only blue|different colour)|(accent|contrast\\w*|complement\\w*|opposite)\\W+(\\w+\\W+){0,3}(blue|cyan|ticket|price|circle)", "(accent|contrast\\w*|complement\\w*|opposite|only cool|only blue|different colour)\\W+(\\w+\\W+){0,8}(stand|stood|attention|notice|eye|catch|draw)"] },
              { desc: "Warm colours feel energetic/sunny, suiting a summer fair", win: 35, all: ["(warm|yellow|orange|red)", "(energetic|exciting|friendly|sunny|lively|vibrant|cheerful|festive|cheery|hot|fun|bright and)"] },
            ],
            sample: "The yellow, orange and red-orange are next to each other on the colour wheel, so they go together and the cover looks unified. The blue circle is a contrasting accent against the warm bands, so the ticket price stands out and is noticed first.",
            model: "<ul><li>Analogous warm colours sit next to each other on the wheel, so there is harmony and the cover looks unified (1).</li><li>The cool blue circle contrasts with the warm bands as an accent, so the price stands out (1).</li><li>The warm colours feel sunny and energetic, suiting a summer fair (1).</li></ul><p>Any 2. Name the colour term, point to where it is used, and give the effect.</p>",
          },
          { type: "match", label: "(c)", marks: 3, q: "Match each colour term to its meaning.", pairs: [["Tint", "A colour with white added, so it is lighter"], ["Shade", "A colour with black added, so it is darker"], ["Advancing colour", "A warm colour that seems to come towards the viewer"]] },
        ],
      },
      {
        id: "dtp-09",
        style: "Images and effects · describe and explain",
        stem: "<p>A magazine cover for <i>SAIL</i> uses a photograph of a pilot. The designer has prepared it for the cover as shown. Features A to D are labelled.</p>",
        figure: figCover,
        parts: [
          {
            type: "text", label: "(a)", marks: 2, rows: 4,
            q: "Describe how cropping has been used on the photograph of the pilot (A).",
            points: [
              { desc: "Cut/cropped round the outline of the figure, removing the whole background", any: ["(cut|crop|trim|remov|delet|eras)\\w*\\W+(\\w+\\W+){0,2}(round|around|along|follow\\w*|outline)", "(whole|all|entire|complete)\\W+(\\w+\\W+){0,2}background", "(background|backdrop)\\W+(\\w+\\W+){0,2}(removed|cut|gone|deleted|erased)", "(remov|delet|eras|cut|cutting)\\w*\\W+(\\w+\\W+){0,2}(background|backdrop|surroundings)", "cut.?out"] },
              { desc: "So the figure sits directly on the cover / overlaps the masthead (full crop)", any: ["(overlaps?|overlapping|in front of|on top of)\\W+(\\w+\\W+){0,3}(masthead|title|heading|logo)", "(sits?|stands?|placed|put)\\W+(\\w+\\W+){0,2}(straight|directly|right)\\W+(\\w+\\W+){0,2}(on|onto)\\W+(\\w+\\W+){0,2}(cover|page|background)", "(over|across|onto|into)\\W+(\\w+\\W+){0,2}(masthead|title|sail)\\b", "(head|figure|pilot)\\W+(\\w+\\W+){0,4}(over|in front|on top)\\W+(\\w+\\W+){0,3}(masthead|title|sail)"] },
              { desc: "So text can wrap closely round its shape", any: ["text\\W+(\\w+\\W+){0,4}(wrap|flow|follow|curve|go round|goes around)", "(wrap|flow)\\w*\\W+(\\w+\\W+){0,3}text"] },
            ],
            sample: "The pilot has been cut out round the outline of the body so that the whole background is removed. That lets the figure sit straight on the cover and overlap the masthead.",
            model: "<ul><li>Full cropping: the photograph is cut precisely round the outline of the pilot, removing all of the background (1).</li><li>So the pilot sits directly on the cover colour and overlaps the masthead / text can wrap around the outline (1).</li></ul><p>Markers look for what was removed and why; &ldquo;crop to shape&rdquo; alone does not describe the technique.</p>",
          },
          {
            type: "text", label: "(b)", marks: 2, rows: 4,
            q: "Explain why text wrap has been used for the lines of text labelled B.",
            points: [
              { desc: "The text follows/flows round the outline of the pilot", win: 50, all: ["(text|words|lines)", "(follows?|flows?|wrap\\w*|runs?|curves?|goes?|moves?|fits?|shortens?|shaped|hugs?)\\W+(\\w+\\W+){0,3}(round|around|outline|shape|edge|contour|curve)"] },
              { desc: "So the text stays clear of the figure and no space is wasted / looks neatly joined to the image", any: ["(not|never|without|avoid\\w*|n't)\\W+(\\w+\\W+){0,2}(hidden|covered|obscur\\w*|overlap\\w*|cut off)", "(no|without|avoid\\w*)\\W+(\\w+\\W+){0,1}(gap|wasted|empty)", "(neatly|tightly|closely|snugly|integrated)\\W+(\\w+\\W+){0,2}(joined|linked|fitted|fitting|together|connected)", "(stay|stays|stop|stops|keep|keeps|kept)\\w*\\W+(\\w+\\W+){0,3}(clear of|away from|off|outside)\\W+(\\w+\\W+){0,2}(pilot|figure|image|shape|picture|photo)", AF("text|words|lines", 8, "(hidden|covered|obscured|overlapped)\\W+(\\w+\\W+){0,3}(behind|by|under)|neatly joined|joined together|snugly|closely")] },
            ],
            sample: "The lines of text are wrapped round the outline of the pilot's shoulder, getting shorter as they go. This avoids the text being hidden behind the figure and leaves no empty gap, so the text and picture look neatly joined together.",
            model: "<ul><li>The text follows the outline of the cropped pilot, with line lengths changing to fit its shape (1).</li><li>So the words stay clear of the figure and no space is wasted, and the text and picture look joined as one design (1).</li></ul>",
          },
          { type: "mcq", label: "(c)", marks: 1, q: "The circle D has a soft dark shadow offset behind it. What is the main effect of this?", opts: ["It makes the circle look further away", "It reduces the contrast", "It aligns the circle to the grid", "It lifts the circle off the cover, creating depth"], a: 3, why: "A drop shadow suggests the item is raised above the page, creating depth and making it stand out from the background." },
        ],
      },
      {
        id: "dtp-10",
        style: "File types · identify, calculate and explain",
        stem: "<p>The squadron's round logo is needed for a tri-fold brochure, a business card and a 2 m wide pull-up banner. The figure shows the logo from two different image files, each enlarged many times.</p>",
        figure: figFiles,
        parts: [
          { type: "mcq", label: "(a)", marks: 1, q: "Image A shows jagged, stepped edges when enlarged. What is this effect called?", opts: ["Bleed", "Overprinting", "Text wrap", "Pixelation"], a: 3, why: "A raster image has a fixed number of pixels. Enlarged too far, each pixel shows as a square and curves look stepped: pixelation." },
          { type: "num", label: "(b)", marks: 1, unit: "bytes", a: 2880000, tol: 0, q: "A photograph for the brochure is 1200 pixels wide and 800 pixels high, with 24 bits per pixel and no compression. Calculate its file size in bytes.", why: "Size = width &times; height &times; bits per pixel &divide; 8 = 1200 &times; 800 &times; 24 &divide; 8 = 2,880,000 bytes (2.88 MB)." },
          {
            type: "text", label: "(c)", marks: 2, rows: 4,
            q: "Explain why the logo should be supplied as a vector file for the 2 m banner.",
            points: [
              { desc: "Vector is stored as points, curves and instructions rather than pixels, so it scales up without losing quality (no pixelation/blur)", win: 90, all: ["(points?|curves?|math\\w*|instructions?|coordinates|paths?|not (made of )?pixels|rather than pixels|instead of pixels|redrawn|recalculated|shapes|lines and)", "(enlarg|scal|resiz|bigger|larger|big|stretch|zoom|blow\\w* (it )?up|make it (bigger|larger)|increas|expand|2 ?m|banner|any size)\\w*\\W+(\\w+\\W+){0,12}(without|stay|stays|no|never|keep|keeps|not|doesn't|don't|still|remains?|looks?)", "(pixel|blur|jag|sharp|quality|crisp|clear|smooth|clean|detail)"] },
              { desc: "The file is small / supports transparency, so it is easy to send or sits cleanly on any colour", win: 60, all: ["(small|tiny|light|low|compact)\\W+(\\w+\\W+){0,2}(files?|sizes?)|(files?|sizes?)\\W+(\\w+\\W+){0,2}(small|tiny|compact)|transparen", "(email|send|upload|load|quick|fast|download|store|space|background|sit|any colour|printer|share|easy)"] },
            ],
            sample: "A vector logo is stored as points and curves rather than pixels, so it can be enlarged to the size of the 2 m banner and stay sharp, with no blurring. The file is also small, so it is quick to email to the printer.",
            model: "<ul><li>Vector images are stored as points, curves and instructions, not pixels, so they can be scaled up to 2 m without becoming pixelated or blurred (1).</li><li>The file is small (and can have a transparent background), so it is easy to send and sits cleanly on any colour (1).</li></ul>",
          },
          {
            type: "text", label: "(d)", marks: 1, rows: 2,
            q: "State one disadvantage of saving the logo as a JPEG.",
            points: [
              { desc: "JPEG has no transparency", any: ["no transparen", "(not|doesn't|does not|cannot|can't|without).{0,20}transparen", "white (box|background|square)"] },
              { desc: "JPEG is lossy: quality drops, especially each time it is re-saved", any: ["lossy", "(lose|loses|lost|loss of|drops?|worse|reduced|poorer).{0,20}quality", "quality.{0,20}(lost|loss|drops?|worse|reduced)", "each time.{0,30}(save|saved)", "re-?sav", "artefact", "blocky", "blurr"] },
            ],
            sample: "A JPEG has no transparency, so the logo would sit in a white box.",
            model: "<ul><li>No transparency, so the logo cannot sit cleanly on a coloured background (1).</li></ul><p>Or: lossy compression, so quality is lost and gets worse each time it is re-saved; it is also a raster, so it pixelates when enlarged.</p>",
          },
        ],
      },
      {
        id: "dtp-11",
        style: "Identify elements and principles · match and describe",
        stem: "<p>The summer fair poster is shown with four numbered hotspots. Flight Lieutenant Murray asks you to name what you can see in each.</p>",
        figure: figHot,
        parts: [
          { type: "match", label: "(a)", marks: 4, q: "Match each hotspot to the design element it shows.", pairs: [["1: the pale pink panel behind the dark red title", "Value"], ["2: the thick wavy magenta line under the title", "Line"], ["3: the panel filled with a wooden-plank pattern", "Texture"], ["4: the yellow circle containing FREE", "Shape"]] },
          {
            type: "text", label: "(b)", marks: 2, rows: 4,
            q: "Describe how balance has been achieved in the poster.",
            points: [
              { desc: "It is asymmetrical (informal) balance", any: ["(asymmetr\\w*|informal)\\W+(\\w+\\W+){0,1}balanc", "balanc\\w*\\W+(\\w+\\W+){0,2}(asymmetr|informal)", "not (a )?(symmetr|mirror)", AF("balanc\\w*|poster|layout", 4, "asymmetr\\w*|informal")] },
              { desc: "One large dark photograph on one side is balanced by smaller panels on the other", win: 70, all: ["(large|big|heavy|dark|bigger|largest|main)\\W+(\\w+\\W+){0,3}(image|photo\\w*|picture)", "(smaller|small|two|2|several|lighter|light)\\W+(\\w+\\W+){0,3}(panels?|boxes|items?|images?|blocks?|shapes|elements?|sections?)"] },
              { desc: "The visual weight is spread evenly, so the poster looks stable and even", any: ["(visual )?weight\\W+(\\w+\\W+){0,2}(spread|evenly|equally|balanced|shared|distributed)", "(spread|even\\w*|equal\\w*|distributed)\\W+(\\w+\\W+){0,2}weight", "(not|n't)\\W+(look\\w*\\W+){0,2}(lopsided|top heavy|one-sided|unbalanced)", "weighted\\W+(\\w+\\W+){0,2}(evenly|equally)", AF("weight|poster|layout|page", 4, "(spread|evenly|equally|distributed|shared)|(looks?|feels?|seems?)\\W+(\\w+\\W+){0,2}(stable|steady|even|settled|level)")] },
            ],
            sample: "It is asymmetrical balance. The large dark photograph on the left is balanced by the two smaller panels on the right, so the visual weight is spread out and the poster looks stable and even.",
            model: "<ul><li>Asymmetrical (informal) balance, not a mirror image (1).</li><li>The large dark photograph on the left is balanced by two smaller panels on the right (1).</li><li>The weights even out, so the layout feels stable, not lopsided (1).</li></ul><p>Any 2.</p>",
          },
        ],
      },
      {
        id: "dtp-12",
        style: "Principles in context · explain",
        stem: "<p>Cadet Sergeant Rahman made two drafts of the same leaflet page. Draft A is his first attempt and Draft B is the improved version. Features A to E are labelled on Draft B.</p>",
        figure: figDrafts,
        parts: [
          {
            type: "text", label: "(a)", marks: 2, rows: 4,
            q: "Explain how proximity has been used in Draft B.",
            points: [
              { desc: "The caption (C) is placed directly beneath the photograph (B), so they are read as a pair", win: 90, all: ["(caption|label|words|text)\\W+(\\w+\\W+){0,6}(under|below|beneath|next to|beside|close to|near|right by|just under)\\W+(\\w+\\W+){0,2}(photo\\w*|image|picture)|" + AF("caption|label", 8, "(under|below|beneath|next to|beside|close to|near|right by)\\W+(\\w+\\W+){0,3}(photo\\w*|image|picture)"), "(pair|together|group\\w*|belongs?|linked?|connected|related|go together|which picture|clear which|one unit|as one)"] },
              { desc: "The price and button (D) are grouped together, so they are seen as one related item", win: 70, all: ["(price|circle|button|book)\\W+(\\w+\\W+){0,3}(grouped|together|close|next to|beside|near)|(grouped|together)\\W+(\\w+\\W+){0,3}(price|button)|" + AF("price|circle|button|book", 6, "grouped|together|close to|next to|beside|near"), "(one|single)\\W+(\\w+\\W+){0,2}(item|group|unit|block|piece|thing)|(read|seen|see|viewed|treated|looks?)\\W+(\\w+\\W+){0,2}(as|together)|related|belong|connected|pair"] },
            ],
            sample: "The caption is placed directly beneath the photograph, so the reader sees the two as a pair and knows which picture the caption belongs to. The price and the button are grouped together too, so they are read as one related item.",
            model: "<ul><li>The caption sits directly under the photograph, so the two are read as a pair (1).</li><li>The price circle and the button are close together, so they are seen as one group of related information (1).</li></ul><p>Each mark needs the placement (cause) and what it does for the reader (effect). In Draft A the caption is far from the photograph, so it is unclear which picture it describes.</p>",
          },
          {
            type: "text", label: "(b)", marks: 2, rows: 4,
            q: "Explain how alignment has improved the look of Draft B.",
            points: [
              { desc: "The heading, photograph, caption and text all start on the same left edge", win: 50, not: ["column"], all: ["(heading|title|photo\\w*|image|picture|caption|text|items|everything)", "(same|common|shared|single|one|straight)\\W+(\\w+\\W+){0,2}(left|edge|margin|vertical)|(align\\w*|line[sd]? up)\\W+(\\w+\\W+){0,3}(left|edge|margin)|left\\W+(\\w+\\W+){0,1}(edge|aligned)"] },
              { desc: "So the page looks neat, organised and professional / is easy to follow", any: ["(look\\w*|appears?|feels?|seems?|makes? it)\\W+(\\w+\\W+){0,2}\\b(neat|tidy|organi[sz]ed|ordered|professional|clean|planned|structured|careful|deliberate)\\b", "(easy|easier|simple)\\W+(\\w+\\W+){0,3}follow", "(eye|reader)\\W+(\\w+\\W+){0,3}follow"] },
            ],
            sample: "The heading, the photograph, the caption and the body text are all lined up on the same left edge. That is why the page looks neat and organised, and the eye can follow it easily down the page.",
            model: "<ul><li>The heading, photograph, caption and text share one straight left edge (1).</li><li>So the page looks neat, organised and professional, and is easy to follow, unlike the scattered Draft A (1).</li></ul>",
          },
          { type: "mcq", label: "(c)", marks: 1, q: "What is the main purpose of the empty area labelled E in Draft B?", opts: ["It separates groups of items and stops the page looking cluttered", "It makes the photograph look further away", "It repeats a pattern across the page", "It lets the text be set in reverse"], a: 0, why: "Empty space (white space) around and between items separates groups, avoids clutter and makes the items it surrounds stand out." },
        ],
      },
    ],
  };
})();
