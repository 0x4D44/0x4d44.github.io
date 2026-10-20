/* Pre-flight check question bank: Forms & pictorials.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML), self-marked. */
(function () {
  const mi = (...pts) => "<ol class=\"step-list marks\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HG_QUIZ = Object.assign(window.HG_QUIZ || {}, {
    "forms-shapes": {
      title: "Geometric forms and partial cuts",
      questions: [
        { q: "A cone is cut by a plane parallel to its base. What is the solid that remains below the cut called?", opts: ["A truncated cylinder", "A frustum", "A pyramid", "A prism"], a: 1, why: "A cone or pyramid cut parallel to its base leaves a frustum: the base, a smaller parallel top and sloping sides." },
        { q: "What shape is the cut face when a cylinder is cut at an angle across its axis (not through either end)?", opts: ["A circle", "A rectangle", "An ellipse", "A parabola"], a: 2, why: "Only a cut at 90° to the axis gives a circle. Tilt the plane and the section stretches into an ellipse; a cut along the axis gives a rectangle." },
        { q: "A component's plan is a square with both diagonals drawn, and its elevation is a triangle. What form is it?", opts: ["Cone", "Square prism", "Square pyramid", "Triangular prism"], a: 2, why: "The diagonals in plan are the four sloping edges running up to the apex, seen from above." },
        { q: "Which form gives a circular cut face for every possible plane cut?", opts: ["Cylinder", "Cone", "Sphere", "Hexagonal prism"], a: 2, why: "Every point of a sphere's surface is the same distance from its centre, so any plane slices it in a circle." },
        { type: "open", marks: 3, q: "A ship's gun barrel is made from simple geometric forms. Name three forms that could make it up, saying which part each forms.", model: mi("A sphere: the knob (cascabel) at the rear.", "A frustum of a cone: the tapering barrel (chase).", "A cylinder: the breech, a band, the trunnions or the bore (removed). One mark for each correctly named form linked to a part.") },
      ],
    },
    "forms-true": {
      title: "True lengths, true shapes and auxiliary views",
      questions: [
        { q: "When does an orthographic view show a surface at its true shape?", opts: ["When the surface is parallel to the plane of that view", "When the surface is at 90° to the plane of that view", "When the surface is at 45° to the view", "Always, in the elevation"], a: 0, why: "Parallel: true shape. At 90°: seen as an edge (a line). Anything in between: foreshortened." },
        { q: "A face is inclined to the plan but at 90° to the elevation. In which direction should the auxiliary view be projected to show its true shape?", opts: ["Vertically up from the plan", "At 90° to the edge view of the face in the elevation", "At 45° to the elevation", "Horizontally from the end elevation"], a: 1, why: "In the elevation the face is seen as an edge. Projecting at 90° to that edge looks straight at the face." },
        { q: "A square pyramid has a 60 mm square base and is 80 mm high. Roughly how long is each sloping corner edge, true length?", opts: ["80 mm", "85 mm", "90.6 mm", "100 mm"], a: 2, why: "It rises 80 mm while running half the diagonal (42.4 mm) across in plan: √(80² + 42.4²) ≈ 90.6 mm. 85 mm is the slant height of the faces (√(80² + 30²)), a different line." },
        { type: "open", marks: 4, q: "Describe how to construct the true shape of the inclined cut on a hexagonal prism, given its plan and elevation.", model: mi("Number the corners in the plan and find the same points on the cut line in the elevation.", "Project lines from each point at 90° to the cut line.", "Draw a datum (centre line) parallel to the cut line.", "Transfer each width from the plan, measured from its centre line, along the projectors; join the points (and hatch the cut surface).") },
      ],
    },
    "forms-tangency": {
      title: "Tangency",
      questions: [
        { q: "An arc of radius R must touch the outside of a circle of radius r (an external blend). How far is the arc's centre from the circle's centre?", opts: ["R", "R + r", "R − r", "R × r"], a: 1, why: "External: the arcs sit side by side, so their centres are the sum of the radii apart." },
        { q: "An arc of radius R wraps round and touches a smaller circle of radius r from the inside (an internal blend). How far apart are the centres?", opts: ["R + r", "R − r", "r − R", "2R"], a: 1, why: "Internal: the small circle sits inside the big one, so the centres are the difference of the radii apart." },
        { q: "Where is the point of tangency between two arcs that touch?", opts: ["Midway between the centres", "On the line joining the two centres (extended if necessary)", "Directly above the larger centre", "Where a 45° line from either centre meets the arc"], a: 1, why: "At the touching point both arcs share a tangent, so both radii are at 90° to it: they lie along one line, the line of centres." },
        { q: "To blend an arc of radius R into a straight line, where must the arc's centre lie?", opts: ["On the line itself", "On a line parallel to it, R away", "On a line at 45° to it", "On a circle of radius R about the line's end"], a: 1, why: "Every point R from a straight line lies on a parallel line R away. That is the locus for the centre." },
        { type: "open", marks: 3, q: "Explain why a draughtsman must find the tangent points before lining in a blend radius.", model: mi("The tangent points are where the arc meets the line or circle exactly (cause)…", "…so the arc and lines can be started and stopped there, giving a smooth join with no overlap, gap or kink (effect).", "They are found by drawing a perpendicular from the centre to a line, or by joining the centres.") },
      ],
    },
    "forms-ellipse": {
      title: "Ellipses",
      questions: [
        { q: "What are the longest and shortest diameters of an ellipse called?", opts: ["Radius and diameter", "Major axis and minor axis", "Foci and centre", "Primary and secondary axes"], a: 1, why: "The major axis is the longest diameter, the minor axis the shortest. They bisect each other at 90° at the centre." },
        { q: "In the trammel method, which distances are marked on the strip from the pen point P?", opts: ["The full major and minor axes", "Half the major axis and half the minor axis", "The distances to the two foci", "The radius of each concentric circle doubled"], a: 1, why: "PA = half the minor axis (A slides on the major axis) and PB = half the major axis (B slides on the minor axis)." },
        { q: "In an isometric drawing, which way does the major axis of an ellipse on the TOP face run?", opts: ["Vertical", "Horizontal", "At 30° to the horizontal", "At 60° to the horizontal"], a: 1, why: "The major axis is at 90° to the axis perpendicular to the face. For the top face that axis is vertical, so the major axis is horizontal." },
        { q: "In the concentric-circle method, a radial line cuts the large circle at L and the small circle at S. How is a point on the ellipse found?", opts: ["Draw a line from L parallel to the minor axis and from S parallel to the major axis; they meet on the ellipse", "Take the midpoint of LS", "Join L to the nearer focus", "Draw arcs from L and S of radius equal to the minor axis"], a: 0, why: "This gives the point (a cos t, b sin t): the big circle supplies the across position, the small one the up position." },
        { type: "open", marks: 2, q: "Explain why circles on the faces of an isometric drawing are drawn as ellipses.", model: mi("Each face of an isometric drawing is tilted away from the viewer / not parallel to the picture plane (cause)…", "…so a circle on it is seen at an angle and its diameter across the tilt appears shortened, making an ellipse (effect).") },
      ],
    },
    "forms-interpen": {
      title: "Interpenetration",
      questions: [
        { q: "Two square prisms intersect at right angles. What does their line of intersection consist of?", opts: ["Smooth curves", "Straight lines", "A circle", "An ellipse in every view"], a: 1, why: "Flat faces meet flat faces along straight lines." },
        { q: "A horizontal cylinder joins a vertical cylinder of the SAME diameter, with axes that meet. How does the line of intersection look in the elevation?", opts: ["A semicircle", "A wavy curve", "Straight lines", "It cannot be seen"], a: 2, why: "That special case gives intersections that lie in flat planes, seen edge-on as straight lines." },
        { q: "When plotting the intersection of a horizontal barrel through a vertical mast, in which view are the barrel's generators first divided and numbered?", opts: ["The view where the barrel is seen end-on as a circle", "The elevation", "Any pictorial view", "The view where the mast is seen as a rectangle"], a: 0, why: "End-on, the barrel's surface lines appear as points round a circle, so they can be spaced equally and numbered." },
        { q: "What is the 45° mitre line used for in this construction?", opts: ["To find the true length of the barrel", "To transfer distances between the plan and the end elevation", "To draw the hidden detail", "To mark the centre of the mast"], a: 1, why: "A line at 45° turns a horizontal projector into a vertical one at the same distance, carrying depths between plan and end elevation." },
        { type: "open", marks: 3, q: "Describe how points on the curve of intersection between a horizontal cylinder and a vertical cylinder are found.", model: mi("Divide the horizontal cylinder's circle (end view) into equal parts, e.g. 12, and number the generators.", "Find where each generator meets the vertical cylinder in the plan (transferred via a mitre line or dividers).", "Project those points into the elevation to meet the same generators projected across from the end view; join with a smooth curve, showing hidden parts dashed.") },
      ],
    },
    "forms-develop": {
      title: "Surface developments",
      questions: [
        { q: "Which development method is used for a cone?", opts: ["Parallel-line", "Radial-line", "Triangulation of prisms", "Oblique projection"], a: 1, why: "A cone's generators all radiate from the apex, so the development is swung with compasses from the apex: radial-line." },
        { q: "What line type does Appendix 2 give for a fold line on a development?", opts: ["Continuous thick", "Thin dashed", "Thin long dash, double dot chain", "Thick chain, thin at the ends"], a: 2, why: "Fold line: thin long dash double dot chain. Dashed is hidden detail; thick at the ends is a cutting plane." },
        { q: "A cylinder has a diameter of 50 mm. What is the length of its development (to 1 decimal place)?", opts: ["100.0 mm", "157.1 mm", "78.5 mm", "314.2 mm"], a: 1, why: "The curved surface unrolls to the circumference: π × D = π × 50 ≈ 157.1 mm. 78.5 mm would be πr; 314.2 mm is 2πD." },
        { q: "Why must the sloping edge of a pyramid be found at its true length before drawing its development?", opts: ["Because it is foreshortened in the elevation, so the net would not close", "Because developments are always drawn at double size", "Because the edge is hidden in the plan", "Because fold lines must be longer than outlines"], a: 0, why: "The corner edges lean towards or away from you in the elevation, so they look shorter than they are. A net built from them would be too small to fold up." },
        { type: "open", marks: 2, q: "A cone has base radius 30 mm and slant height 75 mm. Calculate the angle of the sector in its development.", model: mi("Sector angle = 360° × r ÷ L (or arc = circumference).", "= 360 × 30 ÷ 75 = 144°.") },
      ],
    },
    "forms-pict": {
      title: "Isometric, oblique and planometric",
      questions: [
        { q: "In an isometric drawing, at what angle to the horizontal are the two receding axes drawn?", opts: ["45°", "30°", "60°", "15°"], a: 1, why: "Isometric axes are 120° apart: vertical, and 30° to the horizontal either side." },
        { q: "In cabinet oblique, how are the receding lines drawn?", opts: ["At 45°, full length", "At 45°, half length", "At 30°, full length", "Vertically, half length"], a: 1, why: "Cabinet: half length (usually at 45°), which looks natural. Cavalier uses full length, which looks too deep." },
        { q: "Which pictorial method shows the PLAN at true shape?", opts: ["Isometric", "Cavalier oblique", "Planometric", "Two-point perspective"], a: 2, why: "Planometric draws the plan true shape, turned 45°/45° or 30°/60°, with heights drawn vertically." },
        { q: "Compared with an isometric drawing, a true isometric projection is…", opts: ["the same size", "about 82% of the size (axes scaled by 0.816)", "twice the size", "a different shape"], a: 1, why: "Each axis is foreshortened to about 0.816 in a true projection. Drawings use full size for convenience; the shape is identical." },
        { type: "open", marks: 2, q: "A designer is drawing a circular ship's clock in a pictorial view. Explain why oblique might be chosen rather than isometric.", model: mi("In oblique the front face is drawn true shape, so the circular face can be drawn as a true circle (cause)…", "…which is quicker and more accurate to draw (with compasses or a circle template) than the ellipse that isometric would need (effect).") },
      ],
    },
    "forms-sketch": {
      title: "Perspective and sketching",
      questions: [
        { q: "Where do the vanishing points for horizontal lines lie in perspective?", opts: ["On the ground line", "On the horizon line, at eye level", "At the top of the leading edge", "Anywhere on the page"], a: 1, why: "Every set of horizontal parallel lines vanishes to a point on the horizon, which is at the viewer's eye level." },
        { q: "In a two-point perspective, the horizon line is drawn above the object. What will you see?", opts: ["The underside of the object", "The top of the object", "Neither top nor bottom", "Only the front face"], a: 1, why: "Eye level above the object means you look down on it: a bird's-eye view, showing its top." },
        { q: "What happens if the two vanishing points are placed very close together?", opts: ["The object looks more realistic", "The object looks distorted", "The object becomes one-point perspective", "Vertical lines start to converge"], a: 1, why: "Close VPs imply a viewer standing very close, which exaggerates the convergence. Spread them out, even off the page." },
        { q: "If digital sketching is used for preliminary graphics, which tool does the 2025 course report say candidates may use?", opts: ["Any tool, including circle and ellipse tools", "Only a straight edge tool", "Only 3D CAD software", "Only a tracing layer"], a: 1, why: "Using circle tools \"is like using a set of compasses for manual sketching\", so only a straight edge is allowed." },
        { type: "open", marks: 4, q: "State the four things a marker looked for in the 2025 Task 3 orthographic sketch.", model: mi("An elevation sketched in fair proportion.", "A plan sketched in fair proportion.", "Views in third angle, projected and aligned.", "Accurate hidden detail.") },
      ],
    },
    "forms-illus": {
      title: "Illustration techniques",
      questions: [
        { q: "On a lit block drawn in three tones, which face is usually the lightest?", opts: ["The face turned away from the light", "The face turned most directly towards the light", "The face nearest the viewer", "The bottom face"], a: 1, why: "Tone depends on how directly a face is turned to the light source: most directly lit = lightest." },
        { q: "What is the lighter area along the lower edge of a ball's shadow side called?", opts: ["Highlight", "Cast shadow", "Reflected light", "Core shadow"], a: 2, why: "Light bounces up off the surface the ball stands on and lightens its underside: reflected light." },
        { q: "Which feature best shows that an object is made of polished metal?", opts: ["Soft, even tone with no highlights", "Hard-edged bands of light and dark and sharp highlights", "A wood-grain pattern", "Stippled dots"], a: 1, why: "Polished metal mirrors its surroundings, so it shows strong contrast with hard edges and sharp highlights." },
        { q: "Which is an advantage of computer-aided illustration over manual media?", opts: ["It needs no equipment", "The illustration can be edited and resized easily", "It is always quicker for a first idea", "It needs no skill"], a: 1, why: "Digital work can be changed, repeated and resized without starting again. Manual media win on speed to start and cost." },
        { type: "open", marks: 2, q: "Explain how a cast shadow helps an illustration of a cannon on a deck.", model: mi("A cast shadow shows the object resting on the surface and where the light comes from (cause)…", "…so the cannon looks solid and grounded rather than floating, making the illustration more realistic (effect).") },
      ],
    },
  });
})();
