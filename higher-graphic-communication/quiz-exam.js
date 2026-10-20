/* Pre-flight check question bank: Exam drill (the Courts-Martial Room).
   Facts from the course specification, the 2024 question-paper marking principles and the 2025 course report.
   Open questions are original practice; the marking guidance is this site's, in the style of past marking instructions. */
(function () {
  const mi = (...pts) => "<ol class=\"step-list marks\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HG_QUIZ = Object.assign(window.HG_QUIZ || {}, {
    "ex-paper": {
      title: "The question paper",
      questions: [
        { q: "How long is the Higher Graphic Communication question paper, and how many marks is it worth?", opts: ["1 h 30 min, 60 marks", "2 h, 80 marks", "2 h 30 min, 90 marks", "3 h, 110 marks"], a: 2, why: "It is 90 marks in 2 hours 30 minutes, in one section. The other 50 of the course's 140 marks come from the assignment." },
        { q: "Roughly how long should a 6-mark question take at the paper's natural pace?", opts: ["About 4 minutes", "About 6 minutes", "About 10 minutes", "About 15 minutes"], a: 2, why: "150 ÷ 90 = 1.67 minutes a mark (1 min 40 s), so 6 marks is 10 minutes." },
        { q: "Which two areas each carry 20 to 30 marks of the paper?", opts: ["Digital technology and standards", "CAD techniques and DTP features, design elements and principles", "Interpretation and digital technology", "Standards and interpretation"], a: 1, why: "CAD (20–30) and DTP features, design elements and principles (20–30). Interpretation is 12–30, standards 7–14 and digital technology 4–12." },
        { q: "A candidate answers in pencil because it is easier to sketch. What is the risk?", opts: ["None: pencil is required for sketches", "Sketches in pencil earn a bonus mark", "The scanned script may not show the answer to the marker", "Pencil answers are marked down one mark"], a: 2, why: "Papers are scanned. The 2025 course report warns that pencil or highlighter \"may not be visible to markers\". Use blue or black ink for everything." },
        { q: "Which statement about sketching in the question paper is correct?", opts: ["Every answer must include a sketch", "Sketches must be drawn with instruments", "Sketches may support an answer; marks are for the information, not the quality of the sketch", "Sketches are not allowed"], a: 2, why: "The specification says sketches may be included but are not required, and you need not use instruments. The marking principles credit the information conveyed." },
        { type: "open", q: "Explain why a candidate should attempt every part of the paper, even when unsure of the answer.", marks: 2, model: mi("The paper uses positive marking: marks are built up for what is shown and are not deducted for errors or omissions (cause) (1)", "so a partial or uncertain answer can still earn some marks, while a blank space can earn none (effect) (1)") },
      ],
    },
    "ex-command": {
      title: "Command words",
      questions: [
        { q: "According to the marking principles, what must an 'explain' answer do?", opts: ["List as many features as possible", "Relate cause and effect, in the context of the question", "Give a single key word", "Describe only what the designer did"], a: 1, why: "Explain = cause linked to effect, in context. The 2025 report found most candidates gave the effect without the cause." },
        { q: "Which answer to 'Explain why a drop cap was used. [1]' would earn the mark?", opts: ["\"It draws the reader's eye.\"", "\"The first letter is enlarged.\"", "\"The first letter is enlarged over three lines, so the reader's eye is led to where the article starts.\"", "\"It creates emphasis.\""], a: 2, why: "Only this one has a cause (the enlarged first letter) linked to an effect (leading the eye to the start of the text)." },
        { q: "A 'describe' question is worth 2 marks. What does the marker expect?", opts: ["Two developed statements about features or characteristics", "A two-word list", "One sentence with a cause and an effect", "A sketch only"], a: 0, why: "Describe = a statement or structure of characteristics, not a bare list; the number of marks indicates the number of points." },
        { q: "What must a 'compare' answer contain?", opts: ["A description of one of the things", "Similarities and/or differences between the things named", "A cause and an effect", "A recommendation"], a: 1, why: "Compare = similarities and/or differences, in context. Write both sides, joined by 'whereas' or 'but'." },
        { q: "In an 'explain emphasis' question, which effect was not accepted in the 2024 marking instructions?", opts: ["It draws the viewer's attention", "It creates a hierarchy of importance", "It creates emphasis", "It makes the text stand out"], a: 2, why: "Saying emphasis creates emphasis repeats the question. Say what the emphasis does for the viewer." },
        { type: "open", q: "The heading on a leaflet is set in a bold magenta script font, much larger than the body text. Explain how this creates contrast.", marks: 2, model: mi("The heading is far larger and heavier than the small body text (cause), so it stands out and is read first (effect) (1)", "Its magenta colour differs sharply from the black body text (or its script style from the plain sans serif body text) (cause), so it is clearly separated from the rest and catches the eye (effect) (1)", "Each mark needs both halves; an effect alone earns nothing") },
      ],
    },
    "ex-terms": {
      title: "Using the right terminology",
      questions: [
        { q: "What is the pitch of a helix?", opts: ["The number of turns", "The distance moved along the axis in one revolution", "The diameter of the profile", "The angle of the helix"], a: 1, why: "Pitch is the axial distance per revolution. Height = pitch × number of revolutions. The 2025 report found these terms often misused." },
        { q: "A helix has a pitch of 15 and 8 revolutions. What is its overall height?", opts: ["23", "53", "120", "150"], a: 2, why: "15 × 8 = 120." },
        { q: "Which 3D constraint lines up the axes of a pin and the hole it fits in?", opts: ["Mate", "Align", "Centre axis", "Offset"], a: 2, why: "Centre axis aligns two axes. Mate puts faces together; align makes faces coplanar facing the same way; offset holds faces a set distance apart." },
        { q: "What is the space between two columns of text called?", opts: ["Margin", "Gutter", "Bleed", "Folio"], a: 1, why: "The gutter. The margin is between the page edge and the content; bleed runs past the trim; a folio is a page number." },
        { q: "Which pair are neutral 3D file formats for moving models between different CAD packages?", opts: ["JPG and PNG", "DXF and SVG", "STEP and IGES", "TIFF and BMP"], a: 2, why: "STEP and IGES. DXF is a 2D vector exchange format; JPG, PNG, TIFF and BMP are raster images." },
        { type: "open", q: "A candidate writes: \"Make the box hollow and copy the hole round it.\" Rewrite this using course-specification terminology and suitable values.", marks: 2, model: mi("Shell the box, with a wall thickness (e.g. 2 mm), naming the face(s) removed (1)", "Radial array the hole: a number of instances (e.g. 6) over an angle (e.g. 360°) about the centre axis (1)") },
      ],
    },
    "ex-cadstd": {
      title: "Technique: CAD, interpretation and standards",
      questions: [
        { q: "Which modelling step would earn a mark in a 'describe how to model' answer?", opts: ["\"Extrude the circle.\"", "\"On the XY plane sketch a Ø40 circle at the origin and extrude it 25.\"", "\"Make a cylinder.\"", "\"Use extrude and then fillet.\""], a: 1, why: "It names the plane, the profile with its size, the feature and its value. The others leave out the detail the marker needs." },
        { q: "For an extrude-along-a-path, where must the profile be drawn?", opts: ["On the same plane as the path", "On a plane perpendicular to the path at its start", "On any face of the model", "On an offset plane parallel to the path"], a: 1, why: "The profile sits on a plane perpendicular to the start of the path. Give all the path's dimensions too: the 2025 report found many left them out." },
        { q: "In third-angle projection, where is the end elevation seen from the right drawn?", opts: ["To the left of the elevation", "To the right of the elevation", "Above the plan", "Below the elevation"], a: 1, why: "Third angle: the view is drawn on the side it is seen from. Plan above, right-hand end elevation on the right." },
        { q: "A dimension reads 25 ± 0.05. What are its limits?", opts: ["25.05 and 24.95", "25.5 and 24.5", "25.1 and 24.9", "25.05 and 25.00"], a: 0, why: "Symmetrical tolerance: add and subtract 0.05." },
        { q: "Which features are NOT hatched when a cutting plane passes along them?", opts: ["Castings and plates", "Webs, shafts, bolts, nuts and threads", "Every second component", "Hollow components"], a: 1, why: "By convention webs/ribs, shafts, bolts, nuts, pins and screw threads are left unsectioned (drawn in outline)." },
        { q: "What does a thin long-dash, double-dot chain line show?", opts: ["A centre line", "A cutting plane", "A fold line on a development", "Hidden detail"], a: 2, why: "The fold line. A centre line has a single dot; a cutting plane is thick at its ends; hidden detail is dashed." },
        { type: "open", q: "A spring is to be modelled with a Ø4 profile whose centre is 20 from the axis, 12 revolutions and an overall length of 180. Describe how to model it.", marks: 3, model: mi("Sketch a Ø4 circle profile positioned 20 from the axis, on a plane through the axis (1)", "Use the helix command about that axis (1)", "Pitch 15 with 12 revolutions (or any two of pitch 15, 12 revolutions, height 180) (1)") },
        { type: "open", q: "Explain why parallel dimensioning might be chosen instead of chain dimensioning for a row of holes.", marks: 1, model: mi("Every hole is dimensioned from one datum (cause), so errors do not accumulate along the row (effect) (1)") },
      ],
    },
    "ex-dtptech": {
      title: "Technique: DTP and digital technology",
      questions: [
        { q: "A question asks you to identify where alignment has been used. What must the answer include?", opts: ["The word 'alignment' only", "The place on the layout where items line up", "A definition of alignment", "A sketch of a grid"], a: 1, why: "Identify where = point to the place: e.g. the heading and body text share the left edge of column 1. The report found identifying where was difficult for some." },
        { q: "Which statement describes a grid structure rather than listing it?", opts: ["\"It has a grid.\"", "\"Columns.\"", "\"A three-column grid with equal gutters; the main image spans two columns and the captions sit in the third.\"", "\"It looks organised.\""], a: 2, why: "It says how the grid organises the page: columns, gutters, spans and placement. The 2025 grid question was demanding for many." },
        { q: "What does 'value' mean as a design element?", opts: ["The price of the print", "How light or dark a colour or tone is", "The size of an element", "How saturated a colour is"], a: 1, why: "Value is lightness or darkness; high value has more white, low value less." },
        { q: "Which answer gives a benefit of cloud storage in context?", opts: ["\"It's quicker.\"", "\"It is online.\"", "\"Designers in different offices can open the latest version of the file, so they can work on it together.\"", "\"It saves money.\""], a: 2, why: "It says what the benefit is, for whom and why. The others are too general to earn a mark." },
        { q: "What does digital rights management (DRM) do?", opts: ["Compresses image files", "Controls who can open, copy, print or share a digital file", "Converts raster images to vector", "Backs files up to the cloud"], a: 1, why: "DRM controls access and use, protecting the owner's intellectual property." },
        { type: "open", q: "A magazine's photographs are saved as JPG files. Explain one reason a JPG (raster) file is suitable for a photograph.", marks: 1, model: mi("A raster image stores every pixel's colour (cause), so subtle changes of colour and tone in a photograph are reproduced realistically (effect) (1)", "Or: JPG is a common format (cause), so it can be opened in almost any software on any device (effect) (1)") },
        { type: "open", q: "Describe two features of a promotional page that would create unity.", marks: 2, model: mi("Any two (1 each), e.g.: a colour scheme repeated across headings, rules and shapes", "the same font family and heading style used throughout", "consistent margins, gutters and alignment to one grid", "a repeated motif or graphic element on each page") },
      ],
    },
    "ex-errors": {
      title: "The court's findings (2025 course report)",
      questions: [
        { q: "What did the 2025 report say most candidates do with 'explain' questions?", opts: ["Write too much", "Give the cause without the effect", "Give the effect without the cause", "Leave them blank"], a: 2, why: "\"Only give the effect, without the cause.\" Always write the cause first." },
        { q: "How did the report describe attempts at the questions on identifying and applying standard symbols?", opts: ["Very well answered", "Well answered by many", "Very poorly attempted", "Not attempted at all"], a: 2, why: "\"Very poorly attempted\": an easy set of marks that drilling Appendix 2 would win." },
        { q: "Which area did the report say performed very well in 2025?", opts: ["Digital technology", "Computer-aided design techniques", "DTP features, design elements and principles", "Drawing standards"], a: 1, why: "CAD techniques questions \"performed very well\", helped by better use of specification terminology." },
        { q: "An 'edit the model' question asks how to change a hole size. Which answer follows the marking instructions' approach?", opts: ["Delete the model and build it again with the new hole", "Edit the hole's sketch in the modelling tree and change its dimension", "Add a new, larger hole on top", "Scale the whole model"], a: 1, why: "Edit through the modelling tree; modelling from scratch did not earn the marks in 2024." },
        { q: "A two-mark question asks for two reasons. A candidate writes the same idea twice in different words. What happens?", opts: ["Two marks", "One mark at most: a second mark needs a different point", "Zero: repetition is penalised", "Half a mark"], a: 1, why: "Repeating one idea earns it once. Nothing is deducted (positive marking), but there is no second mark." },
        { type: "open", q: "From the 2025 course report, state two things a candidate should do to avoid losing marks in a 'describe how to model' question that uses a helix and an extrude along a path.", marks: 2, model: mi("Give all the relevant dimensions of the path (lengths, radii, angles) (1)", "Use the helix terms correctly: pitch and number of revolutions (or height) (1)") },
      ],
    },
    "ex-mock": {
      title: "Marking and grade boundaries",
      questions: [
        { q: "In 2025 the minimum mark for a grade A was 98 out of 140. What percentage is that?", opts: ["60%", "65%", "70%", "75%"], a: 2, why: "98 ÷ 140 = 0.70. B was 84 (60%), C 70 (50%) and D 56 (40%)." },
        { q: "Why is a percentage on a 36-mark practice paper only a rough guide to your grade?", opts: ["Grades come from the 140-mark course total, and boundaries are set each year", "Practice papers are always easier", "Grades are given separately for each area", "Only the assignment counts"], a: 0, why: "The grade is from the question paper plus the assignment, and the boundaries are decided each year after the exam." },
        { q: "How many minutes does a 36-mark paper take at 1 minute 40 seconds a mark?", opts: ["36", "48", "60", "72"], a: 2, why: "36 × 1.67 = 60 minutes." },
        { q: "When self-marking an open question, when should you award yourself a marking point?", opts: ["When you meant it", "When your answer actually says it", "When your answer is long", "When you used a sketch"], a: 1, why: "The marker credits only what is on the page. Mark yourself the same way." },
        { type: "open", q: "The mini-paper's Question 3 chock has a sloping face running from height 45 down to height 15 over a horizontal distance of 50. Calculate the true length of its sloping edge, and state why the elevation shows it at true length.", marks: 2, model: mi("Rise 30, run 50: true length = √(50² + 30²) = 58.3 mm (1)", "The edge lies parallel to the plane of the elevation (it runs across the front, with no depth component), so the elevation shows it at its true length (1)") },
      ],
    },
    "ex-plan": {
      title: "The last week and the day",
      questions: [
        { q: "Which use of the last week is most likely to raise your mark?", opts: ["Rereading all your notes", "Timed practice and active recall (symbols, terms, explain answers)", "Learning a brand new CAD package", "Copying out the specification"], a: 1, why: "Recall and timed practice train exactly what the exam tests: getting knowledge onto the page fast and accurately." },
        { q: "A part has taken twice its time and you are stuck. What should you do?", opts: ["Keep going until it is perfect", "Rub it out and leave it blank", "Write the points you are sure of, mark it, and move on", "Skip the rest of the question"], a: 2, why: "Positive marking banks every correct point; time spent stuck costs marks elsewhere." },
        { q: "Which item belongs on your final-minutes checklist?", opts: ["Every explain answer has a cause as well as an effect", "Every answer is rewritten neatly", "Every sketch is redrawn with a ruler", "Every answer is shortened"], a: 0, why: "The checklist targets mark-losing errors: causes, CAD sizes, specification terms, ink." },
        { type: "open", q: "Describe two things you will check in the last ten minutes of the exam.", marks: 2, model: mi("Any two developed points (1 each), e.g.: every part has an attempt, with nothing blank", "every explain answer has a cause linked to an effect", "every CAD modelling step names its plane, profile size, feature and value", "symbols and terms use the specification's words", "nothing is written in pencil or highlighter") },
      ],
    },
  });
})();
