/* Past-paper practice: digital technology in graphic communication. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HGP_BANK = window.HGP_BANK || {});
  /* near(a, b, n): regex source matching a and b in either order with at most n words between them,
     so a shuffled pile of the right words does not satisfy it. */
  const near = (a, b, n) => { const g = "\\W+(?:\\w+\\W+){0," + (n == null ? 3 : n) + "}"; return "\\b(?:" + a + ")\\b" + g + "\\b(?:" + b + ")\\b|\\b(?:" + b + ")\\b" + g + "\\b(?:" + a + ")\\b"; };
  /* Negators for `not` vetoes (not "cannot"/"can't", which often sit in a correct answer). */
  const NEGW = "not|never|does ?n'?t|do ?n'?t|isn'?t|aren'?t|won'?t|wasn'?t|didn'?t|wouldn'?t";
  /* Swapped-format claims ("a JPEG keeps every pixel", "PNG is lossy") must not earn the file-format marks. */
  const SWAP = [
    "\\bjpe?gs?\\W+(?:also |still |always |will |would |can |actually )?(?:keeps?|retains?|preserves?|maintains?)\\b",
    "\\bjpe?gs?\\W+(?:is|are|was|uses?)\\W+(?:a |also |actually |the |one )?loss-?less",
    "\\bpngs?\\W+(?:is|are|was|uses?)\\W+(?:a |also |actually |the |one )?lossy",
    "\\bpngs?\\W+(?:also |still |always |will |would |can |actually )?(?:throws?|loses?|discards?|degrades?|damages?|compresses|blurs?)\\b(?!\\W+(?:nothing|no|none|any))",
    "\\bpngs?\\W+(?:does ?n'?t|does not|will not|won'?t|cannot|can'?t|never|doesn)\\W+(?:\\w+\\W+){0,1}(?:keep|retain|preserve|maintain|store)",
    "\\bpngs?\\W+(?:is|are)\\W+(?:not|n'?t|never)\\W+(?:a |the )?loss-?less",
    "\\bjpe?gs?\\W+(?:does ?n'?t|does not|will not|won'?t|cannot|can'?t|never|doesn)\\W+(?:\\w+\\W+){0,1}(?:lose|degrade|discard|throw|damage|blur)",
    "\\bjpe?gs?\\W+(?:\\w+\\W+){0,3}(?:not|n'?t|never|no)\\W+(?:\\w+\\W+){0,3}(?:lose|lost|loss|degrad\\w*|discard\\w*|throw\\w*|damag\\w*|worse|blur\\w*|blocky|pixelated)",
    "\\bjpe?gs?\\W+(?:is|are)\\W+(?:not|n'?t|never)\\W+(?:a |the )?lossy",
    "\\b(?:would|will|does|do|did|is|are|can|could|might|may)\\W+(?:not|n'?t|never)\\W+(?:\\w+\\W+){0,2}(?:blocky|blurr?y|blurred|pixelated|fuzzy|smeared|jagged)",
    "\\b(?:is|are|was)\\W+(?:not|never)\\W+(?:re-?)?(?:saved|edited|opened|resaved)\\b",
  ];
  /* tech-03(b): what went wrong, how it spreads, and what a separate back-up is. */
  const FAULT = "\\b(?:delet\\w*|remov\\w*|eras\\w*|overwr\\w*|mistake\\w*|accident\\w*|ransomware|malware|corrupt\\w*|virus\\w*|wip(?:e|ed|es)|damag\\w*|ruin\\w*|hack\\w*|encrypt\\w*|error\\w*|change\\w*)";
  const SPREAD = "copi(?:ed|es)|copy|mirror\\w*|sync\\w*|replicat\\w*|spread\\w*|pushed|carried|passe[sd]|propagat\\w*|appl(?:y|ied|ies)|reflect\\w*|shared|wipes?|wiped|affect\\w*|duplicat\\w*|updat\\w*|happens|repeat\\w*";
  const SEP = "(?:separate|independent|off-?site|second|another|extra|different|offline|external|proper|real|actual|own|dedicated|physical|additional|spare)\\W+(?:\\w+\\W+){0,1}(?:back[- ]?ups?|copy|copies|storage|drive|disk|archive)|3-2-1|back[- ]?ups?\\W+(?:\\w+\\W+){0,5}(?:elsewhere|somewhere else|off-?site|offline|disconnected|unplugged|not connected|air-?gapped|(?:different|separate|another|other|remote|external)\\W+(?:\\w+\\W+){0,1}(?:place|location|site|building|drive|server|system|computer|device|disk))";
  B.tech = {
    intro:
      "Digital technology is the paper's <strong>4 to 12 mark</strong> area, and the 2025 report says candidates found it very demanding. Nine scenario questions, 36 marks: files and formats, cloud, back-ups, rights, devices, CAD, and the impact on industry and society. About half the marks are written answers: give a <strong>cause and an effect, in the scenario</strong>, and make two marks two different points.",
    questions: [
      {
        id: "tech-01",
        style: "Scenario question · calculate, identify and explain",
        stem:
          "<p>A Dundee design studio is producing a leaflet for a sailing school. The leaflet carries a photograph that will print <strong>127 mm</strong> wide and be read at arm's length, and the school's logo. The studio keeps the logo as a master file that will be edited many times, and the client will also see the leaflet on a monitor before it is printed.</p>",
        parts: [
          {
            label: "(a)", type: "num", marks: 1, a: 1500, tol: 0, unit: "pixels",
            q: "The photograph must print at <strong>300 ppi</strong>. Calculate the minimum width, in pixels, the photograph needs. There are 25.4 mm in one inch.",
            why: "Convert the printed size to inches, then multiply by the pixels per inch: 127 ÷ 25.4 = 5 inches, and 5 × 300 = <strong>1500 pixels</strong>. A narrower image would have to be stretched, so each pixel would print bigger than 1/300 inch.",
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 1,
            q: "The logo must also be printed small on a pen and enlarged to a three-metre banner. Which version of the logo stays sharp at both sizes?",
            opts: ["A JPEG photograph of the logo", "A vector graphic such as an SVG", "A low-resolution PNG", "A scanned raster image"],
            why: "A vector graphic stores shapes as maths, so it has no pixels and is recalculated at any size. Every raster option is a grid of pixels that becomes blocky when it is enlarged.",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 2,
            q: "The client says the leaflet's colours look brighter on the monitor than on the printed proof. Which statement gives the correct reason?",
            opts: [
              "The press prints with red, green and blue ink, but the monitor uses cyan, magenta, yellow and black",
              "The proof was saved as a vector file, which always prints darker",
              "The monitor makes colour from red, green and blue light (RGB), but the press builds colour from cyan, magenta, yellow and black ink (CMYK)",
              "JPEG compression always makes colours brighter on screen",
            ],
            why: "Screens mix coloured <em>light</em> (RGB) and printers mix <em>ink</em> (CMYK), so screen colours can look different from print. That is why a printed proof is checked. Option 1 swaps the two systems round.",
          },
          {
            label: "(d)", type: "text", marks: 2, rows: 4,
            q: "The studio saves the master logo as a PNG, which uses lossless compression, rather than as a JPEG. Explain why this is better for a file that will be edited many times.",
            minWords: 8,
            points: [
              { desc: "Lossless (PNG) keeps every pixel, so no detail or quality is lost each time it is saved", group: "ll", not: SWAP,
                any: ["\\b(?:keeps?|retains?|preserves?|restores?|maintains?|stores?|holds?(?: on to)?|remembers?|saves?)\\W+(?:\\w+\\W+){0,3}(?:pixels?|details?|quality|data|information|bits?|picture|image|sharpness|everything)", "\\b(?:never|does ?n'?t|will not|won'?t|not)\\W+(?:\\w+\\W+){0,1}(?:gets?|becomes?|looks?|go(?:es)?)\\W+(?:\\w+\\W+){0,1}(?:worse|blurr?y|blocky|pixelated|fuzzy|damaged)", "\\bwithout\\W+(?:\\w+\\W+){0,1}(?:loss|losing|lose|degrad\\w*)", "\\b(?:does ?n'?t|does not|will not|won'?t|never)\\W+(?:\\w+\\W+){0,1}(?:lose|degrade|lower|reduce|damage|discard|throw)", "\\b(?:no|none of the|nothing|not any)\\W+(?:\\w+\\W+){0,2}(?:detail|quality|data|information|pixels?)\\W+(?:is|are|gets?|being|was|will be)\\W+(?:\\w+\\W+){0,1}(?:lost|discarded|removed|thrown|deleted|dropped)", "\\b(?:detail|quality|pixels?|data|information|logo|image|picture|file|graphic|artwork)\\W+(?:is|are|stays?|remains?)\\W+(?:\\w+\\W+){0,2}(?:kept|retained|preserved|intact|same|unchanged|identical)", "\\b(?:never|no)\\W+(?:\\w+\\W+){0,2}loss\\b", "\\b(?:nothing|no data|no detail|no quality|none of it)\\W+(?:\\w+\\W+){0,2}(?:lost|thrown|discarded|removed|deleted|wasted|dropped|taken)", "\\bloses? (?:nothing|no (?:detail|quality|data))", "\\b(?:same|original|full|exact)\\W+(?:\\w+\\W+){0,1}(?:quality|detail)\\W+(?:\\w+\\W+){0,6}(?:each|every|any|however|whenever|after)"], negOK: true },
              { desc: "A JPEG throws detail away, so it gets worse each time it is re-saved (blocky edges on a logo)", group: "jp", not: SWAP, negOK: true,
                win: 60,
                all: ["\\b(?:jpe?gs?|lossy)\\b", "\\b(?:lose\\w*|losing|lost|throw\\w*|thrown|discard\\w*|drops?|dropping|degrad\\w*|damag\\w*|smear\\w*|blurs?|remov\\w*|delet\\w*|destroy\\w*|reduc\\w*|compress\\w*|(?:gets?|getting|becomes?|goes|going)\\W+(?:\\w+\\W+){0,1}(?:worse|blocky|blurr?y|blurred|pixelated|fuzzy)|(?:is|are|gets?|being)\\W+(?:\\w+\\W+){0,1}(?:lost|thrown|discarded|removed|deleted))\\b", "again and again|over and over|repeated\\w*|time after time|\\b(?:each|every|many|several|multiple|lots of|a lot of|loads of)\\W+(?:\\w+\\W+){0,1}(?:times?|edits?|saves?|saving|re-?sav\\w*)|(?:saved?|edited|opened)\\W+(?:\\w+\\W+){0,2}(?:again|repeatedly|more than once|twice)|\\b(?:after|with)\\W+(?:\\w+\\W+){0,1}(?:many|lots|several|multiple|repeated)\\W+(?:\\w+\\W+){0,1}(?:edits?|saves?|saving)"] },
            ],
            sample: "A PNG keeps every pixel exactly as it was, so none of the quality is lost however many times the studio edits and saves the logo. A JPEG throws away some detail each time it is saved, so the edges of the logo would go blocky and blurred.",
            model: "<ul><li>Lossless compression restores every pixel exactly, so no detail is lost however often the file is saved (1)</li><li>A JPEG is lossy: it discards detail, so each re-save makes the logo worse, with blocky or smeared edges (1)</li></ul><p>Also acceptable: edited many times therefore the losses build up (cause and effect). A bare &quot;it is higher quality&quot; or &quot;the file is bigger&quot; earns nothing.</p>",
          },
        ],
      },
      {
        id: "tech-02",
        style: "Scenario question · match and explain (file formats)",
        stem:
          "<p>An Aberdeen studio has built a 3D solid model of a lifeboat winch in its own CAD package. The manufacturer in Gdansk uses a rival make of software. The studio must also send the winch bracket as a 2D drawing, and a brochure proof that has to look the same on every computer.</p>",
        parts: [
          {
            label: "(a)", type: "match", marks: 3,
            q: "Match each file format to the job it does in this scenario.",
            pairs: [
              ["STEP", "Sending the 3D winch model to a rival make of CAD software"],
              ["DXF", "Exchanging the winch bracket as a 2D drawing between CAD packages"],
              ["PDF", "Showing the brochure proof the same on every computer, with fonts embedded"],
            ],
          },
          {
            label: "(b)", type: "text", marks: 1, rows: 3,
            q: "Explain why the studio should send the winch model as a STEP file rather than in its own native format.",
            minWords: 6,
            points: [
              { desc: "STEP is neutral, so almost any CAD package can open it, including the manufacturer's different software", group: "a",
                all: [near("neutral|universal|compatible|common|standard|open", "formats?|files?", 1), near("open\\w*|read|import\\w*|view|use|load\\w*|work\\w*", "any|most|almost|many|every|all|other|different|rival|manufacturer", 3)] },
              { desc: "STEP works in many different CAD packages, including the manufacturer's", group: "a",
                not: ["\\bstep\\W+(?:\\w+\\W+){0,3}(?:only|own|cannot|can'?t|not|won'?t|unable)"],
                any: [near("open\\w*|read|import\\w*|view|work\\w*|compatible|understood|recogni[sz]ed|supported|accepted|handled|usable", "(?:any|most|almost|many|every|all|lots of|different|other|various|rival|several)\\W+(?:\\w+\\W+){0,2}(?:cad|software|programs?|packages?|applications?|systems?)", 2)] },
              { desc: "STEP opens whatever software the manufacturer uses", group: "a",
                all: [near("step|it|neutral", "open\\w*|read|import\\w*|work\\w*|used?", 4), near("whatever|regardless|whichever|no matter", "software|program|package|cad", 3)] },
              { desc: "A native file may not open in the manufacturer's different package", group: "a", negOK: true,
                not: ["\\bstep\\W+(?:\\w+\\W+){0,3}(?:only|own|cannot|can'?t|not|won'?t|unable)", "\\b(?:only|just)\\W+(?:\\w+\\W+){0,2}(?:own|studio'?s)\\W+(?:\\w+\\W+){0,1}(?:software|cad|package|program)"],
                all: ["native|\\bown (?:cad |software |package |program |file )?(?:cad|software|package|format|files?|program)|studio'?s? (?:own )?(cad|software|package|format|files?)|(?:different|rival|other|another) (?:make of |brand of )?(?:cad|software|package|program)", "(not|cannot|can'?t|unable|won'?t|may not|might not|wouldn'?t).{0,25}(open|read|import|use)"] },
            ],
            sample: "STEP is a neutral format that nearly every CAD package can import, so the manufacturer can open the winch model even though it uses different software.",
            model: "<ul><li>STEP is a neutral 3D format that almost any CAD package can open (cause), so the manufacturer can use the model even though its software is different (effect) (1)</li></ul><p>Also acceptable: a native file may not open at all in the manufacturer's package. &quot;It is a common format&quot; with no result earns nothing; DXF is wrong because it is a 2D format.</p>",
          },
        ],
      },
      {
        id: "tech-03",
        style: "Scenario question · choose, then explain",
        stem:
          "<p>A Dundee architects' practice keeps all its drawings in a cloud folder that mirrors to every laptop. Site engineers on an Orkney wind farm open the same drawings on tablets. One morning a designer accidentally removes the folder for Block C from her laptop.</p>",
        parts: [
          {
            label: "(a)", type: "multi", marks: 2,
            q: "Choose <strong>two</strong> benefits of cloud storage for this practice.",
            opts: [
              "The site engineers can open the current drawings from the wind farm if they have an internet connection",
              "The drawings stay available with no internet connection at all",
              "The provider keeps earlier versions, so an overwritten drawing can be restored",
              "The practice has no responsibility for the security of its account",
              "Storage is free for ever, so no subscription is ever paid",
            ],
            a: [0, 2],
            why: "Remote access and kept earlier versions are two clearly different benefits. Cloud storage needs an internet connection, the user is still responsible for passwords and sharing, and it is usually paid for by subscription.",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain why the practice should not rely on the cloud folder alone as its back-up.",
            minWords: 10,
            points: [
              { desc: "Cause: a deletion or mistake made on one device is copied to all the other devices", group: "c", negOK: true,
                win: 90,
                not: ["\\b(?:does ?n'?t|do ?n'?t|won'?t|will not|would not|is ?n'?t|not|never)\\W+(?:get\\W+|be\\W+|also\\W+)?(?:delet\\w*|remov\\w*|copied|synced|mirrored|replicated|erased)\\W+(?:\\w+\\W+){0,3}(?:from|on|to|across|for)", "(?:delet\\w*|remov\\w*|eras\\w*|mistake\\w*|change\\w*|virus\\w*|malware|ransomware)\\W+(?:(?!back|cop(?:y|ies)|need|should|separate|another)\\w+\\W+){0,4}(?:does ?n'?t|do ?n'?t|won'?t|will not|is ?n'?t|not|never)\\W+(?:\\w+\\W+){0,2}(?:affect\\w*|sync\\w*|copied|mirror\\w*|spread|pass\\w*|appl\\w*|carr\\w*|propagat\\w*|replicat\\w*|touch\\w*|alter\\w*)"],
                all: [FAULT,
                  near(SPREAD, FAULT, 7) + "|\\balso (?:delet|remov|eras|lost)\\w*|\\b(?:delet|remov|eras|overwr|corrupt|damag|ruin|wip)\\w*\\W+(?:\\w+\\W+){0,4}(?:for|from|on|across|in|to)\\W+(?:\\w+\\W+){0,1}(?:every\\w*|all|each|other|both)",
                  near("every|all|each|other|both|everyone|everybody|whole|entire|everywhere", "devices?|laptops?|tablets?|computers?|copies|machines?|users?|colleagues?|everyone|everybody|folders?|cloud|drives?|everywhere|account|them|these|those", 2) + "|\\b(?:on|from|across)\\W+(?:the\\W+)?(?:tablets?|laptops?|devices?|computers?)|\\b(?:everyone|everybody|everywhere)\\b"] },
              { desc: "Effect: the work is lost everywhere, with no untouched copy left", group: "e", negOK: true,
                not: ["\\b(?:" + NEGW + ")\\W+(?:\\w+\\W+){0,1}(?:lost|gone|wiped|deleted|removed)\\b"],
                any: ["\\b(?:delet\\w*|remov\\w*|gone|lost|wip(?:e|ed|es)|disappear\\w*|vanish\\w*|eras\\w*)\\W+(?:\\w+\\W+){0,3}(?:everywhere|for everyone|from everyone|for everybody|on all|from all|on every|from every|in all|across all|all of them)\\b", near("lost|gone|disappear\\w*|vanish\\w*|wiped|deleted|lose|loses|removed|ruined|destroyed|damaged|corrupted|erased", "everywhere|everyone|everybody|all (?:the |of the )?(?:devices|laptops|copies|computers|machines)|every (?:device|laptop|copy|computer|machine|version)|each (?:device|laptop|copy|computer|machine)", 2), "\\bno\\W+(?:\\w+\\W+){0,2}(?:copy|copies|back-?up)\\W+(?:\\w+\\W+){0,3}(?:left|remain\\w*|survive\\w*)", "nothing\\W+(?:\\w+\\W+){0,2}left", "(?:cannot|can'?t|unable)\\W+(?:\\w+\\W+){0,2}(?:recover|restore|get (?:it|them) back)", "lose\\W+(?:\\w+\\W+){0,2}everything", "\\bno\\W+(?:\\w+\\W+){0,2}(?:copy|copies|back-?up)", "\\b(?:work|files?|drawings?|folders?|everything|data|designs?|projects?)\\W+(?:\\w+\\W+){0,3}(?:lost|gone|wiped|disappear\\w*|ruined|destroyed)"] },
              { desc: "A separate back-up (such as an off-site copy) that sync cannot change would survive", group: "s",
                win: 90,
                all: [SEP, "still\\W+(?:\\w+\\W+){0,2}(?:has|have|there|safe|exist\\w*|kept|hold|holds|intact|available|usable|work)|surviv\\w*|unaffected|(?:restor|recover|retriev)\\w*|(?:would|will|be) (?:be )?(?:safe|fine|ok)|\\b(?:need|needs|needed|should|must|essential|important|vital|better)\\b|(?:stored|kept|held|saved|located)\\W+(?:\\w+\\W+){0,2}(?:elsewhere|somewhere else|separately|off-?site|another|a different|away|apart|externally)|elsewhere|somewhere else|\\bget (?:it|them|the \\w+) back"] },
              { desc: "A separate back-up (such as an off-site copy) that sync cannot change would survive", group: "s", negOK: true,
                win: 90,
                all: [SEP, near("cannot|can'?t|not|never|won'?t|doesn'?t|does not|isn'?t", "touch|affect|change|delete|mirror|sync\\w*|alter|overwrit\\w*|copy|copies|linked|connected", 3)] },
              { desc: "Sync is not a back-up: a mistake is copied to every device, so a separate copy is needed", group: "s", negOK: true,
                win: 140,
                all: ["\\b(?:sync\\w*|cloud(?: storage| folder| drive)?|mirror\\w*|dropbox|onedrive|google drive)\\W+(?:\\w+\\W+){0,2}(?:is ?n'?t|is not|are ?n'?t|are not|not)\\W+(?:\\w+\\W+){0,2}(?:back[- ]?ups?)", FAULT + "|everywhere|everyone|everybody|every (?:device|laptop|copy|computer)|all (?:the |of the )?(?:devices|laptops|copies|computers)|mirror\\w*|copied"] },
            ],
            sample: "If somebody deletes a folder by mistake on one laptop, the cloud copies that deletion to every other device, so the drawings are gone everywhere. A separate back-up that is kept apart from the syncing would still have the folder.",
            model: "<ul><li>A deletion or mistake on one device is copied to every synchronised device (cause) (1)</li><li>so the file is lost everywhere and no untouched copy is left (effect), unless a separate back-up exists, such as the 3-2-1 off-site copy (1)</li></ul><p>Sync is not a back-up. Version history or the deleted-files bin may rescue the folder, but only for a limited time. &quot;The internet might fail&quot; answers a different question and earns nothing.</p>",
          },
        ],
      },
      {
        id: "tech-04",
        style: "Scenario question · identify and describe (file management)",
        stem:
          "<p>A small studio keeps its only working copy of a job on a laptop. A USB drive in the same laptop bag holds a second copy. The files are named <em>poster final FINAL (2).pdf</em>, <em>new drawing.dwg</em> and <em>IMG_4032.jpg</em>.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 3,
            q: "Which single change would give the studio the missing <strong>off-site</strong> copy that the 3-2-1 rule asks for?",
            opts: [
              "Buy a second USB drive and keep it in the same bag",
              "Delete the laptop copy once the USB drive is full",
              "Move the USB drive to a different pocket of the bag",
              "Add a copy in cloud storage, away from the building",
            ],
            why: "The 3-2-1 rule means 3 copies, on 2 types of storage, with 1 copy off-site. A drive in the same bag as the laptop is stolen or lost with it, so it does not count as off-site. A cloud copy is both a third copy and away from the building.",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Describe <strong>two</strong> ways the studio's file names could be improved.",
            minWords: 8,
            points: [
              { desc: "Names say what the file contains (job, item, stage) so it can be recognised without opening it", group: "n1",
                any: [near("names?|naming|titles?", "say|says|tell|tells|describe\\w*|show|shows|explain\\w*|indicate\\w*|identif\\w*|contain\\w*|content\\w*", 2), "what\\W+(?:\\w+\\W+){0,1}(?:is|are|was|s)\\W+(?:\\w+\\W+){0,1}(?:in|inside)\\b", "\\b(?:job|project|client|item|stage|subject|content)\\W+(?:name|title)s?\\b", "\\bnames?\\W+(?:\\w+\\W+){0,4}(?:job|project|client|stage|content|item|subject)\\b", "(?:descriptive|meaningful|clear|informative|sensible)\\W+(?:\\w+\\W+){0,1}(?:names?|titles?)"] },
              { desc: "Use version numbers that rise in order instead of 'final'", group: "n2",
                any: ["versions?\\W+(?:\\w+\\W+){0,1}(?:numbers?|numbering|control|codes?)", "numbers?\\W+(?:that\\W+)?(?:go|goes|rise|rises|increase\\w*|count\\w*)", "\\bv0?\\d+\\W+(?:and\\W+)?v0?\\d+", "number(?:ed|ing)?\\W+(?:\\w+\\W+){0,1}(?:each|every)\\W+(?:\\w+\\W+){0,1}(?:draft|version|save|file)", "numbering"] },
              { desc: "Follow the same agreed pattern or order for every file", group: "n3",
                any: ["consisten\\w*", "same\\W+(?:\\w+\\W+){0,1}(?:order|pattern|format|structure|convention|style|system)", "agreed\\W+(?:\\w+\\W+){0,1}(?:pattern|convention|format|order|system|rules?)", "naming convention", "everyone\\W+(?:\\w+\\W+){0,1}(?:uses|follows)"] },
              { desc: "Dates written year first so they sort in date order", group: "n4",
                any: ["year\\W+(?:\\w+\\W+){0,2}first", "yyyy|year\\W+month\\W+day|\\bymd\\b", "20\\d\\d-\\d\\d-\\d\\d", near("dates?", "sort\\w*|in order|chronolog\\w*", 3)] },
              { desc: "Avoid spaces, brackets and symbols in names", group: "n5",
                any: [near("no|avoid|without|not use|don'?t use|do not use|instead of|rather than|remove", "spaces|symbols|brackets|slashes|special", 2), "underscores?", "hyphens?"] },
            ],
            sample: "Each name should say what is in the file, such as the job, the item and the stage, so nobody has to open it to find out. They should also use version numbers like v01, v02 that go up, instead of calling things final.",
            model: "<ul><li>Names describe the content: job, item and stage, not IMG_4032 (1)</li><li>Version numbers (v01, v02 …) that rise, never &quot;final&quot; or &quot;FINAL (2)&quot; (1)</li></ul><p>Also acceptable: the same pattern for every file; dates written year first so they sort; underscores or hyphens instead of spaces and brackets. Two versions of the same idea earn one mark.</p>",
          },
        ],
      },
      {
        id: "tech-05",
        style: "Scenario question · identify and explain (rights)",
        stem:
          "<p>A freelance photographer in Orkney sells her coastline photographs through her own website. Customers receive the original file once their order is complete. She also emails a confidential CAD drawing to a client.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 0,
            q: "Which form of intellectual property protects each photograph automatically in the UK, as soon as it is taken, without registration?",
            opts: ["Copyright", "A patent", "A registered design", "A trade mark"],
            why: "Copyright covers original creative work such as photographs and drawings and arises automatically when the work is created and recorded. Patents, registered designs and (registered) trade marks must be applied for.",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "The website shows only small, low-resolution previews of each photograph. Explain why this helps the photographer.",
            minWords: 10,
            points: [
              { desc: "Cause and effect: a small, low-ppi copy cannot be printed or enlarged without looking pixelated or blurry", group: "p", negOK: true,
                not: ["\\b(?:not|n'?t|never)\\W+(?:\\w+\\W+){0,1}(?:blurr?y|pixelated|blocky|fuzzy|grainy|jagged|unclear)", "\\b(?:no|any)\\W+(?:\\w+\\W+){0,1}(?:problem|difference)", "\\b(?:can|could|will|would)\\W+(?:\\w+\\W+){0,2}(?:print\\w*|enlarg\\w*|blow\\w*)\\W+(?:\\w+\\W+){0,3}(?:fine|well|perfectly|clearly|sharp\\w*|without (?:a )?problem)"],
                any: ["\\b(?:small|low|tiny|preview|thumbnail|poor|reduced|lower)\\b.{0,60}\\b(?:can'?t|cannot|unable to|not able to|won'?t be able to)\\W+(?:\\w+\\W+){0,4}(?:print|enlarg|blow)",
                  "^(?=.*\\b(?:small|low|tiny|previews?|thumbnails?|poor|reduced|lower|resolution|res|pixels?)\\b).*\\b(?:can'?t|cannot|unable to|not able to|won'?t be able to|will not be able to|not be able to|nobody can|no ?one can|no-one can|none can|won'?t|wouldn'?t|will not|would not|doesn'?t|does not)\\W+(?:\\w+\\W+){0,6}(?:print\\w*|enlarg\\w*|blow\\w*)",
                  near("print\\w*|enlarg\\w*|blow\\w*|bigger|larger|poster|full size|zoom\\w*|stretch\\w*|sell\\w*|publish\\w*|reproduc\\w*", "pixel\\w*|blurr?y|blocky|fuzzy|unusable|useless|grainy|jagged|stretch\\w*|unclear|unsharp|low quality|poor quality|rough|ugly|distort\\w*|messy|smudg\\w*|poor|bad|awful|terrible|unprofessional|disappointing", 4), "(?:" + near("few|not enough|too little|insufficient|lack\\w*|low number of", "pixels?|detail|resolution", 1) + ")\\W+(?:\\w+\\W+){0,12}(?:print\\w*|enlarg\\w*|poster|bigger|larger|stretch\\w*|zoom\\w*|blow\\w*)", "\\btoo\\W+(?:\\w+\\W+){0,4}(?:to|for)\\W+(?:\\w+\\W+){0,1}(?:print\\w*|enlarg\\w*|poster|large|big)", "\\b(?:unsuitable|unfit|unusable|useless|no use|not usable|not suitable|not good enough|not big enough|not sharp enough)\\W+(?:\\w+\\W+){0,2}(?:for )?(?:print\\w*|enlarg\\w*|poster|publication|commercial)", near("(?:low|small|poor|bad|tiny|reduced|lower)\\W+(?:\\w+\\W+){0,1}(?:resolution|quality|ppi|dpi)", "useless|unusable|no use|not (?:good|usable|worth|much use)|worthless|little use|can'?t be used|cannot be used", 4)] },
              { desc: "Customers must pay or buy a licence to get the full-quality file, so her income is protected", group: "q", negOK: true,
                not: ["\\b(?:not|n'?t|never|no need)\\W+(?:\\w+\\W+){0,3}(?:pay|paid|paying|buy|buying|purchas\\w*|licen[cs]e)", "(?<!(?:nobody|no ?one|no-one|cannot|can'?t|not|never|without)\\W+(?:\\w+\\W+){0,4})\\bfor free\\b|\\bfree (?:of charge|to (?:use|take|download|copy))"],
                any: ["\\b(?:buy|buying|purchas\\w*|pay for|paying for|need|must|have to|has to)\\W+(?:\\w+\\W+){0,2}licen[cs]es?\\b", near("pay|paid|paying|buy|buying|bought|purchas\\w*|licen[cs]e\\w*|checkout", "(?:full|high|original|clean|proper|better|large|bigger|real|actual|unmarked|complete|good|decent)\\W+(?:\\w+\\W+){0,2}(?:file|files|version|quality|resolution|image|images|photo|photos|copy|size|picture|pictures|photograph|original|one|ones|thing|print|prints|product)", 7), near("income|money|earn\\w*|sales|revenue|profit|living|paid", "protect\\w*|lose|lost|loses|safe|keep|keeps|secure\\w*|stops?|gets?|still|earns?", 4), near("pay|paid|paying|buy|buying|bought|purchas\\w*", "photographer|income|revenue|profit|living|earns?|earning|her (?:work|sales|money|business)", 4)] },
            ],
            sample: "Anyone who copies a small preview gets an image that looks pixelated if printed, so it is no use to them. To get the high quality original they have to buy it, so the photographer still gets paid.",
            model: "<ul><li>A low-resolution copy has too few pixels to print or enlarge well, so a copied preview is of little use (1)</li><li>The full-resolution file is only supplied after payment (or a licence), so her income is protected (1)</li></ul><p>&quot;It stops theft&quot; on its own is not accepted: say what is prevented and why it matters.</p>",
          },
          {
            label: "(c)", type: "text", marks: 1, rows: 3,
            q: "Explain how encrypting the confidential CAD drawing protects it if the email is intercepted.",
            minWords: 6,
            points: [
              { desc: "The file is scrambled, so whoever intercepts it cannot read it without the key", negOK: true,
                not: ["\\b(?:not|n'?t|never)\\W+(?:\\w+\\W+){0,1}(?:scrambl\\w*|encrypt\\w*|encod\\w*|coded|jumbled|unreadable|protect\\w*|secure\\w*)", "\\b(?:can|could|will|able to|would)\\W+(?:easily |simply |still )?(?:read|open|understand|view|see|use)\\b", "\\bno\\W+(?:\\w+\\W+){0,1}(?:protection|difference|effect)"],
                all: ["\\b(?:scrambl\\w*|unscrambl\\w*|jumbled|gibberish|cipher\\w*|coded|nonsense|meaningless|unintelligible|encod\\w*|mixed up|unreadable|(?:turned|changed|converted) (?:in)?to (?:a )?code)\\b",
                  near("cannot|can'?t|couldn'?t|could not|unable to|not able to|won'?t be able to|unable", "read|open|understand|see|use|view|make sense of", 1) + "|unreadable|" + near("only|without|unless", "key|password|decrypt\\w*", 3) + "|(?:does ?n'?t|do not|don'?t|does not|has ?n'?t|hasn'?t|have ?n'?t|haven'?t|lacks?|lacking|missing)\\W+(?:\\w+\\W+){0,2}(?:key|password|code)|(?:make|makes|made)\\W+no\\W+sense|(?:looks?|appears?|seems?)\\W+(?:like\\W+)?(?:\\w+\\W+){0,1}(?:nonsense|gibberish|rubbish|random|meaningless)"] },
            ],
            sample: "The drawing is scrambled into data that makes no sense, so someone who intercepts the email only sees nonsense unless they have the key.",
            model: "<ul><li>The file is scrambled with a key, so anyone who intercepts it cannot read it without that key (1)</li></ul><p>Encryption protects the file in transit or storage; it does not stop someone who is allowed to open it from copying what they see.</p>",
          },
        ],
      },
      {
        id: "tech-06",
        style: "Scenario question · choose a device and explain",
        stem:
          "<p>A museum wants an exact replacement for a worn, carved ship's wheel. No drawings exist and the spokes are decoratively shaped. The finished drawings will be printed full size on one sheet.</p>",
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1, a: 2,
            q: "Which input device should be used to capture the surface of the wheel for the computer?",
            opts: ["A flatbed scanner", "A graphics tablet", "A 3D scanner", "A touchscreen"],
            why: "A 3D scanner measures the surface of a real object as millions of points. A flatbed scanner captures only flat originals, and a graphics tablet and touchscreen capture hand movements.",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain why a 3D scanner is suitable for this job.",
            minWords: 10,
            points: [
              { desc: "It measures millions of points on the surface, so the complex shape is captured accurately without measuring each part by hand", group: "s1", negOK: true,
                win: 110,
                not: ["\\b(?:not|n'?t|never|cannot|can'?t)\\W+(?:able to |capable of )?(?:\\w+\\W+)?(?:captur\\w*|record\\w*|measur\\w*|map\\w*|scan\\w*|reads?|sens\\w*|copy|copies)\\W+(?:\\w+\\W+){0,3}(?:points|surface|shape|curves?|curved|spokes?|detail\\w*|carv\\w*)", "\\b(?:needs?|requires?|first|must have|has to have)\\W+(?:\\w+\\W+){0,2}(?:drawings?|plans?)\\W+(?:\\w+\\W+){0,3}(?:and|then|before)\\W+(?:\\w+\\W+){0,3}measur"],
                all: [near("measur\\w*|captur\\w*|record\\w*|map\\w*|scan\\w*|reads?|sens\\w*|picks? up|copies|copy|digitis\\w*|reproduc\\w*|replicat\\w*", "points|surface|shape|shapes|curves?|curved|spokes?|geometry|contours?|carvings?|decorat\\w*|detail\\w*|wheel|dimensions?|object", 4) + "|\\b(?:millions|thousands|huge numbers|large numbers|lots|many) of points",
                  near("without|instead of|no need|rather than|saves?|saving|spares?|avoid\\w*|nobody|no one|no-one", "measur\\w*|draw\\w*|by hand|manual\\w*", 4) + "|\\b(?:not|never|no longer)\\W+(?:\\w+\\W+){0,3}(?:measur\\w*|draw\\w*|manual\\w*)|" + near("captur\\w*|record\\w*|map\\w*|copy|copies|reproduc\\w*|replicat\\w*|measur\\w*|shape|surface|curves?|spokes?|detail\\w*|dimensions?", "accurat\\w*|exact\\w*|precis\\w*|great detail|fine detail|every detail|high detail|full detail|intricate|faithful\\w*|perfect\\w*|true to|identical", 3) + "|\\bby hand\\b|\\bmanual\\w*"] },
              { desc: "The scan becomes a mesh or point cloud in CAD, so a matching replacement can be machined or printed", group: "s2",
                win: 120,
                all: [near("mesh|point cloud|cad|3d model|digital model|data|file|result|model\\w*|measurements", "import\\w*|convert\\w*|turn\\w*|brought|transfer\\w*|loaded|opened|exported|into|used|edit\\w*|sent|send|feed|fed|print\\w*|machin\\w*|made|make|build|built|manufactur\\w*|recreat\\w*|reproduc\\w*|produc\\w*", 5) + "|\\b(?:modell?ed|recreated|rebuilt|redrawn|drawn up|made|built)\\W+(?:\\w+\\W+){0,3}(?:in|using|with|on|by)\\W+(?:\\w+\\W+){0,1}cad\\b", "\\b(?:replacement|replica|copy|copies|match\\w*|print\\w*|machin\\w*|manufactur\\w*|recreat\\w*|reproduc\\w*|duplicat\\w*|cut\\w*|new wheel|another wheel|identical|clone)"] },
              { desc: "It copes with a complex shape that has no drawings, saving a long time", group: "s3",
                win: 100,
                all: [near("no|without|don'?t have|do not have|missing|lack\\w*|absence of", "drawings?|plans?|dimensions?", 2), "measur\\w*|captur\\w*|record\\w*|sensor|laser|scan\\w*|takes?|gets?|reads?|works? out"] },
            ],
            sample: "The scanner measures millions of points over the carved surface, so the awkward curved spokes are captured accurately without anyone having to measure them by hand. The scan can then be turned into a mesh and brought into CAD, so a replacement wheel can be made to match the original.",
            model: "<ul><li>It measures millions of points on the surface (cause), so the complex carved shape is captured accurately without measuring every curve by hand (effect) (1)</li><li>The point cloud is converted to a mesh and imported into CAD (cause), so the replacement can be 3D printed or machined to match the original (effect) (1)</li></ul><p>&quot;It is quicker&quot; with no cause earns nothing.</p>",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 1,
            q: "Which output device would print the full-size drawing on one sheet from a roll of paper?",
            opts: ["A vinyl cutter", "A plotter", "A laser cutter", "A projector"],
            why: "A plotter (large-format printer) prints A1 and A0 drawings from a roll with accurate lines. A vinyl cutter and a laser cutter cut shapes along vector paths, and a projector only enlarges a screen image.",
          },
        ],
      },
      {
        id: "tech-07",
        style: "Scenario question · explain (CAD and manual methods)",
        stem:
          "<p>A start-up product design studio with three staff is deciding whether to buy 3D CAD or to carry on working with a pencil and drawing board. The owner is unsure that CAD is worth the money.</p>",
        parts: [
          {
            label: "(a)", type: "text", marks: 2, rows: 5,
            q: "Explain <strong>two</strong> limitations of CAD for a small start-up studio.",
            minWords: 12,
            points: [
              { desc: "Cost: software licences or subscriptions and powerful computers are expensive, a big start-up cost for a small studio", group: "l1", negOK: true,
                win: 110,
                not: ["\\b(?:" + NEGW + ")\\W+(?:\\w+\\W+){0,2}(?:expensive|costly|pricey)", "\\b(?:cheap|cheaper|affordable|inexpensive|low cost|free|saves? (?:the )?(?:studio )?money)\\b", "(?<!(?:not|n'?t|never|unable|hardly|barely)\\W+(?:\\w+\\W+){0,3})\\b(?:can|could|easily|able to|will)\\W+(?:\\w+\\W+){0,1}afford"],
                all: [near("expens\\w*|costly|pricey|afford\\w*|costs?|outlay|investment|fees?|prices?|priced|fortune|steep", "software|licen[cs]es?|subscriptions?|computers?|pcs?|hardware|equipment|printers?|plotters?|cad|programs?|packages?|machines?|workstations?|fees", 3) + "|\\bcosts?\\W+(?:\\w+\\W+){0,1}(?:thousands|a lot|too much|a fortune|hundreds)|\\b(?:big|high|large|heavy|huge|major|steep|serious)\\W+(?:\\w+\\W+){0,2}(?:costs?|outlay|expens\\w*|investment|fees?|prices?)",
                  "software|licen[cs]es?|subscriptions?|computers?|pcs?|hardware|equipment|printers?|plotters?|\\bcad\\b|programs?|packages?|machines?|workstations?"] },
              { desc: "Training: the staff need time to learn the software, delaying useful work and costing money", group: "l2", negOK: true,
                win: 110,
                not: ["\\b(?:" + NEGW + "|no)\\b[^.;!?]{0,25}\\b(?:train\\w*|learn\\w*)", "\\b(?:train\\w*|learn\\w*)\\b[^.;!?]{0,30}\\b(?:" + NEGW + "|easy|easily|quick\\w*|simple|short|no time|little time)\\b"],
                all: [near("train\\w*|learn\\w*", "weeks|months|cost\\w*|money|pay|expensive|time|long|needs?|takes?|require\\w*|first|before|until", 4) + "|\\bhow to use\\b", near("delay\\w*|slow\\w*|wast\\w*|lost|before|until|unable|cannot|can'?t|waiting|holds? up|hold(?:ing)? up|stops?|prevent\\w*|first|put off", "work|drawings?|projects?|production|produc\\w*|designs?|staff|earn\\w*|income|start|studio|business|firm|company|team|jobs?|orders?|clients?|output|results?", 4) + "|\\bwast\\w*\\W+(?:\\w+\\W+){0,1}time|\\bcould be (?:earning|working|producing|designing)"] },
              { desc: "Training: the staff need time to learn the software, which costs time and money", group: "l2", negOK: true,
                not: ["\\b(?:" + NEGW + "|no)\\b[^.;!?]{0,25}\\b(?:train\\w*|learn\\w*)", "\\b(?:train\\w*|learn\\w*)\\b[^.;!?]{0,30}\\b(?:" + NEGW + "|easy|easily|quick\\w*|simple|short|no time|little time)\\b"],
                all: ["\\b(?:train\\w*|learn\\w*)\\b", "\\b(?:takes?|taking|needs?|requires?|costs?|is|are)\\W+(?:\\w+\\W+){0,2}(?:time|weeks|months|long|money|expensive|costly|days|a while)\\b"], win: 30 },
              { desc: "Dependence: a power cut, crash or corrupt file stops work or loses hours of it", group: "l3",
                any: ["power ?(?:cut|failure|outage)", "(?:crash|corrupt)\\w*", "power (?:is )?(?:lost|off)", "(?:there is|there's|with) no (?:power|electricity)", "(?:computer|software|hardware|system|machine)s? (?:fails?|breaks? down|crash)"] },
              { desc: "Compatibility: native files may not open in another package, and neutral formats lose the feature history", group: "l4", negOK: true,
                win: 90,
                not: ["\\bstep\\W+(?:\\w+\\W+){0,3}(?:only|own|cannot|can'?t|not|won'?t|unable)", "\\b(?:can|could|will|would)\\W+(?:\\w+\\W+){0,1}(?:always |easily )?open\\W+(?:\\w+\\W+){0,4}(?:any|every|all)\\W+(?:\\w+\\W+){0,2}(?:software|package|program|cad)"],
                all: ["native|neutral|step|iges|\\bown (?:cad |software |file )?(?:format|software|package|program)|studio'?s? own|different (?:software|package|program|cad|format)|other (?:software|packages?|programs?|cad)|(?:client|customer|manufacturer|other)'?s? (?:software|package|program|cad)|incompatib\\w*|compatib\\w*", near("not|cannot|can'?t|unable|won'?t|lose|lost|loses|fail\\w*|problems?|issues?|incompatib\\w*", "open|import|history|feature|work|read|compatib\\w*", 3)] },
              { desc: "Security: digital files are easy to hack, copy or damage with malware, so back-ups and protection are needed", group: "l5",
                win: 60,
                all: ["\\b(?:hack|stol[ae]n|steal|malware|virus|theft|cyber|ransomware|breach|unauthori[sz]ed|pirat)\\w*|\\b(?:easy|easily|simple|simply)\\W+(?:to )?(?:copy|copied|copies)\\b", "(?:files?|designs?|drawings?|models?|data)"] },
            ],
            sample: "The software licences and powerful computers are expensive, which is a big start-up cost for a studio with only three people. The staff also need to be trained for weeks, which delays real work.",
            model: "<ul><li>Cost: licences or subscriptions, powerful computers and output devices are expensive for a small studio (1)</li><li>Training: staff need time and money to learn the software before they can produce drawings (1)</li></ul><p>Also acceptable: dependence on power and hardware (a crash can lose hours of work); native files may not open in another package; digital files are easy to hack or copy so back-ups are needed. &quot;It is expensive&quot; earns the mark only when it says what is expensive.</p>",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "The owner says the staff will still sketch their first ideas by hand. Explain why this is sensible.",
            minWords: 10,
            points: [
              { desc: "Pencil and paper need no power, software or training, so they cost almost nothing", group: "m1", negOK: true,
                not: ["\\b(?:" + NEGW + ")\\W+(?:\\w+\\W+){0,1}(?:cheap\\w*|free|inexpensive)", "\\b(?:expensive|costly|costs? a lot)\\b"],
                any: [near("cheap\\w*|free|inexpensive|nothing|minimal|low[- ]cost", "pencil|paper|sketch\\w*|pens?", 2) + "|\\bcosts? (?:almost |next to |very |hardly |practically )?(?:nothing|little|less)\\b|\\b(?:no|zero|minimal|little|low)[- ]cost\\b|\\bonly needs? (?:a )?(?:pencil|pen|paper)",
                  near("no|without", "power|electric\\w*|software|computers?|training", 1) + "|(?:does not|doesn'?t|don'?t|do not)\\W+need\\W+(?:\\w+\\W+){0,1}(?:power|electric\\w*|software|computer\\w*|training)"] },
              { desc: "Freehand sketching is the quickest way to get an idea down, before it is lost", group: "m2",
                any: ["(?:quick\\w*|fast\\w*|rapid\\w*)\\W+(?:way|method|means|tool|to)\\W+(?:\\w+\\W+){0,3}(?:ideas?|thoughts?|concepts?)", near("quick\\w*|fast\\w*|speed\\w*|rapid\\w*|immediate\\w*|straight away|instantly|in seconds|in minutes|at once|on the spot|as they come", "ideas?|concepts?|thoughts?|inspiration|designs?|notions?", 5)] },
              { desc: "A sketch can be done anywhere, for example in a meeting or with a client, because it is portable", group: "m3",
                any: ["anywhere", "portable", "on ?site", "in (?:a |the |client )?meetings?", "(?:with|in front of|beside) (?:a |the )?client", "any ?place", "carry (?:it |them )?(?:around|about|with)", "on the go", "wherever"] },
            ],
            sample: "A pencil and paper need no power or software, so they cost almost nothing to use. It is also the quickest way to jot ideas down before they are forgotten.",
            model: "<ul><li>Pencil and paper need no power, software or training, so they are cheap and always available (1)</li><li>Freehand sketching is the quickest way to get an idea down, so early ideas are not slowed by learning or setting up software (1)</li></ul><p>Also acceptable: a sketch can be made anywhere, such as in a client meeting. Each version of &quot;it is faster&quot; needs to say faster at what.</p>",
          },
        ],
      },
      {
        id: "tech-08",
        style: "Scenario question · choose and explain (society)",
        stem:
          "<p>A Glasgow packaging design company has moved its drawings and documents online. Its designers now work from home two days a week, using cloud storage and video calls to reach their colleagues.</p>",
        parts: [
          {
            label: "(a)", type: "multi", marks: 2,
            q: "Choose <strong>two</strong> benefits of the paperless way of working for the company.",
            opts: [
              "No power or network is needed to read documents",
              "Less money is spent on paper, ink and toner",
              "Files can no longer be hacked or deleted by mistake",
              "No space is needed for plan chests and filing cabinets",
              "Proofreading is always easier on screen than on paper",
              "The devices and data centres use no energy",
            ],
            a: [1, 3],
            why: "Lower costs and smaller storage space are two benefits of going paperless. The drawbacks include dependence on power and networks, security risks, some tasks (such as proofreading) being easier on paper, and the energy that devices and data centres still use.",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "Explain <strong>two</strong> benefits to a designer of working remotely.",
            minWords: 12,
            points: [
              { desc: "No commute, so time and travel costs are saved", group: "r1",
                not: ["\\b(?:long|lengthy|longer|more|extra|increase\\w*|still)\\W+(?:\\w+\\W+){0,1}(?:commut\\w*|travel\\w*|journey\\w*)"],
                any: ["\\b(?:sav\\w*|less|fewer|cheaper|cuts?|reduc\\w*|lower|shorter)\\W+(?:\\w+\\W+){0,2}(?:commut\\w*|travel\\w*|journey\\w*|road|petrol|fuel|fares?|driving)\\b", "\\b(?:traffic|rush hour|congestion|jams?)\\W+(?:\\w+\\W+){0,2}(?:every|each|daily|morning|stress\\w*)", "\\b(?:commut\\w*|travel\\w*|journey\\w*|road|petrol|fuel|fares?|driving)\\W+(?:\\w+\\W+){0,1}(?:sav\\w*|less|fewer|cheaper|cuts?|reduc\\w*|lower|shorter)\\b", "\\b(?:less|fewer)\\W+(?:\\w+\\W+){0,2}(?:time|money)\\W+(?:\\w+\\W+){0,3}(?:road|travel\\w*|commut\\w*|driving)\\b", "\\b(?:commut\\w*|travel\\w*|journey\\w*)\\W+(?:time|costs?|costing|money|expens\\w*|stress\\w*)\\b", "no\\W+(?:\\w+\\W+){0,1}(?:commut\\w*|travel\\w*)"] },
              { desc: "No commute, so time and travel costs are saved (stated negatively)", group: "r1", negOK: true,
                not: ["\\b(?:still|long|lengthy)\\W+(?:\\w+\\W+){0,1}(?:commut\\w*|travel\\w*)"],
                any: ["\\b(?:do not|does not|don'?t|doesn'?t|no need to|no longer|not have to|never have to|without|avoid\\w*|cut\\w* out|skip\\w*|rid of|eliminat\\w*|remov\\w*|no more|spare[sd]?|free from|freed from)\\W+(?:\\w+\\W+){0,3}(?:commut\\w*|travel\\w*|journey\\w*)\\b", "\\b(?:aren'?t|are not|isn'?t|is not|not|no longer|never|without|avoid\\w*)\\W+(?:\\w+\\W+){0,2}(?:stuck|sitting|caught|queu\\w*)?\\W*(?:in )?(?:traffic|rush hour|congestion|jams?)\\b"] },
              { desc: "Flexible hours that fit around family and life", group: "r2",
                win: 90,
                any: ["\\b(?:fit\\w*|work\\w*|arrang\\w*|balanc\\w*|suit\\w*|spend\\w*|manag\\w*|schedul\\w*|plan\\w*)\\W+(?:\\w+\\W+){0,3}(?:around|in with|with|to suit|for|and|between|alongside|to fit)\\W+(?:(?:the )?(?:needs|demands) of |\\w+\\W+){0,1}(?:(?:their|his|her) )?(?:family|families|children|child\\w*|kids|school|parents?|partner|home life|personal|commitments|work-?life|life|hobbies|appointments|relatives)\\b", "\\b(?:look(?:ing)?|care|caring|cared|tend\\w*) (?:after|for)\\W+(?:\\w+\\W+){0,1}(?:family|families|children|child\\w*|kids|school|parents?|partner|home life|personal|commitments|work-?life|life|hobbies|appointments|relatives)\\b", "\\bwork-?\\s?life balance\\b|\\bbalance\\W+(?:\\w+\\W+){0,1}work"] },
              { desc: "Flexible hours (the designer chooses when to work)", group: "r2",
                any: ["\\bflexib\\w*\\W+(?:\\w+\\W+){0,1}(?:hours|working|schedules?|times?)\\b", "\\b(?:choose|set|pick|decide)\\W+(?:their |his |her )?(?:own )?(?:working )?hours\\b"] },
              { desc: "The designer can live far from the company, for example in a rural area", group: "r3",
                any: ["(?:live|lives|living|located|based|stay|staying|reside|move|relocat)\\w*.{0,40}(?:anywhere|far|rural|island|countryside|away|another (?:town|city|country)|wherever|remote|abroad)", near("hire|recruit\\w*|employ\\w*|work(?:ing)?", "anywhere|wherever|any(?:\\W+\\w+){0,1} (?:country|location|place)|rural|island|abroad|far away", 3)] },
            ],
            sample: "There is no daily commute, so it saves time and money. They can also work flexible hours, so the work can fit around family life.",
            model: "<ul><li>No commute (cause), so travel time and costs are saved (effect) (1)</li><li>Flexible hours (cause), so work can fit around family and life (effect) (1)</li></ul><p>Also acceptable: can live far from the company, for example in a rural area, because files are reached over the internet. Isolation and security of files at home are drawbacks, not benefits.</p>",
          },
        ],
      },
      {
        id: "tech-09",
        style: "Scenario question · explain and identify (industry)",
        stem:
          "<p>A company makes artificial-limb covers that are shaped to each patient. It designs every cover in CAD and makes the pieces on a 3D printer. It also cuts packaging for the covers from card on a laser cutter, and sells to hospitals in several countries.</p>",
        parts: [
          {
            label: "(a)", type: "text", marks: 2, rows: 5,
            q: "Explain <strong>two</strong> ways that CAD and 3D printing make one-off covers practical for the company.",
            minWords: 14,
            points: [
              { desc: "The CAD model is easy to edit, so one dimension can be changed to fit each patient without drawing it all again", group: "c1",
                win: 90,
                all: [near("edit\\w*|chang\\w*|alter\\w*|adjust\\w*|modif\\w*|amend\\w*|updat\\w*|tweak\\w*|resiz\\w*|scal\\w*|customis\\w*|personalis\\w*|adapt\\w*|reshap\\w*", "models?|dimensions?|sizes?|measurements?|cad|files?|parameters?|covers?|shapes?|design|drawing|software|it", 5) + "|\\bparametric\\b", near("patients?|each|every|individual|custom\\w*|person\\w*|suit\\w*|different|one-?off|single|match\\w*|limbs?", "patients?|cover|covers|fit|suit\\w*|size|person\\w*", 1)] },
              { desc: "CAD edits easily, so one model can be altered for each patient", group: "c1",
                any: ["\\bcad\\b.{0,40}\\b(?:edit\\w*|chang\\w*|adjust\\w*|alter\\w*|resiz\\w*|modif\\w*)\\W+(?:\\w+\\W+){0,1}(?:easil\\w*|quick\\w*|simpl\\w*|fast\\w*)", "\\b(?:easy|quick|simple|fast)\\W+(?:\\w+\\W+){0,1}to\\W+(?:edit|chang|adjust|alter|modif|resiz|scale|tweak)\\w*"] },
              { desc: "A 3D printer needs no special tooling, so a single cover can be printed straight from the model without extra cost", group: "c2", negOK: true,
                not: ["\\b(?:needs?|requires?)\\W+(?:expensive|special|costly|new|specific|different)\\W+(?:\\w+\\W+){0,1}(?:tool\\w*|mou?lds?)", "\\b(?:do|does|will|would)\\W+need\\W+(?:\\w+\\W+){0,2}(?:tool\\w*|mou?lds?)"],
                any: [near("no|nothing|without|avoid\\w*|eliminat\\w*", "tool\\w*|tooling|mou?lds?|jigs?", 3), "(?:tooled|tooling)\\W+up", "\\b(?:single|one-?off|individual|one)\\W+(?:\\w+\\W+){0,4}(?:econom\\w*|cheap\\w*|affordabl\\w*|cost-?effective|inexpensive)", near("no|without|avoid\\w*|eliminat\\w*", "special|set-?up|machine\\w*", 1), "(?:does not|doesn'?t|don'?t|do not)\\W+need\\W+(?:\\w+\\W+){0,1}(?:tool\\w*|mou?lds?|special|set-?up|jigs?)"] },
              { desc: "A prototype can be printed within hours, so the fit is checked and improved sooner", group: "c3",
                any: [near("prototype\\w*|tests?|trials?|check\\w*", "hours|quick\\w*|days|fast\\w*|sooner|early|straight away|rapid\\w*", 6)] },
            ],
            sample: "The designer can edit the dimensions in the CAD model, so each cover can be adjusted to suit a patient without being drawn again from scratch. A 3D printer also needs no special tooling or moulds, so a single cover can be printed straight from the model without a high cost.",
            model: "<ul><li>The CAD model is parametric, so editing a dimension reshapes the cover for each patient without redrawing (1)</li><li>3D printing needs no special tooling, so a single one-off cover can be printed straight from the model economically (1)</li></ul><p>Also acceptable: a prototype can be printed in hours so the fit is tested and improved sooner. &quot;It is faster&quot; or &quot;it is customised&quot; on their own earn nothing.</p>",
          },
          {
            label: "(b)", type: "mcq", marks: 1, a: 0,
            q: "CAM software arranges the packaging parts tightly on a sheet of card before the laser cutter runs, to leave less offcut. What is this called?",
            opts: ["Nesting", "Rendering", "Cropping", "Mirroring"],
            why: "Nesting packs the parts close together on the sheet so less material is wasted. Rendering makes a realistic image, cropping trims an image, and mirroring copies a feature across a plane.",
          },
          {
            label: "(c)", type: "mcq", marks: 1, a: 3,
            q: "The company's hospital leaflets must be understood in every country it sells to. Which approach helps without any translation?",
            opts: [
              "Using one colour that is chosen to mean the same everywhere",
              "Sending the leaflets as native CAD files",
              "Writing the leaflets in English only and checking spelling",
              "Using pictograms and exploded assembly diagrams to show how to fit the cover",
            ],
            why: "Graphics instead of words (pictograms, icons, exploded views) explain a product without language. Colours and symbols can mean different things in different countries, so they have to be checked for each market, and native CAD files are not a leaflet at all.",
          },
        ],
      },
    ],
  };
  /* ---- Hardening pass: wider paraphrase, negative phrasings, and a veto on and-joined piles of key words. ----
     These helpers only add alternatives to the points above; they never remove a requirement. */
  const TP = (id, i) => B.tech.questions.find((q) => q.id === id).parts[i];
  /* more(): extra `any` alternatives on a point that is `any`-only. */
  const more = (id, i, k, any, negOK) => { const pt = TP(id, i).points[k]; pt.any = (pt.any || []).concat(any); if (negOK) pt.negOK = true; };
  /* alt(): another way to say the j-th required half of an `all` point. */
  const alt = (id, i, k, j, src) => { TP(id, i).points[k].all[j] += "|" + src; };
  /* add(): a further acceptable point (give it the same `group` as the idea it repeats). */
  const add = (id, i, pt) => TP(id, i).points.push(pt);
  /* An explanation is prose: five "and"/"or" joins a few letters apart is a pile of nouns, not a clause. */
  const STUFF = "(?:\\b(?:and|or)\\b[^.;,]{1,24}){5,}";
  const noStuff = (id, i) => TP(id, i).points.forEach((pt) => { pt.not = (pt.not || []).concat(STUFF); });

  /* tech-01(d) */
  more("tech-01", 3, 0, [
    "\\bstays? (?:exactly )?(?:the )?same\\b|\\b(?:stays?|remains?) (?:sharp|crisp|clear|perfect|intact|unchanged)\\b|\\bkeeps? (?:its|the|their) (?:quality|sharpness|detail|clarity)\\b|\\bno matter how many\\b|\\bhowever many\\b",
    "\\b(?:quality|detail|sharpness|resolution|pixels?|clarity)\\W+(?:\\w+\\W+){0,3}(?:not|n'?t|never)\\W+(?:\\w+\\W+){0,2}(?:reduced|lowered|affected|worse|degraded|damaged|changed|diminished|lost)\\b",
  ], true);
  alt("tech-01", 3, 1, 1, "\\b(?:pixelated|blocky|blurr?y|blurred|fuzzy|worse|grainy|jagged|lower quality|poorer quality)\\b|\\bquality\\W+(?:\\w+\\W+){0,2}(?:drops?|falls?|suffers?|reduced|lost|goes down|decreases?)\\b");

  /* tech-02(b) */
  add("tech-02", 1, { desc: "STEP is neutral, so almost any CAD package can open it, including the manufacturer's different software", group: "a",
    all: ["\\b(?:universal\\w*|open standard|industry standard|standard format|common (?:file )?format|common file|compatible|interoperab\\w*|understood)\\b", "\\b(?:packages?|software|programs?|cad|manufacturer|different|any|every|most|lots|many|rival|other|read|open\\w*|import\\w*)\\b"], win: 90,
    not: ["\\bstep\\W+(?:\\w+\\W+){0,3}(?:only|own|cannot|can'?t|not|won'?t|unable)", "\\bnative\\W+(?:\\w+\\W+){0,3}(?:universal|compatible|open standard|common)"] });
  alt("tech-02", 1, 2, 1, "\\b(?:does ?n'?t|does not|do ?n'?t|do not) matter\\W+(?:\\w+\\W+){0,3}(?:software|program|package|cad|make|brand)\\b|\\bany (?:make|brand|kind|type|sort) of (?:software|cad|package|program)\\b");

  /* tech-03(b) */
  TP("tech-03", 1).points[0].not[1] = TP("tech-03", 1).points[0].not[1].replace("{0,4}(?:does ?n'?t", "{0,7}(?:does ?n'?t");
  noStuff("tech-03", 1);

  /* tech-04(b) */
  more("tech-04", 1, 0, [
    "\\b(?:say|show|tell|describe|explain|indicate)s?\\W+(?:\\w+\\W+){0,3}(?:what|which)\\W+(?:\\w+\\W+){0,3}(?:in|is|are|shows?|contains?|about|of|inside)\\b",
    "\\bnames?\\W+(?:should |must |need to |ought to |to |can |will )?(?:be |become |being )?(?:\\w+\\W+){0,1}(?:descriptive|meaningful|clear|informative|sensible|obvious|specific|useful|helpful)\\b",
    "\\bwithout\\W+(?:\\w+\\W+){0,1}(?:opening|open)\\b|\\bknow\\W+(?:\\w+\\W+){0,2}(?:content|contents|what)\\b",
    "\\bnames?\\W+(?:\\w+\\W+){0,6}(?:job|project|client|stage|content|item|subject)\\b",
  ]);
  more("tech-04", 1, 4, [
    "\\b(?:stop|quit|cease|ditch|drop|remove|get rid of|take out|leave out|miss out)\\W+(?:using|putting|having|including)?\\W*(?:the |any |all |these |those )?(?:\\w+\\W+){0,2}(?:spaces|symbols|brackets|slashes|special|characters|punctuation)\\b",
    "\\bspecial (?:characters|symbols)\\b|\\bno (?:characters|punctuation)\\b",
  ]);

  /* tech-05(b) */
  add("tech-05", 1, { desc: "Cause and effect: a small, low-ppi copy cannot be printed or enlarged without looking pixelated or blurry", group: "p",
    all: ["\\b(?:small|low|tiny|poor|reduced|lower|thumbnails?|previews?|resolution)\\b", "\\b(?:print\\w*|enlarg\\w*|poster\\w*|blow\\w*|big|bigger|large|larger|full[- ]size|steal\\w*|cop(?:y|ying)|download\\w*)\\b", "(?:no|any) (?:use|good)\\b|\\buseless|\\bunusable|\\bunsuitable|\\bnot (?:good|big|sharp|clear|suitable|usable|much use)\\b|\\bpoor\\b|\\bbad\\b|\\bblurr?y|\\bpixel\\w*|\\bgrain\\w*|\\bfuzzy|\\bcan'?t\\b|\\bcannot\\b|\\bunable\\b|\\bwon'?t\\b|\\bwouldn'?t\\b|\\bimpossible|\\btoo (?:small|low|poor)"], win: 70, negOK: true,
    not: ["\\b(?:can|could|will|would)\\W+(?:\\w+\\W+){0,2}(?:print\\w*|enlarg\\w*|blow\\w*)\\W+(?:\\w+\\W+){0,3}(?:fine|well|perfectly|clearly|sharp\\w*|without (?:a )?problem)"] });
  add("tech-05", 1, { desc: "Cause and effect: a small, low-ppi copy cannot be printed or enlarged without looking pixelated or blurry", group: "p",
    all: ["\\btoo\\W+(?:\\w+\\W+){0,3}(?:for|to)\\W+(?:\\w+\\W+){0,5}(?:print\\w*|enlarg\\w*|poster\\w*|large|big|sell|publish|commercial)"], win: 70 });
  const NOCOPY = "\\b(?:no ?one|nobody|no-one|people|customers?|anyone|others?|thieves|they|users?)\\b\\W+(?:\\w+\\W+){0,2}\\b(?:can'?t|cannot|unable|couldn'?t|won'?t|not able)\\b\\W+(?:\\w+\\W+){0,3}\\b(?:steal|stealing|copy|take|use|pirate)\\w*|\\b(?:stops?|prevents?|preventing|stopping|protects?)\\b\\W+(?:\\w+\\W+){0,3}\\b(?:steal\\w*|theft|copy\\w*|pirat\\w*|download\\w*|taking|using)\\b";
  add("tech-05", 1, { desc: "Customers must pay or buy a licence to get the full-quality file, so her income is protected", group: "q",
    all: [NOCOPY, "\\b(?:full|high|original|proper|real|actual|good|decent|better|large|quality|photographs?|photos?|images?|pictures?|work|files?)\\b"], win: 80, negOK: true,
    not: ["\\b(?:not|n'?t|never|no need)\\W+(?:\\w+\\W+){0,3}(?:pay|paid|paying|buy|buying|purchas\\w*|licen[cs]e)"] });
  { const q = TP("tech-05", 1).points[1];
    q.not[1] = q.not[1].replace("never|without)", "never|without|stops?|stopped|stopping|prevent\\w*|avoid\\w*|unable to|so (?:they|people|nobody|no ?one))"); }

  /* tech-05(c) */
  alt("tech-05", 2, 0, 0, "\\b(?:turn\\w*|chang\\w*|convert\\w*|transform\\w*|translat\\w*)\\W+(?:\\w+\\W+){0,4}(?:into|to)\\W+(?:\\w+\\W+){0,2}(?:code|cipher|gibberish|nonsense|random|characters|symbols)\\b|\\brandom (?:letters|characters|symbols|data)\\b|\\b(?:un)?lock\\w*|\\bhidden\\b|\\bprotected with\\b");
  alt("tech-05", 2, 0, 1, "\\b(?:only|without|unless|except)\\b\\W+(?:\\w+\\W+){0,6}\\b(?:key|keys|password|passcode|decrypt\\w*|decod\\w*|unlock\\w*)\\b|\\b(?:cannot|can'?t|couldn'?t|unable|not able)\\b\\W+(?:\\w+\\W+){0,3}\\b(?:open\\w*|view\\w*|see|understand|access\\w*|decipher|decode|crack\\w*|read|make sense)\\b|\\bno sense\\b");

  /* tech-06(b) */
  alt("tech-06", 1, 0, 0, "\\b(?:laser|scanner|scan)s?\\W+(?:\\w+\\W+){0,3}(?:measur\\w*|captur\\w*|record\\w*|map\\w*)\\W+(?:\\w+\\W+){0,3}(?:surface|shape|object|wheel|spokes?|carvings?)\\b");

  /* tech-07(a) */
  add("tech-07", 0, { desc: "Training: the staff need time to learn the software, delaying useful work and costing money", group: "l2",
    all: ["\\b(?:train\\w*|courses?|lessons?|learn\\w*)\\b", "\\b(?:pay\\w*|cost\\w*|expens\\w*|money|afford\\w*|fees?|price|paid|spend\\w*|delay\\w*|slow\\w*)\\b"], win: 60,
    not: TP("tech-07", 0).points[1].not.slice() });
  add("tech-07", 0, { desc: "Training: the staff need time to learn the software, delaying useful work and costing money", group: "l2", negOK: true,
    any: ["\\blearning curve\\b", "\\b(?:hard|difficult|complex|complicated|tricky|steep)\\W+(?:\\w+\\W+){0,3}(?:to learn|to master|to use)\\b"],
    not: ["\\b(?:no|not|easy|gentle|small|short|quick|shallow)\\W+(?:\\w+\\W+){0,2}learning curve|learning curve\\W+(?:\\w+\\W+){0,2}(?:is|are)\\W+(?:\\w+\\W+){0,1}(?:easy|short|gentle|quick|small)"] });
  { const l2 = TP("tech-07", 0).points[1]; l2.all[0] += "|\\b(?:train\\w*|learn\\w*)\\b\\W+(?:\\w+\\W+){0,4}\\b(?:delay\\w*|slow\\w*|hold\\w*|wast\\w*)"; }

  /* tech-07(b) */
  more("tech-07", 1, 0, [
    "\\b(?:inexpensive|cheap\\w*|low[- ]cost|cost[- ]effective)\\b",
  ]);
  TP("tech-07", 1).points[0].not.push("\\b(?:cad|computers?|software)\\b\\W+(?:\\w+\\W+){0,3}(?:cheap\\w*|inexpensive)");
  more("tech-07", 1, 1, [
    "\\b(?:sketch\\w*|drawing|pencil|paper|hand)\\W+(?:\\w+\\W+){0,4}(?:quick\\w*|fast\\w*|rapid\\w*|speedy|instant\\w*|immediate\\w*)\\b",
    "\\b(?:quick\\w*|faster|fast\\w*|rapid\\w*|instant\\w*)\\W+(?:\\w+\\W+){0,6}(?:sketch\\w*|pencil|paper|by hand|draw\\w*)\\b",
    "\\bfaster than\\W+(?:\\w+\\W+){0,1}(?:opening|booting|starting|loading|setting up|using|waiting)\\W+(?:\\w+\\W+){0,2}(?:software|cad|computer|program|package)\\b",
  ]);
  TP("tech-07", 1).points[1].negOK = true;
  TP("tech-07", 1).points[1].not = ["\\b(?:not|n'?t|never)\\W+(?:\\w+\\W+){0,2}(?:quick\\w*|fast\\w*|rapid\\w*)", "\\b(?:cad|computers?|software)\\b\\W+(?:\\w+\\W+){0,4}(?:quick\\w*|fast\\w*)", "\\b(?:slow\\w*|slower|takes? (?:too |a )?long)\\b"];

  /* tech-08(b) */
  more("tech-08", 1, 0, [
    "\\b(?:sav\\w*|cheaper|cuts?|reduc\\w*)\\W+(?:\\w+\\W+){0,6}(?:commut\\w*|travel\\w*|journey\\w*|petrol|fuel|fares?|driving)",
    "\\b(?:avoid\\w*|miss\\w*|escape\\w*|beat|skip\\w*)\\W+(?:the |all |that )?(?:\\w+\\W+){0,1}(?:traffic|rush hour|congestion|jams?|queues|crowds)\\b",
    "\\b(?:not|n'?t)\\W+(?:\\w+\\W+){0,2}(?:sit|sitting|stuck|queue|queuing|spend)\\W+(?:\\w+\\W+){0,3}(?:traffic|rush hour|congestion|jams?|queues|trains?|buses|commut\\w*|travel\\w*)",
  ], true);
  more("tech-08", 1, 1, TP("tech-08", 1).points[0].any.slice(0, 0));
  more("tech-08", 1, 2, [
    "\\b(?:organi[sz]\\w*|manag\\w*|control\\w*|plan\\w*|arrang\\w*|pick\\w*|choose|set|decide|select)\\W+(?:\\w+\\W+){0,2}(?:own|their|his|her|flexible)\\W+(?:\\w+\\W+){0,1}(?:hours|time|days|schedule|working|shifts)\\b",
    "\\bflexib\\w*\\W+(?:\\w+\\W+){0,2}(?:hours?|working|work|schedules?|times?|day|days|lives?|life|arrangements?)\\b",
    "\\b(?:work|working|start|finish)\\W+(?:\\w+\\W+){0,2}(?:when|whenever|what time)\\W+(?:they|he|she)\\W+(?:want|like|choose|please|wish)",
  ]);
  more("tech-08", 1, 3, TP("tech-08", 1).points[2].any.slice(0, 0));
  more("tech-08", 1, 4, [
    "\\b(?:live|living|lives)\\W+(?:\\w+\\W+){0,3}(?:anywhere|wherever|countryside|rural|island|abroad|away|far)\\b",
  ]);

  /* tech-09(a) */
  TP("tech-09", 0).points[0].negOK = true;
  alt("tech-09", 0, 0, 1, "\\b(?:fit\\w*|suit\\w*|adjust\\w*|adapt\\w*|custom\\w*|person\\w*|tailor\\w*|match\\w*)\\W+(?:\\w+\\W+){0,4}\\b(?:patients?|customers?|limbs?|person|user|client)\\b|\\b(?:next|new|another|different|every|each|any|individual)\\W+(?:\\w+\\W+){0,1}(?:patients?|customers?|limbs?|person|user)\\b");
  /* ---- Hardening, part 2: synonym gaps and swap vetoes, checked against hand-written student answers. ---- */

  const noList = (P) => P.forEach((pt) => { pt.not = (pt.not || []).concat(["(?:,\\s*[a-z' -]{1,22}){6,}"]); });
  const nonEmpty = (a) => a || [];

  /* tech-01(d): repeated saving, and negated "PNG compresses without losing anything" */
  { const P = TP("tech-01", 3).points;
    const REP = "|re-?sav\\w*|\\bresav\\w*|number of times|\\bgradually\\b|over time|builds? up|\\bafter\\W+(?:\\w+\\W+){0,2}(?:few|couple|several|many|lots)\\W+(?:\\w+\\W+){0,1}(?:edits?|saves?|saving)|\\b(?:every|each)\\W+(?:\\w+\\W+){0,1}(?:re-?sav\\w*|save|edit)|as often as|every single";
    P[1].all[2] += REP;
    P[1].all[1] += "|\\bgo(?:es)? down\\b|\\bgets? (?:lower|worse|poorer)\\b|\\bdecreas\\w*|\\bdecline\\w*|\\bdeteriorat\\w*|\\bdegrad\\w*|\\bartefacts?\\b|\\bartifacts?\\b";
    [P[0], P[1]].forEach((p) => {
      p.not = p.not.slice();
      p.not[3] = "\\bpngs?\\W+(?:also |still |always |will |would |can |actually )?(?:throws?|loses?|discards?|degrades?|damages?|compresses|blurs?)\\b(?!\\W+(?:\\w+\\W+){0,3}(?:nothing|no|none|any|without)\\b)";
      p.not[7] = "\\bjpe?gs?\\W+(?:\\w+\\W+){0,3}(?:not|n'?t|never|no)\\b(?!\\W+like\\b)\\W+(?:\\w+\\W+){0,3}(?:lose|lost|loss|degrad\\w*|discard\\w*|throw\\w*|damag\\w*|worse|blur\\w*|blocky|pixelated)";
      p.not.push("\\bvector\\b|\\bscal(?:e|ed|able|ing)\\b");
    });
    P[0].any = P[0].any.concat([
      "\\b(?:quality|detail|sharpness|resolution|pixels?|clarity|image|logo)\\W+(?:\\w+\\W+){0,3}(?:not|n'?t|never)\\W+(?:\\w+\\W+){0,2}(?:drop\\w*|fall\\w*|suffer\\w*|go down|decreas\\w*|declin\\w*|get lower|affected)",
      "\\b(?:do(?:es)?|did) no harm\\b|\\bno harm\\b|\\bevery pixel\\b|\\ball (?:the )?(?:pixels?|detail|data|information)\\b|\\bnothing (?:is |gets |being )?(?:removed|lost|thrown|discarded|taken)\\b|\\bnone of the (?:quality|detail|data|information)\\b|\\bstays? (?:sharp|crisp|perfect)|\\bnever (?:degrades?|deteriorates?|gets? worse)|\\b(?:perfect|unchanged|identical)\\b"]);
  }

  /* tech-02(b): neutral format phrased many ways */
  { const NATIVE_WRONG = ["\\bstep\\W+(?:\\w+\\W+){0,3}(?:cannot|can'?t|unable|won'?t)\\W+(?:\\w+\\W+){0,3}(?:open|read|import)", "\\bnative\\W+(?:\\w+\\W+){0,4}(?:is|are)\\W+(?:\\w+\\W+){0,2}(?:universal|neutral|compatible|open standard)", "\\bstep\\W+(?:\\w+\\W+){0,3}(?:only|just)\\W+(?:\\w+\\W+){0,3}(?:studio|own|this|one)\\b", "\\bstep\\W+(?:is|are)\\W+(?:\\w+\\W+){0,3}native\\W+(?:\\w+\\W+){0,3}(?:manufacturer|their|gdansk)"];
    const DIFF = "(?:different|any|other|rival|many|various|every|all|most|several|whichever|whatever|another|multiple|lots of|nearly all|almost all)";
    const SW = "(?:software|cad|packages?|programs?|systems?|makes?|brands?|applications?)";
    add("tech-02", 1, { desc: "STEP is neutral, so almost any CAD package can open it, including the manufacturer's different software", group: "a", negOK: true, any: [
      "\\bstep\\b[^.]{0,80}?(?:neutral|universal\\w*|standard|independent|non-?proprietary|compatible|interoperab\\w*|exchange\\w*)[^.]{0,80}?" + DIFF + "\\W+(?:\\w+\\W+){0,3}" + SW,
      "(?:neutral|universal\\w*|standard|independent|non-?proprietary|open)\\W+(?:\\w+\\W+){0,6}(?:so|which means|meaning|therefore|that)\\W+(?:\\w+\\W+){0,6}(?:manufacturer|they|firm|company|gdansk)\\W+(?:\\w+\\W+){0,3}(?:can|could|will|able)\\W+(?:\\w+\\W+){0,3}(?:open|read|use|import)",
      "\\bstep\\b\\W+(?:\\w+\\W+){0,8}(?:exchang\\w*|shar\\w*|transfer\\w*|swap\\w*)\\W+(?:\\w+\\W+){0,6}(?:between|across|among)\\W+(?:\\w+\\W+){0,3}" + DIFF + "\\W+(?:\\w+\\W+){0,2}" + SW,
      "\\bstep\\b[^.]{0,40}(?:not|n'?t)\\W+(?:\\w+\\W+){0,3}(?:tied|specific|limited|locked|restricted|dependent)\\W+(?:\\w+\\W+){0,3}(?:to\\W+)?(?:one|a single|any|particular|specific|make|brand)|" + SW + "[- ]independent|independent of (?:the )?" + SW + "|\\b(?:isn'?t|is not|not)\\W+(?:\\w+\\W+){0,2}(?:tied|specific|limited|locked)\\W+(?:\\w+\\W+){0,2}(?:to\\W+)?(?:one|a single|any|particular|a)\\W+(?:\\w+\\W+){0,2}(?:make|brand|software|package|program)",
      "\\bstep\\b\\W+(?:\\w+\\W+){0,5}(?:can be|is|are)\\W+(?:\\w+\\W+){0,2}(?:read|opened|imported|understood|supported)\\W+(?:\\w+\\W+){0,4}(?:by|in|with)\\W+(?:\\w+\\W+){0,3}" + DIFF,
      "(?:neutral|universal|standard|common)\\W+(?:\\w+\\W+){0,3}step\\W+(?:\\w+\\W+){0,8}(?:they|manufacturer)\\W+(?:\\w+\\W+){0,2}(?:can|could|will)\\W+(?:\\w+\\W+){0,2}(?:open|read|use)",
      "\\bdifferent\\W+(?:cad\\W+)?(?:systems?|packages?|programs?|software)\\W+(?:\\w+\\W+){0,3}(?:share|read|open|use|import)",
      "\\bstep\\b[^.]{0,60}(?:whichever|whatever|regardless of which|no matter which)\\W+(?:\\w+\\W+){0,3}" + SW,
      "\\bstep\\b[^.]{0,30}(?:supported|accepted|recogni[sz]ed|understood|read)\\W+(?:\\w+\\W+){0,3}by\\W+(?:\\w+\\W+){0,2}(?:nearly|almost|most|all|every|many)"],
      not: NATIVE_WRONG.concat(["\\b(?:native|studio'?s own|own format)\\W+(?:\\w+\\W+){0,4}(?:works|opens?|compatible)\\W+(?:\\w+\\W+){0,4}(?:any|all|every|most|many)"]) }); }

  /* tech-03(b): cause words that stay close to "copied to everyone's devices", effect "nobody has a clean copy" */
  { const P = TP("tech-03", 1).points;
    P[0].all[1] = P[0].all[1].replace("(?:copi(?:ed|es)|copy|", "(?:copi(?:ed|es)|copy|puts?|pushe?s?|does the same|also happens|") ;
    P[1].any = P[1].any.concat([
      "\\b(?:nobody|no ?one|none of (?:them|the devices))\\W+(?:\\w+\\W+){0,3}(?:has|have|keeps?|holds?|left)\\W+(?:\\w+\\W+){0,3}(?:copy|copies|version|file|drawings?|it)",
      "\\b(?:no|not any)\\W+(?:\\w+\\W+){0,2}(?:clean|good|safe|untouched|original|intact|spare|old|earlier|previous)\\W+(?:copy|copies|version|file)",
      "\\b(?:lose|lost|loses|losing)\\W+(?:\\w+\\W+){0,3}(?:everything|all (?:of )?(?:it|the|their)|the (?:work|drawings|files|data|lot)|block c)",
      "\\b(?:gone|lost|deleted)\\W+(?:\\w+\\W+){0,3}(?:everywhere|from (?:all|every)|on (?:all|every))",
      "\\bwould be (?:gone|lost)\\b|\\bcould (?:be lost|lose)\\b|\\bwill be (?:gone|lost)\\b"]);
    P[3].negOK = true; }

  /* tech-04(b): file-name improvements */
  { more("tech-04", 1, 0, [
      "\\b(?:saying|showing|telling|describing|indicating)\\W+(?:\\w+\\W+){0,3}(?:what|which)\\b",
      "\\b(?:replace|rename|change)\\w*\\W+(?:\\w+\\W+){0,6}(?:img_?\\d+|new drawing|poster)",
      "\\bdescri(?:be|bes|bing|ption)\\W+(?:of\\W+)?(?:\\w+\\W+){0,6}(?:photo|project|content|drawing|file|job|inside)",
      "\\b(?:naming|named|name)\\w*\\W+(?:\\w+\\W+){0,3}(?:after|with|using)\\W+(?:\\w+\\W+){0,3}(?:project|job|client|item|stage|content)",
      "\\b(?:include|add|put)\\w*\\W+(?:\\w+\\W+){0,3}(?:job|project|client|stage|item|content)",
      "\\bwhat the (?:file|drawing|photo|document|image)\\W+(?:is|shows|contains)\\b",
      "\\b(?:meaningful|descriptive|clear|informative)\\W+(?:\\w+\\W+){0,2}(?:names?|file ?names?)|\\bnames?\\W+(?:\\w+\\W+){0,3}(?:descriptive|meaningful|informative)"]);
    more("tech-04", 1, 1, [
      "\\b(?:numbered|numbering|incrementing|increasing|rising|sequential|ascending)\\W+(?:\\w+\\W+){0,2}(?:versions?|v\\d+|numbers?)|\\bnumber\\w*\\W+(?:the\\W+)?versions?|versions?\\W+(?:\\w+\\W+){0,3}(?:increase\\w*|rise|rising|go(?:es)? up|increment\\w*|in order|numbered|ascending)|\\bv0?\\d\\b\\W+(?:\\w+\\W+){0,6}v0?\\d|\\bversion numbers?\\b"]);
    more("tech-04", 1, 2, [
      "\\b(?:agree\\w*|standard|same|consistent|common|set|fixed|uniform|one)\\W+(?:\\w+\\W+){0,3}(?:pattern|convention|format|structure|system|order|scheme|rules?|way|naming)",
      "\\b(?:pattern|convention|structure|format|scheme)\\W+(?:\\w+\\W+){0,5}(?:every|all|each)\\W+(?:\\w+\\W+){0,1}(?:file|name)",
      "\\b[a-z]+[_-][a-z]+[_-][a-z]+[_-]\\w+\\b|\\bjob\\W+(?:then\\W+)?item\\W+(?:then\\W+)?(?:stage|date)",
      "\\b(?:every|all|each)\\W+(?:file|name)s?\\W+(?:\\w+\\W+){0,4}(?:same|consistent|pattern|format|structure)",
      "\\balways\\W+(?:\\w+\\W+){0,6}\\bthen\\b"]);
    more("tech-04", 1, 3, [
      "\\byear\\W+(?:first|then|month)|\\byear\\W+month\\W+day|\\byyyy",
      "\\bdates?\\W+(?:\\w+\\W+){0,8}(?:year[- ]first|sort|chronolog\\w*|date order|in order|ordered|list)",
      "\\b(?:sort|list|order)\\w*\\W+(?:\\w+\\W+){0,4}(?:by )?date|chronolog\\w*"]);
    more("tech-04", 1, 4, [
      "\\bno\\W+(?:\\w+\\W+){0,1}(?:spaces|brackets|symbols|special)",
      "\\b(?:drop|remove|take out)\\W+(?:\\w+\\W+){0,3}(?:brackets|spaces|symbols)"]); }

  /* tech-05(b): why low-resolution previews help the photographer */
  { const P = TP("tech-05", 1).points;
    P[0].any = P[0].any.concat([
      "\\b(?:blurr\\w*|pixel\\w*|blocky|rubbish|poor|bad|jagged|fuzzy|grainy|unusable|useless)\\W+(?:\\w+\\W+){0,8}(?:print\\w*|enlarg\\w*|large|big|blown|blow\\w*)",
      "\\b(?:print\\w*|enlarg\\w*|blown up|blow\\w*)\\W+(?:\\w+\\W+){0,8}(?:blurr\\w*|pixel\\w*|blocky|fuzzy|rubbish|poor|bad|jagged|grainy)",
      "\\b(?:stolen|copied|copy|copies|preview\\w*|saved|downloaded|thief)\\W+(?:\\w+\\W+){0,6}(?:poor|low|bad|blurry|small|blocky)\\W+(?:\\w+\\W+){0,2}(?:quality|resolution)|\\b(?:poor|low|bad)\\W+(?:quality|resolution)\\W+(?:\\w+\\W+){0,6}(?:stolen|copy|copies|copied|saved|downloaded|preview)",
      "\\b(?:too|so)\\W+(?:poor|low|small|bad)\\W+(?:\\w+\\W+){0,3}(?:use|useful|print\\w*)|\\b(?:of|is)\\W+(?:\\w+\\W+){0,2}(?:no|little|any) use\\b",
      "\\b(?:isn'?t|is not|not|n'?t)\\W+(?:\\w+\\W+){0,2}(?:good|big|large|sharp|high)\\W+enough\\W+(?:\\w+\\W+){0,2}(?:to\\W+)?(?:print|enlarg|use)",
      "\\b(?:low|small|poor)\\W+(?:\\w+\\W+){0,1}(?:resolution|res|ppi|quality)\\W+(?:\\w+\\W+){0,8}(?:poor|bad|worthless|blurry|blocky|pixelated|no good|no use|useless)"], true);
    P[1].any = P[1].any.concat([
      "\\b(?:have to|has to|must|need to|needs to|needed to|got to|will need to|would have to)\\W+(?:\\w+\\W+){0,2}(?:pay|buy|purchas\\w*)\\b",
      "\\b(?:buyers?|customers?|people|they|you)\\W+(?:\\w+\\W+){0,2}(?:pay|buy|purchas\\w*)\\W+(?:\\w+\\W+){0,6}(?:original|full|high|good|real|proper|file|version|photo|picture|image)",
      "\\b(?:copying|copied|steal\\w*|stolen|taking|using)\\W+(?:\\w+\\W+){0,4}(?:without pay\\w*|for nothing|without permission)",
      "\\b(?:only available|only given|only sent|only received|only get|only gets)\\W+(?:\\w+\\W+){0,4}(?:after|when|once)\\W+(?:\\w+\\W+){0,3}(?:pay\\w*|buy\\w*|purchas\\w*|order\\w*)",
      "\\b(?:doesn'?t|does not|won'?t|will not|not|n'?t)\\W+(?:\\w+\\W+){0,3}(?:lose|losing)\\W+(?:\\w+\\W+){0,3}(?:sales?|money|income|earnings)|\\b(?:sales?|income|earnings)\\W+(?:\\w+\\W+){0,3}(?:safe|protected|kept)"], true);
    P[1].not[1] = P[1].not[1].replace("stops?|stopped|stopping|", "stops?|stopped|stopping|protect\\w*|") ;
    P[4].negOK = true; }
})();
