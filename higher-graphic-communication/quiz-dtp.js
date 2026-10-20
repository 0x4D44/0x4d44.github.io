/* Pre-flight check question bank: Design & DTP.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (a •1 •2 list), self-marked. All questions are original. */
(function () {
  const mi = (...pts) => '<ol class="step-list marks">' + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HG_QUIZ = Object.assign(window.HG_QUIZ || {}, {
    "dtp-plan": {
      title: "Planning a promotional document",
      questions: [
        { q: "What is the main difference between a thumbnail and a visual?", opts: ["A thumbnail is drawn on a computer; a visual is drawn by hand", "A thumbnail is a small, quick sketch used to explore layout ideas; a visual is a larger, developed drawing close to the final product", "A thumbnail shows only the images; a visual shows only the text", "A thumbnail is the final printed poster at a reduced size"], a: 1, why: "Thumbnails are cheap, quick and many; a visual develops the chosen idea with colours, fonts and image positions so the client can see the result." },
        { q: "A brief says the poster must appeal to 12 to 17 year olds. Which planning question does this answer?", opts: ["Purpose", "Market", "Audience", "Content"], a: 2, why: "The target audience is who must notice and read the document." },
        { q: "Which annotation would earn credit for identifying a design principle?", opts: ["\"Nice colours.\"", "\"Picture goes here.\"", "\"The large aircraft photo dominates the page, so the viewer sees at once that the poster is about flying.\"", "\"I like this one best.\""], a: 2, why: "It names a principle (dominance), says where (the aircraft photo) and gives the effect on the viewer." },
        { q: "Why is research turned into a specification before designing?", opts: ["So that the design can be checked against clear requirements", "Because the assignment forbids sketching before research", "So that no thumbnails are needed", "To make the file size smaller"], a: 0, why: "Conclusions from research become a list of what the design must achieve; every later decision can be justified against it." },
        { type: "open", q: "A designer has produced three thumbnails for a regatta programme cover. Explain two benefits of producing thumbnails before starting work in DTP software.", marks: 2, model: mi(
          "Thumbnails are quick to draw, so several different layouts can be explored in a short time, giving a better chance of finding the best idea.",
          "Changes made at thumbnail stage cost almost nothing, so the layout can be decided before time is spent producing it on the computer.",
          "Also accept: they can be annotated to record and justify design decisions; they can be shown to the client to get feedback early. One mark per cause linked to its effect.") },
      ],
    },
    "dtp-colour": {
      title: "Colour theory",
      questions: [
        { q: "Which pair are complementary colours on the artist's colour wheel?", opts: ["Red and orange", "Blue and orange", "Blue and green", "Yellow and orange"], a: 1, why: "Complementary colours sit opposite each other on the wheel: blue–orange, red–green, yellow–violet. The others are neighbours (analogous)." },
        { q: "A title is red-orange on a blue background. What effect does the colour choice have?", opts: ["The title recedes into the background", "The title appears to advance towards the viewer", "The title becomes harmonious with the background", "The title has lower contrast"], a: 1, why: "Warm colours advance and cool colours recede, so a warm title on a cool ground seems to float in front of it." },
        { q: "What is an accent colour?", opts: ["The darkest colour in a scheme", "A small amount of a contrasting colour used to draw attention to one item", "Any colour with black added", "The colour used for body text"], a: 1, why: "An accent works because it is the one item that differs; overuse destroys the effect." },
        { q: "Why is a document intended for print set up in CMYK rather than RGB?", opts: ["CMYK files are always smaller", "Printing presses print with cyan, magenta, yellow and black inks, and some RGB colours cannot be printed, so working in CMYK gives a truer preview", "RGB cannot show the colour blue", "CMYK colours look brighter on screen"], a: 1, why: "The CMYK gamut is smaller than a screen's RGB gamut; designing in CMYK avoids dull surprises when bright RGB colours are converted." },
        { q: "Adding white to a colour makes a…", opts: ["shade, with a lower value", "tint, with a higher value", "shade, with a higher value", "tint, with a lower value"], a: 1, why: "A tint is lighter (higher value); a shade, with black added, is darker (lower value)." },
        { type: "open", q: "A poster for a beach festival uses an analogous colour scheme of yellow, yellow-orange and orange, with one small blue panel giving the ticket price. Explain the use of colour in this poster.", marks: 2, model: mi(
          "The yellow, yellow-orange and orange are neighbours on the colour wheel, giving harmony, so the poster looks unified and has a warm, sunny, energetic feel that suits a beach festival.",
          "The small blue panel is the complementary accent colour against the oranges, so the ticket price stands out and is one of the first things the viewer notices.",
          "Each mark needs the feature (cause) and its effect on the viewer. \"It creates contrast\" alone is not an effect.") },
      ],
    },
    "dtp-design": {
      title: "Design elements and principles",
      questions: [
        { q: "Which of these is a design <em>element</em> rather than a design principle?", opts: ["Rhythm", "Texture", "Balance", "Dominance"], a: 1, why: "The five elements are line, shape, texture, value and mass/weight. The others are principles." },
        { q: "Captions are placed directly beneath their images so they read as pairs. Which principle is this?", opts: ["Unity/proximity", "Depth", "Rhythm", "Dominance"], a: 0, why: "Grouping related items close together is proximity, a way of creating unity." },
        { q: "A layout has one large image on the left and two small panels on the right whose visual weights even out. This is…", opts: ["symmetrical balance", "asymmetrical balance", "white space", "alignment"], a: 1, why: "Different items arranged so their weights balance is asymmetrical (informal) balance." },
        { q: "Which answer earns a mark for 'Explain how emphasis has been achieved'?", opts: ["\"It draws the viewer's attention.\"", "\"The date is yellow.\"", "\"The date is in a yellow accent panel, so it stands out and is noticed first.\"", "\"Yellow is used to create emphasis.\""], a: 2, why: "Only this one links a cause (yellow accent panel on the date) with an effect (stands out, noticed first). The others give only an effect, only a cause, or use the principle as its own effect." },
        { q: "Which describes rhythm?", opts: ["One item much larger than all others", "Items repeated at regular intervals, leading the eye through the layout", "Empty space around items", "Light text on a dark background"], a: 1, why: "Repetition with regular spacing creates rhythm. The first is dominance, the third white space, the fourth reverse text." },
        { type: "open", q: "Refer to the recruitment poster in the hotspot analyser. Explain how depth has been created.", marks: 2, model: mi(
          "The ship photo overlaps the corner of the main photo and has a drop shadow, so it appears to sit in front of the main photo, nearer to the viewer.",
          "The ship photo has a warm red-orange frame against the cool blue sky, and warm colours advance, so the inset seems to come forward from the background.",
          "Do not award a mark for an effect with no cause, or for \"it creates depth\" as an effect.") },
      ],
    },
    "dtp-layout": {
      title: "Page layout, grids and master pages",
      questions: [
        { q: "An A4 page is 210 mm wide with 15 mm margins, three columns and 5 mm gutters. How wide is each column?", opts: ["70 mm", "56.7 mm", "60 mm", "53.3 mm"], a: 1, why: "(210 − 2 × 15 − 2 × 5) ÷ 3 = 170 ÷ 3 = 56.7 mm." },
        { q: "What is the gutter?", opts: ["The space between the page edge and the content", "The space between two columns", "A line printed between columns", "The page number"], a: 1, why: "The gutter separates columns. The page-edge space is the margin; a printed line between columns is a column rule; the page number is the folio." },
        { q: "What does <em>snap</em> do?", opts: ["Prints the guides on the page", "Makes an item jump to a nearby guide or grid line when moved close to it", "Rotates an item by 90°", "Saves the document as a PDF"], a: 1, why: "Snap pulls items onto guides and grid lines, making precise alignment quick." },
        { q: "Which is a purpose of a master page in a 24-page programme?", opts: ["To hold the items repeated on every page, such as header, footer and folio, so they are consistent and set up only once", "To store the high-resolution photographs", "To check the spelling", "To add bleed to each page"], a: 0, why: "Items on the master appear on every page using it, giving consistency and saving time." },
        { q: "How many A5 sheets can be cut from one A3 sheet?", opts: ["2", "3", "4", "8"], a: 2, why: "A3 halves to two A4; each A4 halves to two A5: four in all." },
        { type: "open", q: "A magazine page uses a three-column grid. The title spans all three columns, a photograph spans the first two, and the body text is in the third column and continues across all three below the photograph. Describe how grid structure has been used.", marks: 2, model: mi(
          "The page is divided into three equal columns with gutters between them, inside the margins.",
          "Items span different numbers of columns (title three, photograph two, text one) with their edges lining up on the column edges, so the layout is consistent and aligned.",
          "Credit any specific, correct point about the columns, spans or alignment. \"It uses a grid\" alone is not enough.") },
      ],
    },
    "dtp-type": {
      title: "Typography and text",
      questions: [
        { q: "Which font family has small finishing strokes at the ends of letters?", opts: ["Sans serif", "Serif", "Script", "Monospaced only"], a: 1, why: "The small strokes are serifs; \"sans\" means without." },
        { q: "What is a folio?", opts: ["A line repeated at the top of each page", "The page number", "A short extract set in large type", "Text under an image"], a: 1, why: "A folio is a page number. The top line is a running headline; the extract is a pull quote; text under an image is a caption." },
        { q: "In a hanging indent…", opts: ["the first line is indented and the rest are not", "the first line starts at the margin and the following lines are indented", "every line is centred", "the first letter is enlarged over three lines"], a: 1, why: "The first line hangs out to the left of the rest. An indented first line is a normal indent; the enlarged letter is a drop cap." },
        { q: "What is the purpose of placeholder text (lorem ipsum)?", opts: ["To translate the copy into Latin", "To let the layout be designed and judged before the final copy is ready, showing how much space text will take", "To reduce the file size", "To make the text easier to read"], a: 1, why: "Dummy text fills the space so the layout can be built and approved early." },
        { q: "Text that will not fit in one text box is continued in a linked box on the next page. This is…", opts: ["flow text along a path", "extended text", "text wrap", "reverse text"], a: 1, why: "The overflow is carried on through linked (threaded) text boxes." },
        { q: "Which justification gives straight left and right edges, but can leave uneven gaps between words?", opts: ["Left", "Centred", "Right", "Fully justified"], a: 3, why: "Full justification stretches word spaces so both edges line up." },
        { type: "open", q: "The title of an invitation to the squadron's annual dinner uses a script font, and the details use a serif font. Explain why these fonts are suitable.", marks: 2, model: mi(
          "The script font resembles elegant handwriting, so the title feels formal and celebratory, suiting a dinner invitation.",
          "The serif font for the details is traditional and easy to read, so guests can read the time and place clearly; it also contrasts with the script so the title and details are easily told apart.",
          "Award one mark per cause (font feature) linked to an effect, in the context of the invitation.") },
      ],
    },
    "dtp-image": {
      title: "Images and effects",
      questions: [
        { q: "What does full cropping do that square cropping does not?", opts: ["Rotates the image", "Removes all of the background by cutting round the object's outline", "Makes the image larger", "Changes the image to CMYK"], a: 1, why: "Square cropping trims to a rectangle; full cropping follows the object's outline, removing the background so text can wrap round the shape." },
        { q: "A designer samples the exact blue of a client's logo and uses it for the headings. Which technique is this?", opts: ["Gradient fill", "Colour picking", "Textured fill", "Transparency"], a: 1, why: "The eyedropper (colour picker) samples a colour so it can be reused exactly, which creates unity." },
        { q: "Why might a text panel over a photograph be given transparency?", opts: ["So the photograph can still be seen through it while the text stays readable", "To make the file smaller", "To make the text into a drop cap", "To add bleed"], a: 0, why: "Partial transparency lets the image show through, keeping the panel part of the scene." },
        { q: "What is the main effect of a drop shadow?", opts: ["It makes an item look further away", "It creates depth, lifting the item off its background so it stands out", "It reduces contrast", "It aligns the item to the grid"], a: 1, why: "An offset soft shadow suggests the item is raised above the page." },
        { q: "A designer brings a CAD rendering into the DTP document. This is…", opts: ["exporting", "importing", "copy and paste only", "proofing"], a: 1, why: "Bringing an external file in is importing; saving out to another format is exporting." },
        { type: "open", q: "Describe two uses of cropping in a promotional layout.", marks: 2, model: mi(
          "Square cropping removes unwanted parts of a photo, such as a distracting background, and focuses on the important part or makes it fit the space available.",
          "Full cropping cuts round the outline of an object, removing all the background, so it can sit on the page's own background and text can wrap round its shape.",
          "Do not accept \"crop to shape\" as the term for full cropping.") },
      ],
    },
    "dtp-files": {
      title: "Raster and vector file types",
      questions: [
        { q: "Which file type is a vector format?", opts: ["jpg", "bmp", "svg", "tiff"], a: 2, why: "SVG (and DXF) are vector. JPG, BMP, TIFF and PNG are raster." },
        { q: "Why does a raster logo become jagged when enlarged a lot?", opts: ["It has a fixed number of pixels, so each pixel becomes a visible square", "Its curves are recalculated", "It changes from RGB to CMYK", "Its file is compressed with lossless compression"], a: 0, why: "Enlarging a raster magnifies its pixels (pixelation). A vector is redrawn from its curves." },
        { q: "What is the uncompressed size of a 1000 × 500 pixel image at 24 bits per pixel?", opts: ["500,000 bytes", "1,500,000 bytes", "12,000,000 bytes", "3,000,000 bytes"], a: 1, why: "1000 × 500 × 24 ÷ 8 = 1,500,000 bytes (1.5 MB)." },
        { q: "Which raster format supports a transparent background and uses lossless compression, making it suitable for a logo on a website?", opts: ["jpg", "png", "bmp", "dxf"], a: 1, why: "PNG is lossless and supports transparency. JPG is lossy with no transparency." },
        { q: "Which file type would be used to send a 2D outline drawn in CAD to a different CAD package or a laser cutter?", opts: ["dxf", "jpg", "png", "bmp"], a: 0, why: "DXF is the common exchange format for CAD drawings." },
        { type: "open", q: "A photographer saves pictures for the squadron's website as JPEG files. Explain two reasons why JPEG is suitable.", marks: 2, model: mi(
          "JPEG uses lossy compression, so the files are small and the web pages load quickly.",
          "JPEG stores millions of colours, with each pixel able to be a different colour, so it shows the subtle changes of colour in a photograph realistically.",
          "Also accept: a common format that opens on almost any device or browser without special software, so every visitor can see the pictures.") },
      ],
    },
    "dtp-print": {
      title: "Pre-press and print",
      questions: [
        { q: "What is the purpose of bleed?", opts: ["To show where to fold the sheet", "To extend colour past the trim line so that a slightly inaccurate cut leaves no white edge", "To align the four colour plates", "To check the spelling"], a: 1, why: "Trimming is never perfect; bleed (commonly 3 mm) means the cut still lands on printed colour." },
        { q: "A small circle with cross-hairs is printed outside the page on every colour plate. It is a…", opts: ["crop mark", "registration mark", "folio", "colour bar"], a: 1, why: "Registration marks let the printer check that all four colours line up." },
        { q: "What do crop marks show?", opts: ["Where the paper is to be trimmed to its finished size", "Where images have been cropped", "Where the bleed ends", "The centre of each colour plate"], a: 0, why: "Crop (trim) marks in the corners guide the guillotine." },
        { q: "Why is a proof produced before a print run?", opts: ["So errors can be found and corrected before thousands of copies are printed", "To increase the image resolution", "To add registration marks", "Because the printer cannot read PDF files"], a: 0, why: "Catching mistakes on a proof is cheap; catching them after printing wastes the whole run." },
        { q: "In four-colour printing, what happens when the plates are misregistered?", opts: ["The colours become brighter", "Coloured fringes appear along edges and images look blurred", "The paper is trimmed in the wrong place", "The document changes to RGB"], a: 1, why: "Each ink lands in a slightly different place, so edges show fringes of separate colours." },
        { type: "open", q: "A printer sends a proof of the regatta poster with crop marks, registration marks and 3 mm bleed. State the purpose of the registration marks and of the bleed.", marks: 2, model: mi(
          "Registration marks: to check that the cyan, magenta, yellow and black plates have printed exactly in line with each other.",
          "Bleed: the background colour runs past the trim line so that when the sheet is cut, a slightly inaccurate cut does not leave a white edge.") },
      ],
    },
    "dtp-promo": {
      title: "Brief to final: exam practice",
      questions: [
        { q: "A display banner will be seen from across an exhibition hall. Which choice suits it best?", opts: ["Long paragraphs of small script text", "A short, large, high-contrast title and one dominant image", "Low-contrast pastel text on a pastel background", "A pixelated low-resolution logo"], a: 1, why: "Displays are seen from a distance by moving people: one dominant message, large and high contrast." },
        { q: "Which is a 'describe' answer rather than an 'explain' answer?", opts: ["\"The title is in white reverse text, so it stands out.\"", "\"Three icons are repeated in a row at equal spacing.\"", "\"The drop shadow makes the title seem nearer to the viewer.\"", "\"The yellow panel draws the eye because it is the only warm colour.\""], a: 1, why: "It states a feature and where it is. The others link a cause to an effect, which is explaining." },
        { q: "Which step comes immediately before printing the full run?", opts: ["Thumbnails", "Research", "Checking and correcting a proof", "Writing the brief"], a: 2, why: "The proof is the last check: brief → research → thumbnails → visual → layout → proof → correct → print." },
        { q: "The logo is to be printed on a 3 m banner. Which file type should be supplied?", opts: ["A 64 px png", "A low-quality jpg", "A vector file such as svg", "A bmp screenshot"], a: 2, why: "A vector logo scales to any size without pixelation." },
        { type: "open", q: "Refer to the Blockhaven server poster. Explain how emphasis has been achieved on the server address.", marks: 2, model: mi(
          "The address is white reverse text in a bright magenta panel against the dark navy background, so it contrasts strongly and stands out.",
          "A magenta rule separates the address from the icons above, isolating it so the viewer sees it as a separate, important piece of information.",
          "One mark per cause linked to an effect. Do not accept \"it creates emphasis\" as an effect.") },
        { type: "open", q: "State one purpose of a drop cap and one purpose of guides.", marks: 2, model: mi(
          "Drop cap: draws the reader's eye to the start of the body text, showing where to begin reading.",
          "Guides: help the designer align text boxes and images precisely and consistently.") },
      ],
    },
  });
})();
