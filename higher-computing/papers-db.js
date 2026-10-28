/* Past-paper practice: Database design & development. Original questions in the style of recent papers (not copied). */
(function () {
  "use strict";
  const B = (window.HCP_BANK = window.HCP_BANK || {});
  const R = String.raw;
  /* G(n): up to n characters of the same sentence that contain no negator, so a marking pattern can join a concept to its
     relation ("many-to-many ... resolved") without matching "is NOT resolved". A dot inside table.field does not end it. */
  /* NB: placed at the start of a pattern, refuses a match that a negator sits just before ("does not give two ..."). */
  const NB = String.raw`(?<!(?:\bnot|n't|\bnever|\bwithout|\bno|\bcannot|\bcan't)\s+(?:\w+\s+){0,3})`;
  const G = (n) => `(?:(?!\\b(?:not|never|no|without|none)\\b|n't)(?:[^.]|\\.(?=[a-z]))){0,${n}}`;

  /* ---- small SVG helpers: entity-relationship boxes with crow's feet, and a query design table ---- */
  const INK = "#1d2433", ACC = "#1f5f8b", PAPER = "#fbfaf6", FILL = "#eef3f8";
  const svg = (w, h, label, body) =>
    `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" font-family="system-ui, sans-serif"><rect width="${w}" height="${h}" fill="${PAPER}"/>${body}</svg>`;
  /* entity box: name header, then attributes; an attribute is a string, "_x" = primary key (underlined), "x*" = foreign key */
  const entity = (x, y, w, name, attrs) => {
    const h = 28 + attrs.length * 20 + 8;
    let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${FILL}" stroke="${INK}" stroke-width="2"/>` +
      `<line x1="${x}" y1="${y + 28}" x2="${x + w}" y2="${y + 28}" stroke="${INK}" stroke-width="1.5"/>` +
      `<text x="${x + w / 2}" y="${y + 19}" font-size="14" font-weight="700" text-anchor="middle" fill="${INK}">${name}</text>`;
    attrs.forEach((a, i) => {
      const pk = a.startsWith("_");
      s += `<text x="${x + 10}" y="${y + 48 + i * 20}" font-size="12.5" fill="${INK}"${pk ? ` text-decoration="underline" font-weight="600"` : ""}>${pk ? a.slice(1) : a}</text>`;
    });
    return s;
  };
  /* ends of a horizontal relationship line at (x, y): side "l" means the box lies to the LEFT of x */
  const crow = (x, y, side) => {
    const d = side === "l" ? -1 : 1;
    return `<path d="M${x + d * 16} ${y} L${x} ${y - 9} M${x + d * 16} ${y} L${x} ${y + 9} M${x + d * 16} ${y} L${x} ${y}" stroke="${ACC}" stroke-width="2" fill="none"/>`;
  };
  const bar = (x, y, side) => {
    const d = side === "l" ? -1 : 1;
    return `<line x1="${x + d * 10}" y1="${y - 9}" x2="${x + d * 10}" y2="${y + 9}" stroke="${ACC}" stroke-width="2.4"/>`;
  };
  const rel = (x1, x2, y, label, end1, end2) =>
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${ACC}" stroke-width="2"/>` +
    (end1 === "m" ? crow(x1, y, "r") : bar(x1, y, "r")) + (end2 === "m" ? crow(x2, y, "l") : bar(x2, y, "l")) +
    `<text x="${(x1 + x2) / 2}" y="${y - 10}" font-size="12" font-style="italic" text-anchor="middle" fill="${INK}">${label}</text>`;

  const figPupilTeam = svg(560, 150,
    "Entity-relationship diagram: a Pupil entity with attributes pupilID, forename, surname and yearGroup, and a Team entity with attributes teamCode, teamName, sport and coach, joined by one line named plays for with a crow's foot at both ends.",
    entity(30, 14, 170, "Pupil", ["_pupilID", "forename", "surname", "yearGroup"]) +
    entity(360, 14, 170, "Team", ["_teamCode", "teamName", "sport", "coach"]) +
    rel(200, 360, 62, "plays for", "m", "m"));

  const figCadet = svg(576, 150,
    "Entity-relationship diagram of the squadron database: Cadet one-to-many Posting, and Ship one-to-many Posting. Cadet has cadetID, firstname, surname, rank. Posting has cadetID and shipCode as a compound key plus startDate and role. Ship has shipCode, shipName and homePort.",
    entity(8, 14, 130, "Cadet", ["_cadetID", "firstname", "surname", "rank"]) +
    entity(223, 14, 130, "Posting", ["_cadetID*", "_shipCode*", "startDate", "role"]) +
    entity(438, 14, 130, "Ship", ["_shipCode", "shipName", "homePort"]) +
    rel(138, 223, 62, "is given", "o", "m") + rel(353, 438, 62, "is on", "m", "o"));

  const dtRow = (y, k, v) =>
    `<rect x="10" y="${y}" width="190" height="38" fill="${FILL}" stroke="${INK}" stroke-width="1.5"/>` +
    `<rect x="200" y="${y}" width="350" height="38" fill="#fff" stroke="${INK}" stroke-width="1.5"/>` +
    `<text x="20" y="${y + 24}" font-size="13" font-weight="700" fill="${INK}">${k}</text>` +
    `<text x="212" y="${y + 24}" font-size="13" fill="${INK}">${v}</text>`;
  const figDesign = svg(560, 212,
    "A query design table with five rows. Fields and calculations: houseName and the average of merits rounded to one decimal place. Tables: House and Pupil. Search criteria: yearGroup at least 4. Grouping: houseName. Sort order: average merits, highest first.",
    dtRow(10, "Field(s) and calculation(s)", "houseName, Average merits = ROUND(AVG(merits), 1)") +
    dtRow(48, "Table(s) and query", "House, Pupil") +
    dtRow(86, "Search criteria", "yearGroup &gt;= 4") +
    dtRow(124, "Grouping", "houseName") +
    dtRow(162, "Sort order", "average merits, highest first"));

  B.db = {
    intro: `<p>Database design and development is <b>Section 2</b> of the real paper: <b>25 marks</b>, one of the two options (the other is Web). This tab is a full bank, more than you would meet in one sitting, so pick questions by topic. Expect analysis (end-user and functional requirements), entity-relationship diagrams, compound keys and referential integrity, a data dictionary, SQL on three linked tables (wildcards, aggregates, calculated fields, GROUP BY) and testing or evaluating a solution.</p>
<p>Commonest slips from the 2025 course report: writing a vague fix ("missing join") when the exact join condition earns the mark; <code>&gt;</code> where the question says "at least"; leaving out GROUP BY, or failing to combine SUM with a calculation; not saying that a new entity <i>resolves a many-to-many relationship</i>; and writing functional requirements without the "a query to display&hellip;" pattern. SQL parts are run on a real database and compared with the model result, so column order and the order of rows matter when the question asks for an order.</p>`,
    questions: [
      /* ---------------------------------------------------------------- 01 */
      {
        id: "db-01",
        style: "Scenario question · analysis: end-user and functional requirements",
        stem: `<p>The manager of Hillside Gym is commissioning a database to hold details of members, fitness classes, class bookings and payments. After talking to staff she lists what people want.</p>`,
        parts: [
          {
            label: "(a)", type: "multi", marks: 3,
            q: "Select the <b>three</b> statements that are <b>functional</b> requirements. [3]",
            opts: [
              "A query to display the name and email address of every member whose membership expires in March.",
              "The manager wants to see which members have not visited for a month.",
              "The Member table must store memberID, forename, surname, email and expiryDate.",
              "Reception staff need to book a member on to a class.",
              "A query to count the bookings for each class.",
              "Instructors want to know how popular each class is."
            ],
            a: [0, 2, 4],
            why: "Functional requirements say what the system must do and hold: the queries, tables and fields. Options 1, 3 and 5 are end-user requirements: tasks users want to carry out, written from their point of view."
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 3,
            q: "Reception staff say: &ldquo;I need to see what each member has paid altogether.&rdquo; Write this as a functional requirement. [2]",
            points: [
              { desc: "Written as a query/system process that displays or lists something", any: [R`\bquer(y|ies)\b${G(60)}\b(display\w*|show\w*|list\w*|output\w*|find\w*|select\w*|retriev\w*|report\w*|produc\w*|return\w*)`, R`\b(system|database|program|app|software)\b${G(40)}\b(must|should|shall|will|needs? to|has to)\b${G(30)}\b(display|show|list|output|report|calculate|work out|produce|find|retrieve)`] },
              { desc: "Uses the sum/total of the members' payments", all: [R`\b(sum|total\w*|add\w* (up|together))\b`, R`\b(payments?|amounts?|paid|fees?|money|subscriptions?)\b`], win: 60 },
              { desc: "For each member (grouped by member)", any: [R`\bgroup\w* by\b${G(15)}\bmembers?\b`, R`\b(sum|total\w*)\b${G(50)}\b(for|per|of|by) (each|every) (member|person)`, R`\b(each|every) (member|person)\b${G(40)}\b(sum|total\w*)\b`, R`\bper member\b`, R`\bgroup\w* by (the )?(member|person)`] }
            ],
            sample: "A query to display each member's name and the sum of all their payments, grouped by member.",
            model: `<p>A functional requirement is a process or data the system must provide, so use the pattern <b>&ldquo;a query to display&hellip;&rdquo;</b>. (1) a query to display the member (name/ID) with (1) the sum/total of their payments, (1) for each member / grouped by member. Any 2. Restating &ldquo;the receptionist wants to see&hellip;&rdquo; is the end-user requirement again and earns nothing.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 02 */
      {
        id: "db-02",
        style: "Scenario question · ER diagram, resolving a many-to-many, compound key",
        stem: `<p>A school sports co-ordinator is designing a database. Each pupil can play for several teams, and each team has several pupils. Her first entity-relationship diagram is shown.</p>`,
        figure: figPupilTeam,
        parts: [
          {
            label: "(a)", type: "mcq", marks: 1,
            q: "What is the cardinality of the relationship between Pupil and Team in the diagram? [1]",
            opts: ["one-to-one", "one-to-many", "many-to-many", "there is no relationship"],
            a: 2,
            why: "A crow's foot at both ends means many on both sides: a pupil plays for many teams and a team has many pupils."
          },
          {
            label: "(b)", type: "text", marks: 3, rows: 4,
            q: "Explain how a relational database designer deals with this relationship. [3]",
            points: [
              { desc: "The many-to-many relationship cannot be implemented directly, so it is resolved", negOK: true, any: [R`${NB}\bmany.to.many\b( relationships?)?${G(30)}\b(is|are|can be|has to be|have to be|must be|needs to be|should be|gets?|was|were|be)\b${G(30)}\b(resolv\w*|remov\w*|split\w*|break\w*|broken|replac\w*|dealt with|separat\w*|eliminat\w*)`, R`\bmany.to.many\b[^.]{0,80}\b(cannot|can.?t|unable to|impossible to|not possible to|isn.?t possible to|won.?t work)\b${G(40)}\b(directly|implement\w*|represent\w*|stored|work|possible)`, R`${NB}\b(resolv\w*|remov\w*|split\w*|break\w*|replac\w*|get rid of|deal with)\b${G(25)}\b(the|a|any) (many.to.many|m:n|many to many)`] },
              { desc: "A new linking (associative/junction/intermediate) entity or table is added between Pupil and Team", negOK: true, any: [R`${NB}\b(a|an|the|another|new|extra|third|additional)\s+(\w+\s+){0,3}?(link\w*|junction|intermediate|associative|bridg\w*|joining|composite)\b${G(25)}\b(entity|table)\b${G(70)}\b(between|connect\w*|links?|joins?|sits?|pupils?|teams?)\b`, R`${NB}\b(add\w*|insert\w*|creat\w*|introduc\w*|put in|include\w*|use)\b${G(40)}\b(link\w*|junction|intermediate|associative|bridg\w*|joining|composite|third)\b${G(25)}\b(entity|table)\b`, R`${NB}\b(a|an|the) (new|extra|additional|third) (entity|table)\b${G(30)}\bbetween\b`] },
              { desc: "It turns the relationship into two one-to-many relationships", negOK: true, any: [R`${NB}\b(into|gives?|giving|makes?|making|creates?|creating|forms?|forming|becomes?|become|results? in|resulting in|leaves?|leaving|replaced by|produces?|producing|there are|there will be|are|is)\s+(\w+\s+){0,2}?two\s+(one.to.many|1:m|1:n|one to many)\b`, R`${NB}\b(one.to.many|1:m)\b${G(80)}\b(and|both|each|two|second|another|other)\b${G(40)}\b(one.to.many|1:m|sides?|ends?)\b`, R`${NB}\bsplit\w*${G(40)}\b(two|2)\b${G(30)}\b(one|1)\b`, R`${NB}\b(each|both)( of)? (pupil|team)\b${G(40)}\b(one.to.many|1:m)\b`, R`${NB}\b(one.to.many|1:m)\b${G(40)}\b(with|to)\b${G(5)}\b(it|the (new|link\w*|junction|intermediate|associative)\b)`] }
            ],
            sample: "The many-to-many relationship is resolved when a new linking entity, such as Selection, is added between Pupil and Team. The result is two one-to-many relationships, one from Pupil and one from Team.",
            model: `<p>(1) A many-to-many relationship cannot be implemented directly. (1) A new (linking) entity is added between Pupil and Team. (1) This resolves it into <b>two one-to-many relationships</b> (Pupil to the new entity, and Team to the new entity). The 2025 report says only a few candidates could explain this: use the words &ldquo;removes/resolves the many-to-many relationship&rdquo;.</p>`
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 3,
            q: "The new entity has a compound key. Name the attributes that make up the key and explain why neither attribute is enough on its own. [2]",
            points: [
              { desc: "pupilID and teamCode", all: [R`pupil.?id`, R`team.?code`], win: 90 },
              { desc: "Each value repeats (a pupil is in several teams, a team has several pupils) but the pair is unique", any: [R`\b(neither|alone|on its own|by itself|individually|each one|either one)\b${G(80)}\b(unique|identif\w*|repeat\w*|duplicate\w*|more than once|several|many|again)`, R`\b(together|combin\w+|pair|combination)\b${G(60)}\b(unique|identif\w*)`, R`\b(unique|identif\w*)\b${G(40)}\b(together|combin\w+|as a pair|both|pair)\b`, R`\b(repeat\w*|duplicat\w*|appears? (more than once|several times|many times|again)|same (pupil|team))\b${G(100)}\b(but|so|however|only|together|combin\w+|pair)\b${G(60)}\b(unique|identif\w*)`, R`\b(many|several|more than one|multiple)\b${G(70)}\b(isn.?t|wouldn.?t|couldn.?t|can.?t|cannot|not)\b ?(be )?unique`] }
            ],
            sample: "pupilID and teamCode. A pupil can play for several teams and a team has many pupils, so each value repeats in the table, but the pair of values together is unique.",
            model: `<p>(1) pupilID and teamCode (each is the primary key of its own entity and a foreign key here). (1) Neither is unique alone: a pupil appears once for every team they play for, and a team once for every pupil; the <b>combination</b> identifies exactly one row.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 03 */
      {
        id: "db-03",
        style: "Scenario question · SELECT with criteria and sort, testing boundaries",
        stem: `<p>A ferry company stores one row for each crossing in its <code>Crossing</code> table.</p>
<table class="pp-tab"><tr><th>Field</th><th>Type</th><th>Example</th></tr>
<tr><td>crossingID</td><td>Number (primary key)</td><td>4</td></tr>
<tr><td>route</td><td>Text</td><td>Oban to Craignure</td></tr>
<tr><td>sailDate</td><td>Date (YYYY-MM-DD)</td><td>2026-06-02</td></tr>
<tr><td>vehicles</td><td>Number</td><td>44</td></tr>
<tr><td>passengers</td><td>Number</td><td>175</td></tr>
<tr><td>delayMins</td><td>Number</td><td>22</td></tr></table>`,
        parts: [
          {
            label: "(a)", type: "sql", marks: 3,
            q: "Write an SQL query to display the route, sailDate and delayMins of every crossing delayed by <b>at least 15 minutes</b>. Show the longest delay first and, where delays are equal, list the routes in alphabetical order. [3]",
            schema: `CREATE TABLE Crossing(crossingID INTEGER PRIMARY KEY, route TEXT, sailDate TEXT, vehicles INTEGER, passengers INTEGER, delayMins INTEGER);
INSERT INTO Crossing VALUES (1,'Oban to Craignure','2026-06-01',38,160,0),(2,'Ullapool to Stornoway','2026-06-01',52,210,15),(3,'Largs to Cumbrae','2026-06-01',20,95,5),(4,'Oban to Craignure','2026-06-02',44,175,22),(5,'Ardrossan to Brodick','2026-06-02',31,140,22),(6,'Largs to Cumbrae','2026-06-02',18,80,15),(7,'Ullapool to Stornoway','2026-06-03',60,240,40),(8,'Ardrossan to Brodick','2026-06-03',27,120,8),(9,'Oban to Craignure','2026-06-03',35,150,15),(10,'Largs to Cumbrae','2026-06-03',22,101,0);`,
            solution: "SELECT route, sailDate, delayMins FROM Crossing WHERE delayMins >= 15 ORDER BY delayMins DESC, route ASC;",
            ordered: true,
            must: [R`where[^;]*(delaymins\s*(>=\s*15|>\s*14|between\s+15\s+and)|(15\s*<=|14\s*<)\s*(\w+\.)?delaymins|not\s*\(?\s*(\w+\.)?delaymins\s*(<\s*15|<=\s*14))`, R`order by`],
            mustDesc: "a WHERE criterion that tests delayMins against 15, and an ORDER BY",
            model: `<p>(1) the three fields from Crossing; (1) <code>WHERE delayMins &gt;= 15</code>; (1) <code>ORDER BY delayMins DESC, route</code> (a second sort field breaks ties). Using <code>&gt; 15</code> drops the three crossings delayed by exactly 15 minutes.</p><pre>SELECT route, sailDate, delayMins
FROM Crossing
WHERE delayMins &gt;= 15
ORDER BY delayMins DESC, route ASC;</pre>`
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 3,
            q: "The requirement says &ldquo;delayed by at least 15 minutes&rdquo;. A trainee writes <code>WHERE delayMins &gt; 15</code> instead. Explain why this is wrong and how it should be corrected. [2]",
            points: [
              { desc: "A delay of exactly 15 minutes is left out (should be included)", negOK: true, any: [R`${NB}\b(exactly|precisely|equal\w*|boundary)\b${G(40)}\b15\b${G(60)}\b(exclud\w*|miss\w*|left out|leaves? out|omit\w*|ignor\w*|drops?|dropped|overlook\w*|\b(would|will|does|do|is|are|gets?) not (be )?(included|shown|displayed|selected|returned|counted|picked up))`, R`${NB}\b(it|this|that|which|so|because|as|would|will|does|is|are|be|being|using|the|a|an|test|condition|operator|sign|symbol)\b${G(30)}\b(exclud\w*|miss\w*|left out|leaves? out|omit\w*|ignor\w*|drops?|dropped|overlook\w*)\b${G(60)}\b(exactly|precisely|equal\w*|boundary|15 (min\w* )?(itself|exactly|precisely|on the dot))`, R`${NB}\b15\b ?(min\w* )?(itself|exactly|precisely)\b${G(30)}\b(exclud\w*|miss\w*|left out|omit\w*|ignor\w*|dropped|overlook\w*)`, R`${NB}>\s?15\s+(exclud\w*|misses|leaves out|omits|ignores|drops)\s+(\w+\s+){0,2}?(crossings?|delays?|sailings?|rows?|records?|values?|ferries)\b${G(40)}\b(exactly|precisely|equal\w*|15)`, R`${NB}\b(using|use|with|the|because|as|so)\s+>\s?15\b${G(60)}\b(exclud\w*|miss\w*|leaves? out|omit\w*|ignor\w*|drops?|overlook\w*)\b${G(40)}\b(15|fifteen|boundary|exactly|equal\w*)`, R`\b(does ?n.t|do ?n.t|will not|would not|wouldn.t) (include|count|show|select|return)\b${G(40)}\b(15|fifteen|exactly|equal\w*)`] },
              { desc: "Use >= (greater than or equal to) 15", any: [R`>=`, R`≥`, R`\bgreater than or equal`, R`>\s?14\b`] }
            ],
            sample: "A crossing delayed by exactly 15 minutes would be left out by the > 15 test, although it meets the requirement. The condition should be >= 15, greater than or equal to.",
            model: `<p>(1) <code>&gt;</code> excludes crossings delayed by exactly 15 minutes, which the requirement says must be shown. (1) Use <code>&gt;= 15</code>. The 2025 report: candidates used &gt; where the task said &ldquo;at least&rdquo;; it looked right with the given data but fails if the data changes. Test with a value on the boundary.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 04 */
      {
        id: "db-04",
        style: "Scenario question · wildcards with LIKE",
        stem: `<p>A library keeps its stock in a <code>Book</code> table with fields bookID, title, author, genre, pages and yearPublished.</p>`,
        parts: [
          {
            label: "(a)", type: "sql", marks: 3,
            q: "Write an SQL query to display the title and author of every book whose title contains the word <b>Island</b> and which was published in the year 2000 or later. List the books in alphabetical order of title. [3]",
            schema: `CREATE TABLE Book(bookID INTEGER PRIMARY KEY, title TEXT, author TEXT, genre TEXT, pages INTEGER, yearPublished INTEGER);
INSERT INTO Book VALUES (1,'Treasure Island','R L Stevenson','Adventure',292,1883),(2,'The Island of Doctor Moreau','H G Wells','Science fiction',160,1896),(3,'Island Nights','A Burns','Fiction',310,2000),(4,'Isle of the Dead','M Hall','Crime',254,2011),(5,'The Lost Island','S Park','Adventure',340,2016),(6,'Kidnapped','R L Stevenson','Adventure',256,1886),(7,'Islands in the Stream','E Hemingway','Fiction',448,1970),(8,'Island of Secrets','L Grant','Crime',280,2019),(9,'The Silent Harbour','P Reid','Crime',301,2015),(10,'Hebridean Island Hopping','K Munro','Travel',190,2018),(11,'The Island Garden','J Boyd','Gardening',224,2012);`,
            solution: "SELECT title, author FROM Book WHERE title LIKE '%Island%' AND yearPublished >= 2000 ORDER BY title;",
            ordered: true,
            must: [R`like\s*['"]%island%['"]`, R`yearpublished\s*(>=\s*2000|>\s*1999|between\s+2000)|(2000\s*<=|1999\s*<)\s*(\w+\.)?yearpublished|not\s*\(?\s*(\w+\.)?yearpublished\s*(<\s*2000|<=\s*1999)`, R`order by`],
            mustDesc: "LIKE with % wildcards either side of Island, the year test (2000 or later) and an ORDER BY",
            model: `<p>(1) title and author; (1) <code>title LIKE "%Island%"</code> (the word may be at the start, middle or end, so % goes at both ends) AND <code>yearPublished &gt;= 2000</code> (a 2000 book is included); (1) <code>ORDER BY title</code>. Wildcards only work with LIKE, never <code>=</code>.</p><pre>SELECT title, author
FROM Book
WHERE title LIKE "%Island%"
  AND yearPublished &gt;= 2000
ORDER BY title;</pre>`
          },
          {
            label: "(b)", type: "multi", marks: 2,
            q: "Select the <b>two</b> first names matched by <code>firstname LIKE \"_a%\"</code>. [2]",
            opts: ["Hamish", "Callum", "Ewan", "Isla", "Mhairi", "Nina"],
            a: [0, 1],
            why: "The underscore matches exactly one character, so the second letter must be a: Hamish (H-a) and Callum (C-a). Ewan has w, Isla s, Mhairi h and Nina i second."
          }
        ]
      },
      /* ---------------------------------------------------------------- 05 */
      {
        id: "db-05",
        style: "Scenario question · join, SUM, GROUP BY; reading a query",
        stem: `<p>A school charity stores its fundraising in two linked tables: <code>Campaign (campaignID, campaignName, organiser)</code> and <code>Donation (donationID, campaignID, donor, amount)</code>. The <code>campaignID</code> in Donation is a foreign key linking to Campaign.</p>`,
        parts: [
          {
            label: "(a)", type: "sql", marks: 4,
            q: "Write an SQL query to display each campaign's name and the total of its donations under the heading <b>Total Raised</b>. Show the campaign that raised most first. [4]",
            schema: `CREATE TABLE Campaign(campaignID INTEGER PRIMARY KEY, campaignName TEXT, organiser TEXT);
INSERT INTO Campaign VALUES (1,'Sponsored Swim','Ms Kerr'),(2,'Bake Sale','Mr Rahman'),(3,'Fun Run','Ms Kerr'),(4,'Quiz Night','Mrs Dunn');
CREATE TABLE Donation(donationID INTEGER PRIMARY KEY, campaignID INTEGER, donor TEXT, amount INTEGER);
INSERT INTO Donation VALUES (1,1,'A Walker',20),(2,1,'B Munro',50),(3,2,'C Ellis',10),(4,3,'D Shah',25),(5,3,'E Gray',15),(6,1,'F Scott',30),(7,3,'G Hill',40),(8,2,'H Reid',5),(9,2,'I Cole',15),(10,1,'J Nair',10),(11,3,'K Orr',20);`,
            solution: "SELECT campaignName, SUM(amount) AS [Total Raised] FROM Campaign, Donation WHERE Campaign.campaignID = Donation.campaignID GROUP BY campaignName ORDER BY SUM(amount) DESC;",
            ordered: true,
            must: [R`sum\s*\(`, R`group by`, R`campaignid\s*=\s*\w+\.?campaignid|using\s*\(\s*campaignid|natural join`, R`order by`, R`\bas\s*[^\w\s]?\s*total\s*_?\s*raised`],
            mustDesc: "SUM, a join on campaignID, a GROUP BY and the heading Total Raised (AS)",
            model: `<p>(1) campaignName and <code>SUM(amount) AS [Total Raised]</code>; (1) the join <code>Campaign.campaignID = Donation.campaignID</code> (without it every donation is paired with every campaign, so each total is 240); (1) <code>GROUP BY campaignName</code> (without it one total for the whole table); (1) <code>ORDER BY SUM(amount) DESC</code>.</p><pre>SELECT campaignName, SUM(amount) AS [Total Raised]
FROM Campaign, Donation
WHERE Campaign.campaignID = Donation.campaignID
GROUP BY campaignName
ORDER BY SUM(amount) DESC;</pre>`
          },
          {
            label: "(b)", type: "num", marks: 1,
            q: "Using the data in the tables above, how many <b>rows</b> would this query output? [1]<pre>SELECT campaignName, COUNT(*)\nFROM Campaign, Donation\nWHERE Campaign.campaignID = Donation.campaignID\n  AND amount &gt;= 20\nGROUP BY campaignName;</pre>The Donation table holds these amounts: Sponsored Swim 20, 50, 30, 10; Bake Sale 10, 5, 15; Fun Run 25, 15, 40, 20; Quiz Night has no donations yet.",
            a: 2, tol: 0,
            why: "Donations of 20 or more: Swim 20, 50, 30 (3); Bake Sale none; Fun Run 25, 40, 20 (3). GROUP BY gives one row per campaign that still has rows: 2 rows. (Not 6: that would be one row per donation.)"
          }
        ]
      },
      /* ---------------------------------------------------------------- 06 */
      {
        id: "db-06",
        style: "Scenario question · joining three tables",
        stem: `<p>The squadron's sea-training records use three linked tables. The ERD shows the design. A cadet is posted to a ship at most once.</p>`,
        figure: figCadet,
        parts: [
          {
            label: "(a)", type: "sql", marks: 4,
            q: "Write an SQL query to display the firstname, surname and shipName of every cadet posted in the role <b>Signals</b> to a ship whose homePort is <b>Leith</b>. Sort the output by surname, then by firstname. [4]",
            schema: `CREATE TABLE Cadet(cadetID TEXT PRIMARY KEY, firstname TEXT, surname TEXT, rank TEXT);
INSERT INTO Cadet VALUES ('C101','Hamish','Reid','Sgt'),('C102','Zara','Munro','Cadet'),('C103','Callum','Reid','Cpl'),('C104','Mhairi','Campbell','Cadet'),('C105','Isla','Grant','Cpl'),('C106','Ewan','MacLeod','Cadet'),('C107','Nina','Shah','Cadet');
CREATE TABLE Ship(shipCode TEXT PRIMARY KEY, shipName TEXT, homePort TEXT);
INSERT INTO Ship VALUES ('RED','HMS Redstone','Leith'),('LAP','HMS Lapwing','Portsmouth'),('OBS','HMS Observer','Leith'),('FAL','HMS Falcon','Chatham');
CREATE TABLE Posting(cadetID TEXT, shipCode TEXT, startDate TEXT, role TEXT, PRIMARY KEY(cadetID, shipCode));
INSERT INTO Posting VALUES ('C101','RED','2026-07-04','Signals'),('C104','RED','2026-07-04','Navigation'),('C104','LAP','2026-08-15','Signals'),('C102','OBS','2026-07-11','Signals'),('C103','OBS','2026-07-11','Signals'),('C105','FAL','2026-08-01','Gunnery'),('C106','RED','2026-07-04','Signals'),('C107','LAP','2026-08-15','Rigging'),('C101','LAP','2026-08-15','Gunnery');`,
            solution: "SELECT firstname, surname, shipName FROM Cadet, Posting, Ship WHERE Cadet.cadetID = Posting.cadetID AND Posting.shipCode = Ship.shipCode AND role = 'Signals' AND homePort = 'Leith' ORDER BY surname, firstname;",
            ordered: true,
            must: [R`(cadetid\s*=\s*\w+\.?cadetid|using\s*\(\s*cadetid|natural join)`, R`(shipcode\s*=\s*\w+\.?shipcode|using\s*\(\s*shipcode|natural join)`, R`role\s*=\s*['"]signals['"]|['"]signals['"]\s*=\s*(\w+\.)?role|role\s+like\s+['"]signals['"]`, R`homeport\s*=\s*['"]leith['"]|['"]leith['"]\s*=\s*(\w+\.)?homeport|homeport\s+like\s+['"]leith['"]`, R`order by`],
            mustDesc: "both join conditions (cadetID and shipCode), the Signals and Leith criteria, and an ORDER BY",
            model: `<p>(1) the three fields; (1) three tables in FROM with <b>two</b> join conditions, <code>Cadet.cadetID = Posting.cadetID</code> and <code>Posting.shipCode = Ship.shipCode</code>; (1) both criteria joined with AND; (1) <code>ORDER BY surname, firstname</code>.</p><pre>SELECT firstname, surname, shipName
FROM Cadet, Posting, Ship
WHERE Cadet.cadetID = Posting.cadetID
  AND Posting.shipCode = Ship.shipCode
  AND role = "Signals"
  AND homePort = "Leith"
ORDER BY surname, firstname;</pre>`
          },
          {
            label: "(b)", type: "num", marks: 1,
            q: "A candidate leaves out the join <code>Posting.shipCode = Ship.shipCode</code> and runs this query. The Posting table has 5 rows with role Signals and the Ship table has 4 rows. How many rows are output? [1]<pre>SELECT firstname, surname, shipName\nFROM Cadet, Posting, Ship\nWHERE Cadet.cadetID = Posting.cadetID\n  AND role = \"Signals\";</pre>",
            a: 20, tol: 0,
            why: "Each of the 5 Signals postings (with its cadet) is paired with every one of the 4 ships: 5 x 4 = 20 rows."
          }
        ]
      },
      /* ---------------------------------------------------------------- 07 */
      {
        id: "db-07",
        style: "Scenario question · calculated field with SUM, alias and GROUP BY",
        stem: `<p>A school tuck shop stores its prices and sales in <code>Product (productID, productName, price)</code> and <code>OrderLine (lineID, productID, qty)</code>. The income from a product is never stored in either table.</p>`,
        parts: [
          {
            label: "(a)", type: "sql", marks: 4,
            q: "Write an SQL query to display each product's name and its income (the quantity sold multiplied by the price) under the heading <b>Income</b>. Show the product with the highest income first. [4]",
            schema: `CREATE TABLE Product(productID INTEGER PRIMARY KEY, productName TEXT, price REAL);
INSERT INTO Product VALUES (1,'Flapjack',1.5),(2,'Tablet',3.25),(3,'Shortbread',2.0),(4,'Fudge',2.5);
CREATE TABLE OrderLine(lineID INTEGER PRIMARY KEY, productID INTEGER, qty INTEGER);
INSERT INTO OrderLine VALUES (1,1,10),(2,2,4),(3,1,6),(4,3,12),(5,2,3),(6,4,2),(7,3,5),(8,1,4),(9,2,2);`,
            solution: "SELECT productName, SUM(qty * price) AS Income FROM Product, OrderLine WHERE Product.productID = OrderLine.productID GROUP BY productName ORDER BY SUM(qty * price) DESC;",
            ordered: true,
            must: [R`sum\s*\(`, R`group by`, R`productid\s*=\s*\w+\.?productid|using\s*\(\s*productid|natural join`, R`order by`],
            mustDesc: "SUM of a calculation, a join on productID and a GROUP BY",
            model: `<p>(1) <code>SUM(qty * price) AS Income</code>: the calculation is combined with the aggregate (SUM(qty) * price also works); (1) the join on productID; (1) <code>GROUP BY productName</code> so there is one total per product; (1) sort by the income, highest first. A query with <code>qty * price</code> but no SUM and GROUP BY lists nine separate lines instead of four totals.</p><pre>SELECT productName, SUM(qty * price) AS Income
FROM Product, OrderLine
WHERE Product.productID = OrderLine.productID
GROUP BY productName
ORDER BY SUM(qty * price) DESC;</pre>`
          },
          {
            label: "(b)", type: "mcq", marks: 1,
            q: "What name is given to a value like Income, which is worked out when the query runs and is not stored? [1]",
            opts: ["A computed (calculated) value", "A foreign key", "A validation rule", "A compound key"],
            a: 0,
            why: "A computed value is calculated at run time; the alias (AS Income) only gives it a heading for that query."
          }
        ]
      },
      /* ---------------------------------------------------------------- 08 */
      {
        id: "db-08",
        style: "Scenario question · UPDATE with calculation",
        stem: `<p>Hillside Gym stores members in <code>Member (memberID, forename, membershipType, points, visits)</code>. membershipType is Standard, Student or Gold.</p>`,
        parts: [
          {
            label: "(a)", type: "sql", marks: 3, dml: true,
            q: "Standard members who have made at least 20 visits are upgraded to Gold and credited with 50 extra points. Write an SQL statement to make this change. [3]",
            schema: `CREATE TABLE Member(memberID TEXT PRIMARY KEY, forename TEXT, membershipType TEXT, points INTEGER, visits INTEGER);
INSERT INTO Member VALUES ('M01','Aisha','Standard',120,34),('M02','Ben','Standard',60,20),('M03','Carys','Gold',300,41),('M04','Dev','Standard',45,19),('M05','Eilidh','Student',80,25),('M06','Finn','Standard',200,27),('M07','Grace','Gold',150,12),('M08','Hari','Standard',10,3);`,
            solution: "UPDATE Member SET membershipType = 'Gold', points = points + 50 WHERE membershipType = 'Standard' AND visits >= 20;",
            check: "SELECT memberID, membershipType, points FROM Member ORDER BY memberID;",
            must: [R`update\s+member`, R`set[^;]*points\s*=\s*(points\s*\+\s*50|50\s*\+\s*points)[^;]*where[^;]*(visits\s*(>=\s*20|>\s*19)|(20\s*<=|19\s*<)\s*(\w+\.)?visits|not\s*\(?\s*(\w+\.)?visits\s*(<\s*20|<=\s*19))`, R`where[^;]*(visits\s*(>=\s*20|>\s*19)|(20\s*<=|19\s*<)\s*(\w+\.)?visits|not\s*\(?\s*(\w+\.)?visits\s*(<\s*20|<=\s*19))`, R`where[^;]*membershiptype\s*=\s*['"]standard['"]`],
            mustDesc: "UPDATE with SET points = points + 50 and a WHERE clause that tests both membershipType and visits",
            model: `<p>(1) <code>SET membershipType = "Gold"</code>; (1) <code>points = points + 50</code> (increment the existing value, not <code>points = 50</code>); (1) <code>WHERE membershipType = "Standard" AND visits &gt;= 20</code>. Without WHERE every row changes, and <code>&gt; 20</code> would miss Ben, who has exactly 20.</p><pre>UPDATE Member
SET membershipType = "Gold", points = points + 50
WHERE membershipType = "Standard"
  AND visits &gt;= 20;</pre>`
          },
          {
            label: "(b)", type: "num", marks: 1,
            q: "How many rows does the statement in part (a) change, using the data below? [1]<table class=\"pp-tab\"><tr><th>memberID</th><th>membershipType</th><th>visits</th></tr><tr><td>M01</td><td>Standard</td><td>34</td></tr><tr><td>M02</td><td>Standard</td><td>20</td></tr><tr><td>M03</td><td>Gold</td><td>41</td></tr><tr><td>M04</td><td>Standard</td><td>19</td></tr><tr><td>M05</td><td>Student</td><td>25</td></tr><tr><td>M06</td><td>Standard</td><td>27</td></tr><tr><td>M07</td><td>Gold</td><td>12</td></tr><tr><td>M08</td><td>Standard</td><td>3</td></tr></table>",
            a: 3, tol: 0,
            why: "Standard with at least 20 visits: M01 (34), M02 (20) and M06 (27). M04 has 19, M03 and M07 are Gold already, M05 is a Student."
          }
        ]
      },
      /* ---------------------------------------------------------------- 09 */
      {
        id: "db-09",
        style: "Scenario question · INSERT, DELETE and referential integrity",
        stem: `<p>Hillside Gym's class timetable uses two tables: <code>Session (sessionCode, className, dayName, startTime, spaces)</code> and <code>Booking (memberID, sessionCode, bookedOn)</code>. sessionCode in Booking is a foreign key linking to Session. Dates are stored as YYYY-MM-DD.</p>`,
        parts: [
          {
            label: "(a)", type: "sql", marks: 2, dml: true,
            q: "Write an SQL statement to add a new session: code YG7, class Yoga, on Tuesday, starting at 18:30, with 12 spaces. [2]",
            schema: `CREATE TABLE Session(sessionCode TEXT PRIMARY KEY, className TEXT, dayName TEXT, startTime TEXT, spaces INTEGER);
INSERT INTO Session VALUES ('YG1','Yoga','Monday','18:00',15),('SP2','Spin','Tuesday','07:30',20),('ZU1','Zumba','Wednesday','19:00',25),('PI3','Pilates','Thursday','12:15',12);
CREATE TABLE Booking(memberID TEXT, sessionCode TEXT, bookedOn TEXT, PRIMARY KEY(memberID, sessionCode));
INSERT INTO Booking VALUES ('M01','YG1','2026-02-14'),('M02','SP2','2026-02-28'),('M03','YG1','2026-03-01'),('M01','ZU1','2026-03-05'),('M05','PI3','2026-02-20'),('M06','SP2','2026-03-01'),('M07','ZU1','2026-03-10'),('M04','PI3','2026-01-30'),('M02','PI3','2026-03-12');`,
            solution: "INSERT INTO Session (sessionCode, className, dayName, startTime, spaces) VALUES ('YG7', 'Yoga', 'Tuesday', '18:30', 12);",
            check: "SELECT * FROM Session ORDER BY sessionCode;",
            must: [R`insert into session`, R`values`, R`(?<![\w'"])12(?![\w'"])`],
            mustDesc: "INSERT INTO Session ... VALUES, with the number 12 not in quotes",
            model: `<p>(1) <code>INSERT INTO Session</code> naming the table (and fields); (1) <code>VALUES</code> in the same order, text in quotes, the number 12 without quotes.</p><pre>INSERT INTO Session (sessionCode, className, dayName, startTime, spaces)
VALUES ("YG7", "Yoga", "Tuesday", "18:30", 12);</pre>`
          },
          {
            label: "(b)", type: "sql", marks: 2, dml: true,
            q: "Write an SQL statement to delete every booking made <b>before</b> 1 March 2026. [2]",
            schema: `CREATE TABLE Session(sessionCode TEXT PRIMARY KEY, className TEXT, dayName TEXT, startTime TEXT, spaces INTEGER);
INSERT INTO Session VALUES ('YG1','Yoga','Monday','18:00',15),('SP2','Spin','Tuesday','07:30',20),('ZU1','Zumba','Wednesday','19:00',25),('PI3','Pilates','Thursday','12:15',12);
CREATE TABLE Booking(memberID TEXT, sessionCode TEXT, bookedOn TEXT, PRIMARY KEY(memberID, sessionCode));
INSERT INTO Booking VALUES ('M01','YG1','2026-02-14'),('M02','SP2','2026-02-28'),('M03','YG1','2026-03-01'),('M01','ZU1','2026-03-05'),('M05','PI3','2026-02-20'),('M06','SP2','2026-03-01'),('M07','ZU1','2026-03-10'),('M04','PI3','2026-01-30'),('M02','PI3','2026-03-12');`,
            solution: "DELETE FROM Booking WHERE bookedOn < '2026-03-01';",
            check: "SELECT memberID, sessionCode FROM Booking ORDER BY memberID, sessionCode;",
            must: [R`delete from booking`, R`where[^;]*(bookedon\s*(<\s*['"]2026-03-01['"]|<=\s*['"]2026-02-2[89]['"]|between\s+['"][\d-]+['"]\s+and\s+['"]2026-02-2[89]['"])|['"]2026-03-01['"]\s*>\s*(\w+\.)?bookedon|['"]2026-02-2[89]['"]\s*>=\s*(\w+\.)?bookedon|not\s*\(?\s*(\w+\.)?bookedon\s*>=\s*['"]2026-03-01['"])`],
            mustDesc: "DELETE FROM Booking with a WHERE clause that tests bookedOn against a date",
            model: `<p>(1) <code>DELETE FROM Booking</code>; (1) <code>WHERE bookedOn &lt; "2026-03-01"</code>. Bookings made on 1 March stay, so <code>&lt;=</code> is wrong. With no WHERE the whole table is emptied.</p><pre>DELETE FROM Booking
WHERE bookedOn &lt; "2026-03-01";</pre>`
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 3,
            q: "The database enforces referential integrity between Session and Booking. Explain how this affects an attempt to add a booking for session ZZ9, which does not exist in Session. [2]",
            points: [
              { desc: "A foreign key value must match an existing primary key in the other table", negOK: true, any: [R`${NB}\bforeign key\b${G(70)}\b(has to|have to|must|needs? to|should|can only|only (allowed|valid|accepted)|is only valid)\b${G(40)}\b(match\w*|exist\w*|appear\w*|be (in|found|present)|correspond\w*|refer\w*|link\w*)`, R`${NB}\b(primary key|session table|session ?code)\b${G(60)}\b(has to|have to|must|needs? to|should|already)\b${G(30)}\b(exist|be (in|there|present|created)|match)`, R`${NB}\b(must|has to|have to|needs? to|should)\s+(match\w*|exist\w*|correspond\w*|appear\w*)\b${G(40)}\b(an? |the )?(existing |valid )?primary key\b`, R`\b(as|because|since)\b${G(20)}\b(zz9|it|that session|the session|that code)\b${G(15)}\b(is |does |do )?(n.t|not)\s+(in|exist\w*|found|present|valid|there|listed|a (valid |known )?(session|primary key))`, R`${NB}\bforeign key\b${G(40)}\b(that |which )?(has|have|with) no (matching|match|corresponding|existing)\b`, R`\bno (matching|corresponding|existing) (primary key|record|row|entry|value|session)`] },
              { desc: "So the booking is rejected / no orphan record is created", negOK: true, not: [R`\b(not|n.t|never)\s+(be\s+|been\s+)?(reject\w*|refus\w*|prevent\w*|stopp?\w*|block\w*|error)`, R`\bno (error|problem)`, R`\b(fine|allowed|accepted|added|saved) (anyway|regardless)`, R`\banyway\b`], any: [R`${NB}\b(booking|record|row|entry|insert\w*|it|database|dbms|system|addition)\b${G(50)}\b(reject\w*|refus\w*|prevent\w*|stop\w*|block\w*|disallow\w*|denied|error)`, R`${NB}\b(reject\w*|refus\w*|prevent\w*|stop\w*|block\w*|disallow\w*|error)\b${G(40)}\b(booking|record|row|entry|it|insert\w*|addition)\b`, R`\b(booking|record|row|entry|it)\b ?(would |will |can )?(not|n.t|never) (be )?(allowed|added|accepted|saved|stored|created|inserted|possible|entered)`, R`\bcannot be (added|saved|stored|created|entered|inserted)\b`, R`${NB}\borphan\w*\b${G(40)}\b(prevent\w*|stop\w*|avoid\w*|none|created)\b`, R`${NB}\b(prevent\w*|stop\w*|avoid\w*)\b${G(40)}\borphan`] }
            ],
            sample: "Every foreign key value in Booking has to match an existing primary key value in Session. There is no session ZZ9, so the booking is rejected and no orphan record is created.",
            model: `<p>(1) Referential integrity means every foreign key value (Booking.sessionCode) must match a primary key value that exists in the linked table (Session.sessionCode). (1) Because ZZ9 matches no session the booking is <b>rejected</b>, so there are no orphan bookings. It is not one of the four validation checks: it is enforced by the relationship itself.</p>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 10 */
      {
        id: "db-10",
        style: "Scenario question · data dictionary validation; find and fix errors in SQL",
        stem: `<p>A netball league keeps its results in two tables. Part of the data dictionary is shown.</p>
<table class="pp-tab"><tr><th>Entity</th><th>Attribute</th><th>Key</th><th>Type</th><th>Size</th><th>Validation</th></tr>
<tr><td>Team</td><td>teamID</td><td>PK</td><td>Number</td><td></td><td>Presence</td></tr>
<tr><td></td><td>teamName</td><td></td><td>Text</td><td>30</td><td>Presence</td></tr>
<tr><td>Player</td><td>playerID</td><td>PK</td><td>Text</td><td>4</td><td>Field length = 4</td></tr>
<tr><td></td><td>playerName</td><td></td><td>Text</td><td>30</td><td>Presence</td></tr>
<tr><td></td><td>position</td><td></td><td>Text</td><td>2</td><td>GS, GA, WA, C, WD, GD or GK</td></tr>
<tr><td></td><td>teamID</td><td>FK</td><td>Number</td><td></td><td>Presence</td></tr>
<tr><td></td><td>goals</td><td></td><td>Number</td><td></td><td>0 to 80</td></tr></table>`,
        parts: [
          {
            label: "(a)", type: "match", marks: 4,
            q: "Match each validation check to the rule in the data dictionary that uses it. [4]",
            pairs: [
              ["Presence check", "playerName cannot be left blank"],
              ["Range check", "goals must be between 0 and 80"],
              ["Restricted choice", "position must be one of GS, GA, WA, C, WD, GD or GK"],
              ["Field length", "playerID must be exactly 4 characters"]
            ]
          },
          {
            label: "(b)", type: "sql", marks: 3,
            q: "A trainee writes this statement to display each team's name and the number of its players who have scored <b>at least 10 goals</b>. It has <b>two errors</b>. Write the corrected statement. [3]<pre>SELECT teamName, COUNT(*)\nFROM Team, Player\nWHERE goals &gt; 10\nGROUP BY teamName;</pre>",
            schema: `CREATE TABLE Team(teamID INTEGER PRIMARY KEY, teamName TEXT);
INSERT INTO Team VALUES (1,'Forth Falcons'),(2,'Tay Tigers'),(3,'Clyde Comets'),(4,'Spey Stars');
CREATE TABLE Player(playerID TEXT PRIMARY KEY, playerName TEXT, teamID INTEGER, goals INTEGER);
INSERT INTO Player VALUES ('P001','Amy',1,14),('P002','Beth',1,10),('P003','Cara',2,22),('P004','Dina',3,9),('P005','Elle',2,10),('P006','Fay',1,25),('P007','Gia',3,31),('P008','Hana',4,6),('P009','Ivy',2,3),('P010','Jo',3,10),('P011','Kim',3,11),('P012','Lou',4,8);`,
            solution: "SELECT teamName, COUNT(*) FROM Team, Player WHERE Team.teamID = Player.teamID AND goals >= 10 GROUP BY teamName;",
            ordered: false,
            must: [R`teamid\s*=\s*\w+\.?teamid|using\s*\(\s*teamid|natural join`, R`group by`, R`count\s*\(`, R`goals\s*(>=\s*10|>\s*9|between\s+10)|(10\s*<=|9\s*<)\s*(\w+\.)?goals|not\s*\(?\s*(\w+\.)?goals\s*(<\s*10|<=\s*9)`],
            mustDesc: "the join on teamID, goals at least 10, and GROUP BY",
            model: `<p>Error 1 (1): the join condition between the tables is missing, so every player is paired with every team; add <code>Team.teamID = Player.teamID</code>. Error 2 (1): <code>&gt; 10</code> leaves out players with exactly 10 goals; use <code>&gt;= 10</code>. (1) the rest of the statement still correct. &ldquo;Missing join&rdquo; on its own is too vague: say <i>which</i> join.</p><pre>SELECT teamName, COUNT(*)
FROM Team, Player
WHERE Team.teamID = Player.teamID
  AND goals &gt;= 10
GROUP BY teamName;</pre>`
          }
        ]
      },
      /* ---------------------------------------------------------------- 11 */
      {
        id: "db-11",
        style: "Scenario question · implementing a query design with AVG and GROUP BY",
        stem: `<p>A school awards merits to pupils. The tables are <code>House (houseID, houseName)</code> and <code>Pupil (pupilID, forename, houseID, yearGroup, merits)</code>. A designer has planned a query.</p>`,
        figure: figDesign,
        parts: [
          {
            label: "(a)", type: "sql", marks: 4, allowIn: true,
            q: "Write the SQL query that implements this design. [4]",
            schema: `CREATE TABLE House(houseID INTEGER PRIMARY KEY, houseName TEXT);
INSERT INTO House VALUES (1,'Arran'),(2,'Skye'),(3,'Mull'),(4,'Islay');
CREATE TABLE Pupil(pupilID TEXT PRIMARY KEY, forename TEXT, houseID INTEGER, yearGroup INTEGER, merits INTEGER);
INSERT INTO Pupil VALUES ('A01','Rory',1,1,30),('A02','Sana',1,4,22),('A03','Tom',1,5,17),('A04','Una',2,4,25),('A05','Vik',2,6,10),('A06','Wren',2,3,40),('A07','Xan',3,4,14),('A08','Yara',3,5,21),('A09','Zed',3,2,35),('A10','Abi',1,4,13),('A11','Bo',4,3,50),('A12','Cleo',2,5,20);`,
            solution: "SELECT houseName, ROUND(AVG(merits), 1) AS [Average merits] FROM House, Pupil WHERE House.houseID = Pupil.houseID AND yearGroup >= 4 GROUP BY houseName ORDER BY AVG(merits) DESC;",
            ordered: true,
            must: [R`avg\s*\(`, R`group by`, R`houseid\s*=\s*\w+\.?houseid|using\s*\(\s*houseid|natural join`, R`yeargroup\s*(>=\s*4|>\s*3|between\s+4)|yeargroup\s+in\s*\(\s*4\s*,\s*5\s*,\s*6\b|yeargroup\s+not\s+in\s*\(\s*1\s*,\s*2\s*,\s*3\s*\)|yeargroup\s*=\s*4\s+or\s+(\w+\.)?yeargroup\s*=\s*5|(4\s*<=|3\s*<)\s*(\w+\.)?yeargroup|not\s*\(?\s*(\w+\.)?yeargroup\s*(<\s*4|<=\s*3)`],
            mustDesc: "AVG, the join on houseID, the year-group test and a GROUP BY",
            model: `<p>(1) <code>ROUND(AVG(merits), 1) AS [Average merits]</code> with houseName; (1) the join <code>House.houseID = Pupil.houseID</code>; (1) <code>yearGroup &gt;= 4</code> (not <code>&gt; 4</code>, which drops S4); (1) <code>GROUP BY houseName</code> and <code>ORDER BY AVG(merits) DESC</code>. The design gives the criteria and grouping; the joins are implied by listing two tables and must be written in the WHERE clause.</p><pre>SELECT houseName, ROUND(AVG(merits), 1) AS [Average merits]
FROM House, Pupil
WHERE House.houseID = Pupil.houseID
  AND yearGroup &gt;= 4
GROUP BY houseName
ORDER BY AVG(merits) DESC;</pre>`
          },
          {
            label: "(b)", type: "mcq", marks: 1,
            q: "In an SQL query that uses both clauses, which is the correct order? [1]",
            opts: [
              "WHERE, then GROUP BY, then ORDER BY",
              "GROUP BY, then WHERE, then ORDER BY",
              "ORDER BY, then GROUP BY, then WHERE",
              "WHERE, then ORDER BY, then GROUP BY"
            ],
            a: 0,
            why: "Rows are filtered by WHERE first, then grouped, and the finished groups are sorted last: SELECT, FROM, WHERE, GROUP BY, ORDER BY."
          }
        ]
      },
      /* ---------------------------------------------------------------- 12 */
      {
        id: "db-12",
        style: "Scenario question · evaluating accuracy and fitness for purpose; testing",
        stem: `<p>The squadron database has the tables <code>Cadet (cadetID, firstname, surname)</code>, <code>Posting (cadetID, shipCode, startDate, nights, role)</code> and <code>Ship (shipCode, shipName, homePort)</code>. The training officer wants each cadet posted to a ship based at Leith, together with the name of the ship. A trainee writes:</p>
<pre>SELECT firstname, surname, shipName
FROM Cadet, Posting, Ship
WHERE Cadet.cadetID = Posting.cadetID
  AND homePort = "Leith"
ORDER BY surname;</pre>
<p>The output contains far more rows than there are postings, and cadets appear beside ships they never joined.</p>`,
        parts: [
          {
            label: "(a)", type: "text", marks: 3, rows: 4,
            q: "Explain why the output is inaccurate and state the exact change that fixes the query. [3]",
            points: [
              { desc: "Each cadet/posting is paired with every Leith ship (too many rows, wrong ships)", negOK: true, any: [R`${NB}\b(every|each|all)( the)?( leith)? (ships?|postings?|cadets?|rows?|records?)\b${G(50)}\b(paired|matched|combined|joined|linked|multipl\w+|crossed|repeated)`, R`${NB}\b(paired|matched|combined|joined|linked|multipl\w+|crossed)\b${G(30)}\b(with|to|against|by)\b${G(20)}\b(every|each|all)\b`, R`\bcartesian\b`, R`\bcross (join|product)\b`] },
              { desc: "The join between Posting and Ship is missing (named specifically)", negOK: true, any: [R`\b(no|missing|lacks?|without|forgot\w*|left out|omit\w*|absent)\b${G(40)}\b(join|link|condition|relationship|connection|match\w*)\b${G(50)}\b(posting|ship)`, R`${NB}\b(join|link|condition|relationship|connection)\b${G(50)}\b(posting|ship)\b${G(25)}\b(and|to|with)\b${G(15)}\b(ship|posting)\b${G(30)}\b(missing|absent|left out|omitted|forgotten|not (there|included|present|written|in))`, R`\b(posting|ship)\b${G(30)}\b(and|to|with)\b${G(15)}\b(ship|posting)\b${G(40)}\b(are |is |were )?(not|n.t|never)\b${G(20)}\b(joined|linked|connected|related|matched)`] },
              { desc: "Add that condition (on shipCode) to the WHERE clause with AND", negOK: true, any: [R`${NB}\b(add\w*|include\w*|put|insert\w*|need\w*|must|should|write|type)\b${G(60)}\b(posting\.?\s*shipcode\s*=\s*ship\.?\s*shipcode|ship\.?\s*shipcode\s*=\s*posting\.?\s*shipcode)`, R`${NB}\b(where|and)\s+(posting|ship)\.shipcode\s*=\s*(ship|posting)\.shipcode`, R`${NB}\b(add\w*|include\w*|need\w*)\b${G(40)}\b(join|condition|link)\b${G(30)}\b(posting|ship)\b${G(20)}\b(and|to|with)\b${G(15)}\b(ship|posting)\b${G(30)}\bshipcode`] }
            ],
            sample: "The join between Posting and Ship is missing, so every posting is paired with every ship from Leith, which gives repeated rows and extra ships. The fix is to add AND Posting.shipCode = Ship.shipCode to the WHERE clause.",
            model: `<p>(1) No condition links Posting to Ship, so each cadet's posting is paired with <b>every</b> Leith ship (rows are repeated and ships are wrong). (1) The missing join is between Posting and Ship on shipCode. (1) Fix: add <code>AND Posting.shipCode = Ship.shipCode</code> to the WHERE clause. The 2025 report: answers such as &ldquo;missing join&rdquo; or &ldquo;missing table&rdquo; were not specific enough, so name the fields.</p>`
          },
          {
            label: "(b)", type: "text", marks: 2, rows: 3,
            q: "The officer also asks for the total training cost of each posting. The tables above store only the fields listed. Explain why the database is not fit for this purpose and what change is needed. [2]",
            points: [
              { desc: "No cost/price field is stored, so cost cannot be worked out", negOK: true, not: [R`\bnot\s+no\b`, R`\b(is|are|does|do)\s+not\s+(lack|miss)`, R`\b(is|are) (fully |perfectly |entirely )?fit for purpose`, R`\bis (stored|held|recorded|kept) in\b`], any: [R`\b(no|not any|none|nothing|missing|lacks?|lacking|without|absent)\b ?${G(45)}\b(cost|price|rate|charge|fee)\w*`, R`\bnowhere\b${G(40)}\b(cost|price|rate|charge|fee)\w*`, R`\b(cost|price|rate|charge|fee)\w*\b${G(45)}\b(missing|absent|not (stored|held|recorded|included|kept|there|available|in any|in the)|isn.t (stored|held|recorded|there|included)|doesn.t exist)`, R`\b(can.t|cannot|unable to|impossible to|not possible to|no way to|isn.t possible to)\b${G(30)}\b(work out|calculate|find|get|determine|compute)\b${G(30)}\b(cost|price|charge|total)`] },
              { desc: "A cost attribute (field) must be added, e.g. to Ship or Posting", negOK: true, not: [R`\b(not|n.t|never)\s+(need|have|be\s+(added|included|created|stored))`, R`\bno\b[^.]{0,30}\b(needs?|needed|to be added|required|necessary)\b`, R`\bno need\b`, R`\b(is|are) (fully |perfectly |entirely )?fit for purpose`], all: [R`${NB}\b(add\w*|include\w*|creat\w*|new|extra|stor\w*|needs? (a|to))\b`, R`\b(field|attribute|column)\b`, R`\b(cost|price|rate|charge|fee)\b`], win: 70 }
            ],
            sample: "There is no cost field in any table, so the total cost is impossible to work out. A cost attribute, such as a daily cost, would need to be added to the Ship table.",
            model: `<p>Fitness for purpose means meeting <i>every</i> requirement. (1) Say which requirement fails and why: none of the tables holds a cost (or rate) value, so total cost cannot be calculated. (1) What is needed: add a cost attribute, for example a daily cost in Ship, which could then be multiplied by nights in a computed field. &ldquo;It is not robust&rdquo; answers the wrong question.</p>`
          },
          {
            label: "(c)", type: "text", marks: 2, rows: 3,
            q: "Describe how a tester could check that a DELETE statement removes only the rows it was meant to remove. [2]",
            points: [
              { desc: "Run a SELECT with the same WHERE clause first to see which rows match", any: [R`\b(run|write|do|use|try|perform|first|start with|check with)\b${G(40)}\b(a |the )?select\b${G(80)}\b(where (clause|condition|criteri\w+|statement)|same (where|condition|criteria|filter|rows|query))`, R`\bselect\b${G(50)}\b(rows?|records?)\b${G(40)}\b(match\w*|meet\w*|satisf\w*|affected|targeted)\b${G(40)}\b(where (clause|condition|criteri\w+)|same (where|condition|criteria))`, R`\b(same|identical)\b${G(20)}\b(where|condition|criteria|filter)\b${G(60)}\bselect\b`, R`\b(run|write|do|use|try|perform|first|start with|check with)\b${G(40)}\b(a |the )?select\b${G(80)}\bbefore\b${G(30)}\bdelet\w*`] },
              { desc: "After the DELETE, check the rows that remain (and that the right ones have gone) against the expected result", any: [R`\b(after|then|afterwards|finally|next|once|when)\b${G(60)}\b(check\w*|compar\w*|view\w*|inspect\w*|look\w*|run\w*|select\w*|display\w*|count\w*|see\w*|verify\w*|confirm\w*)\b${G(70)}\b(remain\w*|left|still (there|in|present|exist\w*)|other (rows|records)|rest of|been (removed|deleted)|untouched|unaffected|expected|has gone|have gone|no longer)`, R`\b(check\w*|compar\w*|view\w*|inspect\w*|display\w*|count\w*|verify\w*|confirm\w*)\b${G(40)}\b(the )?(rows?|records?|table|data|result|output)\b${G(30)}\b(remain\w*|left|still)\b${G(40)}\b(after|following|once)\b`, R`\b(rows|records|count|table)\b${G(30)}\bbefore and after\b`, R`\bcompar\w*\b${G(40)}\b(with|to|against)\b${G(40)}\b(expected|original|before|what)`] }
            ],
            sample: "First run a SELECT with the same WHERE clause to see which rows match. After the DELETE, check the rows remaining in the table against the expected result.",
            model: `<p>(1) Before deleting, run a SELECT with the <b>same WHERE clause</b> and look at the rows it returns: those are the rows the DELETE will remove. (1) After running the DELETE, view the table and compare the remaining rows (or the row count before and after) with the output worked out by hand in advance. Test on boundary values too.</p>`
          }
        ]
      }
    ]
  };
})();
