/* Pre-flight check question bank: the assignment deck.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML), self-marked.
   All questions are original; facts follow the course specification, the 2025 assignment
   task and marking instructions, and the 2025 course report. */
(function () {
  const mi = (...pts) => "<ol class=\"step-list marks\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  const BANK = {
    "asg-rules": {
      title: "The rules of the assignment",
      questions: [
        { q: "What share of the 140 course marks does the assignment carry?", opts: ["50 marks, 36%", "50 marks, 31%", "90 marks, 64%", "40 marks, 29%"], a: 0, why: "The assignment is 50 marks and the question paper 90: 50 ÷ 140 is about 36%." },
        { q: "During the 8 hours, which of these may your teacher do?", opts: ["Help you print, collate, staple and label your evidence", "Tell you whether your poster is good enough", "Return your finished assignment so you can improve it", "Show you an exemplar render from a previous year"], a: 0, why: "Reasonable assistance covers printing, collating, labelling, materials and understanding the instructions. No feedback, no returning work, and it is closed-book, so no exemplars." },
        { q: "The guide is a maximum of 10 single-sided A3 pages. What happens if you hand in 12?", opts: ["Nothing: no penalty is applied for exceeding it", "The last two pages are not marked", "Two marks are deducted", "The assignment is returned for you to cut it down"], a: 0, why: "The page figure indicates the expected volume; the specification says there is no penalty for exceeding it. It is still a useful time budget." },
        { q: "Which range of marks does the course specification give for production graphics?", opts: ["10–25", "5–15", "20–30", "12–30"], a: 0, why: "Preliminary 5–15, production 10–25, promotional 10–25. The 20–30 and 12–30 ranges belong to question-paper areas." },
        { type: "open", marks: 2, q: "In a year when Task 2 carries 26 of the 50 marks, a candidate plans to spend 2 hours of the 8 on it. Using the marks, explain why this plan is risky.", model: mi("Task 2's mark share is 26/50 = 52%, which would be about 4.2 hours of the 8 (the brief suggested 4).", "Spending only 2 hours leaves it about half the time its marks deserve, so time goes to tasks that earn fewer marks per hour and Task 2 marks are likely to be lost (cause and effect).") },
      ],
    },
    "asg-production": {
      title: "Production graphics",
      questions: [
        { q: "In third-angle projection, where is the plan placed?", opts: ["Above the elevation", "Below the elevation", "To the right of the elevation", "Anywhere, as long as it is labelled"], a: 0, why: "In third angle each view goes on the side it is seen from, so the view from above sits above the elevation." },
        { q: "In a stepped section, what is drawn in the section view where the cutting plane changes direction?", opts: ["Nothing: the section is drawn as if cut on one plane", "A thick line", "A thin chain line", "A row of short dashes"], a: 0, why: "The steps are shown on the cutting-plane line (thickened at each change of direction), but not in the section view itself." },
        { q: "The 2025 dimensioning mark in 1(d) needed evidence of which set?", opts: ["Linear (chain and parallel), radial, diameter and angular", "Linear (chain only), radial and diameter", "Any three of linear, radial, diameter, angular and tolerance", "Diameter and angular only"], a: 0, why: "Every type had to appear at least once; missing any one type lost that mark." },
        { q: "In a sectional assembly, which part should not be hatched when the cutting plane runs along it?", opts: ["A bolt", "The base casting", "A cast bracket", "A machined block"], a: 0, why: "By convention, shafts, bolts, nuts, washers, screws, webs and ribs are not hatched when cut along their length." },
        { type: "open", marks: 3, q: "State three items you would build into your A3 CAD template before the assignment starts, and explain why preparing it in advance is worthwhile.", model: mi("Any two items from: third-angle projection symbol, candidate name, drawing title, project title, scale, date, ALL SIZES IN mm, tolerances (1 mark for two).", "A third valid item (1).", "A pre-made template is allowed, so preparing it takes no time from the 8 hours, and it guarantees the template marks on every sheet (1).") },
      ],
    },
    "asg-promo": {
      title: "Promotional graphics",
      questions: [
        { q: "In the 2025 task, what did 'identify' two design elements or principles in 2(b) require?", opts: ["Label where each is used on the thumbnails", "Write an essay on design theory", "List every element in the specification", "Use them only in the final poster"], a: 0, why: "Identifying means pointing at where you used it, with a label (ideally with a short reason). The same choices are then marked in 2(c)." },
        { q: "A candidate names 'drop caps' and 'transparency' in 2(b) but uses only transparency in 2(c). What is the likely effect?", opts: ["Fewer of the 2(c) DTP marks, because only one chosen technique is used", "No effect: 2(c) is marked separately from 2(b)", "The 2(b) marks are taken away", "The whole poster scores zero"], a: 0, why: "The 2(c) marks were for effective use of the two techniques chosen in 2(b). Marking is positive, so nothing is deducted from 2(b)." },
        { q: "According to the 2025 course report, what did most candidates fail to show in task 2(c)?", opts: ["A higher level of skill and visual impact", "The copy text", "The company logo", "A divide between sections"], a: 0, why: "The report says 2(c) improved in skill and visual impact, \"but most candidates were unable to demonstrate a higher level\"." },
        { q: "Why does a brief give its colours as CMYK values?", opts: ["Printed work uses cyan, magenta, yellow and key inks, so CMYK describes the colours as printed", "CMYK colours look brighter on screen", "CMYK files are smaller than RGB files", "It is the only colour model DTP software supports"], a: 0, why: "CMYK is the process-printing model. Enter the values given, rather than choosing by eye on screen." },
        { type: "open", marks: 2, q: "Explain how using emphasis on a recruitment poster helps it communicate.", model: mi("Emphasis makes one item, such as the headline or a large red flag, stand out through size, colour or contrast (cause)…", "…so the reader's eye goes to it first and gets the key message immediately (effect). Cause and effect are both needed for 'explain'.") },
      ],
    },
    "asg-render": {
      title: "Rendered scenes",
      questions: [
        { q: "A rendered model has a thin gap of light under it and a shadow that starts away from its base. Which 2025 mark is at risk?", opts: ["The siting mark: models must rest on a surface, not float", "The decal mark", "The viewpoint mark", "The materials mark"], a: 0, why: "All models had to be sited on a surface, not floating or interfering. A detached shadow is the giveaway." },
        { q: "What usually causes grain (speckled noise) in a ray-traced render?", opts: ["Too few samples or passes", "Output resolution too high", "Too many light sources", "Using a decal"], a: 0, why: "Grain is left when the renderer stops before enough samples have been calculated; render longer or raise the quality." },
        { q: "Why is a 1920 × 1080 image printed across an A3 sheet likely to look pixelated?", opts: ["A3 at 300 ppi needs about 4961 × 3508 pixels, so each pixel is enlarged", "A3 paper absorbs ink", "Printers cannot print renders", "1920 × 1080 is a vector format"], a: 0, why: "420 mm ≈ 16.5 inches; at 300 ppi that is about 4961 pixels. Stretching a smaller image enlarges each pixel until it shows." },
        { q: "Which light set-up is most likely to make a box look flat?", opts: ["A strong light directly behind the camera with a high fill light", "A light above and to one side with some fill", "A light from the side with shadows on", "A key light plus a dimmer second light"], a: 0, why: "If every visible face receives the same light, they render in the same tone and the form disappears." },
        { type: "open", marks: 2, q: "Describe two ways to make a rendered scene look as though its models really rest on the floor.", model: mi("Constrain (mate) the base of each model to the floor surface so there is no gap or overlap (1).", "Turn shadows on with a light that casts a shadow touching the base of each model (1). Accept: check from a low viewpoint before rendering; avoid interference between models.") },
      ],
    },
    "asg-sketch": {
      title: "Preliminary graphics and sketching",
      questions: [
        { q: "In the 2025 sketching task, which tool was allowed?", opts: ["A straight edge", "A circle template", "A ruler for measuring the data sheet", "Compasses for the holes"], a: 0, why: "No measuring, tracing or instruments other than a straight edge; digital sketching likewise only with a straight-edge tool." },
        { q: "What gives a sketched plan the correct width without measuring?", opts: ["Projecting light lines up from the elevation's edges", "Tracing the data sheet", "Using the CAD drawing as a guide", "Guessing and then rubbing out"], a: 0, why: "Projection makes the views agree: the plan's width is set by the projectors from the elevation." },
        { q: "Which describes good line quality in a sketch?", opts: ["Faint construction lines, firm continuous outlines, evenly dashed hidden detail", "Every line the same dark weight", "Many short feathery strokes for each edge", "Outlines in colour, construction lines in black"], a: 0, why: "Contrast between light construction and bold outline makes the sketch read clearly." },
        { q: "The 2025 brief told candidates not to include which of these in the sketch?", opts: ["Centre lines, colour, highlights and shadows", "Hidden detail", "The plan", "Third-angle projection"], a: 0, why: "Hidden detail, the plan and third angle were all required. Centre lines, colour, highlights and shadows were excluded." },
        { type: "open", marks: 3, q: "Describe how to produce a freehand third-angle elevation and plan of a simple object to fair proportions.", model: mi("Compare overall width, depth and height by eye and box in the elevation with light construction lines (1).", "Project light vertical lines up from the elevation and box in the plan above it, at the right depth (1).", "Add features lightly, check they line up, then line in outlines firmly and add hidden detail as short dashes (1).") },
      ],
    },
    "asg-pages": {
      title: "Presenting and reviewing",
      questions: [
        { q: "What must be written on the back of every page you hand in?", opts: ["Name, date of birth, Scottish Candidate Number, centre name and centre number", "Your name only", "The task number only", "Your teacher's name and the date"], a: 0, why: "Each piece is labelled on the front with its task number, and the back of each page carries the candidate details." },
        { q: "The 2025 marking had no separate evaluation mark. Where did justifying your decisions still earn marks?", opts: ["Identifying elements, principles and DTP techniques in 2(b), and the planning link in 2(c)", "Only in the rendered scene", "In a written evaluation at the end", "Nowhere"], a: 0, why: "The specification asks you to review, evaluate and justify; in 2025 this showed in labelled thumbnails and the link from planning to final layout." },
        { q: "Which mistake would cost marks in every task where it happened?", opts: ["Tracing a drawing", "Leaving construction lines visible in a sketch", "Using two A3 pages for Task 3", "Printing the render landscape"], a: 0, why: "Traced drawings gain no marks in any part of the assignment. The others are allowed." },
        { q: "In the 2025 task, how many A3 pages did the brief suggest for Task 1?", opts: ["Four or five", "One", "Three", "Ten"], a: 0, why: "Task 1 four or five, Task 2 three, Task 3 one: eight or nine of the ten-page guide." },
        { type: "open", marks: 2, q: "Write a justification for using reverse text in a poster's headline band.", model: mi("Names the technique and where it is used: white (light) text on a dark colour band (1).", "Gives the effect caused: the headline contrasts strongly with the band and stands out from a busy image, so it is read first (1).") },
      ],
    },
    "asg-links": {
      title: "Assignment and exam links",
      questions: [
        { q: "Which question-paper area did the 2025 report describe as one candidates 'continue to find challenging'?", opts: ["Desktop publishing features, design elements and principles", "Computer-aided design techniques", "Assembly constraints", "Production drawings"], a: 0, why: "CAD performed very well, with assembly constraints most improved; DTP, elements and principles remained challenging." },
        { q: "What did the report say most candidates do wrong with 'explain' questions?", opts: ["Give the effect without the cause", "Write too much", "Use diagrams instead of words", "Use the wrong colour of ink"], a: 0, why: "\"Most candidates continue to struggle with this command word and only give the effect, without the cause.\"" },
        { q: "Which part of the assignment most directly practises the drawing standards area of the question paper (7–14 marks)?", opts: ["Applying dimensions, line types, sections and the third-angle symbol in Task 1", "Choosing CMYK colours for the poster", "Rendering the scene", "Labelling the back of each page"], a: 0, why: "Task 1's standards and conventions are the same conventions the paper asks you to identify and apply." },
        { q: "What can you NOT do to prepare in the last week?", opts: ["Look at this year's task", "Prepare an A3 CAD template", "Practise rendering at print resolution", "Learn the specification's design vocabulary"], a: 0, why: "The task is kept secure until the assignment starts. Everything else is good preparation." },
        { type: "open", marks: 2, q: "Explain one way that doing task 2(b) well can help you in the question paper.", model: mi("Labelling design elements, principles and DTP techniques on thumbnails practises using the specification's terminology (cause)…", "…which the paper's DTP questions (20–30 marks) need, an area the 2025 report calls challenging, so you are more likely to name and explain them correctly (effect).") },
      ],
    },
  };
  /* the right option is written first in the source for easy checking; rotate each set
     by a fixed, varied amount so the answer is not always A */
  Object.values(BANK).forEach((set, si) => set.questions.forEach((q, qi) => {
    if (q.type === "open") return;
    const n = q.opts.length, k = (qi * 3 + si * 2 + 1) % n;
    q.opts = q.opts.slice(n - k).concat(q.opts.slice(0, n - k));
    q.a = (q.a + k) % n;
  }));
  window.HG_QUIZ = Object.assign(window.HG_QUIZ || {}, BANK);
})();
