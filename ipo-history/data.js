/* ==========================================================
   DECLARED EFFECTIVE — content model
   Plain-JS globals, in the house style of the almanac.
   ========================================================== */

/* ----- masthead stats ----- */
window.HERO_STATS = [
  { num: "1602", lab: "First public share offering (VOC)" },
  { num: "1933", lab: "The prospectus becomes law" },
  { num: "11", lab: "Core parts of a modern S-1" },
  { num: "~150", lab: "People who touch a big filing" },
];

/* ----- origins / timeline ----- */
window.TIMELINE = [
  {
    year: "1602",
    tag: "Amsterdam · the first float",
    title: "The VOC opens its books to everyone",
    body: [
      "The Dutch East India Company (Vereenigde Oostindische Compagnie) raises capital not from a tight circle of merchants but from the public at large. Its charter is blunt about it: Article 10 declares that <em>all the residents of these lands may buy shares in this Company</em> — no minimum, no maximum.",
      "When subscriptions close on 31 August, 1,143 investors — including a merchant's maid who pledged a hundred guilders against wages of fifty cents a day — have committed roughly 3.67 million guilders to the Amsterdam chamber. The charter is not a prospectus, but it is the first document to set out, in public, the terms on which strangers may own a piece of a company.",
    ],
  },
  {
    year: "1720",
    tag: "London · the cautionary tale",
    title: "The South Sea Bubble teaches the first lesson in disclosure",
    body: [
      "A century of joint-stock enthusiasm peaks and bursts. Promoters float ventures on little more than vibes — one is famously advertised as <em>a company for carrying on an undertaking of great advantage, but nobody to know what it is</em>.",
      "The wreckage produces Britain's Bubble Act and a durable idea: when you ask the public for money, what you say — and don't say — should be governed. The principle waits two more centuries for real teeth.",
    ],
  },
  {
    year: "1929",
    tag: "New York · the reckoning",
    title: "The Crash exposes a market with no rulebook",
    body: [
      "Before 1933, securities are policed state-by-state under a patchwork of <em>blue sky</em> laws — inconsistent, weakly enforced, easy to dodge. Issuers can sell almost anything on almost any story.",
      "When the bubble of the 1920s collapses, the absence of mandatory, standardized disclosure is named as a culprit. Congress goes looking for a fix.",
    ],
  },
  {
    year: "1933",
    tag: "Washington · the document is born",
    title: "The Securities Act invents the modern prospectus",
    body: [
      "Drafted by Benjamin Cohen, Thomas Corcoran and James Landis and signed by FDR, the <em>Truth in Securities Act</em> chooses a philosophy that still governs every IPO: <em>disclosure, not merit</em>. The government does not bless an investment as good — it forces the issuer to tell the truth, then lets investors decide.",
      "Every public offering must file a registration statement containing a prospectus: audited financials, the business, the management, the risks, the terms. Everyone who signs is strictly liable for material misstatements or omissions. The prospectus stops being a sales brochure and becomes a sworn document.",
    ],
  },
  {
    year: "1934 →",
    tag: "The machine",
    title: "The SEC, Form S-1, and EDGAR",
    body: [
      "The 1934 Act creates the Securities and Exchange Commission to run the system. The registration statement for a first-time issuer becomes <em>Form S-1</em>; the SEC reviews it and fires back <em>comment letters</em> until the disclosure satisfies them, then declares it effective.",
      "Since the 1990s every filing lands on EDGAR, public and searchable the moment it is submitted — which is why a company's worst risks and best secrets become front-page reading the day the S-1 drops.",
    ],
  },
];

/* ----- anatomy: parts of an S-1 ----- */
window.ANATOMY = [
  {
    n: "01",
    name: "Prospectus Summary",
    len: "5–10 pp",
    plain: "The elevator pitch",
    desc: [
      "The opening overview: who the company is, the market it's chasing, the headline financials, and the terms of the offering. It's the part most people actually read, so it's drafted and re-drafted obsessively.",
      "It always ends by pointing you, sternly, at the Risk Factors.",
    ],
    quote: "You should consider all the information contained in this prospectus before investing in our securities.",
  },
  {
    n: "02",
    name: "Risk Factors",
    len: "15–40 pp",
    plain: "Everything that could go wrong",
    desc: [
      "A long, plainly-worded catalogue of every material threat to the business — competition, customer concentration, dependence on a founder, regulation, debt, the possibility that the company never turns a profit.",
      "Under the disclosure regime, burying a material risk is how you get sued under Section 11. So companies disclose almost everything — sometimes to the point of absurdity (WeWork warned that its own CEO's pre-IPO interviews might have broken the rules).",
    ],
    quote: "Any investment in the securities offered hereby is speculative and involves a high degree of risk.",
  },
  {
    n: "03",
    name: "Use of Proceeds",
    len: "1–2 pp",
    plain: "What you'll do with the money",
    desc: [
      "A short but closely-read section: where the cash from the offering actually goes. \"General corporate purposes and working capital\" is the safe boilerplate.",
      "Investors read between the lines. Money earmarked to repay existing backers or cash out the founder reads very differently from money going into R&D and growth.",
    ],
    quote: "We intend to use the net proceeds for working capital and other general corporate purposes.",
  },
  {
    n: "04",
    name: "Management's Discussion & Analysis",
    len: "20–50 pp",
    plain: "The numbers, narrated",
    desc: [
      "The MD&A is management explaining its own financials in prose: why revenue moved, where the margins are, what's burning cash, and what the trends mean going forward.",
      "It's where aggressive or invented metrics get smuggled in — \"community-adjusted EBITDA\" was born here — and where careful readers catch the difference between a growth story and an accounting story.",
    ],
    quote: "The following discussion should be read together with our consolidated financial statements.",
  },
  {
    n: "05",
    name: "Business",
    len: "20–60 pp",
    plain: "What the company actually does",
    desc: [
      "The full description of the company: products, customers, technology, market size, competition, intellectual property, employees, properties, and regulatory environment.",
      "This is where the total-addressable-market charts live, and where founders most want to tell the story their way.",
    ],
    quote: "Our mission is to … (and here, sometimes, the trouble begins).",
  },
  {
    n: "06",
    name: "Management & Compensation",
    len: "10–25 pp",
    plain: "Who runs it, and for how much",
    desc: [
      "Bios of the executives and directors, board composition and independence, and the compensation tables that lay out exactly what the leadership is paid.",
      "Related-party transactions live here too — the loans, leases and side deals between the company and its insiders that have sunk more than one offering.",
    ],
    quote: "The following table sets forth information regarding our executive officers and directors.",
  },
  {
    n: "07",
    name: "Principal & Selling Stockholders",
    len: "3–6 pp",
    plain: "Who owns it before, and who's selling",
    desc: [
      "The ownership table: which funds, founders and insiders hold what, and who is selling into the offering versus holding on.",
      "Heavy insider selling at the IPO is a tell that markets do not miss.",
    ],
    quote: "The following table sets forth information with respect to the beneficial ownership of our shares.",
  },
  {
    n: "08",
    name: "Description of Capital Stock",
    len: "5–10 pp",
    plain: "The rights you're actually buying",
    desc: [
      "The legal mechanics of the shares: classes, voting rights, dividends, anti-takeover provisions.",
      "This is where dual-class structures live — the arrangement that lets founders sell economic ownership while keeping voting control, sometimes 10 or 20 votes to your one.",
    ],
    quote: "Holders of our Class B common stock are entitled to ten votes per share.",
  },
  {
    n: "09",
    name: "Underwriting",
    len: "5–12 pp",
    plain: "The banks and the plumbing",
    desc: [
      "Names the underwriting syndicate, the discount they take, the lock-up periods that stop insiders dumping shares, and the over-allotment (\"greenshoe\") option.",
      "The fee — typically around 7% for a traditional US IPO — is the line that explains why everyone is in the room.",
    ],
    quote: "The underwriters have agreed to purchase the shares at the public offering price less the underwriting discount.",
  },
  {
    n: "10",
    name: "Financial Statements",
    len: "40–100 pp",
    plain: "The audited truth",
    desc: [
      "The back of the document and its spine: audited balance sheets, income statements, cash-flow statements and the dense footnotes, signed off by an independent accounting firm.",
      "Everything else is narration. This is the part underwriters' lawyers, auditors and short-sellers actually live in.",
    ],
    quote: "Report of Independent Registered Public Accounting Firm.",
  },
  {
    n: "11",
    name: "The Founder's Letter (optional)",
    len: "1–4 pp",
    plain: "The part that goes viral",
    desc: [
      "Not required, and not always present — but when a founder includes a letter, it's the thing everyone quotes. Google's \"An Owner's Manual for Google's Shareholders\" set the template: candid, long-term, a little defiant.",
      "Done well it signals confidence and conviction. Done badly it becomes the headline — and the punchline.",
    ],
    quote: "Google is not a conventional company. We do not intend to become one.",
  },
];

/* ----- the working group ----- */
window.WORKING_GROUP = [
  { role: "The Issuer", who: "CEO · CFO · GC", job: "Founders and executives who own the story and sign the document — and carry personal liability for it." },
  { role: "Lead Underwriters", who: "Investment banks", job: "Bookrunners who price the deal, run the roadshow, build the order book and place the shares." },
  { role: "Issuer's Counsel", who: "Company lawyers", job: "Draft the registration statement and shepherd it through SEC review and comment letters." },
  { role: "Underwriters' Counsel", who: "Banks' lawyers", job: "Run due diligence on the issuer and negotiate the underwriting agreement on the banks' behalf." },
  { role: "Independent Auditors", who: "Accounting firm", job: "Audit the financials and issue the comfort letter the underwriters rely on." },
  { role: "The SEC", who: "Division of Corp Fin", job: "Reviews the filing for adequate disclosure and issues comment letters until satisfied — then declares it effective." },
  { role: "Financial Printer", who: "e.g. Toppan Merrill", job: "Typesets, proofs and files the document on EDGAR, often through the night before pricing." },
  { role: "Other Specialists", who: "IR · PR · transfer agent", job: "Investor relations, press, the transfer agent and the exchange that lists the stock." },
];

/* ----- case studies ----- */
window.CASES = [
  {
    id: "voc",
    tab: "VOC",
    year: "1602",
    tier: "THE ORIGIN",
    tierClass: "amber",
    name: "Dutch East India Co.",
    sub: "The charter that started everything",
    blurb: "Not a prospectus in the legal sense — there was no law to satisfy — but the first document to offer ownership of a company to the general public on stated terms. It invented the idea that strangers could buy, hold and trade a piece of an enterprise.",
    kv: [
      { k: "Raised", v: "ƒ3.67M guilders" },
      { k: "Subscribers", v: "1,143 investors" },
      { k: "Structure", v: "Tradable registered shares" },
      { k: "Disclosure regime", v: "None yet — just a charter", small: true },
    ],
    quote: "All the residents of these lands may buy shares in this Company.",
    src: "VOC Charter, Article 10 · 1602",
    takeaway: "Set the template: <b>public ownership, on stated terms, in writing.</b> Everything since is elaboration.",
  },
  {
    id: "google",
    tab: "Google",
    year: "2004",
    tier: "THE GOLD STANDARD",
    tierClass: "green",
    name: "Google",
    sub: "\"An Owner's Manual for Google's Shareholders\"",
    blurb: "Google's S-1 broke the mould. Founders Larry Page and Sergey Brin opened with a letter modeled on Warren Buffett, warned investors that the company would be run for the long term and would not give quarterly guidance, and locked in a dual-class structure to keep control. It even priced via a Dutch auction to cut the banks down to size.",
    kv: [
      { k: "Raised", v: "~$1.67 billion" },
      { k: "Method", v: "Dutch auction" },
      { k: "Structure", v: "Dual-class (founder control)" },
      { k: "Signature move", v: "The founder's letter", small: true },
    ],
    quote: "Google is not a conventional company. We do not intend to become one.",
    src: "Letter from the Founders · Google S-1, 2004",
    takeaway: "Proof that <b>candor and conviction sell</b> — the letter became the genre's gold standard and the company's mythology.",
  },
  {
    id: "facebook",
    tab: "Facebook",
    year: "2012",
    tier: "THE BLOCKBUSTER",
    tierClass: "amber",
    name: "Facebook",
    sub: "Founder control at billion-user scale",
    blurb: "Facebook's filing carried Mark Zuckerberg's \"Hacker Way\" letter and a governance structure that gave him majority voting control of a company about to be worth $100B+. The offering itself was a fiasco — a Nasdaq technical meltdown and a price that sagged for months — but the document set the playbook for founder-controlled mega-IPOs that followed.",
    kv: [
      { k: "Raised", v: "~$16 billion" },
      { k: "Valuation", v: "~$104 billion" },
      { k: "Structure", v: "Dual-class, founder majority" },
      { k: "First months", v: "Stock fell ~50%, then recovered", small: true },
    ],
    quote: "We don't build services to make money; we make money to build better services.",
    src: "Letter from Mark Zuckerberg · Facebook S-1, 2012",
    takeaway: "A great document and a botched debut can coexist — and <b>founder control became the norm</b> for big tech.",
  },
  {
    id: "beyond",
    tab: "Beyond Meat",
    year: "2019",
    tier: "THE POP",
    tierClass: "green",
    name: "Beyond Meat",
    sub: "A small, clean filing and a monster debut",
    blurb: "A relatively modest, mission-forward S-1 — plant-based meat, a clear story, a recognizable product — produced one of the best first days in two decades. The stock rocketed on day one, a textbook case of a tidy offering meeting an enthusiastic public.",
    kv: [
      { k: "Raised", v: "~$240 million" },
      { k: "Day-one move", v: "+163% (best in years)" },
      { k: "Story", v: "Single clear product + mission" },
      { k: "Profitability", v: "Not yet — story carried it", small: true },
    ],
    quote: "A first-day pop that big means the deal was priced well below what the market would bear.",
    src: "Market commentary · May 2019",
    takeaway: "A clean story can <b>outrun unprofitability</b> — but a huge pop also means money left on the table.",
  },
  {
    id: "aramco",
    tab: "Aramco",
    year: "2019",
    tier: "THE COLOSSUS",
    tierClass: "amber",
    name: "Saudi Aramco",
    sub: "The biggest IPO ever filed",
    blurb: "The largest IPO in history by money raised, on a prospectus that ran to nearly 700 pages. Listed largely on Riyadh's Tadawul rather than New York or London, it showed how the document scales to a national crown jewel — and how disclosure, valuation and politics collide at the very top end.",
    kv: [
      { k: "Raised", v: "~$25.6 billion" },
      { k: "Valuation", v: "~$1.7 trillion" },
      { k: "Prospectus", v: "~650+ pages" },
      { k: "Listing", v: "Tadawul (Riyadh)", small: true },
    ],
    quote: "The largest initial public offering ever completed — by an order of magnitude.",
    src: "Saudi Aramco prospectus · 2019",
    takeaway: "At the top end the document is <b>geopolitics in legal prose</b> — and scale changes everything.",
  },
  {
    id: "ford",
    tab: "Ford",
    year: "1956",
    tier: "THE LANDMARK",
    tierClass: "green",
    name: "Ford Motor Co.",
    sub: "The post-war offering that widened ownership",
    blurb: "When the Ford family finally took the company public, it was the most widely-held IPO of its era — engineered by the Ford Foundation to sell shares to a broad public while preserving family voting control through a special class of stock. A mid-century landmark in turning a private dynasty into a public company.",
    kv: [
      { k: "Era", v: "Post-war blue chip" },
      { k: "Shareholders", v: "Among the most widely held of its day" },
      { k: "Structure", v: "Family voting control retained" },
      { k: "Legacy", v: "Template for the family float", small: true },
    ],
    quote: "A dynasty learning to share ownership without surrendering control.",
    src: "On the Ford offering · 1956",
    takeaway: "Dual-class control isn't a tech invention — <b>founders have hedged the float for generations.</b>",
  },
  {
    id: "wework",
    tab: "WeWork",
    year: "2019",
    tier: "THE COLLAPSE",
    tierClass: "red",
    name: "WeWork",
    sub: "\"A masterpiece of obfuscation\"",
    blurb: "Filed in August 2019, WeWork's S-1 unravelled in public within weeks. It dedicated the document to \"the energy of We,\" invented metrics like \"community-adjusted EBITDA,\" disclosed a tangle of related-party deals enriching CEO Adam Neumann, listed his own pre-IPO interviews as a risk factor, and reported a $900M+ half-year loss. The valuation cratered from $47B to a pulled deal in roughly a month.",
    kv: [
      { k: "Target valuation", v: "$47 billion" },
      { k: "Outcome", v: "IPO pulled; CEO ousted" },
      { k: "H1 2019 loss", v: "$900M+" },
      { k: "Board", v: "Seven members, no women (at filing)", small: true },
    ],
    quote: "One analyst called the initial S-1 a \"masterpiece of obfuscation.\"",
    src: "Finerva / press coverage · 2019",
    takeaway: "The document is a <b>truth serum</b>: governance, related-party deals and vibe-as-metric all became fatal in the open.",
  },
];

/* ==========================================================
   BUILDER — Build Your Own IPO, scoring engine config
   Each option carries score deltas. The engine in builder.jsx
   blends them into four sub-scores + a readiness number.
   sub-scores: integrity, appeal, governance, credibility
   ========================================================== */
window.BUILDER = {
  steps: [
    {
      id: "archetype",
      kind: "single",
      num: "01 / 06",
      title: "Pick your company",
      help: "Your archetype sets the baseline story the market will react to — the growth, the losses, the appetite.",
      options: [
        { id: "rocket", name: "The Rocket Ship", side: "hyper-growth SaaS", desc: "80% YoY growth, deeply unprofitable, \"land and expand.\" The market loves it until rates rise.",
          flag: { t: "+ appeal, − credibility, high scrutiny", c: "warn" },
          s: { appeal: 26, credibility: -6, integrity: 0, governance: 0 }, hype: 1.25, scrutiny: 14, val: 6.0 },
        { id: "steady", name: "The Steady Hand", side: "profitable & boring", desc: "12% growth, real free cash flow, a moat nobody tweets about. The deal nobody writes a thinkpiece on.",
          flag: { t: "+ credibility, modest appeal", c: "good" },
          s: { appeal: 8, credibility: 24, integrity: 6, governance: 4 }, hype: 0.85, scrutiny: 4, val: 2.4 },
        { id: "moonshot", name: "The Moonshot", side: "pre-revenue deep tech", desc: "No revenue, a huge TAM, and a story about changing the world. Pure narrative equity.",
          flag: { t: "+ appeal, − credibility, very high scrutiny", c: "warn" },
          s: { appeal: 22, credibility: -14, integrity: 0, governance: 0 }, hype: 1.4, scrutiny: 20, val: 8.0 },
        { id: "brand", name: "The Category Crusher", side: "cult consumer brand", desc: "Fast growth, thin margins, a product people post about. Beyond-Meat energy.",
          flag: { t: "+ appeal, balanced risk", c: "good" },
          s: { appeal: 18, credibility: 6, integrity: 2, governance: 2 }, hype: 1.15, scrutiny: 9, val: 3.6 },
      ],
    },
    {
      id: "risks",
      kind: "risks",
      num: "02 / 06",
      title: "Draft your Risk Factors",
      help: "Disclosure, not merit: you're not judged on whether the risk is scary, but on whether you owned it. Bury a MATERIAL risk and you're inviting a Section 11 lawsuit. Burying boilerplate just looks evasive.",
      risks: [
        { id: "losses", text: "We have a history of losses and may never achieve profitability.", kind: "material" },
        { id: "concentration", text: "We depend on a single customer for a majority of our revenue.", kind: "material" },
        { id: "founder", text: "Our founder controls a majority of voting power and may act against other holders.", kind: "material" },
        { id: "relatedparty", text: "Our CEO has entered into transactions and leases with the company.", kind: "material" },
        { id: "pandemic", text: "A global pandemic or macro shock could disrupt our operations.", kind: "boiler" },
        { id: "competition", text: "We operate in a highly competitive market.", kind: "boiler" },
      ],
    },
    {
      id: "letter",
      kind: "single",
      num: "03 / 06",
      title: "Write the founder's letter",
      help: "Optional, unregulated, and the most-quoted page in the book. Tone is everything.",
      options: [
        { id: "none", name: "No letter", side: "let the numbers speak", desc: "No personal letter. Clean, modest, a little cold. The institutions won't mind.",
          flag: { t: "neutral — safe", c: "good" },
          s: { appeal: 0, credibility: 6, integrity: 2, governance: 0 } },
        { id: "ownersmanual", name: "The Owner's Manual", side: "Google / Buffett register", desc: "Candid, long-term, a little defiant. \"We will not manage to the quarter.\" Confidence without delusion.",
          flag: { t: "+ appeal, + credibility", c: "good" },
          s: { appeal: 14, credibility: 16, integrity: 4, governance: 0 } },
        { id: "messianic", name: "The Messianic Manifesto", side: "WeWork register", desc: "\"We are here to elevate the world's consciousness.\" Dedicated to the energy of We. Press will not be kind.",
          flag: { t: "+ short-term hype, credibility crater", c: "bad" },
          s: { appeal: 12, credibility: -22, integrity: -4, governance: 0 }, scrutiny: 12 },
        { id: "folksy", name: "The Folksy Contrarian", side: "plain-spoken outsider", desc: "Homespun, self-deprecating, quietly confident. Reads like a letter to shareholders you'd actually keep.",
          flag: { t: "+ credibility, modest appeal", c: "good" },
          s: { appeal: 8, credibility: 12, integrity: 4, governance: 0 } },
      ],
    },
    {
      id: "governance",
      kind: "single",
      num: "04 / 06",
      title: "Choose your governance",
      help: "How much control do you keep — and how much will investors forgive? Governance scores reward accountability; founders often want the opposite.",
      options: [
        { id: "onevote", name: "One share, one vote", side: "independent board", desc: "No special classes, a majority-independent board. Governance purists applaud; you live and die by the proxy.",
          flag: { t: "+ governance, + credibility", c: "good" },
          s: { appeal: 2, credibility: 10, integrity: 4, governance: 30 } },
        { id: "sunset", name: "Dual-class with a sunset", side: "10:1, expires in ~7 yrs", desc: "Founders keep control for now, but the supervoting rights expire on a timetable. The modern compromise.",
          flag: { t: "balanced — the market norm", c: "warn" },
          s: { appeal: 6, credibility: 4, integrity: 0, governance: 4 } },
        { id: "supervote", name: "Founder supervoting, forever", side: "20:1, no sunset", desc: "You sell the economics and keep near-total control indefinitely. Index funds grumble; you sleep fine.",
          flag: { t: "+ control, governance crater", c: "bad" },
          s: { appeal: 4, credibility: -8, integrity: 0, governance: -26 } },
      ],
    },
    {
      id: "proceeds",
      kind: "single",
      num: "05 / 06",
      title: "State your Use of Proceeds",
      help: "A short section everyone reads closely. Where the money goes signals what the offering is really for.",
      options: [
        { id: "growth", name: "Growth & R&D", side: "general corporate purposes", desc: "Fund the engine: product, sales, expansion. The expected, well-received answer.",
          flag: { t: "+ appeal, + credibility", c: "good" },
          s: { appeal: 12, credibility: 8, integrity: 4, governance: 0 } },
        { id: "debt", name: "Pay down debt", side: "shore up the balance sheet", desc: "Use the cash to deleverage. Prudent, unexciting, reassuring to the credit-minded.",
          flag: { t: "+ credibility, low excitement", c: "good" },
          s: { appeal: 2, credibility: 14, integrity: 4, governance: 0 } },
        { id: "acquire", name: "Acquisitions & expansion", side: "roll-up the market", desc: "Buy your way bigger. Appeal if the market believes you; scrutiny if it doesn't.",
          flag: { t: "+ appeal, + scrutiny", c: "warn" },
          s: { appeal: 12, credibility: 0, integrity: 0, governance: 0 }, scrutiny: 8 },
        { id: "secondary", name: "Cash out early investors", side: "founder & VC secondary", desc: "A big slice repays existing backers and the founder. The market reads this exactly how it sounds.",
          flag: { t: "appeal & credibility hit — a red flag", c: "bad" },
          s: { appeal: -10, credibility: -16, integrity: -6, governance: -6 }, scrutiny: 12 },
      ],
    },
    {
      id: "pricing",
      kind: "pricing",
      num: "06 / 06",
      title: "Price the deal",
      help: "Pick your underwriting route, then set how aggressively you price. Price low and you'll pop on day one but leave money on the table; price to perfection and you risk a broken IPO.",
      banks: [
        { id: "bulge", name: "Bulge-bracket syndicate", desc: "Goldman, Morgan Stanley, JPMorgan. Deep distribution, a ~7% fee, and a safety blanket of credibility.",
          s: { appeal: 12, credibility: 12, governance: 0, integrity: 0 } },
        { id: "boutique", name: "Boutique advisor", desc: "A specialist bank, lower fee, less reach. Smart for a clean story; thin for a blockbuster.",
          s: { appeal: 4, credibility: 6, governance: 0, integrity: 0 } },
        { id: "direct", name: "Direct listing", desc: "No underwriter, no new shares, no lock-up games — existing holders just start trading. Needs a brand strong enough to sell itself.",
          s: { appeal: 8, credibility: 8, governance: 2, integrity: 4 } },
        { id: "auction", name: "Dutch auction", desc: "Let the market set the clearing price (the Google move). Fairer pricing, fewer favors for the banks' friends.",
          s: { appeal: 6, credibility: 12, governance: 2, integrity: 6 } },
      ],
    },
  ],
};
