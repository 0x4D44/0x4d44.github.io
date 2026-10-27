/* Past-paper practice: digital technology in graphic communication. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HGP_BANK = window.HGP_BANK || {});
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
              { desc: "Lossless keeps every pixel, so no detail or quality is lost each time it is saved", group: "ll",
                any: ["(every|each|all) pixel", "no (detail|quality|information|data)s? (is |are |gets |being |will be |has been )?(lost|discarded|thrown|removed)", "(keeps?|retains?|preserves?|restores?|stays?) (all|every|the (full|original|same))?\\s?(the )?(detail|quality|pixels|image|sharp)", "without (any )?(loss|losing|degrad)", "(does ?n'?t|does not|won'?t|will not|never|not) (lose|degrade|lower)", "(exact(ly)?|identical|perfect(ly)?) (the same|copy|as|to|restor)"] },
              { desc: "A JPEG throws detail away, so it gets worse each time it is re-saved (blocky edges on a logo)", group: "jp",
                all: ["jpe?g|lossy"],
                any: ["(lose|loses|losing|lost|discard|throw|throws|drop|drops|degrad|worse|blur|smear)", "block(y|iness)", "artefact", "artifact", "re-?sav"] },
              { desc: "Edits would pile up the loss: repeated editing and saving of a JPEG keeps lowering the quality", group: "ed",
                all: ["(each|every|repeated|again and again|many|several|more) ?(time|edit|save|re-?sav|saving)", "(lose|loses|lost|worse|lower|degrad|block|detail|quality|blur)"] },
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
                all: ["\\bneutral\\b|universal|compatible|(works?|opens?|reads?|imports?) (in|with|on) (any|most|almost|many|all|other)|(any|most|almost any|many|all) (cad|software|package|program)s?", "\\b(open|opens|opened|read|import|view|use|load)"] },
              { desc: "A native file may not open in the manufacturer's different package", group: "a",
                all: ["native|own (cad|software|package|format)|studio'?s? (cad|software|package|format)", "(not|cannot|can'?t|unable|won'?t|may not|might not|wouldn'?t).{0,25}(open|read|import|use)"] },
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
              { desc: "Cause: a deletion or mistake made on one device is copied to all the other devices", group: "c",
                all: ["delet|erase|overwr|mistake"],
                any: ["sync", "(every|all|each|other) (the )?(device|laptop|tablet|copy|copies|computer)s?", "(also|too) (delet|remov|gone|lost)"] },
              { desc: "Effect: the work is lost everywhere, with no untouched copy left", group: "e",
                any: ["(lost|gone|disappear|vanish|wiped) (from |on |for )?(everywhere|all|every|everyone)", "no (good |clean |other |untouched |safe )?copy", "nothing (is )?left", "(cannot|can'?t|unable to) (be )?(recover|restore|get (it |them )?back)", "(everyone|everybody) loses"] },
              { desc: "A separate back-up (such as an off-site copy) that sync cannot change would survive", group: "s",
                all: ["(separate|independent|off-?site|second|another|extra|different) (back-?up|copy)|3-2-1"],
                any: ["cannot|can'?t|not (be )?(touch|affect|chang|delet|mirror)|safe|surviv|unaffected|still (has|have|there|exist|safe)|if (the|a) (file|folder|laptop)"] },
            ],
            sample: "If somebody deletes a folder by mistake on one laptop, the cloud copies that deletion to every other device, so the drawings are gone everywhere. A separate back-up that the syncing cannot touch would still have the folder.",
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
                all: ["name", "(content|contains?|what (the |a )?file is|what it contains|what is in (it|the file)|says what|tells (you|someone|anyone|people) what|(job|client|item|stage) (name|and)|the item)"] },
              { desc: "Use version numbers that rise in order instead of 'final'", group: "n2",
                any: ["version", "\\bv0?\\d", "numbers? (that )?(go|goes|rise|increase|count)", "number(ed|ing)? (them|the files|each (file|draft|save))", "numbering"] },
              { desc: "Follow the same agreed pattern or order for every file", group: "n3",
                any: ["consisten", "same (order|pattern|format|structure|convention|style|system)", "agreed (pattern|convention|format|order|system)", "everyone (uses|follows)"] },
              { desc: "Dates written year first so they sort in date order", group: "n4",
                any: ["year.{0,20}first", "yyyy", "20\\d\\d-\\d\\d-\\d\\d", "dates?.{0,40}(sort|in order|order)"] },
              { desc: "Avoid spaces, brackets and symbols in names", group: "n5",
                any: ["(no|avoid|without|not use|don'?t use|do not use|instead of|rather than|remove).{0,25}(spaces|symbols|brackets|slashes|special)", "underscores?", "hyphens?"] },
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
              { desc: "Cause and effect: a small, low-ppi copy cannot be printed or enlarged without looking pixelated or blurry", group: "p",
                all: ["(preview|small|low|copy|copied|copies|download|save[sd]?|steal|take)", "(print|enlarg|blow|poster|bigger|larger)", "(pixel|blurry|blocky|poor|low quality|bad quality|not (sharp|good|usable)|fuzzy|pixelat|unusable|useless)"] },
              { desc: "Customers must pay or buy a licence to get the full-quality file, so her income is protected", group: "q",
                all: ["(pay|paid|buy|bought|purchas)", "(full|high|original|clean|proper|better|large).{0,25}(file|version|quality|resolution|image|photo|copy|size)"] },
            ],
            sample: "If someone copies a small preview, they cannot print it big because it would look pixelated and blurry. To get the high quality original they have to buy it, so the photographer still gets paid.",
            model: "<ul><li>A low-resolution copy has too few pixels to print or enlarge well, so a copied preview is of little use (1)</li><li>The full-resolution file is only supplied after payment (or a licence), so her income is protected (1)</li></ul><p>&quot;It stops theft&quot; on its own is not accepted: say what is prevented and why it matters.</p>",
          },
          {
            label: "(c)", type: "text", marks: 1, rows: 3,
            q: "Explain how encrypting the confidential CAD drawing protects it if the email is intercepted.",
            minWords: 6,
            points: [
              { desc: "The file is scrambled, so whoever intercepts it cannot read it without the key",
                any: ["scrambl", "unreadable", "(cannot|can'?t|could not|couldn'?t|unable to|not be able to|won'?t be able to) (be )?(read|open|understand|see|use)", "gibberish", "cipher", "coded"] },
            ],
            sample: "The drawing is scrambled into data that makes no sense, so someone who intercepts the email cannot read it without the key.",
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
              { desc: "It measures millions of points on the surface, so the complex shape is captured accurately without measuring each part by hand", group: "s1",
                all: ["(measures?|captures?|records?|maps?|scans?|reads?|takes?).{0,45}(points|surface|shape|curves?|detail|spokes?)", "(accurate|accurately|exact|exactly|precis|without (having to )?(measur|drawing)|no need to (measur|draw)|instead of measuring|all the (detail|curves))"] },
              { desc: "The scan becomes a mesh or point cloud in CAD, so a matching replacement can be machined or printed", group: "s2",
                all: ["cad|mesh|point cloud|import|convert|3d model", "(replacement|copy|copies|match|print|machin|manufactur|repair|recreate|reproduc|make|cut|duplicate)"] },
              { desc: "It copes with a complex shape that has no drawings, saving a long time", group: "s3",
                all: ["(no|without|don'?t have|do not have|missing|lack) (any )?(drawings?|plans?|dimensions?)", "(measur|captur|record|sensor|laser)"] },
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
              { desc: "Cost: software licences or subscriptions and powerful computers are expensive, a big start-up cost for a small studio", group: "l1",
                all: ["(expensive|costly|pricey|costs? (a lot|too much|\\w+ money|thousands)|afford|big (start-?up )?cost|start-?up cost)", "(software|licen[cs]e|subscription|computer|hardware|equipment|printer|plotter)"] },
              { desc: "Training: the staff need time to learn the software, delaying useful work and costing money", group: "l2",
                all: ["train|learn", "(\\btime\\b|weeks|months|cost|slow|delay|money|pay|before (they|staff|it)|until)"] },
              { desc: "Dependence: a power cut, crash or corrupt file stops work or loses hours of it", group: "l3",
                any: ["power ?(cut|failure|outage)", "(crash|corrupt)", "power (is )?(lost|off)", "(there is|there's|with) no (power|electricity)", "(computer|software|hardware|system|machine)s? (fails?|breaks? down|crash)"] },
              { desc: "Compatibility: native files may not open in another package, and neutral formats lose the feature history", group: "l4",
                all: ["native|neutral|step|iges", "(not|cannot|can'?t|unable|won'?t|lose|lost|loses).{0,25}(open|import|history|feature)"] },
              { desc: "Security: digital files are easy to hack, copy or damage with malware, so back-ups and protection are needed", group: "l5",
                all: ["(hack|stolen|steal|copied|malware|virus|theft|cyber)", "(file|design|drawing|model|data)s?"] },
            ],
            sample: "CAD software and the powerful computers to run it are expensive, which is a big start-up cost for a studio with only three people. The staff also have to be trained, and it takes weeks before they can produce drawings, so work is delayed.",
            model: "<ul><li>Cost: licences or subscriptions, powerful computers and output devices are expensive for a small studio (1)</li><li>Training: staff need time and money to learn the software before they can produce drawings (1)</li></ul><p>Also acceptable: dependence on power and hardware (a crash can lose hours of work); native files may not open in another package; digital files are easy to hack or copy so back-ups are needed. &quot;It is expensive&quot; earns the mark only when it says what is expensive.</p>",
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 4,
            q: "The owner says the staff will still sketch their first ideas by hand. Explain why this is sensible.",
            minWords: 10,
            points: [
              { desc: "Pencil and paper need no power, software or training, so they cost almost nothing", group: "m1",
                any: ["(no|without|doesn'?t need|does not need|not need|don'?t need|needs? no).{0,20}(power|electric|software|computer|training)", "\\bcheap", "costs? (nothing|very little|next to nothing)", "\\bfree\\b"] },
              { desc: "Freehand sketching is the quickest way to get an idea down, before it is lost", group: "m2",
                all: ["(quick|quickest|fast|faster|fastest|speed|rapid|immediate|straight away|instantly)", "(idea|ideas|concept|thought|thoughts|down|first)"] },
              { desc: "A sketch can be done anywhere, for example in a meeting or with a client, because it is portable", group: "m3",
                any: ["anywhere", "portable", "on ?site", "in a meeting", "in front of (a |the )?client", "any ?place"] },
            ],
            sample: "A pencil and paper need no power or software, so they cost almost nothing to use. It is also the quickest way to get a first idea down on paper before the thought is forgotten.",
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
                all: ["commut|travel", "(sav|time|cost|money|less|no need|fewer|fare|petrol|fuel)"] },
              { desc: "Flexible hours that fit around family and life", group: "r2",
                all: ["flexib", "(hours|family|life|children|childcare|fit|around)"] },
              { desc: "The designer can live far from the company, for example in a rural area", group: "r3",
                all: ["(live|lives|living|located|based|stay|staying).{0,40}(anywhere|far|rural|island|countryside|away|another (town|city|country)|wherever)"] },
            ],
            sample: "There is no daily commute, so the designer saves the time and the money they would have spent on travelling. They can also choose flexible hours, which means the work can fit around their family.",
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
                all: ["(edit|change|alter|adjust|modify|amend|update|tweak)", "(model|dimension|size|measurement|cad|file)"] },
              { desc: "A 3D printer needs no special tooling, so a single cover can be printed straight from the model without extra cost", group: "c2",
                all: ["print", "(no|without|doesn'?t need|does not need|not need|don'?t need|avoid).{0,30}(tool|tooling|mould|mold|special|set-?up|machine)"] },
              { desc: "A prototype can be printed within hours, so the fit is checked and improved sooner", group: "c3",
                all: ["(prototype|test|trial|check)", "(hours|quick|quickly|days|fast|sooner|early|straight away)"] },
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
})();
