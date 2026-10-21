/* Pre-flight check question bank: cad (computer-aided design).
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (a •1 •2 list), self-marked. Every question is original. */
(function () {
  const mi = (...pts) => "<ol class=\"step-list marks\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HG_QUIZ = Object.assign(window.HG_QUIZ || {}, {
    "cad-what": {
      title: "What CAD is",
      questions: [
        { q: "Which kind of 3D model has volume, so that CAD can calculate its mass and cut a section through it?", opts: ["A wireframe model", "A surface model", "A solid model", "A 2D drawing"], a: 2, why: "A solid model is closed and filled. A wireframe has only edges and a surface model only a skin of faces, so neither has an inside." },
        { q: "A CAD model is described as <em>parametric</em>. This means that…", opts: ["it can only be viewed in perspective", "its features are driven by dimensions and relationships that can be changed, and the model rebuilds", "it is made only of polygon meshes", "it cannot be edited once saved"], a: 1, why: "Parametric: the shape is controlled by parameters (dimensions, constraints). Change one and the dependent features are recalculated." },
        { q: "Which is a limitation of CAD rather than an advantage?", opts: ["Models can be checked for interference before manufacture", "One model can produce orthographic, sectional and pictorial views", "The software and the training to use it cost money", "Drawings update when the model changes"], a: 2, why: "Cost of software, hardware and training is a genuine limitation. The other three are advantages." },
        { q: "Why does the course use generic CAD terms such as <em>extrude</em> and <em>centre axis</em>?", opts: ["Because they are the only commands CAD has", "Because the course is package-independent: the terms work whichever software you use", "Because every package uses exactly these menu names", "Because they are shorter to write"], a: 1, why: "Packages name tools differently. The specification's generic terms are the ones the question paper uses and the markers expect." },
        { type: "open", q: "A boatbuilder still draws all her designs by hand. Describe two advantages to her of producing 3D CAD models instead.", marks: 2, model: mi(
          "Any one: changes are quick, because editing a dimension updates the model and its drawings automatically;",
          "Any other: the model can be checked for fit and interference before anything is built; drawings, sections and renders all come from one model; files can be shared instantly or sent to CNC machines; library parts save time; accuracy to fractions of a millimetre.",
          "Each point must say what the benefit is, not just name a feature (\"it is faster\" alone is not enough).") },
      ],
    },
    "cad-sketch": {
      title: "2D tools and constraints",
      questions: [
        { q: "Which 2D tool copies a profile at a set distance so that every line stays parallel to the original?", opts: ["Mirror", "Offset", "Extend", "Project edge"], a: 1, why: "Offset makes a parallel copy at a set distance: ideal for wall thicknesses and rims." },
        { q: "Eight holes are arrayed radially through a total angle of 270°, with holes at both ends of the arc. What is the angle between neighbouring holes?", opts: ["33.75°", "38.57°", "45°", "30°"], a: 1, why: "Eight holes have seven gaps along the arc: 270 ÷ 7 ≈ 38.57°. Dividing by 8 treats it like a full circle, where the last copy would land on the first." },
        { q: "Which constraint makes two circles share the same centre?", opts: ["Tangent", "Fixed", "Concentric", "Parallel"], a: 2, why: "Concentric circles share one centre point. Tangent circles touch at one point." },
        { q: "What does the <em>project edge</em> tool do?", opts: ["Extends a line to meet a boundary", "Copies an existing edge of the model onto the current sketch plane", "Draws a projection line between orthographic views", "Rounds a corner"], a: 1, why: "Project edge brings existing model geometry into the sketch, so new profiles line up exactly with what is already there." },
        { q: "A sketch is <em>fully constrained</em> when…", opts: ["it has been extruded", "every line has a dimension", "nothing in it can move except by changing one of its constraints", "it contains only straight lines"], a: 2, why: "A fully constrained sketch has no degrees of freedom left: it changes only when you edit a constraint." },
        { type: "open", q: "A designer has drawn a rough outline of a cleat with overlapping lines. Describe how she would use the trim and fillet tools to produce a neat profile with rounded corners.", marks: 2, model: mi(
          "Trim: select the parts of the lines that overshoot each intersection and remove them, leaving a single closed loop;",
          "Fillet: select each corner (pair of lines) and apply a fillet of a stated radius (e.g. R5), which replaces the corner with an arc tangent to both lines.") },
      ],
    },
    "cad-features": {
      title: "Modelling features",
      questions: [
        { q: "A coil spring has a pitch of 15 and 8 revolutions. What is its overall length?", opts: ["23", "120", "1.875", "15"], a: 1, why: "Overall length = pitch × number of revolutions = 15 × 8 = 120." },
        { q: "Which statement uses helix terminology correctly?", opts: ["Pitch 6 revolutions", "Pitch 20, 6 revolutions", "Revolutions of 20 mm pitch length 6", "Length 6 turns, pitch 120"], a: 1, why: "Pitch is a distance (20) and revolutions a count (6). The report criticised answers that mixed the two up." },
        { q: "Which feature would best model a duct that changes from a square cross-section at one end to a circle at the other?", opts: ["Extrude", "Revolve", "Loft", "Helix"], a: 2, why: "Loft blends between different profiles on separate planes. An extrusion keeps the same cross-section all the way." },
        { q: "When using extrude along a path, the profile should be drawn…", opts: ["on any plane, anywhere", "on a work plane perpendicular to the path at its end", "on the same plane as the path, beside it", "after the sweep has been made"], a: 1, why: "The profile sits on a plane at right angles to the path at its start, so the path drives it straight along." },
        { q: "Which is <em>not</em> needed to describe a revolve?", opts: ["The profile and its sizes", "The axis", "The angle of revolution", "A second profile on an offset work plane"], a: 3, why: "A second profile on another plane is what a loft needs. A revolve needs a profile, an axis and an angle." },
        { type: "open", q: "A brass hook is a Ø8 rod bent into an L: 60 straight up, a 90° bend of radius 20, then 40 horizontally. Describe how it could be modelled using extrude along a path.", marks: 3, model: mi(
          "Sketch the path on a plane (e.g. XZ): a line 60, a tangent arc R20 and a line 40, all dimensioned;",
          "On a work plane perpendicular to the path at one end, sketch a Ø8 circle centred on the end of the path;",
          "Use extrude along a path (sweep), selecting the Ø8 profile and the path.") },
      ],
    },
    "cad-edits": {
      title: "Modelling edits and Booleans",
      questions: [
        { q: "To make a hollow box open at the top with walls 3 thick from a solid block, which edit is used?", opts: ["Fillet", "Shell, thickness 3, removing the top face", "Chamfer 3", "Mirror"], a: 1, why: "Shell hollows a solid to a wall thickness and removes the faces you select." },
        { q: "An <em>irregular</em> fillet is one in which…", opts: ["the radius changes along the edge", "two different edges are rounded", "the edge is cut with a flat bevel", "the radius is exactly 45°"], a: 0, why: "Regular: one constant radius. Irregular (variable): the radius varies along the edge." },
        { q: "A chamfer cut back 6 mm on one face and 10 mm on the other is…", opts: ["a regular chamfer", "an irregular chamfer", "a regular fillet", "a shell"], a: 1, why: "Unequal distances make an irregular chamfer. A regular chamfer has equal distances (45°)." },
        { q: "Two solids overlap. Which Boolean operation keeps only the volume they share?", opts: ["Add", "Subtract", "Intersect", "Mirror"], a: 2, why: "Intersect keeps the common volume. Add joins them; subtract removes one from the other." },
        { q: "Why should a part normally be shelled <em>before</em> holes are cut through its walls?", opts: ["Shell cannot work on a part with any edges", "If the holes are cut first, the shell builds a wall round each hole on the inside", "Holes must always be the first feature", "It makes no difference"], a: 1, why: "Shell keeps a wall of the set thickness around every face, including the faces of existing holes." },
        { type: "open", q: "A block A (volume 400 cm³) and a cylinder B (volume 150 cm³) overlap by 60 cm³. Describe the result of <em>add</em> and of <em>subtract</em> (B from A), giving each volume.", marks: 2, model: mi(
          "Add (join): one solid made of both bodies; volume 400 + 150 − 60 = 490 cm³ (the overlap is only counted once);",
          "Subtract: A with the part inside B removed, leaving a hollow or hole where B was; volume 400 − 60 = 340 cm³.") },
      ],
    },
    "cad-terms": {
      title: "Terminology and the modelling tree",
      questions: [
        { q: "What does <em>suppress</em> do to a feature?", opts: ["Deletes it permanently", "Switches it off temporarily so the model rebuilds without it", "Hides the whole part", "Makes it transparent"], a: 1, why: "A suppressed feature stays in the tree and can be unsuppressed. Features that depend on it are suppressed with it." },
        { q: "A triangular prism has how many vertices, edges and faces?", opts: ["6, 9, 5", "6, 12, 6", "5, 9, 6", "8, 12, 6"], a: 0, why: "Two triangles: 6 vertices; 3 + 3 + 3 = 9 edges; 2 triangles + 3 rectangles = 5 faces. Check: 6 − 9 + 5 = 2." },
        { q: "In which kind of modelling are components created inside the assembly, using geometry projected from parts already there?", opts: ["Bottom-up", "Top-down", "Surface", "Wireframe"], a: 1, why: "Top-down builds parts in place within the assembly. Bottom-up builds each part separately and assembles afterwards." },
        { q: "A <em>datum</em> is…", opts: ["a fixed reference point, axis or plane from which positions are measured", "a type of fillet", "the last feature in the tree", "a stock component"], a: 0, why: "Datums (the origin and its planes, for example) are the references a model is built from." },
        { q: "A designer needs to change the Ø20 hole in a finished bracket to Ø25. What should she do?", opts: ["Model the bracket again from the start", "In the modelling tree, select the hole's sketch and change the diameter to 25", "Add a new Ø25 hole on top of the old one", "Scale the whole bracket by 1.25"], a: 1, why: "Edit through the tree: the hole rebuilds at Ø25 and everything after it updates. Remodelling from scratch earned no marks in the 2024 marking instructions." },
        { type: "open", q: "The height of a model's base is increased in its modelling tree. Explain why the production drawing made earlier from the model changes too.", marks: 2, model: mi(
          "Cause: the drawing is associative: its views are linked to the model file, not separate copies of it;",
          "Effect: so when the model is rebuilt with the new parametric dimension, the drawing views and dimensions update automatically, without being redrawn.",
          "Effect alone (\"the drawing updates\") earns at most one mark: an explain answer needs the cause.") },
      ],
    },
    "cad-assembly": {
      title: "Assemblies and 3D constraints",
      questions: [
        { q: "Which 3D constraint lines up the axis of a pin with the axis of a hole?", opts: ["Mate", "Centre axis", "Orientate", "Tangent"], a: 1, why: "Centre axis makes two axes collinear." },
        { q: "Two faces are placed against each other, facing in opposite directions. This is…", opts: ["mate", "align (flush)", "offset", "orientate"], a: 0, why: "Mate brings faces together face to face. Align makes them level, facing the same way." },
        { q: "How many degrees of freedom does an unconstrained component have in a 3D assembly?", opts: ["2", "3", "4", "6"], a: 3, why: "Three slides (x, y, z) and three rotations (about x, y, z)." },
        { q: "Which constraint keeps a 3 mm gap between two faces?", opts: ["Tangent", "Offset", "Centre axis", "Mate"], a: 1, why: "Offset is a mate or align with a set distance between the faces." },
        { q: "Which of these is a benefit of using stock components from a CAD library?", opts: ["They cannot be used in assemblies", "They save modelling time and are accurate to standard sizes", "They always render faster", "They make the assembly top-down"], a: 1, why: "Library parts are ready-made to the published standard, which saves time and keeps every assembly consistent." },
        { type: "open", q: "A wheel (with a central hole) must fit on an axle and sit hard against a shoulder on the axle. Describe the two 3D constraints needed.", marks: 2, model: mi(
          "Centre axis the hole in the wheel with the axle (axis of the wheel's hole to the axis of the axle);",
          "Mate the inside face of the wheel with the face of the shoulder on the axle.") },
      ],
    },
    "cad-files": {
      title: "File types and libraries",
      questions: [
        { q: "Which file format is designed to carry 2D vector geometry to a laser cutter?", opts: ["3DS", "STEP", "DXF", "IGES"], a: 2, why: "DXF (Drawing Exchange Format) carries 2D lines, arcs and circles: the usual input for cutters." },
        { q: "Why would an engineer send a STEP file instead of the native file?", opts: ["STEP files keep the full modelling tree", "STEP is a neutral format that can be opened in any CAD software", "STEP files are always smaller", "STEP files include rendered images"], a: 1, why: "STEP and IGES are neutral: any package can open them. The modelling tree is normally lost." },
        { q: "What is usually <em>lost</em> when a model is saved as STEP and opened in another package?", opts: ["The shape of the solid", "Its sizes", "The modelling tree, sketches and constraints", "Its volume"], a: 2, why: "A neutral file brings in the finished geometry, not the history used to build it, so editing is harder." },
        { q: "The 3DS format is best suited to…", opts: ["exchanging precise engineering solids", "mesh models with materials for rendering and animation", "2D floor plans", "spreadsheets of parts"], a: 1, why: "3DS stores polygon meshes, materials and textures: visualisation rather than precise engineering." },
        { type: "open", q: "Describe two functions of a CAD library in a design office.", marks: 2, model: mi(
          "Any one: provides ready-made standard/stock parts (nuts, bolts, bearings), saving the time needed to model them;",
          "Any other: parts are accurate to standard sizes; everyone uses the same parts, giving consistency; part names and numbers feed the parts list and ordering; company parts can be reused across projects.") },
      ],
    },
    "cad-render": {
      title: "Rendering and scenes",
      questions: [
        { q: "What is the difference between <em>shade</em> and <em>shadow</em>?", opts: ["There is none", "Shade is the darker side of an object facing away from the light; a shadow is cast by the object onto another surface", "Shade is cast on the floor; shadow is on the object", "Shadow only appears on metal"], a: 1, why: "Shade is on the object itself; a cast shadow falls on the surface beside or below it." },
        { q: "A rendered scene shows a bin with no shadow under it, a few millimetres above the floor. What criterion does this fail?", opts: ["Decal applied correctly", "Models sited on a surface, not floating", "Correct viewpoint", "Contrasting fonts"], a: 1, why: "Models must rest on a surface, neither floating nor interfering. The missing contact shadow gives it away." },
        { q: "A render is speckled with random dots in the soft shadows. This is…", opts: ["pixelation, caused by low resolution", "grain (noise), caused by too few render samples", "a decal", "reflection"], a: 1, why: "Grain comes from too few samples; pixelation (visible blocks) comes from too low a resolution." },
        { q: "What is a <em>decal</em>?", opts: ["A shiny material", "An image applied to the surface of a model, like a sticker", "A type of light source", "A neutral file format"], a: 1, why: "A decal maps an image (logo, label, poster) onto a face of the model." },
        { type: "open", q: "A 3D model of a ship's lantern is to be used on a poster. Describe two 3D rendering techniques that would make it look realistic.", marks: 2, model: mi(
          "Any one, described for the lantern: a light source placed above and to one side, giving highlights on the glass and brass and shade on the far side; brass and glass materials applied, so the lantern looks like real metal and glass;",
          "Any other: reflections on the polished brass and glass showing the surroundings; a cast shadow on the surface it stands on; a sited environment (e.g. a ship's deck at dusk) placing it in context.",
          "One-word answers (\"lighting\", \"materials\") earn nothing: describe the technique on the model.") },
      ],
    },
    "cad-describe": {
      title: "Describing how to model it",
      questions: [
        { q: "Which step would earn a mark in a \"describe how to model\" answer?", opts: ["Make the base", "Extrude the shape", "On the XY plane, sketch a 90 × 60 rectangle and extrude it 12", "Use CAD to model the base accurately"], a: 2, why: "It names the plane, the profile with sizes, the command and the distance. The others could not be followed." },
        { q: "In a modelling plan, which order is workable?", opts: ["Extrude, then sketch the profile", "Radial array the hole, then sketch the hole", "Shell the body, then cut the holes through its walls", "Fillet the edges, then create the solid"], a: 2, why: "Each step needs what it is built on: a profile before its feature, a solid before its edits, and shell before holes." },
        { q: "A question says: do not use radial array. Six holes are equally spaced round a full circle. What must you state instead?", opts: ["The pitch", "The angle between instances: 60°", "The number of revolutions", "The PCD only"], a: 1, why: "Without the array you position each copy, so give the angle between them: 360 ÷ 6 = 60°." },
        { type: "open", q: "A drum for the capstan is a Ø200 barrel, 300 long between the flanges, with a Ø260 × 20 flange at each end and a Ø40 hole through its axis. Describe how it could be modelled using 3D CAD.", marks: 5, model: mi(
          "On the XY plane, sketch a Ø200 circle and extrude it 300 (the barrel);",
          "On one end face, sketch a Ø260 circle concentric with the drum and extrude it 20 (outwards);",
          "Mirror the flange about a work plane at the barrel's mid-length (offset 150), or repeat on the other end face;",
          "On an end face, sketch a Ø40 circle concentric with the drum;",
          "Extrude subtract the Ø40 circle through all.",
          "Alternative: revolve the half cross-section (with all sizes) 360° about the axis, earning the equivalent marks.") },
        { type: "open", q: "Describe how a coil spring of Ø3 wire, coiled 20 from its axis to the wire's centre, with pitch 10 and overall length 80, could be modelled.", marks: 3, model: mi(
          "Sketch a Ø3 circle on a plane through the axis, its centre 20 from the axis;",
          "Use the helix command with that profile and axis;",
          "Any two of: pitch 10, 8 revolutions, overall length 80.") },
      ],
    },
  });
})();
