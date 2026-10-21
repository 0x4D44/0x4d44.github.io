/* Pre-flight check question bank: Standards & views.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML), self-marked. All questions are original. */
(function () {
  const mi = (...pts) => "<ol class=\"step-list\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HG_QUIZ = Object.assign(window.HG_QUIZ || {}, {
    "st-types": {
      title: "Graphic types and manual media",
      questions: [
        { q: "A dimensioned, sectioned assembly drawing with a parts list is an example of…", opts: ["a preliminary graphic", "a production graphic", "a promotional graphic", "an informal sketch"], a: 1, why: "It gives the maker everything needed to manufacture and assemble the product: a production graphic." },
        { q: "Which pencil grade gives the lightest, finest line, suitable for construction lines?", opts: ["2B", "B", "HB", "2H"], a: 3, why: "H grades are hard and light. B grades are soft and dark; HB is in between." },
        { q: "Which medium is best for soft, blended colour over a large background area?", opts: ["Fineliner", "Pastels", "Technical pen", "Mechanical pencil"], a: 1, why: "Pastels blend easily over large areas, such as skies and backgrounds." },
        { q: "Which is a merit of CAD over manual drawing?", opts: ["No software or training is needed", "Changing the model updates every linked view and dimension", "It is the fastest way to brainstorm ideas with a client", "It needs no electricity"], a: 1, why: "Associative views update automatically. The other three are merits of manual methods." },
        { type: "open", q: "A designer sketches ideas by hand at a client meeting, then models the chosen idea in CAD. Explain one advantage of each method at its stage.", marks: 2, model: mi("•1 Manual sketching is quick and needs no equipment, so many ideas can be shown and changed in front of the client during the meeting.", "•2 CAD is accurate and associative, so when the chosen design changes, the drawings update automatically and production drawings can be generated without redrawing.") },
      ],
    },
    "st-lines": {
      title: "Line types",
      questions: [
        { q: "Which line type shows the axis of a hole?", opts: ["Dashed thin", "Long dash, dot, thin chain", "Long dash, double dot, thin chain", "Continuous thick"], a: 1, why: "Centre lines are thin chain lines: long dash, dot." },
        { q: "A fold line on a development is drawn as…", opts: ["a thin long dash, double dot chain line", "a thin long dash, dot chain line", "a dashed thin line", "a continuous thin line"], a: 0, why: "The double dot tells a fold line apart from a centre line." },
        { q: "What makes a cutting plane different from a centre line?", opts: ["It is dashed", "It is thick all the way along", "It is thick at the ends, with arrows and letters", "It is drawn in colour"], a: 2, why: "Both are thin chain lines, but the cutting plane is thick at its ends and has arrows showing the direction of viewing." },
        { q: "Which is the only line type drawn thick for its whole length?", opts: ["Hidden detail", "Projection line", "Outline", "Dimension line"], a: 2, why: "Outlines (visible edges) are continuous thick; everything else is thin, so the shape stands out." },
        { q: "In the end view of an external screw thread, the thin three-quarter circle represents…", opts: ["the major diameter", "the minor diameter", "the thread pitch", "a chamfer"], a: 1, why: "For an external thread the major diameter is the thick outline; the minor diameter is the thin broken circle." },
        { type: "open", q: "State the line type used for (a) hidden detail and (b) projection lines, and give the purpose of each.", marks: 2, model: mi("•1 Hidden detail: dashed thin line, to show edges hidden behind material from the direction of view.", "•2 Projection line: continuous thin line, to carry a point or size from one view to another.") },
      ],
    },
    "st-dims": {
      title: "Dimensioning and tolerances",
      questions: [
        { q: "What does 60AF on a hexagon mean?", opts: ["60 mm across the corners", "60 mm across the flats", "a 60° angle", "a 60 mm pitch circle"], a: 1, why: "AF is across flats: the distance between two parallel flat faces (the spanner size). AC is across corners." },
        { q: "Which dimensioning method avoids the risk of errors accumulating from feature to feature?", opts: ["Chain", "Parallel", "Leader", "Radial"], a: 1, why: "Parallel dimensions are all measured from one datum, so no error is passed on." },
        { q: "A size is written 30 +0.35 / −0.55. What is the minimum size?", opts: ["29.65", "29.45", "30.35", "29.80"], a: 1, why: "30 − 0.55 = 29.45 (the maximum is 30.35)." },
        { q: "A common tolerance is written 50.20 above 49.90. What is the tolerance?", opts: ["0.10", "0.20", "0.30", "50.05"], a: 2, why: "Upper limit − lower limit = 50.20 − 49.90 = 0.30." },
        { q: "Why is there a small gap between an object and its extension lines?", opts: ["To save ink", "So the extension line is not mistaken for part of the outline", "Because the dimension is smaller than the object", "To show it is a hidden edge"], a: 1, why: "The gap keeps the dimensioning separate from the object's outline, as Appendix 2 shows." },
        { type: "open", q: "A spindle is dimensioned Ø20 ± 0.05 and must fit a bearing. (a) Calculate its maximum and minimum diameters. (b) State whether this is a functional or non-functional dimension, with a reason.", marks: 3, model: mi("•1 Maximum 20.05", "•2 Minimum 19.95", "•3 Functional: the diameter is essential to the spindle fitting and working in the bearing.") },
      ],
    },
    "st-ortho": {
      title: "Third-angle projection",
      questions: [
        { q: "In third-angle projection, where is the plan drawn?", opts: ["Below the elevation", "Above the elevation", "To the left of the elevation", "Anywhere, if labelled"], a: 1, why: "Third angle: the plan sits directly above the elevation." },
        { q: "The end elevation viewed from the left is drawn…", opts: ["to the right of the elevation", "to the left of the elevation", "below the plan", "above the plan"], a: 1, why: "In third angle each end elevation goes on the side it is viewed from." },
        { q: "In the third-angle symbol, what is on the left?", opts: ["The truncated cone, small end left", "Two concentric circles", "A single circle", "A square"], a: 1, why: "Two circles (the view from the small end) on the left, the cone's elevation on the right with its small end towards them." },
        { q: "Which pair of views share the object's height and line up horizontally?", opts: ["Plan and elevation", "Elevation and end elevation", "Plan and end elevation", "None of them"], a: 1, why: "Height appears in the elevation and the end elevation, which sit side by side." },
        { type: "open", q: "A block has a hole drilled vertically down through it. Describe how the hole appears in the plan and in the elevation.", marks: 2, model: mi("•1 Plan: a circle drawn in thick (outline) line, with crossing centre lines.", "•2 Elevation: two vertical dashed thin (hidden detail) lines with a centre line between them.") },
      ],
    },
    "st-sections": {
      title: "Sections and hatching",
      questions: [
        { q: "Hatching on a sectional view is drawn as…", opts: ["thick lines at 30°", "thin lines at 45°, evenly spaced", "thin lines at 60°, closer near edges", "dots"], a: 1, why: "Thin, 45°, evenly spaced." },
        { q: "In a sectioned assembly, which of these should NOT be hatched when cut lengthways?", opts: ["A housing", "A cover plate", "A bolt", "A pulley wheel"], a: 2, why: "Bolts, shafts, nuts, washers, pins, ribs and webs are not sectioned when cut along their length." },
        { q: "Two different parts touch in a section. How should they be hatched?", opts: ["Identically", "In different directions (or spacing)", "One hatched, one left blank", "Both cross-hatched"], a: 1, why: "Adjacent parts must be clearly distinguished." },
        { q: "In a stepped section, the changes of direction of the cutting plane are…", opts: ["shown as thick lines in the section view", "not shown in the section view", "shown as hidden detail", "hatched in a different direction"], a: 1, why: "The section is drawn as if cut by one flat plane; the steps appear only on the cutting plane line." },
        { q: "Which section shows the cross-section of an arm turned through 90° and drawn on the view itself?", opts: ["Part section", "Full section", "Revolved section", "Cut-away"], a: 2, why: "A revolved section is rotated in place on the view." },
        { type: "open", q: "Describe two features of a cutting plane that tell the reader how a section was taken.", marks: 2, model: mi("•1 It is a thin chain line (long dash, dot) made thick at the ends, showing where the object is cut.", "•2 Arrows at the ends show the direction of viewing, and letters (e.g. A–A) link it to the section view's label.") },
      ],
    },
    "st-assembly": {
      title: "Assemblies and exploded views",
      questions: [
        { q: "The minimum number of parts the course expects in an assembly drawing is…", opts: ["two", "three", "five", "ten"], a: 1, why: "The specification says assembly drawings of a minimum of three parts." },
        { q: "Two identical washers in an assembly are given…", opts: ["two different item numbers", "one item number, quantity 2", "no item number", "the item number of the bolt"], a: 1, why: "Identical parts share one item number; the parts list gives the quantity." },
        { q: "In an exploded view the parts are moved apart…", opts: ["in any direction that looks good", "along the lines on which they assemble, in order, on common centre lines", "so that none overlap the title block", "and rotated to show their undersides"], a: 1, why: "Alignment and order are what make an exploded view readable." },
        { q: "What does a leader line from a balloon end in when it touches the inside of a part's surface?", opts: ["An arrowhead", "A dot", "A cross", "Nothing"], a: 1, why: "A leader ending within a surface ends in a dot; one touching an outline ends in an arrowhead." },
        { type: "open", q: "Name four items of information found in a drawing's title block.", marks: 2, model: mi("•1 Any two of: drawing title, project title, name, date.", "•2 Any two others: scale, projection symbol, units (all dimensions in mm), general tolerance, sheet number.") },
      ],
    },
    "st-scales": {
      title: "Scales",
      questions: [
        { q: "A scale of 2:1 is…", opts: ["a reduction", "full size", "an enlargement", "only used for buildings"], a: 2, why: "Drawing : real = 2 : 1, so the drawing is twice the real size." },
        { q: "A 3 m wall drawn at 1:50 is how long on the drawing?", opts: ["6 mm", "60 mm", "150 mm", "600 mm"], a: 1, why: "3000 mm ÷ 50 = 60 mm." },
        { q: "On a 1:5 drawing a line measures 84 mm. The real length is…", opts: ["16.8 mm", "84 mm", "420 mm", "4.2 m"], a: 2, why: "84 × 5 = 420 mm." },
        { q: "A part is 120 mm long and drawn at 1:2. What does its dimension say on the drawing?", opts: ["60", "120", "240", "1:2"], a: 1, why: "Dimensions always state the real size." },
        { type: "open", q: "A flagpole is 7.2 m tall. Calculate its height on a drawing at 1:20, showing your working, and state why a scale is needed.", marks: 2, model: mi("•1 7.2 m = 7200 mm; 7200 ÷ 20 = 360 mm.", "•2 The flagpole is too big to draw full size on the sheet, so it is reduced to fit while keeping its proportions.") },
      ],
    },
    "st-building": {
      title: "Building drawings and BSI symbols",
      questions: [
        { q: "A circle with a diagonal cross inside it is the symbol for…", opts: ["a socket", "a lamp", "a proposed tree", "drainage"], a: 1, why: "Lamp: a circle with a cross. A proposed tree has an upright plus sign." },
        { q: "On a window symbol, two lines meet at the middle of the top edge. The window is…", opts: ["hinged at the top", "hinged at the bottom", "sliding horizontally", "fixed"], a: 0, why: "The lines meet at the hinged side." },
        { q: "A dotted circle with a dot inside represents…", opts: ["an existing tree", "a proposed tree", "an existing tree to be removed", "a lamp"], a: 2, why: "The dotted outline marks a tree that is to be removed." },
        { q: "Which material symbol shows dots and small triangles between two lines?", opts: ["Brickwork", "Concrete", "Insulation board", "Wood sawn"], a: 1, why: "The dots and triangles stand for the aggregate in concrete." },
        { q: "What does a north point on a site plan show?", opts: ["The slope of the land", "Which way is north, so the building's orientation is known", "Where the drains run", "The scale"], a: 1, why: "It orients the plan: which way the building faces." },
        { type: "open", q: "Describe the BSI symbols for (a) a WC and (b) wood sawn, any type.", marks: 2, model: mi("•1 WC: a tall narrow rectangle with a line across near the top (the cistern).", "•2 Wood sawn: a rectangle with both diagonals drawn, making a cross.") },
      ],
    },
    "st-interpret": {
      title: "Interpreting graphic items",
      questions: [
        { q: "A circle in the plan appears as two dashed lines in the elevation. The feature is most likely…", opts: ["a cylinder standing on top", "a vertical hole", "a horizontal slot", "a chamfer"], a: 1, why: "Seen end-on from above (circle) and hidden from the front (dashed lines): a vertical hole." },
        { q: "A line in the elevation has no corresponding line, point or circle in the plan. What should you suspect?", opts: ["Nothing: views need not agree", "A missing line (or a misreading)", "The drawing is first angle", "It is a dimension"], a: 1, why: "Every feature projects between views; a missing partner signals a missing line." },
        { q: "Which views show the object's depth in third angle?", opts: ["Elevation only", "Plan and end elevation", "Elevation and end elevation", "None"], a: 1, why: "Depth runs up the plan and across the end elevation." },
        { q: "For interpretation answers, which is true?", opts: ["Sketches must be drawn with instruments", "Marks are for information conveyed, not sketch quality", "Pencil is preferred", "Only written answers gain marks"], a: 1, why: "Sketching is optional and judged on content; use blue or black ink because scripts are scanned." },
        { type: "open", q: "A section of a pulley block shows a shaft drawn without hatching while the parts around it are hatched. Explain why.", marks: 2, model: mi("•1 By convention, shafts (like bolts, pins and nuts) cut lengthways by the cutting plane are not sectioned/hatched…", "•2 …because hatching a solid shaft would show no internal detail and would make the drawing harder to read.") },
      ],
    },
  });
})();
