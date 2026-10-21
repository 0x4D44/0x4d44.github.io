/* Pre-flight check question bank: Technology & society deck.
   type "mcq" (default): opts[], a = index of the right option, why = explanation.
   type "open": marks, model = marking guidance (HTML), self-marked. */
(function () {
  const mi = (...pts) => "<ol class=\"step-list marks\">" + pts.map((p) => `<li>${p}</li>`).join("") + "</ol>";
  window.HG_QUIZ = Object.assign(window.HG_QUIZ || {}, {
    "tech-devices": {
      title: "Input, output and resolution",
      questions: [
        { q: "A designer must capture the shape of an existing carved handle so it can be modelled and reproduced. Which input device suits this best?", opts: ["3D scanner", "Flatbed scanner", "Graphics tablet", "Digital camera"], a: 0, why: "A 3D scanner measures points over the curved surface (a point cloud) that becomes a mesh for CAD. A flatbed scanner and a camera capture 2D images." },
        { q: "A photograph is 2400 pixels wide and is printed 8 inches wide. What is its effective resolution?", opts: ["150 ppi", "19 200 ppi", "300 ppi", "2400 ppi"], a: 2, why: "ppi = pixels ÷ inches = 2400 ÷ 8 = 300 ppi, the common target for close viewing." },
        { q: "Why is a laser printer usually preferred to an inkjet for 500 copies of a text leaflet?", opts: ["It prints richer photographs", "It needs no electricity", "It prints on A0 sheets", "It is faster and has a lower cost per page for large runs"], a: 3, why: "Toner is cheap per page and laser printers are fast. Inkjets excel at single photo-quality prints." },
        { q: "Which output device would cut self-adhesive lettering for a van?", opts: ["Plotter", "Vinyl cutter", "Laser printer", "3D printer"], a: 1, why: "A vinyl cutter follows vector paths with a small blade to cut lettering from self-adhesive vinyl." },
        { q: "Doubling both the width and the height in pixels of an uncompressed image makes the file…", opts: ["four times as big", "twice as big", "the same size", "half the size"], a: 0, why: "Pixels = width × height, so 2 × 2 = 4 times as many pixels, and four times the data." },
        { type: "open", q: "A company photographs its products for a website and printed catalogue. Describe two benefits of using digital photography.", marks: 2, model: mi(
          "Any two different, described points, e.g. the photographer can review the image immediately and re-shoot, so a poor shot is not wasted",
          "images can be shared instantly by email or cloud, can be stored in large numbers on one device, can be enlarged on screen to check detail, or can be edited and placed straight into the catalogue layout or website. (A bare list such as 'quick, cheap' does not describe.)") },
      ],
    },
    "tech-files": {
      title: "File management",
      questions: [
        { q: "Which file name follows a good naming convention?", opts: ["poster final FINAL (2).indd", "new poster.indd", "VEL_lantern_poster_v05.indd", "poster 14/3/26.indd"], a: 2, why: "Project, item and a padded version number, with no spaces or illegal characters. 'Final' always multiplies, and slashes are not allowed in many file systems." },
        { q: "Which back-up plan meets the 3-2-1 rule?", opts: ["Laptop + USB stick in the laptop bag", "Laptop + two folders on the same laptop + a USB stick", "Three copies on one external drive", "Laptop + external drive in the studio + cloud storage"], a: 3, why: "Three copies, on two kinds of storage (local disks and the cloud), with one off site (the cloud)." },
        { q: "Which statement about JPEG is correct?", opts: ["It is lossless, so it suits logos being edited", "Its lossy compression gives small files but can create artefacts, and re-saving loses more detail", "It is a vector format", "It cannot store photographs"], a: 1, why: "JPEG throws away detail to save space. Use PNG or TIFF (lossless) for files still being edited." },
        { q: "A manufacturer uses a different CAD package from the designer. Which format should the 3D model be sent in?", opts: ["STEP", "DXF", "JPEG", "the native part file only"], a: 0, why: "STEP (or IGES) is a neutral 3D format that almost any CAD package can open. DXF is for 2D drawings." },
        { type: "open", q: "A design team keeps all its files in one folder called 'Work' with names such as 'drawing1' and 'new drawing'. Explain two benefits of introducing a folder structure and naming convention.", marks: 2, model: mi(
          "Files grouped by project and stage in a consistent folder structure, so any team member can find the file they need quickly without opening several to check",
          "Descriptive names with version numbers, so the latest version is obvious and the wrong (older) drawing is not sent to the client or manufacturer. (Each mark needs the feature and its result.)") },
      ],
    },
    "tech-cloud": {
      title: "Cloud computing and storage",
      questions: [
        { q: "Which is an example of cloud computing rather than cloud storage?", opts: ["Saving a PDF to an online folder", "Keeping a back-up on an external drive", "Rendering a CAD scene on a provider's remote servers", "Emailing a JPEG"], a: 2, why: "Cloud computing uses remote servers to run software or processing; cloud storage just keeps files remotely." },
        { q: "Alba deletes a synced file by mistake. What happens to Euan's synced copy?", opts: ["Nothing: sync only copies new files", "It is converted to PDF", "It is moved to his desktop", "It is deleted too, but the file can be restored from the bin or version history"], a: 3, why: "Sync spreads deletions. Version history and the deleted-files bin are what rescue you, for a limited time." },
        { q: "Which is a limitation of cloud storage?", opts: ["Files can be reached from anywhere", "No access to files without an internet connection", "Earlier versions can be restored", "No physical storage space is needed"], a: 1, why: "The others are benefits. Internet dependence is the classic limitation." },
        { q: "Who is responsible for protecting a cloud account's password?", opts: ["The user: security is a shared responsibility", "Only the provider", "Only the government", "Nobody: cloud accounts cannot be hacked"], a: 0, why: "The provider secures its servers; the user secures the account (strong password, two-step sign-in, care with share links)." },
        { type: "open", q: "A design studio stores all its client files in cloud storage. Explain two limitations of this.", marks: 2, model: mi(
          "Files are only reachable through the internet, so if the connection fails or is slow, designers cannot open or upload large files and work stops",
          "Any second, different limitation with its effect: e.g. if an account password is stolen, an intruder can copy or delete confidential client designs; a subscription has to be paid every month; confidential files sit on another company's servers, possibly abroad, which a client may not accept") },
      ],
    },
    "tech-drm": {
      title: "Digital rights and intellectual property",
      questions: [
        { q: "In the UK, how does a photographer get copyright in an original photograph?", opts: ["By registering it with the government", "By adding the © symbol", "Automatically, as soon as the photograph is taken", "By paying a licence fee"], a: 2, why: "Copyright arises automatically. The © notice is useful as a warning, but is not required." },
        { q: "What does buying a stock image normally give you?", opts: ["Ownership of the copyright", "The right to resell it as your own", "A patent", "A licence to use it under stated conditions"], a: 3, why: "You buy permission to use the image in certain ways, not the image's copyright." },
        { q: "Which watermark placement is hardest for a thief to remove by cropping?", opts: ["A small mark in one corner", "A mark tiled across the whole image", "A mark in the file name", "No watermark, but a high-resolution file"], a: 1, why: "Tiling repeats the mark everywhere, so no crop of the useful picture escapes it." },
        { q: "What is digital rights management?", opts: ["Technology that controls how digital content can be copied, printed, edited or opened", "A list of a company's staff", "A type of raster file", "A CAD assembly constraint"], a: 0, why: "DRM covers watermarks, encryption, password permissions, licence keys and similar technical controls." },
        { type: "open", q: "A photographer sells prints through her website. Explain why she watermarks the images shown online.", marks: 2, model: mi(
          "The watermark identifies the images as her intellectual property, which makes it harder for others to sell them or present them as their own",
          "A copied image carries the mark, which discourages use without paying for a clean licensed version, protecting her income (or: it advertises her name wherever the image is shared). 'To stop theft' alone, with no description, does not earn a mark") },
      ],
    },
    "tech-cad": {
      title: "Advantages and limitations of CAD",
      questions: [
        { q: "Why do the drawing views of a part update when the 3D model is changed?", opts: ["The printer redraws them", "The views are raster images", "The views are associative: they are linked to the parametric model", "Because of the 3-2-1 rule"], a: 2, why: "Associative drawings are generated from the model, so a model change flows into every view." },
        { q: "Which is a limitation of CAD?", opts: ["Standard parts from a library", "Clash detection before manufacture", "Photo-realistic rendering", "The cost of licences, hardware and training"], a: 3, why: "The others are advantages; cost of software, hardware and training is a classic limitation." },
        { q: "What is usually lost when a model is exported as STEP to another package?", opts: ["The geometry", "The feature history (modelling tree)", "The file name", "The units"], a: 1, why: "STEP carries the solid geometry, but generally not the parametric features, so editing is harder at the other end." },
        { q: "In which situation is a manual sketch most likely to be better than CAD?", opts: ["Getting a first idea down quickly in a meeting with no computer", "Producing an A0 dimensioned assembly drawing", "Sending a model to a CNC machine", "Rendering a product for a poster"], a: 0, why: "Manual sketching is quick, cheap, portable and needs no power: ideal for early ideas." },
        { type: "open", q: "Explain two advantages of using CAD rather than manual drawing to produce production drawings for a product that may change.", marks: 2, model: mi(
          "The drawings are linked to a parametric model, so when a dimension is changed every view updates automatically, saving redrawing time and avoiding inconsistent views",
          "Any second linked advantage, e.g. standard parts can be inserted from a library so they need not be drawn; templates hold the title block and standards so every drawing is consistent; files can be shared instantly with the manufacturer; the model can be checked for clashes before manufacture") },
      ],
    },
    "tech-impact": {
      title: "Technology and society",
      questions: [
        { q: "Which is a cause-and-effect benefit of the paperless office?", opts: ["It is better", "Costs fall", "Less paper, ink and toner are bought, so running costs fall", "It is modern"], a: 2, why: "It gives the cause (less paper and toner bought) and its effect (lower costs). The others are effects or opinions without causes." },
        { q: "How does CAM software reduce waste when parts are laser cut from sheet?", opts: ["By printing the parts in colour", "By converting the file to JPEG", "By making the sheet thicker", "By nesting the parts tightly on the sheet"], a: 3, why: "Nesting arranges parts close together, so less offcut is wasted." },
        { q: "Why do flat-pack furniture instructions often use no words?", opts: ["Words are too expensive to print", "Pictograms and exploded views can be understood in any country without translation", "DTP software cannot print text", "It is required by copyright law"], a: 1, why: "Graphics cross language boundaries, so one set of instructions works worldwide." },
        { q: "Which is a disadvantage of remote working for a design company?", opts: ["Company files on home networks may be less secure", "Less commuting for staff", "Smaller office costs", "Talent can be recruited from anywhere"], a: 0, why: "The others are benefits. Weaker security on home networks risks confidential files being hacked or lost." },
        { q: "How has DTP changed marketing for small businesses?", opts: ["Only large print firms can produce leaflets", "Logos must now be drawn by hand", "Promotional material can be designed and updated in-house, cheaply and quickly", "Print can no longer use colour"], a: 2, why: "DTP put layout tools on ordinary computers, so small businesses can make and change their own material." },
        { type: "open", q: "Explain two ways CAD supports manufacturing industry.", marks: 2, model: mi(
          "The CAD model is used by CAM software to generate toolpaths for CNC machines, so parts are made accurately to the design and are identical",
          "Any second linked way, e.g. prototypes are 3D printed straight from the model, so designs are tested sooner and reach the market faster; models are sent as neutral files to factories worldwide, so manufacturing can happen where costs or skills suit; simulation and clash checks find problems before anything is made, reducing waste") },
      ],
    },
    "tech-safety": {
      title: "Safe working practices",
      questions: [
        { q: "Where should the top of a computer screen be for a seated designer?", opts: ["Well above head height", "Flat on the desk", "As close to the face as possible", "At or just below eye level, about an arm's length away"], a: 3, why: "This keeps the neck straight and reduces eye strain." },
        { q: "Why should a craft knife be guided along a metal safety rule rather than a plastic one?", opts: ["Metal rules are cheaper", "The blade can cut into or ride over a plastic rule and slip onto the fingers", "Plastic rules are not straight", "Metal rules make the cut darker"], a: 1, why: "Steel stops the blade; the raised guard keeps fingers away from it." },
        { q: "Why should a laser cutter never be left running unattended?", opts: ["The material can catch fire", "It might run out of ink", "It needs the user to press each cut", "It will lose its file"], a: 0, why: "The laser burns through material, which can ignite. Someone must be ready to stop the job." },
        { q: "What is the main reason spray adhesive is used in a spray booth or ventilated area?", opts: ["To dry it faster", "To make it stick better", "Its solvent fumes are harmful to breathe and flammable", "To keep the colour bright"], a: 2, why: "Ventilation removes fumes; keep away from heat and flames because the propellant and solvent are flammable." },
        { type: "open", q: "Describe two safe working practices when using a craft knife to cut card for a presentation model.", marks: 2, model: mi(
          "Any two, described: cut on a self-healing cutting mat, not the desk",
          "guide the blade along a metal safety rule with fingers behind the guard; cut away from the body in several light strokes; use a sharp blade (blunt blades need more force and slip) and put old blades in a sharps container; retract or cover the blade when it is put down") },
      ],
    },
    "tech-exam": {
      title: "Mixed exam practice",
      questions: [
        { q: "For an 'explain' question, what must a candidate do?", opts: ["List as many keywords as possible", "Draw a neat sketch", "Name the topic only", "Relate cause and effect, in the context of the question"], a: 3, why: "That is the published meaning of 'explain'. Most candidates in 2025 gave only the effect." },
        { q: "Which answer earns a mark for 'Explain one benefit of cloud storage for a team in two countries'?", opts: ["It is easier.", "Files sit on internet servers, so both offices can open the latest version at once.", "It saves time.", "Collaboration."], a: 1, why: "Cause (files on internet servers) linked to an effect in context. The others are effects or buzzwords alone." },
        { q: "A logo will be cut from vinyl. Which file type should it be supplied in?", opts: ["SVG", "JPEG", "BMP", "PNG"], a: 0, why: "A vector format gives the cutter paths to follow; raster formats are grids of pixels." },
        { q: "Which pair are two clearly different benefits for a two-mark 'describe' answer on the paperless office?", opts: ["Saves money; is cheaper", "Better; more modern", "Lower paper and toner costs; less office space needed for filing", "Saves paper; uses less paper"], a: 2, why: "Two distinct, described benefits. The other pairs repeat one idea or are vague." },
        { type: "open", q: "A marketing company now sends all its proofs to clients as PDFs instead of printed copies. Explain one benefit and one limitation of this for the company.", marks: 2, model: mi(
          "Benefit: proofs are emailed or shared instantly, so a client anywhere can approve them the same day, with no printing or postage costs",
          "Limitation: the client sees screen (RGB) colours, which may not match the final CMYK print, so a colour problem may only be found after printing; or: the client needs a device and internet connection to view them") },
      ],
    },
  });
})();
