/* Past-paper practice: web design and development. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HCP_BANK = window.HCP_BANK || {});
  /* patterns are written as regex literals and stored as strings */
  const r = (re) => re.source;

  /* ---- figures (palette: navy ink, teal, amber, paper, grey) ---- */
  const INK = "#1c2b3a", TEAL = "#2a8c8c", AMB = "#f0b429", PAP = "#fbf8f1", GRY = "#b9c2cc", SHADE = "#cfe6e6", RED = "#c0392b";
  const T = (x, y, s, o) => `<text x="${x}" y="${y}" font-size="${(o && o.size) || 13}" fill="${(o && o.fill) || INK}" text-anchor="${(o && o.anchor) || "middle"}"${o && o.bold ? ' font-weight="700"' : ""}>${s}</text>`;
  const box = (x, y, w, h, fill, label, o) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${INK}" stroke-width="1.5" rx="2"/>` + (label ? T(x + w / 2, y + h / 2 + 4.5, label, o) : "");
  const crossed = (x, y, w, h, label) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="1.4"/><path d="M${x} ${y} L${x + w} ${y + h} M${x + w} ${y} L${x} ${y + h}" stroke="${GRY}" stroke-width="1.2"/>` + (label ? T(x + w / 2, y + h / 2 + 4, label, { size: 11 }) : "");
  const badge = (x, y, t) => `<circle cx="${x}" cy="${y}" r="10" fill="${AMB}" stroke="${INK}" stroke-width="1.5"/>` + T(x, y + 4.5, t, { size: 13, bold: true });
  const bars = (x, y, widths, gap) => widths.map((w, i) => `<rect x="${x}" y="${y + i * (gap || 10)}" width="${w}" height="4" fill="${GRY}"/>`).join("");
  const ln = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${INK}" stroke-width="1.6" fill="none"/>`;

  /* Figure 1: site structure */
  const figStructure =
    `<svg viewBox="0 0 560 236" role="img" aria-label="Site structure diagram for the Harbour Gym website. Home is at the top. Below it a horizontal line joins three more shaded pages, Classes, Timetable and Contact, which with Home are the four pages in the navigation bar. Two unshaded pages, Yoga and Spin, hang below Classes, one unshaded page, Prices, hangs below Timetable, and one unshaded page, Staff, hangs below Contact.">` +
    ln(280, 48, 280, 72) + ln(105, 72, 455, 72) + ln(105, 72, 105, 88) + ln(280, 72, 280, 88) + ln(455, 72, 455, 88) +
    ln(105, 122, 105, 148) + ln(60, 148, 160, 148) + ln(60, 148, 60, 168) + ln(160, 148, 160, 168) + ln(455, 122, 455, 168) + ln(280, 122, 280, 168) +
    box(225, 14, 110, 34, SHADE, "Home") + box(50, 88, 110, 34, SHADE, "Classes") + box(225, 88, 110, 34, SHADE, "Timetable") + box(400, 88, 110, 34, SHADE, "Contact") +
    box(15, 168, 90, 34, PAP, "Yoga") + box(115, 168, 90, 34, PAP, "Spin") + box(410, 168, 90, 34, PAP, "Staff") + box(235, 168, 90, 34, PAP, "Prices") +
    `<rect x="300" y="210" width="14" height="14" fill="${SHADE}" stroke="${INK}"/>` + T(322, 222, "shaded: page is in the navigation bar", { size: 11, anchor: "start" }) +
    `</svg>`;

  /* Figure 2: desktop wireframe with lettered regions */
  const figWire =
    `<svg viewBox="0 0 560 284" role="img" aria-label="Wireframe of the desktop version of a gym web page with four lettered regions. Region A is a strip across the top holding a crossed logo box and the club name. Region B is a row of four links, Home, Classes, Timetable and Contact. Region C is the large middle area with lines of text on the left and a crossed photograph box on the right. Region D is a strip across the bottom with two short lines of contact text.">` +
    `<rect x="20" y="8" width="520" height="268" fill="${PAP}" stroke="${INK}" stroke-width="1.8"/>` +
    box(20, 8, 520, 50, "#fff", "") + crossed(32, 16, 34, 34, "logo") + T(86, 38, "Harbour Gym", { anchor: "start", size: 18, bold: true }) + badge(520, 33, "A") +
    box(20, 58, 520, 28, SHADE, "") + [["Home", 50], ["Classes", 125], ["Timetable", 215], ["Contact", 305]].map(([t, x]) => T(x, 77, t, { size: 12, anchor: "start" })).join("") + badge(520, 72, "B") +
    box(20, 86, 520, 138, "#fff", "") + bars(34, 104, [270, 270, 270, 270, 270, 270, 270, 180], 12) + crossed(330, 100, 170, 108, "photo") + badge(520, 212, "C") +
    box(20, 224, 520, 52, "#fff", "") + bars(34, 240, [200, 140], 14) + badge(520, 250, "D") +
    `</svg>`;

  /* Figure 3: four images in the 800px section */
  const figRow =
    `<svg viewBox="0 0 560 150" role="img" aria-label="Wireframe of one section that is 800 pixels wide with four equal image boxes, Image 1 to Image 4, side by side in a single row filling most of the width, with a small gap between neighbours.">` +
    `<rect x="20" y="30" width="520" height="90" fill="${PAP}" stroke="${INK}" stroke-width="1.8"/>` +
    [0, 1, 2, 3].map((i) => crossed(30 + i * 128, 42, 120, 66, "Image " + (i + 1))).join("") +
    ln(20, 18, 540, 18) + `<path d="M20 12 V24 M540 12 V24" stroke="${INK}" stroke-width="1.5"/>` + T(280, 14, "section: width 800px", { size: 12 }) +
    T(280, 140, "wireframe: the four images sit in one row", { size: 12 }) +
    `</svg>`;

  /* Figure 4: float fault, rendered */
  const figFloat =
    `<svg viewBox="0 0 560 230" role="img" aria-label="A rendered web page with a fault. A navy header runs across the top. Beneath it two blue cards are side by side on the left. The footer text, Contact us and the copyright line, appears in the empty space to the right of the cards instead of underneath them, and the pale yellow footer background is only a thin strip at the top behind the cards.">` +
    `<rect x="20" y="8" width="520" height="214" fill="#fff" stroke="${INK}" stroke-width="1.6"/>` +
    box(20, 8, 520, 34, INK, "Harbour Gym Fixtures", { fill: "#fff", size: 15, bold: true }) +
    `<rect x="20" y="42" width="520" height="26" fill="#fff3c4" stroke="${AMB}" stroke-width="1"/>` +
    box(34, 54, 150, 130, "#6aa0d6", "Card 1", { fill: "#fff", bold: true }) + box(196, 54, 150, 130, "#6aa0d6", "Card 2", { fill: "#fff", bold: true }) +
    T(360, 90, "Contact us on 0131 555 0147", { anchor: "start", size: 12 }) + T(360, 108, "&#169; Harbour Gym", { anchor: "start", size: 12 }) +
    `</svg>`;

  B.web = {
    intro:
      "<p>Web design and development is the other option in the question paper (Section 3, <b>25 marks</b>, taken <i>instead of</i> Database). These questions follow the same pattern as recent papers: short recall and reading marks first, then longer questions that ask you to <b>write HTML, CSS and JavaScript</b> and to explain what a layout fault is caused by. Code can be written exactly, in any style, as long as the rules are right; the marker looks for the properties and values.</p>" +
      "<p><b>Slips from the 2025 course report to avoid:</b> functional requirements that do not name a <i>form element</i> or a <i>JavaScript event</i>; not spotting that <code>float</code> is the cause of a layout fault, or leaving out <code>clear:both</code>; margins and padding that push boxes past the width of their container (they are added on <i>both</i> sides); confusing <i>block</i> and <i>inline</i> placement; and writing about <i>screen size</i> when the problem is <i>resolution</i>.</p>",
    questions: [
      /* ------------------------------------------------------------ 01 */
      {
        id: "web-01",
        style: "Scenario question · analysis, requirements",
        stem:
          "<p>Harbour Gym wants a website. At the first meeting the owner gave these wishes: &ldquo;Members should be able to book a class online. Visitors should be able to see the timetable. Staff want to confirm each booking on screen.&rdquo;</p>" +
          "<p>The developer turns the owner's wishes into six statements for the analysis.</p>",
        parts: [
          {
            label: "(a)", type: "multi", marks: 3,
            q: "Choose the THREE statements that are <b>functional requirements</b>.",
            opts: [
              "Visitors want to find the class timetable quickly.",
              "The Book page will have a form with a text input for the member's name (presence check, maximum 25 characters).",
              "Parents want to feel confident that the gym is safe.",
              "Clicking a class photo will use the JavaScript onclick event to show the instructor's name.",
              "The Book page will have a number input for places (range 1 to 4).",
              "Members want to be able to cancel a booking.",
            ],
            a: [1, 3, 4],
            why: "Functional requirements say what the site must contain and do, in terms of pages, media and code: a form element with its validation, and a JavaScript event. The other three describe what end users <i>want</i> (end-user requirements) with no mention of how the code will do it.",
          },
          {
            label: "(b)", type: "text", marks: 3, rows: 5,
            q: "The Book page must let a member choose ONE of the classes Yoga, Spin or Boxing, give their age (16 to 70) and then confirm the booking. When the member presses Book, a message must confirm the booking. Write the functional requirements for this page, naming the form elements, the validation and the JavaScript event that you will use. [3]",
            points: [
              { desc: "A radio button group (or a drop-down select list) for the class", any: [r(/\b(radio|drop-?down|select)\b/)] },
              { desc: "A number input for age with a range check (min 16, max 70)", all: [r(/\bnumber\b/), r(/range|\bmin\b|\bmax\b|minimum|maximum|16/)], win: 160 },
              { desc: "A button with a JavaScript onclick event (function) that shows the confirmation", all: [r(/\b(button|submit)\b/), r(/onclick|onsubmit|\bfunction\b/)], win: 160 },
            ],
            sample: "A radio button group lets the member choose one of Yoga, Spin or Boxing. A number input for the age has a range check with min 16 and max 70. A Book button uses the onclick event to run a JavaScript function that displays the confirmation message.",
            model: "<ul><li>Radio buttons (same name, different values) or a drop-down select for the class (1)</li><li>Number input for age, with range validation min 16 / max 70 (1)</li><li>A button with an onclick event calling a JavaScript function that displays the message (1)</li></ul><p>A requirement written only as &ldquo;the page will have a booking form&rdquo; earns nothing: the 2025 report asks for the underlying code to be named.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------ 02 */
      {
        id: "web-02",
        style: "Scenario question · site structure and navigation",
        stem:
          "<p>The diagram shows the structure of the Harbour Gym website. The shaded pages are in the horizontal navigation bar, which appears at the top of every page. A vertical line is a one-way link from a page down to its sub-page.</p>",
        figure: figStructure,
        parts: [
          { label: "(a)", type: "num", marks: 1, q: "State the number of pages that appear in the navigation bar.", a: 4, tol: 0, why: "The shaded pages are Home, Classes, Timetable and Contact: 4." },
          {
            label: "(b)", type: "multi", marks: 3,
            q: "A visitor is on the Spin page. Choose the THREE pages, apart from the Classes page, that the visitor can reach with ONE click.",
            opts: ["Home", "Timetable", "Contact", "Yoga", "Staff", "Prices"],
            a: [0, 1, 2],
            why: "The navigation bar is on every page, so Spin links to Home, Timetable and Contact (and to Classes). Yoga is reached only from Classes, Prices only from Timetable and Staff only from Contact, so none of them is one click from Spin.",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4,
            q: "Explain two benefits to visitors of having the same navigation bar, in the same place, on every page. [2]",
            points: [
              { desc: "Consistent, so visitors always know where to find it / learn it once", all: [r(/consisten\w*|same place|same position|always (know|find|see)|familiar|learn|get used|predictable|where to (find|look)/), r(/find|know|easy|easier|learn|used|recogni[sz]e|where/)], win: 140 },
              { desc: "Any main page can be reached from any page, so visitors are never stuck or need the back button", any: [r(/(any|every|all|each|other|main) (of the )?(\w+ )?pages?\W+(\w+\W+){0,8}(reach|get to|go to|visit|open|access)/), r(/(reach|get to|go to|visit|open|access|navigate to|jump to)\w*\W+(\w+\W+){0,6}(any|every|all|each|other|main)\W+(\w+\W+){0,2}pages?/), r(/never (stuck|lost)|back button|without going back|without (having to )?(go|going) back|from anywhere|from any page/)] },
            ],
            sample: "The bar is always in the same place, so visitors learn once where it is and can find it quickly. From any page they can click straight to any main page, so they can always move on without using the back button.",
            model: "<ul><li>Consistent position and content, so visitors know where to find it / learn it once (1)</li><li>Every main page can be reached from every page, so no one gets stuck or has to go back (1)</li></ul>",
          },
        ],
      },
      /* ------------------------------------------------------------ 03 */
      {
        id: "web-03",
        style: "Scenario question · wireframes, devices and media",
        stem:
          "<p>The wireframe below is for the desktop version of a Harbour Gym page. Crossed boxes are images. The page uses the HTML layout elements <code>header</code>, <code>nav</code>, <code>main</code> and <code>footer</code>.</p>",
        figure: figWire,
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each lettered region to the HTML element that should hold it.",
            pairs: [
              ["A: strip at the top with the logo and club name", "the header element"],
              ["B: row of links to the main pages", "the nav element"],
              ["C: the themed content, text and photograph", "the main element"],
              ["D: strip at the foot with contact details", "the footer element"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 3, rows: 5,
            q: "The club also wants a version for smartphones. Describe three changes the designer should make to the wireframe for a smartphone. [3]",
            points: [
              { desc: "Content stacked in a single column (text above the image)", any: [r(/(single|one|1) column/), r(/stack\w*/), r(/(one|1) (below|under|beneath|above) (the )?other/), r(/vertical(ly)?/), r(/(text|image|photo\w*|content)\W+(\w+\W+){0,4}(above|below|under|beneath|on top)/)] },
              { desc: "Larger buttons / links (tap targets) for fingers", any: [r(/(big|bigger|large|larger|wide|wider|chunky|easy to (tap|press|touch))\W+(\w+\W+){0,3}(buttons?|links?|tap|touch|targets?|menu|nav\w*)/), r(/tap targets?|touch(screen)?\W+(\w+\W+){0,3}(friendly|targets?|easier|easy)|fingers?|thumbs?/)] },
              { desc: "Images, video or text resized / simplified to suit the small screen and mobile data", any: [r(/(smaller|resiz\w*|scal\w*|reduc\w*|compress\w*|lower|fewer|simpl\w*|shrink\w*|fit)\W+(\w+\W+){0,5}(images?|photos?|pictures?|media|video|text|navigation|nav|menu|bar|layout|screen|width)/), r(/(images?|photos?|pictures?|media|video|navigation bar|nav bar|menu)\W+(\w+\W+){0,5}(smaller|resiz\w*|scal\w*|reduc\w*|compress\w*|simpl\w*|shrunk|shrink\w*|fit)/), r(/(larger|bigger|readable) (text|font)/)] },
            ],
            sample: "The content would be stacked in a single column, with the text above the photograph instead of beside it. The navigation links would be bigger so they are easy to tap with a finger. The photograph would be resized smaller to fit the narrow screen.",
            model: "<ul><li>Stack the content in one column (1)</li><li>Bigger buttons / links so they are easy to tap (1)</li><li>Resize or simplify images, video and the navigation bar to fit a small screen (1)</li></ul><p>Any 3.</p>",
          },
          {
            label: "(c)", type: "match", marks: 4,
            q: "The wireframe must show the file format of every item of media. Match each item to the most suitable format.",
            pairs: [
              ["A photograph of the gym floor", "JPG"],
              ["A logo that must stay sharp when it is enlarged", "SVG"],
              ["A short promotional video", "MP4"],
              ["A recording of the welcome message", "MP3"],
            ],
          },
        ],
      },
      /* ------------------------------------------------------------ 04 */
      {
        id: "web-04",
        style: "Calculation question · the box model",
        stem:
          "<p>The Harbour Gym home page has a section that is 800px wide. The wireframe shows four images side by side in one row. Each image has this CSS rule.</p>" +
          "<pre>img {\n  float: left;\n  width: 150px;\n  padding: 10px;\n  border: 2px solid black;\n  margin: 12px;\n}</pre>",
        figure: figRow,
        parts: [
          { label: "(a)", type: "num", marks: 1, q: "Calculate the total width, in pixels, that ONE image takes up on the page, including padding, border and margin. [1]", a: 198, tol: 0, unit: "px", why: "Padding, border and margin are each added on both sides: 150 + (2 x 10) + (2 x 2) + (2 x 12) = 150 + 20 + 4 + 24 = 198px." },
          { label: "(b)", type: "num", marks: 1, q: "The designer changes the margin to 15px. Calculate the total width of the four images in a row, in pixels. [1]", a: 816, tol: 0, unit: "px", why: "One image: 150 + 20 + 4 + (2 x 15) = 204px. Four images: 4 x 204 = 816px." },
          {
            label: "(c)", type: "text", marks: 2, rows: 4,
            q: "Describe what the visitor will see after the margin is changed to 15px, and explain why it no longer matches the wireframe. [2]",
            points: [
              { desc: "The fourth image drops / wraps onto a new line below the others", any: [r(/(fourth|4th|last|final)\W+(\w+\W+){0,6}(drops?|dropped|wrap\w*|moves?|moved|goes|jumps?|pushed|below|under|next line|new line|second row|underneath)/), r(/(drops?|dropped|wrap\w*|pushed|moves?|moved)\W+(\w+\W+){0,5}(next|new|second|another) (line|row)/)] },
              { desc: "Because the four images now need 816px, which is more than the 800px available, so they no longer fit in one row", any: [r(/(816|more than (the )?800|over (the )?800|exceed\w*|wider than|too wide|too big|larger than|bigger than|not enough (room|space|width)|no room|does ?n.t fit|do ?n.t fit|won.?t fit|will not fit|cannot fit|can.?t fit|not fit)/)] },
            ],
            sample: "The fourth image drops onto a new line below the other three. The four images now need 816px, which is more than the 800px width of the section, so they overflow the row, unlike the wireframe.",
            model: "<ul><li>Fourth (last) image wraps / drops onto a new line (1)</li><li>The four images need 816px, more than the 800px section, so they no longer fit in one row as the wireframe shows (1)</li></ul>",
          },
          { label: "(d)", type: "num", marks: 1, q: "The designer wants the gap between two neighbouring images to be 10px in total. What margin, in pixels, should each image have? [1]", a: 5, tol: 0, unit: "px", why: "Each image has a margin on both sides, so two neighbours contribute 5 + 5 = 10px. Writing margin: 10px would give a 20px gap, the slip the 2025 report describes." },
        ],
      },
      /* ------------------------------------------------------------ 05 */
      {
        id: "web-05",
        style: "Scenario question · float and clear",
        stem:
          "<p>The Fixtures page of a football league site is shown below as it appears in the browser. The two cards are meant to sit side by side, with the footer underneath them. This is the CSS and HTML.</p>" +
          "<pre>.card   { float: left; width: 150px; height: 130px; margin: 12px; }\nfooter  { background-color: #fff3c4; }\n\n&lt;main&gt;\n  &lt;div class=\"card\"&gt;Card 1&lt;/div&gt;\n  &lt;div class=\"card\"&gt;Card 2&lt;/div&gt;\n&lt;/main&gt;\n&lt;footer&gt;Contact us on 0131 555 0147&lt;/footer&gt;</pre>",
        figure: figFloat,
        parts: [
          {
            label: "(a)", type: "text", marks: 2, rows: 4,
            q: "Explain why the footer text appears beside the cards instead of below them. [2]",
            points: [
              { desc: "The cards are floated (float:left), so they are taken out of the normal flow", all: [r(/float\w*/), r(/out of (the )?(normal )?(flow|page)|ignor\w*|taken out|removed from|no longer (in|part of)|wrap\w*|flow\w* (round|around)|zero height|no height|collaps\w*|don.?t (take up|count)/)], win: 200 },
              { desc: "The footer is not told to clear / start below the floated cards, so it moves up beside them", any: [r(/\bclear\w*/), r(/(footer|it)\W+(\w+\W+){0,6}(moves? up|moved up|slides? up|rises?|rose|goes up|jumps? up|flows? (up|round|around)|wraps? (round|around))/)], win: 160 },
            ],
            sample: "The cards use float:left, so they are taken out of the normal flow and the footer ignores them. The footer rule lacks clear, so the footer moves up and flows alongside the cards.",
            model: "<ul><li>The cards are floated left, so they are out of the normal flow / the footer sits beside them (1)</li><li>The footer has no <code>clear</code>, so it is not forced to start below the floated cards (1)</li></ul>",
          },
          {
            label: "(b)", type: "code", marks: 2, rows: 5,
            q: "Write a CSS rule for the footer so that it starts below the cards, and also has a top margin of 10px. [2]",
            points: [
              { desc: "clear: both (or clear: left) in a footer rule", any: [r(/footer\s*\{[^}]*clear\s*:\s*(both|left)/), r(/#?\.?footer\s*\{[^}]*clear\s*:\s*(both|left)/)] },
              { desc: "margin-top: 10px in the same rule", any: [r(/footer\s*\{[^}]*(margin-top\s*:\s*10px|margin\s*:\s*10px\s+0(\s+0){0,2}\s*[;}])/)] },
            ],
            sample: "footer {\n  clear: both;\n  margin-top: 10px;\n}",
            model: "<pre>footer {\n  clear: both;\n  margin-top: 10px;\n}</pre><ul><li>clear: both in the footer rule (1)</li><li>margin-top: 10px (1)</li></ul>",
          },
          {
            label: "(c)", type: "mcq", marks: 1,
            q: "What does <code>clear: both</code> do to an element?",
            opts: ["It starts below every floated element above it, on both sides.", "It removes the float from the elements above it.", "It deletes the margin and padding of the element.", "It makes the element invisible on both sides."],
            a: 0,
            why: "clear: both makes the element begin below any left- or right-floated element above it. It does not alter those floats; it only decides where this element starts.",
          },
        ],
      },
      /* ------------------------------------------------------------ 06 */
      {
        id: "web-06",
        style: "Scenario question · write CSS for a navigation bar",
        stem:
          "<p>A school's website has this navigation bar, which shows as a bulleted list.</p>" +
          "<pre>&lt;nav&gt;\n  &lt;ul&gt;\n    &lt;li&gt;&lt;a href=\"index.html\"&gt;Home&lt;/a&gt;&lt;/li&gt;\n    &lt;li&gt;&lt;a href=\"news.html\"&gt;News&lt;/a&gt;&lt;/li&gt;\n    &lt;li&gt;&lt;a href=\"clubs.html\"&gt;Clubs&lt;/a&gt;&lt;/li&gt;\n    &lt;li&gt;&lt;a href=\"contact.html\"&gt;Contact&lt;/a&gt;&lt;/li&gt;\n  &lt;/ul&gt;\n&lt;/nav&gt;</pre>",
        parts: [
          {
            label: "(a)", type: "code", marks: 5, rows: 12,
            q: "Write the CSS that turns the list into a horizontal bar. Use descendant selectors and the float method. The rules must: remove the bullets from the list in the nav; float each list item to the left; make each link a block with padding of 10px 16px; and change the link's background colour to #336 when the mouse is over it. [5]",
            points: [
              { desc: "A descendant selector on the nav list with list-style-type: none", any: [r(/nav\s+ul\s*\{[^}]*list-style(-type)?\s*:\s*none/)] },
              { desc: "Descendant selector for the list items with float: left", any: [r(/nav\s+(ul\s+)?li\s*\{[^}]*float\s*:\s*left/)] },
              { desc: "Links as display: block", any: [r(/nav\s+((ul\s+)?li\s+)?a\s*\{[^}]*display\s*:\s*block/)] },
              { desc: "padding: 10px 16px on the links", any: [r(/nav\s+((ul\s+)?li\s+)?a\s*\{[^}]*padding\s*:\s*10px\s+16px/), r(/nav\s+((ul\s+)?li\s+)?a\s*\{[^}]*padding-(top|bottom)\s*:\s*10px[^}]*padding-(left|right)\s*:\s*16px/)] },
              { desc: "A :hover rule on the links changing background-color to #336", any: [r(/a:hover\s*\{[^}]*background(-color)?\s*:\s*#(336|333366)\b/)] },
            ],
            sample: "nav ul {\n  list-style-type: none;\n}\nnav li {\n  float: left;\n}\nnav a {\n  display: block;\n  padding: 10px 16px;\n}\nnav a:hover {\n  background-color: #336;\n}",
            model: "<pre>nav ul { list-style-type: none; }\nnav li { float: left; }\nnav a  { display: block; padding: 10px 16px; }\nnav a:hover { background-color: #336; }</pre><ul><li>nav ul, list-style-type: none (1)</li><li>nav li, float: left (1)</li><li>nav a, display: block (1)</li><li>padding: 10px 16px (1)</li><li>nav a:hover with background-color: #336 (1)</li></ul>",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "The developer wrote <code>nav ul</code> as the selector for the bullets rule, rather than just <code>ul</code>. Explain why this is better. [2]",
            points: [
              { desc: "A descendant selector matches only the list inside the nav", any: [r(/only\W+(\w+\W+){0,6}(inside|in|within|the one in|the one inside|in the)\W+(\w+\W+){0,2}nav/), r(/(inside|within|in) (the )?nav\W+(\w+\W+){0,6}only/), r(/just\W+(\w+\W+){0,5}nav/), r(/descendant|affects?\W+(\w+\W+){0,4}(in|inside) (the )?nav/)] },
              { desc: "Other lists on the page keep their bullets / are not changed", any: [r(/other\W+(\w+\W+){0,3}(lists?|ul|bullets?)/), r(/(lists?|bullets?)\W+(\w+\W+){0,5}(elsewhere|on the (rest|page)|in (the )?(main|content|body|page)|outside)/), r(/(still|keep|keeps|remain|remains)\W+(\w+\W+){0,3}bullets?/)] },
            ],
            sample: "The selector nav ul only matches the list inside the nav, so only that list loses its bullets. Other lists on the page, such as in the main content, keep their bullets because they stay as they were.",
            model: "<ul><li>Selects only the ul inside the nav (1)</li><li>Other lists on the page keep their bullets / are unaffected, whereas <code>ul</code> alone would change every list (1)</li></ul>",
          },
        ],
      },
      /* ------------------------------------------------------------ 07 */
      {
        id: "web-07",
        style: "Recall question · where CSS goes, efficient selectors",
        stem:
          "<p>A charity's website has twelve pages. All twelve use the same colours and fonts. A developer is deciding how to write the CSS.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Match each way of writing CSS to its description.",
            pairs: [
              ["Inline CSS", "a style attribute on one element"],
              ["Internal CSS", "a style block in the head of one page"],
              ["External CSS", "a separate .css file linked from the pages"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain why external CSS is the most efficient choice for this website. [2]",
            points: [
              { desc: "One file is linked from every page, so all pages share the same look", all: [r(/(one|single|same|1) (\w+ )?(file|stylesheet|css|sheet)|every page|all (the |of the )?(\w+ )?pages|linked|each page/), r(/same|share|consisten\w*|identical|match|uniform|together/)], win: 170 },
              { desc: "A change made once updates every page, so it is quicker to maintain", any: [r(/(change|edit|update|alter|modify)\w*\W+(\w+\W+){0,6}(once|one place|one file|single|in the (css|file|stylesheet))/), r(/(once|one place|one file|single (file|place|edit|change))\W+(\w+\W+){0,8}(all|every|each|twelve|12)\W+(\w+\W+){0,2}(pages?|updated|change)/), r(/(quick|quicker|easy|easier|simpler|less (time|work|code))\W+(\w+\W+){0,6}(maintain|update|change|edit)/)] },
            ],
            sample: "One CSS file is linked from every page, so all twelve pages share the same look. If a colour has to change, it is changed once in that file and every page is updated, so the site is quicker to maintain.",
            model: "<ul><li>One .css file linked from all pages, so every page has the same look (1)</li><li>A single edit updates every page, so it is quick to maintain / less repeated code (1)</li></ul>",
          },
          {
            label: "(c)", type: "code", marks: 1, rows: 3,
            q: "The CSS file contains these four rules.<pre>header { margin-top: 5px; }\nnav    { margin-top: 5px; }\nmain   { margin-top: 5px; }\nfooter { margin-top: 5px; }</pre>Rewrite them as ONE rule, using a grouping selector. [1]",
            points: [
              { desc: "header, nav, main, footer { margin-top: 5px } as a single rule", any: [r(/(header|nav|main|footer)\s*,\s*(header|nav|main|footer)\s*,\s*(header|nav|main|footer)\s*,\s*(header|nav|main|footer)\s*\{[^}]*margin-top\s*:\s*5px/)] },
            ],
            sample: "header, nav, main, footer {\n  margin-top: 5px;\n}",
            model: "<pre>header, nav, main, footer { margin-top: 5px; }</pre><p>The comma means &ldquo;and&rdquo;: one rule applies to all four elements.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------ 08 */
      {
        id: "web-08",
        style: "Scenario question · write HTML for a form, validation",
        stem:
          "<p>A cadet unit's Join page has a form that is not sent to a server. The page has this skeleton.</p>" +
          "<pre>&lt;main&gt;\n  &lt;section&gt;\n    &lt;form&gt;\n      ...\n    &lt;/form&gt;\n  &lt;/section&gt;\n&lt;/main&gt;</pre>",
        parts: [
          {
            label: "(a)", type: "code", marks: 6, rows: 10,
            q: "Write the HTML to go inside the form. It needs: a text input named <code>fullname</code> that cannot be left empty and holds at most 20 characters; a number input named <code>age</code> that accepts only 12 to 17; two radio buttons in one group named <code>section</code>, with the values <code>sea</code> and <code>air</code>; and a button to submit the form. [6]",
            points: [
              { desc: "Text input with name fullname", any: [r(/<input(?=[^>]*type\s*=\s*["']?text)(?=[^>]*name\s*=\s*["']?fullname)[^>]*>/)] },
              { desc: "required on the text input (presence check)", any: [r(/<input(?=[^>]*type\s*=\s*["']?text)(?=[^>]*\brequired\b)[^>]*>/)] },
              { desc: "maxlength=20 on the text input (length check)", any: [r(/<input(?=[^>]*type\s*=\s*["']?text)(?=[^>]*maxlength\s*=\s*["']?20\b)[^>]*>/)] },
              { desc: "Number input with name age", any: [r(/<input(?=[^>]*type\s*=\s*["']?number)(?=[^>]*name\s*=\s*["']?age)[^>]*>/)] },
              { desc: "min=12 and max=17 on the number input (range check)", any: [r(/<input(?=[^>]*type\s*=\s*["']?number)(?=[^>]*\bmin\s*=\s*["']?12\b)(?=[^>]*\bmax\s*=\s*["']?17\b)[^>]*>/)] },
              { desc: "Two radio buttons sharing the name section, with values sea and air", all: [r(/<input(?=[^>]*type\s*=\s*["']?radio)(?=[^>]*name\s*=\s*["']?section)(?=[^>]*value\s*=\s*["']?sea)[^>]*>/), r(/<input(?=[^>]*type\s*=\s*["']?radio)(?=[^>]*name\s*=\s*["']?section)(?=[^>]*value\s*=\s*["']?air)[^>]*>/)], win: 260 },
              { desc: "A submit button", any: [r(/<input(?=[^>]*type\s*=\s*["']?submit)[^>]*>/), r(/<button\b/)] },
            ],
            sample: "<input type=\"text\" name=\"fullname\" required maxlength=\"20\">\n<input type=\"number\" name=\"age\" min=\"12\" max=\"17\">\n<input type=\"radio\" name=\"section\" value=\"sea\"> Sea\n<input type=\"radio\" name=\"section\" value=\"air\"> Air\n<input type=\"submit\" value=\"Join\">",
            model: "<pre>&lt;input type=\"text\" name=\"fullname\" required maxlength=\"20\"&gt;\n&lt;input type=\"number\" name=\"age\" min=\"12\" max=\"17\"&gt;\n&lt;input type=\"radio\" name=\"section\" value=\"sea\"&gt; Sea\n&lt;input type=\"radio\" name=\"section\" value=\"air\"&gt; Air\n&lt;input type=\"submit\" value=\"Join\"&gt;</pre><ul><li>text input, name fullname (1)</li><li>required (1)</li><li>maxlength=\"20\" (1)</li><li>number input, name age (1)</li><li>min=\"12\" max=\"17\" (1)</li><li>two radio buttons with the same name and different values (1)</li><li>submit button (1)</li></ul><p>Any 6. Labels and layout elements are not needed for the marks.</p>",
          },
          {
            label: "(b)", type: "match", marks: 3,
            q: "Match each form attribute to the type of validation it provides.",
            pairs: [
              ["required", "presence check"],
              ["maxlength", "length check"],
              ["min and max", "range check"],
            ],
          },
        ],
      },
      /* ------------------------------------------------------------ 09 */
      {
        id: "web-09",
        style: "Scenario question · JavaScript events and functions",
        stem:
          "<p>A page on HMS Redstone shows four photographs of the ship, each 100px wide. When the visitor moves the pointer onto a photograph it must grow to 200px wide. When the pointer moves off, it must go back to 100px wide. Every photograph is an <code>img</code> element.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1,
            q: "Which event runs code when the pointer moves onto an element?",
            opts: ["onclick", "onmouseover", "onmouseout", "onhover"],
            a: 1,
            why: "onmouseover runs when the pointer moves onto the element. onmouseout runs when it moves off, and onclick when it is clicked or tapped. onhover is not a JavaScript event.",
          },
          {
            label: "(b)", type: "code", marks: 2, rows: 8,
            q: "Write two JavaScript functions. <code>displayLarger</code> receives a picture and sets its width to 200px. <code>displaySmaller</code> receives a picture and sets its width to 100px. [2]",
            points: [
              { desc: "displayLarger has a parameter and sets that picture's style.width to 200px", any: [r(/function\s+displaylarger\s*\(\s*(\w+)\s*\)\s*\{[^}]*\b\1\.style\.width\s*=\s*["']?200/)] },
              { desc: "displaySmaller has a parameter and sets that picture's style.width to 100px", any: [r(/function\s+displaysmaller\s*\(\s*(\w+)\s*\)\s*\{[^}]*\b\1\.style\.width\s*=\s*["']?100/)] },
            ],
            sample: "function displayLarger(pic) {\n  pic.style.width = \"200px\";\n}\nfunction displaySmaller(pic) {\n  pic.style.width = \"100px\";\n}",
            model: "<pre>function displayLarger(pic) {\n  pic.style.width = \"200px\";\n}\nfunction displaySmaller(pic) {\n  pic.style.width = \"100px\";\n}</pre><ul><li>displayLarger(pic) sets pic.style.width to \"200px\" (1)</li><li>displaySmaller(pic) sets pic.style.width to \"100px\" (1)</li></ul>",
          },
          {
            label: "(c)", type: "code", marks: 2, rows: 4,
            q: "Write the two event attributes to add to each <code>img</code> element so that it calls the correct function, passing in the image itself. [2]",
            points: [
              { desc: "onmouseover calling displayLarger(this)", any: [r(/onmouseover\s*=\s*["']\s*displaylarger\s*\(\s*this\s*\)/)] },
              { desc: "onmouseout calling displaySmaller(this)", any: [r(/onmouseout\s*=\s*["']\s*displaysmaller\s*\(\s*this\s*\)/)] },
            ],
            sample: "onmouseover=\"displayLarger(this)\"\nonmouseout=\"displaySmaller(this)\"",
            model: "<pre>onmouseover=\"displayLarger(this)\"\nonmouseout=\"displaySmaller(this)\"</pre><ul><li>onmouseover calls displayLarger(this) (1)</li><li>onmouseout calls displaySmaller(this) (1)</li></ul>",
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4,
            q: "Give two reasons why using functions is better than putting the width-changing instructions inside each <code>img</code> element. [2]",
            points: [
              { desc: "The code is written once and reused, so there is less code", any: [r(/(written|write|typed|type|coded|code|defined)\W+(\w+\W+){0,4}once/), r(/(reuse\w*|re-use\w*|same (code|function) (is |can be |gets )?(used|called|reused))/), r(/less (code|typing|repetition|repeated)|(no|avoid\w*|not)\W+(\w+\W+){0,3}(repeat\w*|duplicat\w*|copy\w*)/), r(/(repeat\w*|duplicat\w*|copy\w*|copies of)\W+(\w+\W+){0,4}(code|same)/)] },
              { desc: "One change in the function updates every photograph, so it is easier to maintain", any: [r(/(one|single|1|just one)\W+(\w+\W+){0,3}(change|edit|update|place|alteration|fix)/), r(/(change|edit|update|alter|fix)\w*\W+(\w+\W+){0,6}(once|one place|in the function|all (the )?(photos?|images?|pictures?)|every (photo|image|picture)|each (photo|image|picture))/), r(/(easier|easy|simpler|quicker|more efficient)\W+(\w+\W+){0,6}(maintain|update|change|edit|fix)/), r(/maintain\w*/)] },
            ],
            sample: "The code is written once in the function and reused for all four photographs, so there is less code to type. If the size has to change, only the function is edited and every photograph is updated, so it is easier to maintain.",
            model: "<ul><li>Written once and reused by every image, so less code (1)</li><li>A change made once in the function updates all the images, so it is easier to maintain (1)</li></ul>",
          },
        ],
      },
      /* ------------------------------------------------------------ 10 */
      {
        id: "web-10",
        style: "Scenario question · DOM access and testing an event",
        stem:
          "<p>A page about the ship HMS Redstone has this HTML.</p>" +
          "<pre>&lt;img src=\"redstone.jpg\" id=\"shipPic\" onclick=\"showInfo()\"&gt;\n&lt;p id=\"info\" style=\"display: none\"&gt;HMS Redstone: launched 1805.&lt;/p&gt;</pre>" +
          "<p>When the visitor selects the picture, the paragraph with the id <code>info</code> must be revealed, and the picture must get a border of 3px solid red.</p>",
        parts: [
          {
            label: "(a)", type: "code", marks: 3, rows: 8,
            q: "Write the JavaScript function <code>showInfo</code>. [3]",
            points: [
              { desc: "A function named showInfo with a body", any: [r(/function\s+showinfo\s*\(\s*\)\s*\{/)] },
              { desc: "Finds the paragraph by its id and sets style.display to block", any: [r(/getelementbyid\s*\(\s*["']info["']\s*\)\s*\.style\.display\s*=\s*["']\s*(block|inline)?\s*["']/), r(/\.style\.display\s*=\s*["']\s*block/)], all: [r(/getelementbyid\s*\(\s*["']info["']\s*\)/)], win: 120 },
              { desc: "Finds the picture by its id and sets its style.border to 3px solid red", all: [r(/getelementbyid\s*\(\s*["']shippic["']\s*\)\s*\.style\.border\s*=\s*["']\s*3px\s+solid\s+red\s*["']/)] },
            ],
            sample: "function showInfo() {\n  document.getElementById(\"info\").style.display = \"block\";\n  document.getElementById(\"shipPic\").style.border = \"3px solid red\";\n}",
            model: "<pre>function showInfo() {\n  document.getElementById(\"info\").style.display = \"block\";\n  document.getElementById(\"shipPic\").style.border = \"3px solid red\";\n}</pre><ul><li>function showInfo() { ... } (1)</li><li>getElementById(\"info\").style.display = \"block\" (1)</li><li>getElementById(\"shipPic\").style.border = \"3px solid red\" (1)</li></ul>",
          },
          {
            label: "(b)", type: "mcq", marks: 1,
            q: "Why is the id of each element on a page given a different value?",
            opts: ["So JavaScript and CSS can pick out that one element by name.", "So the browser can load the element faster.", "So that several elements can share one style.", "So that the element is hidden until it is clicked."],
            a: 0,
            why: "An id must be unique on the page, so <code>document.getElementById</code> (or <code>#name</code> in CSS) finds exactly one element. A class is what several elements share.",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 4,
            q: "Describe how you would test that the onclick event works as required. [2]",
            points: [
              { desc: "Click (or tap) the picture in a browser", any: [r(/\b(click\w*|tap\w*)\b/)] },
              { desc: "Check that the paragraph appears and the border shows, as the requirement says", any: [r(/(check|see|confirm|make sure|look|verify|observe|ensure|compare)\w*\W+(\w+\W+){0,8}(paragraph|text|info\w*|border|appears?|shown|displayed|visible|red|launched)/), r(/(paragraph|text|info\w*|border|red)\W+(\w+\W+){0,6}(appears?|shown|shows|displayed|visible|is there)/)] },
            ],
            sample: "Open the page in a browser and click on the picture. Then check that the paragraph about the ship appears and that the picture gets a red border, as the requirement says.",
            model: "<ul><li>Click the picture on the page (1)</li><li>Check that the paragraph appears and the red border is added, comparing with the requirement (1)</li></ul><p>Credit also for repeating the test in more than one browser.</p>",
          },
        ],
      },
      /* ------------------------------------------------------------ 11 */
      {
        id: "web-11",
        style: "Scenario question · block, inline and none",
        stem:
          "<p>The Fixtures page has three labels that should sit in one line across the page.</p>" +
          "<pre>&lt;p class=\"tag\"&gt;Home&lt;/p&gt;\n&lt;p class=\"tag\"&gt;Away&lt;/p&gt;\n&lt;p class=\"tag\"&gt;Cup&lt;/p&gt;</pre>" +
          "<p>In the browser the labels are stacked in a column, one under another, with the CSS rule <code>.tag { margin: 4px; }</code>.</p>",
        parts: [
          {
            label: "(a)", type: "text", marks: 2, rows: 4,
            q: "Explain why the labels appear in a column. [2]",
            points: [
              { desc: "A p element is block-level (display: block by default)", any: [r(/block(-| )?level|display\s*:\s*block|\bblock\b/)] },
              { desc: "A block starts on a new line and takes the full width, so the next element goes below", any: [r(/(new|own|separate|next) line/), r(/(full|whole|entire) (width|line|row)|takes? up the (full|whole|entire)/), r(/(below|under|underneath|beneath)\W+(\w+\W+){0,4}(each|other|previous|one)/)] },
            ],
            sample: "A p element is a block-level element by default. Each block starts on a new line and takes the full width of the page, so the next label has to go on the line below.",
            model: "<ul><li>p is a block element by default (1)</li><li>Block elements start on a new line and use the full width, so each label goes below the last (1)</li></ul>",
          },
          {
            label: "(b)", type: "code", marks: 2, rows: 4,
            q: "Rewrite the <code>.tag</code> rule so the labels sit in one line, with a right margin of 8px. [2]",
            points: [
              { desc: "display: inline (or float: left) in the .tag rule", any: [r(/\.tag\s*\{[^}]*(display\s*:\s*inline|float\s*:\s*left)/)] },
              { desc: "margin-right: 8px in the same rule", any: [r(/\.tag\s*\{[^}]*margin-right\s*:\s*8px/)] },
            ],
            sample: ".tag {\n  display: inline;\n  margin-right: 8px;\n}",
            model: "<pre>.tag {\n  display: inline;\n  margin-right: 8px;\n}</pre><ul><li>display: inline (float: left is also accepted) (1)</li><li>margin-right: 8px (1)</li></ul>",
          },
          {
            label: "(c)", type: "mcq", marks: 1,
            q: "Which CSS declaration stops an element being displayed on the page at all?",
            opts: ["display: none", "display: inline", "display: block", "clear: both"],
            a: 0,
            why: "display: none removes the element from the display: nothing is drawn and no space is kept for it.",
          },
        ],
      },
      /* ------------------------------------------------------------ 12 */
      {
        id: "web-12",
        style: "Scenario question · testing and evaluation",
        stem:
          "<p>Harbour Gym's finished website is tested against its requirements. These are the results.</p>" +
          "<table><thead><tr><th>Req.</th><th>Requirement</th><th>Test result</th></tr></thead><tbody>" +
          "<tr><td>R1</td><td>The navigation bar is on every page</td><td>Pass</td></tr>" +
          "<tr><td>R2</td><td>The Join form only lets in visitors aged 12 to 17</td><td>The form took the age 18 without complaint</td></tr>" +
          "<tr><td>R3</td><td>Members can reserve places from the Events page</td><td>The page showed paragraphs only</td></tr>" +
          "<tr><td>R4</td><td>The Gallery video plays</td><td>Pass</td></tr>" +
          "</tbody></table>" +
          "<p>The stylesheet sets <code>body { width: 1200px; }</code>. The owner's old laptop has a low-resolution display, 1024 pixels across.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each test to how it is carried out.",
            pairs: [
              ["Input validation", "Try to enter wrong data in every field, such as blanks or numbers just outside the limits"],
              ["Navigation bar", "Click every link on every page and check the right page opens"],
              ["Browser compatibility", "Open the site in Chrome, Firefox, Safari and Edge and compare how it looks"],
              ["Device compatibility", "View the site on a desktop, a tablet and a smartphone"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain the problem that the stylesheet will cause on the owner's laptop. [2]",
            points: [
              { desc: "The page is a fixed width of pixels, wider than the display (which has fewer pixels across)", any: [r(/(wider|bigger|larger|more|exceed\w*|too wide|too big|too large)\W+(\w+\W+){0,8}(pixels?|display|screen|laptop|monitor|1024)/), r(/(fewer|less|only)\W+(\w+\W+){0,3}pixels/), r(/(does ?n.t|do ?n.t|won.?t|will not|cannot|can.?t|not)\W+(\w+\W+){0,2}fit/)] },
              { desc: "The visitor has to scroll sideways (horizontally) to see all of the page", any: [r(/(scroll\w*)\W+(\w+\W+){0,5}(sideways|horizontal\w*|across|left|right)/), r(/(sideways|horizontal\w*)\W+(\w+\W+){0,4}scroll/), r(/(cut off|cropped|hidden|off the (screen|edge)|missing)/)] },
            ],
            sample: "The page is fixed at 1200 pixels wide but the display only has 1024 pixels across, so the page is wider than the display and overflows it. The visitor has to scroll sideways to see all of it.",
            model: "<ul><li>Fixed width of 1200 pixels is wider than the 1024 pixels the display has, so the page does not fit (1)</li><li>The visitor has to scroll horizontally to see all of the content (1)</li></ul><p>Answer in terms of <b>resolution</b> (the number of pixels), not just &ldquo;a small screen&rdquo;: the 2025 report notes most candidates wrote about screen width.</p>",
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 5,
            q: "Is the website fit for purpose? Give two reasons for your answer, referring to the table. [2]",
            points: [
              { desc: "R2: the age check is missing or wrong (no range validation on the age)", any: [r(/validat\w*|range (check|validation)|age (check|limit|restriction)|(should|must|ought to) (have )?(reject|stop|block|refuse|not (let|allow|accept))|(let|allow|accept)\w*\W+(\w+\W+){0,4}(18|too old|over|older|wrong age|invalid)|(18|too old)\W+(\w+\W+){0,6}(accept\w*|allow\w*|let|through|passed|not rejected)/)], negOK: true },
              { desc: "R3: no way to reserve places on the Events page (no form)", any: [r(/no form|missing form|form (is )?(missing|absent|not there)|without a form|lacks?( a)? form|(has|have) no (reservation |booking )?form|(can.?t|cannot|unable to|no way (to|of)|not possible to|not able to) (book|reserve)|only (has |shows |displays )?(text|paragraphs?)|no inputs?/)], negOK: true },
            ],
            sample: "No, the site is not fit for purpose because it fails requirements. The Join form has no range validation on the age, so a visitor aged 18 was let through. The Events page has no form, so members cannot reserve places.",
            negOK: true,
            model: "<ul><li>R2 not met: the Join form lacks a range check, so an age outside 12-17 was accepted (1)</li><li>R3 not met: the Events page has no form for reserving places (1)</li></ul><p>Fitness for purpose means meeting <i>every</i> requirement. Do not answer about robustness. Two passed tests (R1, R4) do not rescue the site.</p>",
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 5,
            q: "Before any code was written, the developer ran usability tests with a low-fidelity prototype and a persona. Describe how each was used. [2]",
            points: [
              { desc: "The prototype: simple paper or linked boxes made from the wireframes that testers click through / try", all: [r(/paper|sketch\w*|mock-?up|simple|boxes|wireframes?|cheap|quick/), r(/click\w*|try|tries|trying|work\w* through|\btest(s|ers?)?\b|\buse[sd]?\b|\bnavigate|go through|go around/)], win: 170 },
              { desc: "The persona: a fictional, realistic user that the tester pretends to be", all: [r(/pretend\w*|play\w*|\bact\w*|role|imitat\w*|as if|takes? on|adopt\w*|become|becomes/), r(/fictional|made.?up|imaginary|invented|realistic|typical|character|profile|\b(a|an) (\w+ )?(user|person|parent|member|visitor)\b/)], win: 170 },
            ],
            sample: "The low-fidelity prototype is a simple paper or boxes mock-up of the wireframes that testers click through to see if they can find things. The persona is a made-up realistic user, and the tester pretends to be that person while they try the prototype.",
            model: "<ul><li>Prototype: a quick, cheap mock-up (paper or simple linked boxes) made from the wireframes, which testers click through and try, so problems are found before coding (1)</li><li>Persona: a made-up but realistic user (for example a 52-year-old parent) whom the tester pretends to be, so the site is tried from that user's point of view (1)</li></ul>",
          },
        ],
      },
    ],
  };
})();
